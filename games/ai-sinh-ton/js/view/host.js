// The view host: renderer, scene, lights, the arena floor (floor.js) with its fog wall, rain, and the small `G` object
// that Blockade Z's fx, audio, zombie and boss code expects. The sim never touches it; actors.js and camera.js
// read H and draw the battle on top.
import { createFloor } from './floor.js?v=20261119b';
const THREE = window.THREE;
const BZ = window.BZ;

const SETTINGS_KEY = 'aisinhton.settings.v1';
export const ARENA_VIEW_R = 14;
const WALL_R = 21;
const FAR_MS = 26;

// Tiers differ by the sharpest DPR they may use, shadows, bloom and particle counts. Every tier keeps the drawing
// buffer at 1.0 CSS px per frame px at least: a phone never renders below its layout size.
const TIERS = {
  low: { name: 'low', maxDpr: 1, shadow: 0, post: false, aa: false, particles: 0.5, far: 70 },
  medium: { name: 'medium', maxDpr: 1.75, shadow: 1024, post: false, aa: true, particles: 0.8, far: 95 },
  high: { name: 'high', maxDpr: 2.5, shadow: 2048, post: true, aa: true, particles: 1, far: 120 },
};

function readTier(params) {
  let saved = '';
  try { saved = (JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}).quality || ''; } catch (e) { saved = ''; }
  const want = params.q || saved;
  return { ...(TIERS[want] || TIERS.medium) };
}

function gradientAlpha() {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 128; const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 128);
  // top of the wall (canvas top) is clear, the foot is solid; an eased ramp avoids visible bands
  for (let i = 0; i <= 16; i++) { const k = i / 16; const a = Math.pow(k, 1.7); const v = Math.round(255 * a); g.addColorStop(k, `rgb(${v},${v},${v})`); }
  c.fillStyle = g; c.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; return t;
}

// The stock puff and glow textures are 16 px and 32 px with alpha quantised to a few steps and nearest filtering:
// every particle reads as a hard square. Swap in smooth radial gradients with linear filtering.
function softenSprites() {
  const make = (key, size, stops, tint) => {
    const t = BZ.tex(key); const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d');
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [k, a] of stops) g.addColorStop(k, `rgba(${tint},${a})`);
    c.fillStyle = g; c.fillRect(0, 0, size, size);
    t.image = cv; t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  };
  make('puff', 64, [[0, 1], [0.35, 0.8], [0.65, 0.3], [0.85, 0.07], [1, 0]], '255,255,255');
  make('glow', 64, [[0, 1], [0.2, 0.7], [0.5, 0.25], [0.8, 0.05], [1, 0]], '255,255,255');
}

export async function createHost({ frame, canvas, params }) {
  const quality = readTier(params || {});
  const G = {
    THREE, events: BZ.events(), rng: BZ.rng(+(params && params.seed) || 7), state: 'playing', quality,
    settings: { ...BZ.SETTINGS_DEF }, wave: { n: 1, total: 5 }, env: { zHp: 1, zSpeed: 1, zDmg: 1 },
    party: { hp: () => 1 }, build: { has: () => false }, hero: { ghost: () => false, decoy: () => null, chill: () => false },
    meta: { dmgMul: () => 1 }, allies: { nearest: () => null }, gear: { throwRock() {}, explode() {} }, sky: { weather: () => 'clear' },
  };
  G.settings.quality = quality.name;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.aa, powerPreference: 'high-performance', stencil: false });
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = quality.shadow > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  G.renderer = renderer;

  const scene = (G.scene = new THREE.Scene());
  scene.fog = new THREE.Fog(0xa9b6c4, 150, 400);
  const camera = (G.camera = new THREE.PerspectiveCamera(30, 360 / 780, 1, 500));
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  // Blockade Z's daylight (sky.js DAY: sky 0xdce8ff, ground 0x6a5e4c, 1.7; sun 0xfff2dc, 2.3), dimmed in rain by setRain;
  // the ground bounce lifted a little so the toy colours keep their undersides
  const hemi = new THREE.HemisphereLight(0xdce8ff, 0x8a7e6a, 1.7); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.3);
  sun.castShadow = quality.shadow > 0;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(quality.shadow, quality.shadow);
    const c = sun.shadow.camera; c.left = -22; c.right = 22; c.top = 22; c.bottom = -22; c.near = 5; c.far = 90;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  }
  scene.add(sun); scene.add(sun.target);
  G.hemi = hemi; G.sun = sun; const skyBase = new THREE.Color(0xdce8ff);

  // ---- the player shim: only a listener position for audio and a focus for the camera ----
  G.player = { pos: new THREE.Vector3(), yaw: 0, vel: new THREE.Vector3(), alive: true, hp: 100, maxHp: 100, shake: BZ.spring(120, 9), slowT: 0, rootT: 0 };

  // ---- a flat world: floor at y = 0 and nothing solid ----
  const HALF = 21;
  G.world = {
    HALF, spawns: [], updateFlow() {}, flowDir: () => null, lineOfSight: () => true,
    raycast(o, d, max = 100) {
      if (d.y >= -1e-6) return null;
      const t = -o.y / d.y; if (t < 0 || t > max) return null;
      return { t, normal: new THREE.Vector3(0, 1, 0), tag: 'ground' };
    },
    overlaps: () => null,
    moveBox(pos, vel, dt, r, h, out) {
      pos.x += vel.x * dt; pos.y += vel.y * dt; pos.z += vel.z * dt;
      if (pos.y < 0) { pos.y = 0; if (vel.y < 0) vel.y = 0; }
      if (out) { out.ground = pos.y <= 1e-4; out.hitX = out.hitZ = out.ceil = out.stepUp = false; }
      return out;
    },
  };
  G.ui = { pop() {}, announce() {}, banner() {}, update() {} };
  G.coop = { guest: true, host: false, on: false, remotes: () => [], reportHit() {}, hurtRemote() {}, me: 'h' };

  // ---- the floor: Blockade Z's ground technique per chapter, melting into the fog colour past the fight area ----
  const floorK = createFloor({ scene, quality });
  const floor = floorK.group;
  const ring = new THREE.Object3D(); ring.visible = false;

  // far half of a cylinder only: back faces are the wall seen from inside, the near half is culled by the camera side
  const wallMat = new THREE.MeshBasicMaterial({ color: 0xa9b6c4, alphaMap: gradientAlpha(), transparent: true, side: THREE.BackSide, depthWrite: false, fog: false });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(WALL_R, WALL_R, 9, 64, 1, true), wallMat);
  wall.position.y = 4.4; wall.renderOrder = 5; wall.visible = false; scene.add(wall);

  // ---- rain: instanced streaks that wrap around the camera focus, plus a few splashes ----
  const NP = Math.round(380 * Math.max(0.4, quality.particles));
  const precip = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xe6eef8, transparent: true, opacity: 0.22, depthWrite: false, fog: false }), NP);
  precip.frustumCulled = false; precip.count = NP; precip.renderOrder = 6; scene.add(precip);
  const pr = BZ.rng('precip'); const pts = [];
  for (let i = 0; i < NP; i++) pts.push(new THREE.Vector3(pr.range(-16, 16), pr.range(0, 18), pr.range(-16, 16)));
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3(0.045, 0.8, 0.045); const pv = new THREE.Vector3();
  q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(3, -24, 0.9).normalize().negate());
  let rainOn = true;
  function updateRain(dt) {
    const f = G.player.pos;
    for (let i = 0; i < NP; i++) {
      const p = pts[i]; p.y -= 24 * dt; p.x += 3 * dt; p.z += 0.9 * dt;
      if (p.y < 0) p.y += 18;
      const x = (((p.x - f.x) % 32) + 48) % 32 - 16 + f.x; const z = (((p.z - f.z) % 32) + 48) % 32 - 16 + f.z;
      m4.compose(pv.set(x, p.y, z), q, sc); precip.setMatrixAt(i, m4);
      if (i % 97 === 0 && G.rng.chance(dt * 30)) G.fx.puff(new THREE.Vector3(x, 0.05, z), { s0: 0.08, s1: 0.4, life: 0.25, c0: 0xb8c8e0, a0: 0.5 });
    }
    precip.instanceMatrix.needsUpdate = true;
  }

  // ---- bz layers that need the pieces above ----
  G.fx = BZ.makeFx(G);
  softenSprites();
  // the additive glow billboards stack (a revive column is 14 of them): over the pale floors they burned a white bar into
  // the frame, so they add a little less
  scene.traverse((o) => { const m = o.isInstancedMesh && o.material; if (m && m.fragmentShader && m.fragmentShader.includes('vC * t.a * vA, 1.0')) { m.fragmentShader = m.fragmentShader.replace('vC * t.a * vA, 1.0', 'vC * t.a * vA * 0.55, 1.0'); m.needsUpdate = true; } });
  // Blockade Z's fullscreen white flash div is never wanted here
  for (const el of [...document.body.children]) if (el.style && el.style.position === 'fixed' && el.style.zIndex === '5' && !el.id) el.remove();
  G.audio = BZ.makeAudio(G);
  for (let i = 0; i < 6; i++) G.audio.update();
  if (G.audio.setMusic) G.audio.setMusic({ music_drone: 0.35, wind: 0.3, rain: 0.5 });
  window.addEventListener('pointerdown', () => { if (G.audio.unlock) G.audio.unlock(); }, { once: true });
  G.zombies = BZ.makeZombies(G);
  // the old Blockade Z's post: its 3-level bloom, on high only (on medium the white-hot casts clip under it)
  G.post = BZ.makePost(G);
  const postCan = !!G.post.on;
  G.post.on = postCan && quality.post; G.post.strength = 0.32;

  // ---- sizing ----
  const size = { w: 360, h: 780, u: 1, dpr: 1, scale: 1 };
  const gov = { k: 1, shadows: quality.shadow > 0, post: G.post.on };
  function resize() {
    const r = frame.getBoundingClientRect(); const w = Math.max(2, Math.round(r.width)); const h = Math.max(2, Math.round(r.height));
    size.w = w; size.h = h; size.u = w / 360;
    size.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, quality.maxDpr * gov.k));
    renderer.setPixelRatio(size.dpr); renderer.setSize(w, h, false);
    size.scale = renderer.domElement.width / w;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    H.stats.scale = size.scale;
  }

  const stats = { frameMs: 16, draws: 0, tris: 0, scale: 1 };
  const H = { THREE, renderer, scene, camera, G, quality, size, resize, stats, floor, ring, wall, floorK, get floorMeshes() { return floorK.meshes; } };

  H.setStage = (def) => {
    const fog = new THREE.Color(def.fog);
    scene.fog.color.copy(fog); scene.background = fog; renderer.setClearColor(fog, 1);
    wallMat.color.copy(fog);
    floorK.setStage(def);
    hemi.color.copy(skyBase).lerp(fog, 0.25);
  };
  H.setStage({ chapter: 0, fog: 0xa9b6c4 });

  H.update = (dt) => {
    G.fx.update(dt); G.audio.update();
    if (rainOn) updateRain(dt);
    floorK.update(dt);
    const f = G.player.pos;
    sun.position.set(f.x - 12, 32, f.z + 14); sun.target.position.set(f.x, 0, f.z); sun.target.updateMatrixWorld();
  };

  // lower shadows and bloom first, then the pixel ratio down to the 1.0 floor, never below
  function degrade() {
    if (gov.shadows) { gov.shadows = false; sun.castShadow = false; return; }
    if (gov.post) { gov.post = false; G.post.on = false; return; }
    if (size.dpr > 1.001) { gov.k = Math.max(0.5, gov.k * 0.85); resize(); }
  }
  const drive = !navigator.webdriver;
  const slow = { acc: 0, n: 0, cool: 0 };
  let last = performance.now();
  H.render = (overlay) => {
    const now = performance.now(); const dt = now - last; last = now;
    if (dt < 250) {
      stats.frameMs += (dt - stats.frameMs) * 0.1;
      if (drive) { slow.acc += dt; slow.n++; if (slow.n >= 60) { const avg = slow.acc / slow.n; slow.acc = slow.n = 0; if (avg > FAR_MS && slow.cool-- <= 0) { degrade(); slow.cool = 2; } } }
    }
    renderer.info.reset();
    const post = G.post.on;
    if (post) G.post.begin(); else renderer.clear();
    renderer.render(scene, camera);
    if (post) G.post.end();
    if (overlay) { renderer.clearDepth(); overlay(renderer); }
    stats.draws = renderer.info.render.calls; stats.tris = renderer.info.render.triangles; stats.scale = size.scale;
  };

  // the old Blockade Z's light per weather (sky.js DAY, rain dims it to 0.75) and its bloom rule (main.js: stronger the
  // weaker the sun)
  H.setRain = (on) => {
    rainOn = !!on; precip.visible = rainOn; floorK.setWet(rainOn ? 1 : 0);
    // rain cools the light toward the old game's moonlit blue (sky.js NIGHT: sky 0x8aa6e6, sun 0xb4c8ff)
    const dim = rainOn ? 0.75 : 1; hemi.intensity = 1.7 * dim; sun.intensity = 2.3 * dim;
    sun.color.set(0xfff2dc).lerp(new THREE.Color(0xb4c8ff), rainOn ? 0.45 : 0); skyBase.set(0xdce8ff).lerp(new THREE.Color(0x8aa6e6), rainOn ? 0.4 : 0);
    hemi.color.copy(skyBase).lerp(scene.fog.color, 0.25);
    G.post.strength = BZ.lerp(0.85, 0.3, BZ.clamp((sun.intensity - 1.1) / 1.2, 0, 1)) * 0.6;
  };
  H.setRain(true);
  if (params && params.weather === 'clear') H.setRain(false); // test switch: the floor without rain
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => resize()).observe(frame);
  window.addEventListener('resize', resize);
  resize();
  return H;
}
