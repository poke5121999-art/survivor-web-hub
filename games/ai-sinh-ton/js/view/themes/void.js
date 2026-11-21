// Rìa Hư Không: a violet stone island at the edge of the void, crystals and braziers over a purple abyss
export const VOID = {
  name: 'void', centre: [0.16, 0.13, 0.22],  rain: 0, fog: 0x1a1430, rise: 0x120c22,
  abyss: { type: 'mist', y: -10, deep: 0x06040e, shallow: 0x3a2a5e, foam: 0x9a7ad0, haze: 0x2e2448, spark: 0xd8b8ff },
  amb: { sky: [0.44, 0.39, 0.64], ground: [0.13, 0.10, 0.20] }, key: { dir: [-0.4, 0.75, 0.5], color: [0.26, 0.20, 0.34] },
  hemi: { sky: 0xa898e0, ground: 0x3a2e50, k: 1.35 }, sun: { color: 0xffb070, k: 1.4 },
  top: { base: [['void_stone', 4], ['void_brick', 2]], patch: [['obsidian', 2], ['cobble', 1]], patchK: 0.3, tint: [0.92, 0.9, 1.0] },
  edge: [['void_brick', 2], ['obsidian', 1]], side: { top: ['void_brick'], rows: [['void_brick', 2], ['obsidian', 2], ['rock', 1]] },
  lights: [['brazier', 3], ['crystal', 3], ['torch', 2]], tall: [['obelisk', 2], ['crystal', 2], ['deadtree', 1]], low: [['rocks', 2], ['urn', 1], ['shard', 2]],
  sat: { top: [['void_stone', 2], ['obsidian', 1]], side: 'void_brick' }, glow: 0xffa050,
};
