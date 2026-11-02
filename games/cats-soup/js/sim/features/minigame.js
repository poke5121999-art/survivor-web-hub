// Feature "minigame" (sim part). Contract: js/sim/registry.js. Rules: D:/catsoup-ref/rules/minigame.md.
// The two season sub games (butterfly catching, whack-a-mole: InGame_SubGame_01_Butterfly / _02_Mole) as pure play engines
// plus their daily tries, scores and reward tables. A play is a session object kept outside game.state; `finishSub` writes
// the outcome (total score, top score, rewards) into game.state.minigame.
import { nowMs } from './specials.js';

export const SUB = { butterfly: 1, mole: 2 };
export const TOTAL_TIME = 20;               // InGame_SubGame_01_Butterfly / _02_Mole TotalTime
export const READY_TIME = 3;                // 3-2-1 count (readyStateCountObjs: three objects) (inferred)
export const DAILY_FREE = 1, DAILY_ADS = 2; // SubGameData.CheckRefreshTryCount: remainFreeCount 1, remainAdsCount 2 a new day
export const MOLE = { holes: 7, special: 0.3, catchDelay: 0.6, stay: [1.3, 1.1, 0.9], interval: [1.4, 1.2, 1.0], phaseAt: [7, 14],
  count: [[1, 3], [2, 4], [3, 5]], spawnJitter: 0.15 };
export const BUTTERFLY = { interval: 1.5, phaseAt: [8, 14], count: [[2, 3], [3, 4], [6, 7]], life: [3000, 2500, 2000], specialLife: 3000 };
// The reward group of a game: SeasonSubGame rows alternate butterfly (gameType 1) and mole (2); the port keeps the first
// season of each kind always open (dates are live-ops).
export const GROUP = { 1: 1, 2: 2 };

const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export const today = g => dayKey(nowMs(g));
const D = g => g.data.minigame;
const slotOf = (g, type) => g.state.minigame.sub[type];
export const rows = (g, table, group, kind) => D(g)[table].filter(r => r[0] === group && r[2] === kind);
export const singleRewards = (g, type) => rows(g, 'subReward', GROUP[type], 0).sort((a, b) => a[3] - b[3]);
export const periodRewards = (g, type) => rows(g, 'subReward', GROUP[type], 1).sort((a, b) => a[3] - b[3]);
export const collectRow = (g, type) => D(g).subCollect.find(r => r.group === GROUP[type]);

// ---- rewards: types a feature can pay go through game.reward, the rest wait in state.minigame.bag ----
export const canGive = (g, type) => type <= 4 || !!g.features.find(f => f.rewards && f.rewards[type]);
export function pay(g, type, value) {
  if (canGive(g, type)) { const out = g.reward(type, value); if (out) return out; }
  const bag = g.state.minigame.bag;
  bag[type] = (bag[type] || 0) + Number(value);
  return { type, value, held: true };
}
function flushBag(g) {
  const bag = g.state.minigame.bag;
  for (const k of Object.keys(bag)) {
    const t = Number(k);
    if (!(t > 4 && canGive(g, t))) continue;
    const v = bag[k];
    delete bag[k];
    pay(g, t, v);
  }
}

// ---- tries: one free play and two by ad a day per game ----
export function refreshTries(g, type) {
  const s = slotOf(g, type), d = today(g);
  if (s.day === d) return false;
  s.day = d; s.free = DAILY_FREE; s.ads = DAILY_ADS;
  return true;
}
export const triesLeft = (g, type) => { refreshTries(g, type); const s = slotOf(g, type); return s.free + s.ads; };

// ---- sessions ----
const randInt = (g, lo, hi) => lo + Math.min(hi - lo, Math.floor(g.rng() * (hi - lo + 1)));
const phaseOf = (t, at) => (t >= at[1] ? 2 : t >= at[0] ? 1 : 0);

// Rare animals: Random.value < CollectRate (spawnProbability / 100) decides whether a game carries one; never in practice
// and never once all three were collected.
function pickRare(g, type) {
  const s = slotOf(g, type);
  const left = [1, 2, 3].filter(n => !s.collected.includes(n));
  return left.length ? left[Math.min(left.length - 1, Math.floor(g.rng() * left.length))] : 0;
}

// Starts a play. practice = no try spent, no score, no rewards, no rare animals. Returns null when no try is left.
export function startSub(g, type, practice = false) {
  const s = slotOf(g, type);
  if (!practice) {
    refreshTries(g, type);
    if (s.free > 0) s.free -= 1; else if (s.ads > 0) s.ads -= 1; else return null;
    g.emit('subgameStart', { game: type });
  }
  const rare = !practice && g.rng() < collectRow(g, type).prob / 100 ? pickRare(g, type) : 0;
  const ses = { type, practice, t: -READY_TIME, score: 0, phase: 0, done: false, rare, rareSpawned: false, collected: [], next: 0, caught: 0 };
  if (type === SUB.mole) ses.holes = Array.from({ length: MOLE.holes }, () => ({ state: 'idle', type: 0, grade: 0, life: 0, hits: 0, wait: 0, queued: false }));
  else ses.bf = [];
  ses.ph2Spawns = 0;
  return ses;
}

function collect(g, ses, n) {
  if (ses.practice || !n) return;
  const s = slotOf(g, ses.type);
  if (!s.collected.includes(n)) s.collected.push(n);
  ses.collected.push(n);
  g.emit('subgameRare', { game: ses.type, n });
}

function addScore(g, ses, n) {
  ses.score += n;
  ses.caught += 1;
  if (!ses.practice) slotOf(g, ses.type).total += n;   // DataManager.AddSubGameTotalScore at every catch
}

export function stepSub(g, ses, dt) {
  if (ses.done) return ses;
  ses.t += dt;
  if (ses.t < 0) return ses;
  const t = Math.min(ses.t, TOTAL_TIME);
  ses.phase = phaseOf(t, ses.type === SUB.mole ? MOLE.phaseAt : BUTTERFLY.phaseAt);
  if (ses.type === SUB.mole) stepMole(g, ses, dt, t); else stepButterfly(g, ses, dt, t);
  if (ses.t >= TOTAL_TIME) endSub(g, ses);
  return ses;
}

function stepMole(g, ses, dt, t) {
  for (const h of ses.holes) {
    if (h.state === 'idle') continue;
    if (h.state === 'wait') { h.wait -= dt; if (h.wait <= 0) { h.state = 'up'; } continue; }
    h.life -= dt;
    if (h.life <= 0) { h.state = 'idle'; h.queued = false; }
  }
  if (ses.t >= TOTAL_TIME) return;
  if (ses.next > t) return;
  const ph = ses.phase;
  ses.next = t + MOLE.interval[ph];
  const free = ses.holes.map((h, i) => (h.state === 'idle' ? i : -1)).filter(i => i >= 0);
  const n = Math.min(randInt(g, MOLE.count[ph][0], MOLE.count[ph][1]), free.length);
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(g.rng() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  for (let k = 0; k < n; k++) {
    const h = ses.holes[free[k]];
    h.state = 'wait'; h.wait = g.rng() * MOLE.spawnJitter; h.hits = 0; h.type = 0;
    h.grade = g.rng() < MOLE.special ? 1 : 0;
    h.life = MOLE.stay[ph];
    // The rare mole shows up on the first spawn of the last phase (inferred from the butterfly plan, which is exact).
    if (ph === 2 && ses.rare && !ses.rareSpawned && k === 0) { ses.rareSpawned = true; h.type = ses.rare; h.grade = 0; }
  }
}

// Tap a hole: normal mole +1; a hard hat needs two taps in a row and then counts +3; rare moles also count +1.
export function tapHole(g, ses, i) {
  if (ses.done || ses.t < 0) return 0;
  const h = ses.holes[i];
  if (!h || h.state !== 'up') return 0;
  if (h.grade === 1 && h.hits === 0) { h.hits = 1; return 0; }
  const pts = h.grade === 1 ? 3 : 1;
  h.state = 'caught'; h.life = MOLE.catchDelay;
  if (h.type) collect(g, ses, h.type);
  addScore(g, ses, pts);
  return pts;
}

function stepButterfly(g, ses, dt, t) {
  for (const b of ses.bf) b.life -= dt * 1000;
  ses.bf = ses.bf.filter(b => b.life > 0 && !b.caught);
  if (ses.t >= TOTAL_TIME || ses.next > t) return;
  const ph = ses.phase;
  ses.next = t + BUTTERFLY.interval;
  const n = randInt(g, BUTTERFLY.count[ph][0], BUTTERFLY.count[ph][1]);
  for (let k = 0; k < n; k++) {
    const b = { x: 0.08 + g.rng() * 0.84, y: 0.08 + g.rng() * 0.84, type: 0, life: BUTTERFLY.life[ph], caught: false, born: t };
    // RollButterflyType: phase 3, first spawn of the phase, only when this game carries a rare butterfly.
    if (ph === 2) {
      if (ses.ph2Spawns === 0 && k === 0 && ses.rare && !ses.rareSpawned) { ses.rareSpawned = true; b.type = ses.rare; b.life = BUTTERFLY.specialLife; }
    }
    ses.bf.push(b);
  }
  if (ph === 2) ses.ph2Spawns += 1;
}

export function tapButterfly(g, ses, b) {
  if (ses.done || b.caught || !ses.bf.includes(b)) return 0;
  b.caught = true;
  if (b.type) collect(g, ses, b.type);
  addScore(g, ses, 1);
  return 1;
}

// End of a play: top score, the three single rewards (score >= needCount, paid every play) and the rare set reward.
export function endSub(g, ses) {
  if (ses.done) return ses.result;
  ses.done = true;
  const res = ses.result = { score: ses.score, paid: [], newTop: false, collectReward: null, collected: ses.collected.slice() };
  if (!ses.practice) {
    const s = slotOf(g, ses.type);
    for (const r of singleRewards(g, ses.type)) {
      if (ses.score >= r[1]) res.paid.push({ need: r[1], ...pay(g, r[4], r[5]) });
    }
    if (ses.score > s.top) { s.top = ses.score; res.newTop = true; }
    const row = collectRow(g, ses.type);
    if (!s.collectRewarded && s.collected.length >= 3) {
      s.collectRewarded = true;
      res.collectReward = pay(g, row.rewardType, row.rewardValue);
    }
    g.emit('subgame', { game: ses.type, score: ses.score, top: s.top });
  }
  return res;
}

// ---- season (period) rewards: claimable once the running total reaches needCount ----
export function periodState(g, type) {
  const s = slotOf(g, type);
  return periodRewards(g, type).map(r => ({ n: r[3], need: r[1], type: r[4], value: r[5], done: s.claimed.includes(r[3]), ready: s.total >= r[1] && !s.claimed.includes(r[3]) }));
}
export function claimPeriod(g, type, n) {
  const s = slotOf(g, type);
  const r = periodRewards(g, type).find(x => x[3] === n);
  if (!r || s.claimed.includes(n) || s.total < r[1]) return null;
  s.claimed.push(n);
  const out = pay(g, r[4], r[5]);
  g.emit('subgameClaim', { game: type, n });
  return out;
}
export const claimAll = (g, type) => periodState(g, type).filter(p => p.ready).map(p => claimPeriod(g, type, p.n));

// ---- adventure mini games (MiniGame.json, InGame_MiniGame_0X): a day gives two tries (MiniGameData.CheckRefreshTryCount),
// the score of a play is compared with the three single rewards of the game's MiniGameReward group, and the running total
// opens the season rewards. The port opens every game type all the time and uses the group of the first MiniGame row of the
// type (rows 0-8 carry types 1-9 once each). Only Cooking Lab (type 5) is playable.
export const MINI_TRIES = 2;
export const MINI = { cook: 5 };
// AdventureGameData_05_Cookinglab: 8 ingredients on the tray, 3 to guess in order, 15 tries, 1/2/3 right = 40/100/200 points.
export const COOK = { items: 8, answer: 3, tries: 15, reward: [0, 40, 100, 200], pool: 25 };   // pool = the 25 mergeitem sprites of atlas_minigame_cookinglab_atlas
export const miniGroup = (g, gt) => D(g).miniGames.find(r => r.gameType === gt).index;
const mslot = (g, gt) => g.state.minigame.mini[gt];
export function refreshMini(g, gt) {
  const m = mslot(g, gt), d = today(g);
  if (m.day === d) return false;
  m.day = d; m.tries = MINI_TRIES;
  return true;
}
export const miniTries = (g, gt) => { refreshMini(g, gt); return mslot(g, gt).tries; };
export const miniSingle = (g, gt) => rows(g, 'miniReward', miniGroup(g, gt), 0).sort((a, b) => a[3] - b[3]);
export const miniPeriod = (g, gt) => rows(g, 'miniReward', miniGroup(g, gt), 1).sort((a, b) => a[3] - b[3]);
export function miniPeriodState(g, gt) {
  const m = mslot(g, gt);
  return miniPeriod(g, gt).map(r => ({ n: r[3], need: r[1], type: r[4], value: r[5], done: m.claimed.includes(r[3]), ready: m.total >= r[1] && !m.claimed.includes(r[3]) }));
}
export function claimMini(g, gt, n) {
  const m = mslot(g, gt);
  const r = miniPeriod(g, gt).find(x => x[3] === n);
  if (!r || m.claimed.includes(n) || m.total < r[1]) return null;
  m.claimed.push(n);
  const out = pay(g, r[4], r[5]);
  g.emit('miniClaim', { game: gt, n });
  return out;
}

export function startMini(g, gt, practice = false) {
  if (gt !== MINI.cook) return null;
  const m = mslot(g, gt);
  if (!practice) {
    refreshMini(g, gt);
    if (m.tries <= 0) return null;
    m.tries -= 1;
    g.emit('miniStart', { game: gt });
  }
  // Fisher-Yates over the ingredient pool, first 8 go on the tray, the answer is 3 distinct tray places in order.
  const pool = Array.from({ length: COOK.pool }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(g.rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const items = pool.slice(0, COOK.items);
  const place = Array.from({ length: COOK.items }, (_, i) => i);
  for (let i = place.length - 1; i > 0; i--) { const j = Math.floor(g.rng() * (i + 1)); [place[i], place[j]] = [place[j], place[i]]; }
  return { gt, practice, items, answer: place.slice(0, COOK.answer), left: COOK.tries, guesses: [], done: false, won: false, strike: 0, score: 0, result: null };
}

// One guess = three tray places in slot order. strike = right ingredient in the right slot, ball = in the answer but in
// another slot. Right = strike (feedback strings minigame6_desc_2..5). The play ends on 3 strikes or when the tries run out;
// GameOver(countStrike) pays by the strikes of the last guess (inferred).
export function cookGuess(g, ses, picks) {
  if (ses.done || picks.length !== COOK.answer || new Set(picks).size !== COOK.answer || ses.left <= 0) return null;
  let strike = 0, ball = 0;
  picks.forEach((p, i) => { if (ses.answer[i] === p) strike += 1; else if (ses.answer.includes(p)) ball += 1; });
  ses.left -= 1;
  ses.strike = strike;
  const r = { picks: picks.slice(), strike, ball };
  ses.guesses.push(r);
  if (strike === COOK.answer || ses.left <= 0) endMini(g, ses, strike === COOK.answer);
  return r;
}

export function endMini(g, ses, won = false) {
  if (ses.done) return ses.result;
  ses.done = true; ses.won = won;
  ses.score = COOK.reward[ses.strike] || 0;
  const res = ses.result = { score: ses.score, won, paid: [], newTop: false };
  if (!ses.practice) {
    const m = mslot(g, ses.gt);
    m.total += ses.score;
    for (const r of miniSingle(g, ses.gt)) if (ses.score >= r[1]) res.paid.push({ need: r[1], ...pay(g, r[4], r[5]) });
    if (ses.score > m.top) { m.top = ses.score; res.newTop = true; }
    g.emit('minigame', { game: ses.gt, score: ses.score, top: m.top });
  }
  return res;
}


// ---- magnet board (UI_MagnetBoard / UI_MagnetInven / UI_MagnetPopup, rules/minigame.md section 5) ----
// Magnets are collected by the kitty feature (reward 3500, travel return) and read from it: kitty.magnets(g) = { Magnet index: count }.
// Inventory = every magnet owned (MagnetInvenData); one that stands on a board has isBoard set (DataManager.DeployMagnetBoard
// :86069), here "placed" counts per index. State: s.minigame.magnet = { boards: { <board>: { theme, items: [{ m, x, y, dir }] } },
// themes: [owned ThemeMagnet], seen: { <magnet index>: 1 } }.
export const MAGNET_MAX = 150;              // DataManager.GetMagnetMaxInven (:45158) = 0x96 per magnet type; IsFullMagnetInven (:27377) at >= 150
export const MAGNET_TAB = { normal: 0, special: 2 };   // Magnet.type: 0 travel magnets (sold for 30 tokens), 2 commemorative (sell -1: not for sale)
export const TOKEN_REWARD = 96;             // DataManager.SellMagnet (:112317) -> AddSouvenirToken(Magnet.sell)
const MAG = g => g.state.minigame.magnet;
const kit = g => g.feat.kitty;
export const magnetRows = g => D(g).magnets;
export const magnetRow = (g, i) => D(g).magnets.find(m => m.index === i) || null;
export const magnetOwned = g => (kit(g) && kit(g).magnets ? kit(g).magnets(g) : {});
export const magnetPlaced = (g, i) => Object.values(MAG(g).boards).reduce((a, b) => a + b.items.filter(it => it.m === i).length, 0);
export const magnetFree = (g, i) => Math.max(0, (magnetOwned(g)[i] || 0) - magnetPlaced(g, i));
export const magnetTotal = (g, type) => magnetRows(g).filter(m => m.type === type).reduce((a, m) => a + (magnetOwned(g)[m.index] || 0), 0);
export const magnetFull = (g, type) => magnetTotal(g, type) >= MAGNET_MAX;
export const magnetSellable = (g, i) => { const r = magnetRow(g, i); return !!r && r.sell >= 0 && r.type === MAGNET_TAB.normal; };
export const boardRows = g => D(g).boards;
export const boardOpen = (g, b) => !!MAG(g).boards[b];
export const boardOf = (g, b) => MAG(g).boards[b] || null;
export const themeRows = g => D(g).themes;
export const themeOwned = (g, t) => MAG(g).themes.includes(t);
export const magnetNew = (g, i) => (magnetOwned(g)[i] || 0) > 0 && !MAG(g).seen[i];
export const hasNewMagnet = g => magnetRows(g).some(m => magnetNew(g, m.index));
export function seeMagnet(g, i) { MAG(g).seen[i] = 1; }

// Surplus placements (the item was spent elsewhere) go back to the inventory.
function trimBoards(g) {
  const own = magnetOwned(g);
  const left = {};
  for (const b of Object.values(MAG(g).boards)) {
    b.items = b.items.filter(it => { left[it.m] = (left[it.m] || 0) + 1; return left[it.m] <= (own[it.m] || 0); });
  }
}

// A new board costs MagnetBoard.cost (0/200/400/800/1200); the unit is gems (inferred: GetMoneyCost with the gem type, like the theme).
export function buyBoard(g, b) {
  const row = boardRows(g).find(r => r.index === b);
  if (!row || boardOpen(g, b)) return null;
  if (g.state.gem < row.cost) return { short: 'gem' };
  g.state.gem -= row.cost;
  MAG(g).boards[b] = { theme: 0, items: [] };
  g.emit('magnetBoard', { board: b });
  return { board: b };
}
// ThemeMagnet: costType 3 = gems, theme 0 free (UI_MagnetBoard.SetThemeUI :5316 shows GetMoneyCost(costType, cost)).
export function buyTheme(g, t) {
  const row = themeRows(g).find(r => r.index === t);
  if (!row || themeOwned(g, t)) return null;
  if (row.costType === 3 && g.state.gem < row.cost) return { short: 'gem' };
  if (row.costType === 3) g.state.gem -= row.cost;
  MAG(g).themes.push(t);
  g.emit('magnetTheme', { theme: t });
  return { theme: t };
}
export function setBoardTheme(g, b, t) {
  if (!boardOpen(g, b) || !themeOwned(g, t)) return false;
  boardOf(g, b).theme = t;
  return true;
}
// Puts one free magnet of the inventory on a board at (x, y) in 0..1 of the board (UI_MagnetPopup deploy, DataManager.DeployMagnetBoard).
export function deployMagnet(g, b, i, x = 0.5, y = 0.5, dir = 0) {
  if (!boardOpen(g, b) || !magnetRow(g, i) || magnetFree(g, i) < 1) return null;
  const it = { m: i, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), dir };
  boardOf(g, b).items.push(it);
  seeMagnet(g, i);
  g.emit('magnetDeploy', { board: b, magnet: i });
  return it;
}
export function moveMagnet(g, b, n, x, y, dir) {
  const it = boardOf(g, b) && boardOf(g, b).items[n];
  if (!it) return false;
  it.x = Math.min(1, Math.max(0, x)); it.y = Math.min(1, Math.max(0, y));
  if (dir != null) it.dir = dir;
  return true;
}
export function removeMagnet(g, b, n) {
  const bd = boardOf(g, b);
  if (!bd || !bd.items[n]) return null;
  return bd.items.splice(n, 1)[0];
}
export function clearBoard(g, b) { if (boardOf(g, b)) boardOf(g, b).items.length = 0; }
// Sells one free magnet for Magnet.sell souvenir tokens; commemorative ones (sell -1) cannot be sold (Magnet_hud_27).
export function sellMagnet(g, i) {
  const row = magnetRow(g, i);
  if (!row || !magnetSellable(g, i) || magnetFree(g, i) < 1) return null;
  if (!g.spendItem(kit(g).magnetItem(i), 1)) return null;
  const given = g.reward(TOKEN_REWARD, row.sell, { from: 'magnet' });
  g.emit('magnetSell', { magnet: i, tokens: row.sell });
  return { tokens: row.sell, given };
}

const fresh = () => ({ day: '', free: DAILY_FREE, ads: DAILY_ADS, total: 0, top: 0, claimed: [], collected: [], collectRewarded: false });

export default {
  id: 'minigame',
  bag: g => g.state.minigame.bag,
  data: ['minigame'],
  init(g) {
    const s = g.state;
    if (!s.minigame) s.minigame = { sub: { 1: fresh(), 2: fresh() }, mini: {}, bag: {}, acc: 0 };
    if (!s.minigame.mini) s.minigame.mini = {};
    const mg = s.minigame.magnet ||= { boards: {}, themes: [], seen: {} };
    mg.boards ||= {}; mg.themes ||= []; mg.seen ||= {};
    if (!mg.boards[0]) mg.boards[0] = { theme: 0, items: [] };      // MagnetBoard 0 costs nothing
    if (!mg.themes.includes(0)) mg.themes.push(0);                // ThemeMagnet 0 is free
    for (const gt of [MINI.cook]) { if (!s.minigame.mini[gt]) s.minigame.mini[gt] = { day: '', tries: MINI_TRIES, total: 0, top: 0, claimed: [] }; refreshMini(g, gt); }
    for (const t of [1, 2]) { if (!s.minigame.sub[t]) s.minigame.sub[t] = fresh(); refreshTries(g, t); }
  },
  tick(g, dt) {
    const m = g.state.minigame;
    m.acc += dt;
    if (m.acc < 1) return;
    m.acc = 0;
    for (const t of [1, 2]) refreshTries(g, t);
    refreshMini(g, MINI.cook);
    flushBag(g);
    trimBoards(g);
  },
  rewards: {},
  startSub, stepSub, tapHole, tapButterfly, endSub, claimPeriod, claimAll, periodState, triesLeft, singleRewards, periodRewards, collectRow,
  magnetRows, magnetRow, magnetOwned, magnetPlaced, magnetFree, magnetTotal, magnetFull, magnetSellable, boardRows, boardOpen, boardOf, themeRows,
  themeOwned, magnetNew, hasNewMagnet, seeMagnet, buyBoard, buyTheme, setBoardTheme, deployMagnet, moveMagnet, removeMagnet, clearBoard, sellMagnet,
  startMini, cookGuess, endMini, claimMini, miniPeriodState, miniTries, miniSingle, miniPeriod, miniGroup,
};
