// Economy / progression layer ported from Game.Progression (rules/economy.md, with File.c:line citations there).
// StatService, UpgradeService, IncomeService.Shred, EconomyService, LevelService, ProficiencyService,
// Milestones, PrestigeService perks, NumberFormat.
const f = Math.fround;
export const STAT = { MoveSpeed: 0, SprintMultiplier: 1, JumpHeight: 2, ReachDistance: 3, HandCarry: 4, HandPickupRate: 5, ThrowForce: 6,
  BagCapacity: 7, BucketPickupRate: 8, ShovelRadius: 9, ShovelItems: 10, ShovelCooldown: 11, VacuumRate: 12, VacuumRange: 13, VacuumAngle: 14,
  MagnetRadius: 15, MagnetPullRate: 16, BillValue: 19, MoneyMultiplier: 20, CritChance: 21, CritMultiplier: 22, LuckyChance: 23,
  ShredderSpeed: 24, ShredderMultiplier: 25, AutoPumpInterval: 26, DroneCount: 28, DroneRate: 29, DroneCapacity: 30, XpMultiplier: 31,
  BoostDuration: 32, BoostInterval: 33, BoostPower: 34, FlowMax: 35, OfflineHours: 36, OfflineEfficiency: 37, JetpackFuel: 38,
  JetpackThrust: 39, JetpackRefuel: 40, DroneDig: 41, DroneBattery: 42, HandGrab: 43, DepositSpeed: 44, ArmfulSize: 45, ArmfulCooldown: 46,
  ArmfulRadius: 47, HeaveRange: 48, HeaveCooldown: 49, HeaveBonus: 50, PoundScoops: 51, PoundCooldown: 52, PoundCrater: 53, TwisterRun: 54,
  TwisterCooldown: 55, TwisterTwin: 56, RallyTime: 57, RallyCooldown: 58, RallyDig: 59, FlowBuild: 60, HandBuffer: 61, HandWhiff: 62,
  HandCatch: 63, FlowHold: 64, PourSpeed: 65, PourHold: 66, DepositReach: 67, LuckyPower: 68, EventDuration: 69, ChestCash: 70,
  MilestoneBonus: 71, EventFrequency: 72, BucketScoop: 73, BucketCatch: 74, ShovelWindup: 75, ShovelReach: 76, ShovelCatch: 77,
  ShovelWhiff: 78, VacuumSpinUp: 79, VacuumIdle: 80, VacuumCatch: 81, VacuumCore: 82, BacklogBoost: 83, AutoPumpFill: 84,
  JetpackAgility: 85, JetpackSpeed: 86, AirControl: 87, JumpForgiveness: 88, RideSpeed: 89, DroneRecharge: 90, DroneTaxi: 91,
  DroneTurnaround: 92, PumpBonus: 93, DroneBonus: 94, OrbLifetime: 95, OrbReach: 96, OrbEcho: 97, OrbLuck: 98, OrbHeadStart: 99 };
export const SRC = { Hand: 0, Bucket: 1, Shovel: 2, Vacuum: 3, Magnet: 4, AutoPump: 6, Drone: 7, Offline: 8, Reward: 9, Cheat: 10, Heave: 11 };
export const BOOST = { DoubleMoney: 0, DoubleSpeed: 1, AutoCollect: 2, Flight: 3, MagnetStorm: 4, GoldenTouch: 5, BottomlessBag: 6, TimeWarp: 7, Frenzy: 8 };

const VOLUME = { 7: 'bag', 8: 'bucket', 16: 'bucket', 10: 'shovel', 12: 'vacuum', 30: 'drones', 41: 'drones' };
const safe = (x) => (Number.isNaN(x) || x < 0) ? 0 : (x > 1.79769313486232e308 ? 1.79769313486232e308 : x);
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

// ---------------- party pricing (solo = 1 player; co-op sets players) ----------------
export class Party {
  constructor(bal) { this.bal = bal; this.players = 1; }
  set(n) { this.players = clamp(n | 0, 1, 4); }
  ease(table) {
    const b = this.bal, p = this.players;
    if (b.partyReference > 0 && table && p > 1) { const i = Math.min(p, 4) - 2; if (i < table.length && f(table[i]) > 0) return f(table[i]); }
    return 1;
  }
  current() {   // PartyPricing.Current
    const b = this.bal, p = this.players;
    if (b.partyReference > 0) {
      const r = clamp(p, 1, 4) / b.partyReference;
      if (p < 2 && f(b.soloPriceScale) > 0) return f(b.soloPriceScale) * r;
      return this.ease(b.partyPriceScale) * r;
    }
    return p < 2 ? f(b.soloCostMult) : Math.pow(f(b.perExtraPlayerMult), Math.min(p, 4) - 2);
  }
  shredderMult() {
    const b = this.bal, bonus = f(b.partyShredderBonus), ref = b.partyReference, p = this.players;
    if (ref > 0) return (Math.max(0, bonus) * (ref - 1) + 1) * (clamp(p, 1, 4) / ref);
    if (bonus > 0 && p > 1) return (Math.min(p, 4) - 1) * bonus + 1;
    return 1;
  }
  xpFactor() { return this.bal.partyReference < 1 ? 1 : this.bal.partyReference / this.players; }
  volume(stat) {
    const b = this.bal;
    if (!(stat in VOLUME)) return 1;
    let t = f(b.toolVolume[VOLUME[stat]]); if (!(t > 0 && isFinite(t))) t = 1;
    let k;
    if (this.players <= 1 && b.partyReference >= 1 && f(b.soloToolVolume) > 0) k = f(b.soloToolVolume);
    else k = this.ease(b.partyToolVolume);
    return k * t;
  }
}

// ---------------- the economy state + services ----------------
export class Economy {
  constructor(data, opts = {}) {
    this.bal = data.balance; this.c = data.content; this.relicDefs = data.relics || [];
    this.party = new Party(this.bal);
    this.rand = opts.rand || Math.random;
    this.base = new Array(100).fill(0);
    for (let s = 0; s < 100; s++) { const e = this.bal.baseStats.find(x => x.stat === s); this.base[s] = e ? e.value : 0; }
    this.upById = new Map(this.c.upgrades.map(u => [u.id, u]));
    this.nodeById = new Map(this.c.nodes.map(n => [n.id, n]));
    this.colById = new Map(this.c.columns.map(c => [c.id, c]));
    this.perkById = new Map(this.c.prestigeUpgrades.map(p => [p.id, p]));
    const b = this.bal;
    this.PHASE = ((b.toolPhasePriceGrowth > 0 && isFinite(b.toolPhasePriceGrowth)) ? b.toolPhasePriceGrowth : 1) *
                 ((b.toolPhasePriceScale > 0 && isFinite(b.toolPhasePriceScale)) ? b.toolPhasePriceScale : 1);
    this.effCost = f(f(b.costMultiplier) * f(b.difficulty));
    this.effIncome = f(b.incomeMultiplier) / Math.sqrt(f(b.difficulty));
    this.xpFactorLevel = f(f(b.difficulty) / f(b.xpMultiplier));
    this.rawToolNoteXp = b.toolNoteXp > 0 ? b.toolNoteXp : 0.0019134603131109919;
    this.toolNoteXp = this.rawToolNoteXp / (f(b.toolVolume.bucket) > 0 ? f(b.toolVolume.bucket) : 1);
    this.events = [];
    this.reset();
  }
  reset() {
    this.dollars = 0; this.lifetime = 0; this.total = 0;
    this.upgrades = {}; this.ranks = {}; this.points = 0; this.perks = {}; this.goldBars = 0;
    this.level = 1; this.xp = 0;
    this.relics = new Set(); this.tellerMods = [];
    this.boosts = [];           // {kind, remaining, duration, power}
    this.worldFlags = new Set();
    this.reached = []; this.msTimer = 0;
    this.saleMultiplier = 1;
    this.eventMultiplier = 1;
    this.giltPending = [0, 0, 0, 0, 0, 0];
    this.dpsBuckets = new Array(10).fill(0); this.dpsBucket = 0; this.dpsTimer = 0; this.dps = 0;
    this.stats = { tracked: {} };
    this.recalc();
  }
  track(k, v = 1) { this.stats.tracked[k] = (this.stats.tracked[k] || 0) + v; }

  // ---- StatService.Recalculate ----
  recalc() {
    const add = new Float64Array(100), mul = new Float64Array(100).fill(1), pow = new Float64Array(100).fill(1);
    const unlocks = new Set();
    const acc = (mods, level, key) => {
      if (!(level > 0)) return;
      if (key) unlocks.add(key);
      for (const m of mods || []) {
        if (m.stat > 99) continue;
        if (m.op === 0) add[m.stat] += level * m.value;
        else if (m.op === 1) mul[m.stat] *= Math.max(0.05, 1 + level * m.value);
        else if (m.op === 2) pow[m.stat] *= Math.pow(m.value, level);
      }
    };
    for (const u of this.c.upgrades) acc(u.modifiers, this.upgrades[u.id] || 0, u.unlockKey);
    for (const n of this.c.nodes) acc(n.modifiers, this.ranks[n.id] || 0, n.unlockKey);
    for (const p of this.c.prestigeUpgrades) acc(p.modifiers, this.perks[p.id] || 0, p.unlockKey);
    for (const r of this.relicDefs) if (this.relics.has(r.id)) acc(r.modifiers, 1, null);
    acc(this.tellerMods, 1, null);
    const v = new Float64Array(100);
    for (let s = 0; s < 100; s++) v[s] = (this.base[s] + add[s]) * mul[s] * pow[s] * this.party.volume(s);
    v[24] *= this.party.shredderMult();
    // ApplyBoosts
    let speedPower = 1, frenzy = false;
    for (const b of this.boosts) {
      if (!(b.remaining > 0)) continue;
      const p = b.power > 0 ? b.power : 2.0;
      switch (b.kind) {
        case 0: v[20] *= p; break;
        case 1: speedPower = Math.max(speedPower, p); v[0] *= 1.25; break;
        case 4: v[15] *= p; v[16] *= p; break;
        case 5: v[19] *= p * 2.5; break;
        case 6: v[7] *= 3.0; break;
        case 7: v[29] *= p; v[24] *= p; v[26] *= 1 / p; break;
        case 8: frenzy = true; break;
      }
    }
    const ts = toolSpeed(speedPower, frenzy, f(this.bal.boostSpeedCap));
    if (ts !== 1) { v[5] *= ts; v[44] *= ts; v[8] *= ts; v[12] *= ts; v[16] *= ts; v[11] *= 1 / ts; }
    if (frenzy) { v[20] *= 1.5; v[15] *= 1.5; v[19] *= 1.5; v[29] *= 1.5; v[24] *= 1.5; v[26] *= 0.6666666666666666; }
    for (let s = 0; s < 100; s++) if (Number.isNaN(v[s])) v[s] = 0;
    this.v = v; this.unlocks = unlocks;
    this.speedShown = speedShown(speedPower, frenzy, f(this.bal.boostSpeedCap));
  }
  get(s) { return s < 100 ? this.v[s] : 0; }
  hasUnlock(key) { return !key || this.unlocks.has(key); }
  hasKey(key) { return this.hasUnlock(key) || this.worldFlags.has(key); }

  // ---- UpgradeService ----
  isMk2(d, L) { return d.mk2Levels >= 1 && d.maxLevel >= 1 && L >= d.maxLevel; }
  curveCost(d, L) {
    const g = f(this.bal.costGrowthScale);
    if (this.isMk2(d, L) && d.mk2BaseCost > 0) return Math.pow(d.costGrowth, (L - d.maxLevel) * g) * d.mk2BaseCost * this.effCost;
    return Math.pow(d.costGrowth, L * g) * d.baseCost * this.effCost;
  }
  phaseScale(d, L) {
    const b = this.bal;
    if (!b.toolPhaseUnlock) return L < d.handLevels ? 1 : this.PHASE;
    for (const p of b.toolPhaseExempt || []) if (p && d.id.startsWith(p)) { if (!this.isMk2(d, L)) return 1; break; }
    if (!this.hasUnlock(b.toolPhaseUnlock)) return 1;
    return this.PHASE;
  }
  costAt(d, L) { return Math.ceil(this.party.current() * this.phaseScale(d, L) * this.curveCost(d, L) * this.saleMultiplier); }
  cost(id) { const d = this.upById.get(id); return d ? this.costAt(d, this.upgrades[id] || 0) : Infinity; }
  lvl(id) { return this.upgrades[id] || 0; }
  isVisible(id) {
    const d = this.upById.get(id); if (!d) return false;
    if (d.requiresUnlock && !this.hasKey(d.requiresUnlock)) return false;
    if (d.requiresUpgrade && this.lvl(d.requiresUpgrade) < 1) return false;
    return true;
  }
  isMaxed(id) { const d = this.upById.get(id); if (!d) return true; return d.maxLevel < 1 ? false : this.lvl(id) >= d.maxLevel; }
  canBuy(id) { const d = this.upById.get(id); return !!d && this.isVisible(id) && (d.maxLevel < 1 || this.lvl(id) < d.maxLevel) && this.dollars >= this.cost(id); }
  trySpend(c) { if (!isFinite(c) || c > this.dollars) return false; if (c > 0) { this.dollars = safe(this.dollars - c); this.track('DollarsSpent', c); } return true; }
  buy(id) {
    if (!this.canBuy(id)) return false;
    if (!this.trySpend(this.cost(id))) return false;
    this.upgrades[id] = this.lvl(id) + 1; this.onBought(id, 1); return true;
  }
  buyMax(id) {
    let n = 0;
    while (n < 10000 && this.canBuy(id) && this.trySpend(this.cost(id))) { this.upgrades[id] = this.lvl(id) + 1; n++; }
    if (n > 0) this.onBought(id, n);
    return n;
  }
  onBought(id, n) { this.recalc(); this.track('UpgradesBought', n); this.events.push({ type: 'bought', id, n }); }

  // ---- EconomyService ----
  add(amount, source) {
    if (!(amount > 0)) return;
    this.dollars = safe(this.dollars + amount); this.lifetime = safe(this.lifetime + amount); this.total = safe(this.total + amount);
    if (source !== SRC.Cheat) this.track('DollarsEarned', amount);
    this.stats.tracked.MaxDollars = Math.max(this.stats.tracked.MaxDollars || 0, this.dollars);
  }

  // ---- IncomeService.Shred: notes = [t0..t5] counts, source = SRC.* ----
  face(t) { const d = this.c.denominations[t]; return d && d.billsPerItem > 0 ? d.billsPerItem : 1; }
  shred(notes, source) {
    const res = { dollars: 0, xp: 0, crit: false, lucky: false, notes: 0, bars: 0, source, giltNotes: 0 };
    let paper = 0, gold = 0, nn = 0, bars = 0, xpPaper = 0, xpGold = 0;
    for (let t = 0; t < 6; t++) {
      const n = notes[t] || 0; if (n <= 0) continue;
      const F = this.face(t);
      if (this.c.denominations[t].gold) { gold += n * F; bars += n; xpGold += (Math.log10(Math.max(1, F / 522.6134)) + 1) * n; }
      else { paper += n * F; nn += n; xpPaper += (Math.log10(Math.max(1, F)) + 1) * n; }
    }
    if (nn + bars < 1) return res;
    let gilt = 0;
    for (let t = 0; t < 6; t++) {
      if (this.c.denominations[t].gold) continue;
      const k = Math.min(this.giltPending[t], notes[t] || 0);
      if (k > 0) { this.giltPending[t] -= k; res.giltNotes += k; gilt += this.face(t) * k; }
    }
    const tnv = source === SRC.Hand ? 1 : (this.bal.toolNoteValue > 0 ? this.bal.toolNoteValue : 1);
    const pps = (source !== SRC.Hand && !this.hasUnlock('tool.bucket')) ? 0.0019134603131109919 : 1;
    const paid = (gilt + paper) * tnv * pps + gold;
    const s0 = (id, fb) => this.get(id) > 0 ? this.get(id) : fb;
    let d = s0(25, 1) * s0(19, 1) * paid * s0(20, 1) * this.effIncome * (this.eventMultiplier > 0 ? this.eventMultiplier : 1)
      * (source === SRC.Heave ? 1 + Math.max(0, this.get(50)) : 1)
      * (source === SRC.AutoPump ? s0(93, 1) : 1) * (source === SRC.Drone ? s0(94, 1) : 1);
    if (this.rand() < Math.max(0, this.get(21))) { res.crit = true; d *= Math.max(1, this.get(22) > 0 ? this.get(22) : 2); }
    if (this.rand() < Math.max(0, this.get(23))) { res.lucky = true; d *= this.get(68) > 0 ? this.get(68) : 10; }
    d = safe(d);
    res.dollars = d; res.notes = nn; res.bars = bars;
    const noteXp = source === SRC.Hand ? xpWeight(Math.max(1, this.get(4)), Math.max(1, this.get(43)), this.rawToolNoteXp) : this.toolNoteXp;
    res.xp = safe(this.party.xpFactor() * (noteXp * xpPaper + xpGold) * s0(31, 1));
    this.add(d, source);
    this.addXp(res.xp);
    if (bars > 0) { this.goldBars = safe(this.goldBars + bars); this.track('GoldBarsEarned', bars); }
    this.dpsBuckets[this.dpsBucket] += d; this.shredTotal = (this.shredTotal || 0) + d;
    this.track('BillsShredded', nn); this.track('ItemsShredded', nn);
    if (res.crit) this.track('CritCount'); if (res.lucky) this.track('LuckyCount');
    this.stats.tracked.BiggestShred = Math.max(this.stats.tracked.BiggestShred || 0, d);
    this.events.push({ type: 'shred', res });
    return res;
  }

  // ---- LevelService ----
  xpCurve(L) {
    const b = this.bal;
    if (L < 2) return b.xpBase;
    const segs = b.xpSegments;
    if (!segs || !segs.length) return b.xpBase * Math.pow(b.xpGrowth, L - 1);
    let v = b.xpBase, from = 1;
    for (;;) {
      let g = b.xpGrowth, best = -2147483648;
      for (const s of segs) if (s.growth > 0 && s.fromLevel <= from && s.fromLevel >= best) { best = s.fromLevel; g = s.growth; }
      let next = L; for (const s of segs) if (from < s.fromLevel && s.fromLevel < next) next = s.fromLevel;
      v *= Math.pow(g, next - from); from = next;
      if (L <= next) return v;
    }
  }
  xpFor(L) { return Math.max(1, this.xpCurve(L) * this.xpFactorLevel); }
  addXp(x) {
    this.xp = safe(this.xp + x);
    let n = 0;
    while (n < 1000 && this.xp >= this.xpFor(this.level)) {
      this.xp -= this.xpFor(this.level); this.level++;
      const pts = this.bal.pointsPerLevel + (this.bal.bonusPointsEvery > 0 && this.level % this.bal.bonusPointsEvery === 0 ? 1 : 0);
      this.points = Math.max(0, this.points + pts);
      this.track('LevelsGained');
      this.events.push({ type: 'level', level: this.level, points: pts });
      n++;
    }
  }

  // ---- ProficiencyService ----
  rank(id) { return this.ranks[id] || 0; }
  gate(n) { return n.requiresUnlock || (this.colById.get(n.column) || {}).requiresUnlock || null; }
  canLearn(id) {
    const n = this.nodeById.get(id); if (!n) return 'prof.reason.unknown';
    const g = this.gate(n); if (g && !this.hasUnlock(g)) return 'prof.reason.tool';
    if (this.rank(id) >= Math.max(1, n.maxRank)) return 'prof.reason.maxed';
    for (const r of n.requires || []) if (r && this.nodeById.get(r) && this.rank(r) < 1) return 'prof.reason.requires';
    if (this.points < Math.max(0, n.costPerRank)) return 'prof.reason.points';
    return true;
  }
  learn(id) {
    if (this.canLearn(id) !== true) return false;
    const n = this.nodeById.get(id);
    this.points -= Math.max(0, n.costPerRank); this.ranks[id] = this.rank(id) + 1;
    this.recalc(); this.track('NodesLearned'); this.events.push({ type: 'learned', id });
    return true;
  }

  // ---- Prestige perks (gold bars) ----
  perkCost(id, poolBars = 0) {
    const d = this.perkById.get(id); const L = this.perks[id] || 0;
    const scale = (poolBars > 0) ? this.party.players * poolBars / 60000 : 1;
    return Math.max(1, Math.ceil(Math.pow(d.costGrowth, L * f(this.bal.costGrowthScale)) * d.baseCost * scale));
  }
  buyPerk(id, poolBars) {
    const d = this.perkById.get(id); const L = this.perks[id] || 0;
    const c = this.perkCost(id, poolBars);
    if (!d || L >= d.maxLevel || c > this.goldBars) return false;
    this.goldBars = safe(this.goldBars - c); this.perks[id] = L + 1; this.recalc(); return true;
  }

  // ---- per-frame: milestones (0.25 s checks, 2.5 s spacing), boosts, dps ----
  tick(dt) {
    let boostsChanged = false;
    for (const b of this.boosts) { if (b.remaining > 0) { b.remaining -= dt; if (b.remaining <= 0) { boostsChanged = true; this.events.push({ type: 'boostEnd', kind: b.kind }); } } }
    if (boostsChanged) { this.boosts = this.boosts.filter(b => b.remaining > 0); this.recalc(); }
    this.msTimer -= dt;
    if (this.msTimer <= 0) {
      this.msTimer = 0.25;
      const m = this.c.milestones.find(m => m.dollars <= this.total && !this.isReached(m.dollars));
      if (m) {
        this.reached.push(m.dollars);
        if (m.rewardDollars > 0) this.add(f(clamp(this.get(71), 1, 2)) * m.rewardDollars, SRC.Reward);
        this.track('MilestonesReached');
        this.events.push({ type: 'milestone', m });
        this.msTimer = 2.5;
      }
    }
    this.dpsTimer += dt;
    if (this.dpsTimer >= 0.5) {
      this.dpsTimer -= 0.5; if (this.dpsTimer > 0.5) this.dpsTimer = 0;
      this.dps = this.dpsBuckets.reduce((a, b) => a + b, 0) / 5;
      this.stats.tracked.BestDollarsPerSecond = Math.max(this.stats.tracked.BestDollarsPerSecond || 0, this.dps);
      this.dpsBucket = (this.dpsBucket + 1) % 10; this.dpsBuckets[this.dpsBucket] = 0;
    }
  }
  isReached(d) { return this.reached.some(r => Math.abs(r - d) <= Math.abs(d) * 1e-9); }
  startBoost(kind, duration, power) {
    const ex = this.boosts.find(b => b.kind === kind);
    if (ex) { ex.remaining = Math.max(ex.remaining, duration); ex.duration = duration; ex.power = power; }
    else this.boosts.push({ kind, remaining: duration, duration, power });
    this.recalc(); this.events.push({ type: 'boost', kind, duration, power });
  }

  save() {
    return { d: this.dollars, l: this.lifetime, t: this.total, u: this.upgrades, r: this.ranks, p: this.points, k: this.perks, g: this.goldBars,
      lv: this.level, xp: this.xp, rel: [...this.relics], wf: [...this.worldFlags], ms: this.reached, st: this.stats.tracked, gp: this.giltPending };
  }
  load(s) {
    this.reset();
    if (!s) return;
    this.dollars = s.d || 0; this.lifetime = s.l || 0; this.total = s.t || 0; this.upgrades = s.u || {}; this.ranks = s.r || {};
    this.points = s.p || 0; this.perks = s.k || {}; this.goldBars = s.g || 0; this.level = s.lv || 1; this.xp = s.xp || 0;
    this.relics = new Set(s.rel || []); this.worldFlags = new Set(s.wf || []); this.reached = s.ms || []; this.stats.tracked = s.st || {};
    this.giltPending = s.gp || [0, 0, 0, 0, 0, 0];
    this.recalc();
  }
}

function toolSpeed(sp, frenzy, cap) { sp = sp <= 1 ? 1 : sp; if (frenzy) sp *= 1.5; if (cap > 0 && cap < sp) return Math.max(1, cap); return sp; }
function speedShown(sp, frenzy, cap) { sp = sp <= 1 ? 1 : sp; if (frenzy) sp *= 1.5; if (cap > 0 && cap < sp) sp = Math.max(1, cap); return frenzy ? Math.max(1, sp / 1.5) : sp; }
function bankersRound(x) { const r = Math.round(x); return (Math.abs(x % 1) === 0.5 && r % 2 !== 0) ? r - 1 : r; }
function whole(x) { return x < 1 ? 1 : bankersRound(Math.min(x, 1e15)); }
export function xpWeight(carry, grab, tnx) {
  let a = whole(carry); const b = whole(grab); const tot = a * b;
  if (b > 0) a = Math.ceil(a / b);
  return a < tot ? ((tot - a) * tnx + a) / tot : 1.0;
}

// ---------------- NumberFormat ----------------
const SUFFIX = ['', 'k', 'm', 'b', 't', 'qa', 'qi', 'sx', 'sp', 'oc', 'no', 'dc', 'udc', 'ddc', 'tdc', 'qadc', 'qidc', 'sxdc', 'spdc', 'ocdc', 'nodc', 'vg'];
function fmtDec(x, maxDec, minDec = 0) {
  const p = Math.pow(10, maxDec);
  let r = Math.sign(x) * Math.round(Math.abs(x) * p) / p;
  let s = r.toFixed(maxDec);
  if (maxDec > minDec) { s = s.replace(/0+$/, ''); const dot = s.indexOf('.'); if (dot >= 0 && s.length - dot - 1 < minDec) s = s + '0'.repeat(minDec - (s.length - dot - 1)); s = s.replace(/\.$/, ''); }
  return s;
}
function group(n) { const s = Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (n < 0 ? '-' : '') + s; }
export const Num = {
  short(v) {
    if (Number.isNaN(v)) return '0';
    if (!isFinite(v)) return v > 0 ? '∞' : '-∞';
    const a = Math.abs(v);
    if (a > 0 && a < 0.095) return fmtDec(v, clamp(Math.ceil(-Math.log10(a)) - 1, 0, 5) + 2);
    if (a < 1e6) {
      if (a < 100 && a !== Math.floor(a)) return fmtDec(v, 2);
      return group(Math.trunc(v));
    }
    const e = Math.floor(Math.log10(a) / 3);
    if (e >= 22) {
      let ex = Math.floor(Math.log10(a)), m = a / Math.pow(10, ex);
      if (m >= 10) { ex++; m /= 10; } else if (m < 1) { ex--; m *= 10; }
      m = Math.floor(m * 100 + 1e-9) / 100;
      return (v < 0 ? '-' : '') + m.toFixed(2) + 'e' + ex;
    }
    const m = Math.floor(a / Math.pow(1000, e) * 100 + 1e-9) / 100;
    return (v < 0 ? '-' : '') + m.toFixed(2) + SUFFIX[e];
  },
  money(v) { return '$' + Num.short(v); },
  full(v) { if (Number.isNaN(v)) return '0'; return Math.abs(v) < 1e15 ? group(Math.floor(v)) : Num.short(v); },
  dotted(v) { return Num.full(v).replace(/,/g, '.'); },
  percent(fr) { const p = fr * 100; const a = Math.abs(p); return (a === 0 || a >= 0.95 ? fmtDec(p, 1) : fmtDec(p, clamp(Math.ceil(-Math.log10(a)) - 1, 0, 5) + 2)) + '%'; },
  time(s) {
    if (!(s > 0)) s = 0; if (s > 1e11) return '∞';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    if (h >= 1) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m >= 1) return `${m}m ${String(sec).padStart(2, '0')}s`;
    return s >= 10 ? `${Math.floor(s)}s` : `${s.toFixed(1)}s`;
  },
};
