// Host side of a running online match. The host's MatchRunner steps the sim at 60 Hz; each remote human's slot reads
// a NetInputSource fed by that client's INPUT packets, and every SNAP_EVERY ticks each client gets a SNAP: state as a
// delta against the last snapshot it acked, plus every sim event it has not acked yet (events ride until acked).
import { InputFrame } from '../sim/index.js';
import { BotSource } from '../game/match/MatchRunner.js';
import { MSG, capture, encodeSnapshot, decodeInput } from './codec.js';

export const SNAP_EVERY = 2;        // 30 Hz
const HISTORY = 64;                 // snapshots kept as delta bases (~2 s)
const EVENT_LOG = 2048;
// Input buffer: a client sends every 2 ticks, so 1..2 queued frames is steady state. Each starved tick leaves the queue
// one frame later for good, so once per WINDOW ticks the frames that were never needed (the smallest depth seen,
// minus one spare) are skipped, their press edges kept. Past MAX_DEPTH (a burst after a stall) it trims at once.
const WINDOW = 120;
const MAX_DEPTH = 8;
// no step for IDLE_AFTER ms = the sim stopped; unacked events are then resent every IDLE_RESEND ms
const IDLE_AFTER = 150;
const IDLE_RESEND = 100;
const TRIM_TO = 3;

const now = () => performance.now();

export class NetInputSource {
  constructor() {
    this.queue = new Map();
    this.next = 0;            // next sequence to consume (0 = nothing received yet)
    this.high = 0;
    this.last = InputFrame.none();
    this.carry = 0;
    this.consumed = 0;
    this.stats = { frames: 0, starved: 0, skipped: 0, depthSum: 0, depthN: 0 };
    this.minDepth = Infinity;
    this.window = 0;
  }

  skipTo(to) {
    for (; this.next < to; this.next++) {
      const f = this.queue.get(this.next);
      if (f) { this.carry |= f.pressed; this.queue.delete(this.next); this.stats.skipped++; }
    }
  }

  receive(frames) {
    for (const { seq, f } of frames) {
      if (seq < 1 || (this.next && seq < this.next) || this.queue.has(seq)) continue;
      this.queue.set(seq, f);
      if (seq > this.high) this.high = seq;
      if (!this.next) this.next = seq;
    }
  }

  getInput() {
    if (!this.next) return this.last;
    let depth = this.high - this.next + 1;
    this.stats.depthSum += Math.max(0, depth); this.stats.depthN++;
    if (depth > MAX_DEPTH) {
      this.skipTo(this.high - TRIM_TO + 1);
      depth = TRIM_TO;
    }
    if (depth < this.minDepth) this.minDepth = depth;
    if (++this.window >= WINDOW) {
      if (this.minDepth >= 2 && this.minDepth !== Infinity) { this.skipTo(this.next + this.minDepth - 1); depth -= this.minDepth - 1; }
      this.window = 0;
      this.minDepth = Infinity;
    }
    let f = this.queue.get(this.next);
    if (!f && depth > 1) {
      // a hole: the frame was lost with every redundant copy; jump to the next one that arrived
      while (!f && this.next < this.high) { this.next++; f = this.queue.get(this.next); }
    }
    if (!f) {
      this.stats.starved++;
      return { encodedDirection: this.last.encodedDirection, down: this.last.down, pressed: 0 };
    }
    this.queue.delete(this.next);
    this.consumed = this.next++;
    this.stats.frames++;
    const out = { encodedDirection: f.encodedDirection, down: f.down, pressed: f.pressed | this.carry };
    this.carry = 0;
    this.last = f;
    return out;
  }
}

export class HostMatchNet {
  constructor({ link }) {
    this.link = link;
    this.clients = new Map();     // relay id -> client
    this.history = new Map();     // seq -> {cap, lastEvent}
    this.seq = 0;
    this.events = [];             // [{seq, e}]
    this.eventSeq = 0;
    this.runner = null;
    this.onDrop = () => {};
    this.stats = { snaps: 0, bytes: 0, full: 0, fullBytes: 0, deltaBytes: 0, deltas: 0, startedAt: 0 };
  }

  addClient(id, slot) {
    const src = new NetInputSource();
    // sentEvents: snapshot seq -> last event seq it carried, so an ack of that snapshot acks those events
    this.clients.set(id, { id, slot, src, ackSnap: 0, evAcked: 0, sentEvents: new Map(), echo: 0, echoAt: 0, heard: now(), bytes: 0, inBytes: 0, gone: false });
    return src;
  }

  attach(runner) {
    this.runner = runner;
    runner.onStep = (events) => this.onStep(runner.state, events);
  }

  onInput(from, u8) {
    const c = this.clients.get(from);
    if (!c || c.gone) return;
    c.heard = now();
    c.inBytes += u8.length + 38;
    const m = decodeInput(u8);
    if (m.ackSnap > c.ackSnap) {
      c.ackSnap = m.ackSnap;
      const e = c.sentEvents.get(m.ackSnap);
      if (e !== undefined && e > c.evAcked) c.evAcked = e;
    } else if (m.ackSnap === 0 && c.ackSnap) {
      c.ackSnap = 0;   // the client lost its base: next snapshot goes out full
    }
    c.echo = m.echo; c.echoAt = now();
    c.src.receive(m.frames);
  }

  onStep(s, events) {
    for (const e of events) {
      this.events.push({ seq: ++this.eventSeq, e });
    }
    if (this.events.length > EVENT_LOG) this.events.splice(0, this.events.length - EVENT_LOG);
    this.lastStepAt = now();
    if (this.closing || s.tick % SNAP_EVERY !== 0) return;
    if (!this.stats.startedAt) this.stats.startedAt = now();
    this.lastCap = capture(s);
    this.capSeq = this.send(this.lastCap, () => true);
  }

  // One snapshot of `cap` to every client `want(c)` accepts, as a delta against what that client acked.
  send(cap, want) {
    const seq = ++this.seq;
    const t = now();
    for (const c of this.clients.values()) {
      if (c.gone || !want(c)) continue;
      const base = c.ackSnap && this.history.get(c.ackSnap);
      const firstIdx = this.events.findIndex((x) => x.seq > c.evAcked);
      const pending = firstIdx < 0 ? [] : this.events.slice(firstIdx);
      const { bytes, lastEvent } = encodeSnapshot({ seq, baseSeq: c.ackSnap, ackInput: c.src.consumed,
        echo: c.echo, hold: Math.min(65535, Math.round(t - c.echoAt)) }, cap, base ? base.cap : null, pending);
      this.link.send(c.id, bytes);
      c.bytes += bytes.length + 38;
      this.stats.snaps++; this.stats.bytes += bytes.length;
      if (base) { this.stats.deltas++; this.stats.deltaBytes += bytes.length; } else { this.stats.full++; this.stats.fullBytes += bytes.length; }
      c.sentEvents.set(seq, lastEvent);
      c.sentEvents.delete(seq - HISTORY);
    }
    this.history.set(seq, { cap });
    this.history.delete(seq - HISTORY);
    return seq;
  }

  /** Clients still missing sim events (or the latest state) the host has produced. */
  unacked() {
    return [...this.clients.values()].filter((c) => !c.gone && (c.evAcked < this.eventSeq || c.ackSnap < (this.capSeq || 0)));
  }

  /**
   * The sim is not stepping (match screen gone, page stalled, host leaving): resend the last state with every event a
   * client has not acked, at most every IDLE_RESEND ms, so a game over raised just before the host stopped still
   * reaches everyone. Returns how many clients are still behind.
   */
  flushIdle() {
    const t = now();
    const idle = this.closing || t - (this.lastStepAt || 0) >= IDLE_AFTER;
    if (!this.lastCap || !idle || t - (this.lastIdleSend || 0) < IDLE_RESEND) return this.unacked().length;
    const behind = new Set(this.unacked());
    if (behind.size) { this.lastIdleSend = t; this.send(this.lastCap, (c) => behind.has(c)); this.stats.idleSends = (this.stats.idleSends || 0) + 1; }
    return behind.size;
  }

  /** Last event seq whose tick is <= tick (what a client holding the snapshot of that tick must have received). */
  eventsThrough(tick) {
    for (let i = this.events.length - 1; i >= 0; i--) if (this.events[i].e.tick <= tick) return this.events[i].seq;
    return 0;
  }

  /** Client gone (bye or silence): FoodGangPlayerSystem.OnPlayerDisconnected turns its agent into a bot. */
  dropClient(id, why) {
    const c = this.clients.get(id);
    if (!c || c.gone) return;
    c.gone = true;
    if (this.runner) {
      this.runner.match.convertToBot(this.runner.state, c.slot);
      this.runner.setSource(c.slot, BotSource);
    }
    this.onDrop(c.slot, why);
  }

  clientStats() {
    const secs = this.stats.startedAt ? (now() - this.stats.startedAt) / 1000 : 0;
    return [...this.clients.values()].map((c) => ({
      slot: c.slot, gone: c.gone, downBps: secs ? Math.round(c.bytes / secs) : 0, upBps: secs ? Math.round(c.inBytes / secs) : 0,
      input: { ...c.src.stats, avgDepth: c.src.stats.depthN ? +(c.src.stats.depthSum / c.src.stats.depthN).toFixed(2) : 0 },
    }));
  }
}
