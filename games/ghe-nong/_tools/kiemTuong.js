/* kiemTuong.js — bản đồ TFM2 có tường thật: soát không ai đi xuyên tường, không ai kẹt.
 *
 *   SO_TRAN=20 node _tools/soiAI-node.js _tools/kiemTuong.js
 *
 * Mỗi tick, mỗi người còn sống:
 *   trenTuong   đứng trên ô tường (phải là 0)
 *   xuyen       đoạn đi trong tick này lún quá 4 đơn vị vào một ô tường (phải là 0; lunMax
 *               là độ lún lớn nhất gặp được — sượt đỉnh góc thì vài phần đơn vị, không nhìn thấy)
 *   ket         đứng yên quá 6 giây trong khi mục tiêu di chuyển còn cách hơn 60 (kẹt góc tường)
 * Kèm thời gian chạy mỗi trận, để biết tìm đường có làm chậm bộ đo không.
 */
(function () {
  'use strict';
  var G = window;
  var SO_TRAN = (typeof process !== 'undefined' && process.env && +process.env.SO_TRAN) || 10;

  function doi(ten, lech) {
    return {
      ten: ten, mau: '#fff', chienThuat: {}, heso: { ds: [], rieng: null },
      nguoi: ['tren', 'rung', 'giua', 'duoi', 'ho'].map(function (vt, i) {
        var t = G.TUONG.filter(function (x) { return x.vt === vt; });
        return { vt: vt, tuongId: t[(i + lech) % t.length].id, tt: 'SR', ten: ten + (i + 1),
          chat: [['fight', 'farm', 'gank', 'thu', 'le'][(i + lech) % 5]], ego: 45 + (i * 7 + lech * 3) % 40,
          cs: { co: 620, ben: 580, luc: 600, li: 540, nao: 620 } };
      })
    };
  }

  var R = { tran: 0, tick: 0, trenTuong: 0, xuyen: 0, lunMax: 0, ket: 0, msMoiTran: 0, viDu: [] };
  if (!G.SIM_CHAN) return { loi: 'sim chưa có G.SIM_CHAN' };
  for (var s = 0; s < SO_TRAN; s++) {
    var tran = G.taoTran({ ta: doi('A', s), dich: doi('B', s + 2) }, 5000 + s * 31);
    var cu = tran.nguoi.map(function (n) { return { x: n.x, y: n.y, dung: 0 }; });
    var t0 = Date.now();
    while (!tran.xong && tran.t < 3600) {
      G.tickTran(tran);
      R.tick++;
      tran.nguoi.forEach(function (n, i) {
        var c = cu[i];
        if (n.chet > 0) { c.x = n.x; c.y = n.y; c.dung = 0; return; }
        if (G.SIM_CHAN(n.x, n.y)) { R.trenTuong++; if (R.viDu.length < 5) R.viDu.push('trên tường ' + n.ten + ' ' + n.x.toFixed(0) + ',' + n.y.toFixed(0)); }
        var d = Math.hypot(n.x - c.x, n.y - c.y);
        if (d > 1 && d <= 1.36 * 0.25 * 110) {       /* một bước; tick có hai bước (đi + rút) thì đường nối đầu–cuối có thể cắt góc dù đường thật không */
          var lun = 0;
          for (var k = 1; k < 16; k++) {
            var sx = c.x + (n.x - c.x) * k / 16, sy = c.y + (n.y - c.y) * k / 16;
            if (G.SIM_CHAN(sx, sy)) {
              /* độ lún: khoảng từ điểm mẫu tới mép gần nhất của ô tường nó đang nằm trong */
              var O = 1000 / 30, fx = sx - Math.floor(sx / O) * O, fy = sy - Math.floor(sy / O) * O;
              lun = Math.max(lun, Math.min(fx, O - fx, fy, O - fy));
            }
          }
          if (lun > 0) R.lunMax = Math.max(R.lunMax, lun);
          if (lun > 4) {
            R.xuyen++;
            if (R.viDu.length < 5) R.viDu.push('xuyên ' + n.ten + ' ' + c.x.toFixed(0) + ',' + c.y.toFixed(0) + '→' + n.x.toFixed(0) + ',' + n.y.toFixed(0));
          }
        }
        var mt = n.mucTieu;
        if (d < 0.5 && mt && mt.x != null && Math.hypot(mt.x - n.x, mt.y - n.y) > 60 && tran.t - n.danhLuc > 2) c.dung += 0.25;
        else c.dung = 0;
        if (c.dung === 6) { R.ket++; if (R.viDu.length < 5) R.viDu.push('kẹt ' + n.ten + ' ' + n.x.toFixed(0) + ',' + n.y.toFixed(0) + ' muốn tới ' + mt.x.toFixed(0) + ',' + mt.y.toFixed(0) + ' (' + mt.loai + ', tầm ' + G.tuongOCap(n.tuong, 1).tam + ')'); }
        c.x = n.x; c.y = n.y;
      });
    }
    R.msMoiTran += Date.now() - t0;
    R.tran++;
  }
  R.msMoiTran = Math.round(R.msMoiTran / R.tran);
  return R;
})()
