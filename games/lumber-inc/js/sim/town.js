// The town (D:\lumber-ref\rules\hometown.md, cited as H + section and rule):
//   supply     a sold truck also delivers its squares to build store 30 when the whole load fits (84 max, 3 trucks at a
//              time): the build truck house unloads one square per 0.1 s after the drive (H B1-B9)
//   site       construction site 88100 takes squares from an idle player's pack at 10 per second, or from builders, for
//              the lot being built (H C3-C4)
//   lots       23 lots unlock one by one in book order (PreBookId). Starting one asks for the normal build (3 exp) or
//              the advanced one (5 exp, half the squares, an ad). When the site is full, claiming pays the
//              book's RewardCoinRatio x the 5 s output of the machines and 2 spin coins, x2 with an ad (H E3-E6)
//   residents  each built house holds one resident per house level (3 levels, upgraded for an ad): a normal resident
//              adds 1.5 % to machine income, machine speed or worker speed (by book), an advanced one 3 % (H G1-G5, E9)
const STORE = { cap: 84, trucks: 3, unload: 0.1, drive: 4 };
const SITE_TICK = 0.1;
const RATIO = { MachineRevenue: 'income', MachineEfficiency: 'speed', WorkerSpeed: 'workers' };

export class Town {
  constructor(sim) {
    this.sim = sim;
    const s = sim.state;
    s.town = s.town || { lots: {}, books: [], residents: {}, houseLv: {}, spin: 0 };
    this.T = s.town;
    this.books = new Map(sim.config.HomeTownBookConf.filter(r => r.MapId === sim.mapId).map(r => [r.Id, r]));
    this.residentRows = new Map(sim.config.ResidentInfoConf.map(r => [r.Id, r]));
    this.houses = new Map(sim.config.HouseInfoConf.map(r => [r.Id, r]));
    this.lots = [...sim.world.buildings.values()].filter(b => b.kind === 'townHouse' && this.books.has(b.book))
      .sort((a, b) => a.book - b.book);
    this.trucks = []; // { left: seconds until it starts unloading, n: squares }
    this.unloadT = 0;
    this.siteT = 0;
    this.recompute();
  }

  get site() { return [...this.sim.world.buildings.values()].find(b => b.kind === 'construction') || null; }
  get store() {
    const t = [...this.sim.world.buildings.values()].find(b => b.kind === 'buildTruck');
    return t ? this.sim.world.buildings.get(t.storeId) || null : null;
  }
  get open() { const s = this.site; return !!s && this.sim.active(s.id); }
  storeKey() { const st = this.store; return st ? `${st.id}:in` : null; }

  lot(id) { return this.T.lots[id] || (this.T.lots[id] = { start: false, finish: false, adv: false, cur: 0 }); }
  unlocked(book) { return this.T.books.includes(book); }
  book(b) { return this.books.get(b.book); }
  need(b) { const r = this.book(b); return this.lot(b.id).adv ? r.NeedWoodAdv : r.NeedWood; }

  // The lot being built (first started, not finished), and the next lot that may start (book chain, H E3).
  current() { return this.lots.find(b => this.lot(b.id).start && !this.lot(b.id).finish) || null; }
  next() {
    if (!this.open || this.current()) return null;
    return this.lots.find(b => {
      const r = this.book(b);
      return !this.unlocked(b.book) && (r.PreBookId < 0 || this.unlocked(r.PreBookId)) && b.pre.every(p => this.sim.active(p));
    }) || null;
  }

  // StartBuildChoicePanel: normal (free, UnlockStarNormal exp) or advanced (ad, UnlockStarAd exp, NeedWoodAdv squares).
  startBuild(id, adv) {
    const b = this.next();
    if (!b || b.id !== id) return false;
    Object.assign(this.lot(id), { start: true, adv: !!adv, cur: 0 });
    this.sim.addExp(adv ? this.book(b).UnlockStarAd : this.book(b).UnlockStarNormal);
    // Guide step 2000003 (WareHouseItemAddCommand:30,WoodSquare,5): the first build puts 5 squares in the store.
    if (!this.T.firstSquares && this.storeKey()) { this.T.firstSquares = true; this.sim.addStock(this.storeKey(), 5); }
    this.sim.emit({ type: 'houseStart', id });
    return true;
  }

  ready() { const b = this.current(); return !!b && this.lot(b.id).cur >= this.need(b); }
  reward(rate = 1) { const b = this.current(); return b ? this.book(b).RewardCoinRatio * this.sim.extras.valuable() * rate : 0; }

  // BuildHousePanel claim: coins and spin coins (x2 for the ad), the lot becomes a house, its book unlocks.
  claim(rate = 1) {
    const b = this.current();
    if (!b || !this.ready()) return false;
    const r = this.book(b);
    this.sim.earn(this.reward(rate), 'house');
    this.T.spin += r.RewardSpinCoin * rate;
    this.lot(b.id).finish = true;
    this.T.books.push(b.book);
    this.T.houseLv[b.book] = 1;
    this.sim.emit({ type: 'houseDone', id: b.id, book: b.book });
    this.sim.emit({ type: 'status' });
    return true;
  }

  houseLv(book) { return this.T.houseLv[book] || 0; }
  residentsOf(book) { return this.T.residents[book] || []; }
  houseId(b) { const lv = Math.max(1, this.houseLv(b.book)); return +this.book(b).HouseIds.split(';')[lv - 1]; }

  // ResidentAdvPanel: slot `level` (1-3) takes the normal resident (0) or the advanced one (1, an ad). A slot can be
  // switched later; the slot must exist (house level >= level).
  setResident(book, level, adv) {
    if (!this.unlocked(book) || level < 1 || level > this.houseLv(book)) return false;
    const list = this.T.residents[book] || (this.T.residents[book] = []);
    if (level > list.length + 1) return false;
    list[level - 1] = adv ? 1 : 0;
    this.recompute();
    this.sim.emit({ type: 'resident', book, level });
    return true;
  }

  residentId(book, level) {
    const r = this.books.get(book);
    const ids = (this.residentsOf(book)[level - 1] ? r.AdvResidentId : r.NormalResidentId).split(';');
    return +ids[level - 1];
  }

  // HomeTownBookUpPanel: house level 2 and 3 for an ad, each opening one more resident slot.
  upgradeHouse(book) {
    if (!this.unlocked(book) || this.houseLv(book) >= 3) return false;
    this.T.houseLv[book]++;
    this.sim.emit({ type: 'houseUp', book });
    return true;
  }

  // ResidentMgr.OnUpdatenBuff: ratios start at 1 and add each placed resident's BuffVal to its type.
  recompute() {
    const R = { income: 1, speed: 1, workers: 1 };
    for (const book of this.T.books) {
      this.residentsOf(book).forEach((_, i) => {
        const row = this.residentRows.get(this.residentId(book, i + 1));
        if (row && RATIO[row.BuffType]) R[RATIO[row.BuffType]] += row.BuffVal;
      });
    }
    this.ratio = R;
  }

  // VehicleHouseCtrller.LetVehicleGo -> GetBuildVehicleId: the sold load also goes to the build store if it all fits.
  truckSold(n) {
    const key = this.storeKey();
    if (!key || !this.sim.active(this.store.id) || this.trucks.length >= STORE.trucks) return;
    const coming = this.trucks.reduce((a, t) => a + t.n, 0);
    if (coming + n + this.sim.stock(key) > STORE.cap) return;
    this.trucks.push({ left: STORE.drive, n });
    this.sim.emit({ type: 'buildTruck', n });
  }

  tick(dt, p, idle) {
    const sim = this.sim;
    const key = this.storeKey();
    if (this.trucks.length) {
      const t = this.trucks[0];
      if (t.left > 0) t.left -= dt;
      else {
        this.unloadT += dt;
        while (this.unloadT >= STORE.unload && t.n > 0) { this.unloadT -= STORE.unload; t.n--; sim.addStock(key, 1); }
        if (t.n <= 0) { this.trucks.shift(); this.unloadT = 0; }
      }
      for (let i = 1; i < this.trucks.length; i++) if (this.trucks[i].left > 0) this.trucks[i].left -= dt;
    }
    const site = this.site;
    const b = this.current();
    if (site && b && idle && site.buildBox && site.buildBox.contains(p, 0.3) && this.lot(b.id).cur < this.need(b) && sim.pack.has(102)) {
      this.siteT += dt;
      while (this.siteT >= SITE_TICK && this.lot(b.id).cur < this.need(b) && sim.pack.take(102)) {
        this.siteT -= SITE_TICK;
        this.addWood(b);
      }
    } else this.siteT = 0;
  }

  addWood(b) {
    this.lot(b.id).cur++;
    this.sim.emit({ type: 'houseWood', id: b.id });
  }

  // A builder (EmpBuildCtrller) hands one square to the site.
  builderAdd(pack) {
    const b = this.current();
    if (!b || this.lot(b.id).cur >= this.need(b) || !pack.take(102)) return false;
    this.addWood(b);
    return true;
  }

  needsBuilders() { const b = this.current(); return !!b && this.lot(b.id).cur < this.need(b); }
}
