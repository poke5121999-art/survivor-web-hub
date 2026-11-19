// The view host: renderer, scene, lights, the flat arena floor with its fog wall, rain, and the small `G` object
// that Blockade Z's fx, audio, zombie and boss code expects. The sim never touches it; actors.js and camera.js
// read H and draw the battle on top.
const THREE = window.THREE;
const BZ = window.BZ;

const SETTINGS_KEY = 'aisinhton.settings.v1';
export const ARENA_VIEW_R = 14;
const FLOOR_R = 30;
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

// The floor is one big painted canvas (world x,z -> canvas pixels, centre at the origin): light chapter-coloured
// tiles with a bold dark grid, the arena ring with a hazard band, lane marks and rain puddles. It is redrawn per stage.
const PX_PER_M = 40;
const CANVAS = FLOOR_R * 2 * PX_PER_M;
const TILE_M = 2;

function hsl(h, s, l, a = 1) { return `hsla(${Math.round(h * 360)},${Math.round(s * 100)}%,${Math.round(l * 100)}%,${a})`; }

function paintFloor(cv, floorHex, accentHex) {
  const c = cv.getContext('2d'); const rng = BZ.rng('floor' + floorHex);
  const base = new THREE.Color(floorHex); const hs = {}; base.getHSL(hs);
  const h = hs.h; const sat = Math.min(0.72, hs.s * 2.1 + 0.3); const L = 0.66;
  const half = CANVAS / 2; const T = TILE_M * PX_PER_M;
  c.clearRect(0, 0, CANVAS, CANVAS);
  c.fillStyle = hsl(h, sat, L - 0.2); c.fillRect(0, 0, CANVAS, CANVAS);
  const n = Math.ceil(CANVAS / T);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i * T - (half % T); const y = j * T - (half % T);
    const v = rng.range(-0.045, 0.045); const hh = h + rng.range(-0.012, 0.012);
    c.fillStyle = hsl(hh, sat, L + v); c.fillRect(x + 3, y + 3, T - 6, T - 6);
    const g = c.createLinearGradient(x, y, x + T, y + T);
    g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,40,.12)');
    c.fillStyle = g; c.fillRect(x + 3, y + 3, T - 6, T - 6);
    c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(x + 3, y + 3, T - 6, 3); c.fillRect(x + 3, y + 3, 3, T - 6);
    c.fillStyle = 'rgba(0,0,30,.16)'; c.fillRect(x + 3, y + T - 6, T - 6, 3); c.fillRect(x + T - 6, y + 3, 3, T - 6);
    for (let k = 0; k < 5; k++) { c.fillStyle = `rgba(${rng.chance(0.5) ? '0,0,30' : '255,255,255'},${rng.range(0.03, 0.07)})`; c.fillRect(x + rng.range(8, T - 20), y + rng.range(8, T - 20), rng.range(4, 18), rng.range(3, 12)); }
  }
  const W = (m) => m * PX_PER_M;
  c.save(); c.translate(half, half);
  const ring = (r, w, col) => { c.beginPath(); c.arc(0, 0, W(r), 0, Math.PI * 2); c.lineWidth = W(w); c.strokeStyle = col; c.stroke(); };
  const deep = hsl(h, Math.min(0.85, sat + 0.1), 0.26); const acc = new THREE.Color(accentHex); const ah = {}; acc.getHSL(ah);
  // lane marks and an emblem in the middle
  c.setLineDash([W(0.9), W(0.7)]);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; c.beginPath(); c.moveTo(Math.cos(a) * W(4.4), Math.sin(a) * W(4.4)); c.lineTo(Math.cos(a) * W(11.8), Math.sin(a) * W(11.8)); c.lineWidth = W(0.22); c.strokeStyle = 'rgba(255,255,255,.42)'; c.stroke(); }
  c.setLineDash([]);
  ring(3.2, 0.26, 'rgba(255,255,255,.5)'); ring(3.9, 0.12, 'rgba(255,255,255,.3)'); ring(7.5, 0.16, 'rgba(255,255,255,.22)');
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4; c.save(); c.rotate(a); c.translate(W(9.6), 0);
    c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.moveTo(W(0.9), 0); c.lineTo(-W(0.6), -W(0.9)); c.lineTo(-W(0.2), 0); c.lineTo(-W(0.6), W(0.9)); c.closePath(); c.fill(); c.restore();
  }
  // hazard band hugging the ring: slanted dark and accent blocks
  const N = 96; const r0 = 12.9; const r1 = 13.55;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2; const a1 = (i + 1) / N * Math.PI * 2; const sk = (a1 - a0) * 0.9;
    c.fillStyle = i % 2 ? hsl(ah.h, 0.95, 0.56) : 'rgba(25,28,48,.88)';
    c.beginPath(); c.moveTo(Math.cos(a0) * W(r0), Math.sin(a0) * W(r0)); c.lineTo(Math.cos(a1) * W(r0), Math.sin(a1) * W(r0));
    c.lineTo(Math.cos(a1 + sk) * W(r1), Math.sin(a1 + sk) * W(r1)); c.lineTo(Math.cos(a0 + sk) * W(r1), Math.sin(a0 + sk) * W(r1)); c.closePath(); c.fill();
  }
  ring(14.05, 0.62, deep); ring(13.78, 0.1, 'rgba(255,255,255,.85)'); ring(14.4, 0.1, 'rgba(255,255,255,.6)'); ring(12.82, 0.08, 'rgba(25,28,48,.6)');
  // puddles that mirror the sky
  for (let k = 0; k < 9; k++) {
    const a = rng.range(0, 6.283); const d = Math.sqrt(rng.next()) * 11.5 + 1; const w = rng.range(0.9, 2.1); const hgt = w * rng.range(0.45, 0.7); const rot = rng.range(0, 3.1);
    c.save(); c.translate(Math.cos(a) * W(d), Math.sin(a) * W(d)); c.rotate(rot);
    c.beginPath(); c.ellipse(0, 0, W(w), W(hgt), 0, 0, Math.PI * 2); c.fillStyle = 'rgba(190,225,255,.62)'; c.fill(); c.lineWidth = W(0.1); c.strokeStyle = hsl(h, sat, 0.34, 0.8); c.stroke();
    c.beginPath(); c.ellipse(-W(w * 0.15), -W(hgt * 0.25), W(w * 0.6), W(hgt * 0.4), 0, Math.PI * 1.05, Math.PI * 1.95); c.lineWidth = W(0.11); c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke();
    c.restore();
  }
  c.restore();
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

  const hemi = new THREE.HemisphereLight(0xeef4ff, 0xc4c0b8, 2.3); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3dc, 1.5);
  sun.castShadow = quality.shadow > 0;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(quality.shadow, quality.shadow);
    const c = sun.shadow.camera; c.left = -22; c.right = 22; c.top = 22; c.bottom = -22; c.near = 5; c.far = 90;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  }
  scene.add(sun); scene.add(sun.target);
  G.hemi = hemi; G.sun = sun;

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

  // ---- the floor: tiled and tinted per chapter, melting into the fog colour past the fight area ----
  const fogCol = new THREE.Color(0xa9b6c4);
  const floorU = { uFogC: { value: fogCol }, uR0: { value: 17 }, uR1: { value: 27 } };
  const floorCv = document.createElement('canvas'); floorCv.width = floorCv.height = CANVAS;
  const floorTex = new THREE.CanvasTexture(floorCv);
  floorTex.colorSpace = THREE.SRGBColorSpace; floorTex.anisotropy = 8; floorTex.generateMipmaps = true; floorTex.minFilter = THREE.LinearMipmapLinearFilter;
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex, color: 0xffffff, dithering: true });
  floorMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, floorU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vWP; uniform vec3 uFogC; uniform float uR0; uniform float uR1;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uFogC, smoothstep(uR0, uR1, length(vWP)));');
  };
  const floor = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_R, 96), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
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
  // Blockade Z's fullscreen white flash div is never wanted here
  for (const el of [...document.body.children]) if (el.style && el.style.position === 'fixed' && el.style.zIndex === '5' && !el.id) el.remove();
  G.audio = BZ.makeAudio(G);
  for (let i = 0; i < 6; i++) G.audio.update();
  if (G.audio.setMusic) G.audio.setMusic({ music_drone: 0.35, wind: 0.3, rain: 0.5 });
  window.addEventListener('pointerdown', () => { if (G.audio.unlock) G.audio.unlock(); }, { once: true });
  G.zombies = BZ.makeZombies(G);
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
  const H = { THREE, renderer, scene, camera, G, quality, size, resize, stats, floor, ring, wall, floorMat };

  H.setStage = (def) => {
    const fog = new THREE.Color(def.fog);
    fogCol.copy(fog); scene.fog.color.copy(fog); scene.background = fog; renderer.setClearColor(fog, 1);
    wallMat.color.copy(fog);
    const key = def.floor + ':' + def.fog;
    if (H.stageKey !== key) {
      H.stageKey = key;
      paintFloor(floorCv, def.floor, 0xffc83a);
      floorTex.needsUpdate = true;
    }
    hemi.color.set(0xeef4ff).lerp(fog, 0.25);
  };
  H.setStage({ floor: 0x8f9aa6, fog: 0xa9b6c4 });

  H.update = (dt) => {
    G.fx.update(dt); G.audio.update();
    if (rainOn) updateRain(dt);
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

  H.setRain = (on) => { rainOn = !!on; precip.visible = rainOn; };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => resize()).observe(frame);
  window.addEventListener('resize', resize);
  resize();
  return H;
}
