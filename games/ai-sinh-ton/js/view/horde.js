// Every ordinary enemy on screen (all but the bosses) is drawn here by instancing: one code-built body per kind
// (foe/zombies.js), one InstancedMesh pair per kind (toon body + inverted-hull outline), animated in the vertex shader
// from a few numbers per instance (foe/kit.js): gait phase, attack swing, hit recoil, fall, dissolve, flash, launch spin.
// Draw calls: two per kind on screen, plus death shards and ground splats. Deaths are pooled: a corpse record falls and
// dissolves (blocky holes with glowing edges) through the same meshes, shards fly from a ring buffer, smoke from G.fx.
// A monster belongs to a room (its pad, e.room): one in a room the team has not reached yet, a camp still waiting (B.camp)
// or a pack woken while the run is on, is drawn on that room's pad through world.roomOffset, and not at all while that pad
// is not built.
import { FLY_Y } from './keys.js?v=20261124a';
import { arrive } from './arrival.js?v=20261124a';
import { foeMesh } from './foe/kit.js?v=20261124a';
import { KINDS, zombieGeos } from './foe/zombies.js?v=20261124a';

const THREE = window.THREE;
const BZ = window.BZ;

const CAP = 240;           // bodies of one kind drawable at once (live + dying)
const CORPSES = 64;
const SHARDS = 200;
const SPLATS = 28;
const SPAWN_T = 0.6;
const ELITE = 1.3;         // an elite is drawn this much bigger, brighter
const yawOf = (face) => Math.PI / 2 - face;
const wrap = BZ.wrapAngle;

// per tier: shards per kill, seconds a body takes to fall and dissolve, a ground splat every N kills, smoke puffs per kill
const TIER = {
  low: { shards: 3, dur: 0.7, splatEvery: 9, smoke: 1 },
  medium: { shards: 5, dur: 0.9, splatEvery: 6, smoke: 1 },
  high: { shards: 7, dur: 1.05, splatEvery: 4, smoke: 2 },
};
const STATUS_TINT = { freeze: [0.6, 1, 1.8], burn: [1.6, 0.85, 0.45], poison: [0.75, 1.35, 0.55], slow: [0.82, 0.95, 1.3] };
const ONE = [1, 1, 1];

export function createHorde(H) {
  const { G, scene } = H;
  const tier = TIER[H.quality.name] || TIER.medium;
  const geos = zombieGeos();
  const ST = {}; const kinds = Object.keys(KINDS);
  const meshes = [];
  for (const id of kinds) {
    const K = KINDS[id]; const m = foeMesh(geos[id].geo, K.gait, CAP);
    m.body.name = 'horde.' + id; m.line.name = 'horde.' + id + '.line';
    scene.add(m.body); scene.add(m.line); m.body.visible = m.line.visible = false;
    meshes.push(m.body, m.line);
    ST[id] = { id, K, m, n: 0, s: K.s, top: geos[id].top, sw: K.sw, mode: K.gait.mode, burst: new THREE.Color(K.gait.burst), cloth: K.cloth.map((h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; }) };
  }
  const DEFAULT = ST.walker;
  const F = meshes[0].position; // where the world has moved the horde's frame (world.follow)

  // death shards: flat chips of the body's colour that tumble and bounce
  const shardGeo = new THREE.OctahedronGeometry(0.5, 0); shardGeo.scale(1, 0.45, 0.8);
  const shards = new THREE.InstancedMesh(shardGeo, new THREE.MeshLambertMaterial({}), SHARDS);
  shards.frustumCulled = false; shards.count = 0; shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shards.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS * 3), 3); scene.add(shards);
  const cb = { x: new Float32Array(SHARDS), y: new Float32Array(SHARDS), z: new Float32Array(SHARDS), vx: new Float32Array(SHARDS), vy: new Float32Array(SHARDS), vz: new Float32Array(SHARDS), life: new Float32Array(SHARDS), size: new Float32Array(SHARDS), rot: new Float32Array(SHARDS), col: new Float32Array(SHARDS * 3) };
  let cbHead = 0;
  // ground splats
  const splatGeo = new THREE.PlaneGeometry(1, 1); splatGeo.rotateX(-Math.PI / 2);
  const splatMat = new THREE.MeshBasicMaterial({ map: BZ.tex('blood'), transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const splats = new THREE.InstancedMesh(splatGeo, splatMat, SPLATS); splats.frustumCulled = false; splats.count = 0; splats.renderOrder = 1;
  splats.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SPLATS * 3), 3); scene.add(splats);
  const sp = { x: new Float32Array(SPLATS), z: new Float32Array(SPLATS), t: new Float32Array(SPLATS), size: new Float32Array(SPLATS), rot: new Float32Array(SPLATS), col: new Float32Array(SPLATS * 3) };
  sp.t.fill(99); let spHead = 0;
  const extras = [shards, splats];

  const states = new Map();
  const corpses = [];
  let showcase = [];
  let hk = null; let B = null; let clock = 0; let frame = 0; let nDeaths = 0; let deathsWin = []; let soundWin = []; let shardBudget = 0; let smokeBudget = 0;
  const stats = { units: 0, corpses: 0, cubes: 0, splats: 0, kinds: 0 };

  const M0 = new THREE.Matrix4(); const Q = new THREE.Matrix4(); const V = new THREE.Vector3(); const tmpPos = new THREE.Vector3(); const tmpV = new THREE.Vector3();
  const hash = (n) => { let h = Math.imul(n | 0, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

  // one body: o = { x y z yaw sty sc ph swing hit die fall flash lean spin tint k cloth }
  function put(o) {
    const S = o.sty; if (S.n >= CAP) return;
    const i = S.n++; const m = S.m; const s = S.s * o.sc;
    M0.makeRotationY(o.yaw); M0.scale(V.set(s, s, s)); M0.setPosition(o.x, o.y, o.z); m.body.setMatrixAt(i, M0);
    const a = m.iA; a[i * 4] = o.ph; a[i * 4 + 1] = o.swing; a[i * 4 + 2] = o.hit; a[i * 4 + 3] = o.die;
    const b = m.iB; b[i * 4] = o.fall; b[i * 4 + 1] = o.flash; b[i * 4 + 2] = o.lean; b[i * 4 + 3] = o.spin;
    const c = m.iC; c[i * 3] = o.cloth[0]; c[i * 3 + 1] = o.cloth[1]; c[i * 3 + 2] = o.cloth[2];
    const ic = m.body.instanceColor.array; const t = o.tint; const k = o.k; ic[i * 3] = t[0] * k; ic[i * 3 + 1] = t[1] * k; ic[i * 3 + 2] = t[2] * k;
  }

  function look(u) { // per-uid look: cloth tint, brightness, size
    const S = u.sty; const r = hash(u.uid);
    u.cloth = S.cloth[Math.floor(r * 7.3) % S.cloth.length]; u.sc = 0.93 + hash(u.uid + 191) * 0.14; u.bright = 0.9 + hash(u.uid + 77) * 0.2;
  }

  function stateOf(e) {
    let st = states.get(e.uid);
    if (!st) {
      st = { uid: e.uid, sty: ST[e.kind] || DEFAULT, x: e.x, z: e.z, px: e.x, pz: e.z, py: 0, sx: e.x, sz: e.z, yaw: yawOf(e.face), ph: hash(e.uid) * 6.28, spd: 0, swing: -1, hit: 0, flash: 0, kx: 0, kz: 0, air: 0, vy: 0, spin: 0, seen: 0, node: null, elite: !!e.elite, born: false };
      look(st); states.set(e.uid, st);
    }
    return st;
  }

  const NO_OFF = { x: 0, y: 0, z: 0 }; let followed = false;
  function drawLive(st, e, dt, off) {
    const S = st.sty;
    // the hit flash is a pulse of the picture, timed on the real clock: a hit-stop or an ultimate's held wind-up (juice) would
    // otherwise keep a body burning white for as long as the world stands still
    const J = window.__G && window.__G.juice; st.flash = Math.max(0, st.flash - Math.max(dt, (J && J.realDt) || 0) * 9);
    if (dt > 0.002) {
      // a jump of the sim position in one frame is a shove (knockback, a skill's push): the body is thrown along it
      const jump = Math.hypot(e.x - st.sx, e.z - st.sz); st.sx = e.x; st.sz = e.z;
      if (jump > 0.45 && st.air <= 0 && e.spawnT <= 0 && !e.fly) launch(st, Math.min(1.6, jump));
      const k = 1 - Math.exp(-26 * dt); const bx = st.x; const bz = st.z;
      st.x += (e.x - st.x) * k; st.z += (e.z - st.z) * k;
      st.spd += (Math.min(9, Math.hypot(st.x - bx, st.z - bz) / dt) - st.spd) * Math.min(1, dt * 10);
      st.yaw += wrap(yawOf(e.face) - st.yaw) * Math.min(1, dt * 14);
      st.ph += st.spd * dt * 2.1 * S.sw + (S.mode === 3 ? dt * 9 : 0) + (st.spd < 0.3 ? dt * 0.8 : 0);
      if (st.swing >= 0) { st.swing += dt / 0.36; if (st.swing >= 1) st.swing = -1; }
      st.hit = Math.max(0, st.hit - dt * 5);
      const kd = Math.exp(-10 * dt); st.kx *= kd; st.kz *= kd;
      if (st.air > 0 || st.vy > 0) { st.vy -= 22 * dt; st.air = Math.max(0, st.air + st.vy * dt); st.spin += dt * 12 * Math.sign(st.spin || 1); if (st.air <= 0) { st.vy = 0; st.spin = 0; dust(st.px, st.pz, 1); } }
    }
    let rise = 1; let sink = 0; let ax = 0; let az = 0; let up = 1;
    if (e.spawnT > 0) {
      const ar = arrive(H, e, st.x, st.z); rise = ar.s; sink = ar.y / S.s; ax = ar.ox; az = ar.oz; up = ar.g;
      if (!st.born) { st.born = true; if (sink < -0.2) dust(st.x + off.x, st.z + off.z, 2); }
    }
    const L = hk && hk.lift ? hk.lift(st.uid) : null;
    const y = (e.fly ? (FLY_Y[e.kind] || 3) * up : 0) + sink * S.s + (L ? L.y : 0) + off.y + st.air;
    let tint = ONE;
    if (e.status) { for (const k in e.status) { if (STATUS_TINT[k]) { tint = STATUS_TINT[k]; break; } } }
    // climbing out of the abyss: dark toward the abyss colour while the rise runs
    let fk = 0;
    if (e.spawnT > 0 && H.world) { fk = Math.pow(Math.max(0, e.spawnT) / SPAWN_T, 1.2) * 0.6; const c = H.world.spawnTint; tint = [tint[0] + (Math.min(1.8, c.r * 1.6) - tint[0]) * fk, tint[1] + (Math.min(1.8, c.g * 1.6) - tint[1]) * fk, tint[2] + (Math.min(1.8, c.b * 1.6) - tint[2]) * fk]; }
    const el = st.elite ? ELITE : 1;
    put({ x: st.x + ax + off.x + st.kx + (L ? L.ox : 0), y, z: st.z + az + off.z + st.kz + (L ? L.oz : 0), yaw: st.yaw + (L ? L.yaw : 0), sty: S, sc: st.sc * rise * el, ph: st.ph, swing: st.swing, hit: st.hit, die: 0, fall: L ? L.tilt : 0, flash: st.flash, lean: 0, spin: st.spin, tint, k: st.bright * (st.elite ? 1.18 : 1) * (1 + fk * 0.5), cloth: st.cloth });
    st.sc2 = rise * el; st.px = st.x + ax + off.x + st.kx; st.pz = st.z + az + off.z + st.kz; st.py = y; st.tint = tint;
  }
  function launch(st, k) { st.vy = 4.5 + k * 2.5; st.air = 0.01; st.spin = (hash(st.uid + frame) < 0.5 ? -1 : 1) * 0.1; st.hit = 1; }

  function drawCorpse(c, dt) {
    c.t += dt; const u = c.t / tier.dur; if (u >= 1) return false;
    const S = c.sty; const J = window.__G && window.__G.juice; c.ft = (c.ft || 0) + Math.max(dt, (J && J.realDt) || 0); // flash on the real clock (see drawLive)
    // thrown back along the killing blow, falling over, then coming apart from 30% on
    const push = Math.min(c.t, 0.3);
    let y = c.y; if (c.vy !== 0 || y > 0.01) { c.vy -= 20 * dt; y = c.y = Math.max(0, c.y + c.vy * dt); if (c.y <= 0) c.vy = 0; }
    const fall = S.mode === 3 ? Math.min(1.2, c.t * 3) : Math.min(1.5, c.t * 5.5);
    put({ x: c.x + c.dx * push, y, z: c.z + c.dz * push, yaw: c.yaw, sty: S, sc: c.sc, ph: c.ph, swing: -1, hit: Math.max(0, 1 - c.t * 4), die: Math.max(0, (u - 0.3) / 0.7), fall, flash: Math.max(0, 1 - c.ft * 8), lean: 0, spin: 0, tint: ONE, k: 1, cloth: c.cloth });
    if (!c.smoked && u > 0.35) { c.smoked = true; smoke(c.x + c.dx * push, y, c.z + c.dz * push, S, c.sc); }
    return true;
  }

  function addShard(x, y, z, vx, vy, vz, size, c, life) {
    const i = cbHead; cbHead = (cbHead + 1) % SHARDS;
    cb.x[i] = x; cb.y[i] = y; cb.z[i] = z; cb.vx[i] = vx; cb.vy[i] = vy; cb.vz[i] = vz; cb.size[i] = size; cb.life[i] = life; cb.rot[i] = Math.random() * 6.28;
    cb.col[i * 3] = c.r; cb.col[i * 3 + 1] = c.g; cb.col[i * 3 + 2] = c.b;
  }
  function addSplat(x, z, c, size) {
    const i = spHead; spHead = (spHead + 1) % SPLATS; sp.x[i] = x; sp.z[i] = z; sp.t[i] = 0; sp.size[i] = size; sp.rot[i] = Math.random() * 6.28;
    const dark = 0.55; sp.col[i * 3] = c.r * dark; sp.col[i * 3 + 1] = c.g * dark; sp.col[i * 3 + 2] = c.b * dark;
  }
  // a few dust puffs at the feet (a landing, a body climbing out of the ground)
  function dust(x, z, n) {
    if (!G.fx || !G.fx.puff || smokeBudget <= 0) return; smokeBudget--;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28; G.fx.puff(tmpPos.set(x + F.x + Math.cos(a) * 0.3, 0.15 + F.y, z + F.z + Math.sin(a) * 0.3), { vel: tmpV.set(Math.cos(a) * 1.2, 0.6, Math.sin(a) * 1.2), drag: 2, s0: 0.35, s1: 0.9, life: 0.5, c0: 0x8a7a68, c1: 0x5a5048, a0: 0.5 }); }
  }
  // the body comes apart into a puff of its own colour, dark at the end
  function smoke(x, y, z, S, sc) {
    if (!G.fx || !G.fx.puff || smokeBudget <= 0) return; smokeBudget--;
    const h = S.top * S.s * sc;
    for (let i = 0; i < tier.smoke; i++) G.fx.puff(tmpPos.set(x + F.x, y + F.y + h * (0.25 + 0.3 * i), z + F.z), { vel: tmpV.set((Math.random() - 0.5) * 0.6, 0.9, (Math.random() - 0.5) * 0.6), drag: 1.2, s0: 0.5 * h, s1: 1.1 * h, life: 0.75, c0: S.burst.getHex(), c1: 0x2a2630, a0: 0.55 });
  }

  function die(e) {
    const st = states.get(e.uid); if (!st) return; states.delete(e.uid);
    const by = B && B.byUid.get(e.by); let dx = 0; let dz = 0;
    if (by) { dx = st.px - by.x; dz = st.pz - by.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; } else { const a = Math.random() * 6.28; dx = Math.cos(a); dz = Math.sin(a); }
    if (corpses.length >= CORPSES) corpses.shift();
    // the body falls away from the blow: its yaw turned so its back faces the hit
    const yaw = Math.atan2(-dx, -dz);
    corpses.push({ x: st.px, y: st.py, vy: st.py > 0.2 ? 0 : 0, z: st.pz, yaw, sty: st.sty, sc: st.sc * (st.sc2 || 1), ph: st.ph, t: 0, dx: dx * 1.6, dz: dz * 1.6, cloth: st.cloth, smoked: false });
    nDeaths++; deathsWin.push(clock);
    const crowd = deathsWin.length;
    const n = Math.min(tier.shards, Math.max(1, Math.round(shardBudget / 4)));
    if (shardBudget > 0) {
      shardBudget -= n; const S = st.sty; const h = S.top * S.s * st.sc;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28; const v = 1.4 + Math.random() * 2.4; const sz = (0.1 + Math.random() * 0.1) * S.s;
        addShard(st.px, st.py + h * (0.3 + Math.random() * 0.5), st.pz, Math.cos(a) * v + dx * 2.4, 2.4 + Math.random() * 2.8, Math.sin(a) * v + dz * 2.4, sz, i % 2 ? S.burst : col.setRGB(st.cloth[0] * 0.5, st.cloth[1] * 0.5, st.cloth[2] * 0.5), 0.55 + Math.random() * 0.35);
      }
    }
    if (nDeaths % tier.splatEvery === 0 && st.sty.mode !== 3) addSplat(st.px, st.pz, st.sty.burst, 0.9 + st.sty.s * 0.5);
    // sound: at most about 8 a second, louder when the floor is emptying fast
    while (soundWin.length && clock - soundWin[0] > 1) soundWin.shift();
    if (soundWin.length < 8 && G.audio && G.audio.playAt) { soundWin.push(clock); tmpPos.set(st.px, 0, st.pz); G.audio.playAt('die', tmpPos, { gain: crowd >= 6 ? 0.5 : 0.26 }); }
  }
  const col = new THREE.Color();

  function tickShards(dt) {
    let n = 0;
    for (let i = 0; i < SHARDS; i++) {
      if (cb.life[i] <= 0) continue;
      cb.life[i] -= dt; if (cb.life[i] <= 0) continue;
      cb.vy[i] -= 14 * dt; cb.x[i] += cb.vx[i] * dt; cb.y[i] += cb.vy[i] * dt; cb.z[i] += cb.vz[i] * dt;
      if (cb.y[i] < 0.05) { cb.y[i] = 0.05; cb.vy[i] *= -0.3; cb.vx[i] *= 0.55; cb.vz[i] *= 0.55; }
      const sc = cb.size[i] * Math.min(1, cb.life[i] / 0.25 + 0.05); const r = cb.rot[i] + cb.life[i] * 7;
      Q.makeRotationFromEuler(eul.set(r, r * 0.7, r * 0.4)); Q.scale(V.set(sc, sc, sc)); Q.setPosition(cb.x[i], cb.y[i], cb.z[i]);
      shards.setMatrixAt(n, Q); const a = shards.instanceColor.array; a[n * 3] = cb.col[i * 3]; a[n * 3 + 1] = cb.col[i * 3 + 1]; a[n * 3 + 2] = cb.col[i * 3 + 2]; n++;
    }
    shards.count = n; shards.visible = n > 0; shards.instanceMatrix.needsUpdate = true; shards.instanceColor.needsUpdate = true; stats.cubes = n;
  }
  const eul = new THREE.Euler();
  function tickSplats(dt) {
    let n = 0;
    for (let i = 0; i < SPLATS; i++) {
      if (sp.t[i] > 4) continue; sp.t[i] += dt;
      const sc = sp.size[i] * Math.min(1, sp.t[i] / 0.08 + 0.2) * (sp.t[i] > 3 ? Math.max(0.01, 4 - sp.t[i]) : 1);
      Q.makeRotationY(sp.rot[i]); Q.scale(V.set(sc, 1, sc)); Q.setPosition(sp.x[i], 0.03, sp.z[i]);
      splats.setMatrixAt(n, Q); const a = splats.instanceColor.array; a[n * 3] = sp.col[i * 3]; a[n * 3 + 1] = sp.col[i * 3 + 1]; a[n * 3 + 2] = sp.col[i * 3 + 2]; n++;
    }
    splats.count = n; splats.visible = n > 0; splats.instanceMatrix.needsUpdate = true; splats.instanceColor.needsUpdate = true; stats.splats = n;
  }
  function flush() {
    let nk = 0;
    for (const id of kinds) {
      const S = ST[id]; const m = S.m; const on = S.n > 0;
      m.body.count = m.line.count = S.n; m.body.visible = m.line.visible = on;
      if (!on) continue; nk++;
      m.body.instanceMatrix.needsUpdate = true; m.body.instanceColor.needsUpdate = true;
      for (const a of m.attrs) a.needsUpdate = true;
    }
    stats.kinds = nk;
  }

  const api = {
    meshes: [...meshes, ...extras], stats, states,
    // every enemy but the bosses (actors.js draws those)
    sync(batl, dt, overflow, hooks) {
      B = batl; hk = hooks; frame++; clock += dt; shardBudget = 36; smokeBudget = 6;
      while (deathsWin.length && clock - deathsWin[0] > 0.5) deathsWin.shift();
      for (const id of kinds) ST[id].n = 0;
      let units = 0; let camp = 0;
      const W = H.world;
      if (W && W.follow && !followed) { followed = true; for (const m of [...meshes, ...extras]) W.follow(m); }
      if (W && W.syncFrame) W.syncFrame();
      for (const list of [B.enemies, B.camp || []]) for (const e of list) {
        if (!e.alive || e.boss) continue;
        const off = W && W.roomBase ? W.roomBase(e.room) : NO_OFF; if (!off) continue;
        const st = stateOf(e); st.seen = frame; drawLive(st, e, dt, off); if (list === B.enemies) units++; else camp++;
        if (st.node) st.node.position.set(st.px + F.x, off.y + F.y, st.pz + F.z);
        const sz = st.sty.s * st.sc * (st.elite ? ELITE : 1);
        hooks.blob(st.px + F.x, st.pz + F.z, (st.sty.mode === 2 ? 2.2 : 1.6) * sz, st.py + F.y);
        hooks.rim(st.px + F.x, st.pz + F.z, 0.9 * sz, st.elite);
      }
      for (const [uid, st] of states) if (st.seen !== frame) states.delete(uid);
      for (const w of showcase) { w.st.ph += dt * 4 * w.st.sty.sw; put({ x: w.x, y: w.y, z: w.z, yaw: w.yaw, sty: w.st.sty, sc: w.st.sc, ph: w.st.ph, swing: -1, hit: 0, die: 0, fall: 0, flash: 0, lean: 0, spin: 0, tint: ONE, k: w.st.bright, cloth: w.st.cloth }); }
      for (let i = corpses.length - 1; i >= 0; i--) if (!drawCorpse(corpses[i], dt)) corpses.splice(i, 1);
      flush(); tickShards(dt); tickSplats(dt);
      // units: the enemies of the fight; camp: bodies waiting in rooms ahead
      stats.units = units; stats.camp = camp; stats.corpses = corpses.length;
    },
    onEvent(e) {
      if (e.e === 'spawn') { if (e.gate !== undefined && H.world && H.world.gateFlash && B) H.world.gateFlash(B.wave - 1, e.gate); }
      else if (e.e === 'die') die(e);
      else if (e.e === 'hit') {
        if (e.dot || !e.dmg) return; const st = states.get(e.uid); if (!st) return;
        // recoil away from the hitter; a crit or a blow worth a big share of the body's life throws it
        // an ultimate close-up holds then slows the world (ultcam.js): a full white flash would stand still on screen for half a second
        const J = window.__G && window.__G.juice; st.flash = J && J.ult && (J.ult.active || J.ult.holding()) ? 0.35 : 1; if (st.hit <= 0.3) st.hit = e.crit ? 1 : 0.7;
        const by = B && B.byUid.get(e.by); const u = B && B.byUid.get(e.uid);
        if (by && u) { let dx = u.x - by.x; let dz = u.z - by.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; const k = e.crit ? 0.32 : 0.18; st.kx += dx * k; st.kz += dz * k; }
        if (u && !u.fly && st.air <= 0 && e.dmg >= u.maxHp * 0.35) launch(st, 0.6);
      } else if (e.e === 'attack') { const st = states.get(e.uid); if (st && st.swing < 0) st.swing = 0; }
    },
    has: (uid) => states.has(uid),
    scaleOf: (uid) => { const st = states.get(uid); return st ? st.sty.s * (st.elite ? ELITE : 1) : 1; },
    nodeOf(uid) { const st = states.get(uid); if (!st) return null; if (!st.node) { st.node = new THREE.Object3D(); st.node.position.set(st.px + F.x, F.y, st.pz + F.z); } return st.node; },
    headPos(uid, out) { const st = states.get(uid); return st ? out.set(st.px + F.x, st.py + st.sty.top * st.sty.s * st.sc * (st.elite ? ELITE : 1) + F.y, st.pz + F.z) : null; },
    // test hook: a static pack of one kind, drawn through the same meshes
    showcase(kind, n, cx, cz, cols = 4) {
      showcase = [];
      for (let i = 0; i < (kind ? n : 0); i++) {
        const st = { uid: 9000 + i, sty: ST[kind] || DEFAULT, ph: i * 0.9 }; look(st);
        showcase.push({ st, x: cx + ((i % cols) - (cols - 1) / 2) * 1.1, z: cz + (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * 1.1, y: kind === 'flyer' ? 3 : 0, yaw: 0 });
      }
    },
    kinds,
    // draw calls and triangles the horde meshes cost right now
    cost() { let calls = 0; let tris = 0; for (const m of [...meshes, ...extras]) { if (!m.visible || !m.count) continue; calls++; tris += m.count * (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } return { calls, tris }; },
    clear() { states.clear(); corpses.length = 0; showcase = []; deathsWin = []; soundWin = []; cb.life.fill(0); sp.t.fill(99); for (const m of [...meshes, ...extras]) { m.count = 0; m.visible = false; } for (const id of kinds) ST[id].n = 0; B = null; },
  };
  return api;
}
