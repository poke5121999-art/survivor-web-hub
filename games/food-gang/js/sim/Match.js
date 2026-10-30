// Entry point of the Food Gang match simulation (FG.Sim.Match, GAMEPLAY.md). One Match per running match on
// the host; the MatchState it creates is plain data the network layer can snapshot.
import { f, Vec2 } from './Core/Vec2.js';
import { createSimRng } from './Core/SimRng.js';
import { dotnetSort, compareNum } from './Core/DotnetSort.js';
import { GamePhase, GoalType, InputButtons, TeamConfig } from './Data/Enums.js';
import { InputFrame } from './State/InputFrame.js';
import { createMatchState, agentInSlot } from './State/MatchState.js';
import { createSimEvent, SimEventType } from './State/SimEvent.js';
import * as GameRules from './Systems/GameRules.js';
import * as Spawner from './Systems/Spawner.js';
import * as LifeSystem from './Systems/LifeSystem.js';
import * as MoveSystem from './Systems/MoveSystem.js';
import * as ActionSystem from './Systems/ActionSystem.js';
import * as BulletSystem from './Systems/BulletSystem.js';
import { think } from './Bot/BotBrain.js';
import { NavGraph } from './Bot/NavGraph.js';

const SEED_MULT = 0x2545F4914F6CDD1Dn;

/** Per-step context shared by the systems (GameDb, state, map, event sink). */
export class Ctx {
  constructor() {
    this.db = null;
    this.s = null;
    this.map = null;
    this.events = null;
    this.dt = 0;
    this.contacts = [];
    this.nav = new NavGraph();
  }

  get elapsed() { return f(this.s.tick * this.dt); }
  skinOf(a) { return this.db.skins[a.skin]; }
  act(i) { return i >= 0 && i < this.db.actions.length ? this.db.actions[i] : null; }
  agent(id) { return id >= 0 && id < this.s.agents.length ? this.s.agents[id] : null; }

  /** o: {agent, other, value, flag, i, pos, bullet, value2} (C# named arguments). */
  emit(type, o) {
    this.events.push(createSimEvent(type, this.s.tick, o));
  }
}

export class Match {
  constructor(db) {
    if (db == null) throw new Error('db is null');
    this.db = db;
    /** Events appended by create/step; the view drains (reads then clears) them. */
    this.events = [];
    this._ctx = new Ctx();
  }

  _bind(s) {
    const c = this._ctx;
    c.db = this.db;
    c.s = s;
    c.map = this.db.maps[s.mapIndex];
    c.events = this.events;
    c.dt = this.db.dt;
    return c;
  }

  get dt() { return this.db.dt; }

  /** setup: see State/MatchSetup.js createMatchSetup. */
  create(setup) {
    if (setup.mapIndex < 0 || setup.mapIndex >= this.db.maps.length) throw new Error('map index ' + setup.mapIndex + ' not in GameDb');
    if (setup.slots.length === 0 || setup.slots.length > 4) throw new Error('slot count ' + setup.slots.length + ' outside 1..4');
    if (setup.goal === GoalType.KillBoss && setup.teams !== TeamConfig.OneVersusThree) throw new Error('KillBoss needs TeamConfig.OneVersusThree');

    const s = createMatchState();
    s.seed = setup.seed | 0;
    s.rng = createSimRng(BigInt(setup.seed >>> 0) * SEED_MULT + 1n);
    s.mapIndex = setup.mapIndex;
    s.goal = setup.goal;
    s.teams = setup.teams;
    s.bossOnLeft = !!setup.bossOnLeft;
    s.isOffline = !!setup.isOffline;
    s.noTimer = !!setup.noTimer;
    s.botDifficultyInt = setup.botDifficultyInt;
    s.botNoMove = !!setup.botNoMove;
    s.botNoAction = !!setup.botNoAction;
    s.playerCount = setup.slots.length;
    s.phase = GamePhase.WaitingToStart;
    s.winnerSlot = -1;
    s.timerMax = setup.noTimer ? 0 : GameRules.goalRule(setup.goal).timerMax;
    const c = this._bind(s);

    const slots = dotnetSort(setup.slots.slice(), (a, b) => compareNum(a.slot, b.slot));
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i];
      if (sl.slot < 0 || sl.slot > 3) throw new Error('slot ' + sl.slot + ' outside 0..3');
      if (i > 0 && slots[i - 1].slot === sl.slot) throw new Error('slot ' + sl.slot + ' used twice');
      const team = GameRules.teamOfSlot(sl.slot, s.teams, s.bossOnLeft);
      if (sl.team !== 0 && sl.team !== team) throw new Error('slot ' + sl.slot + ' team ' + sl.team + ' differs from team ' + team + ' given by teams ' + s.teams);
      Spawner.spawnAgent(c, sl);
    }
    c.emit(SimEventType.AllPlayersSpawned);
    if (setup.startPlaying) Match.start(s);
    return s;
  }

  /** StartGameCommand: WaitingToStart -> Playing. */
  static start(s) {
    if (s.phase === GamePhase.WaitingToStart) s.phase = GamePhase.Playing;
  }

  /**
   * One tick in the spec's system order (§0.2): GameState, Input, AI, Life, Move, Action, Bullet.
   * perSlot[slot] is read for human agents; bots get their input from BotBrain inside the step.
   */
  step(s, perSlot) {
    const c = this._bind(s);
    if (perSlot == null) perSlot = [];
    s.tick++;

    GameRules.update(c);

    for (const a of s.agents) {
      if (a.isBot || a.isDummy) continue;
      const inp = (a.slot >= 0 && a.slot < perSlot.length && perSlot[a.slot]) || NONE;
      const pressed = (inp.pressed | (inp.down & ~a.prevButtons)) & 0xff;
      a.prevButtons = inp.down;
      if (s.phase !== GamePhase.Playing) continue;
      a.directionX = InputFrame.directionX(inp);
      a.jump = (pressed & InputButtons.Jump) !== 0;
      a.action = (pressed & InputButtons.Action) !== 0;
      a.actionHeld = (inp.down & InputButtons.Action) !== 0;
      a.special = (pressed & InputButtons.Special) !== 0;
      a.specialHeld = (inp.down & InputButtons.Special) !== 0;
    }

    for (const a of s.agents) if (a.isBot && a.bot != null) think(c, a);

    for (const a of s.agents) LifeSystem.update(c, a);
    for (const a of s.agents) MoveSystem.update(c, a);
    for (const a of s.agents) ActionSystem.update(c, a);
    BulletSystem.update(c);
  }

  /** Copies pending events into `into` and clears them. */
  drainEvents(into = []) {
    for (const e of this.events) into.push(e);
    this.events.length = 0;
    return into;
  }

  /** FoodGangPlayerSystem.OnPlayerDisconnected: the human's agent keeps its slot and becomes a bot. */
  convertToBot(s, slot) {
    const c = this._bind(s);
    const a = agentInSlot(s, slot);
    if (a == null || a.isBot) return;
    Spawner.makeDisconnectedBot(c, a);
  }

  /** DebugDamageCommand: ApplyDamage(target, source, amount) outside the tick (tests, cheats). Returns damage dealt. */
  debugDamage(s, targetId, amount, sourceId = -1) {
    const c = this._bind(s);
    return LifeSystem.applyDamage(c, c.agent(targetId), sourceId, f(amount), Vec2.zero(), false, 0, false);
  }

  static isSameTeam(s, a, b) { return GameRules.isSameTeam(s, a, b); }
}

const NONE = Object.freeze(InputFrame.none());
