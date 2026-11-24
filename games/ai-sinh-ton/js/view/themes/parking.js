// Bãi Xe Cũ: an old car park slab floating over amber haze at sunset (the street's evening), sodium lamps and wrecks on fire
export const PARKING = {
  name: 'parking', lightK: 0.55, rain: 0, fog: 0xa87c64, rise: 0x3a2a26, shadow: 0.55, shadowC: 0x1a1030,
  abyss: { type: 'mist', y: -9, deep: 0x2a1a18, shallow: 0x8a6450, foam: 0xd0a080, haze: 0x9a7460, spark: 0xffc890 },
  amb: { sky: [0.6, 0.56, 0.66], ground: [0.22, 0.17, 0.18] }, key: { dir: [0.82, 0.45, -0.3], color: [0.78, 0.44, 0.2] },
  hemi: { sky: 0xb8b0d0, ground: 0x5a4440, k: 1.45 }, sun: { color: 0xffa868, k: 2.1 },
  top: { base: [['asphalt', 5], ['concrete_dark', 2]], patch: [['concrete', 2], ['concrete_dark', 1]], patchK: 0.3, tint: [1.42, 1.12, 0.86] },
  edge: [['concrete_dark', 2], ['rubble', 2]], side: { top: ['concrete_dark'], rows: [['concrete_dark', 2], ['rubble', 1], ['earth', 2]] },
  lights: [['lamp', 3], ['wreckfire', 2], ['barrelfire', 2]], tall: [['car', 3], ['pillar', 2], ['wall', 1]], low: [['cone', 2], ['tire', 2], ['crate', 1], ['barrel', 2], ['rocks', 1]],
  sat: { top: [['concrete_dark', 2], ['rubble', 1]], side: 'concrete_dark' }, glow: 0xffa850,
};
