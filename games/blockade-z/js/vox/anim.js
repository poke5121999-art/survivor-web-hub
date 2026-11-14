// Blockade Z voxel prototype: animation layer for the voxel hero and the voxel zombie (?vox=1, off with ?voxanim=0).
//
// CREDIT. The techniques below come from the animation notes on Lanternfall, the three.js idle battler by loktar00
// (github.com/loktar00/lanternfall), used here with the project owner's approval and rebuilt clean-room from the notes
// (D:\lanternfall-ref-analysis\anim.md), not by copying its source. Taken from anim.md:
//   - the stance foot slides back by exactly speed*dt, so it stays where it was planted (sec. 3.6); the swing foot
//     smoothsteps from where it lifted to a landing spot ahead (stride from speed, landing at 0.38..0.5 of a step in front);
//   - the cadence is capped and the stride grows with speed (Ls rule, sec. 3.2) instead of the feet sprinting;
//   - hip height comes from the leg reach: the hips drop by what the planted feet need (LEG - sqrt(LEG^2 - fr^2)), so the
//     bob is two per stride and tied to the footfalls; hip yaw/roll in step with the feet, spine counter-yaw, head cancels
//     the yaw so the gaze stays steady (sec. 3.6);
//   - 2-bone leg IK on world-space foot pins (sec. 4): pin released when it is out of reach, knee clamped 5..120 degrees,
//     knee driven through a critically damped spring (omega 34) with a 400 deg/s rate limit, pole = the pelvis forward,
//     foot kept flat on the ground at the planted yaw, pin weight ramp ~120 ms (here: layer weight rate 8-9/s);
//   - the layer is blended in and out by a smoothed weight and the hip height goes through a one-pole low pass with
//     k = 1 - exp(-28 dt) (sec. 3.15) so nothing pops when layers switch;
//   - attacks land on the gameplay hit: anticipation (weight back, arm cocked) -> strike on the damage frame ->
//     follow-through that decays (sec. 2, "every clip lands its strike exactly when the gameplay hit fires");
//   - secondary motion as chained damped springs (sec. 3.12: cloak springs of stiffness 60/40/30 and damping 13/6/5, each
//     lower spring driven by the one above), exposed as BZ.vox.spring(node, opts);
//   - diagnostics first: foot drift is measured, not eyeballed (sec. 4, LF.gaitReport).
//
// WHAT IT DOES. It is a corrective layer on top of the game's own pose. BZ.animHero (js/heroes.js) and the zombie update
// (js/zombies.js) pose the skeleton first, then call BZ.vox.animHero(m, s, dt) / BZ.vox.animZombie(z, dt) which:
//   1. measures the real world speed of the body and runs its own stride cycle from it,
//   2. pins each stance foot in world space and solves thigh + knee (IK) so it does not slide; the swing foot lifts in an arc,
//   3. lowers/raises the hips to what the legs can reach, rolls and yaws the pelvis with the footfalls, swaps the game's
//      arm-swing / torso-twist terms (which follow the game's own phase) for ones on the same cycle as the feet,
//   4. zombie: lurch on the planted leg, dragging foot when z.limp, swipe = anticipation -> hit frame -> follow-through,
//   5. steps the springs attached with BZ.vox.spring.
// The layer weight goes to 0 (the game's pose shows unchanged) in the air, dead, cast, crouch, wall run, landing dip, and
// for a zombie: crawling, knocked down, frozen, climbing, dying, flying or a special kind.
(function () {
  const BZ = window.BZ; const V = BZ && BZ.vox; const THREE_ = window.THREE;
  if (!V || !V.on || !V.want || !V.want('anim') || !THREE_) return;
  const { Vector3, Quaternion, Matrix4, Euler } = THREE_;

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const sstep = (a, b, x) => smooth((x - a) / (b - a));
  const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
  const TAU = Math.PI * 2;

  // ---- scratch ----
  const t1 = new Vector3(), t2 = new Vector3(), t3 = new Vector3(), t4 = new Vector3(), t5 = new Vector3();
  const qa = new Quaternion(), qb = new Quaternion(), qc = new Quaternion(), qd = new Quaternion(), qe = new Quaternion(), qf = new Quaternion(), qg = new Quaternion();
const ex_ = new Vector3();
  const mA = new Matrix4(), mB = new Matrix4(); const eA = new Euler();
  const UP = new Vector3(0, 1, 0), FWD = new Vector3(0, 0, 1);

  // ---- gait configs (units: metres of the unscaled body; the hero and the walker are 1.0 scale) ----
  const HERO = { L1: 0.38, L2: 0.30, ankle: 0.07, reach: 0.975, dutyW: 0.62, dutyR: 0.30, rA: 1.5, rB: 6.5, Smax: 0.64, fBase: 1.1, fSlope: 0.5, fMin: 1.4, fMax: 3.4, fCap: 4.3,
    maxDrop: 0.08, h0: 0.05, h1: 0.028, hMax: 0.2, roll: 0.035, yaw: 0.10, sway: 0.02, vOn: 0.45, vOff: 0.2, foot: true };
  const ZOMB = { L1: 0.38, L2: 0.30, ankle: 0.07, reach: 0.965, dutyW: 0.70, dutyR: 0.58, rA: 1.0, rB: 4.0, Smax: 0.66, fBase: 0.75, fSlope: 0.45, fMin: 0.9, fMax: 1.9, fCap: 2.4,
    maxDrop: 0.085, h0: 0.045, h1: 0.02, hMax: 0.12, roll: 0.085, yaw: 0.07, sway: 0.035, vOn: 0.3, vOff: 0.12, foot: false };

  const newFoot = () => ({ pin: new Vector3(), start: new Vector3(), pos: new Vector3(), stance: true, yaw: 0, u: 0, p: 0, ik: new Quaternion(), drag: 0 });
  const newState = () => ({ w: 0, init: false, c: 0, pp: new Vector3(), has: false, vx: 0, vz: 0, spd: 0, dir: new Vector3(0, 0, 1), mk: 0, hy: undefined, f: [newFoot(), newFoot()], kn: [0, 0], knv: [0, 0], dbg: null });

  // ---- the walk layer: world foot pins + 2-bone IK ----
  // B = { root, hips, legs: [{ leg, knee, foot }, ...] (left first, x = -0.13, then right) }
  // ctl = { cfg, enable (0/1 wanted), still (true: also active while standing), limp (leg index or -1), baseY (hips y without the game's bob), dtRaw }
  // returns the state (st.w is the layer weight; st.c the cycle of the LEFT foot, 0 = it has just landed in front)
  function walk(B, st, dt, ctl) {
    const cfg = ctl.cfg; const root = B.root; const hips = B.hips;
    const dtc = Math.min(dt, 0.05);
    // the game only assigns rotation.x on legs and feet; the IK leaves y/z behind in the Euler, so clear them before the FK pose is read
    for (const Lg of B.legs) { Lg.leg.rotation.y = Lg.leg.rotation.z = 0; if (Lg.foot) Lg.foot.rotation.y = Lg.foot.rotation.z = 0; }
    if (ctl.accum) { hips.rotation.y -= st.ady || 0; hips.position.x -= st.adx || 0; st.ady = st.adx = 0; }
    root.updateMatrixWorld(true);
    root.getWorldPosition(t1); const sc = root.scale.x || 1;
    // measured velocity: what the body really does this frame (the game's own speed numbers differ from it)
    if (st.has && dt < 0.25) {
      const dx = t1.x - st.pp.x, dz = t1.z - st.pp.z;
      if (Math.abs(dx) + Math.abs(dz) > 3.2) { st.has = false; st.init = false; st.vx = st.vz = 0; } else {
        const k = 1 - Math.exp(-16 * dtc);
        st.vx += (clamp(dx / Math.max(dt, 1e-3), -16, 16) - st.vx) * k; st.vz += (clamp(dz / Math.max(dt, 1e-3), -16, 16) - st.vz) * k;
      }
    } else { st.vx = st.vz = 0; st.init = false; }
    st.pp.copy(t1); st.has = true;
    const spd = Math.hypot(st.vx, st.vz); st.spd = spd; const vl = spd / sc;
    if (spd > 0.25) { st.dir.set(st.vx / spd, 0, st.vz / spd); }
    else if (!st.dirSet) { root.getWorldQuaternion(qa); st.dir.copy(FWD).applyQuaternion(qa); st.dir.y = 0; st.dir.normalize(); }
    st.dirSet = true;
    const moving = st.mv ? spd > cfg.vOff : spd > cfg.vOn; st.mv = moving;
    st.mk = damp(st.mk, moving ? 1 : 0, 6, dtc);
    // layer weight
    const want = ctl.enable && (moving || ctl.still) ? 1 : 0;
    st.w = damp(st.w, want, want ? 9 : 8, dtc);
    if (want === 0 && st.w < 0.004) { st.w = 0; st.init = false; st.hy = undefined; return st; }
    const w = st.w;
    // ankle (IK end point) of each leg right now, from the game's pose
    const L = B.legs;
    if (!st.init) {
      for (let i = 0; i < 2; i++) { const f = st.f[i]; ankleWorld(L[i], f.pin, cfg); f.pin.y = t1.y; f.pos.copy(f.pin); f.start.copy(f.pin); f.stance = true; f.drag = 0; }
      st.c = 0; st.f[1].stance = !(0.5 >= dutyOf(cfg, vl)); st.init = true; st.hy = undefined; st.yawBase = 0;
      st.kn[0] = st.kn[1] = 0.1;
    }
    // stride cycle: duty (share of the cycle on the ground), cadence f, stance travel S (all from speed)
    const rk = sstep(cfg.rA, cfg.rB, vl); const d = lerp(cfg.dutyW, cfg.dutyR, rk);
    let f = 0, S = 0;
    if (moving) {
      f = clamp(cfg.fBase + cfg.fSlope * vl, cfg.fMin, cfg.fMax); S = d * vl / f;
      if (S > cfg.Smax) { f = vl * d / cfg.Smax; S = cfg.Smax; if (f > cfg.fCap) f = cfg.fCap; }
      st.c = (st.c + f * dtc) % 1;
    } else {
      // standing: finish any step in progress, then rest with both feet down
      const dd = cfg.dutyW; const cl = st.c; const cr = (st.c + 0.5) % 1;
      if (cl >= dd || cr >= dd) { f = 2.4; st.c = (st.c + f * dtc) % 1; }
    }
    const Sw = S * sc; const swH = Math.min(cfg.hMax, cfg.h0 + cfg.h1 * vl) * sc * (0.35 + 0.65 * Math.min(1, spd / 1.2));
    // pelvis: hip yaw / roll / sway follow the cycle of the right foot (cR = 0 right foot just landed in front)
    const cR = (st.c + 0.5) % 1; const sR = Math.sin(TAU * cR); const cosR = Math.cos(TAU * cR);
    const mk = st.mk; const gp = ctl.game || {};
    const yawM = -(cfg.yaw * (1 + 0.5 * rk)) * cosR * mk;
    const rollM = (cfg.roll * (1 + (ctl.limp >= 0 ? 0.7 : 0))) * sR * mk;
    const dY = w * (yawM - (gp.hipYaw || 0)); const dX = w * (cfg.sway * sR * mk);
    hips.rotation.y += dY; hips.position.x += dX; if (ctl.accum) { st.ady = dY; st.adx = dX; }
    hips.rotation.z += w * (rollM - (gp.hipRoll || 0));
    st.yawM = yawM; st.rollM = rollM; st.cosR = cosR; st.sR = sR;
    hips.updateMatrixWorld(true);
    // foot targets: stance = the pin, swing = smoothstep from the lift spot to a landing spot a half stride ahead
    for (let i = 0; i < 2; i++) {
      const F = st.f[i]; const leg = L[i].leg; leg.getWorldPosition(t2); // hip joint
      const cf = i === 0 ? st.c : cR; const stanceNow = cf < (moving || f > 0 ? d : cfg.dutyW);
      const limpLeg = ctl.limp === i;
      if (stanceNow && !F.stance) { F.pin.copy(F.pos); F.stance = true; }
      else if (!stanceNow && F.stance) { F.start.copy(F.pin); F.stance = false; }
      if (F.stance) {
        // out of reach: let the pin slide back toward the body rather than stretch the leg
        t3.set(F.pin.x - t2.x, 0, F.pin.z - t2.z); const hr = t3.length(); const lim = (cfg.L1 + cfg.L2) * sc * 0.93;
        if (hr > lim) { F.pin.x = t2.x + t3.x / hr * lim; F.pin.z = t2.z + t3.z / hr * lim; }
        if (moving && S > 0) { const rel = t3.set(F.pin.x - t2.x, 0, F.pin.z - t2.z).dot(st.dir); const lb = -(Sw * 0.5 + 0.04 * sc) * 1.12; if (rel < lb) { F.pin.x += st.dir.x * (lb - rel); F.pin.z += st.dir.z * (lb - rel); } }
        F.pos.copy(F.pin); F.p = d > 0 ? clamp(cf / d, 0, 1) : 0; F.u = 0;
      } else {
        const u = clamp((cf - d) / Math.max(1e-3, 1 - d), 0, 1); const Tl = (1 - u) * (1 - d) / Math.max(f, 0.3);
        // landing spot: where this hip will be when the foot comes down, plus a half stance ahead (a limping leg lands short)
        const reachFwd = (S > 0 ? Sw * 0.5 * 0.92 : 0.02) * (limpLeg ? 0.55 : 1);
        t3.set(t2.x + st.vx * Tl + st.dir.x * reachFwd, t1.y, t2.z + st.vz * Tl + st.dir.z * reachFwd);
        const e = smooth(u); F.pos.x = lerp(F.start.x, t3.x, e); F.pos.z = lerp(F.start.z, t3.z, e);
        const arc = swH * (limpLeg ? 0.12 : 1) * Math.sin(Math.PI * Math.pow(u, 0.85));
        F.pos.y = lerp(F.start.y, t3.y, e) + arc; F.u = u; F.p = 0;
      }
    }
    // hip height: the legs cannot be longer than they are, so the planted feet cap it (inverted pendulum: lowest with both feet
    // far apart, highest with the foot under the body). One-pole low pass on the way up, instant on the way down.
    let allowed = 1e9; const ankleH = cfg.ankle * sc; const R = (cfg.L1 + cfg.L2) * cfg.reach * sc;
    for (let i = 0; i < 2; i++) {
      const F = st.f[i]; const leg = L[i].leg; leg.getWorldPosition(t2);
      const dh2 = (F.pos.x - t2.x) ** 2 + (F.pos.z - t2.z) ** 2; const aY = F.pos.y + ankleH;
      const jointMax = aY + Math.sqrt(Math.max(0.0004, R * R - dh2));
      const a = hips.position.y + (jointMax - t2.y) / sc; // hips local y that puts the hip joint at jointMax
      if (F.stance || F.u > 0.8) allowed = Math.min(allowed, a); else allowed = Math.min(allowed, a + 0.06);
    }
    const base = ctl.baseY; let want_y = Math.max(Math.min(base, allowed), base - cfg.maxDrop) - (ctl.hipDrop || 0);
    if (st.hy === undefined) st.hy = hips.position.y;
    if (want_y < st.hy) st.hy = want_y; else st.hy += (want_y - st.hy) * (1 - Math.exp(-28 * dtc));
    const gameY = hips.position.y; hips.position.y = lerp(gameY, Math.min(st.hy, base + 0.02), w);
    hips.updateMatrixWorld(true);
    // a stance foot that is now out of reach (the drop is capped) slides toward the body just enough to be reachable: the only skate left
    for (let i = 0; i < 2; i++) {
      const F = st.f[i]; if (!F.stance) continue; L[i].leg.getWorldPosition(t2);
      const vdy = t2.y - (F.pos.y + ankleH); const dhMax = Math.sqrt(Math.max(0.0004, R * R - vdy * vdy));
      t3.set(F.pin.x - t2.x, 0, F.pin.z - t2.z); const hr = t3.length();
      if (hr > dhMax) { F.pin.x = t2.x + t3.x / hr * dhMax; F.pin.z = t2.z + t3.z / hr * dhMax; F.pos.copy(F.pin); st.slid = (st.slid || 0) + (hr - dhMax); }
    }
    // 2-bone IK for both legs, blended into the game's pose by w
    mA.copy(hips.matrixWorld).invert(); hips.getWorldQuaternion(qa); // qa = hips world rotation
    const root_q = qb; root.getWorldQuaternion(root_q);
    const dtk = Math.max(dtc, 1e-3);
    for (let i = 0; i < 2; i++) {
      const Lg = L[i]; const F = st.f[i];
      const fkQ = qc.copy(Lg.leg.quaternion); const fkK = Lg.knee.rotation.x; const fkF = Lg.foot ? qe.copy(Lg.foot.quaternion) : null;
      // hip joint -> ankle target in hips space
      t3.set(F.pos.x, F.pos.y + ankleH, F.pos.z).applyMatrix4(mA).sub(Lg.leg.position); // T
      const dist = t3.length(); const l1 = cfg.L1, l2 = cfg.L2;
      const D = clamp(dist, Math.abs(l1 - l2) + 0.03, (l1 + l2) * 0.992);
      t3.multiplyScalar(1 / Math.max(dist, 1e-4)); // unit hip->ankle
      const cosA = clamp((l1 * l1 + D * D - l2 * l2) / (2 * l1 * D), -1, 1); const A = Math.acos(cosA);
      const cosG = clamp((l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2), -1, 1);
      let kFlex = clamp(Math.PI - Math.acos(cosG), 0.087, 2.09); // 5..120 degrees
      // pole = the pelvis forward, flattened against the leg axis
      t4.copy(FWD); t4.addScaledVector(t3, -t4.dot(t3)); if (t4.lengthSq() < 1e-4) t4.copy(UP); t4.normalize();
      // thigh direction: tilted from the leg axis toward the pole by A
      t5.copy(t3).multiplyScalar(Math.cos(A)).addScaledVector(t4, Math.sin(A)); // thigh dir (hip -> knee), unit
      const ey = t1.copy(t5).negate();
      const ez = t2.copy(t4).addScaledVector(t5, -t4.dot(t5)).normalize();
      const ex = ex_.crossVectors(ey, ez);
      mB.makeBasis(ex, ey, ez); const ikQ = qf.setFromRotationMatrix(mB);
      // knee: critically damped spring + 400 deg/s rate limit on the flexion
      const prev = st.kn[i]; let acc = st.knv[i];
      let nk;
      if (F.stance || F.u > 0.78 || prev === 0.1) { nk = kFlex; acc = 0; } // planted (or landing): exact, so the foot stays on its pin
      else {
        const om = 34; const x = kFlex - prev; // critically damped step (semi-implicit)
        acc += (om * om * x - 2 * om * acc) * dtk; nk = prev + acc * dtk; const maxStep = (400 * Math.PI / 180) * dtk;
        if (nk - prev > maxStep) nk = prev + maxStep; else if (nk - prev < -maxStep) nk = prev - maxStep;
      }
      st.kn[i] = nk; st.knv[i] = acc;
      kFlex = clamp(nk, 0.087, 2.09);
      Lg.leg.quaternion.copy(fkQ).slerp(ikQ, w);
      Lg.knee.rotation.x = lerp(fkK, kFlex, w);
      // foot flat on the ground at the planted yaw, toe-off before the swing, toe up before it lands
      if (Lg.foot) {
        const pitch = F.stance ? 0.5 * sstep(0.82, 1, F.p) - 0.2 * (1 - sstep(0, 0.22, F.p)) : lerp(0.35, -0.25, smooth(F.u));
        qd.setFromAxisAngle(t4.set(1, 0, 0), pitch * Math.min(1, 0.4 + st.mk));
        const fq = qg.copy(root_q).multiply(qd); // world foot rotation wanted
        // knee world rotation after the blend
        const kq = qd.copy(qa).multiply(Lg.leg.quaternion); eA.set(Lg.knee.rotation.x, 0, 0); kq.multiply(qf.setFromEuler(eA));
        const ft = kq.invert().multiply(fq);
        Lg.foot.quaternion.copy(fkF).slerp(ft, w);
      }
    }
    return st;
  }
  function dutyOf(cfg, vl) { return lerp(cfg.dutyW, cfg.dutyR, sstep(cfg.rA, cfg.rB, vl)); }
  // world position of the IK end point (ankle) from the game's pose
  function ankleWorld(Lg, out, cfg) {
    if (Lg.foot) { Lg.foot.getWorldPosition(out); } else { out.set(0, -cfg.L2, 0); Lg.knee.localToWorld(out); }
    return out;
  }

  // ---- springs (BZ.vox.spring) ----
  // Attach to any child Object3D that should trail the body: the hero's bandana tail on the head, a zombie's torn shirt rag.
  //   const h = BZ.vox.spring(node, { stiffness: 60, damping: 8, drag: 0.05, sideDrag: 0.04, accel: 0.004, turn: 0.02, max: 0.9, follow: otherHandle, followGain: 0.8, wind: 0.03 });
  // The node's rest rotation (at the time of the call) is kept; the spring adds pitch (rotation.x) and roll (rotation.z) around it.
  // Positive pitch swings a part hanging down from its pivot toward -Z (trailing when the body moves forward), positive roll toward +X.
  // `axes: 'x' | 'z' | 'xz'` (default 'xz'); `additive: true` adds to the node's rotation each frame instead of owning it.
  // Returns a handle { ax, az, node, remove(), reset() }. It is stepped from the two hooks below for the body that owns the node.
  const springs = []; const owners = new Set();
  V.springs = springs;
  V.spring = (node, o) => {
    o = o || {};
    const s = { node, rx: node.rotation.x, rz: node.rotation.z, ax: 0, az: 0, vx: 0, vz: 0, k: o.stiffness || 60, c: o.damping || 8, drag: o.drag === undefined ? 0.05 : o.drag,
      side: o.sideDrag === undefined ? 0.04 : o.sideDrag, accel: o.accel === undefined ? 0.004 : o.accel, turn: o.turn === undefined ? 0.02 : o.turn, max: o.max || 0.9,
      axes: o.axes || 'xz', follow: o.follow || null, fg: o.followGain === undefined ? 0.8 : o.followGain, wind: o.wind || 0, add: !!o.additive, owner: o.owner || null,
      pw: new Vector3(), pv: new Vector3(), has: false, yaw: 0, t: Math.random() * 6 };
    s.remove = () => { const i = springs.indexOf(s); if (i >= 0) springs.splice(i, 1); };
    s.reset = () => { s.ax = s.az = s.vx = s.vz = 0; s.has = false; };
    springs.push(s); return s;
  };
  function ownerOf(s) {
    if (s.owner) return s.owner; let p = s.node.parent; while (p) { if (owners.has(p)) { s.owner = p; return p; } p = p.parent; } return null;
  }
  function stepSprings(root, dt) {
    owners.add(root); if (!springs.length) return; dt = Math.min(dt, 0.05); if (dt <= 0) return;
    for (const s of springs) {
      if (ownerOf(s) !== root) continue;
      const n = s.node; if (!n.parent) continue;
      n.parent.updateWorldMatrix(true, false); n.parent.localToWorld(t1.copy(n.position)); const pw = t1; // pivot in the world
      n.parent.getWorldQuaternion(qa); qb.copy(qa).invert();
      let yawRate = 0;
      if (s.has) {
        t2.copy(pw).sub(s.pw).multiplyScalar(1 / dt); if (t2.lengthSq() > 900) { s.reset(); } // teleport
        else {
          t3.copy(t2).sub(s.pv).multiplyScalar(1 / dt); t3.clampLength(0, 60);
          const vl = t2.clone().applyQuaternion(qb); const al = t3.applyQuaternion(qb);
          const eul = eA.setFromQuaternion(qa, 'YXZ'); yawRate = BZ.wrapAngle ? BZ.wrapAngle(eul.y - s.yaw) / dt : (eul.y - s.yaw) / dt; yawRate = clamp(yawRate, -12, 12);
          s.tx = s.drag * vl.z + s.accel * al.z; s.tz = -s.side * vl.x - s.accel * al.x - s.turn * yawRate;
          s.pv.copy(t2);
        }
      }
      s.pw.copy(pw); s.yaw = eA.setFromQuaternion(qa, 'YXZ').y; s.has = true;
      s.t += dt; const wx = s.wind ? Math.sin(s.t * 1.3) * s.wind + Math.sin(s.t * 3.1 + 1) * s.wind * 0.6 : 0; const wz = s.wind ? Math.sin(s.t * 1.7 + 2) * s.wind * 0.7 : 0;
      let tx = (s.tx || 0) + wx, tz = (s.tz || 0) + wz;
      if (s.follow) { tx += s.follow.ax * s.fg; tz += s.follow.az * s.fg; }
      const sub = Math.ceil(dt / (1 / 120)); const h = dt / sub;
      for (let i = 0; i < sub; i++) {
        s.vx += (s.k * (tx - s.ax) - s.c * s.vx) * h; s.ax = clamp(s.ax + s.vx * h, -s.max, s.max);
        s.vz += (s.k * (tz - s.az) - s.c * s.vz) * h; s.az = clamp(s.az + s.vz * h, -s.max, s.max);
      }
      if (s.axes.includes('x')) n.rotation.x = (s.add ? n.rotation.x : s.rx) + s.ax;
      if (s.axes.includes('z')) n.rotation.z = (s.add ? n.rotation.z : s.rz) + s.az;
    }
  }

  // ---- hero ----
  // game arm swing terms that follow the game's phase (BZ.animHero): [right, left] amplitude per hold mode, x run; they are re-timed
  // to the feet's own cycle. Modes whose left hand rides the weapon by IK keep the game's arms.
  const ARM = { none: [0.7, -0.7], melee: [-0.3, 0.6], wrist: [0, 0.3], fists: [0.1, -0.1], claws: [0.14, -0.14], gun: [0, 0], dual: [0, 0], throw: [0, 0] };
  V.animHero = function (m, s, dt) {
    if (!m || !m.root || !m.legL) return;
    try { heroLayer(m, s, dt); } catch (e) { if (!V._animErr) { V._animErr = 1; console.error('[vox] anim.js animHero threw', e); } }
    stepSprings(m.root, dt);
  };
  function heroLayer(m, s, dt) {
    const st = m.va || (m.va = newState()); const J = s.j || {};
    const air = s.air || 0; const dead = s.dead || 0;
    const spr = J.spr || 0; const run = Math.min(1, (s.speed || 0) / 3.6) * (1 - air);
    const ph = s.phase || 0;
    const enable = air < 0.12 && !dead && !(s.cast > 0.04) && !((s.crouch || 0) > 0.08) && Math.abs(J.wall || 0) < 0.08 && (J.land || 0) < 0.12 && !m.frozen && !(m.formK > 0.5 && m.heroId === 'soi' && false);
    const gameBob = Math.abs(Math.cos(ph)) * (0.055 + spr * 0.02) * run;
    st.dbgPh = ph;
    const ctl = { cfg: HERO, enable, still: false, limp: -1, baseY: m.hips.position.y - gameBob, game: { hipYaw: J.hy || 0, hipRoll: Math.cos(ph) * 0.04 * run } };
    const gSpine = m.spine.rotation.y; const gHipY = m.hips.rotation.y;
    walk({ root: m.root, hips: m.hips, legs: [{ leg: m.legL, knee: m.kneeL, foot: m.footL }, { leg: m.legR, knee: m.kneeR, foot: m.footR }] }, st, dt, ctl);
    const w = st.w; if (w < 0.004) return;
    // upper body on the feet's cycle: spine counter-yaw instead of the game's, head keeps the gaze steady
    const gameTwist = -Math.sin(ph) * (0.18 + spr * 0.12) * run; const myTwist = -(st.yawM || 0) * 1.6 * (0.6 + 0.4 * run) * 1.0;
    const dSpine = w * (myTwist - gameTwist);
    m.spine.rotation.y += dSpine;
    m.head.rotation.y += -0.6 * dSpine - (m.hips.rotation.y - gHipY);
    // arms: the same swing, on the feet's cycle (the left foot is forward when cos(2 pi c) = 1, the game's convention sin(phase) = 1)
    const mode = s.mode || 'none'; const coef = ARM[mode]; const sw = s.swing >= 0 ? s.swing : -1;
    if (coef && sw < 0 && !(s.cast > 0.02)) {
      const dl = (Math.cos(TAU * st.c) - Math.sin(ph)) * run * w;
      m.armR.rotation.x += coef[0] * dl; m.armL.rotation.x += coef[1] * dl;
    }
  }

  // ---- zombie ----
  V.animZombie = function (z, dt) {
    const b = z && z.body; if (!b || !b.kneeL || !b.root) return;
    try { zombieLayer(z, b, dt); } catch (e) { if (!V._animErrZ) { V._animErrZ = 1; console.error('[vox] anim.js animZombie threw', e); } }
    stepSprings(b.root, dt);
  };
  function zombieLayer(z, b, dt) {
    const st = z.va || (z.va = newState()); const T = z.T || {};
    const dtc = Math.min(dt, 0.05);
    const special = T.fly || T.quad || T.boss === 'phantom' || T.boss === 'queen' || T.rig;
    const enable = !!z.alive && !z.dying && !z.crawl && !(z.frozen > 0) && !(z.down > 0) && !z.climb && !(z.throwT > 0) && !(z.landT > 0) && !special;
    const gameBob = Math.abs(Math.cos(z.phase || 0)) * 0.04;
    const limpI = z.limp ? 1 : -1;
    const ctl = { cfg: ZOMB, enable, still: true, accum: true, limp: limpI, baseY: b.hips.position.y - gameBob, game: { hipRoll: Math.sin(z.phase || 0) * (z.limp ? 0.2 : 0.05) + 0 }, hipDrop: 0 };
    // the game puts the limp hip roll plus the fear roll `fr` into hips.rotation.z; take only its stride term out
    ctl.game.hipRoll = Math.sin(z.phase || 0) * (z.limp ? 0.2 : 0.05);
    // anticipation / strike state
    const A = z.vaA || (z.vaA = { pw: -1, k: 0, t: 9, wind: 0, ax: [0, 0], av: [0, 0], has: false });
    const windup = T.windup || 0.4; const wind = z.windT >= 0 ? clamp(z.windT / windup, 0, 1) : 0;
    A.wind = damp(A.wind, wind, wind > A.wind ? 18 : 10, dtc);
    if (A.pw >= 0 && z.windT < 0 && z.attackT > (T.rate || 1) * 0.6) { A.t = 0; } // the damage frame: the game just dealt the hit
    A.pw = z.windT; A.t += dtc;
    const imp = A.t < 1.2 ? Math.exp(-A.t * 6.5) * smooth(A.t / 0.06) : 0; // follow-through: a 60 ms attack so it is a swing, not a pop
    // limp: the hurt leg is legR; the pelvis sags onto it when it carries the weight
    if (z.limp) ctl.hipDrop = 0.045;
    b.torso.rotation.x -= A.tx || 0; b.hips.position.z -= A.hz || 0; b.hips.rotation.y -= A.hy || 0; A.tx = A.hz = A.hy = 0; // (the game never reassigns these; undo last frame's share)
    // the swipe's weight shift moves the pelvis, so it goes in before the legs are solved (the planted feet then stay put and the knees take it)
    const k = A.wind; const ak = (k > 0.01 ? k * k * (3 - 2 * k) : 0);
    const e = (z.alive && !z.crawl && !z.dying && enable) ? 1 : 0;
    if (e) {
      b.hips.position.z += -0.06 * ak + 0.16 * imp; A.hz += -0.06 * ak + 0.16 * imp;
      b.hips.rotation.y += 0.12 * ak - 0.2 * imp; A.hy += 0.12 * ak - 0.2 * imp;
      ctl.baseY += -0.035 * ak - 0.05 * imp;
    }
    walk({ root: b.root, hips: b.hips, legs: [{ leg: b.legL, knee: b.kneeL, foot: null }, { leg: b.legR, knee: b.kneeR, foot: null }] }, st, dt, ctl);
    const w = st.w; const mk = st.mk; const moving = Math.min(1, (st.spd || 0) / 1.2);
    // torso counter-turn on the feet's cycle, lurch toward the planted leg, a nod on each footfall
    if (w > 0.004) {
      const gT = Math.sin(z.phase || 0) * 0.1 * moving; const cl = Math.cos(TAU * st.c);
      b.torso.rotation.y += w * (-0.1 * cl * moving - gT) * 1.0;
      const lurch = (st.sR || 0) * mk; // + while the right foot swings (weight on the left)
      b.torso.rotation.z += w * (-lurch * (z.limp ? 0.12 : 0.05));
      const foot = 0.5 + 0.5 * Math.cos(2 * TAU * ((st.c + 0.5) % 1)); // two peaks per stride: each heel strike
      b.torso.rotation.x += w * mk * 0.05 * foot; A.tx += w * mk * 0.05 * foot;
      b.head.rotation.x += -w * mk * 0.06 * foot;
    }
    // swipe: anticipation (weight rocks back, chest lifts, head tips) -> strike on the hit frame -> follow-through
    if (e) {
      b.torso.rotation.x += -0.3 * ak + 0.5 * imp; A.tx += -0.3 * ak + 0.5 * imp;
      b.head.rotation.x += -0.14 * ak + 0.22 * imp;
      // the arms: the game snaps them (+0.9 rad in one frame on the hit, and back 0.15 s later): run that through a stiff spring so the
      // strike reads as a swing of a few frames that starts exactly on the damage frame
      for (let i = 0; i < 2; i++) {
        const arm = i ? b.armR : b.armL; const g = arm.rotation.x;
        if (!A.has) { A.ax[i] = g; A.av[i] = 0; }
        const om = 52; const n4 = 6, h4 = dtc / n4; for (let q = 0; q < n4; q++) { A.av[i] += (om * om * (g - A.ax[i]) - 2 * om * A.av[i]) * h4; A.ax[i] += A.av[i] * h4; }
        if (Math.abs(g - A.ax[i]) > 2.5) A.ax[i] = g;
        arm.rotation.x = A.ax[i];
        // a cocked arm shakes a little at the top of the windup
        if (k > 0.8) arm.rotation.x += Math.sin((z.windT || 0) * 55 + i * 2) * 0.03;
      }
      A.has = true;
    } else A.has = false;
  }

  // ---- debug ----
  V.animDebug = { HERO, ZOMB, state: (o) => o && (o.va || null) };
})();
