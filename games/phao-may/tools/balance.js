// Unit balance table: every pair of units fights as hard AI on both sides over several seeds.
// Usage: node games/phao-may/tools/balance.js [seeds] [map]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
for (const f of ['core', 'data', 'data-maps', 'terrain', 'sim', 'ai']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f + '.js' });
const PM = globalThis.PM, N = +(process.argv[2] || 4), map = process.argv[3] || PM.MAP_ORDER[0];
const kinds = PM.UNIT_ORDER, wins = {}, games = {}, dealt = {}, shots = {};
for (const k of kinds) { wins[k] = 0; games[k] = 0; dealt[k] = 0; shots[k] = 0; }
for (const a of kinds) for (const b of kinds) {
  if (a === b) continue;
  let w = 0;
  for (let seed = 1; seed <= N; seed++) {
    const sim = PM.Sim.create({ seed: seed * 7 + a.length, map, teams: [[{ kind: a, ai: 'hard' }], [{ kind: b, ai: 'hard' }]] });
    let n = 0; while (sim.phase !== 'over' && n++ < 120 * 900) sim.step();
    games[a]++; games[b]++;
    if (sim.winner === 0) { wins[a]++; w++; } else if (sim.winner === 1) wins[b]++;
    sim.units.forEach((u) => { dealt[u.kind] += sim.stats[u.id].dealt; shots[u.kind] += sim.stats[u.id].shots; });
  }
  console.log(`${a.padEnd(7)} (left) vs ${b.padEnd(7)}: ${w}/${N}`);
}
for (const k of kinds) console.log(`${k.padEnd(7)} win rate ${(wins[k] / games[k] * 100).toFixed(0)}%  damage per shot ${(dealt[k] / shots[k]).toFixed(0)}`);
