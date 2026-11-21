// Nhà Máy Lạnh: a cold factory platform over icy water, blue-white lamps with a few warm braziers, snow
// The floor is plate steel with darker worn plates, no ice on it (ice patches read as bright blots under the units); ice
// and snow stay on the rim. Cold lamps stand among the tall props so most light in the frame is blue-white, the braziers
// the generator always places first are the few warm points. The boss floor splits in ice-blue seams.
export const FACTORY = {
  name: 'factory', centre: [0.03, 0.06, 0.09], lightK: 0.7, rimTint: [0.68, 0.74, 0.86], rain: 0, snow: 1, fog: 0x16243a, rise: 0x14283a,
  abyss: { type: 'water', y: -2.6, deep: 0x06142a, shallow: 0x2e6e8e, foam: 0xd8f0ff, haze: 0x2c4660, spark: 0xffffff, ice: 1 },
  amb: { sky: [0.42, 0.50, 0.68], ground: [0.14, 0.17, 0.24] }, key: { dir: [-0.4, 0.8, 0.45], color: [0.24, 0.30, 0.40] },
  hemi: { sky: 0xb8d0f0, ground: 0x3a4a5a, k: 1.3 }, sun: { color: 0xffd0a0, k: 1.1 },
  top: { base: [['frost_metal', 1]], patch: [['metal_dark', 1]], patchK: 0.16, tint: [0.58, 0.64, 0.78] },
  edge: [['frost_metal', 2], ['ice', 1], ['snow', 1]], side: { top: ['frost_metal', 'metal'], rows: [['metal_dark', 3], ['frost_metal', 1], ['ice', 1]] },
  lights: [['brazier', 3], ['coldlamp', 4]], tall: [['coldlamp', 2], ['tank', 3], ['pipes', 3], ['pillar', 1]], low: [['crate', 1], ['barrel', 1], ['icerock', 3], ['rocks', 1]],
  sat: { top: [['frost_metal', 2], ['snow', 1], ['ice', 1]], side: 'frost_metal' }, glow: 0x9ac8ff,
  boss: {
    top: { base: [['metal_dark', 3], ['frost_metal', 2]], patch: [['ice', 1]], patchK: 0.14, tint: [0.62, 0.7, 0.86] }, centre: [0.02, 0.08, 0.16],
    amb: { sky: [0.36, 0.48, 0.74], ground: [0.10, 0.16, 0.28] }, key: { dir: [-0.4, 0.8, 0.45], color: [0.20, 0.30, 0.46] },
    deep: { color: [0.35, 0.62, 1.0], glowC: 0x4aa8ff }, hemi: 0x7ab4ff, sun: 0xa8d0ff, crack: [0.30, 0.72, 1.0], crackC: 0x4aa8ff,
  },
};
