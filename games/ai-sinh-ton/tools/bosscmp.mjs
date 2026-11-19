// Compares the eleven bosses on equal terms: same stage scaling (stage 12, tier 2), same teams, many seeds.
// Usage: node tools/bosscmp.mjs [stage] [runs]
import { createBattle, step, pickCard } from '../js/sim/battle.js';
import { stageDef, expectedLevel } from '../js/data/stages.js';
import { levelMul } from '../js/data/economy.js';
import { ENEMIES } from '../js/data/enemies.js';
import { TEAMS } from './balance.mjs';
const n = +process.argv[2] || 12; const RUNS = +process.argv[3] || 6;
for (const e of ENEMIES.filter((x) => x.boss)) {
  let won = 0; let total = 0; let t5 = 0; let hpLeft = 0;
  for (const ids of Object.values(TEAMS)) for (let r = 0; r < RUNS; r++) {
    const base = stageDef(n); const waves = base.waves.map((w, i) => (i < 4 ? w : { ...w, boss: e.id, groups: w.groups.map((g, k) => (k === 0 ? { ...g, kind: e.id } : g)) }));
    const stage = { ...base, boss: e.id, bossTier: 2, waves };
    const L = expectedLevel(n);
    const B = createBattle({ stage, seed: 500 + r * 31, team: ids.map((id) => ({ id, mul: levelMul(L), atkFlat: 6 * n, hpFlat: 40 * n })), auto: { ult: true, pick: 'best' } });
    let k = 0; let w5 = 0;
    while ((B.phase === 'fight' || B.phase === 'pick') && k++ < 30 * 900) { if (B.phase === 'pick') { for (let i = 0; i < 4; i++) if (B.picked[i] < 0) pickCard(B, i, 0); } else { step(B); if (B.wave === 5) w5++; } }
    total++; if (B.phase === 'won') won++; t5 += w5 / 30; const b = B.byUid.get(B.boss); hpLeft += b && b.alive ? b.hp / b.maxHp : 0;
  }
  console.log(`${e.id.padEnd(9)} win ${String(Math.round((won / total) * 100)).padStart(3)}%  wave5 ${Math.round(t5 / total)}s  boss hp left on loss/avg ${Math.round((hpLeft / total) * 100)}%`);
}
