// Rồng Hư Không: a void dragon that circles the square, rains violet fireballs, dives along a marked lane, lands to
// sweep a breath beam, calls a meteor shower and whips its tail when you get close.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;
  const rgb = BZ.rgb;
  const VIO = 0xb040ff; const VIO2 = 0x5a10a0; const PALE = 0xf0d0ff;

  BZ.defTex('bd_scale', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const sc = ((x + (y % 2) * 2) % 4 === 0) || y % 4 === 3; set(x, y, rgb(sc ? 0x120c1c : rng.chance(0.15) ? 0x3a2a50 : 0x241a34)); } });
  BZ.defTex('bd_face', 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(rng.chance(0.12) ? 0x3a2a50 : 0x241a34));
    for (const ex of [1, 5]) { set(ex, 3, rgb(0xe070ff)); set(ex + 1, 3, rgb(0xe070ff)); set(ex, 2, rgb(0x120c1c)); set(ex + 1, 2, rgb(0x120c1c)); }
    for (let x = 1; x < 7; x++) set(x, 6, rgb(x % 2 ? 0xe8e0f0 : 0x120c1c));
  });
  BZ.defTex('bd_wing', 8, 8, ({ set }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const vein = x === y || x === 7 - y || x === 3; set(x, y, rgb(vein ? 0x8a4ac0 : (x + y) % 3 ? 0x3a1a5a : 0x2e1448)); } });
  BZ.defTex('bd_belly', 8, 8, ({ set }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(y % 3 === 0 ? 0x3a3448 : 0x5a5070)); });

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  function rig(G, b, M) {
    const sh = G.quality.shadow > 0; const mats = b.mats; const n = {};
    const g = new THREE.Group();
    const mesh = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = sh; parent.add(m); return m; };
    const grp = (parent, x = 0, y = 0, z = 0, name) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); if (name) n[name] = o; return o; };
    const glow = new THREE.MeshBasicMaterial({ color: VIO, fog: false }); const pale = new THREE.MeshBasicMaterial({ color: PALE, fog: false });
    const body = grp(g, 0, 1.35, 0, 'body');
    n.chest = mesh(body, box(1.0, 0.78, 1.25), mats.skin, 0, 0, 0.15);
    mesh(body, box(0.78, 0.22, 1.05), mats.pants, 0, -0.42, 0.1);
    n.rear = mesh(body, box(0.82, 0.64, 0.95), mats.skin, 0, -0.02, -0.85);
    for (let i = 0; i < 8; i++) { const s = mesh(body, box(0.1, 0.3 - Math.abs(i - 3) * 0.03, 0.22), i % 2 ? glow : mats.pants, 0, 0.5, 0.65 - i * 0.26); s.rotation.x = -0.35; }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) mesh(body, box(0.05, 0.08, 0.3), glow, s * 0.51, 0.08 - i * 0.14, 0.2 - i * 0.2);
    // neck: four links that curve up, then the head
    let p = grp(body, 0, 0.2, 0.72, 'neck0'); n.neck = [p];
    for (let i = 0; i < 4; i++) { const w = 0.46 - i * 0.04; mesh(p, box(w, w, 0.52), mats.skin, 0, 0, 0.24); mesh(p, box(0.08, 0.16, 0.2), glow, 0, w / 2 + 0.06, 0.24); p = grp(p, 0, 0, 0.46); n.neck.push(p); }
    const head = grp(p, 0, 0.05, 0.12, 'head');
    mesh(head, box(0.6, 0.48, 0.62), [mats.skin, mats.skin, mats.skin, mats.skin, mats.face, mats.skin], 0, 0, 0.18);
    mesh(head, box(0.42, 0.28, 0.55), mats.skin, 0, -0.07, 0.72);
    for (const s of [-1, 1]) { mesh(head, box(0.06, 0.04, 0.04), glow, s * 0.12, 0.02, 1.0); const h = mesh(head, box(0.1, 0.1, 0.62), mats.pants, s * 0.2, 0.3, -0.18); h.rotation.x = 0.55; h.rotation.y = -s * 0.25; const h2 = mesh(head, box(0.07, 0.07, 0.4), glow, s * 0.2, 0.47, -0.55); h2.rotation.x = 0.9; }
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) mesh(head, box(0.04, 0.08, 0.04), pale, s * (0.08 + i * 0.03), -0.24, 0.95 - i * 0.12);
    const jaw = grp(head, 0, -0.22, 0.3, 'jaw'); mesh(jaw, box(0.4, 0.11, 0.68), mats.skin, 0, -0.04, 0.32);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) mesh(jaw, box(0.04, 0.08, 0.04), pale, s * (0.08 + i * 0.03), 0.06, 0.6 - i * 0.12);
    n.mouth = grp(head, 0, -0.18, 1.02, 'mouth');
    n.mouthGlow = new THREE.Sprite(M.glowMat(VIO, 0)); n.mouthGlow.scale.setScalar(0.1); n.mouth.add(n.mouthGlow);
    // tail: six links narrowing to a crystal fin
    p = grp(body, 0, 0, -1.3, 'tail0'); n.tail = [p];
    for (let i = 0; i < 6; i++) { const w = 0.5 - i * 0.065; mesh(p, box(w, w * 0.9, 0.55), mats.skin, 0, 0, -0.26); mesh(p, box(0.07, 0.14, 0.18), glow, 0, w * 0.45 + 0.05, -0.26); p = grp(p, 0, 0, -0.5); n.tail.push(p); if (i === 2) n.tail2 = p; }
    for (const s of [-1, 1]) { const f = mesh(p, box(0.04, 0.5, 0.45), glow, s * 0.12, 0, -0.1); f.rotation.z = s * 0.7; }
    // wings: arm, three fingers, a membrane in two parts so the outer half can fold
    n.wings = [];
    for (const s of [-1, 1]) {
      const wing = grp(body, s * 0.5, 0.28, 0.3);
      mesh(wing, box(1.55, 0.14, 0.14), mats.skin, s * 0.77, 0, 0);
      const mem = (pts) => { const sh2 = new THREE.Shape(); pts.forEach(([u, v], i) => (i ? sh2.lineTo(u * s, v) : sh2.moveTo(u * s, v))); const geo = new THREE.ShapeGeometry(sh2); geo.rotateX(Math.PI / 2); return geo; };
      mesh(wing, mem([[0, 0.12], [1.55, 0.06], [1.55, -1.0], [0.8, -1.25], [0, -1.0]]), mats.shirt);
      const fore = grp(wing, s * 1.55, 0, 0);
      mesh(fore, box(1.4, 0.11, 0.11), mats.skin, s * 0.7, 0, 0.05);
      for (const [u, v] of [[1.5, 0.25], [1.85, -0.55], [1.3, -1.35]]) { const f = mesh(fore, box(0.06, 0.06, Math.hypot(u, v)), mats.pants, s * u / 2, 0.02, v / 2); f.rotation.y = Math.atan2(s * u, v); }
      mesh(fore, mem([[0, 0.06], [1.5, 0.25], [1.85, -0.55], [1.3, -1.35], [0, -1.0]]), mats.shirt);
      const claw = mesh(fore, box(0.08, 0.08, 0.28), glow, s * 1.5, 0.02, 0.38); claw.rotation.x = -0.4;
      n.wings.push({ wing, fore, s });
    }
    // legs: thigh, shin, a clawed foot; the back pair is heavier
    n.legs = [];
    for (const [x, z, k] of [[-0.42, 0.45, 1], [0.42, 0.45, 1], [-0.44, -0.8, 1.2], [0.44, -0.8, 1.2]]) {
      const hip = grp(body, x, -0.32, z);
      mesh(hip, box(0.28 * k, 0.62, 0.34 * k), mats.skin, 0, -0.3, 0);
      const knee = grp(hip, 0, -0.58, 0); mesh(knee, box(0.2 * k, 0.52, 0.22 * k), mats.skin, 0, -0.25, -0.03);
      const foot = grp(knee, 0, -0.5, 0); mesh(foot, box(0.32 * k, 0.1, 0.44), mats.pants, 0, -0.03, 0.08);
      for (const cx of [-0.1, 0, 0.1]) mesh(foot, box(0.05, 0.05, 0.14), pale, cx * k, -0.04, 0.34);
      n.legs.push({ hip, knee, foot, front: z > 0 });
    }
    const aura = new THREE.Sprite(M.glowMat(VIO, 0.25)); aura.position.set(0, 1.4, 0); aura.scale.setScalar(5); g.add(aura); n.aura = aura;
    return { g, n, a: {} };
  }

  // smooth every joint toward its target so states blend instead of snapping
  const sm = (a, key, v, k, dt) => (a[key] = a[key] === undefined ? v : a[key] + (v - a[key]) * Math.min(1, k * dt));
  function pose(z, R, dt, sp, S, C) {
    const n = R.n; const a = R.a; const t = z.bob; const cur = S.cur; const k = cur ? S.t / S.dur : 0;
    const grounded = z.pos.y < 0.6;
    let flap = Math.sin(t * 4.2); let flapAmp = 0.75; let wingBase = 0.2; let foreBase = 0; let sweep = 0;
    let pitch = BZ.clamp(-z.vel.y * 0.04, -0.4, 0.4); let neckUp = -0.42; let jaw = 0.08 + Math.max(0, Math.sin(t * 1.3)) * 0.06; let headPitch = 0.35; let neckYaw = Math.sin(t * 0.9) * 0.12; let tuck = 1;
    if (grounded && !cur) { flapAmp = 0.05; wingBase = 0.55; foreBase = -1.4; tuck = 0; neckUp = -0.3; }
    if (cur === 'barrage') { pitch = -0.38; flapAmp = 0.9; flap = Math.sin(t * 5.5); neckUp = -0.2; headPitch = 0.55; jaw = 0.15 + (S.data.mouth || 0) * 0.7; }
    if (cur === 'dive') { const ph = S.t; if (ph > 0.8 && ph < 1.6) { flapAmp = 0.05; wingBase = 0.05; foreBase = -0.5; sweep = 0.55; pitch = 0.15; jaw = 0.6; neckUp = -0.05; headPitch = 0.1; } else { pitch = ph < 0.8 ? -0.25 : -0.3; flap = Math.sin(t * 6); } }
    if (cur === 'breath') { const ph = S.t; if (ph > 0.6) { tuck = 0; flapAmp = 0.12; flap = Math.sin(t * 3); wingBase = 0.9; foreBase = -0.3; pitch = -0.12; } if (ph > 0.8) { neckUp = 0.05; headPitch = 0.25; jaw = ph > 1.1 ? 0.85 : 0.4; neckYaw = S.data.sweep || 0; } }
    if (cur === 'meteor') { pitch = -0.5; flapAmp = 1; flap = Math.sin(t * 6.5); neckUp = -0.7; headPitch = -0.2; jaw = 0.9; }
    if (cur === 'tailspin') { tuck = 0; flapAmp = 0.1; wingBase = 0.7; foreBase = -0.6; pitch = 0.1; }
    // body
    n.body.rotation.x = sm(a, 'pitch', pitch, 5, dt);
    n.body.rotation.z = sm(a, 'roll', BZ.clamp(-(z.yawV || 0) * 0.25, -0.5, 0.5), 4, dt);
    n.body.position.y = 1.35 + (grounded ? 0 : -flap * flapAmp * 0.12);
    // wings
    for (const w of n.wings) {
      const s = w.s; const lag = Math.sin(t * (cur === 'barrage' ? 5.5 : 4.2) - 0.7);
      w.wing.rotation.z = s * sm(a, 'w' + s, wingBase + flap * flapAmp, 10, dt);
      w.fore.rotation.z = s * sm(a, 'f' + s, foreBase + lag * flapAmp * 0.45, 10, dt);
      w.wing.rotation.y = -s * sm(a, 'sw' + s, sweep, 6, dt);
    }
    // neck and head
    const nu = sm(a, 'neckUp', neckUp, 4, dt); const ny = sm(a, 'neckYaw', neckYaw, 6, dt);
    n.neck.forEach((p, i) => { if (i === 0) return; p.rotation.x = i === 1 ? nu : -nu * 0.25 + Math.sin(t * 1.6 - i) * 0.04; p.rotation.y = ny / 4; });
    n.head.rotation.x = sm(a, 'headPitch', headPitch, 5, dt);
    n.jaw.rotation.x = sm(a, 'jaw', jaw, 12, dt);
    // tail waves along its links
    n.tail.forEach((p, i) => { if (i === 0) return; p.rotation.y = Math.sin(t * 2.1 - i * 0.7) * (cur === 'tailspin' ? 0.05 : 0.16); p.rotation.x = (cur === 'tailspin' ? -0.12 : 0.06) + Math.sin(t * 1.4 - i * 0.5) * 0.05; });
    // legs: tucked back in flight, planted on the ground
    const tk = sm(a, 'tuck', tuck, 4, dt);
    for (const L of n.legs) { L.hip.rotation.x = tk * (L.front ? 0.9 : 1.2); L.knee.rotation.x = tk * (L.front ? -1.4 : -1.6) + (1 - tk) * (L.front ? 0.15 : -0.25); L.foot.rotation.x = tk * 0.9 + (1 - tk) * (L.front ? -0.15 : 0.25); }
    // the mouth glows while charging a breath or a shot; the aura breathes
    const mg = cur === 'breath' && S.t > 0.8 ? Math.min(1, (S.t - 0.8) / 0.3) : cur === 'barrage' ? (S.data.mouth || 0) * 0.8 + 0.2 : cur === 'meteor' ? 0.8 : 0;
    n.mouthGlow.material.opacity = sm(a, 'mg', mg, 10, dt); n.mouthGlow.scale.setScalar(0.3 + a.mg * 1.4 + Math.sin(t * 30) * 0.08 * a.mg);
    n.aura.material.opacity = 0.18 + 0.08 * Math.sin(t * 3) + (C.rage(z) ? 0.15 : 0);
    if (S.data.mouth) S.data.mouth = Math.max(0, S.data.mouth - dt * 4);
    // breath and charge particles come out of the mouth on every screen
    if (cur === 'breath' && S.t > 0.8 && S.t < 1.1 && Math.random() < dt * 40) { const m = C.at(z, 'mouth'); const off = C.V().set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3); C.G.fx.puff(m.clone().add(off), { glow: true, vel: off.multiplyScalar(-3), s0: 0.1, s1: 0.5, life: 0.33, c0: PALE, c1: VIO, a0: 1 }); }
    if (cur === 'breath' && S.t > 1.1 && S.t < S.dur - 0.1) { const m = C.at(z, 'mouth'); const d = C.at(z, 'mouth', C.V().set(0, -0.35, 1)).sub(m).normalize(); for (let i = 0; i < 3; i++) C.G.fx.puff(m.clone(), { glow: true, vel: d.clone().multiplyScalar(14 + Math.random() * 6).add(C.V().set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3)), drag: 1.2, s0: 0.4, s1: 2.2, life: 0.75, c0: Math.random() < 0.4 ? PALE : VIO, c1: VIO2, a0: 0.9 }); }
  }

  // circle the target high up; face where it flies, turn to the target when close
  function idle(z, dt, P, dist, S, C) {
    const o = (S.orbit = (S.orbit || 0) + dt * (C.rage(z) ? 0.42 : 0.32));
    const R = 16; const tx = P.pos.x + Math.cos(o) * R; const tz = P.pos.z + Math.sin(o) * R;
    C.fly(z, dt, tx, 9 + Math.sin(z.bob * 0.7) * 1.5, tz, C.rage(z) ? 17 : 13, 1.6);
    turnTo(z, Math.atan2(z.vel.x, z.vel.z), dt, 3);
  }
  function turnTo(z, yaw, dt, k) { const d = BZ.wrapAngle(yaw - z.yaw) * Math.min(1, dt * k); z.yawV = d / Math.max(dt, 1e-3); z.yaw += d; }

  const moves = {
    barrage: {
      dur: 1.9, cd: 4, say: 'MƯA CẦU HƯ KHÔNG',
      when: (z, P, d) => d < 46,
      tick(z, dt, P, S, C) {
        C.fly(z, dt, z.pos.x, Math.max(6, z.pos.y), z.pos.z, 4); turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 6);
        const shots = C.rage(z) ? 7 : 5; const due = Math.floor((S.t - 0.45) / (1.2 / shots)) + 1;
        while ((S.data.fired || 0) < Math.min(shots, due)) {
          S.data.fired = (S.data.fired || 0) + 1; S.data.mouth = 1;
          const from = C.at(z, 'mouth'); const to = C.aimAt(P, 0.35).add(C.V().set(C.G.rng.range(-1.5, 1.5), 0, C.G.rng.range(-1.5, 1.5)));
          C.orb({ from, vel: to.sub(from).normalize().multiplyScalar(27), size: 0.6, col: VIO, col2: VIO2, core: PALE, blast: 3.4, dmg: 16, hazard: S.data.fired % 2 ? { kind: 'void', r: 1.8, dur: 3.5 } : null, sound: 'boom', rate: 1.3 });
          C.G.audio.playAt('screech', from, { gain: 0.6, rate: 0.5 });
        }
      },
    },
    dive: {
      dur: 2.3, cd: 6, say: 'BỔ NHÀO',
      when: (z, P, d) => d > 7,
      start(z, S, P, C) {
        const a = C.V().set(z.pos.x, 0, z.pos.z); const dir = C.V().set(P.pos.x - a.x, 0, P.pos.z - a.z); const len = Math.min(40, dir.length() * 2 + 6); dir.normalize();
        const b = a.clone().addScaledVector(dir, len);
        S.data.a = a; S.data.b = b; S.data.dir = dir; S.data.hit = new Set(); S.data.trail = 0;
        C.warn({ at: a, to: b, w: 5, dur: 0.8, col: VIO });
        C.G.audio.playAt('roar', z.pos, { gain: 1.2, rate: 0.7 });
      },
      tick(z, dt, P, S, C) {
        const D = S.data; if (!D.a) return;
        if (S.t < 0.8) { C.fly(z, dt, D.a.x - D.dir.x * 4, 11, D.a.z - D.dir.z * 4, 22, 4); turnTo(z, Math.atan2(D.dir.x, D.dir.z), dt, 8); return; }
        if (S.t < 1.6) {
          const k = (S.t - 0.8) / 0.8; const x = BZ.lerp(D.a.x, D.b.x, k); const zz = BZ.lerp(D.a.z, D.b.z, k);
          z.vel.set((D.b.x - D.a.x) / 0.8, 0, (D.b.z - D.a.z) / 0.8); z.pos.set(x, 0.8 + Math.sin(k * Math.PI) * -0.3 + (1 - Math.min(1, k * 6)) * 6, zz); z.yaw = Math.atan2(D.dir.x, D.dir.z);
          for (const p of C.players()) { if (D.hit.has(p)) continue; if (Math.hypot(p.pos.x - x, p.pos.z - zz) < 3.4 && p.pos.y < 4) { D.hit.add(p); C.hurt(p, 32, z.pos, null, 12); } }
          D.trail += dt; if (D.trail > 0.12) { D.trail = 0; C.hazard('void', C.V().set(x, 0, zz), 1.6, 3.5); C.boom(C.V().set(x, 0.3, zz), 1.6, [VIO, VIO2, PALE], { sound: false, smoke: false }); }
          C.shakeAt(z.pos, 1.5);
          return;
        }
        C.fly(z, dt, z.pos.x + D.dir.x * 6, 10, z.pos.z + D.dir.z * 6, 18, 3);
      },
    },
    breath: {
      dur: 3.1, cd: 7, say: 'HƠI THỞ HƯ KHÔNG',
      when: (z, P, d) => d < 30,
      start(z, S, P, C) {
        const d = C.V().set(z.pos.x - P.pos.x, 0, z.pos.z - P.pos.z); if (d.lengthSq() < 0.01) d.set(1, 0, 0); d.normalize();
        let land = C.V().set(P.pos.x + d.x * 10, 0, P.pos.z + d.z * 10); if (!C.inArena(land.x, land.z, 4)) land = C.V().set(P.pos.x - d.x * 10, 0, P.pos.z - d.z * 10);
        S.data.land = land; S.data.sweep = -0.6;
      },
      tick(z, dt, P, S, C) {
        const D = S.data; if (!D.land) return;
        if (S.t < 0.8) { C.fly(z, dt, D.land.x, 0, D.land.z, 24, 5); turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 5); return; }
        z.vel.set(0, 0, 0); z.pos.y = Math.max(0, z.pos.y - dt * 12);
        if (S.t > 0.8 && !D.landed) { D.landed = true; C.shock(C.V().set(z.pos.x, 0.05, z.pos.z), 9, 0.6, VIO, 18, { wall: true }); C.boom(C.V().set(z.pos.x, 0.4, z.pos.z), 3, [VIO, VIO2, PALE], { smoke: true }); }
        if (S.t < 1.1) { turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 6); return; }
        if (!D.beam) {
          const base = z.yaw; const R = 15; const from = C.at(z, 'mouth');
          const pt = (a) => C.V().set(z.pos.x + Math.sin(a) * R, 0.1, z.pos.z + Math.cos(a) * R);
          const dir = C.G.rng.chance(0.5) ? 1 : -1; D.dir = dir;
          D.beam = C.beam({ from, anchor: 'mouth', z, to: pt(base - 0.65 * dir), to2: pt(base + 0.65 * dir), w: 0.8, dur: S.dur - 1.2, col: VIO, core: PALE, dmg: 8, scorch: 'void' });
          C.G.audio.playAt('boom', z.pos, { gain: 0.9, rate: 0.45 });
        }
        D.sweep = BZ.lerp(-0.65, 0.65, (S.t - 1.1) / (S.dur - 1.2)) * D.dir;
      },
      look(z, S) { S.data.sweep = 0; },
    },
    meteor: {
      dur: 2.4, cd: 10, say: 'SAO BĂNG HƯ KHÔNG',
      start(z, S, P, C) {
        C.G.audio.playAt('roar', z.pos, { gain: 1.3, rate: 0.55 });
        const n = C.rage(z) ? 6 : 4;
        for (const p of C.players()) for (let i = 0; i < n; i++) {
          const a = C.G.rng.range(0, 6.3); const r = i === 0 ? 0 : C.G.rng.range(3, 8); const at = C.V().set(p.pos.x + Math.cos(a) * r, 0, p.pos.z + Math.sin(a) * r);
          if (!C.inArena(at.x, at.z, 1)) continue;
          C.after(i * 0.12, () => C.warn({ at, r: 2.6, dur: 1.25, col: VIO, fire: (T) => { const from = C.V().set(T.at.x + 4, 30, T.at.z - 3); C.orb({ from, vel: C.V().set(T.at.x, 0, T.at.z).sub(from).normalize().multiplyScalar(55), size: 0.9, col: VIO, col2: 0xff60c0, core: PALE, blast: 3.2, dmg: 26, hazard: { kind: 'void', r: 2, dur: 4 }, trailRate: 70 }); } }));
        }
      },
      tick(z, dt, P, S, C) { C.fly(z, dt, z.pos.x, 13, z.pos.z, 8); turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 4); },
    },
    tailspin: {
      dur: 1.2, cd: 4, say: 'QUẬT ĐUÔI',
      when: (z, P, d) => d < 9,
      tick(z, dt, P, S, C) {
        z.vel.set(0, 0, 0); if (z.pos.y > 0.05) C.fly(z, dt, z.pos.x, 0, z.pos.z, 20, 6);
        if (S.t > 0.35 && S.t < 0.95) { z.yaw += dt * 10.5; z.yawV = 10; }
        if (S.t > 0.55 && !S.data.hit) { S.data.hit = true; C.shock(C.V().set(z.pos.x, 0.05, z.pos.z), 9.5, 0.55, VIO, 26, { wall: true }); C.G.audio.playAt('swipe', z.pos, { gain: 1.2, rate: 0.5 }); C.shakeAt(z.pos, 5); }
      },
    },
  };

  BZ.bossKit('dragon', {
    type: { hp: 5200, speed: 10, dmg: 30, rate: 2, windup: 0.5, scale: 2.6, skin: 'bd_scale', face: 'bd_face', shirt: ['bd_wing'], pants: ['bd_belly'], score: 6000, eye: 0xe070ff, name: 'RỒNG HƯ KHÔNG', flyBoss: true },
    colors: [VIO, VIO2, PALE],
    rig,
    dress: (z) => { z.body.mats.shirt.side = THREE.DoubleSide; },
    init: (z, S) => { z.pos.y = 8; S.rest = 1.2; },
    hits: [['head', 'head', 0.3, 0], ['body', 'chest', 0.5, 0], ['body', 'rear', 0.42, 0], ['body', 'tail2', 0.25, 0]],
    pose, idle, moves, rest: 1.0,
    combos: [['barrage', 'dive'], ['dive', 'breath'], ['meteor', 'barrage'], ['breath', 'tailspin'], ['barrage', 'meteor']],
    rageCombos: [['meteor', 'dive', 'breath'], ['barrage', 'dive', 'barrage'], ['dive', 'breath', 'tailspin']],
  });
})();
