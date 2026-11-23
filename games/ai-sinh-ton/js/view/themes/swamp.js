// Đầm Lầy: a murky swamp. Mud and algae floor, mangroves on stilt roots, rotten logs and reeds on the rim, cold wisps over
// brackish olive water under a green haze. Warm light stays a few torches and fires so the wisps read as the odd ones out.
export const SWAMP = {
  name: 'swamp', centre: [0.06, 0.12, 0.08], rain: 0, fog: 0x2a3a1c, rise: 0x141c0c, lightK: 0.9, lightWhite: 0.2, fly: [0.35, 1.1, 0.9],
  abyss: { type: 'water', y: -2.4, deep: 0x141c08, shallow: 0x586a28, foam: 0xa8b870, haze: 0x4a5a2a, spark: 0xd0ffa8 },
  amb: { sky: [0.5, 0.58, 0.4], ground: [0.16, 0.16, 0.1] }, key: { dir: [-0.5, 0.7, 0.4], color: [0.3, 0.32, 0.2] },
  hemi: { sky: 0xb0c88a, ground: 0x3a3a22, k: 1.4 }, sun: { color: 0xffe0a0, k: 1.2 },
  top: { base: [['mud', 6], ['algae', 2]], patch: [['moss_path', 3], ['algae', 2], ['mud', 1]], patchK: 0.26, tint: [0.92, 0.96, 0.8] },
  rimTint: [0.86, 0.92, 0.76],
  edge: [['mud', 3], ['algae', 2], ['moss_path', 1]], side: { top: ['mud_side'], rows: [['mud_side', 2], ['earth', 2], ['roots', 1], ['rock', 1]] },
  lights: [['torch', 3], ['campfire', 1], ['wisp', 4], ['bluecap', 1]],
  tall: [['mangrove', 8], ['deadtree', 2], ['wisp', 1]], low: [['mangrove', 3], ['reeds', 4], ['log', 3], ['mossrock', 1], ['fern', 2], ['roots', 1], ['bluecap', 1]],
  sat: { top: [['algae', 3], ['mud', 2]], side: 'mud_side' }, glow: 0xffa848,
  boss: {
    top: { base: [['mud', 4], ['moss_path', 2]], patch: [['algae', 1]], patchK: 0.14, tint: [0.88, 0.9, 0.78] }, centre: [0.1, 0.1, 0.04],
    hemi: 0xffa060, sun: 0xff8a40,
  },
};
