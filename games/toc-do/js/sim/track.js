// Truy vấn ruy băng đường (TD.TRACKS[id]). Thuần JS.
//   TD.Track.get(id)                 → bản đã chuẩn bị (cache)
//   TD.Track.locate(T, x, y, z, hint) → { seg, tp, a, b, t, s, d, y, normal:[x,y,z], fx, fz, lw, rw, inside, score }
//        d: lệch ngang có dấu, + là bên trái theo chiều chạy. lw/rw: bề rộng trái/phải (dương). hint: seg của lần trước.
//   TD.Track.resetFor(T, kart)      → điểm hồi sinh phía sau xe, trong vùng checkpoint đã qua
//   TD.Track.lineNearest(T, x, y, z, hint) → chỉ số gần nhất trên đường chạy chuẩn T.line
// Quy ước: tiến = (dx, dz) của điểm ruy băng; trái = (fz, -fx) (y lên, hệ tay phải).
(function (G) {
  var TD = G.TD = G.TD || {};
  var CELL = 24;

  function prep(src) {
    var p = src.pts, n = p.x.length;
    var T = { src: src, id: src.id, n: n, L: src.length, laps: src.laps, gravity: src.gravity,
      x: p.x, y: p.y, z: p.z, s: p.s, lw: p.lw, rw: p.rw, next: p.next, prev: p.prev,
      fx: new Float64Array(n), fz: new Float64Array(n), m: new Float64Array(n),
      segs: [], segFrom: [], segTo: [], cps: src.cps, resets: src.resets, line: src.line, startCp: src.startCp || 0 };
    for (var i = 0; i < n; i++) {
      var h = Math.hypot(p.dx[i], p.dz[i]) || 1;
      T.fx[i] = p.dx[i] / h; T.fz[i] = p.dz[i] / h; T.m[i] = p.dy[i] / h;
      T.segFrom.push([]); T.segTo.push([]);
    }
    fillJunctions(T);
    // điểm gấp khúc có bề rộng tụt một điểm (vd 1.45 m giữa hai điểm 18 m): lấy theo láng giềng
    [T.lw, T.rw].forEach(function (w) {
      for (var q = 0; q < n; q++) {
        var a = T.prev[q][0], b = T.next[q][0];
        if (a == null || b == null) continue;
        var m = Math.min(w[a], w[b]);
        if (w[q] < m * 0.5) w[q] = m;
      }
      // bề rộng 0 (đoạn bay qua khe nhảy): lấy bề rộng gần nhất dọc đường
      for (q = 0; q < n; q++) {
        if (w[q] >= 2) continue;
        var f = q, bk = q, best = 0;
        for (var h = 0; h < 8 && !best; h++) {
          f = f == null ? null : T.next[f][0]; bk = bk == null ? null : T.prev[bk][0];
          if (f != null && w[f] >= 2) best = w[f]; else if (bk != null && w[bk] >= 2) best = w[bk];
        }
        w[q] = best || 8;
      }
    });
    for (i = 0; i < n; i++) {
      for (var k = 0; k < p.next[i].length; k++) {
        var j = p.next[i][k];
        var sb = p.s[j];
        if (sb < p.s[i] - 1) sb += T.L;   // nối vòng
        var sg = { id: T.segs.length, a: i, b: j, len: Math.hypot(p.x[j] - p.x[i], p.z[j] - p.z[i]) || 1, sa: p.s[i], sb: sb };
        T.segs.push(sg); T.segFrom[i].push(sg.id); T.segTo[j].push(sg.id);
      }
    }
    // lân cận của mỗi đoạn: các đoạn trong 3 bước theo cả hai chiều (đủ phủ chỗ ruy băng gấp khúc ở quảng trường)
    T.near = T.segs.map(function (sg) {
      var set = {}, front = [sg.id];
      set[sg.id] = 1;
      for (var d = 0; d < 3; d++) {
        var nf = [];
        front.forEach(function (id) {
          var q = T.segs[id];
          T.segFrom[q.b].concat(T.segTo[q.a], T.segFrom[q.a], T.segTo[q.b]).forEach(function (o) { if (!set[o]) { set[o] = 1; nf.push(o); } });
        });
        front = nf;
      }
      return Object.keys(set).map(Number);
    });
    // lưới để tìm toàn cục
    T.grid = {};
    T.segs.forEach(function (sg) {
      var w = Math.max(p.lw[sg.a], p.rw[sg.a], p.lw[sg.b], p.rw[sg.b]) + 8;
      var x0 = Math.min(p.x[sg.a], p.x[sg.b]) - w, x1 = Math.max(p.x[sg.a], p.x[sg.b]) + w;
      var z0 = Math.min(p.z[sg.a], p.z[sg.b]) - w, z1 = Math.max(p.z[sg.a], p.z[sg.b]) + w;
      for (var cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
        for (var cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
          var key = cx + ',' + cz;
          (T.grid[key] = T.grid[key] || []).push(sg.id);
        }
    });
    // checkpoint: tập cho phép kế tiếp (BFS 3 bước theo next) để chịu được cổng bị cắt ở chỗ tách/nhập nhánh
    T.cpAllowed = T.cps.map(function (c) {
      var out = [], seen = {}, front = [c.id];
      seen[c.id] = 1;
      for (var d = 0; d < 3; d++) {
        var nf = [];
        front.forEach(function (id) {
          T.cps[id].next.forEach(function (q) { if (!seen[q]) { seen[q] = 1; out.push(q); nf.push(q); } });
        });
        front = nf;
      }
      return out;
    });
    T.cps.forEach(function (c) {
      var gx = c.rx - c.lx, gz = c.rz - c.lz, gl = Math.hypot(gx, gz) || 1;
      c.gx0 = c.lx - gx / gl * 2; c.gz0 = c.lz - gz / gl * 2;   // cổng nới 2 m mỗi đầu
      c.gx1 = c.rx + gx / gl * 2; c.gz1 = c.rz + gz / gl * 2;
    });
    T.resets.forEach(function (r) { r.yaw = Math.atan2(r.fx, r.fz); });
    if (T.line) {
      var ln = T.line, m = ln.x.length;
      ln.n = m; ln.yaw = new Float64Array(m); ln.curv = new Float64Array(m);
      for (i = 0; i < m; i++) {
        var a = (i + m - 1) % m, b = (i + 1) % m;
        ln.yaw[i] = Math.atan2(ln.x[b] - ln.x[a], ln.z[b] - ln.z[a]);
      }
    }
    return T;
  }

  // Chỗ tách/nhập nhánh: nới bề rộng phía nhánh kia tới tâm của nó để lấp khe giữa hai dải.
  function fillJunctions(T) {
    var n = T.n, p = T.src.pts;
    T.lw = Array.prototype.slice.call(T.lw); T.rw = Array.prototype.slice.call(T.rw);
    for (var j = 0; j < n; j++) {
      if (T.next[j].length < 2 && T.prev[j].length < 2) continue;
      var set = {}, front = [j];
      set[j] = 1;
      for (var h = 0; h < 6; h++) {
        var nf = [];
        front.forEach(function (i) { T.next[i].concat(T.prev[i]).forEach(function (q) { if (!set[q]) { set[q] = 1; nf.push(q); } }); });
        front = nf;
      }
      var ids = Object.keys(set).map(Number);
      ids.forEach(function (a) {
        ids.forEach(function (b) {
          if (p.curve[a] === p.curve[b]) return;
          var dx = T.x[b] - T.x[a], dz = T.z[b] - T.z[a];
          var along = dx * T.fx[a] + dz * T.fz[a], dq = dx * T.fz[a] - dz * T.fx[a];
          if (Math.abs(along) > 12 || Math.abs(T.y[b] - T.y[a]) > 3) return;
          if (dq > 0) T.lw[a] = Math.max(T.lw[a], dq); else T.rw[a] = Math.max(T.rw[a], -dq);
        });
      });
    }
  }

  function evalSeg(T, sg, x, y, z, out) {
    var a = sg.a, b = sg.b;
    var da = (x - T.x[a]) * T.fx[a] + (z - T.z[a]) * T.fz[a];
    var db = (x - T.x[b]) * T.fx[b] + (z - T.z[b]) * T.fz[b];
    var t;
    if (da < 0) t = da / sg.len;
    else if (db > 0) t = 1 + db / sg.len;
    else t = da / (da - db || 1);
    var tc = t < 0 ? 0 : t > 1 ? 1 : t;
    var cx = T.x[a] + (T.x[b] - T.x[a]) * tc, cz = T.z[a] + (T.z[b] - T.z[a]) * tc;
    var fx = T.fx[a] + (T.fx[b] - T.fx[a]) * tc, fz = T.fz[a] + (T.fz[b] - T.fz[a]) * tc;
    var fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    var d = (x - cx) * fz + (z - cz) * -fx;
    var lw = T.lw[a] + (T.lw[b] - T.lw[a]) * tc, rw = T.rw[a] + (T.rw[b] - T.rw[a]) * tc;
    // Hermite theo độ dốc đã cho (Direction.y) → mặt đường liền C1
    var h = sg.len, t2 = tc * tc, t3 = t2 * tc;
    var ya = T.y[a], yb = T.y[b], ma = T.m[a] * h, mb = T.m[b] * h;
    var yg = (2 * t3 - 3 * t2 + 1) * ya + (t3 - 2 * t2 + tc) * ma + (-2 * t3 + 3 * t2) * yb + (t3 - t2) * mb;
    var dydt = (6 * t2 - 6 * tc) * ya + (3 * t2 - 4 * tc + 1) * ma + (-6 * t2 + 6 * tc) * yb + (3 * t2 - 2 * tc) * mb;
    var slope = dydt / h;
    var tOut = (t < 0 ? -t : t > 1 ? t - 1 : 0) * sg.len;
    var hw = (TD.TUNING && TD.TUNING.halfWidth) || 0, el = lw - hw, er = rw - hw;   // tâm xe phải cách mép nửa bề ngang xe
    var over = d > el ? d - el : -d > er ? -d - er : 0;
    var up = y - yg;   // xe trên mặt đường (bay) được nới; dưới mặt đường thì phạt nặng
    out.seg = sg.id; out.a = a; out.b = b; out.t = tc; out.tp = tc < 0.5 ? a : b;
    out.s = sg.sa + (sg.sb - sg.sa) * tc; out.d = d; out.y = yg; out.slope = slope;
    out.fx = fx; out.fz = fz; out.lw = lw; out.rw = rw;
    out.inside = tOut < 5 && over === 0 && up > -3 && up < 40;   // nới 5 m dọc ở chỗ gấp khúc
    out.score = tOut * 3 + over + (up < -1.5 ? (-up - 1.5) * 4 : up > 2.5 ? (up - 2.5) * 0.3 : 0);
    return out;
  }

  var tmp = {};
  function bestOf(T, ids, x, y, z, res) {
    var best = null, anyInside = false, bestSc = 0;
    for (var i = 0; i < ids.length; i++) {
      evalSeg(T, T.segs[ids[i]], x, y, z, tmp);
      // ưu tiên đoạn chứa xe; trong số đó lấy đoạn có |t| ngoài [0,1] nhỏ nhất
      var sc = tmp.inside ? -100 + tmp.score + Math.abs(y - tmp.y) * 0.5 : tmp.score;
      if (tmp.inside) anyInside = true;
      if (!best || sc < bestSc - 1e-9) { best = best || res; copy(tmp, best); bestSc = sc; }
    }
    if (best) best.inside = anyInside;
    return best;
  }
  function copy(s, d) { for (var k in s) d[k] = s[k]; }

  function locate(T, x, y, z, hint) {
    var res = {};
    var ok = hint != null && hint >= 0 && bestOf(T, T.near[hint], x, y, z, res);
    if (!ok || !ok.inside) {
      // ngoài các đoạn lân cận: thử cả ô lưới (nhánh tắt cạnh bên), chỉ nhận đoạn có s gần (không xuyên sang khúc khác của vòng)
      var ids = T.grid[Math.floor(x / CELL) + ',' + Math.floor(z / CELL)];
      if (ids && ok) {
        var s0 = ok.s;
        ids = ids.filter(function (id) {
          var ds = Math.abs(T.segs[id].sa - s0) % T.L;
          return Math.min(ds, T.L - ds) < 150;
        });
      }
      var g = ids && ids.length ? bestOf(T, ids, x, y, z, {}) : null;
      if (g && ok && g.inside) { res = g; }
      else if (g && (!ok || g.score < ok.score)) res = g;
      else if (!ok) res = bestOf(T, T.segs.map(function (s) { return s.id; }), x, y, z, {});
    }
    var nl = Math.sqrt(res.slope * res.slope + 1);
    res.normal = [-res.slope * res.fx / nl, 1 / nl, -res.slope * res.fz / nl];
    return res;
  }

  // Điểm hồi sinh: thuộc checkpoint đã qua (hoặc cha của nó), không vượt quá vị trí xe trên đường.
  function resetFor(T, k) {
    var cps = {}, best = null, bs = 1e18;
    cps[k.lastCp] = 1;
    (T.cps[k.lastCp].prev || []).forEach(function (c) { cps[c] = 1; });
    var sK = k.loc ? k.loc.s : 0;
    for (var i = 0; i < T.resets.length; i++) {
      var r = T.resets[i];
      var ds = r.s - sK;
      if (ds > T.L / 2) ds -= T.L; else if (ds < -T.L / 2) ds += T.L;
      var dist = Math.hypot(r.x - k.x, r.z - k.z);
      var sc = dist + (cps[r.cp] ? 0 : 500) + (ds > 2 ? 300 + ds : 0);
      if (sc < bs) { bs = sc; best = r; }
    }
    return best;
  }

  function lineNearest(T, x, y, z, hint) {
    var ln = T.line, n = ln.n, best = -1, bd = 1e18, i, j;
    if (hint != null && hint >= 0) {
      for (j = -4; j <= 24; j++) {
        i = (hint + j + n) % n;
        var d = (ln.x[i] - x) * (ln.x[i] - x) + (ln.z[i] - z) * (ln.z[i] - z) + (ln.y[i] - y) * (ln.y[i] - y) * 6;
        if (d < bd) { bd = d; best = i; }
      }
      if (bd < 900) return best;
    }
    for (i = 0; i < n; i++) {
      d = (ln.x[i] - x) * (ln.x[i] - x) + (ln.z[i] - z) * (ln.z[i] - z) + (ln.y[i] - y) * (ln.y[i] - y) * 6;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  TD.Track = {
    get: function (id) {
      var src = typeof id === 'string' ? TD.TRACKS[id] : id;
      if (!src) throw new Error('track not found: ' + id);
      return src._prep || (src._prep = prep(src));
    },
    locate: locate, resetFor: resetFor, lineNearest: lineNearest,
  };
})(typeof window !== 'undefined' ? window : globalThis);
