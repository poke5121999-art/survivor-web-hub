// More maps. Each row carries its own sky theme and terrain colours, so a map is one table entry.
(function () {
  'use strict';
  const PM = globalThis.PM;
  const { fbm } = PM, { sdEllipse, sdCapsule, sdBox, smin } = PM.sdf;

  // Vịnh Đá Vôi: limestone towers standing in a bay. Nothing connects them, the middle sandbar floods as the
  // tide comes in, and the west tower has a window blown through it.
  PM.MAPS.vinhda = {
    id: 'vinhda', name: 'Vịnh Đá Vôi', w: 168, h: 96, cell: 0.25, seaY: 18, g: 24, windMax: 11,
    blurb: 'Các tháp đá vôi đứng rời nhau giữa vịnh. Nước dâng sau mỗi lượt, bãi cát giữa vịnh ngập trước.',
    hazard: { kind: 'tide', perTurn: 0.6, max: 36 },
    spawns: [[22, 37, 60, 80], [147, 131, 108, 91]],
    trees: [15, 30, 43, 125, 139, 154],
    deco: { hedges: false },
    sd(x, y) {
      const wob = (fbm(x * 0.3, y * 0.3, 77, 3) - 0.5) * 1.6, fine = (fbm(x * 0.9, y * 0.9, 12, 2) - 0.5) * 0.5;
      let d = sdBox(x, y, 28, 20, 19, 24, 6);
      d = smin(d, sdEllipse(x, y, 19, 44, 9, 5), 2);
      let towerA = sdBox(x, y, 59.5, 30, 6.5, 37, 4.5);
      towerA = Math.max(towerA, -sdEllipse(x, y, 61.5, 50, 6.5, 3.6));
      d = Math.min(d, towerA);
      d = Math.min(d, sdEllipse(x, y, 85, 21, 13.5, 11));
      d = Math.min(d, smin(sdBox(x, y, 108.5, 27, 5.5, 33, 4), sdCapsule(x, y, 99, 47.5, 104, 48, 1.6), 1));
      let east = sdBox(x, y, 140, 22, 19, 26, 6);
      east = smin(east, sdEllipse(x, y, 151, 48, 8, 5), 2);
      east = smin(east, sdBox(x, y, 134.5, 53.5, 1.5, 6.5, 0.8), 0.8);
      east = smin(east, sdCapsule(x, y, 124, 59, 136, 60.5, 1.6), 0.8);
      d = Math.min(d, east);
      return d * 0.9 + wob + fine;
    },
    look: { topsoil: [0.75, 0.7, 0.6], clay: [1.45, 1.38, 1.2], rock: [1.7, 1.72, 1.7], grass: [0.9, 1.1, 0.8] },
    theme: {
      zenith: [0.08, 0.30, 0.70], mid: [0.36, 0.62, 0.86], horizon: [0.82, 0.92, 0.98], ground: [0.30, 0.55, 0.62], sunDir: [0.42, 0.28, -0.86], sunCol: [1.5, 1.35, 1.1],
      cloudLit: [1.5, 1.5, 1.45], cloudDark: [0.45, 0.55, 0.7], cover: 0.5,
      keyDir: [0.5, 0.7, 0.5], keyCol: [1.0, 0.96, 0.88], keyInt: 3.8, rimInt: 1.2, hemiInt: 0.7, bounce: [0.3, 0.5, 0.5],
      seaLit: [0.55, 1.05, 1.05], seaShade: [0.04, 0.26, 0.38], fog: [0.62, 0.8, 0.9], fogStart: 150, fogDen: 0.0013, mist: 0.3, exposure: 0.95, bloom: 0.35, rays: 0.5, vol: 0.0025, volCol: [1.2, 1.15, 1.0]
    }
  };

  // Lò Rèn Núi Lửa: a volcano with a crater in the middle, lava tubes through both flanks and two obsidian
  // shelves hanging over the slopes. After every shot a burning rock drops somewhere on the map.
  const lavaTop = PM.curve([[4, 20], [18, 30], [38, 40], [56, 55], [68, 68], [75, 71], [80, 61], [88, 60.5], [93, 71], [99, 67], [112, 52], [128, 43], [146, 37], [160, 29], [166, 20]]);
  PM.MAPS.lolua = {
    id: 'lolua', name: 'Lò Rèn Núi Lửa', w: 168, h: 96, cell: 0.25, seaY: 15, g: 24, windMax: 7,
    blurb: 'Núi lửa có miệng ở giữa và hai hầm dung nham xuyên sườn. Sau mỗi phát bắn có một tảng đá lửa rơi xuống đâu đó.',
    hazard: { kind: 'rocks', def: { id: 'dalua', name: 'Đá Lửa', kind: 'shell', dmg: 130, radius: 3.6, dig: 2.6, knock: 6, windK: 0.3, gravK: 1, size: 0.6 } },
    spawns: [[24, 40, 58, 72], [146, 130, 110, 96]],
    trees: [],
    deco: { hedges: false, tufts: false, spikes: { color: 0x2a2630, emissive: 0xff5a14, glow: 0.35 } },
    sd(x, y) {
      if (x < 3 || x > 165) return 9;
      const wob = (fbm(x * 0.28, y * 0.28, 303, 3) - 0.5) * 1.8;
      let d = (y - lavaTop(x) - 1.6 * (fbm(x * 0.11, 2.2, 91, 3) - 0.5)) * 0.8;
      d = Math.max(d, (3.5 - x) * 0.7, (x - 164.5) * 0.7);
      d = Math.max(d, -(sdEllipse(x, y, 50, 39, 10, 3.4) + wob * 0.4));
      d = Math.max(d, -(sdEllipse(x, y, 119, 38, 9.5, 3.2) + wob * 0.4));
      d = Math.min(d, sdCapsule(x, y, 28, 57, 41, 59.5, 1.5) + wob * 0.5);
      d = Math.min(d, sdCapsule(x, y, 127, 61, 140, 59, 1.5) + wob * 0.5);
      return d + wob * 0.35;
    },
    look: { topsoil: [0.5, 0.42, 0.42], clay: [1.5, 0.85, 0.7], rock: [0.55, 0.5, 0.55], grass: [0.5, 0.42, 0.4], grey: 1 },
    theme: {
      zenith: [0.03, 0.03, 0.08], mid: [0.22, 0.08, 0.1], horizon: [0.9, 0.3, 0.1], ground: [0.5, 0.12, 0.04], sunDir: [-0.2, 0.05, -0.98], sunCol: [1.6, 0.5, 0.18],
      cloudLit: [1.2, 0.45, 0.2], cloudDark: [0.1, 0.07, 0.1], cover: 0.36,
      keyDir: [-0.45, 0.6, 0.6], keyCol: [1.0, 0.72, 0.56], keyInt: 2.6, rimInt: 2.2, hemiInt: 0.5, bounce: [0.9, 0.3, 0.1],
      seaLit: [5.0, 1.5, 0.25], seaShade: [0.9, 0.12, 0.02], fog: [0.42, 0.14, 0.08], fogStart: 150, fogDen: 0.0018, mist: 0.5, exposure: 1.0, bloom: 0.6, rays: 0.6, vol: 0.0035, volCol: [1.3, 0.5, 0.25]
    }
  };

  // Đỉnh Băng Gió: a floating iceberg with two peaks, a thin ice span and a frozen cornice. Ice is slippery and
  // the wind is the strongest of any map.
  const iceTop = PM.curve([[8, 30], [17, 46], [26, 62], [34, 51], [46, 45], [60, 48], [71, 40], [84, 36], [97, 42], [108, 54], [118, 66], [127, 53], [141, 46], [154, 50], [162, 38]]);
  const iceBelly = PM.curve([[8, 29], [18, 22], [30, 13], [46, 20], [62, 25], [84, 29], [100, 20], [112, 11], [126, 17], [142, 22], [154, 28], [162, 36]]);
  PM.MAPS.bang = {
    id: 'bang', name: 'Đỉnh Băng Gió', w: 168, h: 96, cell: 0.25, seaY: 5, g: 24, windMax: 15, slide: 0.95,
    blurb: 'Núi băng hai đỉnh. Nền trơn, dốc vừa cũng trượt; gió mạnh nhất trong các bản đồ.',
    spawns: [[48, 36, 62, 20], [140, 152, 126, 100]],
    trees: [],
    deco: { hedges: false, tufts: false, spikes: { color: 0xbfe6ff, emissive: 0x3aa0ff, glow: 0.25 } },
    sd(x, y) {
      let d = 9;
      const wob = (fbm(x * 0.3, y * 0.3, 808, 3) - 0.5) * 1.5;
      if (x > 8 && x < 162) {
        const fang = 7 * Math.pow(fbm(x * 0.15, 4.4, 55, 3), 1.5);
        d = Math.max((y - iceTop(x)) * 0.8, (iceBelly(x) - fang + 3 - y) * 0.75, (8.6 - x) * 0.6, (x - 161.4) * 0.6);
      }
      d = Math.min(d, sdCapsule(x, y, 36, 57.5, 62, 55.5, 1.25) + wob * 0.4);
      d = Math.min(d, sdCapsule(x, y, 118, 66, 103, 70.5, 1.6) + wob * 0.4);
      d = Math.min(d, sdEllipse(x, y, 82, 62, 5.5, 2.4) * 1.3 + wob);
      return d + wob * 0.3;
    },
    look: { topsoil: [3.4, 4.2, 5.0], clay: [1.6, 2.8, 4.2], rock: [1.5, 2.2, 3.0], grass: [3.6, 3.8, 4.1], grey: 1 },
    theme: {
      zenith: [0.05, 0.12, 0.34], mid: [0.3, 0.46, 0.7], horizon: [0.8, 0.86, 0.95], ground: [0.5, 0.6, 0.75], sunDir: [0.3, 0.09, -0.95], sunCol: [1.3, 1.25, 1.2],
      cloudLit: [1.5, 1.55, 1.65], cloudDark: [0.36, 0.44, 0.62], cover: 0.34,
      keyDir: [0.5, 0.62, 0.6], keyCol: [0.92, 0.96, 1.0], keyInt: 3.4, rimInt: 1.6, hemiInt: 0.8, bounce: [0.5, 0.6, 0.8],
      seaLit: [1.35, 1.45, 1.6], seaShade: [0.3, 0.38, 0.58], fog: [0.72, 0.8, 0.92], fogStart: 150, fogDen: 0.002, mist: 0.45, exposure: 0.92, bloom: 0.4, rays: 0.7, vol: 0.004, volCol: [1.0, 1.1, 1.3]
    }
  };
  PM.MAP_ORDER.push('vinhda', 'lolua', 'bang');

})();
