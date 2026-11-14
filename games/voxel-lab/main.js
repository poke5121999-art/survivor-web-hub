// Voxel Lab - page: model picker, tools, cameras, stats, audio hookup and the test hook window.__lab.
// Techniques studied from Voxel Engine by mattshumer (spawn.co): fixed 1/60 s step with dropped time instead of a
// death spiral, events as the single bus to audio / camera feel, a ?harness mode stepped by hand
// (analysis/overview.md §4, §8; game-feel.md shake numbers). Code is our own.
import { LabRenderer, THREE } from './lib/render/renderer.js';
import { World, WX, WY, WZ, GY, SIM_DT } from './lib/sim/world.js';
import { TOOLS, useTool } from './lib/sim/tools.js';
import { Mobs, MOB_DEFS } from './lib/mob/mobs.js';
import { BUILDINGS, PROPS, GENERATORS } from './lib/build/index.js';
import { createAudio } from './lib/audio/index.js';
import { audioClass, flags, F } from './lib/materials.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const harness = params.has('harness');
const errors = [];
window.addEventListener('error', e => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', e => errors.push(String(e.reason)));

const canvas = $('view');
const world = new World();
const R = new LabRenderer(canvas, WX, WY, WZ);
let worldView = R.addView(world.grid);
const mobs = new Mobs(world, R);
const audio = createAudio({ classOf: id => audioClass[id] || 'stone', isLoose: id => !!(flags[id] & F.GRANULAR) });

world.hooks.bodyAdded = b => { b.view = R.addView(b.grid, b.pat); syncBody(b); };
world.hooks.bodyRemoved = b => { if (b.view) { R.removeView(b.view); b.view = null; } };
world.hooks.reset = () => {
  R.removeView(worldView); worldView = R.addView(world.grid);
  R.dens.fill(0); R.densFull = true; R.sky.fill(255); R.skyDirty = [0, 0, R.KX, R.KZ, R.KY]; R.clearScorch();
  mobs.clear();
};
world.hooks.scorch = (x, y, z, reach) => R.addScorch(x, y, z, reach);
world.hooks.flash = (x, y, z, s) => { const d = R.camera.position.distanceTo(new THREE.Vector3(x, y, z)); R.flash = Math.max(R.flash, Math.min(1.2, s * 3 / (4 + d))); };
function syncBody(b) { const g = b.view.group; g.position.set(b.o[0], b.o[1], b.o[2]); g.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]); }

// ---------------------------------------------------------------- state
const S = { tool: 'grenade', slow: false, fps: false, quality: 'med', sound: true, shake: 0, timeScale: 1, simSpeed: 1 };
const orbit = { tx: WX * 0.05, ty: 4, tz: 15, yaw: Math.PI + 0.55, pitch: 0.32, dist: 34 };
const player = { x: WX * 0.05, y: GY * 0.1, z: 4, yaw: 0, pitch: 0, vy: 0, grounded: false };
const keys = {};
const focus = new THREE.Vector3();
let fpsAvg = 60, simMs = 0;

// projectile props (grenade, satchel, rocket) and wrecking-ball ropes
const projMeshes = []; const projMat = { g: new THREE.MeshBasicMaterial({ color: 0x1c2a16 }), s: new THREE.MeshBasicMaterial({ color: 0x3a1410 }), r: new THREE.MeshBasicMaterial({ color: 0x33373c }) };
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const ropeMat = new THREE.LineBasicMaterial({ color: 0x08090a }); const ropes = [];

// ---------------------------------------------------------------- spawning
const STAGE = { x: WX / 2, z: 150 };
function frame(cx, cy, cz, size) { orbit.tx = cx; orbit.ty = cy; orbit.tz = cz; orbit.dist = size; orbit.yaw = Math.PI + 0.6; orbit.pitch = 0.28; player.x = cx; player.z = cz - size * 0.8; player.y = GY * 0.1; player.yaw = 0; player.pitch = 0.1; }
function spawn(id, seed = 1, keep = false) {
  const gen = GENERATORS.find(g => g.id === id), mdef = MOB_DEFS.find(m => m.id === id);
  if (!gen && !mdef) return null;
  if (!keep) world.reset();
  if (gen) {
    const c = gen.build(seed), ox = Math.round(STAGE.x - c.sx / 2), oz = Math.round(STAGE.z - c.sz / 2);
    world.place(c, ox, oz, 0, gen.id);
    const info = { id, seed, x: (ox + c.sx / 2) * 0.1, y: GY * 0.1, z: (oz + c.sz / 2) * 0.1, sx: c.sx * 0.1, sy: c.sy * 0.1, sz: c.sz * 0.1, x0: ox * 0.1, z0: oz * 0.1, voxels: c.count() };
    frame(info.x, GY * 0.1 + info.sy * 0.42, info.z, Math.max(info.sx, info.sy * 1.15, info.sz) * 1.25 + 5);
    return info;
  }
  const n = keep ? mobs.list.length : 0;
  const m = mobs.spawn(id, STAGE.x * 0.1 + (n % 6) * 1.8 - (keep ? 4 : 0), STAGE.z * 0.1 - 2 - Math.floor(n / 6) * 2, seed, Math.PI);
  if (!keep) frame(m.x, m.y + 1.2, m.z, 6.5);
  return { id, seed, x: m.x, y: m.y, z: m.z, mob: true };
}
function spawnRow(seed = 1) {
  world.reset();
  let x = 20, z = 10, rowD = 0; const placed = [];
  for (const gen of GENERATORS) {
    const c = gen.build(seed);
    if (x + c.sx > WX - 20) { x = 20; z += rowD + 44; rowD = 0; }
    if (z + c.sz > WZ - 6) continue;
    world.place(c, x, z, 0, gen.id);
    placed.push({ id: gen.id, x: (x + c.sx / 2) * 0.1, z: (z + c.sz / 2) * 0.1, sx: c.sx * 0.1, sy: c.sy * 0.1, sz: c.sz * 0.1 });
    x += c.sx + 26; rowD = Math.max(rowD, c.sz);
  }
  MOB_DEFS.forEach((d, i) => { for (let k = 0; k < 2; k++) mobs.spawn(d.id, 30 + i * 9 + k * 2.5, 16.8 + k * 1.2, seed + k, Math.PI); });
  orbit.tx = WX * 0.05; orbit.ty = 5; orbit.tz = 14; orbit.dist = 62; orbit.yaw = Math.PI + 0.35; orbit.pitch = 0.42;
  player.x = WX * 0.05; player.z = 17; player.y = GY * 0.1;
  return placed;
}

// ---------------------------------------------------------------- camera
const camDir = new THREE.Vector3();
function updateCamera(dt) {
  const cam = R.camera;
  if (S.fps) {
    cam.fov = 75; cam.position.set(player.x, player.y + 1.6, player.z);
    camDir.set(Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch));
    focus.copy(cam.position).addScaledVector(camDir, 8);
    cam.lookAt(cam.position.x + camDir.x, cam.position.y + camDir.y, cam.position.z + camDir.z);
  } else {
    cam.fov = 55; const cp = Math.cos(orbit.pitch);
    cam.position.set(orbit.tx + Math.sin(orbit.yaw) * cp * orbit.dist, Math.max(GY * 0.1 + 0.3, orbit.ty + Math.sin(orbit.pitch) * orbit.dist), orbit.tz + Math.cos(orbit.yaw) * cp * orbit.dist);
    cam.lookAt(orbit.tx, orbit.ty, orbit.tz); focus.set(orbit.tx, 0, orbit.tz);
  }
  if (S.shake > 0.001) { const s = S.shake, t = performance.now() * 0.06; cam.position.x += Math.sin(t * 1.7) * s * 0.12; cam.position.y += Math.sin(t * 2.3 + 1) * s * 0.12; cam.rotation.z += Math.sin(t * 1.3) * s * 0.012; S.shake *= Math.exp(-dt * 5); }
  cam.updateProjectionMatrix(); cam.updateMatrixWorld();
}
function rayFromScreen(px, py) {
  const r = canvas.getBoundingClientRect(), v = new THREE.Vector3((px - r.left) / r.width * 2 - 1, -((py - r.top) / r.height) * 2 + 1, 0.5).unproject(R.camera);
  const o = R.camera.position; v.sub(o).normalize(); return [o.x, o.y, o.z, v.x, v.y, v.z];
}
function fire(px, py) {
  audio.start();
  const ray = S.fps ? [R.camera.position.x, R.camera.position.y, R.camera.position.z, camDir.x, camDir.y, camDir.z] : rayFromScreen(px, py);
  useTool(S.tool, world, mobs, ...ray, S.fps);
  $('hint').style.opacity = 0;
}

// first-person walk: axis-separated box against the voxel grid, 0.35 m step-up
function stepPlayer(dt) {
  const g = world.grid, sp = keys.ShiftLeft ? 7 : 4;
  let mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + stick.x, mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - stick.y;
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  const vx = (fx * mz - fz * mx) * sp, vz = (fz * mz + fx * mx) * sp;
  const blocked = (x, z) => { for (let y = player.y + 0.45; y < player.y + 1.75; y += 0.25) for (const [ox, oz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) if (g.get(Math.floor((x + ox) * 10), Math.floor(y * 10), Math.floor((z + oz) * 10))) return true; return false; };
  const nx = Math.min(WX * 0.1 - 1, Math.max(1, player.x + vx * dt)); if (!blocked(nx, player.z)) player.x = nx;
  const nz = Math.min(WZ * 0.1 - 1, Math.max(1, player.z + vz * dt)); if (!blocked(player.x, nz)) player.z = nz;
  let gy = 0; for (const [ox, oz] of [[0, 0], [-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) gy = Math.max(gy, world.groundY(Math.floor((player.x + ox) * 10), Math.floor((player.z + oz) * 10), Math.floor((player.y + 0.4) * 10)) * 0.1);
  if (player.grounded && (keys.Space || jumpReq)) { player.vy = 4.6; player.grounded = false; } jumpReq = false;
  player.vy -= 9.81 * dt; player.y += player.vy * dt;
  if (player.y <= gy) { player.y = gy; player.vy = 0; player.grounded = true; } else if (player.y > gy + 0.05) player.grounded = false;
}

// ---------------------------------------------------------------- events -> audio and camera feel
function consumeEvents(dt) {
  const ev = world.events, cam = R.camera.position;
  for (const e of ev) {
    if (e.kind === 'explosion') { const yieldv = e.mag * e.a, reach = 6 + 9 * e.mag, d = Math.hypot(e.x - cam.x, e.y - cam.y, e.z - cam.z), f = Math.max(0, 1 - d / reach); S.shake = Math.max(S.shake, (0.45 + 0.35 * yieldv) * f * f * (S.fps ? 1 : 0.5)); }
    else if (e.kind === 'thud') { const d = Math.hypot(e.x - cam.x, e.y - cam.y, e.z - cam.z); S.shake = Math.max(S.shake, Math.min(e.mag / 30000, 1) * 0.6 * Math.max(0, 1 - d / 40)); }
  }
  if (S.sound) { const f = camDir.set(0, 0, -1).applyQuaternion(R.camera.quaternion); audio.setListener(cam.x, cam.y, cam.z, f.x, f.y, f.z); audio.handleEvents(ev, dt); const fa = world.fireAt || [0, 0, 0]; audio.setFire(Math.min(1, world.fire.size / 750), fa[0], fa[1], fa[2]); }
  if (S.fps) camDir.set(Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch));
  ev.length = 0;
}

// ---------------------------------------------------------------- frame
function simStep(n) {
  for (let i = 0; i < n; i++) { world.tick(); mobs.update(SIM_DT, $('wander').checked); }
}
function draw(dt = 1 / 60) {
  for (const b of world.bodies.list) if (b.view) syncBody(b);
  const D = world.d; R.setDebris(D.n, D.px, D.py, D.pz, D.q, D.size, D.mat); R.setSprites(world.nSp, world.sp);
  // projectiles and ropes
  let pi = 0; for (const p of world.projectiles) { let m = projMeshes[pi]; if (!m) { m = projMeshes[pi] = new THREE.Mesh(boxGeo, projMat.g); R.scene.add(m); } pi++; m.visible = true; m.material = p.isRocket ? projMat.r : p.sticky ? projMat.s : projMat.g; const s = p.isRocket ? 0.16 : p.size; m.scale.set(s, s, p.isRocket ? 0.6 : s); m.position.set(p.x, p.y, p.z); if (p.isRocket) m.lookAt(p.x + p.dx, p.y + p.dy, p.z + p.dz); }
  for (; pi < projMeshes.length; pi++) projMeshes[pi].visible = false;
  let ri = 0; for (const b of world.bodies.list) if (b.rope) { let ln = ropes[ri]; if (!ln) { ln = ropes[ri] = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), ropeMat); ln.frustumCulled = false; R.scene.add(ln); } ri++; ln.visible = true; const a = ln.geometry.attributes.position; a.setXYZ(0, b.rope.ax, b.rope.ay, b.rope.az); a.setXYZ(1, b.x, b.y, b.z); a.needsUpdate = true; }
  for (; ri < ropes.length; ri++) ropes[ri].visible = false;
  updateCamera(dt);
  consumeEvents(dt);
  const moving = world.bodies.list.length > 0 || D.n > 0 || mobs.list.length > 0 || world.projectiles.length > 0;
  R.render(dt, focus, world.grid, moving);
}
let last = performance.now(), acc = 0, statT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  fpsAvg += (1 / Math.max(dt, 1e-3) - fpsAvg) * 0.05;
  if (S.fps) stepPlayer(dt);
  holdFire(now);
  if (!harness) {
    // fixed step; a sim that cannot keep up runs fewer steps and drops the rest: slow motion, never a slideshow
    acc += dt * (S.slow ? 0.2 : 1); let n = 0; const t0 = performance.now();
    while (acc >= SIM_DT && n < 4) { simStep(1); acc -= SIM_DT; n++; if (performance.now() - t0 > 14) break; }
    if (acc > SIM_DT * 2.5) acc = 0; // drop the time we could not simulate
    simMs += (performance.now() - t0 - simMs) * 0.1;
  }
  draw(dt);
  if (now - statT > 250) { statT = now; showStats(); }
}
function stats() {
  const L = world.ledger();
  return { voxels: L.world, bodies: world.bodies.list.length, awake: world.bodies.awake(), debris: world.d.n, sprites: world.nSp, fractures: world.stats.fractures, detached: world.stats.detached, ratio: +world.stats.maxRatio.toFixed(2), burning: world.fire.size, mobs: mobs.list.length, killed: mobs.killed, fps: +fpsAvg.toFixed(1), simMs: +simMs.toFixed(1), quads: R.stats.quads, draws: R.stats.draws, remeshLeft: R.stats.remeshLeft, leak: L.leak, step: world.step };
}
function showStats() {
  const s = stats();
  $('stats').innerHTML = `Voxel    <b>${(s.voxels / 1e6).toFixed(2)}M</b>\nVật rơi  <b>${s.bodies}</b>\nMảnh vụn <b>${s.debris}</b>\nNứt gãy  <b>${s.fractures}</b>\nTách rời <b>${s.detached}</b>\nỨng suất <b>${s.ratio}</b>\nĐang cháy <b>${s.burning}</b>\nSinh vật <b>${s.mobs}</b>\nFPS      <b>${s.fps.toFixed(0)}</b>`;
}

// ---------------------------------------------------------------- UI
function mkList(el, items) { for (const it of items) { const b = document.createElement('button'); b.textContent = it.name; b.onclick = () => { audio.start(); spawn(it.id, +$('seed').value || 0, $('keep').checked); if (innerWidth < 700) $('picker').classList.add('hidden'); }; el.appendChild(b); } }
mkList($('listBuild'), BUILDINGS); mkList($('listProp'), PROPS); mkList($('listMob'), MOB_DEFS);
for (const t of TOOLS) { const b = document.createElement('button'); b.textContent = t.name; b.dataset.tool = t.id; b.onclick = () => setTool(t.id); $('tools').appendChild(b); }
function setTool(id) { S.tool = id; for (const b of $('tools').children) b.classList.toggle('on', b.dataset.tool === id); }
setTool(S.tool);
$('btnPicker').onclick = () => $('picker').classList.toggle('hidden');
$('btnReset').onclick = () => { world.reset(); };
$('btnDice').onclick = () => { $('seed').value = Math.floor(Math.random() * 9999); };
$('btnRow').onclick = () => { audio.start(); spawnRow(+$('seed').value || 1); if (innerWidth < 700) $('picker').classList.add('hidden'); };
$('btnSlow').onclick = e => { S.slow = !S.slow; e.target.classList.toggle('on', S.slow); };
$('btnSound').onclick = e => { S.sound = !S.sound; audio.setMuted(!S.sound); e.target.textContent = 'Âm thanh: ' + (S.sound ? 'bật' : 'tắt'); };
const QN = { low: 'thấp', med: 'vừa', high: 'cao' };
function setQuality(q) { S.quality = q; R.setQuality(q); world.fx = q === 'low' ? 0.5 : q === 'med' ? 1 : 1.3; $('btnQuality').textContent = 'Chất lượng: ' + QN[q]; }
$('btnQuality').onclick = () => setQuality(S.quality === 'low' ? 'med' : S.quality === 'med' ? 'high' : 'low');
const touch = matchMedia('(pointer: coarse)').matches;
function setFps(on) { S.fps = on; document.body.classList.toggle('fps', on); $('btnView').textContent = 'Góc nhìn: ' + (on ? 'ngôi thứ nhất' : 'quay quanh'); $('touchFps').classList.toggle('hidden', !(on && touch)); if (!on && document.pointerLockElement) document.exitPointerLock(); }
$('btnView').onclick = () => setFps(!S.fps);

// pointer: tap = use tool, drag = rotate, right / two fingers = pan, wheel / pinch = zoom
const ptr = new Map(); let dragged = false, downT = 0, holdT = 0, holdP = null, pinch = 0;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  audio.start();
  if (S.fps && !touch) { if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; } fire(); holdP = { x: 0, y: 0 }; holdT = performance.now() + 250; return; }
  canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button });
  dragged = false; downT = performance.now(); holdP = { x: e.clientX, y: e.clientY }; holdT = downT + 280; pinch = 0;
});
canvas.addEventListener('pointermove', e => {
  if (S.fps && document.pointerLockElement === canvas) { player.yaw -= e.movementX * 0.0024; player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - e.movementY * 0.0024)); return; }
  const p = ptr.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (!dragged && Math.hypot(e.clientX - holdP.x, e.clientY - holdP.y) > 7) dragged = true;
  if (S.fps) { if (dragged) { player.yaw -= dx * 0.005; player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - dy * 0.005)); } p.x = e.clientX; p.y = e.clientY; return; }
  if (ptr.size === 2) {
    const [a, b] = [...ptr.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y); p.x = e.clientX; p.y = e.clientY; const d1 = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) orbit.dist = Math.min(140, Math.max(2, orbit.dist * d0 / Math.max(d1, 1))); pinch = 1; pan(dx * 0.5, dy * 0.5); dragged = true; return;
  }
  if (dragged) { if (p.b === 2 || p.b === 1) pan(dx, dy); else { orbit.yaw -= dx * 0.006; orbit.pitch = Math.max(-0.05, Math.min(1.5, orbit.pitch + dy * 0.006)); } }
  p.x = e.clientX; p.y = e.clientY; if (dragged) holdP = null; else holdP = { x: e.clientX, y: e.clientY };
});
function pan(dx, dy) { const k = orbit.dist * 0.0016, sy = Math.sin(orbit.yaw), cy = Math.cos(orbit.yaw); orbit.tx -= (cy * dx + sy * dy * 0) * k; orbit.tz += sy * dx * k; orbit.ty = Math.max(0.5, orbit.ty + dy * k); }
const endPtr = e => {
  if (S.fps && !touch) { holdP = null; return; }
  const p = ptr.get(e.pointerId); if (!p) return; ptr.delete(e.pointerId);
  if (!dragged && p.b === 0 && performance.now() - downT < 280 && !(S.fps && touch)) fire(e.clientX, e.clientY);
  holdP = null;
};
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', e => { e.preventDefault(); orbit.dist = Math.min(140, Math.max(2, orbit.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
function holdFire(now) { // held without dragging: repeat tools that have a rate
  const t = TOOLS.find(t => t.id === S.tool);
  if (holdP && !dragged && t.hold && now >= holdT && (!S.fps || !touch || fireHeld)) { fire(holdP.x, holdP.y); holdT = now + t.hold * 1000; }
  if (fireHeld && now >= holdT) { fire(); holdT = now + (t.hold || 0.5) * 1000; }
}
addEventListener('keydown', e => { keys[e.code] = true; const i = '12345678'.indexOf(e.key); if (i >= 0 && TOOLS[i]) setTool(TOOLS[i].id); if (e.code === 'KeyV') setFps(!S.fps); if (e.code === 'KeyR') world.reset(); });
addEventListener('keyup', e => { keys[e.code] = false; });
// touch first-person controls
const stick = { x: 0, y: 0 }; let jumpReq = false, fireHeld = false;
{
  const st = $('stick'), kn = $('knob'); let id = -1;
  const mv = e => { const r = st.getBoundingClientRect(); let x = (e.clientX - r.left - 55) / 45, y = (e.clientY - r.top - 55) / 45; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } stick.x = x; stick.y = y; kn.style.transform = `translate(${x * 35}px, ${y * 35}px)`; };
  st.addEventListener('pointerdown', e => { id = e.pointerId; st.setPointerCapture(id); mv(e); });
  st.addEventListener('pointermove', e => { if (e.pointerId === id) mv(e); });
  const up = () => { id = -1; stick.x = stick.y = 0; kn.style.transform = ''; };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
  $('btnJump').addEventListener('pointerdown', () => { jumpReq = true; });
  $('btnFire').addEventListener('pointerdown', () => { fireHeld = true; holdT = 0; });
  $('btnFire').addEventListener('pointerup', () => { fireHeld = false; }); $('btnFire').addEventListener('pointercancel', () => { fireHeld = false; });
}
if (innerWidth >= 700) $('picker').classList.remove('hidden');
if (params.get('quality')) setQuality(params.get('quality')); else setQuality(touch ? 'low' : 'med');

// ---------------------------------------------------------------- start
if (params.get('row')) spawnRow(+params.get('seed') || 1); else spawn(params.get('model') || 'brick-house', +params.get('seed') || 1);
if (harness) { document.body.classList.add('harness'); for (const id of ['top', 'picker', 'stats', 'hint', 'tools']) $(id).classList.add('hidden'); }
requestAnimationFrame(loop);

/** test hook (the reference's ?harness idea): step by hand, draw, place the camera, spawn and destroy */
window.__lab = {
  ready: true, world, R, mobs, audio, errors, S, orbit, player,
  buildings: BUILDINGS.map(b => b.id), props: PROPS.map(b => b.id), mobIds: MOB_DEFS.map(b => b.id),
  step: n => simStep(n), draw: () => draw(1 / 60), stats, spawn, spawnRow, reset: () => world.reset(),
  /** remesh everything that is dirty now (blocks) */
  settle: () => { for (let i = 0; i < 400; i++) { let left = 0; for (const v of R.views) left += v.grid.dirtyList.length; left += world.grid.densList.length; if (!left) break; R.remeshBudget = 200; draw(1 / 60); } R.skyLast = 0; draw(1 / 60); draw(1 / 60); R.setQuality(S.quality); },
  setCamera: (px, py, pz, tx, ty, tz) => { setFps(false); const dx = px - tx, dy = py - ty, dz = pz - tz, d = Math.hypot(dx, dy, dz); orbit.tx = tx; orbit.ty = ty; orbit.tz = tz; orbit.dist = d; orbit.pitch = Math.asin(dy / d); orbit.yaw = Math.atan2(dx, dz); },
  explode: (x, y, z, r, p = 1, k = 0) => world.explode(x, y, z, r, p, k),
  tool: (id, ox, oy, oz, dx, dy, dz) => { const l = Math.hypot(dx, dy, dz); return !!useTool(id, world, mobs, ox, oy, oz, dx / l, dy / l, dz / l, false); },
  setQuality, setTool,
};
