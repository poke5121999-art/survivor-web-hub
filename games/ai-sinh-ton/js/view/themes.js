// Theme tables for the battle world, one per chapter (stages.js CHAPTERS order). The generator (pad.js) and the scene
// (world.js) read only these. Colours: `amb`, `key` and light colours are linear multipliers baked into vertex colours;
// hex colours are scene colours. Tiles are voxtex.js atlas keys, weighted.
//   top: the play floor: base tiles, patches of other tiles by low-frequency noise (paths, worn stone, puddles)
//   edge: top of the terraces and satellites; side: first row under a top, then deeper rows
//   abyss: water (a plane `y` below the floor) or mist (sheets over a deep pit); `rise` is what climbing monsters fade from
//   lights: the light-giving props placed on the rim (warm ones count for the look test); tall / low: other rim props
export const THEMES = [
  { // Phố Hoang: a ruined street island over dark water at dusk, street lamps and burning barrels
    name: 'street', centre: [0.10, 0.12, 0.16],  rain: 1, fog: 0x1a2634, rise: 0x0c1820,
    abyss: { type: 'water', y: -2.6, deep: 0x07141e, shallow: 0x1c4c5a, foam: 0x8ec8d0, haze: 0x2a3e52, spark: 0xd8f0ff },
    amb: { sky: [0.40, 0.47, 0.66], ground: [0.12, 0.12, 0.18] }, key: { dir: [-0.5, 0.75, 0.4], color: [0.34, 0.30, 0.30] },
    hemi: { sky: 0x8aa0d8, ground: 0x3a3440, k: 1.35 }, sun: { color: 0xffb27a, k: 1.5 },
    top: { base: [['asphalt', 6], ['asphalt_wet', 2]], patch: [['paving', 3], ['cobble', 2], ['puddle', 1]], patchK: 0.3, tint: [0.92, 0.94, 1.0] },
    edge: [['paving', 3], ['cobble', 2], ['rubble', 1]], side: { top: ['concrete', 'brick'], rows: [['brick', 2], ['concrete_dark', 2], ['rock', 2]] },
    lights: [['lamp', 3], ['barrelfire', 3], ['campfire', 1]], tall: [['car', 2], ['wall', 2], ['deadtree', 1], ['lamp', 1]], low: [['crate', 2], ['barrel', 2], ['rocks', 2], ['sandbags', 2], ['cone', 1]],
    sat: { top: [['grass_dark', 3], ['cobble', 1]], side: 'grass_dark_side' }, glow: 0xffa040,
  },
  { // Bãi Xe Cũ: an old car park slab floating over brown fog, sodium lamps and wrecks on fire
    name: 'parking', centre: [0.14, 0.13, 0.14], lightK: 0.6,  rain: 0, fog: 0x2a2228, rise: 0x2a2024,
    abyss: { type: 'mist', y: -9, deep: 0x120c10, shallow: 0x4a3a38, foam: 0x8a7464, haze: 0x5a4844, spark: 0xffc890 },
    amb: { sky: [0.44, 0.40, 0.46], ground: [0.16, 0.12, 0.12] }, key: { dir: [0.5, 0.7, 0.5], color: [0.34, 0.26, 0.20] },
    hemi: { sky: 0xb8a0b0, ground: 0x4a3a34, k: 1.35 }, sun: { color: 0xffa860, k: 1.5 },
    top: { base: [['asphalt', 5], ['concrete_dark', 2]], patch: [['concrete', 2], ['concrete_dark', 1]], patchK: 0.3, tint: [0.92, 0.86, 0.8] },
    edge: [['concrete_dark', 2], ['rubble', 2]], side: { top: ['concrete_dark'], rows: [['concrete_dark', 2], ['rubble', 1], ['earth', 2]] },
    lights: [['lamp', 3], ['wreckfire', 2], ['barrelfire', 2]], tall: [['car', 3], ['pillar', 2], ['wall', 1]], low: [['cone', 2], ['tire', 2], ['crate', 1], ['barrel', 2], ['rocks', 1]],
    sat: { top: [['concrete_dark', 2], ['rubble', 1]], side: 'concrete_dark' }, glow: 0xffa850,
  },
  { // Nhà Máy Lạnh: a cold factory platform over icy water, blue-white lamps with a few warm braziers
    name: 'factory', centre: [0.04, 0.05, 0.06], lightK: 0.9,  rain: 0, snow: 1, fog: 0x1a2a3a, rise: 0x14283a,
    abyss: { type: 'water', y: -2.6, deep: 0x0a1c2e, shallow: 0x3a7a96, foam: 0xd8f0ff, haze: 0x3a5468, spark: 0xffffff, ice: 1 },
    amb: { sky: [0.44, 0.52, 0.70], ground: [0.16, 0.19, 0.25] }, key: { dir: [-0.4, 0.8, 0.45], color: [0.28, 0.32, 0.40] },
    hemi: { sky: 0xb8d0f0, ground: 0x3a4a5a, k: 1.45 }, sun: { color: 0xffc890, k: 1.3 },
    top: { base: [['frost_metal', 4], ['metal', 1]], patch: [['snow', 2], ['ice', 1]], patchK: 0.28, tint: [0.6, 0.66, 0.78] },
    edge: [['snow', 3], ['ice', 1]], side: { top: ['snow', 'frost_metal'], rows: [['metal_dark', 2], ['ice', 1], ['rock', 2]] },
    lights: [['brazier', 3], ['coldlamp', 3], ['barrelfire', 1]], tall: [['tank', 2], ['pipes', 2], ['pillar', 1]], low: [['crate', 2], ['barrel', 2], ['rocks', 2], ['icerock', 2]],
    sat: { top: [['snow', 3], ['ice', 1]], side: 'ice' }, glow: 0xffb060,
  },
  { // Hầm Mộ Cát: a sandstone terrace over a dark pit lit by torches
    name: 'crypt', centre: [0.10, 0.10, 0.13], lightK: 0.4,  rain: 0, fog: 0x1e1610, rise: 0x140c08,
    abyss: { type: 'mist', y: -10, deep: 0x080504, shallow: 0x3a2a1a, foam: 0x8a6a40, haze: 0x3a2a1c, spark: 0xffc070 },
    amb: { sky: [0.38, 0.38, 0.46], ground: [0.12, 0.10, 0.10] }, key: { dir: [0.4, 0.75, 0.5], color: [0.30, 0.22, 0.14] },
    hemi: { sky: 0xa89880, ground: 0x3a2a1a, k: 1.3 }, sun: { color: 0xffa050, k: 1.6 },
    top: { base: [['sand_tile', 4], ['sand', 2]], patch: [['sandstone_big', 2], ['sand', 2]], patchK: 0.3, tint: [0.44, 0.44, 0.5] },
    edge: [['sandstone', 2], ['sand', 1]], side: { top: ['sandstone'], rows: [['sandstone', 2], ['sandstone_big', 1], ['earth', 1]] },
    lights: [['torch', 4], ['brazier', 3]], tall: [['obelisk', 2], ['wall', 2], ['palm', 2]], low: [['urn', 2], ['rocks', 2], ['crate', 1], ['bones', 1]],
    sat: { top: [['sand', 2], ['sandstone', 1]], side: 'sandstone' }, glow: 0xffa040,
  },
  { // Bãi Đáp Lạ: a grassy island in the day over bright water, an odd landing site with a crashed hull and campfires
    name: 'landing', rain: 0, fog: 0x8ab8d0, rise: 0x2a6a7a, day: 1,
    abyss: { type: 'water', y: -2.6, deep: 0x1a5a78, shallow: 0x4ab0c0, foam: 0xe8fbff, haze: 0x9ac8da, spark: 0xffffff },
    amb: { sky: [0.82, 0.86, 0.92], ground: [0.34, 0.32, 0.28] }, key: { dir: [-0.5, 0.75, 0.45], color: [0.45, 0.40, 0.32] },
    hemi: { sky: 0xdce8ff, ground: 0x8a7e6a, k: 1.7 }, sun: { color: 0xfff2dc, k: 2.1 },
    top: { base: [['grass_top', 6]], patch: [['dirt', 3], ['cobble', 1]], patchK: 0.3, tint: [0.6, 0.68, 0.56] },
    edge: [['grass_top', 3], ['dirt', 1]], side: { top: ['grass_side'], rows: [['dirt', 2], ['roots', 1], ['rock', 2]] },
    lights: [['campfire', 2], ['torch', 3], ['mushrooms', 2]], tall: [['tree', 4], ['hull', 1], ['wall', 1]], low: [['rocks', 2], ['fence', 3], ['crate', 1], ['bush', 2]],
    sat: { top: [['grass_top', 3], ['dirt', 1]], side: 'grass_side' }, glow: 0xffb050,
  },
  { // Rìa Hư Không: a violet stone island at the edge of the void, crystals and braziers over a purple abyss
    name: 'void', centre: [0.16, 0.13, 0.22],  rain: 0, fog: 0x1a1430, rise: 0x120c22,
    abyss: { type: 'mist', y: -10, deep: 0x06040e, shallow: 0x3a2a5e, foam: 0x9a7ad0, haze: 0x2e2448, spark: 0xd8b8ff },
    amb: { sky: [0.44, 0.39, 0.64], ground: [0.13, 0.10, 0.20] }, key: { dir: [-0.4, 0.75, 0.5], color: [0.26, 0.20, 0.34] },
    hemi: { sky: 0xa898e0, ground: 0x3a2e50, k: 1.35 }, sun: { color: 0xffb070, k: 1.4 },
    top: { base: [['void_stone', 4], ['void_brick', 2]], patch: [['obsidian', 2], ['cobble', 1]], patchK: 0.3, tint: [0.92, 0.9, 1.0] },
    edge: [['void_brick', 2], ['obsidian', 1]], side: { top: ['void_brick'], rows: [['void_brick', 2], ['obsidian', 2], ['rock', 1]] },
    lights: [['brazier', 3], ['crystal', 3], ['torch', 2]], tall: [['obelisk', 2], ['crystal', 2], ['deadtree', 1]], low: [['rocks', 2], ['urn', 1], ['shard', 2]],
    sat: { top: [['void_stone', 2], ['obsidian', 1]], side: 'void_brick' }, glow: 0xffa050,
  },
];

// light-giving props: colour (linear), radius (m), strength, height of the flame or lamp, whether it reads as warm
export const LIGHTS = {
  lamp: { color: [1.0, 0.62, 0.28], r: 8, k: 1.0, h: 3.3, warm: 1, glow: 2.4 },
  coldlamp: { color: [0.55, 0.75, 1.0], r: 6, k: 0.7, h: 3.3, warm: 0, glow: 1.8, glowC: 0x5a88b0 },
  barrelfire: { color: [1.0, 0.5, 0.16], r: 6.5, k: 1.0, h: 1.15, warm: 1, glow: 1.9 },
  wreckfire: { color: [1.0, 0.48, 0.14], r: 7.5, k: 1.1, h: 1.2, warm: 1, glow: 2.4 },
  campfire: { color: [1.0, 0.52, 0.18], r: 8, k: 1.25, h: 0.6, warm: 1, glow: 2.6 },
  torch: { color: [1.0, 0.56, 0.2], r: 5.5, k: 0.95, h: 1.15, warm: 1, glow: 1.6 },
  brazier: { color: [1.0, 0.52, 0.18], r: 6.5, k: 1.1, h: 1.1, warm: 1, glow: 2.0 },
  mushrooms: { color: [1.0, 0.78, 0.32], r: 3.5, k: 0.8, h: 0.5, warm: 1, glow: 1.4, glowC: 0xffd070 },
  crystal: { color: [0.62, 0.36, 1.0], r: 5, k: 0.9, h: 1.4, warm: 0, glow: 2.0, glowC: 0xb080ff },
};
