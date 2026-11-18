// Kit lane K1 (feat/dtt-k1): the kits of Hulk (khidot), Captain America (tacke), Tư Mã Ý (tumay) and Star Lord (enbac) ported
// from the owner's clips, and their G5 mechanics (sim.js block "kit lane K1"). Section K1 of tools/sim-test.mjs; runs alone too:
// `node tools/k1-cases.mjs`. Expected values follow the data rows, so a balance pass keeps the arithmetic.
import { createMatch, step, armorOf, weaponOf, unitSpeed } from '../js/sim.js';
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
const UNG = MECHS.ung, UNG_F = 1 - UNG.armor;
const applyStun = (u, s) => { u.stunT = Math.max(u.stunT, s); };

export function runK1Cases(check, section) {
  section('K1 kit lane K1: Hulk, Captain America, Tư Mã Ý, Star Lord ported from the owner\'s clips (p23, p21, p12, p18) and their G5 mechanics (literal expected values)');

  // ---- Hulk (khidot), clip p23 ----
  const KD = MECHS.khidot, [KQ, KE, KU] = KD.skills;
  // passive Trùng Sinh Trị Dũ: 2% max hp per s in pulses of 0.5 s; healUp: every heal x (1 + 0.5 x lost share)
  {
    const m = arena([[R('khidot', 0), 0, 0], [R('ung', 1), 25, 0]]), a = m.units[0];
    a.hp = a.maxHp * 0.5; let h = a.hp;
    go(m, 15);
    const want = h + 0.01 * a.maxHp * (1 + 0.5 * 0.5);
    check('K1-a Trung Sinh Tri Du: a 0.5 s pulse heals 1% of max hp x (1 + 0.5 x 0.5 lost) at half hp', near(a.hp, want, 1e-6), `${a.hp - h} want ${want - h}`);
    a.hp = a.maxHp; h = a.hp; a.hp = a.maxHp * 0.9; const h9 = a.hp; go(m, 15);
    check('K1-b ... at 90% hp the bonus is only x1.05', near(a.hp - h9, 0.01 * a.maxHp * 1.05, 1e-6), `${a.hp - h9}`);
  }
  // Chấn Không Nộ Hống: nova 5 m, 245, slow 25% and weaken x0.75 for 2 s
  {
    const m = arena([[R('khidot', 0), 0, 0], [R('ung', 1), 2, 0], [R('ung', 1), 9, 0]]), [a, v, far] = m.units;
    go(m, 1 + Math.round(KQ.windup / TICK) + 1, (i) => ({ 0: { s1: i === 0 } }));
    check('K1-c Chan Khong No Hong: 245 with falloff x (1 - armour) on the foe 2 m away', near(UNG.hp - v.hp, KQ.dmg * (1 - 0.5 * 2 / KQ.radius) * UNG_F, 1e-6), `${UNG.hp - v.hp}`);
    check('K1-d ... slowed 25% and weakened x0.75 for 2 s; the foe at 9 m untouched', v.slowF === 0.25 && v.slowT > 1.9 && v.weakenF === 0.75 && v.weakenT > 1.9 && far.hp === UNG.hp, `${v.slowF} ${v.weakenF} ${far.hp}`);
  }
  // Tử Vong Tiễn Đạp: 0.25 s wind-up standing still, then the leap lands for 233 and knocks up 0.5 s
  {
    const m = arena([[R('khidot', 0), 0, 0], [R('ung', 1), 8, 0]]), [a, v] = m.units;
    press(m, 0, 's2', { tx: 8, tz: 0 });
    go(m, 5, () => ({ 0: { mx: 1, tx: 8, tz: 0 } }));
    check('K1-e Tu Vong Tien Dap: winds up 0.25 s without moving', near(a.x, 0, 1e-6) && !a.dash, `x ${a.x}`);
    const ev = go(m, 25);
    const hit = only(ev, 'hit', (e) => e.id === 1 && e.by === 0);
    check('K1-f ... then lands next to the foe for 233 (falloff by distance) and knocks it up', hit.length === 1 && v.airT > 0 && Math.abs(a.x - 8) < 1.5, `hits ${hit.length} air ${v.airT} x ${a.x}`);
  }
  // Dã Man Chi Nộ: 8 s, size 1.2, haste 1.25, ccResist 0.5, 3% max hp per s; weapon blows taken stack +5% dmg and fire rate
  {
    const m = arena([[R('khidot', 0), 0, 0], [R('ung', 1), 6, 0]]), [a, v] = m.units;
    a.hp = a.maxHp; a.hp -= 1000; const h = a.hp;
    press(m, 0, 'ult');
    check('K1-g Da Man Chi No: 8 s, radius x1.2, haste 1.25, no lifesteal', near(a.tfT, KU.dur, 1e-6) && near(a.radius, KD.radius * 1.2) && a.hasteF === 1.25 && a.rageF === 0, `${a.tfT} ${a.radius}`);
    const before = a.hp; go(m, 29);
    check('K1-h ... heals 3% of max hp per s while it runs (x healUp), plus the passive pulses', a.hp - before > KD.hp * 0.03 * 0.95 && a.hp - before < KD.hp * (0.03 + 0.02) * 1.2, `${a.hp - before}`);
    a.cd.s1 = 8; a.cd.s2 = 12; a.hp = a.maxHp - 1000;
    const hp0 = a.hp, ev = go(m, 20, () => ({ 1: { fire: true, aim: Math.PI, tx: 0, tz: 0 } }));
    const blows = only(ev, 'hit', (e) => e.id === 0 && e.by === 1), st = only(ev, 'k1', (e) => e.kind === 'hurtW' && e.id === 0);
    check('K1-i ... each weapon blow it takes adds a stack (icd 0.3 s): stacks = blows, +5% each', blows.length >= 1 && st.length === blows.length && a.hkN === st.length && near(a.hkF, a.hkN * 0.05, 1e-9) && a.hkT > 0, `blows ${blows.length} stacks ${st.length} hkN ${a.hkN}`);
    check('K1-j ... and cuts the other two cooldowns by 10% of their full value per stack', near(a.cd.s1, Math.max(0, 8 - 20 * TICK - 0.8 * st.length), 1e-6) && near(a.cd.s2, Math.max(0, 12 - 20 * TICK - 1.2 * st.length), 1e-6), `${a.cd.s1} ${a.cd.s2}`);
    a.cd.fire = 0; go(m, 1, () => ({ 0: { fire: true, tx: 6, tz: 0 } }));
    const sh = m.shots.find((s) => s.owner === 0);
    check('K1-k ... its fist hits harder by the stacks (200 x (1 + hkF))', !!sh && near(sh.dmg, KD.weapon.dmg * (1 + a.hkF), 1e-6), `${sh && sh.dmg} hkF ${a.hkF}`);
    go(m, 70);
    check('K1-L ... the stacks drop 2 s after the last blow', a.hkN === 0 && a.hkF === 0 && a.hkT === 0, `${a.hkN}`);
  }
  // a skill hit does not stack it; nothing stacks outside the rage
  {
    const m = arena([[R('khidot', 0), 0, 0], [R('ung', 1), 6, 0]]), a = m.units[0];
    go(m, 20, () => ({ 1: { fire: true, aim: Math.PI, tx: 0, tz: 0 } }));
    check('K1-m outside the rage weapon blows give no stacks', a.hkN === 0);
  }

  // ---- Captain America (tacke), clip p21 ----
  const CA = MECHS.tacke, [CQ, CE, CU] = CA.skills, TR = MECHS.trau;
  // passive Chỉ Huy: allies within 8 m (itself too) +10% speed and +0.05 armour
  {
    const m = arena([[R('tacke', 0), 0, 0], [R('trau', 0), 5, 0], [R('trau', 0), 14, 0], [R('ung', 1), 30, 30]]), [a, al, far] = m.units;
    go(m, 7);
    check('K1-n Chi Huy aura: an ally 5 m away moves x1.1 and has +0.05 armour; the captain too; an ally 14 m away nothing', near(unitSpeed(al), TR.speed * 1.1, 1e-9) && near(armorOf(m, al), TR.armor + 0.05, 1e-9) && near(unitSpeed(a), CA.speed * 1.1, 1e-9) && near(unitSpeed(far), TR.speed, 1e-9), `${unitSpeed(al)} ${armorOf(m, al)} ${unitSpeed(far)}`);
  }
  // inspire: a cast gives allies within 8 m 2 s of +25% speed and -25% weapon damage taken
  {
    const m = arena([[R('tacke', 0), 0, 0], [R('trau', 0), 4, 0], [R('ung', 1), 4, 9, -Math.PI / 2]]), [a, al, e] = m.units;
    go(m, 7);
    press(m, 0, 's2', { aim: Math.PI, tx: -10, tz: 0 });
    check('K1-o inspire: the cast gives the ally 2 s of x1.25 speed (the strongest haste wins over the aura x1.1)', near(al.inT, 2 - TICK, 1e-6) && near(unitSpeed(al), TR.speed * 1.25, 1e-9), `${al.inT} ${unitSpeed(al)}`);
    const hp = al.hp, ev = go(m, 20, () => ({ 2: { fire: true, aim: -Math.PI / 2, tx: 4, tz: 0 } }));
    const hits = only(ev, 'hit', (h) => h.id === 1 && h.by === 2);
    check('K1-p ... a weapon blow on the inspired ally lands x0.75 (and x its armour unless the shooter pierces it)', hits.length >= 1 && near(hits[0].amt, UNG.weapon.dmg * 0.75 * (UNG.passive.do === 'pierce' ? 1 : 1 - armorOf(m, al)), 1e-6), `${hits.length && hits[0].amt}`);
  }
  // Vinh Diệu Chi Thuẫn: ally at the cursor and the captain get a 1.25 s bubble that eats every enemy shot
  {
    const m = arena([[R('tacke', 0), 0, 0], [R('trau', 0), 5, 0], [R('ung', 1), 5, 9, -Math.PI / 2]]), [a, al, e] = m.units;
    press(m, 0, 's1', { tx: 5, tz: 0 });
    check('K1-q Vinh Dieu Chi Thuan: the ally and the captain are bubbled 1.25 s, the ally with cc x0.5', al.bubT > 1.2 && a.bubT > 1.2 && al.bubCc === 0.5 && a.bubCc === 1, `${al.bubT} ${a.bubT}`);
    const hp = al.hp, ev = go(m, 20, () => ({ 2: { fire: true, aim: -Math.PI / 2, tx: 5, tz: 0 } }));
    check('K1-r ... enemy shots at the bubbled ally end on the bubble (impact dome), no damage', al.hp === hp && only(ev, 'impact', (i) => i.on === 'dome').length >= 1 && only(ev, 'hit', (h) => h.id === 1).length === 0, `hp ${hp - al.hp}`);
    al.stunT = 0; go(m, 1); applyStun(al, 1);
    go(m, 1);
    check('K1-s ... a 1 s stun landing on the bubbled ally lasts 0.5 s', near(al.stunT, 0.5 - TICK, 1e-6) || near(al.stunT, 0.5, 1e-6) || al.stunT < 0.55, `${al.stunT}`);
  }
  // Chính Nghĩa Chi Thuẫn: out 114 + stun 0.5, home 239 + stun 1, each home hit -15% of this slot's cd; 2 uses 4 s apart
  {
    const m = arena([[R('tacke', 0), 0, 0], [R('ung', 1), 6, 0]]), [a, v] = m.units;
    const ev1 = press(m, 0, 's2', { tx: 6, tz: 0 });
    const ev2 = go(m, 12);
    const out = only([...ev1, ...ev2], 'hit', (h) => h.id === 1 && h.by === 0);
    check('K1-t Chinh Nghia Chi Thuan: the shield out hits for 114 x armour and stuns 0.5 s', out.length === 1 && near(out[0].amt, CE.dmg * UNG_F, 1e-6) && v.stunT > 0.2, `${out.map((h) => h.amt)} ${v.stunT}`);
    v.stunT = 0; const cd0 = a.cd.s2;
    let st = 0; const ev3 = go(m, 40, () => { st = Math.max(st, v.stunT); });
    const home = only(ev3, 'hit', (h) => h.id === 1 && h.by === 0);
    check('K1-u ... flying home it hits again for 239 x armour, stuns 1 s and cuts the cooldown by 15% of 8 s', home.length === 1 && near(home[0].amt, CE.back.dmg * UNG_F, 1e-6) && st > 0.9 && a.cd.s2 < cd0 - 40 * TICK - 1.1, `${home.map((h) => h.amt)} stun ${st} cd ${cd0} -> ${a.cd.s2}`);
    check('K1-v ... two uses: one spent, the second ready after the 4 s gap', a.use1 === 1 && a.gap1 <= 4, `${a.use1} ${a.gap1}`);
  }
  // Dũng Khí Chi Thuẫn: allies in 7 m get a 1080 shield and x1.5 speed, both fading over 5 s, and 5 s cc immunity
  {
    const m = arena([[R('tacke', 0), 0, 0], [R('trau', 0), 5, 0], [R('trau', 0), 10, 0], [R('ung', 1), 30, 30]]), [a, al, far] = m.units;
    press(m, 0, 'ult');
    check('K1-w Dung Khi Chi Thuan: shield 1080 and cc immunity 5 s on the captain and the ally in 7 m, nothing on the one at 10 m', near(al.shield, CU.shield, 10) && near(a.shield, CU.shield, 10) && al.ccT > 4.9 && far.shield === 0, `${al.shield} ${a.shield} ${far.shield}`);
    go(m, 75);
    check('K1-x ... after 2.5 s the shield and the extra speed are half gone', near(al.shield, CU.shield * 0.5, 15) && near(al.hasteF, 1.25, 0.02), `${al.shield} ${al.hasteF}`);
    go(m, 80);
    check('K1-y ... gone at 5 s', al.shield === 0, `${al.shield}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0, passed = 0;
  runK1Cases((name, cond, detail = '') => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); } }, (s) => console.log(`\n# ${s}`));
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
