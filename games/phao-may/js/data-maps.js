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
  PM.MAP_ORDER.push('vinhda');
})();
