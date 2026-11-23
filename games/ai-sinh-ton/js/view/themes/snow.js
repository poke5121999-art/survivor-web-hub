// Đồng Tuyết: a snowfield shelf over a frozen lake. Trodden blue-grey snow underfoot (mid tone, never glare white, so units
// read), snowy pines in tiers, clear ice blocks and snow-capped rocks on the rim, frost crystals giving cold light beside a
// few campfires and braziers; ice plates on the dark water below and snow drifting in the air. The boss floor splits in
// ice-blue seams.
export const SNOW = {
  name: 'snow', centre: [0.02, 0.05, 0.09], lightK: 0.6, lightWhite: 0.2, rain: 0, snow: 1, fog: 0x2a3a4c, rise: 0x1a2a3a, fly: [0.85, 0.92, 1.0],
  abyss: { type: 'water', y: -2.6, deep: 0x0c2236, shallow: 0x3e6e8a, foam: 0xd0e4f4, haze: 0x4a6078, spark: 0xffffff, ice: 1 },
  amb: { sky: [0.5, 0.56, 0.68], ground: [0.16, 0.19, 0.25] }, key: { dir: [-0.4, 0.8, 0.45], color: [0.28, 0.3, 0.34] },
  hemi: { sky: 0xc8d8f0, ground: 0x4a5868, k: 1.4 }, sun: { color: 0xfff0e0, k: 1.25 },
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
