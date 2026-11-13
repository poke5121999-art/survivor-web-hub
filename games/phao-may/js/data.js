// Pháo Mây tables: units and their shots, items, maps, AI levels. Pure data plus the map shape functions.
(function () {
  'use strict';
  const PM = globalThis.PM;
  const { fbm, clamp, smoothstep } = PM;

  // Shot kinds are rows in PM.Sim.BEHAV. Distances in metres, speeds in m/s, delay in turn-order points.
  PM.UNITS = {
    coc: {
      name: 'Cóc Đồng', title: 'Cối hạng nặng', hp: 1100, weight: 100, fuel: 14, speed: 5, aimMin: 20, aimMax: 88, aimSpeed: 34, barrel: 2.0, radius: 1.25,
      blurb: 'Cóc máy bốn chân, vỏ đồng dày. Bắn cầu vồng, đạn nặng, hố to.',
      shots: [
        { id: 'coi', name: 'Đạn Cối', kind: 'shell', v: 50, dmg: 270, radius: 4.6, dig: 3.8, knock: 9, delay: 80, windK: 1, gravK: 1, size: 0.42, desc: 'Đạn nổ tiêu chuẩn, hố rộng.' },
        { id: 'nay', name: 'Đạn Nảy', kind: 'bounce', v: 48, bounces: 2, rest: 0.58, dmg: 215, radius: 3.9, dig: 3.0, knock: 8, delay: 95, windK: 1, gravK: 1, size: 0.4, desc: 'Nảy hai lần rồi nổ. Lách qua gờ đất.' },
        { id: 'muacoc', name: 'Mưa Cóc', kind: 'cluster', special: true, v: 50, count: 6, spread: 7, dmg: 60, radius: 2.2, dig: 1.2, knock: 3, delay: 130, windK: 1, gravK: 1, size: 0.5,
          child: { id: 'coccon', name: 'Cóc Con', kind: 'shell', dmg: 150, radius: 3.4, dig: 2.8, knock: 6, windK: 1, gravK: 1, size: 0.3 }, desc: 'Tới đỉnh thì tách thành sáu quả rải xuống.' }
      ]
    },
    chuon: {
      name: 'Chuồn Kim', title: 'Tàu lướt bắn tỉa', hp: 850, weight: 80, fuel: 22, speed: 7, aimMin: 0, aimMax: 72, aimSpeed: 40, barrel: 2.4, radius: 1.15,
      blurb: 'Tàu lướt cánh chuồn, nòng dài. Đạn nhanh, ít bị gió đẩy, hố nhỏ.',
      shots: [
        { id: 'kim', name: 'Mũi Kim', kind: 'shell', v: 64, dmg: 195, radius: 2.9, dig: 2.2, knock: 6, delay: 70, windK: 0.55, gravK: 0.85, direct: 1.3, size: 0.3, desc: 'Bay nhanh và căng. Trúng thẳng thì đau hơn.' },
        { id: 'cheba', name: 'Chẻ Ba', kind: 'split', v: 58, count: 3, spread: 6, fuse: 0.5, dmg: 0, radius: 0, dig: 0, delay: 90, windK: 0.7, gravK: 0.9, size: 0.34,
          child: { id: 'kimcon', name: 'Kim Con', kind: 'shell', dmg: 125, radius: 3.0, dig: 2.4, knock: 5, windK: 0.7, gravK: 0.9, size: 0.26 }, desc: 'Rời nòng nửa giây thì chẻ làm ba.' },
        { id: 'tiasam', name: 'Tia Sấm', kind: 'beam', special: true, v: 0, len: 70, dmg: 310, radius: 1.5, dig: 1.0, knock: 4, delay: 125, windK: 0, gravK: 0, size: 0.3, hold: 0.9, desc: 'Tia thẳng xuyên đất, không sợ gió.' }
      ]
    }
  };

  // mode 'with': used alongside the shot. mode 'shot': replaces the shot this turn.
  PM.ITEMS = {
    double: { name: 'Bắn Đôi', mode: 'with', delay: 60, desc: 'Bắn hai phát liền trong lượt này.' },
    boost: { name: 'Thuốc Nổ', mode: 'with', delay: 40, mult: 1.35, desc: 'Phát bắn lượt này mạnh hơn 35%.' },
    heal: { name: 'Hồi Máu', mode: 'with', delay: 50, frac: 0.35, desc: 'Hồi 35% máu cho mình.' },
    teamheal: { name: 'Hồi Đội', mode: 'with', delay: 70, frac: 0.2, desc: 'Hồi 20% máu cho cả đội.' },
    shield: { name: 'Khiên Mây', mode: 'with', delay: 45, absorb: 260, desc: 'Chặn 260 sát thương tới lượt sau của mình.' },
    calm: { name: 'Lặng Gió', mode: 'with', delay: 30, desc: 'Gió về 0 cho tới hết lượt này.' },
    tele: { name: 'Dịch Chuyển', mode: 'shot', delay: 60, v: 52, desc: 'Bắn một đốm sáng; mình hiện ra ở chỗ nó rơi.' }
  };

  PM.AI_LEVELS = {
    easy: { name: 'Dễ', angErr: 4.5, powErr: 9, whiff: 0.3, items: false, moves: false, special: 0.5, learn: 0.85 },
    medium: { name: 'Vừa', angErr: 1.8, powErr: 4, whiff: 0.08, items: true, moves: true, special: 1, learn: 0.7 },
    hard: { name: 'Khó', angErr: 0.35, powErr: 0.9, whiff: 0, items: true, moves: true, special: 1, learn: 0.5 }
  };

  PM.RULES = { dt: 1 / 120, turnTime: 25, chargeRate: 50, stepUp: 0.9, slide: 1.55, walkSlope: 1.45, fallSafe: 6, fallDmg: 20, skipDelay: 50, moveDelay: 1.5, specialPerTurn: 10, itemSlots: 3 };

  // Smooth curve through hand-placed [x, y] points (cubic Hermite, finite-difference tangents).
  PM.curve = function (pts) {
    const n = pts.length, m = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      m[i] = (b[1] - a[1]) / (b[0] - a[0]);
    }
    return function (x) {
      if (x <= pts[0][0]) return pts[0][1];
      if (x >= pts[n - 1][0]) return pts[n - 1][1];
      let i = 0;
      while (x > pts[i + 1][0]) i++;
      const h = pts[i + 1][0] - pts[i][0], t = (x - pts[i][0]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * pts[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * pts[i + 1][1] + (t3 - t2) * h * m[i + 1];
    };
  };

  const teaTop = PM.curve([[8, 34], [14, 45], [22, 52], [34, 54.5], [46, 52], [55, 57], [64, 61], [71, 57], [77, 48], [84, 43.5], [91, 44], [98, 50], [105, 57.5], [114, 58], [123, 52], [133, 50.5], [144, 53], [152, 50], [158, 43], [163, 33]]);
  const teaBelly = PM.curve([[8, 33], [14, 36], [24, 27], [36, 19], [47, 24], [58, 15], [68, 22], [78, 33], [86, 36.5], [94, 32], [104, 20], [114, 14], [124, 23], [136, 18], [147, 26], [156, 35], [163, 32]]);
  const teaHills = {
    id: 'doiche', name: 'Đồi Chè Sương', w: 168, h: 96, cell: 0.25, seaY: 6, g: 24, windMax: 9,
    blurb: 'Đảo chè bậc thang lúc bình minh. Rơi khỏi mép là xuống biển mây.',
    spawns: [[36, 22, 50, 60], [134, 148, 118, 108]],
    tread: 1.5,
    top(x) {
      let h = teaTop(x) + 1.6 * (fbm(x * 0.06, 3.3, 4107, 3) - 0.5);
      const k = h / this.tread, f = k - Math.floor(k);
      const stepped = (Math.floor(k) + smoothstep(0.5, 1, f)) * this.tread;
      return h + (stepped - h) * 0.72;
    },
    bottom(x) {
      const fangs = 6.5 * Math.pow(fbm(x * 0.13, 9.1, 977, 3), 1.6) + 2.2 * Math.abs(Math.sin(x * 0.37 + 1.3)) * fbm(x * 0.05, 1.7, 31, 2);
      return teaBelly(x) - fangs + 3;
    },
    sd(x, y) {
      let d = 9;
      if (x > 8 && x < 163) {
        const top = this.top(x), bot = this.bottom(x);
        d = Math.max((y - top) * 0.8, (bot - y) * 0.75, (8.6 - x) * 0.6, (x - 162.4) * 0.6);
        d += (fbm(x * 0.3, y * 0.3, 51, 2) - 0.5) * 0.9 * smoothstep(0.6, 3, top - y);
      }
      const rx = (x - 85) / 9, ry = (y - 69.5) / (y > 69.5 ? 2.2 : 4.6);
      const rock = (Math.sqrt(rx * rx + ry * ry) - 1) * 3 + (fbm(x * 0.4, y * 0.4, 7, 2) - 0.5) * 1.4;
      return Math.min(d, rock);
    }
  };

  PM.MAPS = { doiche: teaHills };
  PM.MAP_ORDER = ['doiche'];
  PM.UNIT_ORDER = ['coc', 'chuon'];
  PM.clampPower = (p) => clamp(p, 3, 100);
})();
