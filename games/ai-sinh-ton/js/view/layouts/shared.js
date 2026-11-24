// Small helpers the layout pieces share: how far a pad's blocks reach along a direction, and which directions around a pad
// are taken by its links and spawn gates (nothing may stand there).
import { mesher, voxMaterial } from '../pad.js?v=20261124b';
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
// boxes ([x, y, z, sx, sy, sz, rot, tiles, tint, emissive], the mesher's box arguments) baked into one mesh of the section
export function bakeBoxes(boxes, th, lights, name, mat) {
  const M = mesher(); for (const b of boxes) M.box(...b);
  const m = M.bake(th, lights, mat || voxMaterial(), null); m.name = name; m.matrixAutoUpdate = true; return m;
}
// the deck height of a link at distance t along it, the plank bridge's rule (pad.js buildBridge): treads in equal risers
// (steps) or a slope of half-metre planks; DECK above the line so the ends clear the pad floors
export const DECK = 0.03;
export function deckRule(a, b, L, steps) {
  const n = steps ? Math.max(2, Math.round(Math.abs(b.y - a.y) / 0.25)) : Math.ceil(L / 0.5);
  const yAt = (f) => (steps ? a.y + (b.y - a.y) * ((f + (b.y > a.y ? 1 : 0)) / n) : a.y + (b.y - a.y) * (f + 0.5) / n);
  return { n, yAt, deckY: (t) => DECK + yAt(Math.max(0, Math.min(n - 1, Math.floor((t / L) * n)))) };
}
