/*
 * Ca Trực Đêm: Biệt Đội — dựng một TẦNG (căn nhà) để cả tổ vào khuân đồ.
 *
 * WHY: mọi thứ ở đây sinh ra từ MỘT hạt giống (seed), nên một tầng lỗi có thể mở lại
 *      y hệt để soi. ROOT-CAUSE: bug sinh map không có seed thì không tái hiện được,
 *      và không tái hiện được thì không sửa được.
 * SEE: docs/proposals/repo-squad.md
 */
(function (root) {
  'use strict';
  const SQ = root.SQ;

  const TILE = 22;
  const RW = 19, RH = 13;         // một phòng, tính bằng ô
  const GX = 3, GY = 3;           // số phòng mỗi chiều
  const MW = RW * GX, MH = RH * GY;
  const WPX = MW * TILE, HPX = MH * TILE;
  const FLOOR = 0, WALL = 1, PROP = 2;

  SQ.TILE = TILE; SQ.MW = MW; SQ.MH = MH; SQ.WPX = WPX; SQ.HPX = HPX;
  SQ.RW = RW; SQ.RH = RH; SQ.GX = GX; SQ.GY = GY;
  SQ.FLOOR = FLOOR; SQ.WALL = WALL; SQ.PROP = PROP;

  // RNG có hạt giống — mulberry32.
  function rngFrom(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  SQ.rngFrom = rngFrom;

  // ---------------------------------------------------------------------------
  function genLevel(mapId, floor, seed) {
    const map = SQ.MAP_BY_ID[mapId];
    const R = rngFrom(seed);
    const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
    const rf = (a, b) => a + R() * (b - a);
    const pick = arr => arr[Math.floor(R() * arr.length)];

    const grid = new Uint8Array(MW * MH).fill(WALL);
    const at = (x, y) => grid[y * MW + x];
    const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < MW && y < MH) grid[y * MW + x] = v; };

    // --- phòng ---
    const rooms = [];
    for (let gy = 0; gy < GY; gy++) {
      for (let gx = 0; gx < GX; gx++) {
        const x0 = gx * RW + 1, y0 = gy * RH + 1;
        const x1 = gx * RW + RW - 2, y1 = gy * RH + RH - 2;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, FLOOR);
        rooms.push({
          gx: gx, gy: gy, i: gy * GX + gx, x0: x0, y0: y0, x1: x1, y1: y1,
          cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
          cxp: ((x0 + x1) / 2 + 0.5) * TILE, cyp: ((y0 + y1) / 2 + 0.5) * TILE
        });
      }
    }

    // --- lối đi giữa hai phòng cạnh nhau, mỗi lối là một cửa ---
    const doors = [];
    function carveH(a, b) {                       // a trái, b phải
      const y = Math.round(rf(a.y0 + 2, a.y1 - 2));
      const x = a.x1 + 1;
      for (let d = -1; d <= 1; d++) { set(x, y + d, FLOOR); set(x - 1, y + d, FLOOR); set(x + 1, y + d, FLOOR); }
      doors.push(mkDoor(x, y, 'h'));
    }
    function carveV(a, b) {                       // a trên, b dưới
      const x = Math.round(rf(a.x0 + 2, a.x1 - 2));
      const y = a.y1 + 1;
      for (let d = -1; d <= 1; d++) { set(x + d, y, FLOOR); set(x + d, y - 1, FLOOR); set(x + d, y + 1, FLOOR); }
      doors.push(mkDoor(x, y, 'v'));
    }
    function mkDoor(tx, ty, dir) {
      return {
        tx: tx, ty: ty, dir: dir,
        x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE,
        open: 1, jam: 0, pry: 0
      };
    }
    for (let gy = 0; gy < GY; gy++) {
      for (let gx = 0; gx < GX; gx++) {
        const a = rooms[gy * GX + gx];
        if (gx < GX - 1) carveH(a, rooms[gy * GX + gx + 1]);
        if (gy < GY - 1) carveV(a, rooms[(gy + 1) * GX + gx]);
      }
    }
    // Cửa kẹt: từ tầng 2 trở đi, một phần cửa bị kẹt và phải cạy.
    if (floor >= 2) {
      const n = Math.min(doors.length, Math.round(doors.length * 0.22));
      const idx = doors.map((_, i) => i);
      for (let k = 0; k < n; k++) {
        const j = idx.splice(Math.floor(R() * idx.length), 1)[0];
        doors[j].jam = 1; doors[j].open = 0;
      }
    }

    // --- đồ chặn đường trong phòng ---
    const props = [];
    rooms.forEach(rm => {
      const n = ri(3, 7);
      for (let k = 0; k < n; k++) {
        const w = ri(1, 3), h = ri(1, 2);
        const x = ri(rm.x0 + 1, rm.x1 - w - 1), y = ri(rm.y0 + 1, rm.y1 - h - 1);
        let clear = true;
        for (let yy = y - 1; yy <= y + h && clear; yy++)
          for (let xx = x - 1; xx <= x + w; xx++)
            if (at(xx, yy) !== FLOOR) { clear = false; break; }
        if (!clear) continue;
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, PROP);
        props.push({ x: x, y: y, w: w, h: h, kind: ri(0, 3) });
      }
    });

    // --- phòng vào (dưới giữa) và bệ giao hàng ---
    const entry = rooms[(GY - 1) * GX + 1];
    for (let y = entry.cy - 2; y <= entry.cy + 2; y++)
      for (let x = entry.cx - 2; x <= entry.cx + 2; x++) set(Math.round(x), Math.round(y), FLOOR);
    const pad = {
      x: (entry.cx + 0.5) * TILE, y: (entry.cy + 0.5) * TILE,
      r: 2.4 * TILE, delivered: 0
    };
    const spawn = { x: pad.x, y: pad.y + 2.2 * TILE };

    // Ô trống thật sự của mỗi phòng: đồ và quái chỉ được đặt ở đây.
    // WHY: vòng "thử 40 lần rồi thôi" cũ có thể nhét một món vào giữa cái tủ, và
    //      không ai lấy ra được — cả tổ đứng nhìn nó tới hết ca.
    rooms.forEach(rm => {
      rm.free = [];
      for (let y = rm.y0; y <= rm.y1; y++)
        for (let x = rm.x0; x <= rm.x1; x++)
          if (at(x, y) === FLOOR) rm.free.push([x, y]);
    });
    function freeSpot(rm) {
      if (!rm.free.length) return [Math.round(rm.cx), Math.round(rm.cy)];
      return rm.free[Math.floor(R() * rm.free.length)];
    }

    // --- đồ ăn tiền ---
    // Tổng giá trị rải ra = chỉ tiêu / 0,7 — được phép bỏ lại 30%.
    // Chỉ tiêu co theo SỐ NGƯỜI đang đi ca, không phải con số cứng.
    // WHY: quotaBase được cân cho tổ đủ năm người. Từ bản "mới vô một xác", ván đầu
    //      chạy một mình mà vẫn phải khuân đủ chỉ tiêu của năm người thì không xong nổi.
    // Co dưới mức tuyến tính (1 người = 52%, 5 người = 100%) nên đi đủ tổ vẫn lợi hơn
    // hẳn: bốn người kia còn mang thêm kỹ năng và chia lửa với quái.
    const crew = SQ.clamp(SQ.squadList().length || 1, 1, 5);
    const crewMul = 0.4 + 0.12 * crew;
    const quota = Math.round(map.quotaBase * Math.pow(1 + map.quotaStep, floor - 1) * crewMul);
    const totalValue = Math.round(quota / 0.7);
    const count = Math.min(34, 9 + floor * 2 + map.tier * 2);   // ít món hơn, mỗi món đáng đi hơn
    const loot = [];
    const far = rooms.filter(r => r !== entry);
    let left = totalValue;
    for (let i = 0; i < count; i++) {
      const rm = far[Math.floor(R() * far.length)];
      const size = SQ.SIZES[ri(0, i % 5 === 0 ? 2 : 1)];
      const mat = SQ.MATERIALS[Math.min(SQ.MATERIALS.length - 1, ri(0, 2 + Math.floor(map.tier / 2)))];
      const share = i === count - 1 ? left : Math.round(totalValue / count * rf(0.6, 1.5));
      const value = Math.max(60, Math.min(left, share)) * 1;
      left -= value;
      const spot = freeSpot(rm);
      const x = spot[0], y = spot[1];
      loot.push({
        id: 'L' + i, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE,
        size: size.id, r: size.r, mass: size.mass,
        value: Math.round(value * size.valMul / 2.2),
        mat: mat.id, color: mat.color, fragile: mat.fragile || 1,
        name: pick(SQ.LOOT_NOUNS) + ' ' + mat.name,
        held: null, done: false, broken: 0, vx: 0, vy: 0
      });
      if (left <= 0) break;
    }
    // Chuẩn hoá lại cho khớp tổng — chia phần dư cho các món.
    const sum = loot.reduce((n, l) => n + l.value, 0) || 1;
    const k = totalValue / sum;
    loot.forEach(l => { l.value = Math.max(40, Math.round(l.value * k)); });

    // --- quái ---
    const foes = [];
    const nFoe = map.foeBase + Math.round((floor - 1) * map.foePer);
    for (let i = 0; i < nFoe; i++) {
      const kind = SQ.FOES[map.foes[i % map.foes.length]];
      const rm = far[Math.floor(R() * far.length)];
      const spot = freeSpot(rm);
      const x = spot[0], y = spot[1];
      // WHY: đo bằng bộ chạy nhanh — một tổ đồ 5★ full (≈23k lực chiến) phá đảo được CẢ map
      // cuối với hệ số cũ, tức là cày thêm chẳng để làm gì. Dốc lên cho vòng sau có nghĩa.
      const scale = 1 + (map.tier - 1) * 0.58 + (floor - 1) * 0.12;
      foes.push({
        id: 'F' + i, kind: kind.id, name: kind.name,
        x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, a: R() * Math.PI * 2,
        hp: Math.round(kind.hp * scale), hpMax: Math.round(kind.hp * scale),
        dmg: kind.dmg * (1 + (map.tier - 1) * 0.38 + (floor - 1) * 0.06),
        spd: kind.spd, sight: kind.sight, hear: kind.hear, color: kind.color,
        alert: kind.alert || 0, hidden: kind.hidden || 0, stunProof: kind.stunProof || 0,
        target: null, lastSeen: null, stun: 0, freeze: 0, slow: 0, lure: null,
        atkCd: 0, wander: null, dead: false, spotFx: 0
      });
    }

    return {
      mapId: mapId, map: map, floor: floor, seed: seed,
      grid: grid, rooms: rooms, entry: entry, doors: doors, props: props,
      pad: pad, spawn: spawn, loot: loot, foes: foes,
      quota: quota, totalValue: totalValue,
      seen: new Uint8Array(MW * MH),           // sương mù: ô đã từng nhìn thấy
      lit: new Float32Array(MW * MH)           // độ sáng hiện tại của ô
    };
  }
  SQ.genLevel = genLevel;

  // ---------------------------------------------------------------------------
  // va chạm / tầm nhìn — dùng chung cho người, bot và quái.
  // ---------------------------------------------------------------------------
  SQ.solidAt = function (W, gx, gy) {
    if (gx < 0 || gy < 0 || gx >= MW || gy >= MH) return true;
    return W.grid[gy * MW + gx] !== FLOOR;
  };
  SQ.solidPx = function (W, x, y) {
    return SQ.solidAt(W, Math.floor(x / TILE), Math.floor(y / TILE));
  };
  // Cửa kẹt chặn đường cho tới khi bị cạy.
  SQ.doorBlocks = function (W, x, y, r) {
    for (let i = 0; i < W.doors.length; i++) {
      const d = W.doors[i];
      if (d.open > 0.4) continue;
      const dx = Math.abs(x - d.x), dy = Math.abs(y - d.y);
      if (d.dir === 'h') { if (dx < TILE * 0.6 + r && dy < TILE * 1.6 + r) return d; }
      else { if (dy < TILE * 0.6 + r && dx < TILE * 1.6 + r) return d; }
    }
    return null;
  };

  // Trượt dọc tường thay vì dính vào nó.
  SQ.moveBody = function (W, e, dx, dy, r) {
    const steps = Math.max(1, Math.ceil((Math.abs(dx) + Math.abs(dy)) / 6));
    for (let s = 0; s < steps; s++) {
      const sx = dx / steps, sy = dy / steps;
      if (!hit(e.x + sx, e.y, r)) e.x += sx;
      if (!hit(e.x, e.y + sy, r)) e.y += sy;
    }
    e.x = Math.max(r, Math.min(WPX - r, e.x));
    e.y = Math.max(r, Math.min(HPX - r, e.y));
    function hit(x, y, rr) {
      if (SQ.solidPx(W, x - rr, y) || SQ.solidPx(W, x + rr, y) ||
          SQ.solidPx(W, x, y - rr) || SQ.solidPx(W, x, y + rr)) return true;
      if (SQ.doorBlocks(W, x, y, rr)) return true;
      if (W.cages) {
        for (let i = 0; i < W.cages.length; i++) {
          const c = W.cages[i];
          if (c.t <= 0) continue;
          if (Math.abs(x - c.x) < c.w / 2 + rr && Math.abs(y - c.y) < c.h / 2 + rr) return true;
        }
      }
      return false;
    }
  };

  // Nhìn thẳng được không, nhưng cho một THÂN NGƯỜI rộng `r` chứ không phải một điểm.
  // WHY: đường thẳng lọt qua khe rộng đúng một ô vẫn "nhìn thấy" được, nhưng cái thân
  //      bán kính 8 px thì kẹt ở góc — và bot đứng đó tới hết ca.
  // ROOT-CAUSE: tia kiểm tra là một điểm, va chạm thì là một hình tròn. Hai thứ khác nhau.
  SQ.losWide = function (W, x0, y0, x1, y1, r) {
    if (!SQ.lineOfSight(W, x0, y0, x1, y1)) return false;
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
    const px = -dy / d * r, py = dx / d * r;
    return SQ.lineOfSight(W, x0 + px, y0 + py, x1 + px, y1 + py) &&
           SQ.lineOfSight(W, x0 - px, y0 - py, x1 - px, y1 - py);
  };

  // Có nhìn thẳng được từ A tới B không (tường + cửa đóng chặn).
  SQ.lineOfSight = function (W, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 1) return true;
    const steps = Math.ceil(d / (TILE * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps, x = x0 + dx * t, y = y0 + dy * t;
      if (SQ.solidPx(W, x, y)) return false;
      const dr = SQ.doorBlocks(W, x, y, 2);
      if (dr) return false;
    }
    return true;
  };

})(window);
