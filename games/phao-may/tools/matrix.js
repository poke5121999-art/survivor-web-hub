// Every map against every AI level, in node: a 2v2 of mixed units must play to an end with damage dealt,
// and every unit must be able to reach the far spawn on every map.
// Usage: node games/phao-may/tools/matrix.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
for (const f of ['core', 'data', 'data-maps', 'terrain', 'sim', 'ai']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f + '.js' });
const PM = globalThis.PM;
let fails = 0;
const kinds = PM.UNIT_ORDER;
PM.MAP_ORDER.forEach((map, mi) => {
  for (const level of Object.keys(PM.AI_LEVELS)) {
    const pick = (i) => kinds[(mi * 3 + i) % kinds.length];
    const sim = PM.Sim.create({ seed: 100 + mi * 17, map, teams: [[{ kind: pick(0), ai: level, items: ['heal', 'boost', 'tele'] }, { kind: pick(1), ai: level, items: ['shield', 'double', 'calm'] }], [{ kind: pick(2), ai: level, items: ['heal', 'teamheal', 'tele'] }, { kind: pick(3), ai: level, items: ['boost', 'shield', 'double'] }]] });
    let n = 0, sea = 0, items = 0;
    while (sim.phase !== 'over' && n++ < 120 * 2400) { sim.step(); for (const e of sim.events) { if (e.type === 'die' && e.cause === 'sea') sea++; if (e.type === 'item') items++; } sim.events.length = 0; }
    const dealt = sim.units.reduce((a, u) => a + sim.stats[u.id].dealt, 0), shots = sim.units.reduce((a, u) => a + sim.stats[u.id].shots, 0);
    const ok = sim.phase === 'over' && dealt > 500;
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${map.padEnd(9)} ${level.padEnd(6)} turns ${String(sim.turnN).padStart(3)}  winner ${sim.winner}  damage/shot ${(dealt / Math.max(1, shots)).toFixed(0).padStart(3)}  drowned ${sea}  items used ${items}  [${sim.units.map((u) => u.kind).join(' ')}]`);
  }
});
// Reach: from its first spawn on either side, every unit must be able to hurt a unit on the opposite first spawn
// with its main shot. A map whose spawns are farther apart than a shell can fly locks that unit out of the match.
for (const map of PM.MAP_ORDER) {
  const stuck = [];
  for (const kind of kinds) for (const flip of [false, true]) {
    const sim = PM.Sim.create({ seed: 4, map, flip, first: 0, teams: [[{ kind }], [{ kind: 'coc' }]] });
    sim.wind = 0;
    const u = sim.units[0], e = sim.units[1], f = e.x > u.x ? 1 : -1, def = u.shots[0];
    let hit = false;
    for (let a = u.aimMin; a <= u.aimMax && !hit; a += 2) for (let p = 12; p <= 100; p += 4) { if (PM.Sim.trace(sim, u, def, f, a, p).dmg[e.id]) { hit = true; break; } }
    if (!hit) stuck.push(kind + (flip ? ' (east)' : ' (west)'));
  }
  if (stuck.length) fails++;
  console.log(`${stuck.length ? 'FAIL' : 'PASS'} ${map.padEnd(9)} every unit can reach the far spawn with its main shot${stuck.length ? ': locked out ' + stuck.join(', ') : ''}`);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
