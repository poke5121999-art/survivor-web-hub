// Voxel Lab - material table.
// Techniques studied from Voxel Engine by mattshumer (spawn.co); all values here are our own,
// with orders of magnitude after analysis/destruction.md §1.5.1 (density kg/m3, MPa strengths, blast toughness).
//
// Row: [name, density, fc, ft, fv, toughness, friction, restitution, flags, rgb, variation, roughness, emissive, pattern, audio, rubble, burn]
// burn = [catch chance per second at heat 1, burn seconds, becomes] or null.

export const F = { METAL: 1, GRANULAR: 2, FIBROUS: 4, GLASS: 8, EXPLOSIVE: 16, FLAMMABLE: 32, EMBER: 64, RUBBLE: 128, MOB: 256, EMISSIVE: 512 };
export const PAT = { FLAT: 0, BRICK: 1, PLANKS: 2, TILES: 3, NOISE: 4, GRAIN: 5, EMBER: 6, TURF: 7, TARMAC: 8, CONCRETE: 9, METAL: 10, RUBBLE: 11, SOIL: 12, SHEET: 13, THATCH: 14, BAMBOO: 15, PAVING: 16 };

const rows = [
  // name            dens   fc    ft    fv   T      fr    re    flags                      rgb              var rough emis pattern       audio      rubble            burn
  ['air',            0,     0,    0,    0,   0,     0,    0,    0,                         [0, 0, 0],       0,  0,   0,   'FLAT',     'soft',    null,             null],
  ['bedrock',        2700,  200,  20,   30,  1e6,   0.8,  0.05, 0,                         [70, 68, 66],    10, 240, 0,   'NOISE',    'stone',   'rubble',         null],
  ['soil',           1500,  1.5,  0.05, 0.3, 320,   0.8,  0.02, F.GRANULAR,                [110, 82, 58],   30, 250, 0,   'SOIL',     'soft',    'rubble_earth',   null],
  ['grass',          1300,  1.2,  0.05, 0.3, 280,   0.8,  0.02, F.GRANULAR,                [86, 134, 54],   30, 250, 0,   'TURF',     'soft',    'rubble_earth',   null],
  ['asphalt',        2300,  12,   1.2,  2,   1500,  0.85, 0.04, 0,                         [54, 56, 60],    16, 235, 0,   'TARMAC',   'stone',   'rubble',         null],
  ['concrete',       2400,  30,   3,    5,   2200,  0.75, 0.08, 0,                         [160, 158, 152], 12, 225, 0,   'CONCRETE', 'stone',   'rubble',         null],
  ['rc',             2500,  40,   14,   12,  6500,  0.75, 0.08, F.METAL,                   [134, 135, 138], 10, 220, 0,   'CONCRETE', 'stone',   'rubble',         null],
  ['brick',          1900,  18,   1.4,  2.6, 1300,  0.8,  0.06, 0,                         [158, 76, 58],   26, 235, 0,   'BRICK',    'stone',   'rubble_masonry', null],
  ['mortar',         1800,  10,   0.8,  1.5, 800,   0.8,  0.05, 0,                         [186, 180, 166], 14, 240, 0,   'NOISE',    'plaster', 'rubble_pale',    null],
  ['wood',           600,   35,   40,   7,   700,   0.6,  0.15, F.FIBROUS | F.FLAMMABLE,   [150, 110, 70],  22, 215, 0,   'GRAIN',    'wood',    'rubble_timber',  [0.9, 9, 'charred']],
  ['plank',          550,   30,   35,   6,   520,   0.6,  0.15, F.FIBROUS | F.FLAMMABLE,   [176, 136, 88],  20, 210, 0,   'PLANKS',   'wood',    'rubble_timber',  [1.2, 6, 'charred']],
  ['glass',          2500,  200,  7,    7,   45,    0.3,  0.1,  F.GLASS,                   [150, 198, 216], 4,  20,  0,   'FLAT',     'glass',   'rubble_glass',   null],
  ['steel',          7850,  400,  400,  240, 60000, 0.5,  0.25, F.METAL,                   [108, 116, 126], 8,  90,  0,   'METAL',    'metal',   'rubble_metal',   null],
  ['plaster',        900,   6,    0.6,  1,   260,   0.7,  0.05, 0,                         [226, 220, 204], 8,  235, 0,   'FLAT',     'plaster', 'rubble_pale',    null],
  ['rooftile',       1800,  14,   1.2,  2,   900,   0.7,  0.08, 0,                         [150, 70, 50],   24, 215, 0,   'TILES',    'stone',   'rubble_masonry', null],
  ['leaf',           180,   0.1,  0.05, 0.05, 12,   0.6,  0.02, F.GRANULAR | F.FIBROUS | F.FLAMMABLE, [66, 122, 52], 36, 250, 0, 'NOISE', 'leaf', 'rubble_leaf',   [3, 2.5, null]],
  ['trunk',          700,   35,   40,   7,   900,   0.7,  0.1,  F.FIBROUS | F.FLAMMABLE,   [96, 70, 48],    24, 240, 0,   'GRAIN',    'wood',    'rubble_timber',  [0.5, 12, 'charred']],
  ['stone',          2600,  60,   5,    8,   3200,  0.75, 0.06, 0,                         [150, 146, 136], 22, 235, 0,   'NOISE',    'stone',   'rubble',         null],
  ['sheet_zinc',     900,   60,   60,   40,  2500,  0.5,  0.2,  F.METAL,                   [150, 158, 164], 8,  110, 0,   'SHEET',    'metal',   'rubble_metal',   null],
  ['sheet_red',      900,   60,   60,   40,  2500,  0.5,  0.2,  F.METAL,                   [158, 58, 48],   8,  130, 0,   'SHEET',    'metal',   'rubble_metal',   null],
  ['sheet_blue',     900,   60,   60,   40,  2500,  0.5,  0.2,  F.METAL,                   [58, 96, 150],   8,  130, 0,   'SHEET',    'metal',   'rubble_metal',   null],
  ['sheet_green',    900,   60,   60,   40,  2500,  0.5,  0.2,  F.METAL,                   [62, 124, 92],   8,  130, 0,   'SHEET',    'metal',   'rubble_metal',   null],
  ['plaster_yellow', 900,   6,    0.6,  1,   260,   0.7,  0.05, 0,                         [232, 196, 104], 8,  235, 0,   'FLAT',     'plaster', 'rubble_pale',    null],
  ['plaster_blue',   900,   6,    0.6,  1,   260,   0.7,  0.05, 0,                         [130, 176, 206], 8,  235, 0,   'FLAT',     'plaster', 'rubble_pale',    null],
  ['plaster_pink',   900,   6,    0.6,  1,   260,   0.7,  0.05, 0,                         [226, 160, 150], 8,  235, 0,   'FLAT',     'plaster', 'rubble_pale',    null],
  ['plaster_green',  900,   6,    0.6,  1,   260,   0.7,  0.05, 0,                         [150, 196, 150], 8,  235, 0,   'FLAT',     'plaster', 'rubble_pale',    null],
  ['brick_buff',     1900,  18,   1.4,  2.6, 1300,  0.8,  0.06, 0,                         [192, 164, 114], 24, 235, 0,   'BRICK',    'stone',   'rubble_pale',    null],
  ['brick_dark',     2000,  22,   1.6,  3,   1500,  0.8,  0.06, 0,                         [104, 58, 50],   24, 235, 0,   'BRICK',    'stone',   'rubble_masonry', null],
  ['paint_white',    1200,  60,   60,   40,  2500,  0.5,  0.2,  F.METAL,                   [232, 232, 226], 5,  150, 0,   'FLAT',     'metal',   'rubble_metal',   null],
  ['paint_red',      1200,  60,   60,   40,  2500,  0.5,  0.2,  F.METAL,                   [190, 44, 40],   5,  140, 0,   'FLAT',     'metal',   'rubble_metal',   null],
  ['paint_yellow',   1200,  60,   60,   40,  2500,  0.5,  0.2,  F.METAL,                   [226, 180, 40],  5,  140, 0,   'FLAT',     'metal',   'rubble_metal',   null],
  ['bamboo',         400,   25,   60,   5,   380,   0.5,  0.2,  F.FIBROUS | F.FLAMMABLE,   [178, 168, 96],  18, 190, 0,   'BAMBOO',   'wood',    'rubble_timber',  [1.6, 5, 'charred']],
  ['thatch',         120,   0.4,  0.3,  0.1, 30,    0.8,  0.02, F.FIBROUS | F.GRANULAR | F.FLAMMABLE, [186, 150, 84], 30, 250, 0, 'THATCH', 'leaf', 'rubble_leaf', [4, 3, null]],
  ['fuel',           1600,  5,    2,    2,   80,    0.5,  0.1,  F.EXPLOSIVE | F.FLAMMABLE, [196, 50, 40],   6,  120, 0,   'METAL',    'metal',   'rubble_metal',   [6, 0.4, null]],
  ['lamp',           2400,  100,  5,    5,   45,    0.3,  0.1,  F.GLASS | F.EMISSIVE,      [255, 228, 164], 0,  40,  220, 'FLAT',     'glass',   'rubble_glass',   null],
  ['rust',           7000,  250,  250,  150, 20000, 0.6,  0.15, F.METAL,                   [128, 74, 48],   26, 230, 0,   'NOISE',    'metal',   'rubble_metal',   null],
  ['iron',           7200,  300,  200,  150, 30000, 0.5,  0.2,  F.METAL,                   [48, 50, 54],    8,  140, 0,   'METAL',    'metal',   'rubble_metal',   null],
  ['tile_floor',     2000,  25,   2,    3,   1000,  0.5,  0.08, 0,                         [206, 196, 176], 12, 120, 0,   'PAVING',   'stone',   'rubble_pale',    null],
  ['sidewalk',       2300,  25,   2.5,  4,   1900,  0.8,  0.06, 0,                         [176, 172, 164], 12, 235, 0,   'PAVING',   'stone',   'rubble',         null],
  ['glass_tint',     2500,  200,  7,    7,   45,    0.3,  0.1,  F.GLASS,                   [70, 120, 140],  4,  16,  0,   'FLAT',     'glass',   'rubble_glass',   null],
  ['rubber',         1100,  10,   15,   8,   900,   1.0,  0.5,  F.FIBROUS | F.FLAMMABLE,   [30, 30, 32],    8,  240, 0,   'FLAT',     'soft',    'rubble_timber',  [0.3, 14, 'charred']],
  ['cloth_red',      300,   1,    4,    1,   40,    0.7,  0.02, F.FIBROUS | F.FLAMMABLE,   [186, 54, 46],   10, 245, 0,   'FLAT',     'soft',    'rubble_leaf',    [3, 2.5, null]],
  ['cloth_white',    300,   1,    4,    1,   40,    0.7,  0.02, F.FIBROUS | F.FLAMMABLE,   [226, 222, 208], 10, 245, 0,   'FLAT',     'soft',    'rubble_leaf',    [3, 2.5, null]],
  ['wood_dark',      650,   35,   40,   7,   760,   0.6,  0.15, F.FIBROUS | F.FLAMMABLE,   [92, 62, 42],    20, 215, 0,   'GRAIN',    'wood',    'rubble_timber',  [0.8, 10, 'charred']],
  ['ashlar',         2500,  50,   4.5,  7,   2900,  0.75, 0.06, 0,                         [206, 198, 180], 14, 230, 0,   'PAVING',   'stone',   'rubble_pale',    null],
  ['steel_yellow',   7850,  400,  400,  240, 60000, 0.5,  0.25, F.METAL,                   [222, 176, 44],  6,  130, 0,   'METAL',    'metal',   'rubble_metal',   null],
  ['gravel',         1700,  2,    0.05, 0.3, 300,   0.8,  0.03, F.GRANULAR,                [140, 134, 124], 40, 250, 0,   'RUBBLE',   'stone',   'rubble',         null],
  ['wood_green',     600,   35,   40,   7,   700,   0.6,  0.15, F.FIBROUS | F.FLAMMABLE,   [70, 112, 88],   12, 200, 0,   'PLANKS',   'wood',    'rubble_timber',  [0.9, 8, 'charred']],
  ['charred',        350,   3,    1,    0.8, 90,    0.7,  0.05, 0,                         [30, 27, 25],    30, 250, 0,   'NOISE',    'wood',    'rubble_timber',  null],
  ['ember',          450,   14,   12,   3,   300,   0.6,  0.05, F.EMBER | F.EMISSIVE,      [255, 96, 26],   0,  240, 40,  'EMBER',    'wood',    'rubble_timber',  null],
  ['cinder',         250,   0.1,  0.03, 0.03, 15,   0.7,  0.02, F.GRANULAR,                [44, 40, 38],    30, 250, 0,   'NOISE',    'soft',    'rubble_timber',  null],
  ['rubble',         1700,  2,    0.05, 0.3, 300,   0.8,  0.03, F.GRANULAR | F.RUBBLE,     [142, 140, 134], 40, 250, 0,   'RUBBLE',   'stone',   'rubble',         null],
  ['rubble_masonry', 1600,  2,    0.05, 0.3, 300,   0.8,  0.03, F.GRANULAR | F.RUBBLE,     [140, 80, 62],   42, 250, 0,   'RUBBLE',   'stone',   'rubble_masonry', null],
  ['rubble_timber',  450,   1,    0.05, 0.2, 200,   0.7,  0.05, F.GRANULAR | F.RUBBLE | F.FLAMMABLE, [128, 98, 66], 40, 250, 0, 'RUBBLE', 'wood', 'rubble_timber', [0.6, 6, null]],
  ['rubble_metal',   3000,  3,    0.05, 0.4, 300,   0.6,  0.1,  F.GRANULAR | F.RUBBLE,     [104, 108, 114], 30, 160, 0,   'RUBBLE',   'metal',   'rubble_metal',   null],
  ['rubble_earth',   1400,  1,    0.05, 0.2, 220,   0.8,  0.02, F.GRANULAR | F.RUBBLE,     [104, 80, 58],   36, 250, 0,   'RUBBLE',   'soft',    'rubble_earth',   null],
  ['rubble_pale',    1300,  1.5,  0.05, 0.2, 240,   0.8,  0.03, F.GRANULAR | F.RUBBLE,     [170, 164, 152], 34, 250, 0,   'RUBBLE',   'plaster', 'rubble_pale',    null],
  ['rubble_glass',   1500,  1,    0.05, 0.2, 200,   0.5,  0.05, F.GRANULAR | F.RUBBLE,     [138, 158, 160], 30, 60,  0,   'RUBBLE',   'glass',   'rubble_glass',   null],
  ['rubble_leaf',    120,   0.1,  0.03, 0.03, 12,   0.7,  0.02, F.GRANULAR | F.RUBBLE | F.FLAMMABLE, [96, 110, 60], 40, 250, 0, 'RUBBLE', 'leaf', 'rubble_leaf',   [2, 2, null]],
  ['rubble_flesh',   900,   0.2,  0.05, 0.05, 20,   0.7,  0.02, F.GRANULAR | F.RUBBLE,     [124, 40, 38],   36, 200, 0,   'RUBBLE',   'soft',    'rubble_flesh',   null],
  // mob materials
  ['flesh',          1050,  1,    1,    0.5, 60,    0.7,  0.05, F.MOB,                     [170, 52, 48],   20, 200, 0,   'FLAT',     'soft',    'rubble_flesh',   null],
  ['flesh_zombie',   1050,  0.8,  0.8,  0.4, 50,    0.7,  0.05, F.MOB,                     [112, 142, 96],  26, 220, 0,   'NOISE',    'soft',    'rubble_flesh',   null],
  ['skin',           1050,  1,    1,    0.5, 60,    0.7,  0.05, F.MOB,                     [222, 172, 130], 8,  200, 0,   'FLAT',     'soft',    'rubble_flesh',   null],
  ['cloth_green',    600,   1,    4,    1,   70,    0.7,  0.02, F.MOB | F.FIBROUS,         [78, 96, 58],    14, 245, 0,   'FLAT',     'soft',    'rubble_leaf',    null],
  ['cloth_brown',    600,   1,    4,    1,   70,    0.7,  0.02, F.MOB | F.FIBROUS,         [124, 88, 58],   14, 245, 0,   'FLAT',     'soft',    'rubble_leaf',    null],
  ['cloth_blue',     600,   1,    4,    1,   70,    0.7,  0.02, F.MOB | F.FIBROUS,         [58, 78, 124],   14, 245, 0,   'FLAT',     'soft',    'rubble_leaf',    null],
  ['bone',           1800,  120,  100,  50,  500,   0.5,  0.2,  F.MOB,                     [232, 226, 204], 10, 180, 0,   'FLAT',     'wood',    'rubble_pale',    null],
  ['armour',         7000,  300,  300,  180, 9000,  0.5,  0.25, F.MOB | F.METAL,           [96, 104, 112],  8,  90,  0,   'METAL',    'metal',   'rubble_metal',   null],
  ['hair',           600,   1,    2,    1,   40,    0.7,  0.02, F.MOB | F.FIBROUS,         [34, 28, 26],    10, 240, 0,   'FLAT',     'soft',    'rubble_leaf',    null],
  ['golem_stone',    2600,  60,   5,    8,   2600,  0.75, 0.06, F.MOB,                     [124, 128, 120], 26, 235, 0,   'NOISE',    'stone',   'rubble',         null],
  ['chitin',         1300,  20,   20,   10,  300,   0.5,  0.15, F.MOB,                     [52, 38, 58],    16, 120, 0,   'NOISE',    'wood',    'rubble_flesh',   null],
  ['robot_metal',    5000,  250,  250,  150, 6000,  0.5,  0.25, F.MOB | F.METAL,           [176, 182, 190], 8,  80,  0,   'METAL',    'metal',   'rubble_metal',   null],
  ['eye_glow',       1500,  20,   5,    5,   45,    0.3,  0.1,  F.MOB | F.EMISSIVE,        [255, 70, 50],   0,  60,  200, 'FLAT',     'glass',   'rubble_glass',   null],
  ['straw',          200,   0.5,  0.5,  0.2, 30,    0.7,  0.02, F.MOB | F.FIBROUS | F.FLAMMABLE, [214, 188, 120], 16, 240, 0, 'THATCH', 'leaf', 'rubble_leaf',   [4, 2, null]],
  ['moss',           1300,  20,   2,    3,   900,   0.8,  0.05, F.MOB,                     [84, 112, 66],   30, 250, 0,   'NOISE',    'soft',    'rubble_earth',   null],
];

export const N_MAT = rows.length;
export const NAMES = rows.map(r => r[0]);
/** name -> id */
export const M = {};
rows.forEach((r, i) => { M[r[0]] = i; });

export const density = new Float32Array(256), fc = new Float32Array(256), ft = new Float32Array(256), fv = new Float32Array(256);
export const toughness = new Float32Array(256), friction = new Float32Array(256), restitution = new Float32Array(256);
export const flags = new Uint16Array(256), rubbleOf = new Uint8Array(256), burnsTo = new Uint8Array(256);
export const burnChance = new Float32Array(256), burnTime = new Float32Array(256);
export const voxMass = new Float32Array(256); // kg per 0.1 m voxel
export const audioClass = new Array(256).fill('stone');
export const colors = new Uint8Array(256 * 3);
/** palette bytes for the shader: 256 x 3 RGBA (row0 rgb+variation; row1 roughness, emissive, pattern, flags-lo; row2 interior rgb shown on fracture faces) */
export const palette = new Uint8Array(256 * 3 * 4);
/** colour of the inside of a material, seen on freshly broken faces (voxel-render.md §3.3 "Broken faces") */
function interior(r) {
  const [cr, cg, cb] = r[9], f = r[8], pat = r[13];
  if (f & F.MOB) {
    if (f & F.METAL) return [cr * 0.6, cg * 0.6, cb * 0.62];
    if (r[0] === 'bone' || r[0] === 'eye_glow') return [cr, cg, cb];
    if (r[0] === 'golem_stone' || r[0] === 'moss') return [96, 92, 84];
    if (r[0] === 'chitin') return [150, 164, 64];
    if (r[0] === 'straw') return [200, 176, 110];
    return [128, 24, 26];
  }
  if (pat === 'BRICK') return [Math.min(255, cr * 1.08), Math.min(255, cg * 1.05), cb * 1.01];
  if (pat === 'CONCRETE') return [cr * 0.86, cg * 0.86, cb * 0.86];
  if (f & F.FIBROUS && (pat === 'GRAIN' || pat === 'PLANKS' || pat === 'BAMBOO')) return [196, 160, 104];
  if (r[14] === 'plaster') return [150, 140, 126];
  if (f & F.METAL) return [Math.min(255, cr * 0.8 + 40), Math.min(255, cg * 0.8 + 40), Math.min(255, cb * 0.8 + 44)];
  return [Math.min(255, cr * 1.08), Math.min(255, cg * 1.06), Math.min(255, cb * 1.04)];
}

rows.forEach((r, i) => {
  density[i] = r[1]; fc[i] = r[2]; ft[i] = r[3]; fv[i] = r[4]; toughness[i] = r[5]; friction[i] = r[6]; restitution[i] = r[7];
  flags[i] = r[8]; voxMass[i] = r[1] * 0.001; audioClass[i] = r[14];
  colors.set(r[9], i * 3);
  palette.set([r[9][0], r[9][1], r[9][2], r[10]], i * 4);
  palette.set([r[11], r[12], PAT[r[13]], r[8] & 255], (256 + i) * 4);
  palette.set([...interior(r), 255], (512 + i) * 4);
});
rows.forEach((r, i) => {
  rubbleOf[i] = r[15] ? M[r[15]] : 0;
  if (r[16]) { burnChance[i] = r[16][0]; burnTime[i] = r[16][1]; burnsTo[i] = r[16][2] ? M[r[16][2]] : 0; }
});

export const isGlass = id => (flags[id] & F.GLASS) !== 0 && !(flags[id] & F.EMISSIVE);
export const isTransparent = new Uint8Array(256);
for (let i = 0; i < N_MAT; i++) isTransparent[i] = (NAMES[i] === 'glass' || NAMES[i] === 'glass_tint') ? 1 : 0;

/** carve threshold after destruction.md §4.2: p0 = max(0, 0.264 + 0.16 ln(T/2200)) */
export const p0 = new Float32Array(256);
for (let i = 1; i < N_MAT; i++) p0[i] = Math.max(0, 0.264 + 0.16 * Math.log(Math.max(toughness[i], 1) / 2200));
p0[1] = 9; // bedrock never carves

/** rim roughness pair (a, b) by material flag, destruction.md §4.2 step 7 */
export function roughPair(id) {
  const f = flags[id];
  if (f & F.METAL) return 0.04;
  if (f & F.GRANULAR) return 0.22;
  if (f & F.FIBROUS) return 0.10;
  return 0.15;
}
