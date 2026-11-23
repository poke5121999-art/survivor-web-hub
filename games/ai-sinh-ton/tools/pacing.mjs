// Pacing of the first hours: a typical new player walks the stages with the real battle sim and the real
// reward, XP, gift and unlock rules; the tool reports when each unlock opens (match number, minutes played, stage)
// and how many tries each stage took. The evolution part runs the real account bot (tools/journey.mjs, equipment and all)
// from a new account until its first form 3 or EVO_HOURS, and reports when the first beast reaches form 2 and form 3.
// Usage: node tools/pacing.mjs [players] [maxMatches]
import { createBattle, step, pickCard, makeRng } from '../js/sim/battle.js';
import { stageDef } from '../js/data/stages.js';
import { levelMul, levelCost, stageReward, lossReward, rollGacha, GACHA, HERO_RARITY } from '../js/data/economy.js';
import { HEROES, HERO } from '../js/data/heroes.js';
import { UNLOCKS, isUnlocked, teamSlots, addXp, xpForResult, tutorialStage, GIFTS, NEW_ACCOUNT, newUnlocks } from '../js/data/unlocks.js';
import { journey } from './journey.mjs';

const PLAYERS = +process.argv[2] || 5; const MAXM = +process.argv[3] || 60;
const MENU_MIN = 0.7;
const EVO_HOURS = 8;
const roster = HEROES.map((h) => ({ id: h.id, rarity: h.rarity }));
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

function player(seed) {
  const rng = makeRng(seed);
  const acc = { level: 1, xp: 0, cleared: 0, gold: NEW_ACCOUNT.gold, gems: NEW_ACCOUNT.gems, pity: 0, heroes: Object.fromEntries(NEW_ACCOUNT.heroes.map((id) => [id, { level: 1, shards: 0 }])) };
  const opened = {}; const tries = {}; let minutes = 0; let matches = 0; let lostRow = 0;
  const own = (id) => { if (!acc.heroes[id] || acc.heroes[id].level === 0) acc.heroes[id] = { level: 1, shards: (acc.heroes[id] || { shards: 0 }).shards }; };
  const note = (before) => { if (acc.equipAt === undefined && isUnlocked(acc, 'equip')) acc.equipAt = acc.cleared; for (const id of newUnlocks(before, acc)) opened[id] = { match: matches, min: Math.round(minutes), stage: acc.cleared, level: acc.level }; };
  for (const u of UNLOCKS) if (isUnlocked(acc, u.id)) opened[u.id] = { match: 0, min: 0, stage: 0, level: 1 };
  const team = () => Object.keys(acc.heroes).filter((id) => acc.heroes[id].level > 0).sort((a, b) => acc.heroes[b].level - acc.heroes[a].level || HEROES.findIndex((h) => h.id === a) - HEROES.findIndex((h) => h.id === b)).slice(0, teamSlots(acc));
  const spec = (id) => ({ id, mul: levelMul(acc.heroes[id].level) });
  const spend = () => {
    if (isUnlocked(acc, 'gacha')) while (acc.gems >= GACHA.cost) {
      acc.gems -= GACHA.cost; const o = rollGacha(acc, roster, rng);
      if (o.row === 'hero_ssr') acc.pity = 0; else acc.pity++;
      if (o.kind === 'hero' && o.isNew) own(o.hero);
      else if (o.kind === 'shard') { const h = acc.heroes[o.hero] || (acc.heroes[o.hero] = { level: 0, shards: 0 }); h.shards += o.n; if (h.level === 0 && h.shards >= HERO_RARITY[HERO[o.hero].rarity].craft) { h.shards -= HERO_RARITY[HERO[o.hero].rarity].craft; h.level = 1; } }
      else if (o.kind === 'gold') acc.gold += o.n; else acc.gold += 300;
    }
    if (isUnlocked(acc, 'levelup')) for (let again = true; again;) { again = false; for (const id of team().sort((a, b) => acc.heroes[a].level - acc.heroes[b].level)) { const h = acc.heroes[id]; const c = levelCost(h.level); if (h.shards >= c.shards && acc.gold >= c.gold) { h.shards -= c.shards; acc.gold -= c.gold; h.level++; again = true; break; } } }
  };
  while (matches < MAXM && acc.cleared < 12) {
    const next = acc.cleared + 1;
    const n = lostRow >= 2 && acc.cleared > 0 ? acc.cleared : next;
    if (lostRow >= 2) lostRow = 0;
    const tut = n === 1 && acc.cleared === 0;
    const ids = team();
    const B = createBattle({ stage: tut ? tutorialStage(stageDef(1)) : n, seed: seed * 977 + matches, team: ids.map(spec), auto: { ult: true, ultDelay: 1.5, pick: 'best' }, joinSpec: (id) => ({ id, mul: 1 }) });
    let k = 0;
    while ((B.phase === 'fight' || B.phase === 'pick') && k++ < 30 * 900) { if (B.phase === 'pick') { for (let i = 0; i < B.heroes.length; i++) if (B.picked[i] < 0) pickCard(B, i, 0); } else step(B); }
    matches++; minutes += B.t / 60 + MENU_MIN; if (n === next) tries[n] = (tries[n] || 0) + 1;
    const won = B.phase === 'won'; const first = won && n === next; const before = { level: acc.level, cleared: acc.cleared, equipAt: acc.equipAt };
    const r = won ? stageReward(n, first) : lossReward(n, Math.max(0, B.wave - 1));
    acc.gold += r.gold; acc.gems += r.gems; for (const id of ids) acc.heroes[id].shards += r.teamShards;
    Object.assign(acc, addXp(acc.level, acc.xp, xpForResult({ won, wavesCleared: won ? 5 : Math.max(0, B.wave - 1), first })));
    if (first) acc.cleared = n;
    if (!won && n === next) lostRow++; else if (won) lostRow = 0;
    if (tut && won) { own('loc'); own('nhim'); }
    for (const g of GIFTS) if (g.at.stage && first && n === g.at.stage) own(g.hero);
    note(before); spend();
  }
  return { opened, tries, minutes, matches, acc };
}

const runs = []; for (let s = 1; s <= PLAYERS; s++) runs.push(player(s));
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log('\nunlock                 need            match  minute  stage  level   (median of ' + PLAYERS + ' players)');
const rows = [];
for (const u of UNLOCKS) {
  const got = runs.map((r) => r.opened[u.id]).filter(Boolean);
  const need = u.need.level ? 'cấp ' + u.need.level : u.need.stage ? 'qua ải ' + u.need.stage : u.need.after ? 'Trang bị +' + u.need.after + ' ải' : u.need.triple ? '3 món giống' : u.need.upgrades ? 'nâng cấp 1 lần' : 'từ đầu';
  if (got.length < runs.length / 2) { console.log(`${u.name.padEnd(22)} ${need.padEnd(14)} not reached by most players`); rows.push({ id: u.id, min: 1e9 }); continue; }
  const m = { match: med(got.map((g) => g.match)), min: med(got.map((g) => g.min)), stage: med(got.map((g) => g.stage)), level: med(got.map((g) => g.level)) };
  rows.push({ id: u.id, ...m });
  console.log(`${u.name.padEnd(22)} ${need.padEnd(14)} ${String(m.match).padStart(5)}  ${String(m.min).padStart(6)}  ${String(m.stage).padStart(5)}  ${String(m.level).padStart(5)}`);
}
console.log('\nstage  tries (median)  worst');
for (let n = 1; n <= 10; n++) { const t = runs.map((r) => r.tries[n] || 0); console.log(`${String(n).padStart(4)}   ${String(med(t)).padStart(5)}          ${Math.max(...t)}`); }
console.log(`hero levels of the team when stage 10 is first tried or at the end: ${runs.map((r) => Object.values(r.acc.heroes).map((h) => h.level).sort((a, b) => b - a).slice(0, 4).join('/')).join('  ')}`);
console.log(`\nminutes to clear stage 10: ${med(runs.map((r) => (r.acc.cleared >= 10 ? Math.round(r.minutes) : 1e9)))}, matches ${med(runs.map((r) => r.matches))}`);

const evo = []; for (let s = 1; s <= PLAYERS; s++) evo.push(journey(s, { to: 999, maxMatches: 2000, until: (st) => st.evolved[3] || st.minutes >= EVO_HOURS * 60 }));
const evoMin = (f) => med(evo.map((r) => (r.evolved[f] ? r.evolved[f].min : 1e9)));
const at = (e) => `${e.id} lv ${e.level}, stage ${e.stage}`;
console.log(`\nfirst form 2 (real account bot): minute ${evo.map((r) => (r.evolved[2] ? `${Math.round(r.evolved[2].min)} (${at(r.evolved[2])})` : 'never')).join(', ')}`);
console.log(`first form 3: hour ${evo.map((r) => (r.evolved[3] ? `${(r.evolved[3].min / 60).toFixed(1)} (${at(r.evolved[3])})` : `never (${(r.minutes / 60).toFixed(1)} h, stage ${r.cleared}, ${r.team})`)).join(', ')}`);
const by = Object.fromEntries(rows.map((r) => [r.id, r]));
const firstHour = rows.filter((r) => r.min <= 60).length;
check(runs.every((r) => (r.tries[1] || 0) === 1), 'every player wins the tutorial stage at the first try');
check(by.slot2.min <= 6 && by.gacha.min <= 6 && by.levelup.min <= 6, `slot 2, level-up and gacha open within the first 6 minutes (${by.slot2.min}, ${by.levelup.min}, ${by.gacha.min})`);
check(by.slot3.min <= 30 && by.slot4.min <= 75, `slot 3 within 30 minutes and slot 4 within 75 (${by.slot3.min}, ${by.slot4.min})`);
check(firstHour >= 10, `${firstHour} of ${UNLOCKS.length} unlocks open in the first hour`);
const mins = rows.map((r) => r.min).filter((m) => m < 1e9).sort((a, b) => a - b); let gap = 0; for (let i = 1; i < mins.length; i++) gap = Math.max(gap, mins[i] - mins[i - 1]);
check(gap <= 25, `the longest wait between two unlocks is ${gap} minutes (at most 25)`);
check(runs.every((r) => { for (let n = 1; n <= 8; n++) if ((r.tries[n] || 0) > 4) return false; return true; }), 'no stage from 1 to 8 takes any player more than 4 tries');
check(med(runs.map((r) => r.acc.cleared)) >= 10, `most players clear stage 10 within ${MAXM} matches (median cleared ${med(runs.map((r) => r.acc.cleared))})`);
check(evoMin(2) >= 40 && evoMin(2) <= 60, `the typical player evolves a first beast to form 2 within minutes 40-60 (median ${Math.round(evoMin(2))})`);
check(evoMin(3) >= 240 && evoMin(3) <= 360, `the typical player reaches a first form 3 within hours 4-6 (median ${evoMin(3) < 1e9 ? (evoMin(3) / 60).toFixed(1) : 'never'})`);
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
