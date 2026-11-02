// Feature "specials" (sim part). Contract: js/sim/registry.js. Rules: D:/catsoup-ref/rules/specials.md and specials-full.md.
// The type-4 facilities of the main forest: treasure chest 3, lucky jar 5, special-order board 8, search light 12,
// capsule crane 14, elephant trader 87, music player 90, basketball 97. Core already recharges the timed ones
// (Game.tick, work.v = charges) and pays the jar through game.claimJar; this module adds what happens when they are used.
import * as B from '../big.js';
import * as E from '../economy.js';

export const WORK = { chest: 3, jar: 5, board: 8, light: 12, crane: 14, trader: 87, music: 90, basket: 97 };
export const CHEST_GEM_CARDS = 3;          // Init 24 (cards per gem-opened chest); Init 23 = 1 per free open
const INIT = { chestFree: 23, chestGem: 24, balloonTaps: 7, jar: 8, balloon: 9, order: 10, basketReady: 48, basketTime: 49,
  basketScore: 50, traderHours: 53 };
const JAR_FREE_DIVISOR = 20;               // UI_Stage.RewardFree_Jini: GetJiniIncome(0x14); the ad button pays divisor 1
const CHEST_COOLDOWN = 60;                 // Work 3 completeTime: seconds between two opens (UI_Gacha.CalculateNextTime)
const BALL_SLOTS = 16;                     // DataManager.RefreshBalls fills at most 16 balls
const TRADER_OPEN = [13, 19];              // local hour a window opens: lunch, dinner (Spawn.GetCurrenttSurpriseTime)
const TRADER_CAT = [0, 0, 1, 1, 2, 2, 3, 3, 4]; // slot -> Surprise_Category (Equip, Furniture, Item, Ticket, Special); GameExtensions.Store_Category
const TRADER_WEIGHTED = [false, false, false, false, false, false, true, true, true]; // SetSurpriseStoreValue(.., useWeight)
const TICKET_SECONDS = { 1101: 3600, 1102: 10800, 1103: 21600, 1201: 3600, 1202: 10800, 1203: 21600 }; // 1h / 3h / 6h
// Owned at the start: the two free themes (BGM.json rows 1, 2). Rows 24, 25, 53, 62 also cost 0 but are event rewards (inferred).
const DEFAULT_BGM = [1, 2];
const CURRENCY = { 3: 'gem', 4: 'coin' };  // costType of tables: 3 gems, 4 furniture coins

const init = (g, i) => g.t.Init[i].value;
export const nowMs = g => Date.now() + (g.state.specials ? g.state.specials.skewMs : 0);
const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const pickIndex = (g, n) => Math.min(n - 1, Math.floor(g.rng() * n));

// Seconds of average income. Energy per second = every rest work's charge energy per tick (economy.md section 2).
export function avgEnergy(g) {
  let sum = B.ZERO;
  for (const w of g.state.works) {
    const a = g.work.get(w.a);
    if (a.type === 3) sum = B.add(sum, B.div(E.energyAmount(a, w.lv), E.REST_TICK));
  }
  return sum;
}

// Rewards beyond types 1-4 that these facilities pay (DataManager.GetReward_Inner switch, specials.md header).
const REWARDS = {
  101: (g, v) => { const amount = B.mul(g.averageIncome(), v); g.reward(1, amount); return { type: 101, value: v, amount, gold: true }; },
  102: (g, v) => { const amount = B.mul(avgEnergy(g), v); g.reward(2, amount); return { type: 102, value: v, amount, energy: true }; },
  23: (g, v) => { g.state.specials.pudding += Number(v); return { type: 23, value: v }; },
};
for (const t of Object.keys(TICKET_SECONDS)) REWARDS[t] = (g, v) => { const k = g.state.specials.tickets; k[t] = (k[t] || 0) + Number(v); return { type: Number(t), value: v }; };

// Whether game.reward(type, ..) can pay: 1-4 are core, the rest need a feature that lists the type (equip 5, fishing 6002/7).
export const canGive = (g, type) => type <= 4 || !!g.features.find(f => f.rewards && f.rewards[type]);

function weightedPick(g, rows, weight) {
  let total = 0;
  for (const r of rows) total += weight(r);
  let x = g.rng() * total;
  for (const r of rows) { x -= weight(r); if (x < 0) return r; }
  return rows[rows.length - 1];
}

// ---- elephant trader: two daily windows of Init[53] hours, 9 slots drawn per window ----
export function season(ms) { const m = new Date(ms).getMonth(); return [4, 4, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4][m]; } // spring 1 .. winter 4 (inferred)

export function traderWindow(g, ms = nowMs(g)) {
  const d = new Date(ms);
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const len = init(g, INIT.traderHours) * 3600e3;
  const wins = TRADER_OPEN.map((h, i) => ({ id: `${dayKey(base)}#${i}`, start: base + h * 3600e3, end: base + h * 3600e3 + len }));
  const open = wins.find(w => ms >= w.start && ms < w.end);
  if (open) return { open: true, id: open.id, end: open.end, left: (open.end - ms) / 1000 };
  const next = wins.find(w => w.start > ms) || { start: base + 86400e3 + TRADER_OPEN[0] * 3600e3 };
  return { open: false, next: next.start, left: (next.start - ms) / 1000 };
}

function drawStock(g, ms) {
  const rows = g.data.specials.surprise;
  const sea = season(ms);
  const picked = new Set();
  return TRADER_CAT.map((cat, slot) => {
    let pool = rows.filter(r => r[2] === cat && (r[1] === 0 || r[1] === sea) && !picked.has(r[3] * 1e6 + r[4]) && canGive(g, r[3]) && (REWARDS[r[3]] || r[3] === 5));
    if (!pool.length) return null;
    const r = TRADER_WEIGHTED[slot] ? weightedPick(g, pool, x => x[7]) : pool[pickIndex(g, pool.length)];
    picked.add(r[3] * 1e6 + r[4]);
    return { index: r[0], type: r[3], value: r[4], costType: r[5], cost: r[6], bought: false };
  });
}

export function traderStock(g, ms = nowMs(g)) {
  const t = g.state.specials.trader;
  const w = traderWindow(g, ms);
  if (w.open && t.win !== w.id) { t.win = w.id; t.slots = drawStock(g, ms); }
  return w.open ? t.slots : [];
}

// Buy slot i with its price; the reward is only charged when it was paid (equip needs the equip feature).
export function buyTrader(g, i) {
  const s = g.state;
  const slot = traderStock(g)[i];
  if (!slot || slot.bought) return null;
  const cur = CURRENCY[slot.costType];
  if (s[cur] < slot.cost) return { short: cur };
  const given = g.reward(slot.type, slot.type === 5 ? 1 : slot.value, { equip: slot.value, from: 'trader' });
  if (!given) return null;
  s[cur] -= slot.cost;
  slot.bought = true;
  g.emit('trade', { slot: i, given });
  return { given };
}

export function useTicket(g, type) {
  const k = g.state.specials.tickets;
  if (!(k[type] > 0)) return null;
  k[type] -= 1;
  return g.reward(type >= 1200 ? 102 : 101, TICKET_SECONDS[type]);
}

// ---- treasure chest (work 3): 5 opens a day, 60 s apart ----
export function chestWait(g) { return Math.max(0, CHEST_COOLDOWN - (g.state.clock - g.state.specials.chestAt)); }
export function chestReady(g, work) { return work.v >= 1 && chestWait(g) <= 0; }

// how 'free' (the ad button of the original, free here) draws Init[23] cards and spends a daily open; 'gem' draws Init[24]
// cards for 300 gems and spends no open. Returns the reward or null (chest closed, short of gems, equip feature missing).
export function openChest(g, work, how = 'free') {
  const s = g.state, sp = s.specials;
  if (work.a !== WORK.chest) return null;
  if (how === 'gem') {
    if (s.gem < g.data.specials.chestGem) return { short: 'gem' };
    const given = g.reward(5, init(g, INIT.chestGem), { from: 'chest' });
    if (!given) return null;
    s.gem -= g.data.specials.chestGem;
    g.emit('chest', { work, how, given });
    return { given };
  }
  if (!chestReady(g, work)) return null;
  const given = g.reward(5, init(g, INIT.chestFree), { from: 'chest' });
  if (!given) return null;
  work.v -= 1;
  sp.chestAt = s.clock;
  g.emit('chest', { work, how, given });
  return { given };
}

// ---- jar fairy (work 5): the free bubble button pays 1/20 of the jar gold, the ad button all of it ----
export function jarGold(g, divisor = 1) { return B.div(B.mul(g.averageIncome(), init(g, INIT.jar)), divisor); }
export function claimJarFree(g, work) {
  if (work.a !== WORK.jar || work.v < 1) return null;
  work.v = 0;
  work.t = 0;
  const gold = jarGold(g, JAR_FREE_DIVISOR);
  g.state.gold = B.add(g.state.gold, gold);
  g.emit('jar', { work, gold });
  return gold;
}

// ---- search light / balloon (work 12): Init[7] taps, gold = avgGold x Init[9] s ----
export const balloonTaps = g => init(g, INIT.balloonTaps);
export const balloonGold = g => B.mul(g.averageIncome(), init(g, INIT.balloon));
export function popBalloon(g, work) {
  if (work.a !== WORK.light || work.v < 1) return null;
  work.v -= 1;
  const gold = balloonGold(g);
  g.state.gold = B.add(g.state.gold, gold);
  g.emit('balloon', { work, gold });
  return gold;
}

// ---- capsule crane (work 14): a machine of 16 weighted balls, the claw takes a random one ----
const ballRows = g => g.data.specials.balls.filter(b => canGive(g, b.rewardType));
function drawBall(g) { return weightedPick(g, ballRows(g), b => b.weight).index; }
export function craneBalls(g) {
  const sp = g.state.specials;
  while (sp.balls.length < BALL_SLOTS) sp.balls.push(drawBall(g));
  return sp.balls;
}
export function playCrane(g, work) {
  if (work.a !== WORK.crane || work.v < 1) return null;
  const sp = g.state.specials;
  const balls = craneBalls(g);
  const slot = pickIndex(g, balls.length);
  const row = g.data.specials.balls.find(b => b.index === balls[slot]);
  const given = g.reward(row.rewardType, row.rewardValue, { from: 'crane' });
  if (!given) return null;
  work.v -= 1;
  balls[slot] = drawBall(g);
  sp.craneAt = g.state.clock;
  g.emit('crane', { work, ball: row, slot, given });
  return { slot, ball: row, given };
}

// ---- basketball (work 97): Init[48] s ready + Init[49] s of play, Init[50] points per goal; every tier reached pays (inferred) ----
export const basketRules = g => ({ ready: init(g, INIT.basketReady), time: init(g, INIT.basketTime), perGoal: init(g, INIT.basketScore), tiers: g.data.specials.basketball });
export function startBasket(g, work) {
  if (work.a !== WORK.basket || work.v < 1 || g.state.specials.basket.playing) return false;
  work.v -= 1;
  g.state.specials.basket.playing = true;
  return true;
}
export function finishBasket(g, work, goals) {
  const b = g.state.specials.basket;
  if (!b.playing) return null;
  b.playing = false;
  const points = goals * init(g, INIT.basketScore);
  b.total += points;
  b.best = Math.max(b.best, points);
  const given = g.data.specials.basketball.filter(t => points >= t.score).map(t => g.reward(t.rewardType, t.rewardValue, { from: 'basketball' })).filter(Boolean);
  g.emit('basketball', { work, points, given });
  return { points, given };
}

// ---- music player (work 90): owned tracks and the chosen one; no audio files of the tracks are exported yet ----
export function buyBgm(g, index) {
  const sp = g.state.specials, s = g.state;
  const row = g.data.specials.bgm.find(b => b.index === index);
  if (!row || sp.bgmOwned.includes(index)) return null;
  const cur = CURRENCY[row.costType];
  if (!cur) return null;
  if (s[cur] < row.cost) return { short: cur };
  s[cur] -= row.cost;
  sp.bgmOwned.push(index);
  g.emit('bgm', { index });
  return { index };
}
export function selectBgm(g, index) {
  const sp = g.state.specials;
  if (!sp.bgmOwned.includes(index)) return false;
  sp.bgm = index;
  return true;
}

// ---- special order board (work 8): sell Init-random 3..6 of one learned dish, gold = avgGold x Init[10] s ----
export const orderGold = g => B.mul(g.averageIncome(), init(g, INIT.order));
export function refreshOrder(g) {
  const foods = [0, 1, 2].filter(l => g.cookBuilt(l)).flatMap(l => g.learned(l));
  const o = g.state.specials.order;
  if (!foods.length) { o.food = 0; o.need = 0; o.have = 0; return o; }
  o.food = foods[pickIndex(g, foods.length)];
  o.need = 3 + pickIndex(g, 4);                         // RandomValue(3, 7)
  o.have = 0;
  return o;
}
export const orderDone = g => { const o = g.state.specials.order; return o.need > 0 && o.have >= o.need; };
export function claimOrder(g, work) {
  if (work.a !== WORK.board || !orderDone(g)) return null;
  const gold = orderGold(g);
  g.state.gold = B.add(g.state.gold, gold);
  g.emit('specialorder', { work, gold });
  refreshOrder(g);
  return gold;
}

// ---- daily reset (Spawn.RefreshDayWorkCount): works with dailyCount are refilled to it ----
function newDay(g) {
  const sp = g.state.specials;
  sp.day = dayKey(nowMs(g));
  for (const w of g.state.works) { const a = g.work.get(w.a); if (a.dailyCount > 0) w.v = a.dailyCount; }
  g.emit('newday', { day: sp.day });
}

export default {
  id: 'specials',
  data: ['specials'],
  init(g) {
    const s = g.state;
    if (!s.specials) {
      s.specials = { skewMs: 0, day: dayKey(Date.now()), chestAt: -CHEST_COOLDOWN, balls: [], tickets: {}, pudding: 0,
        trader: { win: '', slots: [] }, basket: { playing: false, total: 0, best: 0 },
        bgmOwned: [...DEFAULT_BGM], bgm: DEFAULT_BGM[0],
        order: { food: 0, need: 0, have: 0 }, dayCheck: 0 };
    }
    if (!s.specials.order.need) refreshOrder(g);
    if (s.specials.day !== dayKey(nowMs(g))) newDay(g);
  },
  tick(g, dt) {
    const sp = g.state.specials;
    sp.dayCheck += dt;
    if (sp.dayCheck < 1) return;
    sp.dayCheck = 0;
    if (sp.day !== dayKey(nowMs(g))) newDay(g);
    if (!sp.order.need && g.state.works.length) refreshOrder(g);
  },
  onEvent(g, e) {
    if (e.type !== 'sell' || !g.state.specials) return;
    const o = g.state.specials.order;
    if (o.need && e.item.a === o.food && o.have < o.need) o.have += 1;
  },
  rewards: REWARDS,
  claimJarFree, openChest, popBalloon, playCrane, startBasket, finishBasket, buyBgm, selectBgm, claimOrder, buyTrader, useTicket,
};
