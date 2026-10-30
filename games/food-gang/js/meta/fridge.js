// MetaService.Fridge.cs: stars, fridge stock, box rolls, opening.
import { MetaTime } from './rng.js';
import { RewardType, Rarity, Currency, FridgeOpenMethod, MetaErrors, reward } from './types.js';
import { Profile } from './profile.js';
import { MetaResult, FridgeStockRefilled, StarsChanged } from './events.js';

/** Fisher-Yates as the C# Shuffle (from the end, j in [0, i)). */
export function shuffle(rng, list) {
  for (let i = list.length; i > 1; i--) {
    const j = rng.range(0, i);
    const tmp = list[i - 1]; list[i - 1] = list[j]; list[j] = tmp;
  }
}

export const fridgePart = {
  /** RewardStockSystem.CheckHourlyRefill: +1 fridge stock per UTC hour, cap 6. */
  _refillStock(c) {
    const f = c.p.fridge;
    const hour = MetaTime.hourStart(c.t);
    if (hour <= f.lastRefillHour) return;
    const elapsed = f.lastRefillHour === 0 ? 1 : Math.trunc((hour - f.lastRefillHour) / MetaTime.Hour);
    const before = f.stock;
    f.stock = Math.min(this.R.maxRewardStock, f.stock + elapsed);
    f.lastRefillHour = hour;
    if (f.stock > before) c.res.events.push(new FridgeStockRefilled(f.stock));
  },

  /** Seconds until the next stock refill, 0 when the stock is full (RemainingTime). */
  fridgeRefillSecondsLeft(p, utcNow) {
    if (p.fridge.stock >= this.R.maxRewardStock) return 0;
    const t = MetaTime.seconds(utcNow);
    return MetaTime.hourStart(t) + MetaTime.Hour - t;
  },

  /** UserData.AddStars: 3 stars unlock one fridge and use one stock; extra stars of that call are dropped. */
  _addStars(c, n) {
    const f = c.p.fridge;
    if (f.stock <= 0) return;
    for (let i = 0; i < n && f.stock > 0; i++) {
      f.stars++;
      if (f.stars === this.R.maxStar) {
        f.stars = 0;
        f.unlocked++;
        f.stock--;
        break;
      }
    }
    c.res.events.push(new StarsChanged(f.stars, f.stock));
  },

  /** GameOver.CheckSpecialBox / CheckSpecialBox3: about 1 in 7 fridges is Box2, 1 in 7 of those is Box3. */
  _nextFridgeBox(c) {
    const f = c.p.fridge, R = this.R;
    if (f.specialThreshold === 0) f.specialThreshold = R.specialBoxFirstThreshold;
    if (++f.specialCounter < f.specialThreshold) return RewardType.Box1;
    f.specialCounter = 0;
    f.specialThreshold = c.rng.range(R.specialBoxMin, R.specialBoxMaxExcl);
    if (f.special3Threshold === 0) f.special3Threshold = c.rng.range(R.specialBoxMin, R.specialBoxMaxExcl);
    if (++f.special3Counter < f.special3Threshold) return RewardType.Box2;
    f.special3Counter = 0;
    f.special3Threshold = c.rng.range(R.specialBoxMin, R.specialBoxMaxExcl);
    return RewardType.Box3;
  },

  /** RewardSystem.RandomRewards for Box1/2/3 (§6.3.2). Order: [Coins, Token(s)..., Skin?]. */
  _rollBox(c, spec) {
    const p = c.p, R = this.R, fr = Math.fround;
    const list = [];
    let got = false;
    let slotsLeft = spec.slots;

    for (let i = 0; i < spec.slots; i++) {
      if (got) continue;
      if (c.rng.rangeFloat(0, 100) < fr(p.skinPity + R.skinPityBase)) {
        const rarity = c.rng.rangeFloat(0, 100) < R.epicChance ? Rarity.Epic : Rarity.Rare;
        const skin = this._randomRewardSkin(c, rarity);
        if (skin !== null) { list.push(skin); slotsLeft--; got = true; continue; }
      }
      p.skinPity = fr(p.skinPity + R.skinPityStep);
    }
    if (got) p.skinPity = 0;
    if (slotsLeft < 1) return list;

    const total = c.rng.range(R.boxCoinMin, R.boxCoinMaxExcl) * slotsLeft;
    const coins = Math.trunc(fr(c.rng.rangeFloat(R.boxCoinFracMin, R.boxCoinFracMax) * total));
    let rest = total - coins;
    if (rest < 0) rest++;
    let pool = rest >> 1;

    const cands = p.skins.filter(s => this.tokenAvailable(s) > 0);
    shuffle(c.rng, cands);
    if (cands.length > 0) {
      const k = c.rng.range(spec.kMin, spec.kMaxExcl);
      const chosen = [];
      for (let i = 0; i < k; i++) {
        const s = cands[c.rng.range(0, cands.length)];
        if (!chosen.includes(s)) chosen.push(s);
      }
      let n = chosen.length;
      if (n > 1) {
        let cur;
        do {
          cur = n;
          const step = fr(cur * R.boxSplitStep);
          const frac = c.rng.rangeFloat(fr(R.boxSplitLo - step), fr(R.boxSplitHi - step));
          n = cur - 1;
          const s = chosen[n];
          const tok = Math.min(this.tokenAvailable(s), Math.trunc(fr(frac * pool)));
          if (tok > 0) { list.unshift(reward(RewardType.Token, tok, s.id)); pool -= tok; }
        } while (cur > 2);
      }
      const s0 = chosen[0];
      const t0 = Math.min(this.tokenAvailable(s0), pool);
      if (t0 > 0) { list.unshift(reward(RewardType.Token, t0, s0.id)); pool -= t0; }
    }
    list.unshift(reward(RewardType.Freemium, (pool > 0 ? pool * R.coinsPerSpareToken : 0) + coins));
    return list;
  },

  /**
   * Opens the fridge offered on the result screen. Free while VIP or for the first 3 lifetime
   * opens; after that an ad (web: the click is the ad) or 15 Gems.
   */
  openFridge(p, method, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    const f = p.fridge;
    if (f.pendingBox === 0) return MetaResult.fail(c.res, MetaErrors.NoFridge);
    const freeOpen = c.vip || f.openCount < this.R.freeFridgeOpens;
    switch (method) {
      case FridgeOpenMethod.Free:
        if (!freeOpen) return MetaResult.fail(c.res, MetaErrors.NotAvailable);
        break;
      case FridgeOpenMethod.Ad:
        if (freeOpen) return MetaResult.fail(c.res, MetaErrors.NotAvailable);
        break;
      case FridgeOpenMethod.Gems:
        if (freeOpen) return MetaResult.fail(c.res, MetaErrors.NotAvailable);
        if (!this._pay(c, Currency.Gems, this.db.gameOverBoxPremiumPrice)) return c.res;
        break;
    }
    const box = f.pendingBox;
    f.pendingBox = 0;
    f.openCount++;
    f.unlocked = Math.max(0, f.unlocked - 1); // [ĐỀ XUẤT] §19.1 #2
    this._grant(c, reward(box), 'Fridge');
    return c.res;
  },

  /** What the result screen buttons show for the pending fridge. */
  canOpenFridgeFree(p, utcNow) {
    return p.fridge.pendingBox !== 0 && (Profile.isVip(p, utcNow) || p.fridge.openCount < this.R.freeFridgeOpens);
  },

  canOpenFridgeAdOrGems(p, utcNow) {
    return p.fridge.pendingBox !== 0 && !Profile.isVip(p, utcNow) && p.fridge.openCount >= this.R.freeFridgeOpens;
  },
};
