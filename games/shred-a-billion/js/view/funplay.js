// The local player's side of co-op fun (rules/fun.md; CoopFun / DroneRide on the client): LMB on a friend shoves (or
// slaps with cash in hand) after a 0.09 s wind-up, the host decides; a shoved player's own client launches its body
// (8.5·dir + 9 up), lands, lies down 0.45 s and gets up; vacuum pulls drag the target; walking into the shredder spits
// you out (solo too); Interact grabs a passing drone and hangs under it; the wave emote. Feed toasts with names.
import { FUN, swingTarget, flightSeconds, inIntake } from '../sim/fun.js';

export class FunPlay {
  // o: { game, player, T, hud, sfx, fx, coarse, intake, coop(): bool, me(): id, send(cmd): void, others(): [{ id, pos }], nameOf(id), runCount(id, key) }
  constructor(o) {
    Object.assign(this, o);
    this.now = 0; this.nextShove = 0; this.wind = null; this.fall = null; this.pulledBy = -1; this.rideReady = 0; this.emote = 0; this.waveUntil = 0;
    this.down = new Map(); this.parries = []; this.hinted = false; this.hang = null; this.regrabAt = 0; this.feedAt = new Map(); this.arrivedAt = -99; this.roll = 0;
    this.offer = null;
  }
  stunned() { return !!this.fall; }
  // pose for the others: 0 up, 1 in the air, 2 down, 3 getting up; back = falls on the back (GetUpBack)
  downState() { const F = this.fall; return !F ? 0 : F.phase === 'down' ? 2 : F.phase === 'up' ? 3 : 1; }
  downBack() { return !!this.fall && this.fall.getUp === FUN.getUpBack; }
  blocked() { return !!this.fall || !!this.hang; }       // no walking, jumping or tools
  busy() { return this.now < this.waveUntil || !!this.wind; }
  // ---- before the sim step: input in, input out ----
  beforeStep(dt, inp, keys) {
    this.now += dt;
    const g = this.game, P = this.player, coop = this.coop();
    if (this.fall || this.hang) {
      const out = { ...inp, primaryHeld: false, primaryPressed: false, secondaryPressed: false, secondaryHeld: false, rallyPressed: false };
      if (this.hang) { out.interactPressed = false; if (this.now - this.hang.at >= FUN.letGoAfter && (keys.jump || inp.interactPressed)) this.letGo(!!keys.jump); }
      else out.interactPressed = false;
      return out;
    }
    // wave (Emote; default key UNKNOWN, G here [inferred]): 1.4333 s, hands busy
    if (keys.wave && !this.busy() && !g.finds.carry) { this.waveUntil = this.now + FUN.wave; this.emote++; }
    if (this.now < this.waveUntil) inp = { ...inp, primaryHeld: false, primaryPressed: false, secondaryPressed: false };
    // the wind-up releases by itself after swingWind
    if (this.wind && this.now - this.wind.at >= FUN.swingWind) { this.send({ f: 'release', to: this.wind.to, slap: this.wind.slap }); this.nextShove = this.now + FUN.shoveRepeat; this.wind = null; this.busyUntil = this.now + FUN.shoveBusy; }
    // shove: Primary press on a friend in reach (co-op only); hands or holstered tools, not while pouring or carrying
    if (coop && inp.primaryPressed && inp.eye && g.tool === 0 && !g.stream && !g.finds.carry && this.now >= this.nextShove && !this.busy() && this.now >= (this.busyUntil || 0)) {
      const others = this.others().map(x => ({ ...x, down: (this.down.get(x.id) || 0) > this.now }));
      const t = swingTarget(inp.eye, inp.dir, P.pos, others);
      if (t) {
        const held = g.handHeld(), aim = g.aimPile(inp.eye, inp.dir, g._st.reach);
        const grabFirst = held < g.handCap(1) && aim && aim.dist < t.along - FUN.billMargin;   // the pile grab wins when it is closer
        const deposit = held > 0 && g.nearShredder(P.pos);
        if (!grabFirst && !deposit) {
          const slap = held > 0;
          this.wind = { to: t.id, slap, at: this.now }; this.send({ f: 'wind', slap });
          this.sfx('HandSwoosh');
          if (!this.hinted) { this.hinted = true; this.hud.toast(this.T('fun.hint.swing', this.coarse ? '' : '[LMB]').trim(), '', 2600); }
          inp = { ...inp, primaryPressed: false, primaryHeld: false };
          this.eatHeld = true;
        }
      }
    }
    if (this.eatHeld) { if (!inp.primaryHeld) this.eatHeld = false; else inp = { ...inp, primaryHeld: false }; }
    // drone grab (Interact on a passing drone)
    this.offer = this.findDrone(inp);
    if (this.offer != null && inp.interactPressed && this.now >= this.regrabAt && !g.finds.carry) { this.send({ f: 'grab', d: this.offer }); inp = { ...inp, interactPressed: false }; }
    return inp;
  }
  // ---- after the player moved: falls, pulls, rides ----
  afterMove(dt) {
    const P = this.player, g = this.game;
    // pulled toward the puller's shown position: min(3.2, (d - 1.5)·3) m/s, flat, no stun
    if (this.pulledBy >= 0) {
      const o = this.others().find(x => x.id === this.pulledBy);
      if (o) { const dx = o.pos[0] - P.pos[0], dz = o.pos[2] - P.pos[2], d = Math.hypot(dx, dz); if (d > FUN.pullStop) { const s = Math.min(FUN.pullSpeed, (d - FUN.pullStop) * 3); P.ext = [dx / d * s, dz / d * s]; } }
    }
    // knock-down timeline: freeze -> air -> down -> get up
    const F = this.fall;
    if (F) {
      F.t += dt;
      if (F.phase === 'freeze') { P.vel = [0, Math.min(P.vel[1], 0), 0]; if (F.t >= FUN.hitFreeze) { P.knockback(F.v); F.phase = 'air'; F.t = 0; } }
      else if (F.phase === 'air') { if ((P.grounded && F.t > 0.12) || F.t > FUN.maxAirTime) { F.phase = 'down'; F.t = 0; F.skid = [P.vel[0] * FUN.skidKeep, P.vel[2] * FUN.skidKeep]; F.side = Math.random() < 0.5 ? -1 : 1; } }
      else if (F.phase === 'down') {
        const k = Math.max(0, 1 - F.t / FUN.skidTime); if (F.t < FUN.skidTime) P.ext = [F.skid[0] * k * k, F.skid[1] * k * k];
        if (F.t >= F.down) { F.phase = 'up'; F.t = 0; }
      } else if (F.phase === 'up' && F.t >= F.getUp) this.fall = null;
      const downK = !this.fall ? 0 : F.phase === 'down' ? Math.min(1, F.t / 0.12) : F.phase === 'up' ? Math.max(0, 1 - F.t / F.getUp) : 0;
      P.eyeDrop = FUN.eyeDrop * downK; this.roll = (F ? F.side || 0 : 0) * 14 * Math.PI / 180 * downK;
    } else { P.eyeDrop = 0; this.roll = 0; }
    // shredder ride: walk or jump into the intake (solo too)
    if (!this.fall && !this.hang && this.now >= this.rideReady && inIntake(this.intake, P.pos)) {
      this.rideReady = this.now + FUN.rideRepeat;
      const o = [-1, 0];   // IntakeForward: the mouth faces the lobby (-x, where the interact point is) [inferred from the scene]
      this.launch([FUN.rideOut * o[0], FUN.rideLift, FUN.rideOut * o[1]], FUN.rideDown, false);
      this.sfx('Appear', { vol: 0.6 });
      this.fx.fly(this.game.markers.shredderIntake, [P.pos[0] - 1.5, P.pos[1] + 2.5, P.pos[2]], 0.6, 1.2, 10, 0.8);
      if (this.coop()) this.send({ f: 'ride' }); else { this.hud.toast(this.T('fun.feed.ride_solo'), '', 2600); this.runCount(0, 'shredded'); }
    }
    // hanging under a drone: eased onto the hang point under the drone (grip offset UNKNOWN: the drone's origin)
    const H = this.hang;
    if (H) {
      const d = g.drones[H.d];
      if (!d) { this.hang = null; return; }
      H.t += dt; const k = Math.min(1, H.t / FUN.attachTime), want = [d.pos[0], d.pos[1] - FUN.hangLength, d.pos[2]];
      for (let i = 0; i < 3; i++) P.pos[i] += (want[i] - P.pos[i]) * (k >= 1 ? 1 : Math.min(1, dt * 12));
      H.vel = H.last ? [0, 1, 2].map(i => (d.pos[i] - H.last[i]) / Math.max(1e-3, dt)) : [0, 0, 0]; H.last = d.pos.slice();
      P.vel = [0, 0, 0]; P.grounded = false;
    }
  }
  launch(v, down, freeze = true) {
    const air = flightSeconds(Math.max(0, v[1]));
    this.wind = null;
    this.fall = { phase: freeze ? 'freeze' : 'air', t: 0, v, down, getUp: Math.random() < 0.5 ? FUN.getUpBack : FUN.getUpFront, air };
    if (!freeze) this.player.knockback(v);
  }
  letGo(jump) {
    const H = this.hang; if (!H) return;
    this.send({ f: 'letgo', jump });
    this.release(jump, H.vel || [0, 0, 0]);
  }
  release(jump, v) {
    this.hang = null; this.regrabAt = this.now + FUN.regrabDelay;
    const vel = v.slice(); if (jump) vel[1] = Math.max(vel[1], 0) + FUN.jumpOffUp;
    this.player.knockback(vel);
  }
  // DroneFleet.FindGrabbable: a hauling drone (no rider, unity z >= 1.5) within 3.9 m of the eye in a 32° cone, or close
  // above; its hang point not under the pile surface
  findDrone(inp) {
    if (!inp.eye || this.hang) return null;
    const g = this.game, e = inp.eye, dir = inp.dir; let best = null, bs = Infinity;
    g.drones.forEach((d, i) => {
      if (d.rider != null || !(d.state === 'outbound' || d.state === 'dig' || d.state === 'inbound') || -d.pos[2] < 1.5) return;
      const v = [d.pos[0] - e[0], d.pos[1] - e[1], d.pos[2] - e[2]], dist = Math.hypot(...v); if (dist > FUN.grabReach) return;
      const c = (v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]) / dist;
      if (!(Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI <= FUN.grabCone || (dist < 0.6 * FUN.grabReach && d.pos[1] > e[1] + 0.2))) return;
      const surf = g.field.heightAt(d.pos[0], d.pos[2]); if (isFinite(surf) && d.pos[1] - FUN.hangLength < surf - 0.25) return;
      const s = dist + (1 - c) * 4; if (s < bs) { bs = s; best = i; }
    });
    return best;
  }
  prompt(key) { return this.hang ? (this.now - this.hang.at < 1 ? (this.coarse ? '' : '[Space] ') + this.T('drone.ride.letgo') : '') : this.offer != null ? key + this.T('drone.ride.grab') : ''; }
  // ---- 'fun' records from the host (every client, the host included) ----
  onEvent(e) {
    const me = this.me(), T = this.T, nm = (id) => this.nameOf(id);
    if (e.k === 'shove') {
      this.down.set(e.b, this.now + 1.9);
      if (e.b === me) this.launch([FUN.shoveSpeed * e.f[0], FUN.shoveLift, FUN.shoveSpeed * e.f[1]], FUN.shoveDown);
      this.sfx('ShoveHit');
      const o = e.b === me ? this.player.pos : (this.others().find(x => x.id === e.b) || {}).pos;
      if (o) { const hit = [o[0] - 0.25 * e.f[0], o[1] + FUN.chest, o[2] - 0.25 * e.f[1]]; this.fx.fly(hit, [hit[0] + e.f[0] * 1.6, hit[1] + 0.8, hit[2] + e.f[1] * 1.6], 0.5, 0.8, FUN.burst + (e.slap ? 6 : 0) >> 1, 0.7); }
      if (e.slap) this.hud.toast(T('fun.feed.slap', nm(e.a), nm(e.b)), '', 2600);
    } else if (e.k === 'parry') {
      if (e.a === me) this.launch([FUN.parrySpeed * e.f[0], FUN.parryLift, FUN.parrySpeed * e.f[1]], FUN.parryDown);
      this.sfx('ShoveHit');
      this.parries = this.parries.filter(p => this.now - p.t <= FUN.clashWindow);
      const clash = this.parries.find(p => p.a === e.b && p.b === e.a);
      this.parries.push({ a: e.a, b: e.b, t: this.now });
      this.hud.toast(clash ? T('fun.feed.clash', nm(e.b), nm(e.a)) : T('fun.feed.parry', nm(e.b), nm(e.a)), '', 2600);
    } else if (e.k === 'ride') {
      this.hud.toast(e.by >= 0 ? T('fun.feed.ride_by', nm(e.by), nm(e.a)) : T('fun.feed.ride', nm(e.a)), '', 2600);
    } else if (e.k === 'pull') {
      if (e.b === me) this.pulledBy = e.on ? e.a : -1;
    } else if (e.k === 'grab') {
      if (e.a === me) { this.hang = { d: e.d, at: this.now, t: 0 }; this.player.vel = [0, 0, 0]; }
      else if (this.now - (this.feedAt.get(e.a) ?? -99) >= FUN.feedRepeat) { this.feedAt.set(e.a, this.now); this.hud.toast(T('drone.ride.feed.grab', nm(e.a)), '', 2600); }
    } else if (e.k === 'grabNo') {
      if (e.a === me) this.hud.toast(T('drone.ride.toast.taken'), '', 2400);
    } else if (e.k === 'release') {
      if (e.a === me && this.hang) this.release(!!e.jump, this.hang.vel || [0, 0, 0]);
      if (e.a === me && e.why === 1 && this.now - this.arrivedAt >= 60) { this.arrivedAt = this.now; this.hud.toast(T('drone.ride.toast.arrived'), '', 2600); }
      if (e.a === me && e.why === 2) this.hud.toast(T('drone.ride.toast.tired'), '', 2600);
      if (e.why === 3 && e.by >= 0) this.hud.toast(T('drone.ride.feed.shoved', nm(e.by), nm(e.a)), '', 2600);
    }
  }
}
