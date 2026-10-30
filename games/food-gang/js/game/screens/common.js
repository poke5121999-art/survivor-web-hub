// Pieces shared by several scenes: CurrencyDisplay bars, RewardData icons (RewardData.Sprite), RewardBoxDisplay cells
// (trophy road, missions), LeagueDisplay (menu button + trophy road header).
import { RewardType, Reward, Rarity } from '../../meta/index.js';
import { T } from '../text.js';
import { skinIcon, powerIcon, SkinCell } from './SkinDisplay.js';

const pad2 = (n) => String(n).padStart(2, '0');

export function rewardIcon(r) {
  if (!r) return null;
  switch (r.type) {
    case RewardType.Skin: return skinIcon(r.skinId);
    case RewardType.Token: return r.skinId > 0 ? skinIcon(r.skinId) : 'sprite:icon_token_generic';
    case RewardType.Freemium: return 'sprite:icon_currency_freemium';
    case RewardType.Premium: return 'sprite:icon_currency_premium';
    case RewardType.Power: return powerIcon(r.skinId, r.powerId);
    case RewardType.Mode: return 'sprite:icon_menu_missions';
    case RewardType.Box1: return 'sprite:icon_reward_01';
    case RewardType.Box2: return 'sprite:icon_reward_02';
    case RewardType.Box3: return 'sprite:icon_reward_03';
    case RewardType.Stage: return 'sprite:icon_stage_' + r.id;
    default: return null;
  }
}

// coin / gem rewards drawn as the pile of the shop packs (trophy road and gift cells of the clip)
export function packRewardIcon(r) {
  if (r && r.type === RewardType.Freemium) return 'sprite:pack_currency_freemium_0' + (r.count >= 3000 ? 4 : r.count >= 1000 ? 3 : r.count >= 300 ? 2 : 1);
  if (r && r.type === RewardType.Premium) return 'sprite:pack_currency_premium_0' + (r.count >= 2000 ? 5 : r.count >= 800 ? 4 : r.count >= 300 ? 3 : r.count >= 100 ? 2 : 1);
  return rewardIcon(r);
}

export function rewardName(app, r) {
  if (!r) return '';
  switch (r.type) {
    case RewardType.Skin: return app.skins.name(r.skinId);
    case RewardType.Token: return r.skinId > 0 ? app.skins.name(r.skinId) : '';
    case RewardType.Mode: return T('mode.' + r.id);
    case RewardType.Stage: return T('stage.' + r.id);
    case RewardType.Power: return T(`power.name.${r.skinId}.${r.powerId}`);
    case RewardType.Box1: case RewardType.Box2: case RewardType.Box3: return T('name.box' + (r.type - RewardType.Box1 + 1));
    default: return '';
  }
}

export function rewardCount(r) {
  if (!r) return '';
  if (r.type === RewardType.Freemium || r.type === RewardType.Premium || r.type === RewardType.Token) return String(r.count);
  if (Reward.isBox(r) && r.count > 1) return 'x' + r.count;
  return '';
}

// every CurrencyDisplay of a screen shows the profile's coins (type 0) / gems (type 1), refreshed on change
export function bindCurrencies(screen) {
  const comps = [];
  for (const inst of screen.insts) for (const n of inst.nodes) { const c = n.script('CurrencyDisplay'); if (c) comps.push([c, inst]); }
  const upd = () => {
    const p = screen.app.profile;
    for (const [c, inst] of comps) { const t = inst.ref(c.fields.m_text); if (t && t.setText) t.setText(String(c.fields.m_currencyType ? p.gems : p.coins)); }
  };
  upd();
  const off = screen.app.on((k) => { if (k === 'profile') upd(); });
  const prev = screen.onClose;
  screen.onClose = () => { off(); if (prev) prev(); };
  return upd;
}

// RewardBoxDisplay: background variant (normal/big/up/down/pass) on/off, icon or skin model, count, name, check/lock
export class RewardBox {
  constructor(screen, comp, inst) { this.s = screen; this.f = comp.fields; this.inst = inst || comp.node.scene; this.node = comp.node; this.skin = null; }
  r(k) { return this.f[k] ? this.inst.ref(this.f[k]) : null; }
  n(k) { const x = this.r(k); return x && x.node ? x.node : x; }
  state(st, on) { if (!st) return; const a = st.on && this.inst.ref(st.on), b = st.off && this.inst.ref(st.off); const A = a && a.node ? a.node : a, B = b && b.node ? b.node : b; if (A) A.setActive(!!on); if (B) B.setActive(!on); }

  set(rew, { on = false, claimed = false, locked = false, variant = 'normal', alert = false, packIcon = false } = {}) {
    const { app } = this.s;
    for (const v of ['Normal', 'Big', 'Up', 'Down', 'Pass']) {
      const st = this.f['m_background' + v];
      const show = v.toLowerCase() === variant;
      for (const k of ['on', 'off']) { const x = st && st[k] && this.inst.ref(st[k]); const nd = x && x.node ? x.node : x; if (nd) nd.setActive(false); }
      if (show) this.state(st, on);
    }
    const big = variant === 'big';
    const isSkin = rew && rew.type === RewardType.Skin;
    const img = this.r(big ? 'm_imageBig' : 'm_image'), other = this.r(big ? 'm_image' : 'm_imageBig');
    if (other && other.node) other.node.setActive(false);
    // RewardBoxDisplay enables its graphics in code; the prefab ships them disabled
    if (img) { img.enabled = true; img.node.setActive(!!rew && !isSkin); const ic = packIcon ? packRewardIcon(rew) : rewardIcon(rew); if (ic) img.setSprite(ic); }
    const num = this.r('m_number'); if (num) { num.enabled = true; num.node.setActive(!!rew && !isSkin); num.setText(rewardCount(rew)); }
    const nm = this.r('m_name'); if (nm) nm.setText(rewardName(app, rew));
    const ck = this.n('m_check'); if (ck) ck.setActive(claimed);
    const lk = this.n('m_lock'); if (lk) lk.setActive(locked);
    for (const k of ['m_alertDotNormal', 'm_alertDotBig']) { const d = this.n(k); if (d) d.setActive(alert && (k === 'm_alertDotBig') === big); }
    const sd = this.r('m_skinDisplay');
    if (sd) {
      sd.node.setActive(isSkin);
      if (isSkin) { if (!this.skin) this.skin = new SkinCell(this.s, sd, this.inst); if (this.skin.skinId !== rew.skinId) this.skin.set(rew.skinId, { forceColor: true }); }
    }
  }
}

// LeagueDisplay (§4.5): league icon / name, trophies, progress to the next row, next or collectable reward, red dot
export function updateLeagueDisplay(screen, comp, inst) {
  const { app } = screen;
  const f = comp.fields, p = app.profile, db = app.meta.db;
  const R = (k) => (f[k] ? inst.ref(f[k]) : null);
  const N = (k) => { const x = R(k); return x && x.node ? x.node : x; };
  const sub = db.subLeagueAt(p.trophies);
  const lg = app.gameData.m_leagues.find((l) => l.m_id === sub.id) || app.gameData.m_leagues[0];
  const img = R('m_image'); if (img && lg) img.setSprite(lg.m_icon);
  const nm = R('m_name'); if (nm) nm.setText(sub.name || '');
  const num = R('m_number'); if (num) num.setText(String(p.trophies));
  const pn = R('m_playerName'); if (pn) pn.setText(p.name);
  const collect = app.meta.roadRewardToCollect(p);
  const next = db.stepNext ? db.stepNext(p.trophies) : null;
  const row = collect || next;
  const sl = R('m_slider');
  if (sl) {
    const cur = db.leagueAt(p.trophies), nx = next;
    const max = nx ? nx.threshold : cur.threshold;
    sl.min = 0; sl.max = 1; sl.value = max > cur.threshold ? Math.max(0, Math.min(1, (p.trophies - cur.threshold) / (max - cur.threshold))) : 1;
  }
  const ri = R('m_rewardImage'); if (ri && row) { const ic = rewardIcon(row.reward); if (ic) ri.setSprite(ic); }
  const rr = N('m_rewardRoot'); if (rr) rr.setActive(!!(row && row.hasReward));
  const st = (s, on) => { if (!s) return; const a = s.on && inst.ref(s.on), b = s.off && inst.ref(s.off); const A = a && a.node ? a.node : a, B = b && b.node ? b.node : b; if (A) A.setActive(!!on); if (B) B.setActive(!on); };
  st(f.m_alert, !!collect);
  st(f.m_rewardBackgroundState, !!collect);
  const dot = N('m_alertDot'); if (dot) dot.setActive(!!collect);
  return { collect, next };
}

export const isVipSkin = (app, id) => { const d = app.meta.db.findSkin(id); return d && d.rarity === Rarity.Vip; };
export { pad2 };
