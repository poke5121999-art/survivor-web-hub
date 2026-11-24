// Đảo Trời: a grassy island floating over a sea of cloud. A meadow underfoot (pulled toward olive so it stays calm under the
// units), pale stone cliffs with waterfalls pouring off the rim down into the clouds, blossom trees, boulders hovering over
// the grass, cloud puffs caught on the edge and stone lanterns; far islands drift in the cloud. The boss pad is a storm:
// the floor splits in seams of lightning blue.
export const SKY = {
  name: 'sky', rain: 0, fog: 0xa8c4e4, rise: 0x6a7aa0, day: 1, shadow: 0.55, shadowC: 0x142240, lightK: 0.6, fly: [1.0, 1.0, 0.86], falls: 0.035,
  abyss: { type: 'mist', y: -10, deep: 0x5a6a8c, shallow: 0xd2dcea, foam: 0xffffff, haze: 0xa8b8d4, spark: 0xfff4c0, mist: 0xe2e8f2, mistK: 0.8, cloud: 1,
    far: { top: 0x6a8a52, side: 0x8a8a94 } },
  amb: { sky: [0.76, 0.8, 0.9], ground: [0.32, 0.32, 0.36] }, key: { dir: [0.45, 0.8, -0.4], color: [0.6, 0.56, 0.46] },
  hemi: { sky: 0xe0eaff, ground: 0x6a6a7a, k: 1.0 }, sun: { color: 0xfff4e0, k: 1.5 },
  top: { base: [['meadow', 6]], patch: [['dirt', 2], ['skystone', 1]], patchK: 0.2, tint: [1.4, 1.12, 0.9] },
  rimTint: [0.95, 0.9, 0.95],
  edge: [['meadow', 3], ['skystone', 1]], side: { top: ['meadow_side'], rows: [['skystone', 3], ['rock', 1]] },
  lights: [['torch', 3], ['stonelamp', 3], ['brazier', 1]],
  tall: [['skytree', 4], ['floatrock', 3], ['pillar', 1]], low: [['cloudpuff', 3], ['rocks', 2], ['bush', 2], ['fence', 1]],
  sat: { top: [['meadow', 3], ['skystone', 1]], side: 'meadow_side' }, glow: 0xffb050,
  boss: {
    top: { base: [['meadow', 4], ['skystone', 2]], patch: [['dirt', 1]], patchK: 0.14, tint: [0.66, 0.62, 0.76] }, centre: [0.06, 0.08, 0.2],
    amb: { sky: [0.46, 0.5, 0.7], ground: [0.16, 0.16, 0.26] }, key: { dir: [-0.5, 0.75, 0.45], color: [0.3, 0.32, 0.44] },
    hemi: 0x8a90ff, sun: 0xb0c0ff, crack: [0.55, 0.75, 1.0], crackC: 0x80b0ff,
  },
};
