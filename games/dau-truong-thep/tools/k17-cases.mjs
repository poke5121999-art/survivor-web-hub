// Kit lane k17 (feat/dtt-k17): the kits of Razor (luondien, clip p51), Medusa (mangxa, p42) and Na Tra (natra, p64) ported from
// the owner's clips, and their G5 mechanics (sim.js blocks "kit-remake G5 Razor / Medusa / Na Tra"). Section K17 of
// tools/sim-test.mjs; runs alone too: `node tools/k17-cases.mjs`. Expected values follow the data rows.
// The kits these tanks had before are fixtures now: OLD_* with oldK17(m) keep the generic primitives of the older sections covered.
import { createMatch, step, unitSpeed, LOC_KINDS, skillReady } from '../js/sim.js';
import { MECHS, TICK } from '../js/data.js';

export const OLD_LUONDIEN = {
  passive: { do: 'meter', name: 'Tích Điện', max: 5, gain: { weapon: 1 }, spend: { kind: 'chain', n: 3, r: 6, mul: 0.7 } },
  weapon: { name: 'Roi Điện', cd: 0.25, dmg: 85, speed: 36, range: 12, r: 0.2, vis: 'bullet' },
  skills: [
    { id: 'luongdien', name: 'Luồng Điện', cd: 7, do: 'volley', n: 1, dmg: 260, speed: 40, range: 14, r: 0.3, pierce: true, slow: 0.25, slowDur: 1, vis: 'lance' },
    { id: 'vungdien', name: 'Vùng Điện', cd: 13, do: 'zone', at: 'self', follow: true, radius: 4, dur: 4, dps: 180, vis: 'bastion' },
    { id: 'samset', name: 'Sấm Sét', cd: 42, do: 'barrage', n: 8, radius: 5, blast: 2, dmg: 330, delay: 0.4, span: 2, cast: 12, seek: { radius: 9, prefer: 'meterMark' }, fx: { chain: { n: 2, r: 5, mul: 0.5 } } },
  ],
};
export const OLD_MANGXA = {
  passive: { do: 'trophy', name: 'Chiến Tích', heal: 0.1 },
  weapon: { name: 'Nanh Thép', cd: 0.7, dmg: 178, speed: 30, range: 10.5, r: 0.28, vis: 'slug' },
  skills: [
    { id: 'mocxich', name: 'Móc Xích', cd: 11, do: 'hook', speed: 30, range: 13, r: 0.4, dmg: 120, stun: 0.4, vis: 'hook' },
    { id: 'hoanvi', name: 'Hoán Vị', cd: 13, do: 'swap', cast: 12, pick: 3, slow: 0.4, slowDur: 1.5 },
    { id: 'longxich', name: 'Lồng Xích', cd: 40, do: 'zone', at: 'self', radius: 5.5, dur: 3.5, dps: 110, cage: true, vis: 'cage' },
  ],
};
export const OLD_NATRA = {
  passive: { do: 'trait', name: 'Liên Hoa Thân', mods: { lowHp: { below: 0.35, haste: 1.25, armor: 0.2 } } },
  weapon: { name: 'Hỏa Tiêm Thương', cd: 0.3, dmg: 95, speed: 34, range: 11, r: 0.2, vis: 'dart' },
  skills: [
    { id: 'cankhon', name: 'Càn Khôn Quyển', cd: 8, do: 'volley', n: 1, dmg: 210, speed: 26, range: 13, r: 0.45, pierce: true, ret: true, slow: 0.35, slowDur: 1.5, vis: 'disc' },
    { id: 'phonghoaluan', name: 'Phong Hỏa Luân', cd: 10, do: 'dash', dist: 9, speed: 32, dmg: 180, knock: 1.5, stun: 0 },
    { id: 'thiengiang', name: 'Thiên Giáng', cd: 40, do: 'leap', to: 'foe', cast: 14, pick: 4, flight: 0.55, radius: 3.2, dmg: 620, stun: 1 },
  ],
};
const OLD = { luondien: OLD_LUONDIEN, mangxa: OLD_MANGXA, natra: OLD_NATRA };
// Every tank of this lane in the match plays its old kit (the match must be fresh: nothing pressed yet).
export function oldK17(m) {
  for (const u of m.units) {
    const K = OLD[u.mech];
    if (!K) continue;
    u.def = { ...u.def, passive: K.passive, weapon: K.weapon, skills: K.skills, tfWeapon: {}, energy: K.energy };
    if (K.stats) Object.assign(u.def, K.stats);
    u.passive = K.passive.do; u.en = 0;
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
const UNG = MECHS.ung;
const blows = (ev, id, by, min = 20) => only(ev, 'hit', (e) => e.id === id && e.by === by && e.amt + e.absorbed >= min);
const orbs = (m, id) => m.zones.filter((z) => z.ldOrb && z.owner === id);

export function runK17Cases(check, section) {
  section('K17 kit lane k17: Razor, Medusa, Na Tra ported from the owner\'s clips (p51, p42, p64) and their G5 mechanics (literal expected values)');

  // ---- Razor (luondien), clip p51 ----
  const LD = MECHS.luondien, [LQ, LE, LU] = LD.skills, O = LD.passive.ldOrb;
  // a lash: 150, +5 energy on a hit
  {
    const m = arena([[R('luondien', 0), 0, 0], [R('ung', 1), 6, 0]]), [a, v] = m.units;
    a.en = 100;
    const ev = go(m, 10, (i) => ({ 0: { fire: i === 0, tx: 6, tz: 0 } }));
    const b = blows(ev, 1, 0);
    check('K17-a Roi Dien: one lash of 150, and 5 energy back on the hit (100 + regen 10 per 3 s)', b.length === 1 && near(b[0].amt, 150, 1e-6) && near(a.en, 100 + 5 + (10 / 3) * 10 * TICK, 1e-6), `${b.map((e) => e.amt)} en ${a.en}`);
  }
  // passive: a press drops an orb about 2.5 m behind the aim; it needs 0.4 s to arm
  {
    const m = arena([[R('luondien', 0), 0, 0], [R('ung', 1), 20, 0]]), a = m.units[0];
    go(m, 1, () => ({ 0: { s2: true, tx: 10, tz: 0 } }));
    const z = orbs(m, 0)[0];
    check('K17-b passive: a press drops one lightning orb (vis ldOrb, r 1.1, 8 s) 2.5 m behind the aim', orbs(m, 0).length === 1 && z.vis === 'ldOrb' && z.r === O.r && z.dur === O.dur && near(Math.hypot(z.x - a.x, z.z - a.z), O.dist, 0.05) && z.x < 0, z && `${z.x} ${z.z}`);
    put(a, z.x, z.z);
    go(m, 3);
    check('K17-c ... not taken before it arms (0.4 s)', orbs(m, 0).length === 1 && !(a.ldN > 0));
    a.hp = 1000; a.en = 50; a.cd.ult = 20; const cdS2 = a.cd.s2, hp0 = a.hp;
    const ev = go(m, 12);
    const k = only(ev, 'k17', (e) => e.kind === 'orb');
    check('K17-d Razor takes his own orb: haste x1.5 for 2 s, +5% max hp, +10 energy, one +5% stack, cooldowns cut by 5% of their length',
      k.length === 1 && orbs(m, 0).length === 0 && a.hasteF === O.haste && a.hasteT > 1.5 && a.ldN === 1 && a.ldT > 2.5 && a.hp - hp0 >= LD.hp * O.heal - 1e-6 && a.en >= 60 && a.cd.ult < 20 - LU.cd * O.cdr + 1e-6 && a.cd.ult > 18 - LU.cd * O.cdr && a.cd.s2 < cdS2 - LE.cd * O.cdr,
      `${k.length} haste ${a.hasteF} ldN ${a.ldN} hp +${a.hp - hp0} en ${a.en} ult ${a.cd.ult}`);
    for (let i = 0; i < 5; i++) { a.cd.s2 = 0; a.gap1 = 0; a.use1 = 0; go(m, 1, () => ({ 0: { s2: true, tx: 10, tz: 0 } })); go(m, 1); }
    check('K17-e at most 4 orbs lie on the ground (the oldest goes)', orbs(m, 0).length === O.max, `${orbs(m, 0).length}`);
  }
  // an enemy taking the orb is confused 1 s, and the orb still pays Razor
  {
    const m = arena([[R('luondien', 0), 0, 0], [R('ung', 1), 20, 0]]), [a, v] = m.units;
    go(m, 1, () => ({ 0: { s2: true, tx: 10, tz: 0 } }));
    const z = orbs(m, 0)[0];
    go(m, 14);
    put(v, z.x, z.z);
    go(m, 1);
    check('K17-f an enemy on the orb is confused 1 s (G3 loc confuse) and Razor still gets a stack', LOC_KINDS[v.locK] === 'confuse' && v.locT > 0.9 && a.ldN === 1 && orbs(m, 0).length === 0, `${LOC_KINDS[v.locK]} ${v.locT} ${a.ldN}`);
  }
  // Lôi Vân Hãm Tịnh: 321 in 2.6 m at the cursor after 0.45 s, root 1 s; two uses 3 s apart; x1.1 with two orb stacks
  {
    const m = arena([[R('luondien', 0), 0, 0], [R('ung', 1), 8, 0]]), [a, v] = m.units;
    const ev = go(m, 20, (i) => ({ 0: { s2: i === 0, tx: 8, tz: 0 } }));
    const b = blows(ev, 1, 0);
    check('K17-g Loi Van Ham Tinh: 321 on the foe at the cursor, rooted 1 s', b.length === 1 && near(b[0].amt, LE.dmg, 1e-6) && v.rootT > 0.6, `${b.map((e) => e.amt)} root ${v.rootT}`);
    check('K17-h ... a second use is stored but waits out the 3 s gap', a.use1 === 1 && !skillReady(a, 1) && a.gap1 > 2, `use ${a.use1} gap ${a.gap1}`);
    go(m, 80);
    a.ldN = 2; a.ldT = 3; v.hp = v.maxHp;
    const ev2 = go(m, 20, (i) => ({ 0: { s2: i === 0, tx: 8, tz: 0 } }));
    const b2 = blows(ev2, 1, 0);
    check('K17-i ... the second use with two orb stacks: 321 x 1.1', b2.length === 1 && near(b2[0].amt, LE.dmg * 1.1, 1e-6), `${b2.map((e) => e.amt)}`);
  }
  // Điện Từ Can Nhiễu: two pulses 1 s apart, 300 then 375 (falloff with distance), confused 1.5 s and weakened x0.5 each time
  {
    const m = arena([[R('luondien', 0), 0, 0], [R('ung', 1), 2, 0]]), [a, v] = m.units;
    const ev = go(m, 45, (i) => ({ 0: { ult: i === 0 } }));
    const b = blows(ev, 1, 0), f = (e) => 1 - 0.5 * Math.min(1, Math.hypot(e.x - a.x, e.z - a.z) / LU.radius);
    check('K17-j Dien Tu Can Nhieu: 300 then 375 (x falloff where the foe stood), the foe confused and weakened x0.5', b.length === 2 && near(b[0].amt, 300 * f(b[0]), 1e-6) && near(b[1].amt, 375 * f(b[1]), 1e-6) && LOC_KINDS[v.locK] === 'confuse' && v.weakenF === 0.5, `${b.map((e) => e.amt)} ${LOC_KINDS[v.locK]} ${v.weakenF}`);
  }
  // Điện Năng Chuyển Hoán: standing still heals 10% of the lost hp a second, 50 energy a second, skill damage taken x0.5
  {
    const m = arena([[R('luondien', 0), 0, 0], [R('ung', 1), 20, 0]]), a = m.units[0];
    a.hp = 900;
    go(m, 1, () => ({ 0: { s1: true } }));
    const en1 = a.en, lost1 = a.maxHp - a.hp;
    go(m, 30);
    check('K17-k channel: 1 s heals the lost hp down by x0.9 (per tick), drains 50 energy (+ regen)', a.tfT > 0 && near(a.maxHp - a.hp, lost1 * (1 - 0.1 * TICK) ** 30, 1e-6) && near(a.en, en1 - 50 + 10 / 3, 1e-6) && a.gvT > 0 && a.gvK === 'skill' && a.gvF === 0.5,
      `tf ${a.tfT} lost ${a.maxHp - a.hp} vs ${lost1 * (1 - 0.1 * TICK) ** 30} en ${a.en} gv ${a.gvT} ${a.gvK}`);
    const ev = go(m, 2, () => ({ 0: { mx: 1 } }));
    check('K17-l ... moving himself ends it at once (event k17 chanEnd)', !(a.tfT > 0) && only(ev, 'k17', (e) => e.kind === 'chanEnd').length === 1, `tf ${a.tfT}`);
    const k = arena([[R('luondien', 0), 0, 0], [R('ung', 1), 20, 0]]), c = k.units[0];
    c.en = 60;
    go(k, 1, () => ({ 0: { s1: true } }));
    go(k, 45);
    check('K17-m ... the energy running dry ends it (60 - 10 = 50 lasts about 1 s)', !(c.tfT > 0) && c.en < 3, `tf ${c.tfT} en ${c.en}`);
    const s = arena([[R('luondien', 0), 0, 0], [R('ung', 1), 20, 0]]), d = s.units[0];
    go(s, 1, () => ({ 0: { s1: true } }));
    d.stunT = 0.5;
    go(s, 1);
    check('K17-n ... a stun ends it', !(d.tfT > 0));
  }
  // ---- Medusa (mangxa), clip p42 ----
  const MX = MECHS.mangxa, [MQ, ME, MU] = MX.skills;
  // Nanh Độc: 150, steals 5 energy, one curse mark; five marks petrify 0.5 s
  {
    const m = arena([[R('mangxa', 0), 0, 0], [R('luondien', 1), 6, 0]]), [a, v] = m.units;
    a.en = 100; v.en = 200;
    const ev = go(m, 10, (i) => ({ 0: { fire: i === 0, tx: 6, tz: 0 } }));
    const b = blows(ev, 1, 0), F = 1 - MECHS.luondien.armor;
    check('K17-o Nanh Doc: 150 x armour, 5 energy stolen (200 -> 195, then regen; Medusa 100 -> 105 + regen), one curse mark', b.length === 1 && near(b[0].amt, 150 * F, 1e-6) && v.en >= 195 && v.en < 196.7 && near(a.en, 105 + 5 * 10 * TICK, 1e-6) && v.stkN === 1 && v.stkBy === 0,
      `${b.map((e) => e.amt)} en ${v.en} / ${a.en} marks ${v.stkN}`);
    check('K17-p ... each mark takes 0.02 armour off', near(v.stkShred, 0.02, 1e-9), `${v.stkShred}`);
    v.stkN = 4; v.stkT = 2; a.cd.fire = 0;
    const ev2 = go(m, 10, (i) => ({ 0: { fire: i === 0, tx: 6, tz: 0 } }));
    check('K17-q ... the fifth mark petrifies 0.5 s (G3 loc petrify) and clears', LOC_KINDS[v.locK] === 'petrify' && v.locT > 0.1 && v.stkN === 0 && only(ev2, 'stacks').length === 1, `${LOC_KINDS[v.locK]} ${v.locT} ${v.stkN}`);
  }
  // Tử Vong Ngưng Thị: 0.5 s later the 7 m cone in front is petrified 1 s and takes 281; behind her nothing
  {
    const m = arena([[R('mangxa', 0), 0, 0], [R('ung', 1), 3, 0], [R('ung', 1), -3, 0]]), [a, v, back] = m.units;
    const ev = go(m, 20, (i) => ({ 0: { s1: i === 0 } }));
    const b = blows(ev, 1, 0), f = 1 - 0.5 * 3 / MQ.radius;
    check('K17-r Tu Vong Ngung Thi: 281 (falloff at 3 m) after 0.5 s, petrified 1 s; the foe behind untouched', b.length === 1 && near(b[0].amt, MQ.dmg * f, 1e-6) && LOC_KINDS[v.locK] === 'petrify' && v.locT > 0.8 && back.hp === back.maxHp,
      `${b.map((e) => e.amt)} ${LOC_KINDS[v.locK]} ${v.locT} back ${back.hp}`);
    check('K17-s ... the blow lands at the end of the 0.5 s wind-up', only(ev, 'nova').length === 1 && !a.cast);
  }
  // Bí Thuật Dị Xà: 227 on the first, then four bites one after another, each x1.1; each bite cuts 1 s (10%) off the recharge
  {
    const m = arena([[R('mangxa', 0), 0, 0], [R('ung', 1), 5, 0], [R('ung', 1), 9, 0], [R('ung', 1), 13, 0], [R('ung', 1), 13, 5], [R('ung', 1), 13, 10], [R('ung', 1), 13, 16]]);
    const [a] = m.units;
    const ev = go(m, 20, (i) => ({ 0: { s2: i === 0, tx: 5, tz: 0 } }));
    const got = [1, 2, 3, 4, 5, 6].map((id) => blows(ev, id, 0).reduce((t, e) => t + e.amt, 0));
    const want = [227, 227 * 1.1, 227 * 1.21, 227 * 1.331, 227 * 1.4641, 0];
    check('K17-t Bi Thuat Di Xa: 227, then 249.7, 274.7, 302.1, 332.4 down the chain (6 m hops), the sixth never', got.every((g, i) => near(g, want[i], 1e-6)), JSON.stringify(got));
    check('K17-u ... five bites cut the recharge by 5 x 1 s (10 - elapsed - 5)', near(a.cd.s2, ME.cd - 19 * TICK - 5, 1e-6) && a.use1 === 1, `cd ${a.cd.s2} use ${a.use1}`);
  }
  // Ma Xà Chi Xúc: the ward turns away skill damage, kept up by the energy spent; three snakes every 0.25 s; same-target x0.9
  {
    const m = arena([[R('mangxa', 0), 0, 0], [R('ung', 1), 6, 0], [R('luondien', 1), 3, 4]]), [a, v, z] = m.units;
    a.en = 150;
    const ev = go(m, 30, (i) => ({ 0: { ult: i === 0, tx: 6, tz: 0 } }));
    check('K17-v Ma Xa Chi Xuc: the ward is up (guard 1 vs skill) and the cooldown stands full while the snakes fly', a.mdWT > 0.5 && a.gvF === 1 && a.gvK === 'skill' && !!a.cast && a.cd.ult === MU.cd, `ward ${a.mdWT} gv ${a.gvF} ${a.gvK} cd ${a.cd.ult}`);
    const b = blows(ev, 1, 0);
    check('K17-w ... the bites on one mech of one press: 150, then x0.9 each', b.length >= 3 && near(b[0].amt, 150, 1e-6) && near(b[1].amt, 135, 1e-6) && near(b[2].amt, 121.5, 1e-6), `${b.map((e) => e.amt)}`);
    const hp0 = a.hp; z.cd.s2 = 0; z.use1 = 0; z.gap1 = 0;
    const ev2 = go(m, 20, (i) => ({ 2: { s2: i === 0, tx: 0, tz: 0 } }));
    check('K17-x ... an enemy skill (Razor\'s trap) lands on her for nothing', a.hp >= hp0 && blows(ev2, 0, 2, 1).length === 0 && only(ev2, 'hit', (e) => e.id === 0 && e.by === 2).length >= 1, `hp ${hp0} -> ${a.hp}`);
    let n = 0; while (a.cast && n < 200) { go(m, 1); n++; }
    check('K17-y ... 125 energy (150 - 25) runs dry after about 2.5 s; the ward lasts up to 1 s more, then the cooldown runs', a.en < 3 && a.mdWT > 0.5 && a.mdWT <= 1.1 && a.cd.ult === MU.cd, `en ${a.en} ward ${a.mdWT} cd ${a.cd.ult} after ${n}`);
    go(m, 40);
    check('K17-z ... the ward is down after it, the cooldown counts', a.mdWT === 0 && !(a.gvT > 0) && a.cd.ult < MU.cd, `ward ${a.mdWT} gv ${a.gvT} cd ${a.cd.ult}`);
  }
  // ---- Na Tra (natra), clip p64 ----
  const NA = MECHS.natra, [NQ, NE, NU] = NA.skills, NP = NA.passive;
  // Hỏa Tiêm Thương: one 150 thrust
  {
    const m = arena([[R('natra', 0), 0, 0], [R('ung', 1), 6, 0]]);
    const b = blows(go(m, 10, (i) => ({ 0: { fire: i === 0, tx: 6, tz: 0 } })), 1, 0);
    check('K17-na Hoa Tiem Thuong: one thrust of 150', b.length === 1 && near(b[0].amt, 150, 1e-6), `${b.map((e) => e.amt)}`);
  }
  // Hỗn Thiên Lăng: 254 and a 1 s wrap on the first, through a wall; 1 s later the foes within 3.5 m of it are wrapped too
  {
    const m = arena([[R('natra', 0), 0, 0], [R('ung', 1), 7, 0], [R('ung', 1), 7, 3], [R('ung', 1), 7, 8]]), [a, v, n2, far] = m.units;
    m.map.walls.push({ x0: 3, x1: 3.6, z0: -2, z1: 2, h: 2, kind: 'wall' });
    const ev = go(m, 12, (i) => ({ 0: { s1: i === 0, tx: 7, tz: 0 } }));
    const b = blows(ev, 1, 0);
    check('K17-nb Hon Thien Lang: through the wall, 254 on the first foe, wrapped (rooted 1 s); the one beside it not yet', b.length === 1 && near(b[0].amt, NQ.dmg, 1e-6) && v.rootT > 0.7 && !(n2.rootT > 0), `${b.map((e) => e.amt)} root ${v.rootT} ${n2.rootT}`);
    const ev2 = go(m, 32);
    const w = only([...ev, ...ev2], 'k17', (e) => e.kind === 'wrap');
    check('K17-nc ... 1 s later the foe 3 m from it is wrapped too, the one 8 m off is not', n2.rootT > 0.5 && !(far.rootT > 0) && w.length === 2 && w[1].on === n2.id, `${n2.rootT} ${far.rootT} wraps ${w.map((e) => e.on)}`);
    v.rootT = 0; a.cd.s1 = 0;
    const b2 = blows(go(m, 12, (i) => ({ 0: { s1: i === 0, tx: 7, tz: 0 } })), 1, 0);
    check('K17-nd ... wrapped again inside 5 s: hurt, not rooted', b2.length === 1 && !(v.rootT > 0), `${b2.length} root ${v.rootT}`);
  }
  // Càn Khôn Quyển: 318 and a decaying 50% slow on the first foe, the ring turns home; caught, the cooldown drops to 1.5 s
  {
    const m = arena([[R('natra', 0), 0, 0], [R('ung', 1), 5, 0], [R('ung', 1), 8, 0]]), [a, v, back] = m.units;
    const ev = go(m, 40, (i) => ({ 0: { s2: i === 0, tx: 5, tz: 0 } }));
    const b = blows(ev, 1, 0), c = only(ev, 'k17', (e) => e.kind === 'catch');
    check('K17-ne Can Khon Quyen: 318 on the first foe, slowed (decaying), the foe behind it untouched', b.length === 1 && near(b[0].amt, NE.dmg, 1e-6) && v.slowG > 0 && back.hp === back.maxHp, `${b.map((e) => e.amt)} slowG ${v.slowG} back ${back.hp}`);
    check('K17-nf ... the ring came home and was caught: cooldown 1.5 s or less, no shot left', c.length === 1 && a.cd.s2 <= NE.naCatch + 1e-9 && m.shots.length === 0, `catch ${c.length} cd ${a.cd.s2} shots ${m.shots.length}`);
    const x0 = a.x;
    go(m, 2, (i) => ({ 0: { s2: i === 1 } }));
    go(m, 12);
    check('K17-ng ... pressed again in the 3 s window: Phong Hoa Phi Luan runs 7 m along the aim', near(a.x - x0, NE.next.row.dist, 0.3), `moved ${a.x - x0}`);
    const k = arena([[R('natra', 0), 0, 0], [R('ung', 1), 0, 9]]), q = k.units[0];
    go(k, 40, (i) => ({ 0: { s2: i === 0, tx: 12, tz: 0 } }));
    check('K17-nh ... a ring that hits nobody does not come back: the full 10 s cooldown runs', q.cd.s2 > NE.cd - 40 * TICK - 1e-6 && k.shots.length === 0, `cd ${q.cd.s2}`);
  }
  // passive: after a press, skill damage x0.5 and cc half as long for 1.5 s; a stun heals 10% of the lost hp and cuts 10% of each cooldown
  {
    const m = arena([[R('natra', 0), 0, 0], [R('ung', 1), 20, 0]]), a = m.units[0];
    go(m, 1, () => ({ 0: { s2: true, tx: 5, tz: 0 } }));
    check('K17-ni Huyen Linh Than Uy: after the press, guard 0.5 vs skill for 1.5 s and the cc-halving window', a.gvT > 1.3 && a.gvK === 'skill' && a.gvF === 0.5 && a.naCcT > 1.3, `gv ${a.gvT} ${a.gvK} ${a.gvF} cc ${a.naCcT}`);
    a.hp = 1400; a.cd.ult = 20; const cd2 = a.cd.s2;
    a.stunT = 1; go(m, 1);
    check('K17-nj ... a 1 s stun then lasts 0.5 s; Hong Lien: +10% of the lost hp, cooldowns cut by 10% of their length', near(a.stunT, 0.5, 0.04) && a.hp > 1400 + 0.1 * 1000 - 1 && near(a.cd.ult, 20 - NU.cd * 0.1 - TICK, 0.01) && a.cd.s2 < cd2 - NE.cd * 0.1 + 1e-6,
      `stun ${a.stunT} hp ${a.hp} ult ${a.cd.ult}`);
    a.stunT = 0; go(m, 60);
    a.stunT = 1; go(m, 1);
    check('K17-nk ... out of the window a stun lasts in full (and Hong Lien waits its 3 s)', a.stunT > 0.9, `${a.stunT}`);
  }
  // passive: each enemy skill hit gives a +10% speed and fire-rate stack for 3 s, up to 5
  {
    const m = arena([[R('natra', 0), 0, 0], [R('luondien', 1), 8, 0]]), [a, z] = m.units;
    go(m, 20, (i) => ({ 1: { s2: i === 0, tx: 0, tz: 0 } }));
    check('K17-nl ... an enemy skill hit: one stack, speed and fire rate x1.1', a.naN === 1 && near(a.hasteF, 1.1, 1e-9) && near(a.rapidF, 1.1, 1e-9) && a.hasteT > 2.4, `n ${a.naN} haste ${a.hasteF} rapid ${a.rapidF}`);
  }
  // Tam Đầu Lục Tý: jump to the cursor, 315 x 1.2 on landing, antiheal; max hp x1.2 plus 10% per foe hit; nine-way thrusts; the cooldown waits
  {
    const m = arena([[R('natra', 0), 0, 0], [R('ung', 1), 8, 0], [R('ung', 1), 8.5, 1.5]]), [a, v, w] = m.units;
    a.hp = 1200;
    const ev = go(m, 25, (i) => ({ 0: { ult: i === 0, tx: 8, tz: 0 } }));
    const b = [...blows(ev, 1, 0), ...blows(ev, 2, 0)];
    check('K17-nm Tam Dau Luc Ty: lands at the cursor, both foes hit (315 x 1.2 x falloff), half heals for 3 s', Math.hypot(a.x - 8, a.z) < 2 && b.length === 2 && b.every((e) => e.amt > 315 * 1.2 * 0.5 && e.amt <= 315 * 1.2 + 1e-6) && v.ahT > 2.5 && v.ahF === 0.5, `x ${a.x} ${b.map((e) => e.amt)} ah ${v.ahT}`);
    check('K17-nn ... max hp 2400 x (1 + 0.2 + 2 x 0.1) = 3360, damage factor 1.2 + 0.2, the ult cooldown held', near(a.maxHp, NA.hp * 1.4, 1e-6) && near(a.tfDmg, 1.4, 1e-9) && a.tfT > 10 && a.cd.ult === NU.cd, `max ${a.maxHp} dmg ${a.tfDmg} cd ${a.cd.ult}`);
    put(v, 40, 30); put(w, 40, -30); a.cd.fire = 0;
    go(m, 1, () => ({ 0: { fire: true } }));
    check('K17-no ... the weapon thrusts nine ways round him, 75 each', m.shots.filter((s) => s.owner === 0).length === 9 && near(m.shots.find((s) => s.owner === 0).dmg, 75 * 1.4, 1e-6), `${m.shots.filter((s) => s.owner === 0).length}`);
    a.cd.s1 = 0;
    go(m, 1, () => ({ 0: { s1: true, tx: 14, tz: 0 } }));
    check('K17-np ... Hon Thien Lang throws three silks in the form', m.shots.filter((s) => s.owner === 0 && s.vis === 'link').length === 3);
    go(m, 12 * 30);
    check('K17-nq ... the form ends: max hp back to 2400, the cooldown counts', near(a.maxHp, NA.hp, 1e-9) && a.hp <= a.maxHp && a.cd.ult < NU.cd && !(a.tfT > 0), `max ${a.maxHp} hp ${a.hp} cd ${a.cd.ult}`);
  }
  // a death in the form gives the plain max hp back
  {
    const m = arena([[R('natra', 0), 0, 0], [R('ung', 1), 8, 0]]), [a] = m.units;
    go(m, 25, (i) => ({ 0: { ult: i === 0, tx: 8, tz: 0 } }));
    a.hp = 1; a.invulnT = 0; a.ccT = 0; put(m.units[1], a.x - 5, a.z);
    m.units[1].cd.fire = 0;
    for (let i = 0; i < 60 && a.alive; i++) step(m, m.units.map((u, j) => inp({ aim: Math.atan2(a.z - u.z, a.x - u.x), fire: j === 1, tx: a.x, tz: a.z })));
    check('K17-nr ... dying in the form: max hp is the plain 2400 again', !a.alive && near(a.maxHp, NA.hp, 1e-9), `alive ${a.alive} max ${a.maxHp}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0, passed = 0;
  runK17Cases((name, cond, detail = '') => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); } }, (s) => console.log(`\n# ${s}`));
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
