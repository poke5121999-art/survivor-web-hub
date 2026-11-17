// Ornate tanks: flamboyant forms after the owner's references (handoff/dtt-ref 9-13), for a few tanks that opt in
// through ORNATE below. Instead of flat fins, every blade is sculpted: a lofted, curved and tapered piece (thick at
// the root, sharp at the tip) with a mid ridge, a polished metal edge and a coloured face. Blades are only ever laid
// out as one structure: a wing (hinge, leading-edge spar, feathers in order along the trailing edge, longer toward the
// tip), a peel crown, a tail or a plume, never scattered on the hull.
// Same contract as the designs in mechs.js: fills the builder's batches and returns { muzzle, muzzleY, S, height,
// legs, stride, hover, parts }. Running gear, ride height and muzzle come from the tank's frame spec (frames.js), so
// the footprint and the shot origin stay those of the stock frame. Forms: I plain, II first armour and a short wing,
// III the full spread with a fire aura. A frame spec with no `sig` (the silhouette gate's bare frame) draws only
// hull, gear, turret and gun.
// Models face +x, +z is the right side, the ground is y = 0.
import * as THREE from '../../vendor/three.module.min.js';
import { Builder } from './builder.js';
import { frameDesign, frameGear } from './frames.js';
import { Kit, LAMP } from './steel.js';
import { B1 } from './ornate-b1.js';

const PI = Math.PI, TAU = PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
export const C3 = (c) => (c && c.isColor ? c.clone() : new THREE.Color(c));
export const mix = (a, b, t) => C3(a).lerp(C3(b), t);
const WHITE = new THREE.Color(1, 1, 1);

// ---------- premium finishes (builder surf multipliers: roughness, metalness) ----------
export const FINISH = { gold: [0.2, 2.2], chrome: [0.12, 2.2], pearl: [0.32, 0.3], enamel: [0.38, 0.9], dark: [0.6, 1.5], glass: [0.1, 0.6] };
export const GOLD = 0xf2b43a, GOLD_DEEP = 0x8a5a14, CHROME = 0xdfe6ee, PEARL = 0xf4f0e6, DARKM = 0x1d2127;
export const fin = (b, kind, c) => { b.surface(FINISH[kind][0], FINISH[kind][1]); if (c !== undefined) b.tint(c); return b; };

// ---------- surface kit ----------
// Skin over rings of points (arrays of Vector3 of one length). tone(i, j) colours the strip from point j of ring i
// (hard) or the vertex (smooth). hard: strips keep their own vertices, so ridges stay crisp while the run stays smooth.
// caps: close both ends. mz: mirror across z (the left-side copy of a right-side piece). Faces are turned outward.
export function skin(rings, o = {}) {
  const R = rings.length, M = rings[0].length, closed = o.closed !== false, J = closed ? M : M - 1;
  const pos = [], col = [], tube = [], ringOf = [];
  const add = (p, c, i) => { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); ringOf.push(i); return ringOf.length - 1; };
  const tone = (i, j) => (o.tone ? o.tone(i, j) : WHITE);
  if (o.hard) {
    for (let j = 0; j < J; j++) {
      const j2 = (j + 1) % M, base = ringOf.length;
      for (let i = 0; i < R; i++) { const c = tone(i, j); add(rings[i][j], c, i); add(rings[i][j2], c, i); }
      for (let i = 0; i < R - 1; i++) { const a = base + i * 2; tube.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
  } else {
    for (let i = 0; i < R; i++) for (let j = 0; j < M; j++) add(rings[i][j], tone(i, j), i);
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < J; j++) {
      const j2 = (j + 1) % M, a = i * M + j, b = i * M + j2, c = (i + 1) * M + j, d = (i + 1) * M + j2;
      tube.push(a, c, b, b, c, d);
    }
  }
  const cen = rings.map((r) => r.reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(1 / r.length));
  const P = (k) => V(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  let sum = 0;
  for (let t = 0; t < tube.length; t += 3) {
    const a = P(tube[t]), b = P(tube[t + 1]), c = P(tube[t + 2]);
    const n = b.clone().sub(a).cross(c.clone().sub(a)), m = a.add(b).add(c).multiplyScalar(1 / 3);
    sum += n.dot(m.sub(cen[ringOf[tube[t]]]));
  }
  if (sum < 0) for (let t = 0; t < tube.length; t += 3) { const x = tube[t + 1]; tube[t + 1] = tube[t + 2]; tube[t + 2] = x; }
  const idx = tube;
  if (o.caps !== false && closed) {
    for (const [i, k] of [[0, 1], [R - 1, R - 2]]) {
      const out = cen[i].clone().sub(cen[k]);
      if (out.lengthSq() < 1e-10) continue;
      const c = o.capTone ? o.capTone(i) : tone(i, 0), ci = add(cen[i], c, i), first = [];
      for (let j = 0; j < M; j++) first.push(add(rings[i][j], c, i));
      const tri = [];
      for (let j = 0; j < M; j++) tri.push(ci, first[j], first[(j + 1) % M]);
      let s = 0;
      for (let t = 0; t < tri.length; t += 3) { const a = P(tri[t]), b = P(tri[t + 1]), cc = P(tri[t + 2]); s += b.sub(a).cross(cc.sub(a)).dot(out); }
      if (s < 0) for (let t = 0; t < tri.length; t += 3) { const x = tri[t + 1]; tri[t + 1] = tri[t + 2]; tri[t + 2] = x; }
      idx.push(...tri);
    }
  }
  if (o.mz) {
    for (let k = 2; k < pos.length; k += 3) pos[k] = -pos[k];
    for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (!o.tone) g.userData.plain = true;
  return g;
}
// Append a kit geometry: toned ones carry their own colours, plain ones take the current tint.
export const put = (b, g) => { if (!g.userData.plain) b.tint(WHITE); b.geo(g); g.dispose(); return b; };

// Frames along a path (parallel transport from an up hint): tangent T, normal N, binormal B per point.
function along(P, up = V(0, 1, 0)) {
  const n = P.length, T = [], N = [], B = [];
  for (let i = 0; i < n; i++) T.push(P[Math.min(n - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize());
  let nn = up.clone().addScaledVector(T[0], -up.dot(T[0]));
  if (nn.lengthSq() < 1e-6) { nn = Math.abs(T[0].x) < 0.9 ? V(1, 0, 0) : V(0, 0, 1); nn.addScaledVector(T[0], -nn.dot(T[0])); }
  nn.normalize();
  for (let i = 0; i < n; i++) {
    if (i) { nn = N[i - 1].clone().addScaledVector(T[i], -N[i - 1].dot(T[i])); if (nn.lengthSq() < 1e-8) nn = N[i - 1].clone(); nn.normalize(); }
    N.push(nn); B.push(T[i].clone().cross(nn));
  }
  return { T, N, B };
}
// Tube along points with radius rf(t) and colour tone(t, k); flat < 1 squashes it along the binormal, flatN along
// the normal (a flat ribbon whose faces look along the normal).
export function tubeGeo(P, rf, o = {}) {
  const sides = o.sides || 8, { N, B } = along(P, o.up), n = P.length;
  const rings = P.map((p, i) => {
    const t = i / (n - 1), r = rf(t), ring = [];
    for (let k = 0; k < sides; k++) { const a = k / sides * TAU; ring.push(p.clone().addScaledVector(N[i], Math.cos(a) * r * (o.flatN || 1)).addScaledVector(B[i], Math.sin(a) * r * (o.flat || 1))); }
    return ring;
  });
  return skin(rings, { tone: o.tone ? (i, j) => o.tone(i / (n - 1), j) : null, caps: o.caps, mz: o.mz });
}

// Sculpted blade along +x, chord across z (leading edge toward -z), thickness along y. Cross-section of eight points:
// sharp leading and trailing edges, a bevel line each side and a raised mid ridge, so it reads as forged, not flat.
// len, w (root chord), th (root thickness), sweep / lift (curl of the run toward +z / +y, as a fraction of len),
// wf / tf (chord and thickness along the run), ridge (chord offset of the ridge), edge / face / face2 / back colours,
// band(t) → colour that overrides the face (pheasant bars), mz mirror.
export const WF = {
  feather: (t) => Math.pow(1 - t, 0.55) * (0.8 + 0.7 * t * (1 - t)),
  spar: (t) => Math.pow(1 - t, 0.4) * (1 - 0.35 * t),
  petal: (t) => Math.pow(Math.max(0, Math.sin(PI * (0.14 + 0.86 * t))), 0.7),
  plume: (t) => (1 - Math.pow(t, 5)) * (0.55 + 0.45 * Math.sin(PI * Math.min(1, t * 1.1))),
  spear: (t) => Math.pow(1 - t, 0.9) * (0.7 + 1.2 * t * (1 - t)),
};
const SECTION = [[-1, 0], [-0.55, 0.45], ['r', 1], [0.55, 0.45], [1, 0], [0.55, -0.35], ['r', -0.55], [-0.55, -0.35]];
const STRIP = ['edge', 'face', 'face2', 'edge', 'edge', 'back', 'back', 'edge'];
export function bladeGeo(o) {
  const len = o.len, w = o.w, th = o.th ?? w * 0.2, seg = o.seg || 8, sweep = o.sweep || 0, lift = o.lift || 0, rd = o.ridge ?? -0.2;
  const wf = o.wf || WF.feather, tf = o.tf || ((t) => 1 - 0.8 * t);
  const face = C3(o.face), cols = { edge: C3(o.edge ?? CHROME), face, face2: o.face2 ? C3(o.face2) : face.clone().multiplyScalar(0.78), back: C3(o.back ?? o.face) };
  const P = [];
  for (let i = 0; i <= seg; i++) { const t = i / seg; P.push(V(len * t, lift * len * t * t, sweep * len * t * t)); }
  const up0 = V(0, 1, 0);
  const rings = P.map((p, i) => {
    const t = i / seg, a = P[Math.min(seg, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize();
    const ch = a.clone().cross(up0).normalize(), up = ch.clone().cross(a).normalize();
    const hw = w * 0.5 * wf(t), ht = th * tf(t) * Math.min(1, wf(t) * 1.6 + 0.05);
    return SECTION.map(([c, v]) => p.clone().addScaledVector(ch, (c === 'r' ? rd : c) * hw).addScaledVector(up, v * ht));
  });
  const tone = (i, j) => {
    const k = STRIP[j];
    if (o.band && (k === 'face' || k === 'face2')) { const c = C3(o.band(i / seg)); return k === 'face2' ? c.multiplyScalar(0.8) : c; }
    return cols[k];
  };
  return skin(rings, { hard: true, tone, mz: o.mz, capTone: () => cols.back });
}

// Place a right-side piece (s = 1) or its mirror (s = -1): position and rotations are mirrored across z here; the
// piece's own geometry must be mirrored by its maker (mz) when it is not symmetric.
export function at(b, s, p, r, f) {
  b.push().move(p[0], p[1], s * p[2]).rotY(s * (r[1] || 0)).rotZ(r[2] || 0).rotX(s * (r[0] || 0)); f(); b.pop();
}

// Lofted body through stations { x, y (centre), hw, ht (top), hb (bottom), n (superellipse power), z }.
// tone(i, a) colours by station and by angle round the section (a = 0 right side, PI/2 top).
export function loftGeo(st, o = {}) {
  const sides = o.sides || 16;
  const rings = st.map((s) => {
    const ring = [], n = s.n || 2.5;
    for (let k = 0; k < sides; k++) {
      const a = k / sides * TAU, c = Math.cos(a), sn = Math.sin(a);
      const z = s.hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y = (sn > 0 ? s.ht : s.hb) * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
      ring.push(V(s.x, s.y + y, (s.z || 0) + z));
    }
    return ring;
  });
  const tone = o.tone ? (i, j) => o.tone(i, (j + (o.hard ? 0.5 : 0)) / sides * TAU) : null;
  return skin(rings, { tone, hard: o.hard, mz: o.mz });
}
// Spline-smoothed stations: a few keys become many rings.
function stations(keys, n) {
  const out = [];
  const xs = keys.map((k) => k.x), props = Object.keys(keys[0]).filter((p) => p !== 'x');
  const cv = {};
  for (const p of props) cv[p] = new THREE.SplineCurve(keys.map((k) => new THREE.Vector2(k.x, k[p] ?? 0)));
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = {};
    for (const p of props) { const v = cv[p].getPoint(t); s[p] = v.y; if (p === props[0]) s.x = v.x; }
    if (s.x === undefined) s.x = lerp(xs[0], xs[xs.length - 1], t);
    out.push(s);
  }
  return out;
}

// ---------- ornament kit ----------
// Ornate relief panel in its local XY plane, facing +z: a plate with a gold rim and a raised S-curl of two spirals.
export function swirlPanel(b, s, p, r, w, h, plate, gold, mz) {
  at(b, s, p, r, () => {
    fin(b, 'enamel', plate); b.chamfer(w, h, 0.05, 0.018);
    fin(b, 'gold', gold);
    for (const y of [-1, 1]) b.push().move(0, y * (h / 2 - 0.012), 0.02).chamfer(w * 0.98, 0.03, 0.04, 0.008).pop();
    for (const x of [-1, 1]) b.push().move(x * (w / 2 - 0.012), 0, 0.02).chamfer(0.03, h * 0.98, 0.04, 0.008).pop();
    const P = [], r0 = Math.min(h * 0.36, w * 0.2), cx = w * 0.22, turns = 1.6, m = 14;
    const spiral = (sx, ph) => { const o = []; for (let i = 0; i <= m; i++) { const f = i / m, a = ph - f * turns * TAU, rr = r0 * (1 - 0.82 * f); o.push(V(sx + rr * Math.cos(a), rr * Math.sin(a), 0.03)); } return o; };
    const A = spiral(-cx, -PI / 2).reverse(), B = spiral(cx, PI / 2);
    P.push(...A, ...B);
    put(b, tubeGeo(P, (t) => Math.min(w, h) * 0.06 * (0.35 + 0.65 * Math.sin(PI * t)), { sides: 5, flat: 1, up: V(0, 0, 1), mz }));
  });
}

// Kudu-style horn: a ringed corkscrew rising up and out from the root along axis, tapering to a point.
export function kuduHorn(root, axis, o) {
  const { H, turns, rho, r0, rings = 12, a = GOLD, c = 0x4a2410 } = o, n = 48, P = [];
  const ax = axis.clone().normalize(), e1 = V(0, 0, 1).cross(ax).normalize(), e2 = ax.clone().cross(e1).normalize();
  for (let i = 0; i <= n; i++) {
    const t = i / n, ang = t * turns * TAU, r = rho * (1 - 0.5 * t) * Math.min(1, t * 5);
    P.push(V(root[0], root[1], root[2]).addScaledVector(ax, H * t).addScaledVector(e1, Math.cos(ang) * r).addScaledVector(e2, Math.sin(ang) * r));
  }
  const rf = (t) => r0 * (1 - 0.88 * Math.pow(t, 0.9)) * (1 + 0.14 * Math.pow(Math.max(0, Math.sin(t * rings * PI)), 4)) + 0.004;
  return tubeGeo(P, rf, { sides: 9, tone: (t) => (Math.sin(t * rings * PI) > 0.35 ? C3(c) : C3(a)), caps: true });
}

function sePoint(p, a, s, n) {
  const c = Math.cos(a), sn = Math.sin(a);
  return V(p.x, p.y + (sn > 0 ? p.ht : p.hb) * s * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n), (p.z || 0) + p.hw * s * Math.sign(c) * Math.pow(Math.abs(c), 2 / n));
}
// Curved pauldron: 2-3 half-shell caps stacked down and out over the shoulder, each with a raised gold rim.
export function pauldron(b, s, p, r, layers, cols) {
  for (let l = layers - 1; l >= 0; l--) {
    const rr = r * (1 - 0.14 * l), cap = new THREE.SphereGeometry(rr, 14, 5, 0, TAU, 0, PI * 0.42);
    cap.scale(1.15, 0.75, 1);
    at(b, s, [p[0] - l * 0.05, p[1] - l * 0.09, p[2] + l * 0.09], [0.55 + l * 0.3, 0, 0], () => {
      fin(b, 'enamel', cols[l % cols.length]); b.geo(cap);
      fin(b, 'gold', GOLD); b.push().move(0, rr * 0.75 * Math.cos(PI * 0.42), 0).scale(1.15, 1, 1).geo(new THREE.TorusGeometry(rr * Math.sin(PI * 0.42), 0.022, 4, 20).rotateX(PI / 2)).pop();
    });
    cap.dispose();
  }
}

// A solid wing (ref 9): a broad pearl panel from the root to the tip with a coloured leading-edge band, then feather
// plates along its trailing edge, each overlapping the next and laid a little over the one inside it, so the wing is
// one closed swept shape with no gaps. Plan for the right side (s = 1): root front at (x0, z0), the tip len behind and
// reach out. part: 'frame' (panel and band: the airframe), 'feathers', or both.
export function wingPanel(b, s, o, part = 'all') {
  const { x0, z0, len, reach, y, n, fl0, fl1, col } = o;
  const R0 = [x0, z0], T = [x0 - len, z0 + reach], R1 = [x0 - len * 0.5, z0 - 0.02];
  const P = (p) => [p[0], s * p[1]], L = (a, c, t) => [lerp(a[0], c[0], t), lerp(a[1], c[1], t)];
  if (part !== 'feathers') {
    fin(b, 'pearl', col.panel); b.prism([R0, T, L(T, R1, 0.25), R1].map(P), y - 0.03, y + 0.03, 0.02);
    const d = Math.hypot(len, reach), nx = -reach / d, nz = -len / d, e = 0.1;
    fin(b, 'enamel', col.edge); b.prism([R0, T, [T[0] + nx * e * 0.5, T[1] + nz * e * 0.5], [R0[0] + nx * e, R0[1] + nz * e]].map(P), y + 0.02, y + 0.05, 0.012);
    fin(b, 'dark', DARKM); b.push().move(x0 - len * 0.12, y, s * z0).chamfer(0.42, 0.12, 0.14, 0.03).pop();
    fin(b, 'gold', GOLD); b.push().move(x0 - len * 0.12, y + 0.07, s * z0).cyl(0.05, 0.05, 0.03, 10).pop();
  }
  if (part === 'frame') return;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2, ph = lerp(0.04, 0.26, tm), dv = [-Math.cos(ph), Math.sin(ph)], lf = lerp(fl0, fl1, tm);
    const A = L(R1, T, Math.max(0, t0 - 0.12)), B = L(R1, T, Math.min(1, t1 + 0.12)), M = L(R1, T, tm);
    const pts = [A, B, [B[0] + dv[0] * lf * 0.6, B[1] + dv[1] * lf * 0.6], [M[0] + dv[0] * lf, M[1] + dv[1] * lf], [A[0] + dv[0] * lf * 0.55, A[1] + dv[1] * lf * 0.55]];
    fin(b, 'pearl', i % 2 ? col.face2 : col.face); b.prism(pts.map(P), y - 0.06 + i * 0.008, y - 0.03 + i * 0.008, 0.012);
  }
}

// Flame aura: teardrop flame cards in the ember batch (additive, vertex colours): a yellow-white root through orange

// Flame aura: teardrop flame cards in the ember batch (additive, vertex colours): a yellow-white root through orange
// to deep red tips. A ring round the hull plus a bigger, denser cluster behind and under it; flickers at runtime.
const flameShape = (() => {
  const s = new THREE.Shape(); s.moveTo(0, 0);
  s.bezierCurveTo(0.5, 0.05, 0.42, 0.45, 0.12, 0.7); s.bezierCurveTo(0.2, 0.85, 0.05, 0.95, 0, 1);
  s.bezierCurveTo(-0.08, 0.85, -0.3, 0.75, -0.18, 0.55); s.bezierCurveTo(-0.45, 0.4, -0.45, 0.05, 0, 0);
  return s;
})();
const ramp = (a, b, c) => [[0, new THREE.Color(...a)], [0.4, new THREE.Color(...b)], [1, new THREE.Color(...c)]];
// Each tank's aura has its own colour ramp (root, middle, tip) so form III does not look the same on every ornate tank.
export const AURA = {
  fire: ramp([0.85, 0.72, 0.38], [0.8, 0.3, 0.04], [0.3, 0.02, 0.0]),
  wind: ramp([0.75, 0.85, 0.9], [0.2, 0.5, 0.85], [0.02, 0.08, 0.3]),
  blood: ramp([0.85, 0.5, 0.5], [0.75, 0.06, 0.1], [0.25, 0.0, 0.04]),
  jungle: ramp([0.85, 0.85, 0.4], [0.45, 0.7, 0.08], [0.05, 0.25, 0.02]),
  steam: ramp([0.8, 0.8, 0.78], [0.7, 0.55, 0.25], [0.25, 0.15, 0.05]),
};
function fireCard(FIRE) {
  const g = new THREE.ShapeGeometry(flameShape, 5), p = g.attributes.position, c = [];
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getY(i))), k = t < FIRE[1][0] ? 0 : 1, u = (t - FIRE[k][0]) / (FIRE[k + 1][0] - FIRE[k][0]);
    const col = FIRE[k][1].clone().lerp(FIRE[k + 1][1], u); c.push(col.r, col.g, col.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
}
export function fireAura(b, cx, rx, rz, n, hgt, pal = AURA.fire) {
  const m = b.mat; b.use('ember'); b.tint(WHITE);
  const card = fireCard(pal);
  const put1 = (x, z, a, hh, tilt) => { for (const rot of [0, PI / 2]) { b.push().move(x, 0.04, z).rotY(PI / 2 - a + rot).rotX(tilt).scale(hh * 0.8, hh, 1); b.geo(card); b.pop(); } };
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, back = Math.max(0, -Math.cos(a));
    put1(cx + Math.cos(a) * rx, Math.sin(a) * rz, a, hgt * (0.65 + 0.3 * Math.abs(Math.sin(i * 1.7)) + 0.5 * back), -0.2 - 0.3 * back);
  }
  // Behind and under: a denser cluster of taller cards trailing the hull.
  for (let i = 0; i < Math.round(n * 0.6); i++) {
    const f = i / Math.max(1, Math.round(n * 0.6) - 1), z = lerp(-rz * 0.75, rz * 0.75, f), x = cx - rx * (0.55 + 0.35 * Math.cos(f * PI - PI / 2) * 0.6);
    put1(x, z, PI + (f - 0.5) * 1.2, hgt * (1.1 + 0.35 * Math.sin(i * 2.1)), -0.45);
  }
  card.dispose(); b.use(m);
}

// Ornate cannon along +x into the barrel batch: polished barrel, gold bands, flared crown.
export function cannon(b, x, y, z, len, r, barrel, band) {
  b.push().move(x, y, z).rotZ(-PI / 2);
  fin(b, 'chrome', barrel).lathe([[r * 1.35, 0], [r * 1.35, 0.1], [r * 1.05, 0.16], [r, len * 0.5], [r * 0.92, len * 0.82], [r * 1.1, len * 0.86], [r * 1.45, len * 0.98], [r * 1.25, len], [r * 0.7, len]], 12);
  fin(b, 'gold', band);
  for (const f of [0.12, 0.5, 0.86]) b.push().move(0, len * f, 0).cyl(r * 1.22, r * 1.22, 0.045, 12).pop();
  b.pop();
}

// ---------- tanks ----------
// Shared start: the stock frame (for its muzzle and height), the running gear and the form flags.
export function start(h, b, st, paint, trim, deep, form, gear) {
  const F = st.frame, orn = [].concat(F.sig || []).length > 0, f = Math.max(1, Math.min(3, form | 0 || 2));
  const ob = new Builder(0.85); ob.use('hull').surface(1, 1);
  const stock = frameDesign(h, F)(ob, paint, trim, deep);
  for (const k in ob.batches) delete ob.batches[k];
  b.use('hull');
  // gear false: the design draws its own running gear (steel track pods).
  const g = gear === false ? { y0: 0.3, y1: 0.8, legs: [], parts: [] } : frameGear(h, b, gear && gear.F ? { ...F, ...gear.F } : F, gear ? gear.paint : paint, gear ? gear.trim : trim, deep);
  return { F, orn, f, stock, g, parts: g.parts.slice(), top: g.y1 };
}
export function finish(K, extra = {}) {
  return { muzzle: K.stock.muzzle, muzzleY: K.my ?? K.stock.muzzleY, S: K.F.S || 1, height: Math.max(K.stock.height, K.top + 0.3), legs: K.g.legs.length ? K.g.legs : undefined,
    stride: K.stock.stride, hover: K.stock.hover, parts: K.parts.concat([{ name: 'barrel', on: 'turret', kind: 'recoil', amt: extra.recoil ?? 0.25 }]), ornate: true };
}

// The steel construction (steel.js Kit: chamfered plates with inset panels, octagonal rings, track pods, ribbed
// cannons, light squares) in ornate finishes: every colour name a Kit method paints with can be given here as
// [colour, FINISH key], so the same plates come out polished gold, pearl or chrome instead of matte gunmetal.
export class OKit extends Kit {
  constructor(b, st, trim, form, cols) {
    super(b, st, trim, form);
    this.fin = {};
    for (const [n, [c, k]] of Object.entries(cols)) { this.c[n] = C3(c); this.fin[n] = k; }
  }
  // Clean polished plates: the inset stays one piece (no groove cuts) and carries no greeble.
  plate(x, y, z, w, h, d, o = {}) { return super.plate(x, y, z, w, h, d, { split: 1, greeble: false, ...o }); }
  use(name) {
    const k = typeof name === 'string' && this.fin[name];
    if (!k) return super.use(name);
    fin(this.b, k, this.c[name]); return this;
  }
}

const TANKS = {
  // Ngưu Ma Vương (ref 10): a short, wide golden war-wagon on double track pods. Red enamel plates with gold inserts,
  // a gold glacis carrying two big swirl reliefs, flared swirl shoulder plates, a stepped octagonal turret with
  // ringed corkscrew horns and a gold ball finial. I: plain plates, horn stubs. II: swirls, horns, finial, skirts.
  // III: tall horns, more swirls, a fire aura.
  nguma(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, false), { f, orn } = K, red = C3(paint);
    const gold = f === 1 ? mix(GOLD, 0x9a8a70, 0.35) : C3(GOLD), lacq = mix(red, 0xc0301c, 0.55);
    const k = new OKit(b, st, trim, form, { gun: [lacq, 'enamel'], gunLite: [gold, 'gold'], panel: [gold, f === 1 ? 'enamel' : 'gold'], panelDeep: [mix(GOLD, 0x6a3a10, 0.4), 'gold'], under: [0x2a1410, 'dark'], steel: [GOLD_DEEP, 'gold'], chrome: [CHROME, 'chrome'], red: [lacq, 'enamel'] });
    b.use('hull');
    for (const s of [-1, 1]) {
      k.trackPod(-0.05, s * 0.98, 2.3, 0.42, 0.6, { coverCol: 'gun', insert: 'panel', skirt: f >= 2, light: LAMP.amber });
      k.plate(1.15, 0.52, s * 0.98, 0.36, 0.08, 0.44, { insert: null, rz: -0.6, col: 'panel' });
    }
    k.prism([[1.0, 0.5], [1.18, 0.3], [1.18, -0.3], [1.0, -0.5], [-1.2, -0.6], [-1.32, -0.45], [-1.32, 0.45], [-1.2, 0.6]], 0.22, 0.7, 'under', 0.05);
    k.plate(-0.3, 0.74, 0, 1.6, 0.1, 1.2, { col: 'gun', insert: 'panel', greeble: false });
    k.plate(0.95, 0.6, 0, 0.6, 0.1, 1.1, { col: 'panel', insert: null, rz: -0.5 });
    k.blk(-1.3, 0.6, 0, 0.12, 0.2, 0.9, 'gunLite', 0.03);
    for (const s of [-1, 1]) k.light(1.2, 0.36, s * 0.3, 0.06, LAMP.amber, '+x');
    if (orn && f >= 2) {
      // Big swirl reliefs on the glacis (about a third of the front each) and flared swirl shoulder plates.
      for (const s of [-1, 1]) swirlPanel(b, s, [1.0, 0.64, 0.3], [-1.05, PI / 2 - 0.12, 0], 0.62, 0.5, lacq, GOLD, s < 0);
      for (const s of [-1, 1]) for (const x of f === 3 ? [-0.55, 0.4] : [-0.05]) swirlPanel(b, s, [x, 0.74, 1.18], [-1.25, 0, 0], f === 3 ? 0.8 : 1.0, 0.42, lacq, GOLD, s < 0);
    }
    if (orn && f === 3) fireAura(b, 0, 1.75, 1.65, 18, 1.1);
    b.use('turret');
    k.oct(-0.1, 0.84, 0, 0.7, 0.1, 'under');
    k.oct(-0.12, 1.0, 0, 0.62, 0.24, 'gun', 0.05, 1.2);
    k.oct(-0.16, 1.17, 0, 0.5, 0.12, 'panel', 0.04, 1.2);
    k.oct(-0.22, 1.27, 0, 0.32, 0.08, 'gun', 0.03, 1.15);
    k.plate(0.52, 1.02, 0, 0.18, 0.3, 0.7, { col: 'panel', insert: null, rz: -0.35 });
    for (const s of [-1, 1]) k.light(0.6, 1.1, s * 0.22, 0.045, LAMP.amber, '+x');
    if (f >= 2) for (const s of [-1, 1]) k.plate(-0.12, 1.02, s * 0.62, 0.8, 0.22, 0.1, { col: 'panel', insert: null, ry: s * 0.15 });
    if (orn) {
      const R = f === 1 ? { H: 0.22, turns: 0.4, rho: 0.03, r0: 0.08, rings: 3 } : f === 2 ? { H: 0.75, turns: 1.7, rho: 0.09, r0: 0.12, rings: 9 } : { H: 1.25, turns: 2.6, rho: 0.13, r0: 0.16, rings: 14 };
      for (const s of [-1, 1]) {
        k.oct(-0.2, 1.24, s * 0.42, R.r0 * 1.4, 0.1, 'gunLite');
        put(fin(b, 'gold'), kuduHorn([-0.2, 1.28, s * 0.42], V(-0.22, 1, s * 0.6), { ...R, a: GOLD, c: f === 3 ? 0x3a1a0a : GOLD_DEEP }));
      }
      if (f >= 2) {
        const r = f === 3 ? 0.17 : 0.12;
        fin(b, 'gold', GOLD); b.push().move(-0.22, 1.33, 0).cyl(r * 0.7, r, 0.08, 12).pop();
        b.push().move(-0.22, 1.37 + r, 0).ball(r, 2).pop();
      }
    }
    b.use('barrel');
    k.blk(0.68, 1.02, 0, 0.3, 0.3, 0.58, 'gun', 0.05);
    for (const s of [-1, 1]) cannon(b, 0.75, (K.my = 1.02), s * 0.15, K.stock.muzzle - 0.75, 0.08, CHROME, GOLD);
    b.use('hull');
    K.parts.push(...k.parts); K.top = f === 3 && orn ? 2.6 : 1.7;
    return finish(K);
  },

  // Én Bạc (ref 9): a plated pearl jet on hover pads, blue and red panels, a cockpit block with twin guns, and a wing
  // each side swept back along the body (each ~0.8 of the body long at III, ~1.7x the body wide tip to tip).
  // I: wings folded flat. II: wings 0.8 the size of III. III: full wings, long swallow tail, fire aura.
  enbac(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, C3(PEARL), C3(trim), deep, form), { f, orn } = K, red = C3(trim), navy = C3(deep);
    const white = f === 1 ? mix(PEARL, paint, 0.5) : C3(PEARL), blue = f === 1 ? mix(0x3a6ab8, paint, 0.4) : C3(0x2f6fd8);
    const k = new OKit(b, st, trim, form, { pearl: [white, 'pearl'], blue: [blue, 'enamel'], red: [red, 'enamel'], navy: [navy, 'dark'], panel: [blue, 'enamel'], gun: [white, 'pearl'], gunLite: [CHROME, 'chrome'], steel: [CHROME, 'chrome'], under: [navy, 'dark'], glass: [0x0d1a2a, 'glass'], chrome: [CHROME, 'chrome'] });
    b.use('hull');
    // Plated jet body: an arrow plan in pearl over a navy belly, a blue-inset deck, red nose plate and chevrons.
    k.prism([[1.38, 0], [0.7, 0.3], [-0.2, 0.5], [-0.9, 0.46], [-1.08, 0.24], [-1.08, -0.24], [-0.9, -0.46], [-0.2, -0.5], [0.7, -0.3]], 0.56, 0.72, 'navy', 0.04);
    k.prism([[1.3, 0], [0.66, 0.27], [-0.2, 0.46], [-0.85, 0.42], [-1.0, 0.22], [-1.0, -0.22], [-0.85, -0.42], [-0.2, -0.46], [0.66, -0.27]], 0.7, 0.88, 'pearl', 0.05);
    k.plate(-0.3, 0.92, 0, 1.1, 0.07, 0.62, { col: 'pearl', insert: 'blue', greeble: false });
    k.prism([[1.36, 0], [0.95, 0.14], [0.95, -0.14]], 0.84, 0.92, 'red', 0.02);
    for (const s of [-1, 1]) {
      k.plate(0.3, 0.78, s * 0.4, 0.7, 0.14, 0.1, { col: 'blue', insert: null, ry: s * 0.38 });
      k.decal('chev', -0.55, 0.96, s * 0.18, 0.2, '+y');
      k.blk(-1.04, 0.8, s * 0.22, 0.2, 0.18, 0.2, 'chrome', 0.04);
      h.flame(b, () => b.push().move(-1.24, 0.8, s * 0.22).rotZ(PI / 2).cyl(0.08, 0.02, 0.26, 8).pop());
    }
    // Solid wings swept back along the body: at III each ~0.8 of the body long, ~1.75x the body wide tip to tip.
    const W = [{ len: 0.8, reach: 0.1, n: 3, fl0: 0.25, fl1: 0.32 }, { len: 1.24, reach: 0.24, n: 6, fl0: 0.32, fl1: 0.44 }, { len: 1.55, reach: 0.3, n: 8, fl0: 0.36, fl1: 0.55 }][f - 1];
    const wcol = { panel: white, edge: blue, face: white, face2: mix(PEARL, 0x9fd4ff, 0.5) };
    for (const s of [-1, 1]) wingPanel(b, s, { x0: 0.25, z0: 0.44, y: 0.8, ...W, col: wcol }, orn ? 'all' : 'frame');
    if (orn) {
      const tl = [0.4, 0.66, 1.0][f - 1];
      for (const s of [-1, 1]) {
        const g = bladeGeo({ len: tl, w: 0.17, th: 0.045, sweep: -0.06, lift: 0.08, edge: CHROME, face: white, face2: red, back: navy, mz: s < 0 });
        at(b, s, [-0.98, 0.86, 0.1], [0.2, -PI + 0.24 + 0.05 * f, 0.06], () => put(b, g));
      }
      if (f === 3) fireAura(b, -0.15, 1.45, 1.25, 14, 0.95, AURA.wind);
    }
    // Cockpit block: pearl plate with a blue roof insert, a glass canopy, red side stripes, twin guns below.
    b.use('turret');
    k.oct(0.0, 0.96, 0, 0.36, 0.08, 'navy');
    k.plate(0.05, 1.08, 0, 0.72, 0.18, 0.5, { col: 'pearl', insert: 'blue', greeble: false });
    k.blk(0.26, 1.22, 0, 0.3, 0.12, 0.34, 'glass', 0.05);
    k.strip(0.42, 1.22, 0, 0.3, 'z', 'glow', 0.02);
    for (const s of [-1, 1]) k.blk(0.05, 1.08, s * 0.26, 0.6, 0.05, 0.03, 'red', 0.01);
    b.use('barrel');
    k.blk(0.48, 0.98, 0, 0.18, 0.12, 0.36, 'navy', 0.03);
    for (const s of [-1, 1]) cannon(b, 0.52, (K.my = 0.98), s * 0.12, K.stock.muzzle - 0.52, 0.05, CHROME, red);
    b.use('hull');
    K.parts.push(...k.parts); K.top = 1.35;
    return finish(K, { recoil: 0.2 });
  },

  // Lữ Bố (ref 11): an armoured silver dragon on hidden track pods. Silver plates with red inlays, the hull's front an
  // angular beast head (brow plates over red glowing eyes, an upper-jaw ridge, a lower jaw with teeth, horn blades
  // sweeping back), a red blade mane fanning back each side of the spine, a helmet turret with the crescent halberd
  // and pheasant plumes. I: plain plates and head. II: short mane and plumes. III: full mane, long plumes, aura.
  lubo(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, false), { f, orn } = K, red = C3(paint), gold = C3(trim), dred = C3(deep);
    const silver = f === 1 ? mix(CHROME, 0x8a8f98, 0.4) : mix(CHROME, PEARL, 0.35);
    const k = new OKit(b, st, trim, form, { gun: [silver, 'pearl'], panel: [red, 'enamel'], panelDeep: [dred, 'enamel'], gunLite: [gold, 'gold'], under: [0x22252b, 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], red: [red, 'enamel'] });
    b.use('hull');
    for (const s of [-1, 1]) k.trackPod(-0.2, s * 0.66, 2.1, 0.32, 0.52, { coverCol: 'gun', insert: 'panel', skirt: true, skirtH: 0.36 });
    k.prism([[0.85, 0.45], [0.95, 0.3], [0.95, -0.3], [0.85, -0.45], [-1.2, -0.52], [-1.3, -0.4], [-1.3, 0.4], [-1.2, 0.52]], 0.2, 0.66, 'under', 0.05);
    k.plate(-0.35, 0.7, 0, 1.5, 0.1, 0.96, { col: 'gun', insert: 'panel', greeble: false });
    k.blk(-1.28, 0.58, 0, 0.12, 0.18, 0.7, 'gunLite', 0.03);
    // Beast head: stacked angular plates; snout, upper-jaw ridge, lower jaw and teeth, brow plates, lamp eyes, horns.
    k.prism([[0.7, 0.5], [1.25, 0.34], [1.72, 0.1], [1.72, -0.1], [1.25, -0.34], [0.7, -0.5]], 0.5, 0.78, 'gun', 0.05);
    k.prism([[0.85, 0.28], [1.4, 0.14], [1.62, 0.0], [1.4, -0.14], [0.85, -0.28]], 0.78, 0.86, 'red', 0.03);
    k.prism([[0.75, 0.42], [1.2, 0.3], [1.55, 0.06], [1.55, -0.06], [1.2, -0.3], [0.75, -0.42]], 0.3, 0.46, 'under', 0.04);
    fin(b, 'chrome', CHROME); for (const s of [-1, 1]) for (let i = 0; i < 4; i++) b.push().move(1.05 + i * 0.13, 0.47, s * (0.3 - i * 0.06)).rotZ(PI).cyl(0, 0.03, 0.08, 4).pop();
    for (const s of [-1, 1]) {
      k.plate(1.1, 0.86, s * 0.3, 0.42, 0.06, 0.2, { col: 'gunLite', insert: null, ry: s * 0.4, rx: s * -0.35 });
      k.light(1.18, 0.74, s * 0.39, 0.06, LAMP.red, s > 0 ? '+z' : '-z');
      const g = bladeGeo({ len: [0.4, 0.6, 0.85][f - 1], w: 0.2, th: 0.05, sweep: -0.1, lift: 0.2, edge: CHROME, face: red, back: dred, mz: s < 0 });
      at(b, s, [0.92, 0.88, 0.3], [0.45, -PI + 0.3, 0.32], () => put(b, g));
    }
    if (orn && f >= 2) {
      // Mane: two fans of red blades along the spine, rolled ~30 degrees so their faces show from above.
      const n = f === 2 ? 4 : 6;
      for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
        const t = i / (n - 1), L = (f === 2 ? 0.55 : 0.85) * (0.75 + 0.4 * t);
        const g = bladeGeo({ seg: 6, len: L, w: 0.24, th: 0.06, sweep: -0.08, lift: 0.12, edge: CHROME, face: red, face2: mix(red, 0xff6a5a, 0.3), back: dred, mz: s < 0 });
        at(b, s, [0.25 - t * 1.25, 0.82, 0.18], [0.52, -PI + 0.15 + t * 0.55, 0.12], () => put(b, g));
      }
      if (f === 3) fireAura(b, -0.2, 1.75, 1.25, 16, 1.0, AURA.blood);
    }
    // Turret: octagonal helmet, silver with a red band and gold crest; plumes from its crown.
    b.use('turret');
    k.oct(-0.1, 0.8, 0, 0.5, 0.08, 'under');
    k.oct(-0.12, 0.93, 0, 0.44, 0.2, 'gun', 0.05, 1.2);
    k.oct(-0.15, 1.07, 0, 0.34, 0.08, 'red', 0.03, 1.2);
    k.blk(-0.15, 1.14, 0, 0.7, 0.06, 0.07, 'gunLite', 0.02);
    for (const s of [-1, 1]) k.light(0.38, 0.98, s * 0.16, 0.04, LAMP.red, '+x');
    if (orn && f >= 2) {
      const pl = f === 2 ? 0.95 : 1.75;
      fin(b, 'gold', gold); b.push().move(-0.36, 1.16, 0).cyl(0.07, 0.09, 0.08, 10).pop();
      for (const s of [-1, 1]) {
        const g = bladeGeo({ len: pl, w: 0.11, th: 0.03, wf: WF.plume, sweep: 0.05, lift: 0.5, seg: 10, edge: GOLD, face: red, back: dred, band: (t) => (Math.floor(t * 9) % 2 ? 0x2a1a12 : (t > 0.8 ? 0xf2e6c8 : 0xc87a2a)), mz: s < 0 });
        at(b, s, [-0.36, 1.2, 0.05], [0, -PI + 0.18, 0.35], () => put(b, g));
      }
    }
    // Crescent halberd (Phương Thiên Họa Kích): shaft, spear head, a crescent blade each side and a red tassel.
    b.use('barrel');
    const gx = 0.36, gy = (K.my = 1.0), mx = K.stock.muzzle, sh = mx - 0.45 - gx;
    k.blk(gx, gy, 0, 0.2, 0.18, 0.24, 'under', 0.04);
    b.push().move(gx, gy, 0).rotZ(-PI / 2); fin(b, 'chrome', CHROME).cyl(0.04, 0.045, sh * 2, 8); b.pop();
    fin(b, 'gold', gold); b.push().move(gx + sh, gy, 0).rotZ(-PI / 2).cyl(0.07, 0.07, 0.08, 10).pop();
    put(fin(b, 'chrome'), bladeGeo({ len: 0.46, w: 0.14, th: 0.05, wf: WF.spear, ridge: 0, edge: CHROME, face: CHROME, face2: 0xb8c0cc, back: 0xb8c0cc }).translate(gx + sh, gy, 0));
    for (const s of [-1, 1]) {
      const g = bladeGeo({ len: 0.36, w: 0.16, th: 0.04, wf: WF.petal, sweep: 0.5, edge: GOLD, face: CHROME, back: 0xb8c0cc, mz: s < 0 });
      at(b, s, [gx + sh - 0.04, gy, 0.03], [PI / 2, -PI / 2 + 0.5, 0], () => put(b, g));
    }
    fin(b, 'enamel', red); put(b, tubeGeo([V(gx + sh - 0.02, gy - 0.04, 0), V(gx + sh - 0.08, gy - 0.18, 0), V(gx + sh - 0.18, gy - 0.28, 0)], (t) => 0.05 * (1 - 0.7 * t) + 0.02, { sides: 6, caps: true }));
    b.use('hull');
    K.parts.push(...k.parts); K.top = f === 3 && orn ? 2.3 : 1.5;
    return finish(K);
  },

  // Khỉ Pháo (ref 13): the banana on a plated wheel chassis, monkey head, green cannon. Peel strips curl out and down
  // from its peeled rear end; low arched peel fenders and a yellow skirt hide the wheels.
  // I: short strips. II: full strips. III: two more strips, a gold Wukong circlet and a fire aura.
  khiphao(h, b, st, paint, trim, deep, form) {
    const purple = C3(paint), green = C3(trim), K = start(h, b, st, purple, green, deep, form, { paint: C3(0x6a4420), trim: green, F: { wheelSpan: 2.0, fenders: false } });
    const { f, orn } = K, lit = (fn) => h.lit(b, fn);
    const yellow = f === 1 ? mix(st.glow, 0x9a8a50, 0.35) : C3(st.glow), cream = C3(0xfff2c4), tip = C3(0x4a3a1a), peelEdge = mix(yellow, 0xa0700c, 0.5);
    const k = new OKit(b, st, trim, form, { gun: [green, 'enamel'], panel: [yellow, 'enamel'], gunLite: [GOLD, 'gold'], under: [0x2a2418, 'dark'], steel: [GOLD_DEEP, 'gold'], purple: [purple, 'enamel'] });
    b.use('hull');
    // Plated chassis under the banana: a dark frame, green side rails with gold caps, axle blocks.
    k.prism([[1.2, 0.3], [1.3, 0.15], [1.3, -0.15], [1.2, -0.3], [-1.2, -0.3], [-1.3, -0.15], [-1.3, 0.15], [-1.2, 0.3]], 0.36, 0.58, 'under', 0.04);
    for (const s of [-1, 1]) { k.plate(0, 0.56, s * 0.4, 1.7, 0.1, 0.16, { col: 'gun', insert: null }); k.blk(0.88, 0.6, s * 0.4, 0.12, 0.12, 0.18, 'gunLite', 0.02); k.blk(-0.88, 0.6, s * 0.4, 0.12, 0.12, 0.18, 'gunLite', 0.02); }
    const ban = [];
    // Bent both ways: tips up (side view) and a crescent bowing left (top view); the rear third peeled, cream fruit.
    for (let i = 0; i <= 16; i++) {
      const u = -1 + 2 * i / 16, e = 1 - u * u, peeled = u < -0.45 ? 0.82 : 1;
      ban.push({ x: u * 1.5, y: 0.74 + 0.36 * u * u, z: 0.34 * u * u - 0.14, hw: (0.5 * Math.pow(e, 0.55) + 0.045) * peeled, ht: (0.42 * Math.pow(e, 0.55) + 0.045) * peeled, hb: (0.34 * Math.pow(e, 0.55) + 0.045) * peeled, n: 2.2 });
    }
    put(fin(b, 'enamel'), loftGeo(ban, { sides: 10, hard: true, tone: (i, a) => { const u = -1 + 2 * i / 16; return u > 0.88 ? tip : u > 0.74 ? mix(yellow, tip, 0.5) : u < -0.45 ? cream : (Math.sin(a) < -0.6 ? mix(yellow, 0xb07a10, 0.5) : yellow); } }));
    k.oct(0, 1.18, 0, 0.44, 0.1, 'purple'); k.oct(0, 1.24, 0, 0.42, 0.03, 'gunLite');
    const kk = [0.8, 1, 1.08][f - 1];
    const strip = (pts, w) => put(fin(b, 'enamel'), tubeGeo(new THREE.CatmullRomCurve3(pts).getPoints(12), (t) => w * Math.pow(1 - t, 0.7) * (0.7 + 0.5 * Math.sin(PI * t)) + 0.01, { sides: 6, flatN: 0.16, caps: true, tone: (t, j) => (j <= 1 || j === 5 ? (t > 0.85 ? peelEdge : yellow) : cream) }));
    for (const s of [-1, 1]) {
      strip([V(-0.68, 1.08, s * 0.22), V(-0.95, 1.02, s * 0.58 * kk), V(-1.12, 0.78, s * 0.84 * kk), V(-1.2, 0.45, s * 0.95 * kk)], 0.24);
      if (orn && f >= 2) strip([V(-0.75, 1.14, s * 0.08), V(-1.15, 1.25, s * 0.22), V(-1.5 * kk, 1.05, s * 0.38), V(-1.66 * kk, 0.7, s * 0.45)], 0.2);
      // Low arched peel fenders over both wheels and a peel-yellow skirt over their outer faces.
      for (const x of [-1.0, 1.0]) strip([V(x - 0.48, 0.6, s * 0.74), V(x - 0.15, 0.8, s * 0.76), V(x + 0.2, 0.8, s * 0.76), V(x + 0.5, 0.58, s * 0.74)], 0.2);
      k.plate(0, 0.36, s * 0.93, 2.75, 0.5, 0.07, { col: 'panel', insert: null });
      k.blk(0, 0.62, s * 0.93, 2.6, 0.04, 0.09, 'gun', 0.015);
      k.blk(0, 0.12, s * 0.93, 2.7, 0.04, 0.09, 'gunLite', 0.015);
    }
    if (orn && f === 3) fireAura(b, 0, 1.75, 1.3, 14, 0.95, AURA.jungle);
    // Turret: the monkey head with a cream face, round ears and lamp eyes.
    b.use('turret');
    fin(b, 'enamel', purple); b.push().move(-0.05, 1.45, 0).scale(1.05, 0.92, 1).ball(0.36, 2).pop();
    fin(b, 'pearl', cream); b.push().move(0.18, 1.43, 0).scale(0.75, 0.85, 1.1).ball(0.27, 2).pop();
    b.push().move(0.38, 1.33, 0).scale(0.9, 0.6, 1.1).ball(0.15, 1).pop();
    for (const s of [-1, 1]) {
      fin(b, 'enamel', purple); b.push().move(-0.08, 1.53, s * 0.38).rotX(PI / 2).cyl(0.15, 0.15, 0.07, 14).pop();
      fin(b, 'pearl', 0xf2b8a0); b.push().move(-0.08, 1.53, s * 0.42).rotX(PI / 2).cyl(0.1, 0.1, 0.02, 12).pop();
    }
    lit(() => { for (const s of [-1, 1]) b.push().move(0.36, 1.53, s * 0.1).ball(0.045, 1).pop(); });
    fin(b, 'dark', DARKM); b.push().move(0.3, 1.65, 0).rotZ(-0.2).chamfer(0.12, 0.05, 0.36, 0.02).pop();
    if (orn && f === 3) {
      fin(b, 'gold', GOLD); b.push().move(-0.05, 1.63, 0).scale(1.05, 1, 1).geo(new THREE.TorusGeometry(0.33, 0.035, 6, 24).rotateX(PI / 2)).pop();
      for (const s of [-1, 1]) put(b, tubeGeo([V(-0.38, 1.63, s * 0.06), V(-0.55, 1.75, s * 0.14), V(-0.6, 1.95, s * 0.12), V(-0.5, 2.05, s * 0.06)], (t) => 0.03 * (1 - 0.6 * t), { sides: 6, caps: true }));
    }
    b.use('barrel');
    const gx = 0.38;
    k.blk(gx, (K.my = 1.33), 0, 0.16, 0.2, 0.24, 'under', 0.04);
    k.cannon(gx, K.my, 0, K.stock.muzzle - gx - 0.04, 0.1, { col: 'gun', ribs: 3, stripe: 'glow' });
    b.use('hull');
    K.parts.push(...k.parts); K.top = 1.9;
    return finish(K, { recoil: 0.15 });
  },

  // Tê Giác (ref 12): a squat rhino brawler on two short track pods: ivory plated torso with red inserts and gold
  // trim, an angular rhino head with a curved horn, curved layered pauldrons and huge rounded gauntlets forward (banded
  // red forearms, fists with knuckle bumps and gold knuckle plates). I: modest arms, one pauldron plate. II: big gauntlets, two plates.
  // III: huge spiked gauntlets, three plates, second horn, fire aura.
  tegiac(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, false), { f, orn } = K, ivory = C3(paint), red = C3(deep), gold = C3(trim);
    const k = new OKit(b, st, trim, form, { gun: [ivory, 'pearl'], panel: [red, 'enamel'], panelDeep: [mix(red, 0x000000, 0.3), 'enamel'], gunLite: [gold, 'gold'], under: [0x24262b, 'dark'], steel: [GOLD_DEEP, 'gold'], red: [red, 'enamel'], chrome: [CHROME, 'chrome'] });
    b.use('hull');
    for (const s of [-1, 1]) k.trackPod(0, s * 0.62, 1.7, 0.36, 0.56, { coverCol: 'red', insert: 'gunLite', skirt: f >= 2 });
    k.prism([[0.75, 0.4], [0.86, 0.25], [0.86, -0.25], [0.75, -0.4], [-0.75, -0.44], [-0.86, -0.3], [-0.86, 0.3], [-0.75, 0.44]], 0.2, 0.7, 'under', 0.05);
    k.plate(-0.1, 0.76, 0, 1.3, 0.12, 0.9, { col: 'gun', insert: 'panel', greeble: false });
    k.plate(0.72, 0.6, 0, 0.3, 0.1, 0.8, { col: 'gun', insert: null, rz: -0.6 });
    k.blk(-0.84, 0.6, 0, 0.1, 0.2, 0.7, 'gunLite', 0.03);
    if (orn && f === 3) fireAura(b, 0, 1.6, 1.6, 14, 1.0, AURA.steam);
    // Turret: angular rhino head of stacked plates, horn on the snout, ears, side eye lamps.
    b.use('turret');
    k.oct(-0.05, 0.86, 0, 0.5, 0.08, 'under');
    k.plate(-0.02, 1.0, 0, 0.82, 0.24, 0.66, { col: 'gun', insert: 'panel', greeble: false });
    k.plate(0.5, 0.96, 0, 0.34, 0.2, 0.44, { col: 'gun', insert: null, rz: -0.35 });
    k.blk(0.3, 1.14, 0, 0.1, 0.05, 0.56, 'gunLite', 0.02);
    for (const s of [-1, 1]) { k.blk(-0.32, 1.18, s * 0.22, 0.1, 0.14, 0.06, 'gun', 0.02); k.light(0.3, 1.04, s * 0.335, 0.05, LAMP.amber, s > 0 ? '+z' : '-z'); }
    const hr = [0.08, 0.13, 0.17][f - 1], hl = [0.25, 0.55, 0.75][f - 1], hx = 0.58, hy = 1.08;
    const horn = [V(hx, hy, 0), V(hx + hl * 0.45, hy + hl * 0.35, 0), V(hx + hl * 0.62, hy + hl * 0.85, 0), V(hx + hl * 0.5, hy + hl * 1.15, 0)];
    put(fin(b, 'pearl'), tubeGeo(new THREE.CatmullRomCurve3(horn).getPoints(14), (t) => hr * Math.pow(1 - t, 0.9) + 0.004, { sides: 9, caps: true, up: V(0, 0, 1), tone: (t) => mix(ivory, GOLD, Math.min(1, t * 1.3)) }));
    if (orn && f === 3) put(fin(b, 'gold'), tubeGeo([V(0.22, 1.12, 0), V(0.3, 1.26, 0), V(0.31, 1.38, 0)], (t) => 0.08 * (1 - t) + 0.004, { sides: 8, caps: true, up: V(0, 0, 1), tone: () => C3(GOLD) }));
    b.use('barrel');
    k.blk(0.62, (K.my = 0.92), 0, 0.16, 0.16, 0.22, 'under', 0.04);
    cannon(b, 0.64, K.my, 0, K.stock.muzzle - 0.64, 0.075, CHROME, GOLD);
    // The arms are this brawler's body (drawn on the bare frame too); spikes, extra pauldron plates and the second
    // horn are its signature.
    b.use('turret');
    const sc = [0.75, 1.0, 1.22][f - 1];
    for (const s of [-1, 1]) {
      const sz = 0.6 + 0.05 * sc, ez = 0.75 + 0.36 * sc, ay = 0.88;
      pauldron(b, s, [-0.08, 1.16, sz], 0.3 * sc, !orn || f === 1 ? 1 : f === 2 ? 2 : 3, [red, ivory, red]);
      fin(b, 'dark', DARKM); b.rod([-0.1, 1.06, s * sz], [-0.12, ay, s * ez], 0.09 * sc, 8);
      // Gauntlet: a rounded forearm with gold armour bands.
      const fl = 0.62 * sc, x0 = -0.14, fa = [];
      for (let j = 0; j <= 4; j++) { const t = j / 4; fa.push({ x: x0 + fl * t, y: ay, z: s * ez, hw: (0.15 + 0.04 * t) * sc, ht: (0.15 + 0.03 * t) * sc, hb: (0.13 + 0.02 * t) * sc, n: 2.8 }); }
      put(fin(b, 'enamel'), loftGeo(fa, { sides: 14, tone: (i, a) => (Math.sin(a) > 0.6 ? mix(red, 0xff6a4a, 0.25) : red) }));
      for (const t of orn && f >= 2 ? [0.2, 0.55, 0.9] : [0.25, 0.85]) {
        const p = { x: x0 + fl * t, y: ay, z: s * ez, hw: (0.16 + 0.04 * t) * sc, ht: (0.16 + 0.03 * t) * sc, hb: (0.14 + 0.02 * t) * sc };
        const ring = []; for (let m = 0; m <= 16; m++) ring.push(sePoint(p, m / 16 * TAU, 1.02, 2.8));
        put(fin(b, 'gold', gold), tubeGeo(ring, () => 0.028 * sc, { sides: 5, caps: false }));
      }
      // Fist: a rounded knuckle block, four knuckle bumps with gold plates, a thumb; knuckle spikes at III.
      const cx = x0 + fl + 0.2 * sc, fw = 0.25 * sc;
      const blk = [0, 0.5, 1].map((t) => ({ x: cx - fw + 2 * fw * t, y: ay, z: s * ez, hw: fw * (t === 1 ? 0.92 : 1), ht: fw * 0.95, hb: fw * 0.85, n: 3 }));
      put(fin(b, 'enamel'), loftGeo(blk, { sides: 16, tone: () => red }));
      for (let i = 0; i < 4; i++) {
        const z = s * (ez + (i - 1.5) * 0.12 * sc);
        fin(b, 'enamel', red); b.push().move(cx + fw * 0.95, ay + 0.06 * sc, z).ball(0.075 * sc, 1).pop();
        fin(b, 'gold', gold); b.push().move(cx + fw * 0.7, ay + 0.2 * sc, z).rotZ(-0.5).chamfer(0.16 * sc, 0.04, 0.1 * sc, 0.015).pop();
        if (orn && f === 3) { fin(b, 'chrome', CHROME); b.push().move(cx + fw + 0.1 * sc, ay + 0.07 * sc, z).rotZ(-PI / 2).cyl(0, 0.04 * sc, 0.15 * sc, 6).pop(); }
      }
      fin(b, 'enamel', red); b.push().move(cx + 0.02 * sc, ay - 0.1 * sc, s * (ez - fw * 0.95)).rotY(s * 0.5).scale(1.6, 0.8, 0.8).ball(0.08 * sc, 1).pop();
    }
    b.use('hull');
    K.parts.push(...k.parts); K.top = 1.6 + (f === 3 ? 0.2 : 0);
    return finish(K, { recoil: 0.2 });
  },
  ...B1,
};

// The tanks that opt in: key → builder (hb, b, st, paint, trim, deep, form) → info.
export const ORNATE = TANKS;
export function ornateModel(h, b, key, st, paint, trim, deep, form) {
  // Near-constant UVs: the baked metal set's panel seams and scored lines stay off these polished surfaces; parts are
  // told apart by real steps, rims and materials instead.
  b.uvScale = 0.02;
  return TANKS[key](h, b, st, paint, trim, deep, form);
}
