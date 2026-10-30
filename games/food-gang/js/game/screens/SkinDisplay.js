// SkinSettingDisplay (menu cell, collection cell, stats page, buy/reward popups): name, rarity, level + token bar,
// NEW / VIP / unlock hint, the animated skin prefab under m_skinDisplayRoot, power cells (PowerDisplay).
// META §3: level coef 0.05*L+0.95, HP = round(HpBase*coef), ATTACK = GetDamage x GetBulletNumber.
import { Rarity, RewardType } from '../../meta/index.js';
import { T } from '../text.js';

const RARITY_KEY = ['rarity.common', 'rarity.rare', 'rarity.epic', 'unlock.vip'];
const pad2 = (n) => String(n).padStart(2, '0');
const roundHalfEven = (x) => { const r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 ? r - 1 : r; };

export const skinIcon = (id) => 'sprite:icon_skin_' + pad2(id);
export const powerIcon = (skinId, powerId) => 'sprite:icon_power_' + pad2(skinId) + '_' + powerId;

export class SkinInfo {
  constructor(app) { this.app = app; }

  def(id) { return this.app.meta.db.findSkin(id); }
  name(id) { const d = this.def(id); return d ? d.name : '?'; }
  rarityColor(r) { const g = this.app.gameData; return (r === Rarity.Rare ? g.m_colorRare : r === Rarity.Epic ? g.m_colorEpic : r === Rarity.Vip ? g.m_colorEpic : g.m_colorCommon).slice(); }
  background(r) { const g = this.app.gameData; return r === Rarity.Rare ? g.m_backgroundRare : r === Rarity.Epic || r === Rarity.Vip ? g.m_backgroundEpic : g.m_backgroundCommon; }
  simSkin(id) { return this.app.simDb.skins.find((s) => s.skinId === id) || null; }
  prefab(id) { const s = this.simSkin(id); const v = s && this.app.viewDb.skin(s.name); return v ? v.prefab : null; }

  coef(level) { return Math.fround(Math.fround(level * Math.fround(0.05)) + Math.fround(0.95)); }
  unlocked(level) { const u = []; for (let i = 0; i < 4; i++) if (level >= (i + 1) * 5) u.push(i + 1); return u; }
  powerValue(s, unlocked, type) {
    const pw = this.app.meta.db.powers.filter((p) => p.skinId === s.skinId);
    for (const p of pw) if (p.type === type) return unlocked.includes(p.slot + 1) ? p.value : 0;
    return 0;
  }
  hp(id, level) { const s = this.simSkin(id); return s ? roundHalfEven(Math.fround(s.hpBase * this.coef(level))) : 0; }
  attack(id, level) {
    const s = this.simSkin(id), db = this.app.simDb;
    if (!s) return 0;
    const metaSkin = { skinId: id };
    const un = this.unlocked(level);
    const act = db.actions[s.action];
    if (!act) return 0;
    const dmg = roundHalfEven(Math.fround((this.coef(level) + this.powerValue(metaSkin, un, 'DamageBoost')) * (act.damage || 0)));
    let n = 1;
    const b = act.bullet >= 0 ? db.bullets[act.bullet] : null;
    if (b) {
      const base = Math.max(1, b.number || 0);
      const boost = Math.trunc(this.powerValue(metaSkin, un, 'BulletNumberBoost'));
      const shots = boost > 0 && act.shootsBoosted && act.shootsBoosted.length ? act.shootsBoosted.length : (act.shoots && act.shoots.length) || 1;
      n = (boost + base) * shots;
    }
    return dmg * n;
  }

  // hint under a locked skin: trophy road skin, VIP pass skin, else fridges
  unlockText(id) {
    const d = this.def(id);
    if (d && d.rarity === Rarity.Vip) return T('unlock.vip');
    const road = this.app.meta.db.leagues.find((l) => l.reward && l.reward.type === RewardType.Skin && l.reward.skinId === id);
    return road ? T('unlock.trophy') : T('unlock.fridge');
  }
}

// one SkinSettingDisplay component of a screen (fields resolved through the instance it belongs to)
export class SkinCell {
  constructor(screen, comp, inst) {
    this.s = screen; this.app = screen.app; this.inst = inst || comp.node.scene;
    this.f = comp.fields; this.comp = comp;
    this.skinInst = null; this.skinId = 0;
  }

  r(k) { return this.f[k] ? this.inst.ref(this.f[k]) : null; }
  n(k) { const x = this.r(k); return x && x.node ? x.node : x; }
  txt(k, s) { const t = this.r(k); if (t && t.setText) t.setText(s); return t; }

  async set(id, opts = {}) {
    const { app } = this;
    const p = app.profile, info = app.skins, d = info.def(id);
    this.skinId = id;
    const prog = p.skins.find((s) => s.id === id) || null;
    const owned = !!prog && !opts.unknown;
    const level = prog ? prog.level : 1;
    this.txt('m_name', info.name(id));
    const rar = this.txt('m_rarity', d ? T(RARITY_KEY[d.rarity]) : '');
    if (rar && d) rar.color = info.rarityColor(d.rarity);
    const cost = app.meta.db.levelCost(level);
    const maxed = !cost;
    const canUp = owned && !maxed && prog.tokens >= cost.token;
    const lr = this.n('m_levelRoot'); if (lr) lr.setActive(owned);
    this.txt('m_level', String(level));
    this.txt('m_levelProgression', maxed ? T('info.levelmax') : `${prog ? prog.tokens : 0}/${cost.token}`);
    const sl = this.r('m_levelProgressionSlider');
    if (sl) { sl.min = 0; sl.max = 1; sl.value = maxed ? 1 : Math.min(1, (prog ? prog.tokens : 0) / cost.token); }
    const bar = this.r('m_levelProgressionBar'); if (bar) bar.setSprite(canUp || maxed ? app.gameData.m_barUpgrade : app.gameData.m_barNormal);
    const lb = this.r('m_levelBackground'); if (lb) lb.setSprite(canUp ? app.gameData.m_levelUpgrade : app.gameData.m_levelNormal);
    const tb = this.r('m_thumbnailBackground'); if (tb && d) tb.setSprite(info.background(d.rarity));
    const ti = this.r('m_thumbnailIcon'); if (ti) ti.setSprite(skinIcon(id));
    const nw = this.n('m_new'); if (nw) nw.setActive(owned && p.newSkins.includes(id));
    const vip = this.n('m_vip'); if (vip) vip.setActive(!owned && d && d.rarity === Rarity.Vip);
    const ut = this.r('m_unlockText');
    if (ut) { ut.node.setActive(!owned && !(d && d.rarity === Rarity.Vip)); ut.setText(info.unlockText(id)); }
    const ui = this.n('m_unlockIcon'); if (ui) ui.setActive(!owned);
    for (const r of this.f.m_upgradeAvailable || []) { const x = this.inst.ref(r); const nd = x && x.node ? x.node : x; if (nd) nd.setActive(canUp); }
    if (this.f.m_skinDisplayRoot && opts.model !== false) await this.spawnModel(id, !!(owned || opts.forceColor));
    return { owned, level, canUp, maxed, prog };
  }

  async spawnModel(id, colored = true) {
    const { app } = this;
    const root = this.n('m_skinDisplayRoot');
    if (!root) return;
    if (this.skinInst) { this.skinInst.root.destroy(); this.skinInst = null; }
    const pf = app.skins.prefab(id);
    if (!pf) return;
    await app.prefabs.preload([pf]);
    if (this.s.closed || this.skinId !== id) return;
    const sk = app.prefabs.spawn(pf, root);
    if (!sk) return;
    this.skinInst = this.s.adopt(sk);
    const shadow = sk.root.findDeep('skin_shadow'); if (shadow) shadow.setActive(false);
    const an = sk.root.inChildren('Animator')[0];
    if (an && an.runtime) { an.runtime.setBool('IsGrounded', true); an.unscaled = true; }
    // locked fighters show greyed out (clip frame of the collection: grey body, dark outlines kept)
    if (!colored) for (const sr of sk.root.inChildren('SpriteRenderer')) { sr.grey = 1; sr.tint = [0.85, 0.85, 0.85]; }
  }

  trigger(name) {
    const an = this.skinInst && this.skinInst.root.inChildren('Animator')[0];
    if (an && an.runtime) an.runtime.setTrigger(name);
  }
}
