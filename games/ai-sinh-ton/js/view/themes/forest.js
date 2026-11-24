// Rừng Cổ: an ancient forest in warm daylight through the leaves (the sun from the far right throws the trees' shadows toward
// the camera, as in Minecraft Dungeons' grass levels). Mossy floor under giant trees on the rim, roots crawling over the edge, glowing
// mushrooms and torches for the light, a dark green-blue pond below. The floor stays one calm mid-dark moss so units read.
export const FOREST = {
  name: 'forest', rain: 0, fog: 0x9cc4b0, rise: 0x2a4a3a, day: 1, shadow: 0.58, shadowC: 0x0c2018, lightK: 0.45, lightWhite: 0.3, fly: [1.0, 1.0, 0.6],
  abyss: { type: 'water', y: -2.6, deep: 0x0c3a30, shallow: 0x2e7a64, foam: 0xd0f0e0, haze: 0x7aa894, spark: 0xffffff },
  amb: { sky: [0.5, 0.56, 0.56], ground: [0.2, 0.21, 0.2] }, key: { dir: [0.55, 0.7, -0.45], color: [0.8, 0.68, 0.44] },
  hemi: { sky: 0xd4e6dc, ground: 0x6a6048, k: 1.55 }, sun: { color: 0xffe2b0, k: 2.3 },
  top: { base: [['grass_top', 5], ['moss_floor', 2]], patch: [['dirt', 3], ['moss_path', 2], ['roots', 1]], patchK: 0.3, tint: [0.8, 0.84, 0.6] },
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
