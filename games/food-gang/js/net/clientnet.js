// Client side of a running online match: sends the local player's inputs (60 Hz samples, a packet every 2 ticks or at
// once on a press, each carrying the last REDUNDANCY frames) and turns SNAP packets into MatchState pictures played
// back ~100 ms behind the host clock estimate, so the views interpolate between two snapshots that already arrived.
import { cloneMatchState, SimEventType, GamePhase } from '../sim/index.js';
import { MSG, decodeSnapshot, applyCapture, encodeInput } from './codec.js';
import { SNAP_EVERY } from './hostnet.js';

const REDUNDANCY = 8;
const SEND_EVERY = 2;
const HISTORY = 64;
const TICK_MS = 1000 / 60;
// Interpolation delay in ticks: at least 6 (100 ms = 3 snapshot intervals, one lost snapshot still leaves a pair to
// interpolate), more when arrival jitter is high. Measured jitter on the relay sets the rest (test/food-gang-net.js).
const MIN_DELAY = 6, MAX_DELAY = 20;
const LEAD = SNAP_EVERY + 1;

const now = () => performance.now();
// latency samples: the last 3000 of each (~100 s at 30 Hz) are enough for percentiles
const keep = (a, v) => { a.push(v); if (a.length > 3000) a.splice(0, a.length - 3000); };

export class ClientMatchNet {
  constructor({ link, hostId, ownLead = true }) {
    this.ownLead = ownLead;
    this.link = link;
    this.hostId = hostId;
    this.template = null;
    this.bases = new Map();       // seq -> capture (delta bases)
    this.buffer = [];             // [{tick, state}] ascending
    this.ackSnap = 0;
    this.lastEvent = 0;
    this.eventQueue = [];         // events waiting for the render clock
    this.inputSeq = 0;
    this.sent = [];               // [{seq, f, t}] newest last
    this.sinceSend = 0;
    this.offset = null;           // host tick - local ms * 0.06
    this.jitter = 0;
    this.delay = MIN_DELAY;
    this.renderTick = 0;
    this.lastHeard = now();
    this.lost = false;
    this.ackInput = 0;
    this.latPending = [];         // inputs acked by the host, waiting to be rendered
    this.stats = { snaps: 0, bytes: 0, full: 0, resyncs: 0, holds: 0, frames: 0, rtt: [], inputAck: [], inputVisible: [], events: 0, dupEvents: 0, startedAt: 0 };
  }

  attach(runner) {
    this.runner = runner;
    this.template = cloneMatchState(runner.state);
    const me = runner.state.agents.find((a) => a.slot === runner.localSlot);
    this.localId = me ? me.id : -1;
  }

  onPacket(u8) {
    this.lastHeard = now();
    if (u8[0] !== MSG.SNAP || !this.template) return;
    const t = now();
    if (!this.stats.startedAt) this.stats.startedAt = t;
    this.stats.bytes += u8.length + 38;
    let d;
    try {
      d = decodeSnapshot(u8, (seq) => this.bases.get(seq));
    } catch (e) {
      if (e.message === 'base snapshot missing') { this.ackSnap = 0; this.stats.resyncs++; return; }
      throw e;
    }
    const { h, snap, events } = d;
    this.stats.snaps++;
    if (!h.baseSeq) this.stats.full++;
    this.bases.set(h.seq, snap);
    this.bases.delete(h.seq - HISTORY);
    if (h.seq > this.ackSnap) this.ackSnap = h.seq;
    // RTT from the echo of our last INPUT, minus how long the host held it
    if (h.echo) {
      const rtt = ((Math.round(t) & 0xffff) - h.echo - h.hold + 0x10000) & 0xffff;
      if (rtt < 5000) keep(this.stats.rtt, rtt);
    }
    // input latency: our frames the host has consumed by this tick
    if (h.ackInput > this.ackInput) {
      for (const s of this.sent) if (s.seq > this.ackInput && s.seq <= h.ackInput && s.t) {
        keep(this.stats.inputAck, t - s.t);
        this.latPending.push({ tick: h.tick, t: s.t });
      }
      this.ackInput = h.ackInput;
    }
    for (const x of events) {
      if (x.seq <= this.lastEvent) { this.stats.dupEvents++; continue; }
      this.lastEvent = x.seq;
      this.eventQueue.push(x.e);
      this.stats.events++;
    }
    // clock: host tick estimate as an average offset; jumps past 30 ticks (a stall) snap
    const sample = h.tick - t * 0.06;
    if (this.offset === null || Math.abs(sample - this.offset) > 30) { this.offset = sample; this.jitter = 0; }
    else {
      this.jitter += (Math.abs(sample - this.offset) - this.jitter) * 0.05;
      this.offset += (sample - this.offset) * 0.05;
    }
    this.delay = Math.max(MIN_DELAY, Math.min(MAX_DELAY, SNAP_EVERY * 1.5 + 4 * this.jitter));
    if (this.buffer.length && h.tick <= this.buffer[this.buffer.length - 1].tick) return;
    this.buffer.push({ tick: h.tick, state: applyCapture(cloneMatchState(this.template), snap) });
  }

  pushInput(f) {
    const t = now();
    this.sent.push({ seq: ++this.inputSeq, f, t });
    if (this.sent.length > 32) this.sent.shift();
    this.sinceSend++;
    // a press or a turn goes out at once; held input rides the 30 Hz packets
    const turned = f.encodedDirection !== this.lastDir;
    this.lastDir = f.encodedDirection;
    if (this.sinceSend >= SEND_EVERY || f.pressed || turned) this.flush();
  }

  flush() {
    if (this.lost) return;
    this.sinceSend = 0;
    const frames = [];
    for (let i = this.sent.length - 1; i >= 0 && frames.length < REDUNDANCY; i--) frames.push(this.sent[i]);
    this.link.send(this.hostId, encodeInput(this.ackSnap, Math.round(now()) & 0xffff, frames));
    this.lastSendAt = now();
  }

  /** Ack without input when no INPUT went out lately (match screen gone, tab stalled): the host is waiting on it. */
  ackNow() {
    if (this.lost || now() - (this.lastSendAt || 0) < 150 || this.ackSnap === this.lastAckSent) return;
    this.lastAckSent = this.ackSnap;
    this.link.send(this.hostId, encodeInput(this.ackSnap, Math.round(now()) & 0xffff, []));
    this.lastSendAt = now();
  }

  /** Picture for this frame: {prev, state, alpha, events} (events whose tick the render clock passed). */
  sample() {
    this.stats.frames++;
    if (this.offset === null || !this.buffer.length) return null;
    const t = now();
    const target = t * 0.06 + this.offset - this.delay;
    this.renderTick = Math.max(this.renderTick, target);
    const rt = this.renderTick;
    const buf = this.buffer;
    while (buf.length > 2 && buf[1].tick <= rt) buf.shift();
    let prev = buf[0], cur = buf[0], alpha = 1;
    if (buf.length > 1 && rt >= buf[0].tick) {
      cur = buf[1];
      alpha = Math.min(1, (rt - prev.tick) / (cur.tick - prev.tick));
      if (rt > cur.tick) this.stats.holds++;
    } else if (rt > buf[0].tick) this.stats.holds++;
    const events = [];
    while (this.eventQueue.length && this.eventQueue[0].tick <= Math.max(rt, prev.tick)) events.push(this.eventQueue.shift());
    let pic = { prev: prev.state, state: cur.state, alpha, leadAlpha: alpha, events };
    let seenTick = rt;
    if (this.ownLead && this.localId >= 0) {
      // own agent from the newest snapshots, LEAD ticks behind the host clock instead of `delay`: the player sees its
      // own input ~(delay - LEAD) sooner; everyone else stays on the smooth delayed playback
      const lt = this.leadTick = Math.max(this.leadTick || 0, rt, t * 0.06 + this.offset - LEAD);
      let j = buf.length - 1;
      while (j > 0 && buf[j].tick > lt) j--;
      const lp = buf[j], lc = buf[Math.min(j + 1, buf.length - 1)];
      const la = lc === lp ? 1 : Math.min(1, (lt - lp.tick) / (lc.tick - lp.tick));
      const id = this.localId;
      const st = { ...cur.state, agents: cur.state.agents.slice() };
      const pv = { ...prev.state, agents: prev.state.agents.slice() };
      st.agents[id] = lc.state.agents[id];
      pv.agents[id] = lp.state.agents[id];
      pic = { prev: pv, state: st, alpha, leadAlpha: la, events };
      seenTick = lt;
    }
    for (let i = 0; i < this.latPending.length;) {
      if (this.latPending[i].tick <= seenTick) { keep(this.stats.inputVisible, t - this.latPending[i].t); this.latPending.splice(i, 1); } else i++;
    }
    return pic;
  }

  /** The host is gone mid-match: freeze on the last picture and end it as a draw so the result screen still comes up. */
  hostLost() {
    this.lost = true;
    const last = this.buffer.length ? this.buffer[this.buffer.length - 1].state : null;
    if (!last || last.phase === GamePhase.GameOver) return null;
    const s = cloneMatchState(last);
    s.phase = GamePhase.GameOver;
    s.winnerTeam = 0; s.winnerSlot = -1;
    this.buffer = [{ tick: s.tick, state: s }];
    this.eventQueue.length = 0;
    return { type: SimEventType.GameOverTriggered, tick: s.tick, agent: -1, other: -1, bullet: -1, int: 0, value: 0, value2: 0, flag: false, pos: { x: 0, y: 0 } };
  }

  summary() {
    const secs = this.stats.startedAt ? (now() - this.stats.startedAt) / 1000 : 0;
    const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]); };
    const st = this.stats;
    return {
      downBps: secs ? Math.round(st.bytes / secs) : 0, upBps: secs ? Math.round(this.link.stats.tx / secs) : 0,
      snaps: st.snaps, full: st.full, resyncs: st.resyncs, events: st.events, dupEvents: st.dupEvents,
      holdPct: st.frames ? +(100 * st.holds / st.frames).toFixed(1) : 0, delayMs: Math.round(this.delay * TICK_MS), jitterMs: +(this.jitter * TICK_MS).toFixed(1),
      rtt: { p50: pct(st.rtt, 0.5), p95: pct(st.rtt, 0.95) },
      inputAck: { p50: pct(st.inputAck, 0.5), p95: pct(st.inputAck, 0.95), n: st.inputAck.length },
      inputVisible: { p50: pct(st.inputVisible, 0.5), p95: pct(st.inputVisible, 0.95), n: st.inputVisible.length },
    };
  }
}

