// Hầm Mộ Cát: a sandstone terrace over a dark pit lit by torches
export const CRYPT = {
  name: 'crypt', centre: [0.10, 0.10, 0.13], lightK: 0.4, rimTint: [0.38, 0.5, 0.92], lightWhite: 0.8,  rain: 0, fog: 0x1e1610, rise: 0x140c08,
  abyss: { type: 'mist', y: -10, deep: 0x080504, shallow: 0x3a2a1a, foam: 0x8a6a40, haze: 0x3a2a1c, spark: 0xffc070 },
  amb: { sky: [0.38, 0.38, 0.46], ground: [0.12, 0.10, 0.10] }, key: { dir: [0.4, 0.75, 0.5], color: [0.24, 0.22, 0.2] },
  hemi: { sky: 0x98a0ac, ground: 0x3a2e28, k: 1.3 }, sun: { color: 0xffc090, k: 1.3 },
  top: { base: [['sand_tile', 4], ['sand', 2]], patch: [['sandstone_big', 3], ['sand', 1]], patchK: 0.3, tint: [0.36, 0.4, 0.56] },
  edge: [['sandstone', 2], ['sand', 1]], side: { top: ['sandstone'], rows: [['sandstone', 2], ['sandstone_big', 1], ['earth', 1]] },
  lights: [['torch', 4], ['brazier', 3]], tall: [['obelisk', 2], ['wall', 2], ['palm', 2]], low: [['urn', 2], ['rocks', 2], ['crate', 1], ['bones', 1]],
  sat: { top: [['sandstone', 3], ['sand', 1]], side: 'sandstone' }, glow: 0xffa040,
};
