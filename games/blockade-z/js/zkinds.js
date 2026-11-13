// Special zombies and monsters: extra parts on the pooled body, one behaviour per kind, elite affixes,
// and the hazards they leave (acid, fire, web). The host runs the rules; guests replay the looks.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;
  const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const vary = (h, k) => rgb(h).map((c) => Math.max(0, Math.min(255, Math.round(c * k))));

  // ---- textures ----
  const skin = (key, base, spot, p = 0.18) => BZ.defTex(key, 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(rng.chance(p) ? spot : base)); });
  const face = (key, base, eye, draw) => BZ.defTex(key, 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, vary(base, 1 + (rng.next() - 0.5) * 0.08));
    for (const ex of [1, 5]) { set(ex, 3, rgb(eye)); set(ex + 1, 3, rgb(eye)); }
    if (draw) draw(set, rng); else { for (let x = 2; x < 6; x++) set(x, 6, rgb(0x2a1410)); set(3, 5, rgb(0x2a1410)); }
  });
  skin('z_skin_spit', 0xb4b45a, 0x8a9a3a);
  face('z_face_spit', 0xb4b45a, 0x9aff40, (set) => { for (let y = 5; y < 8; y++) for (let x = 2; x < 6; x++) set(x, y, rgb(0x1a2a08)); set(3, 7, rgb(0x9aff40)); set(4, 6, rgb(0x9aff40)); });
  BZ.defTex('z_sac', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb((x + y * 3) % 5 === 0 ? 0x4a8a20 : rng.chance(0.15) ? 0xd8ff90 : 0x8adf40)); });
  skin('z_skin_bloat', 0xaab48c, 0x8a6a7a, 0.22);
  face('z_face_bloat', 0xaab48c, 0xffe040);
  BZ.defTex('z_belly', 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb((x === 3 && y > 1) || (y === 4 && x > 4) ? 0x8a5a8a : rng.chance(0.1) ? 0xe0e060 : 0xc8d0a8));
  });
  skin('z_skin_hound', 0x7a3028, 0x5a1e18, 0.25);
  face('z_face_hound', 0x7a3028, 0xffd23a, (set) => { for (let x = 1; x < 7; x++) set(x, 6, rgb(x % 2 ? 0xf0e8d0 : 0x1a0a08)); set(3, 7, rgb(0x1a0a08)); set(4, 7, rgb(0x1a0a08)); });
  BZ.defTex('z_hound_back', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(x % 2 === 0 && y > 1 && y < 6 ? 0xd8ccb0 : rng.chance(0.3) ? 0x4a1610 : 0x6a2620)); });
  BZ.defTex('z_door', 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const edge = x === 0 || x === 7 || y === 0 || y === 7; const slit = y === 1 && x > 1 && x < 6;
      set(x, y, rgb(slit ? 0x1a2030 : edge ? 0x3a3e44 : rng.chance(0.12) ? 0x545a62 : 0x6a7078));
    }
    for (const [x, y] of [[1, 6], [6, 6], [1, 3], [6, 3]]) set(x, y, rgb(0xb8c0c8));
    set(4, 4, rgb(0x7a4a2a));
  });
  BZ.defTex('z_armor', 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(y === 0 ? 0x9aa2aa : y === 7 ? 0x3a3e44 : rng.chance(0.08) ? 0x7a4a2a : 0x5e646c));
    for (const [x, y] of [[1, 1], [6, 1], [1, 6], [6, 6]]) set(x, y, rgb(0xc8d0d8));
  });
  skin('z_skin_shriek', 0xd8d0bc, 0xb0a48c);
  face('z_face_shriek', 0xd8d0bc, 0xf0f0ff, (set) => { for (let y = 4; y < 8; y++) for (let x = 2; x < 6; x++) set(x, y, rgb(y > 5 && x > 2 && x < 5 ? 0x6a0a0a : 0x0a0404)); });
  BZ.defTex('z_hair', 4, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) set(x, y, rgb(rng.chance(0.25) ? 0x2a2420 : 0x14100c)); });
  skin('z_skin_burn', 0x2e2420, 0xff6a10, 0.24);
  face('z_face_burn', 0x2e2420, 0xffc040, (set) => { for (let x = 2; x < 6; x++) set(x, 6, rgb(0xff7a20)); });
  skin('z_skin_frost', 0x9cb8cc, 0xe0f0ff, 0.22);
  face('z_face_frost', 0x9cb8cc, 0x80e0ff, (set) => { for (let x = 2; x < 6; x++) set(x, 6, rgb(0x2a4a6a)); set(2, 7, rgb(0xe0f0ff)); set(5, 7, rgb(0xe0f0ff)); });
  skin('z_spider', 0x2a1a30, 0x4a2a5a, 0.25);
  BZ.defTex('z_spider_back', 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const mark = (y === 2 || y === 5) && x > 1 && x < 6 || ((y === 3 || y === 4) && (x === 3 || x === 4));
      set(x, y, rgb(mark ? 0x9aff40 : rng.chance(0.2) ? 0x3a2448 : 0x24162a));
    }
  });
  BZ.defTex('z_spider_leg', 4, 8, ({ set }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) set(x, y, rgb(y % 3 === 0 ? 0x6a4a7a : 0x24162a)); });
  BZ.defTex('z_spider_face', 8, 8, ({ set }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(0x2a1a30));
    for (const [x, y] of [[2, 2], [5, 2], [1, 3], [6, 3], [3, 3], [4, 3], [3, 1], [4, 1]]) set(x, y, rgb(0xff2a20));
    for (const x of [2, 5]) { set(x, 6, rgb(0xd8ccb0)); set(x, 7, rgb(0xd8ccb0)); }
  });
  BZ.defTex('z_egg', 8, 8, ({ set, rng }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, rgb(rng.chance(0.1) ? 0x9aff40 : (x + y) % 4 === 0 ? 0xa89a70 : 0xd8d0b0)); });
  const blob = (key, c0, c1) => BZ.defTex(key, 32, 32, ({ set, rng }) => {
    const bl = []; for (let i = 0; i < 6; i++) bl.push([16 + rng.range(-5, 5), 16 + rng.range(-5, 5), rng.range(5, 10)]);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      let v = 0; for (const [bx, by, br] of bl) v = Math.max(v, 1 - Math.hypot(x - bx, y - by) / br);
      set(x, y, rgb(v > 0.55 ? c0 : c1), v > 0.08 ? Math.round(Math.min(1, v * 2) * 230) : 0);
    }
  }, { noMip: true });
  blob('haz_acid', 0xb8ff50, 0x4a9a20);
  blob('haz_fire', 0xffd060, 0xe8541e);
  BZ.defTex('haz_web', 32, 32, ({ set }) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = x - 15.5; const dy = y - 15.5; const r = Math.hypot(dx, dy); const a = Math.atan2(dy, dx);
      const spoke = Math.abs(Math.sin(a * 4)) < 0.08; const ring = Math.abs((r % 4) - 2) < 0.4;
      set(x, y, [240, 240, 240], r < 15 && (spoke || ring) ? 220 : 0);
    }
  }, { noMip: true });

  // ---- the new types; `kind` picks the behaviour, `parts` the extra pieces, `rig` swaps the whole body ----
  const Z = (o) => ({ shirt: ['z_shirt_dark'], pants: ['z_pants_dark'], voice: 'groan', hunch: 0.1, droop: 0.3, ...o });
  Object.assign(BZ.ZOMBIES, {
    spitter: Z({ hp: 70, speed: 2.0, dmg: 10, rate: 1.2, windup: 0.35, scale: 0.95, skin: 'z_skin_spit', face: 'z_face_spit', shirt: ['z_shirt_dark', 'z_vest'], pants: ['z_pants', 'z_pants_brown'], score: 250, eye: 0x9aff40, hunch: 0.25, kind: 'spit', parts: ['sac'], name: 'KẺ PHUN', tip: 'phun axit từ xa; vũng axit đốt máu và làm chậm' }),
    bloater: Z({ hp: 160, speed: 1.35, dmg: 0, rate: 2, windup: 0.9, scale: 1.2, skin: 'z_skin_bloat', face: 'z_face_bloat', shirt: ['z_shirt_red'], score: 300, eye: 0xffe040, hunch: -0.05, droop: 0.1, kind: 'bloat', parts: ['belly'], noDown: true, noTower: true, name: 'KẺ PHÌNH', tip: 'áp sát là phát nổ; bắn nổ nó giữa bầy để nổ lây' }),
    hound: Z({ hp: 55, speed: 6.2, dmg: 9, rate: 0.75, windup: 0.18, scale: 0.8, skin: 'z_skin_hound', face: 'z_face_hound', shirt: ['z_hound_back'], pants: ['z_skin_hound'], score: 150, voice: 'screech', eye: 0xffd23a, kind: 'hound', quad: true, noDown: true, noTower: true, pack: [3, 5], name: 'CHÓ XÁC', tip: 'chạy theo đàn và vồ từ năm mét' }),
    shielder: Z({ hp: 180, speed: 1.8, dmg: 16, rate: 1.3, windup: 0.5, scale: 1.1, skin: 'z_skin', face: 'z_face', shirt: ['z_shirt_dark'], score: 400, eye: 0xff3020, kind: 'shield', parts: ['shield'], shieldHp: 320, noDown: true, name: 'KẺ KHIÊN', tip: 'khiên chặn đạn phía trước: bắn đầu, đánh vòng hoặc dùng bom' }),
    armored: Z({ hp: 240, speed: 1.6, dmg: 22, rate: 1.5, windup: 0.55, scale: 1.25, skin: 'z_skin_brute', face: 'z_face_brute', score: 500, voice: 'roar', eye: 0xff3b1f, hunch: 0.12, droop: 0, kind: 'armor', parts: ['plate', 'helmet'], armor: 420, noDown: true, name: 'KẺ GIÁP', tip: 'giáp chặn 70% sát thương: bắn chân, đốt hoặc tẩm độc' }),
    shrieker: Z({ hp: 90, speed: 2.4, dmg: 8, rate: 1.0, windup: 0.35, scale: 1.05, skin: 'z_skin_shriek', face: 'z_face_shriek', shirt: ['z_shirt_red', 'z_shirt_dark'], pants: ['z_pants'], score: 350, voice: 'screech', eye: 0xf0f0ff, hunch: 0.3, droop: 0.4, kind: 'shriek', parts: ['hair'], name: 'KẺ THÉT', tip: 'tiếng thét làm bầy cuồng lên và gọi thêm: hạ nó trước' }),
    burner: Z({ hp: 130, speed: 2.4, dmg: 14, rate: 1.1, windup: 0.4, scale: 1.05, skin: 'z_skin_burn', face: 'z_face_burn', shirt: ['z_shirt_dark'], score: 350, eye: 0xffc040, kind: 'burn', immune: 'burn', weak: 'chill', glow: 0x3a1204, name: 'XÁC CHÁY', tip: 'không sợ lửa, sợ băng; chết thì bùng cháy' }),
    frost: Z({ hp: 150, speed: 1.9, dmg: 12, rate: 1.2, windup: 0.45, scale: 1.1, skin: 'z_skin_frost', face: 'z_face_frost', shirt: ['z_shirt_dark'], score: 350, eye: 0x80e0ff, kind: 'frost', immune: 'chill', weak: 'burn', glow: 0x0a2440, hitFx: { slow: 1.6 }, name: 'XÁC BĂNG', tip: 'không sợ băng, sợ lửa; chết thì đóng băng cả bầy quanh nó' }),
    spider: Z({ hp: 40, speed: 5.6, dmg: 7, rate: 0.8, windup: 0.2, scale: 0.55, skin: 'z_spider', face: 'z_spider_face', shirt: ['z_spider_back'], pants: ['z_spider_leg'], score: 120, voice: 'screech', eye: 0xff2a20, kind: 'spider', rig: 'spider', noDown: true, noTower: true, hitFx: { slow: 0.8 }, pack: [4, 6], name: 'NHỆN ĐỘC', tip: 'bầy nhện nhỏ chạy nhanh, cắn làm chậm' }),
    egg: Z({ hp: 60, speed: 0, dmg: 0, rate: 9, windup: 9, scale: 1, skin: 'z_egg', face: 'z_egg', shirt: ['z_egg'], pants: ['z_egg'], score: 80, voice: 'groan', eye: 0x9aff40, kind: 'egg', rig: 'egg', noDown: true, noTower: true, name: 'TRỨNG NHỆN' }),
    brood: Z({ hp: 3200, speed: 2.6, dmg: 30, rate: 1.6, windup: 0.5, scale: 2.4, skin: 'z_spider', face: 'z_spider_face', shirt: ['z_spider_back'], pants: ['z_spider_leg'], score: 3200, voice: 'roar', eye: 0xff2a20, kind: 'spider', rig: 'spider', boss: 'brood', noDown: true, noTower: true, hitFx: { slow: 1.2 }, name: 'NHỆN CHÚA' }),
  });

  // which specials join a wave, from which wave, and how often (share of the spawns)
  const SPECIAL = [['spitter', 3, 0.06], ['hound', 3, 0.035], ['bloater', 4, 0.06], ['shielder', 5, 0.05], ['shrieker', 5, 0.025], ['armored', 6, 0.05], ['spider', 6, 0.03], ['burner', 7, 0.05], ['frost', 8, 0.05]];
  BZ.pickSpecial = (n, rng) => {
    let r = rng.next();
    for (const [id, from, w] of SPECIAL) { if (n < from) continue; const s = Math.min(w * 2, w * (1 + 0.15 * (n - from))); if (r < s) return id; r -= s; }
    return null;
  };
  BZ.ELITE = {
    swift: { name: 'NHANH', col: 0xffe040 }, tough: { name: 'TRÂU', col: 0xff8a30 }, regen: { name: 'TỰ HỒI', col: 0x60ff80 },
    volatile: { name: 'BÙNG NỔ', col: 0xff3020 }, vampire: { name: 'HÚT MÁU', col: 0xc030ff }, frenzy: { name: 'CUỒNG', col: 0xff2060 },
  };
  const ELITE_IDS = Object.keys(BZ.ELITE);
  BZ.eliteChance = (n) => (n < 3 ? 0 : Math.min(0.12, 0.015 * n));

  // ---- extra pieces built once per pooled body, hidden unless the type uses them ----
  const geo = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  const lam = (key, em) => new THREE.MeshLambertMaterial({ map: BZ.tex(key), emissive: em || 0, emissiveMap: em ? BZ.tex(key) : null });
  const SAC = geo(0.4, 0.24, 0.34, 0, -0.06, 0.12); const BELLY = geo(0.86, 0.6, 0.62, 0, 0, 0.2); const SAG = geo(0.72, 0.2, 0.52, 0, -0.36, 0.2); const PUS = geo(0.12, 0.12, 0.06, 0, 0, 0);
  const TAIL = geo(0.1, 0.5, 0.1, 0, -0.25, 0);
  const PLATE = geo(0.98, 1.3, 0.08, 0, 0, 0); const CHEST = geo(0.62, 0.52, 0.4, 0, 0.42, 0); const PAD = geo(0.3, 0.16, 0.3, 0, -0.02, 0);
  const HELM = geo(0.58, 0.3, 0.58, 0, 0.38, 0); const VISOR = geo(0.5, 0.06, 0.04, 0, 0.32, 0.29); const HAIR = geo(0.54, 0.7, 0.12, 0, 0.12, -0.27);
  const CEPH = geo(0.62, 0.38, 0.6, 0, 0, 0); const ABD = geo(0.95, 0.75, 1.05, 0, 0, -0.5); const FANG = geo(0.07, 0.18, 0.07, 0, -0.09, 0);
  const UPPER_R = geo(0.55, 0.09, 0.09, 0.275, 0, 0); const UPPER_L = geo(0.55, 0.09, 0.09, -0.275, 0, 0); const LOWER = geo(0.08, 0.8, 0.08, 0, -0.4, 0);
  const GEM = new THREE.OctahedronGeometry(0.16, 0);
  const EGG = [geo(0.7, 0.5, 0.7, 0, 0.25, 0), geo(0.56, 0.3, 0.56, 0, 0.62, 0), geo(0.36, 0.16, 0.36, 0, 0.85, 0)];
  BZ.zExtras = (G, b) => {
    const X = {}; const sh = G.quality.shadow > 0;
    const add = (parent, g, m, name) => { const o = new THREE.Mesh(g, m); o.castShadow = sh; o.visible = false; parent.add(o); X[name] = o; return o; };
    add(b.head, SAC, lam('z_sac', 0x2a6a10), 'sac');
    const bp = new THREE.Group(); bp.position.set(0, 0.3, 0.12); b.hips.add(bp); X.bellyP = bp; const bm = lam('z_belly'); add(bp, BELLY, bm, 'belly');
    const sag = new THREE.Mesh(SAG, bm); sag.castShadow = sh; X.belly.add(sag);
    const pm = new THREE.MeshBasicMaterial({ color: 0xe8f060 }); for (const [x, y] of [[-0.22, 0.12], [0.18, -0.08], [0.05, 0.2], [-0.1, -0.2]]) { const q = new THREE.Mesh(PUS, pm); q.position.set(x, y, 0.52); X.belly.add(q); }
    add(b.hips, TAIL, b.mats.skin, 'tail'); X.tail.position.set(0, 0.06, -0.02);
    const sp = new THREE.Group(); sp.position.set(0, 0.05, 0.42); b.hips.add(sp); X.shieldP = sp; add(sp, PLATE, lam('z_door'), 'shield');
    const am = lam('z_armor'); add(b.hips, CHEST, am, 'plate'); add(b.armL, PAD, am, 'padL'); add(b.armR, PAD, am, 'padR'); add(b.head, HELM, am, 'helmet');
    add(b.head, VISOR, new THREE.MeshBasicMaterial({ color: 0xff4020 }), 'visor');
    add(b.head, HAIR, lam('z_hair'), 'hair');
    // spider: cephalothorax with the face, an abdomen that sways, two fangs, eight legs of two bones each
    const sg = new THREE.Group(); sg.visible = false; b.root.add(sg); X.spider = sg;
    const ceph = new THREE.Mesh(CEPH, [b.mats.skin, b.mats.skin, b.mats.skin, b.mats.skin, b.mats.face, b.mats.skin]); ceph.position.set(0, 0.5, 0.28); ceph.castShadow = sh; sg.add(ceph);
    const abd = new THREE.Group(); abd.position.set(0, 0.6, 0); sg.add(abd); const am2 = new THREE.Mesh(ABD, b.mats.shirt); am2.castShadow = sh; abd.add(am2);
    for (const s of [-1, 1]) { const f = new THREE.Mesh(FANG, b.mats.pants); f.position.set(s * 0.12, 0.34, 0.58); sg.add(f); }
    const legs = [];
    for (const s of [1, -1]) for (let i = 0; i < 4; i++) {
      const hip = new THREE.Group(); hip.position.set(s * 0.28, 0.5, 0.42 - i * 0.2); sg.add(hip);
      const up = new THREE.Mesh(s > 0 ? UPPER_R : UPPER_L, b.mats.pants); up.castShadow = sh; hip.add(up);
      const knee = new THREE.Group(); knee.position.x = s * 0.55; hip.add(knee);
      const lo = new THREE.Mesh(LOWER, b.mats.pants); lo.castShadow = sh; knee.add(lo);
      legs.push({ hip, knee, s, i, spread: s * [-0.75, -0.25, 0.2, 0.6][i] });
    }
    X.ceph = ceph; X.abd = abd; X.legs = legs;
    const eg = new THREE.Group(); eg.visible = false; b.root.add(eg); X.eggG = eg;
    for (const g of EGG) { const m = new THREE.Mesh(g, b.mats.skin); m.castShadow = sh; eg.add(m); }
    X.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: BZ.tex('glow'), color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    X.aura.position.y = 1.0; X.aura.scale.set(2.6, 2.6, 1); X.aura.visible = false; b.root.add(X.aura);
    X.gem = new THREE.Mesh(GEM, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })); X.gem.visible = false; b.root.add(X.gem);
    b.x = X;
  };

  // ---- behaviour ----
  BZ.makeZKinds = (G, api) => {
    const V = () => new THREE.Vector3();
    const tmp = V(); const out = {};
    const players = () => { const a = [G.player]; if (G.coop && G.coop.host) a.push(...G.coop.remotes()); return a.filter((p) => p.alive); };
    const host = () => !(G.coop && G.coop.guest);
    const net = (p) => { if (host()) G.events.emit('zk', p); };
    const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    const fwd = (z) => tmp.set(Math.sin(z.yaw), 0, Math.cos(z.yaw));
    const los = (z, P, h = 1.2) => G.world.lineOfSight(V().set(z.pos.x, z.pos.y + h * z.T.scale, z.pos.z), V().set(P.pos.x, P.pos.y + 1.3, P.pos.z));

    // effects a hit leaves on a player: slow and root (web); guests get them with the hurt message
    function playerFx(P, fx) {
      if (!fx || P !== G.player) return;
      if (fx.slow) { if (!(P.slowT > 0)) G.ui.pop('CHẬM', 'dmg leg'); P.slowT = Math.max(P.slowT || 0, fx.slow); }
      if (fx.root) { G.ui.pop('DÍNH TƠ', 'critword'); P.rootT = Math.max(P.rootT || 0, fx.root); }
    }

    function dress(z, T) {
      const b = z.body; const X = b.x; const parts = T.parts || [];
      for (const k of ['sac', 'belly', 'shield', 'plate', 'padL', 'padR', 'helmet', 'visor', 'hair', 'tail']) X[k].visible = false;
      X.tail.visible = !!T.quad; b.head.scale.setScalar(T.quad ? 0.78 : 1); b.armL.position.x = T.quad ? -0.2 : -0.36; b.armR.position.x = T.quad ? 0.2 : 0.36;
      for (const k of parts) { X[k].visible = true; if (k === 'plate') X.padL.visible = X.padR.visible = true; if (k === 'helmet') X.visor.visible = true; }
      b.hips.visible = !T.rig; X.spider.visible = T.rig === 'spider'; X.eggG.visible = T.rig === 'egg';
      for (const k of ['skin', 'shirt', 'pants']) { const m = b.mats[k]; if (m.userData.glowMap !== !!T.glow) { m.emissiveMap = T.glow ? m.map : null; m.userData.glowMap = !!T.glow; m.needsUpdate = true; } }
    }
    function init(z, T, wave) {
      const b = z.body; const X = b.x; const W = BZ.WAVE;
      dress(z, T);
      z.act = null; z.hold = false; z.noMelee = false; z.rage = 0; z.elite = null; z.spdMul = 1; z.regen = 0; z.hitNote = null;
      z.cd = G.rng.range(2, 4); z.cd2 = G.rng.range(6, 9); z.shrieks = 0; z.trailT = 0; z.hatch = 5; z.leap = z.leap || null; z.leap = null;
      z.shieldHp = T.shieldHp ? T.shieldHp * W.hpMul(wave || 1) : 0; z.armor = T.armor ? T.armor * W.hpMul(wave || 1) : 0;
      b.hips.position.z = 0; b.hips.rotation.set(0, 0, 0); b.armL.rotation.z = b.armR.rotation.z = 0; b.head.rotation.y = 0; b.root.rotation.z = 0;
      X.bellyP.scale.setScalar(1); X.aura.visible = false; X.aura.material.opacity = 0.5; X.gem.visible = false; z.glow = 0; b.mats.face.userData.eye = T.eye;
      if (X.belly.visible) X.belly.material.emissive.setHex(0);
      b.barFg.material.color.setHex(0xe8402c);
    }
    function elite(z, key) {
      key = key || G.rng.pick(ELITE_IDS); const E = BZ.ELITE[key]; if (!E) return;
      z.elite = key;
      if (key === 'swift') z.spdMul = 1.55;
      if (key === 'tough') { z.hp = z.maxHp = Math.round(z.maxHp * 2.5); z.dmg = Math.round(z.dmg * 1.3); }
      const X = z.body.x; X.aura.visible = true; X.aura.material.color.setHex(E.col); X.aura.scale.set(2.6, 2.6, 1); X.gem.visible = true; X.gem.material.color.setHex(E.col);
      z.glow = new THREE.Color(E.col).multiplyScalar(0.22).getHex(); for (const m of ['skin', 'shirt', 'pants']) z.body.mats[m].emissive.setHex(z.glow);
      z.body.barFg.material.color.setHex(0xf2c23a);
      z.body.mats.face.userData.eye = E.col; z.body.mats.face.emissive.setHex(E.col);
      G.ui.pop('TINH ANH · ' + E.name, 'critword', V().set(z.pos.x, z.pos.y + 2.6 * z.T.scale, z.pos.z));
    }

    // per-frame upkeep on the host: rage fades, regen, frenzy, trails, cooldowns
    function tick(z, dt) {
      z.rage = Math.max(0, z.rage - dt);
      if (z.elite === 'regen' && !(z.st && (z.st.burn || z.st.poison)) && z.hp < z.maxHp) z.hp = Math.min(z.maxHp, z.hp + z.maxHp * 0.035 * dt);
      if (z.elite === 'frenzy' && z.hp < z.maxHp * 0.5) z.rage = Math.max(z.rage, 0.3);
      if (z.T.kind === 'burn') { z.trailT -= dt; if (z.trailT <= 0 && Math.hypot(z.vel.x, z.vel.z) > 0.5) { z.trailT = 0.9; hazard('fire', V().set(z.pos.x, z.pos.y, z.pos.z), 0.9, 2.5); } }
    }

    // returns true when this kind owns the frame's movement (leaps); otherwise may set hold/noMelee
    function step(z, dt, P, dist) {
      const T = z.T; const k = T.kind; z.hold = false; z.noMelee = false;
      z.cd -= dt; z.cd2 -= dt;
      if (z.leap) return leapStep(z, dt, P);
      if (k === 'spit') {
        if (z.act) { z.hold = true; z.noMelee = true; z.act.t += dt; face(z, P, dt); if (!z.act.fired && z.act.t > 0.55) { z.act.fired = true; spit(z, P, 'acid'); } if (z.act.t >= z.act.dur) { z.act = null; z.cd = G.rng.range(2.6, 3.6); } return false; }
        if (z.cd <= 0 && dist > 4 && dist < 17 && P.alive && los(z, P)) { z.act = { t: 0, dur: 0.85 }; G.audio.playAt('gore', z.pos, { gain: 0.6, rate: 1.7 }); }
        else if (dist < 10 && dist > 3 && z.cd > 0.6 && los(z, P)) z.hold = true;
      } else if (k === 'bloat') {
        if (z.act) { z.hold = true; z.noMelee = true; z.act.t += dt; if (z.act.t >= z.act.dur && z.alive) api.damage(z, z.hp + 1, 'body', fwd(z).clone().negate(), 1, { net: true, by: 'z', credit: false, pop: true }); return false; }
        if (dist < 2.4 && P.alive) { z.act = { t: 0, dur: 0.9 }; G.audio.playAt('gore', z.pos, { gain: 1, rate: 0.5 }); }
      } else if (k === 'hound' || (k === 'spider' && !T.boss)) {
        const lo = T.rig ? 1.5 : 2.5; const hi = T.rig ? 4 : 6;
        if (z.cd <= 0 && dist > lo && dist < hi && P.alive && los(z, P, 0.6)) { startLeap(z, P, T.rig ? 0.8 : 1.3); return true; }
      } else if (k === 'shriek') {
        if (z.act) { z.hold = true; z.noMelee = true; z.act.t += dt; face(z, P, dt); if (!z.act.fired && z.act.t > 0.35) { z.act.fired = true; shriek(z); } if (z.act.t >= z.act.dur) { z.act = null; z.cd = G.rng.range(6, 8); } return false; }
        if (z.cd <= 0 && dist < 24 && z.shrieks < 4) { z.act = { t: 0, dur: 1.2 }; z.shrieks++; }
      } else if (k === 'egg') {
        z.hold = true; z.noMelee = true; z.hatch -= dt;
        if (z.hatch <= 0) { for (let i = 0; i < 3; i++) summon('spider', z.pos, 0.9); api.kill(z, 'body', V().set(0, 0, 1), { gore: 'none', credit: false, hatch: true }); }
      } else if (k === 'spider' && T.boss) {
        if (z.act) { z.hold = true; z.noMelee = true; z.act.t += dt; face(z, P, dt); if (!z.act.fired && z.act.t > 0.5) { z.act.fired = true; spit(z, P, 'web'); } if (z.act.t >= z.act.dur) { z.act = null; z.cd = G.rng.range(4, 5.5); } return false; }
        if (z.cd2 <= 0) { z.cd2 = G.rng.range(9, 12); for (let i = 0; i < 2; i++) { const back = fwd(z).clone().multiplyScalar(-1.8 * T.scale).add(V().set(G.rng.range(-1.5, 1.5), 0, G.rng.range(-1.5, 1.5))); summon('egg', z.pos.clone().add(back), 0); } G.audio.playAt('gore', z.pos, { gain: 1, rate: 0.4 }); }
        if (z.cd <= 0 && dist > 5 && dist < 30 && P.alive && los(z, P, 0.6)) z.act = { t: 0, dur: 0.85 };
        if (z.cd <= -3 && dist > 9 && dist < 22) { startLeap(z, P, 3.5); z.cd = 4; return true; }
      }
      return false;
    }
    function face(z, P, dt) { z.yaw += BZ.wrapAngle(Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z) - z.yaw) * Math.min(1, dt * 8); }
    function startLeap(z, P, h) {
      const to = P.pos.clone().addScaledVector(P.vel || V(), 0.25); to.y = P.pos.y;
      const d = z.pos.distanceTo(to);
      z.leap = { t: 0, dur: 0.32 + d * 0.035, from: z.pos.clone(), to, h, P, hit: false };
      z.yaw = Math.atan2(to.x - z.pos.x, to.z - z.pos.z);
      G.audio.playAt(z.T.voice, z.pos, { gain: 0.8, rate: 1.4 });
    }
    function leapStep(z, dt, P0) {
      const L = z.leap; L.t += dt; const k = Math.min(1, L.t / L.dur);
      const nx = BZ.lerp(L.from.x, L.to.x, k); const nz = BZ.lerp(L.from.z, L.to.z, k); const ny = BZ.lerp(L.from.y, L.to.y, k) + Math.sin(Math.PI * k) * L.h;
      z.vel.set((nx - z.pos.x) / Math.max(dt, 1e-3), 0, (nz - z.pos.z) / Math.max(dt, 1e-3));
      const r = 0.32 * z.T.scale;
      if (!G.world.overlaps([nx - r, ny, nz - r], [nx + r, ny + 0.9, nz + r])) { z.pos.set(nx, ny, nz); } else { z.pos.y = Math.max(z.pos.y, ny); }
      const P = L.P;
      if (!L.hit && P.alive && !P.isDecoy && Math.hypot(P.pos.x - z.pos.x, P.pos.z - z.pos.z) < 1.0 + 0.5 * z.T.scale && Math.abs(P.pos.y - z.pos.y) < 1.6) { L.hit = true; api.hurtP(P, Math.round(z.dmg * (z.T.boss ? 1.2 : 1.5)), z.pos, z.T.hitFx); }
      if (k >= 1) {
        z.leap = null; z.cd = z.T.boss ? 4 : G.rng.range(2.2, 3.2); z.vel.set(0, 0, 0);
        G.fx.burst(V().set(z.pos.x, z.pos.y + 0.1, z.pos.z), z.T.boss ? 26 : 8, [0x6e4428, 0x8a5a35, 0x4a4640], { speed: z.T.boss ? 6 : 2.5, size: z.T.boss ? 0.2 : 0.08, life: 0.7 });
        G.audio.playAt(z.T.boss ? 'boom' : 'land', z.pos, { gain: z.T.boss ? 0.9 : 0.5, rate: z.T.boss ? 0.6 : 1.2 });
        if (z.T.boss) for (const p of players()) { const d = p.pos.distanceTo(z.pos); if (d < 4) api.hurtP(p, Math.round(25 * (1 - d / 5)), z.pos); if (p === G.player && d < 22) G.player.shake.v += (22 - d) * 0.5; }
      }
      return true;
    }

    // ---- ranged: acid globs and web, ballistic; the host hurts players, guests only see them ----
    const PROJ_GEO = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    const PROJ_MAT = { acid: new THREE.MeshBasicMaterial({ color: 0xb8ff50 }), web: new THREE.MeshBasicMaterial({ color: 0xf4f4f4 }) };
    const projs = [];
    function spit(z, P, kind) {
      const from = V().set(z.pos.x, z.pos.y + (kind === 'web' ? 0.6 : 1.6) * z.T.scale, z.pos.z).addScaledVector(fwd(z), 0.4 * z.T.scale);
      const to = V().set(P.pos.x, P.pos.y + 0.9, P.pos.z).addScaledVector(P.vel || V(), 0.45);
      const g = 16; const t = BZ.clamp(from.distanceTo(to) / 17, 0.45, 1.3);
      const vel = to.clone().sub(from).divideScalar(t); vel.y += 0.5 * g * t;
      launch(kind, from, vel, false);
      net({ t: 'proj', kind, p: r2(from), v: r2(vel) });
      G.audio.playAt('gore', from, { gain: 0.7, rate: kind === 'web' ? 0.8 : 1.9 });
      z.body.head.rotation.x = 0.35;
    }
    function launch(kind, from, vel, visual) {
      const m = new THREE.Mesh(PROJ_GEO, PROJ_MAT[kind]); m.position.copy(from); m.scale.setScalar(kind === 'web' ? 1.4 : 1); G.scene.add(m);
      projs.push({ kind, m, pos: from.clone(), vel: vel.clone(), life: 3, visual });
    }
    const seg = V();
    function updateProjs(dt) {
      for (let i = projs.length - 1; i >= 0; i--) {
        const s = projs[i]; s.life -= dt; s.vel.y -= 16 * dt;
        const step = s.vel.length() * dt; seg.copy(s.vel).normalize();
        let at = null; let victim = null;
        const wh = G.world.raycast(s.pos, seg, step + 0.15); if (wh) at = s.pos.clone().addScaledVector(seg, wh.t);
        if (!s.visual) for (const p of players()) { if (Math.hypot(s.pos.x - p.pos.x, s.pos.y - p.pos.y - 1, s.pos.z - p.pos.z) < 0.9) { at = s.pos.clone(); victim = p; break; } }
        else if (G.player.alive && Math.hypot(s.pos.x - G.player.pos.x, s.pos.y - G.player.pos.y - 1, s.pos.z - G.player.pos.z) < 0.9) at = s.pos.clone();
        if (at || s.life <= 0 || s.pos.y < -0.5) {
          at = at || s.pos.clone();
          const col = s.kind === 'web' ? [0xf4f4f4, 0xd0d0d0] : [0xb8ff50, 0x5ac030, 0xe0ff90];
          G.fx.burst(at, 16, col, { speed: 3.5, size: 0.1, life: 0.6 });
          G.audio.playAt('gore', at, { gain: 0.6, rate: s.kind === 'web' ? 0.7 : 1.5 });
          if (!s.visual) {
            const ground = V().set(at.x, Math.max(0, at.y - 1.2), at.z); if (G.world.groundAt) ground.y = G.world.groundAt(at.x, at.z, at.y);
            if (s.kind === 'acid') {
              for (const p of players()) { const d = Math.hypot(p.pos.x - at.x, p.pos.y + 0.9 - at.y, p.pos.z - at.z); if (p === victim || d < 1.8) api.hurtP(p, p === victim ? 12 : 7, at, { slow: 1.2 }); }
              hazard('acid', at.y < 1.4 ? V().set(at.x, 0, at.z) : ground, 1.9, 4.5);
            } else {
              if (victim) api.hurtP(victim, 6, at, { root: 1.1 });
              hazard('web', at.y < 1.4 ? V().set(at.x, 0, at.z) : ground, 2.2, 5);
            }
          }
          G.scene.remove(s.m); projs.splice(i, 1); continue;
        }
        s.pos.addScaledVector(s.vel, dt); s.m.position.copy(s.pos); s.m.rotation.x += dt * 9; s.m.rotation.y += dt * 7;
        if (G.rng.chance(dt * 30)) G.fx.puff(s.pos.clone(), { glow: s.kind === 'acid', s0: 0.25, s1: 0.05, life: 0.3, c0: s.kind === 'acid' ? 0xb8ff50 : 0xffffff, c1: s.kind === 'acid' ? 0x3a8a20 : 0xc0c0c0, a0: 0.8 });
      }
    }

    // ---- hazards on the ground: acid burns and slows, fire burns, web nearly roots ----
    const HAZ_GEO = new THREE.PlaneGeometry(1, 1); HAZ_GEO.rotateX(-Math.PI / 2);
    const hazards = []; const MAXH = 40;
    function hazard(kind, pos, r, dur, visual) {
      if (hazards.length >= MAXH) { const o = hazards.shift(); G.scene.remove(o.m); o.m.material.dispose(); }
      const mat = new THREE.MeshBasicMaterial({ map: BZ.tex('haz_' + kind), transparent: true, opacity: 0.9, depthWrite: false, blending: kind === 'web' ? THREE.NormalBlending : THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, fog: true });
      const m = new THREE.Mesh(HAZ_GEO, mat); m.position.set(pos.x, pos.y + 0.03 + (hazards.length % 5) * 0.003, pos.z); m.scale.set(r * 2, 1, r * 2); m.rotation.y = G.rng.range(0, 6.3); m.renderOrder = 3; G.scene.add(m);
      hazards.push({ kind, pos: m.position.clone(), r, t: dur, dur, m, acc: 0, visual: !!visual });
      if (!visual) net({ t: 'haz', kind, p: r2(pos), r, d: dur });
    }
    function updateHazards(dt) {
      for (let i = hazards.length - 1; i >= 0; i--) {
        const h = hazards[i]; h.t -= dt;
        if (h.t <= 0) { G.scene.remove(h.m); h.m.material.dispose(); hazards.splice(i, 1); continue; }
        const k = Math.min(1, h.t / 0.6, (h.dur - h.t) / 0.15 + 0.2); h.m.material.opacity = 0.9 * k;
        if (h.kind === 'fire' && G.rng.chance(dt * 7 * h.r)) G.fx.puff(V().set(h.pos.x + G.rng.range(-h.r, h.r) * 0.6, h.pos.y + 0.1, h.pos.z + G.rng.range(-h.r, h.r) * 0.6), { glow: true, vel: V().set(0, 1.6, 0), s0: 0.5, s1: 0.1, life: 0.5, c0: 0xffd060, c1: 0xff3a10, a0: 1 });
        if (h.kind === 'acid' && G.rng.chance(dt * 4 * h.r)) G.fx.puff(V().set(h.pos.x + G.rng.range(-h.r, h.r) * 0.5, h.pos.y + 0.05, h.pos.z + G.rng.range(-h.r, h.r) * 0.5), { glow: true, vel: V().set(0, 0.5, 0), s0: 0.08, s1: 0.22, life: 0.5, c0: 0xd8ff90, c1: 0x5ac030, a0: 0.9 });
        if (h.visual) continue;
        h.acc += dt; const tickNow = h.acc >= 0.5; if (tickNow) h.acc = 0;
        for (const p of players()) {
          if (Math.hypot(p.pos.x - h.pos.x, p.pos.z - h.pos.z) > h.r || Math.abs(p.pos.y - h.pos.y) > 1) continue;
          if (h.kind === 'web') { if (p === G.player) G.player.slowT = Math.max(G.player.slowT || 0, 0.25); continue; }
          if (h.kind === 'fire' && p === G.player && G.hero.def.id === 'hoa') continue;
          if (tickNow) api.hurtP(p, h.kind === 'acid' ? 5 : 6, h.pos, h.kind === 'acid' ? { slow: 0.6 } : null);
        }
      }
    }

    // ---- death effects, queued so a chain of bloaters goes off one after another ----
    const queue = [];
    function blast(at, r, dmg, pdmg, by, kind) {
      const keep = G.coop ? G.coop.blastBy : undefined; if (G.coop) G.coop.blastBy = by;
      G.gear.explode(at, r, dmg);
      if (G.coop) G.coop.blastBy = keep;
      for (const p of players()) { const d = Math.hypot(p.pos.x - at.x, p.pos.y + 0.9 - at.y, p.pos.z - at.z); if (d < r) api.hurtP(p, Math.round(pdmg * (1 - (d / r) * 0.6)), at); }
      if (kind === 'fire') { for (const o of api.list) if (o.alive && o.pos.distanceTo(at) < r + 1) api.applyStatus(o, 'burn', 1.5, by); hazard('fire', V().set(at.x, Math.max(0, at.y - 1), at.z), 2.4, 4); }
    }
    function nova(at, r, by) {
      G.fx.puff(at.clone(), { glow: true, s0: 1, s1: r * 2.2, life: 0.45, c0: 0xdff6ff, c1: 0x60b0ff, a0: 1 });
      G.fx.burst(at, 40, [0xdff6ff, 0x9ad8ff, 0xffffff], { speed: 7, size: 0.1, life: 0.8 });
      G.audio.playAt('clank', at, { gain: 1, rate: 0.8 }); G.audio.playAt('saber_hit', at, { gain: 0.7, rate: 1.6 });
      if (!host()) return;
      for (const o of api.list) if (o.alive && o.pos.distanceTo(at) < r) for (let i = 0; i < 4; i++) api.applyStatus(o, 'chill', 1, by);
      for (const p of players()) if (p.pos.distanceTo(at) < r) api.hurtP(p, 8, at, { slow: 2 });
      net({ t: 'nova', p: r2(at), r });
    }
    function die(z, gore, dir, opt) {
      const T = z.T; const X = z.body.x; const by = opt.by || 'h';
      const at = V().set(z.pos.x, z.pos.y + 1.0 * T.scale, z.pos.z);
      if (z.elite === 'volatile' && host()) queue.push({ t: 0.35, f: () => blast(at, 3.6, 70, 22, by) });
      if (T.kind === 'bloat') {
        G.fx.gib(X.belly, V().set(G.rng.range(-2, 2), 7, G.rng.range(-2, 2)));
        G.fx.burst(at, 40, [0xb8ff50, 0x8a5a8a, 0xc8d0a8], { speed: 7, size: 0.14, life: 1 });
        if (host()) { queue.push({ t: opt.pop ? 0.02 : 0.15, f: () => blast(at, 4.4, 95, opt.pop ? 32 : 18, by) }); hazard('acid', V().set(z.pos.x, z.pos.y, z.pos.z), 2.4, 5); }
        return 'apart';
      }
      if (T.kind === 'burn' && host()) queue.push({ t: 0.25, f: () => blast(at, 3.2, 45, 14, by, 'fire') });
      if (T.kind === 'frost' && host()) queue.push({ t: 0.2, f: () => nova(at, 4.8, by) });
      if (T.kind === 'shield' && z.shieldHp > 0) breakShield(z, dir, true);
      if (T.kind === 'armor' && z.armor > 0) breakArmor(z, dir, true);
      if (T.rig) {
        const b = z.body; b.root.updateMatrixWorld(true);
        const meshes = []; (T.rig === 'spider' ? X.spider : X.eggG).traverse((o) => { if (o.isMesh) meshes.push(o); });
        for (const m of meshes) G.fx.gib(m, V().set(G.rng.range(-3, 3), G.rng.range(3, 7), G.rng.range(-3, 3)).addScaledVector(dir, 2));
        const goo = T.rig === 'egg' ? [0xd8d0b0, 0x9aff40, 0x5ac030] : [0x9aff40, 0x3a8a20, 0x2a1a30];
        G.fx.burst(at, T.boss ? 60 : 24, goo, { speed: T.boss ? 9 : 5, size: T.boss ? 0.2 : 0.1, life: 0.9 });
        G.fx.splat(V().set(z.pos.x, z.pos.y, z.pos.z), (T.boss ? 3 : 1) * T.scale);
        G.audio.playAt('gore', at, { gain: 1, rate: T.boss ? 0.5 : 1.3 });
        b.root.visible = false; z.dying = 0;
        return 'none';
      }
      return undefined;
    }
    function breakShield(z, dir, quiet) {
      const X = z.body.x; if (!X.shield.visible) return; z.shieldHp = 0;
      G.fx.gib(X.shield, V().copy(dir || V().set(0, 0, 1)).multiplyScalar(-3).add(V().set(G.rng.range(-1, 1), 4, G.rng.range(-1, 1))));
      X.shield.visible = false;
      G.audio.playAt('clank', z.pos, { gain: 1.2, rate: 0.6 });
      if (!quiet) G.ui.pop('VỠ KHIÊN', 'critword', V().set(z.pos.x, z.pos.y + 2.4 * z.T.scale, z.pos.z));
    }
    function breakArmor(z, dir, quiet) {
      const X = z.body.x; if (!X.plate.visible) return; z.armor = 0;
      for (const k of ['plate', 'padL', 'padR', 'helmet', 'visor']) { G.fx.gib(X[k], V().set(G.rng.range(-3, 3), G.rng.range(3, 6), G.rng.range(-3, 3))); X[k].visible = false; }
      G.audio.playAt('clank', z.pos, { gain: 1.3, rate: 0.5 });
      if (!quiet) G.ui.pop('VỠ GIÁP', 'critword', V().set(z.pos.x, z.pos.y + 2.6 * z.T.scale, z.pos.z));
    }
    function sparks(at, n) { G.fx.burst(at, n, [0xfff0a0, 0xffc040, 0xffffff], { speed: 5, size: 0.05, life: 0.3 }); }
    // a hit that a shield or armour soaks up; returns the damage that gets through
    function hit(z, amount, part, dir, opt, visual) {
      if (opt.dot) return amount;
      const T = z.T;
      if (z.shieldHp > 0 && !opt.blast && part !== 'head') {
        const f = fwd(z);
        if (dir.x * f.x + dir.z * f.z < -0.3) {
          const at = V().set(z.pos.x, z.pos.y + 0.9 * T.scale, z.pos.z).addScaledVector(f, 0.5 * T.scale);
          sparks(at, 8); if (G.rng.chance(0.5)) G.audio.playAt('clank', at, { gain: 0.5, rate: G.rng.range(1.2, 1.6) });
          z.hitNote = { mul: 0, word: 'CHẶN' };
          if (!visual) { z.shieldHp -= amount * (opt.cut === 'axe' ? 2.5 : opt.cut ? 1.5 : 1); if (z.fp) z.fp.v -= 3; if (z.shieldHp <= 0) breakShield(z, dir); }
          return 0;
        }
      }
      if (z.armor > 0 && part !== 'leg') {
        sparks(V().set(z.pos.x, z.pos.y + (part === 'head' ? 1.7 : 1.1) * T.scale, z.pos.z), 5);
        z.hitNote = { mul: 0.3 };
        if (!visual) { z.armor -= amount * (opt.blast ? 1.5 : opt.cut === 'axe' ? 2 : 1); if (z.armor <= 0) breakArmor(z, dir); }
        return amount * 0.3;
      }
      return amount;
    }
    // a melee bite landing: frost and spiders slow, a vampire elite heals
    function onMelee(z) {
      if (z.elite === 'vampire') { z.hp = Math.min(z.maxHp, z.hp + z.dmg * 3); G.fx.burst(V().set(z.pos.x, z.pos.y + 1.2 * z.T.scale, z.pos.z), 8, [0xc030ff, 0xff4080], { speed: 2, size: 0.08, life: 0.5, grav: -2 }); }
      return z.T.hitFx;
    }
    function shriek(z) {
      const at = V().set(z.pos.x, z.pos.y + 1.7 * z.T.scale, z.pos.z);
      shriekFx(at);
      for (const o of api.list) if (o !== z && o.alive && o.pos.distanceTo(z.pos) < 11) { o.rage = Math.max(o.rage, 6); }
      for (let i = 0; i < 2; i++) summon('runner', z.pos, 1.4);
      net({ t: 'shriek', p: r2(at) });
    }
    function shriekFx(at) {
      G.audio.playAt('screech', at, { gain: 1.6, rate: 0.5 }); G.audio.playAt('screech', at, { gain: 1, rate: 0.75 });
      for (let i = 0; i < 3; i++) setTimeout(() => G.fx.puff(at.clone(), { glow: true, s0: 0.5, s1: 9, life: 0.5, c0: 0xc050ff, c1: 0x6a20a0, a0: 0.7 }), i * 120);
      const d = G.player.pos.distanceTo(at); if (d < 16) G.player.shake.v += (16 - d) * 0.5;
    }
    function summon(type, pos, spread) {
      const z = api.spawn(type, G.wave ? G.wave.n : 1, { x: pos.x, z: pos.z, dir: [0, 1], name: 's' });
      if (!z) return null;
      z.pos.set(pos.x + G.rng.range(-spread, spread), pos.y, pos.z + G.rng.range(-spread, spread));
      if (G.world.overlaps([z.pos.x - 0.3, z.pos.y, z.pos.z - 0.3], [z.pos.x + 0.3, z.pos.y + 1.6, z.pos.z + 0.3])) z.pos.set(pos.x, pos.y, pos.z);
      if (G.wave) G.wave.total++;
      G.fx.burst(V().set(z.pos.x, z.pos.y + 0.5, z.pos.z), 10, type === 'egg' ? [0xd8d0b0, 0x9aff40] : [0x6a20a0, 0xc050ff, 0x2a1a30], { speed: 3, size: 0.1, life: 0.6 });
      return z;
    }

    // ---- looks: run after the walk cycle on host and guests alike ----
    function pose(z, dt, sp) {
      const T = z.T; const b = z.body; const X = b.x; const k = T.kind; const act = z.act; const ak = act ? Math.min(1, act.t / act.dur) : 0;
      if (act && !host()) act.t += dt;
      const wind = z.windT >= 0 ? Math.min(1, z.windT / T.windup) : 0;
      if (k === 'spit') {
        const pulse = 1 + 0.08 * Math.sin(z.bob * 5 + z.phase);
        X.sac.scale.setScalar(act ? 1 + 0.6 * Math.min(1, act.t / 0.55) : pulse);
        X.sac.material.emissive.setHex(act && act.t < 0.6 ? 0x6aff20 : 0x2a6a10);
        if (act) { b.head.rotation.x = act.t < 0.55 ? -0.7 * (act.t / 0.55) : BZ.damp(b.head.rotation.x, 0.25, 10, dt); b.armL.rotation.x = b.armR.rotation.x = -0.4; }
        if (G.rng.chance(dt * 1.5)) G.fx.puff(V().set(z.pos.x, z.pos.y + 1.45 * T.scale, z.pos.z).addScaledVector(fwd(z), 0.3), { vel: V().set(0, -1.2, 0), s0: 0.06, s1: 0.03, life: 0.5, c0: 0xb8ff50, c1: 0x5ac030, a0: 0.9 });
      } else if (k === 'bloat') {
        const s = act ? 1 + 0.45 * ak + 0.08 * Math.sin(act.t * 40) : 1 + 0.04 * Math.sin(z.bob * 3 + z.phase);
        X.bellyP.scale.set(s, s * 0.95, s);
        X.belly.material.emissive.setHex(act ? (Math.sin(act.t * (14 + 30 * ak)) > 0 ? 0x8a1a10 : 0x2a0804) : 0);
        b.armL.rotation.z = -0.35 - (act ? 0.6 * ak : 0); b.armR.rotation.z = 0.35 + (act ? 0.6 * ak : 0);
        b.hips.rotation.z += Math.sin(z.phase) * 0.1;
      } else if (k === 'shield') {
        if (X.shield.visible) { b.armL.rotation.x = -1.35 + Math.sin(z.phase) * 0.05; b.armR.rotation.x = -1.15 - wind * 0.9; X.shieldP.rotation.y = Math.sin(z.phase) * 0.06; X.shieldP.position.y = 0.05 + Math.abs(Math.sin(z.phase)) * 0.03; }
      } else if (k === 'shriek') {
        b.armL.rotation.z = act ? -1.1 * Math.min(1, act.t / 0.3) : 0; b.armR.rotation.z = act ? 1.1 * Math.min(1, act.t / 0.3) : 0;
        if (act) { b.head.rotation.x = -0.8 * Math.min(1, act.t / 0.3) + Math.sin(act.t * 50) * 0.05; b.armL.rotation.x = b.armR.rotation.x = -0.4; b.hips.rotation.x = -0.15; }
      } else if (k === 'burn') {
        if (G.rng.chance(dt * 14)) G.fx.puff(V().set(z.pos.x + G.rng.range(-0.25, 0.25) * T.scale, z.pos.y + G.rng.range(0.4, 1.9) * T.scale, z.pos.z + G.rng.range(-0.25, 0.25) * T.scale), { glow: true, vel: V().set(0, 1.4, 0), s0: 0.35, s1: 0.05, life: 0.45, c0: 0xffd060, c1: 0xff3a10, a0: 1 });
        if (z.flash <= 0) for (const m of ['skin', 'shirt', 'pants']) b.mats[m].emissive.setHex(Math.sin(z.bob * 9 + z.phase) > 0 ? 0x5a1c06 : 0x3a1204);
      } else if (k === 'frost') {
        if (G.rng.chance(dt * 6)) G.fx.puff(V().set(z.pos.x + G.rng.range(-0.3, 0.3) * T.scale, z.pos.y + G.rng.range(0.6, 2) * T.scale, z.pos.z + G.rng.range(-0.3, 0.3) * T.scale), { vel: V().set(0, -0.4, 0), s0: 0.1, s1: 0.04, life: 0.8, c0: 0xffffff, c1: 0x9ad8ff, a0: 0.9 });
      } else if (k === 'hound') houndPose(z, dt, sp, wind);
      else if (T.rig === 'spider') spiderPose(z, dt, sp, wind, act);
      else if (T.rig === 'egg') { const r = Math.max(0.5, z.hatch || 5); const s = 1 + 0.06 * Math.sin(z.bob * (3 + 14 / r)); X.eggG.scale.set(s, 1 / s, s); if (z.flash <= 0) b.mats.skin.emissive.setHex(Math.sin(z.bob * (3 + 14 / r)) > 0.6 ? 0x2a5a10 : 0); }
      if (X.gem.visible) { X.gem.position.y = (T.rig || T.quad ? 1.3 : 2.35) + Math.sin(z.bob * 3) * 0.08; X.gem.rotation.y += dt * 2.5; }
      const aura = z.elite || z.rage > 0;
      X.aura.visible = !!aura;
      if (aura) { if (!z.elite) X.aura.material.color.setHex(0xff2a10); const p = 0.4 + 0.15 * Math.sin(z.bob * 6 + z.phase); X.aura.material.opacity = z.elite === 'volatile' ? 0.35 + 0.3 * Math.abs(Math.sin(z.bob * 9)) : p; X.aura.position.y = (T.rig || T.quad ? 0.5 : 1.0); }
    }
    function houndPose(z, dt, sp, wind) {
      const b = z.body; const L = z.leap;
      const g = z.phase * 1.25; const run = Math.min(1, sp / 3);
      b.hips.position.set(0, 0.7 + Math.abs(Math.sin(g)) * 0.06 * run, -0.35);
      b.hips.rotation.set(Math.PI / 2 - 0.08 + Math.sin(g * 2) * 0.05 * run, 0, Math.sin(g) * 0.04);
      const sw = 0.75 * run;
      if (L) {
        const k = Math.min(1, L.t / L.dur);
        b.armL.rotation.x = b.armR.rotation.x = -Math.PI / 2 - 0.9 + k * 0.6; b.legL.rotation.x = b.legR.rotation.x = -Math.PI / 2 + 0.9 - k * 0.3;
        b.hips.rotation.x = Math.PI / 2 - 0.25 + k * 0.35;
      } else {
        b.armL.rotation.x = -Math.PI / 2 + Math.sin(g) * sw; b.armR.rotation.x = -Math.PI / 2 + Math.sin(g + 0.5) * sw;
        b.legL.rotation.x = -Math.PI / 2 + Math.sin(g + Math.PI) * sw; b.legR.rotation.x = -Math.PI / 2 + Math.sin(g + Math.PI + 0.5) * sw;
      }
      b.armL.rotation.z = b.armR.rotation.z = 0;
      b.x.tail.rotation.set(-0.9 + Math.sin(z.bob * 9) * 0.1, 0, Math.sin(z.bob * 7) * 0.5 * (1 - run * 0.6));
      b.head.rotation.set(-Math.PI / 2 + 0.25 - wind * 0.5 + (z.attackT > z.T.rate - 0.12 ? 0.5 : 0) + Math.sin(g * 2) * 0.05 * run, 0, 0);
    }
    function spiderPose(z, dt, sp, wind, act) {
      const X = z.body.x; const L = z.leap; const run = Math.min(1, sp / 2.5);
      const g = z.phase * 1.6;
      for (const l of X.legs) {
        const ph = g + l.i * 1.6 + (l.s > 0 ? 0 : Math.PI);
        const lift = L ? 0.6 : Math.max(0, Math.sin(ph)) * 0.45 * run;
        l.hip.rotation.set(0, l.spread + (L ? 0 : Math.cos(ph) * 0.25 * run), l.s * (0.6 + lift));
        l.knee.rotation.z = -l.s * (0.3 - (L ? 0.6 : 0) + lift * 0.4);
      }
      X.spider.position.y = (L ? 0.1 : 0) + Math.abs(Math.sin(g)) * 0.03 * run;
      X.abd.rotation.x = 0.15 + Math.sin(z.bob * 2) * 0.05 + (act ? 0.3 : 0);
      X.abd.rotation.y = Math.sin(g * 0.5) * 0.08 * run;
      X.ceph.rotation.x = -wind * 0.4 - (act ? 0.5 * Math.min(1, act.t / 0.5) : 0);
      X.spider.rotation.x = act ? -0.2 * Math.min(1, act.t / 0.5) : 0;
    }

    // hit boxes for bodies that are not an upright human
    function boxes(z) {
      const T = z.T; if (!T.quad && !T.rig) return null; const s = T.scale; const p = z.pos; const f = fwd(z);
      if (T.rig === 'egg') return [{ part: 'body', min: [p.x - 0.4 * s, p.y, p.z - 0.4 * s], max: [p.x + 0.4 * s, p.y + 1.0 * s, p.z + 0.4 * s] }];
      const hx = p.x + f.x * (T.quad ? 0.45 : 0.35) * s; const hz = p.z + f.z * (T.quad ? 0.45 : 0.35) * s;
      const bw = T.quad ? 0.4 : 0.55; const top = T.quad ? 0.9 : 0.9;
      return [
        { part: 'body', min: [p.x - bw * s, p.y + 0.2 * s, p.z - bw * s], max: [p.x + bw * s, p.y + top * s, p.z + bw * s] },
        { part: 'head', min: [hx - 0.28 * s, p.y + (T.quad ? 0.7 : 0.3) * s, hz - 0.28 * s], max: [hx + 0.28 * s, p.y + (T.quad ? 1.25 : 0.75) * s, hz + 0.28 * s] },
      ];
    }

    // snapshot flags for the guests: 256 shield up, 512 armour on, 1024 enraged, 2048 busy with its special move
    function flags(z) { return (z.shieldHp > 0 ? 256 : 0) | (z.armor > 0 ? 512 : 0) | (z.rage > 0 ? 1024 : 0) | (z.act || z.leap ? 2048 : 0); }
    function adopt(z, f, e) {
      const X = z.body.x;
      if (z.T.shieldHp && !(f & 256) && X.shield.visible) breakShield(z, null);
      if (z.T.armor && !(f & 512) && X.plate.visible) breakArmor(z, null);
      z.shieldHp = f & 256 ? 1 : 0; z.armor = f & 512 ? 1 : 0; z.rage = f & 1024 ? 1 : 0;
      if (f & 2048) { if (!z.act) z.act = { t: 0, dur: z.T.kind === 'bloat' ? 0.9 : z.T.kind === 'shriek' ? 1.2 : 0.85 }; } else z.act = null;
      const key = e ? ELITE_IDS[e - 1] : null;
      if (key !== z.elite) { if (key) { z.elite = key; const E = BZ.ELITE[key]; X.aura.material.color.setHex(E.col); X.gem.visible = true; X.gem.material.color.setHex(E.col); z.glow = new THREE.Color(E.col).multiplyScalar(0.22).getHex(); z.body.barFg.material.color.setHex(0xf2c23a); z.body.mats.face.userData.eye = E.col; } else { z.elite = null; X.gem.visible = false; z.glow = 0; } }
    }
    const eliteIdx = (z) => (z.elite ? ELITE_IDS.indexOf(z.elite) + 1 : 0);
    function remote(p) {
      const v = (a) => V().set(a[0], a[1], a[2]);
      if (p.t === 'proj') launch(p.kind, v(p.p), v(p.v), true);
      else if (p.t === 'haz') hazard(p.kind, v(p.p), p.r, p.d, true);
      else if (p.t === 'shriek') shriekFx(v(p.p));
      else if (p.t === 'nova') nova(v(p.p), p.r, 'z');
    }

    function update(dt) {
      updateProjs(dt); updateHazards(dt);
      for (let i = queue.length - 1; i >= 0; i--) { const q = queue[i]; q.t -= dt; if (q.t <= 0) { queue.splice(i, 1); q.f(); } }
      const P = G.player; if (P.slowT > 0) P.slowT -= dt; if (P.rootT > 0) P.rootT -= dt;
    }
    function clear() {
      for (const s of projs) G.scene.remove(s.m); projs.length = 0;
      for (const h of hazards) { G.scene.remove(h.m); h.m.material.dispose(); } hazards.length = 0;
      queue.length = 0; G.player.slowT = 0; G.player.rootT = 0;
    }
    return { dress, init, elite, tick, step, pose, hit, onMelee, die, boxes, flags, adopt, eliteIdx, remote, update, clear, playerFx, hazards, projs, summon, hazard };
  };
})();
