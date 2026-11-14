// Prop builder: a matrix stack, chamfered primitives, one vertex batch per material, merged at build().
import * as THREE from '../vendor/three.module.min.js';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();

// Chamfered box centred at origin. Flat 45-degree chamfer faces catch highlights like real bevels.
export function chamferBox(w, h, d, e) {
  const a = w / 2, b = h / 2, c = d / 2;
  e = Math.min(e ?? Math.min(w, h, d) * 0.06, a * 0.49, b * 0.49, c * 0.49);
  const pos = [], nrm = [];
  const tri = (p0, p1, p2, nx, ny, nz) => {
    // orient so the geometric normal agrees with the intended normal
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz < 0) { const t = p1; p1 = p2; p2 = t; }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const p of [p0, p1, p2]) { pos.push(p[0], p[1], p[2]); nrm.push(nx / l, ny / l, nz / l); }
  };
  const quad = (p0, p1, p2, p3, nx, ny, nz) => { tri(p0, p1, p2, nx, ny, nz); tri(p0, p2, p3, nx, ny, nz); };
  const ext = [a, b, c];
  // faces
  for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3;
    const P = (su, sv) => { const p = [0, 0, 0]; p[ax] = s * ext[ax]; p[u] = su * (ext[u] - e); p[v] = sv * (ext[v] - e); return p; };
    const n = [0, 0, 0]; n[ax] = s;
    quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), n[0], n[1], n[2]);
  }
  // edges
  for (let ax = 0; ax < 3; ax++) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3;
    for (const su of [-1, 1]) for (const sv of [-1, 1]) {
      const P = (sa, onU) => { const p = [0, 0, 0]; p[ax] = sa * (ext[ax] - e); p[u] = su * (onU ? ext[u] : ext[u] - e); p[v] = sv * (onU ? ext[v] - e : ext[v]); return p; };
      const n = [0, 0, 0]; n[u] = su; n[v] = sv;
      quad(P(-1, true), P(1, true), P(1, false), P(-1, false), n[0], n[1], n[2]);
    }
  }
  // corners
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    tri([sx * a, sy * (b - e), sz * (c - e)], [sx * (a - e), sy * b, sz * (c - e)], [sx * (a - e), sy * (b - e), sz * c], sx, sy, sz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

// Lathe with optional chamfer: profile of [r, y] pairs.
export function lathe(profile, seg) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg || 24);
}
export function cylinder(r, h, seg, e) {
  e = e ?? Math.min(r * 0.12, h * 0.1);
  return lathe([[0, -h / 2], [r - e, -h / 2], [r, -h / 2 + e], [r, h / 2 - e], [r - e, h / 2], [0, h / 2]], seg || 20);
}
export function tubeBetween(a, b, r, seg) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg || 8, 1, true);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}
// Extruded 2D profile (THREE.Shape) along Z with bevel; centred on depth.
export function extrude(shape, depth, bevel, seg) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg ?? 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}
export function roundRect(w, h, r) {
  const s = new THREE.Shape(); const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export class Kit {
  constructor() { this.stack = [new THREE.Matrix4()]; this.batches = new Map(); this.colliders = []; this.loose = []; }
  get m() { return this.stack[this.stack.length - 1]; }
  push() { this.stack.push(this.m.clone()); return this; }
  pop() { this.stack.pop(); return this; }
  at(x, y, z, ry = 0, rx = 0, rz = 0) {
    const t = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
    this.m.multiply(t); return this;
  }
  scale(x, y, z) { this.m.multiply(new THREE.Matrix4().makeScale(x, y ?? x, z ?? x)); return this; }
  add(geo, matKey, local) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const M = local ? this.m.clone().multiply(local) : this.m;
    g.applyMatrix4(M);
    if (!this.batches.has(matKey)) this.batches.set(matKey, []);
    this.batches.get(matKey).push(g);
    return g;
  }
  // keeps all attributes (uv) and its own mesh: used for alpha-tested or textured pieces
  addLoose(geo, matKey) { const g = geo.clone(); g.applyMatrix4(this.m); this.loose.push([g, matKey]); return g; }
  box(w, h, d, mat, x = 0, y = 0, z = 0, e) {
    const g = chamferBox(w, h, d, e);
    g.translate(x, y, z);
    return this.add(g, mat);
  }
  cyl(r, h, mat, x = 0, y = 0, z = 0, seg, axis) {
    const g = cylinder(r, h, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(x, y, z); return this.add(g, mat);
  }
  tube(a, b, r, mat, seg) { return this.add(tubeBetween(a, b, r, seg), mat); }
  // world-space AABB collider from a local box under the current matrix
  collide(w, h, d, x = 0, y = 0, z = 0) {
    const box = new THREE.Box3();
    const hw = w / 2, hh = h / 2, hd = d / 2;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      _v.set(x + sx * hw, y + sy * hh, z + sz * hd).applyMatrix4(this.m); box.expandByPoint(_v);
    }
    this.colliders.push(box); return box;
  }
  build(materials, opts) {
    const group = new THREE.Group();
    for (const [key, list] of this.batches) {
      let count = 0; for (const g of list) count += g.getAttribute('position').count;
      const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3);
      let o = 0;
      for (const g of list) {
        pos.set(g.getAttribute('position').array, o * 3); nrm.set(g.getAttribute('normal').array, o * 3);
        o += g.getAttribute('position').count; g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const m = typeof materials === 'function' ? materials(key) : materials[key];
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = !(opts && opts.noShadow); mesh.receiveShadow = true;
      mesh.name = key;
      group.add(mesh);
    }
    for (const [g, key] of this.loose) {
      const m = typeof materials === 'function' ? materials(key) : materials[key];
      const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = false; group.add(mesh);
    }
    this.batches.clear(); this.loose = [];
    return group;
  }
}
