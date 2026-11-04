// FurniturePlaceHelper.CanPlace in 2D: every floor detector of the prefab (RaycastDetector, cast down, targetLayer
// StoreFloor 512 for shelves / StorageFloor 1024 for storage racks) must be over a floor triangle of that layer
// (art/store/colliders.json "floors"), and the BoundingBoxDetector box must overlap no collider: placed furniture,
// active scene BoxColliders (e.g. the walls of the current expansion) and wall/building MeshColliders ("segs").
const CELL = 0.1;

export class Placer {
  constructor(col) {
    this.col = col;
    this.x0 = -40; this.z0 = -60; this.w = 800; this.h = 1200;
    this.floor = new Uint8Array(this.w * this.h);   // bit 1: layer 9 (StoreFloor), bit 2: layer 10 (StorageFloor)
    for (const f of col.floors || []) this.tri(f[0] === 9 ? 1 : 2, f[1], f[2], f[3], f[4], f[5], f[6]);
  }
  tri(bit, ax, az, bx, bz, cx, cz) {
    const minx = Math.min(ax, bx, cx), maxx = Math.max(ax, bx, cx), minz = Math.min(az, bz, cz), maxz = Math.max(az, bz, cz);
    for (let z = Math.floor((minz - this.z0) / CELL); z <= Math.ceil((maxz - this.z0) / CELL); z++) {
      for (let x = Math.floor((minx - this.x0) / CELL); x <= Math.ceil((maxx - this.x0) / CELL); x++) {
        if (x < 0 || z < 0 || x >= this.w || z >= this.h) continue;
        const px = this.x0 + (x + 0.5) * CELL, pz = this.z0 + (z + 0.5) * CELL;
        if (inTri(px, pz, ax, az, bx, bz, cx, cz)) this.floor[z * this.w + x] |= bit;
      }
    }
  }
  onFloor(x, z, bit) {
    const gx = Math.floor((x - this.x0) / CELL), gz = Math.floor((z - this.z0) / CELL);
    return gx >= 0 && gz >= 0 && gx < this.w && gz < this.h && (this.floor[gz * this.w + gx] & bit) !== 0;
  }
  // lay = layout entry (detectors, bound, floorMask); others = [{c:[x,z], size:[sx,sz], yaw}] solid boxes
  canPlace(lay, x, z, yaw, others) {
    const bit = lay.floorMask === 1024 ? 2 : 1;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const w = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
    for (const d of lay.detectors || []) { const [px, pz] = w(d[0], d[2]); if (!this.onFloor(px, pz, bit)) return false; }
    if (!lay.bound) return true;
    const [bx, bz] = w(lay.bound.c[0], lay.bound.c[2]);
    const box = { c: [bx, bz], size: [lay.bound.size[0], lay.bound.size[2]], yaw };
    for (const o of others) if (obbOverlap(box, o)) return false;
    for (const sg of this.col.segs) if (segHitsBox(sg, box)) return false;
    return true;
  }
}

function inTri(px, pz, ax, az, bx, bz, cx, cz) {
  const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
  const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz);
  const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function corners(b) {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), hx = b.size[0] / 2, hz = b.size[1] / 2;
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([lx, lz]) => [b.c[0] + c * lx + s * lz, b.c[1] - s * lx + c * lz]);
}

// separating axis test of two oriented rectangles
export function obbOverlap(a, b) {
  const A = corners(a), B = corners(b);
  for (const P of [A, B]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = P[i], [x2, z2] = P[(i + 1) % 4];
      const nx = z2 - z1, nz = x1 - x2;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const [x, z] of A) { const v = x * nx + z * nz; amin = Math.min(amin, v); amax = Math.max(amax, v); }
      for (const [x, z] of B) { const v = x * nx + z * nz; bmin = Math.min(bmin, v); bmax = Math.max(bmax, v); }
      if (amax <= bmin + 1e-6 || bmax <= amin + 1e-6) return false;
    }
  }
  return true;
}

function segHitsBox(sg, b) {
  // segment in the box's local frame against the axis-aligned half extents
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  const loc = (x, z) => { const dx = x - b.c[0], dz = z - b.c[1]; return [c * dx - s * dz, s * dx + c * dz]; };
  const [x1, z1] = loc(sg[0], sg[1]), [x2, z2] = loc(sg[2], sg[3]);
  const hx = b.size[0] / 2, hz = b.size[1] / 2;
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dz = z2 - z1;
  for (const [p, q] of [[-dx, x1 + hx], [dx, hx - x1], [-dz, z1 + hz], [dz, hz - z1]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
