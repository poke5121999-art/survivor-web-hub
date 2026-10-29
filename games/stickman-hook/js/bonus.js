// Lucky Wheel, piggy bank, market (daily free coins; offers in ads.js) and skip level, driven by data/bonus.json
// (tools/build_meta.py). main.js loads this module with the home screen, at the first death or at the finish of a Normal
// level, so the first level never downloads it. Rules first (class Bonus, pure on the save), then the views it owns:
// the home widgets and the in-game skip button. The wheel and market sheets are in menus.js, the piggy bank popup in
// endgame.js.
import { SKIP_TICKETS, qty, addQty } from './meta.js';
import { dayKey } from './daily.js';
import { watch, canSkip, Shop } from './ads.js';

export const FREE_COINS = 'daily.free_coins';
const WHEEL_CLAIMS = 'progression.lucky_wheel_claims';
const PIGGY_PROGRESS = 'progression.piggy_bank_progress', PIGGY_CLAIMS = 'progression.piggy_bank_claims',
  PIGGY_SKIPS = 'progression.piggy_bank_skips';
const SKIPPED = 'flag.nb_levels_skipped_';
const WELCOME_BOOSTER = 'flag.has_welcome_booster';
// PiggyBankService.GetFillAmount picks a column of the fill config by source
export const PIGGY_LEVEL = 1, PIGGY_REWARDED = 2;

// Day id of the local calendar day for the periodic resources (isUtc false), kept YYYYMMDD in save.periodic. The skip
// counter uses SkipLevelService.GetDayId = FormatDateId "yyyy-MM-dd" [asm 0x124e998, 0x2e7b9ec] (daily.js dayKey).
export function dayId(d = new Date()) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }

// Rules of the original services, on a save. `m` is the Meta (items, rewards), `d` is data/bonus.json.
export class Bonus {
  constructor(m, d) { this.m = m; this.d = d; }

  // Every rewarded ad of the original goes through ads.js watch (AdController.SafelyDisplayAd): a skip ticket pays it when
  // the player owns one, else it is granted at once. `how` = 'vip' | 'ticket' | 'ad'.
  watch(s) { return watch(s); }

  // ---- Lucky Wheel (LuckyWheelService) ----
  // GetNextRewardPrice: prices[min(claims, count - 1)], claims counted for life: first spin free, then 500 coins
  // [asm 0x115ab14..0x115ac50]. No daily reset or cooldown exists in the service or the config.
  wheelPrice(s) {
    const p = this.d.wheel.prices;
    return p[Math.min(qty(s, WHEEL_CLAIMS), p.length - 1)];
  }

  // RefreshRewardsList: every pool item still worth giving (customization items not owned [asm 0x115e3c8]), weight =
  // pool weight / items left in the pool [asm 0x115cc38..0x115cc7c]. An empty pool (trail.epic) adds nothing.
  wheelRewards(s) {
    const out = [];
    for (const [pool, rarity, w, items] of this.d.wheel.pools) {
      const left = items.filter(([res]) => !this.m.byId.has(res) || !this.m.ownsRes(s, res));
      for (const [res, q] of left) out.push({ res, q, w: w / left.length, rarity, pool });
    }
    return out;
  }

  // The next reward: the first forced reward not owned yet (skin.potatoz) [asm 0x115ce78..0x115cee0], else a weighted
  // pick (WeightedRandom.GetRandom [asm 0x115d030]) among the rewards; boosters only once the welcome booster was
  // received [asm 0x115e524..0x115e5c0].
  wheelPick(s, rand = Math.random) {
    const all = this.wheelRewards(s);
    const forced = this.d.wheel.forced.find(([res]) => !this.m.ownsRes(s, res));
    if (forced) {
      const pool = this.d.wheel.pools.find((p) => p[3].some(([r]) => r === forced[0]));
      return all.find((r) => r.res === forced[0]) || { res: forced[0], q: forced[1], w: 1, rarity: pool ? pool[1] : 'epic' };
    }
    const cand = all.filter((r) => !r.res.startsWith('booster.') || (s.flags[WELCOME_BOOSTER] || 0) > 0);
    let x = rand() * cand.reduce((t, r) => t + r.w, 0);
    for (const r of cand) if ((x -= r.w) < 0) return r;
    return cand[cand.length - 1] || null;
  }

  // The reel of the popup (WheelUIRandomItemSelector.Initialize): the reward list shuffled into 50 slots; the spin puts
  // its reward at slot 45 (LuckyWheelSettings _nbItemsToDisplay, _rewardItemIndex).
  // [ĐỀ XUẤT] the slots cycle through the shuffled list.
  wheelReel(s, rand = Math.random) {
    const all = this.wheelRewards(s);
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    return all.length ? Array.from({ length: this.d.wheel.items }, (_, i) => all[i % all.length]) : [];
  }

  // PayForSpin then ClaimReward [asm 0x115db94, 0x115dd94]: pay the price, count the claim, grant the reward.
  wheelSpin(s, rand = Math.random) {
    const price = this.wheelPrice(s);
    if (s.coins < price[1]) return { refused: 'coins', price };
    const reward = this.wheelPick(s, rand);
    if (!reward) return { refused: 'empty', price };
    s.coins -= price[1];
    return this.wheelClaim(s, reward, price, rand);
  }

  // ClaimReward: claims + 1, the reward through GetFallbackIfNoCardAvailable for boosters (b__20_4 [asm 0x115e4c0]),
  // then card.extra_lucky_wheel's roll (HasExtraLuckyWheel [asm 0x115e1c4]): an automatic spin, PayForSpin skipped, so
  // nothing is paid. Its ClaimReward then finds no paid spin (progression.lucky_wheel_spin <= 0 [asm 0x115de58..0x115de5c])
  // and returns with an error log [asm 0x115e0f8..0x115e114]: no claim counted, no reward, no further extra roll.
  wheelClaim(s, reward, price, rand = Math.random) {
    addQty(s, WHEEL_CLAIMS, 1);
    const got = [], cards = this.m.cards;
    const r = cards && reward.res.startsWith('booster.') ? cards.fallback(s, reward.res, reward.q) : [reward.res, reward.q];
    this.m.grantReward(s, r, got);
    const extra = !!cards && cards.extraWheel(s, rand);
    return { reward, price, got, extra };
  }

  // The extra spin of card.extra_lucky_wheel: the wheel turns to a picked reward, but ClaimReward exits early (above),
  // so it grants nothing and changes nothing in the save.
  wheelFreeSpin(s, rand = Math.random) {
    const reward = this.wheelPick(s, rand);
    if (!reward) return { refused: 'empty' };
    return { reward, price: [this.wheelPrice(s)[0], 0], got: [], extra: false, empty: true };
  }

  // ---- Piggy bank (PiggyBankService) ----
  // GetFillAmount: the last fill config whose threshold <= claims; column 1 levelComplete, 2 rewarded, 3 iap [asm 0x11759b4]
  piggyFill(s, source) {
    let row = this.d.piggy.fill[0];
    for (const f of this.d.piggy.fill) if (f[0] <= qty(s, PIGGY_CLAIMS)) row = f;
    return row[source];
  }

  // GetRewardId: the reward skins not owned, the (skips mod count)-th [asm 0x1175cc8..0x1175dfc]; null when all are owned
  piggyReward(s) {
    const left = this.d.piggy.rewards.filter((res) => !this.m.ownsRes(s, res));
    return left.length ? left[qty(s, PIGGY_SKIPS) % left.length] : null;
  }

  piggyProgress(s) { return qty(s, PIGGY_PROGRESS); }
  piggyFull(s) { return qty(s, PIGGY_PROGRESS) > 99; } // CanClaim [asm 0x1175cb8]
  // AddProgress: min(100, progress + n) [asm 0x1175c44..0x1175c88]
  piggyAdd(s, n) { s.inv[PIGGY_PROGRESS] = Math.min(this.d.piggy.max, qty(s, PIGGY_PROGRESS) + n); }

  // NormalGamePlayController.GiveEndGameRewards opens the piggy popup when a reward skin is left [asm 0x12a62bc]. The popup
  // first loses a piggy left full last time (LoseReward [asm 0x1177648]), then fills it by levelComplete [asm 0x1177f7c].
  piggyLevelEnd(s) {
    if (!this.piggyReward(s)) return null;
    if (this.piggyFull(s)) this.piggyLose(s);
    const res = this.piggyReward(s), before = this.piggyProgress(s);
    this.piggyAdd(s, this.piggyFill(s, PIGGY_LEVEL));
    return { res, before, after: this.piggyProgress(s) };
  }

  // Claim: progress 0, claims + 1, grant the skin [asm 0x1175e38]. LoseReward: progress 0, skips + 1 [asm 0x1176094].
  piggyClaim(s, out = []) {
    const res = this.piggyReward(s);
    if (!this.piggyFull(s) || !res) return null;
    s.inv[PIGGY_PROGRESS] = 0;
    addQty(s, PIGGY_CLAIMS, 1);
    this.m.grantItem(s, this.m.byId.get(res), out);
    return out;
  }

  piggyLose(s) {
    s.inv[PIGGY_PROGRESS] = 0;
    addQty(s, PIGGY_SKIPS, 1);
  }

  // The popup's ad button: "Unlock" when full (PiggyBankPopup.WatchRewardedToUnlockSkin), "+N%" otherwise
  // (WatchRewardedToAddProgression), placements "rewarded." + ... + "_unlock" / "_fill" [asm 0x1178cb4, 0x1178fb8].
  piggyUnlock(s, out = []) {
    if (!this.piggyFull(s)) return null;
    const how = watch(s);
    return { how, got: this.piggyClaim(s, out) };
  }

  piggyBoost(s) {
    if (this.piggyFull(s) || !this.piggyReward(s)) return null;
    const how = watch(s);
    this.piggyAdd(s, this.piggyFill(s, PIGGY_REWARDED));
    return { how, progress: this.piggyProgress(s) };
  }

  // ---- Market: daily free coins (offer.free_coins, requirement didnt_buy_free_coins_today); the rest is ads.js Shop ----
  freeCoinsReady(s, day = dayId()) { return s.periodic[FREE_COINS] !== day; }

  claimFreeCoins(s, day = dayId()) {
    if (!this.freeCoinsReady(s, day)) return 0;
    s.periodic[FREE_COINS] = day;
    s.coins += this.d.offers.freeCoins;
    // card.shop_free_coins_boost: source offer.free_coins (MarketOfferDto.Source [asm 0x2f6c3d8])
    return this.d.offers.freeCoins + this.m.bonus(s, 'currency.skin_coins', 'offer.free_coins', this.d.offers.freeCoins);
  }

  // ---- Skip level (SkipLevelService) ----
  // Per day = trunc(effect of card.skip_level) at the player's card level (GetNbSkippableLevelsPerDay [asm 0x124ea74..
  // 0x124ea90]); the card level comes from the cards owned (save.inv['card.skip_level']): n < 1 -> 0, else
  // (n - 1) / cardsPerLevel + 1 (CardsService.GetCardLevel [asm 0x127bb7c]). Level < 1 gives 0 (GetCardEffectForLevel
  // [asm 0x127c668]), level L gives min + graduation * (L - 1), max level max.
  skipsPerDay(s) {
    const [min, max, step, maxLevel, req] = this.d.skipCard, n = qty(s, 'card.skip_level');
    const level = n < 1 ? 0 : Math.floor((n - 1) / req) + 1;
    return Math.trunc(level < 1 ? 0 : level >= maxLevel ? max : min + step * (level - 1));
  }

  skipsLeft(s, day = dayKey()) { return this.skipsPerDay(s) - (s.flags[SKIPPED + day] || 0); }

  // SkipButtonView.SkipLevelAsync: the rewarded ad rewarded.skip_level (ads.js watch [asm 0x12a3fb8]); then
  // SkipLevelService.SkipLevel counts it in flag.nb_levels_skipped_<day> [asm 0x124eb40..0x124eb94] and the level completes
  // (GamePlayService.SkipLevel -> CompleteLevel [asm 0x129c96c]). Older day counters are dropped (CleanDailyTokenFlags).
  skipLevel(s, day = dayKey()) {
    if (this.skipsLeft(s, day) < 1) return { refused: 'limit' };
    const how = watch(s);
    const key = SKIPPED + day;
    for (const f of Object.keys(s.flags)) if (f.startsWith(SKIPPED) && f !== key) delete s.flags[f];
    s.flags[key] = (s.flags[key] || 0) + 1;
    return { how, left: this.skipsLeft(s, day) };
  }

  // ---- views ----------------------------------------------------------------------------------------------------
  // Home (home.js): the ticket count, the market offer widgets on the left and the Lucky Wheel widget on the right
  // (HomePage MarketWidgetsHolder / ModesContainer LuckyWheelButton with its coins/price counter and red dot).
  hud() {
    const s = this.app.save, $ = (id) => document.getElementById(id);
    $('tickets').textContent = qty(s, SKIP_TICKETS);
    const price = this.wheelPrice(s)[1];
    $('wheelPrice').textContent = price ? `${s.coins}/${price}` : 'Miễn phí';
    $('wheelDot').classList.toggle('on', s.coins >= price && this.wheelRewards(s).length > 0);
    this.homeOffers().catch(() => {});
  }

  // MarketWidgetsHolder: one MarketOfferWidget (120 x 120: OfferIllustration, OfferTitle Junegull 20 "Gold 2") per visible
  // offer with a widget view: offer.vip / offer.vip_discount ("VIP Bundle", Market/Offer/Vip/Widget), offer.welcome_offer
  // (Market/Offer/Welcome/Widget), offer.no_ads ("No Ads", Market/Reward/NoAds). The original opens the offer's popup;
  // here a click buys it at once (owner rule). Bought offers drop out by their display requirements (no_vip, no_no_ads).
  async homeOffers() {
    const box = document.getElementById('homeOffers');
    if (!box) return;
    const list = this.shop.widgets(this.app.save), key = list.map((o) => o.id).join();
    if (box.dataset.k === key) return;
    box.dataset.k = key;
    box.innerHTML = '';
    box.classList.toggle('none', !list.length);
    if (!list.length) return;
    const ui = await import('./uikit.js'), sh = await ui.sheet(this.app, 'ads');
    if (box.dataset.k !== key) return;
    const art = { 'Market/Offer/Vip/Widget': 'MarketOfferVipWidget', 'Market/Offer/Welcome/Widget': 'MarketOfferWelcomeWidget',
      'Market/Reward/NoAds': 'MarketRewardNoAds' };
    for (const o of list) {
      const b = document.createElement('button');
      b.className = 'hw offer';
      b.dataset.offer = o.id;
      b.title = (o.widget.title || o.card?.title || o.id) + ' (bấm là nhận ngay)';
      b.innerHTML = '<i></i><span></span>';
      ui.fit(b.querySelector('i'), sh, art[o.widget.sprite] || 'MarketRewardNoAds');
      const t = b.querySelector('span');
      t.textContent = o.widget.title || '';
      if (t.textContent) ui.glText(this.app, t, 20, '#FFD54A');
      // StickmanHookMarketOfferWidgetView.OnWidgetClicked [asm 0x124e3ac]: an offer with a purchase popup (VIP) opens it,
      // the others (Welcome, No Ads) go to the market focused on their card
      b.onclick = () => this.app.popups().then((m) => (m.POPUP_OFFERS.has(o.id) ? m.offer(this.app, o.id) : this.app.openMenu('openMarket', o.id)));
      box.appendChild(b);
    }
  }

  // A click on an IAP or rewarded-ad offer button (home widgets, market, VIP buttons): ads.js Shop.buy grants it at once,
  // then the usual follow-ups (save, equipped look, HUD; queued boosters open from the home HUD).
  buy(id) {
    const app = this.app, r = this.shop.buy(app.save, id);
    if (r.refused) { app.toast(REFUSED[r.refused] || 'Chưa mua được'); return r; }
    app.play('popup_in');
    app.writeSave();
    app.applyEquip?.();
    app.toast((r.offer.card?.title || r.offer.widget?.title || 'Đã nhận').replace(/<[^>]+>|\n/g, ' ') + ': ' + gotText(r.got));
    app.hud();
    app.unlocks?.(r.got); // CustomizationItemUnlockedPopup for every item of the offer (CustomizationService.OnUnlocked)
    return r;
  }

  // The skip button (DefaultInGameUI SkipButton, top right, text left/per day). `show`: a Normal level after a death.
  // SkipButtonView.Initialize picks the sprite: the crown with flag.old_no_ads, the ticket one when AdsService.CanSkip
  // (tickets > 1, ads.js canSkip), else the rewarded-ad one (SkipButton0001) [asm 0x12a38a4..0x12a3968].
  skipView(show) {
    const s = this.app.save, el = document.getElementById('skip');
    const on = show && this.skipsLeft(s) > 0;
    el.classList.toggle('on', on);
    if (!on) return;
    el.querySelector('b').textContent = `${this.skipsLeft(s)}/${this.skipsPerDay(s)}`;
    const art = canSkip(s) ? 'skip' : 'skip-ad';
    if (el.dataset.art !== art) { el.dataset.art = art; el.style.backgroundImage = `url(./art/${art}.webp${this.app.V})`; }
  }
  // The piggy bank popup itself (PiggyBankPopup, full screen) is drawn by endgame.js with these rules.
}

const REFUSED = { has_cards: 'Cần có thẻ đầu tiên', didnt_buy_free_coins_today: 'Mai quay lại',
  didnt_buy_rewarded_coins_today: 'Mai quay lại', hidden: 'Ưu đãi này không còn', none: 'Không có ưu đãi này' };

// "+3000 xu, +60 vé, 12 món mới, 3 gói thẻ" from Meta.grantReward's out list
export function gotText(got) {
  let coins = 0, tickets = 0, items = 0, boosters = 0, tokens = 0, flags = 0;
  for (const g of got) {
    coins += g.coins || 0; tickets += g.tickets || 0; tokens += g.tokens || 0;
    if (g.item) items++; if (g.booster) boosters += g.q || 1; if (g.flag) flags++;
  }
  return [coins && `+${coins} xu`, tickets && `+${tickets} vé`, tokens && `+${tokens} token`, items && `${items} món mới`,
    boosters && `${boosters} gói thẻ`, !coins && !tickets && !items && !boosters && !tokens && flags && 'đã kích hoạt'].filter(Boolean).join(', ') || 'đã nhận';
}

const CSS = `
#skip { top: calc(max(12px, env(safe-area-inset-top)) + 58px); right: 12px; width: 108px; height: 82px; padding: 0; border: 0;
  background: no-repeat center / contain; cursor: pointer; display: none; }
#skip.on { display: block; }
#skip b { position: absolute; left: 0; right: 0; top: 100%; text-align: center; font-size: 17px; text-shadow: 0 2px 0 #0d1b2a; }
body.menu #skip { visibility: hidden; }
#homeOffers.none { visibility: hidden; }
#homeOffers .hw > i { left: 0; right: 0; top: 0; bottom: calc(var(--u) * 20); }
`;

// `app` is main.js's handle (save, meta, icon(), openMenu(), skipLevel(), ...). Adds the views' DOM and returns the rules.
// `ads` is data/ads.json: the market's offers (ads.js Shop, `bonus.shop`).
export function makeBonus(app, d, ads) {
  const b = new Bonus(app.meta, d);
  b.app = app;
  b.shop = new Shop(app.meta, ads);
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  // the home screen's ticket pill, offer column and wheel widget are in index.html (laid out by home.js)
  document.getElementById('btnWheel').onclick = () => app.openMenu('openWheel');
  // the skip image is a CSS background: the browser fetches it when the button first shows
  document.body.insertAdjacentHTML('beforeend', `<button class="ui" id="skip" title="Bỏ qua màn"><b></b></button>`);
  document.getElementById('skip').onclick = () => app.skipLevel();
  return b;
}
