// Co-op fun (rules/fun.md): shove / slap with parry and clash, vacuum pull, shredder ride, drone ride, wave. Pure JS.
// FunHost is the host's authority (FunHost / RideHost, frames at 30 Hz): it checks commands and raises 'fun' records as
// world events that every client applies; the target's own client launches its own body (the port's movement is
// client-side, like the original's). Helpers here are shared by the host and the clients (js/view/funplay.js).

export const FUN = {
  // FunConst (dump:581348)
  shoveReach: 2.4, shoveHeight: 1.8, shoveReachHost: 3.6, shoveHeightHost: 2.4, shoveCooldown: 24, shoveImmune: 78, parriedImmune: 75,
  rideCredit: 150, rideCooldown: 60, fizzle: 90, parryFrames: 11, parryCone: 100, guardCooldown: 36, guardCooldownHit: 12,
  pullRange: 7, pullKeepRange: 8.5, pullCone: 16, pullKeepCone: 24, pullClose: 1.1, pullMax: 120, pullImmune: 90, eye: 1.6, chest: 1.05,
  // CoopFun serialized (mb line 38) + code consts
  swingRadius: 0.5, billMargin: 0.3, swingWind: 0.09, shoveSpeed: 8.5, shoveLift: 9, shoveRepeat: 0.8, hitFreeze: 0.07,
  parrySpeed: 6, parryLift: 6, parryDown: 0.8, clashWindow: 0.6, burst: 12, slapNotes: 8, pullSpeed: 3.2, pullStop: 1.5,
  rideOut: 8, rideLift: 10, rideRepeat: 2.2, rideMargin: 0.25, rideLip: 0.35, hostRideCheck: 9, skidKeep: 0.85, skidTime: 0.32,
  getUpHoldMax: 4, maxAirTime: 4, shoveDown: 0.45, rideDown: 0.45, gravityUp: 24, gravityDown: 39.6, eyeDrop: -0.8,
  getUpBack: 0.625, getUpFront: 0.676,
  // RideConst (dump:585271) + DroneRide (mb line 70) + DroneTuning rider fields
  grabReach: 3.9, grabReachHost: 8, grabCone: 32, regrabFrames: 15, droneRest: 30, tiredRest: 150, maxRide: 1350,
  regrabDelay: 0.5, attachTime: 0.22, hangLength: 2.15, letGoAfter: 0.2, jumpOffUp: 3.2, feedRepeat: 20,
  riderSpeed: 0.8, riderAccel: 0.85, riderDrop: 2.1,
  // PlayerEmote (dump:635614)
  wave: 1.4333, shoveBusy: 0.45,
};
const FRAME = 30;
const flat = (a, b) => { const x = b[0] - a[0], z = b[2] - a[2], l = Math.hypot(x, z); return l < 0.05 ? null : [x / l, z / l]; };
// rise under gravity 24 then fall under 39.6 back to the same height (CoopFun.FlightSeconds)
export const flightSeconds = (up) => up / FUN.gravityUp + Math.sqrt(2 * (up * up / (2 * FUN.gravityUp)) / FUN.gravityDown);
// three.js forward of a yaw (0 looks toward -z)
export const yawFwd = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];
// FunMath.InVacuumCone: puller eye -> target chest, 3D; aim from yaw/pitch
export function inCone(eye, aim, chest, range, cone) {
  const v = [chest[0] - eye[0], chest[1] - eye[1], chest[2] - eye[2]], d = Math.hypot(v[0], v[1], v[2]);
  if (!(d > FUN.pullClose && d <= range)) return false;
  const c = (aim[0] * v[0] + aim[1] * v[1] + aim[2] * v[2]) / d;
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI <= cone;
}
export const aimOf = (yaw, pitch) => { const cp = Math.cos(pitch); return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp]; };
// CoopFun.FindSwingTarget: the camera ray against each friend's body segment (feet + 0.25 .. feet + 1.7)
export function swingTarget(eye, dir, feet, others) {
  let best = null, bd = Infinity;
  for (const o of others) {
    if (o.down) continue;
    const p = o.pos; if (Math.hypot(p[0] - feet[0], p[2] - feet[2]) > FUN.shoveReach || Math.abs(p[1] - feet[1]) > FUN.shoveHeight) continue;
    // closest points between the ray (eye + t·dir) and the vertical segment x=p.x, z=p.z, y in [p.y+0.25, p.y+1.7]
    const wx = eye[0] - p[0], wz = eye[2] - p[2], hd = Math.hypot(dir[0], dir[2]);
    const t = hd < 1e-6 ? 0 : -(wx * dir[0] + wz * dir[2]) / (hd * hd);
    if (t <= 0.05) continue;
    const y = Math.max(p[1] + 0.25, Math.min(p[1] + 1.7, eye[1] + dir[1] * t));
    const q = [eye[0] + dir[0] * t - p[0], eye[1] + dir[1] * t - y, eye[2] + dir[2] * t - p[2]], d = Math.hypot(q[0], q[1], q[2]);
    if (d <= FUN.swingRadius && d < bd) { bd = d; best = { id: o.id, along: t }; }
  }
  return best;
}
// Shredder.IntakeBounds: the world AABB of the Shredder/Intake trigger (hall scene box), expanded by 2·rideMargin
export function intakeBox(boxes) {
  const b = boxes.find(x => x.path === 'Shredder/Intake'); if (!b) return null;
  const m = b.m, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const l = [b.c[0] + sx * b.s[0] / 2, b.c[1] + sy * b.s[1] / 2, b.c[2] + sz * b.s[2] / 2];
    for (let k = 0; k < 3; k++) { const v = m[k] * l[0] + m[4 + k] * l[1] + m[8 + k] * l[2] + m[12 + k]; lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v); }
  }
  const e = FUN.rideMargin;   // "expanded by 2·rideMargin" = 0.25 m each side
  return { lo: lo.map(v => v - e), hi: hi.map(v => v + e), bottom: lo[1], mouth: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] };
}
export function inIntake(box, feet) {
  if (!box) return false;
  const p = [feet[0], feet[1] + 0.9, feet[2]];
  return p[0] >= box.lo[0] && p[0] <= box.hi[0] && p[1] >= box.lo[1] && p[1] <= box.hi[1] && p[2] >= box.lo[2] && p[2] <= box.hi[2] && feet[1] >= box.bottom - FUN.rideLip;
}

export class FunHost {
  constructor(game) { this.g = game; this.s = new Map(); this.ride = new Map(); this.droneRest = new Map(); }
  reset() { this.s.clear(); this.ride.clear(); this.droneRest.clear(); }
  get frame() { return Math.floor(this.g.time * FRAME); }
  st(id) {
    let s = this.s.get(id);
    if (!s) this.s.set(id, s = { shoveReady: 0, shoveImmune: 0, guard: false, guardFrame: 0, guardReady: 0, winding: false, windFrame: 0, lastShover: -1, lastShoveFrame: -1e9,
      pulledBy: -1, pullSince: 0, pullImmune: 0, rideReady: 0, regrab: 0 });
    return s;
  }
  present(id) { return id === 0 || this.g.guests.has(id); }
  pose(id) {
    const g = this.g;
    if (id === 0) return { pos: g.player.pos, yaw: g.player.yaw || 0, pitch: g.player.pitch || 0, tool: g.tool, using: !!g.hostUsing };
    const s = g.guests.get(id); if (!s || !s.input) return null;
    return { pos: s.player.pos, yaw: s.player.yaw || 0, pitch: s.player.pitch || 0, tool: s.tool, using: !!s.input.ph };
  }
  emit(e) { this.g.events.push({ type: 'fun', ...e }); }
  count(id, k) { const P = this.g.finale.player(id); P.c[k] = (P.c[k] || 0) + 1; }
  // ---- shove (FunHost.TryWind / TryRelease) ----
  wind(p, slap) {
    const s = this.st(p), f = this.frame;
    if (!this.present(p) || s.winding || f < s.shoveImmune) return false;
    s.winding = true; s.windFrame = f;
    if (s.guardReady <= f) { s.guard = true; s.guardFrame = f; s.guardReady = f + FUN.guardCooldown; }
    this.emit({ k: 'wind', a: p, on: true, slap: !!slap });
    return true;
  }
  cancel(p) { const s = this.st(p); if (s.winding) { s.winding = false; this.emit({ k: 'wind', a: p, on: false }); } }
  release(from, to, slap) {
    const A = this.st(from), f = this.frame, was = A.winding; A.winding = false;
    const reject = () => { if (was) this.emit({ k: 'wind', a: from, on: false }); return false; };
    if (to == null || to === from || !this.present(to) || !this.present(from) || f < A.shoveReady || f < A.shoveImmune) return reject();
    const pa = this.pose(from), pb = this.pose(to); if (!pa || !pb) return reject();
    if (Math.hypot(pb.pos[0] - pa.pos[0], pb.pos[2] - pa.pos[2]) > FUN.shoveReachHost || Math.abs(pb.pos[1] - pa.pos[1]) > FUN.shoveHeightHost) return reject();
    const dir = flat(pa.pos, pb.pos) || yawFwd(pa.yaw), B = this.st(to);
    // parry: the target armed its guard within 11 frames and faces the shover within 100°
    const toA = flat(pb.pos, pa.pos), fw = yawFwd(pb.yaw);
    const faces = !toA || Math.acos(Math.max(-1, Math.min(1, fw[0] * toA[0] + fw[1] * toA[1]))) * 180 / Math.PI <= FUN.parryCone;
    if (B.guard && f - B.guardFrame <= FUN.parryFrames && faces) {
      A.shoveReady = f + FUN.shoveCooldown; B.guard = false; B.guardReady = f + FUN.guardCooldownHit; A.shoveImmune = f + FUN.parriedImmune;
      this.count(to, 'parries'); this.count(from, 'parried');
      this.emit({ k: 'parry', a: from, b: to, f: [-dir[0], -dir[1]] });
      this.dropCarry(from);
      this.endRide(from, 3, to);
      return true;
    }
    if (f < B.shoveImmune) return reject();
    A.shoveReady = f + FUN.shoveCooldown; B.shoveImmune = f + FUN.shoveImmune; B.winding = false; B.guard = false;
    B.lastShover = from; B.lastShoveFrame = f;
    this.count(from, 'shoves'); this.count(to, 'shoved'); if (slap) this.count(from, 'slaps');
    this.emit({ k: 'shove', a: from, b: to, f: dir, slap: !!slap });
    this.dropCarry(to);
    this.endRide(to, 3, from);
    return true;
  }
  // PlayerController.Knockback -> PlayerCarry.Drop: a carried find (note, relic, crate) falls where the player stood
  dropCarry(id) {
    const g = this.g, s = id === 0 ? null : g.guests.get(id), F = id === 0 ? g.finds : s && s.finds; if (!F || !F.carry) return;
    const it = F.carry, p = (id === 0 ? g.player : s.player).pos;
    F.carry = null; it.state = 'loose'; it.by = 0; it.pos = [p[0], p[1] + 1, p[2]]; it.vy = 1.2;
    g.events.push({ type: 'carryDrop', kind: it.kind, who: id });
  }
  // ---- shredder ride (FunHost.TryRide): the rider's client already flew; the host credits the last shover ----
  rideShredder(p) {
    const s = this.st(p), f = this.frame, pose = this.pose(p), mouth = this.g.markers.shredderIntake;
    if (!this.present(p) || f < s.rideReady || !pose) return false;
    if (Math.hypot(pose.pos[0] - mouth[0], pose.pos[1] - mouth[1], pose.pos[2] - mouth[2]) > FUN.hostRideCheck) return false;
    s.rideReady = f + FUN.rideCooldown;
    const by = s.lastShover >= 0 && this.present(s.lastShover) && f - s.lastShoveFrame <= FUN.rideCredit ? s.lastShover : -1;
    s.lastShover = -1;
    this.count(p, 'shredded'); if (by >= 0) this.count(by, 'shred_assists');
    this.emit({ k: 'ride', a: p, by });
    return true;
  }
  // ---- drone ride (RideHost.TryGrab / Evaluate) ----
  rideStatus(d) {
    if (!d) return 'gone';
    if (d.state === 'outbound' || d.state === 'dig' || d.state === 'inbound') { const z = -d.pos[2]; return z < -2 ? 'drop' : z < 1.5 ? 'hold' : 'open'; }   // Unity z (three z flipped)
    return d.state === 'dump' ? 'drop' : 'gone';
  }
  grab(p, i) {
    const s = this.st(p), f = this.frame, d = this.g.drones[i], pose = this.pose(p);
    const taken = [...this.ride.values()].some(r => r.drone === i);
    if (!this.present(p) || !d || taken || this.ride.has(p) || f < s.regrab || f < (this.droneRest.get(i) || 0) || this.rideStatus(d) !== 'open' || !pose) { this.emit({ k: 'grabNo', a: p }); return false; }
    const eye = [pose.pos[0], pose.pos[1] + FUN.eye, pose.pos[2]];
    if (Math.hypot(d.pos[0] - eye[0], d.pos[1] - eye[1], d.pos[2] - eye[2]) > FUN.grabReachHost) { this.emit({ k: 'grabNo', a: p }); return false; }
    this.ride.set(p, { drone: i, at: f }); d.rider = p;
    this.count(p, 'rides');
    this.emit({ k: 'grab', a: p, d: i });
    return true;
  }
  letGo(p, jump) { this.endRide(p, 0, -1, jump); }
  endRide(p, why, by = -1, jump = false) {
    const r = this.ride.get(p); if (!r) return;
    this.ride.delete(p); const d = this.g.drones[r.drone]; if (d) d.rider = undefined;
    const f = this.frame; this.st(p).regrab = f + FUN.regrabFrames; this.droneRest.set(r.drone, f + (why === 2 ? FUN.tiredRest : FUN.droneRest));
    this.emit({ k: 'release', a: p, d: r.drone, why, by, jump: !!jump });
  }
  // ---- each host frame: wind fizzle, guard drop, pulls, ride ends ----
  step() {
    const f = this.frame, ids = [0, ...this.g.guests.keys()];
    for (const id of ids) {
      const s = this.st(id);
      if (s.winding && f - s.windFrame > FUN.fizzle) { s.winding = false; this.emit({ k: 'wind', a: id, on: false }); }
      if (s.guard && f - s.guardFrame > FUN.parryFrames) s.guard = false;
    }
    for (const id of [...this.s.keys()]) if (!this.present(id)) { if (this.ride.has(id)) this.endRide(id, 4); this.s.delete(id); }
    for (const [p, r] of this.ride) {
      const st = this.rideStatus(this.g.drones[r.drone]);
      if (st === 'drop') this.endRide(p, 1); else if (st === 'gone') this.endRide(p, 5); else if (f - r.at >= FUN.maxRide) this.endRide(p, 2);
    }
    if (ids.length < 2) return;
    // vacuum pull (EvaluatePulls): derived from poses, no command
    const poses = new Map(ids.map(id => [id, this.pose(id)]));
    const pulls = (pp, tp, range, cone) => pp && tp && pp.tool === 3 && pp.using && inCone([pp.pos[0], pp.pos[1] + FUN.eye, pp.pos[2]], aimOf(pp.yaw, pp.pitch), [tp.pos[0], tp.pos[1] + FUN.chest, tp.pos[2]], range, cone);
    for (const t of ids) {
      const s = this.st(t), tp = poses.get(t);
      if (s.pulledBy >= 0) {
        if (!this.present(s.pulledBy) || f - s.pullSince >= FUN.pullMax || !pulls(poses.get(s.pulledBy), tp, FUN.pullKeepRange, FUN.pullKeepCone)) {
          this.emit({ k: 'pull', a: s.pulledBy, b: t, on: false }); s.pulledBy = -1; s.pullImmune = f + FUN.pullImmune;
        }
        continue;
      }
      if (f < s.pullImmune || this.ride.has(t)) continue;
      let best = -1, bs = Infinity;
      for (const p of ids) {
        if (p === t) continue; const pp = poses.get(p);
        if (!pulls(pp, tp, FUN.pullRange, FUN.pullCone)) continue;
        const eye = [pp.pos[0], pp.pos[1] + FUN.eye, pp.pos[2]], ch = [tp.pos[0], tp.pos[1] + FUN.chest, tp.pos[2]], v = [ch[0] - eye[0], ch[1] - eye[1], ch[2] - eye[2]], d = Math.hypot(...v), a = aimOf(pp.yaw, pp.pitch);
        const ang = Math.acos(Math.max(-1, Math.min(1, (a[0] * v[0] + a[1] * v[1] + a[2] * v[2]) / d))) * 180 / Math.PI, score = ang * 0.1 + d;
        if (score < bs) { bs = score; best = p; }
      }
      if (best >= 0) { s.pulledBy = best; s.pullSince = f; this.count(best, 'pulls'); this.count(t, 'pulled'); this.emit({ k: 'pull', a: best, b: t, on: true }); }
    }
  }
  // what a client needs each tick: who rides which drone, who is pulled by whom
  wire() {
    const o = { r: {}, p: {} };
    for (const [p, r] of this.ride) o.r[p] = r.drone;
    for (const [id, s] of this.s) if (s.pulledBy >= 0) o.p[id] = s.pulledBy;
    return o;
  }
}
