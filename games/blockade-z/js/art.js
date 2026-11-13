// Pixel textures drawn by code, Lambert materials, and the box Builder that
// merges every box of one material into a single mesh.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  // Flat painted colour reads better than per-pixel noise (Pixel Gun-style lesson): keep only a trace of grain.
  const GRAIN = 0.35;
  const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  function paint(key, w, h, draw, opts = {}) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    const rng = BZ.rng('tex:' + key);
    const set = (x, y, c, a = 255) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      img.data[i] = BZ.clamp(c[0], 0, 255); img.data[i + 1] = BZ.clamp(c[1], 0, 255);
      img.data[i + 2] = BZ.clamp(c[2], 0, 255); img.data[i + 3] = a;
    };
    const fill = (c, jit = 0) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, shade(c, 1 + (rng.next() - 0.5) * GRAIN * jit)); };
    draw({ set, fill, rng, w, h });
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = opts.noMip ? THREE.NearestFilter : THREE.NearestMipmapLinearFilter;
    tex.generateMipmaps = !opts.noMip;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    tex.name = 'bz_' + key;
    return tex;
  }

  const T = {};
  const def = (key, w, h, draw, opts) => { T[key] = { w, h, draw, opts }; };

  // ---- world ----
  def('grass_top', 16, 16, ({ set, fill, rng, w, h }) => {
    fill(hex(0x5fae3c), 0.18);
    for (let i = 0; i < 26; i++) set(rng.int(0, w - 1), rng.int(0, h - 1), hex(rng.pick([0x4c9530, 0x77c24a, 0x6bb843])));
    if (rng.chance(0.9)) set(rng.int(1, 14), rng.int(1, 14), hex(rng.pick([0xf2e15a, 0xf07ab8, 0xffffff])));
  });
  def('dirt', 16, 16, ({ set, fill, rng }) => {
    fill(hex(0x8a5a35), 0.2);
    for (let i = 0; i < 18; i++) set(rng.int(0, 15), rng.int(0, 15), hex(rng.pick([0x6e4428, 0xa06c43, 0x7a7068])));
  });
  def('cobble', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const cell = ((x >> 2) + (y >> 2) * 7 + ((y >> 2) & 1) * 2) % 5;
      const edge = (x & 3) === 3 || (y & 3) === 3;
      const base = hex([0x8c8c8c, 0x9b9b98, 0x7f8082, 0xa5a39d, 0x888a8c][cell]);
      set(x, y, edge ? hex(0x5a5a5c) : shade(base, 1 + (rng.next() - 0.5) * GRAIN * 0.12));
    }
  });
  def('stone', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = y >> 3; const off = row & 1 ? 4 : 0;
      const edge = (y & 7) === 7 || ((x + off) & 7) === 7;
      set(x, y, edge ? hex(0x55575a) : shade(hex(0x9a9c9e), 1 + (rng.next() - 0.5) * GRAIN * 0.16));
    }
  });
  def('brick', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = y >> 2; const off = row & 1 ? 4 : 0;
      const mortar = (y & 3) === 3 || ((x + off) & 7) === 7;
      const tone = BZ.hash('b' + row + ((x + off) >> 3)) % 3;
      const base = hex([0xa44a3a, 0x93402f, 0xb35644][tone]);
      set(x, y, mortar ? hex(0xc9bba3) : shade(base, 1 + (rng.next() - 0.5) * GRAIN * 0.14));
    }
  });
  def('plank', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const board = y >> 2; const seam = (y & 3) === 3;
      const end = (x + board * 5) % 16 === 0;
      const base = hex([0xb98a52, 0xa77a45, 0xc29558, 0xae8049][board]);
      const grain = Math.sin((x + board * 3) * 0.9) * 0.05;
      set(x, y, seam || end ? hex(0x6b4a28) : shade(base, 1 + grain + (rng.next() - 0.5) * GRAIN * 0.08));
    }
  });
  def('log', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const stripe = (x * 3 + (y >> 2)) % 5 === 0;
      set(x, y, shade(hex(stripe ? 0x4a3420 : 0x6b4c2e), 1 + (rng.next() - 0.5) * GRAIN * 0.15));
    }
  });
  def('log_top', 16, 16, ({ set }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const r = Math.hypot(x - 7.5, y - 7.5);
      set(x, y, r > 6.5 ? hex(0x5a3f25) : hex(Math.floor(r) % 2 ? 0xb8925b : 0xa27d4a));
    }
  });
  def('leaves', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = rng.next();
      set(x, y, hex(v < 0.15 ? 0x2c6a22 : v < 0.55 ? 0x3d8a2c : v < 0.9 ? 0x4ea03a : 0x65b84a));
    }
  });
  const roof = (key, a, b) => def(key, 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const lip = (y & 3) === 3; const scal = ((x + ((y >> 2) & 1) * 2) & 3) === 0;
      set(x, y, lip ? shade(hex(b), 0.75) : shade(hex(scal ? b : a), 1 + (rng.next() - 0.5) * GRAIN * 0.1));
    }
  });
  roof('roof_red', 0xb43c2f, 0x8f2c22);
  roof('roof_blue', 0x3c66b4, 0x2c4b8f);
  roof('roof_green', 0x3f8a4a, 0x2d6a37);
  def('glass', 16, 16, ({ set }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const frame = x < 2 || y < 2 || x > 13 || y > 13 || x === 7 || x === 8 || y === 7 || y === 8;
      const glint = (x - y === 3 || x - y === 4) && x > 2 && x < 7;
      set(x, y, frame ? hex(0xe8e0d0) : glint ? hex(0xd8f0ff) : mix(hex(0x6fa8d8), hex(0x2f5f8f), y / 16));
    }
  });
  def('door', 16, 32, ({ set, rng }) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
      const frame = x < 1 || x > 14 || y < 1;
      const panel = (x === 3 || x === 12) && y > 3 && y < 29;
      const knob = x === 12 && y === 17;
      set(x, y, knob ? hex(0xe0c040) : frame ? hex(0x3b2614) : panel ? hex(0x5a3a1e) : shade(hex(0x7a5030), 1 + (rng.next() - 0.5) * GRAIN * 0.1));
    }
  });
  def('crate', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const border = x < 2 || y < 2 || x > 13 || y > 13;
      const brace = Math.abs(x - y) < 1.5 || Math.abs(x + y - 15) < 1.5;
      const nail = (x === 1 || x === 14) && (y === 1 || y === 14);
      set(x, y, nail ? hex(0x404040) : border || brace ? shade(hex(0x8f6232), 1 + (rng.next() - 0.5) * GRAIN * 0.1) : shade(hex(0xc8954f), 1 + (rng.next() - 0.5) * GRAIN * 0.12));
    }
  });
  def('crate_metal', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const border = x < 1 || y < 1 || x > 14 || y > 14;
      const rivet = (x === 2 || x === 13) && (y === 2 || y === 13);
      const rib = y % 4 === 0;
      set(x, y, rivet ? hex(0xd0d4d8) : border ? hex(0x33393f) : shade(hex(rib ? 0x5b6b4a : 0x6d7f58), 1 + (rng.next() - 0.5) * GRAIN * 0.1));
    }
  });
  def('water', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const wave = (x + Math.round(Math.sin(y * 0.8) * 2)) % 6 === 0;
      set(x, y, wave ? hex(0x9fd4f0) : shade(hex(0x3b86c6), 1 + (rng.next() - 0.5) * GRAIN * 0.1));
    }
  });
  def('asphalt', 16, 16, ({ fill, set, rng }) => {
    fill(hex(0x4a4c50), 0.16);
    for (let i = 0; i < 10; i++) set(rng.int(0, 15), rng.int(0, 15), hex(0x5e6064));
  });
  def('lamp', 8, 8, ({ fill }) => fill(hex(0xfff2b0), 0.05));
  const paintCar = (key, base) => def(key, 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const hi = y < 3; const lo = y > 13;
      set(x, y, shade(hex(base), (hi ? 1.18 : lo ? 0.75 : 1) + (rng.next() - 0.5) * GRAIN * 0.05));
    }
  });
  paintCar('car_red', 0xc8352c);
  paintCar('car_blue', 0x2f6fc0);
  paintCar('car_yellow', 0xe2b22b);
  def('tire', 8, 8, ({ set }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, hex((x === 3 || x === 4) && (y === 3 || y === 4) ? 0x9a9a9a : 0x1e1e20));
  });
  def('cloud', 8, 8, ({ fill }) => fill([245, 247, 250], 0.04));

  // ---- weapons and arm ----
  def('metal_dark', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const edge = y === 0 || x === 0; const line = y === 8;
      set(x, y, edge ? hex(0x6a717a) : line ? hex(0x2a2d32) : shade(hex(0x464c55), 1 + (rng.next() - 0.5) * GRAIN * 0.06));
    }
  });
  def('metal', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, y === 0 ? hex(0xd0d6dc) : shade(hex(0x9aa2aa), 1 + (rng.next() - 0.5) * GRAIN * 0.06));
  });
  def('wood_gun', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, shade(hex((x + y * 2) % 7 === 0 ? 0x5e3a1c : 0x8a5a2e), 1 + (rng.next() - 0.5) * GRAIN * 0.1));
  });
  def('gold', 16, 16, ({ fill, set, rng }) => {
    fill(hex(0xd9a826), 0.1);
    for (let i = 0; i < 6; i++) set(rng.int(0, 15), rng.int(0, 15), hex(0xfff0a0));
  });
  def('accent_orange', 8, 8, ({ fill }) => fill(hex(0xf07a22), 0.08));
  def('accent_green', 8, 8, ({ fill }) => fill(hex(0x4fc26a), 0.08));
  def('sleeve', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const camo = BZ.hash('c' + (x >> 2) + ',' + (y >> 2)) % 4;
      set(x, y, shade(hex([0x4c5a33, 0x5f6e3e, 0x3d4729, 0x6b5a3a][camo]), 1 + (rng.next() - 0.5) * GRAIN * 0.08));
    }
  });
  def('hand', 8, 8, ({ fill }) => fill(hex(0xe0ac7e), 0.06));
  def('flash', 16, 16, ({ set }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = Math.abs(x - 7.5); const dy = Math.abs(y - 7.5);
      const star = dx < 1.5 || dy < 1.5 || Math.abs(dx - dy) < 1.2;
      const r = Math.max(dx, dy);
      if (star && r < 8) set(x, y, r < 3 ? [255, 255, 220] : [255, 190, 70], r < 3 ? 255 : 220);
      else set(x, y, [0, 0, 0], 0);
    }
  }, { noMip: true });


  // ---- gun voxels: flat colour, lighter top row and left column so every box reads as a chunky cell ----
  const cell = (key, base, opts = {}) => def(key, 4, 4, ({ set }) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const top = y === 3; const left = x === 0; const low = y === 0;
      set(x, y, shade(hex(base), top ? 1.2 : left ? 1.1 : low ? 0.8 : 1));
    }
  }, { noMip: true });
  cell('g_body', 0x2a2e35); cell('g_body2', 0x434a54); cell('g_steel', 0x8d97a3); cell('g_edge', 0xa9b8c6);
  cell('g_wood', 0x8a5530); cell('g_grip', 0x1b1d21);
  cell('g_orange', 0xf08a24); cell('g_red', 0xd8322a); cell('g_lime', 0x7fd63a); cell('g_blue', 0x2f7de0); cell('g_gold', 0xf2c23a);
  cell('g_glow_orange', 0xffa040); cell('g_glow_lime', 0xb6ff6a); cell('g_glow_blue', 0x6ad0ff); cell('g_glow_red', 0xff5a4a);
  def('eyes_glow', 8, 8, ({ set }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, [0, 0, 0]);
    for (const ex of [1, 5]) { set(ex, 3, [255, 255, 255]); set(ex + 1, 3, [255, 255, 255]); }
  });
  def('fire', 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = y / 8 + (rng.next() - 0.5) * 0.3;
      set(x, y, hex(v < 0.3 ? 0xfff3a0 : v < 0.6 ? 0xffb03a : 0xe8541e));
    }
  });
  def('glow', 32, 32, ({ set }) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const r = Math.hypot(x - 15.5, y - 15.5) / 16; const a = Math.max(0, 1 - r); const q = Math.round(a * a * 6) / 6;
      set(x, y, [255, 200, 120], Math.round(q * 200));
    }
  }, { noMip: true });
  // ---- zombies ----
  const skin = (key, base, spot) => def(key, 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, hex(rng.chance(0.18) ? spot : base));
  });
  skin('z_skin', 0x9db08a, 0x7c8f6c);
  skin('z_skin_brute', 0x5d7f4f, 0x435d38);
  skin('z_skin_runner', 0x8fae6a, 0x6c8a4e);
  const face = (key, base, eye, wide) => def(key, 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, shade(hex(base), 1 + (rng.next() - 0.5) * GRAIN * 0.1));
    for (const ex of [1, 5]) { set(ex, 3, hex(eye)); set(ex + 1, 3, hex(eye)); if (wide) { set(ex, 2, hex(0x101010)); set(ex + 1, 2, hex(0x101010)); } }
    for (let x = 2; x < 6; x++) set(x, 6, hex(0x2a1410));
    set(3, 5, hex(0x2a1410));
    set(5, 7, hex(0x8a1c18));
  });
  face('z_face', 0x9db08a, 0xd81e1e, false);
  face('z_face_runner', 0x8fae6a, 0xffd23a, false);
  face('z_face_brute', 0x5d7f4f, 0xff3b1f, true);
  const shirt = (key, base, skinHex) => def(key, 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const torn = (y > 5 && rng.chance(0.35)) || rng.chance(0.06);
      set(x, y, torn ? hex(skinHex) : shade(hex(base), 1 + (rng.next() - 0.5) * GRAIN * 0.12));
    }
    set(rng.int(1, 6), rng.int(1, 4), hex(0x7a1a14));
  });
  def('z_vest', 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const stripe = y === 4; const torn = y > 5 && rng.chance(0.3);
      set(x, y, torn ? hex(0x9db08a) : stripe ? hex(0xe8f0f0) : shade(hex(0xe5762a), 1 + (rng.next() - 0.5) * GRAIN * 0.12));
    }
    set(rng.int(1, 6), rng.int(1, 3), hex(0x7a1a14));
  });
  shirt('z_shirt_red', 0xb03d3d, 0x8fae6a);
  shirt('z_shirt_dark', 0x3a3a44, 0x5d7f4f);
  const pants = (key, base) => def(key, 8, 8, ({ set, rng }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, shade(hex(base), 1 + (rng.next() - 0.5) * GRAIN * 0.14));
  });
  pants('z_pants', 0x7d6c48);
  pants('z_pants_dark', 0x2c2a2a);
  pants('z_pants_brown', 0x6a4a2c);

  // ---- pickups ----
  def('medkit', 8, 8, ({ set }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const cross = (x >= 3 && x <= 4 && y >= 1 && y <= 6) || (y >= 3 && y <= 4 && x >= 1 && x <= 6);
      set(x, y, hex(cross ? 0xe02828 : 0xf4f4f4));
    }
  });
  def('ammo_box', 8, 8, ({ set }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const band = y === 2 || y === 3; const shell = band && x % 2 === 1;
      set(x, y, hex(shell ? 0xe2b22b : band ? 0x2d3320 : 0x56663c));
    }
  });

  const texCache = new Map();
  BZ.tex = (key) => {
    if (!texCache.has(key)) {
      const d = T[key];
      if (!d) { console.error('[art] unknown texture ' + key); return BZ.tex('metal'); }
      texCache.set(key, paint(key, d.w, d.h, d.draw, d.opts));
    }
    return texCache.get(key);
  };
  BZ.texKeys = () => Object.keys(T);

  const matCache = new Map();
  BZ.mat = (key, opts = {}) => {
    const id = key + JSON.stringify(opts);
    if (!matCache.has(id)) {
      const m = new THREE.MeshLambertMaterial({ map: BZ.tex(key), vertexColors: !!opts.vc, ...(opts.emissive ? { emissive: opts.emissive, emissiveMap: BZ.tex(key) } : {}) });
      if (opts.transparent) { m.transparent = true; m.alphaTest = 0.5; }
      m.name = id;
      matCache.set(id, m);
    }
    return matCache.get(id);
  };

  // Faces: normal, u axis, v axis (u x v = normal), and the corner the face starts from.
  const FACES = {
    px: { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], o: (a, b) => [b[0], a[1], b[2]], du: (a, b) => b[2] - a[2], dv: (a, b) => b[1] - a[1] },
    nx: { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], o: (a) => [a[0], a[1], a[2]], du: (a, b) => b[2] - a[2], dv: (a, b) => b[1] - a[1] },
    py: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], o: (a, b) => [a[0], b[1], b[2]], du: (a, b) => b[0] - a[0], dv: (a, b) => b[2] - a[2] },
    ny: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], o: (a) => [a[0], a[1], a[2]], du: (a, b) => b[0] - a[0], dv: (a, b) => b[2] - a[2] },
    pz: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], o: (a, b) => [a[0], a[1], b[2]], du: (a, b) => b[0] - a[0], dv: (a, b) => b[1] - a[1] },
    nz: { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], o: (a, b) => [b[0], a[1], a[2]], du: (a, b) => b[0] - a[0], dv: (a, b) => b[1] - a[1] },
  };
  const FACE_KEYS = Object.keys(FACES);
  const FACE_LIGHT = { px: 0.86, nx: 0.86, py: 1, ny: 0.62, pz: 0.93, nz: 0.8 };

  class Builder {
    constructor(seed = 'b') {
      this.batches = new Map();
      this.rng = BZ.rng(seed);
      this.m = new THREE.Matrix4();
      this.stack = [];
      this._v = new THREE.Vector3();
      this._n = new THREE.Vector3();
      this._nm = new THREE.Matrix3();
    }
    push(m) { this.stack.push(this.m.clone()); this.m.multiply(m); return this; }
    pop() { this.m = this.stack.pop(); return this; }
    batch(key) {
      let b = this.batches.get(key);
      if (!b) { b = { p: [], n: [], u: [], c: [], i: [] }; this.batches.set(key, b); }
      return b;
    }
    // mats: a key, or { top, bottom, side, px, nx, py, ny, pz, nz }. uv: 'world' (1 tile per metre * scale) or 'fit'.
    box(min, max, mats, opt = {}) {
      const uv = opt.uv || 'world';
      const s = opt.uvScale || 1;
      const tint = opt.tint || [1, 1, 1];
      const vary = opt.vary == null ? 0.06 : opt.vary;
      const k = 1 + (this.rng.next() - 0.5) * vary * 2;
      this._nm.getNormalMatrix(this.m);
      for (const f of FACE_KEYS) {
        if (opt.skip && opt.skip.includes(f)) continue;
        const key = typeof mats === 'string' ? mats
          : mats[f] || (f === 'py' ? mats.top : f === 'ny' ? mats.bottom || mats.side : mats.side) || mats.all;
        if (!key) continue;
        const F = FACES[f];
        const b = this.batch(key);
        const o = F.o(min, max);
        const du = F.du(min, max); const dv = F.dv(min, max);
        const base = b.p.length / 3;
        const u0 = uv === 'world' ? (o[0] * F.u[0] + o[1] * F.u[1] + o[2] * F.u[2]) * s : 0;
        const v0 = uv === 'world' ? (o[0] * F.v[0] + o[1] * F.v[1] + o[2] * F.v[2]) * s : 0;
        const uw = uv === 'world' ? du * s : 1;
        const vh = uv === 'world' ? dv * s : 1;
        const light = (opt.flat ? 1 : FACE_LIGHT[f]) * k;
        const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
        this._n.set(F.n[0], F.n[1], F.n[2]).applyMatrix3(this._nm).normalize();
        for (const [cu, cv] of corners) {
          this._v.set(
            o[0] + F.u[0] * du * cu + F.v[0] * dv * cv,
            o[1] + F.u[1] * du * cu + F.v[1] * dv * cv,
            o[2] + F.u[2] * du * cu + F.v[2] * dv * cv,
          ).applyMatrix4(this.m);
          b.p.push(this._v.x, this._v.y, this._v.z);
          b.n.push(this._n.x, this._n.y, this._n.z);
          b.u.push(u0 + uw * cu, v0 + vh * cv);
          b.c.push(tint[0] * light, tint[1] * light, tint[2] * light);
        }
        b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      return this;
    }
    build(opts = {}) {
      const group = new THREE.Group();
      for (const [key, b] of this.batches) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
        g.setIndex(b.i);
        g.computeBoundingSphere();
        const matOpts = { vc: true, ...(opts.matOpts && opts.matOpts[key]) };
        const mesh = new THREE.Mesh(g, BZ.mat(key, matOpts));
        mesh.castShadow = !!opts.cast;
        mesh.receiveShadow = !!opts.recv;
        mesh.name = key;
        group.add(mesh);
      }
      return group;
    }
  }
  BZ.Builder = Builder;
  BZ.color = { hex, shade, mix };
})();
