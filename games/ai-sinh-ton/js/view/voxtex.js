// One 256 x 256 atlas of 16 px block textures for the battle world, so the island, its props and the satellites draw with
// one material. Blockade Z's own tiles (art.js, through BZ.tex) are copied in; the island's own tiles (grass sides, sand,
// sandstone, snow, ice, void stone, roots, flames, glass) are painted here in the same top-left-lit pixel style.
const THREE = window.THREE;
const BZ = window.BZ;

const N = 16; const SLOTS = 16; const SIZE = N * SLOTS;
const FROM_BZ = ['grass_top', 'dirt', 'cobble', 'stone', 'brick', 'plank', 'log', 'log_top', 'leaves', 'crate', 'asphalt', 'concrete', 'concrete_dark', 'tile', 'metal', 'metal_dark', 'rubble', 'sandbag', 'corrugated', 'burnt', 'road_line', 'crate_metal', 'tire'];

const hash = (a, b, s) => { let h = (a * 374761393 + b * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));

// painters: (set(x, y, [r,g,b]), seed)
function speckle(base, spread, dots, seed) {
  return (set) => {
    const b = rgb(base);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = 1 + (hash(x >> 1, y >> 1, seed) - 0.5) * spread + (hash(x, y, seed + 9) - 0.5) * spread * 0.5;
      set(x, y, shade(b, k));
    }
    for (const [c, n] of dots) for (let i = 0; i < n; i++) set(Math.floor(hash(i, 1, seed + c) * N), Math.floor(hash(i, 2, seed + c) * N), rgb(c));
  };
}
// stone blocks in courses with a bevel (sandstone, void brick, ice blocks)
function courses(base, rows, seed, o = {}) {
  return (set) => {
    const b = rgb(base); const h = N / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (o.half || 4); const w = o.w || 8;
      for (let y = 0; y < h; y++) for (let x = 0; x < N; x++) {
        const xx = (x + off) % N; const bx = xx % w; const tone = 1 + (hash(Math.floor((x + off) / w), r, seed) - 0.5) * (o.vary || 0.14);
        let k = tone * (1 + (hash(x, y + r * h, seed + 3) - 0.5) * 0.08);
        if (y === 0) k *= 1.16; else if (y === h - 1) k *= 0.7; else if (bx === 0) k *= 1.06; else if (bx === w - 1) k *= 0.82;
        set(x, r * h + y, shade(b, k));
      }
    }
    if (o.glyph) for (let i = 0; i < 6; i++) set(5 + (i % 3) * 3, 5 + Math.floor(i / 3) * 5, shade(b, 0.62));
  };
}
const PAINT = {
  grass_side: (set) => {
    speckle(0x6a4a2c, 0.3, [[0x8a6a44, 6], [0x4a3220, 6]], 3)(set);
    for (let x = 0; x < N; x++) { const d = 2 + Math.floor(hash(x, 0, 5) * 3); for (let y = 0; y < d; y++) set(x, y, shade(rgb(0x5aa83a), y === d - 1 ? 0.72 : 1 - y * 0.06)); }
  },
  grass_dark: speckle(0x2f5a3a, 0.35, [[0x4c7a4a, 10], [0x1c3a26, 10], [0x6a8a4a, 3]], 11),
  grass_dark_side: (set) => { speckle(0x3a2c24, 0.3, [[0x5a4232, 6]], 13)(set); for (let x = 0; x < N; x++) { const d = 2 + Math.floor(hash(x, 0, 15) * 3); for (let y = 0; y < d; y++) set(x, y, shade(rgb(0x2f5a3a), 1 - y * 0.1)); } },
  roots: (set) => {
    speckle(0x4a3424, 0.3, [[0x2a1c14, 8]], 21)(set);
    for (let r = 0; r < 3; r++) { let x = Math.floor(hash(r, 0, 22) * N); for (let y = 0; y < N; y++) { set(x, y, rgb(0x7a5a3a)); if (hash(r, y, 23) > 0.6) x = (x + (hash(r, y, 24) > 0.5 ? 1 : N - 1)) % N; } }
  },
  earth: speckle(0x4c3a2e, 0.32, [[0x6a5444, 8], [0x2c221a, 10], [0x7a7068, 4]], 25),
  rock: courses(0x5a5a62, 2, 27, { w: 8, vary: 0.2 }),
  sand: speckle(0xb89a62, 0.18, [[0xd8c08a, 10], [0x8a7048, 10]], 31),
  sandstone: courses(0xa88a58, 4, 33, { w: 8 }),
  sandstone_big: courses(0x9a7e50, 2, 35, { w: 16, half: 8, glyph: true }),
  sand_tile: courses(0x8a7250, 2, 37, { w: 8, half: 0, vary: 0.1 }),
  snow: speckle(0xdce6ee, 0.08, [[0xffffff, 12], [0xb8c8d6, 8]], 41),
  ice: courses(0x8ab8d0, 2, 43, { w: 16, half: 8, vary: 0.08 }),
  frost_metal: (set) => { courses(0x6a7a88, 2, 45, { w: 8, half: 0, vary: 0.06 })(set); for (let i = 0; i < 5; i++) set(Math.floor(hash(i, 3, 46) * N), Math.floor(hash(i, 4, 46) * N), rgb(0xb8c8d6)); },
  void_stone: speckle(0x3a3050, 0.28, [[0x5a4a78, 10], [0x221a30, 10], [0x8a6ac0, 3]], 51),
  void_brick: courses(0x463a5e, 4, 53, { w: 8 }),
  obsidian: speckle(0x1e1a28, 0.4, [[0x3a2e52, 10], [0x6a4aa0, 3]], 55),
  crystal: (set) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const e = Math.min(x, y, N - 1 - x, N - 1 - y); set(x, y, shade([200, 150, 255], 0.75 + e * 0.06 + hash(x, y, 57) * 0.1)); } },
  moss_stone: (set) => { courses(0x5e6a5e, 2, 61, { w: 8 })(set); for (let i = 0; i < 26; i++) set(Math.floor(hash(i, 5, 62) * N), Math.floor(hash(i, 6, 62) * 6), rgb(0x4a7a3a)); },
  puddle: (set) => { speckle(0x2a3038, 0.2, [[0x8aa0b8, 6], [0xc8d8e8, 2]], 71)(set); },
  asphalt_wet: speckle(0x34363c, 0.22, [[0x50545c, 10], [0x22242a, 10]], 73),
  paving: courses(0x6a6a70, 4, 75, { w: 4, half: 2, vary: 0.12 }),
  rust: speckle(0x7a4a30, 0.35, [[0xa86a3a, 8], [0x4a2a1a, 8]], 77),
  leaves_dark: speckle(0x2a4a34, 0.45, [[0x3e6a44, 14], [0x18301e, 12]], 81),
  leaves_teal: speckle(0x2a5a5a, 0.45, [[0x3e7a72, 14], [0x18363a, 12]], 83),
  cap_red: (set) => { speckle(0xb83a3a, 0.15, [], 85)(set); for (let i = 0; i < 7; i++) { const x = Math.floor(hash(i, 7, 86) * 14); const y = Math.floor(hash(i, 8, 86) * 14); set(x, y, [240, 230, 220]); set(x + 1, y, [240, 230, 220]); } },
  flame: (set) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const k = y / N + (hash(x, y, 91) - 0.5) * 0.3; set(x, y, k < 0.35 ? [255, 240, 160] : k < 0.7 ? [255, 170, 60] : [230, 90, 30]); } },
  glass: (set) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const e = Math.min(x, y, N - 1 - x, N - 1 - y); set(x, y, e === 0 ? [80, 60, 40] : [255, 230, 170]); } },
  white: (set) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) set(x, y, [236, 236, 236]); },
  bark_dark: (set) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) set(x, y, shade([70, 52, 40], 0.8 + 0.3 * hash(x >> 1, y >> 2, 93) - (x % 4 === 0 ? 0.15 : 0))); },
  plank_dark: courses(0x4a3626, 4, 95, { w: 16, half: 6, vary: 0.2 }),
  // forest and swamp
  bark_old: (set) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const g = (x % 4 === 0 ? -0.2 : x % 4 === 1 ? 0.08 : 0); set(x, y, shade([92, 70, 50], 0.85 + g + 0.22 * hash(x >> 1, y >> 3, 101) + (hash(x, y, 102) - 0.5) * 0.12)); } for (let i = 0; i < 9; i++) set(Math.floor(hash(i, 1, 103) * N), Math.floor(hash(i, 2, 103) * N), rgb(0x4a7a3a)); },
  leaves_old: speckle(0x24543a, 0.5, [[0x3a7a48, 16], [0x123a24, 14], [0x6a9a4a, 3]], 105),
  moss_floor: speckle(0x35563a, 0.22, [[0x4a6e44, 12], [0x28442e, 12], [0x5a4a30, 5]], 107),
  moss_path: speckle(0x4a4a34, 0.26, [[0x5e5a3e, 12], [0x34402a, 10], [0x6a5a3a, 4]], 109),
  glowcap: (set) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const e = Math.min(x, y, N - 1 - x, N - 1 - y); set(x, y, shade([120, 230, 190], 0.8 + e * 0.04 + hash(x, y, 111) * 0.12)); } for (let i = 0; i < 5; i++) set(2 + Math.floor(hash(i, 3, 112) * 12), 2 + Math.floor(hash(i, 4, 112) * 12), [230, 255, 235]); },
  mud: speckle(0x3e3a20, 0.3, [[0x58502c, 10], [0x2a2812, 12], [0x4a6a30, 4]], 113),
  mud_side: (set) => { speckle(0x3a2e1e, 0.3, [[0x544030, 6], [0x241a10, 8]], 115)(set); for (let x = 0; x < N; x++) { const d = 2 + Math.floor(hash(x, 0, 116) * 3); for (let y = 0; y < d; y++) set(x, y, shade(rgb(0x4a5a2a), 1 - y * 0.1)); } },
  algae: speckle(0x3c5a26, 0.4, [[0x6a8a2e, 10], [0x24381a, 10], [0x8aa040, 3]], 117),
  bark_wet: (set) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) set(x, y, shade([64, 56, 38], 0.8 + 0.3 * hash(x >> 1, y >> 2, 119) - (x % 3 === 0 ? 0.16 : 0) + (y > 11 ? 0.05 : 0))); for (let i = 0; i < 12; i++) set(Math.floor(hash(i, 5, 120) * N), Math.floor(hash(i, 6, 120) * N), rgb(0x5a7a30)); },
  reed: (set) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) set(x, y, shade([120, 130, 60], 0.75 + 0.3 * hash(x >> 1, 0, 121) + (x % 4 === 3 ? -0.18 : 0) + y * 0.006)); },
  rotten: (set) => { courses(0x4a3a28, 4, 123, { w: 16, half: 5, vary: 0.25 })(set); for (let i = 0; i < 14; i++) set(Math.floor(hash(i, 7, 124) * N), Math.floor(hash(i, 8, 124) * N), rgb(i % 3 ? 0x5a7a34 : 0x8a8a6a)); },
  wisp: (set) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const k = y / N + (hash(x, y, 125) - 0.5) * 0.3; set(x, y, k < 0.35 ? [220, 255, 245] : k < 0.7 ? [90, 240, 200] : [40, 170, 170]); } },
  hull: speckle(0x5a5e62, 0.18, [[0x7a3a2a, 10], [0x3a3e42, 10]], 97),
  hull_red: speckle(0x7a3430, 0.22, [[0x9a5a3a, 10], [0x4a2a2a, 10]], 99),
};

let atlas = null;
export function voxAtlas() {
  if (atlas) return atlas;
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
  const img = c.createImageData(SIZE, SIZE); const slot = new Map(); let n = 0;
  const put = (key, paint) => {
    const sx = (n % SLOTS) * N; const sy = Math.floor(n / SLOTS) * N; slot.set(key, n++);
    paint((x, y, p) => { const i = ((sy + y) * SIZE + sx + x) * 4; img.data[i] = p[0]; img.data[i + 1] = p[1]; img.data[i + 2] = p[2]; img.data[i + 3] = 255; });
  };
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = N; const tc = tmp.getContext('2d'); tc.imageSmoothingEnabled = false;
  for (const key of FROM_BZ) {
    const im = BZ.tex(key).image; tc.clearRect(0, 0, N, N); tc.drawImage(im, 0, 0, N, N); const d = tc.getImageData(0, 0, N, N).data;
    put(key, (set) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 4; set(x, y, [d[i], d[i + 1], d[i + 2]]); } });
  }
  for (const [key, paint] of Object.entries(PAINT)) put(key, paint);
  c.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace; tex.name = 'vox_atlas';
  // uv rect of a tile, inset a hair so nearest sampling never reads the neighbour
  const e = 0.02 / SIZE;
  const uv = (key) => { const i = slot.has(key) ? slot.get(key) : slot.get('white'); const u0 = (i % SLOTS) * N / SIZE; const v1 = 1 - Math.floor(i / SLOTS) * N / SIZE; return [u0 + e, v1 - N / SIZE + e, u0 + N / SIZE - e, v1 - e]; };
  atlas = { tex, uv, has: (k) => slot.has(k) };
  return atlas;
}
