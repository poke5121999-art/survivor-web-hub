// Bãi Xe Cũ: an old car park slab floating over brown fog, sodium lamps and wrecks on fire
export const PARKING = {
  name: 'parking', centre: [0.14, 0.13, 0.14], lightK: 0.6,  rain: 0, fog: 0x2a2228, rise: 0x2a2024,
  abyss: { type: 'mist', y: -9, deep: 0x120c10, shallow: 0x4a3a38, foam: 0x8a7464, haze: 0x5a4844, spark: 0xffc890 },
  amb: { sky: [0.44, 0.40, 0.46], ground: [0.16, 0.12, 0.12] }, key: { dir: [0.5, 0.7, 0.5], color: [0.34, 0.26, 0.20] },
  hemi: { sky: 0xb8a0b0, ground: 0x4a3a34, k: 1.35 }, sun: { color: 0xffa860, k: 1.5 },
  top: { base: [['asphalt', 5], ['concrete_dark', 2]], patch: [['concrete', 2], ['concrete_dark', 1]], patchK: 0.3, tint: [0.92, 0.86, 0.8] },
  edge: [['concrete_dark', 2], ['rubble', 2]], side: { top: ['concrete_dark'], rows: [['concrete_dark', 2], ['rubble', 1], ['earth', 2]] },
  lights: [['lamp', 3], ['wreckfire', 2], ['barrelfire', 2]], tall: [['car', 3], ['pillar', 2], ['wall', 1]], low: [['cone', 2], ['tire', 2], ['crate', 1], ['barrel', 2], ['rocks', 1]],
  sat: { top: [['concrete_dark', 2], ['rubble', 1]], side: 'concrete_dark' }, glow: 0xffa850,
};
