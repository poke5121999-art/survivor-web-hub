// Núi Lửa: a basalt shelf over a lava lake. Calm mid-dark basalt and ash under the units, clusters of basalt columns and
// smoking vents with a magma throat on the rim, charred trunks and obsidian shards; below, black crust split by molten seams,
// ash drifting over it and embers in the air. The stone is held grey (lightWhite) so the warm pixels stay the lava's and
// the fires'. The boss floor cracks open in lava seams.
export const VOLCANO = {
  name: 'volcano', centre: [0.16, 0.05, 0.02], lightK: 0.85, lightWhite: 0.4, rain: 0, fog: 0x2e140c, rise: 0x2a0a04, fly: [1.0, 0.42, 0.12],
  abyss: { type: 'mist', y: -10, deep: 0x3a2018, shallow: 0xa02408, foam: 0xff8a20, haze: 0x4a2014, spark: 0xff8030, mist: 0x4a2a20, mistK: 0.4, lava: { crust: 0x34201a, glow: 0xa82808, hot: 0xff9a28 },
    far: { top: 0x3a3234, side: 0x1e1818 } },
  amb: { sky: [0.46, 0.38, 0.4], ground: [0.5, 0.16, 0.06] }, key: { dir: [0.25, 0.35, -0.7], color: [0.62, 0.24, 0.08] },
  hemi: { sky: 0xa89494, ground: 0xb84818, k: 1.6 }, sun: { color: 0xff7a40, k: 1.5 },
  top: { base: [['basalt', 5], ['ash', 2]], patch: [['ash', 3], ['cinder', 1]], patchK: 0.24, tint: [1.12, 1.08, 1.12] },
  rimTint: [0.82, 0.78, 0.8],
  edge: [['basalt', 3], ['cinder', 2], ['lava_rock', 1]], side: { top: ['lava_rock', 'basalt_col'], rows: [['basalt_col', 3], ['lava_rock', 2], ['cinder', 1]] },
  lights: [['vent', 4], ['brazier', 2], ['torch', 2]],
  tall: [['basaltcol', 8], ['charred', 2], ['vent', 1]], low: [['obshard', 3], ['ashrock', 3], ['vent', 1], ['charred', 1]],
  sat: { top: [['basalt', 3], ['ash', 1]], side: 'basalt_col' }, glow: 0xff7a30,
  boss: {
    top: { base: [['basalt', 4], ['cinder', 2]], patch: [['ash', 1]], patchK: 0.14, tint: [1.05, 1.0, 1.04] }, centre: [0.18, 0.06, 0.02],
    hemi: 0xff7a40, sun: 0xff6a20, crack: [1.0, 0.36, 0.08], crackC: 0xff5010,
  },
};
