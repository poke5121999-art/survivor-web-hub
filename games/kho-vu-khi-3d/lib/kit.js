// Bevelled primitive helpers. All dimensions in CENTIMETRES; weapon.js bakes them to metres.
// Geometry is non-indexed with attributes position, normal, color, aInfo(edge,type,stripe).
import * as THREE from './three.js';
import { rng } from './rng.js';
const D2R = Math.PI / 180;
const V2 = (a) => new THREE.Vector2(a[0], a[1]);
const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export function rawGeo(pos, nor, edge) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.userData.edge = new Float32Array(edge);
  return g;
}

/** Transform + paint a raw geometry. o: p, r (deg XYZ), s, col, t (type 0 metal 1 paint 2 cloth 3 wood), stripe, edge */
export function paint(g, o = {}) {
  const n = g.attributes.position.count;
  const r = o.r || [0, 0, 0], p = o.p || [0, 0, 0];
  const s = typeof o.s === 'number' ? [o.s, o.s, o.s] : (o.s || [1, 1, 1]);
  _e.set(r[0] * D2R, r[1] * D2R, r[2] * D2R, 'XYZ'); _q.setFromEuler(_e);
  _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
  g.applyMatrix4(_m);
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = o.col instanceof THREE.Color ? o.col : new THREE.Color(o.col ?? 0x888888);
  const col = new Float32Array(n * 3), info = new Float32Array(n * 3);
  const edge = g.userData.edge;
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    info[i * 3] = o.edge ?? (edge ? edge[i] : 0); info[i * 3 + 1] = o.t || 0; info[i * 3 + 2] = o.stripe || 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
  g.computeBoundingBox();
  return g;
}

/** Extrude a 2D outline (XY plane) with a chamfer bevel; centred on z=0. Silhouette equals the outline. */
export function extrude(pts, depth, bev = 0.2, o = {}) {
  const sh = new THREE.Shape(pts.map(V2));
  for (const h of o.holes || []) sh.holes.push(new THREE.Path(h.map(V2)));
  const bt = Math.min(bev, depth * 0.499);
  const bs = o.bs ?? bev;
  const dd = Math.max(depth - 2 * bt, 0.002);
  let g = new THREE.ExtrudeGeometry(sh, { depth: dd, bevelEnabled: bev > 0, bevelThickness: bt, bevelSize: bs, bevelOffset: -bs, bevelSegments: 1, curveSegments: o.cs || 5, steps: 1 });
  g.translate(0, 0, -dd / 2);
  if (g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count, edge = new Float32Array(n);
  for (const gr of g.groups) if (gr.materialIndex === 1) edge.fill(1, gr.start, gr.start + gr.count);
  g.userData.edge = edge;
  return g;
}

/** Lathe about Y. profile: [[r, y, edgeFlag?]]; segment j uses the flag of point j. */
export function latheGeo(profile, seg = 8, smooth = false) {
  const pos = [], nor = [], edge = [];
  const ang = (i) => (i / seg) * Math.PI * 2;
  for (let j = 0; j < profile.length - 1; j++) {
    const [r0, y0, e = 0] = profile[j], [r1, y1] = profile[j + 1];
    const dr = r1 - r0, dy = y1 - y0, len = Math.hypot(dr, dy);
    if (len < 1e-6) continue;
    const nr = dy / len, ny = -dr / len;
    for (let i = 0; i < seg; i++) {
      const a0 = ang(i), a1 = ang(i + 1), am = (a0 + a1) / 2;
      const P = (r, y, a) => [Math.sin(a) * r, y, Math.cos(a) * r];
      const N = (a) => [Math.sin(a) * nr, ny, Math.cos(a) * nr];
      const A = P(r0, y0, a0), B = P(r0, y0, a1), C = P(r1, y1, a1), D = P(r1, y1, a0);
      const nA = smooth ? N(a0) : N(am), nB = smooth ? N(a1) : N(am);
      const push = (v, n_) => { pos.push(...v); nor.push(...n_); edge.push(e); };
      const tri = (v1, n1, v2, n2, v3, n3) => {
        const ux = v2[0] - v1[0], uy = v2[1] - v1[1], uz = v2[2] - v1[2], vx = v3[0] - v1[0], vy = v3[1] - v1[1], vz = v3[2] - v1[2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        if (cx * cx + cy * cy + cz * cz < 1e-12) return;
        const nn = [n1[0] + n2[0] + n3[0], n1[1] + n2[1] + n3[1], n1[2] + n2[2] + n3[2]];
        if (cx * nn[0] + cy * nn[1] + cz * nn[2] < 0) { push(v1, n1); push(v3, n3); push(v2, n2); }
        else { push(v1, n1); push(v2, n2); push(v3, n3); }
      };
      tri(A, nA, B, nB, C, nB); tri(A, nA, C, nB, D, nA);
    }
  }
  return rawGeo(pos, nor, edge);
}
/** chamfered cylinder profile (bottom radius rb at y=0, top radius rt at y=h) */
export function cylProfile(rt, rb, h, b = 0.15) {
  b = Math.min(b, rt * 0.6, rb * 0.6, h * 0.45);
  if (b <= 0) return [[0, 0], [rb, 0], [rt, h], [0, h]];
  return [[0, 0, 1], [rb - b, 0, 1], [rb, b, 0], [rt, h - b, 1], [rt - b, h, 1], [0, h]];
}

/** Sweep an n-gon along a polyline (parallel transport); r may be fn(t). */
export function sweepGeo(points, r, sides = 5, o = {}) {
  const P = points.map((p) => new THREE.Vector3(...p));
  const closed = !!o.closed, n = P.length;
  const rr = typeof r === 'function' ? r : () => r;
  const tang = P.map((p, i) => {
    const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    const t = (closed || (i > 0 && i < n - 1)) ? b.clone().sub(a) : (i === 0 ? P[1].clone().sub(P[0]) : P[n - 1].clone().sub(P[n - 2]));
    return t.normalize();
  });
  let ref = Math.abs(tang[0].z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  if (o.up) ref = new THREE.Vector3(...o.up);
  const rings = [];
  let prevN = null;
  for (let i = 0; i < n; i++) {
    let nn = (prevN || ref).clone(); nn.sub(tang[i].clone().multiplyScalar(nn.dot(tang[i])));
    if (nn.lengthSq() < 1e-8) nn = new THREE.Vector3(1, 0, 0);
    nn.normalize(); prevN = nn;
    const bb = tang[i].clone().cross(nn);
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + (o.rot || 0);
      const dir = nn.clone().multiplyScalar(Math.cos(a)).add(bb.clone().multiplyScalar(Math.sin(a)));
      ring.push({ p: P[i].clone().add(dir.clone().multiplyScalar(rr(i / (n - 1)))), n: dir });
    }
    rings.push(ring);
  }
  const pos = [], nor = [], edge = [];
  const quad = (a, b, c, d) => {
    const fn = b.p.clone().sub(a.p).cross(d.p.clone().sub(a.p)).normalize();
    const mid = a.n.clone().add(c.n).normalize();
    const flip = fn.dot(mid) < 0;
    if (flip) fn.negate();
    const t = (x, y, z) => { for (const v of (flip ? [x, z, y] : [x, y, z])) { pos.push(v.p.x, v.p.y, v.p.z); nor.push(fn.x, fn.y, fn.z); edge.push(0); } };
    t(a, b, c); t(a, c, d);
  };
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) for (let k = 0; k < sides; k++) quad(rings[i][k], rings[i][(k + 1) % sides], rings[(i + 1) % n][(k + 1) % sides], rings[(i + 1) % n][k]);
  if (!closed && !o.open) {
    for (const [ri, sgn] of [[0, -1], [n - 1, 1]]) {
      const c = P[ri], ring = rings[ri];
      for (let k = 0; k < sides; k++) {
        const a = ring[k], b = ring[(k + 1) % sides];
        const tn = tang[ri].clone().multiplyScalar(sgn);
        const fn = b.p.clone().sub(a.p).cross(c.clone().sub(a.p)).normalize();
        const vs = fn.dot(tn) >= 0 ? [a.p, b.p, c] : [b.p, a.p, c];
        for (const v of vs) { pos.push(v.x, v.y, v.z); nor.push(tn.x, tn.y, tn.z); edge.push(0); }
      }
    }
  }
  return rawGeo(pos, nor, edge);
}

// ---------- 2D outline generators (cm; x across, y along the blade, base at y=0) ----------
export const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * D2R; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
export function rect2(w, h, x = 0, y = 0) { return [[x - w / 2, y], [x + w / 2, y], [x + w / 2, y + h], [x - w / 2, y + h]]; }
/** teeth along segment a->b, sticking out to the left normal by d */
export function teeth(a, b, n, d, lean = 0.5) {
  const out = [], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + lean) / n;
    out.push([a[0] + dx * t0, a[1] + dy * t0]);
    out.push([a[0] + dx * t1 + nx * d, a[1] + dy * t1 + ny * d]);
  }
  out.push([b[0], b[1]]);
  return out;
}
/** Knife outline: spine on -x, edge on +x, heel at y=0, tip at y=L. tip: drop|clip|spear|straight|square|point */
export function knifeOutline(L, W, o = {}) {
  const tip = o.tip || 'drop';
  const sx = -W / 2, ex = W / 2, tl = L * (o.tipLen ?? 0.28), yb = L - tl;
  const P = [[sx, 0], [ex, 0]];
  if (tip === 'drop') P.push([ex, yb * 0.55], [ex - W * 0.04, yb], [ex * 0.2, L - tl * 0.25], [sx * 0.2 - 0.05, L], [sx, L - tl * 0.55]);
  else if (tip === 'clip') P.push([ex, yb], [ex * 0.3, L - tl * 0.15], [sx * 0.4, L], [sx, L - tl * 0.9]);
  else if (tip === 'spear') P.push([ex, yb], [0, L], [sx, yb]);
  else if (tip === 'straight') P.push([ex, L - W * 0.15], [sx, L - W * 0.85], [sx, L - W * 0.85 + 0.01]);
  else if (tip === 'square') P.push([ex, L], [sx, L]);
  else P.push([ex, yb], [sx + W * 0.2, L], [sx, yb]);
  return P.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-3);
}

/** Palette hue-shift for variant recolouring (saturated, non-metal parts only) */
export function hueShift(hex, amt) {
  const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl);
  if (hsl.s < 0.18) return c;
  c.setHSL((hsl.h + amt) % 1, hsl.s, hsl.l); return c;
}

const Y = new THREE.Vector3(0, 1, 0);
function eulerDeg(q) { const e = new THREE.Euler().setFromQuaternion(q, 'XYZ'); return [e.x / D2R, e.y / D2R, e.z / D2R]; }
/** rotation (deg XYZ) that turns +Y into direction d */
export function rotTo(d) { return eulerDeg(new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(...d).normalize())); }

export class Kit {
  constructor(seed, variant, opt) {
    this.seed = seed; this.v = variant; this.opt = opt; this.rnd = rng(seed * 977 + 13);
    this.parts = []; this.sock = {}; this.hue = opt.hue ?? 0.33;
  }
  col(c, t = 0) { return (this.v === 1 && t !== 0) ? hueShift(c, this.hue) : new THREE.Color(c); }
  _add(g, o) { o = { ...o }; g.userData.nofat = !!o.nofat; o.col = this.col(o.col ?? 0x888888, o.t || 0); this.parts.push(paint(g, o)); return g; }
  /** bevelled box [w,h,d] centred at p */
  box(size, o = {}) {
    const [w, h, d] = size, b = o.b ?? Math.min(w, h, d) * 0.22;
    const g = extrude(rect2(w, h, 0, -h / 2), d, b, { cs: 2 });
    return this._add(g, o);
  }
  /** chamfered cylinder, base at p, axis +Y */
  cyl(rt, rb, h, o = {}) { return this._add(latheGeo(cylProfile(rt, rb ?? rt, h, o.b ?? 0.15), o.n ?? 8, o.smooth ?? true), o); }
  lathe(profile, o = {}) { return this._add(latheGeo(profile, o.n ?? 8, o.smooth ?? false), o); }
  cone(r, h, o = {}) { return this._add(latheGeo([[r, 0, 1], [0, h]], o.n ?? 5, false), o); }
  /** extruded outline (blades, plates). o.d thickness, o.b bevel, o.holes */
  blade(pts, o = {}) { return this._add(extrude(pts, o.d ?? 0.5, o.b ?? 0.18, { holes: o.holes, cs: o.cs, bs: o.bs }), o); }
  tube(points, r, o = {}) { return this._add(sweepGeo(points, r, o.n ?? 5, o), o); }
  ring(R, r, o = {}) {
    const n = o.seg ?? 10, pts = Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [Math.cos(a) * R, Math.sin(a) * R, 0]; });
    return this._add(sweepGeo(pts, r, o.n ?? 4, { closed: true, up: [0, 0, 1] }), o);
  }
  blob(r, o = {}) {
    const g = new THREE.IcosahedronGeometry(r, o.detail ?? 1); g.computeVertexNormals();
    g.userData.edge = new Float32Array(g.attributes.position.count); return this._add(g, o);
  }
  /** gear / saw disc outline in XY, extruded along Z. o.saw = ratchet teeth, o.hole */
  gear(rIn, rOut, nT, depth, o = {}) {
    const pts = [], st = Math.PI * 2 / nT;
    for (let i = 0; i < nT; i++) {
      const a = i * st;
      if (o.saw) pts.push([Math.cos(a) * rIn, Math.sin(a) * rIn], [Math.cos(a + st * 0.75) * rOut, Math.sin(a + st * 0.75) * rOut]);
      else for (const [da, r] of [[0, rIn], [st * 0.2, rOut], [st * 0.5, rOut], [st * 0.7, rIn]]) pts.push([Math.cos(a + da) * r, Math.sin(a + da) * r]);
    }
    const hole = o.hole ? arc(0, 0, o.hole, 0, 360, 8).slice(0, -1).reverse() : null;
    return this._add(extrude(pts, depth, o.b ?? 0.2, { holes: hole ? [hole] : undefined, cs: 2 }), o);
  }
  /** tape wrapped along a handle on the Y axis (centre o.p), tilted bands alternating */
  tape(y0, y1, r, o = {}) {
    const bw = o.band ?? 1.0, n = Math.max(1, Math.round((y1 - y0) / (bw * 0.7)));
    const rx = (o.rx ?? r) * 1.2, rz = (o.rz ?? r) * 1.2, px = o.p?.[0] ?? 0, pz = o.p?.[2] ?? 0;
    for (let i = 0; i < n; i++) {
      const y = y0 + (i + 0.5) * (y1 - y0) / n, tilt = (i % 2 ? 12 : -12);
      const g = latheGeo([[1, -bw / 2, 0], [1, bw / 2, 0]], o.n ?? 8, true);
      g.scale(rx, 1, rz);
      this._add(g, { p: [px, y, pz], r: [tilt, 0, 0], col: o.col, t: 2, stripe: o.stripe, edge: 0 });
    }
    if (o.tail) this.box([bw * 0.8, bw * 2.2, 0.2], { p: [px + rx + 0.1, y1 - 0.8, pz], r: [0, 0, -12], b: 0.05, col: o.col, t: 2 });
  }
  /** helical wire (barbs optional) around the Y axis */
  wire(y0, y1, r, o = {}) {
    const turns = o.turns ?? 5, per = 6, pts = [];
    for (let i = 0; i <= turns * per; i++) { const t = i / (turns * per), a = t * turns * Math.PI * 2; const rv = typeof r === 'function' ? r(t) : r; pts.push([Math.cos(a) * rv, y0 + (y1 - y0) * t, Math.sin(a) * rv]); }
    this.tube(pts, o.th ?? 0.2, { col: o.col ?? 0x6c6c70, t: 0, n: 3 });
    if (o.barbs) for (let i = 2; i < turns * per; i += 3) { const p = pts[i]; this.cone(0.15, 0.8, { p, r: rotTo([p[0], 0.4, p[2]]), col: 0x8a8a90, n: 3 }); }
  }
  /** nails scattered on a Y-axis cylinder */
  nails(count, y0, y1, r, o = {}) {
    for (let i = 0; i < count; i++) {
      const a = i * 2.399 + this.rnd() * 0.8, y = y0 + (y1 - y0) * (i + 0.5) / count, len = (o.len ?? 2.4) * (0.7 + this.rnd() * 0.6);
      const d = [Math.sin(a), (this.rnd() - 0.5) * 0.6, Math.cos(a)];
      this.cone(o.th ?? 0.22, len, { p: [d[0] * r * 0.8, y, d[2] * r * 0.8], r: rotTo(d), col: o.col ?? 0xa0a0a6, n: 4 });
    }
  }
  hexRing(R, r, depth, o = {}) {
    const outer = arc(0, 0, R, 0, 360, 6).slice(0, -1), inner = arc(0, 0, r, 0, 360, 6).slice(0, -1).reverse();
    return this._add(extrude(outer, depth, depth * 0.3, { holes: [inner], cs: 1 }), o);
  }
  /** run fn(), then transform every part it added by {p, r(deg), s} (group transform) */
  xf(o, fn) {
    const n0 = this.parts.length; fn();
    const r = o.r || [0, 0, 0], p = o.p || [0, 0, 0];
    _e.set(r[0] * D2R, r[1] * D2R, r[2] * D2R, 'XYZ'); _q.setFromEuler(_e);
    const M = new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), _q.clone(), new THREE.Vector3(1, 1, 1));
    for (let i = n0; i < this.parts.length; i++) this.parts[i].applyMatrix4(M);
  }
  // sockets (cm, converted at finish)
  grip(pos, fwd = [0, 1, 0], up = [1, 0, 0]) { this.sock.grip = { pos, fwd, up }; }
  grip2(pos, fwd = [0, 1, 0], up = [1, 0, 0]) { this.sock.grip2 = { pos, fwd, up }; }
  muzzle(pos, dir = [1, 0, 0]) { this.sock.muzzle = { pos, dir }; }
  tip(pos) { this.sock.tip = pos; }
  edge(a, b) { this.sock.edge = { a, b }; }
}

/** rounded polygon outline (cm): corner radius rad, n segments per corner */
export function roundPoly(pts, rad, n = 4) {
  const out = [], m = pts.length;
  for (let i = 0; i < m; i++) {
    const a = pts[(i + m - 1) % m], b = pts[i], c = pts[(i + 1) % m];
    const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const d = Math.min(rad, l1 / 2, l2 / 2);
    const p1 = [b[0] + v1[0] / l1 * d, b[1] + v1[1] / l1 * d], p2 = [b[0] + v2[0] / l2 * d, b[1] + v2[1] / l2 * d];
    for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * p1[0] + 2 * u * t * b[0] + t * t * p2[0], u * u * p1[1] + 2 * u * t * b[1] + t * t * p2[1]]); }
  }
  return out;
}
