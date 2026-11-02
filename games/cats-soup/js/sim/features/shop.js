// Feature "shop" (sim part): the gem / ticket shop, the stamp rally, the offline-earnings ad and the double-speed ad.
// Rules: D:/catsoup-ref/rules/shop.md. Contract: js/sim/registry.js. Tables: data/shop.json (tools/export_shop.py).
//
// State game.state.shop = { day, bought: { <Shop index>: { n, day, at } }, stamps, stampDay, stampToday, adsBought: { <ShopAds index>: 1 }, doubleSec }
// The offline result of this session (not saved) is read with away(game); the ad x2 pays through claimOfflineAds.

import * as B from '../big.js';

const S = g => g.state.shop;
const D = g => g.data.shop;

export const dayKey = (ms = Date.now()) => {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// UI_Stage.RewardAds_DoubleSpeed (UI_Stage.c:34048): DataManager.SetDoubleSpeedTime(300). msg_ads_doubleSpeed says "5 phut".
export const DOUBLE_SECONDS = 300;
export const COST = { gem: 3, coin: 4, ad: 9 };                    // Shop.costType: 3 gems, 4 furniture coins, 9 watch an ad, 5 real money
export const TICKET_COST = new Set([1101, 1102, 1103, 1201, 1202, 1203]); // costType is a ticket reward type (Shop rows 141-146)
// Shop.shopType: 2 goods ("Vat pham"), 0 special (real-money), 1 subscription (real-money). UI_Shop tabs t1/t2/t3.
export const TAB = { special: 0, term: 1, goods: 2 };

// ---- rewards the shop can hand over ----
// Types that game.reward can pay: 1-4 core, others only when some feature lists them (specials: 101, 102, tickets).
export const canGive = (g, type) => type <= 4 || !!g.features.find(f => f.rewards && f.rewards[type]);

// ---- offline time bonus of the fish collection (Ability type 11, subIndex 1005 "offline time", collection.md) ----
// LimitOfflineRewardTime = (1 + bonus / 100) x the base window (DataManager.c:121242, economy.md 166). The core pays the base window
// at load; when the player was away longer than it, the extra part of the window is paid here in proportion to what the base paid.
export const OFFLINE_SUB = 1005;
export const offlinePercent = g => (g.feat.collection && g.feat.collection.subPercent ? g.feat.collection.subPercent(g, OFFLINE_SUB) : 0);
export function offlineExtra(g, sec, raw, r) {
  const pct = offlinePercent(g);
  if (!r || pct <= 0 || raw <= sec) return 0;
  const extra = Math.min(raw, sec * (1 + pct / 100)) - sec;
  if (extra <= 0) return 0;
  const k = extra / sec;
  const gold = B.mul(r.gold, k), energy = B.mul(r.energy, k);
  g.reward(1, gold);
  g.reward(2, energy);
  r.gold = B.add(r.gold, gold);
  r.energy = B.add(r.energy, energy);
  r.seconds = sec + extra;
  return extra;
}

// ---- offline result of this session ----
const AWAY = new WeakMap();
export const away = g => AWAY.get(g) || null;
export const clearAway = g => AWAY.delete(g);

// ---- items ----
export const itemRow = (g, index) => D(g).items.find(r => r.index === index) || null;
export const listed = (g, tab) => D(g).items.filter(r => r.shopType === tab).sort((a, b) => a.slot - b.slot || a.index - b.index);

// UI_Shop.CheckBuyGoods (UI_Shop.c:38): bought once when the purchase count has reached limitCount; BuyNow (UI_Shop.c:1567) refuses
// a duration -1 item with msg_alreadyPurchase. duration 0 is a consumable (no record); duration 1 is a daily item (record lives a day).
export function boughtCount(g, row) {
  const b = S(g).bought[row.index];
  if (!b) return 0;
  if (row.duration > 0 && b.day !== dayKey()) return 0;
  return b.n;
}

function rollover(g, now = Date.now()) {
  const s = S(g), day = dayKey(now);
  if (s.day === day) return false;
  s.day = day;
  for (const k of Object.keys(s.bought)) if (itemRow(g, +k)?.duration > 0) delete s.bought[k];
  g.emit('shopReset', { day });
  return true;
}

const haveTickets = (g, type) => g.itemCount(type);
const priceOf = row => (row.costType === COST.ad ? 0 : row.cost);

// Gem packages (rewardType 9, Package rows in row.pack = [[type, value], ...]): costumes (5), furniture (6), skins (14 lamp, 22 theme,
// 26 work skin, 27 sign skin) and gems. Listed only when every part has a feature that can pay it (a part of value 0 of a type
// nobody pays, e.g. 19, keeps the package out).
export const packPayable = (g, row) => !!row.pack && row.pack.length > 0 && row.pack.every(([t]) => canGive(g, t));

// Why an item cannot be bought now: 'iap' (real money), 'unsupported' (reward or cost not in this port), 'owned', 'gem', 'coin', 'ticket'.
export function blocked(g, row) {
  if (row.iap || row.costType === 5) return 'iap';
  // rewardType 6 (rows 24-26) has rewardValue -1 = no fixed furniture: the furniture feature sells its own stock, so it stays out of here
  if (row.pack) { if (!packPayable(g, row)) return 'unsupported'; }
  else if (row.rewardType === 6 || !canGive(g, row.rewardType)) return 'unsupported';
  if (row.costType !== COST.gem && row.costType !== COST.coin && row.costType !== COST.ad && !TICKET_COST.has(row.costType)) return 'unsupported';
  if (row.duration !== 0 && boughtCount(g, row) >= row.limit) return 'owned';
  if (row.costType === COST.gem && g.state.gem < row.cost) return 'gem';
  if (row.costType === COST.coin && g.state.coin < row.cost) return 'coin';
  if (TICKET_COST.has(row.costType) && haveTickets(g, row.costType) < row.cost) return 'ticket';
  return null;
}

// Pays the item. Returns { row, given } or { row, why } when refused.
export function buy(g, index) {
  const row = itemRow(g, index);
  if (!row) return null;
  rollover(g);
  const why = blocked(g, row);
  if (why) return { row, why };
  const s = g.state;
  if (row.costType === COST.gem) s.gem -= row.cost;
  else if (row.costType === COST.coin) s.coin -= row.cost;
  else if (TICKET_COST.has(row.costType)) g.spendItem(row.costType, row.cost);
  // a package hands over every part (an equipment part names its outfit through extra.equip, DataManager.GetReward_Inner type 5)
  const given = row.pack ? row.pack.map(([t, v]) => g.reward(t, t === 5 ? 1 : v, { equip: v, from: 'shop' })) : g.reward(row.rewardType, row.rewardValue);
  if (!given || (row.pack && !given.some(Boolean))) { // nothing was paid (should not happen after blocked()): give the price back
    if (row.costType === COST.gem) s.gem += row.cost;
    else if (row.costType === COST.coin) s.coin += row.cost;
    else if (TICKET_COST.has(row.costType)) g.reward(row.costType, row.cost);
    return { row, why: 'unsupported' };
  }
  if (row.duration !== 0) {
    const b = (S(g).bought[row.index] ||= { n: 0, day: '', at: 0 });
    b.n += 1; b.day = dayKey(); b.at = Date.now();
  }
  g.emit(row.costType === COST.ad ? 'shopAd' : 'shopBuy', { index, costType: row.costType, cost: priceOf(row) });
  return { row, given };
}

// ---- stamp rally (ShopAds.json): an ad view = Init[39] stamps (DataManager.get_PerView_AdsStamp, DataManager.c:52176) ----
// MaxStamp_PerDay = Init[40] (DataManager.get_MaxStamp_PerDay, DataManager.c:52045) caps the stamps of one calendar day.
export function watchStamp(g) {
  const s = S(g), i = D(g).init;
  if (s.stampDay !== dayKey()) { s.stampDay = dayKey(); s.stampToday = 0; }
  if (s.stampToday + i.perViewStamp > i.maxStampPerDay) return 0;
  const n = i.perViewStamp;
  s.stampToday += n;
  S(g).stamps += n;
  g.emit('shopAd', { index: -1, stamps: n });
  return n;
}
// Only equipment (rewardType 5, rewardValue = Equip index) can be handed over by the equip feature.
export const stampRows = g => D(g).ads.filter(r => r.rewardType === 5 && r.category === 0 && canGive(g, 5)).sort((a, b) => a.slot - b.slot || a.index - b.index);
export function buyStamp(g, index) {
  const row = D(g).ads.find(r => r.index === index);
  const s = S(g);
  if (!row || row.rewardType !== 5 || !canGive(g, 5)) return { why: 'unsupported' };
  if (s.adsBought[index]) return { row, why: 'owned' };
  if (s.stamps < row.require) return { row, why: 'stamp' };
  const given = g.reward(5, 1, { equip: row.rewardValue });
  if (!given) return { row, why: 'unsupported' };
  s.stamps -= row.require;
  s.adsBought[index] = 1;
  g.emit('shopBuy', { index: -index - 1, costType: 'stamp', cost: row.require });
  return { row, given };
}

// ---- offline earnings ad ----
// UI_OfflineGold.GetGold_Ads (UI_OfflineGold.c:166) pays the result x Init[16] (OfflineAdsFactor, DataManager.c:86698/86635). The
// core pays x1 when the game loads, so the ad pays the remaining (factor - 1) x the same amounts, at once, once.
export function claimOfflineAds(g) {
  const a = away(g);
  if (!a || a.doubled) return null;
  a.doubled = true;
  const k = D(g).init.offlineAdsFactor - 1;
  const gold = g.reward(1, mulBig(a.gold, k)), energy = g.reward(2, mulBig(a.energy, k));
  g.emit('shopAd', { index: -2, offline: true });
  return { gold: gold && gold.value, energy: energy && energy.value };
}
const mulBig = (b, k) => ({ f: b.f * k, e: b.e });

// ---- double speed ad (UI_Stage.RewardAds_DoubleSpeed, UI_Stage.c:34048) ----
export const doubleLeft = g => S(g).doubleSec;
export const doubleActive = g => S(g).doubleSec > 0;
export function startDouble(g) {
  if (doubleActive(g)) return false;
  S(g).doubleSec = DOUBLE_SECONDS;
  g.emit('shopAd', { index: -3, double: true });
  return true;
}
// Shown once a cooking facility is built with its cat (the button speeds up cooking only) and while no boost runs.
export const doubleAvailable = g => !doubleActive(g) && g.state.works.some(w => g.work.get(w.a).type === 1 && g.catOf(w));

// Cooking time x DoubleSpeedFactor (Init[17] = 0.5, UI_Stage+_SetWorkTimeUI_Coroutine_d__328.c:207): the progress of every
// cooking facility runs 1 / 0.5 = 2x, so the boost adds (1 / factor - 1) x dt of extra progress. (inferred: the production tick
// UpdateWorkTime did not decompile; the work timer UI is the evidence.)
function boost(g, dt) {
  const s = S(g);
  const used = Math.min(dt, s.doubleSec);
  s.doubleSec = Math.max(0, s.doubleSec - dt);
  const extra = used * (1 / D(g).init.doubleSpeedFactor - 1);
  for (const w of g.state.works) {
    const a = g.work.get(w.a);
    if (a.type !== 1 || !g.catOf(w)) continue;
    w.t += extra;
    while (w.t >= a.completeTime) { w.t -= a.completeTime; g.cook(w); }
  }
  if (s.doubleSec <= 0) g.emit('doubleSpeedEnd');
}

export default {
  id: 'shop',
  data: ['shop'],
  init(g) {
    if (!g.state.shop) g.state.shop = { day: '', bought: {}, stamps: 0, adsBought: {}, doubleSec: 0 };
    rollover(g);
  },
  tick(g, dt) {
    const s = S(g);
    s.poll = (s.poll || 0) + dt;
    if (s.poll >= 5) { s.poll = 0; rollover(g); }
    if (s.doubleSec > 0) boost(g, dt);
  },
  // Keeps what core paid for the offline popup and its x2 ad.
  offline(g, sec, raw, r) {
    rollover(g);
    offlineExtra(g, sec, raw, r);
    if (r && (r.gold.f || r.energy.f)) AWAY.set(g, { seconds: r.seconds, gold: r.gold, energy: r.energy, doubled: false });
  },
  listed, itemRow, boughtCount, blocked, buy, watchStamp, stampRows, buyStamp, away, clearAway, claimOfflineAds, doubleLeft, doubleActive,
  startDouble, doubleAvailable, canGive, rollover, packPayable, offlinePercent, offlineExtra,
};
