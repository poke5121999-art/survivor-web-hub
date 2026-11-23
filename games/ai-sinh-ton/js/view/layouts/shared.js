// Small helpers the layout pieces share: how far a pad's blocks reach along a direction, and which directions around a pad
// are taken by its links and spawn gates (nothing may stand there).
export const FLAME = [2.4, 1.35, 0.5];
export function outerAt(main, a) { let last = 0; for (let s = 0; s < 34; s += 0.25) if (main.cellAt(Math.cos(a) * s, Math.sin(a) * s)) last = s; return last; }
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// directions (radians) that must stay open around room `room` of plan `plan`, each with its half width
export function takenDirs(plan, room) {
  const out = [];
  if (room.entry !== null && room.entry !== undefined) out.push([room.entry, 0.5]);
  if (room.exit !== null && room.exit !== undefined) out.push([room.exit, 0.5]);
  for (const g of room.gates) out.push([Math.atan2(g.z, g.x), g.low ? 0.22 : 0.38]);
  return out;
}
export const isOpen = (dirs, a) => dirs.every(([d, w]) => Math.abs(wrap(a - d)) > w);
