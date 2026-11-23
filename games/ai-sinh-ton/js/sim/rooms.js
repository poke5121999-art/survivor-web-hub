// The map of a stage as the sim and the view both need it, worked out from the stage number alone (no DOM, no three.js, no
// battle state), so the same stage always has the same map.
//   layout    the shape of the map (LAYOUT_KINDS): bridges, arena, spiral, river, islands, maze, rail, cave
//   biome     the world it stands in (stages.js CHAPTERS); the view picks the theme
//   rooms[i]  the pads in walking order, 1 to 6 of them: entry and exit directions, spawn gates at the frame's corners, camps,
//             where the team stands when it comes in (home), and `pass` for a room the team only crosses
//   waveRoom  the room each of the five waves is fought in (never decreasing; the boss wave in the last room)
//   links     what joins room `from` to room `to` (from -1 is the start room): bridge, stairs, raft, rail, collapse
//   hazards   map rules the sim applies while a wave is fought in that room (maprules.js): poison, wind, current, collapse
//   mode      null or the stage's special rule (maprules.js MODES): defend, survive, chase
//   exits[i]  the direction (radians) of the link from room i to room i + 1; rises[i] its height step before the view clamps it
//   start     the direction from room 0 to the start room, where the team stands before the first fight
// A gate is a point of the arena rim (the sim's ellipse, param angle `t`, at SPAWN rim) where monsters walk in; `main` is the
// big one (the boss's on the last pad); a `low` gate lies in the floor. A camp is a spot inside the pad where the first pack of
// the wave already stands when the team arrives. Directions use the sim's frame: x across the screen, z toward the camera
// (far is z < 0); every room is the same ellipse in its own frame.
//
// In the bridges layout the draws come in the same order as before layouts existed, so those stages keep their maps.
import { CHAPTERS, chapterOf } from '../data/stages.js?v=20261122a';

export function rngOf(seed) {
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (a, b) => a + (b - a) * next(), int: (a, b) => a + Math.floor(next() * (b - a + 1)), chance: (p) => next() < p };
}

export const WAVES = 5;
export const LAYOUT_KINDS = ['bridges', 'arena', 'spiral', 'river', 'islands', 'maze', 'rail', 'cave'];
// The campaign's layouts, one letter per stage, a chapter per group: B bridges, A arena, S spiral, R river, I islands, M maze,
// T rail (a train), C cave. Every chapter takes five different kinds and two stages in a row never share one (tools/layout-test.mjs
// goes red otherwise). Stages 3, 8, 15 and 20 keep the bridges: horde-test measures the crowd there against its baseline
// (Addendum 6) and sim-test freezes stage 20; a single-seed peak on another layout differs by the luck of the fight.
const TABLE = 'ARBIM CSBTA RIMCB TASRB CMISA RTBCI SRAMT CTBIR ISMAC BRTSM'.replace(/ /g, '');
const LETTER = { B: 'bridges', A: 'arena', S: 'spiral', R: 'river', I: 'islands', M: 'maze', T: 'rail', C: 'cave' };
const ENDLESS_CYCLE = 'RSABIMTC';
export function layoutOf(n) {
  n = n | 0 || 1;
  return LETTER[n <= TABLE.length ? TABLE[n - 1] : ENDLESS_CYCLE[(n - TABLE.length - 1) % ENDLESS_CYCLE.length]];
}
// The special stages (maprules.js MODES): one per chapter, never the chapter's last stage nor a stage the tools measure (3, 8,
// 15, 20), so the fourth stage of chapters 1, 3, 5 ... and the second of chapters 2, 4 ...; defend, survive, chase in turn.
export const MODE_KINDS = ['defend', 'survive', 'chase'];
export function modeOf(n) {
  n = n | 0 || 1; if (n > TABLE.length) return null;
  const c = Math.floor((n - 1) / 5); const at = c % 2 === 0 ? 4 : 2;
  return (n - 1) % 5 + 1 === at ? MODE_KINDS[c % 3] : null;
}

const GATE_CLEAR = 3.6;   // metres between a gate and the line of any link leaving the pad (corridor half width + gate half width)
const GATE_K = 1.04;      // gates sit on the spawn rim (battle.js SPAWN_K)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const cache = new Map();

// Per layout: how many rooms, which of them the team only crosses, and the links between them (direction, rise, kind).
// rl is the layout's own generator, so the bridges layout draws nothing from it.
const SHAPES = {
  bridges: {
    rooms: () => 5, pass: () => [],
    links(rng) {
      let side = rng.chance(0.5) ? 1 : -1; const out = [];
      for (let i = 1; i < 5; i++) {
        const a = side * rng.range(0.3, 0.52); side = rng.chance(0.75) ? -side : side;
        const dy = (rng.chance(0.5) ? 1 : -1) * rng.int(1, 3);
        out.push({ a, dy, kind: 'bridge' });
      }
      return out;
    },
  },
  // one round arena, every wave in the same place
  arena: { rooms: () => 1, pass: () => [], links: () => [] },
  // a switchback climb up a mountain flank to the summit: every link goes up and away (toward the top of the screen), turning
  // left and right in turn; with six rooms one ledge on the way is only crossed
  spiral: {
    rooms: (rl) => rl.int(4, 6), pass: (R) => (R === 6 ? [3] : []),
    links(rng, R, rl) {
      let side = rl.chance(0.5) ? 1 : -1; const out = [];
      for (let i = 1; i < R; i++) { out.push({ a: -Math.PI / 2 + side * rl.range(0.62, 0.9), dy: rl.int(2, 3), kind: 'stairs' }); side = -side; }
      return out;
    },
  },
  // across a river: the banks and an islet in the stream at water level, joined by a raft or by a bridge that falls once crossed
  river: {
    rooms: (rl) => rl.int(4, 5), pass: (R) => (R === 4 ? [1] : [2]),
    links(rng, R, rl) {
      const out = [];
      for (let i = 1; i < R; i++) out.push({ a: rl.range(-0.32, 0.22), dy: 0, kind: i % 2 ? 'raft' : 'collapse' });
      return out;
    },
  },
  // floating islands over the sky, each a little higher or lower, joined by bridges of light; the walk winds sideways and away
  islands: {
    rooms: (rl) => rl.int(3, 5), pass: (R) => (R === 5 ? [2] : []),
    links(rng, R, rl) {
      let side = rl.chance(0.5) ? 1 : -1; const out = [];
      for (let i = 1; i < R; i++) { out.push({ a: -Math.PI / 2 + side * rl.range(0.8, 1.15), dy: (rl.chance(0.5) ? 1 : -1) * rl.int(1, 3), kind: 'bridge' }); side = -side; }
      return out;
    },
  },
  // a short maze: many small rooms on one level, the corridors turning away and to the sides; every other room is only crossed
  maze: {
    rooms: (rl) => rl.int(5, 6), pass: (R) => (R === 6 ? [1, 3] : [2]),
    links(rng, R, rl) {
      let side = rl.chance(0.5) ? 1 : -1; const out = [];
      for (let i = 1; i < R; i++) {
        const a = i % 2 ? (side > 0 ? -0.42 : -Math.PI + 0.42) + rl.range(-0.06, 0.06) : -Math.PI / 2 + rl.range(-0.12, 0.12);
        if (i % 2 === 0) side = -side;
        out.push({ a, dy: 0, kind: 'bridge' });
      }
      return out;
    },
  },
  // a railway: the team rides a cart along one line from station to station, always the same way
  rail: {
    rooms: (rl) => rl.int(3, 5), pass: (R) => (R === 5 ? [2] : []),
    links(rng, R, rl) {
      const a0 = rl.chance(0.5) ? -0.4 : -Math.PI + 0.4; const out = [];
      for (let i = 1; i < R; i++) out.push({ a: a0 + rl.range(-0.08, 0.08), dy: 0, kind: 'rail' });
      return out;
    },
  },
  // a dark cave going down: chambers joined by rock stairs, left and right in turn
  cave: {
    rooms: (rl) => rl.int(3, 5), pass: (R) => (R === 5 ? [1] : []),
    links(rng, R, rl) {
      let side = rl.chance(0.5) ? 1 : -1; const out = [];
      for (let i = 1; i < R; i++) { out.push({ a: side * rl.range(0.32, 0.55), dy: -rl.int(1, 2), kind: 'stairs' }); side = rl.chance(0.7) ? -side : side; }
      return out;
    },
  },
};

// the waves over the rooms: the boss wave in the last room, waves 1-4 spread in order over the other rooms the team fights in
function spreadWaves(R, pass) {
  const fight = []; for (let i = 0; i < R - 1; i++) if (!pass.includes(i)) fight.push(i);
  const last = R - 1; const m = fight.length;
  const out = []; for (let w = 0; w < WAVES - 1; w++) out.push(m ? fight[Math.floor((w * m) / (WAVES - 1))] : last);
  out.push(last); return out;
}

// Hazards per layout and biome, placed clear of where the team comes in, the camps and the gates. Units: metres in the room's
// frame; r is a radius (poison, collapse) or a half width (current, a band across the pad).
function placeHazards(plan, A, rh) {
  const out = []; const { layout, biome, rooms, waveRoom } = plan;
  const fought = [...new Set(waveRoom)];
  const clearOf = (room, x, z, r) => {
    if (Math.hypot(x / A.x, z / A.z) > 0.8) return false;
    if (Math.hypot(x - room.home.x, z - room.home.z) < r + 2.6) return false;
    for (const c of room.camps) if (Math.hypot(x - c.x, z - c.z) < r + 2.2) return false;
    for (const g of room.gates) if (Math.hypot(x - g.x, z - g.z) < r + 3) return false;
    return out.every((h) => h.room !== room.i || h.kind === 'wind' || h.kind === 'current' || Math.hypot(x - h.x, z - h.z) > r + h.r + 1.5);
  };
  const spot = (room, r, tries = 40) => { for (let k = 0; k < tries; k++) { const a = rh.range(0, 6.283); const q = rh.range(0.25, 0.75); const x = Math.cos(a) * A.x * q; const z = Math.sin(a) * A.z * q; if (clearOf(room, x, z, r)) return { x, z }; } return null; };
  if (layout === 'arena') for (let k = 0; k < 2; k++) { const p = spot(rooms[0], 1.5); if (p) out.push({ room: 0, kind: 'poison', ...p, r: 1.5, dps: 0.02 }); }
  if (biome === 'swamp' && layout !== 'arena') for (const i of fought) { const p = spot(rooms[i], 1.0); if (p) out.push({ room: i, kind: 'poison', ...p, r: 1.0, dps: 0.02 }); }
  if (layout === 'spiral' || layout === 'islands') for (const i of fought) {
    if (i === 0) continue;
    // a gust across the whole pad every few seconds, from the open side of the mountain (left or right)
    const ang = rh.chance(0.5) ? 0 : Math.PI;
    out.push({ room: i, kind: 'wind', x: 0, z: 0, r: A.x * 1.1, ang, every: rh.range(7, 9), warn: 1.6, on: 2.4, off: rh.range(1, 4), push: 2.2 });
  }
  // the lava under a volcano's floors breaks through once in each room past the first: cracks glow, then a hole
  if (biome === 'volcano' && layout !== 'river') for (const i of fought) {
    if (i === 0 && fought.length > 1) continue; const p = spot(rooms[i], 1.5); if (p) out.push({ room: i, kind: 'collapse', ...p, r: 1.5, at: rh.range(9, 14), warn: 2.5, hit: 0.08 });
  }
  if (layout === 'river') for (const i of fought) {
    // a ford of the stream across the pad: shallow water that slows whoever wades it and drifts them downstream
    const z = rh.range(-1.2, 1.4); out.push({ room: i, kind: 'current', x: 0, z, r: 1.1, ang: 0, slow: 0.35, drift: 0.7 });
    const link = plan.links.find((l) => l.to === i);
    if (link && link.kind === 'collapse') {
      // the bank the fallen bridge landed on gives way part of the way through the first fight there
      const e = rooms[i].entry; const side = rh.chance(0.5) ? 1 : -1; const x = Math.cos(e) * A.x * 0.55 - Math.sin(e) * 2.6 * side; const zz = Math.sin(e) * A.z * 0.55 + Math.cos(e) * 2.6 * side;
      out.push({ room: i, kind: 'collapse', x, z: zz, r: 1.6, at: rh.range(8, 12), warn: 2.5, hit: 0.08 });
    }
  }
  return out;
}

// A: the sim's arena ellipse {x, z}
export function roomPlan(n, A) {
  n = n | 0 || 1; const key = n + ':' + A.x + ':' + A.z; if (cache.has(key)) return cache.get(key);
  const layout = layoutOf(n); const biome = CHAPTERS[chapterOf(n)].biome; const shape = SHAPES[layout];
  const rng = rngOf(n * 977 + 13); const rl = rngOf(n * 977 + 41);
  const R = shape.rooms(rl); const pass = shape.pass(R);
  const linkDraws = shape.links(rng, R, rl);
  const exits = linkDraws.map((l) => l.a); const rises = linkDraws.map((l) => l.dy);
  const waveRoom = spreadWaves(R, pass);
  const wavesIn = (i) => waveRoom.filter((r) => r === i).length;
  const r2 = rngOf(n * 977 + 29);
  // the start room lies behind room 0, away from the first link (or anywhere toward the near flanks in a one-room map)
  const start = R > 1 ? wrap(exits[0] + Math.PI + r2.range(-0.3, 0.3)) : (r2.chance(0.5) ? 0 : Math.PI) + r2.range(-0.25, 0.25);
  const startRise = r2.int(-1, 1);
  const rim = (t, k) => ({ x: Math.cos(t) * A.x * k, z: Math.sin(t) * A.z * k });
  const rooms = [];
  for (let i = 0; i < R; i++) {
    const boss = i === R - 1; const isPass = pass.includes(i);
    const entry = i === 0 ? start : wrap(exits[i - 1] + Math.PI); const exit = boss ? null : exits[i];
    const lines = [entry, exit].filter((a) => a !== null).map((a) => [Math.cos(a), Math.sin(a)]);
    const clear = (p) => lines.every(([ux, uz]) => p.x * ux + p.z * uz <= 0 || Math.abs(-p.x * uz + p.z * ux) >= GATE_CLEAR);
    // Where a gate can stand and be seen whole: the camera frames the arena rim edge to edge with the far rim just under the
    // top bar, so only the frame's corners have room past the rim. The far corners take a standing gate (it is behind every
    // unit, so it never covers one); the near corners a gate laid in the floor (a hatch or a crack: nothing stands up to
    // cover the fight). The near middle is under the hero cards and the far middle under the top bar: no gate there.
    // Each window keeps the spot nearest its middle that is clear of the links. A room only crossed has no gates.
    const WIN = [[-2.9, -2.55, 0], [-0.6, -0.25, 0], [1.99, 2.39, 1], [0.75, 1.15, 1]];
    const gates = [];
    if (!isPass) for (const [lo, hi, low] of WIN) {
      const want = (lo + hi) / 2 + r2.range(-0.06, 0.06); let best = null;
      for (let t = lo; t <= hi + 1e-6; t += 0.035) if (clear(rim(t, GATE_K)) && (best === null || Math.abs(t - want) < Math.abs(best - want))) best = t;
      if (best !== null) gates.push({ t: best, low: !!low });
    }
    // the main gate (the boss's, drawn bigger on the last pad) is a standing one when there is one
    gates.sort((a, b) => a.low - b.low);
    gates.forEach((g, k) => { const p = rim(g.t, GATE_K); g.x = p.x; g.z = p.z; g.main = k === 0; g.big = boss && k === 0 && !g.low; });
    const camps = [];
    const nonBoss = waveRoom.filter((r, w) => r === i && w < WAVES - 1).length;
    if (nonBoss === 1 && !boss) {
      // the first across the pad from where the team comes in, pulled to the far half; the second near the far middle
      const ex = Math.cos(entry); const ez = Math.sin(entry);
      const t0 = Math.atan2(-ez / A.z, -ex / A.x); const t1 = wrap(t0 + (Math.cos(t0) > 0 ? -0.35 : 0.35) + r2.range(-0.15, 0.15));
      camps.push(rim(t1, r2.range(0.56, 0.64)));
      const a2 = -Math.PI / 2 + (ex > 0 ? -0.55 : 0.55) + r2.range(-0.2, 0.2);
      camps.push(rim(a2, r2.range(0.42, 0.5)));
    } else if (nonBoss > 1) {
      // several waves in one room: the sim stands every one of their first packs in this room's camps, and a later wave's
      // pack is only drawn once its wave begins (world.js roomBase), so the camps stand in front of the standing gates and
      // a later pack reads as coming out of them
      for (const g of gates.filter((q) => !q.low).slice(0, 2)) camps.push(rim(g.t, 0.7));
      if (!camps.length) camps.push(rim(-Math.PI / 2, 0.7));
    }
    // where the team stands when it has come in: a little inside the pad on the entry side
    const home = { x: Math.cos(entry) * 2.6, z: Math.sin(entry) * 1.4 };
    rooms.push({ i, boss, pass: isPass, waves: wavesIn(i), entry, exit, gates, camps, home });
  }
  const links = [{ from: -1, to: 0, kind: 'bridge' }, ...linkDraws.map((l, i) => ({ from: i, to: i + 1, kind: l.kind }))];
  // the first wave fought in each room
  const firstWave = rooms.map((r) => waveRoom.indexOf(r.i));
  const plan = { n, layout, biome, exits, rises, start, startRise, rooms, waveRoom, firstWave, links, hazards: [], mode: modeOf(n) };
  plan.hazards = placeHazards(plan, A, rngOf(n * 977 + 53));
  cache.set(key, plan);
  return plan;
}
