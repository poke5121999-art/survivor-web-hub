// Procedural animation for robots. Joints keep their rest transform; every frame sets
// rotation/position = rest + offsets, so nothing drifts. Robots face +Z; the robot's left is +X.
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// attack phase 0..1 -> wind-up weight and strike weight
export function atkCurve(a, w0 = 0.35, w1 = 0.55) {
  if (a <= 0 || a >= 1) return [0, 0];
  if (a < w0) return [sm(a / w0), 0];
  if (a < w1) { const t = sm((a - w0) / (w1 - w0)); return [1 - t, t]; }
  return [0, 1 - sm((a - w1) / (1 - w1))];
}

export function makeAnimator(J, cfg, glowMats) {
  const rest = {};
  for (const k in J) { const o = J[k]; rest[k] = { rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z, px: o.position.x, py: o.position.y, pz: o.position.z }; }
  const S = { t: Math.random() * 10, ph: Math.random() * TAU, w: 0, carry: 0, d: 0, a: 0, h: 0, look: 0, speed: 0, dt: 0, glowMul: 1, glowTint: null, reveal: 0, seed: Math.random() };
  const CR = cfg.creep ? creepState(cfg.creep, S.seed) : null;
  const R = (name, rx = 0, ry = 0, rz = 0) => { const o = J[name]; if (!o) return; const r = rest[name]; o.rotation.set(r.rx + rx, r.ry + ry, r.rz + rz); };
  const P = (name, px = 0, py = 0, pz = 0) => { const o = J[name]; if (!o) return; const r = rest[name]; o.position.set(r.px + px, r.py + py, r.pz + pz); };
  const ctx = { J, S, R, P, rest, cfg, atkCurve, sm, clamp };
  const loco = LOCO[cfg.loco || 'biped'];

  return function animate(dt, state = {}) {
    dt = clamp(dt || 0, 0, 0.1);
    S.dt = dt; S.t += dt;
    const speed = Math.max(0, state.speed || 0);
    S.speed = speed;
    S.d = damp(S.d, state.down ? 1 : 0, 4, dt);
    S.w = damp(S.w, clamp(speed / (cfg.walkRef || 1.6), 0, 1.4) * (1 - S.d), 9, dt);
    S.ph += dt * (speed / (cfg.stride || 1.1)) * TAU * (1 - S.d);
    S.carry = damp(S.carry, state.carrying ? 1 : 0, 7, dt);
    S.a = clamp(state.attack || 0, 0, 1);
    S.h = damp(S.h, clamp(state.hurt || 0, 0, 1), 18, dt);
    S.look = damp(S.look, clamp(state.look || 0, -1.4, 1.4), 10, dt);
    S.reveal = damp(S.reveal, clamp(state.reveal ?? 0, 0, 1), 6, dt);
    // stop-motion stutter: some kinds hold their pose for a few frames at a time
    const hold = CR && creepHold(CR, S, dt);
    if (!hold) {
      S.glowMul = 1; S.glowTint = null;
      for (const k in J) { const r = rest[k], o = J[k]; o.rotation.set(r.rx, r.ry, r.rz); o.position.set(r.px, r.py, r.pz); }
      loco(ctx);
      if (cfg.extra) cfg.extra(ctx);
      if (CR) creep(ctx, CR);
      downPose(ctx);
    }
    // eyes: dim when down, flicker when hurt, creepy kinds drop out now and then
    const fl = S.h > 0.05 ? 0.55 + 0.45 * Math.sin(S.t * 61) : 1;
    const k = S.glowMul * (1 - 0.88 * S.d) * fl * (CR ? creepEyes(CR, S, dt) : 1);
    for (const g of glowMats) {
      g.mat.color.copy(S.glowTint && g.key === 'glow' ? S.glowTint : g.base).multiplyScalar(g.halo ? Math.min(k, 1.6) : k);
    }
  };
}

// ---------- creep layer (foes and bosses) ----------
// cfg.creep: { head: joint, tilt rad, snap rad, snapHz, jit rad, spasm: [joint, axis], lunge m, crouch m, hunch rad,
//              stutter 0..1, flicker 0..1 }
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function creepState(o, seed) {
  return {
    o, n: Math.floor(seed * 1e5), tilt: (seed < 0.5 ? -1 : 1) * (o.tilt ?? 0.2) * (0.6 + 0.8 * hash(seed * 9)),
    snapT: 0.5 + 2 * hash(seed * 3), snap: [0, 0, 0], hs: [0, 0, 0],
    jitT: 0, jit: [0, 0, 0], spT: 1 + 3 * hash(seed * 5), spD: 0,
    holdT: 0, holdOn: 0, burstT: 2 * hash(seed * 7), eyeT: 1 + 3 * hash(seed * 11), eyeD: 0, eyeK: 1,
  };
}
function rnd(C) { C.n++; return hash(C.n * 0.917 + 0.13); }

function creepHold(C, S, dt) {
  const st = C.o.stutter ?? 0;
  if (!(st > 0) || S.d > 0.5) return false;
  C.burstT -= dt;
  if (C.burstT < 0) { C.burstT = 0.6 + 2.5 * rnd(C); C.holdOn = rnd(C) < st ? 0.35 + 0.9 * rnd(C) : 0; }
  if (C.holdOn <= 0) return false;
  C.holdOn -= dt;
  C.holdT -= dt;
  if (C.holdT > 0) return true;
  C.holdT = 1 / (7 + 6 * rnd(C));
  return false;
}

function creepEyes(C, S, dt) {
  const f = C.o.flicker ?? 0.5;
  C.eyeT -= dt;
  if (C.eyeT < 0) { C.eyeT = (1.2 + 4 * rnd(C)) / Math.max(0.2, f); C.eyeD = 0.05 + 0.18 * rnd(C); C.eyeK = rnd(C) < 0.5 ? 0.05 : 0.35; }
  let k = 1;
  if (C.eyeD > 0) { C.eyeD -= dt; k = Math.sin(S.t * 90) > -0.2 ? C.eyeK : 1; }
  // slow uneven breathing of the light, brighter during the attack
  k *= 0.88 + 0.12 * Math.sin(S.t * 1.7 + C.tilt * 9) * Math.sin(S.t * 0.53);
  if (S.a > 0 && S.a < 1) k *= 1 + 0.6 * Math.sin(S.a * Math.PI);
  return k;
}

function creep(c, C) {
  const { J, S, atkCurve } = c, o = C.o, dt = S.dt;
  const head = J[o.head || 'head'];
  const calm = (1 - S.d);
  // head snaps: hold a new crooked angle, then the next one comes suddenly
  C.snapT -= dt;
  if (C.snapT < 0) {
    const s = o.snap ?? 0.45;
    C.snapT = (0.25 + 1.6 * rnd(C)) / (o.snapHz ?? 1);
    const back = rnd(C) < 0.35;
    C.snap = back ? [0, 0, 0] : [(rnd(C) - 0.5) * s * 0.7, (rnd(C) - 0.5) * s * 1.6, (rnd(C) - 0.5) * s * 1.4];
  }
  for (let i = 0; i < 3; i++) C.hs[i] += (C.snap[i] - C.hs[i]) * (1 - Math.exp(-38 * dt));
  // jitter: a fresh tiny offset every 1/24 s
  C.jitT -= dt;
  if (C.jitT < 0) { C.jitT = 1 / 24; const j = o.jit ?? 0.03; C.jit = [(rnd(C) - 0.5) * j, (rnd(C) - 0.5) * j, (rnd(C) - 0.5) * j]; }
  if (head) {
    head.rotation.x += (C.hs[0] + C.jit[0]) * calm;
    head.rotation.y += (C.hs[1] + C.jit[1]) * calm;
    head.rotation.z += (C.tilt + C.hs[2] + C.jit[2]) * calm;
  }
  const body = J.chest || J.body;
  if (body) { body.rotation.z += C.jit[2] * 0.4 * calm; body.rotation.x += C.jit[0] * 0.3 * calm; }
  // spasm: one limb jerks for a moment
  if (o.spasm) {
    C.spT -= dt;
    if (C.spT < 0) { C.spT = 1.5 + 4 * rnd(C); C.spD = 0.12 + 0.25 * rnd(C); }
    if (C.spD > 0) {
      C.spD -= dt;
      const [jn, ax, amp = 0.5] = o.spasm, jj = J[jn];
      if (jj) jj.rotation[ax] += amp * Math.sin(S.t * 47) * Math.sin(S.t * 13) * calm;
    }
  }
  // predatory hunch while moving, crouch on the wind-up, lunge on the strike
  const w = Math.min(1, S.w);
  if (o.hunch && J.torso) J.torso.rotation.x += o.hunch * w;
  const [wd, st] = atkCurve(S.a, 0.38, 0.52);
  if (wd + st > 0) {
    const cr = o.crouch ?? 0.08, lu = o.lunge ?? 0.18;
    if (J.hips && J.thL) {
      J.hips.position.y -= cr * wd;
      J.thL.rotation.x -= 0.5 * wd; J.thR.rotation.x -= 0.5 * wd; J.knL.rotation.x += 0.9 * wd; J.knR.rotation.x += 0.9 * wd;
      if (J.ftL) { J.ftL.rotation.x -= 0.4 * wd; J.ftR.rotation.x -= 0.4 * wd; }
      if (J.torso) J.torso.rotation.x += 0.35 * wd + 0.15 * st;
      if (head) head.rotation.x -= 0.3 * wd;
    } else if (J.body) { J.body.position.y -= cr * wd; J.body.rotation.x += 0.15 * wd; }
    if (J.base) J.base.position.z += lu * st - 0.04 * wd;
    if (head) head.rotation.z -= C.tilt * 0.6 * (wd + st);
  }
}

function downPose(c) {
  const { J, S, cfg } = c;
  const d = S.d; if (d < 0.001) return;
  const b = J.base;
  if (cfg.down === 'drop') { b.position.y -= (cfg.hoverY || 0) * d; b.rotation.z += 0.5 * d; b.rotation.x += 0.25 * d; return; }
  if (cfg.down === 'side') { b.rotation.z += 1.35 * d; b.position.y += (cfg.downLift ?? 0.15) * d; return; }
  if (cfg.down === 'slump') { b.rotation.x += 0.35 * d; b.position.y -= (cfg.downLift ?? 0.1) * d; return; }
  // biped: fall backward onto the back
  b.rotation.x -= 1.5 * sm(d); b.position.y += (cfg.downLift ?? 0.15) * d;
  if (J.knL) { J.knL.rotation.x += 0.55 * d; J.knR.rotation.x += 0.25 * d; J.thL.rotation.x -= 0.4 * d; }
  if (J.shL) { J.shL.rotation.z += 0.7 * d; J.shR.rotation.z -= 0.9 * d; J.shL.rotation.x -= 0.4 * d; J.elL.rotation.x -= 0.5 * d; }
  if (J.head) { J.head.rotation.y += 0.6 * d; J.head.rotation.x += 0.2 * d; }
}

function bipedArms(c, side, swing, w) {
  const { J, S, cfg } = c;
  const sh = J['sh' + side], el = J['el' + side];
  if (!sh) return;
  const sg = side === 'L' ? 1 : -1;
  const carry = cfg.noCarry ? 0 : S.carry;
  sh.rotation.x += swing * (1 - carry) + carry * -1.25;
  sh.rotation.z += sg * (0.08 + 0.05 * w) * (1 - carry) - sg * 0.16 * carry;
  el.rotation.x += (-0.22 - 0.25 * w) * (1 - carry) - 0.35 * carry;
}

const LOCO = {
  biped(c) {
    const { J, S, cfg } = c;
    const w = S.w, s = Math.sin(S.ph), co = Math.cos(S.ph);
    const amp = cfg.legAmp ?? 0.55;
    const thL = -s * amp * w, thR = s * amp * w;
    const kL = w * (0.12 + 0.95 * Math.max(0, co)), kR = w * (0.12 + 0.95 * Math.max(0, -co));
    if (J.thL) {
      J.thL.rotation.x += thL; J.thR.rotation.x += thR;
      J.knL.rotation.x += kL; J.knR.rotation.x += kR;
      if (J.ftL) { J.ftL.rotation.x += -(thL + kL) * 0.85; J.ftR.rotation.x += -(thR + kR) * 0.85; }
    }
    J.hips.position.y += w * (0.03 * Math.abs(co) - 0.035) + 0.004 * Math.sin(S.t * 2.1) * (1 - w);
    J.hips.rotation.y += 0.07 * s * w;
    const tor = J.torso;
    tor.rotation.x += 0.1 * w + 0.015 * Math.sin(S.t * 2.1);
    tor.rotation.y += -0.1 * s * w + S.look * 0.3;
    tor.rotation.z += 0.035 * s * w;
    if (J.head) { J.head.rotation.y += S.look * 0.6 + 0.18 * Math.sin(S.t * 0.55) * (1 - w) * (1 - S.carry); J.head.rotation.x += -0.05 * w; }
    const sw = (cfg.armAmp ?? 0.5) * s * w;
    bipedArms(c, 'L', sw, w); bipedArms(c, 'R', -sw, w);
    attackBiped(c);
    // hurt flinch
    const h = S.h;
    if (h > 0.001) {
      tor.rotation.x -= 0.42 * h; J.hips.position.z -= 0.07 * h;
      if (J.head) J.head.rotation.x -= 0.35 * h;
      if (J.shL) { J.shL.rotation.z += 0.35 * h; J.shR.rotation.z -= 0.35 * h; J.elL.rotation.x -= 0.5 * h; J.elR.rotation.x -= 0.5 * h; }
    }
  },
  quad(c) {
    const { J, S, cfg } = c;
    const w = S.w;
    const legs = cfg.legs; // [hip, knee, phaseOffset, kneeSign]
    for (const [h, k, po, ks] of legs) {
      const p = S.ph + po, s = Math.sin(p), co = Math.cos(p);
      J[h].rotation.x += -s * (cfg.legAmp ?? 0.45) * w;
      J[k].rotation.x += ks * w * (0.1 + 0.8 * Math.max(0, co));
    }
    J.body.position.y += w * 0.025 * Math.abs(Math.cos(S.ph)) + 0.006 * Math.sin(S.t * 2);
    J.body.rotation.x += 0.03 * Math.sin(S.ph * 2) * w;
    if (J.head) J.head.rotation.y += S.look * 0.7;
    const h = S.h; J.body.rotation.x -= 0.25 * h; J.body.position.z -= 0.06 * h;
  },
  spider(c) {
    const { J, S, cfg } = c;
    const w = Math.max(S.w, cfg.idleLegs ? 0.08 : 0);
    for (const [h, k, po, side] of cfg.legs) {
      const p = S.ph + po, s = Math.sin(p), co = Math.cos(p);
      J[h].rotation.y += s * (cfg.legAmp ?? 0.32) * w;
      J[h].rotation.z += side * Math.max(0, co) * 0.4 * w;
      if (J[k]) J[k].rotation.z -= side * Math.max(0, co) * 0.25 * w;
    }
    J.body.position.y += 0.012 * Math.sin(S.ph * 2) * S.w + 0.004 * Math.sin(S.t * 3);
    J.body.rotation.y += S.look * 0.4;
    const h = S.h; J.body.rotation.x -= 0.3 * h; J.body.position.y += 0.04 * h;
  },
  hover(c) {
    const { J, S, cfg } = c;
    const w = S.w;
    J.base.position.y += 0.05 * Math.sin(S.t * (cfg.bobHz ?? 1.7)) * (1 - S.d);
    J.base.rotation.x += (cfg.lean ?? 0.22) * w;
    J.base.rotation.z += 0.04 * Math.sin(S.t * 1.1);
    if (J.head) J.head.rotation.y += S.look * 0.7;
    if (J.shL) {
      const sw = 0.25 * Math.sin(S.t * 1.3);
      bipedArms(c, 'L', 0.2 * w + sw * 0.3, w); bipedArms(c, 'R', 0.2 * w - sw * 0.3, w);
      attackBiped(c);
    }
    const h = S.h; J.base.rotation.x -= 0.35 * h; J.base.position.z -= 0.08 * h;
  },
  wheel(c) {
    const { J, S, cfg } = c;
    S.roll = ((S.roll || 0) + (S.speed / (cfg.wheelR || 0.25)) * S.dt * (1 - S.d)) % TAU;
    if (J.wheel) J.wheel.rotation.x += S.roll;
    S.wheelAcc = (S.wheelAcc || 0) + S.dt;
    J.hips.rotation.x += 0.12 * S.w + 0.05 * Math.sin(S.t * 2.6);
    J.hips.rotation.z += 0.07 * Math.sin(S.t * 1.9);
    if (J.head) J.head.rotation.y += S.look * 0.6;
    const sw = 0.5 * Math.sin(S.t * 2.6);
    bipedArms(c, 'L', sw * 0.4, 0.6); bipedArms(c, 'R', -sw * 0.4, 0.6);
    attackBiped(c);
    J.hips.rotation.x -= 0.3 * S.h;
  },
  tread(c) {
    const { J, S, cfg } = c;
    S.roll = ((S.roll || 0) + (S.speed / 0.11) * S.dt) % TAU;
    for (const n of cfg.wheels || []) J[n].rotation.x += S.roll;
    J.body.position.y += 0.006 * Math.sin(S.t * 13) * S.w + 0.003 * Math.sin(S.t * 2);
    J.body.rotation.x -= 0.03 * S.w;
    if (J.head) J.head.rotation.y += S.look * 0.8;
    if (J.shL) { bipedArms(c, 'L', 0, 0.3); bipedArms(c, 'R', 0, 0.3); attackBiped(c); }
    J.body.rotation.x -= 0.2 * S.h;
  },
  wall(c) { /* driven by extra */ },
};

function attackBiped(c) {
  const { J, S, cfg } = c;
  const a = S.a; if (a <= 0 || a >= 1) return;
  const [wd, st] = atkCurve(a);
  const style = cfg.atk || 'punch';
  const side = cfg.atkSide || 'R', sg = side === 'L' ? 1 : -1;
  const sh = J['sh' + side], el = J['el' + side], tor = J.torso;
  if (!sh) return;
  if (style === 'punch') {
    sh.rotation.x += wd * 0.6 - st * 1.55; el.rotation.x += -wd * 1.3 + st * 0.3;
    sh.rotation.z += -sg * st * 0.15;
    tor.rotation.y += sg * (wd * 0.35 - st * 0.5); tor.rotation.x += st * 0.12;
  } else if (style === 'slam') {
    for (const s of ['L', 'R']) { const S2 = J['sh' + s], E = J['el' + s]; if (!S2) continue; S2.rotation.x += -wd * 2.7 - st * 1.1; E.rotation.x += -wd * 0.4; }
    tor.rotation.x += -wd * 0.25 + st * 0.4;
  } else if (style === 'swipe') {
    sh.rotation.x += -1.2 * (wd + st); sh.rotation.z += sg * (-wd * 1.0 + st * 1.4) * -1; el.rotation.x += -0.3 * wd;
    tor.rotation.y += sg * (wd * 0.6 - st * 0.8);
  } else if (style === 'shoot') {
    const aim = sm(Math.min(1, a / 0.2)) * (1 - sm((a - 0.85) / 0.15));
    sh.rotation.x += -1.5 * aim + st * 0.25; el.rotation.x += 0.15 * aim - st * 0.2;
    if (J.head) J.head.rotation.x += 0.05 * aim;
    tor.rotation.y += sg * 0.15 * aim;
  } else if (style === 'throw') {
    sh.rotation.x += -wd * 2.6 - st * 1.0; el.rotation.x += -wd * 1.2 + st * 0.6;
    tor.rotation.x += -wd * 0.2 + st * 0.3; tor.rotation.y += sg * (wd * 0.4 - st * 0.5);
  } else if (style === 'grab') {
    for (const s of ['L', 'R']) { const S2 = J['sh' + s], E = J['el' + s]; if (!S2) continue; S2.rotation.x += -1.4 * (wd * 0.6 + st); E.rotation.x += -0.2 * st; S2.rotation.z += (s === 'L' ? 1 : -1) * (wd * 0.5 - st * 0.3); }
    tor.rotation.x += st * 0.2;
  } else if (style === 'staff') {
    sh.rotation.x += -wd * 2.2 - st * 0.6; el.rotation.x += -wd * 0.3;
    tor.rotation.x += -wd * 0.15 + st * 0.25;
  }
}
