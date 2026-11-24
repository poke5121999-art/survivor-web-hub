// Đầm Lầy: a murky swamp by overcast day: a green haze, soft light from a hidden sun, faint shadows. Mud and algae floor, mangroves on stilt roots, rotten logs and reeds on the rim, cold wisps over
// brackish olive water under a green haze. Warm light stays a few torches and fires so the wisps read as the odd ones out.
export const SWAMP = {
  name: 'swamp', rain: 0, fog: 0x7c9468, rise: 0x2a3a1c, day: 1, shadow: 0.34, shadowC: 0x101c08, lightK: 0.6, lightWhite: 0.2, fly: [0.6, 1.1, 0.7],
  abyss: { type: 'water', y: -2.4, deep: 0x22300e, shallow: 0x6a7c34, foam: 0xc0d090, haze: 0x6a8050, spark: 0xe0ffc0 },
  amb: { sky: [0.68, 0.78, 0.6], ground: [0.26, 0.28, 0.18] }, key: { dir: [0.35, 0.85, -0.35], color: [0.4, 0.42, 0.3] },
  hemi: { sky: 0xcce0b0, ground: 0x5a5a34, k: 1.7 }, sun: { color: 0xf0f0c8, k: 1.3 },
  top: { base: [['mud', 6], ['algae', 2]], patch: [['moss_path', 3], ['algae', 2], ['mud', 1]], patchK: 0.26, tint: [1.36, 1.36, 1.08] },
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
