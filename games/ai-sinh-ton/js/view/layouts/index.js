// The view's half of each map layout (rooms.js has the sim's half): how far apart the pads stand, the heights they may take,
// whether the pads have satellite islets, the abyss override, the raft, and the pieces built around each pad (extras).
//   gap        metres of void between two pads at their widest
//   yRange     [min, max] pad height for a water (true) or a mist abyss
//   sats       satellite islets at the frame's corners (world.js SATS)
//   abyss(th)  the abyss to draw instead of the theme's, or the theme's
//   extras(c)  null or { lights, build(allLights) -> meshes } for pad c.i (c: { i, room, plan, main, theme, rng, cen, R })
import { BRIDGES } from './bridges.js?v=20261122a';
import { ARENA_RING } from './arena.js?v=20261122a';
import { SPIRAL } from './spiral.js?v=20261122a';
import { RIVER, RAFT_Y } from './river.js?v=20261122a';
export { RAFT_Y };
export const LAYOUTS = { bridges: BRIDGES, arena: ARENA_RING, spiral: SPIRAL, river: RIVER };
