// Shop (Funflare RC_Shop) and its daily deals: rules/shop-ui.md and census-daily-shop.md section 4. State lives in the
// global save as g.shop = { on, bought: {id: n}, cool: {id: until ms}, deal: {day, mask} }.
// [ĐỀ XUẤT] The shipped prices are placeholders (the real ones come from the server key rc_shop), so this build prices
// bundles at the game's own exchange rate (GemManager: one gem = 8 x StoreCashMultiplier cash) and keeps the shipped
// sale ratio; Rewarded items are free claims with a COOL wait, because without the video a tap would print money.
// Dropped: special offers and coin_bundle_01 (real money), coin_bundle_04 (cash bought with cash).
export const AD = 'ad', FREE = 'free', GEM = 'gem', CASH = 'cash';
export const COOL = 300;
export const CATEGORIES = [
  { id: 'coin_bundles', name: 'Coin Bundles' },
  { id: 'gem_bundles', name: 'Gem Bundles' },
  { id: 'daily_deals', name: 'Daily Deals' },
];
// RC_Shop shopItems in the web's reading: ord = orderInCategory, pay = purchaseType, sale = [price, priceCut] when
// isSaleOn, once = productType NonConsumable, badge = badgeText.
export const ITEMS = [
  { id: 'coin_bundle_02', cat: 'coin_bundles', ord: 1, pay: AD },
  { id: 'coin_bundle_03', cat: 'coin_bundles', ord: 2, pay: GEM, sale: [5, 3] },
  { id: 'coin_bundle_05', cat: 'coin_bundles', ord: 4, pay: FREE, once: true },
  { id: 'coin_bundle_06', cat: 'coin_bundles', ord: 5, pay: GEM },
  { id: 'gem_bundle_01', cat: 'gem_bundles', ord: 0, pay: CASH },
  { id: 'gem_bundle_02', cat: 'gem_bundles', ord: 1, pay: CASH },
  { id: 'gem_bundle_03', cat: 'gem_bundles', ord: 2, pay: AD },
  { id: 'gem_bundle_04', cat: 'gem_bundles', ord: 3, pay: CASH, badge: 'BUY ME PLZ :)' },
  { id: 'gem_bundle_05', cat: 'gem_bundles', ord: 4, pay: AD },
  { id: 'gem_bundle_06', cat: 'gem_bundles', ord: 5, pay: AD },
  { id: 'daily_deal_01', cat: 'daily_deals', ord: 0, pay: FREE },
  { id: 'daily_deal_02', cat: 'daily_deals', ord: 1, pay: GEM, gems: 5 },
  { id: 'daily_deal_03', cat: 'daily_deals', ord: 2, pay: AD },
];
// RC_CurrencyOffer rc_offer_cash / rc_offer_gems: amount per slot, "was" value, multiplier by total feature count.
const OFFER = {
  coin_bundles: { reward: 'reward_cash', amounts: [10, 50, 80, 150, 250, 1000], was: [0, 25, 40, 100, 125, 500],
    mult: [[1, 1.1], [2, 1.2], [3, 1.3], [4, 1.4]] },
  gem_bundles: { reward: 'reward_gem', amounts: [5, 15, 40, 80, 130, 200], was: [0, 5, 0, 0, 50, 100],
    mult: [[1, 1.0], [2, 1.1], [5, 1.2], [7, 1.3], [10, 1.4]] },
};
// rc_offer_daily_pool: timed rewards last `amount` minutes.
export const DAILY_POOL = [
  { item: 'reward_cash', amount: 100 }, { item: 'reward_gem', amount: 5 }, { item: 'reward_gem', amount: 25 },
  { item: 'reward_cash', amount: 200 }, { item: 'reward_faster_workers', amount: 15 }, { item: 'reward_faster_player', amount: 15 },
  { item: 'reward_extra_customers', amount: 15 }, { item: 'reward_super_worker', amount: 15 }, { item: 'reward_cash', amount: 300 },
  { item: 'reward_gem', amount: 10 },
];
// ShopItemRewardGiver's timed rewards, played through this build's boosters. [ĐỀ XUẤT] The Super Worker does not
// exist here, so it becomes the worker booster.
export const TIMED = { reward_faster_workers: 'worker', reward_faster_player: 'player', reward_extra_customers: 'customer',
  reward_super_worker: 'worker' };

// RC_CashMultiplier storeCashMultiplier: only Store (scene 1) has rows, by distinct items unlocked there.
const STORE_CASH = { 1: [1.0, 2.5, 4.5, 6.0, 7.0] };
export function storeCashMultiplier(g) {
  const rows = STORE_CASH[g.maxLevel || 0];
  return rows ? rows[Math.min(g.maxItems || 0, rows.length - 1)] : 1.0;
}
// GemManager.GemToCash / CashToGem at rate 8 x StoreCashMultiplier.
export const gemToCash = (gems, g) => Math.trunc(8 * storeCashMultiplier(g) * gems);
export const cashToGem = (cash, g) => Math.max(1, Math.trunc(cash / (8 * storeCashMultiplier(g))));

// Math.Round (banker's rounding), what RC_CurrencyOffer rounds the bundle to before x 5.
export function roundHalfEven(x) {
  const f = Math.floor(x), d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

// System.Random (the .NET/Mono subtractive generator) for the daily-deal shuffle, so a date deals what it dealt.
export class NetRandom {
  constructor(seed) {
    const MBIG = 2147483647, a = new Array(56).fill(0);
    let mj = 161803398 - Math.abs(seed), mk = 1;
    a[55] = mj;
    for (let i = 1; i < 55; i++) {
      const ii = (21 * i) % 55;
      a[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = a[ii];
    }
    for (let k = 1; k < 5; k++) {
      for (let i = 1; i < 56; i++) {
        a[i] -= a[1 + (i + 30) % 55];
        if (a[i] < 0) a[i] += MBIG;
      }
    }
    Object.assign(this, { a, inext: 0, inextp: 21, MBIG });
  }

  sample() {
    if (++this.inext >= 56) this.inext = 1;
    if (++this.inextp >= 56) this.inextp = 1;
    let r = this.a[this.inext] - this.a[this.inextp];
    if (r === this.MBIG) r--;
    if (r < 0) r += this.MBIG;
    this.a[this.inext] = r;
    return r * (1 / this.MBIG);
  }

  next(max) { return Math.floor(this.sample() * max); }
}

// Extensions.Shuffle(list, seed): Fisher-Yates from the end.
export function shuffle(n, seed) {
  const l = Array.from({ length: n }, (_, i) => i), r = new NetRandom(seed);
  for (let m = n; m > 1;) {
    const k = r.next(m);
    m--;
    [l[k], l[m]] = [l[m], l[k]];
  }
  return l;
}

// DailyDealManager: the deal day is the UTC date; seed = year + month + day.
export const utcDay = (now = new Date()) => `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
export const dealSeed = day => day.split('-').reduce((s, x) => s + +x, 0);
export function secondsToUtcMidnight(now = new Date()) {
  const m = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(0, (m - now) / 1000);
}

export function shopState(g, now = new Date()) {
  g.shop = g.shop || { on: false, bought: {}, cool: {}, deal: null };
  const day = utcDay(now);
  if (!g.shop.deal || g.shop.deal.day !== day) g.shop.deal = { day, mask: 0 };
  return g.shop;
}

// FunflareUtils.GetTotalFeatureCount: every mart reached counts 1 (the PlayerPrefs default) plus each mat it activated.
export const featureCount = doneByMart => doneByMart.reduce((s, n) => s + 1 + n, 0);

function multFor(table, fc) {
  let m = 1.0, best = 0;
  for (const [n, k] of table) if (n > 0 && n <= fc && n > best) { best = n; m = k; }
  return m;
}

// What an item pays: [{ item, amount }] plus the struck-out "was" amount of a bundle.
export function rewards(it, ctx) {
  if (it.cat === 'daily_deals') {
    const s = shopState(ctx.g, ctx.now).deal, perm = shuffle(DAILY_POOL.length, dealSeed(s.day));
    const p = DAILY_POOL[perm[Math.min(it.ord, 2)]];
    const amount = p.item === 'reward_cash' ? Math.trunc(storeCashMultiplier(ctx.g) * p.amount) : p.amount;
    return { list: [{ item: p.item, amount }], was: 0 };
  }
  const o = OFFER[it.cat], i = Math.min(it.ord, o.amounts.length - 1), m = multFor(o.mult, ctx.features);
  const cash = o.reward === 'reward_cash' ? storeCashMultiplier(ctx.g) : 1;
  const amount = Math.trunc(roundHalfEven(m * o.amounts[i] / 5) * 5 * cash);
  const was = Math.trunc(roundHalfEven(m * o.was[i] / 5) * 5 * cash);
  return { list: [{ item: o.reward, amount }], was: was > 0 && was < amount ? was : 0 };
}

// What an item costs: { pay, amount, was } (was = the struck-out normal price on sale).
export function price(it, ctx) {
  if (it.pay === AD || it.pay === FREE) return { pay: it.pay, amount: 0, was: 0 };
  if (it.gems) return { pay: GEM, amount: it.gems, was: 0 };
  const r = rewards(it, ctx).list[0];
  const full = it.pay === GEM ? cashToGem(r.amount, ctx.g) : gemToCash(r.amount, ctx.g);
  if (!it.sale) return { pay: it.pay, amount: full, was: 0 };
  return { pay: it.pay, amount: Math.max(1, Math.round(full * it.sale[1] / it.sale[0])), was: full };
}

// GetAvailability: a bought non-consumable leaves the list, a bought daily deal stays greyed until the next UTC day,
// a Rewarded item waits out its COOL.
export function availability(it, ctx) {
  const s = shopState(ctx.g, ctx.now);
  if (it.once && s.bought[it.id]) return 'gone';
  if (it.cat === 'daily_deals' && s.deal.mask & (1 << (it.ord + 1))) return 'bought';
  if (it.pay === AD && (s.cool[it.id] || 0) > +ctx.now) return 'cooling';
  return 'open';
}

// The SKIP gem button (ShopItemSlot.InitGemButton): on Rewarded items whose first reward is not gems, RvToGem(1) = 4.
// Here it only shows while the free claim is cooling down.
export const SKIP_GEMS = 4;
export const canSkip = it => it.pay === AD && it.cat !== 'gem_bundles';

// One purchase: pays, records, and returns the rewards to hand out, or a failure reason.
export function buy(it, ctx, { skip = false } = {}) {
  const s = shopState(ctx.g, ctx.now), av = availability(it, ctx);
  if (av === 'gone' || av === 'bought') return { ok: false, why: av };
  if (av === 'cooling' && !(skip && canSkip(it))) return { ok: false, why: 'cooling' };
  const p = price(it, ctx), g = ctx.g;
  if (skip) {
    if ((g.gems || 0) < SKIP_GEMS) return { ok: false, why: 'gems' };
    g.gems -= SKIP_GEMS;
  } else if (p.pay === GEM) {
    if ((g.gems || 0) < p.amount) return { ok: false, why: 'gems' };
    g.gems -= p.amount;
  } else if (p.pay === CASH) {
    if (ctx.cash() < p.amount) return { ok: false, why: 'cash' };
    ctx.spendCash(p.amount);
  }
  const r = rewards(it, ctx);
  s.bought[it.id] = (s.bought[it.id] || 0) + 1;
  if (it.cat === 'daily_deals') s.deal.mask |= 1 << (it.ord + 1);
  else if (it.pay === AD && !skip) s.cool[it.id] = +ctx.now + COOL * 1000;
  return { ok: true, list: r.list };
}

// The HUD dot (ShopMenuButton): lit when the number of open items differs from the count seen at the last tap.
export const openCount = ctx => ITEMS.filter(it => availability(it, ctx) === 'open').length;
