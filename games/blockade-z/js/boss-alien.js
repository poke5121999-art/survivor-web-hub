// Kẻ Xâm Lăng: a tall grey-green alien warlord. Plasma volleys, a charged laser sweep, a lobbed gravity grenade,
// blink strikes with a shock ring on arrival, acid mines from the sky and a flash that calls runner drones.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;
  const rgb = BZ.rgb;
  const GREY = 0x7a9a7a; const DARK = 0x1a2420; const PLASMA = 0x60ff80; const TEAL = 0x40ffd0; const PALE = 0xe4fff0;

  BZ.defTex('ba_skin', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(x % 4 === 0 ? 0x5e7e60 : rng.chance(0.18) ? 0x8aaa8a : GREY)); });
  BZ.defTex('ba_face', 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(rng.chance(0.15) ? 0x8aaa8a : GREY));
    for (const [x, y] of [[2, 2], [5, 2], [1, 3], [2, 3], [5, 3], [6, 3], [1, 4], [6, 4]]) set(x, y, rgb(0x050806));
    for (let x = 3; x < 5; x++) set(x, 5, rgb(0x5e7e60));
    for (let x = 2; x < 6; x++) set(x, 6, rgb(0x2c3e2e));
  });
  BZ.defTex('ba_armor', 8, 8, ({ set }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(y === 3 || (x === 1 && y > 3) ? 0x30c868 : (x + y) % 5 === 0 ? 0x4a5e50 : 0x34463c)); });
  BZ.defTex('ba_dark', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(rng.chance(0.2) ? 0x2c3a34 : DARK)); });

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  function rig(G, b, M) {
    const sh = G.quality.shadow > 0; const mats = b.mats; const n = {};
    const g = new THREE.Group();
    const mesh = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = sh; parent.add(m); return m; };
    const grp = (parent, x = 0, y = 0, z = 0, name) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); if (name) n[name] = o; return o; };
    const glow = new THREE.MeshBasicMaterial({ color: PLASMA, fog: false }); const teal = new THREE.MeshBasicMaterial({ color: TEAL, fog: false }); const pale = new THREE.MeshBasicMaterial({ color: PALE, fog: false });
    const body = grp(g, 0, 1.0, 0, 'body');
    n.pelvis = mesh(body, box(0.42, 0.22, 0.26), mats.pants, 0, 0.02, 0);
    mesh(body, box(0.5, 0.06, 0.3), mats.shirt, 0, 0.1, 0);
    const spine = grp(body, 0, 0.12, 0, 'spine');
    mesh(spine, box(0.14, 0.2, 0.14), mats.pants, 0, 0.1, -0.02);
    n.chest = mesh(spine, box(0.56, 0.5, 0.34), mats.skin, 0, 0.3, 0);
    mesh(spine, box(0.6, 0.18, 0.38), mats.shirt, 0, 0.5, 0);
    mesh(spine, box(0.5, 0.26, 0.05), mats.shirt, 0, 0.26, 0.19);
    for (const s of [-1, 1]) { mesh(spine, box(0.03, 0.34, 0.03), glow, s * 0.15, 0.27, 0.225); mesh(spine, box(0.1, 0.1, 0.4), mats.shirt, s * 0.34, 0.5, 0); mesh(spine, box(0.1, 0.03, 0.42), glow, s * 0.34, 0.56, 0); }
    mesh(spine, box(0.2, 0.03, 0.03), teal, 0, 0.12, 0.225);
    n.core = mesh(spine, new THREE.OctahedronGeometry(0.1, 0), pale, 0, 0.34, 0.24);
    n.coreGlow = new THREE.Sprite(M.glowMat(PLASMA, 0.8)); n.coreGlow.position.set(0, 0.34, 0.28); n.coreGlow.scale.setScalar(0.7); spine.add(n.coreGlow);
    n.spine = spine;
    mesh(spine, box(0.12, 0.16, 0.12), mats.pants, 0, 0.62, 0.02);
    // oversized head: ridged skull swept back, a brow ridge, the face on +z
    const head = grp(spine, 0, 0.66, 0.04, 'head');
    mesh(head, box(0.54, 0.58, 0.5), [mats.skin, mats.skin, mats.skin, mats.skin, mats.face, mats.skin], 0, 0.27, 0.04);
    mesh(head, box(0.44, 0.5, 0.4), mats.skin, 0, 0.36, -0.34);
    mesh(head, box(0.34, 0.34, 0.3), mats.skin, 0, 0.42, -0.62);
    mesh(head, box(0.6, 0.07, 0.1), mats.pants, 0, 0.5, 0.29);
    mesh(head, box(0.3, 0.14, 0.26), mats.skin, 0, -0.02, 0.14);
    for (let i = 0; i < 5; i++) mesh(head, box(0.05, 0.1 - Math.abs(i - 2) * 0.012, 0.16), i % 2 ? glow : mats.pants, 0, 0.62 + (i === 2 ? 0.04 : 0) - Math.abs(i - 2) * 0.02, 0.2 - i * 0.2);
    for (const s of [-1, 1]) { const eg = new THREE.Sprite(M.glowMat(PLASMA, 0.55)); eg.position.set(s * 0.16, 0.3, 0.32); eg.scale.setScalar(0.24); head.add(eg); mesh(head, box(0.04, 0.34, 0.04), mats.pants, s * 0.29, 0.1, 0.22).rotation.z = -s * 0.15; }
    // upper pair of arms holds the plasma cannon; lower pair has long fingers
    const limb = (par, x, y, z, l1, l2, w) => {
      const sh1 = grp(par, x, y, z); sh1.rotation.order = 'YXZ'; mesh(sh1, box(w, l1, w), mats.skin, 0, -l1 / 2, 0);
      const el = grp(sh1, 0, -l1, 0); mesh(el, box(w * 0.85, l2, w * 0.85), mats.skin, 0, -l2 / 2, 0); mesh(el, box(w * 1.2, 0.06, w * 1.2), mats.shirt, 0, -0.05, 0);
      const hand = grp(el, 0, -l2, 0); return { sh: sh1, el, hand };
    };
    n.arms = []; n.low = [];
    for (const s of [-1, 1]) {
      const A = limb(spine, s * 0.33, 0.5, 0, 0.42, 0.46, 0.1); mesh(A.sh, box(0.16, 0.14, 0.16), mats.shirt, 0, 0.02, 0); mesh(A.hand, box(0.12, 0.1, 0.14), mats.pants, 0, -0.03, 0); A.s = s; n.arms.push(A);
      const L = limb(spine, s * 0.3, 0.34, -0.02, 0.5, 0.56, 0.07); mesh(L.hand, box(0.09, 0.1, 0.05), mats.skin, 0, -0.05, 0);
      L.fingers = []; for (let i = 0; i < 3; i++) { const f = grp(L.hand, (i - 1) * 0.035, -0.1, 0); mesh(f, box(0.022, 0.3, 0.022), mats.skin, 0, -0.15, 0); mesh(f, box(0.03, 0.04, 0.03), glow, 0, -0.31, 0); L.fingers.push(f); }
      L.s = s; n.low.push(L);
    }
    n.cannon = grp(spine, 0, 0.3, 0.45, 'cannon');
    mesh(n.cannon, box(0.28, 0.3, 0.64), mats.pants, 0, 0, 0);
    mesh(n.cannon, box(0.3, 0.06, 0.5), mats.shirt, 0, 0.17, 0.05);
    mesh(n.cannon, box(0.16, 0.16, 0.46), mats.skin, 0, 0, 0.52);
    for (const s of [-1, 1]) { mesh(n.cannon, box(0.04, 0.16, 0.4), glow, s * 0.15, 0, 0.0); mesh(n.cannon, box(0.03, 0.22, 0.03), teal, s * 0.1, 0.02, 0.72); }
    for (let i = 0; i < 3; i++) mesh(n.cannon, box(0.2, 0.2, 0.04), i % 2 ? teal : mats.shirt, 0, 0, 0.36 + i * 0.12);
    n.muzzle = grp(n.cannon, 0, 0, 0.8, 'muzzle');
    n.muzGlow = new THREE.Sprite(M.glowMat(PLASMA, 0)); n.muzzle.add(n.muzGlow);
    n.orbPoint = grp(spine, 0, 0.3, 0.62, 'orbPoint');
    n.orbGlow = new THREE.Sprite(M.glowMat(TEAL, 0)); n.orbPoint.add(n.orbGlow);
    // digitigrade legs: thigh forward, shin back, long foot bone forward onto the toes
    n.legs = [];
    for (const s of [-1, 1]) {
      const hip = grp(body, s * 0.17, -0.04, 0); mesh(hip, box(0.14, 0.45, 0.16), mats.skin, 0, -0.22, 0); mesh(hip, box(0.16, 0.12, 0.18), mats.shirt, 0, -0.06, 0);
      const knee = grp(hip, 0, -0.45, 0); mesh(knee, box(0.1, 0.45, 0.12), mats.skin, 0, -0.22, 0); mesh(knee, box(0.12, 0.1, 0.14), glow, 0, 0.0, 0.05);
      const foot = grp(knee, 0, -0.45, 0); mesh(foot, box(0.08, 0.28, 0.09), mats.pants, 0, -0.14, 0);
      const toes = grp(foot, 0, -0.28, 0.0); for (const tx of [-0.04, 0, 0.04]) mesh(toes, box(0.03, 0.03, 0.16), mats.skin, tx, 0.01, 0.06);
      n.legs.push({ hip, knee, foot, toes });
    }
    const aura = new THREE.Sprite(M.glowMat(PLASMA, 0.14)); aura.position.set(0, 1.2, 0); aura.scale.setScalar(4.2); g.add(aura); n.aura = aura;
    return { g, n, a: {} };
  }

  const sm = (a, key, v, k, dt) => (a[key] = a[key] === undefined ? v : a[key] + (v - a[key]) * Math.min(1, k * dt));
  const VOL = [0.55, 0.95, 1.35];
  function pose(z, R, dt, sp, S, C) {
    const n = R.n; const a = R.a; const t = z.bob; const cur = S.cur;
    const prev = a.pt === undefined || S.t < a.pt ? -1 : a.pt; const crossed = (tv) => cur && prev < tv && S.t >= tv; a.pt = cur ? S.t : -1;
    const spd = Math.hypot(z.vel.x, z.vel.z); a.ph = (a.ph || 0) + dt * (2.4 + spd * 1.2);
    const wa = sm(a, 'wa', Math.min(1, spd / 4), 8, dt);
    let cpitch = 0; let lean = 0; let crouch = 0; let rec = 0; let lowUp = 0; let lowOut = 0.12; let charge = 0; let sx = 1; let sy = 1; let core = 0.55; let orbK = 0; let headDown = 0;
    if (cur === 'plasma') { for (const tv of VOL) if (S.t > tv) rec = Math.max(rec, Math.exp(-(S.t - tv) * 9)); cpitch = -rec * 0.1; lean = rec * 0.08; for (const tv of VOL) if (crossed(tv)) C.G.fx.burst(C.at(z, 'muzzle'), 8, [PLASMA, TEAL], { speed: 4, size: 0.1, life: 0.35 }); }
    if (cur === 'laser') { charge = Math.min(1, S.t / 1.1); lean = 0.1 * charge; crouch = 0.05 * charge; core = 0.55 + charge * 0.4; if (S.t > 1.1 && S.t < S.dur - 0.15) { rec = 0.5 + Math.sin(t * 60) * 0.1; charge = 1; } }
    if (cur === 'grenade') { lowUp = S.t < 0.85 ? 1 : -0.4; lowOut = 0.4; orbK = S.t < 0.85 ? Math.min(1, S.t / 0.7) : 0; lean = S.t < 0.85 ? -0.06 : 0.12; core = 0.9; }
    if (cur === 'mines') { cpitch = -0.95; lowUp = 0.4; lowOut = 0.8; lean = -0.1; core = 0.8; }
    if (cur === 'blink') { const k = S.t / 0.8; if (S.t < 0.8) { crouch = 0.25 * Math.min(1, k * 2); sx = 1 - 0.85 * Math.max(0, (k - 0.6) / 0.4); sy = 1 + 0.4 * Math.max(0, (k - 0.6) / 0.4); core = 1; } else { const u = Math.min(1, (S.t - 0.8) / 0.25); sx = 0.15 + 0.85 * u; sy = 1.4 - 0.4 * u; core = 1; lean = 0.1 * (1 - u); } }
    if (cur === 'summon') { lowUp = 1.6; lowOut = 0.9; cpitch = -0.5; core = 0.6 + Math.min(1, S.t / 0.7) * 0.4; lean = -0.12; }
    const breathe = Math.sin(t * 1.6) * 0.02;
    n.body.position.y = 1.0 - sm(a, 'cr', crouch, 8, dt) + breathe + Math.abs(Math.sin(a.ph)) * 0.04 * wa;
    n.body.rotation.z = Math.sin(a.ph) * 0.03 * wa; n.spine.rotation.x = sm(a, 'lean', lean + 0.04 * wa, 7, dt); n.spine.rotation.y = Math.sin(a.ph) * 0.1 * wa + Math.sin(t * 0.7) * 0.03;
    n.head.rotation.x = sm(a, 'hd', headDown + 0.12 - lean * 0.6, 5, dt); n.head.rotation.y = Math.sin(t * 0.9) * 0.08;
    R.g.scale.set(sm(a, 'sx', sx, 14, dt), sm(a, 'sy', sy, 14, dt), a.sx);
    // legs
    n.legs.forEach((L, i) => {
      const ph = a.ph + (i ? Math.PI : 0); const sw = Math.sin(ph) * 0.55 * wa; const lift = Math.max(0, Math.cos(ph)) * 0.55 * wa; const cr = a.cr || 0;
      L.hip.rotation.x = -0.5 - cr * 1.2 + sw; L.knee.rotation.x = 1.1 + cr * 2 + lift - sw * 0.3; L.foot.rotation.x = -0.45 - (L.hip.rotation.x + L.knee.rotation.x);
    });
    // cannon and the upper arms that hold it
    const cp = sm(a, 'cp', cpitch, 8, dt);
    n.cannon.rotation.x = cp; n.cannon.position.z = 0.45 - sm(a, 'rec', rec, 20, dt) * 0.18 + (cur === 'laser' && charge >= 1 ? Math.sin(t * 70) * 0.01 : 0);
    for (const A of n.arms) { const s = A.s; A.sh.rotation.x = -1.0 + cp * 0.7; A.sh.rotation.y = -0.28 * s; A.sh.rotation.z = 0; A.el.rotation.x = -0.6 + rec * 0.15; }
    // lower arms: swing with the stride, raise to conjure or call
    const lu = sm(a, 'lu', lowUp, 7, dt); const lo = sm(a, 'lo', lowOut, 7, dt);
    n.low.forEach((L, i) => {
      const sw = Math.sin(a.ph + (i ? 0 : Math.PI)) * 0.4 * wa; const idle = Math.sin(t * 1.3 + i * 2) * 0.06;
      L.sh.rotation.x = 0.1 + sw + idle - lu * 1.4; L.sh.rotation.z = L.s * (lo + Math.sin(t * 1.1 + i) * 0.03); L.sh.rotation.y = -L.s * lu * 0.25; L.el.rotation.x = -0.25 - lu * 0.3 + idle;
      L.fingers.forEach((f, j) => { f.rotation.x = -0.15 - Math.sin(t * 2 + j + i) * 0.1 - lu * 0.5; f.rotation.z = (j - 1) * (0.14 + lu * 0.15); });
    });
    // glows: chest core, muzzle, the grenade being conjured
    n.core.rotation.y += dt * 2; n.core.rotation.x += dt * 1.3; const cg = sm(a, 'core', core, 6, dt) + Math.sin(t * 5) * 0.06;
    n.coreGlow.material.opacity = Math.min(1, cg); n.coreGlow.scale.setScalar(0.5 + cg * 0.6);
    const mg = cur === 'laser' ? charge * (S.t > 1.1 ? 1.2 : 0.9) : cur === 'plasma' ? rec * 1.1 : cur === 'mines' ? 0.5 + Math.sin(t * 20) * 0.2 : 0;
    n.muzGlow.material.opacity = sm(a, 'mg', Math.min(1, mg), 14, dt); n.muzGlow.scale.setScalar(0.25 + a.mg * (cur === 'laser' ? 1.7 : 0.9) + Math.sin(t * 40) * 0.05 * a.mg);
    n.orbGlow.material.opacity = sm(a, 'og', orbK, 10, dt); n.orbGlow.scale.setScalar(0.1 + a.og * 1.3 + Math.sin(t * 30) * 0.06 * a.og);
    n.aura.material.opacity = 0.12 + 0.05 * Math.sin(t * 3) + (C.rage(z) ? 0.12 : 0);
    if (cur === 'laser' && S.t < 1.1 && Math.random() < dt * 45) { const m = C.at(z, 'muzzle'); const off = C.V().set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3.4); C.G.fx.puff(m.clone().add(off), { glow: true, vel: off.clone().multiplyScalar(-3), s0: 0.16, s1: 0.04, life: 0.34, c0: PALE, c1: PLASMA, a0: 1 }); }
    if (cur === 'grenade' && S.t < 0.85 && Math.random() < dt * 30) { const m = C.at(z, 'orbPoint'); const off = C.V().set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2.6); C.G.fx.puff(m.clone().add(off), { glow: true, vel: off.clone().multiplyScalar(-2.5), s0: 0.14, s1: 0.04, life: 0.3, c0: TEAL, c1: PLASMA, a0: 1 }); }
    if (cur === 'blink' && S.t < 0.8 && Math.random() < dt * 40) C.G.fx.puff(C.at(z, 'body').add(C.V().set(Math.random() - 0.5, Math.random() * 2, Math.random() - 0.5).multiplyScalar(2)), { glow: true, vel: C.V().set(0, 3, 0), s0: 0.3, s1: 0.05, life: 0.4, c0: TEAL, c1: PLASMA, a0: 0.9 });
  }

  function idle(z, dt, P, dist, S, C) {
    const lim = C.G.world.HALF - 3; const dir = S.n % 2 ? 1 : -1; const R = 12 + Math.sin(z.bob * 0.5) * 2;
    const o = Math.atan2(z.pos.x - P.pos.x, z.pos.z - P.pos.z) + 0.55 * dir;
    const tx = BZ.clamp(P.pos.x + Math.sin(o) * R, -lim, lim); const tz = BZ.clamp(P.pos.z + Math.cos(o) * R, -lim, lim);
    C.walk(z, dt, tx, tz, C.rage(z) ? 8 : 6, 0.8); C.face(z, P, dt, 5);
  }
  const hold = (z, dt, C) => C.walk(z, dt, z.pos.x, z.pos.z, 0, 0.8);
  const bearing = (z, P) => Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z);
  const groundPt = (z, a, R) => new THREE.Vector3(z.pos.x + Math.sin(a) * R, 0.1, z.pos.z + Math.cos(a) * R);

  const moves = {
    plasma: {
      dur: 1.9, cd: 3.5, say: 'LOẠT ĐẠN PLASMA',
      when: (z, P, d) => d < 40,
      tick(z, dt, P, S, C) {
        hold(z, dt, C); C.face(z, P, dt, 9);
        const D = S.data; D.i = D.i || 0;
        while (D.i < VOL.length && S.t >= VOL[D.i]) {
          D.i++;
          const from = C.at(z, 'muzzle'); const to = C.aimAt(P, 0.25); const base = Math.atan2(to.x - from.x, to.z - from.z); const dy = (to.y - from.y) / (Math.hypot(to.x - from.x, to.z - from.z) || 1);
          const cnt = C.rage(z) ? 5 : 3;
          for (let k = 0; k < cnt; k++) {
            const a = base + (k - (cnt - 1) / 2) * 0.13; const v = C.V().set(Math.sin(a), dy, Math.cos(a)).normalize().multiplyScalar(36);
            C.orb({ from: from.clone(), vel: v, size: 0.3, col: PLASMA, col2: TEAL, core: PALE, shape: 'shard', blast: 1.7, dmg: 14, sound: 'boom', rate: 1.6, trailRate: 70 });
          }
          C.G.audio.playAt('boom', from, { gain: 0.5, rate: 1.6 });
        }
      },
    },
    laser: {
      dur: 2.9, cd: 7, say: 'TIA LASER SẠC',
      when: (z, P, d) => d < 34,
      start(z, S, P, C) {
        const b0 = bearing(z, P); const dist = Math.hypot(P.pos.x - z.pos.x, P.pos.z - z.pos.z); const R = BZ.clamp(dist * 1.3, 9, 22); const dir = C.G.rng.chance(0.5) ? 1 : -1; const half = 0.55;
        Object.assign(S.data, { b0, R, dir, half });
        for (const [k, w] of [[-1, 2.4], [0, 1.6], [1, 2.4]]) { const a = b0 + k * half * dir; const T = groundPt(z, a, R); const A = C.V().set(z.pos.x, 0, z.pos.z); C.warn({ at: A, to: T, w, dur: 1.1, col: PLASMA }); }
        C.G.audio.playAt('boom', z.pos, { gain: 0.6, rate: 2 });
      },
      tick(z, dt, P, S, C) {
        const D = S.data; if (D.b0 === undefined) return; hold(z, dt, C);
        if (S.t < 0.7) { z.yaw += BZ.wrapAngle(D.b0 - z.yaw) * Math.min(1, dt * 8); return; }
        if (S.t < 1.1) { z.yaw += BZ.wrapAngle(D.b0 - D.dir * D.half - z.yaw) * Math.min(1, dt * 10); return; }
        if (!D.beam) {
          const dur = S.dur - 1.1 - 0.5; D.dur = dur;
          D.beam = C.beam({ from: C.at(z, 'muzzle'), to: groundPt(z, D.b0 - D.dir * D.half, D.R), to2: groundPt(z, D.b0 + D.dir * D.half, D.R), w: 0.75, dur, col: PLASMA, core: PALE, dmg: 9, scorch: 'acid', follow: () => C.at(z, 'muzzle') });
          C.G.audio.playAt('boom', z.pos, { gain: 1, rate: 0.5 }); C.shakeAt(z.pos, 3);
        }
        const k = Math.min(1, (S.t - 1.1) / D.dur); z.yaw = D.b0 + D.dir * D.half * (2 * k - 1);
      },
    },
    grenade: {
      dur: 2.0, cd: 6, say: 'LỰU HẤP DẪN',
      when: (z, P, d) => d > 4 && d < 36,
      start(z, S, P, C) {
        const land = C.V().set(P.pos.x, 0.4, P.pos.z); const d = Math.hypot(land.x - z.pos.x, land.z - z.pos.z); const T = BZ.clamp(d / 15, 0.7, 1.6);
        Object.assign(S.data, { land, T });
        C.warn({ at: C.V().set(land.x, 0, land.z), r: 4.2, dur: 0.85 + T, col: TEAL });
      },
      tick(z, dt, P, S, C) {
        const D = S.data; if (!D.land) return; hold(z, dt, C); C.face(z, P, dt, 6);
        if (S.t >= 0.85 && !D.thrown) {
          D.thrown = true; const from = C.at(z, 'orbPoint'); const g = 16; const T = D.T;
          const vel = C.V().set((D.land.x - from.x) / T, (D.land.y - from.y + 0.5 * g * T * T) / T, (D.land.z - from.z) / T);
          C.orb({ from, vel, size: 1.1, col: TEAL, col2: PLASMA, core: 0xffffff, grav: g, life: T + 1.5, blast: 4.4, dmg: 26, fx: { slow: 2.5 }, hazard: { kind: 'void', r: 3.2, dur: 3.5 }, trailRate: 60, trailCol: TEAL, sound: 'boom', rate: 0.55,
            onHit: (at) => { C.shock(C.V().set(at.x, 0.05, at.z), 8, 0.9, TEAL, 0, { net: false }); } });
          C.G.audio.playAt('boom', from, { gain: 0.7, rate: 0.7 });
        }
      },
    },
    blink: {
      dur: 1.9, cd: 6, say: 'DỊCH CHUYỂN',
      start(z, S, P, C) {
        const base = C.G.rng.range(0, 6.28); let dest = null;
        for (let k = 0; k < 9 && !dest; k++) { const a = base + k * 0.7; const x = P.pos.x + Math.sin(a) * 5.5; const zz = P.pos.z + Math.cos(a) * 5.5; if (C.inArena(x, zz, 3) && !C.G.world.overlaps([x - 0.6, 0, zz - 0.6], [x + 0.6, 3, zz + 0.6])) dest = C.V().set(x, 0, zz); }
        S.data.dest = dest || C.V().set(P.pos.x, 0, P.pos.z).add(C.V().set(-Math.sign(P.pos.x || 1) * 5, 0, 0));
        C.warn({ at: S.data.dest.clone(), r: 3.2, dur: 0.8, col: TEAL });
        C.flash(C.V().set(z.pos.x, z.pos.y + 3, z.pos.z), 5, TEAL, 0.5);
      },
      tick(z, dt, P, S, C) {
        const D = S.data; if (!D.dest) return; hold(z, dt, C);
        if (S.t < 0.8) { C.face(z, P, dt, 6); return; }
        if (!D.done) {
          D.done = true; const old = C.V().set(z.pos.x, z.pos.y + 2.5, z.pos.z);
          C.boom(old, 2.2, [TEAL, PLASMA, 0xffffff], { smoke: false, sound: false }); z.pos.set(D.dest.x, 0, D.dest.z); z.vel.set(0, 0, 0);
          const at = C.V().set(D.dest.x, 0.05, D.dest.z); C.flash(C.V().set(D.dest.x, 3, D.dest.z), 12, PLASMA, 0.45);
          C.shock(at, 10, 0.75, TEAL, 20, { wall: true }); C.boom(C.V().set(D.dest.x, 0.5, D.dest.z), 2.6, [PLASMA, TEAL, 0xffffff], { smoke: false }); C.shakeAt(z.pos, 5);
        }
        C.face(z, P, dt, 12);
      },
    },
    mines: {
      dur: 2.3, cd: 8, say: 'MÌN AXIT',
      start(z, S, P, C) {
        const n = C.rage(z) ? 9 : 6; let c = 0;
        for (const p of C.players()) for (let i = 0; i < n; i++) {
          const a = C.G.rng.range(0, 6.3); const r = i === 0 ? 0 : C.G.rng.range(2.5, 8); const at = C.V().set(p.pos.x + Math.cos(a) * r, 0, p.pos.z + Math.sin(a) * r);
          if (!C.inArena(at.x, at.z, 1.5)) continue;
          C.after(0.1 + c++ * 0.1, () => {
            C.warn({ at, r: 2.2, dur: 1.0, col: PLASMA, fire: (T) => {
              const from = C.V().set(T.at.x + C.G.rng.range(-2, 2), 18, T.at.z + C.G.rng.range(-2, 2));
              C.orb({ from, vel: C.V().set(T.at.x, 0, T.at.z).sub(from).normalize().multiplyScalar(48), size: 0.55, col: PLASMA, col2: TEAL, core: PALE, shape: 'shard', blast: 2.8, dmg: 17, hazard: { kind: 'acid', r: 2.4, dur: 6 }, trailRate: 80, sound: 'boom', rate: 1.1 });
            } });
          });
        }
      },
      tick(z, dt, P, S, C) { hold(z, dt, C); C.face(z, P, dt, 4); },
    },
    summon: {
      dur: 1.9, cd: 10, say: 'GỌI TRINH SÁT',
      when: (z, P, d, C) => { const L = C.G.zombies.list; return !L || L.filter((q) => q.alive).length < 16; },
      start(z, S, P, C) {
        C.warn({ at: C.V().set(z.pos.x, 0, z.pos.z), r: 4, dur: 0.75, col: PLASMA, fire: () => {
          const c = C.V().set(z.pos.x, 0, z.pos.z); C.flash(C.V().set(c.x, 3, c.z), 14, PLASMA, 0.5);
          C.shock(c.clone().setY(0.05), 11, 0.8, PLASMA, 14, { wall: true }); C.shakeAt(z.pos, 5); C.G.audio.playAt('screech', z.pos, { gain: 0.8, rate: 1.4 });
          const n = C.rage(z) ? 3 : 2; const a0 = C.G.rng.range(0, 6.3);
          for (let i = 0; i < n; i++) { const a = a0 + i * 6.283 / n; const at = C.V().set(c.x + Math.sin(a) * 4, 0, c.z + Math.cos(a) * 4); if (!C.inArena(at.x, at.z, 2)) at.copy(c); C.flash(C.V().set(at.x, 1.2, at.z), 6, TEAL, 0.4); C.summon('runner', at, 0.4); }
        } });
      },
      tick(z, dt, P, S, C) { hold(z, dt, C); C.face(z, P, dt, 4); },
    },
  };

  BZ.bossKit('alien', {
    type: { hp: 4800, speed: 7, dmg: 28, rate: 2, windup: 0.5, scale: 3.0, skin: 'ba_skin', face: 'ba_face', shirt: ['ba_armor'], pants: ['ba_dark'], score: 5500, eye: PLASMA, name: 'KẺ XÂM LĂNG' },
    colors: [PLASMA, TEAL, PALE],
    rig,
    init: (z, S) => { S.rest = 1.2; },
    hits: [['head', 'head', 0.34, 0.27], ['body', 'chest', 0.4, 0], ['body', 'pelvis', 0.34, 0], ['body', 'cannon', 0.3, 0]],
    pose, idle, moves, rest: 1.0,
    combos: [['plasma', 'blink'], ['laser', 'mines'], ['grenade', 'plasma'], ['blink', 'laser'], ['summon', 'grenade'], ['mines', 'plasma']],
    rageCombos: [['blink', 'plasma', 'laser'], ['summon', 'mines', 'grenade'], ['grenade', 'blink', 'laser']],
  });
})();
