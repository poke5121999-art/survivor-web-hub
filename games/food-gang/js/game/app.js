// App shell, META §15: SceneIntro -> (first launch) tutorial match vs 5 dummies -> SceneTutoEnd (name) ->
// SceneLoadingGame -> match -> SceneGameOver -> SceneMenu, popups stacked over the menu (PopupSceneManager).
// Profile in localStorage (LocalStorageProfileStore), meta clock ticking every second while the page is open.
// URL overrides for testing (any of them skips the menu and plays matches back to back, as the match test expects):
//   ?mode=dm2v2|dm1v1|dmffa|kill5|kill5ffa|lastSurvivor|ls2v2|killBoss &map=kitchen|dining|pantry|0..2
//   &skin=BRO|broccoli|1..16 &level=1..20 &seed=N &slot=0..3 ; &timescale=N &intro=0 work everywhere
import { Engine, stats } from '../engine/engine.js';
import { GameDb, GoalType, TeamConfig } from '../sim/index.js';
import { MetaDb, MetaService, MetaRng, ProfileJson, LocalStorageProfileStore } from '../meta/index.js';
import { MatchOutcome, MatchSlot } from '../meta/events.js';
import { teamForSlot } from '../meta/matchmaking.js';
import { ViewDb } from './viewdb.js';
import { GameAudio } from './audio.js';
import { LocalInput } from './match/LocalInput.js';
import { PrefabPool } from './match/prefabs.js';
import { MatchScene } from './match/MatchScene.js';
import { GameOverScreen } from './GameOverScreen.js';
import * as Text from './text.js';
import { SkinInfo } from './screens/SkinDisplay.js';
import { wait } from './screens/base.js';
import { MenuScreen } from './screens/Menu.js';
import { LoadingGameScreen } from './screens/LoadingGame.js';
import { TutoEndScreen } from './screens/TutoEnd.js';
import { RewardScreen } from './screens/Reward.js';
import { SystemsScreen } from './screens/Systems.js';
import { Settings } from './settings.js';
import { Net } from './net.js';

const Q = new URLSearchParams(location.search);
const REV = document.documentElement.dataset.rev || '';
const MODES = {
  dm2v2: [GoalType.DeathMatch, TeamConfig.TwoVersusTwo], dm1v1: [GoalType.DeathMatch, TeamConfig.FreeForAll, 2],
  dmffa: [GoalType.DeathMatch, TeamConfig.FreeForAll], kill5: [GoalType.Kill5, TeamConfig.TwoVersusTwo],
  k52v2: [GoalType.Kill5, TeamConfig.TwoVersusTwo], kill5ffa: [GoalType.Kill5, TeamConfig.FreeForAll],
  lastsurvivor: [GoalType.LastSurvivor, TeamConfig.FreeForAll], ls: [GoalType.LastSurvivor, TeamConfig.FreeForAll],
  ls2v2: [GoalType.LastSurvivor, TeamConfig.TwoVersusTwo], killboss: [GoalType.KillBoss, TeamConfig.OneVersusThree],
  boss: [GoalType.KillBoss, TeamConfig.OneVersusThree],
};
const MAPS = { kitchen: 0, dining: 1, pantry: 2 };
const DIRECT = ['mode', 'map', 'skin', 'level', 'seed', 'slot'].some((k) => Q.has(k));

const preloader = document.getElementById('preloader');
const setLoad = (pct, text) => {
  if (!preloader) return;
  const bar = preloader.querySelector('.fill');
  if (bar) bar.style.width = Math.round(pct * 100) + '%';
  if (text !== undefined) preloader.querySelector('.hint').textContent = text;
};
const rng = () => new MetaRng((Date.now() ^ (Math.random() * 0x7fffffff)) & 0x7fffffff);

class App {
  constructor() {
    this.screen = 'boot';
    this.screens = [];
    this.match = null;
    this.over = null;
    this.matches = 0;
    this.fps = 0;
    this.listeners = new Set();
  }

  async boot() {
    const canvas = document.getElementById('cv');
    const engine = this.engine = new Engine(canvas, new URL('.', location.href).href, REV);
    window.fgEngine = engine;
    await engine.init();
    setLoad(0.15);
    const A = engine.assets;
    const [sim, meta, gd, adb, vdb] = await Promise.all([A.getJSON('data/simdata.json'), fetch(A.base + 'data/metadata.json' + A.rev).then((r) => r.text()),
      A.getJSON('data/assets/GameData.json'), A.getJSON('data/assets/AudioDB.json'), A.getJSON('data/assets/FgViewDb.json')]);
    this.simDb = GameDb.load(sim);
    this.meta = new MetaService(MetaDb.load(meta));
    this.gameData = gd.fields;
    this.viewDb = new ViewDb(vdb);
    this.audio = new GameAudio(engine, adb);
    this.input = new LocalInput(engine);
    this.prefabs = new PrefabPool(engine);
    this.skins = new SkinInfo(this);
    this.store = new LocalStorageProfileStore();
    this.settings = new Settings(this);
    if (Text.initText) await Text.initText(A).catch((e) => console.warn('text:', e.message));
    this.loadProfile();
    this.settings.apply();
    setLoad(0.3);
    this.trackFps();
    engine.onClick((b) => this.routeClick(b));
    engine.start();
    this.systems = await new SystemsScreen(this).open();
    if (Q.get('intro') !== '0') await this.intro();
    this.startClock();
    if (DIRECT) {
      if (!this.profile.tutorialDone) this.meta.completeTutorial(this.profile, new Date());
      this.save();
      for (;;) { const r = await this.playMatch(this.buildRequest()); if (r !== 'again') break; }
      return;
    }
    this.net = new Net(this);
    await this.flow();
  }

  // ---------------------------------------------------------------- profile + clock

  loadProfile() {
    const now = new Date();
    let p = null;
    try { p = ProfileJson.load(this.store); } catch (e) { console.warn('profile reset:', e.message); }
    if (!p) p = this.meta.newProfile(now, rng());
    this.meta.tick(p, now, rng());
    this.profile = p;
    this.save();
  }

  save() { ProfileJson.save(this.store, this.profile); this.emit('profile'); }

  // MenuController.Update / DailyOfferSystem.Update / RewardStockSystem: everything the clock drives
  startClock() {
    this.clock = setInterval(() => {
      if (!this.profile) return;
      const r = this.meta.tick(this.profile, new Date(), rng());
      if (r.events.length) this.save();
      this.emit('tick');
    }, 1000);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind) { for (const f of [...this.listeners]) { try { f(kind); } catch (e) { console.error(e); } } }

  // ---------------------------------------------------------------- UI plumbing

  // topmost screen that owns the button gets the click; AudioClick on the button plays UIOk / UIBack
  routeClick(b) {
    const ac = b.node.script('AudioClick');
    if (ac) this.audio.sfx(ac.fields.m_negative ? 'UIBack' : 'UIOk');
    const list = this.screens.slice().sort((a, c) => c.layer - a.layer);
    for (const s of list) if (s.ownsNode(b.node)) { s.click(b); return; }
  }

  topLayer() { return this.screens.reduce((m, s) => (s.layer < 90 ? Math.max(m, s.layer) : m), 0); }

  // PopupSceneManager.DisplayPopupScene: a scene over everything open, closed by its Back / Close
  async popup(Cls, ...args) {
    const s = new Cls(this, ...args);
    s.layer = this.topLayer() + 2;
    await s.open();
    return s;
  }

  toast(keyOrText) { if (this.systems) this.systems.toast(Text.T(keyOrText)); }

  // SceneSystem.StartFadeInOut
  async fade(fn) {
    let f = document.getElementById('fg-fade');
    if (!f) { f = document.createElement('div'); f.id = 'fg-fade'; document.body.appendChild(f); }
    f.classList.add('on');
    await new Promise((r) => setTimeout(r, 220));
    try { await fn(); } finally { f.classList.remove('on'); }
  }

  closeAll() { for (const s of this.screens.slice()) if (s.layer < 90) s.close(); }

  async ensureSprites(keys) {
    const A = this.engine.assets, set = new Set();
    for (const k of keys) { const s = A.spriteData.sprites[String(k).replace(/^sprite:/, '')]; if (s) set.add(s.a); }
    await Promise.all([...set].map((a) => A.atlasImage(a).catch(() => null)));
  }

  // ---------------------------------------------------------------- flow

  async intro() {
    this.screen = 'intro';
    const inst = await this.engine.loadScene('SceneIntro');
    if (preloader) preloader.classList.add('done');
    this.audio.sfx('Logo');
    await wait(this.engine, 2.0);
    for (const r of inst.roots) r.destroy();
    this.engine.post = null;
  }

  async flow() {
    // NetworkCheckScene.Update: m_gameCount == 0 -> tutorial, else the menu
    if (this.profile.gameCount === 0 && !this.profile.tutorialDone) {
      await this.tutorial();
      await this.tutoEnd();
      await this.quickPlay();
    }
    for (;;) {
      const act = await this.menu();
      if (!act) continue;
      if (act.type === 'play') await this.quickPlay(act.mission ?? -1);
      else if (act.type === 'private') await this.privateMatch(act);
      else if (act.type === 'reload') { location.reload(); return; }
    }
  }

  async menu() {
    this.screen = 'menu';
    if (preloader) preloader.classList.add('done');
    const m = new MenuScreen(this);
    this.menuScreen = m;
    await m.open();
    const act = await m.done();
    this.menuScreen = null;
    return act;
  }

  async tutorial() {
    const req = this.meta.buildTutorialRequest(this.profile);
    req.seed = Date.now() & 0x7fffffff;
    await this.playMatch(req, { tutorial: true });
  }

  async tutoEnd() {
    this.screen = 'tutoend';
    const s = new TutoEndScreen(this);
    await this.fade(() => s.open());
    await s.done();
  }

  // MenuController.Play / MissionDisplay.StartMission -> matchmaking -> match. Offline (the original path vs bots):
  // the match loads behind a fade and its VS panel plays the lobby, the bots' cells spinning "Searching opponents..."
  // until BotFillAt (clip frames). Online (Net.available): SceneLoadingGame counts real players until the session starts.
  async quickPlay(missionIndex = -1) {
    const r = this.meta.buildMatchRequest(this.profile, new Date(), rng(), missionIndex);
    if (!r.ok) { this.toast(r.error); return; }
    const req = r.request;
    this.screen = 'matchmaking';
    if (this.net.available() && missionIndex < 0) {
      const lg = new LoadingGameScreen(this, req);
      await this.fade(async () => { this.closeAll(); await lg.open(); });
      const res = await lg.run(this.net.quickMatch(req));
      if (res.cancel) return;
      await this.playMatch(res.request || req, { loading: lg, runnerOptions: res.runnerOptions, session: res.session, mission: missionIndex >= 0 });
      return;
    }
    await this.playMatch(req, { searching: true, mission: missionIndex >= 0 });
  }

  // the party lobby's session started: its request (host's sim or a guest's ClientRunner options) plays like any match;
  // isFriendRoom requests give no trophies / stars (MetaService.applyMatchResult)
  async privateMatch(act) {
    if (!act.request) return;
    await this.playMatch(act.request, { runnerOptions: act.runnerOptions, friend: true, session: act.session, searching: false });
  }

  buildRequest() {
    const p = this.profile;
    const r = this.meta.buildMatchRequest(p, new Date(), rng());
    if (!r.ok) throw new Error('match request failed: ' + r.error);
    const req = r.request;
    const mode = MODES[(Q.get('mode') || '').toLowerCase()];
    if (Q.has('seed')) req.seed = Number(Q.get('seed')) | 0;
    if (Q.has('map')) { const m = Q.get('map').toLowerCase(); req.mapIndex = MAPS[m] ?? Math.max(0, Math.min(2, Number(m) || 0)); }
    req.stageId = this.meta.db.maps[req.mapIndex].stageId;
    const local = req.slots[req.localSlot];
    if (Q.has('skin')) {
      const s = Q.get('skin');
      const vs = this.viewDb.skin(s);
      const id = Number(s) >= 1 && Number(s) <= 16 ? Number(s) : vs ? vs.skinId : local.skinId;
      local.skinId = id;
      for (const b of req.slots) if (b && b !== local && b.skinId === id) b.skinId = (id % 16) + 1;
    }
    if (Q.has('level')) local.level = Math.max(1, Math.min(20, Number(Q.get('level')) | 0));
    if (mode) {
      const [goal, team, players] = mode;
      req.goal = goal; req.team = team;
      req.bossOnLeft = goal === GoalType.KillBoss ? false : req.bossOnLeft;
      const bots = req.slots.filter((s) => s && s !== local);
      let localSlot = Q.has('slot') ? Math.max(0, Math.min(3, Number(Q.get('slot')) | 0)) : req.localSlot;
      if (players === 2) localSlot = 0;
      else if (goal === GoalType.KillBoss && localSlot === (req.bossOnLeft ? 0 : 3)) localSlot = 0;
      const order = [];
      for (let s = 0; s < (players || 4); s++) order.push(s);
      req.slots = [null, null, null, null];
      let bi = 0;
      for (const s of order) {
        const src = s === localSlot ? local : bots[bi++];
        req.slots[s] = new MatchSlot({ ...src, slot: s, team: teamForSlot(s, team, req.bossOnLeft) });
      }
      req.localSlot = localSlot;
      for (const s of req.slots) if (s && s.isBot) s.isAlly = team !== TeamConfig.FreeForAll && s.team === req.slots[localSlot].team;
    }
    return req;
  }

  // one match: (loading screen) -> MatchScene -> result -> SceneGameOver (not after the tutorial).
  // Returns 'again' when the result screen asked to play again (direct test mode), else 'menu'.
  async playMatch(req, opts = {}) {
    const engine = this.engine;
    this.screen = 'loading';
    this.lastRequest = req;
    const m = new MatchScene(this);
    this.match = m;
    const ts = Number(Q.get('timescale')) || req.timeScale || 1;
    const load = async () => {
      await m.load(req, { timeScale: ts, ...(opts.runnerOptions || {}) });
      if (opts.loading) opts.loading.close();
      this.closeAll();
    };
    if (opts.searching) await this.fade(load); else await load();
    if (preloader) preloader.classList.add('done');
    const goPreload = opts.tutorial ? Promise.resolve() : Promise.all([engine.assets.scene('SceneGameOver'), this.prefabs.preload(['GameOverCell1', 'GameOverCell2', 'GameOverCell3'])]).catch((e) => console.error(e));
    this.screen = 'match';
    const done = m.finished();
    await m.runStart(Q.get('intro') !== '0' && !opts.tutorial, !!opts.searching);
    const outcome = await done;
    await goPreload;
    const now = new Date();
    this.trophiesBefore = this.profile.trophies;
    if (opts.tutorial) {
      this.meta.completeTutorial(this.profile, now);
      this.save();
      this.matches++;
      m.dispose();
      this.match = null;
      this.lastMatch = m;
      return 'menu';
    }
    const o = new MatchOutcome({ rank: outcome.rank, winnerTeam: outcome.winnerTeam, kills: outcome.kills, deaths: outcome.deaths,
      jumps: outcome.jumps, specialKill: outcome.specialKill, quitEarly: false });
    const res = this.meta.applyMatchResult(this.profile, req, o, now, rng());
    this.save();
    this.lastResult = res;
    this.lastOutcome = outcome;
    this.matches++;
    const keep = this.prefabs.data;
    m.dispose();
    this.prefabs.data = keep;
    this.screen = 'gameover';
    const over = new GameOverScreen(this);
    this.over = over;
    await over.load(m, res);
    this.match = null;
    this.lastMatch = m;
    const choice = await over.run();
    if (DIRECT) { over.dispose(); this.over = null; return choice; }
    await this.fade(() => { over.dispose(); this.over = null; });
    return 'menu';
  }

  // SceneReward over whatever is open: every reward of a MetaResult (fridge contents, road step, shop...)
  async showRewards(res, box = 0) {
    if (!res || !res.ok) return;
    const s = await this.popup(RewardScreen, res, box);
    await s.done();
    this.save();
  }

  // ---------------------------------------------------------------- debug / test bridge

  trackFps() {
    let n = 0, t0 = performance.now();
    const f = () => {
      n++;
      const t = performance.now();
      if (t - t0 >= 1000) { this.fps = n * 1000 / (t - t0); n = 0; t0 = t; }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }

  debug() {
    const p = this.profile;
    const m = this.match;
    const d = m ? m.debug() : this.lastMatch ? this.lastMatch.debug() : null;
    const top = this.screens.filter((s) => s.layer < 90).sort((a, b) => b.layer - a.layer);
    return {
      screen: this.screen, phase: d ? d.phase : this.screen, tick: d ? d.tick : 0, timer: d ? d.timer : 0, timerText: d ? d.timerText : '',
      scores: d ? d.scores : [], teamKills: d ? d.teamKills : [], agents: d ? d.agents : [], events: d ? d.events : {}, stats: d ? d.stats : {},
      hud: d ? d.hud : {}, match: d, fps: Math.round(this.fps * 10) / 10, matches: this.matches,
      gameOver: this.over ? this.over.debug() : null,
      ui: top.map((s) => ({ scene: s.sceneName, layer: s.layer, ...(s.debug ? s.debug() : {}) })),
      result: this.lastResult ? { rank: this.lastResult.rank, victory: this.lastResult.victory, trophies: this.lastResult.trophiesGained, stars: this.lastResult.starsGained } : null,
      profile: p ? { trophies: p.trophies, gameCount: p.gameCount, stars: p.fridge.stars, name: p.name, coins: p.coins, gems: p.gems, skinSelected: p.skinSelected,
        skins: p.skins.map((s) => [s.id, s.level, s.tokens]), tutorialDone: p.tutorialDone, stock: p.fridge.stock } : null,
      language: Text.getLanguage ? Text.getLanguage() : 'English',
      engine: { drawCalls: stats.drawCalls, particles: stats.particles, errors: stats.errors.slice(0, 5), spritesMissing: stats.spritesMissing.slice(0, 10),
        clipsMissing: stats.clipsMissing.slice(0, 10), prefabsMissing: stats.prefabsMissing.slice(), audioMissing: stats.audioMissing.slice(0, 10),
        atlasesLoaded: stats.atlasesLoaded.slice() },
      audio: { played: this.audio ? this.audio.played : 0, last: this.audio ? this.audio.lastKeys.slice(-6) : [] },
    };
  }
}

const app = new App();
window.fgApp = app;
window.fgDebug = () => app.debug();
// test bridge: scripted input overrides keyboard/touch while set (dirX -1..1, down = Jump 1 | Action 2 | Special 4)
window.fgScript = (dirX, down) => { if (!app.input) return; app.input.scripted = dirX === null ? null : { dirX: dirX || 0, down: down | 0 }; };
window.fgTimeScale = (k) => { if (app.match && app.match.runner) app.match.runner.timeScale = k; };
// test bridge: damage an agent through the sim's DebugDamageCommand (forces a death to check the respawn screen)
window.fgDamage = (slotOrId, amount, bySlot = true) => {
  const r = app.match && app.match.runner;
  if (!r) return 0;
  const a = bySlot ? r.state.agents.find((x) => x.slot === slotOrId) : r.state.agents[slotOrId];
  return a ? r.match.debugDamage(r.state, a.id, amount) : 0;
};
// test bridge: the buttons of the topmost screen (or of a scene by name) with their page positions
window.fgButtons = (scene) => { const l = app.screens.filter((s) => (scene ? s.sceneName === scene : s.layer < 90)).sort((a, b) => b.layer - a.layer); return l[0] ? l[0].buttons() : []; };
app.boot().catch((e) => {
  stats.errors.push(String(e && e.stack || e));
  console.error(e);
  setLoad(1, 'Error: ' + e.message);
  if (preloader) preloader.classList.remove('done');
});
