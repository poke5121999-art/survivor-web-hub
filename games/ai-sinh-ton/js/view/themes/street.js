// Phố Hoang: a ruined street island over dark water at dusk, street lamps and burning barrels
export const STREET = {
  name: 'street', centre: [0.10, 0.12, 0.16],  rain: 1, fog: 0x1a2634, rise: 0x0c1820,
  abyss: { type: 'water', y: -2.6, deep: 0x07141e, shallow: 0x1c4c5a, foam: 0x8ec8d0, haze: 0x2a3e52, spark: 0xd8f0ff },
  amb: { sky: [0.40, 0.47, 0.66], ground: [0.12, 0.12, 0.18] }, key: { dir: [-0.5, 0.75, 0.4], color: [0.34, 0.30, 0.30] },
  hemi: { sky: 0xb4bcd8, ground: 0x4a4448, k: 1.5 }, sun: { color: 0xffb27a, k: 1.5 },
  top: { base: [['asphalt', 6], ['asphalt_wet', 2]], patch: [['paving', 3], ['cobble', 2], ['puddle', 1]], patchK: 0.3, tint: [0.92, 0.94, 1.0] },
  edge: [['paving', 3], ['cobble', 2], ['rubble', 1]], side: { top: ['concrete', 'brick'], rows: [['brick', 2], ['concrete_dark', 2], ['rock', 2]] },
  lights: [['lamp', 3], ['barrelfire', 3], ['campfire', 1]], tall: [['car', 2], ['wall', 2], ['deadtree', 1], ['lamp', 1]], low: [['crate', 2], ['barrel', 2], ['rocks', 2], ['sandbags', 2], ['cone', 1]],
  sat: { top: [['grass_dark', 3], ['cobble', 1]], side: 'grass_dark_side' }, glow: 0xffa040,
};
