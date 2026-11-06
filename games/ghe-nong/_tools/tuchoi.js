/* tuchoi.js — kịch bản TỰ CHƠI HẾT MỘT MÙA, chạy bên trong trang.
 *
 *   node _tools/lai.js "<url>" ra.png 6 --dofile=_tools/tuchoi.js
 *
 * Vì sao cần: mở từng màn bằng `#hash` chỉ chứng minh màn đó vẽ được. Cái hay hỏng là chỗ NỐI
 * giữa các màn — tập xong có sang giải không, thua giải có hỏi vé cứu không, hết giải có quay
 * lại phòng tập không. Chỉ có chơi thẳng một mùa mới lộ ra.
 *
 * Cách làm: cứ 110ms nhìn xem màn nào đang mở rồi bấm đúng một nút, y như người chơi lười nhất:
 *   hộp thoại → nút chính · phòng tập → chạm sân hai lần (hết sức thì Nghỉ) ·
 *   cấm chọn → "Giao cho trợ lý" · chiến thuật → "BẮT ĐẦU TRẬN" · trận → "Xem kết quả luôn".
 *
 * Trả về một bản tường trình: đi qua những màn nào, mấy lượt, mấy trận, và MỌI lỗi bắt được.
 */
(function () {
  'use strict';
  var G = window;
  var loi = [], duong = [], moc = [];
  var luotDaTap = 0, tranDaXem = 0, hopDaBam = 0, banBam = 0;
  var manTruoc = '', hetMua = false, batDau = Date.now();
  var HAN = 240000;            /* 4 phút là quá dư cho một mùa 24 lượt */

  window.addEventListener('error', function (e) { loi.push('lỗi: ' + (e.message || e)); });
  window.addEventListener('unhandledrejection', function (e) {
    loi.push('promise: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason));
  });

  var MAN = ['man-tai', 'man-clb', 'man-ca', 'man-draft', 'man-chienthuat', 'man-tran', 'man-gacha'];
  function hien(id) { var e = document.getElementById(id); return !!(e && !e.hidden); }
  function manNao() { for (var i = 0; i < MAN.length; i++) if (hien(MAN[i])) return MAN[i]; return '?'; }
  function nut(goc, re) {
    return G.$$('button', goc).filter(function (b) { return !b.disabled && re.test(b.textContent); })[0];
  }
  function bam(e) { if (e) { e.click(); return true; } return false; }

  /* Vào một run qua ĐÚNG bốn bước như người chơi: thể thức → huấn luyện viên → cựu HLV
     → đội hình, mỗi bước bấm nút đi tiếp ở chân. Không gọi thẳng hàm trong closure —
     có vậy mới kiểm được luôn cả luồng vào ca.

     Hai lần trước bộ dò này chết lặng vì dò theo hình thức chứ không theo cấu trúc:
     lần đầu dò `style*="cursor:pointer"`, lần sau dò `.uc-the.bam` trong một trang
     không còn tồn tại. Giờ dò theo CHÂN BƯỚC (`#clb-career button`) — cái luôn có
     mặt suốt cả luồng — và có `chonDoiXong()` để biết mình đã tới đích chưa. */
  function nutTiep() {
    var ns = G.$$('#clb-career button');
    return ns.length ? ns[ns.length - 1] : null;
  }

  function chonDoiXong() {
    return G.$$('.uc-oform-o').length > 0 &&
      G.$$('.uc-oform-o:not(.trong)').length === 5;
  }

  function diLuong() {
    /* chưa ở trong luồng thì mở nút VÀO CA */
    if (!G.$('.uc-buoc-dau')) return bam(G.$('.uc-career-nut'));
    /* bước "đội hình": bấm Tự chọn cho đủ năm vị trí rồi mới đi tiếp */
    if (G.$$('.uc-oform-o').length && !chonDoiXong()) {
      return bam(G.$$('#clb-giua button').filter(function (x) {
        return /Tự chọn/.test(x.textContent);
      })[0]);
    }
    var t = nutTiep();
    if (t && !t.classList.contains('tat')) return bam(t);
    return false;
  }

  function buoc() {
    var m = manNao();
    if (m !== manTruoc) { duong.push(m); manTruoc = m; }

    /* băng thông báo lớn đang chạy thì đứng yên, đừng bấm chồng lên */
    var bn = document.getElementById('banner-lon');
    if (bn && !bn.hidden) { banBam++; return; }

    if (hien('lop-phu')) {
      var dau = (G.$('#lop-phu .hop-dau') || {}).textContent || '(không tên)';
      if (moc.indexOf(dau) < 0) moc.push(dau);
      if (/Kết mùa/.test(dau)) hetMua = true;
      hopDaBam++;
      /* nút chính, nếu không có thì nút đầu — nhưng KHÔNG bao giờ bấm nút đỏ (bỏ ca / xoá lưu) */
      /* hộp thoại sự kiện đặt lựa chọn trong THÂN hộp chứ không phải chân hộp — quét cả hộp */
      var ds = G.$$('#lop-phu button').filter(function (b) { return !b.classList.contains('do'); });
      var c = ds.filter(function (b) { return b.classList.contains('chinh'); })[0] || ds[0];
      bam(c);
      return;
    }

    if (m === 'man-tran') { if (bam(nut(document.getElementById('man-tran'), /kết quả luôn/i))) tranDaXem++; return; }
    if (m === 'man-chienthuat') { bam(nut(document.getElementById('man-chienthuat'), /BẮT ĐẦU TRẬN/)); return; }
    if (m === 'man-draft') { bam(nut(document.getElementById('man-draft'), /trợ lý/)); return; }

    if (m === 'man-ca') {
      var so = (G.$('#ca-luc-so') || {}).textContent || '0/100';
      var luc = parseInt(so.split('/')[0], 10) || 0;
      /* Màn trong run có HAI LỚP nút, đúng như Uma: sáu nút chính, bấm "Tập" mới hiện
         năm sân. Kịch bản phải mở lớp sân trước, không thì `#hang-san` đang `hidden`
         và mọi cú bấm rơi vào hư không mà không báo lỗi gì. */
      if (luc < 32) {
        bam(G.$('#hang-viec .uma-nut.v-nghi') || G.$('#hang-viec .uma-nut.v-xahoi'));
        return;
      }
      var hs = document.getElementById('hang-san');
      if (!hs || hs.hidden) { bam(G.$('#hang-viec .uma-nut.v-tap')); return; }
      var san = G.$$('#hang-san .uma-nut.san');
      if (!san.length) return;
      /* Chọn giáo án như một người biết chơi: điểm = tổng chỉ số ăn được × (1 − tỉ lệ hỏng).
         Đọc thẳng bằng G.xemTruoc trên ca đang chạy, thay vì đoán qua chữ trên màn hình. */
      var i = 0;
      var ca = G.S && G.S.ca;
      if (ca && ca.rng && G.xemTruoc) {
        var tot = -1;
        for (var s2 = 0; s2 < 5; s2++) {
          try {
            var xt = G.xemTruoc(ca, s2);
            var t2 = 0;
            for (var q = 0; q < 5; q++) t2 += xt.an[q] || 0;
            var d2 = t2 * (1 - xt.hong / 100);
            if (d2 > tot) { tot = d2; i = s2; }
          } catch (e) { /* ca chưa sẵn thì cứ lấy sân đầu */ }
        }
      } else {
        i = (luotDaTap + Math.floor(luotDaTap / 5)) % san.length;
      }
      san[i].click();                                                  /* lần 1: xem trước */
      var lai = G.$$('#hang-san .uma-nut.san')[i];
      if (lai) { lai.click(); luotDaTap++; }                           /* lần 2: tập thật */
      return;
    }

    if (m === 'man-clb') { diLuong(); return; }
  }

  return new Promise(function (xong) {
    var id = setInterval(function () {
      var qua = Date.now() - batDau;
      try { buoc(); } catch (e) { loi.push('kịch bản: ' + (e.stack || e.message || e)); }
      if (hetMua || qua > HAN) {
        clearInterval(id);
        xong({
          hetMua: hetMua, giay: Math.round(qua / 1000),
          luotDaTap: luotDaTap, tranDaXem: tranDaXem, hopDaBam: hopDaBam,
          manCuoi: manNao(),
          duong: duong.join(' → '),
          moc: moc,
          loi: Array.from(new Set(loi)).slice(0, 15)
        });
      }
    }, 110);
  });
})()
