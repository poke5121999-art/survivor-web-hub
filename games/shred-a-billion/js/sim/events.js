// Vault events (rules/events.md §A): rolled events on an active-play clock (Golden Pallet, Shredder Overdrive, Golden Minute,
// Jackpot Crate, Flash Sale) and the two Money Deliveries driven by how much of the vault is cleared. Gold Fever is Act II only
// (not in this build). Pure JS, owned by Game; host = solo.
import { STAT as S, SRC } from './economy.js';
import { CELL, NX, NZ, OX, OZ, HALF, T as NOTE_T } from './pile.js';

export const EV_KIND = { None: 0, Delivery: 1, Pallet: 2, Overdrive: 3, Fever: 4, Minute: 5, Crate: 6, Sale: 7 };
const K = EV_KIND;
const PARTY_SOLO = 0.435;               // PartyPricing.Multiplier(1) = soloPriceScale 0.87 / partyReference 2
const PALLET = { rise: 1.2, cheer: 2.5, sink: 1.5, reachUp: 2.6, inset: 2.5, minMoney: 0.35 };
const DELIV = { callGap: 1.6, blink: 4.2, pump: [20, 45], settle: 3, allDown: [21.6, 46.6], callAt: 4.4, ceiling: 16.25 };   // ceiling: VaultBig/Shell/Ceiling_Main y
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

export class VaultEvents {
  constructor(game) { this.g = game; this.reset(); }
  get ev() { return this.g.data.balance.events; }
  reset() {
    this.rngS = 0x9E3779B9 >>> 0; this.s = { kind: 0, seq: 0 }; this.active = 0; this.last = 0; this.lastAct = 0; this.started = 0;
    this.nextAt = this.ev.firstDelay + this.U() * this.ev.firstSpread / (this.F() * this.fr());
    this.dWatch = 0; this.readyAt = -1; this.lastFeet = null; this.moveT = 0; this.heap = null;
    this.incBuckets = new Float64Array(12); this.incI = 0; this.incT = 0; this.incSeen = 0; this.lastShred = 0;
  }
  U() { let s = this.rngS; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; this.rngS = s >>> 0; return (this.rngS >>> 8) * 5.9604645e-8; }
  F() { const v = this.g.stat(S.EventFrequency); return !(v > 0) || !isFinite(v) ? 1 : clamp(v, 1, 1.5); }
  D() { const v = this.g.stat(S.EventDuration); return !(v > 0) || !isFinite(v) ? 1 : clamp(v, 1, 2); }
  fr() { return this.ev.frequency > 0.01 ? this.ev.frequency : 1; }
  get running() { return this.s.kind !== 0; }
  activity() { this.lastAct = this.g.time; }
  // IncomeRate: 12 buckets x 5 s of shredded dollars (Overdrive removed), or half the live income
  incomeRate() {
    const sum = this.incBuckets.reduce((a, b) => a + b, 0), ov = this.s.kind === K.Overdrive ? Math.max(1, this.s.multiplier) : 1;
    return Math.max(sum / Math.max(10, Math.min(60, this.incSeen)), (this.g.econ.dps || 0) / ov * 0.5);
  }
  // ---- spots ----
  spotNear(minD, maxD, needMoney, tries = 80) {
    const g = this.g, P = g.player.pos, f = g.field, lim = HALF - PALLET.inset, cx = OX + HALF, cz = -(OZ + HALF);
    for (let i = 0; i < tries; i++) {
      const a = g.rand() * Math.PI * 2, d = minD + g.rand() * (maxD - minD), x = P[0] + Math.cos(a) * d, z = P[2] + Math.sin(a) * d;
      if (Math.abs(x - cx) > lim || Math.abs(z - cz) > lim) continue;
      const c = f.cellOf(x, z); if (c < 0 || f.noMoney[c] || f.ramp[c] >= 0) continue;
      const depth = f.count[c] * NOTE_T;
      if (needMoney ? depth < needMoney : !(depth >= PALLET.minMoney || f.count[c] === 0)) continue;
      return [x, f.topY(c), z];
    }
    return null;
  }
  // ---- scheduler ----
  startRolled() {
    const E = this.ev, pallet = this.spotNear(E.palletMinDistance, E.palletMaxDistance, 0), crate = this.spotNear(E.crateMinDistance, E.crateMaxDistance, 0.2);
    const W = { [K.Pallet]: pallet ? E.weightPallet : 0, [K.Overdrive]: E.weightOverdrive, [K.Minute]: E.weightGoldenMinute, [K.Crate]: crate ? E.weightCrate : 0, [K.Sale]: E.weightSale };
    const ks = [K.Pallet, K.Overdrive, K.Minute, K.Crate, K.Sale];   // Rolled[] order UNKNOWN; Fever is Act II only
    const w = (k) => Math.max(0, +W[k] || 0);
    let pool = ks.filter(k => k !== this.last), tot = pool.reduce((a, k) => a + w(k), 0);
    if (tot <= 0) { pool = ks; tot = pool.reduce((a, k) => a + w(k), 0); if (tot <= 0) return false; }
    let r = this.U() * tot, kind = 0;
    for (const k of pool) { const x = w(k); if (x <= 0) continue; if (r < x) { kind = k; break; } r -= x; }
    if (!kind) return false;
    return this.begin(kind, kind === K.Pallet ? pallet : kind === K.Crate ? crate : null);
  }
  begin(kind, spot, second = false) {
    const E = this.ev;
    let dur = { [K.Pallet]: Math.max(4.2, E.palletLifetime), [K.Overdrive]: Math.max(1, E.overdriveDuration), [K.Minute]: Math.max(5, E.goldenMinuteDuration),
      [K.Crate]: Math.max(10, E.crateLifetime), [K.Sale]: Math.max(5, E.saleDuration), [K.Delivery]: DELIV.callGap + DELIV.blink + DELIV.pump[second ? 1 : 0] + DELIV.settle }[kind];
    if ([K.Overdrive, K.Minute, K.Sale].includes(kind)) dur *= this.D();
    const ps = this.g.econ.party ? this.g.econ.party.current() : PARTY_SOLO;   // PartyScale (0.435 solo, 0.87 per 2 players)
    const payout = kind === K.Pallet ? Math.max(ps * E.palletMinPayout, E.palletIncomeSeconds * this.incomeRate())
      : kind === K.Crate ? Math.max(ps * E.crateMinPayout, E.crateIncomeSeconds * this.incomeRate()) : 0;
    const mult = kind === K.Overdrive ? clamp(E.overdriveMultiplier, 1, 10) : kind === K.Sale ? clamp(E.saleMultiplier, 0.1, 1) : kind === K.Minute ? 2 : 0;
    this.s = { kind, seq: this.s.seq + 1, elapsed: 0, duration: dur, seed: (this.U() * 2 ** 32) >>> 0, pos: spot, winner: -1, claimedAt: -1, payout, multiplier: mult, second };
    this.started++; if (kind !== K.Delivery) this.last = kind;
    if (kind === K.Crate) this.g.finds.items.push({ kind: 'crate', id: 'crate' + this.s.seq, at: spot.slice(), pos: [spot[0], spot[1] + 0.3, spot[2]], state: 'loose', vy: 0 });
    this.g.events.push({ type: 'vaultEvent', kind, phase: 'begin', dur, mult, payout, pos: spot, second });
    return true;
  }
  endTime() {
    const s = this.s;
    return s.kind === K.Crate ? (s.claimedAt < 0 ? s.duration + 1 : s.claimedAt + 2.5) : s.kind === K.Pallet ? (s.claimedAt < 0 ? s.duration + 1.5 : s.claimedAt + 2.5) : s.duration;
  }
  finish(aborted) {
    const s = this.s, g = this.g, E = this.ev;
    if (s.kind === K.Crate) { const c = g.finds.items.find(i => i.kind === 'crate'); if (c) { if (g.finds.carry === c) g.finds.carry = null; c.state = 'gone'; } }
    g.finds.items = g.finds.items.filter(i => !(i.kind === 'crate' && i.state === 'gone'));
    g.events.push({ type: 'vaultEvent', kind: s.kind, phase: 'end', claimed: s.claimedAt >= 0, aborted, second: s.second });
    if (s.kind === K.Delivery) g.flags.add(s.second ? 'delivery2.done' : 'delivery.done');
    else {
      const lo = Math.max(30, Math.min(E.intervalMin, E.intervalMax)), hi = Math.max(lo, E.intervalMax, E.intervalMin);
      this.nextAt = this.active + Math.max(30, (lo + this.U() * (hi - lo)) / (this.F() * this.fr()));
    }
    this.s = { kind: 0, seq: s.seq };
  }
  // effects read by the economy and the pile
  apply() {
    const s = this.s, e = this.g.econ;
    e.saleMultiplier = s.kind === K.Sale && s.multiplier > 0 && s.multiplier < 1 ? s.multiplier : 1;
    e.eventMultiplier = s.kind === K.Overdrive && s.multiplier > 1 ? s.multiplier : 1;
    this.gildAll = s.kind === K.Minute && s.elapsed < s.duration;
  }
  crateDelivered() {
    const s = this.s; if (s.kind !== K.Crate || s.winner >= 0 || s.elapsed >= s.duration) return;
    s.winner = 0; s.claimedAt = s.elapsed; this.g.econ.add(s.payout, SRC.Reward);
    this.g.events.push({ type: 'vaultEvent', kind: K.Crate, phase: 'claim', payout: s.payout });
  }
  // ---- per frame ----
  step(dt, feet) {
    const g = this.g, E = this.ev;
    // income ring and activity
    const sh = g.econ.shredTotal || 0, d = sh - this.lastShred; this.lastShred = sh;
    if (d > 0) this.incBuckets[this.incI] += d / (this.s.kind === K.Overdrive ? Math.max(1, this.s.multiplier) : 1);
    this.incT += dt; this.incSeen = Math.min(60, this.incSeen + dt); if (this.incT >= 5) { this.incT -= 5; this.incI = (this.incI + 1) % 12; this.incBuckets[this.incI] = 0; }
    this.moveT += dt;
    if (this.moveT >= 1) { this.moveT = 0; if (feet && this.lastFeet && Math.hypot(feet[0] - this.lastFeet[0], feet[2] - this.lastFeet[2]) > 1) this.activity(); this.lastFeet = feet ? feet.slice() : null; }
    if (E.enabled) {
      if (this.running) {
        const s = this.s; s.elapsed += dt; this.tickKind(dt, feet);
        if (s.elapsed >= this.endTime()) this.finish(false);
      } else {
        if (g.time - this.lastAct < Math.max(1, E.idleAfter)) this.active += dt;
        if (this.active >= Math.max(this.nextAt, E.firstDelay) && !this.startRolled()) this.nextAt = this.active + 10;
      }
    }
    this.dWatch -= dt; if (this.dWatch <= 0) { this.dWatch = 1; this.deliveryWatch(); }
    this.apply();
  }
  tickKind(dt, feet) {
    const s = this.s, g = this.g, E = this.ev;
    this.palletTouch(feet, 0);
    if (s.kind === K.Delivery) this.tickDelivery(dt);
  }
  // first player to reach the pallet claims it (co-op: each seat's feet, winner = that player's id)
  palletTouch(feet, who) {
    const s = this.s, g = this.g, E = this.ev;
    if (s.kind === K.Pallet && s.winner < 0 && s.elapsed >= PALLET.rise && s.elapsed < s.duration && feet) {
      const top = Math.max(g.field.heightAt(s.pos[0], s.pos[2]), s.pos[1] - 2);
      if (Math.hypot(feet[0] - s.pos[0], feet[2] - s.pos[2]) <= Math.max(0.5, E.palletReach) && Math.abs(feet[1] - (isFinite(top) ? top : feet[1])) <= PALLET.reachUp) {
        s.winner = who | 0; s.claimedAt = s.elapsed; g.econ.add(s.payout, SRC.Reward);
        if (g.guests && g.guests.size) { const P = g.finale.player(who | 0); P.c.pallets = (P.c.pallets || 0) + 1; }   // RunStats 'pallets' (PALLET HUNTER)
        g.events.push({ type: 'vaultEvent', kind: K.Pallet, phase: 'claim', payout: s.payout, winner: who | 0 });
      }
    }
  }
  // ---- Money Delivery ----
  permille(lo, hi) { return clamp(Math.round((lo + (hi - lo) * this.U()) * 1000), 1, 999); }
  deliveryWatch() {
    const g = this.g, E = this.ev, f = g.flags;
    if (!E.deliveryEnabled || this.running) return;
    const total = g.billsTotal(), left = g.vaultLeft(); if (!(total > 0)) return;
    const getAt = (pre) => { const k = [...f].find(x => x.startsWith(pre)); return k ? +k.slice(pre.length) : null; };
    let due = false, second = false;
    if (!f.has('delivery.done')) {
      let at = getAt('delivery.at.'); if (at == null) { at = this.permille(E.deliveryFrom, E.deliveryTo); f.add('delivery.at.' + at); }
      due = (1 - left / total) * 1000 >= at;
    } else if (E.delivery2Enabled && !f.has('delivery2.done')) {
      let at = getAt('delivery2.at.'); if (at == null) { at = this.permille(E.delivery2From, E.delivery2To); f.add('delivery2.at.' + at); if (left * 1000 < 240 * total) { f.add('delivery2.done'); return; } }
      due = left * 1000 <= total * at; second = true;
    }
    if (!due) { this.readyAt = -1; return; }
    if (this.readyAt < 0) { this.readyAt = g.time + 20; return; }        // >= 20 s after the watch first saw it due
    if (g.time < this.readyAt) return;
    this.readyAt = -1; this.begin(K.Delivery, null, second);
  }
  // plan the heap once: a 26 degree cone around the hall centre (+-4 m), capped under the ceiling headroom
  planHeap(second) {
    const g = this.g, E = this.ev, f = g.field, total = g.billsTotal();
    const amount = Math.round(total * Math.round((second ? E.delivery2Share : E.deliveryShare) * 1e4) / 1e4);
    const off = E.deliveryOffset, cx = OX + HALF + (this.U() * 2 - 1) * off, cz = -(OZ + HALF) + (this.U() * 2 - 1) * off;
    const slope = Math.tan(E.deliverySlope * Math.PI / 180), cap = DELIV.ceiling - Math.max(3, E.deliveryHeadroom);
    const cells = [];
    for (let c = 0; c < f.n; c++) {
      if (f.noMoney[c]) continue;
      const x = OX + ((c % NX) + 0.5) * CELL, z = -(OZ + (((c / NX) | 0) + 0.5) * CELL);
      cells.push([c, Math.hypot(x - cx, z - cz), f.topY(c)]);
    }
    const volAt = (top) => { let v = 0; for (const [c, r, y] of cells) { const h = Math.min(cap, top - r * slope); if (h > y) v += (h - y) / NOTE_T; } return v; };
    let lo = -40, hi = cap + 80;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (volAt(m) < amount) lo = m; else hi = m; }
    const add = new Map(); let sum = 0;
    for (const [c, r, y] of cells) { const h = Math.min(cap, hi - r * slope); if (h > y) { const n = Math.floor((h - y) / NOTE_T); if (n > 0) { add.set(c, n); sum += n; } } }
    let bottom = Infinity; for (const [c] of add) bottom = Math.min(bottom, f.topY(c));
    return { add, sum, x: cx, z: cz, r: Math.min(18, (hi - bottom) / slope), bottom, landed: 0, amount };
  }
  tickDelivery(dt) {
    const s = this.s, g = this.g, pump = DELIV.pump[s.second ? 1 : 0], pumpStart = Math.max(4.2, s.duration - pump - DELIV.settle);
    if (s.elapsed >= pumpStart && !this.heap) { this.heap = this.planHeap(s.second); g.events.push({ type: 'deliveryPump', x: this.heap.x, z: this.heap.z }); }
    if (!this.heap) return;
    const h = this.heap, share = s.elapsed >= DELIV.allDown[s.second ? 1 : 0] ? 1 : clamp((s.elapsed - pumpStart) / (DELIV.allDown[s.second ? 1 : 0] - pumpStart), 0, 1);
    const want = Math.floor(h.sum * share);
    if (want > h.landed) {
      const k = want / h.sum, f = g.field; let landed = 0;
      for (const [c, n] of h.add) { const tgt = Math.floor(n * k), done = h.done ? h.done.get(c) || 0 : 0, put = tgt - done; if (put > 0) { f.addTop(c, put); f.visible += put; landed += put; (h.done ||= new Map()).set(c, tgt); } }
      if (landed > 0) { h.landed += landed; g.delivered += landed; f.markAll(); f.wakeAll(); }
    }
    if (share >= 1 && !h.notes) { h.notes = true; g.finds.layDelivery({ x: h.x, z: h.z, r: Math.max(3, h.r * 0.7), bottom: h.bottom + 0.5 }); }
    if (s.elapsed >= s.duration - 0.05 && h.landed >= h.sum) { g.events.push({ type: 'deliveryLanded', n: h.landed }); this.heap = null; }
  }
  save() { return { a: this.active, n: this.nextAt, l: this.last, st: this.started, r: this.rngS, s: this.s.kind && this.s.kind !== K.Crate && this.s.kind !== K.Delivery ? this.s : null }; }
  load(v) {
    this.reset(); if (!v) return;
    this.active = v.a || 0; this.nextAt = v.n ?? this.nextAt; this.last = v.l | 0; this.started = v.st | 0; this.rngS = v.r >>> 0 || this.rngS;
    if (v.s && v.s.kind) this.s = v.s;
  }
}
