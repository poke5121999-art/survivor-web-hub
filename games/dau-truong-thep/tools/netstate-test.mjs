// Node test for js/netstate.js: `node tools/netstate-test.mjs`. Exits 1 on any failure.
// Real bot matches in every mode, snapshotted every 2 ticks into a mirror, compared field by field.
import { createMatch, step, visibleTo, hidden, unitSpeed } from '../js/sim.js';
import { allInputs } from '../js/bots.js';
import { MECHS, MECH_ORDER, MODE_ORDER, TICK } from '../js/data.js';
import { snapshot, roster, createMirror, applySnapshot, packEvents } from '../js/netstate.js';

let failed = 0, passed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); }
};

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const TIMERS = ['respawnT', 'shield', 'shieldMax', 'shieldT', 'slowT', 'stunT', 'hasteT', 'rapidT', 'dmgT', 'stealthT', 'invulnT', 'revealT', 'healT'];
const COUNTS = ['kills', 'deaths', 'assists', 'bush'];
const ZONE_FIELDS = {
  strike: ['r', 'age', 'delay', 'total', 'lob', 'x0', 'z0'],
  mine: ['r', 'age', 'delay', 'dur', 'blast'],
  field: ['r', 'age', 'delay', 'dur', 'vis', 'hide', 'pull', 'hps', 'dps', 'slow'],
  dome: ['r', 'age', 'delay', 'dur'],
  wall: ['r', 'age', 'delay', 'dur', 'a'],
  turret: ['r', 'age', 'delay', 'dur', 'hp', 'maxHp', 'aim', 'range'],
};

// Every difference between the real match and the mirror, as strings.
function diff(real, mir) {
  const bad = [];
  const eq = (what, a, b, tol = 0.011) => {
    const ok = typeof a === 'number' && typeof b === 'number' ? near(a, b, tol) : a === b;
    if (!ok) bad.push(`${what}: ${a} vs ${b}`);
  };
  eq('tick', real.tick, mir.tick, 0); eq('time', real.time, mir.time, 1e-6);
  eq('over', real.over, mir.over); eq('winner', real.winner, mir.winner); eq('lives', real.lives, mir.lives);
  eq('score', JSON.stringify(real.score), JSON.stringify(mir.score));
  real.points.forEach((p, i) => { eq(`point${i}.owner`, p.owner, mir.points[i].owner); eq(`point${i}.prog`, p.prog, mir.points[i].prog, 0.0006); eq(`point${i}.x`, p.x, mir.points[i].x); });
  real.vents.forEach((v, i) => { eq(`vent${i}.t`, v.t, mir.vents[i].t); eq(`vent${i}.warn`, v.warn, mir.vents[i].warn); });
  real.units.forEach((u, i) => {
    const o = mir.units[i], w = `unit${i}.`;
    eq(w + 'x', u.x, o.x, 0.02); eq(w + 'z', u.z, o.z, 0.02);
    eq(w + 'aim', u.aim, o.aim, 0.0006); eq(w + 'heading', u.heading, o.heading);
    eq(w + 'hp', u.hp, o.hp, 1); eq(w + 'maxHp', u.maxHp, o.maxHp, 0); eq(w + 'alive', u.alive, o.alive);
    eq(w + 'bot', u.bot, o.bot); eq(w + 'dash', !!u.dash, !!o.dash);
    for (const k of TIMERS) eq(w + k, u[k], o[k]);
    for (const k of COUNTS) eq(w + k, u[k], o[k], 0);
    for (const k in u.cd) eq(w + 'cd.' + k, u.cd[k], o.cd[k]);
    eq(w + 'dmg', u.dmg, o.dmg, 1); eq(w + 'healed', u.healed, o.healed, 1);
    eq(w + 'cast', !!u.cast, !!o.cast);
    if (u.cast && o.cast) {
      eq(w + 'cast.skill', u.cast.skill.id, o.cast.skill.id); eq(w + 'cast.t', u.cast.t, o.cast.t); eq(w + 'cast.total', u.cast.total, o.cast.total);
      eq(w + 'cast.aim', u.cast.aim, o.cast.aim, 0.0006); eq(w + 'cast.move', u.cast.move, o.cast.move);
    }
    eq(w + 'def', u.def, o.def); eq(w + 'team', u.team, o.team); eq(w + 'color', u.color, o.color);
    eq(w + 'unitSpeed', unitSpeed(u), unitSpeed(o), 0.2);
    if (u.slowT > 0) eq(w + 'slowF', u.slowF, o.slowF);
    if (u.hasteT > 0) eq(w + 'hasteF', u.hasteF, o.hasteF);
  });
  eq('shots', real.shots.length, mir.shots.length, 0);
  const ms = new Map(mir.shots.map((s) => [s.id, s]));
  for (const s of real.shots) {
    const o = ms.get(s.id), w = `shot${s.id}.`;
    if (!o) { bad.push(w + 'missing'); continue; }
    for (const k of ['team', 'color', 'owner', 'vis']) eq(w + k, s[k], o[k]);
    eq(w + 'x', s.x, o.x, 0.02); eq(w + 'z', s.z, o.z, 0.02); eq(w + 'dx', s.dx, o.dx, 0.002); eq(w + 'dz', s.dz, o.dz, 0.002);
    eq(w + 'speed', s.speed, o.speed, 0); eq(w + 'r', s.r, o.r, 0);
  }
  eq('zones', real.zones.length, mir.zones.length, 0);
  const mz = new Map(mir.zones.map((z) => [z.id, z]));
  for (const z of real.zones) {
    const o = mz.get(z.id), w = `zone${z.id}(${z.kind}).`;
    if (!o) { bad.push(w + 'missing'); continue; }
    for (const k of ['kind', 'team', 'color', 'owner']) eq(w + k, z[k], o[k]);
    eq(w + 'x', z.x, o.x, 0.02); eq(w + 'z', z.z, o.z, 0.02);
    for (const k of ZONE_FIELDS[z.kind]) {
      const rv = z[k] ?? (k === 'lob' ? false : 0);   // a plain strike has no lob, x0, z0
      if (typeof rv === 'boolean') eq(w + k, rv, !!o[k]);
      else eq(w + k, rv, o[k], k === 'aim' || k === 'a' ? 0.0006 : k === 'hp' ? 1 : 0.011);
    }
    if (z.kind === 'wall') {
      eq(w + 'pts', z.pts.length, o.pts.length, 0);
      z.pts.forEach((p, i) => { eq(w + 'pts.x', p[0], o.pts[i][0], 0.011); eq(w + 'pts.z', p[1], o.pts[i][1], 0.011); });
    }
  }
  eq('crates', real.crates.length, mir.crates.length, 0);
  real.crates.forEach((c, i) => { const o = mir.crates[i]; if (!o) return; eq('crate.id', c.id, o.id, 0); eq('crate.type', c.type, o.type); eq('crate.x', c.x, o.x, 0.02); eq('crate.fall', c.fall, o.fall); eq('crate.age', c.age, o.age); });
  real.props.forEach((p, i) => eq(`prop${i}.alive`, p.alive, mir.props[i].alive));
  return bad;
}

// Expected event list: independent rounding to 2 decimals, through JSON like the real wire.
const wireEvents = (events) => JSON.parse(JSON.stringify(events, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v)));

function makeRoster(mode, diff) {
  const mech = (i) => MECH_ORDER[i % MECH_ORDER.length];
  const out = [];
  for (let i = 0; i < 5; i++) out.push({ team: 0, mech: mech(i), name: 'A' + i, bot: true, diff, mods: i === 0 ? { hp: 1.2, dmg: 1.2 } : undefined, paint: i === 1 ? 'vang' : null });
  if (mode === 'trum') out.push({ team: 1, mech: 'titan', name: 'Cự Thần', bot: true, diff });
  else for (let i = 0; i < 5; i++) out.push({ team: 1, mech: mech(i + 3), name: 'B' + i, bot: true, diff });
  return out;
}

// Bots do not play free-for-all yet (botInput indexes bases by team): fall back to a scripted driver that fights, so
// the codec still sees a busy 10-unit match.
function scripted(m, i) {
  const out = [];
  for (const u of m.units) {
    let best = null, bd = 1e9;
    for (const o of m.units) if (o !== u && o.alive) { const d = (o.x - u.x) ** 2 + (o.z - u.z) ** 2; if (d < bd) { bd = d; best = o; } }
    if (!best) continue;
    const a = Math.atan2(best.z - u.z, best.x - u.x), side = Math.sin(i / 25 + u.id) * 0.8;
    const roll = (i * 7 + u.id * 13) % 97;
    out[u.id] = { mx: Math.cos(a + side) * (bd > 36 ? 1 : -0.3), mz: Math.sin(a + side) * (bd > 36 ? 1 : -0.3), aim: a, fire: true,
      s1: roll === 3 || roll === 50, s2: roll === 20, ult: roll === 70, heal: roll === 40, tx: best.x, tz: best.z };
  }
  return out;
}
const botsWork = (mode) => {
  try { const m = createMatch({ map: 'denrung', seed: 1, mode, roster: makeRoster(mode, 'normal') }); allInputs(m); return true; } catch (e) { return false; }
};

const seenKinds = new Set();
const sizes = [];

// Runs `m` for up to `ticks` ticks (or to the end), mirroring every 2nd tick. Returns tallies.
function mirrorRun(label, m, ticks, inputsFor) {
  const rosterData = JSON.parse(JSON.stringify(roster(m)));
  const mir = createMirror(rosterData);
  const t = { snaps: 0, bad: [], events: 0, lost: 0, order: true, kept: 0, kinds: 0, pxOk: true, newShotOk: true, vis: 0, visBad: 0, hid: 0, hidBad: 0, maxShots: 0, maxLen: 0, sumLen: 0 };
  let pending = [], prev = null;
  for (let i = 0; i < ticks && !m.over; i++) {
    step(m, inputsFor ? inputsFor(m, i) : allInputs(m));
    for (const e of m.events) pending.push(e);
    if (m.tick % 2) continue;
    const snap = snapshot(m);
    const text = JSON.stringify(snap), batch = JSON.stringify(packEvents(pending));
    t.snaps++; t.maxLen = Math.max(t.maxLen, text.length); t.sumLen += text.length; t.maxShots = Math.max(t.maxShots, m.shots.length);
    sizes.push({ len: text.length, shots: m.shots.length, units: m.units.length });
    const before = new Map(mir.shots.map((s) => [s.id, { s, x: s.x, z: s.z }]));
    const prevPos = mir.units.map((u) => [u.x, u.z, u.alive]);
    applySnapshot(mir, JSON.parse(text), 2 * TICK);
    mir.events = JSON.parse(batch);
    // events replay in order, none lost or duplicated
    const want = JSON.stringify(wireEvents(pending));
    t.events += pending.length;
    if (JSON.stringify(mir.events) !== want) { t.lost++; t.bad.push('events differ at tick ' + m.tick); }
    pending = [];
    const d = diff(m, mir);
    if (d.length) t.bad.push(`tick ${m.tick}: ${d.slice(0, 4).join('; ')}`);
    // interpolation pair: previous snapshot position, identity kept for shots in two consecutive snapshots
    mir.units.forEach((u, k) => {
      const [x, z, alive] = prevPos[k];
      if (prev && alive && u.alive && Math.hypot(u.x - x, u.z - z) < 6 && (!near(u.px, x, 1e-9) || !near(u.pz, z, 1e-9))) t.pxOk = false;
    });
    for (const s of mir.shots) {
      const b = before.get(s.id);
      if (b) { t.kept++; if (b.s !== s || !near(s.px, b.x, 1e-9) || !near(s.pz, b.z, 1e-9)) t.newShotOk = false; }
      else if (!near(s.px, s.x - s.dx * s.speed * 2 * TICK, 1e-6) || !near(s.pz, s.z - s.dz * s.speed * 2 * TICK, 1e-6)) t.newShotOk = false;
    }
    // read paths the renderer and HUD use
    for (const team of m.mode === 'tudo' ? [0, 1, 4] : [0, 1]) for (const u of m.units) {
      t.vis++; if (visibleTo(m, u, team) !== visibleTo(mir, mir.units[u.id], team)) t.visBad++;
    }
    for (const u of m.units) { t.hid++; if (hidden(u) !== hidden(mir.units[u.id])) t.hidBad++; }
    for (const z of m.zones) seenKinds.add(z.kind);
    prev = snap;
  }
  return t;
}

function report(label, t) {
  check(`${label}: mirror matches the real match on ${t.snaps} snapshots`, t.bad.length === 0, t.bad.slice(0, 3).join(' | ') + ` (${t.bad.length} bad)`);
  check(`${label}: ${t.events} events replay in order, none lost or duplicated`, t.lost === 0 && t.events > 0);
  check(`${label}: px/pz hold the previous snapshot position`, t.pxOk);
  check(`${label}: shots keep identity by id (${t.kept} carried), new ones start dtSnapshot back`, t.newShotOk);
  check(`${label}: hidden() agrees on mirror units`, t.hidBad === 0, `${t.hidBad}/${t.hid}`);
  check(`${label}: visibleTo() agrees within rounding (${t.visBad}/${t.vis} at a boundary)`, t.visBad <= Math.max(2, t.vis * 0.002));
}

console.log('# bot matches, every mode');
for (const mode of MODE_ORDER) {
  const m = createMatch({ map: mode === 'chiem' ? 'xuongcat' : 'denrung', seed: 11, mode, roster: makeRoster(mode, 'hard') });
  const bots = botsWork(mode);
  const t = mirrorRun(mode, m, 12000, bots ? undefined : scripted);
  console.log(`  ${mode} (${bots ? 'bots' : 'scripted inputs, bots cannot play it yet'}): ${t.snaps} snapshots, ended=${m.over} score=${m.score.join('-')} max shots=${t.maxShots} avg=${Math.round(t.sumLen / t.snaps)} max=${t.maxLen} bytes`);
  report(mode, t);
}
{
  const ends = new Set();
  for (const map of ['cangbang', 'mienglua']) {
    const m = createMatch({ map, seed: 5, mode: 'tdm', roster: makeRoster('tdm', 'normal') });
    const t = mirrorRun(map, m, 4000);
    ends.add(map);
    report(map, t);
  }
}

console.log('\n# every skill of every mech: casts, zones, dashes, walls, turrets, domes');
{
  let bad = 0, snaps = 0, evTotal = 0;
  const first = [];
  for (const key of MECH_ORDER) for (let slot = 0; slot < 3; slot++) {
    const m = createMatch({ map: 'denrung', seed: 3, roster: [{ team: 0, mech: key, name: 'A' }, { team: 1, mech: 'trau', name: 'B' }, { team: 0, mech: 'hac', name: 'C' }] });
    const [a, b, c] = m.units;
    a.x = a.px = -4; a.z = a.pz = -1; b.x = b.px = 3; b.z = b.pz = -1; c.x = c.px = -6; c.z = c.pz = -2;
    const keyName = ['s1', 's2', 'ult'][slot];
    const t = mirrorRun(`${key}.${keyName}`, m, 150, (mm, i) => {
      const inp = (o) => ({ mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 3, tz: -1, ...o });
      return [inp({ fire: i % 20 < 10, [keyName]: i % 40 === 5, aim: 0, mx: i > 60 ? 0.3 : 0 }), inp({ aim: Math.PI, fire: true }), inp({ s1: true, aim: 0 })];
    });
    snaps += t.snaps; evTotal += t.events;
    if (t.bad.length || t.lost || !t.newShotOk || !t.pxOk || t.hidBad) { bad++; first.push(`${key}.${keyName}: ${t.bad[0] || 'order/px/shots'}`); }
  }
  check(`skills: 24 casts mirrored over ${snaps} snapshots, ${evTotal} events`, bad === 0, first.slice(0, 3).join(' | '));
}
check(`zone kinds exercised: ${[...seenKinds].sort().join(', ')}`, ['strike', 'mine', 'field', 'dome', 'wall', 'turret'].every((k) => seenKinds.has(k)));

console.log('\n# snapshot size');
{
  const lens = sizes.map((s) => s.len), busy = sizes.filter((s) => s.shots >= 15);
  const avg = Math.round(lens.reduce((a, b) => a + b, 0) / lens.length), max = Math.max(...lens);
  const worst = sizes.reduce((a, b) => (b.len > a.len ? b : a));
  const busyAvg = busy.length ? Math.round(busy.reduce((a, b) => a + b.len, 0) / busy.length) : 0;
  console.log(`  all ${lens.length} snapshots: avg ${avg} B, max ${max} B (${worst.shots} shots, ${worst.units} units); busy (>=15 shots) ${busy.length}: avg ${busyAvg} B`);
  check(`snapshot stays under 6000 bytes (max ${max})`, max < 6000);
}
{
  // synthetic worst case: 10 units, 60 shots in the air
  const m = createMatch({ map: 'denrung', seed: 2, roster: makeRoster('tdm', 'hard') });
  for (let i = 0; i < 60; i++) m.shots.push({ id: 1000 + i, team: i % 2, owner: i % 10, x: i * 1.234 - 30, z: 12.345 - i * 0.77, px: 0, pz: 0, dx: Math.cos(i), dz: Math.sin(i), speed: 34, left: 10, color: i % 2, vis: 'bullet', r: 0.2, dmg: 60, splash: 0 });
  const len = JSON.stringify(snapshot(m)).length;
  console.log(`  synthetic 10 units + 60 shots: ${len} B`);
  check(`10 units + 60 shots under 4 KB (${len})`, len < 4096);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
