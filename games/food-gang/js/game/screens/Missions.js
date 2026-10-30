// SceneMissions (MissionController + 7 MissionDisplay, META §7): the weekly skin on top, done/7 bar, "Ends in" timer,
// one cell per day: locked until its weekday ("Available in"), PLAY starts the mission match (its mode, bots per
// skin mode), a won mission shows its reward to COLLECT!, then COMPLETED.
import { Screen, fmtTime } from './base.js';
import { T } from '../text.js';
import { MetaRng } from '../../meta/index.js';
import { bindCurrencies, RewardBox } from './common.js';
import { SkinCell } from './SkinDisplay.js';

export class MissionsScreen extends Screen {
  constructor(app) { super(app, 'SceneMissions', 0); }

  async init() {
    const { app } = this;
    const f = this.mf = this.fields('MissionController');
    bindCurrencies(this);
    await app.ensureSprites(['icon_reward_01', 'icon_reward_02', 'icon_reward_03', 'icon_currency_freemium', 'icon_token_generic']);
    this.cells = (f.m_missions || []).map((r, i) => {
      const comp = this.ref(r);
      const rbComp = comp.fields.m_reward ? this.ref(comp.fields.m_reward) : null;
      return { i, comp, node: comp.node, f: comp.fields, box: rbComp ? new RewardBox(this, rbComp, this.inst) : null };
    });
    const sk = this.ref(f.m_skinSettingDisplay);
    this.skin = sk ? new SkinCell(this, sk) : null;
    this.on('Close', () => this.close());
    this.on('OnClickMission', (o, b) => { const c = this.cells.find((x) => x.node === b.node); if (c) this.clickMission(c); });
    this.refresh();
    this.offTick = app.on((k) => { if (k === 'tick') this.timers(); });
    const prev = this.onClose; this.onClose = () => { this.offTick(); if (prev) prev(); };
  }

  refresh() {
    if (this.closed) return;
    const { app } = this, p = app.profile, now = new Date(), meta = app.meta, f = this.mf;
    const slots = p.missions.slots;
    if (this.skin && p.missions.missionSkin && this.skin.skinId !== p.missions.missionSkin) this.skin.set(p.missions.missionSkin, { forceColor: true });
    const done = slots.filter((s) => s.completed).length;
    this.text(f.m_missionProgress, `${done}/${slots.length || 7}`);
    const sl = this.ref(f.m_missionProgressSlider); if (sl) { sl.min = 0; sl.max = 1; sl.value = slots.length ? done / slots.length : 0; }
    this.cells.forEach((c) => {
      const s = slots[c.i];
      c.node.setActive(!!s);
      if (!s) return;
      const R = (k) => (c.f[k] ? this.inst.ref(c.f[k]) : null);
      const N = (k) => { const x = R(k); return x && x.node ? x.node : x; };
      const def = meta.db.findMission(s.missionId);
      const unlocked = meta.isMissionUnlocked(s, now);
      const avail = s.completed && !s.rewardClaimed;
      c.state = !unlocked ? 'locked' : avail ? 'reward' : s.completed ? 'done' : 'play';
      const t = R('m_title'); if (t) t.setText(T('header.mission').replace('[X]', String(c.i + 1)));
      const skinName = app.skins.name(s.forcedSkins && s.forcedSkins.length ? s.forcedSkins[0] : p.missions.missionSkin);
      const d = R('m_description'); if (d && def) d.setText(T(def.text).replace('[X]', skinName));
      for (const [k, on] of [['m_backgroundLocked', c.state === 'locked'], ['m_backgroundOff', c.state === 'done'], ['m_backgroundOn', c.state === 'play' || c.state === 'reward']]) { const n = N(k); if (n) n.setActive(on); }
      const pl = N('m_play'); if (pl) pl.setActive(c.state === 'play');
      const cp = N('m_completed'); if (cp) cp.setActive(c.state === 'done');
      const lk = R('m_locked'); if (lk) lk.node.setActive(c.state === 'locked');
      if (c.box && s.reward) c.box.set(s.reward, { on: c.state === 'reward', claimed: s.rewardClaimed, variant: 'normal', alert: c.state === 'reward' });
      if (c.box) { const cu = c.box.node.find('CollectUp'); if (cu) cu.setActive(c.state === 'reward'); }
    });
    this.timers();
  }

  timers() {
    if (this.closed) return;
    const { app } = this, p = app.profile, now = new Date(), meta = app.meta;
    this.text(this.mf.m_missionTimer, T('mission.timeleft').replace('[X]', fmtTime(meta.missionWeekEndsIn(now))));
    this.cells.forEach((c) => {
      const s = p.missions.slots[c.i];
      if (!s || c.state !== 'locked') return;
      const lk = c.f.m_locked && this.inst.ref(c.f.m_locked);
      if (lk) lk.setText(T('mission.timer').replace('[X]', fmtTime(meta.missionUnlocksIn(s, now))));
    });
  }

  async clickMission(c) {
    const { app } = this;
    if (c.state === 'reward') {
      const res = app.meta.claimMission(app.profile, c.i, new Date(), new MetaRng(Date.now() & 0x7fffffff));
      if (!res.ok) { app.toast(res.error); return; }
      app.save();
      await app.showRewards(res);
      this.refresh();
    } else if (c.state === 'play') {
      this.result = { type: 'play', mission: c.i };
      this.close();
    } else if (c.state === 'locked') app.toast(T('mission.locked'));
  }

  debug() { return { cells: this.cells.map((c) => ({ i: c.i, state: c.state, pos: this.btnPos(c.node) })) }; }
}
