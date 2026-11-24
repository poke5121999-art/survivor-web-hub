// Phố Hoang: a ruined street island over water at sunset: a low orange sun from the right throws long shadows across the
// asphalt, the sky haze is amber, street lamps and burning barrels already lit
export const STREET = {
  name: 'street', rain: 0, fog: 0xb88a6c, rise: 0x3a2a2a, shadow: 0.55, shadowC: 0x1a1030, lightK: 0.7,
  abyss: { type: 'water', y: -2.6, deep: 0x142030, shallow: 0x3a5a6a, foam: 0xf0d0b0, haze: 0x8a6a60, spark: 0xffe0b0 },
  amb: { sky: [0.56, 0.53, 0.64], ground: [0.2, 0.16, 0.18] }, key: { dir: [0.82, 0.45, -0.3], color: [0.8, 0.46, 0.22] },
  hemi: { sky: 0xb8b0d0, ground: 0x5a4440, k: 1.45 }, sun: { color: 0xffa868, k: 2.2 },
  top: { base: [['asphalt', 6], ['asphalt_wet', 2]], patch: [['paving', 3], ['cobble', 2], ['puddle', 1]], patchK: 0.3, tint: [0.92, 0.94, 1.0] },
  edge: [['paving', 3], ['cobble', 2], ['rubble', 1]], side: { top: ['concrete', 'brick'], rows: [['brick', 2], ['concrete_dark', 2], ['rock', 2]] },
  lights: [['lamp', 3], ['barrelfire', 3], ['campfire', 1]], tall: [['car', 2], ['wall', 2], ['deadtree', 1], ['lamp', 1]], low: [['crate', 2], ['barrel', 2], ['rocks', 2], ['sandbags', 2], ['cone', 1]],
  sat: { top: [['grass_dark', 3], ['cobble', 1]], side: 'grass_dark_side' }, glow: 0xffa040,
};
