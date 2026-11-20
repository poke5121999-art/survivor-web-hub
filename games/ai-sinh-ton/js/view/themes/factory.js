// Nhà Máy Lạnh: a cold factory platform over icy water, blue-white lamps with a few warm braziers
export const FACTORY = {
  name: 'factory', centre: [0.04, 0.05, 0.06], lightK: 0.9, rimTint: [0.78, 0.82, 0.9],  rain: 0, snow: 1, fog: 0x1a2a3a, rise: 0x14283a,
  abyss: { type: 'water', y: -2.6, deep: 0x0a1c2e, shallow: 0x3a7a96, foam: 0xd8f0ff, haze: 0x3a5468, spark: 0xffffff, ice: 1 },
  amb: { sky: [0.44, 0.52, 0.70], ground: [0.16, 0.19, 0.25] }, key: { dir: [-0.4, 0.8, 0.45], color: [0.28, 0.32, 0.40] },
  hemi: { sky: 0xb8d0f0, ground: 0x3a4a5a, k: 1.3 }, sun: { color: 0xffc890, k: 1.15 },
  top: { base: [['frost_metal', 4], ['metal', 1]], patch: [['frost_metal', 2], ['ice', 1]], patchK: 0.28, tint: [0.6, 0.66, 0.78] },
  edge: [['snow', 1], ['ice', 1], ['frost_metal', 2]], side: { top: ['frost_metal'], rows: [['metal_dark', 2], ['ice', 1], ['rock', 2]] },
  lights: [['brazier', 3], ['coldlamp', 3], ['barrelfire', 1]], tall: [['tank', 2], ['pipes', 2], ['pillar', 1]], low: [['crate', 2], ['barrel', 2], ['rocks', 2], ['icerock', 2]],
  sat: { top: [['frost_metal', 3], ['ice', 1]], side: 'metal_dark' }, glow: 0xffb060,
};
