// Minimal affine math for the simulation (no THREE): column-major 4x4 like three.js, world transforms of scene nodes,
// and box-collider containment on the ground plane.

export function compose(t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

export function multiply(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export function invertAffine(m) {
  const [a, b, c, , d, e, f, , g, h, i] = m;
  const det = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
  const id = 1 / det;
  const r = [
    (e * i - f * h) * id, (c * h - b * i) * id, (b * f - c * e) * id, 0,
    (f * g - d * i) * id, (a * i - c * g) * id, (c * d - a * f) * id, 0,
    (d * h - e * g) * id, (b * g - a * h) * id, (a * e - b * d) * id, 0,
    0, 0, 0, 1,
  ];
  const tx = m[12], ty = m[13], tz = m[14];
  r[12] = -(r[0] * tx + r[4] * ty + r[8] * tz);
  r[13] = -(r[1] * tx + r[5] * ty + r[9] * tz);
  r[14] = -(r[2] * tx + r[6] * ty + r[10] * tz);
  return r;
}

export function apply(m, p) {
  return {
    x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
  };
}

export const position = m => ({ x: m[12], y: m[13], z: m[14] });

export function dist2xz(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}

// World matrices of every scene node, computed once (nodes are listed parent-first by the exporter).
export function worldMatrices(nodes) {
  const out = new Array(nodes.length);
  nodes.forEach((n, i) => {
    const local = compose(n.t, n.r, n.s);
    out[i] = n.p >= 0 ? multiply(out[n.p], local) : local;
  });
  return out;
}

// A BoxCollider as an oriented box; `contains` ignores height, like the original top-down trigger use.
export class Box {
  constructor(world, collider) {
    const c = collider.m_Center, s = collider.m_Size;
    this.inv = invertAffine(world);
    this.center = { x: c.x, y: c.y, z: -c.z };
    this.half = { x: Math.abs(s.x) / 2, y: Math.abs(s.y) / 2, z: Math.abs(s.z) / 2 };
    this.world = world;
  }

  // `r` widens the box by a circle's radius (approximately: box-vs-box) so a capsule trigger touching the edge counts.
  contains(p, r = 0) {
    const l = apply(this.inv, p);
    const sx = Math.hypot(this.inv[0], this.inv[1], this.inv[2]), sz = Math.hypot(this.inv[8], this.inv[9], this.inv[10]);
    return Math.abs(l.x - this.center.x) <= this.half.x + r * sx && Math.abs(l.z - this.center.z) <= this.half.z + r * sz;
  }

  get middle() {
    return apply(this.world, this.center);
  }
}
