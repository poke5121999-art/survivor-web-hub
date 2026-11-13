// Skill body animations: one BZ.CAST_ANIM entry per ability key in heroes.js ABIL.
// Joints that animHero re-sets every frame are the only ones driven here (hips.rotation.x, arm.rotation.y, leg.rotation.z
// and the like would keep a stale value after the cast ends). Arm z: right arm outward is +, left arm outward is -.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;
  if (!BZ || !THREE) return;
  const CA = BZ.CAST_ANIM = BZ.CAST_ANIM || {}; const PR = BZ.CAST_PROPS = BZ.CAST_PROPS || {};
  const PI = Math.PI;

  // ---------- keyframes ----------
  const sm = (k, a, b) => { const t = Math.max(0, Math.min(1, (k - a) / (b - a))); return t * t * (3 - 2 * t); };
  // piecewise smooth value (or vector) through [[k, v], ...]
  const K = (k, pts) => {
    if (k <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (k <= pts[i][0]) {
        const t = sm(k, pts[i - 1][0], pts[i][0]); const a = pts[i - 1][1]; const b = pts[i][1];
        return Array.isArray(a) ? a.map((v, j) => v + (b[j] - v) * t) : a + (b - a) * t;
      }
    }
    return pts[pts.length - 1][1];
  };
  const IDLE_R = [-0.15, 0.1, -0.25]; const IDLE_L = [-0.15, -0.1, -0.25];
  const wt = (k) => Math.min(1, k / 0.12, (1 - k) / 0.15);
  const wrap = (a) => { a %= 2 * PI; return a > PI ? a - 2 * PI : a < -PI ? a + 2 * PI : a; };

  function apply(set, m, o, k) {
    const w = wt(k);
    const R = o.R || IDLE_R; const L = o.L || IDLE_L;
    set(m.armR, 'x', R[0]); set(m.armR, 'z', R[1]); set(m.elbowR, 'x', R[2]);
    set(m.armL, 'x', L[0]); set(m.armL, 'z', L[1]); set(m.elbowL, 'x', L[2]);
    if (o.s) { set(m.spine, 'x', o.s[0]); set(m.spine, 'y', o.s[1] || 0); }
    if (o.h) { set(m.head, 'x', o.h[0]); set(m.head, 'y', o.h[1] || 0); }
    if (o.tR) { set(m.legR, 'x', o.tR[0]); set(m.kneeR, 'x', o.tR[1]); set(m.footR, 'x', o.tR[2] || 0); }
    if (o.tL) { set(m.legL, 'x', o.tL[0]); set(m.kneeL, 'x', o.tL[1]); set(m.footL, 'x', o.tL[2] || 0); }
    if (o.by !== undefined) set(m.hips, 'y', o.by);
    if (o.d) m.hips.position.y -= o.d * w;
  }
  // an entry: key, duration, extras, and f(k, m) -> pose object
  function def(key, dur, ex, f) {
    CA[key] = Object.assign({ dur, pose(set, k, m) { apply(set, m, f(k, m), k); } }, ex);
  }

  // ---------- world helpers ----------
  const V = () => new THREE.Vector3();
  const tmp = V();
  const handAt = (m, side) => { m.root.updateMatrixWorld(true); return (side === 'L' ? m.handL : m.handR).getWorldPosition(V()); };
  const bodyAt = (m, y) => { m.root.updateMatrixWorld(true); return m.root.getWorldPosition(V()).setY(m.root.getWorldPosition(tmp).y + y); };
  const fwdOf = (m) => V().set(Math.sin(m.root.rotation.y), 0, Math.cos(m.root.rotation.y));
  const ahead = (m, d, y = 0) => { const p = bodyAt(m, y); return p.addScaledVector(fwdOf(m), d); };
  const snd = (G, name, at, o) => { try { G.audio.playAt(name, at, o); } catch (e) {} };
  const sparks = (G, at, cols = [0xffd060, 0xffffff, 0xff8a20], n = 14) => {
    G.fx.burst(at, n, cols, { speed: 4.5, size: 0.07, life: 0.45, grav: 8 });
    G.fx.puff(at, { glow: true, s0: 0.7, s1: 0.15, life: 0.14, c0: 0xffffff, c1: cols[0], a0: 1.2, spin: 0 });
  };
  const flashAt = (G, at, c0, c1, r = 1) => G.fx.puff(at, { glow: true, s0: 0.5 * r, s1: 2.4 * r, life: 0.3, c0, c1, a0: 1.1, spin: 0 });
  const ringAt = (G, at, r, c0, c1, life = 0.5) => G.fx.puff(at, { glow: true, s0: 0.5, s1: r * 2, life, c0, c1, a0: 1, spin: 0 });

  // ---------- props (built once per body, shown in the hand during the cast) ----------
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const bas = (c) => new THREE.MeshBasicMaterial({ color: c });
  const box = (g, w, h, d, x, y, z, mat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); g.add(b); return b; };
  const prop = (name, build) => { PR[name] = () => { const g = new THREE.Group(); build(g); g.userData.castProp = true; g.traverse((o) => { if (o.isMesh) o.castShadow = false; }); return g; }; };
  prop('hammer', (g) => { box(g, 0.06, 0.62, 0.06, 0, -0.22, 0, lam(0x7a5428)); box(g, 0.15, 0.15, 0.34, 0, -0.55, 0, lam(0x8d97a3)); box(g, 0.16, 0.16, 0.05, 0, -0.55, 0.17, lam(0xf08a24)); });
  prop('wrench', (g) => { box(g, 0.06, 0.5, 0.05, 0, -0.2, 0, lam(0xb8c0c8)); box(g, 0.17, 0.12, 0.05, 0, -0.5, 0, lam(0xb8c0c8)); box(g, 0.07, 0.1, 0.06, 0, -0.52, 0, bas(0x2a2e35)); box(g, 0.065, 0.2, 0.055, 0, -0.1, 0, lam(0xf08a24)); });
  prop('syringe', (g) => { box(g, 0.07, 0.3, 0.07, 0, -0.2, 0, bas(0xdfffd0)); box(g, 0.05, 0.2, 0.05, 0, -0.2, 0, bas(0x9aff40)); box(g, 0.14, 0.03, 0.03, 0, -0.04, 0, lam(0xd8d8d8)); box(g, 0.012, 0.18, 0.012, 0, -0.44, 0, lam(0xe8e8e8)); });
  prop('vial', (g) => { box(g, 0.1, 0.2, 0.1, 0, -0.08, 0, bas(0x60e070)); box(g, 0.11, 0.05, 0.11, 0, -0.2, 0, lam(0xf2f2ee)); box(g, 0.05, 0.05, 0.05, 0, 0.05, 0, lam(0x8a5a2a)); });
  prop('grenade', (g) => { box(g, 0.14, 0.17, 0.14, 0, -0.1, 0, lam(0x4a5a2a)); box(g, 0.07, 0.05, 0.07, 0, 0.0, 0, lam(0x8d97a3)); box(g, 0.03, 0.06, 0.1, 0.07, 0.02, 0, lam(0xd8d8d8)); });
  prop('bottle', (g) => { box(g, 0.1, 0.22, 0.1, 0, -0.12, 0, lam(0x9a6a22)); box(g, 0.05, 0.12, 0.05, 0, 0.02, 0, lam(0x9a6a22)); box(g, 0.06, 0.1, 0.06, 0, 0.12, 0, bas(0xffa030)); });
  prop('mine', (g) => { box(g, 0.28, 0.07, 0.28, 0, -0.1, 0, lam(0x3a3a34)); box(g, 0.07, 0.06, 0.07, 0, -0.05, 0, bas(0xff2a20)); });
  prop('radio', (g) => { box(g, 0.1, 0.22, 0.06, 0, -0.1, 0, lam(0x2a2e35)); box(g, 0.012, 0.28, 0.012, 0.04, 0.12, 0, lam(0xd8d8d8)); box(g, 0.06, 0.04, 0.01, 0, -0.04, 0.035, bas(0x60e070)); });
  prop('star', (g) => { const a = box(g, 0.26, 0.02, 0.26, 0, -0.08, 0, bas(0xd8c8ff)); a.rotation.y = 0.2; const b = box(g, 0.26, 0.02, 0.26, 0, -0.08, 0, bas(0xb090ff)); b.rotation.y = 0.2 + PI / 4; });
  prop('flask', (g) => { box(g, 0.13, 0.15, 0.13, 0, -0.1, 0, bas(0x9aff40)); box(g, 0.05, 0.1, 0.05, 0, 0.0, 0, lam(0xd8e8d0)); box(g, 0.06, 0.04, 0.06, 0, 0.06, 0, lam(0x8a5a2a)); });

  // The weapon in the right hand is put away for a cast (a prop would overlap it, and a rifle waved around by a throw
  // looks wrong); `gun: true` on an entry keeps it. Wrapped here because animHero is the one place every body goes through.
  const orig = BZ.animHero;
  BZ.animHero = (m, s, dt) => {
    orig(m, s, dt);
    const C = s.act && CA[s.act.key]; const hide = !!(C && !C.gun);
    for (const c of m.handR.children) if (!c.userData.castProp) c.visible = !hide;
  };

  // =====================================================================================================
  // Gió
  // =====================================================================================================
  def('dash', 0.5, { gun: true, beats: [0.08], beat(i, m, G) { const at = bodyAt(m, 0.9); const b = fwdOf(m).multiplyScalar(-1); ringAt(G, at, 1.6, 0xffffff, 0x56c8ff, 0.35); for (let j = 0; j < 7; j++) G.fx.puff(at.clone().addScaledVector(b, j * 0.8), { glow: true, s0: 0.9, s1: 0.15, life: 0.4 + j * 0.04, c0: 0xe8f8ff, c1: 0x56c8ff, a0: 0.9, spin: 0 }); } },
    (k) => ({ s: [K(k, [[0, 0.3], [0.2, 0.7]]), K(k, [[0, 0.5], [0.45, -0.3]])], R: K(k, [[0, [0.9, 0.5, -0.5]], [0.3, [-1.8, 0.2, -0.2]], [0.7, [-1.4, 0.2, -0.3]]]), L: [0.8, -0.5, -0.6], h: [-0.1, 0], tL: [-1.0, 0.5, 0], tR: [0.9, 0.5, 0], d: 0.12 }));

  def('gust', 0.75, { beats: [0.4], beat(i, m, G) { const at = ahead(m, 1.2, 1); ringAt(G, at, 2.2, 0xffffff, 0x98aab8, 0.4); G.fx.burst(at.clone().setY(0.2), 22, [0xf4f8ff, 0xb0a890, 0x8a7a5a], { speed: 6, size: 0.14, life: 0.7, grav: 3 }); } },
    (k) => ({ s: [K(k, [[0, 0.1], [0.3, -0.1], [0.45, 0.45]]), K(k, [[0, -0.9], [0.35, 1.0], [0.55, -0.1]])], R: K(k, [[0, [0.5, 1.3, -0.4]], [0.35, [-2.2, 0.4, -0.5]], [0.55, [-1.5, 0.05, -0.1]]]), L: K(k, [[0, [0.3, -1.1, -0.4]], [0.35, [-2.0, -0.5, -0.5]], [0.55, [-1.5, -0.05, -0.1]]]), tL: [-0.6, 0.6, 0], tR: [0.5, 0.6, 0], d: 0.1 }));

  def('blades', 1.2, { gun: true, beats: [0.2, 0.5, 0.65], beat(i, m, G) { const at = bodyAt(m, 1); if (i === 0) { ringAt(G, at, 3, 0xffffff, 0x56c8ff, 0.5); snd(G, 'saber_on', at, { gain: 0.5, rate: 1.6 }); } else { for (let j = 0; j < 3; j++) G.fx.arc(at.clone().add(V().set((j - 1) * 0.6, 0.4 * j, 0.3)), at.clone().add(V().set((1 - j) * 1.8, 0.8 - j * 0.6, -0.2)), 0x9ad8ff); flashAt(G, at, 0xffffff, 0x56c8ff, 2.2); snd(G, 'slash', at, { gain: 0.5, rate: 1.4 + i * 0.2 }); } } },
    (k) => ({ s: [K(k, [[0, 0.5], [0.35, 0.8], [0.5, 0.1]]), K(k, [[0, 0.4], [0.5, -0.5]])], R: K(k, [[0, [-1.0, -0.4, -1.5]], [0.35, [-0.9, -0.5, -1.7]], [0.5, [-1.5, 1.5, -0.1]], [0.7, [-1.2, 1.3, -0.2]]]), L: K(k, [[0, [-1.0, 0.4, -1.5]], [0.35, [-0.9, 0.5, -1.7]], [0.5, [-1.5, -1.5, -0.1]], [0.7, [-1.2, -1.3, -0.2]]]), tL: K(k, [[0, [-0.9, 1.2, 0]], [0.5, [-1.1, 0.5, 0]]]), tR: K(k, [[0, [0.5, 1.5, 0]], [0.5, [0.7, 0.4, 0]]]), h: [0.15, 0], d: K(k, [[0, 0.3], [0.5, 0.18]]) }));

  // =====================================================================================================
  // Thép
  // =====================================================================================================
  def('invuln', 0.8, { gun: true, beats: [0.45], beat(i, m, G) { const at = bodyAt(m, 1); G.fx.pop(at, 1.3, [0xffc040, 0xfff0a0]); ringAt(G, at, 2.4, 0xffffff, 0xffc040, 0.6); snd(G, 'clank', at, { gain: 0.8, rate: 0.7 }); } },
    (k) => ({ s: [K(k, [[0, 0.2], [0.4, 0.3], [0.5, -0.15]]), 0], R: K(k, [[0, [-1.1, -0.3, -2.1]], [0.4, [-1.0, -0.4, -2.2]], [0.5, [-0.4, 1.0, -1.9]]]), L: K(k, [[0, [-1.1, 0.3, -2.1]], [0.4, [-1.0, 0.4, -2.2]], [0.5, [-0.4, -1.0, -1.9]]]), h: [-0.1, 0], tL: [-0.5, 0.9, 0], tR: [-0.5, 0.9, 0], d: 0.18 }));

  def('charge', 0.6, { beats: [0.1, 0.3], beat(i, m, G) { const at = bodyAt(m, 0.15); G.fx.burst(at, 12, [0x8a8478, 0x6e6a64, 0xffd890], { speed: 3.5, size: 0.16, life: 0.7 }); ringAt(G, bodyAt(m, 0.9), 1.4, 0xffffff, 0xffc040, 0.3); } },
    (k) => ({ s: [0.85, 0.45], R: [1.0, 0.3, -0.5], L: [-1.0, 0.1, -1.7], h: [-0.35, -0.3], tL: [-1.1, 0.6, 0], tR: [0.9, 0.9, 0], d: 0.14 }));

  def('quake', 1.3, { beats: [0.3], beat(i, m, G) { const at = bodyAt(m, 0.1); G.fx.burst(at, 40, [0x6e6a64, 0x8a8478, 0x4a4640, 0xffc040], { speed: 7, size: 0.18, life: 1 }); flashAt(G, ahead(m, 0.7, 0.1), 0xffffff, 0xffc040, 2.6); ringAt(G, at, 6, 0xffffff, 0xffc040, 0.5); } },
    (k) => ({ s: K(k, [[0, [-0.5, 0]], [0.18, [-0.5, 0]], [0.3, [1.0, 0]], [0.7, [0.9, 0]], [0.95, [0, 0]]]), R: K(k, [[0, [-2.9, 0.1, -0.2]], [0.18, [-2.9, 0.1, -0.2]], [0.3, [-0.7, 0.05, -0.3]], [0.7, [-0.7, 0.05, -0.3]]]), L: K(k, [[0, [-2.9, -0.1, -0.2]], [0.18, [-2.9, -0.1, -0.2]], [0.3, [-0.7, -0.05, -0.3]], [0.7, [-0.7, -0.05, -0.3]]]), h: [K(k, [[0, -0.3], [0.3, 0.3]]), 0], tL: K(k, [[0, [-0.3, 0.5, 0]], [0.3, [-1.0, 1.4, 0]]]), tR: K(k, [[0, [0.2, 0.5, 0]], [0.3, [-0.8, 1.4, 0]]]), d: K(k, [[0, 0.05], [0.3, 0.3], [0.7, 0.3], [0.95, 0.05]]) }));

  // =====================================================================================================
  // Y Tá
  // =====================================================================================================
  def('heal', 0.9, { prop: 'vial', hand: 'R', beats: [0.4], beat(i, m, G) { const at = bodyAt(m, 1.1); G.fx.pop(at, 1.1, [0x60e070, 0xc0ffc0]); ringAt(G, bodyAt(m, 0.1), 3.2, 0xffffff, 0x60e070, 0.7); for (let j = 0; j < 4; j++) G.fx.puff(at.clone().add(V().set((j % 2 ? 1 : -1) * 0.5, 0.2 + j * 0.28, 0.2)), { glow: true, vel: V().set(0, 1.8, 0), s0: 0.35, s1: 0.08, life: 0.9, c0: 0xffffff, c1: 0x60e070, a0: 1.1, spin: 0 }); } },
    (k) => ({ s: [K(k, [[0, 0.1], [0.4, -0.2]]), 0], R: K(k, [[0, [-1.2, 0.2, -2.2]], [0.35, [-2.4, 0.3, -0.5]], [0.55, [-2.5, 0.9, -0.3]]]), L: K(k, [[0, [-0.5, -0.3, -0.5]], [0.4, [-0.6, -0.8, -0.3]], [0.55, [-0.6, -1.2, -0.3]]]), h: [K(k, [[0, 0.1], [0.4, -0.3]]), 0], d: 0.05 }));

  def('dart', 0.6, { prop: 'syringe', hand: 'R', beats: [0.25], beat(i, m, G) { sparks(G, ahead(m, 0.9, 1.4), [0x9aff40, 0xffffff, 0x60e070], 8); } },
    (k) => ({ s: [0.15, K(k, [[0, 0.7], [0.3, -0.5]])], R: K(k, [[0, [0.8, 0.3, -0.5]], [0.25, [-1.9, 0.1, -0.2]], [0.6, [-1.5, 0.1, -0.2]]]), L: [-1.4, -0.3, -0.3], h: [-0.1, 0], tL: [-0.6, 0.4, 0], tR: [0.4, 0.5, 0], d: 0.06 }));

  def('revive', 1.4, { beats: [0.3, 0.4], beat(i, m, G) { const at = bodyAt(m, 0.1); if (i === 0) { G.fx.pop(bodyAt(m, 1.2), 2, [0xc0ffc0, 0x60e070]); for (let j = 0; j < 14; j++) G.fx.puff(at.clone().setY(at.y + j * 0.7), { glow: true, s0: 1.6, s1: 0.5, life: 0.9, c0: 0xe0ffe0, c1: 0x60e070, a0: 0.9, spin: 0 }); } else ringAt(G, at, 6, 0xffffff, 0x60e070, 0.9); } },
    (k) => ({ s: [K(k, [[0, 0.2], [0.3, -0.35]]), 0], R: K(k, [[0, [-1.0, 0.2, -1.8]], [0.3, [-2.7, 0.5, -0.1]], [0.75, [-2.7, 0.55, -0.1]]]), L: K(k, [[0, [-1.0, -0.2, -1.8]], [0.3, [-2.7, -0.5, -0.1]], [0.75, [-2.7, -0.55, -0.1]]]), h: [K(k, [[0, 0], [0.3, -0.5]]), 0], tL: [-0.1, 0.1, 0], tR: [-0.1, 0.1, 0] }));

  // =====================================================================================================
  // Mưa Đạn
  // =====================================================================================================
  def('storm', 0.7, { gun: true, beats: [0.28], beat(i, m, G) { const at = bodyAt(m, 1); ringAt(G, at, 3, 0xffffff, 0xff7a30, 0.5); G.fx.burst(at, 18, [0xffd060, 0xff7a30, 0xffffff], { speed: 7, size: 0.08, life: 0.5, grav: 4 }); snd(G, 'rack', at, { gain: 0.5 }); } },
    (k) => ({ s: [K(k, [[0, 0.3], [0.3, -0.2]]), 0], R: K(k, [[0, [-1.3, 0.2, -1.8]], [0.28, [-2.5, 0.6, -0.5]]]), L: K(k, [[0, [-1.0, -0.2, -1.8]], [0.28, [-2.5, -0.6, -0.5]]]), h: [K(k, [[0, 0.1], [0.3, -0.35]]), 0], tL: [-0.4, 0.8, 0], tR: [-0.4, 0.8, 0], d: 0.15 }));

  def('cluster', 0.65, { prop: 'grenade', hand: 'R', beats: [0.18], beat(i, m, G) { snd(G, 'clank', handAt(m, 'L'), { gain: 0.4, rate: 2 }); sparks(G, handAt(m, 'R'), [0xffd060, 0xffffff], 5); } },
    (k) => ({ s: [K(k, [[0, 0.1], [0.3, 0.5]]), K(k, [[0, 0.5], [0.3, -0.5]])], R: K(k, [[0, [-1.3, 0.2, -1.7]], [0.18, [-3.2, 0.3, -0.6]], [0.45, [-0.9, 0.1, -0.2]]]), L: K(k, [[0, [-1.2, 0.1, -1.8]], [0.3, [-1.4, -0.5, -0.4]]]), h: [0, 0], tL: [-0.7, 0.5, 0], tR: [0.5, 0.5, 0], d: 0.08 }));

  def('drones', 1.3, { gun: true, beats: [0.4], beat(i, m, G) { for (const side of ['L', 'R']) { const at = handAt(m, side); G.fx.pop(at, 0.7, [0xff7a30, 0xffd060]); } snd(G, 'rack', bodyAt(m, 1.6), { gain: 0.7, rate: 0.8 }); } },
    (k) => ({ s: [K(k, [[0, 0.1], [0.3, -0.35], [0.5, 0.25]]), 0], R: K(k, [[0, [-1.2, 0.2, -1.2]], [0.3, [-2.9, 0.4, -0.2]], [0.45, [-0.5, 0.45, -2.4]]]), L: K(k, [[0, [-1.2, -0.2, -1.2]], [0.3, [-2.9, -0.4, -0.2]], [0.45, [-0.5, -0.45, -2.4]]]), h: [K(k, [[0, 0], [0.3, -0.4], [0.5, 0.1]]), 0], tL: [-0.3, 0.6, 0], tR: [-0.3, 0.6, 0], d: 0.1 }));

  // =====================================================================================================
  // Bóng
  // =====================================================================================================
  def('blink', 0.5, { gun: true, beats: [0.15], beat(i, m, G) { G.fx.burst(bodyAt(m, 0.9), 14, [0x8a40ff, 0xc080ff, 0x2a1a4a], { speed: 3, size: 0.12, life: 0.6, grav: -1 }); flashAt(G, bodyAt(m, 1), 0xffffff, 0x8a40ff, 1.6); } },
    (k) => ({ s: [0.3, 0], R: [-1.2, -0.45, -1.9], L: [-1.2, 0.45, -1.9], h: [0.3, 0], tL: [-1.1, 1.7, 0], tR: [-1.1, 1.7, 0], d: 0.3 }));

  def('shuriken', 0.55, { prop: 'star', hand: 'R', beats: [0.22], beat(i, m, G) { const at = handAt(m, 'R'); sparks(G, at, [0xd8c8ff, 0xffffff, 0x8a40e0], 8); G.fx.arc(at, ahead(m, 2.2, 1.3), 0xb090ff); } },
    (k) => ({ s: [0.15, K(k, [[0, 0.7], [0.25, -0.6]])], R: K(k, [[0, [0.4, 0.9, -0.5]], [0.22, [-1.65, 0.15, -0.15]], [0.55, [-1.4, 0.1, -0.2]]]), L: [0.5, -0.8, -0.5], h: [0, 0], tL: [-0.6, 0.6, 0], tR: [0.5, 0.5, 0], d: 0.1 }));

  def('vanish', 1.1, { gun: true, beats: [0.4], beat(i, m, G) { const at = bodyAt(m, 1); G.fx.burst(at, 30, [0x8a40ff, 0x2a1a4a, 0xc080ff], { speed: 5, size: 0.2, life: 0.9, grav: -1 }); ringAt(G, bodyAt(m, 0.1), 3, 0xffffff, 0x8a40ff, 0.5); flashAt(G, at, 0xffffff, 0x8a40ff, 3); } },
    (k) => ({ s: K(k, [[0, [0.5, 0]], [0.35, [0.7, 0]], [0.5, [-0.15, 0]]]), R: K(k, [[0, [-2.0, -0.55, -2.3]], [0.38, [-2.0, -0.55, -2.3]], [0.52, [-0.9, 1.3, -0.2]]]), L: K(k, [[0, [-2.0, 0.55, -2.3]], [0.38, [-2.0, 0.55, -2.3]], [0.52, [-0.9, -1.3, -0.2]]]), h: [K(k, [[0, 0.3], [0.5, -0.2]]), 0], tL: K(k, [[0, [-0.9, 1.4, 0]], [0.5, [-0.3, 0.5, 0]]]), tR: K(k, [[0, [-0.9, 1.4, 0]], [0.5, [-0.3, 0.5, 0]]]), d: K(k, [[0, 0.28], [0.5, 0.1]]) }));

  // =====================================================================================================
  // Pháo Thủ
  // =====================================================================================================
  def('strike', 1.0, { prop: 'radio', hand: 'R', beats: [0.3, 0.6], beat(i, m, G) { if (i === 0) snd(G, 'marker', handAt(m, 'R'), { gain: 0.5, rate: 1.4 }); else { const t = ahead(m, 4, 0); ringAt(G, t, 4, 0xffffff, 0xff3a2a, 0.5); G.fx.pop(handAt(m, 'L'), 0.6, [0xff3a2a, 0xffd060]); } } },
    (k) => ({ s: [0.1, K(k, [[0, 0], [0.5, -0.25]])], R: K(k, [[0, [-1.4, 0.35, -2.3]], [0.55, [-1.4, 0.35, -2.4]]]), L: K(k, [[0, [-0.3, -0.2, -0.4]], [0.45, [-1.75, -0.1, -0.1]]]), h: [K(k, [[0, 0], [0.5, -0.2]]), K(k, [[0, 0.1], [0.5, 0.2]])], tL: [-0.3, 0.3, 0], tR: [0.3, 0.3, 0] }));

  def('mine', 0.7, { prop: 'mine', hand: 'R', beats: [0.3], beat(i, m, G) { const at = ahead(m, 1.3, 0.05); G.fx.burst(at, 10, [0x6a645c, 0x8a8478], { speed: 2.5, size: 0.1, life: 0.5 }); sparks(G, at.setY(at.y + 0.1), [0xff5a3a, 0xffffff], 5); snd(G, 'clank', at, { gain: 0.4, rate: 1.5 }); } },
    (k) => ({ s: [K(k, [[0, 0.4], [0.3, 0.6]]), K(k, [[0, -0.2], [0.3, 0.25]])], R: K(k, [[0, [0.3, 0.2, -0.5]], [0.3, [-1.1, 0.1, -0.35]], [0.6, [-0.9, 0.1, -0.3]]]), L: [0.2, -0.4, -0.5], h: [0.2, 0], tL: [-1.2, 1.5, 0], tR: [0.1, 1.7, 0], d: 0.3 }));

  def('barrage', 1.5, { prop: 'radio', hand: 'L', beats: [0.3, 0.5, 0.7, 0.9], beat(i, m, G) { const at = handAt(m, 'R').addScaledVector(fwdOf(m), 1); if (i === 0) snd(G, 'marker', at, { gain: 0.6, rate: 1.2 }); const p = ahead(m, 5 + i * 5, 0.1); G.fx.pop(p, 0.6, [0xff3a2a, 0xffd060]); ringAt(G, p, 3, 0xffffff, 0xff3a2a, 0.4); } },
    (k) => ({ s: [0.1, K(k, [[0, 0], [0.5, -0.3]])], R: K(k, [[0, [-0.4, 0.3, -0.4]], [0.3, [-2.1, 0.2, -0.1]], [0.95, [-1.55, 0.2, -0.1]]]), L: K(k, [[0, [-1.4, -0.3, -2.3]], [0.95, [-1.4, -0.3, -2.4]]]), h: [-0.1, K(k, [[0, 0], [0.5, 0.3]])], tL: [-0.7, 0.5, 0], tR: [0.5, 0.5, 0], d: 0.08 }));

  // =====================================================================================================
  // Băng
  // =====================================================================================================
  def('freeze', 0.9, { gun: true, beats: [0.3, 0.45], beat(i, m, G) { const at = bodyAt(m, 0.1); if (i === 0) { G.fx.burst(ahead(m, 0.6, 0.1), 20, [0xbfefff, 0x60d8ff, 0xffffff], { speed: 3, size: 0.12, life: 0.7 }); snd(G, 'clank', at, { gain: 0.6, rate: 1.8 }); } else { ringAt(G, at, 9, 0xffffff, 0x60d8ff, 0.8); G.fx.pop(bodyAt(m, 0.4), 1.4, [0xbfefff, 0x60d8ff]); } } },
    (k) => ({ s: K(k, [[0, [0.5, 0]], [0.28, [1.1, 0]], [0.5, [1.1, 0]], [0.62, [-0.15, 0]]]), R: K(k, [[0, [-0.6, 0.2, -0.5]], [0.28, [-1.1, 0.1, -0.05]], [0.5, [-1.1, 0.1, -0.05]], [0.62, [-1.3, 1.4, -0.1]]]), L: K(k, [[0, [-0.6, -0.2, -0.5]], [0.28, [-1.1, -0.1, -0.05]], [0.5, [-1.1, -0.1, -0.05]], [0.62, [-1.3, -1.4, -0.1]]]), h: [0.2, 0], tL: K(k, [[0, [-0.6, 0.8, 0]], [0.28, [-1.3, 1.6, 0]], [0.55, [-1.3, 1.6, 0]], [0.65, [-0.1, 0.2, 0]]]), tR: K(k, [[0, [-0.6, 0.8, 0]], [0.28, [0.0, 1.5, 0]], [0.55, [0.0, 1.5, 0]], [0.65, [-0.1, 0.2, 0]]]), d: K(k, [[0, 0.1], [0.28, 0.3], [0.55, 0.3], [0.65, 0.05]]) }));

  def('lance', 0.55, { gun: true, beats: [0.2], beat(i, m, G) { const at = handAt(m, 'R').addScaledVector(fwdOf(m), 0.6); flashAt(G, at, 0xffffff, 0x60c8ff, 2); G.fx.burst(at, 14, [0xdff6ff, 0x9ad8ff, 0xffffff], { speed: 5, size: 0.09, life: 0.5 }); } },
    (k) => ({ s: [0.15, K(k, [[0, 0.5], [0.2, -0.45]])], R: K(k, [[0, [-1.2, 0.1, -1.9]], [0.2, [-1.55, 0.05, -0.05]]]), L: K(k, [[0, [-1.4, -0.3, -0.4]], [0.2, [0.5, -0.6, -0.3]]]), h: [0, 0], tL: [-0.8, 0.5, 0], tR: [0.6, 0.6, 0], d: 0.1 }));

  def('blizzard', 1.5, { gun: true, beats: [0.3, 0.55], beat(i, m, G) { const at = bodyAt(m, 0.15); ringAt(G, at, 8 + i * 4, 0xffffff, 0x60d8ff, 0.9); G.fx.burst(bodyAt(m, 1.2), 30, [0xffffff, 0xbfe8ff, 0x60d8ff], { speed: 8, size: 0.1, life: 1.2, grav: 1 }); } },
    (k) => ({ by: wrap(sm(k, 0.15, 0.85) * 4 * PI), s: [-0.15, 0], R: [-2.5, 0.9, -0.2], L: [-2.5, -0.9, -0.2], h: [-0.35, 0], tL: [-0.2, 0.4, 0], tR: [-0.2, 0.4, 0], d: 0.05 }));

  // =====================================================================================================
  // Hoả
  // =====================================================================================================
  def('molotov', 0.7, { prop: 'bottle', hand: 'R', beats: [0.14], beat(i, m, G) { const at = handAt(m, 'R'); flashAt(G, at, 0xffe080, 0xff5a10, 1.2); G.fx.burst(at, 8, [0xffd060, 0xff8a20], { speed: 2.5, size: 0.06, life: 0.5, grav: -2 }); } },
    (k) => ({ s: [K(k, [[0, 0.1], [0.3, 0.5]]), K(k, [[0, 0.4], [0.3, -0.5]])], R: K(k, [[0, [-1.4, 0.2, -1.6]], [0.18, [-3.1, 0.3, -0.6]], [0.45, [-0.9, 0.1, -0.2]]]), L: K(k, [[0, [-1.3, -0.1, -1.7]], [0.3, [-1.3, -0.6, -0.5]]]), tL: [-0.7, 0.5, 0], tR: [0.5, 0.5, 0], d: 0.08 }));

  def('rocketjump', 0.6, { gun: true, beats: [0.05, 0.3], beat(i, m, G) { const at = bodyAt(m, 0.05); if (i === 0) { G.fx.burst(at, 16, [0xffd060, 0xff6a20, 0x8a8a8a], { speed: 5, size: 0.14, life: 0.7 }); } else { flashAt(G, at, 0xffffff, 0xff6a20, 3); ringAt(G, at, 3, 0xffe080, 0xff3a10, 0.4); } } },
    (k) => ({ s: K(k, [[0, [0.6, 0]], [0.3, [-0.2, 0]]]), R: K(k, [[0, [0.7, 0.3, -0.3]], [0.3, [-2.6, 0.5, -0.2]]]), L: K(k, [[0, [0.7, -0.3, -0.3]], [0.3, [-2.6, -0.5, -0.2]]]), h: [K(k, [[0, 0.2], [0.3, -0.4]]), 0], tL: K(k, [[0, [-1.1, 1.7, 0]], [0.3, [-0.2, 0.2, 0.6]]]), tR: K(k, [[0, [-1.1, 1.7, 0]], [0.3, [0.3, 0.6, 0.6]]]), d: K(k, [[0, 0.3], [0.3, 0]]) }));

  def('dragon', 1.5, { gun: true, beats: [0.3, 0.45, 0.6, 0.75], beat(i, m, G) { m.root.updateMatrixWorld(true); const head = m.head.getWorldPosition(V()).setY(m.head.getWorldPosition(tmp).y + 0.25); const f = fwdOf(m); if (i === 0) ringAt(G, head, 3, 0xffffff, 0xff6a20, 0.4); for (let j = 0; j < 5; j++) G.fx.puff(head.clone().addScaledVector(f, 0.4), { glow: true, vel: f.clone().multiplyScalar(8 + j * 2).add(V().set(0, 0.5, 0)), drag: 1.2, s0: 0.5, s1: 1.8, life: 0.7, c0: 0xffe080, c1: 0xff3a10, a0: 1, spin: 0 }); } },
    (k) => ({ s: K(k, [[0, [-0.4, 0]], [0.25, [-0.5, 0]], [0.35, [0.3, 0]]]), R: K(k, [[0, [-0.4, 1.0, -0.6]], [0.3, [0.2, 1.3, -0.3]]]), L: K(k, [[0, [-0.4, -1.0, -0.6]], [0.3, [0.2, -1.3, -0.3]]]), h: [K(k, [[0, -0.5], [0.25, -0.6], [0.35, -0.1]]), 0], tL: [-0.5, 0.6, 0], tR: [0.3, 0.6, 0], d: 0.1 }));

  // =====================================================================================================
  // Sấm
  // =====================================================================================================
  def('orb', 0.8, { gun: true, beats: [0.2, 0.4], beat(i, m, G) { const a = handAt(m, 'L'); const b = handAt(m, 'R'); G.fx.arc(a, b, 0xc8ecff); const mid = a.clone().add(b).multiplyScalar(0.5); if (i === 1) { G.fx.pop(mid, 0.9, [0x9ad8ff, 0xffffff]); snd(G, 'saber_hit', mid, { gain: 0.5, rate: 2.2 }); } else flashAt(G, mid, 0xffffff, 0x5aa8ff, 1.2); } },
    (k) => ({ s: [K(k, [[0, 0.1], [0.4, 0.3]]), 0], R: K(k, [[0, [-1.1, -0.1, -1.8]], [0.3, [-1.2, -0.12, -1.6]], [0.5, [-1.6, 0.0, -0.15]]]), L: K(k, [[0, [-1.1, 0.1, -1.8]], [0.3, [-1.2, 0.12, -1.6]], [0.5, [-1.6, 0.0, -0.15]]]), h: [0.1, 0], tL: [-0.5, 0.5, 0], tR: [0.4, 0.5, 0], d: 0.06 }));

  def('smite', 0.9, { gun: true, beats: [0.3, 0.5], beat(i, m, G) { const h = handAt(m, 'R'); if (i === 0) { G.fx.arc(h, h.clone().add(V().set(0, 6, 0)), 0xe0f0ff); flashAt(G, h, 0xffffff, 0x60a0ff, 1.5); } else { G.fx.arc(h, ahead(m, 5, 0.5), 0xe0f0ff); snd(G, 'saber_hit', h, { gain: 0.6, rate: 2 }); } } },
    (k) => ({ s: [K(k, [[0, -0.1], [0.3, -0.25], [0.5, 0.35]]), K(k, [[0, 0], [0.5, -0.1]])], R: K(k, [[0, [-2.0, 0.3, -0.5]], [0.3, [-2.9, 0.25, -0.1]], [0.5, [-1.45, 0.05, -0.05]]]), L: [-0.9, -0.3, -1.7], h: [K(k, [[0, 0], [0.3, -0.5], [0.5, 0.15]]), 0], tL: [-0.6, 0.5, 0], tR: [0.4, 0.5, 0], d: 0.06 }));

  def('thunder', 1.5, { gun: true, beats: [0.25, 0.4, 0.55, 0.7, 0.85], beat(i, m, G) { for (const side of ['L', 'R']) { const h = handAt(m, side); G.fx.arc(h, h.clone().add(V().set((side === 'L' ? -1 : 1) * 0.8, 6, 0)), 0xe0f0ff); flashAt(G, h, 0xffffff, 0x60a0ff, 1.4); } if (i === 0) snd(G, 'thunder', bodyAt(m, 1), { gain: 0.5 }); } },
    (k) => ({ s: [K(k, [[0, 0.1], [0.25, -0.3]]), 0], R: K(k, [[0, [-1.0, 0.2, -1.5]], [0.25, [-2.8, 0.55, -0.1]]]), L: K(k, [[0, [-1.0, -0.2, -1.5]], [0.25, [-2.8, -0.55, -0.1]]]), h: [K(k, [[0, 0], [0.25, -0.5]]), 0], tL: [-0.3, 0.4, 0], tR: [-0.3, 0.4, 0], d: 0.05 }));

  // =====================================================================================================
  // Độc
  // =====================================================================================================
  def('cloud', 0.65, { prop: 'flask', hand: 'R', beats: [0.2], beat(i, m, G) { const at = handAt(m, 'R'); G.fx.burst(at, 8, [0x9aff40, 0x6a9a30], { speed: 2.5, size: 0.1, life: 0.6, grav: -1 }); flashAt(G, at, 0xe0ffc0, 0x6a9a30, 1); } },
    (k) => ({ s: [K(k, [[0, 0.1], [0.3, 0.5]]), K(k, [[0, 0.4], [0.3, -0.5]])], R: K(k, [[0, [-1.3, 0.2, -1.7]], [0.2, [-3.0, 0.3, -0.6]], [0.45, [-0.9, 0.1, -0.2]]]), L: K(k, [[0, [-1.2, -0.1, -1.7]], [0.3, [-1.3, -0.6, -0.5]]]), tL: [-0.7, 0.5, 0], tR: [0.5, 0.5, 0], d: 0.08 }));

  def('drain', 0.9, { gun: true, beats: [0.2, 0.45], beat(i, m, G) { const c = bodyAt(m, 1.1); if (i === 0) { for (const s of ['L', 'R']) G.fx.arc(handAt(m, s), c, 0x9aff40); } else { G.fx.pop(c, 1.1, [0x9aff40, 0xe0ffc0]); ringAt(G, c, 2.2, 0xffffff, 0x9aff40, 0.4); } } },
    (k) => ({ s: [K(k, [[0, 0.15], [0.25, 0.1], [0.5, -0.25]]), 0], R: K(k, [[0, [-1.5, 0.35, -0.15]], [0.28, [-1.55, 0.35, -0.1]], [0.5, [-0.7, 0.1, -2.2]]]), L: K(k, [[0, [-1.5, -0.35, -0.15]], [0.28, [-1.55, -0.35, -0.1]], [0.5, [-0.7, -0.1, -2.2]]]), h: [0.1, 0], tL: [-0.4, 0.6, 0], tR: [0.3, 0.6, 0], d: 0.1 }));

  def('plague', 1.4, { gun: true, beats: [0.45], beat(i, m, G) { const at = bodyAt(m, 0.1); ringAt(G, at, 8, 0xffffff, 0x9aff40, 0.8); G.fx.burst(bodyAt(m, 1), 40, [0x9aff40, 0x3a8a20, 0xe0ffc0], { speed: 8, size: 0.16, life: 1.1, grav: -1 }); flashAt(G, bodyAt(m, 1), 0xffffff, 0x9aff40, 3); } },
    (k) => ({ s: K(k, [[0, [0.8, 0]], [0.4, [0.95, 0]], [0.52, [-0.3, 0]]]), R: K(k, [[0, [-0.8, -0.3, -2.3]], [0.4, [-0.8, -0.35, -2.3]], [0.52, [-2.4, 1.2, -0.1]]]), L: K(k, [[0, [-0.8, 0.3, -2.3]], [0.4, [-0.8, 0.35, -2.3]], [0.52, [-2.4, -1.2, -0.1]]]), h: [K(k, [[0, 0.3], [0.5, -0.5]]), 0], tL: K(k, [[0, [-0.9, 1.3, 0]], [0.5, [-0.3, 0.5, 0]]]), tR: K(k, [[0, [-0.9, 1.3, 0]], [0.5, [-0.3, 0.5, 0]]]), d: K(k, [[0, 0.25], [0.5, 0.1]]) }));

  // =====================================================================================================
  // Kỹ Sư: kneel and hammer (the host places the turret when the last blow lands)
  // =====================================================================================================
  const HIT = [0.2, 0.34, 0.48, 0.62];
  def('turret', 1.45, { prop: 'hammer', hand: 'R', beats: HIT, beat(i, m, G) { const at = ahead(m, 0.9, 0.05); sparks(G, at.setY(at.y + 0.12), [0xffd060, 0xffffff, 0xff8a20], 12 + i * 3); snd(G, 'clank', at, { gain: 0.7, rate: 0.9 + i * 0.12 }); } },
    (k) => {
      const hit = K(k, [[0, 0], [0.12, 1], [0.2, 0], [0.26, 1], [0.34, 0], [0.4, 1], [0.48, 0], [0.54, 1], [0.62, 0], [0.68, 0.3]]); // 1 = hammer raised
      const stand = sm(k, 0.7, 0.86);
      return { s: [K(k, [[0, 0.5], [0.7, 0.55], [0.9, 0.05]]), K(k, [[0, 0.2], [0.7, 0.2], [0.9, 0]])], R: [-0.95 - hit * 1.35, 0.15, -0.5 - (1 - hit) * 0.6], L: [-1.2, -0.3, -1.2 + 0.2 * hit], h: [0.3 * (1 - stand), 0], tL: [-1.35 + stand * 1.25, 1.35 - stand * 1.2, 0], tR: [0.05 + stand * 0.0, 1.55 - stand * 1.3, 0], d: 0.3 * (1 - stand) };
    });

  def('repair', 0.9, { prop: 'wrench', hand: 'R', beats: [0.22, 0.34, 0.46, 0.6], beat(i, m, G) { const at = handAt(m, 'R').addScaledVector(fwdOf(m), 0.2); sparks(G, at, [0x9ad8ff, 0xffffff, 0xffb020], 8); snd(G, 'clank', at, { gain: 0.5, rate: 1.4 + (i % 2) * 0.3 }); if (i === 3) { ringAt(G, bodyAt(m, 0.1), 5, 0xffffff, 0x3a7ad8, 0.6); G.fx.pop(bodyAt(m, 1.1), 1, [0x9ad8ff, 0xffffff]); } } },
    (k) => { const t = Math.sin(k * 38) * 0.18 * (k < 0.65 ? 1 : 0); return { s: [K(k, [[0, 0.2], [0.2, 0.4], [0.65, 0.4], [0.8, 0.0]]), 0], R: K(k, [[0, [-0.8, 0.1, -1.4]], [0.2, [-1.15, 0.0, -1.35]], [0.65, [-1.15, 0, -1.35]], [0.78, [-1.5, 0.7, -0.2]]]).map((v, i) => (i === 2 ? v + t : v)), L: K(k, [[0, [-0.8, -0.1, -1.4]], [0.2, [-1.2, 0.05, -1.5]], [0.65, [-1.2, 0.05, -1.5]], [0.78, [-1.3, -0.7, -0.2]]]), h: [0.25, 0], tL: [-0.5, 0.7, 0], tR: [0.2, 0.7, 0], d: 0.14 }; });

  def('artillery', 1.4, { prop: 'hammer', hand: 'R', beats: [0.3, 0.45, 0.6, 0.78], beat(i, m, G) { const side = V().set(Math.cos(m.root.rotation.y), 0, -Math.sin(m.root.rotation.y)); const at = bodyAt(m, 0.05).addScaledVector(side, -1.8).addScaledVector(fwdOf(m), 0.8); if (i < 3) { sparks(G, at.setY(at.y + 0.9), [0xffd060, 0xffffff, 0xff8a20], 14); snd(G, 'clank', at, { gain: 0.8, rate: 0.7 + i * 0.1 }); } else { ringAt(G, at, 5, 0xffffff, 0xffb020, 0.6); G.fx.pop(at.setY(at.y + 1.2), 1.6, [0xffb020, 0xffffff]); } } },
    (k) => {
      const hit = K(k, [[0, 0], [0.14, 1], [0.3, 0], [0.38, 1], [0.45, 0], [0.53, 1], [0.6, 0], [0.7, 1], [0.78, 0.2]]);
      const fin = sm(k, 0.78, 0.9);
      return { s: [0.2, K(k, [[0, 0], [0.12, -0.6]])], R: [-0.9 - hit * 1.5 - fin * 0.9, 0.3 + fin * 0.2, -0.5 - (1 - hit) * 0.5 + fin * 0.4], L: [-1.3, -0.5, -1.2], h: [0.15, K(k, [[0, 0], [0.12, 0.5]])], tL: [-0.6, 0.7, 0], tR: [0.4, 0.6, 0], d: 0.12 };
    });
  // =====================================================================================================
  // Sói: a crouch and a spring with the claws out; a howl with the head thrown back; the change into the beast
  // =====================================================================================================
  def('lunge', 0.6, { gun: true, beats: [0.08, 0.7], beat(i, m, G) { const at = bodyAt(m, 0.15); if (i === 0) { G.fx.burst(at, 14, [0x8a7a5a, 0x6a5a40, 0xc8b890], { speed: 4, size: 0.12, life: 0.6, grav: 8 }); ringAt(G, at, 1.8, 0xfff0d0, 0xd08a40, 0.35); } else flashAt(G, ahead(m, 0.6, 1.1), 0xffffff, 0xc0281e, 1.2); } },
    (k) => ({ s: [K(k, [[0, 0.55], [0.15, 0.7], [0.4, 0.25], [0.75, 0.6]]), 0], R: K(k, [[0, [-0.4, 0.5, -1.5]], [0.2, [-2.6, 0.5, -0.4]], [0.7, [-1.2, 0.2, -0.3]]]), L: K(k, [[0, [-0.4, -0.5, -1.5]], [0.2, [-2.6, -0.5, -0.4]], [0.7, [-1.2, -0.2, -0.3]]]), h: [K(k, [[0, 0.3], [0.3, -0.2]]), 0], tL: K(k, [[0, [-1.2, 1.6, 0]], [0.2, [0.2, 0.2, 0.5]], [0.7, [-1.0, 1.3, 0]]]), tR: K(k, [[0, [-1.2, 1.6, 0]], [0.2, [0.5, 0.3, 0.5]], [0.7, [-0.6, 1.0, 0]]]), d: K(k, [[0, 0.3], [0.2, 0], [0.75, 0.25]]) }));

  def('howl', 1.0, { gun: true, beats: [0.22, 0.45], beat(i, m, G) { m.root.updateMatrixWorld(true); const h = m.head.getWorldPosition(V()); if (i === 0) { flashAt(G, h, 0xffffff, 0x7ab0ff, 1.6); for (let j = 0; j < 6; j++) G.fx.puff(h.clone().setY(h.y + 0.3 + j * 0.2), { glow: true, vel: V().set(0, 2.5, 0), s0: 0.6, s1: 0.1, life: 0.5, c0: 0xffffff, c1: 0x7ab0ff, a0: 0.9, spin: 0, delay: j * 0.03 }); } else ringAt(G, bodyAt(m, 0.1), 4, 0xffffff, 0x7ab0ff, 0.5); } },
    (k) => ({ s: [K(k, [[0, 0.35], [0.2, -0.45], [0.8, -0.4], [1, 0]]), 0], R: K(k, [[0, [-0.8, 0.2, -1.6]], [0.22, [-0.5, 1.1, -0.4]], [0.8, [-0.5, 1.15, -0.4]]]), L: K(k, [[0, [-0.8, -0.2, -1.6]], [0.22, [-0.5, -1.1, -0.4]], [0.8, [-0.5, -1.15, -0.4]]]), h: [K(k, [[0, 0.3], [0.22, -1.0], [0.8, -0.95], [1, -0.2]]), 0], tL: [-0.3, 0.4, 0], tR: [0.2, 0.4, 0], d: K(k, [[0, 0.2], [0.22, 0.02]]) }));

  def('werewolf', 1.3, { beats: [0.3, 0.42, 0.55], beat(i, m, G) { const at = bodyAt(m, 1.0); if (i === 0) { G.fx.burst(at, 24, [0x76644e, 0x3e3428, 0xb4a48a], { speed: 4, size: 0.12, life: 0.9, grav: 3 }); snd(G, 'roar', at, { gain: 0.6, rate: 0.9 }); } else if (i === 1) { flashAt(G, at, 0xffffff, 0xff6a20, 3); ringAt(G, bodyAt(m, 0.1), 6, 0xffe0b0, 0xff6a20, 0.6); } else G.fx.burst(at, 30, [0xff9a40, 0xffd090, 0x76644e], { speed: 7, size: 0.1, life: 0.8, grav: 2 }); } },
    (k) => ({ s: K(k, [[0, [0.2, 0]], [0.3, [0.9, 0]], [0.42, [-0.45, 0]], [0.85, [-0.35, 0]], [1, [0, 0]]]), R: K(k, [[0, [-0.8, -0.2, -2.2]], [0.3, [-1.0, -0.6, -2.4]], [0.42, [-1.6, 1.4, -0.3]], [0.85, [-1.5, 1.35, -0.35]]]), L: K(k, [[0, [-0.8, 0.2, -2.2]], [0.3, [-1.0, 0.6, -2.4]], [0.42, [-1.6, -1.4, -0.3]], [0.85, [-1.5, -1.35, -0.35]]]), h: [K(k, [[0, 0.2], [0.3, 0.5], [0.42, -0.9], [0.85, -0.8], [1, -0.1]]), 0], tL: K(k, [[0, [-0.4, 0.6, 0]], [0.3, [-1.0, 1.4, 0]], [0.42, [-0.3, 0.3, 0]]]), tR: K(k, [[0, [-0.4, 0.6, 0]], [0.3, [-1.0, 1.4, 0]], [0.42, [0.3, 0.3, 0]]]), d: K(k, [[0, 0.1], [0.3, 0.32], [0.42, 0.02]]) }));

  // =====================================================================================================
  // Nhện Đồng: the wrist bow fires up at the hook; a shot then a hard pull back; the net slung out with both arms
  // =====================================================================================================
  const webPuff = (G, at) => { G.fx.puff(at, { glow: true, s0: 0.5, s1: 1.4, life: 0.18, c0: 0xffffff, c1: 0xffc880, a0: 1.1, spin: 0 }); G.fx.burst(at, 8, [0xffffff, 0xe8e8f0], { speed: 2.5, size: 0.05, life: 0.4, grav: 3 }); };
  def('swing', 0.65, { gun: true, beats: [0.12], beat(i, m, G) { webPuff(G, handAt(m, 'R')); } },
    (k) => ({ s: [K(k, [[0, 0.1], [0.12, -0.25], [0.7, -0.1]]), K(k, [[0, 0], [0.12, -0.2]])], R: K(k, [[0, [-1.6, 0.2, -0.3]], [0.12, [-2.9, 0.15, -0.05]], [0.7, [-2.7, 0.2, -0.2]]]), L: K(k, [[0, [-0.6, -0.3, -1.4]], [0.2, [-0.9, -0.9, -0.6]]]), h: [K(k, [[0, 0], [0.15, -0.5]]), 0], tL: K(k, [[0, [-0.4, 0.6, 0]], [0.3, [-1.1, 1.4, 0]]]), tR: K(k, [[0, [-0.2, 0.4, 0]], [0.3, [0.3, 0.9, 0]]]), d: 0.06 }));

  def('yank', 0.75, { gun: true, beats: [0.1, 0.42], beat(i, m, G) { const h = handAt(m, 'R'); if (i === 0) webPuff(G, h); else { sparks(G, h, [0xffffff, 0xffc880, 0xe8e8f0], 8); snd(G, 'heavy', h, { gain: 0.5, rate: 1.6 }); } } },
    (k) => ({ s: [K(k, [[0, 0.2], [0.1, 0.25], [0.42, -0.35], [0.8, -0.1]]), K(k, [[0, 0.3], [0.1, -0.2], [0.42, 0.5]])], R: K(k, [[0, [-1.5, 0.1, -0.1]], [0.1, [-1.6, 0.05, -0.05]], [0.42, [-0.5, 0.45, -2.0]], [0.8, [-0.8, 0.3, -1.4]]]), L: K(k, [[0, [-0.8, -0.3, -1.4]], [0.42, [-1.3, -0.5, -0.4]]]), h: [0.05, 0], tL: K(k, [[0, [-0.6, 0.5, 0]], [0.42, [-0.1, 0.2, 0]]]), tR: K(k, [[0, [0.4, 0.4, 0]], [0.42, [-0.9, 1.0, 0]]]), d: K(k, [[0, 0.05], [0.42, 0.2]]) }));

  def('webnet', 1.3, { gun: true, beats: [0.3, 0.42], beat(i, m, G) { if (i === 0) { for (const sd of ['L', 'R']) webPuff(G, handAt(m, sd)); } else { const at = ahead(m, 2, 1.3); flashAt(G, at, 0xffffff, 0xffb860, 2.2); snd(G, 'swipe', at, { gain: 0.8, rate: 0.6 }); } } },
    (k) => ({ s: K(k, [[0, [0.1, 0]], [0.28, [-0.4, 0]], [0.42, [0.55, 0]], [0.85, [0.4, 0]], [1, [0, 0]]]), R: K(k, [[0, [-1.0, 0.4, -1.0]], [0.28, [-0.3, 1.2, -0.9]], [0.42, [-1.75, 0.75, -0.05]], [0.85, [-1.6, 0.7, -0.1]]]), L: K(k, [[0, [-1.0, -0.4, -1.0]], [0.28, [-0.3, -1.2, -0.9]], [0.42, [-1.75, -0.75, -0.05]], [0.85, [-1.6, -0.7, -0.1]]]), h: [K(k, [[0, 0], [0.28, -0.3], [0.42, 0.2]]), 0], tL: K(k, [[0, [-0.3, 0.5, 0]], [0.42, [-0.9, 0.7, 0]]]), tR: K(k, [[0, [0.2, 0.5, 0]], [0.42, [0.6, 0.6, 0]]]), d: K(k, [[0, 0.06], [0.42, 0.18]]) }));
})();
