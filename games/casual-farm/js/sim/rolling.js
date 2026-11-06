// Rolling offer ladder (RollingOfferManager / RollingOfferHolder; rules/rolling-offer.md, census-daily-shop.md
// "Rolling offer"). One global index (RollingOfferIndex_2 -> g.ro) runs through the 13 steps of RC_RollingOffer once;
// claiming a step unlocks the next one at once, with no timer and no reset.
// Ads steps are free claims like every ad in this build. [ĐỀ XUẤT] The two real-money steps (6 and 11) are passed over,
// as the cosmetics shop leaves out its real-money items, and the ladder runs on to the steps behind them.
import { couponToGem, freeCashMultiplier } from './daily.js';

export const FREE = 0, ADS = 1, IAP = 2;
// RORewardType: 0 ExtraCashFormula, 1 FixedCash, 2 Coupon, 3..7 Booster Player / Worker / Machine / Revenue / Customer.
const BOOSTERS = { 3: 'player', 4: 'worker', 5: 'machine', 6: 'cash', 7: 'customer' };
// RC_RollingOffer configs: [roType, [rewardType, amount]...]; booster amounts are minutes.
export const LADDER = [
  [FREE, [[0, 50]]],
  [ADS, [[5, 10]]],
  [FREE, [[0, 100]]],
  [ADS, [[2, 1], [3, 5]]],
  [FREE, [[4, 10]]],
  [IAP, [[1, 30000], [6, 15]]],
  [ADS, [[7, 10]]],
  [FREE, [[0, 100]]],
  [ADS, [[5, 15]]],
  [FREE, [[2, 1], [3, 10]]],
  [IAP, [[1, 100000], [4, 15]]],
  [FREE, [[0, 200]]],
  [ADS, [[6, 10], [7, 10]]],
].map(([type, list]) => ({ type, list }));

const skipIap = i => { while (i < LADDER.length && LADDER[i].type === IAP) i++; return i; };
// The step that can be claimed now (LADDER.length when all are done: the "Coming soon!" card).
export const current = g => skipIap(g.ro || 0);

// RollingOfferHolder.Awake / GiveReward: what one reward line pays.
export function pay([type, amount], { cheapest, g }) {
  if (type === 0) return { kind: 'cash', amount: Math.trunc(Math.trunc(amount / 100 * cheapest) * freeCashMultiplier(g)) };
  if (type === 1) return { kind: 'cash', amount: Math.trunc(amount * freeCashMultiplier(g)) };
  if (type === 2) return { kind: 'gems', amount: couponToGem(amount) };
  return { kind: 'boost', boost: BOOSTERS[type], seconds: amount * 60 };
}

// Claims step i if it is the current one: returns what it pays and moves the index on.
export function claim(g, i, ctx) {
  if (i !== current(g) || i >= LADDER.length) return null;
  const out = LADDER[i].list.map(r => pay(r, ctx));
  g.ro = skipIap(i + 1);
  return out;
}
