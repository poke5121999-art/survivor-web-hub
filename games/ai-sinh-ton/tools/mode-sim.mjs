// The special stages played by the bots, in Node: win rate and how each run ended, against the same stage with the rule off.
// Usage: node games/ai-sinh-ton/tools/mode-sim.mjs [--seeds=8] [--stages=4,7,14]
import { createBattle, step, pickCard } from '../js/sim/battle.js';
import { stageDef, expectedLevel } from '../js/data/stages.js';
import { expectedSlots } from '../js/data/unlocks.js';
import { levelMul } from '../js/data/economy.js';
import { roomPlan, modeOf } from '../js/sim/rooms.js';
import { ARENA } from '../js/sim/battle.js';

const argv = process.argv.slice(2); const arg = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const SEEDS = +arg('seeds') || 8;
const STAGES = arg('stages') ? arg('stages').split(',').map(Number) : Array.from({ length: 50 }, (_, i) => i + 1).filter((n) => modeOf(n));
const START = ['thep', 'mua', 'yta', 'gio'];
function run(n, seed, off) {
  const mul = levelMul(expectedLevel(n)); const team = START.slice(0, expectedSlots(n)).map((id) => ({ id, mul }));
  const ev = []; let why = '';
  const B = createBattle({ stage: n, seed, team, auto: { ult: true, pick: 'best' }, onEvent: (e) => { if (e.e === 'lost') why = e.why || 'team'; if (/egg|core|survived/.test(e.e)) ev.push(e.e + ':' + (e.s || '')); } });
  if (off) B.plan = { ...B.plan, mode: null };
  let k = 0;
  while ((B.phase === 'fight' || B.phase === 'pick') && k++ < 30 * 1200) { if (B.phase === 'pick') { for (let i = 0; i < B.heroes.length; i++) if (B.picked[i] < 0) pickCard(B, i, 0); } else step(B); }
  return { won: B.phase === 'won', why, wave: B.wave, t: B.t, ev };
}
for (const n of STAGES) {
  const on = []; const off = [];
  for (let s = 1; s <= SEEDS; s++) { on.push(run(n, s, false)); off.push(run(n, s, true)); }
  const wr = (a) => a.filter((r) => r.won).length;
  const whys = {}; for (const r of on) if (!r.won) whys[r.why + '@w' + r.wave] = (whys[r.why + '@w' + r.wave] || 0) + 1;
  console.log(`stage ${n} ${modeOf(n).padEnd(7)} ${roomPlan(n, ARENA).layout.padEnd(7)} won ${wr(on)}/${SEEDS} with the rule, ${wr(off)}/${SEEDS} without; lost: ${JSON.stringify(whys)}; time ${(on.reduce((s, r) => s + r.t, 0) / SEEDS).toFixed(0)} s vs ${(off.reduce((s, r) => s + r.t, 0) / SEEDS).toFixed(0)} s; events ${[...new Set(on.flatMap((r) => r.ev))].join(' ')}`);
}
