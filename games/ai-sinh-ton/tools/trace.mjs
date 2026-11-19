// One stage in detail: wave times, lowest health, who dealt what. Usage: node tools/trace.mjs <stage> [team] [seed] [levelOffset]
import { createBattle, step, pickCard } from '../js/sim/battle.js';
import { expectedLevel } from '../js/data/stages.js';
import { levelMul } from '../js/data/economy.js';
import { TEAMS } from './balance.mjs';
const n = +process.argv[2] || 1; const ids = TEAMS[process.argv[3] || 'start']; const seed = +process.argv[4] || 1; const off = +process.argv[5] || 0;
const ev = {}; const waveT = []; let deaths = 0; let casts = {}; let bossT = 0;
const L = Math.max(1, expectedLevel(n) + off);
const B = createBattle({ stage: n, seed, team: ids.map((id) => ({ id, mul: levelMul(L), atkFlat: 6 * n, hpFlat: 40 * n })), auto: { ult: true, pick: 'best' },
  onEvent: (e) => { ev[e.e] = (ev[e.e] || 0) + 1; if (e.e === 'wave_clear') waveT.push(Math.round(B.t)); if (e.e === 'die' && B.byUid.get(e.uid) && B.byUid.get(e.uid).hero) deaths++; if (e.e === 'cast' || e.e === 'ult') casts[e.name] = (casts[e.name] || 0) + 1; } });
let minHp = B.heroes.map(() => 1); let t = 0;
while ((B.phase === 'fight' || B.phase === 'pick') && t++ < 30 * 900) {
  if (B.phase === 'pick') { for (let i = 0; i < 4; i++) if (B.picked[i] < 0) pickCard(B, i, 0); } else step(B);
  B.heroes.forEach((u, i) => { minHp[i] = Math.min(minHp[i], u.hp / u.maxHp); });
}
console.log(`stage ${n} lvl ${L} -> ${B.phase} at ${Math.round(B.t)}s, wave ${B.wave}, waves cleared at ${waveT.join(', ')}s, hero deaths ${deaths}, kills ${B.kills}`);
for (const [i, u] of B.heroes.entries()) console.log(`  ${u.kind.padEnd(5)} dealt ${String(Math.round(u.dealt)).padStart(7)}  taken ${String(Math.round(u.taken)).padStart(6)}  healed ${String(Math.round(u.healed)).padStart(6)}  minHp ${Math.round(minHp[i] * 100)}%  ults ${u.ults || 0}  casts ${u.casts || 0}  cards ${u.cards.join(',')}`);
console.log('  events', JSON.stringify(ev)); console.log('  casts', JSON.stringify(casts));
