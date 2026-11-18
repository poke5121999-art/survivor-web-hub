// Looks, batch 8: Hỏa Long, Khỉ Pháo, Khỉ Đột, Đom Đóm. Render only (see looks.js for the hooks).
// One main colour and one accent per tank, one strong shape per skill; bursts are only brief flashes where blows land.
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP-b8.md):
//   燎 p4 (Hỏa Long): a red dragon; clusters of dark molten rock with glowing seams, a red flame swirl. Ours: lava rocks, a wall
//     of dragon scales, one thick lava stream (not the flame jets, rings, fox fire or fire wheel of the other fire tanks).
//   悟空 p25 (Khỉ Pháo): gold and orange, a spinning gold band, a staff from the sky. Ours keeps gold with the tank's violet:
//     a grinning bomb, a golden somersault cloud, firework blooms.
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

// a small round lamp (Khỉ Pháo's bomb eyes)
const lampGeo = keep(new THREE.SphereGeometry(0.14, 8, 6));

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

export const B8 = { ...khiphao };   // Khỉ Đột moved to looks-k1.js (Hulk kit remake), Đom Đóm to looks-k13.js (kit lane K13), Hỏa Long to looks-k15.js (kit lane k15), Thợ Rèn and Trâu Sắt are Iron Man and Optimus Prime in looks-k11.js (kit lane K11)
