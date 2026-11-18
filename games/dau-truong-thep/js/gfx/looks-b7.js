// Looks, batch 7: the Vietnamese legends. Lạc Long Quân, Sơn Tinh, Thủy Tinh, An Dương Vương, Kim Quy, Hồ Ly. Render only
// (see looks.js for the hooks). One main colour and one accent per tank, one strong shape per skill:
//   Lạc Long Quân  azure water dragon, gold horns           (clip 68.敖广 p71: blue water shell, water jet, blue dragon, water sphere)
//   Sơn Tinh       moss-green mountain rock, amber cracks    (clip 11.山精 p14: boulder with a gold rim, rock golem, rock-dust cloud)
//   Thủy Tinh      teal waves, white foam                    (clip 67.海妖 p70: blue spiral whirlpool, standing water walls, splashes)
//   (An Dương Vương moved to looks-k9.js with the kit ported from clip p6)
//   Kim Quy        the golden turtle shell, jade light       (no clip: designed from the desc, a carapace of hexagon scutes)
//   Hồ Ly          white fox masks, rose-pink mist           (no clip: 16.小狸猫 p19 is green rings and a blue ray; designed from the desc)
// Mapping notes: ~/handoff/dtt-ref/bili/MAP-b7.md.
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, sigil, shell, trail, burst } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);
const keep = (g) => { g.userData.keep = true; return g; };
const basic = (c, add, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
function fadeAll(g, k) { g.traverse((m) => { if (m.material) { if (m.userData.op === undefined) m.userData.op = m.material.opacity; m.material.opacity = m.userData.op * k; } }); }
const flat = (pts, mirror = true) => {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  if (mirror) for (const p of pts.slice(0, -1).reverse()) s.lineTo(p[0], -p[1]);
  return s;
};
const lay = (s, seg) => keep(new THREE.ShapeGeometry(s, seg).rotateX(-Math.PI / 2));   // a shape lying on the floor, +x forward
const stand = (s, seg) => keep(new THREE.ShapeGeometry(s, seg));                        // upright, facing the camera side

// A strip through n points, laid across the path (see looks-b5.js)
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
function jag(a, b, segs, jit) {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, sx = -dz / L, sz = dx / L, pts = [];
  for (let i = 0; i <= segs; i++) { const f = i / segs, j = i && i < segs ? jit * (Math.random() * 2 - 1) : 0; pts.push([a[0] + dx * f + sx * j, a[1], a[2] + dz * f + sz * j]); }
  return pts;
}

// soft flat discs drawn by a shader (uv on a 2x2 plane laid on the floor)
const DISC_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const discGeo = keep(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
function disc(kit, frag, x, z, r, uni, life, y = 0.13) {
  const mat = new THREE.ShaderMaterial({ vertexShader: DISC_VERT, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    blending: THREE.NormalBlending, premultipliedAlpha: true, uniforms: { uT: { value: 0 }, uA: { value: 0 }, ...uni } });
  const m = new THREE.Mesh(discGeo, mat); m.position.set(x, y, z); m.scale.setScalar(r); m.renderOrder = 4;
  return m;
}
const n3 = (c) => c.clone().multiplyScalar(1 / Math.max(c.r, c.g, c.b));

// ===== Lạc Long Quân: the azure water dragon of the sea, gold horns =====================================================
const LL_BLUE = C(0.35, 1.05, 2.6), LL_DEEP = C(0.03, 0.14, 0.5), LL_FOAM = C(2.1, 2.45, 2.6), LL_GOLD = C(2.6, 1.85, 0.5), LL_SKIN = 0x1652b0;
const llHeadGeo = lay(flat([[1.3, 0], [1.12, 0.2], [0.78, 0.27], [0.55, 0.2], [0.3, 0.4], [0.05, 0.44], [-0.12, 0.74], [-0.28, 0.46], [-0.48, 0.84], [-0.62, 0.44], [-0.86, 0.66], [-0.98, 0.26], [-1.05, 0]]), 1);
const llHornGeo = lay(flat([[0.1, 0.24], [-0.25, 0.42], [-0.6, 0.66], [-0.85, 0.74], [-0.62, 0.55], [-0.28, 0.3], [0.05, 0.14]], false), 1);
const llHornGeo2 = keep(llHornGeo.clone().scale(1, 1, -1));
const llEyeGeo = keep(new THREE.SphereGeometry(0.1, 8, 6));
function dragonHead() {
  const g = new THREE.Group();
  const halo = new THREE.Mesh(llHeadGeo, basic(LL_BLUE, true, 0.55)); halo.scale.setScalar(1.25); halo.position.y = -0.03;
  const skin = new THREE.Mesh(llHeadGeo, basic(LL_SKIN, false, 0.96));
  const lit = new THREE.Mesh(llHeadGeo, basic(C(0.4, 1.2, 2.2), true, 0.45)); lit.scale.set(0.62, 1, 0.5); lit.position.set(0.35, 0.02, 0);
  g.add(halo, skin, lit);
  for (const hg of [llHornGeo, llHornGeo2]) { const h = new THREE.Mesh(hg, basic(0xf2c24a, false, 1)); h.position.y = 0.04; const hh = new THREE.Mesh(hg, basic(LL_GOLD, true, 0.5)); hh.scale.setScalar(1.15); g.add(hh, h); }
  for (const sd of [-1, 1]) { const e = new THREE.Mesh(llEyeGeo, basic(LL_FOAM, true, 1)); e.position.set(0.32, 0.12, sd * 0.24); g.add(e); }
  g.traverse((m) => { m.frustumCulled = false; if (m.isMesh) m.renderOrder = 9; });
  return g;
}
// the dragon's body: a soft azure ribbon (trail) with a pale belly line, wiggling across the path
// the dragon's body from the tail p0 to the neck p1: a solid azure ribbon swaying across the path, thick behind the head, with
// a pale belly line; ends(t) -> [p0, p1] or null (then it fades out over 0.3 s)
function dragonBody(kit, ends, w, life, amp) {
  const n = 28, body = ribbonMesh(n, LL_SKIN, false, 0.95), belly = ribbonMesh(n, LL_BLUE, true, 0.85), fin = ribbonMesh(n, LL_FOAM, true, 0.7);
  let last = null, dead = -1;
  own(kit, [body, belly, fin], life, (t) => {
    const e = dead < 0 ? ends(t) : null; if (e) last = e; else if (dead < 0) dead = t;
    if (!last) return false;
    const [p0, p1] = last, dx = p1[0] - p0[0], dz = p1[2] - p0[2], L = Math.hypot(dx, dz) || 1, sx = -dz / L, sz = dx / L, pts = [];
    for (let i = 0; i < n; i++) { const f = i / (n - 1), w2 = Math.sin(f * L * 0.55 - t * 14) * amp * Math.sin(Math.min(1, f * 1.2) * Math.PI); pts.push([p0[0] + dx * f + sx * w2, p0[1] + (p1[1] - p0[1]) * f, p0[2] + dz * f + sz * w2]); }
    fillRibbon(body, pts, (f) => w * (0.18 + 0.82 * Math.pow(f, 0.6)));
    fillRibbon(belly, pts.map((p) => [p[0], p[1] + 0.04, p[2]]), (f) => w * 0.3 * Math.pow(f, 0.7));
    fillRibbon(fin, pts.map((p) => [p[0], p[1] + 0.06, p[2]]), (f) => w * (0.06 + 0.12 * ((f * 14) % 1)) * f);
    const k = dead < 0 ? 1 : Math.max(0, 1 - (t - dead) / 0.3); body.material.opacity = 0.95 * k; belly.material.opacity = 0.85 * k; fin.material.opacity = 0.7 * k;
    return k > 0;
  });
}
const RIPPLE_FRAG = `uniform vec3 uC, uF; uniform float uT, uA; varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
    float w = pow(0.5 + 0.5 * sin(r * 26.0 - uT * 5.0), 5.0) * smoothstep(0.12, 0.45, r);
    float rim = smoothstep(0.86, 0.96, r) * (1.0 - smoothstep(0.96, 1.0, r));
    float a = (0.16 + 0.1 * r + w * 0.45 + rim * 0.85) * uA;
    vec3 c = mix(uC, uF, clamp(w * 0.55 + rim * 0.6, 0.0, 1.0));
    gl_FragColor = vec4(c * a, a);
  }`;
const laclong = {
  // Vòi Rồng: a water dragon's head leads a column of sea water down the lane, a foam line down its back
  llJet: {
    pal: [LL_BLUE, LL_FOAM], hitR: 2,
    skill(kit, e, u) { const x = u.x + Math.cos(e.a) * 1.4, z = u.z + Math.sin(e.a) * 1.4; kit.glow(x, 1.3, z, LL_BLUE, 0.2, 2.6, 0.9, kit.K.GLOW, 1.2); kit.sparks(x, 1.3, z, kit.N(10), LL_FOAM, 7, 0.35, 0.06, 0.5, 6, Math.cos(e.a), Math.sin(e.a), 0.7); return true; },
    shotMake(kit, s) {
      const a = Math.atan2(s.dz, s.dx), h = dragonHead(); h.scale.setScalar(2.4);
      const v = { h, hold: held(kit, [h]), a, x: s.x, z: s.z, x0: s.x, z0: s.z, t: 0, live: true };
      dragonBody(kit, () => (v.live ? [[v.x0 + (v.x - v.x0) * 0.08, 1.1, v.z0 + (v.z - v.z0) * 0.08], [v.x, 1.25, v.z]] : null), 1.35, 1.6, 0.6);
      return v;
    },
    shot(kit, v, s, x, y, z, dt) {
      v.t += dt; v.x = x; v.z = z; v.h.position.set(x + Math.cos(v.a) * 0.6, 1.35, z + Math.sin(v.a) * 0.6); v.h.rotation.y = -v.a + Math.cos(v.t * 16) * 0.12;
      if (Math.random() < 0.6) kit.glow(x + R(-0.8, 0.8), R(0.6, 1.8), z + R(-0.8, 0.8), LL_FOAM, 0.35, R(0.2, 0.4), 1, kit.K.SPARK, 0.4, 0, R(1, 3), 0);
      return true;
    },
    shotEnd(kit, v, s, x, z) {
      v.live = false; v.hold.on = false;
      shell(kit, x, 1.1, z, 1.6, LL_BLUE, { c2: LL_FOAM, inv: 1.4, core: 0.8, life: 0.4, grow: 0.06 });
      kit.sparks(x, 1.1, z, kit.N(14), LL_FOAM, 8, 0.45, 0.07, 0.8, 10); kit.ring(x, z, 2.2, LL_BLUE, 0.35);
    },
  },
  // Xoáy Nước: sea rings ripple out from the spot; the dragon circles its rim, chasing its own tail
  llWhirl: {
    skill() { return true; },
    zoneMake(kit, z) {
      const d = disc(kit, RIPPLE_FRAG, z.x, z.z, z.r, { uC: { value: n3(LL_BLUE) }, uF: { value: n3(LL_FOAM) } });
      const body = ribbonMesh(30, LL_SKIN, false, 0.94), belly = ribbonMesh(30, LL_BLUE, true, 0.8), h = dragonHead(); h.scale.setScalar(1.5);
      const hold = held(kit, [d, body, belly, h]);
      return { d, body, belly, h, hold, a: (z.id || 0) * 1.7 };
    },
    zone(kit, v, z, dt) {
      const k = Math.min(1, z.age / 0.3), end = Math.min(1, (z.dur - z.age) * 2.5), u = v.d.material.uniforms, rr = z.r * 0.82;
      u.uT.value = z.age; u.uA.value = k * end; v.d.position.set(z.x, 0.13, z.z);
      v.a += dt * 2.2;
      const pts = [], n = 30, span = 4.6 * (0.4 + 0.6 * k);
      for (let i = 0; i < n; i++) { const f = i / (n - 1), b = v.a - span * f, r2 = rr + Math.sin(f * 18 - z.age * 6) * 0.25; pts.push([z.x + Math.cos(b) * r2, 0.9 + 0.3 * Math.sin(f * 9 + z.age * 4), z.z + Math.sin(b) * r2]); }
      fillRibbon(v.body, pts, (f) => 0.15 + 0.6 * Math.sin(Math.min(1, f * 1.15 + 0.15) * Math.PI) * (1 - 0.4 * f));
      fillRibbon(v.belly, pts.map((p) => [p[0], p[1] + 0.04, p[2]]), (f) => 0.05 + 0.16 * Math.sin(Math.min(1, f + 0.1) * Math.PI));
      v.h.position.set(z.x + Math.cos(v.a + 0.12) * rr, 1.1, z.z + Math.sin(v.a + 0.12) * rr); v.h.rotation.y = -(v.a + Math.PI / 2 + 0.25);
      fadeAll(v.h, end); v.body.material.opacity = 0.94 * end; v.belly.material.opacity = 0.8 * end;
      if (Math.random() < dt * 18) { const b = Math.random() * 6.283, r2 = z.r * R(0.3, 0.95); kit.glow(z.x + Math.cos(b) * r2, 0.4, z.z + Math.sin(b) * r2, LL_FOAM, 0.5, R(0.3, 0.55), 0.8, kit.K.SPARK, 0.6, -Math.sin(b) * 2, R(0.5, 1.5), Math.cos(b) * 2); }
    },
    zoneDrop(kit, v) { v.hold.on = false; },
  },
  // Long Quân Giá Lâm: he becomes the dragon: a great azure body coils along his charge, horned head in front; where he stops
  // the dragon crashes into a churning sphere of sea water
  llDragon: {
    pal: [LL_BLUE, LL_FOAM], hitR: 2.2,
    skill(kit, e, u) {
      const a = e.a, ca = Math.cos(a), sa = Math.sin(a), h = dragonHead(); let done = false, t0 = -1;
      const on = (t) => u.alive && t < 0.8 && (t < 0.06 || u.dash) && !done;
      const x0 = u.x - ca * 1.5, z0 = u.z - sa * 1.5;
      dragonBody(kit, (t) => (on(t) ? [[x0, 1.1, z0], [u.x + ca * 0.4, 1.4, u.z + sa * 0.4]] : null), 2.3, 1.4, 1.1);
      own(kit, [h], 1.3, (t) => {
        if (!u.alive) return false;
        if (!done && t > 0.06 && !u.dash) {
          done = true; t0 = t; const x = u.x + ca * 1.5, z = u.z + sa * 1.5;
          shell(kit, x, 1.4, z, 3.4, LL_BLUE, { c2: LL_FOAM, p: 1.3, core: 0.22, bands: 1.6, life: 0.7, grow: 0.12 });
          kit.sparks(x, 1.5, z, kit.N(22), LL_FOAM, 11, 0.6, 0.08, 1.2, 12); kit.ring(x, z, 3.6, LL_BLUE, 0.45); kit.flash(x, 2, z, LL_BLUE, 60, 0.3); kit.kick(x, z, 0.8);
        }
        h.position.set(u.x + ca * 1.6, 1.6, u.z + sa * 1.6); h.rotation.y = -a + Math.cos(t * 13) * 0.15; h.scale.setScalar(2.9);
        if (done) fadeAll(h, Math.max(0, 1 - (t - t0) / 0.3));
        if (!done && Math.random() < 0.7) kit.glow(u.x + R(-1.2, 1.2), R(0.4, 2.2), u.z + R(-1.2, 1.2), LL_FOAM, 0.4, R(0.25, 0.5), 1, kit.K.SPARK, 0.5, -ca * 4, R(1, 3), -sa * 4);
        return !done || t - t0 < 0.3;
      });
      kit.flash(u.x, 1.6, u.z, LL_BLUE, 40, 0.25);
      return true;
    },
  },
};

// ===== Sơn Tinh: the mountain spirit, moss-green rock, amber cracks ========================================================
const ST_MOSS = C(0.75, 2.2, 0.3), ST_AMB = C(2.6, 1.55, 0.3), ST_DUST = C(0.5, 0.42, 0.3);
const hash = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
const ROCK = [C(0.15, 0.1, 0.06), C(0.1, 0.07, 0.045), C(0.2, 0.14, 0.09)], MOSS = [C(0.06, 0.17, 0.03), C(0.1, 0.24, 0.04)];
// a faceted boulder (cone: a mountain peak with its base on the floor): jittered vertices, moss on the faces that look up
function rockGeo(seed, cone) {
  const g0 = cone ? new THREE.ConeGeometry(1, 2, 9, 4).translate(0, 1, 0) : new THREE.IcosahedronGeometry(1, 1), g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = hash(Math.round(x * 50) + seed, Math.round(y * 50), Math.round(z * 50));
    if (cone) { if (y > 1.95) continue; const k = y < 0.01 ? 1 + (h - 0.5) * 0.3 : 1 + (h - 0.5) * 0.55; p.setXYZ(i, x * k, y > 0.01 ? y + (h - 0.5) * 0.25 : 0, z * k); }
    else { const k = 1 + (h - 0.5) * 0.5; p.setXYZ(i, x * k, y * k * 0.8, z * k); }
  }
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3), n = g.attributes.normal;
  for (let i = 0; i < p.count; i += 3) {
    const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, h = hash(i + seed, cy, 7);
    const c = (cone ? cy > 0.9 && ny > 0.25 : ny > 0.45) ? MOSS[h > 0.5 ? 1 : 0] : ROCK[Math.floor(h * 3)];
    for (let j = 0; j < 3; j++) col.set([c.r, c.g, c.b], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g !== g0) g0.dispose();
  return keep(g);
}
const ROCKS = [1, 2, 3, 4].map((s) => rockGeo(s * 17, false)), PEAKS = [1, 2, 3].map((s) => rockGeo(s * 31, true));
const rockMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0, emissive: 0x050302, transparent: true, opacity: 1 });
function rock(i, peak) { const m = new THREE.Mesh((peak ? PEAKS : ROCKS)[i % (peak ? 3 : 4)], rockMat()); m.castShadow = true; return m; }
function mountain(seed) {
  const g = new THREE.Group(), main = rock(seed, true); main.scale.set(1.5, 1.6, 1.5); g.add(main);
  const s1 = rock(seed + 1, true); s1.scale.set(0.95, 0.95, 0.95); s1.position.set(1.15, 0, 0.5);
  const s2 = rock(seed + 2, true); s2.scale.set(0.8, 0.75, 0.8); s2.position.set(-0.9, 0, 0.85); g.add(s1, s2);
  return g;
}
// rocks thrown out of a blow, tumbling and falling
function rubble(kit, x, z, n, r, life, sz = 1) {
  for (let i = 0; i < n; i++) {
    const m = rock(i, false), b = Math.random() * 6.283, sp = R(4, 9), vy = R(4, 8), s = R(0.25, 0.55) * sz, d0 = r * 0.3, rx = R(-8, 8), rz = R(-8, 8);
    m.scale.setScalar(s);
    own(kit, [m], life, (t) => { const d = d0 + sp * t; m.position.set(x + Math.cos(b) * d, Math.max(s * 0.6, 0.5 + vy * t - 14 * t * t), z + Math.sin(b) * d); m.rotation.set(rx * t, 0, rz * t); m.material.opacity = Math.min(1, (life - t) / 0.2); });
  }
}
// dark fissures with an amber glow inside, running out from (x, z)
function cracks(kit, x, z, n, r, life) {
  for (let i = 0; i < n; i++) {
    const b = (i / n) * 6.283 + R(-0.25, 0.25), L = r * R(0.75, 1.05), pts = jag([x, 0.12, z], [x + Math.cos(b) * L, 0.12, z + Math.sin(b) * L], 7, L * 0.08);
    const dark = ribbonMesh(pts.length, 0x1a1108, false, 0.85), hot = ribbonMesh(pts.length, ST_AMB, true, 1);
    fillRibbon(dark, pts, (f) => 0.24 * (1 - f * 0.85)); fillRibbon(hot, pts.map((p) => [p[0], 0.13, p[2]]), (f) => 0.15 * (1 - f * 0.85));
    own(kit, [dark, hot], life, (t) => { const k = Math.min(1, (life - t) / 0.35); dark.material.opacity = 0.85 * k; hot.material.opacity = k * (0.6 + 0.4 * Math.sin(t * 20 + i)); });
  }
}
const sontinh = {
  // Vách Đá: a row of mossy boulders heaves up out of the floor in a burst of dust, an amber fault line under them
  stWall: {
    zones: ['wall'],
    skill() { return true; },
    zoneMake(kit, z) {
      const g = new THREE.Group(), list = [];
      z.pts.forEach((p, i) => {
        const m = rock(i + (z.id || 0), false), s = z.r * R(1.55, 1.8); m.position.set(p[0], 0, p[1]); m.rotation.y = R(0, 6.283); m.userData.s = [s, s * R(1.7, 2.1), s]; g.add(m); list.push(m);
        list.push(sigil(kit, p[0], p[1], s * 1.7, C(0.07, 0.05, 0.03), { c2: ST_MOSS, n: 0, ticks: 0, inner: 0, fill: 1.1, w: 0, life: 1e9, rev: 0.1, alpha: 0.8, y: 0.11 }));
        list.push(sigil(kit, p[0], p[1], s * 1.8, ST_MOSS, { n: 0, ticks: 0, inner: 0, fill: 0.05, w: 0.05, life: 1e9, rev: 0.15, alpha: 0.9 }));
        kit.puffs(p[0], 0.5, p[1], kit.N(3), ST_DUST, 0.7, 2.6, 0.8, 1.3, 2.4, 0.6, 0.6, kit.K.DUST, 3);
      });
      const p0 = z.pts[0], p1 = z.pts[z.pts.length - 1], pts = jag([p0[0], 0.12, p0[1]], [p1[0], 0.12, p1[1]], z.pts.length * 3, 0.3);
      const dark = ribbonMesh(pts.length, 0x1a1108, false, 0.8), hot = ribbonMesh(pts.length, ST_AMB, true, 0.9);
      fillRibbon(dark, pts, 0.45); fillRibbon(hot, pts.map((q) => [q[0], 0.13, q[2]]), 0.12);
      const hold = held(kit, [g, dark, hot]);
      kit.chips(z.x, 0.5, z.z, kit.N(10), ST_DUST, 6, 0.8, 0.16);
      return { g, list, dark, hot, hold, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt; const k = Math.min(1, v.t / 0.22), up = 1 - (1 - k) ** 3, end = Math.min(1, (z.dur - v.t) / 0.35);
      for (const m of v.list) { if (!m.userData.s) { m.material.uniforms.uA.value *= end; continue; } const s = m.userData.s; m.scale.set(s[0], s[1] * up, s[2]); m.position.y = -0.2 * (1 - end) * s[1]; if (end < 1) m.material.opacity = Math.max(0, end); }
      v.hot.material.opacity = 0.9 * Math.min(1, v.t / 0.1) * end * (0.65 + 0.35 * Math.sin(v.t * 6)); v.dark.material.opacity = 0.8 * end;
      if (Math.random() < dt * 4) { const p = z.pts[Math.floor(Math.random() * z.pts.length)]; kit.glow(p[0], 0.3, p[1], ST_MOSS, 0.6, 0.5, 0.7, kit.K.GLOW, 1, 0, R(1, 2), 0); }
    },
    zoneDrop(kit, v) { v.hold.on = false; v.list.forEach((m) => { if (!m.userData.s) stop(m); }); },
  },
  // Chấn Địa: he stamps, the floor splits in amber fissures and a ring of rock teeth bursts up round him in a moss-green shock
  stQuake: {
    pal: [ST_AMB, ST_MOSS], hitR: 1.8,
    skill(kit, e, u, row) {
      const w = row.windup || 0.35;
      kit.follow(u, w, () => { if (Math.random() < 0.5) { const b = Math.random() * 6.283, d = R(1, 2.5); kit.chips(u.x + Math.cos(b) * d, 0.2, u.z + Math.sin(b) * d, 1, ST_DUST, 2, 0.6, 0.12); } kit.glow(u.x, 0.4, u.z, ST_AMB, 0.08, 1.8, 0.5, kit.K.GLOW, 1.1); });
      return true;
    },
    nova(kit, e) {
      const x = e.x, z = e.z, r = e.r || 5.5;
      cracks(kit, x, z, 9, r, 1.0);
      for (let i = 0; i < 13; i++) {
        const b = (i / 13) * 6.283 + R(-0.15, 0.15), d = r * R(0.55, 0.85), m = rock(i, false), hh = R(1.1, 1.8);
        m.position.set(x + Math.cos(b) * d, 0, z + Math.sin(b) * d); m.rotation.set(Math.sin(b) * 0.35, R(0, 6), -Math.cos(b) * 0.35);
        own(kit, [m], 1.0, (t) => { const k = t < 0.12 ? t / 0.12 : t > 0.7 ? Math.max(0.02, (1 - t) / 0.3) : 1; m.scale.set(0.55, hh * k, 0.55); });
      }
      sigil(kit, x, z, r, ST_MOSS, { n: 0, ticks: 0, inner: 0.9, fill: 0.1, w: 0.07, life: 0.6, rev: 0.06, spin: 0, grow: 9, alpha: 0.9 });
      for (let i = 0; i < kit.N(12); i++) { const b = Math.random() * 6.283, d = r * R(0.6, 1); kit.puffs(x + Math.cos(b) * d, 0.4, z + Math.sin(b) * d, 1, ST_DUST, 0.8, 3, 0.8, 1.2, 2.4, 0.6, 0.6, kit.K.DUST, 3); }
      kit.flash(x, 1.5, z, ST_AMB, 45, 0.3); kit.kick(x, z, 0.8);
      return true;
    },
  },
  // Dời Non: whole mountain peaks drop out of the sky along the line, each slamming down in dust, flying rock and fissures,
  // standing a moment before they sink back into the earth
  stMount: {
    zones: ['strike'], ownDisc: true, pal: [ST_AMB, ST_MOSS], hitR: 1.8,
    skill() { return true; },
    zoneMake(kit, z) {
      const m = mountain(z.id || 0); m.rotation.y = R(0, 6.283);
      const sh = sigil(kit, z.x, z.z, z.r, C(0.05, 0.04, 0.02), { n: 0, ticks: 0, inner: 0, fill: 1, life: 1e9, rev: 0.15, alpha: 0.5, w: 0, y: 0.11 });
      const rim = sigil(kit, z.x, z.z, z.r, ST_MOSS, { n: 0, ticks: 6, inner: 0, fill: 0.04, life: 1e9, rev: 0.15, w: 0.06, spin: 0.8, alpha: 0.85 });
      return { m, hold: held(kit, [m]), sh, rim };
    },
    zone(kit, v, z) { const k = z.delay / (z.total || 1); v.m.position.set(z.x, 13 * k * k, z.z); v.m.scale.setScalar(z.r * 0.5 * (0.7 + 0.3 * (1 - k))); },
    zoneDrop(kit, v) { v.hold.on = false; stop(v.sh); stop(v.rim); },
    land(kit, e) {
      const m = mountain(Math.floor(e.x * 7 + e.z * 3)), s = 1.4; m.rotation.y = R(0, 6.283); m.position.set(e.x, 0, e.z);
      own(kit, [m], 1.1, (t) => { m.scale.set(s * (1 + 0.15 * Math.max(0, 1 - t / 0.1)), s * (t < 0.1 ? 0.8 + 2 * t : 1), s * (1 + 0.15 * Math.max(0, 1 - t / 0.1))); m.position.y = t > 0.7 ? -(t - 0.7) * 7 : 0; });
      cracks(kit, e.x, e.z, 6, 3.2, 0.9); rubble(kit, e.x, e.z, 8, 2.4, 0.9);
      for (let i = 0; i < kit.N(7); i++) { const b = Math.random() * 6.283; kit.puffs(e.x + Math.cos(b) * 2, 0.6, e.z + Math.sin(b) * 2, 1, ST_DUST, 1, 3.4, 0.85, 1.5, 2.6, 0.6, 0.6, kit.K.DUST, 3); }
      kit.ring(e.x, e.z, 3.2, ST_MOSS, 0.35); kit.flash(e.x, 2, e.z, ST_AMB, 50, 0.3); kit.kick(e.x, e.z, 0.7);
      return true;
    },
  },
};

// ===== Thủy Tinh: the water god, teal waves crested with white foam ======================================================
const TT_TEAL = C(0.25, 2.3, 2.0), TT_FOAM = C(2.3, 2.6, 2.5), TT_DEEP = C(0.02, 0.22, 0.3);
const lanceGeo = keep(new THREE.LatheGeometry([0, 0.12, 0.2, 0.22, 0.17, 0.08, 0].map((r, i) => new THREE.Vector2(r, -1.7 + i * 0.57)), 10).rotateZ(-Math.PI / 2));
const ringGeo = keep(new THREE.TorusGeometry(0.7, 0.07, 6, 28).rotateY(Math.PI / 2));
const VORTEX_FRAG = `uniform vec3 uC, uD, uF; uniform float uT, uA; varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
    float an = atan(p.y, p.x), s = an * 4.0 + log(r + 0.03) * 2.4 + uT * 6.0;
    float arm = pow(0.5 + 0.5 * sin(s), 2.5), deep = smoothstep(0.05, 0.4, r);
    float rim = smoothstep(0.85, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r)), edge = 1.0 - smoothstep(0.9, 1.0, r);
    vec3 c = mix(uD, uC, arm * deep); c = mix(c, uF, pow(arm, 5.0) * 0.7 * deep + rim * 0.55);
    float a = ((1.0 - deep) * 0.95 + deep * (0.45 + 0.5 * arm) * edge + rim) * uA;
    gl_FragColor = vec4(c * a, a);
  }`;
// the standing wave: a wall of water whose top curls forward (local +x), uv.y up its face
const WAVE_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const WAVE_FRAG = `uniform vec3 uC, uD, uF; uniform float uT, uA; varying vec2 vUv;
  void main() {
    float h = vUv.y, s = abs(vUv.x - 0.5) * 2.0;
    float side = 1.0 - smoothstep(0.7, 1.0, s);
    float streak = 0.5 + 0.5 * sin(vUv.x * 70.0 + h * 9.0 - uT * 7.0);
    float foam = smoothstep(0.66, 0.8, h) + 0.3 * streak * smoothstep(0.3, 0.7, h);
    vec3 c = mix(uD, uC, smoothstep(0.0, 0.55, h)); c = mix(c, uF, clamp(foam, 0.0, 1.0));
    float a = (0.86 + 0.12 * h) * smoothstep(0.0, 0.14, h) * side * uA;
    gl_FragColor = vec4(c * a, a);
  }`;
function waveMesh(W, H) {
  const g = new THREE.PlaneGeometry(1, 1, 30, 10), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), h = uv.getY(i), e = 1 - Math.pow(Math.abs(u - 0.5) * 2, 3) * 0.6;
    let x, y;
    if (h < 0.75) { const q = h / 0.75; x = -5.0 * (1 - q); y = H * e * Math.pow(q, 1.7); }
    else { const q = (h - 0.75) / 0.25 * Math.PI * 0.6; x = 1.3 * Math.sin(q); y = H * e - 1.1 * (1 - Math.cos(q)); }
    p.setXYZ(i, x, y, (u - 0.5) * W);
  }
  const mat = new THREE.ShaderMaterial({ vertexShader: WAVE_VERT, fragmentShader: WAVE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    blending: THREE.NormalBlending, premultipliedAlpha: true, uniforms: { uT: { value: 0 }, uA: { value: 1 }, uC: { value: C(0.0, 0.66, 0.62) }, uD: { value: C(0.0, 0.26, 0.4) }, uF: { value: C(0.92, 1, 1) } } });
  const m = new THREE.Mesh(g, mat); m.renderOrder = 7; return m;
}
const thuytinh = {
  // Thủy Tiễn: a slender spear of water flies out, white at the tip, leaving splash rings standing in the air behind it
  ttLance: {
    pal: [TT_TEAL, TT_FOAM], hitR: 1.8,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.4, 1.3, u.z + Math.sin(e.a) * 1.4, TT_TEAL, 0.15, 2, 0.9, kit.K.GLOW, 1.2); return true; },
    shotMake(kit, s) {
      const g = new THREE.Group(), halo = new THREE.Mesh(lanceGeo, basic(TT_TEAL, true, 0.6)), core = new THREE.Mesh(lanceGeo, basic(0x8af0e0, false, 0.95)), tip = new THREE.Mesh(lanceGeo, basic(TT_FOAM, true, 0.9));
      halo.scale.set(1.15, 1.9, 1.9); tip.scale.set(0.4, 0.7, 0.7); tip.position.x = 0.9; g.add(halo, core, tip); g.scale.setScalar(2.1);
      const v = { g, hold: held(kit, [g]), a: Math.atan2(s.dz, s.dx), acc: 9, x: s.x, z: s.z, live: true };
      trail(kit, () => (v.live ? [v.x, 1.25, v.z] : null), 0.75, TT_TEAL, 0.5, { c2: TT_DEEP, len: 12 });
      return v;
    },
    shot(kit, v, s, x, y, z, dt) {
      v.x = x; v.z = z; v.g.position.set(x, 1.3, z); v.g.rotation.y = -v.a; v.acc += dt;
      if (v.acc > 0.05) {
        v.acc = 0; const r = new THREE.Mesh(ringGeo, basic(TT_FOAM, true, 0.9)), r2 = new THREE.Mesh(ringGeo, basic(TT_TEAL, true, 0.8)), px = x - Math.cos(v.a) * 1.6, pz = z - Math.sin(v.a) * 1.6, a = v.a;
        own(kit, [r, r2], 0.35, (t) => { const k = 1.1 + t * 5; for (const m of [r, r2]) { m.position.set(px, 1.3, pz); m.rotation.y = -a; } r.scale.setScalar(k); r2.scale.setScalar(k * 1.18); const f = 1 - t / 0.35; r.material.opacity = 0.9 * f; r2.material.opacity = 0.7 * f; });
      }
      return true;
    },
    shotEnd(kit, v, s, x, z) {
      v.live = false; v.hold.on = false;
      for (let i = 0; i < kit.N(14); i++) { const b = Math.random() * 6.283, sp = R(2, 5); kit.glow(x, 1.2, z, i % 2 ? TT_FOAM : TT_TEAL, R(0.4, 0.7), R(0.25, 0.4), 1, kit.K.SPARK, 0.6, Math.cos(b) * sp, R(2, 5), Math.sin(b) * sp); }
      kit.ring(x, z, 1.8, TT_TEAL, 0.3);
    },
  },
  // Xoáy Ngầm: a teal whirlpool opens: spiral arms of water wind into a dark eye, foam spun inward along them
  ttVortex: {
    skill() { return true; },
    zoneMake(kit, z) {
      const d = disc(kit, VORTEX_FRAG, z.x, z.z, z.r, { uC: { value: C(0.0, 0.62, 0.58) }, uD: { value: C(0.0, 0.08, 0.14) }, uF: { value: C(0.92, 1, 1) } });
      return { d, hold: held(kit, [d]) };
    },
    zone(kit, v, z, dt) {
      const k = Math.min(1, z.age / 0.25), end = Math.min(1, (z.dur - z.age) * 2.5), u = v.d.material.uniforms;
      u.uT.value = z.age; u.uA.value = k * end; v.d.scale.setScalar(z.r * (0.6 + 0.4 * k)); v.d.position.set(z.x, 0.13, z.z);
      for (let i = 0; i < 2; i++) if (Math.random() < dt * 14) { const b = Math.random() * 6.283, d = z.r * R(0.6, 0.95); kit.str.emit(z.x + Math.cos(b) * d, 0.3, z.z + Math.sin(b) * d, (-Math.cos(b) * 0.6 + Math.sin(b)) * 6, 0, (-Math.sin(b) * 0.6 - Math.cos(b)) * 6, TT_FOAM, 0.35, 0.08, 0.05, 0, 1, 1); }
      if (Math.random() < dt * 3) kit.ring(z.x, z.z, z.r, TT_TEAL, 0.5, 0.6);
    },
    zoneDrop(kit, v) { v.hold.on = false; },
  },
  // Hồng Thủy: a wall of teal water rises the width of the flood and rolls down the field, its crest breaking in white foam
  ttFlood: {
    pal: [TT_TEAL, TT_FOAM], hitR: 2.2,
    skill(kit, e, u) { kit.flash(u.x, 1.6, u.z, TT_TEAL, 40, 0.3); return true; },
    shotMake(kit, s) {
      const W = Math.max(4, (s.r || 3) * 2.8), m = waveMesh(W, 3.1), a = Math.atan2(s.dz, s.dx);
      const v = { m, W, a, x: s.x, z: s.z, t: 0, live: true, dead: -1 };
      own(kit, [m], 1e9, (t, dt) => {
        v.t = t; m.material.uniforms.uT.value = t;
        const grow = Math.min(1, t / 0.1); m.scale.set(1, 0.3 + 0.7 * grow, 1);
        if (!v.live) { if (v.dead < 0) v.dead = t; const f = 1 - (t - v.dead) / 0.35; m.material.uniforms.uA.value = Math.max(0, f); m.scale.y = Math.max(0.05, f); return f > 0; }
      });
      trail(kit, () => (v.live ? [v.x - Math.cos(a) * 0.6, 0.15, v.z - Math.sin(a) * 0.6] : null), W * 0.42, TT_TEAL, 1.6, { c2: TT_DEEP, len: 14, taper: false, alpha: 0.55 });
      return v;
    },
    shot(kit, v, s, x, y, z) {
      v.x = x; v.z = z; v.m.position.set(x - Math.cos(v.a) * 0.8, 0, z - Math.sin(v.a) * 0.8); v.m.rotation.y = -v.a;
      const ca = Math.cos(v.a), sa = Math.sin(v.a);
      for (let i = 0; i < 2; i++) { const l = R(-0.45, 0.45) * v.W; kit.glow(x + ca * 0.7 - sa * l, R(2.4, 3.1), z + sa * 0.7 + ca * l, TT_FOAM, R(0.3, 0.5), R(0.3, 0.6), 1, kit.K.SPARK, 0.5, ca * 3, R(1, 3), sa * 3); }
      return true;
    },
    shotEnd(kit, v, s, x, z) {
      v.live = false; const ca = Math.cos(v.a), sa = Math.sin(v.a);
      for (let i = 0; i < kit.N(10); i++) { const l = R(-0.5, 0.5) * v.W; kit.puffs(x - sa * l, 1, z + ca * l, 1, C(0.75, 0.95, 0.95), 0.8, 3, 0.8, 1.2, 2.4, 0.6, 0.5, kit.K.SMOKE, 2); }
    },
  },
};

// ===== Kim Quy: the golden turtle, a carapace of hexagon scutes, jade light ================================================
const KQ_GOLD = C(2.6, 1.95, 0.45), KQ_JADE = C(0.35, 2.4, 1.2), KQ_SHELL = 0x6a4812;
const kqOval = keep(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2).scale(1.22, 1, 1)), kqRim = keep(new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2).scale(1.22, 1, 1));
const kqHex = keep(new THREE.CircleGeometry(0.27, 6).rotateX(-Math.PI / 2)), kqHexRim = keep(new THREE.RingGeometry(0.24, 0.3, 6).rotateX(-Math.PI / 2)), kqGem = keep(new THREE.CircleGeometry(0.09, 6).rotateX(-Math.PI / 2));
const SCUTES = [[-0.52, 0], [0, 0], [0.52, 0], [-0.42, 0.5], [0.08, 0.56], [0.55, 0.47], [-0.42, -0.5], [0.08, -0.56], [0.55, -0.47], [-0.9, 0.22], [-0.9, -0.22], [0.98, 0.18], [0.98, -0.18]];
function carapace() {
  const g = new THREE.Group(), halo = new THREE.Mesh(kqOval, basic(KQ_GOLD, true, 0.45)); halo.scale.setScalar(1.12); halo.position.y = -0.04;
  g.add(halo, new THREE.Mesh(kqOval, basic(KQ_SHELL, false, 0.95)), new THREE.Mesh(kqRim, basic(KQ_GOLD, true, 0.95)));
  for (const [x, z] of SCUTES) { const f = new THREE.Mesh(kqHex, basic(0x8c6418, false, 1)), r = new THREE.Mesh(kqHexRim, basic(KQ_GOLD, true, 0.95)); f.position.set(x, 0.02, z); r.position.set(x, 0.03, z); g.add(f, r); }
  const gem = new THREE.Mesh(kqGem, basic(KQ_JADE, true, 1)); gem.position.y = 0.05; gem.scale.setScalar(1.6); g.add(gem);
  g.traverse((m) => { m.frustumCulled = false; if (m.isMesh) m.renderOrder = 9; });
  return g;
}
const spikeGeo = keep(new THREE.ConeGeometry(0.12, 0.5, 5).rotateZ(-Math.PI / 2).translate(1.3, 0, 0));
const DOME_VERT = 'varying vec3 vP, vN, vV; void main() { vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const DOME_FRAG = `uniform vec3 uC, uJ; uniform float uA, uT; varying vec3 vP, vN, vV;
  void main() {
    vec2 q = vec2(atan(vP.z, vP.x) * 2.6, asin(clamp(vP.y, -1.0, 1.0)) * 5.2 - uT * 0.3);
    const vec2 s = vec2(1.0, 1.7320508); vec2 a = mod(q, s) - s * 0.5, b = mod(q - s * 0.5, s) - s * 0.5, g = dot(a, a) < dot(b, b) ? a : b;
    g = abs(g); float hx = max(dot(g, normalize(s)), g.x), line = smoothstep(0.34, 0.44, hx);
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV))), low = 1.0 - smoothstep(0.75, 1.0, vP.y);
    vec3 c = mix(uJ, uC, line);
    float al = (line * 1.0 + 0.52 + pow(f, 2.0) * 0.45) * uA * (0.6 + 0.4 * low);
    gl_FragColor = vec4(c * al, al);
  }`;
const kqDomeGeo = keep(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2));
const kimquy = {
  // Khiên Tặng: a golden turtle shell descends over the ally on a thread of gold and settles there in a faint jade shell
  kqGift: {
    pal: [KQ_GOLD, KQ_JADE],
    skill() { return true; },
    bless(kit, e, u, row) {
      const o = kit.match.units[e.to]; if (!o) return true;
      const g = carapace();
      own(kit, [g], 1.1, (t) => { if (!o.alive) return false; const k = Math.min(1, t / 0.25), e2 = 1 - (1 - k) ** 3; g.position.set(o.x, 6 - 3.8 * e2, o.z); g.rotation.y = t * 1.5; g.scale.setScalar(2.5 * (0.6 + 0.4 * e2)); fadeAll(g, Math.min(1, (1.1 - t) / 0.35)); });
      shell(kit, o.x, 0, o.z, 1.7, KQ_JADE, { c2: KQ_GOLD, dome: true, p: 2.4, core: 0.04, follow: o, life: row.dur || 4, grow: 0.25, alpha: 0.6 });
      sigil(kit, o.x, o.z, 2.2, KQ_GOLD, { c2: KQ_JADE, n: 6, m: 1, ticks: 0, inner: 0, fill: 0.08, w: 0.08, follow: o, life: 1.0, rev: 0.2, spin: 1 });
      if (u !== o) { const b = kit.beam(u.x, u.z, o.x, o.z, 0.35, KQ_GOLD, 0.35, 2, 1.4); b.fade = true; }
      kit.flash(o.x, 2.5, o.z, KQ_GOLD, 35, 0.3);
      return true;
    },
  },
  // Mai Rùa: he draws into his shell: a great carapace closes down over him, gold spikes round its rim (the reflected blows)
  kqShell: {
    pal: [KQ_GOLD, KQ_JADE],
    skill(kit, e, u, row) {
      const dur = row.dur || 3, g = carapace(), sp = new THREE.Group();
      for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(spikeGeo, basic(0xf0c050, false, 1)), a = i * 0.628; s.rotation.y = -a; s.scale.set(1, 1, 1); s.userData.a = a; sp.add(s); }
      sp.scale.set(1.22, 1, 1); g.add(sp);
      own(kit, [g], dur, (t) => {
        if (!u.alive) return false;
        const k = Math.min(1, t / 0.2), e2 = 1 - (1 - k) ** 3;
        g.position.set(u.x, 3.6 - 1.4 * e2, u.z); g.rotation.y = -u.aim; g.scale.setScalar(2.5 * (0.7 + 0.3 * e2) * (1 + 0.03 * Math.sin(t * 8)));
        fadeAll(g, Math.min(1, (dur - t) / 0.3));
      });
      sigil(kit, u.x, u.z, 2.8, KQ_JADE, { n: 0, ticks: 12, inner: 0.85, fill: 0.12, w: 0.08, follow: u, life: dur, rev: 0.2, spin: 0.8, alpha: 0.8 });
      kit.flash(u.x, 2, u.z, KQ_GOLD, 40, 0.25);
      return true;
    },
  },
  // Thành Đồng: a citadel dome of gold hexagon scutes stands over him and moves with him, jade light between the scutes; foes
  // are thrust out in gold ripples
  kqCitadel: {
    skill() { return true; },
    zoneMake(kit, z) {
      const mat = new THREE.ShaderMaterial({ vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        blending: THREE.NormalBlending, premultipliedAlpha: true, uniforms: { uC: { value: C(0.95, 0.6, 0.04) }, uJ: { value: C(0.0, 0.3, 0.18) }, uA: { value: 0 }, uT: { value: 0 } } });
      const d = new THREE.Mesh(kqDomeGeo, mat); d.renderOrder = 7;
      const s = sigil(kit, z.x, z.z, z.r, KQ_GOLD, { c2: KQ_JADE, n: 6, m: 1, ticks: 18, inner: 0.6, fill: 0.08, w: 0.07, life: 1e9, rev: 0.25, spin: 0.4 });
      return { d, s, hold: held(kit, [d]), acc: 0 };
    },
    zone(kit, v, z, dt) {
      const k = Math.min(1, z.age / 0.3), end = Math.min(1, (z.dur - z.age) * 2.5), u = v.d.material.uniforms;
      u.uA.value = k * end; u.uT.value = z.age; v.d.position.set(z.x, 0, z.z); v.d.scale.set(z.r * (0.5 + 0.5 * k), z.r * 0.62 * k, z.r * (0.5 + 0.5 * k)); v.d.rotation.y = z.age * 0.3;
      v.s.position.x = z.x; v.s.position.z = z.z;
      v.acc += dt; if (v.acc > 0.6 && end > 0.5) { v.acc = 0; kit.ring(z.x, z.z, z.r * 1.1, KQ_GOLD, 0.45, 0.7); }
    },
    zoneDrop(kit, v) { v.hold.on = false; stop(v.s); },
  },
};

// ===== Hồ Ly: the fox spirit, white fox masks, rose-pink mist, lilac fox-fire ===========================================
const HL_PINK = C(2.6, 0.75, 1.45), HL_LILAC = C(1.45, 0.9, 2.6), HL_MIST = C(1.0, 0.55, 0.8);
// left-right symmetric outline from its right half (x >= 0), for upright shapes
const flatX = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); for (const p of pts.slice(0, -1).reverse()) s.lineTo(-p[0], p[1]); return s; };
const maskGeo = stand(flatX([[0, 0.52], [0.17, 0.6], [0.47, 1.05], [0.56, 0.48], [0.64, 0.15], [0.8, -0.04], [0.5, -0.2], [0.24, -0.55], [0, -0.76]].reverse()), 1);
const earGeo = stand(flat([[0.24, 0.6], [0.44, 0.92], [0.5, 0.52]], false), 1), earGeo2 = keep(earGeo.clone().scale(-1, 1, 1));
const eyeGeo = stand(flat([[0.42, 0.2], [0.26, 0.12], [0.1, 0.02], [0.27, 0.06]], false), 1), eyeGeo2 = keep(eyeGeo.clone().scale(-1, 1, 1));
const markGeo = stand(flatX([[0, 0.45], [0.07, 0.3], [0, 0.18]]), 1), noseGeo = keep(new THREE.CircleGeometry(0.07, 10).translate(0, -0.66, 0));
function foxMask() {
  const g = new THREE.Group(), halo = new THREE.Mesh(maskGeo, basic(HL_PINK, true, 0.85)); halo.scale.setScalar(1.28); halo.position.z = -0.02;
  g.add(halo, new THREE.Mesh(maskGeo, basic(0xf8eef4, false, 0.97)));
  for (const [geo, c] of [[earGeo, 0xe0508a], [earGeo2, 0xe0508a], [eyeGeo, 0xc8205a], [eyeGeo2, 0xc8205a], [markGeo, 0xd83070], [noseGeo, 0x401028]]) { const m = new THREE.Mesh(geo, basic(c, false, 1)); m.position.z = 0.02; g.add(m); }
  g.rotation.x = -0.35;
  const p = new THREE.Group(); p.add(g);
  p.traverse((m) => { m.frustumCulled = false; if (m.isMesh) m.renderOrder = 9; });
  return p;
}
function maskPop(kit, x, z) { kit.glow(x, 2.4, z, HL_PINK, 0.25, 2.4, 0.9, kit.K.GLOW, 1.2); kit.sparks(x, 2.4, z, kit.N(12), HL_LILAC, 7, 0.4, 0.06, 0.6, 8); kit.ring(x, z, 2.4, HL_PINK, 0.35); }
function mist(kit, x, z, n, s = 1) { kit.puffs(x, 0.8, z, kit.N(n), HL_MIST, 0.9 * s, 2.4, 0.8, 1.3 * s, 2.4, 0.5, 0.55, kit.K.SMOKE, 2); }
const decoyMask = (big) => ({
  zones: ['decoy'],
  zoneMake(kit, z) {
    const m = foxMask(), s = big ? sigil(kit, z.x, z.z, 3.0, HL_PINK, { c2: HL_LILAC, n: 0, ticks: 0, inner: 0.85, fill: 0.7, w: 0.08, life: 1e9, rev: 0.2, alpha: 0.75 })
      : sigil(kit, z.x, z.z, 1.8, HL_LILAC, { n: 0, ticks: 9, inner: 0.7, fill: 0.15, w: 0.08, life: 1e9, rev: 0.2, spin: 2, alpha: 0.85 });
    return { m, s, hold: held(kit, [m]), t: 0 };
  },
  zone(kit, v, z, dt) {
    v.t += dt; const k = Math.min(1, v.t / 0.2), sc = (big ? 2.6 : 1.5) * (0.4 + 0.6 * k);
    v.m.position.set(z.x, 2.6 + 0.2 * Math.sin(v.t * 3), z.z); v.m.scale.setScalar(sc); v.s.position.x = z.x; v.s.position.z = z.z;
    if (Math.random() < dt * 12) { const b = v.t * 4 + (Math.random() < 0.5 ? 0 : Math.PI); kit.glow(z.x + Math.cos(b) * 1.2, 2.3, z.z + Math.sin(b) * 1.2, HL_LILAC, 0.5, R(0.4, 0.7), 1, kit.K.FLAME, 1.2, 0, R(0.5, 1.5), 0); }
  },
  zoneDrop(kit, v) { v.hold.on = false; stop(v.s); },
  land(kit, e) { maskPop(kit, e.x, e.z); burst(kit, e.x, e.z, 2.2, HL_PINK, HL_LILAC); return true; },
});
const holy = {
  // Phân Thân: she melts into pink mist; her double runs on under a white fox mask with fox-fire flickering round it
  hlClone: { pal: [HL_PINK, HL_LILAC], hitR: 1.6, ...decoyMask(true), skill(kit, e, u) { mist(kit, u.x, u.z, 7); return true; } },
  // Xuyên Tường: a fox's leap of pink light arcs over the wall; her mask fades where she was and flashes where she lands
  hlBlink: {
    skill() { return true; },
    warp(kit, e) {
      const n = 18, pts = []; for (let i = 0; i < n; i++) { const f = i / (n - 1); pts.push([e.x0 + (e.x - e.x0) * f, 0.6 + Math.sin(f * Math.PI) * 3.2, e.z0 + (e.z - e.z0) * f]); }
      const glow = ribbonMesh(n, HL_PINK, true, 0.85), core = ribbonMesh(n, C(2.6, 2.3, 2.5), true, 1);
      own(kit, [glow, core], 0.7, (t) => { const f = Math.min(1, (0.7 - t) / 0.4), k = Math.min(1, t / 0.12); fillRibbon(glow, pts, (q) => (q <= k ? 1.1 * Math.sin(q * Math.PI) + 0.1 : 0)); fillRibbon(core, pts, (q) => (q <= k ? 0.2 * Math.sin(q * Math.PI) : 0)); glow.material.opacity = 0.85 * f; core.material.opacity = f; });
      for (const [x, z, late] of [[e.x0, e.z0, false], [e.x, e.z, true]]) {
        const m = foxMask();
        own(kit, [m], 0.7, (t) => { const k = late ? Math.min(1, t / 0.1) : 1; m.position.set(x, 2.4, z); m.scale.setScalar(2.0 * (late ? 0.5 + 0.5 * k : 1 + t)); fadeAll(m, late ? Math.min(1, (0.7 - t) / 0.3) : Math.max(0, 1 - t / 0.5) * 0.7); });
        mist(kit, x, z, 4, 0.8);
      }
      kit.ring(e.x, e.z, 2, HL_LILAC, 0.35); kit.flash(e.x, 1.8, e.z, HL_PINK, 30, 0.2);
      return true;
    },
  },
  // Vũ Điệu Ảo Ảnh: a ring of fox masks wheels out round her and scatters; each double runs under its own small mask
  hlDance: {
    pal: [HL_PINK, HL_LILAC], hitR: 1.6, ...decoyMask(false),
    skill(kit, e, u) {
      const x = u.x, z = u.z;
      for (let i = 0; i < 5; i++) { const m = foxMask(), b = e.a + (i - 2) * 0.32, far = 2.6 + (2 - Math.abs(i - 2)) * 0.9; own(kit, [m], 1.3, (t) => { const k = Math.min(1, t / 0.4), r = 0.8 + far * (1 - (1 - k) ** 2); m.position.set(x + Math.cos(b) * r, 2.0 + 0.3 * Math.sin(t * 6 + i) + 0.6 * k, z + Math.sin(b) * r); m.scale.setScalar(2.0 - 0.12 * Math.abs(i - 2)); fadeAll(m, Math.min(1, (1.3 - t) / 0.4)); });
        trail(kit, (t) => (t < 0.45 ? [m.position.x, 1.6, m.position.z] : null), 0.55, HL_PINK, 1.2, { c2: HL_LILAC, len: 12, alpha: 0.8 });
        mist(kit, x + Math.cos(b) * 2.5, z + Math.sin(b) * 2.5, 2, 1); }
      mist(kit, x, z, 5, 1.2);
      return true;
    },
  },
};

export const B7 = { ...laclong, ...sontinh, ...thuytinh, ...kimquy, ...holy };
