// The money pile: Game.World.Pile.MoneyField / FieldOps / PileSlump / VaultLevels, ported from rules/pile.md.
// Internally everything is in Unity space (x, uz) with uz = -z_three. Public helpers that take world
// positions take three.js coordinates (x, y, z) and flip z.
export const CELL = 0.5, NX = 144, NZ = 144, OX = -36, OZ = 0;
export const T = 0.000319;                       // bal.itemThickness: metres per note
export const HALF = 36, CXH = 0, CZH = 36;
export const OUTER = [1.0, 0.8472222, 0.6527778, 0.45833334, 0.2777778];
export const INNER = [0.8472222, 0.6527778, 0.45833334, 0.2777778, 0.0];
export const FLOOR = [-2, -9, -17, -26, -36];
const RAMP_SIDE = [3, 0, 1, 2, 3], RAMP_SLOPE = 0.65, RAMP_W = 2.6;
const SIDES = [[[1, 0], [0, 1]], [[0, 1], [-1, 0]], [[-1, 0], [0, -1]], [[0, -1], [1, 0]]];
export const MAX_COLUMN = 1048575;
const LEVEL_TOL = 0.45;

export const roundHE = (v) => { const r = Math.round(v); return (Math.abs(v % 1) === 0.5 && r % 2 !== 0) ? r - 1 : r; };
const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;

// PileMath.Hash (uint32)
export function hash3(a, b, c) {
  let h = (Math.imul(c | 0, 0xC2B2AE3D) ^ Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA77)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297A2D39) >>> 0;
  return ((h ^ (h >>> 15)) | 1) >>> 0;
}
function valueNoiseQ(x, z, period, salt) {
  const ix = Math.floor(x / period), iz = Math.floor(z / period);
  const fx = (x - ix * period) / period, fz = (z - iz * period) / period;
  const n = (a, b) => (hash3(a, b, salt) & 0xFFFE) | 1;
  const a = n(ix, iz) + (n(ix + 1, iz) - n(ix, iz)) * fx;
  const b = n(ix, iz + 1) + (n(ix + 1, iz + 1) - n(ix, iz + 1)) * fx;
  return a + (b - a) * fz;
}

// ---------------- vault layout (VaultLayout BigShape) ----------------
const D = (x, z) => Math.max(Math.abs(x - CXH), Math.abs(z - CZH)) / HALF;
export function terraceAt(x, z) { const d = D(x, z); for (let i = 0; i < INNER.length; i++) if (INNER[i] <= d) return i; return INNER.length - 1; }
function getRamp(k) {
  const [s, dir] = SIDES[RAMP_SIDE[k]];
  const topY = k === 0 ? 3.0 : FLOOR[k - 1], bottomY = FLOOR[k];
  const length = (topY - bottomY) / RAMP_SLOPE, r = OUTER[k] * HALF - 1.3;
  return { k, topX: s[0] * r + CXH - length * 0.5 * dir[0], topZ: s[1] * r + CZH - length * 0.5 * dir[1], dir, inward: [-s[0], -s[1]], length, width: RAMP_W, topY, bottomY };
}
export const RAMPS = [0, 1, 2, 3, 4].map(getRamp);
export function rockFloor(x, z) {
  let f = FLOOR[terraceAt(x, z)];
  for (const r of RAMPS) {
    const dx = x - r.topX, dz = z - r.topZ;
    const a = dx * r.dir[0] + dz * r.dir[1], lat = dx * r.inward[0] + dz * r.inward[1];
    if (a >= 0 && a <= r.length && Math.abs(lat) <= r.width * 0.5) f = Math.max(f, r.topY + (r.bottomY - r.topY) * clamp01(a / r.length));
  }
  return f;
}
export function inRamp(x, z, k, pad = 0) {
  const r = RAMPS[k]; const dx = x - r.topX, dz = z - r.topZ;
  const a = dx * r.dir[0] + dz * r.dir[1], lat = dx * r.inward[0] + dz * r.inward[1];
  return a >= -pad && a <= r.length + pad && Math.abs(lat) <= r.width * 0.5 + pad;
}
export const KEY_POINT = [0, -36, 43.5];     // unity space
export const tierMinHeight = [-2, -9, -17, -26, -Infinity];

// ---------------- the field ----------------
export class MoneyField {
  constructor(initial /* Int32Array NX*NZ settled counts from rock floor */, opts = {}) {
    const n = NX * NZ;
    this.n = n;
    this.floorReal = new Float32Array(n);
    this.floorQReal = new Int32Array(n);
    this.floorQ = new Int32Array(n);
    this.count = new Int32Array(n);
    this.initial = initial;
    this.noMoney = new Uint8Array(n);
    this.ramp = new Int8Array(n).fill(-1);
    for (let cz = 0; cz < NZ; cz++) for (let cx = 0; cx < NX; cx++) {
      const c = cz * NX + cx, x = (cx + 0.5) * CELL + OX, z = (cz + 0.5) * CELL + OZ;
      const f = rockFloor(x, z);
      this.floorReal[c] = f; this.floorQReal[c] = roundHE(f / T);
      for (let k = 0; k < 5; k++) if (inRamp(x, z, k, 0.5)) { this.ramp[c] = k; break; }
    }
    for (const c of opts.footprint || []) this.noMoney[c] = 1;
    this.tierMinQ = tierMinHeight.slice(0, 4).map(h => Math.ceil(h / T - 1e-4));
    this.giltMask = new Uint8Array(n); this.giltPatches = []; this.giltLeft = [0, 0, 0, 0, 0, 0];
    this.level = 1;
    this.revealed = 0;
    this.dirty = new Set();           // dirty render chunks (16x16 cells)
    this.salt = 0x1234567;
    this.tick = 0;
    this.slumpActive = new Uint8Array(18 * 18);   // 8x8 tiles
    this.slumpNext = new Uint8Array(18 * 18);
    this.lastMove = new Int32Array(n).fill(-1000);
    this.prevMove = new Int32Array(n).fill(-1000);
    this.buildTalus();
    this.resetToLevel(1);
  }

  // talus tables (PileSlump per-cell, in notes*256 per orthogonal step)
  buildTalus() {
    const n = this.n, k = CELL * 256 / T;
    this.talusS = new Float64Array(n); this.talusD = new Float64Array(n);
    const period = Math.round(1.5 / CELL);
    for (let cz = 0; cz < NZ; cz++) for (let cx = 0; cx < NX; cx++) {
      const c = cz * NX + cx;
      const n1 = clamp01(valueNoiseQ(cx, cz, period, this.salt ^ 0x7A1) / 65535), n2 = clamp01(valueNoiseQ(cx, cz, period, this.salt ^ 0x7A2) / 65535);
      let start = 38 + (41 - 38) * n1, stop = 34.5 + (36.5 - 34.5) * n2;
      if (this.ramp[c] >= 0 && (this.ramp[c] < 1 || this.level >= this.ramp[c] + 1)) { start = Math.max(start, 40); stop = Math.max(stop, 37); }
      stop = Math.min(stop, start);
      this.talusS[c] = roundHE(Math.tan(start * Math.PI / 180) * k);
      this.talusD[c] = roundHE(Math.tan(stop * Math.PI / 180) * k);
    }
  }

  // VaultLevels: lid for the current level
  lid() {
    if (this.level >= 5) return null;
    return { y: FLOOR[this.level - 1], half: INNER[this.level - 1] * HALF };
  }
  floorHeightAt(cx, cz) {
    const c = cz * NX + cx, f = this.floorReal[c], L = this.lid();
    if (!L) return f;
    const x = (cx + 0.5) * CELL + OX, z = (cz + 0.5) * CELL + OZ;
    if (Math.abs(x - CXH) < L.half && Math.abs(z - CZH) < L.half && f <= L.y) return L.y;
    return f;
  }
  // ResetWithFloors: new game or refill at a level
  resetToLevel(level) {
    this.level = level; this.levelSeq = (this.levelSeq || 0) + 1;   // co-op: a new floor layout goes out as a full pile
    for (let cz = 0; cz < NZ; cz++) for (let cx = 0; cx < NX; cx++) {
      const c = cz * NX + cx;
      let q = roundHE(this.floorHeightAt(cx, cz) / T);
      if (q > this.floorQReal[c]) q = Math.min(q, this.floorQReal[c] + this.initial[c]); else q = this.floorQReal[c];
      this.floorQ[c] = q;
      this.count[c] = this.noMoney[c] ? 0 : Math.max(0, this.initial[c] + this.floorQReal[c] - q);
    }
    this.buildTalus();
    this.recount();
    this.markAll();
    this.buildGilt(level * 7919 + 0x1A2B);   // GiltNewSeed is random in the original; a per-level seed keeps runs reproducible
  }
  recount() {
    let items = 0, hidden = 0;
    for (let c = 0; c < this.n; c++) { items += this.count[c]; hidden += this.floorQ[c] - this.floorQReal[c]; }
    this.visible = items; this.hidden = hidden;
  }
  get items() { return this.visible + this.hidden; }          // notes left in the vault
  get levelNotes() { return this.visible; }

  // OpenLevel: drop the next lid, hidden notes reappear on top of the lowered floor
  openLevel(level) {
    const old = Int32Array.from(this.floorQ);
    this.level = level; this.levelSeq = (this.levelSeq || 0) + 1;
    for (let cz = 0; cz < NZ; cz++) for (let cx = 0; cx < NX; cx++) {
      const c = cz * NX + cx;
      let q = roundHE(this.floorHeightAt(cx, cz) / T);
      if (q > this.floorQReal[c]) q = Math.min(q, old[c]); else q = this.floorQReal[c];
      if (q < old[c]) { this.count[c] += old[c] - q; this.floorQ[c] = q; }
    }
    this.buildTalus();
    this.recount();
    this.wakeAll();
    this.markAll();
    this.buildGilt(level * 7919 + 0x1A2B);
  }

  // ----- column helpers -----
  heightQ(c) { return this.floorQ[c] + this.count[c]; }
  topY(c) { return (this.floorQ[c] + this.count[c]) * T; }
  tierAtQ(q) { for (let i = 0; i < 4; i++) if (this.tierMinQ[i] <= q) return i; return 4; }
  // notes in altitude range (lo, hi] by tier, added into tally
  tallyRange(lo, hi, tally) {
    // tiers: t0 q >= m0 ; t1 m1<=q<m0 ...
    const m = this.tierMinQ;
    let top = hi;
    for (let t = 0; t < 5 && top > lo; t++) {
      const floorT = t < 4 ? m[t] - 1 : -Infinity;     // notes q > floorT belong to tier <= t
      const bottom = Math.max(lo, floorT);
      if (top > bottom) { tally[t] += top - bottom; top = bottom; }
    }
  }
  removeTop(c, n, tally) {
    const k = Math.min(n, this.count[c]);
    if (k <= 0) return 0;
    const h = this.heightQ(c);
    if (tally) this.tallyRange(h - k, h, tally);
    this.count[c] -= k;
    if (this.giltMask[c] && tally && tally.gilt != null) {
      const p = this.giltMask[c] - 1, g = Math.min(k, this.giltLeft[p]);
      if (g > 0) { this.giltLeft[p] -= g; tally.gilt += g; if (this.giltLeft[p] <= 0) { this.giltCells(this.giltPatches[p], (cc) => { this.giltMask[cc] = 0; }); this.spentGilt = (this.spentGilt || 0) | (1 << p); } }
    }
    return k;
  }
  addTop(c, n) { this.count[c] += n; }
  surfaceTier(c) { return this.count[c] > 0 ? this.tierAtQ(this.heightQ(c)) : -1; }

  cellOf(x, zThree) {
    const uz = -zThree;
    const cx = Math.floor((x - OX) / CELL), cz = Math.floor((uz - OZ) / CELL);
    if (cx < 0 || cz < 0 || cx >= NX || cz >= NZ) return -1;
    return cz * NX + cx;
  }
  // surface height (three coords) for walking: money top, or the level lid when the column is empty.
  // Bilinear only between cells on the same floor (terrace walls stay walls). -Infinity outside the grid.
  heightAt(x, zThree) {
    const uz = -zThree;
    const gx = (x - OX) / CELL - 0.5, gz = (uz - OZ) / CELL - 0.5;
    if (gx < -0.5 || gz < -0.5 || gx > NX - 0.5 || gz > NZ - 0.5) return -Infinity;
    const oc = Math.max(0, Math.min(NX - 1, Math.round(gx))), oz = Math.max(0, Math.min(NZ - 1, Math.round(gz)));
    const own = oz * NX + oc;
    if (this.noMoney[own]) return -Infinity;
    const h0 = this.heightQ(own) * T;
    const tol = LEVEL_TOL / T;
    const x0 = Math.max(0, Math.min(NX - 2, Math.floor(gx))), z0 = Math.max(0, Math.min(NZ - 2, Math.floor(gz)));
    const fx = clamp01(gx - x0), fz = clamp01(gz - z0);
    const h = (cx, cz) => { const c = cz * NX + cx; return (Math.abs(this.floorQ[c] - this.floorQ[own]) > tol || this.noMoney[c]) ? h0 : this.heightQ(c) * T; };
    return (h(x0, z0) * (1 - fx) + h(x0 + 1, z0) * fx) * (1 - fz) + (h(x0, z0 + 1) * (1 - fx) + h(x0 + 1, z0 + 1) * fx) * fz;
  }
  hasMoney(x, zThree) { const c = this.cellOf(x, zThree); return c >= 0 && this.count[c] > 0; }

  // ----- taking (MoneyField.PlanTake, simplified fixed point to floating point) -----
  // profile: {cone (m depth per m), bowl (m per m^2)}; returns notes taken; tally gets per-tier counts
  // ----- gilt patches (rules/drop2.md §E1): 6 discs per level whose notes pay double -----
  // Placement here: deterministic hash order over cells at least `need` deep, patches kept apart; the original's
  // exact candidate rule (pile.md §7) is approximated. Budget, radius and the 60 % fill follow the recovered numbers.
  buildGilt(seed) {
    this.giltMask.fill(0); this.giltLeft = [0, 0, 0, 0, 0, 0]; this.giltPatches = [];
    const budget = Math.max(0, Math.floor(this.visible * 19 / 6000));
    const cols = Math.max(1, Math.floor(budget / Math.max(1, roundHE(2.5 / T))));
    const r = Math.sqrt(Math.max(2601, Math.min(20736, Math.floor(cols * 28928 / 355)))) / 16;   // in cells
    const need = Math.max(1, roundHE(3 / T));
    const cand = []; for (let c = 0; c < this.n; c++) if (this.count[c] >= need && !this.noMoney[c]) cand.push(c);
    cand.sort((a, b) => (hash3(a, seed, 0x611D) >>> 0) - (hash3(b, seed, 0x611D) >>> 0));
    for (const c of cand) {
      if (this.giltPatches.length >= 6) break;
      const cx = c % NX, cz = (c / NX) | 0;
      if (this.giltPatches.some(p => Math.hypot(p.cx - cx, p.cz - cz) < 2 * r + 4)) continue;
      this.giltPatches.push({ cx, cz, r });
    }
    this.giltPatches.forEach((p, i) => { let content = 0; this.giltCells(p, (c) => { this.giltMask[c] = i + 1; content += this.count[c]; }); this.giltLeft[i] = Math.min(budget, Math.floor(content * 0.6)); });
  }
  giltCells(p, fn) {
    const R = Math.ceil(p.r);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > p.r * p.r) continue;
      const x = p.cx + dx, z = p.cz + dz; if (x < 0 || z < 0 || x >= NX || z >= NZ) continue;
      fn(z * NX + x);
    }
  }
  take(x, zThree, radius, maxNotes, profile, tally) {
    if (tally && tally.gilt == null) tally.gilt = 0;
    if (maxNotes < 1) return 0;
    const uz = -zThree;
    const r = Math.min(radius < CELL * 0.75 ? CELL * 0.75 : radius, 16);
    const gcx = (x - OX) / CELL, gcz = (uz - OZ) / CELL, rc = r / CELL;
    const cells = [], offs = [];
    const x0 = Math.max(0, Math.floor(gcx - rc - 1)), x1 = Math.min(NX - 1, Math.ceil(gcx + rc + 1));
    const z0 = Math.max(0, Math.floor(gcz - rc - 1)), z1 = Math.min(NZ - 1, Math.ceil(gcz + rc + 1));
    // slope plane along the local surface gradient (notes per cell)
    const ccx = Math.max(0, Math.min(NX - 1, Math.floor(gcx))), ccz = Math.max(0, Math.min(NZ - 1, Math.floor(gcz)));
    const gx = this.gradient(ccx, ccz, 1, 0), gz = this.gradient(ccx, ccz, 0, 1);
    const coneK = CELL * (profile.cone || 0) / T, bowlK = CELL * CELL * (profile.bowl || 0) / T;
    let hi = -Infinity, lo = Infinity;
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const dx = ix + 0.5 - gcx, dz = iz + 0.5 - gcz, d2 = dx * dx + dz * dz;
      if (d2 > rc * rc) continue;
      const c = iz * NX + ix;
      if (this.count[c] <= 0) continue;
      const off = Math.sqrt(d2) * coneK + d2 * bowlK + dz * gz + dx * gx;
      cells.push(c); offs.push(off);
      hi = Math.max(hi, this.heightQ(c) - off); lo = Math.min(lo, this.floorQ[c] - off - 1);
    }
    if (!cells.length) return 0;
    const above = (L) => { let s = 0; for (let i = 0; i < cells.length; i++) { const cut = Math.floor(L + offs[i]); const c = cells[i]; s += Math.max(0, Math.min(this.count[c], this.heightQ(c) - cut)); } return s; };
    let a = Math.floor(lo), b = Math.ceil(hi);
    while (a < b) { const mid = Math.floor((a + b) / 2); if (above(mid) <= maxNotes) b = mid; else a = mid + 1; }
    let taken = 0;
    const take = cells.map((c, i) => Math.max(0, Math.min(this.count[c], this.heightQ(c) - Math.floor(a + offs[i]))));
    let sum = take.reduce((p, q) => p + q, 0);
    if (sum < maxNotes && a > lo) {
      for (let i = 0; i < cells.length && sum < maxNotes; i++) {
        const c = cells[i];
        const more = Math.max(0, Math.min(this.count[c], this.heightQ(c) - Math.floor(a - 1 + offs[i]))) - take[i];
        const k = Math.min(more, maxNotes - sum); take[i] += k; sum += k;
      }
    }
    let bx0 = NX, bx1 = -1, bz0 = NZ, bz1 = -1;
    for (let i = 0; i < cells.length; i++) {
      if (take[i] <= 0) continue;
      const c = cells[i];
      taken += this.removeTop(c, take[i], tally);
      const cx = c % NX, cz = (c / NX) | 0;
      bx0 = Math.min(bx0, cx); bx1 = Math.max(bx1, cx); bz0 = Math.min(bz0, cz); bz1 = Math.max(bz1, cz);
    }
    if (taken > 0) { this.visible -= taken; this.edited(bx0, bz0, bx1, bz1); }
    return taken;
  }
  // single top note at a cell (hand aimed pick)
  takeOne(c, tally) {
    if (tally && tally.gilt == null) tally.gilt = 0;
    if (c < 0 || this.count[c] <= 0) return 0;
    const k = this.removeTop(c, 1, tally);
    this.visible -= k;
    const cx = c % NX, cz = (c / NX) | 0;
    this.edited(cx, cz, cx, cz);
    return k;
  }
  gradient(cx, cz, ax, az) {
    const c = cz * NX + cx; const hc = this.heightQ(c); let s = 0, used = 0;
    const tol = LEVEL_TOL / T;
    const side = (sx, sz, sign) => {
      const nx = cx + sx, nz = cz + sz;
      if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) return hc;
      const n = nz * NX + nx;
      if (this.count[n] <= 0 || Math.abs(this.floorQ[n] - this.floorQ[c]) > tol) return hc;
      used++; return this.heightQ(n);
    };
    const p = side(ax, az), m = side(-ax, -az);
    if (!used) return 0;
    return (p - m) / 2;
  }
  // return notes (e.g. a dropped bag) onto the pile around a point
  give(x, zThree, notes) {
    const c = this.cellOf(x, zThree);
    if (c < 0 || notes <= 0) return 0;
    this.addTop(c, notes); this.visible += notes;
    const cx = c % NX, cz = (c / NX) | 0;
    this.edited(cx, cz, cx, cz);
    return notes;
  }

  edited(x0, z0, x1, z1) {
    for (let cz = Math.floor((z0 - 1) / 16); cz <= Math.floor((z1 + 1) / 16); cz++)
      for (let cx = Math.floor((x0 - 1) / 16); cx <= Math.floor((x1 + 1) / 16); cx++)
        if (cx >= 0 && cz >= 0 && cx < 9 && cz < 9) this.dirty.add(cz * 9 + cx);
    this.wake(x0 - 2, z0 - 2, x1 + 2, z1 + 2);
  }
  markAll() { for (let i = 0; i < 81; i++) this.dirty.add(i); }
  wake(x0, z0, x1, z1) {
    for (let tz = Math.max(0, Math.floor(z0 / 8)); tz <= Math.min(17, Math.floor(z1 / 8)); tz++)
      for (let tx = Math.max(0, Math.floor(x0 / 8)); tx <= Math.min(17, Math.floor(x1 / 8)); tx++) this.slumpActive[tz * 18 + tx] = 1;
  }
  wakeAll() { this.slumpActive.fill(1); }
  get slumping() { for (let i = 0; i < this.slumpActive.length; i++) if (this.slumpActive[i]) return true; return false; }

  // ----- slump (PileSlump tick) -----
  slumpTick(budget = 64) {
    const act = [];
    for (let i = 0; i < 324; i++) if (this.slumpActive[i]) act.push(i);
    if (!act.length) return 0;
    const n = Math.min(budget, act.length);
    const start = budget < act.length ? (budget * this.tick) % act.length : 0;
    const window = Math.ceil(act.length / budget) * 3;
    const colours = [...Array(25).keys()];
    for (let b = 24; b > 0; b--) { const j = hash3(this.tick, b, 0x9E37) % (b + 1); const t = colours[b]; colours[b] = colours[j]; colours[j] = t; }
    this.slumpNext.fill(0);
    let moved = 0;
    const processed = [];
    for (let i = 0; i < n; i++) processed.push(act[(start + i) % act.length]);
    this._window = window;
    for (const col of colours) {
      const mx = col % 5, mz = (col / 5) | 0;
      for (const tile of processed) {
        const tx = tile % 18, tz = (tile / 18) | 0;
        for (let z = tz * 8; z < tz * 8 + 8 && z < NZ; z++) {
          if (((z % 5) + 5) % 5 !== mz) continue;
          for (let x = tx * 8; x < tx * 8 + 8 && x < NX; x++) {
            if (x % 5 !== mx) continue;
            moved += this.process(x, z);
          }
        }
      }
    }
    for (const tile of processed) this.slumpActive[tile] = 0;
    for (let i = 0; i < 324; i++) if (this.slumpNext[i]) this.slumpActive[i] = 1;
    this.tick++;
    return moved;
  }
  recent(c) { const t = this.tick, w = this._window || 3; return (this.lastMove[c] >= t - w && this.lastMove[c] < t + 1) || (this.prevMove[c] >= t - w); }
  process(x, z) {
    const c = z * NX + x;
    if (this.count[c] < 1) return 0;
    let moving = this.recent(c);
    if (!moving) for (let d = 0; d < 4 && !moving; d++) { const n = this.nb(x, z, d); if (n >= 0 && this.recent(n)) moving = true; }
    const tal = moving ? this.talusD[c] : this.talusS[c];
    let total = 0, batch = 0, limit = 0;
    for (; ;) {
      let best = -1, bestEx = 0;
      const h = this.heightQ(c);
      for (let d = 0; d < 16; d++) {
        const nI = this.edge(x, z, d); if (nI < 0) continue;
        let ex = (h - this.heightQ(nI)) * 256 - ((DLEN[d] * tal) / 256);
        if (ex > 0) { ex += hash3(c, this.tick * 64 + batch, d) & 63; if (ex > bestEx) { bestEx = ex; best = nI; } }
      }
      if (best < 0) return total;
      if (batch === 0) limit = Math.max(1, Math.min(752, Math.floor(((bestEx / 256) + 2) / 3)));
      const m = Math.min(Math.max(1, Math.floor((bestEx / 256) / 2)), limit - total);
      if (m < 1) return total;
      const removed = this.removeTop(c, m, null);
      if (removed < 1) return total;
      const dst = this.roll(best, removed);
      this.addTop(dst, removed);
      this.moved(c); this.moved(dst);
      batch++; total += removed;
      if (total >= limit || this.count[c] < 1) return total;
    }
  }
  roll(cur, nAdd) {
    for (let step = 0; step < 32; step++) {
      const x = cur % NX, z = (cur / NX) | 0, tal = this.talusD[cur];
      let best = -1, bestEx = 0;
      const h = this.heightQ(cur) + 1;
      for (let d = 0; d < 16; d++) {
        const nI = this.edge(x, z, d); if (nI < 0) continue;
        let ex = (h - this.heightQ(nI)) * 256 - ((DLEN[d] * tal) / 256);
        if (ex > 0) { ex += hash3(cur, this.tick * 64 + step, d ^ 0x55) & 63; if (ex > bestEx) { bestEx = ex; best = nI; } }
      }
      if (best < 0) break;
      cur = best;
    }
    return cur;
  }
  moved(c) {
    this.prevMove[c] = this.lastMove[c]; this.lastMove[c] = this.tick;
    const x = c % NX, z = (c / NX) | 0;
    for (let tz = Math.max(0, Math.floor((z - 2) / 8)); tz <= Math.min(17, Math.floor((z + 2) / 8)); tz++)
      for (let tx = Math.max(0, Math.floor((x - 2) / 8)); tx <= Math.min(17, Math.floor((x + 2) / 8)); tx++) this.slumpNext[tz * 18 + tx] = 1;
    const ch = (Math.floor(z / 16)) * 9 + Math.floor(x / 16); this.dirty.add(ch);
  }
  nb(x, z, d) { const nx = x + DX[d], nz = z + DZ[d]; if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) return -1; return nz * NX + nx; }
  edge(x, z, d) {
    const nx = x + DX[d], nz = z + DZ[d];
    if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) return -1;
    const n = nz * NX + nx;
    if (this.noMoney[n]) return -1;
    if (d >= 4) {
      const c = z * NX + x, lim = Math.max(this.floorQ[c], this.floorQ[n]) + LEVEL_TOL / T;
      const sx = Math.sign(DX[d]), sz = Math.sign(DZ[d]);
      const a = z * NX + (x + sx), b = (z + sz) * NX + x;
      if (Math.abs(DX[d]) >= 1 && this.floorQ[a] > lim) return -1;
      if (Math.abs(DZ[d]) >= 1 && this.floorQ[b] > lim) return -1;
    }
    return n;
  }

  // ----- stairs / levels -----
  checkLevels() {           // CheckLevels: when no visible notes are left, drop the next lid
    if (this.level < 5 && this.visible < 1) { this.openLevel(this.level + 1); return this.level; }
    return 0;
  }
  checkStairs() {           // CheckStairs: a ramp counts as dug clear when all its cells hold <= 0.05 m
    const out = [];
    for (let k = 0; k < 5; k++) {
      if (this.revealed & (1 << k)) continue;
      if (k >= 1 && this.level < k + 1) continue;
      let clear = true, any = false;
      for (let c = 0; c < this.n && clear; c++) {
        if (this.ramp[c] !== k) continue;
        const cx = c % NX, cz = (c / NX) | 0, x = (cx + 0.5) * CELL + OX, z = (cz + 0.5) * CELL + OZ;
        if (!inRamp(x, z, k, 0)) continue;
        any = true;
        if (this.count[c] * T > 0.05) clear = false;
      }
      if (any && clear) { this.revealed |= 1 << k; out.push(k); }
    }
    return out;
  }

  // ----- save (count per cell, run-length) -----
  save() {
    const out = []; let run = 0, prev = null;
    for (let c = 0; c < this.n; c++) {
      const v = this.count[c];
      if (v === prev) run++; else { if (prev !== null) out.push(run > 1 ? [prev, run] : prev); prev = v; run = 1; }
    }
    out.push(run > 1 ? [prev, run] : prev);
    return { v: 1, lv: this.level, ramps: this.revealed, c: out, fq: rle(this.floorQ), gp: this.giltPatches, gl: this.giltLeft };
  }
  load(s) {
    if (!s || !s.c) return false;
    this.level = s.lv || 1; this.levelSeq = (this.levelSeq || 0) + 1; this.revealed = s.ramps || 0;
    let c = 0; for (const e of s.c) { if (Array.isArray(e)) { for (let i = 0; i < e[1]; i++) this.count[c++] = e[0]; } else this.count[c++] = e; }
    if (s.fq) unrle(s.fq, this.floorQ); else this.resetFloors();
    this.buildTalus(); this.recount(); this.markAll();
    this.giltMask.fill(0); this.giltPatches = s.gp || []; this.giltLeft = s.gl || [0, 0, 0, 0, 0, 0];
    this.giltPatches.forEach((p, i) => { if (this.giltLeft[i] > 0) this.giltCells(p, (c) => { this.giltMask[c] = i + 1; }); });
    return true;
  }
  resetFloors() { for (let cz = 0; cz < NZ; cz++) for (let cx = 0; cx < NX; cx++) { const c = cz * NX + cx; this.floorQ[c] = Math.max(this.floorQReal[c], roundHE(this.floorHeightAt(cx, cz) / T)); } }
}
function rle(arr) { const out = []; let prev = null, run = 0; for (const v of arr) { if (v === prev) run++; else { if (prev !== null) out.push(run > 1 ? [prev, run] : prev); prev = v; run = 1; } } out.push(run > 1 ? [prev, run] : prev); return out; }
function unrle(list, arr) { let c = 0; for (const e of list) { if (Array.isArray(e)) { for (let i = 0; i < e[1]; i++) arr[c++] = e[0]; } else arr[c++] = e; } }

const DX = [1, -1, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 2, -2, 2, -2];
const DZ = [0, 0, 1, -1, 1, 1, -1, -1, 2, 2, -2, -2, 1, 1, -1, -1];
const DLEN = [256, 256, 256, 256, 362, 362, 362, 362, 572, 572, 572, 572, 572, 572, 572, 572];

// ---------------- initial surface (VaultSurfaceWith), Perlin mapped to [0,1] ----------------
const PERM = (() => { const p = []; let s = 1337; for (let i = 0; i < 256; i++) p[i] = i; for (let i = 255; i > 0; i--) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } return p.concat(p); })();
function perlin(x, y) {
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
  const u = fade(x), v = fade(y);
  const a = PERM[X] + Y, b = PERM[X + 1] + Y;
  const l = (t, p, q) => p + t * (q - p);
  return 0.5 + 0.5 * l(v, l(u, grad(PERM[a], x, y), grad(PERM[b], x - 1, y)), l(u, grad(PERM[a + 1], x, y - 1), grad(PERM[b + 1], x - 1, y - 1)));
}
const sm = u => { u = clamp01(u); return u * u * (3 - 2 * u); };
function mountain(x, z) {
  const dx = x - CXH, dz = z - CZH;
  const r = Math.sqrt(Math.sqrt(dx ** 4 + dz ** 4)) / (HALF - 1);
  if (r >= 1) return 0;
  const a = 1 - r;
  if (a < 0.07) return a * a / 0.14 / 0.915;
  if (r < 0.1) return ((0.01 - r * r) / 0.2 + 0.865) / 0.915;
  return (a - 0.035) / 0.915;
}
const lobbyDistance = (x, z) => Math.hypot(Math.max(0, Math.abs(x) - 12.5), Math.max(0, z - (CZH - HALF)));
const lobbyEdgeCap = (x, z) => lobbyDistance(x, z) * 0.6 + 2.4;
function rampMound(x, z) {
  let best = -3.4e38;
  for (const r of RAMPS) {
    const dx = x - r.topX, dz = z - r.topZ;
    const a = Math.max(0, Math.min(r.length, dx * r.dir[0] + dz * r.dir[1]));
    const lat = Math.max(-r.width / 2, Math.min(r.width / 2, dx * r.inward[0] + dz * r.inward[1]));
    const qx = r.topX + r.dir[0] * a + r.inward[0] * lat, qz = r.topZ + r.dir[1] * a + r.inward[1] * lat;
    best = Math.max(best, 0.4 + r.topY + (r.bottomY - r.topY) * clamp01(a / r.length) - Math.hypot(x - qx, z - qz) * 0.7);
  }
  return best;
}
export function vaultSurface(x, z) {
  const m = 0.20361087, d = D(x, z);
  let h = perlin(x * 0.09 + 13.1, z * 0.09 + 7.7) * 1.2 + perlin(x * 0.27 + 3.3, z * 0.27 + 1.9) * 0.35 + 1.6 + sm((d - 0.8) / 0.19999999) * 1.6;
  h += mountain(x, z) * m;
  const tl = clamp01(((z - (CZH - HALF)) - 4) * -0.25) * clamp01((Math.abs(x) - 10) * -0.125);
  h += (2.4 - h) * tl;
  h = Math.min(h, lobbyEdgeCap(x, z));
  let s = Math.max(h, rockFloor(x, z));
  const hs = 0.05, ds = 0.11;
  const p1 = perlin(x * hs + 51.3, z * hs + 17.9), p2 = perlin(x * hs * 2.6 + 3.1, z * hs * 2.6 + 8.4);
  const e1 = sm((d - 0.84) / 0.13000005), zf1 = clamp01((z - 3) / 10);
  const q1 = perlin(x * ds + 7.7, z * ds + 91.3), q2 = perlin(x * ds * 2.3 + 33.1, z * ds * 2.3 + 4.6);
  const e2 = sm((d - 0.9) / 0.08000004), zf2 = clamp01((z - 1.5) / 4.5);
  s += (1 - e2) * zf2 * ((q2 - 0.5) * 0.5 + (q1 - 0.5) * 2) * 1.4 + ((p2 - 0.5) * 0.45 + (p1 - 0.5) * 2) * 2.6 * (1 - e1) * zf1;
  s = Math.min(s, lobbyEdgeCap(x, z));
  s = Math.max(s, Math.min(rampMound(x, z), 3.0 - 0.35 + lobbyDistance(x, z) * 0.6));
  return Math.max(s, rockFloor(x, z));
}

// Build the settled initial field: per-cell counts, MatchTotal to exactly 1e9, SettleInitial(2000).
export function buildInitial(total = 1e9, footprint = [], settleTicks = 2000) {
  const n = NX * NZ, init = new Int32Array(n);
  for (let cz = 0; cz < NZ; cz++) for (let cx = 0; cx < NX; cx++) {
    const x = (cx + 0.5) * CELL + OX, z = (cz + 0.5) * CELL + OZ;
    const f = rockFloor(x, z);
    init[cz * NX + cx] = Math.max(0, Math.min(MAX_COLUMN, roundHE((vaultSurface(x, z) - f) / T)));
  }
  for (const c of footprint) init[c] = 0;
  // MatchTotal
  let deficit = total - init.reduce((a, b) => a + b, 0);
  const cand = [...init.keys()].filter(c => init[c] > 1).sort((a, b) => hash3(a, 0xE8AC7, 0x1234567) - hash3(b, 0xE8AC7, 0x1234567));
  const step = deficit > 0 ? 1 : -1;
  // spread the deficit evenly first (the original does unit passes; same end state, far fewer loops)
  const per = Math.trunc(deficit / cand.length);
  if (per !== 0) for (const c of cand) { const v = Math.max(1, Math.min(MAX_COLUMN, init[c] + per)); deficit -= v - init[c]; init[c] = v; }
  let changed = true;
  while (deficit !== 0 && changed) {
    changed = false;
    for (const c of cand) { if (deficit === 0) break; const v = init[c] + step; if (v >= 1 && v <= MAX_COLUMN) { init[c] = v; deficit -= step; changed = true; } }
  }
  // settle with levels fully open (Open = everything) from the rock floor
  const f = new MoneyField(init, { footprint });
  f.level = 5; f.resetToLevel(5); f.wakeAll();
  for (let i = 0; i < settleTicks && f.slumping; i++) f.slumpTick(64);
  for (let c = 0; c < n; c++) init[c] = f.count[c];
  return init;
}
