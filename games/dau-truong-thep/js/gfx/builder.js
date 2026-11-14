// Mesh builder: primitives pushed through a matrix stack into one vertex batch per material name.
// build() returns one merged BufferGeometry per batch, so a whole ruin or mech part costs one draw call.
// UVs are world-scaled (1 unit = 1 m times uvScale) and box-projected, so baked textures tile evenly on any shape.

import * as THREE from '../../vendor/three.module.min.js';

const V = new THREE.Vector3(), N = new THREE.Vector3(), NM = new THREE.Matrix3(), T = new THREE.Matrix4();

export class Builder {
  constructor(uvScale = 0.5) {
    this.batches = {}; this.stack = [new THREE.Matrix4()]; this.uvScale = uvScale;
    this.color = new THREE.Color(1, 1, 1); this.mat = 'main';
  }
  get m() { return this.stack[this.stack.length - 1]; }
  push() { this.stack.push(this.m.clone()); return this; }
  pop() { this.stack.pop(); return this; }
  move(x, y, z) { this.m.multiply(T.makeTranslation(x, y, z)); return this; }
  rotY(a) { this.m.multiply(T.makeRotationY(a)); return this; }
  rotX(a) { this.m.multiply(T.makeRotationX(a)); return this; }
  rotZ(a) { this.m.multiply(T.makeRotationZ(a)); return this; }
  scale(x, y, z) { this.m.multiply(T.makeScale(x, y ?? x, z ?? x)); return this; }
  use(mat, color) { this.mat = mat; if (color !== undefined) this.color.set(color); return this; }
  tint(color) { this.color.set(color); return this; }
  // Per-vertex roughness and metalness multipliers, written as a `surf` attribute once any call sets them.
  surface(rough, metal) { this.surf = [rough, metal]; return this; }

  batch() { return this.batches[this.mat] || (this.batches[this.mat] = { p: [], n: [], u: [], c: [], s: [] }); }

  // Append a three.js geometry, transformed by the current matrix and tinted with the current colour (times its own vertex colours, if any).
  // shade: optional (localPos, localNormal) → brightness multiplier, for baked gradients such as darkening toward the ground.
  geo(g, shade) {
    const b = this.batch(), src = g.index ? g.toNonIndexed() : g;
    const pos = src.attributes.position, nor = src.attributes.normal, col = src.attributes.color;
    NM.getNormalMatrix(this.m);
    const s = this.uvScale;
    for (let i = 0; i < pos.count; i++) {
      V.fromBufferAttribute(pos, i);
      N.fromBufferAttribute(nor, i);
      const k = shade ? shade(V, N) : 1;
      V.applyMatrix4(this.m); N.applyMatrix3(NM).normalize();
      b.p.push(V.x, V.y, V.z); b.n.push(N.x, N.y, N.z);
      const ax = Math.abs(N.x), ay = Math.abs(N.y), az = Math.abs(N.z);
      if (ay >= ax && ay >= az) b.u.push(V.x * s, V.z * s); else if (ax >= az) b.u.push(V.z * s, V.y * s); else b.u.push(V.x * s, V.y * s);
      if (col) b.c.push(this.color.r * k * col.getX(i), this.color.g * k * col.getY(i), this.color.b * k * col.getZ(i));
      else b.c.push(this.color.r * k, this.color.g * k, this.color.b * k);
      if (this.surf) b.s.push(this.surf[0], this.surf[1]);
    }
    if (src !== g) src.dispose();
    return this;
  }
  box(w, h, d, shade) { const g = new THREE.BoxGeometry(w, h, d); this.geo(g, shade); g.dispose(); return this; }
  // n-gon prism or cone along Y. Faceted when it has 8 sides or fewer.
  cyl(rTop, rBot, h, sides = 12, shade) {
    let g = new THREE.CylinderGeometry(rTop, rBot, h, sides);
    if (sides <= 8) { const f = g.toNonIndexed(); f.computeVertexNormals(); g.dispose(); g = f; }
    this.geo(g, shade); g.dispose(); return this;
  }
  ball(r, detail = 1, sy = 1, shade) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    if (sy !== 1) g.scale(1, sy, 1);
    g.computeVertexNormals();
    this.geo(g, shade); g.dispose(); return this;
  }
  // Extruded polygon in the XZ plane (points as [x, z]), from y0 to y1. bevel > 0 chamfers every edge inside the outline.
  prism(pts, y0, y1, bevel = 0) {
    const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], -p[1])));
    const c = Math.min(bevel, (y1 - y0) * 0.45);
    const g = new THREE.ExtrudeGeometry(sh, c > 0
      ? { depth: y1 - y0 - 2 * c, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelOffset: -c, bevelSegments: 1 }
      : { depth: y1 - y0, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); g.translate(0, y0 + c, 0);
    this.geo(g); g.dispose(); return this;
  }
  // Box with every edge chamfered by c.
  chamfer(w, h, d, c = 0.05) {
    c = Math.min(c, w * 0.45, h * 0.45, d * 0.45);
    const sh = new THREE.Shape([new THREE.Vector2(-w / 2 + c, -h / 2 + c), new THREE.Vector2(w / 2 - c, -h / 2 + c), new THREE.Vector2(w / 2 - c, h / 2 - c), new THREE.Vector2(-w / 2 + c, h / 2 - c)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * c, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelSegments: 1 });
    g.translate(0, 0, -(d - 2 * c) / 2);
    this.geo(g); g.dispose(); return this;
  }
  // Surface of revolution around Y. profile: [[radius, y], ...] from bottom to top.
  lathe(profile, sides = 12) {
    const g = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), sides);
    const f = g.toNonIndexed(); f.computeVertexNormals(); g.dispose();
    this.geo(f); f.dispose(); return this;
  }
  // Cylinder of radius r from point a to point b ([x, y, z] in the current frame).
  rod(a, b, r, sides = 6, r2 = r) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz) || 1e-4;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    this.push(); this.m.multiply(T.compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1)));
    this.cyl(r2, r, len, sides); return this.pop();
  }
  // Smooth tube through points ([x, y, z]), for cables and hoses.
  tube(pts, r, sides = 5, segs = 8) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const g = new THREE.TubeGeometry(curve, segs, r, sides, false);
    this.geo(g); g.dispose(); return this;
  }

  build() {
    const out = {};
    for (const k in this.batches) {
      const b = this.batches[k], g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      if (b.s.length && b.s.length === b.p.length / 3 * 2) g.setAttribute('surf', new THREE.Float32BufferAttribute(b.s, 2));
      g.computeBoundingSphere();
      out[k] = g;
    }
    return out;
  }
}
