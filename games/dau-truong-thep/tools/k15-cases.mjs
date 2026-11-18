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
// The batch-1 Hỏa Long kit (pierce passive, Tia Tụ charge weapon, Quá Tải prime, Màn Sáng screen wall, Thiên Hỏa Tuyến sweep):
// hoalong plays the p4 lava kit now, so the charge-weapon tests and bots run on this fixture.
export const OLD_HOALONG = {
  role: 'Pháo tia', roleKey: 'lancer', hp: 1750, speed: 5.6, armor: 0.08, accel: 0.9, turn: 8, towerMul: 0.6,
  passive: { do: 'pierce' },
  weapon: { name: 'Tia Tụ', cd: 1.1, charge: { min: 0.25, max: 1.3, hold: 0.6, dmg: [100, 740], range: [13, 22], width: [0.5, 0.9], move: 0.7 }, range: 22, vis: 'lance' },
  skills: [
    { id: 'quatai', cd: 9, do: 'buff', prime: 4 },
    { id: 'mansang', cd: 14, do: 'wall', screen: true, cast: 3.5, n: 5, r: 0.75, gap: 1.35, dur: 5 },
    { id: 'thienhoa', cd: 46, do: 'sweep', windup: 0.5, dur: 2.6, range: 20, width: 1.2, dps: 520, turn: 1.4, move: 0.3 },
  ],
};
// The batch-4 Kiếm Thần kit (meter of sword hits arming a lance volley, Kiếm Khí Trảm, Kiếm Trận guard orbit, Vạn Kiếm Quy Tông seek
// barrage): kiemthan plays the p65 Lý Bạch kit now.
export const OLD_KIEMTHAN = {
  energy: null,
  passive: { do: 'meter', max: 4, gain: { weapon: 1 }, spend: { kind: 'shot', mul: 1.4, patch: { range: 15, speed: 34, r: 0.5, pierce: true, vis: 'lance' } } },
  weapon: { name: 'Kiếm Phong', cd: 0.4, dmg: 62, n: 2, fan: 0.1, speed: 28, range: 7.5, r: 0.3, pierce: true, vis: 'wave' },
  skills: [
    { id: 'kiemkhitram', cd: 7, do: 'volley', n: 1, dmg: 240, speed: 32, range: 15, r: 0.5, pierce: true, vis: 'wave' },
    { id: 'kiemtran', cd: 14, do: 'orbit', mode: 'guard', n: 6, dur: 4, ring: 2, dps: 160, block: true },
    { id: 'vankiem', cd: 44, do: 'barrage', n: 9, radius: 5, blast: 1.8, dmg: 230, delay: 0.5, span: 1.6, cast: 14, seek: { radius: 8 } },
  ],
};
const OLD = { hades: OLD_HADES, hoalong: OLD_HOALONG, kiemthan: OLD_KIEMTHAN };
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
  // ---- Hỏa Long ----
  section('k15 kit lane k15: Hỏa Long (p4 燎) ported from the owner clip (literal expected values)');
  const HL = MECHS.hoalong;
  {
    // Phá Ngục Viêm Nhận: a 225 shield for 3 s, weapon hits halved, three blows of 225 with a 2.6 m burst and 75% lifesteal, each cutting E 10%
    const m = arena([[R('hoalong', 0), 0, 0], [R('ung', 1), 5, 0], [R('ung', 1), 6.5, 1]]), [a, v, b] = m.units;
    a.cd.s2 = 10; a.hp = 1000;
    go(m, 1, () => ({ 0: { s1: true } }));
    check('k15s the press: shield 225 for 3 s, guard 0.5 vs weapon, three empowered blows armed, cooldown 10', a.shield === 225 && a.gvF === 0.5 && a.gvK === 'weapon' && a.shotN === 3 && near(a.cd.s1, 10, 1e-9), `${a.shield} ${a.gvF} ${a.gvK} ${a.shotN}`);
    const cd0 = a.cd.s2, ev = go(m, 15, (i) => ({ 0: { fire: i === 0, aim: 0 } })), hits = only(ev, 'hit', (e) => e.by === 0 && e.amt > 0);
    check('k15t the first blow: 225 x armor on the target and a burst on the foe beside it, healed, E cut by 1 s (the blow that hit, not its burst)', hits.length === 2 && hits.some((e) => e.id === 1 && near(e.amt, 225 * UF, 1e-6)) && a.hp > 1000 + 225 * UF * 0.75 && near(a.cd.s2, cd0 - 15 * TICK - 1, 1e-6) && a.shotN === 2, `${hits.map((e) => e.id + ':' + e.amt)} hp ${a.hp} cd ${a.cd.s2}`);
  }
  {
    // the lava trail: puddles every 1.4 m walked for 2 s after a press; a foe on the path is lit once per puddle
    const m = arena([[R('hoalong', 0), 0, 0], [R('ung', 1), 4, 0, 0]]), [a, v] = m.units;
    go(m, 1, () => ({ 0: { s1: true } }));
    go(m, 60, () => ({ 0: { mx: 1, aim: 0 } }));
    const pud = m.zones.filter((z) => z.hlBurn);
    check('k15u walking 2 s leaves puddles (vis hlLava) 1.4 m apart, none after the 2 s', pud.length >= 5 && pud.length <= 9 && pud.every((z) => z.vis === 'hlLava' && z.r === 1.3), `${pud.length}`);
    check('k15v the foe standing on the path burns (several stacks, 37 a stack, by hoalong)', v.burnN >= 2 && v.burnDps === 37 && v.burnBy === 0, `${v.burnN} ${v.burnDps}`);
    check('k15w one foe burning: hoalong does x1.1 and takes 10% less', near(a.dmgF, 1.1, 1e-9) && near(a.guardF, 0.1, 1e-9) && a.hlN === 1, `${a.dmgF} ${a.guardF}`);
  }
  {
    // five stacks: confused 1 s, once per burn
    const m = arena([[R('hoalong', 0), 0, 0], [R('ung', 1), 0.5, 0]]), [a, v] = m.units;
    v.burnN = 4; v.burnT = 2; v.burnBy = 0; v.burnDps = 37;
    go(m, 1, () => ({ 0: { s1: true } })); go(m, 1);
    check('k15x the fifth stack from a puddle: confused 1 s', v.burnN === 5 && v.locK === 1 && v.locT > 0.9, `${v.burnN} ${v.locK} ${v.locT}`);
  }
  {
    // a foe dying while it burns bursts: 150 + 37 x 3 stacks = 261 true damage on its neighbour
    const m = arena([[R('hoalong', 0), -10, 0], [R('ung', 1), 4, 0], [R('ung', 1), 5.5, 0]]), [a, v, b] = m.units;
    v.burnN = 3; v.burnT = 2; v.burnBy = 0; v.burnDps = 37; v.hp = 1;
    const ev = go(m, 2);
    check('k15y the burning foe dies and bursts (explode lava): 261 true damage on the one beside it', only(ev, 'explode', (e) => e.why === 'lava').length === 1 && near(UNG.hp - b.hp, 261, 1e-6), `${UNG.hp - b.hp}`);
  }
  {
    // Viêm Lưu Trụy Tinh: 0.3 s wind-up, a jump to the cursor, 344 (falloff), knocked up 0.5 s, slowed; haste x2 for 2.75 s from the press
    const m = arena([[R('hoalong', 0), 0, 0], [R('ung', 1), 6, 0]]), [a, v] = m.units;
    go(m, 1, () => ({ 0: { s2: true, tx: 6, tz: 0 } }));
    check('k15z the press: haste x2, the wind-up runs', a.hasteF === 2 && !!a.cast, `${a.hasteF}`);
    const ev = go(m, 30), hit = only(ev, 'hit', (e) => e.id === 1 && e.amt > 10);   // the lava under it burns too
    check('k15za lands on the foe: one hit of 344 x falloff x armor, knocked up, slowed 50%', hit.length === 1 && hit[0].amt > 344 * 0.9 * UF && hit[0].amt <= 344 * UF + 1e-6 && v.slowF === 0.5 && Math.hypot(a.x - 6, a.z) < 1.2, `${hit.map((e) => e.amt)} x ${a.x}`);
  }
  {
    // Viêm Chi Thẩm Phán: 2 s of heat, then 1088 in 5 m (falloff); a stun only within 2.5 m
    const m = arena([[R('hoalong', 0), 0, 0], [R('ung', 1), 2, 0], [R('ung', 1), 0, 4]]), [a, v, b] = m.units;
    const ev = go(m, 59, (i) => ({ 0: { ult: i === 0 } }));
    check('k15zb nothing for the first 2 s', only(ev, 'hit', (e) => e.by === 0).length === 0 && a.tfT > 0);
    go(m, 3);
    check('k15zc the blast: 1088 x 0.8 x armor at 2 m (stunned 1.5 s), 1088 x 0.6 x armor at 4 m (not stunned)', near(UNG.hp - v.hp, 1088 * 0.8 * UF, 1) && near(UNG.hp - b.hp, 1088 * 0.6 * UF, 1) && v.stunT > 1.3 && !(b.stunT > 0), `${UNG.hp - v.hp} ${UNG.hp - b.hp} stun ${v.stunT} ${b.stunT}`);
  }
  botsCast(check, 'k15zd bots cast every skill of hoalong in 2 x 90 s', ['hoalong'], ['trau', 'ung']);
  // ---- Kiếm Thần ----
  section('k15 kit lane k15: Kiếm Thần = Lý Bạch (p65 李白) ported from the owner clip (literal expected values)');
  {
    // energy by distance: 3 a metre walked, all gone after 2 s still; the calm buff (no foe within 9.7 m): haste and damage x1.25
    const m = arena([[R('kiemthan', 0), 0, 0], [R('ung', 1), 30, 15]]), a = m.units[0];
    const x0 = a.x; go(m, 30, () => ({ 0: { mx: 1, aim: 0 } }));
    check('k15ze walking fills the energy, 3 a metre', a.en <= 3 * (a.x - x0) + 1e-6 && a.en >= 3 * (a.x - x0 - 0.6), `en ${a.en} walked ${a.x - x0}`);
    check('k15zf alone: haste x1.25 and damage x1.25', near(a.hasteF, 1.25, 1e-9) && near(a.dmgF, 1.25, 1e-9), `${a.hasteF} ${a.dmgF}`);
    go(m, 59);
    check('k15zg ... standing still: kept for under 2 s', a.en > 0);
    go(m, 8);   // the glide to a stop takes a few ticks
    check('k15zh ... gone after 2 s still', a.en === 0, `${a.en}`);
    const w = arena([[R('kiemthan', 0), 0, 0], [R('ung', 1), 6, 0]]); go(w, 2);
    check('k15zi a foe within 9.7 m: no calm buff', !(w.units[0].dmgT > 0), `${w.units[0].dmgT}`);
  }
  {
    // Vạn Cổ Tiêu Sầu works while stunned: cleansed, +50 energy, haste x2 fading, the foe beside pushed and hit for 124
    const m = arena([[R('kiemthan', 0), 0, 0], [R('ung', 1), 2, 0]]), [a, v] = m.units;
    a.stunT = 2; a.slowT = 2; a.slowF = 0.5; a.locT = 0;
    go(m, 1, () => ({ 0: { s1: true } }));
    check('k15zj pressed while stunned: the stun and slow are gone, energy 50, haste x2, cooldown 12', a.stunT === 0 && a.slowT === 0 && near(a.en, 50, 1e-6) && a.hasteF === 2 && near(a.cd.s1, 12, 1e-9), `${a.stunT} ${a.en} ${a.hasteF}`);
    go(m, 6);
    check('k15zk the push: 124 x falloff x armor, weakened 25%, thrown back', UNG.hp - v.hp > 124 * 0.6 * UF && UNG.hp - v.hp <= 124 * UF + 1e-6 && v.weakenF === 0.75 && v.x > 2.3, `${UNG.hp - v.hp} ${v.x}`);
    const p = arena([[R('kiemthan', 0), 0, 0], [R('ung', 1), 20, 0]]), b = p.units[0];
    b.locT = 2; b.locK = 4;
    go(p, 1, () => ({ 0: { s1: true } }));
    check('k15zl ... and while petrified', b.locT === 0 && near(b.cd.s1, 12, 1e-9), `${b.locT}`);
  }
  {
    // Long Tuyền Xuất Hạp: full energy -> x1.5 speed and damage, the damage x (1 + 0.0715 a metre flown) up to x2, energy spent, 25 back on a hit
    const m = arena([[R('kiemthan', 0), 0, 0], [R('ung', 1), 12, 0]]), [a, v] = m.units;
    a.en = 100; a.ktStill = -99;
    go(m, 1, () => ({ 0: { s2: true, aim: 0 } }));
    const sh = m.shots.find((q) => q.owner === 0);
    check('k15zm the press: one sword at 45 m/s, 186 x 1.25 (alone: the calm buff) before the ramp, over walls; energy spent; one use of three gone', !!sh && near(sh.speed, 45, 1e-9) && near(sh.dmg, 186 * 1.25, 1e-9) && sh.over && a.en === 0 && a.use1 === 1, `${sh && sh.speed} ${sh && sh.dmg} ${a.en}`);
    const ev = go(m, 12), hit = only(ev, 'hit', (e) => e.id === 1);
    check('k15zn it hits at about 11 m flown: 232.5 x ~1.7 x armor, 25 energy back, the ktSword mark on it', hit.length === 1 && hit[0].amt > 232.5 * 1.6 * UF && hit[0].amt < 232.5 * 1.85 * UF && near(a.en, 25, 1e-6) && v.tags['ktSword@0'] > 3, `${hit.map((e) => e.amt)} en ${a.en}`);
  }
  {
    // Cửu Thiên Thần Kiếm: a strike rides every foe within 8 m; 1.5 s later 124 + 15% of the lost hp, +248 on a marked one
    const m = arena([[R('kiemthan', 0), 0, 0], [R('ung', 1), 4, 0], [R('ung', 1), 0, 5], [R('ung', 1), 13, 0]]), [a, v, b, far] = m.units;
    a.ktStill = -99; v.hp = b.hp = 1000; v.tags['ktSword@0'] = 9;
    const ev = go(m, 1, () => ({ 0: { ult: true } }));
    check('k15zo the press: two locks (the foe at 13 m is out of reach), cooldown 45', only(ev, 'lock').length === 2 && m.zones.filter((z) => z.kind === 'strike' && z.on >= 0).length === 2 && near(a.cd.ult, 45, 1e-9), `${only(ev, 'lock').length}`);
    go(m, 46);
    check('k15zp the strikes: 124 x armor, + 248 true on the marked one, then 15% of the hp lost by then (700 + those) as true damage', near(1000 - b.hp, 124 * UF * 1.15 + 105, 1) && near(1000 - v.hp, (124 * UF + 248) * 1.15 + 105, 1) && far.hp === UNG.hp, `${1000 - v.hp} ${1000 - b.hp}`);
    const w = arena([[R('kiemthan', 0), 0, 0], [R('ung', 1), 12, 0]]);
    go(w, 1, () => ({ 0: { ult: true } }));
    check('k15zq nobody within 8 m: no cast, a 0.4 s lockout', near(w.units[0].cd.ult, 0.4, 1e-9) && !w.zones.some((z) => z.kind === 'strike'), `${w.units[0].cd.ult}`);
  }
  botsCast(check, 'k15zr bots cast every skill of kiemthan in 2 x 90 s', ['kiemthan'], ['trau', 'ung']);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  runK15Cases((n, c, d = '') => { if (!c) bad++; console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : '  ' + d}`); }, (t) => console.log(`== ${t}`));
  process.exit(bad ? 1 : 0);
}
