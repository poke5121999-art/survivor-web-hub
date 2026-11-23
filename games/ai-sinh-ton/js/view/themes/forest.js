// Rừng Cổ: an ancient forest at dusk. Mossy floor under giant trees on the rim, roots crawling over the edge, glowing
// mushrooms and torches for the light, a dark green-blue pond below. The floor stays one calm mid-dark moss so units read.
export const FOREST = {
  name: 'forest', centre: [0.08, 0.14, 0.12], rain: 0, fog: 0x10241f, rise: 0x08140f, lightK: 0.9, lightWhite: 0.25, fly: [0.9, 1.1, 0.35],
  abyss: { type: 'water', y: -2.6, deep: 0x04140f, shallow: 0x1c4a42, foam: 0x8ac8b0, haze: 0x1e3a34, spark: 0xc8ffd8 },
  amb: { sky: [0.36, 0.52, 0.5], ground: [0.12, 0.15, 0.14] }, key: { dir: [-0.5, 0.75, 0.4], color: [0.3, 0.32, 0.26] },
  hemi: { sky: 0xb4c2d4, ground: 0x3a3a36, k: 1.45 }, sun: { color: 0xffc080, k: 1.3 },
  top: { base: [['moss_floor', 4], ['moss_path', 3]], patch: [['moss_path', 3], ['grass_dark', 2], ['roots', 1]], patchK: 0.3, tint: [0.74, 0.8, 0.72] },
  rimTint: [0.8, 0.95, 0.85],
  edge: [['grass_dark', 3], ['moss_floor', 2], ['roots', 1], ['moss_stone', 1]], side: { top: ['grass_dark_side'], rows: [['roots', 2], ['earth', 2], ['moss_stone', 1], ['rock', 1]] },
  lights: [['torch', 3], ['glowshroom', 3], ['bluecap', 2], ['campfire', 1]],
  tall: [['oldtree', 9], ['mossrock', 1]], low: [['oldtree', 3], ['roots', 3], ['fern', 3], ['mossrock', 2], ['stump', 1], ['bluecap', 1], ['glowshroom', 1]],
  sat: { top: [['moss_floor', 3], ['grass_dark', 2]], side: 'grass_dark_side' }, glow: 0xffb050,
  boss: {
    top: { base: [['moss_path', 4], ['moss_floor', 2]], patch: [['roots', 1]], patchK: 0.16, tint: [0.8, 0.82, 0.78] }, centre: [0.14, 0.08, 0.04],
    hemi: 0xff9a60, sun: 0xff8a40,
  },
};
