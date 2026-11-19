// Push cart (design-inventory 3: "Carts: wheel efficiency 3.4 (weight / 3.4)", push cart 6 slots, CART_MAX_VALUE 20000,
// the layout guarantees a cart reaches every pad; 3D: one cart parked by the truck in every house).
// A real rigid body: a tub (floor + 4 walls), a push bar, 4 wheels (low-friction balls; the meshes spin by the distance
// rolled). Loot inside is ordinary loot: it rides on the tub floor, bounces on bumps and loses value on hard knocks through
// the usual loot rule. The grab beam takes the cart by its bar; the carrier feels (cart + load) / 3.4 of weight.
// A cart rolling into a foe faster than 1.2 m/s shoves it along. Rolling makes a floor-dependent rumble (audio loop).
import * as THREE from '../vendor/three.module.min.js';

export const CART = { mass: 14, eff: 3.4, maxItemValue: 20000, slots: 6, L: 1.15, W: 0.72, H: 0.42, floorY: 0.36, wheelR: 0.13, shove: 1.2, shoveK: 0.8, shoveV: 2.2, stun: 0.8 };   // parity.md: shove 2.2 (unit not stated, taken as m/s), stun 0.8 s

export class Cart {
  constructor(G, at, yaw = 0) {
    this.G = G;
    const { R, world } = G.phys, C = CART;
    const y0 = (G.house?.heightAt ? G.house.heightAt(at.x, at.z) : 0) + C.wheelR + 0.02;
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(at.x, y0, at.z).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setLinearDamping(0.35).setAngularDamping(2.5).setCcdEnabled(true));
    const cols = [];
    const box = (hx, hy, hz, x, y, z, fr = 0.5) => { const c = world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(fr).setDensity(0), body); cols.push(c); return c; };
    const hl = C.L / 2, hw = C.W / 2, fy = C.floorY - C.wheelR, wt = 0.025;
    const floor = box(hl, 0.025, hw, 0, fy, 0, 0.9);   // loot grips the tub floor
    box(hl, C.H / 2, wt, 0, fy + C.H / 2, hw); box(hl, C.H / 2, wt, 0, fy + C.H / 2, -hw);
    box(wt, C.H / 2, hw, hl, fy + C.H / 2, 0); box(wt, C.H / 2, hw, -hl, fy + C.H / 2, 0);
    const bar = world.createCollider(R.ColliderDesc.capsule(hw * 0.9, 0.03).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }).setTranslation(-hl - 0.22, fy + C.H + 0.28, 0).setDensity(0), body); cols.push(bar);
    for (const [x, z] of [[hl * 0.75, hw * 0.85], [hl * 0.75, -hw * 0.85], [-hl * 0.75, hw * 0.85], [-hl * 0.75, -hw * 0.85]]) {
      cols.push(world.createCollider(R.ColliderDesc.ball(C.wheelR).setTranslation(x, 0, z).setFriction(0.02).setRestitution(0.05).setDensity(0), body));
    }
    body.setAdditionalMass(C.mass, true);
    this.body = body; this.cols = cols; this.bar = bar; this.floor = floor;
    // mesh
    const g = this.mesh = new THREE.Group(); g.name = 'cart';
    const steel = new THREE.MeshStandardMaterial({ color: 0x8c949a, roughness: 0.35, metalness: 0.8 }), paint = new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.5, metalness: 0.4 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.9 }), grip = new THREE.MeshStandardMaterial({ color: 0xd0402a, roughness: 0.6 });
    const add = (geo, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    add(new THREE.BoxGeometry(C.L, 0.05, C.W), paint, 0, fy, 0);
    for (const s of [1, -1]) { add(new THREE.BoxGeometry(C.L, C.H, 0.03), paint, 0, fy + C.H / 2, s * hw); add(new THREE.BoxGeometry(0.03, C.H, C.W), paint, s * hl, fy + C.H / 2, 0); }
    for (const s of [1, -1]) for (const t of [1, -1]) add(new THREE.BoxGeometry(0.035, C.H + 0.04, 0.035), steel, t * hl, fy + C.H / 2, s * hw);   // corner posts
    for (let k = 1; k < 4; k++) add(new THREE.BoxGeometry(C.L + 0.01, 0.018, 0.035), steel, 0, fy + C.H * k / 4, hw + 0.01);   // wire bands
    for (let k = 1; k < 4; k++) add(new THREE.BoxGeometry(C.L + 0.01, 0.018, 0.035), steel, 0, fy + C.H * k / 4, -hw - 0.01);
    for (const s of [1, -1]) add(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8), steel, -hl - 0.11, fy + C.H + 0.08, s * hw * 0.85, 0, -0.75);   // bar stays
    add(new THREE.CylinderGeometry(0.03, 0.03, C.W * 0.95, 12), grip, -hl - 0.22, fy + C.H + 0.28, 0, Math.PI / 2, 0);
    this.wheels = [];
    for (const [x, z] of [[hl * 0.75, hw * 0.85], [hl * 0.75, -hw * 0.85], [-hl * 0.75, hw * 0.85], [-hl * 0.75, -hw * 0.85]]) {
      const w = add(new THREE.CylinderGeometry(C.wheelR, C.wheelR, 0.06, 16), rubber, x, 0, z, Math.PI / 2, 0);
      const hub = new THREE.Mesh(new THREE.BoxGeometry(C.wheelR * 1.4, 0.065, 0.03), steel); w.add(hub);   // a spoke shows the spin
      add(new THREE.BoxGeometry(0.03, fy - 0.02, 0.03), steel, x, (fy) / 2, z);
      this.wheels.push(w);
    }
    G.scene.add(g);
    // the beam's record: grabbable like loot, weight = (cart + load) / 3.4
    this.rec = { body, col: bar, cols, mesh: g, tag: 'cart', grabbable: true, isCart: true, cart: this, kg: C.mass, mass: C.mass / C.eff, size: 'big', prevVel: { x: 0, y: 0, z: 0 } };
    G.phys.props.push(this.rec);
    this.roll = 0; this.log = []; this.shoved = new Map();
  }
  /** Loot whose centre is inside the tub. */
  load() {
    const t = this.body.translation(), r = this.body.rotation(), q = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert(), C = CART;
    return (this.G.loot?.items || []).filter((it) => { if (it.dead || it.held) return false; const p = it.body.translation(); const l = new THREE.Vector3(p.x - t.x, p.y - t.y, p.z - t.z).applyQuaternion(q);
      return Math.abs(l.x) < C.L / 2 && Math.abs(l.z) < C.W / 2 && l.y > C.floorY - C.wheelR - 0.05 && l.y < C.floorY - C.wheelR + C.H + 0.4; });
  }
  step(dt) {
    const G = this.G, C = CART, b = this.body, v = b.linvel(), sp = Math.hypot(v.x, v.z);
    const load = this.load(); for (const it of G.loot?.items || []) it.inCart = false; for (const it of load) it.inCart = true;
    this.rec.mass = (C.mass + load.reduce((s, it) => s + it.mass, 0)) / C.eff; this.rec.kg = C.mass;
    // shove foes it rolls into
    const t = b.translation();
    if (sp > C.shove) for (const f of G.foes?.list || []) {
      if (f.dead || f.def.beh === 'ghost') continue;
      const d = Math.hypot(f.x - t.x, f.z - t.z); if (d > C.L * 0.6 + f.r || Math.abs((f.gy || 0) - (t.y - C.wheelR)) > 1) continue;
      if ((this.shoved.get(f) || 0) > G.time) continue;
      const k = Math.max(C.shoveV, sp * C.shoveK) / sp; f.knock.x += v.x * k; f.knock.z += v.z * k; if (!f.def.boss) { f.stunT = Math.max(f.stunT || 0, C.stun); f.atk = 0; } this.shoved.set(f, G.time + 0.5);
      this.log.push(['shove', f.kind, +sp.toFixed(2)]); G.events.emit('cart:shove', { foe: f, speed: sp });
    }
    this.speed = sp;
  }
  render(dt) {
    const b = this.body, t = b.translation(), r = b.rotation();
    this.mesh.position.set(t.x, t.y, t.z); this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    // wheels spin by the forward speed in the cart's frame
    const v = b.linvel(), fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion), s = v.x * fwd.x + v.z * fwd.z;
    this.roll -= s * dt / CART.wheelR; for (const w of this.wheels) w.rotation.y = this.roll;
    const a = this.G.audio; if (a?.loopSet) a.loopSet('roll', Math.min(1, (this.speed || 0) / 3) * 0.7, 0.8 + 0.25 * Math.min(2, this.speed || 0), { x: t.x, y: t.y, z: t.z });
  }
  dispose() {
    const G = this.G; G.scene.remove(this.mesh);
    const i = G.phys.props.indexOf(this.rec); if (i >= 0) G.phys.props.splice(i, 1);
    G.phys.world.removeRigidBody(this.body);
    G.audio?.loopSet?.('roll', 0);
  }
}
