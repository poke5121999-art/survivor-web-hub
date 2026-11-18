// Kit lane K10 (feat/dtt-k10): the kits of Bọ Cạp (bocap, clip p52) and Apocalypse (bohung, p55) ported from
// the owner's clips, and their G5 mechanics (sim.js block "kit lane K10"). Section K10 of tools/sim-test.mjs; runs alone too:
// `node tools/k10-cases.mjs`. Expected values follow the data rows, so a balance pass keeps the arithmetic.
// The kits these tanks had before (ambush pellets, stealth, spin; meter shot, shield burst, transform) are fixtures now: OLD_* with oldK10(m) keep the generic primitives of the older sections covered.
import { createMatch, step, weaponOf, unitSpeed, LOC_KINDS } from '../js/sim.js';
import { MECHS, TICK } from '../js/data.js';

export const OLD_BOCAP = {
  passive: { do: 'ambush', name: 'Phục Kích', mul: 1.5, linger: 1 },
  weapon: { name: 'Súng Chùm', cd: 0.72, dmg: 64, n: 5, fan: 0.09, speed: 30, range: 9, r: 0.18, vis: 'pellet' },
  skills: [
    { id: 'vomoi', cd: 8, do: 'dash', dist: 9, speed: 32, dmg: 170, stun: 0.4, knock: 1 },
    { id: 'nguytrang', cd: 14, do: 'buff', stealth: 4, haste: 1.3, dur: 4 },
    { id: 'locthep', cd: 40, do: 'nova', windup: 0.25, repeat: 4, gap: 0.3, move: 1, radius: 3.6, dmg: 230 },
  ],
};
export const OLD_BOHUNG = {
  passive: { do: 'meter', name: 'Tích Lực', max: 3, gain: { cast: 1 }, spend: { kind: 'shot', mul: 2.0, stun: 0.4 } },
  weapon: { name: 'Pháo Lõi', cd: 0.7, dmg: 150, speed: 28, range: 11, splash: 1.2, r: 0.28, vis: 'slug' },
  skills: [
    { id: 'luonghuydiet', cd: 9, do: 'beam', windup: 0.35, range: 16, width: 0.8, dmg: 400 },
    { id: 'lachanno', cd: 13, do: 'shield', amount: 650, dur: 4, burst: { radius: 4.5, dmg: 300, knock: 2 } },
    { id: 'thangoa', cd: 42, do: 'transform', dur: 7, size: 1.2, armor: 0.2, dmg: 1.25 },
  ],
};
const OLD = { bocap: OLD_BOCAP, bohung: OLD_BOHUNG };
// Every bocap / bohung of the match plays its old kit (the match must be fresh: nothing pressed yet).
export function oldK10(m) {
  for (const u of m.units) {
    const K = OLD[u.mech];
    if (!K) continue;
    u.def = { ...u.def, passive: K.passive, weapon: K.weapon, skills: K.skills, tfWeapon: {} };
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
const wall = (x0, x1, z0, z1) => ({ x0, x1, z0, z1, h: 2, kind: 'wall' });
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

export function runK10Cases(check, section) {
  section('K10 kit lane K10: Bọ Cạp, Apocalypse ported from the owner\'s clips (p52, p55) and their G5 mechanics (literal expected values)');

  // ---- Bọ Cạp (bocap), clip p52 ----
  const BC = MECHS.bocap, [BQ, BE, BU] = BC.skills, POI = BC.weapon.fx.burn;
  // Độc Châm: one 150 sting that lays one stack of poison (8 dps a stack, 5 s, at most 10)
  {
    const m = arena([[R('bocap', 0), 0, 0], [R('ung', 1), 5, 0]]), [a, v] = m.units;
    const ev = go(m, 10, (i) => ({ 0: { fire: i === 0, tx: 5, tz: 0 } }));
    const b = blows(ev, 1, 0);
    check('K10-a Doc Cham: one sting of 150 x armour and one poison stack lit by her (8 dps, 5 s)', b.length === 1 && near(b[0].amt, 150 * UNG_F, 1e-6) && v.burnN === 1 && v.burnBy === 0 && v.burnDps === POI.dps && v.burnT > 4.6, `${b.map((e) => e.amt)} burn ${v.burnN} ${v.burnT}`);
  }
  // passive Tử Vong Thôn Phệ: the poison she lit heals her half of what it takes
  {
    const m = arena([[R('bocap', 0), 0, 0], [R('ung', 1), 20, 0]]), [a, v] = m.units;
    a.hp = a.maxHp - 600; v.burnN = 5; v.burnT = 3; v.burnDps = POI.dps; v.burnBy = 0;
    const h = a.hp, hv = v.hp;
    go(m, 30);
    check('K10-b Tu Vong Thon Phe: 1 s of 5 stacks takes 5 x 8 x armour, she heals half of it', near(hv - v.hp, 5 * POI.dps * UNG_F, 1e-6) && near(a.hp - h, 0.5 * (hv - v.hp), 1e-6), `foe ${hv - v.hp} heal ${a.hp - h}`);
    v.burnBy = -1; v.burnT = 3; const h2 = a.hp; go(m, 15);
    check('K10-c ... poison lit by nobody of hers heals her nothing', a.hp === h2, `${a.hp - h2}`);
  }
  // Tử Vong Thôn Phệ (Q): five puffs into a 5.5 m cone, 0.3 s apart, each 87 with falloff and one poison stack; behind her nothing
  {
    const m = arena([[R('bocap', 0), 0, 0], [R('ung', 1), 3, 0], [R('ung', 1), -3, 0]]), [a, v, back] = m.units;
    const ev = go(m, 3 + Math.round(4 * BQ.gap / TICK) + 3, (i) => ({ 0: { s1: i === 0 } }));
    const b = blows(ev, 1, 0);
    check('K10-d Tu Vong Thon Phe: five puffs of 87 x falloff (3 m of 5.5) on the foe in front, five poison stacks', b.length === 5 && b.every((e) => near(e.amt, 87 * (1 - 0.5 * 3 / 5.5) * UNG_F, 1e-6)) && v.burnN === 5, `${b.length} ${b.map((e) => e.amt.toFixed(1))} burn ${v.burnN}`);
    check('K10-e ... the foe behind her is outside the cone', blows(ev, 2, 0, 1).length === 0 && back.burnN === 0);
  }
  // Trí Mạng Ô Nhiễm (E): 3 s of piercing stings 25% faster and further, fire rate x3, speed x1.5, 25% on buildings
  {
    const m = arena([[R('bocap', 0), 0, 0], [R('ung', 1), 20, 0]]), a = m.units[0];
    press(m, 0, 's2');
    const w = weaponOf(a);
    check('K10-f Tri Mang O Nhiem: 3 s, the sting pierces, flies 37.5 m/s for 11.25 m, fire rate x3, speed x1.5', near(a.tfT, 3, 1e-6) && w.pierce === true && w.range === 11.25 && w.speed === 37.5 && a.rapidF === 3 && near(unitSpeed(a), BC.speed * 1.5, 1e-9), `${a.tfT} ${JSON.stringify(w)} ${a.rapidF}`);
    check('K10-g ... its row carries towerMul 0.25 for the tower hits while it runs', BE.towerMul === 0.25);
  }
  // Độc Tố Bạo Phát (R): 356 in 7 m, weaken x0.75 3 s, a fresh stack; her poison already there goes off: 150 x (1 + 0.5 per 3 stacks)
  {
    const m = arena([[R('bocap', 0), 0, 0], [R('ung', 1), 2, 0]]), [a, v] = m.units;
    v.burnN = 6; v.burnT = 4; v.burnDps = POI.dps; v.burnBy = 0;
    const ev = press(m, 0, 'ult').concat(go(m, 1));
    const b = blows(ev, 1, 0, 100), pop = only(ev, 'k10', (e) => e.kind === 'pop' && e.id === 1);
    check('K10-h Doc To Bao Phat: 356 x falloff (2 m of 7), then the 6 stacks go off for 150 x 2 = 300, both x armour', b.length === 2 && near(b[0].amt, 356 * (1 - 0.5 * 2 / 7) * UNG_F, 1e-6) && near(b[1].amt, 300 * UNG_F, 1e-6) && pop.length === 1 && pop[0].n === 6, `${b.map((e) => e.amt)}`);
    check('K10-i ... the stacks are spent, one fresh stack lands, the foe deals x0.75 for 3 s, no paralysis under 10 stacks', v.burnN === 1 && v.weakenF === 0.75 && v.weakenT > 2.9 && v.locT === 0 && v.rootT === 0, `burn ${v.burnN} weak ${v.weakenF} loc ${v.locT}`);
    check('K10-j ... two uses: one spent, the second after the 5 s gap', a.use2 === 1 && a.gap2 > 4.9 && a.gap2 <= 5, `${a.use2} ${a.gap2}`);
  }
  {
    const m = arena([[R('bocap', 0), 0, 0], [R('ung', 1), 2, 0]]), [a, v] = m.units;
    v.burnN = 10; v.burnT = 4; v.burnDps = POI.dps; v.burnBy = 0;
    const ev = press(m, 0, 'ult').concat(go(m, 1));
    const b = blows(ev, 1, 0, 100);
    check('K10-k ... at 10 stacks the blast is 150 x (1 + 0.5 x 3) = 375, and the foe is disarmed and rooted 2 s', b.length === 2 && near(b[1].amt, 375 * UNG_F, 1e-6) && LOC_KINDS[v.locK] === 'disarm' && v.locT > 1.9 && v.rootT > 1.9 && unitSpeed(v) === 0, `${b.map((e) => e.amt)} ${LOC_KINDS[v.locK]} ${v.locT} ${v.rootT}`);
  }
  {
    const m = arena([[R('bocap', 0), 0, 0], [R('ung', 1), 2, 0], [R('bocap', 1), 20, 0]]), [a, v] = m.units;
    v.burnN = 9; v.burnT = 4; v.burnDps = POI.dps; v.burnBy = 2;
    const ev = press(m, 0, 'ult').concat(go(m, 1));
    check('K10-L ... poison another mech lit does not go off', only(ev, 'k10', (e) => e.kind === 'pop').length === 0 && blows(ev, 1, 0, 100).length === 1 && v.burnBy === 0 && v.burnN === 10, `${v.burnN}`);
  }

  // ---- Apocalypse (bohung), clip p55 ----
  const BH = MECHS.bohung, [HQ, HE, HU] = BH.skills, BHF = 1 - BH.armor;
  // passive Tốc Xạ: after a cast the next two shots are a two-shell burst and fire 50% faster for 3 s
  {
    const m = arena([[R('bohung', 0), 0, 0], [R('ung', 1), 20, 0]]), a = m.units[0];
    press(m, 0, 's2', { tx: 20, tz: 0 });
    check('K10-m Toc Xa: a cast arms two burst shots and fire rate x1.5 for 3 s', a.shotN === 2 && a.rapidF === 1.5 && a.rapidT > 2.9, `${a.shotN} ${a.rapidF}`);
    go(m, 6); a.cd.fire = 0;
    go(m, 1, () => ({ 0: { fire: true, tx: 20, tz: 0 } }));
    check('K10-n ... the next pull fires two 225 shells, one burst shot left', m.shots.filter((s) => s.owner === 0 && s.src === 'w').length === 2 && m.shots.every((s) => s.owner !== 0 || near(s.dmg, 225, 1e-9)) && a.shotN === 1, `${m.shots.length} ${a.shotN}`);
  }
  // ... and while no burst waits, one comes by itself every 3 s
  {
    const m = arena([[R('bohung', 0), 0, 0], [R('ung', 1), 20, 0]]), a = m.units[0];
    go(m, Math.round(3 / TICK) - 2);
    const early = a.shotN;
    go(m, 3);
    check('K10-o ... a free burst shot is armed every 3 s while none waits (none before)', early === 0 && a.shotN === 1, `${early} ${a.shotN}`);
    go(m, 120);
    check('K10-p ... it waits unfired (still one, never more)', a.shotN === 1, `${a.shotN}`);
  }
  // passive save: a hit that drops her under 50% cleanses, heals 10% of max hp at once and 4% a second for 5 s; once per 15 s
  {
    const m = arena([[R('bohung', 0), 0, 0], [R('ung', 1), 6, 0]]), [a, v] = m.units;
    a.hp = a.maxHp * 0.52; a.stunT = 1; a.slowT = 2; a.slowF = 0.3;
    go(m, 12, (i) => ({ 1: { fire: i === 0, aim: Math.PI, tx: 0, tz: 0 } }));
    check('K10-q save: under 50% she is cleansed (stun, slow gone), the 15 s lockout runs, the heal over time is 4% of max hp a second for 5 s', a.svT > 14 && a.stunT === 0 && a.slowT === 0 && a.healT > 4.5 && near(a.healRate, 0.04 * a.maxHp, 1e-9), `sv ${a.svT} stun ${a.stunT} healT ${a.healT} rate ${a.healRate}`);
  }
  // Đạn Vô Hư Phát (Q): five shells of 240, slow 50% 2 s; one foe takes at most 375 (240 + 240 x 0.5625); the cast knocks back the cone in front
  {
    const m = arena([[R('bohung', 0), 0, 0], [R('ung', 1), 3.2, 0]]), [a, v] = m.units;
    const ev = go(m, 15, (i) => ({ 0: { s1: i === 0, tx: 3.2, tz: 0 } }));
    const b = blows(ev, 1, 0);
    check('K10-r Dan Vo Hu Phat: two shells land on the close foe for 240 then 135 (375 in all) x armour, slowed 50%', b.length === 2 && near(b[0].amt, 240 * UNG_F, 1e-6) && near(b[1].amt, 135 * UNG_F, 1e-6) && v.slowF === 0.5 && v.slowT > 1.4, `${b.map((e) => e.amt)} ${v.slowF}`);
    check('K10-s ... and the knock cone (nova 4 m) pushes it back', only(ev, 'nova', (e) => e.id === 0 && e.r === 4).length === 1 && v.x > 3.6, `x ${v.x}`);
  }
  // Chấn Đãng Oanh Kích (E): 225 in a 6 x 3 m strip in front, speed x1.5 for 2 s
  {
    const m = arena([[R('bohung', 0), 0, 0], [R('ung', 1), 4, 1], [R('ung', 1), 9, 0]]), [a, v, far] = m.units;
    const ev = go(m, 10, (i) => ({ 0: { s2: i === 0, tx: 6, tz: 0 } }));
    check('K10-t Chan Dang Oanh Kich: 225 x armour on the foe 1 m off the axis at 4 m, nothing at 9 m; speed x1.5', blows(ev, 1, 0).length === 1 && near(blows(ev, 1, 0)[0].amt, 225 * UNG_F, 1e-6) && far.hp === UNG.hp && a.hasteF === 1.5 && a.hasteT > 1.5, `${blows(ev, 1, 0).map((e) => e.amt)} ${far.hp}`);
  }
  // Phi Đạn Bạo Phá (R): over a wall, explodes on the first foe: 305 x (1 + 0.0775 per m flown, at most x2.55) in 2.5 m, stun 0.5
  {
    const m = arena([[R('bohung', 0), 0, 0], [R('ung', 1), 25, 0], [R('ung', 1), 26, 1.5]]), [a, v, w2] = m.units;
    m.map.walls.push(wall(8, 9, -4, 4));
    let st = 0;
    const ev = go(m, 45, (i) => { st = Math.max(st, v.stunT); return { 0: { ult: i === 0, tx: 25, tz: 0 } }; });
    const b = blows(ev, 1, 0), b2 = blows(ev, 2, 0);
    check('K10-u Phi Dan Bao Pha: flies over the wall, hits the foe 25 m away for 305 x 2.55 (cap) x armour, stuns 0.5 s', b.length === 1 && near(b[0].amt, 305 * 2.55 * UNG_F, 1e-6) && st > 0.4 && only(ev, 'impact', (e) => e.on === 'wall').length === 0, `${b.map((e) => e.amt)} stun ${st}`);
    check('K10-v ... the 2.5 m blast round it catches the foe beside it too', b2.length === 1, `${b2.map((e) => e.amt)}`);
  }
  {
    const m = arena([[R('bohung', 0), 0, 0], [R('ung', 1), 6, 0]]), [a, v] = m.units;
    const ev = go(m, 15, (i) => ({ 0: { ult: i === 0, tx: 6, tz: 0 } }));
    const b = blows(ev, 1, 0), lo = 305 * (1 + 0.0775 * 3.5) * UNG_F, hi = 305 * (1 + 0.0775 * 5.5) * UNG_F;
    check('K10-w ... close by it hits for far less (about 4-5 m flown: x1.3-1.4)', b.length === 1 && b[0].amt > lo && b[0].amt < hi, `${b.map((e) => e.amt)} want ${lo}-${hi}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0, passed = 0;
  runK10Cases((name, cond, detail = '') => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); } }, (s) => console.log(`\n# ${s}`));
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
