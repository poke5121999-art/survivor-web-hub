// Behaviour tests for the bots with the eight newer mechs (and the old eight under the new stat axes), in Node: `node tools/bots-test.mjs`.
// Seeded bot matches in every mode; every number below is a literal expectation. Exits 1 on any failure.
import './k11-cases.mjs';   // kit lane K11: registers the fixtures 'dummy' (old Trâu Sắt) and 'oldtho' (old Thợ Rèn) before netstate.js loads
import { createMatch, step, visibleTo, weaponRange } from '../js/sim.js';
import { allInputs } from '../js/bots.js';
import { losClear, solidAt, MAP_ORDER, NHA_ORDER } from '../js/maps.js';
import { MECHS, MECH_ORDER, MODES, TICK } from '../js/data.js';
import { oldK13 } from './k13-cases.mjs';   // kit lane K13: the medic checks run on the old Đom Đóm kit (fixture)
import { oldKit as oldKit15 } from './k15-cases.mjs';   // kit lane k15: hoalong's charge beam lives on as the fixture OLD_HOALONG
import { oldK17 } from './k17-cases.mjs';   // kit lane k17: the old Mãng Xà kit (hook) as a fixture

let failed = 0, passed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); }
};
const section = (s) => console.log(`\n# ${s}`);
const IN = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };
const NEW = MECH_ORDER.slice(8, 16);
const BATCH1 = MECH_ORDER.slice(16, 22);   // khiphao, quancong, natra, duongtien, athena, hades
const BATCH2 = MECH_ORDER.slice(22, 29);   // lubo, mucma, kynhong, nguma, sontinh, enbac, boica
const BATCH3 = MECH_ORDER.slice(29, 39);   // bohung, cakiem, gilgamesh, buomdem, laclong, baogam, luondien, tegiac, quaset, tumay
const BATCH4 = MECH_ORDER.slice(39, 46);   // dieuthuyen, thuytinh, samthep, cuuvi, kiemthan, suatrang, khidot
const BATCH5 = MECH_ORDER.slice(46);   // retdo, nhenthep, taothao, bongua, moclan, anduong, chuottui, vesau
// Phó bản (pve) plays waves of monsters, not PvP rosters: its bot runs are in sim-test section 51-52.
const MODE_LIST = Object.keys(MODES).filter((k) => k !== 'pve');
const put = (u, x, z) => { u.x = u.px = x; u.z = u.pz = z; };
const rot = (list, k, n) => Array.from({ length: n }, (_, i) => list[(k + i) % list.length]);
const ACT = new Set(['fire', 'beam', 'ray', 'skill', 'turretFire']);

// One bot match with instruments. `mechs`: the roster, team 0 first (tudo: every unit its own team, split by index parity for the colours).
function play(mode, seed, mechs, diffs = ['hard', 'normal'], fix = null) {
  const roster = mechs.map((mech, i) => ({ team: mode === 'trum' ? (mech === 'titan' ? 1 : 0) : i % 2, mech, name: mech + i, bot: true, diff: diffs[i % 2] }));
  const pool = mode === 'nha' ? NHA_ORDER : MAP_ORDER;
  const m = createMatch({ seed, mode, map: pool[seed % pool.length], roster });
  if (fix) fix(m);
  const R = {
    m, error: null, bad: null, nonFinite: 0, ticks: 0, casts: {}, beams: {}, rays: { ally: 0, foe: 0, tower: 0, none: 0 }, planted: {}, alive: {}, towerDmg: {}, near: [],
    idle: {}, landings: [], plantedInRange: 0, plantedTicks: 0, releases: { bot: 0, auto: 0, quick: 0, full: 0 }, hooks: 0, decoyHits: 0, medicGap: [], thinkWorst: 0, thinkSum: 0,
  };
  const lastAct = m.units.map(() => 0), streak = m.units.map(() => 0), wallT = m.units.map(() => 0);
  const limit = Math.ceil(m.duration / TICK) + 5;
  try {
    while (!m.over && R.ticks < limit) {
      const t0 = process.hrtime.bigint();
      const inputs = allInputs(m);
      const think = Number(process.hrtime.bigint() - t0) / 1e6;
      if (R.ticks >= 5) { R.thinkWorst = Math.max(R.thinkWorst, think); R.thinkSum += think; }   // the first ticks of a process are cold code
      for (const i of inputs) if (i && !(Number.isFinite(i.mx + i.mz + i.aim + i.tx + i.tz) && ['fire', 's1', 's2', 'ult', 'heal'].every((k) => typeof i[k] === 'boolean'))) R.nonFinite++;
      const pre = m.units.map((u) => ({ charge: u.charge || 0, primed: u.primeT > 0 }));
      step(m, inputs);
      R.ticks++;
      for (const e of m.events) {
        if (ACT.has(e.t) && e.id !== undefined) lastAct[e.id] = m.time;
        const u = e.id !== undefined ? m.units[e.id] : null;
        if (e.t === 'skill') { const k = u.mech + ':' + e.slot; R.casts[k] = (R.casts[k] || 0) + 1; }
        else if (e.t === 'beam') {
          R.beams[u.mech] = (R.beams[u.mech] || 0) + 1;
          if (u.def.weapon.charge) {
            const C = u.def.weapon.charge, held = pre[u.id].charge + TICK;
            if (held < C.max + C.hold - 1e-6) R.releases.bot++; else R.releases.auto++;
            if (pre[u.id].primed || held >= C.max - 0.05) R.releases.full++; else if (held < 0.9) R.releases.quick++;
          }
        } else if (e.t === 'ray') R.rays[e.on]++;
        else if (e.t === 'towerHit') R.towerDmg[m.units[e.by].mech] = (R.towerDmg[m.units[e.by].mech] || 0) + e.amt;
        else if (e.t === 'hook') R.hooks++;
        else if (e.t === 'impact' && e.on === 'decoy') R.decoyHits++;
        else if (mode === 'nha' && (e.t === 'leap' || e.t === 'warp' || e.t === 'swap')) {
          const to = e.t === 'swap' ? [e.x1, e.z1] : [e.x, e.z], from = e.t === 'swap' ? [e.x0, e.z0] : [e.x0, e.z0];
          for (const t of m.towers) {
            if (!t.alive || t.team === u.team) continue;
            const R13 = m.rule.tower.range;
            if (Math.hypot(to[0] - t.x, to[1] - t.z) < R13 && Math.hypot(from[0] - t.x, from[1] - t.z) >= R13) R.landings.push(`${e.t} ${u.mech} t=${m.time.toFixed(0)}`);
          }
        }
      }
      for (const u of m.units) {
        if (!Number.isFinite(u.x) || !Number.isFinite(u.z) || !Number.isFinite(u.hp) || !Number.isFinite(u.aim)) { R.bad = R.bad || `NaN unit ${u.id} tick ${m.tick}`; continue; }
        if (!u.alive) { streak[u.id] = 0; continue; }
        if (Math.abs(u.x) > m.map.hw || Math.abs(u.z) > m.map.hd) R.bad = R.bad || `out of bounds unit ${u.id} tick ${m.tick}`;
        // a leap flies over walls; a layout that squeezes a mech into a rock is the map's fault, so only a stay of 3 s counts
        wallT[u.id] = solidAt(m.map, u.x, u.z, u.radius * 0.5) && !(u.dash && u.dash.fly) ? wallT[u.id] + TICK : 0;
        if (wallT[u.id] > 3) R.bad = R.bad || `inside a wall unit ${u.id} tick ${m.tick}`;
        R.alive[u.mech] = (R.alive[u.mech] || 0) + 1;
        if (u.stance) {
          R.planted[u.mech] = (R.planted[u.mech] || 0) + 1;
          if (mode === 'nha') {
            R.plantedTicks++;
            for (const t of m.towers) if (t.alive && t.team !== u.team && Math.hypot(u.x - t.x, u.z - t.z) < m.rule.tower.range) { R.plantedInRange++; break; }
          }
        }
        // standing still with an enemy in sight and in reach, and not doing anything about it
        const w = u.def.weapon, reach = weaponRange(u);
        let sees = false;
        if (u.stunT <= 0 && !u.cast && !u.dash && Math.hypot(u.vx, u.vz) < 0.3) {
          for (const e of m.units) {
            if (e.team === u.team || !e.alive || !visibleTo(m, e, u.team)) continue;
            if (Math.hypot(e.x - u.x, e.z - u.z) < Math.min(reach, 16) && (w.lob || losClear(m.map, u.x, u.z, e.x, e.z, 0.2))) { sees = true; break; }
          }
        }
        streak[u.id] = sees && m.time - lastAct[u.id] > 1.5 ? streak[u.id] + TICK : 0;
        if (streak[u.id] > (R.idle[u.mech] || 0)) R.idle[u.mech] = streak[u.id];
        if (u.mech === 'domdom' && mode !== 'tudo' && R.ticks % 30 === 0) {
          let best = 1e9;
          for (const a of m.units) if (a !== u && a.team === u.team && a.alive) best = Math.min(best, Math.hypot(a.x - u.x, a.z - u.z));
          if (best < 1e9) R.medicGap.push(best);
        }
      }
    }
  } catch (err) { R.error = err.stack.split('\n').slice(0, 3).join(' | '); }
  return R;
}

const sum = (rs, f) => rs.reduce((a, r) => a + f(r), 0);
const merge = (rs, key) => { const o = {}; for (const r of rs) for (const k in r[key]) o[k] = (o[k] || 0) + r[key][k]; return o; };
const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${typeof v === 'number' ? Math.round(v) : v}`).join('  ');

// ---- 1. every mode, every new mech, every skill ----------------------------------------------------------------------------------
section('1 matches in every mode: all 8 new mechs, hard against normal');
const RUNS = { tdm: 8, nha: 8, chiem: 6, tudo: 6, trum: 12 };
const BY = {};
for (const mode of MODE_LIST) {
  const rs = [];
  for (let s = 1; s <= RUNS[mode]; s++) {
    const n = mode === 'trum' ? 3 : 6;   // 3v3, the largest match the game offers
    const mechs = mode === 'trum' ? [...rot(NEW, s * 3, 3), 'titan'] : rot(NEW, s, n);
    rs.push(play(mode, s, mechs));
  }
  BY[mode] = rs;
  const casts = merge(rs, 'casts');
  console.log(`${mode}: ${rs.length} matches, avg ${(sum(rs, (r) => r.m.time) / rs.length).toFixed(0)} s, score ${rs.map((r) => r.m.score.join(':')).join(' ')}`);
  console.log('  casts ' + NEW.map((k) => `${k} ${[0, 1, 2].map((i) => casts[k + ':' + i] || 0).join('/')}`).join('  '));
  check(`1a ${mode}: no exception, NaN or non-boolean input`, rs.every((r) => !r.error && !r.bad && r.nonFinite === 0), rs.map((r) => r.error || r.bad).filter(Boolean)[0] || `${sum(rs, (r) => r.nonFinite)} bad inputs`);
  // what a bot has no use for against the boss: a hook and a cage do nothing to a heavy mech
  const exempt = mode === 'trum' ? new Set(['mangxa:0', 'mangxa:2']) : new Set();
  const missing = [];
  for (const k of NEW) for (let i = 0; i < 3; i++) if (!(casts[k + ':' + i] >= 1) && !exempt.has(k + ':' + i)) missing.push(`${MECHS[k].skills[i].id}`);
  check(`1b ${mode}: every new mech casts each of its three skills at least once`, missing.length === 0, `never cast: ${missing.join(', ')}`);
}

// ---- 1c. batch 1 (khiphao, quancong, natra, duongtien, athena, hades): every skill is cast by a bot somewhere --------------------------
section('1c batch 1 mechs in every mode: every skill cast at least once across the modes, no exception or NaN');
{
  const RUNS1 = { tdm: 6, nha: 6, chiem: 4, tudo: 4, trum: 8 };
  const casts = {};
  const faults = [];
  for (const mode of MODE_LIST) {
    for (let s = 1; s <= RUNS1[mode]; s++) {
      const mechs = mode === 'trum' ? [...rot(BATCH1, s * 3, 3), 'titan'] : rot(BATCH1, s, 6);
      const r = play(mode, 70 + s, mechs);
      if (r.error || r.bad || r.nonFinite) faults.push(`${mode} ${r.error || r.bad || r.nonFinite}`);
      for (const k in r.casts) casts[k] = (casts[k] || 0) + r.casts[k];
    }
  }
  console.log('  casts ' + BATCH1.map((k) => `${k} ${[0, 1, 2].map((i) => casts[k + ':' + i] || 0).join('/')}`).join('  '));
  const missing = [];
  for (const k of BATCH1) for (let i = 0; i < 3; i++) if (!(casts[k + ':' + i] >= 1)) missing.push(MECHS[k].skills[i].id);
  check('1c every skill of the six batch 1 mechs is cast by a bot at least once over all modes', missing.length === 0, `never cast: ${missing.join(', ')}`);
  check('1d batch 1 matches in every mode: no exception, NaN or non-boolean input', faults.length === 0, faults[0]);
}

// ---- 1e. batch 2 (lubo, mucma, kynhong, nguma, sontinh, enbac, boica): every skill is cast by a bot somewhere --------------------------
section('1e batch 2 mechs in every mode: every skill cast at least once across the modes, no exception or NaN');
{
  const RUNS2 = { tdm: 8, nha: 8, chiem: 6, tudo: 6, trum: 10 };
  const casts = {};
  const faults = [];
  for (const mode of MODE_LIST) {
    for (let s = 1; s <= RUNS2[mode]; s++) {
      const mechs = mode === 'trum' ? [...rot(BATCH2, s * 3, 3), 'titan'] : rot(BATCH2, s, 6);
      const r = play(mode, 90 + s, mechs);
      if (r.error || r.bad || r.nonFinite) faults.push(`${mode} ${r.error || r.bad || r.nonFinite}`);
      for (const k in r.casts) casts[k] = (casts[k] || 0) + r.casts[k];
    }
  }
  console.log('  casts ' + BATCH2.map((k) => `${k} ${[0, 1, 2].map((i) => casts[k + ':' + i] || 0).join('/')}`).join('  '));
  const missing = [];
  for (const k of BATCH2) for (let i = 0; i < 3; i++) if (!(casts[k + ':' + i] >= 1)) missing.push(MECHS[k].skills[i].id);
  check('1e every skill of the seven batch 2 mechs is cast by a bot at least once over all modes', missing.length === 0, `never cast: ${missing.join(', ')}`);
  check('1f batch 2 matches in every mode: no exception, NaN or non-boolean input', faults.length === 0, faults[0]);
}

// ---- 1g. batch 3 (the ten meter mechs): every skill is cast by a bot somewhere -----------------------------------------------------
section('1g batch 3 mechs in every mode: every skill cast at least once across the modes, no exception or NaN');
{
  const RUNS3 = { tdm: 10, nha: 10, chiem: 8, tudo: 8, trum: 10 };
  const casts = {};
  const faults = [];
  for (const mode of MODE_LIST) {
    for (let s = 1; s <= RUNS3[mode]; s++) {
      const mechs = mode === 'trum' ? [...rot(BATCH3, s * 3, 3), 'titan'] : rot(BATCH3, s * 2, 6);
      const r = play(mode, 120 + s, mechs);
      if (r.error || r.bad || r.nonFinite) faults.push(`${mode} ${r.error || r.bad || r.nonFinite}`);
      for (const k in r.casts) casts[k] = (casts[k] || 0) + r.casts[k];
    }
  }
  console.log('  casts ' + BATCH3.map((k) => `${k} ${[0, 1, 2].map((i) => casts[k + ':' + i] || 0).join('/')}`).join('  '));
  const missing = [];
  for (const k of BATCH3) for (let i = 0; i < 3; i++) if (!(casts[k + ':' + i] >= 1)) missing.push(MECHS[k].skills[i].id);
  check('1g every skill of the ten batch 3 mechs is cast by a bot at least once over all modes', missing.length === 0, `never cast: ${missing.join(', ')}`);
  check('1h batch 3 matches in every mode: no exception, NaN or non-boolean input', faults.length === 0, faults[0]);
}

// ---- 1i. batch 4 (stacks, orbit, regen): every skill is cast by a bot somewhere --------------------------------------------------
section('1i batch 4 mechs in every mode: every skill cast at least once across the modes, no exception or NaN');
{
  const RUNS4 = { tdm: 10, nha: 10, chiem: 8, tudo: 8, trum: 10 };
  const casts = {};
  const faults = [];
  for (const mode of MODE_LIST) {
    for (let s = 1; s <= RUNS4[mode]; s++) {
      const mechs = mode === 'trum' ? [...rot(BATCH4, s * 3, 3), 'titan'] : rot(BATCH4, s * 2, 6);
      const r = play(mode, 220 + s, mechs);
      if (r.error || r.bad || r.nonFinite) faults.push(`${mode} ${r.error || r.bad || r.nonFinite}`);
      for (const k in r.casts) casts[k] = (casts[k] || 0) + r.casts[k];
    }
  }
  console.log('  casts ' + BATCH4.map((k) => `${k} ${[0, 1, 2].map((i) => casts[k + ':' + i] || 0).join('/')}`).join('  '));
  const missing = [];
  for (const k of BATCH4) for (let i = 0; i < 3; i++) if (!(casts[k + ':' + i] >= 1)) missing.push(MECHS[k].skills[i].id);
  check('1i every skill of the seven batch 4 mechs is cast by a bot at least once over all modes', missing.length === 0, `never cast: ${missing.join(', ')}`);
  check('1j batch 4 matches in every mode: no exception, NaN or non-boolean input', faults.length === 0, faults[0]);
}

// ---- 1k. batch 5 (counter, flurry, form, portal, rewind, thrifty): every skill is cast by a bot somewhere -------------------------
section('1k batch 5 mechs in every mode: every skill cast at least once across the modes, no exception or NaN');
{
  const RUNS5 = { tdm: 12, nha: 12, chiem: 10, tudo: 10, trum: 12 };
  const casts = {};
  const faults = [];
  for (const mode of MODE_LIST) {
    for (let s = 1; s <= RUNS5[mode]; s++) {
      const mechs = mode === 'trum' ? [...rot(BATCH5, s * 3, 3), 'titan'] : rot(BATCH5, s * 2, 6);
      const r = play(mode, 260 + s, mechs);
      if (r.error || r.bad || r.nonFinite) faults.push(`${mode} ${r.error || r.bad || r.nonFinite}`);
      for (const k in r.casts) casts[k] = (casts[k] || 0) + r.casts[k];
    }
  }
  console.log('  casts ' + BATCH5.map((k) => `${k} ${[0, 1, 2].map((i) => casts[k + ':' + i] || 0).join('/')}`).join('  '));
  const missing = [];
  for (const k of BATCH5) for (let i = 0; i < 3; i++) if (!(casts[k + ':' + i] >= 1)) missing.push(MECHS[k].skills[i].id);
  check('1k every skill of the eight batch 5 mechs is cast by a bot at least once over all modes', missing.length === 0, `never cast: ${missing.join(', ')}`);
  check('1l batch 5 matches in every mode: no exception, NaN or non-boolean input', faults.length === 0, faults[0]);
}

// ---- 2. 16 mechs, every mode ---------------------------------------------------------------------------------------------------
section('2 all 16 mechs in all five modes: no NaN, no exception');
for (const mode of MODE_LIST) {
  const rs = [];
  if (mode === 'trum') for (let k = 0; k < 18; k++) rs.push(play(mode, 40 + k, [...rot(MECH_ORDER, k * 3, 3), 'titan'], ['normal', 'hard']));
  else for (let k = 0; k < 9; k++) rs.push(play(mode, 50 + k, rot(MECH_ORDER, k * 6, 6), ['normal', 'hard']));
  const seen = new Set(rs.flatMap((r) => r.m.units.map((u) => u.mech)));
  check(`2a ${mode}: ${MECH_ORDER.length} mechs played, no exception or NaN, nothing in a wall`, MECH_ORDER.every((k) => seen.has(k)) && rs.every((r) => !r.error && !r.bad && r.nonFinite === 0 && r.ticks > 600),
    rs.map((r) => r.error || r.bad).filter(Boolean)[0] || `mechs ${seen.size}, ticks ${rs.map((r) => r.ticks)}`);
}

// ---- 3. what each new weapon and role is for ---------------------------------------------------------------------------------------
section('3 medic');
{
  // Đom Đóm plays the wind kit now (kit lane K13); the medic bot is checked on the old heal-ray kit (OLD_DOMDOM), same matches as section 1
  const medic = (m) => oldK13(m, 'domdom'), MED = {};
  for (const mode of ['tdm', 'chiem', 'nha']) MED[mode] = Array.from({ length: RUNS[mode] }, (_, k) => play(mode, k + 1, rot(NEW, k + 1, 6), undefined, medic));
  const rs = [...MED.tdm, ...MED.chiem];
  const healed = sum(rs, (r) => r.m.units.filter((u) => u.mech === 'domdom').reduce((a, u) => a + u.healed, 0));
  const plays = sum(rs, (r) => r.m.units.filter((u) => u.mech === 'domdom').length);
  console.log(`domdom healed ${healed.toFixed(0)} over ${plays} plays, rays ${JSON.stringify(sum(rs, (r) => r.rays.ally) + ' ally / ' + sum(rs, (r) => r.rays.foe) + ' foe')}`);
  check('3a the medic heals at least 3000 per play on average (tdm and chiem)', healed / plays >= 3000, `${(healed / plays).toFixed(0)}`);
  check('3b at least 40% of medic rays land on allies at 3v3 (200+ ally rays; measured 48%: two allies are often at full health, then the ray hurts a foe)', sum(rs, (r) => r.rays.ally) >= 200 && sum(rs, (r) => r.rays.ally) >= 0.4 * (sum(rs, (r) => r.rays.ally) + sum(rs, (r) => r.rays.foe)), `${sum(rs, (r) => r.rays.ally)} vs ${sum(rs, (r) => r.rays.foe)}`);
  const gaps = MED.nha.flatMap((r) => r.medicGap).sort((a, b) => a - b);
  const med = gaps[gaps.length >> 1] || 0, p90 = gaps[Math.floor(gaps.length * 0.9)] || 0;
  console.log(`nha: medic distance to its nearest ally: median ${med.toFixed(1)} m, 90th percentile ${p90.toFixed(1)} m`);
  check('3c nha: the medic stays with the group (median 8 m or less from the nearest ally, 90% within 22 m; measured 20.4 at 3v3 after the healers got faster)', gaps.length > 100 && med <= 8 && p90 <= 22, `${med.toFixed(1)} / ${p90.toFixed(1)}`);
  // scenario: a hurt ally and no enemy: the ray heals it
  const m = medic(createMatch({ seed: 3, roster: [{ team: 0, mech: 'domdom', name: 'M', bot: true, diff: 'normal' }, { team: 0, mech: 'dummy', name: 'A' }, { team: 1, mech: 'dummy', name: 'E' }] }));
  put(m.units[0], -5, -1); put(m.units[1], 2, -1); put(m.units[2], 40, 20);
  m.units[1].hp = m.units[1].maxHp * 0.3; m.units[2].alive = false; m.units[2].respawnT = 999;
  const hp0 = m.units[1].hp;
  for (let i = 0; i < 150; i++) step(m, allInputs(m, { 1: IN }));
  check('3d a medic bot heals a hurt ally standing 7 m away within 5 s (hp 30% to over 45%)', m.units[1].hp > m.units[1].maxHp * 0.45 && m.units[0].healed > 500, `hp ${hp0.toFixed(0)} -> ${m.units[1].hp.toFixed(0)}, healed ${m.units[0].healed.toFixed(0)}`);
}

section('4 siege');
{
  const rs = BY.nha;
  const al = sum(rs, (r) => r.alive.thancong || 0), pl = sum(rs, (r) => r.planted.thancong || 0);
  const dmg = sum(rs, (r) => r.towerDmg.thancong || 0), plays = sum(rs, (r) => r.m.units.filter((u) => u.mech === 'thancong').length);
  console.log(`nha: thancong planted ${(100 * pl / Math.max(1, al)).toFixed(0)}% of ${(al * TICK).toFixed(0)} s alive, tower damage ${dmg.toFixed(0)} over ${plays} plays; planted inside a tower's range ${sum(rs, (r) => r.plantedInRange)} of ${sum(rs, (r) => r.plantedTicks)} ticks`);
  check('4a nha: the siege bot spends at least 10% of its time planted', pl / Math.max(1, al) >= 0.1, `${(100 * pl / Math.max(1, al)).toFixed(0)}%`);
  check('4b nha: the siege bot deals at least 3000 tower damage per play', dmg / plays >= 3000, `${(dmg / plays).toFixed(0)}`);
  check('4c nha: a planted mech is outside every tower\'s range (13 m) in 97% of its planted ticks', sum(rs, (r) => r.plantedInRange) <= 0.03 * sum(rs, (r) => r.plantedTicks), `${sum(rs, (r) => r.plantedInRange)} of ${sum(rs, (r) => r.plantedTicks)}`);
  const other = ['mangxa', 'kimquy', 'hacho', 'holy', 'domdom', 'tacke'].map((k) => sum(rs, (r) => r.towerDmg[k] || 0));
  console.log(`nha: tower damage of the others ${other.map(Math.round).join(', ')}`);
  const cand = rs.flatMap((r) => r.landings);
  check('4d nha: no leap, warp or swap lands inside an enemy tower\'s range (13 m) from outside it', cand.length === 0, cand.slice(0, 3).join('; '));
  // scenario: plants against a far target, unplants when the target is gone
  const mk = () => {
    const m = createMatch({ seed: 5, roster: [{ team: 0, mech: 'thancong', name: 'S', bot: true, diff: 'hard' }, { team: 1, mech: 'dummy', name: 'T' }] });
    put(m.units[0], -7, -1); put(m.units[1], 7, -1);
    return m;
  };
  const m = mk(), s = m.units[0], t = m.units[1];
  let plantedAt = -1;
  for (let i = 0; i < 180; i++) { step(m, allInputs(m, { 1: IN })); if (s.stance && plantedAt < 0) plantedAt = m.time; put(t, 7, -1); }
  check('4e the siege bot plants against a target 14 m away within 4 s and hits it', plantedAt > 0 && plantedAt < 4 && s.dmg > 0, `planted ${s.stance} at ${plantedAt.toFixed(1)}, target hp ${t.hp}/${t.maxHp}`);
  t.alive = false; t.respawnT = 999;
  let left = -1;
  for (let i = 0; i < 240; i++) { step(m, allInputs(m, { 1: IN })); if (!s.stance && left < 0) left = m.time; }
  check('4f a planted siege bot with nothing to shoot unplants (within 6 s)', !s.stance && left > 0, `stance ${s.stance}`);
  const c2 = mk(), s2 = c2.units[0];
  for (let i = 0; i < 100; i++) { step(c2, allInputs(c2, { 1: IN })); put(c2.units[1], 7, -1); }
  put(c2.units[1], s2.x + 4, -1);
  let out = -1;
  for (let i = 0; i < 150; i++) { step(c2, allInputs(c2, { 1: IN })); put(c2.units[1], s2.x + 4, -1); if (!s2.stance && out < 0) out = c2.time; }
  check('4g a planted siege bot unplants when an enemy closes to 4 m', !s2.stance && out > 0, `stance ${s2.stance}`);
}

section('5 charge weapon');
{
  // hoalong plays its p4 lava kit now (kit lane k15): the charge-beam bot runs on the old kit, the fixture OLD_HOALONG, in its own matches
  const CHG = ['hoalong', 'trau', 'soi', 'ung', 'hoalong', 'tho'], old = (m) => oldKit15(m, 'hoalong');
  const rs = ['tdm', 'chiem', 'tudo'].flatMap((mode) => [1, 2, 3].map((s) => play(mode, s, CHG, ['hard', 'normal'], old)));
  const beams = sum(rs, (r) => r.beams.hoalong || 0), plays = sum(rs, (r) => r.m.units.filter((u) => u.mech === 'hoalong').length);
  const rel = { bot: sum(rs, (r) => r.releases.bot), auto: sum(rs, (r) => r.releases.auto), quick: sum(rs, (r) => r.releases.quick), full: sum(rs, (r) => r.releases.full) };
  console.log(`hoalong: ${beams} beams over ${plays} plays; released by the bot ${rel.bot}, by the auto-fire ${rel.auto}; quick (under 0.9 s) ${rel.quick}, full ${rel.full}`);
  check('5a charge bots fire beams: 40 or more per play (tdm, chiem, tudo)', beams / plays >= 40, `${(beams / plays).toFixed(1)}`);
  check('5b the bot releases the charge itself in at least 90% of its shots (no hold until auto-fire)', rel.bot >= 0.9 * (rel.bot + rel.auto), `${rel.bot} of ${rel.bot + rel.auto}`);
  check('5c both quick shots and full charges happen', rel.quick >= 10 && rel.full >= 10, `${rel.quick} / ${rel.full}`);
  // scenario: far target at full health is shot at a full charge, a nearly dead one with a quick shot
  const run = (hpFrac, x) => {
    const m = oldKit15(createMatch({ seed: 6, roster: [{ team: 0, mech: 'hoalong', name: 'L', bot: true, diff: 'hard' }, { team: 1, mech: 'dummy', name: 'T' }] }), 'hoalong');
    put(m.units[0], -7, -1); put(m.units[1], x, -1); m.units[1].hp = m.units[1].maxHp * hpFrac; m.units[0].cd.s1 = 99;
    let charge = 0, peak = 0, first = null;
    for (let i = 0; i < 150 && !first; i++) {
      const inputs = allInputs(m, { 1: IN });
      peak = Math.max(peak, m.units[0].charge);
      step(m, inputs);
      if (m.events.some((e) => e.t === 'beam' && e.id === 0)) first = peak + TICK;
      if (m.units[0].charge === 0 && !first) peak = 0;
    }
    return first;
  };
  const far = run(1, 7), weak = run(0.04, 7);
  console.log(`first shot at 14 m (Quá Tải held back): full-health target ${far && far.toFixed(2)} s of charge, 4% target ${weak && weak.toFixed(2)} s`);
  check('5d a healthy target 14 m away takes a charge of 1.2 s or more', far !== null && far >= 1.2, `${far}`);
  check('5e a nearly dead target is shot with a quick charge (under 0.6 s)', weak !== null && weak < 0.6, `${weak}`);
}

section('6 hook, decoys, idle');
{
  const m = oldK17(createMatch({ seed: 7, roster: [{ team: 0, mech: 'mangxa', name: 'H', bot: true, diff: 'hard' }, { team: 1, mech: 'dummy', name: 'T' }] }));   // the old hook kit
  put(m.units[0], -6, -1); put(m.units[1], 5, -1);
  let hooks = 0, minD = 99;
  for (let i = 0; i < 120; i++) { step(m, allInputs(m, { 1: IN })); hooks += m.events.filter((e) => e.t === 'hook').length; minD = Math.min(minD, Math.hypot(m.units[0].x - m.units[1].x, m.units[0].z - m.units[1].z)); }
  check('6a a mangxa bot hooks a lone enemy 11 m away and reels it in', hooks >= 1 && minD < 4, `hooks ${hooks}, closest ${minD.toFixed(1)}`);
  // an enemy decoy standing in the open, its owner out of sight (dead): easy and normal bots shoot it, a hard bot ignores one older than 1.5 s
  const decoyRun = (diff, age) => {
    const d = createMatch({ seed: 8, roster: [{ team: 0, mech: 'soi', name: 'B', bot: true, diff }, { team: 1, mech: 'holy', name: 'F' }] });
    put(d.units[0], -6, -1); d.units[1].alive = false; d.units[1].respawnT = 999;
    d.zones.push({ id: d.nextId++, kind: 'decoy', team: 1, color: 1, owner: 1, x: 5, z: -1, r: 0.76, hp: 500, maxHp: 500, dur: 30, age, delay: 0, aim: 0, speed: 0, blast: 3, dmg: 0 });
    let hits = 0;
    for (let i = 0; i < 90; i++) { step(d, allInputs(d)); hits += d.events.filter((e) => e.t === 'impact' && e.on === 'decoy').length; }
    return hits;
  };
  const he = decoyRun('easy', 0), hn = decoyRun('normal', 0), hhOld = decoyRun('hard', 2), hhNew = decoyRun('hard', 0);
  console.log(`shots that hit an enemy decoy in 3 s: easy ${he}, normal ${hn}, hard (fresh) ${hhNew}, hard (2 s old) ${hhOld}`);
  check('6b easy and normal bots shoot an enemy decoy', he >= 1 && hn >= 3, `${he} / ${hn}`);
  check('6c a hard bot does not waste fire on a decoy older than 1.5 s', hhOld === 0, `${hhOld}`);
  const rs = Object.values(BY).flat();
  const idle = {};
  for (const r of rs) for (const k in r.idle) idle[k] = Math.max(idle[k] || 0, r.idle[k]);
  console.log('longest stretch standing still with an enemy in reach and nothing done (s): ' + Object.entries(idle).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  '));
  check('6d no bot stands still, in reach of an enemy it sees, for more than 5 s without firing or casting', Object.values(idle).every((v) => v <= 5), Object.entries(idle).filter(([, v]) => v > 5).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' '));
  const tw = rs.flatMap((r) => r.m.units).filter((u) => u.mech === 'hacho');
  check('6e the bruiser (flame, range 7) gets close: it deals damage in every mode', Object.values(BY).every((x) => x.some((r) => r.m.units.some((u) => u.mech === 'hacho' && u.dmg > 1000))), `${tw.length} plays`);
  const worst = Math.max(...rs.map((r) => r.thinkWorst));
  const avg = sum(rs, (r) => r.thinkSum) / sum(rs, (r) => r.ticks);
  console.log(`bot think time (10 bots): avg ${avg.toFixed(3)} ms/tick, worst ${worst.toFixed(1)} ms`);
  check('6f think time of 10 bots: average under 1 ms per tick, worst tick under 20 ms', avg < 1 && worst < 20, `${avg.toFixed(3)} / ${worst.toFixed(1)} ms`);
}

section('7 difficulty still matters with the new mechs');
{
  let wins = 0, kh = 0, ke = 0;
  for (let k = 1; k <= 6; k++) {
    const mechs = [...rot(NEW, k * 3, 5), ...rot(NEW, k * 3 + 1, 5)];
    const r = play('tdm', 70 + k, mechs, ['hard', 'easy']);
    // play() gives even slots to team 0 and odd to team 1, with diffs alternating the same way
    if (r.m.score[0] > r.m.score[1]) wins++;
    kh += r.m.units.filter((u) => u.team === 0).reduce((a, u) => a + u.kills, 0); ke += r.m.units.filter((u) => u.team === 1).reduce((a, u) => a + u.kills, 0);
  }
  console.log(`hard vs easy, new mechs only: hard won ${wins} of 6, kills ${kh}:${ke}`);
  check('7a hard beats easy with the eight new mechs (5 of 6 matches, twice the kills)', wins >= 5 && kh >= 2 * ke, `${wins}/6, ${kh}:${ke}`);
}

// ---- 8. small teams: lanes, who goes where in chiem, attack and defence split in nha ------------------------------------------------
section('8 bots at 1v1, 2v2 and 3v3');
{
  const mk = (size, s) => Array.from({ length: 2 * size }, (_, k) => ({ team: k < size ? 0 : 1, mech: MECH_ORDER[(k * 3 + s * 5) % 16], name: 'b' + k, bot: true, diff: 'normal' }));
  const lanes = [1, 2, 3].map((n) => { const m = createMatch({ seed: 1, mode: 'tdm', roster: mk(n, 0) }); allInputs(m); return m.units.slice(0, n).map((u) => u.brain.lane).join('/'); });
  check('8a lanes by team size: 1v1 0, 2v2 -10/10, 3v3 0/-14/14 (one lane each, never two bots on one lane)', lanes.join(' ') === '0 -10/10 0/-14/14', lanes.join(' '));
  const chiem = (size) => {
    const dist = [0, 0, 0, 0];
    for (let s = 0; s < 8; s++) {
      const m = createMatch({ seed: 50 + s, mode: 'chiem', roster: mk(size, s) });
      while (!m.over) {
        step(m, allInputs(m));
        for (let t = 0; t < 2; t++) {
          const us = m.units.filter((u) => u.team === t && u.alive && u.brain && u.brain.pt >= 0);
          if (us.length === size) dist[new Set(us.map((u) => u.brain.pt)).size]++;
        }
      }
    }
    const all = dist.reduce((a, b) => a + b, 0);
    return { dist, all };
  };
  const c3 = chiem(3), c2 = chiem(2);
  console.log(`chiem full team on distinct points, ticks by count: 3v3 ${c3.dist.join('/')}, 2v2 ${c2.dist.join('/')}`);
  check('8b chiem 3v3: a full team of three holds three different points at least 55% of the time (measured 69%) and all three on one point under 1% (measured 0.07%)', c3.dist[3] >= 0.55 * c3.all && c3.dist[1] < 0.01 * c3.all, c3.dist.join('/'));
  check('8c chiem 2v2: a full team of two holds two different points at least 70% of the time (measured 86%)', c2.dist[2] >= 0.7 * c2.all, c2.dist.join('/'));
  const nha = (size) => {
    let defTicks = 0, withAtk = 0, allDef = 0, full = 0;
    for (let s = 0; s < 8; s++) {
      const m = createMatch({ seed: 200 + s, mode: 'nha', map: NHA_ORDER[s % 2], roster: mk(size, s) });
      while (!m.over) {
        step(m, allInputs(m));
        for (let t = 0; t < 2; t++) {
          const us = m.units.filter((u) => u.team === t && u.alive && u.brain && u.brain.np);
          if (us.length !== size) continue;
          full++;
          const d = us.filter((u) => u.brain.np.kind === 'defend').length, a = us.filter((u) => u.brain.np.kind === 'attack').length;
          if (d === size) allDef++;
          if (d > 0) { defTicks++; if (a > 0) withAtk++; }
        }
      }
    }
    return { defTicks, withAtk, allDef, full };
  };
  const n3 = nha(3), n2 = nha(2);
  console.log(`nha 3v3 full team: defending ${n3.defTicks} ticks, one still attacking in ${(100 * n3.withAtk / n3.defTicks).toFixed(0)}%, all three home ${(100 * n3.allDef / n3.full).toFixed(0)}% of ${n3.full}; 2v2 ${(100 * n2.withAtk / n2.defTicks).toFixed(0)}% / ${(100 * n2.allDef / n2.full).toFixed(0)}%`);
  check('8d nha 3v3: while any of a full team defends, another is still attacking at least 65% of those ticks (measured 77%)', n3.defTicks > 1000 && n3.withAtk >= 0.65 * n3.defTicks, `${n3.withAtk}/${n3.defTicks}`);
  check('8e nha 3v3: a full team has all three at home under 15% of the time (measured 8%); 2v2 under 12% (measured 6%)', n3.allDef < 0.15 * n3.full && n2.allDef < 0.12 * n2.full, `${n3.allDef}/${n3.full} ${n2.allDef}/${n2.full}`);
  // 1v1: the lone bot goes for the towers (it has nobody to wait for) and the match ends by a main tower
  const m1 = createMatch({ seed: 4, mode: 'nha', map: 'luythep', roster: mk(1, 2) });
  while (!m1.over) step(m1, allInputs(m1));
  check('8f nha 1v1: a lone bot does not wait for company: the match ends by a main tower before the clock', m1.towers.some((t) => t.kind === 'main' && !t.alive) && m1.time < m1.duration, `${m1.time.toFixed(0)} s`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
