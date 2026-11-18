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
export const OLD_LACLONG = {
  passive: { do: 'meter', name: 'Giáp Thủy', max: 1200, gain: { hurt: 1 }, spend: { kind: 'shield', amount: 450, dur: 5 } },
  weapon: { name: 'Thủy Pháo', cd: 0.7, dmg: 180, speed: 26, range: 12, splash: 1.8, knock: 1.5, r: 0.32, vis: 'shell' },
  skills: [
    { id: 'voirong', cd: 8, do: 'volley', n: 1, dmg: 240, speed: 26, range: 12, r: 0.6, pierce: true, knock: 3, vis: 'wave' },
    { id: 'xoaynuoc', cd: 13, do: 'zone', at: 'target', cast: 12, radius: 5, dur: 4, slow: 0.4, haste: 1.25, vis: 'slow' },
    { id: 'longquan', cd: 42, do: 'dash', dist: 15, speed: 30, dmg: 380, stun: 0.8, knock: 3 },
  ],
};
export const OLD_LOI = {
  passive: { do: 'trait', name: 'Chấn Động' },
  weapon: { name: 'Cối Sấm', cd: 1.45, dmg: 340, lob: true, flight: 0.85, range: 17, splash: 2.7, slow: 0.3, slowDur: 1.2, vis: 'mortar' },
  skills: [
    { id: 'khoi', cd: 14, do: 'zone', at: 'target', cast: 12, radius: 4.6, dur: 5.5, hide: true, vis: 'smoke' },
    { id: 'giatlui', cd: 10, do: 'recoil', dist: 7, speed: 26, radius: 3.5, dmg: 160, knock: 4 },
    { id: 'thienloi', cd: 45, do: 'barrage', line: true, n: 5, gap: 3.2, radius: 7, blast: 3.2, dmg: 560, delay: 0.8, span: 1.2, cast: 20 },
  ],
};
const OLD = { kynhong: OLD_KYNHONG, laclong: OLD_LACLONG, loi: OLD_LOI };
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
  // ---- Lạc Long Quân (laclong), clip p71 ----
  const LL = MECHS.laclong, [LQ, LE, LU] = LL.skills, LLF = (o) => 1 - o.def.armor;
  // passive Thủy Long Thuẫn: a shield of 15% of max hp from the start; broken, it bursts 416 in 3.5 m with a 50% slow, back 15 s later
  {
    const m = arena([[R('laclong', 0), 0, 0], [R('ung', 1), 2, 0]]), [a, v] = m.units;
    go(m, 2);
    check('K16-s Thuy Long Thuan: a 420 shield (15% of 2800) up from the start', near(a.shield, 0.15 * a.maxHp) && a.rsUp, `${a.shield}`);
    a.shield = 1;
    const ev2 = go(m, 12, (i) => ({ 1: { fire: i === 0, aim: Math.PI, tx: 0, tz: 0 } }));
    const b = blows(ev2, 1, 0);
    check('K16-t ... broken: it bursts on the foe 2 m away for 416 x falloff x armour, slowed 50% 2 s; it grows back in 15 s', b.length === 1 && near(b[0].amt, 416 * fall(2, 3.5) * UNG_F) && v.slowF === 0.5 && !a.rsUp && a.rsT > 14, `${b.map((e) => e.amt)} ${v.slowF} ${a.rsT}`);
  }
  // Lôi Long Chi Tức (Q): jumps on the nearest enemy within 7 m, a tank first: 367 in 3.5 m, slows moving and firing 50% for 2 s, a 2 s shield
  {
    const m = arena([[R('laclong', 0), 0, 0], [R('ung', 1), 3, 0], [R('laclong', 1), 6, 2]]), [a, v, tank] = m.units;
    const ev = go(m, 20, (i) => ({ 0: { s1: i === 0, tx: 3, tz: 0 } }));
    const bt = only(ev, 'hit', (e) => e.id === 2 && e.by === 0 && e.amt + e.absorbed > 100);
    check('K16-u Loi Long Chi Tuc: past the nearer ung onto the tank 6.3 m away, 367 x its armour (shield included)', Math.hypot(a.x - 6, a.z - 2) < 0.5 && bt.length === 1 && near(bt[0].amt + bt[0].absorbed, 367 * LLF(tank), 0.5), `${a.x},${a.z} ${bt.map((e) => e.amt + e.absorbed)}`);
    check('K16-v ... the tank moves and fires 50% slower for 2 s; his own shield holds 2 s', tank.slowF === 0.5 && tank.sfF === 0.5 && tank.sfT > 1.3 && a.shieldT > 1.3, `${tank.slowF} ${tank.sfF} ${tank.sfT} ${a.shieldT}`);
  }
  {
    const m = arena([[R('laclong', 0), 0, 0], [R('ung', 1), 9, 0]]), a = m.units[0];
    press(m, 0, 's1', { tx: 9, tz: 0 });
    check('K16-w ... nobody within 7 m: no jump, a 0.4 s lockout', a.x === 0 && near(a.cd.s1, 0.4, 1e-9), `${a.x} ${a.cd.s1}`);
  }
  // Cuồng Long Xung Phong (E): a 6 m charge carrying the foe, 221; the hit opens Du Long Xuất Kích for 2 s: 283, carried, stun 1 s
  {
    const m = arena([[R('laclong', 0), 0, 0], [R('ung', 1), 2.5, 0]]), [a, v] = m.units;
    const ev = go(m, 12, (i) => ({ 0: { s2: i === 0, tx: 9, tz: 0 } }));
    const b = blows(ev, 1, 0);
    check('K16-x Cuong Long Xung Phong: 221 x armour, the foe carried along (x > 5), the second stage armed', b.length === 1 && near(b[0].amt, 221 * UNG_F) && v.x > 5 && a.next && a.next.armed, `${b.map((e) => e.amt)} x ${v.x} ${JSON.stringify(a.next)}`);
    let st = 0;
    const ev2 = go(m, 15, (i) => { st = Math.max(st, v.stunT); return { 0: { s2: i === 0, tx: 20, tz: 0 } }; });
    const b2 = blows(ev2, 1, 0);
    check('K16-y ... Du Long Xuat Kich: 283 x armour, stun 1 s, the cooldown runs from the first press', b2.length === 1 && near(b2[0].amt, 283 * UNG_F) && st > 0.9 && a.cd.s2 > 8, `${b2.map((e) => e.amt)} stun ${st} cd ${a.cd.s2}`);
  }
  // Giao Long Xuất Hải (R): 8 s, armour +0.25, fire x1.5, water shells of 270 to 13 m; each hit heals 5% of the lost hp and adds a stack
  {
    const m = arena([[R('laclong', 0), 0, 0], [R('ung', 1), 10, 0]]), [a, v] = m.units;
    a.hp = a.maxHp - 1000;
    press(m, 0, 'ult');
    const w = weaponOf(a);
    check('K16-z Giao Long: 8 s, the water shell 270 reaches 13 m, fire rate x1.5, cooldown held at 55', near(a.tfT, 8) && w.dmg === 270 && w.range === 13 && a.rapidF === 1.5 && a.cd.ult === LU.cd, `${a.tfT} ${JSON.stringify(w)} ${a.cd.ult}`);
    const h0 = a.hp, ev = go(m, 25, (i) => ({ 0: { fire: i === 0, tx: 10, tz: 0 } }));
    const b = blows(ev, 1, 0);
    check('K16-A ... the shell hits for 270 x armour, heals him 5% of his lost hp, one stack: damage x1.05', b.length === 1 && near(b[0].amt, 270 * UNG_F) && a.hp - h0 > 49 && a.hp - h0 < 51.5 && a.tfN === 1 && near(a.tfDmg, 1.05), `${b.map((e) => e.amt)} heal ${a.hp - h0} ${a.tfN} ${a.tfDmg}`);
    check('K16-B ... the cooldown still stands at 55 (held while the dragon is out)', a.cd.ult === LU.cd, `${a.cd.ult}`);
    put(v, 10, 0); v.kx = 0; v.kz = 0;
    const ev2 = go(m, 40, (i) => ({ 0: { ult: i === 0, tx: 10, tz: 0 } }));
    const b2 = blows(ev2, 1, 0, 100);
    check('K16-C ... recast under 4 stacks: one strike at the cursor 1 s later, 389 x 1.05 x armour, slow 40%', only(ev2, 'skill', (e) => e.id === 0 && e.skill === 'baohao').length === 1 && b2.length === 1 && near(b2[0].amt, 389 * 1.05 * UNG_F) && v.slowF === 0.4, `${b2.map((e) => e.amt)} ${v.slowF}`);
  }
  {
    const m = arena([[R('laclong', 0), 0, 0], [R('ung', 1), 10, 0]]), [a, v] = m.units;
    press(m, 0, 'ult'); go(m, 2);
    a.tfN = 4; a.tfDmg = 1 + 4 * 0.05;
    let st = 0;
    const ev = go(m, 75, (i) => { st = Math.max(st, v.stunT); return { 0: { ult: i === 0, tx: 10, tz: 0 } }; });
    const b = blows(ev, 1, 0, 100);
    check('K16-D ... recast on 4 stacks: 662 x 1.2 slow 60%, then a second slam 389 x 1.2 and a 1 s stun', only(ev, 'skill', (e) => e.id === 0 && e.skill === 'baohao4').length === 1 && b.length === 2 && near(b[0].amt, 662 * 1.2 * UNG_F) && near(b[1].amt, 389 * 1.2 * UNG_F) && st > 0.9, `${b.map((e) => e.amt)} stun ${st}`);
    go(m, 240);
    check('K16-E ... the cooldown starts once the 8 s are over', a.tfT === 0 && a.cd.ult < LU.cd && a.cd.ult > LU.cd - 6, `${a.cd.ult}`);
  }
  // the E press inside the ult's recast window parks the recast; it comes back once E's own second stage is over
  {
    const m = arena([[R('laclong', 0), 0, 0], [R('ung', 1), 2.5, 0]]), [a, v] = m.units;
    press(m, 0, 'ult'); go(m, 2);
    go(m, 12, (i) => ({ 0: { s2: i === 0, tx: 9, tz: 0 } }));
    const parked = a.aoqPark && a.next && a.next.slot === 1;
    go(m, 75);
    check('K16-G ... E inside the ult window: the ult recast is parked, then back (slot 2) after the 2 s E window', parked && a.next && a.next.slot === 2 && a.next.armed && !a.aoqPark, `${parked} ${JSON.stringify(a.next)}`);
  }
  {
    const { used, ids } = botSlots('laclong', 9);
    check('K16-F a Lac Long Quan bot uses Q, E, the ult and Bao Hao No Dao', used.has(0) && used.has(1) && used.has(2) && ids.has('loilong') && (ids.has('baohao') || ids.has('baohao4')), `${[...used]} ${[...ids]}`);
  }

  // ---- Lôi Công (loi), clip p28 ----
  const LO = MECHS.loi, [OQ, OE, OU] = LO.skills, MAXB = 0.03 * UNG.hp * UNG_F;
  // Lôi Tiễn: one 150 bolt
  {
    const m = arena([[R('loi', 0), 0, 0], [R('ung', 1), 8, 0]]);
    const ev = go(m, 12, (i) => ({ 0: { fire: i === 0, tx: 8, tz: 0 } }));
    const b = blows(ev, 1, 0);
    check('K16-H Loi Tien: one bolt of 150 x armour, no mark (weapon)', b.length === 1 && near(b[0].amt, 150 * UNG_F) && m.units[1].stkN === 0, `${b.map((e) => e.amt)}`);
  }
  // Lôi Bạo Đả Kích (Q): 0.5 s later a bolt at the cursor: 344 in 2.5 m, stun 1 s, + 3% max hp; one Điện Hà mark
  {
    const m = arena([[R('loi', 0), 0, 0], [R('ung', 1), 9, 0]]), [a, v] = m.units;
    let st = 0;
    const ev = go(m, 20, (i) => { st = Math.max(st, v.stunT); return { 0: { s1: i === 0, tx: 9, tz: 0 } }; });
    const b = blows(ev, 1, 0, 1);
    check('K16-I Loi Bao Da Kich: 344 x armour then 3% of max hp x armour on the foe at the cursor, stun 1 s, one mark', b.length === 2 && near(b[0].amt, 344 * UNG_F) && near(b[1].amt, MAXB) && st > 0.9 && v.stkN === 1 && v.stkBy === 0, `${b.map((e) => e.amt)} stun ${st} marks ${v.stkN}`);
  }
  // passive Điện Hà Ấn Ký: the third mark stuns 1.5 s; for 3 s after that the target takes no mark
  {
    const m = arena([[R('loi', 0), 0, 0], [R('ung', 1), 9, 0]]), [a, v] = m.units;
    v.stkN = 2; v.stkBy = 0; v.stkT = 5;
    let st = 0;
    const ev = go(m, 20, (i) => { st = Math.max(st, v.stunT); return { 0: { s1: i === 0, tx: 9, tz: 0 } }; });
    check('K16-J Dien Ha An Ky: the third mark goes off: a 1.5 s stun, the marks cleared', only(ev, 'stacks', (e) => e.id === 1 && e.by === 0).length === 1 && st > 1.4 && v.stkN === 0, `${st} ${v.stkN}`);
    v.stunT = 0;
    go(m, 12, (i) => ({ 0: { s2: i === 0, tx: 9, tz: 0 } }));
    check('K16-K ... a skill hit inside the next 3 s adds no mark', v.stkN === 0 && v.hp < UNG.hp - 400, `${v.stkN}`);
  }
  // Thiểm Điện Đạn Xạ (E): 290, bounces link by link to the nearest foe within 6 m, x0.75 each; two uses 3 s apart
  {
    const m = arena([[R('loi', 0), 0, 0], [R('ung', 1), 5, 0], [R('ung', 1), 9, 0], [R('ung', 1), 13, 0]]), [a, v1, v2, v3] = m.units;
    const ev = go(m, 15, (i) => ({ 0: { s2: i === 0, tx: 5, tz: 0 } }));
    const b1 = blows(ev, 1, 0, 100), b2 = blows(ev, 2, 0), b3 = blows(ev, 3, 0);
    check('K16-L Thiem Dien Dan Xa: 290 x armour on the first, then 217.5 and 163.1 down the line', b1.length === 1 && near(b1[0].amt, 290 * UNG_F) && b2.length === 1 && near(b2[0].amt, 290 * 0.75 * UNG_F) && b3.length === 1 && near(b3[0].amt, 290 * 0.5625 * UNG_F), `${b1.map((e) => e.amt)} ${b2.map((e) => e.amt)} ${b3.map((e) => e.amt)}`);
    check('K16-M ... one use spent, the second after the 3 s gap', a.use1 === 1 && a.gap1 > 2.4 && a.gap1 <= 3, `${a.use1} ${a.gap1}`);
  }
  // Lôi Thần Chi Chùy (R): the hammer hits the foe for 383 (+3% max hp) and leaves a 3 m field for 4 s: 128 a second, slow 50%
  {
    const m = arena([[R('loi', 0), 0, 0], [R('ung', 1), 8, 0]]), [a, v] = m.units;
    const ev = go(m, 15, (i) => ({ 0: { ult: i === 0, tx: 8, tz: 0 } }));
    const b = blows(ev, 1, 0, 100), z = m.zones.find((q) => q.kind === 'field' && q.owner === 0);
    check('K16-N Loi Than Chi Chuy: 383 x armour on the foe it hits, a 3 m field of 128/s for 4 s where it burst', b.length === 1 && near(b[0].amt, 383 * UNG_F) && z && z.r === 3 && z.dur === 4 && z.dps === 128 && Math.abs(z.x - 8) < 1.2, `${b.map((e) => e.amt)} ${z && [z.x, z.r, z.dur, z.dps]}`);
    const h = v.hp, ev2 = go(m, 30);
    const t = blows(ev2, 1, 0, 1);
    check('K16-O ... the foe inside: 64 x armour every 0.5 s (no mark from the ticks), slowed 50%', t.length === 2 && t.every((e) => near(e.amt, 64 * UNG_F)) && v.slowF === 0.5 && v.stkN === 1, `${t.map((e) => e.amt)} ${v.slowF} marks ${v.stkN}`);
  }
  {
    const m = arena([[R('loi', 0), 0, 0], [R('ung', 1), 30, 8]]);
    m.map.walls.push({ x0: 6, x1: 7, z0: -4, z1: 4, h: 2, kind: 'wall' });
    go(m, 15, (i) => ({ 0: { ult: i === 0, tx: 12, tz: 0 } }));
    const z = m.zones.find((q) => q.kind === 'field' && q.owner === 0);
    check('K16-P ... thrown into a wall it bursts there and the field stands against it', z && z.x > 4.5 && z.x < 6.1, `${z && z.x}`);
  }
  {
    const { used, ids } = botSlots('loi', 11);
    check('K16-Q a Loi Cong bot uses Q, E and the hammer', used.has(0) && used.has(1) && used.has(2), `${[...used]} ${[...ids]}`);
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
