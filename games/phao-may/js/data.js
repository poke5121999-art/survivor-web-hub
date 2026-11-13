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
        { id: 'coi', name: 'Đạn Cối', kind: 'shell', v: 50, dmg: 285, radius: 4.6, dig: 3.8, knock: 9, delay: 80, windK: 1, gravK: 1, size: 0.42, desc: 'Đạn nổ tiêu chuẩn, hố rộng.' },
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

  PM.UNITS.tegiac = {
    name: 'Tê Giác Than', title: 'Xe phá hạng nặng', hp: 1250, weight: 120, fuel: 10, speed: 4, aimMin: 5, aimMax: 70, aimSpeed: 30, barrel: 2.3, radius: 1.35,
    blurb: 'Xe xích đốt than, giáp dày nhất, đi chậm nhất. Đạn to, hố sâu, lượt tới muộn.',
    shots: [
      { id: 'pha', name: 'Đạn Phá', kind: 'shell', v: 52, dmg: 285, radius: 5.4, dig: 4.6, knock: 11, delay: 110, windK: 0.9, gravK: 1, size: 0.52, desc: 'Quả đạn to nhất. Hố rộng gần gấp rưỡi đạn cối.' },
      { id: 'khoan', name: 'Mũi Khoan', kind: 'drill', v: 54, depth: 9, drillSpeed: 15, dmg: 290, radius: 3.8, dig: 3.2, knock: 8, delay: 100, windK: 0.8, gravK: 1, size: 0.36, desc: 'Chui qua 9 m đất rồi mới nổ. Trị kẻ nấp sau gò.' },
      { id: 'diachan', name: 'Địa Chấn', kind: 'quake', special: true, v: 52, count: 3, gap: 4.2, dmg: 220, radius: 4.4, dig: 3.4, knock: 9, delay: 140, windK: 0.9, gravK: 1, size: 0.56,
        child: { id: 'duchan', name: 'Dư Chấn', kind: 'shell', dmg: 150, radius: 3.6, dig: 2.6, knock: 8, windK: 0, gravK: 1, size: 0.3 }, desc: 'Nổ rồi nứt đất lan ra hai phía, mỗi bên ba nhịp.' }
    ]
  };
  PM.UNITS.oc = {
    name: 'Ốc Lăn', title: 'Pháo bi lăn', hp: 1000, weight: 90, fuel: 12, speed: 4.5, aimMin: 10, aimMax: 80, aimSpeed: 36, barrel: 1.8, radius: 1.15,
    blurb: 'Ốc sên bọc thép nhả bi. Bi rơi xuống rồi lăn theo dốc tìm mục tiêu.',
    shots: [
      { id: 'bilan', name: 'Bi Lăn', kind: 'roller', v: 51, roll: 2.6, rollSpeed: 11, bounces: 1, dmg: 250, radius: 3.6, dig: 2.8, knock: 7, delay: 80, windK: 0.9, gravK: 1, size: 0.44, desc: 'Chạm đất thì lăn tiếp gần ba giây, gặp pháo là nổ.' },
      { id: 'bidoi', name: 'Bi Tẽ', kind: 'forkroll', v: 51, count: 2, dmg: 90, radius: 2.6, dig: 1.6, knock: 4, delay: 95, windK: 0.9, gravK: 1, size: 0.5,
        child: { id: 'bicon', name: 'Bi Con', kind: 'roller', roll: 2.2, rollSpeed: 10, bounces: 1, dmg: 150, radius: 3.0, dig: 2.2, knock: 5, windK: 0, gravK: 1, size: 0.32 }, desc: 'Nổ ra hai bi con lăn về hai phía.' },
      { id: 'bayoc', name: 'Bầy Ốc', kind: 'forkroll', special: true, v: 51, count: 6, dmg: 120, radius: 3.0, dig: 2.0, knock: 5, delay: 130, windK: 0.9, gravK: 1, size: 0.56,
        child: { id: 'ocon', name: 'Ốc Con', kind: 'roller', roll: 3.0, rollSpeed: 9, bounces: 1, dmg: 135, radius: 2.8, dig: 2.0, knock: 5, windK: 0, gravK: 1, size: 0.3 }, desc: 'Sáu ốc con toả ra hai phía, lăn lâu hơn.' }
    ]
  };

  PM.UNITS.sua = {
    name: 'Sứa Trời', title: 'Khí cầu tiếp sức', hp: 820, weight: 85, fuel: 26, speed: 6, aimMin: 5, aimMax: 85, aimSpeed: 40, barrel: 1.7, radius: 1.2,
    blurb: 'Khí cầu sứa bay lơ lửng, đi xa nhất, máu mỏng nhất. Đẩy đối thủ khỏi mép đảo và hồi máu cho đội.',
    shots: [
      { id: 'bongnuoc', name: 'Bóng Nước', kind: 'shell', v: 53, dmg: 170, radius: 4.6, dig: 1.2, knock: 12, delay: 75, windK: 1.2, gravK: 1, size: 0.5, desc: 'Ít sát thương, hất văng mạnh nhất game.' },
      { id: 'donghoi', name: 'Dòng Hồi', kind: 'shell', v: 53, dmg: 0, heal: 240, selfHeal: 0.4, radius: 5, dig: 0, knock: 0, delay: 110, windK: 1, gravK: 1, size: 0.45, desc: 'Hồi tới 240 máu cho đồng đội trong vùng nổ. Tự hồi cho mình chỉ được 40%.' },
      { id: 'doicho', name: 'Đổi Chỗ', kind: 'swap', special: true, v: 58, dmg: 140, radius: 2.6, dig: 1.4, knock: 0, delay: 100, windK: 0.5, gravK: 0.9, size: 0.4, desc: 'Trúng ai thì đổi chỗ với người đó.' }
    ]
  };
  PM.UNITS.rua = {
    name: 'Rùa Chuông', title: 'Pháo đài chuông đồng', hp: 1500, weight: 115, fuel: 9, speed: 3.5, aimMin: 15, aimMax: 75, aimSpeed: 30, barrel: 1.7, radius: 1.35,
    blurb: 'Rùa cõng chuông đồng, máu dày nhất. Sóng chuông đẩy lùi, mai rùa che cho cả đội.',
    shots: [
      { id: 'songchuong', name: 'Sóng Chuông', kind: 'shell', v: 53, dmg: 205, radius: 5.6, dig: 2.0, knock: 11, delay: 85, windK: 0.8, gravK: 1, size: 0.5, desc: 'Vùng nổ rộng, hố nông, đẩy lùi mạnh.' },
      { id: 'mairua', name: 'Mai Rùa', kind: 'guard', v: 0, absorb: 380, reach: 9, dmg: 0, radius: 0, dig: 0, delay: 40, windK: 0, gravK: 0, size: 0.3, desc: 'Không bắn. Khiên 380 cho mình, nửa số đó cho đồng đội đứng gần.' },
      { id: 'hoichuong', name: 'Hồi Chuông Lớn', kind: 'quake', special: true, v: 53, count: 2, gap: 5.2, dmg: 250, radius: 5.2, dig: 2.6, knock: 11, delay: 140, windK: 0.8, gravK: 1, size: 0.6,
        child: { id: 'vongchuong', name: 'Vọng Chuông', kind: 'shell', dmg: 170, radius: 4.4, dig: 2.2, knock: 9, windK: 0, gravK: 1, size: 0.3 }, desc: 'Nổ rồi dội thêm hai nhịp về mỗi phía.' }
    ]
  };

  PM.UNITS.nhim = {
    name: 'Nhím Gai', title: 'Pháo chùm tầm gần', hp: 980, weight: 95, fuel: 14, speed: 5, aimMin: 0, aimMax: 75, aimSpeed: 38, barrel: 1.9, radius: 1.2,
    blurb: 'Nhím thép bắn gai thành loạt. Càng gần càng đau, ở xa thì gai tản mất.',
    shots: [
      { id: 'loatgai', name: 'Loạt Gai', kind: 'spread', v: 60, count: 5, spread: 3.2, dmg: 0, radius: 0, dig: 0, delay: 80, windK: 0.6, gravK: 0.9, size: 0.2,
        child: { id: 'gai', name: 'Gai', kind: 'shell', dmg: 78, radius: 2.1, dig: 1.3, knock: 3, windK: 0.6, gravK: 0.9, size: 0.2 }, desc: 'Năm gai xoè quạt. Trúng đủ cả năm là đau nhất game.' },
      { id: 'gaighim', name: 'Gai Ghim', kind: 'drill', v: 60, depth: 4.5, drillSpeed: 20, dmg: 240, radius: 3.0, dig: 2.2, knock: 6, delay: 90, windK: 0.6, gravK: 0.9, size: 0.3, desc: 'Một gai lớn xuyên 4,5 m đất rồi nổ.' },
      { id: 'baogai', name: 'Bão Gai', kind: 'cluster', special: true, v: 54, count: 10, spread: 4.5, dmg: 50, radius: 2, dig: 1, knock: 3, delay: 130, windK: 0.8, gravK: 1, size: 0.5,
        child: { id: 'gaicon', name: 'Gai Con', kind: 'shell', dmg: 95, radius: 2.5, dig: 1.6, knock: 4, windK: 0.8, gravK: 1, size: 0.22 }, desc: 'Tới đỉnh thì vỡ thành mười gai phủ một vùng rộng.' }
    ]
  };
  PM.UNITS.co = {
    name: 'Cò Lửa', title: 'Pháo dầu cháy nền', hp: 880, weight: 85, fuel: 18, speed: 6, aimMin: 25, aimMax: 88, aimSpeed: 38, barrel: 2.3, radius: 1.2,
    blurb: 'Cò chân dài phun dầu. Lửa ở lại trên nền vài vòng, ai đứng trong đó đầu lượt thì bỏng.',
    shots: [
      { id: 'dandau', name: 'Đạn Dầu', kind: 'shell', v: 54, dmg: 150, radius: 3.4, dig: 1.4, knock: 4, delay: 80, windK: 1, gravK: 1, size: 0.4, burn: { turns: 3, dmg: 75, r: 3.4 }, desc: 'Nổ nhẹ, để lại đám cháy ba vòng, 75 máu mỗi đầu lượt.' },
      { id: 'tronong', name: 'Tro Nóng', kind: 'cluster', v: 54, count: 3, spread: 7, dmg: 40, radius: 2, dig: 0.8, knock: 2, delay: 95, windK: 1, gravK: 1, size: 0.42,
        child: { id: 'tro', name: 'Tro', kind: 'shell', dmg: 85, radius: 2.8, dig: 1.0, knock: 3, windK: 1, gravK: 1, size: 0.26, burn: { turns: 2, dmg: 50, r: 2.6 } }, desc: 'Tách ba, mỗi quả để lại một đám cháy nhỏ.' },
      { id: 'mualua', name: 'Mưa Lửa', kind: 'cluster', special: true, v: 54, count: 7, spread: 6, dmg: 50, radius: 2.2, dig: 1, knock: 3, delay: 135, windK: 1, gravK: 1, size: 0.5,
        child: { id: 'giotlua', name: 'Giọt Lửa', kind: 'shell', dmg: 100, radius: 3.0, dig: 1.2, knock: 3, windK: 1, gravK: 1, size: 0.26, burn: { turns: 3, dmg: 60, r: 3.0 } }, desc: 'Bảy giọt lửa phủ kín một dải đất.' }
    ]
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
    easy: { name: 'Dễ', angErr: 4.5, powErr: 9, whiff: 0.3, items: false, moves: true, special: 0.5, learn: 0.85 },
    medium: { name: 'Vừa', angErr: 1.8, powErr: 4, whiff: 0.08, items: true, moves: true, special: 1, learn: 0.7 },
    hard: { name: 'Khó', angErr: 0.35, powErr: 0.9, whiff: 0, items: true, moves: true, special: 1, learn: 0.5 }
  };

  PM.RULES = { vScale: 1.16, dt: 1 / 120, turnTime: 25, chargeRate: 50, stepUp: 0.9, slide: 1.55, walkSlope: 1.45, fallSafe: 6, fallDmg: 20, skipDelay: 50, moveDelay: 1.5, specialPerTurn: 10, itemSlots: 3 };

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

  // Signed-distance pieces for hand-built maps. Negative is inside.
  const sdEllipse = (x, y, cx, cy, rx, ry) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
  const sdCapsule = (x, y, ax, ay, bx, by, r) => { const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay, t = clamp((px * dx + py * dy) / (dx * dx + dy * dy), 0, 1); return Math.hypot(px - dx * t, py - dy * t) - r; };
  const sdBox = (x, y, cx, cy, hx, hy, r) => { const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
  const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
  PM.sdf = { sdEllipse, sdCapsule, sdBox, smin };

  // Đồi Chè Sương: a western cliff with a rock shelf hanging over a lower terrace, a basin under a stone arch,
  // tea terraces climbing east to a hill with a standing stone, and an islet held by a thin land bridge.
  const teaTop = PM.curve([[8, 40], [13, 54], [18, 61], [30, 62.5], [41, 62], [45, 56], [48, 49], [58, 48], [66, 47.5], [72, 43], [80, 40.5], [90, 41], [97, 45], [104, 50], [112, 55], [120, 58], [133, 58.5], [140, 56], [146, 51.5], [151, 50.5], [158, 52], [162, 46], [165, 36]]);
  const teaBelly = PM.curve([[8, 38], [14, 34], [24, 22], [34, 15], [44, 20], [54, 30], [62, 34], [72, 31], [82, 30], [92, 33], [100, 28], [110, 21], [122, 24], [134, 17], [144, 30], [147, 44], [151, 45], [154, 37], [158, 38], [165, 35]]);
  const teaHills = {
    id: 'doiche', name: 'Đồi Chè Sương', w: 168, h: 96, cell: 0.25, seaY: 6, g: 24, windMax: 9,
    blurb: 'Vách đá phía tây có mái đá che, lòng chảo dưới vòm đá, đồi chè bậc thang phía đông. Rơi khỏi mép là xuống biển mây.',
    spawns: [[30, 20, 54, 64], [136, 146, 110, 157]],
    trees: [16, 25, 36, 62, 106, 124, 131, 141, 160],
    tread: 1.5,
    top(x) {
      let h = teaTop(x) + 1.3 * (fbm(x * 0.07, 3.3, 4107, 3) - 0.5);
      const k = h / this.tread, f = k - Math.floor(k);
      const stepped = (Math.floor(k) + smoothstep(0.5, 1, f)) * this.tread;
      return h + (stepped - h) * 0.75 * smoothstep(94, 102, x) * (1 - smoothstep(142, 150, x));
    },
    bottom(x) {
      const fangs = 6.5 * Math.pow(fbm(x * 0.13, 9.1, 977, 3), 1.6) + 2.2 * Math.abs(Math.sin(x * 0.37 + 1.3)) * fbm(x * 0.05, 1.7, 31, 2);
      return teaBelly(x) - fangs * (1 - smoothstep(143, 147, x) * (1 - smoothstep(151, 155, x))) + 3;
    },
    sd(x, y) {
      let d = 9;
      if (x > 8 && x < 165) {
        const top = this.top(x), bot = this.bottom(x);
        d = Math.max((y - top) * 0.8, (bot - y) * 0.75, (8.6 - x) * 0.6, (x - 164.4) * 0.6);
        d += (fbm(x * 0.3, y * 0.3, 51, 2) - 0.5) * 0.9 * smoothstep(0.6, 3, top - y);
      }
      const wob = (fbm(x * 0.33, y * 0.33, 7, 2) - 0.5) * 1.3;
      d = smin(d, sdCapsule(x, y, 40, 60.6, 58.5, 61.6, 1.7) + wob * 0.6, 1.2);
      d = Math.max(d, -(sdEllipse(x, y, 44.5, 52.2, 5.2, 3.4) + wob * 0.5));
      const ring = Math.abs(Math.hypot((x - 86) / 1.22, y - 45) - 14.5) - 1.45;
      d = smin(d, Math.max(ring, 45.5 - y) + wob * 0.5, 0.8);
      d = smin(d, sdBox(x, y, 118.5, 62, 1.7, 5.5, 0.9) + wob * 0.5, 0.9);
      const rock = sdEllipse(x, y, 90, 83, 7.5, y > 83 ? 2 : 4.2) * 1.4 + wob;
      return Math.min(d, rock);
    }
  };

  // Campaign ladder. allies and foes are unit kinds; hp scales the enemy team; bonus is paid on the first clear.
  PM.CAMPAIGN = [
    { name: 'Buổi tập đầu', blurb: 'Một Cóc Đồng non tay. Tập chỉnh góc và nạp lực.', map: 'doiche', ai: 'easy', allies: [], foes: ['coc'], hp: 0.8, bonus: 60 },
    { name: 'Kim trong sương', blurb: 'Chuồn Kim bắn căng và nhanh. Đừng đứng chỗ trống.', map: 'doiche', ai: 'easy', allies: [], foes: ['chuon'], hp: 1, bonus: 80 },
    { name: 'Hai chọi hai', blurb: 'Có đồng đội Ốc Lăn. Để ý thứ tự lượt.', map: 'pho', ai: 'easy', allies: ['oc'], foes: ['coc', 'chuon'], hp: 1, bonus: 100 },
    { name: 'Bi lăn dốc', blurb: 'Ốc Lăn thả bi xuống lòng chảo. Giữ chỗ cao.', map: 'bang', ai: 'medium', allies: [], foes: ['oc'], hp: 1, bonus: 120 },
    { name: 'Giáp than', blurb: 'Tê Giác Than máu dày, đạn to, đi chậm.', map: 'vinhda', ai: 'medium', allies: [], foes: ['tegiac'], hp: 1.15, bonus: 140 },
    { name: 'Đội hình ba', blurb: 'Ba đấu ba. Hồi Đội và Khiên Mây đáng mang theo.', map: 'bang', ai: 'medium', allies: ['chuon', 'tegiac'], foes: ['coc', 'oc', 'chuon'], hp: 1, bonus: 170 },
    { name: 'Một chọi hai', blurb: 'Hai đối thủ máu mỏng. Khoét đất cho chúng rơi.', map: 'hoangmac', ai: 'medium', allies: [], foes: ['coc', 'chuon'], hp: 0.7, bonus: 200 },
    { name: 'Xạ thủ', blurb: 'Chuồn Kim mức Khó hiếm khi trượt. Dùng vòm đá mà nấp.', map: 'lolua', ai: 'hard', allies: [], foes: ['chuon'], hp: 1, bonus: 230 },
    { name: 'Bốn phương', blurb: 'Bốn đấu bốn, máy mức Khó.', map: 'hoangmac', ai: 'hard', allies: ['oc', 'chuon', 'tegiac'], foes: ['coc', 'oc', 'chuon', 'tegiac'], hp: 1, bonus: 270 },
    { name: 'Thống lĩnh mây', blurb: 'Một mình đấu Tê Giác Than và Chuồn Kim mức Khó.', map: 'lolua', ai: 'hard', allies: [], foes: ['tegiac', 'chuon'], hp: 0.85, bonus: 400 }
  ];
  PM.UPGRADES = { hp: { name: 'Giáp', step: 0.06, desc: '+6% máu mỗi bậc' }, atk: { name: 'Thuốc súng', step: 0.05, desc: '+5% sát thương mỗi bậc' }, fuel: { name: 'Bình xăng', step: 0.12, desc: '+12% quãng đi mỗi bậc' } };
  PM.UPGRADE_MAX = 3;

  // Cosmetics: bought once, then worn by the unit the player controls.
  PM.SKINS = {
    eye: { name: 'Màu mắt', items: [{ id: 'hophach', name: 'Hổ phách', color: 0xffa22a, price: 0 }, { id: 'lam', name: 'Lam băng', color: 0x40c8ff, price: 150 }, { id: 'luc', name: 'Lục bảo', color: 0x6dff5a, price: 150 }, { id: 'hong', name: 'Hồng sen', color: 0xff5ab4, price: 200 }] },
    trail: { name: 'Vệt đạn', items: [{ id: 'goc', name: 'Nguyên bản', color: null, price: 0 }, { id: 'vang', name: 'Vàng kim', color: [9, 6, 1], price: 200 }, { id: 'tim', name: 'Tím sấm', color: [5, 2, 10], price: 250 }, { id: 'ngoc', name: 'Ngọc bích', color: [1, 8, 5], price: 250 }] }
  };

  PM.MAPS = { doiche: teaHills };
  PM.MAP_ORDER = ['doiche'];
  PM.UNIT_ORDER = ['coc', 'chuon', 'oc', 'tegiac', 'sua', 'rua', 'nhim', 'co'];
  PM.clampPower = (p) => clamp(p, 3, 100);
})();
