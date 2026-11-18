// Kit lane k12 (buomdem, cakiem, dieuthuyen) ported from the owner's clips: sim-test.mjs section 62 runs these. Standalone (fast):
//   node tools/k12-cases.mjs
// Also the old kits of the three tanks as fixtures (OLD_K12), so the primitives they exercised stay covered.
import { createMatch, step, applyFx, LOC_KINDS } from '../js/sim.js';
import { MECHS, TICK } from '../js/data.js';
import { allInputs } from '../js/bots.js';

// The batch-3/4 kits these tanks played before the remake: buomdem's meter shield, Tia Bùa and warp.land; cakiem's meter shot,
// nova repeat and beam stun core; dieuthuyen's stacks 'skill' and barrage tag. Sections 42 and 43 of sim-test still test them.
export const OLD_K12 = {
  buomdem: {
    passive: { do: 'meter', max: 1, gain: { cast: 1 }, spend: { kind: 'shield', amount: 180, cap: 540, dur: 6 } },
    weapon: { name: 'Ấn Phép', cd: 0.3, dmg: 92, speed: 32, range: 13, r: 0.22, vis: 'pulse' },
    skills: [
      { id: 'tiabua', cd: 7, do: 'volley', n: 1, dmg: 340, speed: 34, range: 16, r: 0.3, pierce: true, vis: 'lance' },
      { id: 'congao', cd: 11, do: 'warp', dist: 8, land: { radius: 3, dmg: 220, slow: 0.3, slowDur: 1.5 } },
      { id: 'ketgioi', cd: 44, do: 'zone', at: 'target', cast: 14, radius: 6, dur: 5, dps: 190, slow: 0.4, vis: 'blizzard' },
    ],
  },
  cakiem: {
    passive: { do: 'meter', max: 1, gain: { cast: 1 }, spend: { kind: 'shot', mul: 1.8 } },
    weapon: { name: 'Tam Đao', cd: 0.45, dmg: 66, n: 3, fan: 0.15, speed: 26, range: 7, r: 0.3, pierce: true, vis: 'wave' },
    skills: [
      { id: 'luottram', cd: 8, do: 'dash', dist: 8, speed: 34, dmg: 220, knock: 0.5 },
      { id: 'lockiem', cd: 11, do: 'nova', windup: 0.15, repeat: 2, gap: 0.3, move: 1, radius: 3.8, dmg: 170, knock: 2 },
      { id: 'nhatdao', cd: 40, do: 'beam', windup: 0.5, range: 14, width: 1.6, dmg: 1000, fx: { stun: { dur: 1.0, core: 0.35 } } },
    ],
  },
  dieuthuyen: {
    passive: { do: 'stacks', n: 3, dur: 4, on: 'skill', fx: { stun: 1.0 } },
    weapon: { name: 'Băng Tiêu', cd: 0.3, dmg: 90, speed: 30, range: 13, r: 0.22, vis: 'frost' },
    skills: [
      { id: 'bangluu', cd: 7, do: 'volley', n: 1, dmg: 220, speed: 30, range: 14, r: 0.4, pierce: true, slow: 0.35, slowDur: 1.5, vis: 'frost' },
      { id: 'bienlien', cd: 13, do: 'barrage', n: 1, radius: 0, blast: 3, dmg: 200, delay: 0.9, span: 0, cast: 13, fx: { stun: 1.0 } },
      { id: 'phongtuyet', cd: 45, do: 'zone', at: 'self', follow: true, radius: 6, dur: 5, dps: 150, slow: 0.45, vis: 'blizzard' },
    ],
  },
};
// Swap the old kit onto every unit of that mech (before the first step).
export function oldKit(m, mech) {
  const K = OLD_K12[mech];
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
const sum = (ev, id) => only(ev, 'hit', (e) => e.id === id).reduce((a, e) => a + e.amt + e.absorbed, 0);

export function runK12Cases(check, section) {
  section('62 kit lane k12: Doctor Strange (p66), Zoro (p63), Điêu Thuyền (p60) ported from the owner\'s clips (literal expected values)');
  const UNG = MECHS.ung, UF = 1 - UNG.armor;
  // ---- Doctor Strange ----
  const BD = MECHS.buomdem;
  {
    // Thời Không Phóng Trục: 216, banished 1 s (untouchable), then slowed 50%; the ward 235 (10% of 2350) for 2 s
    const m = arena([[R('buomdem', 0), 0, 0], [R('ung', 1), 6, 0]]), [a, v] = m.units;
    const ev = go(m, 12, (i) => ({ 0: { s1: i === 0, aim: 0 } }));
    check('62a Thoi Khong Phong Truc: 216 x armor, the foe banished (untargetable), tagged; the ward 235 on him', near(UNG.hp - v.hp, 216 * UF, 1e-6) && v.locT > 0.6 && v.invulnT > 0.6 && v.tags['bdq@0'] > 4 && near(a.shield, 235, 1e-9) && only(ev, 'nova', (e) => e.wardUp).length === 1, `${UNG.hp - v.hp} loc ${v.locT} sh ${a.shield}`);
    const hp = v.hp;
    a.cd.fire = 0;
    go(m, 3, (i) => ({ 0: { fire: i === 0, aim: 0 } })); go(m, 8);
    check('62b ... a shot at the banished foe does nothing (and keeps the mark)', v.hp === hp && v.tags['bdq@0'] > 0, `${v.hp}`);
    go(m, 20);
    check('62c back from the banish it is slowed 50% (2 s left, a little gone)', v.locT === 0 && near(v.slowF, 0.5) && v.slowT > 1.5 && v.slowT <= 2, `${v.slowT}`);
    a.hp = 1000; a.cd.fire = 0;
    const h2 = v.hp;
    go(m, 12, (i) => ({ 0: { fire: i === 0, aim: 0 } }));
    check('62d the next main shot on it: 150 x 2 x armor, he heals 235 (10% of max), the mark spent', near(h2 - v.hp, 300 * UF, 1e-6) && near(a.hp, 1235, 1e-6) && !(v.tags['bdq@0'] > 0), `${h2 - v.hp} hp ${a.hp}`);
  }
  {
    // Thời Không Nữu Khúc on a foe standing at the landing point: 245, then four pulses of 75 every 0.75 s; each pulse renews
    // the ward, so the running one bursts (38 true, slow stack +25%); the last ward bursts 2 s after the last pulse
    const m = arena([[R('buomdem', 0), 0, 0], [R('ung', 1), 3, 0]]), [a, v] = m.units;
    a.hp = 1700;
    const ev = go(m, 1, () => ({ 0: { s2: true, tx: 3, tz: 0 } }));
    const dec = m.zones.find((z) => z.kind === 'decoy');
    check('62e the warp lands on the cursor, leaves a copy with his current hp (1700) where he stood: 245 x armor', near(a.x, 3) && dec && dec.x === 0 && dec.hp === 1700 && dec.maxHp === 1700 && near(UNG.hp - v.hp, 245 * UF, 1e-6) && only(ev, 'nova', (e) => e.skill === 'thoikhong').length === 1, `x ${a.x} dec ${dec && dec.hp} ${UNG.hp - v.hp}`);
    const ev2 = go(m, 70);
    const pulses = only(ev2, 'nova', (e) => e.skill === 'thoikhong' && e.k), bursts = only(ev2, 'nova', (e) => e.ward);
    check('62f after 2.33 s: three pulses (75 x armor each) and three ward bursts (38 true each), slow stacked to 75%', pulses.length === 3 && bursts.length === 3 && near(UNG.hp - v.hp, (245 + 3 * 75) * UF + 3 * 38, 1e-6) && v.ssN === 3 && near(v.slowG, 0.75, 1e-9), `${pulses.length} ${bursts.length} ${UNG.hp - v.hp} ssN ${v.ssN} slowG ${v.slowG}`);
    const ev3 = go(m, 90);
    check('62g the fourth pulse at 3 s, its ward bursts 2 s later (5 x 38 true in all)', only(ev3, 'nova', (e) => e.skill === 'thoikhong' && e.k).length === 1 && only(ev3, 'nova', (e) => e.ward).length === 2 && near(UNG.hp - v.hp, (245 + 4 * 75) * UF + 5 * 38, 1e-6), `${UNG.hp - v.hp}`);
  }
  {
    // Thời Không Truyền Tống: a fresh press inside 5 s goes back to the copy (and takes it); past 5 s nothing
    const m = arena([[R('buomdem', 0), 0, 0], [R('ung', 1), 30, 0]]), a = m.units[0];
    go(m, 1, () => ({ 0: { s2: true, tx: -7, tz: 0 } }));
    go(m, 10);
    go(m, 2, (i) => ({ 0: { s2: i === 0 } }));
    check('62h recast inside the window: back on the copy at (0, 0), the copy gone', near(a.x, 0) && near(a.z, 0) && !m.zones.some((z) => z.kind === 'decoy'), `${a.x}`);
    const w = arena([[R('buomdem', 0), 0, 0], [R('ung', 1), 30, 0]]), b = w.units[0];
    go(w, 1, () => ({ 0: { s2: true, tx: -7, tz: 0 } }));
    go(w, 160);
    go(w, 2, (i) => ({ 0: { s2: i === 0 } }));
    check('62i ... after 5 s the press does not bring him back', near(b.x, -7), `${b.x}`);
  }
  {
    // Ma Pháp Lĩnh Vực: 305 after 1 s with a 50% slow; the domain stays 4 s; stepping in: 250 round him + silence 2 s, once;
    // Thời Không Nữu Khúc hits x2 on a foe inside
    const m = arena([[R('buomdem', 0), 0, 0], [R('ung', 1), 8, 0]]), [a, v] = m.units;
    go(m, 1, () => ({ 0: { ult: true, tx: 8, tz: 0 } }));
    go(m, 31);
    const dom = m.zones.find((z) => z.kind === 'field' && z.bdDom);
    check('62j the strike: 305 x armor, slowed 50%, and the domain field (4.5 m) is there', near(UNG.hp - v.hp, 305 * UF, 1e-6) && near(v.slowF, 0.5) && !!dom && dom.r === 4.5, `${UNG.hp - v.hp}`);
    const hp = v.hp;
    a.x = a.px = 8; a.z = a.pz = 0;
    const ev = go(m, 2);
    check('62k he steps in: 250 x armor round him (and the ward from the strike bursts, 38 true), the foe silenced 2 s; one nova step event', near(hp - v.hp, 250 * UF + 38, 1e-6) && v.silenceT > 1.9 && only(ev, 'nova', (e) => e.step).length === 1, `${hp - v.hp} sil ${v.silenceT}`);
    a.x = a.px = 0; go(m, 1); a.x = a.px = 8; const ev2 = go(m, 2);
    check('62l ... only once per domain', only(ev2, 'nova', (e) => e.step).length === 0);
    const h2 = v.hp;
    a.x = a.px = 7; a.z = a.pz = 0; a.cd.s2 = 0;
    go(m, 1, () => ({ 0: { s2: true, tx: 9, tz: 0 } }));
    check('62m Thoi Khong Nuu Khuc on the foe inside the domain: 245 x (1 - 0.5 x 1/3) x 2 x armor (+ 38 true from the ward it renews)', near(h2 - v.hp, 245 * (1 - 0.5 / 3) * 2 * UF + 38, 1e-6), `${h2 - v.hp}`);
  }
  {
    const m = arena([[R('buomdem', 0), 0, 0], [R('ung', 1), 5, 0]]), [a, v] = m.units;
    v.stealthT = 9;
    go(m, 1, () => ({ 0: { ult: true, tx: -8, tz: 0 } }));
    check('62n every press reveals the foes within 7 m for 2 s (stealth broken)', v.stealthT === 0 && v.revealT > 1.9, `${v.stealthT} ${v.revealT}`);
    applyFx(m, v, a, { stun: 1, root: 1, silence: 2 });
    check('62o cc on him lasts 25% longer, silence never lands', near(a.stunT, 1.25) && near(a.rootT, 1.25) && a.silenceT === 0, `${a.stunT} ${a.rootT} ${a.silenceT}`);
  }
  // ---- Zoro ----
  const CK = MECHS.cakiem;   // ung's rail ignores armour (passive pierce)
  {
    // Không Thủ Bạch Nhận: for 2 s every bullet is turned away; each answers with a 225 piercing wave toward his aim (tagged)
    const m = arena([[R('cakiem', 0), 0, 0], [R('ung', 1), 8, 0]]), [a, v] = m.units;
    go(m, 1, () => ({ 0: { s1: true, aim: 0 } }));
    const ev = go(m, 20, (i) => ({ 1: { fire: i === 0, aim: Math.PI, tx: 0, tz: 0 } }));
    check('62p the rail shot during the parry: no hp lost, a parry event, a wave flew back', a.hp === CK.hp && only(ev, 'nova', (e) => e.parry && e.by === 1).length === 1, `${a.hp}`);
    check('62q ... the wave hits the shooter 8 m away: 225 x armor, marked (oni)', near(UNG.hp - v.hp, 225 * UF, 1e-6) && v.tags['oni@0'] > 4, `${UNG.hp - v.hp}`);
    go(m, 40); v.cd.fire = 0;
    const ev2 = go(m, 12, (i) => ({ 1: { fire: i === 0, aim: Math.PI, tx: 0, tz: 0 } }));
    check('62r after 2 s the parry is over: the next shot hurts (390 x 0.75 from a marked foe; the rail ignores armour)', near(CK.hp - a.hp, 390 * 0.75, 1e-6) && only(ev2, 'nova', (e) => e.parry).length === 0, `${CK.hp - a.hp}`);
  }
  {
    // the window ends under a stun
    const m = arena([[R('cakiem', 0), 0, 0], [R('ung', 1), 8, 0]]), [a, v] = m.units;
    go(m, 1, () => ({ 0: { s1: true, aim: 0 } }));
    a.stunT = 0.2; go(m, 1);
    go(m, 12, (i) => ({ 1: { fire: i === 0, aim: Math.PI, tx: 0, tz: 0 } }));
    check('62s a stun ends the parry: the shot lands (390, unmarked shooter)', near(CK.hp - a.hp, 390, 1e-6) && a.ckPT === 0, `${CK.hp - a.hp}`);
  }
  {
    // Cư Hợp Trảm: 311 to the foe on the way, marked; 2 s of +50% speed and fire rate; the next 3 main attacks fan three waves
    const m = arena([[R('cakiem', 0), 0, 0], [R('ung', 1), 4, 0]]), [a, v] = m.units;
    go(m, 1, () => ({ 0: { s2: true, aim: 0 } }));
    go(m, 8);
    check('62t Cu Hop Tram: through the foe (x > 6), 311 x armor, marked; haste and fire rate x1.5, three fanned shots armed', a.x > 6 && near(UNG.hp - v.hp, 311 * UF, 1e-6) && v.tags['oni@0'] > 4 && a.hasteF === 1.5 && a.rapidF === 1.5 && a.shotN === 3, `x ${a.x} ${UNG.hp - v.hp} shotN ${a.shotN}`);
    const n0 = m.shots.length;
    go(m, 1, () => ({ 0: { fire: true, aim: Math.PI } }));
    check('62u ... the next main attack fans three waves', m.shots.filter((s) => s.owner === 0).length - n0 === 3 && a.shotN === 2, `${m.shots.length - n0}`);
  }
  {
    // the main attack on a marked foe: heals 75, every cooldown -0.5 s, the mark renewed; a marked foe dying gives Cu Hop Tram back
    const m = arena([[R('cakiem', 0), 0, 0], [R('ung', 1), 5, 0]]), [a, v] = m.units;
    v.tags['oni@0'] = 1; a.hp = 1000; a.cd.s1 = 5; a.cd.s2 = 5; a.cd.ult = 5;
    go(m, 10, (i) => ({ 0: { fire: i === 0, aim: 0 } }));
    check('62v the wave on the marked foe: 150 x armor, heal 75, cooldowns 5 -> 4.5 (less the time gone), mark renewed', near(UNG.hp - v.hp, 150 * UF, 1e-6) && near(a.hp, 1075, 0.01) && a.cd.s1 < 4.5 - 4 * TICK && a.cd.s1 > 4.5 - 10 * TICK && v.tags['oni@0'] > 4.5, `hp ${a.hp} cd ${a.cd.s1} tag ${v.tags['oni@0']}`);
    v.hp = 40; a.cd.s2 = 9; a.cd.fire = 0;
    go(m, 10, (i) => ({ 0: { fire: i === 0, aim: 0 } }));
    check('62w the marked foe dies: Cu Hop Tram is ready at once', !v.alive && a.cd.s2 === 0 && a.cd.ult > 0, `${v.alive} ${a.cd.s2}`);
  }
  {
    // Tam Thiên Thế Giới: 483 + 5% of the lost hp (true), slowed 50% fading; three uses 1.5 s apart
    const m = arena([[R('cakiem', 0), 0, 0], [R('ung', 1), 8, 0]]), [a, v] = m.units;
    go(m, 1, () => ({ 0: { ult: true, aim: 0 } }));
    go(m, 12);
    check('62x Tam Thien The Gioi: 483 x armor x 1.05 (5% of what it took, true), a fading slow, one use of three spent', near(UNG.hp - v.hp, 483 * UF * 1.05, 1e-6) && v.slowG > 0.3 && v.slowG < 0.5 && a.use2 === 1, `${UNG.hp - v.hp} slowG ${v.slowG} use ${a.use2}`);
    go(m, 2, (i) => ({ 0: { ult: i === 1, aim: 0 } }));
    check('62y ... the second use waits for the 1.5 s gap', a.use2 === 1);
    go(m, 35); go(m, 2, (i) => ({ 0: { ult: i === 1, aim: 0 } }));
    check('62z ... and goes after it', a.use2 === 2, `${a.use2}`);
  }
  // ---- Điêu Thuyền ----
  {
    // Sí Nhiệt Mị Hoặc: through a wall, 228 and a 1 s charm on the first foe; a quarter of it heals her
    const m = arena([[R('dieuthuyen', 0), 0, 0], [R('ung', 1), 6, 0]]), [a, v] = m.units;
    m.map.walls.push({ x0: 2.5, x1: 3.5, z0: -3, z1: 3 });
    a.hp = 1000;
    go(m, 1, () => ({ 0: { s1: true, aim: 0 } })); go(m, 12);
    check('62za the heart flies through the wall: 228 x armor, charmed 1 s, she heals 25% of it', near(UNG.hp - v.hp, 228 * UF, 1e-6) && v.locT > 0.5 && v.locK === LOC_KINDS.indexOf('charm') && near(a.hp, 1000 + 228 * UF * 0.25, 1e-6), `${UNG.hp - v.hp} loc ${v.locT}/${v.locK} hp ${a.hp}`);
  }
  {
    // Long Viêm Cuồng Vũ: a short untouchable glide to the cursor, then four flowers that fly at the nearest foe, 75 each
    const m = arena([[R('dieuthuyen', 0), 0, 0], [R('ung', 1), 12, 0]]), [a, v] = m.units;
    go(m, 1, () => ({ 0: { s2: true, tx: 7, tz: 0 } }));
    check('62zb the glide starts untouchable', a.invulnT > 0.2 && !!a.dash, `${a.invulnT}`);
    go(m, 10);
    const z = m.zones.find((q) => q.kind === 'orbit' && q.owner === 0);
    check('62zc ... she is at the cursor and four flowers circle her', near(a.x, 7, 0.1) && !!z && z.src === 'phihoa' && z.n === 4, `${a.x} ${z && z.src}`);
    const ev = go(m, 80), hits = only(ev, 'hit', (e) => e.id === 1 && e.by === 0);
    check('62zd ... the flowers fly at the foe 5 m away: four hits of 75 x armor', hits.length === 4 && hits.every((e) => near(e.amt, 75 * UF, 1e-6)), `${hits.map((e) => e.amt)}`);
  }
  {
    // Hoa Điệp Phi Phiến: three fans out (90) and back (270), each hit cuts Long Viêm Cuồng Vũ by 20% (1.6 s); the fifth mark roots
    // and adds 150 true; a quarter of the skill damage heals her
    const m = arena([[R('dieuthuyen', 0), 0, 0], [R('ung', 1), 5, 0]]), [a, v] = m.units;
    a.hp = 1000; a.cd.s2 = 8;
    go(m, 1, () => ({ 0: { ult: true, aim: 0 } }));
    const ev = go(m, 45), hits = only(ev, 'hit', (e) => e.id === 1 && e.by === 0);
    check('62ze the fans: 3 x 90 out and 3 x 270 back (x armor) plus 150 true from the fifth mark, rooted', near(UNG.hp - v.hp, (270 + 810) * UF + 150, 1e-6) && hits.length === 7 && v.stkN === 1, `${UNG.hp - v.hp} hits ${hits.length} stk ${v.stkN}`);
    check('62zf ... six fan hits cut Long Vien Cuong Vu by 6 x 1.6 s: ready', a.cd.s2 === 0, `${a.cd.s2}`);
    check('62zg ... she healed a quarter of the 1080 x armor the fans did', near(a.hp, 1000 + 1080 * UF * 0.25, 1e-6), `${a.hp}`);
    check('62zh one of two uses spent; the second waits 3 s', a.use2 === 1 && !(a.gap2 <= 0), `${a.use2} ${a.gap2}`);
  }
  // ---- bots ----
  {
    const seen = { buomdem: new Set(), cakiem: new Set(), dieuthuyen: new Set() };
    let back = 0;
    for (let k = 0; k < 2; k++) {
      const m = createMatch({ seed: 62 + k, mode: 'tdm', roster: [{ team: 0, mech: 'buomdem', name: 'D', bot: true, diff: 'hard' }, { team: 0, mech: 'cakiem', name: 'Z', bot: true, diff: 'hard' }, { team: 0, mech: 'dieuthuyen', name: 'T', bot: true, diff: 'hard' },
        { team: 1, mech: 'trau', name: 'A', bot: true, diff: 'hard' }, { team: 1, mech: 'ung', name: 'B', bot: true, diff: 'hard' }, { team: 1, mech: 'tumay', name: 'C', bot: true, diff: 'hard' }] });
      for (let i = 0; i < 2700 && !m.over; i++) {
        step(m, allInputs(m));
        for (const e of m.events) if (e.t === 'skill' && seen[m.units[e.id].mech]) { seen[m.units[e.id].mech].add(e.slot); if (e.skill === 'truyentong') back++; }
      }
    }
    check('62zz bots cast every skill of buomdem, cakiem and dieuthuyen in 2 x 90 s', seen.buomdem.size === 3 && seen.cakiem.size === 3 && seen.dieuthuyen.size === 3, `buomdem ${[...seen.buomdem]} back ${back} cakiem ${[...seen.cakiem]} dieuthuyen ${[...seen.dieuthuyen]}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  runK12Cases((n, c, d = '') => { if (!c) bad++; console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : '  ' + d}`); }, (t) => console.log(`== ${t}`));
  process.exit(bad ? 1 : 0);
}
