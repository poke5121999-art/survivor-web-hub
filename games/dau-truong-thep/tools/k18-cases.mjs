// Kit lane K18 (feat/dtt-k18): the kit of Ngưu Ma Vương (nguma, clip p85) ported from the owner's
// clip, and their G5 mechanics (sim.js block "kit lane K18"). Section K18 of tools/sim-test.mjs; runs alone too:
// `node tools/k18-cases.mjs`. Expected values follow the data rows, so a balance pass keeps the arithmetic.
// The kit it had before (ramp armour, volley waves, dash, transform with a nova) is a fixture now: OLD_NGUMA with oldK18(m)
// keeps the older sections' primitives covered.
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
const OLD = { nguma: OLD_NGUMA };
// Every nguma of the match plays its old kit (the match must be fresh: nothing pressed yet).
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
  section('K18 kit lane K18: Ngưu Ma Vương ported from the owner\'s clip (p85) and their G5 mechanics (literal expected values)');

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
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0, passed = 0;
  runK18Cases((name, cond, detail = '') => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); } }, (s) => console.log(`\n# ${s}`));
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
