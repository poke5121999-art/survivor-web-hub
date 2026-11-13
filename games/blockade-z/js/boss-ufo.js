// Đĩa Bay: a huge saucer that drifts over the arena. A tractor beam that creeps after you, a bombing run down a marked
// lane, a ring of laser arms that sweeps the ground, a flash that drops runner invaders, an EMP wall and homing salvos.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;
  const rgb = BZ.rgb;
  const STEEL = 0x9aa4b0; const DARK = 0x3a4048; const CYAN = 0x40e0ff; const MAG = 0xff40c0; const YEL = 0xffe040;
  const LIGHTS = [CYAN, MAG, YEL];
  const SC = 3.2;

  BZ.defTex('bu_alien', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(rng.chance(0.2) ? 0x8ab08a : 0x6e946e)); });
  BZ.defTex('bu_face', 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(rng.chance(0.15) ? 0x8ab08a : 0x6e946e));
    for (const [x, y] of [[1, 2], [6, 2], [1, 3], [2, 3], [5, 3], [6, 3], [2, 4], [5, 4]]) set(x, y, rgb(0x050806));
    for (let x = 3; x < 5; x++) set(x, 6, rgb(0x3a5a3a));
  });
  BZ.defTex('bu_hull', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(x === 0 || y === 0 ? 0x6c7682 : (x === 4 && y === 4) ? 0xd8e0e8 : rng.chance(0.15) ? 0xb4bec8 : STEEL)); });
  BZ.defTex('bu_dark', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(y % 4 === 0 ? 0x2a3038 : rng.chance(0.2) ? 0x4a525c : DARK)); });

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
  function rig(G, b, M) {
    const sh = G.quality.shadow > 0; const mats = b.mats; const n = {};
    const g = new THREE.Group();
    const mesh = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = sh; parent.add(m); return m; };
    const grp = (parent, x = 0, y = 0, z = 0, name) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); if (name) n[name] = o; return o; };
    const glow = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false });
    const tilt = grp(g, 0, 0, 0, 'tilt');
    n.hull = mesh(tilt, cyl(0.9, 1.55, 0.2), mats.shirt, 0, 0.09, 0);
    mesh(tilt, cyl(1.55, 0.8, 0.24), mats.pants, 0, -0.14, 0);
    mesh(tilt, cyl(1.63, 1.63, 0.1), mats.pants, 0, -0.02, 0);
    n.top = mesh(tilt, cyl(0.6, 0.9, 0.12), mats.shirt, 0, 0.25, 0);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; const p = mesh(tilt, box(0.3, 0.02, 0.5), mats.pants, Math.sin(a) * 1.15, 0.2, Math.cos(a) * 1.15); p.rotation.y = a; p.rotation.x = 0.0; }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.78; mesh(tilt, box(0.04, 0.34, 0.04), mats.pants, Math.sin(a) * 0.82, 0.38, Math.cos(a) * 0.82); mesh(tilt, box(0.08, 0.08, 0.08), glow(MAG), Math.sin(a) * 0.82, 0.58, Math.cos(a) * 0.82); }
    // rim of coloured lights that spins on its own
    n.rim = grp(tilt, 0, -0.02, 0); n.lights = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const mat = glow(LIGHTS[i % 3]); const m = mesh(n.rim, box(0.13, 0.1, 0.13), mat, Math.sin(a) * 1.66, 0, Math.cos(a) * 1.66); m.rotation.y = a; m.castShadow = false; n.lights.push({ m, mat }); }
    // glass dome with the alien pilot at his console
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.58, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    dome.position.y = 0.3; tilt.add(dome); n.dome = dome;
    const pilot = grp(tilt, 0, 0.3, 0.02, 'pilot'); n.pilotBody = mesh(pilot, box(0.2, 0.22, 0.14), mats.skin, 0, 0.11, -0.02);
    mesh(pilot, box(0.34, 0.03, 0.2), glow(CYAN), 0, 0.08, 0.2); mesh(pilot, box(0.3, 0.09, 0.14), mats.pants, 0, 0.04, 0.2);
    for (const s of [-1, 1]) { const arm = mesh(pilot, box(0.05, 0.05, 0.2), mats.skin, s * 0.14, 0.14, 0.1); arm.rotation.x = 0.3; mesh(pilot, box(0.04, 0.02, 0.04), glow(i2(s)), s * 0.12, 0.1, 0.22); }
    const head = grp(pilot, 0, 0.36, 0, 'head');
    mesh(head, box(0.3, 0.34, 0.28), [mats.skin, mats.skin, mats.skin, mats.skin, mats.face, mats.skin], 0, 0, 0);
    mesh(head, box(0.22, 0.22, 0.2), mats.skin, 0, 0.06, -0.2);
    for (const s of [-1, 1]) { const eg = new THREE.Sprite(M.glowMat(MAG, 0.5)); eg.position.set(s * 0.09, 0.03, 0.16); eg.scale.setScalar(0.14); head.add(eg); }
    // underside: emitter, glow rings, landing struts that fold into the hull
    n.belly = grp(tilt, 0, -0.27, 0, 'belly');
    mesh(n.belly, cyl(0.3, 0.46, 0.12, 12), mats.pants, 0, 0.02, 0);
    n.bGlow = new THREE.Sprite(M.glowMat(CYAN, 0.7)); n.bGlow.position.y = -0.1; n.bGlow.scale.setScalar(1.2); n.belly.add(n.bGlow);
    const flat = new THREE.PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
    n.rings = [2.7, 1.7].map((r, i) => { const m = new THREE.Mesh(flat, M.addMat(i ? MAG : CYAN, 0.8, 'bz_ring')); m.position.y = -0.04 - i * 0.015; m.scale.setScalar(r); m.renderOrder = 5; n.belly.add(m); return m; });
    n.struts = [];
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2 + 0.5; const yawG = grp(tilt, 0, -0.2, 0); yawG.rotation.y = a - Math.PI / 2; const hinge = grp(yawG, 0, 0, 0.0); hinge.position.x = 0.0; hinge.position.z = 0; yawG.position.set(Math.sin(a) * 0.95, -0.2, Math.cos(a) * 0.95);
      mesh(hinge, box(0.08, 0.7, 0.08), mats.pants, 0, -0.35, 0); mesh(hinge, box(0.3, 0.05, 0.3), mats.shirt, 0, -0.72, 0); mesh(hinge, box(0.04, 0.04, 0.04), glow(YEL), 0, -0.66, 0.1);
      n.struts.push(hinge);
    }
    const aura = new THREE.Sprite(M.glowMat(CYAN, 0.12)); aura.position.set(0, 0, 0); aura.scale.setScalar(7.5); g.add(aura); n.aura = aura;
    return { g, n, a: {} };
  }
  function i2(s) { return s > 0 ? MAG : YEL; }

  const sm = (a, key, v, k, dt) => (a[key] = a[key] === undefined ? v : a[key] + (v - a[key]) * Math.min(1, k * dt));
  function pose(z, R, dt, sp, S, C) {
    const n = R.n; const a = R.a; const t = z.bob; const cur = S.cur;
    const fy = z.yaw; const vf = z.vel.x * Math.sin(fy) + z.vel.z * Math.cos(fy); const vr = z.vel.x * Math.cos(fy) - z.vel.z * Math.sin(fy);
    n.tilt.rotation.x = sm(a, 'tx', BZ.clamp(vf * 0.022, -0.5, 0.5), 4, dt); n.tilt.rotation.z = sm(a, 'tz', BZ.clamp(-vr * 0.022, -0.5, 0.5), 4, dt);
    n.tilt.position.y = Math.sin(t * 1.4) * 0.05;
    let spin = 1.2; let tint = CYAN; let bg = 0.45; let strut = 0; let ring = 1; let flashLights = 0;
    if (cur === 'tractor') { spin = 2.5; bg = S.t > 0.9 ? 1.1 : 0.4 + S.t * 0.6; }
    if (cur === 'bomb') { spin = 3; tint = YEL; bg = 0.7; }
    if (cur === 'laserRing') { const c = Math.min(1, S.t / 0.9); spin = S.t < 0.9 ? 1.2 + c * 3 : 7; tint = MAG; bg = 0.4 + c * 0.7; flashLights = S.t > 0.9 ? 1 : c * 0.5; }
    if (cur === 'invade') { strut = 1; spin = 1.8; tint = 0xffffff; bg = 0.6 + (S.t < 0.8 ? S.t : 1.2) * 0.5; }
    if (cur === 'emp') { const c = Math.min(1, S.t / 0.85); spin = 1.5 + c * 6; bg = 0.4 + c * 0.9; ring = 1 + c * 0.9; flashLights = c; }
    if (cur === 'salvo') { spin = 3.5; tint = MAG; bg = 0.8; }
    a.rim = (a.rim || 0) + dt * sm(a, 'spin', spin, 5, dt); n.rim.rotation.y = a.rim;
    const step = Math.floor(t * 7);
    n.lights.forEach((L, i) => { const c = flashLights > 0.6 && (Math.floor(t * 20) + i) % 2 ? 0xffffff : LIGHTS[(i + step) % 3]; L.mat.color.setHex(c); L.m.scale.y = 1 + (cur ? 0.5 + Math.sin(t * 12 + i) * 0.4 : 0.15 * Math.sin(t * 6 + i)); });
    n.pilot.position.y = 0.3 + Math.sin(t * 2.2) * 0.012; n.head.rotation.x = Math.sin(t * 1.7) * 0.06 + (cur ? 0.1 : 0); n.head.rotation.y = Math.sin(t * 0.8) * 0.2;
    // struts fold inward when flying
    const e = sm(a, 'strut', strut, 3, dt);
    n.struts.forEach((h) => { h.rotation.z = -1.5 * (1 - e); h.scale.y = 0.55 + 0.45 * e; });
    n.bGlow.material.color.setHex(tint); n.bGlow.material.opacity = Math.min(1, sm(a, 'bg', bg, 8, dt) + Math.sin(t * 9) * 0.06); n.bGlow.scale.setScalar(1 + a.bg * 1.4);
    const rs = sm(a, 'ring', ring, 6, dt); n.rings[0].scale.setScalar(2.7 * rs); n.rings[1].scale.setScalar(1.7 * (1 + (rs - 1) * 0.5)); n.rings[0].rotation.y = t * 0.8; n.rings[1].rotation.y = -t * 1.3;
    n.rings[0].material.color.setHex(cur === 'laserRing' || cur === 'salvo' ? MAG : CYAN); n.rings[1].material.color.setHex(cur === 'bomb' ? YEL : MAG);
    n.rings.forEach((m, i) => { m.material.opacity = 0.55 + 0.3 * Math.sin(t * (4 + i * 3)) + a.bg * 0.2; });
    n.dome.material.opacity = 0.2 + (cur ? 0.1 : 0);
    n.aura.material.opacity = 0.1 + 0.04 * Math.sin(t * 3) + (C.rage(z) ? 0.1 : 0);
    if (cur === 'emp' && S.t < 0.85 && Math.random() < dt * 40) { const m = C.at(z, 'belly'); const off = C.V().set(Math.random() - 0.5, -Math.random(), Math.random() - 0.5).multiplyScalar(8); C.G.fx.puff(m.clone().add(off), { glow: true, vel: off.clone().multiplyScalar(-2.2), s0: 0.3, s1: 0.05, life: 0.4, c0: 0xffffff, c1: CYAN, a0: 1 }); }
    if (cur === 'tractor' && S.t > 0.9 && Math.random() < dt * 30) { const m = C.at(z, 'belly'); C.G.fx.puff(m.clone().add(C.V().set(Math.random() - 0.5, -0.4, Math.random() - 0.5).multiplyScalar(2)), { glow: true, vel: C.V().set(0, -6, 0), s0: 0.3, s1: 0.05, life: 0.3, c0: 0xffffff, c1: CYAN, a0: 0.9 }); }
  }

  const hover = (z, dt, C, y = 8.5, sp = 6) => C.fly(z, dt, z.pos.x, y, z.pos.z, sp, 3);
  const turnTo = (z, yaw, dt, k) => { const d = BZ.wrapAngle(yaw - z.yaw) * Math.min(1, dt * k); z.yawV = d / Math.max(dt, 1e-3); z.yaw += d; };
  const toward = (z, P) => Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z);

  // wide arcs around the player at a steady height
  function idle(z, dt, P, dist, S, C) {
    const dir = S.n % 2 ? 1 : -1; const R = 18 + Math.sin(z.bob * 0.4) * 3; const lim = C.G.world.HALF + 2;
    const o = Math.atan2(z.pos.x - P.pos.x, z.pos.z - P.pos.z) + 0.5 * dir;
    C.fly(z, dt, BZ.clamp(P.pos.x + Math.sin(o) * R, -lim, lim), 8.5 + Math.sin(z.bob * 0.7) * 1.3, BZ.clamp(P.pos.z + Math.cos(o) * R, -lim, lim), C.rage(z) ? 12 : 9, 1.6);
    turnTo(z, toward(z, P), dt, 3);
  }
  const ground = (x, zz) => new THREE.Vector3(x, 0.1, zz);
  const lim = 38;

  const moves = {
    tractor: {
      dur: 4.0, cd: 9, say: 'TIA HÚT',
      when: (z, P, d) => d < 44,
      start(z, S, P, C) {
        const T = ground(P.pos.x, P.pos.z); S.data.T = T; S.data.next = 0.9;
        C.warn({ at: C.V().set(T.x, 0, T.z), r: 3.4, dur: 0.9, col: CYAN });
        C.G.audio.playAt('boom', z.pos, { gain: 0.5, rate: 2 });
      },
      tick(z, dt, P, S, C) {
        const D = S.data; if (!D.T) return; hover(z, dt, C); turnTo(z, toward(z, P), dt, 3);
        if (S.t < 0.9) return;
        const to = C.V().set(P.pos.x - D.T.x, 0, P.pos.z - D.T.z); const l = to.length(); if (l > 0.05) to.multiplyScalar(Math.min(l, 3.8 * dt) / l); D.T.add(to);
        if (S.t >= D.next && S.t < S.dur - 0.5) {
          D.next += 0.45; const dir = C.V().set(P.pos.x - D.T.x, 0, P.pos.z - D.T.z); const dl = dir.length(); if (dl > 0.05) dir.multiplyScalar(Math.min(dl, 3.8 * 0.65) / dl);
          C.beam({ from: C.at(z, 'belly'), to: D.T.clone(), to2: D.T.clone().add(dir), w: 1.4, dur: 0.65, col: CYAN, core: 0xffffff, dmg: 6, fx: { slow: 1.4 }, follow: () => C.at(z, 'belly') });
        }
      },
    },
    bomb: {
      dur: 3.3, cd: 8, say: 'ĐỢT ONG BOM',
      start(z, S, P, C) {
        const bt = C.V().set(P.pos.x - z.pos.x, 0, P.pos.z - z.pos.z); const perp = C.V().set(-bt.z, 0, bt.x); if (perp.lengthSq() < 0.01) perp.set(1, 0, 0); perp.normalize().multiplyScalar(C.G.rng.chance(0.5) ? 1 : -1);
        const A = ground(BZ.clamp(P.pos.x - perp.x * 20, -lim, lim), BZ.clamp(P.pos.z - perp.z * 20, -lim, lim)); const B = ground(BZ.clamp(P.pos.x + perp.x * 20, -lim, lim), BZ.clamp(P.pos.z + perp.z * 20, -lim, lim));
        const dir = C.V().set(B.x - A.x, 0, B.z - A.z); dir.normalize();
        Object.assign(S.data, { A, B, dir, drop: 0 });
        C.warn({ at: C.V().set(A.x, 0, A.z), to: C.V().set(B.x, 0, B.z), w: 7, dur: 1.0, col: YEL });
        C.G.audio.playAt('boom', z.pos, { gain: 0.6, rate: 1.6 });
      },
      tick(z, dt, P, S, C) {
        const D = S.data; if (!D.A) return; const run = 1.5;
        if (S.t < 1.0) { C.fly(z, dt, D.A.x - D.dir.x * 2, 9.5, D.A.z - D.dir.z * 2, 48, 6); turnTo(z, Math.atan2(D.dir.x, D.dir.z), dt, 8); return; }
        if (S.t < 1.0 + run) {
          const k = (S.t - 1.0) / run; const len = Math.hypot(D.B.x - D.A.x, D.B.z - D.A.z);
          z.vel.set(D.dir.x * len / run, 0, D.dir.z * len / run); z.pos.set(BZ.lerp(D.A.x, D.B.x, k), 9.5, BZ.lerp(D.A.z, D.B.z, k)); z.yaw = Math.atan2(D.dir.x, D.dir.z);
          D.drop += dt;
          while (D.drop > 0.11) {
            D.drop -= 0.11; const sd = C.G.rng.range(-4.5, 4.5);
            C.orb({ from: z.pos.clone(), vel: C.V().set(-D.dir.z * sd, -3, D.dir.x * sd), size: 0.55, col: YEL, col2: MAG, core: 0xffffff, grav: 26, life: 3, blast: 2.9, dmg: 18, hazard: { kind: 'fire', r: 1.8, dur: 2.5 }, trailRate: 55, sound: 'boom', rate: 1.1 });
          }
          C.shakeAt(z.pos, 1.2); return;
        }
        C.fly(z, dt, z.pos.x + D.dir.x * 5, 8.5, z.pos.z + D.dir.z * 5, 12, 2.5);
      },
    },
    laserRing: {
      dur: 3.6, cd: 10, say: 'VÒNG LASER XOAY',
      start(z, S, P, C) {
        const N = C.rage(z) ? 6 : 4; const a0 = C.G.rng.range(0, 6.3); const dir = C.G.rng.chance(0.5) ? 1 : -1;
        Object.assign(S.data, { N, a0, dir, w: C.rage(z) ? 1.3 : 1.0, next: 0.9 });
        const c = C.V().set(z.pos.x, 0, z.pos.z);
        for (let i = 0; i < N; i++) { const a = a0 + i * Math.PI * 2 / N; C.warn({ at: c.clone(), to: C.V().set(c.x + Math.sin(a) * 10, 0, c.z + Math.cos(a) * 10), w: 2, dur: 0.9, col: MAG }); }
        C.G.audio.playAt('boom', z.pos, { gain: 0.6, rate: 1.8 });
      },
      tick(z, dt, P, S, C) {
        const D = S.data; if (!D.N) return; hover(z, dt, C, 9); z.vel.x *= 0.9; z.vel.z *= 0.9;
        if (S.t < D.next || S.t > S.dur - 0.5) return;
        const ts = S.t; const seg = 0.55; const rimR = 1.55 * SC * 0.9;
        const rimPt = (ang) => C.V().set(z.pos.x + Math.sin(ang) * rimR, z.pos.y - 0.12 * SC, z.pos.z + Math.cos(ang) * rimR);
        const gp = (ang, rg) => ground(z.pos.x + Math.sin(ang) * rg, z.pos.z + Math.cos(ang) * rg);
        const ang = (i, tt) => D.a0 + i * Math.PI * 2 / D.N + D.dir * D.w * (tt - 0.9);
        D.next += 0.3; const rg = 8 + Math.sin(S.t * 2) * 1.0;
        for (let i = 0; i < D.N; i++) {
          C.beam({ from: rimPt(ang(i, ts)), to: gp(ang(i, ts), rg), to2: gp(ang(i, ts + seg), rg), w: 1.1, dur: seg, col: MAG, core: 0xffffff, dmg: 6, scorch: 'fire', follow: () => rimPt(ang(i, Math.min(S.t, ts + seg))) });
        }
      },
    },
    invade: {
      dur: 2.2, cd: 12, say: 'ĐỘI XÂM LĂNG',
      when: (z, P, d, C) => { const L = C.G.zombies.list; return !L || L.filter((q) => q.alive).length < 16; },
      start(z, S, P, C) {
        const n = C.rage(z) ? 4 : 3; const a0 = C.G.rng.range(0, 6.3);
        for (let i = 0; i < n; i++) {
          const a = a0 + i * Math.PI * 2 / n; const r = i === 0 ? 0 : 5 + C.G.rng.range(0, 2); let at = C.V().set(P.pos.x + Math.sin(a) * r, 0, P.pos.z + Math.cos(a) * r);
          if (!C.inArena(at.x, at.z, 2)) at = C.V().set(P.pos.x, 0, P.pos.z);
          C.after(i * 0.12, () => {
            C.warn({ at, r: 2.6, dur: 0.8, col: CYAN, fire: (T) => {
              const top = C.at(z, 'belly'); C.beam({ from: top, to: C.V().set(T.at.x, 0.1, T.at.z), w: 1.2, dur: 0.5, col: CYAN, core: 0xffffff, dmg: 1 });
              C.flash(C.V().set(T.at.x, 1.5, T.at.z), 9, 0xffffff, 0.45); C.boom(C.V().set(T.at.x, 0.4, T.at.z), 2.2, [CYAN, 0xffffff], { smoke: false });
              for (const p of C.players()) if (Math.hypot(p.pos.x - T.at.x, p.pos.z - T.at.z) < 2.9) C.hurt(p, 16, T.at, null, 6);
              C.summon('runner', C.V().set(T.at.x, 0, T.at.z), 0.3);
            } });
          });
        }
      },
      tick(z, dt, P, S, C) { hover(z, dt, C, 8); turnTo(z, toward(z, P), dt, 3); },
    },
    emp: {
      dur: 2.1, cd: 8, say: 'SÓNG XUNG ĐIỆN TỪ',
      start(z, S, P, C) {
        const at = C.V().set(z.pos.x, 0.05, z.pos.z);
        C.warn({ at: at.clone(), r: 7, dur: 0.85, col: CYAN, fire: () => {
          C.shock(at.clone(), 26, 1.35, CYAN, 24, { wall: true, h: 1.5 }); C.flash(C.V().set(at.x, z.pos.y - 1, at.z), 14, 0xffffff, 0.5); C.boom(C.V().set(at.x, 0.6, at.z), 3, [CYAN, 0xffffff], { smoke: false }); C.shakeAt(at, 6, 40);
          if (C.rage(z)) C.after(0.4, () => C.shock(at.clone(), 26, 1.35, MAG, 24, { wall: true, h: 1.5 }));
        } });
        C.G.audio.playAt('boom', z.pos, { gain: 0.6, rate: 2 });
      },
      tick(z, dt, P, S, C) { hover(z, dt, C, 7.8, 8); z.vel.x *= 0.9; z.vel.z *= 0.9; turnTo(z, toward(z, P), dt, 3); },
    },
    salvo: {
      dur: 2.5, cd: 7, say: 'LOẠT CẦU TÌM',
      tick(z, dt, P, S, C) {
        hover(z, dt, C); turnTo(z, toward(z, P), dt, 4);
        const n = C.rage(z) ? 6 : 4; const D = S.data; D.i = D.i || 0;
        while (D.i < n && S.t >= 0.7 + D.i * 0.2) {
          const a = z.yaw + (D.i - (n - 1) / 2) * 0.9; const out = C.V().set(Math.sin(a), 0, Math.cos(a)); const from = C.at(z, 'belly').addScaledVector(out, 3.4);
          C.orb({ from, vel: out.clone().multiplyScalar(11).setY(-9), size: 0.5, col: MAG, col2: YEL, core: 0xffffff, shape: 'shard', homing: 1.7, homeAfter: 0.35, life: 5, blast: 2.4, dmg: 18, trailRate: 70, sound: 'boom', rate: 1.2 });
          C.flash(from, 3, MAG, 0.25); C.G.audio.playAt('boom', from, { gain: 0.4, rate: 1.8 }); D.i++;
        }
      },
    },
  };

  BZ.bossKit('ufo', {
    type: { hp: 5600, speed: 9, dmg: 30, rate: 2, windup: 0.5, scale: SC, skin: 'bu_alien', face: 'bu_face', shirt: ['bu_hull'], pants: ['bu_dark'], score: 6000, eye: MAG, name: 'ĐĨA BAY', flyBoss: true },
    colors: [CYAN, MAG, 0xffffff],
    rig,
    init: (z, S) => { z.pos.y = 8.5; S.rest = 1.2; },
    hits: [['head', 'head', 0.3, 0], ['body', 'hull', 1.05, 0], ['body', 'top', 0.6, 0.1]],
    pose, idle, moves, rest: 1.0,
    combos: [['salvo', 'tractor'], ['bomb', 'emp'], ['laserRing', 'salvo'], ['invade', 'bomb'], ['tractor', 'laserRing'], ['emp', 'invade'], ['bomb', 'salvo']],
    rageCombos: [['bomb', 'laserRing', 'emp'], ['salvo', 'tractor', 'bomb'], ['invade', 'emp', 'laserRing']],
  });
})();
