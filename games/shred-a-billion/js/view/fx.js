// Flying money: bundles arc from the pile to the hand/bag when taken, from the player into the shredder mouth
// while pouring, and from drones into the hopper. One InstancedMesh of the bill-bundle mesh; pure eye candy,
// the sim has already moved the notes.
import * as THREE from 'three';

const MAX = 160;
export class Fx {
  constructor(scene, geo, mat) {
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh);
    this.p = [];
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(1, 1, 1); this.v = new THREE.Vector3();
  }
  // a, b: [x,y,z]; t: seconds; arc: metres of lift at mid-flight
  fly(a, b, t = 0.35, arc = 0.6, n = 1, scale = 1) {
    for (let i = 0; i < n && this.p.length < MAX; i++) {
      const j = () => (Math.random() - 0.5) * 0.25;
      this.p.push({ a: [a[0] + j(), a[1] + j(), a[2] + j()], b: b.slice(), t: 0, T: t * (0.8 + Math.random() * 0.4), arc, spin: [Math.random() * 6, Math.random() * 6, Math.random() * 6], s: scale });
    }
  }
  update(dt, follow) {
    let k = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i]; p.t += dt;
      if (p.t >= p.T) { this.p.splice(i, 1); continue; }
      const u = p.t / p.T, b = follow && p.b === 'follow' ? follow : p.b;
      this.v.set(p.a[0] + (b[0] - p.a[0]) * u, p.a[1] + (b[1] - p.a[1]) * u + Math.sin(u * Math.PI) * p.arc, p.a[2] + (b[2] - p.a[2]) * u);
      this.e.set(p.spin[0] * u, p.spin[1] * u, p.spin[2] * u); this.q.setFromEuler(this.e);
      const sc = p.s * (1 - 0.5 * u); this.s.set(sc, sc, sc);
      this.m.compose(this.v, this.q, this.s); this.mesh.setMatrixAt(k++, this.m);
    }
    this.mesh.count = k; this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Vacuum suction vortex (clip f17): translucent white swirl arcs around the aim point, facing the nozzle,
// spinning with the motor. Radius follows the sim's suction radius.
export class Vortex {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.rings = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.RingGeometry(0.7 + i * 0.12, 0.76 + i * 0.12, 48, 1, i * 1.3, Math.PI * (0.9 + 0.25 * i));
      const m = new THREE.Mesh(g, this.mat); m.position.z = i * 0.18; this.group.add(m); this.rings.push(m);
    }
    this.t = 0;
  }
  update(dt, on, point, from, radius, spin) {
    this.t += dt;
    this.group.visible = on;
    if (!on) return;
    this.group.position.set(point[0], point[1] + 0.55, point[2]);
    this.group.lookAt(from[0], from[1], from[2]);
    this.group.scale.setScalar(Math.max(0.4, radius));
    this.rings.forEach((r, i) => { r.rotation.z = this.t * (5 + i * 1.7) * (i % 2 ? -1 : 1); });
    this.mat.opacity = 0.32 * spin;
  }
}
