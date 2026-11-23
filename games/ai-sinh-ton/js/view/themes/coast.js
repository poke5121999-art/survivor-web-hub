// Bờ Biển: a sandy headland over the sea in the afternoon. Damp grey-gold sand underfoot (desaturated so it never counts as
// warm and units read on it), cliff faces in sediment bands, a wrecked ship strewn on the rim (hull ribs, a broken mast with a
// torn sail, driftwood), palms and sea stacks, ship's lanterns and driftwood fires; the sea below rolls foam in toward the
// shore. The boss pad is the wreck at dusk, its embers glowing in the cracks.
export const COAST = {
  name: 'coast', rain: 0, fog: 0x8ab4c8, rise: 0x2a6a7a, day: 1, lightWhite: 0.6, fly: [1.0, 0.96, 0.82],
  abyss: { type: 'water', y: -2.6, deep: 0x0c3a54, shallow: 0x2a8a9c, foam: 0xeaf6fa, haze: 0x8ab8cc, spark: 0xffffff, waves: 1 },
  amb: { sky: [0.66, 0.7, 0.78], ground: [0.28, 0.27, 0.26] }, key: { dir: [-0.5, 0.75, 0.45], color: [0.38, 0.35, 0.3] },
  hemi: { sky: 0xdce8ff, ground: 0x8a7e6a, k: 1.7 }, sun: { color: 0xfff2dc, k: 2.0 },
  top: { base: [['sand_wet', 5], ['sand_dry', 2]], patch: [['sand_dry', 3], ['seaweed', 1]], patchK: 0.2, tint: [0.84, 0.84, 0.9] },
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
