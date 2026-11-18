import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';

const C = CFG.grab;
const _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _t = new THREE.Vector3(), _b = new THREE.Vector3();

// Physics beam: the held point chases a spot in front of the camera with a force budget,
// so a heavy item lags, swings on its anchor and drags on the floor when it outweighs the beam.
export class Grab {
  constructor(phys, player, scene) {
    this.phys = phys;
    this.player = player;
    this.held = null;
    this.local = new THREE.Vector3();
    this.dist = 2;
    this.time = 0;
    this.beam = makeBeam();
    scene.add(this.beam);
  }

  tryGrab() {
    const p = this.player;
    const dir = p.forward(_f);
    const hit = this.phys.castRay(p.camPos, dir, C.range, p.col);
    if (!hit || !hit.rec || !hit.rec.grabbable) return false;
    this.attach(hit.rec, hit.point, hit.toi);
    return true;
  }

  attach(rec, point, dist) {
    const t = rec.body.translation(), r = rec.body.rotation();
    _q.set(r.x, r.y, r.z, r.w).invert();
    this.local.set(point.x - t.x, point.y - t.y, point.z - t.z).applyQuaternion(_q);
    this.held = rec;
    this.dist = THREE.MathUtils.clamp(dist, C.minDist, C.maxDist);
    this.player.ignore = rec.col;
    rec.held = true;
    rec.grabbedAt = this.time;
  }

  release(throwIt) {
    const rec = this.held;
    if (!rec) return;
    if (throwIt) {
      const str = this.player.str;
      const speed = Math.max(C.throwBase, C.throwMax * str / (str + 2.2 * rec.mass));
      const d = this.player.forward(_f).multiplyScalar(speed);
      const v = rec.body.linvel();
      rec.body.setLinvel({ x: v.x * 0.3 + d.x, y: v.y * 0.3 + d.y, z: v.z * 0.3 + d.z }, true);
      this.player.stamina = Math.max(0, this.player.stamina - CFG.player.throwStamina);
    }
    rec.held = false;
    this.held = null;
    this.player.ignore = null;
  }

  anchorWorld(out) {
    const rec = this.held;
    const t = rec.body.translation(), r = rec.body.rotation();
    return out.copy(this.local).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(_b.set(t.x, t.y, t.z));
  }

  step(dt, cmd) {
    this.time += dt;
    if (cmd.grabPressed && !this.held) this.tryGrab();
    if (this.held && (!cmd.grab || this.held.dead)) this.release(false);
    if (this.held && cmd.throwIt) this.release(true);
    if (!this.held) { this.player.speedMul = 1; return; }

    this.dist = THREE.MathUtils.clamp(this.dist - cmd.wheel * C.scrollStep, C.minDist, C.maxDist);
    const rec = this.held, b = rec.body, m = rec.kg;
    const p = this.player;
    const target = _t.copy(p.camPos).addScaledVector(p.forward(_f), this.dist);
    const anchor = this.anchorWorld(_a);
    const err = target.clone().sub(anchor);
    if (err.length() > C.breakDist) { this.release(false); return; }

    const want = err.multiplyScalar(C.spring);
    if (want.length() > C.maxSpeed) want.setLength(C.maxSpeed);
    const v = b.linvel();
    const dv = new THREE.Vector3(want.x - v.x, want.y - v.y + CFG.gravity * dt, want.z - v.z);
    const budget = (C.newtonsPerStr * p.str / m) * dt;
    if (dv.length() > budget) dv.setLength(budget);
    b.applyImpulseAtPoint({ x: dv.x * m, y: dv.y * m, z: dv.z * m }, { x: anchor.x, y: anchor.y, z: anchor.z }, true);
    const w = b.angvel();
    b.setAngvel({ x: w.x * C.angDamp, y: w.y * C.angDamp, z: w.z * C.angDamp }, true);

    p.speedMul = Math.max(CFG.player.speedFloor, 1 / (1 + rec.mass / p.str));
    rec.beamDv = dv.length();
  }

  updateBeam() {
    const vis = !!this.held;
    this.beam.visible = vis;
    if (!vis) return;
    const p = this.player;
    const from = _t.copy(p.camPos).add(new THREE.Vector3(0.18, -0.22, 0).applyEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ')));
    const to = this.anchorWorld(_a);
    const pos = this.beam.geometry.attributes.position;
    for (let i = 0; i < 16; i++) {
      const k = i / 15;
      const sag = Math.sin(k * Math.PI) * 0.06;
      pos.setXYZ(i, from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k - sag, from.z + (to.z - from.z) * k);
    }
    pos.needsUpdate = true;
    this.beam.geometry.computeBoundingSphere();
  }
}

function makeBeam() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.85, toneMapped: false }));
  line.frustumCulled = false;
  line.visible = false;
  return line;
}
