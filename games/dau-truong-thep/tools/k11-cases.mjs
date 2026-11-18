// Kit lane K11 (tho = Iron Man p73, trau = Optimus Prime p45).
// Test fixtures: the starter kits of Trâu Sắt and Thợ Rèn as they were before the remake, under their own keys.
//   'dummy'  = the old Trâu Sắt (2850 hp, armour 0.13, steady, Pháo Búa 250 + splash + knock-back, shield / ram / quake):
//              the plain target of the generic tests in sim-test, netstate-test, bots-test, k1-cases and k4-cases.
//   'oldtho' = the old Thợ Rèn (Súng Đinh 98, turret / magnet zone / minefield): the plain shooter of the generic
//              arithmetic tests (THO_D) and the only kit that uses the turret and minefield rows.
// Importing this module registers both in MECHS and PERKS. Import it FIRST in a test file: netstate.js reads the shot kinds
// of every MECHS row when it loads, so the fixtures must be there before it.
// The cases (sim-test section 62) run the remade kits on their real rows. Standalone (fast): node tools/k11-cases.mjs
import { MECHS, PERKS, TICK } from '../js/data.js';
import { createMatch, step, unitSpeed, weaponOf } from '../js/sim.js';
import { allInputs } from '../js/bots.js';

export const OLD_TRAU = {
  name: 'Trâu Sắt', role: 'Trụ', roleKey: 'tank', price: 0, tint: 0x8fa3b5,
  blurb: 'Giáp dày, pháo nặng. Đi đầu, húc choáng và che đạn cho đồng đội.',
  hp: 2850, speed: 5.1, radius: 0.96,
  armor: 0.13, accel: 0.7, turn: 7, towerMul: 0.5,
  passive: { do: 'steady', name: 'Lì Đòn', desc: 'Đẩy lùi và làm chậm lên Trâu Sắt chỉ còn một nửa.' },
  weapon: { name: 'Pháo Búa', cd: 0.95, dmg: 250, speed: 27, range: 15, splash: 2.2, knock: 2.5, r: 0.34, vis: 'shell' },
  skills: [
    { id: 'giap', look: 'trGuard', name: 'Giáp Phản Lực', cd: 14, do: 'shield', amount: 700, dur: 4.5, icon: 'shield',
      desc: 'Bật khiên năng lượng hấp thụ 700 sát thương trong 4,5 giây.' },
    { id: 'huc', look: 'trRam', name: 'Húc Thép', cd: 12, do: 'dash', dist: 8.5, speed: 27, dmg: 240, stun: 0.9, knock: 4, icon: 'dash',
      desc: 'Lao thẳng theo hướng ngắm, húc trúng ai thì gây sát thương và làm choáng.' },
    { id: 'diachan', look: 'trQuake', name: 'Địa Chấn', cd: 38, do: 'nova', windup: 0.75, radius: 6.5, dmg: 520, slow: 0.5, slowDur: 3, knock: 3, icon: 'quake',
      desc: 'Dậm nát mặt đất: sau một nhịp lấy đà, mọi kẻ địch quanh bạn chịu sát thương lớn và bị làm chậm.' },
  ],
};
export const OLD_TRAU_PERKS = [
  { name: 'Đà Húc', desc: 'Húc Thép lao xa 10,5 m và choáng 1,2 giây.', slot: 1, patch: { dist: 10.5, stun: 1.2 } },
  { name: 'Giáp Dày', desc: 'Giáp Phản Lực hấp thụ 1200.', slot: 0, patch: { amount: 1200 } },
  { name: 'Dư Chấn', desc: 'Địa Chấn rộng 7,5 m, làm chậm 4 giây.', slot: 2, patch: { radius: 7.5, slowDur: 4 } },
];

export const OLD_THO = {
  name: 'Thợ Rèn', role: 'Công binh', roleKey: 'engineer', price: 1200, tint: 0xc9762b,
  blurb: 'Đặt ụ súng tự bắn, hút địch vào hố từ rồi rải mìn giữ đất.',
  hp: 2300, speed: 5.6, radius: 0.88,
  armor: 0.10, accel: 0.9, turn: 12, towerMul: 1.5,
  passive: { do: 'mechanic', name: 'Tay Nghề', desc: 'Ụ súng và mìn bền thêm 30% máu và thời gian.', mul: 1.3 },
  weapon: { name: 'Súng Đinh', cd: 0.45, dmg: 98, speed: 32, range: 12.5, r: 0.22, vis: 'rivet' },
  skills: [
    { id: 'usung', look: 'thTurret', name: 'Ụ Súng', cd: 15, do: 'turret', cast: 5, hp: 800, dur: 18, range: 11, dmg: 44, rate: 0.3, icon: 'turret',
      desc: 'Đặt một ụ súng tự ngắm bắn kẻ địch trong tầm suốt 18 giây. Địch bắn vỡ được.' },
    { id: 'hotu', look: 'thMagnet', name: 'Hố Từ', cd: 13, do: 'zone', at: 'target', cast: 12, radius: 4.5, dur: 3, pull: 5, dps: 40, vis: 'magnet', icon: 'magnet',
      desc: 'Mở một hố từ trường ở con trỏ, kéo mọi kẻ địch trong vùng về tâm trong 3 giây.' },
    { id: 'baimin', look: 'thMines', name: 'Bãi Mìn', cd: 42, do: 'minefield', n: 5, radius: 4.5, cast: 13, trigger: 2.0, blast: 3, dmg: 300, stun: 1.0, arm: 0.7, life: 30, icon: 'mines',
      desc: 'Rải năm quả mìn quanh con trỏ. Địch chạm vào bị nổ và choáng 1 giây.' },
  ],
};
export const OLD_THO_PERKS = [
  { name: 'Nòng Lớn', desc: 'Ụ Súng bắn 66 mỗi phát.', slot: 0, patch: { dmg: 66 } },
  { name: 'Hố Rộng', desc: 'Hố Từ rộng 5,5 m.', slot: 1, patch: { radius: 5.5 } },
  { name: 'Bảy Quả Mìn', desc: 'Bãi Mìn rải bảy quả.', slot: 2, patch: { n: 7 } },
];

// Registered for the whole test process (no test lists Object.keys(MECHS); the roster tools read MECH_ORDER, which leaves them out).
MECHS.dummy = OLD_TRAU; PERKS.dummy = OLD_TRAU_PERKS;
MECHS.oldtho = OLD_THO; PERKS.oldtho = OLD_THO_PERKS;

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

export function runK11Cases(check, section) {
  section('62 kit lane K11: Iron Man (p73 钢铁) and Optimus Prime (p45 擎天) ported from the owner\'s clips (literal expected values)');
  const IM = MECHS.tho, D = OLD_TRAU, DF = 1 - D.armor;
  // ---- Iron Man ----
  {
    // Lạp Tử Hộ Thuẫn: 30% of 2300 = 690 from the first tick; a blow that breaks it sets off 354 round him (falloff), back 15 s later
    const m = arena([[R('tho', 0), 0, 0], [R('dummy', 1), 3, 0]]), [a, v] = m.units;
    go(m, 1);
    check('62a Iron Man spawns inside a 690 shield (30% of 2300)', near(a.shield, 690) && a.rsUp, `${a.shield}`);
    a.shield = 10;
    const ev = go(m, 30, (i) => ({ 1: { fire: i === 0, aim: Math.PI } })), nv = only(ev, 'nova', (e) => e.id === 0 && e.r === 4)[0];
    const d = nv ? Math.hypot(v.x - nv.x, v.z - nv.z) : 0, want = 354 * (1 - 0.5 * Math.min(1, d / 4)) * DF;
    check('62b the broken shield bursts: 354 x falloff x armour on the dummy 3 m away, the shield regrows in 15 s', !!nv && near(D.hp - v.hp, want, 1e-6) && !a.rsUp && near(a.rsT, 15, 1), `${D.hp - v.hp} vs ${want}`);
    go(m, Math.round(15 / TICK));
    check('62c ... and 15 s later it is up again at 690', a.rsUp && near(a.shield, 690), `${a.shield}`);
  }
  {
    // Lạp Tử Năng Lượng alone: 400 x armour on the first foe, a 75% slow that decays, the R tag for 1 s, cooldown 8
    const m = arena([[R('tho', 0), 0, 0], [R('dummy', 1), 6, 0]]), [a, v] = m.units;
    go(m, 1, () => ({ 0: { s1: true, aim: 0 } })); go(m, 8);
    check('62d particle shell: 400 x (1 - 0.13) = 348 on the dummy, a decaying slow, the imR tag; cooldown 8', near(D.hp - v.hp, 400 * DF) && v.slowG > 0.6 && v.tags['imR@0'] > 0 && near(a.cd.s1, 8 - 8 * TICK, 1e-6), `${D.hp - v.hp} slowG ${v.slowG} cd ${a.cd.s1}`);
    check('62e ... without the missiles first it does not stun', !(v.stunT > 0));
  }
  {
    // Phi Đạn Không Tập then Lạp Tử: the missiles tag and slow; the shell into a tagged foe stuns 1 s
    const m = arena([[R('tho', 0), 0, 0], [R('dummy', 1), 6, 0]]), [, v] = m.units;
    const e1 = go(m, 9, (i) => ({ 0: { s2: i === 0, tx: 6, tz: 0 } }));
    const wave = D.hp - v.hp;
    check('62f the first missile wave (0.25 s): 113 x armour, slow 50%, the imE tag', only(e1, 'explode', (e) => e.why === 'strike').length === 1 && near(wave, 113 * DF, 1e-6) && v.slowT > 0 && v.tags['imE@0'] > 0, `${wave}`);
    const e2 = go(m, 8, (i) => ({ 0: { s1: i === 0, aim: 0 } }));
    check('62g the particle shell into a missile-tagged foe stuns it 1 s', only(e2, 'tagPay', (e) => e.key === 'imE').length === 1 && v.stunT > 0.8, `stun ${v.stunT}`);
    go(m, 120);
    check('62h the raid is six waves over 3 s: 6 x 113 + 400, all x armour', near(D.hp - v.hp, (6 * 113 + 400) * DF, 1e-6), `${D.hp - v.hp}`);
  }
  {
    // Lạp Tử first, then the missiles: a wave within 1 s of the shell stuns once (the tag is spent)
    const m = arena([[R('tho', 0), 0, 0], [R('dummy', 1), 6, 0]]), [, v] = m.units;
    go(m, 8, (i) => ({ 0: { s1: i === 0, aim: 0 } }));
    const ev = go(m, 9, (i) => ({ 0: { s2: i === 0, tx: 6, tz: 0 } }));
    check('62i a missile wave inside 1 s of the shell stuns 1 s and spends the imR tag', only(ev, 'tagPay', (e) => e.key === 'imR').length === 1 && v.stunT > 0.8 && !(v.tags['imR@0'] > 0), `stun ${v.stunT}`);
    v.stunT = 0;
    const ev2 = go(m, 16);
    check('62j ... the next waves do not stun again', only(ev2, 'tagPay').length === 0 && !(v.stunT > 0));
  }
  {
    // Ngõa Giải Xạ Tuyến: the shield comes back at the press, 188 x armour a pulse, 25% of it healed, a 25% guard and cc
    // immunity while it runs; a fresh press after 1 s ends it, one before 1 s does not
    const m = arena([[R('tho', 0), 0, 0], [R('dummy', 1), 8, 0]]), [a, v] = m.units;
    go(m, 1);
    a.shield = 0; a.shieldT = 0; a.rsUp = false; a.rsT = 10; a.hp = 1000;
    const ev = go(m, 30, (i) => ({ 0: { ult: i === 0, aim: 0 } })), pulses = only(ev, 'beam', (e) => e.id === 0).length;
    check('62k the ray press raises the passive shield at once (690)', a.rsUp && near(a.shield, 690) && only(ev, 'reShield').length === 1, `${a.shield}`);
    check('62l 188 x armour a pulse on the dummy 8 m away; 25% of it healed', pulses >= 3 && near(D.hp - v.hp, pulses * 188 * DF, 1e-6) && near(a.hp - 1000, pulses * 188 * DF * 0.25, 1e-6), `${pulses} pulses, lost ${D.hp - v.hp}, healed ${a.hp - 1000}`);
    check('62m while channelling: 25% guard and no crowd control, standing still', a.guardT > 0 && near(a.guardF, 0.25) && a.ccT > 0 && !!a.cast, `${a.guardF} ${a.ccT}`);
  }
  {
    const m = arena([[R('tho', 0), 0, 0], [R('dummy', 1), 8, 0]]), [a] = m.units;
    go(m, 16, (i) => ({ 0: { ult: i === 0 || i === 15, aim: 0 } }));
    check('62n a fresh press before 1 s (0.5 s) does not end the ray', !!a.cast && a.cast.skill.id === 'ngoagiai');
    go(m, 18, (i) => ({ 0: { ult: i === 17 } }));
    check('62o a fresh press after 1 s ends the channel; the cooldown keeps running', !a.cast && a.cd.ult > 38, `cast ${!!a.cast} cd ${a.cd.ult}`);
  }
  check('62p tower damage: R 0, the ult 0, E half (the clip\'s red lines)', IM.skills[0].towerMul === 0 && IM.skills[2].towerMul === 0 && IM.skills[1].towerMul === 0.5);
  // ---- Optimus Prime ----
  const OP = MECHS.trau;
  {
    // Nộ Khí: a weapon hit is 150 x armour plus 10% of what is left as true damage (once per target per 6 s), +5 rage each
    const m = arena([[R('trau', 0), 0, 0], [R('dummy', 1), 6, 0]]), [a, v] = m.units;
    go(m, 18, (i) => ({ 0: { fire: i === 0, aim: 0 } }));
    const first = D.hp - v.hp, want = 150 * DF + 0.1 * (D.hp - 150 * DF);
    check('62r Optimus weapon hit: 150 x armour + 10% of the hp left as true damage; rage 5', near(first, want, 1e-6) && near(a.opRage, 5), `${first} vs ${want}, rage ${a.opRage}`);
    go(m, 30, (i) => ({ 0: { fire: i === 0, aim: 0 } }));
    check('62s ... a second hit inside 6 s is the plain 150 x armour; rage 10', near(D.hp - v.hp - first, 150 * DF, 1e-6) && near(a.opRage, 10), `${D.hp - v.hp - first} rage ${a.opRage}`);
    a.opRage = 50; a.opIdle = 2;
    go(m, 58);
    const held = a.opRage;
    go(m, 32);
    check('62t rage holds 2 s after the last gain, then cools 10 a second', held === 50 && near(a.opRage, 40, 0.4), `${held} -> ${a.opRage}`);
    a.opLock = {};
    v.hp = 1000; go(m, 12, (i) => ({ 0: { fire: i === 0, aim: 0 } }));
    check('62u the current-hp blow reads what the target has left (1000 -> 150 x armour, then 10% of the rest)', near(1000 - v.hp, 150 * DF + 0.1 * (1000 - 150 * DF), 1e-6), `${1000 - v.hp}`);
  }
  {
    // full rage: runs x 1.15, the gun cools x 1.3, every blow taken x 0.8; a blow taken gives +5
    const m = arena([[R('trau', 0), 0, 0], [R('dummy', 1), 6, 0]]), [a, v] = m.units;
    go(m, 1);
    a.opRage = 200; a.opIdle = 99;
    check('62v full rage: speed 5.1 x 1.15', near(unitSpeed(a), OP.speed * 1.15, 1e-9), `${unitSpeed(a)}`);
    go(m, 1, () => ({ 0: { fire: true, aim: 0 } })); go(m, 6);
    check('62w full rage: the gun cools 1.3 x faster (0.55 - 6 ticks x 1.3)', near(a.cd.fire, 0.55 - 6 * TICK * 1.3, 1e-6), `${a.cd.fire}`);
    a.opRage = 200;
    const hp0 = a.hp; go(m, 12, (i) => ({ 1: { fire: i === 0, aim: Math.PI } }));
    check('62x full rage: a 250 shell on him does 250 x (1 - 0.13) x 0.8', near(hp0 - a.hp, D.weapon.dmg * (1 - OP.armor) * 0.8, 1e-6), `${hp0 - a.hp}`);
    go(m, 30); a.opRage = 0; a.opIdle = 0; go(m, 12, (i) => ({ 1: { fire: i === 0, aim: Math.PI } }));
    check('62y being hit gives +5 rage', near(a.opRage, 5), `${a.opRage}`);
  }
  {
    // Thẩm Phán Chi Kiếm: 282 x armour where it lands, a 3 s field: the foe slowed, Optimus guarded 50%, an ally 25%; +25 rage
    const m = arena([[R('trau', 0), 0, 0], [R('dummy', 1), 6, 0], [R('dummy', 0), 6, 2]]), [a, v, al] = m.units;
    go(m, 12, (i) => ({ 0: { s1: i === 0, tx: 6, tz: 0 } }));
    const f = m.zones.find((z) => z.kind === 'field' && z.owner === 0 && z.opGuard);
    check('62z the sword lands for 282 x armour, leaves a 3 m field; the foe in it is slowed 50%; rage +25', near(D.hp - v.hp, 282 * DF, 1e-6) && !!f && f.r === 3 && v.slowT > 0 && near(v.slowF, 0.5) && near(a.opRage, 25), `${D.hp - v.hp} rage ${a.opRage}`);
    check('62za ... an ally standing in it is guarded 25%, Optimus outside is not', al.guardT > 0 && near(al.guardF, 0.25) && !(a.guardT > 0), `${al.guardF} ${a.guardT}`);
    a.x = a.px = 5; go(m, 2);
    check('62zb ... Optimus inside it is guarded 50%', a.guardT > 0 && near(a.guardF, 0.5), `${a.guardF}`);
    go(m, 90);
    check('62zc ... the field is gone after 3 s', !m.zones.some((z) => z.kind === 'field' && z.owner === 0));
  }
  {
    // Hãn Vệ Tự Do: 219 x armour in the 7 x 3 rectangle, slow; with the sword in it he flies to the sword: 294 x armour and a
    // 1 s knock-up on the foe he passes, cc immune on the way
    const m = arena([[R('trau', 0), 0, 0], [R('dummy', 1), 3, 0]]), [a, v] = m.units;
    go(m, 12, (i) => ({ 0: { s1: i === 0, tx: 7.2, tz: 0 } }));
    const before = v.hp;
    const ev = go(m, 12, (i) => ({ 0: { s2: i === 0, aim: 0 } }));
    check('62zd the slash touches the sword: a warp to it, 219 + 294 x armour on the foe on the way, knocked up 1 s', only(ev, 'warp', (e) => e.id === 0 && e.skill === 'hanve').length === 1 && near(before - v.hp, (219 + 294) * DF, 1e-6) && v.airT > 0.6 && near(a.x, 7.2, 0.6), `${before - v.hp} air ${v.airT} x ${a.x}`);
    const w = arena([[R('trau', 0), 0, 0], [R('dummy', 1), 3, 0]]), [b, o] = w.units;
    const ev2 = go(w, 12, (i) => ({ 0: { s2: i === 0, aim: 0 } }));
    check('62ze without the sword in the rectangle it is the slash alone: 219 x armour, slow 50%, no charge', only(ev2, 'warp').length === 0 && near(D.hp - o.hp, 219 * DF, 1e-6) && o.slowT > 0 && near(b.x, 0, 0.5), `${D.hp - o.hp}`);
  }
  {
    // Thẩm Phán Kỵ Sĩ: 506 with falloff after 0.2 s (slow 50% and weaken 0.5 for 3 s), then 8 s of sword swings that ignore armour,
    // fire and speed x 1.25; the cooldown starts when it ends
    const m = arena([[R('trau', 0), 0, 0], [R('dummy', 1), 3, 0]]), [a, v] = m.units;
    go(m, 10, (i) => ({ 0: { ult: i === 0 } }));
    const nova = D.hp - v.hp;
    check('62zf the Knight forms: 506 x (1 - 0.5 x 3/5) x armour on the foe 3 m away, slowed 50% and weakened to 0.5', near(nova, 506 * 0.7 * DF, 1e-6) && v.weakenT > 2 && near(v.weakenF, 0.5) && v.slowT > 2, `${nova}`);
    check('62zg ... the sword replaces the gun (pen 1, reach 5), fire and speed x 1.25, the cooldown held', weaponOf(a).name === 'Kiếm Thẩm Phán' && weaponOf(a).pen === 1 && near(a.hasteF, 1.25) && near(a.rapidF, 1.25) && near(a.cd.ult, OP.skills[2].cd), `${weaponOf(a).name} ${a.cd.ult}`);
    a.opLock[v.id] = 1e9;
    const h0 = v.hp; go(m, 10, (i) => ({ 0: { fire: i === 0, aim: 0 } }));
    check('62zh a Knight swing ignores armour: 150 on the foe', near(h0 - v.hp, 150, 1e-6), `${h0 - v.hp}`);
    go(m, Math.round(8 / TICK));
    check('62zi after 8 s the Knight ends and only then the cooldown runs', a.tfT <= 0 && a.cd.ult < OP.skills[2].cd && a.cd.ult > OP.skills[2].cd - 1, `${a.tfT} ${a.cd.ult}`);
  }
  // ---- bots ----
  {
    const seen = { tho: new Set(), trau: new Set() };
    for (let k = 0; k < 2; k++) {
      const m = createMatch({ seed: 62 + k, mode: 'tdm', roster: [{ team: 0, mech: 'tho', name: 'T', bot: true, diff: 'hard' }, { team: 0, mech: 'trau', name: 'S', bot: true, diff: 'hard' }, { team: 1, mech: 'dummy', name: 'A', bot: true, diff: 'hard' }, { team: 1, mech: 'ung', name: 'B', bot: true, diff: 'hard' }] });
      for (let i = 0; i < 2700 && !m.over; i++) { step(m, allInputs(m)); for (const e of m.events) if (e.t === 'skill' && seen[m.units[e.id].mech]) seen[m.units[e.id].mech].add(e.slot); }
    }
    check('62q bots cast every skill of Iron Man in 2 x 90 s', seen.tho.size === 3, `tho ${[...seen.tho]}`);
    check('62zj bots cast every skill of Optimus Prime in 2 x 90 s', seen.trau.size === 3, `trau ${[...seen.trau]}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  runK11Cases((n, c, d = '') => { if (!c) bad++; console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : '  ' + d}`); }, (t) => console.log(`== ${t}`));
  process.exit(bad ? 1 : 0);
}
