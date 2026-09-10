/* duongcong.js — ĐO đường cong chỉ số của một ca, chạy trong trang, không đụng giao diện.
 *
 *   node _tools/lai.js "<url>" ra.png 6 --dofile=_tools/duongcong.js
 *
 * Vì sao có tệp này: lần tự chơi đầu tiên trên Pages, đội thua ngay giải đầu ở lượt 5 và mùa
 * dừng luôn. Nghi là chỉ số nền của đội máy (`suc` trong data-giai.js) đặt quá cao so với chỗ
 * người chơi thật sự tới được ở lượt đó. Nghi thì phải ĐO.
 *
 * Đo ba lối chơi để có cả trần lẫn sàn:
 *   dồn  — luôn bám hai giáo án mạnh nhất (người chơi biết chơi)
 *   tham — lượt nào ăn nhiều nhất thì tập lượt đó (người chơi bình thường)
 *   đều  — xoay vòng cả năm giáo án (người chơi không biết gì)
 *
 * In ra: chỉ số trung bình ở đúng những lượt có giải, `suc` của đối thủ lượt đó, và tỉ lệ
 * ta/địch. Muốn giải đầu dễ và chung kết khó thì tỉ lệ phải đi từ ~1.6 xuống ~0.9.
 */
(function () {
  'use strict';
  var G = window;
  var SO_CA = 24;

  function doiHinh() {
    var can = { tren: 0, rung: 0, giua: 0, duoi: 0, ho: 0 }, tt = [];
    G.S.khoTT.forEach(function (b) {
      var g = G.TUYENTHU_THEO_ID[b.id];
      if (g && !can[g.vt]) { can[g.vt] = 1; tt.push(b.id); }
    });
    return tt.length === 5 ? tt : null;
  }

  /** điểm của một giáo án: tổng chỉ số ăn được, trừ hao vì hỏng */
  function diem(ca, s) {
    var xt = G.xemTruoc(ca, s), t = 0;
    for (var i = 0; i < 5; i++) t += xt.an[i] || 0;
    return t * (1 - xt.hong / 100);
  }

  function choi(loi, hat, ghi) {
    var tt = doiHinh(); if (!tt) return null;
    var ca = G.moCa(G.S.khoHLV[0].id, tt, [], hat);
    var uu = [0, 2];                       /* "dồn": CƠ và LỰC */
    for (var l = 0; l < ca.soLuot; l++) {
      var viec = { loai: 'nghi' };
      if (ca.theluc >= 30) {
        var s = 0;
        if (loi === 'don') {
          s = diem(ca, uu[0]) >= diem(ca, uu[1]) ? uu[0] : uu[1];
        } else if (loi === 'deu') {
          s = l % 5;
        } else {
          var tot = -1;
          for (var k = 0; k < 5; k++) { var d = diem(ca, k); if (d > tot) { tot = d; s = k; } }
        }
        viec = { loai: 'tap', san: s };
      }
      G.lamViec(ca, viec);
      ghi(ca.luot, ca.chiso);
      G.sangLuot(ca);
    }
    return ca;
  }

  function tb(m) { return m.length ? Math.round(m.reduce(function (a, b) { return a + b; }, 0) / m.length) : 0; }

  var ra = { loi: {} };
  ['don', 'tham', 'deu'].forEach(function (loi) {
    var theoLuot = [], cuoi = [];
    for (var n = 0; n < SO_CA; n++) {
      choi(loi, 4000 + n * 53, function (luot, cs) {
        var t = 0; for (var i = 0; i < 5; i++) t += cs[i];
        (theoLuot[luot] = theoLuot[luot] || []).push(t / 5);
        if (luot === G.SO_LUOT) cuoi.push(cs.slice().sort(function (a, b) { return b - a; }));
      });
    }
    var bang = [];
    G.LICH.forEach(function (l, i) {
      if (!l.giai) return;
      var suc = G.NHOM_DOI[l.giai.doi].map(function (id) { return G.DOI_THEO_ID[id].suc; });
      var d = Math.round(suc.reduce(function (a, b) { return a + b; }, 0) / suc.length);
      var t = tb(theoLuot[i + 1] || []);
      bang.push(l.giai.ten.slice(0, 22) + ' L' + (i + 1) + ': ta ' + t + ' / địch ' + d + ' = ' + (t / d).toFixed(2));
    });
    /* chỉ số cao nhất và hạng chữ của nó ở cuối mùa */
    var cao = tb(cuoi.map(function (c) { return c[0]; }));
    var hai = tb(cuoi.map(function (c) { return c[1]; }));
    var thap = tb(cuoi.map(function (c) { return c[4]; }));
    ra.loi[loi] = { bang: bang, cuoiCao: cao + ' (' + G.hangChu(cao) + ')',
      cuoiHai: hai + ' (' + G.hangChu(hai) + ')', cuoiThap: thap + ' (' + G.hangChu(thap) + ')' };
  });
  return ra;
})()
