// Act I ending (rules/finale.md): clear every bundle -> Pockets' call -> golden key toss -> pick it up -> open the big door
// -> walk into the light -> arrest cinematic + BUSTED! summary (view) -> encore lever rounds. Also the run timer (RunMath),
// the per-tool share of the run, the goal card stages (ObjectiveHud) and the million/billion moments (BillionMoment).
// Full game only: the demo/gold-realm branches (gold pool, gold perks, prestige, hatch) are dead in this build (§A, §J).
// Pure JS. Coordinates are three.js world (Unity z flipped).
import { SRC } from './economy.js';

export const FL = { CLEAN: 'ending.clean', KEYDROP: 'ending.key', KEY: 'item.golden_key', OPEN: 'area.reserve', FINALE: 'event.finale', STAY: 'encore.stay' };
export const DOOR = [0, -36, -46];                 // VaultLayout.ReserveDoorPoint (0,-36,46)
export const KEYPT = [0, -36, -43.5];              // VaultLayout.GoldenKeyPoint (0,-36,43.5)
export const KEYHOLE = [0, -32.33, -46.43];        // ReserveDoor/KeyholeHalo/Halo (hall scene.json)
const BD = { poll: 0.25, live: 3, callDelay: 2.2, callDelayLoaded: 1.5, callDeadline: 25, keyPage: 2, lightDepth: 2.2, whiteRate: 2.5 };
const KEY = { poll: 0.2, riseTime: 1.1, flyTime: 0.6, pickupRange: 3.2, aimRadius: 0.7, restHeight: 0.123, quietStart: 1.5 };
export const KS = { Buried: 0, Rising: 1, Idle: 2, Sinking: 3, Flying: 4, Gone: 5 };
const DOORT = { interactRange: 5.5, lockedToastCooldown: 3, rattle: 0.5, open: 2.6, swingFrom: 2.35, swingLen: 3.25, settleTime: 2.2, restSpill: 0.35 };
export const DS = { Closed: 0, Opening: 1, Open: 2 };
const LEVER = { hold: 0.6, reach: 2.8 };
const CREW = { drawIn: 60, emptyReset: 3, remoteSlack: 1.2 };   // WaitClock drawInSeconds 60; RemoteSlack (F/EndingRules.c)
// RunAward rules in order (F/RunMath.c:668-1038): [text key, score(player), min]
const AWARDS = [
  ['mvp', (p) => p.dollars[0] + p.dollars[1] + p.dollars[2] + p.dollars[3] + p.dollars[4], 0], ['bare_hands', (p) => p.dollars[0], 0],
  ['vacuum_king', (p) => p.dollars[3], 0], ['shovel_hero', (p) => p.dollars[2], 0], ['bucket_brigade', (p) => p.dollars[1], 0],
  ['drone_boss', (p) => p.droneUpgrades, 0], ['gold_digger', (p) => p.goldBars, 0], ['explorer', (p) => p.deepest * 20 + p.distance, 1],
  ['big_spender', (p) => p.upgrades, 0], ['bulldozer', (p) => p.c.shoves || 0, 0], ['tractor_beam', (p) => p.c.pulls || 0, 0],
  ['paper_cut', (p) => p.c.shredded || 0, 0], ['prankster', (p) => p.c.shred_assists || 0, 0], ['pallet_hunter', (p) => p.c.pallets || 0, 0],
  ['frequent_flyer', (p) => p.c.rides || 0, 0],
];
export const runPlayer = (name) => ({ name, dollars: [0, 0, 0, 0, 0, 0], bills: 0, goldBars: 0, upgrades: 0, droneUpgrades: 0, distance: 0, deepest: 0, c: {} });
// RunMath.Awards(players, perPlayer 2): the single top scorer above min and above the runner-up, at most 2 each (co-op only)
export function runAwards(players, perPlayer = 2) {
  const ids = Object.keys(players), held = {}, out = {};
  if (ids.length < 2) return out;
  for (const [key, score, min] of AWARDS) {
    let best = null, bv = -Infinity, second = -Infinity;
    for (const id of ids) { const v = score(players[id]); if (v > bv) { second = bv; bv = v; best = id; } else if (v > second) second = v; }
    if (best == null || !(bv > min) || !(bv > second) || (held[best] || 0) >= perPlayer) continue;
    held[best] = (held[best] || 0) + 1; (out[best] = out[best] || []).push(key);
  }
  return out;
}
export const STAGE = { Billion: 0, Key: 1, Door: 2, Clear: 4, Done: 6, Call: 11, Exit: 12 };
const MOMENTS = [1e6, 1e9];
// RunTool: Hand 0, Bucket 1, Shovel 2, Vacuum 3, AutoPump 4, Drones 5 (RunMath.ToolOf; Heave is the bucket's move)
const TOOL_OF = { [SRC.Hand]: 0, [SRC.Bucket]: 1, [SRC.Heave]: 1, [SRC.Shovel]: 2, [SRC.Vacuum]: 3, [SRC.AutoPump]: 4, [SRC.Drone]: 5 };
const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
const outBack = (k, s) => { const t = k - 1; return t * t * ((s + 1) * t + s) + 1; };
export const inOutCubic = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
// GoldenKey toss arc (V/GoldenKey.c:302-325): falls from 7 m and bounces twice
export function tossArc(t) {
  if (t < 0.55) return 7 * (1 - (t / 0.55) ** 2);
  if (t < 0.85) { const u = (t - 0.55) / 0.3; return 1.8 * u * (1 - u); }
  if (t < 1) { const u = (t - 0.85) / 0.15; return 0.4 * u * (1 - u); }
  return 0;
}
// RunMath.Clock: tenths, "{m}:{ss}.{t}" under an hour, else "{h}:{mm}:{ss}.{t}" (f25 "2:34:41.7")
export function runClock(s) {
  const T = Math.floor(Math.min(359999.9, Math.max(0, s || 0)) * 10 + 1e-6), t = T % 10, S = Math.floor(T / 10);
  const h = Math.floor(S / 3600), m = Math.floor(S / 60) % 60, ss = String(S % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}.${t}` : `${m}:${ss}.${t}`;
}
// EndingRules.depth / inside (F/EndingRules.c): depth past the door plane inside the passage box
export function lightDepth(p) {
  const inBox = Math.abs(p[0] - DOOR[0]) <= 5.5 && p[1] >= DOOR[1] - 1.5 && p[1] <= DOOR[1] + 8.5;
  return inBox ? (-p[2]) - (-DOOR[2]) : -1;
}
export const outsideDoor = () => [DOOR[0], DOOR[1] + 0.1, DOOR[2] + 3.5];

export class Finale {
  constructor(game) { this.g = game; this.lever = null; this.reset(); }
  reset() {
    this.pollT = 0; this.liveAt = BD.live; this.seenFull = false; this.firstPoll = -1;
    this.call = null;                         // {due, deadline, started, played, playing, page}
    this.key = { state: KS.Buried, t: 0, pollT: 0, quietUntil: KEY.quietStart, toast: false, aimed: false };
    this.door = { state: DS.Closed, t: 0, halo: 0.25, rattleT: -1, toastAt: -99, spill: 0, aimed: false };
    this.whiteK = 0; this.lightOn = false;
    this.run = { seconds: 0, finished: false, finaleSeconds: 0, timed: true, tools: [0, 0, 0, 0, 0, 0], shredded: 0, biggest: 0, players: {} };
    this.crew = { first: -1, emptyAt: -1, inside: 0, total: 1, left: CREW.drawIn };
    this.moments = 0;                          // bitmask of passed BillionMoment steps
    this.leverHold = 0; this.leverAimed = false;
    this.round = null;                         // encore round watch {n, seenFull}
    this.goal = { stage: -1, since: 0 };
  }
  get flags() { return this.g.flags; }
  has(f) { return this.g.flags.has(f); }
  set(f) { if (!this.g.flags.has(f)) { this.g.flags.add(f); this.g.events.push({ type: 'flag', key: f }); } }

  // ---- RunMath ----
  book(res, who = 0) {                       // IncomeService deposit -> RunMath.Deposit (per-tool dollars, per player by Actor)
    const r = this.run; if (r.finished) return;
    const t = TOOL_OF[res.source]; if (t != null) r.tools[t] += res.dollars;
    if (t != null && this.g.guests.size + Object.keys(r.players).length > 0) { const p = this.player(t === 5 ? 0 : who); p.dollars[t] += res.dollars; }
    r.shredded += res.dollars; if (res.dollars > r.biggest) r.biggest = res.dollars;
  }
  player(who) { const ps = this.run.players; return ps[who] || (ps[who] = runPlayer(who === 0 ? this.g.hostName || '' : (this.g.guests.get(who) || {}).name || '')); }
  favourite() { const t = this.run.tools; let b = -1, bv = 0; for (let i = 0; i < 5; i++) if (t[i] > bv) { bv = t[i]; b = i; } return b; }

  // ---- pile ----
  remaining() { return this.g.vaultLeft(); }
  total() { return this.g.billsTotal(); }
  static clean(rem, total) { return total > 0 && isFinite(rem) && rem < 0.5; }
  clearedValue() { const t = this.total(); return t > 0 ? Math.floor(clamp01(1 - this.remaining() / t) * 10000) : 0; }

  // ---- goal card (ObjectiveHud.endingStage) ----
  stage() {
    const dollars = this.g.econ.stats.tracked.DollarsEarned || 0;
    if (this.has(FL.FINALE)) return STAGE.Done;
    if (this.has(FL.OPEN)) return STAGE.Exit;
    if (this.has(FL.KEY)) return STAGE.Door;
    if (this.has(FL.KEYDROP)) return STAGE.Key;
    if (this.has(FL.CLEAN)) return STAGE.Call;
    return dollars < 1e9 ? STAGE.Billion : STAGE.Clear;
  }
  card() {
    const st = this.stage(), d = this.g.econ.stats.tracked.DollarsEarned || 0;
    if (st === STAGE.Billion) return { stage: st, key: 'finale.goal.billion_usd', fill: clamp01(d / 1e9), dollars: d };
    if (st === STAGE.Clear) { const v = this.clearedValue(); return { stage: st, key: 'finale.goal.clear', fill: v / 10000, pct: Math.floor(v / 100) }; }
    if (st === STAGE.Key) return { stage: st, key: 'ending.goal.key', arrow: [KEYPT[0], KEYPT[1] + 0.25, KEYPT[2]] };
    if (st === STAGE.Door) return { stage: st, key: 'ending.goal.door', arrow: [DOOR[0], DOOR[1] + 5.4, DOOR[2] + 0.6] };   // doorAim (0,5.4,-0.6)
    if (st === STAGE.Exit) return { stage: st, key: 'ending.goal.exit' };
    return null;                              // Call, Done: card dropped
  }

  // ---- per frame ----
  step(dt, input) {
    const g = this.g, now = g.time;
    if (!this.run.finished) this.run.seconds += Math.min(dt, 1);
    // BillionMoment: crossing 1e6 / 1e9 dollars shredded
    const d = g.econ.stats.tracked.DollarsEarned || 0;
    MOMENTS.forEach((v, i) => { if (!(this.moments & (1 << i)) && d >= v) { this.moments |= 1 << i; g.events.push({ type: 'bigMoment', step: v }); } });
    this.pollT -= dt; if (this.pollT <= 0) { this.pollT = BD.poll; this.host(now); }
    this.stepCall(now);
    this.stepKey(dt, input, now);
    this.stepDoor(dt, input, now);
    this.stepLight(dt, input);
    this.stepLever(dt, input);
  }
  host(now) {                                 // BustedDirector.Host
    if (!this.has(FL.CLEAN)) {
      if (this.total() <= 0) return;
      if (this.remaining() >= 0.5) { this.seenFull = true; return; }
      if (this.firstPoll < 0) this.firstPoll = now;
      if (this.seenFull || now - this.firstPoll >= 5) {
        this.set(FL.CLEAN);
        if (now >= this.liveAt) this.call = { due: now + BD.callDelay, deadline: now + BD.callDelay + BD.callDeadline, started: false, played: false, playing: false, page: -1 };
      }
      return;
    }
    if (this.has(FL.KEYDROP)) return;
    if (!this.call && now > this.liveAt) this.call = { due: now + BD.callDelayLoaded, deadline: now + BD.callDelayLoaded + BD.callDeadline, started: false, played: false, playing: false, page: -1 };
    const c = this.call; if (!c) return;
    if ((c.played && !c.playing) || (c.playing && c.page >= BD.keyPage) || (c.deadline > 0 && c.deadline < now)) this.set(FL.KEYDROP);
  }
  stepCall(now) {
    const c = this.call; if (!c || c.started || now < c.due) return;
    c.started = true; c.playing = true; c.page = 0;
    this.g.events.push({ type: 'endingCall', pages: [['ending.call.p1', 2], ['ending.call.p2', 1], ['ending.call.p3', 3], ['ending.call.p4', 1]] });
  }
  callPage(p) { if (this.call) this.call.page = p; }
  callDone() { if (this.call) { this.call.playing = false; this.call.played = true; } }

  // ---- golden key (GoldenKey) ----
  keyPos() {
    const k = this.key;
    if (k.state === KS.Rising) return [KEYPT[0], KEYPT[1] + KEY.restHeight + tossArc(clamp01(k.t / KEY.riseTime)), KEYPT[2]];
    return [KEYPT[0], KEYPT[1] + KEY.restHeight, KEYPT[2]];
  }
  keyAimed(eye, dir, feet) {
    const p = this.keyPos(), v = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const t = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
    if (t > 0 && t <= KEY.pickupRange) { const off = Math.hypot(v[0] - dir[0] * t, v[1] - dir[1] * t, v[2] - dir[2] * t); if (off <= 0.08 * t + KEY.aimRadius) return true; }
    const dx = p[0] - feet[0], dz = p[2] - feet[2], dy = p[1] - feet[1];
    return dx * dx + dz * dz < 1.44 && t > -0.2 && Math.abs(dy) < 2.2;
  }
  stepKey(dt, input, now) {
    const k = this.key; k.t += dt; k.pollT -= dt;
    if (k.pollT <= 0) {
      k.pollT = KEY.poll;
      if (this.has(FL.KEY)) { if (k.state !== KS.Flying) k.state = KS.Gone; }
      else if (this.has(FL.KEYDROP) && k.state === KS.Buried) {
        const quiet = now < k.quietUntil;
        if (quiet) { k.state = KS.Idle; k.t = 0; }
        else { k.state = KS.Rising; k.t = 0; this.g.events.push({ type: 'keyReveal', toast: !k.toast }); k.toast = true; }
      } else if (!this.has(FL.KEYDROP) && (k.state === KS.Idle || k.state === KS.Rising || k.state === KS.Gone)) { k.state = KS.Buried; k.t = 0; }
    }
    if (k.state === KS.Rising && k.t >= KEY.riseTime) { k.state = KS.Idle; k.t = 0; }
    if (k.state === KS.Flying && k.t >= KEY.flyTime) { k.state = KS.Gone; k.t = 0; }
    k.aimed = k.state === KS.Idle && !!input.eye && this.keyAimed(input.eye, input.dir, input.feet || this.g.player.pos);
    if (k.aimed && input.interactPressed) {
      input.interactPressed = false; this.set(FL.KEY); k.state = KS.Flying; k.t = 0;
      this.g.events.push({ type: 'keyPickup' });
    }
  }

  // a co-op guest's Interact on the key or the door (WorldHostGlue.Allowed: key <= 8 m, door needs the key); the
  // aimed flags stay the host's, the guest's client computes its own (aimOnly)
  guestInput(input) {
    if (!input.eye || !input.interactPressed) return;
    const k = this.key, feet = input.feet || this.g.player.pos;
    if (k.state === KS.Idle && this.keyAimed(input.eye, input.dir, feet)) {
      input.interactPressed = false; this.set(FL.KEY); k.state = KS.Flying; k.t = 0; this.g.events.push({ type: 'keyPickup' }); return;
    }
    const D = this.door;
    if (D.state === DS.Closed && this.doorAimed(input.eye, input.dir)) {
      input.interactPressed = false;
      if (this.sealed) this.g.events.push({ type: 'toastKey', key: 'toast.door_sealed' });
      else if (!this.has(FL.KEY)) { D.rattleT = 0; this.g.events.push({ type: 'doorLocked' }); }
      else { D.state = DS.Opening; D.t = 0; this.g.events.push({ type: 'doorBegin' }); }
    }
  }
  // the guest's own prompts (no state change)
  aimOnly(input) {
    const k = this.key, D = this.door;
    k.aimed = k.state === KS.Idle && !!input.eye && this.keyAimed(input.eye, input.dir, input.feet || this.g.player.pos);
    D.aimed = D.state === DS.Closed && !!input.eye && this.doorAimed(input.eye, input.dir);
    this.leverAimed = false;
  }

  // ---- the big door (ReserveDoor) ----
  get sealed() { return this.has(FL.FINALE); }
  doorAimed(eye, dir) {
    const v = [KEYHOLE[0] - eye[0], KEYHOLE[1] - eye[1], KEYHOLE[2] - eye[2]];
    if (Math.hypot(v[0], v[1], v[2]) > DOORT.interactRange + 1.5) return false;
    // ray against the door plane (z = KEYHOLE.z): hit within the leaf (radius ~3.5 m) and within interactRange
    if (Math.abs(dir[2]) < 1e-3) return false;
    const t = v[2] / dir[2]; if (t <= 0 || t > DOORT.interactRange) return false;
    const hx = eye[0] + dir[0] * t - KEYHOLE[0], hy = eye[1] + dir[1] * t - KEYHOLE[1];
    return hx * hx + hy * hy <= 3.5 * 3.5;
  }
  stepDoor(dt, input, now) {
    const D = this.door, held = this.has(FL.KEY);
    if (this.sealed && D.state !== DS.Closed) { D.state = DS.Closed; D.t = 0; D.spill = 0; this.g.events.push({ type: 'doorSnap' }); }
    D.halo += ((held ? 1 : 0.25) - D.halo) * (1 - Math.exp(-4 * dt));
    if (D.rattleT >= 0) { D.rattleT += dt; if (D.rattleT >= DOORT.rattle) D.rattleT = -1; }
    if (D.state === DS.Closed) {
      if (this.has(FL.OPEN) && !this.sealed) { D.state = DS.Open; D.t = 99; D.spill = DOORT.restSpill; this.g.events.push({ type: 'doorBlockers', on: false }); }
      D.aimed = !!input.eye && this.doorAimed(input.eye, input.dir);
      if (D.aimed && input.interactPressed) {
        input.interactPressed = false;
        if (this.sealed) this.g.events.push({ type: 'toastKey', key: 'toast.door_sealed' });
        else if (!held) { D.rattleT = 0; if (now - D.toastAt >= DOORT.lockedToastCooldown) { D.toastAt = now; this.g.events.push({ type: 'doorLocked' }); } }
        else { D.state = DS.Opening; D.t = 0; this.g.events.push({ type: 'doorBegin' }); }
      }
    } else if (D.state === DS.Opening) {
      const t0 = D.t; D.t += dt; const t = D.t; D.aimed = false;
      for (let q = 1; q <= 8; q++) { const at = 0.15 + 1.2 * q / 8; if (t0 < at && t >= at) this.g.events.push({ type: 'doorClick', q }); }
      if (t0 < 2.0 && t >= 2.0) this.g.events.push({ type: 'doorClunk' });
      if (t0 < DOORT.open && t >= DOORT.open) { this.set(FL.OPEN); this.g.events.push({ type: 'doorOpen' }); this.g.events.push({ type: 'doorBlockers', on: false }); }
      D.spill = 0.25 * clamp01((t - 2) / 0.3) + 0.75 * clamp01((t - 2.35) / 1.8);
      if (t >= DOORT.swingFrom + DOORT.swingLen) { D.state = DS.Open; D.t = 0; }
    } else {
      D.t += dt; D.aimed = false;
      D.spill = 1 + (DOORT.restSpill - 1) * inOutCubic(clamp01(D.t / DOORT.settleTime));
    }
  }
  // door pose for the view: wheel angle (deg), bolt retract 0..1 per bolt, unseat 0..1, swing angle (deg), rattle angle (deg)
  doorPose() {
    const D = this.door, t = D.state === DS.Closed ? 0 : D.state === DS.Open ? 99 : D.t;
    const k = D.rattleT >= 0 ? clamp01(2 * D.rattleT) : 1;
    return {
      wheel: -720 * clamp01((t - 0.15) / 1.2) + (D.rattleT >= 0 ? 9 * Math.sin(6 * Math.PI * k) * (1 - k) : 0),
      bolts: Array.from({ length: 8 }, (_, i) => clamp01((t - 1.2 - 0.045 * i) / 0.22)),
      unseat: clamp01((t - 2.0) / 0.25),
      swing: 90 * clamp01((t - DOORT.swingFrom) / DOORT.swingLen),
      halo: D.halo, spill: D.spill,
    };
  }

  // ---- walk into the light (BustedDirector.TickLight) ----
  stepLight(dt, input) {
    this.lightOn = this.has(FL.OPEN) && !this.has(FL.FINALE);
    if (!this.lightOn) { this.whiteK = Math.max(0, this.whiteK - BD.whiteRate * dt); return; }
    const depth = lightDepth(input.feet || this.g.player.pos);
    const target = clamp01(depth / Math.max(0.5, BD.lightDepth));
    this.whiteK += Math.sign(target - this.whiteK) * Math.min(Math.abs(target - this.whiteK), BD.whiteRate * dt);
    if (this.g.client) return;                             // a guest's screen goes white, the host decides
    // WaitClock(inside, total, now, 60): everyone inside, or 60 s after the first one went in (solo: the first frame inside)
    const now = this.g.time, C = this.crew, guests = [...this.g.guests.values()];
    let inside = depth >= BD.lightDepth ? 1 : 0;
    for (const s of guests) if (lightDepth(s.player.pos) >= Math.max(0.5, BD.lightDepth - CREW.remoteSlack)) inside++;
    C.inside = inside; C.total = 1 + guests.length;
    if (inside < 1) { if (C.first >= 0 && C.emptyAt < 0) C.emptyAt = now; if (C.emptyAt >= 0 && now - C.emptyAt >= CREW.emptyReset) { C.first = -1; C.emptyAt = -1; } C.left = CREW.drawIn; return; }
    C.emptyAt = -1; if (C.first < 0) C.first = now;
    C.left = Math.max(0, CREW.drawIn - (now - C.first));
    if (inside >= Math.max(1, C.total) || now - C.first >= CREW.drawIn) this.beginFinale();
  }
  beginFinale() {
    if (this.has(FL.FINALE)) return;
    const r = this.run; r.finaleSeconds = r.seconds; r.finished = true;
    this.set(FL.FINALE); this.whiteK = 1;
    const crew = this.g.guests.size > 0 || Object.keys(r.players).length > 1;
    this.g.events.push({ type: 'finale', seconds: r.finaleSeconds, players: 1 + this.g.guests.size, awards: crew ? runAwards(r.players) : null });
  }

  // ---- encore (Encore + RefillLever) ----
  loops() { let n = 0; while (n < 9999 && this.has('encore.on.' + (n + 1))) n++; return n; }
  roundClean(n) { return this.has('encore.clean.' + n); }
  leverReady() { const L = this.loops(); return this.has(FL.FINALE) && (L === 0 || this.roundClean(L)); }
  movesOff() { const L = this.loops(); return this.has(FL.CLEAN) && (L === 0 || this.roundClean(L)); }
  stamp(prefix) { const k = [...this.g.flags].find(x => x.startsWith(prefix)); return k ? +k.slice(prefix.length) : null; }
  best() { let b = 0; for (let n = 1; n <= this.loops(); n++) { if (!this.roundClean(n)) continue; const t = this.stamp(`encore.time.${n}.`); if (t > 0 && (!b || t < b)) b = t; } return b; }
  stepLever(dt, input) {
    const g = this.g, L = this.lever;
    this.leverAimed = false;
    if (L && this.leverReady() && input.feet) {
      const f = input.feet; this.leverAimed = Math.hypot(f[0] - L[0], f[2] - L[2]) <= LEVER.reach && Math.abs(f[1] - L[1]) < 2.5;
    }
    this.leverHold = this.leverAimed && input.interactHeld ? this.leverHold + dt : 0;
    if (this.leverHold >= LEVER.hold) { this.leverHold = 0; this.pull(); }
    // round end: after the pile was seen full, the clean rule stamps the round time
    const n = this.loops();
    if (n > 0 && !this.roundClean(n)) {
      const rem = this.remaining();
      if (!this.round || this.round.n !== n) this.round = { n, seenFull: false };
      if (rem >= 0.5) this.round.seenFull = true;
      else if (this.round.seenFull && Finale.clean(rem, this.total())) {
        const start = this.stamp(`encore.start.${n}.`) || 0, secs = Math.max(1, Math.round((g.econ.stats.tracked.TimePlayedSeconds || 0) - start));
        this.set(`encore.time.${n}.${secs}`); this.set('encore.clean.' + n);
        g.events.push({ type: 'encoreDone', n, seconds: secs, best: this.best() });
      }
    }
  }
  pull() {
    if (!this.leverReady()) return false;
    const g = this.g, n = this.loops() + 1;
    this.set('encore.on.' + n);
    this.set(`encore.start.${n}.${Math.round(g.econ.stats.tracked.TimePlayedSeconds || 0)}`);
    g.field.resetToLevel(1); g.field.revealed = 0; g.delivered = 0;
    this.round = { n, seenFull: true };
    g.events.push({ type: 'encoreGo', n });
    return true;
  }

  // ---- save ----
  save() { return { v: 1, run: this.run, m: this.moments, sf: this.seenFull, call: this.call && { played: this.call.played } }; }
  load(s) {
    this.reset();
    if (!s) { this.run.timed = false; return; }           // a save older than the run timer: summary says "untimed"
    if (s.run) Object.assign(this.run, s.run);
    this.moments = s.m | 0; this.seenFull = !!s.sf;
    if (s.call && s.call.played) this.call = { due: 0, deadline: 0, started: true, played: true, playing: false, page: 4 };
    this.key.quietUntil = this.g.time + KEY.quietStart;
  }
  // a load must not replay the moments already passed
  primeMoments() { const d = this.g.econ.stats.tracked.DollarsEarned || 0; MOMENTS.forEach((v, i) => { if (d >= v) this.moments |= 1 << i; }); }
}
