import * as THREE from '../vendor/three.module.min.js';
import { PLAYER, FLASHLIGHT, LOOT, COFFIN, TOAD, PUPPET, SPIKES, CROSSBOW, EXTRACT, SAVE_KEY } from './data.js';

const REV = '20261104a';
const $ = (id) => document.getElementById(id);
const S = 12, WALL_T = 0.5, WALL_H = 3.4, DOOR_W = 3.2;

// ---------- save ----------
const blank = () => ({ bank: 0, runs: 0, out: 0, dead: 0, best: 0 });
function loadSave() { try { return Object.assign(blank(), JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { return blank(); } }
function writeSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ } }
let save = loadSave();

// ---------- layout: 4 rooms, A-B-C-D ----------
const ROOMS = { A: [0, 0], B: [1, 0], C: [1, 1], D: [2, 1] };
const LINKS = [['A', 'B'], ['B', 'C'], ['C', 'D']];
const center = (k) => [ROOMS[k][0] * S, ROOMS[k][1] * S];
const roomAt = (x, z) => { for (const k in ROOMS) { const [cx, cz] = center(k); if (Math.abs(x - cx) < S / 2 && Math.abs(z - cz) < S / 2) return k; } return null; };

// ---------- three setup ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040306);
scene.fog = new THREE.FogExp2(0x040306, 0.055);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 80);
camera.rotation.order = 'YXZ';
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
scene.add(new THREE.AmbientLight(0x2a2a3a, 0.35));
const torch = new THREE.SpotLight(0xffe2a8, 90, FLASHLIGHT.range, FLASHLIGHT.angle, 0.55, 1.4);
const torchTarget = new THREE.Object3D(); scene.add(torch, torchTarget); torch.target = torchTarget;
const glow = new THREE.PointLight(0xffe2a8, 0.0, 6, 2); scene.add(glow); // faint halo around you when torch is on

// PLACEHOLDER stone: the real tile art (DG_* wall/floor) was not extracted yet, so walls are a procedural texture.
function stoneTex(base, line) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const v = 40 + Math.random() * 40; g.fillStyle = `rgba(${v},${v - 6},${v - 14},.18)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 2 + Math.random() * 4); }
  g.strokeStyle = line; g.lineWidth = 3;
  for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); for (let x = (y / 64 % 2) * 64; x < 256; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const wallMat = new THREE.MeshStandardMaterial({ map: stoneTex('#3b352d', '#15120e'), roughness: 0.95 });
const floorMat = new THREE.MeshStandardMaterial({ map: stoneTex('#2c2823', '#100e0b'), roughness: 1 });
const ceilMat = new THREE.MeshStandardMaterial({ color: 0x1b1814, roughness: 1 });
wallMat.map.repeat.set(3, 1); floorMat.map.repeat.set(6, 6);

// ---------- world build ----------
const colliders = [];   // {x0,x1,z0,z1,kind}
const world = new THREE.Group(); scene.add(world);
function addWall(x0, x1, z0, z1) {
  colliders.push({ x0, x1, z0, z1, kind: 'wall' });
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, WALL_H, z1 - z0), wallMat);
  m.position.set((x0 + x1) / 2, WALL_H / 2, (z0 + z1) / 2); world.add(m);
}
function buildWorld() {
  const done = new Set();
  const linked = (a, b) => LINKS.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  for (const k in ROOMS) {
    const [cx, cz] = center(k), h = S / 2;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(S, S), floorMat); fl.rotation.x = -Math.PI / 2; fl.position.set(cx, 0, cz); world.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(S, S), ceilMat); ce.rotation.x = Math.PI / 2; ce.position.set(cx, WALL_H, cz); world.add(ce);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = Object.keys(ROOMS).find((n) => ROOMS[n][0] === ROOMS[k][0] + dx && ROOMS[n][1] === ROOMS[k][1] + dz);
      const key = nk ? [k, nk].sort().join('') : k + dx + dz;
      if (done.has(key)) continue; done.add(key);
      const open = nk && linked(k, nk);
      const t = WALL_T / 2;
      if (dx) { // wall along z at x = cx + dx*h
        const x = cx + dx * h;
        if (open) { addWall(x - t, x + t, cz - h - t, cz - DOOR_W / 2); addWall(x - t, x + t, cz + DOOR_W / 2, cz + h + t); }
        else addWall(x - t, x + t, cz - h - t, cz + h + t);
      } else {
        const z = cz + dz * h;
        if (open) { addWall(cx - h - t, cx - DOOR_W / 2, z - t, z + t); addWall(cx + DOOR_W / 2, cx + h + t, z - t, z + t); }
        else addWall(cx - h - t, cx + h + t, z - t, z + t);
      }
    }
  }
}
buildWorld();
const WALL_COUNT = colliders.length;

// ---------- real meshes ----------
async function loadMesh(name, opt = {}) {
  const j = await (await fetch(`art/${name}.json?v=${REV}`)).json();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(j.p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(j.u, 2));
  g.setIndex(j.i); g.computeVertexNormals(); g.computeBoundingBox();
  const tex = await new Promise((res) => new THREE.TextureLoader().load(`art/${name}.jpg?v=${REV}`, res));
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: opt.rough ?? 0.8, metalness: opt.metal ?? 0, side: THREE.DoubleSide });
  return { geo: g, mat };
}
let ART = {};

// ---------- game state ----------
const G = {
  mode: 'menu', t: 0, hp: PLAYER.hp, bat: FLASHLIGHT.seconds, torchOn: true,
  pos: new THREE.Vector3(1, 0, 1), yaw: 0, pitch: 0, vel: new THREE.Vector3(),
  carried: [], lootValue: 0, shovelCd: 0, hold: 0, holdTarget: null, dmgFlash: 0, msg: '', msgT: 0,
  keys: {}, extract: { x: -3.5, z: -3.5, r: 1.7 }, stats: { spikes: 0, arrows: 0, toad: 0, puppet: 0 }, cause: '',
  coffins: [], pickups: [], spikes: [], bow: null, toad: null, puppet: null, tracers: [], swung: false, seenPuppet: false,
};
const dyn = new THREE.Group(); scene.add(dyn);
const hitVec = new THREE.Vector3();

function clearRun() { while (dyn.children.length) dyn.remove(dyn.children[0]); colliders.length = WALL_COUNT; }
function say(t, s = 2.6) { G.msg = t; G.msgT = s; }

function addBox(x, z, w, d, kind) { colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, kind }); }

function lootMesh(color) {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.7 }));
  return m;
}
const lootColor = (id) => (LOOT[id].value >= 100000 ? 0xff5a3c : LOOT[id].value >= 20000 ? 0xe6b84a : LOOT[id].value >= 5000 ? 0xb88cff : 0xdadada);
function addPickup(id, x, z, extra = {}) {
  const mesh = lootMesh(lootColor(id)); mesh.position.set(x, 0.55, z); dyn.add(mesh);
  const p = Object.assign({ id, x, z, mesh, taken: false }, extra); G.pickups.push(p); return p;
}

function buildRun() {
  clearRun(); G.coffins = []; G.pickups = []; G.spikes = []; G.tracers = []; G.toad = null; G.puppet = null; G.bow = null;
  // coffins (REAL mesh DG_BronzeCoffin01A_MD + texture)
  for (const [x, z, rot] of [[14.6, 16.2, 0.3], [27.8, 7.6, 1.57], [28.2, 16.6, -1.2]]) {
    const m = new THREE.Mesh(ART.coffin.geo, ART.coffin.mat);
    m.scale.setScalar(2.4 / (ART.coffin.geo.boundingBox.max.x - ART.coffin.geo.boundingBox.min.x));
    m.position.set(x, 0, z); m.rotation.y = rot; dyn.add(m);
    addBox(x, z, 2.3, 1.2, 'coffin');
    G.coffins.push({ x, z, mesh: m, open: false });
  }
  // loose loot (real names/values)
  addPickup('lantern', 14.6, -3.6); addPickup('abacus', 8.2, -4.2); addPickup('mirror', 21.4, 8.6); addPickup('bracelet', 7.4, 17.8);
  // toad mound guarding the Ghost Seal (wiki: "a Ghost Seal next to a croaking mound")
  const mx = 9.4, mz = 15.4;
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1 }));
  mound.scale.set(1.2, 0.8, 1.2); mound.position.set(mx, 0, mz); dyn.add(mound);
  const tm = new THREE.Mesh(ART.toad.geo, ART.toad.mat); tm.position.set(mx, -2.4, mz); dyn.add(tm);
  const seal = addPickup('seal', mx + 1.0, mz + 0.4, { guarded: true });
  G.toad = { state: 'mound', x: mx, z: mz, yaw: 0, hp: TOAD.hp, t: 0, miss: 0, spat: false, mound, mesh: tm, tongue: null, home: [mx, mz] };
  // spikes (3 plates in room B on the A→C route)
  for (const [x, z] of [[9.2, 2.0], [10.8, 3.6], [11.4, 1.0]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 2.2), new THREE.MeshStandardMaterial({ color: 0x5b4a2f, roughness: 0.7, metalness: 0.4 })); plate.position.y = 0.03; g.add(plate);
    const spikes = new THREE.Group();
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.8, roughness: 0.35 })); c.position.set(i * 0.6, 0.45, j * 0.6); spikes.add(c); }
    spikes.scale.y = 0.02; g.add(spikes); dyn.add(g);
    G.spikes.push({ x, z, g, spikes, state: 'idle', t: 0, hit: false });
  }
  // crossbow (PLACEHOLDER mesh) on D's east wall, sweeping
  const bg = new THREE.Group(); bg.position.set(29.4, 1.5, 12);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b4a26, roughness: 0.8 });
  const stock = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.22), mat); stock.position.x = -0.4; bg.add(stock);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 1.5), mat); bar.position.x = -0.95; bg.add(bar);
  dyn.add(bg); G.bow = { x: 29.4, z: 12, g: bg, base: Math.PI, t: 0, lock: 0, cd: 0, yaw: Math.PI, on: false };
  // puppet (PLACEHOLDER mesh)
  const pg = new THREE.Group();
  const pm = new THREE.MeshStandardMaterial({ color: 0x3b1d1d, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 4, 10), pm); body.position.y = 0.95; pg.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe9e2d0, roughness: 0.5 })); head.position.y = 1.88; pg.add(head);
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.9, 3, 6), pm); arm.position.set(s * 0.42, 1.1, 0); arm.rotation.z = s * 0.2; pg.add(arm); }
  pg.position.set(27.4, 0, 15.2); dyn.add(pg);
  G.puppet = { g: pg, x: 27.4, z: 15.2, active: false, cd: 0, moving: false };
  // extraction marker in A
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.7, 40), new THREE.MeshBasicMaterial({ color: 0x6fbf73, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(G.extract.x, 0.03, G.extract.z); dyn.add(ring);
  const beacon = new THREE.PointLight(0x6fbf73, 3, 9, 2); beacon.position.set(G.extract.x, 1.2, G.extract.z); dyn.add(beacon);
}

// ---------- collision / LOS ----------
function collide(p, r) {
  for (let pass = 0; pass < 2; pass++) for (const c of colliders) {
    const nx = Math.max(c.x0, Math.min(p.x, c.x1)), nz = Math.max(c.z0, Math.min(p.z, c.z1));
    const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      else { const l = p.x - c.x0, rr = c.x1 - p.x, t = p.z - c.z0, b = c.z1 - p.z, m = Math.min(l, rr, t, b); if (m === l) p.x = c.x0 - r; else if (m === rr) p.x = c.x1 + r; else if (m === t) p.z = c.z0 - r; else p.z = c.z1 + r; }
    }
  }
}
function los(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  for (const c of colliders) {
    if (c.kind !== 'wall') continue;
    let t0 = 0, t1 = 1;
    for (const [o, d, lo, hi] of [[ax, dx, c.x0, c.x1], [az, dz, c.z0, c.z1]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = 2; break; } }
      else { let a = (lo - o) / d, b = (hi - o) / d; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break; }
    }
    if (t0 <= t1) return false;
  }
  return true;
}
const fwd = () => [-Math.sin(G.yaw), -Math.cos(G.yaw)];

// ---------- damage ----------
function hurt(n, why) {
  if (G.mode !== 'run') return;
  G.hp = Math.max(0, G.hp - n); G.dmgFlash = 1; G.cause = why;
  if (G.hp <= 0) endRun(false);
}

// ---------- monsters / traps ----------
function updateSpikes(dt) {
  for (const s of G.spikes) {
    const on = Math.abs(G.pos.x - s.x) < 1.1 && Math.abs(G.pos.z - s.z) < 1.1;
    if (s.state === 'idle' && on) { s.state = 'armed'; s.t = SPIKES.delay; s.hit = false; }
    else if (s.state === 'armed') { s.t -= dt; if (s.t <= 0) { s.state = 'up'; s.t = SPIKES.up; } }
    else if (s.state === 'up') {
      s.spikes.scale.y = Math.min(1, s.spikes.scale.y + dt * 14);
      if (on && !s.hit) { s.hit = true; G.stats.spikes++; hurt(SPIKES.dmg, 'Địa thích (45 HP)'); say('Gai đâm! -45 HP'); }
      s.t -= dt; if (s.t <= 0) { s.state = 'cool'; s.t = SPIKES.cd; }
    } else if (s.state === 'cool') { s.spikes.scale.y = Math.max(0.02, s.spikes.scale.y - dt * 4); s.t -= dt; if (s.t <= 0) s.state = 'idle'; }
  }
}
function updateBow(dt) {
  const b = G.bow; if (!b) return;
  b.on = G.pos.x > 18;
  if (!b.on) return;
  b.t += dt; b.cd -= dt;
  const dx = G.pos.x - b.x, dz = G.pos.z - b.z, dist = Math.hypot(dx, dz), want = Math.atan2(dz, dx);
  const sweep = b.base + Math.sin(b.t * 0.9) * CROSSBOW.arc;
  const seen = dist < CROSSBOW.range && los(b.x, b.z, G.pos.x, G.pos.z) && Math.abs(angDiff(want, sweep)) < 0.55;
  if (seen && b.cd <= 0) { b.lock += dt; b.yaw = want; if (b.lock >= CROSSBOW.lock) { fireBow(want); b.lock = 0; b.cd = CROSSBOW.cd; } }
  else { b.lock = Math.max(0, b.lock - dt * 2); b.yaw = b.lock > 0 ? b.yaw : sweep; }
  b.g.rotation.y = -b.yaw + Math.PI; // mesh points along local -x
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
function fireBow(ang) {
  const b = G.bow; const ok = los(b.x, b.z, G.pos.x, G.pos.z);
  const pts = [new THREE.Vector3(b.x, 1.5, b.z), new THREE.Vector3(b.x + Math.cos(ang) * CROSSBOW.range, 1.4, b.z + Math.sin(ang) * CROSSBOW.range)];
  const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd27a })); dyn.add(ln); G.tracers.push({ ln, t: 0.25 });
  if (ok) { const d = Math.round(CROSSBOW.dmgMin + Math.random() * (CROSSBOW.dmgMax - CROSSBOW.dmgMin)); G.stats.arrows++; hurt(d, `Liên nỗ (${d} HP)`); say(`Mũi tên! -${d} HP`); }
}

function updatePuppet(dt) {
  const p = G.puppet; if (!p) return;
  if (!p.active && G.pos.x > 18.5) { p.active = true; say('Có gì đó vừa nhúc nhích…'); }
  if (!p.active) return;
  p.cd -= dt;
  const dx = G.pos.x - p.x, dz = G.pos.z - p.z, dist = Math.hypot(dx, dz);
  const [fx, fz] = fwd(); const dot = (dx * -fx + dz * -fz) / (dist || 1); // >0 when puppet is in front
  const seen = dist < 30 && (-(dx * fx + dz * fz) / (dist || 1)) > 0.55 && los(G.pos.x, G.pos.z, p.x, p.z);
  p.moving = !(PUPPET.freezeWhenSeen && seen);
  G.seenPuppet = seen;
  if (p.moving && dist > 0.9) { p.x += (dx / dist) * PUPPET.speed * dt; p.z += (dz / dist) * PUPPET.speed * dt; const q = { x: p.x, z: p.z }; collide(q, 0.35); p.x = q.x; p.z = q.z; }
  if (dist < 1.15 && p.cd <= 0 && p.moving) { p.cd = PUPPET.hitCd; G.stats.puppet++; hurt(PUPPET.hit, 'Mộc ngẫu (90 HP)'); say('Mộc ngẫu! -90 HP'); }
  p.g.position.set(p.x, 0, p.z); p.g.rotation.y = Math.atan2(dx, dz);
  p.g.position.y = p.moving ? Math.sin(G.t * 18) * 0.04 : 0;
}

function updateToad(dt) {
  const t = G.toad; if (!t) return; t.t += dt;
  const dx = G.pos.x - t.x, dz = G.pos.z - t.z, dist = Math.hypot(dx, dz);
  const face = () => { t.yaw = Math.atan2(dx, dz); t.mesh.rotation.y = t.yaw + (ART.toadYaw || 0); };
  const sealGone = G.pickups.find((p) => p.id === 'seal' && p.taken);
  switch (t.state) {
    case 'mound': {
      const moving = G.vel.length() > 0.6;
      if (sealGone || dist < 1.4 || (dist < TOAD.wakeRadius && moving && !G.crouch)) { t.state = 'rising'; t.t = 0; say('Đống đất đang ngọ nguậy!'); }
      break;
    }
    case 'rising':
      t.mesh.position.set(t.x, -2.4 + Math.min(1, t.t / 0.8) * 2.4, t.z); face(); t.mound.scale.y = 0.8 * Math.max(0.05, 1 - t.t / 0.8);
      if (t.t >= 0.8) { t.state = 'chase'; t.t = 0; t.mound.visible = false; }
      break;
    case 'chase': {
      face();
      if (dist > 1.6) { moveTo(t, G.pos.x, G.pos.z, TOAD.chase * dt, 1.1); }
      const clear = los(t.x, t.z, G.pos.x, G.pos.z);
      if (dist < TOAD.tongueRange && dist > 1.6 && clear && t.t > 0.6) { t.state = 'wind'; t.t = 0; }
      else if (dist <= 1.6 && clear) { t.state = 'grab'; t.t = 0; }
      break;
    }
    case 'wind': // 0.2 s wind-up, then the tongue flies (WIKI)
      face();
      if (t.t >= TOAD.tongueWindup) { if (los(t.x, t.z, G.pos.x, G.pos.z)) { t.state = 'drag'; t.t = 0; mkTongue(t); G.stats.toad++; say('Lưỡi ếch quấn bạn! Vung xẻng vào lưỡi!'); } else { t.miss++; t.state = t.miss >= 2 ? 'cry' : 'chase'; t.t = 0; } }
      break;
    case 'drag': { // 1.0 s drag-in; a swing aimed at the toad cuts the tongue (WIKI: hit the tongue to break free)
      face(); G.pos.x -= (dx / (dist || 1)) * Math.min(dist - 1.4, 3.2 * dt) * (dist > 1.4 ? 1 : 0); G.pos.z -= (dz / (dist || 1)) * Math.min(dist - 1.4, 3.2 * dt) * (dist > 1.4 ? 1 : 0);
      stretchTongue(t);
      if (G.swung && aimedAt(t.x, t.z, 12)) { dropTongue(t); t.state = 'cry'; t.t = 0; say('Cắt đứt lưỡi! Nó khóc.'); }
      else if (t.t >= TOAD.dragWindup || dist <= 1.5) { dropTongue(t); t.state = 'swallow'; t.t = 0; say('Bị nuốt! 10 HP/giây — đánh nó để thoát!'); }
      break; }
    case 'grab': t.state = 'swallow'; t.t = 0; say('Bị nuốt! 10 HP/giây — đánh nó để thoát!'); break;
    case 'swallow': {
      face(); // player is held where they stand
      hurt(TOAD.swallowDps * dt, 'Ếch nuốt (10 HP/giây)');
      if (G.mode !== 'run') break;
      if (G.hp <= TOAD.lowHp && !t.spat && TOAD.spitOnceAtLowHp) { t.spat = true; t.state = 'cry'; t.t = 0; say('Nó nhả bạn ra (lần duy nhất khi chơi một mình).'); }
      else if (G.swung && aimedAt(t.x, t.z, 6)) { t.hp -= PLAYER.shovelDmg; t.state = 'cry'; t.t = 0; say('Xẻng trúng! Nó nhả bạn ra.'); }
      break; }
    case 'cry': // WIKI: ~5 s crying, then chase again
      t.mesh.rotation.z = Math.sin(G.t * 12) * 0.05;
      if (G.swung && dist < PLAYER.shovelReach + 0.8 && aimedAt(t.x, t.z, 4)) { t.hp -= PLAYER.shovelDmg; say(`Trúng ếch (${Math.max(0, t.hp)}/${TOAD.hp})`, 1); }
      if (t.t >= TOAD.cryTime) { t.state = 'chase'; t.t = 0; t.miss = 0; t.mesh.rotation.z = 0; }
      break;
    case 'dead': t.mesh.scale.y = Math.max(0.05, t.mesh.scale.y - dt * 2); break;
  }
  if (G.swung && t.state === 'chase' && dist < PLAYER.shovelReach + 0.8 && aimedAt(t.x, t.z, 4)) { t.hp -= PLAYER.shovelDmg; say(`Trúng ếch (${Math.max(0, t.hp)}/${TOAD.hp})`, 1); }
  if (t.hp <= 0 && t.state !== 'dead') { dropTongue(t); t.state = 'dead'; say('Con ếch đã gục.'); }
  if (t.mesh.position.y > -2 && t.state !== 'mound') t.mesh.position.set(t.x, 0, t.z);
}
function moveTo(o, tx, tz, step, r) { const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz) || 1; o.x += (dx / d) * step; o.z += (dz / d) * step; const q = { x: o.x, z: o.z }; collide(q, r); o.x = q.x; o.z = q.z; }
function aimedAt(x, z, deg) { const dx = x - G.pos.x, dz = z - G.pos.z, d = Math.hypot(dx, dz) || 1; const [fx, fz] = fwd(); return (dx * fx + dz * fz) / d > Math.cos(deg * Math.PI / 180 * 3.2); }
function mkTongue(t) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xd24a6a })); dyn.add(l); t.tongue = l; stretchTongue(t); }
function stretchTongue(t) { if (!t.tongue) return; t.tongue.geometry.setFromPoints([new THREE.Vector3(t.x, 1.1, t.z), new THREE.Vector3(G.pos.x, 1.2, G.pos.z)]); }
function dropTongue(t) { if (t.tongue) { dyn.remove(t.tongue); t.tongue = null; } }

// ---------- interaction ----------
function nearestTarget() {
  let best = null, bd = 1e9;
  const consider = (kind, o, x, z, reach) => { const d = Math.hypot(G.pos.x - x, G.pos.z - z); if (d < reach && d < bd) { bd = d; best = { kind, o }; } };
  for (const c of G.coffins) if (!c.open) consider('coffin', c, c.x, c.z, 2.3);
  for (const p of G.pickups) if (!p.taken) consider('pickup', p, p.x, p.z, 1.6);
  consider('exit', null, G.extract.x, G.extract.z, G.extract.r + 0.4);
  return best;
}
function grant(id, src) { G.carried.push(id); G.lootValue += LOOT[id].value; say(`+ ${LOOT[id].name} (${LOOT[id].value.toLocaleString()})`); if (src) src.taken = true; }
function completeHold(tg) {
  if (tg.kind === 'pickup') { grant(tg.o.id, tg.o); tg.o.mesh.visible = false; }
  else if (tg.kind === 'coffin') {
    tg.o.open = true; tg.o.mesh.rotation.z = 0.05;
    let id = COFFIN.floor; for (const [k, p] of COFFIN.rolls) if (Math.random() < p) { id = k; break; }
    grant(id);
  } else if (tg.kind === 'exit') { if (G.carried.length === 0) { say('Chưa có gì trong túi — vẫn thoát được, nhưng làm vậy để làm gì?'); } endRun(true); }
}
const holdTime = (tg) => (tg.kind === 'coffin' ? COFFIN.holdSec : tg.kind === 'exit' ? EXTRACT.holdSec : 0.45);

// ---------- run lifecycle ----------
function startRun() {
  Object.assign(G, { mode: 'run', t: 0, hp: PLAYER.hp, bat: FLASHLIGHT.seconds, torchOn: true, carried: [], lootValue: 0, hold: 0, holdTarget: null, shovelCd: 0, dmgFlash: 0, cause: '', stats: { spikes: 0, arrows: 0, toad: 0, puppet: 0 } });
  G.pos.set(1, 0, 1); G.yaw = Math.PI * 0.75; G.pitch = 0; G.vel.set(0, 0, 0);
  buildRun(); say('Tìm kho báu. Ra vòng xanh ở phòng đầu để thoát.', 4);
  $('menu').classList.add('hide'); $('end').classList.add('hide'); $('hud').style.display = 'block';
  try { canvas.requestPointerLock && canvas.requestPointerLock(); } catch (e) { /* headless */ }
  save.runs++; writeSave(save);
}
function endRun(extracted) {
  if (G.mode !== 'run') return; G.mode = extracted ? 'won' : 'dead';
  const v = G.lootValue;
  if (extracted) { save.bank += v; save.out++; save.best = Math.max(save.best, v); } else save.dead++;
  writeSave(save);
  try { document.exitPointerLock && document.exitPointerLock(); } catch (e) { /* ignore */ }
  const rows = G.carried.map((id) => `<tr><td>${LOOT[id].name}</td><td>${LOOT[id].value.toLocaleString()}</td></tr>`).join('') || '<tr><td class="dim">Túi trống</td><td></td></tr>';
  $('endCard').innerHTML = extracted
    ? `<h2 class="won">Thoát thành công</h2><p class="dim">Đồ mang ra đã vào kho.</p><table>${rows}</table><p>Cộng <b>${v.toLocaleString()}</b> 铲铲币 · Kho: <b>${save.bank.toLocaleString()}</b></p>`
    : `<h2 class="dead">Bạn đã chết</h2><p class="dim">${G.cause || ''}</p><p>Mất sạch đồ chuyến này:</p><table>${rows}</table><p>Mất <b>${v.toLocaleString()}</b> 铲铲币 · Kho giữ nguyên: <b>${save.bank.toLocaleString()}</b></p>`;
  $('endCard').innerHTML += '<button id="again">Vào lại</button>';
  $('end').classList.remove('hide'); $('hud').style.display = 'none';
  $('again').onclick = startRun; refreshMenu();
}
// Desktop key legend, same idea as food-gang's KeyLabels: keycaps on screen while playing, desktop only, a touch removes
// them for good, plus a one-time bubble for the key that does most of the work (E). Never takes the pointer.
const HINT_KEY = 'tombbusters.hint.e';
let keysWanted = !!(window.matchMedia && matchMedia('(pointer: fine)').matches && !matchMedia('(pointer: coarse)').matches);
addEventListener('touchstart', () => { keysWanted = false; $('tb-keys').style.display = 'none'; }, { passive: true });
let hintT = 0, hintSeen = false; try { hintSeen = localStorage.getItem(HINT_KEY) === '1'; } catch (e) { /* ignore */ }
function updateKeys(dt) {
  const on = keysWanted && G.mode === 'run'; $('tb-keys').style.display = on ? 'flex' : 'none';
  const h = $('tbHint'); if (!on) { h.style.display = 'none'; return; }
  if (!hintSeen && G.promptTarget) { hintT += dt; h.style.display = 'block'; if (hintT > 7 || G.holdTarget) { hintSeen = true; h.style.display = 'none'; try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* ignore */ } } }
  else if (hintSeen) h.style.display = 'none';
}
function refreshMenu() { $('sBank').textContent = save.bank.toLocaleString(); $('sRuns').textContent = save.runs; $('sOut').textContent = save.out; }

// ---------- player update ----------
function update(dt) {
  if (G.mode !== 'run') return;
  G.t += dt; G.shovelCd -= dt;
  const k = G.keys, held = G.holdTarget;
  const t = G.toad; const stuck = t && (t.state === 'swallow' || t.state === 'drag');
  let ix = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), iz = (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0);
  if (k.ArrowLeft) G.yaw += 1.8 * dt; if (k.ArrowRight) G.yaw -= 1.8 * dt;
  G.crouch = !!(k.ControlLeft || k.KeyC);
  const sp = stuck ? 0 : (G.crouch ? 1.8 : (k.ShiftLeft ? PLAYER.sprint : PLAYER.walk));
  const l = Math.hypot(ix, iz) || 1; ix /= l; iz /= l;
  const c = Math.cos(G.yaw), s = Math.sin(G.yaw);
  const vx = (ix * c + iz * s) * sp, vz = (-ix * s + iz * c) * sp;
  G.vel.set(vx, 0, vz);
  G.pos.x += vx * dt; G.pos.z += vz * dt; collide(G.pos, PLAYER.radius);
  // flashlight
  if (G.torchOn && G.bat > 0) { G.bat = Math.max(0, G.bat - dt); if (G.bat === 0) { G.torchOn = false; say('Hết pin đèn pin.'); } }
  // interaction hold
  const tg = nearestTarget();
  if (k.KeyE && tg && !stuck) { if (!G.holdTarget || G.holdTarget.o !== tg.o || G.holdTarget.kind !== tg.kind) { G.holdTarget = tg; G.hold = 0; } G.hold += dt; if (G.hold >= holdTime(tg)) { const h = G.holdTarget; G.holdTarget = null; G.hold = 0; k.KeyE = false; completeHold(h); } }
  else { G.holdTarget = null; G.hold = 0; }
  G.promptTarget = tg;
  updateSpikes(dt); updateBow(dt); updatePuppet(dt); updateToad(dt);
  G.swung = false;
  for (const tr of G.tracers) { tr.t -= dt; if (tr.t <= 0) dyn.remove(tr.ln); } G.tracers = G.tracers.filter((x) => x.t > 0);
  for (const p of G.pickups) if (!p.taken) { p.mesh.rotation.y += dt * 1.6; p.mesh.position.y = 0.55 + Math.sin(G.t * 2 + p.x) * 0.06; }
  G.dmgFlash = Math.max(0, G.dmgFlash - dt * 1.6); G.msgT -= dt;
}
function swing() {
  if (G.mode !== 'run' || G.shovelCd > 0) return; G.shovelCd = PLAYER.shovelCd; G.swung = true;
}

// ---------- render ----------
function render() {
  const eyeY = PLAYER.eye + (G.crouch ? -0.6 : 0) + Math.sin(G.t * 9) * 0.02 * Math.min(1, G.vel.length() / 4);
  camera.position.set(G.pos.x, eyeY, G.pos.z); camera.rotation.set(G.pitch, G.yaw, 0);
  const on = G.torchOn && G.bat > 0 && G.mode === 'run';
  const flick = G.bat < 12 ? 0.55 + 0.45 * Math.abs(Math.sin(G.t * 23)) * Math.random() : 1;
  torch.intensity = on ? 90 * flick : 0; glow.intensity = on ? 1.2 * flick : 0;
  const f = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  torch.position.copy(camera.position); torchTarget.position.copy(camera.position).addScaledVector(f, 5); glow.position.copy(camera.position).addScaledVector(f, 0.4);
  for (const p of G.pickups) if (!p.taken) p.mesh.visible = true;
  renderer.render(scene, camera);
  // HUD
  if (G.mode === 'run') {
    $('hp').firstElementChild.style.width = (G.hp / PLAYER.hp) * 100 + '%'; $('hpn').textContent = Math.ceil(G.hp);
    $('bat').firstElementChild.style.width = (G.bat / FLASHLIGHT.seconds) * 100 + '%'; $('batn').textContent = Math.ceil(G.bat) + 's' + (G.torchOn ? '' : ' · tắt');
    $('loot').innerHTML = `${G.lootValue.toLocaleString()} 铲铲币<small>${G.carried.length} món trong túi — chết là mất</small>`;
    $('dmg').style.opacity = G.dmgFlash;
    $('msg').textContent = G.msgT > 0 ? G.msg : '';
    const tg = G.promptTarget; let pr = '';
    if (tg) { const lab = tg.kind === 'coffin' ? 'Giữ E mở quan tài' : tg.kind === 'exit' ? 'Giữ E để thoát' : `Giữ E nhặt ${LOOT[tg.o.id].name}`; pr = G.holdTarget ? `${lab} · ${Math.round(G.hold / holdTime(tg) * 100)}%` : lab; }
    $('prompt').textContent = pr;
    $('obj').textContent = G.carried.length ? 'Mang đồ ra vòng xanh ở phòng đầu.' : 'Tìm kho báu: quan tài đồng và món đồ trên sàn.';
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G.manual) update(dt);
  updateKeys(dt); render(); requestAnimationFrame(frame);
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  G.keys[e.code] = true;
  if (e.code === 'KeyF' && G.mode === 'run' && G.bat > 0) G.torchOn = !G.torchOn;
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { G.keys[e.code] = false; });
addEventListener('blur', () => { G.keys = {}; });
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas && G.mode === 'run') { G.yaw -= e.movementX * 0.0022; G.pitch = Math.max(-1.3, Math.min(1.3, G.pitch - e.movementY * 0.0022)); } });
canvas.addEventListener('mousedown', (e) => { if (G.mode !== 'run') return; if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch (er) { /* ignore */ } } if (e.button === 0) swing(); });
$('go').onclick = () => startRun();
$('reset').onclick = () => { save = blank(); writeSave(save); refreshMenu(); };

// ---------- boot ----------
(async function boot() {
  const [coffin, toad] = await Promise.all([loadMesh('coffin', { metal: 0.5, rough: 0.55 }), loadMesh('toad')]);
  ART = { coffin, toad, toadYaw: 0 };
  refreshMenu();
  // test/debug hooks: headless tests drive the same code the player does
  window.__tb = {
    G, rev: REV, save: () => save, THREE, ART,
    start: startRun, swing, keys: () => ({ shown: $('tb-keys').style.display, hint: $('tbHint').style.display, text: $('tb-keys').innerText }), advance(sec, step = 1 / 30) { G.manual = true; for (let t = 0; t < sec; t += step) update(step); render(); },
    tp(x, z, yaw) { G.pos.set(x, 0, z); if (yaw !== undefined) G.yaw = yaw; },
    ready: true,
  };
  requestAnimationFrame(frame);
})();
