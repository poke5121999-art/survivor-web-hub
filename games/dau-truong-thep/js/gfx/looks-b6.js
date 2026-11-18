// Looks, batch 6: Bọ Cạp, Lươn Điện, Nhện Thép, Băng Nha, Kiếm Thần (Ve Sầu moved to looks-k8.js). Render only (see looks.js for the hooks).
// Each look's own shape carries it; bursts are only brief flashes where blows land.
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP.md):
//   毒蝎女王 p52 (Bọ Cạp): magenta-violet sting streaks, a violet swirl round her when she spins, magenta poison bubbles on
//     the foes she hits.
//   电魂 p51 (Lươn Điện): violet-white plasma orbs crackling, a cyan electric bubble round the caster, a blue storm cloud.
//   网虫 p17 (Nhện Thép): white spider webs on a blue disc where the silk lands, a big black web under the spider, a violet
//     glow on the webbed foe.
//   冰雪女王 p81 (Băng Nha): white frost arcs flying out, a big ice-blue frost dome with snow swirling, an ice prison.
//   李白 p65 (Kiếm Thần): red flame swords falling in fire columns, white blades ringing the caster, a red flying sword.
import * as THREE from '../../vendor/three.module.min.js';
import { orbPos } from '../sim.js';
import { C, own, stop, sigil, shell, pillar, trail, burst } from './lookkit.js';
import { zap, forks, ribbonMesh, fillRibbon } from './looks-b5.js';

const R = (a, b) => a + Math.random() * (b - a);
const keep = (g) => { g.userData.keep = true; return g; };
const basic = (c, add, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
function fadeAll(g, k) { g.traverse((m) => { if (m.material) { if (m.userData.op === undefined) m.userData.op = m.material.opacity; m.material.opacity = m.userData.op * k; } }); }
function order(g, n) { g.traverse((m) => { m.frustumCulled = false; if (m.material) m.renderOrder = n + (m.material.blending === THREE.AdditiveBlending ? 0 : 1); }); return g; }
const WHITE = C(2.4, 2.4, 2.5);
const discGeo = keep(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)), annGeo = keep(new THREE.RingGeometry(0.88, 1, 56).rotateX(-Math.PI / 2));
const ballGeo = keep(new THREE.SphereGeometry(0.4, 12, 8));
const flatShape = (P) => { const s = new THREE.Shape(); s.moveTo(P[0][0], P[0][1]); for (const p of P.slice(1)) s.lineTo(p[0], p[1]); return keep(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)); };

// ---- Lươn Điện: electric eels, navy bodies with cyan light, violet plasma --------------------------------------------
const LD_CY = C(0.4, 1.6, 2.6), LD_VIO = C(1.5, 0.5, 2.6), LD_NAVY = 0x0a2238, LD_WHITE = C(2.2, 2.5, 2.6);
const eelHead = keep(new THREE.SphereGeometry(0.5, 14, 10).scale(1.5, 0.45, 0.85)), eyeGeo = keep(new THREE.SphereGeometry(0.1, 6, 4));
const taper = (f) => Math.min(1, 0.6 + f * 4) * (1 - f * 0.8);
function eel(n) {
  const glow = ribbonMesh(n, LD_CY, true, 0.7), body = ribbonMesh(n, LD_NAVY, false, 0.97), stripe = ribbonMesh(n, LD_WHITE, true, 0.95);
  body.renderOrder = 9; stripe.renderOrder = 10;
  const head = new THREE.Group(), hg = new THREE.Mesh(eelHead, basic(LD_CY, true, 0.7)), hb = new THREE.Mesh(eelHead, basic(LD_NAVY, false, 1));
  hg.scale.setScalar(1.4); head.add(hg, hb);
  for (const sd of [-1, 1]) { const ey = new THREE.Mesh(eyeGeo, basic(C(2.6, 2.4, 0.5), true, 1)); ey.position.set(0.4, 0.2, sd * 0.22); head.add(ey); }
  order(head, 9);
  return { glow, body, stripe, head, all: [glow, body, stripe, head] };
}
function setEel(E, pts, w) {
  fillRibbon(E.glow, pts, (f) => w * 1.7 * taper(f)); fillRibbon(E.body, pts, (f) => w * taper(f)); fillRibbon(E.stripe, pts, (f) => w * 0.22 * taper(f));
  const p0 = pts[0], p1 = pts[1]; E.head.position.set(p0[0], p0[1] + 0.05, p0[2]); E.head.rotation.y = -Math.atan2(p0[2] - p1[2], p0[0] - p1[0]); E.head.scale.setScalar(w * 1.4);
}
const luondien = {
  // Luồng Điện: an eel of lightning swims down the lane, its body crackling to the floor; it bursts in forks where it ends
  ldEel: {
    pal: [LD_VIO, LD_WHITE], hitR: 1.8,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.4, 1.2, u.z + Math.sin(e.a) * 1.4, LD_CY, 0.15, 2.2, 1, kit.K.STAR, 1.3); return true; },
    shotMake(kit, s) { const E = eel(20); return { E, hold: held(kit, E.all), a: Math.atan2(s.dz, s.dx), t: 0 }; },
    shot(kit, v, s, x, y, z, dt) {
      v.t += dt; const ca = Math.cos(v.a), sa = Math.sin(v.a), pts = [];
      for (let i = 0; i < 20; i++) { const f = i / 19, d = f * 7.5, w = Math.sin(f * 5 - v.t * 20) * 1.8 * Math.min(1, f * 3); pts.push([x - ca * d - sa * w, 1.1, z - sa * d + ca * w]); }
      setEel(v.E, pts, 1.25);
      if (Math.random() < dt * 14) { const p = pts[2 + Math.floor(Math.random() * 15)]; zap(kit, p, [p[0] + R(-1.6, 1.6), 0.1, p[2] + R(-1.6, 1.6)], 0.2, LD_CY, 0.09, { segs: 5, jit: 0.3 }); }
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.hold.on = false; forks(kit, x, 1.1, z, 6, 2.8, 0.3, LD_CY, 0.3, { y1: 0.2 }); kit.flash(x, 1.4, z, LD_CY, 30, 0.2); },
  },
  // Vùng Điện: two eels circle him at the rim of the field, head chasing tail, sparks jumping from their bodies to the rim
  ldCoil: {
    pal: [LD_VIO, LD_WHITE], hitR: 1.5,
    skill() { return true; },
    zoneMake(kit, z) {
      const E = [eel(24), eel(24)], disc = sigil(kit, z.x, z.z, z.r, LD_CY, { n: 0, ticks: 0, inner: 0, fill: 0, life: 1e9, rev: 0.15, alpha: 0.8, w: 0.05, y: 0.11 });
      return { E, hold: held(kit, [...E[0].all, ...E[1].all]), disc, t: 0, acc: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt; v.acc += dt; v.disc.position.x = z.x; v.disc.position.z = z.z;
      const grow = Math.min(1, v.t / 0.25), all = [];
      v.E.forEach((E, j) => {
        const pts = [], base = v.t * 3.2 + j * Math.PI;
        for (let i = 0; i < 24; i++) { const f = i / 23, ang = base - f * 2.7, rr = z.r * (0.6 + 0.4 * f) * grow + Math.sin(f * 9 - v.t * 16) * 0.6; pts.push([z.x + Math.cos(ang) * rr, 1.0, z.z + Math.sin(ang) * rr]); }
        setEel(E, pts, 0.62); all.push(pts);
      });
      if (v.acc > 0.14) {
        v.acc = 0; const p = all[Math.random() < 0.5 ? 0 : 1][3 + Math.floor(Math.random() * 18)], b = Math.atan2(p[2] - z.z, p[0] - z.x) + R(-0.4, 0.4);
        zap(kit, p, [z.x + Math.cos(b) * z.r, 0.15, z.z + Math.sin(b) * z.r], 0.28, Math.random() < 0.5 ? LD_VIO : LD_CY, 0.12, { segs: 6, jit: 0.35 });
      }
    },
    zoneDrop(kit, v) { v.hold.on = false; stop(v.disc); },
  },
  // Sấm Sét: a crackling ring marks each spot; a lightning eel dives out of the sky in an arc onto it and bursts in forks
  ldStorm: {
    zones: ['strike'], ownDisc: true, pal: [LD_VIO, LD_WHITE], hitR: 1.8,
    skill() { return true; },
    zoneMake(kit, z) {
      const s = sigil(kit, z.x, z.z, Math.max(1.8, z.r), LD_CY, { c2: LD_VIO, n: 0, ticks: 10, inner: 0.7, fill: 0.2, life: 1e9, rev: 0.1, spin: 3, w: 0.07, alpha: 0.8 });
      return { s, acc: 0 };
    },
    zone(kit, v, z, dt) {
      v.acc += dt; const r = Math.max(1.8, z.r);
      if (v.acc > 0.08) { v.acc = 0; const b = Math.random() * 6.283, c = b + R(0.6, 1.2); zap(kit, [z.x + Math.cos(b) * r, 0.2, z.z + Math.sin(b) * r], [z.x + Math.cos(c) * r, 0.2, z.z + Math.sin(c) * r], 0.2, LD_VIO, 0.08, { segs: 5, jit: 0.3 }); }
    },
    zoneDrop(kit, v) { stop(v.s); },
    land(kit, e) {
      // the eel's path: a curve from high up off to one side down onto the spot; its body trails 60% of the curve behind the head
      const E = eel(18), b = Math.random() * 6.283, P0 = [e.x + Math.cos(b) * 5, 8, e.z + Math.sin(b) * 5], P1 = [e.x + Math.cos(b) * 1.5, 7, e.z + Math.sin(b) * 1.5], P2 = [e.x, 0.4, e.z];
      const at = (f) => { const g = 1 - f; return [g * g * P0[0] + 2 * g * f * P1[0] + f * f * P2[0], g * g * P0[1] + 2 * g * f * P1[1] + f * f * P2[1], g * g * P0[2] + 2 * g * f * P1[2] + f * f * P2[2]]; };
      own(kit, E.all, 0.45, (t) => {
        const h = Math.min(1, t / 0.12), pts = []; for (let i = 0; i < 18; i++) pts.push(at(Math.max(0, h - 0.6 * i / 17)));
        setEel(E, pts, 0.8); const k = Math.min(1, (0.45 - t) / 0.2); E.glow.material.opacity = 0.7 * k; E.body.material.opacity = 0.97 * k; E.stripe.material.opacity = 0.95 * k; fadeAll(E.head, k);
      });
      forks(kit, e.x, 0.4, e.z, 6, 3.2, 0.4, LD_CY, 0.4, { y1: 0.15 });
      kit.scorch(e.x, e.z, 1.2, 3, 1.2, LD_CY); kit.kick(e.x, e.z, 0.3);
      return true;
    },
  },
};

// ---- Nhện Thép: white silk, webs on a blue disc, black steel legs, a violet glow on the prey --------------------------------
const NT_VIO = C(1.4, 0.45, 2.6), NT_SILK = C(2.4, 2.45, 2.6), NT_STEEL = 0x2a2e38;
const WEB_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const WEB_FRAG = `uniform vec3 uC, uF; uniform float uA, uN, uK, uW, uFA, uRev; varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0 || r > uRev) discard;
    float sec = 6.28318 / uN, la = mod(atan(p.y, p.x) + 6.28318, sec), m = min(la, sec - la);
    float spoke = 1.0 - smoothstep(uW * 0.5, uW, r * sin(m));
    float q = r * cos(abs(la - 0.5 * sec)) / cos(0.5 * sec) * (1.0 + 0.16 * sin(la / sec * 3.14159));
    float d = abs(fract(q * uK + 0.5) - 0.5) / uK, ring = (1.0 - smoothstep(uW * 0.5, uW, d)) * step(0.12, q);
    float rim = 1.0 - smoothstep(uW * 0.5, uW, abs(r - 0.96));
    float line = max(max(spoke, ring), rim);
    float fill = uFA * (0.4 + 0.6 * r);
    float al = clamp(line + fill * (1.0 - line), 0.0, 1.0) * uA;
    vec3 c = mix(uF, uC, line);
    gl_FragColor = vec4(c * al, al);
  }`;
const webGeo = keep(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
// a spider web lying on the floor: o.c line colour, o.fill disc colour and o.fillA its strength, o.n spokes, o.k rings,
// o.w line width, o.life, o.rev (s to spin out from the middle), o.at(t) -> [x, z] to move it, o.spin
function web(kit, x, z, r, o = {}) {
  const n1 = (c) => c.clone().multiplyScalar(1 / Math.max(1, c.r, c.g, c.b));
  const mat = new THREE.ShaderMaterial({ vertexShader: WEB_VERT, fragmentShader: WEB_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, premultipliedAlpha: true,
    uniforms: { uC: { value: n1(o.c || C(1, 1, 1)) }, uF: { value: n1(o.fill || C(0.1, 0.35, 0.9)) }, uA: { value: 1 }, uN: { value: o.n ?? 10 }, uK: { value: o.k ?? 4.5 }, uW: { value: o.w ?? 0.05 }, uFA: { value: o.fillA ?? 0.45 }, uRev: { value: 0 } } });
  const mesh = new THREE.Mesh(webGeo, mat), life = o.life ?? 1, rev = o.rev ?? 0.12, rot = Math.random() * 6.283;
  mesh.position.set(x, o.y ?? 0.13, z); mesh.scale.setScalar(r); mesh.renderOrder = 5; mesh.rotation.y = rot;
  own(kit, [mesh], life, (t) => {
    if (o.at) { const p = o.at(t); if (!p) return false; mesh.position.x = p[0]; mesh.position.z = p[1]; }
    mesh.rotation.y = rot + (o.spin || 0) * t;
    mat.uniforms.uRev.value = Math.min(1.01, t / rev); mat.uniforms.uA.value = (o.alpha ?? 1) * Math.min(1, (life - t) / Math.min(0.3, life * 0.4));
  });
  return mesh;
}
// a silk line: a white core on a violet glow, straight from A to B ([x, y, z] or fns; null ends it)
function silk(kit, A, B, w, life) {
  const glow = ribbonMesh(2, NT_VIO, true, 0.75), core = ribbonMesh(2, NT_SILK, true, 1);
  own(kit, [glow, core], life, (t) => {
    const a = typeof A === 'function' ? A(t) : A, b = typeof B === 'function' ? B(t) : B; if (!a || !b) return false;
    fillRibbon(glow, [a, b], w); fillRibbon(core, [a, b], w * 0.35);
    const k = Math.min(1, (life - t) / 0.2); glow.material.opacity = 0.75 * k; core.material.opacity = k;
  });
}
// a steel leg: the femur goes up and out, the tibia down to the floor; a violet halo round both
const femurGeo = keep(new THREE.CylinderGeometry(0.1, 0.14, 1.4, 8).rotateZ(-Math.PI / 2).translate(0.7, 0, 0)), tibiaGeo = keep(new THREE.CylinderGeometry(0.015, 0.1, 1.8, 8).rotateZ(-Math.PI / 2).translate(0.9, 0, 0));
function leg() {
  const g = new THREE.Group(), m = basic(NT_STEEL, false, 1), gl = basic(NT_VIO, true, 0.55);
  const fem = new THREE.Group(), tib = new THREE.Group();
  for (const [mm, s] of [[gl, 2.4], [m, 1]]) { const a = new THREE.Mesh(femurGeo, mm); a.scale.set(1, s, s); fem.add(a); const b = new THREE.Mesh(tibiaGeo, mm); b.scale.set(1, s, s); tib.add(b); }
  tib.position.x = 1.4; fem.add(tib); g.add(fem); g.userData.fem = fem; g.userData.tib = tib;
  return order(g, 7);
}
function setLeg(g, lift, bend) { g.userData.fem.rotation.z = lift; g.userData.tib.rotation.z = -bend; }
const nhenthep = {
  // Móc Đu: a silk line shoots out with a little web spinning at its tip; where it catches, a web splashes open on a blue disc
  ntHook: {
    pal: [NT_VIO, NT_SILK], hitR: 1.6,
    skill(kit, e, u) {
      const st = { x: null, z: null, id: -1, end: -1 };
      silk(kit, (t) => (u.alive && (st.end < 0 || t < st.end + 0.5 || u.dash) && t < 1.6 ? [u.x, 1.2, u.z] : null), () => (st.x === null ? [u.x, 1.2, u.z] : [st.x, 1.2, st.z]), 0.45, 1.7);
      web(kit, u.x, u.z, 1.3, { c: C(1, 1, 1), fill: C(0.5, 0.2, 0.9), fillA: 0.35, n: 8, k: 3, w: 0.07, life: 1.2, spin: 9, at: () => (st.end < 0 && st.x !== null ? [st.x, st.z] : st.end < 0 ? [u.x, u.z] : null) });
      kit.anims.push({ t: 0, step(dt) {
        this.t += dt; const m = kit.match; if (!m || st.end >= 0) return false;
        const s = st.id >= 0 ? m.shots.find((q) => q.id === st.id) : m.shots.find((q) => q.owner === u.id && q.vis === 'hook');
        if (s) { st.id = s.id; st.x = s.x; st.z = s.z; }
        else if (st.id >= 0 || this.t > 0.15) {
          st.end = this.t;
          if (st.x !== null) { web(kit, st.x, st.z, 2.4, { life: 1.1, n: 12, k: 4.5, w: 0.05 }); kit.flash(st.x, 1.2, st.z, NT_VIO, 25, 0.2); }
          return false;
        }
        return this.t < 1.5;
      }, drop() {} });
      return true;
    },
    hook(kit, e) { web(kit, e.x, e.z, 2.2, { fill: C(0.5, 0.15, 0.9), fillA: 0.5, life: 1, n: 12 }); return true; },
  },
  // Vòng Chém: eight black steel legs stride round him as he slides, a violet wake behind; the cut foe is wrapped in a web
  ntSlash: {
    pal: [NT_VIO, NT_SILK], hitR: 1.6,
    hit(kit, e) { web(kit, e.x, e.z, 1.9, { fill: C(0.55, 0.15, 0.95), fillA: 0.55, life: 1.3, n: 10, k: 3.5, w: 0.07 }); return true; },
    skill(kit, e, u) {
      const legs = [], A = [0.55, 1.1, 1.75, 2.4];
      for (const sd of [-1, 1]) for (const b of A) { const l = leg(); l.userData.b = sd * b; l.scale.setScalar(1.5); legs.push(l); }
      trail(kit, (t) => (t < 0.45 && u.alive && (t < 0.06 || u.dash) ? [u.x, 0.6, u.z] : null), 1.9, NT_VIO, 0.6, { c2: C(0.15, 0.05, 0.3), len: 14 });
      let end = -1;
      own(kit, legs, 0.75, (t) => {
        if (!u.alive) return false;
        if (end < 0 && ((t > 0.06 && !u.dash) || t > 0.45)) end = t;
        const stab = end < 0 ? 0 : Math.min(1, (t - end) / 0.1);
        legs.forEach((l, i) => { const b = (e.a || 0) + l.userData.b; l.position.set(u.x, 1.0, u.z); l.rotation.y = -b; setLeg(l, 0.75 + 0.25 * Math.sin(t * 28 + i * 1.7) - 0.5 * stab, 1.75 + 0.5 * stab); fadeAll(l, Math.min(1, (0.75 - t) / 0.25)); });
      });
      return true;
    },
  },
  // Đu Dây Liên Hoàn: a black web spreads under him; on each swing a silk line drops from high above to him and a white web
  // splashes on the foe he cuts
  ntSwing: {
    pal: [NT_VIO, NT_SILK], hitR: 1.8,
    skill(kit, e, u) { web(kit, u.x, u.z, 4.2, { c: C(0.1, 0.08, 0.14), fill: C(0.35, 0.15, 0.6), fillA: 0.22, life: 1.2, n: 12, k: 5, w: 0.04 }); return true; },
    flurry(kit, e, u) {
      const ax = (u.x + e.x) / 2, az = (u.z + e.z) / 2;
      silk(kit, [ax, 11, az], (t) => (u.alive && (t < 0.1 || u.dash) && t < 0.5 ? [u.x, 1.3, u.z] : null), 0.4, 0.6);
      web(kit, e.x, e.z, 2.4, { life: 0.9, n: 12, k: 4.5, w: 0.055 });
      return true;
    },
  },
};

// ---- Băng Nha moved to looks-k9.js with the kit ported from clip p81; Kiếm Thần still borrows BN_WHITE -------------------------
const BN_WHITE = C(2.3, 2.5, 2.6);

// ---- Kiếm Thần: steel swords, red fire ---------------------------------------------------------------------------------
const KT_RED = C(2.6, 0.35, 0.15), KT_ORG = C(2.6, 1.2, 0.25), KT_STEEL = C(1.2, 1.7, 2.6);
const bladeGeo = keep(new THREE.CylinderGeometry(0.3, 0.02, 2.6, 4).rotateY(Math.PI / 4).scale(1, 1, 0.3).rotateZ(-Math.PI / 2).translate(1.35, 0, 0));
const guardGeo = keep(new THREE.SphereGeometry(0.4, 12, 8).scale(0.22, 0.25, 1.05)), gripGeo = keep(new THREE.CylinderGeometry(0.055, 0.07, 0.55, 8).rotateZ(Math.PI / 2).translate(-0.3, 0, 0));
// a sword along +x (the point), grip at the origin: a solid blade on a wider glowing halo, a guard and a grip
function sword(blade, glow, guard) {
  // the blade's broad face turned up, so it reads from the match camera above
  const g = new THREE.Group(), f = new THREE.Group(), h = new THREE.Mesh(bladeGeo, basic(glow, true, 0.75)), b = new THREE.Mesh(bladeGeo, basic(blade, false, 1));
  h.scale.set(1.12, 2.0, 2.0); f.add(h, b, new THREE.Mesh(guardGeo, basic(guard, false, 1)), new THREE.Mesh(gripGeo, basic(0x2a1a14, false, 1))); f.rotation.x = Math.PI / 2; g.add(f);
  return order(g, 7);
}
const kiemthan = {
  // Kiếm Khí Trảm: the sword itself flies, red-hot with a white edge, dragging a red flame wake
  ktSword: {
    pal: [KT_RED, KT_ORG], hitR: 1.8,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.4, 1.3, u.z + Math.sin(e.a) * 1.4, KT_ORG, 0.12, 2, 1, kit.K.STAR, 1.3); return true; },
    shotMake(kit, s) {
      const w = sword(0xfff0e0, KT_RED, 0xc08030); w.scale.setScalar(2.8);
      const v = { w, hold: held(kit, [w]), x: s.x, z: s.z, live: true };
      trail(kit, () => (v.live ? [v.x, 1.25, v.z] : null), 1.2, KT_ORG, 0.5, { c2: C(0.6, 0.05, 0.02), len: 12 });
      return v;
    },
    shot(kit, v, s, x, y, z) {
      v.x = x; v.z = z; v.w.position.set(x - s.dx * 1.6, 1.25, z - s.dz * 1.6); v.w.rotation.y = -Math.atan2(s.dz, s.dx);
      if (Math.random() < 0.6) kit.glow(x - s.dx * 1.5, 1.2, z - s.dz * 1.5, KT_RED, 0.3, 1.0, 0.9, kit.K.FLAME, 1.5);
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.live = false; v.hold.on = false; kit.sparks(x, 1.2, z, kit.N(10), KT_ORG, 9, 0.3, 0.05, 0.5, 10); },
  },
  // Kiếm Trận: six white swords ring him point outward, each leaving a pale steel wake, over a turning six-point seal
  ktArray: {
    zones: ['orbit'], pal: [KT_STEEL, BN_WHITE], hitR: 1.4,
    skill() { return true; },
    zoneMake(kit, z) {
      const v = { z, live: true, sw: [] };
      for (let i = 0; i < (z.n || 6); i++) {
        const w = sword(0xf4f8ff, KT_STEEL, 0x9aa8c0); w.scale.setScalar(1.6); v.sw.push(w);
        trail(kit, () => (v.live && ((v.z.live >> i) & 1) ? [w.position.x + Math.cos(w.userData.b || 0) * 2.6, 1.3, w.position.z + Math.sin(w.userData.b || 0) * 2.6] : null), 0.9, KT_STEEL, 1e9, { c2: C(0.1, 0.2, 0.5), len: 10 });
      }
      v.h = held(kit, v.sw);
      v.s = sigil(kit, z.x, z.z, (z.ring || 2) + 1.4, KT_STEEL, { n: 0, ticks: 0, inner: 0, fill: 0.18, life: 1e9, rev: 0.25, alpha: 0.7, w: 0.05 });
      return v;
    },
    zone(kit, v, z) {
      v.z = z; const o = kit.match.units[z.owner]; if (!o) return;
      v.s.position.x = o.x; v.s.position.z = o.z;
      v.sw.forEach((w, i) => { const on = (z.live >> i) & 1; w.visible = !!on; if (!on) return; const [px, pz] = orbPos(z, o, i), b = Math.atan2(pz - o.z, px - o.x) + 0.35; w.userData.b = b; w.position.set(px, 1.3, pz); w.rotation.y = -b; });
    },
    zoneDrop(kit, v) { v.live = false; v.h.on = false; stop(v.s); },
  },
  // Vạn Kiếm Quy Tông: a red-hot sword hangs point down over each spot and plunges; it stands in a column of fire
  ktRain: {
    zones: ['strike'], ownDisc: true, pal: [KT_RED, KT_ORG], hitR: 1.8,
    skill() { return true; },
    zoneMake(kit, z) {
      const w = sword(0xffe0c8, KT_RED, 0xd09030); w.scale.setScalar(2.4); w.rotation.z = -Math.PI / 2 + 0.45;
      const s = sigil(kit, z.x, z.z, Math.max(1.6, z.r), KT_RED, { n: 0, ticks: 0, inner: 0, fill: 0.25, life: 1e9, rev: 0.1, w: 0.07, alpha: 0.8 });
      return { w, h: held(kit, [w]), s };
    },
    zone(kit, v, z) { const k = z.delay / (z.total || 1); v.w.position.set(z.x, 1.2 + 9 * k, z.z); v.w.rotation.y = z.age * 2; if (Math.random() < 0.5) kit.glow(z.x, v.w.position.y + 5.4, z.z, KT_ORG, 0.3, 0.9, 0.9, kit.K.FLAME, 1.5); },
    zoneDrop(kit, v) { v.h.on = false; stop(v.s); },
    land(kit, e) {
      const w = sword(0xffe0c8, KT_RED, 0xd09030); w.scale.setScalar(2.4); w.rotation.set(0, Math.random() * 6, -Math.PI / 2 + 0.3);
      own(kit, [w], 0.8, (t) => { w.position.set(e.x, 4.4, e.z); fadeAll(w, Math.min(1, (0.8 - t) / 0.3)); });
      pillar(kit, e.x, e.z, 1.0, KT_ORG, { c2: KT_RED, h: 7, life: 0.6, grow: 0.05, narrow: true });
      for (let i = 0; i < kit.N(6); i++) kit.glow(e.x + R(-0.8, 0.8), R(0.3, 1.5), e.z + R(-0.8, 0.8), KT_ORG, R(0.4, 0.7), R(0.9, 1.5), 1, kit.K.FLAME, 1.4, 0, R(2, 4), 0);
      kit.scorch(e.x, e.z, 1.4, 3, 1.2, KT_ORG); kit.kick(e.x, e.z, 0.3);
      return true;
    },
  },
};

export const B6 = { ...luondien, ...nhenthep, ...kiemthan };   // vesau, bang and bocap moved to looks-k8.js / looks-k9.js / looks-k10.js with their ported kits
