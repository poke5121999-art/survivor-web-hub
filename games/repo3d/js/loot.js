import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';

const L = CFG.loot;

export class Loot {
  constructor(phys, scene, events) {
    this.phys = phys;
    this.scene = scene;
    this.events = events;
    this.items = [];
    this.time = 0;
  }

  spawn({ material, size, pos, rng = Math.random, shape, value }) {
    const mat = L.materials[material], sz = L.sizes[size];
    const kind = shape || (material === 'ceramic' ? 'vase' : material === 'metal' ? 'bar' : material === 'soul' ? 'orb' : 'crate');
    const { mesh, collider } = buildShape(this.phys.R, kind, sz.half, mat);
    const kg = sz.mass * L.kgPerMass;
    const rec = this.phys.dynamicBody(collider, pos, kg, mesh, 'loot');
    rec.grabbable = true;
    rec.kg = kg;
    rec.mass = sz.mass;
    rec.material = material;
    rec.size = size;
    const [lo, hi] = sz.value;
    rec.value0 = value ?? Math.round((lo + (hi - lo) * rng()) / 10) * 10;
    rec.value = rec.value0;
    rec.spawnedAt = this.time;
    rec.hitAt = -99;
    rec.grabbedAt = -99;
    mesh.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    this.scene.add(mesh);
    this.items.push(rec);
    return rec;
  }

  // Source rule (damageLoot): input is the velocity change of one step that gravity does not explain.
  // loss = value0 * frag * 0.35 * (dv - thresh) / thresh, with grace windows after spawn, pickup and a hit.
  afterStep(dt) {
    this.time += dt;
    for (const it of this.items) {
      if (it.dead) continue;
      const v = it.body.linvel(), p = it.prevVel;
      const dv = Math.hypot(v.x - p.x, v.y - p.y + CFG.gravity * dt, v.z - p.z);
      it.lastDv = dv;
      const mat = L.materials[it.material];
      if (dv <= mat.thresh) continue;
      const t = this.time;
      if (t - it.spawnedAt < L.graceAfterSpawn || t - it.grabbedAt < L.graceAfterPickup || t - it.hitAt < L.invulnAfterHit) continue;
      const lost = Math.min(it.value, Math.round(it.value0 * mat.frag * L.dmgScale * (dv - mat.thresh) / mat.thresh));
      if (lost <= 0) continue;
      it.value -= lost;
      it.hitAt = t;
      if (mat.shatter && it.value < it.value0 * L.shatterBelow) it.value = 0;
      const pos = it.body.translation();
      this.events.emit('loot:hit', { item: it, lost, dv, point: { x: pos.x, y: pos.y, z: pos.z } });
      if (it.value <= 0) this.destroy(it, true);
    }
    if (this.items.some((i) => i.dead)) this.items = this.items.filter((i) => !i.dead);
  }

  destroy(it, broke) {
    it.dead = true;
    const t = it.body.translation();
    this.scene.remove(it.mesh);
    this.phys.remove(it);
    if (broke) this.events.emit('loot:break', { item: it, point: { x: t.x, y: t.y, z: t.z } });
  }

  total() { return this.items.reduce((s, i) => s + i.value, 0); }
}

function buildShape(R, kind, half, mat) {
  const m = new THREE.MeshStandardMaterial({ color: mat.color, roughness: mat.rough, metalness: mat.metal, emissive: mat.emissive || 0x000000, emissiveIntensity: mat.emissive ? 1.5 : 0 });
  if (kind === 'vase') {
    const h = half * 2.2, rr = half * 0.8;
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const k = i / 14;
      const r = rr * (0.45 + 0.55 * Math.sin(Math.PI * (0.08 + 0.8 * k)) - (k > 0.86 ? 0.35 * (k - 0.86) / 0.14 : 0));
      pts.push(new THREE.Vector2(Math.max(0.015, r), (k - 0.5) * h));
    }
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), m);
    return { mesh, collider: R.ColliderDesc.cylinder(h / 2, rr * 0.85) };
  }
  if (kind === 'orb') {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(half * 0.8, 2), m);
    return { mesh, collider: R.ColliderDesc.ball(half * 0.8) };
  }
  if (kind === 'bar') {
    const w = half * 1.8, h = half * 0.7, d = half * 1.0;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    return { mesh, collider: R.ColliderDesc.cuboid(w / 2, h / 2, d / 2) };
  }
  const s = half * 1.6;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), m);
  return { mesh, collider: R.ColliderDesc.cuboid(s / 2, s / 2, s / 2) };
}
