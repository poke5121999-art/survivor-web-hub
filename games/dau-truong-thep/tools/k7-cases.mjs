// Kit lane K7 (feat/dtt-k7): the kits of Saitama (tegiac), Thủy Tinh (thuytinh) and Ưng Nhãn (ung) ported from the owner's clips
// (p77, p70, p92) and their G5 mechanics (sim.js blocks "kit-remake G5 Saitama / Thủy Tinh / Ưng Nhãn"). Section K7 of
// tools/sim-test.mjs; runs alone too: `node tools/k7-cases.mjs`. Expected values follow the data rows, so a balance pass keeps the arithmetic.
import { createMatch, step, armorOf } from '../js/sim.js';
import { MECHS, TICK } from '../js/data.js';

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
// a still dummy that never shoots back: weapon off, skills never pressed (inputs are empty), hp as its row says
const DUMMY = 'soi';

export function runK7Cases(check, section) {
  section('K7 kit lane K7: Saitama, Thủy Tinh, Ưng Nhãn ported from the owner\'s clips (p77, p70, p92) and their G5 mechanics (literal expected values)');

  // ---- Saitama (tegiac), clip p77 ----
  const SM = MECHS.tegiac, SP = SM.passive, [SQ, SE, SU] = SM.skills, DH = MECHS[DUMMY], DF = 1 - DH.armor;
  // Nhận Chân: a punch that lands adds a stack; each stack is +5% damage
  {
    const m = arena([[R('tegiac', 0), 0, 0], [R(DUMMY, 1), 4, 0]]), [a, v] = m.units;
    go(m, 12, (i) => ({ 0: { fire: i === 0 } }));
    check('K7-a Nhan Chan: the first punch hits for 150 x armour and adds one stack', near(DH.hp - v.hp, SM.weapon.dmg * DF, 1e-6) && a.meter === 1, `${DH.hp - v.hp} meter ${a.meter}`);
    const h = v.hp;
    go(m, 30, (i) => ({ 0: { fire: i >= 6 && i < 10 } }));
    check('K7-b ... the second punch is x1.05 (one stack) and adds a second', near(h - v.hp, SM.weapon.dmg * 1.05 * DF, 1e-6) && a.meter === 2, `${h - v.hp} meter ${a.meter}`);
  }
  // hurtPer: one stack per 5% of max hp lost (a foe's blow)
  {
    const m = arena([[R('tegiac', 0), 0, 0], [R('tegiac', 1), 4, 0]]), [a, b] = m.units;
    go(m, 12, (i) => ({ 1: { fire: i === 0 } }));
    const lost = a.maxHp - a.hp;
    check('K7-c ... a blow taken adds lost / (5% of max hp) stacks', lost > 0 && near(a.meter, lost / (SP.hurtPer * a.maxHp), 1e-9) && b.meter === 1, `lost ${lost} meter ${a.meter}`);
  }
  // full stacks: Serious Mode 3 s (guard, cc immune, 10% of lost hp per s, ignores 50% armour), then the stacks clear
  {
    const m = arena([[R('tegiac', 0), 0, 0], [R(DUMMY, 1), 4, 0]]), [a, v] = m.units;
    a.meter = SP.max - 1;
    const ev = go(m, 12, (i) => ({ 0: { fire: i === 0 } }));
    const on = only(ev, 'k7', (e) => e.kind === 'serious' && e.on === 1);
    check('K7-d ... the tenth stack starts Serious Mode: 3 s, guard 0.5, cc immune', on.length === 1 && a.meter === SP.max && a.stmT > 2.5 && a.guardF === 0.5 && a.guardT > 2.5 && a.ccT > 2.5, `${on.length} ${a.meter} ${a.stmT} ${a.guardF} ${a.ccT}`);
    const h = v.hp, arm = armorOf(m, v);
    go(m, 30, (i) => ({ 0: { fire: i >= 6 && i < 10 } }));
    check('K7-e ... in the mode a punch is x1.5 (10 stacks) and ignores half the armour', near(h - v.hp, SM.weapon.dmg * 1.5 * (1 - arm * (1 - SP.spend.pen)), 1e-6), `${h - v.hp} armour ${arm}`);
    a.hp = 2000; a.combatT = 0;
    go(m, 30);
    const want = 2000 + (a.maxHp - 2000) * (1 - (1 - SP.spend.regenLost * TICK) ** 30);
    check('K7-f ... it heals 10% of the lost hp per second', near(a.hp, want, 1e-6), `${a.hp} want ${want}`);
    const ev2 = go(m, 40);
    check('K7-g ... after 3 s it ends and every stack is gone', a.stmT === 0 && a.meter === 0 && only(ev2, 'k7', (e) => e.on === 0).length === 1, `${a.stmT} ${a.meter}`);
  }
  // Nhận Chân Hiên Trác: a fan in front, 263 with falloff, yank toward the cursor, slow 75% decaying over 2 s
  {
    const m = arena([[R('tegiac', 0), 0, 0], [R(DUMMY, 1), 3, 0], [R(DUMMY, 1), -3, 0]]), [a, v, back] = m.units;
    press(m, 0, 's1', { tx: 6, tz: 0 });
    go(m, Math.round(SQ.windup / TICK) + 1);
    check('K7-h Nhan Chan Hien Trac: 263 x falloff on the foe 3 m in front, nothing behind', near(DH.hp - v.hp, SQ.dmg * (1 - 0.5 * 3 / SQ.radius) * DF, 1e-6) && back.hp === DH.hp, `${DH.hp - v.hp} back ${back.hp}`);
    check('K7-i ... the foe is pulled to the cursor (3 m away, under the 4 m reach) and slowed 75% decaying over 2 s', near(v.x, 6, 0.05) && v.dsF === 0.75 && v.dsD === 2 && v.dsK === 0, `x ${v.x} ${v.dsF} ${v.dsD}`);
  }
  // Nhận Chân Đầu Chùy: 0.3 s wind-up, then a low jump to the cursor: 338 around the landing and a 1 s stun
  {
    const m = arena([[R('tegiac', 0), 0, 0], [R(DUMMY, 1), 8, 0]]), [a, v] = m.units;
    press(m, 0, 's2', { tx: 8, tz: 0 });
    const x0 = a.x;
    go(m, Math.round(SE.windup / TICK) - 1);
    check('K7-j Nhan Chan Dau Chuy: it stands still through the wind-up', near(a.x, x0, 0.01) && !!a.cast, `${a.x}`);
    let st = 0;
    go(m, Math.round(SE.flight / TICK) + 6, () => { st = Math.max(st, v.stunT); return null; });
    check('K7-k ... lands on the foe: 338 x armour and a 1 s stun', near(DH.hp - v.hp, SE.dmg * DF, 1) && st > 0.9 && a.x > 6, `${DH.hp - v.hp} stun ${st} x ${a.x}`);
  }
  // Nhận Chân Ẩu Đả: charge (guard, cc immune, still), a fan that grows with the time held; a full charge goes off by itself
  {
    const m = arena([[R('tegiac', 0), 0, 0], [R(DUMMY, 1), 6, 0], [R(DUMMY, 1), 6, 6]]), [a, v, side] = m.units;
    press(m, 0, 'ult');
    go(m, 30);
    check('K7-l Nhan Chan Au Da: while charging it stands, guards 0.5 and is cc immune', !!a.cast && a.cast.charge && near(a.x, 0, 0.01) && a.guardF === 0.5 && a.guardT > 0 && a.ccT > 0, `${a.x} ${a.guardF} ${a.ccT}`);
    const ev = go(m, Math.round(SU.charge.max / TICK));
    const nv = only(ev, 'nova', (e) => e.skill === SU.id);
    check('K7-m ... a full charge goes off by itself: 948 x falloff at 6 m of 12, the foe at 45 degrees (outside the 0.6 rad fan) untouched',
      nv.length === 1 && near(nv[0].r, SU.charge.range[1], 1e-9) && near(DH.hp - v.hp, SU.charge.dmg[1] * (1 - 0.5 * 6 / 12) * DF, 1e-6) && side.hp === DH.hp, `${nv.length} ${DH.hp - v.hp} side ${side.hp}`);
  }
  {
    const m = arena([[R('tegiac', 0), 0, 0], [R(DUMMY, 1), 5, 0]]), [a, v] = m.units;
    press(m, 0, 'ult');
    go(m, 29);
    const ev = press(m, 0, 'ult');
    const f = 30 / Math.round(SU.charge.max / TICK), dmg = SU.charge.dmg[0] + (SU.charge.dmg[1] - SU.charge.dmg[0]) * f, r = SU.charge.range[0] + (SU.charge.range[1] - SU.charge.range[0]) * f;
    const nv = only(ev, 'nova', (e) => e.skill === SU.id);
    check('K7-n ... a second press after 1 s lets it go at a third of the charge', nv.length === 1 && near(nv[0].r, r, 1e-6) && near(DH.hp - v.hp, dmg * (1 - 0.5 * 5 / r) * DF, 1e-6), `${nv.length && nv[0].r} ${DH.hp - v.hp} want ${dmg * (1 - 0.5 * 5 / r) * DF}`);
  }
  // ... the knocked mech that runs into its own ally is slammed: + 50% of its lost hp as true damage, stunned 1 s
  {
    // a quick release (0.33 s): the fan reaches 7.6 m, so the ally at 8.2 m is outside it and the foe at 6 m is thrown into it
    const m = arena([[R('tegiac', 0), 0, 0], [R(DUMMY, 1), 6, 0], [R(DUMMY, 1), 8.2, 0]]), [a, v, al] = m.units;
    press(m, 0, 'ult');
    go(m, 9);
    press(m, 0, 'ult');
    let pay = null, st = 0;
    for (let i = 0; i < 30 && !pay; i++) {
      const before = v.hp, ev = go(m, 1), sl = only(ev, 'slam', (e) => e.id === v.id);
      if (sl.length) pay = { want: (v.maxHp - before) * SU.fx.slam.lostHp, got: only(ev, 'hit', (e) => e.id === v.id && e.by === 0).reduce((s, e) => s + e.amt, 0) };
      st = v.stunT;
    }
    check('K7-o ... slammed into its ally: 50% of its lost hp more (true damage) and a 1 s stun', !!pay && pay.want > 100 && al.stunT > 0.9 && near(pay.got, pay.want, 1e-6) && st > 0.9, `${pay && pay.got} want ${pay && pay.want} stun ${st}`);
  }

  // ---- Thủy Tinh (thuytinh), clip p70 ----
  const TT = MECHS.thuytinh, TP = TT.passive, [TQ, TE, TU] = TT.skills;
  // Hải Yêu Chi Nộ: a hit adds a mark and slows the victim's fire 10% per mark; the fifth freezes 2 s, then 4 s without marks
  {
    const m = arena([[R('thuytinh', 0), 0, 0], [R(DUMMY, 1), 5, 0]]), [a, v] = m.units;
    go(m, 12, (i) => ({ 0: { fire: i === 0 } }));
    check('K7-p Hai Yeu Chi No: a 150 drop hits for 150 x armour, one mark, the foe\'s fire at x0.9 for 4 s', near(DH.hp - v.hp, TT.weapon.dmg * DF, 1e-6) && v.stkN === 1 && near(v.sfF, 0.9, 1e-9) && v.sfT > 3.5, `${DH.hp - v.hp} ${v.stkN} ${v.sfF}`);
    v.stkN = 4; v.stkT = 4;
    const ev = go(m, 25, (i) => ({ 0: { fire: i === 8 } }));
    check('K7-q ... the fifth mark freezes it 2 s, puts the frozen tag on and locks marks out for 4 s', only(ev, 'stacks').length === 1 && v.stunT > 1.5 && v.tags['frozen@' + a.id] > 1.5 && v.stkN === 0 && v.sfF <= 0.5 + 1e-9, `${v.stunT} ${v.stkN} ${v.sfF}`);
    go(m, 20, (i) => ({ 0: { fire: i === 0 } }));
    check('K7-r ... a hit inside the lockout adds no mark', v.stkN === 0 && v.hp < DH.hp - 2 * TT.weapon.dmg * DF, `${v.stkN}`);
  }
  // Băng Lãnh Trí Tuệ: 263 round her and a mark; on a foe frozen by her marks x(601/263) + 15% of its lost hp, and the cooldown is back
  {
    const m = arena([[R('thuytinh', 0), 0, 0], [R(DUMMY, 1), 2, 0], [R(DUMMY, 1), -2, 0]]), [a, v, w] = m.units;
    v.stunT = 2; v.tags['frozen@' + a.id] = 2; v.hp = 2000; w.hp = 2000;
    press(m, 0, 's1');
    go(m, Math.round(TQ.windup / TICK) + 1);
    const plain = TQ.dmg * (1 - 0.5 * 2 / TQ.radius) * DF, hard = plain * TQ.vsTag.mul;
    check('K7-s Bang Lanh Tri Tue: the free foe takes 263 x falloff and gets a mark', near(2000 - w.hp, plain, 1e-6) && w.stkN === 1, `${2000 - w.hp} ${w.stkN}`);
    check('K7-t ... the frozen one takes 601 x falloff + 15% of its lost hp (true), the tag is used up and Q is ready again',
      near(2000 - v.hp, hard + (DH.hp - (2000 - hard)) * 0.15, 1e-6) && !(v.tags['frozen@' + a.id] > 0) && a.cd.s1 === 0, `${2000 - v.hp} want ${hard + (DH.hp - (2000 - hard)) * 0.15} cd ${a.cd.s1}`);
  }
  // Thủy Mạc Bình Chướng: a wall at the cursor, 332 round it as it forms and two marks; a second press recalls it
  {
    const m = arena([[R('thuytinh', 0), 0, 0], [R(DUMMY, 1), 8, 2]]), [a, v] = m.units;
    const ev = press(m, 0, 's2', { tx: 8, tz: 0 });
    const wall = m.zones.find((z) => z.kind === 'wall' && z.owner === a.id);
    check('K7-u Thuy Mac Binh Chuong: five water blocks across the aim at the cursor', !!wall && wall.pts.length === TE.n && near(wall.x, 8, 1e-6) && wall.pts.every((p) => near(p[0], 8, 1e-6)), wall && JSON.stringify(wall.pts));
    check('K7-v ... 332 x falloff on the foe 2 m from it and two marks', near(DH.hp - v.hp, TE.burst.dmg * (1 - 0.5 * 2 / TE.burst.radius) * DF, 1e-6) && v.stkN === 2 && only(ev, 'nova', (e) => e.skill === TE.id).length === 1, `${DH.hp - v.hp} marks ${v.stkN}`);
    go(m, 5);
    press(m, 0, 's2');
    check('K7-w ... pressed again inside 4 s it is recalled', !m.zones.some((z) => z.kind === 'wall'), `${m.zones.length}`);
  }
  // Cuồng Lan Thúc Phược: 122 every 0.5 s with a mark each, the slow growing to 50% over 2 s, she heals 75 per pulse inside
  {
    const m = arena([[R('thuytinh', 0), 6, 1], [R(DUMMY, 1), 8, 0]]), [a, v] = m.units;
    a.hp = 1000; a.combatT = 0;
    press(m, 0, 'ult', { tx: 8, tz: 0 });
    go(m, 15);
    check('K7-x Cuong Lan Thuc Phuoc: after 0.5 s the foe took 122 x armour and one mark', near(DH.hp - v.hp, TU.dps * 0.5 * DF, 1e-6) && v.stkN === 1, `${DH.hp - v.hp} ${v.stkN}`);
    check('K7-y ... she heals 75 per pulse standing in it', near(a.hp, 1000 + TU.ownerHps * 0.5, 1e-6), `${a.hp}`);
    go(m, 15);
    check('K7-z ... after 1 s the slow is half of 50%', near(v.slowF, 0.25, 0.02) && v.slowT > 0, `${v.slowF}`);
  }
  // Băng Phong Chi Tâm: a fatal hit seals her in ice 3 s (30% hp, untargetable, no walking, no shooting); a cast breaks it
  {
    const m = arena([[R('thuytinh', 0), 0, 0], [R(DUMMY, 1), 5, 0, Math.PI]]), [a, v] = m.units;
    a.hp = 20;
    const ev = go(m, 12, (i) => ({ 1: { fire: i === 0 } }));
    check('K7-za Bang Phong Chi Tam: the fatal hit leaves her at 1 + 30% of max hp, sealed 3 s and untargetable', a.alive && near(a.hp, 1 + TP.mods.save.heal * a.maxHp, 1e-6) && a.sirT > 2.5 && a.invulnT > 2.5 && only(ev, 'k7', (e) => e.kind === 'ice' && e.on === 1).length === 1, `${a.hp} ${a.sirT}`);
    const x0 = a.x, ev2 = go(m, 20, () => ({ 0: { mx: 1, fire: true } }));
    check('K7-zb ... she neither walks nor shoots in the ice', near(a.x, x0, 1e-6) && only(ev2, 'fire', (e) => e.id === a.id).length === 0, `${a.x - x0}`);
    const ev3 = press(m, 0, 's1');
    check('K7-zc ... a cast breaks it at once (untargetable no more)', a.sirT === 0 && a.invulnT === 0 && only(ev3, 'k7', (e) => e.kind === 'ice' && e.on === 0).length === 1, `${a.sirT} ${a.invulnT}`);
  }

  // ---- Ưng Nhãn (ung), clip p92 ----
  const UN = MECHS.ung, UP = UN.passive, UW = UN.weapon, [UQ, UE, UU] = UN.skills;
  const shots = (m, k, n, extra) => go(m, n, (i) => ({ [k]: { fire: true, ...extra } }));
  // Súng Ưng: 150 a shot, six to a magazine, then 1.2 s to reload
  {
    const m = arena([[R('ung', 0), 0, 0], [R(DUMMY, 1), 6, 0]]), [a, v] = m.units;
    go(m, 6, (i) => ({ 0: { fire: i === 0 } }));
    check('K7-ua Sung Ung: a shot hits for 150 x armour', near(DH.hp - v.hp, UW.dmg * DF, 1e-6), `${DH.hp - v.hp}`);
    v.hp = v.maxHp = 1e6;
    const at = [];
    let rlAt = -1;
    for (let t = 0; t < 150; t++) { const ev = shots(m, 0, 1); if (only(ev, 'fire', (e) => e.id === 0).length) at.push(t); if (rlAt < 0 && only(ev, 'reload', (e) => e.id === 0).length) rlAt = t; }
    const quiet = at.filter((t) => t > rlAt && t < rlAt + Math.round(UW.mag.reload / TICK) - 1);
    check('K7-ub ... the magazine empties after 6 shots and the gun waits 1.2 s', rlAt >= 0 && at.filter((t) => t <= rlAt).length === UW.mag.n - 1 && !quiet.length && at.some((t) => t > rlAt), `shots ${at} reload ${rlAt}`);
  }
  // Miểu Chuẩn: 4 hits within 2 s give a 2 s Aim state: x1.5 on a mech whose shield is half its max hp or more
  {
    const m = arena([[R('ung', 0), 0, 0], [R(DUMMY, 1), 6, 0]]), [a, v] = m.units;
    v.hp = v.maxHp = 1e6;
    const ev = go(m, 70, (i) => ({ 0: { fire: i < 55 } }));
    check('K7-uc Mieu Chuan: four hits in a row start Aim for 2 s', only(ev, 'k7', (e) => e.kind === 'aim').length >= 1 && a.hwkAimT > 0, `${a.hwkAimT}`);
    a.hwkAimT = 2; a.magN = 0; a.magT = 0; a.cd.fire = 0; v.shield = v.shieldMax = 6e5; v.shieldT = 99;
    const ev2 = go(m, 6, (i) => ({ 0: { fire: i === 0 } }));
    const h = only(ev2, 'hit', (e) => e.id === v.id);
    check('K7-ud ... in Aim a shot on a mech with a shield over half its hp is x1.5', h.length === 1 && near(h[0].absorbed, UW.dmg * 1.5 * DF, 1e-6), JSON.stringify(h));
  }
  // low hp: half her hp lost -> shots x1.25 and 25% lifesteal
  {
    const m = arena([[R('ung', 0), 0, 0], [R(DUMMY, 1), 6, 0]]), [a, v] = m.units;
    a.hp = a.maxHp / 2;
    go(m, 6, (i) => ({ 0: { fire: i === 0 } }));
    const took = DH.hp - v.hp;
    check('K7-ue ... at half hp a shot is x1.25 and heals 25% of what it takes', near(took, UW.dmg * 1.25 * DF, 1e-6) && near(a.hp, a.maxHp / 2 + took * UP.lowSteal * 0.5, 1e-6), `${took} hp ${a.hp}`);
  }
  // Hàn Ngưng Thị: the eye reveals a hidden foe inside and her shots do x1.25 on it
  {
    const m = arena([[R('ung', 0), 0, 0], [R(DUMMY, 1), 8, 0]]), [a, v] = m.units;
    v.stealthT = 5;
    press(m, 0, 's1', { tx: 8, tz: 0 });
    check('K7-uf Han Ngung Thi: the foe in the eye is revealed and tagged for 3 s', v.stealthT === 0 && v.revealT > 2.9 && v.tags['eye@' + a.id] > 2.9, `${v.stealthT} ${v.tags['eye@' + a.id]}`);
    go(m, 8, (i) => ({ 0: { fire: i === 0 } }));
    check('K7-ug ... her shot on it is x1.25', near(DH.hp - v.hp, UW.dmg * UW.vsTag.mul * DF, 1e-6), `${DH.hp - v.hp}`);
  }
  // Thuấn Tập Ưng Ảnh: a 4 m dash, the magazine full at once, the next 5 shots x2 fire rate with 50% lifesteal
  {
    const m = arena([[R('ung', 0), 0, 0], [R(DUMMY, 1), 9, 0]]), [a, v] = m.units;
    v.hp = v.maxHp = 1e6;
    shots(m, 0, 30);
    const before = a.magN || a.magT;
    a.hp = 1000;
    const ev = press(m, 0, 's2', { mx: 0, mz: 1 });
    check('K7-uh Thuan Tap Ung Anh: the press refills the magazine and arms 5 shots at x2 fire rate', before > 0 && a.magN === 0 && a.magT === 0 && a.shotN === 5 && a.rapidF === 2 && only(ev, 'k7', (e) => e.kind === 'reload').length === 1, `${before} ${a.magN} ${a.shotN} ${a.rapidF}`);
    go(m, 20, () => ({ 0: { aim: Math.atan2(v.z - a.z, v.x - a.x) } }));
    check('K7-ui ... it dashes 4 m', near(a.z, UE.dist, 0.3), `${a.z}`);
    const hp0 = a.hp, hits = [];
    for (let t = 0; t < 90 && hits.length < 5; t++) hits.push(...only(go(m, 1, () => ({ 0: { fire: true, aim: Math.atan2(v.z - a.z, v.x - a.x) } })), 'hit', (e) => e.id === v.id && e.by === 0));
    const heals = hits.length;
    check('K7-uj ... the 5 shots heal half of what they take', a.shotN === 0 && hits.length === 5 && near(a.hp - hp0, 0.5 * hits.reduce((q, e) => q + e.amt, 0), 1e-6), `${a.shotN} healed ${a.hp - hp0} want ${0.5 * hits.reduce((q, e) => q + e.amt, 0)} hits ${heals}`);
  }
  // Liệt Phong Chuẩn: 236, slow 60% decaying over 4 s, a 4 s mark; each of her shots on it bursts 113 (+38 a burst), 4 bursts
  {
    const m = arena([[R('ung', 0), 0, 0], [R(DUMMY, 1), 8, 0], [R(DUMMY, 1), 8, 1.5]]), [a, v, w] = m.units;
    v.hp = v.maxHp = 1e5; w.hp = w.maxHp = 1e5;
    press(m, 0, 'ult');
    go(m, 10);
    check('K7-uk Liet Phong Chuan: 236 x armour, the slow decaying from 60% over 4 s, the falcon mark', near(1e5 - v.hp, UU.dmg * DF, 1e-6) && v.dsF === 0.6 && v.dsD === 4 && v.tags['falcon@' + a.id] > 3.5, `${1e5 - v.hp} ${v.dsF}`);
    const hv = v.hp, hw = w.hp, ev = go(m, 6, (i) => ({ 0: { fire: i === 0 } }));
    const b = only(ev, 'k7', (e) => e.kind === 'falcon');
    check('K7-ul ... a shot on it bursts: 150 + 113 on it, 113 x falloff on the foe 1.5 m away', b.length === 1 && near(hv - v.hp, (UW.dmg + UU.falcon.dmg) * DF, 1e-6) && near(hw - w.hp, UU.falcon.dmg * (1 - 0.5 * 1.5 / UU.falcon.radius) * DF, 1e-6), `${hv - v.hp} ${hw - w.hp}`);
    const ev2 = go(m, 120, (i) => ({ 0: { fire: true } }));
    const b2 = only(ev2, 'k7', (e) => e.kind === 'falcon');
    check('K7-um ... three more bursts, each 38 stronger, then the mark is gone', b2.length === 3 && b2[2].n === 4 && !(v.tags['falcon@' + a.id] > 0), `${b2.length}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0, passed = 0;
  runK7Cases((name, cond, detail = '') => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); } }, (s) => console.log(`\n# ${s}`));
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
