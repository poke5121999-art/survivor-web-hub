// Runs the match simulation in node (no browser): ballistics, wind, craters, falling, turn order, AI.
// Usage: node games/phao-may/tools/sim-test.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
for (const f of ['core', 'data', 'terrain', 'sim', 'ai']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f + '.js' });
const PM = globalThis.PM;
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const mk = (o) => PM.Sim.create(Object.assign({ seed: 7, map: 'doiche', first: 0, teams: [[{ kind: 'coc' }], [{ kind: 'chuon' }]] }, o));
const until = (sim, pred, max) => { let n = 0; while (!pred() && sim.phase !== 'over' && n++ < (max || 120 * 60)) sim.step(); return n; };
const drain = (sim, type) => sim.events.filter((e) => e.type === type);

for (const mapId of PM.MAP_ORDER) {
  const sim = mk({ map: mapId });
  check(sim.units.every((u) => Number.isFinite(u.y) && u.y > sim.map.seaY + 5), mapId + ': every spawn stands on ground above the sea');
  sim.advance(1.5);
  check(sim.units.every((u) => u.alive && u.grounded), mapId + ': units rest on their spawns');
}

{
  const sim = mk({});
  const u = sim.active, def = u.shots[0];
  sim.wind = 0;
  const m = PM.Sim.muzzle(Object.assign({}, u, { angle: 60, facing: u.facing }));
  const v = def.v * (0.15 + 0.85 * 0.42), vx = Math.cos(Math.PI / 3) * v * u.facing, vy = Math.sin(Math.PI / 3) * v;
  sim.fireNow({ angle: 60, power: 42, shot: 0 });
  until(sim, () => drain(sim, 'boom').length > 0);
  const boom = drain(sim, 'boom')[0];
  const t = (boom.x - m.x) / vx, yExpect = m.y + vy * t - 0.5 * sim.map.g * def.gravK * t * t;
  check(Math.abs(boom.y - yExpect) < 0.6, `no wind: impact y ${boom.y.toFixed(2)} matches the parabola ${yExpect.toFixed(2)} at t=${t.toFixed(2)}s`);
  check(!sim.terrain.solid(boom.x, boom.y - 1) && sim.terrain.solid(boom.x, boom.y - def.dig - 1.5), `crater: ground is open 1 m under the impact and solid below the ${def.dig} m dig radius`);
  const again = mk({}); again.wind = 0; const rep = PM.Sim.trace(again, again.active, def, again.active.facing, 60, 42);
  check(Math.hypot(rep.impacts[0].x - boom.x, rep.impacts[0].y - boom.y) < 0.01, 'dry-run trace lands on the same point as the real shot');
}

{
  const land = (wind) => { const s = mk({}); s.wind = wind; return PM.Sim.trace(s, s.active, s.active.shots[0], 1, 60, 42).impacts[0].x; };
  const calm = land(0), tail = land(8), head = land(-8);
  check(tail > calm + 4 && head < calm - 4, `wind bends the shot: head ${head.toFixed(1)} < calm ${calm.toFixed(1)} < tail ${tail.toFixed(1)}`);
}

{
  const sim = mk({});
  const v = sim.units[1], y0 = v.y;
  sim.terrain.carve(v.x, v.y - 2, 4);
  sim.advance(2);
  check(v.y < y0 - 2 && v.grounded, `unit drops into a hole dug under it (${y0.toFixed(1)} -> ${v.y.toFixed(1)})`);
  for (let y = v.y; y > 0; y -= 2) sim.terrain.carve(v.x, y, 3.5);
  sim.advance(6);
  check(!v.alive && drain(sim, 'die').some((e) => e.cause === 'sea'), 'unit that falls through the island dies in the cloud sea');
}

{
  const sim = mk({ teams: [[{ kind: 'coc' }, { kind: 'chuon' }], [{ kind: 'coc' }, { kind: 'chuon' }]] });
  const first = sim.active, before = sim.order().map((o) => o.id);
  sim.fireNow({ angle: 80, power: 20, shot: 0 });
  until(sim, () => sim.phase === 'turn' && sim.active !== first);
  const after = sim.order();
    check(sim.active.id === before[1], 'turn passes to the unit with the next lowest delay');
  check(after[after.length - 1].id === first.id || first.delay >= after[1].delay, `shooter moves back in the order (delay ${first.delay.toFixed(0)})`);
  const sim2 = mk({ teams: [[{ kind: 'coc' }, { kind: 'chuon' }], [{ kind: 'coc' }, { kind: 'chuon' }]] });
  const f2 = sim2.active; sim2.skip(); until(sim2, () => sim2.phase === 'turn' && sim2.active !== f2);
  check(f2.delay < first.delay, `a skipped turn costs less delay (${f2.delay.toFixed(0)}) than a fired shell (${first.delay.toFixed(0)})`);
}

{
  const sim = mk({ teams: [[{ kind: 'coc', items: ['heal', 'shield', 'double'] }], [{ kind: 'chuon' }]] });
  const u = sim.active;
  u.hp = 300; sim.useItem(0);
  check(u.hp === 300 + Math.round(u.maxHp * 0.35), 'heal item restores 35% of max hp');
  sim.useItem(1); check(u.shield === 260, 'shield item gives a 260 point shield');
  sim.useItem(2); sim.events.length = 0;
  sim.fireNow({ angle: 70, power: 50, shot: 0 });
  until(sim, () => sim.phase !== 'flight');
  check(drain(sim, 'spawn').length === 2, 'double item fires two shells');
}

for (const level of ['easy', 'medium', 'hard']) {
  let dealt = 0, shots = 0, wins = 0, steps = 0;
  const N = 6;
  for (let seed = 1; seed <= N; seed++) {
    const sim = mk({ seed, teams: [[{ kind: 'coc', ai: level, items: ['heal', 'boost', 'double'] }], [{ kind: 'chuon', ai: level, items: ['heal', 'shield', 'tele'] }]] });
    steps += until(sim, () => false, 120 * 900);
    check(sim.phase === 'over', `${level} vs ${level} seed ${seed}: match ends (turns=${sim.turnN}, winner=${sim.winner})`);
    for (const u of sim.units) { dealt += sim.stats[u.id].dealt; shots += sim.stats[u.id].shots; }
    if (sim.winner === 0) wins++;
  }
  console.log(`  ${level}: avg damage per shot ${(dealt / shots).toFixed(0)}, shots ${shots}, team0 wins ${wins}/${N}, sim seconds ${(steps / 120 / N).toFixed(0)} per match`);
  globalThis['dps_' + level] = dealt / shots;
}
check(globalThis.dps_hard > globalThis.dps_medium && globalThis.dps_medium > globalThis.dps_easy, 'damage per shot rises with AI level');
check(globalThis.dps_hard > 120, `hard AI lands most shots (avg ${globalThis.dps_hard.toFixed(0)} per shot)`);

{
  const run = () => { const s = mk({ seed: 3, teams: [[{ kind: 'coc', ai: 'hard' }], [{ kind: 'chuon', ai: 'hard' }]] }); until(s, () => false, 120 * 900); return s.steps + ':' + s.units.map((u) => u.hp).join(','); };
  check(run() === run(), 'same seed replays to the same result');
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
