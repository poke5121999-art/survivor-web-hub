// Kit lane K4 (tumay, enbac) ported from the owner's clips: sim-test.mjs section 61 runs these. Standalone (fast):
//   node tools/k4-cases.mjs
// Also the old kits of the two tanks as fixtures (OLD_TUMAY, OLD_ENBAC), so the primitives they exercised stay covered.
import { createMatch, step, skillReady, chaosOrbs } from '../js/sim.js';
import { MECHS, TICK } from '../js/data.js';
import { allInputs } from '../js/bots.js';

// The batch-3 Tư Mã Ý kit (calm meter, Ám Cầu, warp.leave, zone.blind) and the batch-2 Star Lord kit (ramp switch, rockets,
// onStart volley, barrage.channel): tumay and enbac play the kits ported from the clips now.
export const OLD_TUMAY = {
  passive: { do: 'meter', max: 4, gain: { calm: 1 }, spend: { kind: 'skill', mul: 1.5 }, resetOnHurt: true },
  weapon: { name: 'Hắc Cầu', cd: 0.45, dmg: 115, speed: 28, range: 13.5, r: 0.26, vis: 'pulse' },
  skills: [
    { id: 'amcau', cd: 7, do: 'volley', n: 1, dmg: 300, speed: 26, range: 14, r: 0.4, splash: 1.5, vis: 'pulse', fx: { reveal: 4 } },
    { id: 'kimthien', cd: 12, do: 'warp', dist: 7, leave: { hp: 500, dur: 5, blast: 3, dmg: 260 } },
    { id: 'mandem', cd: 44, do: 'zone', at: 'target', cast: 14, radius: 6.5, dur: 5, dps: 190, blind: { range: 0.5, spread: 0.15 }, vis: 'smoke' },
  ],
};
export const OLD_ENBAC = {
  passive: { do: 'ramp', on: 'hit', stat: 'dmg', step: 0.04, max: 8, dur: 2, reset: 'switch' },
  weapon: { name: 'Song Thương', cd: 0.18, dmg: 76, speed: 34, range: 13, spread: 0.04, r: 0.2, alt: 0.4, vis: 'bullet' },
  skills: [
    { id: 'loatkep', cd: 6, do: 'volley', n: 2, fan: 0.05, dmg: 210, speed: 34, range: 15, r: 0.24, splash: 1.6, vis: 'rocket' },
    { id: 'phanluc', cd: 10, do: 'dash', dist: 8, speed: 34, dmg: 0, onStart: { volley: { n: 3, fan: 0.25, dmg: 110, speed: 30, range: 10, r: 0.2, vis: 'bullet', back: true } } },
    { id: 'muadan', cd: 42, do: 'barrage', radius: 4, blast: 2.2, dmg: 180, delay: 0.5, cast: 14, channel: { dur: 3, every: 0.2, move: 0.8 } },
  ],
};
// Swap the old kit onto every unit of that mech (before the first step).
export function oldKit(m, mech) {
  const K = mech === 'tumay' ? OLD_TUMAY : OLD_ENBAC;
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
const pool = (m, u) => m.zones.find((z) => z.kind === 'orbit' && z.owner === u.id && z.mode === 'chaos');
const bits = (v) => { let n = 0; for (; v; v &= v - 1) n++; return n; };
const ground = (m, u) => m.zones.filter((z) => z.kind === 'orbit' && z.owner === u.id && z.mode === 'chaosG');
// no orb grows on its own from now on (the pool timer is held far back)
const freeze = (u) => { u.tmAcc = -1e9; };

export function runK4Cases(check, section) {
  section('61 kit lane K4: Tư Mã Ý (p12) chaos orbs and Star Lord (p18 飞翼) ported from the owner\'s clips (literal expected values)');
  const TM = MECHS.tumay, EB = MECHS.enbac, UNG = MECHS.ung, UF = 1 - UNG.armor;
  // ---- Tư Mã Ý ----
  {
    const m = arena([[R('tumay', 0), 0, 0], [R('ung', 1), 30, 0]]), a = m.units[0];
    go(m, 89);
    check('61a the chaos pool exists from the first tick, still empty just before 3 s', !!pool(m, a) && pool(m, a).live === 0 && pool(m, a).n === 7, `${pool(m, a) && pool(m, a).live}`);
    go(m, 2);
    check('61b ... one orb at 3 s', bits(pool(m, a).live) === 1);
    go(m, 600);
    check('61c ... at most 4 circling after 23 s (every 3 s up to max 4)', bits(pool(m, a).live) === 4 && chaosOrbs(m, a).length === 4, `${bits(pool(m, a).live)}`);
  }
  {
    // Hỗn Độn Pháp Cầu: 275 at the cursor after 0.5 s, a ground orb there for 8 s that bursts 275 at its end; 3 charges
    const m = arena([[R('tumay', 0), 0, 0], [R('ung', 1), 6, 0]]), [a, v] = m.units;
    freeze(a);
    go(m, 1, () => ({ 0: { s2: true, tx: 6, tz: 0 } }));
    check('61d one use of three spent, the slot still ready after the 0.5 s gap', a.use1 === 1 && near(a.cd.s2, 8, 1e-9), `${a.use1} ${a.cd.s2}`);
    const ev = go(m, 16);
    check('61e ... and ready again at 0.5 s', skillReady(a, 1));
    check('61f the strike lands: 275 x (1 - ung armor), a ground orb at (6, 0)', only(ev, 'hit', (e) => e.id === 1).length === 1 && near(UNG.hp - v.hp, 275 * UF) && ground(m, a).length === 1 && ground(m, a)[0].x === 6, `${UNG.hp - v.hp}`);
    const hp = v.hp, ev2 = go(m, 240), d = Math.hypot(v.x - 6, v.z);
    check('61g after 8 s the orb bursts round itself: another 275 x armor (the usual falloff) on the foe by it, nova event with orb, the orb gone', only(ev2, 'hit', (e) => e.id === 1).length === 1 && near(only(ev2, 'hit', (e) => e.id === 1)[0].amt, 275 * (1 - 0.5 * d / 2.5) * UF, 1e-3) && only(ev2, 'nova', (e) => e.orb && e.r === 2.5).length === 1 && ground(m, a).length === 0, `${only(ev2, 'hit').map((e) => e.amt)} d ${d} hp ${hp}`);
  }
  {
    // U Minh Khu Hổ: the cone hurts and knocks; an own orb inside flies off, hits for 306 + stun 1, plants an orb, cuts cooldowns 10%
    const m = arena([[R('tumay', 0), 0, 0], [R('ung', 1), 9, 0], [R('ung', 1), 2, 4.5]]), [a, v, side] = m.units;
    freeze(a);
    go(m, 1, () => ({ 0: { s2: true, tx: 3, tz: 0 } }));
    go(m, 20);
    check('61h the planted orb sits at (3, 0), nobody hurt', ground(m, a).length === 1 && v.hp === UNG.hp);
    const cdE = a.cd.s2;
    const ev = go(m, 1, () => ({ 0: { s1: true, aim: 0 } }));
    go(m, 5);
    const k = only(ev, 'orbKnock');
    check('61i the press spends one of two uses; the orb inside the cone is knocked (the side foe at 66 deg is outside the 0.7 rad arc)', a.use0 === 1 && side.hp === UNG.hp, `${a.use0} ${side.hp}`);
    const ev2 = go(m, 20), hits = only(ev2, 'hit', (e) => e.id === 1);
    check('61j the orb flies 6 m to the foe at 9 m: 306 x armor, stunned 1 s', ground(m, a).length >= 1 && hits.length === 1 && near(hits[0].amt, 306 * UF) && v.stunT > 0.2, `${hits.map((e) => e.amt)} stun ${v.stunT} knock ${k.length}`);
    const g = ground(m, a);
    check('61k ... a new ground orb where it hit, and every cooldown cut by 10% of its length (E: 0.8 s)', g.length === 1 && Math.abs(g[0].x - v.x) < 1.5 && near(a.cd.s2, cdE - 26 * TICK - 0.8, 1e-6), `${g.map((z) => z.x)} cd ${a.cd.s2} was ${cdE}`);
  }
  {
    // the nova itself: 275 x armor, knock and slow 50% on a foe 3 m in front
    const m = arena([[R('tumay', 0), 0, 0], [R('ung', 1), 3, 0]]), [a, v] = m.units;
    freeze(a);
    go(m, 1, () => ({ 0: { s1: true, aim: 0 } })); go(m, 6);
    check('61l U Minh Khu Ho: 275 x armor x 0.7 (falloff at 3 m of 5), slowed 50%, thrown back past 3 m', near(UNG.hp - v.hp, 275 * 0.7 * UF) && near(v.slowF, 0.5) && v.x > 3.2, `${UNG.hp - v.hp} ${v.slowF} ${v.x}`);
  }
  {
    // Hỗn Độn Chi Phệ: three orbs at the picked foe: 150 + 225 + 300, a heal of 75 per hit, the orbs spent
    const m = arena([[R('tumay', 0), 0, 0], [R('ung', 1), 8, 0]]), [a, v] = m.units;
    freeze(a); go(m, 1);
    pool(m, a).live = 7; a.hp = 1000;
    const ev = go(m, 1, () => ({ 0: { ult: true, tx: 8.5, tz: 1 } }));
    check('61m the press: three orb shots, the pool empty, cooldown 40', m.shots.filter((s) => s.k4Kind === 'devour').length === 3 && pool(m, a).live === 0 && near(a.cd.ult, 40, 1e-9), `${m.shots.length}`);
    const ev2 = go(m, 40), hits = only(ev2, 'hit', (e) => e.id === 1).map((e) => Math.round(e.amt / UF));
    check('61n they home on the foe: 150, 225, 300 x armor', hits.sort((p, q) => p - q).join() === '150,225,300', `${hits}`);
    check('61o ... and each hit healed 75 (3 x 75 = 225)', near(a.hp, 1225, 1e-6), `${a.hp}`);
  }
  {
    const m = arena([[R('tumay', 0), 0, 0], [R('ung', 1), 8, 0]]), a = m.units[0];
    freeze(a);
    go(m, 1, () => ({ 0: { ult: true, tx: 8, tz: 0 } }));
    check('61p no orb: the ult does not happen (0.4 s lockout, no shot)', a.cd.ult <= 0.4 && !m.shots.some((s) => s.k4Kind));
    pool(m, a).live = 1;
    go(m, 1, () => ({ 0: { ult: true, tx: -8, tz: 0 } }));
    check('61q no foe near the cursor: nothing either', pool(m, a).live === 1);
  }
  {
    // the orbs are stopped by the first foe in the way
    const m = arena([[R('tumay', 0), 0, 0], [R('ung', 1), 10, 0], [R('ung', 1), 5, 0]]), [a, v, b] = m.units;
    freeze(a); go(m, 1); pool(m, a).live = 1;
    go(m, 1, () => ({ 0: { ult: true, tx: 10, tz: 0 } })); go(m, 30);
    check('61r a foe in the way takes the orb meant for the target', b.hp < UNG.hp && v.hp === UNG.hp, `${b.hp} ${v.hp}`);
  }
  {
    // a kill: three orbs at once and the ult ready again
    const m = arena([[R('tumay', 0), 0, 0], [R('ung', 1), 5, 0]]), [a, v] = m.units;
    freeze(a); go(m, 1);
    a.cd.ult = 30; v.hp = 50;
    go(m, 20, (i) => ({ 0: { fire: i === 0, aim: 0 } }));
    check('61s a kill gives 3 orbs and resets Hon Don Chi Phe', !v.alive && bits(pool(m, a).live) === 3 && a.cd.ult === 0, `${v.alive} ${bits(pool(m, a).live)} ${a.cd.ult}`);
  }
  // ---- Star Lord ----
  const noMiss = (u) => { u.def = { ...u.def, passive: { ...u.def.passive, chance: 0 } }; };
  {
    const m = arena([[R('enbac', 0), 0, 0], [R('ung', 1), 8, 0], [R('ung', 1), 8, 6]]), [a, v, v2] = m.units;
    noMiss(a);
    const ev = go(m, 40, (i) => ({ 0: { fire: i === 0 || i === 15 || i === 30, aim: i < 5 ? 0 : i < 17 ? Math.atan2(6, 8) : 0 } }));
    check('61t Tat Toc: hits must be in a row on one foe: hit, switch, hit back -> no bonus', only(ev, 'stacks').length === 0 && v2.hp < UNG.hp, `${only(ev, 'stacks').length} ${v2.hp}`);
    const m2 = arena([[R('enbac', 0), 0, 0], [R('ung', 1), 8, 0]]), [b, w] = m2.units;
    noMiss(b);
    go(m2, 31, (i) => ({ 0: { fire: i === 0 || i === 15 || i === 30, aim: 0 } }));
    go(m2, 10);
    check('61u three shots (0.48 s apart) on one foe: 3 x 150 + 225 = 675 x armor', near(UNG.hp - w.hp, 675 * UF, 1e-6), `${UNG.hp - w.hp}`);
  }
  {
    const m = arena([[R('enbac', 0), 0, 0], [R('ung', 1), 8, 3]]), [a, v] = m.units;
    a.def = { ...a.def, passive: { ...a.def.passive, chance: 1, nth: 99 } };
    go(m, 1, () => ({ 0: { fire: true, aim: 0 } }));
    const ms = m.shots.filter((s) => s.vis === 'rocket');
    check('61v chance 1: the shot brings a missile homing on the foe nearest the aim', ms.length === 1 && ms[0].k4Home === 1, `${ms.length}`);
    go(m, 40);
    check('61w ... it curls round onto the foe off the line: 90 x armor (the bullet missed)', near(UNG.hp - v.hp, 90 * UF, 1e-6), `${UNG.hp - v.hp}`);
  }
  {
    const m = arena([[R('enbac', 0), 0, 0], [R('ung', 1), 8, 0]]), [a, v] = m.units;
    noMiss(a);
    go(m, 1, () => ({ 0: { s1: true, aim: 0 } })); go(m, 20);
    check('61x Tat Toc Triet Thoai: backs off 5 m (x = -5) while the bolt goes forward: 183 x armor, slowed 50%', near(a.x, -5, 0.05) && near(UNG.hp - v.hp, 183 * UF, 1e-6) && near(v.slowF, 0.5), `x ${a.x} dmg ${UNG.hp - v.hp}`);
  }
  {
    const m = arena([[R('enbac', 0), 0, 0], [R('ung', 1), 8, 4]]), [a, v] = m.units;
    noMiss(a);
    const ev = go(m, 1, () => ({ 0: { s2: true, aim: 0, tx: 8, tz: 4 } }));
    check('61y Can Tung Dao Dan locks the foe near the cursor: 4 rockets homing on it, a lock event', m.shots.filter((s) => s.k4Home === 1).length === 4 && only(ev, 'lock').length === 1);
    go(m, 50);
    check('61z ... all four land: 4 x 90 x armor', near(UNG.hp - v.hp, 360 * UF, 1e-6), `${UNG.hp - v.hp}`);
    const w = arena([[R('enbac', 0), 0, 0], [R('ung', 1), 8, 4]]);
    noMiss(w.units[0]);
    go(w, 1, () => ({ 0: { s2: true, aim: 0, tx: -8, tz: 0 } })); go(w, 50);
    check('61za nobody near the cursor: the rockets fly straight and miss', w.units[1].hp === UNG.hp);
  }
  {
    const m = arena([[R('enbac', 0), 0, 0], [R('ung', 1), 12, 0]]), [a, v] = m.units;
    go(m, 1, () => ({ 0: { ult: true, aim: 0 } })); go(m, 20);
    check('61zb Loi Xa Dai Phao: 0.5 s charge, then 668 x armor down the line', near(UNG.hp - v.hp, 668 * UF, 1e-6) && near(a.cd.ult, 45 - 20 * TICK, 1e-6), `${UNG.hp - v.hp}`);
  }
  // ---- bots ----
  {
    const seen = { tumay: new Set(), enbac: new Set() };
    for (let k = 0; k < 2; k++) {
      const m = createMatch({ seed: 61 + k, mode: 'tdm', roster: [{ team: 0, mech: 'tumay', name: 'T', bot: true, diff: 'hard' }, { team: 0, mech: 'enbac', name: 'E', bot: true, diff: 'hard' }, { team: 1, mech: 'trau', name: 'A', bot: true, diff: 'hard' }, { team: 1, mech: 'ung', name: 'B', bot: true, diff: 'hard' }] });
      for (let i = 0; i < 2700 && !m.over; i++) { step(m, allInputs(m)); for (const e of m.events) if (e.t === 'skill' && seen[m.units[e.id].mech]) seen[m.units[e.id].mech].add(e.slot); }
    }
    check('61zc bots cast every skill of tumay and enbac in 2 x 90 s', seen.tumay.size === 3 && seen.enbac.size === 3, `tumay ${[...seen.tumay]} enbac ${[...seen.enbac]}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  runK4Cases((n, c, d = '') => { if (!c) bad++; console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : '  ' + d}`); }, (t) => console.log(`== ${t}`));
  process.exit(bad ? 1 : 0);
}
