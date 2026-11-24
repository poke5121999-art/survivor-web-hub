// The special stages played by the bots, in Node: win rate and how each run ended, against the same stage with the rule off
// and against the plain stages either side of it. A team below the expected level (--lv=-8) is where a rule that is too easy
// shows: the standard team wins every stage at the expected level, special or not.
// Usage: node games/ai-sinh-ton/tools/mode-sim.mjs [--seeds=8] [--stages=4,7,14] [--lv=-8] [--gear=0.5] [--teams=start,ranged]
import { createBattle, step, pickCard } from '../js/sim/battle.js';
import { expectedLevel } from '../js/data/stages.js';
import { levelMul } from '../js/data/economy.js';
import { roomPlan, modeOf } from '../js/sim/rooms.js';
import { ARENA } from '../js/sim/battle.js';
import { TEAMS } from './balance.mjs';

const argv = process.argv.slice(2); const arg = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const SEEDS = +arg('seeds') || 8; const LV = +arg('lv') || 0;
const TEAM_IDS = (arg('teams') || 'start,ranged,melee,ssr').split(',');
const STAGES = arg('stages') ? arg('stages').split(',').map(Number) : Array.from({ length: 50 }, (_, i) => i + 1).filter((n) => modeOf(n));
const GEAR = arg('gear') === '' ? 1 : +arg('gear'); const gear = (n) => ({ atkFlat: 6 * n * GEAR, hpFlat: 40 * n * GEAR });

function run(n, ids, seed, off) {
  const mul = levelMul(Math.max(1, expectedLevel(n) + LV)); const team = ids.map((id) => ({ id, mul, ...gear(n) }));
  const ev = []; let why = '';
  const B = createBattle({ stage: n, seed, team, auto: { ult: true, pick: 'best' }, onEvent: (e) => { if (e.e === 'lost') why = e.why || 'team'; if (/egg|core|survived/.test(e.e)) ev.push(e.e + ':' + (e.s || '')); } });
  if (off) B.plan = { ...B.plan, mode: null };
  let k = 0;
  while ((B.phase === 'fight' || B.phase === 'pick') && k++ < 30 * 1200) { if (B.phase === 'pick') { for (let i = 0; i < B.heroes.length; i++) if (B.picked[i] < 0) pickCard(B, i, 0); } else step(B); }
  return { won: B.phase === 'won', why, wave: B.wave, t: B.t, ev };
}
function batch(n, off) {
  const out = []; for (const t of TEAM_IDS) for (let s = 1; s <= SEEDS; s++) out.push(run(n, TEAMS[t], n * 1000 + s * 17 + 1, off)); return out;
}
const wr = (a) => a.filter((r) => r.won).length / a.length;
const pct = (x) => (Math.round(x * 100) + '%').padStart(4);
console.log(`level offset ${LV}, teams ${TEAM_IDS.join('/')}, ${SEEDS} seeds each`);
const gaps = [];
for (const n of STAGES) {
  const on = batch(n, false); const off = batch(n, true);
  const near = [n - 1, n + 1].filter((m) => m >= 1 && m <= 50 && !modeOf(m)).flatMap((m) => batch(m, false));
  const whys = {}; for (const r of on) if (!r.won) whys[r.why + '@w' + r.wave] = (whys[r.why + '@w' + r.wave] || 0) + 1;
  gaps.push(wr(on) - wr(near));
  console.log(`stage ${String(n).padStart(2)} ${modeOf(n).padEnd(7)} ${roomPlan(n, ARENA).layout.padEnd(7)} won ${pct(wr(on))} with the rule, ${pct(wr(off))} without, ${pct(wr(near))} on the plain stages either side; lost: ${JSON.stringify(whys)}; time ${(on.reduce((s, r) => s + r.t, 0) / on.length).toFixed(0)} s; events ${[...new Set(on.flatMap((r) => r.ev))].join(' ')}`);
}
console.log(`mean win-rate gap special - neighbours: ${(gaps.reduce((s, g) => s + g, 0) / gaps.length * 100).toFixed(1)} points`);
