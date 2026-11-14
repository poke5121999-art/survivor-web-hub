// Voxel Lab - simulation core: world grid, carve/explode (p0/toughness formula, rough shells), connectivity
// islands, level-1 "stack" stress per structure, debris cubes -> rubble voxels, dust/fire sprites, fire spread,
// fuel chains, projectiles, the matter ledger and digests.
// Techniques studied from Voxel Engine by mattshumer (spawn.co), analysis/destruction.md §4-§8, §10, §12; code is our own.
import { VoxelGrid } from '../grid.js';
import { M, F, flags, p0, roughPair, voxMass, fc, toughness, rubbleOf, burnChance, burnTime, burnsTo, colors } from '../materials.js';
import { hash3, hash3f, digestBytes } from '../hash.js';
import { Bodies } from './bodies.js';

export const WX = 1280, WY = 384, WZ = 320, GY = 8; // world size in voxels; ground surface is the top of layer GY-1
export const SIM_DT = 1 / 60, G = 9.81;
const KEY = (x, y, z) => x + (y << 11) + (z << 20);

export class World {
  constructor() {
    this.events = [];
    this.fx = 1;                       // render-only knob: particle counts (never read by anything the sim decides)
    this.hooks = { bodyAdded: null, bodyRemoved: null, scorch: null, flash: null, blast: null, reset: null };
    this.seedScratch = new Int32Array(1 << 16); this.nSeeds = 0;
    this.remScratch = new Int32Array(1 << 16); this.remMat = new Uint8Array(1 << 16);
    this.matCount = new Uint32Array(256);
    this.listScratch = new Int32Array(1 << 18);
    this.stack = new Int32Array(1 << 18);
    // debris cubes (struct of arrays)
    const C = this.debCap = 6000;
    this.d = { n: 0, px: new Float32Array(C), py: new Float32Array(C), pz: new Float32Array(C), vx: new Float32Array(C), vy: new Float32Array(C), vz: new Float32Array(C), q: new Float32Array(C * 4), w: new Float32Array(C * 3), size: new Float32Array(C), mat: new Uint8Array(C), nv: new Uint8Array(C), rest: new Uint8Array(C), life: new Float32Array(C) };
    // sprites: rows of 12 floats for the renderer + 6 private (vx, vy, vz, life, maxLife, grow)
    this.spCap = 5000; this.sp = new Float32Array(this.spCap * 12); this.spx = new Float32Array(this.spCap * 6); this.nSp = 0;
    this.bodies = new Bodies(this);
    this.reset();
  }

  reset() {
    const g = this.grid = new VoxelGrid(WX, WY, WZ);
    // ground: bedrock 0-1, soil 2-6, grass 7
    const L = g.cx * g.cz;
    for (let id = 0; id < L; id++) {
      const c = g.chunks[id] = new Uint8Array(32768), p = g.pris[id] = new Uint8Array(4096);
      for (let y = 0; y < GY; y++) c.fill(y < 2 ? M.bedrock : y < GY - 1 ? M.soil : M.grass, y * 1024, (y + 1) * 1024);
      p.fill(255, 0, GY * 128);
      g.count[id] = GY * 1024; g.solid += GY * 1024; g.markDirty(id);
    }
    this.stamps = new Array(g.nChunks).fill(null); this.epoch = 1; this.runStart = 1; this.epochGrounded = new Uint8Array(65536);
    this.structures = []; this.structAt = new Uint8Array((WX >> 4) * (WZ >> 4));
    g.onSet = (x, y, z) => { const s = this.structAt[(x >> 4) + (WX >> 4) * (z >> 4)]; if (s) { const st = this.structures[s - 1]; if (st && y >= st.y0 && y < st.y1) { st.dirty[y - st.y0] = 1; st.anyDirty = true; } } };
    this.nSeeds = 0; this.d.n = 0; this.nSp = 0; this.step = 0; this.time = 0;
    this.bodies.clear();
    this.fire = new Map(); this.fireList = []; this.fireStats = { burning: 0, charred: 0, consumed: 0, lit: 0, explosives: 0 };
    this.fuses = []; this.projectiles = [];
    this.led = { built: g.solid, debris: 0, destroyed: 0, burnt: 0, offMap: 0, rubbleLaid: 0, baked: 0 };
    this.stats = { fractures: 0, detached: 0, maxRatio: 0, solving: 0, scanned: 0 };
    this.rubAgg = { n: 0, x: 0, y: 0, z: 0, mat: 0 };
    this.spin = null; this.owed = 0;
    if (this.hooks.reset) this.hooks.reset();
  }

  ev(kind, x, y, z, mag, mat = 0, a = 0, b = 0) { if (this.events.length < 600) this.events.push({ kind, x, y, z, mag, mat, a, b }); }

  // ---------------------------------------------------------------- building placement
  /** place a Canvas at world voxel (ox, oz) on the ground; rot = quarter turns about y. Returns the structure record. */
  place(canvas, ox, oz, rot = 0, name = '') {
    const g = this.grid, { sx, sy, sz } = canvas, rx = rot & 1 ? sz : sx, rz = rot & 1 ? sx : sz;
    const map = (x, z) => rot === 0 ? [x, z] : rot === 1 ? [sz - 1 - z, x] : rot === 2 ? [sx - 1 - x, sz - 1 - z] : [z, sx - 1 - x];
    for (const p of canvas.groundPatches) for (let z = p.z0; z < p.z1; z++) for (let x = p.x0; x < p.x1; x++) { const [mx, mz] = map(x, z); if (g.get(ox + mx, GY - 1, oz + mz)) g.set(ox + mx, GY - 1, oz + mz, p.m, 1); }
    let n = 0;
    for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
      const m = canvas.v[x + sx * (z + sz * y)]; if (!m) continue;
      const [mx, mz] = map(x, z);
      if (!g.get(ox + mx, GY + y, oz + mz)) { g.set(ox + mx, GY + y, oz + mz, m, 1); n++; }
    }
    this.led.built += n;
    const st = { name, x0: ox, y0: GY, z0: oz, x1: ox + rx, y1: Math.min(WY, GY + sy), z1: oz + rz, S: 0.05, cool: 0, creak: 0, ratio: 0, dyn: null };
    const H = st.y1 - st.y0;
    st.mass = new Float64Array(H); st.cap = new Float64Array(H); st.mx = new Float64Array(H); st.mz = new Float64Array(H); st.sx = new Float64Array(H); st.sz = new Float64Array(H);
    st.bx0 = new Int16Array(H); st.bx1 = new Int16Array(H); st.bz0 = new Int16Array(H); st.bz1 = new Int16Array(H); st.dirty = new Uint8Array(H).fill(1); st.anyDirty = true; st.ratios = new Float32Array(H);
    this.structures.push(st);
    const si = this.structures.length;
    for (let z = st.z0 >> 4; z <= (st.z1 - 1) >> 4; z++) for (let x = st.x0 >> 4; x <= (st.x1 - 1) >> 4; x++) if (x >= 0 && z >= 0 && x < (WX >> 4) && z < (WZ >> 4) && !this.structAt[x + (WX >> 4) * z]) this.structAt[x + (WX >> 4) * z] = si;
    // normalise: every structure is "designed" to a utilisation of 0.3 at its weakest layer
    for (let l = 0; l < H; l++) this.scanLayer(st, l);
    st.total = 0; for (let l = 0; l < H; l++) st.total += st.mass[l];
    st.anyDirty = false;
    // normalise: a structure is "designed" to a utilisation of 0.3 at the weakest layer of its lower 40 %;
    // a layer further up that would be worse than that gets its own factor (it stood when built)
    const r0 = this.evalStruct(st, 1); let low = 0;
    for (let l = 0; l < Math.max(1, Math.ceil(H * 0.4)); l++) low = Math.max(low, st.ratios[l]);
    st.S = (low > 0 ? low : r0 > 0 ? r0 : 0.015) / 0.3;
    st.Sl = new Float32Array(H); for (let l = 0; l < H; l++) st.Sl[l] = Math.max(st.S, st.ratios[l] / 0.3);
    return st;
  }

  // ---------------------------------------------------------------- stress, level 1 "stack"
  scanLayer(st, l) {
    const g = this.grid, y = st.y0 + l;
    let mass = 0, cap = 0, mx = 0, mz = 0, sx = 0, sz = 0, bx0 = 32767, bx1 = -1, bz0 = 32767, bz1 = -1;
    for (let z = st.z0; z < st.z1; z++) for (let x = st.x0; x < st.x1; x++) {
      const m = g.get(x, y, z); if (!m) continue;
      const w = voxMass[m]; mass += w; mx += w * x; mz += w * z;
      if (flags[m] & F.GLASS) continue;
      const c = fc[m]; cap += c; sx += c * x; sz += c * z;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
    }
    st.mass[l] = mass; st.cap[l] = cap; st.mx[l] = mx; st.mz[l] = mz; st.sx[l] = sx; st.sz[l] = sz;
    st.bx0[l] = bx0; st.bx1[l] = bx1; st.bz0[l] = bz0; st.bz1[l] = bz1; st.dirty[l] = 0;
  }
  /** returns the max load/capacity ratio; fills st.ratios, st.failL, st.ecc */
  evalStruct(st, S) {
    const H = st.y1 - st.y0; let W = 0, Mx = 0, Mz = 0, best = 0; st.failL = -1;
    const dynL = st.dyn ? st.dyn.y - st.y0 : -1, dynF = st.dyn ? st.dyn.F : 0;
    for (let l = H - 1; l >= 0; l--) {
      let r = 0;
      const cap = st.cap[l];
      if (W > 200 && W > st.total * 0.08 && cap > 0) { // small things on top (chimneys, masts) do not decide the building
        const cx = st.sx[l] / cap, cz = st.sz[l] / cap, ex = Math.abs(Mx / W - cx), ez = Math.abs(Mz / W - cz);
        const hx = Math.max((st.bx1[l] - st.bx0[l] + 1) / 2, 1), hz = Math.max((st.bz1[l] - st.bz0[l] + 1) / 2, 1);
        const ecc = Math.min(1 + 3 * ex / hx + 3 * ez / hz, 4);
        r = (W * G + (l < dynL ? dynF : 0)) / (cap * 1e4 * (st.Sl ? st.Sl[l] : S)) * ecc;
        if (r > best) { best = r; st.failL = l; st.ecc = ecc; st.ex = Mx / W - cx; st.ez = Mz / W - cz; }
      }
      st.ratios[l] = r;
      W += st.mass[l]; Mx += st.mx[l]; Mz += st.mz[l];
    }
    return best;
  }
  stepStress() {
    let scanned = 0, solving = 0, maxR = 0;
    for (const st of this.structures) {
      if (st.cool > 0) st.cool--;
      if (st.creak > 0) st.creak--;
      if (st.dyn && --st.dyn.frames <= 0) { st.dyn = null; st.anyDirty = true; }
      if (!st.anyDirty) { maxR = Math.max(maxR, st.ratio); continue; }
      solving++;
      const H = st.y1 - st.y0; let left = false;
      for (let l = 0; l < H; l++) if (st.dirty[l]) { if (scanned < 24) { this.scanLayer(st, l); scanned++; } else left = true; }
      if (left) continue; // spread over several steps
      st.anyDirty = false;
      const r = st.ratio = this.evalStruct(st, st.S); maxR = Math.max(maxR, r);
      if (r >= 1 && st.cool <= 0) this.failStruct(st);
      else if (r >= 0.8 && st.creak <= 0) { st.creak = 40; this.ev('creak', (st.x0 + st.x1) * 0.05, (st.y0 + st.failL) * 0.1, (st.z0 + st.z1) * 0.05, r, M.concrete, 0, (st.y1 - st.y0) * 0.3); }
    }
    this.stats.scanned = scanned; this.stats.solving = solving; this.stats.maxRatio = maxR;
  }
  /** a layer is past its strength: crush the overloaded band of supports; what stood on it becomes an island and falls */
  failStruct(st) {
    const g = this.grid, H = st.y1 - st.y0, l = st.failL, eccentric = st.ecc > 1.5;
    let l0 = l, l1 = l;
    const maxBand = eccentric ? 2 : 30;
    while (l0 > 0 && st.ratios[l0 - 1] >= 0.85 && l - l0 < maxBand) l0--;
    while (l1 < H - 1 && st.ratios[l1 + 1] >= 0.85 && l1 - l < maxBand) l1++;
    let n = 0; this.matCount.fill(0);
    for (let ll = l0; ll <= l1; ll++) {
      const y = st.y0 + ll;
      for (let z = st.z0; z < st.z1; z++) for (let x = st.x0; x < st.x1; x++) { const m = g.get(x, y, z); if (m) { this.crushVoxel(x, y, z, m, n); n++; } }
    }
    this.stats.fractures += n; st.cool = 20;
    const cx = (st.x0 + st.x1) * 0.05, cz = (st.z0 + st.z1) * 0.05, cy = (st.y0 + l) * 0.1;
    this.ev('fracture', cx, cy, cz, n, this.dominant());
    this.dust(cx, cy, cz, Math.min(20, 4 + n / 150), (st.x1 - st.x0) * 0.05, 0.6, 1.6, 0.4);
    if (eccentric) { const e = Math.hypot(st.ex, st.ez) || 1; this.spin = { x0: st.x0, z0: st.z0, x1: st.x1, z1: st.z1, ax: st.ez / e, az: -st.ex / e, w: Math.min(0.3, 0.05 * (st.ecc - 1.5)), frames: 3 }; }
  }
  dominant() { let b = 0, bi = M.concrete; for (let i = 1; i < 256; i++) if (this.matCount[i] > b) { b = this.matCount[i]; bi = i; } return bi; }

  // ---------------------------------------------------------------- removing matter
  seed(x, y, z) { if (this.nSeeds + 6 >= this.seedScratch.length) { const a = new Int32Array(this.seedScratch.length * 2); a.set(this.seedScratch); this.seedScratch = a; } this.seedScratch[this.nSeeds++] = KEY(x, y, z); }
  seedAround(x, y, z) { this.seed(x, y + 1, z); this.seed(x + 1, y, z); this.seed(x - 1, y, z); this.seed(x, y, z + 1); this.seed(x, y, z - 1); if (y > GY) this.seed(x, y - 1, z); }
  /** crushed in place (stress failure, impact): the voxel leaves the grid and is spilled */
  crushVoxel(x, y, z, m, i) {
    this.grid.set(x, y, z, 0); this.seedAround(x, y, z);
    if (this.fire.size) this.fire.delete(KEY(x, y, z));
    this.spill(x, y, z, m, i);
  }
  /** one loose voxel of matter at a world cell: mostly rubble that drops, some 4-voxel cubes, some dust */
  spill(x, y, z, m, i) {
    this.matCount[m]++;
    const h = hash3(x, y, z, this.step + i * 7);
    if (this.owed > 0 && (h & 3) === 1) { this.owed--; return; } // this voxel is part of a cube already thrown
    const r = (h >> 4) & 15;
    if (r === 0 && this.d.n < this.debCap - 200) { this.spawnDebris((x + 0.5) * 0.1, (y + 0.5) * 0.1, (z + 0.5) * 0.1, ((h >> 8) % 100 - 50) * 0.02, ((h >> 16) % 100) * 0.01, ((h >> 24) % 100 - 50) * 0.02, m, 4); this.owed += 3; }
    else if (r < 6) this.led.destroyed++;
    else this.depositRubble(x, y, z, rubbleOf[m] || M.rubble, 1);
  }
  /**
   * Carve a sphere (destruction.md §4.2): per material fac = clamp((power - p0)/0.12, 0, 1); everything inside
   * 0.85 R fac goes; the shell out to + min(0.15 R fac, 1) + 0.3 goes by a coordinate hash scaled by the
   * material's roughness. Returns the number of voxels removed.
   */
  carve(cx, cy, cz, r, power, opt = {}) {
    r = Math.min(r, 8); power = Math.min(Math.max(power, 0), 1.5);
    if (!(r > 0) || !(power > 0)) return 0;
    const g = this.grid, R = r * 10, vx = cx * 10, vy = cy * 10, vz = cz * 10;
    const x0 = Math.max(0, Math.floor(vx - R - 2)), x1 = Math.min(WX - 1, Math.ceil(vx + R + 2)), y0 = Math.max(opt.keepGround ? GY : 2, Math.floor(vy - R - 2)), y1 = Math.min(WY - 1, Math.ceil(vy + R + 2)), z0 = Math.max(0, Math.floor(vz - R - 2)), z1 = Math.min(WZ - 1, Math.ceil(vz + R + 2));
    let n = 0, glassN = 0; this.matCount.fill(0);
    const R2 = (R + 2.2) * (R + 2.2);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const dy = y + 0.5 - vy, dz = z + 0.5 - vz, rem = R2 - dy * dy - dz * dz; if (rem <= 0) continue;
      const span = Math.sqrt(rem), xa = Math.max(x0, Math.ceil(vx - span - 0.5)), xb = Math.min(x1, Math.floor(vx + span - 0.5));
      for (let x = xa; x <= xb; x++) {
        const m = g.get(x, y, z); if (!m) continue;
        const fac = Math.min(Math.max((power - p0[m]) / 0.12, 0), 1); if (fac <= 0) continue;
        const dx = x + 0.5 - vx, d = Math.sqrt(dx * dx + dy * dy + dz * dz), Rm = R * fac;
        if (d > Rm * 0.85 - 0.5) {
          const shell = Rm * 0.85 + Math.min(Rm * 0.15, 1) + 0.3, a = roughPair(m);
          const h = hash3f(x, y, z, 77) * 0.5 + hash3f(x >> 2, y >> 2, z >> 2, 91) * 0.5;
          if (d >= shell + (h * 2 - 1) * Math.min(shell * a, 1.6)) continue;
        }
        if (flags[m] & F.EXPLOSIVE) { this.fuseFuel(x, y, z, 0.06 + (hash3(x, y, z, 5) % 100) * 0.003); continue; }
        g.set(x, y, z, 0); this.seedAround(x, y, z); this.matCount[m]++;
        if (flags[m] & F.GLASS) glassN++;
        if (n >= this.remScratch.length) { const a = new Int32Array(n * 2); a.set(this.remScratch); this.remScratch = a; const b = new Uint8Array(n * 2); b.set(this.remMat); this.remMat = b; }
        this.remScratch[n] = KEY(x, y, z); this.remMat[n] = m; n++;
      }
    }
    if (!n) return 0;
    if (this.fire.size) for (let i = 0; i < n; i++) this.fire.delete(this.remScratch[i]);
    // debris budget after destruction.md §4.2 step 3: clamp(r, 0.1, 3) x 150 cubes, x 60 dust
    const rr = Math.min(Math.max(r, 0.1), 3);
    const budget = Math.max(1, Math.min(Math.round(rr * 100 * (opt.debris ?? 1)), this.debCap - this.d.n - 100));
    const per = Math.min(4, Math.max(1, Math.round(n * 0.4 / budget))), stride = Math.max(1, Math.floor(n / budget));
    let used = 0;
    const kv = opt.kick ?? (2 + 5 * power);
    for (let i = 0; i < n; i += stride) {
      const k = this.remScratch[i], x = k & 2047, y = (k >> 11) & 511, z = k >> 20, m = this.remMat[i];
      const h = hash3(x, y, z, this.step + 3), u = (h & 1023) / 1023, u2 = ((h >> 10) & 1023) / 1023;
      let dx = x + 0.5 - vx, dy = y + 0.5 - vy, dz = z + 0.5 - vz; const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      let sp = kv * (0.35 + u) * Math.sqrt(Math.max(0.05, 1 - dl / (R + 2)));
      let vyv = dy * sp + 1 + 2 * u2;
      if (opt.ejecta && (flags[m] & F.GRANULAR)) { const hh = Math.max(0.3, 0.3 * r * (1.2 + 1.8 * u)); vyv = Math.sqrt(2 * G * hh); sp *= 0.6; }
      if (this.d.n < this.debCap - 50) { this.spawnDebris((x + 0.5) * 0.1, (y + 0.5) * 0.1, (z + 0.5) * 0.1, dx * sp + (u2 - 0.5), vyv, dz * sp + (u - 0.5), m, per); used += per; }
    }
    // what did not become a cube: part is laid as rubble under where it was, the rest is dust
    const rest = n - used; let lay = Math.min(rest, Math.round(n * 0.5));
    if (lay > 0) { const st2 = Math.max(1, Math.floor(n / lay)); for (let i = (st2 >> 1); i < n && lay > 0; i += st2, lay--) { const k = this.remScratch[i]; this.depositRubble(k & 2047, (k >> 11) & 511, k >> 20, rubbleOf[this.remMat[i]] || M.rubble, 1); used++; } }
    this.led.destroyed += Math.max(0, n - used);
    const dom = this.dominant();
    if (!opt.quiet) this.ev('break', cx, cy, cz, n, dom);
    if (glassN > 3) this.ev('glass', cx, cy, cz, glassN, M.glass);
    const c = dom * 3, tint = 0.55;
    this.dust(cx, cy, cz, Math.round(rr * 60 * (opt.dust ?? 0.35) * 0.5), r * 0.7, 0.4 + r * 0.22, 1.0 + r * 0.4, 0.4, (colors[c] / 255) * tint + 0.42, (colors[c + 1] / 255) * tint + 0.4, (colors[c + 2] / 255) * tint + 0.37);
    return n;
  }

  /** explosion (destruction.md §4.3): carve with 0.6 x power, push bodies and debris, ejecta, glass blow-out, fuel chains */
  explode(cx, cy, cz, r, power = 1, kind = 0) {
    r = Math.min(r, 8); if (!(r > 0) || !(power > 0)) return;
    const reach = Math.min(r * 1.9, 8);
    this.carve(cx, cy, cz, r, 0.6 * power, { ejecta: true, kick: 3 + 3.5 * Math.min(power, 1.5), dust: 0.5, quiet: true });
    // glass blows out and fuel cooks off well beyond the hole
    const g = this.grid, R = reach * 10, vx = cx * 10, vy = cy * 10, vz = cz * 10; let glassN = 0;
    const cx0 = Math.max(0, (vx - R) >> 5), cx1 = Math.min(g.cx - 1, (vx + R) >> 5), cy0 = Math.max(0, (vy - R) >> 5), cy1 = Math.min(g.cy - 1, (vy + R) >> 5), cz0 = Math.max(0, (vz - R) >> 5), cz1 = Math.min(g.cz - 1, (vz + R) >> 5);
    for (let yy = cy0; yy <= cy1; yy++) for (let zz = cz0; zz <= cz1; zz++) for (let xx = cx0; xx <= cx1; xx++) {
      const id = xx + g.cx * (zz + g.cz * yy), c = g.chunks[id]; if (!c || !g.count[id]) continue;
      for (let i = yy === 0 ? GY * 1024 : 0; i < 32768; i++) {
        const m = c[i]; if (!m) continue; const f = flags[m]; if (!(f & (F.GLASS | F.EXPLOSIVE))) continue;
        const x = xx * 32 + (i & 31), y = yy * 32 + (i >> 10), z = zz * 32 + ((i >> 5) & 31);
        const d = Math.hypot(x + 0.5 - vx, y + 0.5 - vy, z + 0.5 - vz); if (d > R) continue;
        if (f & F.EXPLOSIVE) { if (d < R * 0.8) this.fuseFuel(x, y, z, 0.1 + (hash3(x, y, z, 9) % 100) * 0.004); continue; }
        if (hash3f(x, y, z, 31) > (1.25 - d / R) * 1.3) continue;
        g.set(x, y, z, 0); this.seedAround(x, y, z); glassN++;
        if ((hash3(x, y, z, 2) & 3) === 0 && this.d.n < this.debCap - 300) { const k = 3 * (1 - d / R) / Math.max(d, 1); this.spawnDebris((x + 0.5) * 0.1, (y + 0.5) * 0.1, (z + 0.5) * 0.1, (x - vx) * k, (y - vy) * k + 1, (z - vz) * k, m, 1); } else this.led.destroyed++;
      }
    }
    if (glassN > 3) this.ev('glass', cx, cy, cz, glassN, M.glass);
    // push: full inside 2/3 of the reach, linear falloff beyond
    const P = Math.min(power, 1.5) * 0.6, D = this.d;
    for (let i = 0; i < D.n; i++) {
      const dx = D.px[i] - cx, dy = D.py[i] - cy, dz = D.pz[i] - cz, d = Math.hypot(dx, dy, dz); if (d > reach || d < 0.05) continue;
      const k = (d < reach * 2 / 3 ? 1 : (reach - d) / (reach / 3)) * P * 14 / d;
      D.vx[i] += dx * k; D.vy[i] += dy * k + P * 2; D.vz[i] += dz * k; D.rest[i] = 0;
    }
    this.bodies.blast(cx, cy, cz, reach, P);
    if (this.hooks.blast) this.hooks.blast(cx, cy, cz, r, power);
    this.ignite(cx, cy, cz, r * 0.9, 0.5 * power);
    this.ev('explosion', cx, cy, cz, r, 0, power, kind);
    if (this.hooks.scorch) this.hooks.scorch(cx, cy, cz, r * 1.35);
    if (this.hooks.flash) this.hooks.flash(cx, cy, cz, r * power);
    this.blastFx(cx, cy, cz, r, power);
  }

  // ---------------------------------------------------------------- islands
  stampOf(id) { let s = this.stamps[id]; if (!s) s = this.stamps[id] = new Uint16Array(32768); return s; }
  /** flood from the neighbours of everything removed this step; a component that cannot reach the ground becomes a body */
  checkIslands() {
    const n = this.nSeeds; if (!n) return; this.nSeeds = 0;
    const g = this.grid, seeds = this.seedScratch, cxn = g.cx, czn = g.cz;
    if (this.epoch > 60000) { for (const s of this.stamps) if (s) s.fill(0); this.epoch = 1; }
    this.runStart = this.epoch;
    let stack = this.stack, list = this.listScratch;
    for (let si = 0; si < n; si++) {
      const k0 = seeds[si], sx0 = k0 & 2047, sy0 = (k0 >> 11) & 511, sz0 = k0 >> 20;
      if (sy0 < GY || !g.get(sx0, sy0, sz0)) continue;
      const st0 = this.stampOf(g.cid(sx0, sy0, sz0)), li0 = (sx0 & 31) + 32 * ((sz0 & 31) + 32 * (sy0 & 31));
      if (st0[li0] >= this.runStart) continue; // already reached by a grounded search of this run
      if (this.epoch >= 65000) { for (const s of this.stamps) if (s) s.fill(0); this.epoch = 1; this.runStart = 1; } // stamps are 16 bit; forgetting old marks only costs a re-search
      const cur = this.epoch++; st0[li0] = cur;
      let sp = 0, ln = 0, grounded = false;
      stack[sp++] = k0;
      while (sp) {
        const k = stack[--sp], x = k & 2047, y = (k >> 11) & 511, z = k >> 20;
        if (ln >= list.length) { const a = new Int32Array(list.length * 2); a.set(list); list = this.listScratch = a; }
        list[ln++] = k;
        if (sp + 6 >= stack.length) { const a = new Int32Array(stack.length * 2); a.set(stack); stack = this.stack = a; }
        // neighbours; "down" is pushed last so it is popped first and the search dives for the ground
        for (let q = 0; q < 6; q++) {
          const nx = x + (q === 1 ? 1 : q === 2 ? -1 : 0), ny = y + (q === 0 ? 1 : q === 5 ? -1 : 0), nz = z + (q === 3 ? 1 : q === 4 ? -1 : 0);
          if (nx < 0 || nz < 0 || nx >= WX || nz >= WZ || ny >= WY) continue;
          const id = (nx >> 5) + cxn * ((nz >> 5) + czn * (ny >> 5)), c = g.chunks[id]; if (!c) continue;
          const li = (nx & 31) + 32 * ((nz & 31) + 32 * (ny & 31)); if (!c[li]) continue;
          if (ny < GY) { grounded = true; break; }
          const st = this.stamps[id] || this.stampOf(id), s = st[li];
          if (s === cur) continue;
          if (s >= this.runStart) { grounded = true; break; }
          st[li] = cur; stack[sp++] = KEY(nx, ny, nz);
        }
        if (grounded) break;
      }
      if (grounded) continue;
      this.detach(list, ln);
    }
  }
  detach(list, n) {
    const g = this.grid;
    this.stats.detached += n;
    if (n < 10 || this.bodies.list.length >= 220) { // crumbs: straight to debris cubes
      for (let i = 0; i < n; i++) { const k = list[i], x = k & 2047, y = (k >> 11) & 511, z = k >> 20, m = g.set(x, y, z, 0); if (m) { if (this.d.n < this.debCap - 20 && (n < 10 || (i & 7) === 0)) this.spawnDebris((x + 0.5) * 0.1, (y + 0.5) * 0.1, (z + 0.5) * 0.1, 0, 0, 0, m, 1); else this.depositRubble(x, y, z, rubbleOf[m] || M.rubble, 1); } }
      return;
    }
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1, y1 = -1, z1 = -1;
    for (let i = 0; i < n; i++) { const k = list[i], x = k & 2047, y = (k >> 11) & 511, z = k >> 20; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const bg = new VoxelGrid(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1);
    for (let i = 0; i < n; i++) { const k = list[i], x = k & 2047, y = (k >> 11) & 511, z = k >> 20; const p = g.wasSolid(x, y, z); const m = g.set(x, y, z, 0); bg.set(x - x0, y - y0, z - z0, m, p ? 1 : 0); if (this.fire.size) this.fire.delete(k); }
    const si = this.structAt[(x0 >> 4) + (WX >> 4) * (z0 >> 4)], st = si ? this.structures[si - 1] : null;
    const b = this.bodies.add(bg, [x0, y0, z0], x0 * 0.1, y0 * 0.1, z0 * 0.1, [0, 0, 0, 1], st ? st.S : 0.05);
    if (!b) return;
    const sp = this.spin;
    if (sp && x1 >= sp.x0 && x0 < sp.x1 && z1 >= sp.z0 && z0 < sp.z1 && b.mass > 500) { b.w[0] = sp.ax * sp.w; b.w[2] = sp.az * sp.w; this.spin = null; }
    this.ev('detach', b.x, b.y, b.z, n, b.mat);
  }

  // ---------------------------------------------------------------- debris cubes and rubble
  spawnDebris(x, y, z, vx, vy, vz, m, nv = 1) {
    const D = this.d; if (D.n >= this.debCap) { this.led.destroyed += nv; return; }
    const i = D.n++, h = hash3(i, this.step, nv, 13);
    D.px[i] = x; D.py[i] = y; D.pz[i] = z; D.vx[i] = vx; D.vy[i] = vy; D.vz[i] = vz;
    D.q[i * 4] = 0; D.q[i * 4 + 1] = 0; D.q[i * 4 + 2] = 0; D.q[i * 4 + 3] = 1;
    D.w[i * 3] = ((h & 255) - 128) * 0.06; D.w[i * 3 + 1] = (((h >> 8) & 255) - 128) * 0.06; D.w[i * 3 + 2] = (((h >> 16) & 255) - 128) * 0.06;
    D.size[i] = 0.1 * Math.cbrt(nv) * (0.7 + ((h >> 24) & 15) * 0.02); D.mat[i] = m; D.nv[i] = nv; D.rest[i] = 0; D.life[i] = 9 + (h & 7) * 0.5;
    this.led.debris += nv;
  }
  killDebris(i) {
    const D = this.d, l = --D.n; this.led.debris -= D.nv[i];
    if (i !== l) { D.px[i] = D.px[l]; D.py[i] = D.py[l]; D.pz[i] = D.pz[l]; D.vx[i] = D.vx[l]; D.vy[i] = D.vy[l]; D.vz[i] = D.vz[l]; for (let k = 0; k < 4; k++) D.q[i * 4 + k] = D.q[l * 4 + k]; for (let k = 0; k < 3; k++) D.w[i * 3 + k] = D.w[l * 3 + k]; D.size[i] = D.size[l]; D.mat[i] = D.mat[l]; D.nv[i] = D.nv[l]; D.rest[i] = D.rest[l]; D.life[i] = D.life[l]; }
  }
  stepDebris(dt) {
    const D = this.d, g = this.grid; let impacts = 0;
    for (let i = D.n - 1; i >= 0; i--) {
      let vx = D.vx[i], vy = D.vy[i] - G * dt, vz = D.vz[i];
      const hs = D.size[i] * 0.5; let x = D.px[i], y = D.py[i], z = D.pz[i], hit = false;
      const nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt;
      if (nx < 0.2 || nz < 0.2 || nx > WX * 0.1 - 0.2 || nz > WZ * 0.1 - 0.2 || ny > WY * 0.1) { this.led.offMap += D.nv[i]; this.killDebris(i); continue; }
      const iy = Math.floor(y * 10), ix = Math.floor(x * 10), iz = Math.floor(z * 10);
      if (g.get(Math.floor(nx * 10), iy, iz)) { vx = -vx * 0.25; hit = true; } else x = nx;
      if (g.get(Math.floor(x * 10), iy, Math.floor(nz * 10))) { vz = -vz * 0.25; hit = true; } else z = nz;
      const fy = Math.floor((ny - (vy < 0 ? hs : -hs)) * 10);
      if (g.get(Math.floor(x * 10), fy, Math.floor(z * 10))) {
        if (vy < -3.5 && impacts < 3 && (hash3(i, this.step, 0, 3) & 7) === 0) { impacts++; this.ev('impact', x, y, z, -vy * D.nv[i] * voxMass[D.mat[i]] , D.mat[i], -vy); }
        if (vy < 0) { y = (fy + 1) * 0.1 + hs; vx *= 0.7; vz *= 0.7; vy = -vy * 0.2; if (vy < 0.5) vy = 0; D.w[i * 3] *= 0.5; D.w[i * 3 + 1] *= 0.5; D.w[i * 3 + 2] *= 0.5; if (vx * vx + vz * vz + vy * vy < 0.16) D.rest[i]++; else D.rest[i] = 0; }
        else vy = -vy * 0.2;
      } else { y = ny; if (hit) D.rest[i] = 0; }
      D.px[i] = x; D.py[i] = y; D.pz[i] = z; D.vx[i] = vx; D.vy[i] = vy; D.vz[i] = vz;
      // spin
      const wx = D.w[i * 3], wy = D.w[i * 3 + 1], wz = D.w[i * 3 + 2], o = i * 4, qx = D.q[o], qy = D.q[o + 1], qz = D.q[o + 2], qw = D.q[o + 3], hdt = dt * 0.5;
      let ax = qx + hdt * (wx * qw + wy * qz - wz * qy), ay = qy + hdt * (wy * qw + wz * qx - wx * qz), az = qz + hdt * (wz * qw + wx * qy - wy * qx), aw = qw - hdt * (wx * qx + wy * qy + wz * qz);
      const il = 1 / Math.sqrt(ax * ax + ay * ay + az * az + aw * aw); D.q[o] = ax * il; D.q[o + 1] = ay * il; D.q[o + 2] = az * il; D.q[o + 3] = aw * il;
      D.life[i] -= dt;
      if (D.rest[i] > 14 || D.life[i] <= 0) {
        const m = rubbleOf[D.mat[i]] || M.rubble, nv = D.nv[i];
        if ((flags[D.mat[i]] & F.GLASS) && nv <= 2) { this.led.destroyed += nv; this.led.debris -= nv; D.nv[i] = 0; } // glass crumbs do not pile up
        else if (D.rest[i] > 14 || g.get(Math.floor(x * 10), Math.floor((y - hs) * 10) - 1, Math.floor(z * 10))) {
          this.led.debris -= nv; D.nv[i] = 0; this.depositRubble(Math.floor(x * 10), Math.floor((y - hs) * 10 + 0.5), Math.floor(z * 10), m, nv);
          const a = this.rubAgg; a.n += nv; a.x += x; a.y += y; a.z += z; a.mat = D.mat[i]; a.c = (a.c || 0) + 1;
        } else { this.led.destroyed += nv; this.led.debris -= nv; D.nv[i] = 0; }
        this.killDebris(i);
      }
    }
    const a = this.rubAgg; if (a.n) { this.ev('rubble', a.x / a.c, a.y / a.c, a.z / a.c, a.n, a.mat); a.n = 0; a.x = a.y = a.z = 0; a.c = 0; }
  }
  /** lay n rubble voxels at a column with a sandpile rule: a grain slides while a neighbour column is at least one lower */
  depositRubble(x, y, z, m, n) {
    const g = this.grid;
    if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) { this.led.offMap += n; return; }
    for (let k = 0; k < n; k++) {
      let X = x, Y = Math.max(y, 1), Z = z, u = 0;
      while (u < 10 && g.get(X, Y, Z)) { Y++; u++; }
      if (g.get(X, Y, Z) || Y >= WY - 1) { this.led.destroyed++; continue; }
      while (Y > 1 && !g.get(X, Y - 1, Z)) Y--;
      for (let s = 0; s < 6; s++) {
        const h = hash3(X, Y, Z, k + s) & 3; let moved = false;
        for (let q = 0; q < 4 && !moved; q++) {
          const dd = (h + q) & 3, nx = X + (dd === 0 ? 1 : dd === 1 ? -1 : 0), nz = Z + (dd === 2 ? 1 : dd === 3 ? -1 : 0);
          if (nx < 1 || nz < 1 || nx >= WX - 1 || nz >= WZ - 1) continue;
          if (!g.get(nx, Y, nz) && !g.get(nx, Y - 1, nz)) { X = nx; Z = nz; while (Y > 1 && !g.get(X, Y - 1, Z)) Y--; moved = true; }
        }
        if (!moved) break;
      }
      g.set(X, Y, Z, m); this.led.rubbleLaid++;
    }
  }

  // ---------------------------------------------------------------- sprites (render-only matter: dust, smoke, sparks, fire)
  sprite(x, y, z, size, r, g, b, a, kind, vx, vy, vz, life, grow, glow = 1, stretch = 0) {
    if (this.nSp >= this.spCap * Math.min(1, this.fx)) return;
    const i = this.nSp++, o = i * 12, p = i * 6, s = this.sp, e = this.spx;
    s[o] = x; s[o + 1] = y; s[o + 2] = z; s[o + 3] = size; s[o + 4] = r; s[o + 5] = g; s[o + 6] = b; s[o + 7] = a; s[o + 8] = kind; s[o + 9] = ((i * 2654435761) >>> 8 & 1023) / 1023; s[o + 10] = glow; s[o + 11] = stretch;
    e[p] = vx; e[p + 1] = vy; e[p + 2] = vz; e[p + 3] = life; e[p + 4] = life; e[p + 5] = grow;
  }
  dust(x, y, z, n, spread, size, life, alpha = 0.6, r = 0.62, g = 0.6, b = 0.56) {
    n = Math.round(n * this.fx);
    for (let i = 0; i < n; i++) {
      const h = hash3(i, this.step, this.nSp, 21), a = (h & 1023) / 1023 * 6.283, rr = ((h >> 10) & 1023) / 1023, u = ((h >> 20) & 1023) / 1023;
      const d = spread * Math.sqrt(rr);
      this.sprite(x + Math.cos(a) * d, y + (u - 0.3) * spread * 0.6, z + Math.sin(a) * d, size * (0.6 + 0.8 * u), r, g, b, alpha * (0.5 + 0.5 * rr), 1, Math.cos(a) * (0.4 + rr) * 1.2, 0.2 + u * 0.7, Math.sin(a) * (0.4 + rr) * 1.2, life * (0.7 + 0.6 * u), 0.5 + size * 0.5);
    }
  }
  blastFx(x, y, z, r, power) {
    const n = Math.round(6 * this.fx + r * 2.5);
    for (let i = 0; i < n; i++) { const h = hash3(i, this.step, 7, 3), a = (h & 1023) / 1023 * 6.283, e = ((h >> 10) & 1023) / 1023 * 1.57, u = ((h >> 20) & 1023) / 1023, d = r * 0.5 * u; const dx = Math.cos(a) * Math.cos(e), dy = Math.sin(e), dz = Math.sin(a) * Math.cos(e);
      this.sprite(x + dx * d, y + dy * d, z + dz * d, r * (0.5 + 0.5 * u), 1, 0.8, 0.5, 1, 4, dx * r * 2.5, dy * r * 2.5 + 1, dz * r * 2.5, 0.28 + 0.2 * u, r * 3, 9, 0.2);
      if (i & 1) this.sprite(x + dx * d, y + dy * d, z + dz * d, r * (0.3 + 0.3 * u), 0.42, 0.41, 0.4, 0.4, 2, dx * r * 1.6, dy * r * 1.4 + 1.5, dz * r * 1.6, 1.4 + 1.6 * u, r * 0.5);
    }
    for (let i = 0; i < 26 * this.fx; i++) { const h = hash3(i, this.step, 9, 4), a = (h & 1023) / 1023 * 6.283, e = ((h >> 10) & 1023) / 1023 * 1.4, u = ((h >> 20) & 1023) / 1023, sp = (6 + 12 * u) * Math.sqrt(r); this.sprite(x, y, z, 0.05 + 0.05 * u, 1, 0.7, 0.3, 1, 3, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, 0.4 + 0.7 * u, 0, 6); }
    this.dust(x, Math.max(y, GY * 0.1 + 0.2), z, 8 + r * 4, r * 1.2, 0.6 + r * 0.3, 1.8 + r * 0.5, 0.35);
  }
  stepSprites(dt) {
    const s = this.sp, e = this.spx;
    for (let i = this.nSp - 1; i >= 0; i--) {
      const o = i * 12, p = i * 6, kind = s[o + 8];
      e[p + 3] -= dt;
      if (e[p + 3] <= 0) { const l = --this.nSp; if (i !== l) { s.copyWithin(o, l * 12, l * 12 + 12); e.copyWithin(p, l * 6, l * 6 + 6); } continue; }
      const t = e[p + 3] / e[p + 4];
      if (kind === 3) { e[p + 1] -= G * dt; s[o + 7] = t; }
      else if (kind === 4) { s[o + 7] = Math.min(1, t * 2.5); e[p] *= 0.9; e[p + 1] *= 0.92; e[p + 2] *= 0.9; }
      else { const dr = Math.exp(-dt * (kind === 1 ? 2.2 : 1.2)); e[p] *= dr; e[p + 2] *= dr; e[p + 1] = e[p + 1] * dr + (kind === 2 ? 0.9 : 0.12) * dt; if (t < 0.7) s[o + 7] *= Math.exp(-dt * 3.5 / Math.max(e[p + 4], 0.5)); }
      s[o] += e[p] * dt; s[o + 1] += e[p + 1] * dt; s[o + 2] += e[p + 2] * dt; s[o + 3] += e[p + 5] * dt * (kind === 4 ? 1 : t);
    }
  }

  // ---------------------------------------------------------------- fire (destruction.md §7, §12.9)
  /** flammable voxels with a face open to air inside the sphere catch with chance x heat; returns the number lit */
  ignite(cx, cy, cz, r, heat = 1) {
    const g = this.grid, R = r * 10, vx = cx * 10, vy = cy * 10, vz = cz * 10; let lit = 0;
    for (let y = Math.max(GY, Math.floor(vy - R)); y <= Math.min(WY - 1, vy + R); y++) for (let z = Math.max(0, Math.floor(vz - R)); z <= Math.min(WZ - 1, vz + R); z++) for (let x = Math.max(0, Math.floor(vx - R)); x <= Math.min(WX - 1, vx + R); x++) {
      const m = g.get(x, y, z); if (!m || !(flags[m] & F.FLAMMABLE)) continue;
      if ((x + 0.5 - vx) ** 2 + (y + 0.5 - vy) ** 2 + (z + 0.5 - vz) ** 2 > R * R) continue;
      if (hash3f(x, y, z, this.step) > burnChance[m] * heat * 0.5) continue;
      if (this.light(x, y, z, m)) lit++;
    }
    if (lit) this.ev('ignite', cx, cy, cz, lit / 500, 0, 0, 0);
    return lit;
  }
  light(x, y, z, m) {
    const k = KEY(x, y, z); if (this.fire.has(k) || this.fire.size > 9000) return false;
    const g = this.grid;
    if (g.get(x + 1, y, z) && g.get(x - 1, y, z) && g.get(x, y + 1, z) && g.get(x, y - 1, z) && g.get(x, y, z + 1) && g.get(x, y, z - 1)) return false;
    if (flags[m] & F.EXPLOSIVE) { this.fuseFuel(x, y, z, 0.5 + (hash3(x, y, z, 4) % 100) * 0.008); return true; }
    this.fire.set(k, burnTime[m] * (0.7 + 0.6 * hash3f(x, y, z, 6))); this.fireStats.lit++;
    return true;
  }
  stepFire(dt) {
    if (!this.fire.size) { this.fireStats.burning = 0; return; }
    const g = this.grid, phase = this.step % 6; let i = 0, sx = 0, sy = 0, sz = 0;
    for (const [k, t] of this.fire) {
      if ((i++ % 6) !== phase) continue; // each voxel is visited 10 times a second
      const x = k & 2047, y = (k >> 11) & 511, z = k >> 20, m = g.get(x, y, z);
      if (!m || !(flags[m] & F.FLAMMABLE)) { this.fire.delete(k); continue; }
      const nt = t - dt * 6;
      const h = hash3(x, y, z, this.step);
      if ((h & 31) < 3) { const u = ((h >> 8) & 255) / 255; this.sprite((x + 0.5) * 0.1, (y + 1) * 0.1, (z + 0.5) * 0.1, 0.25 + 0.3 * u, 1, 0.6, 0.25, 0.9, 4, 0, 0.9 + u, 0, 0.35 + 0.3 * u, 0.2, 5, 0.8 + u); if ((h & 31) === 0) this.sprite((x + 0.5) * 0.1, (y + 3) * 0.1, (z + 0.5) * 0.1, 0.4, 0.16, 0.15, 0.14, 0.4, 2, 0, 1.4, 0, 2.5 + 2 * u, 0.5); }
      // spread to the 6 neighbours, and one hop of up to 2 voxels (heat rises)
      for (let q = 0; q < 7; q++) {
        const hh = hash3(x, y, z, this.step * 7 + q);
        const nx = q < 6 ? x + (q === 0 ? 1 : q === 1 ? -1 : 0) : x + (hh & 3) - 1, ny = q < 6 ? y + (q === 2 ? 1 : q === 3 ? -1 : 0) : y + 1 + ((hh >> 2) & 1), nz = q < 6 ? z + (q === 4 ? 1 : q === 5 ? -1 : 0) : z + ((hh >> 3) & 3) - 1;
        const nm = g.get(nx, ny, nz); if (!nm || !(flags[nm] & F.FLAMMABLE)) continue;
        if ((hh >>> 8) / 16777216 < burnChance[nm] * dt * 6 * (q === 2 || q === 6 ? 1.6 : q === 3 ? 0.5 : 1) * 0.55) this.light(nx, ny, nz, nm);
      }
      if (nt <= 0) {
        this.fire.delete(k);
        const to = burnsTo[m];
        if (to) { g.set(x, y, z, to); this.fireStats.charred++; }
        else { g.set(x, y, z, 0); this.led.burnt++; this.fireStats.consumed++; }
        this.seedAround(x, y, z);
      } else this.fire.set(k, nt);
      sx += x; sy += y; sz += z;
    }
    this.fireStats.burning = this.fire.size;
    if (i && this.step % 20 === 0) { const n = Math.max(1, Math.floor(i / 6)); this.fireAt = [sx / n * 0.1, sy / n * 0.1, sz / n * 0.1]; }
  }
  /** a fuel voxel was reached by heat or a blast: its whole drum goes off after `delay` seconds */
  fuseFuel(x, y, z, delay) { if (this.fuses.length < 64) this.fuses.push({ t: delay, x, y, z, fuel: true }); }
  stepFuses(dt) {
    for (let i = this.fuses.length - 1; i >= 0; i--) {
      const f = this.fuses[i]; f.t -= dt; if (f.t > 0) continue;
      this.fuses.splice(i, 1);
      if (f.fuel) {
        const g = this.grid; if (!(flags[g.get(f.x, f.y, f.z)] & F.EXPLOSIVE)) continue;
        // flood the connected fuel, remove it, blast at its centroid
        const st = [KEY(f.x, f.y, f.z)]; let n = 0, sx = 0, sy = 0, sz = 0; g.set(f.x, f.y, f.z, 0);
        while (st.length && n < 3000) { const k = st.pop(), x = k & 2047, y = (k >> 11) & 511, z = k >> 20; n++; sx += x; sy += y; sz += z; this.seedAround(x, y, z);
          for (let q = 0; q < 6; q++) { const nx = x + (q === 0 ? 1 : q === 1 ? -1 : 0), ny = y + (q === 2 ? 1 : q === 3 ? -1 : 0), nz = z + (q === 4 ? 1 : q === 5 ? -1 : 0); if (flags[g.get(nx, ny, nz)] & F.EXPLOSIVE) { g.set(nx, ny, nz, 0); st.push(KEY(nx, ny, nz)); } } }
        this.led.burnt += n; this.fireStats.explosives += n;
        this.explode((sx / n + 0.5) * 0.1, (sy / n + 0.5) * 0.1, (sz / n + 0.5) * 0.1, Math.min(3.2, 0.9 + Math.cbrt(n) * 0.14), 1.2, 4);
        this.ignite((sx / n) * 0.1, (sy / n) * 0.1, (sz / n) * 0.1, 2.2, 2);
      } else this.explode(f.x, f.y, f.z, f.r, f.p, f.kind);
    }
  }

  // ---------------------------------------------------------------- queries
  /** DDA ray through the world grid; returns {t, x, y, z (voxel), nx, ny, nz, m} or null */
  raycast(ox, oy, oz, dx, dy, dz, maxT = 200) {
    const g = this.grid; let x = Math.floor(ox * 10), y = Math.floor(oy * 10), z = Math.floor(oz * 10);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(0.1 / (dx || 1e-9)), tdy = Math.abs(0.1 / (dy || 1e-9)), tdz = Math.abs(0.1 / (dz || 1e-9));
    let tx = ((dx > 0 ? x + 1 : x) * 0.1 - ox) / (dx || 1e-9), ty = ((dy > 0 ? y + 1 : y) * 0.1 - oy) / (dy || 1e-9), tz = ((dz > 0 ? z + 1 : z) * 0.1 - oz) / (dz || 1e-9);
    let t = 0, nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < 6000 && t < maxT; i++) {
      if (y < 0 || (y >= WY && dy >= 0) || ((x < 0 || x >= WX) && (x - WX / 2) * dx > 0) || ((z < 0 || z >= WZ) && (z - WZ / 2) * dz > 0)) return null;
      const m = g.get(x, y, z);
      if (m) return { t, x, y, z, nx, ny, nz, m, px: ox + dx * t, py: oy + dy * t, pz: oz + dz * t };
      if (tx < ty && tx < tz) { t = tx; tx += tdx; x += sx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { t = ty; ty += tdy; y += sy; nx = 0; ny = -sy; nz = 0; }
      else { t = tz; tz += tdz; z += sz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
  /** top solid voxel + 1 in a column at or below yTop (voxel units) */
  groundY(x, z, yTop) { const g = this.grid; let y = Math.min(WY - 1, yTop); while (y > 0 && !g.get(x, y, z)) y--; return y + 1; }
  /** where every voxel is now; leak must stay 0 */
  ledger() {
    const L = this.led, pieces = this.bodies.voxels();
    return { world: this.grid.solid, pieces, debris: L.debris, destroyed: L.destroyed, burnt: L.burnt, offMap: L.offMap, rubbleLaid: L.rubbleLaid, baked: L.baked, built: L.built, leak: L.built - (this.grid.solid + pieces + L.debris + L.destroyed + L.burnt + L.offMap) + this.owed };
  }
  digest() {
    let h = 0x811c9dc5; const g = this.grid;
    for (let id = 0; id < g.nChunks; id++) if (g.chunks[id] && g.count[id]) h = digestBytes(g.chunks[id], h ^ id);
    for (const b of this.bodies.list) h = Math.imul(h ^ ((b.x * 1000) | 0) ^ ((b.y * 1000) << 8) ^ ((b.z * 1000) << 16), 0x01000193) >>> 0;
    return (h ^ this.d.n) >>> 0;
  }

  // ---------------------------------------------------------------- one fixed step
  tick() {
    const dt = SIM_DT;
    this.step++; this.time += dt;
    this.stepFuses(dt);
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (this.projectiles[i].step(this, dt)) this.projectiles.splice(i, 1);
    this.bodies.step(dt);
    this.stepDebris(dt);
    this.stepFire(dt);
    this.checkIslands();
    this.stepStress();
    if (this.spin && --this.spin.frames <= 0) this.spin = null;
    this.stepSprites(dt);
  }
}
