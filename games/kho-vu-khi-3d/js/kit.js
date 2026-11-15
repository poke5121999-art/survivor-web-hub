// Authoring kit. Melee/tool parts are written in centimetres (frame: +Y toward the tip, +X toward the edge, flat
// faces +/-Z) and converted to metres before Saltline's vertex painting runs (its noise is metre-scaled).
// Guns are written in metres in Saltline's own gun frame (forward = -Z, the helpers take forward as +value) with the
// PAC-9 helpers (box/sidePlate/railProfile/lathe/pin/slot) and turned to +X at the end.
// Geometry primitives are Saltline's (js/sl/gun-sl.js): bevelled rounded box Wi, ExtrudeGeometry with bevel + flat
// side normals (__ + M_), lathe Cn with custom normals, pins Fi, stadium slots Dv, tubes Fn, vertex paint sm, merge Ii.
import * as THREE from '../vendor/three.module.min.js';
import {
  roundedBox, extrudeShape, flatSides, lathe as slLathe, tubePath, mergeParts, paintVerts, boxEdge, bevelEdge, hash3,
  box as slBox, sidePlate, railProfile, pin as slPin, slot as slSlot, chamferRect,
} from './sl/gun-sl.js';

const D2R = Math.PI / 180;
export const rgb = (hex, m = 1) => [((hex >> 16) & 255) / 255 * m, ((hex >> 8) & 255) / 255 * m, (hex & 255) / 255 * m];
const anyEdge = (x, y, z) => Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) < 0.95;

// ---------- geometry (cm) ----------
export const G = {
  box: (w, h, d, b = 0.2) => roundedBox(w, h, d, b),
  /** lathe around +Y. profile [[r, y], ...] */
  lathe(prof, seg = 16) { const g = slLathe(prof.map(([r, y]) => [r, y]), seg, [1, 1, 1]); g.rotateX(Math.PI / 2); return g; },
  /** chamfered cylinder from y=0 to y=h */
  cyl(r0, r1, h, seg = 16, b = 0.15) { b = Math.min(b, r0 * 0.4, r1 * 0.4, h * 0.3); return G.lathe([[0, 0], [r0 - b, 0], [r0, b], [r1, h - b], [r1 - b, h], [0, h]], seg); },
  /** open tube (pipe) with wall thickness */
  pipe(r, h, wall = 0.25, seg = 18, b = 0.08) { const ri = r - wall; return G.lathe([[ri, 0], [r - b, 0], [r, b], [r, h - b], [r - b, h], [ri, h], [ri, 0]], seg); },
  /** outline [[x,y]...] extruded along Z, centred, bevel b, holes [[[x,y]...]] */
  extrude(outline, d, b = 0.15, holes = null) {
    b = Math.min(b, d * 0.45);
    const g = extrudeShape(outline, d, b, holes); flatSides(g); g.translate(0, 0, -(d - 2 * b) / 2); return g;
  },
  /**
   * Blade: extruded outline thinned toward its cutting edge (flat grind). edge = list of outline index ranges
   * [[i0,i1],...] (inclusive, wraps) forming the sharpened edge; grind = width of the grind in cm; thin = edge
   * thickness ratio. Each outline vertex is thinned by its distance to the edge polyline.
   */
  blade(outline, { d = 0.5, b = 0.08, edge = null, grind = 1.2, thin = 0.12, holes = null } = {}) {
    const g = G.extrude(outline, d, b, holes);
    if (edge) {
      const segs = [];
      const n = outline.length;
      for (const [i0, i1] of edge) { let i = i0; while (i !== i1) { const j = (i + 1) % n; segs.push([outline[i], outline[j]]); i = j; } }
      const dist = (x, y) => { let best = 1e9; for (const [a, c] of segs) { const vx = c[0] - a[0], vy = c[1] - a[1], L = vx * vx + vy * vy || 1e-9; let t = ((x - a[0]) * vx + (y - a[1]) * vy) / L; t = Math.max(0, Math.min(1, t)); best = Math.min(best, Math.hypot(x - a[0] - vx * t, y - a[1] - vy * t)); } return best; };
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const dd = dist(p.getX(i), p.getY(i)); const t = Math.min(1, dd / grind); const s = thin + (1 - thin) * (t * t * (3 - 2 * t));
        p.setZ(i, p.getZ(i) * s);
      }
      g.deleteAttribute('normal'); g.computeVertexNormals();
    }
    return g;
  },
  /** tube along points (cm) */
  tube(pts, r, seg = 10) { return tubePath(pts, r, seg); },
  torus(R, r, seg = 24, tube = 8, arc = Math.PI * 2) { return new THREE.TorusGeometry(R, r, tube, seg, arc); },
  /** regular polygon ring (hex nut / ring pommel) in XY, thickness d */
  ringPoly(R, r, d, n = 6, b = 0.12, rot = 0) {
    const out = [], inn = [];
    for (let i = 0; i < n; i++) { const a = rot + i / n * Math.PI * 2; out.push([Math.cos(a) * R, Math.sin(a) * R]); }
    for (let i = 0; i < 20; i++) { const a = -i / 20 * Math.PI * 2; inn.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return G.extrude(out, d, b, [inn]);
  },
  /** nail: head + shank + point, along +Y, length L cm */
  nail(L = 5, r = 0.14) { return G.lathe([[0, 0], [r * 0.15, 0.02], [r, L * 0.18], [r, L - 0.12], [r * 2.6, L - 0.1], [r * 2.6, L], [0, L + 0.02]], 6); },
  cone(r, h, seg = 8) { return G.lathe([[0, 0], [r, 0], [0, h]], seg); },
};

// ---------- outline helpers (cm) ----------
export function arc(cx, cy, r, a0, a1, n = 12) { const o = []; for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * D2R; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; }
/** saw teeth from a to b, n teeth of height h on the right side of a->b */
export function teeth(a, b, n, h, rake = 0.35) {
  const o = [], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = dy / L, ny = -dx / L;
  for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, tm = t0 + (t1 - t0) * rake;
    o.push([a[0] + dx * t0, a[1] + dy * t0]); o.push([a[0] + dx * tm + nx * h, a[1] + dy * tm + ny * h]); }
  o.push([b[0], b[1]]);
  return o;
}
export function roundPoly(pts, r, n = 3) {
  const o = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[(i + pts.length - 1) % pts.length], c = pts[(i + 1) % pts.length];
    const v1 = [a[0] - p[0], a[1] - p[1]], v2 = [c[0] - p[0], c[1] - p[1]], l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const k = Math.min(r, l1 * 0.45, l2 * 0.45), s = [p[0] + v1[0] / l1 * k, p[1] + v1[1] / l1 * k], e = [p[0] + v2[0] / l2 * k, p[1] + v2[1] / l2 * k];
    for (let j = 0; j <= n; j++) { const t = j / n, u = 1 - t; o.push([u * u * s[0] + 2 * u * t * p[0] + t * t * e[0], u * u * s[1] + 2 * u * t * p[1] + t * t * e[1]]); }
  }
  return o;
}

// ---------- the kit ----------
const GRAIN_TO_X = { x: null, y: [0, 0, -Math.PI / 2], z: [0, Math.PI / 2, 0] };   // geometry rotation so grain axis = object X
const GRAIN_BACK = { x: null, y: [0, 0, Math.PI / 2], z: [0, -Math.PI / 2, 0] };

export class Kit {
  constructor(mats, seed = 1, variant = 0, unit = 0.01) {
    this.mats = mats; this.seed = seed; this.variant = variant; this.unit = unit;
    this.parts = []; this.sock = {}; this.stack = []; this.extras = [];
    this.bloodScale = variant === 1 ? 0 : 1; this.grimeAdd = variant === 1 ? 0.35 : 0;
    this.rnd = mulberry(seed * 7919 + 13);
  }
  /** push a transform for the parts added inside fn: {p:[x,y,z], r:[deg...], s} */
  xf(t, fn) { this.stack.push(t); fn(); this.stack.pop(); }
  /**
   * Add a geometry. m = material kind ('steel', 'wood', ...) or [kind, colorHex, scale] or {gun:'ano'}.
   * o: p, r (deg, XYZ), s, col (hex or [r,g,b] vertex multiplier), wear (edge specks), blood, grime, grain ('x'|'y'|'z'),
   *    keep (keep the geometry's own vertex colours).
   */
  add(geo, m, o = {}) {
    const g = geo.index ? geo : geo; // geometries are fresh from G.*; no clone needed
    const mtx = new THREE.Matrix4();
    const T = (t) => { const e = new THREE.Euler(...(t.r || [0, 0, 0]).map((v) => v * D2R)); const s = t.s ?? 1; const sv = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s); return new THREE.Matrix4().compose(new THREE.Vector3(...(t.p || [0, 0, 0])), new THREE.Quaternion().setFromEuler(e), sv); };
    mtx.copy(T(o));
    for (let i = this.stack.length - 1; i >= 0; i--) mtx.premultiply(T(this.stack[i]));
    g.applyMatrix4(mtx);
    if (this.unit !== 1) g.scale(this.unit, this.unit, this.unit);
    if (!g.attributes.normal) g.computeVertexNormals();
    const col = o.col === undefined ? [1, 1, 1] : Array.isArray(o.col) ? o.col : rgb(o.col);
    if (!o.keep) paintVerts(g, col, o.wear ?? 0, anyEdge);
    const n = g.attributes.position.count, uv = new Float32Array(n * 2);
    const bw = Math.min(0.999, Math.max(0, (o.blood ?? 0) * this.bloodScale)), gw = Math.min(1, (o.grime ?? 0) + this.grimeAdd);
    const sx = (this.seed % 97) + 0.25 + bw * 0.5;
    for (let i = 0; i < n; i++) { uv[i * 2] = sx; uv[i * 2 + 1] = gw; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    const mk = Array.isArray(m) ? m : typeof m === 'string' ? [m] : m;
    this.parts.push({ g, m: mk, grain: o.grain || 'y' });
    return g;
  }
  /** flat decal quad (Saltline decal/label material), w x h in authoring units, placed with p / r (deg) */
  decal(dec, h, p, r = [0, 0, 0], w = null) {
    const u = this.unit, ww = (w ?? h * dec.aspect);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ww * u, h * u), dec.material);
    m.position.set(p[0] * u, p[1] * u, p[2] * u); m.rotation.set(...r.map((v) => v * D2R));
    m.castShadow = false; m.receiveShadow = true; m.renderOrder = 2; m.userData.countTris = false;
    this.extras.push(m); return m;
  }
  // sockets (in authoring units)
  grip(p, fwd = [0, 1, 0], up = [1, 0, 0]) { this.sock.grip = { pos: p, fwd, up }; }
  grip2(p, fwd = [0, 1, 0], up = [1, 0, 0]) { this.sock.grip2 = { pos: p, fwd, up }; }
  muzzle(p, dir = [1, 0, 0]) { this.sock.muzzle = { pos: p, dir }; }
  tip(p) { this.sock.tip = p; }
  edge(a, b) { this.sock.edge = { a, b }; }
  matOf(m) {
    if (m.gun) return this.mats.gun(m.gun);
    return this.mats.get(m[0], m[1], m[2]);
  }
  /** merge parts by material + grain into meshes; returns a Group */
  finish() {
    const buckets = new Map();
    for (const p of this.parts) {
      const key = (p.m.gun ? 'gun:' + p.m.gun : p.m.join(',')) + '|' + p.grain;
      if (!buckets.has(key)) buckets.set(key, { m: p.m, grain: p.grain, list: [] });
      buckets.get(key).list.push(p.g);
    }
    const group = new THREE.Group(); let tris = 0;
    for (const b of buckets.values()) {
      const rot = GRAIN_TO_X[b.grain];
      if (rot) for (const g of b.list) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
      const geo = mergeParts(b.list);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.matOf(b.m));
      if (rot) mesh.rotation.set(...GRAIN_BACK[b.grain]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.name = (b.m.gun ? b.m.gun : b.m[0]);
      group.add(mesh);
      tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    }
    for (const e of this.extras) { group.add(e); e.traverse((o) => { if (o.geometry && o.userData.countTris !== false) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); }
    group.userData.tris = Math.round(tris);
    return group;
  }
}

export function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Saltline gun helpers re-exported for gun builders (metres, forward = -Z, forward args positive)
export { slBox as gbox, sidePlate, railProfile, slLathe as glathe, slPin as gpin, slSlot as gslot, chamferRect, hash3, paintVerts, bevelEdge, boxEdge };
