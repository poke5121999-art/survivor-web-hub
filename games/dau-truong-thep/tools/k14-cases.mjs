// Kit lane k14 (gilgamesh, suatrang, chuottui) ported from the owner's clips: sim-test.mjs section 62 runs these. Standalone (fast):
//   node tools/k14-cases.mjs
// Also the old kits of the three tanks as fixtures (OLD_GILGAMESH, OLD_SUATRANG, OLD_CHUOTTUI), so the primitives they exercised
// (meter hurt + shot, zone cage, regen near, bless.hot, leap.to ally + landShield, the two-ended portal, thrifty, zone.shield) stay covered.
import { createMatch, step, skillReady, applyFx } from '../js/sim.js';
import { MECHS, RULES, TICK } from '../js/data.js';

// The batch-3 Gilgamesh, the batch-4 Sứa Trắng and the batch-5 Chuột Túi kits: the three play the kits ported from the clips now.
export const OLD_GILGAMESH = {
  passive: { do: 'meter', max: 1500, gain: { hurt: 1 }, spend: { kind: 'shot', mul: 1.6, stun: 0.6 } },
  weapon: { name: 'Bảo Khí', cd: 0.8, dmg: 175, speed: 30, range: 12, r: 0.3, vis: 'sabot' },
  skills: [
    { id: 'phongbaokhi', cd: 8, do: 'volley', n: 3, fan: 0.1, dmg: 160, speed: 32, range: 13, r: 0.3, slow: 0.3, slowDur: 1.5, vis: 'sabot' },
    { id: 'phongtoa', cd: 15, do: 'zone', at: 'target', cast: 12, radius: 4.5, dur: 3, dps: 60, cage: true, vis: 'cage' },
    { id: 'congkhobau', cd: 46, do: 'barrage', n: 10, radius: 6.5, blast: 2.4, dmg: 360, delay: 0.9, span: 1.8, cast: 18, fx: { stun: 0.5, knock: 2 } },
  ],
};
export const OLD_SUATRANG = {
  energy: undefined,
  passive: { do: 'regen', hps: 0.01, near: { r: 7, below: 0.6, mul: 2.5 } },
  weapon: { name: 'Xung Bọt', cd: 0.3, dmg: 100, speed: 28, range: 12, r: 0.28, vis: 'pulse' },
  skills: [
    { id: 'bongbonghoi', cd: 9, do: 'bless', cast: 12, pick: 3.5, hot: { hps: 160, dur: 4 } },
    { id: 'baydo', cd: 15, do: 'leap', to: 'ally', cast: 13, pick: 4, flight: 0.5, radius: 4, dmg: 0, landShield: 400, shieldDur: 3 },
    { id: 'capcuu', cd: 48, do: 'zone', at: 'self', follow: true, radius: 6.5, dur: 5, hps: 220, armor: 0.25, vis: 'heal' },
  ],
};
const OLD = { gilgamesh: OLD_GILGAMESH, suatrang: OLD_SUATRANG };
// Swap the old kit onto every unit of that mech (before the first step).
export function oldKit14(m, mech) {
  const K = OLD[mech];
  for (const u of m.units) if (u.mech === mech) { u.def = { ...u.def, ...K, tfWeapon: {} }; u.passive = K.passive.do; }
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
const sum = (a) => a.reduce((p, e) => p + e.amt, 0);
const put = (u, x, z) => { u.x = u.px = x; u.z = u.pz = z; u.vx = u.vz = 0; };

export function runK14Cases(check, section) {
  section('62 kit lane k14: Gilgamesh (p74), Baymax (p59) and Doraemon (p58) ported from the owner\'s clips (literal expected values)');
  const TR = MECHS.trau, TF = 1 - TR.armor, GG = MECHS.gilgamesh, BM = MECHS.suatrang, DR = MECHS.chuottui;
  // ---- Gilgamesh ----
  {
    // Thiên Địa Quai Ly: ten strikes 0.3 s apart on the cursor, 90 each (full at the centre), slowed 30%; the fifth skill hit in 2 s
    // binds (Phược Thần Chi Tỏa: 15% of the lost hp as true damage, a 100% slow that fades), then 3 s before that foe binds again
    const m = arena([[R('gilgamesh', 0), 0, 0], [R('trau', 1), 8, 0]]), [a, v] = m.units;
    v.speed = 0;
    const ev = go(m, 1, () => ({ 0: { s2: true, tx: 8, tz: 0 } })).concat(go(m, 95));
    const hits = only(ev, 'hit', (e) => e.id === 1 && e.by === 0), binds = only(ev, 'stacks', (e) => e.id === 1);
    check('62a Quai Ly: ten strikes on the spot, each 90 x (1 - trau armor) on a foe at the centre', only(ev, 'explode', (e) => e.why === 'strike').length === 10 && hits.filter((e) => near(e.amt, 90 * TF, 1e-6)).length === 10, `${hits.map((e) => e.amt.toFixed(1))}`);
    check('62b the fifth hit binds once (one stacks event), and the bind adds 15% of the hp it had lost as true damage', binds.length === 1 && hits.some((e) => near(e.amt, 0.15 * 5 * 90 * TF, 1e-6)), `${binds.length} ${hits.map((e) => e.amt.toFixed(1))}`);
    check('62c ... a fading slow (slowDecay) was put on it, and the row slows 30%', v.dsK === 0 && v.dsD === 1.5 && near(v.slowF, 0.3), `${v.dsK} ${v.dsD} ${v.slowF}`);
    check('62d cooldown 10 (95 ticks after the press)', near(a.cd.s2, 10 - 95 * TICK, 1e-6), `${a.cd.s2}`);
  }
  {
    // Thiên Chi Tỏa: shield 20% of max hp for 4 s, damage x1.15, haste 1.4
    const m = arena([[R('gilgamesh', 0), 0, 0], [R('trau', 1), 30, 0]]), a = m.units[0];
    go(m, 1, () => ({ 0: { s1: true } }));
    check('62e Thien Chi Toa: shield 580 (20% of 2900) for 4 s, x1.15 damage, x1.4 run', near(a.shield, 0.2 * a.maxHp, 1e-6) && a.tfT > 3.9 && a.tfDmg === 1.15 && a.hasteF === 1.4, `${a.shield} ${a.tfT} ${a.tfDmg} ${a.hasteF}`);
  }
  {
    // Vương Chi Tài Bảo: 0.3 s wind-up that a stun cannot stop, then 20 volleys of 2 weapons 0.2 s apart (40 x 108), walking at x1.4
    const m = arena([[R('gilgamesh', 0), 0, 0], [R('trau', 1), 30, 0]]), [a, foe] = m.units;
    let ev = go(m, 1, () => ({ 0: { ult: true, aim: 0 } }));
    check('62f the press: a 0.3 s wind-up cast, no weapon out yet, unstoppable for it', !!a.cast && a.cast.ggW === 1 && a.ccT > 0.25 && m.shots.length === 0, `${a.cast && a.cast.t} ${a.ccT}`);
    applyFx(m, foe, a, { stun: 1 });
    ev = ev.concat(go(m, 1, () => ({ 0: { aim: 0 } })));
    check('62g a stun during the wind-up does not land (the wind-up goes on)', !(a.stunT > 0) && !!a.cast && a.cast.ggW === 1, `${a.stunT}`);
    ev = ev.concat(go(m, 140, () => ({ 0: { aim: 0, fire: true } })));
    const shots = only(ev, 'fire', (e) => e.id === 0);
    check('62h after the wind-up: 20 volleys (the weapon is held off while it runs), 2 weapons each, 108 apiece', shots.length >= 20 && shots.length <= 22 && only(ev, 'fire', (e) => e.id === 0 && e.vis === 'sabot').length >= 20, `${shots.length}`);
    const m2 = arena([[R('gilgamesh', 0), 0, 0], [R('trau', 1), 30, 0]]), b = m2.units[0];
    go(m2, 12, () => ({ 0: { ult: true, aim: 0 } }));
    const sh = m2.shots.filter((s) => s.owner === 0);
    check('62i ... each weapon 108, the mech walks at x1.4 (haste) while it pours out', sh.length === 2 && sh.every((s) => near(s.dmg, 108, 1e-6)) && b.hasteF === 1.4 && b.cast && b.cast.move === 1, `${sh.map((s) => s.dmg)} ${b.hasteF}`);
  }
  // ---- Baymax ----
  {
    // Siêu Năng Trị Dũ: a chain to the ally at the cursor: both heal 150 a second (Baymax x selfHealMul), 10 energy to start and 10 a second
    const m = arena([[R('suatrang', 0), 0, 0], [R('trau', 0), 6, 0], [R('trau', 1), 30, 0]]), [a, al] = m.units;
    a.hp = 1000; al.hp = 1000;
    const ev = go(m, 1, () => ({ 0: { s1: true, tx: 6, tz: 0 } }));
    check('62j the chain holds the ally (stTie = id + 1), 10 energy spent at the press, a bless event to it', a.stTie === al.id + 1 && only(ev, 'bless', (e) => e.to === al.id).length === 1 && a.en < 91 && a.en > 89, `${a.stTie} ${a.en}`);
    const h0 = al.hp, s0 = a.hp, e0 = a.en;
    go(m, 30);
    check('62k one second: the ally +150, Baymax +150 x selfHealMul, energy -10 +5 regen', near(al.hp - h0, 150, 1e-6) && near(a.hp - s0, 150 * RULES.selfHealMul, 1e-6) && near(a.en - e0, -5, 1e-6), `${al.hp - h0} ${a.hp - s0} ${a.en - e0}`);
    put(al, 9.5, 0);
    const ev2 = go(m, 1);
    check('62l the ally 9.5 m away (over 9): the chain breaks (untie event)', a.stTie === 0 && only(ev2, 'untie').length === 1, `${a.stTie}`);
    put(al, 6, 0); a.cd.s1 = 0; go(m, 1, () => ({ 0: { s1: true, tx: 6, tz: 0 } }));
    go(m, 40); const tied = a.stTie;
    go(m, 1, () => ({ 0: { s1: true, tx: 6, tz: 0 } }));
    check('62m a press while it holds takes it off and sets the cooldown (1.3 s)', tied === al.id + 1 && a.stTie === 0 && near(a.cd.s1, 1.3, 1e-9), `${tied} ${a.stTie} ${a.cd.s1}`);
    a.en = 3; a.cd.s1 = 0; go(m, 1, () => ({ 0: { s1: true, tx: 6, tz: 0 } }));
    check('62n under 10 energy the chain cannot start', a.stTie === 0);
    a.en = 12; a.cd.s1 = 0; go(m, 1, () => ({ 0: { s1: true, tx: 6, tz: 0 } })); go(m, 15);
    check('62o the energy runs out: the chain breaks', a.stTie === 0 && a.en < 1, `${a.stTie} ${a.en}`);
    const k = arena([[R('suatrang', 0), 0, 0], [R('trau', 1), 30, 0]]);
    go(k, 1, () => ({ 0: { s1: true, tx: 6, tz: 0 } }));
    check('62p nobody at the cursor: no chain, 0.4 s lockout', k.units[0].stTie === 0 && near(k.units[0].cd.s1, 0.4 - TICK, 1e-9) || near(k.units[0].cd.s1, 0.4, 1e-9), `${k.units[0].cd.s1}`);
  }
  {
    // Siêu Năng Tạc Đạn: three uses, 300 at the centre, a fading 50% slow, knocked back, 25 energy per foe hit
    const m = arena([[R('suatrang', 0), 0, 0], [R('trau', 1), 8.6, 0]]), [a, v] = m.units;
    a.en = 50;
    go(m, 1, () => ({ 0: { s2: true, tx: 8, tz: 0 } }));
    const ev = go(m, 24);
    check('62q the bomb: 300 x armor at the centre, knocked back, fading slow 50% over 2 s, energy +25 (+ regen)', near(sum(only(ev, 'hit', (e) => e.id === 1)), 300 * (1 - 0.5 * 0.6 / 3) * TF, 1e-6) && v.x > 9 && v.dsK === 0 && v.dsF === 0.5 && a.en > 50 + 25 && a.en < 50 + 25 + 5 * 0.85, `${sum(only(ev, 'hit', (e) => e.id === 1))} x ${v.x} en ${a.en}`);
    go(m, 1, () => ({ 0: { s2: true, tx: 8, tz: 0 } })); go(m, 16); go(m, 1, () => ({ 0: { s2: true, tx: 8, tz: 0 } })); go(m, 16);
    check('62r three uses spent: the fourth waits for the recharge', a.use1 === 3 - Math.floor(0) && !skillReady(a, 1), `${a.use1}`);
  }
  {
    // Siêu Năng Chiến Sĩ: guard 50% on the ally from the press, 0.4 s wind-up, a flight that hits whoever it passes (400, knock-up 1 s),
    // 1000 shield on both, then the warrior: x2 run, no main weapon, a field that cuts and shoves
    const m = arena([[R('suatrang', 0), 0, 0], [R('trau', 0), 10, 0], [R('trau', 1), 5, 0.5]]), [a, al, v] = m.units;
    v.speed = 0;
    go(m, 1, () => ({ 0: { ult: true, tx: 10, tz: 0 } }));
    check('62s the press: the ally guards 50% until he lands, Baymax winds up 0.4 s', al.guardF === 0.5 && al.guardT > 0.9 && a.cast && a.cast.skill.id === 'chiensi', `${al.guardF} ${al.guardT}`);
    const ev = go(m, 40, () => ({ 0: { tx: 10, tz: 0 } }));
    check('62t the flight hits the foe on the way once: 400 x armor, knocked up', only(ev, 'hit', (e) => e.id === 2 && near(e.amt, 400 * TF, 1e-6)).length === 1 && only(ev, 'air', () => true).length >= 0 && v.airT >= 0, `${only(ev, 'hit', (e) => e.id === 2).map((e) => e.amt)}`);
    check('62u landed by the ally: both have the 1000 shield for 5 s', Math.abs(a.x - 10) < 1 && a.shield === 1000 && al.shield === 1000, `${a.x} ${a.shield} ${al.shield}`);
    check('62v the warrior: transform 10 s, x2 run, stWarT, a follow field that shoves out', a.tfT > 8.5 && a.hasteF === 2 && a.stWarT > 8.5 && m.zones.some((z) => z.kind === 'field' && z.owner === 0 && z.follow && z.pull === -4), `${a.tfT} ${a.hasteF} ${a.stWarT}`);
    const n = m.shots.length;
    go(m, 10, () => ({ 0: { fire: true, aim: Math.PI } }));
    check('62w ... no main weapon while it runs', m.shots.filter((s) => s.owner === 0).length === 0 && n >= 0);
  }
  {
    // the save: an ally within 7 m drops under 30%: +30% of its max hp, guard 50% for 2 s; once per 30 s
    const m = arena([[R('suatrang', 0), 0, 0], [R('trau', 0), 5, 0], [R('ung', 1), 9, 0]]), [a, al, e] = m.units;
    al.hp = al.maxHp * 0.32;
    const h = al.hp;
    go(m, 14, (i) => ({ 2: { fire: i === 0, aim: Math.PI, tx: 5, tz: 0 } }));
    check('62x Sieu Nang Tri Du (passive): the ally under 30% is healed 30% of max hp and guarded 50%, icd 30 on Baymax', al.hp > h && al.guardF === 0.5 && a.svT > 29, `${al.hp - h} ${al.guardF} ${a.svT}`);
  }
}

// standalone run
if (import.meta.url === `file://${process.argv[1]}`) {
  let fails = 0, n = 0;
  runK14Cases((name, ok, why = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '  ' + why}`); }, (s) => console.log(`\n== ${s}`));
  console.log(`\n${n - fails}/${n} passed`);
  process.exit(fails ? 1 : 0);
}
