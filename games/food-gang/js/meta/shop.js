// MetaService.Shop.cs: prices, fixed shop, daily gifts and offers, promo skin, IAP, VIP, ads, Tick.
import { MetaRng, MetaTime } from './rng.js';
import {
  RewardType, Rarity, PriceType, Currency, ShopGroup, DailyGiftSlot, AdPlacement, FridgeOpenMethod, IapKind,
  MetaErrors, Reward, reward,
} from './types.js';
import { Profile } from './profile.js';
import { MetaResult, DailyOffersRefreshed, DailyGiftView, VipChanged } from './events.js';
import { shuffle } from './fridge.js';
import { roundHalfEven } from './matchmaking.js';

const GiftPriceType = [PriceType.Free, PriceType.Ad, PriceType.VipOnly, PriceType.VipOnly];

export const shopPart = {
  get iapProducts() { return [...this._iap.values()]; },

  // ---------------------------------------------------------------- prices

  /**
   * ShopItem.get_Price: IAP/free items cost 0; VIP pays round(price*0.8/5)*5 for fridges.
   * price(type, price, reward, vip) or price(shopItemDef, vip).
   */
  price(type, price, rew, vip) {
    if (typeof type === 'object' && type !== null) return this.price(type.priceType, type.price, type.reward, price);
    if (type > PriceType.Premium) return 0;
    if (!vip || rew === null || rew === undefined || !Reward.isBox(rew)) return price;
    const R = this.R, fr = Math.fround;
    return roundHalfEven(fr(fr(price * R.vipBoxDiscount) / R.vipPriceStep)) * R.vipPriceStep;
  },

  /** ShopItemDisplay.ExecuteBuy for one priced item. Returns false when it could not be paid. */
  _payFor(c, type, price, rew) {
    if (type === PriceType.Freemium) return this._pay(c, Currency.Coins, this.price(type, price, rew, c.vip));
    if (type === PriceType.Premium) return this._pay(c, Currency.Gems, this.price(type, price, rew, c.vip));
    if (type === PriceType.InApp) c.p.hasMadePurchase = true; // web: the click is the purchase
    return true;
  },

  // ---------------------------------------------------------------- fixed shop

  /** Buys an item of the fixed shop: box2/box3 (Gems), pack1..6 (IAP), goldpack1..4 (Gems). */
  buyShopItem(p, itemId, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    let item = null;
    for (const g of [ShopGroup.Box, ShopGroup.Premium, ShopGroup.Freemium]) item = item ?? this.db.findShopItem(g, itemId);
    if (item === null) return MetaResult.fail(c.res, MetaErrors.UnknownItem);
    if (!this._payFor(c, item.priceType, item.price, item.reward)) return c.res;
    this._grant(c, item.reward, 'Shop');
    return c.res;
  },

  // ---------------------------------------------------------------- daily gifts and offers (§9)

  /** DailyOfferSystem.Update at a new UTC day: new gifts, claims and ad counters reset. */
  _refreshDaily(c) {
    const d = c.p.daily, db = this.db;
    const today = MetaTime.dayStart(c.t);
    if (d.day === today) return;
    d.claimed.length = 0;
    d.vip1Ads = d.vip2Ads = 0;
    d.day = today;

    const dayNumber = Math.trunc(today / MetaTime.Day);
    const dow = MetaTime.weekdayIndex(c.t);
    const tokens = this.anyTokenAvailable(c.p);
    d.gifts = [];
    for (const pool of db.dailyGifts) {
      let g = Reward.clone(pool[dow % pool.length]);
      if (g.type === RewardType.Token && !tokens) g = reward(RewardType.Freemium, g.count);
      // [ĐỀ XUẤT] id = day number * 100 + cell (the original day-seconds * 100 overflows int)
      g.id = dayNumber * 100 + d.gifts.length;
      d.gifts.push(g);
    }

    const w0 = this._weeklySkinIdAt(c.t, 0), w1 = this._weeklySkinIdAt(c.t, 1);
    const cand = db.skins.filter(s => (s.rarity === Rarity.Rare || s.rarity === Rarity.Epic) &&
      s.id !== c.p.missions.missionSkin && s.id !== w0 && s.id !== w1 && !Profile.hasSkin(c.p, s.id));
    const seeded = new MetaRng(today);
    d.specialOffer = cand.length === 0 ? null
      : reward(RewardType.Skin, 1, cand[seeded.range(0, cand.length)].id, 0, dayNumber * 100 + 50);
    c.res.events.push(new DailyOffersRefreshed(today));
  },

  /** The four gift cells as the Shop shows them today (call tick first on a new day). */
  dailyGifts(p, utcNow) {
    const vip = Profile.isVip(p, utcNow);
    return p.daily.gifts.map((g, i) => {
      const v = new DailyGiftView();
      v.slot = i;
      v.reward = g;
      v.claimed = p.daily.claimed.includes(g.id);
      v.priceType = vip ? PriceType.Free : GiftPriceType[i];
      if (v.priceType === PriceType.VipOnly) {
        v.adsNeeded = this.R.vipAdThresholds[i - DailyGiftSlot.Vip1];
        v.adsWatched = i === DailyGiftSlot.Vip1 ? p.daily.vip1Ads : p.daily.vip2Ads;
      }
      return v;
    });
  },

  /**
   * Clicks a daily gift cell. Free cell and VIP: claim. Ad cell: the click is the ad, claim.
   * VIP1/VIP2 cells for non-VIP: each click counts one ad; the 2nd / 3rd claims (§9.5).
   */
  claimDailyGift(p, slot, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    this._refreshDaily(c);
    const d = p.daily;
    const i = slot;
    if (i < 0 || i >= d.gifts.length) return MetaResult.fail(c.res, MetaErrors.UnknownItem);
    const gift = d.gifts[i];
    if (d.claimed.includes(gift.id)) return MetaResult.fail(c.res, MetaErrors.AlreadyClaimed);

    if (!c.vip && GiftPriceType[i] === PriceType.VipOnly) {
      const first = slot === DailyGiftSlot.Vip1;
      const watched = first ? ++d.vip1Ads : ++d.vip2Ads;
      if (watched < this.R.vipAdThresholds[i - DailyGiftSlot.Vip1]) return c.res;
    }
    d.claimed.push(gift.id);
    p.stats.dailyOffersClaimed++;
    this._grant(c, gift, 'DailyGift');
    return c.res;
  },

  /** DailyOfferSystem.ComputeDailyPaidOffer: one of 13 offers a day, each once per 13-day cycle. */
  dailyPaidOffer(utcNow) {
    const pool = this.db.shopGroupItems(ShopGroup.DailyPaid);
    if (pool.length === 0) return null;
    const days = Math.trunc(MetaTime.dayStart(MetaTime.seconds(utcNow)) / MetaTime.Day);
    const cycle = Math.trunc(days / pool.length);
    const rng = new MetaRng(cycle);
    const idx = pool.map((_, i) => i);
    shuffle(rng, idx);
    return pool[idx[days - cycle * pool.length]];
  },

  dailyPaidOfferBought(p, utcNow) {
    return p.daily.paidOfferDay === MetaTime.dayStart(MetaTime.seconds(utcNow));
  },

  /** Shop.BuyDailyPaidOffer: today's offer, once per UTC day. */
  buyDailyPaidOffer(p, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    const offer = this.dailyPaidOffer(utcNow);
    if (offer === null) return MetaResult.fail(c.res, MetaErrors.NotAvailable);
    if (this.dailyPaidOfferBought(p, utcNow)) return MetaResult.fail(c.res, MetaErrors.AlreadyClaimed);
    if (!this._payFor(c, offer.priceType, offer.price, offer.reward)) return c.res;
    p.daily.paidOfferDay = MetaTime.dayStart(c.t);
    this._grant(c, offer.reward, 'DailyOffer');
    return c.res;
  },

  /** Price of today's skin offer in the Shop: 1200 Gems for Epic, 600 otherwise. */
  specialOfferPrice(offer) {
    const skin = offer === null || offer === undefined ? null : this.db.findSkin(offer.skinId);
    return skin !== null && skin.rarity === Rarity.Epic ? this.R.specialOfferPriceEpic : this.R.specialOfferPriceRare;
  },

  buySpecialOffer(p, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    this._refreshDaily(c);
    const offer = p.daily.specialOffer;
    if (offer === null || offer.skinId <= 0) return MetaResult.fail(c.res, MetaErrors.NotAvailable);
    if (Profile.hasSkin(p, offer.skinId)) return MetaResult.fail(c.res, MetaErrors.AlreadyClaimed);
    if (!this._pay(c, Currency.Gems, this.specialOfferPrice(offer))) return c.res;
    this._grant(c, offer, 'SpecialOffer');
    return c.res;
  },

  /** PromoteSkin price of the weekly mission skin: Rare/VIP 300, Epic 600, Common not sold (-1). */
  promoSkinPrice(skinId) {
    const s = this.db.findSkin(skinId);
    if (s === null || s.rarity === Rarity.Common) return -1;
    return s.rarity === Rarity.Epic ? this.R.promoSkinPrice * 2 : this.R.promoSkinPrice;
  },

  /** PromoteSkin.BuySkin: the skin of the week (missions.missionSkin); VIP skins need VIP. */
  buyPromoSkin(p, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    const id = p.missions.missionSkin;
    const price = this.promoSkinPrice(id);
    if (price < 0) return MetaResult.fail(c.res, MetaErrors.NotForSale);
    if (Profile.hasSkin(p, id)) return MetaResult.fail(c.res, MetaErrors.AlreadyClaimed);
    if (this.db.findSkin(id).rarity === Rarity.Vip && !c.vip) return MetaResult.fail(c.res, MetaErrors.NotAvailable);
    if (!this._pay(c, Currency.Gems, price)) return c.res;
    this._grant(c, reward(RewardType.Skin, 1, id), 'PromoSkin');
    return c.res;
  },

  // ---------------------------------------------------------------- IAP, VIP, ads (§10, §11)

  /**
   * Web IAP: the click grants the product. pass/passmonthly extend VIP and give KING; pack* give Gems;
   * specialpack* buy today's paid offer; leagueoffer* buy the active league pack.
   */
  claimIap(p, productId, utcNow, rng) {
    const product = productId === null || productId === undefined ? undefined : this._iap.get(productId);
    if (product === undefined) return MetaResult.fail(new MetaResult(), MetaErrors.UnknownItem);
    switch (product.kind) {
      case IapKind.Pass: return this._buyPass(p, product, utcNow, rng);
      case IapKind.GemPack: return this.buyShopItem(p, productId, utcNow, rng);
      case IapKind.DailySpecial: {
        const offer = this.dailyPaidOffer(utcNow);
        if (offer === null || offer.id !== productId) return MetaResult.fail(new MetaResult(), MetaErrors.NotAvailable);
        return this.buyDailyPaidOffer(p, utcNow, rng);
      }
      default: return this._buyLeaguePack(p, productId, utcNow, rng);
    }
  },

  _buyPass(p, product, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    p.hasMadePurchase = true;
    p.vipUntil = Math.max(c.t, p.vipUntil) + product.vipDays * MetaTime.Day;
    c.res.events.push(new VipChanged(p.vipUntil));
    if (!Profile.hasSkin(p, this.R.vipSkinId)) this._grant(c, reward(RewardType.Skin, 1, this.R.vipSkinId), 'VIP');
    return c.res;
  },

  _buyLeaguePack(p, packId, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    const active = this.activeLeaguePack(p, utcNow);
    if (active === null || active.pack.id !== packId) return MetaResult.fail(c.res, MetaErrors.NotAvailable);
    p.hasMadePurchase = true;
    p.leaguePacksBought.push(packId);
    this._grant(c, active.pack.reward1, 'LeaguePack');
    this._grant(c, active.pack.reward2, 'LeaguePack');
    return c.res;
  },

  /** AdSystem.AdsDisabled: any purchase or VIP removes forced ads. */
  adsDisabled(p, utcNow) { return p.hasMadePurchase || Profile.isVip(p, utcNow); },

  /** A rewarded-ad button. Web: the click is a completed ad. */
  claimAdReward(p, placement, utcNow, rng) {
    switch (placement) {
      case AdPlacement.DailyGiftAd: return this.claimDailyGift(p, DailyGiftSlot.Ad, utcNow, rng);
      case AdPlacement.DailyGiftVip1: return this.claimDailyGift(p, DailyGiftSlot.Vip1, utcNow, rng);
      case AdPlacement.DailyGiftVip2: return this.claimDailyGift(p, DailyGiftSlot.Vip2, utcNow, rng);
      default: return this.openFridge(p, FridgeOpenMethod.Ad, utcNow, rng);
    }
  },

  // ---------------------------------------------------------------- periodic

  /**
   * Everything driven by the clock: fridge stock refill, daily gifts at 00:00 UTC, weekly missions
   * at Monday 00:00 UTC. Call on load and periodically (no-op when nothing is due).
   */
  tick(p, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    this._refillStock(c);
    if (p.missions.unlocked) this._refreshMissions(c);
    else if (p.missions.missionSkin !== 0 || p.missions.slots.length > 0) {
      p.missions.missionSkin = 0;
      p.missions.slots.length = 0;
      p.missions.week = -1;
    }
    this._refreshDaily(c);
    return c.res;
  },

  /** Same as tick for the daily part. */
  refreshDailyOffers(p, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    this._refreshDaily(c);
    return c.res;
  },

  /** Seconds to the next 00:00 UTC (daily gifts timer). */
  dailyResetIn(utcNow) {
    const t = MetaTime.seconds(utcNow);
    return MetaTime.dayStart(t) + MetaTime.Day - t;
  },
};
