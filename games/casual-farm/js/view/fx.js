// Particle effects of a store (D:\minimart-ref\rules\particles.md, every number below is from there): the player's
// walking dust, the pooled smoke puffs (GameManager.particleList), confetti, the upgrade sprays, the boost rings and
// the extra-cash sparkle. Unity ParticleSystems become three.js instanced meshes stepped on the CPU.
import * as THREE from 'three';
import { makeMaterial, addSmoothNormals } from './toon.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = v => (Array.isArray(v) ? rand(v[0], v[1]) : v);
// Piecewise-linear Unity curve [[t, v], ...].
function curve(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
      return v0 + (v1 - v0) * (t - t0) / Math.max(t1 - t0, 1e-6);
    }
  }
  return pts[pts.length - 1][1];
}
const G = 9.81;

// Section 4.1 DustTrailFX: shed behind the heels at (0, 0.36, -1.31) in the body frame, 0.2-2 puffs per metre.
const DUST = { life: [0.18, 0.32], speed: 3, size: [0.6, 1.7], gravity: -0.1, perMeter: [0.2, 2], cone: 12.16,
  sizeCurve: [[0, 0], [0.029, 1], [1, 0]], rot: 45, spin: 25 };
// Section 3 settings table; all shrink linearly to 0 and brake to `limit` x (1 -> end) over life.
const PUFF = {
  small: { life: [0.2, 0.8], speed: [4, 8], size: [4, 5], gravity: [-0.1, -0.3], bursts: [[0, 10, 15]], sphere: 0.5, limit: 10, limitEnd: 0.34 },
  big: { life: [0.2, 0.8], speed: [4, 20], size: [4, 8], gravity: [-0.1, -0.3], bursts: [[0, 10, 15]], sphere: 0.5, limit: 10, limitEnd: 0.34 },
  huge: { life: [0.2, 0.8], speed: [8, 20], size: [4, 8], gravity: [-0.2, -0.5], bursts: [[0, 15, 30], [0.08, 15, 20]], ring: 30, limit: 10, limitEnd: 0.34 },
  thief: { life: [0.2, 0.6], speed: [50, 80], size: [2, 4], gravity: 0, bursts: [[0, 15, 24]], ring: 0.5, limit: 20, limitEnd: 0.23 },
};
// Section 6.1 Confetti3DBlast (simulationSpeed 1.5).
const CONFETTI_COLORS = [0xff4a4a, 0xf2ff00, 0x0fe603, 0x00ffff, 0x8245ff, 0xff00ed, 0xffb800];

export class Fx {
  constructor({ root, camera, art, fxData, gltf, texBase, version }) {
    this.root = root;
    this.camera = camera;
    this.parts = [];
    this.loops = new Map();
    this.timers = [];
    this.dustCarry = 0;
    // Toon puffs (dust trail and smoke): one instanced mesh plus its outline hull.
    const src = gltf.scene.children.find(o => o.name === 'm0');
    src.updateMatrix();
    const geo = (src.isMesh ? src : src.children[0]).geometry.clone().applyMatrix4(src.matrix);
    const texList = fxData.textures.map(n => ({ name: n }));
    const m = fxData.puff.material;
    const mats = makeMaterial({ ...m, tex: m.tex != null ? fxData.textures.indexOf(m.tex) : null }, texBase, texList, {});
    if (mats.outline) addSmoothNormals(geo);
    this.puffs = this.instanced(geo, mats.mat, 600);
    this.puffOutline = mats.outline ? this.instanced(geo, mats.outline, 600) : null;
    // Additive sprites and flat colour pieces: one instanced quad (or cube) per look.
    const tex = name => {
      const t = new THREE.TextureLoader().load(`${art}/fx/${name}.webp?v=${version}`);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const quad = new THREE.PlaneGeometry(1, 1);
    const additive = map => new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.looks = {
      cube: this.instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 300),
      streak: this.instanced(quad, additive(tex('shape_box')), 300),
      glow: this.instanced(quad, additive(tex('glow')), 40),
      ring: this.instanced(quad, additive(tex('glowring_smooth')), 60),
      hex: this.instanced(quad, additive(tex('shape_hexagon')), 300),
      plus: this.instanced(quad, additive(tex('shape_plus')), 200),
      sparkle: this.instanced(quad, additive(tex('sparkle')), 100),
      confetti: this.instanced(quad, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 400),
    };
    // The 3x3 shrinking-hexagon sheet: one material per frame so each ring can sit on its own frame.
    const sheet = tex('shrinking_hexagon');
    this.hexFrames = [];
    for (let f = 0; f < 9; f++) {
      const t = sheet.clone();
      t.repeat.set(1 / 3, 1 / 3);
      t.offset.set((f % 3) / 3, 1 - (Math.floor(f / 3) + 1) / 3);
      this.hexFrames.push(this.instanced(quad, additive(t), 40));
    }
  }

  instanced(geo, mat, n) {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.count = 0;
    m.frustumCulled = false;
    m.renderOrder = 2;
    if (!mat.isShaderMaterial) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.root.add(m);
    return m;
  }

  // One particle: look, position, velocity, life, size, size curve, gravity (Unity modifier), optional colour fn.
  add(p) {
    p.age = 0;
    p.rot = p.rot || new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    p.spinV = p.spinV || new THREE.Vector3();
    this.parts.push(p);
  }

  dust(pos, dirX, dirZ, metres) {
    this.dustCarry += metres * pick(DUST.perMeter);
    const back = Math.atan2(-dirX, -dirZ);
    while (this.dustCarry >= 1) {
      this.dustCarry -= 1;
      const a = back + THREE.MathUtils.degToRad(rand(-DUST.cone, DUST.cone));
      this.add({ look: 'puff', pos: new THREE.Vector3(pos.x - dirX * 1.31, (pos.y || 0) + 0.36, pos.z - dirZ * 1.31),
        vel: new THREE.Vector3(Math.sin(a) * DUST.speed, 0, Math.cos(a) * DUST.speed), life: pick(DUST.life), size: pick(DUST.size),
        sizeCurve: DUST.sizeCurve, gravity: DUST.gravity,
        rot: new THREE.Euler(0, THREE.MathUtils.degToRad(rand(-DUST.rot, DUST.rot)), 0),
        spinV: new THREE.Vector3(0, THREE.MathUtils.degToRad(rand(-DUST.spin, DUST.spin)), 0) });
    }
  }

  // A pooled smoke puff (Particletype Small / Big / Huge / Thief) at a world point, after an optional delay.
  puff(kind, pos, delay = 0) {
    const s = PUFF[kind];
    if (!s) return;
    for (const [t, lo, hi] of s.bursts) {
      this.later(delay + t, () => {
        const n = Math.round(rand(lo, hi));
        for (let i = 0; i < n; i++) {
          let o, dir;
          if (s.ring) {
            const a = Math.random() * 6.28, r = s.ring * rand(0.2, 1);
            o = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
            dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
          } else {
            dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
            o = dir.clone().multiplyScalar(s.sphere * Math.random());
          }
          // Shape at (0, -0.5, 0) rotated 90 on X: the puff starts at the object's feet.
          this.add({ look: 'puff', pos: new THREE.Vector3(pos.x, (pos.y || 0) + 0.5, pos.z).add(o), vel: dir.multiplyScalar(pick(s.speed)),
            life: pick(s.life), size: pick(s.size), sizeCurve: [[0, 1], [1, 0]], gravity: pick(s.gravity), limit: s.limit, limitEnd: s.limitEnd });
        }
      });
    }
  }

  // Confetti3DBlast: 30 + 20 coloured quads from a hemisphere 4 above the point, braked, fluttering down.
  confetti(pos) {
    for (const [t, n] of [[0, 30], [0.01, 20]]) {
      this.later(t, () => {
        for (let i = 0; i < n; i++) {
          const dir = new THREE.Vector3(rand(-1, 1), Math.random(), rand(-1, 1)).normalize();
          const c = new THREE.Color(CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]);
          this.add({ look: 'confetti', pos: new THREE.Vector3(pos.x, (pos.y || 0) + 4, pos.z), vel: dir.multiplyScalar(rand(20, 50)),
            life: rand(1, 4) / 1.5, size: rand(0.5, 0.8), sizeCurve: [[0, 1], [0.72, 0.877], [1, 0]], gravity: rand(0.2, 0.4) * 1.5 * 1.5,
            limit: 0.5, limitEnd: 0.5, dampen: 0.2, color: () => c,
            spinV: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)) });
        }
      });
    }
  }

  // UpgradePlayerPFX (cyan) / UpgradeWorkerPFX (magenta), played 0.4 s after the purchase: additive cubes kicked out
  // of a box for 2 s at 18/s, plus a burst of short streaks; workers also get a flat glow.
  upgrade(getPos, worker) {
    const end = worker ? new THREE.Color(1, 0, 1) : new THREE.Color(0, 1, 1);
    const glowEnd = worker ? new THREE.Color(0.33, 0, 1) : new THREE.Color(0.04, 0, 1);
    const box = worker ? 5 : 3;
    this.later(0.4, () => {
      let t = 0;
      const p0 = getPos();
      for (let i = 0; i < 13; i++) this.streak(p0, end, glowEnd, box);
      if (worker) {
        this.add({ look: 'glow', pos: new THREE.Vector3(p0.x, 0.15, p0.z), vel: new THREE.Vector3(), life: 0.5, size: 10, flat: true,
          sizeCurve: [[0, 0.284], [0.492, 0.9], [1, 0.324]], gravity: 0, color: k => end.clone().lerp(glowEnd, k).multiplyScalar(1 - k) });
      }
      this.loopFor(2, dt => {
        t += dt * 18;
        const p = getPos();
        while (t >= 1) {
          t -= 1;
          const o = new THREE.Vector3(rand(-box, box) / 2, rand(0, 3), rand(-box, box) / 2);
          this.add({ look: 'cube', pos: new THREE.Vector3(p.x, 1, p.z).add(o), vel: o.clone().normalize().multiplyScalar(rand(30, 50) * 0.1),
            life: rand(0.4, 0.5), size: rand(0.3, 0.6), sizeCurve: [[0, 0.05], [0.25, 0.81], [1, 0]], gravity: 0,
            color: k => new THREE.Color(1, 1, 1).lerp(end, k).multiplyScalar((1 - k) * 0.6) });
        }
      });
    });
  }

  streak(p, a, b, box) {
    const o = new THREE.Vector3(rand(-2, 2), rand(0, 4), rand(-2, 2)).multiplyScalar(box / 4);
    this.add({ look: 'streak', pos: new THREE.Vector3(p.x, 1, p.z).add(o), vel: o.clone().normalize().multiplyScalar(rand(3, 55) * 0.2),
      life: rand(0.2, 0.25), size: rand(0.2, 0.4), sizeCurve: [[0, 0], [0.171, 0.934], [1, 0]], gravity: 0, billboard: true,
      color: k => a.clone().lerp(b, k).multiplyScalar(curve([[0, 0], [0.3, 1], [0.7, 0.68], [1, 0]], k)) });
  }

  // Looping boost decoration (MachineBoostPFX pink, RevenueBoostPFX green) under a moving point while `on` holds.
  boost(key, getPos, on, kind) {
    if (!on) { this.loops.delete(key); return; }
    if (this.loops.has(key)) { this.loops.get(key).getPos = getPos; return; }
    const pink = kind !== 'revenue';
    const tint = pink ? new THREE.Color(1, 0.47, 0.94) : new THREE.Color(0.56, 1, 0);
    const deep = pink ? new THREE.Color(1, 0, 1) : new THREE.Color(0.56, 1, 0);
    const lift = pink ? 0.1 : 2.24;
    this.loops.set(key, { getPos, acc: { floor: 0, glow: 0, bits: 0 }, step: (L, dt) => {
      const p = L.getPos();
      const a = L.acc;
      a.floor += dt * 6; a.glow += dt * 2; a.bits += dt * (pink ? 10 : 4);
      while (a.floor >= 1) {
        a.floor -= 1;
        this.add({ look: 'hexsheet', pos: new THREE.Vector3(p.x, lift + 0.05, p.z), follow: L, lift: lift + 0.05, vel: new THREE.Vector3(), life: 0.5,
          size: 10, flat: true, sizeCurve: [[0, 0.73], [1, 1]], gravity: 0, frame: [[0, 1], [0.505, 0], [1, 1]],
          color: k => deep.clone().lerp(tint, k).multiplyScalar(curve([[0, 0], [0.3, 1], [1, 0]], k)) });
      }
      while (a.glow >= 1) {
        a.glow -= 1;
        this.add({ look: 'ring', pos: new THREE.Vector3(p.x, lift + 0.08, p.z), follow: L, lift: lift + 0.08, vel: new THREE.Vector3(), life: 1, size: 12, flat: true,
          sizeCurve: [[0, 0.743], [1, 1]], gravity: 0, color: k => deep.clone().lerp(tint, k).multiplyScalar(0.5 * curve([[0, 0], [0.3, 1], [1, 0]], k)) });
      }
      while (a.bits >= 1) {
        a.bits -= 1;
        const ang = Math.random() * 6.28;
        this.add({ look: pink ? 'hex' : 'plus', pos: new THREE.Vector3(p.x + Math.cos(ang) * 1.97, lift, p.z + Math.sin(ang) * 1.97), follow: L,
          vel: new THREE.Vector3(0, pink ? rand(6, 14) * 0.4 : rand(4, 8) * 0.4, 0), life: pink ? rand(0.3, 0.6) : rand(0.5, 1),
          size: pink ? rand(0.5, 0.8) : rand(1.3, 1.6), sizeCurve: [[0, 1], [1, 0]], gravity: 0, billboard: true,
          color: k => deep.clone().lerp(tint, k).multiplyScalar(0.5 * curve([[0, 0], [0.3, 1], [1, 0]], k)) });
      }
    } });
  }

  // Sparkle on the extra-cash mat: 3 rainbow / gold stars a second rising off a disc of radius 3, 3 above the mat.
  sparkle(key, pos, on) {
    if (!on) { this.loops.delete(key); return; }
    if (this.loops.has(key)) return;
    const rainbow = [0xf24fff, 0xff6161, 0xedff3b, 0x3dff00, 0x00c9ff, 0xf24fff].map(c => new THREE.Color(c));
    const gold = [0xffffff, 0xffde00, 0xffb054].map(c => new THREE.Color(c));
    const grad = (cs, k) => { const x = k * (cs.length - 1), i = Math.min(Math.floor(x), cs.length - 2); return cs[i].clone().lerp(cs[i + 1], x - i); };
    this.loops.set(key, { acc: 0, step: (L, dt) => {
      L.acc += dt * 3;
      while (L.acc >= 1) {
        L.acc -= 1;
        const a = Math.random() * 6.28, r = 3 * Math.sqrt(Math.random()), cs = Math.random() < 0.5 ? rainbow : gold;
        this.add({ look: 'sparkle', pos: new THREE.Vector3(pos.x + Math.cos(a) * r, 3, pos.z + Math.sin(a) * r), vel: new THREE.Vector3(0, rand(0.2, 1), 0),
          life: 0.7, size: rand(0.8, 1.6), sizeCurve: [[0, 0.5], [0.123, 0.969], [0.151, 0.956], [1, 0.01]], gravity: -0.2, billboard: true,
          color: k => grad(cs, k).multiplyScalar(0.8) });
      }
    } });
  }

  later(t, fn) {
    if (t <= 0) fn(); else this.timers.push({ t, fn });
  }

  loopFor(seconds, step) {
    const key = Symbol('loop');
    let left = seconds;
    this.loops.set(key, { step: (L, dt) => { step(dt); left -= dt; if (left <= 0) this.loops.delete(key); } });
  }

  update(dt) {
    this.timers = this.timers.filter(x => { x.t -= dt; if (x.t > 0) return true; x.fn(); return false; });
    for (const L of [...this.loops.values()]) L.step(L, dt);
    const q = this.camera.quaternion, flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const counts = new Map();
    const m4 = new THREE.Matrix4(), s3 = new THREE.Vector3(), qq = new THREE.Quaternion(), c = new THREE.Color();
    const meshOf = p => (p.look === 'hexsheet' ? this.hexFrames[Math.min(8, Math.floor(curve(p.frame, p.age / p.life) * 8.999))]
      : p.look === 'puff' ? this.puffs : this.looks[p.look]);
    this.parts = this.parts.filter(p => {
      p.age += dt;
      if (p.age >= p.life) return false;
      const k = p.age / p.life;
      p.vel.y -= p.gravity * G * dt;
      if (p.limit) {
        const lim = p.limit * curve([[0, 1], [1, p.limitEnd]], k), sp = p.vel.length();
        if (sp > lim) p.vel.multiplyScalar(1 - (1 - lim / sp) * (p.dampen ?? 1));
      }
      p.pos.addScaledVector(p.vel, dt);
      if (p.follow && p.follow.getPos && p.look !== 'hex' && p.look !== 'plus') {
        const f = p.follow.getPos();
        p.pos.x = f.x; p.pos.z = f.z;
      }
      p.rot.x += p.spinV.x * dt; p.rot.y += p.spinV.y * dt; p.rot.z += p.spinV.z * dt;
      const size = p.size * curve(p.sizeCurve, k);
      const mesh = meshOf(p);
      const i = counts.get(mesh) || 0;
      if (i >= mesh.instanceMatrix.count) return true;
      counts.set(mesh, i + 1);
      if (p.billboard) qq.copy(q); else if (p.flat) qq.copy(flat); else qq.setFromEuler(p.rot);
      m4.compose(p.pos, qq, s3.setScalar(Math.max(size, 1e-4)));
      mesh.setMatrixAt(i, m4);
      if (p.look === 'puff' && this.puffOutline) this.puffOutline.setMatrixAt(i, m4);
      if (mesh.instanceColor) mesh.setColorAt(i, p.color ? c.copy(p.color(k)) : c.setRGB(1, 1, 1));
      return true;
    });
    for (const mesh of [this.puffs, this.puffOutline, ...Object.values(this.looks), ...this.hexFrames]) {
      if (!mesh) continue;
      mesh.count = mesh === this.puffOutline ? (counts.get(this.puffs) || 0) : (counts.get(mesh) || 0);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
