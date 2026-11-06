// Mô phỏng: tìm đường. A* 8 hướng trên lưới đi được của geom.reachGrid theo bán kính actor, rồi kéo căng đường (bỏ điểm thừa
// khi quét tròn bán kính actor dọc đoạn thẳng không chạm vách). Không đụng DOM, THREE hay m.rng nên cùng seed vẫn cùng kết quả.
(function (VS) {
  'use strict';
  var sim = VS.sim = VS.sim || {};
  var geom = VS.geom;
  var nav = VS.nav = VS.nav || {};

  var R_STEP = 0.05;        // bán kính xin được làm tròn lên bội số này để các cá mập cùng cỡ dùng chung một lưới
  var SWEEP_STEP = 0.25;    // m giữa hai mẫu khi quét tròn dọc đoạn thẳng
  var SNAP_MAX = 8;         // m tìm ô đi được gần nhất khi điểm xuất phát/đích nằm trong chỗ hẹp
  var SWEEP_FIT = 0.97;     // quét tròn hơi hụt bán kính lưới để đường đi sát khe vừa khít không bị loại vì sai số làm tròn
  var SQRT2 = Math.SQRT2;
  var REPLAN_DRIFT = 1.5, REPLAN_AGE = 1.5, WP_REACH = 0.7, DIRECT_MAX = 14;

  function radiusKey(r) { return Math.max(R_STEP, Math.ceil(r / R_STEP - 1e-9) * R_STEP); }

  // Lưới của nav: ô đi được cho bán kính r, cá mập thêm vùng cấm quanh khoang cứu hộ (actors.js đẩy chúng ra khỏi đó).
  function gridFor(m, team, r) {
    var rk = radiusKey(r), w = m.world, key = 'nav:' + team + ':' + rk.toFixed(2), n = w.reachCache[key];
    if (n) return n;
    var g = geom.reachGrid(w, rk, sim.K.navCell), ok = new Uint8Array(g.ok), nx = g.nx, ny = g.ny, i, j;
    if (team === 'shark') {
      var safe = VS.TUNING.pod.safeR + g.cell * 0.6;
      for (i = 0; i < m.pods.length; i++) {
        var p = m.pods[i], x0 = Math.max(0, Math.floor((p.x - safe - g.minX) / g.cell)), x1 = Math.min(nx - 1, Math.floor((p.x + safe - g.minX) / g.cell));
        var y0 = Math.max(0, Math.floor((p.y - safe - g.minY) / g.cell)), y1 = Math.min(ny - 1, Math.floor((p.y + safe - g.minY) / g.cell));
        for (j = y0; j <= y1; j++) for (var k = x0; k <= x1; k++) {
          var dx = g.minX + (k + 0.5) * g.cell - p.x, dy = g.minY + (j + 0.5) * g.cell - p.y;
          if (dx * dx + dy * dy < safe * safe) ok[j * nx + k] = 0;
        }
      }
    }
    var comp = new Int32Array(nx * ny), q = new Int32Array(nx * ny), label = 0;
    for (var s = 0; s < ok.length; s++) {
      if (!ok[s] || comp[s]) continue;
      label++; var head = 0, tail = 0;
      q[tail++] = s; comp[s] = label;
      while (head < tail) {
        var c = q[head++], cx = c % nx, cy = (c - cx) / nx;
        if (cx > 0 && ok[c - 1] && !comp[c - 1]) { comp[c - 1] = label; q[tail++] = c - 1; }
        if (cx < nx - 1 && ok[c + 1] && !comp[c + 1]) { comp[c + 1] = label; q[tail++] = c + 1; }
        if (cy > 0 && ok[c - nx] && !comp[c - nx]) { comp[c - nx] = label; q[tail++] = c - nx; }
        if (cy < ny - 1 && ok[c + nx] && !comp[c + nx]) { comp[c + nx] = label; q[tail++] = c + nx; }
      }
    }
    n = {
      r: rk, g: g, cell: g.cell, minX: g.minX, minY: g.minY, nx: nx, ny: ny, ok: ok, comp: comp,
      gs: new Float64Array(nx * ny), from: new Int32Array(nx * ny), stamp: new Int32Array(nx * ny), run: 0,
      heap: [], paths: {}, pathN: 0
    };
    w.reachCache[key] = n;
    return n;
  }

  function cellAt(n, x, y) {
    var ix = Math.floor((x - n.minX) / n.cell), iy = Math.floor((y - n.minY) / n.cell);
    if (ix < 0 || iy < 0 || ix >= n.nx || iy >= n.ny) return -1;
    return iy * n.nx + ix;
  }
  function cellX(n, c) { return n.minX + ((c % n.nx) + 0.5) * n.cell; }
  function cellY(n, c) { return n.minY + (Math.floor(c / n.nx) + 0.5) * n.cell; }

  // Ô đi được gần (x,y) nhất theo vòng vuông mở rộng dần; want (nếu có) là nhãn vùng bắt buộc.
  function snap(n, x, y, want) {
    var c0 = cellAt(n, x, y), ix, iy, rad, i, j, best = -1, bd = 1e18, maxRad = Math.ceil(SNAP_MAX / n.cell);
    if (c0 < 0) {
      ix = Math.min(n.nx - 1, Math.max(0, Math.floor((x - n.minX) / n.cell))); iy = Math.min(n.ny - 1, Math.max(0, Math.floor((y - n.minY) / n.cell)));
    } else { ix = c0 % n.nx; iy = (c0 - ix) / n.nx; }
    for (rad = 0; rad <= maxRad; rad++) {
      for (j = -rad; j <= rad; j++) for (i = -rad; i <= rad; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== rad) continue;
        var cx = ix + i, cy = iy + j;
        if (cx < 0 || cy < 0 || cx >= n.nx || cy >= n.ny) continue;
        var c = cy * n.nx + cx;
        if (!n.ok[c] || (want && n.comp[c] !== want)) continue;
        var d = (cellX(n, c) - x) * (cellX(n, c) - x) + (cellY(n, c) - y) * (cellY(n, c) - y);
        if (d < bd) { bd = d; best = c; }
      }
      if (best >= 0 && rad * n.cell * rad * n.cell > bd) break;
    }
    return best;
  }

  // Heap nhị phân theo f, lưu cặp (f, ô) trong mảng phẳng.
  function push(h, f, c) {
    var i = h.length / 2, p;
    h.push(f, c);
    while (i > 0) {
      p = (i - 1) >> 1;
      if (h[p * 2] <= f) break;
      h[i * 2] = h[p * 2]; h[i * 2 + 1] = h[p * 2 + 1]; i = p;
    }
    h[i * 2] = f; h[i * 2 + 1] = c;
  }
  function pop(h) {
    var c = h[1], lf = h[h.length - 2], lc = h[h.length - 1], n, i = 0, k;
    h.length -= 2; n = h.length / 2;
    if (n === 0) return c;
    for (;;) {
      k = i * 2 + 1;
      if (k >= n) break;
      if (k + 1 < n && h[(k + 1) * 2] < h[k * 2]) k++;
      if (h[k * 2] >= lf) break;
      h[i * 2] = h[k * 2]; h[i * 2 + 1] = h[k * 2 + 1]; i = k;
    }
    h[i * 2] = lf; h[i * 2 + 1] = lc;
    return c;
  }

  // A* từ ô s tới ô t; trả mảng ô từ s tới t hoặc null. Không đi chéo qua góc đá (cả hai ô kề phải đi được).
  function astar(n, s, t) {
    var nx = n.nx, ok = n.ok, gs = n.gs, from = n.from, stamp = n.stamp, h = n.heap, run = ++n.run, tx = t % nx, ty = (t - tx) / nx;
    var cell = n.cell;
    h.length = 0; gs[s] = 0; from[s] = -1; stamp[s] = run; push(h, 0, s);
    while (h.length) {
      var c = pop(h);
      if (c === t) break;
      var cx = c % nx, cy = (c - cx) / nx, gc = gs[c];
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var ax = cx + dx, ay = cy + dy;
        if (ax < 0 || ay < 0 || ax >= nx || ay >= n.ny) continue;
        var a = ay * nx + ax;
        if (!ok[a]) continue;
        if (dx && dy && (!ok[cy * nx + ax] || !ok[ay * nx + cx])) continue;
        var ng = gc + (dx && dy ? SQRT2 : 1);
        if (stamp[a] === run && gs[a] <= ng) continue;
        stamp[a] = run; gs[a] = ng; from[a] = c;
        var ex = Math.abs(ax - tx), ey = Math.abs(ay - ty);
        push(h, ng + (ex + ey) + (SQRT2 - 2) * Math.min(ex, ey), a);
      }
    }
    if (stamp[t] !== run) return null;
    var out = [];
    for (var k = t; k !== -1; k = from[k]) out.push(k);
    return out.reverse();
  }

  // Quét tròn bán kính r dọc đoạn (x0,y0)-(x1,y1): không chạm vách; cá mập còn không được cắt vùng an toàn quanh khoang cứu hộ. Mẫu cả hai đầu.
  function sweepClear(m, x0, y0, x1, y1, r, team) {
    var w = m.world, d = geom.dist(x0, y0, x1, y1), k = Math.max(1, Math.ceil(d / SWEEP_STEP));
    if (w._cast(x0, y0, x1, y1) <= 1) return false;
    if (team === 'shark') {
      var safe = VS.TUNING.pod.safeR + 0.05;
      for (var j = 0; j < m.pods.length; j++) if (geom.segDist2(x0, y0, x1, y1, m.pods[j].x, m.pods[j].y) < safe * safe) return false;
    }
    for (var i = 0; i <= k; i++) {
      if (!w.open(x0 + (x1 - x0) * i / k, y0 + (y1 - y0) * i / k, r)) return false;
    }
    return true;
  }

  // Bỏ điểm thừa: từ mỗi mốc, nhảy tới điểm xa nhất còn nhìn thẳng được (phi tới gấp đôi rồi chia đôi, vì tầm nhìn gần như đơn điệu).
  function smooth(m, pts, r, team) {
    var out = [pts[0]], i = 0, n = pts.length;
    while (i < n - 1) {
      var lo = i + 1, hi = lo, step = 1;
      while (hi < n - 1 && sweepClear(m, pts[i].x, pts[i].y, pts[Math.min(n - 1, hi + step)].x, pts[Math.min(n - 1, hi + step)].y, r, team)) { hi = Math.min(n - 1, hi + step); step *= 2; }
      var top = Math.min(n - 1, hi + step);
      if (hi < n - 1) {
        var l = hi, u = top;
        while (u - l > 1) {
          var mid = (l + u) >> 1;
          if (sweepClear(m, pts[i].x, pts[i].y, pts[mid].x, pts[mid].y, r, team)) l = mid; else u = mid;
        }
        hi = l;
      }
      out.push(pts[hi]); i = hi;
    }
    return out;
  }

  function copyFrom(pts, sx, sy) {
    var out = pts.map(function (p) { return { x: p.x, y: p.y }; });
    out[0] = { x: sx, y: sy };
    return out;
  }

  // Đường từ (sx,sy) tới (x,y) cho thân tròn bán kính r của đội team: [{x,y}...] (mốc đầu là xuất phát, mốc cuối là điểm đích thật), hoặc null khi không có đường.
  nav.pathFor = function (m, team, r, sx, sy, x, y) {
    var n = gridFor(m, team, r), s = snap(n, sx, sy, 0), t, key, hit;
    if (s < 0) return null;
    t = snap(n, x, y, n.comp[s]);
    if (t < 0) return null;
    key = s + '>' + t; hit = n.paths[key];
    if (hit !== undefined) return hit === null ? null : copyFrom(hit, sx, sy);
    var cells = astar(n, s, t), res = null;
    if (cells) {
      var pts = cells.map(function (c) { return { x: cellX(n, c), y: cellY(n, c) }; });
      pts[0] = { x: sx, y: sy };
      var tcx = cellX(n, t), tcy = cellY(n, t), exact = geom.dist(x, y, tcx, tcy) < n.cell && n.ok[cellAt(n, x, y)];
      pts[pts.length - 1] = exact ? { x: x, y: y } : { x: tcx, y: tcy };
      res = smooth(m, pts, Math.max(0.05, n.r * SWEEP_FIT), team);
    }
    if (n.pathN > 400) { n.paths = {}; n.pathN = 0; }   // đủ cho một trận: các cặp ô hay lặp lại là chỗ nghỉ và kho báu cố định
    n.paths[key] = res; n.pathN++;
    return res && copyFrom(res, sx, sy);
  };

  nav.path = function (m, a, x, y) { return nav.pathFor(m, a.team, a.r, a.x, a.y, x, y); };

  // Trạng thái dẫn đường của một actor nằm ngoài dữ liệu trận (không chép khi lưu trận).
  function stateOf(a) {
    if (!a.navState) Object.defineProperty(a, 'navState', { value: { pts: null, i: 0, gx: 0, gy: 0, t: -1e9, ok: false }, writable: true, enumerable: false });
    return a.navState;
  }

  // Hướng đi {mx,my} (độ dài 1, hoặc 0 khi tới nơi/không có đường) để actor a tới (x,y). Tính lại đường khi đích dời quá 1,5 m hoặc đường cũ quá 1,5 s.
  nav.steer = function (m, a, x, y) {
    var st = stateOf(a), r = Math.max(0.05, radiusKey(a.r) * SWEEP_FIT), d = geom.dist(a.x, a.y, x, y);
    if (d < 0.05) return { mx: 0, my: 0 };
    var stale = !st.pts || geom.dist(st.gx, st.gy, x, y) > REPLAN_DRIFT || m.t - st.t > REPLAN_AGE;
    if (stale) {
      st.gx = x; st.gy = y; st.t = m.t; st.i = 1;
      st.pts = d <= DIRECT_MAX && sweepClear(m, a.x, a.y, x, y, r, a.team) ? [{ x: a.x, y: a.y }, { x: x, y: y }] : nav.path(m, a, x, y);
      st.ok = !!st.pts;
    }
    if (!st.pts) { st.ok = false; return { mx: 0, my: 0 }; }
    var pts = st.pts;
    while (st.i < pts.length - 1) {
      var p = pts[st.i], nxt = pts[st.i + 1];
      if (geom.dist(a.x, a.y, p.x, p.y) < WP_REACH || sweepClear(m, a.x, a.y, nxt.x, nxt.y, r, a.team)) st.i++; else break;
    }
    var q = pts[Math.min(st.i, pts.length - 1)], dx = q.x - a.x, dy = q.y - a.y, l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) return { mx: 0, my: 0 };
    return { mx: dx / l, my: dy / l };
  };

  // Có đường tới (x,y) không (dùng chọn mục tiêu).
  nav.reachable = function (m, a, x, y) {
    var n = gridFor(m, a.team, a.r), s = snap(n, a.x, a.y, 0);
    return s >= 0 && snap(n, x, y, n.comp[s]) >= 0;
  };

  nav.forget = function (a) { if (a.navState) a.navState.pts = null; };
})(window.VS = window.VS || {});
