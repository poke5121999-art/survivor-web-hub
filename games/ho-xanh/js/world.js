// Va chạm 2D trên mặt z=0: đa giác PolygonCollider2D của cảnh gốc.
(function (HX) {
  'use strict';

  function World(level) {
    this.polys = level.walls.map(function (pts) {
      var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
      }
      return { pts: pts, minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    });
    var b = { minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9 };
    this.polys.forEach(function (p) {
      b.minX = Math.min(b.minX, p.minX); b.maxX = Math.max(b.maxX, p.maxX);
      b.minY = Math.min(b.minY, p.minY); b.maxY = Math.max(b.maxY, p.maxY);
    });
    this.box = b;
  }

  function insidePoly(poly, x, y) {
    if (x < poly.minX || x > poly.maxX || y < poly.minY || y > poly.maxY) return false;
    var pts = poly.pts, c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  World.prototype.solid = function (x, y) {
    for (var i = 0; i < this.polys.length; i++) if (insidePoly(this.polys[i], x, y)) return true;
    return false;
  };

  // Điểm gần nhất trên mọi cạnh trong bán kính r.
  World.prototype.nearest = function (x, y, r) {
    var best = null, bd = r * r;
    for (var k = 0; k < this.polys.length; k++) {
      var poly = this.polys[k];
      if (x < poly.minX - r || x > poly.maxX + r || y < poly.minY - r || y > poly.maxY + r) continue;
      var pts = poly.pts;
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var ax = pts[j][0], ay = pts[j][1], bx = pts[i][0], by = pts[i][1];
        var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        var t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var px = ax + dx * t, py = ay + dy * t, d = (x - px) * (x - px) + (y - py) * (y - py);
        if (d < bd) { bd = d; best = { x: px, y: py, d: Math.sqrt(d) }; }
      }
    }
    return best;
  };

  // Đẩy vòng tròn (x,y,r) ra khỏi đá; trả pháp tuyến nếu có chạm.
  World.prototype.resolve = function (pos, r) {
    var hitN = null;
    for (var iter = 0; iter < 4; iter++) {
      var inside = this.solid(pos.x, pos.y);
      var n = this.nearest(pos.x, pos.y, inside ? 8 : r);
      if (!n) break;
      var nx, ny;
      if (n.d < 1e-6) { nx = 0; ny = 1; }
      else if (inside) { nx = (n.x - pos.x) / n.d; ny = (n.y - pos.y) / n.d; }
      else { nx = (pos.x - n.x) / n.d; ny = (pos.y - n.y) / n.d; }
      if (!inside && n.d >= r - 1e-4) break;
      pos.x = n.x + nx * (r + 1e-3);
      pos.y = n.y + ny * (r + 1e-3);
      hitN = { x: nx, y: ny };
    }
    return hitN;
  };

  // Di chuyển có trượt theo vách; bước nhỏ để không xuyên qua vách mỏng.
  World.prototype.move = function (pos, vel, r, dt) {
    var dist = Math.hypot(vel.x, vel.y) * dt;
    var steps = Math.max(1, Math.ceil(dist / (r * 0.8)));
    var hit = null;
    for (var s = 0; s < steps; s++) {
      pos.x += vel.x * dt / steps;
      pos.y += vel.y * dt / steps;
      var n = this.resolve(pos, r);
      if (n) {
        hit = n;
        var vn = vel.x * n.x + vel.y * n.y;
        if (vn < 0) { vel.x -= vn * n.x; vel.y -= vn * n.y; }
      }
    }
    return hit;
  };

  // Đoạn thẳng cắt vách đầu tiên: {t, x, y, nx, ny} hoặc null.
  World.prototype.raycast = function (x0, y0, x1, y1) {
    var best = null, dx = x1 - x0, dy = y1 - y0;
    var mnx = Math.min(x0, x1), mxx = Math.max(x0, x1), mny = Math.min(y0, y1), mxy = Math.max(y0, y1);
    for (var k = 0; k < this.polys.length; k++) {
      var poly = this.polys[k];
      if (mxx < poly.minX || mnx > poly.maxX || mxy < poly.minY || mny > poly.maxY) continue;
      var pts = poly.pts;
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var ax = pts[j][0], ay = pts[j][1], ex = pts[i][0] - ax, ey = pts[i][1] - ay;
        var den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        var t = ((ax - x0) * ey - (ay - y0) * ex) / den;
        var u = ((ax - x0) * dy - (ay - y0) * dx) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (!best || t < best.t)) {
          var l = Math.hypot(ex, ey) || 1, nx = -ey / l, ny = ex / l;
          if (nx * dx + ny * dy > 0) { nx = -nx; ny = -ny; }
          best = { t: t, x: x0 + dx * t, y: y0 + dy * t, nx: nx, ny: ny };
        }
      }
    }
    return best;
  };

  // Nước thoáng quanh (x,y) trong bán kính r.
  World.prototype.open = function (x, y, r) {
    return !this.solid(x, y) && !this.nearest(x, y, r);
  };

  // Các đoạn mép đá ngửa lên trời (đất nằm dưới, nước ở trên) — chỗ để san hô, rong.
  World.prototype.upwardEdges = function (maxSlope) {
    var out = [], self = this;
    this.polys.forEach(function (poly) {
      var pts = poly.pts;
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var ax = pts[j][0], ay = pts[j][1], bx = pts[i][0], by = pts[i][1];
        var len = Math.hypot(bx - ax, by - ay);
        if (len < 0.25 || Math.abs(by - ay) / len > maxSlope) continue;
        var mx = (ax + bx) / 2, my = (ay + by) / 2;
        if (self.solid(mx, my + 0.12) || !self.solid(mx, my - 0.12)) continue;
        out.push({ ax: ax, ay: ay, bx: bx, by: by, len: len });
      }
    });
    return out;
  };

  HX.World = World;
})(window.HX = window.HX || {});
