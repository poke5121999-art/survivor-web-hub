// Looks, lane b9: Én Bạc, Bói Cá, Rết Đỏ, Bọ Ngựa, Tắc Kè. Render only (see looks.js for the hooks).
// One main colour and one accent per tank, one strong shape per skill, soft halos instead of hard boxes.
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP-b9.md):
//   15.飞翼 p18 (Én Bạc): a silver swept-wing flier, cyan light darts, a lock bracket ring on the target, an orange ring blast.
//   18.上尉 p21 (Tắc Kè): round shields of concentric rings with a star thrown and bouncing; ours teal and silver.
//   77.桐人 p80 (Bọ Ngựa): curved blade arcs curling round the target; ours mantis sickles in jade.
//   59.金木 p62 (Rết Đỏ, loose): crystal kagune spikes bursting from the mech (cyan in the clip); ours a red centipede.
//   Bói Cá: no part fits (85.游侠 p88 is an orange gunslinger); built from its kit: kingfisher azure, orange breast, a dive.
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, sigil, shell, trail, spikes } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);
const keep = (g) => { g.userData.keep = true; return g; };
const basic = (c, add, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
// fade every material under g to k of its own opacity (a material shared by several meshes is set once)
function fadeAll(g, k) { const seen = new Set(); g.traverse((m) => { const M = m.material; if (!M || seen.has(M)) return; seen.add(M); if (M.userData.op === undefined) M.userData.op = M.opacity; M.opacity = M.userData.op * k; }); }
const norm = (c) => c.clone().multiplyScalar(1 / Math.max(c.r, c.g, c.b, 1e-3));
// a flat silhouette with a soft glow: an outer faint halo, an inner halo and the solid body on top
function glowed(geo, body, glow, op = 0.95, halo = [[1.42, 0.2], [1.16, 0.55]]) {
  const g = new THREE.Group();
  for (const [s, a] of halo) { const h = new THREE.Mesh(geo, basic(glow, true, a)); h.scale.setScalar(s); h.position.y = -0.02; h.renderOrder = 6; g.add(h); }
  const b = new THREE.Mesh(geo, basic(body, false, op)); b.renderOrder = 8; g.add(b);
  g.traverse((m) => { m.frustumCulled = false; });
  return g;
}

// ---- soft strip: a flat band with a gradient across it (bright core, soft edges), optionally narrowing to the far end ----
const STRIP_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const STRIP_FRAG = `uniform vec3 uC, uC2; uniform float uA, uTaper, uP; varying vec2 vUv;
  void main() {
    float w = mix(1.0, 0.12, vUv.x * uTaper);
    float across = abs(vUv.y * 2.0 - 1.0) / w; if (across > 1.0) discard;
    float a = pow(1.0 - across, uP) * smoothstep(0.0, 0.04, vUv.x) * (1.0 - smoothstep(0.93, 1.0, vUv.x)) * uA;
    vec3 c = mix(uC, uC2, smoothstep(0.55, 0.95, 1.0 - across));
    gl_FragColor = vec4(c * a, a);
  }`;
const stripGeo = keep(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0).rotateX(-Math.PI / 2));
function strip(c, c2, o = {}) {
  const mat = new THREE.ShaderMaterial({ vertexShader: STRIP_VERT, fragmentShader: STRIP_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, premultipliedAlpha: true,
    uniforms: { uC: { value: norm(c) }, uC2: { value: norm(c2) }, uA: { value: o.alpha ?? 1 }, uTaper: { value: o.taper ?? 0 }, uP: { value: o.p ?? 1.4 } } });
  const m = new THREE.Mesh(stripGeo, mat); m.renderOrder = o.add ? 8 : 6; m.frustumCulled = false; return m;
}
// lay a strip from (x0, z0) to (x1, z1) at height y, width w
function layStrip(m, x0, y, z0, x1, z1, w) { const dx = x1 - x0, dz = z1 - z0; m.position.set(x0, y, z0); m.rotation.y = -Math.atan2(dz, dx); m.scale.set(Math.hypot(dx, dz) || 0.01, 1, w); }

// ---- fan: a motion smear behind a swung blade, a ring sector revealed along its arc, brightest at the outer edge --------
const FAN_VERT = 'attribute vec2 aFR; varying vec2 vFR; void main() { vFR = aFR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FAN_FRAG = `uniform vec3 uC, uEdge; uniform float uHead, uFade; varying vec2 vFR;
  void main() {
    float f = vFR.x, r = vFR.y;
    float shown = 1.0 - smoothstep(uHead - 0.02, uHead + 0.01, f);
    float tail = smoothstep(uHead - 0.75, uHead, f);
    float edge = smoothstep(0.0, 1.0, r);
    float a = shown * tail * (0.18 + 0.82 * edge * edge) * (1.0 - smoothstep(0.93, 1.0, r)) * uFade;
    vec3 c = mix(uC, uEdge, pow(edge, 5.0) * tail);
    gl_FragColor = vec4(c * a, a);
  }`;
// x, z centre; a0 start angle; span (rad, signed: the swing sense); r0, r1 radii; sweep time; life
function fan(kit, x, z, a0, span, r0, r1, c, edge, life, sweep = 0.14, y = 0.9) {
  const n = 36, pos = [], fr = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = a0 + span * f;
    for (const [rr, e] of [[r0, 0], [r1, 1]]) { pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr); fr.push(f, e); }
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aFR', new THREE.Float32BufferAttribute(fr, 2)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ vertexShader: FAN_VERT, fragmentShader: FAN_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, premultipliedAlpha: true,
    uniforms: { uC: { value: norm(c) }, uEdge: { value: norm(edge) }, uHead: { value: 0 }, uFade: { value: 1 } } });
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.renderOrder = 6;
  own(kit, [m], life, (t) => { const k = Math.min(1, t / sweep); mat.uniforms.uHead.value = 1.02 * (1 - (1 - k) ** 2); mat.uniforms.uFade.value = t < sweep + 0.05 ? 1 : Math.max(0, 1 - (t - sweep - 0.05) / (life - sweep - 0.05)); });
  return m;
}

// ---- crackling bolt (a glow ribbon and a white core, re-jagged) --------------------------------------------------------
function ribbonMesh(n, c, add, op) {
  const g = new THREE.BufferGeometry(), P = new Float32Array(n * 6), idx = [];
  for (let i = 0; i < n - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, basic(c, add, op)); m.renderOrder = add ? 8 : 7; return m;
}
function fillRibbon(m, pts, w) {
  const P = m.geometry.attributes.position.array, n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[2] - a[2], hl = Math.hypot(dx, dz) || 1, sx = -dz / hl, sz = dx / hl;
    const ww = typeof w === 'function' ? w(i / (n - 1)) : w, p = pts[i];
    P[i * 6] = p[0] - sx * ww; P[i * 6 + 1] = p[1]; P[i * 6 + 2] = p[2] - sz * ww; P[i * 6 + 3] = p[0] + sx * ww; P[i * 6 + 4] = p[1]; P[i * 6 + 5] = p[2] + sz * ww;
  }
  m.geometry.attributes.position.needsUpdate = true;
}
function boltPts(a, b, segs, jit) {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, sx = -dz / L, sz = dx / L, pts = [];
  for (let i = 0; i <= segs; i++) { const f = i / segs, e = i === 0 || i === segs ? 0 : 1, j = e * jit * (Math.random() * 2 - 1); pts.push([a[0] + dx * f + sx * j, a[1] + (b[1] - a[1]) * f + e * jit * 0.5 * (Math.random() * 2 - 1), a[2] + dz * f + sz * j]); }
  return pts;
}

// =====================================================================================================================
// Én Bạc: a silver swallow, ice-cyan light, orange where the rockets burst (clip 飞翼 p18)
const EB_CY = C(0.55, 1.7, 2.6), EB_ORG = C(2.6, 1.0, 0.25), EB_SIL = 0xe4ebf4, EB_DEEP = C(0.05, 0.2, 0.45);
// top-down swallow: pointed head at +x, crescent wings swept back, a deep forked tail
const swallowGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(1.0, 0); s.quadraticCurveTo(0.72, 0.15, 0.36, 0.17); s.quadraticCurveTo(0.05, 0.78, -0.55, 1.45); s.quadraticCurveTo(-0.22, 0.62, -0.2, 0.22);
  s.lineTo(-1.2, 0.48); s.quadraticCurveTo(-0.85, 0.12, -0.72, 0); s.quadraticCurveTo(-0.85, -0.12, -1.2, -0.48); s.lineTo(-0.2, -0.22);
  s.quadraticCurveTo(-0.22, -0.62, -0.55, -1.45); s.quadraticCurveTo(0.05, -0.78, 0.36, -0.17); s.quadraticCurveTo(0.72, -0.15, 1.0, 0);
  return keep(new THREE.ShapeGeometry(s, 10).rotateX(-Math.PI / 2));
})();
const swallow = () => glowed(swallowGeo, EB_SIL, EB_CY);
// the orange ring blast of a rocket or a strike (clip: a flat fire ring)
function ebBlast(kit, x, z, r, life = 0.55) {
  sigil(kit, x, z, r, EB_ORG, { c2: EB_CY, n: 0, ticks: 0, inner: 0.7, fill: 0.32, w: 0.07, life, rev: 0.04, spin: 0, grow: 9 });
  shell(kit, x, 0.9, z, r * 0.42, EB_ORG, { c2: C(2.6, 2.2, 1.6), inv: 1.4, core: 1, life: 0.28, grow: 0.06 });
  kit.sparks(x, 1, z, kit.N(10), EB_ORG, 8, 0.35, 0.05, 0.6, 10);
  kit.scorch(x, z, r * 0.5, 3, 1.1, EB_ORG);
  kit.flash(x, 1.6, z, EB_ORG, 30, 0.2);
}
const enbac = {
  // Loạt Kép: two small silver swallows dart out on ice-cyan contrails and burst in orange rings
  ebRocket: {
    pal: [EB_ORG, EB_CY], hitR: 1.4,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.3, 1.3, u.z + Math.sin(e.a) * 1.3, EB_CY, 0.12, 1.6, 0.8, kit.K.STAR, 1.2); return true; },
    shotMake(kit, s) {
      const g = swallow(), v = { g, h: held(kit, [g]), a: Math.atan2(s.dz, s.dx), x: s.x, z: s.z, live: true, t: 0 };
      trail(kit, () => (v.live ? [v.x, 1.25, v.z] : null), 0.8, EB_CY, 0.5, { c2: EB_DEEP, len: 14 });
      return v;
    },
    shot(kit, v, s, x, y, z, dt) { v.t += dt || 0.016; v.x = x; v.z = z; v.g.position.set(x, 1.3, z); v.g.rotation.y = -v.a; v.g.scale.set(2.4, 1, 2.4 * (0.82 + 0.18 * Math.sin(v.t * 34))); return true; },
    // it bursts and the swallow glides on through the blast, fading
    shotEnd(kit, v, s, x, z) { v.live = false; v.h.on = false; ebBlast(kit, x, z, 3.2); const g = swallow(), a = v.a; own(kit, [g], 0.35, (t) => { g.position.set(x + Math.cos(a) * 9 * t, 1.5 + 2 * t, z + Math.sin(a) * 9 * t); g.rotation.y = -a; g.scale.setScalar(2.4 + 2 * t); fadeAll(g, 1 - t / 0.35); }); },
  },
  // Phản Lực: a big silver swallow spreads over him as he jets off, two ice-cyan contrails from its wing tips
  ebJet: {
    pal: [EB_CY, EB_ORG], hitR: 1.4,
    skill(kit, e, u) {
      const a = e.a, ca = Math.cos(a), sa = Math.sin(a), g = swallow(); let end = -1;
      own(kit, [g], 0.65, (t) => {
        if (!u.alive) return false;
        if (end < 0 && t > 0.05 && !u.dash) end = t;
        const k = Math.min(1, t / 0.08), f = end < 0 ? 1 : Math.max(0, 1 - (t - end) / 0.35);
        g.position.set(u.x, 1.7, u.z); g.rotation.y = -a; g.scale.set(2.5 * k, 1, 2.9 * k * (0.9 + 0.1 * Math.sin(t * 30))); fadeAll(g, f);
      });
      for (const sd of [-1, 1]) trail(kit, (t) => (t < 0.3 && u.alive && (t < 0.05 || u.dash) ? [u.x - ca * 1.1 - sa * sd * 3.6, 1.6, u.z - sa * 1.1 + ca * sd * 3.6] : null), 0.6, EB_CY, 0.7, { c2: EB_DEEP, len: 16 });
      // the three shots thrown back as he goes: orange muzzle flashes behind him
      for (const d of [-0.25, 0, 0.25]) kit.glow(u.x - Math.cos(a + d) * 1.2, 1.2, u.z - Math.sin(a + d) * 1.2, EB_ORG, 0.12, 1.1, 0.9, kit.K.STAR, 1.2);
      kit.puffs(u.x, 0.5, u.z, kit.N(4), C(0.7, 0.8, 0.9), 0.5, 2.5, 0.6, 0.9, 2, 0.4, 0.4, kit.K.DUST, 3);
      return true;
    },
  },
  // Mưa Đạn Trời: every spot gets an orange lock bracket ring; a swallow of light dives out of the sky on it and bursts
  ebRain: {
    zones: ['strike'], ownDisc: true, pal: [EB_ORG, EB_CY], hitR: 1.4,
    skill(kit, e, u) { kit.flash(u.x, 2, u.z, EB_CY, 40, 0.3); return true; },
    zoneMake(kit, z) {
      const g = swallow(), lance = strip(EB_CY, C(2.4, 2.6, 2.6), { add: true, taper: 1, p: 1.2 });
      const v = { g, lance, h: held(kit, [g, lance]) };
      v.s = sigil(kit, z.x, z.z, z.r * 1.4, EB_ORG, { c2: EB_ORG, n: 0, ticks: 4, inner: 0, fill: 0.16, w: 0.07, life: 1e9, rev: 0.06, spin: 2.5 });
      return v;
    },
    zone(kit, v, z) {
      const k = 1 - z.delay / (z.total || 1), y = 0.6 + 11 * (1 - k) * (1 - k);
      v.g.position.set(z.x, y, z.z); v.g.rotation.y = 1.2 + z.id; v.g.scale.setScalar(1.8 + 0.8 * k);
      v.lance.position.set(z.x, y + 0.2, z.z); v.lance.rotation.set(0, 0, Math.PI / 2); v.lance.scale.set(Math.min(7, 13 - y), 1, 1.5);
      v.s.scale.setScalar(z.r * (1.9 - 0.5 * k));
    },
    zoneDrop(kit, v) { v.h.on = false; stop(v.s); },
    land(kit, e, v, z) { ebBlast(kit, e.x, e.z, ((z && z.r) || 2.2) * 1.4, 0.6); kit.kick(e.x, e.z, 0.25); return true; },
  },
};

// =====================================================================================================================
// Bói Cá: kingfisher azure, its orange breast as the accent; the dive, the watching eye, the lock and the strike
const BC_BLUE = C(0.2, 1.1, 2.6), BC_ORG = C(2.6, 1.05, 0.2), BC_NAVY = 0x07223e, BC_DEEP = C(0.02, 0.12, 0.35);
const beakGeo = (() => { const s = new THREE.Shape(); s.moveTo(1.7, 0); s.quadraticCurveTo(0.4, 0.17, -0.45, 0.24); s.quadraticCurveTo(-0.95, 0.22, -1.0, 0); s.quadraticCurveTo(-0.95, -0.22, -0.45, -0.24); s.quadraticCurveTo(0.4, -0.17, 1.7, 0); return keep(new THREE.ShapeGeometry(s, 10).rotateX(-Math.PI / 2)); })();
function kingfisherDart() {
  const g = glowed(beakGeo, 0x1d6fd0, BC_BLUE), belly = new THREE.Mesh(beakGeo, basic(BC_ORG, true, 0.95));
  belly.scale.set(0.75, 1, 0.38); belly.position.set(-0.15, 0.03, 0); belly.renderOrder = 9; g.add(belly);
  return g;
}
// ripples spreading on water: rings growing one after another
function ripples(kit, x, z, n, r, c, life = 0.7) {
  for (let i = 0; i < n; i++) sigil(kit, x, z, r * (0.55 + 0.45 * i / Math.max(1, n - 1)), c, { n: 0, ticks: 0, inner: 0, fill: 0.04, w: 0.045, life: life - i * 0.08, rev: 0.02, spin: 0, grow: 5 - i, alpha: 0.95 - i * 0.15, y: 0.14 });
}
const eyeGeo = (() => { const s = new THREE.Shape(); s.moveTo(-1, 0); s.quadraticCurveTo(0, 0.78, 1, 0); s.quadraticCurveTo(0, -0.78, -1, 0); return keep(new THREE.ShapeGeometry(s, 16).rotateX(-Math.PI / 2)); })();
const irisGeo = keep(new THREE.CircleGeometry(0.34, 28).rotateX(-Math.PI / 2)), pupilGeo = keep(new THREE.CircleGeometry(0.3, 20).scale(0.3, 1, 1).rotateX(-Math.PI / 2));
function eye() {
  const g = glowed(eyeGeo, BC_NAVY, BC_BLUE, 0.92), iris = new THREE.Mesh(irisGeo, basic(BC_ORG, false, 1)), ring = new THREE.Mesh(irisGeo, basic(BC_ORG, true, 0.6)), pupil = new THREE.Mesh(pupilGeo, basic(0x02060c, false, 1));
  ring.scale.setScalar(1.45); iris.position.y = 0.02; ring.position.y = 0.01; pupil.position.y = 0.03; iris.renderOrder = 9; pupil.renderOrder = 10; ring.renderOrder = 8;
  g.add(ring, iris, pupil); g.userData.iris = [iris, ring, pupil];
  return g;
}
const chevGeo = (() => { const s = new THREE.Shape(); s.moveTo(0.5, 0); s.lineTo(-0.3, 0.5); s.lineTo(-0.1, 0); s.lineTo(-0.3, -0.5); s.lineTo(0.5, 0); return keep(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)); })();
// the enemy each Bói Cá last locked (its beam event does not name it)
const lockOf = new Map();
const boica = {
  // Đạn Xuyên Dài: a kingfisher dart with an orange breast streaks out on a long azure wake; rings spread where it dived out
  bcDive: {
    pal: [BC_BLUE, BC_ORG], hitR: 1.4,
    skill(kit, e, u) { const x = u.x + Math.cos(e.a) * 1.4, z = u.z + Math.sin(e.a) * 1.4; ripples(kit, x, z, 3, 4.6, BC_BLUE); kit.glow(x, 1.2, z, BC_BLUE, 0.12, 1.6, 0.9, kit.K.STAR, 1.2); return true; },
    shotMake(kit, s) {
      const g = kingfisherDart(), wake = strip(BC_BLUE, C(1.6, 2.4, 2.6), { p: 1.6 }), v = { g, wake, h: held(kit, [g, wake]), a: Math.atan2(s.dz, s.dx), x0: s.x, z0: s.z };
      return v;
    },
    shot(kit, v, s, x, y, z) {
      v.g.position.set(x, 1.2, z); v.g.rotation.y = -v.a; v.g.scale.setScalar(2.6);
      const L = Math.min(12, Math.hypot(x - v.x0, z - v.z0)), ca = Math.cos(v.a), sa = Math.sin(v.a);
      layStrip(v.wake, x - ca * L, 1.05, z - sa * L, x - ca * 1.4, z - sa * 1.4, 2.3);
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.h.on = false; ripples(kit, x, z, 2, 1.8, BC_BLUE, 0.5); kit.sparks(x, 1, z, kit.N(10), BC_BLUE, 7, 0.4, 0.05, 1.2, 14); },
  },
  // Bẫy Cảnh Giới: a watching eye opens on the floor, azure rim and orange iris, blinking; stepped on, it flares wide open
  bcEye: {
    zones: ['mine'], pal: [BC_BLUE, BC_ORG], hitR: 1.4,
    skill() { return true; },
    zoneMake(kit, z) {
      const g = eye(); g.position.set(z.x, 0.16, z.z);
      const v = { g, h: held(kit, [g]) };
      v.s = sigil(kit, z.x, z.z, z.r, BC_BLUE, { c2: BC_ORG, n: 0, ticks: 16, inner: 0, fill: 0.1, w: 0.05, life: 1e9, rev: 0.4, spin: 0.4, alpha: 0.7 });
      ripples(kit, z.x, z.z, 2, z.r, BC_BLUE, 0.6);
      return v;
    },
    zone(kit, v, z) {
      const k = Math.min(1, z.age / 0.3), arm = z.delay > 0 ? 0.55 : 1, bl = (z.age % 3.2) < 0.16 ? 0.15 : 1, R2 = z.r * 0.95;
      v.g.scale.set(R2 * k, 1, R2 * k * bl); fadeAll(v.g, arm * Math.min(1, (z.dur - z.age) * 2));
      const [iris, ring, pupil] = v.g.userData.iris, look = Math.sin(z.age * 1.3) * 0.3;
      for (const m of [iris, ring, pupil]) m.position.x = look;
    },
    zoneDrop(kit, v) { v.h.on = false; stop(v.s); },
    land(kit, e) {
      const g = eye(); g.position.set(e.x, 0.18, e.z);
      own(kit, [g], 0.5, (t) => { const k = Math.min(1, t / 0.08); g.scale.set(2.6 + 1.2 * k, 1, (2.6 + 1.2 * k) * (0.6 + 0.6 * k)); fadeAll(g, Math.min(1, (0.5 - t) / 0.25)); });
      ripples(kit, e.x, e.z, 3, 3.4, BC_BLUE, 0.6); kit.flash(e.x, 1.6, e.z, BC_ORG, 35, 0.25);
      return true;
    },
  },
  // Khóa Mục Tiêu: an azure reticle locks on the target, orange chevrons closing in; then a long azure lance with an orange
  // core strikes it and a crown of water spikes jumps up where it lands
  bcLock: {
    pal: [BC_BLUE, BC_ORG], hitR: 1.6,
    skill() { return true; },
    castMake(kit, u) {
      const line = strip(BC_BLUE, C(1.4, 2.2, 2.6), { add: true, p: 2 }), chev = [];
      for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(chevGeo, basic(BC_ORG, false, 0.95)); c.renderOrder = 9; chev.push(c); }
      const v = { line, chev, h: held(kit, [line, ...chev]) };
      v.s = sigil(kit, u.x, u.z, 2.4, BC_BLUE, { c2: BC_ORG, n: 0, ticks: 8, inner: 0.55, fill: 0.08, w: 0.07, life: 1e9, rev: 0.2, spin: 3 });
      return v;
    },
    cast(kit, v, u, s, k) {
      lockOf.set(u.id, u.cast.target);
      const o = kit.match && u.cast.target >= 0 ? kit.match.units[u.cast.target] : null, a = u.cast.aim;
      const tx = o && o.alive ? o.x : u.x + Math.cos(a) * 12, tz = o && o.alive ? o.z : u.z + Math.sin(a) * 12;
      v.s.position.set(tx, 0.15, tz); v.s.scale.setScalar(2.4 * (1.25 - 0.3 * k));
      layStrip(v.line, u.x + Math.cos(a), 1.2, u.z + Math.sin(a), tx, tz, 0.12 + 0.12 * k);
      v.chev.forEach((c, i) => { const b = i * Math.PI / 2 + 0.785, d = 3.6 - 2.0 * Math.min(1, k * 1.1); c.position.set(tx + Math.cos(b) * d, 0.2, tz + Math.sin(b) * d); c.rotation.y = -b + Math.PI; c.scale.setScalar(1.1); });
      if (Math.random() < 0.3) kit.glow(u.x + Math.cos(a) * 1.4, 1.3, u.z + Math.sin(a) * 1.4, BC_BLUE, 0.1, 0.8 + k, 0.7, kit.K.GLOW, 1.1);
    },
    castDrop(kit, v) { v.h.on = false; stop(v.s); },
    // the strike lands on the locked target (where the reticle was), not at the far end of the line
    beam(kit, e, u) {
      const o = kit.match && lockOf.get(u.id) >= 0 ? kit.match.units[lockOf.get(u.id)] : null, a = Math.atan2(e.z1 - e.z0, e.x1 - e.x0);
      const L = Math.hypot(e.x1 - e.x0, e.z1 - e.z0), d = o && o.alive ? Math.min(L, Math.hypot(o.x - e.x0, o.z - e.z0)) : L;
      const hx = e.x0 + Math.cos(a) * d, hz = e.z0 + Math.sin(a) * d, w = Math.max(3.2, (e.w || 0.6) * 5.5);
      const lance = strip(BC_BLUE, C(1.6, 2.4, 2.6), { p: 1.1, taper: 0.75 }), core = strip(BC_ORG, C(2.6, 2.3, 1.6), { add: true, p: 1.5, taper: 0.75 }), rest = strip(BC_BLUE, C(1.6, 2.4, 2.6), { add: true, p: 2 });
      layStrip(lance, hx, 1.15, hz, e.x0, e.z0, w); layStrip(core, hx, 1.2, hz, e.x0, e.z0, w * 0.3); layStrip(rest, hx, 1.2, hz, e.x1, e.z1, 0.35);
      own(kit, [lance, core, rest], 0.6, (t) => { const f = Math.min(1, (0.6 - t) / 0.4); lance.material.uniforms.uA.value = f; rest.material.uniforms.uA.value = f * 0.7; core.material.uniforms.uA.value = Math.min(1, (0.3 - t) / 0.15); });
      // the kingfisher itself dives down the lance to the target
      { const g = kingfisherDart(); own(kit, [g], 0.35, (t) => { const k = Math.min(1, t / 0.1); g.position.set(e.x0 + (hx - e.x0) * k, 1.4, e.z0 + (hz - e.z0) * k); g.rotation.y = -a; g.scale.setScalar(3.2); fadeAll(g, Math.min(1, (0.35 - t) / 0.15)); }); }
      // spray thrown out to both sides of the strike, like water parting under a dive, and a crown of water spikes
      for (const sd of [-1, 1]) fan(kit, hx, hz, a + Math.PI - sd * 0.5, -sd * 1.9, 1.6, 5.2, BC_BLUE, C(2.2, 2.5, 2.6), 0.6, 0.12, 0.6);
      spikes(kit, hx, hz, 16, 3.0, 4.6, BC_BLUE, 0.7, { core: 0x08305a, up: 0.1 });
      sigil(kit, hx, hz, 4.2, BC_BLUE, { c2: BC_ORG, n: 0, ticks: 8, inner: 0.55, fill: 0.12, w: 0.07, life: 0.7, rev: 0.02, spin: 3 });
      ripples(kit, hx, hz, 3, 6, BC_BLUE, 0.8);
      kit.sparks(hx, 1.2, hz, kit.N(14), BC_BLUE, 9, 0.5, 0.06, 1.6, 14);
      kit.flash(e.x0, 1.6, e.z0, BC_BLUE, 50, 0.25); kit.flash(hx, 1.6, hz, BC_ORG, 40, 0.25); kit.kick(hx, hz, 0.6);
      return true;
    },
  },
};

// =====================================================================================================================
// Rết Đỏ: a crimson centipede with bone-white legs and fangs (clip 金木 p62 bursts kagune out of the mech; ours a centipede)
const RD_RED = C(2.4, 0.18, 0.22), RD_BONE = 0xeadcc6, RD_DARK = C(0.3, 0.02, 0.04);
const segGeo = keep(new THREE.SphereGeometry(0.5, 14, 8).scale(0.72, 0.38, 1));
const legGeo = (() => { const s = new THREE.Shape(); s.moveTo(0.14, 0); s.quadraticCurveTo(0.18, 0.7, -0.42, 1.3); s.quadraticCurveTo(-0.04, 0.62, -0.14, 0); s.lineTo(0.14, 0); return keep(new THREE.ShapeGeometry(s, 8).rotateX(-Math.PI / 2)); })();
const fangGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, 0.18); s.quadraticCurveTo(0.75, 0.42, 1.0, -0.06); s.quadraticCurveTo(0.6, 0.16, 0, -0.06); s.lineTo(0, 0.18); return keep(new THREE.ShapeGeometry(s, 10).rotateX(-Math.PI / 2)); })();
// a chain of n segments, head first: dark red plates in a red glow, a pair of bone legs each, two fangs on the head
function centipede(n) {
  const g = new THREE.Group(), body = basic(0x6c0a12, false, 0.97), glow = basic(RD_RED, true, 0.3), bone = basic(RD_BONE, false, 0.95), segs = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Group(), b = new THREE.Mesh(segGeo, body), h = new THREE.Mesh(segGeo, glow), l1 = new THREE.Mesh(legGeo, bone), l2 = new THREE.Mesh(legGeo, bone);
    h.scale.setScalar(1.25); h.renderOrder = 6; b.renderOrder = 8; l1.renderOrder = l2.renderOrder = 9; l2.scale.z = -1; l1.position.z = -0.32; l2.position.z = 0.32;
    s.add(h, b, l1, l2);
    if (i === 0) for (const sd of [-1, 1]) { const f = new THREE.Mesh(fangGeo, bone); f.position.set(0.25, 0.05, sd * 0.18); f.scale.z = -sd; f.renderOrder = 9; s.add(f); }
    g.add(s); segs.push(s);
  }
  g.traverse((m) => { m.frustumCulled = false; });
  g.userData.segs = segs;
  return g;
}
// lay the chain on path(f) (f 0 head .. 1 tail), each segment facing along the path, tapering, legs paddling
function layChain(g, path, sc, t) {
  const segs = g.userData.segs, n = segs.length;
  segs.forEach((s, i) => {
    const f = i / (n - 1), p = path(f), q = path(Math.max(0, f - 0.02)), r = path(Math.min(1, f + 0.02));
    s.position.set(p[0], p[1], p[2]); s.rotation.y = -Math.atan2(q[2] - r[2], q[0] - r[0]);
    const k = sc * (1.1 - 0.5 * f); s.scale.setScalar(k);
    const w = Math.sin(t * 22 + i * 1.3) * 0.35; s.children[2].rotation.y = w; s.children[3].rotation.y = -w;
  });
}
// a point d metres back along a history of points (newest first), carried on straight past its end along a
function backAlong(hist, d, a, y) {
  let acc = 0;
  for (let i = 0; i < hist.length - 1; i++) { const p = hist[i], q = hist[i + 1], L = Math.hypot(q[0] - p[0], q[2] - p[2]); if (acc + L >= d && L > 1e-4) { const f = (d - acc) / L; return [p[0] + (q[0] - p[0]) * f, y, p[2] + (q[2] - p[2]) * f]; } acc += L; }
  const e = hist[hist.length - 1] || [0, y, 0], rest = d - acc; return [e[0] - Math.cos(a) * rest, y, e[2] - Math.sin(a) * rest];
}
const retdo = {
  // Phóng Dao: every knife flies as a little crimson centipede, fangs first, legs paddling
  rdKnife: {
    pal: [RD_RED, C(2.4, 2.1, 1.7)], hitR: 1.3,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.2, 1.2, u.z + Math.sin(e.a) * 1.2, RD_RED, 0.1, 1.2, 0.8, kit.K.STAR, 1.2); return true; },
    shotMake(kit, s) { const g = centipede(8), v = { g, h: held(kit, [g]), a: Math.atan2(s.dz, s.dx), hist: [], t: 0 }; return v; },
    shot(kit, v, s, x, y, z, dt) {
      v.t += dt || 0.016; v.hist.unshift([x, 1.1, z]); if (v.hist.length > 30) v.hist.pop();
      const wig = (f) => Math.sin(v.t * 26 - f * 9) * 0.28 * f;
      layChain(v.g, (f) => { const p = backAlong(v.hist, f * 7.5, v.a, 1.1), w = wig(f); return [p[0] - Math.sin(v.a) * w, 1.1, p[2] + Math.cos(v.a) * w]; }, 2.0, v.t);
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.h.on = false; kit.sparks(x, 1.1, z, kit.N(8), RD_RED, 7, 0.3, 0.05, 0.6, 10); kit.glow(x, 1.1, z, RD_RED, 0.15, 1.4, 0.8, kit.K.GLOW, 1.2); },
  },
  // Lộn Ngược: a great centipede coils round him in a closed ring while he flips back and holds; struck, it snaps its fangs
  rdCoil: {
    pal: [RD_RED, C(2.4, 2.1, 1.7)], hitR: 1.4,
    skill(kit, e, u, row) {
      const g = centipede(16), life = (row.window || 0.6) + 0.45, a0 = e.a + Math.PI;
      own(kit, [g], life, (t) => {
        if (!u.alive) return false;
        const k = Math.min(1, t / 0.18), rr = 2.9, th = a0 + t * 5;
        layChain(g, (f) => { const b = th - f * 5.6 * k; return [u.x + Math.cos(b) * rr, 1.0 + 0.25 * Math.sin(f * 12 + t * 8), u.z + Math.sin(b) * rr]; }, 1.5, t);
        fadeAll(g, Math.min(1, (life - t) / 0.25));
      });
      sigil(kit, u.x, u.z, 3.6, RD_DARK, { n: 0, ticks: 0, inner: 0.78, fill: 0.5, w: 0.08, life, rev: 0.1, alpha: 0.7, follow: u, y: 0.12 });
      return true;
    },
    parry(kit, e, u) {
      const o = kit.match && kit.match.units[e.by], a = o ? Math.atan2(o.z - u.z, o.x - u.x) : u.aim;
      for (const sd of [-1, 1]) {
        const f = glowed(fangGeo, RD_BONE, RD_RED); f.scale.set(3, 1, 3 * -sd);
        own(kit, [f], 0.45, (t) => { const k = Math.min(1, t / 0.1); f.position.set(u.x + Math.cos(a) * 1.4, 1.3, u.z + Math.sin(a) * 1.4); f.rotation.y = -a + sd * (0.9 - 0.8 * k); fadeAll(f, Math.min(1, (0.45 - t) / 0.2)); });
      }
      kit.flash(u.x, 1.6, u.z, RD_RED, 40, 0.25); kit.sparks(u.x + Math.cos(a) * 2, 1.2, u.z + Math.sin(a) * 2, kit.N(10), RD_RED, 8, 0.35, 0.05, 0.5, 10, Math.cos(a), Math.sin(a), 0.6);
      return true;
    },
  },
  // Hỗn Loạn: four centipedes whirl round him through the whole field, a dark red floor; red motes drain in to him
  rdChaos: {
    pal: [RD_RED, C(2.4, 2.1, 1.7)], hitR: 1.4,
    skill() { return true; },
    zoneMake(kit, z) {
      const chains = [0, 1, 2, 3].map(() => centipede(12));
      const v = { chains, h: held(kit, chains), t: 0 };
      v.s = sigil(kit, z.x, z.z, z.r, RD_DARK, { c2: RD_RED, n: 0, ticks: 0, inner: 0.93, fill: 0.35, w: 0.05, life: 1e9, rev: 0.25, alpha: 0.75, y: 0.12 });
      v.s2 = sigil(kit, z.x, z.z, z.r, RD_RED, { n: 0, ticks: 18, inner: 0, fill: 0, w: 0.05, life: 1e9, rev: 0.3, spin: -1.2, alpha: 0.8, y: 0.13 });
      return v;
    },
    zone(kit, v, z, dt) {
      v.t += dt; const end = Math.min(1, (z.dur - z.age) * 2.5), k = Math.min(1, z.age / 0.3);
      v.s.position.x = v.s2.position.x = z.x; v.s.position.z = v.s2.position.z = z.z;
      v.chains.forEach((g, j) => {
        const rr = z.r * (0.42 + 0.17 * j), sp = (j % 2 ? -1 : 1) * (3.4 - j * 0.5), th = j * 1.571 + v.t * sp;
        layChain(g, (f) => { const b = th - Math.sign(sp) * f * 2.6 * k, r2 = rr * (1 + 0.12 * Math.sin(f * 7 + v.t * 5 + j)); return [z.x + Math.cos(b) * r2, 1.0 + 0.3 * Math.sin(f * 10 + v.t * 9), z.z + Math.sin(b) * r2]; }, 1.75, v.t);
        fadeAll(g, end * k);
      });
      if (Math.random() < dt * 30) { const b = Math.random() * 6.283, d = z.r * R(0.7, 1); kit.glow(z.x + Math.cos(b) * d, 0.8, z.z + Math.sin(b) * d, RD_RED, 0.4, R(0.35, 0.6), 0.9, kit.K.SPARK, 0.6, -Math.cos(b) * d * 2.2, 0.5, -Math.sin(b) * d * 2.2); }
    },
    zoneDrop(kit, v) { v.h.on = false; stop(v.s); stop(v.s2); },
  },
};

// =====================================================================================================================
// Bọ Ngựa: a mantis's raptorial sickles, black blades in jade light, pale lime-white edges (clip 桐人 p80: curved blade arcs)
const BN_JADE = C(0.3, 2.1, 0.85), BN_PALE = C(2.0, 2.6, 1.7), BN_BODY = 0x0d2516;
// a sickle: a blade curving along an arc to a hooked point, spines along its inner edge
const sickleGeo = (() => {
  const s = new THREE.Shape(), N = 20, Rb = 1.7, phi = 1.75, out = [], inn = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, w = 0.5 * Math.pow(1 - t, 0.7), tooth = i % 2 && i > 1 && i < N - 1 ? 0.12 * (1 - t) : 0, b = phi * t;
    out.push([Rb * Math.sin(b), Rb - Rb * Math.cos(b)]);
    const ri = Rb - w + tooth * -1; inn.push([ri * Math.sin(b), Rb - ri * Math.cos(b)]);
  }
  s.moveTo(out[0][0], out[0][1]); for (const p of out.slice(1)) s.lineTo(p[0], p[1]); for (const p of inn.slice(0, -1).reverse()) s.lineTo(p[0], p[1]); s.lineTo(out[0][0], out[0][1]);
  return keep(new THREE.ShapeGeometry(s).translate(-0.2, -0.05, 0).rotateX(-Math.PI / 2));
})();
const sickle = () => glowed(sickleGeo, BN_BODY, BN_JADE, 0.97, [[1.18, 0.22], [1.07, 0.7]]);
const bongua = {
  // Chém Lướt: the two sickles ride open in front of him through the dash and snap shut at the end, two jade smears crossing
  bnSlash: {
    pal: [BN_JADE, BN_PALE], hitR: 1.5,
    skill(kit, e, u) {
      const a = e.a, L = sickle(), Rr = sickle(); let end = -1;
      Rr.scale.set(2.2, 1, -2.2); L.scale.set(2.2, 1, 2.2);
      own(kit, [L, Rr], 0.6, (t) => {
        if (!u.alive) return false;
        if (end < 0 && (t > 0.05 && !u.dash || t > 0.4)) { end = t; for (const sd of [-1, 1]) fan(kit, u.x, u.z, a - sd * 1.9, sd * 1.75, 1.2, 4.6, BN_JADE, BN_PALE, 0.45, 0.1); kit.sparks(u.x + Math.cos(a) * 2.4, 1.1, u.z + Math.sin(a) * 2.4, kit.N(10), BN_PALE, 8, 0.3, 0.05, 0.5, 10, Math.cos(a), Math.sin(a), 0.8); kit.flash(u.x, 1.5, u.z, BN_JADE, 35, 0.2); }
        const open = end < 0 ? 1 : Math.max(0, 1 - (t - end) / 0.08), f = end < 0 ? 1 : Math.max(0, 1 - (t - end) / 0.3);
        for (const [g, sd] of [[L, 1], [Rr, -1]]) { g.position.set(u.x + Math.cos(a) * 0.6 + Math.cos(a + sd * 1.57) * 0.5, 1.3, u.z + Math.sin(a) * 0.6 + Math.sin(a + sd * 1.57) * 0.5); g.rotation.y = -(a + sd * (0.15 + 0.9 * open)); fadeAll(g, f); }
      });
      trail(kit, (t) => (t < 0.4 && u.alive && (t < 0.05 || u.dash) ? [u.x, 0.9, u.z] : null), 1.0, BN_JADE, 0.45, { c2: C(0.02, 0.2, 0.08), len: 12, alpha: 0.7 });
      return true;
    },
  },
  // Thế Đỡ: both sickles raised crossed before him like a praying mantis; struck, six sickles wheel out in a jade ring
  bnGuard: {
    pal: [BN_JADE, BN_PALE], hitR: 1.5,
    skill(kit, e, u, row) {
      const life = (row.window || 1) + 0.2, L = sickle(), Rr = sickle();
      Rr.scale.set(3.0, 1, -3.0); L.scale.set(3.0, 1, 3.0);
      own(kit, [L, Rr], life, (t) => {
        if (!u.alive) return false;
        const a = u.aim, k = Math.min(1, t / 0.12), f = Math.min(1, (life - t) / 0.2);
        for (const [g, sd] of [[L, 1], [Rr, -1]]) { g.position.set(u.x + Math.cos(a) * 0.9 + Math.cos(a - sd * 1.57) * 1.0, 1.4, u.z + Math.sin(a) * 0.9 + Math.sin(a - sd * 1.57) * 1.0); g.rotation.y = -(a + sd * (0.75 - 0.25 * k)); fadeAll(g, f * (0.85 + 0.15 * Math.sin(t * 14))); }
      });
      kit.glow(u.x + Math.cos(e.a) * 1.6, 1.4, u.z + Math.sin(e.a) * 1.6, BN_JADE, 0.15, 1.6, 0.6, kit.K.GLOW, 1.2);
      return true;
    },
    parry(kit, e, u, row) {
      const r = (row.riposte && row.riposte.nova && row.riposte.nova.radius) || 3.5, ring = new THREE.Group();
      for (let i = 0; i < 6; i++) { const g = sickle(); g.scale.setScalar(1.6); const p = new THREE.Group(); g.position.set(r * 0.45, 0, 0); p.rotation.y = -i * 1.047; p.add(g); ring.add(p); }
      own(kit, [ring], 0.55, (t) => { const k = Math.min(1, t / 0.12); ring.position.set(u.x, 1.1, u.z); ring.rotation.y = -t * 9; ring.scale.setScalar(0.5 + 0.7 * k); fadeAll(ring, Math.min(1, (0.55 - t) / 0.25)); });
      fan(kit, u.x, u.z, u.aim, 6.283, r * 0.55, r, BN_JADE, BN_PALE, 0.5, 0.16, 0.8);
      kit.flash(u.x, 1.6, u.z, BN_PALE, 40, 0.25); kit.kick(u.x, u.z, 0.4);
      return true;
    },
  },
  // Song Liềm: every pass through the target a giant ghost sickle swings round it, leaving a jade smear; the passes stack
  // into a flower of crossing arcs (the clip's curved blades curling round the victim)
  bnFlurry: {
    pal: [BN_JADE, BN_PALE], hitR: 1.6,
    skill(kit, e, u) { kit.glow(u.x, 1.3, u.z, BN_JADE, 0.15, 2, 0.7, kit.K.GLOW, 1.2); return true; },
    flurry(kit, e, u) {
      const a = Math.atan2(e.z - u.z, e.x - u.x), base = a + Math.PI * 0.5 + e.step * 0.7;
      // two sickles cross through the victim from both sides, each leaving its smear: an X that turns a little every pass
      for (const sd of [-1, 1]) {
        const a0 = base + (sd > 0 ? 0 : Math.PI), span = -sd * 2.4, g = sickle();
        fan(kit, e.x, e.z, a0, span, 1.2, 5.0, BN_JADE, BN_PALE, 0.7, 0.13, 1.0);
        own(kit, [g], 0.45, (t) => { const k = Math.min(1, t / 0.13), b = a0 + span * k; g.position.set(e.x + Math.cos(b) * 2.0, 1.2, e.z + Math.sin(b) * 2.0); g.rotation.y = -(b - sd * 1.4); g.scale.set(2.8, 1, 2.8 * sd); fadeAll(g, Math.min(1, (0.45 - t) / 0.2)); });
      }
      if (e.step === 1) sigil(kit, e.x, e.z, 3.2, BN_JADE, { c2: BN_PALE, n: 7, m: 3, ticks: 0, inner: 0.7, fill: 0.08, w: 0.06, life: 1.6, rev: 0.15, spin: 1.5 });
      kit.sparks(e.x, 1.2, e.z, kit.N(8), BN_PALE, 8, 0.3, 0.05, 0.5, 10);
      return true;
    },
  },
};

// =====================================================================================================================
// Tắc Kè: thrown shields of concentric rings with a star (clip 上尉 p21), gecko teal with silver-white
const TK_TEAL = C(0.25, 2.1, 1.65), TK_SIL = 0xe8f2f0, TK_DARK = 0x0b3a34;
const ring = (a, b) => keep(new THREE.RingGeometry(a, b, 40).rotateX(-Math.PI / 2));
const starGeo = (() => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.17 : 0.42, b = Math.PI / 2 + i * Math.PI / 5; i ? s.lineTo(Math.cos(b) * r, Math.sin(b) * r) : s.moveTo(Math.cos(b) * r, Math.sin(b) * r); } return keep(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)); })();
const discParts = [[ring(0.78, 1.0), 0x1fa58c], [ring(0.56, 0.78), TK_SIL], [ring(0.44, 0.56), 0x1fa58c], [keep(new THREE.CircleGeometry(0.44, 32).rotateX(-Math.PI / 2)), TK_DARK], [starGeo, TK_SIL]], haloGeo = ring(0.95, 1.3);
function shieldDisc() {
  const g = new THREE.Group(), h = new THREE.Mesh(haloGeo, basic(TK_TEAL, true, 0.28)); h.renderOrder = 6; g.add(h);
  discParts.forEach(([geo, c], i) => { const m = new THREE.Mesh(geo, basic(c, false, 0.97)); m.position.y = 0.01 * i; m.renderOrder = 8 + i; g.add(m); });
  g.traverse((m) => { m.frustumCulled = false; });
  return g;
}
const pylonGeo = keep(new THREE.CylinderGeometry(0.13, 0.22, 1.7, 12).translate(0, 0.85, 0)), capGeo = keep(new THREE.SphereGeometry(0.3, 14, 10));
function discShot(sc) {
  return {
    shotMake(kit, s) { const g = shieldDisc(), v = { g, h: held(kit, [g]), x: s.x, z: s.z, live: true, t: 0 }; trail(kit, () => (v.live ? [v.x, 1.2, v.z] : null), 0.5 * sc, TK_TEAL, 0.35, { c2: C(0.02, 0.25, 0.2), len: 10, alpha: 0.8 }); return v; },
    shot(kit, v, s, x, y, z, dt) { v.t += dt || 0.016; v.x = x; v.z = z; v.g.position.set(x, 1.25, z); v.g.rotation.y = v.t * 14; v.g.scale.setScalar(sc); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; v.h.on = false; kit.sparks(x, 1.2, z, kit.N(8), TK_TEAL, 8, 0.3, 0.05, 0.5, 10); kit.glow(x, 1.2, z, TK_TEAL, 0.12, 1.3, 0.8, kit.K.STAR, 1.2); },
  };
}
const tacke = {
  // Dây Điện: two teal pylons and a crackling teal wire strung between them, a soft glow along the floor under it
  tkWire: {
    zones: ['wire'], pal: [TK_TEAL, C(2.4, 2.6, 2.6)], hitR: 1.3,
    skill() { return true; },
    zoneMake(kit, z) {
      const [p, q] = z.pts, posts = [], glowM = basic(TK_TEAL, true, 0.55);
      for (const e of [p, q]) {
        const g = new THREE.Group(), post = new THREE.Mesh(pylonGeo, basic(0x2a4a46, false, 1)), cap = new THREE.Mesh(capGeo, basic(TK_SIL, false, 1)), halo = new THREE.Mesh(capGeo, glowM);
        cap.position.y = 1.85; halo.position.y = 1.85; halo.scale.setScalar(2.4); g.add(post, halo, cap); g.userData.s = 1.6; g.position.set(e[0], 0, e[1]); g.traverse((m) => { m.frustumCulled = false; }); posts.push(g);
      }
      const floor = strip(TK_TEAL, C(1.6, 2.6, 2.4), { p: 1.3 }), wire = ribbonMesh(13, TK_TEAL, true, 0.75), core = ribbonMesh(13, C(2.4, 2.6, 2.6), true, 1);
      layStrip(floor, p[0], 0.13, p[1], q[0], q[1], 4.2);
      const v = { posts, floor, wire, core, h: held(kit, [...posts, floor, wire, core]), acc: 9, p, q };
      return v;
    },
    zone(kit, v, z, dt) {
      const arm = z.delay > 0 ? 0.35 : 1, end = Math.min(1, (z.dur - z.age) * 2), k = Math.min(1, z.age / 0.2) * end;
      v.acc += dt;
      if (v.acc > 0.06) { v.acc = 0; const pts = boltPts([v.p[0], 3.7, v.p[1]], [v.q[0], 3.7, v.q[1]], 12, 0.35); fillRibbon(v.wire, pts, 0.7); fillRibbon(v.core, pts, 0.16); }
      v.wire.material.opacity = 0.75 * arm * k * (0.7 + 0.3 * Math.random()); v.core.material.opacity = arm * k;
      v.floor.material.uniforms.uA.value = 0.85 * arm * k;
      for (const g of v.posts) { g.scale.setScalar(2.0 * Math.max(0.01, Math.min(1, z.age / 0.15))); fadeAll(g, end); }
      if (arm === 1 && Math.random() < dt * 6) { const f = Math.random(); kit.sparks(v.p[0] + (v.q[0] - v.p[0]) * f, 1.8, v.p[1] + (v.q[1] - v.p[1]) * f, 3, TK_TEAL, 5, 0.25, 0.04, 0.4, 12); }
    },
    zoneDrop(kit, v) { v.h.on = false; },
  },
  // Chùm Nảy: five small shields spin out in a fan on short teal wakes
  tkBounce: { pal: [TK_TEAL, C(2.4, 2.6, 2.6)], hitR: 1.2, skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.3, 1.3, u.z + Math.sin(e.a) * 1.3, TK_TEAL, 0.12, 1.5, 0.8, kit.K.STAR, 1.2); return true; }, ...discShot(1.95) },
  // Bão Đĩa: a teal star emblem flashes under him and fourteen bigger shields fly out all round
  tkStorm: {
    pal: [TK_TEAL, C(2.4, 2.6, 2.6)], hitR: 1.3,
    skill(kit, e, u) {
      sigil(kit, u.x, u.z, 4.6, TK_TEAL, { c2: C(2.2, 2.6, 2.5), n: 5, m: 2, ticks: 0, inner: 0.62, fill: 0.12, w: 0.07, life: 0.75, rev: 0.12, spin: 4, grow: 14 });
      kit.flash(u.x, 2, u.z, TK_TEAL, 50, 0.3); kit.kick(u.x, u.z, 0.4);
      return true;
    },
    ...discShot(1.5),
  },
};

export const B9 = { ...enbac, ...boica, ...retdo, ...bongua, ...tacke };
