// Voxel Lab - rigid voxel bodies: a custom box/point stepper (no physics library). Each body is a small
// VoxelGrid with mass, centre of mass and inertia from per-voxel density; it collides through sampled surface
// voxels against the world grid and other bodies, crushes what is weaker on hard impacts, pancakes storey by
// storey when it lands upright, fractures when it lands on its side, and is baked back into the world at rest.
// Techniques studied from Voxel Engine by mattshumer (spawn.co), analysis/destruction.md §5, §6, §12.5-§12.7; code is our own.
import { VoxelGrid } from '../grid.js';
import { M, F, flags, voxMass, fc, toughness, rubbleOf, friction } from '../materials.js';
import { hash3 } from '../hash.js';

const G = 9.81, TAU = 0.06; // TAU: assumed duration of an impact, turns closing speed into a deceleration
const MAXC = 1400;
const cpx = new Float32Array(MAXC), cpy = new Float32Array(MAXC), cpz = new Float32Array(MAXC), cnx = new Float32Array(MAXC), cny = new Float32Array(MAXC), cnz = new Float32Array(MAXC), cdp = new Float32Array(MAXC);
const cot = new Int16Array(MAXC), cma = new Uint8Array(MAXC), cmb = new Uint8Array(MAXC), cpt = new Int32Array(MAXC), cdone = new Uint8Array(MAXC);
const cvx = new Int32Array(MAXC * 3);
const nrm = [0, 0, 0, 0];

/** nearest way out of a solid cell: returns depth (voxels) and writes the direction to nrm[0..2] (grid frame) */
function exitNormal(grid, x, y, z, fx, fy, fz, vx, vy, vz, floorY) {
  let best = 1e9, bd = 2, bs = 1, bdist = 0.5;
  const vl = Math.hypot(vx, vy, vz) || 1;
  for (let d = 0; d < 3; d++) for (let s = -1; s <= 1; s += 2) {
    for (let k = 1; k <= 4; k++) {
      const X = x + (d === 0 ? s * k : 0), Y = y + (d === 1 ? s * k : 0), Z = z + (d === 2 ? s * k : 0);
      if (Y < floorY || grid.get(X, Y, Z)) continue;
      const f = d === 0 ? fx : d === 1 ? fy : fz, c = d === 0 ? x : d === 1 ? y : z;
      const dist = s > 0 ? (c + k) - f : f - (c - k + 1);
      const v = d === 0 ? vx : d === 1 ? vy : vz;
      const cost = dist + 0.9 * (1 + s * v / vl) - (d === 1 && s > 0 ? 0.15 : 0);
      if (cost < best) { best = cost; bd = d; bs = s; bdist = dist; }
      break;
    }
  }
  nrm[0] = bd === 0 ? bs : 0; nrm[1] = bd === 1 ? bs : 0; nrm[2] = bd === 2 ? bs : 0;
  if (best > 1e8) { nrm[0] = 0; nrm[1] = 1; nrm[2] = 0; return 0.5; }
  return Math.min(bdist, 3);
}

/** DDA through a grid in its own voxel units; returns {t, x, y, z, m, nx, ny, nz} or null */
export function rayGrid(grid, ox, oy, oz, dx, dy, dz, maxT) {
  // clip to the grid box
  let t0 = 0, t1 = maxT;
  const o = [ox, oy, oz], d = [dx, dy, dz], hi = [grid.sx, grid.sy, grid.sz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < 0 || o[a] >= hi[a]) return null; continue; }
    let ta = (0 - o[a]) / d[a], tb = (hi[a] - o[a]) / d[a]; if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return null;
  }
  let t = t0 + 1e-4, x = Math.floor(ox + dx * t), y = Math.floor(oy + dy * t), z = Math.floor(oz + dz * t);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(1 / (dx || 1e-9)), tdy = Math.abs(1 / (dy || 1e-9)), tdz = Math.abs(1 / (dz || 1e-9));
  let tx = ((dx > 0 ? x + 1 : x) - ox) / (dx || 1e-9), ty = ((dy > 0 ? y + 1 : y) - oy) / (dy || 1e-9), tz = ((dz > 0 ? z + 1 : z) - oz) / (dz || 1e-9);
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < 2000 && t <= t1; i++) {
    const m = grid.get(x, y, z);
    if (m) return { t, x, y, z, m, nx, ny, nz };
    if (tx < ty && tx < tz) { t = tx; tx += tdx; x += sx; nx = -sx; ny = 0; nz = 0; }
    else if (ty < tz) { t = ty; ty += tdy; y += sy; nx = 0; ny = -sy; nz = 0; }
    else { t = tz; tz += tdz; z += sz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}

class Body {
  constructor(grid, pat, S) {
    this.grid = grid; this.pat = pat; this.S = S;
    this.q = [0, 0, 0, 1]; this.R = new Float64Array(9); this.Iw = new Float64Array(9); this.Il = new Float64Array(9);
    this.x = 0; this.y = 0; this.z = 0; this.cl = [0, 0, 0]; this.o = [0, 0, 0];
    this.v = [0, 0, 0]; this.w = [0, 0, 0];
    this.mass = 1; this.voxels = 0; this.mat = M.concrete; this.massScale = 1;
    this.lo = [0, 0, 0]; this.hi = [0, 0, 0];
    this.pts = new Int16Array(0); this.nPts = 0; this.ptArea = 0.01; this.ptsAt = -99;
    this.sleep = 0; this.age = 0; this.cd = 0; this.gen = 0; this.dirty = false; this.needSplit = false; this.touch = 0;
    this.rope = null; this.toRubble = false; this.dead = false; this.view = null; this.sndCd = 0; this.radius = 1;
  }
  setR() {
    const [x, y, z, w] = this.q, R = this.R;
    R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - z * w); R[2] = 2 * (x * z + y * w);
    R[3] = 2 * (x * y + z * w); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - x * w);
    R[6] = 2 * (x * z - y * w); R[7] = 2 * (y * z + x * w); R[8] = 1 - 2 * (x * x + y * y);
    // world inverse inertia = R Il R^T
    const I = this.Il, W = this.Iw, t = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) t[i * 3 + j] = R[i * 3] * I[j] + R[i * 3 + 1] * I[3 + j] + R[i * 3 + 2] * I[6 + j];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) W[i * 3 + j] = t[i * 3] * R[j * 3] + t[i * 3 + 1] * R[j * 3 + 1] + t[i * 3 + 2] * R[j * 3 + 2];
    const c = this.cl;
    this.o[0] = this.x - (R[0] * c[0] + R[1] * c[1] + R[2] * c[2]); this.o[1] = this.y - (R[3] * c[0] + R[4] * c[1] + R[5] * c[2]); this.o[2] = this.z - (R[6] * c[0] + R[7] * c[1] + R[8] * c[2]);
  }
  /** mass, centre of mass and inertia from per-voxel density (destruction.md §12.5); keeps the origin where it is */
  massProps(first) {
    let Ms = 0, sx = 0, sy = 0, sz = 0, xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0, n = 0;
    const lo = this.lo, hi = this.hi; lo[0] = lo[1] = lo[2] = 1e9; hi[0] = hi[1] = hi[2] = -1;
    const cnt = new Uint32Array(256), sc = this.massScale;
    this.grid.forEach((x, y, z, m) => {
      const w = voxMass[m] * sc, px = (x + 0.5) * 0.1, py = (y + 0.5) * 0.1, pz = (z + 0.5) * 0.1;
      Ms += w; sx += w * px; sy += w * py; sz += w * pz; xx += w * px * px; yy += w * py * py; zz += w * pz * pz; xy += w * px * py; xz += w * px * pz; yz += w * py * pz; n++; cnt[m]++;
      if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z; if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z;
    });
    this.voxels = n; if (!n) return false;
    let b = 0; for (let i = 1; i < 256; i++) if (cnt[i] > b) { b = cnt[i]; this.mat = i; }
    const cx = sx / Ms, cy = sy / Ms, cz = sz / Ms, self = Ms * 0.01 / 6;
    const Ixx = yy + zz - Ms * (cy * cy + cz * cz) + self, Iyy = xx + zz - Ms * (cx * cx + cz * cz) + self, Izz = xx + yy - Ms * (cx * cx + cy * cy) + self;
    const Ixy = -(xy - Ms * cx * cy), Ixz = -(xz - Ms * cx * cz), Iyz = -(yz - Ms * cy * cz);
    const a = Ixx, bb = Ixy, c = Ixz, d = Iyy, e = Iyz, f = Izz;
    const det = a * (d * f - e * e) - bb * (bb * f - e * c) + c * (bb * e - d * c), id = 1 / (det || 1e-9), I = this.Il;
    I[0] = (d * f - e * e) * id; I[1] = (c * e - bb * f) * id; I[2] = (bb * e - c * d) * id;
    I[3] = I[1]; I[4] = (a * f - c * c) * id; I[5] = (bb * c - a * e) * id;
    I[6] = I[2]; I[7] = I[5]; I[8] = (a * d - bb * bb) * id;
    if (!first) { // shift the tracked point to the new centre of mass, carrying the velocity field
      const R = this.R, ox = cx - this.cl[0], oy = cy - this.cl[1], oz = cz - this.cl[2];
      const dx = R[0] * ox + R[1] * oy + R[2] * oz, dy = R[3] * ox + R[4] * oy + R[5] * oz, dz = R[6] * ox + R[7] * oy + R[8] * oz, w = this.w;
      this.x += dx; this.y += dy; this.z += dz;
      this.v[0] += w[1] * dz - w[2] * dy; this.v[1] += w[2] * dx - w[0] * dz; this.v[2] += w[0] * dy - w[1] * dx;
    }
    this.cl[0] = cx; this.cl[1] = cy; this.cl[2] = cz; this.mass = Ms; this.dirty = false;
    this.radius = 0.05 * Math.hypot(hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1);
    return true;
  }
  /** contact samples: one surface voxel per coarse cell, so coverage is even whatever the size */
  samplePoints(step) {
    const g = this.grid, n = this.voxels;
    const cell = Math.max(1, Math.min(12, Math.ceil(Math.sqrt(n / 1300))));
    const sub = n > 4000 ? 3 : 0; // test only a hashed quarter of the voxels of big bodies
    const best = new Map();
    g.forEach((x, y, z) => {
      const h = hash3(x, y, z, 17);
      if (sub && (h & sub) !== 0) return;
      if (g.get(x + 1, y, z) && g.get(x - 1, y, z) && g.get(x, y + 1, z) && g.get(x, y - 1, z) && g.get(x, y, z + 1) && g.get(x, y, z - 1)) return;
      const k = ((x / cell) | 0) + (((y / cell) | 0) << 10) + (((z / cell) | 0) << 20), o = best.get(k);
      if (o === undefined || h < o[0]) best.set(k, [h, x, y, z]);
    });
    const m = Math.min(best.size, MAXC - 8);
    if (this.pts.length < m * 3) this.pts = new Int16Array(m * 3);
    let i = 0; for (const v of best.values()) { if (i >= m) break; this.pts[i * 3] = v[1]; this.pts[i * 3 + 1] = v[2]; this.pts[i * 3 + 2] = v[3]; i++; }
    this.nPts = i; this.ptArea = cell * cell * 0.01; this.ptsAt = step; this.cell = cell;
  }
}

export class Bodies {
  constructor(world) { this.world = world; this.list = []; this.budget = 150; }
  clear() { for (const b of this.list) if (this.world.hooks.bodyRemoved) this.world.hooks.bodyRemoved(b); this.list = []; }
  voxels() { let n = 0; for (const b of this.list) n += b.voxels; return n; }
  awake() { let n = 0; for (const b of this.list) if (b.sleep < 30) n++; return n; }

  /** new body from a grid whose voxel (0,0,0) corner sits at world (ox,oy,oz) metres with rotation q */
  add(grid, pat, ox, oy, oz, q, S = 0.05, opt = {}) {
    const b = new Body(grid, pat, S);
    b.q = q.slice(); if (opt.massScale) b.massScale = opt.massScale;
    if (!b.massProps(true)) return null;
    b.cl = b.cl.slice();
    // world centre of mass = origin + R cl
    b.x = 0; b.y = 0; b.z = 0; const c = b.cl.slice(); b.cl = [0, 0, 0]; b.setR(); const R = b.R;
    b.x = ox + R[0] * c[0] + R[1] * c[1] + R[2] * c[2]; b.y = oy + R[3] * c[0] + R[4] * c[1] + R[5] * c[2]; b.z = oz + R[6] * c[0] + R[7] * c[1] + R[8] * c[2];
    b.cl = c; b.setR();
    if (opt.v) b.v = opt.v.slice(); if (opt.w) b.w = opt.w.slice();
    b.toRubble = !!opt.toRubble; b.gen = opt.gen || 0; b.cd = opt.cd || 0;
    b.samplePoints(this.world.step);
    this.list.push(b);
    if (this.world.hooks.bodyAdded) this.world.hooks.bodyAdded(b);
    return b;
  }
  remove(b) { b.dead = true; const i = this.list.indexOf(b); if (i >= 0) this.list.splice(i, 1); if (this.world.hooks.bodyRemoved) this.world.hooks.bodyRemoved(b); }

  /** body-local voxel -> world voxel coordinates (integers) */
  toWorldVox(b, lx, ly, lz, out) {
    const R = b.R, px = (lx + 0.5) * 0.1, py = (ly + 0.5) * 0.1, pz = (lz + 0.5) * 0.1;
    out[0] = Math.floor((b.o[0] + R[0] * px + R[1] * py + R[2] * pz) * 10); out[1] = Math.floor((b.o[1] + R[3] * px + R[4] * py + R[5] * pz) * 10); out[2] = Math.floor((b.o[2] + R[6] * px + R[7] * py + R[8] * pz) * 10);
  }
  /** remove a voxel of a body and spill it into the world as rubble, a cube or dust */
  spillFrom(b, lx, ly, lz, i) {
    const m = b.grid.set(lx, ly, lz, 0); if (!m) return 0;
    const o = [0, 0, 0]; this.toWorldVox(b, lx, ly, lz, o);
    this.world.spill(o[0], Math.max(o[1], 2), o[2], b.toRubble ? (rubbleOf[m] || m) : m, i);
    b.dirty = true; return 1;
  }
  crushSphereBody(b, lx, ly, lz, r, limitT) {
    const g = b.grid, R = Math.ceil(r); let n = 0;
    for (let y = ly - R; y <= ly + R; y++) for (let z = lz - R; z <= lz + R; z++) for (let x = lx - R; x <= lx + R; x++) {
      if ((x - lx) ** 2 + (y - ly) ** 2 + (z - lz) ** 2 > r * r) continue;
      const m = g.get(x, y, z); if (!m || toughness[m] > limitT) continue;
      n += this.spillFrom(b, x, y, z, n);
    }
    if (n > 30) b.needSplit = true;
    return n;
  }
  crushSphereWorld(wx, wy, wz, r, limitT) {
    const W = this.world, g = W.grid, R = Math.ceil(r); let n = 0;
    for (let y = Math.max(2, wy - R); y <= wy + R; y++) for (let z = wz - R; z <= wz + R; z++) for (let x = wx - R; x <= wx + R; x++) {
      if ((x - wx) ** 2 + (y - wy) ** 2 + (z - wz) ** 2 > r * r) continue;
      const m = g.get(x, y, z); if (!m || toughness[m] > limitT) continue;
      if (flags[m] & F.EXPLOSIVE) { W.fuseFuel(x, y, z, 0.05); continue; }
      W.crushVoxel(x, y, z, m, n); n++;
    }
    return n;
  }

  /** split a body into its connected pieces; returns true when it was replaced */
  split(b) {
    b.needSplit = false;
    const g = b.grid, sx = g.sx, sz = g.sz, L = sx * sz, lab = new Int32Array(sx * g.sy * sz);
    const comps = []; let stack = new Int32Array(4096);
    g.forEach((x, y, z) => {
      const i0 = x + sx * (z + sz * y); if (lab[i0]) return;
      const id = comps.length + 1, list = []; let sp = 0; stack[sp++] = i0; lab[i0] = id;
      while (sp) {
        const i = stack[--sp]; list.push(i);
        const X = i % sx, Z = ((i / sx) | 0) % sz, Y = (i / L) | 0;
        if (sp + 6 >= stack.length) { const a = new Int32Array(stack.length * 2); a.set(stack); stack = a; }
        if (X > 0 && !lab[i - 1] && g.get(X - 1, Y, Z)) { lab[i - 1] = id; stack[sp++] = i - 1; }
        if (X < sx - 1 && !lab[i + 1] && g.get(X + 1, Y, Z)) { lab[i + 1] = id; stack[sp++] = i + 1; }
        if (Z > 0 && !lab[i - sx] && g.get(X, Y, Z - 1)) { lab[i - sx] = id; stack[sp++] = i - sx; }
        if (Z < sz - 1 && !lab[i + sx] && g.get(X, Y, Z + 1)) { lab[i + sx] = id; stack[sp++] = i + sx; }
        if (Y > 0 && !lab[i - L] && g.get(X, Y - 1, Z)) { lab[i - L] = id; stack[sp++] = i - L; }
        if (Y < g.sy - 1 && !lab[i + L] && g.get(X, Y + 1, Z)) { lab[i + L] = id; stack[sp++] = i + L; }
      }
      comps.push(list);
    });
    if (comps.length <= 1) return false;
    const R = b.R, room = this.list.length < 200;
    for (const list of comps) {
      if (list.length < 12 || !room) { let k = 0; for (const i of list) this.spillFrom(b, i % sx, (i / L) | 0, ((i / sx) | 0) % sz, k++ * 5 + 1); continue; }
      let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1, y1 = -1, z1 = -1;
      for (const i of list) { const X = i % sx, Z = ((i / sx) | 0) % sz, Y = (i / L) | 0; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z; }
      const ng = new VoxelGrid(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1);
      for (const i of list) { const X = i % sx, Z = ((i / sx) | 0) % sz, Y = (i / L) | 0; ng.set(X - x0, Y - y0, Z - z0, g.get(X, Y, Z), g.wasSolid(X, Y, Z) ? 1 : 0); }
      const px = x0 * 0.1, py = y0 * 0.1, pz = z0 * 0.1;
      const nb = this.add(ng, [b.pat[0] + x0, b.pat[1] + y0, b.pat[2] + z0], b.o[0] + R[0] * px + R[1] * py + R[2] * pz, b.o[1] + R[3] * px + R[4] * py + R[5] * pz, b.o[2] + R[6] * px + R[7] * py + R[8] * pz, b.q, b.S, { toRubble: b.toRubble, gen: b.gen, cd: 3, w: b.w });
      if (nb) { const rx = nb.x - b.x, ry = nb.y - b.y, rz = nb.z - b.z, w = b.w; nb.v = [b.v[0] + w[1] * rz - w[2] * ry, b.v[1] + w[2] * rx - w[0] * rz, b.v[2] + w[0] * ry - w[1] * rx]; }
    }
    b.voxels = 0; this.remove(b);
    return true;
  }

  /**
   * An upright piece lands hard: run the level-1 stack check on the piece itself with the impact deceleration
   * a = v / TAU in place of g. The lowest overloaded band of storeys is crushed, the piece splits there, and the
   * part above keeps falling - floor by floor, which is what a pancake collapse is.
   */
  pancake(b, vclose) {
    const g = b.grid, H = g.sy, mass = new Float64Array(H), cap = new Float64Array(H);
    g.forEach((x, y, z, m) => { mass[y] += voxMass[m]; if (!(flags[m] & F.GLASS)) cap[y] += fc[m]; });
    const a = Math.max(G, vclose / TAU), ratios = new Float32Array(H); let W = 0, l0 = -1;
    for (let l = H - 1; l >= 0; l--) { if (cap[l] > 0 && W > 200) { ratios[l] = W * a / (cap[l] * 1e4 * b.S); if (ratios[l] >= 1) l0 = l; } W += mass[l]; }
    if (l0 < 0) return false;
    let l1 = l0; while (l1 + 1 < H && ratios[l1 + 1] >= 0.85 && l1 - l0 < 36) l1++;
    const W0 = this.world; W0.matCount.fill(0); let n = 0;
    const c = g.chunks, rem = [];
    g.forEach((x, y, z) => { if (y >= l0 && y <= l1) rem.push(x, y, z); });
    for (let i = 0; i < rem.length; i += 3) n += this.spillFrom(b, rem[i], rem[i + 1], rem[i + 2], n);
    const o = [0, 0, 0]; this.toWorldVox(b, (b.lo[0] + b.hi[0]) >> 1, (l0 + l1) >> 1, (b.lo[2] + b.hi[2]) >> 1, o);
    W0.stats.fractures += n;
    W0.ev('fracture', o[0] * 0.1, o[1] * 0.1, o[2] * 0.1, n, W0.dominant());
    W0.dust(o[0] * 0.1, o[1] * 0.1, o[2] * 0.1, Math.min(30, 6 + n / 150), (b.hi[0] - b.lo[0]) * 0.07, 1.0, 2.4, 0.45);
    b.v[0] *= 0.55; b.v[1] *= 0.55; b.v[2] *= 0.55; b.cd = 4; // crushing a storey takes most of the energy of the fall
    if (!this.split(b)) { if (!b.massProps(false)) this.remove(b); else b.samplePoints(W0.step); }
    return true;
  }
  /** a big piece lands on its side: cut it across its long axis near the hit with a ragged 1-voxel gap */
  fracture(b, lx, ly, lz) {
    const ext = [b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]];
    const ax = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2;
    if (ext[ax] < 24) return false;
    const c = [lx, ly, lz][ax], cuts = [];
    const h = hash3(lx, ly, lz, this.world.step);
    const c1 = Math.min(b.hi[ax] - 8, Math.max(b.lo[ax] + 8, c + (h % 17) - 8)); cuts.push(c1);
    if (ext[ax] > 70) { const c2 = c1 + (c1 - b.lo[ax] > b.hi[ax] - c1 ? -1 : 1) * (26 + ((h >> 8) % 20)); if (c2 > b.lo[ax] + 8 && c2 < b.hi[ax] - 8) cuts.push(c2); }
    const rem = []; const u = (ax + 1) % 3, w = (ax + 2) % 3;
    b.grid.forEach((x, y, z) => { const p = [x, y, z]; for (const ct of cuts) { const j = (hash3(p[u] >> 2, p[w] >> 2, ct, 5) % 3) - 1; if (p[ax] === ct + j) { rem.push(x, y, z); break; } } });
    if (!rem.length) return false;
    this.world.matCount.fill(0); let n = 0;
    for (let i = 0; i < rem.length; i += 3) n += this.spillFrom(b, rem[i], rem[i + 1], rem[i + 2], n);
    this.world.stats.fractures += n; b.gen++; b.cd = 12;
    this.world.ev('fracture', b.x, b.y, b.z, n, b.mat);
    if (!this.split(b)) { if (!b.massProps(false)) this.remove(b); else b.samplePoints(this.world.step); }
    return true;
  }

  /** resting piece becomes part of the world again ("resting debris is baked back into the world") */
  bake(b) {
    const W = this.world, g = W.grid, R = b.R, o = b.o, lo = b.lo, hi = b.hi;
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let i = 0; i < 8; i++) {
      const px = (i & 1 ? hi[0] + 1 : lo[0]) * 0.1, py = (i & 2 ? hi[1] + 1 : lo[1]) * 0.1, pz = (i & 4 ? hi[2] + 1 : lo[2]) * 0.1;
      const wx = o[0] + R[0] * px + R[1] * py + R[2] * pz, wy = o[1] + R[3] * px + R[4] * py + R[5] * pz, wz = o[2] + R[6] * px + R[7] * py + R[8] * pz;
      if (wx < x0) x0 = wx; if (wx > x1) x1 = wx; if (wy < y0) y0 = wy; if (wy > y1) y1 = wy; if (wz < z0) z0 = wz; if (wz > z1) z1 = wz;
    }
    const X0 = Math.max(0, Math.floor(x0 * 10)), X1 = Math.min(g.sx - 1, Math.floor(x1 * 10)), Y0 = Math.max(2, Math.floor(y0 * 10)), Y1 = Math.min(g.sy - 1, Math.floor(y1 * 10)), Z0 = Math.max(0, Math.floor(z0 * 10)), Z1 = Math.min(g.sz - 1, Math.floor(z1 * 10));
    let placed = 0; const bg = b.grid;
    for (let y = Y0; y <= Y1; y++) for (let z = Z0; z <= Z1; z++) {
      // local = R^T (p - o) * 10, stepped along x
      const dy = (y + 0.5) * 0.1 - o[1], dz = (z + 0.5) * 0.1 - o[2], dx0 = (X0 + 0.5) * 0.1 - o[0];
      let lx = (R[0] * dx0 + R[3] * dy + R[6] * dz) * 10, ly = (R[1] * dx0 + R[4] * dy + R[7] * dz) * 10, lz = (R[2] * dx0 + R[5] * dy + R[8] * dz) * 10;
      for (let x = X0; x <= X1; x++, lx += R[0], ly += R[1], lz += R[2]) {
        const m = bg.get(Math.floor(lx), Math.floor(ly), Math.floor(lz)); if (!m) continue;
        if (g.get(x, y, z)) continue;
        g.set(x, y, z, b.toRubble ? (rubbleOf[m] || m) : m); placed++;
      }
    }
    W.led.baked += placed;
    const lost = b.voxels - placed; if (lost > 0) W.led.destroyed += lost; else W.led.built += -lost; // rasterising a rotated piece can gain or lose a few
    b.voxels = 0; this.remove(b);
  }

  blast(cx, cy, cz, reach, P) {
    for (const b of this.list) {
      const dx = b.x - cx, dy = b.y - cy, dz = b.z - cz, d = Math.hypot(dx, dy, dz); if (d > reach + b.radius) continue;
      const k = (d < reach * 2 / 3 ? 1 : Math.max(0, (reach + b.radius - d) / (reach / 3 + b.radius))) * P * 16 / (1 + b.mass / 1200) / Math.max(d, 0.3);
      b.v[0] += dx * k; b.v[1] += dy * k + P * 1.5 / (1 + b.mass / 1200); b.v[2] += dz * k; b.w[0] += dz * k * 0.3; b.w[2] -= dx * k * 0.3; b.sleep = 0;
    }
  }
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null;
    for (const b of this.list) {
      const R = b.R, px = ox - b.o[0], py = oy - b.o[1], pz = oz - b.o[2];
      const lx = (R[0] * px + R[3] * py + R[6] * pz) * 10, ly = (R[1] * px + R[4] * py + R[7] * pz) * 10, lz = (R[2] * px + R[5] * py + R[8] * pz) * 10;
      const ex = R[0] * dx + R[3] * dy + R[6] * dz, ey = R[1] * dx + R[4] * dy + R[7] * dz, ez = R[2] * dx + R[5] * dy + R[8] * dz;
      const h = rayGrid(b.grid, lx, ly, lz, ex, ey, ez, (best ? best.t : maxT) * 10);
      if (h) { h.t *= 0.1; if (!best || h.t < best.t) { h.body = b; h.px = ox + dx * h.t; h.py = oy + dy * h.t; h.pz = oz + dz * h.t; best = h; } }
    }
    return best;
  }

  impulse(b, rx, ry, rz, jx, jy, jz) {
    const im = 1 / b.mass, I = b.Iw; b.v[0] += jx * im; b.v[1] += jy * im; b.v[2] += jz * im;
    const tx = ry * jz - rz * jy, ty = rz * jx - rx * jz, tz = rx * jy - ry * jx;
    b.w[0] += I[0] * tx + I[1] * ty + I[2] * tz; b.w[1] += I[3] * tx + I[4] * ty + I[5] * tz; b.w[2] += I[6] * tx + I[7] * ty + I[8] * tz;
  }
  kTerm(b, rx, ry, rz, nx, ny, nz) {
    const I = b.Iw, tx = ry * nz - rz * ny, ty = rz * nx - rx * nz, tz = rx * ny - ry * nx;
    const ax = I[0] * tx + I[1] * ty + I[2] * tz, ay = I[3] * tx + I[4] * ty + I[5] * tz, az = I[6] * tx + I[7] * ty + I[8] * tz;
    return 1 / b.mass + nx * (ay * rz - az * ry) + ny * (az * rx - ax * rz) + nz * (ax * ry - ay * rx);
  }

  step(dt) {
    const W = this.world, wg = W.grid, list = this.list;
    // budget: beyond it the smallest slow pieces are turned into rubble at once (destruction.md §5 "Budget")
    if (list.length > this.budget) {
      const cand = list.filter(b => !b.rope && b.voxels < 400).sort((a, b) => a.voxels - b.voxels);
      for (let i = 0; i < Math.min(cand.length, list.length - this.budget); i++) { const b = cand[i]; let k = 0; const rem = []; b.grid.forEach((x, y, z) => rem.push(x, y, z)); for (let j = 0; j < rem.length; j += 3) this.spillFrom(b, rem[j], rem[j + 1], rem[j + 2], k++); b.voxels = 0; this.remove(b); }
    }
    for (let bi = list.length - 1; bi >= 0; bi--) {
      const b = list[bi]; if (!b || b.dead) continue;
      b.age++; if (b.cd > 0) b.cd--; if (b.sndCd > 0) b.sndCd--;
      if (b.dirty) { if (b.needSplit && this.split(b)) continue; if (!b.massProps(false)) { this.remove(b); continue; } b.setR(); if (W.step - b.ptsAt > 12) b.samplePoints(W.step); }
      b.v[1] -= G * dt;
      const ld = 0.9992, ad = b.touch > 0 ? 0.985 : 0.998; b.v[0] *= ld; b.v[2] *= ld; b.w[0] *= ad; b.w[1] *= ad; b.w[2] *= ad;
      b.setR();
      const R = b.R, o = b.o, v = b.v, w = b.w;
      // ---- contacts
      let nc = 0, maxClose = 0, mcI = -1, nClose = 0;
      const pts = b.pts, bgrid = b.grid;
      const others = [];
      for (const c of list) { if (c === b || c.dead) continue; const d = Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z); if (d < c.radius + b.radius + 0.1) others.push(c); }
      for (let i = 0; i < b.nPts && nc < MAXC; i++) {
        const lx = pts[i * 3], ly = pts[i * 3 + 1], lz = pts[i * 3 + 2], ma = bgrid.get(lx, ly, lz); if (!ma) continue;
        const px = (lx + 0.5) * 0.1, py = (ly + 0.5) * 0.1, pz = (lz + 0.5) * 0.1;
        const wx = o[0] + R[0] * px + R[1] * py + R[2] * pz, wy = o[1] + R[3] * px + R[4] * py + R[5] * pz, wz = o[2] + R[6] * px + R[7] * py + R[8] * pz;
        const rx = wx - b.x, ry = wy - b.y, rz = wz - b.z;
        const pvx = v[0] + w[1] * rz - w[2] * ry, pvy = v[1] + w[2] * rx - w[0] * rz, pvz = v[2] + w[0] * ry - w[1] * rx;
        const gx = Math.floor(wx * 10), gy = Math.floor(wy * 10), gz = Math.floor(wz * 10);
        let mb = gy < 2 ? M.bedrock : wg.get(gx, gy, gz);
        if (mb) {
          const dep = exitNormal(wg, gx, gy, gz, wx * 10, wy * 10, wz * 10, pvx, pvy, pvz, 0);
          cpx[nc] = wx; cpy[nc] = wy; cpz[nc] = wz; cnx[nc] = nrm[0]; cny[nc] = nrm[1]; cnz[nc] = nrm[2]; cdp[nc] = dep * 0.1; cot[nc] = -1; cma[nc] = ma; cmb[nc] = mb; cpt[nc] = i; cvx[nc * 3] = gx; cvx[nc * 3 + 1] = gy; cvx[nc * 3 + 2] = gz;
          const vn = pvx * nrm[0] + pvy * nrm[1] + pvz * nrm[2]; if (-vn > maxClose) { maxClose = -vn; mcI = nc; } if (vn < -1.8) nClose++;
          nc++; continue;
        }
        for (let oi = 0; oi < others.length; oi++) {
          const c = others[oi], Q = c.R, qx = wx - c.o[0], qy = wy - c.o[1], qz = wz - c.o[2];
          const ux = (Q[0] * qx + Q[3] * qy + Q[6] * qz) * 10, uy = (Q[1] * qx + Q[4] * qy + Q[7] * qz) * 10, uz = (Q[2] * qx + Q[5] * qy + Q[8] * qz) * 10;
          const cx = Math.floor(ux), cy = Math.floor(uy), cz = Math.floor(uz);
          mb = c.grid.get(cx, cy, cz); if (!mb) continue;
          const sx = wx - c.x, sy = wy - c.y, sz = wz - c.z;
          const rvx = pvx - (c.v[0] + c.w[1] * sz - c.w[2] * sy), rvy = pvy - (c.v[1] + c.w[2] * sx - c.w[0] * sz), rvz = pvz - (c.v[2] + c.w[0] * sy - c.w[1] * sx);
          const dep = exitNormal(c.grid, cx, cy, cz, ux, uy, uz, Q[0] * rvx + Q[3] * rvy + Q[6] * rvz, Q[1] * rvx + Q[4] * rvy + Q[7] * rvz, Q[2] * rvx + Q[5] * rvy + Q[8] * rvz, -1e9);
          const nx = Q[0] * nrm[0] + Q[1] * nrm[1] + Q[2] * nrm[2], ny = Q[3] * nrm[0] + Q[4] * nrm[1] + Q[5] * nrm[2], nz = Q[6] * nrm[0] + Q[7] * nrm[1] + Q[8] * nrm[2];
          cpx[nc] = wx; cpy[nc] = wy; cpz[nc] = wz; cnx[nc] = nx; cny[nc] = ny; cnz[nc] = nz; cdp[nc] = dep * 0.1; cot[nc] = oi; cma[nc] = ma; cmb[nc] = mb; cpt[nc] = i; cvx[nc * 3] = cx; cvx[nc * 3 + 1] = cy; cvx[nc * 3 + 2] = cz;
          const vn = rvx * nx + rvy * ny + rvz * nz; if (-vn > maxClose) { maxClose = -vn; mcI = nc; } if (vn < -1.8) nClose++;
          nc++; break;
        }
      }
      b.touch = nc;
      // ---- hard landing: dynamic load on what was hit, then pancake or fracture the piece itself
      if (nc && maxClose > 2.2 && b.mass > 1500 && !b.rope) {
        if (cot[mcI] < 0) {
          const s = W.structAt[(cvx[mcI * 3] >> 4) + (W.grid.sx >> 4) * (cvx[mcI * 3 + 2] >> 4)], st = s ? W.structures[s - 1] : null;
          if (st && st.cool <= 0 && cvx[mcI * 3 + 1] > st.y0 + 4) { st.dyn = { y: cvx[mcI * 3 + 1], F: b.mass * maxClose / TAU, frames: 3 }; st.anyDirty = true; }
        }
        if (b.cd <= 0) {
          const big = b.voxels > 2500;
          if (R[4] > 0.8 && this.pancake(b, maxClose)) continue;
          if (big && maxClose > 5 && b.gen < 2) { const i = cpt[mcI]; if (this.fracture(b, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2])) continue; }
        }
      }
      // ---- resolve (sequential impulses, 2 passes); pass 0 may crush instead of bouncing
      let jMax = 0, jI = -1, crushed = 0;
      for (let it = 0; it < 2; it++) for (let i = 0; i < nc; i++) {
        if (cdone[i] && it) continue; if (!it) cdone[i] = 0;
        const c = cot[i] >= 0 ? others[cot[i]] : null, nx = cnx[i], ny = cny[i], nz = cnz[i];
        const rx = cpx[i] - b.x, ry = cpy[i] - b.y, rz = cpz[i] - b.z;
        let rvx = v[0] + w[1] * rz - w[2] * ry, rvy = v[1] + w[2] * rx - w[0] * rz, rvz = v[2] + w[0] * ry - w[1] * rx, sx = 0, sy = 0, sz = 0;
        if (c) { sx = cpx[i] - c.x; sy = cpy[i] - c.y; sz = cpz[i] - c.z; rvx -= c.v[0] + c.w[1] * sz - c.w[2] * sy; rvy -= c.v[1] + c.w[2] * sx - c.w[0] * sz; rvz -= c.v[2] + c.w[0] * sy - c.w[1] * sx; }
        const vn = rvx * nx + rvy * ny + rvz * nz; if (vn >= 0) continue;
        let k = this.kTerm(b, rx, ry, rz, nx, ny, nz); if (c) k += this.kTerm(c, sx, sy, sz, nx, ny, nz);
        let j = -vn / k;
        if (!it && -vn > 1.8) {
          // energy of this hit against what it takes to crush the weaker side (toughness x 0.27 J per voxel)
          const E = 0.5 * vn * vn / k / (b.rope ? 1 : Math.max(1, nClose)), TA = toughness[cma[i]], TB = toughness[cmb[i]];
          if (E > 60) {
            let Ea = 0;
            if (TB <= TA * 1.3 && cmb[i] !== M.bedrock) { const ev = TB * 0.27, n = Math.min(E / ev, b.rope ? 500 : 120), r = Math.cbrt(n * 0.2387); if (n >= 1) { W.matCount.fill(0); const got = c ? this.crushSphereBody(c, cvx[i * 3], cvx[i * 3 + 1], cvx[i * 3 + 2], r, TA * 1.3) : this.crushSphereWorld(cvx[i * 3], cvx[i * 3 + 1], cvx[i * 3 + 2], r, TA * 1.3); Ea += got * ev; crushed += got; } }
            if (TA <= TB * 1.3 && !b.rope) { const ev = TA * 0.27, n = Math.min((E - Ea) / ev, 120), r = Math.cbrt(n * 0.2387); if (n >= 1) { const p = cpt[i]; const got = this.crushSphereBody(b, pts[p * 3], pts[p * 3 + 1], pts[p * 3 + 2], r, TB * 1.3); Ea += got * ev; crushed += got; } }
            if (Ea > 0 && Ea < E * 0.85) { j *= 1 - Math.sqrt(1 - Ea / E); cdone[i] = 1; } // punched through: only part of the speed is lost
          }
        }
        if (j > jMax) { jMax = j; jI = i; }
        this.impulse(b, rx, ry, rz, nx * j, ny * j, nz * j); if (c) { this.impulse(c, sx, sy, sz, -nx * j, -ny * j, -nz * j); c.sleep = 0; }
        if (cdone[i]) continue;
        // Coulomb friction
        const tx = rvx - vn * nx, ty = rvy - vn * ny, tz = rvz - vn * nz, tl = Math.hypot(tx, ty, tz);
        if (tl > 1e-4) { const mu = friction[cmb[i]] || 0.6, jt = Math.min(mu * j, tl / k) / tl; this.impulse(b, rx, ry, rz, -tx * jt, -ty * jt, -tz * jt); if (c) this.impulse(c, sx, sy, sz, tx * jt, ty * jt, tz * jt); }
      }
      if (jI >= 0 && b.sndCd <= 0 && jMax > 150 && maxClose > 1.2) { b.sndCd = 10; W.ev(b.mass > 2000 ? 'thud' : 'impact', cpx[jI], cpy[jI], cpz[jI], jMax, cmb[jI], maxClose); if (b.mass > 400) W.dust(cpx[jI], cpy[jI], cpz[jI], Math.min(8, 1 + b.mass / 3000), b.radius * 0.4, 0.5, 1.4, 0.35); }
      if (crushed > 12) W.ev('break', b.x, b.y - b.radius * 0.3, b.z, crushed, W.dominant());
      // ---- positional correction, then integrate
      if (nc) {
        let ax = 0, ay = 0, az = 0, n = 0; for (let i = 0; i < nc; i++) { if (cdone[i]) continue; const s = cot[i] >= 0 ? 0.5 : 1; ax += cnx[i] * cdp[i] * s; ay += cny[i] * cdp[i] * s; az += cnz[i] * cdp[i] * s; n++; }
        if (n) { ax = ax / n * 0.5; ay = ay / n * 0.5; az = az / n * 0.5; const l = Math.hypot(ax, ay, az); if (l > 0.04) { const s = 0.04 / l; ax *= s; ay *= s; az *= s; } b.x += ax; b.y += ay; b.z += az; }
      }
      const sp = Math.hypot(v[0], v[1], v[2]); if (sp > 45) { const s = 45 / sp; v[0] *= s; v[1] *= s; v[2] *= s; }
      b.x += v[0] * dt; b.y += v[1] * dt; b.z += v[2] * dt;
      const q = b.q, hx = w[0] * dt * 0.5, hy = w[1] * dt * 0.5, hz = w[2] * dt * 0.5;
      const qx = q[0] + hx * q[3] + hy * q[2] - hz * q[1], qy = q[1] + hy * q[3] + hz * q[0] - hx * q[2], qz = q[2] + hz * q[3] + hx * q[1] - hy * q[0], qw = q[3] - hx * q[0] - hy * q[1] - hz * q[2];
      const il = 1 / Math.hypot(qx, qy, qz, qw); q[0] = qx * il; q[1] = qy * il; q[2] = qz * il; q[3] = qw * il;
      if (b.rope) { // wrecking ball: a rope is a one-sided distance limit to the anchor
        const rp = b.rope, dx = b.x - rp.ax, dy = b.y - rp.ay, dz = b.z - rp.az, d = Math.hypot(dx, dy, dz);
        if (d > rp.L) { const nx = dx / d, ny = dy / d, nz = dz / d; b.x = rp.ax + nx * rp.L; b.y = rp.ay + ny * rp.L; b.z = rp.az + nz * rp.L; const vr = v[0] * nx + v[1] * ny + v[2] * nz; if (vr > 0) { v[0] -= vr * nx; v[1] -= vr * ny; v[2] -= vr * nz; } }
        if ((rp.life -= dt) <= 0) b.rope = null;
        b.setR(); continue;
      }
      b.setR();
      // ---- out of the world, or at rest -> baked into the grid
      if (b.y < -4 || b.x < 0.5 || b.z < 0.5 || b.x > wg.sx * 0.1 - 0.5 || b.z > wg.sz * 0.1 - 0.5) { W.led.offMap += b.voxels; b.voxels = 0; this.remove(b); continue; }
      const slow = sp < 0.35 && Math.hypot(w[0], w[1], w[2]) < 0.5;
      if (nc && slow) b.sleep++; else b.sleep = Math.max(0, b.sleep - 2);
      if (b.sleep > 36 || (b.age > 900 && nc && sp < 1.5)) this.bake(b);
    }
  }
}
