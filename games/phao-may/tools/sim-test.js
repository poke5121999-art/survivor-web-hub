// Runs the match simulation in node (no browser): ballistics, wind, craters, falling, turn order, AI.
// Usage: node games/phao-may/tools/sim-test.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
for (const f of ['core', 'data', 'data-maps', 'terrain', 'sim', 'ai']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f + '.js' });
const PM = globalThis.PM;
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const mk = (o) => PM.Sim.create(Object.assign({ seed: 7, map: 'doiche', first: 0, flip: false, teams: [[{ kind: 'coc' }], [{ kind: 'chuon' }]] }, o));
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
  const pre = PM.Sim.trace(sim, u, def, u.facing, 60, 42).impacts[0], wasSolid = sim.terrain.solid(pre.x, pre.y - 1), deepSolid = sim.terrain.solid(pre.x, pre.y - def.dig - 1.5);
  sim.fireNow({ angle: 60, power: 42, shot: 0 });
  until(sim, () => drain(sim, 'boom').length > 0);
  const boom = drain(sim, 'boom')[0];
  const t = (boom.x - m.x) / vx, yExpect = m.y + vy * t - 0.5 * sim.map.g * def.gravK * t * t;
  check(Math.abs(boom.y - yExpect) < 0.6, `no wind: impact y ${boom.y.toFixed(2)} matches the parabola ${yExpect.toFixed(2)} at t=${t.toFixed(2)}s`);
  check(wasSolid && !sim.terrain.solid(boom.x, boom.y - 1) && sim.terrain.solid(boom.x, boom.y - def.dig - 1.5) === deepSolid, `crater: ground 1 m under the impact was solid and is now open; ground below the ${def.dig} m dig radius is untouched`);
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

{
  const sim = mk({ teams: [[{ kind: 'tegiac' }], [{ kind: 'coc' }]] });
  sim.wind = 0;
  const u = sim.active, pred = PM.Sim.trace(sim, u, u.shots[1], 1, 55, 45);
  sim.fireNow({ angle: 55, power: 45, shot: 1 });
  until(sim, () => drain(sim, 'boom').length > 0);
  const entry = drain(sim, 'bounce')[0], boom = drain(sim, 'boom')[0];
  const dug = Math.hypot(boom.x - entry.x, boom.y - entry.y);
  check(dug > 5 && dug <= 9.3, `drill shot burrows ${dug.toFixed(1)} m into the ground before it bursts`);
  check(Math.hypot(pred.impacts[0].x - boom.x, pred.impacts[0].y - boom.y) < 1.5, 'the dry-run predicts where the drill bursts');
  sim.advance(4); sim.events.length = 0; sim.skip(); until(sim, () => sim.phase === 'turn' && sim.active === u);
  u.special = 100; sim.fireNow({ angle: 55, power: 45, shot: 2 });
  until(sim, () => sim.phase !== 'flight');
  check(drain(sim, 'boom').length >= 5, `quake leaves a line of aftershocks (${drain(sim, 'boom').length} blasts)`);
}

{
  const sim = mk({ teams: [[{ kind: 'oc' }], [{ kind: 'coc' }]] });
  sim.wind = 0;
  const u = sim.active;
  sim.fireNow({ angle: 50, power: 34, shot: 0 });
  until(sim, () => drain(sim, 'bounce').length > 0);
  const land = drain(sim, 'bounce')[0];
  until(sim, () => drain(sim, 'boom').length > 0);
  const boom = drain(sim, 'boom')[0];
  check(Math.abs(boom.x - land.x) > 4, `roller travels along the ground after landing (${land.x.toFixed(1)} -> ${boom.x.toFixed(1)})`);
  sim.advance(4); sim.events.length = 0; sim.skip(); until(sim, () => sim.phase === 'turn' && sim.active === u);
  sim.fireNow({ angle: 50, power: 34, shot: 1 });
  until(sim, () => sim.phase !== 'flight');
  const xs = drain(sim, 'boom').map((b) => b.x);
  check(xs.length === 3 && Math.min(...xs) < xs[0] - 2 && Math.max(...xs) > xs[0] + 2, `fork shot sends rollers both ways (${xs.map((x) => x.toFixed(0)).join(', ')})`);
}

{
  const sim = mk({ teams: [[{ kind: 'sua' }, { kind: 'coc' }], [{ kind: 'coc' }]] });
  sim.wind = 0;
  const u = sim.active, ally = sim.units[1], foe = sim.units[2];
  ally.hp = 300; ally.x = u.x + 12; ally.y = sim.terrain.groundY(ally.x, 90, 90);
  let best = null;
  for (let a = 20; a <= 80 && !best; a += 2) for (let p = 10; p <= 70; p += 2) { const r = PM.Sim.trace(sim, u, u.shots[1], 1, a, p); if (r.heal[ally.id] > 150) { best = { angle: a, power: p }; break; } }
  sim.fireNow({ angle: best.angle, power: best.power, shot: 1, facing: 1 });
  until(sim, () => sim.phase !== 'flight');
  check(ally.hp > 450 && foe.hp === foe.maxHp, `heal shot restores an ally (300 -> ${ally.hp}) and hurts nobody`);
  sim.advance(3); while (sim.active !== u && sim.phase !== 'over') { const a = sim.active; sim.skip(); until(sim, () => sim.phase === 'turn' && sim.active !== a); }
  const ux = u.x, ax = ally.x; let sw = null;
  for (let a = 10; a <= 80 && !sw; a += 2) for (let p = 10; p <= 70; p += 2) { if (PM.Sim.trace(sim, u, u.shots[2], 1, a, p).swap === ally.id) { sw = { angle: a, power: p }; break; } }
  u.special = 100; sim.fireNow({ angle: sw.angle, power: sw.power, shot: 2, facing: 1 });
  until(sim, () => sim.phase !== 'flight');
  check(Math.abs(u.x - ax) < 0.01 && Math.abs(ally.x - ux) < 0.01, 'swap shot trades places with the unit it hits');
}

{
  const sim = mk({ teams: [[{ kind: 'rua' }, { kind: 'coc' }], [{ kind: 'coc' }]] });
  const u = sim.active, ally = sim.units[1];
  ally.x = u.x + 6; ally.y = sim.terrain.groundY(ally.x, 90, 90);
  sim.fireNow({ shot: 1, power: 50 });
  until(sim, () => sim.phase !== 'flight');
  check(u.shield === 380 && ally.shield === 190 && sim.units[2].shield === 0, 'guard shot shields the turtle fully and a nearby ally by half');
}

{
  const sim = mk({ teams: [[{ kind: 'co' }], [{ kind: 'coc' }]] });
  sim.wind = 0;
  const u = sim.active, foe = sim.units[1];
  let best = null;
  for (let a = u.aimMin; a <= u.aimMax && !best; a += 1) for (let p = 20; p <= 100; p += 1) { const r = PM.Sim.trace(sim, u, u.shots[0], 1, a, p); if (r.dmg[foe.id] > 150) { best = { angle: a, power: p }; break; } }
  check(!!best, 'the fire stork can reach the far side');
  sim.fireNow({ angle: best.angle, power: best.power, shot: 0, facing: 1 });
  until(sim, () => drain(sim, 'burn').length > 0);
  const hpAfterBlast = (until(sim, () => sim.phase === 'turn' && sim.active === foe), foe.hp), burns = drain(sim, 'damage').filter((e) => e.cause === 'burn');
  check(burns.length === 1 && burns[0].unit === foe.id && burns[0].amount === 75, `a unit standing in fire burns for 75 at the start of its turn (hp ${hpAfterBlast})`);
  for (let k = 0; k < 8 && sim.fires.length; k++) { const a = sim.active; sim.skip(); until(sim, () => sim.phase === 'turn' && sim.active !== a); }
  check(sim.fires.length === 0 && drain(sim, 'burnout').length === 1, 'the fire goes out after three rounds');
}

{
  const sim = mk({ teams: [[{ kind: 'nhim' }], [{ kind: 'coc' }]] });
  sim.fireNow({ angle: 40, power: 50, shot: 0 });
  sim.advance(0.1);
  check(drain(sim, 'spawn').length === 5, 'spread shot leaves the barrel as five quills');
}

for (const [a, b] of [['oc', 'tegiac'], ['sua', 'chuon'], ['coc', 'rua'], ['nhim', 'co']]) {
  const sim = mk({ seed: 2, teams: [[{ kind: a, ai: 'hard' }], [{ kind: b, ai: 'hard' }]] });
  until(sim, () => false, 120 * 900);
  const dealt = sim.units.map((u) => sim.stats[u.id].dealt);
  check(sim.phase === 'over' && dealt[0] + dealt[1] > 800, `hard ${a} vs ${b}: match ends with damage dealt (${dealt.join(' / ')}, turns=${sim.turnN})`);
}

{
  const sim = mk({ map: 'vinhda', teams: [[{ kind: 'coc' }, { kind: 'chuon' }], [{ kind: 'coc' }, { kind: 'chuon' }]] });
  const y0 = sim.seaY;
  for (let k = 0; k < 6; k++) { const a = sim.active; sim.skip(); until(sim, () => sim.phase === 'turn' && sim.active !== a); }
  check(Math.abs(sim.seaY - (y0 + 6 * sim.map.hazard.perTurn)) < 1e-6, `tide rises each turn on Vịnh Đá Vôi (${y0} -> ${sim.seaY.toFixed(1)})`);
  const v = sim.units.find((u) => u.alive && u !== sim.active);
  sim.seaY = v.y + 2; sim.advance(0.5);
  check(!v.alive && drain(sim, 'die').some((e) => e.unit === v.id && e.cause === 'sea'), 'a unit the tide reaches drowns');
  const ai = mk({ map: 'vinhda', seed: 4, flip: undefined, teams: [[{ kind: 'coc', ai: 'hard' }], [{ kind: 'tegiac', ai: 'hard' }]] });
  until(ai, () => false, 120 * 1200);
  check(ai.phase === 'over', `hard match on Vịnh Đá Vôi ends (turns=${ai.turnN}, winner=${ai.winner}, sea=${ai.seaY.toFixed(1)})`);
}

{
  const sim = mk({ map: 'lolua' });
  sim.fireNow({ angle: 70, power: 30, shot: 0 });
  until(sim, () => sim.phase !== 'flight');
  check(drain(sim, 'spawn').some((e) => e.shot === 'dalua') && drain(sim, 'boom').some((e) => e.shot === 'dalua'), 'a burning rock falls after each shot on Lò Rèn Núi Lửa');
  const ice = mk({ map: 'bang' }), v = ice.units[0], x0 = v.x;
  let steep = null;
  for (let x = 12; x < 150 && steep === null; x += 0.5) { const a = ice.terrain.groundY(x - 0.5, 95, 95), b = ice.terrain.groundY(x + 0.5, 95, 95); if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) > 1.05 && Math.abs(b - a) < 1.4) steep = x; }
  v.x = steep; v.y = ice.terrain.groundY(steep, 95, 95); ice.advance(1.5);
  check(steep !== null && Math.abs(v.x - steep) > 1, `a unit slides on an icy slope that would hold elsewhere (${steep} -> ${v.x.toFixed(1)})`);
  void x0;
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
