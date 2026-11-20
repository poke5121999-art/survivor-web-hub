// Push cart (design-inventory 3: "Carts: wheel efficiency 3.4 (weight / 3.4)", push cart 6 slots, CART_MAX_VALUE 20000,
// the layout guarantees a cart reaches every pad; 3D: one cart parked by the truck in every house).
// A real rigid body: a tub (floor + 4 walls), a push bar, 4 wheels (low-friction balls; the meshes spin by the distance
// rolled). Loot inside is ordinary loot: it rides on the tub floor, bounces on bumps and loses value on hard knocks through
// the usual loot rule. The grab beam takes the cart by its bar; the carrier feels (cart + load) / 3.4 of weight.
// A cart rolling into a foe faster than 1.2 m/s shoves it along. Rolling makes a floor-dependent rumble (audio loop).
import * as THREE from '../vendor/three.module.min.js';

// Feel (batch 6f, owner: "kéo cart cứ kẹt"): held, the cart turns to point along the push (the line from the carrier to
// the cart, about 0.2 s to line up) instead of sliding sideways into door jambs; its tub is rounded (2 cm) so it glances off
// corners; the beam pushes it along the floor through its centre (grab.js): no tipping, no nose dug in, it tilts with a ramp.
export const CART = { steerK: 6, steerMax: 3, round: 0.02, slide: 1.2, unstickT: 0.6, hopV: 1.5, rollK: 12, glance: 0.6, glanceT: 0.4, mass: 14, eff: 3.4, maxItemValue: 20000, slots: 6, L: 1.15, W: 0.72, H: 0.42, floorY: 0.36, wheelR: 0.13, shove: 1.2, shoveK: 0.8, shoveV: 2.2, stun: 0.8 };   // parity.md: shove 2.2 (unit not stated, taken as m/s), stun 0.8 s

export class Cart {
  constructor(G, at, yaw = 0) {
    this.G = G;
    const { R, world } = G.phys, C = CART;
    const y0 = (G.house?.heightAt ? G.house.heightAt(at.x, at.z) : 0) + C.wheelR + 0.02;
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(at.x, y0, at.z).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setLinearDamping(0.35).setAngularDamping(2.5).setCcdEnabled(true));
    const cols = [];
    const box = (hx, hy, hz, x, y, z, fr = 0.5) => { const r = Math.min(C.round, hx * 0.5, hy * 0.5, hz * 0.5); const c = world.createCollider(R.ColliderDesc.roundCuboid(hx - r, hy - r, hz - r, r).setTranslation(x, y, z).setFriction(fr).setDensity(0), body); cols.push(c); return c; };
    const hl = C.L / 2, hw = C.W / 2, fy = C.floorY - C.wheelR, wt = 0.025;
    const floor = box(hl, 0.025, hw, 0, fy, 0, 0.9);   // loot grips the tub floor
    box(hl, C.H / 2, wt, 0, fy + C.H / 2, hw); box(hl, C.H / 2, wt, 0, fy + C.H / 2, -hw);
    box(wt, C.H / 2, hw, hl, fy + C.H / 2, 0); box(wt, C.H / 2, hw, -hl, fy + C.H / 2, 0);
    // bumpers and skirts under the tub: loot on the floor is pushed along instead of slipping under the tub and wedging it on a
    // ramp (asylum h5: a small item under the floor plate held the cart on a stair); 10 cm clear at the ends, 14 cm along the sides
    // (the middle dips about 10 cm over a ramp's crest)
    { const lo = -C.wheelR + 0.10, hi = fy - 0.03, lo2 = -C.wheelR + 0.14;
      box(0.02, (hi - lo) / 2, hw * 0.92, hl - 0.02, (hi + lo) / 2, 0, 0.1); box(0.02, (hi - lo) / 2, hw * 0.92, -hl + 0.02, (hi + lo) / 2, 0, 0.1);
      for (const sg of [1, -1]) box(hl * 0.55, (hi - lo2) / 2, 0.02, 0, (hi + lo2) / 2, sg * (hw - 0.02), 0.1); }
    const bar = world.createCollider(R.ColliderDesc.capsule(hw * 0.9, 0.03).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }).setTranslation(-hl - 0.22, fy + C.H + 0.28, 0).setDensity(0), body); cols.push(bar);
    for (const [x, z] of [[hl * 0.75, hw * 0.85], [hl * 0.75, -hw * 0.85], [-hl * 0.75, hw * 0.85], [-hl * 0.75, -hw * 0.85]]) {
      cols.push(world.createCollider(R.ColliderDesc.ball(C.wheelR).setTranslation(x, 0, z).setFriction(0.02).setRestitution(0.05).setDensity(0), body));
    }
    // mass AND rotational inertia (a solid box the size of the tub, centre of mass low): with setAdditionalMass alone every
    // collider has density 0, so the body had zero inertia = it could never turn (batch 6f: the root of "kéo cart cứ kẹt")
    { const m = C.mass, Lx = C.L, Hy = C.H + 0.25, Wz = C.W;
      body.setAdditionalMassProperties(m, { x: 0, y: 0.12, z: 0 }, { x: m / 12 * (Hy * Hy + Wz * Wz), y: m / 12 * (Lx * Lx + Wz * Wz), z: m / 12 * (Lx * Lx + Hy * Hy) }, { x: 0, y: 0, z: 0, w: 1 }, true); }

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
    // no roll: a trolley does not tip onto two wheels against a desk edge (it then wedged); spin about its own length is
    // removed and a roll is righted, pitch stays free for ramps
    { const r = b.rotation(), q = new THREE.Quaternion(r.x, r.y, r.z, r.w), f = new THREE.Vector3(1, 0, 0).applyQuaternion(q), side = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const w = b.angvel(), wf = w.x * f.x + w.y * f.y + w.z * f.z, roll = Math.asin(THREE.MathUtils.clamp(side.y, -1, 1)), fix = C.rollK * roll;
      b.setAngvel({ x: w.x - f.x * wf + f.x * fix, y: w.y - f.y * wf + f.y * fix, z: w.z - f.z * wf + f.z * fix }, true); }
    // held: turn to point where the pusher looks (local +x is the front; the bar is at the back), pivoting about the bar the beam
    // holds (the tub swings round behind it like a pushed trolley, the bar does not get flung sideways)
    const pv = this.pivotV || { x: 0, z: 0 }; let nx = 0, nz = 0;
    if (this.rec.held && G.player) {
      const B = this.bar.translation(), fw = G.player.forward(), dx = fw.x, dz = fw.z;   // the way the pusher looks (the short pusher-to-bar line swung the nose into furniture beside a narrow aisle)
      if (Math.hypot(dx, dz) > 0.3) {
        const r = b.rotation(), yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.z * r.z)), want = Math.atan2(-dz, dx);
        let e = want + (this.glanceT > 0 ? this.glanceSide * C.glance : 0) - yaw; e = Math.atan2(Math.sin(e), Math.cos(e));
        const wy = THREE.MathUtils.clamp(C.steerK * e, -C.steerMax, C.steerMax), w = b.angvel(); b.setAngvel({ x: w.x, y: wy, z: w.z }, true);
        nx = wy * (t.z - B.z); nz = -wy * (t.x - B.x);   // the centre's velocity for a turn about the bar: w x (centre - bar)
      }
    }
    if (nx || nz || pv.x || pv.z) { const v = b.linvel(); b.setLinvel({ x: v.x - pv.x + nx, y: v.y, z: v.z - pv.z + nz }, true); }
    this.pivotV = { x: nx, z: nz };
    // pushed into a wall, a door jamb or furniture and hardly moving: the push's share along the obstacle becomes a slide
    // along it (a trolley glances off a corner), head-on it slips to the side the cart already leans to
    const pe = this.rec.held && this.rec.pushErr, pl = pe ? Math.hypot(pe.x, pe.z) : 0;
    if (pl > 0.2 && sp < 0.35) {
      const W = G.phys.world, r0 = b.rotation(), yawNow = Math.atan2(2 * (r0.w * r0.y + r0.x * r0.z), 1 - 2 * (r0.y * r0.y + r0.z * r0.z)); let ax = 0, az = 0, n = 0, ox = 0, oz = 0, cornerZ = 0;
      for (const cc of this.cols) W.contactPairsWith(cc, (o) => { const ob = o.parent(); if (!ob || ob.isDynamic()) return; W.contactPair(cc, o, (m) => { let md = 1; for (let i = 0; i < m.numContacts(); i++) md = Math.min(md, m.contactDist(i)); if (md > 0.02) return; const q = m.normal();   // real contacts only (Rapier also lists predicted ones a few cm away)
 if (Math.abs(q.y) > 0.6) return; let hx = q.x, hz = q.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl; if (hx * pe.x + hz * pe.z > 0) { hx = -hx; hz = -hz; } ax += hx; az += hz; n++; const oc = o.translation(); ox += oc.x; oz += oc.z;
        for (let i = 0; i < m.numSolverContacts(); i++) { const cp = m.solverContactPoint(i), dx = cp.x - t.x, dz = cp.z - t.z, lx = dx * Math.cos(yawNow) - dz * Math.sin(yawNow), lz = dx * Math.sin(yawNow) + dz * Math.cos(yawNow);
          if (lx > C.L * 0.3 && Math.abs(lz) > C.W * 0.2) cornerZ += Math.sign(lz); } }); });   // a front corner on the thing
      if (n) { const al = Math.hypot(ax, az) || 1, nx2 = ax / al, nz2 = az / al, dx = pe.x / pl, dz = pe.z / pl, k = dx * nx2 + dz * nz2;
        let sx = dx - k * nx2, sz = dz - k * nz2; let sl = Math.hypot(sx, sz);
        const lf = G.player.forward(), lt = -nz2 * lf.x + nx2 * lf.z;   // where the pusher looks, along the obstacle's face
        if (Math.abs(lt) > 0.15 && (sl < 0.5 || (sx * -nz2 + sz * nx2) * lt < 0)) { const side = lt > 0 ? 1 : -1; sx = -nz2 * side; sz = nx2 * side; sl = 1; }   // the pusher looks past the corner one way: slide that way (the push error alone pointed back the way it came at a desk corner)
        else if (sl < 0.5) { const cx = t.x - ox / n, cz = t.z - oz / n, side = (-nz2 * cx + nx2 * cz) >= 0 ? 1 : -1; sx = -nz2 * side; sz = nx2 * side; sl = 1; }   // head-on and looking straight at it: slip to the side away from the touched part's centre
        const v = b.linvel(), ux = sx / sl, uz = sz / sl, along = v.x * ux + v.z * uz, add = Math.max(0, C.slide - along);   // the slide speed along the obstacle (the beam takes it back each step, so it is set, not added up)
        b.setLinvel({ x: v.x + ux * add + nx2 * 0.2, y: v.y, z: v.z + uz * add + nz2 * 0.2 }, true);
        if (cornerZ) { this.glanceSide = Math.sign(cornerZ); this.glanceT = C.glanceT; }   // its nose caught a corner: swing the nose off it for a moment (a trolley glances off a door jamb)
        this.slides = (this.slides || 0) + dt; } }
    if (this.glanceT > 0) this.glanceT = Math.max(0, this.glanceT - dt);
    // still stuck after unstickT s of pushing (a ramp's lip, a low part of a table): a small hop toward the push
    if (pl > 0.25) { const hp = this.hopFrom || (this.hopFrom = { x: t.x, z: t.z, t: 0 }); hp.t += dt;
      if (Math.hypot(t.x - hp.x, t.z - hp.z) > 0.1) { hp.x = t.x; hp.z = t.z; hp.t = 0; }
      else if (hp.t > C.unstickT) { const v = b.linvel(); b.setLinvel({ x: v.x + pe.x / pl * 1.0, y: Math.max(v.y, C.hopV), z: v.z + pe.z / pl * 1.0 }, true); hp.t = 0; this.hops = (this.hops || 0) + 1; this.log.push(['hop', +t.x.toFixed(1), +t.z.toFixed(1)]); } }
    else this.hopFrom = null;
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
