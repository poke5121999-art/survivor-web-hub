// Kit lane K18 (feat/dtt-k18): the kits of Ngưu Ma Vương (nguma, clip p85) and Mikasa (nhenthep, clip p56) ported from the owner's
// clips, and their G5 mechanics (sim.js block "kit lane K18"). Section K18 of tools/sim-test.mjs; runs alone too:
// `node tools/k18-cases.mjs`. Expected values follow the data rows, so a balance pass keeps the arithmetic.
// The kits these tanks had before (ramp armour, volley waves, dash, transform with a nova; brittle, hook self on mechs, invuln
// dash with amp, flurry) are fixtures now: OLD_NGUMA / OLD_NHENTHEP with oldK18(m) keep the older sections' primitives covered.
import { createMatch, step, armorOf, skillReady } from '../js/sim.js';
import { MECHS, TICK } from '../js/data.js';

export const OLD_NGUMA = {
  passive: { do: 'ramp', name: 'Da Trâu', on: 'hurt', stat: 'armor', step: 0.02, max: 6, dur: 3 },
  weapon: { name: 'Rìu Chấn', cd: 0.9, dmg: 200, speed: 24, range: 8, r: 0.6, pierce: true, knock: 1.5, vis: 'wave' },
  skills: [
    { id: 'songriu', cd: 8, do: 'volley', n: 3, fan: 0.08, dmg: 220, speed: 24, range: 8, r: 0.45, pierce: true, vis: 'wave' },
    { id: 'humma', cd: 12, do: 'dash', dist: 9, speed: 26, dmg: 200, stun: 0.4, knock: 4.5 },
    { id: 'phaptuong', cd: 46, do: 'transform', dur: 6, size: 1.35, armor: 0.2, heal: 0.25, nova: { windup: 0.3, radius: 6, dmg: 320, stun: 1.1 } },
  ],
};
export const OLD_NHENTHEP = {
  passive: { do: 'brittle', name: 'Thợ Săn', mul: 1.25, when: 'marked', mods: { onKill: { reset: { slots: ['s1'], frac: 1 } } } },
  weapon: { name: 'Song Lưỡi', cd: 0.3, dmg: 64, n: 2, fan: 0.12, speed: 30, range: 8, r: 0.24, vis: 'pellet' },
  skills: [
    { id: 'mocdu', cd: 7, do: 'hook', speed: 36, range: 13, r: 0.35, dmg: 140, self: true, vis: 'hook' },
    { id: 'vongchem', cd: 9, do: 'dash', dist: 6, speed: 32, dmg: 165, invuln: true, fx: { amp: { amp: 0.2, dur: 4 } } },
    { id: 'dudaylienhoan', cd: 40, do: 'flurry', n: 5, range: 9, speed: 38, dmg: 240, invuln: true },
  ],
};
const OLD = { nguma: OLD_NGUMA, nhenthep: OLD_NHENTHEP };
// Every nguma / nhenthep of the match plays its old kit (the match must be fresh: nothing pressed yet).
export function oldK18(m) {
  for (const u of m.units) {
    const K = OLD[u.mech];
    if (!K) continue;
    u.def = { ...u.def, passive: K.passive, weapon: K.weapon, skills: K.skills, energy: undefined, tfWeapon: {} };
    u.passive = K.passive.do; u.en = 0;
  }
  return m;
}

const IN = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };
const inp = (o) => Object.assign({}, IN, o);
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const R = (mech, team = 0) => ({ team, mech, name: mech + team });
function put(u, x, z) { u.x = u.px = x; u.z = u.pz = z; }
function arena(units, walls = [], seed = 5) {
  const m = createMatch({ seed, roster: units.map((u) => u[0]) });
  m.map.walls.length = 0; m.map.rounds.length = 0; m.map.bushes.length = 0; m.map.hazards.length = 0;
  for (const w of walls) m.map.walls.push({ x0: w[0], x1: w[1], z0: w[2], z1: w[3], h: 2, kind: 'wall' });
  for (const p of m.props) p.alive = false;
  m.towers.length = 0;
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
const UNG = MECHS.ung, UNG_F = 1 - UNG.armor;
const blows = (ev, id, by, min = 1) => only(ev, 'hit', (e) => e.id === id && e.by === by && e.amt + e.absorbed >= min);
const fall = (d, r) => 1 - 0.5 * Math.min(1, d / r);

export function runK18Cases(check, section) {
  section('K18 kit lane K18: Ngưu Ma Vương and Mikasa ported from the owner\'s clips (p85, p56) and their G5 mechanics (literal expected values)');

  // ---- Ngưu Ma Vương (nguma), clip p85 ----
  const NM = MECHS.nguma, G = NM.passive.nmGale, [NQ, NE, NU] = NM.skills;
  // Chiến Tiêu every 3 s: 75 with falloff on the foe 2 m away, one stack on it (slow 5%) and one on him (2% skill guard)
  {
    const m = arena([[R('nguma', 0), 0, 0], [R('ung', 1), 2, 0]]), [a, v] = m.units;
    const ev = go(m, Math.round(G.every / TICK) + 1);
    const gl = only(ev, 'k18', (e) => e.kind === 'gale'), b = blows(ev, 1, 0);
    check('K18-a Chien Tieu goes off by itself after 3 s: one whirl, 75 x falloff (2 m of 3.5) x armour on the foe', gl.length === 1 && b.length === 1 && near(b[0].amt, 75 * fall(2, 3.5) * UNG_F, 1e-6), `${gl.length} ${b.map((e) => e.amt)}`);
    check('K18-b ... the foe carries one of his stacks (slowed 5%, 5 s), he has one of his own: 2% less skill damage for 5 s', v.nmN === 1 && v.nmBy === 0 && near(v.slowF, 0.05) && v.slowT > 4.9 && a.nmS === 1 && near(a.gvF, 0.02) && a.gvK === 'skill' && a.gvT > 4.9, `${v.nmN} ${v.slowF} ${a.nmS} ${a.gvF} ${a.gvK}`);
    v.nmN = 4; v.nmT = 5; a.nmClock = G.every - TICK * 0.5;
    const ev2 = go(m, 1), b2 = blows(ev2, 1, 0);
    check('K18-c four stacks: the next whirl does x (1 + 0.15 x 4), then five stacks slow 25%; his own stacks now 2 (4% guard)', b2.length === 1 && near(b2[0].amt, 75 * fall(2, 3.5) * 1.6 * UNG_F, 1e-6) && v.nmN === 5 && near(v.slowF, 0.25) && a.nmS === 2 && near(a.gvF, 0.04), `${b2.map((e) => e.amt)} ${v.nmN} ${v.slowF} ${a.nmS}`);
    a.nmS = 10; v.nmN = 10; a.nmClock = G.every; go(m, 1);
    check('K18-d stacks stop at 10 on both sides', a.nmS === 10 && v.nmN === 10 && near(a.gvF, 0.2), `${a.nmS} ${v.nmN}`);
    go(m, Math.round(5.2 / TICK), () => ({ 1: { mx: 1 } }));
    check('K18-e a foe out of reach for 5 s loses his stacks', v.nmN === 0 && v.nmBy === -1, `${v.nmN}`);
  }
  // Chiến Tiêu at each press, and each time he has taken 10% of his max hp from foes
  {
    const m = arena([[R('nguma', 0), 0, 0], [R('ung', 1), 6, 0]]), [a, v] = m.units;
    const ev = go(m, 1, () => ({ 0: { s1: true } }));
    check('K18-f a press whirls at once (the Q below)', only(ev, 'k18', (e) => e.kind === 'gale').length === 1 && a.nmClock === 0);
    a.nmAcc = G.hurt * a.maxHp - 1; a.nmClock = 0;
    const ev2 = go(m, 12, (i) => ({ 1: { fire: i === 0 } }));
    check('K18-g one weapon hit past 10% of max hp taken whirls again (the count keeps the rest)', only(ev2, 'k18', (e) => e.kind === 'gale').length === 1 && a.nmAcc < G.hurt * a.maxHp, `${only(ev2, 'k18').length} ${a.nmAcc}`);
  }
  // Bạo Lệ Tiễn Đạp (Q): a 0.3 s wind-up, 150 with falloff, stun 0.5, slow 25% and weaken 25% to 2.5 s; two uses 3 s apart
  {
    const m = arena([[R('nguma', 0), 0, 0], [R('ung', 1), 2, 0]]), [a, v] = m.units;
    const ev = go(m, Math.round(NQ.windup / TICK) + 2, (i) => ({ 0: { s1: i === 0 } }));
    const b = blows(ev, 1, 0).filter((e) => e.amt > 80);
    check('K18-h Bao Le Tien Dap: 150 x falloff (2 m of 4) x armour, stunned 0.5 s', b.length === 1 && near(b[0].amt, 150 * fall(2, 4) * UNG_F, 1e-6) && v.stunT > 0.4 && v.stunT <= 0.5, `${b.map((e) => e.amt)} ${v.stunT}`);
    check('K18-i ... slowed 25% and weakened to x0.75 until 2.5 s after the hit', near(v.slowF, 0.25) && v.slowT > 2.4 && near(v.weakenF, 0.75) && v.weakenT > 2.4, `${v.slowF} ${v.slowT} ${v.weakenF} ${v.weakenT}`);
    check('K18-j two uses: one spent, the gap 3 s holds the second', a.use0 === 1 && a.gap0 > 2.5 && !skillReady(a, 0), `${a.use0} ${a.gap0}`);
    go(m, Math.round(3 / TICK));
    check('K18-k ... after 3 s the second use is ready while the first recharges', skillReady(a, 0) && a.cd.s1 > 0, `${a.gap0} ${a.cd.s1}`);
  }
  // Cuồng Dã Giác Tập (E): 0.3 s wind-up, an 8 m charge dragging the foe, 243, slow 75% decaying over 4 s, shield 25% that turns into hp
  {
    const m = arena([[R('nguma', 0), 0, 0], [R('ung', 1), 3, 0]]), [a, v] = m.units;
    a.hp = a.maxHp - 1500; const h = a.hp;
    go(m, 1, () => ({ 0: { s2: true } }));
    check('K18-l the press winds up (no dash yet) and puts up a shield of 25% of max hp', !a.dash && a.cast && near(a.shield, 0.25 * a.maxHp), `${a.shield}`);
    const ev = go(m, Math.round(NE.windup / TICK) + 12);
    const b = blows(ev, 1, 0).filter((e) => e.amt > 150);
    check('K18-m the charge hits the foe once for 243 x armour and carries it along (it ends ahead of where it stood)', b.length === 1 && near(b[0].amt, 243 * UNG_F, 1e-6) && v.x > 5, `${b.map((e) => e.amt)} ${v.x}`);
    check('K18-n ... slowed 75% decaying (G2 slowDecay over 4 s)', v.dsF === 0.75 && v.dsT > 3 && v.slowG > 0.5 && v.slowG < 0.75, `${v.dsF} ${v.dsT} ${v.slowG}`);
    check('K18-o ... meanwhile the shield has been turning into hp: shield + hp gained = 25% of max hp', near(a.shield + (a.hp - h), 0.25 * a.maxHp, 1e-6) && a.hp > h, `${a.shield} ${a.hp - h}`);
    go(m, Math.round(4 / TICK));
    check('K18-p after 4 s the whole shield is hp', a.shield === 0 && near(a.hp - h, 0.25 * a.maxHp, 1e-6), `${a.shield} ${a.hp - h}`);
  }
  // Tàn Phong Đoạn Dã (ult): 0.5 s wind-up, a 10 x 4 m strip, 536, knock-up 1.5 s, slowed 50% and skill damage x0.5 to 4 s
  {
    const m = arena([[R('nguma', 0), 0, 0], [R('ung', 1), 6, 1.5]]), [a, v] = m.units;
    const ev = go(m, Math.round(NU.windup / TICK) + 2, (i) => ({ 0: { ult: i === 0 } }));
    const b = blows(ev, 1, 0).filter((e) => e.amt > 300);
    check('K18-q Tan Phong Doan Da: 536 x armour on the foe in the strip (1.5 m off the axis), knocked up 1.5 s', b.length === 1 && near(b[0].amt, 536 * UNG_F, 1e-6) && v.airT > 1.4 && v.stunT > 1.4, `${b.map((e) => e.amt)} ${v.airT}`);
    check('K18-r ... slowed 50% and its skill damage muted to x0.5 for 4 s (nmMute)', near(v.slowF, 0.5) && v.slowT > 3.9 && v.nmMF === 0.5 && v.nmMT > 3.9, `${v.slowF} ${v.nmMF} ${v.nmMT}`);
  }
  {
    const m = arena([[R('lubo', 0), 0, 0], [R('nguma', 1), 5, 0]]), [a, v] = m.units;
    a.nmMT = 3; a.nmMF = 0.5;
    const ev = go(m, 12, (i) => ({ 0: { s1: i === 0 } }));
    const b = blows(ev, 1, 0, 100);
    check('K18-s a muted Lữ Bố\'s Tuy Viễn does half: 276 x 0.5 x his armour', b.length === 1 && near(b[0].amt, MECHS.lubo.skills[0].dmg * 0.5 * (1 - armorOf(m, v)), 1e-6), `${b.map((e) => e.amt)}`);
    a.cd.fire = 0;
    const ev2 = go(m, 12, (i) => ({ 0: { fire: i === 0 } }));
    const w = blows(ev2, 1, 0, 50);
    check('K18-t ... his weapon is not muted', w.length >= 1 && near(w[0].amt, MECHS.lubo.weapon.dmg * (1 - armorOf(m, v)), 1e-6), `${w.map((e) => e.amt)}`);
  }

  // ---- Mikasa (nhenthep), clip p56 ----
  const MK = MECHS.nhenthep, [MQ, ME, MU] = MK.skills, ARM = MK.passive.nhArmor;
  // passive: her hits do x (1 + 1.5 x the target's armour)
  {
    const m = arena([[R('nhenthep', 0), 0, 0], [R('trau', 1), 3, 0]]), [a, v] = m.units;
    const T = armorOf(m, v), ev = go(m, 6, (i) => ({ 0: { fire: i === 0 } })), b = blows(ev, 1, 0);
    check('K18-u Thiet Bi Co Dong: each blade does 64 x (1 + 1.5 x armour) x (1 - armour) on Optimus', b.length === 2 && b.every((e) => near(e.amt, 64 * (1 + ARM * T) * (1 - T), 1e-6)), `${b.map((e) => e.amt)} armour ${T}`);
    check('K18-v ... and each weapon hit gives 2.5 energy (she started full, so still 100)', a.en === 100 && MK.energy.max === 100);
  }
  // Cực Tốc Điền Sung (Q): castable while rooted, cleanses, 5 m dash, shield 25%, +75 energy; cc immune and x1.25 while the shield lasts
  {
    const m = arena([[R('nhenthep', 0), 0, 0], [R('ung', 1), 20, 0]]), [a, v] = m.units;
    a.rootT = 2; a.slowT = 2; a.slowF = 0.5; a.burnT = 2; a.burnN = 2; a.en = 10;
    const ev = go(m, 1, () => ({ 0: { s1: true } }));
    check('K18-w rooted, she can still press it: cleansed (root, slow, burn), shield 25% of max hp, energy 10 + 75', only(ev, 'skill', (e) => e.id === 0).length === 1 && a.rootT === 0 && a.slowT === 0 && a.burnT === 0 && near(a.shield, 0.25 * a.maxHp) && near(a.en, 85 + 0, 0.2), `${a.rootT} ${a.shield} ${a.en}`);
    go(m, Math.round((MQ.windup + MQ.dist / MQ.speed) / TICK) + 3);
    check('K18-x ... she dashed 5 m along the aim; while the shield lasts she is cc immune and runs x1.25, the cooldown held full', near(a.x, 5, 0.3) && a.ccT > 0 && a.hasteF === 1.25 && a.cd.s1 === MQ.cd && a.nhQT > 0, `${a.x} ${a.ccT} ${a.hasteF} ${a.cd.s1}`);
    a.shield = 0; go(m, 10);
    check('K18-y the shield gone: no more cc immunity, the cooldown runs from then', a.nhQT === 0 && a.ccT === 0 && near(a.cd.s1, MQ.cd - 10 * TICK, 1e-6), `${a.nhQT} ${a.ccT} ${a.cd.s1}`);
  }
  {
    const m = arena([[R('nhenthep', 0), 0, 0], [R('ung', 1), 20, 0]]), a = m.units[0];
    go(m, 1, () => ({ 0: { s1: true } })); go(m, Math.round(5 / TICK));
    check('K18-z a shield left alone lasts 4 s, then the cooldown starts (about 1 s run of its 10)', a.shield === 0 && a.nhQT === 0 && a.cd.s1 < MQ.cd && a.cd.s1 > MQ.cd - 1.3, `${a.shield} ${a.cd.s1}`);
  }
  // Đạn Xạ Câu Trảo (E): flies through the mech, catches the wall, reels her cc immune and cuts the foe on the way
  {
    const m = arena([[R('nhenthep', 0), 0, 0], [R('ung', 1), 4, 0]], [[9, 10, -3, 3]]), [a, v] = m.units;
    const ev = go(m, 1, () => ({ 0: { s2: true } }));
    check('K18-A the grapple costs 50 energy and one of three uses', near(a.en, 50, 0.2) && a.use1 === 1 && a.gap1 > 1.4, `${a.en} ${a.use1}`);
    const ev2 = go(m, 30, (i) => (i < 9 ? {} : {}));
    const lt = only(ev2, 'k18', (e) => e.kind === 'latch'), b = blows(ev2, 1, 0);
    check('K18-B it flew through the foe (no hit by the hook), caught the wall: one latch event, she ends just short of it', lt.length === 1 && a.x > 7.3 && a.x < 8.4 && !a.dash, `${lt.length} ${a.x}`);
    check('K18-C ... on the way she cut the foe once: 128 x (1 + 1.5 x armour) x armour, slowed 50% for 2 s', b.length === 1 && near(b[0].amt, 128 * (1 + ARM * UNG.armor) * UNG_F, 1e-6) && near(v.slowF, 0.5) && v.slowT > 1, `${b.map((e) => e.amt)} ${v.slowF}`);
  }
  {
    const m = arena([[R('nhenthep', 0), 0, 0], [R('ung', 1), 4, 6]], [[9, 10, -3, 3]]), a = m.units[0];
    go(m, 1, () => ({ 0: { s2: true } }));
    let reel = false, cc = true;
    for (let i = 0; i < 20; i++) { go(m, 1); if (a.dash && a.dash.nh) { reel = true; cc = cc && a.ccT > 0; } }
    check('K18-D while she reels she is cc immune', reel && cc);
  }
  {
    const m = arena([[R('nhenthep', 0), 0, 0], [R('ung', 1), 4, 9]]), a = m.units[0];
    const ev = go(m, 30, (i) => ({ 0: { s2: i === 0 } }));
    check('K18-E no wall in reach: the grapple flies 13 m and nothing pulls her, no combo window', only(ev, 'k18').length === 0 && near(a.x, 0, 0.01) && a.nhCT === 0, `${a.x}`);
    a.en = 40;
    check('K18-F under 50 energy the grapple is not ready', !skillReady(a, 1));
  }
  // Hồi Toàn Trảm Kích (ult): 128 with falloff, half of it back as hp, +25% a stack for the next spin, three uses 1.5 s apart
  {
    const m = arena([[R('nhenthep', 0), 0, 0], [R('ung', 1), 2, 0]]), [a, v] = m.units;
    a.hp = a.maxHp - 800; const h = a.hp;
    const one = 128 * fall(2, MU.radius) * (1 + ARM * UNG.armor) * UNG_F;
    const ev = go(m, 3, (i) => ({ 0: { ult: i === 0 } }));
    const b = blows(ev, 1, 0);
    check('K18-G Hoi Toan Tram Kich: 128 x falloff (2 m of 4) x her armour sense x armour; she heals half of it', b.length === 1 && near(b[0].amt, one, 1e-6) && near(a.hp - h, one * 0.5, 1e-6), `${b.map((e) => e.amt)} heal ${a.hp - h}`);
    check('K18-H ... the foe carries one spin stack (4 s); a use spent, 1.5 s to the next', v.nhN === 1 && v.nhBy === 0 && v.nhT > 3.8 && a.use2 === 1 && !skillReady(a, 2), `${v.nhN} ${a.use2}`);
    go(m, Math.round(1.5 / TICK));
    const ev2 = go(m, 3, (i) => ({ 0: { ult: i === 0 } })), b2 = blows(ev2, 1, 0);
    check('K18-I the second spin does x1.25 on it, now two stacks', b2.length === 1 && near(b2[0].amt, one * 1.25, 1e-6) && v.nhN === 2, `${b2.map((e) => e.amt)} ${v.nhN}`);
    v.nhN = 3; v.nhT = 4; a.nhCT = 0.5; a.cd.ult = 0; a.use2 = 0; a.gap2 = 0;
    const ev3 = go(m, 3, (i) => ({ 0: { ult: i === 0 } })), b3 = blows(ev3, 1, 0);
    check('K18-J inside the combo window: x1.5 crit on top of three stacks (x1.75), the window spent, 50% less skill damage for 2 s', b3.length === 1 && near(b3[0].amt, one * 1.75 * 1.5, 1e-6) && a.nhCT === 0 && a.gvF === 0.5 && a.gvK === 'skill' && a.gvT > 1.8 && only(ev3, 'k18', (e) => e.kind === 'crit').length === 1, `${b3.map((e) => e.amt)} ${a.nhCT} ${a.gvF}`);
    check('K18-K stacks stop at 3', v.nhN === 3);
  }
  // she spins while she reels: the grapple's window is open, the spin crits; nothing else can be pressed meanwhile
  {
    const m = arena([[R('nhenthep', 0), 0, 0], [R('ung', 1), 20, 9]], [[12, 13, -3, 3]]), a = m.units[0];
    go(m, 1, () => ({ 0: { s2: true } }));
    let t = 0;
    while (!(a.dash && a.dash.nh) && t++ < 30) go(m, 1);
    const ev = go(m, 1, () => ({ 0: { ult: true, s1: true, fire: true } }));
    check('K18-L reeling, the spin goes off (crit event) and she keeps reeling; the Q and the weapon wait', !!(a.dash && a.dash.nh) && only(ev, 'skill', (e) => e.id === 0 && e.skill === MU.id).length === 1 && only(ev, 'k18', (e) => e.kind === 'crit').length === 1 && only(ev, 'skill', (e) => e.skill === MQ.id).length === 0 && only(ev, 'fire', (e) => e.id === 0).length === 0, `${t} ${JSON.stringify(only(ev, 'skill'))}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0, passed = 0;
  runK18Cases((name, cond, detail = '') => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); } }, (s) => console.log(`\n# ${s}`));
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
