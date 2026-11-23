// Maze: small rooms on one level in a labyrinth. Every pad is ringed by a hedge (a stone wall where the world has no
// green) along its far and side rims, open where a corridor or a spawn gate is; nothing stands on the near rim. The rooms
// are joined by short walled corridors (a stone causeway with knee-high walls and a lantern at each end). Around the rooms,
// out to the frame's edges, the labyrinth's other walls rise out of the water or the mist on a three-metre grid, their tops
// at knee height: the pad reads as one room of a maze seen from above. Rooms the team only crosses are plain rooms too.
import { outerAt, takenDirs, isOpen, bakeBoxes, deckRule, DECK, FLAME } from './shared.js?v=20261122a';
import { LIGHTS } from '../themes.js?v=20261122a';

const DIRS4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const GRID = 3;          // metres between the labyrinth's wall lines (in the stage's frame, so neighbouring rooms share them)
const LOW = 0.55;        // tops of the corridor walls and the labyrinth around (above the floor)
const green = (th) => th.name === 'forest' || th.name === 'swamp';
const wallTiles = (th) => (green(th) ? { side: 'leaves_dark', top: 'leaves_dark' } : { side: th.side.rows[0][0], top: (th.edge[0] || [th.side.rows[0][0]])[0] });
const baseOf = (th) => (th.abyss.type === 'water' ? th.abyss.y - 0.6 : -8);

// a walled corridor from a to b (level: every maze room is on one floor)
function corridor(a, b, th, { width = 2.4 } = {}) {
  const dx = b.x - a.x; const dz = b.z - a.z; const L = Math.hypot(dx, dz); const ux = dx / L; const uz = dz / L; const rot = -Math.atan2(dz, dx);
  const rule = deckRule(a, b, L, false); const base = baseOf(th); const W = wallTiles(th); const HW = width / 2 + 0.25;
  const tL = LIGHTS.torch; const lights = [];
  for (const k of [0.35, L - 0.35]) { const t = k / L; lights.push({ kind: 'torch', x: a.x + dx * t - uz * HW, y: a.y + 0.95, z: a.z + dz * t + ux * HW, ground: a.y, color: tL.color, r: tL.r, k: tL.k * 0.9, warm: 1, glow: tL.glow * 0.8 }); }
  return {
    a, b, lights, dir: [ux, uz], theme: th.name, deckY: rule.deckY,
    emit(M) {
      // the causeway: paving on a solid wall of stone down into the water or the mist, one box (every maze room is on one
      // level), a low wall along each side
      const x = a.x + dx / 2; const z = a.z + dz / 2; const y = a.y + DECK;
      M.box(x, base, z, L, y - base, width, rot, { side: th.side.rows[0][0], top: 'stone' }, [0.74, 0.72, 0.7]);
      for (const side of [-1, 1]) M.box(x - uz * side * HW, base, z + ux * side * HW, L, y + LOW - base + side * 0.01, 0.5, rot, W, green(th) ? [0.8, 0.95, 0.8] : [0.8, 0.78, 0.76]);
      for (const Lt of lights) { M.box(Lt.x, Lt.y - 0.42, Lt.z, 0.14, 0.4, 0.14, 0, { side: 'log' }, [0.6, 0.5, 0.42]); M.box(Lt.x, Lt.y - 0.04, Lt.z, 0.2, 0.18, 0.2, 0, { side: 'flame' }, FLAME, true); }
    },
  };
}

export const MAZE = {
  gap: 3.2, sats: false, linkClear: 0.2,
  yRange: () => [0, 0],
  abyss: (th) => th.abyss,
  raft: null,
  bridge: corridor,
  extras({ room, plan, main, theme: th, cen, at, avoid }) {
    const dirs = takenDirs(plan, room); const base = baseOf(th); const W = wallTiles(th); const boxes = []; const B = (...a) => boxes.push(a);
    const tint = green(th) ? [0.78, 0.95, 0.8] : [0.8, 0.78, 0.76];
    // the hedge round the room: tall behind the fight (it never stands between the camera and a unit), knee high on the flanks
    // the hedge stands on the pad's own outermost blocks (a cube per block, on the block grid: neighbours meet face to face,
    // nothing overlaps), tall behind the fight, lower on the flanks, none on the near rim
    for (const cl of main.cells.values()) {
      if (DIRS4.every(([a, b]) => main.cells.has(cl.i + a + ',' + (cl.j + b)))) continue;
      const x = (cl.i - cl.j) * Math.SQRT1_2; const z = (cl.i + cl.j + 1) * Math.SQRT1_2; const a = Math.atan2(z, x); const s = Math.sin(a);
      if (s >= 0.3 || !isOpen(dirs, a) || Math.hypot(x / main.ellipse.x, z / main.ellipse.z) < 1.15) continue;
      const h = s < -0.35 ? 1.3 : s < 0.1 ? LOW + 0.2 : LOW;
      B(x, cl.top, z, 1, h, 1, Math.PI / 4, W, tint);
    }
    // the labyrinth around: wall lines of the stage's grid, each edge walled or not by a hash of where it is; only in the
    // part of the map nearest this room (the next room draws its own part), off the pads and clear of the corridors
    const R = plan.rooms.length; const others = []; for (let j = -1; j < R; j++) if (j !== room.i) others.push(cen(j));
    const mine = (x, z) => others.every((o) => Math.hypot(x - o.x, z - o.z) > Math.hypot(x, z));
    const hash = (i, j, k) => { let h = Math.imul(i * 73856093 ^ j * 19349663 ^ k * 83492791, 0x9e3779b1); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
    const free = (x, z) => !avoid(x, z) && !avoid(x + 1, z) && !avoid(x - 1, z) && !avoid(x, z + 1) && !avoid(x, z - 1);
    const gx0 = Math.floor((at.x - 24) / GRID); const gx1 = Math.ceil((at.x + 24) / GRID); const gz0 = Math.floor((at.z - 18) / GRID); const gz1 = Math.ceil((at.z + 14) / GRID);
    // walls run between posts at the grid points: a wall's ends lie inside its posts and every post stands a little higher
    // than its walls, so no two faces share a plane
    const posts = new Map(); const dk = [tint[0] * 0.85, tint[1] * 0.85, tint[2] * 0.85];
    for (let gi = gx0; gi <= gx1; gi++) for (let gj = gz0; gj <= gz1; gj++) for (const k of [0, 1]) {
      if (hash(gi, gj, k) < 0.42) continue;
      // edge k = 0 runs along x from grid point (gi, gj), k = 1 along z; in this room's frame
      const x = gi * GRID - at.x + (k ? 0 : GRID / 2); const z = gj * GRID - at.z + (k ? GRID / 2 : 0);
      if (!mine(x, z) || !free(x, z)) continue;
      const top = LOW - 0.15 - hash(gi, gj, 7) * 0.45;
      B(x, base, z, k ? 0.7 : GRID - 0.8, top - base, k ? GRID - 0.8 : 0.7, 0, W, dk);
      for (const [pi, pj] of k ? [[gi, gj], [gi, gj + 1]] : [[gi, gj], [gi + 1, gj]]) { const key = pi + ',' + pj; posts.set(key, Math.max(posts.get(key) || -9, top + 0.1)); }
    }
    for (const [key, top] of posts) { const [pi, pj] = key.split(',').map(Number); if (!mine(pi * GRID - at.x, pj * GRID - at.z)) continue; B(pi * GRID - at.x, base - 0.03, pj * GRID - at.z, 0.9, top - base + 0.03, 0.9, 0, W, dk); }
    return { lights: [], build(all) { return [bakeBoxes(boxes, th, all, 'maze')]; } };
  },
};
