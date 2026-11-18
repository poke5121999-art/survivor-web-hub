// Kit lane K10 (feat/dtt-k10): the kit of Bọ Cạp (bocap, clip p52) ported from
// the owner's clips, and their G5 mechanics (sim.js block "kit lane K10"). Section K10 of tools/sim-test.mjs; runs alone too:
// `node tools/k10-cases.mjs`. Expected values follow the data rows, so a balance pass keeps the arithmetic.
// The kit she had before (ambush pellets, stealth, spin) is a fixture now: OLD_* with oldK10(m) keep the generic primitives of the older sections covered.
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
const OLD = { bocap: OLD_BOCAP };
// Every bocap of the match plays its old kit (the match must be fresh: nothing pressed yet).
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
  section('K10 kit lane K10: Bọ Cạp ported from the owner\'s clip (p52) and their G5 mechanics (literal expected values)');

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
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0, passed = 0;
  runK10Cases((name, cond, detail = '') => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); } }, (s) => console.log(`\n# ${s}`));
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
