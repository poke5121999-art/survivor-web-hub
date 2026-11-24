// Bãi Đáp Lạ: a grassy island in the day over bright water, an odd landing site: a crashed hull, stone monoliths and violet
// shards in the meadow; the boss pad is the crash crater at dusk, scorched earth with the craft's fire glowing in its cracks
export const LANDING = {
  name: 'landing', rain: 0, fog: 0x9cc4dc, rise: 0x2a6a7a, day: 1, shadow: 0.55, shadowC: 0x0a2440, lightK: 0.6,
  abyss: { type: 'water', y: -2.6, deep: 0x123e5c, shallow: 0x3a9ab0, foam: 0xe8fbff, haze: 0x9ac8da, spark: 0xffffff },
  amb: { sky: [0.64, 0.68, 0.76], ground: [0.28, 0.27, 0.25] }, key: { dir: [0.45, 0.8, -0.4], color: [0.54, 0.49, 0.38] },
  hemi: { sky: 0xdce8ff, ground: 0x8a7e6a, k: 1.7 }, sun: { color: 0xfff2dc, k: 2.1 },
  // the tint pulls the grass toward olive (less green than red and blue) so the floor is calm under the units
  top: { base: [['grass_top', 6]], patch: [['dirt', 3], ['sand', 1]], patchK: 0.22, tint: [0.74, 0.56, 0.66] },
  rimTint: [0.92, 0.82, 0.88],
  edge: [['grass_top', 3], ['dirt', 1]], side: { top: ['grass_side'], rows: [['rock', 2], ['dirt', 2], ['roots', 1]] },
  lights: [['campfire', 2], ['torch', 3], ['crystal', 1]], tall: [['tree', 4], ['hull', 2], ['obelisk', 1], ['crystal', 1]], low: [['rocks', 2], ['shard', 2], ['fence', 2], ['crate', 1], ['bush', 2]],
  sat: { top: [['grass_top', 3], ['dirt', 1]], side: 'grass_side' }, glow: 0xffb050,
  pre: { top: { base: [['grass_top', 5], ['dirt', 2]], patch: [['dirt', 3], ['burnt', 2]], patchK: 0.42, tint: [0.76, 0.56, 0.62] }, centre: [0.22, 0.08, 0.0] },
  boss: {
    top: { base: [['burnt', 4], ['dirt', 3]], patch: [['flame', 1]], patchK: 0.12, tint: [0.86, 0.66, 0.6] },
    centre: [0.3, 0.1, 0.02],
    amb: { sky: [0.66, 0.5, 0.52], ground: [0.3, 0.16, 0.12] }, key: { dir: [-0.5, 0.75, 0.45], color: [0.6, 0.32, 0.18] },
  },
};
