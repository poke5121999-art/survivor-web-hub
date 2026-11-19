// Balance by numbers: runs every stage with standard teams at the expected hero level and reports clear rates,
// time and what hurt. Usage: node tools/balance.mjs [fromStage] [toStage] [runsPerTeam] [levelOffset]
import { createBattle, step, pickCard } from '../js/sim/battle.js';
import { stageDef, expectedLevel } from '../js/data/stages.js';
import { levelMul } from '../js/data/economy.js';

const from = +process.argv[2] || 1; const to = +process.argv[3] || 30; const RUNS = +process.argv[4] || 8; const OFF = +process.argv[5] || 0;
export const TEAMS = {
  start: ['thep', 'mua', 'yta', 'gio'],
  ranged: ['thep', 'phao', 'yta', 'ky'],
  melee: ['hoa', 'bang', 'doc', 'yta'],
  ssr: ['soi', 'sam', 'nhen', 'yta'],
};
// flat equipment a player at stage n is expected to wear (see SCOPE: about one tier per chapter)
const gear = (n) => ({ atkFlat: 6 * n, hpFlat: 40 * n });

export function runStage(n, ids, seed, lvOff = 0, auto = { ult: true, pick: 'best' }) {
  const L = Math.max(1, expectedLevel(n) + lvOff);
  const B = createBattle({ stage: n, seed, team: ids.map((id) => ({ id, mul: levelMul(L), ...gear(n) })), auto });
  let ticks = 0;
  while ((B.phase === 'fight' || B.phase === 'pick') && ticks++ < 30 * 60 * 15) {
    if (B.phase === 'pick') { for (let i = 0; i < B.heroes.length; i++) if (B.picked[i] < 0) pickCard(B, i, 0); } else step(B);
  }
  return B;
}

if (process.argv[1].endsWith('balance.mjs')) {
  console.log(`stage  boss        tier  lvl  ${Object.keys(TEAMS).map((t) => t.padEnd(7)).join('')} all    time  wave@loss`);
  const rows = [];
  for (let n = from; n <= to; n++) {
    const S = stageDef(n); let line = ''; let won = 0; let total = 0; let time = 0; const lossWave = [];
    for (const [, ids] of Object.entries(TEAMS)) {
      let w = 0;
      for (let r = 0; r < RUNS; r++) { const B = runStage(n, ids, n * 1000 + r * 17 + 1, OFF); total++; time += B.t; if (B.phase === 'won') { w++; won++; } else lossWave.push(B.wave); }
      line += (Math.round((w / RUNS) * 100) + '%').padEnd(7);
    }
    const rate = won / total; rows.push(rate);
    console.log(`${String(n).padStart(3)}${S.spike ? '*' : ' '}  ${S.boss.padEnd(10)}  ${S.bossTier}     ${String(expectedLevel(n) + OFF).padStart(2)}   ${line} ${(Math.round(rate * 100) + '%').padEnd(5)}  ${Math.round(time / total)}s  ${lossWave.slice(0, 12).join('')}`);
  }
}
