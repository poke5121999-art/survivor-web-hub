// Page: crew line-up, inspect close-up, playground with wandering bots and a co-op crate carry.
import * as THREE from 'three';
import { Bot, ANIMS, crateMat } from './bot.js';
import { makeSpec, SCHEMES, PART_VI } from './crew.js';
import { HATS, hatDef } from './hats.js';
import { TORSO_KEYS, HEAD_KEYS, crateGeo } from './parts.js';
import { EMO } from './mat.js';

const Q = new URLSearchParams(location.search);
const N_CREW = +(Q.get('n') || 32);
if (Q.get('ui') === '0') document.body.classList.add('noui');
const cv = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x12151c); scene.fog = new THREE.Fog(0x12151c, 9, 26);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);

// ---- environment for reflections: a dim warehouse box with a few bright panels ----
{
  const es = new THREE.Scene(), bm = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide });
  es.add(new THREE.Mesh(new THREE.BoxGeometry(24, 10, 24), bm(new THREE.Color(0.05, 0.055, 0.07))));
  const panel = (c, p, s, r) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(...s), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(...p); m.rotation.set(...r); es.add(m); };
  panel(new THREE.Color(6, 4.6, 3.2), [-3, 4.9, 2], [6, 2], [Math.PI / 2, 0, 0]);
  panel(new THREE.Color(1.2, 1.8, 3.2), [11.9, 2.5, -2], [5, 3], [0, -Math.PI / 2, 0]);
  panel(new THREE.Color(2.5, 2.2, 2), [0, 3, -11.9], [8, 2], [0, 0, 0]);
  panel(new THREE.Color(0.25, 0.2, 0.16), [0, -4.9, 0], [24, 24], [Math.PI / 2, 0, 0]);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(es, 0.04).texture; scene.environmentIntensity = 0.55; pm.dispose();
}
// ---- lights: soft warm key with shadows, cool rim, hemisphere fill, two practical lamps ----
const hemi = new THREE.HemisphereLight(0x9fb4d8, 0x3b3128, 0.5); scene.add(hemi);
const key = new THREE.DirectionalLight(0xffe0bc, 2.6); key.position.set(-4, 7, 5); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.035; key.shadow.radius = 4;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0x86a8ff, 1.5); rim.position.set(4, 3.5, -6); scene.add(rim);
const lampA = new THREE.PointLight(0xffa860, 6, 7, 2); lampA.position.set(-3.2, 2.4, -1.5); scene.add(lampA);
const lampB = new THREE.PointLight(0x5fd0ff, 4, 6, 2); lampB.position.set(3.4, 1.8, 0.5); scene.add(lampB);
function setShadowBox(cx, cz, half) { const c = key.shadow.camera; c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 0.5; c.far = 30; c.updateProjectionMatrix(); key.target.position.set(cx, 0, cz); key.position.set(cx - 4, 7, cz + 5); }

// ---- floor ----
function floorTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#3a3c40'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n + 1; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${20 + Math.random() * 20},${18 + Math.random() * 15},15,${0.05 + Math.random() * 0.08})`; g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 10 + Math.random() * 50, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(15,15,18,.55)'; g.lineWidth = 3; g.strokeRect(0, 0, 512, 512); g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.lineWidth = 1.5; g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 14); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.82, metalness: 0.05 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
function blobTex() { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.65)'); gr.addColorStop(0.5, 'rgba(0,0,0,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); }
const BLOB = blobTex();
function stripeTex() { const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#e8b923'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#1b1b1d'; for (let i = -2; i < 18; i++) { g.beginPath(); g.moveTo(i * 16, 32); g.lineTo(i * 16 + 8, 32); g.lineTo(i * 16 + 24, 0); g.lineTo(i * 16 + 16, 0); g.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; }
const STRIPE = stripeTex();

// ---- groups ----
const lineup = new THREE.Group(), play = new THREE.Group(); scene.add(lineup, play);
const PLAY_X = 0;
let crew = [], playBots = [], mode = 'lineup', sel = null, globalAnim = 'idle', globalEmote = null, baseSeed = +(Q.get('seed') || 1);

function layout() {
  const portrait = innerWidth / innerHeight < 0.85, cols = portrait ? 4 : 8, rows = Math.ceil(crew.length / cols);
  const sx = 0.8, sz = 1.05;
  crew.forEach((b, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const x = (c - (cols - 1) / 2) * sx + (r % 2 ? sx * 0.25 : -sx * 0.25) * (portrait ? 0.6 : 1), z = -r * sz + (rows - 1) * sz * 0.5;
    b.home = new THREE.Vector3(x, 0, z); b.homeYaw = 0; if (!b.rag && !b.getup) { b.root.position.copy(b.home); b.root.rotation.y = 0; }
  });
  return { cols, rows, w: cols * sx, d: rows * sz, portrait };
}
function buildCrew() {
  for (const b of crew) b.dispose(); crew = [];
  for (let i = 0; i < N_CREW; i++) { const b = new Bot(makeSpec(baseSeed * 1000 + i), { blobTex: BLOB }); b.idx = i; b.treadmill = true; b.lookAtCam = false; lineup.add(b.root); crew.push(b); b.setAnim(globalAnim); }
  layout(); updateCounts();
}
// stage platform under the line-up
const stage = new THREE.Group(); lineup.add(stage);
{
  const m = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7, metalness: 0.3 });
  const plat = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.04, 4.8), m); plat.position.y = -0.021; plat.receiveShadow = true; stage.add(plat);
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 0.1), new THREE.MeshStandardMaterial({ map: STRIPE, roughness: 0.6 })); STRIPE.repeat.set(24, 1);
  edge.rotation.x = -Math.PI / 2; edge.position.set(0, 0.002, 2.36); edge.receiveShadow = true; stage.add(edge);
}

// ---- playground ----
const PG = { half: 3.2, crate: null, carriers: [], state: 'approach', t: 0, target: new THREE.Vector3(), yaw: 0, lifted: 0, cv: 0, wanderers: [] };
function buildPlay() {
  for (const b of playBots) b.dispose(); playBots = []; while (play.children.length) play.remove(play.children[0]);
  const H = PG.half;
  // rails and props
  const railM = new THREE.MeshStandardMaterial({ color: 0xd9a514, roughness: 0.5, metalness: 0.4 }), postM = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.6, metalness: 0.5 });
  for (const [x, z, w, d] of [[0, -H, 2 * H, 0.06], [0, H, 2 * H, 0.06], [-H, 0, 0.06, 2 * H], [H, 0, 0.06, 2 * H]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), railM); r.position.set(x, 0.32, z); r.castShadow = true; play.add(r); }
  for (let i = -4; i <= 4; i++) for (const [x, z] of [[i * H / 4, -H], [i * H / 4, H], [-H, i * H / 4], [H, i * H / 4]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.34, 8), postM); p.position.set(x, 0.17, z); p.castShadow = true; play.add(p); }
  const zone = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 4, 1), new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.6 })); zone.rotation.x = -Math.PI / 2; zone.rotation.z = Math.PI / 4; zone.position.y = 0.004; play.add(zone); PG.zone = zone;
  const props = new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.8 });
  for (const [x, z, s] of [[-2.6, -2.5, 0.5], [-2.1, -2.7, 0.35], [2.6, 2.5, 0.45], [2.7, -2.4, 0.3]]) { const b = new THREE.Mesh(crateGeo(s, s * 0.8, s), crateMat()); b.position.set(x, s * 0.4, z); b.rotation.y = x * 2; b.castShadow = b.receiveShadow = true; play.add(b); }
  PG.crate = new THREE.Mesh(crateGeo(0.42, 0.3, 0.32), crateMat()); PG.crate.castShadow = true; PG.crate.receiveShadow = true; play.add(PG.crate);
  PG.crate.position.set(0, 0.15, 0); PG.state = 'approach'; PG.t = 0; PG.yaw = 0; PG.crate.rotation.set(0, 0, 0); newTarget();
  const n = +(Q.get('pg') || 7);
  for (let i = 0; i < n; i++) {
    const b = new Bot(makeSpec(baseSeed * 1000 + 500 + i), { blobTex: BLOB }); b.treadmill = false; b.setAnim('idle'); b.maxSpeed = 0.45 + Math.random() * 0.25;
    const a = i / n * Math.PI * 2; b.root.position.set(Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8); b.root.rotation.y = Math.random() * 6; play.add(b.root); playBots.push(b); b.idx = i;
    b.ai = { t: Math.random() * 2, cool: 0, emoT: 0, role: i < 2 ? 'carrier' : 'wander' };
  }
  PG.carriers = playBots.slice(0, 2); PG.wanderers = playBots.slice(2);
  play.position.x = PLAY_X; updateCounts();
}
function newTarget() { const H = PG.half - 0.9; for (let k = 0; k < 20; k++) { PG.target.set((Math.random() * 2 - 1) * H, 0, (Math.random() * 2 - 1) * H); if (PG.target.distanceTo(PG.crate.position) > 1.6) break; } PG.zone.position.set(PG.target.x, 0.004, PG.target.z); }
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
function tempEmote(b, e, d) { b.emote = e; b.ai.emoT = d; }
function crateHandles(b, side) {
  // two hand points on the crate's ±x face (side = +1 / -1), returned world space ordered to the bot's left/right
  const c = PG.crate, w = 0.42, out = [];
  for (const s of [1, -1]) out.push(new THREE.Vector3(side * (w / 2 + 0.01), 0.04, s * 0.09).applyEuler(c.rotation).add(c.position));
  const right = tmpV.set(Math.cos(b.root.rotation.y), 0, -Math.sin(b.root.rotation.y));
  return out[0].clone().sub(b.root.position).dot(right) > out[1].clone().sub(b.root.position).dot(right) ? out : [out[1], out[0]];
}
function stepPlay(dt) {
  const c = PG.crate, [A, B] = PG.carriers, H = PG.half - 0.35; PG.t += dt;
  const axis = tmpV2.set(Math.cos(PG.yaw), 0, -Math.sin(PG.yaw)); // crate local +x in world
  const standOff = (b) => 0.21 + b.T.d + 0.12;
  const knocked = A.rag || A.getup || B.rag || B.getup;
  const place = (b, side) => { b.goal = c.position.clone().addScaledVector(axis, side * standOff(b)); b.goal.y = 0; b.face = Math.atan2(c.position.x - b.root.position.x, c.position.z - b.root.position.z); };
  if (PG.state === 'approach') {
    for (const b of [A, B]) { b.carry = null; }
    if (!knocked) { place(A, 1); place(B, -1); }
    const ok = !knocked && A.goal && A.root.position.distanceTo(A.goal) < 0.09 && B.root.position.distanceTo(B.goal) < 0.09;
    if (ok) { PG.state = 'lift'; PG.t = 0; }
  } else if (PG.state === 'lift' || PG.state === 'move') {
    if (knocked) { PG.state = 'drop'; PG.t = 0; PG.cv = 0; for (const b of [A, B]) { b.carry = null; if (!b.rag && !b.getup) tempEmote(b, 'scared', 1.2); } }
    else {
      const k = PG.state === 'lift' ? Math.min(1, PG.t / 0.9) : 1;
      // crate height follows the carriers' natural hand height (different robot sizes tilt it)
      const hh = [A, B].map((b) => b.H - 0.15 * b.L + b.torsoY + b.T.sh[1] - (b.a1 + b.a2) * 0.55 + (b.pelvis.position.y - b.H) * 0.8);
      const y = 0.15 + (Math.max(0.3, (hh[0] + hh[1]) / 2) - 0.15) * (k * k * (3 - 2 * k));
      c.position.y = y; c.rotation.set(0, PG.yaw, Math.atan2(hh[0] - hh[1], 0.8) * k * 0.8 + Math.sin(PG.t * 9) * 0.01 * k);
      if (PG.state === 'lift') { if (PG.t > 1.0) { PG.state = 'move'; PG.t = 0; } }
      else {
        const to = tmpV.subVectors(PG.target, c.position).setY(0), d = to.length();
        // turn the crate so carriers walk front/back, then move slowly
        const yawT = Math.atan2(-to.z, to.x); let dy = Math.atan2(Math.sin(yawT - PG.yaw), Math.cos(yawT - PG.yaw));
        PG.yaw += dy * Math.min(1, dt * 1.2);
        if (Math.abs(dy) < 0.5 && d > 0.05) { const sp = Math.min(0.32, d) * (1 - Math.abs(dy)); c.position.addScaledVector(to.normalize(), sp * dt); }
        if (d < 0.08) { PG.state = 'drop'; PG.t = 0; PG.cv = 0; PG.cheer = true; }
      }
      place(A, 1); place(B, -1);
      for (const [b, s] of [[A, 1], [B, -1]]) b.carry = { hands: crateHandles(b, s), emote: Math.sin(PG.t * 1.3 + s) > 0.85 ? 'angry' : 'strain' };
    }
  } else if (PG.state === 'drop') {
    for (const b of [A, B]) b.carry = null;
    PG.cv -= 9.8 * dt; c.position.y += PG.cv * dt; if (c.position.y < 0.15) { c.position.y = 0.15; PG.cv = Math.abs(PG.cv) > 1 ? -PG.cv * 0.3 : 0; }
    c.rotation.z *= 1 - Math.min(1, dt * 6);
    if (PG.t > 0.4 && PG.cheer) { PG.cheer = false; for (const b of [A, B]) if (!b.rag && !b.getup) { b.setAnim('jump'); b.goal = null; tempEmote(b, 'happy', 1.6); b.ai.unjump = 1.6; } newTarget(); }
    if (PG.t > 1.8 && !knocked) { PG.state = 'approach'; PG.t = 0; }
  }
  // wanderers
  for (const b of PG.wanderers) {
    const ai = b.ai; ai.t -= dt;
    if (b.rag || b.getup) continue;
    if (ai.t <= 0) {
      const r = Math.random();
      if (r < 0.62) { b.goal = new THREE.Vector3((Math.random() * 2 - 1) * H, 0, (Math.random() * 2 - 1) * H); b.setAnim('idle'); ai.t = 3 + Math.random() * 3; b.maxSpeed = Math.random() < 0.25 ? 1.0 : 0.4 + Math.random() * 0.2; }
      else if (r < 0.75) { b.goal = null; b.setAnim('wave'); ai.t = 2; }
      else if (r < 0.85) { b.goal = null; b.setAnim('dance'); ai.t = 3; }
      else { b.goal = null; b.setAnim('idle'); ai.t = 1.5 + Math.random() * 2; }
      b.face = null;
    }
    // walking into the crate while it is carried: chase it like a curious pet
    if (b.goal && b.goal.distanceTo(b.root.position) < 0.1) { b.goal = null; }
  }
  for (const b of playBots) {
    if (b.ai.emoT > 0) { b.ai.emoT -= dt; if (b.ai.emoT <= 0) b.emote = globalEmote; }
    if (b.ai.unjump > 0) { b.ai.unjump -= dt; if (b.ai.unjump <= 0) b.setAnim('idle'); }
    b.ai.cool -= dt;
    const p = b.root.position; p.x = Math.max(-H, Math.min(H, p.x)); p.z = Math.max(-H, Math.min(H, p.z));
  }
  // bumps: separation, and a hard bump knocks the lighter robot over
  for (let i = 0; i < playBots.length; i++) for (let j = i + 1; j < playBots.length; j++) {
    const a = playBots[i], b = playBots[j]; if (a.rag || b.rag || a.getup || b.getup) continue;
    const d = tmpV.subVectors(b.root.position, a.root.position).setY(0), L = d.length(), rr = a.T.w + b.T.w + 0.04;
    if (L < rr && L > 1e-4) {
      d.multiplyScalar(1 / L); const push = (rr - L) * 0.5; a.root.position.addScaledVector(d, -push); b.root.position.addScaledVector(d, push);
      const rel = tmpV2.subVectors(a.vel, b.vel).dot(d);
      if (rel > 0.45 && a.ai.cool <= 0 && b.ai.cool <= 0) {
        const victim = (a.T.w + a.spec.legLen * 0.3 < b.T.w + b.spec.legLen * 0.3) ? a : b, other = victim === a ? b : a, dir = victim === a ? d.clone().negate() : d.clone();
        victim.knock(dir, 1.0 + rel); tempEmote(other, Math.random() < 0.5 ? 'happy' : 'scared', 1.5); a.ai.cool = b.ai.cool = 3; other.vel.multiplyScalar(-0.3);
        if (victim.ai.role === 'wander') victim.goal = null;
        stats.bumps++;
      } else if (rel > 0.05) { a.vel.addScaledVector(d, -rel * 0.6); b.vel.addScaledVector(d, rel * 0.6); }
    }
  }
  // the carried crate pushes wanderers away
  for (const b of PG.wanderers) { const d = tmpV.subVectors(b.root.position, c.position).setY(0), L = d.length(), rr = 0.3 + b.T.w; if (L < rr && L > 1e-4) b.root.position.addScaledVector(d, (rr - L) / L); }
}
const stats = { bumps: 0 };

// ---- camera control (orbit, zoom, pinch) ----
const ctl = { target: new THREE.Vector3(0, 0.5, 0), dist: 6, yaw: 0, pitch: 0.38, goal: null };
function camUpdate(dt) {
  if (ctl.goal) { const g = ctl.goal, k = 1 - Math.exp(-dt * 4); ctl.target.lerp(g.target, k); ctl.dist += (g.dist - ctl.dist) * k; ctl.yaw += (g.yaw - ctl.yaw) * k; ctl.pitch += (g.pitch - ctl.pitch) * k; if (g.follow) g.target.copy(g.follow()); }
  const cp = Math.cos(ctl.pitch); camera.position.set(ctl.target.x + Math.sin(ctl.yaw) * cp * ctl.dist, ctl.target.y + Math.sin(ctl.pitch) * ctl.dist, ctl.target.z + Math.cos(ctl.yaw) * cp * ctl.dist); camera.lookAt(ctl.target);
}
const ptrs = new Map(); let downAt = null, moved = 0, pinch0 = 0;
cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); downAt = [e.clientX, e.clientY]; moved = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
cv.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return; const pr = ptrs.get(e.pointerId), dx = e.clientX - pr[0], dy = e.clientY - pr[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy);
  if (ptrs.size === 1) { const g = ctl.goal; if (g) { g.yaw -= dx * 0.006; g.pitch = Math.max(0.02, Math.min(1.3, g.pitch + dy * 0.004)); } else { ctl.yaw -= dx * 0.006; ctl.pitch = Math.max(0.02, Math.min(1.3, ctl.pitch + dy * 0.004)); } }
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) zoom(pinch0 / d); pinch0 = d; }
});
const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; if (downAt && moved < 8 && e.type === 'pointerup') pickAt(e.clientX, e.clientY); downAt = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
function zoom(f) { const g = ctl.goal || ctl; g.dist = Math.max(0.6, Math.min(16, g.dist * f)); }
const ray = new THREE.Raycaster();
function pickAt(x, y) {
  const r = cv.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
  const list = (mode === 'lineup' ? crew : playBots).flatMap((b) => b.pick);
  const hit = ray.intersectObjects(list, false)[0];
  if (hit && hit.object.userData.bot) inspect(hit.object.userData.bot); else if (sel) inspect(null);
}

// ---- UI ----
const $ = (s) => document.querySelector(s);
const ANIM_VI = { idle: 'Đứng yên', walk: 'Đi bộ', run: 'Chạy', jump: 'Nhảy lên', carry: 'Bê đồ nặng', fall: 'Ngã rồi dậy', wave: 'Vẫy tay', dance: 'Nhảy nhót', scared: 'Run sợ', sleep: 'Ngủ gật' };
const EMO_VI = { auto: 'Tự động', neutral: 'Bình thường', happy: 'Vui', scared: 'Sợ', angry: 'Giận', dizzy: 'Choáng', sleepy: 'Buồn ngủ', love: 'Yêu', dead: 'Chết X', sad: 'Buồn', strain: 'Gồng sức' };
function chips(el, items, labels, onPick, cur) {
  el.innerHTML = ''; for (const k of items) { const b = document.createElement('button'); b.className = 'chip' + (k === cur ? ' on' : ''); b.textContent = labels[k]; b.dataset.k = k; b.onclick = () => { onPick(k); for (const x of el.children) x.classList.toggle('on', x === b); }; el.appendChild(b); }
}
function targets() { if (sel) return [sel]; return mode === 'lineup' ? crew : playBots; }
function setAnimAll(a) { if (mode === 'lineup' && !sel) globalAnim = a; for (const b of targets()) { if (mode === 'play' && (a === 'walk' || a === 'run')) { b.goal = new THREE.Vector3((Math.random() * 2 - 1) * 2.5, 0, (Math.random() * 2 - 1) * 2.5); b.maxSpeed = a === 'run' ? 1.1 : 0.45; b.setAnim('idle'); } else b.setAnim(a); } }
function setEmoteAll(e) { const v = e === 'auto' ? null : e; if (!sel) globalEmote = v; for (const b of targets()) b.emote = v; }
chips($('#anims'), ANIMS, ANIM_VI, setAnimAll, 'idle');
chips($('#emotes'), Object.keys(EMO_VI), EMO_VI, setEmoteAll, 'auto');
$('#rand').onclick = () => { baseSeed = 1 + Math.floor(Math.random() * 9999); if (mode === 'lineup') buildCrew(); else buildPlay(); inspect(null); };
$('#modeL').onclick = () => setMode('lineup'); $('#modeP').onclick = () => setMode('play');
$('#close').onclick = () => inspect(null);
function setMode(m) {
  mode = m; inspect(null); $('#modeL').classList.toggle('on', m === 'lineup'); $('#modeP').classList.toggle('on', m === 'play');
  lineup.visible = m === 'lineup'; play.visible = m === 'play';
  if (m === 'play' && !playBots.length) buildPlay();
  frameView(); updateCounts();
}
function frameView() {
  const portrait = innerWidth / innerHeight < 0.85;
  if (mode === 'lineup') { const L = layout(); const dist = portrait ? 11.5 : 7.4; ctl.goal = { target: new THREE.Vector3(0, 0.3, 0.1), dist, yaw: 0, pitch: portrait ? 0.66 : 0.5 }; setShadowBox(0, 0, Math.max(L.w, L.d) * 0.62 + 0.6); }
  else { ctl.goal = { target: new THREE.Vector3(PLAY_X + 0.35, 0, 0.75), dist: portrait ? 12.5 : 9.2, yaw: 0.5, pitch: 0.8 }; setShadowBox(PLAY_X, 0, PG.half + 0.6); }
}
function inspect(b) {
  for (const x of crew.concat(playBots)) x.lookAtCam = false;
  sel = b; const pn = $('#info');
  if (!b) { pn.classList.remove('show'); frameView(); return; }
  b.lookAtCam = true; const s = b.spec, sch = SCHEMES[s.scheme];
  const hats = [s.hat, s.acc].filter(Boolean).map((h) => hatDef(h).vi).join(', ') || 'Không';
  pn.querySelector('#iname').textContent = `${s.name} · số ${String(s.num).padStart(2, '0')}`;
  pn.querySelector('#ibody').innerHTML = [['Thân', PART_VI.torso[s.torso]], ['Đầu', PART_VI.head[s.head]], ['Tai', PART_VI.ears[s.ears]], ['Ăng-ten', PART_VI.ant[s.ant]], ['Tay', PART_VI.hand[s.hand]], ['Chân', PART_VI.foot[s.foot]], ['Khớp chi', PART_VI.limb[s.limb]], ['Phụ kiện', hats], ['Phối màu', sch.vi]]
    .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  pn.classList.add('show');
  const portrait = innerWidth / innerHeight < 0.85;
  const follow = () => { const p = new THREE.Vector3(); b.torso.getWorldPosition(p); p.y += b.T.h * 0.75; return p; };
  ctl.goal = { target: follow(), dist: portrait ? 2.9 : 2.1, yaw: b.root.rotation.y + (mode === 'play' ? 0 : 0.25), pitch: 0.18, follow };
  setShadowBox(b.root.position.x + (mode === 'play' ? PLAY_X : 0), b.root.position.z, mode === 'play' ? PG.half + 0.6 : 4);
}
function updateCounts() {
  const n = mode === 'lineup' ? crew.length : playBots.length;
  $('#counts').textContent = `${n} robot · ${TORSO_KEYS.length} thân · ${HEAD_KEYS.length} đầu · ${HATS.length} phụ kiện · ${SCHEMES.length} phối màu`;
}
addEventListener('resize', () => { resize(); frameView(); if (sel) inspect(sel); });
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.85 ? 50 : 38; camera.updateProjectionMatrix(); }

// ---- loop ----
let last = performance.now(), fpsE = 60, frames = 0, fpsT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
  if (mode === 'lineup') for (const b of crew) b.update(dt, camera);
  else { stepPlay(dt); for (const b of playBots) b.update(dt, camera); }
  camUpdate(dt);
  renderer.render(scene, camera);
  frames++; fpsT += dt; if (fpsT >= 0.5) { fpsE = frames / fpsT; frames = 0; fpsT = 0; const i = renderer.info.render; $('#fps').textContent = `${fpsE.toFixed(0)} fps · ${i.calls} lệnh vẽ · ${(i.triangles / 1000).toFixed(0)}k tam giác`; window.BC.fps = fpsE; window.BC.calls = i.calls; window.BC.tris = i.triangles; }
}
resize(); buildCrew(); setMode(Q.get('mode') === 'play' ? 'play' : 'lineup');
if (Q.get('anim')) setAnimAll(Q.get('anim'));
requestAnimationFrame(frame);

// test hooks
window.BC = {
  crew: () => crew, play: () => playBots, PG, stats, camera, ctl, setMode, inspect: (i) => inspect(i === null ? null : (mode === 'lineup' ? crew : playBots)[i]),
  anim: (a, i) => { if (i === undefined) setAnimAll(a); else (mode === 'lineup' ? crew : playBots)[i].setAnim(a); },
  emote: (e, i) => { if (i === undefined) setEmoteAll(e); else (mode === 'lineup' ? crew : playBots)[i].emote = e === 'auto' ? null : e; },
  view: (t, dist, yaw, pitch) => { ctl.goal = null; ctl.target.set(...t); ctl.dist = dist; ctl.yaw = yaw; ctl.pitch = pitch; },
  solo: (list, sp = 0.7) => { for (const b of crew) b.dispose(); crew = []; list.forEach((o, i) => { const b = new Bot(Object.assign(makeSpec(baseSeed * 1000 + i), o), { blobTex: BLOB }); b.idx = i; lineup.add(b.root); crew.push(b); b.home = new THREE.Vector3((i - (list.length - 1) / 2) * sp, 0, 0); b.homeYaw = 0; b.root.position.copy(b.home); b.setAnim(globalAnim); }); stage.visible = false; updateCounts(); return crew.length; },
  ready: true, fps: 0,
};
