// Ground layer: warning marks that fill up before an attack lands (with a falling projectile for `fall` marks),
// lingering zones animated from the live sim zone, expanding rings and flares. Everything is a flat mesh just above
// the floor, drawn by a few small shaders, so it stays cheap and reads from above.
import { ARENA } from '../sim/battle.js?v=20261120c';
const THREE = window.THREE;

const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.1 + 7.0) * 0.3 + vnoise(p * 4.3 + 3.0) * 0.15; }`;
const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

const TELE_FRAG = `
uniform float uK; uniform vec3 uCol; uniform float uA; uniform float uShape; uniform vec2 uSize; uniform float uHalf; uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 m = (vUv - 0.5) * uSize; float inside = 0.0; float fill = 0.0; float edge = 9.0;
  if (uShape < 0.5) { float R = uSize.x * 0.5; float d = length(m); inside = step(d, R); fill = step(d, R * uK); edge = R - d; }
  else if (uShape < 1.5) { vec2 h = uSize * 0.5; inside = step(abs(m.x), h.x) * step(abs(m.y), h.y); fill = inside * step(abs(m.y), h.y * uK); edge = min(h.x - abs(m.x), h.y - abs(m.y)); }
  else { float R = uSize.x * 0.5; float d = length(m); float an = abs(atan(m.y, m.x)); inside = step(d, R) * step(an, uHalf); fill = inside * step(d, R * uK); edge = min(R - d, (uHalf - an) * d); }
  float rim = (1.0 - smoothstep(0.07, 0.2, edge)) * inside;
  float hatch = step(0.5, fract((m.x + m.y) * 0.9 - uTime * 0.7));
  float pulse = smoothstep(0.82, 1.0, uK) * (0.5 + 0.5 * sin(uTime * 28.0));
  // strong enough to read on bright paint and sand as well as dark asphalt: a solid fill, a white rim with a dark seam
  float seam = (1.0 - smoothstep(0.0, 0.07, edge)) * inside;
  float a = min(1.0, inside * (0.26 + hatch * 0.12) + fill * (0.5 + pulse * 0.25) + rim * 0.95);
  vec3 c = mix(uCol, vec3(1.0), rim * 0.45 + pulse * 0.3) * (1.0 - seam * 0.75);
  gl_FragColor = vec4(c, a * uA);
}`;

const ZONE_FRAG = `
uniform float uStyle; uniform float uT; uniform float uA; uniform float uHalf; uniform vec3 uC1; uniform vec3 uC2; uniform float uR;
varying vec2 vUv; ${NOISE}
void main() {
  vec2 m = (vUv - 0.5) * 2.0; float d = length(m); float an = atan(m.y, m.x);
  float inside = step(d, 1.0);
  if (uHalf > 0.0) inside *= step(abs(an), uHalf);
  float edge = uHalf > 0.0 ? min(1.0 - d, (uHalf - abs(an)) * d) : 1.0 - d; edge *= uR;
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
    col = mix(uC1, uC2, st); a = 0.42 + 0.4 * st;
  } else if (uStyle < 3.5) {
    float ln = 1.0 - smoothstep(0.0, 0.07, abs(fract(an * 8.0 / 3.14159) - 0.5) * 2.0 * d * 1.2 - 0.0);
    float rg = 1.0 - smoothstep(0.0, 0.07, abs(fract(d * 4.0) - 0.5) * 2.0 - 0.0);
    float web = max(ln, rg * 0.9); col = mix(uC1, uC2, web); a = 0.1 + web * 0.75;
  } else if (uStyle < 4.5) {
    float rg = fract(d * 3.0 + uT * 1.3); float band = smoothstep(0.0, 0.2, rg) * (1.0 - smoothstep(0.3, 0.7, rg));
    col = mix(uC1, uC2, band); a = 0.22 + 0.5 * band;
  } else {
    float pulse = 0.75 + 0.25 * sin(uT * 18.0); float g = pow(1.0 - d, 1.6);
    col = mix(uC1, uC2, g); a = (0.1 + 0.55 * g) * pulse;
  }
  a = a * inside * (0.35 + 0.65 * soft) + rim * 0.75 * inside;
  col = mix(col, vec3(1.0), rim * 0.45);
  gl_FragColor = vec4(col, a * uA);
}`;

const FALL_LOOK = {
  rock: () => new THREE.Mesh(new THREE.DodecahedronGeometry(0.75), new THREE.MeshLambertMaterial({ color: 0x8a7a68 })),
  meteor: () => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), new THREE.MeshBasicMaterial({ color: 0xff8a30 })); return m; },
  bomb: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshLambertMaterial({ color: 0x2a2e3c }))); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 6), new THREE.MeshBasicMaterial({ color: 0xff4a30 })); c.position.y = 0.55; g.add(c); return g; },
  shell: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.0, 8), new THREE.MeshLambertMaterial({ color: 0x8a929e }))); const n = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 8), new THREE.MeshLambertMaterial({ color: 0xff7a30 })); n.position.y = -0.7; n.rotation.x = Math.PI; g.add(n); return g; },
  acid: () => new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9cff3a })),
  blood: () => new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: 0xd8203a })),
  nade: () => new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshLambertMaterial({ color: 0x6a8a3a })),
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
  const ringGeo = new THREE.RingGeometry(0.86, 1, 56);
  const discGeo = new THREE.CircleGeometry(1, 40);
  const teles = []; const falls = []; const zones = new Map(); const fades = []; const rings = [];
  let clock = 0; let lastB = null; let lastSimT = -1;
  const flat = (mesh, x, z, y = 0.05) => { mesh.rotation.order = 'YXZ'; mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); mesh.renderOrder = 3; mesh.frustumCulled = false; scene.add(mesh); return mesh; };
  const col3 = (hex) => new THREE.Color(hex);

  // ---- warnings ----
  const ENEMY_COL = col3(0xff4a1c); const HERO_COL = col3(0xcfe6ff);
  function tele(e, fallKind) {
    const enemy = e.team === 1; const T = Math.min(6, Math.max(0.15, Number.isFinite(e.t) ? e.t : 0.6));
    while (teles.length >= CAP.teles) dropTele(teles.shift());
    const uni = { uK: { value: 0 }, uCol: { value: (enemy ? ENEMY_COL : HERO_COL).clone() }, uA: { value: enemy ? 1 : 0.4 }, uShape: { value: 0 }, uSize: { value: new THREE.Vector2(1, 1) }, uHalf: { value: 0 }, uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VERT, fragmentShader: TELE_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(planeGeo, mat);
    if (e.shape === 'circle') { const r = e.r + 0.05; uni.uShape.value = 0; uni.uSize.value.set(r * 2, r * 2); mesh.scale.set(r * 2, r * 2, 1); flat(mesh, e.x, e.z); }
    else if (e.shape === 'line') {
      const dx = e.x2 - e.x; const dz = e.z2 - e.z; const len = Math.hypot(dx, dz) || 1;
      uni.uShape.value = 1; uni.uSize.value.set(len, e.w); mesh.scale.set(len, e.w, 1); flat(mesh, (e.x + e.x2) / 2, (e.z + e.z2) / 2); mesh.rotation.y = -Math.atan2(dz, dx);
    } else {
      uni.uShape.value = 2; uni.uHalf.value = (e.deg * Math.PI) / 360; uni.uSize.value.set(e.r * 2, e.r * 2); mesh.scale.set(e.r * 2, e.r * 2, 1); flat(mesh, e.x, e.z); mesh.rotation.y = -e.ang;
    }
    const rec = { mesh, uni, t: 0, T, x: e.x, z: e.z, bt: lastB ? lastB.t : Infinity };
    teles.push(rec);
    if (e.fall) {
      const mk = FALL_LOOK[fallKind] || FALL_LOOK.shell; const obj = mk(); const side = e.team === 1 ? -1 : 1; obj.position.set(e.x + FALL_SIDE * side, FALL_H, e.z); scene.add(obj);
      falls.push({ obj, t: 0, T, x: e.x, z: e.z, side, kind: fallKind, spin: G.rng.range(-4, 4) });
    }
    return rec;
  }

  function dropTele(t) { scene.remove(t.mesh); t.mesh.material.dispose(); }

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
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(e.r * 0.9, e.r * 0.35, 16, 20, 1, true), new THREE.MeshBasicMaterial({ color: c2, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
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
  function ring(x, z, r0, r1, color, life = 0.5, alpha = 0.9) {
    let rec = rings.find((r) => !r.on);
    if (!rec) {
      if (rings.length >= 28) return;
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      flat(mesh, 0, 0, 0.08); mesh.renderOrder = 5; rec = { mesh, on: false }; rings.push(rec);
    }
    rec.on = true; rec.t = 0; rec.life = life; rec.r0 = r0; rec.r1 = r1; rec.a = alpha; rec.mesh.material.color.set(color); rec.mesh.position.set(x, 0.08, z); rec.mesh.visible = true; rec.mesh.scale.setScalar(r0);
  }
  let discGeoMat = null; const flares = [];
  function flare(x, z, r, color, life = 0.6, alpha = 0.55) {
    let rec = flares.find((f) => !f.on);
    if (!rec) {
      if (flares.length >= 12) return;
      if (!discGeoMat) discGeoMat = true;
      const mesh = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, map: BZtex('glow') }));
      flat(mesh, 0, 0, 0.07); mesh.renderOrder = 4; rec = { mesh, on: false }; flares.push(rec);
    }
    rec.on = true; rec.t = 0; rec.life = life; rec.r = r; rec.a = alpha * FLARE_K; rec.mesh.material.color.set(color); rec.mesh.position.set(x, 0.07, z); rec.mesh.visible = true;
  }

  const strips = [];
  function strip(x, z, x2, z2, w, color, life = 0.4, alpha = 0.8) {
    let rec = strips.find((r) => !r.on);
    if (!rec) {
      if (strips.length >= 16) return;
      const mesh = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, map: BZtex('glow') }));
      flat(mesh, 0, 0, 0.09); mesh.renderOrder = 5; rec = { mesh, on: false }; strips.push(rec);
    }
    const dx = x2 - x; const dz = z2 - z; const len = Math.hypot(dx, dz) || 0.1;
    rec.on = true; rec.t = 0; rec.life = life; rec.a = alpha; rec.mesh.material.color.set(color); rec.mesh.visible = true;
    rec.mesh.position.set((x + x2) / 2, 0.09, (z + z2) / 2); rec.mesh.rotation.y = -Math.atan2(dz, dx); rec.mesh.scale.set(len + w, w * 1.6, 1);
  }
  // ---- vertical layer: pooled light pillars, shock walls, local flashes and the arena-edge wash ----
  // a base-on-the-floor open cylinder with a gradient that fades toward the top, tinted per use
  const gradTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64; const c = cv.getContext('2d'); const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = g; c.fillRect(0, 0, 4, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);
  const VCAP = { pillar: 10, wall: 8, flash: 10 };
  const vpool = { pillar: [], wall: [], flash: [] };
  const reduceFlash = () => !!(window.__G && window.__G.settings && window.__G.settings.reduceFlash);
  function vslot(kind) {
    let rec = vpool[kind].find((r) => !r.on);
    if (rec) return rec;
    if (vpool[kind].length >= VCAP[kind]) { rec = vpool[kind].reduce((a, b) => (b.t / b.life > a.t / a.life ? b : a)); return rec; }
    let mesh;
    if (kind === 'flash') mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: BZtex('glow'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    else mesh = new THREE.Mesh(cylGeo, new THREE.MeshBasicMaterial({ map: gradTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 6; scene.add(mesh);
    rec = { kind, mesh, on: false, t: 0, life: 1 }; vpool[kind].push(rec); return rec;
  }
  // o: { h height, r radius, life, a opacity, rise seconds to full height }
  function pillar(x, z, color, o = {}) {
    if (typeof o === 'number') o = { life: o, h: 14, r: 1.1, a: 0.4 };
    const rec = vslot('pillar'); const m = rec.mesh;
    Object.assign(rec, { on: true, t: 0, life: o.life || 0.7, h: o.h || 6, r: o.r || 1, a: (o.a ?? 0.55) * (reduceFlash() ? 0.6 : 1), rise: o.rise || 0.12, shrink: o.shrink ?? 0.5 });
    m.material.color.set(color); m.position.set(x, 0.05, z); m.visible = true; m.scale.set(rec.r, 0.01, rec.r);
  }
  // an expanding wall around (x, z): radius r0 to r1 over life, gone (opacity 0) at the end
  function wall(x, z, r0, r1, color, life = 0.4, h = 0.9, a = 0.5) {
    const rec = vslot('wall'); const m = rec.mesh;
    Object.assign(rec, { on: true, t: 0, life, r0, r1, h, a: a * (reduceFlash() ? 0.6 : 1) });
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
    if (!edge.mesh) { edge.mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide })); flat(edge.mesh, 0, 0, 0.04); edge.mesh.renderOrder = 2; edge.mesh.scale.set(ARENA.x * 1.2, ARENA.z * 1.2, 1); }
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

  function update(dt, B) {
    clock += dt; lastB = B || lastB;
    // a fast-forward moves the sim far ahead of the view clock: decals dry up on the sim clock as well
    if (B) { const extra = lastSimT >= 0 && B.t >= lastSimT ? B.t - lastSimT - dt : 0; if (extra > 0.05 && G.fx.ageDecals) G.fx.ageDecals(extra); lastSimT = B.t; }
    for (const r of strips) if (r.on) { r.t += dt; const k = r.t / r.life; if (k >= 1) { r.on = false; r.mesh.visible = false; continue; } r.mesh.material.opacity = r.a * (1 - k); }
    updateVertical(dt);
    for (let i = teles.length - 1; i >= 0; i--) {
      const t = teles[i]; t.t += dt; const k = Math.min(1, t.t / t.T);
      t.uni.uK.value = k; t.uni.uTime.value = clock;
      // dead on its own clock, and on the sim clock too (a fast-forward moves the sim far ahead of the view clock)
      const simOver = B && B.t > t.bt + t.T + TELE_GRACE;
      if (t.t >= t.T + TELE_GRACE || simOver) { dropTele(t); teles.splice(i, 1); } else if (t.t > t.T) t.uni.uA.value *= 0.6;
    }
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
      if (z.extra) { z.extra.position.x = z.x; z.extra.position.z = z.z; if (z.extra.isSprite) { z.extra.scale.setScalar(2.8 + Math.sin(clock * 20) * 0.35); if (G.rng.chance(dt * 14)) { const aa = G.rng.range(0, 6.28); G.fx.arc(new THREE.Vector3(z.x, 1.3, z.z), new THREE.Vector3(z.x + Math.cos(aa) * 2.4, 0.3, z.z + Math.sin(aa) * 2.4), 0xbfe8ff); } } else z.extra.material.opacity = 0.2 * a; }
      if (z.end < 0) zoneFx(z, dt);
    }
    for (const r of rings) if (r.on) { r.t += dt; const k = r.t / r.life; if (k >= 1) { r.on = false; r.mesh.visible = false; continue; } const e = 1 - Math.pow(1 - k, 3); r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * e); r.mesh.material.opacity = r.a * (1 - k); }
    for (const f of flares) if (f.on) { f.t += dt; const k = f.t / f.life; if (k >= 1) { f.on = false; f.mesh.visible = false; continue; } f.mesh.scale.setScalar(f.r * (0.7 + 0.5 * k)); f.mesh.material.opacity = f.a * (1 - k) * Math.min(1, k * 8); }
  }

  function clear() {
    for (const t of teles) dropTele(t); teles.length = 0;
    for (const f of falls) scene.remove(f.obj); falls.length = 0;
    for (const z of [...zones.values()]) dropZone(z);
    for (const r of rings) { r.on = false; r.mesh.visible = false; }
    for (const f of flares) { f.on = false; f.mesh.visible = false; }
    for (const r of strips) { r.on = false; r.mesh.visible = false; }
    for (const k of Object.keys(vpool)) for (const r of vpool[k]) { r.on = false; r.mesh.visible = false; }
    if (edge.mesh) { edge.on = false; edge.mesh.visible = false; }
    lastB = null; lastSimT = -1;
  }
  void fades;
  return { tele, zoneStart, zoneEnd, ring, flare, strip, pillar, wall, flash, wash, update, clear, vertical: vpool, stats: () => ({ teles: teles.length, falls: falls.length, zones: zones.size, rings: rings.filter((r) => r.on).length, flares: flares.filter((r) => r.on).length, strips: strips.filter((r) => r.on).length, ...vliveCount() }), teleRecs: teles };
}
