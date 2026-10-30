// SceneMenu (MenuController): selected fighter, league button (LeagueDisplay), weekly missions button, BATTLE! with
// the fridge stars / reward stock, left column FIGHTERS / PARTY / SHOP / VIP, settings and leaderboard, currency bar,
// alert dots (§17.3), trophies flying in after a match (AnimateLeaguePoint) and the league pack offer (§4.6).
import { Screen, wait, fmtTime } from './base.js';
import { T } from '../text.js';
import { SkinCell } from './SkinDisplay.js';
import { bindCurrencies, updateLeagueDisplay, rewardIcon } from './common.js';
import { Profile, PriceType } from '../../meta/index.js';
import { CollectionScreen } from './Collection.js';
import { ShopScreen } from './Shop.js';
import { VipScreen } from './Vip.js';
import { LeagueScreen, OfferLeagueScreen } from './League.js';
import { MissionsScreen } from './Missions.js';
import { SettingsScreen } from './Settings.js';
import { PrivateBattleScreen, PrivateLobbyScreen } from './Private.js';
import { CustomMatchOptions } from '../../meta/events.js';
import { LeaderboardScreen } from './Leaderboard.js';

export class MenuScreen extends Screen {
  constructor(app) { super(app, 'SceneMenu', 0); }

  async init() {
    const { app } = this;
    const f = this.mc = this.fields('MenuController');
    this.skinCell = new SkinCell(this, this.ref(f.m_skinSettingDisplay));
    this.league = this.script('LeagueDisplay');
    this.missionCtl = this.script('MissionController');
    this.missionSkin = new SkinCell(this, this.ref(this.missionCtl.fields.m_skinSettingDisplay));
    bindCurrencies(this);
    await app.ensureSprites(['icon_skin_01', 'icon_reward_01', 'icon_league_01', 'icon_currency_freemium', 'icon_token_generic']);
    await app.prefabs.preload(['Trophy']);
    // a popup may hand back an action for the menu (MissionDisplay PLAY -> the mission match)
    const open = (Cls, ...a) => async () => {
      if (this.busy) return;
      this.busy = true;
      let act = null;
      try { const s = await app.popup(Cls, ...a); act = await s.done(); } finally { this.busy = false; }
      if (act && act.type === 'play') this.play(act.mission);
      else if (!this.closed) this.refresh();
    };
    this.on('OpenSkinCollection', open(CollectionScreen));
    this.on('OpenShop', open(ShopScreen));
    this.on('OpenVIP', open(VipScreen));
    this.on('OpenLeague', open(LeagueScreen));
    this.on('OpenSettings', open(SettingsScreen));
    this.on('OpenLeaderboard', open(LeaderboardScreen));
    this.on('DisplayMission', () => {
      if (!app.profile.missions.unlocked) { app.toast(T('title.mission.lock').replace(/<[^>]+>/g, '')); return; }
      open(MissionsScreen)();
    });
    this.on('PrivateBattle', async () => {
      if (this.busy) return;
      this.busy = true;
      try {
        const s = await app.popup(PrivateBattleScreen);
        const act = await s.done();
        if (act && act.type === 'private') { this.result = act; this.close(); return; }
      } finally { this.busy = false; if (!this.closed) this.refresh(); }
    });
    this.on('Play', () => this.play());
    // GameOver.ContinueFriendRoom: a party match ends in the same room's lobby, over the menu
    if (app.resumeLobby) {
      const s = app.resumeLobby;
      app.resumeLobby = null;
      setTimeout(async () => {
        if (this.closed || this.busy) return;
        this.busy = true;
        try {
          const cfg = Object.assign(new CustomMatchOptions(), s.config || {});
          const l = await app.popup(PrivateLobbyScreen, s, cfg, s.isHost);
          const act = await l.done();
          if (act && act.type === 'private') { this.result = act; this.close(); return; }
        } finally { this.busy = false; if (!this.closed) this.refresh(); }
      }, 0);
    }
    // MissionsScreen "PLAY" on a mission returns the mission index through the menu
    app.audio.playMusic('MusicMenu', 0.5);
    await this.refresh();
    this.offTick = app.on((k) => { if (k === 'tick' || k === 'profile') this.refreshLight(); });
    const prev = this.onClose; this.onClose = () => { this.offTick(); if (prev) prev(); };
    this.animateTrophies();
  }

  play(missionIndex = -1) {
    if (this.closed) return;
    const { app } = this;
    app.audio.stopMusic();
    app.audio.sfx('Play');
    app.settings.vibrate(30);
    this.result = { type: 'play', mission: missionIndex };
    this.close();
  }

  async refresh() {
    const { app } = this;
    const p = app.profile;
    await this.skinCell.set(p.skinSelected);
    this.refreshLight();
  }

  // cheap part, every clock tick: alerts, timers, counters
  refreshLight() {
    if (this.closed) return;
    const { app } = this, f = this.mc, p = app.profile, now = new Date(), meta = app.meta;
    const vip = Profile.isVip(p, now);
    this.setActive(f.m_logo, !vip); this.setActive(f.m_logoVIP, vip); this.setActive(f.m_validateVIP, vip);
    // MenuController.UpdateAlert
    const up = meta.alertUpgrade(p), coll = meta.alertCollection(p);
    this.setActive(f.m_upgradeAlert, up);
    this.setActive(f.m_collectionAlert, !up && coll);
    const gifts = meta.dailyGifts(p, now);
    const freeGift = gifts.some((g) => !g.claimed);
    this.onState(f.m_freeReward, freeGift);
    this.setActive(f.m_freeRewardAlertDot, freeGift);
    // Play: reward stock counter, stars, next refill timer
    const stock = p.fridge.stock;
    this.onState(f.m_playRewardStock, stock > 0);
    this.text(f.m_playRewardStockCounter, String(stock));
    (f.m_stars || []).forEach((r, i) => { const img = this.ref(r); if (img) img.color = (i < p.fridge.stars ? [1, 1, 1, 1] : app.gameData.m_colorStarLocked).slice(); });
    // stock left: the stars toward the next fridge; none left: the fridge icon and the refill timer (clip frame)
    const starsNode = this.find('Canvas_UI/Panel/RootRight/Play/Stars'); if (starsNode) starsNode.setActive(stock > 0);
    const left = meta.fridgeRefillSecondsLeft(p, now);
    const nr = this.ref(f.m_nextReward);
    if (nr) { nr.node.setActive(stock <= 0); nr.setText(T('info.nextreward.timer').replace('[X]', fmtTime(left))); }
    const icon = this.find('Canvas_UI/Panel/RootRight/Play/IconFridge'); if (icon) icon.setActive(stock <= 0);
    const counter = this.ref(f.m_playRewardStockCounter); if (counter) counter.node.setActive(false);
    // weekly missions button (MissionController + SetMissionButtonState)
    const unlocked = p.missions.unlocked;
    this.setActive(f.m_missionUnlocked, unlocked);
    this.setActive(f.m_missionLocked, !unlocked);
    this.onState(f.m_missionReward, unlocked && meta.missionAlert(p));
    const mr = f.m_missionReward; if (mr && mr.locked) this.setActive(mr.locked, !unlocked);
    this.setActive(f.m_missionAlertDot, unlocked && meta.missionAlert(p));
    const mf = this.missionCtl.fields;
    if (unlocked) {
      const done = p.missions.slots.filter((s) => s.completed).length;
      this.text(mf.m_missionProgress, `${done}/${p.missions.slots.length}`);
      this.text(mf.m_missionTimer, T('mission.timeleft').replace('[X]', fmtTime(meta.missionWeekEndsIn(now))));
      if (p.missions.missionSkin && this.missionSkin.skinId !== p.missions.missionSkin) this.missionSkin.set(p.missions.missionSkin, { model: false });
    }
    // league button
    const lr = updateLeagueDisplay(this, this.league, this.inst);
    this.collectRow = lr.collect;
    // leaderboard button: shown (local board, see LeaderboardScreen)
    this.setActive(f.m_buttonLeaderboard, true);
  }

  // MenuController.AnimateLeaguePoint: one trophy per point flies from the Play button to the league button
  async animateTrophies() {
    const { app } = this, p = app.profile;
    const count = p.trophies - p.trophiesShown;
    if (count <= 0) { if (p.trophiesShown !== p.trophies) { p.trophiesShown = p.trophies; app.save(); } return; }
    const from = this.node(this.mc.m_rootTrophy), to = this.node(this.mc.m_destinationTrophy);
    const shown = p.trophies - count;
    const lt = this.league && this.ref(this.league.fields.m_number);
    if (lt) lt.setText(String(shown));
    await wait(this.engine, 0.6);
    const n = Math.min(count, 50), interval = Math.min(0.05, 1.5 / Math.max(1, count));
    for (let i = 0; i < n && !this.closed; i++) {
      this.flyTrophy(from, to, () => { if (lt) lt.setText(String(Math.min(p.trophies, shown + Math.round((i + 1) * count / n)))); });
      await wait(this.engine, interval);
    }
    await wait(this.engine, 1.0);
    if (this.closed) return;
    p.trophiesShown = p.trophies;
    app.save();
    this.refreshLight();
    const db = app.meta.db, before = db.subLeagueAt(shown), now = db.subLeagueAt(p.trophies);
    if (now !== before && now.threshold > before.threshold) await app.showRewards({ ok: true, rewards: [{ type: 'league', row: now, count: 1 }], events: [] });
    // §4.6: the league pack popup when this match crossed the threshold of a pack not bought yet
    const pack = app.meta.db.leaguePackAt(p.trophies);
    if (pack && !p.leaguePacksBought.includes(pack.id) && pack.threshold > shown && p.trophies >= pack.threshold && app.meta.leaguePackTimeLeft(p, new Date()) > 0) {
      const s = await app.popup(OfferLeagueScreen);
      await s.done();
      this.refreshLight();
    }
  }

  flyTrophy(from, to, done) {
    const { app } = this;
    if (!from || !to) { done(); return; }
    const inst = app.prefabs.spawn('Trophy', from.parent);
    if (!inst) { done(); return; }
    this.adopt(inst);
    const n = inst.root;
    const e = this.engine, t0 = e.realTime, dur = 0.55;
    const a = from.worldPos(), b = to.worldPos();
    const inv = (w) => { const pw = n.parent.world; return [(w[0] - pw[12]) / (pw[0] || 1), (w[1] - pw[13]) / (pw[5] || 1)]; };
    const A = inv(a), B = inv(b);
    const jitter = [(Math.random() - 0.5) * 120, (Math.random() - 0.5) * 80];
    if (n.rect) { n.rect.amin = [0.5, 0.5]; n.rect.amax = [0.5, 0.5]; }
    const step = () => {
      if (this.closed || n.destroyed) return;
      const k = Math.min(1, (e.realTime - t0) / dur), s = k * k * (3 - 2 * k);
      const mx = (A[0] + B[0]) / 2 + jitter[0], my = Math.max(A[1], B[1]) + 80 + jitter[1];
      const x = (1 - s) * (1 - s) * A[0] + 2 * (1 - s) * s * mx + s * s * B[0];
      const y = (1 - s) * (1 - s) * A[1] + 2 * (1 - s) * s * my + s * s * B[1];
      if (n.rect) n.rect.pos = [x, y]; else { n.lp[0] = x; n.lp[1] = y; }
      if (k >= 1) { n.destroy(); app.audio.sfx('Trophy'); done(); return; }
      requestAnimationFrame(step);
    };
    step();
  }

  debug() {
    const p = this.app.profile;
    const t = (r) => { const x = this.ref(r); return x && x.text !== undefined ? x.text : ''; };
    return { stock: p.fridge.stock, stars: p.fridge.stars, collectRow: this.collectRow ? this.collectRow.id : null,
      leagueTrophies: this.league ? t(this.league.fields.m_number) : '', missionsUnlocked: p.missions.unlocked };
  }
}
