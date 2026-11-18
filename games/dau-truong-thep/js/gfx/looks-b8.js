// Looks, batch 8: Trâu Sắt, Thợ Rèn, Hỏa Long, Khỉ Pháo, Khỉ Đột, Đom Đóm. Render only (see looks.js for the hooks).
// One main colour and one accent per tank, one strong shape per skill; bursts are only brief flashes where blows land.
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP-b8.md):
//   擎天 p45 (Trâu Sắt): a wide steel-blue ring round the tank, a blue crescent sweep, an orange blast on the floor.
//   钢铁 p73 (Thợ Rèn): thin orange beams, steel-blue rings on the targets, white-blue flashes; ours is a forge: an orange-hot
//     gear under the turret, a horseshoe magnet, iron mines with a hazard triangle.
//   燎 p4 (Hỏa Long): a red dragon; clusters of dark molten rock with glowing seams, a red flame swirl. Ours: lava rocks, a wall
//     of dragon scales, one thick lava stream (not the flame jets, rings, fox fire or fire wheel of the other fire tanks).
//   悟空 p25 (Khỉ Pháo): gold and orange, a spinning gold band, a staff from the sky. Ours keeps gold with the tank's violet:
//     a grinning bomb, a golden somersault cloud, firework blooms.
//   巨人 p23 (Khỉ Đột): a green giant: green aura and a rising green column, a green sphere wrapped in lime lightning.
//   绮翠之心 p91 (Đom Đóm, partial): emerald healing bubbles on allies, green orbs. Ours: warm firefly light with mint bubbles.
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, sigil, shell, pillar, trail, burst } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);
const keep = (g) => { g.userData.keep = true; return g; };
const basic = (c, add, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
// the base opacity lives on the material: pieces of one group may share a material
function fadeAll(g, k) { g.traverse((m) => { const t = m.material; if (t) { if (t.userData.op === undefined) t.userData.op = t.opacity; t.opacity = t.userData.op * k; } }); }
const norm = (c) => c.clone().multiplyScalar(1 / Math.max(c.r, c.g, c.b, 1e-3));
const WHITE = C(2.4, 2.4, 2.4);
const soft = (c) => (Math.max(c.r, c.g, c.b) <= 1 ? c.clone() : norm(c));   // a dark colour stays dark

// ---- soft ring -------------------------------------------------------------------------------------------------------
// A flat ring with a gaussian edge (no hard lines): radius uR (0..1 of R), width uW, an optional faint fill inside.
const FLAT_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RING_FRAG = `uniform vec3 uC, uC2; uniform float uA, uR, uW, uFill; varying vec2 vUv;
  void main() { vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
    float b = exp(-pow((r - uR) / uW, 2.0)); float f = uFill * smoothstep(0.0, uR, r) * step(r, uR);
    vec3 c = mix(uC, uC2, b * b); float a = clamp(b + f, 0.0, 1.0) * uA; gl_FragColor = vec4(c * a, a); }`;
const flatGeo = keep(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
// opts: c2 (edge core), r0 (start radius 0..1), grow (s to reach full), w, fill, life, alpha, y, follow, add
function softRing(kit, x, z, Rad, c, opts = {}) {
  const mat = new THREE.ShaderMaterial({ vertexShader: FLAT_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    blending: opts.add ? THREE.AdditiveBlending : THREE.NormalBlending, premultipliedAlpha: true,
    uniforms: { uC: { value: soft(c) }, uC2: { value: soft(opts.c2 || c) }, uA: { value: 0 }, uR: { value: 0.9 }, uW: { value: opts.w ?? 0.06 }, uFill: { value: opts.fill ?? 0 } } });
  const m = new THREE.Mesh(flatGeo, mat), life = opts.life ?? 1, r0 = opts.r0 ?? 0.1, gr = opts.grow ?? 0.3, al = opts.alpha ?? 1, fade = opts.fade ?? Math.min(0.5, life * 0.6);
  m.position.set(x, opts.y ?? 0.14, z); m.scale.setScalar(Rad); m.renderOrder = 5;
  own(kit, [m], life, (t) => {
    if (opts.follow) { if (!opts.follow.alive) return false; m.position.x = opts.follow.x; m.position.z = opts.follow.z; }
    const k = gr > 0 ? 1 - (1 - Math.min(1, t / gr)) ** 2 : 1;
    mat.uniforms.uR.value = (r0 + (0.92 - r0) * k); mat.uniforms.uA.value = al * Math.min(1, t / 0.04, (life - t) / fade);
  });
  return m;
}

// ---- ribbons and bolts (as batch 5) ----------------------------------------------------------------------------------
function ribbonMesh(n, c, add, op) {
  const g = new THREE.BufferGeometry(), P = new Float32Array(n * 6), idx = [];
  for (let i = 0; i < n - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, basic(c, add, op)); m.renderOrder = add ? 8 : 7; return m;
}
function fillRibbon(m, pts, w) {
  const P = m.geometry.attributes.position.array, n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], hl = Math.hypot(dx, dz);
    let sx = 1, sz = 0; if (hl > 0.3 * Math.hypot(dx, dy, dz) && hl > 1e-4) { sx = -dz / hl; sz = dx / hl; }
    const ww = typeof w === 'function' ? w(i / (n - 1)) : w, p = pts[i];
    P[i * 6] = p[0] - sx * ww; P[i * 6 + 1] = p[1]; P[i * 6 + 2] = p[2] - sz * ww; P[i * 6 + 3] = p[0] + sx * ww; P[i * 6 + 4] = p[1]; P[i * 6 + 5] = p[2] + sz * ww;
  }
  m.geometry.attributes.position.needsUpdate = true;
}
function boltPts(a, b, segs, jit) {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, sx = -dz / L, sz = dx / L, pts = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs, j = i === 0 || i === segs ? 0 : jit * (Math.random() * 2 - 1), jy = i === 0 || i === segs ? 0 : jit * 0.6 * (Math.random() * 2 - 1);
    pts.push([a[0] + dx * f + sx * j + (L < 0.5 ? j : 0), a[1] + (b[1] - a[1]) * f + jy, a[2] + dz * f + sz * j]);
  }
  return pts;
}
function zap(kit, A, B, w, c, life, o = {}) {
  const segs = o.segs || 8, glow = ribbonMesh(segs + 1, c, true, 0.7), core = ribbonMesh(segs + 1, o.core || WHITE, true, 1);
  let acc = 9;
  own(kit, [glow, core], life, (t, dt) => {
    acc += dt;
    const a = typeof A === 'function' ? A(t) : A, b = typeof B === 'function' ? B(t) : B; if (!a || !b) return false;
    if (acc >= (o.every ?? 0.05)) { acc = 0; const p = boltPts(a, b, segs, o.jit ?? 0.4); fillRibbon(glow, p, w); fillRibbon(core, p, w * 0.3); }
    const k = Math.min(1, (life - t) / Math.min(0.12, life * 0.5)); glow.material.opacity = 0.7 * k; core.material.opacity = k;
  });
}

// ---- Trâu Sắt: steel blue, warm orange accent ------------------------------------------------------------------------
const TR_BLUE = C(0.45, 1.3, 2.6), TR_ORG = C(2.6, 1.15, 0.3), TR_STEEL = 0x1c3048;
// a heater shield standing upright: flat top, curved sides to a point at the bottom (local XY, facing +z)
const heaterGeo = (() => { const s = new THREE.Shape(); s.moveTo(-0.7, 0.9); s.lineTo(0.7, 0.9); s.quadraticCurveTo(0.72, -0.1, 0, -0.95); s.quadraticCurveTo(-0.72, -0.1, -0.7, 0.9); return keep(new THREE.ShapeGeometry(s, 10)); })();
function heater() {
  const g = new THREE.Group(), rim = new THREE.Mesh(heaterGeo, basic(0x3aa8ff, false, 0.95)), plate = new THREE.Mesh(heaterGeo, basic(TR_STEEL, false, 0.92)), core = new THREE.Mesh(heaterGeo, basic(0x2c5f96, false, 0.85)), boss = new THREE.Mesh(heaterGeo, basic(0xff8a2a, false, 1));
  rim.scale.setScalar(1.16); rim.position.z = -0.02; core.scale.setScalar(0.66); core.position.set(0, 0.06, 0.02); boss.scale.setScalar(0.17); boss.position.set(0, 0.25, 0.03);
  g.add(rim, plate, core, boss); [rim, plate, core, boss].forEach((m, i) => { m.renderOrder = 7 + i; }); return g;
}
// a chevron (the ram's bow wave) lying flat, point at +x
const chevGeo = (() => { const s = new THREE.Shape(); s.moveTo(1.25, 0); s.quadraticCurveTo(0.2, 0.9, -1.0, 1.75); s.lineTo(-1.55, 1.6); s.quadraticCurveTo(-0.3, 0.7, 0.45, 0); s.quadraticCurveTo(-0.3, -0.7, -1.55, -1.6); s.lineTo(-1.0, -1.75); s.quadraticCurveTo(0.2, -0.9, 1.25, 0); return keep(new THREE.ShapeGeometry(s, 12).rotateX(-Math.PI / 2)); })();
const ringGeo = keep(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2));
const trau = {
  // Giáp Phản Lực: six steel shields with blue rims stand round him and turn slowly while the shield holds; when it breaks
  // they fly off outward
  trGuard: {
    pal: [TR_BLUE, WHITE],
    skill(kit, e, u, row) {
      const dur = (row.dur || 4.5) + 0.2, g = new THREE.Group(), list = [];
      for (let i = 0; i < 6; i++) { const h = heater(), a = i * Math.PI / 3; h.userData.a = a; g.add(h); list.push(h); }
      let off = -1;
      own(kit, [g], dur + 0.5, (t, dt) => {
        if (!u.alive) return false;
        if (off < 0 && ((t > 0.3 && !(u.shield > 0)) || t > dur)) { off = t; kit.sparks(u.x, 1.2, u.z, kit.N(14), TR_ORG, 10, 0.4, 0.06, 0.5, 10); kit.flash(u.x, 1.6, u.z, TR_BLUE, 35, 0.25); }
        const k = Math.min(1, t / 0.18), o = off < 0 ? 0 : (t - off) / 0.4;
        if (o >= 1) return false;
        g.position.set(u.x, 0, u.z);
        for (const h of list) { const a = h.userData.a + t * 0.6, r = 2.7 + o * 3; h.position.set(Math.cos(a) * r, 1.5 + 0.1 * Math.sin(t * 3 + a), Math.sin(a) * r); h.rotation.set(0, -a + Math.PI / 2, 0, 'YXZ'); h.rotation.x = -0.55; h.scale.set(1.75, 1.75 * k, 1.75); }
        fadeAll(g, 1 - o);
      });
      softRing(kit, u.x, u.z, 3.8, TR_BLUE, { c2: C(0.8, 1.8, 2.6), w: 0.06, fill: 0.18, life: dur, r0: 0.4, grow: 0.2, follow: u, alpha: 0.9 });
      kit.flash(u.x, 1.6, u.z, TR_BLUE, 35, 0.25);
      return true;
    },
  },
  // Húc Thép: a steel-blue bow wave (a chevron) rides in front of him with two wakes behind; where he stops an orange blow
  trRam: {
    pal: [TR_ORG, WHITE], hitR: 2,
    skill(kit, e, u) {
      const a = e.a, ca = Math.cos(a), sa = Math.sin(a);
      const g = new THREE.Group(), glow = new THREE.Mesh(chevGeo, basic(TR_BLUE, true, 0.8)), body = new THREE.Mesh(chevGeo, basic(0x4f9be8, false, 0.9)), edge = new THREE.Mesh(chevGeo, basic(WHITE, true, 0.8));
      glow.scale.set(1.25, 1, 1.3); edge.scale.set(0.8, 1, 0.75); edge.position.x = 0.35; body.position.y = 0.02; edge.position.y = 0.04;
      g.add(glow, body, edge); g.traverse((m) => { m.renderOrder = 7; });
      let done = -1;
      const going = (t) => t < 0.5 && u.alive && done < 0 && (t < 0.06 || u.dash);
      own(kit, [g], 0.9, (t) => {
        if (!u.alive) return false;
        if (done < 0 && !going(t)) { done = t; const hx = u.x + ca * 2.2, hz = u.z + sa * 2.2; burst(kit, hx, hz, 2.2, TR_ORG, WHITE); kit.ring(hx, hz, 2.6, TR_ORG, 0.35); kit.kick(hx, hz, 0.5); }
        const f = done < 0 ? 1 : Math.max(0, 1 - (t - done) / 0.3), k = Math.min(1, t / 0.08);
        g.position.set(u.x + ca * 1.5, 0.7, u.z + sa * 1.5); g.rotation.y = -a; g.scale.set(1.5 * k, 1, 1.5 * (0.6 + 0.4 * k)); fadeAll(g, f);
      });
      for (const sd of [-1, 1]) trail(kit, (t) => (going(t) ? [u.x - ca * 0.5 - sa * sd * 2.3, 0.6, u.z - sa * 0.5 + ca * sd * 2.3] : null), 0.7, TR_BLUE, 0.7, { c2: C(0.1, 0.25, 0.6), len: 14 });
      return true;
    },
  },
  // Địa Chấn: an orange disc gathers under him; he stamps and the floor splits in a star of glowing orange fissures while a
  // steel-blue shock ring runs out to the edge and dust boils up round it
  trQuake: {
    pal: [TR_ORG, TR_BLUE], hitR: 2.2,
    skill() { return true; },
    castMake(kit, u, s) { return { s: softRing(kit, u.x, u.z, s.radius, TR_ORG, { c2: C(2.6, 1.8, 0.8), w: 0.05, fill: 0.25, life: 1e9, r0: 0.92, grow: 0, alpha: 0.9 }) }; },
    cast(kit, v, u, s, k) { v.s.position.set(u.x, 0.14, u.z); v.s.material.uniforms.uFill.value = 0.1 + 0.35 * k; if (Math.random() < 0.4) { const b = Math.random() * 6.283, d = s.radius * R(0.4, 1); kit.str.emit(u.x + Math.cos(b) * d, 0.2, u.z + Math.sin(b) * d, -Math.cos(b) * 9, 0, -Math.sin(b) * 9, TR_ORG, 0.25, 0.08, 0.05, 0, 1, 1); } },
    castDrop(kit, v) { stop(v.s); },
    nova(kit, e) {
      const r = e.r || 6.5, x = e.x, z = e.z, cracks = [];
      for (let i = 0; i < 11; i++) {
        const b = i * 0.571 + R(-0.2, 0.2), L = r * R(0.75, 1), pts = boltPts([x, 0.12, z], [x + Math.cos(b) * L, 0.12, z + Math.sin(b) * L], 9, 0.5);
        const dark = ribbonMesh(10, 0x140804, false, 0.92), hot = ribbonMesh(10, 0xff7a1c, false, 1); dark.renderOrder = 4; hot.renderOrder = 5;
        cracks.push([dark, hot, pts]);
      }
      own(kit, cracks.flatMap((c) => [c[0], c[1]]), 1.4, (t) => {
        const k = Math.min(1, t / 0.15), f = Math.min(1, (1.4 - t) / 0.6);
        for (const [dark, hot, pts] of cracks) {
          const n = Math.max(2, Math.round(pts.length * k)), p = pts.slice(0, n); while (p.length < pts.length) p.push(p[p.length - 1]);
          fillRibbon(dark, p, (q) => 0.62 * (1 - q * 0.7)); fillRibbon(hot, p.map((q) => [q[0], 0.14, q[2]]), (q) => 0.22 * (1 - q * 0.75));
          dark.material.opacity = 0.92 * f; hot.material.opacity = f;
        }
      });
      softRing(kit, x, z, r * 0.9, C(0.16, 0.08, 0.04), { w: 0.2, fill: 0.9, life: 1.3, r0: 0.5, grow: 0.06, alpha: 0.45 });
      softRing(kit, x, z, r * 1.05, TR_BLUE, { c2: C(0.6, 1.6, 2.6), w: 0.08, life: 0.6, r0: 0.35, grow: 0.3 });
      softRing(kit, x, z, r * 0.75, TR_BLUE, { w: 0.05, life: 0.5, r0: 0.25, grow: 0.25, alpha: 0.7 });
      for (let i = 0, n = kit.N(16); i < n; i++) { const b = (i / n) * 6.283; kit.puffs(x + Math.cos(b) * r * 0.8, 0.4, z + Math.sin(b) * r * 0.8, 1, C(0.42, 0.36, 0.3), 0.6, 3, 0.9, 1.4, 2.4, 0.7, 0.6, kit.K.DUST, 3); }
      kit.chips(x, 0.4, z, kit.N(14), C(0.35, 0.3, 0.27), 8, 0.9, 0.2);
      kit.glow(x, 0.6, z, TR_ORG, 0.25, 4, 0.8, kit.K.GLOW, 1.3); kit.flash(x, 2, z, TR_ORG, 60, 0.3); kit.kick(x, z, 0.9);
      return true;
    },
  },
};

// ---- Thợ Rèn: forge orange, steel-blue accent --------------------------------------------------------------------------
const TH_ORG = C(2.6, 0.95, 0.15), TH_HOT = C(2.6, 1.9, 0.8), TH_STEEL = C(0.45, 0.95, 1.7), TH_IRON = 0x241a14;
const gearGeo = (() => {
  const s = new THREE.Shape(), n = 12, Ro = 1, Ri = 0.8;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, w = Math.PI / n; const pts = [[Ri, a - w * 0.55], [Ro, a - w * 0.32], [Ro, a + w * 0.32], [Ri, a + w * 0.55]]; pts.forEach(([r, b], j) => { const x = Math.cos(b) * r, y = Math.sin(b) * r; if (i === 0 && j === 0) s.moveTo(x, y); else s.lineTo(x, y); }); }
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.5, 0, Math.PI * 2, true); s.holes.push(hole);
  return keep(new THREE.ShapeGeometry(s, 16).rotateX(-Math.PI / 2));
})();
const mineDome = keep(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), studGeo = keep(new THREE.ConeGeometry(0.1, 0.32, 5)), lampGeo = keep(new THREE.SphereGeometry(0.14, 8, 6));
// the horseshoe magnet hanging over the hole: an arc and two legs, orange-hot pole tips (local XY, open downward)
const hsArc = keep(new THREE.TorusGeometry(1, 0.3, 10, 24, Math.PI)), hsLeg = keep(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10).translate(0, -0.45, 0)), hsTip = keep(new THREE.CylinderGeometry(0.31, 0.31, 0.4, 10).translate(0, -1.1, 0));
function magnet() {
  const g = new THREE.Group(), steel = basic(0x3a5878, false, 1), glow = basic(TH_STEEL, true, 0.5), hot = basic(TH_HOT, true, 1);
  const halo = new THREE.Mesh(hsArc, glow); halo.scale.setScalar(1.12); g.add(halo, new THREE.Mesh(hsArc, steel));
  for (const sd of [-1, 1]) { const l = new THREE.Mesh(hsLeg, steel), t = new THREE.Mesh(hsTip, hot); l.position.x = t.position.x = sd; g.add(l, t); }
  g.traverse((m) => { m.renderOrder = 8; }); return g;
}
function spiralPts(x, z, a0, r0, r1, turn, y, n = 16) { const p = []; for (let i = 0; i < n; i++) { const f = i / (n - 1), r = r0 + (r1 - r0) * f, b = a0 + turn * f; p.push([x + Math.cos(b) * r, y, z + Math.sin(b) * r]); } return p; }
const tho = {
  // Ụ Súng: the turret stands on a forged gear, its teeth glowing orange-hot, turning; forge sparks fountain as it is set down
  thTurret: {
    zones: ['turret'], overlay: true,
    skill() { return true; },
    zoneMake(kit, z) {
      const g = new THREE.Group(), hot = new THREE.Mesh(gearGeo, basic(TH_ORG, true, 0.9)), iron = new THREE.Mesh(gearGeo, basic(TH_IRON, false, 0.9)), cool = new THREE.Mesh(gearGeo, basic(TH_STEEL, true, 0.35));
      hot.scale.setScalar(1.08); iron.position.y = 0.01; cool.scale.setScalar(0.62); cool.position.y = 0.02;
      g.add(hot, iron, cool); g.position.set(z.x, 0.13, z.z); g.traverse((m) => { m.renderOrder = 4; });
      for (let i = 0; i < kit.N(18); i++) { const a = Math.random() * 6.283, s = R(2, 5); kit.ovr.emit(z.x, 1.2, z.z, Math.cos(a) * s, R(4, 8), Math.sin(a) * s, i % 3 ? TH_HOT : TH_ORG, R(0.6, 1), R(0.08, 0.14), 1, 0.4, 14, 1, kit.K.SPARK); }
      kit.flash(z.x, 1.5, z.z, TH_ORG, 35, 0.25);
      return { g, h: held(kit, [g]), t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt; const k = Math.min(1, v.t / 0.25), out = Math.min(1, (z.dur - z.age) * 3);
      v.g.scale.setScalar(3.3 * (0.5 + 0.5 * k)); v.g.rotation.y = v.t * 0.5; fadeAll(v.g, out);
      if (Math.random() < dt * 5) { const a = Math.random() * 6.283; kit.ovr.emit(z.x + Math.cos(a) * 3.1, 0.3, z.z + Math.sin(a) * 3.1, Math.cos(a) * 2, R(2, 4), Math.sin(a) * 2, TH_HOT, 0.5, 0.08, 1, 0.4, 12, 1, kit.K.SPARK); }
    },
    zoneDrop(kit, v) { v.h.on = false; },
  },
  // Hố Từ: a horseshoe magnet hangs over the cursor, its poles orange-hot; steel-blue field lines spiral in over a dark hole
  // and iron filings stream to the centre
  thMagnet: {
    pal: [TH_STEEL, TH_HOT], hitR: 1.6,
    skill() { return true; },
    zoneMake(kit, z) {
      const m = magnet(); m.position.set(z.x, 4.2, z.z); m.rotation.x = -0.35;
      const hole = softRing(kit, z.x, z.z, z.r, C(0.03, 0.05, 0.09), { c2: TH_STEEL, w: 0.06, fill: 0.85, life: 1e9, r0: 0.3, grow: 0.25, alpha: 0.85 });
      const lines = []; for (let i = 0; i < 6; i++) { const l = ribbonMesh(16, TH_STEEL, true, 0.85); l.renderOrder = 6; lines.push(l); }
      return { m, hole, lines, h: held(kit, [m, ...lines]), t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt; const out = Math.min(1, (z.dur - z.age) * 3), k = Math.min(1, v.t / 0.25);
      v.m.scale.setScalar(1.5 * k); v.m.position.y = 4.2 + 0.15 * Math.sin(v.t * 6); fadeAll(v.m, out);
      v.lines.forEach((l, i) => { fillRibbon(l, spiralPts(z.x, z.z, i * 1.047 - v.t * 2.5, z.r * 0.95 * k, 0.4, 2.2, 0.2), (q) => 0.05 + 0.16 * Math.sin(q * Math.PI)); l.material.opacity = 0.85 * out; });
      if (Math.random() < dt * 30) { const b = Math.random() * 6.283, d = z.r * R(0.6, 1), s = R(4, 7); kit.ovr.emit(z.x + Math.cos(b) * d, 0.3, z.z + Math.sin(b) * d, -Math.cos(b) * s, 0.2, -Math.sin(b) * s, C(0.12, 0.12, 0.14), d / s, R(0.1, 0.18), 1, 0, 0, 1, kit.K.CHIP); }
      if (Math.random() < dt * 6) zap(kit, [z.x - 1.5 * 1.5, 2.6, z.z], [z.x + 1.5 * 1.5, 2.6, z.z], 0.12, TH_STEEL, 0.1, { segs: 6, jit: 0.3 });
    },
    zoneDrop(kit, v) { v.h.on = false; stop(v.hole); },
  },
  // Bãi Mìn: iron mines with studs and a blinking orange lamp, each in an orange hazard triangle; one goes off in a white-blue
  // flash with orange rivets flying out
  thMines: {
    zones: ['mine'], pal: [TH_ORG, TH_HOT], hitR: 1.6,
    skill() { return true; },
    zoneMake(kit, z, row, foe) {
      const g = new THREE.Group(), iron = basic(TH_IRON, false, 1), lamp = new THREE.Mesh(lampGeo, basic(TH_HOT, true, 1)), dome = new THREE.Mesh(mineDome, iron);
      for (let i = 0; i < 6; i++) { const a = i * 1.047, s = new THREE.Mesh(studGeo, iron); s.position.set(Math.cos(a) * 0.42, 0.3, Math.sin(a) * 0.42); s.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); g.add(s); }
      lamp.position.y = 0.55; g.add(dome, lamp); g.position.set(z.x, 0, z.z); g.scale.setScalar(1.9);
      const tri = sigil(kit, z.x, z.z, 3.2, TH_ORG, { c2: TH_ORG, n: 3, m: 1, ticks: 0, inner: 0, fill: 0.28, w: 0.1, life: 1e9, rev: 0.15, spin: 0, alpha: foe ? 0.45 : 0.95 });
      kit.sparks(z.x, 0.6, z.z, kit.N(5), TH_HOT, 5, 0.3, 0.05, 0.6, 10);
      return { g, lamp, tri, h: held(kit, [g]), t: 0 };
    },
    zone(kit, v, z, dt) { v.t += dt; const on = z.delay <= 0; v.lamp.material.opacity = on ? (Math.sin(v.t * 9) > 0 ? 1 : 0.25) : 0.4; v.g.scale.setScalar(1.9 * Math.min(1, v.t / 0.12)); },
    zoneDrop(kit, v) { v.h.on = false; stop(v.tri); },
    land(kit, e) {
      shell(kit, e.x, 1, e.z, 1.7, TH_STEEL, { c2: WHITE, p: 1.8, core: 0.05, life: 0.25, grow: 0.06, alpha: 0.6 });
      for (let i = 0, n = kit.N(12); i < n; i++) { const a = (i / n) * 6.283 + R(-0.2, 0.2), s = R(14, 22); kit.str.emit(e.x, 0.8, e.z, Math.cos(a) * s, R(1, 4), Math.sin(a) * s, i % 2 ? TH_ORG : TH_HOT, 0.3, 0.1, 0.06, 6, 1, 1); }
      kit.puffs(e.x, 0.8, e.z, kit.N(5), C(0.12, 0.1, 0.09), 0.8, 2.5, 0.8, 1.3, 2.4, 0.5, 0.7, kit.K.SMOKE, 2);
      softRing(kit, e.x, e.z, 4.2, C(0.2, 0.6, 1), { c2: C(0.6, 0.85, 1), w: 0.09, fill: 0, life: 0.6, r0: 0.3, grow: 0.25 });
      kit.scorch(e.x, e.z, 2, 3, 1.2, TH_ORG); kit.flash(e.x, 1.6, e.z, TH_STEEL, 50, 0.25); kit.kick(e.x, e.z, 0.4);
      return true;
    },
  },
};

// ---- flame tongue (shared by Hỏa Long and Khỉ Đột's rage mane) ----------------------------------------------------------
// An upright plane drawn as one flame: round foot, pointed licking tip, a soft edge colour going to a bright core near the
// foot, its outline wavering. Leans back toward the match camera. Scale x = width, y = height.
const FLAME_FRAG = `uniform vec3 uC, uC2; uniform float uA, uT, uSeed; varying vec2 vUv;
  void main() { float y = vUv.y; float wob = 0.1 * sin(y * 6.0 - uT * 9.0 + uSeed) * y;
    float x = (vUv.x - 0.5 - wob) * 2.0; float wd = sqrt(clamp(y * 5.0, 0.0, 1.0)) * pow(max(1.0 - y, 0.0), 0.75) + 0.001;
    float d = abs(x) / wd; float body = 1.0 - smoothstep(0.5, 1.0, d);
    float core = (1.0 - smoothstep(0.0, 0.7, d)) * (1.0 - smoothstep(0.15, 0.7, y));
    vec3 c = mix(uC, uC2, core); float a = body * uA * (1.0 - smoothstep(0.8, 1.0, y)) * 0.95; gl_FragColor = vec4(c * a, a); }`;
const flameGeo = keep(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(-0.45));
function flame(c, c2, seed = 0) {
  const m = new THREE.Mesh(flameGeo, new THREE.ShaderMaterial({ vertexShader: FLAT_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.NormalBlending, premultipliedAlpha: true,
    uniforms: { uC: { value: c.clone() }, uC2: { value: c2.clone() }, uA: { value: 0 }, uT: { value: 0 }, uSeed: { value: seed } } }));
  m.renderOrder = 7; return m;
}
const HF_EDGE = C(0.9, 0.12, 0.03), HF_MID = C(1, 0.45, 0.06), HF_CORE = C(1, 0.93, 0.6);

// ---- Hỏa Long: molten lava red, charcoal crust ----------------------------------------------------------------------------
const HL_RED = C(2.6, 0.5, 0.1), HL_GOLD = C(2.6, 1.6, 0.45), HL_CRUST = 0x1a0805;
// a molten rock: a dark faceted crust with the glowing core poking through its seams (two jittered icosahedra)
function rockGeo(seed) { const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position; let s = seed * 9301 + 49297; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; const m = new Map(); for (let i = 0; i < p.count; i++) { const key = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3); if (!m.has(key)) m.set(key, 0.8 + 0.35 * rnd()); const k = m.get(key); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k); } g.computeVertexNormals(); return keep(g); }
const ROCKS = [0, 1, 2, 3].map((i) => [rockGeo(i + 1), rockGeo(i + 7)]);
function rock(i = 0) {
  const [a, b] = ROCKS[i % 4], g = new THREE.Group();
  const core = new THREE.Mesh(a, new THREE.MeshBasicMaterial({ color: HL_GOLD, toneMapped: false, transparent: true, opacity: 1 })), crust = new THREE.Mesh(b, new THREE.MeshBasicMaterial({ color: HL_CRUST, toneMapped: false, transparent: true, opacity: 1 }));
  core.material.color.setRGB(1, 0.3, 0.05); crust.material.color.setHex(0x2a0d08); crust.scale.setScalar(1.1); crust.rotation.set(0.7, 1.1, 0.3); g.add(core, crust); return g;
}
const sphGeo = keep(new THREE.SphereGeometry(1, 16, 10));
// a dragon scale standing upright: rounded bottom, flat top (local XY)
const scaleGeo = (() => { const s = new THREE.Shape(); s.moveTo(-0.5, 0.55); s.lineTo(0.5, 0.55); s.lineTo(0.5, 0.1); s.quadraticCurveTo(0.48, -0.42, 0, -0.62); s.quadraticCurveTo(-0.48, -0.42, -0.5, 0.1); s.lineTo(-0.5, 0.55); return keep(new THREE.ShapeGeometry(s, 10)); })();
// the lava stream: an open tube along +x whose bright bands flow outward, a gold core
const LAVA_VERT = 'varying vec2 vUv; varying vec3 vN, vV; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const LAVA_FRAG = `uniform vec3 uC, uC2; uniform float uA, uT, uL; varying vec2 vUv; varying vec3 vN, vV;
  void main() { float f = abs(dot(normalize(vN), normalize(vV))); float flow = 0.55 + 0.45 * sin(vUv.y * uL * 1.3 - uT * 22.0 + sin(vUv.x * 18.85) * 1.5);
    float tip = smoothstep(1.0, 0.9, vUv.y) * smoothstep(0.0, 0.04, vUv.y);
    vec3 c = mix(uC, uC2, pow(f, 2.0) * flow); float a = (0.25 + 0.75 * pow(f, 0.7)) * uA * tip; gl_FragColor = vec4(c * a, a); }`;
const tubeGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).rotateZ(-Math.PI / 2).translate(0.5, 0, 0));
function lavaMat(c, c2) { return new THREE.ShaderMaterial({ vertexShader: LAVA_VERT, fragmentShader: LAVA_FRAG, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.NormalBlending, premultipliedAlpha: true, uniforms: { uC: { value: c }, uC2: { value: c2 }, uA: { value: 0 }, uT: { value: 0 }, uL: { value: 10 } } }); }
const MV = new THREE.Vector3();
const hlLen = new Map();
const hoalong = {
  // Quá Tải: five dragon-fire flames rise round him and circle, white-gold cores in red tongues, until the primed shot goes
  hlPrime: {
    skill(kit, e, u, row) {
      const dur = row.prime || 4, fl = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => flame(HF_EDGE, HF_CORE, i * 1.7));
      own(kit, fl, dur + 0.4, (t) => {
        if (!u.alive) return false;
        if (t > 0.3 && !(u.primeT > 0)) { for (const f of fl) kit.sparks(f.position.x, 1.2, f.position.z, kit.N(5), HL_GOLD, 8, 0.35, 0.06, 0.8, 6); return false; }
        const k = Math.min(1, t / 0.25);
        fl.forEach((f, i) => { const a = t * 2.2 + i * 0.7854; f.position.set(u.x + Math.cos(a) * 3.4, 0.2, u.z + Math.sin(a) * 3.4); f.scale.set(3 * k, 5 * k * (0.9 + 0.1 * Math.sin(t * 13 + i)), 1); f.material.uniforms.uT.value = t; f.material.uniforms.uA.value = 1; });
        if (Math.random() < 0.5) { const a = Math.random() * 6.283; kit.glow(u.x + Math.cos(a) * 2.6, R(1.5, 3), u.z + Math.sin(a) * 2.6, HL_GOLD, 0.5, 0.2, 1, kit.K.SPARK, 0.5, 0, 2, 0); }
      });
      kit.flash(u.x, 1.6, u.z, HL_RED, 35, 0.25);
      return true;
    },
  },
  // Màn Sáng: a curtain of dragon fire stands along the line, tall red tongues behind and gold ones in front, flickering
  hlScreen: {
    zones: ['wall'],
    skill() { return true; },
    zoneMake(kit, z) {
      const p0 = z.pts[0], p1 = z.pts[z.pts.length - 1], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + z.r * 1.2, dx = (p1[0] - p0[0]) / (L - z.r * 1.2 || 1), dz = (p1[1] - p0[1]) / (L - z.r * 1.2 || 1);
      const cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2, fl = [];
      for (const [row, n, h, w, c, c2] of [[0, Math.ceil(L / 0.9), 4.8, 2.6, HF_EDGE, HF_MID], [1, Math.ceil(L / 1.2), 3.2, 2.3, HF_MID, HF_CORE]]) {
        for (let i = 0; i < n; i++) { const f = flame(c, c2, i * 2.3 + row * 5), d = -L / 2 + (i + 0.5) * (L / n) + R(-0.15, 0.15); const off = (row ? 1 : -1) * (i % 2 ? 1.2 : 0.5); f.position.set(cx + dx * d - dz * off, 0.1, cz + dz * d + dx * off); f.userData.s = [w * R(0.85, 1.15), h * R(0.75, 1.15)]; f.rotation.z = (i % 2 ? 1 : -1) * R(0.2, 0.4); f.renderOrder = 7 + row; fl.push(f); }
      }
      for (let i = 0; i < kit.N(10); i++) { const t = Math.random(); kit.sparks(p0[0] + (p1[0] - p0[0]) * t, 0.3, p0[1] + (p1[1] - p0[1]) * t, 1, HL_GOLD, 5, 0.4, 0.05, 1, 6); }
      return { fl, h: held(kit, fl), t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt; const k = Math.min(1, v.t / 0.2), out = Math.min(1, (z.dur - z.age) * 4);
      v.fl.forEach((f, i) => { const [w, h] = f.userData.s; f.scale.set(w, h * k * (0.85 + 0.15 * Math.sin(v.t * 11 + i * 1.3)), 1); f.material.uniforms.uT.value = v.t; f.material.uniforms.uA.value = out; });
      if (Math.random() < dt * 8) { const f = v.fl[Math.floor(Math.random() * v.fl.length)]; kit.glow(f.position.x, R(2, 3.5), f.position.z, HL_GOLD, 0.6, 0.2, 1, kit.K.SPARK, 0.5, 0, 2.5, 0); }
    },
    zoneDrop(kit, v) { v.h.on = false; },
  },
  // Thiên Hỏa Tuyến: molten light gathers in the maw, then one thick lava stream pours down the lane, bands flowing out,
  // dark smoke curling off its sides, molten rocks bubbling up where it lands
  hlBreath: {
    pal: [HL_RED, HL_GOLD], hitR: 1.8,
    skill() { return true; },
    castMake(kit) {
      const outer = new THREE.Mesh(tubeGeo, lavaMat(C(1, 0.18, 0.03), C(1, 0.55, 0.12))), inner = new THREE.Mesh(tubeGeo, lavaMat(C(1, 0.45, 0.08), C(1, 0.95, 0.7)));
      outer.renderOrder = 7; inner.renderOrder = 8; const g = new THREE.Group(); g.add(outer, inner); g.visible = false;
      const rocks = [0, 1, 2, 3, 4, 5, 6].map((i) => rock(i)); rocks.forEach((r) => { r.visible = false; });
      return { g, outer, inner, rocks, h: held(kit, [g, ...rocks]), t: 0 };
    },
    cast(kit, v, u, s, k, dt) {
      v.t += dt;
      kit.muzzle(u, 0, MV); const a = u.aim, ca = Math.cos(a), sa = Math.sin(a);
      if (u.cast.t > s.dur) {   // the wind-up: light and embers drawn into the maw
        kit.glow(MV.x + ca * 0.6, MV.y, MV.z + sa * 0.6, HL_RED, 0.08, 1 + 2 * k, 0.9, kit.K.GLOW, 1.1); kit.glow(MV.x + ca * 0.6, MV.y, MV.z + sa * 0.6, HL_GOLD, 0.06, 0.6 + k, 1, kit.K.STAR, 1.1);
        if (Math.random() < 0.6) { const b = Math.random() * 6.283, d = R(2, 3); kit.str.emit(MV.x + Math.cos(b) * d, MV.y, MV.z + Math.sin(b) * d, -Math.cos(b) * 10, 0, -Math.sin(b) * 10, HL_GOLD, 0.2, 0.08, 0.05, 0, 1, 1); }
        return;
      }
      const L = hlLen.get(u.id) ?? s.range, w = (s.width || 1.2) * 1.5;
      v.g.visible = true; v.g.position.set(MV.x, 1.4, MV.z); v.g.rotation.y = -a;
      const wob = 1 + 0.06 * Math.sin(v.t * 37);
      v.outer.scale.set(L, w * 1.15 * wob, w * 1.15 * wob); v.inner.scale.set(L, w * 0.5, w * 0.5);
      for (const m of [v.outer, v.inner]) { m.material.uniforms.uT.value = v.t; m.material.uniforms.uL.value = L; m.material.uniforms.uA.value = Math.min(1, u.cast.t * 4, (s.dur - u.cast.t) * 8 + 1); }
      const ex = MV.x + ca * L, ez = MV.z + sa * L;
      v.rocks.forEach((r, i) => {
        r.visible = true;
        if (i < 3) { const ph = (v.t * 1.6 + i / 3) % 1, b = i * 2.1 + v.t; r.position.set(ex + Math.cos(b) * 1.4, 0.3 + Math.sin(ph * Math.PI) * 1.8, ez + Math.sin(b) * 1.4); r.scale.setScalar(0.8 * Math.sin(ph * Math.PI) + 0.25); }
        else { const f = ((v.t * 0.9 + (i - 3) / 4) % 1), d = L * (0.15 + 0.8 * f), sd = (i % 2 ? 1 : -1) * w * 0.9; r.position.set(MV.x + ca * d - sa * sd, 1.4 + 0.4 * Math.sin(f * 9 + i), MV.z + sa * d + ca * sd); r.scale.setScalar(0.55); }
        r.rotation.set(v.t * 3 + i, v.t * 2, 0);
      });
      kit.glow(ex, 1, ez, HL_RED, 0.1, 3.4, 0.8, kit.K.GLOW, 1.1); kit.glow(MV.x + ca, 1.4, MV.z + sa, HL_GOLD, 0.06, 1.6, 1, kit.K.STAR, 1);
      if (Math.random() < 0.7) { const t = R(0.15, 0.95), sd = Math.random() < 0.5 ? 1 : -1; kit.puffs(MV.x + ca * L * t - sa * sd * w, 1.6, MV.z + sa * L * t + ca * sd * w, 1, C(0.09, 0.05, 0.04), 0.2, 1.2, 0.7, 0.9, 2.4, 1.2, 0.55, kit.K.SMOKE, 1.5); }
    },
    castDrop(kit, v) { v.h.on = false; },
    beam(kit, e, u) { const L = Math.hypot(e.x1 - e.x0, e.z1 - e.z0); hlLen.set(u.id, L); kit.scorch(e.x1, e.z1, 1.6, 3, 1.3, HL_RED); kit.sparks(e.x1, 0.6, e.z1, kit.N(4), HL_GOLD, 6, 0.4, 0.06, 1, 10); return true; },
  },
};

// ---- Khỉ Pháo: gold, violet accent --------------------------------------------------------------------------------------
const KP_GOLD = C(2.6, 1.75, 0.3), KP_VIO = C(1.3, 0.35, 2.5), KP_DEEP = 0x2c0f4a;
// a grinning bomb: a violet ball, a gold band, a gold grin, a fuse spark
const bombBall = keep(new THREE.SphereGeometry(0.6, 18, 12)), bombBand = keep(new THREE.TorusGeometry(0.6, 0.07, 6, 28).rotateX(Math.PI / 2)), fuseGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 5).rotateZ(0.5).translate(-0.12, 0.72, 0));
const grinGeo = (() => { const s = new THREE.Shape(); s.absarc(0, 0, 0.36, Math.PI * 1.1, Math.PI * 1.9, false); s.absarc(0, 0.12, 0.3, Math.PI * 1.85, Math.PI * 1.15, true); return keep(new THREE.ShapeGeometry(s, 12)); })();
function bomb() {
  const g = new THREE.Group(), ball = new THREE.Mesh(bombBall, new THREE.MeshBasicMaterial({ color: KP_DEEP, toneMapped: false, transparent: true })), halo = new THREE.Mesh(bombBall, basic(KP_VIO, true, 0.45)), band = new THREE.Mesh(bombBand, basic(KP_GOLD, true, 0.95)), fuse = new THREE.Mesh(fuseGeo, basic(0x8a6a40, false, 1)), grin = new THREE.Mesh(grinGeo, basic(KP_GOLD, true, 1));
  halo.scale.setScalar(1.3); grin.position.set(0, 0.25, 0.5); grin.rotation.x = -0.9;
  for (const sd of [-1, 1]) { const eye = new THREE.Mesh(lampGeo, basic(KP_GOLD, true, 1)); eye.scale.set(0.8, 1.2, 0.5); eye.position.set(sd * 0.2, 0.42, 0.38); g.add(eye); }
  g.add(halo, ball, band, fuse, grin); g.traverse((m) => { m.renderOrder = 8; }); return g;
}
// a firecracker bundle (the mine Chuồn Lẹ leaves): three violet tubes, a gold tie, a fuse
const tubeSm = keep(new THREE.CylinderGeometry(0.17, 0.17, 0.85, 10)), tieGeo = keep(new THREE.TorusGeometry(0.36, 0.05, 5, 20).rotateX(Math.PI / 2));
function crackers() { const g = new THREE.Group(), m = basic(0x6a20b0, false, 1), cap = basic(KP_GOLD, true, 0.9); for (let i = 0; i < 3; i++) { const a = i * 2.094, t = new THREE.Mesh(tubeSm, m); t.position.set(Math.cos(a) * 0.2, 0.45, Math.sin(a) * 0.2); g.add(t); } const tie = new THREE.Mesh(tieGeo, cap); tie.position.y = 0.45; g.add(tie); return g; }
const khiphao = {
  // Bom Cười: a grinning violet bomb arcs to the cursor, fuse fizzing, a gold ring under it; it goes off in a gold star with
  // violet smoke and confetti
  kpBomb: {
    zones: ['strike'], ownDisc: true, pal: [KP_GOLD, KP_VIO], hitR: 2,
    skill() { return true; },
    zoneMake(kit, z) {
      const o = kit.match && kit.match.units[z.owner], x0 = o ? o.x : z.x, z0 = o ? o.z : z.z, b = bomb(); b.scale.setScalar(1.6);
      const ring = softRing(kit, z.x, z.z, z.r, KP_GOLD, { c2: C(2.6, 2.3, 1.4), w: 0.06, fill: 0.18, life: 1e9, r0: 0.3, grow: 0.2 });
      return { b, ring, x0, z0, h: held(kit, [b]) };
    },
    zone(kit, v, z) {
      const k = 1 - z.delay / (z.total || 1), x = v.x0 + (z.x - v.x0) * k, zz = v.z0 + (z.z - v.z0) * k, y = 1.2 + Math.sin(k * Math.PI) * 5;
      v.b.position.set(x, y, zz); v.b.rotation.set(0, k * 6, Math.sin(k * 20) * 0.2);
      kit.glow(x - 0.3, y + 1.3, zz, KP_GOLD, 0.08, 0.7, 1, kit.K.STAR, 1.2);
    },
    zoneDrop(kit, v) { v.h.on = false; stop(v.ring); },
    land(kit, e) {
      sigil(kit, e.x, e.z, 3.2, KP_GOLD, { c2: KP_GOLD, n: 8, m: 3, ticks: 0, inner: 0, fill: 0.1, w: 0.12, life: 0.45, rev: 0.04, spin: 2, y: 0.5 });
      shell(kit, e.x, 1, e.z, 2, KP_GOLD, { c2: WHITE, inv: 1.3, core: 1, life: 0.25, grow: 0.05 });
      kit.puffs(e.x, 1, e.z, kit.N(6), C(0.35, 0.12, 0.55), 0.9, 2.5, 0.9, 1.4, 2.4, 0.6, 0.7, kit.K.SMOKE, 2);
      for (let i = 0; i < kit.N(16); i++) { const a = Math.random() * 6.283, s = R(3, 7); kit.ovr.emit(e.x, 1.2, e.z, Math.cos(a) * s, R(3, 7), Math.sin(a) * s, i % 2 ? KP_GOLD : KP_VIO, R(0.8, 1.2), R(0.14, 0.22), 1, 1.4, 6, 1, kit.K.CHIP); }
      kit.flash(e.x, 1.6, e.z, KP_GOLD, 45, 0.25); kit.kick(e.x, e.z, 0.4);
      return true;
    },
  },
  // Chuồn Lẹ: he rides off on a golden somersault cloud (puffs curling behind him); a violet firecracker bundle sits where he
  // started until it is stepped on
  kpCloud: {
    skill(kit, e, u) {
      const x0 = u.x, z0 = u.z; let acc = 0, mine = null;
      kit.anims.push({ t: 0, step(dt) {
        this.t += dt; acc += dt;
        const go = this.t < 0.5 && u.alive && (this.t < 0.06 || u.dash);
        if (go && acc > 0.025) {
          acc = 0; const s = R(0.8, 1.2), b = Math.random() * 6.283;
          // a curl of cloud: a gold puff with a cream top and two smaller lobes
          shell(kit, u.x, 0.8, u.z, 1.5 * s, C(0.95, 0.6, 0.1), { c2: C(1, 0.93, 0.7), inv: 1.6, core: 1.2, squash: 0.6, life: 0.8, grow: 0.12, alpha: 0.8 });
          for (const [dx, dz] of [[Math.cos(b), Math.sin(b)], [-Math.cos(b), -Math.sin(b)]]) kit.puffs(u.x + dx * 1.2, 0.7, u.z + dz * 1.2, 1, C(1, 0.82, 0.4), 0.3, 1, 0.9, 2.4 * s, 1.6, 0.3, 0.8, kit.K.SMOKE, 2);
        }
        if (!mine && kit.match) {
          const z = kit.match.zones.find((q) => q.kind === 'mine' && q.owner === u.id && Math.hypot(q.x - x0, q.z - z0) < 2);
          if (z) {
            mine = z; const c = crackers(); c.scale.setScalar(1.6); c.position.set(z.x, 0, z.z);
            const s = sigil(kit, z.x, z.z, 1.7, KP_VIO, { c2: KP_GOLD, n: 0, ticks: 8, inner: 0.6, fill: 0.15, w: 0.08, life: 1e9, rev: 0.2, spin: 1 });
            own(kit, [c], 1e9, () => { const live = !!kit.match && kit.match.zones.includes(mine); if (!live) stop(s); else if (Math.random() < 0.3) kit.glow(z.x - 0.2, 1.7, z.z, KP_GOLD, 0.1, 0.5, 1, kit.K.STAR, 1.2); return live; });
          }
        }
        return go || this.t < 0.7 || (!mine && this.t < 1);
      }, drop() {} });
      return true;
    },
  },
  // Hội Pháo Hoa: firework shells streak down onto the area and burst into gold chrysanthemums with violet tips, glitter
  // falling from them
  kpFireworks: {
    zones: ['strike'], ownDisc: true, pal: [KP_GOLD, KP_VIO], hitR: 1.6,
    skill() { return true; },
    zoneMake(kit, z) {
      const s = sigil(kit, z.x, z.z, z.r * 0.7, KP_VIO, { n: 0, ticks: 0, inner: 0, fill: 0.05, w: 0.04, life: 1e9, rev: 0.1, spin: 0, alpha: 0.3 });
      const v = { s, y: 14 };
      trail(kit, () => (v.y > 0.8 ? [z.x + v.y * 0.15, v.y, z.z] : null), 0.18, KP_GOLD, 2.5, { c2: KP_VIO, len: 10, up: true, fade: 0.1 });
      return v;
    },
    zone(kit, v, z) { const k = z.delay / (z.total || 1); v.y = 0.8 + 13 * k * k; if (Math.random() < 0.5) kit.glow(z.x + v.y * 0.15, v.y, z.z, KP_GOLD, 0.15, 0.5, 1, kit.K.STAR, 1.1, 0, 1, 0); },
    zoneDrop(kit, v) { v.y = 0; stop(v.s); },
    land(kit, e) {
      const x = e.x, z = e.z, y = 3, n = 18, petals = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + R(-0.1, 0.1), core = ribbonMesh(8, KP_GOLD, true, 1), tip = ribbonMesh(8, KP_VIO, true, 0.9); petals.push([core, tip, a, R(3, 3.9)]); }
      own(kit, petals.flatMap((p) => [p[0], p[1]]), 0.9, (t) => {
        const k = 1 - (1 - Math.min(1, t / 0.18)) ** 3, f = Math.min(1, (0.9 - t) / 0.5);
        for (const [core, tip, a, L] of petals) {
          const pts = []; for (let j = 0; j < 8; j++) { const q = j / 7, d = L * k * q; pts.push([x + Math.cos(a) * d, y - 1.2 * t * q * q - 0.3 * q, z + Math.sin(a) * d]); }
          fillRibbon(core, pts, (q) => 0.09 + 0.07 * q); fillRibbon(tip, pts, (q) => 0.06 + 0.3 * q * q);
          core.material.opacity = f; tip.material.opacity = 0.9 * f;
        }
      });
      kit.glow(x, y, z, WHITE, 0.15, 1.6, 1, kit.K.STAR, 1.3);
      for (let i = 0; i < kit.N(10); i++) { const a = Math.random() * 6.283, d = R(0.5, 2.8); kit.glow(x + Math.cos(a) * d, y, z + Math.sin(a) * d, i % 2 ? KP_GOLD : KP_VIO, R(0.6, 1), 0.3, 1, kit.K.SPARK, 1, 0, -R(1, 2.5), 0); }
      kit.ring(x, z, 2.2, KP_GOLD, 0.3, 0.6); kit.flash(x, y, z, KP_GOLD, 35, 0.2);
      return true;
    },
  },
};

// ---- Khỉ Đột: jade green, lime lightning ---------------------------------------------------------------------------------
const KD_GREEN = C(0.25, 1.6, 0.35), KD_LIME = C(2.0, 2.6, 0.35), KD_DARK = C(0.03, 0.18, 0.05), KD_DEEP = C(0.08, 0.55, 0.14);
const KG_EDGE = C(0.12, 0.72, 0.18), KG_CORE = C(0.92, 1, 0.6);
// a giant clenched fist, knuckles along +x, smooth rounded parts (palm, four knuckles, curled fingers, thumb, wrist)
const FIST = (() => {
  const s = (x, y, z, sx, sy, sz) => keep(new THREE.SphereGeometry(1, 16, 12).scale(sx, sy, sz).translate(x, y, z));
  const parts = [s(0, 0, 0, 0.85, 0.72, 1.0), s(-0.85, -0.05, 0, 0.55, 0.5, 0.62)];
  for (let i = 0; i < 4; i++) { const zz = -0.6 + i * 0.4; parts.push(s(0.72, 0.18, zz, 0.3, 0.3, 0.21), s(0.6, -0.3, zz, 0.36, 0.28, 0.2)); }
  parts.push(s(0.35, -0.25, 0.78, 0.48, 0.24, 0.24));
  return parts;
})();
function fist() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x2e6a28, roughness: 0.6, metalness: 0.05, emissive: 0x05200a, transparent: true, opacity: 1 }), h = basic(KD_GREEN, true, 0.35);
  for (const p of FIST) g.add(new THREE.Mesh(p, m));
  const halo = new THREE.Mesh(sphGeo, h); halo.scale.set(1.3, 1.05, 1.3); h.opacity = 0.18; g.add(halo);
  g.traverse((q) => { q.renderOrder = 8; }); return g;
}
// a crater: a dark scorched hollow with a broken earth rim and green light seeping from it
function crater(kit, x, z, r, life) {
  softRing(kit, x, z, r, C(0.1, 0.07, 0.04), { c2: C(0.32, 0.24, 0.15), w: 0.12, fill: 0.9, life, r0: 0.75, grow: 0.06, alpha: 0.85 });
  softRing(kit, x, z, r * 0.55, KD_DEEP, { w: 0.2, life: life * 0.6, r0: 0.6, grow: 0.06, alpha: 0.6 });
  kit.chips(x, 0.4, z, kit.N(14), C(0.32, 0.25, 0.16), 8, 0.9, 0.24);
  kit.puffs(x, 0.4, z, kit.N(6), C(0.32, 0.28, 0.2), r * 0.3, 3, 0.8, 1.3, 2.4, 0.5, 0.55, kit.K.DUST, 3);
}
const khidot = {
  // Đấm Đất: a giant green fist rises over him while he winds up, then slams down knuckles first into a crater
  kdPound: {
    pal: [KD_GREEN, KD_LIME], hitR: 2,
    skill() { return true; },
    castMake(kit, u) { const f = fist(); return { f, h: held(kit, [f]) }; },
    cast(kit, v, u, s, k) { const a = u.aim; v.f.position.set(u.x + Math.cos(a) * 1.6, 2.4 + 3 * k, u.z + Math.sin(a) * 1.6); v.f.rotation.set(0, -a, 0.6 + 0.6 * k); v.f.scale.setScalar(2.2); },
    castDrop(kit, v) { v.h.on = false; },
    nova(kit, e, u) {
      const r = e.r || 5, a = u ? u.aim : 0, x = e.x + Math.cos(a) * 1.6, z = e.z + Math.sin(a) * 1.6, f = fist();
      own(kit, [f], 0.6, (t) => { const k = Math.min(1, t / 0.06); f.position.set(x, 5.4 - 4.2 * k, z); f.rotation.set(0, -a, -1.1); f.scale.setScalar(2.4); fadeAll(f, Math.min(1, (0.6 - t) / 0.25)); });
      crater(kit, x, z, 2.6, 1.1);
      softRing(kit, e.x, e.z, r * 1.05, KD_DEEP, { c2: KD_GREEN, w: 0.05, life: 0.5, r0: 0.3, grow: 0.3, alpha: 0.8 });
      kit.flash(x, 2, z, KD_GREEN, 55, 0.3); kit.kick(x, z, 0.8);
      return true;
    },
  },
  // Nhảy Vồ: a green arc is drawn over to the cursor where a crater mark waits; he lands fists first and the earth caves in
  kdLeap: {
    pal: [KD_GREEN, KD_LIME], hitR: 2,
    skill() { return true; },
    leap(kit, e, u, row) {
      const dur = e.dur || 0.55, r = row.radius || 3.5, x0 = e.x0, z0 = e.z0, n = 24;
      const arc = ribbonMesh(n, KD_DEEP, false, 0.85), glow = ribbonMesh(n, KD_LIME, true, 0.9);
      const pts = (f) => { const p = []; for (let i = 0; i < n; i++) { const q = (i / (n - 1)) * f; p.push([x0 + (e.x - x0) * q, 0.8 + Math.sin(q * Math.PI) * 5, z0 + (e.z - z0) * q]); } return p; };
      own(kit, [arc, glow], dur + 0.5, (t) => { const f = Math.min(1, t / 0.12), p = pts(f); fillRibbon(arc, p, (q) => 0.35 * Math.sin(q * Math.PI) + 0.08); fillRibbon(glow, p, 0.06); const o = Math.min(1, (dur + 0.5 - t) / 0.3); arc.material.opacity = 0.85 * o; glow.material.opacity = 0.9 * o; });
      softRing(kit, e.x, e.z, r, C(0.1, 0.07, 0.04), { c2: KD_DEEP, w: 0.08, fill: 0.35, life: dur + 0.1, r0: 0.92, grow: 0, alpha: 0.85 });
      for (const sd of [-1, 1]) { const f = fist(); own(kit, [f], dur, (t) => { if (!u.alive) return false; const a = e.a ?? Math.atan2(e.z - z0, e.x - x0), h = 1.2 + Math.sin(Math.min(1, t / dur) * Math.PI) * 3.5; f.position.set(u.x - Math.sin(a) * sd * 1.6, h, u.z + Math.cos(a) * sd * 1.6); f.rotation.set(0, -a, -0.9); f.scale.setScalar(1.3); }); }
      kit.anims.push({ t: 0, step(dt) { this.t += dt; if (this.t < dur) return true;
        const x = u.alive ? u.x : e.x, z = u.alive ? u.z : e.z;
        crater(kit, x, z, r * 0.9, 1.1); kit.flash(x, 2, z, KD_GREEN, 50, 0.3); kit.kick(x, z, 0.7);
        return false; }, drop() {} });
      return true;
    },
  },
  // Thịnh Nộ: he swells into the rage form: a crest of green flame stands up behind him like a mane and two giant fists hang
  // at his sides, pumping, for the whole rage
  kdRage: {
    pal: [KD_GREEN, KD_LIME], hitR: 1.8,
    skill(kit, e, u, row) {
      const dur = row.dur || 7, t0 = kit.time, live = () => u.alive && (kit.time - t0 < 0.5 || u.tfT > 0);
      const mane = []; for (let i = 0; i < 9; i++) { const f = flame(KG_EDGE, KG_CORE, i * 1.9); f.userData.b = (i - 4) * 0.3; f.userData.h = 5.2 - Math.abs(i - 4) * 0.4; mane.push(f); }
      const fists = [fist(), fist()];
      own(kit, [...mane, ...fists], dur + 0.3, (t) => {
        if (!live()) return false;
        const k = Math.min(1, t / 0.3), a = u.aim, back = a + Math.PI;
        mane.forEach((f, i) => { const b = back + f.userData.b; f.position.set(u.x + Math.cos(b) * 2.0, 0.5, u.z + Math.sin(b) * 2.0); f.scale.set(2.3 * k, f.userData.h * k * (0.85 + 0.15 * Math.sin(t * 10 + i)), 1); f.material.uniforms.uT.value = t; f.material.uniforms.uA.value = 1; });
        fists.forEach((f, i) => { const sd = i ? 1 : -1, pump = Math.max(0, Math.sin(t * 6 + i * Math.PI)) * 0.6; f.position.set(u.x + Math.cos(a) * pump - Math.sin(a) * sd * 3.1, 1.6, u.z + Math.sin(a) * pump + Math.cos(a) * sd * 3.1); f.rotation.set(0, -a, 0); f.scale.setScalar(2.1 * k); });
      });
      crater(kit, u.x, u.z, 3, 1.2); kit.flash(u.x, 2, u.z, KD_GREEN, 60, 0.35); kit.kick(u.x, u.z, 0.4);
      return true;
    },
    transform(kit, e) { if (!e.on) kit.puffs(e.x, 1, e.z, kit.N(5), C(0.2, 0.4, 0.2), 0.8, 2, 0.8, 1.1, 2, 0.6, 0.5, kit.K.SMOKE, 2); return true; },
  },
};

// ---- Đom Đóm: warm firefly light, mint accent ----------------------------------------------------------------------------
const DD_AMBER = C(2.6, 2.05, 0.5), DD_MINT = C(0.5, 2.4, 1.5), DD_LIT = C(2.2, 2.6, 0.6);
// a leaf-shaped wing lying flat along +x from the root
const leafGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.45, 0.32, 1, 0.06); s.quadraticCurveTo(1.05, 0, 1, -0.04); s.quadraticCurveTo(0.45, -0.2, 0, 0); return keep(new THREE.ShapeGeometry(s, 12).rotateX(-Math.PI / 2)); })();
const antGeo = keep(new THREE.CylinderGeometry(0.015, 0.02, 0.6, 4).rotateX(Math.PI / 2).translate(0, 0, -0.3));
// a firefly seen from above, head at -z: dark head and wing covers, a red-orange shield behind the head, pale beating hind
// wings and a glowing yellow-green tail lantern with a soft halo
function firefly() {
  const g = new THREE.Group(), dark = basic(0x221c14, false, 1), sh = (sx, sy, sz, x, y, z, m) => { const q = new THREE.Mesh(sphGeo, m); q.scale.set(sx, sy, sz); q.position.set(x, y, z); g.add(q); return q; };
  sh(0.3, 0.3, 0.36, 0, 0.05, 0.55, basic(C(0.6, 0.8, 0.1), true, 0.22));                      // lantern halo
  sh(0.2, 0.17, 0.3, 0, 0.06, 0.5, basic(0xf4ff86, false, 1));                                  // lantern
  sh(0.12, 0.1, 0.12, 0, 0.08, -0.42, dark);                                                     // head
  sh(0.17, 0.08, 0.13, 0, 0.1, -0.27, basic(0xd8542a, false, 1));                              // shield
  const hind = [-1, 1].map((sd) => { const w = new THREE.Mesh(leafGeo, basic(0xcff3ea, false, 0.5)); w.position.set(sd * 0.05, 0.12, -0.15); w.scale.set(sd * 0.95, 1, 0.9); g.add(w); return w; });
  for (const sd of [-1, 1]) { const e = new THREE.Mesh(leafGeo, dark); e.position.set(sd * 0.04, 0.16, -0.18); e.rotation.y = -sd * 1.15; e.scale.set(sd * 0.72, 1, 0.9); g.add(e); }
  for (const sd of [-1, 1]) { const a = new THREE.Mesh(antGeo, dark); a.position.set(sd * 0.05, 0.1, -0.5); a.rotation.y = sd * 0.35; g.add(a); }
  g.userData.wings = hind; g.traverse((m) => { m.renderOrder = 8; }); return g;
}
// a point light carried by a firefly: a bright star in a soft glow
const mote = (kit, x, y, z, c, s = 1, halo = 0.4) => { kit.glow(x, y, z, c, 0.05, 0.42 * s, 1, kit.K.STAR, 1); if (halo) kit.glow(x, y, z, DD_AMBER, 0.05, 1.0 * s, halo, kit.K.GLOW, 1); };
const domdom = {
  // Ong Thợ: a firefly drone circles over her, hind wings beating, its tail lantern glowing, a mint thread to the ally it heals
  ddDrone: {
    zones: ['drone'],
    skill() { return true; },
    zoneMake(kit) { const f = firefly(); return { f, h: held(kit, [f]), link: null, t: 0 }; },
    zone(kit, v, z, dt) {
      v.t += dt; const o = kit.match && kit.match.units[z.owner], ang = z.age * 2.2, k = Math.min(1, z.age * 4) * Math.min(1, (z.dur - z.age) * 3);
      const px = (o ? o.x : z.x) + Math.cos(ang) * 1.5, pz = (o ? o.z : z.z) + Math.sin(ang) * 1.5, py = 2.8 + Math.sin(v.t * 3) * 0.15;
      v.f.position.set(px, py, pz); v.f.rotation.y = -ang - Math.PI; v.f.scale.setScalar(5.2 * k);
      v.f.userData.wings.forEach((w, i) => { const sd = i ? 1 : -1; w.rotation.y = -sd * (0.45 + 0.4 * Math.sin(v.t * 38)); });
      if (Math.random() < dt * 12) kit.glow(px + R(-0.4, 0.4), py - 0.2, pz + R(-0.4, 0.4), DD_LIT, 0.9, 0.2, 1, kit.K.STAR, 0.5, 0, -0.8, 0);
      const tg = z.target >= 0 && kit.match ? kit.match.units[z.target] : null;
      if (tg && tg.alive) { if (!v.link) v.link = kit.beam(px, pz, tg.x, tg.z, 0.7, DD_MINT, 1e9, 2, 1.8); kit.aimBeam(v.link, px, pz, tg.x, tg.z, 1.8); }
      else if (v.link) { kit.endBeam(v.link); v.link = null; }
    },
    zoneDrop(kit, v) { v.h.on = false; if (v.link) kit.endBeam(v.link); },
  },
  // Tiếp Sức: three ribbons of fireflies stream from her to the ally, winding, and wind into a ring of lights round it
  ddBless: {
    skill() { return true; },
    bless(kit, e, u, row) {
      const o = kit.match && kit.match.units[e.to]; if (!o) return true;
      const dur = row.dur || 4, x0 = u.x, z0 = u.z, fly = 0.4;
      const head = (j) => (t) => {
        if (!o.alive || t > dur) return null;
        const f = Math.min(1, t / fly), a = j * 2.094 + t * 3, rr = 2.3, ox = o.x + Math.cos(a) * rr, oz = o.z + Math.sin(a) * rr;
        const sw = Math.sin(f * Math.PI) * 1.6 * (j - 1), q = 1 - f, dx = ox - x0, dz = oz - z0, L = Math.hypot(dx, dz) || 1;
        return [x0 + dx * f - dz / L * sw, 1.3 + 0.4 * Math.sin(t * 4 + j) + Math.sin(f * Math.PI) * 1.2 * q, z0 + dz * f + dx / L * sw];
      };
      for (let j = 0; j < 3; j++) { const h = head(j); trail(kit, h, 0.8, DD_AMBER, dur, { c2: DD_MINT, len: 22, fade: 0.4, add: true }); kit.follow(o, dur, (t) => { const p = h(t); if (p) mote(kit, p[0], p[1], p[2], DD_LIT, 1.8); }); }
      kit.follow(o, dur, (t) => { if (t < fly) return; for (let i = 0; i < 12; i++) { const a = i * 0.5236 - t * 1.5; mote(kit, o.x + Math.cos(a) * 2.3, 0.5 + 0.15 * Math.sin(t * 5 + i), o.z + Math.sin(a) * 2.3, i % 3 ? DD_LIT : DD_MINT, 2); } });
      kit.flash(o.x, 2, o.z, DD_AMBER, 30, 0.25);
      return true;
    },
  },
  // Vòng Sáng: fireflies pour out in a great ring of lights to the edge, a second ring of mint lights turns inside it, and
  // bright streaks of fireflies race round between them
  ddRally: {
    skill() { return true; },
    rally(kit, e, u) {
      const r = e.r || 8, x = e.x, z = e.z, life = 1.5;
      kit.follow(u, life, (t) => {
        const k = 1 - (1 - Math.min(1, t / 0.35)) ** 2, f = Math.min(1, (life - t) / 0.5);
        for (let i = 0; i < 44; i++) { const a = i * 0.1428 + t * 0.4, rw = r * k * (0.86 + 0.14 * Math.sin(a * 6 - t * 3)); mote(kit, x + Math.cos(a) * rw, 0.4 + 0.2 * Math.sin(t * 6 + i), z + Math.sin(a) * rw, DD_LIT, 1.5 * f, 0.3); if (i % 2 === 0) kit.str.emit(x + Math.cos(a) * rw, 0.4, z + Math.sin(a) * rw, 0, R(5, 8), 0, DD_LIT, 0.3, 0.1, 0.06, 0, 1, 1); }
        for (let i = 0; i < 24; i++) { const a = i * 0.2618 - t * 0.9; mote(kit, x + Math.cos(a) * r * 0.58 * k, 0.6, z + Math.sin(a) * r * 0.58 * k, DD_MINT, 1.2 * f, 0.3); }
      });
      for (let j = 0; j < 6; j++) trail(kit, (t) => { if (t > life - 0.3) return null; const a = j * 1.0472 + t * 3.5, rr = r * 0.95 * Math.min(1, t / 0.7); return [x + Math.cos(a) * rr, 0.8, z + Math.sin(a) * rr]; }, 0.6, C(1, 0.72, 0.12), life, { c2: C(0.2, 0.75, 0.5), len: 20 });
      if (kit.match) for (const o of kit.match.units) if (o.alive && o.team === u.team && Math.hypot(o.x - x, o.z - z) <= r) for (let i = 0; i < kit.N(8); i++) kit.glow(o.x + R(-0.8, 0.8), R(0.3, 1), o.z + R(-0.8, 0.8), DD_LIT, R(0.8, 1.2), 0.35, 1, kit.K.STAR, 1, 0, R(1.5, 3), 0);
      kit.flash(x, 3, z, DD_AMBER, 40, 0.4);
      return true;
    },
  },
};

export const B8 = { ...trau, ...tho, ...hoalong, ...khiphao, ...khidot, ...domdom };
