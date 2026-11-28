// Co-op state replication for SHRED A BILLION (rules/coop.md §B, §E). Pure JS, runs in node.
// Host side (CoopHost): the sim surface that js/net/session.js HostNet drives: wire() = the shared state as a plain JSON
// tree (HostNet diffs it at RATE Hz), tickExtra()/fullExtra() = the pile, sent as changed cells (varint deltas, base64)
// because the 144x144 heightfield is too big for the JSON diff, addRemote/removeRemote/setPose = guest seats, command()
// = Buy / Learn as that player. Guest side (CoopGuest): applies the wire tree and pile deltas to a client Game
// (game.client = true), which then only moves its own player.
import { plain } from '../net/mirror.js';
import { NX, NZ } from './pile.js';

export const COLORS = ['#FFC83D', '#4FC3D9', '#F07A5A', '#A98BF0'];   // NetPlayerRow.Colors (UC/NetPlayerRow.c:171-215)
const RESERVE = 600;              // HostCore ReserveSeconds: a leaving guest keeps its slot (and its parked bag) for 10 min
const CHAT = { max: 140, bytes: 560, history: 20, cap: 10, perSec: 1, maxWait: 63 };   // P/ChatHost.c, P/ChatText.c (rules/coop.md D.4)
// ChatText.Sanitize: no control, bidi or zero-width characters, no rich-text tags, at most 2 combining marks in a row
export function sanitizeChat(s) {
  let t = String(s || '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1').trim();
  t = [...t].slice(0, CHAT.max).join('');
  while (new TextEncoder().encode(t).length > CHAT.bytes) t = [...t].slice(0, -1).join('');
  return t;
}
const DRONE_STATE = ['docked', 'outbound', 'dig', 'inbound', 'dump', 'return', 'recharge'];
const sum6 = (t) => t[0] + t[1] + t[2] + t[3] + t[4] + t[5];

// ---- pile codec: changed cells since the last send, as (gap, zigzag delta) varints ----
function putVar(out, v) { while (v > 127) { out.push((v & 127) | 128); v = Math.floor(v / 128); } out.push(v); }
function b64(bytes) {
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(str) { const s = atob(str), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
export function encodeCells(cur, base) {
  const out = []; let last = -1, n = 0;
  for (let c = 0; c < cur.length; c++) {
    const d = cur[c] - base[c]; if (d === 0) continue;
    putVar(out, c - last - 1); putVar(out, d >= 0 ? d * 2 : -d * 2 - 1); base[c] = cur[c]; last = c; n++;
  }
  return n ? b64(Uint8Array.from(out)) : '';
}
export function decodeCells(str, arr, touched) {
  if (!str) return 0;
  const b = unb64(str); let i = 0, c = -1, n = 0;
  const get = () => { let v = 0, m = 1, x; do { x = b[i++]; v += (x & 127) * m; m *= 128; } while (x & 128); return v; };
  while (i < b.length) { c += get() + 1; const z = get(); arr[c] += (z & 1) ? -(z + 1) / 2 : z / 2; if (touched) touched(c); n++; }
  return n;
}

// ---- host ----
export class CoopHost {
  constructor(game, { hostName = '' } = {}) {
    this.g = game; game.hostName = hostName; this.listeners = []; this.reserved = new Map();   // uid -> {slot, bag, at}
    this.pileBase = Int32Array.from(game.field.count); this.pileKey = this.pileSig();
    this.chat = []; this.chatSeq = 0; this.chatTok = new Map();   // host-relayed chat: the last 20 lines go to late joiners
    // spending policy (GuestsMaySpend, default true): when off a guest's Buy becomes a wish (WishesPerPlayer 3; wish
    // tokens 6 at join, burst 6, +1 per 10 ticks; P/EconomyHostModule.c:330-338, 483-505, 2418; dump:580993)
    this.hostOnly = false; this.wishes = new Map(); this.wishTok = new Map(); this.radio = 0;
  }
  pileSig() { const f = this.g.field; return `${f.level}|${f.levelSeq || 0}`; }
  // main loop: every sim event of the frame goes to HostNet (it ships them with the next tick)
  emit(events) { for (const e of events) { if (e.type === 'bought') this.fulfil(e.id); for (const l of this.listeners) l(e); } }
  // slots 1..3: a reserved slot goes back to the same uid, else the lowest free one
  slotFor(uid) {
    const now = this.g.time, used = new Set([...this.g.guests.keys()]);
    for (const [u, r] of this.reserved) if (now - r.at > RESERVE) this.reserved.delete(u);
    if (uid && this.reserved.has(uid) && !used.has(this.reserved.get(uid).slot)) return this.reserved.get(uid).slot;
    const held = new Set([...this.reserved.values()].map(r => r.slot));
    for (let s = 1; s <= 3; s++) if (!used.has(s) && !held.has(s)) return s;
    let old = null; for (const [u, r] of this.reserved) if (!used.has(r.slot) && (!old || r.at < old[1].at)) old = [u, r];   // evict the oldest reservation
    if (old) { this.reserved.delete(old[0]); return old[1].slot; }
    return -1;
  }
  addRemote(pid, name, looks, uid) {
    const s = this.g.addGuest(pid, name, pid); s.uid = uid || null;
    const r = uid && this.reserved.get(uid);
    if (r && r.slot === pid && r.bag) { s.bag = r.bag; s.hand = r.hand; }     // Parked.Claim: the bag comes back
    if (uid) this.reserved.delete(uid);
    this.g.events.push({ type: 'joined', who: pid, name });
    this.chatLine({ w: pid, k: uid && r ? 'chat.reconnected' : 'chat.joined' });
    return s;
  }
  // a guest that leaves parks its bag by identity for RESERVE s; without an identity the bag is shredded (AutoShred)
  removeRemote(pid, why) {
    const s = this.g.guests.get(pid); if (!s) return;
    if (s.uid && why !== 'host') {
      this.reserved.set(s.uid, { slot: pid, bag: s.bag.slice(), hand: s.hand.slice(), at: this.g.time });
      s.bag = [0, 0, 0, 0, 0, 0]; s.hand = [0, 0, 0, 0, 0, 0];
    }
    this.g.removeGuest(pid);
    this.g.events.push({ type: 'left', who: pid, name: s.name });
    this.chatLine({ w: pid, k: 'chat.left' });
  }
  // a wish toggles (set or cleared); a Buy refused by the policy only sets it; 3 per player, rate-limited
  wish(pid, id, fromBuy) {
    if (!this.g.econ.upById.has(id)) return false;
    const now = this.g.time, b = this.wishTok.get(pid) || { n: 6, at: now }; b.n = Math.min(6, b.n + (now - b.at) * 3); b.at = now; this.wishTok.set(pid, b);
    if (b.n < 1) return false; b.n -= 1;
    const list = this.wishes.get(pid) || [];
    if (fromBuy) this.g.events.push({ type: 'hostOnly', who: pid });
    if (list.includes(id)) { if (!fromBuy) { list.splice(list.indexOf(id), 1); this.wishes.set(pid, list); } return true; }
    list.push(id); while (list.length > 3) list.shift(); this.wishes.set(pid, list);
    this.g.events.push({ type: 'wish', from: pid, id });
    return true;
  }
  // the host bought something: its wishes are fulfilled
  fulfil(id) { for (const [p, l] of this.wishes) if (l.includes(id)) this.wishes.set(p, l.filter(x => x !== id)); }
  chatLine(o) { this.chat.push({ id: ++this.chatSeq, ...o }); if (this.chat.length > CHAT.history) this.chat.shift(); }
  // ChatHost: sanitize, token bucket (10, +1/s) per player; a refused line gets a private 'slow down' with the wait
  say(pid, text) {
    const t = sanitizeChat(text); if (!t) return false;
    const now = this.g.time, b = this.chatTok.get(pid) || { n: CHAT.cap, at: now };
    b.n = Math.min(CHAT.cap, b.n + (now - b.at) * CHAT.perSec); b.at = now; this.chatTok.set(pid, b);
    if (b.n < 1) { this.g.events.push({ type: 'chatSlow', who: pid, wait: Math.min(CHAT.maxWait, Math.ceil((1 - b.n) / CHAT.perSec)) }); return false; }
    b.n -= 1; this.chatLine({ w: pid, t }); return true;
  }
  setPose(pid, p) { this.g.guestInput(pid, p); }
  setLooks() {}
  // NetUnclaimedLedger: bags still parked or carried when the host saves
  unclaimed() {
    let n = 0; const t = [0, 0, 0, 0, 0, 0];
    const add = (a) => { if (a) for (let i = 0; i < 6; i++) { t[i] += a[i] || 0; n += a[i] || 0; } };
    for (const r of this.reserved.values()) { add(r.bag); add(r.hand); }
    for (const s of this.g.guests.values()) { add(s.bag); add(s.hand); }
    return n > 0 ? t : null;
  }
  // Buy / Learn arrive as commands and run as that player (Net.Actor); the host's numbers win
  command(pid, m) {
    const g = this.g, e = g.econ;
    if (m.op === 'wish' || (m.op === 'buy' && this.hostOnly)) return this.wish(pid, m.id, m.op === 'buy');
    if (m.op === 'radio') { if (this.onRadio) this.onRadio(m.d | 0); return true; }
    if (m.op === 'buy') {
      const before = e.upgrades[m.id] | 0, n = Math.max(1, Math.min(10000, m.n | 0 || 1));
      const done = g.actAs(pid, () => m.max ? e.buyMax(m.id) : (() => { let k = 0; while (k < n && e.buy(m.id)) k++; return k; })()) | 0;
      g.events.push({ type: 'purchaseFx', who: pid, id: m.id, requested: m.max ? -1 : n, done, before });
      return done;
    }
    if (m.op === 'chat') return this.say(pid, m.text);
    if (m.op === 'fun') {   // cmd 34/35/36/37: wind, cancel, release, shredder ride, drone grab, let go
      const F = this.g.fun;
      if (m.f === 'wind') return F.wind(pid, m.slap);
      if (m.f === 'cancel') return F.cancel(pid);
      if (m.f === 'release') return F.release(pid, m.to, m.slap);
      if (m.f === 'ride') return F.rideShredder(pid);
      if (m.f === 'grab') return F.grab(pid, m.d | 0);
      if (m.f === 'letgo') return F.letGo(pid, !!m.jump);
      return null;
    }
    if (m.op === 'learn') { const ok = !!g.actAs(pid, () => e.learn(m.id)); g.events.push({ type: 'learnFx', who: pid, id: m.id, ok }); return ok; }
    return null;
  }
  players() {
    const g = this.g, out = {};
    const one = (id, name, s, priv) => {
      const p = s.player, o = { n: name, s: id, p: p.pos, y: p.yaw || 0, pi: p.pitch || 0, t: s.tool, mv: s.moving || 0, cr: !!s.crouch, fl: !!s.flying, a: s.act || 0, em: s.emote || 0, dn: s.down || 0, bk: !!s.back };
      if (priv) Object.assign(o, { h: s.hand, b: s.bag, st: s.stream ? (s.stream.hand ? 2 : 1) : 0, sh: s.shovel.phase, fw: s.flow, pc: s.pump.charge,
        cd: priv.cd, ca: s.finds.carry ? s.finds.carry.id : null, ov: priv.ov });
      out[id] = o;
    };
    const a = g.abilities, cd = (src) => { const o = {}; for (const m in src.cdReady) { const l = src.cdReady[m] - g.time; if (l > 0) o[m] = [l, src.cdTotal[m] || 1]; } return o; };
    one(0, g.hostName || '', { player: g.player, tool: g.tool, hand: g.hand, bag: g.bag, stream: g.stream, shovel: g.shovel, flow: g.flow, pump: g.pump, finds: g.finds, moving: g.hostMoving, crouch: g.hostCrouch, flying: g.hostFlying, act: g.hostAct, emote: g.hostEmote, down: g.hostDown, back: g.hostBack }, null);
    for (const s of g.guests.values()) one(s.id, s.name, { ...s, moving: s.input ? s.input.mv : 0, crouch: s.input && s.input.cr, flying: s.input && s.input.fl, act: s.input ? s.input.a : 0, emote: s.input ? s.input.em : 0, down: s.input ? s.input.dn : 0, back: s.input && s.input.bk },
      { cd: cd(s.abil), ov: Math.max(0, s.abil.overloadUntil - g.time) });
    return out;
  }
  wire() {
    const g = this.g, e = g.econ, f = g.field, F = g.finds, V = g.vaultEvents, I = g.intro, N = g.finale;
    const c = F.chest;
    return plain({
      n: e.party.players,
      ec: { d: e.dollars, l: e.lifetime, t: e.total, u: e.upgrades, r: e.ranks, p: e.points, k: e.perks, g: e.goldBars, lv: e.level, xp: e.xp,
        rel: [...e.relics], wf: [...e.worldFlags], ms: e.reached, st: e.stats.tracked, bo: e.boosts, sm: e.saleMultiplier, em: e.eventMultiplier, dps: e.dps },
      fl: [...g.flags],
      pf: { lv: f.level, rv: f.revealed, gl: f.giltLeft, gp: f.giltPatches, vis: f.visible, hid: f.hidden },
      q: g.queued, ql: g.queue.length, dl: g.delivered,
      dr: g.drones.map(d => [d.pos[0], d.pos[1], d.pos[2], d.heading || 0, DRONE_STATE.indexOf(d.state), sum6(d.cargo) > 0 ? 1 : 0, d.value || 0]),
      it: F.items.map(i => ({ id: i.id, k: i.kind, s: i.state, p: i.pos, by: i.by | 0 })),
      ch: c ? { n: c.n, x: c.x, y: c.y, z: c.z, cy: c.curY, yaw: c.yaw, s: c.state, t: c.t, ex: c.exposed || 0 } : null,
      fed: F.fed,
      ob: g.boosts.orbs.map(o => [o.state, o.pos[0], o.pos[1], o.pos[2], o.age || 0, o.life || 0, o.t || 0, o.phase || 0]),
      ve: V.s, hp: V.heap ? { x: V.heap.x, z: V.heap.z } : null,
      in: { c: I.card, a: I.arrow, s: I.step, d: I.done, sn: I.seen },
      fn: { ks: N.key.state, kt: N.key.t, ds: N.door.state, dt: N.door.t, dh: N.door.halo, dr: N.door.rattleT, run: N.run, crew: N.crew },
      ra: g.abilities.rally ? g.abilities.rally.at : null,
      pl: this.players(),
      cl: this.chat,
      fu: this.g.fun.wire(),
      sp: this.hostOnly ? 1 : 0, wi: Object.fromEntries(this.wishes), rt: this.radio,
    });
  }
  tickExtra() {
    const f = this.g.field, key = this.pileSig();
    if (key !== this.pileKey) return { full: this.fullPile() };
    const d = encodeCells(f.count, this.pileBase);
    return d ? { d } : null;
  }
  fullExtra() { return { full: this.fullPile() }; }
  fullPile() { const f = this.g.field; this.pileBase.set(f.count); this.pileKey = this.pileSig(); return f.save(); }
}

// ---- guest ----
export class CoopGuest {
  constructor(game, me) { this.g = game; this.me = me; game.client = true; game.coopMe = me; this.items = new Map(); this.roster = {}; }
  applyExtra(x) {
    if (!x) return;
    const f = this.g.field;
    if (x.full) { f.load(x.full); this.g.events.push({ type: 'pileReload' }); return; }
    if (x.d) {
      const chunks = new Set();
      decodeCells(x.d, f.count, (c) => { const cx = c % NX, cz = (c / NX) | 0; chunks.add(((cz >> 4) * 9) + (cx >> 4)); });
      for (const k of chunks) f.dirty.add(k);
    }
  }
  apply(w) {
    const g = this.g, e = g.econ, E = w.ec;
    if (!w || !E) return;
    // economy: the host's numbers; stats recomputed when the stat inputs changed
    const sig = JSON.stringify([E.u, E.r, E.k, E.rel, E.bo && E.bo.map(b => b.kind), w.n, E.wf]);
    e.dollars = E.d; e.lifetime = E.l; e.total = E.t; e.upgrades = E.u || {}; e.ranks = E.r || {}; e.points = E.p; e.perks = E.k || {}; e.goldBars = E.g;
    e.level = E.lv; e.xp = E.xp; e.relics = new Set(E.rel || []); e.worldFlags = new Set(E.wf || []); e.reached = E.ms || []; e.stats.tracked = E.st || {};
    e.boosts = (E.bo || []).map(b => ({ ...b })); e.saleMultiplier = E.sm; e.eventMultiplier = E.em; e.dps = E.dps;
    if (sig !== this.econSig) { this.econSig = sig; e.party.set(w.n || 1); e.recalc(); g._st = g.st(); }
    g.flags = new Set(w.fl || []);
    // pile header (cells come through applyExtra)
    const f = g.field, P = w.pf;
    if (P) { f.revealed = P.rv; f.giltLeft = P.gl; if (JSON.stringify(P.gp) !== JSON.stringify(f.giltPatches)) { f.giltPatches = P.gp || []; f.giltMask.fill(0); f.giltPatches.forEach((p, i) => { if (f.giltLeft[i] > 0) f.giltCells(p, (c) => { f.giltMask[c] = i + 1; }); }); }
      f.visible = P.vis; f.hidden = P.hid; }
    g.queued = w.q; if (g.queue.length !== w.ql) { g.queue.length = 0; for (let i = 0; i < w.ql; i++) g.queue.push({ notes: [0, 0, 0, 0, 0, 0], source: 0, readyAt: 0 }); }
    g.delivered = w.dl || 0;
    // drones: targets the client eases toward (DroneHost samples at 15 Hz)
    const dr = w.dr || [];
    while (g.drones.length < dr.length) { const i = g.drones.length; g.drones.push({ i, pos: [dr[i][0], dr[i][1], dr[i][2]], net: null, cargo: [0, 0, 0, 0, 0, 0], value: 0, state: 'docked', heading: 0 }); }
    g.drones.length = dr.length;
    dr.forEach((a, i) => { const d = g.drones[i]; d.net = [a[0], a[1], a[2]]; d.heading = a[3]; d.state = DRONE_STATE[a[4]] || 'docked'; d.cargo = [a[5], 0, 0, 0, 0, 0]; d.value = a[6]; });
    // finds: items keep their objects (the view pools by id); my own carry follows my camera locally
    const F = g.finds, mine = w.pl && w.pl[this.me];
    const seen = new Set();
    F.items = (w.it || []).map(x => {
      let it = this.items.get(x.id); if (!it) { it = { id: x.id, kind: x.k, pos: x.p.slice(), vy: 0 }; this.items.set(x.id, it); }
      seen.add(x.id); it.kind = x.k; it.state = x.s; it.by = x.by;
      if (!(x.s === 'held' && x.by === this.me)) it.pos = x.p.slice();
      return it;
    });
    for (const k of [...this.items.keys()]) if (!seen.has(k)) this.items.delete(k);
    F.carry = mine && mine.ca != null ? this.items.get(mine.ca) || null : null;
    const C = w.ch;
    F.chest = C ? Object.assign(F.chest && F.chest.n === C.n ? F.chest : {}, { n: C.n, x: C.x, y: C.y, z: C.z, curY: C.cy, yaw: C.yaw, state: C.s, t: C.t, exposed: C.ex }) : null;
    if (F.fed !== w.fed) { F.fed = w.fed; if (F.rebuildPerks) F.rebuildPerks(); }
    // orbs
    const ob = w.ob || [];
    g.boosts.orbs = ob.map((a, i) => Object.assign(g.boosts.orbs[i] || { i }, { state: a[0], pos: [a[1], a[2], a[3]], age: a[4], life: a[5], t: a[6], phase: a[7] }));
    // vault event, intro card (the host's goal card for everyone), finale stages
    g.vaultEvents.s = w.ve || { kind: 0, seq: 0 }; g.vaultEvents.heap = w.hp;
    const I = g.intro, In = w.in || {}; I.card = In.c || null; I.arrow = In.a || null; I.step = In.s | 0; I.done = !!In.d; I.seen = !!In.sn;
    const N = g.finale, Fn = w.fn || {};
    N.key.state = Fn.ks; N.key.t = Fn.kt; N.door.state = Fn.ds; N.door.t = Fn.dt; N.door.halo = Fn.dh; N.door.rattleT = Fn.dr;
    if (Fn.run) Object.assign(N.run, Fn.run); if (Fn.crew) Object.assign(N.crew, Fn.crew);
    g.abilities.rally = w.ra ? { at: w.ra, until: Infinity, dig: 1 } : null;
    // my seat: what the host says I carry
    if (mine) {
      g.hand = mine.h || g.hand; g.bag = mine.b || g.bag; g.stream = mine.st ? { hand: mine.st === 2 } : null; g.flow = mine.fw || 0; g.pump.charge = mine.pc || 0;
      g.shovel.phase = mine.sh | 0;
      const A = g.abilities; A.cdReady = {}; A.cdTotal = {}; for (const m in mine.cd || {}) { A.cdReady[m] = g.time + mine.cd[m][0]; A.cdTotal[m] = mine.cd[m][1]; }
      A.overloadUntil = g.time + (mine.ov || 0);
    }
    this.roster = w.pl || {};
    this.chat = w.cl || [];
    this.fun = w.fu || { r: {}, p: {} };
    this.hostOnly = !!w.sp; this.wishes = w.wi || {}; this.radio = w.rt | 0;
    for (const d of g.drones) d.rider = undefined; for (const p in this.fun.r) { const d = g.drones[this.fun.r[p]]; if (d) d.rider = +p; }
  }
  // the other players (host included) for the avatar view
  others() { return Object.values(this.roster).filter(p => p.s !== this.me); }
}

// guest input: held buttons as flags, presses as counters (each new count is one press on the host, none lost or doubled)
export class InputPacker {
  constructor() { this.c = { primary: 0, interact: 0, secondary: 0, rally: 0 }; this.act = 0; }
  // call once per sim step with the step's input; returns the message the next send carries
  feed(inp, extra = {}) {
    if (inp.primaryPressed) this.c.primary++;
    if (inp.interactPressed) this.c.interact++;
    if (inp.secondaryPressed) this.c.secondary++;
    if (inp.rallyPressed) this.c.rally++;
    const r = (v) => v && v.map(x => Math.round(x * 1000) / 1000);
    this.msg = { f: r(inp.feet), e: r(inp.eye), d: r(inp.dir), v: r(inp.vel), ph: !!inp.primaryHeld, ih: !!inp.interactHeld, sh: !!inp.secondaryHeld,
      c: { ...this.c }, em: extra.em | 0, dn: extra.dn | 0, bk: !!extra.bk, tool: extra.tool | 0, mv: Math.round((extra.moving || 0) * 100) / 100, cr: !!extra.crouch, fl: !!extra.flying, a: extra.act | 0, uo: !!inp.upgradesOpen };
    return this.msg;
  }
}
// a guest's purchases: predicted on the local mirror at once, sent to the host, which decides (the next tick corrects)
// hostOnly(): the host set SPENDING: HOST ONLY — a Buy is sent as a wish instead and returns false
export function bindGuestCommands(econ, send, hostOnly = () => false) {
  const buy = econ.buy.bind(econ), buyMax = econ.buyMax.bind(econ), learn = econ.learn.bind(econ);
  econ.buy = (id) => { if (hostOnly()) { send('wish', { id }); return false; } const ok = buy(id); if (ok) send('buy', { id, n: 1 }); return ok; };
  econ.buyMax = (id) => { if (hostOnly()) { send('wish', { id }); return 0; } const n = buyMax(id); if (n > 0) send('buy', { id, max: true }); return n; };
  econ.learn = (id) => { const ok = learn(id); if (ok) send('learn', { id }); return ok; };
}
