// MatchRunner for an online client: same surface the views read (state, prev, alpha, on, agentPos, findBullet...), but
// state comes from the host's snapshots (js/net/clientnet.js) instead of a local sim step. The local slot's source is
// still sampled at 60 Hz; its frames go to the host instead of into a Match.
import { Match, GamePhase, InputFrame, agentInSlot, cloneMatchState } from '../../sim/index.js';

const NEUTRAL = Object.freeze(InputFrame.none());

export class ClientRunner {
  constructor(db, setup, localSlot, net) {
    this.db = db;
    this.match = new Match(db);
    this.localSlot = localSlot;
    this.timeScale = 1;
    this.running = false;
    this.alpha = 0;
    this.leadAlpha = 0;
    this.acc = 0;
    this.sources = [null, null, null, null];
    this.listeners = [];
    this.eventCounts = {};
    this.stepMs = 0;
    this.isClient = true;
    // the same create() as the host: static agent fields (skin, team, slot, refs) come from here, never from the wire
    this.state = this.match.create({ ...setup, startPlaying: false });
    this.prev = cloneMatchState(this.state);
    this.pending = this.match.drainEvents([]);
    this.net = net;
    net.attach(this);
  }

  get dt() { return this.db.dt; }

  setSource(slot, src) { this.sources[slot] = src; }

  on(fn) { this.listeners.push(fn); return () => { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }; }

  flushCreateEvents() { const ev = this.pending; this.pending = []; this.dispatch(ev); }

  start() { this.running = true; this.acc = 0; this.lastWall = performance.now(); }

  // realDt is ignored: input frames follow performance.now(), so the engine frame and the hidden-tab driver
  // (js/net/driver.js) can both call update() without sampling the same interval twice
  update() {
    const t = performance.now();
    const realDt = this.lastWall ? (t - this.lastWall) / 1000 : 0;
    this.lastWall = t;
    let n = 0;
    if (this.running && !this.net.lost) {
      const src = this.sources[this.localSlot];
      this.acc += realDt;
      n = Math.floor(this.acc / this.dt);
      if (n > 10) { n = 10; this.acc = n * this.dt; }
      for (let i = 0; i < n; i++) {
        this.net.pushInput(src ? src.getInput(this.localSlot, 0) : NEUTRAL);
        this.acc -= this.dt;
      }
    }
    const pic = this.net.sample();
    if (pic) {
      this.prev = pic.prev;
      this.state = pic.state;
      this.alpha = pic.alpha;
      this.leadAlpha = pic.leadAlpha;
      this.dispatch(pic.events);
    }
    return n;
  }

  /** Host gone: end on the last picture (a draw) unless the match already ended. */
  hostLost() {
    const e = this.net.hostLost();
    if (!e) return;
    this.prev = this.state = this.net.buffer[0].state;
    this.alpha = 1;
    this.dispatch([e]);
  }

  dispatch(list) {
    for (const e of list) {
      this.eventCounts[e.type] = (this.eventCounts[e.type] || 0) + 1;
      for (const f of this.listeners.slice()) {
        try { f(e); } catch (err) { console.error(err); }
      }
    }
  }

  get localAgent() { return agentInSlot(this.state, this.localSlot); }
  get gameOver() { return this.state.phase === GamePhase.GameOver; }
  get timerRemaining() { return Math.max(0, this.state.timerMax - this.state.timerElapsed); }

  agent(id) { return id >= 0 && id < this.state.agents.length ? this.state.agents[id] : null; }

  agentPos(id, out = [0, 0, 0]) {
    const cur = this.state.agents[id].pos;
    const p = this.prev && this.prev.agents[id] ? this.prev.agents[id].pos : cur;
    const dx = cur.x - p.x, dy = cur.y - p.y;
    // the local agent may be drawn from newer snapshots than the rest (clientnet.js ownLead)
    const k = this.state.agents[id].slot === this.localSlot ? this.leadAlpha : this.alpha;
    if (dx * dx + dy * dy > 9) { out[0] = cur.x; out[1] = cur.y; }
    else { out[0] = p.x + dx * k; out[1] = p.y + dy * k; }
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
