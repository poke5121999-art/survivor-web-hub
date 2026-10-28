// Lucky Wheel, piggy bank, market (daily free coins, skip tickets) and skip level, driven by data/bonus.json
// (tools/build_meta.py). main.js loads this module with the home screen, at the first death or at the finish of a Normal
// level, so the first level never downloads it. Rules first (class Bonus, pure on the save), then the views it owns:
// the home widgets, the in-game skip button and the piggy bank panel. The wheel and market sheets are in menus.js.
import { SKIP_TICKETS, qty, addQty } from './meta.js';

export const FREE_COINS = 'daily.free_coins';
const WHEEL_CLAIMS = 'progression.lucky_wheel_claims';
const PIGGY_PROGRESS = 'progression.piggy_bank_progress', PIGGY_CLAIMS = 'progression.piggy_bank_claims',
  PIGGY_SKIPS = 'progression.piggy_bank_skips';
const SKIPPED = 'flag.nb_levels_skipped_';
const WELCOME_BOOSTER = 'flag.has_welcome_booster';
// PiggyBankService.GetFillAmount picks a column of the fill config by source
export const PIGGY_LEVEL = 1, PIGGY_REWARDED = 2;

// Day id of the local calendar day: periodic resources and the skip counter are not UTC (isUtc false).
// [ĐỀ XUẤT] the format YYYYMMDD (the original's TimeServiceHelper.FormatDateId is not decoded).
export function dayId(d = new Date()) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }

// Rules of the original services, on a save. `m` is the Meta (items, rewards), `d` is data/bonus.json.
export class Bonus {
  constructor(m, d) { this.m = m; this.d = d; }

  // A rewarded ad is skipped by paying its skipPrice (ads placement rewarded.default: 1 skip ticket). Ads do not exist
  // here, so every "watch an ad" action of the original costs that price.
  payRewarded(s) {
    const [res, q] = this.d.offers.skipPrice;
    if (qty(s, res) < q) return false;
    addQty(s, res, -q);
    return true;
  }

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
    addQty(s, WHEEL_CLAIMS, 1);
    const got = [];
    this.m.grantReward(s, [reward.res, reward.q], got);
    return { reward, price, got };
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

  // The popup's two ad buttons: "Unlock" when full (rewarded.piggy_bank_unlock), "+N%" otherwise (rewarded.piggy_bank_fill).
  piggyUnlock(s, out = []) {
    if (!this.piggyFull(s)) return null;
    if (!this.payRewarded(s)) return { refused: 'tickets' };
    return { got: this.piggyClaim(s, out) };
  }

  piggyBoost(s) {
    if (this.piggyFull(s) || !this.piggyReward(s)) return null;
    if (!this.payRewarded(s)) return { refused: 'tickets' };
    this.piggyAdd(s, this.piggyFill(s, PIGGY_REWARDED));
    return { progress: this.piggyProgress(s) };
  }

  // ---- Market: daily free coins (offer.free_coins, requirement didnt_buy_free_coins_today), skip ticket packs ----
  freeCoinsReady(s, day = dayId()) { return s.periodic[FREE_COINS] !== day; }

  claimFreeCoins(s, day = dayId()) {
    if (!this.freeCoinsReady(s, day)) return 0;
    s.periodic[FREE_COINS] = day;
    s.coins += this.d.offers.freeCoins;
    return this.d.offers.freeCoins;
  }

  // The original sells these packs for real money; here they cost coins ([ĐỀ XUẤT] price, tools/build_meta.py TICKET_COINS).
  buyTickets(s, i) {
    const [q, price] = this.d.offers.tickets[i];
    if (s.coins < price) return false;
    s.coins -= price;
    addQty(s, SKIP_TICKETS, q);
    return true;
  }

  // ---- Skip level (SkipLevelService) ----
  // Per day = effect of card.skip_level at the player's card level (GetNbSkippableLevelsPerDay [asm 0x124ea20]); a card
  // level below 1 gives 0 (GetCardEffectForLevel [asm 0x127c668]), level L gives min + graduation * (L - 1), max level max.
  // [ĐỀ XUẤT] cards are not built: card level 1 once the welcome booster flag is owned, since that booster's guaranteed
  // cards hold card.skip_level; level 0 before.
  skipsPerDay(s) {
    const level = (s.flags[WELCOME_BOOSTER] || 0) > 0 ? 1 : 0;
    const [min, max, step, maxLevel] = this.d.skipCard;
    return level < 1 ? 0 : level >= maxLevel ? max : min + step * (level - 1);
  }

  skipsLeft(s, day = dayId()) { return this.skipsPerDay(s) - (s.flags[SKIPPED + day] || 0); }

  // SkipButtonView: the skip is a rewarded ad (rewarded.skip_level), paid here with its skip ticket; then
  // SkipLevelService.SkipLevel counts it in flag.nb_levels_skipped_<day> [asm 0x124eb40..0x124eb94] and the level completes
  // (GamePlayService.SkipLevel -> CompleteLevel [asm 0x129c96c]). Older day counters are dropped (CleanDailyTokenFlags).
  skipLevel(s, day = dayId()) {
    if (this.skipsLeft(s, day) < 1) return { refused: 'limit' };
    if (!this.payRewarded(s)) return { refused: 'tickets' };
    const key = SKIPPED + day;
    for (const f of Object.keys(s.flags)) if (f.startsWith(SKIPPED) && f !== key) delete s.flags[f];
    s.flags[key] = (s.flags[key] || 0) + 1;
    return { left: this.skipsLeft(s, day) };
  }

  // ---- views ----------------------------------------------------------------------------------------------------
  // Home: the ticket pill next to the coins, the market widget on the left and the Lucky Wheel widget on the right
  // (HomePage MarketWidgetsHolder / ModesContainer LuckyWheelButton with its coins/price counter and red dot).
  hud() {
    const s = this.app.save, $ = (id) => document.getElementById(id);
    $('tickets').textContent = qty(s, SKIP_TICKETS);
    const price = this.wheelPrice(s)[1];
    $('wheelPrice').textContent = price ? `${s.coins}/${price}` : 'Miễn phí';
    $('wheelDot').classList.toggle('on', s.coins >= price && this.wheelRewards(s).length > 0);
    $('marketDot').classList.toggle('on', this.freeCoinsReady(s));
  }

  // The skip button (DefaultInGameUI SkipButton, top right, text left/per day). `show`: a Normal level after a death.
  skipView(show) {
    const s = this.app.save, el = document.getElementById('skip');
    const on = show && this.skipsLeft(s) > 0;
    el.classList.toggle('on', on);
    if (on) el.querySelector('b').textContent = `${this.skipsLeft(s)}/${this.skipsPerDay(s)}`;
  }

  hidePiggy() { document.getElementById('piggy').classList.remove('on'); }

  // The piggy bank at the end of a Normal level (PiggyBankPopup): the next skin fills from the bottom; full, it is
  // unlocked or lost. r = piggyLevelEnd() {res, before, after}.
  // [ĐỀ XUẤT] a panel under the finish text instead of the original full-screen popup, so a tap still continues.
  showPiggy(r) {
    const { app } = this, s = app.save, el = document.getElementById('piggy');
    const res = this.piggyReward(s), p = this.piggyProgress(s), full = this.piggyFull(s);
    if (!res) { this.hidePiggy(); return; }
    const add = r && res === r.res ? r.after - r.before : 0;
    el.dataset.res = res;
    el.innerHTML = `<div class="pg"><div class="pic"><i class="dim"></i><i class="lit"></i></div><div class="info">
      <b>Heo đất</b><small>${full ? 'Đầy rồi! Mở khoá trước khi qua màn sau, không thì mất' : 'Qua màn để nạp, đầy thì được skin'}:
      ${app.meta.resTitle(res)}</small><div class="bar"><span></span><div class="pct">${p}%${add ? ' (+' + add + '%)' : ''}</div></div></div></div>
      <div class="btns"><button class="act">${full ? 'Mở khoá' : '+' + this.piggyFill(s, PIGGY_REWARDED) + '%'} · 1 <i></i></button>
      ${full ? '<button class="lose">Bỏ đi</button>' : ''}</div>`;
    const A = this.d.piggyArt, [W, H] = A._size, rr = A[res], k = 84 / Math.max(rr[2], rr[3]);
    for (const i of el.querySelectorAll('.pic i')) {
      Object.assign(i.style, { backgroundImage: `url(./art/piggy.webp${app.V})`, backgroundSize: `${W * k}px ${H * k}px`,
        backgroundPosition: `${-rr[0] * k + (84 - rr[2] * k) / 2}px ${-rr[1] * k + (84 - rr[3] * k) / 2}px` });
    }
    app.icon(el.querySelector('.act i'), 'ticket', 22);
    const lit = el.querySelector('.lit'), bar = el.querySelector('.bar span');
    const set = (v) => { lit.style.clipPath = `inset(${100 - v}% 0 0 0)`; bar.style.width = v + '%'; };
    const from = r && res === r.res ? r.before : p;
    set(from);
    if (from !== p) requestAnimationFrame(() => requestAnimationFrame(() => set(p)));
    el.querySelector('.act').onclick = () => {
      const done = full ? this.piggyUnlock(s) : this.piggyBoost(s);
      if (!done) return;
      if (done.refused) { app.toast('Cần 1 vé bỏ qua (mua ở Chợ trên trang chính)'); return; }
      app.play('popup_in');
      app.writeSave();
      app.hud();
      if (full) app.toast('Mở khoá: ' + app.meta.resTitle(res));
      this.showPiggy(full ? null : { res, before: p, after: this.piggyProgress(s) });
    };
    const lose = el.querySelector('.lose');
    if (lose) lose.onclick = () => { app.play('popup_out'); this.piggyLose(s); app.writeSave(); this.showPiggy(null); };
    el.classList.add('on');
  }
}

const CSS = `
#skip { top: calc(max(12px, env(safe-area-inset-top)) + 58px); right: 12px; width: 108px; height: 82px; padding: 0; border: 0;
  background: no-repeat center / contain; cursor: pointer; display: none; }
#skip.on { display: block; }
#skip b { position: absolute; left: 0; right: 0; top: 100%; text-align: center; font-size: 17px; text-shadow: 0 2px 0 #0d1b2a; }
body.menu #skip { visibility: hidden; }
.widgets { position: absolute; left: 50%; transform: translateX(-50%); width: min(calc(100% - 28px), 560px); top: 56%; display: flex; justify-content: space-between; pointer-events: none; }
.widget { pointer-events: auto; position: relative; width: 78px; padding: 6px 2px 4px; border: 0; border-radius: 16px;
  background: rgba(0, 26, 51, .3); color: #fff; font: 800 12px/1.1 system-ui, sans-serif; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 3px; }
.widget span { background: rgba(255, 140, 140, .9); border-radius: 8px; padding: 1px 6px; color: #3b0d0d; }
.dot { position: absolute; top: 2px; left: 6px; width: 14px; height: 14px; border-radius: 50%; background: #ff1a1a;
  border: 2px solid #fff; display: none; }
.dot.on { display: block; }
#piggy { left: 50%; transform: translateX(-50%); bottom: max(18px, env(safe-area-inset-bottom)); width: min(92vw, 420px);
  display: none; flex-direction: column; gap: 8px; background: rgba(13, 27, 42, .88); border-radius: 18px; padding: 10px 12px;
  box-sizing: border-box; }
#piggy.on { display: flex; }
body.menu #piggy { visibility: hidden; }
body:has(#piggy.on) #toast { bottom: 190px; }
#piggy .pg { display: flex; gap: 12px; align-items: center; }
#piggy .pic { position: relative; width: 84px; height: 84px; flex: none; }
#piggy .pic i { position: absolute; inset: 0; background-repeat: no-repeat; transition: clip-path .8s ease-out; }
#piggy .pic .dim { filter: brightness(0) opacity(.45); }
#piggy .info { flex: 1; min-width: 0; }
#piggy .info b { font-size: 18px; display: block; }
#piggy .info small { font-size: 13px; opacity: .85; display: block; margin: 2px 0 6px; }
#piggy .bar { height: 14px; border-radius: 9px; background: #23415e; overflow: hidden; position: relative; }
#piggy .bar span { display: block; height: 100%; width: 0; background: linear-gradient(#9fff54, #20c060); transition: width .8s ease-out; }
#piggy .pct { position: absolute; inset: 0; font-size: 11px; line-height: 14px; text-align: center; }
#piggy .btns { display: flex; gap: 8px; }
#piggy button { flex: 1; border: 3px solid #0d1b2a; border-radius: 14px; font: 900 16px system-ui; padding: 8px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 4px; background: #9fff54; color: #0d1b2a; }
#piggy button.lose { background: #fff; flex: 0 0 auto; }
`;

// `app` is main.js's handle (save, meta, icon(), openMenu(), skipLevel(), ...). Adds the views' DOM and returns the rules.
export function makeBonus(app, d) {
  const b = new Bonus(app.meta, d);
  b.app = app;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const coins = document.getElementById('coins').parentNode;
  coins.insertAdjacentHTML('afterend', '<div class="pill" title="Vé bỏ qua"><i class="ico" data-ico="ticket"></i><b id="tickets">0</b></div>');
  document.querySelector('#start .title').insertAdjacentHTML('afterend', `<div class="widgets">
    <button class="widget" id="btnMarket" title="Chợ: xu miễn phí, vé bỏ qua"><i class="ico" data-ico="coinpile" data-px="56"></i>
      <span>Chợ</span><b class="dot" id="marketDot"></b></button>
    <button class="widget" id="btnWheel" title="Vòng quay may mắn"><i class="ico" data-ico="wheel" data-px="56"></i>
      <span id="wheelPrice"></span><b class="dot" id="wheelDot"></b></button></div>`);
  document.getElementById('btnMarket').onclick = () => app.openMenu('openMarket');
  document.getElementById('btnWheel').onclick = () => app.openMenu('openWheel');
  // the skip image is a CSS background: the browser fetches it when the button first shows
  document.body.insertAdjacentHTML('beforeend', `<button class="ui" id="skip" title="Bỏ qua màn (1 vé)"
    style="background-image:url(./art/skip.webp${app.V})"><b></b></button><div class="ui" id="piggy"></div>`);
  document.getElementById('skip').onclick = () => app.skipLevel();
  return b;
}
