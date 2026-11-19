// Economy checks and a progression simulation.
//  - gacha: 300,000 pulls match the rate table, pity never exceeds 50, a ten-pull always holds an SR-or-better row
//  - level costs rise with every level, without end
//  - a simulated player (4 matches a day, spends everything) reports matches to unlock a new hero and to reach
//    level 10 / 20 / 50 with the main team
// Usage: node tools/economy.mjs
import { GACHA, HERO_RARITY, rollGacha, rollTen, levelCost, cumulativeCost, stageReward, DAILY, START } from '../js/data/economy.js';
import { HEROES } from '../js/data/heroes.js';
import { makeRng } from '../js/sim/battle.js';

const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const roster = HEROES.map((h) => ({ id: h.id, rarity: h.rarity }));

check(Math.abs(GACHA.table.reduce((s, r) => s + r.p, 0) - 100) < 1e-9, 'the gacha rows sum to 100%');
check(START.heroes.every((id) => HEROES.find((h) => h.id === id)), 'starter heroes exist');
for (const r of ['R', 'SR', 'SSR']) check(roster.some((h) => h.rarity === r), `the roster has ${r} heroes (${roster.filter((h) => h.rarity === r).length})`);

// rates without pity: an account whose pity counter is held at 0
{
  const rng = makeRng(20261119); const N = 300000; const count = {};
  const acc = { heroes: Object.fromEntries(roster.map((h) => [h.id, { level: 1, shards: 0 }])), pity: 0 };
  for (let i = 0; i < N; i++) { const o = rollGacha(acc, roster, rng); count[o.row] = (count[o.row] || 0) + 1; }
  for (const row of GACHA.table) {
    const got = ((count[row.id] || 0) / N) * 100; const sd = Math.sqrt((row.p * (100 - row.p)) / N);
    check(Math.abs(got - row.p) < 4 * sd + 1e-9, `${row.id}: ${got.toFixed(3)}% over ${N} pulls (table ${row.p}%)`);
  }
}
// pity and the ten-pull guarantee, with the real counter
{
  const rng = makeRng(7); const acc = { heroes: {}, pity: 0 }; let worst = 0; let run = 0; let tens = 0; let badTens = 0;
  const apply = (o) => { run++; if (o.row === 'hero_ssr') { worst = Math.max(worst, run); run = 0; acc.pity = 0; } else acc.pity++; if (o.kind === 'hero' && o.isNew) acc.heroes[o.hero] = { level: 1, shards: 0 }; };
  for (let i = 0; i < 20000; i++) { const outs = rollTen(acc, roster, rng, apply); tens++; if (!outs.some((o) => ['hero_ssr', 'hero_sr', 'shard_ssr', 'shard_sr'].includes(o.row))) badTens++; }
  check(worst <= GACHA.pity, `the longest wait for a Huyền Thoại hero was ${worst} pulls (pity ${GACHA.pity})`);
  check(badTens === 0, `every one of ${tens} ten-pulls held a Sử Thi-or-better row`);
}
// cost curve
{
  let ok = true; let prev = { shards: 0, gold: 0 };
  for (let L = 1; L <= 500; L++) { const c = levelCost(L); if (!(c.shards > prev.shards && c.gold > prev.gold)) ok = false; prev = c; }
  check(ok, 'levels 1..500: every level costs more shards and more gold than the one before');
  console.log('\nlevel   shards   gold     cumulative shards / gold');
  for (const L of [1, 2, 3, 5, 9, 10, 19, 20, 29, 49, 50, 99]) { const c = levelCost(L); const s = cumulativeCost(L + 1); console.log(`${String(L).padStart(3)}->${String(L + 1).padEnd(3)} ${String(c.shards).padStart(6)} ${String(c.gold).padStart(8)}   ${String(s.shards).padStart(8)} / ${s.gold}`); }
}

// progression: play the highest cleared stage + 1 while the team is at its expected level, else replay
function simulate(seed) {
  const rng = makeRng(seed);
  const acc = { gold: START.gold, gems: START.gems, pity: 0, heroes: Object.fromEntries(START.heroes.map((id) => [id, { level: 1, shards: 0 }])) };
  const team = START.heroes.slice(); let cleared = 0; let matches = 0; const mark = {}; let newHeroAt = [];
  const grant = (o) => {
    if (o.row === 'hero_ssr') acc.pity = 0; else acc.pity++;
    if (o.kind === 'hero' && o.isNew) { acc.heroes[o.hero] = { level: 1, shards: 0 }; newHeroAt.push(matches); }
    else if (o.kind === 'shard') { if (!acc.heroes[o.hero]) acc.heroes[o.hero] = { level: 0, shards: 0 }; const h = acc.heroes[o.hero]; h.shards += o.n; const need = HERO_RARITY[HEROES.find((x) => x.id === o.hero).rarity].craft; if (h.level === 0 && h.shards >= need) { h.shards -= need; h.level = 1; newHeroAt.push(matches); } }
    else if (o.kind === 'gold') acc.gold += o.n;
  };
  const spend = () => {
    while (acc.gems >= GACHA.cost10) { acc.gems -= GACHA.cost10; rollTen(acc, roster, rng, grant); }
    for (let again = true; again;) { again = false; const order = team.slice().sort((a, b) => acc.heroes[a].level - acc.heroes[b].level); for (const id of order) { const h = acc.heroes[id]; const c = levelCost(h.level); if (h.shards >= c.shards && acc.gold >= c.gold) { h.shards -= c.shards; acc.gold -= c.gold; h.level++; again = true; break; } } }
  };
  const minLv = () => Math.min(...team.map((id) => acc.heroes[id].level));
  while (matches < 60000 && !mark[50]) {
    if (matches % 4 === 0) { acc.gems += DAILY.gems; acc.gold += DAILY.gold; const id = team[Math.floor(rng() * 4)]; acc.heroes[id].shards += DAILY.shards; }
    const next = cleared + 1; const ready = minLv() >= Math.round(1 + (next - 1) * 0.8);
    const stage = ready ? next : Math.max(1, cleared); const first = ready;
    const r = stageReward(stage, first); if (first) cleared = next;
    acc.gold += r.gold; acc.gems += r.gems; for (const id of team) acc.heroes[id].shards += r.teamShards;
    matches++; spend();
    for (const L of [10, 20, 50]) if (!mark[L] && minLv() >= L) mark[L] = { matches, cleared };
  }
  return { mark, newHeroAt, heroes: Object.values(acc.heroes).filter((h) => h.level > 0).length, cleared };
}
{
  const runs = []; for (let s = 1; s <= 20; s++) runs.push(simulate(s * 101));
  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const firstNew = med(runs.map((r) => r.newHeroAt[0] || 1e9)); const fifth = med(runs.map((r) => r.newHeroAt[4] || 1e9));
  console.log(`\nprogression (median of 20 players, 4 matches a day, whole team of 4 levelled together):`);
  console.log(`  first new hero after ${firstNew} matches, fifth new hero after ${fifth} matches`);
  for (const L of [10, 20, 50]) { const m = med(runs.map((r) => (r.mark[L] ? r.mark[L].matches : 1e9))); const c = med(runs.map((r) => (r.mark[L] ? r.mark[L].cleared : 0))); console.log(`  team level ${L}: ${m} matches (${Math.round(m / 4)} days), stage ${c} cleared by then`); }
  const m10 = med(runs.map((r) => r.mark[10].matches)); const m20 = med(runs.map((r) => r.mark[20].matches)); const m50 = med(runs.map((r) => r.mark[50] ? r.mark[50].matches : 1e9));
  check(firstNew <= 12, `a new hero comes within the first 12 matches (${firstNew})`);
  check(m10 >= 20 && m10 <= 120, `team level 10 takes 20-120 matches (${m10})`);
  check(m20 > m10 * 2.5 && m20 <= 900, `team level 20 takes more than 2.5x level 10 and at most 900 matches (${m20})`);
  check(m50 > m20 * 4 && m50 < 60000, `team level 50 is far but reachable (${m50})`);
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
