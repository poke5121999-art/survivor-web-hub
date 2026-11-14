// Pharaoh Xác Ướp: a tall bandaged mummy king hovering above the sand. He looses homing scarabs, marches a line of sand
// pillars at you, sweeps a golden curse beam, raises mummies under your feet, sinks to rise behind you and flings rings of orbs.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;
  const rgb = BZ.rgb;
  const GOLD = 0xffc23a; const LAPIS = 0x1c5a7a; const GLOW = 0xffe080; const SAND = 0xd8b070; const SAND2 = 0x8a6a30;

  BZ.defTex('pf_wrap', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const gap = (y % 3 === 2) || ((x + y * 2) % 7 === 0); set(x, y, rgb(gap ? 0x8a7a58 : rng.chance(0.2) ? 0xe0d2a8 : 0xcdbd90)); } });
  BZ.defTex('pf_face', 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(y % 3 === 0 && x !== 0 ? 0x8a7a58 : rng.chance(0.2) ? 0xe0d2a8 : 0xcdbd90));
    for (let x = 0; x < 8; x++) { set(x, 2, rgb(0x2a1c10)); set(x, 4, rgb(0x2a1c10)); }
    for (const ex of [1, 5]) { set(ex, 3, rgb(GLOW)); set(ex + 1, 3, rgb(GLOW)); }
    set(3, 5, rgb(0x5a4a30)); set(4, 5, rgb(0x5a4a30)); for (let x = 2; x < 6; x++) set(x, 6, rgb(0x2a1c10));
  });
  BZ.defTex('pf_collar', 8, 8, ({ set }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(y > 5 ? (x % 2 ? 0x1c5a7a : 0xffc23a) : (x + y) % 3 === 0 ? 0x2a7ea0 : y % 2 ? 0xffc23a : 0xd9a020)); });
  BZ.defTex('pf_skirt', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const gap = x % 3 === 2 || y === 7; set(x, y, rgb(gap ? 0x6a5a3c : rng.chance(0.25) ? 0xd8c898 : 0xb8a574)); } });

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  function rig(G, b, M) {
    const sh = G.quality.shadow > 0; const mats = b.mats; const n = {};
    const g = new THREE.Group();
    const mesh = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = sh; parent.add(m); return m; };
    const grp = (parent, x = 0, y = 0, z = 0, name) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); if (name) n[name] = o; return o; };
    const gold = new THREE.MeshBasicMaterial({ color: GOLD, fog: false }); const lapis = new THREE.MeshBasicMaterial({ color: LAPIS, fog: false });
    const glow = new THREE.MeshBasicMaterial({ color: GLOW, fog: false }); const dark = new THREE.MeshBasicMaterial({ color: 0x2a1c10, fog: false });
    const root = grp(g, 0, 0, 0, 'root');
    const hover = grp(root, 0, 0.32, 0, 'hover');
    // ragged skirt: strips of different length that sway on their own
    n.strips = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2; const len = 0.7 + ((i * 7) % 4) * 0.12;
      const pv = grp(hover, Math.sin(a) * 0.3, 1.02, Math.cos(a) * 0.24);
      const s = mesh(pv, box(0.2, len, 0.05), mats.pants, 0, -len / 2, 0); s.rotation.y = a;
      pv.rotation.y = 0; pv.userData = { a, len }; n.strips.push(pv);
    }
    mesh(hover, box(0.62, 0.2, 0.48), mats.pants, 0, 1.0, 0);
    mesh(hover, box(0.66, 0.06, 0.52), gold, 0, 1.1, 0);
    // torso, belt of lapis, collar
    const torso = grp(hover, 0, 1.12, 0, 'torso');
    n.chest = mesh(torso, box(0.58, 0.5, 0.36), mats.skin, 0, 0.27, 0);
    for (let i = 0; i < 3; i++) mesh(torso, box(0.6, 0.04, 0.38), dark, 0, 0.12 + i * 0.14, 0);
    mesh(torso, box(0.64, 0.07, 0.4), lapis, 0, 0.03, 0);
    mesh(torso, box(0.84, 0.16, 0.5), mats.shirt, 0, 0.55, 0);
    mesh(torso, box(0.7, 0.14, 0.44), mats.shirt, 0, 0.42, 0.04);
    mesh(torso, box(0.12, 0.2, 0.06), gold, 0, 0.37, 0.28);
    // head: face on +z (material index 4), headdress with stripes and lappets
    const head = grp(torso, 0, 0.7, 0, 'head');
    mesh(head, box(0.36, 0.38, 0.36), [mats.skin, mats.skin, mats.skin, mats.skin, mats.face, mats.skin], 0, 0.15, 0);
    const hd = grp(head, 0, 0.18, -0.03);
    for (let i = 0; i < 6; i++) mesh(hd, box(0.5, 0.075, 0.5 - i * 0.02), i % 2 ? lapis : gold, 0, 0.22 + i * 0.075, -0.02 - i * 0.015).scale.setScalar(1 - i * 0.04);
    mesh(hd, box(0.48, 0.1, 0.46), gold, 0, 0.12, 0);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) mesh(head, box(0.12, 0.17, 0.2), i % 2 ? lapis : gold, s * 0.28, 0.2 - i * 0.18, 0.02 - i * 0.015);
      mesh(head, box(0.04, 0.03, 0.03), glow, s * 0.09, 0.15, 0.185).visible = false;
    }
    mesh(head, box(0.1, 0.3, 0.16), mats.skin, 0, -0.04, -0.2);
    mesh(head, box(0.22, 0.34, 0.12), lapis, 0, 0.0, -0.28);
    const cobra = mesh(hd, box(0.08, 0.16, 0.08), gold, 0, 0.18, 0.28); cobra.rotation.x = -0.25;
    mesh(hd, box(0.05, 0.05, 0.05), glow, 0, 0.27, 0.31);
    mesh(head, box(0.1, 0.16, 0.1), gold, 0, -0.14, 0.2);
    n.eyeGlow = new THREE.Sprite(M.glowMat(GLOW, 0.6)); n.eyeGlow.position.set(0, 0.17, 0.2); n.eyeGlow.scale.setScalar(0.7); head.add(n.eyeGlow);
    // arms: one holds the staff, the other opens for the sand
    n.arms = [];
    for (const s of [-1, 1]) {
      const sh1 = grp(torso, s * 0.46, 0.5, 0);
      mesh(sh1, box(0.17, 0.17, 0.17), gold, 0, 0.02, 0);
      mesh(sh1, box(0.14, 0.4, 0.14), mats.skin, 0, -0.2, 0);
      const el = grp(sh1, 0, -0.4, 0);
      mesh(el, box(0.12, 0.38, 0.12), mats.skin, 0, -0.19, 0);
      mesh(el, box(0.14, 0.07, 0.14), gold, 0, -0.06, 0);
      const hand = grp(el, 0, -0.4, 0, s > 0 ? 'hand' : 'hand2');
      mesh(hand, box(0.13, 0.16, 0.1), mats.skin, 0, -0.04, 0);
      for (const f of [-1, 0, 1]) mesh(hand, box(0.025, 0.1, 0.025), gold, f * 0.04, -0.15, 0.03);
      n.arms.push({ sh: sh1, el, hand, s });
    }
    // staff in the right hand: long shaft, lapis rings, a cradle holding the scarab gem
    const staff = grp(n.arms[1].hand, 0, -0.04, 0.02, 'staff');
    mesh(staff, box(0.06, 2.1, 0.06), gold, 0, 0.55, 0);
    for (const y of [-0.3, 0.3, 0.9, 1.3]) mesh(staff, box(0.1, 0.07, 0.1), lapis, 0, y, 0);
    mesh(staff, box(0.2, 0.05, 0.2), gold, 0, 1.55, 0);
    for (const s of [-1, 1]) { const c = mesh(staff, box(0.04, 0.3, 0.04), gold, s * 0.11, 1.7, 0); c.rotation.z = -s * 0.25; const c2 = mesh(staff, box(0.04, 0.3, 0.04), gold, 0, 1.7, s * 0.11); c2.rotation.x = s * 0.25; }
    const gem = grp(staff, 0, 1.72, 0, 'gem');
    n.gemMesh = mesh(gem, new THREE.OctahedronGeometry(0.15, 0), glow, 0, 0, 0);
    n.gemGlow = new THREE.Sprite(M.glowMat(GLOW, 0.6)); n.gemGlow.scale.setScalar(0.9); gem.add(n.gemGlow);
    n.gemHalo = new THREE.Sprite(M.glowMat(GOLD, 0.3)); n.gemHalo.scale.setScalar(2); gem.add(n.gemHalo);
    // back-fan of floating sand shards behind him
    n.shards = [];
    for (let i = 0; i < 6; i++) { const sg = grp(hover, 0, 1.8, -0.5); mesh(sg, box(0.07, 0.07, 0.2), i % 2 ? gold : mats.pants, 0, 0, 0); sg.userData.i = i; n.shards.push(sg); }
    n.aura = new THREE.Sprite(M.glowMat(GOLD, 0.2)); n.aura.position.set(0, 1.5, 0); n.aura.scale.setScalar(4); hover.add(n.aura);
    return { g, n, a: {} };
  }

  const sm = (a, key, v, k, dt) => (a[key] = a[key] === undefined ? v : a[key] + (v - a[key]) * Math.min(1, k * dt));
  const turnTo = (z, yaw, dt, k) => { const d = BZ.wrapAngle(yaw - z.yaw) * Math.min(1, dt * k); z.yawV = d / Math.max(dt, 1e-3); z.yaw += d; };
  const SINK = 0.7; const RISE = 1.7;

  function pose(z, R, dt, sp, S, C) {
    const n = R.n; const a = R.a; const t = z.bob; const cur = S.cur;
    let armR = -0.15; let armL = -0.15; let elR = -0.4; let elL = -0.4; let lean = 0; let headUp = 0; let sink = 0; let charge = 0; let spread = 0; let gemUp = 0;
    if (cur === 'scarabs') { const k = BZ.clamp(S.t / 0.5, 0, 1); armR = -2.5 * k - 0.15; elR = -0.2; armL = -0.5; headUp = -0.25; charge = 0.4 + 0.6 * k; lean = -0.1; gemUp = 1; }
    if (cur === 'pillars') { const k = BZ.clamp(S.t / 0.3, 0, 1); const sl = S.t > 0.3 && S.t < 0.8 ? 1 : 0; armR = -0.6 - 1.4 * k + sl * 1.3; armL = -0.6 - 1.4 * k + sl * 1.3; elR = elL = -0.3; lean = 0.15 * sl - 0.1 * k; charge = 0.3; }
    if (cur === 'curse') { const k = BZ.clamp(S.t / 0.9, 0, 1); armR = -2.6 * k - 0.1; elR = -0.15; armL = -1.4 * k; lean = -0.2 * k; headUp = -0.3 * k; charge = k; gemUp = 1; spread = S.t > 0.9 ? 1 : 0; }
    if (cur === 'mummies') { const k = BZ.clamp(S.t / 0.4, 0, 1); armR = -1.9 * k; armL = -1.9 * k; elR = elL = -0.2; headUp = -0.3 * k; charge = 0.4 * k + 0.2; spread = 1; }
    if (cur === 'sandsink') { sink = S.t < SINK ? S.t / SINK : S.t < RISE ? 1 : 1 - BZ.clamp((S.t - RISE) / 0.35, 0, 1); armR = armL = -0.8; if (S.t > RISE) { const k = BZ.clamp((S.t - RISE) / 0.35, 0, 1); armR = armL = -2 * k; charge = 0.8; } }
    if (cur === 'orbring') { const k = BZ.clamp(S.t / 0.7, 0, 1); armR = armL = -2.5 * k + (S.t > 0.7 ? 1.2 : 0); elR = elL = -0.1; headUp = -0.3 * k; lean = -0.15 * k; charge = k; spread = 1; gemUp = 1; }
    const sw = Math.sin(t * 1.3);
    // body
    const sk = sm(a, 'sink', sink, 14, dt);
    n.root.position.y = -sk * 2.6 + Math.sin(t * 1.8) * 0.06;
    n.root.rotation.z = sm(a, 'roll', BZ.clamp(-(z.yawV || 0) * 0.04, -0.15, 0.15) + sw * 0.03, 4, dt);
    n.torso.rotation.x = sm(a, 'lean', lean + Math.sin(t * 1.6) * 0.02, 6, dt);
    n.head.rotation.x = sm(a, 'head', headUp + 0.05 * Math.sin(t * 1.1), 6, dt);
    n.head.rotation.y = Math.sin(t * 0.7) * 0.08;
    const [r0, l0] = [n.arms[1], n.arms[0]];
    r0.sh.rotation.x = sm(a, 'aR', armR, 9, dt); r0.sh.rotation.z = -0.12 - spread * 0.35;
    r0.el.rotation.x = sm(a, 'eR', elR, 9, dt);
    l0.sh.rotation.x = sm(a, 'aL', armL, 9, dt); l0.sh.rotation.z = 0.12 + spread * 0.35 + sw * 0.03;
    l0.el.rotation.x = sm(a, 'eL', elL, 9, dt);
    n.staff.rotation.x = sm(a, 'stX', gemUp ? 0.2 : 0.1, 6, dt);
    for (const pv of n.strips) { const u = pv.userData; pv.rotation.x = Math.sin(t * 2.3 + u.a * 2) * 0.12 + Math.cos(u.a) * 0.18; pv.rotation.z = Math.sin(t * 2 + u.a * 3) * 0.1 + Math.sin(u.a) * 0.18; }
    for (const sg of n.shards) { const i = sg.userData.i; const ang = t * 0.9 + i * 1.047; sg.position.set(Math.sin(ang) * 0.7, 1.7 + Math.sin(t * 1.5 + i) * 0.15, Math.cos(ang) * 0.7 - 0.2); sg.rotation.set(t * 2 + i, t * 1.5, 0); }
    // glow: gem and eyes brighten with the charge
    const ch = sm(a, 'charge', charge, 8, dt);
    n.gemGlow.material.opacity = 0.5 + ch * 0.5 + 0.1 * Math.sin(t * 9); n.gemGlow.scale.setScalar(0.9 + ch * 2.2 + Math.sin(t * 25) * 0.12 * ch);
    n.gemHalo.material.opacity = 0.25 + ch * 0.4; n.gemHalo.scale.setScalar(2 + ch * 3.5);
    n.gemMesh.rotation.y = t * 3; n.gemMesh.scale.setScalar(1 + ch * 0.8);
    n.eyeGlow.material.opacity = 0.5 + 0.15 * Math.sin(t * 4) + ch * 0.3;
    n.aura.material.opacity = (0.15 + 0.06 * Math.sin(t * 3) + (C.rage(z) ? 0.14 : 0)) * (1 - sk);
    // sand leaks from the hem, a column of it while sinking or rising
    const feet = C.V().set(z.pos.x, 0.1, z.pos.z);
    if (Math.random() < dt * 14) C.G.fx.puff(feet.clone().add(C.V().set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(2.2)), { vel: C.V().set(0, 0.6, 0), drag: 1, s0: 0.2, s1: 0.7, life: 0.9, c0: SAND, c1: SAND2, a0: 0.5 });
    if (cur === 'sandsink' && (S.t < SINK || (S.t > RISE && S.t < RISE + 0.4))) for (let i = 0; i < 2; i++) { const o = C.V().set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(4); C.G.fx.puff(feet.clone().add(o), { glow: true, vel: C.V().set(o.x * 0.3, 4 + Math.random() * 3, o.z * 0.3), drag: 1.2, s0: 0.5, s1: 0.1, life: 0.7, c0: GLOW, c1: SAND, a0: 0.9 }); }
    if (ch > 0.5 && Math.random() < dt * 30) { const gp = C.at(z, 'gem'); const off = C.V().set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2.5); C.G.fx.puff(gp.clone().add(off), { glow: true, vel: off.clone().multiplyScalar(-2.5), s0: 0.14, s1: 0.04, life: 0.3, c0: GLOW, c1: GOLD, a0: 1 }); }
  }

  function idle(z, dt, P, dist, S, C) {
    const want = C.rage(z) ? 8 : 10;
    C.walk(z, dt, P.pos.x, P.pos.z, dist > want ? (C.rage(z) ? 6.5 : 5) : 0, 0.8);
    turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 4);
  }

  const gemAt = (z, C) => C.at(z, 'gem');
  const flat = (v) => v.set(v.x, 0, v.z);
  // a sand burst that really hurts whoever stands in it
  function sandBurst(C, at, r, dmg) {
    C.boom(C.V().set(at.x, 0.8, at.z), r * 1.1, [GLOW, GOLD, SAND], { smoke: true, smokeCol: SAND2, sound: 'boom', rate: 0.8 });
    for (let i = 0; i < 14; i++) { const o = C.V().set(C.G.rng.range(-1, 1), 0, C.G.rng.range(-1, 1)).multiplyScalar(r * 0.5); C.G.fx.puff(C.V().set(at.x + o.x, 0.3, at.z + o.z), { vel: C.V().set(o.x, 7 + C.G.rng.range(0, 6), o.z), drag: 1.4, s0: 0.5, s1: 1.2, life: 1, c0: SAND, c1: SAND2, a0: 0.8 }); }
    for (const p of C.players()) if (Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < r && p.pos.y < 3.2) C.hurt(p, dmg, at, null, 10);
  }

  const moves = {
    scarabs: {
      dur: 2.0, cd: 4, say: BZ.t("boss-pharaoh.1"),
      when: (z, P, d) => d < 40,
      tick(z, dt, P, S, C) {
        z.vel.x = z.vel.z = 0; turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 6);
        const waves = C.rage(z) ? 3 : 2; const per = C.rage(z) ? 6 : 5;
        const due = Math.floor((S.t - 0.6) / 0.4) + 1;
        while ((S.data.w || 0) < Math.min(waves, due)) {
          const w = S.data.w = (S.data.w || 0) + 1; const from = gemAt(z, C);
          for (let i = 0; i < per; i++) {
            const a = (i / per) * Math.PI * 2 + w; const v = C.V().set(Math.cos(a) * 6, 6 + (i % 2) * 3, Math.sin(a) * 6);
            const aim = C.aimAt(P, 0.2).sub(from).normalize().multiplyScalar(5); v.add(aim);
            C.orb({ from: from.clone(), vel: v, shape: 'scarab', size: 0.4, col: GOLD, col2: LAPIS, core: GLOW, homing: 2.6, homeAfter: 0.35, dmg: 15, blast: 1.8, life: 4.5, trailRate: 55, trailCol: GLOW, sound: 'boom', rate: 1.4 });
          }
          C.flash(from, 6, GLOW, 0.35); C.G.audio.playAt('screech', from, { gain: 0.5, rate: 1.2 });
        }
      },
    },
    pillars: {
      dur: 2.8, cd: 6, say: BZ.t("boss-pharaoh.2"),
      when: (z, P, d) => d < 38,
      start(z, S, P, C) {
        const dir = C.V().set(P.pos.x - z.pos.x, 0, P.pos.z - z.pos.z); const d0 = dir.length(); dir.normalize();
        const n = C.rage(z) ? 9 : 7; const step = Math.max(3.2, (d0 + 6) / n);
        C.G.audio.playAt('roar', z.pos, { gain: 0.8, rate: 0.7 });
        for (let i = 0; i < n; i++) {
          const dist = 3 + i * step; const perp = C.V().set(-dir.z, 0, dir.x).multiplyScalar(Math.sin(i * 1.7) * 0.9);
          const at = C.V().set(z.pos.x + dir.x * dist + perp.x, 0, z.pos.z + dir.z * dist + perp.z);
          if (!C.inArena(at.x, at.z, 0.5)) continue;
          C.after(0.3 + i * 0.2, () => C.warn({ at, r: 2.2, dur: 0.85, col: GOLD, fire: (T) => { sandBurst(C, T.at, 2.4, 22); C.hazard('sand', C.V().set(T.at.x, 0, T.at.z), 2, 3); } }));
        }
      },
      tick(z, dt, P, S, C) { z.vel.x = z.vel.z = 0; if (S.t < 0.8) turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 6); },
    },
    curse: {
      dur: 3.3, cd: 8, say: BZ.t("boss-pharaoh.3"),
      when: (z, P, d) => d < 30,
      start(z, S, P, C) {
        const a0 = Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z); S.data.base = a0; S.data.dir = C.G.rng.chance(0.5) ? 1 : -1;
        const R = 14; const pt = (a) => C.V().set(z.pos.x + Math.sin(a) * R, 0, z.pos.z + Math.cos(a) * R);
        C.warn({ at: C.V().set(z.pos.x, 0, z.pos.z), to: pt(a0 - 0.8 * S.data.dir), w: 2.2, dur: 0.95, col: GOLD });
        C.warn({ at: C.V().set(z.pos.x, 0, z.pos.z), to: pt(a0 + 0.8 * S.data.dir), w: 2.2, dur: 0.95, col: GOLD });
        C.G.audio.playAt('roar', z.pos, { gain: 1, rate: 0.6 });
      },
      tick(z, dt, P, S, C) {
        const D = S.data; z.vel.x = z.vel.z = 0; if (D.base === undefined) return;
        if (S.t < 1.0) { turnTo(z, D.base, dt, 8); return; }
        if (!D.beam) {
          const R = 11; const pt = (a) => C.V().set(z.pos.x + Math.sin(a) * R, 0.2, z.pos.z + Math.cos(a) * R);
          D.beam = C.beam({ from: gemAt(z, C), follow: () => gemAt(z, C), to: pt(D.base - 0.8 * D.dir), to2: pt(D.base + 0.8 * D.dir), w: 1.0, dur: S.dur - 1.15, col: GOLD, core: 0xffffff, dmg: 9, scorch: 'sand' });
          C.G.audio.playAt('boom', z.pos, { gain: 0.9, rate: 0.5 });
        }
        C.shakeAt(z.pos, 0.6);
      },
    },
    mummies: {
      dur: 2.4, cd: 9, say: BZ.t("boss-pharaoh.4"),
      when: (z, P, d) => d < 40,
      start(z, S, P, C) {
        const ps = C.players(); const n = C.rage(z) ? 4 : 3;
        C.G.audio.playAt('roar', z.pos, { gain: 1, rate: 0.55 });
        for (let i = 0; i < n; i++) {
          const T = ps.length ? ps[i % ps.length] : P; const a = (i / n) * 6.28 + C.G.rng.range(0, 1); const r = i === 0 ? 0.5 : 3.4;
          const at = C.V().set(T.pos.x + Math.cos(a) * r, 0, T.pos.z + Math.sin(a) * r);
          if (!C.inArena(at.x, at.z, 1.5)) at.set(T.pos.x, 0, T.pos.z);
          C.after(0.25 + i * 0.25, () => C.warn({ at, r: 2, dur: 1.0, col: SAND, fire: (W) => { sandBurst(C, W.at, 2.2, 18); C.summon('walker', C.V().set(W.at.x, 0, W.at.z), 0.5); } }));
        }
      },
      tick(z, dt, P, S, C) { z.vel.x = z.vel.z = 0; turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 5); },
    },
    sandsink: {
      dur: 2.9, cd: 7, say: BZ.t("boss-pharaoh.5"),
      when: (z, P, d) => d > 4,
      start(z, S, P, C) {
        const out = C.V().set(P.pos.x - z.pos.x, 0, P.pos.z - z.pos.z); if (out.lengthSq() < 0.01) out.set(0, 0, 1); out.normalize();
        let at = C.V().set(P.pos.x + out.x * 4.2, 0, P.pos.z + out.z * 4.2); if (!C.inArena(at.x, at.z, 3)) at = C.V().set(P.pos.x - out.x * 4.2, 0, P.pos.z - out.z * 4.2);
        if (!C.inArena(at.x, at.z, 3)) at.set(P.pos.x * 0.5, 0, P.pos.z * 0.5);
        S.data.exit = at;
        C.boom(C.V().set(z.pos.x, 0.5, z.pos.z), 3, [GLOW, GOLD, SAND], { sound: 'boom', rate: 0.7 });
        C.after(0.5, () => C.warn({ at, r: 3.4, dur: 1.15, col: GOLD, fire: () => {
          z.pos.set(at.x, 0, at.z); z.vel.set(0, 0, 0); S.data.up = true;
          C.shock(C.V().set(at.x, 0.05, at.z), 9.5, 0.6, GOLD, 24, { wall: true });
          sandBurst(C, at, 3.4, 20); C.shakeAt(at, 5); C.G.audio.playAt('swipe', at, { gain: 1, rate: 0.5 });
        } }));
      },
      tick(z, dt, P, S, C) { z.vel.x = z.vel.z = 0; if (S.t > RISE) turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 10); },
    },
    orbring: {
      dur: 2.2, cd: 6, say: BZ.t("boss-pharaoh.6"),
      when: (z, P, d) => d < 36,
      start(z, S, P, C) {
        C.shock(C.V().set(z.pos.x, 0.05, z.pos.z), 5, 0.7, GOLD, 0);
        C.G.audio.playAt('roar', z.pos, { gain: 0.8, rate: 0.65 });
      },
      tick(z, dt, P, S, C) {
        z.vel.x = z.vel.z = 0; turnTo(z, Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z), dt, 4);
        const rings = C.rage(z) ? 3 : 2; const n = 22;
        while ((S.data.r || 0) < rings && S.t > 0.8 + (S.data.r || 0) * 0.35) {
          const r = S.data.r = (S.data.r || 0) + 1; const from = C.V().set(z.pos.x, 1.3, z.pos.z);
          const off = r * 0.5 * (Math.PI * 2 / n);
          for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + off; C.orb({ from: from.clone(), vel: C.V().set(Math.sin(a) * 15, 0, Math.cos(a) * 15), size: 0.45, col: GOLD, col2: SAND, core: GLOW, dmg: 16, blast: 1.5, life: 2.4, trailRate: 45, sound: 'boom', rate: 1.2, hazard: i % 5 === 0 ? { kind: 'sand', r: 1.4, dur: 2.5 } : null }); }
          C.boom(C.V().set(z.pos.x, 1.5, z.pos.z), 3.5, [GLOW, GOLD, SAND], { air: true, smoke: false, sound: 'boom', rate: 0.8 });
          C.shock(C.V().set(z.pos.x, 0.05, z.pos.z), 4, 0.35, GLOW, 0);
        }
      },
    },
  };

  BZ.bossKit('pharaoh', {
    type: { hp: 5000, speed: 5, dmg: 28, rate: 2, windup: 0.5, scale: 3.2, skin: 'pf_wrap', face: 'pf_face', shirt: ['pf_collar'], pants: ['pf_skirt'], score: 6000, eye: GLOW, name: BZ.t("boss-pharaoh.7") },
    colors: [GOLD, LAPIS, GLOW],
    rig,
    hits: [['head', 'head', 0.26, 0.15], ['body', 'chest', 0.4, 0], ['body', 'torso', 0.35, -0.2], ['body', 'root', 0.5, 0.9]],
    pose, idle, moves, rest: 1.0,
    combos: [['scarabs', 'pillars'], ['curse', 'mummies'], ['orbring', 'sandsink'], ['pillars', 'scarabs', 'orbring'], ['sandsink', 'curse']],
    rageCombos: [['scarabs', 'sandsink', 'curse'], ['pillars', 'mummies', 'orbring'], ['orbring', 'scarabs', 'pillars']],
  });
})();
