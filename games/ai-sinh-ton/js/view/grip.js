// How each Blockade Z hero holds its weapon: the grip table (final scale, grip points, carry poses) and the arm solver that
// puts the hands on those points every frame after BZ.animHero.
// Two ways of holding. 'hand' types (blades, poles, thrown, fists, claws) keep the weapon on the right hand and let animHero
// swing it; only the weapon's offset is set so its grip point sits in the palm, and a pole's off hand is solved onto the
// shaft. 'gun' types (rifles, launcher, pistols, wrist bow) hang the weapon off the spine and solve both arms onto it,
// so the stock, barrel and both hands stay together whatever the torso does.
const THREE = window.THREE;
const BZ = window.BZ;

// the weapon's own axes: guns point down -z with the top at +y, blades and poles up +y
const GUN = { fwd: [0, 0, -1], up: [0, 1, 0] };
const BLADE = { fwd: [0, 1, 0], up: [0, 0, 1] };

// A carry pose is given in spine space (x to the right arm, y up, z forward). Rifle-like types give `lh`, where the off
// hand sits; the main hand follows from the weapon's own grip spacing. `yaw` and `pitch` aim the barrel in the room frame and
// `twist` is how far the shoulders turn into the shot (the right one goes back): the barrel's yaw in spine space is
// yaw - twist, so the weapon keeps pointing at the target while the chest turns. Pistols give `m`, the grip point, and
// poles give `rh` and `lh`, both hand positions: the shaft runs through them and slides through the hands on a thrust.
// The fight camera sits 38 m away (a hero is 0.107 of the frame): the small weapons (pistols, stars, fists, wrist bow) are
// drawn larger than Blockade Z drew them so each still spans >= 18 CSS px at s22 (tools/grip-shots.mjs).
export const GRIP = {
  // two hands on the hilt (main near the guard, off hand at the pommel); the sword hangs off the spine and both arms are solved onto it.
  // Poses are the off hand's position `lh` and the blade direction `d` in spine space; a cut runs wind-up -> cross -> low finish -> guard.
  // katana: the blade is 22% longer than Blockade Z's (tools/port-bz.mjs, tip 1.1 -> 1.294) so it reads at the far camera; the hilt
  // and both hand points are unchanged
  katana: { scale: 1.9, type: 'sword2', ...BLADE, main: [0, 0.07, 0], support: [0, -0.12, 0], stock: null, muzzle: [0, 1.294, 0],
    poses: { guard: { lh: [0.0, 0.3, 0.22], d: [0.34, 0.6, 0.72], u: [0, 1, 0] }, wind: { lh: [0.02, 0.8, 0.34], d: [0.45, 0.8, -0.4], u: [-0.6, 0.3, 0.7] },
      cross: { lh: [-0.02, 0.5, 0.15], d: [0.3, 0.1, 0.95], u: [0, 1, 0] }, end: { lh: [0.15, 0.43, 0.1], d: [-0.35, -0.1, 0.93], u: [0.3, 1, 0] } } },
  longsword: { scale: 1.5, type: 'one', ...BLADE, main: [0, -0.1, 0], support: null, stock: null, shield: 1.3, tilt: 2.65, carry: [0.6, 0.12, 0.8] },
  hatchet: { scale: 1.8, type: 'one', ...BLADE, main: [0, 0.02, 0], support: null, stock: null, muzzle: [0, 0.7, -0.27], carry: [0.55, 0.2, 0.8] },
  spear: { scale: 1.4, type: 'pole', ...BLADE, main: [0, -0.25, 0], support: null, stock: null,
    rest: { rh: [0.28, 0.42, 0.1], lh: [-0.02, 0.58, 0.42], twist: 0.2 }, aim: { rh: [0.28, 0.46, 0.1], lh: [-0.02, 0.58, 0.42], twist: 0.2 } },
  glaive: { scale: 1.4, type: 'pole', ...BLADE, main: [0, -0.25, 0], support: null, stock: null,
    rest: { rh: [0.28, 0.42, 0.1], lh: [-0.02, 0.58, 0.42], twist: 0.2 }, aim: { rh: [0.28, 0.5, 0.1], lh: [-0.02, 0.58, 0.42], twist: 0.2 } },
  javelin: { scale: 1.4, type: 'thrown', ...GUN, main: [0, 0, 0.1], support: null, stock: null, carry: [0.5, 0.2, 0.84] },
  shuriken: { scale: 3.6, type: 'thrown', ...GUN, main: [0, 0.02, -0.105], support: null, stock: null },
  fists: { scale: 3.0, type: 'fists', ...GUN, main: [0, 0, -0.07], support: null, stock: null, both: true },
  claws: { scale: 2.0, type: 'fists', ...GUN, main: [0, 0, -0.07], support: null, stock: null, both: true },
  dualpistol: { scale: 2.3, type: 'dual', ...GUN, main: [0, -0.09, 0], support: null, stock: null,
    rest: { m: [0.28, 0.5, 0.36], yaw: 0.1, pitch: 0, twist: 0 }, aim: { m: [0.26, 0.62, 0.42], yaw: 0.04, pitch: 0.02, twist: 0 } },
  shotgun: { scale: 1.5, type: 'two', ...GUN, main: [0, -0.06, 0.02], support: [0, -0.05, -0.2], stock: [0, 0.02, 0.38], muzzle: [0, 0.075, -0.94],
    rest: { lh: [-0.05, 0.52, 0.38], yaw: 0, pitch: 0, twist: 0.5 }, aim: { lh: [-0.05, 0.55, 0.4], yaw: 0, pitch: 0.04, twist: 0.6 } },
  minigun: { scale: 1.5, type: 'two', ...GUN, main: [0, -0.2, 0.08], support: [0, -0.2, -0.1], stock: null, muzzle: [0, 0, -1],
    rest: { lh: [-0.05, 0.45, 0.4], yaw: 0, pitch: 0, twist: 0.5 }, aim: { lh: [-0.05, 0.45, 0.42], yaw: 0, pitch: 0.04, twist: 0.5 } },
  bazooka: { scale: 1.5, type: 'shoulder', ...GUN, main: [0, -0.1, 0.02], support: [0, -0.1, -0.22], stock: [0, 0.05, 0.3], muzzle: [0, 0.05, -1.13],
    rest: { lh: [-0.02, 0.55, 0.4], yaw: 0, pitch: 0.1, twist: 0.7 }, aim: { lh: [-0.02, 0.55, 0.42], yaw: 0, pitch: 0.1, twist: 0.7 } },
  webbow: { scale: 2.2, type: 'wrist', ...GUN, main: [0, -0.04, 0.05], support: [0, -0.04, -0.09], stock: null, muzzle: [0, 0.128, -0.565],
    rest: { lh: [0, 0.52, 0.4], yaw: 0, pitch: 0.05, twist: 0.5 }, aim: { lh: [0, 0.55, 0.4], yaw: 0, pitch: 0.04, twist: 0.5 } },
};

// the arm bones: upper arm to the elbow, elbow to the wrist; the hand sits 0.05 off the forearm axis (heroes.js arm())
const L1 = 0.32;
const L2 = Math.hypot(0.3, 0.05);
const REACH = 0.985;

const A = new THREE.Vector3(); const B = new THREE.Vector3(); const C = new THREE.Vector3(); const D = new THREE.Vector3();
const E = new THREE.Vector3(); const EY = new THREE.Vector3(); const EZ = new THREE.Vector3(); const EX = new THREE.Vector3(); const F = new THREE.Vector3();
const Q1 = new THREE.Quaternion(); const Q2 = new THREE.Quaternion(); const Q3 = new THREE.Quaternion(); const M4 = new THREE.Matrix4();

const BR = new THREE.Vector3(); const BU = new THREE.Vector3();
function basisQ(f, u, out) {
  BR.crossVectors(f, u).normalize(); BU.crossVectors(BR, f).normalize();
  return out.setFromRotationMatrix(M4.makeBasis(f, BU, BR));
}

// two-bone solve in spine space: the arm group points the upper arm at the elbow, the elbow joint bends the forearm to the target
const TT = new THREE.Vector3(); const AT = new THREE.Vector3();
function solveArm(arm, elbow, hand, side, goal, info) {
  const target = TT.copy(goal);
  for (let pass = 0; pass < 3; pass++) {
    const v = A.copy(target).sub(arm.position); const d = v.length(); if (pass === 0) info.reach = d;
    const dist = Math.max(0.14, Math.min(d, (L1 + L2) * REACH)); v.multiplyScalar(1 / Math.max(d, 1e-6));
    const x = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist); const h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
    const p = B.set(side * 0.55, -1, 0.15); p.addScaledVector(v, -p.dot(v)).normalize();
    E.copy(v).multiplyScalar(x).addScaledVector(p, h);
    EY.copy(E).normalize().negate();
    F.copy(v).multiplyScalar(dist).sub(E).normalize();
    EZ.copy(F).addScaledVector(EY, -F.dot(EY)).normalize();
    EX.crossVectors(EY, EZ);
    arm.quaternion.setFromRotationMatrix(M4.makeBasis(EX, EY, EZ));
    elbow.rotation.x = Math.atan2(-F.dot(EZ), -F.dot(EY));
    // the hand is not on the forearm axis: measure where it really is and shift the aim by the miss
    arm.updateMatrix(); elbow.updateMatrix();
    const at = AT.copy(hand.position).applyMatrix4(elbow.matrix).applyMatrix4(arm.matrix);
    info.miss = goal.distanceTo(at);
    if (info.miss < 0.004) break;
    target.add(D.copy(goal).sub(at));
  }
}

export function attachGrip(m, eq, wid) {
  const row = GRIP[wid]; if (!row) return null;
  const objs = [];
  for (const [hand, side] of [[m.handR, 1], [m.handL, -1]]) {
    for (const g of hand.children) {
      if (!g.userData.wgun || g.userData.shield) continue;
      objs.push({ g, side, q0: g.quaternion.clone(), hand });
    }
  }
  const gunType = row.type === 'sword2' || row.type === 'two' || row.type === 'shoulder' || row.type === 'dual' || row.type === 'wrist' || row.type === 'pole';
  for (const o of objs) {
    if (row.muzzle && o.g.userData.tipObj) o.g.userData.tipObj.position.fromArray(row.muzzle);
    if (row.tilt) o.q0.setFromEuler(new THREE.Euler(row.tilt, 0, 0));
    if (gunType) m.spine.add(o.g);
  }
  if (eq && eq.shield) eq.shield.scale.setScalar(row.shield || 1);
  return { row, wid, objs, gun: gunType, m, eq, aimK: 0, hold: 0, info: { R: {}, L: {} }, hidden: false };
}

const WF = new THREE.Vector3(); const WU = new THREE.Vector3();
const fwdV = new THREE.Vector3(); const upV = new THREE.Vector3(); const posV = new THREE.Vector3();
const lerp = (a, b, k) => a + (b - a) * k;

const V1 = new THREE.Vector3(); const V2 = new THREE.Vector3(); const V3 = new THREE.Vector3();
// the weapon of a gun type, hung off the spine so that the off hand (or, for pistols, the main hand) sits at the pose point
function placeGun(gr, o, rest, aim, k, kick, mirror) {
  const row = gr.row; const s = row.scale * o.k;
  const mx = mirror ? -1 : 1;
  const yaw = (lerp(rest.yaw, aim.yaw, k) - lerp(rest.twist, aim.twist, k)) * mx; const pitch = lerp(rest.pitch, aim.pitch, k) + kick * 0.07;
  fwdV.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  upV.set(0, 1, 0);
  basisQ(fwdV, upV, Q1);
  basisQ(WF.fromArray(row.fwd), WU.fromArray(row.up), Q2); Q2.invert();
  o.g.quaternion.copy(Q1).multiply(Q2);
  o.g.scale.setScalar(s);
  const anchor = rest.lh ? row.support : row.main;
  const at = rest.lh ? V1.set(lerp(rest.lh[0], aim.lh[0], k), lerp(rest.lh[1], aim.lh[1], k), lerp(rest.lh[2], aim.lh[2], k)) : V1.set(lerp(rest.m[0], aim.m[0], k) * mx, lerp(rest.m[1], aim.m[1], k), lerp(rest.m[2], aim.m[2], k));
  at.addScaledVector(fwdV, -kick * 0.05);
  posV.fromArray(anchor).multiplyScalar(s).applyQuaternion(o.g.quaternion);
  o.g.position.copy(at).sub(posV);
  o.g.updateMatrix();
}

// a pole through both hands: the direction is hand to hand, and a thrust slides the shaft through them
function placePole(gr, o, rest, aim, k, st) {
  const row = gr.row; const s = row.scale * o.k; const sw = st.swing;
  let thr = 0; if (sw >= 0 && gr.wid === 'spear') thr = sw < 0.3 ? -0.35 * (sw / 0.3) : sw < 0.6 ? lerp(-0.35, 1, (sw - 0.3) / 0.3) : lerp(1, 0, (sw - 0.6) / 0.4);
  const rh = V1.set(lerp(rest.rh[0], aim.rh[0], k), lerp(rest.rh[1], aim.rh[1], k), lerp(rest.rh[2], aim.rh[2], k));
  const lh = V2.set(lerp(rest.lh[0], aim.lh[0], k), lerp(rest.lh[1], aim.lh[1], k), lerp(rest.lh[2], aim.lh[2], k));
  const dir = fwdV.copy(lh).sub(rh); const sep = dir.length(); dir.multiplyScalar(1 / sep);
  rh.addScaledVector(dir, 0.05 * thr);
  const cMain = row.main[1] - thr * 0.4 / s;
  gr.suppLocal = [0, cMain + sep / s, 0];
  upV.set(0, 1, 0); basisQ(dir, upV, Q1);
  basisQ(WF.fromArray(row.fwd), WU.fromArray(row.up), Q2); Q2.invert();
  o.g.quaternion.copy(Q1).multiply(Q2); o.g.scale.setScalar(s);
  o.g.position.copy(rh).addScaledVector(dir, -cMain * s);
  o.g.updateMatrix();
}

// anything the cast poses of castanim.js put the weapon away for
function castHides(st) {
  const c = st.act && BZ.CAST_ANIM && BZ.CAST_ANIM[st.act.key];
  return !!(c && !c.gun);
}

// the two-handed sword: the pose follows the swing progress, the off hand and the blade direction are blended between key poses
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const PA = new THREE.Vector3(); const PB = new THREE.Vector3(); const PD = new THREE.Vector3(); const PU = new THREE.Vector3();
function swordPose(row, sw, out) {
  const P = row.poses; let a = P.guard; let b = P.guard; let t = 0;
  if (sw >= 0) {
    if (sw < 0.3) { a = P.guard; b = P.wind; t = smooth(sw / 0.3); }
    else if (sw < 0.5) { a = P.wind; b = P.cross; t = smooth((sw - 0.3) / 0.2); }
    else if (sw < 0.68) { a = P.cross; b = P.end; t = smooth((sw - 0.5) / 0.18); }
    else { a = P.end; b = P.guard; t = smooth((sw - 0.68) / 0.32); }
  }
  PA.fromArray(a.lh).lerp(PB.fromArray(b.lh), t); out.lh.copy(PA);
  PD.fromArray(a.d).normalize().lerp(PB.fromArray(b.d).normalize(), t).normalize(); out.d.copy(PD);
  PU.fromArray(a.u).lerp(PB.fromArray(b.u), t).normalize(); out.u.copy(PU);
}
const SP = { lh: new THREE.Vector3(), d: new THREE.Vector3(), u: new THREE.Vector3() };
function placeSword(gr, o, sw, bob) {
  const row = gr.row; const s = row.scale * o.k;
  swordPose(row, sw, SP);
  SP.lh.y += bob;
  const f = SP.d; const up = SP.u; up.addScaledVector(f, -up.dot(f)).normalize();
  basisQ(f, up, Q1);
  basisQ(WF.fromArray(row.fwd), WU.fromArray(row.up), Q2); Q2.invert();
  o.g.quaternion.copy(Q1).multiply(Q2); o.g.scale.setScalar(s);
  posV.fromArray(row.support).multiplyScalar(s).applyQuaternion(o.g.quaternion);
  o.g.position.copy(SP.lh).sub(posV); o.g.updateMatrix();
}

const targetV = new THREE.Vector3();
const spineTarget = (m, g, p) => { g.updateMatrix(); return targetV.fromArray(p).applyMatrix4(g.matrix); };

// ctx: { aim: the hero is shooting or swinging right now }
export function solveGrip(gr, m, st, dt, ctx) {
  if (!gr) return;
  const row = gr.row; const J = st.j || {};
  gr.hold = ctx.aim ? 0.7 : Math.max(0, gr.hold - dt);
  const want = ctx.aim || gr.hold > 0 ? 1 : 0;
  gr.aimK += (want - gr.aimK) * Math.min(1, dt * (want ? 16 : 5));
  const k = J.gunK === undefined ? 1 : J.gunK;
  const hide = castHides(st);
  for (const o of gr.objs) { o.k = Math.max(0.001, k); o.g.visible = !hide; }
  gr.hidden = hide;
  m.armR.rotation.y = 0;
  if (row.type === 'sword2') {
    const o = gr.objs[0]; const dead = st.dead > 0;
    const sw = dead ? -1 : st.swing; gr.swK = (gr.swK || 0) + ((sw >= 0 ? 1 : 0) - (gr.swK || 0)) * Math.min(1, dt * 20);
    const bob = Math.sin((st.t || 0) * 2.2) * 0.012 * (1 - gr.swK);
    placeSword(gr, o, sw, bob);
    if (hide || dead || st.draw < 1) return;
    const Rm = spineTarget(m, o.g, row.main).clone(); solveArm(m.armR, m.elbowR, m.handR, 1, Rm, gr.info.R);
    const Ls = spineTarget(m, o.g, row.support).clone(); solveArm(m.armL, m.elbowL, m.handL, -1, Ls, gr.info.L);
    return;
  }
  if (gr.gun) {
    const kickR = Math.min(1, st.kick || 0); const kickL = Math.min(1, st.kickL || 0);
    const dead = st.dead > 0;
    const kk = dead ? 0 : gr.aimK;
    const aimed = row.aim; const rest = row.rest;
    if (row.type === 'pole') placePole(gr, gr.objs[0], rest, aimed, kk, st);
    else gr.objs.forEach((o) => placeGun(gr, o, rest, aimed, kk, o.side > 0 ? kickR : kickL, o.side < 0));
    gr.twist = (dead ? 0 : lerp(rest.twist, aimed.twist, kk));
    if (hide || dead || st.draw < 1) return;
    m.spine.rotation.y += gr.twist; m.head.rotation.y -= gr.twist * 0.8;
    const R = gr.objs[0]; const Rm = spineTarget(m, R.g, row.main).clone();
    solveArm(m.armR, m.elbowR, m.handR, 1, Rm, gr.info.R);
    if (row.type === 'dual') {
      const L = gr.objs[1]; const Lm = spineTarget(m, L.g, row.main).clone(); solveArm(m.armL, m.elbowL, m.handL, -1, Lm, gr.info.L);
    } else {
      const Ls = spineTarget(m, R.g, gr.suppLocal || row.support).clone(); solveArm(m.armL, m.elbowL, m.handL, -1, Ls, gr.info.L);
    }
    return;
  }
  // hand types
  const s = row.scale * (gr.scaleK === undefined ? 1 : gr.scaleK);
  const sw = st.swing >= 0 ? 1 : 0; gr.swK = (gr.swK || 0) + (sw - (gr.swK || 0)) * Math.min(1, dt * (sw ? 24 : 9));
  if (row.carry) {
    // between swings the weapon is carried out to the side and forward, whatever the forearm does; a swing hands it back to the arm
    m.root.updateMatrixWorld(true);
    m.handR.getWorldQuaternion(Q1); m.spine.getWorldQuaternion(Q2); Q2.invert().multiply(Q1); Q1.copy(Q2).invert();
    fwdV.fromArray(row.carry).normalize(); upV.set(0, 1, 0); basisQ(fwdV, upV, Q2);
    basisQ(WF.fromArray(row.fwd), WU.fromArray(row.up), Q3); Q3.invert(); Q2.multiply(Q3);
    gr.objs[0].qFree = Q1.clone().multiply(Q2);
  }
  for (const o of gr.objs) {
    o.g.scale.setScalar(s * o.k); o.g.quaternion.copy(o.q0);
    if (o.qFree) o.g.quaternion.slerp(o.qFree, 1 - gr.swK);
    o.g.position.fromArray(row.main).multiplyScalar(-s * o.k).applyQuaternion(o.g.quaternion);
  }
  if (hide || st.dead > 0) return;
  if (gr.wid === 'longsword' && st.dead <= 0) {
    // the sword arm swings; the shield arm stays up in a guard whatever the sword does
    m.armL.rotation.set(-0.95, -0.3, 0); m.elbowL.rotation.x = -1.4;
  }
}

// measurements for tests: everything in the model's own units (relative to the body root, before the hero scale)
export function gripReport(gr, m) {
  m.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(m.root.matrixWorld).invert();
  const rel = (obj, p) => (p ? new THREE.Vector3().copy(p) : new THREE.Vector3()).applyMatrix4(obj.matrixWorld).applyMatrix4(inv);
  const hand = (side) => rel(side > 0 ? m.handR : m.handL);
  const out = { type: gr.row.type, hands: {} };
  const s = gr.row.scale;
  const mainPt = (o) => rel(o.g, new THREE.Vector3().fromArray(gr.row.main));
  out.main = gr.objs.map((o) => hand(o.side).distanceTo(mainPt(o)));
  const supp = gr.suppLocal || gr.row.support;
  if (supp && gr.row.type !== 'dual') {
    const o = gr.objs[0]; out.support = hand(-1).distanceTo(rel(o.g, new THREE.Vector3().fromArray(supp)));
  }
  const elbowOf = (arm, elbow, side) => {
    const sh = rel(arm); const el = rel(elbow); const h = hand(side);
    const a = sh.clone().sub(el).normalize(); const b = h.clone().sub(el).normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI;
    const line = h.clone().sub(sh); const t = Math.max(0, Math.min(1, el.clone().sub(sh).dot(line) / line.lengthSq()));
    const onLine = sh.clone().addScaledVector(line, t);
    return { angle: ang, below: onLine.y - el.y, reach: sh.distanceTo(h) };
  };
  out.elbowR = elbowOf(m.armR, m.elbowR, 1); out.elbowL = elbowOf(m.armL, m.elbowL, -1);
  const f3 = (v) => v.toArray().map((x) => +x.toFixed(2));
  out.dbg = { shL: f3(rel(m.armL)), shR: f3(rel(m.armR)), handR: f3(hand(1)), handL: f3(hand(-1)), supp: supp ? f3(rel(gr.objs[0].g, new THREE.Vector3().fromArray(supp))) : null, main: f3(mainPt(gr.objs[0])) };
  out.reachR = gr.info.R.reach; out.reachL = gr.info.L.reach; out.scale = s;
  return out;
}
