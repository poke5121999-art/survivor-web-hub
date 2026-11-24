// A whole campaign played by a bot on the REAL account module (js/meta.js) and the real battle sim: every gate,
// gift, reward, pull, level-up, equip, upgrade and merge goes through the same commands the screens call.
// Reports tries per stage, minutes played and the team when each stage falls: the evidence for stage balance once
// equipment exists. The bot also evolves its beasts as soon as it can pay (tools/pacing.mjs reads when that happens).
// Usage: node tools/journey.mjs [players] [toStage] [maxMatches]
import { createBattle, step, pickCard } from '../js/sim/battle.js';
import { stageDef } from '../js/data/stages.js';
import { createMeta } from '../js/meta.js';
import { HERO } from '../js/data/heroes.js';
import { branchesOf } from '../js/data/beasts.js';
import { EVOLVE, levelCost } from '../js/data/economy.js';
import { tutorialStage } from '../js/data/unlocks.js';

const MAIN = process.argv[1].endsWith('journey.mjs');
const PLAYERS = MAIN ? +process.argv[2] || 3 : 0; const TO = +process.argv[3] || 30; const MAXM = +process.argv[4] || 260;
const MENU_MIN = 0.7; const PER_DAY = 8;
const RANK = { SSR: 3, SR: 2, R: 1 };
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

// one player from a brand-new account. opts: { to, maxMatches, until(state) } where state = { minutes, matches, evolved }
export function journey(seed, opts = {}) {
  const to = opts.to || TO; const maxM = opts.maxMatches || MAXM;
  const mem = {}; let day = 0;
  const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  const M = createMeta({ storage, now: () => new Date(2026, 10, 20 + day) }); M.load();
  M.acc.seed = seed * 7919 + 1;
  const A = () => M.acc;
  const owned = () => Object.keys(A().heroes).filter((id) => A().heroes[id].level > 0);
  const tries = {}; const when = {}; let minutes = 0; let matches = 0; let lostRow = 0; let refused = 0; const evolved = {};

  function pickTeam() {
    const ids = owned().sort((a, b) => A().heroes[b].level - A().heroes[a].level || RANK[HERO[b].rarity] - RANK[HERO[a].rarity]);
    const n = M.slots(); let team = ids.slice(0, n);
    // one healer and one front-liner when the roster allows it
    const want = (role) => { if (n >= 3 && !team.some((id) => HERO[id].role === role)) { const h = ids.find((id) => HERO[id].role === role); if (h) team[team.length - 1] = h; } };
    want('healer'); if (!team.some((id) => HERO[id].role === 'tank' || HERO[id].role === 'melee')) { const h = ids.find((id) => HERO[id].role === 'tank' || HERO[id].role === 'melee'); if (h) team[0] = h; }
    team = [...new Set(team)];
    if (team.join() !== A().team.join()) { const r = M.setTeam(team); if (!r.ok) refused++; }
  }
  function spend() {
    if (M.canClaimDaily() && M.unlocked('daily')) M.claimDaily();
    for (let c = 0; c < 6; c++) if (M.canClaimChapter(c) && M.unlocked('chapter')) M.claimChapter(c);
    for (let k = 0; k < 40 && M.unlocked('gacha'); k++) { if (!M.pull(1).ok) break; }
    pickTeam();
    evolve();
    // a beast whose next form only lacks shards or gold keeps them for it instead of levelling
    const saving = A().team.filter(waiting);
    const keep = saving.reduce((g, id) => g + EVOLVE[A().heroes[id].form + 1].gold, 0);
    const may = (id) => !saving.includes(id) && A().gold - levelCost(A().heroes[id].level).gold >= keep;
    for (let again = true; again;) { again = false; for (const id of A().team.slice().sort((a, b) => A().heroes[a].level - A().heroes[b].level)) if (may(id) && M.levelUp(id).ok) { again = true; break; } }
    evolve();
    if (!M.unlocked('equip')) return;
    if (M.unlocked('merge')) M.autoMerge();
    for (const id of A().team) M.equipBest(id);
    // the guided first upgrade is free: spend it on the first worn piece
    if (!M.unlocked('upgrade')) for (const id of A().team) { const u = Object.values(A().equip[id] || {}).find(Boolean); if (u && M.upgradeItem(u).ok) break; }
    for (let k = 0; k < 200; k++) { let did = false; for (const id of A().team) for (const u of Object.values(A().equip[id] || {})) if (u && A().gold > 2000 + keep && M.upgradeItem(u).ok) did = true; if (!did) break; }
  }

  function waiting(id) {
    const h = A().heroes[id]; const br = h.form === 2 ? branchesOf(id)[0] : undefined; const c = M.canEvolve(id, br); const k = c.cost;
    return !c.ok && !!k && h.level >= k.level && A().cleared >= k.cleared && A().evo.stone[k.element] >= k.stones && A().evo.core >= k.cores;
  }
  // the next form of every team beast it can pay for; a fork takes its first path
  function evolve() {
    for (const id of A().team) {
      const h = A().heroes[id]; const br = h.form === 2 ? branchesOf(id)[0] : undefined;
      if (M.canEvolve(id, br).ok) { const r = M.evolve(id, br); if (r.ok && !evolved[r.form]) evolved[r.form] = { min: minutes, match: matches, id, level: h.level, stage: A().cleared }; }
    }
  }

  while (matches < maxM && A().cleared < to && !(opts.until && opts.until({ minutes, matches, evolved }))) {
    if (matches % PER_DAY === 0) day++;
    const next = A().cleared + 1;
    const farm = lostRow >= 2 && A().cleared > 0;
    const n = farm ? A().cleared : next; if (farm) lostRow = 0;
    const tut = n === 1 && A().cleared === 0;
    pickTeam();
    const B = createBattle({ stage: tut ? tutorialStage(stageDef(1)) : n, seed: seed * 977 + matches, team: M.teamSpec(), auto: { ult: true, ultDelay: 1.5, pick: 'best' }, joinSpec: (id) => ({ id, mul: 1 }) });
    let k = 0;
    while ((B.phase === 'fight' || B.phase === 'pick') && k++ < 30 * 900) { if (B.phase === 'pick') { for (let i = 0; i < B.heroes.length; i++) if (B.picked[i] < 0) pickCard(B, i, 0); } else step(B); }
    matches++; minutes += B.t / 60 + MENU_MIN; if (n === next) tries[n] = (tries[n] || 0) + 1;
    const won = B.phase === 'won';
    M.finishStage({ stage: n, won, wavesCleared: won ? 5 : Math.max(0, B.wave - 1), seconds: B.t });
    if (won && n === next) { lostRow = 0; when[n] = { min: Math.round(minutes), match: matches, lv: A().team.map((id) => A().heroes[id].level).join('/'), acc: A().level, gear: Math.round(M.teamSpec().reduce((s, h) => s + h.atkFlat, 0)) }; } else if (!won && n === next) lostRow++;
    spend();
  }
  return { tries, when, minutes, matches, cleared: A().cleared, heroes: owned().length, refused, bag: A().bag.length, evolved, team: A().team.map((id) => `${id} lv${A().heroes[id].level} d${A().heroes[id].form}`).join(' ') };
}
if (MAIN) report();
function report() {

const runs = []; for (let s = 1; s <= PLAYERS; s++) runs.push(journey(s));
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`stage  boss        tries med/worst   hour   match  hero lv     acc lv  gear atk   (median player of ${PLAYERS})`);
const medTries = [];
for (let n = 1; n <= TO; n++) {
  const t = runs.map((r) => r.tries[n] || 0); const got = runs.filter((r) => r.when[n]).sort((a, b) => a.when[n].match - b.when[n].match);
  const S = stageDef(n); medTries.push(med(t));
  if (!got.length) { console.log(`${String(n).padStart(4)}${S.spike ? '*' : ' '} ${S.boss.padEnd(10)}  ${med(t)}/${Math.max(...t)}   not cleared`); continue; }
  const w = got[Math.floor(got.length / 2)].when[n];
  console.log(`${String(n).padStart(4)}${S.spike ? '*' : ' '} ${S.boss.padEnd(10)}  ${String(med(t)).padStart(3)} / ${String(Math.max(...t)).padEnd(3)}      ${(w.min / 60).toFixed(1).padStart(5)}  ${String(w.match).padStart(5)}  ${w.lv.padEnd(11)} ${String(w.acc).padStart(4)}   ${String(w.gear).padStart(6)}`);
}
console.log(`\nplayers: cleared ${runs.map((r) => r.cleared).join(', ')}; matches ${runs.map((r) => r.matches).join(', ')}; heroes owned ${runs.map((r) => r.heroes).join(', ')}; hours ${runs.map((r) => (r.minutes / 60).toFixed(1)).join(', ')}`);
const upTo = (a, b) => medTries.slice(a - 1, b);
check(runs.every((r) => r.refused === 0), 'the account never refused a team the bot built inside the open slots');
check(upTo(1, 10).every((t) => t >= 1 && t <= 4), `stages 1-10 take a median of 1-4 tries each (${upTo(1, 10).join(' ')})`);
if (TO >= 30) {
  check(med(runs.map((r) => r.cleared)) >= 30, `the median player clears stage 30 within ${MAXM} matches (cleared ${runs.map((r) => r.cleared).join(', ')})`);
  check(upTo(11, 30).every((t) => t <= 12), `no stage from 11 to 30 takes a median above 12 tries (${upTo(11, 30).join(' ')})`);
  const spikes = [15, 20, 25, 30].map((n) => medTries[n - 1]); const plain = upTo(11, 30).filter((_, i) => (i + 11) % 5 !== 0);
  check(med(spikes) >= med(plain), `chapter-end stages are the harder ones (spike median ${med(spikes)} tries vs ${med(plain)})`);
}
console.log(`forms: ${runs.map((r) => `D2 ${r.evolved[2] ? (r.evolved[2].min / 60).toFixed(1) + 'h' : '-'} D3 ${r.evolved[3] ? (r.evolved[3].min / 60).toFixed(1) + 'h' : '-'}`).join(', ')}`);
check(runs.every((r) => r.evolved[2]), `every player evolved a beast on the way to stage ${TO} (${runs.filter((r) => r.evolved[2]).length} of ${runs.length})`);
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
}
