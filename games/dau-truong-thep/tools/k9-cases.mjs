// Kit lane k9 (feat/dtt-k9): the kits of An Dương Vương (anduong, 后羿 p6), Băng Nha (bang, 冰雪女王 p81) and Black Panther (baogam,
// 黑豹 p89) ported from the owner's clips, and their G5 mechanics (sim.js blocks "kit-remake G5 <tank>"). Section K9 of
// tools/sim-test.mjs; runs alone too: `node tools/k9-cases.mjs`. Expected values follow the data rows, so a balance pass keeps the arithmetic.
import { createMatch, step, weaponOf, unitSpeed } from '../js/sim.js';
import { MECHS, TICK } from '../js/data.js';

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
const press = (m, k, slot, extra) => go(m, 1, () => ({ [k]: { [slot]: true, ...extra } }));
const UNG = MECHS.ung, UNG_F = 1 - UNG.armor;
// The batch-7 An Dương Vương kit (two crossbow stances, passive form) as a fixture: sim-test and netstate-test register it as mech
// 'oldanduong' for the blocks that cover the form primitive, then delete it.
export const OLD_ANDUONG = {
  name: 'An Dương Vương', role: 'Bắn tỉa', roleKey: 'sniper', price: 1800, tint: 0x8a6a2a, blurb: '',
  hp: 2100, speed: 6.0, radius: 0.80, armor: 0.05, accel: 1.0, turn: 11, towerMul: 1.0,
  passive: { do: 'form', name: 'Nỏ Thần', desc: '' },
  forms: [{}, { speed: 0.85, weapon: { name: 'Nỏ Nặng', cd: 1.2, dmg: 360, speed: 56, range: 21, r: 0.22, pierce: true, vis: 'rail' },
    skills: { 0: { n: 1, fan: 0, dmg: 520, speed: 56, range: 22, r: 0.22, pierce: true, vis: 'rail', haste: 0 }, 2: { dmg: 2040 } } }],
  weapon: { name: 'Nỏ Nhẹ', cd: 0.3, dmg: 84, speed: 40, range: 15, r: 0.18, vis: 'dart' },
  skills: [
    { id: 'loatten', name: 'Loạt Tên', cd: 8, do: 'volley', n: 3, fan: 0.08, dmg: 110, speed: 40, range: 15, r: 0.18, vis: 'dart', haste: 1.2, hasteDur: 1.5, desc: '' },
    { id: 'doinno', name: 'Đổi Nỏ', cd: 2, do: 'form', setup: 0.3, move: 0.6, desc: '' },
    { id: 'nolinhquang', name: 'Nỏ Linh Quang', cd: 50, do: 'beam', windup: 1.0, range: 28, width: 1.0, dmg: 1700, desc: '' },
  ],
};
// The batch-1 Băng Nha kit (brittle passive, slowing frost shot, ice wall, frost nova, blizzard field) as a fixture: oldBang(u) puts it on
// a bang unit for the generic cases that cover those rows (sim-test: frost shot, wall, steady, brittle).
export const OLD_BANG = {
  passive: { do: 'brittle', name: 'Tê Cóng', desc: '', mul: 1.2 },
  weapon: { name: 'Gai Băng', cd: 0.36, dmg: 78, speed: 28, range: 13, r: 0.24, slow: 0.2, slowDur: 1.2, vis: 'frost' },
  skills: [
    { id: 'tuongbang', name: 'Tường Băng', cd: 14, do: 'wall', cast: 4, n: 5, r: 0.75, gap: 1.35, dur: 4.5, desc: '' },
    { id: 'xungbang', name: 'Xung Băng', cd: 10, do: 'nova', windup: 0.3, radius: 5, dmg: 140, slow: 0.6, slowDur: 2.5, desc: '' },
    { id: 'baotuyet', name: 'Bão Tuyết', cd: 46, do: 'zone', at: 'target', cast: 14, radius: 6.5, dur: 5, dps: 150, slow: 0.5, vis: 'blizzard', desc: '' },
  ],
};
export const oldBang = (u) => { u.def = { ...u.def, ...OLD_BANG }; u.passive = 'brittle'; return u; };
// a copy of u's def whose crit roll always (1) or never (0) succeeds, so the arithmetic is exact
const critAt = (u, chance) => { u.def = { ...u.def, passive: { ...u.def.passive, crit: { ...u.def.passive.crit, chance } } }; };

export function runK9Cases(check, section) {
  section('K9 kit lane k9: An Dương Vương, Băng Nha, Black Panther ported from the owner\'s clips (p6, p81, p89) and their G5 mechanics (literal expected values)');

  // ---- An Dương Vương (anduong), clip p6 ----
  const AD = MECHS.anduong, [AQ, AE, AU] = AD.skills, AW = AD.weapon;
  // passive Tinh Chuẩn: 25% of the arrows crit for x1.5; a rate measured over 200 arrows, every crit exactly 225
  {
    const m = arena([[R('anduong', 0), 0, 0], [R('ung', 1), 40, 0]]), a = m.units[0];
    let shots = 0, crits = 0, odd = 0;
    for (let i = 0; i < 200; i++) {
      a.cd.fire = 0; const n0 = m.shots.length;
      const ev = go(m, 1, () => ({ 0: { fire: true, tx: 40, tz: 0 } }));
      const sh = m.shots.slice(n0).filter((s) => s.owner === 0);
      for (const s of sh) { shots++; if (s.crit) { crits++; if (!near(s.dmg, AW.dmg * 1.5)) odd++; } else if (!near(s.dmg, AW.dmg)) odd++; }
      if (only(ev, 'k9', (e) => e.kind === 'crit').length !== sh.filter((s) => s.crit).length) odd++;
      m.shots.length = 0;
    }
    check('K9-a Tinh Chuan: one arrow of 150 a pull; 15-35% of 200 arrows crit, each crit 225 with a k9 crit event', shots === 200 && crits >= 30 && crits <= 70 && odd === 0, `shots ${shots} crits ${crits} odd ${odd}`);
  }
  // a kill adds +5% crit chance for 5 s, up to 5 stacks
  {
    const m = arena([[R('anduong', 0), 0, 0], [R('ung', 1), 6, 0]]), [a, v] = m.units;
    critAt(a, 0); v.hp = 1;
    go(m, 12, (i) => ({ 0: { fire: i === 0, tx: 6, tz: 0 } }));
    check('K9-b a kill gives a crit stack for 5 s', !v.alive && a.adN === 1 && a.adNT > 4.5, `${v.alive} ${a.adN} ${a.adNT}`);
    go(m, Math.ceil(5 / TICK) + 1);
    check('K9-c ... gone 5 s later', a.adN === 0 && a.adNT === 0, `${a.adN}`);
  }
  // Súc Thế Đãi Phát: a 4 m roll, 2 s of x1.5 speed and half damage from skills, clears Tiễn Vô Hư Phát; castable while rooted
  {
    const m = arena([[R('anduong', 0), 0, 0], [R('ung', 1), 20, 0]]), a = m.units[0];
    a.cd.s2 = 8; a.rootT = 1;
    press(m, 0, 's1', { tx: 20, tz: 0 });
    check('K9-d Suc The Dai Phat: castable while rooted; Tien Vo Hu Phat ready at once', !!a.dash && a.cd.s2 === 0 && a.cd.s1 === AQ.cd, `${!!a.dash} ${a.cd.s2}`);
    go(m, 12);
    check('K9-e ... rolls 4 m, x1.5 speed, guard 0.5 vs skills for 2 s', near(a.x, AQ.dist, 0.3) && a.hasteF === 1.5 && a.hasteT > 1.4 && a.gvT > 1.4 && a.gvF === 0.5 && a.gvK === 'skill', `x ${a.x} ${a.hasteF} ${a.gvT} ${a.gvK}`);
  }
  // Tiễn Vô Hư Phát: five arrows of 225, one foe takes at most 225 + 112.5 a cast, slowed 50% fading over 2 s
  {
    const m = arena([[R('anduong', 0), 0, 0], [R('ung', 1), 6, 0], [R('ung', 1), 6, 2.2]]), [a, v, w] = m.units;
    const ev = go(m, 20, (i) => ({ 0: { s2: i === 0, tx: 6, tz: 0 } }));
    const hv = only(ev, 'hit', (h) => h.id === 1 && h.by === 0);
    check('K9-f Tien Vo Hu Phat: five arrows; the foe in the middle takes 225 then 112.5 (two hits, x armour), no more', m.shots.length === 0 && hv.length === 2 && near(hv[0].amt, AE.dmg * UNG_F) && near(hv[1].amt, AE.dmg * 0.5 * UNG_F), hv.map((h) => h.amt).join(' '));
    check('K9-g ... the arrow at the side hits the other foe; both slowed by a fading 50% slow (slowG)', w.hp < UNG.hp && v.dsT > 1.3 && v.dsF === 0.5 && unitSpeed(v) < UNG.speed * 0.7 && unitSpeed(v) > UNG.speed * 0.5, `${w.hp} ${v.dsT} ${unitSpeed(v)}`);
  }
  // Bách Bộ Xuyên Dương: heal 25% max hp, 10 s of x1.25 speed and damage, guard 0.25, piercing arrows losing 20% per foe crossed
  {
    const m = arena([[R('anduong', 0), 0, 0], [R('ung', 1), 6, 0], [R('ung', 1), 9, 0]]), [a, v, w] = m.units;
    critAt(a, 0); a.hp = 1000;
    press(m, 0, 'ult');
    check('K9-h Bach Bo Xuyen Duong: heals 25% of max hp at once, 10 s, x1.25 speed, guard 0.25, a piercing weapon', near(a.hp, 1000 + AD.hp * 0.25, 1e-6) && near(a.tfT, AU.dur, 1e-6) && a.hasteF === 1.25 && a.guardF === 0.25 && weaponOf(a).pierce && weaponOf(a).adFall === 0.2, `${a.hp} ${a.tfT} ${a.guardF}`);
    a.cd.fire = 0;
    const ev = go(m, 12, (i) => ({ 0: { fire: i === 0, tx: 9, tz: 0 } }));
    const h1 = only(ev, 'hit', (h) => h.id === 1 && h.by === 0), h2 = only(ev, 'hit', (h) => h.id === 2 && h.by === 0);
    check('K9-i ... one arrow 150 x 1.25 through both foes, the second hit 20% weaker', h1.length === 1 && h2.length === 1 && near(h1[0].amt, AW.dmg * 1.25 * UNG_F) && near(h2[0].amt, AW.dmg * 1.25 * 0.8 * UNG_F), `${h1.map((h) => h.amt)} ${h2.map((h) => h.amt)}`);
  }
  // a kill while it runs: +5 s, Súc Thế Đãi Phát ready, 5 s of crits x1.75 and 25% lifesteal on the arrows
  {
    const m = arena([[R('anduong', 0), 0, 0], [R('ung', 1), 6, 0], [R('ung', 1), 6, 0.1]]), [a, v, w] = m.units;
    critAt(a, 1);
    a.cd.s1 = 9; press(m, 0, 'ult'); a.cd.fire = 0;
    const t0 = a.tfT; v.hp = 1;
    const ev = go(m, 12, (i) => ({ 0: { fire: i === 0, tx: 6, tz: 0 } }));
    check('K9-j a kill in the frenzy: it runs 5 s longer, Suc The Dai Phat is ready, kill reward 5 s (adKill event)', !v.alive && near(a.tfT, t0 - 12 * TICK + AU.adKill.extend, 1e-6) && a.cd.s1 === 0 && a.adKT > 4.5 && only(ev, 'k9', (e) => e.kind === 'adKill').length === 1, `${a.tfT} ${a.cd.s1} ${a.adKT}`);
    a.hp = 1000; a.cd.fire = 0; const n0 = m.shots.length;
    go(m, 1, () => ({ 0: { fire: true, tx: 6, tz: 0.1 } }));
    const sh = m.shots.slice(n0).find((s) => s.owner === 0);
    check('K9-k ... its crits now do x1.75 (150 x 1.25 x 1.75) and the arrows carry 25% lifesteal', !!sh && sh.crit === 1 && near(sh.dmg, AW.dmg * 1.25 * 1.75) && sh.steal === 0.25, `${sh && sh.dmg} ${sh && sh.steal}`);
    const hp = a.hp, ev2 = go(m, 12), hw = only(ev2, 'hit', (h) => h.id === 2 && h.by === 0);
    check('K9-L ... the hit heals a quarter of what it took', hw.length === 1 && near(a.hp - hp, hw[0].amt * 0.25, 1e-6), `${a.hp - hp} ${hw.map((h) => h.amt)}`);
  }

  // ---- Băng Nha (bang), clip p81 ----
  const BN = MECHS.bang, [BQ, BE, BU] = BN.skills;
  // Băng Sương Chi Hoàn: 356 at the cursor after 0.5 s, the Frost Mark (tag, slow 25%, fire x0.75); the outer band is frozen 1.5 s
  {
    const m = arena([[R('bang', 0), 0, 0], [R('ung', 1), 6, 0], [R('ung', 1), 8.5, 0]]), [a, v, w] = m.units;
    const ev = go(m, 1 + Math.round(BQ.delay / TICK) + 1, (i) => ({ 0: { s1: i === 0, tx: 6, tz: 0 } }));
    const hv = only(ev, 'hit', (h) => h.id === 1 && h.by === 0), rg = only(ev, 'k9', (e) => e.kind === 'bnRing');
    check('K9-m Bang Suong Chi Hoan: 356 x armour at the centre, the Frost Mark on (tag, slow 25%, fire rate x0.75)', hv.length === 1 && near(hv[0].amt, BQ.dmg * UNG_F) && v.tags['frost@0'] > 1.9 && v.slowF === 0.25 && v.sfF === 0.75, `${hv.map((h) => h.amt)} ${JSON.stringify(v.tags)}`);
    check('K9-n ... the foe 2.5 m out (outer band) is frozen 1.5 s and takes +10%; the one in the middle is not frozen', rg.length === 1 && rg[0].id === 2 && w.stunT > 1.4 && w.ampF === 0.1 && !(v.stunT > 0), `${rg.map((e) => e.id)} ${w.stunT} ${v.stunT}`);
    check('K9-o ... two uses: one spent, 4 s between them', a.use0 === 1 && a.gap0 > 3.3, `${a.use0} ${a.gap0}`);
    a.gap0 = 0; v.stunT = 0;
    const ev2 = go(m, 1 + Math.round(BQ.delay / TICK) + 1, (i) => ({ 0: { s1: i === 0, tx: 6, tz: 0 } }));
    const h2 = only(ev2, 'hit', (h) => h.id === 1 && h.by === 0);
    check('K9-p ... a second ring on the marked foe hits x1.5 (tagPay)', h2.length >= 1 && near(h2[0].amt, BQ.dmg * 1.5 * UNG_F) && only(ev2, 'tagPay', (e) => e.id === 1).length === 1, `${h2.map((h) => h.amt)}`);
  }
  // Băng Đống Chi Tức: a 0.3 s breath, a cone in front only: 282 with falloff, knocked back, a fading 50% slow, weakened x0.75
  {
    const m = arena([[R('bang', 0), 0, 0], [R('ung', 1), 3, 0], [R('ung', 1), -3, 0]]), [a, v, b] = m.units;
    const ev = go(m, 1 + Math.round(BE.windup / TICK) + 1, (i) => ({ 0: { s2: i === 0, tx: 3, tz: 0 } }));
    const hv = only(ev, 'hit', (h) => h.id === 1 && h.by === 0);
    check('K9-q Bang Dong Chi Tuc: the foe in front takes 282 x (1 - 0.5 x 3 / 5.5) x armour, the one behind nothing', hv.length === 1 && near(hv[0].amt, BE.dmg * (1 - 0.5 * 3 / BE.radius) * UNG_F, 1e-6) && b.hp === UNG.hp, `${hv.map((h) => h.amt)} ${b.hp}`);
    check('K9-r ... weakened x0.75 2 s, a fading 50% slow (slowG), the Frost Mark, pushed back', v.weakenF === 0.75 && v.dsF === 0.5 && v.dsT > 1.8 && v.tags['frost@0'] > 1.8 && v.kx > 0, `${v.weakenF} ${v.dsF} ${v.kx}`);
  }
  // Băng Thiên Tuyết Địa: a 3 s channel standing still, five strikes of 266, guard 0.25; pressed again it stops
  {
    const m = arena([[R('bang', 0), 0, 0], [R('ung', 1), 9, 0]]), [a, v] = m.units;
    const ev = go(m, Math.round(3.4 / TICK), (i) => ({ 0: { ult: i === 0, tx: 9, tz: 0 }, 1: { mx: 0 } }));
    const ex = only(ev, 'explode', (e) => e.why === 'strike');
    check('K9-s Bang Thien Tuyet Dia: five strikes in 3 s round the cursor, she stands still, guard 0.25 while it runs', ex.length === 5 && near(a.x, 0, 1e-6), `${ex.length} x ${a.x}`);
    const m2 = arena([[R('bang', 0), 0, 0], [R('ung', 1), 9, 0]]), b = m2.units[0];
    go(m2, 10, (i) => ({ 0: { ult: i === 0, tx: 9, tz: 0 } }));
    const g = b.guardF;
    const ev2 = go(m2, 2, (i) => ({ 0: { ult: i === 0, tx: 9, tz: 0 } }));
    check('K9-t ... pressing it again stops the channel at once and drops the guard', g === 0.25 && !b.cast && b.guardT === 0 && only(ev2, 'k9', (e) => e.kind === 'bnStop').length === 1, `${g} ${!!b.cast} ${b.guardT}`);
  }
  // passive Hàn Băng Ấn Ký: no single blow takes more than 15% of her max hp; a skill hit marks the attacker and speeds her up
  {
    const m = arena([[R('lubo', 1), 0, 0], [R('bang', 0), 6, 0]]), [l, a] = m.units;
    const ev = go(m, Math.round(1.7 / TICK), (i) => ({ 0: { ult: i === 0, tx: 6, tz: 0 } }));
    const h = only(ev, 'hit', (e) => e.id === 1 && e.by === 0);
    check('K9-u Han Bang An Ky: Lu Bo\'s 582 leap lands for at most 15% of her max hp; she gets x1.5 speed and he the Frost Mark', h.length >= 1 && near(h[0].amt + h[0].absorbed, BN.hp * 0.15, 1e-6) && a.hasteF === 1.5 && l.tags['frost@1'] > 0, `${h.map((e) => e.amt)} ${a.hasteF} ${JSON.stringify(l.tags)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0, passed = 0;
  runK9Cases((name, cond, detail = '') => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); } }, (s) => console.log(`\n# ${s}`));
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
