// Hầm Mộ Cát: a sand tomb terrace over a dark pit lit by torches
// The floor is worn tomb tiles with carved slabs, all of one sand tone so units read on it; torchlight does the gold.
// The light is pulled toward white (lightWhite) and the warmth of the stone held down so the frame stays inside the warm
// pixel budget. Obelisks, walls and pillars stand on the far rim and flanks; urns and bones on the near side. The boss
// floor splits in seams of ember gold.
export const CRYPT = {
  name: 'crypt', centre: [0.12, 0.10, 0.08], lightK: 0.42, rimTint: [0.6, 0.6, 0.8], lightWhite: 0.75, rain: 0, fog: 0x1c140e, rise: 0x140c08,
  abyss: { type: 'mist', y: -10, deep: 0x060404, shallow: 0x3a2814, foam: 0x8a6a40, haze: 0x3a2818, spark: 0xffc070 },
  amb: { sky: [0.40, 0.38, 0.44], ground: [0.12, 0.10, 0.10] }, key: { dir: [0.4, 0.75, 0.5], color: [0.26, 0.23, 0.2] },
  hemi: { sky: 0xa0a4b0, ground: 0x3a2e28, k: 1.3 }, sun: { color: 0xffc090, k: 1.3 },
  top: { base: [['sand_tile', 4], ['sandstone_big', 2]], patch: [['sandstone_big', 2], ['sand_tile', 1]], patchK: 0.2, tint: [0.56, 0.5, 0.5] },
  edge: [['sandstone', 2], ['sand', 1]], side: { top: ['sandstone'], rows: [['sandstone', 2], ['sandstone_big', 2], ['earth', 1]] },
  lights: [['torch', 4], ['brazier', 3]], tall: [['obelisk', 3], ['wall', 2], ['pillar', 2], ['palm', 1]], low: [['urn', 3], ['bones', 2], ['rocks', 1]],
  sat: { top: [['sandstone', 3], ['sand', 1]], side: 'sandstone' }, glow: 0xffa040,
  boss: {
    crack: [1.0, 0.58, 0.16], crackC: 0xff8a30, warm: 1, mood: 0xff8a50, sun: 0xff7a30,
    pad: { centre: [0.16, 0.08, 0.03], top: { base: [['sandstone_big', 3], ['sand_tile', 2]], patch: [['sand_tile', 1]], patchK: 0.14, tint: [0.5, 0.46, 0.5] } },
  },
};
