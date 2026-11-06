// Shop (ShopMenuController(Funflare) + ShopCategorySlot + ShopItemSlot) and the Rolling Offer menu (RollingOfferMenu),
// rebuilt from the prefabs in art/ui/menus. Rules and prices: sim/shop.js, sim/rolling.js.
import {
  CATEGORIES, ITEMS, AD, FREE, GEM, CASH, SKIP_GEMS, TIMED, shopState, rewards, price, availability, buy, canSkip,
  openCount, secondsToUtcMidnight,
} from '../sim/shop.js';
import { LADDER, FREE as RO_FREE, current, pay, claim } from '../sim/rolling.js';

const fmt = n => n.toLocaleString('en-US');
// ShopItemSlotBase.HideBigNumber.
export function bigNumber(n) {
  const k = (v, f) => `${+v.toFixed(f)}`;
  if (n < 1000) return `${Math.round(n)}`;
  if (n < 1e4) return `${k(n / 1e3, 1)}K`;
  if (n < 1e5) return `${k(n / 1e3, 2)}K`;
  if (n < 1e6) return `${k(n / 1e3, 1)}K`;
  if (n < 1e8) return `${k(n / 1e6, 2)}M`;
  return `${k(n / 1e6, 1)}M`;
}
const pad = n => String(Math.floor(n)).padStart(2, '0');
// The scrollTop that brings el to the top of the scrolling box sc.
const scrollTo = (sc, el) => (el ? el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop : 0);
const hms = s => `${pad(s / 3600)}:${pad(s % 3600 / 60)}:${pad(s % 60)}`;
// FunflareSpriteConfig visuals for daily-deal rewards, and the booster tiles of the rolling offer cards.
const DEAL_ICON = { reward_cash: 'cash-02', reward_gem: 'gem-02', reward_faster_workers: 'workersSpeedBoostIcon',
  reward_faster_player: 'playerSpeedBoostIcon', reward_extra_customers: 'extraCustomersIcon', reward_super_worker: 'workersSpeedBoostIcon' };
// ShopItemSlotBase.GetRewardText for timed rewards.
const DEAL_TEXT = { reward_faster_workers: 'Faster Workers', reward_faster_player: 'Faster Player',
  reward_extra_customers: 'Extra Customers', reward_super_worker: 'Super Worker' };
const BOOST_ICON = { player: 'playerSpeedBoostIcon', worker: 'workersSpeedBoostIcon', machine: 'MachineSpeedBoostUI',
  cash: 'revenueBoostIcon', customer: 'extraCustomersIcon' };

export class Shop {
  // g: the global save; wallet: { cash(), spendCash(n), addCash(n), boost(kind, s), cheapest(), features(), shake() };
  // save(): persist g; unlocked(): the shop button is on.
  constructor({ art, sound, g, wallet, save, unlocked, now = () => new Date() }) {
    Object.assign(this, { g, wallet, save, sound, now, unlocked: unlocked || (() => true) });
    this.m = n => `${art}/ui/menus/${n}.webp`;
    g.gems = g.gems || 0;
    g.ro = g.ro || 0;
    shopState(g);
    this.seen = null;
  }

  ctx() {
    return { g: this.g, now: this.now(), features: this.wallet.features(), cash: this.wallet.cash, spendCash: this.wallet.spendCash };
  }

  tap(cancel) { if (this.sound) this.sound.play(cancel ? 'cancel' : 'tap'); }

  mount(root) {
    const m = this.m;
    root.insertAdjacentHTML('beforeend', `
      <div class="mshade dshop" id="shopmenu"><div class="panel" style="--bg:url('${m('bg-upgrade')}')">
        <div class="top" style="--hb:url('${m('bg-header-upgrade')}')"><b class="ol">SHOP</b>
          <a class="sb x" data-act="close" style="--b:url('${m('button-exit')}')"></a></div>
        <div class="scroll"><div class="list"></div></div>
      </div></div>
      <div class="mshade droll" id="romenu">
        <a class="tb x" data-act="close" style="--c:#ff585d"><img src="${m('crossUI')}" alt=""></a>
        <div class="panel">
          <div class="head"><img src="${m('giftTrolleyIcon')}" alt=""><div><b class="ol t1">Rolling</b><b class="ol t2">Offers</b></div><img src="${m('giftTrolleyIcon')}" alt=""></div>
          <p class="ol hint">Claim offers to unlock more!</p>
          <div class="scroll"><div class="list"></div></div>
        </div></div>`);
    this.el = root.querySelector('#shopmenu');
    this.list = this.el.querySelector('.list');
    this.roEl = root.querySelector('#romenu');
    this.roList = this.roEl.querySelector('.list');
    this.el.addEventListener('click', e => this.shopClick(e));
    this.roEl.addEventListener('click', e => this.roClick(e));
  }

  get isOpen() { return this.el.classList.contains('open') || this.roEl.classList.contains('open'); }

  // CanvasManager.OpenNewShopMenu(categoryId): pop in, then snap to the asked category (top otherwise).
  open(category = null) {
    if (!this.unlocked()) return;
    this.key = null;
    this.render();
    this.el.classList.add('open');
    const sc = this.el.querySelector('.scroll');
    sc.scrollTop = category ? scrollTo(sc, this.list.querySelector(`[data-cat="${category}"]`)) : 0;
    // ShopMenuButton: a tap stores the open-item count, which clears the dot.
    this.seen = openCount(this.ctx());
  }

  close() { this.el.classList.remove('open'); this.roEl.classList.remove('open'); }

  item(it, ctx) {
    const m = this.m, av = availability(it, ctx);
    if (av === 'gone') return '';
    const r = rewards(it, ctx), p = price(it, ctx), first = r.list[0];
    const deal = it.cat === 'daily_deals', grey = av === 'bought';
    let icon, label;
    if (deal) {
      icon = DEAL_ICON[first.item];
      label = TIMED[first.item] ? DEAL_TEXT[first.item] : bigNumber(first.amount);
    } else {
      icon = `${first.item === 'reward_cash' ? 'cash' : 'gem'}-${grey ? 'dark-' : ''}0${Math.min(it.ord, 5) + 1}`;
      label = bigNumber(first.amount);
    }
    const scale = deal ? 1 : 1 + it.ord * 0.08;
    const cool = av === 'cooling' ? Math.ceil(((ctx.g.shop.cool[it.id] || 0) - +ctx.now) / 1000) : 0;
    let btn;
    if (cool) btn = `<img src="${m('adIcon')}" alt="">${pad(cool / 60)}:${pad(cool % 60)}`;
    else if (p.pay === AD) btn = `<img src="${m('adIcon')}" alt="">Free`;
    else if (p.pay === FREE) btn = 'Claim';
    else btn = `<img src="${m(p.pay === GEM ? 'icon-gem' : 'cashIcon')}" alt="">${bigNumber(p.amount)}`;
    const short = (p.pay === GEM && ctx.g.gems < p.amount) || (p.pay === CASH && ctx.cash() < p.amount);
    const skip = cool && canSkip(it)
      ? `<a class="sb ol skip${ctx.g.gems < SKIP_GEMS ? ' poor' : ''}" data-skip="${it.id}" style="--b:url('${m('button-yellow')}')"><img src="${m('icon-gem')}" alt="">SKIP<s class="ol">x${SKIP_GEMS}</s></a>` : '';
    return `<div class="slot${grey ? ' grey' : ''}" data-id="${it.id}" style="--bg:url('${m('cash-bundle-bg')}')">
      ${it.badge ? `<i class="badge ol" style="--b:url('${m('badge-shop-1')}')">${it.badge}</i>` : ''}
      <div class="ico" style="--k:${scale}"><img class="shine" src="${m('bundle-shine')}" alt=""><img src="${m(icon)}" alt="">
        ${grey ? `<img class="lock" src="${m('icon-lock')}" alt="">` : ''}</div>
      <div class="amt">${r.was ? `<s class="ol">${r.was}</s>` : ''}<b class="ol${TIMED[first.item] ? ' txt' : ''}">${label}</b></div>
      ${skip}
      <a class="sb ol buy${cool ? ' wait' : ''}${short ? ' poor' : ''}${grey ? ' off' : ''}" data-buy="${it.id}" style="--b:url('${m('button-green')}')">
        ${p.was ? `<s class="cut ol">${bigNumber(p.was)}</s>` : ''}${btn}</a>
    </div>`;
  }

  render() {
    const ctx = this.ctx(), left = secondsToUtcMidnight(ctx.now);
    const html = CATEGORIES.map(c => {
      const slots = ITEMS.filter(it => it.cat === c.id).sort((a, b) => a.ord - b.ord).map(it => this.item(it, ctx)).join('');
      const timer = c.id === 'daily_deals' ? `<i class="ol timer"><img src="${this.m('time')}" alt="">New Offers in ${hms(left)}</i>` : '';
      return `<div class="cat" data-cat="${c.id}" style="--cb:url('${this.m('category-bg')}')"><b class="ol name">${c.name}</b>${timer}
        <div class="grid">${slots}</div></div>`;
    }).join('');
    if (html !== this.key) { this.key = html; this.list.innerHTML = html; }
  }

  shopClick(e) {
    if (e.target.closest('[data-act="close"]')) { this.tap(true); this.el.classList.remove('open'); return; }
    const b = e.target.closest('[data-buy], [data-skip]');
    if (!b) return;
    const skip = !!b.dataset.skip, it = ITEMS.find(x => x.id === (b.dataset.buy || b.dataset.skip));
    const res = buy(it, this.ctx(), { skip });
    if (!res.ok) {
      // PerformPurchaseBy*: ShakeCashOnce on the counter that came up short.
      if (res.why === 'cash') this.wallet.shake();
      if (res.why === 'gems' || res.why === 'cash') { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
      if (res.why === 'gems') {
        const sc = this.el.querySelector('.scroll');
        sc.scrollTo({ top: scrollTo(sc, this.list.querySelector('[data-cat="gem_bundles"]')), behavior: 'smooth' });
      }
      return;
    }
    this.tap();
    this.give(res.list);
    this.save();
    this.key = null;
    this.render();
  }

  // ShopItemRewardGiver: cash with the coin burst, gems to the counter, timed rewards through the boosters.
  give(list) {
    for (const r of list) {
      if (r.item === 'reward_cash') this.wallet.addCash(r.amount);
      else if (r.item === 'reward_gem') this.g.gems += r.amount;
      else if (TIMED[r.item]) this.wallet.boost(TIMED[r.item], r.amount * 60);
    }
  }

  // ---- Rolling offer

  openRolling() {
    this.renderRolling();
    this.roEl.classList.add('open');
    this.scrollRolling(false);
  }

  renderRolling() {
    const m = this.m, cur = current(this.g), ctx = { cheapest: this.wallet.cheapest(), g: this.g };
    const tile = r => {
      const p = pay(r, ctx);
      if (p.kind === 'cash') return `<div class="tile"><img src="${m('cashBagIcon')}" alt=""><b class="ol c">${fmt(p.amount)}</b></div>`;
      if (p.kind === 'gems') return `<div class="tile"><img src="${m('icon-gem')}" alt=""><b class="ol g">${p.amount}</b></div>`;
      return `<div class="tile b"><img src="${m(BOOST_ICON[p.boost])}" alt=""><b class="ol">${p.seconds / 60} mins</b></div>`;
    };
    const cards = LADDER.map((s, i) => {
      if (s.type === 2 || i < cur) return '';
      const locked = i > cur;
      const btn = s.type === RO_FREE ? 'Free' : `<img src="${m('adIcon')}" alt="">Collect`;
      return `<div class="card${locked ? ' locked' : ''}" data-i="${i}">
        <div class="prize">${s.list.map(tile).join('<i class="ol plus">+</i>')}</div>
        <a class="sb ol claim" data-claim="${i}" style="--b:url('${m('normalButtonSmall')}')">${btn}</a>
        ${locked ? `<i class="lockbg"></i><img class="lock" src="${m('padlock_icon')}" alt="">` : ''}</div>`;
    }).join('');
    this.roList.innerHTML = `${cards}<div class="card soon"><b class="ol">Coming soon!</b></div>`;
  }

  // ScrollToTheActiveRollingOffer: the current card at the top of the view.
  scrollRolling(smooth) {
    const sc = this.roEl.querySelector('.scroll'), c = this.roList.querySelector('.card:not(.gone)');
    if (c) sc.scrollTo({ top: scrollTo(sc, c), behavior: smooth ? 'smooth' : 'auto' });
  }

  roClick(e) {
    if (e.target.closest('[data-act="close"]')) { this.tap(true); this.roEl.classList.remove('open'); return; }
    const b = e.target.closest('[data-claim]');
    if (!b || this.roBusy) return;
    const i = +b.dataset.claim, out = claim(this.g, i, { cheapest: this.wallet.cheapest(), g: this.g });
    if (!out) return;
    this.tap();
    // GiveReward: rewards in list order, each cash or coupon line 1.15 s after the one before.
    let d = 0;
    for (const p of out) {
      if (p.kind === 'boost') this.wallet.boost(p.boost, p.seconds);
      else {
        const t = d * 1150;
        if (p.kind === 'cash') setTimeout(() => this.wallet.addCash(p.amount), t);
        else this.g.gems += p.amount;
        d++;
      }
    }
    this.save();
    // UnlockNextOffer: the claimed card shrinks away (0.25 s InBack after 0.75 s), the list scrolls on and the next
    // card's lock fades.
    const card = b.closest('.card');
    card.classList.add('done');
    this.roBusy = true;
    setTimeout(() => {
      card.classList.add('gone');
      const next = this.roList.querySelector('.card.locked');
      if (next) next.classList.add('unlocking');
      this.scrollRolling(true);
      setTimeout(() => { this.roBusy = false; this.renderRolling(); this.scrollRolling(false); }, 600);
    }, 1000);
  }

  update() {
    if (this.el.classList.contains('open')) {
      const now = performance.now();
      if (now - (this.t || 0) > 500) { this.t = now; this.render(); }
    }
  }

  // The HUD dot: the open-item count moved since the last tap (first look: after the first open).
  dot() {
    if (!this.unlocked()) return false;
    const n = openCount(this.ctx());
    if (this.seen == null) this.seen = n;
    return n !== this.seen;
  }
}
