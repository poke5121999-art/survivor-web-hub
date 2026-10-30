// Owns the MatchState and the fixed 60 Hz stepping (FG.View.MatchRunner on the JS sim). Views only read `state` /
// `prev` (interpolate with `alpha`) and the SimEvents delivered through on(). Input comes per slot from a source
// with getInput(slot, tick): local keyboard/touch now, a network client later; bots are driven inside Match.step.
import { Match, GamePhase, InputFrame, agentInSlot, cloneMatchState } from '../../sim/index.js';

const MAX_STEPS_PER_FRAME = 40;
const NEUTRAL = Object.freeze(InputFrame.none());

export const BotSource = Object.freeze({ getInput: () => NEUTRAL });

export class MatchRunner {
  constructor(db, setup, localSlot) {
    this.db = db;
    this.match = new Match(db);
    this.localSlot = localSlot;
    this.timeScale = 1;
    this.running = false;
    this.alpha = 0;
    this.acc = 0;
    this.sources = [null, null, null, null];
    this.inputs = [NEUTRAL, NEUTRAL, NEUTRAL, NEUTRAL];
    this.listeners = [];
    this.eventCounts = {};
    this.stepMs = 0;
    this.state = this.match.create({ ...setup, startPlaying: false });
    this.prev = cloneMatchState(this.state);
    this.pending = this.match.drainEvents([]);
  }

  get dt() { return this.db.dt; }

  setSource(slot, src) { this.sources[slot] = src; }

  on(fn) { this.listeners.push(fn); return () => { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }; }

  // events raised by create() (AllPlayersSpawned, BossSpawned) go out once the views subscribed
  flushCreateEvents() { const ev = this.pending; this.pending = []; this.dispatch(ev); }

  start() {
    Match.start(this.state);
    this.running = true;
    this.acc = 0;
  }

  update(realDt) {
    if (!this.running) return 0;
    const dt = this.dt;
    this.acc += realDt * this.timeScale;
    let n = Math.floor(this.acc / dt);
    if (n > MAX_STEPS_PER_FRAME) { n = MAX_STEPS_PER_FRAME; this.acc = n * dt; }
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      if (i === n - 1) this.prev = cloneMatchState(this.state);
      const tick = this.state.tick + 1;
      for (let s = 0; s < 4; s++) this.inputs[s] = this.sources[s] ? this.sources[s].getInput(s, tick) : NEUTRAL;
      this.match.step(this.state, this.inputs);
      this.acc -= dt;
      this.dispatch(this.match.drainEvents([]));
    }
    if (n) this.stepMs = (performance.now() - t0) / n;
    this.alpha = Math.max(0, Math.min(1, this.acc / dt));
    return n;
  }

  dispatch(list) {
    for (const e of list) {
      this.eventCounts[e.type] = (this.eventCounts[e.type] || 0) + 1;
      for (const f of this.listeners.slice()) {
        try { f(e); } catch (err) { console.error(err); }
      }
    }
  }

  // ---- read helpers shared by the views

  get localAgent() { return agentInSlot(this.state, this.localSlot); }
  get gameOver() { return this.state.phase === GamePhase.GameOver; }
  get timerRemaining() { return Math.max(0, this.state.timerMax - this.state.timerElapsed); }

  agent(id) { return id >= 0 && id < this.state.agents.length ? this.state.agents[id] : null; }

  // interpolated agent position; snaps on respawn teleports (> 3 units in one tick)
  agentPos(id, out = [0, 0, 0]) {
    const cur = this.state.agents[id].pos;
    const p = this.prev && this.prev.agents[id] ? this.prev.agents[id].pos : cur;
    const dx = cur.x - p.x, dy = cur.y - p.y;
    if (dx * dx + dy * dy > 9) { out[0] = cur.x; out[1] = cur.y; }
    else { out[0] = p.x + dx * this.alpha; out[1] = p.y + dy * this.alpha; }
    out[2] = 0;
    return out;
  }

  findBullet(s, id) {
    if (!s) return null;
    for (const b of s.bullets) if (b.id === id) return b;
    return null;
  }

  isAlly(a) {
    const me = this.localAgent;
    return !!(me && a && a.team === me.team);
  }
}
