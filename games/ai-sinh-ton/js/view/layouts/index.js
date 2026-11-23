// The view's half of each map layout (rooms.js has the sim's half): how far apart the pads stand, the heights they may take,
// whether the pads have satellite islets, the abyss override, the raft, and the pieces built around each pad (extras).
//   gap        metres of void between two pads at their widest
//   yRange     [min, max] pad height for a water (true) or a mist abyss
//   sats       satellite islets at the frame's corners (world.js SATS); satBridges false: no plank bridge out to them
//   bob        the satellites bob up and down this many metres (the fight pad never moves)
//   abyss(th)  the abyss to draw instead of the theme's, or the theme's
//   theme(th)  optional: the theme the stage is drawn with instead (the cave dims it)
//   lantern    optional { color, r }: a floor pool of light that follows the team
//   bossDown   the boss pad steps down from the last, not up
//   linkClear  radians: props kept off a wider wedge round each link (the maze)
//   pitGlow    false: the lights' warm spill is not drawn on the abyss
//   extras(c)  null or { lights, build(allLights) -> meshes } for pad c.i (c: { i, room, plan, main, theme, rng, cen, at, R,
//              avoid, walk }: cen(j) is pad j's centre in this pad's frame, at this pad's in the stage's, avoid(x, z) true
//              near any pad or link)
//   links: raft(a, b, th) for 'raft', cart(a, b, th) for 'rail' (a ride: { mesh, path, carry, deckY, emit?, speed, maxT }),
//              bridge(a, b, th, opts) for 'bridge' and 'stairs' instead of the plank bridge (pad.js buildBridge)
//   tick(time) optional: every frame
import { BRIDGES } from './bridges.js?v=20261122a';
import { ARENA_RING } from './arena.js?v=20261122a';
import { SPIRAL } from './spiral.js?v=20261122a';
import { RIVER, RAFT_Y } from './river.js?v=20261122a';
import { ISLANDS } from './islands.js?v=20261122a';
import { MAZE } from './maze.js?v=20261122a';
import { RAIL } from './rail.js?v=20261122a';
import { CAVE } from './cave.js?v=20261122a';
export { RAFT_Y };
export const LAYOUTS = { bridges: BRIDGES, arena: ARENA_RING, spiral: SPIRAL, river: RIVER, islands: ISLANDS, maze: MAZE, rail: RAIL, cave: CAVE };
