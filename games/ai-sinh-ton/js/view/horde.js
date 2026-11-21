// The horde on screen: every ordinary enemy the sim marks `horde` (and any enemy that finds the zombie pool full) is drawn by
// instancing, not by a Blockade Z body. One blocky body in Blockade Z's proportions, cut into torso / head / arms / legs
// (+ wings), each an InstancedMesh shared by all kinds: a kind is its own scale, pose, colour tint and gait. Whatever the
// count, the cost is a fixed handful of draw calls: torso, head (skin + face), arms, legs, wings, death cubes, ground splats.
// Deaths are pooled: a corpse record plays out through the same meshes, a few cubes fly from a ring buffer, a splat every
// few deaths. No per-unit object, no per-death allocation.
import { FLY_Y } from './keys.js?v=20261121a';
import { arrive } from './arrival.js?v=20261121a';

const THREE = window.THREE;
const BZ = window.BZ;

const CAP = 360;           // bodies drawable at once (live + dying); the sim holds 120 live
const CORPSES = 56;
const CUBES = 240;
const SPLATS = 28;
const SPAWN_T = 0.6;
const yawOf = (face) => Math.PI / 2 - face;
const wrap = BZ.wrapAngle;

// per-tier death: cubes per kill, seconds a body takes to go, ground splat every N kills, the fall or the pop
const TIER = {
  low: { cubes: 3, dur: 0.32, splatEvery: 9, fall: false },
  medium: { cubes: 5, dur: 0.6, splatEvery: 6, fall: true },
  high: { cubes: 7, dur: 0.75, splatEvery: 4, fall: true },
};

// Colours are the colour a part should END UP, as a hex; the instance tint is that over the texture's own average.
// base: the texture each part is mapped with (BZ.tex keys of Blockade Z's own zombie art).
const BASE = { skin: 0x9db08a, shirt: 0x3a3a44, pants: 0x6a4a2c };
// s scale, w width, h height, hip hip height, lean forward pitch, mode (walk | quad | spider | fly), sw swing speed, amp leg swing,
// arm base pitch, glow brightness boost, burst colour
const ST = {
  walker: { s: 1, w: 1, h: 1, lean: 0.1, mode: 'walk', sw: 1, amp: 0.7, arm: -0.6, skin: 0x9db08a, shirts: [0xb03d3d, 0x55566a, 0xe5762a, 0x4f7f8f], pants: [0x7d6c48, 0x2c2a2a, 0x6a4a2c], burst: 0x7e9a62 },
  runner: { s: 0.92, w: 0.9, h: 1, lean: 0.42, mode: 'walk', sw: 1.7, amp: 1.0, arm: -0.15, swingArm: 0.9, skin: 0xd8e048, shirts: [0xf03020, 0xf0b020], pants: [0x2c2a2a, 0x3a3a50], burst: 0xb4cc55 },
  spider: { s: 0.6, w: 1.6, h: 0.5, hip: 0.42, lean: 0.1, mode: 'spider', sw: 2.4, amp: 0.5, arm: 0, skin: 0x42305a, shirts: [0x2e2040], pants: [0x6a3a8a], burst: 0x6a3a8a },
  flyer: { s: 0.85, w: 1, h: 1, lean: 0.35, mode: 'fly', sw: 1, amp: 0.4, arm: -0.3, skin: 0xd0c0ea, shirts: [0x4a3a6a], pants: [0x3a2a5a], burst: 0xc060f0 },
  hound: { s: 0.85, w: 0.95, h: 1.05, hip: 0.46, lean: 1.28, mode: 'quad', sw: 2.2, amp: 0.9, arm: 0, skin: 0xb07c46, shirts: [0x7a4a24], pants: [0x8a5a30], burst: 0xb07c46 },
  spitter: { s: 0.98, w: 1, h: 1, lean: 0.28, mode: 'walk', sw: 0.9, amp: 0.6, arm: -0.9, skin: 0x7ed02e, shirts: [0x4a7a20], pants: [0x3a5a18], burst: 0x9aff40 },
  bloater: { s: 1.2, w: 1.6, h: 0.98, lean: -0.05, mode: 'walk', sw: 0.7, amp: 0.45, arm: -0.4, skin: 0xdcc84a, shirts: [0xc8a030], pants: [0x7a6a30], burst: 0xdcc84a },
  shielder: { s: 1.1, w: 1.2, h: 1, lean: 0.08, mode: 'walk', sw: 0.8, amp: 0.55, arm: -1.2, skin: 0x9db08a, shirts: [0x3a78e0], pants: [0x2a3a78], burst: 0x6aa0f0 },
  brute: { s: 1.45, w: 1.3, h: 1, lean: 0.15, mode: 'walk', sw: 0.6, amp: 0.5, arm: -0.45, skin: 0x5d7f4f, shirts: [0x4a4048], pants: [0x2c2a2a], burst: 0x5d7f4f },
  shrieker: { s: 1.05, w: 0.82, h: 1.14, lean: 0.3, mode: 'walk', sw: 1, amp: 0.7, arm: -1.5, skin: 0xece4f4, shirts: [0xc8588a], pants: [0x7d6c48], burst: 0xf0e0ff },
  armored: { s: 1.25, w: 1.3, h: 1, lean: 0.12, mode: 'walk', sw: 0.65, amp: 0.5, arm: -0.5, skin: 0x8a9aa8, shirts: [0xd8e0f0], pants: [0x8890a0], burst: 0xc8d0e0 },
  burner: { s: 1.05, w: 1, h: 1, lean: 0.12, mode: 'walk', sw: 1, amp: 0.7, arm: -0.6, glow: 1.5, skin: 0xff7a28, shirts: [0xe04010], pants: [0x501808], burst: 0xffa030 },
  frost: { s: 1.1, w: 1, h: 1, lean: 0.08, mode: 'walk', sw: 0.85, amp: 0.65, arm: -0.6, skin: 0xa8dcf4, shirts: [0x78b8f0], pants: [0x4a78b0], burst: 0xc8f0ff },
};
const DEFAULT = ST.walker;
const FLASH = [2, 2, 2];

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const BASE_LIN = { skin: lin(BASE.skin), shirt: lin(BASE.shirt), pants: lin(BASE.pants) };
const tintOf = (hex, base) => { const c = lin(hex); return [Math.min(9, c[0] / base[0]), Math.min(9, c[1] / base[1]), Math.min(9, c[2] / base[2])]; };
for (const k of Object.keys(ST)) {
  const o = ST[k]; o.hip = o.hip || 0.75; o.sk = tintOf(o.skin, BASE_LIN.skin);
  o.sh = o.shirts.map((h) => tintOf(h, BASE_LIN.shirt)); o.pa = o.pants.map((h) => tintOf(h, BASE_LIN.pants)); o.bc = new THREE.Color(o.burst);
}
const STATUS_TINT = { freeze: [0.55, 1, 1.9], burn: [1.7, 0.8, 0.35], poison: [0.7, 1.4, 0.5], slow: [0.8, 0.95, 1.35] };

function mergeGeo(parts) {
  let nv = 0; let ni = 0;
  const gs = parts.map(([g, m]) => { const c = g.clone(); c.applyMatrix4(m); nv += c.attributes.position.count; ni += c.index.count; return c; });
  const P = new Float32Array(nv * 3); const N = new Float32Array(nv * 3); const U = new Float32Array(nv * 2); const Cc = new Float32Array(nv * 3); const I = new Uint32Array(ni);
  let v = 0; let k = 0;
  for (const g of gs) {
    const n = g.attributes.position.count;
    P.set(g.attributes.position.array, v * 3); N.set(g.attributes.normal.array, v * 3); U.set(g.attributes.uv.array, v * 2); Cc.set(g.attributes.color.array, v * 3);
    for (let i = 0; i < g.index.count; i++) I[k++] = g.index.array[i] + v;
    v += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2)); out.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); out.setIndex(new THREE.BufferAttribute(I, 1));
  out.computeBoundingSphere(); return out;
}

export function createHorde(H) {
  const { G, scene } = H;
  const tier = TIER[H.quality.name] || TIER.medium;
  const proto = G.zombies.list[0].body;
  const M = (x = 0, y = 0, z = 0, rx = 0) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationX(rx));
  const legGeo = mergeGeo([[proto.legL.geometry, M()], [proto.kneeL.geometry, M(0, -0.38, 0)]]);
  const armGeo = mergeGeo([[proto.armL.geometry, M()], [proto.elbowL.geometry, M(0, -0.32, 0, -0.5)]]);

  const tex = (key) => new THREE.MeshLambertMaterial({ map: BZ.tex(key), vertexColors: true });
  const mats = { skin: tex('z_skin'), face: tex('z_face'), shirt: tex('z_shirt_dark'), pants: tex('z_pants_brown') };
  const wingMat = new THREE.MeshLambertMaterial({ map: BZ.tex('z_wing'), side: THREE.DoubleSide, emissive: 0x6a2a9a, emissiveMap: BZ.tex('z_wing'), transparent: true, alphaTest: 0.5 });
  const inst = (geo, mat, n) => {
    const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.count = 0; m.castShadow = false; m.receiveShadow = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(m); return m;
  };
  const torso = inst(proto.torso.geometry, mats.shirt, CAP);
  const head = inst(proto.head.geometry, [mats.skin, mats.face], CAP);
  const arms = inst(armGeo, mats.skin, CAP * 2);
  const legs = inst(legGeo, mats.pants, CAP * 2);
  const wings = inst(proto.wingL.geometry, wingMat, CAP * 2);
  const meshes = [torso, head, arms, legs, wings];

  // death cubes
  const cubes = inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({}), CUBES);
  const cb = { x: new Float32Array(CUBES), y: new Float32Array(CUBES), z: new Float32Array(CUBES), vx: new Float32Array(CUBES), vy: new Float32Array(CUBES), vz: new Float32Array(CUBES), life: new Float32Array(CUBES), max: new Float32Array(CUBES), size: new Float32Array(CUBES), rot: new Float32Array(CUBES), col: new Float32Array(CUBES * 3) };
  let cbHead = 0;
  // ground splats
  const splatGeo = new THREE.PlaneGeometry(1, 1); splatGeo.rotateX(-Math.PI / 2);
  const splatMat = new THREE.MeshBasicMaterial({ map: BZ.tex('blood'), transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const splats = inst(splatGeo, splatMat, SPLATS); splats.renderOrder = 1;
  const sp = { x: new Float32Array(SPLATS), z: new Float32Array(SPLATS), t: new Float32Array(SPLATS), size: new Float32Array(SPLATS), rot: new Float32Array(SPLATS), col: new Float32Array(SPLATS * 3) };
  sp.t.fill(99); let spHead = 0;
  meshes.push(cubes, splats);

  const states = new Map();
  const corpses = [];
  let showcase = [];
  let hk = null; let B = null; let clock = 0; let frame = 0; let nDeaths = 0; let deathsWin = []; let soundWin = []; let cubeBudget = 0;
  const stats = { units: 0, corpses: 0, cubes: 0, splats: 0 };

  // ---- scratch ----
  const M0 = new THREE.Matrix4(); const Hm = new THREE.Matrix4(); const Q = new THREE.Matrix4(); const A = new THREE.Matrix4(); const T = new THREE.Matrix4(); const R = new THREE.Matrix4(); const S3 = new THREE.Matrix4();
  const V = new THREE.Vector3(); const col = new THREE.Color();
  let nTorso = 0; let nArm = 0; let nWing = 0;
  const tmpPos = new THREE.Vector3();

  const hash = (n) => { let h = Math.imul(n | 0, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

  // body o: x y z yaw, sty, sc (scale mult), ph, lean+, nod, armA (extra arm pitch), swing 0..1 (<0 none), fall, tint [r,g,b], k brightness, shirt/pants/skin tints, wing flap
  function put(o) {
    if (nTorso >= CAP) return;
    const sty = o.sty; const s = sty.s * o.sc; const mode = sty.mode;
    const i = nTorso++;
    M0.makeRotationY(o.yaw); M0.scale(V.set(s * sty.w, s * sty.h, s * sty.w)); M0.setPosition(o.x, o.y, o.z);
    if (o.fall) M0.multiply(R.makeRotationX(-o.fall));
    const bob = mode === 'fly' ? Math.sin(o.ph * 0.5) * 0.12 : Math.abs(Math.sin(o.ph)) * 0.05 * Math.min(1, sty.sw);
    Hm.copy(M0).multiply(T.makeTranslation(0, sty.hip + bob, 0));
    const swing = o.swing; const lunge = swing >= 0 ? Math.sin(Math.PI * swing) : 0;
    const lean = sty.lean + o.lean + lunge * 0.3;
    Q.copy(Hm).multiply(R.makeRotationX(lean)); torso.setMatrixAt(i, Q);
    A.copy(Q).multiply(T.makeTranslation(0, 0.7, 0)).multiply(R.makeRotationX(o.nod - (mode === 'quad' || mode === 'spider' ? lean * 0.6 : 0) + (mode === 'walk' ? Math.sin(o.ph * 0.5) * 0.06 : 0))); head.setMatrixAt(i, A);
    const phs = Math.sin(o.ph); const arm0 = sty.arm + (swing >= 0 ? -1.5 * lunge : 0) + o.armA;
    const spread = mode === 'fly' ? 1.0 : mode === 'spider' ? 0.9 : 0;
    for (let k = 0; k < 2; k++) {
      const side = k ? 1 : -1; const j = i * 2 + k;
      let ang = arm0 + (sty.swingArm ? phs * side * sty.swingArm : phs * side * 0.12);
      if (mode === 'quad' || mode === 'spider') ang = -lean + phs * side * 0.8 + (mode === 'spider' ? 0.25 : 0);
      if (mode === 'fly') ang = -0.4 + Math.sin(o.ph * 0.5 + k) * 0.15;
      A.copy(Q).multiply(T.makeTranslation(side * 0.36 * (mode === 'spider' ? 1.5 : 1), 0.64, 0));
      if (spread) A.multiply(R.makeRotationZ(side * spread));
      A.multiply(R.makeRotationX(ang)); arms.setMatrixAt(j, A);
      let la = phs * side * sty.amp;
      if (mode === 'fly') la = 0.7 + Math.sin(o.ph * 0.5 + k * 2) * 0.12;
      if (mode === 'spider') la = -phs * side * 0.5 + 0.3;
      A.copy(Hm).multiply(T.makeTranslation(side * 0.13 * (mode === 'spider' ? 2.2 : 1), 0, 0));
      if (mode === 'spider') A.multiply(R.makeRotationZ(side * 0.8));
      A.multiply(R.makeRotationX(la)); legs.setMatrixAt(j, A);
    }
    const t = o.tint; const sh = o.sh; const pa = o.pa; const sk = o.sk; const kk = o.k;
    paint(torso, i, sh, t, kk); paint(head, i, sk, t, kk); paint(arms, i * 2, sk, t, kk); paint(arms, i * 2 + 1, sk, t, kk); paint(legs, i * 2, pa, t, kk); paint(legs, i * 2 + 1, pa, t, kk);
    if (mode === 'fly') {
      const flap = Math.sin(o.ph * 3.2) * 0.7 + 0.25;
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1; const j = nWing++;
        A.copy(Hm).multiply(T.makeTranslation(side * 0.2, 0.6, -0.12)).multiply(R.makeRotationZ(side * flap)); if (side > 0) A.multiply(S3.makeScale(-1, 1, 1));
        wings.setMatrixAt(j, A); paint(wings, j, [1, 1, 1], [1, 1, 1], 1.1);
      }
    }
    nArm = i * 2 + 2;
  }
  function paint(mesh, i, c, t, k) { const a = mesh.instanceColor.array; a[i * 3] = c[0] * t[0] * k; a[i * 3 + 1] = c[1] * t[1] * k; a[i * 3 + 2] = c[2] * t[2] * k; }

  const ONE = [1, 1, 1];
  function look(u) { // colours of one unit: stable per uid
    const sty = u.sty; const r = hash(u.uid);
    u.sh = sty.sh[Math.floor(r * 7.3) % sty.sh.length]; u.pa = sty.pa[Math.floor(r * 13.1) % sty.pa.length];
    const v = 0.88 + hash(u.uid + 77) * 0.24; u.sk = [sty.sk[0] * v, sty.sk[1] * v, sty.sk[2] * v]; u.sc = 0.92 + hash(u.uid + 191) * 0.16;
  }

  function stateOf(e) {
    let st = states.get(e.uid);
    if (!st) {
      st = { uid: e.uid, sty: ST[e.kind] || DEFAULT, x: e.x, z: e.z, yaw: yawOf(e.face), ph: hash(e.uid) * 6.28, spd: 0, swing: -1, hit: 0, seen: 0, node: null };
      look(st); states.set(e.uid, st);
    }
    return st;
  }

  function drawLive(st, e, dt) {
    const sty = st.sty;
    if (dt > 0.002) {
      const k = 1 - Math.exp(-26 * dt); const bx = st.x; const bz = st.z;
      st.x += (e.x - st.x) * k; st.z += (e.z - st.z) * k;
      st.spd += (Math.min(9, Math.hypot(st.x - bx, st.z - bz) / dt) - st.spd) * Math.min(1, dt * 10);
      st.yaw += wrap(yawOf(e.face) - st.yaw) * Math.min(1, dt * 14);
      st.ph += st.spd * dt * 2.1 * sty.sw + (sty.mode === 'fly' ? dt * 9 : 0) + (st.spd < 0.3 ? dt * 0.8 : 0);
      if (st.swing >= 0) { st.swing += dt / 0.34; if (st.swing >= 1) st.swing = -1; }
      st.hit = Math.max(0, st.hit - dt * 8);
    }
    let rise = 1; let sink = 0; let ax = 0; let az = 0;
    if (e.spawnT > 0) { const ar = arrive(H, e, st.x, st.z); rise = ar.s; sink = ar.y / sty.s; ax = ar.ox; az = ar.oz; }
    const L = hk && hk.lift ? hk.lift(st.uid) : null;
    const y = (e.fly ? (FLY_Y[e.kind] || 3) : 0) + sink * sty.s + (L ? L.y : 0);
    let tint = ONE;
    if (e.status) { for (const k in e.status) { if (STATUS_TINT[k]) { tint = STATUS_TINT[k]; break; } } }
    // climbing out of the abyss: dark toward the abyss colour while the rise runs
    let fk = 0;
    if (e.spawnT > 0 && H.world) { fk = Math.pow(Math.max(0, e.spawnT) / SPAWN_T, 1.2) * 0.6; const c = H.world.spawnTint; tint = [tint[0] + (Math.min(1.8, c.r * 1.6) - tint[0]) * fk, tint[1] + (Math.min(1.8, c.g * 1.6) - tint[1]) * fk, tint[2] + (Math.min(1.8, c.b * 1.6) - tint[2]) * fk]; }
    put({ x: st.x + ax + (L ? L.ox : 0), y, z: st.z + az + (L ? L.oz : 0), yaw: st.yaw + (L ? L.yaw : 0), sty, sc: st.sc * rise, ph: st.ph, lean: -st.hit * 0.28, nod: st.hit * 0.3, armA: 0, swing: st.swing, fall: L ? L.tilt : 0, tint, k: (sty.glow || 1) * (1 + st.hit * 1.4 + fk * 0.5), sh: st.sh, pa: st.pa, sk: st.sk });
    st.sc2 = rise; st.px = st.x; st.pz = st.z; st.py = y; st.tint = tint;
  }

  function drawCorpse(c, dt) {
    c.t += dt; const u = c.t / tier.dur; if (u >= 1) return false;
    const sty = c.sty; let sc = c.sc; let fall = 0; let y = c.y; const k = 1 + (1 - u) * 1.8;
    if (tier.fall) { fall = Math.min(1.45, c.t * 6); if (u > 0.55) y -= (u - 0.55) / 0.45 * 1.2 * sty.s; }
    else { sc *= u < 0.25 ? 1 + u / 0.25 * 0.22 : 1.22 * (1 - (u - 0.25) / 0.75); }
    put({ x: c.x + c.dx * Math.min(c.t, 0.25), y, z: c.z + c.dz * Math.min(c.t, 0.25), yaw: c.yaw, sty, sc: Math.max(0.01, sc), ph: c.ph, lean: 0, nod: 0, armA: -0.6 * (1 - u), swing: -1, fall, tint: ONE, k, sh: c.sh, pa: c.pa, sk: c.sk });
    return true;
  }

  function addCube(x, y, z, vx, vy, vz, size, c, life) {
    const i = cbHead; cbHead = (cbHead + 1) % CUBES;
    cb.x[i] = x; cb.y[i] = y; cb.z[i] = z; cb.vx[i] = vx; cb.vy[i] = vy; cb.vz[i] = vz; cb.size[i] = size; cb.life[i] = life; cb.max[i] = life; cb.rot[i] = Math.random() * 6.28;
    cb.col[i * 3] = c.r; cb.col[i * 3 + 1] = c.g; cb.col[i * 3 + 2] = c.b;
  }
  function addSplat(x, z, c, size) {
    const i = spHead; spHead = (spHead + 1) % SPLATS; sp.x[i] = x; sp.z[i] = z; sp.t[i] = 0; sp.size[i] = size; sp.rot[i] = Math.random() * 6.28;
    const dark = 0.55; sp.col[i * 3] = c.r * dark; sp.col[i * 3 + 1] = c.g * dark; sp.col[i * 3 + 2] = c.b * dark;
  }

  function die(e) {
    const st = states.get(e.uid); if (!st) return; states.delete(e.uid);
    const by = B && B.byUid.get(e.by); let dx = 0; let dz = 0;
    if (by) { dx = st.px - by.x; dz = st.pz - by.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; } else { const a = Math.random() * 6.28; dx = Math.cos(a); dz = Math.sin(a); }
    if (corpses.length >= CORPSES) corpses.shift();
    corpses.push({ x: st.px, y: st.py, z: st.pz, yaw: st.yaw, sty: st.sty, sc: st.sc * (st.sc2 || 1), ph: st.ph, t: 0, dx: dx * 1.4, dz: dz * 1.4, sh: st.sh, pa: st.pa, sk: st.sk });
    nDeaths++; deathsWin.push(clock);
    const crowd = deathsWin.length;
    const n = Math.min(tier.cubes, Math.max(1, Math.round(cubeBudget / 4)));
    if (cubeBudget > 0) {
      cubeBudget -= n;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28; const sp2 = 1.5 + Math.random() * 2.6; const sz = 0.1 + Math.random() * 0.1 * st.sty.s;
        addCube(st.px, st.py + 0.7 * st.sty.s, st.pz, Math.cos(a) * sp2 + dx * 2.2, 2.6 + Math.random() * 2.6, Math.sin(a) * sp2 + dz * 2.2, sz, st.sty.bc, 0.45 + Math.random() * 0.3);
      }
    }
    if (nDeaths % tier.splatEvery === 0 && st.sty.mode !== 'fly') addSplat(st.px, st.pz, st.sty.bc, 0.9 + st.sty.s * 0.5);
    // sound: at most about 8 a second, louder when the floor is emptying fast
    while (soundWin.length && clock - soundWin[0] > 1) soundWin.shift();
    if (soundWin.length < 8 && G.audio && G.audio.playAt) { soundWin.push(clock); tmpPos.set(st.px, 0, st.pz); G.audio.playAt('die', tmpPos, { gain: crowd >= 6 ? 0.5 : 0.26 }); }
  }

  function tickCubes(dt) {
    let n = 0;
    for (let i = 0; i < CUBES; i++) {
      if (cb.life[i] <= 0) continue;
      cb.life[i] -= dt; if (cb.life[i] <= 0) continue;
      cb.vy[i] -= 14 * dt; cb.x[i] += cb.vx[i] * dt; cb.y[i] += cb.vy[i] * dt; cb.z[i] += cb.vz[i] * dt;
      if (cb.y[i] < 0.06) { cb.y[i] = 0.06; cb.vy[i] *= -0.25; cb.vx[i] *= 0.6; cb.vz[i] *= 0.6; }
      const sc = cb.size[i] * Math.min(1, cb.life[i] / 0.2 + 0.05);
      Q.makeRotationY(cb.rot[i] + cb.life[i] * 6); Q.scale(V.set(sc, sc, sc)); Q.setPosition(cb.x[i], cb.y[i], cb.z[i]);
      cubes.setMatrixAt(n, Q); const a = cubes.instanceColor.array; a[n * 3] = cb.col[i * 3]; a[n * 3 + 1] = cb.col[i * 3 + 1]; a[n * 3 + 2] = cb.col[i * 3 + 2]; n++;
    }
    cubes.count = n; cubes.instanceMatrix.needsUpdate = true; cubes.instanceColor.needsUpdate = true; stats.cubes = n;
  }
  function tickSplats(dt) {
    let n = 0;
    for (let i = 0; i < SPLATS; i++) {
      if (sp.t[i] > 4) continue; sp.t[i] += dt;
      const sc = sp.size[i] * Math.min(1, sp.t[i] / 0.08 + 0.2) * (sp.t[i] > 3 ? Math.max(0.01, 4 - sp.t[i]) : 1);
      Q.makeRotationY(sp.rot[i]); Q.scale(V.set(sc, 1, sc)); Q.setPosition(sp.x[i], 0.03, sp.z[i]);
      splats.setMatrixAt(n, Q); const a = splats.instanceColor.array; a[n * 3] = sp.col[i * 3]; a[n * 3 + 1] = sp.col[i * 3 + 1]; a[n * 3 + 2] = sp.col[i * 3 + 2]; n++;
    }
    splats.count = n; splats.instanceMatrix.needsUpdate = true; splats.instanceColor.needsUpdate = true; stats.splats = n;
  }

  const api = {
    meshes, stats, states,
    // the units drawn here this frame: horde units plus enemies the zombie pool had no body for
    sync(batl, dt, overflow, hooks) {
      B = batl; hk = hooks; frame++; clock += dt; cubeBudget = 36;
      while (deathsWin.length && clock - deathsWin[0] > 0.5) deathsWin.shift();
      nTorso = 0; nWing = 0; nArm = 0; let units = 0;
      for (const e of B.enemies) {
        if (!e.alive || !(e.horde || overflow.has(e.uid))) continue;
        const st = stateOf(e); st.seen = frame; drawLive(st, e, dt); units++;
        if (st.node) st.node.position.set(st.x, 0, st.z);
        hooks.blob(st.x, st.z, 1.7 * st.sty.s * st.sc, st.py);
        hooks.rim(st.x, st.z, 0.9 * st.sty.s);
      }
      for (const [uid, st] of states) if (st.seen !== frame) states.delete(uid);
      for (const w of showcase) { w.st.ph += dt * 4 * w.st.sty.sw; put({ x: w.x, y: w.y, z: w.z, yaw: w.yaw, sty: w.st.sty, sc: w.st.sc, ph: w.st.ph, lean: 0, nod: 0, armA: 0, swing: -1, fall: 0, tint: ONE, k: w.st.sty.glow || 1, sh: w.st.sh, pa: w.st.pa, sk: w.st.sk }); }
      for (let i = corpses.length - 1; i >= 0; i--) if (!drawCorpse(corpses[i], dt)) corpses.splice(i, 1);
      torso.count = head.count = nTorso; arms.count = legs.count = nTorso * 2; wings.count = nWing;
      for (const m of [torso, head, arms, legs, wings]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
      tickCubes(dt); tickSplats(dt);
      stats.units = units; stats.corpses = corpses.length;
    },
    onEvent(e) {
      if (e.e === 'die') die(e);
      else if (e.e === 'hit') { if (e.dot || !e.dmg) return; const st = states.get(e.uid); if (st && st.hit <= 0.05) st.hit = 1; }
      else if (e.e === 'attack') { const st = states.get(e.uid); if (st && st.swing < 0) st.swing = 0; }
    },
    has: (uid) => states.has(uid),
    scaleOf: (uid) => { const st = states.get(uid); return st ? st.sty.s : 1; },
    nodeOf(uid) { const st = states.get(uid); if (!st) return null; if (!st.node) { st.node = new THREE.Object3D(); st.node.position.set(st.x, 0, st.z); } return st.node; },
    headPos(uid, out) { const st = states.get(uid); return st ? out.set(st.x, st.py + 2 * st.sty.s, st.z) : null; },
    // test hook: a static pack of one kind, drawn through the same meshes
    showcase(kind, n, cx, cz, cols = 4) {
      showcase = [];
      for (let i = 0; i < (kind ? n : 0); i++) {
        const st = { uid: 9000 + i, sty: ST[kind] || DEFAULT, ph: i * 0.9 }; look(st);
        showcase.push({ st, x: cx + ((i % cols) - (cols - 1) / 2) * 1.1, z: cz + (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * 1.1, y: kind === 'flyer' ? 3 : 0, yaw: 0 });
      }
    },
    kinds: Object.keys(ST),
    // draw calls and triangles the horde meshes cost right now
    cost() { let calls = 0; let tris = 0; for (const m of meshes) { if (!m.visible || !m.count) continue; calls += Array.isArray(m.material) ? m.material.length : 1; tris += m.count * m.geometry.index.count / 3; } return { calls, tris }; },
    clear() { states.clear(); corpses.length = 0; showcase = []; deathsWin = []; soundWin = []; cb.life.fill(0); sp.t.fill(99); for (const m of meshes) m.count = 0; B = null; },
  };
  void CORPSES;
  return api;
}
