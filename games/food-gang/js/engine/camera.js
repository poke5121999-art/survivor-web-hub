// Cinemachine 3 subset: CinemachineCamera + PositionComposer (dead zone, damping, lookahead, hard limits)
// + Confiner3D (camera position inside a box), driven from the exported components of SceneGame.
import { DEG } from './math.js';

const LOG_RESIDUAL = 4.605170186; // -ln(0.01), Cinemachine's Damper
// Comfort (web build, owner report 2026-11-02: eye strain, worst on NORI's dash-slash) [ĐỀ XUẤT]:
// - lookahead reads a smoothed target velocity (LOOK_SMOOTH s) and leads at most MAX_LOOK units: a 0.15 s dash at
//   25 u/s used to throw the camera 2.3 units past the fighter and back, every attack;
// - a target that jumps (spectating a team-mate on death, respawn) is a warp, not a velocity (Cinemachine's
//   OnTargetObjectWarped resets the predictor): no lookahead from it, and the view glides there in GLIDE s instead of
//   a one-frame cut + lookahead overshoot (measured up to 21 units, more than a screen width);
// - shake is a smooth two-sine wobble (Cinemachine's impulse is a signal, not per-frame random noise), scaled by
//   engine.comfort.shake (0 with the SCREEN SHAKE setting off or prefers-reduced-motion).
const LOOK_SMOOTH = 0.3, MAX_LOOK = 1, GLIDE = 0.45, WARP_SPEED = 60, WARP_MIN = 1.5;
const smooth = (k) => k * k * (3 - 2 * k);

export function damp(initial, time, dt) {
  if (time < 1e-4 || Math.abs(initial) < 1e-4) return initial;
  return initial * (1 - Math.exp(-LOG_RESIDUAL / time * dt));
}

export class CinemachineRuntime {
  constructor(engine, camNode, vcam, composer, confiner) {
    this.engine = engine;
    this.camNode = camNode;          // node with the Unity Camera
    this.vcam = vcam;                // CinemachineCamera comp (node holds its transform)
    this.comp = composer;
    this.confiner = confiner;
    this.follow = vcam && vcam.followNode ? vcam.followNode : null;
    this.group = null;
    this.prevTarget = null;
    this.look = [0, 0];
    this.pos = null;
    this.impulse = [0, 0, 0];
    this.impulseT = 0;
    this.vel = 0;
    this.glide = null;
    this.out = null;
    this.phase = [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28];
  }

  setFollow(node) { this.follow = node; this.group = null; this.prevTarget = null; }

  // Frame several targets: target = bounds centre, distance pushed back so all fit with a margin (CinemachineTargetGroup).
  setGroup(nodes, margin = 1.5) { this.group = nodes; this.margin = margin; this.prevTarget = null; }

  shake(strength = 0.3, time = 0.3) {
    const c = this.engine && this.engine.comfort;
    const s = strength * (c ? c.shake : 1);
    // a weaker impulse does not cut a stronger one still running short
    const now = this.impulseT > 0 ? (this.impulseT / this.impulseDur) * this.impulseS : 0;
    if (s <= 0 || s < now) return;
    this.impulseT = time; this.impulseDur = time; this.impulseS = s;
  }

  targetPos() {
    if (this.group && this.group.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of this.group) { const w = n.world; x0 = Math.min(x0, w[12]); x1 = Math.max(x1, w[12]); y0 = Math.min(y0, w[13]); y1 = Math.max(y1, w[13]); }
      this.groupSize = [x1 - x0 + this.margin * 2, y1 - y0 + this.margin * 2];
      return [(x0 + x1) / 2, (y0 + y1) / 2, 0];
    }
    this.groupSize = null;
    if (!this.follow) return null;
    const w = this.follow.world;
    return [w[12], w[13], w[14]];
  }

  update(dt, aspect) {
    const C = this.comp;
    const cam = this.camNode;
    const lens = this.vcam ? this.vcam.lens : { fov: 25 };
    let t = this.targetPos();
    if (!t || !C) return;
    const off = C.offset || [0, 0, 0];
    t = [t[0] + off[0], t[1] + off[1], t[2] + off[2]];
    // a jump no fighter can make in one frame: warp (glide there, no lookahead from it)
    let warped = false;
    if (this.prevTarget && dt > 0) {
      const d = Math.hypot(t[0] - this.prevTarget[0], t[1] - this.prevTarget[1]);
      if (d > Math.max(WARP_MIN, WARP_SPEED * dt)) { warped = true; if (this.out) this.glide = { from: this.out.slice(), t: 0 }; }
    }
    // lookahead on x (IgnoreY), smoothed
    if (C.lookahead && C.lookahead.on && this.prevTarget && dt > 0 && !warped) {
      const vx = (t[0] - this.prevTarget[0]) / dt;
      this.vel += (vx - this.vel) * (1 - Math.exp(-dt / LOOK_SMOOTH));
      const want = Math.max(-MAX_LOOK, Math.min(MAX_LOOK, this.vel * C.lookahead.time));
      const sm = Math.max(0.0001, C.lookahead.smoothing / 30);
      this.look[0] += damp(want - this.look[0], sm, dt);
    }
    this.prevTarget = t.slice();
    let dist = C.distance || 10;
    if (this.groupSize) {
      const tanH = Math.tan((lens.fov || 25) * DEG / 2);
      const needH = Math.max(this.groupSize[1], this.groupSize[0] / aspect);
      dist = Math.max(dist, needH / 2 / tanH);
    }
    const goal = [t[0] + this.look[0], t[1], t[2] - dist];
    if (!this.pos || dt === 0) this.pos = goal.slice();
    const visH = 2 * dist * Math.tan((lens.fov || 25) * DEG / 2), visW = visH * aspect;
    const dz = C.deadZone || [0, 0], hl = C.hardLimits || [2, 2], damping = C.damping || [1, 1, 1];
    for (let a = 0; a < 2; a++) {
      const vis = a ? visH : visW;
      let d = goal[a] - this.pos[a];
      const half = dz[a] * vis / 2;
      if (Math.abs(d) <= half) d = 0; else d -= Math.sign(d) * half;
      let mv = damp(d, damping[a], dt);
      // hard limits: target never leaves the hard rect (size in screen fractions)
      const lim = hl[a] * vis / 2;
      const after = goal[a] - (this.pos[a] + mv);
      if (Math.abs(after) > lim) mv += after - Math.sign(after) * lim;
      this.pos[a] += mv;
    }
    this.pos[2] = goal[2];
    const p = this.pos.slice();
    if (this.confiner && this.confiner.box) {
      const b = this.confiner.box;
      for (let a = 0; a < 3; a++) p[a] = Math.min(b.max[a], Math.max(b.min[a], p[a]));
      this.pos[0] = p[0]; this.pos[1] = p[1];
    }
    if (this.glide) {
      const g = this.glide;
      g.t += dt;
      const k = smooth(Math.min(1, g.t / GLIDE));
      p[0] = g.from[0] + (p[0] - g.from[0]) * k; p[1] = g.from[1] + (p[1] - g.from[1]) * k;
      if (g.t >= GLIDE) this.glide = null;
    }
    this.out = p.slice();
    if (this.impulseT > 0) {
      this.impulseT -= dt;
      const k = Math.max(0, this.impulseT / this.impulseDur) * this.impulseS;
      const w = (this.wob = (this.wob || 0) + dt) * Math.PI * 2, f = this.phase;
      p[0] += k * (0.6 * Math.sin(w * 7 + f[0]) + 0.4 * Math.sin(w * 11 + f[1]));
      p[1] += k * (0.6 * Math.sin(w * 8 + f[2]) + 0.4 * Math.sin(w * 13 + f[3]));
    }
    cam.lp[0] = p[0]; cam.lp[1] = p[1]; cam.lp[2] = p[2];
    if (this.vcam && this.vcam.node) { this.vcam.node.lp[0] = p[0]; this.vcam.node.lp[1] = p[1]; this.vcam.node.lp[2] = p[2]; }
    if (cam.parent) {
      // camera nodes sit under the SceneGame root at the origin; keep local == world
    }
  }
}
