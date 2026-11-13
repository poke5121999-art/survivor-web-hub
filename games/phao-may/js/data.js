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

  const teaHills = {
    id: 'doiche', name: 'Đồi Chè Sương', w: 168, h: 96, cell: 0.25, seaY: 6, g: 24, windMax: 9,
    blurb: 'Đảo chè bậc thang lúc bình minh. Rơi khỏi mép là xuống biển mây.',
    spawns: [[38, 24, 52, 30], [130, 144, 116, 138]],
    top(x) {
      const s = 4107;
      let h = 47 + 7.5 * Math.sin(x * 0.043 + 0.6) + 4.2 * Math.sin(x * 0.097 + 2.1) + 5 * (fbm(x * 0.045, 3.3, s, 3) - 0.5);
      h -= 13 * Math.exp(-Math.pow((x - 86) / 9, 2));
      const tread = 2.4, k = h / tread, f = k - Math.floor(k);
      const stepped = (Math.floor(k) + smoothstep(0.55, 1, f)) * tread;
      h = h + (stepped - h) * 0.6;
      const edge = smoothstep(10, 22, x) * smoothstep(158, 146, x);
      return h - (1 - edge) * 14;
    },
    bottom(x) {
      const s = 977, u = (x - 84) / 73;
      if (Math.abs(u) >= 1) return 1e3;
      const belly = 31 * Math.pow(1 - u * u, 0.62);
      const fangs = 7 * Math.pow(fbm(x * 0.16, 9.1, s, 3), 2) + 3 * Math.abs(Math.sin(x * 0.31));
      return 45 - belly - fangs + 8 * Math.exp(-Math.pow((x - 86) / 10, 2));
    },
    sd(x, y) {
      const top = this.top(x), bot = this.bottom(x);
      let d = Math.max((y - top) * 0.8, (bot - y) * 0.7);
      d += (fbm(x * 0.35, y * 0.35, 51, 2) - 0.5) * 0.5 * smoothstep(0.2, 2.5, top - y);
      const rx = (x - 86) / 8.5, ry = (y - 66) / 3.4;
      const rock = (Math.sqrt(rx * rx + ry * ry) - 1) * 3.2 + (fbm(x * 0.4, y * 0.4, 7, 2) - 0.5) * 1.2;
      return Math.min(d, rock);
    }
  };

  PM.MAPS = { doiche: teaHills };
  PM.MAP_ORDER = ['doiche'];
  PM.UNIT_ORDER = ['coc', 'chuon'];
  PM.clampPower = (p) => clamp(p, 3, 100);
})();
