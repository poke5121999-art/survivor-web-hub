// Balance check for touch auto-aim (Addendum 8, item 7): a scripted player in real bot matches, once driven like a touch player with auto-aim
// and once like a good mouse player. Matches are 3v3 (the largest the game offers). Both move exactly as a normal bot would (botInput's mx, mz); only aim and fire differ.
//   node tools/aim-compare.mjs           AC_SEEDS=matches per mech and script (default 10)   AC_TICKS=sim ticks per match (default 3600)
// Exit 1 when touch auto-aim beats the good mouse player clearly: hit rate or damage per second in range more than 5% higher overall
// (or 15% on a single mech, which is the noise a few matches leave); the fix is a lower LEAD in js/autoaim.js.
import { createMatch, step } from '../js/sim.js';
import { botInput, allInputs } from '../js/bots.js';
import { MECHS } from '../js/data.js';
import { mulberry } from '../js/rng.js';
import { newLock, updateLock, pickTarget, aimFor, fireOk, createTracker, LEAD } from '../js/autoaim.js';

const SEEDS = +(process.env.AC_SEEDS || 10), TICKS = +(process.env.AC_TICKS || 3600);
const MECHS_UNDER_TEST = [['soi', 'đạn nhanh'], ['trau', 'đạn pháo chậm'], ['loi', 'đạn ném'], ['domdom', 'tia'], ['hoalong', 'tia tụ'], ['ung', 'đạn siêu nhanh']];
const MAPS = ['denrung', 'xuongcat', 'cangbang', 'mienglua'];
const FRIENDS = ['trau', 'hac', 'bang', 'tho'], FOES = ['soi', 'thancong', 'mangxa', 'hacho', 'holy'];
const MOUSE = { lead: 0.9, noise: 0.03 }, TOUCH_LEAD = +(process.env.AC_LEAD || LEAD);

const roster = (mech) => [
  { team: 0, mech, name: 'P', bot: false },
  ...FRIENDS.filter((k) => k !== mech).slice(0, 2).map((k) => ({ team: 0, mech: k, name: k, bot: true, diff: 'normal' })),
  ...FOES.slice(0, 3).map((k) => ({ team: 1, mech: k === mech ? 'kimquy' : k, name: k, bot: true, diff: 'normal' })),
];

// One input from the bot's own movement plus the script's aim and fire.
function driver(kind, seed) {
  const lock = newLock(), track = createTracker(), rng = mulberry(seed * 977 + 13);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(6.2832 * rng());
  return (m, u) => {
    const b = botInput(m, u), inp = { mx: b.mx, mz: b.mz, aim: u.aim, fire: false, tx: u.x + Math.cos(u.aim) * 8, tz: u.z + Math.sin(u.aim) * 8, s1: false, s2: false, ult: false, heal: false };
    if (!u.alive) return inp;
    if (kind === 'touch') {
      track.see(m);
      const t = updateLock(lock, m, u, { priority: 'near' });
      if (t) { const a = aimFor(m, u, t, { track, lead: TOUCH_LEAD, err: process.env.AC_ERR === undefined ? undefined : +process.env.AC_ERR }); inp.aim = a.aim; inp.tx = a.tx; inp.tz = a.tz; inp.fire = fireOk(u, a.aim, t); }
    } else {
      const t = pickTarget(m, u, null, { priority: 'near' });
      if (t) {
        const a = aimFor(m, u, t, { lead: MOUSE.lead, err: 0 }), d = Math.hypot(a.tx - u.x, a.tz - u.z), n = a.aim + gauss() * MOUSE.noise;
        inp.aim = n; inp.tx = u.x + Math.cos(n) * d; inp.tz = u.z + Math.sin(n) * d; inp.fire = true;
      }
    }
    return inp;
  };
}

function run(mech, seed, kind) {
  const m = createMatch({ map: MAPS[seed % MAPS.length], seed, roster: roster(mech) });
  const u = m.units[0], w = u.def.weapon, per = w.n || 1, drive = driver(kind, seed);
  const R = { pulls: 0, matched: 0, cap: 0, dmg: 0, inRange: 0, kills: 0 };
  const owed = [];
  let lastCd = 0;
  for (let i = 0; i < TICKS && !m.over; i++) {
    const inRange = u.alive && !!pickTarget(m, u, null, {});
    step(m, allInputs(m, { 0: drive(m, u) }));
    if (inRange) R.inRange += 1 / 30;
    if (u.cd.fire > lastCd + 1e-6) { R.pulls++; R.cap += per; owed.push({ t: m.time, left: per }); }
    lastCd = u.cd.fire;
    for (const e of m.events) {
      if ((e.t === 'hit' && e.by === 0 && m.units[e.id].team !== 0) || (e.t === 'towerHit' && e.by === 0)) {
        const o = owed.find((x) => x.left > 0 && m.time - x.t < 2.5);
        if (o) { o.left--; R.matched++; }
      }
    }
    while (owed.length && m.time - owed[0].t >= 2.5) owed.shift();
  }
  R.dmg = u.dmg; R.kills = u.kills;
  return R;
}

const sum = (a, b) => { for (const k in b) a[k] += b[k]; return a; };
const zero = () => ({ pulls: 0, matched: 0, cap: 0, dmg: 0, inRange: 0, kills: 0 });
const rate = (R) => (R.cap ? R.matched / R.cap : 0), dps = (R) => (R.inRange ? R.dmg / R.inRange : 0);
const pct = (v) => (v * 100).toFixed(1) + '%';

const rows = [], all = { touch: zero(), mouse: zero() };
let bad = 0;
for (const [mech, tag] of MECHS_UNDER_TEST) {
  const T = zero(), M = zero();
  for (let s = 1; s <= SEEDS; s++) { sum(T, run(mech, s, 'touch')); sum(M, run(mech, s, 'mouse')); }
  sum(all.touch, T); sum(all.mouse, M);
  const rh = rate(T) / rate(M), rd = dps(T) / dps(M);
  if (rh > 1.15 || rd > 1.15) bad++;
  rows.push([`${mech} (${tag}, ${MECHS[mech].weapon.name})`, T, M, rh, rd]);
}
console.log(`Tự nhắm cảm ứng (lead ${TOUCH_LEAD}) so với chuột giỏi (lead ${MOUSE.lead}, nhiễu ${MOUSE.noise} rad), ${SEEDS} trận mỗi bên, ${TICKS / 30} s mỗi trận\n`);
console.log('| mech | phát bắn T/M | tỉ lệ trúng T/M | sát thương/giây trong tầm T/M | hạ gục T/M | tỉ số trúng | tỉ số DPS |');
console.log('|---|---|---|---|---|---|---|');
for (const [name, T, M, rh, rd] of rows) console.log(`| ${name} | ${T.pulls}/${M.pulls} | ${pct(rate(T))}/${pct(rate(M))} | ${dps(T).toFixed(0)}/${dps(M).toFixed(0)} | ${T.kills}/${M.kills} | ${rh.toFixed(2)} | ${rd.toFixed(2)} |`);
const oh = rate(all.touch) / rate(all.mouse), od = dps(all.touch) / dps(all.mouse);
console.log(`| tổng | ${all.touch.pulls}/${all.mouse.pulls} | ${pct(rate(all.touch))}/${pct(rate(all.mouse))} | ${dps(all.touch).toFixed(0)}/${dps(all.mouse).toFixed(0)} | ${all.touch.kills}/${all.mouse.kills} | ${oh.toFixed(2)} | ${od.toFixed(2)} |`);
const lose = oh > 1.05 || od > 1.05 || bad > 0;
console.log(lose ? `\nFAIL: tự nhắm cảm ứng hơn chuột giỏi rõ rệt (tổng ${oh.toFixed(2)} / ${od.toFixed(2)}, ${bad} mech vượt 15%). Giảm LEAD trong js/autoaim.js.` : '\nPASS: tự nhắm cảm ứng không hơn chuột giỏi quá 5%.');
process.exit(lose ? 1 : 0);
