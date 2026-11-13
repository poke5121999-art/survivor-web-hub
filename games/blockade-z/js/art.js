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

  // ---- world: hand-painted pixel style, each element lit from the top-left ----
  // Fill a rectangular block (brick, plank, stone) with a bevel: light top row and left column, dark bottom and right.
  const block = (set, x0, y0, w, h, base, rng, o = {}) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let k = 1;
      if (y === 0) k = o.top || 1.2; else if (y === h - 1) k = o.bottom || 0.76;
      else if (x === 0) k = o.left || 1.08; else if (x === w - 1) k = o.right || 0.86;
      if (o.chip && rng.chance(o.chip)) k *= 0.82;
      set(x0 + x, y0 + y, shade(base, k));
    }
  };
  const wrap = (v, n) => ((v % n) + n) % n;

  def('grass_top', 16, 16, ({ set, rng }) => {
    const tones = [0x4f9a34, 0x5aa83a, 0x66b443];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, hex(tones[(BZ.hash('g' + (x >> 1) + ',' + (y >> 1)) % 3)]));
    for (let i = 0; i < 9; i++) { // blade tufts: a light tip over a dark base
      const x = rng.int(0, 15); const y = rng.int(1, 15);
      set(x, y, hex(0x3d7f28)); set(x, wrap(y - 1, 16), hex(0x86cc58));
    }
    if (rng.chance(0.7)) { const x = rng.int(1, 14); const y = rng.int(1, 14); const c = hex(rng.pick([0xf4dc4a, 0xf2f2f2, 0xe86aa8])); set(x, y, c); set(x + 1, y, shade(c, 0.8)); }
  });
  def('dirt', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, hex([0x7c5232, 0x86593a, 0x70492c][BZ.hash('d' + (x >> 1) + ',' + (y >> 1)) % 3]));
    for (let i = 0; i < 7; i++) { const x = rng.int(0, 14); const y = rng.int(0, 14); set(x, y, hex(0x9a9088)); set(x + 1, y + 1, hex(0x5a5048)); }
  });
  def('cobble', 16, 16, ({ set, rng }) => {
    const seeds = []; for (let i = 0; i < 7; i++) seeds.push([rng.range(0, 16), rng.range(0, 16), [0x8e8f93, 0x9c9a95, 0x84878c, 0xa6a39b, 0x93958f][i % 5]]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let d1 = 99; let d2 = 99; let near = null;
      for (const s of seeds) for (const ox of [-16, 0, 16]) for (const oy of [-16, 0, 16]) {
        const d = Math.hypot(x + 0.5 - s[0] - ox, y + 0.5 - s[1] - oy);
        if (d < d1) { d2 = d1; d1 = d; near = [s, ox, oy]; } else if (d < d2) d2 = d;
      }
      if (d2 - d1 < 1.1) { set(x, y, hex(0x4a4a4e)); continue; }
      const [s, ox, oy] = near; const dx = x + 0.5 - s[0] - ox; const dy = y + 0.5 - s[1] - oy;
      const k = 1 + BZ.clamp((-dx - dy) / 6, -1, 1) * 0.16 - (d2 - d1 < 2 ? 0.08 : 0);
      set(x, y, shade(hex(s[2]), k));
    }
  });
  def('stone', 16, 16, ({ set, rng }) => {
    for (let r = 0; r < 2; r++) for (let c = -1; c < 2; c++) {
      const x0 = c * 8 + (r ? 4 : 0); const base = hex([0x9a9c9f, 0x8f9195, 0xa3a29d][BZ.hash('s' + r + c) % 3]);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const X = wrap(x0 + x, 16); const Y = r * 8 + y;
        if (x === 7 || y === 7) { set(X, Y, hex(0x55575b)); continue; }
        let k = y === 0 ? 1.18 : y === 6 ? 0.8 : x === 0 ? 1.08 : x === 6 ? 0.88 : 1;
        if (rng.chance(0.06)) k *= 0.85;
        set(X, Y, shade(base, k));
      }
    }
  });
  def('brick', 16, 16, ({ set, rng }) => {
    for (let r = 0; r < 4; r++) for (let c = -1; c < 2; c++) {
      const x0 = c * 8 + (r & 1 ? 4 : 0); const base = hex([0xa8473a, 0x96402f, 0xb4533f, 0x9c4a3c][BZ.hash('b' + r + ',' + c) % 4]);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
        const X = wrap(x0 + x, 16); const Y = r * 4 + y;
        if (y === 3 || x === 7) { set(X, Y, hex(y === 3 ? 0xb8ab94 : 0xa89c86)); continue; }
        let k = y === 0 ? 1.18 : y === 2 ? 0.84 : x === 0 ? 1.06 : x === 6 ? 0.9 : 1;
        if (rng.chance(0.05)) k *= 0.8;
        set(X, Y, shade(base, k));
      }
    }
  });
  def('plank', 16, 16, ({ set, rng }) => {
    for (let b = 0; b < 4; b++) {
      const base = hex([0xb4844c, 0xa47644, 0xbd8f55, 0xa97b47][b]);
      const seam = (b * 7 + 3) % 16;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
        const Y = b * 4 + y;
        let k = y === 0 ? 1.16 : y === 3 ? 0.7 : 1;
        if (x === seam) k = 0.66;
        if (y === 1 && (x * 5 + b * 3) % 11 < 3) k *= 0.88; // grain streak
        if ((x === seam + 1 || x === seam - 1) && y === 1) { set(x, Y, hex(0x55524c)); continue; } // nail
        set(x, Y, shade(base, k));
      }
    }
  });
  def('log', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const groove = (x + (BZ.hash('l' + (y >> 2)) % 3)) % 4 === 0;
      set(x, y, shade(hex(0x6b4c2e), groove ? 0.7 : x % 4 === 1 ? 1.12 : 1));
    }
  });
  def('log_top', 16, 16, ({ set }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const r = Math.hypot(x - 7.5, y - 7.5);
      set(x, y, r > 6.6 ? hex(0x5a3f25) : hex(Math.floor(r * 0.9) % 2 ? 0xc29a62 : 0xab834e));
    }
  });
  def('leaves', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, hex(0x3a8030));
    for (let i = 0; i < 14; i++) { // leaf clusters: highlight top-left, shade bottom-right
      const x = rng.int(0, 15); const y = rng.int(0, 15);
      set(x, y, hex(0x5cae44)); set(wrap(x + 1, 16), y, hex(0x4c9a3a)); set(x, wrap(y + 1, 16), hex(0x4c9a3a)); set(wrap(x + 1, 16), wrap(y + 1, 16), hex(0x2a6222));
    }
  });
  const roof = (key, a, b) => def(key, 16, 16, ({ set }) => {
    for (let r = 0; r < 4; r++) for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
      const tile = (x + (r & 1) * 2) % 4; const Y = r * 4 + y;
      let k = y === 0 ? 1.2 : y === 3 ? 0.62 : y === 2 ? 0.85 : 1;
      if (tile === 3) k *= 0.82;
      set(x, Y, shade(hex(tile === 0 ? b : a), k));
    }
  });
  roof('roof_red', 0xb8402f, 0xa43629);
  roof('roof_blue', 0x3f6cbc, 0x345ba3);
  roof('roof_green', 0x3f8e4c, 0x347a40);
  const windowTex = (key, lit) => def(key, 16, 16, ({ set }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const frame = x < 2 || y < 2 || x > 13 || y > 13; const bar = x === 7 || x === 8 || y === 7 || y === 8;
      const sill = y > 13;
      let c;
      if (frame || bar) c = sill ? hex(0x9a8a70) : shade(hex(0xe2d8c4), y < 2 || x < 2 ? 1.08 : 0.9);
      else if (lit) c = mix(hex(0xffe08a), hex(0xf2a040), y / 16);
      else c = mix(hex(0x34507a), hex(0x1a2a44), y / 16);
      if (!frame && !bar && (x - y === 3 || x - y === 4) && x < 7) c = lit ? hex(0xfff2c0) : hex(0x6a8ab8);
      set(x, y, c);
    }
  });
  windowTex('glass', false);
  windowTex('glass_lit', true);
  def('door', 16, 32, ({ set, rng }) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
      const frame = x < 1 || x > 14 || y < 1;
      const panel = (x > 2 && x < 7 || x > 8 && x < 13) && (y > 3 && y < 14 || y > 16 && y < 29);
      const panelEdge = panel && ((x === 3 || x === 9) || (y === 4 || y === 17));
      const knob = x === 12 && (y === 16 || y === 15);
      set(x, y, knob ? hex(0xe8c848) : frame ? hex(0x3b2614) : panelEdge ? hex(0x4a2e16) : panel ? hex(0x84583a) : shade(hex(0x6e4628), x % 5 === 0 ? 0.9 : 1));
    }
  });
  def('crate', 16, 16, ({ set }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const border = x < 2 || y < 2 || x > 13 || y > 13;
      const brace = Math.abs(x - y) < 1.5;
      const nail = (x === 1 || x === 14) && (y === 1 || y === 14);
      let c;
      if (nail) c = hex(0x3a3a3a);
      else if (border) c = shade(hex(0x8a5e30), y < 1 || x < 1 ? 1.15 : y > 14 || x > 14 ? 0.75 : 1);
      else if (brace) c = shade(hex(0x9a6a36), x - y < 0 ? 1.12 : 0.85);
      else c = shade(hex(0xc8954f), (y - 2) % 4 === 3 ? 0.82 : (y - 2) % 4 === 0 ? 1.1 : 1);
      set(x, y, c);
    }
  });
  def('crate_metal', 16, 16, ({ set }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const border = x < 1 || y < 1 || x > 14 || y > 14;
      const rivet = (x === 2 || x === 13) && (y === 2 || y === 13);
      const rib = y % 4 === 1; const ribShadow = y % 4 === 2;
      set(x, y, rivet ? hex(0xd8dce0) : border ? hex(0x2c3238) : shade(hex(0x6a7c56), rib ? 1.18 : ribShadow ? 0.78 : 1));
    }
  });
  def('water', 16, 16, ({ set }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const wave = (x + Math.round(Math.sin(y * 0.8) * 2)) % 6 === 0;
      set(x, y, wave ? hex(0x8fc8ec) : hex((x + y) % 7 === 0 ? 0x3478b8 : 0x3b86c6));
    }
  });
  def('asphalt', 16, 16, ({ set, rng }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, hex([0x45474c, 0x4b4d52, 0x414348][BZ.hash('a' + (x >> 1) + ',' + (y >> 1)) % 3]));
    for (let i = 0; i < 6; i++) set(rng.int(0, 15), rng.int(0, 15), hex(0x6a6c70));
    if (rng.chance(0.8)) { const x = rng.int(2, 12); const y = rng.int(2, 12); set(x, y, hex(0x34363a)); set(x + 1, y + 1, hex(0x34363a)); set(x + 2, y + 1, hex(0x34363a)); }
  });
  def('road_line', 8, 8, ({ set }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, hex(y === 0 ? 0xffe27a : 0xe8c23a)); });
  def('lamp', 8, 8, ({ set }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, hex(x === 0 || y === 0 || x === 7 || y === 7 ? 0xd8a840 : 0xfff2b0)); });
  const paintCar = (key, base) => def(key, 16, 16, ({ set }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = y < 2 ? 1.22 : y > 13 ? 0.7 : y === 7 ? 0.85 : 1;
      set(x, y, shade(hex(base), (x + 15 - y) % 13 === 0 && y < 7 ? k * 1.12 : k));
    }
  });
  paintCar('car_red', 0xc8352c);
  paintCar('car_blue', 0x2f6fc0);
  paintCar('car_yellow', 0xe2b22b);
  def('tire', 8, 8, ({ set }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const hub = x >= 2 && x <= 5 && y >= 2 && y <= 5; const cap = (x === 3 || x === 4) && (y === 3 || y === 4);
      set(x, y, hex(cap ? 0xd0d0d0 : hub ? 0x8a8a8a : (x + y) % 3 === 0 ? 0x2a2a2c : 0x1e1e20));
    }
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

  def('z_wing', 16, 8, ({ set }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
      const bone = y === 0 || (x % 5 === 0 && y < 6); const torn = y === 7 && x % 3 === 1;
      set(x, y, torn ? [0, 0, 0] : hex(bone ? 0x2a1c2c : (x + y) % 4 === 0 ? 0x4a3450 : 0x5a3e60), torn ? 0 : 255);
    }
  });

  // ---- hired soldiers ----
  def('a_skin', 8, 8, ({ set }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, hex((x + y) % 5 === 0 ? 0xc89070 : 0xd9a07c)); });
  def('a_face', 8, 8, ({ set }) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, hex(0xd9a07c));
    for (const ex of [1, 5]) { set(ex, 3, hex(0xffffff)); set(ex + 1, 3, hex(0x2a3a5a)); set(ex, 2, hex(0x5a3a22)); set(ex + 1, 2, hex(0x5a3a22)); }
    for (let x = 3; x < 5; x++) set(x, 6, hex(0x9a5a40));
  });
  def('a_pants', 8, 8, ({ set }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, hex(y > 5 ? 0x2a2420 : (x + y) % 4 === 0 ? 0x3d4a2c : 0x485634)); });
  def('a_helmet', 8, 8, ({ set }) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, hex(y === 0 ? 0x7a8a52 : y === 7 ? 0x3a4426 : (x * 3 + y) % 7 === 0 ? 0x4a5630 : 0x5c6a3e)); });
  def('glove', 4, 4, ({ set }) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) set(x, y, hex(y === 3 ? 0x5a4a3a : x === 0 ? 0x4a3c30 : 0x3a2e24)); }, { noMip: true });

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
