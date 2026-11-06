/* uma-flash.js — trình phát hoạt ảnh giao diện "flash" (A2U) của Uma Musume trên canvas.

   Dữ liệu `window.UMA_FL[tên]` sinh bởi _tools/build_uma_flash.py:
     tex  [W, H] cỡ ảnh mảnh; ảnh ở art/uma/fl/<tên>.png
     mesh tên mảnh → [x, y, w, h, xoay90, rộng hiện, cao hiện, lệch x, lệch y]   (y lệch theo Unity: lên là dương)
     root id motion gốc;  m  id → { n: tên, l: [[nhãn, t0, t1, nhãn kế]], o: [đối tượng] }
     đối tượng: k 'm' (motion con, ch = id) | 'p' (mặt phẳng dán mảnh, tx = [tên mảnh]) | 't' (chữ)
       t [t0, t1] lúc hiện;  p, po, r, sc, c (màu nhân), co (màu cộng), b (1 = cộng sáng)
       K khoá khung đã nướng 30 fps: 'p0', 'p1', 'r2', 'sc0', 'c3', 'co0', 'tx'... → [[giây, giá trị]]

   Mỗi motion con chạy đồng hồ RIÊNG, như movieclip của Flash: vào khung là bắt đầu từ nhãn đầu
   (nếu `rs`), hết nhãn thì theo `nhãn kế` (trùng tên = lặp), không có nhãn kế thì đứng ở khung cuối.
   Game gốc gọi nhãn cho từng lớp con bằng mã; ở đây là `phat(đường dẫn, nhãn)`.
*/
(function (G) {
  'use strict';

  var DATA = window.UMA_FL || {};
  var ROI = window.UMA_FL_ANH || {};
  var V = '20260925g';
  var anh = {};
  var EPS = 1e-4;

  function taiAnh(src) {
    if (!anh[src]) { var im = new Image(); im.src = src + '?v=' + V; anh[src] = im; }
    return anh[src];
  }
  G.anhFlRoi = function (ten) { return ROI[ten] ? taiAnh(ROI[ten]) : null; };

  /** giá trị khoá tại giây t, nội suy tuyến tính; khoá trùng giờ là bước nhảy */
  function khoa(ds, t) {
    if (t <= ds[0][0]) return ds[0][1];
    var n = ds.length;
    if (t >= ds[n - 1][0]) return ds[n - 1][1];
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ds[mid][0] <= t) lo = mid; else hi = mid; }
    var a = ds[lo], b = ds[hi], d = b[0] - a[0];
    return d > EPS ? a[1] + (b[1] - a[1]) * (t - a[0]) / d : b[1];
  }
  function gt(o, ten, macDinh, t) {
    var ds = o.K && o.K[ten];
    return ds && ds.length ? khoa(ds, t) : macDinh;
  }

  /* ── một phiên bản motion đang chạy ── */
  function Clip(fl, id) {
    this.fl = fl;
    this.d = fl.d.m[id];
    this.con = {};
    this.hien = {};
    this.xong = false;
    this.dai = 0;
    for (var i = 0; i < this.d.o.length; i++) this.dai = Math.max(this.dai, this.d.o[i].t[1]);
    this.vaoNhan(this.d.l.length ? this.d.l[0][0] : null);
  }
  Clip.prototype.vaoNhan = function (ten) {
    this.nhan = null; this.xong = false;
    for (var i = 0; i < this.d.l.length; i++) if (this.d.l[i][0] === ten) this.nhan = this.d.l[i];
    this.t = this.nhan ? this.nhan[1] : 0;
  };
  Clip.prototype.tien = function (dt) {
    if (this.xong) return;
    this.t += dt;
    var l = this.nhan;
    if (!l) {                                   /* không nhãn: lặp cả dòng thời gian */
      if (this.dai > EPS && this.t >= this.dai) this.t %= this.dai;
      return;
    }
    if (this.t < l[2] - EPS) return;
    if (!l[3]) { this.t = l[2] - 0.5 / this.fl.d.fps; this.xong = true; return; }   /* đứng giữa khung cuối */
    var du = this.t - l[2];
    this.vaoNhan(l[3]);
    if (this.nhan) {
      var len = this.nhan[2] - this.nhan[1];
      this.t = this.nhan[1] + (len > EPS ? du % len : 0);
    }
  };
  Clip.prototype.conCua = function (o) {
    var c = this.con[o.n];
    if (!c && o.ch && this.fl.d.m[o.ch]) c = this.con[o.n] = new Clip(this.fl, o.ch);
    return c;
  };

  function argb(u, a) {
    return 'rgba(' + ((u >>> 16) & 255) + ',' + ((u >>> 8) & 255) + ',' + (u & 255) + ',' + (((u >>> 24) & 255) / 255 * a).toFixed(3) + ')';
  }

  /* `to` = đang ở trong lớp `clr_*`: bản chữ nằm dưới mà game gốc tô màu lúc chạy (màu đế nút) */
  Clip.prototype.ve = function (ctx, dt, alpha, sang, to) {
    this.tien(dt);
    var t = this.t, ds = this.d.o, fl = this.fl;
    /* danh sách lớp kiểu Flash: chỉ số nhỏ là lớp TRÊN, nên vẽ từ cuối lên */
    for (var i = ds.length - 1; i >= 0; i--) {
      var o = ds[i];
      var thay = t >= o.t[0] - EPS && t < o.t[1] - EPS;       /* mốc cuối loại trừ, như khung Flash */
      if (!thay) { this.hien[o.n] = false; continue; }
      if (o.k === 'm' && !this.hien[o.n] && o.rs && this.con[o.n] && !this.con[o.n].giu) {
        this.con[o.n].vaoNhan(this.con[o.n].d.l.length ? this.con[o.n].d.l[0][0] : null);
      }
      this.hien[o.n] = true;
      var a = alpha * gt(o, 'c3', o.c[3], t);
      if (a <= 0.004) continue;
      var s2 = sang + gt(o, 'co0', o.co[0], t);
      ctx.save();
      ctx.translate(gt(o, 'p0', o.p[0], t) + gt(o, 'po0', o.po[0], t), -(gt(o, 'p1', o.p[1], t) + gt(o, 'po1', o.po[1], t)));
      var r = gt(o, 'r2', o.r, t);
      if (r) ctx.rotate(-r * Math.PI / 180);
      var sx = gt(o, 'sc0', o.sc[0], t), sy = gt(o, 'sc1', o.sc[1], t);
      if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
      if (o.b === 1) ctx.globalCompositeOperation = 'lighter';
      if (o.k === 'm') {
        var c = this.conCua(o);
        if (c) c.ve(ctx, dt, a, s2, to || o.n.indexOf('clr_') === 0);
      } else if (o.k === 'p') {
        var idx = Math.round(gt(o, 'tx', 0, t));
        veMieng(ctx, fl, o.tx[Math.min(idx, o.tx.length - 1)], o, a, s2);
      } else if (o.k === 't') {
        veChu(ctx, fl, o, a, to);
      }
      ctx.restore();
    }
  };

  function veMieng(ctx, fl, ten, o, a, sang) {
    var m = fl.d.mesh[ten];
    if (!m) return;
    var W = o.s[0] || m[5], H = o.s[1] || m[6];
    var kx = m[5] ? W / m[5] : 1, ky = m[6] ? H / m[6] : 1;
    /* "lệch" là điểm neo đo từ góc TRÊN-TRÁI của mảnh (y Unity, lên là dương): tâm mảnh nằm ở
       (w/2 − lệch x, h/2 + lệch y) so với neo. Ô `dum_*` thì neo ở tâm. */
    var gia = ten.indexOf('dum_') === 0;
    var cx = gia ? 0 : (m[5] / 2 - m[7]) * kx, cy = gia ? 0 : (m[6] / 2 + m[8]) * ky;
    var nhet = fl.nhet[ten];
    ctx.globalAlpha = a;
    if (nhet) {
      if (typeof nhet === 'function') nhet(ctx, cx, cy, W, H);
      else if (nhet.complete && nhet.naturalWidth) {
        /* chỗ trống `dum_*` là ô 16×16 mà khung cha đã phóng lên đúng cỡ: ảnh nhét vừa khít ô */
        var k = Math.min(W / nhet.naturalWidth, H / nhet.naturalHeight) * (fl.coNhet[ten] || 1);
        ctx.drawImage(nhet, cx - nhet.naturalWidth * k / 2, cy - nhet.naturalHeight * k / 2, nhet.naturalWidth * k, nhet.naturalHeight * k);
      }
      return;
    }
    if (ten.indexOf('dum_') === 0) return;           /* chỗ trống chưa ai nhét: bỏ, đừng vẽ ô vuông giữ chỗ */
    var im = fl.im;
    if (!im.complete || !im.naturalWidth) return;
    var ve = function () {
      if (m[4]) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 2);
        ctx.drawImage(im, m[0], m[1], m[2], m[3], -H / 2, -W / 2, H, W);
        ctx.restore();
      } else ctx.drawImage(im, m[0], m[1], m[2], m[3], cx - W / 2, cy - H / 2, W, H);
    };
    ve();
    if (sang > 0.01) {                               /* màu cộng: loé trắng */
      var cu = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * Math.min(1, sang);
      ve();
      ctx.globalCompositeOperation = cu;
    }
  }

  function veChu(ctx, fl, o, a, to) {
    var x = o.txt, s = fl.chuDoi[o.n] != null ? fl.chuDoi[o.n] : x.s;
    if (!s) return;
    ctx.globalAlpha = a;
    ctx.font = '900 ' + x.f + 'px "M PLUS Rounded 1c", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = x.a === 0 ? 'left' : x.a === 2 ? 'right' : 'center';
    ctx.textBaseline = 'middle';
    /* điểm neo của ô chữ là TÂM ô (cỡ `s`): canh trái / phải thì chữ bắt đầu ở mép ô */
    var x0 = x.a === 0 ? -o.s[0] / 2 : x.a === 2 ? o.s[0] / 2 : 0;
    ctx.translate(x0, 0);
    /* Chữ có độ dày viền (`dv`) là chữ game gốc tô màu lúc chạy theo `fl.mau`: lớp trên trắng viền
       màu, lớp `clr_` nằm dưới đặc màu. Chữ khác giữ màu trong dữ liệu. */
    var tu = fl.mau && x.dv;
    var vien = tu ? fl.mau : (((x.vien >>> 24) & 255) > 0 ? argb(x.vien, 1) : null);
    if (vien) {
      ctx.lineJoin = 'round'; ctx.lineWidth = x.dv ? x.dv * 2 + 2 : Math.max(3, x.f * 0.18);
      ctx.strokeStyle = vien; ctx.strokeText(s, 0, 0);
    }
    ctx.fillStyle = tu && to ? fl.mau : argb(x.mau, 1);
    ctx.fillText(s, 0, 0);
  }

  /** Một hoạt ảnh Uma. `ten` là khoá trong UMA_FL (nut_tap, the_luc, dem_luot...). */
  G.flUma = function (ten) {
    var d = DATA[ten];
    if (!d) return null;
    var fl = { d: d, im: taiAnh('art/uma/fl/' + ten + '.png'), nhet: {}, coNhet: {}, chuDoi: {} };
    fl.goc = new Clip(fl, d.root);

    /** đi theo đường dẫn tên đối tượng 'a/b/c' từ gốc; tạo phiên bản con nếu chưa có */
    function tim(duong) {
      var c = fl.goc;
      if (!duong) return c;
      var ds = duong.split('/');
      for (var i = 0; i < ds.length && c; i++) {
        var o = null;
        for (var j = 0; j < c.d.o.length; j++) if (c.d.o[j].n === ds[i]) o = c.d.o[j];
        c = o ? c.conCua(o) : null;
      }
      return c;
    }
    fl.tim = tim;
    /** chơi nhãn `nhan` ở đối tượng theo đường dẫn; `giu` = không cho khung cha tự đặt lại */
    fl.phat = function (duong, nhan) {
      var c = tim(duong);
      if (c) { c.vaoNhan(nhan); c.giu = true; }
      return !!c;
    };
    fl.xong = function (duong) { var c = tim(duong); return !c || c.xong; };
    fl.nhanDang = function (duong) { var c = tim(duong); return c && c.nhan ? c.nhan[0] : null; };
    /** nhét ảnh hoặc hàm vẽ (ctx, cx, cy, w, h) vào chỗ trống `dum_*` (hay bất kỳ mảnh nào) */
    fl.dat = function (mieng, gtri, co) { fl.nhet[mieng] = gtri; if (co) fl.coNhet[mieng] = co; };
    fl.chu = function (tenDoiTuong, s) { fl.chuDoi[tenDoiTuong] = s; };
    /** vẽ tại (x, y) — toạ độ gốc của prefab (màn Uma 1080×1920) — với hệ số k, rồi tiến đồng hồ dt giây */
    fl.ve = function (ctx, x, y, k, dt) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);
      ctx.imageSmoothingEnabled = true;
      fl.goc.ve(ctx, dt, 1, 0, false);
      ctx.restore();
    };
    return fl;
  };

  G.FL_TEN = Object.keys(DATA);

})(window);
