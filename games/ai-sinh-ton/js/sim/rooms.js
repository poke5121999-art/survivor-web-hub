// The rooms of a stage: what the sim and the map both need to agree on, worked out from the stage number alone (no DOM, no
// three.js, no battle state), so the same stage always has the same rooms.
//   exits[i]  the direction (radians, in pad i's frame) of the bridge from fight pad i to pad i + 1 (four of them)
//   rises[i]  the height step of that bridge before the map clamps it to the theme's range
//   start     the direction from fight pad 1 to the start room, where the team stands before the first fight
//   rooms[i]  per fight pad: its entry and exit directions, its spawn gates at the frame's corners and its camps
// A gate is a point of the arena rim (the sim's ellipse, param angle `t`, at SPAWN rim) where monsters walk in; `main` is the
// big one (the boss's on the last pad); a `low` gate lies in the floor. A camp is a spot inside the pad where the first pack of the wave already stands
// when the team arrives. Directions use the sim's frame: x across the screen, z toward the camera (far is z < 0).
//
// The bridge draws come first and in the same order as the map always drew them (world.js layoutMap), so the maps of
// every stage are where they were before rooms existed; the start room and the gates use a second generator.
export function rngOf(seed) {
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (a, b) => a + (b - a) * next(), int: (a, b) => a + Math.floor(next() * (b - a + 1)), chance: (p) => next() < p };
}

export const SECTIONS = 5;
const GATE_CLEAR = 3.6;   // metres between a gate and the line of any bridge leaving the pad (corridor half width + gate half width)
const GATE_K = 1.04;      // gates sit on the spawn rim (battle.js SPAWN_K)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const cache = new Map();

// A: the sim's arena ellipse {x, z}
export function roomPlan(n, A) {
  n = n | 0 || 1; const key = n + ':' + A.x + ':' + A.z; if (cache.has(key)) return cache.get(key);
  const rng = rngOf(n * 977 + 13);
  let side = rng.chance(0.5) ? 1 : -1; const exits = []; const rises = [];
  for (let i = 1; i < SECTIONS; i++) {
    const a = side * rng.range(0.3, 0.52); side = rng.chance(0.75) ? -side : side;
    const dy = (rng.chance(0.5) ? 1 : -1) * rng.int(1, 3);
    exits.push(a); rises.push(dy);
  }
  const r2 = rngOf(n * 977 + 29);
  const start = wrap(exits[0] + Math.PI + r2.range(-0.3, 0.3));
  const startRise = r2.int(-1, 1);
  const rim = (t, k) => ({ x: Math.cos(t) * A.x * k, z: Math.sin(t) * A.z * k });
  const rooms = [];
  for (let i = 0; i < SECTIONS; i++) {
    const boss = i === SECTIONS - 1;
    const entry = i === 0 ? start : wrap(exits[i - 1] + Math.PI); const exit = boss ? null : exits[i];
    const lines = [entry, exit].filter((a) => a !== null).map((a) => [Math.cos(a), Math.sin(a)]);
    const clear = (p) => lines.every(([ux, uz]) => p.x * ux + p.z * uz <= 0 || Math.abs(-p.x * uz + p.z * ux) >= GATE_CLEAR);
    // Where a gate can stand and be seen whole: the camera frames the arena rim edge to edge with the far rim just under the
    // top bar, so only the frame's corners have room past the rim. The far corners take a standing gate (it is behind every
    // unit, so it never covers one); the near corners a gate laid in the floor (a hatch or a crack: nothing stands up to
    // cover the fight). The near middle is under the hero cards and the far middle under the top bar: no gate there.
    // Each window keeps the spot nearest its middle that is clear of the bridges.
    const WIN = [[-2.9, -2.55, 0], [-0.6, -0.25, 0], [1.99, 2.39, 1], [0.75, 1.15, 1]];
    const gates = [];
    for (const [lo, hi, low] of WIN) {
      const want = (lo + hi) / 2 + r2.range(-0.06, 0.06); let best = null;
      for (let t = lo; t <= hi + 1e-6; t += 0.035) if (clear(rim(t, GATE_K)) && (best === null || Math.abs(t - want) < Math.abs(best - want))) best = t;
      if (best !== null) gates.push({ t: best, low: !!low });
    }
    // the main gate (the boss's, drawn bigger on the last pad) is a standing one when there is one
    gates.sort((a, b) => a.low - b.low);
    gates.forEach((g, k) => { const p = rim(g.t, GATE_K); g.x = p.x; g.z = p.z; g.main = k === 0; g.big = boss && k === 0 && !g.low; });
    // camps: the first across the pad from where the team comes in, pulled to the far half; the second near the far middle
    const camps = [];
    if (!boss) {
      const ex = Math.cos(entry); const ez = Math.sin(entry);
      const t0 = Math.atan2(-ez / A.z, -ex / A.x); const t1 = wrap(t0 + (Math.cos(t0) > 0 ? -0.35 : 0.35) + r2.range(-0.15, 0.15));
      camps.push(rim(t1, r2.range(0.56, 0.64)));
      const a2 = -Math.PI / 2 + (ex > 0 ? -0.55 : 0.55) + r2.range(-0.2, 0.2);
      camps.push(rim(a2, r2.range(0.42, 0.5)));
    }
    // where the team stands when it has come in: a little inside the pad on the entry side
    const home = { x: Math.cos(entry) * 2.6, z: Math.sin(entry) * 1.4 };
    rooms.push({ i, boss, entry, exit, gates, camps, home });
  }
  const plan = { n, exits, rises, start, startRise, rooms };
  cache.set(key, plan);
  return plan;
}
