// Thin app shell (menus come later): Intro logo -> quick-play match built by MetaService.buildMatchRequest for the
// local profile -> SceneGameOver with MetaService.applyMatchResult -> play again.
// URL overrides for testing: ?mode=dm2v2|dm1v1|dmffa|kill5|kill5ffa|lastSurvivor|ls2v2|killBoss &map=kitchen|dining|pantry|0..2
//   &skin=BRO|broccoli|1..16 &level=1..20 &seed=N &timescale=N &intro=0 &slot=0..3 (local slot, with mode)
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

const preloader = document.getElementById('preloader');
const setLoad = (pct, text) => {
  if (!preloader) return;
  const bar = preloader.querySelector('.fill');
  if (bar) bar.style.width = Math.round(pct * 100) + '%';
  if (text !== undefined) preloader.querySelector('.hint').textContent = text;
};

class App {
  constructor() {
    this.screen = 'boot';
    this.match = null;
    this.over = null;
    this.matches = 0;
    this.fps = 0;
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
    this.store = new LocalStorageProfileStore();
    this.loadProfile();
    setLoad(0.3);
    this.trackFps();
    engine.start();
    if (Q.get('intro') !== '0') await this.intro();
    for (;;) {
      const again = await this.playOnce();
      if (!again) break;
    }
  }

  loadProfile() {
    const now = new Date();
    let p = null;
    try { p = ProfileJson.load(this.store); } catch (e) { console.warn('profile reset:', e.message); }
    if (!p) {
      p = this.meta.newProfile(now, new MetaRng(Date.now() & 0x7fffffff));
      // no tutorial in this build: the first quick match counts as a real one (trophies, stars)
      this.meta.completeTutorial(p, now);
    }
    this.meta.tick(p, now, new MetaRng(Date.now() & 0x7fffffff));
    this.profile = p;
    ProfileJson.save(this.store, p);
  }

  // SceneIntro: bloop logo while the match data loads
  async intro() {
    this.screen = 'intro';
    const inst = await this.engine.loadScene('SceneIntro');
    if (preloader) preloader.classList.add('done');
    this.audio.sfx('Logo');
    await this.wait(2.0);
    for (const r of inst.roots) r.destroy();
    this.engine.post = null;
  }

  wait(s) { const e = this.engine; return new Promise((res) => { const end = e.realTime + s; const f = () => { if (e.realTime >= end) res(); else setTimeout(f, 16); }; f(); }); }

  buildRequest() {
    const p = this.profile;
    const rng = new MetaRng(Date.now() & 0x7fffffff);
    const r = this.meta.buildMatchRequest(p, new Date(), rng);
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

  async playOnce() {
    const engine = this.engine;
    this.screen = 'loading';
    const req = this.buildRequest();
    this.lastRequest = req;
    const m = new MatchScene(this);
    this.match = m;
    await m.load(req, { timeScale: Number(Q.get('timescale')) || 1 });
    if (preloader) preloader.classList.add('done');
    // the result screen's atlases load while the match runs
    const goPreload = Promise.all([engine.assets.scene('SceneGameOver'), this.prefabs.preload(['GameOverCell1', 'GameOverCell2', 'GameOverCell3'])]).catch((e) => console.error(e));
    this.screen = 'match';
    const done = m.finished();
    await m.runStart(Q.get('intro') !== '0');
    const outcome = await done;
    await goPreload;
    const o = new MatchOutcome({ rank: outcome.rank, winnerTeam: outcome.winnerTeam, kills: outcome.kills, deaths: outcome.deaths,
      jumps: outcome.jumps, specialKill: outcome.specialKill, quitEarly: false });
    this.trophiesBefore = this.profile.trophies;
    const res = this.meta.applyMatchResult(this.profile, req, o, new Date(), new MetaRng(Date.now() & 0x7fffffff));
    ProfileJson.save(this.store, this.profile);
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
    over.dispose();
    this.over = null;
    return choice === 'again';
  }

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
    return {
      screen: this.screen, phase: d ? d.phase : this.screen, tick: d ? d.tick : 0, timer: d ? d.timer : 0, timerText: d ? d.timerText : '',
      scores: d ? d.scores : [], teamKills: d ? d.teamKills : [], agents: d ? d.agents : [], events: d ? d.events : {}, stats: d ? d.stats : {},
      hud: d ? d.hud : {}, match: d, fps: Math.round(this.fps * 10) / 10, matches: this.matches,
      gameOver: this.over ? this.over.debug() : null,
      result: this.lastResult ? { rank: this.lastResult.rank, victory: this.lastResult.victory, trophies: this.lastResult.trophiesGained, stars: this.lastResult.starsGained } : null,
      profile: p ? { trophies: p.trophies, gameCount: p.gameCount, stars: p.fridge.stars, name: p.name } : null,
      engine: { drawCalls: stats.drawCalls, particles: stats.particles, errors: stats.errors.slice(0, 5), spritesMissing: stats.spritesMissing.slice(0, 10),
        clipsMissing: stats.clipsMissing.slice(0, 10), prefabsMissing: stats.prefabsMissing.slice(), audioMissing: stats.audioMissing.slice(0, 10) },
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
app.boot().catch((e) => {
  stats.errors.push(String(e && e.stack || e));
  console.error(e);
  setLoad(1, 'Error: ' + e.message);
  if (preloader) preloader.classList.remove('done');
});
