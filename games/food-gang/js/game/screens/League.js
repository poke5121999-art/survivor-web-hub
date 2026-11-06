// SceneLeague (LeaguePanel + LeagueRewardDisplay + LeagueScrollAutoFocus, META §4.5): the trophy road scrolls
// sideways, one LeagueCell per League row at x = paddingLeft + 320 * index (virtualized like LeaguePanel.BindCell),
// league steps with their name, thresholds, progress bar, reward boxes to COLLECT! by hand, the trophy bubble on the
// road. SceneOfferLeague: the league pack popup (§4.7).
import { Screen, fmtTime } from './base.js';
import { T } from '../text.js';
import { RewardType, RoadStepState, MetaRng } from '../../meta/index.js';
import { bindCurrencies, RewardBox, rewardIcon, rewardCount, rewardName } from './common.js';

const rng = () => new MetaRng(Date.now() & 0x7fffffff);
const POOL = 9;

export class LeagueScreen extends Screen {
  constructor(app) { super(app, 'SceneLeague', 0); }

  async init() {
    const { app } = this;
    const f = this.lf = this.fields('LeaguePanel');
    this.rows = app.meta.db.leagues;
    this.content = this.node(f.m_root);
    this.cellW = f.m_cellWidth || 320;
    this.padL = f.m_paddingLeft || 256;
    this.padR = f.m_paddingRight || 128;
    this.content.rect.size = [this.padL + this.cellW * this.rows.length + this.padR, this.content.rect.size[1]];
    bindCurrencies(this);
    await app.prefabs.preload([f.m_prefabCell]);
    await app.ensureSprites(['icon_reward_01', 'icon_currency_freemium', 'icon_currency_premium', 'icon_token_generic', 'icon_menu_missions', 'icon_skin_14', 'icon_league_01', 'pack_currency_freemium_01', 'pack_currency_freemium_02', 'pack_currency_premium_01', 'pack_currency_premium_02']);
    this.cells = [];
    for (let i = 0; i < POOL; i++) {
      const inst = this.adopt(app.prefabs.spawn(f.m_prefabCell, this.content));
      const c = { inst, node: inst.root, rd: inst.root.script('LeagueRewardDisplay').fields, index: -1 };
      c.box = new RewardBox(this, inst.root.find('Content/Reward').script('RewardBoxDisplay'), inst);
      c.boxBig = new RewardBox(this, inst.root.find('Content/RewardBig').script('RewardBoxDisplay'), inst);
      this.onNode(inst.root, () => this.clickCell(c));
      this.cells.push(c);
    }
    this.progress = this.root.findDeep('LeagueProgress');
    this.on('Close', () => this.close());
    this.scroll = this.script('ScrollRect');
    if (this.scroll) this.scroll.onValueChanged = () => this.bindVisible();
    this.hook('late', () => this.bindVisible());
    this.refresh();
    this.focusCurrent();
  }

  // LeagueScrollAutoFocus: the player's trophies in the middle of the view
  focusCurrent() {
    const p = this.app.profile;
    const collect = this.app.meta.roadRewardToCollect(p);
    let i = 0;
    this.rows.forEach((r, k) => { if (r.threshold <= p.trophies) i = k; });
    if (collect) i = this.rows.indexOf(collect);
    const x = this.padL + this.cellW * i;
    const total = this.content.rect.size[0];
    const view = this.content.parent && this.content.parent.r ? this.content.parent.r.w : 1280;
    if (this.scroll) this.scroll.normalizedPosition = [Math.max(0, Math.min(1, (x - view / 2) / Math.max(1, total - view))), 0];
  }

  refresh() { for (const c of this.cells) c.index = -1; this.bindVisible(); this.placeProgress(); }

  // trophy bubble x: inside the cell of the current row, at its progress toward the next row
  placeProgress() {
    if (!this.progress) return;
    const p = this.app.profile, meta = this.app.meta;
    let i = 0;
    this.rows.forEach((r, k) => { if (r.threshold <= p.trophies) i = k; });
    const x = this.padL + this.cellW * (i + meta.roadProgress(p, this.rows[i]));
    if (this.progressY === undefined) this.progressY = this.progress.rect.pos[1] - 72;
    this.progress.rect.pos = [x, this.progressY];
    const t = this.progress.inChildren('Text')[0]; if (t) t.setText(String(p.trophies));
  }

  bindVisible() {
    if (this.closed || !this.content) return;
    const scrollX = -(this.content.rect.pos[0] || 0);
    const first = Math.max(0, Math.floor((scrollX - this.padL) / this.cellW) - 1);
    const want = new Set();
    for (let i = first; i < Math.min(this.rows.length, first + POOL); i++) want.add(i);
    const free = this.cells.filter((c) => !want.has(c.index));
    for (const i of want) {
      if (this.cells.some((c) => c.index === i)) continue;
      const c = free.pop();
      if (!c) break;
      this.bindCell(c, i);
    }
  }

  bindCell(c, i) {
    const { app } = this, p = app.profile, meta = app.meta, row = this.rows[i], inst = c.inst, rd = c.rd;
    const R = (k) => (rd[k] ? inst.ref(rd[k]) : null);
    const N = (k) => { const x = R(k); return x && x.node ? x.node : x; };
    c.index = i;
    c.row = row;
    c.node.rect.pos = [this.padL + this.cellW * i, c.node.rect.pos[1]];
    const named = row.isSubLeague;
    const lg = app.gameData.m_leagues.find((l) => l.m_id === row.id);
    const step = N('m_step'); if (step) step.setActive(named);
    // named rows carry the league badge (bronze I, II...) like the clip, not the season diamond
    const icon = R('m_icon'); if (icon && named && lg) { icon.setSprite(lg.m_icon); icon.enabled = true; }
    const nm = R('m_name'); if (nm) nm.setText(named ? row.name : '');
    const sp = N('m_space'); if (sp) sp.setActive(!named);
    const th = R('m_threshold'); if (th) th.setText(String(row.threshold));
    const ws = N('m_whiteStep'); if (ws) ws.setActive(!named);
    const sl = R('m_slider'); if (sl) { sl.min = 0; sl.max = 1; sl.value = meta.roadProgress(p, row); }
    const pr = N('m_progress'); if (pr) pr.setActive(i < this.rows.length - 2);
    const st = meta.roadStep(p, row);
    const show = row.hasReward && i > 0 && i < this.rows.length - 1;
    const big = row.reward && (row.reward.type === RewardType.Skin || row.reward.type === RewardType.Mode);
    // every box sits above the road with its tail down (clip frame of the trophy road)
    const up = true;
    c.box.node.setActive(show && !big);
    c.boxBig.node.setActive(show && big);
    const bx = big ? c.boxBig : c.box;
    if (show) bx.set(row.reward, { on: st === RoadStepState.Available, claimed: st === RoadStepState.Claimed, locked: false, variant: big ? 'big' : up ? 'up' : 'down', alert: false, packIcon: true });
    if (show && !big) { const nm2 = bx.r('m_name'); if (nm2) nm2.node.setActive(false); }
    for (const k of ['CollectUp', 'CollectDown']) { const n = bx.node.find(k); if (n) n.setActive(show && st === RoadStepState.Available && (k === 'CollectUp') === (up || big)); }
    c.state = st;
  }

  async clickCell(c) {
    const { app } = this;
    if (!c.row || c.index <= 0) return;
    if (c.state !== RoadStepState.Available) {
      if (c.row.hasReward && c.state === RoadStepState.Locked) app.toast(`${rewardName(app, c.row.reward) || rewardCount(c.row.reward)} - ${c.row.threshold}`);
      return;
    }
    const res = app.meta.claimRoadStep(app.profile, c.row.id, new Date(), rng());
    if (!res.ok) { app.toast(res.error); return; }
    app.save();
    await app.showRewards(res);
    this.refresh();
  }

  debug() {
    const avail = this.cells.filter((c) => c.state === RoadStepState.Available && c.node.activeInHierarchy).map((c) => ({ id: c.row.id, pos: this.btnPos(c.node) }));
    return { available: avail, visible: this.cells.filter((c) => c.index >= 0).map((c) => c.index).sort((a, b) => a - b), trophies: this.app.profile.trophies };
  }
}

export class OfferLeagueScreen extends Screen {
  constructor(app) { super(app, 'SceneOfferLeague', 0); }

  async init() {
    const { app } = this;
    const f = this.of = this.fields('SceneOfferLeague');
    const lp = this.lp = app.meta.activeLeaguePack(app.profile, new Date());
    if (lp) {
      const pk = lp.pack;
      await app.ensureSprites([rewardIcon(pk.reward1), rewardIcon(pk.reward2)]);
      this.setImage(f.m_reward1Image, rewardIcon(pk.reward1));
      this.setImage(f.m_reward2Image, rewardIcon(pk.reward2));
      this.text(f.m_reward1Text, rewardName(app, pk.reward1) || rewardCount(pk.reward1));
      this.text(f.m_reward2Text, rewardName(app, pk.reward2) || rewardCount(pk.reward2));
      this.text(f.m_leaguePackDiscount, pk.discount || '');
    }
    this.onNode(this.node(f.m_closeButton), () => this.close());
    this.onNode(this.node(f.m_buyButton), () => this.buy());
    this.hook('update', () => this.tick());
  }

  tick() {
    const lp = this.app.meta.activeLeaguePack(this.app.profile, new Date());
    this.text(this.of.m_timerText, lp ? fmtTime(lp.secondsLeft) : '');
  }

  async buy() {
    const { app } = this;
    if (!this.lp) { this.close(); return; }
    const res = app.meta.claimIap(app.profile, this.lp.pack.id, new Date(), rng());
    if (!res.ok) { app.toast(res.error); return; }
    app.save();
    this.close();
    await app.showRewards(res);
  }

  debug() { return { buy: this.btnPos(this.node(this.of.m_buyButton)), close: this.btnPos(this.node(this.of.m_closeButton)) }; }
}
