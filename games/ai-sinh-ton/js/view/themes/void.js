// Rìa Hư Không: a violet stone island at the edge of the void, crystals and braziers over a purple abyss; the boss pad is
// black glass cracked with violet light, the whole frame turning magenta
export const VOID = {
  name: 'void', centre: [0.14, 0.11, 0.2], rain: 0, fog: 0x1a1430, rise: 0x120c22,
  abyss: { type: 'mist', y: -10, deep: 0x04020c, shallow: 0x4a2e78, foam: 0xa47ae0, haze: 0x2e2448, spark: 0xd8b8ff },
  amb: { sky: [0.44, 0.39, 0.64], ground: [0.13, 0.10, 0.20] }, key: { dir: [-0.4, 0.75, 0.5], color: [0.26, 0.20, 0.34] },
  hemi: { sky: 0xa898e0, ground: 0x3a2e50, k: 1.35 }, sun: { color: 0xffb070, k: 1.4 },
  top: { base: [['void_stone', 4], ['void_brick', 2]], patch: [['void_brick', 2], ['obsidian', 1]], patchK: 0.22, tint: [0.9, 0.88, 0.98] },
  edge: [['void_brick', 2], ['obsidian', 1]], side: { top: ['void_brick'], rows: [['void_brick', 2], ['obsidian', 2], ['rock', 1]] },
  lights: [['brazier', 3], ['crystal', 3], ['torch', 2]], tall: [['obelisk', 3], ['crystal', 3], ['pillar', 1]], low: [['rocks', 2], ['urn', 1], ['shard', 3]],
  sat: { top: [['void_stone', 2], ['obsidian', 1]], side: 'void_brick' }, glow: 0xffa050,
  pre: { top: { base: [['void_stone', 5], ['void_brick', 1]], patch: [['obsidian', 1]], patchK: 0.16, tint: [0.92, 0.86, 1.0] }, centre: [0.32, 0.12, 0.48] },
  boss: {
    top: { base: [['void_stone', 4], ['obsidian', 2]], patch: [['crystal', 1]], patchK: 0.12, tint: [0.96, 0.86, 1.0] },
    centre: [0.6, 0.18, 0.9],
    amb: { sky: [0.5, 0.34, 0.66], ground: [0.2, 0.08, 0.24] }, key: { dir: [-0.4, 0.75, 0.5], color: [0.36, 0.18, 0.4] },
    deep: { color: [0.75, 0.3, 1.0], glowC: 0xb050ff }, hemi: 0xc060ff, sun: 0xff60c0,
  },
};
