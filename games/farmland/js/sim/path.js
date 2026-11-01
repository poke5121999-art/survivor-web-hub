// Parcel-graph paths (Parcel.FindPathTo connects open parcels): BFS from the parcel under (x, z) to `to`, through open
// parcels only (plus `to` itself), returned as parcel-centre waypoints.
export function route(farm, x, z, to) {
  const start = farm.parcelAt(x, z);
  if (!start || !to) return null;
  const prev = new Map([[start.i, -1]]);
  const queue = [start];
  while (queue.length) {
    const p = queue.shift();
    if (p === to) break;
    for (const n of p.d.nb) {
      if (n < 0 || prev.has(n)) continue;
      const q = farm.parcels[n];
      if (q !== to && !q.open) continue;
      prev.set(n, p.i);
      queue.push(q);
    }
  }
  if (!prev.has(to.i)) return null;
  const out = [];
  for (let i = to.i; i !== -1 && i !== start.i; i = prev.get(i)) out.unshift({ x: farm.parcels[i].d.pos[0], z: farm.parcels[i].d.pos[2] });
  return out;
}

// Spot 1.2 from a field cell on the field-centre side: always open ground, and a tool box 1.2 ahead covers the cell.
export function standFor(field, cell, from) {
  let ax = cell.x - field.d.pos[0], az = cell.z - field.d.pos[2];
  if (Math.hypot(ax, az) < 0.1) { ax = cell.x - from.x; az = cell.z - from.z; }
  const l = Math.hypot(ax, az) || 1;
  return { x: cell.x - ax / l * 1.2, z: cell.z - az / l * 1.2 };
}
