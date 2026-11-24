// Bờ Biển: a sandy headland over the sea in the afternoon. Damp grey-gold sand underfoot (desaturated so it never counts as
// warm and units read on it), cliff faces in sediment bands, a wrecked ship strewn on the rim (hull ribs, a broken mast with a
// torn sail, driftwood), palms and sea stacks, ship's lanterns and driftwood fires; the sea below rolls foam in toward the
// shore. The boss pad is the wreck at dusk, its embers glowing in the cracks.
export const COAST = {
  name: 'coast', rain: 0, fog: 0x9cc8e0, rise: 0x2a6a7a, day: 1, shadow: 0.55, shadowC: 0x0a2a40, lightWhite: 0.6, lightK: 0.6, fly: [1.0, 0.96, 0.82],
  abyss: { type: 'water', y: -2.6, deep: 0x0c3a54, shallow: 0x2a8a9c, foam: 0xeaf6fa, haze: 0x8ab8cc, spark: 0xffffff, waves: 1 },
  amb: { sky: [0.6, 0.64, 0.72], ground: [0.26, 0.26, 0.26] }, key: { dir: [0.5, 0.8, -0.35], color: [0.5, 0.47, 0.4] },
  hemi: { sky: 0xdce8ff, ground: 0x7a6e5a, k: 1.3 }, sun: { color: 0xfff2dc, k: 1.9 },
  top: { base: [['sand_wet', 5], ['sand_dry', 2]], patch: [['sand_dry', 3], ['seaweed', 1]], patchK: 0.2, tint: [1.04, 1.08, 1.26] },
  rimTint: [0.9, 0.88, 0.9],
  edge: [['sand_dry', 3], ['sand_wet', 1], ['cliff', 1]], side: { top: ['cliff'], rows: [['cliff', 3], ['rock', 1]] },
  lights: [['lantern', 3], ['campfire', 2], ['torch', 2]],
  tall: [['palm', 4], ['ribs', 3], ['mast', 2], ['seastack', 2]], low: [['driftwood', 3], ['seaweed', 2], ['rocks', 2], ['crate', 1], ['barrel', 1]],
  sat: { top: [['sand_dry', 3], ['sand_wet', 1]], side: 'cliff' }, glow: 0xffb050,
  boss: {
    top: { base: [['sand_wet', 4], ['wreck', 2]], patch: [['burnt', 1]], patchK: 0.14, tint: [0.84, 0.76, 0.74] }, centre: [0.26, 0.1, 0.03],
    amb: { sky: [0.64, 0.5, 0.52], ground: [0.3, 0.16, 0.12] }, key: { dir: [-0.5, 0.75, 0.45], color: [0.56, 0.32, 0.2] },
    crack: [1.0, 0.56, 0.18], crackC: 0xff8a30,
  },
};
