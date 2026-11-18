// Kit lane K13 (domdom, duongtien, mucma) ported from the owner's clips: sim-test.mjs runs these (section K13). Standalone (fast):
//   node tools/k13-cases.mjs
// Also the old kits of the three tanks as fixtures (OLD_DOMDOM, ...), so the primitives they exercised stay covered: Đom Đóm's
// heal ray, overheal, drone and rally (and the medic bot) now only live in OLD_DOMDOM.
import { createMatch, step, skillReady } from '../js/sim.js';
import { MECHS, TICK } from '../js/data.js';

// The batch-0 Đom Đóm (Quân y): the heal ray, overheal, the healing drone, the haste blessing and the healing rally.
export const OLD_DOMDOM = {
  role: 'Quân y', roleKey: 'medic',
  passive: { do: 'overheal', name: 'Tràn Máu', cap: 300, dur: 3 },
  weapon: { name: 'Tia Nối', cd: 0.25, ray: true, range: 11, width: 0.7, dmg: 80, heal: 90, vis: 'link' },
  skills: [
    { id: 'ongtho', cd: 16, do: 'drone', dur: 12, range: 7, hps: 120 },
    { id: 'tiepsuc', cd: 11, do: 'bless', cast: 12, pick: 3.5, haste: 1.3, rapid: 1.25, dur: 4 },
    { id: 'vongsang', cd: 44, do: 'rally', radius: 8, heal: 1100, haste: 1.25, dur: 3 },
  ],
};
const OLD = { domdom: OLD_DOMDOM };
// Swap the old kit onto every unit of that mech (before the first step).
export function oldK13(m, mech) {
  const K = OLD[mech];
  for (const u of m.units) if (u.mech === mech) { u.def = { ...u.def, ...K }; u.passive = K.passive.do; }
  return m;
}

const IN = { mx: 0, mz: 0, aim: 0, tx: 0, tz: 0, fire: false, s1: false, s2: false, ult: false, heal: false };
const R = (mech, team = 0) => ({ team, mech, name: mech + team });
function arena(units) {
  const m = createMatch({ seed: 7, roster: units.map((u) => u[0]) });
  m.map.walls.length = 0; m.map.rounds.length = 0; m.map.bushes.length = 0; m.map.hazards.length = 0;
  for (const p of m.props) p.alive = false;
  units.forEach(([, x, z, aim], i) => { const u = m.units[i]; u.x = u.px = x; u.z = u.pz = z; u.aim = u.heading = aim ?? (u.team ? Math.PI : 0); u.combatT = 0; });
  m.crateT = 1e9;
  return m;
}
function go(m, ticks, f) {
  const ev = [];
  for (let i = 0; i < ticks; i++) {
    const o = (f && f(i)) || {};
    step(m, m.units.map((u, k) => ({ ...IN, aim: u.aim, tx: u.x, tz: u.z, ...o[k] })));
    for (const e of m.events) ev.push(e);
  }
  return ev;
}
const only = (ev, t, f = () => true) => ev.filter((e) => e.t === t && f(e));
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const k13 = (ev, kind) => only(ev, 'k13', (e) => e.kind === kind);

export function runK13Cases(check, section) {
  section('K13 kit lane K13: Đom Đóm (p91 绮翠之心) ported from the owner clips (literal expected values)');
  const DD = MECHS.domdom, UNG = MECHS.ung, TRAU = MECHS.trau;
  // ---- Đom Đóm ----
  {
    // the wind dart: 150 a shot, no heal on an ally any more
    const m = arena([[R('domdom', 0), 0, 0], [R('ung', 1), 6, 0]]), v = m.units[1];
    go(m, 20, (i) => ({ 0: { fire: i === 0 } }));
    check('k13a Phong Tiễn: one dart = 150 (ung has no armour), not a ray', v.hp === UNG.hp - 150 && !DD.weapon.ray && DD.roleKey === 'control', `${v.hp}`);
  }
  {
    // Ai Nga La Tư Chi Nhãn: 150 at the cursor after 0.5 s, one Phong Thực stack, then 3 ticks of 5% lost hp + slow 75% 0.25 s
    const m = arena([[R('domdom', 0), 0, 0], [R('ung', 1), 6, 0]]), [a, v] = m.units;
    const ev = go(m, 17, (i) => ({ 0: { s1: i === 0, tx: 6, tz: 0 } }));
    const h = only(ev, 'hit', (e) => e.id === 1);
    check('k13b the eye lands after 0.5 s: 150 (centre, no falloff); cooldown 10', h.length === 1 && near(h[0].amt, 150) && near(a.cd.s1, 10 - 16 * TICK, 1e-6), `${h.map((e) => e.amt)} ${a.cd.s1}`);
    check('k13c ... one Phong Thực stack: slow 10%, weaken 0.9, heals x0.9 for 2 s', v.ddEN === 1 && near(v.slowF, 0.1) && near(v.weakenF, 0.9) && near(v.ahF, 0.9) && v.ahT > 1.9, `${v.ddEN} ${v.slowF} ${v.weakenF} ${v.ahF}`);
    const lost = UNG.hp - v.hp, ev2 = go(m, 46), ticks = k13(ev2, 'eye');
    check('k13d 1.5 s later the first eye tick: 5% of the lost hp (7.5) as true damage, slowed 75%', ticks.length === 1 && near(UNG.hp - v.hp, lost + 0.05 * lost, 1e-6) && near(v.slowF, 0.75), `${ticks.length} ${UNG.hp - v.hp} ${v.slowF}`);
    const ev3 = go(m, 100);
    check('k13e ... three ticks in all over 4.5 s, then none', k13(ev3, 'eye').length === 2 && v.ddYN === 0, `${k13(ev3, 'eye').length}`);
  }
  {
    // Phong Chi Đầu Thương: 150 + 5% lost hp true, no heals and no new shields 1.5 s, slow 25%; two uses 3 s apart
    const m = arena([[R('domdom', 0), 0, 0], [R('ung', 1), 6, 0], [R('ung', 1), 6, 1.5]]), [a, v, side] = m.units;
    const ev = go(m, 12, (i) => ({ 0: { s2: i === 0, aim: 0 } }));
    const h = only(ev, 'hit', (e) => e.id === 1);
    check('k13f the spear hits the first foe: 150 + 5% of the 150 lost (7.5 true)', near(UNG.hp - v.hp, 157.5, 1e-6) && h.length === 2, `${UNG.hp - v.hp} ${h.map((e) => e.amt)}`);
    check('k13g ... antiheal x0 (shields too) and slow 25% for 1.5 s; the foe beside it takes the splash', v.ahF === 0 && v.ahT > 1.2 && v.ahSh !== undefined && near(v.slowF, 0.25) && side.hp < UNG.hp, `${v.ahF} ${v.slowF} ${side.hp}`);
    check('k13h one of two uses spent, the second waits for the 3 s gap', a.use1 === 1 && !skillReady(a, 1), `${a.use1} ${a.gap1}`);
    go(m, 80);
    check('k13i ... and is ready after it', skillReady(a, 1));
  }
  {
    // Phong Thực stacks: the eye (1), the spear (2), the first temple pulse (3) inside 2 s of each other
    const m = arena([[R('domdom', 0), 0, 0], [R('ung', 1), 4, 0]]), v = m.units[1];
    go(m, 1, () => ({ 0: { s1: true, tx: 4, tz: 0 } })); go(m, 17);
    check('k13j the eye: one stack', v.ddEN === 1, `${v.ddEN}`);
    go(m, 1, () => ({ 0: { s2: true, aim: 0 } })); go(m, 6);
    check('k13k the spear: two stacks, slow 20%, weaken 0.8', v.ddEN === 2 && near(v.weakenF, 0.8) && near(v.ahF, 0), `${v.ddEN} ${v.weakenF}`);
    go(m, 1, () => ({ 0: { ult: true } })); go(m, 30);
    check('k13k2 the first temple pulse: three stacks (the cap), weaken 0.7, slow 30% or more', v.ddEN === 3 && near(v.weakenF, 0.7) && v.slowF >= 0.3 - 1e-9, `${v.ddEN} ${v.weakenF} ${v.slowF}`);
    go(m, 1, () => ({ 0: { s2: true, aim: 0 } })); go(m, 6);
    check('k13k3 ... a fourth skill hit keeps it at 3', v.ddEN === 3, `${v.ddEN}`);
  }
  {
    // Phong Vãn Chi Ca: a press wraps her and the allies within 6 m in the bullet-eating bubble for 0.5 s; her haste fades
    const m = arena([[R('domdom', 0), 0, 0], [R('trau', 0), 0, 4], [R('trau', 0), 0, -9], [R('ung', 1), 0, 12, -Math.PI / 2]]), [a, near1, far1, f] = m.units;
    go(m, 1, () => ({ 0: { s2: true, aim: 0 } }));
    check('k13l the press: bubble 0.5 s on her and the ally at 4 m, not the one at 9 m; haste x1.5', near(a.bubT, 0.5, 1e-9) && near(near1.bubT, 0.5 - TICK, 1e-9) && !(far1.bubT > 0) && near(a.hasteF, 1.5), `${a.bubT} ${near1.bubT} ${far1.bubT} ${a.hasteF}`);
    go(m, 30);
    check('k13m ... 1 s later the haste has faded to about x1.25', a.hasteF > 1.23 && a.hasteF < 1.27, `${a.hasteF}`);
    // a shot at the wrapped ally is eaten
    const w = arena([[R('domdom', 0), 0, 0], [R('trau', 0), 0, 3], [R('ung', 1), 0, 9, -Math.PI / 2]]), [b, al] = w.units;
    go(w, 1, () => ({ 0: { s2: true, aim: Math.PI } }));
    go(w, 12, (i) => ({ 2: { fire: i === 0, aim: -Math.PI / 2 } }));
    check('k13n a shot reaching the wrapped ally inside 0.5 s does no damage', al.hp === TRAU.hp && b.alive, `${al.hp}`);
  }
  {
    // Phong Nha Thần Điện: silence 1 s at the press; pulses at 1, 2.5 and 4 s; the cooldown waits until the temple is gone
    const m = arena([[R('domdom', 0), 0, 0], [R('trau', 0), -3, 0], [R('ung', 1), 4, 0]]), [a, al, v] = m.units;
    al.hp = 1000; al.slowT = 3; al.slowF = 0.5;
    go(m, 2, (i) => ({ 0: { ult: i === 0 } }));
    check('k13o the press silences the foe within 6 m for 1 s; cooldown held at 55', v.silenceT > 0.9 && a.cd.ult === 55, `${v.silenceT} ${a.cd.ult}`);
    const ev = go(m, 29), p1 = k13(ev, 'temple');
    check('k13p first pulse at 1 s: the ally cleansed, wrapped and healed 2 x 5% of her max hp (170)', p1.length === 1 && al.slowT === 0 && al.bubT > 0 && near(al.hp, 1000 + 0.1 * DD.hp, 1e-6), `${p1.length} ${al.slowT} ${al.hp}`);
    check('k13q ... the foe is pulled 1.5 m toward her, takes 2 x 5% of its lost hp (0 at full hp), fire x0.8 and a 20% stacking slow', near(v.x, 2.5, 0.05) && near(v.sfF, 0.8) && near(v.slowG, 0.2) && v.hp === UNG.hp, `${v.x} ${v.sfF} ${v.slowG} ${v.hp}`);
    v.hp = 1000;
    const ev2 = go(m, 45);
    check('k13r second pulse at 2.5 s: 5% of 700 lost = 35 true, fire x0.6, slow 40%', k13(ev2, 'temple').length === 1 && near(v.hp, 965, 1e-6) && near(v.sfF, 0.6) && near(v.slowG, 0.4), `${v.hp} ${v.sfF} ${v.slowG}`);
    const ev3 = go(m, 45);
    check('k13s third pulse at 4 s: fire x0.5 (capped), slow 50%; no fourth', k13(ev3, 'temple').length === 1 && near(v.sfF, 0.5) && near(v.slowG, 0.5) && a.ddTpN === 0, `${v.sfF} ${v.slowG}`);
    go(m, 31);
    check('k13t the cooldown starts when the temple is gone: under 55 one second after the last pulse', a.cd.ult < 55 && a.cd.ult > 53.5, `${a.cd.ult}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('k13-cases.mjs')) {
  let failed = 0, passed = 0;
  runK13Cases((name, ok, detail = '') => { if (ok) passed++; else failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + detail}`); }, (s) => console.log(`\n# ${s}`));
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
