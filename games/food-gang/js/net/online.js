// Online Food Gang: quick match (real players, bots fill the rest when the lobby timer runs out) and private battles by
// code, over Unity Lobby + Relay from plain JS. The host's browser runs the sim; clients send inputs and play back
// snapshots (codec.js, hostnet.js, clientnet.js).
//
//   const s = Online.quickMatch({ profile, request });    // request: MetaService.buildMatchRequest(...).request
//   const s = Online.createPrivate({ profile, config });  // config: CustomMatchOptions {modeIndex, mapIndex, difficultyInt}
//   const s = Online.joinPrivate({ profile, code });
//   s.on('lobby', ({ players, code, countdown, config }) => ...)
//   s.on('start', ({ request, runnerOptions }) => matchScene.load(request, { runnerOptions }))
//   s.on('error', ({ code, message }) => ...);  s.on('closed', ({ reason }) => ...)
//     error codes: badcode, full, started, version, busy (UGS rate limit), network, timeout, host-left, server
//     closed reasons: left, error, host-left (mid-match: the client runner already ended the match as a draw)
//   'start' runnerOptions: null = offline match (alone when the quick lobby timer ran out), else
//     { role: 'host'|'client', localSlot, net, sourceFor(slot), createRunner(db, setup, localSlot) } for MatchScene.load
//   extras: s.setConfig(config) (private host), s.on('drop', {slot, why}) (host: a client left, its agent is a bot now)
//   s.players: [{ name, skin, level, isHost, ready }], s.code, s.setReady(), s.leave()
//
// Rules from QuantumMatchmaker (D:\foodgang-ref\META.md §12-13):
//   quick: rooms of the same skill bracket clamp((skinLevel - 1) / 5, 0, 3); the lobby closes at 9 s (BotFillAt) and the
//   match starts at 10 s (LobbyDuration); a full room jumps to 9 s; alone at 10 s = offline match against bots.
//   Guests give up after 15 s without a start (+5 s GUEST_LAUNCH_MARGIN). Slots follow ComputeSlotRemap(seed) in join
//   order, bots keep the host's levels and aggressivity.
//   private: the host's CustomMatchOptions, bot levels from the players' average level, start needs >= 2 players
//   (here: every player called setReady()). No trophies / stars / difficulty change (isFriendRoom).
import { MatchRequest, MatchSlot, CustomMatchOptions, MetaDb, MetaService, MetaRng, Profile, TeamConfig } from '../meta/index.js';
import { slotRemap, teamForSlot } from '../meta/matchmaking.js';
import { MatchRunner } from '../game/match/MatchRunner.js';
import { ClientRunner } from '../game/match/ClientRunner.js';
import { MSG, PROTOCOL, CtrlFramer } from './codec.js';
import { HostMatchNet } from './hostnet.js';
import { ClientMatchNet } from './clientnet.js';
import { ugsBackend, loopBackend, lossy } from './transport.js';
import { keepAlive } from './driver.js';
import { GamePhase } from '../sim/index.js';

const LOBBY_DURATION = 10;
const BOT_FILL_AT = 9;
const GUEST_WATCHDOG = 20;
const KEEPALIVE = 1;
const PEER_TIMEOUT_LOBBY = 8;     // the relay does not forward a client's DISCONNECT (mini-mart-coop README)
const PEER_TIMEOUT_MATCH = 3;     // inputs arrive 30 times a second in a match
const HOST_TIMEOUT = 5;
const MERGE_POLL = 3;
const LINGER = 4;                 // host leaving: longest wait for clients to ack the final events

const now = () => performance.now();
const settings = { backend: null, meta: null, impair: null, ownLead: true, driver: true };

function query(k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } }

function backend() {
  if (!settings.backend) settings.backend = query('net') === 'loop' ? loopBackend() : ugsBackend({ region: query('region') || null });
  return settings.backend;
}

let metaPromise = null;
function loadMeta() {
  if (settings.meta) return Promise.resolve(settings.meta);
  if (!metaPromise) {
    metaPromise = fetch(new URL('../../data/metadata.json', import.meta.url)).then((r) => {
      if (!r.ok) throw new Error(`metadata.json: HTTP ${r.status}`);
      return r.text();
    }).then((t) => (settings.meta = new MetaService(MetaDb.load(t))));
  }
  return metaPromise;
}

function playerInfo(profile) {
  const skin = profile.skinSelected || 1;
  return { name: String(profile.name || 'Player').slice(0, 16), skin, level: Math.max(1, Profile.level(profile, skin)) };
}
const bracketOf = (level) => Math.max(0, Math.min(3, Math.floor((level - 1) / 5)));

function errorCode(e) {
  const st = e && e.status;
  const msg = String(e && e.message || e);
  // Lobby answers a malformed code with 400 16010 ("contains an invalid character"), an unknown one with 404
  if (st === 404 || /not found/i.test(msg) || (st === 400 && /lobby code/i.test(msg))) return 'badcode';
  if (st === 429) return 'busy';
  if (st === 409 || /full/i.test(msg)) return 'full';
  if (/locked|started/i.test(msg)) return 'started';
  if (st === 0 || /timed out|websocket/i.test(msg)) return 'network';
  return 'server';
}

const plainRequest = (r) => ({ ...r, slots: r.slots.map((s) => (s ? { ...s } : null)) });

/** The host's request seen from `slot`: local slot, ally flags of the bots. */
function requestFor(json, slot) {
  const r = new MatchRequest({ ...json, slots: json.slots.map((s) => (s ? new MatchSlot(s) : null)) });
  r.localSlot = slot;
  const me = r.slots[slot];
  for (const s of r.slots) if (s && s.isBot) s.isAlly = r.team !== TeamConfig.FreeForAll && !!me && s.team === me.team;
  return r;
}

class Session {
  constructor(kind, profile, b = null) {
    this.backend = b || backend();
    this.kind = kind;
    this.profile = profile;
    this.me = playerInfo(profile);
    this.players = [];
    this.code = '';
    this.isHost = false;
    this.state = 'connecting';
    this.countdown = null;
    this.config = null;
    this.handlers = {};
    this.role = null;
    this.attempts = 0;
    this.onPageHide = () => this.leave(true);
    if (typeof addEventListener === 'function') addEventListener('pagehide', this.onPageHide);
  }

  on(ev, fn) { (this.handlers[ev] || (this.handlers[ev] = [])).push(fn); return this; }

  emit(ev, data) {
    for (const f of (this.handlers[ev] || []).slice()) {
      try { f(data); } catch (e) { console.error(e); }
    }
  }

  lobbyInfo() {
    return { kind: this.kind, code: this.code, isHost: this.isHost, players: this.players, countdown: this.countdown, config: this.config };
  }

  fail(e, code = null) {
    if (this.state === 'closed') return;
    const message = String(e && e.message || e);
    console.warn('[online]', message);
    this.emit('error', { code: code || errorCode(e), message });
    this.close('error');
  }

  close(reason) {
    if (this.state === 'closed') return;
    this.state = 'closed';
    if (this.role) this.role.dispose(reason);
    if (typeof removeEventListener === 'function') removeEventListener('pagehide', this.onPageHide);
    this.emit('closed', { reason });
  }

  setReady(ready = true) {
    this.wantReady = !!ready;
    if (this.role) this.role.setReady(!!ready);
  }

  /** Private host: new CustomMatchOptions for the room (mode / map / difficulty). */
  setConfig(config) { if (this.role && this.isHost) this.role.setConfig(config); }

  leave(keepalive = false) {
    if (this.role) this.role.leave(keepalive);
    this.close('left');
  }

  async run(fn) {
    try { await fn(); } catch (e) { this.fail(e); }
  }

  // ---- flows

  async quick(request, joinId = null) {
    const b = this.backend;
    const bracket = bracketOf(this.me.level);
    if (++this.attempts > 4) throw new Error('matchmaking gave up after 4 rooms');
    const ids = joinId ? [{ id: joinId }] : await b.findRooms({ bracket, protocol: PROTOCOL }).catch(() => []);
    for (const r of ids) {
      if (this.state === 'closed') return;
      let joined = null;
      try { joined = await b.joinRoom({ id: r.id, name: this.me.name }); } catch (e) { continue; }
      if (this.state === 'closed') { joined.link.close(); joined.leave(); return; }
      this.role = new GuestRole(this, joined, () => this.run(() => this.quick(request)));
      return;
    }
    if (this.state === 'closed') return;
    const room = await b.hostRoom({ isPrivate: false, bracket, protocol: PROTOCOL, hostName: this.me.name });
    if (this.state === 'closed') { room.close(); return; }
    this.role = new HostRole(this, room, { request, onMerge: (id) => this.run(() => this.quick(request, id)) });
  }

  async hostPrivate(config) {
    const b = this.backend;
    await loadMeta();
    this.config = { ...new CustomMatchOptions(), ...(config || {}) };
    const room = await b.hostRoom({ isPrivate: true, bracket: bracketOf(this.me.level), protocol: PROTOCOL, hostName: this.me.name });
    if (this.state === 'closed') { room.close(); return; }
    this.role = new HostRole(this, room, {});
  }

  async joinPrivate(code) {
    const c = String(code || '').trim().toUpperCase();
    if (!c) throw Object.assign(new Error('enter a room code'), { status: 404 });
    const joined = await this.backend.joinRoom({ code: c, name: this.me.name });
    if (this.state === 'closed') { joined.link.close(); joined.leave(); return; }
    this.role = new GuestRole(this, joined, null);
  }
}

class Role {
  constructor(session, link) {
    this.s = session;
    this.framer = new CtrlFramer();
    this.link = settings.impair ? lossy(link, settings.impair) : link;
    this.timers = [];
    this.disposed = false;
  }

  send(to, msg) { for (const f of this.framer.pack(msg)) this.link.send(to, f); }

  every(sec, fn) { this.timers.push(setInterval(fn, sec * 1000)); }

  /** Hidden tab: the worker tick steps the runner (wall clock) instead of the stopped engine loop (driver.js). */
  drive(runner, each) {
    this.stopDrive();
    if (settings.driver === false) return;
    let overAt = 0;
    this.stopDriver = keepAlive((hidden) => {
      if (hidden) runner.update(0);
      each();
      // a finished match nobody left: stop once it has been over for a while
      if (runner.state.phase === GamePhase.GameOver) {
        if (!overAt) overAt = now();
        else if (now() - overAt > 15000) this.stopDrive();
      }
    });
  }

  stopDrive() { if (this.stopDriver) { this.stopDriver(); this.stopDriver = null; } }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const t of this.timers) clearInterval(t);
  }
}

class HostRole extends Role {
  constructor(session, room, { request = null, onMerge = null }) {
    super(session, room.link);
    const s = session;
    this.room = room;
    this.request = request;
    this.onMerge = onMerge;
    this.peers = new Map();       // relay id -> {name, skin, level, ready, uid, heard, order}
    this.joins = 0;
    this.t0 = now();
    this.filled = false;
    this.launched = false;
    this.lastPoll = 0;
    this.net = null;
    s.isHost = true;
    s.code = room.code;
    s.state = 'lobby';
    this.link.onMessage = (from, u8) => this.onMessage(from, u8);
    this.link.onClose = (why) => { if (!this.disposed) s.fail(new Error(`relay closed: ${why}`), 'network'); };
    this.every(0.25, () => this.tick());
    this.updatePlayers();
  }

  players() {
    const list = [{ name: this.s.me.name, skin: this.s.me.skin, level: this.s.me.level, isHost: true, ready: this.s.kind === 'quick' || !!this.s.wantReady }];
    for (const p of [...this.peers.values()].sort((a, b) => a.order - b.order)) {
      list.push({ name: p.name, skin: p.skin, level: p.level, isHost: false, ready: this.s.kind === 'quick' || p.ready, connected: !p.gone });
    }
    return list;
  }

  updatePlayers() {
    const s = this.s;
    s.players = this.players();
    const msg = { t: 'roster', players: s.players, countdown: s.countdown, config: s.config, code: s.code, kind: s.kind };
    for (const id of this.peers.keys()) if (!this.peers.get(id).gone) this.send(id, msg);
    if (!this.launched) s.emit('lobby', s.lobbyInfo());
  }

  onMessage(from, u8) {
    const p = this.peers.get(from);
    if (p) p.heard = now();
    if (u8[0] === MSG.INPUT) { if (this.net) this.net.onInput(from, u8); return; }
    if (u8[0] !== MSG.CTRL) return;
    const m = this.framer.unpack(from, u8);
    if (!m) return;
    if (m.t === 'hello') this.hello(from, m);
    else if (!p) return;
    else if (m.t === 'ready') { p.ready = !!m.ready; this.updatePlayers(); this.maybeStartPrivate(); }
    else if (m.t === 'bye') this.removePeer(from, 'left');
  }

  hello(from, m) {
    if (this.peers.has(from)) { this.send(from, { t: 'welcome' }); this.updatePlayers(); return; }
    if (m.v !== PROTOCOL) { this.send(from, { t: 'kick', why: 'version' }); return; }
    if (this.launched || this.filled) { this.send(from, { t: 'kick', why: 'started' }); return; }
    if (this.peers.size >= 3) { this.send(from, { t: 'kick', why: 'full' }); return; }
    this.peers.set(from, { name: String(m.name || 'Player').slice(0, 16), skin: m.skin | 0 || 1, level: Math.max(1, m.level | 0),
      ready: false, uid: m.uid || null, heard: now(), order: ++this.joins, gone: false });
    this.send(from, { t: 'welcome' });
    this.updatePlayers();
  }

  removePeer(id, why) {
    const p = this.peers.get(id);
    if (!p || p.gone) return;
    if (this.launched) {
      p.gone = true;
      if (this.net) this.net.dropClient(id, why);
      this.s.players = this.players();
      this.s.emit('lobby', { ...this.s.lobbyInfo(), dropped: p.name, why });
      return;
    }
    this.peers.delete(id);
    this.link.drop(id);
    this.room.free(p.uid);
    this.updatePlayers();
  }

  setReady() { this.updatePlayers(); this.maybeStartPrivate(); }

  setConfig(config) {
    if (this.launched || this.s.kind !== 'private') return;
    this.s.config = { ...this.s.config, ...config };
    this.updatePlayers();
  }

  maybeStartPrivate() {
    if (this.s.kind !== 'private' || this.launched || !this.s.wantReady || this.peers.size < 1) return;
    for (const p of this.peers.values()) if (!p.ready) return;
    this.launch().catch((e) => this.s.fail(e));
  }

  tick() {
    if (this.disposed) return;
    const t = now();
    if (this.net) this.net.flushIdle();
    if (!this.lastKa || t - this.lastKa >= KEEPALIVE * 1000) {
      this.lastKa = t;
      for (const [id, p] of this.peers) if (!p.gone) this.send(id, { t: 'ka' });
    }
    const limit = (this.launched ? PEER_TIMEOUT_MATCH : PEER_TIMEOUT_LOBBY) * 1000;
    for (const [id, p] of this.peers) if (!p.gone && t - p.heard > limit) this.removePeer(id, 'timeout');
    if (this.s.kind !== 'quick' || this.launched) return;
    if (this.peers.size >= 3 && t - this.t0 < BOT_FILL_AT * 1000) this.t0 = t - BOT_FILL_AT * 1000;
    const el = (t - this.t0) / 1000;
    const cd = Math.max(0, Math.ceil(LOBBY_DURATION - el));
    if (cd !== this.s.countdown) { this.s.countdown = cd; this.updatePlayers(); }
    if (!this.filled && el >= BOT_FILL_AT) { this.filled = true; this.room.lock(); }
    if (el >= LOBBY_DURATION) { this.launched = true; this.launch().catch((e) => this.s.fail(e)); return; }
    // two players who both found no room host one each; the newer room folds into the older one
    if (this.onMerge && !this.peers.size && el < BOT_FILL_AT - 2 && t - this.lastPoll > MERGE_POLL * 1000 && !this.polling) {
      this.lastPoll = t;
      this.polling = true;
      this.s.backend.findRooms({ bracket: bracketOf(this.s.me.level), protocol: PROTOCOL }).then((rows) => {
        this.polling = false;
        const older = rows.find((r) => r.id !== this.room.id && r.created < this.room.created);
        if (!older || this.peers.size || this.launched || this.disposed) return;
        this.dispose('merge');
        this.onMerge(older.id);
      }).catch(() => { this.polling = false; });
    }
  }

  async buildRequest() {
    const s = this.s;
    let req;
    const humans = [...this.peers.entries()].filter(([, p]) => !p.gone).sort((a, b) => a[1].order - b[1].order);
    if (s.kind === 'quick') {
      req = requestFor(plainRequest(this.request || (await this.offlineRequest())), this.request ? this.request.localSlot : 0);
    } else {
      const meta = await loadMeta();
      const rng = new MetaRng(Date.now() & 0x7fffffff);
      const r = meta.buildMatchRequest(s.profile, new Date(), rng, -1, new CustomMatchOptions(s.config));
      if (!r.ok) throw new Error(`match request failed: ${r.error}`);
      req = r.request;
      // FillBotsAndStart: bots are levelled on the room's average level
      const levels = [s.me.level, ...humans.map(([, p]) => p.level)];
      req.hostLevel = Math.max(1, Math.round(levels.reduce((a, b) => a + b, 0) / levels.length));
      meta._botLevelsAndAggros({ rng }, req);
    }
    const free = slotRemap(req.seed).filter((sl) => sl !== req.localSlot && req.slots[sl]);
    const assign = new Map();
    humans.forEach(([id, p], i) => {
      const slot = free[i];
      if (slot === undefined) return;
      assign.set(id, slot);
      req.slots[slot] = new MatchSlot({ slot, team: teamForSlot(slot, req.team, req.bossOnLeft), skinId: p.skin, level: p.level, isBot: false, name: p.name });
    });
    req.isOffline = assign.size === 0;
    req.online = { kind: s.kind, humans: 1 + assign.size };
    return { req, assign };
  }

  async offlineRequest() {
    const meta = await loadMeta();
    const r = meta.buildMatchRequest(this.s.profile, new Date(), new MetaRng(Date.now() & 0x7fffffff));
    if (!r.ok) throw new Error(`match request failed: ${r.error}`);
    return r.request;
  }

  async launch() {
    const s = this.s;
    this.launched = true;
    const { req, assign } = await this.buildRequest();
    if (this.disposed) return;
    if (!assign.size) {
      // QuantumMatchmaker: timer expired with one player -> offline fallback against bots
      super.dispose();
      this.room.close();
      s.state = 'playing';
      s.emit('start', { request: requestFor(plainRequest(req), req.localSlot), runnerOptions: null });
      return;
    }
    if (s.kind === 'quick') this.room.unlist(); else this.room.lock();
    const net = this.net = new HostMatchNet({ link: this.link });
    const sources = {};
    const json = plainRequest(req);
    for (const [id, slot] of assign) {
      sources[slot] = net.addClient(id, slot);
      this.send(id, { t: 'start', request: json, slot });
    }
    for (const [id] of this.peers) if (!assign.has(id)) this.send(id, { t: 'kick', why: 'full' });
    net.onDrop = (slot, why) => s.emit('drop', { slot, why });
    s.state = 'playing';
    s.players = this.players();
    const localSlot = req.localSlot;
    s.emit('start', {
      request: requestFor(json, localSlot),
      runnerOptions: {
        role: 'host', localSlot, net,
        sourceFor: (slot) => sources[slot] || null,
        createRunner: (db, setup, ls) => {
          const r = new MatchRunner(db, setup, ls);
          r.wallClock = true;
          net.attach(r);
          this.drive(r, () => net.flushIdle());
          return r;
        },
      },
    });
  }

  leave(keepalive) {
    super.dispose();
    const finish = () => {
      this.lingering = false;
      this.stopDrive();
      for (const [id, p] of this.peers) if (!p.gone) this.send(id, { t: 'bye' });
      this.room.close(keepalive);
    };
    if (keepalive || !this.net || !this.net.unacked().length) { finish(); return; }
    // The match screen closes ~2.6 s after GAME OVER and the menu may leave right away: clients that have not acked
    // the last events yet (a slow link, a stalled tab) get the final state resent until they do, or LINGER runs out.
    this.lingering = true;
    this.net.closing = true;
    const t0 = now();
    this.s.linger = { behind: this.net.unacked().length, ms: 0 };
    const iv = setInterval(() => {
      if (this.net.flushIdle() && now() - t0 < LINGER * 1000) return;
      clearInterval(iv);
      this.s.linger.ms = Math.round(now() - t0);
      this.s.linger.left = this.net.unacked().length;
      finish();
    }, 50);
  }

  dispose(reason) {
    super.dispose();
    if (this.lingering) return;
    this.stopDrive();
    this.room.close();
  }
}

class GuestRole extends Role {
  constructor(session, joined, onFail) {
    super(session, joined.link);
    const s = session;
    this.joined = joined;
    this.host = joined.link.hostId;
    this.onFail = onFail;     // quick match: the room went away before it started -> look again
    this.welcomed = false;
    this.started = false;
    this.heard = now();
    this.joinedAt = now();
    this.net = null;
    s.isHost = false;
    s.code = joined.code || '';
    this.link.onMessage = (from, u8) => this.onMessage(from, u8);
    this.link.onClose = (why) => this.hostGone(why);
    this.hello();
    this.every(0.25, () => this.tick());
  }

  hello() {
    this.lastHello = now();
    this.send(this.host, { t: 'hello', v: PROTOCOL, name: this.s.me.name, skin: this.s.me.skin, level: this.s.me.level, uid: this.joined.uid });
  }

  onMessage(from, u8) {
    this.heard = now();
    if (u8[0] === MSG.SNAP) { if (this.net) this.net.onPacket(u8); return; }
    if (u8[0] !== MSG.CTRL) return;
    const m = this.framer.unpack(from, u8);
    if (!m) return;
    const s = this.s;
    if ((m.t === 'welcome' || m.t === 'roster') && !this.welcomed && s.wantReady !== undefined) this.setReady(s.wantReady);
    if (m.t === 'welcome') {
      this.welcomed = true;
      s.state = s.state === 'connecting' ? 'lobby' : s.state;
    } else if (m.t === 'roster') {
      this.welcomed = true;
      if (s.state === 'connecting') s.state = 'lobby';
      s.players = m.players;
      s.countdown = m.countdown;
      s.config = m.config;
      if (m.code) s.code = m.code;
      if (!this.started) s.emit('lobby', s.lobbyInfo());
    } else if (m.t === 'start') {
      this.start(m);
    } else if (m.t === 'kick') {
      this.dispose();
      if (this.onFail && !this.started && m.why !== 'version') { this.cleanup(); this.onFail(); return; }
      s.fail(new Error(`host refused: ${m.why}`), m.why === 'full' ? 'full' : m.why === 'version' ? 'version' : 'started');
    } else if (m.t === 'bye') {
      this.hostGone('host left');
    }
  }

  start(m) {
    if (this.started) return;
    this.started = true;
    const s = this.s;
    const net = this.net = new ClientMatchNet({ link: this.link, hostId: this.host, ownLead: settings.ownLead !== false });
    s.state = 'playing';
    const request = requestFor(m.request, m.slot);
    request.isOffline = false;
    s.emit('start', {
      request,
      runnerOptions: {
        role: 'client', localSlot: m.slot, net,
        sourceFor: () => null,
        createRunner: (db, setup, ls) => {
          const r = new ClientRunner(db, setup, ls, net);
          this.drive(r, () => net.ackNow());
          return r;
        },
      },
    });
  }

  setReady(r) { this.send(this.host, { t: 'ready', ready: r }); }

  tick() {
    if (this.disposed) return;
    const t = now();
    if (this.net) this.net.ackNow();
    if (!this.welcomed && t - this.lastHello > 1500) this.hello();
    if (!this.lastKa || t - this.lastKa >= KEEPALIVE * 1000) { this.lastKa = t; this.send(this.host, { t: 'ka' }); }
    if (t - this.heard > HOST_TIMEOUT * 1000) { this.hostGone('host timed out'); return; }
    if (this.s.kind === 'quick' && !this.started && t - this.joinedAt > GUEST_WATCHDOG * 1000) {
      this.s.fail(new Error('host did not start the match'), 'timeout');
    }
  }

  hostGone(why) {
    if (this.disposed) return;
    this.dispose();
    const s = this.s;
    if (this.started) {
      if (this.net && this.net.runner) this.net.runner.hostLost();
      s.close('host-left');
      return;
    }
    if (this.onFail) { this.cleanup(); this.onFail(); return; }
    s.fail(new Error(why), 'host-left');
  }

  cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    try { this.link.close(); } catch (e) { /* closed */ }
    this.joined.leave();
  }

  dispose(reason) {
    super.dispose();
    this.stopDrive();
    // Session.close passes a reason: the session is over, let go of the relay and the lobby seat
    if (reason) this.cleanup();
  }

  leave(keepalive) {
    super.dispose();
    try { this.send(this.host, { t: 'bye' }); } catch (e) { /* link down */ }
    this.cleaned = true;
    setTimeout(() => { try { this.link.close(); } catch (e) { /* closed */ } }, 300);
    this.joined.leave(keepalive);
  }
}

export const Online = {
  /** Tests and the dev page: {backend, meta, impair: {delay, jitter, drop}, ownLead}. */
  configure(o) { Object.assign(settings, o); return settings; },

  available() {
    if (typeof WebSocket === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle) return false;
    return Promise.race([backend().available(), new Promise((r) => setTimeout(() => r(false), 8000))]).catch(() => false);
  },

  quickMatch({ profile, request = null, backend: b = null }) {
    const s = new Session('quick', profile, b);
    setTimeout(() => s.run(() => s.quick(request)), 0);
    return s;
  },

  createPrivate({ profile, config = null, backend: b = null }) {
    const s = new Session('private', profile, b);
    setTimeout(() => s.run(() => s.hostPrivate(config)), 0);
    return s;
  },

  joinPrivate({ profile, code, backend: b = null }) {
    const s = new Session('private', profile, b);
    setTimeout(() => s.run(() => s.joinPrivate(code)), 0);
    return s;
  },
};
