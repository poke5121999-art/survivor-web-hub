// SceneSkinCollection (Collection): one SkinCollectionCell per fighter (owned first), owned/total counter; a cell
// opens SceneSkinStat (SkinController / SkinStatManager / PowerDisplay, META §3.3-3.4): name, rarity, 4 power badges
// (ScenePowerInfo), HEALTH / ATTACK with the next level's gain, token bar, "Upgrade to level X" (tokens + coins),
// SELECT. The weekly mission fighter opens SceneBuySkin (PromoteSkin) when not owned.
import { Screen, wait } from './base.js';
import { T } from '../text.js';
import { MetaRng, Profile, Rarity } from '../../meta/index.js';
import { bindCurrencies } from './common.js';
import { SkinCell, powerIcon } from './SkinDisplay.js';

const rng = () => new MetaRng(Date.now() & 0x7fffffff);

export class CollectionScreen extends Screen {
  constructor(app) { super(app, 'SceneSkinCollection', 0); }

  async init() {
    const { app } = this;
    const f = this.cf = this.fields('Collection');
    await app.prefabs.preload([f.m_prefabCell, ...app.meta.db.skins.map((s) => app.skins.prefab(s.id))]);
    this.root8 = this.node(f.m_root);
    this.cells = [];
    for (const d of app.meta.collectionOrder(app.profile)) {
      const inst = this.adopt(app.prefabs.spawn(f.m_prefabCell, this.root8));
      const cell = new SkinCell(this, inst.root.script('SkinSettingDisplay'), inst);
      cell.id = d.id;
      this.onNode(inst.root, () => this.openSkin(d.id));
      this.cells.push(cell);
    }
    await Promise.all(this.cells.map((c) => c.set(c.id)));
    this.on('Close', () => this.close());
    this.count();
  }

  count() {
    const p = this.app.profile;
    this.text(this.cf.m_count, `${p.skins.length}/${this.app.meta.db.skins.length}`);
  }

  async openSkin(id) {
    const { app } = this;
    if (this.opening) return;
    this.opening = true;
    try {
      const p = app.profile;
      const promo = !Profile.hasSkin(p, id) && id === p.missions.missionSkin && app.meta.promoSkinPrice(id) > 0;
      const s = await app.popup(promo ? BuySkinScreen : SkinStatScreen, id);
      await s.done();
      for (const c of this.cells) await c.set(c.id, { model: false });
      this.count();
    } finally { this.opening = false; }
  }

  debug() { return { cells: this.cells.map((c) => ({ id: c.id, pos: this.btnPos(c.comp.node), owned: Profile.hasSkin(this.app.profile, c.id) })) }; }
}

export class SkinStatScreen extends Screen {
  constructor(app, skinId) { super(app, 'SceneSkinStat', 0); this.skinId = skinId; }

  async init() {
    const { app } = this;
    this.sc = this.fields('SkinController');
    this.cell = new SkinCell(this, this.script('SkinSettingDisplay'));
    this.anim = this.ref(this.sc.m_animator);
    bindCurrencies(this);
    this.powers = [];
    for (const n of this.inst.nodes) { const pd = n.script('PowerDisplay'); if (pd) this.powers.push({ n, f: pd.fields }); }
    this.powers.forEach((pw, i) => this.onNode(pw.n, () => this.powerInfo(i + 1)));
    await app.ensureSprites([powerIcon(this.skinId, 1), 'icon_skin_locked']);
    this.on('Close', () => this.close());
    this.on('Upgrade', () => this.upgrade());
    this.on('Select', () => this.select());
    if (app.profile.newSkins.includes(this.skinId)) { app.meta.markSkinSeen(app.profile, this.skinId); app.save(); }
    await this.update(true);
  }

  async update(model = false) {
    const { app } = this, sc = this.sc, id = this.skinId;
    const st = await this.cell.set(id, { model, forceColor: false });
    const sub = this.find('Canvas_UI/Panel/Subtitle');
    if (sub) { const t = sub.get('Text'); if (t) t.setText(st.owned ? (app.skins.def(id).rarity === Rarity.Common ? T('rarity.common') : T(['rarity.common', 'rarity.rare', 'rarity.epic', 'unlock.vip'][app.skins.def(id).rarity])) : app.skins.unlockText(id)); }
    const lv = st.level;
    this.text(sc.m_health, String(app.skins.hp(id, lv)));
    this.text(sc.m_attack, String(app.skins.attack(id, lv)));
    const next = Math.min(20, lv + 1);
    this.text(sc.m_healthUpgrade, st.maxed ? '' : '+' + (app.skins.hp(id, next) - app.skins.hp(id, lv)));
    this.text(sc.m_attackUpgrade, st.maxed ? '' : '+' + (app.skins.attack(id, next) - app.skins.attack(id, lv)));
    const cost = app.meta.db.levelCost(lv);
    const up = this.node(sc.m_upgrade), sel = this.node(sc.m_select);
    if (up) up.setActive(st.owned && !st.maxed);
    if (sel) sel.setActive(st.owned);
    if (cost) {
      this.text(sc.m_upgradeLabel, T('button.upgrade.level').replace('[X]', String(lv + 1)));
      this.text(sc.m_upgradePrice, String(cost.coins));
      this.text(sc.m_upgradePriceToken, String(cost.token));
      const pc = this.ref(sc.m_upgradePrice); if (pc) pc.color = (app.profile.coins < cost.coins ? app.gameData.m_colorNotEnough : [1, 1, 1, 1]).slice();
    }
    this.setActive(sc.m_buttonUpgradeOnGO, st.canUp);
    this.setActive(sc.m_buttonUpgradeOffGO, !st.canUp);
    const selected = app.profile.skinSelected === id;
    const sb = sel && sel.get('Button'); if (sb) sb.interactable = !selected;
    // PowerDisplay: icon, lock below its level, "Level 5/10/15/20"
    const un = app.meta.powersUnlocked(lv);
    this.powers.forEach((pw, i) => {
      const f = pw.f, inst = this.inst;
      const R = (k) => (f[k] ? inst.ref(f[k]) : null);
      const N = (k) => { const x = R(k); return x && x.node ? x.node : x; };
      const open = st.owned && un.includes(i + 1);
      const img = R('m_image'); if (img) { img.setSprite(powerIcon(id, i + 1)); img.color = open ? [1, 1, 1, 1] : [0.35, 0.35, 0.35, 1]; }
      const lk = N('m_lock'); if (lk) lk.setActive(!open);
      const on = N('m_backgroundOn'), off = N('m_backgroundOff'); if (on) on.setActive(open); if (off) off.setActive(!open);
      const t = R('m_level'); if (t) { t.node.setActive(!open); t.setText(T('info.level').replace('[X]', String((i + 1) * 5))); }
    });
    this.state = st;
  }

  async upgrade() {
    const { app } = this;
    if (this.upgrading) return;
    const res = app.meta.upgradeSkin(app.profile, this.skinId, new Date(), rng());
    if (!res.ok) { app.toast(res.error); return; }
    this.upgrading = true;
    app.audio.sfx('Upgrade');
    app.settings.vibrate(40);
    app.save();
    if (this.anim && this.anim.runtime) this.anim.runtime.setTrigger('LevelUp');
    this.cell.trigger('LevelUp');
    await this.update();
    if (res.rewards.length) { await wait(this.engine, 0.6); await app.showRewards(res); }
    this.upgrading = false;
  }

  select() {
    const { app } = this;
    const res = app.meta.selectSkin(app.profile, this.skinId);
    if (!res.ok) { app.toast(res.error); return; }
    app.save();
    this.close();
  }

  async powerInfo(powerId) {
    const s = await this.app.popup(PowerInfoScreen, this.skinId, powerId);
    await s.done();
  }

  debug() {
    const sc = this.sc;
    const t = (r) => { const x = this.ref(r); return x ? x.text : ''; };
    return { skin: this.skinId, level: this.state && this.state.level, health: t(sc.m_health), attack: t(sc.m_attack), upgrade: this.btnPos(this.node(sc.m_upgrade)),
      select: this.btnPos(this.node(sc.m_select)), powers: this.powers.map((p) => this.btnPos(p.n)) };
  }
}

// ScenePowerInfo (PowerInfoScene.UpdatePowerDisplay): icon, name, Special / Passive Power, description
export class PowerInfoScreen extends Screen {
  constructor(app, skinId, powerId) { super(app, 'ScenePowerInfo', 0); this.skinId = skinId; this.powerId = powerId; }
  async init() {
    const f = this.fields('PowerInfoScene');
    const { skinId: s, powerId: p } = this;
    this.setImage(f.m_icon, powerIcon(s, p));
    this.text(f.m_name, T(`power.name.${s}.${p}`));
    this.text(f.m_description, T(`power.description.${s}.${p}`));
    this.text(f.m_powerTypeLabel, T(p === 1 ? 'info.specialpower' : 'info.passivepower'));
    this.on('Close', () => this.close());
  }
  debug() { return { name: T(`power.name.${this.skinId}.${this.powerId}`) }; }
}

// SceneBuySkin (PromoteSkin): the weekly mission fighter for gems (Rare/VIP 300, Epic 600), VIP skins through the pass,
// trophy road fighters "EARN MORE TROPHIES"
export class BuySkinScreen extends Screen {
  constructor(app, skinId) { super(app, 'SceneBuySkin', 0); this.skinId = skinId; }
  async init() {
    const { app } = this;
    const f = this.pf = this.fields('PromoteSkin');
    bindCurrencies(this);
    this.cell = new SkinCell(this, this.ref(f.m_skinSettingDisplay));
    await this.cell.set(this.skinId, { forceColor: true });
    const d = app.skins.def(this.skinId);
    const price = app.meta.promoSkinPrice(this.skinId);
    const vip = d && d.rarity === Rarity.Vip;
    this.setActive(f.m_buttonBuy, price > 0 && !vip);
    this.setActive(f.m_buttonVIP, vip);
    this.setActive(f.m_textTrophy, price <= 0 && !vip);
    this.text(f.m_price, String(price));
    this.text(f.m_description, app.skins.name(this.skinId));
    this.on('Close', () => this.close());
    this.on('BuySkin', () => this.buy());
    this.onNode(this.node(f.m_buttonVIP), async () => { const { VipScreen } = await import('./Vip.js'); const s = await app.popup(VipScreen); await s.done(); this.close(); });
  }
  async buy() {
    const { app } = this;
    const res = app.meta.buyPromoSkin(app.profile, new Date(), rng());
    if (!res.ok) { app.toast(res.error); return; }
    app.save();
    this.close();
    await app.showRewards(res);
  }
  debug() { return { buy: this.btnPos(this.node(this.pf.m_buttonBuy)), skin: this.skinId }; }
}
