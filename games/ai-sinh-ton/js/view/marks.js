// Ground layer: warning marks that fill up before an attack lands (with a falling projectile for `fall` marks),
// lingering zones animated from the live sim zone, shock bursts and ground flares. Everything is a flat mesh just above
// the floor, drawn by a few small shaders, so it stays cheap and reads from above.
// No effect here is a ruled circle (Addendum 8.5 / 9.4): a warning is a scorched decal with a torn outline whose fill
// creeps from its origin to the far edge over the wind-up (the hit lands when it is full), a boss warning adds a crimson
// colour and a crawl of teeth outside its outline, a hero's own skill area is only a thin cool outline and fill front;
// a shock is a burst of broken dust streaks, a ground flare a spray of rays, the edge wash a ragged glow off the rim.
import { ARENA } from '../sim/battle.js?v=20261124a';
import { PXQ, FX_PX, pixTex } from './fx/pixel.js?v=20261124a';
const THREE = window.THREE;

const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.1 + 7.0) * 0.3 + vnoise(p * 4.3 + 3.0) * 0.15; }
${PXQ}
#define PX ${FX_PX.toFixed(3)}`;
const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

// One warning per instance: vP = (fill 0..1, opacity, shape 0 circle / 1 line / 2 cone, cone half angle), vS = size (m),
// vC = colour, vT = 0 hero skill area, 1 enemy, 2 boss. `edge` is metres inside the outline, `prog` how far from where the
// fill starts (circle and cone: the centre and apex; line: the caster's end) a point is, 0..1.
const TELE_FRAG = `
uniform float uTime; varying vec4 vP; varying vec2 vS; varying vec3 vC; varying float vT; varying vec2 vUv;
${NOISE}
void main() {
  float K = vP.x; float A = vP.y; float shape = vP.z; float hang = vP.w;
  vec2 m = pxq((vUv - 0.5) * vS, max(PX, max(vS.x, vS.y) / 28.0)); float boss = step(1.5, vT); float hero = 1.0 - step(0.5, vT);
  float edge; float prog; float s;
  if (shape < 0.5) { float R = vS.x * 0.5; float d = length(m); edge = R - d; prog = d / R; s = atan(m.y, m.x) * R; }
  else if (shape < 1.5) { vec2 h = vS * 0.5; edge = min(h.x - abs(m.x), h.y - abs(m.y)); prog = (m.x + h.x) / vS.x; s = m.x + abs(m.y) * 2.0; }
  else { float R = vS.x * 0.5; float d = length(m); float an = abs(atan(m.y, m.x)); edge = min(R - d, (hang - an) * d); prog = d / R; s = atan(m.y, m.x) * R; }
  // the quad is the outline's box: the torn outline only ever pulls inward from it
  float amp = mix(0.2, 0.26, boss);
  float e = edge - amp + (fbm(m * 1.15 + 3.1) - 0.5) * 2.4 * amp;
  // boss teeth: little crimson triangles standing out of the outline, crawling round it
  float tt = fract(s / 0.8 - uTime * 0.55); float tooth = boss * step(e, 0.0) * step(-e, 0.32 * (1.0 - abs(tt * 2.0 - 1.0)) - 0.02);
  if (e < 0.0 && tooth < 0.5) discard;
  float inside = step(0.0, e);
  float n2 = vnoise(m * 2.6 + 7.0); // one octave is enough for the front and the cracks: the edge alone takes the full fbm
  float fr = K - prog + (n2 - 0.5) * 0.14;
  float filled = smoothstep(0.0, 0.03, fr) * inside;
  float front = (1.0 - smoothstep(0.0, 0.05, abs(fr))) * step(K, 0.995) * inside;
  float crack = (1.0 - smoothstep(0.0, 0.045, abs(vnoise(m * 0.85 + 11.0) * 0.7 + vnoise(m * 2.1 + 5.0) * 0.3 - 0.5))) * inside;
  float soot = (1.0 - smoothstep(0.0, 0.3, e)) * inside;
  float hot = (1.0 - smoothstep(0.02, mix(0.07, 0.1, boss), abs(e - 0.11))) * inside;
  float pulse = smoothstep(0.8, 1.0, K) * (0.5 + 0.5 * sin(uTime * 28.0));
  vec3 bright = min(vec3(1.0), vC * 1.25 + 0.22);
  vec3 col = vC * mix(0.72, 0.85, boss); float a = inside * mix(0.3, 0.42, boss);
  col = mix(col, vC, filled); a = max(a, filled * mix(0.48, 0.58, boss));
  col = mix(col, mix(vC * 0.2, bright, filled), crack * 0.8); a += crack * (0.16 + 0.22 * filled);
  col *= 1.0 - soot * 0.72; a = max(a, soot * 0.78);
  col = mix(col, bright, hot); a = max(a, hot * 0.95);
  col = mix(col, vec3(1.0, 0.95, 0.85), front * 0.65); a = max(a, front * 0.92);
  col = mix(col, bright, tooth); a = max(a, tooth * 0.95);
  col = mix(col, vec3(1.0), pulse * 0.22); a = min(1.0, a + pulse * 0.15 * inside);
  // a hero's own area: no dark soot and no solid fill, only the cool outline, the creeping front and a faint wash
  if (hero > 0.5) { col = mix(vC, bright, hot + front); a = inside * 0.06 + filled * 0.08 + hot * 0.7 + front * 0.6 + crack * filled * 0.06; }
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, min(1.0, a) * A);
}`;

const ZONE_FRAG = `
uniform float uStyle; uniform float uT; uniform float uA; uniform float uHalf; uniform vec3 uC1; uniform vec3 uC2; uniform float uR;
varying vec2 vUv; ${NOISE}
void main() {
  vec2 m = pxq((vUv - 0.5) * 2.0 * uR, max(PX, uR / 14.0)) / uR; float d = length(m); float an = atan(m.y, m.x);
  float edge = uHalf > 0.0 ? min(1.0 - d, (uHalf - abs(an)) * d) : 1.0 - d; edge *= uR;
  edge += (fbm(m * uR * 0.8 + 5.0) - 0.5) * 0.8 - 0.4; // torn outline, pulled inside the quad
  float inside = step(0.0, edge);
  float rim = (1.0 - smoothstep(0.05, 0.28, edge)) * inside;
  float soft = smoothstep(0.0, 0.9, edge);
  vec2 p = m * uR * 0.55; vec3 col = uC1; float a = 0.0;
  if (uStyle < 0.5) {
    float n = fbm(p * 1.4 + vec2(0.0, -uT * 1.7)); float heat = smoothstep(0.25, 0.85, n + (1.0 - d) * 0.45);
    col = mix(uC1, uC2, heat); a = 0.4 + 0.45 * heat;
  } else if (uStyle < 1.5) {
    float n = fbm(p * 0.9 + vec2(uT * 0.25, uT * 0.18)); float bub = step(0.86, vnoise(p * 3.2 + floor(uT * 1.5)));
    col = mix(uC1, uC2, n + bub * 0.6); a = 0.38 + 0.3 * n + bub * 0.3;
  } else if (uStyle < 2.5) {
    float sw = an + uT * 1.4 + d * 3.5; float st = 0.5 + 0.5 * sin(sw * 5.0 + fbm(p) * 6.0);
    col = mix(uC1, uC2, st); a = 0.1 + 0.75 * st * st;
  } else if (uStyle < 3.5) {
    float ln = 1.0 - smoothstep(0.0, 0.07, abs(fract(an * 8.0 / 3.14159) - 0.5) * 2.0 * d * 1.2 - 0.0);
    float rg = 1.0 - smoothstep(0.0, 0.07, abs(fract(d * 4.0) - 0.5) * 2.0 - 0.0);
    float web = max(ln, rg * 0.9); col = mix(uC1, uC2, web); a = 0.1 + web * 0.75;
  } else if (uStyle < 4.5) {
    float rg = fract(d * 3.0 + uT * 1.3 + fbm(p * 1.5) * 0.6); float band = smoothstep(0.0, 0.2, rg) * (1.0 - smoothstep(0.3, 0.7, rg));
    col = mix(uC1, uC2, band); a = 0.22 + 0.5 * band;
  } else {
    float pulse = 0.75 + 0.25 * sin(uT * 18.0); float g = pow(clamp(1.0 - d + (fbm(p * 1.3 + uT * 0.6) - 0.5) * 0.4, 0.0, 1.0), 1.6);
    col = mix(uC1, uC2, g); a = (0.1 + 0.55 * g) * pulse;
  }
  // a wind swirl (style 2) keeps only a trace of its outline: its bands carry it
  a = a * inside * (0.35 + 0.65 * soft) + rim * (uStyle > 1.5 && uStyle < 2.5 ? 0.15 : 0.75) * inside;
  col = mix(col, min(vec3(1.0), uC2 * 1.2 + 0.1), rim * 0.55);
  gl_FragColor = vec4(col, a * uA);
}`;

// what falls on a warning is a block: a stone, a burning lump, a bomb with a lit fuse, a shell with a hot nose, a gob
const FALL_BOX = (sx, sy, sz, m) => new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
const FALL_LOOK = {
  rock: () => FALL_BOX(1.2, 1.0, 1.1, new THREE.MeshLambertMaterial({ color: 0x8a7a68 })),
  meteor: () => FALL_BOX(1.2, 1.2, 1.2, new THREE.MeshBasicMaterial({ color: 0xff8a30 })),
  bomb: () => { const g = new THREE.Group(); g.add(FALL_BOX(0.8, 0.8, 0.8, new THREE.MeshLambertMaterial({ color: 0x2a2e3c }))); const c = FALL_BOX(0.2, 0.3, 0.2, new THREE.MeshBasicMaterial({ color: 0xff4a30 })); c.position.y = 0.55; g.add(c); return g; },
  shell: () => { const g = new THREE.Group(); g.add(FALL_BOX(0.4, 1.0, 0.4, new THREE.MeshLambertMaterial({ color: 0x8a929e }))); const n = FALL_BOX(0.28, 0.36, 0.28, new THREE.MeshLambertMaterial({ color: 0xff7a30 })); n.position.y = -0.68; g.add(n); return g; },
  acid: () => FALL_BOX(0.8, 0.8, 0.8, new THREE.MeshBasicMaterial({ color: 0x9cff3a })),
  blood: () => FALL_BOX(0.72, 0.72, 0.72, new THREE.MeshBasicMaterial({ color: 0xd8203a })),
  nade: () => FALL_BOX(0.62, 0.62, 0.62, new THREE.MeshLambertMaterial({ color: 0x6a8a3a })),
};
const FALL_H = 22;
const FALL_SIDE = 7; // a falling shell starts this far to the side and arcs in, so the throw reads from above

const FLARE_K = 0.65;
// hard caps on live ground meshes: past them the oldest is recycled
const CAP = { teles: 24, zones: 12 };
const TELE_GRACE = 0.15; // a warning is gone this long after its own t at the latest
const ZONE_GRACE = 1.0;  // a zone the sim no longer holds is ended after this long

export function createMarks(H) {
  const { scene, G } = H;
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  // a burst of n broken dust streaks between radius ~0.5 and 1, each a quad narrow at its inner end; uv.y runs inner to outer
  const streakGeo = (() => {
    let sd = 7; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const pos = []; const uv = []; const idx = []; const n = 22;
    for (let i = 0; i < n; i++) {
      const a = ((i + rnd() * 0.7) / n) * Math.PI * 2; const hw = (0.45 + rnd() * 0.5) * Math.PI / n; const r0 = 0.45 + rnd() * 0.3; const r1 = 0.86 + rnd() * 0.16; const k = pos.length / 3;
      for (const [t, r, u, v] of [[a - hw * 0.25, r0, 0, 0], [a + hw * 0.25, r0, 1, 0], [a + hw, r1, 1, 1], [a - hw, r1, 0, 1]]) { pos.push(Math.cos(t) * r, Math.sin(t) * r, 0); uv.push(u, v); }
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  })();
  // the streaks' texture: dust thickening toward the outer end, soft sides, speckled
  const streakTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 64; const c = cv.getContext('2d'); const img = c.createImageData(32, 64);
    let sd = 11; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
      const v = y / 63; const u = Math.abs(x / 31 - 0.5) * 2; const along = Math.pow(v, 0.8) * (1 - Math.pow(Math.max(0, v - 0.86) / 0.14, 2));
      const a = Math.max(0, along * (1 - u * u) * (0.6 + 0.4 * rnd()) * (rnd() < 0.08 ? 0.3 : 1)); const o = (y * 32 + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(255 * Math.min(1, a * 1.6));
    }
    c.putImageData(img, 0, 0); return pixTex(cv, 8, 16);
  })();
  // a ground flare: a spray of uneven rays from a small hot core
  const raysTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const c = cv.getContext('2d'); c.translate(64, 64);
    let sd = 23; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2 + rnd() * 0.3; const L = 24 + rnd() * 38; const r0 = 4 + rnd() * 8; const w = 0.025 + rnd() * 0.035;
      const g = c.createLinearGradient(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * L, Math.sin(a) * L); g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(Math.cos(a - w * 3) * r0, Math.sin(a - w * 3) * r0); c.lineTo(Math.cos(a) * L, Math.sin(a) * L); c.lineTo(Math.cos(a + w * 3) * r0, Math.sin(a + w * 3) * r0); c.closePath(); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(-5, -5, 10, 10); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-9, -9, 18, 18);
    return pixTex(cv, 32, 32);
  })();
  // the arena-edge wash: a band of square cells just inside the rim, snapped to a grid like pixels; the outer row is
  // whole, the inner rows thin out at random, so the inner edge is ragged (unit circle, scaled to the arena)
  const washGeo = (() => {
    const pos = []; const col = []; const idx = []; let sd = 31; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const C = 0.035; const seen = new Set();
    const cell = (x, y, a) => {
      const gx = Math.round(x / C); const gy = Math.round(y / C); const k = gx + ',' + gy; if (seen.has(k)) return; seen.add(k);
      const cx = gx * C; const cy = gy * C; const h = C * 0.5; const b = pos.length / 3;
      for (const [dx, dy] of [[-h, -h], [h, -h], [h, h], [-h, h]]) { pos.push(cx + dx, cy + dy, 0); col.push(1, 1, 1, a); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (let i = 0; i < 220; i++) {
      const t = (i / 220) * Math.PI * 2; const c = Math.cos(t); const s2 = Math.sin(t);
      for (let row = 0; row < 7; row++) { const r = 0.98 - row * C; const keep = row < 2 ? 1 : 1 - row / 7.5; if (rnd() < keep) cell(c * r, s2 * r, row === 0 ? 0.55 : 1 - row * 0.12); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); return g;
  })();
  const teles = []; const falls = []; const zones = new Map(); const fades = [];
  let clock = 0; let lastB = null; let lastSimT = -1;
  const flat = (mesh, x, z, y = 0.05) => { mesh.rotation.order = 'YXZ'; mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); mesh.renderOrder = 3; mesh.frustumCulled = false; scene.add(mesh); return mesh; };
  const col3 = (hex) => new THREE.Color(hex);

  // ---- warnings ----
  // All warnings are one instanced mesh, one draw call: each record keeps a stand-in mesh outside the scene (its position,
  // rotation, scale and visible flag, which the tools read and hide) and its uniforms as plain values, copied into instance
  // attributes every frame. The fragment shader is TELE_FRAG with the per-warning uniforms read from varyings.
  const pose = (mesh, x, z, y = 0.05) => { mesh.rotation.order = 'YXZ'; mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); return mesh; };
  const standMat = new THREE.MeshBasicMaterial();
  const teleGeo = planeGeo.clone();
  const tP = new THREE.InstancedBufferAttribute(new Float32Array(CAP.teles * 4), 4); tP.setUsage(THREE.DynamicDrawUsage); teleGeo.setAttribute('iP', tP);
  const tS = new THREE.InstancedBufferAttribute(new Float32Array(CAP.teles * 2), 2); tS.setUsage(THREE.DynamicDrawUsage); teleGeo.setAttribute('iS', tS);
  const tC = new THREE.InstancedBufferAttribute(new Float32Array(CAP.teles * 3), 3); tC.setUsage(THREE.DynamicDrawUsage); teleGeo.setAttribute('iC', tC);
  const tT = new THREE.InstancedBufferAttribute(new Float32Array(CAP.teles), 1); tT.setUsage(THREE.DynamicDrawUsage); teleGeo.setAttribute('iT', tT);
  const teleU = { uTime: { value: 0 } };
  const teleB = new THREE.InstancedMesh(teleGeo, new THREE.ShaderMaterial({
    uniforms: teleU, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: 'attribute vec4 iP; attribute vec2 iS; attribute vec3 iC; attribute float iT; varying vec2 vUv; varying vec4 vP; varying vec2 vS; varying vec3 vC; varying float vT;\nvoid main() { vUv = uv; vP = iP; vS = iS; vC = iC; vT = iT; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: TELE_FRAG,
  }), CAP.teles);
  teleB.name = 'teleB'; teleB.frustumCulled = false; teleB.renderOrder = 3; teleB.count = 0; teleB.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(teleB);
  function flushTeles() {
    let n = 0; teleU.uTime.value = clock;
    for (const t of teles) {
      const m = t.mesh; const u = t.uni; if (!m.visible || n >= CAP.teles) continue;
      m.updateMatrix(); teleB.setMatrixAt(n, m.matrix);
      tP.setXYZW(n, u.uK.value, u.uA.value, u.uShape.value, u.uHalf.value); tS.setXY(n, u.uSize.value.x, u.uSize.value.y); tC.setXYZ(n, u.uCol.value.r, u.uCol.value.g, u.uCol.value.b); tT.setX(n, t.kind); n++;
    }
    teleB.count = n; teleB.instanceMatrix.needsUpdate = true; tP.needsUpdate = true; tS.needsUpdate = true; tC.needsUpdate = true; tT.needsUpdate = true;
  }
  // a normal warning is orange-red, a boss warning crimson with teeth, a hero's own area a pale cool blue
  const ENEMY_COL = col3(0xff8414); const BOSS_COL = col3(0xe8062a); const HERO_COL = col3(0xa8d8ff);
  function tele(e, fallKind) {
    const enemy = e.team === 1; const T = Math.min(6, Math.max(0.15, Number.isFinite(e.t) ? e.t : 0.6));
    while (teles.length >= CAP.teles) dropTele(teles.shift());
    const kind = enemy ? (e.boss ? 2 : 1) : 0;
    const uni = { uK: { value: 0 }, uCol: { value: (kind === 2 ? BOSS_COL : enemy ? ENEMY_COL : HERO_COL).clone() }, uA: { value: enemy ? 1 : 0.85 }, uShape: { value: 0 }, uSize: { value: new THREE.Vector2(1, 1) }, uHalf: { value: 0 }, uTime: { value: 0 } };
    const mesh = new THREE.Mesh(planeGeo, standMat);
    if (e.shape === 'circle') { const r = e.r + 0.28; uni.uShape.value = 0; uni.uSize.value.set(r * 2, r * 2); mesh.scale.set(r * 2, r * 2, 1); pose(mesh, e.x, e.z); }
    else if (e.shape === 'line') {
      const dx = e.x2 - e.x; const dz = e.z2 - e.z; const len = Math.hypot(dx, dz) || 1;
      uni.uShape.value = 1; uni.uSize.value.set(len, e.w); mesh.scale.set(len, e.w, 1); pose(mesh, (e.x + e.x2) / 2, (e.z + e.z2) / 2); mesh.rotation.y = -Math.atan2(dz, dx);
    } else {
      uni.uShape.value = 2; uni.uHalf.value = (e.deg * Math.PI) / 360; uni.uSize.value.set(e.r * 2, e.r * 2); mesh.scale.set(e.r * 2, e.r * 2, 1); pose(mesh, e.x, e.z); mesh.rotation.y = -e.ang;
    }
    const rec = { mesh, uni, kind, t: 0, T, x: e.x, z: e.z, bt: lastB ? lastB.t : Infinity };
    teles.push(rec);
    if (e.fall) {
      const mk = FALL_LOOK[fallKind] || FALL_LOOK.shell; const obj = mk(); const side = e.team === 1 ? -1 : 1; obj.position.set(e.x + FALL_SIDE * side, FALL_H, e.z); scene.add(obj);
      falls.push({ obj, t: 0, T, x: e.x, z: e.z, side, kind: fallKind, spin: G.rng.range(-4, 4) });
    }
    return rec;
  }

  function dropTele(t) { t.mesh.visible = false; }

  // ---- zones ----
  function zoneStart(e, look) {
    if (!look) return;
    while (zones.size >= CAP.zones) { const old = zones.values().next().value; dropZone(old); }
    const [style, c1, c2, rate] = look;
    const uni = { uStyle: { value: style }, uT: { value: 0 }, uA: { value: 0 }, uHalf: { value: e.cone ? (e.cone * Math.PI) / 360 : 0 }, uC1: { value: col3(c1) }, uC2: { value: col3(c2) }, uR: { value: e.r } };
    const mat = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VERT, fragmentShader: ZONE_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const mesh = new THREE.Mesh(planeGeo, mat); flat(mesh, e.x, e.z, 0.06); mesh.renderOrder = 4;
    const z = { id: e.id, mesh, uni, age: 0, r: e.r, x: e.x, z: e.z, ang: e.ang || 0, cone: !!e.cone, dur: e.dur, delay: e.delay || 0, team: e.team, look, key: e.key, emit: 0, rate: rate || 0, end: -1, extra: null };
    if (look[4] === 'beam') {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(e.r * 0.9, e.r * 0.35, 16, 4, 1, true), new THREE.MeshBasicMaterial({ color: c2, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      beam.position.set(e.x, 8, e.z); scene.add(beam); z.extra = beam;
    } else if (look[4] === 'ball') {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: BZtex('glow'), color: 0xbfe8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sp.scale.setScalar(3.2); sp.position.set(e.x, 1.3, e.z); scene.add(sp); z.extra = sp;
    }
    zones.set(e.id, z);
  }
  const BZtex = (k) => window.BZ.tex(k);
  function zoneEnd(id) { const z = zones.get(id); if (z && z.end < 0) z.end = 0; }
  function dropZone(z) { scene.remove(z.mesh); z.mesh.material.dispose(); if (z.extra) { scene.remove(z.extra); z.extra.geometry && z.extra.geometry.dispose(); } zones.delete(z.id); }

  function zoneFx(z, dt) {
    const P = G.fx.puff; const rate = z.rate; if (!rate || z.age < z.delay) return;
    z.emit += dt * rate * Math.max(0.4, H.quality.particles);
    while (z.emit >= 1) {
      z.emit -= 1;
      let x; let y = 0.2; let zz; const a0 = G.rng.range(0, 6.283); const d = Math.sqrt(G.rng.next()) * z.r;
      if (z.cone) { const a = z.ang + G.rng.range(-0.45, 0.45) * (z.uni ? 1 : 1); const dd = G.rng.range(0.5, 1) * z.r; x = z.x + Math.cos(a) * dd; zz = z.z + Math.sin(a) * dd; } else { x = z.x + Math.cos(a0) * d; zz = z.z + Math.sin(a0) * d; }
      const v = new THREE.Vector3(x, y, zz); const k = z.look[0];
      if (k === 0) { P(v, { glow: true, vel: new THREE.Vector3(0, G.rng.range(3.2, 6.2), 0), drag: 0.25, s0: 1.0, s1: 0.25, life: G.rng.range(0.6, 1.0), c0: 0xffd070, c1: 0xff3a10, a0: 0.8, spin: 0 }); if (G.rng.chance(0.35)) P(v, { vel: new THREE.Vector3(G.rng.range(-0.4, 0.4), G.rng.range(2.4, 3.6), G.rng.range(-0.4, 0.4)), drag: 0.5, s0: 0.8, s1: 2.2, life: 1.3, c0: 0x4a3a34, c1: 0x6a625c, a0: 0.4 }); }
      else if (k === 1) P(v, { vel: new THREE.Vector3(G.rng.range(-0.3, 0.3), G.rng.range(2.4, 3.8), G.rng.range(-0.3, 0.3)), drag: 0.45, s0: 0.7, s1: 2.4, life: G.rng.range(1.3, 1.9), c0: z.look[1], c1: z.look[2], a0: 0.42 });
      else if (k === 2) P(v.setY(G.rng.range(2.5, 5)), { glow: true, vel: new THREE.Vector3(G.rng.range(-2, 2), -2.2, G.rng.range(-2, 2)), drag: 0.15, s0: 0.24, s1: 0.14, life: G.rng.range(0.9, 1.3), c0: 0xffffff, c1: 0xbfe4ff, a0: 0.8, spin: 0 });
    }
  }

  // ---- rings and flares ----
  // the 42 to 50 degree overview draws a ground ring about a quarter larger than a steeper one: dimmed so a white ring on a
  // bright floor stays under the clipped-white limit
  const RING_K = 0.8;
  // Rings, flares and strips are drawn in three instanced batches, one draw call each, rebuilt every frame from their
  // records: a burst of thirty rings costs what one did. Per-instance colour rides instanceColor, opacity its own attribute.
  const bM = new THREE.Matrix4(); const bS = new THREE.Vector3();
  // one instanced mesh: flush(items, write) writes each item's matrix and colour through write(item, M, C), which returns the
  // item's opacity (0 skips it)
  function batch(geo, opt, cap, order) {
    const g = geo.clone();
    const alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); alpha.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iA', alpha);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, ...opt });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float iA;\nvarying float vA;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = iA;');
      sh.fragmentShader = 'varying float vA;\n' + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vA );');
    };
    mat.customProgramCacheKey = () => 'marks-batch';
    const mesh = new THREE.InstancedMesh(g, mat, cap); mesh.frustumCulled = false; mesh.renderOrder = order; mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    const C = new THREE.Color();
    return {
      mesh,
      flush(items, write) {
        let n = 0;
        for (const it of items) {
          if (n >= cap) break;
          const op = write(it, bM, C); if (!(op > 0.001)) continue;
          mesh.setMatrixAt(n, bM); mesh.instanceColor.setXYZ(n, C.r, C.g, C.b); alpha.setX(n, op); n++;
        }
        mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; alpha.needsUpdate = true;
      },
      clear() { mesh.count = 0; },
    };
  }
  // flat decals on the floor: records with x z, scale sx sz, yaw rot, colour col, opacity op
  function decals(geo, opt, cap, y, order) {
    const B = batch(geo.clone().rotateX(-Math.PI / 2), opt, cap, order); const recs = [];
    const write = (r, M, C) => { if (!r.on) return 0; M.makeRotationY(r.rot || 0); M.scale(bS.set(r.sx, 1, r.sz)); M.setPosition(r.x, y, r.z); C.copy(r.col); return r.op; };
    return {
      recs,
      take() { let r = recs.find((q) => !q.on); if (!r) { if (recs.length >= cap) return null; r = { on: false, col: new THREE.Color() }; recs.push(r); } return r; },
      flush() { B.flush(recs, write); },
      clear() { for (const r of recs) r.on = false; B.clear(); },
    };
  }
  const ringB = decals(streakGeo, { side: THREE.DoubleSide, map: streakTex }, 28, 0.08, 5);
  const flareB = decals(planeGeo, { blending: THREE.AdditiveBlending, map: raysTex }, 12, 0.07, 4);
  const stripB = decals(planeGeo, { map: BZtex('glow') }, 16, 0.09, 5);
  const rings = ringB.recs; const flares = flareB.recs; const strips = stripB.recs;
  function ring(x, z, r0, r1, color, life = 0.5, alpha = 0.9) {
    const rec = ringB.take(); if (!rec) return;
    Object.assign(rec, { on: true, t: 0, life, r0, r1, a: alpha, x, z, sx: r0, sz: r0, rot: G.rng.range(0, 6.283), op: alpha * RING_K }); rec.col.set(color);
  }
  function flare(x, z, r, color, life = 0.6, alpha = 0.55) {
    const rec = flareB.take(); if (!rec) return;
    Object.assign(rec, { on: true, t: 0, life, r, a: alpha * FLARE_K, x, z, sx: r * 1.4, sz: r * 1.4, rot: G.rng.range(0, 6.283), op: 0 }); rec.col.set(color);
  }
  function strip(x, z, x2, z2, w, color, life = 0.4, alpha = 0.8) {
    const rec = stripB.take(); if (!rec) return;
    const dx = x2 - x; const dz = z2 - z; const len = Math.hypot(dx, dz) || 0.1;
    Object.assign(rec, { on: true, t: 0, life, a: alpha, x: (x + x2) / 2, z: (z + z2) / 2, sx: len + w, sz: w * 1.6, rot: -Math.atan2(dz, dx), op: alpha }); rec.col.set(color);
  }
  // ---- vertical layer: pooled light pillars, shock walls, local flashes and the arena-edge wash ----
  // a base-on-the-floor open cylinder with a gradient that fades toward the top, tinted per use
  // vertical streaks of uneven height and strength round the cylinder: a wall reads as a curtain of thrown dust and light, not a band
  const gradTex = (() => {
    const W = 64; const cv = document.createElement('canvas'); cv.width = W; cv.height = 64; const c = cv.getContext('2d'); const img = c.createImageData(W, 64);
    let sd = 41; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const col = []; for (let x = 0; x < W; x++) col.push([0.35 + 0.65 * rnd(), 0.25 + 0.75 * rnd()]);
    for (let x = 0; x < W; x++) { const [k, h] = col[x]; const [k2, h2] = col[(x + 1) % W]; col[x] = [(k * 2 + k2) / 3, (h * 2 + h2) / 3]; }
    for (let y = 0; y < 64; y++) for (let x = 0; x < W; x++) {
      const v = 1 - y / 63; const [k, h] = col[x]; const top = Math.max(0, 1 - Math.max(0, v - h) / 0.25); const o = (y * W + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(255 * Math.min(1, (0.25 + 0.75 * (1 - v)) * k * top * 1.1));
    }
    c.putImageData(img, 0, 0); return pixTex(cv, 16, 16, true);
  })();
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0);
  const VCAP = { pillar: 10, wall: 8, flash: 10 };
  const vpool = { pillar: [], wall: [], flash: [], whirl: [] };
  const reduceFlash = () => !!(window.__G && window.__G.settings && window.__G.settings.reduceFlash);
  function vslot(kind) {
    let rec = vpool[kind].find((r) => !r.on);
    if (rec) return rec;
    if (vpool[kind].length >= VCAP[kind]) { rec = vpool[kind].reduce((a, b) => (b.t / b.life > a.t / a.life ? b : a)); return rec; }
    let mesh;
    if (kind === 'flash') mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: BZtex('glow'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    else mesh = new THREE.Mesh(cylGeo, new THREE.MeshBasicMaterial({ map: gradTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 6;
    rec = { kind, mesh, on: false, t: 0, life: 1 }; vpool[kind].push(rec); return rec;
  }
  // Pillars, walls and flashes are drawn by two instanced batches; each record's mesh is a stand-in outside the scene that
  // holds its position, scale, colour and opacity (the tools read those), copied into the batch every frame.
  const colB = batch(cylGeo, { map: gradTex, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }, VCAP.pillar + VCAP.wall, 6);
  const flashB = batch(planeGeo, { map: BZtex('glow'), blending: THREE.AdditiveBlending }, VCAP.flash, 6); flashB.mesh.name = 'fx-flash';
  // in the ultimate's close-up (ultcam.js) columns, walls and flashes stand several times bigger and stack to white: halved there
  const closeK = () => { const J = window.__G && window.__G.juice; return J && J.ult && J.ult.active ? 0.35 : 1; };
  // a column or wall the lens stands in or next to (a close-up inside the crowd) thins out, as the particles do
  const nearK = (m) => { const c = H.camera.position; const d = Math.hypot(c.x - m.position.x, c.z - m.position.z) - m.scale.x; return Math.min(1, Math.max(0.25, (Math.min(d, c.y) - 1.5) / 9)); };
  const writeCol = (r, M, C) => { if (!r.on || !r.mesh.visible) return 0; const m = r.mesh; M.makeScale(m.scale.x, m.scale.y, m.scale.z); M.setPosition(m.position); C.copy(m.material.color); return m.material.opacity * closeK() * nearK(m); };
    const writeFlash = (r, M, C) => { if (!r.on || !r.mesh.visible) return 0; const m = r.mesh; M.makeRotationFromQuaternion(H.camera.quaternion); M.scale(bS.set(m.scale.x, m.scale.y, 1)); M.setPosition(m.position); C.copy(m.material.color); return m.material.opacity * closeK() * nearK(m); };
  const colItems = [];
  function flushVertical() { colItems.length = 0; colItems.push(...vpool.pillar, ...vpool.wall); colB.flush(colItems, writeCol); flashB.flush(vpool.flash, writeFlash); }
  // upright additive columns and walls stand about a quarter taller on screen at the 42 to 50 degree overview: dimmed to
  // keep clipped white under 1% on bright floors (Y Tá and Băng ultimates measured 1.03% and 1.19%)
  const UP_K = 0.78;
  // o: { h height, r radius, life, a opacity, rise seconds to full height }
  function pillar(x, z, color, o = {}) {
    if (typeof o === 'number') o = { life: o, h: 14, r: 1.1, a: 0.4 };
    const rec = vslot('pillar'); const m = rec.mesh;
    Object.assign(rec, { on: true, t: 0, life: o.life || 0.7, h: o.h || 6, r: o.r || 1, a: (o.a ?? 0.55) * UP_K * (reduceFlash() ? 0.6 : 1), rise: o.rise || 0.12, shrink: o.shrink ?? 0.5 });
    m.material.color.set(color); m.position.set(x, 0.05, z); m.visible = true; m.scale.set(rec.r, 0.01, rec.r);
  }
  // an expanding wall around (x, z): radius r0 to r1 over life, gone (opacity 0) at the end
  function wall(x, z, r0, r1, color, life = 0.4, h = 0.9, a = 0.5) {
    const rec = vslot('wall'); const m = rec.mesh;
    Object.assign(rec, { on: true, t: 0, life, r0, r1, h, a: a * UP_K * (reduceFlash() ? 0.6 : 1) });
    m.material.color.set(color); m.position.set(x, 0.05, z); m.visible = true; m.scale.set(r0, h, r0);
  }
  // a local additive sprite at the point, at most 80 ms; shorter and dimmer with reduceFlash
  function flash(x, y, z, r, color, a = 0.42) {
    const rec = vslot('flash'); const m = rec.mesh; const soft = reduceFlash();
    Object.assign(rec, { on: true, t: 0, life: soft ? 0.05 : 0.08, r, a: a * (soft ? 0.5 : 1) });
    m.material.color.set(color); m.position.set(x, y, z); m.visible = true; m.scale.setScalar(r);
  }
  const edge = { on: false, t: 0, life: 0.6, a: 0.25, mesh: null };
  function wash(color, life = 0.6, a = 0.24) {
    if (!edge.mesh) { edge.mesh = new THREE.Mesh(washGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide })); flat(edge.mesh, 0, 0, 0.04); edge.mesh.renderOrder = 2; edge.mesh.scale.set(ARENA.x * 1.2, ARENA.z * 1.2, 1); }
    edge.on = true; edge.t = 0; edge.life = life; edge.a = a; edge.mesh.material.color.set(color); edge.mesh.material.opacity = 0; edge.mesh.visible = true;
  }
  function updateVertical(dt) {
    for (const r of vpool.pillar) if (r.on) {
      r.t += dt; const k = r.t / r.life; if (k >= 1) { r.on = false; r.mesh.visible = false; continue; }
      const up = 1 - Math.pow(1 - Math.min(1, r.t / r.rise), 3);
      r.mesh.scale.set(r.r * (1 - k * r.shrink), Math.max(0.01, r.h * up), r.r * (1 - k * r.shrink)); r.mesh.material.opacity = r.a * Math.pow(1 - k, 1.3) * Math.min(1, r.t / 0.04);
    }
    for (const r of vpool.wall) if (r.on) {
      r.t += dt; const k = r.t / r.life; if (k >= 1) { r.on = false; r.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 3); const rad = r.r0 + (r.r1 - r.r0) * e;
      r.mesh.scale.set(rad, r.h * (1 - 0.5 * k), rad); r.mesh.material.opacity = r.a * (1 - k) * Math.min(1, r.t / 0.03);
    }
    for (const r of vpool.flash) if (r.on) {
      r.t += dt; const k = r.t / r.life; if (k >= 1) { r.on = false; r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(r.r * (0.6 + 0.6 * k)); r.mesh.material.opacity = r.a * (1 - k);
    }
    if (edge.on) { edge.t += dt; const k = edge.t / edge.life; if (k >= 1) { edge.on = false; edge.mesh.visible = false; } else edge.mesh.material.opacity = edge.a * Math.sin(Math.PI * Math.min(1, k * 1.15)) ; }
  }
  const vliveCount = () => ({ pillars: vpool.pillar.filter((r) => r.on).length, walls: vpool.wall.filter((r) => r.on).length, flashes: vpool.flash.filter((r) => r.on).length + (edge.on ? 1 : 0) });


  // ---- sword light: pooled ribbons (live blade arcs and static streaks), afterimages, and the whirlwind column ----
  // A ribbon has three vertices per sample (edge a, centre, edge b), each tinted colour * fade * brightness, drawn additive.
  const RIB = { cap: 20, n: 22 };
  // All ribbons share one additive mesh (one draw call): slot k owns vertices k*n*3 .. (k+1)*n*3; an idle slot, and the samples
  // past a ribbon's current length, collapse onto one point so their triangles have no area.
  const ribs = [];
  const camV = new THREE.Vector3(); const dirV = new THREE.Vector3(); const nV = new THREE.Vector3();
  const ribGeo = (() => {
    const n = RIB.n; const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RIB.cap * n * 9), 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(RIB.cap * n * 9), 3));
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage); geo.attributes.color.setUsage(THREE.DynamicDrawUsage);
    const idx = [];
    for (let k = 0; k < RIB.cap; k++) for (let i = 0; i < n - 1; i++) { const a = (k * n + i) * 3; const b = a + 3; idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1); }
    geo.setIndex(idx); return geo;
  })();
  const ribMesh = new THREE.Mesh(ribGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  ribMesh.frustumCulled = false; ribMesh.renderOrder = 8; ribMesh.visible = false; scene.add(ribMesh);
  function ribSlot() {
    let r = ribs.find((q) => !q.on);
    if (r) return r;
    if (ribs.length >= RIB.cap) return ribs.reduce((a, b) => (b.t / b.life > a.t / a.life ? b : a));
    const n = RIB.n;
    r = { slot: ribs.length, on: false, t: 0, life: 1, n: 0, pts: new Float32Array(n * 6), ts: new Float32Array(n), col: new THREE.Color(), k: [0.2, 1, 0.2], a: 1, live: false, len: 0, kind: '' };
    ribs.push(r); return r;
  }
  function ribOn(r, color, life, a, k, kind, live) {
    r.on = true; r.t = 0; r.life = life; r.n = 0; r.col.set(color); r.a = a; r.k = k; r.live = live; r.len = 0; r.kind = kind;
    return r;
  }
  // a blade arc: push the two edge points every frame while the blow lasts; each sample fades `life` seconds after it was pushed
  function arc(color, life = 0.16, a = 0.9, k = [0.25, 1, 1]) { return ribOn(ribSlot(), color, life, a, k, 'arc', true); }
  function arcPush(r, ax, ay, az, bx, by, bz) {
    if (!r.on || !r.live) return;
    if (r.n >= RIB.n) { r.pts.copyWithin(0, 6, r.n * 6); r.ts.copyWithin(0, 1, r.n); r.n--; }
    r.pts.set([ax, ay, az, bx, by, bz], r.n * 6); r.ts[r.n] = r.t; r.n++;
  }
  function arcEnd(r) { if (r) r.live = false; }
  // a straight (slightly bowed) stroke from a to b, facing the camera, drawn on over `sweep` seconds and fading behind its head
  function streak(ax, ay, az, bx, by, bz, w, color, life = 0.35, a = 0.9, o = {}) {
    const r = ribOn(ribSlot(), color, life, a, o.k || [0.18, 1, 0.18], o.kind || 'streak', false);
    const n = RIB.n; const sweep = o.sweep ?? 0.09; const bow = o.bow || 0;
    camV.set(0, 0, -1).applyQuaternion(H.camera.quaternion);
    dirV.set(bx - ax, by - ay, bz - az); const len = dirV.length() || 1; dirV.multiplyScalar(1 / len);
    nV.crossVectors(dirV, camV).normalize();
    r.len = len; r.n = n;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1); const hw = (w / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0.04, f))), o.taper ?? 0.45); const off = Math.sin(Math.PI * f) * bow * len;
      const cx = ax + (bx - ax) * f + nV.x * off; const cy = ay + (by - ay) * f + nV.y * off; const cz = az + (bz - az) * f + nV.z * off;
      r.pts.set([cx + nV.x * hw, cy + nV.y * hw, cz + nV.z * hw, cx - nV.x * hw, cy - nV.y * hw, cz - nV.z * hw], i * 6); r.ts[i] = f * sweep;
    }
    return r;
  }
  function updateRibs(dt) {
    const P = ribGeo.attributes.position.array; const C = ribGeo.attributes.color.array; const N = RIB.n; let any = false;
    for (const r of ribs) {
      const base = r.slot * N * 9;
      if (!r.on) { if (r.dirty) { P.fill(0, base, base + N * 9); r.dirty = false; any = true; } continue; }
      r.t += dt; const n = r.n; let last = 0; r.dirty = true; any = true;
      for (let i = 0; i < n; i++) {
        const age = r.t - r.ts[i]; const vis = age >= 0 ? Math.max(0, 1 - age / r.life) : 0; const f = Math.pow(vis, 1.4) * r.a; last = Math.max(last, vis > 0 ? 1 : 0);
        const ax = r.pts[i * 6]; const ay = r.pts[i * 6 + 1]; const az = r.pts[i * 6 + 2]; const bx = r.pts[i * 6 + 3]; const by = r.pts[i * 6 + 4]; const bz = r.pts[i * 6 + 5];
        const o = base + i * 9; P[o] = ax; P[o + 1] = ay; P[o + 2] = az; P[o + 3] = (ax + bx) / 2; P[o + 4] = (ay + by) / 2; P[o + 5] = (az + bz) / 2; P[o + 6] = bx; P[o + 7] = by; P[o + 8] = bz;
        for (let v = 0; v < 3; v++) { const k = r.k[v] * f; C[o + v * 3] = r.col.r * k; C[o + v * 3 + 1] = r.col.g * k; C[o + v * 3 + 2] = r.col.b * k; }
      }
      // samples not pushed yet repeat the last one (or the origin): the segments into them have no area
      for (let i = Math.max(n, 1); i < N; i++) { const o = base + i * 9; const src = n ? base + (n - 1) * 9 : -1; for (let j = 0; j < 9; j++) P[o + j] = src >= 0 ? P[src + j] : 0; }
      if (!n) P.fill(0, base, base + 9);
      const tail = n ? r.ts[n - 1] : 0;
      if ((!r.live && (r.t - tail >= r.life || !last)) || (r.live && r.t > 3)) { r.on = false; r.dirty = false; P.fill(0, base, base + N * 9); }
    }
    if (any) { ribGeo.attributes.position.needsUpdate = true; ribGeo.attributes.color.needsUpdate = true; }
    ribMesh.visible = ribs.some((r) => r.on || r.dirty); ribMesh.material.color.setScalar(closeK());
  }

  // afterimages: billboard silhouettes of the hero, tinted, left along a path
  const GH = { cap: 8 };
  const ghostTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256; const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineCap = 'square';
    c.fillRect(42, 22, 44, 44);
    c.lineWidth = 36; c.beginPath(); c.moveTo(64, 80); c.lineTo(64, 150); c.stroke();
    c.lineWidth = 20; c.beginPath(); c.moveTo(58, 150); c.lineTo(40, 238); c.moveTo(70, 150); c.lineTo(96, 226); c.stroke();
    c.lineWidth = 16; c.beginPath(); c.moveTo(52, 92); c.lineTo(86, 120); c.stroke();
    c.lineWidth = 7; c.beginPath(); c.moveTo(84, 126); c.lineTo(118, 6); c.stroke();
    const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0.35)');
    c.globalCompositeOperation = 'source-in'; c.fillStyle = g; c.fillRect(0, 0, 128, 256);
    return pixTex(cv, 16, 32);
  })();
  const ghosts = [];
  function ghost(x, z, color, o = {}) {
    let r = ghosts.find((q) => !q.on);
    if (!r) {
      if (ghosts.length >= GH.cap) r = ghosts.reduce((a, b) => (b.t / b.life > a.t / a.life ? b : a));
      else { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ghostTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sp.frustumCulled = false; sp.renderOrder = 7; sp.visible = false; scene.add(sp); r = { sp, on: false }; ghosts.push(r); }
    }
    r.on = true; r.t = -(o.delay || 0); r.life = o.life || 0.35; r.a = o.a ?? 0.6; r.flip = o.flip || 1; r.drift = o.drift || 0; r.x = x; r.z = z;
    r.sp.material.color.set(color); r.sp.position.set(x, 1.5, z); r.sp.scale.set(-1.7 * r.flip, 3.2, 1); r.sp.visible = false; r.sp.material.opacity = 0;
  }
  function updateGhosts(dt) {
    for (const r of ghosts) {
      if (!r.on) continue;
      r.t += dt; if (r.t < 0) continue;
      const k = r.t / r.life; if (k >= 1) { r.on = false; r.sp.visible = false; continue; }
      r.sp.visible = true; r.sp.material.opacity = r.a * Math.min(1, r.t / 0.04) * Math.pow(1 - k, 1.2); r.sp.position.x = r.x - r.flip * r.drift * k;
    }
  }

  // the whirlwind: a funnel of spiral light with spinning arcs, leaves carried up, and a swirl on the floor
  const WH = { cap: 2, H: 5.2, leaves: 34 };
  const funnelGeo = new THREE.CylinderGeometry(1, 0.34, 1, 8, 8, true).translate(0, 0.5, 0);
  // a spinning stroke: a spiral 4.1 rad long, its radius 0.82 to 1, thickest and opaque at its head, a thin fading tail
  const arcGeo = (() => {
    const N = 36; const pos = []; const col = []; const idx = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N; const an = t * 4.1; const r = 0.82 + 0.18 * t; const w = 0.02 + 0.13 * Math.pow(t, 1.3); const a = Math.pow(t, 1.4);
      for (const rr of [r - w, r + w]) { pos.push(Math.cos(an) * rr, 0, Math.sin(an) * rr); col.push(1, 1, 1, a); }
      if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); return g;
  })();
  const WH_FRAG = `uniform float uT; uniform float uA; uniform vec3 uC1; uniform vec3 uC2; varying vec2 vUv;
    void main() { vec2 q = (floor(vUv * vec2(32.0, 20.0)) + 0.5) / vec2(32.0, 20.0); float ang = q.x * 6.2832; float y = q.y;
      float b1 = smoothstep(0.55, 0.95, sin(ang * 3.0 + y * 9.0 - uT * 11.0) * 0.5 + 0.5);
      float b2 = smoothstep(0.72, 1.0, sin(ang * 5.0 - y * 15.0 + uT * 8.0) * 0.5 + 0.5);
      float fade = smoothstep(0.0, 0.07, y) * (1.0 - smoothstep(0.62, 1.0, y));
      float a = (0.07 + b1 * 0.5 + b2 * 0.32) * fade;
      gl_FragColor = vec4(mix(uC1, uC2, clamp(b2 + y * 0.5, 0.0, 1.0)), a * uA); }`;
  const whirls = [];
  const leafGeo = new THREE.PlaneGeometry(0.32, 0.2);
  const leafMesh = new THREE.InstancedMesh(leafGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }), WH.cap * WH.leaves);
  leafMesh.frustumCulled = false; leafMesh.count = 0; leafMesh.renderOrder = 6; leafMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(WH.cap * WH.leaves * 3), 3); scene.add(leafMesh);
  const LEAF_COL = [0x7fb04a, 0xb8c850, 0xd8a840, 0x9a7a3a, 0x5f9a3c].map((c) => new THREE.Color(c));
  const lM = new THREE.Matrix4(); const lQ = new THREE.Quaternion(); const lE = new THREE.Euler(); const lP = new THREE.Vector3(); const lS = new THREE.Vector3(1, 1, 1);
  function whirl(x, z, r, color, dur = 1.2) {
    let w = whirls.find((q) => !q.on);
    if (!w) {
      if (whirls.length >= WH.cap) w = whirls.reduce((a, b) => (b.t / b.life > a.t / a.life ? b : a));
      else {
        const uni = { uT: { value: 0 }, uA: { value: 0 }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() } };
        const mesh = new THREE.Mesh(funnelGeo, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VERT, fragmentShader: WH_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false; scene.add(mesh);
        const arcs = []; for (let i = 0; i < 6; i++) { const am = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); am.frustumCulled = false; mesh.add(am); arcs.push(am); }
        const zu = { uStyle: { value: 2 }, uT: { value: 0 }, uA: { value: 0 }, uHalf: { value: 0 }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uR: { value: 1 } };
        const swirl = new THREE.Mesh(planeGeo, new THREE.ShaderMaterial({ uniforms: zu, vertexShader: VERT, fragmentShader: ZONE_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
        flat(swirl, 0, 0, 0.06); swirl.renderOrder = 4; swirl.visible = false;
        w = { kind: 'whirl', mesh, uni, arcs, swirl, zu, on: false, t: 0, life: 1, lf: [] }; whirls.push(w); vpool.whirl.push(w);
      }
    }
    const q = Math.max(0.5, H.quality.particles);
    w.on = true; w.t = 0; w.life = dur + 0.35; w.dur = dur; w.x = x; w.z = z; w.R = Math.max(1.4, r * 0.62); w.emit = 0;
    w.uni.uC1.value.set(color); w.uni.uC2.value.set(color).lerp(new THREE.Color(0xdff6ff), 0.55);
    w.zu.uC1.value.set(color); w.zu.uC2.value.set(color).lerp(new THREE.Color(0xffffff), 0.35); w.zu.uR.value = r;
    w.mesh.position.set(x, 0.05, z); w.mesh.visible = true; w.swirl.position.set(x, 0.06, z); w.swirl.scale.set(r * 2, r * 2, 1); w.swirl.visible = true;
    w.arcs.forEach((am, i) => { am.material.color.set(i % 2 ? new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3) : color); am.userData.y = 0.1 + i * 0.16; am.userData.sp = (i % 2 ? -1 : 1) * (5 + i * 0.7); am.rotation.y = i * 1.3; });
    w.lf.length = 0; const n = Math.max(10, Math.round(WH.leaves * q * 0.8)); for (let i = 0; i < n; i++) w.lf.push({ a: G.rng.range(0, 6.283), w: G.rng.range(4.5, 8), h: G.rng.next(), v: G.rng.range(0.25, 0.55), rf: G.rng.range(0.7, 1.25), sp: G.rng.range(-9, 9), c: G.rng.int(0, LEAF_COL.length - 1) });
  }
  function updateWhirls(dt) {
    let n = 0;
    for (const w of whirls) {
      if (!w.on) continue;
      w.t += dt; const k = w.t / w.life; if (k >= 1) { w.on = false; w.mesh.visible = false; w.swirl.visible = false; continue; }
      const rise = 1 - Math.pow(1 - Math.min(1, w.t / 0.22), 3); const out = w.t > w.dur ? Math.max(0, 1 - (w.t - w.dur) / 0.35) : 1; const a = Math.min(1, w.t / 0.08) * out * (reduceFlash() ? 0.6 : 1);
      w.mesh.scale.set(w.R, Math.max(0.05, WH.H * rise), w.R); w.uni.uT.value = w.t; w.uni.uA.value = a; w.mesh.material.opacity = a;
      for (const am of w.arcs) { const yy = am.userData.y; const rad = 0.34 + 0.66 * yy; am.position.y = yy; am.scale.set(rad, 1, rad); am.rotation.y += am.userData.sp * dt; am.material.opacity = a * 0.4; }
      w.zu.uT.value = w.t; w.zu.uA.value = Math.min(1, w.t / 0.15) * out * 0.8;
      for (const l of w.lf) {
        if (n >= leafMesh.instanceMatrix.count) break;
        const hh = ((l.h + l.v * w.t) % 1) * WH.H * rise; const rad = w.R * (0.34 + 0.66 * (hh / WH.H)) * l.rf * 1.05; const an = l.a + l.w * w.t;
        lP.set(w.x + Math.cos(an) * rad, 0.25 + hh, w.z + Math.sin(an) * rad); lE.set(w.t * l.sp, an, w.t * l.sp * 0.7); lQ.setFromEuler(lE);
        const sc = out * Math.min(1, w.t / 0.2); lS.set(sc, sc, sc); lM.compose(lP, lQ, lS); leafMesh.setMatrixAt(n, lM); leafMesh.setColorAt(n, LEAF_COL[l.c]); n++;
      }
      w.emit += dt * 16 * Math.max(0.5, H.quality.particles);
      while (w.emit >= 1 && w.t < w.dur) {
        w.emit -= 1; const an = G.rng.range(0, 6.283); const rr = w.R * G.rng.range(0.5, 1.1);
        G.fx.puff(new THREE.Vector3(w.x + Math.cos(an) * rr, 0.25, w.z + Math.sin(an) * rr), { vel: new THREE.Vector3(-Math.sin(an) * 4.5, G.rng.range(1.5, 3.2), Math.cos(an) * 4.5), drag: 0.5, s0: 0.5, s1: 1.5, life: 0.8, c0: 0xcbbf9e, c1: 0x9a9078, a0: 0.4 });
      }
    }
    leafMesh.count = n; leafMesh.instanceMatrix.needsUpdate = true; if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  }
  const swordStats = () => ({ ribbons: ribs.filter((r) => r.on).length, streaks: ribs.filter((r) => r.on && r.kind !== 'arc').length, arcs: ribs.filter((r) => r.on && r.kind === 'arc').length, ghosts: ghosts.filter((r) => r.on).length, whirls: whirls.filter((r) => r.on).length, leaves: leafMesh.count });

  // zap: thin spark streaks (fx/beats.js); BZ's arc boxes stand still and fill an ultimate's close-up as white bars
  function update(dt, B, zap) {
    clock += dt;
    updateRibs(dt); updateGhosts(dt); updateWhirls(dt); lastB = B || lastB;
    // a fast-forward moves the sim far ahead of the view clock: decals dry up on the sim clock as well
    if (B) { const extra = lastSimT >= 0 && B.t >= lastSimT ? B.t - lastSimT - dt : 0; if (extra > 0.05 && G.fx.ageDecals) G.fx.ageDecals(extra); lastSimT = B.t; }
    for (const r of strips) if (r.on) { r.t += dt; const k = r.t / r.life; if (k >= 1) { r.on = false; continue; } r.op = r.a * (1 - k); }
    updateVertical(dt); flushVertical();
    for (let i = teles.length - 1; i >= 0; i--) {
      const t = teles[i]; t.t += dt; const k = Math.min(1, t.t / t.T);
      t.uni.uK.value = k; t.uni.uTime.value = clock;
      // dead on its own clock, and on the sim clock too (a fast-forward moves the sim far ahead of the view clock)
      const simOver = B && B.t > t.bt + t.T + TELE_GRACE;
      if (t.t >= t.T + TELE_GRACE || simOver) { dropTele(t); teles.splice(i, 1); } else if (t.t > t.T) t.uni.uA.value *= 0.6;
    }
    flushTeles();
    for (let i = falls.length - 1; i >= 0; i--) {
      const f = falls[i]; f.t += dt; const k = Math.min(1, f.t / f.T);
      f.obj.position.set(f.x + FALL_SIDE * f.side * (1 - k) * (1 - k), FALL_H * (1 - k * k) + 0.3, f.z); f.obj.rotation.y += f.spin * dt; f.obj.rotation.x += f.spin * 0.5 * dt;
      if ((f.kind === 'meteor' || f.kind === 'shell') && f.obj.position.y < 12) G.fx.puff(f.obj.position.clone(), { glow: true, s0: 0.9, s1: 0.2, life: 0.3, c0: 0xffd080, c1: 0xff4010, a0: 0.8, spin: 0 });
      if (k >= 1) { scene.remove(f.obj); falls.splice(i, 1); }
    }
    for (const z of [...zones.values()]) {
      z.age += dt;
      const live = B && B.zones.find((q) => q.id === z.id);
      if (B && !live && z.end < 0 && z.age > ZONE_GRACE) z.end = 0;
      if (z.age > (z.dur || 0) + 8) z.end = Math.max(z.end, 0);
      if (live) { z.x = live.x; z.z = live.z; z.r = live.r; z.ang = live.ang; z.remain = live.t; }
      z.mesh.position.set(z.x, 0.06, z.z);
      if (z.cone) { z.mesh.scale.set(z.r * 2, z.r * 2, 1); z.mesh.rotation.y = -z.ang; } else z.mesh.scale.set(z.r * 2, z.r * 2, 1);
      z.uni.uT.value = z.age; z.uni.uR.value = z.r;
      const delayed = z.age < z.delay; const base = z.team === 1 ? 1 : 0.7;
      let a = Math.min(1, z.age / 0.25) * base * (delayed ? 0.35 : 1);
      if (z.end >= 0) { z.end += dt; a *= Math.max(0, 1 - z.end / 0.4); if (z.end >= 0.4) { dropZone(z); continue; } }
      z.uni.uA.value = a;
      if (z.extra) { z.extra.position.x = z.x; z.extra.position.z = z.z; if (z.extra.isSprite) { z.extra.scale.setScalar(2.8 + Math.sin(clock * 20) * 0.35); if (G.rng.chance(dt * 14)) { const aa = G.rng.range(0, 6.28); zap(z.x, 1.3, z.z, z.x + Math.cos(aa) * 2.4, 0.3, z.z + Math.sin(aa) * 2.4, 0xbfe8ff, false); } } else z.extra.material.opacity = 0.2 * a; }
      if (z.end < 0) zoneFx(z, dt);
    }
    for (const r of rings) if (r.on) { r.t += dt; const k = r.t / r.life; if (k >= 1) { r.on = false; continue; } const e = 1 - Math.pow(1 - k, 3); r.sx = r.sz = r.r0 + (r.r1 - r.r0) * e; r.op = r.a * Math.pow(1 - k, 1.3) * RING_K; }
    for (const f of flares) if (f.on) { f.t += dt; const k = f.t / f.life; if (k >= 1) { f.on = false; continue; } f.sx = f.sz = f.r * (1.4 + 1.0 * k); f.op = f.a * (1 - k) * Math.min(1, k * 8); }
    ringB.flush(); flareB.flush(); stripB.flush();
  }

  function clear() {
    for (const t of teles) dropTele(t); teles.length = 0; teleB.count = 0;
    for (const f of falls) scene.remove(f.obj); falls.length = 0;
    for (const z of [...zones.values()]) dropZone(z);
    ringB.clear(); flareB.clear(); stripB.clear();
    for (const k of Object.keys(vpool)) for (const r of vpool[k]) { r.on = false; r.mesh.visible = false; if (r.swirl) r.swirl.visible = false; } colB.clear(); flashB.clear();
    for (const r of ribs) r.on = false; ribGeo.attributes.position.array.fill(0); ribGeo.attributes.position.needsUpdate = true; ribMesh.visible = false; for (const r of ghosts) { r.on = false; r.sp.visible = false; } leafMesh.count = 0;
    if (edge.mesh) { edge.on = false; edge.mesh.visible = false; }
    lastB = null; lastSimT = -1;
  }
  void fades;
  return { shockGeo: streakGeo, shockTex: streakTex, tele, zoneStart, zoneEnd, ring, flare, strip, pillar, wall, flash, wash, arc, arcPush, arcEnd, streak, ghost, whirl, swordStats, ribs, update, clear, vertical: vpool, stats: () => ({ teles: teles.length, falls: falls.length, zones: zones.size, rings: rings.filter((r) => r.on).length, flares: flares.filter((r) => r.on).length, strips: strips.filter((r) => r.on).length, ...vliveCount(), ...swordStats() }), teleRecs: teles };
}
