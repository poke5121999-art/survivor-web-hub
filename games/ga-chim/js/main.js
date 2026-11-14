// Ga Chìm boot: renderer, quality tier, bake, world, post. Exposes __G, __ready, __setShot, __sim for checks.
import * as THREE from '../vendor/three.module.min.js';
import { Baker } from './bake.js';
import { U, setBaker } from './mats.js';
import { makeSky } from './sky.js';
import { buildLevel } from './level.js';
import { Lights } from './lights.js';
import { Rain } from './rain.js';
import { Post } from './post.js';
import { Weapon } from './weapon.js';
import { Player, Grid } from './player.js';
import { Enemies } from './enemies.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Game, Events } from './game.js';

const params = Object.fromEntries(new URLSearchParams(location.search));
const QUALITY = {
  low: { name: 'low', pr: 0.75, msaa: 0, ao: false, ssr: false, ssrSteps: 16, shadow: 1024, lights: 4, spotShadows: 0, rain: 2500, splashes: 120, tex: 512 },
  medium: { name: 'medium', pr: 1, msaa: 4, ao: true, ssr: true, ssrSteps: 28, shadow: 2048, lights: 6, spotShadows: 0, rain: 5000, splashes: 220, tex: 1024 },
  high: { name: 'high', pr: 1, msaa: 4, ao: true, ssr: true, ssrSteps: 40, shadow: 4096, lights: 8, spotShadows: 1, rain: 8000, splashes: 320, tex: 1024 },
};
function pickQuality() {
  if (params.q && QUALITY[params.q]) return QUALITY[params.q];
  try { const s = JSON.parse(localStorage.getItem('gachim.settings.v1') || '{}'); if (s.q && QUALITY[s.q]) return QUALITY[s.q]; } catch (e) {}
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  return mobile ? QUALITY.low : QUALITY.medium;
}

const G = window.__G = { params, U, quality: pickQuality(), postFx: { flash: 0, hurt: 0 }, errors: [], t: 0, updaters: [] };
window.__errors = G.errors;
const logOnce = new Set();
function guard(tag, fn) { try { fn(); } catch (e) { if (!logOnce.has(tag)) { logOnce.add(tag); console.error(`[loop] ${tag} threw`, e); G.errors.push(tag + ': ' + e.message); } } }

function setStatus(t) { const el = document.getElementById('bootStatus'); if (el) el.textContent = t; }
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function boot() {
  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 is not available');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * G.quality.pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  G.renderer = renderer;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.06, 900);
  G.camera.position.set(-2, 1.65, 40);
  setStatus('Đang nung vật liệu…'); await frame();
  const baker = new Baker(renderer, G.quality.tex); setBaker(baker); G.baker = baker;
  setStatus('Đang dựng bầu trời…'); await frame();
  G.sky = makeSky(G);
  setStatus('Đang dựng nhà ga…'); await frame();
  G.level = buildLevel(G);
  setStatus('Đang thắp đèn…'); await frame();
  G.lights = new Lights(G, G.level.lamps);
  G.level.dryZones.slice(0, 4).forEach((z, i) => {
    const p = new THREE.Vector3().setFromMatrixPosition(z.m); const e = new THREE.Euler().setFromRotationMatrix(z.m);
    const rot = Math.abs(Math.sin(e.y)) > 0.7;
    U.uIndoor.value[i].set(p.x, p.z, (rot ? z.l : z.w) / 2, (rot ? z.w : z.l) / 2); U.uIndoorH.value[i] = z.h;
  });
  G.rain = new Rain(G, G.level.lamps, G.level.dryZones);
  G.post = new Post(G);
  G.weapon = new Weapon(G);
  G.drawViewmodel = () => { const r = G.renderer; const ac = r.autoClear; G.weapon.draw(r); r.autoClear = ac; };
  G.events = new Events();
  G.grid = new Grid(G.level.colliders);
  G.fx = new FX(G);
  G.audio = new Audio(G);
  G.player = new Player(G, G.grid);
  G.enemies = new Enemies(G, G.grid);
  G.puddleAt = (p) => (p.z < -60 && p.z > -115);
  G.game = new Game(G);
  G.updaters.push(['player', (dt) => { if (G.game.state === 'playing' || G.game.state === 'dead') G.player.update(dt, G.weapon); }]);
  G.updaters.push(['combat', (dt) => combat(dt)]);
  G.updaters.push(['weapon', (dt) => {
    const P = G.player;
    // wall check: something within arm's reach in front pulls the gun back
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(G.camera.quaternion);
    const wh = G.grid.ray(G.camera.position, fwd, 1.2);
    const wall = wh ? clampN(1 - (wh.t - 0.45) / 0.55, 0, 1) : 0;
    G.weapon.update(dt, { moving: P.moving, speed: P.speed || 0, sprinting: P.sprinting, ads: P.ads || G.vmAds, lookDX: P.lookDX || 0, lookDY: P.lookDY || 0, grounded: P.grounded !== false, landed: P.landedKick || 0, indoor: isIndoor(G.camera.position), groundAt: (p) => 0, wall, crouch: P.crouch > 0.5 });
    P.landedKick = 0;
  }]);
  G.updaters.push(['enemies', (dt) => { if (G.game.state !== 'title') G.enemies.update(dt, G.player); }]);
  G.updaters.push(['fx', (dt) => G.fx.update(dt)]);
  G.updaters.push(['game', (dt) => G.game.update(dt)]);
  G.updaters.push(['audio', (dt) => G.audio.update(dt, { indoor: isIndoor(G.camera.position), combat: G.game.combat, dead: G.player.dead, hurt: G.game.hurt })]);
  G.updaters.push(['storm', (dt) => storm(dt)]);
  G.updaters.push(['titlecam', (dt, t) => {
    if (G.game.state !== 'title') return;
    const a = t * 0.025;
    G.camera.position.set(-10.4 + Math.sin(a) * 1.5, 1.75 + Math.sin(a * 1.7) * 0.1, 12 - (t * 0.25) % 40);
    G.camera.rotation.set(0.02, 0.18 + Math.sin(a * 0.8) * 0.12, 0, 'YXZ');
    G.weapon.holder.visible = false;
  }]);
  if (params.vmdebug) { const dm = new THREE.MeshBasicMaterial({ color: 0x080808 }); G.weapon.root.traverse((o) => { if (o.isMesh) o.material = dm; }); }
  // debug toggles for isolating artefacts in screenshots
  if (params.nocone) G.lights.cones.visible = false;
  if (params.dry) U.uRain.value = 0;
  if (params.norain) { G.rain.mesh.visible = false; G.rain.splash.visible = false; }
  if (params.norays) G.post.comp.u.uRaysK.value = 0;
  if (params.nofog) G.post.comp.u.uFogD.value = 0;
  if (params.nossr) G.quality.ssr = false;
  if (params.noao) G.quality.ao = false;
  if (params.nobloom) G.post.final.u.uBloomK.value = 0;
  // warm up shader programs so the first real frame does not hitch
  renderer.compile(G.scene, G.camera);
  window.addEventListener('resize', onResize);
  G.ready = true; window.__ready = true;
  document.body.classList.add('ready');
  setStatus('');
  renderer.setAnimationLoop(loop);
}

function onResize() {
  const r = G.renderer; r.setSize(window.innerWidth, window.innerHeight, false);
  G.camera.aspect = window.innerWidth / window.innerHeight; G.camera.updateProjectionMatrix();
  G.post.resize();
}

let last = performance.now();
let manualSteps = 0;
function loop() {
  const now = performance.now();
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (window.__paused) return;
  step(dt);
  render();
}
function step(dt) {
  G.t += dt; U.uTime.value = G.t;
  for (const [tag, fn] of G.updaters) guard(tag, () => fn(dt, G.t));
  guard('lights', () => G.lights.update(dt, G.camera.position));
  guard('rain', () => G.rain.update(dt, G.t, G.camera));
}
function render() {
  guard('render', () => {
    G.camera.updateMatrixWorld();
    G.post.render(() => {
      G.renderer.render(G.scene, G.camera);
      if (G.drawViewmodel) G.drawViewmodel();
    }, G.camera, G.t);
  });
}

const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
function isIndoor(p) {
  for (let i = 0; i < 4; i++) { const z = U.uIndoor.value[i]; if (Math.abs(p.x - z.x) < z.z && Math.abs(p.z - z.y) < z.w && p.y < U.uIndoorH.value[i]) return true; }
  return false;
}

// shooting: hitscan against enemies and level boxes, impacts, tracers, sound
let shotLatch = false;
function combat(dt) {
  const P = G.player, W = G.weapon, A = G.audio;
  if (G.game.state !== 'playing' || P.dead) return;
  for (const ev of P.events) {
    if (Array.isArray(ev) && ev[0] === 'step') A.play('step_' + ev[1], { vol: P.sprinting ? 0.9 : 0.6 });
    else if (ev === 'land') { A.play('thud', { vol: 0.5 }); P.landedKick = 0.8; }
    else if (ev === 'jump') A.play('step_' + P.surface(), { vol: 0.5 });
  }
  P.events.length = 0;
  for (const ev of W.events) {
    if (ev === 'reload') A.play('click', { rate: 0.7 });
    else if (ev === 'magout') A.play('click', { rate: 0.55, vol: 0.8 });
    else if (ev === 'magin') A.play('thud', { rate: 1.8, vol: 0.5 });
    else if (ev === 'reloaded') A.play('click', { rate: 1.2 });
    else if (Array.isArray(ev) && ev[0] === 'shell') A.play('shell', { pos: ev[1], vol: 0.5 });
  }
  W.events.length = 0;
  if (P.keys.has('KeyR')) W.startReload();
  if (P.keys.has('KeyF')) W.startInspect();
  if (P.keys.has('KeyV') && W.startMelee()) {
    A.play('thud', { vol: 0.5, rate: 1.4 });
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(G.camera.quaternion);
    setTimeout(() => { const hit = G.enemies.raycast(G.camera.position, fwd, 2.4); if (hit) { G.enemies.damage(hit.e, 55, fwd, false); G.game.hitmark(!hit.e.alive); A.play('ping', { pos: G.camera.position.clone().addScaledVector(fwd, hit.t), rate: 0.6 }); } }, 160);
  }
  if (P.mouse.l) {
    if (W.ammo === 0 && !W.busy) { if (!shotLatch) { A.play('click', { rate: 1.6 }); W.startReload(); } shotLatch = true; return; }
    const shot = W.fire(G.camera);
    if (shot) {
      P.lastShot = G.t;
      P.recoil.p += shot.recoil.p * 60 * dt * 0 + shot.recoil.p; P.recoil.y += shot.recoil.y;
      A.play('rifle'); A.play('tail', { vol: isIndoor(G.camera.position) ? 0.7 : 1 });
      const o = shot.origin, d = shot.dir; const maxD = 220;
      const he = G.enemies.raycast(o, d, maxD);
      const hw = G.grid.ray(o, d, maxD);
      let gT = d.y < -0.001 ? -o.y / d.y : Infinity;
      const tW = hw ? hw.t : Infinity;
      if (he && he.t < Math.min(tW, gT)) {
        const p = o.clone().addScaledVector(d, he.t);
        G.fx.impact(p, d.clone().negate(), 'metal'); A.play('ping', { pos: p });
        const killed = G.enemies.damage(he.e, 34 * (0.9 + Math.random() * 0.2), d, he.head);
        G.game.hitmark(killed);
        W.tracer(shot.muzzle, p);
      } else if (tW < gT && tW < maxD) {
        const p = o.clone().addScaledVector(d, tW);
        G.fx.impact(p, hw.n, 'metal'); A.play('ping', { pos: p, vol: 0.6 }); W.tracer(shot.muzzle, p);
      } else if (gT < maxD) {
        const p = o.clone().addScaledVector(d, gT);
        const wet = G.puddleAt(p);
        G.fx.impact(p, new THREE.Vector3(0, 1, 0), wet ? 'water' : 'ground'); A.play('thud', { pos: p, vol: 0.4 }); W.tracer(shot.muzzle, p);
      } else W.tracer(shot.muzzle, o.clone().addScaledVector(d, 200));
    }
  } else shotLatch = false;
}

// lightning and thunder at random, re-tinting the sky and the environment
let nextFlash = 8;
function storm(dt) {
  nextFlash -= dt;
  const fx = G.postFx;
  if (nextFlash <= 0) { nextFlash = 14 + Math.random() * 22; fx.flashT = 0.6; G.thunderIn = 0.8 + Math.random() * 2.5; }
  if (fx.flashT > 0) { fx.flashT -= dt; const t = 0.6 - fx.flashT; fx.flash = Math.max(0, Math.sin(t * 40) * Math.exp(-t * 6)) * 1.2; } else fx.flash = 0;
  U.uFlash.value = fx.flash;
  if (G.thunderIn > 0) { G.thunderIn -= dt; if (G.thunderIn <= 0) G.audio.play('thunder', { vol: 0.8 }); }
  // camera shake from explosions
  if (fx.shake > 0) { fx.shake = Math.max(0, fx.shake - dt * 2); const s = fx.shake * 0.02; G.camera.rotation.x += (Math.random() - 0.5) * s; G.camera.rotation.y += (Math.random() - 0.5) * s; }
}

// --- verification hooks
const SHOTS = {
  yard: { p: [-2, 1.7, 40], look: [-6, 1.2, -40] },
  alley: { p: [-10.4, 1.7, 8], look: [-10, 2.2, -60] },
  flood: { p: [-4.6, 1.7, -60], look: [-2, 1.5, -130] },
  platform: { p: [13, 2.7, -10], look: [10, 2.0, -70] },
  shed: { p: [-46, 1.7, 30], look: [-46, 2.0, -6] },
  boxcar: { p: [-15, 1.7, 9], look: [-22, 2.6, 2] },
  sky: { p: [-2, 1.7, 20], look: [-30, 10, -200] },
  gun: { p: [-10.4, 1.7, 14], look: [-10.4, 1.6, -30] },
  gunads: { p: [-10.4, 1.7, 14], look: [-10.4, 1.6, -30], ads: true },
  wall: { p: [-17.0, 1.7, 9], look: [-24, 1.6, 9] },
};
window.__setShot = (name) => {
  const s = SHOTS[name] || name;
  const P = G.player;
  P.pos.set(s.p[0], s.p[1] - 1.62 > 0.5 ? s.p[1] - 1.62 : 0, s.p[2]);
  const d = new THREE.Vector3(...s.look).sub(new THREE.Vector3(...s.p));
  P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); P.camY = P.eye;
  P.applyCam(1); G.camera.updateMatrixWorld();
  G.vmAds = !!s.ads; G.weapon.holder.visible = true;
  if (G.game.state === 'title') { G.game.state = 'playing'; document.body.classList.remove('title'); document.body.classList.add('playing'); }
  if (G.onShot) G.onShot(s);
};
window.__fire = (n) => { G.player.mouse.l = true; for (let i = 0; i < n; i++) step(1 / 60); G.player.mouse.l = false; render(); };
window.__sim = (sec) => { const n = Math.ceil(sec / (1 / 60)); for (let i = 0; i < n; i++) step(1 / 60); render(); };

boot().catch((e) => {
  console.error('[boot] failed', e);
  const f = document.getElementById('fatal'); if (f) { f.style.display = 'block'; f.textContent = 'Không khởi động được: ' + (e && e.stack || e); }
  window.__fatal = String(e && e.stack || e);
});
