// Procedural animation for a kit-built beast: a gait per movement kind (SCOPE section 5), one action overlay at a time
// (attack, cast, ult, hit, stun, die, evolve), spring chains for tails, ears and scarves, pendulum lanterns, orbiting
// rings and blinking eyes. Everything is local bone rotation on top of the identity rest pose.
const THREE = window.THREE;

// leg phase offsets per gait, order of roles.legs: FL FR BL BR (two-legged beasts use the first two)
const GAIT = {
  walk: { off: [0, 0.5, 0.5, 0], amp: 0.6, knee: 0.7, bob: 0.025, pitch: 0, cad: 1 },
  gallop: { off: [0, 0.12, 0.55, 0.67], amp: 0.8, knee: 0.9, bob: 0.05, pitch: 0.13, cad: 0.85 },
  stomp: { off: [0, 0.5, 0.5, 0], amp: 0.5, knee: 1.0, bob: 0.04, pitch: 0, cad: 0.8, roll: 0.07 },
  hop: { off: [0, 0, 0.08, 0.08], amp: 0.5, knee: 0.8, bob: 0, pitch: 0.1, cad: 0.75, hop: 0.22 },
  slither: { off: [0, 0.5, 0.5, 0], amp: 0.45, knee: 0.4, bob: 0.01, pitch: 0, cad: 1.4, wave: 0.2 },
  roll: { off: [0, 0.5, 0.5, 0], amp: 0.6, knee: 0.7, bob: 0.02, pitch: 0, cad: 1 },
  fly: { off: [0, 0, 0, 0], amp: 0, knee: 0, bob: 0.05, pitch: 0.12, cad: 0.6, air: true },
  glide: { off: [0, 0, 0, 0], amp: 0, knee: 0, bob: 0.04, pitch: 0.08, cad: 0.4, air: true },
  swimAir: { off: [0, 0.5, 0.25, 0.75], amp: 0.35, knee: 0.4, bob: 0.05, pitch: 0, cad: 0.5, air: true, swim: 0.1 },
};
const AIR = new Set(['fly', 'glide', 'swimAir']);
const ss = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
// 0 -> 1 -> 0 over dur, held flat in the middle
const env = (t, dur, inK = 0.25, outK = 0.35) => ss(t / (dur * inK)) * (1 - ss((t - dur * (1 - outK)) / (dur * outK)));

export function createRig(K, spec) {
  const B = K.by; const R = K.roles;
  const body = B.body; const root = B.root; const head = B.head; const neck = B.neck; const chest = B.chest; const hip = B.hip;
  const rest = new Map(); for (const b of K.bones) rest.set(b, b.position.clone());
  const legs = R.legs.map((l) => ({ ...l, up: B[l.up], low: B[l.low] }));
  const springs = R.springs.map((s) => ({ ...s, b: s.bones.map((n) => B[n]), ax: s.bones.map(() => 0), ay: s.bones.map(() => 0), vx: s.bones.map(() => 0), vy: s.bones.map(() => 0) }));
  const dang = R.danglers.map((n) => ({ b: B[n], x: 0, z: 0, vx: 0, vz: 0 }));
  const legLen = spec.legLen || 0.35;
  const S = { ph: 0, t: 0, mv: 0, airK: 0, prevY: 0, vY: 0, prevSp: 0, roll: 0, blinkT: 2 + Math.random() * 2, pose: null, poseT: 0, seed: Math.random() * 10 };
  const q = new THREE.Quaternion(); const q2 = new THREE.Quaternion(); const e = new THREE.Euler();

  function reset() {
    for (const b of K.bones) { b.position.copy(rest.get(b)); b.rotation.set(0, 0, 0); b.scale.set(1, 1, 1); }
  }

  return function update(st, dt) {
    dt = Math.min(0.05, Math.max(0, dt || 0)); S.t += dt; const t = S.t;
    reset();
    const scale = spec.scale || 1;
    const move = st.move || spec.move || 'walk';
    const anim = st.anim || 'idle'; const at = st.animT || 0;
    const ballK = spec.ball ? 1 : 0;
    const gk = spec.gait && spec.gait[move] ? spec.gait[move] : (GAIT[move] ? move : (spec.ground || 'walk'));
    const G = GAIT[gk] || GAIT.walk;
    const sp = (anim === 'die' ? 0 : st.speed || 0) / scale;
    const stride = legLen * 2.4 * (G.cad || 1) * (spec.stride || 1);
    S.mv += ((sp > 0.25 && anim !== 'die' ? 1 : 0) - S.mv) * Math.min(1, dt * 8); const mv = S.mv;
    S.ph = (S.ph + dt * Math.min(3.2, Math.max(0.5, sp / stride)) * (mv > 0.02 ? 1 : 0.0)) % 1;
    const ph = S.ph; const TAU = Math.PI * 2;

    // ---- air height (world metres -> model units) ----
    const wantAir = anim !== 'die' && (st.air || AIR.has(move) || spec.hover) ? 1 : 0;
    S.airK += (wantAir - S.airK) * Math.min(1, dt * 4);
    const airH = (AIR.has(move) || st.air ? (spec.airH ?? 1.3) : (spec.hover ?? 0)) / scale;
    root.position.y += S.airK * (airH + Math.sin(t * 2.2 + S.seed) * 0.05);

    // ---- locomotion ----
    let bodyY = 0; let pitch = 0; let rollZ = 0; let yawW = 0;
    if (G.hop) bodyY += Math.max(0, Math.sin(TAU * ph)) * G.hop * mv;
    else bodyY += Math.abs(Math.sin(TAU * ph * 2)) * G.bob * mv;
    pitch += Math.sin(TAU * ph) * G.pitch * mv;
    if (G.roll) rollZ += Math.sin(TAU * ph) * G.roll * mv;
    if (G.wave) yawW = G.wave * mv + 0.04;
    if (G.air) { pitch += 0.12 * mv; bodyY += Math.sin(t * 3) * G.bob; }
    if (G.swim) pitch += Math.sin(t * 2.6) * G.swim;
    for (let i = 0; i < legs.length; i++) {
      const L = legs[i]; const a = TAU * (ph + (G.off[i % 4] || 0));
      let sw = Math.sin(a) * G.amp * mv; let kn = Math.max(0, Math.cos(a)) * G.knee * mv;
      if (G.hop) { sw = -Math.sin(a) * 0.35 * mv; kn = Math.max(0, Math.sin(a)) * 0.9 * mv; }
      if (G.air) { sw = (L.front ? -0.7 : 0.9) * S.airK + Math.sin(t * 3 + i) * 0.08; kn = (L.front ? 1.1 : -0.2) * S.airK; }
      if (G.swim) { sw += Math.sin(t * 3.2 + i * 1.6) * 0.35; }
      L.up.rotation.x = -sw * (L.front ? 1 : 0.9); L.low.rotation.x = kn * (L.front ? 1 : -0.6);
      if (ballK) { L.up.rotation.x = L.front ? -1.2 : 1.2; L.low.rotation.x = 0; }
    }
    // body wave (slither / swim): chest and hip turn opposite ways
    if (yawW && chest && hip) { const w = Math.sin(TAU * ph * 2 + t * (mv < 0.1 ? 2 : 0)); chest.rotation.y += w * yawW; hip.rotation.y -= w * yawW; body.rotation.y += Math.sin(TAU * ph * 2 + 1) * yawW * 0.5; }
    // rolling ball: spin the body about x by distance / radius
    if (ballK) { if (mv > 0.05) S.roll += (sp * dt) / (spec.ballR || 0.45); else { const k = Math.round(S.roll / TAU) * TAU; S.roll += (k - S.roll) * Math.min(1, dt * 5); } body.rotation.x += S.roll; }

    // ---- idle life ----
    const breath = Math.sin(t * 2.1 + S.seed);
    if (chest) chest.position.y += breath * 0.008;
    if (head) { head.rotation.x += Math.sin(t * 0.9 + S.seed) * 0.05 * (1 - mv); head.rotation.y += Math.sin(t * 0.55 + S.seed * 2) * 0.18 * (1 - mv); head.rotation.x += mv * 0.08 * Math.sin(TAU * ph * 2); }

    // ---- action overlays ----
    let rear = 0; let lunge = 0; let headK = 0;
    const style = spec.attack || 'butt';
    if (anim === 'attack') {
      const k = env(at, 0.34, 0.3, 0.5);
      if (style === 'shoot') { lunge -= 0.06 * k; rear += 0.18 * k; headK -= 0.25 * k; }
      else if (style === 'bite') { lunge += 0.16 * k; headK += 0.2 * k; }
      else { lunge += 0.2 * k; headK += 0.5 * k; rear -= 0.12 * k; }
    } else if (anim === 'cast') { const k = env(at, 0.7); rear += 0.38 * k; headK -= 0.4 * k; }
    else if (anim === 'ult') { const k = env(at, 1.0, 0.2, 0.3); rear += 0.55 * k; headK -= 0.55 * k; bodyY += 0.12 * k; body.rotation.y += Math.sin(Math.min(1, at / 0.6) * Math.PI) * 0.0; }
    else if (anim === 'hit') { const k = env(at, 0.25, 0.15, 0.6); lunge -= 0.08 * k; rear -= 0.1 * k; headK += 0.25 * k; }
    else if (anim === 'evolve') { const k = ss(at / 0.5); rear += 0.32 * k; headK -= 0.45 * k; bodyY += 0.04 * k * Math.sin(t * 2); }
    if (anim === 'stun') { if (head) { head.rotation.z += Math.sin(t * 7) * 0.25; head.rotation.y += Math.cos(t * 7) * 0.25; } rollZ += Math.sin(t * 3.5) * 0.08; }
    if (ballK) { rear *= 0.3; headK *= 0.3; }
    body.position.y += bodyY; body.position.z += lunge; body.rotation.x += pitch - rear; body.rotation.z += rollZ;
    if (rear > 0 && legs.length >= 4) for (const L of legs) if (L.front) { L.up.rotation.x -= rear * 1.4; L.low.rotation.x += rear * 1.6; } else L.up.rotation.x += rear * 0.9;
    if (neck) neck.rotation.x += headK * 0.5; if (head) head.rotation.x += headK * 0.6;
    if (anim === 'die') {
      const k = ss(at / 0.45); root.rotation.z = k * 1.45 * (spec.dieSide || 1); root.position.y += Math.sin(Math.min(1, at / 0.45) * Math.PI) * 0.15 - Math.max(0, at - 1.4) * 0.25;
      for (const L of legs) L.up.rotation.x += Math.sin(t * 9 + L.side) * 0.3 * (1 - ss((at - 0.3) / 0.6));
    }

    // ---- wings, fins, orbits ----
    for (const w of R.wings) {
      const b = B[w.bone]; const air = S.airK; const f = move === 'glide' ? 2.2 : 9;
      const fl = air ? Math.sin(t * f + (w.phase || 0)) * (move === 'glide' ? 0.2 : 0.75) : Math.sin(t * 1.5) * 0.05 + (anim === 'cast' || anim === 'ult' ? 0.6 : 0);
      b.rotation.z = w.side * ((w.rest ?? 0) * (1 - air) + (w.open ?? 0.15) * air + fl);
    }
    for (const o of R.orbits) { const b = B[o.bone]; b.rotation[o.axis || 'y'] = t * (o.speed || 1.5) + (anim === 'ult' ? at * 8 : 0); if (o.bob) b.position.y += Math.sin(t * 1.7) * o.bob; }
    for (const f of R.fins) { const b = B[f.bone]; b.rotation[f.axis || 'z'] += Math.sin(t * (f.f || 4) + (f.phase || 0)) * (f.amp || 0.2) * (f.side || 1); }

    // ---- blink ----
    S.blinkT -= dt; let lid = 1; if (S.blinkT < 0.12) lid = 0.12; if (S.blinkT < 0) S.blinkT = 2.5 + Math.random() * 3;
    if (anim === 'die' && at > 0.4) lid = 0.1; if (anim === 'evolve') lid = at < 0.4 ? 0.15 : 1;
    for (const n of R.eyes) B[n].scale.y = lid;

    // ---- springs: angular springs driven by the body's vertical and forward acceleration and the turn rate ----
    const yv = (bodyY - S.prevY) / Math.max(dt, 1e-3); const ay = (yv - S.vY) / Math.max(dt, 1e-3); S.vY = yv; S.prevY = bodyY;
    const fa = (sp - S.prevSp) / Math.max(dt, 1e-3); S.prevSp = sp; const turn = st.turn || 0;
    const steps = Math.max(1, Math.ceil(dt / (1 / 90))); const h = dt / steps;
    for (const s of springs) {
      const Kk = (s.kind === 'ear' ? 140 : s.kind === 'scarf' ? 40 : 70) * (s.stiff || 1); const C = s.kind === 'ear' ? 9 : 7;
      for (let i = 0; i < s.b.length; i++) {
        const lag = 1 + i * 0.35;
        const tgtY = s.kind === 'ear' ? Math.sin(t * 0.7 + i) * 0.04 : Math.sin(t * (1.6 + mv * 4) - i * 0.7 + S.seed) * (s.kind === 'scarf' ? 0.25 : 0.12) * (0.6 + mv);
        const tgtX = s.kind === 'scarf' ? -0.5 * mv : (s.kind === 'tail' ? Math.sin(t * 1.3 - i * 0.5) * 0.05 : 0);
        for (let k = 0; k < steps; k++) {
          const dX = Math.max(-40, Math.min(40, -ay * 0.012 - fa * 0.02)) * lag; const dY = Math.max(-30, Math.min(30, -turn * 3)) * lag;
          s.vx[i] += (Kk * (tgtX - s.ax[i]) - C * s.vx[i] + dX) * h; s.ax[i] += s.vx[i] * h;
          s.vy[i] += (Kk * (tgtY - s.ay[i]) - C * s.vy[i] + dY) * h; s.ay[i] += s.vy[i] * h;
        }
        s.ax[i] = Math.max(-0.9, Math.min(0.9, s.ax[i])); s.ay[i] = Math.max(-0.9, Math.min(0.9, s.ay[i]));
        s.b[i].rotation.x += s.ax[i]; s.b[i].rotation.y += s.ay[i];
      }
    }
    // ---- lanterns hang straight down in model space and swing ----
    if (dang.length) {
      root.updateMatrixWorld(true); root.getWorldQuaternion(q2);
      for (const d of dang) {
        d.vx += (-60 * d.x - 4 * d.vx - fa * 0.05 - ay * 0.01) * dt; d.x += d.vx * dt; d.vz += (-60 * d.z - 4 * d.vz + turn * 2) * dt; d.z += d.vz * dt;
        d.b.parent.getWorldQuaternion(q).invert().multiply(q2);
        d.b.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(e.set(d.x + Math.sin(t * 1.9 + d.b.id) * 0.06, 0, d.z)));
      }
    }
    return root.position.y;
  };
}
