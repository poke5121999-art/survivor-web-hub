// SceneGameOver (GameOver + RankingResultDisplay): title VICTORY / DEFEAT / DRAW, trophies and stars won, the
// podium of the local team (FFA: every fighter by rank) in their victory / defeat poses, then the star bar and the
// fridge panel (GameOver animator: Appear -> PanelReward -> Reward | BottomBar), EXIT plays again.
import { TeamConfig } from '../sim/index.js';
import { Victory, FridgeOpenMethod, ProfileJson, MetaRng } from '../meta/index.js';
import { T, localize } from './text.js';
import { evalCurve } from '../engine/anim.js';

const wait = (engine, s) => new Promise((res) => { const end = engine.realTime + s; const f = () => { if (engine.realTime >= end) res(); else setTimeout(f, 16); }; f(); });

export class GameOverScreen {
  constructor(app) { this.app = app; this.engine = app.engine; this.phase = 'loading'; }

  // match: the finished MatchScene (state still readable), res: MetaService MatchResult
  async load(match, res) {
    const { engine, app } = this;
    this.res = res;
    const inst = this.inst = await engine.loadScene('SceneGameOver');
    engine.cine = null;
    const root = inst.root;
    const go = root.script('GameOver').fields;
    const ref = (r) => (r ? inst.ref(r) : null);
    const nodeOf = (r) => { const x = ref(r); return x && x.node ? x.node : x; };
    this.ref = ref; this.nodeOf = nodeOf;
    this.an = ref(go.m_animator).runtime;
    const gd = app.gameData;
    const title = ref(go.m_title);
    const v = res.victory;
    title.setText(v === Victory.Victory ? T('title.end.victory') : v === Victory.Defeat ? T('title.end.defeat') : T('title.end.draw'));
    title.color = (v === Victory.Victory ? gd.m_colorVictory : v === Victory.Defeat ? gd.m_colorDefeat : [1, 1, 1, 1]).slice();
    ref(go.m_trophy).setText((res.trophiesGained >= 0 ? '+' : '') + res.trophiesGained);
    ref(go.m_star).setText('+' + res.starsGained);
    this.an.setBool('Victory', v === Victory.Victory);
    // stars of the fridge bar: lit up to starStart, the ones won light up one by one
    this.stars = (go.m_stars || []).map(ref);
    this.starAnims = (go.m_starsAnimation || []).map(ref);
    this.stars.forEach((img, i) => { if (img) img.color = (i < res.starStart ? [1, 1, 1, 1] : gd.m_colorStarLocked).slice(); });
    // buttons: EXIT (PlayAgain) / CLAIM (OpenReward); ads, gems and the corner exit are not in this build
    this.btnPlay = nodeOf(go.m_buttonPlay); this.btnOpen = nodeOf(go.m_buttonOpen);
    for (const k of ['m_buttonWatchAd', 'm_buttonSpendPremium', 'm_spinnerContinue']) { const n = nodeOf(go[k]); if (n) n.setActive(false); }
    const corner = nodeOf(go.m_buttonExit); if (corner) corner.setActive(false);
    for (const n of ['Canvas_UI/Panel/Root/Lucky', 'Canvas_UI/Panel/Root/SuperLucky', 'Canvas_UI/Panel/Root/Alert', 'Canvas_UI/Panel/CurrencyBar']) { const x = root.find(n); if (x) x.setActive(false); }
    this.btnOpen.setActive(!!res.hasFridge);
    this.btnPlay.setActive(true);
    const fr = root.find('Canvas_3D/PanelReward/Fridge');
    if (fr) {
      const box = Math.max(1, Math.min(3, (res.fridgeBox || 1) - 6));
      for (let i = 1; i <= 3; i++) { const a = fr.find('Fridge0' + i), b = fr.find('Face0' + i); if (a) a.setActive(i === box); if (b) b.setActive(i === box); }
    }
    localize(root);
    this.buildPodium(match, res);
    this.bg = root.find('Canvas_3D/Background');
    engine.onClick((b) => this.onClick(b));
    this.upd = () => this.update();
    engine.hooks.late.push(this.upd);
    return this;
  }

  // RankingResultDisplay cells: the local team in team modes, every fighter by rank in FFA
  buildPodium(match, res) {
    const { app } = this;
    const s = match.runner.state, db = app.simDb, me = match.runner.localAgent;
    const rankRoot = this.inst.root.find('Canvas_3D/PanelRank/Ranking');
    let groups;
    if (s.teams === TeamConfig.FreeForAll) {
      const o = match.outcomeData;
      const order = s.agents.slice().sort((a, b) => (a === me ? o.rank - 0.5 : 0) - (b === me ? o.rank - 0.5 : 0)
        || (s.killSlot[b.slot] - s.killSlot[a.slot]) || (a.slot - b.slot));
      groups = order.map((a) => [a]);
      // the local fighter sits at its rank
      const mi = groups.findIndex((g) => g[0] === me);
      if (mi >= 0) { const [g] = groups.splice(mi, 1); groups.splice(Math.min(groups.length, o.rank - 1), 0, g); }
    } else {
      groups = [s.agents.filter((a) => me && a.team === me.team).sort((a, b) => (b === me) - (a === me) || a.slot - b.slot)];
    }
    const won = res.victory === Victory.Victory;
    this.cells = [];
    groups.forEach((g, gi) => {
      const prefab = 'GameOverCell' + Math.min(3, g.length);
      const inst = app.prefabs.spawn(prefab, rankRoot);
      if (!inst) return;
      const mounts = [];
      for (const st = [inst.root]; st.length;) { const n = st.pop(); if (n.name === 'Skin' && Math.abs(n.ls[0]) > 50) mounts.push(n); for (const c of n.children) st.push(c); }
      mounts.sort((a, b) => a.uid - b.uid);
      const rd = inst.root.script('RankingResultDisplay').fields;
      const names = (rd.m_name || []).map((r) => inst.ref(r));
      g.forEach((a, i) => {
        const vs = app.viewDb.skin(db.skins[a.skin].name);
        const mount = mounts[i];
        if (mount && vs) {
          const sk = app.prefabs.spawn(vs.prefab, mount);
          const shadow = sk && sk.root.findDeep('skin_shadow'); if (shadow) shadow.setActive(false);
          const an = sk && sk.root.inChildren('Animator')[0];
          if (an && an.runtime) {
            const rt = an.runtime;
            rt.setBool('IsGrounded', true);
            const winner = s.teams === TeamConfig.FreeForAll ? gi === 0 && won : won;
            rt.setInteger('Victory', winner ? 1 + ((gi + i) % 3) : 0);
            rt.setBool('Defeat', !winner && res.victory === Victory.Defeat);
          }
        }
        const nm = names[i];
        if (nm) { nm.setText(match.names[a.slot] || db.skins[a.skin].name); nm.color = (app.gameData.m_colorsTeam[a.team - 1] || [1, 1, 1, 1]).slice(); }
      });
      const t = inst.root.find('Root/Title');
      if (t) { const tc = t.get('Text'); if (tc) tc.setText(s.teams === TeamConfig.FreeForAll ? T('title.rank.' + (gi + 1)) : ''); }
      this.cells.push(inst);
    });
  }

  async run() {
    const { engine } = this;
    this.phase = 'rank';
    await wait(engine, 3.2);
    this.displayPanelReward();
    await wait(engine, 0.9);
    await this.animateStars();
    // the idle states write defaults; in the game the panels stay where RewardPanelAppear left them
    for (const bd of this.an.bset.map.values()) bd.def = bd.get();
    if (this.res.hasFridge) { this.an.setTrigger('Reward'); this.slideBottomBar(); } else this.an.setTrigger('BottomBar');
    this.phase = 'reward';
    return new Promise((r) => { this.resolvePlay = r; });
  }

  // the fridge path never enters BottomBarAppear, yet EXIT / CLAIM come up with the glowing fridge (clip):
  // play that clip's bar curve on the binding the idle states keep writing back
  slideBottomBar() {
    const key = 'Canvas_UI/Panel/Root/BottomBar|RectTransform|m_AnchoredPosition.y';
    const bd = this.an.bset.map.get(key);
    const clip = this.engine.assets.clip('gameover_bottombar_appear');
    const cv = clip && clip.curves.find((c) => c.prop === 'm_AnchoredPosition.y');
    if (!bd || !cv) return;
    const t0 = this.engine.realTime;
    const step = () => {
      const t = Math.min(clip.len, this.engine.realTime - t0);
      bd.def = evalCurve(cv.keys, t);
      bd.set(bd.def);
      if (t < clip.len && this.inst.root.parent !== undefined) setTimeout(step, 16);
    };
    step();
  }

  displayPanelReward() {
    if (this.phase === 'panel' || this.phase === 'reward') return;
    this.phase = 'panel';
    this.an.setTrigger('PanelReward');
  }

  async animateStars() {
    const { res, engine } = this;
    for (let i = res.starStart; i < Math.min(res.starEnd, this.stars.length); i++) {
      const img = this.stars[i];
      if (img) img.color = [1, 1, 1, 1];
      const a = this.starAnims[i];
      if (a && a.runtime) a.runtime.play((a.clip || '').replace(/^clip:/, ''));
      this.app.audio.sfx('Star');
      await wait(engine, 0.35);
    }
  }

  onClick(b) {
    const m = b.onClickResolved && b.onClickResolved[0] ? b.onClickResolved[0].method : '';
    if (m === 'DisplayPanelReward') this.displayPanelReward();
    else if (m === 'PlayAgain' || m === 'ExitGame') { if (this.resolvePlay) { this.app.audio.sfx('UIOk'); this.resolvePlay('again'); } }
    else if (m === 'OpenReward') this.openReward();
  }

  openReward() {
    const { app } = this;
    const p = app.profile, now = new Date();
    const free = app.meta.canOpenFridgeFree(p, now);
    const r = app.meta.openFridge(p, free ? FridgeOpenMethod.Free : FridgeOpenMethod.Ad, now, new MetaRng(Date.now() & 0x7fffffff));
    ProfileJson.save(app.store, p);
    this.opened = r;
    this.btnOpen.setActive(false);
    app.audio.sfx('BoxPop');
    this.an.setTrigger('BottomBar');
  }

  // AspectRatioFitter EnvelopeParent (ratio 1) on the blurred background
  update() {
    // WD-off states keep their pose; the idle states after them write "defaults", which in the game are that pose
    const st = this.an && this.an.layers[0] && this.an.layers[0].cur;
    if (st && !st.s.wd && !this.an.layers[0].next) for (const bd of this.an.bset.map.values()) bd.def = bd.get();
    if (!this.bg || !this.bg.parent || !this.bg.parent.r) return;
    const pr = this.bg.parent.r, side = Math.max(pr.w, pr.h);
    this.bg.rect.amin = [0.5, 0.5]; this.bg.rect.amax = [0.5, 0.5]; this.bg.rect.size = [side, side]; this.bg.rect.pos = [0, 0];
  }

  debug() {
    const r = this.res;
    const txt = (p) => { const n = this.inst && this.inst.root.find(p); const c = n && n.get('Text'); return c ? c.text : ''; };
    const btn = (n) => { if (!n || !n.activeInHierarchy || !n.r) return null; const e = this.engine, k = e.canvas.getBoundingClientRect(), q = e.ui.screenRect(n);
      return [Math.round(k.left + (q[0] + q[2] / 2) * k.width / e.canvas.width), Math.round(k.top + (e.canvas.height - q[1] - q[3] / 2) * k.height / e.canvas.height)]; };
    return { phase: this.phase, title: txt('Canvas_UI/Panel/TopBar/Title'), trophyText: txt('Canvas_UI/Panel/TopBar/Subtitle/Trophy/Trophy_Text'),
      starText: txt('Canvas_UI/Panel/TopBar/Subtitle/Star/Star_Text'), playButton: btn(this.btnPlay), openButton: btn(this.btnOpen), rank: r.rank, victory: r.victory, trophies: r.trophiesGained, stars: r.starsGained,
      starStart: r.starStart, starEnd: r.starEnd, fridge: r.fridgeBox, cells: this.cells ? this.cells.length : 0,
      animState: this.an ? this.an.stateName(0) : '' };
  }

  dispose() {
    const { engine } = this;
    engine.hooks.late = engine.hooks.late.filter((f) => f !== this.upd);
    engine.clickHooks = [];
    for (const r of this.inst.roots) r.destroy();
    engine.post = null;
  }
}
