// Finds (rules/finds.md): golden notes + Gold Teller, relics + FINDS board, treasure chests + hats, and the one-item carry
// they share (also used by the Jackpot Crate event). Pure JS, owned by Game. Coordinates: three.js (z = -unity z).
import { STAT as S, SRC } from './economy.js';
import { CELL, NX, OX, OZ, HALF, OUTER, FLOOR, RAMPS, rockFloor, tierMinHeight } from './pile.js';

export const GN = { start: 24, delivery: 6, cover: 1.2, lift: 0.3, wall: 2, spacing: 6, findSpacing: 4, near: 3, nearR: 25, nearCover: 2,
  reveal: 0.15, toast: 16, firstMin: 12e6, firstMax: 14e6, takeFresh: 3, hop: 2.2 };
export const RELIC = { spacing: 10, wall: 3, cover: 0.9, lift: 0.35, reveal: 0.3, poll: 0.2 };
export const CHEST = { hw: 0.49, hd: 0.32, h: 0.74, cover: 0.12, lobby: [14, 26], wall: 5, flat: 0.45, shares: [0.10, 0.06, 0.05, 0.04, 0.03], least: 200,
  openBelow: 0.14, buryAbove: 0.45, hint: 6, reach: 3.2, aimR: 0.6, squat: 0.16, lid: 0.7, leave: 0.8, retry: 45, poll: 0.15, show: [7.0, 6.25, 6.25, 6.25, 4.25] };
export const CARRY = { reach: 3.2, aimR: 0.6, touch: 1.3, give: 4, hold: [0.14, -0.12], throwAfter: 0.2, throwK: 4.5, throwUp: 1.2, throwVel: 8,
  boardBox: [0.35, 1.45, 2.6], boardFaceUp: 1.1, tellerCatch: 0.9 };   // loop.md §8 (CarryRules), RelicShelf catch box 5.2x2.9x0.7
// Gold Teller prize track (G/TellerRules.c:476-845): [kind, a, b]; kinds cash|perk|boost|auto
export const TRACK = [['cash', 2], ['perk', 'deep_pockets', 1], ['perk', 'golden_teeth', 1], ['auto'], ['perk', 'fresh_ink', 1], ['perk', 'quick_count', 1], ['cash', 3],
  ['perk', 'spring_soles', 1], ['perk', 'lucky_serial', 1], ['cash', 6, 'vault'], ['perk', 'big_tank', 1], ['boost', 8, 2], ['perk', 'overclock', 1], ['perk', 'long_lunch', 1],
  ['cash', 4], ['perk', 'fat_margin', 1], ['perk', 'deep_pockets', 2], ['boost', 0, 5], ['perk', 'golden_teeth', 2], ['cash', 8, 'vault'], ['perk', 'fresh_ink', 2],
  ['perk', 'quick_count', 2], ['perk', 'spring_soles', 2], ['boost', 7, 2], ['perk', 'lucky_serial', 2], ['perk', 'big_tank', 2], ['perk', 'overclock', 2],
  ['perk', 'long_lunch', 2], ['perk', 'fat_margin', 2], ['cash', 15, 'handshake']];
// share per tier (G/TellerRules.c:169-194); stat from the prize text [inferred, PerkStat is static data]
export const PERK = { deep_pockets: [0.10, S.BagCapacity], golden_teeth: [0.10, S.ShredderSpeed], fresh_ink: [0.08, S.BillValue], quick_count: [0.15, S.DepositSpeed],
  spring_soles: [0.10, S.JumpHeight], lucky_serial: [0.25, S.LuckyChance], big_tank: [0.15, S.JetpackFuel], overclock: [0.10, S.DroneRate],
  long_lunch: [0.15, S.BoostDuration], fat_margin: [0.05, S.MoneyMultiplier] };
export const prize = (n) => n >= 1 && n <= 30 ? TRACK[n - 1] : ['cash', 5];
// hats (C/Hats.c): 0 none .. 10 wizard, 11 fat cat
export const HATS = [
  { id: 0, key: 'none' }, { id: 1, key: 'police', sprint: 1.05 }, { id: 2, key: 'viking', throw: 1.3 }, { id: 3, key: 'cowboy', orbReach: 2 },
  { id: 4, key: 'chef', pour: 1.08 }, { id: 5, key: 'cone', sneak: 1 }, { id: 6, key: 'crown', orbClick: 1.5 }, { id: 7, key: 'propeller', fall: 0.75 },
  { id: 8, key: 'pirate', jump: 1.08 }, { id: 9, key: 'miner', lamp: true }, { id: 10, key: 'wizard', flowFade: 0.7 }, { id: 11, key: 'gold' }];

const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const grid = (v, q) => Math.round(v / q) * q;
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x1000193); } return h >>> 0; }
function hashU(seed) { let h = (Math.imul(seed, 0x2c9277b5) + 0xac564b05) >>> 0; h = Math.imul((h >>> ((h >>> 28) + 4)) ^ h, 0x108ef2d9) >>> 0; return ((h ^ (h >>> 22)) & 0xffffff) * 2 ** -24; }

export class Finds {
  constructor(game) { this.g = game; this.reset(1); }
  reset(seed) {
    this.seed = seed >>> 0 || 1; this.items = []; this.carry = null; this.fed = 0; this.savedMinute = 0; this.ring = new Float64Array(30); this.ringI = 0; this.ringT = 0;
    this.lastShred = 0; this.pollT = 0; this.firstDone = false; this.hat = 0; this.chest = null; this.chestRetryAt = 0; this.lastTake = null; this.laid = false;
    this.auto = false;
  }
  get field() { return this.g.field; }
  // ---- world queries ----
  surface(x, z) { const c = this.field.cellOf(x, z); return c < 0 ? -Infinity : this.field.topY(c); }
  floor(x, z) { return rockFloor(x, -z); }
  // VaultLayout.FloorHeight: the current floor, lids of closed levels included
  levelFloor(x, z) { const c = this.field.cellOf(x, z); if (c < 0) return -Infinity; return this.field.floorHeightAt(c % NX, (c / NX) | 0); }
  blocked(x, z, clear = 1.5, fl = (a, b) => this.floor(a, b)) {
    const f = this.field, c = f.cellOf(x, z); if (c < 0 || f.noMoney[c] || f.ramp[c] >= 0) return true;
    const f0 = fl(x, z);
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, fx = fl(x + Math.cos(a) * clear, z + Math.sin(a) * clear); if (Math.abs(fx - f0) > 0.05) return true; }
    return false;
  }
  lobbyDist(x, z) { return Math.max(0, -z); }          // VaultLayout.LobbyDistance on level 1 ~ distance from the lobby wall (z = 0) [approx]
  // ---- placement (host, once per run) ----
  layStart() {
    if (this.laid) return; this.laid = true;
    this.items = this.items.filter(it => it.kind === 'crate');
    this.layRelics(); this.layNotes(GN.start, false);
  }
  layRelics() {
    const defs = (this.g.data.relics || []).slice().sort((a, b) => (a.minTier | 0) - (b.minTier | 0));
    const placed = [], span = Math.max(1, HALF - RELIC.wall), cx = OX + HALF, cz = -(OZ + HALF);
    defs.forEach((r, i) => {
      if (this.g.econ.relics.has(r.id)) return;
      const rng = mulberry(i * 0x1eef + this.seed * 0x1f + 0x65), t = clamp(r.minTier | 0, 0, 4);
      const bandHi = t === 0 ? 30 : tierMinHeight[t - 1], bandLo = tierMinHeight[t];
      let got = null;
      for (let a = 0; a < 600 && !got; a++) {
        const x = grid(cx + (2 * rng() - 1) * span, 0.25), z = grid(cz + (2 * rng() - 1) * span, 0.25);
        if (this.blocked(x, z)) continue;
        let lo = this.floor(x, z) + RELIC.lift, hi = this.surface(x, z) - RELIC.cover;
        if (a < 400) { lo = Math.max(lo, bandLo); hi = Math.min(hi, bandHi); }
        if (!(lo <= hi)) continue;
        const f = a < 500 ? 0.4 : 0;
        if (placed.some(p => Math.hypot(p[0] - x, p[2] - z) < RELIC.spacing * f)) continue;
        got = [x, lo + (hi - lo) * rng(), z];
      }
      if (got) { placed.push(got); this.items.push({ kind: 'relic', id: r.id, at: got, pos: got.slice(), state: 'buried', vy: 0 }); }
    });
  }
  layNotes(count, heap) {
    const span = Math.max(1, HALF - GN.wall), cx = OX + HALF, cz = -(OZ + HALF);
    const relics = this.items.filter(i => i.kind === 'relic'), base = this.items.filter(i => i.kind === 'note').length;
    for (let i = 0; i < count; i++) {
      const rng = mulberry(this.seed * 0x1f + 0x241 + (base + i) * 0x1eef);
      let got = null;
      for (let a = 0; a < 900 && !got; a++) {
        const x = grid((heap ? heap.x : cx) + (2 * rng() - 1) * (heap ? heap.r : span), 0.05), z = grid((heap ? heap.z : cz) + (2 * rng() - 1) * (heap ? heap.r : span), 0.05);
        if (this.blocked(x, z)) continue;
        let lo = this.floor(x, z) + GN.lift; const hi = this.surface(x, z) - GN.cover;
        if (!heap && base + i < GN.near && a < 500) { if (this.lobbyDist(x, z) >= GN.nearR) continue; lo = Math.max(lo, this.surface(x, z) - GN.nearCover); }
        if (heap) lo = Math.max(lo, heap.bottom);
        if (!(lo <= hi)) continue;
        const f = a < 400 ? 1 : a < 650 ? 0.6 : a < 800 ? 0.3 : 0;
        if (this.items.some(it => it.kind === 'note' && Math.hypot(it.at[0] - x, it.at[2] - z) < GN.spacing * f)) continue;
        if (relics.some(it => Math.hypot(it.at[0] - x, it.at[2] - z) < GN.findSpacing * f)) continue;
        got = [x, lo + (hi - lo) * rng(), z];
      }
      if (got) this.items.push({ kind: 'note', id: 'n' + (base + i), at: got, pos: got.slice(), state: 'buried', vy: 0 });
    }
  }
  // ---- coming out ----
  popOut(it, at) {
    const p = at || it.at, s = this.surface(p[0], p[2]);
    it.pos = [p[0], Math.max(Math.min(isFinite(s) ? s : p[1], p[1]), this.floor(p[0], p[2])) + 0.1, p[2]]; it.vy = GN.hop; it.state = 'loose';
    this.g.events.push({ type: 'findOut', kind: it.kind, id: it.id, pos: it.pos.slice() });
  }
  noteTaken(point) { this.lastTake = { at: point.slice(), t: this.g.time }; }
  poll() {
    const g = this.g, f = this.field;
    for (const it of this.items) {
      if (it.state !== 'buried') continue;
      const s = this.surface(it.at[0], it.at[2]);
      if (s - it.at[1] <= (it.kind === 'relic' ? RELIC.reveal : GN.reveal)) {
        this.popOut(it);
        if (it.kind === 'note') { this.firstDone = true; if (Math.hypot(it.pos[0] - g.player.pos[0], it.pos[2] - g.player.pos[2]) <= GN.toast) g.events.push({ type: 'toastKey', key: 'toast.golden_note.jackpot' }); }
      }
    }
    // FirstGoldenNote: forced out after 12-14 M notes were dug, at the last take point (if fresh)
    if (!this.firstDone && !this.items.some(i => i.kind === 'note' && i.state !== 'buried')) {
      const total = g.billsTotal(), taken = GN.firstMin + hashU(fnv('gold.map.' + this.seed)) * (GN.firstMax - GN.firstMin), th = Math.max(1, total - taken);
      if (total > 0 && g.vaultLeft() <= th && this.lastTake && g.time - this.lastTake.t <= GN.takeFresh) {
        const P = this.lastTake.at; let best = null, bd = Infinity;     // FirstOut choice UNKNOWN: nearest buried note
        for (const it of this.items) if (it.kind === 'note' && it.state === 'buried') { const d = Math.hypot(it.at[0] - P[0], it.at[2] - P[2]); if (d < bd) { bd = d; best = it; } }
        if (best) { this.firstDone = true; this.popOut(best, [P[0], P[1] + 0.2, P[2]]); g.events.push({ type: 'toastKey', key: 'toast.golden_note.jackpot' }); }
      }
    }
    // chest
    this.stepChestPoll();
  }
  // ---- carry ----
  aimItem(eye, dir) {
    let best = null, bd = CARRY.reach + 0.01;
    for (const it of this.items) {
      if (it.state !== 'loose') continue;
      const v = [it.pos[0] - eye[0], it.pos[1] + 0.1 - eye[1], it.pos[2] - eye[2]], t = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
      if (t < 0 || t > bd) continue;
      if (Math.hypot(v[0] - dir[0] * t, v[1] - dir[1] * t, v[2] - dir[2] * t) <= CARRY.aimR) { bd = t; best = it; }
    }
    return best;
  }
  nearItem(feet) { return this.items.find(it => it.state === 'loose' && Math.hypot(it.pos[0] - feet[0], it.pos[2] - feet[2]) <= CARRY.touch && Math.abs(it.pos[1] - feet[1]) < 1.6); }
  receiverNear(feet) {
    const m = this.g.markers, d = (p) => p ? Math.hypot(p[0] - feet[0], p[2] - feet[2]) : Infinity;
    if (!this.carry) return null;
    if (this.carry.kind === 'note' && d(m.teller) <= CARRY.give) return 'teller';
    if (this.carry.kind === 'relic' && d(m.relicBoard) <= CARRY.give) return 'board';
    if (this.g.nearShredder(feet)) return 'shredder';
    return null;
  }
  // interact pressed: returns true when it was used by the carry
  interact(eye, dir, feet) {
    const g = this.g;
    if (this.carry) {
      const r = this.receiverNear(feet), it = this.carry;
      if (r === 'teller') { this.carry = null; it.state = 'gone'; this.feed(); return true; }
      if (r === 'board') { this.carry = null; it.state = 'placed'; this.grantRelic(it.id); return true; }
      if (r === 'shredder') {
        if (it.kind === 'crate') { this.carry = null; it.state = 'gone'; g.events.push({ type: 'crateIn' }); g.vaultEvents.crateDelivered(); return true; }
        g.events.push({ type: 'toastKey', key: 'carry.nope' });           // the shredder spits it back
      }
      // drop in front (the throw button is UNKNOWN; Interact drops)
      this.carry = null; it.state = 'loose'; it.pos = [feet[0] + dir[0] * 0.9, feet[1] + 1.0, feet[2] + dir[2] * 0.9]; it.vy = 1.2;
      g.events.push({ type: 'carryDrop', kind: it.kind }); return true;
    }
    const it = this.aimItem(eye, dir) || this.nearItem(feet);
    if (!it) return false;
    if (it.state === 'held') return false;                 // someone else has it (first pick wins)
    it.state = 'held'; it.by = g.who | 0; this.carry = it; this.heldFor = 0; g.events.push({ type: 'carryPick', kind: it.kind, id: it.id });
    return true;
  }
  // Primary throws (intro.side.hands "{action:Primary} throws it"; CarryRules.MayThrow: held >= 0.2 s)
  throwCarry(eye, dir, vel) {
    const it = this.carry; if (!it || this.heldFor < CARRY.throwAfter) return false;
    const p = this.hatPerk('throw') || 1, v = vel || [0, 0, 0], vm = Math.hypot(v[0], v[1], v[2]), k = vm > CARRY.throwVel ? CARRY.throwVel / vm : 1;
    it.vel = [dir[0] * p * CARRY.throwK + v[0] * k, dir[1] * p * CARRY.throwK + CARRY.throwUp + v[1] * k, dir[2] * p * CARRY.throwK + v[2] * k];
    it.state = 'flying'; it.flyT = 0; this.carry = null; this.thrownNow = true; this.g.events.push({ type: 'carryThrow', kind: it.kind });
    return true;
  }
  // catch boxes: Gold Teller slot (notes), FINDS board face (relics), shredder intake (the Jackpot Crate)
  catchFlying(it) {
    const m = this.g.markers, p = it.pos;
    if (it.kind === 'note' && m.teller && Math.hypot(p[0] - (m.teller[0] + 1.14), p[1] - (m.teller[1] + 0.8), p[2] - m.teller[2]) <= CARRY.tellerCatch) { it.state = 'gone'; this.feed(); return true; }
    if (it.kind === 'relic' && m.relicBoard) { const b = CARRY.boardBox, c = [m.relicBoard[0] + b[0], m.relicBoard[1] + CARRY.boardFaceUp, m.relicBoard[2]];
      if (Math.abs(p[0] - c[0]) <= b[0] && Math.abs(p[1] - c[1]) <= b[1] && Math.abs(p[2] - c[2]) <= b[2]) { it.state = 'placed'; this.grantRelic(it.id); return true; } }
    if (it.kind === 'crate') { const ip = m.shredderIntake; if (Math.hypot(p[0] - ip[0], p[1] - ip[1], p[2] - ip[2]) <= 1.6) { it.state = 'gone'; this.g.events.push({ type: 'crateIn' }); this.g.vaultEvents.crateDelivered(); return true; } }
    return false;
  }
  // ---- Gold Teller ----
  bestMinute() { let best = 0; for (let i = 0; i < 30; i++) { let s = 0; for (let k = 0; k < 6; k++) s += this.ring[(i + k) % 30]; best = Math.max(best, s); } return best; }
  tellerCash(min) { let m = Math.max(60, this.bestMinute()); if (this.savedMinute > m) m = this.savedMinute; const ips = this.g.econ.dps || 0; if (ips * 60 > m) m = ips * 60; return Math.max(0, min) * m; }
  feed() {
    const g = this.g; this.fed++; g.econ.track('GoldenNotesFed');
    const p = prize(this.fed); let line = '';
    if (p[0] === 'cash') { const pay = this.tellerCash(p[1]); g.econ.add(pay, SRC.Reward); this.savedMinute = Math.max(this.savedMinute, this.bestMinute()); line = '+$' + pay; g.events.push({ type: 'tellerCash', pay, min: p[1], big: p[2] || '' }); }
    else if (p[0] === 'boost') { const d = g.data.content.boosts.find(b => b.kind === p[1]); g.econ.startBoost(p[1], p[2] * 60, d && d.basePower > 0 ? d.basePower : 2); }
    this.rebuildPerks();
    g.events.push({ type: 'tellerPrize', n: this.fed, prize: p });
  }
  perkTiers(perk, fed = this.fed) { let n = 0; for (let i = 0; i < Math.min(fed, 30); i++) if (TRACK[i][0] === 'perk' && TRACK[i][1] === perk) n++; return n; }
  rebuildPerks() {
    const mods = [];
    for (const k in PERK) { const t = this.perkTiers(k); if (t > 0) { mods.push({ stat: PERK[k][1], op: 1, value: PERK[k][0] * t }); if (k === 'spring_soles') mods.push({ stat: S.MoveSpeed, op: 1, value: 0.05 * t }); } }
    this.g.econ.tellerMods = mods; this.auto = this.fed > 3; this.g.econ.recalc();
  }
  // ---- relics ----
  grantRelic(id) {
    const g = this.g; if (g.econ.relics.has(id)) return;
    g.econ.relics.add(id); g.econ.recalc(); g.econ.track('RelicsFound');
    g.events.push({ type: 'relicFound', id, n: g.econ.relics.size, total: (g.data.relics || []).length });
  }
  relicState(r) {
    if (this.g.econ.relics.has(r.id)) return 'found';
    const it = this.items.find(i => i.kind === 'relic' && i.id === r.id);
    if (it && (it.state === 'loose' || it.state === 'held')) return 'out';
    const deepest = Math.max(0, ...this.g.field ? [this.deepestTier()] : [0]);
    return (r.minTier | 0) <= deepest ? 'hint' : 'deeper';
  }
  deepestTier() { return Math.max(0, Math.min(4, (this.g.field.level | 0) - 1)); }
  // ---- chests ----
  chestCurrent() { const f = this.g.flags; for (let n = 1; n <= 5; n++) if (!f.has(`chest.${n}.open`) && !f.has(`chest.${n}.at.none`)) return n; return 6; }
  chestTryLay(n, rng) {
    const open = this.g.field.level;
    if (n > 5 || (n !== 1 && open < n)) return null;
    const L = open > 5 ? n : Math.max(n, Math.min(open, 5)), half = HALF * OUTER[L - 1], floorY = FLOOR[L - 1], k = clamp(half / HALF, 0, 1);
    const lobbyMin = CHEST.lobby[0] * k, lobbyMax = Math.max(lobbyMin + 2, k * CHEST.lobby[1]), wall = Math.max(1.5, k * CHEST.wall), span = Math.max(1, half - wall);
    const cx = OX + HALF, cz = -(OZ + HALF), stairsMin = Math.max(2.5, k * 8);
    const ent = L > 1 ? RAMPS[L - 1] : null, entXZ = ent ? [ent.topX + ent.dir[0] * ent.length, -(ent.topZ + ent.dir[1] * ent.length)] : null;
    const rampD = (x, z) => { let d = Infinity; for (const r of RAMPS) { for (let s = 0; s <= 1; s += 0.25) d = Math.min(d, Math.hypot(x - (r.topX + r.dir[0] * r.length * s), -z - (r.topZ + r.dir[1] * r.length * s))); } return d; };
    const foot = (fn, x, z, m) => { let lo = Infinity, hi = -Infinity; for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) { const v = fn(x + dx * (CHEST.hw + m), z + dz * (CHEST.hd + m)); lo = Math.min(lo, v); hi = Math.max(hi, v); } return { lo, hi }; };
    for (let a = 0; a < 1200; a++) {
      const x = grid(cx + (2 * rng() - 1) * span, 0.25), z = grid(cz + (2 * rng() - 1) * span, 0.25), yaw = Math.round(rng() * 360);
      if (this.blocked(x, z, 1.5, (a, b) => this.levelFloor(a, b))) continue;
      const ld = L === 1 ? this.lobbyDist(x, z) : Math.hypot(x - entXZ[0], z - entXZ[1]);
      if (ld < lobbyMin || (a < 700 && ld > lobbyMax)) continue;
      if (rampD(x, z) < stairsMin) continue;
      const F = foot((x1, z1) => this.levelFloor(x1, z1), x, z, 0.25), M = foot((x1, z1) => this.surface(x1, z1), x, z, 0.25);
      if (F.hi - F.lo > 0.05 || (open <= 5 && Math.abs(F.hi - floorY) > 0.05) || (a < 700 && M.hi - M.lo > CHEST.flat)) continue;
      const need = a < 700 ? CHEST.h + CHEST.cover : a < 1000 ? 0.8 * CHEST.h : 0.4 * CHEST.h;
      if (need <= M.lo - F.hi) return { x, y: F.hi, z, yaw, L };
    }
    return n === 1 ? 'none' : 'retry';
  }
  chestCover(c) {
    let rim = -Infinity, fl = -Infinity;
    for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
      rim = Math.max(rim, this.surface(c.x + dx * (CHEST.hw + 0.25), c.z + dz * (CHEST.hd + 0.25)));
      fl = Math.max(fl, this.levelFloor(c.x + dx * CHEST.hw, c.z + dz * CHEST.hd));
    }
    const b = Math.max(fl, Math.min(c.y, rim)); return { bottom: b, cover: Math.max(0, rim - b) };
  }
  stepChestPoll() {
    const g = this.g, n = this.chestCurrent();
    if (!this.chest || this.chest.n !== n) {
      if (this.chest && ['opening', 'open', 'leaving'].includes(this.chest.state)) return;
      this.chest = null;
      if (n > 5 || g.time < this.chestRetryAt) return;
      const atKey = [...g.flags].find(k => k.startsWith(`chest.${n}.at.`) && !k.endsWith('.none'));
      let at = null;
      if (atKey) { const p = atKey.split('.').slice(3).map(Number); at = { x: p[0] / 100, y: p[1] / 100, z: p[2] / 100, yaw: p[3] }; }
      else {
        const r = this.chestTryLay(n, mulberry(this.seed * 0x19919 ^ n * 0x1eef ^ Math.floor(g.time)));
        if (r === 'none') { g.flags.add(`chest.${n}.at.none`); return; }
        if (!r || r === 'retry') { this.chestRetryAt = g.time + CHEST.retry; return; }
        at = r; g.flags.add(`chest.${n}.at.${Math.round(r.x * 100)}.${Math.round(r.y * 100)}.${Math.round(r.z * 100)}.${r.yaw}`);
      }
      this.chest = { n, ...at, state: 'buried', cover: 1, exposed: 0, t: 0, quiet: true, curY: at.y };
    }
    const c = this.chest; if (!['buried', 'ready'].includes(c.state)) return;
    const cv = this.chestCover(c); c.cover = cv.cover; c.targetY = cv.bottom;
    c.exposed = clamp(1 - (cv.cover - 0.14) / Math.max(0.01, CHEST.h - 0.14), 0, 1);
    if (c.state === 'buried' && cv.cover <= CHEST.openBelow) { c.state = 'ready'; if (!c.quiet) g.events.push({ type: 'chestUncover', pos: [c.x, c.y + CHEST.h, c.z] }); }
    else if (c.state === 'ready' && cv.cover >= CHEST.buryAbove) c.state = 'buried';
    c.quiet = false;
    const P = g.player.pos;
    if (!g.flags.has(`hud.chest.${n}.hint`) && Math.hypot(P[0] - c.x, P[2] - c.z) <= CHEST.hint) { g.flags.add(`hud.chest.${n}.hint`); g.events.push({ type: 'toastKey', key: 'toast.chest_hint' }); }
  }
  aimChest(eye, dir) {
    const c = this.chest; if (!c || c.state !== 'ready') return false;
    const p = [c.x, c.curY + CHEST.h * 0.5, c.z], v = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]], t = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
    return t >= 0 && t <= CHEST.reach && Math.hypot(v[0] - dir[0] * t, v[1] - dir[1] * t, v[2] - dir[2] * t) <= CHEST.aimR + 0.5;
  }
  openChest() {
    const g = this.g, c = this.chest, n = c.n;
    g.flags.add(`chest.${n}.open`); c.state = 'opening'; c.t = 0;
    let cash = Math.floor(Math.min(Math.max(CHEST.least, CHEST.shares[n - 1] * Math.max(0, g.econ.lifetime)), 9e15));
    const st = g.stat(S.ChestCash), mult = !(st > 0) || !isFinite(st) ? 1 : clamp(st, 1, 2);
    cash = Math.floor(Math.min(cash * mult, 9e15));
    g.econ.add(cash, SRC.Reward); g.flags.add(`chest.${n}.paid.${cash}`); g.econ.track('ChestsOpened');
    g.events.push({ type: 'chestOpen', n, cash, pos: [c.x, c.y + CHEST.h, c.z] });
  }
  hatOk(id) { const f = this.g.flags; return id === 0 || (id <= 10 ? f.has('chest.1.open') : id === 11 && f.has('chest.5.open')); }
  hatPerk(k) { const h = HATS[this.hat]; return h && h[k] != null ? h[k] : null; }
  // ---- per frame ----
  // inp: {eye, dir, feet, interactPressed}; returns true when interact was consumed
  step(dt, inp) {
    const g = this.g; this.thrownNow = false;
    if (!this.laid) this.layStart();
    // income ring: 30 buckets x 10 s, fed with shredded dollars
    const shred = g.econ.shredTotal || 0, dShred = shred - this.lastShred; this.lastShred = shred;
    if (dShred > 0) this.ring[this.ringI] += dShred;
    this.ringT += dt; if (this.ringT >= 10) { this.ringT -= 10; this.ringI = (this.ringI + 1) % 30; this.ring[this.ringI] = 0; }
    this.pollT -= dt; if (this.pollT <= 0) { this.pollT = CHEST.poll; this.poll(); }
    // loose items settle on the surface
    for (const it of this.items) {
      if (it.state === 'loose') {
        const s = this.surface(it.pos[0], it.pos[2]), fl = this.floor(it.pos[0], it.pos[2]), ground = Math.max(isFinite(s) ? s : fl, fl) + 0.05;
        it.vy -= 9.81 * dt; it.pos[1] += it.vy * dt; if (it.pos[1] <= ground) { it.pos[1] = ground; it.vy = 0; }
      } else if (it.state === 'flying') {
        if (!it.vel) it.vel = [0, 0, 0];
        it.flyT += dt; it.vel[1] -= 9.81 * dt; for (let k = 0; k < 3; k++) it.pos[k] += it.vel[k] * dt;
        if (this.catchFlying(it)) continue;
        const s = this.surface(it.pos[0], it.pos[2]), fl = this.floor(it.pos[0], it.pos[2]), ground = Math.max(isFinite(s) ? s : fl, fl, it.pos[2] > 0 ? 3.0 : -Infinity) + 0.05;
        if (it.pos[1] <= ground || it.flyT > 6) { it.pos[1] = Math.max(it.pos[1], ground); it.state = 'loose'; it.vy = 0; }
      } else if (it.state === 'held' && inp.eye && !it.by) this.holdAt(it, inp.eye, inp.dir);   // a guest's item follows that guest (input)
    }
    // chest animation
    const c = this.chest;
    if (c) {
      c.t += dt;
      if (c.state === 'buried' || c.state === 'ready') { const ty = c.targetY ?? c.y; c.curY += clamp(ty - c.curY, -1.4 * dt, 1.4 * dt); }
      else if (c.state === 'opening' && c.t >= CHEST.squat + CHEST.lid) { c.state = 'open'; c.t = 0; g.events.push({ type: 'chestPop', n: c.n, pos: [c.x, c.curY + CHEST.h, c.z] }); }
      else if (c.state === 'open' && c.t >= Math.max(2.5, CHEST.show[c.n - 1])) { c.state = 'leaving'; c.t = 0; }
      else if (c.state === 'leaving' && c.t >= CHEST.leave) { c.state = 'gone'; this.chest = null; }
    }
    return this.input(dt, inp, true);
  }
  // held in the right hand, low right of the view (f20); right = forward x up
  holdAt(it, e, d) { const rl = Math.hypot(d[0], d[2]) || 1, rx = -d[2] / rl, rz = d[0] / rl; it.pos = [e[0] + d[0] * 0.62 + rx * 0.24, e[1] - 0.3 + d[1] * 0.4, e[2] + d[2] * 0.62 + rz * 0.24]; }
  // one player's carry: hold time, throw, pick / give / drop (a co-op guest's seat runs only this part)
  input(dt, inp, host = false) {
    if (!host) this.thrownNow = false;
    if (this.carry && !host && inp.eye) this.holdAt(this.carry, inp.eye, inp.dir);
    if (this.carry) this.heldFor = (this.heldFor || 0) + dt;
    if (this.carry && inp.primaryPressed && inp.eye && this.throwCarry(inp.eye, inp.dir, inp.vel)) return true;
    if (inp.interactPressed && inp.eye) {
      if (!this.carry && this.aimChest(inp.eye, inp.dir)) { this.openChest(); return true; }
      if (this.carry || this.aimItem(inp.eye, inp.dir) || this.nearItem(inp.feet)) return this.interact(inp.eye, inp.dir, inp.feet);
    }
    return false;
  }
  // money delivery: 6 more golden notes inside the new heap
  layDelivery(heap) { this.layNotes(GN.delivery, heap); }
  save() {
    return { seed: this.seed, fed: this.fed, sm: this.savedMinute, hat: this.hat, first: this.firstDone,
      items: this.items.filter(i => i.kind !== 'crate').map(i => ({ k: i.kind, id: i.id, at: i.at, st: i.state === 'held' || i.state === 'flying' ? 'loose' : i.state, p: i.pos })) };
  }
  load(s) {
    this.reset(s && s.seed || 1); if (!s) return;
    this.fed = s.fed | 0; this.savedMinute = s.sm || 0; this.hat = s.hat | 0; this.firstDone = !!s.first; this.laid = true;
    this.items = (s.items || []).map(i => ({ kind: i.k, id: i.id, at: i.at, state: i.st, pos: i.p || i.at.slice(), vy: 0 }));
    this.rebuildPerks();
  }
}
