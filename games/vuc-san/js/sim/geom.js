// Mô phỏng: hình học va chạm. Đá = hợp các đa giác vách của HX_ZONES (đa giác chồng nhau ở 5/6 bản đồ nên không dùng chẵn-lẻ toàn cục).
// Lưới ô 2 m giữ danh sách đoạn vách; "trong đá" tính bằng đếm giao từ tâm ô tới điểm, từng đa giác một, nên O(số đoạn trong ô).
(function (VS) {
  'use strict';
  var sim = VS.sim = VS.sim || {};
  var geom = VS.geom = VS.geom || {};

  // Hằng số của mô phỏng mà VS.TUNING chưa có (data/tuning.js thuộc nhánh khung). Số nào tăng thành chỉnh được thì chuyển sang TUNING.
  sim.K = {
    surfaceY: 20.5,       // mặt nước, khớp HX_TUNING.surfaceY
    sinkSpeed: 0.45,      // m/s thợ lặn gục chìm xuống
    lateralDrag: 6,       // 1/s cá mập mất vận tốc ngang so với hướng mũi (không lướt ngang)
    dashMinFrac: 0.15,    // hết thể lực thì phải hồi tới tỉ lệ này mới lao tiếp, tránh nhấp nháy mỗi bước
    lootR: 0.45,          // bán kính chạm kho báu
    projR: 0.15,          // bán kính trúng của mũi xiên
    glowMin: 24, glowMax: 64,   // số tia của vòng sáng: ~8 tia mỗi mét bán kính
    visionEvery: 2,       // số bước giữa hai lần tính lại vùng sáng động
    diverSpacing: 1.5,    // m giữa hai thợ lặn lúc sinh
    lootFromSpawn: 12, lootSpacing: 6, // m
    spawnClear: 0.6, sharkClear: 1.45, // m chừa trống quanh điểm sinh (thợ lặn, cá mập lớn nhất r 1,3)
    sharkFar: 0.35,       // cá mập sinh cách chỗ thợ lặn ít nhất tỉ lệ này của bề ngang bản đồ
    lungeMul: 1.3,        // tốc độ cú lao = def.dash nhân hệ số này
    struggleDead: 0.3,    // |mx| phải vượt ngưỡng này mới tính là một chiều giãy khi bị ngậm (bỏ nhiễu cần analog)
    podSpawnOff: 0.7,     // m lệch giữa các thợ lặn cùng hồi sinh ở một khoang cứu hộ
    // Lưới thông để chọn điểm sinh và kho báu. Ô 1 m bỏ sót hang rộng dưới 1 m (3 khoang cứu hộ của C03 rơi vào 3 vùng rời);
    // ô 0,5 m với chừa 0,35 m (thợ lặn r 0,3) nối đủ khoang cứu hộ của cả 6 bản đồ.
    navCell: 0.5, navClear: 0.35
  };

  var CELL = 2;
  // Điểm gốc đếm giao trong mỗi ô lệch khỏi tâm ô: toạ độ vách chỉ có vài chữ số lẻ nên điểm này không nằm đúng trên một cạnh,
  // còn tâm ô thì có thể (vách mỏng ở x = 5 trên lưới ô 2 m làm cả bề dày vách bị coi là nước).
  var RX = 0.50137, RY = 0.49871;
  var TAU = Math.PI * 2;

  // ---- toán nhỏ ----
  geom.wrap = function (a) { a = a % TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
  geom.angDiff = function (a, b) { return geom.wrap(a - b); };
  geom.dist = function (ax, ay, bx, by) { return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)); };

  // Điểm gần nhất trên đoạn (ax,ay)-(bx,by) tới (px,py): trả bình phương khoảng cách, toạ độ vào geom.cx/cy.
  geom.cx = 0; geom.cy = 0;
  geom.segDist2 = function (ax, ay, bx, by, px, py) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    geom.cx = ax + dx * t; geom.cy = ay + dy * t;
    return (px - geom.cx) * (px - geom.cx) + (py - geom.cy) * (py - geom.cy);
  };

  // Đoạn (ax,ay)-(bx,by) chạm hình tròn (cx,cy,r) lần đầu ở tham số t trong [0,1]; -1 nếu không chạm. Xuất phát bên trong thì t = 0.
  geom.segCircle = function (ax, ay, bx, by, cx, cy, r) {
    var dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy;
    var a = dx * dx + dy * dy, c = fx * fx + fy * fy - r * r;
    if (c <= 0) return 0;
    if (a < 1e-12) return -1;
    var b = fx * dx + fy * dy;
    var disc = b * b - a * c;
    if (disc < 0) return -1;
    var t = (-b - Math.sqrt(disc)) / a;
    return t >= 0 && t <= 1 ? t : -1;
  };

  // Tia từ (x0,y0) hướng (dx,dy) chuẩn hoá: t nhỏ nhất >= 0 mà tia chạm biên hình tròn (vào từ ngoài hoặc ra từ trong); Infinity nếu không.
  geom.rayCircle = function (x0, y0, dx, dy, cx, cy, r) {
    var fx = x0 - cx, fy = y0 - cy;
    var b = fx * dx + fy * dy, c = fx * fx + fy * fy - r * r;
    var disc = b * b - c;
    if (disc < 0) return Infinity;
    var s = Math.sqrt(disc), t1 = -b - s, t2 = -b + s;
    if (t1 >= 0) return t1;
    if (t2 >= 0) return t2;
    return Infinity;
  };

  // Đoạn chạm hộp [x0,x1]x[y0,y1] (Liang-Barsky).
  function segBox(ax, ay, bx, by, x0, y0, x1, y1) {
    var dx = bx - ax, dy = by - ay, t0 = 0, t1 = 1, p, q, r;
    for (var k = 0; k < 4; k++) {
      if (k === 0) { p = -dx; q = ax - x0; }
      else if (k === 1) { p = dx; q = x1 - ax; }
      else if (k === 2) { p = -dy; q = ay - y0; }
      else { p = dy; q = y1 - ay; }
      if (p === 0) { if (q < 0) return false; }
      else {
        r = q / p;
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
    }
    return true;
  }

  function pipPoly(pts, x, y) {
    var c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  // ---- World ----
  function World(zone) {
    var walls = zone.walls || [], np = walls.length, ns = 0, i, j;
    for (i = 0; i < np; i++) ns += walls[i].length;
    this.zone = zone;
    this.seg = new Float64Array(ns * 4);
    this.segPoly = new Int32Array(ns);
    this.polys = [];
    var bMinX = 1e9, bMinY = 1e9, bMaxX = -1e9, bMaxY = -1e9, si = 0;
    for (i = 0; i < np; i++) {
      var pts = walls[i], n = pts.length, s0 = si, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (j = 0; j < n; j++) {
        var a = pts[j], b = pts[(j + 1) % n];
        this.seg[si * 4] = a[0]; this.seg[si * 4 + 1] = a[1]; this.seg[si * 4 + 2] = b[0]; this.seg[si * 4 + 3] = b[1];
        this.segPoly[si++] = i;
        if (a[0] < minX) minX = a[0]; if (a[0] > maxX) maxX = a[0];
        if (a[1] < minY) minY = a[1]; if (a[1] > maxY) maxY = a[1];
      }
      this.polys.push({ pts: pts, minX: minX, minY: minY, maxX: maxX, maxY: maxY, s0: s0, s1: si });
      if (minX < bMinX) bMinX = minX; if (maxX > bMaxX) bMaxX = maxX;
      if (minY < bMinY) bMinY = minY; if (maxY > bMaxY) bMaxY = maxY;
    }
    var zb = zone.bounds || { minX: -80, maxX: 80, minY: -120, maxY: 30 };
    this.bounds = { minX: zb.minX, maxX: zb.maxX, minY: zb.minY, maxY: zb.maxY };
    this.minX = Math.min(bMinX, zb.minX) - 4; this.minY = Math.min(bMinY, zb.minY) - 4;
    this.nx = Math.ceil((Math.max(bMaxX, zb.maxX) + 4 - this.minX) / CELL);
    this.ny = Math.ceil((Math.max(bMaxY, zb.maxY) + 4 - this.minY) / CELL);
    var ncell = this.nx * this.ny, lists = new Array(ncell);
    for (si = 0; si < ns; si++) {
      var ax = this.seg[si * 4], ay = this.seg[si * 4 + 1], bx = this.seg[si * 4 + 2], by = this.seg[si * 4 + 3];
      var c0 = Math.floor((Math.min(ax, bx) - this.minX) / CELL), c1 = Math.floor((Math.max(ax, bx) - this.minX) / CELL);
      var r0 = Math.floor((Math.min(ay, by) - this.minY) / CELL), r1 = Math.floor((Math.max(ay, by) - this.minY) / CELL);
      var exact = c1 > c0 + 1 || r1 > r0 + 1;
      for (var cy = r0; cy <= r1; cy++) for (var cx = c0; cx <= c1; cx++) {
        if (exact) {
          var x0 = this.minX + cx * CELL, y0 = this.minY + cy * CELL;
          if (!segBox(ax, ay, bx, by, x0, y0, x0 + CELL, y0 + CELL)) continue;
        }
        var ci = cy * this.nx + cx;
        (lists[ci] || (lists[ci] = [])).push(si);
      }
    }
    this.cellStart = new Int32Array(ncell + 1);
    var total = 0;
    for (i = 0; i < ncell; i++) { this.cellStart[i] = total; if (lists[i]) total += lists[i].length; }
    this.cellStart[ncell] = total;
    this.cellSeg = new Int32Array(total);
    this.itemBase = new Uint8Array(total);
    for (i = 0; i < ncell; i++) if (lists[i]) for (j = 0; j < lists[i].length; j++) this.cellSeg[this.cellStart[i] + j] = lists[i][j];
    this.cellState = new Uint8Array(ncell);   // 0 chưa tính, 1 trống, 2 nằm trọn trong một đa giác không có đoạn nào ở ô
    this.stamp = new Int32Array(ns); this.stampN = 0;
    this.hx = 0; this.hy = 0; this.hd = 0; this.hnx = 0; this.hny = 0;
    this.reachCache = {};
  }

  World.prototype.cellOf = function (x, y) {
    var ix = Math.floor((x - this.minX) / CELL), iy = Math.floor((y - this.minY) / CELL);
    if (ix < 0 || iy < 0 || ix >= this.nx || iy >= this.ny) return -1;
    return iy * this.nx + ix;
  };

  // Tính một lần cho mỗi ô: ô có bị đa giác nào không chạm biên phủ kín không, và trạng thái trong/ngoài của điểm gốc ô với từng đa giác có đoạn trong ô.
  World.prototype._prep = function (ci) {
    var ix = ci % this.nx, iy = (ci - ix) / this.nx;
    var cx = this.minX + (ix + RX) * CELL, cy = this.minY + (iy + RY) * CELL;
    var s0 = this.cellStart[ci], s1 = this.cellStart[ci + 1], k, covered = false;
    var touching = {};
    for (k = s0; k < s1; k++) touching[this.segPoly[this.cellSeg[k]]] = 1;
    for (var p = 0; p < this.polys.length && !covered; p++) {
      if (touching[p]) continue;
      var poly = this.polys[p];
      if (cx < poly.minX || cx > poly.maxX || cy < poly.minY || cy > poly.maxY) continue;
      if (pipPoly(poly.pts, cx, cy)) covered = true;
    }
    var baseOf = {};
    for (k = s0; k < s1; k++) {
      var pid = this.segPoly[this.cellSeg[k]];
      if (baseOf[pid] === undefined) baseOf[pid] = pipPoly(this.polys[pid].pts, cx, cy) ? 1 : 0;
      this.itemBase[k] = baseOf[pid];
    }
    this.cellState[ci] = covered ? 2 : 1;
  };

  World.prototype.solid = function (x, y) {
    var ci = this.cellOf(x, y);
    if (ci < 0) return false;
    if (this.cellState[ci] === 0) this._prep(ci);
    if (this.cellState[ci] === 2) return true;
    var s0 = this.cellStart[ci], s1 = this.cellStart[ci + 1];
    if (s0 === s1) return false;
    var ix = ci % this.nx, iy = (ci - ix) / this.nx;
    var px = this.minX + (ix + RX) * CELL, py = this.minY + (iy + RY) * CELL;
    var dx = x - px, dy = y - py, seg = this.seg, items = this.cellSeg, i = s0;
    while (i < s1) {
      var pid = this.segPoly[items[i]], par = this.itemBase[i];
      while (i < s1 && this.segPoly[items[i]] === pid) {
        var o = items[i] * 4, ax = seg[o], ay = seg[o + 1], bx = seg[o + 2], by = seg[o + 3];
        // (px,py)->(x,y) cắt (a,b)? dấu 0 tính về một phía nên chạm đỉnh vẫn đếm đúng chẵn lẻ
        var o1 = dx * (ay - py) - dy * (ax - px), o2 = dx * (by - py) - dy * (bx - px);
        if ((o1 > 0) !== (o2 > 0)) {
          var ex = bx - ax, ey = by - ay;
          var o3 = ex * (py - ay) - ey * (px - ax), o4 = ex * (y - ay) - ey * (x - ax);
          if ((o3 > 0) !== (o4 > 0)) par ^= 1;
        }
        i++;
      }
      if (par) return true;
    }
    return false;
  };

  // Điểm gần nhất trên mọi đoạn trong bán kính r: đặt hx,hy,hd và trả true.
  World.prototype._nearest = function (x, y, r) {
    var c0 = Math.floor((x - r - this.minX) / CELL), c1 = Math.floor((x + r - this.minX) / CELL);
    var r0 = Math.floor((y - r - this.minY) / CELL), r1 = Math.floor((y + r - this.minY) / CELL);
    if (c0 < 0) c0 = 0; if (r0 < 0) r0 = 0; if (c1 >= this.nx) c1 = this.nx - 1; if (r1 >= this.ny) r1 = this.ny - 1;
    var bd = r * r, found = false, seg = this.seg, stamp = this.stamp, sn = ++this.stampN;
    for (var cy = r0; cy <= r1; cy++) for (var cx = c0; cx <= c1; cx++) {
      var ci = cy * this.nx + cx, s1 = this.cellStart[ci + 1];
      for (var k = this.cellStart[ci]; k < s1; k++) {
        var si = this.cellSeg[k];
        if (stamp[si] === sn) continue;
        stamp[si] = sn;
        var o = si * 4, d = geom.segDist2(seg[o], seg[o + 1], seg[o + 2], seg[o + 3], x, y);
        if (d < bd) { bd = d; this.hx = geom.cx; this.hy = geom.cy; this.hd = Math.sqrt(d); found = true; }
      }
    }
    return found;
  };

  World.prototype.nearest = function (x, y, r) {
    return this._nearest(x, y, r) ? { x: this.hx, y: this.hy, d: this.hd } : null;
  };

  World.prototype.open = function (x, y, r) { return !this.solid(x, y) && !this._nearest(x, y, r); };

  // Đẩy vòng tròn (o.x,o.y,r) ra khỏi đá; trả pháp tuyến {x,y} nếu có đẩy, null nếu không chạm.
  World.prototype.resolve = function (o, r) {
    var hit = null;
    for (var iter = 0; iter < 5; iter++) {
      var inside = this.solid(o.x, o.y);
      if (!this._nearest(o.x, o.y, inside ? 8 : r)) break;
      var nx, ny, d = this.hd;
      if (d < 1e-6) { nx = 0; ny = 1; }
      else if (inside) { nx = (this.hx - o.x) / d; ny = (this.hy - o.y) / d; }
      else { nx = (o.x - this.hx) / d; ny = (o.y - this.hy) / d; }
      if (!inside && d >= r - 1e-4) break;
      o.x = this.hx + nx * (r + 1e-3);
      o.y = this.hy + ny * (r + 1e-3);
      hit = { x: nx, y: ny };
    }
    return hit;
  };

  // Di chuyển o bằng vận tốc (o.vx,o.vy) trong dt, trượt theo vách; chia bước nhỏ để không xuyên vách mỏng. Trả true nếu chạm đá.
  World.prototype.slide = function (o, r, dt) {
    var dist = Math.sqrt(o.vx * o.vx + o.vy * o.vy) * dt;
    var steps = Math.max(1, Math.ceil(dist / (r * 0.8))), touched = false;
    var sx = o.x, sy = o.y;
    for (var s = 0; s < steps; s++) {
      o.x += o.vx * dt / steps; o.y += o.vy * dt / steps;
      var n = this.resolve(o, r);
      if (n) {
        touched = true;
        var vn = o.vx * n.x + o.vy * n.y;
        if (vn < 0) { o.vx -= vn * n.x; o.vy -= vn * n.y; }
      }
    }
    if (touched && this.solid(o.x, o.y)) {
      var p = geom.findOpen(this, sx, sy, r, null);
      if (p) { o.x = p.x; o.y = p.y; } else { o.x = sx; o.y = sy; }
      o.vx = 0; o.vy = 0;
    }
    return touched;
  };

  // Tia (x0,y0)->(x1,y1): tham số t nhỏ nhất chạm vách trong [0,1], hoặc 2 nếu thông. Đặt hnx,hny là pháp tuyến ngược chiều tia.
  World.prototype._cast = function (x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0;
    var gw = this.nx * CELL, gh = this.ny * CELL, tIn = 0, tOut = 1, ta, tb, tt;
    if (dx !== 0) {
      ta = (this.minX - x0) / dx; tb = (this.minX + gw - x0) / dx;
      if (ta > tb) { tt = ta; ta = tb; tb = tt; }
      if (ta > tIn) tIn = ta; if (tb < tOut) tOut = tb;
    } else if (x0 < this.minX || x0 > this.minX + gw) return 2;
    if (dy !== 0) {
      ta = (this.minY - y0) / dy; tb = (this.minY + gh - y0) / dy;
      if (ta > tb) { tt = ta; ta = tb; tb = tt; }
      if (ta > tIn) tIn = ta; if (tb < tOut) tOut = tb;
    } else if (y0 < this.minY || y0 > this.minY + gh) return 2;
    if (tIn > tOut) return 2;
    var px = x0 + dx * tIn, py = y0 + dy * tIn;
    var ix = Math.floor((px - this.minX) / CELL), iy = Math.floor((py - this.minY) / CELL);
    if (ix < 0) ix = 0; else if (ix >= this.nx) ix = this.nx - 1;
    if (iy < 0) iy = 0; else if (iy >= this.ny) iy = this.ny - 1;
    var stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    var tDx = dx !== 0 ? CELL / Math.abs(dx) : Infinity, tDy = dy !== 0 ? CELL / Math.abs(dy) : Infinity;
    var tMx = dx !== 0 ? (this.minX + (ix + (dx > 0 ? 1 : 0)) * CELL - x0) / dx : Infinity;
    var tMy = dy !== 0 ? (this.minY + (iy + (dy > 0 ? 1 : 0)) * CELL - y0) / dy : Infinity;
    var best = 2, seg = this.seg, stamp = this.stamp, sn = ++this.stampN, bsi = -1;
    for (;;) {
      var ci = iy * this.nx + ix, s1 = this.cellStart[ci + 1];
      for (var k = this.cellStart[ci]; k < s1; k++) {
        var si = this.cellSeg[k];
        if (stamp[si] === sn) continue;
        stamp[si] = sn;
        var o = si * 4, ax = seg[o], ay = seg[o + 1], ex = seg[o + 2] - ax, ey = seg[o + 3] - ay;
        var den = dx * ey - dy * ex;
        if (den > -1e-12 && den < 1e-12) continue;
        var t = ((ax - x0) * ey - (ay - y0) * ex) / den;
        if (t < 0 || t > 1 || t >= best) continue;
        var u = ((ax - x0) * dy - (ay - y0) * dx) / den;
        if (u < 0 || u > 1) continue;
        best = t; bsi = si;
      }
      var tn = tMx < tMy ? tMx : tMy;
      if (best <= tn || tn > tOut) break;
      if (tMx < tMy) { ix += stepX; tMx += tDx; if (ix < 0 || ix >= this.nx) break; }
      else { iy += stepY; tMy += tDy; if (iy < 0 || iy >= this.ny) break; }
    }
    if (bsi >= 0) {
      var q = bsi * 4, fx = seg[q + 2] - seg[q], fy = seg[q + 3] - seg[q + 1], l = Math.sqrt(fx * fx + fy * fy) || 1;
      var nx = -fy / l, ny = fx / l;
      if (nx * dx + ny * dy > 0) { nx = -nx; ny = -ny; }
      this.hnx = nx; this.hny = ny;
    }
    return best;
  };

  World.prototype.raycast = function (x0, y0, x1, y1) {
    var t = this._cast(x0, y0, x1, y1);
    if (t > 1) return null;
    return { t: t, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, nx: this.hnx, ny: this.hny };
  };
  World.prototype.clear = function (x0, y0, x1, y1) { return this._cast(x0, y0, x1, y1) > 1; };

  // Bản đồ nào cũng dùng lại một World (chỉ đọc) giữa các trận trong cùng tiến trình.
  var cache = {};
  geom.worldFor = function (zone) {
    var c = cache[zone.id];
    if (!c || c.zone !== zone) c = cache[zone.id] = new World(zone);
    return c;
  };
  geom.World = World;

  // Điểm thoáng gần (x,y) nhất theo vòng xoáy; opts.maxY chặn mặt nước, opts.maxR bán kính tìm tối đa. Trả {x,y} hoặc null.
  geom.findOpen = function (w, x, y, r, opts) {
    var maxY = opts && opts.maxY != null ? opts.maxY : sim.K.surfaceY - r, maxR = opts && opts.maxR || 30, b = w.bounds;
    function ok(px, py) {
      return px >= b.minX + r && px <= b.maxX - r && py >= b.minY + r && py <= maxY && w.open(px, py, r);
    }
    if (ok(x, y)) return { x: x, y: y };
    for (var rad = 0.25; rad <= maxR; rad += 0.25) {
      var n = Math.max(8, Math.ceil(TAU * rad / 0.35));
      for (var k = 0; k < n; k++) {
        var a = TAU * k / n, px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (ok(px, py)) return { x: px, y: py };
      }
    }
    return null;
  };

  // Lưới thông: ô thoáng với khoảng chừa r, nhãn thành phần liên thông (4 hướng); comp[] = 0 là không đi được, main = nhãn vùng lớn nhất.
  geom.reachGrid = function (w, r, cell) {
    var key = r + '/' + cell, g = w.reachCache[key];
    if (g) return g;
    var b = w.bounds, maxY = sim.K.surfaceY - 1;
    var nx = Math.ceil((b.maxX - b.minX) / cell), ny = Math.ceil((Math.min(b.maxY, maxY) - b.minY) / cell);
    var ok = new Uint8Array(nx * ny), comp = new Int32Array(nx * ny), ix, iy;
    for (iy = 0; iy < ny; iy++) for (ix = 0; ix < nx; ix++) {
      ok[iy * nx + ix] = w.open(b.minX + (ix + 0.5) * cell, b.minY + (iy + 0.5) * cell, r) ? 1 : 0;
    }
    var label = 0, sizes = [0], queue = new Int32Array(nx * ny), main = 0, mainSize = 0;
    for (var s = 0; s < ok.length; s++) {
      if (!ok[s] || comp[s]) continue;
      label++; var head = 0, tail = 0, size = 0;
      queue[tail++] = s; comp[s] = label;
      while (head < tail) {
        var c = queue[head++], cx = c % nx, cy = (c - cx) / nx; size++;
        if (cx > 0 && ok[c - 1] && !comp[c - 1]) { comp[c - 1] = label; queue[tail++] = c - 1; }
        if (cx < nx - 1 && ok[c + 1] && !comp[c + 1]) { comp[c + 1] = label; queue[tail++] = c + 1; }
        if (cy > 0 && ok[c - nx] && !comp[c - nx]) { comp[c - nx] = label; queue[tail++] = c - nx; }
        if (cy < ny - 1 && ok[c + nx] && !comp[c + nx]) { comp[c + nx] = label; queue[tail++] = c + nx; }
      }
      sizes.push(size);
      if (size > mainSize) { mainSize = size; main = label; }
    }
    g = { cell: cell, minX: b.minX, minY: b.minY, nx: nx, ny: ny, ok: ok, comp: comp, main: main, mainSize: mainSize };
    g.at = function (x, y) {
      var gx = Math.floor((x - g.minX) / cell), gy = Math.floor((y - g.minY) / cell);
      if (gx < 0 || gy < 0 || gx >= nx || gy >= ny) return 0;
      return comp[gy * nx + gx];
    };
    g.cx = function (i) { return g.minX + ((i % nx) + 0.5) * cell; };
    g.cy = function (i) { return g.minY + (Math.floor(i / nx) + 0.5) * cell; };
    w.reachCache[key] = g;
    return g;
  };
})(window.VS = window.VS || {});
