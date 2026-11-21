// Bãi Đáp Lạ: a grassy island in the day over bright water, an odd landing site with a crashed hull and campfires
export const LANDING = {
  name: 'landing', rain: 0, fog: 0x8ab8d0, rise: 0x2a6a7a, day: 1,
  abyss: { type: 'water', y: -2.6, deep: 0x1a5a78, shallow: 0x4ab0c0, foam: 0xe8fbff, haze: 0x9ac8da, spark: 0xffffff },
  amb: { sky: [0.82, 0.86, 0.92], ground: [0.34, 0.32, 0.28] }, key: { dir: [-0.5, 0.75, 0.45], color: [0.45, 0.40, 0.32] },
  hemi: { sky: 0xdce8ff, ground: 0x8a7e6a, k: 1.7 }, sun: { color: 0xfff2dc, k: 2.1 },
  top: { base: [['grass_top', 6]], patch: [['dirt', 3], ['cobble', 1]], patchK: 0.3, tint: [0.6, 0.68, 0.56] },
  edge: [['grass_top', 3], ['dirt', 1]], side: { top: ['grass_side'], rows: [['dirt', 2], ['roots', 1], ['rock', 2]] },
  lights: [['campfire', 2], ['torch', 3], ['mushrooms', 2]], tall: [['tree', 4], ['hull', 1], ['wall', 1]], low: [['rocks', 2], ['fence', 3], ['crate', 1], ['bush', 2]],
  sat: { top: [['grass_top', 3], ['dirt', 1]], side: 'grass_side' }, glow: 0xffb050,
};
