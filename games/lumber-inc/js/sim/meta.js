// Meta systems shared by every map (D:\lumber-ref\rules\meta.md): spin coins, character and bike skins with pieces, the
// gacha machine, the 8-day sign-in, daily tasks, achievements, the closed-app offline reward and the ad boxes that drop
// on the map. Its state `M` lives in the global save next to the gems, not in a map's save. Ads are instant in the hub,
// so an "ad" here is a tap that counts as a watched ad (tasks 201/206, achievement 110).
//
// Day boundaries use the local calendar day of `now()` (overridable for tests). Gameplay counters come from sim events.

const SPIN_FREE = 5; // free (ad) gacha draws per day (G 27)
const OFFLINE = { min: 300, capMin: 180 }; // H 31
const BUFF_SEC = 180; // ad box buffs (I 34)
const BOX_GEMS = 20;
const BOX_REACH = 1.6;
// GameDropAdConf / GameDropAdGroupConf (I 34-35); not in config.json, copied from the CFG tables.
const BOX_GROUPS = { 1: { cd: 30, daily: 25 }, 2: { cd: 30, daily: 10 }, 3: { cd: 45, daily: 5 }, 4: { cd: 60, daily: 20 } };
const BOXES = [
  { id: 1, group: 1, weight: 80, prefab: 'Pre_AdBox1', life: 60, val: 80, kind: 'coin', pos: { x: 31.22, z: -17.54 }, lv: 0 },
  { id: 2, group: 2, weight: 80, prefab: 'Pre_AdBox2', life: 60, val: 1.5, kind: 'speed', pos: { x: 29.36, z: -4.77 }, lv: 0 },
  { id: 3, group: 2, weight: 80, prefab: 'Pre_AdBox3', life: 60, val: 5, kind: 'bag', pos: { x: 29.36, z: -4.77 }, lv: 0 },
  { id: 4, group: 2, weight: 80, prefab: 'Pre_AdBox4', life: 60, val: 2, kind: 'damage', pos: { x: 29.36, z: -4.77 }, lv: 0 },
  { id: 5, group: 3, weight: 80, prefab: 'Pre_AdBox5', life: 60, val: 2, kind: 'income', pos: { x: 34.29, z: -1 }, lv: 0 },
  { id: 6, group: 4, weight: 80, prefab: 'Pre_AdBox6', life: 80, val: 6, kind: 'gas', pos: { x: 16.04, z: -2.42 }, lv: 4 },
];
const SHOP = {
  coin: [{ min: 10, gems: 30 }, { min: 30, gems: 80 }, { min: 60, gems: 150 }],
  spin: [{ n: 1, gems: 20 }, { n: 5, gems: 90 }, { n: 10, gems: 160 }],
  freeGems: 200,
};
const ITEM = { coin: 1, gem: 2, spin: 7, skin: 6, bike: 8 };
const handler = h => h.replace('AbstractTaskHandler_', '');
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export class Meta {
  constructor(sim, saved, now = () => Date.now()) {
    this.sim = sim;
    this.now = now;
    const c = sim.config;
    this.skinRows = new Map(c.SkinConf.map(r => [r.Id, r]));
    this.bikeRows = new Map(c.SkinBikeConf.map(r => [r.Id, r]));
    this.daily = c.DailyTaskConf;
    this.achieve = [...c.AchievementConf].sort((a, b) => a.Order - b.Order);
    const m = saved || {};
    this.M = {
      spin: m.spin || 0, day: m.day || '', loginDay: m.loginDay || 0, sign: m.sign || [],
      skins: m.skins || { 0: { pieces: 0, ready: true, unlock: true } }, bikes: m.bikes || {}, skin: m.skin || 0, bike: m.bike ?? -1,
      today: m.today || {}, count: m.count || {}, step: m.step || {}, lastSeen: m.lastSeen || 0,
    };
    this.boxes = {}; // group -> { at: next spawn time (s), box: {row, until} }
    this.buffs = {}; // kind -> seconds left (speed, bag, damage, income)
    this.gemsSeen = sim.state.gems;
    this.rollDay();
  }

  save() { return { ...this.M, lastSeen: this.now() }; }

  // ---- day and login
  rollDay() {
    const k = dayKey(this.now());
    if (k === this.M.day) return false;
    this.M.day = k;
    this.M.loginDay++;
    this.M.today = { count: {}, claimed: {}, spinAd: 0, drop: {} };
    return true;
  }

  // ---- currencies and counters
  addSpin(n) { this.M.spin += n; this.sim.emit({ type: 'spin', n }); }
  bump(name, n = 1) {
    const T = this.M.today.count;
    T[name] = (T[name] || 0) + n;
    this.M.count[name] = (this.M.count[name] || 0) + n;
  }
  ad() { this.bump('WatchAdTotal'); }

  // Achievement counters that mirror the current map's state rather than events.
  stateCount(name) {
    const s = this.sim, S = s.state;
    const sum = o => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
    switch (name) {
      case 'UnlockEmpTotal': return sum(S.hired);
      case 'UngradeEmpTotal': return sum(S.empLv);
      case 'UnlockFactoryTotal': return [...s.world.buildings.values()].filter(b => b.kind === 'factory' && s.active(b.id)).length;
      case 'UpgradeBuildingStar': return sum(S.stars);
      case 'UpgradePlayerAttrTotal': return sum(S.up);
      case 'BuildHouse': return Object.values(s.town.T.lots).filter(l => l.finish).length;
      case 'LoginDay': return this.M.loginDay;
      default: return this.M.count[name] || 0;
    }
  }

  // ---- daily tasks (F 24)
  taskProgress(row) {
    const n = this.M.today.count[handler(row.Handler)] || 0;
    return Math.min(n, row.Target);
  }
  taskDone(row) { return this.taskProgress(row) >= row.Target; }
  taskClaimed(row) { return !!this.M.today.claimed[row.Id]; }
  taskReward(row, rate = 1) {
    const base = row.RewardType === ITEM.gem ? row.RewardNum : row.RewardNum * this.sim.extras.valuable();
    return base * rate;
  }
  claimTask(id, ad) {
    const row = this.daily.find(r => r.Id === id);
    if (!row || !this.taskDone(row) || this.taskClaimed(row)) return false;
    if (ad) this.ad();
    const n = this.taskReward(row, ad ? row.RewardRatio : 1);
    if (row.RewardType === ITEM.gem) this.sim.state.gems += n; else this.sim.earn(n, 'task');
    this.M.today.claimed[id] = true;
    if (handler(row.Handler) !== 'CompleteDailyTask') this.bump('CompleteDailyTask');
    this.sim.emit({ type: 'dailyClaim', id, n, gem: row.RewardType === ITEM.gem });
    return true;
  }
  tasksReady() { return this.daily.filter(r => this.taskDone(r) && !this.taskClaimed(r)).length; }

  // ---- achievements (F 25): one stage at a time, gems each.
  stage(row) {
    const targets = `${row.Target}`.split('|').map(Number), gems = `${row.RewardNum}`.split('|').map(Number);
    const i = this.M.step[row.Id] || 0;
    return { i, last: targets.length, target: targets[Math.min(i, targets.length - 1)], gems: gems[Math.min(i, gems.length - 1)], done: i >= targets.length };
  }
  achieveCount(row) { return this.stateCount(handler(row.Handler)); }
  achieveReady(row) { const st = this.stage(row); return !st.done && this.achieveCount(row) >= st.target; }
  claimAchieve(id) {
    const row = this.achieve.find(r => r.Id === id);
    if (!row || !this.achieveReady(row)) return false;
    const st = this.stage(row);
    this.sim.state.gems += st.gems;
    this.M.step[id] = st.i + 1;
    this.sim.emit({ type: 'achieve', id, gems: st.gems });
    return true;
  }
  achievesReady() { return this.achieve.filter(r => this.achieveReady(r)).length; }

  // ---- sign-in (F 26): day idx is claimable once the player has logged in on more than idx days.
  signRow(idx) {
    const r = this.sim.config.SignConf[idx % 8];
    return idx < 8 ? { type: r.ItemType, num: r.RewardNum, icon: r.Icon } : { type: r.ItemTypeLoop, num: r.RewardNumLoop, icon: r.IconLoop };
  }
  canSign(idx) { return !this.M.sign.includes(idx) && idx < this.M.loginDay && idx === this.M.sign.length; }
  sign(idx) {
    if (!this.canSign(idx)) return false;
    const r = this.signRow(idx);
    this.give(r.type, r.num);
    this.M.sign.push(idx);
    this.sim.emit({ type: 'sign', idx });
    return true;
  }
  signReady() { return this.canSign(this.M.sign.length); }

  give(type, num) {
    if (type === ITEM.gem) this.sim.state.gems += num;
    else if (type === ITEM.spin) this.addSpin(num);
    else if (type === ITEM.coin) this.sim.earn(num * this.sim.extras.valuable(), 'reward');
    else if (type === ITEM.skin) this.skin(num).ready = true; // SignPanelItem: the skin becomes unlockable
  }

  // ---- skins (D 17-21)
  skin(id, bike = false) {
    const all = bike ? this.M.bikes : this.M.skins;
    return all[id] || (all[id] = { pieces: 0, ready: false, unlock: false });
  }
  rows(bike) { return [...(bike ? this.bikeRows : this.skinRows).values()]; }
  need(id, bike) { return (bike ? this.bikeRows : this.skinRows).get(id).UnlockPara; }
  addPieces(id, n, bike) {
    const s = this.skin(id, bike);
    s.pieces += n;
    if (s.pieces >= this.need(id, bike) && this.need(id, bike) > 0) s.ready = true;
  }
  canUnlock(id, bike) { const s = this.skin(id, bike); return s.ready && !s.unlock; }
  unlock(id, bike) {
    if (!this.canUnlock(id, bike)) return false;
    Object.assign(this.skin(id, bike), { unlock: true, isNew: true });
    this.sim.emit({ type: 'skinUnlock', id, bike: !!bike });
    return true;
  }
  wear(id, bike) {
    if (!this.skin(id, bike).unlock) return false;
    if (bike) this.M.bike = id; else this.M.skin = id;
    this.sim.emit({ type: 'skinWear', id, bike: !!bike });
    return true;
  }
  skinsReady() { return [false, true].reduce((n, bike) => n + this.rows(bike).filter(r => this.canUnlock(r.Id, bike)).length, 0); }

  // SkinMgr.UpdateBuffVal: Dmg, Spd and BackPack of every unlocked character skin add up.
  skinBuff() {
    const out = { Dmg: 0, Spd: 0, BackPack: 0 };
    for (const r of this.skinRows.values()) {
      if (!this.skin(r.Id).unlock || !r.BuffType) continue;
      const va = `${r.BuffVal}`.split(';');
      `${r.BuffType}`.split(';').forEach((k, i) => { if (k in out) out[k] += +va[i] || 0; });
    }
    return out;
  }

  // ---- gacha (G 27-29)
  spinAdLeft() { return Math.max(0, SPIN_FREE - (this.M.today.spinAd || 0)); }
  canDraw(ad) { return ad ? this.spinAdLeft() > 0 : this.M.spin >= 1; }
  draw(ad, rand = Math.random) {
    if (!this.canDraw(ad)) return null;
    const pool = this.sim.config.SpinRewardConf.filter(r =>
      (r.RewardType === ITEM.skin && !this.skin(r.RewardPara).unlock) || (r.RewardType === ITEM.bike && !this.skin(r.RewardPara, true).unlock));
    if (!pool.length) return null;
    if (ad) { this.M.today.spinAd = (this.M.today.spinAd || 0) + 1; this.ad(); } else this.M.spin -= 1;
    let w = rand() * pool.reduce((a, r) => a + r.Weight, 0);
    const row = pool.find(r => (w -= r.Weight) < 0) || pool[pool.length - 1];
    return { row, bike: row.RewardType === ITEM.bike, id: row.RewardPara, n: row.RewardAmound, claimed: false };
  }
  // SkinRewardPanel: x1, or x3 for an ad.
  claimDraw(prize, ad) {
    if (!prize || prize.claimed) return false;
    if (ad) this.ad();
    prize.claimed = true;
    this.addPieces(prize.id, prize.n * (ad ? 3 : 1), prize.bike);
    this.sim.emit({ type: 'pieces', id: prize.id, bike: prize.bike });
    return true;
  }

  // ---- offline reward (H 31-32): minutes away (cap 180) x the map's per-minute income.
  perMinute() {
    const row = this.sim.levels[this.sim.state.level - 1];
    return this.sim.extras.valuable() * 12 * (row && row.AdCoinRatio ? row.AdCoinRatio : 1);
  }
  offline(lastPlay) {
    if (!lastPlay) return null;
    const away = (this.now() - lastPlay) / 1000;
    if (away < OFFLINE.min) return null;
    const min = Math.min(Math.floor(away / 60), OFFLINE.capMin);
    return { min, coins: Math.round(min * this.perMinute()) };
  }
  claimOffline(r, ad) {
    if (!r || r.claimed) return false;
    if (ad) this.ad();
    r.claimed = true;
    this.sim.earn(r.coins * (ad ? 2 : 1), 'offline');
    return true;
  }

  // ---- ad boxes (I 34-35)
  boxesOn() { return !this.sim.guide.guides.length || this.sim.guide.done.has(7); }
  dropLeft(g) { return BOX_GROUPS[g].daily - (this.M.today.drop[g] || 0); }
  liveBoxes() { return Object.values(this.boxes).filter(b => b.box).map(b => b.box); }
  tickBoxes(dt) {
    if (!this.boxesOn()) return;
    const t = this.sim.state.t, p = this.sim.state.player;
    for (const g of Object.keys(BOX_GROUPS)) {
      const h = this.boxes[g] || (this.boxes[g] = { at: t + BOX_GROUPS[g].cd, box: null });
      if (h.box) {
        if (h.box.until <= t) { this.sim.emit({ type: 'boxGone', group: +g }); h.box = null; h.at = t + BOX_GROUPS[g].cd; continue; }
        const near = Math.hypot(p.x - h.box.row.pos.x, p.z - h.box.row.pos.z) < BOX_REACH;
        if (near && !h.box.shown) { h.box.shown = true; this.sim.emit({ type: 'boxTouch', group: +g, id: h.box.row.id }); }
        if (!near) h.box.shown = false;
        continue;
      }
      if (t < h.at || this.dropLeft(g) <= 0) continue;
      const pool = BOXES.filter(b => b.group === +g && b.lv <= this.sim.state.level && !(b.kind === 'income' && this.buffs.income > 0));
      if (!pool.length) { h.at = t + BOX_GROUPS[g].cd; continue; }
      let w = Math.random() * pool.reduce((a, b) => a + b.weight, 0);
      const row = pool.find(b => (w -= b.weight) < 0) || pool[0];
      h.box = { row, until: t + row.life, shown: false };
      this.sim.emit({ type: 'boxSpawn', group: +g, id: row.id });
    }
  }
  boxReward(row) { return row.kind === 'coin' ? row.val * this.sim.extras.valuable() : row.val; }
  // AdBox*Panel: an ad or 20 gems.
  claimBox(group, gems) {
    const h = this.boxes[group];
    if (!h || !h.box) return false;
    if (gems) { if (this.sim.state.gems < BOX_GEMS) return false; this.sim.state.gems -= BOX_GEMS; } else this.ad();
    const row = h.box.row;
    if (row.kind === 'coin') this.sim.earn(this.boxReward(row), 'box');
    else if (row.kind === 'gas') this.sim.extras.addGas(row.val);
    else this.buffs[row.kind] = BUFF_SEC;
    this.M.today.drop[group] = (this.M.today.drop[group] || 0) + 1;
    h.box = null;
    h.at = this.sim.state.t + BOX_GROUPS[group].cd;
    this.sim.emit({ type: 'boxClaim', group, id: row.id });
    return true;
  }

  // ---- shop (C 13-16). The real-money products have no payment here: the 200-gem pack is free once a day, the
  // others and the gift bags are not offered. Gem prices of the exchanges live in the unextracted IapItemSO, so these
  // are [ĐỀ XUẤT] values: coin packs pay 10/30/60 minutes of the map's income, spin coin packs 1/5/10 coins.
  shopCoin(i) { const r = SHOP.coin[i]; return { gems: r.gems, coins: Math.round(r.min * this.perMinute()), min: r.min }; }
  buyCoin(i) {
    const r = this.shopCoin(i);
    if (this.sim.state.gems < r.gems) return false;
    this.sim.state.gems -= r.gems;
    this.sim.earn(r.coins, 'shop');
    return true;
  }
  buySpin(i) {
    const r = SHOP.spin[i];
    if (this.sim.state.gems < r.gems) return false;
    this.sim.state.gems -= r.gems;
    this.addSpin(r.n);
    return true;
  }
  freeGemsLeft() { return !this.M.today.freeGems; }
  takeFreeGems() {
    if (!this.freeGemsLeft()) return false;
    this.M.today.freeGems = true;
    this.sim.state.gems += SHOP.freeGems;
    this.sim.emit({ type: 'shopGems', n: SHOP.freeGems });
    return true;
  }

  // ---- what the player's stats read
  speedMul() { return this.buffs.speed > 0 ? 1.5 : 1; }
  dmgMul() { return this.buffs.damage > 0 ? 2 : 1; }
  incomeMul() { return this.buffs.income > 0 ? 2 : 1; }
  packAdd() { return (this.buffs.bag > 0 ? 5 : 0) + this.skinBuff().BackPack; }

  // Every sim event passes here as it is emitted, from a tick or from a panel button between ticks.
  on(e) {
    if (e.type === 'treeFall') this.bump('CutTreeTotal');
    else if (e.type === 'orderClaim') this.bump('FinishOrderTotal');
    else if (e.type === 'special') this.bump('OnHireSpecialWorker');
    else if (e.type === 'ad') this.ad();
  }

  tick(dt) {
    if ((this.sim.state.t | 0) % 5 === 0) this.rollDay();
    const g = this.sim.state.gems;
    if (g > this.gemsSeen) this.bump('GetGemTotal', g - this.gemsSeen);
    else if (g < this.gemsSeen) this.bump('UseGemTotal', this.gemsSeen - g);
    this.gemsSeen = g;
    for (const k of Object.keys(this.buffs)) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
    this.tickBoxes(dt);
  }
}

export { BOXES, BOX_GEMS, BUFF_SEC, SHOP, ITEM };
