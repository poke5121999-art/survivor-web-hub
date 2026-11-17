// Economy check: real bot matches feed the game's own reward function (meta.applyResult), then a Monte Carlo of players
// spending on the tables in data.js. Exits 1 when a SCOPE target (Bổ sung 6) is missed.
// ECON_MATCHES (default 30) real matches, ECON_PLAYERS (default 300) simulated players, ECON_DAY matches per calendar day (default 5).
import { createMatch, step, summary } from '../js/sim.js';
import { allInputs } from '../js/bots.js';
import { SKINS } from '../js/skins.js';
import { MECHS, MECH_ORDER, MODE_ORDER, BOT_NAMES, TICK, UPGRADE, TRACKS, PERKS, GEM_RATE, TEAM_SIZE } from '../js/data.js';
import { makeMeta } from '../js/meta.js';
import { mapsFor } from '../js/maps.js';

// ECON_SIZE mechs a side (default TEAM_SIZE, 3; 5 reproduces the old 5v5 table)
const ECON_SIZE = +process.env.ECON_SIZE || TEAM_SIZE;
const N = +process.env.ECON_MATCHES || 30, PLAYERS = +process.env.ECON_PLAYERS || 300, PER_DAY = +process.env.ECON_DAY || 5;
const lcg = (s) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);

function playOne(seed, mode) {
  const rnd = lcg(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const mine = pick(MECH_ORDER);
  const roster = [{ team: 0, mech: mine, name: 'Bạn', bot: true, diff: 'normal' }];
  const others = (n) => Array.from({ length: n }, () => pick(MECH_ORDER));
  // 3v3 (TEAM_SIZE): the player's side has three mechs; free-for-all has six in all, the raid three hunters against the boss
  const SIZE = ECON_SIZE;
  others(mode === 'tudo' ? 5 : SIZE - 1).forEach((k, i) => roster.push({ team: mode === 'tudo' ? i % 2 : 0, mech: k, name: BOT_NAMES[i], bot: true, diff: 'normal' }));
  if (mode === 'trum') roster.push({ team: 1, mech: 'titan', name: 'Cự Thần', bot: true, diff: 'normal' });
  else if (mode !== 'tudo') others(SIZE).forEach((k, i) => roster.push({ team: 1, mech: k, name: BOT_NAMES[5 + i], bot: true, diff: 'normal' }));
  const m = createMatch({ seed, roster, mode, map: pick(mapsFor(mode)) });
  const limit = Math.ceil(m.duration / TICK) + 5;
  for (let t = 0; !m.over && t < limit; t++) step(m, allInputs(m));
  return summary(m);
}

const pool = [];
for (let i = 0; i < N; i++) pool.push({ mode: MODE_ORDER[i % MODE_ORDER.length], sum: playOne(1000 + i * 37, MODE_ORDER[i % MODE_ORDER.length]) });

// A player's wallet over time, spending nothing: when does coin income cross each price?
function income(rnd, matches) {
  let t = new Date(2026, 0, 1, 12).getTime();
  const meta = makeMeta({ storage: { getItem: () => null, setItem: () => {} }, now: () => t });
  const coins = [0], gems = [0];
  for (let i = 0; i < matches; i++) {
    if (i && i % PER_DAY === 0) t += 86400000;
    const r = meta.applyResult(pool[Math.floor(rnd() * pool.length)].sum, 0);
    coins.push(coins[i] + r.coins); gems.push(gems[i] + r.gems);
  }
  return { coins, gems };
}
const rnd = lcg(7), HORIZON = 1500;
const runs = Array.from({ length: PLAYERS }, () => income(rnd, HORIZON));
const avg = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
const matchesFor = (need, useGems) => avg((r) => { const i = r.coins.findIndex((c, k) => c + (useGems ? r.gems[k] * GEM_RATE : 0) >= need); return i < 0 ? HORIZON : i; });

const perMatch = (key, n) => avg((r) => r[key][n] / n);
const win = pool.filter((p) => p.sum.winner === 0).length / pool.length;
const f1 = (v) => v.toFixed(1).replace('.', ',');

const levelsCost = (n) => { const all = []; for (let t = 0; t < TRACKS.length; t++) for (let l = 0; l < UPGRADE.max; l++) all.push(UPGRADE.cost(l)); return all.sort((a, b) => a - b).slice(0, n).reduce((a, b) => a + b, 0); };
const maxOne = levelsCost(TRACKS.length * UPGRADE.max);
const firstPerk = levelsCost(UPGRADE.perkAt[0]);
const priced = MECH_ORDER.filter((k) => MECHS[k].price > 0);
const sumPrices = priced.reduce((a, k) => a + MECHS[k].price, 0);
const cosmetics = Object.values(SKINS).reduce((a, list) => a + list.reduce((b, r) => b + r.price, 0), 0);
const everything = sumPrices + MECH_ORDER.length * maxOne + cosmetics;

const rows = [];
const row = (what, need, target) => {
  const n = matchesFor(need, false), ng = matchesFor(need, true);
  rows.push({ what, need, n, ng, target, ok: !target || (n >= target[0] && n <= target[1]) });
};
console.log(`Trận thật: ${N} (${MODE_ORDER.map((k) => k + ' ' + pool.filter((p) => p.mode === k).length).join(', ')}), đội người chơi thắng ${f1(win * 100)}%`);
console.log(`Mỗi trận (trung bình 60 trận đầu, ${PLAYERS} người): ${f1(perMatch('coins', 60))} xu, ${f1(perMatch('gems', 60))} Tinh Thể; 200 trận: ${f1(perMatch('coins', 200))} xu, ${f1(perMatch('gems', 200))} Tinh Thể`);
for (const k of priced) row('Mở ' + MECHS[k].name, MECHS[k].price, [6, 14]);
row('Mốc đầu (tổng cấp 6)', firstPerk, [0, 8]);
row('Nâng tối đa một xe', maxOne, [40, 60]);
row('Sở hữu và nâng tối đa tất cả', everything, null);
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('Việc', 32) + pad('Xu cần', 9) + pad('Trận (xu)', 11) + pad('Trận (xu+TT)', 14) + 'Mục tiêu');
for (const r of rows) console.log(pad(r.what, 32) + pad(r.need, 9) + pad(f1(r.n), 11) + pad(f1(r.ng), 14) + (r.target ? `${r.target[0]}-${r.target[1]} ${r.ok ? 'đạt' : 'LỆCH'}` : '-'));
const bad = rows.filter((r) => !r.ok);
if (bad.length) {
  const c = perMatch('coins', 60);
  const worst = bad.reduce((a, r) => (r.n > a.n ? r : a));
  console.log('Lệch mục tiêu: ' + bad.map((r) => r.what).join('; '));
  console.log(`Gợi ý: thu nhập ${f1(c)} xu mỗi trận. Hoặc hạ giá xe ở mức cao nhất xuống tối đa ${Math.floor(worst.target[1] * c)} xu, hoặc nâng thu nhập lên ${Math.ceil(worst.need / worst.target[1])} xu mỗi trận (tăng ${f1((worst.need / worst.target[1] / c - 1) * 100)}% các khoản REWARDS).`);
  process.exit(1);
}
