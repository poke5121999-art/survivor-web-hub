// Particle effects of the original ObjectPoolManager._particleObjectData (art/fx/fx.json, tools/export_fx.py), drawn as
// camera-facing sprites with the systems' own texture, burst count, start lifetime / speed / size and gravity. Only the
// systems with a texture are drawn (the mesh-particle confetti/coins have none in the export). Size-over-lifetime and
// colour-over-lifetime curves are not exported: sprites pop in over 0.15 s and fade out over the last 30 % of their life
// [GUESS].
import * as THREE from 'three';

const G = 9.81;

export class Fx {
  constructor(root, base, data) {
    this.root = root;
    this.data = data || {};
    this.base = base;
    this.loader = new THREE.TextureLoader();
    this.tex = new Map();
    this.live = [];
  }

  texture(name) {
    if (!this.tex.has(name)) {
      const t = this.loader.load(`${this.base}/${name}`);
      t.colorSpace = THREE.NoColorSpace;
      this.tex.set(name, t);
    }
    return this.tex.get(name);
  }

  // ParticleType name (SmileEffect, DollerEffect, BuildEffect, UpgradeEffect, SleepEffect...) at a world position.
  play(name, pos) {
    const e = this.data[name];
    if (!e) return;
    for (const sys of e.systems) {
      if (!sys.tex) continue;
      const n = sys.bursts.reduce((a, b) => a + b, 0) || 1;
      const tex = this.texture(sys.tex);
      for (let i = 0; i < n; i++) {
        const mat = new THREE.SpriteMaterial({ map: sys.sheet ? tex.clone() : tex, transparent: true, depthWrite: false, depthTest: false });
        if (sys.sheet) {
          const [tx, ty] = sys.sheet, k = Math.floor(Math.random() * tx * ty);
          mat.map.repeat.set(1 / tx, 1 / ty);
          mat.map.offset.set((k % tx) / tx, 1 - (Math.floor(k / tx) + 1) / ty);
          mat.map.needsUpdate = true;
        }
        const sp = new THREE.Sprite(mat);
        sp.renderOrder = 80;
        const r = (a, b) => a + Math.random() * (b - a);
        const size = r(...sys.size);
        // Shape 4 = cone pointing up, 0 = sphere (ParticleSystemShapeType): random direction in that shape.
        let dir;
        if (sys.shape === 0) dir = new THREE.Vector3(r(-1, 1), r(-1, 1), r(-1, 1)).normalize();
        else dir = new THREE.Vector3(r(-0.3, 0.3), 1, r(-0.3, 0.3)).normalize();
        const p = new THREE.Vector3(...pos).addScaledVector(dir, sys.radius || 0);
        sp.position.copy(p);
        this.root.add(sp);
        this.live.push({ sp, vel: dir.multiplyScalar(r(...sys.speed)), life: r(...sys.life), t: 0, size, g: sys.gravity * G });
      }
    }
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const q = this.live[i];
      q.t += dt;
      if (q.t >= q.life) {
        this.root.remove(q.sp);
        q.sp.material.dispose();
        this.live.splice(i, 1);
        continue;
      }
      q.vel.y -= q.g * dt;
      q.sp.position.addScaledVector(q.vel, dt);
      const u = q.t / q.life;
      const pop = Math.min(1, q.t / 0.15);
      q.sp.scale.setScalar(q.size * (pop < 1 ? 0.6 + 0.4 * pop : 1));
      q.sp.material.opacity = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    }
  }
}
