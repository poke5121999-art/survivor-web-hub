// One online player without the game views: session -> runner -> fixed loop, with a scripted input source.
// Used by net.html (2D debug drawing on top) and test/food-gang-net.js (node, several players in one process).
import { createMatchSetup, addSlot, InputFrame, InputButtons, GamePhase, isDead } from '../sim/index.js';
import { MatchRunner, BotSource } from '../game/match/MatchRunner.js';
import { Online } from './online.js';

/** Wanders, jumps and attacks; `fixed` ({dirX, down}) overrides it (tests drive the client with it). */
export class ScriptedInput {
  constructor(seed = 1) {
    this.r = seed >>> 0 || 1;
    this.t = 0; this.dir = 1; this.down = 0; this.last = 0;
    this.fixed = null;
  }
  rnd() { this.r = (Math.imul(this.r, 1664525) + 1013904223) >>> 0; return this.r / 4294967296; }
  getInput() {
    let dir, down;
    if (this.fixed) { dir = this.fixed.dirX; down = this.fixed.down; }
    else {
      if (++this.t % 50 === 0) this.dir = this.rnd() < 0.5 ? -1 : 1;
      down = (this.rnd() < 0.04 ? InputButtons.Jump : 0) | (this.t % 30 < 12 ? InputButtons.Action : 0) | (this.rnd() < 0.01 ? InputButtons.Special : 0);
      dir = this.dir;
    }
    const f = InputFrame.make(dir, down, down & ~this.last);
    this.last = down;
    return f;
  }
}

export class DevPlayer {
  /** o: {db, profile, act: quick|create|join, code, request, config, input, short: seconds left once playing,
   *  autoReady, readyWhen: players in the room before this player calls setReady} */
  constructor(o) {
    Object.assign(this, { short: 0, input: new ScriptedInput(Date.now() & 0xffff) }, o);
    this.log = [];
    this.lobby = null;
    this.runner = null;
    this.role = null;
    this.ended = false;
    this.closed = null;
    this.error = null;
    this.events = {};
    this.startedAt = 0;
    this.positions = [];
  }

  begin() {
    const o = this;
    const backend = o.backend || null;
    const s = this.session = o.act === 'quick' ? Online.quickMatch({ profile: o.profile, request: o.request || null, backend })
      : o.act === 'create' ? Online.createPrivate({ profile: o.profile, config: o.config || null, backend })
        : Online.joinPrivate({ profile: o.profile, code: o.code, backend });
    s.on('lobby', (l) => { this.lobby = l; this.note(`lobby ${l.code} ${l.players.map((p) => p.name + (p.ready ? '*' : '')).join(',')} cd=${l.countdown}`); if (o.autoReady && o.act !== 'quick' && !this.readied && l.players.length >= (o.readyWhen || 1)) { this.readied = true; s.setReady(); } });
    s.on('error', (e) => { this.error = e; this.note(`error ${e.code}: ${e.message}`); });
    s.on('closed', (e) => { this.closed = e.reason; this.note(`closed ${e.reason}`); });
    s.on('drop', (d) => this.note(`slot ${d.slot} dropped (${d.why}) -> bot`));
    s.on('start', ({ request, runnerOptions }) => this.start(request, runnerOptions));
    return this;
  }

  note(m) { this.log.push(`${((typeof performance !== 'undefined' ? performance.now() : 0) / 1000).toFixed(1)} ${m}`); }

  start(req, net) {
    this.request = req;
    this.role = net ? net.role : 'offline';
    this.net = net;
    if (this.startHook) {
      // net.html ?render=game: MatchScene owns the runner and the loop
      this.startHook(req, net).then((r) => {
        this.runner = r;
        r.on((e) => { this.events[e.type] = (this.events[e.type] || 0) + 1; if (e.type === 16) { this.ended = true; this.endedAt = performance.now(); } });
        this.note(`start ${this.role} (game view) slot ${req.localSlot}`);
      }).catch((e) => { this.error = { code: 'view', message: String(e && e.stack || e) }; });
      return;
    }
    const setup = createMatchSetup({ seed: req.seed, mapIndex: req.mapIndex, goal: req.goal, teams: req.team, bossOnLeft: req.bossOnLeft,
      isOffline: req.isOffline !== false, botDifficultyInt: req.botDifficultyInt });
    for (const sl of req.slots) if (sl) addSlot(setup, sl.slot, sl.skinId, sl.level, sl.isBot, sl.isBot ? sl.botDifficulty : 0.5);
    const r = this.runner = net ? net.createRunner(this.db, setup, req.localSlot) : new MatchRunner(this.db, setup, req.localSlot);
    for (const a of r.state.agents) r.setSource(a.slot, a.isBot ? BotSource : (net && net.sourceFor(a.slot)) || this.input);
    r.on((e) => { this.events[e.type] = (this.events[e.type] || 0) + 1; if (e.type === 16) { this.ended = true; this.endedAt = performance.now(); } });
    r.flushCreateEvents();
    this.note(`start ${this.role} slot ${req.localSlot} humans ${req.online ? req.online.humans : 1} goal ${req.goal} team ${req.team} map ${req.mapIndex}`);
    // the game shows ~3.2 s of versus / READY before BATTLE!; keep that gap so both sides start like the real screens
    setTimeout(() => {
      r.start();
      this.startedAt = performance.now();
      if (this.short && this.role !== 'client') r.state.timerElapsed = Math.max(0, r.state.timerMax - this.short);
    }, 3200);
    let last = performance.now();
    this.loop = setInterval(() => {
      const t = performance.now();
      r.update(Math.min(0.25, (t - last) / 1000));
      last = t;
      const me = r.localAgent;
      if (me && this.positions.length < 4000) this.positions.push([Math.round(t), me.pos.x, me.pos.y]);
    }, 16);
  }

  stop() { clearInterval(this.loop); }

  info() {
    const r = this.runner;
    const s = r && r.state;
    const out = { role: this.role, ended: this.ended, closed: this.closed, error: this.error, lobby: this.lobby, log: this.log.slice(-30), events: this.events };
    if (!s) return out;
    out.tick = s.tick; out.phase = s.phase; out.localSlot = r.localSlot;
    out.killSlot = s.killSlot.slice(); out.deathSlot = s.deathSlot.slice(); out.winnerTeam = s.winnerTeam; out.winnerSlot = s.winnerSlot;
    out.agents = s.agents.map((a) => ({ slot: a.slot, bot: a.isBot, hp: Math.round(a.hpCurrent), x: +a.pos.x.toFixed(2), y: +a.pos.y.toFixed(2), dir: a.directionX, dead: isDead(a), kills: a.killCount, deaths: a.deathCount }));
    if (this.net && this.net.role === 'client') {
      const n = this.net.net;
      out.net = n.summary();
      out.lastEvent = n.lastEvent;
      const last = n.buffer.length ? n.buffer[n.buffer.length - 1].state : null;
      if (last) out.lastSnap = { tick: last.tick, phase: last.phase, killSlot: last.killSlot.slice(), deathSlot: last.deathSlot.slice(), winnerTeam: last.winnerTeam,
        hp: last.agents.map((a) => a.hpCurrent), bots: last.agents.map((a) => a.isBot) };
    }
    if (this.net && this.net.role === 'host') {
      out.net = { clients: this.net.net.clientStats(), snaps: this.net.net.stats };
      out.eventSeq = this.net.net.eventSeq;
      out.hp = s.agents.map((a) => a.hpCurrent);
    }
    out.outcome = this.outcome || null;
    out.over = s.phase === GamePhase.GameOver;
    return out;
  }
}
