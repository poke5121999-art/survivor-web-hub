// SceneShop (Shop + ShopItemDisplay, META §8/§9): VIP pass block, skin special offer, league pack, daily paid offer,
// 4 daily gifts (free / ad / 2 VIP cells unlocked by ads, 00:00 UTC rotation), fridges (box2/box3 via
// SceneConfirmPurchase), gem packs (IAP) and coin packs (gems). Ads and IAP: the click is the ad / the purchase.
import { Screen, fmtTime } from './base.js';
import { T } from '../text.js';
import { PriceType, ShopGroup, RewardType, Reward, Rarity, Profile, MetaRng } from '../../meta/index.js';
import { bindCurrencies, rewardIcon, packRewardIcon, rewardName } from './common.js';
import { SkinCell, skinIcon } from './SkinDisplay.js';
import { VipScreen } from './Vip.js';

const rng = () => new MetaRng((Date.now() ^ (Math.random() * 1e9)) & 0x7fffffff);
const COIN_ICONS = ['pack_currency_freemium_01', 'pack_currency_freemium_02', 'pack_currency_freemium_03', 'pack_currency_freemium_04'];
const GEM_ICONS = ['pack_currency_premium_01', 'pack_currency_premium_02', 'pack_currency_premium_03', 'pack_currency_premium_04', 'pack_currency_premium_05', 'pack_currency_premium_06'];

// ShopItemDisplay over one cell
class ShopCell {
  constructor(screen, comp) { this.s = screen; this.comp = comp; this.f = comp.fields; this.node = comp.node; this.inst = comp.node.scene; }
  r(k) { return this.f[k] ? this.inst.ref(this.f[k]) : null; }
  n(k) { const x = this.r(k); return x && x.node ? x.node : x; }
  act(k, on) { const n = this.n(k); if (n) n.setActive(!!on); }

  // item: {reward, priceType, price, priceText?, claimed, icon?, title?, highlight, alert, adReady}
  set(item) {
    const { app } = this.s;
    this.item = item;
    const r = item.reward;
    const tokenSkin = r && r.type === RewardType.Token && r.skinId > 0;
    const isSkin = r && r.type === RewardType.Skin;
    const img = this.r('m_image');
    if (img) { img.node.setActive(!tokenSkin && !isSkin); const ic = item.icon || rewardIcon(r); if (ic) img.setSprite(ic.startsWith('sprite:') ? ic : 'sprite:' + ic); }
    const is = this.r('m_imageSkin'); if (is) { is.node.setActive(!!(tokenSkin || isSkin)); if (tokenSkin || isSkin) is.setSprite(skinIcon(r.skinId)); }
    const bs = this.r('m_backgroundSkin');
    if (bs) {
      // daily gifts: the coloured card behind the frame follows the reward (clip: coins yellow, gems green, fridges blue)
      bs.node.setActive(!!(tokenSkin || isSkin || item.bgSprite));
      if (tokenSkin || isSkin) { const d = app.meta.db.findSkin(r.skinId); if (d) bs.setSprite(app.skins.background(d.rarity)); }
      else if (item.bgSprite) bs.setSprite(item.bgSprite);
    }
    const title = this.r('m_title');
    if (title) title.setText(item.title !== undefined ? item.title : r ? (r.type === RewardType.Freemium || r.type === RewardType.Premium || r.type === RewardType.Token ? 'x' + r.count : Reward.isBox(r) ? '' : '') : '');
    const pi = this.r('m_priceIcon'), pr = this.r('m_price');
    const pt = item.priceType;
    if (pi) { pi.node.setActive(pt === PriceType.Freemium || pt === PriceType.Premium); pi.setSprite(pt === PriceType.Freemium ? 'sprite:icon_currency_freemium' : 'sprite:icon_currency_premium'); }
    if (pr) {
      let txt = item.priceText;
      if (txt === undefined) txt = pt === PriceType.Free ? T('info.free') : pt === PriceType.Ad || pt === PriceType.VipOnly ? '' : pt === PriceType.InApp ? (this.inAppText || (this.inAppText = pr.text)) : String(item.price);
      pr.setText(item.claimed ? T('info.claimed') : txt);
      const bal = pt === PriceType.Freemium ? app.profile.coins : pt === PriceType.Premium ? app.profile.gems : Infinity;
      pr.color = (bal < item.price && !item.claimed ? app.gameData.m_colorNotEnough : [1, 1, 1, 1]).slice();
    }
    const bg = this.r('m_background'); if (bg && item.tint) { bg.color = [item.tint[0], item.tint[1], item.tint[2], bg.color[3]]; bg.enabled = true; }
    this.act('m_purchased', item.claimed);
    this.act('m_highlight', !!item.highlight && !item.claimed);
    const ad = (pt === PriceType.Ad || pt === PriceType.VipOnly) && !item.claimed;
    this.act('m_watchAdReadyVisual', ad);
    this.act('m_watchAdNotReadyVisual', false);
    const wt = this.r('m_watchAdActiveText'); if (wt && item.adsNeeded) wt.setText(`${item.adsWatched || 0}/${item.adsNeeded}`);
    this.act('m_alertDot', !item.claimed && (ad || !!item.highlight || pt === PriceType.Free));
    const lv = this.n('m_level'); if (lv) lv.setActive(!!tokenSkin);
    if (tokenSkin && this.f.m_tokenDisplay) { if (!this.tok) this.tok = new SkinCell(this.s, this.inst.ref(this.f.m_tokenDisplay)); this.tok.set(r.skinId, { model: false }); }
  }
}

export class ShopScreen extends Screen {
  constructor(app) { super(app, 'SceneShop', 0); }

  async init() {
    const { app } = this;
    const f = this.sf = this.fields('Shop');
    bindCurrencies(this);
    await app.ensureSprites([...COIN_ICONS, ...GEM_ICONS, 'pack_currency_premium_05', 'icon_reward_01', 'icon_reward_02', 'icon_reward_03', 'icon_token_generic', 'icon_skin_01', 'bg_skin_1', 'bg_skin_3', 'bg_skin_4', 'bg_skin_5']);
    const cells = (list) => (list || []).map((r) => new ShopCell(this, this.ref(r)));
    this.gifts = cells(f.m_dailyGiftsCell);
    this.boxes = cells(f.m_boxesCell);
    this.premium = cells(f.m_premiumCell);
    this.freemium = cells(f.m_freemiumCell);
    const so = this.ref(f.m_specialOfferSkin);
    this.offerSkin = so ? new SkinCell(this, so) : null;
    this.offerCell = new ShopCell(this, this.node(f.m_specialOffer).script('ShopItemDisplay'));
    this.on('Close', () => this.close());
    this.on('OpenVIP', async () => { const s = await app.popup(VipScreen); await s.done(); this.refresh(); });
    this.on('BuyLeaguePack', () => this.buyLeaguePack());
    this.on('BuyDailyPaidOffer', () => this.buyPaidOffer());
    this.on('Buy', (o, b) => this.buy(b.node));
    this.refresh();
    this.offTick = app.on((k) => { if (k === 'tick') this.timers(); if (k === 'profile') this.refresh(); });
    const prev = this.onClose; this.onClose = () => { this.offTick(); if (prev) prev(); };
    const sr = this.script('ScrollRect');
    if (sr) sr.normalizedPosition = [0, 0];
  }

  now() { return new Date(); }

  refresh() {
    if (this.closed) return;
    const { app } = this, p = app.profile, now = this.now(), meta = app.meta, f = this.sf;
    const vip = Profile.isVip(p, now);
    this.setActive(f.m_noAdsInfo, !vip && !p.hasMadePurchase);
    this.setActive(f.m_supportInfo, vip || p.hasMadePurchase);
    // skin special offer of the day
    const so = p.daily.specialOffer;
    const showOffer = !!(so && so.skinId > 0 && !Profile.hasSkin(p, so.skinId));
    this.setActive(f.m_specialOffer, showOffer);
    if (showOffer) {
      const d = meta.db.findSkin(so.skinId);
      const epic = d && d.rarity === Rarity.Epic;
      const of = this.offerCell.f, inst = this.inst;
      for (const [k, on] of [['m_backgroundSkinRare', !epic], ['m_backgroundSkinEpic', epic], ['m_ButtonSkinRare', !epic], ['m_ButtonSkinEpic', epic]]) { const n = of[k] && inst.ref(of[k]); const nd = n && n.node ? n.node : n; if (nd) nd.setActive(on); }
      this.offerCell.set({ reward: so, priceType: PriceType.Premium, price: meta.specialOfferPrice(so), claimed: false, title: d ? d.name : '' });
      if (this.offerSkin && this.offerSkin.skinId !== so.skinId) this.offerSkin.set(so.skinId, { forceColor: true });
      const blk = this.node(f.m_specialOffer);
      const nm = blk.findDeep('Name1'); if (nm && nm.get('Text')) nm.get('Text').setText(d ? d.name : '');
      // the clip's offer card has no discount badge (the skin price is not a discount)
      const dc = blk.findDeep('Discount'); if (dc) dc.setActive(false);
    }
    // league pack
    const lp = meta.activeLeaguePack(p, now);
    this.setActive(f.m_leaguePack, !!lp && !p.leaguePacksBought.includes(lp.pack.id));
    if (lp) {
      const pk = lp.pack;
      this.setImage(f.m_leaguePackItem1Image, rewardIcon(pk.reward1));
      this.setImage(f.m_leaguePackItem2Image, rewardIcon(pk.reward2));
      this.text(f.m_leaguePackItem1Name, pk.reward1.count > 0 ? String(pk.reward1.count) : '');
      this.text(f.m_leaguePackItem2Name, pk.reward2.count > 0 ? String(pk.reward2.count) : '');
      this.text(f.m_leaguePackDiscount, pk.discount || '');
    }
    // daily paid offer
    const po = meta.dailyPaidOffer(now);
    this.setActive(f.m_dailyPaidOffer, !!po && !meta.dailyPaidOfferBought(p, now));
    if (po) {
      const r = po.reward;
      let icon = rewardIcon(r);
      if (r.type === RewardType.Premium) icon = 'sprite:' + GEM_ICONS[Math.min(5, ['specialpack1', 'specialpack2', 'specialpack3', 'specialpack4', 'specialpack5', 'specialpack6'].indexOf(po.id)) | 0];
      this.setImage(f.m_dailyPaidOfferIcon, icon);
      this.text(f.m_dailyPaidOfferTitle, r.count > 0 ? 'x' + r.count : '');
      const pi = this.ref(f.m_dailyPaidOfferPriceIcon); if (pi) { pi.node.setActive(po.priceType !== PriceType.InApp); pi.setSprite(po.priceType === PriceType.Freemium ? 'sprite:icon_currency_freemium' : 'sprite:icon_currency_premium'); }
      const pr = this.ref(f.m_dailyPaidOfferPrice); if (pr) { if (!this.paidInAppText) this.paidInAppText = pr.text; pr.setText(po.priceType === PriceType.InApp ? this.paidInAppText : String(po.price)); }
    }
    // daily gifts
    const gifts = meta.dailyGifts(p, now);
    this.setActive(f.m_dailyGifts, gifts.length > 1);
    this.giftViews = gifts;
    this.gifts.forEach((c, i) => {
      const g = gifts[i]; c.node.setActive(!!g);
      if (!g) return;
      const r = g.reward;
      c.set({ reward: r, priceType: g.priceType, price: 0, claimed: g.claimed, adsNeeded: g.adsNeeded, adsWatched: g.adsWatched,
        icon: packRewardIcon(r), title: Reward.isBox(r) ? rewardName(app, r) : String(r.count), tint: this.rewardColor(r), bgSprite: this.rewardBackground(r) });
    });
    // fridges
    this.setActive(f.m_boxes, meta.boxAvailable(p));
    const boxes = meta.db.shopGroupItems(ShopGroup.Box);
    this.boxes.forEach((c, i) => { const it = boxes[i]; c.node.setActive(!!it); if (it) c.set({ reward: it.reward, priceType: it.priceType, price: meta.price(it, vip), claimed: false, id: it.id }); c.id = it && it.id; });
    const prem = meta.db.shopGroupItems(ShopGroup.Premium);
    this.premium.forEach((c, i) => { const it = prem[i]; c.node.setActive(!!it); if (it) c.set({ reward: it.reward, priceType: it.priceType, price: 0, icon: GEM_ICONS[i], claimed: false }); c.id = it && it.id; });
    const free = meta.db.shopGroupItems(ShopGroup.Freemium);
    this.freemium.forEach((c, i) => { const it = free[i]; c.node.setActive(!!it); if (it) c.set({ reward: it.reward, priceType: it.priceType, price: it.price, icon: COIN_ICONS[i], claimed: false }); c.id = it && it.id; });
    this.timers();
  }

  // ShopItemDisplay background colour per reward (GameData m_colorReward*: coins yellow, gems green, fridges/tokens blue)
  rewardBackground(r) {
    if (!r) return null;
    if (r.type === RewardType.Freemium) return 'sprite:bg_skin_4';
    if (r.type === RewardType.Premium) return 'sprite:bg_skin_3';
    if (r.type === RewardType.Box3) return 'sprite:bg_skin_5';
    return 'sprite:bg_skin_1';
  }

  rewardColor(r) {
    const g = this.app.gameData;
    if (!r) return null;
    if (r.type === RewardType.Freemium) return g.m_colorRewardFreemium;
    if (r.type === RewardType.Premium) return g.m_colorRewardPremium;
    if (r.type === RewardType.Box3) return g.m_colorRewardEpic;
    return g.m_colorRewardCommon;
  }

  timers() {
    if (this.closed) return;
    const { app } = this, p = app.profile, now = this.now(), meta = app.meta, f = this.sf;
    const day = fmtTime(meta.dailyResetIn(now));
    this.text(f.m_timerDailyOffers, day);
    this.text(f.m_timerSpecialOffer, day);
    this.text(f.m_timerDailyPaidOffer, day);
    const lp = meta.activeLeaguePack(p, now);
    if (lp) this.text(f.m_timerLeaguePack, fmtTime(lp.secondsLeft ?? meta.leaguePackTimeLeft(p, now)));
  }

  async grant(res) {
    const { app } = this;
    if (!res.ok) { app.toast(res.error); return; }
    app.save();
    if (res.rewards.length) await app.showRewards(res);
    this.refresh();
  }

  async buy(node) {
    const { app } = this, meta = app.meta, p = app.profile, now = this.now();
    if (this.buying) return;
    this.buying = true;
    try {
      const gi = this.gifts.findIndex((c) => c.node === node);
      if (gi >= 0) {
        const g = this.giftViews[gi];
        if (!g || g.claimed) return;
        const before = p.daily.claimed.length;
        const res = meta.claimDailyGift(p, gi, now, rng());
        if (res.ok && p.daily.claimed.length === before) { app.save(); app.toast(`${(gi === 2 ? p.daily.vip1Ads : p.daily.vip2Ads)}/${g.adsNeeded}`); this.refresh(); return; }
        await this.grant(res);
        return;
      }
      const bc = this.boxes.find((c) => c.node === node);
      if (bc) {
        const ok = await this.confirm(bc);
        if (ok) await this.grant(meta.buyShopItem(p, bc.id, now, rng()));
        return;
      }
      const pc = this.premium.find((c) => c.node === node);
      if (pc) { await this.grant(meta.claimIap(p, pc.id, now, rng())); return; }
      const fc = this.freemium.find((c) => c.node === node);
      if (fc) { await this.grant(meta.buyShopItem(p, fc.id, now, rng())); return; }
      if (node === this.offerCell.node) { await this.grant(meta.buySpecialOffer(p, now, rng())); return; }
    } finally { this.buying = false; }
  }

  async buyLeaguePack() {
    const { app } = this, lp = app.meta.activeLeaguePack(app.profile, this.now());
    if (!lp) return;
    await this.grant(app.meta.claimIap(app.profile, lp.pack.id, this.now(), rng()));
  }

  async buyPaidOffer() {
    const { app } = this, now = this.now(), po = app.meta.dailyPaidOffer(now);
    if (!po) return;
    await this.grant(po.priceType === PriceType.InApp ? app.meta.claimIap(app.profile, po.id, now, rng()) : app.meta.buyDailyPaidOffer(app.profile, now, rng()));
  }

  // SceneConfirmPurchaseSystem.OpenConfirm for the fridge cells (m_type == ConfirmPurchase)
  async confirm(cell) {
    if (!(cell.f.m_type === 1)) return true;
    const s = await this.app.popup(ConfirmPurchaseScreen, cell.item);
    return !!(await s.done());
  }

  debug() {
    const n = (c) => ({ pos: this.btnPos(c.node), id: c.id, claimed: c.item ? !!c.item.claimed : null, price: c.item ? c.item.price : null, type: c.item ? c.item.priceType : null });
    return { gifts: this.gifts.map(n), boxes: this.boxes.map(n), premium: this.premium.map(n), freemium: this.freemium.map(n),
      offer: this.offerCell.node.activeInHierarchy ? n(this.offerCell) : null,
      leaguePack: this.btnPos(this.node(this.sf.m_leaguePack)), paidOffer: this.btnPos(this.node(this.sf.m_dailyPaidOffer)), vip: this.btnPos(this.node(this.sf.m_vipPass)) };
  }
}

// SceneConfirmPurchase (ConfirmPurchaseController.SetData): icon, title, description, price; Activate = ExecuteBuy(true)
const BOX_TEXT = { [RewardType.Box1]: ['name.box1', 'description.box1'], [RewardType.Box2]: ['name.box2', 'description.box2'], [RewardType.Box3]: ['name.box3', 'description.box3'] };
export class ConfirmPurchaseScreen extends Screen {
  constructor(app, item) { super(app, 'SceneConfirmPurchase', 0); this.item = item; this.result = false; }
  async init() {
    const f = this.fields('ConfirmPurchaseController');
    bindCurrencies(this);
    const r = this.item.reward;
    this.setImage(f.m_icon, rewardIcon(r));
    const tk = BOX_TEXT[r.type];
    if (tk) { const t = T(tk[0]); if (t !== tk[0]) this.text(f.m_title, t); const d = T(tk[1]); if (d !== tk[1]) this.text(f.m_description, d); }
    this.text(f.m_price, String(this.item.price));
    this.setActive(f.m_discount, false);
    this.on('Close', () => this.close());
    this.onNode(this.node(f.m_confirmButton), () => { this.result = true; this.close(); });
  }
  debug() { return { confirm: this.btnPos(this.node(this.fields('ConfirmPurchaseController').m_confirmButton)) }; }
}
