// Ground movement against the world's solid box colliders: a circle on the XZ plane, pushed out of every oriented box
// it overlaps. Only colliders whose node is currently shown block (a locked building's walls vanish when it opens).
import { apply } from './math.js';

const RADIUS = 0.45;

export class Mover {
  constructor(world) {
    this.world = world;
    // Grid of 8 m cells over the solids' centres for cheap lookups.
    this.cells = new Map();
    world.solids.forEach(s => {
      const m = s.box.middle;
      const r = Math.hypot(s.box.half.x * scaleOf(s.box.world, 0), s.box.half.z * scaleOf(s.box.world, 8));
      for (let x = Math.floor((m.x - r) / 8); x <= Math.floor((m.x + r) / 8); x++) {
        for (let z = Math.floor((m.z - r) / 8); z <= Math.floor((m.z + r) / 8); z++) {
          const k = `${x},${z}`;
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k).push(s);
        }
      }
    });
  }

  // Move p by (dx, dz) and resolve overlaps; `shown(node)` says whether a collider's node is currently visible.
  step(p, dx, dz, shown, r = RADIUS) {
    p.x += dx;
    p.z += dz;
    const list = this.cells.get(`${Math.floor(p.x / 8)},${Math.floor(p.z / 8)}`) || [];
    for (const s of list) {
      if (!shown(s.node)) continue;
      push(s.box, p, r);
    }
    return p;
  }
}

const scaleOf = (m, o) => Math.hypot(m[o], m[o + 1], m[o + 2]);

// Push a circle out of an oriented box (in the box's local frame, ignoring height).
function push(box, p, r) {
  const l = apply(box.inv, { x: p.x, y: 0, z: p.z });
  const sx = scaleOf(box.world, 0), sz = scaleOf(box.world, 8);
  const hx = box.half.x, hz = box.half.z;
  const cx = box.center.x, cz = box.center.z;
  // Work in world units along the box axes.
  const ux = (l.x - cx) * sx, uz = (l.z - cz) * sz;
  const ex = hx * sx, ez = hz * sz;
  const qx = Math.max(-ex, Math.min(ex, ux)), qz = Math.max(-ez, Math.min(ez, uz));
  let nx = ux - qx, nz = uz - qz;
  let d = Math.hypot(nx, nz);
  if (d >= r) return;
  if (d < 1e-6) {
    // Centre inside the box: leave through the nearest face.
    const px = ex - Math.abs(ux), pz = ez - Math.abs(uz);
    if (px < pz) { nx = Math.sign(ux) || 1; nz = 0; d = -px; } else { nx = 0; nz = Math.sign(uz) || 1; d = -pz; }
  } else {
    nx /= d; nz /= d;
  }
  const k = r - d;
  // Back to world: box local axes are the world matrix columns 0 and 2 (normalised).
  const ax = { x: box.world[0] / sx, z: box.world[2] / sx }, az = { x: box.world[8] / sz, z: box.world[10] / sz };
  p.x += (ax.x * nx + az.x * nz) * k;
  p.z += (ax.z * nx + az.z * nz) * k;
}
