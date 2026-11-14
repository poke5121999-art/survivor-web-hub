// Hộ Vệ Cổ Đại: a slow stone colossus with a single cyan eye. It slams the ground twice, sweeps an eye laser, calls rock rain,
// raises a line of earth spikes, overcharges the rune wheel on its back and charges down a marked lane.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;
  const rgb = BZ.rgb;
  const STONE = 0x8a8a80; const DARK = 0x4a4a46; const MOSS = 0x4a6a2a; const CY = 0x40f0ff; const PALE = 0xc0ffff; const CY2 = 0x1888a0;

  BZ.defTex('gd_stone', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const crack = (x === 3 && y > 1 && y < 6) || (y === 5 && x > 3); set(x, y, rgb(crack ? 0x3a3a36 : rng.chance(0.2) ? 0x9c9c90 : rng.chance(0.25) ? 0x7a7a70 : STONE)); } });
  BZ.defTex('gd_face', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(y === 5 || x === 0 ? 0x5a5a54 : rng.chance(0.2) ? 0x9c9c90 : STONE)); });
  BZ.defTex('gd_dark', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const seam = y % 4 === 3 || (x + (y >> 2) * 4) % 8 === 7; set(x, y, rgb(seam ? 0x2e2e2c : rng.chance(0.2) ? 0x5a5a54 : DARK)); } });
  BZ.defTex('gd_legs', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(y === 7 ? 0x3a3a38 : rng.chance(0.22) ? 0x6a6a62 : 0x585852)); });

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const OCT = new THREE.OctahedronGeometry(0.5, 0);
  function rig(G, b, M) {
    const sh = G.quality.shadow > 0; const mats = b.mats; const n = {};
    const g = new THREE.Group();
    const mesh = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = sh; parent.add(m); return m; };
    const grp = (parent, x = 0, y = 0, z = 0, name) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); if (name) n[name] = o; return o; };
    const rune = new THREE.MeshBasicMaterial({ color: CY, fog: false }); const pale = new THREE.MeshBasicMaterial({ color: PALE, fog: false });
    const moss = new THREE.MeshLambertMaterial({ color: MOSS }); const dark = new THREE.MeshLambertMaterial({ color: DARK });
    n.rune = rune;
    const moss1 = (p, w, d, x, y, z) => mesh(p, box(w, 0.05, d), moss, x, y, z);

    // legs
    n.legs = [];
    for (const s of [-1, 1]) {
      const hip = grp(g, s * 0.4, 0.82, 0);
      mesh(hip, box(0.56, 0.44, 0.6), mats.pants, 0, -0.2, 0, 0.04, 0, 0);
      mesh(hip, box(0.06, 0.34, 0.04), rune, s * 0.29, -0.2, 0.2);
      const knee = grp(hip, 0, -0.42, 0); mesh(knee, box(0.5, 0.38, 0.52), mats.skin, 0, -0.2, 0.02, 0, 0.05 * s, 0);
      mesh(knee, box(0.5, 0.1, 0.1), dark, 0, 0.02, 0.28);
      mesh(knee, box(0.05, 0.28, 0.04), rune, 0, -0.2, 0.29);
      moss1(knee, 0.3, 0.2, -0.05 * s, -0.01, 0.1);
      const foot = grp(knee, 0, -0.36, 0.06, s < 0 ? 'footL' : 'footR'); mesh(foot, box(0.62, 0.16, 0.82), dark, 0, -0.06, 0.1);
      n.legs.push({ hip, knee, foot, s });
    }
    // torso
    const torso = grp(g, 0, 0.84, 0, 'torso');
    mesh(torso, box(1.0, 0.34, 0.7), mats.pants, 0, 0.08, 0);
    n.chest = mesh(torso, box(1.4, 0.9, 0.9), mats.skin, 0, 0.7, 0);
    mesh(torso, box(1.1, 0.5, 0.2), mats.shirt, 0, 0.82, 0.5);
    mesh(torso, box(0.18, 0.22, 0.16), dark, 0, 0.12, 0.38);
    mesh(torso, box(0.07, 0.64, 0.04), rune, 0, 0.82, 0.61);
    mesh(torso, box(0.64, 0.06, 0.04), rune, 0, 0.98, 0.61);
    mesh(torso, box(0.4, 0.06, 0.04), rune, 0, 0.7, 0.61);
    for (const s of [-1, 1]) { mesh(torso, box(0.05, 0.4, 0.04), rune, s * 0.38, 0.78, 0.61); mesh(torso, box(0.3, 0.3, 0.04), mats.shirt, s * 0.4, 0.5, 0.46, 0, 0, 0.3 * s); }
    moss1(torso, 0.5, 0.4, -0.3, 1.16, 0.0); moss1(torso, 0.3, 0.3, 0.35, 1.16, -0.2);
    mesh(torso, box(1.3, 0.8, 0.1), mats.shirt, 0, 0.78, -0.5);
    // head sunk between the shoulders, one big eye
    const head = grp(torso, 0, 1.28, 0.1, 'head');
    mesh(head, box(0.5, 0.42, 0.5), [mats.skin, mats.skin, mats.skin, mats.skin, mats.face, mats.skin], 0, 0, 0);
    mesh(head, box(0.56, 0.1, 0.54), dark, 0, 0.24, 0);
    mesh(head, box(0.34, 0.1, 0.1), dark, 0, 0.12, 0.28);
    moss1(head, 0.3, 0.3, 0.05, 0.3, -0.05);
    n.eye = grp(head, 0, -0.02, 0.28, 'eye');
    mesh(n.eye, box(0.34, 0.2, 0.06), dark, 0, 0, -0.01);
    n.eyeCore = mesh(n.eye, box(0.26, 0.14, 0.05), rune, 0, 0, 0.03);
    mesh(n.eye, box(0.08, 0.1, 0.06), pale, 0, 0, 0.06);
    n.eyeGlow = new THREE.Sprite(M.glowMat(CY, 0.35)); n.eyeGlow.scale.setScalar(0.6); n.eyeGlow.position.z = 0.1; n.eye.add(n.eyeGlow);
    // arms: shoulder block, upper arm, forearm, huge fist
    n.arms = [];
    for (const s of [-1, 1]) {
      const arm = grp(torso, s * 0.98, 1.0, 0);
      mesh(arm, box(0.74, 0.5, 0.78), mats.skin, s * 0.04, 0.1, 0, 0, 0, 0.08 * s);
      mesh(arm, box(0.5, 0.12, 0.5), dark, s * 0.04, 0.38, 0.0);
      moss1(arm, 0.4, 0.3, s * 0.05, 0.36, -0.1);
      mesh(arm, box(0.06, 0.4, 0.04), rune, s * 0.4, 0.1, 0.34);
      mesh(arm, box(0.48, 0.62, 0.5), mats.shirt, 0, -0.34, 0);
      mesh(arm, box(0.05, 0.46, 0.04), rune, 0, -0.34, 0.27);
      const elbow = grp(arm, 0, -0.66, 0); mesh(elbow, box(0.56, 0.18, 0.56), dark, 0, 0, 0);
      mesh(elbow, box(0.52, 0.62, 0.52), mats.skin, 0, -0.34, 0);
      mesh(elbow, box(0.05, 0.44, 0.04), rune, 0, -0.34, 0.28);
      const fist = grp(elbow, 0, -0.74, 0.04, s < 0 ? 'fistL' : 'fistR');
      mesh(fist, box(0.78, 0.62, 0.74), mats.skin, 0, -0.04, 0.04, 0.05, 0, 0);
      mesh(fist, box(0.8, 0.12, 0.76), dark, 0, 0.26, 0.04);
      for (let i = 0; i < 3; i++) mesh(fist, box(0.2, 0.1, 0.04), rune, (i - 1) * 0.24, -0.04, 0.42);
      n.arms.push({ arm, elbow, fist, s });
    }
    // rune wheel floating behind the back
    n.wheel = grp(torso, 0, 1.0, -1.0, 'wheel'); n.stones = [];
    const N = 5;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2; const st = grp(n.wheel, Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0);
      mesh(st, box(0.3, 0.38, 0.22), mats.skin, 0, 0, 0, 0.3, 0.4, 0.2 * i);
      mesh(st, box(0.1, 0.16, 0.26), rune, 0, 0, 0.02, 0.3, 0.4, 0.2 * i);
      const gl = new THREE.Sprite(M.glowMat(CY, 0.35)); gl.scale.setScalar(0.9); st.add(gl);
      n.stones.push({ st, gl, a });
    }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; mesh(n.wheel, box(0.05, 0.05, 0.05), pale, Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0).scale.setScalar(0.7); }
    mesh(n.wheel, OCT, rune, 0, 0, 0).scale.setScalar(0.3);
    n.aura = new THREE.Sprite(M.glowMat(CY, 0.12)); n.aura.position.set(0, 1.2, 0); n.aura.scale.setScalar(5.5); g.add(n.aura);
    // detail and things that trail: slabs of plate on the shoulders, cracks and rune lines, a broken collar of standing stones,
    // a belt of blocks; moss and roots hang from the arms, shoulders and belt, and chains from the wrists
    if (M.detail) {
      M.detail(torso, 'torso', [[0.5, 1.1, -0.4, 0.98, 1.3, 0.42, DARK], [-0.98, 1.1, -0.4, -0.5, 1.3, 0.42, DARK], [0.62, 1.3, -0.2, 0.86, 1.48, 0.2, STONE, [0, 0, -0.3]], [-0.86, 1.3, -0.2, -0.62, 1.48, 0.2, STONE, [0, 0, 0.3]],
        [-0.5, 1.14, -0.5, -0.3, 1.5, -0.36, STONE, [0.15, 0, 0.1]], [0.3, 1.14, -0.5, 0.5, 1.42, -0.36, STONE, [0.15, 0, -0.1]], [-0.1, 1.14, -0.52, 0.1, 1.36, -0.38, DARK],
        [-0.74, 0.18, -0.48, 0.74, 0.34, 0.48, DARK], [-0.2, 0.14, 0.44, 0.2, 0.4, 0.54, STONE], [-0.72, 0.5, 0.44, -0.4, 0.56, 0.47, DARK, [0, 0, 0.5]], [0.3, 0.86, 0.44, 0.68, 0.92, 0.47, DARK, [0, 0, -0.4]],
        [0.3, 0.3, 0.44, 0.7, 0.9, 0.455, MOSS], [-0.7, 0.9, 0.44, -0.46, 1.14, 0.455, MOSS], [-0.71, 0.4, -0.2, -0.7, 0.8, 0.3, MOSS], [0.7, 0.6, -0.3, 0.71, 1.0, 0.1, MOSS]]);
      M.detail(torso, 'runes', [[-0.5, 0.62, 0.451, -0.44, 0.9, 0.46, CY], [0.44, 0.5, 0.451, 0.5, 0.74, 0.46, CY], [-0.3, 0.3, 0.451, 0.3, 0.33, 0.46, CY2]], true);
      for (const s of [-1, 1]) { M.dangle(torso, s * 0.8, 1.1, 0.36, 'moss', [[-0.16, -0.5, -0.02, 0.16, 0, 0.02, MOSS], [-0.1, -0.78, -0.02, 0.04, -0.5, 0.02, 0x3a5a20], [0.06, -0.66, -0.02, 0.14, -0.5, 0.02, 0x3a5a20]], { k: 0.8, s: 2.5 });
        M.dangle(torso, s * 0.5, 0.2, 0.5, 'root', [[-0.03, -0.6, -0.03, 0.03, 0, 0.03, 0x4a3a26], [-0.02, -0.9, -0.02, 0.02, -0.6, 0.02, 0x3a2c1c], [0.0, -0.4, 0.0, 0.14, -0.36, 0.03, 0x4a3a26]], { k: 0.9, s: 2.5 }); }
      for (const k of ['fistL', 'fistR']) if (n[k]) M.dangle(n[k], 0, 0.5, 0.3, 'chain', [[-0.04, -0.2, -0.04, 0.04, 0, 0.04, DARK], [-0.03, -0.42, -0.05, 0.03, -0.22, 0.05, 0x2a2a28], [-0.04, -0.64, -0.04, 0.04, -0.44, 0.04, DARK], [-0.03, -0.86, -0.05, 0.03, -0.66, 0.05, 0x2a2a28]], { k: 1.2, s: 3 });
    }
    return { g, n, a: {} };
  }

  const sm = (a, key, v, k, dt) => (a[key] = a[key] === undefined ? v : a[key] + (v - a[key]) * Math.min(1, k * dt));
  const cDim = new THREE.Color(CY2); const cMid = new THREE.Color(CY); const cHot = new THREE.Color(PALE);
  function pose(z, R, dt, sp, S, C) {
    const n = R.n; const a = R.a; const t = z.bob; const cur = S.cur; const st = S.t;
    const spd = Math.hypot(z.vel.x, z.vel.z); const wf = sm(a, 'wf', Math.min(1, spd / 3), 6, dt);
    const prev = a.ph || 0; a.ph = prev + dt * Math.min(spd, 24) * 0.7;
    const sw = Math.sin(a.ph) * (cur === 'charge' ? 0.9 : 0.5) * wf;
    let shL = -0.12 - sw * 0.7; let shR = -0.12 + sw * 0.7; let elL = -0.3; let elR = -0.3; let abdL = 0; let abdR = 0;
    let lean = 0; let headX = 0.05; let crouch = 0; let glow = 0.2; let eye = 0; let spin = 0.8; let stoneK = 1;
    if (cur === 'slam') {
      const up = st < 0.4 ? st / 0.4 : 1;
      shL = st < 0.72 ? -2.7 * up : -0.35; elL = st < 0.72 ? -0.35 : -0.15;
      shR = st < 1.22 ? -2.7 * up : -0.35; elR = st < 1.22 ? -0.35 : -0.15;
      lean = st < 1.22 ? -0.22 * up : 0.3; headX = lean < 0 ? -0.1 : 0.2; crouch = st < 1.22 ? -0.04 : 0.1; glow = st < 1.22 ? 0.4 + st * 0.5 : 0.5;
    } else if (cur === 'eyebeam') {
      const ch = Math.min(1, st / 1.0); eye = st < 1.0 ? ch : 1;
      shL = -0.3 + ch * -0.15; shR = shL; elL = -0.5; elR = -0.5; abdL = abdR = ch * 0.5; lean = -0.08 - ch * 0.12; headX = -0.15 * ch + (st > 1.0 ? 0.28 : 0); glow = 0.3 + eye * 0.7; crouch = -0.05 * ch;
    } else if (cur === 'rockrain') {
      const up = Math.min(1, st / 0.5);
      shL = -2.5 * up; shR = shL; elL = -0.5; elR = -0.5; abdL = abdR = 0.25 * up; lean = -0.2 * up; headX = -0.4 * up; glow = 0.4 + up * 0.5; spin = 2 + up * 4;
    } else if (cur === 'spikes') {
      shL = st < 0.85 ? -2.6 * Math.min(1, st / 0.45) : -0.5; shR = shL; elL = elR = -0.35; lean = st < 0.85 ? -0.2 : 0.35; headX = st < 0.85 ? -0.1 : 0.25; glow = st < 0.85 ? 0.8 : 0.5; crouch = st < 0.85 ? 0 : 0.12;
    } else if (cur === 'overcharge') {
      const ch = Math.min(1, st / 1.0); const rel = st > 1.25;
      abdL = abdR = rel ? 0.7 : 1.1 * ch; shL = shR = rel ? -0.4 : -0.15; elL = elR = -0.7; lean = rel ? 0.15 : -0.1 * ch; headX = -0.25 * ch + (rel ? 0.35 : 0);
      glow = 0.5 + ch * 0.5; spin = rel ? 3 : 2 + ch * 12; stoneK = 1 + ch * 0.5 - (rel ? 0.4 : 0); crouch = rel ? 0.1 : -0.05 * ch;
    } else if (cur === 'charge') {
      const run = st > 0.9;
      shL = run ? 0.9 + sw * -0.6 : 0.6 * Math.min(1, st / 0.6); shR = run ? 0.9 + sw * 0.6 : shL; elL = elR = run ? -1.0 : -0.3; lean = run ? 0.55 : -0.15; headX = run ? 0.35 : -0.1; glow = run ? 1 : 0.6; crouch = run ? 0.1 : 0.12 * Math.min(1, st / 0.6); spin = run ? 3 : 1.2;
    }
    if (C.rage(z)) glow = Math.max(glow, 0.45);
    const gl = sm(a, 'glow', glow, 8, dt); const ey = sm(a, 'eye', eye, 10, dt);
    const lv = sm(a, 'lean', lean, 7, dt); const cr = sm(a, 'cr', crouch, 6, dt);
    n.torso.rotation.x = lv; n.torso.position.y = 0.84 + cr * -1.2 + Math.sin(t * 1.4) * 0.012;
    n.torso.scale.y = 1 + Math.sin(t * 1.4) * 0.012;
    n.head.rotation.x = sm(a, 'hx', headX, 6, dt) - lv * 0.6; n.head.rotation.y = Math.sin(t * 0.5) * 0.05;
    const fast = cur === 'slam' ? 24 : 12;
    for (const A of n.arms) {
      const L = A.s < 0; const abd = L ? abdL : abdR;
      A.arm.rotation.x = sm(a, 'sh' + A.s, L ? shL : shR, fast, dt) + Math.sin(t * 1.4 + A.s) * 0.015;
      A.arm.rotation.z = A.s * sm(a, 'ab' + A.s, abd, 8, dt);
      A.elbow.rotation.x = sm(a, 'el' + A.s, L ? elL : elR, fast, dt);
    }
    for (const Lg of n.legs) {
      const ph = Lg.s * sw; Lg.hip.rotation.x = sm(a, 'hp' + Lg.s, ph + cr * 1.4 * -0.5 + (cur === 'charge' && st > 0.9 ? 0.2 : 0), 14, dt);
      Lg.knee.rotation.x = Math.max(0, -ph) * 1.1 + cr * 1.3; Lg.foot.rotation.x = -Lg.hip.rotation.x * 0.6 - Lg.knee.rotation.x * 0.5;
    }
    // the rune wheel turns, the stones swell and every rune line brightens with the charge
    a.spin = sm(a, 'spin', spin, 3, dt); n.wheel.rotation.z += dt * a.spin; n.wheel.rotation.y = Math.sin(t * 0.8) * 0.25;
    const sk = sm(a, 'stoneK', stoneK, 6, dt);
    for (const s of n.stones) { s.st.rotation.z = -n.wheel.rotation.z; s.st.scale.setScalar(sk); s.gl.material.opacity = 0.25 + gl * 0.6 + Math.sin(t * 9 + s.a * 3) * 0.08; s.gl.scale.setScalar(0.7 + gl * 1.2); }
    n.rune.color.copy(cDim).lerp(cMid, Math.min(1, gl * 1.6)).lerp(cHot, Math.max(0, gl - 0.6) * 1.2 + Math.sin(t * 14) * 0.04 * gl);
    n.eyeGlow.material.opacity = 0.35 + ey * 0.65; n.eyeGlow.scale.setScalar(0.6 + ey * 2.2 + Math.sin(t * 35) * 0.08 * ey); n.eyeCore.scale.set(1 + ey * 0.3, 1 + ey * 0.5, 1);
    n.aura.material.opacity = 0.08 + gl * 0.16 + Math.sin(t * 3) * 0.02;
    // the eye gathers sparks while it charges
    if (cur === 'eyebeam' && st < 1.0 && Math.random() < dt * 50) { const e = C.at(z, 'eye'); const off = C.V().set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(5); C.G.fx.puff(e.clone().add(off), { glow: true, vel: off.clone().multiplyScalar(-2.5), s0: 0.14, s1: 0.04, life: 0.4, c0: PALE, c1: CY, a0: 1 }); }
    if (cur === 'overcharge' && st < 1.25 && Math.random() < dt * 60) { const o = C.at(z, 'wheel'); const d = C.V().set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize(); C.G.fx.puff(o.clone().addScaledVector(d, 3.5), { glow: true, vel: d.multiplyScalar(-6), s0: 0.2, s1: 0.04, life: 0.5, c0: PALE, c1: CY, a0: 1 }); }
    // each footfall kicks dust and shakes the ground a little
    if (wf > 0.4 && Math.floor(a.ph / Math.PI) !== Math.floor(prev / Math.PI)) {
      const f = C.at(z, Math.floor(a.ph / Math.PI) % 2 ? 'footL' : 'footR'); f.y = z.pos.y + 0.1;
      for (let i = 0; i < 4; i++) C.G.fx.puff(f.clone(), { vel: C.V().set(Math.random() - 0.5, 0.5 + Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(3), drag: 2, s0: 0.5, s1: 1.5, life: 0.8, c0: 0x8a8a80, c1: 0x5a5a54, a0: 0.5 });
      C.shakeAt(f, cur === 'charge' ? 2 : 0.9);
    }
  }

  const turnTo = (z, yaw, dt, k) => { const d = BZ.wrapAngle(yaw - z.yaw) * Math.min(1, dt * k); z.yawV = d / Math.max(dt, 1e-3); z.yaw += d; };
  const toward = (z, P, dt, k, C) => turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, k);
  const hold = (z, dt, C) => C.walk(z, dt, z.pos.x, z.pos.z, 0, 0.85);
  const flat = (C, x, z) => C.V().set(x, 0, z);

  function idle(z, dt, P, dist, S, C) {
    const sp = C.rage(z) ? 5.2 : 3.6;
    C.walk(z, dt, P.pos.x, P.pos.z, dist > 8 ? sp : 0, 0.85);
    toward(z, P, dt, 2.2, C);
  }

  const moves = {
    slam: {
      dur: 1.9, cd: 5, say: BZ.t("boss-guardian.1"),
      when: (z, P, d) => d < 26,
      start(z, S, P, C) {
        const f = C.V().set(P.pos.x - z.pos.x, 0, P.pos.z - z.pos.z).normalize(); const r = C.V().set(f.z, 0, -f.x);
        C.G.audio.playAt('roar', z.pos, { gain: 1.0, rate: 0.5 });
        [-1, 1].forEach((s, i) => {
          const at = C.V().set(z.pos.x + f.x * 3.6 + r.x * s * 2.4, 0, z.pos.z + f.z * 3.6 + r.z * s * 2.4);
          C.warn({ at, r: 4.5, dur: 0.8 + i * 0.5, col: CY, fire: (T) => {
            C.boom(C.V().set(at.x, 0.5, at.z), 3.4, [CY, STONE, PALE], { smoke: true, smokeCol: 0x6a6a60 });
            C.shock(C.V().set(at.x, 0.05, at.z), 14, 0.75, CY, 24, { wall: true, h: 1.3 });
            C.G.fx.burst(C.V().set(at.x, 0.4, at.z), 24, [STONE, CY, PALE], { speed: 9, size: 0.18, life: 0.9 });
            C.G.audio.playAt('boom', at, { gain: 1.0, rate: 0.5 }); C.shakeAt(at, 9);
          } });
        });
      },
      tick(z, dt, P, S, C) { hold(z, dt, C); if (S.t < 0.7) toward(z, P, dt, 3, C); },
    },
    eyebeam: {
      dur: 3.0, cd: 6, say: BZ.t("boss-guardian.2"),
      when: (z, P, d) => d < 38,
      start(z, S, P, C) {
        // the eye sits high on a body this tall, so aim through a player's chest and carry on to the ground,
        // or the beam passes over anyone standing close
        const base = Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z); const dir = C.G.rng.chance(0.5) ? 1 : -1;
        const R = BZ.clamp(Math.hypot(P.pos.x - z.pos.x, P.pos.z - z.pos.z), 5, 22); const eye = C.at(z, 'eye'); const k = eye.y / Math.max(0.5, eye.y - 1.0);
        const pt = (ang) => flat(C, eye.x + (z.pos.x + Math.sin(ang) * R - eye.x) * k, eye.z + (z.pos.z + Math.cos(ang) * R - eye.z) * k);
        S.data.a = pt(base - 0.5 * dir); S.data.b = pt(base + 0.5 * dir);
        C.warn({ at: flat(C, z.pos.x, z.pos.z), to: S.data.a, w: 2.2, dur: 1.1, col: CY });
        C.warn({ at: flat(C, z.pos.x, z.pos.z), to: S.data.b, w: 2.2, dur: 1.1, col: CY });
        C.G.audio.playAt('boom', z.pos, { gain: 0.6, rate: 1.4 });
      },
      tick(z, dt, P, S, C) {
        const D = S.data; hold(z, dt, C); if (S.t < 1.0) toward(z, P, dt, 5, C); if (!D.a) return;
        if (S.t >= 1.1 && !D.beam) {
          D.beam = C.beam({ from: C.at(z, 'eye'), to: D.a, to2: D.b, w: 1.5, dur: S.dur - 1.15, col: CY, core: PALE, dmg: 8, scorch: 'sand', anchor: 'eye', z });
          C.G.audio.playAt('boom', z.pos, { gain: 1.0, rate: 0.5 });
        }
      },
    },
    rockrain: {
      dur: 2.5, cd: 8, say: BZ.t("boss-guardian.3"),
      start(z, S, P, C) {
        C.G.audio.playAt('roar', z.pos, { gain: 1.0, rate: 0.6 });
        const n = C.rage(z) ? 7 : 5;
        for (const p of C.players()) for (let i = 0; i < n; i++) {
          const ang = C.G.rng.range(0, 6.3); const r = i === 0 ? 0 : C.G.rng.range(2.5, 9); const at = C.V().set(p.pos.x + Math.cos(ang) * r, 0, p.pos.z + Math.sin(ang) * r);
          if (!C.inArena(at.x, at.z, 1)) continue;
          C.after(0.35 + i * 0.13, () => C.warn({ at, r: 2.8, dur: 1.2, col: CY, fire: (T) => {
            const from = C.V().set(T.at.x + 3, 32, T.at.z - 2);
            C.orb({ from, vel: C.V().set(T.at.x, 0, T.at.z).sub(from).normalize().multiplyScalar(52), size: 0.85, shape: 'shard', col: CY, col2: STONE, core: 0xb4b4a8, trailCol: CY, blast: 3.2, dmg: 22, hazard: { kind: 'sand', r: 1.8, dur: 3 }, trailRate: 80, sound: 'boom', rate: 0.7 });
          } }));
        }
      },
      tick(z, dt, P, S, C) { hold(z, dt, C); toward(z, P, dt, 2, C); },
    },
    spikes: {
      dur: 2.2, cd: 7, say: BZ.t("boss-guardian.4"),
      when: (z, P, d) => d < 32,
      start(z, S, P, C) {
        const dir = C.V().set(P.pos.x - z.pos.x, 0, P.pos.z - z.pos.z); const dist = dir.length(); dir.normalize();
        const a = C.V().set(z.pos.x + dir.x * 3, 0, z.pos.z + dir.z * 3); const len = Math.min(30, dist + 8);
        const b = a.clone().addScaledVector(dir, len);
        C.warn({ at: a, to: b, w: 4.2, dur: 0.9, col: CY, fire: () => {
          const hit = new Set(); const cnt = Math.floor(len / 2.2);
          for (let i = 0; i <= cnt; i++) C.after(i * 0.05, () => {
            const at = a.clone().addScaledVector(dir, (i / cnt) * len);
            C.boom(C.V().set(at.x, 0.8, at.z), 2.0, [CY, STONE, PALE], { sound: i % 3 === 0, smoke: false });
            C.G.fx.burst(C.V().set(at.x, 0.3, at.z), 10, [STONE, DARK, CY], { speed: 9, size: 0.2, life: 0.8 });
            for (let k = 0; k < 4; k++) C.G.fx.puff(C.V().set(at.x + (Math.random() - 0.5) * 2, 0.2, at.z + (Math.random() - 0.5) * 2), { vel: C.V().set(0, 9 + Math.random() * 5, 0), drag: 2.2, s0: 0.5, s1: 0.1, life: 0.7, c0: PALE, c1: STONE, a0: 0.9, glow: true });
            if (i % 3 === 0) C.hazard('sand', at, 1.8, 3.5);
            C.shakeAt(at, 3);
            for (const p of C.players()) if (!hit.has(p) && p.pos.y < 3 && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < 2.6) { hit.add(p); C.hurt(p, 24, at, null, 9); }
          });
        } });
        C.G.audio.playAt('roar', z.pos, { gain: 0.9, rate: 0.7 });
      },
      tick(z, dt, P, S, C) { hold(z, dt, C); if (S.t < 0.6) toward(z, P, dt, 5, C); },
    },
    overcharge: {
      dur: 2.6, cd: 9, say: BZ.t("boss-guardian.5"),
      when: (z, P, d) => d < 20,
      start(z, S, P, C) {
        const at = flat(C, z.pos.x, z.pos.z);
        C.G.audio.playAt('roar', z.pos, { gain: 1.1, rate: 0.45 });
        C.warn({ at, r: 7, dur: 1.25, col: CY });
        C.warn({ at, r: 14, dur: 1.25, col: CY, fire: () => {
          const c = C.at(z, 'wheel'); const o = C.V().set(z.pos.x, 0.05, z.pos.z);
          C.shock(o, 15, 0.7, CY, 24, { wall: true, h: 1.5 });
          C.shock(C.V().set(o.x, 0.05, o.z), 9, 0.5, PALE, 0);
          C.boom(C.V().set(z.pos.x, 1.0, z.pos.z), 4, [CY, PALE, STONE], { smoke: true, smokeCol: 0x6a6a60 });
          C.flash && C.flash(c, 14, CY, 0.5); C.shakeAt(o, 12);
          const n = C.rage(z) ? 18 : 14;
          [0, 1].forEach((w) => C.after(w * 0.3, () => {
            for (let i = 0; i < n; i++) {
              const ang = (i + w * 0.5) / n * Math.PI * 2; const d = C.V().set(Math.sin(ang), 0, Math.cos(ang));
              C.orb({ from: C.V().set(z.pos.x + d.x * 2.5, 1.3, z.pos.z + d.z * 2.5), vel: d.multiplyScalar(w ? 17 : 21), size: 0.45, shape: 'shard', col: CY, col2: PALE, core: PALE, trailCol: CY, dmg: 14, life: 1.8, trailRate: 70 });
            }
          }));
          C.G.audio.playAt('boom', z.pos, { gain: 1.2, rate: 0.4 });
        } });
      },
      tick(z, dt, P, S, C) { hold(z, dt, C); toward(z, P, dt, 1.5, C); },
    },
    charge: {
      dur: 2.8, cd: 8, say: BZ.t("boss-guardian.6"),
      when: (z, P, d) => d > 6 && d < 36,
      start(z, S, P, C) {
        const dir = C.V().set(P.pos.x - z.pos.x, 0, P.pos.z - z.pos.z); const dist = dir.length(); dir.normalize();
        const len = Math.min(32, dist + 10); S.data.dir = dir; S.data.len = len; S.data.hit = new Set(); S.data.run = 0; S.data.step = 0;
        C.warn({ at: flat(C, z.pos.x, z.pos.z), to: flat(C, z.pos.x + dir.x * len, z.pos.z + dir.z * len), w: 6, dur: 0.9, col: CY });
        C.G.audio.playAt('roar', z.pos, { gain: 1.2, rate: 0.5 });
      },
      tick(z, dt, P, S, C) {
        const D = S.data; if (!D.dir) { hold(z, dt, C); return; }
        if (S.t < 0.9) { hold(z, dt, C); turnTo(z, Math.atan2(D.dir.x, D.dir.z), dt, 8, C); return; }
        const speed = 20;
        if (D.run < D.len - 0.1 && D.run >= 0) {
          const step = Math.min(speed * dt, D.len - D.run); const nx = z.pos.x + D.dir.x * step; const nz = z.pos.z + D.dir.z * step;
          if (C.inArena(nx, nz, 3)) { z.pos.x = nx; z.pos.z = nz; D.run += step; z.vel.set(D.dir.x * speed, 0, D.dir.z * speed); } else D.run = D.len;
          z.yaw = Math.atan2(D.dir.x, D.dir.z);
          for (const p of C.players()) { if (D.hit.has(p)) continue; if (Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z) < 3.6 && p.pos.y < 4) { D.hit.add(p); C.hurt(p, 30, z.pos, { slow: 1.2 }, 15); C.boom(C.V().set(p.pos.x, 1.2, p.pos.z), 2.2, [CY, STONE, PALE], { sound: false, smoke: false }); } }
          D.step += dt; if (D.step > 0.14) { D.step = 0; C.boom(C.V().set(z.pos.x - D.dir.x * 1.5, 0.3, z.pos.z - D.dir.z * 1.5), 1.6, [STONE, CY, PALE], { sound: false, smoke: false }); }
          C.shakeAt(z.pos, 2.5);
        } else { z.vel.x = BZ.damp(z.vel.x, 0, 8, dt); z.vel.z = BZ.damp(z.vel.z, 0, 8, dt); }
      },
    },
  };

  BZ.bossKit('guardian', {
    type: { hp: 6400, speed: 3.6, dmg: 34, rate: 2, windup: 0.6, scale: 3.4, skin: 'gd_stone', face: 'gd_face', shirt: ['gd_dark'], pants: ['gd_legs'], score: 6500, eye: CY, name: BZ.t("boss-guardian.7") },
    colors: [CY, STONE, PALE],
    rig,
    hits: [['head', 'head', 0.3, 0], ['body', 'chest', 0.75, 0], ['body', 'torso', 0.55, 0], ['body', 'footL', 0.5, 0.2]],
    pose, idle, moves, rest: 1.0,
    combos: [['slam', 'spikes'], ['eyebeam', 'rockrain'], ['charge', 'slam'], ['rockrain', 'overcharge'], ['spikes', 'eyebeam']],
    rageCombos: [['slam', 'eyebeam', 'charge'], ['spikes', 'rockrain', 'overcharge'], ['overcharge', 'charge', 'slam']],
  });
})();
