// The player-side loop (rules/loop.md): hand, bag, bucket, shovel, vacuum, pour stream, shredder queue,
// drones, auto-pump, flow; plus vault level/stairs checks. Pure JS, deterministic given an rng; runs in node.
import { Economy, SRC, STAT as S } from './economy.js';
import { MoneyField, T, NX, CELL, OX, OZ } from './pile.js';
import { Boosts } from './boosts.js';
import { Abilities } from './abilities.js';
import { Finds } from './finds.js';
import { VaultEvents } from './events.js';
import { Intro, STEPS as INTRO_STEPS, INTRO_TUNE } from './intro.js';
import { Finale } from './finale.js';
import { FunHost, FUN } from './fun.js';

export const TOOL = { Hand: 0, Bucket: 1, Shovel: 2, Vacuum: 3 };
const TOOL_KEYS = ['', 'tool.bucket', 'tool.shovel', 'tool.vacuum'];
const F = 522.6134;                         // NoteMath.F: notes per visual item
const TS = {                                // ToolService scene values (mb)
  flowWindow: 0.8, flowBuildSeconds: 6, flowDecaySeconds: 2, handIntervalStart: 0.13, handIntervalEnd: 0.05,
  bagIntervalStart: 0.085, bagIntervalEnd: 0.022, accelSeconds: 1.1, holdBoost: 1.8, handPourPieces: 50, bagStreamMaxSeconds: 2.4, swapDuration: 0.25,
};
const SHRED = { interactRadius: 3.5, batchInterval: 0.07, suckTime: 0.42, fallbackSpeed: 5, queueForFullBoost: 40, directRadius: 2.6 };
const BUCKET = { takeRadius: 0.45 };
const SHOVEL = { windUpTime: 0.11, thrustTime: 0.075, swingNominal: 0.8, whiffCooldown: 0.3 };
const VAC = { spinUp: 5, spinDown: 2.5 };
const DRONE = { cruiseSpeed: 9, takeInterval: 0.2, takeRadius: 0.9, digHeight: 1.4, rechargeTime: 8, depositAt: 0.35, dumpTime: 1.1, lobbySpeed: 6, playerExclusion: 6 };
const RET = { range: 7, aimRadius: 0.504, teleportDelay: 0.22, cooldown: 0.8 };   // ReturnButtons (mb: range 7, aimRadius 0.504, teleportDelay 0.22, cooldown 0.8)
const RETURN_CAPS = [[-4,5.08,-71.566],[0,-7.12,-66.416],[-7.5,-15.12,-59.416],[0,-24.12,-52.416],[-7.5,-34.12,-45.916]];
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const whole = (x) => x < 1 ? 1 : Math.round(Math.min(x, 1e15));
const tallyTotal = (t) => t[0] + t[1] + t[2] + t[3] + t[4] + t[5];
// co-op (rules/coop.md): per-player state. The host's own seat lives in the Game fields; a guest seat is swapped into
// those fields while its input is stepped (Net.Actor = player in the original), so every tool rule runs unchanged.
const SEAT_KEYS = ['tool', 'swap', 'hand', 'handCooldown', 'bag', 'flow', 'lastCollect', 'stream', 'bucketAcc', 'shovel', 'vac', 'pump', 'player', 'ret', 'aim', '_fullCd'];
const FIND_KEYS = ['carry', 'heldFor', 'thrownNow'];
const ABIL_KEYS = ['cdReady', 'cdTotal', 'wind', 'overloadUntil', 'overloadRate'];
// events that belong to the player who raised them (co-op tags them with who; the rest are the world's, for everyone)
export const SEAT_EVENTS = new Set(['take', 'whiff', 'swing', 'dig', 'handsFull', 'bagFull', 'pourStart', 'pourPiece', 'pourEnd', 'tool', 'returnPress', 'teleport',
  'abilityWind', 'ability', 'abilityRefused', 'heave', 'pound', 'carryPick', 'carryDrop', 'carryThrow', 'keyPickup', 'doorLocked', 'doorBegin', 'orbPickup', 'pump', 'toastKey', 'giltFound']);
export const PARTY_HOLD = 45;              // C/PartyHold.c: a smaller party takes effect after 45 s
export const MAX_PLAYERS = 4;
function freshSeat(spawn) {
  return { tool: 0, swap: 0, hand: [0, 0, 0, 0, 0, 0], handCooldown: 0, bag: [0, 0, 0, 0, 0, 0], flow: 0, lastCollect: -100, stream: null, bucketAcc: 0,
    shovel: { phase: 0, t: 0, cooldown: 0 }, vac: { spin: 0, acc: 0 }, pump: { charge: 0, time: 0 }, player: { pos: spawn.slice(), yaw: 0, pitch: 0 },
    ret: { aimed: -1, at: -1, ready: 0 }, aim: null, _fullCd: 0,
    finds: { carry: null, heldFor: 0, thrownNow: false }, abil: { cdReady: {}, cdTotal: {}, wind: null, overloadUntil: 0, overloadRate: 1 } };
}

export class Game {
  constructor(data, vaultInitial, opts = {}) {
    this.data = data;
    this.rand = opts.rand || Math.random;
    this.econ = new Economy(data, { rand: this.rand });
    this.weights = data.content.denominations.map(d => d.weight);
    this.field = new MoneyField(vaultInitial, { footprint: opts.footprint || [] });
    this.markers = opts.markers || {
      shredderInteract: [7.1685, 4.0, 7.2], shredderIntake: [7.8179, 5.524, 7.2], spawn: [0, 3.05, 2],
      pads: [[-10.75, 8.7, 13.15], [-10.75, 8.7, 11.65], [-10.75, 8.7, 10.15], [-10.75, 8.7, 8.65], [-10.75, 8.7, 7.15], [-10.75, 8.7, 5.65], [-10.75, 8.7, 4.15], [-10.75, 8.7, 2.65],
        [-9.4, 8.7, 13.15], [-9.4, 8.7, 11.65], [-9.4, 8.7, 10.15], [-9.4, 8.7, 8.65], [-9.4, 8.7, 7.15], [-9.4, 8.7, 5.65], [-9.4, 8.7, 4.15], [-9.4, 8.7, 2.65]],
      // VaultBig/ReturnButtons/ReturnButton_0..4/Model/Cap (scene.json, three coords)
      returnButtons: RETURN_CAPS,
    };
    if (!this.markers.returnButtons) this.markers.returnButtons = RETURN_CAPS;
    // GoldTeller/Body/Model and LobbyBoards/RelicBoard/Model (hall scene.json, three coords)
    if (!this.markers.teller) this.markers.teller = [-11.98, 3.0, 4.85];
    if (!this.markers.relicBoard) this.markers.relicBoard = [-11.996, 3.5, 11.62];
    this.ret = { aimed: -1, at: -1, ready: 0 };
    this.events = [];
    this.boosts = new Boosts(this);
    this.abilities = new Abilities(this);
    this.finds = new Finds(this);
    this.vaultEvents = new VaultEvents(this);
    this.intro = new Intro();
    this.finale = new Finale(this);
    this.fun = new FunHost(this);
    this.has = { boosts: true, chests: true };      // systems present in this build (intro skips steps for absent ones)
    this.guests = new Map();     // co-op guest seats by player id (1..3); the host is id 0 in this.* fields
    this.who = 0;                // the seat being stepped (events it raises carry who in co-op)
    this.partyLowT = 0;
    this.client = false;         // a co-op guest's mirror: state comes from the host, step() only moves the local player
    this.newGame();
  }

  newGame() {
    this.econ.reset();
    this.field.resetToLevel(1);
    this.time = 0; this.played = 0;
    this.tool = TOOL.Hand; this.swap = 0;
    this.hand = [0, 0, 0, 0, 0, 0]; this.handCooldown = 0;
    this.bag = [0, 0, 0, 0, 0, 0];
    this.flow = 0; this.lastCollect = -100;
    this.stream = null;
    this.queue = []; this.queued = 0; this.budget = 1; this.batchTimer = 0; this.shredSpeed = SHRED.fallbackSpeed * F; this.pollTimer = 0;
    this.bucketAcc = 0; this.shovel = { phase: 0, t: 0, cooldown: 0 }; this.vac = { spin: 0, acc: 0 };
    this.drones = []; this.droneTimer = 0;
    this.pump = { charge: 0, time: 0 };
    this.stairsTimer = 0;
    this.player = { pos: this.markers.spawn.slice(), yaw: 0, pitch: 0 };
    this.taken = 0;     // vault notes removed (for the counter)
    this._st = this.st();
    if (this.boosts) this.boosts.reset();
    if (this.abilities) this.abilities.reset();
    if (this.intro) this.intro.newGame(!!this.basicsSeen);
    this.flags = new Set();
    this.delivered = 0;
    if (this.finds) this.finds.reset((this.rand() * 2 ** 31) >>> 0 || 1);
    if (this.vaultEvents) this.vaultEvents.reset();
    if (this.finale) this.finale.reset();
    if (this.fun) this.fun.reset();
    for (const s of this.guests.values()) this.resetSeat(s);
  }

  // ---- co-op seats (host side) ----
  addGuest(id, name, slot) {
    const s = { id, name, slot, ...freshSeat(this.markers.spawn), input: null, presses: {}, tick: 0, wantTool: 0 };
    this.guests.set(id, s);
    this.stepParty(0);
    return s;
  }
  resetSeat(s) { Object.assign(s, freshSeat(this.markers.spawn)); s.presses = {}; }
  // a leaving guest's carry goes back to the pile owner: hand and bag are shredded into the shared wallet (AutoShred)
  removeGuest(id) {
    const s = this.guests.get(id); if (!s) return null;
    const load = [0, 0, 0, 0, 0, 0]; for (let t = 0; t < 6; t++) load[t] = (s.hand[t] || 0) + (s.bag[t] || 0);
    if (s.finds.carry) { const it = s.finds.carry; it.state = 'loose'; it.by = 0; it.pos = s.player.pos.slice(); it.pos[1] += 1; it.vy = 0; }
    this.guests.delete(id);
    if (tallyTotal(load) > 0) { this.enqueue(load, this.markers.shredderIntake, SRC.AutoPump, 0); this.events.push({ type: 'bagShredded', who: id, name: s.name, n: tallyTotal(load) }); }
    return s;
  }
  // PartyHold: N rises at once, a drop waits 45 s; the wallet is rescaled by Nnew/Nold (EconomyService.SetParty)
  stepParty(dt) {
    const want = Math.min(MAX_PLAYERS, 1 + this.guests.size), cur = this.econ.party.players;
    if (want > cur) { this.partyLowT = 0; this.setParty(want); }
    else if (want < cur) { this.partyLowT += dt; if (this.partyLowT >= PARTY_HOLD) { this.partyLowT = 0; this.setParty(want); } }
    else this.partyLowT = 0;
  }
  setParty(n) {
    const e = this.econ, old = e.party.players; if (n === old) return;
    e.party.set(n); e.dollars = e.dollars * n / old; e.recalc(); this._st = this.st();
    this.events.push({ type: 'party', n });
  }
  // pile density (PL/MoneyPile.c TakeCore): with N players one pile note is N bundles
  density() { return this.econ.party.bal.partyReference > 0 ? this.econ.party.players : 1; }
  swapIn(s) {
    const h = this._host || (this._host = { finds: {}, abil: {} });
    for (const k of SEAT_KEYS) { h[k] = this[k]; this[k] = s[k]; }
    for (const k of FIND_KEYS) { h.finds[k] = this.finds[k]; this.finds[k] = s.finds[k]; }
    for (const k of ABIL_KEYS) { h.abil[k] = this.abilities[k]; this.abilities[k] = s.abil[k]; }
    this.who = s.id;
  }
  swapOut(s) {
    const h = this._host;
    for (const k of SEAT_KEYS) { s[k] = this[k]; this[k] = h[k]; }
    for (const k of FIND_KEYS) { s.finds[k] = this.finds[k]; this.finds[k] = h.finds[k]; }
    for (const k of ABIL_KEYS) { s.abil[k] = this.abilities[k]; this.abilities[k] = h.abil[k]; }
    this.who = 0;
  }
  // a guest's buttons arrive as press counters; each new count is one press for the next step (none lost, none doubled)
  guestInput(id, m) {
    const s = this.guests.get(id); if (!s || !m) return;
    const prev = s.input, P = s.presses;
    for (const k of ['primary', 'interact', 'secondary', 'rally']) { const c = m.c ? m.c[k] | 0 : 0, was = prev && prev.c ? prev.c[k] | 0 : c; if (c !== was) P[k] = true; }
    s.input = m; if (m.tool != null) s.wantTool = m.tool | 0;
  }
  guestStepInput(s) {
    const m = s.input; if (!m) return null;
    const P = s.presses, secHeld = !!m.sh, out = {
      feet: m.f, eye: m.e, dir: m.d, vel: m.v || [0, 0, 0], primaryHeld: !!m.ph, interactHeld: !!m.ih, secondaryHeld: secHeld,
      primaryPressed: !!P.primary, interactPressed: !!P.interact, secondaryPressed: !!P.secondary, rallyPressed: !!P.rally,
      secondaryReleased: !!s.secPrev && !secHeld, upgradesOpen: !!m.uo, hudCovered: !!m.uo };
    s.secPrev = secHeld; s.presses = {};
    return out;
  }

  get stats() { return this.econ; }
  stat(id) { return this.econ.get(id); }
  // ToolService.RefreshStats clamps
  st() {
    const g = (id) => this.stat(id);
    return {
      reach: g(S.ReachDistance) > 0 ? g(S.ReachDistance) : 3.5,
      handCarry: Math.max(1, g(S.HandCarry)), handGrab: Math.max(1, g(S.HandGrab)),
      depositSpeed: g(S.DepositSpeed) > 0 ? Math.max(0.05, g(S.DepositSpeed)) : 1,
      handRate: g(S.HandPickupRate) > 0 ? g(S.HandPickupRate) : 1.6,
      bagCapacity: g(S.BagCapacity) > 0 ? g(S.BagCapacity) : 26130.67,
      bucketRate: g(S.BucketPickupRate) > 0 ? g(S.BucketPickupRate) : 2090.4536,
      shovelRadius: g(S.ShovelRadius) > 0 ? g(S.ShovelRadius) : 1,
      shovelItems: g(S.ShovelItems) > 0 ? g(S.ShovelItems) : 5226.134,
      shovelCooldown: g(S.ShovelCooldown) > 0 ? g(S.ShovelCooldown) : 1.5,
      vacuumRate: g(S.VacuumRate) > 0 ? g(S.VacuumRate) : 5226.134,
      vacuumRange: g(S.VacuumRange) > 0 ? g(S.VacuumRange) : 6,
      vacuumAngle: clamp(g(S.VacuumAngle), 1, 170),
      flowMax: Math.max(0, g(S.FlowMax)), flowBuild: clamp(g(S.FlowBuild) || 1, 1, 4), flowHold: clamp(g(S.FlowHold), 0, 5),
      handBuffer: clamp(g(S.HandBuffer), 0, 2), handWhiff: clamp(g(S.HandWhiff) || 1, 0.4, 1),
      pourSpeed: clamp(g(S.PourSpeed) || 1, 1, 3) * (this.finds ? this.finds.hatPerk('pour') || 1 : 1), pourHold: clamp(g(S.PourHold), 0, 3),
      shovelWindup: clamp(g(S.ShovelWindup) || 1, 1, 3), shovelWhiff: clamp(g(S.ShovelWhiff) || 1, 0.4, 1),
      vacuumSpinUp: clamp(g(S.VacuumSpinUp) || 1, 1, 3), bucketScoop: clamp(g(S.BucketScoop) || 1, 1, 1.3),
      catch: [1, clamp(g(S.BucketCatch) || 1, 1, 1.3), clamp(g(S.ShovelCatch) || 1, 1, 1.3), clamp(g(S.VacuumCatch) || 1, 1, 1.3)],
      shovelReach: (g(S.ReachDistance) > 0 ? g(S.ReachDistance) : 3.5) + 0.5 + clamp(g(S.ShovelReach), 0, 1.5),
    };
  }
  unlocked(tool) { return tool === 0 || this.econ.hasUnlock(TOOL_KEYS[tool]); }
  get flowMult() { return 1 + this.flow * this._st.flowMax; }

  // ---- bag ----
  bagUnits() { let u = 0; for (let t = 0; t < 6; t++) u += this.bag[t] * this.weights[t]; return u; }
  bagCapacity() { return Math.max(1, Math.round(this._st.bagCapacity)); }
  bagFree() { return Math.max(0, this.bagCapacity() - Math.ceil(this.bagUnits() - 1e-6)); }
  freeNotes(w) { return Math.floor(this.bagFree() / Math.max(0.01, w) + 1e-6); }
  handHeld() { return tallyTotal(this.hand); }
  handCap(w = 1) { return whole(this._st.handCarry) * whole(this._st.handGrab / Math.max(1, w)); }

  // ---- aiming: march the camera ray over the pile heightfield ----
  aimPile(eye, dir, reach) {
    const f = this.field;
    const step = 0.05;
    for (let d = 0.2; d <= reach; d += step) {
      const x = eye[0] + dir[0] * d, y = eye[1] + dir[1] * d, z = eye[2] + dir[2] * d;
      const c = f.cellOf(x, z);
      if (c < 0 || f.count[c] <= 0) continue;
      const top = f.topY(c);
      if (y <= top + 0.03) return { cell: c, point: [x, top, z], dist: d, tier: f.surfaceTier(c) };
    }
    return null;
  }
  aimReturn(eye, dir) {
    let best = -1, bd = RET.range;
    this.markers.returnButtons.forEach((c, i) => {
      const v = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
      const t = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
      if (t <= 0 || t > bd) return;
      const d2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2] - t * t;
      if (d2 <= RET.aimRadius * RET.aimRadius) { bd = t; best = i; }
    });
    return best;
  }
  topWeightAt(cell) { const t = this.field.surfaceTier(cell); return t >= 0 ? this.weights[t] : 1; }

  // take from the pile into hand/bag; profile per PitShape
  collect(point, radius, max, tool, intoBag, catchRadius) {
    const prof = tool === TOOL.Vacuum ? { cone: 1.6 } : tool === TOOL.Shovel ? { bowl: 0.76 } : { bowl: 0.3 };
    const r = tool === TOOL.Vacuum ? radius * 0.55 : radius;
    const tally = [0, 0, 0, 0, 0, 0], D = this.density();
    if (D > 1) max = Math.max(1, Math.floor(max / D));   // a take of k bundles removes k/N pile notes
    let n = this.field.take(point[0], point[2], r, max, prof, tally);
    if (n < max && catchRadius > radius) {
      const cr = Math.min(4, tool === TOOL.Vacuum ? catchRadius * 0.55 : catchRadius);
      n += this.field.take(point[0], point[2], cr, max - n, prof, tally);
    }
    if (n > 0) this.account(tally, n, point, tool, intoBag);
    return n * D;
  }
  account(tally, n, point, tool, intoBag) {
    const D = this.density();
    if (D > 1) { for (let t = 0; t < 6; t++) tally[t] *= D; n *= D; }   // one pile note = N bundles; the vault counter keeps pile notes
    const dst = intoBag ? this.bag : this.hand;
    for (let t = 0; t < 6; t++) dst[t] += tally[t];
    this.lastCollect = this.time;
    this.taken += n / D;
    this.econ.track(['HandPickups', 'BucketPickups', 'ShovelScoops', 'VacuumSeconds'][tool] || 'ItemsCollected', tool === 2 ? 1 : n);
    this.econ.track('ItemsCollected', n); this.econ.track('BillsCollected', n);
    // gilded notes: credited per tier in proportion to what was taken, paid double when shredded
    if (this.vaultEvents.gildAll) {          // Golden Minute (GildAll): every note taken counts as gilded
      for (let t = 0; t < 6; t++) if (!this.data.content.denominations[t].gold) this.econ.giltPending[t] += tally[t];
    } else if (tally.gilt > 0) {
      let left = tally.gilt, top = 0; const tot = tally[0] + tally[1] + tally[2] + tally[3] + tally[4] + tally[5];
      for (let t = 0; t < 6; t++) { if (tally[t] > tally[top]) top = t; const g = tot > 0 ? Math.floor(tally.gilt * tally[t] / tot) : 0; this.econ.giltPending[t] += g; left -= g; }
      this.econ.giltPending[top] += left;
      if (!this.giltToast) { this.giltToast = true; this.events.push({ type: 'giltFound' }); }
    }
    this.finds.noteTaken(point); this.vaultEvents.activity();
    let tier = -1; for (let t = 0; t < 6; t++) if (tally[t] > 0 && !this.data.content.denominations[t].gold) tier = t;
    this.events.push({ type: 'take', tool, n, tally, point, tier });
  }

  // ---- deposit near the shredder ----
  // GoldStation (rules/loop.md §2.2 / §5.4): the big vault moves it into the Golden Reserve room; within its interactRadius
  // 3.4 a deposit goes there instead, and GoldStation.Pay books it through the same IncomeService as the shredder
  nearStation(feet) {
    const p = this.markers.station; if (!p) return false;
    return Math.abs(feet[1] - p[1]) <= 4 && Math.hypot(feet[0] - p[0], feet[2] - p[2]) <= 3.4;
  }
  depositTarget(feet) { return this.nearStation(feet) && this.markers.stationMouth ? this.markers.stationMouth : this.markers.shredderIntake; }
  nearShredder(feet) {
    if (this.nearStation(feet)) return true;
    const p = this.markers.shredderInteract;
    const reach = SHRED.interactRadius + Math.min(2.5, Math.max(0, this.stat(S.DepositReach)));
    return Math.abs(feet[1] - (p[1] - 1)) <= 4 && Math.hypot(feet[0] - p[0], feet[2] - p[2]) <= reach;
  }
  tryStream(feet) {
    if (this.stream || !this.nearShredder(feet)) return false;
    const hand = this.tool === TOOL.Hand && this.handHeld() > 0;
    const bagN = tallyTotal(this.bag);
    if (!hand && bagN <= 0) return false;
    this.stream = { hand, elapsed: 0, timer: 0, source: hand ? SRC.Hand : [SRC.Hand, SRC.Bucket, SRC.Shovel, SRC.Vacuum][this.tool] };
    if (!hand) this.econ.track('BagDumps');
    this.events.push({ type: 'pourStart', hand });
    return true;
  }
  updateStream(dt, held, feet) {
    const s = this.stream; if (!s) return;
    const st = this._st;
    const rate = s.hand ? st.depositSpeed : st.pourSpeed;
    const boost = held ? (s.hand ? TS.holdBoost : st.pourHold + TS.holdBoost) : 1;
    s.elapsed += boost * rate * dt; s.timer -= rate * dt;
    let near = this.nearShredder(feet) && (s.hand ? this.handHeld() > 0 : tallyTotal(this.bag) > 0);
    const k = Math.pow(clamp(s.elapsed / TS.accelSeconds, 0, 1), 3);
    const interval = s.hand ? TS.handIntervalStart + (TS.handIntervalEnd - TS.handIntervalStart) * k : TS.bagIntervalStart + (TS.bagIntervalEnd - TS.bagIntervalStart) * k;
    for (let i = 0; near && s.timer <= 0 && i <= 7; i++) {
      s.timer += interval;
      const piece = [0, 0, 0, 0, 0, 0];
      if (s.hand) {
        const held2 = this.handHeld(), g = whole(st.handGrab);
        const size = g * Math.ceil(Math.ceil(held2 / g) / TS.handPourPieces);
        let left = size; for (let t = 5; t >= 0 && left > 0; t--) { const m = Math.min(left, this.hand[t]); this.hand[t] -= m; piece[t] = m; left -= m; }
        this.econ.track('ThrowsIntoShredder', tallyTotal(piece));
      } else {
        let tier = -1; for (let t = 5; t >= 0; t--) if (this.bag[t] > 0) { tier = t; break; }
        if (tier < 0) break;
        const left = Math.max(0.2, TS.bagStreamMaxSeconds - s.elapsed);
        const launches = Math.max(1, Math.floor(left / Math.max(0.01, interval)));
        const notes = Math.min(Math.max(1, Math.ceil(tallyTotal(this.bag) / launches)), this.bag[tier]);
        this.bag[tier] -= notes; piece[tier] = notes;
      }
      const flight = 0.3;
      this.enqueue(piece, feet, s.source, flight);
      this.events.push({ type: 'pourPiece', hand: s.hand, n: tallyTotal(piece) });
      near = (s.hand ? this.handHeld() : tallyTotal(this.bag)) > 0;
    }
    if (s.timer < -0.2) s.timer = 0;
    if (!near) { this.stream = null; this.events.push({ type: 'pourEnd' }); }
  }

  // ---- shredder (M/Shredder.c) ----
  enqueue(notes, from, source, delay = 0) {
    const total = tallyTotal(notes); if (total < 1) return;
    const ip = this.markers.shredderIntake;
    const d = Math.hypot(from[0] - ip[0], from[1] - ip[1], from[2] - ip[2]);
    const lead = d >= SHRED.directRadius ? clamp(d * 0.035 + 0.25, 0.3, 0.9) : 0;
    this.queued += total;
    const ready = this.time + Math.max(delay, 0) + lead + SHRED.suckTime;
    const last = this.queue[this.queue.length - 1];
    if (last && last.source === source && last.by === this.who && Math.abs(last.readyAt - ready) < 0.03) { for (let t = 0; t < 6; t++) last.notes[t] += notes[t]; }
    else this.queue.push({ notes: notes.slice(), source, readyAt: ready, by: this.who });
    if (this.queue.length > 48) { const e = this.queue.shift(); this.queued -= tallyTotal(e.notes); this.finale.book(this.econ.shred(e.notes, e.source), e.by); }
  }
  stepShredder(dt) {
    this.pollTimer -= dt;
    if (this.pollTimer <= 0) {
      this.pollTimer = 0.5;
      let speed = this.stat(S.ShredderSpeed) > 0 ? this.stat(S.ShredderSpeed) : SHRED.fallbackSpeed * F;
      const bb = this.stat(S.BacklogBoost) > 0 ? Math.min(0.5, this.stat(S.BacklogBoost)) : 0;
      if (bb > 0) { const vis = this.queued < 1 ? 0 : Math.max(Math.min(this.queued, 3), this.queued / F); speed *= 1 + bb * clamp(vis / SHRED.queueForFullBoost, 0, 1); }
      this.shredSpeed = speed;
    }
    const speed = this.shredSpeed;
    this.budget = Math.min(this.budget + dt * speed, Math.max(0, SHRED.batchInterval * speed * 3));
    if (!this.queue.length) return;
    this.batchTimer -= dt;
    if (this.batchTimer > 0) return;
    this.batchTimer = Math.max(this.batchTimer + SHRED.batchInterval, 0);
    for (let i = 0, iter = 0; i < this.queue.length && this.budget >= 1 && iter <= 3;) {
      const e = this.queue[i];
      if (this.time < e.readyAt) { i++; continue; }
      const into = [0, 0, 0, 0, 0, 0]; let spent = 0;
      for (let t = 5; t >= 0; t--) {
        const unit = t === 5 ? F : 1;
        let n = Math.min(e.notes[t], Math.floor((this.budget - spent) / unit + 1e-9));
        if (n <= 0 && spent === 0 && e.notes[t] > 0 && !e.notes.slice(0, t).some(v => v > 0)) n = 1;
        if (n > 0) { into[t] = n; e.notes[t] -= n; spent += n * unit; }
      }
      const tot = tallyTotal(into);
      if (tot < 1) { i++; continue; }
      if (tallyTotal(e.notes) < 1) this.queue.splice(i, 1);
      this.queued -= tot; this.budget -= spent; iter++;
      const res = this.econ.shred(into, e.source);
      this.finale.book(res, e.by | 0);
      this.events.push({ type: 'shredded', res, n: tot, by: e.by | 0 });
    }
  }

  // ---- drones (D/DroneBrain.c, simplified route) ----
  stepDrones(dt) {
    const count = clamp(Math.round(this.stat(S.DroneCount)), 0, 16);
    while (this.drones.length < count) {
      const i = this.drones.length, pad = this.markers.pads[i % this.markers.pads.length];
      this.drones.push({ i, state: 'docked', pos: pad.slice(), pad: pad.slice(), cargo: [0, 0, 0, 0, 0, 0], value: 0, trips: 0, takeT: 0, t: 0, target: null, vel: [0, 0, 0] });
    }
    const vmax = (this.stat(S.DroneRate) > 0 ? this.stat(S.DroneRate) : 1) * DRONE.cruiseSpeed;
    const capacity = this.stat(S.DroneCapacity) > 0 ? this.stat(S.DroneCapacity) : 156784;
    const dig = (this.stat(S.DroneDig) > 0 ? this.stat(S.DroneDig) : 52261) * (this.abilities.rally ? this.abilities.rally.dig : 1);
    const tripsMax = Math.max(1, this.stat(S.DroneBattery) > 0 ? Math.round(this.stat(S.DroneBattery)) : 2);
    const recharge = clamp(this.stat(S.DroneRecharge) || 1, 0.5, 1);
    const hopper = [this.markers.shredderIntake[0], this.markers.shredderIntake[1] + 3, this.markers.shredderIntake[2]];
    let launched = 0;
    for (const d of this.drones) {
      if (d.i >= count && d.state === 'docked') continue;
      if (d.state === 'docked') {
        if (d.trips === 0 && d.t === 0) d.trips = tripsMax;
        if (d.i < count && d.trips >= 1 && launched === 0) {
          const site = this.pickSite(d);
          if (site) { d.target = site; d.state = 'outbound'; launched++; this.events.push({ type: 'droneLaunch', i: d.i }); }
        }
      } else if (d.state === 'outbound') {
        const tgt = [d.target[0], this.field.topY(d.target[3]) + DRONE.digHeight + (d.rider != null ? FUN.riderDrop : 0), d.target[2]];
        if (this.fly(d, tgt, vmax * (d.rider != null ? FUN.riderSpeed : 1), dt)) { d.state = 'dig'; d.takeT = 0; d.dry = 0; }
      } else if (d.state === 'dig') {
        d.takeT += dt;
        // follow the surface down while digging
        const c = d.target[3]; d.pos[1] += ((this.field.count[c] > 0 ? this.field.topY(c) : this.field.floorQ[c] * T) + DRONE.digHeight - d.pos[1]) * Math.min(1, dt * 4);
        while (d.takeT >= DRONE.takeInterval) {
          d.takeT -= DRONE.takeInterval;
          const tier = this.field.surfaceTier(c);
          const face = tier >= 0 ? this.econ.face(tier) : 1;
          const fit = Math.min(1e15, Math.floor((capacity - d.value) / Math.max(1, face) + 1e-6));
          const n = Math.min(fit, Math.floor(DRONE.takeInterval * dig));
          const tally = [0, 0, 0, 0, 0, 0];
          const D = this.density();
          const got = n > 0 ? this.field.take(d.target[0], d.target[2], DRONE.takeRadius, D > 1 ? Math.max(1, Math.floor(n / D)) : n, { bowl: 0.3 }, tally) : 0;
          if (got > 0 && D > 1) for (let t = 0; t < 6; t++) tally[t] *= D;
          if (got > 0) { for (let t = 0; t < 6; t++) { d.cargo[t] += tally[t]; d.value += tally[t] * this.econ.face(t); } this.taken += got; this.events.push({ type: 'droneTake', i: d.i, n: got }); d.dry = 0; }
          else d.dry++;
          const p = this.player.pos;
          const tooClose = Math.hypot(p[0] - d.pos[0], p[2] - d.pos[2]) < DRONE.playerExclusion * 0.7;
          if (d.value >= capacity - 1e-6 || fit <= 0 || d.dry >= 2 || tooClose) { d.state = tallyTotal(d.cargo) > 0 ? 'inbound' : 'return'; break; }
        }
      } else if (d.state === 'inbound') {
        if (this.fly(d, hopper, vmax * (1 - 0.25 * clamp(d.value / capacity, 0, 1)) * (d.rider != null ? FUN.riderSpeed : 1), dt)) { d.state = 'dump'; d.t = 0; }
      } else if (d.state === 'dump') {
        d.t += dt;
        if (d.t >= DRONE.depositAt && tallyTotal(d.cargo) > 0) {
          this.enqueue(d.cargo, d.pos, SRC.Drone, 0); this.econ.track('DroneDeliveries');
          this.events.push({ type: 'droneDump', i: d.i, n: tallyTotal(d.cargo) });
          d.cargo = [0, 0, 0, 0, 0, 0]; d.value = 0;
        }
        if (d.t >= DRONE.dumpTime) {
          d.trips -= 1;
          if (d.trips >= 1 && d.i < count) { const site = this.pickSite(d); if (site) { d.target = site; d.state = 'outbound'; } else d.state = 'return'; }
          else d.state = 'return';
        }
      } else if (d.state === 'return') {
        if (this.fly(d, d.pad, vmax, dt)) { d.state = 'recharge'; d.t = 0; }
      } else if (d.state === 'recharge') {
        d.trips += tripsMax / Math.max(0.1, DRONE.rechargeTime * recharge) * dt;
        if (d.trips >= tripsMax) { d.trips = tripsMax; d.state = 'docked'; }
      }
    }
  }
  fly(d, tgt, vmax, dt) {
    const dx = tgt[0] - d.pos[0], dy = tgt[1] - d.pos[1], dz = tgt[2] - d.pos[2];
    const dist = Math.hypot(dx, dy, dz);
    // cruise above the pile: keep at least 4 m over the money on the way
    let v = vmax;
    if (Math.abs(d.pos[0]) < 14 && d.pos[2] > -2) v = Math.min(v, DRONE.lobbySpeed * clamp(this.stat(S.DroneTaxi) || 1, 1, 1.3) + Math.max(0, -d.pos[2]) * 0.6);
    const stepL = v * dt;
    if (dist <= Math.max(0.15, stepL)) { d.pos = tgt.slice(); return true; }
    d.pos[0] += dx / dist * stepL; d.pos[2] += dz / dist * stepL;
    const ground = this.field.heightAt(d.pos[0], d.pos[2]);
    const want = dist > 6 ? Math.max(tgt[1], (isFinite(ground) ? ground : 3) + 4, 6) : tgt[1];
    d.pos[1] += clamp(want - d.pos[1], -stepL, stepL);
    d.heading = Math.atan2(dx, dz);
    return false;
  }
  // DroneSites.Pick: 2 m grid over the hall; prefer tall money away from the player and from other drones
  pickSite(d) {
    const f = this.field; let best = null, bestS = -1;
    if (this.abilities.rally) {          // Rally: free drones claim slots around the beacon
      for (let i = 0; i < 18; i++) { const s = this.abilities.rallySlot(i); if (s && !this.drones.some(o => o !== d && o.target && o.state !== 'docked' && Math.hypot(o.target[0] - s[0], o.target[2] - s[2]) < 1)) return s; }
    }
    for (let k = 0; k < 40; k++) {
      const cx = Math.floor(this.rand() * NX), cz = Math.floor(this.rand() * NX);
      const c = cz * NX + cx; if (f.count[c] <= 0) continue;
      const x = OX + (cx + 0.5) * CELL, z = -(OZ + (cz + 0.5) * CELL);
      const p = this.player.pos;
      if (Math.hypot(p[0] - x, p[2] - z) < DRONE.playerExclusion) continue;
      if (this.drones.some(o => o !== d && o.target && Math.hypot(o.target[0] - x, o.target[2] - z) < 3 && o.state !== 'docked')) continue;
      const s = f.topY(c) + this.rand() * 0.5;
      if (s > bestS) { bestS = s; best = [x, 0, z, c]; }
    }
    return best;
  }

  // ---- auto-pump (M/AutoPump.c) ----
  stepPump(dt) {
    const time = Math.max(0, this.stat(S.AutoPumpInterval));
    if (time > 0 && this.pump.time <= 0) this.pump.charge = 1;
    if (time <= 0) this.pump.charge = 0;
    this.pump.time = time;
    if (time <= 0) return;
    this.pump.charge = Math.min(1, Math.max(this.pump.charge, 0) + dt / time);
    if (this.pump.charge >= 1) {
      const share = Math.min(0.3, Math.max(0, this.stat(S.AutoPumpFill)));
      const cap = this.bagCapacity(), units = this.bagUnits(), notes = tallyTotal(this.bag);
      const nearly = notes > 0 && share > 0 && cap > 0 && (cap - units) <= cap * share;
      if (nearly && !this.stream) {
        const load = this.bag.slice(); this.bag = [0, 0, 0, 0, 0, 0];
        this.pump.charge = 0; this.econ.track('AutoPumps');
        this.enqueue(load, this.player.pos, SRC.AutoPump, 1.2);
        this.events.push({ type: 'pump', n: tallyTotal(load) });
      }
    }
  }

  // intro chain + its hold/request on boost orbs (rules/intro.md §4), then the orb service
  stepIntroBoosts(dt, input) {
    const I = this.intro, e = this.econ, boostIdx = INTRO_STEPS.findIndex(s => s.id === 'boost');
    const chainOn = I.seen && !I.done;
    const collected = e.stats.tracked.BoostsCollected || 0;
    this.boosts.hold = chainOn && I.step < boostIdx && collected < 1;
    if (chainOn && I.step === boostIdx) { this.boostStepT = (this.boostStepT || 0) + dt; } else this.boostStepT = 0;
    this.boosts.want = chainOn && I.step === boostIdx && this.boostStepT >= INTRO_TUNE.boostDelay;
    this.boosts.step(dt, input.feet || this.player.pos, input.eye, input.dir, input.primaryPressed);
    I.update(dt, {
      stat: e.stats.tracked, dollars: e.dollars, points: e.points, handCapacity: this.handCap(1),
      cost: (id) => e.cost(id), isVisible: (id) => e.isVisible(id), hasUnlock: (k) => e.hasUnlock(k),
      bagFull: this.bagFree() < 1 && this.unlocked(1), upgradesOpen: !!input.upgradesOpen, stairsMask: this.field.revealed,
      flags: this.flags, has: this.has, hudCovered: !!input.hudCovered,
      chestKnown: !!this.finds.chest, chestSpotted: !!this.finds.chest && (this.finds.chest.state === 'buried' || this.finds.chest.state === 'ready'),
    });
  }

  selectTool(t) {
    if (t < 0 || t > 3 || !this.unlocked(t) || t === this.tool) return false;
    this.tool = t; this.swap = TS.swapDuration; this.bucketAcc = 0; this.vac.spin = 0;
    this.events.push({ type: 'tool', tool: t });
    return true;
  }

  // ---- main step ----
  // input: {primaryHeld, primaryPressed, interactPressed, eye, dir, feet}
  step(dt, input) {
    if (this.client) return this.clientStep(dt, input);
    this._st = this.st();
    this.time += dt; this.played += dt;
    if (this.guests.size || this.econ.party.players > 1) this.stepParty(dt);
    const e0 = this.events.length;
    this.seatStep(dt, input, true);
    if (this.guests.size) {
      for (let i = e0; i < this.events.length; i++) if (this.events[i].who == null && SEAT_EVENTS.has(this.events[i].type)) this.events[i].who = 0;
      for (const s of this.guests.values()) {
        const inp = this.guestStepInput(s); if (!inp || !inp.feet) continue;
        if (s.wantTool !== s.tool) { this.swapIn(s); this.selectTool(s.wantTool); this.swapOut(s); }
        const e1 = this.events.length;
        this.swapIn(s);
        try { this.seatStep(dt, inp, false); } finally { this.swapOut(s); }
        for (let i = e1; i < this.events.length; i++) if (this.events[i].who == null && SEAT_EVENTS.has(this.events[i].type)) this.events[i].who = s.id;
      }
    }
    this.stepShared(dt, input);
  }
  // a co-op guest's mirror: the host owns the world; this moves my player, aims for my prompts, eases the drones
  clientStep(dt, input) {
    this._st = this.st(); this.time += dt; this.played += dt;
    const feet = input.feet || this.player.pos; this.player.pos = feet.slice();
    if (input.dir) { this.player.yaw = Math.atan2(-input.dir[0], -input.dir[2]); this.player.pitch = Math.asin(Math.max(-1, Math.min(1, input.dir[1]))); }
    const st = this._st;
    this.aim = input.eye ? this.aimPile(input.eye, input.dir, this.tool === TOOL.Shovel ? st.shovelReach : this.tool === TOOL.Vacuum ? st.vacuumRange : st.reach) : null;
    this.ret.aimed = input.eye ? this.aimReturn(input.eye, input.dir) : -1;
    this.finale.aimOnly(input); this.finale.stepLight(dt, input);
    if (this.finds.carry && input.eye) this.finds.holdAt(this.finds.carry, input.eye, input.dir);
    if (this.swap > 0) this.swap -= dt;
    const v = this.vac, want = this.tool === TOOL.Vacuum && input.primaryHeld && !this.finds.carry;   // the vacuum's spin is drawn from my own button
    v.spin += ((want ? 1 : 0) - v.spin) * clamp(1 - Math.exp(-(want ? VAC.spinUp * st.vacuumSpinUp : VAC.spinDown) * dt), 0, 1);
    for (const d of this.drones) if (d.net) for (let k = 0; k < 3; k++) d.pos[k] += (d.net[k] - d.pos[k]) * Math.min(1, dt * 10);
    for (const o of this.boosts.orbs) if (o.state === 1) o.age += dt;   // ORB_STATE.Live
    if (this.finds.chest) this.finds.chest.t += dt;
  }
  // one player's hands: tools, pouring, the pump, abilities, carry and the ending's key/door (Net.Actor = this seat)
  seatStep(dt, input, host) {
    const feet = input.feet || this.player.pos;
    if (this.guests.size) {          // RunPlayer distance / deepest by Actor (teleports over 3 m are not walked)
      const P = this.finale.player(this.who), o = this.player.pos, d = Math.hypot(feet[0] - o[0], feet[2] - o[2]);
      if (d < 3) P.distance += d; P.deepest = Math.max(P.deepest, this.markers.spawn[1] - feet[1]);
    }
    this.player.pos = feet.slice();
    if (!host && input.dir) { this.player.yaw = Math.atan2(-input.dir[0], -input.dir[2]); this.player.pitch = Math.asin(Math.max(-1, Math.min(1, input.dir[1]))); }
    // flow
    if (this.time - this.lastCollect < TS.flowWindow + this._st.flowHold) this.flow = Math.min(1, this.flow + dt * this._st.flowBuild / TS.flowBuildSeconds);
    else this.flow = Math.max(0, this.flow - dt * (this.finds ? this.finds.hatPerk('flowFade') || 1 : 1) / TS.flowDecaySeconds);   // Wizard Hat: Flow fades 30 % slower
    if (this.swap > 0) this.swap -= dt;
    // the ending: key pickup / door press take Interact first (they clear input.interactPressed)
    if (host) this.finale.step(dt, input); else this.finale.guestInput(input);
    // return buttons: aim a cap within range, press interact, teleport to the lobby spawn after the delay
    this.ret.aimed = input.eye ? this.aimReturn(input.eye, input.dir) : -1;
    if (this.ret.at > 0 && this.time >= this.ret.at) { this.ret.at = -1; this.events.push({ type: 'teleport', to: this.markers.spawn.slice() }); }
    if (input.interactPressed && this.ret.aimed >= 0 && this.time >= this.ret.ready) {
      this.ret.at = this.time + RET.teleportDelay; this.ret.ready = this.time + RET.cooldown; this.events.push({ type: 'returnPress', i: this.ret.aimed });
    } else if (input.interactPressed && !(host ? this.finds.step(dt, input) : this.finds.input(dt, input))) this.tryStream(feet);
    if (!input.interactPressed || this.ret.aimed >= 0) { if (host) this.finds.step(dt, { ...input, interactPressed: false }); else this.finds.input(dt, { ...input, interactPressed: false }); }
    // carrying an item puts the tools away (PlayerCarry.Active -> HandsFull)
    if (this.finds.carry || input.primaryPressed && this.finds.thrownNow) input = { ...input, primaryHeld: false, primaryPressed: false };
    const st = this._st;
    const busy = this.swap > 0.125 || !!this.stream;
    this.aim = input.eye ? this.aimPile(input.eye, input.dir, this.tool === TOOL.Shovel ? st.shovelReach : this.tool === TOOL.Vacuum ? st.vacuumRange : st.reach) : null;
    if (this.tool === TOOL.Hand) this.stepHand(dt, input, feet, busy);
    else if (this.tool === TOOL.Bucket) this.stepBucket(dt, input, feet, busy);
    else if (this.tool === TOOL.Shovel) this.stepShovel(dt, input, feet, busy);
    else if (this.tool === TOOL.Vacuum) this.stepVacuum(dt, input, feet, busy);
    this.updateStream(dt, input.primaryHeld || input.interactHeld, feet);
    this.stepPump(dt);
    this.abilities.step(dt, input);
    if (!host) { this.boosts.touch(feet, input.eye, input.dir, input.primaryPressed); this.vaultEvents.palletTouch(feet, this.who); }
  }
  // the world: shredder, drones, vault events, intro + orbs, economy, slump, levels (once per frame, host only)
  stepShared(dt, input) {
    const feet = input.feet || this.player.pos;
    this.stepShredder(dt);
    this.stepDrones(dt);
    this.fun.step();
    this.vaultEvents.step(dt, feet);
    const eb = this.events.length;
    this.stepIntroBoosts(dt, input);
    if (this.guests.size) for (let i = eb; i < this.events.length; i++) if (this.events[i].type === 'orbPickup' && this.events[i].who == null) this.events[i].who = 0;
    this.econ.tick(dt);
    // slump: 30 Hz, at most 2 ticks per frame
    this.slumpAcc = (this.slumpAcc || 0) + dt;
    let k = 0; while (this.slumpAcc >= 1 / 30 && k < 2) { this.slumpAcc -= 1 / 30; this.field.slumpTick(64); k++; }
    if (this.slumpAcc > 0.2) this.slumpAcc = 0;
    // levels + stairs
    const opened = this.field.checkLevels();
    if (opened) this.events.push({ type: 'levelOpened', level: opened });
    this.stairsTimer -= dt;
    if (this.stairsTimer <= 0) { this.stairsTimer = 0.25; for (const k2 of this.field.checkStairs()) this.events.push({ type: 'stairs', ramp: k2 }); }
    this.drainEcon();
  }
  // economy events (bought, level, milestone...) carry the buyer in co-op; a purchase counts for RunPlayer.upgrades
  drainEcon() {
    for (const e of this.econ.events) {
      if (this.guests.size && (e.type === 'bought' || e.type === 'learned')) {
        if (e.who == null) e.who = this.who;
        if (e.type === 'bought') { const P = this.finale.player(e.who), n = e.n || 1; P.upgrades += n; if (/^automation\.drone_/.test(e.id || "")) P.droneUpgrades += n; }
      }
      this.events.push(e);
    }
    this.econ.events.length = 0;
  }
  // a command from a co-op guest runs as that player (Net.Actor), e.g. Buy or Learn
  actAs(id, fn) {
    const s = this.guests.get(id); if (!s) return undefined;
    this.swapIn(s); let r;
    try { r = fn(); this.drainEcon(); } finally { this.swapOut(s); }
    return r;
  }

  stepHand(dt, input, feet, busy) {
    const st = this._st;
    this.handCooldown -= dt;
    const held = this.handHeld();
    if (input.primaryPressed && held > 0 && this.tryStream(feet)) return;
    const w = this.aim ? Math.max(1, this.topWeightAt(this.aim.cell)) : 1;
    const cap = this.handCap(w);
    if (input.primaryPressed && held >= cap) this.events.push({ type: 'handsFull' });
    if (busy || !input.primaryHeld || held >= cap || this.handCooldown > 0) return;
    if (!this.aim) { if (input.primaryPressed) { this.handCooldown = st.handWhiff * 0.2; this.events.push({ type: 'whiff', tool: 0 }); } return; }
    const tally = [0, 0, 0, 0, 0, 0];
    const n1 = this.field.takeOne(this.aim.cell, tally);
    if (n1 < 1) { this.handCooldown = 0.1; return; }
    const g = whole(st.handGrab);
    const units = held < cap ? Math.floor((Math.min(g, cap - held) - 1) / Math.max(1, w)) + 1 : 0;
    let n = n1;
    const D = this.density(), more = D > 1 ? Math.floor((units - 1) / D) : units - 1;
    if (more > 0) {
      const r = clamp(0.25 * Math.sqrt((units - 1) / 500), 0.375, 1.5);
      n += this.field.take(this.aim.point[0], this.aim.point[2], r, more, { bowl: 0.3 }, tally);
    }
    this.account(tally, n, this.aim.point, TOOL.Hand, false);
    const rate = Math.max(0.1, st.handRate * this.flowMult);
    this.handCooldown = Math.max(this.handCooldown, -dt) + 1 / rate;
  }

  stepBucket(dt, input, feet, busy) {
    const st = this._st;
    if (input.primaryPressed && tallyTotal(this.bag) > 0 && this.tryStream(feet)) return;
    const hit = this.aim;
    const active = !busy && (input.primaryHeld || input.primaryPressed) && hit;
    if (!active) { this.bucketAcc = 0; return; }
    if (this.bagFree() < 1) { if (input.primaryPressed) this.events.push({ type: 'bagFull' }); this.bucketAcc = 0; return; }
    const w = this.topWeightAt(hit.cell), free = this.freeNotes(w);
    this.bucketAcc += dt * st.bucketRate * this.flowMult / Math.max(1, w);
    const n = Math.floor(this.bucketAcc);
    if (n > 0) {
      this.bucketAcc -= n;
      const r = st.bucketScoop * (BUCKET.takeRadius + 0.04 * Math.min(n / F, 20));
      const catchR = Math.max(1, this.data.balance.toolCatch.bucket) * r * st.catch[1];
      this.collect(hit.point, r, Math.min(n, free), TOOL.Bucket, true, catchR);
    }
  }

  stepShovel(dt, input, feet, busy) {
    const st = this._st, sh = this.shovel;
    sh.cooldown -= dt;
    if (input.primaryPressed && tallyTotal(this.bag) > 0 && this.tryStream(feet)) return;
    if ((sh.phase === 0) && !busy && input.primaryHeld && sh.cooldown <= 0) {
      sh.phase = 1; sh.t = 0;
      sh.speed = clamp(SHOVEL.swingNominal / Math.max(0.05, st.shovelCooldown / Math.max(0.01, this.flowMult)), 1, 1.6);
      this.events.push({ type: 'swing' });
    }
    if (sh.phase === 1) { sh.t += dt * sh.speed * st.shovelWindup / SHOVEL.windUpTime; if (sh.t >= 1) { sh.phase = 2; sh.t = 0; } }
    else if (sh.phase === 2) {
      sh.t += dt * sh.speed * st.shovelWindup / SHOVEL.thrustTime;
      if (sh.t >= 1) { sh.phase = 0; this.strike(); }
    }
  }
  strike() {
    const st = this._st, sh = this.shovel;
    const aimR = Math.max(1, this.data.balance.toolCatch.shovel) * st.shovelRadius * st.catch[2];
    const hit = this.aim;
    if (!hit) { sh.cooldown = Math.max(0.05, SHOVEL.whiffCooldown * st.shovelWhiff); this.events.push({ type: 'whiff', tool: 2 }); return; }
    if (this.bagFree() < 1) { this.events.push({ type: 'bagFull' }); sh.cooldown = Math.max(0.05, SHOVEL.whiffCooldown); return; }
    const w = Math.max(1, this.topWeightAt(hit.cell)), free = this.freeNotes(w);
    const n = Math.min(Math.max(1, Math.round(st.shovelItems / w)), free);
    this.collect(hit.point, st.shovelRadius, n, TOOL.Shovel, true, aimR);
    sh.cooldown = Math.max(0.05, st.shovelCooldown / this.flowMult);
    this.events.push({ type: 'dig', point: hit.point });
  }

  stepVacuum(dt, input, feet, busy) {
    const st = this._st, v = this.vac;
    if (input.primaryPressed && tallyTotal(this.bag) > 0 && this.tryStream(feet)) return;
    const want = !busy && input.primaryHeld;
    const l = want ? VAC.spinUp * st.vacuumSpinUp : VAC.spinDown;
    v.spin += ((want ? 1 : 0) - v.spin) * clamp(1 - Math.exp(-l * dt), 0, 1);
    if (!want || v.spin <= 0.3 || !this.aim) { v.acc = 0; return; }
    this.econ.track('VacuumSeconds', dt);
    if (this.bagFree() < 1) { v.acc = 0; if (!this._fullCd || this.time > this._fullCd) { this.events.push({ type: 'bagFull' }); this._fullCd = this.time + 0.5; } return; }
    const radius = clamp(this.aim.dist * Math.tan(st.vacuumAngle / 2 * Math.PI / 180), 0.4, 3.0);
    const w = Math.max(1, this.topWeightAt(this.aim.cell)), free = this.freeNotes(w);
    const over = this.time < this.abilities.overloadUntil ? this.abilities.overloadRate : 1;   // Overload: ×(power+1)·3
    v.acc += dt * st.vacuumRate * over * this.flowMult * v.spin / w;
    const n = Math.floor(v.acc);
    if (n > 0) {
      v.acc -= n;
      const catchR = Math.max(1, this.data.balance.toolCatch.vacuum) * radius * st.catch[3];
      this.collect(this.aim.point, radius, Math.min(n, free), TOOL.Vacuum, true, catchR);
    }
  }

  droneCapacity() { return this.stat(S.DroneCapacity) > 0 ? this.stat(S.DroneCapacity) : 156784; }
  vaultLeft() { return this.field.items; }
  billsTotal() { return 1e9 + (this.delivered || 0); }

  save() {
    return {
      v: 1, econ: this.econ.save(), pile: this.field.save(), tool: this.tool, hand: this.hand, bag: this.bag,
      queue: this.queue.map(e => ({ n: e.notes, s: e.source })), played: this.played, taken: this.taken,
      player: this.player, pump: this.pump.charge,
      drones: this.drones.map(d => ({ cargo: d.cargo })),
      boosts: this.boosts.save(), intro: this.intro.save(), flags: [...this.flags], abilities: this.abilities.save(),
      finds: this.finds.save(), vev: this.vaultEvents.save(), delivered: this.delivered, fin: this.finale.save(),
    };
  }
  load(s) {
    if (!s || s.v !== 1) return false;
    this.newGame();
    this.econ.load(s.econ); this._st = this.st();
    this.field.load(s.pile);
    this.tool = this.unlocked(s.tool) ? s.tool : 0; this.hand = s.hand || this.hand; this.bag = s.bag || this.bag;
    this.played = s.played || 0; this.taken = s.taken || 0;
    if (s.player) this.player = s.player;
    this.pump.charge = s.pump || 0;
    this.boosts.load(s.boosts); this.intro.load(s.intro); this.abilities.load(s.abilities); this.flags = new Set(s.flags || []);
    this.delivered = s.delivered || 0; this.finds.load(s.finds); this.vaultEvents.load(s.vev);
    this.finale.load(s.fin); this.finale.primeMoments();
    // queued and in-cargo notes are shredded on load (nothing is lost)
    for (const e of s.queue || []) this.queue.push({ notes: e.n, source: e.s, readyAt: 0 });
    for (const e of this.queue) this.queued += tallyTotal(e.notes);
    for (const d of s.drones || []) if (tallyTotal(d.cargo) > 0) this.queue.push({ notes: d.cargo, source: SRC.Drone, readyAt: 0 });
    return true;
  }
}
