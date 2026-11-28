// Golden boost orbs (rules/drop2.md §A; Live.BoostService + BoostOrb). Pure JS, owned by Game.
import { STAT as S, BOOST } from './economy.js';
import { CELL, OX, OZ, HALF } from './pile.js';

export const ORB = { count: 3, firstDelay: 40, life: 37.5, fieldTries: 24, fieldMin: 14, near: [4, 10], jitter: 2.5, hover: 1.1, inset: 1.5,
  minDepth: 0.4, pickR: 1.6, clickRange: 30, clickR: 1.0, bagDelay: 4, retry: 3, warn: 5, collect: 0.3, fade: 0.7, tutorialRetry: 0.5, tutorialLife: 45 };
export const ORB_STATE = { Hidden: 0, Live: 1, Collecting: 2, Fading: 3 };
const L = ORB_STATE;

export class Boosts {
  constructor(game) {
    this.g = game; this.orbs = Array.from({ length: ORB.count }, (_, i) => ({ i, state: L.Hidden, pos: [0, 0, 0], age: 0, life: 0, t: 0, phase: 0 }));
    this.reset();
  }
  reset() {
    for (const o of this.orbs) o.state = L.Hidden;
    this.timer = this.firstDelay(); this.tutorialTry = 0;
    this.bagFills = 0; this.bagArmed = true; this.bagGiven = 0; this.bagCleared = 0; this.bagHurried = false; this.bagPoll = 0; this.lastLeft = null;
    this.hold = false; this.want = false;   // tutorial: HoldsBoosts / WantsBoost
  }
  st(id) { return this.g.stat(id); }
  interval() { return Math.max(5, (this.st(S.BoostInterval) > 0 ? this.st(S.BoostInterval) : 45) / Math.fround(1.3)); }
  firstDelay() { return Math.max(5, ORB.firstDelay - Math.min(30, Math.max(0, this.st(S.OrbHeadStart) || 0))); }
  life() { return ORB.life + Math.min(20, Math.max(0, this.st(S.OrbLifetime) || 0)); }
  reach() { return Math.min(2, Math.max(1, this.st(S.OrbReach) || 1)) * (this.g.finds ? this.g.finds.hatPerk('orbReach') || 1 : 1); }   // Cowboy Hat x2 (touch)
  luck() { return Math.min(2, Math.max(1, this.st(S.OrbLuck) || 1)); }
  defs() { return this.g.data.content.boosts; }
  unlocked(d) { return !d.unlockKey || this.g.econ.hasUnlock(d.unlockKey); }

  // money under (x, z) deep enough for an orb (OverMoney, simplified: column depth >= 0.4 m and no step edge nearby)
  overMoney(x, z) {
    const f = this.g.field, c = f.cellOf(x, z);
    if (c < 0 || f.count[c] <= 0 || f.noMoney[c]) return false;
    if (f.count[c] * 0.000319 < ORB.minDepth) return false;
    const fl = f.floorQ[c];
    for (const [dx, dz] of [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6], [1.131, 1.131], [-1.131, 1.131], [1.131, -1.131], [-1.131, -1.131]]) {
      const n = f.cellOf(x + dx, z + dz); if (n < 0) continue;
      if (Math.abs(f.floorQ[n] - fl) * 0.000319 > 0.5 && f.topY(c) - Math.max(f.floorQ[n], fl) * 0.000319 <= 0.5) return false;
    }
    return true;
  }
  trySpawn(tutorial) {
    const o = this.orbs.find(o => o.state === L.Hidden); if (!o) return false;
    const P = this.g.player.pos, rand = this.g.rand;
    const lim = HALF - ORB.inset, cx = OX + HALF, czU = OZ + HALF;
    if (!tutorial) for (let i = 0; i < 2 * ORB.fieldTries; i++) {
      const x = (2 * rand() - 1) * lim + cx, z = -((2 * rand() - 1) * lim + czU);
      const minSqr = i < ORB.fieldTries ? ORB.fieldMin * ORB.fieldMin : 0;
      if ((x - P[0]) ** 2 + (z - P[2]) ** 2 >= minSqr && this.overMoney(x, z)) return this.show(o, x, z, this.life());
    }
    // near the player (fallback and tutorial orb)
    const yaw = this.g.player.yaw || 0; let dir = [-Math.sin(yaw), -Math.cos(yaw)];
    for (let i = 0; i < 10; i++) {
      if (i >= 5) { const dx = cx - P[0], dz = -czU - P[2], l = Math.hypot(dx, dz) || 1; dir = [dx / l, dz / l]; }
      const d = ORB.near[0] + rand() * (ORB.near[1] - ORB.near[0]), s = (2 * rand() - 1) * ORB.jitter;
      const x = P[0] + dir[0] * d - dir[1] * s, z = P[2] + dir[1] * d + dir[0] * s;
      if (this.overMoney(x, z)) return this.show(o, x, z, tutorial ? Math.max(this.life(), ORB.tutorialLife) : this.life());
    }
    if (tutorial) for (let zz = 2; zz <= 18; zz += 1.5) for (const off of [0, 2.5, -2.5, 5, -5, 7.5, -7.5]) {
      const x = Math.max(cx - 10, Math.min(cx + 10, P[0])) + off, z = -(OZ + zz);
      if (this.overMoney(x, z)) return this.show(o, x, z, Math.max(this.life(), ORB.tutorialLife));
    }
    return false;
  }
  show(o, x, z, life) {
    o.pos = [x, this.g.field.heightAt(x, z) + ORB.hover, z]; o.age = 0; o.life = Math.max(1, life); o.state = L.Live; o.t = 0; o.phase = this.g.rand() * 10;
    this.g.events.push({ type: 'orbSpawn', i: o.i });
    return true;
  }
  bagDue() {
    const d = this.defs().find(d => d.kind === BOOST.BottomlessBag);
    return this.g.unlocked(1) && d && this.unlocked(d) && this.bagFills > 1 && (this.bagGiven < 1 || this.bagCleared >= 1e9 * 0.125);
  }
  pickRandom() {
    const luck = this.luck(), el = this.defs().filter(d => d.weight > 0 && d.kind !== BOOST.BottomlessBag && this.unlocked(d));
    const w = el.map(d => d.weight * ([5, 7, 8].includes(d.kind) ? luck : 1)), sum = w.reduce((a, b) => a + b, 0);
    let r = this.g.rand() * sum;
    for (let i = 0; i < el.length; i++) { r -= w[i]; if (r <= 0) return el[i]; }
    return el[el.length - 1] || null;
  }
  pickup(o) {
    o.state = L.Collecting; o.t = 0;
    this.g.econ.track('BoostsCollected');
    const due = this.bagDue();
    const def = due ? this.defs().find(d => d.kind === BOOST.BottomlessBag) : this.pickRandom();
    this.g.events.push({ type: 'orbPickup', i: o.i, pos: o.pos.slice(), kind: def ? def.kind : -1 });
    if (!def) return;
    if (due) { this.bagGiven++; this.bagFills = 0; this.bagCleared = 0; this.bagHurried = false; }
    const durScale = this.st(S.BoostDuration) > 0 ? this.st(S.BoostDuration) / 10 : 1, powScale = this.st(S.BoostPower) > 0 ? this.st(S.BoostPower) * 0.5 : 1;
    this.g.econ.startBoost(def.kind, durScale * def.baseDuration, powScale * def.basePower);
  }
  // eye/dir: camera ray; clicked: primary pressed this frame
  step(dt, feet, eye, dir, clicked) {
    // bag fills (rising edges while the bag is unlocked and BottomlessBag is not active) and vault cleared since
    this.bagPoll -= dt;
    if (this.bagPoll <= 0) {
      this.bagPoll = 0.25;
      const u = this.g.bagUnits(), cap = this.g.bagCapacity();
      if (this.g.unlocked(1) && !this.g.econ.boosts.some(b => b.kind === BOOST.BottomlessBag)) {
        if (this.bagArmed && u >= cap) { this.bagFills++; this.bagArmed = false; } else if (!this.bagArmed && u * 2 < cap) this.bagArmed = true;
      }
      const left = this.g.vaultLeft(); if (this.lastLeft != null && left < this.lastLeft) this.bagCleared += this.lastLeft - left; this.lastLeft = left;
      if (this.bagDue()) { if (!this.bagHurried) { this.bagHurried = true; this.timer = Math.min(this.timer, ORB.bagDelay); } } else this.bagHurried = false;
    }
    // spawning (tutorial can hold or request an orb)
    const collected = this.g.econ.stats.tracked.BoostsCollected || 0;
    if (!this.hold) {
      if (this.want && !this.orbs.some(o => o.state === L.Live) && collected < 1) {
        this.tutorialTry -= dt;
        if (this.tutorialTry <= 0) { this.tutorialTry = ORB.tutorialRetry; if (this.trySpawn(true)) this.timer = this.interval(); }
      } else {
        this.timer -= dt;
        if (this.timer <= 0) this.timer = this.trySpawn(false) ? this.interval() : ORB.retry;
      }
    }
    // live orbs: hug the surface, pickup by touch or by clicking on them
    for (const o of this.orbs) {
      if (o.state === L.Live) {
        o.age += dt;
        const h = this.g.field.heightAt(o.pos[0], o.pos[2]); if (isFinite(h)) o.pos[1] += (h + ORB.hover - o.pos[1]) * Math.min(1, dt * 6);
      } else if (o.state === L.Collecting || o.state === L.Fading) {
        o.t += dt; if (o.t >= (o.state === L.Collecting ? ORB.collect : ORB.fade)) o.state = L.Hidden;
      }
    }
    this.touch(feet, eye, dir, clicked);
    for (const o of this.orbs) if (o.state === L.Live && o.age >= o.life) { o.state = L.Fading; o.t = 0; }
  }
  // one player's reach for the live orbs (co-op: every seat calls this; the first touch wins, a boost applies to everyone)
  touch(feet, eye, dir, clicked) {
    if (!feet) return;
    const chest = [feet[0], feet[1] + 0.9, feet[2]], touchR = ORB.pickR * this.reach(), clickR = ORB.clickR * this.reach() / (this.g.finds ? this.g.finds.hatPerk('orbReach') || 1 : 1) * (this.g.finds ? this.g.finds.hatPerk('orbClick') || 1 : 1);
    for (const o of this.orbs) {
      if (o.state === L.Live) {
        let hit = Math.hypot(o.pos[0] - chest[0], o.pos[1] - chest[1], o.pos[2] - chest[2]) <= touchR;
        if (!hit && clicked && eye) {
          const v = [o.pos[0] - eye[0], o.pos[1] - eye[1], o.pos[2] - eye[2]], t = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
          hit = t >= 0 && t <= ORB.clickRange && Math.hypot(v[0] - dir[0] * t, v[1] - dir[1] * t, v[2] - dir[2] * t) <= clickR;
        }
        if (hit) this.pickup(o);
      }
    }
  }
  save() { return { timer: this.timer, fills: this.bagFills, given: this.bagGiven, cleared: this.bagCleared }; }
  load(s) { this.reset(); if (!s) return; this.timer = s.timer ?? this.timer; this.bagFills = s.fills | 0; this.bagGiven = s.given | 0; this.bagCleared = s.cleared || 0; }
}
