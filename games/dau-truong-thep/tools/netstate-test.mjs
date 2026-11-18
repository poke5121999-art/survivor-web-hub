// Node test for js/netstate.js: `node tools/netstate-test.mjs`. Exits 1 on any failure.
// Real bot matches in every mode, snapshotted every 2 ticks, sent as bytes into a mirror, compared field by field.
// Then the guest's prediction of its own mech against the host, with and without delay.
import { createMatch, step, visibleTo, hidden, unitSpeed, meterArmed } from '../js/sim.js';
import { allInputs } from '../js/bots.js';
import { MECHS, MECH_ORDER, MODES, TICK } from '../js/data.js';
const MODE_ORDER = Object.keys(MODES);   // every sim mode, trum (the Phó bản boss engine) included
import { snapshot, roster, createMirror, applySnapshot, packEvents, unpackEvents, encodeSnap, decodeSnap, encodeSnapPacket, decodeSnapPacket, encodeInputPacket, decodeInputPacket, wireInput, STATUS_NAMES } from '../js/netstate.js';
import { createPredictor, createGunner } from '../js/predict.js';

let failed = 0, passed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); }
};

const near = (a, b, tol) => Math.abs(a - b) <= tol;
// Angles travel as a fraction of a turn: 3.2 rad and 3.2 - 2 pi are the same direction.
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const TIMERS = ['respawnT', 'shield', 'shieldMax', 'shieldT', 'slowT', 'stunT', 'hasteT', 'rapidT', 'dmgT', 'stealthT', 'invulnT', 'revealT', 'healT', 'armorT', 'rageT', 'markT', 'primeT', 'charge', 'meter', 'stkN', 'stkT', 'parryT', 'airT'];
const COUNTS = ['kills', 'deaths', 'assists', 'bush'];
const ZONE_FIELDS = {
  strike: ['r', 'age', 'delay', 'total', 'lob', 'x0', 'z0'],
  mine: ['r', 'age', 'delay', 'dur', 'blast'],
  field: ['r', 'age', 'delay', 'dur', 'vis', 'hide', 'pull', 'hps', 'dps', 'slow', 'cage', 'held'],
  dome: ['r', 'age', 'delay', 'dur'],
  wall: ['r', 'age', 'delay', 'dur', 'a', 'screen'],
  turret: ['r', 'age', 'delay', 'dur', 'hp', 'maxHp', 'aim', 'range'],
  decoy: ['r', 'age', 'delay', 'dur', 'hp', 'maxHp', 'aim'],
  drone: ['r', 'age', 'delay', 'dur'],
  wire: ['r', 'age', 'delay', 'dur', 'left'],
  orbit: ['r', 'age', 'delay', 'dur', 'mode', 'n', 'live', 'ring', 'spin'],
  portal: ['r', 'age', 'delay', 'dur', 'x2', 'z2'],
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
    eq(w + 'aim', turn(u.aim, o.aim), 0, 0.0006); eq(w + 'heading', turn(u.heading, o.heading), 0, 0.0056);
    eq(w + 'hp', u.hp, o.hp, 1); eq(w + 'maxHp', u.maxHp, o.maxHp, 0); eq(w + 'alive', u.alive, o.alive);
    eq(w + 'bot', u.bot, o.bot); eq(w + 'dash', !!u.dash, !!o.dash); eq(w + 'stance', !!u.stance, !!o.stance);
    for (const k of TIMERS) eq(w + k, u[k], o[k]);
    for (const k of COUNTS) eq(w + k, u[k], o[k], 0);
    for (const k in u.cd) eq(w + 'cd.' + k, u.cd[k], o.cd[k]);
    eq(w + 'dmg', u.dmg, o.dmg, 1); eq(w + 'healed', u.healed, o.healed, 1);
    eq(w + 'cast', !!u.cast, !!o.cast);
    if (u.cast && o.cast) {
      eq(w + 'cast.skill', u.cast.skill.id, o.cast.skill.id); eq(w + 'cast.t', u.cast.t, o.cast.t); eq(w + 'cast.total', u.cast.total, o.cast.total);
      eq(w + 'cast.aim', turn(u.cast.aim, o.cast.aim), 0, 0.0006); eq(w + 'cast.move', u.cast.move, o.cast.move);
    }
    eq(w + 'form', u.form, o.form, 0); eq(w + 'def', u.def, o.def); eq(w + 'team', u.team, o.team); eq(w + 'color', u.color, o.color);
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
      else if (k === 'aim' || k === 'a') eq(w + k, turn(rv, o[k]), 0, 0.0006);
      else eq(w + k, rv, o[k], k === 'hp' ? 1 : 0.011);
    }
    if (z.kind === 'wall' || z.kind === 'wire') {
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
  for (let i = 0; i < 5; i++) out.push({ team: 0, mech: mech(i), name: 'A' + i, bot: true, diff, mods: i === 0 ? { hp: 1.2, dmg: 1.2 } : i === 2 ? { lv: [5, 4, 3, 2, 5] } : undefined, skin: i === 1 ? 's' : i === 3 ? 'ss' : null });
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
    const batch = JSON.stringify(packEvents(pending));
    // Every 5th snapshot carries the slow facts; the comparison below runs on those, where the mirror must be whole.
    const slow = t.snaps % 5 === 0, bytes = encodeSnapPacket(t.snaps + 1, 7, 1, [{ seq: t.snaps + 1, json: batch }], encodeSnap(snap, { stats: slow, props: slow }));
    t.snaps++; t.maxLen = Math.max(t.maxLen, bytes.length); t.sumLen += bytes.length; t.maxShots = Math.max(t.maxShots, m.shots.length);
    sizes.push({ len: bytes.length, json: JSON.stringify(snap).length + batch.length, shots: m.shots.length, units: m.units.length });
    const packet = decodeSnapPacket(bytes);
    const before = new Map(mir.shots.map((s) => [s.id, { s, x: s.x, z: s.z }]));
    const prevPos = mir.units.map((u) => [u.x, u.z, u.alive]);
    applySnapshot(mir, packet.snap, 2 * TICK);
    mir.events = packet.batches[0][1];
    if (packet.q !== t.snaps || packet.applied !== 7 || packet.base !== 1 || packet.batches[0][0] !== t.snaps) t.bad.push('packet header differs at tick ' + m.tick);
    // events replay in order, none lost or duplicated
    const want = JSON.stringify(wireEvents(pending));
    t.events += pending.length;
    if (JSON.stringify(mir.events) !== want) { t.lost++; t.bad.push('events differ at tick ' + m.tick); }
    pending = [];
    const d = slow ? diff(m, mir) : [];
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
  check(`skills: ${MECH_ORDER.length * 3} casts mirrored over ${snaps} snapshots, ${evTotal} events`, bad === 0, first.slice(0, 3).join(' | '));
}
// a meter value shown on the HUD reaches the guest, and an armed one arms on the mirror too
{
  const m = createMatch({ map: 'denrung', seed: 3, roster: [{ team: 0, mech: 'gilgamesh', name: 'A' }, { team: 1, mech: 'tegiac', name: 'B' }, { team: 0, mech: 'luondien', name: 'C' }] });
  const mir = createMirror(roster(m));
  m.units[0].meter = 800.25; m.units[1].meter = 100; m.units[2].meter = 3;
  step(m, [undefined, undefined, undefined]);
  applySnapshot(mir, decodeSnap(encodeSnap(snapshot(m))), TICK);
  const [g, t, l] = mir.units;
  check('meter value reaches the guest (800.25 / 100 / 3, to the hundredth)', near(g.meter, 800.25, 0.011) && near(t.meter, 100, 0.011) && near(l.meter, 3, 0.011), `${g.meter} ${t.meter} ${l.meter}`);
  check('an armed meter is armed on the mirror (tegiac 100 of 100), a half-full one is not (gilgamesh, luondien 3 of 5)', meterArmed(t) && !meterArmed(g) && !meterArmed(l));
}
// kit-remake G1: skill uses spent (charges), the gap between two uses and antiheal reach the guest (its HUD reads them)
{
  const m = createMatch({ map: 'denrung', seed: 3, roster: [{ team: 0, mech: 'gilgamesh', name: 'A' }, { team: 1, mech: 'tegiac', name: 'B' }] });
  const mir = createMirror(roster(m));
  const [a, b] = m.units;
  a.use0 = 2; a.use2 = 1; a.gap0 = 0.75; b.ahT = 1.5; b.ahF = 0.5;
  step(m, [undefined, undefined]);
  applySnapshot(mir, decodeSnap(encodeSnap(snapshot(m))), TICK);
  const [ga, gb] = mir.units;
  check('uses, gap and antiheal reach the guest (2 / 1 spent, gap and antiheal to the hundredth)', ga.use0 === 2 && ga.use2 === 1 && ga.use1 === 0 && near(ga.gap0, a.gap0, 0.011) && near(gb.ahT, b.ahT, 0.011), `${ga.use0} ${ga.use2} ${ga.gap0} ${gb.ahT}`);
}
// kit-remake G2: slowG, slowFire, tags, energy, save icd and guard vs reach the guest (speed and HUD read them)
{
  const m = createMatch({ map: 'denrung', seed: 3, roster: [{ team: 0, mech: 'gilgamesh', name: 'A' }, { team: 1, mech: 'tegiac', name: 'B' }] });
  const mir = createMirror(roster(m));
  const [a, b] = m.units;
  a.en = 37.5; a.svT = 5; a.gvT = 1.25; b.dsT = 1; b.dsD = 2; b.dsF = 0.6; b.sfT = 2; b.tags['x@0'] = 1.5;
  step(m, [undefined, undefined]);
  applySnapshot(mir, decodeSnap(encodeSnap(snapshot(m))), TICK);
  const [ga, gb] = mir.units;
  check('G2 status reaches the guest (energy, save icd, guard vs, slowG, slowFire, tag time, to the hundredth)', near(ga.en, 37.5, 0.011) && near(ga.svT, a.svT, 0.011) && near(ga.gvT, a.gvT, 0.011) && gb.slowG > 0 && near(gb.slowG, b.slowG, 0.011) && near(gb.sfT, b.sfT, 0.011) && near(gb.tgT, b.tgT, 0.011) && b.tgT > 1.4, `${ga.en} ${gb.slowG} ${b.slowG} ${gb.tgT}`);
}
// the row mask has more than one word: the last synced status (past bit 28 of the first word) survives the bytes, the others stay 0
{
  const m = createMatch({ map: 'denrung', seed: 3, roster: [{ team: 0, mech: 'gilgamesh', name: 'A' }, { team: 1, mech: 'tegiac', name: 'B' }] });
  const mir = createMirror(roster(m));
  const snap = snapshot(m), row = snap.u[0], at = 8 + 5 + STATUS_NAMES.length - 1;
  row[at] = 7.25; row[at - 1] = 0;
  const back = decodeSnap(encodeSnap(snap)).u[0];
  check(`row mask word 2: ${STATUS_NAMES[STATUS_NAMES.length - 1]} = 7.25 (bit ${4 + 6 + STATUS_NAMES.length - 1}) comes back, its neighbour stays 0`, STATUS_NAMES.length + 10 > 28 && back[at] === 7.25 && back[at - 1] === 0, `${back[at]} ${back[at - 1]}`);
  applySnapshot(mir, decodeSnap(encodeSnap(snap)), TICK);
  check('... and reaches the mirror unit under its name', mir.units[0][STATUS_NAMES[STATUS_NAMES.length - 1]] === 7.25);
}
// kit-remake G4: the magazine (shots fired, reload left) and the selfShield's block count reach the guest (they sit in mask word 2)
{
  const m = createMatch({ map: 'denrung', seed: 3, roster: [{ team: 0, mech: 'gilgamesh', name: 'A' }, { team: 1, mech: 'tegiac', name: 'B' }] });
  const mir = createMirror(roster(m));
  const [a, b] = m.units;
  a.magN = 3; a.magT = 1.5; b.blockN = 2;
  applySnapshot(mir, decodeSnap(encodeSnap(snapshot(m))), TICK);
  const [ga, gb] = mir.units;
  check('G4 magN 3, magT 1.5 and blockN 2 reach the guest', ga.magN === 3 && near(ga.magT, 1.5, 0.011) && gb.blockN === 2 && STATUS_NAMES.indexOf('blockN') + 10 >= 28, `${ga.magN} ${ga.magT} ${gb.blockN}`);
}
// a stance change reaches the guest: its mirror unit plays the other def; the rewind history never travels
{
  const m = createMatch({ map: 'denrung', seed: 3, roster: [{ team: 0, mech: 'anduong', name: 'A' }, { team: 1, mech: 'trau', name: 'B' }, { team: 0, mech: 'vesau', name: 'C' }] });
  const mir = createMirror(roster(m));
  const none = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };
  step(m, [{ ...none, s2: true }, none, none]);
  for (let i = 0; i < 12; i++) step(m, [none, none, none]);
  const snap = snapshot(m);
  applySnapshot(mir, decodeSnap(encodeSnap(snap)), TICK);
  check('a form change reaches the guest: the mirror plays the heavy bow (same def object, form 1, Nỏ Nặng)', m.units[0].form === 1 && mir.units[0].form === 1 && mir.units[0].def === m.units[0].def && mir.units[0].def.weapon.name === 'Nỏ Nặng', `${mir.units[0].form}`);
  check('the rewind history stays on the host (no hpHist in a snapshot, none on the mirror)', !JSON.stringify(snap).includes('hpHist') && mir.units.every((u) => !u.hpHist || u.hpHist.length === 0));
}
// Lữ Bố: a second stage in its wind-up (Hoành Tảo, a next.row) travels as its own row, and a knock-up (airT) reaches the guest
{
  const m = createMatch({ map: 'denrung', seed: 3, roster: [{ team: 0, mech: 'lubo', name: 'A' }, { team: 1, mech: 'ung', name: 'B' }] });
  for (const p of m.props) p.alive = false;
  m.map.walls.length = 0; m.map.rounds.length = 0;
  const [a, v] = m.units;
  a.x = a.px = 0; a.z = a.pz = 0; v.x = v.px = 7; v.z = v.pz = 0;
  const mir = createMirror(roster(m));
  const none = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };
  step(m, [{ ...none, s2: true, tx: 6, tz: 0 }, none]);
  applySnapshot(mir, decodeSnap(encodeSnap(snapshot(m))), TICK);
  check('a knock-up reaches the guest (airT to the hundredth)', v.airT > 0.4 && near(mir.units[1].airT, v.airT, 0.011), `${v.airT} ${mir.units[1].airT}`);
  step(m, [none, none]);
  step(m, [{ ...none, s2: true, tx: 7, tz: 0 }, none]);
  applySnapshot(mir, decodeSnap(encodeSnap(snapshot(m))), TICK);
  const c = m.units[0].cast, mc = mir.units[0].cast;
  check('a second-stage wind-up is mirrored as that row (hoanhtao, the same row object)', !!c && c.skill.id === 'hoanhtao' && !!mc && mc.skill === c.skill && near(mc.t, c.t, 0.011), `${c && c.skill.id} ${mc && mc.skill && mc.skill.id}`);
}
// kit-remake G4: a totem zone is mirrored with its hp and area
{
  const m = createMatch({ map: 'denrung', seed: 3, roster: [{ team: 0, mech: 'gilgamesh', name: 'A' }, { team: 1, mech: 'tegiac', name: 'B' }] });
  const mir = createMirror(roster(m));
  m.zones.push({ id: m.nextId++, kind: 'totem', team: 0, color: 0, owner: 0, x: 3, z: 4, r: 0.8, area: 4, age: 0.5, delay: 0, hp: 250, maxHp: 300, dur: 10, decay: 0, hps: 0, dps: 0, acc: 0 });
  step(m, [undefined, undefined]);
  applySnapshot(mir, decodeSnap(encodeSnap(snapshot(m))), TICK);
  const gz = mir.zones.find((z) => z.kind === 'totem');
  // TODO kit-remake G4: check magN / magT / blockN on the mirror once they are in STATUS (see netstate.js)
  check('G4: a totem zone is mirrored (hp 250 of 300, area 4)', !!gz && gz.hp === 250 && gz.maxHp === 300 && near(gz.area, 4, 0.011), `${gz && gz.hp} ${gz && gz.area}`);
}
// kit lane K1: no tank carries a wire row since tacke plays Captain America; mirror the old Dây Điện row as a fixture so the wire zone stays covered
{
  const WIRE = { id: 'daydien', cd: 12, do: 'wire', cast: 10, width: 6, dur: 14, dmg: 200, slow: 0.5, slowDur: 2, charges: 3, arm: 0.5 };
  const m = createMatch({ map: 'denrung', seed: 3, roster: [{ team: 0, mech: 'tacke', name: 'A' }, { team: 1, mech: 'ung', name: 'B' }] }), u = m.units[0];
  u.def = { ...u.def, skills: [WIRE, u.def.skills[1], u.def.skills[2]] };
  const idle = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };
  const t = mirrorRun('wire fixture', m, 40, (mm, i) => [{ ...idle, s1: i === 2, tx: u.x + 5, tz: u.z }, idle]);
  // the patched def itself differs from the mirror's (built from the roster key); every other field must match
  const other = t.bad.map((b) => b.replace(/^tick \d+: /, '').split('; ').filter((d) => !d.startsWith('unit0.def')).join('; ')).filter(Boolean);
  check('wire fixture (old Tắc Kè row): the wire zone is mirrored with no other state difference', m.zones.some((z) => z.kind === 'wire') && other.length === 0, other.slice(0, 2).join(' | '));
}
check(`zone kinds exercised: ${[...seenKinds].sort().join(', ')}`, ['strike', 'mine', 'field', 'dome', 'wall', 'turret', 'decoy', 'drone', 'wire', 'orbit', 'portal'].every((k) => seenKinds.has(k)));

console.log('\n# snapshot size');
{
  const lens = sizes.map((s) => s.len), busy = sizes.filter((s) => s.shots >= 15);
  const avg = Math.round(lens.reduce((a, b) => a + b, 0) / lens.length), max = Math.max(...lens);
  const worst = sizes.reduce((a, b) => (b.len > a.len ? b : a));
  const busyAvg = busy.length ? Math.round(busy.reduce((a, b) => a + b.len, 0) / busy.length) : 0;
  const json = Math.round(sizes.reduce((a, b) => a + b.json, 0) / sizes.length);
  console.log(`  all ${lens.length} packets (snapshot + its events): avg ${avg} B, max ${max} B (${worst.shots} shots, ${worst.units} units); busy (>=15 shots) ${busy.length}: avg ${busyAvg} B; the same as JSON: avg ${json} B`);
  check(`an average packet is under 500 bytes (${avg}) and a third of its JSON (${json})`, avg < 500 && avg < json / 3);
  check(`the biggest packet fits two datagrams (max ${max})`, max < 2200);
}
{
  // synthetic worst case: 10 units, 60 shots in the air
  const m = createMatch({ map: 'denrung', seed: 2, roster: makeRoster('tdm', 'hard') });
  for (let i = 0; i < 60; i++) m.shots.push({ id: 1000 + i, team: i % 2, owner: i % 10, x: i * 1.234 - 30, z: 12.345 - i * 0.77, px: 0, pz: 0, dx: Math.cos(i), dz: Math.sin(i), speed: 34, left: 10, color: i % 2, vis: 'bullet', r: 0.2, dmg: 60, splash: 0 });
  const len = encodeSnap(snapshot(m)).length;
  console.log(`  synthetic 10 units + 60 shots: ${len} B`);
  check(`10 units + 60 shots fit one datagram (${len})`, len < 1100);
}

console.log('\n# input packets');
{
  const raw = [{ mx: 0.123456, mz: -1, aim: 2.5, fire: true, s1: false, s2: true, ult: false, heal: false, tx: 12.34, tz: -7.89 }, { mx: -0.5, mz: 0.25, aim: -3.1, fire: false, s1: true, s2: false, ult: true, heal: true, tx: -40, tz: 26 }];
  const sent = raw.map(wireInput), p = decodeInputPacket(encodeInputPacket(4321, 99, 17, sent));
  check('input packet: numbers, acks and both inputs come back as sent', p.q === 4321 && p.snapQ === 99 && p.evAck === 17 && JSON.stringify(p.inputs.map(wireInput)) === JSON.stringify(sent), JSON.stringify(p));
  check(`input packet with three inputs is ${encodeInputPacket(4321, 99, 17, [sent[0], sent[1], sent[0]]).length} bytes (under 40)`, encodeInputPacket(4321, 99, 17, [sent[0], sent[1], sent[0]]).length < 40);
  const evs = [{ t: 'hit', id: 1, by: 2, x: 1.234, z: -2, amt: 30, absorbed: 0 }, { t: 'zone', id: 3, kind: 'field', x: 1, z: 2, vis: 'heal', lob: false }, { t: 'brandNew', a: 1 }];
  check('events: a known shape, a shape with an extra key and an unknown type all survive', JSON.stringify(unpackEvents(JSON.parse(JSON.stringify(packEvents(evs))))) === JSON.stringify(wireEvents(evs)));
}

console.log('\n# prediction: the guest drives its own mech, the host confirms');
// One human on the host's match, driven through walls, cover and ice by a wandering stick. The guest sends each input
// `lag` ticks before the host runs it and hears the result `lag` ticks after. worst: the largest gap between where the
// guest drew its mech when it made input q and where the host put the mech after running q.
function predictRun(map, theme, lag, kick) {
  const m = createMatch({ map, theme, seed: 9, roster: [{ team: 0, mech: 'soi', name: 'Khách' }, { team: 1, mech: 'trau', name: 'Bot', bot: true, diff: 'easy' }] });
  const mir = createMirror(JSON.parse(JSON.stringify(roster(m))));
  const pred = createPredictor(mir, 0);
  const drawn = new Map(), toHost = [], toGuest = [];
  let worst = 0, sum = 0, n = 0, moved = 0, applied = 0;
  const bot = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };
  // The other mech is out of the match: nothing but the stick (and the kicks below) moves the guest's mech.
  Object.assign(m.units[1], { alive: false, hp: 0, respawnT: 1e6 });
  applySnapshot(mir, snapshot(m));
  pred.correct(0, m.units[0].x, m.units[0].z, true, false);
  for (let i = 0; i < 1500; i++) {
    const a = Math.sin(i / 37) * 2.2 + i / 90;
    const inp = wireInput({ ...bot, mx: Math.cos(a), mz: Math.sin(a), aim: a });
    // A long dt lets the glide over a correction finish: what is compared is where the predictor has the mech.
    const q = pred.tick(inp), pose = pred.pose(1, 10, 0, 0);
    drawn.set(q, [pose.x, pose.z]);
    toHost.push({ at: i + lag, q, inp });
    const due = toHost.length && toHost[0].at <= i ? toHost.shift() : null;
    if (kick && i % 200 === 150) { m.units[0].kx += 9; m.units[0].kz -= 6; }
    const before = [m.units[0].x, m.units[0].z];
    step(m, [due ? due.inp : bot, bot]);
    if (due) {
      applied = due.q;
      const d = drawn.get(due.q), e = Math.hypot(d[0] - m.units[0].x, d[1] - m.units[0].z);
      worst = Math.max(worst, e); sum += e; n++;
      moved += Math.hypot(m.units[0].x - before[0], m.units[0].z - before[1]);
      drawn.delete(due.q);
    }
    toGuest.push({ at: i + lag, applied, snap: decodeSnap(encodeSnap(snapshot(m))) });
    while (toGuest.length && toGuest[0].at <= i) {
      const g = toGuest.shift(), r = g.snap.u[0];
      applySnapshot(mir, g.snap, TICK);
      pred.correct(g.applied, r[0], r[1], !!(r[6] & 1), !!(r[6] & 2));
    }
  }
  return { worst, avg: sum / n, moved };
}
{
  const a = predictRun('denrung', null, 0, false);
  check(`no delay: the guest's mech is where the host puts it (worst ${a.worst.toFixed(3)} m over ${a.moved.toFixed(0)} m driven)`, a.worst < 0.05 && a.moved > 150);
  const b = predictRun('denrung', null, 6, false);
  check(`200 ms each way: still the same path, to the rounding (worst ${b.worst.toFixed(3)} m, avg ${b.avg.toFixed(3)} m)`, b.worst < 0.08 && b.moved > 150);
  const c = predictRun('cangbang', 'tuyet', 6, false);
  check(`200 ms each way on ice: same path (worst ${c.worst.toFixed(3)} m, avg ${c.avg.toFixed(3)} m)`, c.worst < 0.08 && c.moved > 100);
  const d = predictRun('denrung', null, 6, true);
  check(`knock-backs the guest cannot foresee are corrected, not accumulated (avg ${d.avg.toFixed(3)} m, worst ${d.worst.toFixed(2)} m)`, d.avg < 0.25 && d.worst < 4);
}

console.log('\n# the guest sees its own stick and its own gun at once');
{
  const m = createMatch({ map: 'denrung', seed: 9, roster: [{ team: 0, mech: 'soi', name: 'Khách' }, { team: 1, mech: 'trau', name: 'Bot', bot: true, diff: 'easy' }] });
  const mir = createMirror(JSON.parse(JSON.stringify(roster(m))));
  Object.assign(m.units[1], { alive: false, hp: 0, respawnT: 1e6 });
  applySnapshot(mir, snapshot(m));
  const still = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };

  const pred = createPredictor(mir, 0);
  pred.correct(0, m.units[0].x, m.units[0].z, true, false);
  const rest = pred.pose(0.5, 1 / 60, 0, 0, still), go = pred.pose(0.5, 1 / 60, 0, 0, { ...still, mx: 1 });
  check(`a stick pushed between two ticks moves the picture in that frame (${(go.x - rest.x).toFixed(3)} m at half a tick)`, go.x - rest.x > 0.03 && rest.x === m.units[0].x);
  pred.tick(wireInput({ ...still, mx: 1 }));
  const after = pred.pose(0, 1 / 60, 0, 0, { ...still, mx: 1 });
  check('the tick lands where the picture was heading', near(after.x, rest.x + (go.x - rest.x) * 2, 0.002));

  // The guest holds the trigger for 2 s; the host runs each input 4 ticks later and its word comes back 4 ticks after that.
  const LAG = 4, gun = createGunner(mir, 0), toHost = [], toGuest = [];
  let local = 0, hostFired = 0, shownHostFire = 0, twice = 0, firstShotTick = -1, hostShotSeen = 0;
  for (let i = 0; i < 110; i++) {
    const now = i * TICK, inp = wireInput({ ...still, fire: i < 60 });
    for (const e of gun.tick(inp, mir.units[0].x, mir.units[0].z, now)) if (e.t === 'fire') local++;
    toHost.push({ at: i + LAG, inp });
    const due = toHost[0].at <= i ? toHost.shift().inp : still;
    step(m, [due, still]);
    const fires = m.events.filter((e) => e.t === 'fire' && e.id === 0);
    hostFired += fires.length;
    toGuest.push({ at: i + LAG, snap: decodeSnap(encodeSnap(snapshot(m))), events: unpackEvents(packEvents(fires)) });
    while (toGuest.length && toGuest[0].at <= i) {
      const g = toGuest.shift();
      applySnapshot(mir, g.snap, TICK);
      hostShotSeen += mir.shots.filter((s) => s.owner === 0).length;
      for (const e of g.events) if (gun.keep(e, now)) shownHostFire++;
    }
    const drawn = gun.shots(mir.shots, 1, 1, now).filter((s) => s.owner === 0);
    if (firstShotTick < 0 && drawn.length) firstShotTick = i;
    twice += drawn.filter((s) => s.id > 0).length;
  }
  check(`the first shot is on screen in the tick the trigger is pulled (tick ${firstShotTick})`, firstShotTick === 0);
  check(`the guest's gun keeps the host's rhythm: ${local} shots predicted, ${hostFired} fired by the host`, local === hostFired && local === 12);
  check(`no shot or muzzle flash shows twice (${hostShotSeen} host shot sightings hidden, ${twice} drawn, ${shownHostFire} host flashes played)`, hostShotSeen > 20 && twice === 0 && shownHostFire === 0);

  const lone = createGunner(mir, 0);
  const stray = [{ id: 77, owner: 0, vis: 'bullet', x: 1, z: 1, px: 1, pz: 1, dx: 1, dz: 0, speed: 34, r: 0.2 }];
  check('a shot the host fired without a prediction is drawn as it comes', lone.shots(stray, 0, 1, 0).length === 1 && lone.keep({ t: 'fire', id: 0, vis: 'bullet' }, 0) === true);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
