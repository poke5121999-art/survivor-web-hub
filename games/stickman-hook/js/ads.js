// Rewarded ads and in-app purchases. The owner's rule (2026-10-29): every rewarded-ad button and every IAP button of the
// original shows as it does there, and a click grants its reward at once: no ad video, no store, no price charged.
// Rules only (no DOM): daily.js, bonus.js, endgame.js, race.js, cardsui.js and menus.js call them. Data: data/ads.json
// (tools/build_ads.py: market offers, contents, prices, view titles, requirements), loaded with js/bonus.js.
import { SKIP_TICKETS, qty, addQty } from './meta.js';

export const VIP = 'flag.vip', NO_ADS = 'flag.no_ads', OLD_NO_ADS = 'flag.old_no_ads';
// ads.placements rewarded.default: skipPrice 1 currency.skip_tickets, freeSkipRequirementId has_old_no_ads (flag.old_no_ads,
// granted only by offer.old_no_ads, whose display requirement is "disabled" in 9.9.60). Every rewarded placement falls
// back to this one (formats REWARDED fallbackPlacementId).
const PRICE = [SKIP_TICKETS, 1];
const flag = (s, f) => s.flags[f] || 0;

// AdController.<SafelyDisplayAd> [asm 0x2dfae04]: FREE_SKIP when the free skip requirement holds (flag.old_no_ads)
// [asm 0x2dfafcc..0x2dfb04c]; else PAID_SKIP when the skip tickets cover the price: the price is taken and no ad shows
// (GetQuantity >= quantity [asm 0x2dfb1c4..0x2dfb208], AddQuantity(-price) [asm 0x2dfb3ac]); else the ad plays. Here the
// ad case grants at once. Returns 'vip' | 'ticket' | 'ad'; every caller grants its reward right after.
export function watch(s) {
  if (flag(s, OLD_NO_ADS) > 0) return 'vip';
  if (qty(s, PRICE[0]) >= PRICE[1]) { addQty(s, PRICE[0], -PRICE[1]); return 'ticket'; }
  return 'ad';
}

// NoAdsIconChanger.UpdateUI [asm 0x1130554] / RewardedButton.UpdateView [asm 0x1130d00]: the button's icon is the old VIP
// crown with flag.old_no_ads, the skip ticket with >= 1 ticket [asm 0x11306a0..0x11306cc], else the video (AdIcon).
export function adIcon(s) { return flag(s, OLD_NO_ADS) > 0 ? 'vip' : qty(s, PRICE[0]) >= 1 ? 'ticket' : 'video'; }

// AdsService.CanSkip [asm 0x2df25c4]: false when the free skip requirement holds, else tickets > price, strictly
// [asm 0x2df2724..0x2df2730] (SafelyDisplayAd pays from tickets >= price). So one ticket pays the ad but CanSkip is false:
// SkipButtonView keeps the ad sprite [asm 0x12a3910..0x12a3968] and ActionButton keeps the VIP button with one ticket.
export function canSkip(s) { return flag(s, OLD_NO_ADS) < 1 && qty(s, PRICE[0]) > PRICE[1]; }

// ActionButton.ShouldShowNoAdsButton [asm 0x12649fc]: state AVAILABLE_REWARDED, CanSkipRewarded false (the caller passes
// CanSkip, e.g. PiggyBankPopup.Fill [asm 0x1177ecc]) and flag.vip < 1. RewardedButton's own VIP button: flag.vip < 1 and
// no ticket [asm 0x1130e84..0x1130ec8]. Both open the VIP offer (VipOfferWidget), here: buy it.
export function vipSkip(s) { return !canSkip(s) && flag(s, VIP) < 1; }

const DAY = 86400000;
const midnight = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
// periodic_resources: daily.* (1 day) and weekly.* (1 week), isUtc false. save.periodic[id] = the period of the last
// grant: the YYYYMMDD day id (bonus.js dayId, as daily.free_coins always was) or the local Monday's day id for weeks.
// [ĐỀ XUẤT] weeks start on Monday at 00:00 local time, like the Adventure week.
export function periodId(unit, t = Date.now()) {
  let d = new Date(t);
  if (unit === 'WEEKS') d = new Date(midnight(t) - ((d.getDay() + 6) % 7) * DAY);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// The market (MarketService) on a save: offers visible by their display requirement, priced by the first price whose
// display requirement holds, bought by FREE / REWARDED / IAP payment. `m` is the Meta (grants), `d` data/ads.json.
export class Shop {
  constructor(m, d) {
    this.m = m; this.d = d;
    this.byId = new Map(d.offers.map((o) => [o.id, o]));
  }

  // inventory quantities as the requirements read them
  inv(s, key) {
    if (key === 'currency.skin_coins') return s.coins;
    if (key.startsWith('flag.')) return flag(s, key);
    if (key.startsWith('mode.')) return s.modes[key]?.unlocked ? 1 : 0;
    return qty(s, key);
  }

  periodic(s, id, now) {
    const p = this.d.periodic[id];
    return p && s.periodic[id] === periodId(p[1], now) ? 1 : 0;
  }

  // RequirementsService: groups AND / OR, then the requirement types the market uses.
  req(s, id, now = Date.now()) {
    const r = this.d.reqs[id];
    if (!r) return true;
    if (r.g) return r.g === 'OR' ? r.of.some((x) => this.req(s, x, now)) : r.of.every((x) => this.req(s, x, now));
    const cmp = (a) => ({ '<': a < r.v, '<=': a <= r.v, '>': a > r.v, '>=': a >= r.v, '==': a === r.v }[r.c] ?? false);
    switch (r.t) {
      case 'static': return !!r.v;
      case 'inventory': return cmp(this.inv(s, r.k));
      // has_cards: any card in the inventory (category "card")
      case 'inventory_category': return cmp(Object.keys(s.inv).filter((k) => k.startsWith(r.k + '.') && s.inv[k] > 0).length);
      case 'periodic_resource': return cmp(this.periodic(s, r.k, now));
      // every_2d_since_install_before_1d / _after_1d: cycle 2 days, duration 1 day, comparator <= (in the first day of
      // each cycle) or > (in the second). [ĐỀ XUẤT] calendar days at local midnight since the first run (save.installed).
      case 'calendar_time_since_install': {
        const days = Math.floor((midnight(now) - midnight(s.installed || now)) / DAY);
        const inFirst = days % r.cycle[0] < r.dur[0];
        return r.c === '<=' || r.c === '<' ? inFirst : !inFirst;
      }
      default: return false;
    }
  }

  visible(s, o, now = Date.now()) { return !o.display || this.req(s, o.display, now); }
  price(s, o, now = Date.now()) { return o.prices.find((p) => !p.display || this.req(s, p.display, now)) || null; }
  // the offers of a group in config order, visible and priced
  offers(s, group, now = Date.now()) {
    return this.d.offers.filter((o) => o.group === group && this.visible(s, o, now) && this.price(s, o, now));
  }

  // why a purchase is refused, or null: the group's purchase requirement (has_cards for boosters), the price's
  // (didnt_buy_free_coins_today / didnt_buy_rewarded_coins_today)
  blocked(s, o, now = Date.now()) {
    const g = this.d.groups[o.group], p = this.price(s, o, now);
    if (!p) return 'hidden';
    if (g?.purchase && !this.req(s, g.purchase, now)) return g.purchase;
    if (p.purchase && !this.req(s, p.purchase, now)) return p.purchase;
    return null;
  }

  // MarketPurchaseController.TryMakePurchase: FREE grants, REWARDED shows the rewarded ad (AdsService.ShowRewarded: a skip
  // ticket pays it when owned), IAP asks the store; here both grant at once. giveRewardsIndividually: each content line
  // is granted on its own, lines with a requirement only when it holds (offer.vip_discount's welcome-offer skins).
  buy(s, id, now = Date.now()) {
    const o = this.byId.get(id);
    if (!o) return { refused: 'none' };
    const why = this.blocked(s, o, now);
    if (why) return { refused: why };
    const p = this.price(s, o, now), how = p.pay === 'REWARDED' ? watch(s) : p.pay.toLowerCase();
    const got = [], src = o.source || o.id;
    for (const [res, q, rq] of o.content) {
      if (rq && !this.req(s, rq, now)) continue;
      const per = this.d.periodic[res];
      if (per) { s.periodic[res] = periodId(per[1], now); continue; }
      this.m.grantReward(s, [res, q], got, src);
    }
    return { got, how, offer: o, price: p };
  }

  // VipService.GetVipOffer [asm 0x11927c8]: the first visible offer.vip / offer.vip_discount; VipOfferWidget.OnEnable hides
  // the widget when there is none [asm 0x119274c..0x11927c4] (both need no_vip).
  vipOffer(s, now = Date.now()) {
    return this.d.offers.find((o) => (o.id === 'offer.vip' || o.id === 'offer.vip_discount') && this.visible(s, o, now) && this.price(s, o, now)) || null;
  }

  // HomePage MarketWidgetsHolder: one MarketOfferWidget per visible offer with a widget view (VIP, welcome offer, No Ads)
  widgets(s, now = Date.now()) {
    return this.d.offers.filter((o) => o.widget && this.visible(s, o, now) && this.price(s, o, now));
  }
}
