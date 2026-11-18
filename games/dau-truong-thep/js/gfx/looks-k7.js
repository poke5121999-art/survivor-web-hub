// Looks, kit lane K7: Saitama, Thủy Tinh, Ưng Nhãn (kits ported from the owner's clips, see data.js). Render only (see looks.js).
// Saitama, clip p77 "74.琦玉" (gameplay 21-60 s): orange fire punches; Serious Mode wraps him in orange flame; the headbutt marks
//   its landing with a thin red-orange ring and orange crosshairs, then lands in an orange blast; the table flip throws orange rock
//   shards over a cracked fan; the serious punch is a long orange blast. One main colour (fire orange), one accent (white gold).
// Thủy Tinh, clip p70 "67.海妖" (gameplay 24-60 s): small blue water drops; a frozen foe turns to blue ice; the water wall is a
//   row of white spray columns; the ult is a many-armed blue whirlpool spiralling into a dark centre with a pale rim. One main
//   colour (sea blue), one accent (white foam / pale ice).
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, sigil, burst, shell, trail, slash, spikes, pillar } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);
const norm = (c) => c.clone().multiplyScalar(1 / Math.max(c.r, c.g, c.b, 1e-3));

// ---- a filled ground sector: soft body, brightest toward its outer rim, revealed from the caster outward ------------------
const SEC_VERT = 'attribute vec2 aFR; varying vec2 vFR; void main() { vFR = aFR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SEC_FRAG = `uniform vec3 uC, uEdge; uniform float uR, uA, uB; varying vec2 vFR;
  void main() {
    float f = vFR.x, r = vFR.y;
    float shown = 1.0 - smoothstep(uR - 0.06, uR, r);
    float side = smoothstep(0.0, 0.12, f) * smoothstep(0.0, 0.12, 1.0 - f);
    float rim = smoothstep(uR - 0.22, uR - 0.03, r) * shown;
    float body = (0.25 + 0.55 * r) * shown * uB;
    float a = clamp(body * side + rim, 0.0, 1.0) * uA;
    vec3 c = mix(uC, uEdge, rim);
    gl_FragColor = vec4(c * a, a * 0.85);
  }`;
// x, z apex; a aim; half half-angle; r radius; life; o: grow (s to reach the rim), y, edge colour
function sector(kit, x, z, a, half, r, c, edge, life, o = {}) {
  const n = 40, pos = [], fr = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, la = a - half + 2 * half * f;
    for (const k of [0, 1]) { pos.push(Math.cos(la) * r * k, 0, Math.sin(la) * r * k); fr.push(f, k); }
    if (i < n) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aFR', new THREE.Float32BufferAttribute(fr, 2)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ vertexShader: SEC_VERT, fragmentShader: SEC_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, premultipliedAlpha: true,
    uniforms: { uC: { value: norm(c) }, uEdge: { value: norm(edge) }, uR: { value: 0 }, uA: { value: o.alpha ?? 1 }, uB: { value: o.body ?? 1 } } });
  const m = new THREE.Mesh(g, mat); m.position.set(x, o.y ?? 0.12, z); m.renderOrder = 4;
  const grow = o.grow ?? 0.12, fade = o.fade ?? Math.min(0.3, life * 0.5);
  own(kit, [m], life, (t) => {
    if (o.follow) { if (!o.follow.alive) return false; m.position.set(o.follow.x, o.y ?? 0.12, o.follow.z); }
    const k = o.k ? o.k() : Math.min(1, t / grow);
    mat.uniforms.uR.value = 1.06 * k;
    mat.uniforms.uA.value = (o.alpha ?? 1) * Math.min(1, (life - t) / fade);
  });
  return m;
}

// ==== Saitama ==============================================================================================================
const FIRE = C(2.6, 0.9, 0.12), DEEPF = C(1.5, 0.28, 0.03), GOLDW = C(2.6, 2.0, 1.1), ROCK = C(0.42, 0.26, 0.16), CRACK = C(2.2, 0.55, 0.05);

// flame tongues licking up round a unit (Serious Mode, the punch's charge)
function flames(kit, u, k, dt, r = 1.1) {
  if (Math.random() < dt * 60 * k) {
    const a = Math.random() * 6.283, q = r * R(0.5, 1);
    kit.glow(u.x + Math.cos(a) * q, R(0.3, 1.0), u.z + Math.sin(a) * q, Math.random() < 0.3 ? GOLDW : FIRE, R(0.35, 0.55), R(0.5, 0.9), 0.9, kit.K.GLOW, 0.6, 0, R(2.5, 4.5), 0);
  }
  if (Math.random() < dt * 8 * k) kit.glow(u.x, 1.2, u.z, DEEPF, 0.3, 2.8, 0.45, kit.K.GLOW, 1.1);
}
// cracks across the floor from (x, z) along a +- half, out to r
function cracks(kit, x, z, a, half, r, n) {
  for (let i = 0; i < n; i++) {
    let la = a + R(-half, half) * 0.9, px = x + Math.cos(la) * 0.8, pz = z + Math.sin(la) * 0.8;
    for (let k = 0; k < 4; k++) {
      la += R(-0.35, 0.35); const l = r * R(0.18, 0.28), qx = px + Math.cos(la) * l, qz = pz + Math.sin(la) * l;
      const b = kit.beam(px, pz, qx, qz, 0.22 - k * 0.03, k ? CRACK : GOLDW, R(0.5, 0.8), 2, 0.12); b.fade = true;
      px = qx; pz = qz;
    }
  }
}
// rock shards thrown up and outward over a fan
function shards(kit, x, z, a, half, r, n) {
  for (let i = 0; i < n; i++) {
    const la = a + R(-half, half), d = r * R(0.25, 0.95), px = x + Math.cos(la) * d, pz = z + Math.sin(la) * d;
    kit.chips(px, 0.4, pz, 1, ROCK, R(4, 8), R(0.8, 1.2), R(0.18, 0.32), 1.4);
    if (i % 2) kit.glow(px, 0.5, pz, FIRE, 0.35, R(0.6, 1.1), 0.8, kit.K.GLOW, 1.2, Math.cos(la) * 2, R(2, 4), Math.sin(la) * 2);
  }
}
// slabs of floor torn up by the table flip: flat broken plates (a dark rock face over an orange-hot rim) rising, tilting
// up and tumbling outward over the fan, then dropping back
const slabGeo = (() => {
  const g = [];
  for (let k = 0; k < 3; k++) {
    const sh = new THREE.Shape(), n = 6;
    for (let i = 0; i < n; i++) { const a = i / n * 6.283, r = 0.55 + 0.4 * (((i * 7 + k * 3) % 5) / 4); if (i) sh.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r * 1.3, Math.sin(a) * r); }
    const geo = new THREE.ShapeGeometry(sh); geo.userData.keep = true; g.push(geo);
  }
  return g;
})();
function slabs(kit, x, z, a, half, r, n) {
  for (let i = 0; i < n; i++) {
    const la = a + (i / Math.max(1, n - 1) - 0.5) * 2 * half * 0.85 + R(-0.08, 0.08), d = r * R(0.35, 0.85), px = x + Math.cos(la) * d, pz = z + Math.sin(la) * d;
    const geo = slabGeo[i % 3], g = new THREE.Group();
    const rim = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: FIRE, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    const face = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3a2418, transparent: true, opacity: 1, toneMapped: false, side: THREE.DoubleSide }));
    rim.scale.setScalar(1.18); rim.position.z = -0.02; g.add(rim, face);
    const s0 = R(1.1, 1.7), up = R(5, 8), out = R(2, 4), spin = R(4, 7) * (Math.random() < 0.5 ? -1 : 1), life = R(0.8, 1.1);
    own(kit, [g], life, (t) => {
      const h = Math.max(0.15, up * t - 9 * t * t), q = Math.min(1, t / 0.12);
      g.position.set(px + Math.cos(la) * out * t, h, pz + Math.sin(la) * out * t);
      g.rotation.set(-Math.PI / 2 + q * 1.2 + spin * 0.15 * t, -la, spin * t * 0.3);
      g.scale.setScalar(s0);
      const f = Math.min(1, (life - t) / 0.25); rim.material.opacity = 0.9 * f; face.material.opacity = f;
    });
  }
}
// an orange fire blast on a point
function blast(kit, x, z, s = 1) {
  burst(kit, x, z, 2.6 * s, FIRE, GOLDW, { life: 0.35 });
  kit.glow(x, 1.2, z, GOLDW, 0.18, 2.4 * s, 1, kit.K.STAR, 1.4);
  kit.sparks(x, 1.1, z, kit.N(12), FIRE, 10 * s, 0.4, 0.06, 0.8, 10);
  kit.puffs(x, 0.8, z, kit.N(4), C(0.12, 0.08, 0.06), 0.6 * s, 2, 0.9, 1.1 * s, 2.2, 0.6, 0.6, kit.K.SMOKE, 2);
  kit.flash(x, 1.8, z, FIRE, 36 * s, 0.22);
}

// ==== Thủy Tinh =============================================================================================================
const SEA = C(0.25, 1.15, 2.6), FOAM = C(2.1, 2.45, 2.6), ICE = C(0.9, 1.9, 2.6);

// the whirlpool: a flat disc whose arms spiral in to a dark eye, foam on the arms' crests and a pale rim
const WHIRL_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const WHIRL_FRAG = `uniform vec3 uC, uF, uD; uniform float uT, uA, uK; varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float arm = 0.5 + 0.5 * sin(a * 5.0 + log(r + 0.04) * 7.0 + uT * 5.0);
    float crest = smoothstep(0.82, 1.0, arm), body = smoothstep(0.35, 0.9, arm);
    float eye = 1.0 - smoothstep(0.12, 0.36, r), rim = smoothstep(0.86, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
    vec3 c = mix(uC * (0.55 + 0.45 * body), uF, crest * smoothstep(0.2, 0.6, r));
    c = mix(c, uD, eye); c = mix(c, uF, rim);
    float al = (0.35 + 0.45 * body + 0.6 * crest + eye * 0.7 + rim) * smoothstep(1.0, 0.94, r + (1.0 - uK));
    gl_FragColor = vec4(c * clamp(al, 0.0, 1.0) * uA, clamp(al, 0.0, 1.0) * uA);
  }`;
const whirlGeo = (() => { const g = new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2); g.userData.keep = true; return g; })();
function whirl(kit, x, z, r) {
  const mat = new THREE.ShaderMaterial({ vertexShader: WHIRL_VERT, fragmentShader: WHIRL_FRAG, transparent: true, depthWrite: false, toneMapped: false, premultipliedAlpha: true,
    uniforms: { uC: { value: norm(SEA) }, uF: { value: C(0.92, 1, 1) }, uD: { value: C(0.01, 0.04, 0.12) }, uT: { value: 0 }, uA: { value: 0.9 }, uK: { value: 0 } } });
  const m = new THREE.Mesh(whirlGeo, mat); m.position.set(x, 0.13, z); m.scale.setScalar(r); m.renderOrder = 4;
  own(kit, [m], 1e9, (t) => { mat.uniforms.uT.value = t; mat.uniforms.uK.value = Math.min(1, t / 0.25); });
  return m;
}
// a mech sealed in blue ice for d s: a pale crystal shell, ice fangs round its feet, frost on the floor
function iceBlock(kit, u, d) {
  shell(kit, u.x, 0.9, u.z, 1.55, ICE, { c2: SEA, p: 1.2, core: 0.22, bands: 1.6, follow: u, life: d, grow: 0.08, alpha: 0.95, squash: 1.15 });
  spikes(kit, u.x, u.z, 7, 1.2, 1.4, ICE, d, { core: 0x1a4a80, follow: u, up: 0.12 });
  sigil(kit, u.x, u.z, 1.8, ICE, { c2: FOAM, n: 6, m: 2, ticks: 12, inner: 0.5, fill: 0.15, w: 0.05, life: d, rev: 0.1, follow: u, spin: 0.2 });
  kit.chips(u.x, 1, u.z, kit.N(8), ICE, 5, 0.7, 0.14);
  kit.glow(u.x, 1.2, u.z, FOAM, 0.2, 2.4, 1, kit.K.STAR, 1.3);
}
// a splash of water from a point: foam thrown up, a blue ring on the floor
function splash(kit, x, z, r) {
  kit.ring(x, z, r, SEA, 0.5); kit.ring(x, z, r * 0.6, FOAM, 0.35, 0.8);
  for (let i = 0; i < kit.N(16); i++) { const a = Math.random() * 6.283, q = r * R(0.2, 0.9); kit.glow(x + Math.cos(a) * q, R(0.2, 0.8), z + Math.sin(a) * q, i % 3 ? FOAM : SEA, R(0.5, 0.8), R(0.35, 0.7), 0.9, kit.K.GLOW, 1.4, Math.cos(a) * 2, R(3, 6), Math.sin(a) * 2); }
}

export const K7 = {
  // Hải Yêu Chi Nộ: the fifth mark seals the foe in blue ice for its 2 s; Băng Phong Chi Tâm seals her for 3 s and cracks open
  sirMark: {
    stacks(kit, e, by) {
      const o = kit.match.units[e.id]; if (!o) return true;
      const d = (by.def.passive.fx && by.def.passive.fx.stun) || 2;
      iceBlock(kit, o, d); splash(kit, o.x, o.z, 2.2);
      return true;
    },
    k7(kit, e, u) {
      if (e.kind !== 'ice') return;
      if (e.on) { iceBlock(kit, u, e.dur || 3); kit.flash(u.x, 2, u.z, ICE, 40, 0.3); return; }
      kit.chips(u.x, 1, u.z, kit.N(16), ICE, 7, 0.9, 0.2); splash(kit, u.x, u.z, 2.4); kit.glow(u.x, 1.2, u.z, FOAM, 0.2, 2.8, 1, kit.K.STAR, 1.3);
    },
  },
  // Băng Lãnh Trí Tuệ: cold water gathers round her, then a ring of icy water breaks out over 4.5 m with ice fangs in its wake
  sirWisdom: {
    pal: [SEA, FOAM], hitR: 1.8,
    castMake() { return {}; },
    cast(kit, v, u, s, k, dt) { if (Math.random() < dt * 40) { const a = Math.random() * 6.283, q = R(1.5, 3); kit.glow(u.x + Math.cos(a) * q, R(0.3, 1.2), u.z + Math.sin(a) * q, SEA, 0.2, 0.5, 0.9, kit.K.SPARK, 0.4, -Math.cos(a) * 10, 0, -Math.sin(a) * 10); } },
    castDrop() {},
    nova(kit, e, u, row) {
      const r = e.r || row.radius;
      sector(kit, e.x, e.z, 0, Math.PI, r, SEA, FOAM, 0.6, { grow: 0.05, alpha: 0.85 });
      shell(kit, e.x, 0, e.z, r, SEA, { c2: FOAM, dome: true, p: 2.6, core: 0, life: 0.5, grow: 0.05, squash: 0.35, alpha: 0.9 });
      sigil(kit, e.x, e.z, r, SEA, { c2: FOAM, n: 0, ticks: 18, inner: 0.82, fill: 0.35, w: 0.08, life: 0.55, rev: 0.12, spin: 0.6, grow: 9 });
      spikes(kit, e.x, e.z, 16, r * 0.7, 2.2, ICE, 0.7, { core: 0x123a70, twist: Math.random(), up: 0.06 });
      spikes(kit, e.x, e.z, 9, r * 0.35, 1.5, ICE, 0.6, { core: 0x123a70, twist: Math.random() });
      splash(kit, e.x, e.z, r);
      kit.glow(e.x, 1.1, e.z, FOAM, 0.18, 2.6, 1, kit.K.STAR, 1.3);
      kit.flash(e.x, 1.8, e.z, SEA, 36, 0.25);
      return true;
    },
    hit(kit, e) { kit.chips(e.x, 1, e.z, kit.N(5), ICE, 4, 0.6, 0.12); kit.glow(e.x, 1.1, e.z, ICE, 0.2, 1.8, 0.9, kit.K.GLOW, 1.2); },
  },
  // Thủy Mạc Bình Chướng: a row of white-blue spray columns stands at the cursor, mist rolling off; it bursts out as it forms
  sirCurtain: {
    pal: [SEA, FOAM], hitR: 1.8, zones: ['wall'],
    skill(kit, e, u, row) { if (row.do === 'recall') splash(kit, u.x, u.z, 1.4); else kit.glow(u.x, 1.3, u.z, SEA, 0.2, 2, 0.8, kit.K.GLOW, 1.3); return true; },
    zoneMake(kit, z) {
      const cols = z.pts.map((p) => pillar(kit, p[0], p[1], 1.15, SEA, { c2: FOAM, h: 4.0, rings: 2.2, life: 1e9, grow: 0.15, alpha: 0.9 }));
      const P0 = z.pts[0], P1 = z.pts[z.pts.length - 1], a = P0 && P1 && P0 !== P1 ? Math.atan2(P1[1] - P0[1], P1[0] - P0[0]) : 0, L = P0 && P1 ? Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) / 2 + 1.2 : 1.5;
      const band = kit.beam(z.x - Math.cos(a) * L, z.z - Math.sin(a) * L, z.x + Math.cos(a) * L, z.z + Math.sin(a) * L, 3.0, SEA, Math.max(0.5, z.dur - z.age), 2, 0.12); band.fade = true;
      return { cols };
    },
    zone(kit, v, z, dt) {
      for (const p of z.pts) {
        if (Math.random() < dt * 14) kit.glow(p[0] + R(-0.4, 0.4), R(2.4, 3.6), p[1] + R(-0.4, 0.4), FOAM, R(0.5, 0.8), R(0.5, 0.9), 0.9, kit.K.GLOW, 1.3, R(-1, 1), R(-3, -1), R(-1, 1));
        if (Math.random() < dt * 4) kit.puffs(p[0], 0.3, p[1], 1, C(0.55, 0.75, 0.95), 0.3, 1, 0.8, 0.8, 2, 0.4, 0.35, kit.K.SMOKE, 2);
      }
    },
    zoneDrop(kit, v) { for (const c of v.cols) stop(c); },
    nova(kit, e, u, row) {
      if (row.do === 'recall') {
        // recalled: the wall collapses into spray and runs back to her in streams of water
        const a = e.a ?? 0, ca = Math.cos(a), sa = Math.sin(a);
        for (let k = -2; k <= 2; k++) {
          const x = e.x - sa * k * 1.3, z = e.z + ca * k * 1.3;
          splash(kit, x, z, 1.6);
          const b = kit.beam(x, z, u.x, u.z, 0.9, SEA, 0.45, 2, 0.6); b.fade = true;
        }
        burst(kit, e.x, e.z, 2.6, SEA, FOAM, { life: 0.3 });
        kit.glow(u.x, 1.2, u.z, FOAM, 0.3, 2.4, 0.9, kit.K.GLOW, 1.3);
        return true;
      }
      const r = e.r || (row.burst && row.burst.radius) || 3;
      splash(kit, e.x, e.z, r);
      burst(kit, e.x, e.z, r * 0.9, SEA, FOAM, { life: 0.35 });
      kit.flash(e.x, 1.8, e.z, SEA, 30, 0.22);
      return true;
    },
  },
  sirTide: {
    pal: [SEA, FOAM],
    skill(kit, e, u) { kit.glow(u.x, 1.4, u.z, SEA, 0.25, 2.4, 0.9, kit.K.GLOW, 1.3); kit.ring(u.x, u.z, 2.0, FOAM, 0.35); return true; },
    zoneMake(kit, z) {
      splash(kit, z.x, z.z, z.r);
      const disc = whirl(kit, z.x, z.z, z.r);
      const rim = sigil(kit, z.x, z.z, z.r * 1.04, FOAM, { c2: FOAM, n: 0, ticks: 32, inner: 0.94, fill: 0.04, w: 0.05, life: 1e9, rev: 0.2, spin: 1.2, y: 0.16 });
      return { all: [disc, rim] };
    },
    zone(kit, v, z, dt) {
      for (let i = 0; i < 2; i++) if (Math.random() < dt * 30) {
        const a = Math.random() * 6.283, q = z.r * R(0.45, 1), sp = 5 + 4 * (1 - q / z.r);
        kit.glow(z.x + Math.cos(a) * q, 0.35, z.z + Math.sin(a) * q, Math.random() < 0.5 ? FOAM : SEA, 0.35, R(0.3, 0.6), 0.9, kit.K.GLOW, 1, Math.sin(a) * sp - Math.cos(a) * 2, 0.3, -Math.cos(a) * sp - Math.sin(a) * 2);
      }
      if (Math.random() < dt * 3) kit.glow(z.x, 0.5, z.z, SEA, 0.5, z.r * 0.9, 0.35, kit.K.GLOW, 1.1);
    },
    zoneDrop(kit, v) { for (const m of v.all) stop(m); },
  },

  // Nhận Chân (passive): Serious Mode is a ring of flame round him for its 3 s, an orange seal underfoot; it bursts in at the start
  smMode: {
    k7(kit, e, u) {
      if (e.kind !== 'serious') return;
      if (!e.on) { kit.ring(u.x, u.z, 2.2, DEEPF, 0.4, 0.7); kit.puffs(u.x, 0.8, u.z, kit.N(4), C(0.12, 0.08, 0.06), 0.6, 1.5, 0.8, 0.9, 2, 0.6, 0.5, kit.K.SMOKE, 2); return; }
      const d = e.dur || 3;
      blast(kit, u.x, u.z, 0.9);
      kit.ring(u.x, u.z, 3.0, FIRE, 0.5);
      sigil(kit, u.x, u.z, 1.9, FIRE, { c2: GOLDW, n: 0, ticks: 10, inner: 0.7, fill: 0.12, w: 0.07, life: d, rev: 0.15, follow: u, spin: 1.6 });
      shell(kit, u.x, 1.0, u.z, 1.7, FIRE, { c2: DEEPF, p: 1.6, core: 0.06, follow: u, life: d, grow: 0.12, alpha: 0.75, pulse: 3 });
      kit.follow(u, d, (t, dt) => flames(kit, u, 1, dt, 1.2));
    },
  },
  // Nhận Chân Hiên Trác: the fan reddens on the floor through the wind-up; then the ground in it cracks open in orange, rock
  // shards fly up and out, an orange blast at its heart, dust rolling off
  smFlip: {
    pal: [FIRE, GOLDW], hitR: 2.0,
    skill(kit, e, u) { kit.glow(u.x, 1.2, u.z, FIRE, 0.2, 2.2, 0.8, kit.K.GLOW, 1.3); return true; },
    castMake(kit, u, s) {
      const v = { k: 0, a0: u.aim };
      v.m = sector(kit, u.x, u.z, u.aim, s.arc, s.radius, DEEPF, FIRE, 1e9, { k: () => v.k, follow: u, alpha: 0.55 });
      return v;
    },
    cast(kit, v, u, s, k, dt) { v.k = k; v.m.rotation.y = -(u.aim - v.a0); flames(kit, u, 0.6, dt, 0.9); },
    castDrop(kit, v) { v.m.userData.end = true; },
    nova(kit, e, u, row) {
      const a = e.a ?? u.aim, half = row.arc || 0.6, r = e.r || row.radius;
      sector(kit, e.x, e.z, a, half, r, FIRE, GOLDW, 0.55, { grow: 0.1, alpha: 0.9 });
      slash(kit, e.x, e.z, a, r * 0.92, FIRE, { c2: GOLDW, span: half, life: 0.35, w: 0.9, y: 0.4, sweep: 0.08 });
      cracks(kit, e.x, e.z, a, half, r, kit.N(7));
      slabs(kit, e.x, e.z, a, half, r, 6);
      shards(kit, e.x, e.z, a, half, r, kit.N(16));
      const cx = e.x + Math.cos(a) * r * 0.55, cz = e.z + Math.sin(a) * r * 0.55;
      blast(kit, cx, cz, 1.1);
      for (let i = 0; i < kit.N(5); i++) { const la = a + R(-half, half), d = r * R(0.4, 0.9); kit.puffs(e.x + Math.cos(la) * d, 0.4, e.z + Math.sin(la) * d, 1, C(0.35, 0.25, 0.18), 0.4, 1.5, 0.9, 1.2, 2.4, 0.4, 0.5, kit.K.DUST, 2); }
      kit.kick(cx, cz, 0.55);
      return true;
    },
  },
  // Nhận Chân Đầu Chùy: a thin red-orange ring with orange crosshairs marks where he will land; he hunches, flame gathering on
  // his head, rushes there in an orange streak and lands in an orange blast with a white-gold flare
  smHead: {
    pal: [FIRE, GOLDW], hitR: 2.0,
    skill(kit, e, u, row) {
      const x = e.tx ?? u.x, z = e.tz ?? u.z, T = (row.windup || 0.3) + (row.flight || 0.3) + 0.15, r = row.radius || 2.8;
      sigil(kit, x, z, r, CRACK, { c2: FIRE, n: 0, ticks: 0, inner: 0, fill: 0.02, w: 0.05, life: T, rev: 0.1, spin: 0, alpha: 0.95 });
      for (let i = 0; i < 2; i++) {
        const ox = x + (i ? 0.9 : -0.9), oz = z + (i ? 0.5 : -0.3);
        sigil(kit, ox, oz, 0.75, FIRE, { c2: FIRE, n: 4, m: 1, ticks: 4, inner: 0.45, fill: 0, w: 0.08, life: T, rev: 0.1, spin: 0.8 });
      }
      return true;
    },
    castMake(kit, u) { return {}; },
    cast(kit, v, u, s, k, dt) { flames(kit, u, 0.8, dt, 0.8); if (Math.random() < dt * 30) kit.glow(u.x + Math.cos(u.aim) * 0.9, 1.4, u.z + Math.sin(u.aim) * 0.9, GOLDW, 0.12, 0.9 + k, 0.9, kit.K.STAR, 1.2); },
    castDrop() {},
    leap(kit, e, u) {
      let t = 0; const T = e.dur || 0.3;
      trail(kit, () => { t += 1 / 60; return t < T + 0.05 && u.alive ? [u.x, 0.9, u.z] : null; }, 1.0, FIRE, T + 0.4, { c2: GOLDW, len: 14 });
      return true;
    },
    nova(kit, e, u, row) {
      const r = e.r || row.radius || 2.8;
      blast(kit, e.x, e.z, 1.2);
      sector(kit, e.x, e.z, 0, Math.PI, r, DEEPF, FIRE, 0.6, { grow: 0.08, alpha: 0.9 });
      cracks(kit, e.x, e.z, 0, Math.PI, r * 1.6, kit.N(8));
      slabs(kit, e.x, e.z, 0, Math.PI, r * 0.9, 5);
      kit.ring(e.x, e.z, 3.0, FIRE, 0.45); kit.ring(e.x, e.z, 1.8, GOLDW, 0.3, 0.8);
      kit.chips(e.x, 0.3, e.z, kit.N(10), ROCK, 6, 0.9, 0.2);
      kit.kick(e.x, e.z, 0.6);
      return true;
    },
  },
  // Nhận Chân Ẩu Đả: while he charges, flame swells round his fist and the fan it will hit glows longer and wider ahead of him;
  // the release is a great orange blast down the fan, white-gold at its core, with streaks racing out along it
  smPunch: {
    pal: [FIRE, GOLDW], hitR: 2.4,
    skill(kit, e, u) { kit.ring(u.x, u.z, 2.4, FIRE, 0.4); return true; },
    castMake(kit, u, s) {
      const v = { k: 0, s };
      const C2 = s.charge, half = (k) => s.fan[0] + (s.fan[1] - s.fan[0]) * k, rr = (k) => C2.range[0] + (C2.range[1] - C2.range[0]) * k;
      v.m = sector(kit, u.x, u.z, u.cast ? u.cast.aim : u.aim, s.fan[1], C2.range[1], DEEPF, FIRE, 1e9, { k: () => (rr(v.k) / C2.range[1]) * 0.98, follow: u, alpha: 0.35 });
      v.half = half;
      return v;
    },
    cast(kit, v, u, s, k, dt) {
      v.k = k;
      flames(kit, u, 0.5 + k, dt, 1.0 + k * 0.6);
      const a = u.cast ? u.cast.aim : u.aim, fx = u.x + Math.cos(a) * 1.1, fz = u.z + Math.sin(a) * 1.1;
      kit.glow(fx, 1.3, fz, FIRE, 0.08, 0.8 + 1.8 * k, 0.9, kit.K.GLOW, 1);
      if (Math.random() < dt * 20) kit.glow(fx, 1.3, fz, GOLDW, 0.1, 0.5 + k, 1, kit.K.STAR, 1.2);
      if (Math.random() < dt * 25) { const la = a + R(-1, 1) * 2.5, d = R(2, 3.5); kit.glow(u.x + Math.cos(la) * d, R(0.4, 1.6), u.z + Math.sin(la) * d, FIRE, 0.25, 0.4, 0.9, kit.K.SPARK, 0.4, -Math.cos(la) * 7, 0, -Math.sin(la) * 7); }
    },
    castDrop(kit, v) { v.m.userData.end = true; },
    nova(kit, e, u) {
      const a = e.a ?? u.aim, half = e.arc || 0.5, r = e.r || 10, f = e.f ?? 1;
      sector(kit, e.x, e.z, a, half * 1.15, r * 1.05, DEEPF, FIRE, 0.9, { grow: 0.05, alpha: 0.9, body: 1.5, y: 0.11 });
      sector(kit, e.x, e.z, a, half, r, FIRE, GOLDW, 0.7, { grow: 0.05, alpha: 1 });
      sector(kit, e.x, e.z, a, half * 0.45, r * 0.95, GOLDW, C(2.6, 2.4, 2.0), 0.4, { grow: 0.1, alpha: 0.9, y: 0.14 });
      for (let i = 0; i < kit.N(7); i++) {
        const la = a + R(-half, half) * 0.8, l = r * R(0.6, 1.0);
        const b = kit.beam(e.x + Math.cos(la) * 0.8, e.z + Math.sin(la) * 0.8, e.x + Math.cos(la) * l, e.z + Math.sin(la) * l, R(0.5, 1.0) * (0.7 + f * 0.6), i % 3 ? FIRE : GOLDW, R(0.35, 0.55), 0, 1.2); b.fade = true;
      }
      for (let k = 0; k < 3; k++) slash(kit, e.x, e.z, a, r * (0.45 + 0.27 * k), k === 2 ? GOLDW : FIRE, { c2: k === 2 ? FIRE : DEEPF, span: half, life: 0.55, w: 1.1 + 0.4 * k, y: 0.6 + 0.3 * k, sweep: 0.06, dir: k % 2 ? -1 : 1, sparks: false });
      slabs(kit, e.x, e.z, a, half, r, 9);
      const hx = e.x + Math.cos(a) * 1.4, hz = e.z + Math.sin(a) * 1.4;
      // the clip's golden ball of force round the fist as the punch goes off
      shell(kit, hx + Math.cos(a) * 0.8, 1.2, hz + Math.sin(a) * 0.8, 3.0 + f, GOLDW, { c2: FIRE, p: 1.4, core: 0.3, life: 0.45, grow: 0.05 });
      blast(kit, hx, hz, 1.2 + f * 0.5);
      for (let i = 0; i < kit.N(6); i++) { const la = a + R(-half, half), d = r * R(0.5, 1); blast(kit, e.x + Math.cos(la) * d, e.z + Math.sin(la) * d, 0.5); }
      kit.flash(hx, 2, hz, FIRE, 60, 0.35);
      kit.kick(hx, hz, 1.0);
      return true;
    },
  },
};
