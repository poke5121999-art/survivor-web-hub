// Node test suite for the simulation and the bots: `node tools/sim-test.mjs`. Exits 1 on any failure.
import { createMatch, step, visibleTo, hidden, unitSpeed } from '../js/sim.js';
import { botInput, allInputs } from '../js/bots.js';
import { solidAt } from '../js/maps.js';
import { MECHS, MECH_ORDER, RULES, TICK, PICKUPS } from '../js/data.js';

let failed = 0, passed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); }
};
const section = (s) => console.log(`\n# ${s}`);

const IN = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };
const inp = (o) => Object.assign({}, IN, o);
const SLOTS = ['s1', 's2', 'ult'];

// Two hand-driven units on open ground (row z = -1 is clear between x = -6 and 10).
function duel(mechA, mechB, a, b) {
  const m = createMatch({ seed: 1, roster: [{ team: 0, mech: mechA, name: 'A' }, { team: 1, mech: mechB, name: 'B' }] });
  put(m.units[0], a[0], a[1]); put(m.units[1], b[0], b[1]);
  return m;
}
function put(u, x, z) { u.x = u.px = x; u.z = u.pz = z; }
function run(m, ticks, f) {
  const ev = [];
  for (let i = 0; i < ticks; i++) { step(m, f ? f(i) : undefined); for (const e of m.events) ev.push(e); }
  return ev;
}
const toward = (a, b) => Math.atan2(b.z - a.z, b.x - a.x);

section('1-2 shots');
{
  const m = duel('ung', 'trau', [-5, -1], [3, -1]);
  const [a, b] = m.units;
  const ev = run(m, 12, (i) => [inp({ aim: 0, fire: i === 0 }), inp()]);
  check('shot in the open reduces hp by weapon damage', b.hp === b.maxHp - MECHS.ung.weapon.dmg, `hp ${b.hp}/${b.maxHp}`);
  check('shot in the open emits an impact on the unit', ev.some((e) => e.t === 'impact' && e.on === 'unit'));
}
{
  const m = duel('ung', 'trau', [-14, 0], [-5, 0]);
  const b = m.units[1];
  const ev = run(m, 12, (i) => [inp({ aim: 0, fire: i === 0 }), inp()]);
  check('wall blocks the shot (hp unchanged)', b.hp === b.maxHp);
  check('wall blocks the shot (impact on wall)', ev.some((e) => e.t === 'impact' && e.on === 'wall'));
}

section('3 bushes and stealth');
{
  const m = createMatch({ seed: 1, roster: [{ team: 0, mech: 'ung', name: 'A' }, { team: 1, mech: 'trau', name: 'B' }] });
  const [a, b] = m.units;
  put(b, -20.5, 9.5); put(a, -20.5, 25.5);
  run(m, 2);
  check('unit in a bush is hidden', hidden(b) && b.bush >= 0);
  check('bush unit not visible at long range', !visibleTo(m, b, 0));
  put(a, -20.5 + 3.0, 9.5);
  check('bush unit visible within bushSight', visibleTo(m, b, 0) && 3.0 < RULES.bushSight);
  put(a, -20.5 + RULES.bushSight + 0.5, 9.5);
  check('bush unit not visible just outside bushSight', !visibleTo(m, b, 0));
  put(a, -20.5, 25.5);
  run(m, 1, () => [inp(), inp({ fire: true, aim: 0 })]);
  check('firing reveals a bush unit', visibleTo(m, b, 0));
  run(m, Math.ceil((RULES.revealOnFire + 0.2) / TICK));
  check('bush unit hides again after the reveal time', !visibleTo(m, b, 0));
}
{
  // a hidden idle enemy; bots of the other team start 16 m away and play normally
  const roster = [
    { team: 0, mech: 'ung', name: 'S', bot: true, diff: 'hard' }, { team: 0, mech: 'soi', name: 'T', bot: true, diff: 'hard' },
    { team: 1, mech: 'trau', name: 'H' },
  ];
  const m = createMatch({ seed: 3, roster });
  const h = m.units[2];
  put(h, -20.5, 9.5);
  put(m.units[0], -20.5, 26 - 0.5); put(m.units[1], -26, 24);
  let hiddenTicks = 0, aimedAtHidden = 0, visibleOnce = false;
  for (let i = 0; i < 150; i++) {
    const vis = visibleTo(m, h, 0);
    if (vis) visibleOnce = true;
    const inputs = allInputs(m);
    step(m, inputs);
    if (!vis) hiddenTicks++;
    for (const e of m.events) {
      if (e.t !== 'fire' || e.id > 1 || vis) continue;
      const u = m.units[e.id], a = Math.atan2(h.z - u.z, h.x - u.x);
      let d = Math.abs(e.a - a); if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < 0.15 && Math.hypot(h.x - u.x, h.z - u.z) < u.def.weapon.range + 3) aimedAtHidden++;
    }
  }
  check('bots near a hidden enemy: scenario ran hidden for most of 5 s', hiddenTicks > 100, `hiddenTicks ${hiddenTicks}`);
  check('bots never shoot at a hidden unit', aimedAtHidden === 0, `shots ${aimedAtHidden}`);
  check('hidden enemy untouched while never seen', visibleOnce || h.hp === h.maxHp, `hp ${h.hp}`);
}
{
  const m = createMatch({ seed: 4, roster: [{ team: 0, mech: 'ung', name: 'S', bot: true, diff: 'hard' }, { team: 1, mech: 'trau', name: 'V' }] });
  const [a, v] = m.units;
  put(a, -6, -1); put(v, 4, -1);
  run(m, 120, () => allInputs(m));
  check('sanity: a bot does shoot a visible unit in the open', v.hp < v.maxHp, `hp ${v.hp}`);
}

section('4 cooldowns (every mech, every slot)');
for (const key of MECH_ORDER) {
  for (let i = 0; i < 3; i++) {
    const s = MECHS[key].skills[i], slot = SLOTS[i];
    const m = duel(key, 'ung', [-5, -1], [9, -1]);
    const a = m.units[0];
    let first = -1, second = -1, castTicks = 0;
    for (let t = 0; t < Math.ceil((s.cd + 1.5) / TICK); t++) {
      const o = inp({ [slot]: true, aim: 0, tx: 4, tz: -1, mx: 1 });
      step(m, [o, inp()]);
      for (const e of m.events) if (e.t === 'skill' && e.id === 0 && e.slot === i) { if (first < 0) { first = t; castTicks = a.cd[slot]; } else if (second < 0) second = t; }
      a.hp = a.maxHp;
    }
    check(`${key}.${slot} (${s.do}) goes on cooldown = ${s.cd}s`, first === 0 && Math.abs(castTicks - s.cd) < 1e-9, `first ${first} cd ${castTicks}`);
    check(`${key}.${slot} cannot recast before the cooldown ends`, second >= 0 && (second - first) * TICK >= s.cd - 2 * TICK && (second - first) * TICK <= s.cd + 0.5, `gap ${(second - first) * TICK}`);
  }
}

section('5 skill effects');
{
  const m = duel('trau', 'ung', [-5, -1], [3, -1]);
  const [a, b] = m.units;
  const ev = run(m, 15, (i) => [inp({ s1: i === 0 }), inp({ aim: Math.PI, fire: i === 2 })]);
  check('shield: set to its amount on cast', ev.some((e) => e.t === 'skill' && e.skill === 'giap'));
  check('shield absorbs a rail shot (hp unchanged, shield reduced)', a.hp === a.maxHp && a.shield === MECHS.trau.skills[0].amount - MECHS.ung.weapon.dmg, `hp ${a.hp} shield ${a.shield}`);
}
{
  const m = duel('trau', 'ung', [-5, -1], [2, -1]);
  const [a, b] = m.units;
  let maxStun = 0;
  const s = MECHS.trau.skills[1];
  run(m, 25, (i) => { maxStun = Math.max(maxStun, b.stunT); return [inp({ s2: i === 0, aim: 0 }), inp()]; });
  check('dash moves the caster forward', a.x > -5 + 3, `x ${a.x}`);
  check('dash damages the unit it hits', b.hp === b.maxHp - s.dmg, `hp ${b.hp}`);
  check('dash stuns the unit it hits', maxStun > s.stun - 0.1, `stun ${maxStun}`);
}
{
  const m = duel('trau', 'ung', [-5, -1], [-1, -1]);
  const [a, b] = m.units;
  const s = MECHS.trau.skills[2];
  run(m, 10, (i) => [inp({ ult: i === 0 }), inp()]);
  check('nova: no damage during the windup', b.hp === b.maxHp);
  const ev = run(m, Math.ceil(s.windup / TICK), () => [inp(), inp()]);
  check('nova: damages enemies in radius after the windup', b.hp < b.maxHp && b.hp >= b.maxHp - s.dmg, `hp ${b.hp}`);
  check('nova: slows them', b.slowT > 0 && unitSpeed(b) < b.def.speed * 0.6);
}
{
  const m = duel('soi', 'trau', [-5, -1], [3, -1]);
  const [a, b] = m.units;
  const ev = run(m, 120, (i) => [inp({ ult: i === 0, aim: 0, tx: 3, tz: -1 }), inp()]);
  const strikes = ev.filter((e) => e.t === 'explode' && e.why === 'strike').length;
  check('barrage: all strikes land', strikes === MECHS.soi.skills[2].n, `strikes ${strikes}`);
  check('barrage: damages the enemy under the target point', b.hp <= b.maxHp - MECHS.soi.skills[2].dmg, `hp ${b.hp}`);
}
{
  const m = duel('ung', 'trau', [-5, -1], [2, -1]);
  const [a, b] = m.units;
  let maxStun = 0;
  const ev = run(m, 60, (i) => { maxStun = Math.max(maxStun, b.stunT); return [inp({ s1: i === 0, tx: 2, tz: -1 }), inp()]; });
  check('mine: triggers when an enemy stands on it', ev.some((e) => e.t === 'explode' && e.why === 'mine'));
  check('mine: damages and stuns', b.hp < b.maxHp && maxStun >= MECHS.ung.skills[0].stun - 0.1, `hp ${b.hp} stun ${maxStun}`);
  check('mine: consumed after triggering', m.zones.every((z) => z.kind !== 'mine'));
}
{
  const m = duel('ung', 'trau', [-5, -1], [9, -1]);
  const [a] = m.units;
  const x0 = a.x;
  run(m, 1, () => [inp({ s2: true, mx: 1 }), inp()]);
  check('blink: caster is hidden right after the cast', hidden(a));
  run(m, 10, () => [inp({ mx: 0 }), inp()]);
  check('blink: moved about its distance', a.x - x0 > MECHS.ung.skills[1].dist - 1.5, `dx ${a.x - x0}`);
  check('blink: stealth makes it unseen at range', !visibleTo(m, a, 1));
}
{
  const s = MECHS.ung.skills[2];
  const m = duel('ung', 'trau', [-5, -1], [5, -1]);
  const [a, b] = m.units;
  const c = createMatch({ seed: 2, roster: [{ team: 0, mech: 'ung', name: 'A' }, { team: 1, mech: 'trau', name: 'B' }, { team: 1, mech: 'hac', name: 'C' }] });
  put(c.units[0], -5, -1); put(c.units[1], 2, -1); put(c.units[2], 8, -1);
  run(c, Math.ceil((s.windup + 0.3) / TICK), (i) => [inp({ ult: i === 0, aim: 0 }), inp(), inp()]);
  check('beam: damages every enemy in the line', c.units[1].hp === c.units[1].maxHp - s.dmg && c.units[2].hp === c.units[2].maxHp - s.dmg, `hp ${c.units[1].hp} ${c.units[2].hp}`);
  const w = duel('ung', 'trau', [-14, 0], [-5, 0]);
  run(w, Math.ceil((s.windup + 0.3) / TICK), (i) => [inp({ ult: i === 0, aim: 0 }), inp()]);
  check('beam: does not pass through a wall', w.units[1].hp === w.units[1].maxHp);
}
{
  const m = duel('hac', 'ung', [-5, -1], [9, -1]);
  const ally = m.units[1];
  const m2 = createMatch({ seed: 2, roster: [{ team: 0, mech: 'hac', name: 'A' }, { team: 0, mech: 'trau', name: 'T' }, { team: 1, mech: 'ung', name: 'E' }] });
  const [h, t, e] = m2.units;
  put(h, -5, -1); put(t, -2, -1); put(e, 20, -1);
  t.hp = 1000; e.hp = 500; t.combatT = 0; e.combatT = 0;
  run(m2, 60, (i) => [inp({ s1: i === 0 }), inp(), inp()]);
  check('heal zone: heals allies inside', t.hp > 1000 + 120, `hp ${t.hp}`);
  check('heal zone: does not heal enemies', e.hp === 500, `hp ${e.hp}`);
}
{
  const m = duel('hac', 'trau', [-5, -1], [1, -1]);
  const [a, b] = m.units;
  run(m, 15, (i) => [inp({ s2: i === 0, tx: 1, tz: -1 }), inp()]);
  check('slow field: slows enemies inside', b.slowT > 0 && unitSpeed(b) < b.def.speed * 0.7, `speed ${unitSpeed(b)}`);
}
{
  const m = duel('hac', 'ung', [-2, -1], [9, -1]);
  const [h, e] = m.units;
  h.hp = Math.round(h.maxHp * 0.5);
  run(m, 2, (i) => [inp({ ult: i === 0 }), inp()]);
  const hp0 = h.hp;
  const ev = run(m, 40, (i) => [inp(), inp({ fire: true, aim: Math.PI })]);
  check('dome: stops enemy shots from outside (impact on dome)', ev.some((x) => x.t === 'impact' && x.on === 'dome'));
  check('dome: protected unit takes no hits', !ev.some((x) => x.t === 'hit' && x.id === 0) && h.hp >= hp0, `hp ${h.hp} vs ${hp0}`);
}

section('6 airdrops');
{
  const m = createMatch({ seed: 9, roster: [{ team: 0, mech: 'trau', name: 'A' }, { team: 1, mech: 'trau', name: 'B' }] });
  const [a] = m.units;
  let drop = null, landed = false;
  for (let i = 0; i < 40 * 30 && !landed; i++) {
    step(m);
    for (const e of m.events) { if (e.t === 'crateDrop' && !drop) drop = { ...e, time: m.time }; if (e.t === 'crateLand') landed = true; }
  }
  check('a crate drops within 40 s', !!drop && drop.time <= 40, drop ? `at ${drop.time.toFixed(1)}` : 'none');
  check('the crate type is a known pickup', !!drop && drop.type in PICKUPS);
  check('the crate lands', landed && m.crates.length === 1 && m.crates[0].fall <= 0);
  const c = m.crates[0];
  c.type = 'heal'; a.hp = 1000; a.combatT = 0;
  put(a, c.x, c.z);
  const ev = run(m, 2);
  check('driving onto a heal crate gives a pickup event', ev.some((e) => e.t === 'pickup' && e.id === 0 && e.type === 'heal'));
  check('heal crate raises hp', a.hp >= 1000 + a.maxHp * PICKUPS.heal.heal - 1, `hp ${a.hp}`);
  check('the crate is consumed', m.crates.length === 0);
  let l2 = false;
  for (let i = 0; i < 45 * 30 && !l2; i++) { step(m); if (m.events.some((e) => e.t === 'crateLand')) l2 = true; }
  const c2 = m.crates[0];
  c2.type = 'refresh'; a.cd.s1 = 7; a.cd.s2 = 7; a.cd.ult = 30; a.cd.heal = 12;
  put(a, c2.x, c2.z);
  run(m, 2);
  check('refresh crate zeroes cooldowns', a.cd.s1 === 0 && a.cd.s2 === 0 && a.cd.ult === 0 && a.cd.heal === 0, JSON.stringify(a.cd));
}

section('7 death and respawn');
{
  const m = duel('ung', 'trau', [-5, -1], [3, -1]);
  const [a, b] = m.units;
  b.hp = 100;
  const ev = run(m, 12, (i) => [inp({ fire: i === 0 }), inp()]);
  check('killed unit is not alive', !b.alive && b.hp <= 0 && ev.some((e) => e.t === 'death' && e.id === 1 && e.by === 0));
  check('killer team score +1', m.score[0] === 1 && m.score[1] === 0 && a.kills === 1 && b.deaths === 1, `score ${m.score}`);
  run(m, Math.floor(4.5 / TICK));
  check('still dead before the respawn time', !b.alive);
  put(a, 20, 20);
  run(m, Math.ceil(1 / TICK));
  const sp = m.map.spawns[1][b.slot % 5];
  check('respawns at its base after RULES.respawn', b.alive && b.hp === b.maxHp && Math.hypot(b.x - sp[0], b.z - sp[1]) < 1, `alive ${b.alive} pos ${b.x},${b.z}`);
}

section('8-12 bot matches');
const CALLS = [];
const COMP = ['trau', 'soi', 'ung', 'hac', 'soi'];
function runMatch(seed, diffs, opts = {}) {
  const roster = [];
  for (let t = 0; t < 2; t++) for (const mech of (opts.comp || COMP)) roster.push({ team: t, mech, name: mech + t, bot: true, diff: diffs[t] });
  const m = createMatch({ seed, roster });
  const dist = m.units.map(() => 0);
  let bad = null, thinkTotal = 0, thinkWorst = 0, ticks = 0;
  const limit = Math.ceil(m.duration / TICK) + 5;
  while (!m.over && ticks < limit) {
    const t0 = process.hrtime.bigint();
    const inputs = allInputs(m);
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    thinkTotal += dt; if (dt > thinkWorst) thinkWorst = dt;
    step(m, inputs);
    ticks++;
    for (const u of m.units) {
      if (!Number.isFinite(u.x) || !Number.isFinite(u.z) || !Number.isFinite(u.hp)) { bad = bad || `NaN unit ${u.id} tick ${m.tick}`; continue; }
      if (!u.alive) continue;
      if (Math.abs(u.x) > m.map.hw || Math.abs(u.z) > m.map.hd) bad = bad || `out of bounds unit ${u.id} tick ${m.tick} (${u.x.toFixed(1)}, ${u.z.toFixed(1)})`;
      if (solidAt(m.map, u.x, u.z, u.radius * 0.5)) bad = bad || `inside a wall unit ${u.id} tick ${m.tick} (${u.x.toFixed(1)}, ${u.z.toFixed(1)})`;
      const step_ = Math.hypot(u.x - u.px, u.z - u.pz);
      if (step_ < 2) dist[u.id] += step_;
    }
  }
  return { m, dist, bad, thinkTotal, thinkWorst, ticks };
}
const kills = (m, team) => m.units.filter((u) => u.team === team).reduce((a, u) => a + u.kills, 0);

const normals = [];
for (const seed of [11, 12, 13, 14]) normals.push(runMatch(seed, ['normal', 'normal']));

check('8a every bot match ends (m.over) by score or clock', normals.every((r) => r.m.over && (Math.max(...r.m.score) >= r.m.target || r.m.time >= r.m.duration - 1e-6)));
check('8b no NaN, nothing outside the map or inside a wall', normals.every((r) => !r.bad), normals.map((r) => r.bad).filter(Boolean)[0]);
{
  const a = runMatch(21, ['hard', 'normal']), b = runMatch(21, ['hard', 'normal']);
  const same = a.m.score.join() === b.m.score.join() && a.m.time === b.m.time && a.m.units.every((u, i) => u.x === b.m.units[i].x && u.z === b.m.units[i].z && u.hp === b.m.units[i].hp);
  check('9 determinism: same seed gives the same score, time and positions', same, `${a.m.score} vs ${b.m.score}`);
}

const tally = (da, db, seeds) => {
  let winsA = 0, winsB = 0, draws = 0, kA = 0, kB = 0;
  for (const seed of seeds) {
    const swap = seed % 2 === 1;
    const r = runMatch(seed, swap ? [db, da] : [da, db]);
    if (r.bad) check(`no sim fault in ${da} vs ${db} seed ${seed}`, false, r.bad);
    const ta = swap ? 1 : 0, tb = 1 - ta;
    kA += kills(r.m, ta); kB += kills(r.m, tb);
    if (r.m.score[ta] > r.m.score[tb]) winsA++; else if (r.m.score[tb] > r.m.score[ta]) winsB++; else draws++;
  }
  return { winsA, winsB, draws, kA, kB };
};
const SEEDS = [31, 32, 33, 34, 35, 36, 37, 38];
const he = tally('hard', 'easy', SEEDS), ne = tally('normal', 'easy', SEEDS.slice(0, 6)), hn = tally('hard', 'normal', SEEDS.slice(0, 6));
console.log(`hard vs easy   (8): hard ${he.winsA} - easy ${he.winsB} (draws ${he.draws}), kills ${he.kA}:${he.kB}`);
console.log(`normal vs easy (6): normal ${ne.winsA} - easy ${ne.winsB} (draws ${ne.draws}), kills ${ne.kA}:${ne.kB}`);
console.log(`hard vs normal (6): hard ${hn.winsA} - normal ${hn.winsB} (draws ${hn.draws}), kills ${hn.kA}:${hn.kB}`);
check('10a hard beats easy in a clear majority', he.winsA >= 6 && he.winsA > he.winsB * 2, `${he.winsA}-${he.winsB}`);
check('10b hard has more total kills than easy', he.kA > he.kB * 1.3, `${he.kA}:${he.kB}`);
check('10c normal beats easy (kills and wins)', ne.kA > ne.kB && ne.winsA > ne.winsB, `${ne.kA}:${ne.kB}`);
check('10d hard beats normal on kills', hn.kA > hn.kB, `${hn.kA}:${hn.kB}`);

{
  let minMoved = 1e9;
  for (const r of normals) for (const d of r.dist) minMoved = Math.min(minMoved, d);
  const totalKills = normals.map((r) => r.m.units.reduce((a, u) => a + u.kills, 0));
  const len = normals.reduce((a, r) => a + r.m.time, 0) / normals.length;
  const kpm = normals.reduce((a, r) => a + r.m.units.reduce((s, u) => s + u.kills, 0) / (r.m.time / 60), 0) / normals.length;
  check('11a every bot moved more than 100 m in every normal match', minMoved > 100, `min ${minMoved.toFixed(0)} m`);
  check('11b at least 15 kills per normal match', totalKills.every((k) => k >= 15), `kills ${totalKills}`);
  console.log(`normal vs normal: avg length ${len.toFixed(0)} s, ${kpm.toFixed(1)} kills/min, kills per match ${totalKills.join(',')}, min distance ${minMoved.toFixed(0)} m`);
  const by = {};
  for (const r of normals) for (const u of r.m.units) { const k = (by[u.mech] ||= { k: 0, d: 0, a: 0, n: 0 }); k.k += u.kills; k.d += u.deaths; k.a += u.assists; k.n++; }
  console.log('per-mech K/D: ' + Object.keys(by).map((k) => `${k} ${by[k].k}/${by[k].d} (${(by[k].k / Math.max(1, by[k].d)).toFixed(2)})`).join('  '));
  const tt = normals.reduce((a, r) => a + r.thinkTotal, 0), tk = normals.reduce((a, r) => a + r.ticks, 0);
  const worst = Math.max(...normals.map((r) => r.thinkWorst));
  console.log(`bot think time (10 bots): avg ${(tt / tk).toFixed(3)} ms/tick, worst ${worst.toFixed(2)} ms`);
  check('12a average think time of 10 bots is well under 1 ms/tick', tt / tk < 1, `${(tt / tk).toFixed(3)} ms`);
  check('12b worst-tick think time under 20 ms', worst < 20, `${worst.toFixed(2)} ms`);
}

console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
