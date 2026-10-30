// One match on screen: map scene + SceneGame, the MatchRunner, agent/bullet/FX views, HUD, camera and the
// start / game-over sequences (QuantumGameStartSequence, GameController, CinemachineGroupManager).
import { createMatchSetup, addSlot, GamePhase, GoalType, TeamConfig, SimEventType, StatusFlags, isDead } from '../../sim/index.js';
import { MatchRunner, BotSource } from './MatchRunner.js';
import { AgentView } from './AgentView.js';
import { BulletViews, FxListener } from './BulletView.js';
import { Hud } from './Hud.js';
import { T } from '../text.js';

const TARGET_OFFSET_Y = 1.5;
const MODE_TEXT = {
  [GoalType.DeathMatch]: ['mission.dm.ffa', 'mission.dm.2vs2'],
  [GoalType.Kill5]: ['mission.kill.ffa', 'mission.kill.2vs2'],
  [GoalType.LastSurvivor]: ['mission.survive.ffa', 'mission.survive.2vs2'],
  [GoalType.KillBoss]: ['mission.killboss.1vs3', 'mission.killboss.1vs3'],
};

const wait = (engine, s) => new Promise((res) => { const end = engine.realTime + s; const f = () => { if (engine.realTime >= end) res(); else setTimeout(f, 16); }; f(); });

export class MatchScene {
  constructor(app) {
    this.app = app;
    this.engine = app.engine;
    this.phase = 'loading';
    this.stats = { jumps: 0, damageEvents: 0, deaths: 0, respawns: 0, shots: 0, specials: 0, bulletsSpawned: 0 };
    this.disposers = [];
  }

  // req: meta MatchRequest (slots with skinId / level / isBot / botDifficulty / name)
  async load(req, opts = {}) {
    const { engine, app } = this;
    this.req = req;
    const db = app.simDb;
    const mapName = db.maps[req.mapIndex].scene;
    const setup = createMatchSetup({ seed: req.seed, mapIndex: req.mapIndex, goal: req.goal, teams: req.team, bossOnLeft: req.bossOnLeft,
      isOffline: true, botDifficultyInt: req.botDifficultyInt });
    for (const s of req.slots) if (s) addSlot(setup, s.slot, s.skinId, s.level, s.isBot, s.isBot ? s.botDifficulty : 0.5);
    const skinIdx = setup.slots.map((s) => db.skins.findIndex((k) => k.skinId === s.skinId));
    // map + HUD scenes, then every prefab this match can spawn (atlases of this map only)
    const prefabNames = app.viewDb.prefabsFor(db, skinIdx);
    const [mapInst, gameInst] = await Promise.all([engine.assets.scene(mapName), engine.assets.scene('SceneGame'), app.prefabs.preload(prefabNames)])
      .then(async () => [await engine.loadScene(mapName), await engine.loadScene('SceneGame')]);
    this.mapInst = mapInst; this.gameInst = gameInst;
    app.audio.preload(app.viewDb.sfxKeysFor(db, skinIdx));

    const runner = new MatchRunner(db, setup, req.localSlot);
    runner.timeScale = opts.timeScale || 1;
    this.runner = runner;
    for (const a of runner.state.agents) runner.setSource(a.slot, a.isBot ? BotSource : app.input);
    app.input.resetVirtual();
    this.names = [];
    for (const s of req.slots) if (s) this.names[s.slot] = s.name;

    const ctx = this.ctx = {
      engine, runner, db, viewDb: app.viewDb, gameData: app.gameData, audio: app.audio, prefabs: app.prefabs, input: app.input, names: this.names,
    };
    this.views = runner.state.agents.map((a) => {
      const vs = app.viewDb.skin(db.skins[a.skin].name);
      return new AgentView(ctx, a.id, app.prefabs.spawn(vs.prefab, null, [a.pos.x, a.pos.y, 0]));
    });
    this.bullets = new BulletViews(ctx);
    this.fx = new FxListener(ctx);
    this.hud = new Hud(ctx, gameInst);
    this.hudRoot = gameInst.root;
    this.camTarget = gameInst.root.find('CameraTargetGroup');
    this.composer = engine.cine ? engine.cine.comp : null;
    this.baseDistance = this.composer ? this.composer.distance || 20 : 20;
    this.distanceExtra = 0;
    if (engine.cine && this.camTarget) engine.cine.setFollow(this.camTarget);
    this.updateCamera(0);
    if (engine.cine) engine.cine.pos = null;

    this.disposers.push(runner.on((e) => this.onEvent(e)));
    runner.flushCreateEvents();
    engine.onAnimEvent = (node, e) => this.onAnimEvent(node, e);
    this.onPointer = (type, p, hit) => this.hud.onPointer(type, p, hit);
    engine.pointerHooks = [this.onPointer];
    this.upd = (dt) => this.update(dt);
    this.late = (dt) => this.lateUpdate(dt);
    engine.hooks.update.push(this.upd);
    engine.hooks.late.push(this.late);
    return this;
  }

  modeLabel() {
    const s = this.runner.state;
    return T(MODE_TEXT[s.goal][s.teams === TeamConfig.FreeForAll ? 0 : 1]);
  }

  stageName() { return T('stage.' + this.app.simDb.maps[this.req.mapIndex].stageId); }

  // versus screen -> READY? -> BATTLE! (GameController.DisplayReady / DisplayStart)
  async runStart(intro = true) {
    const { engine, hud, app } = this;
    this.phase = 'intro';
    app.audio.playMusic('Music', 0.45);
    if (intro) {
      hud.showVersus(this.names, this.modeLabel(), this.stageName());
      await wait(engine, 2.2);
      hud.hideVersus();
      hud.displayReady();
      await wait(engine, 1.0);
    } else hud.hideVersus();
    hud.displayStart();
    this.runner.start();
    this.phase = 'match';
    this.startedAt = engine.realTime;
    await wait(engine, 1.0);
    if (this.phase === 'match') hud.hideStart();
  }

  // resolves with the outcome once the end banner was shown (the app then opens SceneGameOver)
  finished() { return new Promise((res) => { this.resolveEnd = res; }); }

  onEvent(e) {
    const r = this.runner;
    if (e.agent >= 0 && e.type <= SimEventType.AgentRespawned) { const v = this.views[e.agent]; if (v) v.onEvent(e); }
    this.bullets.onEvent(e);
    this.fx.onEvent(e);
    this.hud.onEvent(e);
    const local = e.agent >= 0 && r.agent(e.agent) && r.agent(e.agent).slot === r.localSlot;
    switch (e.type) {
      case SimEventType.AgentJumped: if (local) this.stats.jumps++; break;
      case SimEventType.AgentTookDamage: if (e.value > 0) this.stats.damageEvents++; break;
      case SimEventType.AgentDied: this.stats.deaths++; if (local) this.stats.localDeaths = (this.stats.localDeaths || 0) + 1;
        if (e.flag && r.agent(e.other) && r.agent(e.other).slot === r.localSlot) this.stats.specialKill = true; break;
      case SimEventType.AgentRespawned: this.stats.respawns++; if (local) this.stats.localRespawns = (this.stats.localRespawns || 0) + 1; break;
      case SimEventType.AgentShootTriggered: if (local) { this.stats.shots++; if (e.flag) this.stats.specials++; } break;
      case SimEventType.AgentActionStarted: if (local) { if (e.flag) this.stats.localSpecialStarts = (this.stats.localSpecialStarts || 0) + 1; else this.stats.localActionStarts = (this.stats.localActionStarts || 0) + 1; } break;
      case SimEventType.GameOverTriggered: this.gameOver(e); break;
      default: break;
    }
  }

  onAnimEvent(node, e) {
    let v = null;
    for (let n = node; n; n = n.parent) if (n.agentView) { v = n.agentView; break; }
    switch (e.fn) {
      case 'OnWalk': if (v) v.onWalk(); break;
      case 'TriggerAnimationEvent': if (v && e.i === 0) v.onWalk(); break;
      case 'BlinkRed': if (v) v.triggerBlinkRed(e.f); break;
      case 'TriggerGlobalSFX': case 'TriggerSFX': this.app.audio.sfx(e.s); break;
      default: break;
    }
  }

  // GameOverTriggered: TIME OUT! (or the result) banner, victory / defeat poses, camera pulls back
  async gameOver(e) {
    if (this.phase === 'gameover') return;
    this.phase = 'gameover';
    const r = this.runner, s = r.state, me = r.localAgent;
    const ffa = s.teams === TeamConfig.FreeForAll;
    const draw = e.int <= 0 && e.other < 0;
    const outcome = this.outcome();
    this.outcomeData = outcome;
    const win = ffa ? outcome.rank === 1 : (!draw && me && e.int === me.team);
    this.hud.hideStart();
    this.hud.showGameOverText(e.flag ? T('title.end.timeout') : draw ? T('title.end.draw') : win ? T('title.end.victory') : T('title.end.defeat'));
    this.app.audio.sfx('Smash');
    for (const v of this.views) {
      const a = v.agent;
      const aw = !draw && (ffa ? e.other === a.slot : e.int === a.team);
      v.setEndGameState(aw, !aw && !draw);
    }
    this.dezoom = { from: this.distanceExtra, to: this.distanceExtra + 4, t: 0, d: 1 };
    this.endedAt = this.engine.realTime;
    await wait(this.engine, 2.6);
    if (this.resolveEnd) this.resolveEnd(outcome);
  }

  // MatchOutcome for MetaService.applyMatchResult (QuantumGameStartSequence.BuildAndInjectResults)
  outcome() {
    const r = this.runner, s = r.state, me = r.localAgent;
    const slots = s.agents.filter((a) => a.slot >= 0).map((a) => a.slot);
    let rank = 1;
    if (s.teams === TeamConfig.FreeForAll && me) {
      const ms = me.slot;
      if (s.goal === GoalType.LastSurvivor) {
        // survivors first, then whoever died out last (later final death seq ranks higher)
        const out = (sl) => s.deathSlot[sl] >= 3;
        const key = (sl) => (out(sl) ? s.lastDeathSeq[sl] : 1e9);
        rank = 1 + slots.filter((sl) => sl !== ms && key(sl) > key(ms)).length;
      } else if (s.winnerSlot === ms) rank = 1;
      else {
        const better = (sl) => s.killSlot[sl] > s.killSlot[ms] || (s.killSlot[sl] === s.killSlot[ms] && s.killSlot[sl] > 0 && s.lastKillSeq[sl] < s.lastKillSeq[ms]);
        rank = 1 + slots.filter((sl) => sl !== ms && (sl === s.winnerSlot || better(sl))).length;
      }
    }
    return {
      rank, winnerTeam: s.winnerTeam, timeOut: s.timeOut, kills: me ? s.killSlot[me.slot] : 0, deaths: me ? s.deathSlot[me.slot] : 0,
      jumps: this.stats.jumps, specialKill: !!this.stats.specialKill, quitEarly: false,
      teams: s.teams, localTeam: me ? me.team : 0,
    };
  }

  update(dt) {
    this.app.input.sample();
    this.runner.update(this.engine.rawDt);
    this.hud.update(dt);
  }

  lateUpdate(dt) {
    for (const v of this.views) v.update(dt);
    this.bullets.update();
    this.app.prefabs.update();
    this.updateCamera(dt);
    this.hud.updateLifeBars(this.views, dt);
  }

  // CinemachineGroupManager: follow the local agent (+1.5), spectate a living team-mate while dead
  updateCamera(dt) {
    const r = this.runner, s = r.state, a = r.localAgent;
    let id = a ? a.id : -1;
    if (!a || isDead(a)) {
      for (const o of s.agents) if (!isDead(o) && (id < 0 || isDead(s.agents[id])) && (!a || o.team === a.team)) id = o.id;
      if (id >= 0 && isDead(s.agents[id])) for (const o of s.agents) if (!isDead(o)) { id = o.id; break; }
    }
    if (this.dezoom) {
      const z = this.dezoom;
      z.t = Math.min(z.d, z.t + this.engine.rawDt);
      const k = z.t / z.d, sm = k * k * (3 - 2 * k);
      this.distanceExtra = z.from + (z.to - z.from) * sm;
    }
    const p = [0, 0, 0];
    if (id >= 0 && this.camTarget) {
      r.agentPos(id, p);
      this.camTarget.lp[0] = p[0]; this.camTarget.lp[1] = p[1] + TARGET_OFFSET_Y; this.camTarget.lp[2] = 0;
      this.camTarget.updateWorld(null);
    }
    const c = this.engine.canvas;
    const aspect = c.height > 0 ? c.width / c.height : 16 / 9;
    if (this.composer) this.composer.distance = this.baseDistance * Math.max(1, (16 / 9) / Math.max(0.5, aspect)) + this.distanceExtra;
    if (this.camTarget) { this.app.audio.listener[0] = this.camTarget.lp[0]; this.app.audio.listener[1] = this.camTarget.lp[1]; }
  }

  debug() {
    const r = this.runner;
    if (!r) return null;
    const s = r.state, db = this.app.simDb;
    const me = r.localAgent;
    return {
      phase: this.phase, simPhase: ['waiting', 'playing', 'gameover'][s.phase], tick: s.tick, timer: Math.round(r.timerRemaining * 100) / 100,
      timerText: this.hud.timerText ? this.hud.timerText.text : '', goal: s.goal, teams: s.teams, map: s.mapIndex, localSlot: r.localSlot,
      scores: [1, 2, 3, 4].map((t) => s.agents.some((a) => a.team === t) ? this.hud.teams.find((x) => x.team === t)?.text?.text ?? null : null),
      teamKills: [1, 2, 3, 4].map((t) => { let k = 0; for (let sl = 0; sl < 4; sl++) if (s.agents.some((a) => a.slot === sl && a.team === t)) k += s.killSlot[sl]; return k; }),
      winnerTeam: s.winnerTeam, winnerSlot: s.winnerSlot, timeOut: s.timeOut,
      agents: s.agents.map((a) => ({ id: a.id, slot: a.slot, team: a.team, skin: db.skins[a.skin].name, hp: Math.round(a.hpCurrent), hpMax: Math.round(a.hpMax),
        x: Math.round(a.pos.x * 1000) / 1000, y: Math.round(a.pos.y * 1000) / 1000, alive: !isDead(a), bot: a.isBot, boss: a.isBoss, kills: a.killCount, deaths: a.deathCount,
        action: a.isActioning ? (a.currentIsSpecial ? 'special' : 'action') : 'none', grounded: a.grounded, facingLeft: a.facingLeft,
        respawnWait: (a.flags & StatusFlags.RespawnWait) !== 0, respawnTimer: Math.round(a.respawnTimer * 100) / 100,
        cooldownSpecial: Math.round(a.cooldownSpecial * 100) / 100, specialUnlocked: a.powerTypes.includes(38),
        healSpecial: !!(db.actions[a.specialRef] && db.actions[a.specialRef].type === 2 && db.actions[a.specialRef].damage < 0) })),
      events: { ...r.eventCounts }, stats: { ...this.stats }, local: me ? me.id : -1,
      hud: {
        respawnShown: this.hud.respawn.activeSelf, respawnText: this.hud.respawnTimer ? this.hud.respawnTimer.text : '',
        controlsAlpha: this.hud.controls ? this.hud.controls.alpha : 1, killFeedShown: this.hud.killsShown, bossBar: !!(this.hud.bossBarNode && this.hud.bossBarNode.activeSelf),
        specialButton: !!(this.hud.btn.specialButton && this.hud.btn.specialButton.activeSelf), lifeBars: this.hud.lifeBars.size,
        banner: this.hud.timeOutText.node.activeSelf ? this.hud.timeOutText.text : '', start: this.hud.startText.node.activeSelf ? this.hud.startText.text : '',
        bullets: this.bullets.map.size, fx: this.app.prefabs.fx.length,
      },
      stepMs: Math.round(r.stepMs * 1000) / 1000,
      controls: this.controlsCss(),
    };
  }

  // centres of the on-screen controls in CSS pixels (tests click them)
  controlsCss() {
    const e = this.engine, ui = e.ui, h = this.hud, c = e.canvas;
    const css = (n) => {
      if (!n || !n.activeInHierarchy || !n.r) return null;
      const r = ui.screenRect(n), k = c.getBoundingClientRect();
      const x = r[0] + r[2] / 2, y = r[1] + r[3] / 2;
      return [Math.round(k.left + x * k.width / c.width), Math.round(k.top + (c.height - y) * k.height / c.height)];
    };
    const btn = (type) => { const b = h.vbuttons.find((q) => q.type === type); return b ? css(b.node.children.find((ch) => ch.get('Image')) || b.node) : null; };
    return { joystick: h.joy ? css(h.joy.bg) : null, jump: btn(0), action: btn(1), special: btn(2) };
  }

  dispose() {
    const { engine, app } = this;
    for (const d of this.disposers) d();
    engine.hooks.update = engine.hooks.update.filter((f) => f !== this.upd);
    engine.hooks.late = engine.hooks.late.filter((f) => f !== this.late);
    engine.pointerHooks = [];
    engine.onAnimEvent = null;
    this.bullets.clear();
    app.prefabs.clear();
    for (const v of this.views) v.destroy();
    for (const r of [...this.mapInst.roots, ...this.gameInst.roots]) r.destroy();
    engine.cine = null;
    engine.post = null;
    app.audio.stopMusic();
  }
}
