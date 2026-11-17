// Frames for the newer tanks: one generator that builds a mech from a data spec (the `frame` field of its STYLES row)
// instead of a hand-written design. Same contract as DESIGNS in mechs.js: it fills the builder's batches (hull,
// turret, flame/tflame, leg0..N, named part batches) and returns { muzzle, muzzleY, S, height, legs, stride, hover, parts }.
// Models face +x, +z is the right side, the ground is y = 0.
//
// Spec: { hull, hullL, hullW, hullH, nose, segs, move, turret, turretS, turretX, gun, gunL, sig, S, ride }
//   hull:   block | wedge | long | pod | disc | hex | diamond | tri | wide | shell | boat | segmented
//   move:   tracks | wheels4 | wheels6 | wheels8 | legs2 | legs4 | legs6 | legs8 | hover
//   turret: box | wedge | tower | dome | low | none
//   gun:    long | twin | short | mortar | lens | launcher | quad | rotary | flamer | trident | halberd | lance | bow
//   sig:    one or more signature pieces (SIGS below), hard-surface parts sized to read from the match camera.
import * as THREE from '../../vendor/three.module.min.js';

let sk, lit, flame, tflame, side, limb, vent, bolts, line, DARK, GUN, STEEL, BLACK, RUB, X, TAU;
const PI = Math.PI;

export function frameDesign(h, spec) {
  return (b, paint, trim, deep) => {
    ({ sk, lit, flame, tflame, side, limb, vent, bolts, line, DARK, GUN, STEEL, BLACK, RUB, X, TAU } = h);
    return build(b, spec, paint, trim, deep);
  };
}
// Running gear of a frame spec alone (tracks, wheels, legs or hover pads), for models drawn elsewhere (ornate.js):
// the same footprint and leg contract as the full frame. Returns the ride heights and the legs and parts it added.
export function frameGear(h, b, F, paint, trim, deep) {
  ({ sk, lit, flame, tflame, side, limb, vent, bolts, line, DARK, GUN, STEEL, BLACK, RUB, X, TAU } = h);
  const C = frameCtx(b, F, paint, trim, deep);
  b.use('hull'); moveGear(C); b.use('hull');
  return { y0: C.y0, y1: C.y1, legs: C.legs, parts: C.parts };
}

// ---------- outlines (top view, points [x, z]) ----------
function mirror(half) {
  const back = half.slice().reverse().filter((p) => Math.abs(p[1]) > 1e-6).map(([x, z]) => [x, -z]);
  return half.concat(back);
}
function outline(kind, L, W, n) {
  const l = L / 2, w = W / 2, c = Math.min(0.2, w * 0.35);
  const ell = (a, bb, k = 8) => { const o = []; for (let i = 0; i <= k; i++) { const t = i / k * PI; o.push([a * Math.cos(t), bb * Math.sin(t)]); } return o; };
  switch (kind) {
    case 'wedge': return mirror([[l, w * n], [l * 0.1, w], [-l + c, w], [-l, w - c]]);
    case 'long': return mirror([[l, w * n], [l - 0.4, w], [-l + c, w], [-l, w - c]]);
    case 'pod': return mirror(ell(l, w, 10));
    case 'disc': return mirror(ell(w, w, 12));
    case 'hex': return mirror([[l, 0], [l * 0.42, w], [-l * 0.42, w], [-l, 0]]);
    case 'diamond': return mirror([[l, 0], [l * 0.05, w], [-l * 0.7, w * 0.45], [-l, 0]]);
    case 'tri': return mirror([[l, w * 0.14], [-l * 0.55, w], [-l, w * 0.6]]);
    case 'wide': return mirror([[l, w - c], [l - c, w], [-l + c, w * 0.8], [-l, w * 0.8 - c]]);
    case 'shell': { const o = []; for (let i = 0; i <= 6; i++) { const t = i / 6 * PI / 2; o.push([-l * 0.2 + l * 1.2 * Math.cos(t), w * Math.sin(t)]); } o.push([-l, w * 0.85]); return mirror(o); }
    case 'boat': return mirror([[l, 0], [l * 0.35, w * 0.85], [-l * 0.3, w], [-l, w * 0.8]]);
    default: return mirror([[l, w - c], [l - c, w], [-l + c, w], [-l, w - c]]);
  }
}
const sc = (O, k, cx = 0) => O.map(([x, z]) => [cx + (x - cx) * k, z * k]);
const shift = (O, dx) => O.map(([x, z]) => [x + dx, z]);
function halfW(O, x) {
  let m = 0;
  for (let i = 0; i < O.length; i++) {
    const a = O[i], c = O[(i + 1) % O.length];
    if (a[0] === c[0] || (a[0] - x) * (c[0] - x) > 0) continue;
    const t = (x - a[0]) / (c[0] - a[0]); m = Math.max(m, Math.abs(a[1] + t * (c[1] - a[1])));
  }
  return m;
}

// ---------- shared pieces ----------
function blk(b, x, y, z, w, h, d, ch = 0.03) { return b.push().move(x, y, z).chamfer(w, h, d, Math.min(ch, w * 0.4, h * 0.4, d * 0.4)).pop(); }
// Armour plate: painted block with a deep lip on top, an optional lit strip on its outer face and corner bolts.
function plate(C, x, y, z, w, h, d, o = {}) {
  const b = C.b;
  b.push().move(x, y, z);
  if (o.ry) b.rotY(o.ry); if (o.rz) b.rotZ(o.rz); if (o.rx) b.rotX(o.rx);
  sk(b, 'paint', o.col || C.paint).chamfer(w, h, d, Math.min(0.035, w * 0.3, h * 0.3, d * 0.3));
  sk(b, 'paint', o.lip || C.deep).push().move(0, h / 2, 0).chamfer(w * 0.86, 0.025, d * 0.78, 0.01).pop();
  if (o.strip) lit(b, () => b.push().move(0, -h * 0.15, (d / 2 + 0.006) * o.strip).box(w * 0.7, 0.025, 0.012).pop());
  if (o.bolts !== false && w > 0.2 && d > 0.12) bolts(b, [[-w * 0.38, h / 2 + 0.01, -d * 0.32], [w * 0.38, h / 2 + 0.01, -d * 0.32], [-w * 0.38, h / 2 + 0.01, d * 0.32], [w * 0.38, h / 2 + 0.01, d * 0.32]], 0.018);
  return b.pop();
}
// Tapered segmented arm through points, with steel collars at the joints and a lit tip.
function chain(C, pts, r0, r1, col, tip = true) {
  const b = C.b, n = pts.length - 1;
  for (let k = 0; k < n; k++) {
    const ra = r0 + (r1 - r0) * k / n, rb = r0 + (r1 - r0) * (k + 1) / n;
    sk(b, 'paint', k % 2 ? C.deep : (col || C.paint)).rod(pts[k], pts[k + 1], ra, 7, rb);
    if (k) sk(b, 'dark', GUN).push().move(...pts[k]).ball(ra * 1.18, 0).pop();
  }
  if (tip) lit(b, () => b.push().move(...pts[n]).ball(r1 * 1.3, 0).pop());
  return b;
}
const rnd = (a, d = 3) => Number(a.toFixed(d));
// Chamfered bar lying between two points of the XZ plane at height y.
function bar(b, a, c, y, w, h, ch = 0.03) {
  const dx = c[0] - a[0], dz = c[1] - a[1];
  return b.push().move((a[0] + c[0]) / 2, y, (a[1] + c[1]) / 2).rotY(Math.atan2(-dz, dx)).chamfer(Math.hypot(dx, dz) + w * 0.3, h, w, ch).pop();
}

// ---------- hull ----------
function hullBody(C, O, y0, y1, cx = 0, detail = true) {
  const b = C.b, h = y1 - y0;
  sk(b, 'dark', DARK).prism(sc(O, 0.94, cx), y0, y0 + h * 0.55, 0.05);
  sk(b, 'paint', C.paint).prism(O, y0 + h * 0.42, y1, Math.min(0.07, h * 0.2));
  sk(b, 'paint', C.deep).prism(sc(O, 0.78, cx), y1 - 0.01, y1 + 0.045, 0.015);
  const OL = sc(O, 0.955, cx);
  lit(b, () => {
    for (let i = 0; i < OL.length; i++) {
      const a = OL[i], c = OL[(i + 1) % OL.length];
      if (Math.hypot(c[0] - a[0], c[1] - a[1]) < 0.18) continue;
      b.rod([a[0], y0 + h * 0.28, a[1]], [c[0], y0 + h * 0.28, c[1]], 0.014, 4);
    }
  });
  if (!detail) return;
  let x0 = Infinity, x1 = -Infinity;
  for (const [x] of O) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const len = x1 - x0;
  for (const f of [0.3, 0.62]) { const x = x0 + len * f, hw = halfW(O, x) * 0.7; if (hw > 0.1) line(b, x, y1 + 0.047, 0, 0.022, hw * 2); }
  for (const s of [-1, 1]) { const x = x0 + len * 0.46; line(b, x, y1 + 0.047, s * halfW(O, x) * 0.42, len * 0.34, 0.02); }
  const bx = [0.2, 0.42, 0.64, 0.84].map((f) => x0 + len * f);
  bolts(b, bx.flatMap((x) => [[x, y1 + 0.05, halfW(O, x) * 0.66], [x, y1 + 0.05, -halfW(O, x) * 0.66]]), 0.02);
  const vx = x0 + len * 0.17, vw = halfW(O, vx);
  if (vw > 0.2) { b.push().move(vx, y1 + 0.05, 0); vent(b, Math.min(0.4, len * 0.14), vw * 1.1, 5); b.pop(); }
  // Side armour: plates on the upper flanks with lit gaps.
  const n = len > 1.6 ? 3 : 2, pw = len * 0.62 / n;
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
    const x = x0 + len * 0.22 + pw * (i + 0.5), z = halfW(O, x);
    if (z < 0.15) continue;
    plate(C, x, y1 - h * 0.28, s * (z + 0.015), pw * 0.92, h * 0.42, 0.07, { col: i % 2 ? C.deep : C.paint, lip: C.trim, strip: s, bolts: false, rx: s * -0.12 });
  }
  // Nose lamps and rear exhausts.
  const fz = halfW(O, x1 - 0.12);
  lit(b, () => { for (const s of [-1, 1]) b.push().move(x1 - 0.06, y0 + h * 0.62, s * Math.max(0.08, fz * 0.55)).box(0.06, 0.06, 0.12).pop(); });
  for (const s of [-1, 1]) {
    const z = s * Math.max(0.12, halfW(O, x0 + 0.15) * 0.5);
    b.push().move(x0 + 0.08, y1 - 0.05, z).rotZ(0.95);
    sk(b, 'steel', STEEL).lathe([[0.06, 0], [0.07, 0.2], [0.09, 0.22], [0.09, 0.3]], 8);
    flame(b, () => b.push().move(0, 0.4, 0).cyl(0.012, 0.07, 0.2, 6).pop());
    b.pop();
  }
}

// ---------- running gear ----------
function tracks(C, len, tw, cx = 0, zc) {
  const b = C.b, l = len / 2, top = C.y0 + 0.34, zIn = zc ?? C.W / 2 - 0.04;
  for (const s of [-1, 1]) {
    const zi = s * zIn, zo = s * (zIn + tw);
    sk(b, 'rubber', RUB); side(b, [[cx - l - 0.12, 0.3], [cx - l + 0.1, 0.04], [cx + l - 0.1, 0.04], [cx + l + 0.14, 0.32], [cx + l, top], [cx - l, top]], Math.min(zi, zo), Math.max(zi, zo), 0.03);
    const nw = Math.max(3, Math.round(len / 0.45));
    for (let i = 0; i < nw; i++) {
      const x = cx - l + 0.18 + i * (len - 0.36) / (nw - 1);
      sk(b, 'steel', STEEL).push().move(x, 0.27, zo + s * 0.012).rotX(X).cyl(0.17, 0.17, 0.04, 10).pop();
      sk(b, 'dark', GUN).push().move(x, 0.27, zo + s * 0.035).rotX(X).cyl(0.06, 0.08, 0.04, 6).pop();
    }
    sk(b, 'paint', C.deep).push().move(cx, top + 0.035, s * (zIn + tw / 2)).chamfer(len * 0.98, 0.06, tw + 0.06, 0.02).pop();
    sk(b, 'paint', C.trim).push().move(cx, top + 0.07, zo + s * 0.02).box(len * 0.9, 0.02, 0.03).pop();
    lit(b, () => b.push().move(cx - l * 0.2, top - 0.08, zo + s * 0.032).box(len * 0.5, 0.025, 0.015).pop());
    b.use('tread'); sk(b, 'dark', GUN);
    for (let x = cx - l + 0.1; x <= cx + l - 0.1; x += 0.2) b.push().move(x, top + 0.075, s * (zIn + tw / 2)).box(0.08, 0.02, tw * 0.8).pop();
    b.use(C.batch);
  }
  if (!C.parts.some((p) => p.name === 'tread')) C.parts.push({ name: 'tread', on: 'hull', kind: 'tread', step: 0.2 });
}
function wheels(C, n, r, span, ring) {
  const b = C.b, ww = 0.26, z = C.W / 2 + ww / 2 + 0.03, per = n / 2;
  const xs = []; for (let i = 0; i < per; i++) xs.push(C.hx + (per === 1 ? 0 : -span / 2 + i * span / (per - 1)));
  b.use('wheel');
  sk(b, 'rubber', RUB).push().rotX(X).cyl(r, r, ww, 14).pop();
  sk(b, 'rubber', BLACK); for (let k = 0; k < 10; k++) b.push().rotZ(k * TAU / 10).move(r - 0.01, 0, 0).box(0.07, r * 0.32, ww + 0.02).pop();
  sk(b, 'steel', STEEL).push().rotX(X).cyl(r * 0.56, r * 0.56, ww + 0.02, 10).pop();
  sk(b, 'dark', GUN); for (const s of [-1, 1]) for (let k = 0; k < 5; k++) b.push().rotZ(k * TAU / 5).move(r * 0.36, 0, s * (ww / 2 + 0.012)).rotX(X).cyl(0.025, 0.025, 0.025, 5).pop();
  if (ring) lit(b, () => { for (const s of [-1, 1]) b.push().move(0, 0, s * (ww / 2 + 0.03)).geo(new THREE.TorusGeometry(r * 0.8, 0.03, 4, 18)).pop(); });
  b.use(C.batch);
  C.parts.push({ name: 'wheel', on: 'hull', kind: 'roll', axis: 'z', r, at: xs.flatMap((x) => [[x, r, z], [x, r, -z]]) });
  for (const x of xs) for (const s of [-1, 1]) {
    sk(b, 'dark', GUN).rod([x, r, s * (C.W / 2 - 0.1)], [x, r, s * (z - ww / 2)], 0.05, 6);
    if (C.F.fenders === false) continue; // a model that covers its wheels with its own armour (ornate.js)
    b.push().move(x, r * 2 + 0.06, s * z).rotX(s * 0.1);
    sk(b, 'paint', C.paint).chamfer(r * 2.1, 0.07, ww + 0.1, 0.02);
    sk(b, 'paint', C.trim).push().move(0, 0.04, s * (ww / 2 + 0.03)).box(r * 1.8, 0.03, 0.02).pop();
    lit(b, () => b.push().move(r * 0.95, -0.02, 0).box(0.03, 0.03, ww * 0.6).pop());
    b.pop();
  }
}
// Walking leg swept round its hip (hip at the origin, foot toward +x).
function legSweep(C, i, p, a, o) {
  const b = C.b, hy = p[1], R = o.reach, t = o.th || 1;
  const kx = R * 0.45, ky = hy * 0.45 + 0.12;
  b.use('leg' + i);
  sk(b, 'dark', GUN).ball(0.1 * t, 0);
  sk(b, 'dark', DARK); limb(b, [0, 0], [kx, ky], 0.14 * t, 0.15 * t);
  b.push().move(0, 0.05 * t, 0); sk(b, 'paint', i % 2 ? C.deep : C.paint); limb(b, [0.04, 0.04], [kx * 0.95, ky], 0.19 * t, 0.2 * t, 0.045); b.pop();
  sk(b, 'paint', C.trim).push().move(kx * 0.5, ky * 0.5 + 0.13 * t, 0).rotZ(Math.atan2(ky, kx)).box(kx * 0.6, 0.015, 0.21 * t).pop();
  lit(b, () => b.push().move(kx * 0.5, ky * 0.5 + 0.02, 0.105 * t).rotZ(Math.atan2(ky, kx)).box(kx * 0.6, 0.025, 0.01).pop());
  sk(b, 'steel', STEEL).push().move(kx, ky, 0).ball(0.085 * t, 0).pop();
  const fx = R, fy = -hy + 0.05;
  sk(b, 'dark', DARK).rod([kx, ky, 0], [fx, fy, 0], 0.04 * t, 6, 0.075 * t);
  sk(b, 'paint', C.paint); limb(b, [kx + (fx - kx) * 0.12, ky + (fy - ky) * 0.12], [kx + (fx - kx) * 0.5, ky + (fy - ky) * 0.5], 0.13 * t, 0.12 * t, 0.03);
  sk(b, 'dark', GUN).push().move(fx, fy + 0.02, 0).cyl(0.05 * t, 0.09 * t, 0.08, 6).pop();
  if (o.claw) { sk(b, 'steel', STEEL); for (const s of [-1, 1]) b.push().move(fx + 0.08, fy + 0.02, s * 0.05).rotY(s * 0.4).rotZ(X).cyl(0, 0.035 * t, 0.2, 4).pop(); }
  b.use(C.batch);
  C.legs.push({ p, yaw: -a, ph: o.ph, kind: 'sweep', amp: o.amp, lift: o.lift ?? 0.22 });
}
// Hanging leg that swings fore and aft (hip at the origin, foot straight down).
function legSwing(C, i, p, o) {
  const b = C.b, hy = p[1], t = o.th || 1, sz = p[2] > 0 ? 1 : -1;
  const kx = 0.28 * t, ky = -hy * 0.42, ax = -0.1, ay = -hy * 0.82;
  b.use('leg' + i);
  sk(b, 'dark', GUN).push().rotX(X).cyl(0.16 * t, 0.16 * t, 0.2, 10).pop();
  sk(b, 'dark', DARK); limb(b, [0, 0], [kx, ky], 0.2 * t, 0.2 * t);
  b.push().move(0, 0, sz * 0.1 * t); sk(b, 'paint', C.paint); limb(b, [0.0, 0.03], [kx * 0.9, ky * 0.85], 0.27 * t, 0.08, 0.03); b.pop();
  lit(b, () => b.push().move(kx * 0.5, ky * 0.5, sz * 0.145 * t).rotZ(Math.atan2(ky, kx)).box(Math.hypot(kx, ky) * 0.6, 0.025, 0.01).pop());
  sk(b, 'steel', STEEL).push().move(kx, ky, 0).rotX(X).cyl(0.11 * t, 0.11 * t, 0.26 * t, 8).pop();
  sk(b, 'dark', DARK); limb(b, [kx, ky], [ax, ay], 0.15 * t, 0.16 * t);
  b.push().move(0, 0, sz * 0.09 * t); sk(b, 'paint', C.deep); limb(b, [kx * 0.9, ky * 1.05], [ax * 0.5, ay * 0.95], 0.2 * t, 0.05, 0.02); b.pop();
  sk(b, 'steel', STEEL).push().move(ax, ay, 0).rotX(X).cyl(0.08, 0.08, 0.2, 8).pop();
  sk(b, 'dark', DARK); limb(b, [ax, ay], [0.0, -hy + 0.06], 0.12, 0.14);
  sk(b, 'paint', C.trim);
  const foot = o.foot || 1;
  for (const a of [-0.45, 0, 0.45]) b.push().move(0.0, -hy + 0.03, 0).rotY(a).move(0.22 * foot, 0, 0).rotZ(-0.1).chamfer(0.46 * foot, 0.08, 0.13, 0.025).pop();
  sk(b, 'dark', GUN).push().move(-0.2 * foot, -hy + 0.03, 0).rotZ(0.3).chamfer(0.26 * foot, 0.07, 0.12, 0.02).pop();
  b.use(C.batch);
  C.legs.push({ p, yaw: 0, ph: o.ph, kind: 'swing', amp: o.amp || 0.34, lift: 0.1 });
}
function hoverPads(C, pts, r) {
  const b = C.b;
  for (const [x, z] of pts) {
    sk(b, 'dark', GUN).push().move(x, C.y0 - 0.04, z).cyl(r, r * 1.25, 0.12, 10).pop();
    lit(b, () => b.push().move(x, C.y0 - 0.11, z).cyl(r * 0.8, r * 0.8, 0.02, 10).pop());
    flame(b, () => b.push().move(x, C.y0 - 0.28, z).cyl(r * 0.85, r * 0.15, 0.3, 8).pop());
  }
}
function moveGear(C) {
  const { F } = C, mv = C.move, L = C.L, W = C.W;
  if (mv === 'tracks') tracks(C, F.trackL || L * 0.96, F.trackW || 0.36, F.trackX || 0);
  else if (mv.startsWith('wheels')) wheels(C, Number(mv.slice(6)), F.wheelR || 0.32, F.wheelSpan || L * 0.66, F.wheelRing);
  else if (mv === 'hover') {
    const l = L / 2 * 0.6, w = W / 2 * 0.62;
    hoverPads(C, (F.pads || [[l, w], [l, -w], [-l, w], [-l, -w]]).map(([x, z]) => [x + C.hx, z]), F.padR || 0.2);
  } else if (mv === 'legs2') {
    for (let i = 0; i < 2; i++) { const s = i ? 1 : -1; legSwing(C, i, [(F.hipX || 0) + C.hx, C.y0 + 0.06, s * (W / 2 + 0.06)], { ph: i * PI, th: F.legT || 1, foot: F.foot }); }
  } else {
    const n = Number(mv.slice(4)), per = n / 2, R = F.reach || 0.9, hy = C.y0 + 0.08;
    for (let k = 0; k < per; k++) for (const s of [-1, 1]) {
      const i = k * 2 + (s > 0 ? 1 : 0), f = per === 1 ? 0 : k / (per - 1);
      const x = C.hx + (F.legSpan || L * 0.6) * (0.5 - f), spread = F.spread ?? 0.55;
      const a = s * (PI / 2 - spread * (1 - 2 * f));
      legSweep(C, i, [rnd(x), rnd(hy), rnd(s * W * 0.4)], a, { reach: R * (F.legGrow ? 1 + F.legGrow * (1 - f) : 1), th: F.legT || 1, ph: (k + (s > 0 ? 1 : 0)) % 2 ? PI : 0, amp: 0.28 * s, claw: F.claw });
    }
  }
}

// ---------- turret ----------
function turret(C) {
  const { b, F } = C, kind = F.turret || 'box', s = F.turretS || 1, tx = (F.turretX || 0) + C.hx, ty = C.y1 + 0.04;
  b.use('turret');
  C.batch = 'turret';
  if (kind === 'none') {
    sk(b, 'dark', GUN).push().move(tx, ty + 0.03, 0).cyl(0.24 * s, 0.28 * s, 0.08, 10).pop();
    sk(b, 'dark', DARK); blk(b, tx, ty + 0.18 * s, 0, 0.42 * s, 0.24 * s, 0.34 * s, 0.05);
    sk(b, 'paint', C.trim).push().move(tx, ty + 0.305 * s, 0).box(0.3 * s, 0.02, 0.06).pop();
    lit(b, () => b.push().move(tx - 0.215 * s, ty + 0.18 * s, 0).box(0.012, 0.05, 0.2 * s).pop());
    Object.assign(C, { tx, gx: tx + 0.2 * s, gy: ty + 0.18 * s, ttop: ty + 0.31 * s, tz: 0.17 * s, tlen: 0.42 * s });
    return;
  }
  sk(b, 'dark', GUN).push().move(tx, ty + 0.02, 0).cyl(0.44 * s, 0.48 * s, 0.08, 16).pop();
  let top, zh, x0, x1;
  if (kind === 'dome') {
    const r = 0.5 * s;
    b.push().move(tx, ty + 0.05, 0);
    sk(b, 'paint', C.paint).lathe([[r, 0], [r, 0.12 * s], [r * 0.86, 0.3 * s], [r * 0.52, 0.42 * s], [0, 0.46 * s]], 10);
    lit(b, () => b.push().move(0, 0.13 * s, 0).cyl(r * 1.005, r * 1.005, 0.025, 10).pop());
    sk(b, 'paint', C.deep).push().move(0, 0.44 * s, 0).cyl(r * 0.36, r * 0.42, 0.04, 10).pop();
    sk(b, 'glass', BLACK).push().move(r * 0.72, 0.27 * s, 0).rotZ(-0.6).chamfer(0.08, 0.16 * s, 0.42 * s, 0.02).pop();
    lit(b, () => b.push().move(r * 0.78, 0.29 * s, 0).rotZ(-0.6).box(0.02, 0.03, 0.34 * s).pop());
    b.pop();
    top = ty + 0.5 * s; zh = r; x0 = tx - r; x1 = tx + r;
  } else {
    const P = kind === 'wedge' ? [[0.78, 0], [0.3, 0.36], [-0.45, 0.42], [-0.56, 0.22], [-0.56, -0.22], [-0.45, -0.42], [0.3, -0.36]]
      : kind === 'low' ? [[0.6, 0.34], [0.7, 0.16], [0.7, -0.16], [0.6, -0.34], [-0.5, -0.5], [-0.62, -0.32], [-0.62, 0.32], [-0.5, 0.5]]
        : [[0.52, 0.3], [0.64, 0.15], [0.64, -0.15], [0.52, -0.3], [-0.44, -0.42], [-0.56, -0.3], [-0.56, 0.3], [-0.44, 0.42]];
    const ht = (kind === 'tower' ? 0.66 : kind === 'low' ? 0.26 : 0.4) * s, ws = kind === 'tower' ? 0.78 : 1;
    const pts = P.map(([x, z]) => [tx + x * s * ws, z * s * ws]);
    sk(b, 'paint', C.paint).prism(pts, ty + 0.05, ty + 0.05 + ht, 0.06);
    sk(b, 'paint', C.deep).prism(sc(pts, 0.74, tx), ty + 0.04 + ht, ty + 0.08 + ht, 0.015);
    top = ty + 0.08 + ht; zh = 0.42 * s * ws; x0 = tx - 0.56 * s * ws; x1 = tx + P[0][0] * s * ws;
    for (const z of [-1, 1]) {
      sk(b, 'paint', C.deep).push().move(tx - 0.02 * s, ty + 0.05 + ht * 0.5, z * (zh + 0.02)).rotY(z * 0.12).chamfer(0.7 * s * ws, ht * 0.7, 0.08, 0.025).pop();
      lit(b, () => b.push().move(tx - 0.02 * s, ty + 0.05 + ht * 0.82, z * (zh + 0.065)).rotY(z * 0.12).box(0.6 * s * ws, 0.03, 0.02).pop());
      sk(b, 'paint', C.trim).push().move(tx - 0.1 * s, top + 0.005, z * zh * 0.4).box(0.7 * s * ws, 0.015, 0.06).pop();
      bolts(b, [[tx - 0.3 * s, top, z * zh * 0.75], [tx + 0.1 * s, top, z * zh * 0.75]], 0.018);
    }
    line(b, tx + 0.15 * s, top + 0.002, 0, 0.02, zh * 1.2);
    b.push().move(tx - 0.38 * s * ws, top, 0); vent(b, 0.16 * s, 0.4 * s * ws, 3); b.pop();
    sk(b, 'dark', GUN).push().move(tx - 0.15 * s, top, -zh * 0.45).lathe([[0.15 * s, 0], [0.15 * s, 0.06], [0.11 * s, 0.1], [0, 0.11]], 10).pop();
  }
  sk(b, 'dark', GUN).rod([x0 + 0.1, top - 0.02, zh * 0.55], [x0 + 0.02, top + 0.55, zh * 0.6], 0.012, 4);
  lit(b, () => b.push().move(x0 + 0.02, top + 0.56, zh * 0.6).ball(0.03, 0).pop());
  const gy = F.gunY ?? (ty + 0.05 + (top - ty) * 0.48);
  sk(b, 'dark', DARK); blk(b, x1 + 0.02, gy, 0, 0.24 * s, 0.26 * s, 0.4 * s, 0.05);
  Object.assign(C, { tx, gx: x1 + 0.1, gy, ttop: top, tz: zh, tlen: x1 - x0, tx0: x0 });
}

// ---------- guns ----------
function barrel(b, x, y, z, len, r, extra) {
  b.push().move(x, y, z).rotZ(X);
  sk(b, 'steel', STEEL).lathe([[r * 1.2, 0], [r * 1.2, 0.18], [r, 0.24], [r, len * 0.55], [r * 1.3, len * 0.6], [r * 1.3, len * 0.78], [r, len * 0.84], [r * 0.9, len], [r * 1.1, len + 0.02]], 10);
  b.pop();
  if (extra !== false) { sk(b, 'dark', DARK).push().move(x + len, y, z).chamfer(0.18, r * 1.9, r * 2.6, 0.02).pop(); }
  lit(b, () => b.push().move(x + len + 0.095, y, z).rotZ(X).cyl(r * 0.7, r * 0.7, 0.015, 8).pop());
}
function gun(C) {
  const { b, F } = C, kind = F.gun || 'long', s = F.turretS || 1, x = C.gx, y = C.gy, len = F.gunL || 1.1;
  let mx = x + len + 0.1, my = y, dir;
  b.use('barrel');
  const recoil = { name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.3 };
  if (kind === 'long') barrel(b, x, y, 0, len, 0.1 * s);
  else if (kind === 'twin') for (const z of [-1, 1]) barrel(b, x, y, z * 0.13 * s, len, 0.075 * s);
  else if (kind === 'short') { barrel(b, x, y, 0, len, 0.15 * s); recoil.amt = 0.2; }
  else if (kind === 'quad') for (const yy of [-1, 1]) for (const z of [-1, 1]) barrel(b, x, y + yy * 0.08 * s, z * 0.1 * s, len, 0.055 * s, false);
  else if (kind === 'mortar') {
    const el = 0.7; b.push().move(x - 0.1, y, 0).rotZ(X + el);
    sk(b, 'dark', DARK).lathe([[0.2 * s, -0.2], [0.24 * s, -0.15], [0.24 * s, 0.1], [0.2 * s, 0.15], [0.19 * s, len * 0.8], [0.24 * s, len * 0.85], [0.24 * s, len], [0.2 * s, len]], 12);
    sk(b, 'paint', C.trim); for (const yy of [0.05, len * 0.5]) b.push().move(0, yy, 0).cyl(0.215 * s, 0.215 * s, 0.05, 12).pop();
    lit(b, () => b.push().move(0, len - 0.01, 0).cyl(0.15 * s, 0.15 * s, 0.02, 10).pop());
    b.pop(); dir = [Math.cos(el), Math.sin(el)]; mx = x - 0.1 + dir[0] * len; my = y + dir[1] * len; recoil.dir = [-dir[0], -dir[1], 0]; recoil.amt = 0.3;
  } else if (kind === 'lens') {
    b.push().move(x, y, 0).rotZ(X);
    sk(b, 'dark', GUN).lathe([[0.15 * s, 0], [0.15 * s, len * 0.6], [0.2 * s, len * 0.7], [0.22 * s, len], [0.12 * s, len]], 12);
    b.pop();
    lit(b, () => {
      for (const f of [0.18, 0.34, 0.5]) b.push().move(x + len * f, y, 0).geo(new THREE.TorusGeometry(0.17 * s, 0.022, 4, 14).rotateY(PI / 2)).pop();
      b.push().move(x + len - 0.01, y, 0).rotZ(X).cyl(0.17 * s, 0.17 * s, 0.02, 12).pop();
    });
    mx = x + len; recoil.amt = 0.15;
  } else if (kind === 'launcher') {
    sk(b, 'dark', GUN); blk(b, x + len * 0.4, y, 0, len * 0.8, 0.32 * s, 0.46 * s, 0.03);
    sk(b, 'paint', C.trim); blk(b, x + len * 0.4, y + 0.17 * s, 0, len * 0.7, 0.03, 0.4 * s, 0.01);
    for (let r = 0; r < 2; r++) for (let j = 0; j < 3; j++) {
      sk(b, 'dark', BLACK).push().move(x + len * 0.8 + 0.005, y + (r - 0.5) * 0.14 * s, (j - 1) * 0.13 * s).rotZ(X).cyl(0.045 * s, 0.045 * s, 0.03, 8).pop();
      lit(b, () => b.push().move(x + len * 0.8 + 0.01, y + (r - 0.5) * 0.14 * s, (j - 1) * 0.13 * s).rotZ(X).cyl(0.025 * s, 0.025 * s, 0.03, 6).pop());
    }
    mx = x + len * 0.8; recoil.amt = 0.12;
  } else if (kind === 'flamer') {
    sk(b, 'steel', STEEL).push().move(x, y, 0).rotZ(X).cyl(0.1 * s, 0.12 * s, len * 0.6, 8).pop().push().move(x + len * 0.3, y, 0).rotZ(X).cyl(0.1 * s, 0.12 * s, 0.01, 8).pop();
    sk(b, 'dark', DARK); side(b, [[x + len * 0.55, y - 0.1 * s], [x + len, y - 0.14 * s], [x + len, y + 0.14 * s], [x + len * 0.55, y + 0.1 * s]], -0.2 * s, 0.2 * s, 0.02);
    lit(b, () => b.push().move(x + len + 0.005, y, 0).box(0.012, 0.18 * s, 0.32 * s).pop());
    b.use('turret');
    for (const z of [-1, 1]) { sk(b, 'paint', C.trim).push().move(C.tx - 0.2 * s, y + 0.05, z * (C.tz + 0.13)).rotZ(X).cyl(0.11, 0.11, 0.5 * s, 10).pop(); lit(b, () => b.push().move(C.tx - 0.2 * s, y + 0.05, z * (C.tz + 0.13)).rotZ(X).cyl(0.113, 0.113, 0.04, 10).pop()); }
    b.use('barrel'); mx = x + len; recoil.amt = 0.1;
  } else if (kind === 'trident' || kind === 'halberd' || kind === 'lance') {
    sk(b, 'steel', STEEL).push().move(x, y, 0).rotZ(X).lathe([[0.09 * s, 0], [0.09 * s, len * 0.7], [0.12 * s, len * 0.72], [0.12 * s, len * 0.78], [0.06 * s, len * 0.8], [0.06 * s, len]], 8).pop();
    sk(b, 'paint', C.trim).push().move(x + len, y, 0).rotZ(X).cyl(0, 0.09 * s, 0.42, 6).pop();
    lit(b, () => b.push().move(x + len * 0.5, y + 0.09 * s, 0).box(len * 0.6, 0.02, 0.03).pop());
    if (kind === 'trident') {
      sk(b, 'dark', DARK); blk(b, x + len * 0.8, y, 0, 0.12, 0.12 * s, 0.6 * s, 0.02);
      for (const z of [-1, 1]) {
        sk(b, 'steel', STEEL).rod([x + len * 0.8, y, z * 0.28 * s], [x + len + 0.1, y, z * 0.3 * s], 0.045 * s, 6);
        sk(b, 'paint', C.trim).push().move(x + len + 0.1, y, z * 0.3 * s).rotZ(X).cyl(0, 0.07 * s, 0.3, 5).pop();
      }
    } else if (kind === 'halberd') {
      sk(b, 'paint', C.trim); side(b, [[x + len * 0.7, y + 0.08], [x + len * 0.95, y + 0.08], [x + len * 1.02, y + 0.5 * s], [x + len * 0.82, y + 0.42 * s], [x + len * 0.68, y + 0.5 * s]], -0.045, 0.045, 0.015);
      lit(b, () => b.rod([x + len * 0.69, y + 0.49 * s, 0], [x + len * 1.01, y + 0.49 * s, 0], 0.014, 4));
    }
    mx = x + len + 0.42; recoil.amt = 0.25;
  } else if (kind === 'bow') {
    b.use('turret');
    for (const z of [-1, 1]) {
      const pts = [[x, y, z * 0.12], [x - 0.12, y + 0.05, z * 0.6 * s], [x - 0.42, y + 0.08, z * 1.1 * s]];
      sk(b, 'paint', C.paint).rod(pts[0], pts[1], 0.1 * s, 6, 0.085 * s); sk(b, 'paint', C.deep).rod(pts[1], pts[2], 0.085 * s, 6, 0.06 * s);
      sk(b, 'dark', GUN).push().move(...pts[1]).ball(0.11 * s, 0).pop();
      plate(C, x - 0.1, y + 0.13 * s, z * 0.5 * s, 0.28, 0.08, 0.3 * s, { col: C.trim, bolts: false, ry: z * 0.25 });
      sk(b, 'steel', STEEL).push().move(...pts[2]).cyl(0.07, 0.07, 0.18, 6).pop();
      lit(b, () => b.rod(pts[2], [x - 0.62, y + 0.08, z * 0.03], 0.016, 4));
    }
    sk(b, 'dark', DARK); blk(b, x + 0.1, y, 0, len + 0.6, 0.12 * s, 0.2 * s, 0.02);
    b.use('barrel');
    sk(b, 'steel', STEEL).rod([x - 0.6, y + 0.1, 0], [x + len, y + 0.1, 0], 0.035, 6);
    sk(b, 'paint', C.trim).push().move(x + len + 0.1, y + 0.1, 0).rotZ(X).cyl(0, 0.09, 0.28, 4).pop();
    mx = x + len + 0.25; my = y + 0.1; recoil.amt = 0.35;
  } else if (kind === 'rotary') {
    sk(b, 'dark', GUN); blk(b, x + 0.05, y, 0, 0.22, 0.3 * s, 0.3 * s, 0.03);
    b.use('drum');
    sk(b, 'steel', STEEL);
    for (let k = 0; k < 6; k++) { const a = k * TAU / 6; b.rod([0, Math.cos(a) * 0.08 * s, Math.sin(a) * 0.08 * s], [len, Math.cos(a) * 0.08 * s, Math.sin(a) * 0.08 * s], 0.028 * s, 5); }
    sk(b, 'dark', GUN).push().move(0.15, 0, 0).rotZ(X).cyl(0.14 * s, 0.14 * s, 0.07, 8).pop().push().move(len * 0.85, 0, 0).rotZ(X).cyl(0.13 * s, 0.13 * s, 0.06, 8).pop();
    lit(b, () => b.push().move(len + 0.005, 0, 0).rotZ(X).cyl(0.04 * s, 0.04 * s, 0.01, 6).pop());
    C.parts.push({ name: 'drum', on: 'turret', kind: 'spin', axis: 'x', by: 'fire', p: [rnd(x + 0.15), rnd(y), 0] });
    b.use('turret'); mx = x + 0.15 + len; return { mx, my };
  }
  C.parts.push(recoil);
  b.use('turret');
  return { mx, my };
}

// ---------- signature pieces ----------
// Each takes the context (hull and turret dims are on it) and draws into the batch it names.
const SIGS = {
  // Bulldozer ram across the nose, on hydraulic rams, with hazard teeth.
  ram(C) {
    const { b } = C, x = C.hx + C.L / 2 + 0.22, w = C.W * 1.05, y = C.y0 + C.Hh * 0.5;
    b.use('hull');
    b.push().move(x, y, 0).rotZ(-0.28);
    sk(b, 'paint', C.trim).chamfer(0.18, C.Hh * 1.1, w, 0.04);
    sk(b, 'paint', C.deep).push().move(0.1, 0, 0).chamfer(0.04, C.Hh * 0.8, w * 0.92, 0.01).pop();
    for (let i = 0; i < 5; i++) sk(b, 'steel', STEEL).push().move(0.05, -C.Hh * 0.55, (i - 2) * w * 0.21).rotZ(X).cyl(0, 0.07, 0.22, 4).pop();
    lit(b, () => b.push().move(0.13, C.Hh * 0.2, 0).box(0.012, 0.03, w * 0.8).pop());
    b.pop();
    for (const s of [-1, 1]) { sk(b, 'steel', STEEL).rod([C.hx + C.L / 2 - 0.3, y + 0.1, s * C.W * 0.3], [x - 0.05, y, s * C.W * 0.32], 0.04, 6); sk(b, 'dark', GUN).rod([C.hx + C.L / 2 - 0.3, y + 0.1, s * C.W * 0.3], [x - 0.25, y + 0.04, s * C.W * 0.31], 0.065, 6); }
  },
  // Big curved horns off the turret cheeks, sweeping out and forward.
  horns(C) {
    const { b } = C, x = C.tx, y = C.ttop - 0.1, z = C.tz;
    b.use('turret');
    for (const s of [-1, 1]) {
      sk(b, 'dark', GUN).push().move(x, y, s * (z + 0.05)).rotX(X).cyl(0.17, 0.17, 0.16, 8).pop();
      chain(C, [[x, y, s * (z + 0.1)], [x - 0.05, y + 0.15, s * (z + 0.6)], [x + 0.25, y + 0.38, s * (z + 1.0)], [x + 0.7, y + 0.55, s * (z + 1.05)], [x + 1.05, y + 0.5, s * (z + 0.8)]], 0.17, 0.04, C.trim);
    }
  },
  // Battle axe slung across the rear deck.
  axe(C) {
    const { b } = C, x = C.hx - C.L / 2 + 0.35, y = C.y1 + 0.16;
    b.use('hull');
    sk(b, 'dark', GUN).rod([x, y, -C.W * 0.55], [x, y, C.W * 0.62], 0.05, 6);
    sk(b, 'paint', C.trim); side(b, [[x - 0.12, y], [x + 0.12, y], [x + 0.32, y + 0.12], [x + 0.3, y + 0.5], [x - 0.3, y + 0.5], [x - 0.32, y + 0.12]], C.W * 0.4, C.W * 0.5, 0.02);
    lit(b, () => b.push().move(x, y + 0.5, C.W * 0.45).box(0.6, 0.02, 0.07).pop());
  },
  // Rock peaks on the hull corners and the turret shoulders, faceted, with a lit seam.
  peaks(C) {
    const { b } = C, l = C.L / 2, w = C.W / 2;
    b.use('hull');
    for (const [x, z, h, r] of [[l * 0.55, w * 0.85, 0.75, 0.3], [l * 0.55, -w * 0.85, 0.6, 0.26], [-l * 0.6, w * 0.95, 0.95, 0.36], [-l * 0.6, -w * 0.95, 0.8, 0.32], [-l * 0.05, w * 1.02, 0.5, 0.24], [-l * 0.05, -w * 1.02, 0.55, 0.24]]) {
      sk(b, 'paint', C.deep).push().move(C.hx + x, C.y1 + h * 0.3, z).rotY(x + z).cyl(r * 0.12, r, h, 5).pop();
      sk(b, 'paint', C.paint).push().move(C.hx + x + r * 0.2, C.y1 + h * 0.2, z * 1.06).rotY(z).cyl(0, r * 0.6, h * 0.7, 4).pop();
      lit(b, () => b.push().move(C.hx + x, C.y1 + h * 0.55, z).box(0.03, h * 0.35, 0.03).pop());
    }
  },
  // Thick stone slabs hung on the flanks.
  slabs(C) {
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) plate(C, C.hx + (i - 0.5) * C.L * 0.42, C.y0 + C.Hh * 0.5, s * (C.W / 2 + 0.16), C.L * 0.38, C.Hh * 1.05, 0.16, { col: i ? C.paint : C.deep, lip: C.trim, strip: s, rx: s * 0.15 });
  },
  // Crescent glaive on a long pole down the left flank, blade past the nose.
  glaive(C) {
    const { b } = C, z = -(C.W / 2 + 0.12), y = C.y1 + 0.05, x0 = C.hx - C.L / 2 + 0.1, x1 = C.hx + C.L / 2 + 0.05;
    b.use('hull');
    sk(b, 'dark', GUN).rod([x0, y, z], [x1, y + 0.05, z], 0.045, 6);
    for (const x of [x0 + 0.4, C.hx + 0.3]) { sk(b, 'dark', DARK); blk(b, x, y - 0.06, z * 0.92, 0.12, 0.14, 0.18, 0.02); }
    sk(b, 'paint', C.trim); side(b, [[x1 - 0.1, y], [x1 + 0.5, y + 0.12], [x1 + 0.7, y + 0.45], [x1 + 0.45, y + 0.3], [x1 + 0.1, y + 0.32], [x1 - 0.1, y + 0.18]], z - 0.05, z + 0.05, 0.02);
    sk(b, 'steel', STEEL).prism([[x1 - 0.05, z - 0.06], [x1 + 0.6, z - 0.2], [x1 + 0.6, z + 0.03], [x1 - 0.05, z + 0.06]], y - 0.03, y + 0.05, 0.01);
    lit(b, () => b.rod([x1 + 0.45, y + 0.31, z], [x1 + 0.7, y + 0.46, z], 0.016, 4));
  },
  // Tall swept crest on the turret roof.
  crest(C) {
    const { b } = C, x = C.tx - 0.1, y = C.ttop;
    b.use('turret');
    sk(b, 'paint', C.trim); side(b, [[x + 0.15, y], [x - 0.25, y], [x - 0.75, y + 0.62], [x - 0.55, y + 0.66]], -0.06, 0.06, 0.02);
    sk(b, 'paint', C.deep); side(b, [[x + 0.08, y], [x - 0.2, y], [x - 0.6, y + 0.5], [x - 0.48, y + 0.52]], -0.09, 0.09, 0.02);
    lit(b, () => b.rod([x - 0.05, y + 0.08, 0.07], [x - 0.6, y + 0.6, 0.07], 0.014, 4).rod([x - 0.05, y + 0.08, -0.07], [x - 0.6, y + 0.6, -0.07], 0.014, 4));
  },
  // Universe ring circling above the turret, spinning, with weighted blocks.
  ring(C) {
    const { b } = C, y = C.ttop + 0.25, r = 0.78;
    b.use('ring');
    sk(b, 'paint', C.trim).geo(new THREE.TorusGeometry(r, 0.08, 6, 28).rotateX(PI / 2));
    lit(b, () => b.push().move(0, 0.07, 0).geo(new THREE.TorusGeometry(r, 0.022, 4, 28).rotateX(PI / 2)).pop());
    for (let k = 0; k < 6; k++) { b.push().rotY(k * TAU / 6).move(r, 0, 0); sk(b, 'dark', GUN).chamfer(0.2, 0.14, 0.14, 0.03); b.pop(); }
    C.parts.push({ name: 'ring', on: 'turret', kind: 'spin', axis: 'y', by: 'time', rate: 1.4, p: [rnd(C.tx), rnd(y), 0] });
    b.use('turret');
    sk(b, 'dark', GUN).rod([C.tx - 0.1, C.ttop - 0.05, 0], [C.tx - 0.1, y - 0.05, 0], 0.04, 6);
  },
  // Hound ears on the turret rear.
  ears(C) {
    const { b } = C, x = C.tx - C.tlen * 0.25, y = C.ttop - 0.02;
    b.use('turret');
    for (const s of [-1, 1]) {
      b.push().move(x, y, s * C.tz * 0.6).rotX(s * 0.35);
      sk(b, 'paint', C.paint); side(b, [[0.16, 0], [-0.2, 0], [-0.12, 0.42]], -0.05, 0.05, 0.02);
      sk(b, 'paint', C.trim); side(b, [[0.08, 0.04], [-0.12, 0.04], [-0.1, 0.3]], 0.05, 0.065, 0.004);
      b.pop();
    }
  },
  // Big lit third eye on the turret brow.
  eye(C) {
    const { b } = C, x = C.tx + C.tlen * 0.32, y = C.ttop - 0.03;
    b.use('turret');
    sk(b, 'dark', DARK); blk(b, x, y, 0, 0.2, 0.14, 0.34, 0.04);
    lit(b, () => b.push().move(x + 0.1, y, 0).rotZ(X).scale(1, 1, 0.5).cyl(0.06, 0.06, 0.02, 10).pop());
    sk(b, 'paint', C.trim).push().move(x + 0.05, y + 0.08, 0).chamfer(0.22, 0.04, 0.38, 0.015).pop();
  },
  // Round shield standing in front of the nose on two arms.
  shield(C) {
    const { b } = C, x = C.hx + C.L / 2 + 0.25, y = C.y1 - 0.05, r = C.W * 0.52;
    b.use('hull');
    b.push().move(x, y, 0).rotZ(X);
    sk(b, 'paint', C.trim).cyl(r, r, 0.12, 14);
    sk(b, 'paint', C.paint).push().move(0, 0.07, 0).cyl(r * 0.82, r * 0.9, 0.04, 14).pop();
    sk(b, 'steel', STEEL).push().move(0, 0.1, 0).cyl(0.1, r * 0.22, 0.08, 8).pop();
    lit(b, () => b.push().move(0, 0.1, 0).geo(new THREE.TorusGeometry(r * 0.6, 0.02, 4, 20).rotateX(PI / 2)).pop());
    b.pop();
    for (const s of [-1, 1]) sk(b, 'dark', GUN).rod([C.hx + C.L / 2 - 0.15, y - 0.1, s * r * 0.4], [x - 0.05, y, s * r * 0.45], 0.05, 6);
  },
  // Owl crest: a row of stacked plates over the dome, front to back.
  owl(C) {
    const { b } = C, y = C.ttop;
    b.use('turret');
    for (let i = 0; i < 4; i++) plate(C, C.tx + 0.25 - i * 0.2, y + 0.04 + i * 0.05, 0, 0.22, 0.1 + i * 0.05, 0.12, { col: i % 2 ? C.trim : C.paint, bolts: false, rz: 0.3 });
    for (const s of [-1, 1]) { sk(b, 'paint', C.trim).push().move(C.tx + 0.1, y - 0.06, s * C.tz * 0.85).rotX(s * -0.6).cyl(0.02, 0.09, 0.32, 5).pop(); }
  },
  // Three dog heads on a collar across the nose.
  heads(C) {
    const { b } = C, x = C.hx + C.L / 2, y = C.y0 + C.Hh * 0.75;
    b.use('hull');
    sk(b, 'dark', GUN); blk(b, x - 0.05, y, 0, 0.18, 0.16, C.W * 0.9, 0.03);
    for (const [z, k] of [[-C.W * 0.34, 0.85], [0, 1.1], [C.W * 0.34, 0.85]]) {
      b.push().move(x + 0.18 * k, y + 0.05, z).rotY(-z * 0.4);
      sk(b, 'paint', C.paint).chamfer(0.4 * k, 0.26 * k, 0.28 * k, 0.05);
      sk(b, 'paint', C.deep).push().move(0.26 * k, -0.04, 0).chamfer(0.22 * k, 0.16 * k, 0.2 * k, 0.03).pop();
      for (const s of [-1, 1]) sk(b, 'paint', C.trim).push().move(-0.08, 0.16 * k, s * 0.09 * k).rotX(s * -0.4).cyl(0, 0.05 * k, 0.16 * k, 4).pop();
      lit(b, () => { for (const s of [-1, 1]) b.push().move(0.2 * k, 0.07 * k, s * 0.075 * k).box(0.02, 0.03, 0.05).pop(); });
      b.pop();
    }
  },
  // Flame vents like hair: a bank of stacks on the turret back.
  vents(C) {
    const { b } = C, x = C.tx - C.tlen * 0.42, y = C.ttop - 0.08;
    b.use('turret');
    for (let i = 0; i < 5; i++) {
      const z = (i - 2) * C.tz * 0.38, h = 0.32 + (2 - Math.abs(i - 2)) * 0.1;
      b.push().move(x, y, z).rotZ(0.5);
      sk(b, 'dark', GUN).cyl(0.06, 0.08, h, 6);
      tflame(b, () => b.push().move(0, h / 2 + 0.12, 0).cyl(0.015, 0.06, 0.24, 6).pop());
      b.pop();
    }
  },
  // Two long plumes swept back from the turret, in armoured segments.
  plumes(C) {
    const { b } = C, x = C.tx - 0.1, y = C.ttop;
    b.use('turret');
    for (const s of [-1, 1]) chain(C, [[x, y, s * 0.12], [x - 0.3, y + 0.4, s * 0.25], [x - 0.8, y + 0.62, s * 0.42], [x - 1.4, y + 0.55, s * 0.6], [x - 1.85, y + 0.3, s * 0.72]], 0.06, 0.03, C.trim);
  },
  // Horse-head prow over the nose.
  horse(C) {
    const { b } = C, x = C.hx + C.L / 2 - 0.15, y = C.y1;
    b.use('hull');
    sk(b, 'paint', C.trim); side(b, [[x - 0.2, y - 0.25], [x + 0.25, y - 0.2], [x + 0.62, y - 0.02], [x + 0.62, y + 0.12], [x + 0.25, y + 0.3], [x + 0.05, y + 0.42], [x - 0.15, y + 0.28]], -0.15, 0.15, 0.04);
    sk(b, 'paint', C.deep); side(b, [[x + 0.05, y + 0.42], [x - 0.15, y + 0.28], [x - 0.35, y + 0.15], [x - 0.1, y + 0.5]], -0.06, 0.06, 0.015);
    lit(b, () => { for (const s of [-1, 1]) b.push().move(x + 0.3, y + 0.17, s * 0.15).box(0.08, 0.03, 0.01).pop(); });
  },
  // Four tentacles from the rear, curling up and out (sway with the gait).
  tentacles(C) {
    const { b } = C, x = C.hx - C.L / 2 + 0.15, y = C.y0 + C.Hh * 0.5;
    b.use('tail');
    for (const [z, up] of [[-0.42, 0.2], [-0.15, 0.55], [0.15, 0.55], [0.42, 0.2]]) {
      const s = Math.sign(z);
      chain(C, [[x, y, z * C.W], [x - 0.3, y + up * 0.5, z * C.W * 1.15], [x - 0.6, y + up, z * C.W * 1.25 + s * 0.04], [x - 0.75, y + up + 0.3, z * C.W * 1.3 + s * 0.08], [x - 0.65, y + up + 0.55, z * C.W * 1.3 + s * 0.12]], 0.13, 0.04, C.trim);
    }
    C.parts.push({ name: 'tail', on: 'hull', kind: 'sway', p: [rnd(x), rnd(y), 0], model: true, amp: 0.12 });
  },
  // Beaked prow.
  beak(C) {
    const { b } = C, x = C.hx + C.L / 2 - 0.05, y = C.y0 + C.Hh * 0.6;
    b.use('hull');
    sk(b, 'paint', C.deep).prism([[x, 0.18], [x + 0.45, 0], [x, -0.18]], y - 0.08, y + 0.12, 0.02);
    sk(b, 'paint', C.trim).prism([[x, 0.12], [x + 0.32, 0], [x, -0.12]], y + 0.11, y + 0.16, 0.01);
  },
  // Collar frill of thick ribbed plates fanned behind the turret.
  frill(C) {
    const { b } = C, x = C.tx - 0.1, y = C.ttop - 0.12;
    b.use('turret');
    for (let i = 0; i < 7; i++) {
      const a = PI + (i - 3) * 0.42;
      b.push().move(x, y, 0).rotY(a).rotZ(0.55).move(0.42, 0, 0);
      sk(b, 'paint', i % 2 ? C.deep : C.paint).chamfer(0.56, 0.1, 0.26 - Math.abs(i - 3) * 0.02, 0.03);
      sk(b, 'dark', GUN).push().move(-0.05, 0.06, 0).box(0.46, 0.03, 0.05).pop();
      lit(b, () => b.push().move(0.26, 0.04, 0).box(0.03, 0.03, 0.18).pop());
      b.pop();
    }
  },
  // Segmented tail on a sway pivot.
  tail(C, o = {}) {
    const { b } = C, x = C.rx + 0.1, y = C.y0 + C.Hh * (o.h ?? 0.6), len = o.len || 1.3, up = o.up ?? 0.1, r = o.r || 0.15;
    b.use(o.name || 'tail');
    const n = 5, pts = [];
    for (let k = 0; k <= n; k++) { const t = k / n; pts.push([x - len * t, y + up * Math.sin(t * PI * 0.8) + (o.curl || 0) * t * t, (o.bend || 0) * t * t]); }
    chain(C, pts, r, r * 0.4, C.paint, !o.spike);
    for (let k = 0; k < n; k += 2) {
      const a = pts[k], c = pts[k + 1];
      sk(b, 'paint', C.trim).push().move((a[0] + c[0]) / 2, (a[1] + c[1]) / 2 + r * (1 - k * 0.12) * 0.85, (a[2] + c[2]) / 2).rotZ(Math.atan2(c[1] - a[1], c[0] - a[0])).chamfer(len / n * 0.8, 0.05, r * 1.2, 0.015).pop();
    }
    if (o.spike) sk(b, 'steel', STEEL).push().move(...pts[n]).rotZ(PI / 2).cyl(0, 0.08, 0.5, 5).pop();
    C.parts.push({ name: o.name || 'tail', on: 'hull', kind: 'sway', p: [rnd(x), rnd(y), 0], model: true, amp: o.amp || 0.16 });
  },
  // Forked boom tail, each boom ending in a jet pod.
  fork(C) {
    const { b } = C, x = C.hx - C.L / 2 + 0.2, y = C.y1 - 0.1;
    b.use('hull');
    for (const s of [-1, 1]) {
      const ex = x - 0.55, ez = s * (C.W / 2 + 0.08), a = [x, s * C.W * 0.15];
      sk(b, 'paint', C.paint); bar(b, a, [ex, ez], y, 0.2, 0.16, 0.04);
      sk(b, 'paint', C.trim); bar(b, [a[0] - 0.1, a[1]], [ex + 0.15, ez * 0.95], y + 0.085, 0.06, 0.02, 0.005);
      b.push().move(ex, y, ez);
      sk(b, 'dark', GUN).push().rotZ(PI / 2).lathe([[0.13, -0.25], [0.16, 0], [0.16, 0.2], [0.12, 0.3]], 10).pop();
      lit(b, () => b.push().move(-0.28, 0, 0).rotZ(X).cyl(0.1, 0.1, 0.02, 10).pop());
      flame(b, () => b.push().move(-0.45, 0, 0).rotZ(-X).cyl(0.02, 0.1, 0.3, 6).pop());
      b.pop();
    }
  },
  // Lit visor band across the turret front.
  visor(C) {
    const { b } = C;
    b.use('turret');
    sk(b, 'glass', BLACK).push().move(C.tx + C.tlen * 0.3, C.ttop - 0.08, 0).chamfer(0.12, 0.1, C.tz * 1.7, 0.02).pop();
    lit(b, () => b.push().move(C.tx + C.tlen * 0.3 + 0.065, C.ttop - 0.08, 0).box(0.01, 0.03, C.tz * 1.5).pop());
  },
  // Crest plume block swept back off the head.
  plume(C) {
    const { b } = C, x = C.tx - 0.1, y = C.ttop - 0.05;
    b.use('turret');
    for (let i = 0; i < 3; i++) plate(C, x - 0.25 - i * 0.22, y + 0.1 + i * 0.08, 0, 0.36, 0.08, 0.2 - i * 0.04, { col: i % 2 ? C.trim : C.deep, bolts: false, rz: 0.35 });
  },
  // Scarab horn rising off the nose, forked at the tip.
  scarab(C) {
    const { b } = C, x = C.hx + C.L / 2 - 0.25, y = C.y1;
    b.use('hull');
    chain(C, [[x, y - 0.1, 0], [x + 0.35, y + 0.1, 0], [x + 0.65, y + 0.45, 0], [x + 0.75, y + 0.85, 0]], 0.2, 0.06, C.trim, false);
    for (const s of [-1, 1]) sk(b, 'paint', C.trim).rod([x + 0.75, y + 0.85, 0], [x + 0.6, y + 1.05, s * 0.18], 0.06, 6, 0.025);
    lit(b, () => b.push().move(x + 0.5, y + 0.28, 0).ball(0.07, 0).pop());
  },
  // Split carapace (two wing cases) over the back.
  shell(C) {
    const { b } = C, x = C.hx - 0.15, y = C.y1 + 0.02;
    b.use('hull');
    for (const s of [-1, 1]) {
      b.push().move(x, y, s * C.W * 0.26).rotX(s * 0.18).scale(C.L * 0.5, 0.42, C.W * 0.32);
      sk(b, 'paint', C.paint).ball(1, 1, 0.75);
      b.pop();
      sk(b, 'paint', C.trim).push().move(x, y + 0.02, s * C.W * 0.02).box(C.L * 0.9, 0.06, 0.05).pop();
      lit(b, () => b.push().move(x - C.L * 0.1, y + 0.25, s * C.W * 0.32).rotX(s * 0.5).box(C.L * 0.5, 0.025, 0.02).pop());
    }
  },
  // Long flat sword blade off the nose.
  sword(C) {
    const { b } = C, x = C.hx + C.L / 2 - 0.1, y = C.y0 + C.Hh * 0.6;
    b.use('hull');
    sk(b, 'steel', STEEL).prism([[x, 0.16], [x + 0.7, 0.07], [x + 0.9, 0], [x + 0.7, -0.07], [x, -0.16]], y - 0.04, y + 0.04, 0.01);
    sk(b, 'dark', DARK); blk(b, x, y, 0, 0.2, 0.2, 0.46, 0.04);
    lit(b, () => b.push().move(x + 0.4, y + 0.045, 0).box(0.6, 0.01, 0.02).pop());
  },
  // Dorsal spine plates down the back.
  spine(C) {
    const { b } = C;
    b.use('hull');
    for (let i = 0; i < 5; i++) {
      const x = C.hx + C.L * (0.3 - i * 0.17), h = 0.28 + (i < 2 ? i : 4 - i) * 0.06;
      sk(b, 'paint', i % 2 ? C.trim : C.deep); side(b, [[x + 0.12, C.y1], [x - 0.12, C.y1], [x - 0.2, C.y1 + h]], -0.06, 0.06, 0.02);
      lit(b, () => b.push().move(x - 0.04, C.y1 + h * 0.5, 0).rotZ(0.6).box(h * 0.6, 0.02, 0.13).pop());
    }
  },
  // Three blades fanned behind the turret.
  blades(C) {
    const { b } = C, x = C.tx - C.tlen * 0.4, y = C.ttop - 0.05;
    b.use('turret');
    for (const a of [-0.55, 0, 0.55]) {
      b.push().move(x, y, 0).rotY(PI + a);
      sk(b, 'steel', STEEL).prism([[0.1, 0.05], [0.95, 0.03], [1.1, 0], [0.95, -0.03], [0.1, -0.05]], -0.02, 0.02, 0.005);
      sk(b, 'paint', C.trim); blk(b, 0.12, 0, 0, 0.08, 0.06, 0.2, 0.01);
      lit(b, () => b.push().move(0.6, 0.025, 0).box(0.7, 0.01, 0.015).pop());
      b.pop();
    }
  },
  // Gate ring standing behind the turret, facing forward, with gold gate blocks and a lit inner ring.
  gate(C) {
    const { b } = C, x = C.hx - C.L / 2 + 0.22, r = Math.max(0.42, C.tz * 1.05), y = C.y1 + r + 0.12;
    b.use('hull');
    b.push().move(x, y, 0).rotY(PI / 2);
    sk(b, 'paint', C.trim).geo(new THREE.TorusGeometry(r, 0.09, 6, 24));
    lit(b, () => b.geo(new THREE.TorusGeometry(r * 0.86, 0.025, 4, 28)));
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + PI / 8; sk(b, 'paint', C.paint).push().move(Math.cos(a) * r, Math.sin(a) * r, 0).rotZ(a).chamfer(0.22, 0.16, 0.26, 0.03).pop(); }
    b.pop();
    for (const s of [-1, 1]) sk(b, 'dark', GUN).rod([x + 0.25, C.y1, s * r * 0.6], [x, y - r * 0.5, s * r * 0.85], 0.06, 6);
  },
  // Mane of wedge plates round the turret base.
  mane(C) {
    const { b } = C, x = C.tx, y = C.ttop - 0.15;
    b.use('turret');
    for (let i = 0; i < 9; i++) {
      const a = PI + (i - 4) * 0.36;
      b.push().move(x, y, 0).rotY(a).move(C.tz + 0.15, 0, 0).rotZ(-0.4);
      sk(b, 'paint', i % 2 ? C.paint : C.deep).prism([[0.22, 0], [-0.12, 0.1], [-0.12, -0.1]], -0.05, 0.05, 0.015);
      b.pop();
    }
  },
  // Armoured moth wings: framed panels with lit eye spots, two per side, canted up.
  moth(C) {
    const { b } = C, x = C.hx - 0.05, y = C.y1 - 0.05;
    b.use('hull');
    for (const s of [-1, 1]) for (const [dx, len, a, d] of [[0.25, 0.32, 0.3, 0.55], [-0.4, 0.28, -0.45, 0.45]]) {
      b.push().move(x + dx, y, s * C.W * 0.4).rotY(s * a).rotX(s * -0.35).move(0, 0, s * len / 2);
      sk(b, 'paint', C.paint).chamfer(d, 0.08, len, 0.03);
      sk(b, 'paint', C.deep).push().move(0, 0.045, 0).chamfer(d * 0.8, 0.03, len * 0.85, 0.01).pop();
      sk(b, 'dark', GUN).push().move(d / 2, 0, 0).rotX(PI / 2).cyl(0.04, 0.04, len, 6).pop();
      lit(b, () => b.push().move(0, 0.065, s * len * 0.15).geo(new THREE.TorusGeometry(d * 0.24, 0.025, 4, 14).rotateX(PI / 2)).pop().push().move(0, 0.065, s * len * 0.15).cyl(d * 0.1, d * 0.1, 0.01, 8).pop());
      b.pop();
    }
  },
  // Spinning amulet ring round the turret.
  amulet(C) {
    const { b } = C, y = C.ttop - 0.1, r = C.tz + 0.32;
    b.use('amulet');
    sk(b, 'steel', STEEL).geo(new THREE.TorusGeometry(r, 0.035, 4, 32).rotateX(PI / 2));
    for (let k = 0; k < 4; k++) { const a = k * TAU / 4; b.push().rotY(a).move(r, 0, 0); sk(b, 'paint', C.trim).chamfer(0.1, 0.16, 0.16, 0.03); lit(b, () => b.push().move(0.055, 0, 0).box(0.01, 0.08, 0.08).pop()); b.pop(); }
    C.parts.push({ name: 'amulet', on: 'turret', kind: 'spin', axis: 'y', by: 'time', rate: 1.1, p: [rnd(C.tx), rnd(y), 0] });
  },
  // Lit pearl at the prow and whisker tubes.
  pearl(C) {
    const { b } = C, x = C.hx + C.L / 2 + 0.05, y = C.y1 - 0.02;
    b.use('hull');
    sk(b, 'dark', GUN).push().move(x - 0.05, y, 0).cyl(0.1, 0.14, 0.08, 8).pop();
    lit(b, () => b.push().move(x, y + 0.15, 0).ball(0.14, 1).pop());
    for (const s of [-1, 1]) sk(b, 'paint', C.trim).tube([[x - 0.1, y - 0.1, s * 0.22], [x + 0.3, y - 0.05, s * 0.5], [x + 0.2, y + 0.1, s * 0.85], [x - 0.3, y + 0.2, s * 1.0]], 0.035, 5, 10);
  },
  // Claw blades on the nose corners.
  claws(C) {
    const { b } = C, x = C.hx + C.L / 2 - 0.05, y = C.y0 + C.Hh * 0.4;
    b.use('hull');
    for (const s of [-1, 1]) {
      sk(b, 'dark', GUN); blk(b, x - 0.05, y, s * C.W * 0.42, 0.22, 0.16, 0.2, 0.03);
      for (let k = 0; k < 3; k++) { b.push().move(x, y, s * (C.W * 0.34 + k * 0.08)).rotY(-s * (0.15 + k * 0.12)); sk(b, 'steel', STEEL).prism([[0, 0.03], [0.34, 0.01], [0.38, -0.04], [0, -0.03]], -0.025, 0.025, 0.005); b.pop(); }
      lit(b, () => b.push().move(x + 0.06, y + 0.09, s * C.W * 0.42).box(0.08, 0.02, 0.12).pop());
    }
  },
  // Tesla coil stacks with lit tips.
  coils(C) {
    const { b } = C;
    b.use('hull');
    for (const [x, z] of [[C.hx - C.L * 0.15, C.W * 0.3], [C.hx - C.L * 0.15, -C.W * 0.3], [C.hx - C.L * 0.36, 0]]) {
      sk(b, 'dark', GUN).push().move(x, C.y1 + 0.2, z).cyl(0.06, 0.08, 0.4, 8).pop();
      sk(b, 'steel', STEEL); for (let i = 0; i < 4; i++) b.push().move(x, C.y1 + 0.08 + i * 0.09, z).cyl(0.13 - i * 0.015, 0.13 - i * 0.015, 0.03, 10).pop();
      lit(b, () => b.push().move(x, C.y1 + 0.45, z).ball(0.07, 1).pop());
    }
  },
  // Rhino horn off the nose, with a second smaller horn.
  rhino(C) {
    const { b } = C, x = C.hx + C.L / 2 - 0.1, y = C.y1 - 0.05;
    b.use('hull');
    sk(b, 'paint', C.trim).push().move(x + 0.3, y + 0.22, 0).rotZ(-0.85).cyl(0.03, 0.22, 0.85, 6).pop();
    sk(b, 'paint', C.deep).push().move(x - 0.12, y + 0.12, 0).rotZ(-0.5).cyl(0.02, 0.13, 0.4, 6).pop();
    sk(b, 'dark', DARK); blk(b, x, y - 0.02, 0, 0.36, 0.14, 0.42, 0.04);
    lit(b, () => b.push().move(x + 0.18, y + 0.06, 0).box(0.2, 0.02, 0.3).pop());
  },
  // Gauntlet fists on short arms at the front corners.
  fists(C) {
    const { b } = C, x = C.hx + C.L / 2 + 0.08, y = C.y0 + C.Hh * 0.6;
    b.use('hull');
    for (const s of [-1, 1]) {
      const z = s * (C.W / 2 + 0.22);
      sk(b, 'dark', GUN).rod([x - 0.6, y + 0.1, s * C.W * 0.4], [x - 0.15, y, z], 0.1, 8);
      plate(C, x + 0.05, y, z, 0.46, 0.4, 0.42, { col: C.trim, lip: C.deep, bolts: false });
      sk(b, 'steel', STEEL); for (let k = 0; k < 4; k++) b.push().move(x + 0.29, y + 0.08, z + (k - 1.5) * 0.095).chamfer(0.06, 0.1, 0.08, 0.02).pop();
      lit(b, () => b.push().move(x - 0.1, y + 0.21, z).box(0.2, 0.012, 0.3).pop());
    }
  },
  // Rib cage arcs over the back.
  ribs(C) {
    const { b } = C;
    b.use('hull');
    for (let i = 0; i < 4; i++) {
      const x = C.hx + C.L * (0.15 - i * 0.16), r = C.W * 0.55 - i * 0.03;
      sk(b, 'paint', C.trim).push().move(x, C.y1 - 0.05, 0).rotY(PI / 2).geo(new THREE.TorusGeometry(r, 0.06, 5, 14, PI)).pop();
      lit(b, () => b.push().move(x, C.y1 - 0.05 + r, 0).box(0.05, 0.02, 0.1).pop());
    }
  },
  // Folded crow wings: stacked feather blocks down each flank, growing toward the back.
  crow(C) {
    const { b } = C, x = C.hx + C.L * 0.2, y = C.y1 - 0.02;
    b.use('hull');
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const len = 0.5 + i * 0.14;
      b.push().move(x - i * 0.08, y + i * 0.035, s * (C.W / 2 - 0.05 + i * 0.03)).rotY(s * (0.12 + i * 0.06)).move(-len / 2, 0, 0);
      sk(b, 'paint', i % 2 ? C.deep : C.paint).prism([[len / 2, 0.06], [-len / 2 + 0.1, 0.1], [-len / 2, 0], [-len / 2 + 0.1, -0.1], [len / 2, -0.06]], 0, 0.07, 0.02);
      lit(b, () => b.push().move(-len * 0.1, 0.072, 0).box(len * 0.6, 0.01, 0.02).pop());
      b.pop();
    }
  },
  // Feather fan behind the turret.
  fan(C) {
    const { b } = C, x = C.tx - C.tlen * 0.45, y = C.ttop;
    b.use('turret');
    sk(b, 'dark', GUN).push().move(x, y, 0).rotZ(X).cyl(0.08, 0.08, 0.14, 8).pop();
    for (let i = 0; i < 7; i++) {
      const a = (i - 3) * 0.32;
      b.push().move(x, y, 0).rotY(PI + a).rotZ(0.45).move(0.45, 0, 0);
      sk(b, 'paint', i % 2 ? C.trim : C.paint).chamfer(0.75, 0.06, 0.18, 0.02);
      sk(b, 'dark', GUN).push().move(0, 0.035, 0).box(0.7, 0.02, 0.03).pop();
      lit(b, () => b.push().move(0.36, 0.035, 0).box(0.03, 0.02, 0.14).pop());
      b.pop();
    }
  },
  // Scholar's hat: flat board on the turret with two side paddles on rods.
  hat(C) {
    const { b } = C, x = C.tx - 0.05, y = C.ttop + 0.06;
    b.use('turret');
    sk(b, 'paint', C.deep); blk(b, x, y, 0, 0.5, 0.12, 0.5, 0.03);
    for (const s of [-1, 1]) {
      sk(b, 'dark', GUN).rod([x - 0.1, y, s * 0.22], [x - 0.12, y + 0.05, s * 0.85], 0.03, 6);
      plate(C, x - 0.12, y + 0.05, s * 0.92, 0.26, 0.05, 0.22, { col: C.trim, bolts: false });
    }
  },
  // Lotus petals ringing the hull, canted up.
  lotus(C) {
    const { b } = C, y = C.y1 - 0.06, r = C.W * 0.46;
    b.use('hull');
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + PI / 8;
      b.push().move(C.hx + Math.cos(a) * r, y, Math.sin(a) * r).rotY(-a).rotZ(0.5);
      sk(b, 'paint', i % 2 ? C.trim : C.paint).prism([[0, 0.14], [0.24, 0.16], [0.42, 0], [0.24, -0.16], [0, -0.14]], 0, 0.07, 0.02);
      lit(b, () => b.push().move(0.2, 0.075, 0).box(0.24, 0.01, 0.025).pop());
      b.pop();
    }
  },
  // Crescent moon crest on the turret.
  moon(C) {
    const { b } = C, x = C.tx - 0.05, y = C.ttop + 0.3;
    b.use('turret');
    b.push().move(x, y, 0).rotY(PI / 2);
    sk(b, 'paint', C.trim).geo(new THREE.TorusGeometry(0.28, 0.06, 5, 16, PI * 1.3).rotateZ(-PI * 0.15));
    b.pop();
    lit(b, () => b.push().move(x, y + 0.28, 0).ball(0.05, 0).pop());
    sk(b, 'dark', GUN).rod([x, C.ttop, 0], [x, y - 0.25, 0], 0.03, 5);
  },
  // Wave crests curling off each flank.
  waves(C) {
    const { b } = C;
    b.use('hull');
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x = C.hx + C.L * (0.25 - i * 0.28), z = s * (C.W / 2 + 0.02);
      b.push().move(x, C.y0 + C.Hh * 0.4, z).rotY(s > 0 ? 0 : PI).rotX(0.2);
      sk(b, 'paint', i % 2 ? C.trim : C.paint); side(b, [[0.25, 0], [-0.25, 0], [-0.3, 0.24], [-0.1, 0.4], [0.15, 0.38], [0.05, 0.26]], -0.04, 0.1, 0.03);
      lit(b, () => b.push().move(0.0, 0.47, 0.04).box(0.25, 0.025, 0.02).pop());
      b.pop();
    }
  },
  // Conch shell turret cap pointing back.
  conch(C) {
    const { b } = C, x = C.tx - 0.1, y = C.ttop - 0.05;
    b.use('turret');
    b.push().move(x, y, 0).rotZ(PI / 2 - 0.25);
    sk(b, 'paint', C.trim).lathe([[0.0, -0.2], [0.26, -0.1], [0.3, 0.1], [0.22, 0.35], [0.12, 0.6], [0.0, 0.8]], 9);
    lit(b, () => { for (const t of [0.05, 0.3, 0.5]) b.push().move(0, t, 0).cyl(0.3 - t * 0.3, 0.3 - t * 0.3, 0.02, 9).pop(); });
    b.pop();
  },
  // Horseshoe magnet over the deck, with lit poles.
  magnet(C) {
    const { b } = C, x = C.hx - 0.2, y = C.ttop + 0.05, r = 0.42;
    b.use('hull');
    b.push().move(x, y, 0).rotY(PI / 2);
    sk(b, 'paint', C.trim).geo(new THREE.TorusGeometry(r, 0.11, 6, 16, PI));
    b.pop();
    for (const s of [-1, 1]) {
      sk(b, 'paint', C.paint).push().move(x, y - 0.12, s * r).cyl(0.12, 0.12, 0.24, 8).pop();
      lit(b, () => b.push().move(x, y - 0.25, s * r).cyl(0.122, 0.122, 0.05, 8).pop());
      sk(b, 'dark', GUN).rod([x, C.y1, s * r], [x, y - 0.25, s * r], 0.05, 6);
    }
  },
  // Nine tails fanned behind (one sway pivot).
  tails(C) {
    const { b } = C, x = C.hx - C.L / 2 + 0.15, y = C.y1 - 0.05;
    b.use('tail');
    for (let i = 0; i < 9; i++) {
      const a = PI + (i - 4) * 0.2, c = Math.cos(a), s = Math.sin(a), len = 0.78 - Math.abs(i - 4) * 0.04;
      chain(C, [[x, y, s * 0.1], [x + c * len * 0.4, y + 0.25, s * len * 0.4], [x + c * len * 0.8, y + 0.45, s * len * 0.85], [x + c * len, y + 0.75, s * len * 1.05]], 0.1, 0.05, i % 2 ? C.trim : C.paint);
    }
    C.parts.push({ name: 'tail', on: 'hull', kind: 'sway', p: [rnd(x), rnd(y), 0], model: true, amp: 0.1 });
  },
  // Ring of six floating swords round the body, turning slowly.
  swords(C) {
    const { b } = C, y = C.ttop + 0.1, r = 0.72;
    b.use('swords');
    for (let k = 0; k < 6; k++) {
      b.push().rotY(k * TAU / 6).move(r, 0, 0).rotY(PI / 2);
      sk(b, 'steel', STEEL).prism([[0.0, 0.06], [0.42, 0.045], [0.52, 0], [0.42, -0.045], [0.0, -0.06]], -0.025, 0.025, 0.005);
      sk(b, 'paint', C.trim); blk(b, -0.02, 0, 0, 0.06, 0.06, 0.26, 0.01);
      sk(b, 'dark', GUN).push().move(-0.14, 0, 0).rotZ(X).cyl(0.03, 0.03, 0.2, 6).pop();
      lit(b, () => b.push().move(0.35, 0.03, 0).box(0.5, 0.008, 0.015).pop());
      b.pop();
    }
    C.parts.push({ name: 'swords', on: 'hull', kind: 'spin', axis: 'y', by: 'time', rate: 0.8, p: [rnd(C.hx), rnd(y), 0] });
  },
  // Big jellyfish bell over the hull with a lit cross and hanging tentacles.
  bell(C) {
    const { b } = C, r = C.W * 0.62, y = C.y0 + 0.1;
    b.use('hull');
    b.push().move(C.hx, y, 0);
    sk(b, 'paint', C.paint).lathe([[r, 0], [r * 1.02, 0.12], [r * 0.95, 0.38], [r * 0.75, 0.7], [r * 0.4, 0.92], [0, 0.98]], 14);
    sk(b, 'paint', C.deep).lathe([[r * 0.92, -0.02], [r * 1.04, 0.02], [r * 1.04, 0.1], [r * 0.95, 0.1]], 14);
    lit(b, () => { b.push().move(0, 0.2, 0).cyl(r * 1.01, r * 1.01, 0.025, 14).pop(); });
    sk(b, 'paint', C.trim).push().move(r * 0.55, 0.78, 0).rotZ(-0.9).box(0.04, 0.32, 0.1).pop().push().move(r * 0.55, 0.78, 0).rotZ(-0.9).box(0.04, 0.1, 0.32).pop();
    b.pop();
    for (let k = 0; k < 5; k++) { const z = (k - 2) * r * 0.36, x = C.hx - r * 0.55 * Math.cos(z / r), sw = (k - 2) * 0.12; chain(C, [[x, y + 0.05, z], [x - 0.2, y - 0.05, z * 1.05 + sw], [x - 0.4, y + 0.02, z * 1.08 - sw], [x - 0.6, y - 0.05, z * 1.1 + sw], [x - 0.75, y + 0.02, z * 1.1]], 0.07, 0.035, C.trim); }
    C.y1 = y + 0.98;
  },
  // Gorilla arms planted on knuckles ahead of the hull.
  arms(C) {
    const { b } = C, sx = C.hx + C.L * 0.22, sy = C.y1 + 0.1;
    b.use('hull');
    for (const s of [-1, 1]) {
      const sz = s * (C.W / 2 + 0.1), ex = sx + 0.25, ey = sy - 0.15, ez = s * (C.W / 2 + 0.5), fx = sx + 0.7, fy = 0.24, fz = s * (C.W / 2 + 0.42);
      sk(b, 'dark', GUN).push().move(sx, sy, sz).ball(0.2, 0).pop();
      sk(b, 'paint', C.paint).rod([sx, sy, sz], [ex, ey, ez], 0.2, 8, 0.17);
      sk(b, 'dark', GUN).push().move(ex, ey, ez).ball(0.15, 0).pop();
      sk(b, 'paint', C.deep).rod([ex, ey, ez], [fx, fy + 0.15, fz], 0.18, 8, 0.24);
      plate(C, fx + 0.05, fy, fz, 0.44, 0.36, 0.42, { col: C.trim, lip: C.deep, bolts: false });
      sk(b, 'steel', STEEL); for (let k = 0; k < 4; k++) b.push().move(fx + 0.28, fy - 0.08, fz + (k - 1.5) * 0.095).chamfer(0.08, 0.12, 0.08, 0.02).pop();
      lit(b, () => b.push().move((ex + fx) / 2, (ey + fy) / 2 + 0.22, (ez + fz) / 2).box(0.25, 0.02, 0.05).pop());
    }
  },
  // Heavy brow ridge across the turret front.
  brow(C) {
    const { b } = C;
    b.use('turret');
    sk(b, 'paint', C.deep); blk(b, C.tx + C.tlen * 0.38, C.ttop - 0.02, 0, 0.22, 0.12, C.tz * 2.1, 0.04);
    lit(b, () => { for (const s of [-1, 1]) b.push().move(C.tx + C.tlen * 0.45, C.ttop - 0.1, s * C.tz * 0.45).box(0.04, 0.04, 0.14).pop(); });
  },
  // Two long rear prongs (centipede forcipules).
  prongs(C) {
    const { b } = C;
    b.use(C.F.hull === 'segmented' ? 'seg' : 'hull');
    for (const s of [-1, 1]) chain(C, [[C.rx + 0.1, C.y0 + C.Hh * 0.6, s * 0.15], [C.rx - 0.35, C.y0 + C.Hh * 0.7, s * 0.4], [C.rx - 0.8, C.y0 + C.Hh * 0.6, s * 0.48], [C.rx - 1.1, C.y0 + C.Hh * 0.4, s * 0.3]], 0.09, 0.03, C.trim);
  },
  // Two swords crossed over the back.
  cross(C) {
    const { b } = C, x = C.hx - C.L * 0.1, y = C.y1 + 0.12;
    b.use('hull');
    for (const s of [-1, 1]) {
      b.push().move(x, y + (s > 0 ? 0.04 : 0), 0).rotY(s * 0.7);
      sk(b, 'steel', STEEL).prism([[-0.7, 0.05], [0.85, 0.04], [0.98, 0], [0.85, -0.04], [-0.7, -0.05]], -0.02, 0.02, 0.005);
      sk(b, 'paint', C.trim); blk(b, -0.72, 0, 0, 0.06, 0.06, 0.28, 0.01);
      sk(b, 'dark', GUN).push().move(-0.9, 0, 0).rotZ(X).cyl(0.03, 0.03, 0.3, 6).pop();
      b.pop();
    }
  },
  // Grapple launchers on the turret flanks.
  grapples(C) {
    const { b } = C, y = C.gy;
    b.use('turret');
    for (const s of [-1, 1]) {
      const z = s * (C.tz + 0.18);
      sk(b, 'dark', GUN); blk(b, C.tx, y, z, 0.6, 0.2, 0.2, 0.03);
      sk(b, 'paint', C.trim); blk(b, C.tx, y + 0.11, z, 0.5, 0.02, 0.16, 0.01);
      for (let k = 0; k < 3; k++) { const a = k * TAU / 3; sk(b, 'steel', STEEL).push().move(C.tx + 0.36, y + Math.cos(a) * 0.07, z + Math.sin(a) * 0.07).rotZ(X - 0.3).cyl(0.0, 0.03, 0.2, 4).pop(); }
      lit(b, () => b.push().move(C.tx + 0.31, y, z).rotZ(X).cyl(0.05, 0.05, 0.02, 8).pop());
    }
  },
  // Crown of spikes on the turret roof.
  crown(C) {
    const { b } = C, y = C.ttop;
    b.use('turret');
    sk(b, 'paint', C.trim).push().move(C.tx - 0.05, y + 0.04, 0).cyl(0.3, 0.32, 0.08, 10).pop();
    for (let k = 0; k < 5; k++) { const a = PI / 2 + (k - 2) * 0.55; sk(b, 'paint', C.trim).push().move(C.tx - 0.05 + Math.sin(a) * 0.26, y + 0.2 + (k === 2 ? 0.08 : 0), Math.cos(a) * 0.26).cyl(0, 0.07, 0.3 + (k === 2 ? 0.16 : 0), 4).pop(); }
    lit(b, () => b.push().move(C.tx + 0.22, y + 0.06, 0).box(0.03, 0.04, 0.12).pop());
  },
  // Cape of armour plates trailing off the back (sway).
  cape(C) {
    const { b } = C, x = C.hx - C.L / 2 + 0.05, y = C.y1 + 0.05;
    b.use('cape');
    for (let i = 0; i < 3; i++) for (const z of [-1, 0, 1]) plate(C, x - 0.2 - i * 0.32, y - i * 0.16, z * C.W * 0.3, 0.34, 0.06, C.W * 0.3, { col: (i + z) % 2 ? C.deep : C.trim, bolts: false, rz: 0.45 });
    C.parts.push({ name: 'cape', on: 'hull', kind: 'sway', p: [rnd(x), rnd(y), 0], model: true, amp: 0.08 });
  },
  // Mantis scythe arms folded ahead of the body.
  scythes(C) {
    const { b } = C, sx = C.hx + C.L * 0.3, sy = C.y1 + 0.05;
    b.use('hull');
    for (const s of [-1, 1]) {
      const z = s * C.W * 0.38, ex = sx + 0.55, ey = sy + 0.5, fx = sx + 1.05, fy = sy - 0.1;
      sk(b, 'dark', GUN).push().move(sx, sy, z).ball(0.12, 0).pop();
      sk(b, 'paint', C.paint).rod([sx, sy, z], [ex, ey, z * 1.25], 0.1, 7, 0.08);
      sk(b, 'dark', GUN).push().move(ex, ey, z * 1.25).ball(0.1, 0).pop();
      b.push().move(ex, ey, z * 1.25);
      sk(b, 'paint', C.trim); limb(b, [0, 0], [fx - ex, fy - ey], 0.12, 0.08, 0.02);
      sk(b, 'steel', STEEL); side(b, [[0.05, -0.05], [fx - ex + 0.2, fy - ey - 0.05], [fx - ex - 0.05, fy - ey - 0.22]], -0.02, 0.02, 0.005);
      sk(b, 'steel', STEEL); for (let k = 0; k < 3; k++) b.push().move((fx - ex) * (0.3 + k * 0.2), (fy - ey) * (0.3 + k * 0.2) - 0.06, 0).rotZ(PI).cyl(0, 0.03, 0.12, 4).pop();
      lit(b, () => b.push().move((fx - ex) * 0.5, (fy - ey) * 0.5 + 0.07, 0).rotZ(Math.atan2(fy - ey, fx - ex)).box(0.4, 0.015, 0.09).pop());
      b.pop();
    }
  },
  // Overlapping scale plates down the flanks.
  scales(C) {
    for (const s of [-1, 1]) for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
      const x = C.hx + C.L * (0.28 - i * 0.18) - r * 0.09;
      plate(C, x, C.y1 - 0.04 - r * 0.12, s * (C.W / 2 + 0.03 + r * 0.06), 0.24, 0.06, 0.22, { col: (i + r) % 2 ? C.trim : C.paint, bolts: false, rx: s * 0.7, rz: 0.15 });
    }
  },
  // Lit five-petal flower on the turret.
  flower(C) {
    const { b } = C, x = C.tx - 0.1, y = C.ttop + 0.02;
    b.use('turret');
    for (let k = 0; k < 5; k++) { const a = k * TAU / 5; sk(b, 'paint', C.trim).push().move(x + Math.cos(a) * 0.13, y, Math.sin(a) * 0.13).cyl(0.09, 0.1, 0.04, 8).pop(); }
    lit(b, () => b.push().move(x, y + 0.02, 0).cyl(0.07, 0.07, 0.04, 8).pop());
  },
  // Sabre racked along the right flank.
  saber(C) {
    const { b } = C, z = C.W / 2 + 0.16, y = C.y1 - 0.05, x0 = C.hx - C.L * 0.45;
    b.use('hull');
    sk(b, 'steel', STEEL).prism([[x0, z - 0.05], [x0 + C.L + 0.2, z - 0.03], [x0 + C.L + 0.45, z + 0.06], [x0 + C.L + 0.2, z + 0.05], [x0, z + 0.05]], y - 0.02, y + 0.02, 0.005);
    sk(b, 'paint', C.trim); blk(b, x0, y, z, 0.06, 0.06, 0.3, 0.01);
    sk(b, 'dark', GUN).push().move(x0 - 0.15, y, z).rotZ(X).cyl(0.035, 0.035, 0.26, 6).pop();
    for (const f of [0.2, 0.6]) { sk(b, 'dark', DARK); blk(b, x0 + C.L * f, y - 0.06, z - 0.05, 0.08, 0.12, 0.14, 0.02); }
  },
  // Ribbons: two tubes trailing off the turret.
  ribbons(C) {
    const { b } = C, x = C.tx - C.tlen * 0.4, y = C.ttop - 0.05;
    b.use('turret');
    for (const s of [-1, 1]) { sk(b, 'paint', C.trim).tube([[x, y, s * 0.1], [x - 0.35, y - 0.05, s * 0.3], [x - 0.7, y - 0.25, s * 0.35], [x - 1.0, y - 0.35, s * 0.55]], 0.045, 5, 10); lit(b, () => b.push().move(x - 1.0, y - 0.35, s * 0.55).ball(0.06, 0).pop()); }
  },
  // Bronze-drum pattern on the deck: lit concentric rings and a star.
  drum(C) {
    const { b } = C, y = C.y1 + 0.05, x = C.hx - C.L * 0.15;
    b.use('hull');
    lit(b, () => {
      for (const r of [0.32, 0.5]) b.push().move(x, y, 0).geo(new THREE.TorusGeometry(r, 0.015, 3, 24).rotateX(PI / 2)).pop();
      for (let k = 0; k < 8; k++) b.push().move(x, y, 0).rotY(k * TAU / 8).move(0.14, 0, 0).box(0.2, 0.012, 0.03).pop();
    });
  },
  // Golden turtle claw on the bow stock.
  talon(C) {
    const { b } = C, x = C.gx - 0.1, y = C.gy - 0.12;
    b.use('turret');
    for (let k = 0; k < 3; k++) { sk(b, 'paint', C.trim).push().move(x - 0.05, y, (k - 1) * 0.08).rotZ(PI * 0.75).cyl(0, 0.04, 0.22, 4).pop(); }
    sk(b, 'paint', C.trim); blk(b, x - 0.15, y + 0.04, 0, 0.18, 0.1, 0.26, 0.03);
  },
  // Open pouch on the chest.
  pouch(C) {
    const { b } = C, x = C.hx + C.L / 2 + 0.08, y = C.y0 + C.Hh * 0.45;
    b.use('hull');
    plate(C, x, y, 0, 0.26, C.Hh * 0.7, C.W * 0.75, { col: C.trim, lip: C.deep });
    b.push().move(x + 0.18, y + C.Hh * 0.35, 0).rotZ(-0.7); sk(b, 'paint', C.deep).chamfer(0.04, 0.3, C.W * 0.7, 0.01); b.pop();
    lit(b, () => b.push().move(x + 0.14, y, 0).box(0.012, C.Hh * 0.4, C.W * 0.55).pop());
  },
  // Big ears on the turret, canted out.
  bigears(C) {
    const { b } = C, x = C.tx - 0.05, y = C.ttop - 0.04;
    b.use('turret');
    for (const s of [-1, 1]) {
      b.push().move(x, y, s * C.tz * 0.5).rotX(s * 0.25).move(0, 0.32, 0).scale(1, 1, 0.3);
      sk(b, 'paint', C.paint).ball(0.32, 1, 1.3);
      b.pop();
      b.push().move(x + 0.06, y, s * C.tz * 0.5).rotX(s * 0.25).move(0, 0.32, 0).scale(1, 1, 0.3);
      sk(b, 'paint', C.trim).ball(0.24, 1, 1.25);
      b.pop();
    }
  },
  // Clock-face wing plates over the back, canted out and up.
  clocks(C) {
    const { b } = C, x = C.hx - C.L * 0.1, y = C.y1 + 0.1;
    b.use('hull');
    for (const s of [-1, 1]) for (const [dx, r, a] of [[0.15, 0.42, 0.25], [-0.45, 0.34, 0.95]]) {
      b.push().move(x + dx, y, s * C.W * 0.3).rotY(-s * a).move(0, 0, s * r * 1.1).rotX(s * 0.5);
      sk(b, 'paint', C.paint).cyl(r, r, 0.08, 14);
      sk(b, 'paint', C.trim).push().move(0, 0.045, 0).geo(new THREE.TorusGeometry(r * 0.92, 0.03, 4, 18).rotateX(PI / 2)).pop();
      lit(b, () => { for (let k = 0; k < 12; k++) b.push().rotY(k * TAU / 12).move(r * 0.75, 0.05, 0).box(0.06, 0.01, 0.02).pop(); b.push().move(0, 0.05, 0).rotY(0.6).move(r * 0.25, 0, 0).box(r * 0.5, 0.012, 0.025).pop(); });
      sk(b, 'dark', GUN).push().move(0, 0.05, 0).cyl(0.04, 0.04, 0.03, 6).pop();
      b.pop();
    }
  },
  // Collar frill of short lace plates round the turret.
  lace(C) {
    const { b } = C, y = C.ttop - 0.15;
    b.use('turret');
    for (let i = 0; i < 10; i++) { const a = i * TAU / 10; b.push().move(C.tx, y, 0).rotY(a).move(C.tz + 0.1, 0, 0).rotZ(-0.6); sk(b, 'paint', i % 2 ? C.trim : C.deep).chamfer(0.2, 0.05, 0.16, 0.015); b.pop(); }
  },
  // Monkey ears: thick disc ear plates on the turret sides.
  monkey(C) {
    const { b } = C, x = C.tx - 0.05, y = C.ttop - 0.12;
    b.use('turret');
    for (const s of [-1, 1]) {
      b.push().move(x, y, s * (C.tz + 0.1)).rotX(s * 1.2);
      sk(b, 'paint', C.paint).cyl(0.22, 0.22, 0.08, 12);
      sk(b, 'paint', C.trim).push().move(0, 0.045, 0).cyl(0.15, 0.15, 0.02, 12).pop();
      b.pop();
    }
    lit(b, () => b.push().move(C.tx + C.tlen * 0.45, C.ttop - 0.1, 0).rotX(PI / 2).geo(new THREE.TorusGeometry(0.15, 0.02, 3, 12, PI).rotateZ(PI)).pop());
  },
  // Firecracker pods on the hull flanks.
  crackers(C) {
    const { b } = C;
    b.use('hull');
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
      const x = C.hx - C.L * 0.3 + k * 0.17, z = s * (C.W / 2 + 0.12);
      sk(b, 'paint', k % 2 ? C.trim : C.deep).push().move(x, C.y1 + 0.02, z).rotZ(0.3).cyl(0.07, 0.07, 0.5, 8).pop();
      lit(b, () => b.push().move(x + 0.07, C.y1 + 0.26, z).ball(0.03, 0).pop());
    }
    for (const s of [-1, 1]) { sk(b, 'dark', GUN); blk(b, C.hx - C.L * 0.05, C.y1 - 0.1, s * (C.W / 2 + 0.12), C.L * 0.5, 0.12, 0.18, 0.02); }
  },
  // Kangaroo tail planted on the ground as a third support.
  roo(C) {
    const { b } = C, x = C.hx - C.L / 2;
    b.use('hull');
    chain(C, [[x + 0.2, C.y0 + C.Hh * 0.5, 0], [x - 0.1, C.y0 + 0.02, 0], [x - 0.32, 0.16, 0]], 0.2, 0.12, C.paint, false);
    sk(b, 'steel', STEEL); for (let k = 0; k < 4; k++) b.push().move(x + 0.05 - k * 0.06, C.y0 + C.Hh * 0.35 - k * 0.09, 0).rotZ(0.9).geo(new THREE.TorusGeometry(0.19, 0.025, 4, 12).rotateX(PI / 2)).pop();
    sk(b, 'dark', GUN); blk(b, x - 0.36, 0.08, 0, 0.3, 0.12, 0.36, 0.03);
    lit(b, () => b.push().move(x - 0.36, 0.15, 0).box(0.2, 0.02, 0.26).pop());
  },
};

// Pieces that reshape the body, drawn before the turret sits on it.
const PRE = new Set(['bell']);

// ---------- the frame ----------
function frameCtx(b, F, paint, trim, deep) {
  const move = F.move || 'tracks';
  const L = F.hullL || 2.4, W = F.hullW || 1.2, Hh = F.hullH || 0.5;
  const ride = move === 'tracks' ? 0.3 : move.startsWith('wheels') ? (F.wheelR || 0.32) * 0.95 + 0.06 : move === 'legs2' ? 1.0 : move === 'hover' ? 0.55 : 0.68;
  const y0 = F.ride ?? ride;
  return { b, F, paint, trim, deep, move, L, W, Hh, y0, y1: y0 + Hh, hx: 0, legs: [], parts: [], batch: 'hull' };
}
function build(b, F, paint, trim, deep) {
  const C = frameCtx(b, F, paint, trim, deep), { move, L, W, Hh, y0 } = C;
  b.use('hull');
  if (F.hull === 'segmented') {
    // Head segment carries the turret; the rest trail on one sway pivot so the body snakes as it runs.
    const n = F.segs || 3, hl = L * 0.42, hx = L / 2 - hl / 2;
    C.hx = hx; C.L = hl;
    hullBody(C, shift(outline('hex', hl, W, 0.5), hx), y0, C.y1, hx);
    const jx = hx - hl / 2 + 0.05;
    b.use('seg');
    let x = jx, w = W, ln = (L - hl) / (n - 1);
    for (let k = 1; k < n; k++) {
      w *= 0.86; const cx = x - ln / 2, hh = Hh * (1 - k * 0.1);
      sk(b, 'dark', GUN).push().move(x + 0.02, y0 + hh * 0.5, 0).cyl(w * 0.25, w * 0.25, hh * 0.8, 8).pop();
      C.batch = 'seg';
      hullBody(C, shift(outline('hex', ln * 1.05, w, 0.5), cx), y0 + 0.02, y0 + 0.02 + hh, cx, false);
      for (const s of [-1, 1]) plate(C, cx, y0 + hh * 0.9, s * w * 0.32, ln * 0.6, 0.08, w * 0.26, { col: k % 2 ? trim : deep, bolts: false, rx: s * -0.25 });
      if (move === 'tracks' || move.startsWith('wheels')) for (const s of [-1, 1]) { sk(b, 'rubber', RUB).push().move(cx, 0.2, s * (w / 2 + 0.05)).chamfer(ln * 0.75, 0.36, 0.2, 0.06).pop(); sk(b, 'steel', STEEL).push().move(cx, 0.2, s * (w / 2 + 0.16)).rotX(X).cyl(0.12, 0.12, 0.03, 8).pop(); }
      else if (move !== 'hover') for (const s of [-1, 1]) { sk(b, 'dark', DARK).rod([cx, y0 + 0.05, s * w * 0.4], [cx + 0.1, y0 * 0.6, s * (w / 2 + 0.45)], 0.04, 5); sk(b, 'steel', STEEL).rod([cx + 0.1, y0 * 0.6, s * (w / 2 + 0.45)], [cx + 0.2, 0.02, s * (w / 2 + 0.55)], 0.035, 5, 0.01); }
      else { sk(b, 'dark', GUN).push().move(cx, y0 - 0.02, 0).cyl(w * 0.3, w * 0.36, 0.1, 10).pop(); flame(b, () => b.push().move(cx, y0 - 0.22, 0).cyl(w * 0.3, w * 0.05, 0.28, 8).pop()); }
      x -= ln;
    }
    C.rx = x; C.batch = 'hull';
    C.parts.push({ name: 'seg', on: 'hull', kind: 'sway', p: [rnd(jx), rnd(y0 + Hh / 2), 0], model: true, amp: 0.14 });
    b.use('hull');
    if (move === 'tracks') tracks(C, hl * 0.95, F.trackW || 0.3, hx);
    else moveGear(C);
  } else {
    C.O = outline(F.hull || 'block', L, W, F.nose ?? 0.55);
    hullBody(C, C.O, y0, C.y1);
    C.rx = -L / 2;
    moveGear(C);
  }
  const sigs = [].concat(F.sig || []).map((n) => (Array.isArray(n) ? n : [n]));
  const run = (pre) => { for (const [k, opt] of sigs) if (PRE.has(k) === pre) { C.batch = 'hull'; b.use('hull'); SIGS[k](C, opt || {}); } };
  run(true);
  turret(C);
  const g = gun(C);
  run(false);
  b.use('hull');
  return { muzzle: rnd(g.mx), muzzleY: rnd(g.my), S: F.S || 1, height: Math.max(C.ttop, C.y1) + 0.4,
    legs: C.legs.length ? C.legs : undefined, stride: F.stride || (move === 'legs2' ? 2.0 : 1.7), hover: move === 'hover' || undefined, parts: C.parts };
}
