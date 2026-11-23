// Three beats for every skill a beast casts: the wind-up (gồng: light and motes drawn into the caster, a glow building
// on the floor), the impact (bung: rays, shards thrown out, smoke, a noisy shock front, a mark burnt into the floor, a
// short glow of light) and the after-image (dư âm: smoke thinning, embers or frost mist, the mark fading).
// What a beat is made of comes from three tables: VOICE (the material of a beast's skills: earth cracks and dust, fire
// scorches and embers, ice frost and mist...), SHAPE (how the impact spreads for each kind of sim event: a burst, a cone,
// a line, a bolt, a dash, a zone, a self buff, a heal) and FORM (what form 2 and form 3 add on top). A recipe is a list
// of steps [primitive, ...args]; sizes and counts scale with the form's tier (fx/palette.js). Nothing here is a flat
// circle: fronts are rays and dust walls, marks are torn decals.
import { skinOf, mixHex } from './palette.js?v=20261122a';
import { createSparks } from './sparks.js?v=20261122a';
import { createDecals, DECAL } from './decals.js?v=20261122a';
const THREE = window.THREE;

// the material of each beast's skills (by beast id and by the id of the human hero it replaced)
const VOICE_OF = {
  tegiap: 'earth', thep: 'earth', nhim: 'ice', mua: 'ice', loc: 'life', yta: 'life', chon: 'wind', gio: 'wind', ech: 'fire', phao: 'fire',
  cu: 'shadow', bong: 'shadow', duoi: 'ice', bang: 'ice', kyda: 'fire', hoa: 'fire', oc: 'poison', doc: 'poison', haily: 'metal', ky: 'metal',
  bosat: 'shock', sam: 'shock', bao: 'shock', soi: 'shock', nhen: 'silk', muc: 'ink',
};
// shard: debris palette (fxmap DEBRIS kinds), spark: sparks kind (0 streak, 1 shard glint, 2 ember), decal: floor mark,
// smoke: [start, end, additive] or null for the skin's own colours, after: the after-image
const VOICE = {
  earth: { shard: 'debris', spark: 1, decal: 'crack', smoke: [0xb8ae98, 0x8a8070, false], after: 'dust' },
  fire: { shard: 'fire', spark: 0, decal: 'scorch', smoke: [0x3a3632, 0x7a746c, false], after: 'embers' },
  ice: { shard: 'ice', spark: 1, decal: 'frost', smoke: [0xe8f6ff, 0xa8c8e0, false], after: 'mist' },
  wind: { shard: 'spark', spark: 0, decal: 'scar', smoke: null, after: 'wisp' },
  shock: { shard: 'spark', spark: 0, decal: 'crack', smoke: [0x3a3a48, 0x6a6a7a, false], after: 'static' },
  life: { shard: 'spark', spark: 2, decal: 'light', smoke: null, after: 'motes' },
  poison: { shard: 'gas', spark: 2, decal: 'ink', smoke: null, after: 'bubbles' },
  ink: { shard: 'void', spark: 2, decal: 'ink', smoke: [0x1a1030, 0x4a3a6a, false], after: 'stars' },
  silk: { shard: 'web', spark: 1, decal: 'scar', smoke: [0xd8d8e0, 0xa8a8b8, false], after: 'threads' },
  shadow: { shard: 'void', spark: 1, decal: 'ink', smoke: [0x2a2038, 0x6a5a82, false], after: 'wisp' },
  metal: { shard: 'metal', spark: 0, decal: 'scorch', smoke: [0x3a3632, 0x7a746c, false], after: 'embers' },
};
const DEBRIS = {
  debris: (s) => [0x8a7a68, 0xb0a088, 0x6a5a48, s.edge], spark: (s) => [s.core, s.edge, s.glow], metal: (s) => [0xc0c8d4, 0x7a8aa0, s.edge],
  ice: (s) => [0xdff4ff, 0x9adcff, s.edge], fire: (s) => [0xffd070, s.edge, s.deep], gas: (s) => [s.core, s.edge, s.deep], web: () => [0xffffff, 0xc0c8e8, 0x98a0c0],
  void: (s) => [s.core, s.edge, s.deep],
};

// Impact per sim event shape. r is the event radius (m), or ~2 for a bolt. Steps:
//   rays n k        crown of light rays out to k*r                 shards n v      debris and glints thrown up at v m/s
//   sparks n v up   streaks thrown out                             smoke n size    a rolling column, the voice's smoke
//   front k         a noisy shock: dust wall and broken dust ring  mark k life     the voice's decal of radius k*r
//   light k life    a short pool of light on the floor             flash size      a local glow (<= 80 ms)
//   pillar h rad    a light column                                 drop h          a beam head falling from the sky
const SHAPE = {
  burst: { bung: [['flash', 2.2], ['rays', 14, 1.1], ['shards', 10, 8], ['sparks', 10, 9, 0.6], ['front', 1], ['light', 1.4, 0.35], ['mark', 0.9, 3.2], ['smoke', 4, 2.4]] },
  cone: { bung: [['rays', 10, 0.8], ['sparks', 12, 10, 0.3], ['smoke', 3, 2.2], ['mark', 0.6, 2.6], ['light', 1, 0.3]] },
  line: { bung: [['sparks', 10, 8, 0.4], ['shards', 6, 7], ['mark', 1, 2.6], ['smoke', 2, 1.8], ['light', 1, 0.3]] },
  bolt: { bung: [['flash', 1.6], ['sparks', 7, 8, 0.5], ['shards', 4, 6], ['light', 0.9, 0.25], ['mark', 0.5, 2]] },
  zone: { bung: [['rays', 12, 1], ['sparks', 8, 6, 0.6], ['smoke', 3, 2.4], ['light', 1.1, 0.5], ['mark', 0.8, 3]] },
  dash: { bung: [['sparks', 10, 8, 0.4], ['shards', 6, 7], ['smoke', 3, 2], ['mark', 1, 2.4]] },
  self: { bung: [['rays', 10, 1], ['sparks', 12, 7, 0.9], ['light', 1.2, 0.45], ['flash', 1.8], ['mark', 0.6, 2.4]] },
  heal: { bung: [['sparks', 6, 4, 1], ['light', 0.9, 0.5], ['mark', 0.5, 2.2]] },
  ult: { bung: [['flash', 2.6], ['rays', 26, 1.2], ['shards', 18, 11], ['sparks', 20, 12, 0.8], ['front', 1.1], ['light', 1.6, 0.6], ['mark', 1, 4.5], ['smoke', 6, 3.4]] },
  // the moment the close-up lets go, at the caster: tall and thick enough to read from the low camera
  release: { bung: [['nova', 34], ['shards', 16, 12], ['smoke', 5, 3], ['light', 2, 0.7], ['mark', 1.1, 4.5]] },
};
// what each form adds to an impact: form 2 a second front of sparks in the hotter colour and a bigger mark, form 3 the
// voice's own signature on top (crystal spikes, a flame column, a tesla crown, a funnel of wind...)
const FORM = {
  2: [['sparks', 10, 11, 0.7, 'core'], ['mark', 1.2, 3.6], ['rays', 8, 1.3, 'core'], ['pillar', 3.6, 0.55]],
  3: [['sparks', 12, 13, 0.8, 'core'], ['mark', 1.35, 4.2], ['rays', 12, 1.5, 'core'], ['sig']],
};
const SIG = {
  earth: [['spikes', 6, 3.2], ['shards', 10, 10]], fire: [['pillar', 6, 0.9], ['embers', 16]], ice: [['spikes', 7, 3.6], ['mist', 8]],
  wind: [['funnel', 18]], shock: [['arcs', 5]], life: [['motes', 16], ['pillar', 7, 0.7]], poison: [['bubbles', 12], ['smoke', 4, 2.8]],
  ink: [['stars', 18], ['funnel', 10]], silk: [['threads', 8]], shadow: [['funnel', 12], ['stars', 10]], metal: [['shards', 12, 11], ['embers', 10]],
};
const AFTER_DELAY = 0.35;

export function createBeats(H, marks) {
  const { G } = H;
  const sparks = createSparks(H); const decals = createDecals(H);
  const V = new THREE.Vector3(); const UP = new THREE.Vector3(0, 1, 0);
  const rnd = (a, b) => a + (b - a) * G.rng.next();
  const reduce = () => !!(window.__G && window.__G.settings && window.__G.settings.reduceFlash);
  // a bolt of light from a to b: short streaks along a jagged path (BZ's arc boxes turn into thick white bars up close)
  function zap(ax, ay, az, bx, by, bz, color, real) {
    const n = 5; let px = ax; let py = ay; let pz = az;
    for (let i = 1; i <= n; i++) {
      const t = i / n; const j = i < n ? 0.35 : 0;
      const x = ax + (bx - ax) * t + rnd(-j, j); const y = ay + (by - ay) * t + rnd(-j, j) * 0.6; const z = az + (bz - az) * t + rnd(-j, j);
      sparks.emit({ x: (px + x) / 2, y: (py + y) / 2, z: (pz + z) / 2, vx: (x - px) * 0.01, vy: (y - py) * 0.01, vz: (z - pz) * 0.01, life: 0.14, w: 0.07, len: Math.hypot(x - px, y - py, z - pz) * 1.1, stretch: 0, color, a: 0.9, real });
      px = x; py = y; pz = z;
    }
  }
  const qual = () => Math.max(0.45, H.quality.particles);
  let puffBudget = 0;
  const queue = []; // { t, real, fn }
  function later(t, fn, real) { queue.push({ t, real: !!real, fn }); }

  // one beat context: where, how big, whose colours
  // c: { x, y, z, r, s: skin, v: voice, real, ang, x2, z2 }
  const P = {
    flash(c, size) { if (reduce()) size *= 0.6; marks.flash(c.x, 0.9, c.z, Math.min(2.6, size * c.s.tier.size), c.s.glow, reduce() ? 0.2 : 0.38); },
    rays(c, n, k, which) { sparks.rays(c.x, 0.25, c.z, n * c.s.tier.count, Math.max(1.2, c.r * k), { colors: [c.s[which || 'edge'], c.s.glow], w: 0.16 * c.s.tier.size, len: 0.25, life: 0.32 * c.s.tier.life, real: c.real, a: 0.85 }); },
    shards(c, n, v) {
      const cols = (DEBRIS[c.v.shard] || DEBRIS.spark)(c.s); const m = Math.max(2, Math.round(n * c.s.tier.count));
      G.fx.burst(V.set(c.x, 0.4, c.z), m, cols, { dir: UP, push: v, speed: 2.5 * c.s.tier.size, grav: 16, life: 1.1, size: 0.22 * c.s.tier.size, bounce: 0.2 });
      sparks.burst(c.x, 0.6, c.z, Math.ceil(m * 0.6), { speed: [v * 0.5, v], up: 0.8, colors: [c.s.core, c.s.edge], kind: 1, w: 0.22 * c.s.tier.size, len: 0.22, stretch: 0.02, life: 0.8, grav: 12, drag: 0.6, real: c.real });
    },
    sparks(c, n, v, up, which) { sparks.burst(c.x, 0.7, c.z, n * c.s.tier.count, { speed: [v * 0.45, v * c.s.tier.size], up, colors: [c.s[which || 'edge'], c.s.core], kind: c.v.spark === 2 ? 2 : 0, w: c.v.spark === 2 ? 0.16 : 0.08, len: 0.2, stretch: 0.07, life: 0.55 * c.s.tier.life, grav: 7, real: c.real }); },
    smoke(c, n, size) {
      const sm = c.v.smoke || [mixHex(c.s.edge, 0xffffff, 0.3), c.s.deep, false]; const N = Math.max(2, Math.round(n * c.s.tier.count * qual())); const sz = size * c.s.tier.size;
      for (let i = 0; i < N && puffBudget-- > 0; i++) G.fx.puff(V.set(c.x + rnd(-0.4, 0.4) * sz * 0.3, 0.3, c.z + rnd(-0.4, 0.4) * sz * 0.3).clone(), { glow: sm[2], vel: new THREE.Vector3(rnd(-0.6, 0.6), rnd(2.4, 3.6), rnd(-0.6, 0.6)), drag: 0.7, s0: sz * 0.35, s1: sz, life: rnd(1.2, 1.7) * c.s.tier.life, delay: i * 0.05, c0: sm[0], c1: sm[1], a0: 0.5 });
    },
    front(c, k) {
      const R = Math.min(6.5, Math.max(1.4, c.r * k)) * (0.85 + 0.15 * c.s.tier.size);
      marks.wall(c.x, c.z, R * 0.2, R, c.s.edge, 0.42, 1.1 * c.s.tier.size, reduce() ? 0.3 : 0.5);
      marks.ring(c.x, c.z, R * 0.25, R, c.s.edge, 0.5, 0.75);
      sparks.rays(c.x, 0.15, c.z, 18 * c.s.tier.count, R, { colors: [c.s.glow, c.s.edge], w: 0.22, len: 0.35, life: 0.42, real: c.real, a: 0.6 });
    },
    mark(c, k, life) {
      const kind = DECAL[c.v.decal] ?? 0; const r = Math.max(0.6, Math.min(6.5, (c.r || 1.5) * k));
      if (c.x2 !== undefined) { const dx = c.x2 - c.x0; const dz = c.z2 - c.z0; const L = Math.hypot(dx, dz) || 1; decals.add({ x: (c.x0 + c.x2) / 2, z: (c.z0 + c.z2) / 2, sx: L / 2, sz: Math.max(0.5, (c.w || 1) * 0.8), rot: Math.atan2(dz, dx), kind: DECAL.scar, color: c.s.deep, glow: c.s.edge, life: life * c.s.tier.life, real: c.real }); return; }
      decals.add({ x: c.x, z: c.z, r, kind, color: c.v.decal === 'frost' ? 0xe8f6ff : c.s.deep, glow: kind === DECAL.crack || kind === DECAL.scorch ? c.s.edge : c.s.glow, life: life * c.s.tier.life, real: c.real });
    },
    light(c, k, life) { decals.add({ x: c.x, z: c.z, r: Math.max(1.2, Math.min(7, (c.r || 1.5) * k)), kind: DECAL.light, glow: c.s.glow, life: life * (reduce() ? 0.7 : 1), real: c.real }); },
    pillar(c, h, rad) { marks.pillar(c.x, c.z, c.s.edge, { h: h * c.s.tier.size, r: rad * c.s.tier.size, life: 0.8, a: reduce() ? 0.25 : 0.42 }); sparks.wisps(c.x, 0.2, c.z, 8, { colors: [c.s.glow, c.s.edge], rise: h * 1.1, r: rad, w: 0.35, len: 0.9, life: 0.7, real: c.real }); },
    drop(c, h) { sparks.drop(c.x, c.z, h, { colors: [c.s.core, c.s.edge], w: 0.5 * c.s.tier.size, real: c.real }); },
    spikes(c, n, h) { const m = Math.round(n * c.s.tier.count); for (let i = 0; i < m; i++) { const a = (i / m) * 6.283 + rnd(-0.3, 0.3); const d = rnd(0.4, 1) * Math.max(1, c.r * 0.6); marks.pillar(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, c.s.edge, { h: h * rnd(0.6, 1), r: 0.32, life: 0.9, a: 0.5, rise: 0.06 + i * 0.02 }); } },
    embers(c, n) { sparks.burst(c.x, 0.4, c.z, n * c.s.tier.count, { speed: [0.6, 2.2], up: 1, lift: 1.5, colors: [c.s.core, c.s.edge, 0xffa040], kind: 2, w: 0.12, life: 1.6, grav: -0.4, drag: 0.6, spread: 0.6, real: c.real }); },
    mist(c, n) { sparks.wisps(c.x, 0.1, c.z, n * c.s.tier.count, { colors: [0xe8f6ff, c.s.edge], rise: 0.6, out: 1.2, r: c.r * 0.6, w: 0.9, len: 1.2, life: 1.6, a: 0.35, spread: 0.5, real: c.real }); },
    funnel(c, n) {
      const m = Math.round(n * c.s.tier.count * qual());
      for (let i = 0; i < m; i++) { const a = (i / m) * 6.283 * 2; const y = 0.2 + (i / m) * 4 * c.s.tier.size; const rr = 0.4 + y * 0.35; sparks.emit({ x: c.x + Math.cos(a) * rr, y, z: c.z + Math.sin(a) * rr, vx: -Math.sin(a) * 6, vy: 1.6, vz: Math.cos(a) * 6, life: 0.6, w: 0.3, len: 0.7, stretch: 0.08, color: i % 2 ? c.s.glow : c.s.edge, a: 0.55, kind: 3, real: c.real, delay: i * 0.012 }); }
    },
    arcs(c, n) { for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + rnd(-0.4, 0.4); const d = Math.max(1.5, c.r * 0.8); zap(c.x, 1.4, c.z, c.x + Math.cos(a) * d, 0.2, c.z + Math.sin(a) * d, c.s.edge, c.real); } },
    motes(c, n) { sparks.burst(c.x, 0.2, c.z, n * c.s.tier.count, { speed: [0.3, 1.2], up: 1, lift: 2.2, colors: [c.s.core, c.s.glow, c.s.edge], kind: 2, w: 0.2, life: 1.4, grav: -0.3, drag: 0.4, spread: 0.5, real: c.real }); },
    bubbles(c, n) { sparks.burst(c.x, 0.15, c.z, n * c.s.tier.count, { speed: [0.2, 1.4], up: 1, lift: 1.4, colors: [c.s.core, c.s.edge], kind: 2, w: 0.22, life: 1.1, grav: -0.2, drag: 0.8, spread: 0.7, real: c.real }); },
    stars(c, n) { sparks.burst(c.x, 1.2, c.z, n * c.s.tier.count, { speed: [0.5, 3], up: 0.7, colors: [0xffffff, c.s.core, c.s.edge], kind: 1, w: 0.2, len: 0.2, stretch: 0.01, life: 1.4, grav: 0, drag: 1.2, spread: 0.4, real: c.real }); },
    threads(c, n) { for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; const R = Math.max(1.6, c.r); marks.streak(c.x, 0.5, c.z, c.x + Math.cos(a) * R, 0.15, c.z + Math.sin(a) * R, 0.1, 0xf0f0ff, 0.8, 0.7, { sweep: 0.08, k: [0.2, 1, 0.2], kind: 'hit' }); } },
    static(c, n) { for (let i = 0; i < n; i++) later(0.12 + i * 0.14, () => { const a = rnd(0, 6.283); const d = rnd(0.3, 1) * Math.max(1, c.r * 0.7); zap(c.x + Math.cos(a) * d * 0.4, 0.3, c.z + Math.sin(a) * d * 0.4, c.x + Math.cos(a) * d, 0.1, c.z + Math.sin(a) * d, c.s.edge, c.real); }, c.real); },
    dust(c, n) { for (let i = 0; i < n * c.s.tier.count && puffBudget-- > 0; i++) { const a = rnd(0, 6.283); const d = rnd(0.3, 1) * Math.max(1, c.r * 0.8); G.fx.puff(new THREE.Vector3(c.x + Math.cos(a) * d, 0.3, c.z + Math.sin(a) * d), { vel: new THREE.Vector3(Math.cos(a) * 0.4, 0.35, Math.sin(a) * 0.4), drag: 0.5, s0: 1, s1: 2.6, life: rnd(1.8, 2.6), c0: 0xa89e88, c1: 0x8a8272, a0: 0.32 }); } },
    wisp(c, n) { sparks.wisps(c.x, 0.3, c.z, n * c.s.tier.count, { colors: [c.s.glow, c.s.edge], rise: 0.8, out: 1.6, r: c.r * 0.5, w: 0.6, len: 1.4, life: 1.3, a: 0.35, spread: 0.5, real: c.real }); },
    sig(c) { run(SIG[c.vName] || [], c); },
    // a sphere of thick streaks bursting from the body (y 1.2), every direction, the hot colour inside the edge colour
    nova(c, n) {
      const m = Math.round(n * c.s.tier.count);
      sparks.burst(c.x, 1.2, c.z, m, { speed: [9, 18 * c.s.tier.size], up: 1, flat: true, colors: [c.s.edge, c.s.glow, c.s.deep], a: 0.7, w: 0.26 * c.s.tier.size, len: 0.5, stretch: 0.06, life: 0.5 * c.s.tier.life, grav: 4, drag: 2.2, real: c.real });
      sparks.burst(c.x, 1.0, c.z, Math.ceil(m / 2), { speed: [3, 7], up: 0.9, colors: [c.s.glow, c.s.edge], a: 0.75, kind: 1, w: 0.45 * c.s.tier.size, len: 0.45, stretch: 0.02, life: 0.7, grav: 6, drag: 1.2, real: c.real });
    },
  };
  // the after-image of an impact, by voice
  const AFTER = {
    dust: [['dust', 5]], embers: [['embers', 12], ['dust', 2]], mist: [['mist', 6]], wisp: [['wisp', 6]], static: [['static', 3]],
    motes: [['motes', 10]], bubbles: [['bubbles', 8]], stars: [['stars', 10]], threads: [['wisp', 3]],
  };
  function run(steps, c) { for (const st of steps) { const f = P[st[0]]; if (f) f(c, ...st.slice(1)); } }

  function ctxOf(u, x, z, r, o = {}) {
    const s = skinOf(u, o.color); const vName = VOICE_OF[(u && u.kind) || ''] || 'earth';
    return { x, z, r: r || 1.5, s, v: VOICE[vName], vName, real: !!o.real, ...o.extra };
  }

  // ---- the three beats ----
  // wind-up at the caster; dur: seconds until the impact (the sim op's delay, or the hold of an instant skill)
  function gong(u, dur, o = {}) {
    if (!u) return;
    const c = ctxOf(u, u.x, u.z, 1.5, o); const big = o.ult ? 1.6 : 1; const T = Math.max(0.12, dur);
    const n = (o.ult ? 22 : 9) * c.s.tier.count;
    sparks.converge(u.x, 1.1, u.z, n, 2.4 * big * c.s.tier.size, { colors: [c.s.core, c.s.edge], life: T, w: 0.09, len: 0.1, stretch: 0.1, real: c.real, spread: T * 0.3 });
    sparks.wisps(u.x, 0.1, u.z, (o.ult ? 8 : 3) * c.s.tier.count, { colors: [c.s.glow, c.s.edge], rise: 1.6 * big, r: 0.7, w: 0.4, len: 0.8, life: T + 0.2, a: 0.45, real: c.real });
    if (!o.ult) decals.add({ x: u.x, z: u.z, r: 1.3 * c.s.tier.size, kind: DECAL.light, glow: c.s.glow, life: T + 0.25, real: c.real });
    if (o.ult) { marks.pillar(u.x, u.z, c.s.edge, { h: 5 * c.s.tier.size, r: 0.8, life: T + 0.3, a: reduce() ? 0.2 : 0.32 }); decals.add({ x: u.x, z: u.z, r: 2.2 * c.s.tier.size, kind: DECAL.crack, color: c.s.deep, glow: c.s.edge, life: T + 2.5, real: c.real }); }
  }
  // impact at a landing point of shape `shape` (a SHAPE key) and its after-image
  function bung(u, shape, x, z, r, o = {}) {
    const c = ctxOf(u, x, z, r, o);
    if (o.line) Object.assign(c, { x0: o.line[0], z0: o.line[1], x2: o.line[2], z2: o.line[3], w: o.line[4] });
    run((SHAPE[shape] || SHAPE.burst).bung, c);
    if (c.s.form >= 2) run(FORM[c.s.form], c);
    if (o.extra && o.extra.steps) run(o.extra.steps, c);
    const after = AFTER[c.v.after]; if (after) later(AFTER_DELAY, () => run(after, c), c.real);
    return c;
  }

  function update(dt, real) {
    puffBudget = 40;
    for (let i = 0; i < queue.length; i++) { const q = queue[i]; q.t -= q.real ? real : dt; if (q.t <= 0) { queue.splice(i--, 1); q.fn(); } }
    sparks.update(dt, real); decals.update(dt, real);
  }
  function clear() { queue.length = 0; sparks.clear(); decals.clear(); }
  return { gong, bung, later, update, clear, sparks, decals, zap, skinOf, voiceOf: (u) => VOICE_OF[(u && u.kind) || ''] || 'earth', VOICE, SHAPE, FORM, run, ctxOf };
}
