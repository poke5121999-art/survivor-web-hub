// Bá Tước Máu: a gaunt vampire lord in a billowing black and crimson cape. He looses bat swarms, dashes through you along a
// marked strip to heal on the hit, fires blood novas, turns to mist to claw you from behind, calls blood rain and drains life with a beam.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;
  const rgb = BZ.rgb;
  const CRIM = 0xc0102a; const BLOOD = 0xff2040; const DARKRED = 0x500510; const PALE = 0xffd0d8;

  BZ.defTex('vb_skin', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(rng.chance(0.15) ? 0xb8b0b8 : 0xd4ccd2)); });
  BZ.defTex('vb_face', 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(rng.chance(0.12) ? 0xb8b0b8 : 0xd4ccd2));
    for (let x = 0; x < 8; x++) { set(x, 0, rgb(0x0e060a)); set(x, 1, rgb(0x0e060a)); }
    set(3, 2, rgb(0x0e060a)); set(4, 2, rgb(0x0e060a)); set(0, 2, rgb(0x0e060a)); set(7, 2, rgb(0x0e060a));
    for (const ex of [1, 5]) { set(ex, 2, rgb(0x3a2030)); set(ex + 1, 2, rgb(0x3a2030)); set(ex, 3, rgb(BLOOD)); set(ex + 1, 3, rgb(BLOOD)); set(ex, 4, rgb(0x8a7a88)); set(ex + 1, 4, rgb(0x8a7a88)); }
    set(3, 4, rgb(0x9a8a98)); set(4, 4, rgb(0x9a8a98));
    for (let x = 2; x < 6; x++) set(x, 6, rgb(0x5a1020));
    set(2, 6, rgb(0xffffff)); set(2, 7, rgb(0xffffff)); set(5, 6, rgb(0xffffff)); set(5, 7, rgb(0xffffff));
  });
  BZ.defTex('vb_cape', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const edge = y > 5 || x === 0; set(x, y, rgb(edge ? 0xc0102a : rng.chance(0.2) ? 0x2a1a24 : (x + y) % 4 === 0 ? 0x1c1018 : 0x140a10)); } });
  BZ.defTex('vb_pants', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(rng.chance(0.2) ? 0x2a2028 : 0x120a10)); });

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  function rig(G, b, M) {
    const sh = G.quality.shadow > 0; const mats = b.mats; const n = {};
    const g = new THREE.Group();
    const mesh = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = sh; parent.add(m); return m; };
    const grp = (parent, x = 0, y = 0, z = 0, name) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); if (name) n[name] = o; return o; };
    const crim = new THREE.MeshBasicMaterial({ color: CRIM, fog: false }); const glow = new THREE.MeshBasicMaterial({ color: BLOOD, fog: false });
    const fang = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }); const black = new THREE.MeshBasicMaterial({ color: 0x0e060a, fog: false });
    const root = grp(g, 0, 0, 0, 'root');
    // legs: long and thin, pointed boots
    n.legs = [];
    for (const s of [-1, 1]) {
      const hip = grp(root, s * 0.15, 0.98, 0);
      mesh(hip, box(0.16, 0.5, 0.18), mats.pants, 0, -0.25, 0);
      const knee = grp(hip, 0, -0.5, 0);
      mesh(knee, box(0.13, 0.48, 0.15), mats.pants, 0, -0.24, 0);
      const foot = grp(knee, 0, -0.48, 0); mesh(foot, box(0.15, 0.08, 0.34), black, 0, 0.0, 0.1);
      n.legs.push({ hip, knee, foot, s });
    }
    // coat, waistcoat, belt
    const torso = grp(root, 0, 0.98, 0, 'torso');
    mesh(torso, box(0.5, 0.18, 0.28), mats.pants, 0, 0.0, 0);
    n.chest = mesh(torso, box(0.5, 0.56, 0.3), mats.shirt, 0, 0.36, 0);
    mesh(torso, box(0.14, 0.5, 0.04), crim, 0, 0.36, 0.16);
    mesh(torso, box(0.3, 0.04, 0.31), glow, 0, 0.1, 0);
    for (let i = 0; i < 3; i++) mesh(torso, box(0.04, 0.04, 0.03), fang, 0, 0.5 - i * 0.14, 0.18);
    // tall collar flaring behind the head
    for (const s of [-1, 1]) { const c = mesh(torso, box(0.04, 0.5, 0.34), mats.shirt, s * 0.3, 0.86, -0.05); c.rotation.z = -s * 0.35; mesh(torso, box(0.03, 0.42, 0.3), crim, s * 0.27, 0.86, -0.05).rotation.z = -s * 0.35; }
    const bk = mesh(torso, box(0.64, 0.5, 0.04), mats.shirt, 0, 0.86, -0.22); bk.rotation.x = 0.25;
    mesh(torso, box(0.56, 0.3, 0.04), crim, 0, 0.8, -0.2).rotation.x = 0.25;
    // head: face on +z (index 4), slicked hair, widow's peak, pointed ears and fangs
    const head = grp(torso, 0, 0.78, 0.02, 'head');
    mesh(head, box(0.3, 0.38, 0.3), [mats.skin, mats.skin, mats.skin, mats.skin, mats.face, mats.skin], 0, 0.16, 0);
    mesh(head, box(0.32, 0.12, 0.32), black, 0, 0.36, -0.02);
    mesh(head, box(0.32, 0.4, 0.1), black, 0, 0.18, -0.19);
    mesh(head, box(0.05, 0.08, 0.04), black, 0, 0.31, 0.16);
    mesh(head, box(0.16, 0.04, 0.3), black, 0, 0.42, -0.1).rotation.x = -0.4;
    for (const s of [-1, 1]) { const e = mesh(head, box(0.04, 0.16, 0.08), mats.skin, s * 0.18, 0.2, -0.02); e.rotation.z = s * 0.35; mesh(head, box(0.03, 0.05, 0.03), fang, s * 0.06, -0.01, 0.16); }
    n.mouth = grp(head, 0, 0.0, 0.17, 'mouth');
    n.eyeGlow = new THREE.Sprite(M.glowMat(BLOOD, 0.7)); n.eyeGlow.position.set(0, 0.18, 0.18); n.eyeGlow.scale.setScalar(0.7); head.add(n.eyeGlow);
    // arms: long, bony, with five black claws
    n.arms = [];
    for (const s of [-1, 1]) {
      const sh1 = grp(torso, s * 0.34, 0.58, 0);
      mesh(sh1, box(0.15, 0.15, 0.15), mats.shirt, 0, 0, 0);
      mesh(sh1, box(0.1, 0.5, 0.1), mats.shirt, 0, -0.25, 0);
      const el = grp(sh1, 0, -0.5, 0);
      mesh(el, box(0.09, 0.5, 0.09), mats.shirt, 0, -0.25, 0); mesh(el, box(0.11, 0.06, 0.11), crim, 0, -0.04, 0);
      const hand = grp(el, 0, -0.5, 0, s > 0 ? 'handR' : 'handL');
      mesh(hand, box(0.1, 0.14, 0.06), mats.skin, 0, -0.05, 0);
      for (let f = -2; f <= 2; f++) { const c = mesh(hand, box(0.018, 0.2, 0.018), black, f * 0.022, -0.2, 0.02); c.rotation.x = -0.18; c.rotation.z = f * 0.05; }
      n.arms.push({ sh: sh1, el, hand, s });
    }
    // cape: seven panels hanging from the shoulders that flap on their own
    n.cape = [];
    for (let i = 0; i < 7; i++) {
      const u = (i - 3) / 3; const len = 1.45 - Math.abs(u) * 0.35 + (i % 2) * 0.12;
      const pv = grp(torso, u * 0.3, 0.7, -0.17);
      const m = mesh(pv, box(0.17, len, 0.035), mats.shirt, 0, -len / 2, 0);
      mesh(pv, box(0.17, 0.07, 0.04), i % 2 ? crim : glow, 0, -len + 0.03, 0);
      pv.userData = { u, i, len }; n.cape.push(pv); void m;
    }
    mesh(torso, box(0.7, 0.12, 0.24), mats.shirt, 0, 0.64, -0.07);
    n.aura = new THREE.Sprite(M.glowMat(BLOOD, 0.2)); n.aura.position.set(0, 1.3, 0); n.aura.scale.setScalar(4); root.add(n.aura);
    n.handGlow = new THREE.Sprite(M.glowMat(BLOOD, 0)); n.handGlow.scale.setScalar(0.5); n.arms[1].hand.add(n.handGlow);
    return { g, n, a: {} };
  }

  const sm = (a, key, v, k, dt) => (a[key] = a[key] === undefined ? v : a[key] + (v - a[key]) * Math.min(1, k * dt));
  const turnTo = (z, yaw, dt, k) => { const d = BZ.wrapAngle(yaw - z.yaw) * Math.min(1, dt * k); z.yawV = d / Math.max(dt, 1e-3); z.yaw += d; };
  const MIST_OUT = 0.5; const MIST_IN = 1.15;

  function pose(z, R, dt, sp, S, C) {
    const n = R.n; const a = R.a; const t = z.bob; const cur = S.cur;
    let armR = -0.1; let armL = -0.1; let spreadR = 0; let spreadL = 0; let elR = -0.25; let elL = -0.25; let lean = 0; let headBack = 0; let flare = 0; let mist = 0; let charge = 0; let stride = 0;
    if (cur === 'bats') { const k = BZ.clamp(S.t / 0.5, 0, 1); spreadR = spreadL = 1.3 * k; armR = armL = -0.3; elR = elL = -0.7 * k; flare = k; headBack = -0.2 * k; charge = 0.5 * k; }
    if (cur === 'blooddash') { const k = BZ.clamp(S.t / 0.9, 0, 1); const go = S.t > 0.9 && S.t < 1.4; lean = go ? 0.7 : 0.25 * k; armR = armL = go ? 0.9 : 0.5 * k; elR = elL = go ? -0.1 : -0.5; flare = go ? 1.4 : 0.3; charge = k; stride = go ? 1 : 0; }
    if (cur === 'bloodnova') { const k = BZ.clamp(S.t / 0.8, 0, 1); armR = armL = -2.6 * k + (S.t > 0.8 ? 1.5 : 0); spreadR = spreadL = 0.5; elR = elL = -0.15; headBack = -0.45 * k; flare = k; charge = k; }
    if (cur === 'mist') { mist = S.t < MIST_OUT ? S.t / MIST_OUT : S.t < MIST_IN ? 1 : 1 - BZ.clamp((S.t - MIST_IN) / 0.2, 0, 1); if (S.t > MIST_IN) { const k = BZ.clamp((S.t - MIST_IN) / 0.3, 0, 1); armR = -1.4 * k; armL = -1.4 * k; spreadR = 0.8; spreadL = 0.8; lean = 0.3; flare = 1; charge = 1 - k; } }
    if (cur === 'bloodrain') { const k = BZ.clamp(S.t / 0.5, 0, 1); armR = -2.9 * k; armL = -2.9 * k; spreadR = 0.4; spreadL = 0.4; elR = elL = -0.1; headBack = -0.5 * k; flare = k; charge = 0.7 * k; }
    if (cur === 'drain') { const k = BZ.clamp(S.t / 0.6, 0, 1); armR = -1.55 * k; elR = -0.05; armL = -0.4; lean = 0.2 * k; flare = 0.4; charge = k; }
    const sw = Math.sin(t * 1.4);
    const m = sm(a, 'mist', mist, 16, dt);
    n.root.visible = m < 0.97;
    n.root.scale.set(1 - m * 0.4, 1, 1 - m * 0.4);
    n.root.position.y = Math.sin(t * 1.5) * 0.02 + (cur === 'blooddash' && S.t > 0.9 && S.t < 1.4 ? 0.1 : 0);
    n.torso.rotation.x = sm(a, 'lean', lean + Math.sin(t * 1.7) * 0.03, 7, dt);
    n.torso.rotation.z = sw * 0.03;
    n.head.rotation.x = sm(a, 'head', headBack + 0.08 + Math.sin(t * 1.1) * 0.03, 6, dt);
    n.head.rotation.y = Math.sin(t * 0.6) * 0.08;
    const [L, Rr] = n.arms;
    Rr.sh.rotation.x = sm(a, 'aR', armR, 10, dt); Rr.sh.rotation.z = -0.1 - spreadR * 0.45 + (cur ? 0 : sw * 0.03); Rr.el.rotation.x = sm(a, 'eR', elR, 10, dt);
    L.sh.rotation.x = sm(a, 'aL', armL, 10, dt); L.sh.rotation.z = 0.1 + spreadL * 0.45 + (cur ? 0 : sw * 0.03); L.el.rotation.x = sm(a, 'eL', elL, 10, dt);
    Rr.hand.rotation.x = Math.sin(t * 3) * 0.08; L.hand.rotation.x = Math.sin(t * 3 + 1) * 0.08;
    const fl = sm(a, 'flare', flare, 6, dt); const spd = Math.hypot(z.vel.x, z.vel.z);
    for (const pv of n.cape) { const u = pv.userData; const f = Math.sin(t * 2.4 - u.i * 0.7 + Math.abs(u.u) * 1.5);
      pv.rotation.x = sm(a, 'c' + u.i, 0.1 + f * 0.1 + fl * (0.7 - Math.abs(u.u) * 0.2) + Math.min(0.5, spd * 0.06) + Math.sin(t * 7 + u.i) * 0.03 * (1 + fl * 2), 9, dt);
      pv.rotation.z = u.u * (0.12 + fl * 0.9) + Math.sin(t * 2 + u.i * 1.3) * 0.06; }
    const st = Math.sin(t * 5) * (stride ? 0.8 : Math.min(0.5, spd * 0.12));
    for (const lg of n.legs) { lg.hip.rotation.x = lg.s * st * 0.6 + (stride ? 0.3 : 0); lg.knee.rotation.x = Math.max(0, -lg.s * st) * 0.8; lg.foot.rotation.x = -lg.knee.rotation.x * 0.3; }
    const ch = sm(a, 'charge', charge, 8, dt);
    n.eyeGlow.material.opacity = 0.55 + 0.15 * Math.sin(t * 5) + ch * 0.35; n.eyeGlow.scale.setScalar(0.7 + ch * 0.5);
    n.aura.material.opacity = (0.15 + 0.06 * Math.sin(t * 3) + ch * 0.2 + (C.rage(z) ? 0.14 : 0)) * (1 - m);
    n.handGlow.material.opacity = ch * 0.9; n.handGlow.scale.setScalar(0.4 + ch * 1.6 + Math.sin(t * 28) * 0.1 * ch);
    // mist: dark red cloud where he dissolves and re-forms
    const base = C.V().set(z.pos.x, z.pos.y + 1.4 * z.T.scale, z.pos.z);
    if (m > 0.05 && m < 0.99 || (cur === 'mist' && S.t < MIST_IN + 0.3 && S.t > 0.1)) for (let i = 0; i < 3; i++) { const o = C.V().set(Math.random() - 0.5, (Math.random() - 0.5) * 1.5, Math.random() - 0.5).multiplyScalar(3.4); C.G.fx.puff(base.clone().add(o), { glow: Math.random() < 0.4, vel: C.V().set(-o.x * 0.5, 0.5, -o.z * 0.5), drag: 1, s0: 0.9, s1: 1.8, life: 0.9, c0: Math.random() < 0.5 ? CRIM : DARKRED, c1: 0x200008, a0: 0.55 }); }
    if (ch > 0.4 && Math.random() < dt * 24) { const h = C.at(z, 'handR'); const o = C.V().set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2); C.G.fx.puff(h.clone().add(o), { glow: true, vel: o.clone().multiplyScalar(-2), s0: 0.14, s1: 0.04, life: 0.3, c0: BLOOD, c1: CRIM, a0: 1 }); }
  }

  function idle(z, dt, P, dist, S, C) {
    const want = C.rage(z) ? 7 : 9;
    C.walk(z, dt, P.pos.x, P.pos.z, dist > want ? (C.rage(z) ? 8 : 6) : 0, 0.8);
    turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 5);
  }

  const heal = (z, x) => { if (z.hp > 0) z.hp = Math.min(z.maxHp, z.hp + x); };
  const clampArena = (C, at, from, back = 0) => { while (!C.inArena(at.x, at.z, 2) && at.distanceTo(from) > 3) at.lerp(from, 0.1 + back); return at; };

  const moves = {
    bats: {
      dur: 2.0, cd: 4, say: BZ.t("boss-vampire.1"),
      when: (z, P, d) => d < 40,
      tick(z, dt, P, S, C) {
        z.vel.x = z.vel.z = 0; turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 6);
        const waves = C.rage(z) ? 3 : 2; const per = C.rage(z) ? 9 : 8;
        while ((S.data.w || 0) < Math.min(waves, Math.floor((S.t - 0.55) / 0.4) + 1)) {
          const w = S.data.w = (S.data.w || 0) + 1; const from = C.at(z, 'torso', C.V().set(0, 0.5, -0.3));
          for (let i = 0; i < per; i++) {
            const a = (i / per) * Math.PI * 2 + w * 0.6; const v = C.V().set(Math.cos(a) * 7, 2 + (i % 3) * 2.5, Math.sin(a) * 7).add(C.aimAt(P, 0.2).sub(from).normalize().multiplyScalar(7));
            C.orb({ from: from.clone(), vel: v, shape: 'bat', size: 0.3, col: BLOOD, col2: DARKRED, core: 0x1a0a14, homing: 1.7, homeAfter: 0.3, dmg: 14, blast: 1.6, life: 4.5, trailRate: 40, trailCol: CRIM, sound: 'boom', rate: 1.5 });
          }
          C.flash(from, 5, CRIM, 0.35); C.G.audio.playAt('screech', from, { gain: 0.5, rate: 1.4 });
        }
      },
    },
    blooddash: {
      dur: 2.2, cd: 6, say: BZ.t("boss-vampire.2"),
      when: (z, P, d) => d > 6 && d < 38,
      start(z, S, P, C) {
        const a = C.V().set(z.pos.x, 0, z.pos.z); const dir = C.V().set(P.pos.x - a.x, 0, P.pos.z - a.z); const d0 = dir.length(); dir.normalize();
        const b = clampArena(C, a.clone().addScaledVector(dir, d0 + 7), a);
        S.data.a = a; S.data.b = b; S.data.dir = dir; S.data.hit = new Set(); S.data.trail = 0;
        C.warn({ at: a, to: b, w: 3.6, dur: 0.9, col: BLOOD });
        C.G.audio.playAt('roar', z.pos, { gain: 1, rate: 0.8 });
      },
      tick(z, dt, P, S, C) {
        const D = S.data; if (!D.a) return;
        if (S.t < 0.9) { z.vel.x = z.vel.z = 0; turnTo(z, Math.atan2(D.dir.x, D.dir.z), dt, 10); return; }
        if (S.t < 1.4) {
          const k = (S.t - 0.9) / 0.5; const x = BZ.lerp(D.a.x, D.b.x, k); const zz = BZ.lerp(D.a.z, D.b.z, k);
          z.vel.set((D.b.x - D.a.x) / 0.5, 0, (D.b.z - D.a.z) / 0.5); z.pos.set(x, 0, zz); z.yaw = Math.atan2(D.dir.x, D.dir.z);
          for (const p of C.players()) { if (D.hit.has(p)) continue; if (Math.hypot(p.pos.x - x, p.pos.z - zz) < 2.4 && p.pos.y < 3.5) { D.hit.add(p); C.hurt(p, 30, z.pos, null, 12); heal(z, 140); C.boom(C.V().set(p.pos.x, 1.2, p.pos.z), 2.6, [BLOOD, CRIM, PALE], { air: true, smoke: false, sound: 'boom', rate: 1.2 }); } }
          D.trail += dt; if (D.trail > 0.05) { D.trail = 0; C.G.fx.puff(C.V().set(x, 1.2 + Math.random() * 2.5, zz), { glow: true, vel: C.V().set(0, 0.5, 0), drag: 2, s0: 1.4, s1: 0.2, life: 0.5, c0: BLOOD, c1: DARKRED, a0: 0.9 }); }
          C.shakeAt(z.pos, 1.2);
          return;
        }
        z.vel.x = z.vel.z = 0;
        if (!D.end) { D.end = true; C.shock(C.V().set(z.pos.x, 0.05, z.pos.z), 4.5, 0.4, BLOOD, 0); }
      },
    },
    bloodnova: {
      dur: 2.2, cd: 6, say: BZ.t("boss-vampire.3"),
      when: (z, P, d) => d < 36,
      start(z, S, P, C) {
        C.shock(C.V().set(z.pos.x, 0.05, z.pos.z), 5, 0.8, BLOOD, 0);
        C.G.audio.playAt('roar', z.pos, { gain: 0.9, rate: 0.6 });
      },
      tick(z, dt, P, S, C) {
        z.vel.x = z.vel.z = 0; turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 4);
        const n = 20; const from = C.V().set(z.pos.x, 1.4, z.pos.z);
        if (S.t > 0.85 && !S.data.r1) {
          S.data.r1 = true;
          for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; C.orb({ from: from.clone(), vel: C.V().set(Math.sin(a) * 18, 0, Math.cos(a) * 18), size: 0.45, col: BLOOD, col2: DARKRED, core: PALE, dmg: 17, blast: 1.5, life: 2.2, trailRate: 45, sound: 'boom', rate: 1.2 }); }
          C.boom(C.V().set(z.pos.x, 1.6, z.pos.z), 3.6, [BLOOD, CRIM, PALE], { air: true, smoke: false, rate: 0.8 }); C.shock(C.V().set(z.pos.x, 0.05, z.pos.z), 4, 0.35, PALE, 0);
        }
        if (S.t > 1.25 && !S.data.r2) {
          S.data.r2 = true;
          for (let i = 0; i < n; i++) { const a = ((i + 0.5) / n) * Math.PI * 2; C.orb({ from: from.clone(), vel: C.V().set(Math.sin(a) * 11, 0, Math.cos(a) * 11), shape: 'shard', size: 0.5, col: CRIM, col2: BLOOD, core: PALE, dmg: 20, blast: 1.6, life: 3, trailRate: 45, sound: 'boom', rate: 1 }); }
          C.boom(C.V().set(z.pos.x, 1.6, z.pos.z), 3, [CRIM, BLOOD, PALE], { air: true, smoke: false, rate: 0.7 }); C.shock(C.V().set(z.pos.x, 0.05, z.pos.z), 3, 0.3, BLOOD, 0);
        }
      },
    },
    mist: {
      dur: 2.1, cd: 7, say: BZ.t("boss-vampire.4"),
      when: (z, P, d) => d > 4,
      start(z, S, P, C) {
        const out = C.V().set(P.pos.x - z.pos.x, 0, P.pos.z - z.pos.z); if (out.lengthSq() < 0.01) out.set(0, 0, 1); out.normalize();
        let at = C.V().set(P.pos.x + out.x * 4.2, 0, P.pos.z + out.z * 4.2); if (!C.inArena(at.x, at.z, 3)) at = C.V().set(P.pos.x - out.x * 4.2, 0, P.pos.z - out.z * 4.2);
        if (!C.inArena(at.x, at.z, 3)) at.set(P.pos.x * 0.5, 0, P.pos.z * 0.5);
        S.data.exit = at;
        C.G.audio.playAt('screech', z.pos, { gain: 0.7, rate: 0.7 });
        C.warn({ at, r: 3.2, dur: MIST_IN - 0.1, col: BLOOD, fire: () => {
          z.pos.set(at.x, 0, at.z); z.vel.set(0, 0, 0); z.yaw = Math.atan2(P.pos.x - at.x, P.pos.z - at.z);
          C.shock(C.V().set(at.x, 0.05, at.z), 8, 0.45, BLOOD, 24, { wall: true });
          C.boom(C.V().set(at.x, 1.4, at.z), 3.4, [BLOOD, CRIM, PALE], { air: true, smoke: false, sound: 'boom', rate: 1 }); C.shakeAt(at, 5);
          for (const p of C.players()) if (Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < 3.4 && p.pos.y < 3) C.hurt(p, 22, at, null, 9);
        } });
      },
      tick(z, dt, P, S, C) { z.vel.x = z.vel.z = 0; if (S.t > MIST_IN) turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 10); },
    },
    bloodrain: {
      dur: 2.7, cd: 9, say: BZ.t("boss-vampire.5"),
      when: (z, P, d) => d < 44,
      start(z, S, P, C) {
        C.G.audio.playAt('roar', z.pos, { gain: 1, rate: 0.55 });
        const n = C.rage(z) ? 9 : 7;
        for (const p of C.players()) for (let i = 0; i < n; i++) {
          const a = C.G.rng.range(0, 6.3); const r = i === 0 ? 0 : C.G.rng.range(2.5, 8); const at = C.V().set(p.pos.x + Math.cos(a) * r, 0, p.pos.z + Math.sin(a) * r);
          if (!C.inArena(at.x, at.z, 1)) continue;
          C.after(0.3 + i * 0.12, () => C.warn({ at, r: 2.4, dur: 1.0, col: BLOOD, fire: (T) => {
            const from = C.V().set(T.at.x + 2, 28, T.at.z - 2);
            C.orb({ from, vel: C.V().set(T.at.x, 0.5, T.at.z).sub(from).normalize().multiplyScalar(55), size: 0.7, col: BLOOD, col2: DARKRED, core: PALE, blast: 3, dmg: 20, trailRate: 70, trailCol: CRIM, sound: 'boom', rate: 1.1 });
          } }));
        }
      },
      tick(z, dt, P, S, C) { z.vel.x = z.vel.z = 0; turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 4); },
    },
    drain: {
      dur: 2.8, cd: 8, say: BZ.t("boss-vampire.6"),
      when: (z, P, d) => d < 22,
      start(z, S, P, C) {
        const T = C.nearest(z.pos) || P; S.data.target = T;
        const from = C.at(z, 'handR'); const to = C.aimAt(T, 0);
        const aim = C.V().set(to.x, 1.0, to.z);
        const dir = aim.clone().sub(from).setY(0).normalize();
        const side = C.V().set(-dir.z, 0, dir.x).multiplyScalar(2.2);
        S.data.p1 = aim.clone().add(side); S.data.p2 = aim.clone().sub(side); S.data.p0 = aim;
        C.warn({ at: C.V().set(z.pos.x, 0, z.pos.z), to: C.V().set(aim.x, 0, aim.z), w: 1.8, dur: 0.8, col: BLOOD });
        C.G.audio.playAt('screech', z.pos, { gain: 0.7, rate: 0.6 });
      },
      tick(z, dt, P, S, C) {
        const D = S.data; z.vel.x = z.vel.z = 0; if (!D.p0) return;
        turnTo(z, Math.atan2(D.p0.x - z.pos.x, D.p0.z - z.pos.z), dt, 6);
        if (S.t < 0.85) return;
        if (!D.beam) {
          D.beam = C.beam({ from: C.at(z, 'handR'), anchor: 'handR', z, to: D.p1, to2: D.p2, w: 0.55, dur: S.dur - 1.0, col: BLOOD, core: PALE, dmg: 7 });
          D.acc = 0;
        }
        D.acc += dt;
        if (D.acc >= 0.2) {
          D.acc = 0; const B = D.beam; const A = B.from; const E = B.cur;
          for (const p of C.players()) {
            const pc = C.V().set(p.pos.x, p.pos.y + 1, p.pos.z); const ab = E.clone().sub(A); const k = BZ.clamp(pc.clone().sub(A).dot(ab) / (ab.lengthSq() || 1), 0, 1);
            if (A.clone().addScaledVector(ab, k).distanceTo(pc) < B.w + 0.55) { heal(z, 45); const h = C.at(z, 'handR'); for (let i = 0; i < 4; i++) C.G.fx.puff(pc.clone().add(C.V().set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)), { glow: true, vel: h.clone().sub(pc).multiplyScalar(1.6), s0: 0.3, s1: 0.06, life: 0.6, c0: BLOOD, c1: PALE, a0: 1 }); }
          }
        }
      },
    },
  };

  BZ.bossKit('vampire', {
    type: { hp: 4800, speed: 6, dmg: 28, rate: 2, windup: 0.5, scale: 2.9, skin: 'vb_skin', face: 'vb_face', shirt: ['vb_cape'], pants: ['vb_pants'], score: 6000, eye: BLOOD, name: BZ.t("boss-vampire.7") },
    colors: [BLOOD, CRIM, PALE],
    rig,
    hits: [['head', 'head', 0.22, 0.16], ['body', 'chest', 0.4, 0], ['body', 'torso', 0.35, -0.2], ['body', 'root', 0.45, 0.6]],
    pose, idle, moves, rest: 1.0,
    combos: [['bats', 'blooddash'], ['bloodnova', 'mist'], ['bloodrain', 'bats'], ['drain', 'blooddash'], ['mist', 'bloodnova']],
    rageCombos: [['bats', 'mist', 'blooddash'], ['bloodrain', 'drain', 'bloodnova'], ['blooddash', 'bats', 'bloodrain']],
  });
})();
