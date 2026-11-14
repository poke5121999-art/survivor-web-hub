// Stuck meter: bot-only matches on every layout, counting ticks where a unit wants to move and does not.
//   STUCK_TAG=before node tools/stuck.mjs      writes <repo>/.chk/stuck-<tag>.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMatch, step, unitSpeed } from '../js/sim.js';
import { allInputs } from '../js/bots.js';
import { MAP_ORDER, NHA_ORDER } from '../js/maps.js';
import { MECH_ORDER, TICK } from '../js/data.js';

const TAG = process.env.STUCK_TAG || 'run', SEEDS = [11, 12, 13], SIM_SECONDS = 120, CELL = 2;
const LAYOUTS = [...MAP_ORDER.map((k) => [k, 'tdm']), ...NHA_ORDER.map((k) => [k, 'nha'])];
const rotate = (i, off) => Array.from({ length: 5 }, (_, k) => MECH_ORDER[(i + off + k) % MECH_ORDER.length]);

function playLayout(map, mode) {
  const L = { wants: 0, stuck: 0, longest: 0, cells: new Map(), mech: {} };
  for (const seed of SEEDS) {
    const roster = [];
    for (let t = 0; t < 2; t++) for (const mech of rotate(seed, t * 3)) roster.push({ team: t, mech, name: mech + t, bot: true, diff: 'normal' });
    const m = createMatch({ seed, map, mode, roster });
    const run = new Map();
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
        if (!p.wants || !u.alive || p.sp <= 0) { run.set(u.id, 0); continue; }
        const moved = Math.hypot(u.x - p.x, u.z - p.z), stuck = moved < 0.25 * p.sp * TICK;
        const mk = (L.mech[u.mech] = L.mech[u.mech] || { wants: 0, stuck: 0 });
        L.wants++; mk.wants++;
        if (!stuck) { run.set(u.id, 0); continue; }
        L.stuck++; mk.stuck++;
        const r = (run.get(u.id) || 0) + 1; run.set(u.id, r);
        if (r > L.longest) L.longest = r;
        const key = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL);
        L.cells.set(key, (L.cells.get(key) || 0) + 1);
      }
    }
  }
  return L;
}

const out = {};
for (const [map, mode] of LAYOUTS) {
  const L = playLayout(map, mode);
  const worst = [...L.cells].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => {
    const [i, j] = k.split(',').map(Number);
    return { x: i * CELL + CELL / 2, z: j * CELL + CELL / 2, ticks: n };
  });
  const mech = {};
  for (const k in L.mech) mech[k] = { wants: L.mech[k].wants, stuckPct: +(100 * L.mech[k].stuck / L.mech[k].wants).toFixed(2) };
  out[map] = { mode, wants: L.wants, stuck: L.stuck, stuckPct: +(100 * L.stuck / L.wants).toFixed(2), longestRunSec: +(L.longest * TICK).toFixed(2), worstCells: worst, mech };
  console.log(`${map.padEnd(9)} ${mode}  stuck ${out[map].stuckPct}% of ${L.wants}  longest ${out[map].longestRunSec}s`);
  console.log('   worst cells: ' + worst.map((c) => `(${c.x},${c.z}):${c.ticks}`).join(' '));
  console.log('   per mech: ' + Object.entries(mech).map(([k, v]) => `${k} ${v.stuckPct}%`).join('  '));
}
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.chk');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `stuck-${TAG}.json`), JSON.stringify(out, null, 1));
console.log('saved', path.join(dir, `stuck-${TAG}.json`));
