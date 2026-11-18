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
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0, passed = 0;
  runK7Cases((name, cond, detail = '') => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); } }, (s) => console.log(`\n# ${s}`));
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
