// Hầm Mộ Cát: a sand tomb terrace over a deep pit under the noon sun: light almost straight down, short hard shadows, a pale
// sand haze. Torches still burn but read as small flames in the glare.
// The floor is worn tomb tiles with carved slabs, all of one sand tone so units read on it; torchlight does the gold.
// The light is pulled toward white (lightWhite) and the warmth of the stone held down so the frame stays inside the warm
// pixel budget. Obelisks, walls and pillars stand on the far rim and flanks; urns and bones on the near side. The boss
// floor splits in seams of ember gold.
export const CRYPT = {
  name: 'crypt', lightK: 0.3, rimTint: [0.84, 0.82, 0.86], lightWhite: 0.8, rain: 0, fog: 0xd8c49a, rise: 0x5a4028, day: 1, shadow: 0.6, shadowC: 0x281808,
  abyss: { type: 'mist', y: -10, deep: 0x3a2a1a, shallow: 0x9a7a4a, foam: 0xe0c890, haze: 0xb89a6a, spark: 0xffe0a0 },
  amb: { sky: [0.56, 0.56, 0.6], ground: [0.28, 0.24, 0.2] }, key: { dir: [0.22, 0.95, -0.2], color: [0.56, 0.52, 0.44] },
  hemi: { sky: 0xd8dce8, ground: 0x6a5848, k: 1.0 }, sun: { color: 0xfff0d0, k: 1.6 },
  top: { base: [['sand_tile', 4], ['sandstone_big', 2]], patch: [['sandstone_big', 2], ['sand_tile', 1]], patchK: 0.2, tint: [1.44, 1.36, 1.34] },
  edge: [['sandstone', 2], ['sand', 1]], side: { top: ['sandstone'], rows: [['sandstone', 2], ['sandstone_big', 2], ['earth', 1]] },
  lights: [['torch', 5], ['brazier', 2]], tall: [['obelisk', 3], ['wall', 2], ['pillar', 2], ['palm', 1]], low: [['urn', 3], ['bones', 2], ['rocks', 1]],
  sat: { top: [['sandstone', 3], ['sand', 1]], side: 'sandstone' }, glow: 0xffa040,
  boss: {
    top: { base: [['sandstone_big', 3], ['sand_tile', 2]], patch: [['sand_tile', 1]], patchK: 0.14, tint: [0.5, 0.46, 0.5] }, centre: [0.16, 0.08, 0.03],
    hemi: 0xff8a50, sun: 0xff7a30, crack: [1.0, 0.58, 0.16], crackC: 0xff8a30,
  },
};
