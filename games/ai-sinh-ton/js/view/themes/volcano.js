// Núi Lửa: a basalt shelf over a lava lake. Calm mid-dark basalt and ash under the units, clusters of basalt columns and
// smoking vents with a magma throat on the rim, charred trunks and obsidian shards; below, black crust split by molten seams,
// ash drifting over it and embers in the air. The stone is held grey (lightWhite) so the warm pixels stay the lava's and
// the fires'. The boss floor cracks open in lava seams.
export const VOLCANO = {
  name: 'volcano', centre: [0.16, 0.05, 0.02], lightK: 0.85, lightWhite: 0.4, rain: 0, fog: 0x2e140c, rise: 0x2a0a04, fly: [1.0, 0.42, 0.12],
  abyss: { type: 'mist', y: -10, deep: 0x3a2822, shallow: 0x7a1c06, foam: 0xff7a1c, haze: 0x3a2018, spark: 0xff7030, mist: 0x3a302e, mistK: 0.45, lava: { crust: 0x3a2822, glow: 0x7a1c06, hot: 0xff7a1c },
    far: { top: 0x3a3234, side: 0x1e1818 } },
  amb: { sky: [0.48, 0.42, 0.44], ground: [0.3, 0.13, 0.08] }, key: { dir: [0.3, 0.55, -0.6], color: [0.42, 0.2, 0.1] },
  hemi: { sky: 0xb8a4a4, ground: 0x8a3818, k: 1.5 }, sun: { color: 0xff8a50, k: 1.3 },
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
