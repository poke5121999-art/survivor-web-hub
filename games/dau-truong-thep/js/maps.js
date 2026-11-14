// Hand-written arena layouts. Each map lists the features of the left half (team 0 side);
// compileMap() rotates them 180 degrees around the centre to make the right half, so both teams get the same ground.
// Pure data and geometry: no three.js here.

// wall:  [x, z, width(x), depth(z), height, kind]     kind: ruin | block | fence | container | rampart (the wall of a base yard)
// round: [x, z, radius, kind]                        kind: pillar | rock | tree  (blocks movement and shots)
// bush:  [x, z, radius]
// prop:  [x, z, kind]                                kind: crate | barrel | pot   (destructible)
// path:  [[x, z], ...]                               ground trail for the terrain shader
export const MAPS = {
  denrung: {
    name: 'Đền Rừng', theme: 'jungle', size: [78, 52],
    blurb: 'Phế tích đền cổ giữa rừng mưa. Ba lối đi, quảng trường trung tâm có bốn cột đá.',
    base: [-33, 0],
    spawns: [[-34, 0], [-33, -3], [-33, 3], [-35.5, -1.8], [-35.5, 1.8]],
    walls: [
      [-26.5, -8.5, 1.8, 7, 2.6, 'ruin'], [-26.5, 8.5, 1.8, 7, 2.6, 'ruin'],
      [-15, -11, 11, 1.8, 2.4, 'ruin'], [-15.5, 11.5, 9, 1.8, 2.4, 'ruin'],
      [-9.5, 0, 2.6, 6.5, 3.4, 'block'], [-19, 3.5, 3.2, 3.2, 3.8, 'block'],
      [-4, -17, 1.8, 6, 2.4, 'ruin'], [-5, 19, 5.5, 1.8, 2.2, 'ruin'],
      [-21, -19.5, 4, 1.6, 1.5, 'fence'], [-29, 17.5, 1.6, 4.5, 1.5, 'fence'],
    ],
    rounds: [
      [-4.6, -4.6, 0.95, 'pillar'], [-4.6, 4.6, 0.95, 'pillar'],
      [-21.65, -15.15, 1.5, 'rock'], [-11, 20.5, 1.3, 'rock'], [-31, -14.5, 1.6, 'rock'], [-30.5, 13.2, 1.2, 'rock'], [-14.5, -4.2, 1.1, 'rock'],
      [-22.5, -4.5, 0.5, 'tree'], [-13, 7, 0.5, 'tree'], [-7.2, -9.2, 0.5, 'tree'], [-17.5, 17.5, 0.5, 'tree'], [-1.8, 12.5, 0.5, 'tree'],
      [-10.5, -21, 0.5, 'tree'], [-24.5, 21.5, 0.5, 'tree'], [-34.5, -20.5, 0.5, 'tree'], [-35.5, 9.5, 0.5, 'tree'], [-27.5, -1.5, 0.45, 'tree'],
      [-2.5, -23, 0.5, 'tree'], [-18, -7.5, 0.45, 'tree'],
    ],
    bushes: [
      [-14, -18.5, 2.7], [-10.8, -16.8, 2.0], [-20.5, 9.5, 2.5], [-6.2, 8.5, 2.3], [-1.5, -12.3, 2.1],
      [-28, -18.5, 2.6], [-9.5, 15, 2.3], [-23, 15.5, 2.0], [-15.5, -1, 1.8],
    ],
    props: [
      [-16.85, -2.55, 'crate'], [-18.3, -3.1, 'crate'], [-6.6, -13.5, 'crate'], [-12.5, 14, 'crate'],
      [-12, -7, 'barrel'], [-3.2, 15.5, 'barrel'], [-23.05, -10.8, 'barrel'],
      [-22, 12.5, 'pot'], [-20.9, 13.6, 'pot'], [-6.8, 3.7, 'pot'], [-29.95, -5.7, 'pot'], [-2.4, -8.6, 'pot'],
    ],
    cratePoints: [[0, 0], [-17, -7.5], [0, -9.5], [-18, -15], [-8.5, 17], [-23, 7]],
    paths: [
      [[-37, 0], [-29, 0], [-22, -1], [-14, -1.5], [-12, -5.5], [-7, -6], [0, 0]],
      [[-29, 0], [-26, -13.5], [-20, -16], [-9, -14.5], [0, -14], [8, -15]],
      [[-29, 0], [-26, 14], [-18, 15.5], [-9, 17], [0, 15.5]],
      [[-9, -14.5], [-7, -6]], [[-12.5, 15.8], [-12.5, 7], [-14, -1.5]],
    ],
    plaza: [0, 0, 8.5],
    hazards: [[-12.5, -6.5, 2.4], [-6, 13, 2.6], [-20, -14.5, 2.4]],
  },
  xuongcat: {
    name: 'Xưởng Cát', theme: 'desert', size: [84, 48],
    blurb: 'Bãi container giữa sa mạc. Đường bắn dài, ít chỗ nấp, hai họng lửa phụt theo nhịp ở lối giữa.',
    base: [-36, 0],
    spawns: [[-37, 0], [-36, -3], [-36, 3], [-38.5, -1.8], [-38.5, 1.8]],
    walls: [
      [-29, -9, 2.4, 6, 2.6, 'container'], [-29, 9, 2.4, 6, 2.6, 'container'],
      [-19, -3.5, 6, 2.4, 2.6, 'container'], [-19, 5.5, 6, 2.4, 2.6, 'container'], [-19, 5.5, 6, 2.4, 5.2, 'container'],
      [-12, -13, 2.4, 6, 2.6, 'container'], [-10, 14.5, 6, 2.4, 2.6, 'container'],
      [-6.5, 0, 2.4, 6, 2.6, 'container'],
      [-22, -17, 7, 1.6, 2.2, 'ruin'], [-24, 17.5, 5, 1.6, 2.2, 'ruin'],
      [-2, -19.5, 1.6, 5, 1.5, 'fence'], [-0.5, 19.8, 1.6, 4.5, 1.5, 'fence'],
    ],
    rounds: [
      [-3.2, -8, 0.9, 'pillar'], [-3.2, 8, 0.9, 'pillar'],
      [-33, -16, 1.6, 'rock'], [-32, 17.5, 1.4, 'rock'], [-15, 10.5, 1.2, 'rock'], [-25, 0.5, 1.1, 'rock'], [-8, -20, 1.5, 'rock'],
      [-14.5, -19.5, 0.5, 'cactus'], [-27.15, 13.35, 0.5, 'cactus'], [-5, 11.5, 0.5, 'cactus'], [-21, -10.5, 0.5, 'cactus'], [-37, 10, 0.5, 'cactus'],
      [-38, -12, 0.5, 'cactus'], [-16, 20.5, 0.5, 'cactus'],
    ],
    bushes: [[-25, -14, 2.4], [-14.5, -8.5, 2.2], [-12, 19.5, 2.4], [-24, 12, 2.0], [-2, -14.5, 2.2], [-8, 7.5, 2.0]],
    props: [
      [-15.5, 0.5, 'crate'], [-16.7, 1.55, 'crate'], [-9.2, -7.7, 'crate'], [-26.05, 5.6, 'crate'], [-4, 17, 'crate'],
      [-13, 4, 'barrel'], [-22.6, -7.2, 'barrel'], [-6.5, -15.5, 'barrel'], [-2.5, 3.8, 'barrel'],
      [-30.5, -3.5, 'pot'], [-17.5, 14, 'pot'],
    ],
    cratePoints: [[0, 0], [-13, -3.5], [0, -14], [-22, 14.5], [-9, 19], [-26, -4.5]],
    paths: [
      [[-41, 0], [-31, 0], [-23, 1], [-12, 0.5], [-2, 4.5], [0, 0]],
      [[-31, 0], [-27, -14], [-17, -15.5], [-6, -11], [0, -14]],
      [[-31, 0], [-27, 13.5], [-17, 10], [-7, 11], [0, 15]],
    ],
    plaza: [0, 0, 6],
    hazards: [[-1.5, -4.2, 2.3], [-10.5, 5.5, 2.3]],
  },
  cangbang: {
    name: 'Cảng Băng', theme: 'ice', size: [74, 54],
    blurb: 'Bến cảng đóng băng. Mặt băng giữa sân trơn trượt: lao vào thì nhanh, dừng lại thì khó.',
    base: [-31, 0],
    spawns: [[-32, 0], [-31, -3], [-31, 3], [-33.5, -1.8], [-33.5, 1.8]],
    walls: [
      [-24.5, -7.5, 1.8, 6, 2.6, 'ruin'], [-24.5, 7.5, 1.8, 6, 2.6, 'ruin'],
      [-16, -14, 8, 1.8, 2.4, 'ruin'], [-14, 13.5, 9, 1.8, 2.4, 'ruin'],
      [-12.5, -2, 3, 3, 3.6, 'block'], [-4.5, 9.5, 2.6, 5, 3.2, 'block'],
      [-5, -20.5, 6, 2.4, 2.6, 'container'], [-20, 21, 6, 2.4, 2.6, 'container'],
      [-18.5, 4, 1.6, 4, 1.5, 'fence'],
    ],
    rounds: [
      [-7, -8.5, 1.0, 'pillar'], [-1.5, -3.2, 0.95, 'pillar'],
      [-27, -17, 1.6, 'rock'], [-10, 20.5, 1.4, 'rock'], [-29.5, 13, 1.3, 'rock'], [-19, -6.5, 1.1, 'rock'],
      [-21, -20, 0.55, 'pine'], [-12.5, -9, 0.55, 'pine'], [-27, 19.5, 0.55, 'pine'], [-33, -11, 0.55, 'pine'], [-33.5, 9.5, 0.55, 'pine'],
      [-8.3, 16.6, 0.55, 'pine'], [-1, 22.5, 0.55, 'pine'], [-15.5, 8, 0.5, 'pine'], [-2, -13, 0.5, 'pine'],
    ],
    bushes: [[-22, -12.5, 2.4], [-11, -18, 2.3], [-20, 12, 2.3], [-9, 5, 2.0], [-28, -2.5, 1.8], [-3, 17, 2.3], [-15.5, -5.8, 1.8]],
    props: [
      [-16.35, 0.95, 'crate'], [-9.2, -13, 'crate'], [-13, 17.5, 'crate'], [-25.4, 13.5, 'crate'],
      [-8.5, 1.5, 'barrel'], [-20.9, -16.2, 'barrel'], [-6, 21.5, 'barrel'],
      [-22.65, 3.35, 'pot'], [-3.65, -17.85, 'pot'], [-27.85, -10.35, 'pot'],
    ],
    cratePoints: [[0, 0], [-16.5, -9.5], [0, -17], [-23, 16.5], [-9, 10], [-20, -1]],
    paths: [
      [[-36, 0], [-27, 0], [-20, 0.5], [-14.5, 2.5], [-7, 3.5], [0, 0]],
      [[-27, 0], [-25, -13], [-17, -18], [-6, -16.5], [0, -17]],
      [[-27, 0], [-25, 13.5], [-17, 18], [-7, 14.5], [0, 14]],
    ],
    plaza: [0, 0, 5],
    hazards: [[0, 0, 7.5], [-11.5, 9.5, 4], [-13.5, -18.5, 3.6]],
  },
  mienglua: {
    name: 'Miệng Lửa', theme: 'lava', size: [78, 50],
    blurb: 'Lòng núi lửa. Các hồ dung nham chia sân thành những dải đá hẹp: đứng vào là cháy.',
    base: [-33, 0],
    spawns: [[-34, 0], [-33, -3], [-33, 3], [-35.5, -1.8], [-35.5, 1.8]],
    walls: [
      [-26, -8, 1.8, 5.5, 2.6, 'ruin'], [-26, 8, 1.8, 5.5, 2.6, 'ruin'],
      [-15, 0, 2.6, 5, 3.4, 'block'], [-6, -13.5, 5, 1.8, 2.4, 'ruin'], [-7.5, 12.5, 6, 1.8, 2.4, 'ruin'],
      [-20.5, -19, 5, 1.8, 2.2, 'ruin'], [-21, 19.5, 4.5, 1.8, 2.2, 'ruin'], [-2.5, 5.5, 1.8, 4, 2.4, 'ruin'],
    ],
    rounds: [
      [-4.2, -4.4, 0.95, 'pillar'],
      [-29, -15.5, 1.7, 'rock'], [-30, 15, 1.5, 'rock'], [-11.5, 6.5, 1.2, 'rock'], [-9.5, -6, 1.2, 'rock'], [-23.5, 2.5, 1.1, 'rock'],
      [-14.2, -22.45, 1.6, 'rock'], [-2, 21.5, 1.5, 'rock'],
      [-21, -4.5, 0.55, 'spire'], [-12.5, 20.5, 0.55, 'spire'], [-34.5, -19, 0.6, 'spire'], [-35, 10.5, 0.55, 'spire'], [-1, -21.5, 0.6, 'spire'],
      [-25.5, -22, 0.55, 'spire'], [-6.5, 2.5, 0.5, 'spire'],
    ],
    bushes: [[-23.5, -13.5, 2.3], [-9.5, -19.5, 2.3], [-25, 13.5, 2.3], [-3.5, 15.5, 2.2], [-19.5, 5.5, 1.9], [-1.5, -9.5, 2.0]],
    props: [
      [-19.05, -1.4, 'crate'], [-10, -10.3, 'crate'], [-12.5, 15.5, 'crate'], [-28.8, 3.2, 'crate'],
      [-18, 8, 'barrel'], [-3.7, -16.95, 'barrel'], [-22.5, -7.5, 'barrel'],
      [-6.5, 8, 'pot'], [-29.5, -5, 'pot'], [-16, -5, 'pot'],
    ],
    cratePoints: [[0, 0], [-19, -9], [0, -17.5], [-21.5, 10.5], [-9, 17.5], [-9.5, 0]],
    paths: [
      [[-37, 0], [-29, 0], [-21, 0.5], [-18.5, 4.5], [-10, 3], [0, 0]],
      [[-29, 0], [-26, -14], [-17.5, -17], [-7, -17.5], [0, -17.5]],
      [[-29, 0], [-26, 14], [-17, 16.5], [-8, 17], [0, 15]],
    ],
    plaza: [0, 0, 5.5],
    hazards: [[-16.5, -10, 3.4], [-13.5, 10.5, 3.2], [-4.5, -9.5, 2.4], [0, 9.5, 2.8]],
  },
  // Base-assault layouts (mode nha only). towers: [kind, x, z] of team 0; yard: [x0, x1, z0, z1], the walled base the towers stand in.
  luythep: {
    name: 'Lũy Thép', theme: 'jungle', size: [104, 54], mode: 'nha',
    blurb: 'Hai pháo đài ở hai đầu sân. Cổng giữa và hai cửa sườn đều có trụ phụ canh, trụ chính nằm giữa sân trong.',
    base: [-46, 0],
    spawns: [[-47, 0], [-46, -3], [-46, 3], [-48.5, -1.8], [-48.5, 1.8]],
    towers: [['main', -35.5, 0], ['sub', -24, -11.5], ['sub', -24, 11.5]],
    yard: [-52, -17.5, -20.5, 20.5],
    walls: [
      [-18.5, -5.5, 2, 6, 3.2, 'rampart'], [-18.5, 5.5, 2, 6, 3.2, 'rampart'],
      [-39, -19.5, 26, 2, 3.0, 'rampart'], [-39, 19.5, 26, 2, 3.0, 'rampart'],
      [-31.5, -6.5, 5, 1.6, 1.5, 'fence'], [-31.5, 6.5, 5, 1.6, 1.5, 'fence'],
      [-11, -9, 6, 1.8, 2.4, 'ruin'], [-11, 9.5, 6, 1.8, 2.4, 'ruin'],
      [-5, -21, 6, 1.8, 2.4, 'ruin'], [-5, 21.5, 5, 1.8, 2.4, 'ruin'],
      [-7.5, 0, 2.4, 5, 3.4, 'block'], [-2, -13.5, 5, 1.8, 2.2, 'ruin'],
    ],
    rounds: [
      [-16.6, -3.4, 0.9, 'pillar'], [-16.6, 3.4, 0.9, 'pillar'],
      [-4.5, -16.5, 1.4, 'rock'], [-5, 16.5, 1.3, 'rock'], [-10.5, -25, 1.5, 'rock'], [-3.5, 7, 1.1, 'rock'], [-1.05, 25.3, 1.3, 'rock'],
      [-33.65, -25.55, 0.5, 'tree'], [-38, -23.6, 0.5, 'tree'], [-42.9, -24.55, 0.5, 'tree'], [-33.35, 25.55, 0.5, 'tree'], [-38.5, 23.6, 0.5, 'tree'], [-44, 23.5, 0.5, 'tree'],
      [-1.2, -5.8, 0.5, 'tree'], [-8.3, 5.4, 0.45, 'tree'], [-1.5, -24.5, 0.5, 'tree'], [-12, 24.5, 0.5, 'tree'], [-14.5, -25.6, 0.5, 'tree'],
    ],
    bushes: [[-11.5, -22, 2.5], [-9.5, 17.5, 2.4], [-1, -18, 2.3], [-2.5, 18.5, 2.2], [-11.5, -3.5, 1.9], [-23, -23.5, 2.2], [-24, 23.5, 2.2]],
    props: [
      [-28, -2.6, 'crate'], [-29.35, -3.95, 'crate'], [-28.5, 3.2, 'barrel'], [-42, -10, 'pot'], [-42, 10, 'pot'],
      [-4.4, -7.2, 'crate'], [-4.2, 12.4, 'barrel'], [-6.35, -18.7, 'pot'], [-4.7, 3.3, 'crate'], [-9.8, -2, 'barrel'], [-5, -5, 'pot'],
    ],
    cratePoints: [[0, 0], [-10, -17.5], [0.5, -18.5], [-9.5, 21.5], [-3, -2.5], [-3.5, 11.5]],
    paths: [
      [[-50, 0], [-40, 0], [-37.5, -3.5], [-33, 0], [-18.5, 0], [-10, 1], [0, 0]],
      [[-33, 0], [-27, -6.5], [-21.5, -15.5], [-12, -17.5], [0, -18.5], [10, -17.5]],
      [[-33, 0], [-27, 6.5], [-21.5, 15.5], [-12, 18], [0, 17.5]],
      [[-10, -17.5], [-11, -7], [-10, 1]],
    ],
    plaza: [0, 0, 6.5],
    hazards: [[-3, -10, 2.0], [-12, 2.8, 2.0], [0, 10.5, 2.6]],
  },
  hemcheo: {
    name: 'Hẻm Chéo', theme: 'canyon', size: [94, 62], mode: 'nha',
    blurb: 'Hai căn cứ nằm chéo góc. Mỗi trụ phụ canh một cửa: đường vòng dài dẫn tới cửa này, đường tắt giữa sân dẫn tới cửa kia.',
    base: [-40.5, 22],
    spawns: [[-41.5, 23], [-40.5, 19.5], [-37.5, 23], [-43.5, 20], [-39.5, 25.5]],
    towers: [['main', -33, 9.5], ['sub', -22, 16.5], ['sub', -30, -4.5]],
    yard: [-47, -17.5, -10.5, 31],
    walls: [
      [-18.5, 8, 2, 8, 3.2, 'rampart'], [-18.5, 26, 2, 10, 3.2, 'rampart'], [-18.5, -6.5, 2, 6, 3.2, 'rampart'],
      [-41, -9.5, 12, 2, 3.0, 'rampart'], [-21.75, -9.5, 6.5, 2, 3.0, 'rampart'],
      [-4.5, 17.5, 1.8, 6, 2.4, 'ruin'], [-2, 26.5, 1.8, 5, 2.2, 'ruin'], [-10, -20, 7, 1.8, 2.4, 'ruin'], [-22, -22.5, 1.8, 6, 2.4, 'ruin'],
      [-8, -3, 2.6, 5, 3.4, 'block'], [-6.5, 6, 5, 1.8, 2.4, 'ruin'], [-4, -11.5, 1.8, 5, 2.4, 'ruin'], [-38, -21.5, 5, 1.6, 1.5, 'fence'],
    ],
    rounds: [
      [-16.6, -4, 0.9, 'pillar'], [-16.6, 4.5, 0.9, 'pillar'], [-3.7, 2.2, 0.95, 'pillar'],
      [-14, -13, 1.4, 'rock'], [-26.35, -22.85, 1.5, 'rock'], [-7.1, 27.7, 1.3, 'rock'], [-0.5, 14, 1.2, 'rock'], [-40.85, -24.85, 1.6, 'rock'], [-6, -27, 1.4, 'rock'],
      [-18, -27.5, 0.5, 'tree'], [-31.5, -26, 0.5, 'tree'], [-43.5, -15.5, 0.5, 'tree'], [-1.5, -19.5, 0.5, 'tree'],
      [-12.5, -28, 0.5, 'tree'], [-44.5, -28.5, 0.5, 'tree'], [-11.9, 29.55, 0.5, 'tree'],
    ],
    bushes: [[-8, 23, 2.5], [-2.5, 21.5, 2.2], [-16, -17, 2.5], [-4, -23, 2.3], [-11, -8, 2.0], [-32.5, -25, 2.4], [-12.5, 2.5, 1.9]],
    props: [
      [-26, 5.5, 'crate'], [-27.2, 6.6, 'crate'], [-38.5, 1, 'pot'], [-26, 25, 'barrel'], [-2.6, 15, 'crate'], [-13, -18, 'barrel'],
      [-5.35, 0.65, 'crate'], [-5.4, -7.7, 'barrel'], [-19, -17, 'pot'], [-1, 21.1, 'pot'],
    ],
    cratePoints: [[0, 0], [-9, 22], [-11, -16], [-3, -17], [-2.5, 8.5], [-23, -27.5]],
    paths: [
      [[-41, 22], [-33, 14], [-26, 5], [-18.5, 0.3], [-10, 1.5], [0, 0]],
      [[-33, 14], [-24, 20], [-18.5, 16.5], [-12, 22], [0, 22.5], [9, 20.5]],
      [[-33, 14], [-27, 2], [-30, -9.5], [-27, -21], [-14, -24], [0, -23.5], [9, -21.5]],
      [[-11, -16], [-10, 1.5]],
    ],
    plaza: [0, 0, 6],
    hazards: [[-8.5, -14.5, 2.3], [-8, 12.5, 2.2], [-18, -24, 2.3]],
  },
};

// A layout belongs to one pool: the base-assault layouts are built around their towers, the arenas serve every other mode.
export const MAP_ORDER = ['denrung', 'xuongcat', 'cangbang', 'mienglua'];
export const NHA_ORDER = ['luythep', 'hemcheo'];
export const mapsFor = (mode) => (mode === 'nha' ? NHA_ORDER : MAP_ORDER);
// The map choice a mode can keep: 'random' or a layout of its pool, otherwise the pool's first layout.
export const fitMap = (map, mode) => (map === 'random' || mapsFor(mode).includes(map) ? map : mapsFor(mode)[0]);

// A theme dresses any layout: it decides what the layout's hazard spots become and what stands where the layout says "tree".
// hazard kinds: lava (burns), ice (slippery), vent (a flame jet every few seconds, with a warning), mud (slows). null: no hazards.
export const THEMES = {
  jungle: { name: 'Rừng mưa', hazard: null, tree: 'tree', blurb: 'Rừng rậm xanh mướt, không có mối nguy.' },
  desert: { name: 'Sa mạc', hazard: 'vent', tree: 'cactus', blurb: 'Cát nóng, họng lửa phụt theo nhịp.' },
  ice: { name: 'Băng tuyết', hazard: 'ice', tree: 'pine', blurb: 'Mặt băng trơn: lao nhanh, khó dừng.' },
  lava: { name: 'Núi lửa', hazard: 'lava', tree: 'spire', blurb: 'Hồ dung nham đốt cháy ai bước vào.' },
  city: { name: 'Phố đổ nát', hazard: 'vent', tree: 'lamp', blurb: 'Đường nhựa nứt vỡ, ống ga phụt lửa.' },
  swamp: { name: 'Đầm đêm', hazard: 'mud', tree: 'tree', blurb: 'Trời tối, đom đóm bay, bùn lầy làm chậm bước.' },
  autumn: { name: 'Rừng thu', hazard: null, tree: 'tree', blurb: 'Lá vàng đỏ dưới nắng chiều, không có mối nguy.' },
  canyon: { name: 'Hẻm đá đỏ', hazard: 'mud', tree: 'cactus', blurb: 'Đá đỏ khô cằn, vũng cát lún làm chậm bước.' },
};
export const THEME_ORDER = ['jungle', 'desert', 'ice', 'lava', 'city', 'swamp', 'autumn', 'canyon'];

// Layout and theme for a match. 'random' picks from the seed, so every machine in a room builds the same arena.
export function pickArena(map, theme, seed, mode) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  const next = () => { h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0; return (h ^ (h >>> 15)) >>> 0; };
  const pool = mapsFor(mode), m = pool.includes(map) ? map : pool[next() % pool.length];
  const t = THEMES[theme] ? theme : (theme === 'random' || m !== map ? THEME_ORDER[next() % THEME_ORDER.length] : MAPS[m].theme);
  return { map: m, theme: t };
}

const CELL = 1;
const NAV_RADIUS = 1.25;

const rot = (p) => [-p[0], -p[1]];
const centred = (p) => Math.abs(p[0]) < 1e-6 && Math.abs(p[1]) < 1e-6;

export function compileMap(key, themeKey) {
  const src = MAPS[key], theme = THEMES[themeKey] ? themeKey : src.theme, T = THEMES[theme];
  const both = (list, flip) => list.concat(list.filter((it) => !centred(it)).map(flip));
  const walls = both(src.walls, (w) => [-w[0], -w[1], w[2], w[3], w[4], w[5]])
    .map((w, i) => ({ id: i, x: w[0], z: w[1], w: w[2], d: w[3], h: w[4], kind: w[5], x0: w[0] - w[2] / 2, x1: w[0] + w[2] / 2, z0: w[1] - w[3] / 2, z1: w[1] + w[3] / 2 }));
  const TREES = ['tree', 'cactus', 'pine', 'spire', 'lamp'];
  const rounds = both(src.rounds, (c) => [-c[0], -c[1], c[2], c[3]]).map((c, i) => ({ id: i, x: c[0], z: c[1], r: c[2], kind: TREES.includes(c[3]) ? T.tree : c[3] }));
  const bushes = both(src.bushes, (b) => [-b[0], -b[1], b[2]]).map((b, i) => ({ id: i, x: b[0], z: b[1], r: b[2] }));
  const props = both(src.props, (p) => [-p[0], -p[1], p[2]]).map((p, i) => ({ id: i, x: p[0], z: p[1], kind: p[2] }));
  const cratePoints = both(src.cratePoints, rot);
  const hazards = T.hazard ? both(src.hazards || [], (h) => [-h[0], -h[1], h[2]]).map((h, i) => ({ id: i, kind: T.hazard, x: h[0], z: h[1], r: h[2] })) : [];
  const paths = src.paths.concat(src.paths.map((line) => line.map(rot)));
  const [W, D] = src.size;
  const map = {
    key, name: src.name, theme, w: W, d: D, hw: W / 2, hd: D / 2,
    walls, rounds, bushes, props, cratePoints, paths, hazards, plaza: src.plaza,
    bases: [src.base, rot(src.base)],
    spawns: [src.spawns, src.spawns.map(rot)],
    towers: (src.towers || []).flatMap(([kind, x, z]) => [{ team: 0, kind, x, z }, { team: 1, kind, x: -x, z: -z }]).sort((a, b) => a.team - b.team),
    yards: src.yard ? [src.yard, [-src.yard[1], -src.yard[0], -src.yard[3], -src.yard[2]]] : [],
  };
  map.nav = buildNav(map);
  return map;
}

function buildNav(map) {
  const cols = Math.ceil(map.w / CELL), rows = Math.ceil(map.d / CELL);
  const blocked = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = -map.hw + (i + 0.5) * CELL, z = -map.hd + (j + 0.5) * CELL;
    blocked[j * cols + i] = solidAt(map, x, z, NAV_RADIUS) || map.hazards.some((h) => h.kind === 'lava' && Math.hypot(h.x - x, h.z - z) < h.r + 0.9) ? 1 : 0;
  }
  return { cols, rows, blocked, cell: CELL };
}

// True when a circle of radius r at (x, z) overlaps static geometry (walls, rounds, the map edge). Props are not included: they can be shot away.
export function solidAt(map, x, z, r) {
  if (x - r < -map.hw || x + r > map.hw || z - r < -map.hd || z + r > map.hd) return true;
  for (const w of map.walls) {
    const dx = Math.max(w.x0 - x, 0, x - w.x1), dz = Math.max(w.z0 - z, 0, z - w.z1);
    if (dx * dx + dz * dz < r * r) return true;
  }
  for (const c of map.rounds) {
    const dx = c.x - x, dz = c.z - z, rr = c.r + r;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}

// First hit of the segment (x0,z0)->(x1,z1), swept with radius r, against walls and rounds. Returns the fraction 0..1, or 2 when clear.
export function castStatic(map, x0, z0, x1, z1, r) {
  let best = 2;
  const dx = x1 - x0, dz = z1 - z0;
  for (const w of map.walls) {
    const t = segBox(x0, z0, dx, dz, w.x0 - r, w.z0 - r, w.x1 + r, w.z1 + r);
    if (t < best) best = t;
  }
  for (const c of map.rounds) {
    const t = segCircle(x0, z0, dx, dz, c.x, c.z, c.r + r);
    if (t < best) best = t;
  }
  return best;
}

export function segBox(x0, z0, dx, dz, bx0, bz0, bx1, bz1) {
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) { if (x0 < bx0 || x0 > bx1) return 2; }
  else {
    let a = (bx0 - x0) / dx, b = (bx1 - x0) / dx; if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return 2;
  }
  if (Math.abs(dz) < 1e-9) { if (z0 < bz0 || z0 > bz1) return 2; }
  else {
    let a = (bz0 - z0) / dz, b = (bz1 - z0) / dz; if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return 2;
  }
  return t0;
}

export function segCircle(x0, z0, dx, dz, cx, cz, r) {
  const fx = x0 - cx, fz = z0 - cz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return 2;
  const b = 2 * (fx * dx + fz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return 2;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : 2;
}

// Marks (or clears) the nav cells a round obstacle covers, for things that appear after the map is compiled, such as towers.
export function navBlock(map, x, z, r, on) {
  const nav = map.nav, reach = r + NAV_RADIUS;
  for (let j = 0; j < nav.rows; j++) for (let i = 0; i < nav.cols; i++) {
    const cx = -map.hw + (i + 0.5) * nav.cell, cz = -map.hd + (j + 0.5) * nav.cell;
    if (Math.hypot(cx - x, cz - z) < reach) nav.blocked[j * nav.cols + i] = on ? 1 : (solidAt(map, cx, cz, NAV_RADIUS) ? 1 : 0);
  }
}

export const losClear = (map, x0, z0, x1, z1, r = 0.2) => castStatic(map, x0, z0, x1, z1, r) > 1;

const cellOf = (nav, map, x, z) => {
  const i = Math.min(nav.cols - 1, Math.max(0, Math.floor((x + map.hw) / nav.cell)));
  const j = Math.min(nav.rows - 1, Math.max(0, Math.floor((z + map.hd) / nav.cell)));
  return j * nav.cols + i;
};

function nearestOpen(nav, idx) {
  if (!nav.blocked[idx]) return idx;
  const ci = idx % nav.cols, cj = (idx / nav.cols) | 0;
  for (let ring = 1; ring < 8; ring++) {
    for (let dj = -ring; dj <= ring; dj++) for (let di = -ring; di <= ring; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= nav.cols || j >= nav.rows) continue;
      if (!nav.blocked[j * nav.cols + i]) return j * nav.cols + i;
    }
  }
  return idx;
}

// A* on the 1 m grid. Returns world waypoints [[x, z], ...] from just after the start to the goal, already string-pulled with losClear.
export function findPath(map, x0, z0, x1, z1) {
  const nav = map.nav, cols = nav.cols, n = cols * nav.rows;
  const start = nearestOpen(nav, cellOf(nav, map, x0, z0)), goal = nearestOpen(nav, cellOf(nav, map, x1, z1));
  if (start === goal) return [[x1, z1]];
  const g = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const heap = [];
  const push = (idx, f) => { heap.push([f, idx]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; const s = heap[p]; heap[p] = heap[k]; heap[k] = s; k = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; const s = heap[m]; heap[m] = heap[k]; heap[k] = s; k = m; } }
    return top[1];
  };
  const gi = goal % cols, gj = (goal / cols) | 0;
  const h = (idx) => { const di = Math.abs((idx % cols) - gi), dj = Math.abs(((idx / cols) | 0) - gj); return Math.max(di, dj) + 0.414 * Math.min(di, dj); };
  g[start] = 0; push(start, h(start));
  let found = false;
  while (heap.length) {
    const cur = pop();
    if (cur === goal) { found = true; break; }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ci = cur % cols, cj = (cur / cols) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= cols || j >= nav.rows) continue;
      const nb = j * cols + i;
      if (nav.blocked[nb] || closed[nb]) continue;
      if (di && dj && (nav.blocked[cj * cols + i] || nav.blocked[j * cols + ci])) continue;
      const cost = g[cur] + (di && dj ? 1.414 : 1);
      if (cost < g[nb]) { g[nb] = cost; from[nb] = cur; push(nb, cost + h(nb)); }
    }
  }
  if (!found) return [[x1, z1]];
  const cells = [];
  for (let c = goal; c !== start && c !== -1; c = from[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => [-map.hw + ((c % cols) + 0.5) * nav.cell, -map.hd + (((c / cols) | 0) + 0.5) * nav.cell]);
  pts[pts.length - 1] = solidAt(map, x1, z1, NAV_RADIUS) ? pts[pts.length - 1] : [x1, z1];
  const out = [];
  let ax = x0, az = z0, k = 0;
  while (k < pts.length) {
    let far = k;
    for (let q = Math.min(pts.length - 1, k + 14); q > k; q--) if (losClear(map, ax, az, pts[q][0], pts[q][1], NAV_RADIUS - 0.1)) { far = q; break; }
    out.push(pts[far]); ax = pts[far][0]; az = pts[far][1]; k = far + 1;
  }
  return out;
}
