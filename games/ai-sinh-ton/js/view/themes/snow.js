// Đồng Tuyết: a snowfield shelf over a frozen lake. Trodden blue-grey snow underfoot (mid tone, never glare white, so units
// read), snowy pines in tiers, clear ice blocks and snow-capped rocks on the rim, frost crystals giving cold light beside a
// few campfires and braziers; ice plates on the dark water below and snow drifting in the air. The boss floor splits in
// ice-blue seams.
export const SNOW = {
  name: 'snow', lightK: 0.4, lightWhite: 0.2, rain: 0, snow: 1, fog: 0xbcd0e4, rise: 0x4a6a8a, day: 1, shadow: 0.5, shadowC: 0x10284a, fly: [0.85, 0.92, 1.0],
  abyss: { type: 'water', y: -2.6, deep: 0x123a5a, shallow: 0x4e8aaa, foam: 0xe8f4fc, haze: 0x9ab4cc, spark: 0xffffff, ice: 1 },
  amb: { sky: [0.54, 0.6, 0.72], ground: [0.22, 0.26, 0.34] }, key: { dir: [0.45, 0.72, -0.5], color: [0.42, 0.42, 0.42] },
  hemi: { sky: 0xd8e6f8, ground: 0x6a7a90, k: 1.6 }, sun: { color: 0xfff6ec, k: 2.0 },
  top: { base: [['snow_floor', 5], ['snow_path', 2]], patch: [['snow_path', 3], ['snow_rock', 1]], patchK: 0.24, tint: [0.84, 0.86, 0.92] },
  rimTint: [0.8, 0.84, 0.92],
  edge: [['snow_floor', 3], ['pine_snow', 1], ['snow_path', 1], ['snow_rock', 1]], side: { top: ['snow_rock'], rows: [['rock', 2], ['snow_rock', 1], ['ice_clear', 1]] },
  lights: [['campfire', 2], ['brazier', 2], ['torch', 3], ['frostcrystal', 3]],
  tall: [['pine', 9], ['iceblock', 2], ['frostcrystal', 1]], low: [['snowrock', 3], ['iceblock', 2], ['rocks', 1], ['frostcrystal', 1]],
  sat: { top: [['snow_floor', 3], ['snow_path', 2]], side: 'snow_rock' }, glow: 0xffb060,
  boss: {
    top: { base: [['snow_path', 4], ['snow_floor', 2]], patch: [['ice_clear', 1]], patchK: 0.1, tint: [0.84, 0.88, 0.96] }, centre: [0.02, 0.08, 0.16],
    amb: { sky: [0.42, 0.5, 0.72], ground: [0.12, 0.16, 0.28] }, key: { dir: [-0.4, 0.8, 0.45], color: [0.22, 0.3, 0.46] },
    deep: { color: [0.35, 0.62, 1.0], glowC: 0x4aa8ff }, hemi: 0x7ab4ff, sun: 0xa8d0ff, crack: [0.3, 0.72, 1.0], crackC: 0x4aa8ff,
  },
};
