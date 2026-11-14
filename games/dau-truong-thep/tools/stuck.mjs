// Stuck meter: bot-only matches on every layout, counting ticks where a unit wants to move and does not.
//   STUCK_TAG=before node tools/stuck.mjs      writes <repo>/.chk/stuck-<tag>.json
//   STUCK_JS=<dir with js/>  measures another checkout of the game's js/ (e.g. an old commit); STUCK_SEEDS=6 seeds per layout (default 6)
// Headline = stuck against an obstacle (rim within AGAINST of solid); the rest of the stuck ticks happen on open ground.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JS = process.env.STUCK_JS ? path.resolve(process.env.STUCK_JS, 'js') : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'js');
const load = (f) => import(path.join(JS, f));
const { createMatch, step, unitSpeed } = await load('sim.js');
const { allInputs } = await load('bots.js');
const { MAP_ORDER, NHA_ORDER } = await load('maps.js');
const { MECH_ORDER, TICK } = await load('data.js');

// "Against" = the unit's rim is within this distance of static geometry, a prop or a tower: stuck ticks there are collision jams,
// the rest are bots reversing or starting from rest on open ground.
const AGAINST = 0.3;
function rimGap(m, u, x, z) {
  let d = Math.min(m.map.hw - Math.abs(x), m.map.hd - Math.abs(z));
  for (const w of m.map.walls) d = Math.min(d, Math.hypot(Math.max(w.x0 - x, 0, x - w.x1), Math.max(w.z0 - z, 0, z - w.z1)));
  for (const c of m.map.rounds) d = Math.min(d, Math.hypot(c.x - x, c.z - z) - c.r);
  for (const p of m.props) if (p.alive) d = Math.min(d, Math.hypot(p.x - x, p.z - z) - p.r);
  for (const t of m.towers) if (t.alive) d = Math.min(d, Math.hypot(t.x - x, t.z - z) - t.r);
  return d - (u.moveRadius ?? u.radius);
}
const TAG = process.env.STUCK_TAG || 'run', SEEDS = Array.from({ length: Number(process.env.STUCK_SEEDS) || 6 }, (_, i) => 11 + i), SIM_SECONDS = 120, CELL = 2;
const LAYOUTS = [...MAP_ORDER.map((k) => [k, 'tdm']), ...NHA_ORDER.map((k) => [k, 'nha'])];
const rotate = (i, off) => Array.from({ length: 5 }, (_, k) => MECH_ORDER[(i + off + k) % MECH_ORDER.length]);

function playLayout(map, mode) {
  const L = { wants: 0, stuck: 0, against: 0, longest: 0, longestAgainst: 0, cells: new Map(), acells: new Map(), mech: {} };
  for (const seed of SEEDS) {
    const roster = [];
    for (let t = 0; t < 2; t++) for (const mech of rotate(seed, t * 3)) roster.push({ team: t, mech, name: mech + t, bot: true, diff: 'normal' });
    const m = createMatch({ seed, map, mode, roster });
    const run = new Map(), runA = new Map();
    for (let i = 0, n = Math.round(SIM_SECONDS / TICK); i < n && !m.over; i++) {
      const inputs = allInputs(m);
      const pre = m.units.map((u) => {
        const inp = inputs[u.id];
        const wants = u.alive && inp && Math.hypot(inp.mx, inp.mz) > 0.5 && u.stunT <= 0 && !u.dash && !(u.cast && u.cast.move < 0.2);
        return { wants, x: u.x, z: u.z, sp: wants ? unitSpeed(u) : 0, respawnT: u.respawnT };
      });
      step(m, inputs);
      for (const u of m.units) {
        const p = pre[u.id];
        if (!p.wants || !u.alive || p.sp <= 0) { run.set(u.id, 0); runA.set(u.id, 0); continue; }
        const moved = Math.hypot(u.x - p.x, u.z - p.z), stuck = moved < 0.25 * p.sp * TICK;
        const mk = (L.mech[u.mech] = L.mech[u.mech] || { wants: 0, stuck: 0 });
        L.wants++; mk.wants++;
        if (!stuck) { run.set(u.id, 0); runA.set(u.id, 0); continue; }
        L.stuck++; mk.stuck++;
        const r = (run.get(u.id) || 0) + 1; run.set(u.id, r);
        if (r > L.longest) L.longest = r;
        const key = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL);
        L.cells.set(key, (L.cells.get(key) || 0) + 1);
        if (rimGap(m, u, p.x, p.z) < AGAINST) {
          L.against++; L.acells.set(key, (L.acells.get(key) || 0) + 1);
          const ra = (runA.get(u.id) || 0) + 1; runA.set(u.id, ra); if (ra > L.longestAgainst) L.longestAgainst = ra;
        } else runA.set(u.id, 0);
      }
    }
  }
  return L;
}

const out = {};
for (const [map, mode] of LAYOUTS) {
  const L = playLayout(map, mode);
  const top = (cells) => [...cells].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => {
    const [i, j] = k.split(',').map(Number);
    return { x: i * CELL + CELL / 2, z: j * CELL + CELL / 2, ticks: n };
  });
  const worst = top(L.cells), worstAgainst = top(L.acells);
  const mech = {};
  for (const k in L.mech) mech[k] = { wants: L.mech[k].wants, stuckPct: +(100 * L.mech[k].stuck / L.mech[k].wants).toFixed(2) };
  out[map] = { mode, wants: L.wants, stuck: L.stuck, stuckPct: +(100 * L.stuck / L.wants).toFixed(2), againstPct: +(100 * L.against / L.wants).toFixed(2), openPct: +(100 * (L.stuck - L.against) / L.wants).toFixed(2), longestAgainstSec: +(L.longestAgainst * TICK).toFixed(2), longestRunSec: +(L.longest * TICK).toFixed(2), worstCells: worst, worstAgainstCells: worstAgainst, mech };
  console.log(`${map.padEnd(9)} ${mode}  AGAINST AN OBSTACLE ${out[map].againstPct}% (longest ${out[map].longestAgainstSec}s)  open ground ${out[map].openPct}%  of ${L.wants} wants-to-move ticks`);
  console.log('   worst cells: ' + worst.map((c) => `(${c.x},${c.z}):${c.ticks}`).join(' '));
  console.log('   worst cells against an obstacle: ' + worstAgainst.map((c) => `(${c.x},${c.z}):${c.ticks}`).join(' '));
  console.log('   per mech: ' + Object.entries(mech).map(([k, v]) => `${k} ${v.stuckPct}%`).join('  '));
}
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.chk');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `stuck-${TAG}.json`), JSON.stringify(out, null, 1));
console.log('saved', path.join(dir, `stuck-${TAG}.json`));
