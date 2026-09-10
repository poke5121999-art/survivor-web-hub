/* tileThang.js — ĐO tỉ lệ thắng của người chơi ở TỪNG GIẢI trong mùa.
 *
 *   node _tools/lai.js "file:///.../index.html" ra.png 5 --dofile=_tools/tileThang.js
 *
 * `canbang.js` đo tướng nào mạnh hơn tướng nào (trận cân sức). Tệp này đo thứ khác hẳn:
 * **người chơi có qua nổi giải đó không** — tức là `suc` của đội máy trong `data-giai.js` đặt
 * đúng chưa. Không có số này thì mọi câu "game vừa sức" đều là nói mò.
 *
 * Cách đo: nuôi một ca tới đúng lượt có giải bằng lối chơi cho trước, dựng đội máy y như lúc
 * chơi thật (`G._thu`), mỗi bên tự lấy tướng thông thạo nhất theo vị trí, rồi chạy trận không vẽ.
 * Thể thức Bo1/Bo3/Bo5 tính đúng luật.
 *
 * Đích nhắm: vòng bảng 75–85%, play-off ~60%, chung kết quốc nội ~75%, CKTG tứ/bán 43–53%,
 * tranh vé ~25%, CHUNG KẾT THẾ GIỚI ~20%. Cửa ải cuối phải khó, nhưng thua ngay giải đầu thì
 * không ai chơi tiếp.
 *
 * Hai chỗ dễ đọc sai con số này:
 *   1. Bộ đo cho NGƯỜI CHƠI pick trước, đội máy lấy phần còn lại. Nên cân lại chỉ số tướng
 *      làm lệch luôn cả bảng này: buff một con người chơi không hay lấy = buff cho đội máy.
 *      Cân tướng thì đo lại bằng canbang.js, còn độ khó mùa giải thì chỉnh ở THEO_BAC
 *      (js/giai.js) và `suc` của nhóm đội (js/data-giai.js), đừng chỉnh chỉ số tướng.
 *   2. Bộ đo dùng HẠT GIỐNG CỐ ĐỊNH nên hai lần chạy ra y hệt nhau. Số không nhảy KHÔNG
 *      có nghĩa là nó chính xác — 40 giải Bo5 vẫn là mẫu nhỏ; lệch 5% thì đừng vội sửa.
 */
(function () {
  'use strict';
  var G = window;
  /* Tắt phần giải đấu của 24 đội máy: nó rút số từ `ca.rng` nên làm lệch chuỗi ngẫu nhiên
     của phần huấn luyện, và ghi bản tin vào bản lưu cả trăm lần trong một lần đo. */
  G.vongDoiMay = null;
  var SO_LAN = 40;                 /* mỗi giải chạy ngần này lần */
  var LOI = 'tham';                /* lối chơi giả lập: xem duongcong.js */
  var VT = ['tren', 'rung', 'giua', 'duoi', 'ho'];

  function doiHinh() {
    var can = { tren: 0, rung: 0, giua: 0, duoi: 0, ho: 0 }, tt = [];
    G.S.khoTT.forEach(function (b) {
      var g = G.TUYENTHU_THEO_ID[b.id];
      if (g && !can[g.vt]) { can[g.vt] = 1; tt.push(b.id); }
    });
    return tt.length === 5 ? tt : null;
  }

  function diem(ca, s) {
    var xt = G.xemTruoc(ca, s), t = 0;
    for (var i = 0; i < 5; i++) t += xt.an[i] || 0;
    return t * (1 - xt.hong / 100);
  }

  /** nuôi một ca tới hết lượt `denLuot` rồi trả về */
  function nuoi(hat, denLuot) {
    var tt = doiHinh(); if (!tt) return null;
    var ca = G.moCa(G.S.khoHLV[0].id, tt, [], hat);
    while (ca.luot <= denLuot) {
      var viec = { loai: 'nghi' };
      if (ca.theluc >= 30) {
        var s = 0, tot = -1;
        for (var k = 0; k < 5; k++) { var d = diem(ca, k); if (d > tot) { tot = d; s = k; } }
        viec = { loai: 'tap', san: LOI === 'deu' ? (ca.luot % 5) : s };
      }
      G.lamViec(ca, viec);
      G.sangLuot(ca);
    }
    return ca;
  }

  /** mỗi bên tự lấy tướng mình thạo nhất ở vị trí đó, không trùng tướng trong một ván */
  function tuPick(ca, doiMay) {
    var lay = {}, pick = { ta: {}, dich: {} };
    var bac = { UR: 4, SSR: 3, SR: 2, R: 1, N: 0 };
    VT.forEach(function (vt) {
      var id = ca.tt.filter(function (x) { return G.TUYENTHU_THEO_ID[x].vt === vt; })[0];
      var b = G.coTT(id) || {};
      var ds = G.tuongTheoViTri(vt).filter(function (t) { return !lay[t.id]; });
      ds.sort(function (a, c) { return (bac[G.thongThao(b, c.id)] || 0) - (bac[G.thongThao(b, a.id)] || 0); });
      pick.ta[vt] = ds[0].id; lay[ds[0].id] = 1;
    });
    VT.forEach(function (vt) {
      var n = doiMay.nguoi.filter(function (x) { return x.vt === vt; })[0];
      var ds = G.tuongTheoViTri(vt).filter(function (t) { return !lay[t.id]; });
      ds.sort(function (a, c) { return (bac[n.tt[c.id] || 'N'] || 0) - (bac[n.tt[a.id] || 'N'] || 0); });
      pick.dich[vt] = ds[0].id; lay[ds[0].id] = 1;
    });
    return pick;
  }

  function motVan(ca, doiMay, giai, hat) {
    var pick = tuPick(ca, doiMay);
    var cau = {
      ta: G._thu.cauHinhTa(ca, giai, pick),
      dich: G._thu.cauHinhDich(doiMay, pick, giai),
      nhip: giai.nhip
    };
    cau.ta.chienThuat = { rong: 'tuy', rung: 'gank', mucTieu: 'poke' };
    var tr = G.taoTran(cau, hat);
    var kq = G.chayHet(tr);
    return kq && kq.thang === 'xanh';
  }

  var ra = [];
  G.LICH.forEach(function (l, i) {
    if (!l.giai) return;
    var giai = l.giai;
    var canThang = giai.the === 'Bo5' ? 3 : giai.the === 'Bo3' ? 2 : 1;
    var thang = 0, phut = 0, van = 0;
    for (var n = 0; n < SO_LAN; n++) {
      var ca = nuoi(7000 + n * 91, i + 1);
      if (!ca) return;
      var doiMay = G._thu.taoDoiMay(ca, giai);
      var a = 0, b = 0, v = 0;
      while (a < canThang && b < canThang) {
        if (motVan(ca, doiMay, giai, (11 + n * 7 + v * 13) & 0x7fffffff)) a++; else b++;
        v++; van++;
      }
      if (a > b) thang++;
    }
    ra.push(giai.ten.slice(0, 24) + ' (' + giai.the + ', ' + giai.doi + ') → thắng ' +
      Math.round(thang / SO_LAN * 100) + '%  · ' + (van / SO_LAN).toFixed(1) + ' ván/giải');
  });
  return { soLan: SO_LAN, loi: LOI, ra: ra };
})()
