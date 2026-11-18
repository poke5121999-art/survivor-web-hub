// Kit lane k15 (hades, hoalong, kiemthan) ported from the owner's clips: sim-test.mjs section k15 runs these. Standalone (fast):
//   node tools/k15-cases.mjs
// Also the old kits of the three tanks as fixtures (OLD_HADES, ...), so the primitives they exercised stay covered.
import { createMatch, step } from '../js/sim.js';
import { MECHS, TICK } from '../js/data.js';
import { allInputs } from '../js/bots.js';

// The batch-1 Hades kit (souls passive, Ám Lưu, Bàn Tay Âm Giới root, Cửa Âm Phủ pull field): hades plays the p72 kit now.
export const OLD_HADES = {
  passive: { do: 'souls', mark: { amp: 0.1, dur: 4 }, zone: { radius: 3, dur: 3, dps: 180 } },
  weapon: { name: 'Hồn Hỏa', cd: 0.4, dmg: 115, speed: 28, range: 13, r: 0.24, vis: 'frost' },
  skills: [
    { id: 'amluu', cd: 7, do: 'volley', n: 1, dmg: 260, speed: 28, range: 14, r: 0.35, slow: 0.35, slowDur: 1.6, vis: 'frost' },
    { id: 'bantay', cd: 12, do: 'barrage', n: 1, radius: 0, blast: 3, dmg: 200, delay: 0.6, span: 0, cast: 13, fx: { root: 1.4 } },
    { id: 'cuaamphu', cd: 44, do: 'zone', at: 'target', cast: 14, radius: 6, dur: 4, pull: 6, dps: 220, vis: 'magnet' },
  ],
};
const OLD = { hades: OLD_HADES };
// Swap the old kit onto every unit of that mech (before the first step); the old hp comes with it.
export function oldKit(m, mech) {
  const K = OLD[mech];
  for (const u of m.units) if (u.mech === mech) { u.def = { ...u.def, ...K }; u.passive = K.passive.do; if (K.hp) u.hp = u.maxHp = K.hp; }
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
// bots cast every slot of these mechs within 2 x 90 s
function botsCast(check, label, mechs, foes) {
  const seen = Object.fromEntries(mechs.map((k) => [k, new Set()]));
  for (let k = 0; k < 2; k++) {
    const roster = [...mechs.map((mech) => ({ team: 0, mech, name: mech, bot: true, diff: 'hard' })), ...foes.map((mech, i) => ({ team: 1, mech, name: 'F' + i, bot: true, diff: 'hard' }))];
    const m = createMatch({ seed: 151 + k, mode: 'tdm', roster });
    for (let i = 0; i < 2700 && !m.over; i++) { step(m, allInputs(m)); for (const e of m.events) if (e.t === 'skill' && seen[m.units[e.id].mech]) seen[m.units[e.id].mech].add(e.slot); }
  }
  check(label, mechs.every((k) => seen[k].size === 3), mechs.map((k) => `${k} ${[...seen[k]]}`).join(' '));
}

export function runK15Cases(check, section) {
  section('k15 kit lane k15: Hades (p72 冥王) ported from the owner\'s clip (literal expected values)');
  const HD = MECHS.hades, UNG = MECHS.ung, UF = 1 - UNG.armor;
  {
    // Chế Tài: a Hồn Hỏa hit weakens the target 30% for 3 s and cuts Hình Thái Chuyển Hoán by 15% of 8 s
    const m = arena([[R('hades', 0), 0, 0], [R('ung', 1), 6, 0]]), [a, v] = m.units;
    a.cd.s1 = 8;
    const ev = go(m, 12, (i) => ({ 0: { fire: i === 0 } }));
    const hit = only(ev, 'hit', (e) => e.id === 1);
    check('k15a Ho Hoa: 115 x armor, weaken 0.7 for 3 s, form cooldown 8 - 12 ticks - 1.2', hit.length === 1 && near(hit[0].amt, 115 * UF) && v.weakenF === 0.7 && v.weakenT > 2.5 && near(a.cd.s1, 8 - 12 * TICK - 1.2, 1e-6), `${hit.map((e) => e.amt)} ${v.weakenF} cd ${a.cd.s1}`);
  }
  {
    // Hình Thái Chuyển Hoán: Thu Cát after 0.15 s; 3 s of haste x2 fading, guard 0.5, cc cut to half; the scythe and its steal
    const m = arena([[R('hades', 0), 0, 0], [R('ung', 1), 20, 0]]), a = m.units[0];
    go(m, 1, () => ({ 0: { s1: true } }));
    check('k15b the press: haste 2, guard 0.5 for 3 s, still Che Tai during the 0.15 s set-up', near(a.hasteF, 2, 0.01) && a.guardF === 0.5 && a.guardT > 2.9 && a.form === 0, `${a.hasteF} ${a.guardF} ${a.form}`);
    go(m, 6);
    check('k15c ... Thu Cat: the scythe (range 4.5, steal 0.3), the self buff patched off this form', a.form === 1 && a.def.weapon.name === 'Lưỡi Hái' && a.def.weapon.range === 4.5 && a.def.weapon.steal === 0.3 && a.def.skills[0].self === null, `${a.form} ${a.def.weapon.name}`);
    go(m, 38);
    check('k15d the haste fades: x1.5 at 1.5 s', near(a.hasteF, 1.5, 0.02), `${a.hasteF}`);
    a.stunT = 2; go(m, 1);
    check('k15e a 2 s stun landing inside the 3 s lasts half (1 s, less the tick)', near(a.stunT, 1 - TICK, 1e-6), `${a.stunT}`);
    go(m, 60);
    a.stunT = 2; go(m, 1);
    check('k15f ... and in full once the 3 s are over', near(a.stunT, 2 - TICK, 1e-6), `${a.stunT}`);
  }
  {
    // Minh Vương Lợi Nhận Chế Tài: fan 6 m, 152 (falloff), slow 50% fading, the hdMark tag: the Thu Cát scythe does x1.5 on it
    const m = arena([[R('hades', 0), 0, 0], [R('ung', 1), 3, 0], [R('ung', 1), 0, 3]]), [a, v, side] = m.units;
    go(m, 1, () => ({ 0: { s2: true, aim: 0 } })); go(m, 8);
    check('k15g Loi Nhan fan: 152 x 0.75 (3 m of 6) x armor on the foe in front, none on the one at 90 deg, slowed 50%', near(UNG.hp - v.hp, 152 * 0.75 * UF, 1e-6) && side.hp === UNG.hp && near(v.slowG, 0.5, 0.03), `${UNG.hp - v.hp} side ${side.hp} slowG ${v.slowG}`);
    check('k15h ... cooldown 8, the target carries hdMark@0', near(a.cd.s2, 8 - 8 * TICK, 1e-6) && v.tags['hdMark@0'] > 4.5, `${a.cd.s2} ${JSON.stringify(v.tags)}`);
    a.cd.s1 = 0; go(m, 1, () => ({ 0: { s1: true } })); go(m, 6);
    check('k15i per-form cooldown: Thu Cat has its own Loi Nhan, ready', a.form === 1 && a.cd.s2 === 0 && a.hdCd2 > 7, `${a.cd.s2} ${a.hdCd2}`);
    const ev = go(m, 10, (i) => ({ 0: { fire: i === 0, aim: 0 } })), hits = only(ev, 'hit', (e) => e.id === 1);
    check('k15j the scythe on the marked foe: 115 x 1.5 x armor, the caster heals 30% of it', hits.length === 1 && near(hits[0].amt, 115 * 1.5 * UF, 1e-6), `${hits.map((e) => e.amt)}`);
    const ev2 = go(m, 1, () => ({ 0: { s2: true } })), ev3 = go(m, 6);
    check('k15k Thu Cat Loi Nhan: a ring, both foes hit, then rapid x2.5 for 5 s', only([...ev2, ...ev3], 'hit', (e) => e.id === 2).length === 1 && a.rapidF === 2.5 && a.rapidT > 4.5, `${a.rapidF} ${a.rapidT}`);
    a.cd.s1 = 0; go(m, 1, () => ({ 0: { s1: true } })); go(m, 6);
    check('k15l back in Che Tai: its Loi Nhan cooldown ran on meanwhile', a.form === 0 && a.cd.s2 > 0 && a.cd.s2 < 8 - 20 * TICK && a.hdCd2 > 7, `${a.cd.s2} ${a.hdCd2}`);
  }
  {
    // Minh Vương Giáng Lâm: the foe at the cursor is held 1.5 s, Hades lands on it after 1 s, 256, the domain rises
    const m = arena([[R('hades', 0), 0, 0], [R('ung', 1), 8, 0], [R('ung', 1), 14, 0]]), [a, v, far] = m.units;
    go(m, 1, () => ({ 0: { ult: true, tx: 8, tz: 0 } }));
    check('k15m the press: the foe rooted 1.5 s, Hades untargetable, cooldown 55', near(v.rootT, 1.5 - TICK, 1e-6) && a.invulnT > 1 && near(a.cd.ult, 55, 1e-9), `${v.rootT} ${a.invulnT}`);
    const ev = go(m, 32), z = m.zones.find((q) => q.hdDom);
    const hit = only(ev, 'hit', (e) => e.id === 1);
    check('k15n ... lands by it: 256 x falloff x armor, a domain of 5 m for 4 s round the landing', hit.length === 1 && hit[0].amt > 256 * 0.95 * UF && hit[0].amt <= 256 * UF + 1e-6 && !!z && z.r === 5 && z.dur === 4 && z.hdLock === 1, `${hit.map((e) => e.amt)} ${!!z}`);
    a.stunT = 1; go(m, 1);
    check('k15o the owner inside the domain is cc immune', a.stunT === 0 && a.ccT > 0);
    v.x = v.px = z.x + 6; v.rootT = 0; const ev2 = go(m, 1);
    check('k15p the held foe outside the domain: stunned until it ends', only(ev2, 'hdTether').length === 1 && v.stunT > 2.5 && near(v.stunT, z.dur - z.age, 0.05), `${v.stunT} left ${z.dur - z.age}`);
    far.x = far.px = z.x + 2; far.z = far.pz = z.z; go(m, 1);
    check('k15q another foe stepping in is feared (runs from Hades)', far.locT > 0 && far.locK === 2, `${far.locT} ${far.locK}`);
  }
  botsCast(check, 'k15r bots cast every skill of hades in 2 x 90 s', ['hades'], ['trau', 'ung']);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  runK15Cases((n, c, d = '') => { if (!c) bad++; console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : '  ' + d}`); }, (t) => console.log(`== ${t}`));
  process.exit(bad ? 1 : 0);
}
