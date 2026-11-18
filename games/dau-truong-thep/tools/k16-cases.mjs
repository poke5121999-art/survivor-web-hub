// Kit lane k16 (feat/dtt-k16): the kits of Natsu (kynhong, clip p78), Lạc Long Quân (laclong, p71) and Lôi Công (loi, p28) ported
// from the owner's clips, and their G5 mechanics (sim.js block "kit lane k16"). Section K16 of tools/sim-test.mjs; runs alone too:
// `node tools/k16-cases.mjs`. Expected values follow the data rows, so a balance pass keeps the arithmetic.
// The kits these tanks had before are fixtures now: OLD_* with oldK16(m) keep the generic primitives of the older sections covered.
import { createMatch, step, armorOf, unitSpeed, weaponOf } from '../js/sim.js';
import { allInputs } from '../js/bots.js';
import { MECHS, TICK } from '../js/data.js';

export const OLD_KYNHONG = {
  passive: { do: 'brittle', name: 'Lửa Rồng', mul: 1.2, when: 'burn' },
  weapon: { name: 'Hỏa Quyền', cd: 0.12, dmg: 25, speed: 22, range: 6.5, spread: 0.14, r: 0.34, pierce: true, vis: 'flame', fx: { burn: { dps: 20, dur: 3, max: 4 } } },
  skills: [
    { id: 'hoalongkhieu', cd: 8, do: 'volley', n: 5, fan: 0.16, dmg: 100, speed: 24, range: 8, r: 0.4, pierce: true, vis: 'flame', fx: { burn: { dps: 20, dur: 3, max: 4 } } },
    { id: 'hoaquyendot', cd: 10, do: 'dash', dist: 7, speed: 32, dmg: 360, stun: 0.3, knock: 3, stop: true, fx: { burn: { dps: 20, dur: 3, max: 4 } } },
    { id: 'longhoa', cd: 44, do: 'transform', dur: 5, armor: 0.15, haste: 1.15, weapon: { range: 11, dmg: 36, r: 0.5 } },
  ],
};
const OLD = { kynhong: OLD_KYNHONG };
// Every old-kit mech of the match plays its old kit (the match must be fresh: nothing pressed yet).
export function oldK16(m) {
  for (const u of m.units) {
    const K = OLD[u.mech];
    if (!K) continue;
    const tfWeapon = {};
    K.skills.forEach((s, k) => { if (s.do === 'transform' && s.weapon) tfWeapon[k] = { ...K.weapon, ...s.weapon }; });
    u.def = { ...u.def, passive: K.passive, weapon: K.weapon, skills: K.skills, tfWeapon };
    u.passive = K.passive.do;
  }
  return m;
}

const IN = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };
const inp = (o) => Object.assign({}, IN, o);
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const R = (mech, team = 0) => ({ team, mech, name: mech + team });
function put(u, x, z) { u.x = u.px = x; u.z = u.pz = z; }
function arena(units, seed = 5) {
  const m = createMatch({ seed, roster: units.map((u) => u[0]) });
  m.map.walls.length = 0; m.map.rounds.length = 0; m.map.bushes.length = 0; m.map.hazards.length = 0;
  for (const p of m.props) p.alive = false;
  units.forEach(([, x, z, aim], i) => { const u = m.units[i]; put(u, x, z); u.aim = u.heading = aim ?? (u.team ? Math.PI : 0); u.combatT = 0; });
  m.crateT = 1e9;
  return m;
}
function go(m, ticks, f) {
  const ev = [];
  for (let i = 0; i < ticks; i++) {
    const o = (f && f(i)) || {};
    step(m, m.units.map((u, k) => inp({ aim: u.aim, tx: u.x, tz: u.z, ...o[k] })));
    for (const e of m.events) ev.push(e);
  }
  return ev;
}
const only = (ev, t, f = () => true) => ev.filter((e) => e.t === t && f(e));
const press = (m, k, slot, extra) => go(m, 1, () => ({ [k]: { [slot]: true, ...extra } }));
const UNG = MECHS.ung, UNG_F = 1 - UNG.armor;
const blows = (ev, id, by, min = 20) => only(ev, 'hit', (e) => e.id === id && e.by === by && e.amt + e.absorbed >= min);
const fall = (d, r) => 1 - 0.5 * Math.min(1, d / r);
// A bot of this mech fights bots for 90 s: the slots it pressed (skill events of unit 0, second stages and follow-ups apart).
function botSlots(mech, seed) {
  const m = createMatch({ seed, map: 'denrung', roster: [{ team: 0, mech, name: 'A', bot: true, diff: 'hard' }, { team: 1, mech: 'trau', name: 'B', bot: true, diff: 'normal' }, { team: 1, mech: 'ung', name: 'C', bot: true, diff: 'normal' }] });
  const used = new Set(), ids = new Set();
  for (let i = 0; i < Math.round(90 / TICK) && !m.over; i++) {
    step(m, allInputs(m, null));
    for (const e of m.events) if (e.t === 'skill' && e.id === 0) { used.add(e.slot); ids.add(e.skill); }
  }
  return { used, ids };
}

export function runK16Cases(check, section) {
  section('K16 kit lane k16: Natsu, Lạc Long Quân, Lôi Công ported from the owner\'s clips (p78, p71, p28) and their G5 mechanics (literal expected values)');

  // ---- Natsu (kynhong), clip p78 ----
  const KY = MECHS.kynhong, [KQ, KE, KU] = KY.skills, MANA = KY.passive.ntsMana;
  // Hỏa Quyền: one 150 blow
  {
    const m = arena([[R('kynhong', 0), 0, 0], [R('ung', 1), 5, 0]]);
    const ev = go(m, 10, (i) => ({ 0: { fire: i === 0, tx: 5, tz: 0 } }));
    const b = blows(ev, 1, 0);
    check('K16-a Hoa Quyen: one blow of 150 x armour', b.length === 1 && near(b[0].amt, 150 * UNG_F), `${b.map((e) => e.amt)}`);
  }
  // passive Viêm Long Ma Lực: each press a stack (+10% speed, +0.03 armour); the press made on three stacks spends them: -6 s, the burst
  {
    const m = arena([[R('kynhong', 0), 0, 0], [R('ung', 1), 30, 0]]), a = m.units[0];
    const arm0 = armorOf(m, a);
    press(m, 0, 's2', { tx: 8, tz: 0 });
    check('K16-b Viem Long Ma Luc: one press, one stack: speed x1.1, armour +0.03', a.ntsN === 1 && near(unitSpeed(a), KY.speed * 1.1 * (a.cast ? a.cast.move : 1)) && near(armorOf(m, a), arm0 + 0.03), `${a.ntsN} ${unitSpeed(a)} ${armorOf(m, a)}`);
    go(m, 20); a.cd.s1 = 0; a.cd.s2 = 0; a.cd.ult = 0;
    press(m, 0, 's1', { tx: 4, tz: 0 }); go(m, 20);
    press(m, 0, 'ult'); go(m, 2);
    const N3 = a.ntsN, spd3 = unitSpeed(a);
    a.cd.s2 = 0; a.hasteT = 0; a.armorT = 0;
    const ev = press(m, 0, 's2', { tx: 8, tz: 0 });
    check('K16-c ... three stacks after three presses (speed x1.3)', N3 === 3 && spd3 > KY.speed * 1.29, `${N3} ${spd3}`);
    check('K16-d ... the fourth press spends them: its cooldown is 8 - 6 = 2 s, 1.5 s burst, stacks 0', a.ntsN === 0 && near(a.cd.s2, KE.cd - MANA.cut, 1e-9) && near(a.ntsT, 1.5, 1e-9) && only(ev, 'k16', (e) => e.kind === 'ntsBurst').length === 1, `${a.ntsN} cd ${a.cd.s2} ${a.ntsT}`);
    go(m, 15);
    check('K16-e ... the burst decays: speed x(1 + share left) and armour + 0.3 x share left', a.ntsT > 0 && near(k16Share(a) * 0.3 + 0, armorOf(m, a) - armorBase(m, a), 1e-6), `${a.ntsT} ${armorOf(m, a)}`);
    go(m, 40);
    check('K16-f ... gone after 1.5 s', a.ntsT === 0);
  }
  // Hồng Liên Bạo Nhận (Q): leaps to the cursor, spins: 264 in 3 m; then 3 s of speed x1.3 and armour
  {
    const m = arena([[R('kynhong', 0), 0, 0], [R('ung', 1), 7, 0]]), [a, v] = m.units;
    const ev = go(m, 20, (i) => ({ 0: { s1: i === 0, tx: 6, tz: 0 } }));
    const b = blows(ev, 1, 0);
    check('K16-g Hong Lien Bao Nhan: lands at the cursor, the foe 1 m away takes 264 x falloff (1 m of 3) x armour', near(a.x, 6, 0.1) && b.length === 1 && near(b[0].amt, 264 * fall(1, 3) * UNG_F), `${a.x} ${b.map((e) => e.amt)}`);
    check('K16-h ... speed x1.3 for 3 s from the press, armour +0.1', a.hasteF === 1.3 && a.hasteT > 2.2 && a.armorF === 0.1, `${a.hasteF} ${a.hasteT} ${a.armorF}`);
  }
  // Long Thần Hoàng Viêm (E): a 8 x 2 m line of dragon fire after 0.35 s: 192, slow 40% 2 s
  {
    const m = arena([[R('kynhong', 0), 0, 0], [R('ung', 1), 5, 0.5], [R('ung', 1), 5, 3]]), [a, v, off] = m.units;
    const ev = go(m, 15, (i) => ({ 0: { s2: i === 0, tx: 8, tz: 0 } }));
    const b = blows(ev, 1, 0);
    check('K16-i Long Than Hoang Vien: 192 x armour on the foe in the line, slowed 40%; the one 3 m aside untouched', b.length === 1 && near(b[0].amt, 192 * UNG_F) && v.slowF === 0.4 && v.slowT > 1.5 && off.hp === UNG.hp, `${b.map((e) => e.amt)} ${v.slowF} ${off.hp}`);
  }
  // Lôi Viêm Cuồng Long (R): 8 s, field 3.5 m of 113 a second following him, the outer 1.2 m (the dragon ring) x2; armour +0.3; heals 6% lost/s
  {
    const m = arena([[R('kynhong', 0), 0, 0], [R('ung', 1), 1, 0], [R('ung', 1), 0, 3]]), [a, inner, ring] = m.units;
    a.hp = a.maxHp - 1000;
    const arm0 = armorOf(m, a);
    const ev = press(m, 0, 'ult').concat(go(m, 19));
    const bi = blows(ev, 1, 0, 1), br = blows(ev, 2, 0, 1);
    check('K16-j Loi Viem: 8 s, armour +0.3, cc 30% shorter', near(a.tfT, 8 - 19 * TICK, 1e-6) && near(armorOf(m, a), arm0 + 0.3 + 0.03) && a.tfCc === 0.7, `${a.tfT} ${armorOf(m, a)} ${a.tfCc}`);
    check('K16-k ... after 0.5 s one pulse: 56.5 x armour on the foe 1 m away, 113 x armour on the foe in the dragon ring 3 m away', bi.length === 1 && near(bi[0].amt, 56.5 * UNG_F) && br.length === 1 && near(br[0].amt, 113 * UNG_F), `${bi.map((e) => e.amt)} ${br.map((e) => e.amt)}`);
    check('K16-l ... he heals 6% of his lost hp a second (about 1000 x (1 - e^-0.038) in 0.63 s)', a.hp > a.maxHp - 1000 + 30 && a.hp < a.maxHp - 1000 + 45, `${a.hp - (a.maxHp - 1000)}`);
  }
  // in Lôi Viêm: Q lands 4 m for 343, heals 30% of it, + 6% of the lost hp (true); E is a fan: 250, silence 1 s, nothing behind him
  {
    const m = arena([[R('kynhong', 0), 0, 0], [R('ung', 1), 30, 0]]), a = m.units[0];
    press(m, 0, 'ult'); go(m, 2);
    put(m.units[1], 9.8, 0); a.hp = a.maxHp - 1500;
    const h0 = a.hp, ev = go(m, 20, (i) => ({ 0: { s1: i === 0, tx: 6, tz: 0 } }));
    const b = blows(ev, 1, 0, 1), dmg = 343 * fall(3.8, 4) * UNG_F;
    check('K16-m ... Q in Loi Viem: 4 m reach, 343 x falloff x armour + 6% of the lost hp (true)', b.length === 2 && near(b[0].amt, dmg) && near(b[1].amt, 0.06 * dmg), `${b.map((e) => e.amt)}`);
    check('K16-n ... and heals him 30% of what it took (plus the field\'s heal)', a.hp - h0 >= 0.3 * (b[0].amt) - 1e-6, `${a.hp - h0}`);
  }
  {
    const m = arena([[R('kynhong', 0), 0, 0], [R('ung', 1), 30, 0], [R('ung', 1), -30, 0]]), [a, v, back] = m.units;
    press(m, 0, 'ult'); go(m, 2);
    put(v, 6, 2); put(back, -5, 0);
    const ev = go(m, 15, (i) => ({ 0: { s2: i === 0, tx: 8, tz: 0 } }));
    const b = blows(ev, 1, 0, 100), d = Math.hypot(6, 2);
    check('K16-o ... E in Loi Viem: a fan, the foe 18 degrees off the axis takes 250 x falloff x armour and is silenced 1 s', only(ev, 'nova', (e) => e.id === 0 && e.r === 8).length === 1 && b.length === 1 && near(b[0].amt, 250 * fall(d, 8) * UNG_F) && v.silenceT > 0.6, `${b.map((e) => e.amt)} ${v.silenceT}`);
    check('K16-p ... the foe behind him is outside the fan', blows(ev, 2, 0, 100).length === 0);
    go(m, 240);
    check('K16-q ... after 8 s the rows are plain again (E a line beam)', a.tfT === 0 && a.def.skills[1].do === 'beam' && a.def.skills[0].dmg === 264, `${a.def.skills[1].do}`);
  }
  // the bot plays the new kit: all three slots in a fight
  {
    const { used, ids } = botSlots('kynhong', 7);
    check('K16-r a Natsu bot uses Q, E and the ult in a 90 s fight', used.has(0) && used.has(1) && used.has(2) && ids.has('honglien') && ids.has('loiviem'), `${[...used]} ${[...ids]}`);
  }
}

// the burst share left and the armour without the burst (for K16-e)
function k16Share(a) { const B = MECHS.kynhong.passive.ntsMana.burst; return a.ntsT / B.dur; }
function armorBase(m, a) { const T = a.ntsT; a.ntsT = 0; const v = armorOf(m, a); a.ntsT = T; return v; }

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0, passed = 0;
  runK16Cases((name, cond, detail = '') => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); } }, (s) => console.log(`\n# ${s}`));
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
