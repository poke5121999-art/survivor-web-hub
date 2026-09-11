/* sprites.js — nạp atlas và vẽ.

   LUẬT: trong code không có tên tệp ảnh nào, chỉ có khoá kiểu 'tuong.kiemsi'. Bảng tra nằm ở
   art/asset-map.js (sinh tự động bằng _tools/build_art.py). Thiếu ảnh thì mọi hàm vẽ trả về
   false và phần gọi tự vẽ hình học thay thế — game không bao giờ vỡ vì thiếu art.
*/
(function (G) {
  'use strict';

  var MAP = window.ART_MAP || null;
  var ANH = {};
  var xong = 0, can = 0;

  G.ART = { sanSang: false };

  G.taiArt = function (cb) {
    if (!MAP) { if (cb) cb(false); return; }
    var ds = ['tuong', 'nguoi', 'quai', 'fx', 'dan', 'tru', 'do', 'vukhi'];
    can = ds.length;
    ds.forEach(function (t) {
      var im = new Image();
      im.onload = function () { ANH[t] = im; if (++xong >= can) { G.ART.sanSang = true; if (cb) cb(true); } };
      im.onerror = function () { if (++xong >= can) { G.ART.sanSang = true; if (cb) cb(true); } };
      im.src = 'art/' + t + '.png?v=20260912a';
    });
  };

  function o() { return (MAP && MAP._o) || 64; }

  /** vẽ một ô atlas, canh ĐÁY-GIỮA tại (x, y), cao mong muốn caoMuon px */
  function veO(ctx, bang, cot, hang, x, y, caoMuon, lat) {
    var im = ANH[bang];
    if (!im || !im.width) return false;
    var O = o();
    var k = caoMuon / O;
    var w = O * k, h = O * k;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (lat) {
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(im, cot * O, hang * O, O, O, -w / 2, -h, w, h);
    } else {
      ctx.drawImage(im, cot * O, hang * O, O, O, x - w / 2, y - h, w, h);
    }
    ctx.restore();
    return true;
  }

  /** tướng trong trận: idTuong, toạ độ CHÂN, chiều cao, khung hoạt ảnh, có lật ngang không */
  G.veTuong = function (ctx, id, x, y, cao, khung, lat) {
    if (!MAP || !MAP.tuong || !MAP.tuong[id]) return false;
    var m = MAP.tuong[id];
    var n = m[1] || 1;
    return veO(ctx, 'tuong', m[0], (khung | 0) % n, x, y, cao || 34, lat);
  };

  G.veQuai = function (ctx, id, x, y, cao, khung) {
    if (!MAP || !MAP.quai || !MAP.quai[id]) return false;
    var m = MAP.quai[id];
    return veO(ctx, 'quai', m[0], (khung | 0) % (m[1] || 1), x, y, cao || 26, false);
  };

  /** vẽ một ô atlas canh TÂM tại (x, y) — hiệu ứng, đạn, icon: thứ không đứng trên đất.
      `goc` (radian) thì xoay quanh tâm, dùng cho viên đạn bay theo hướng. */
  function veTam(ctx, bang, cot, hang, x, y, cao, goc) {
    var im = ANH[bang];
    if (!im || !im.width) return false;
    var O = o();
    var k = (cao || 40) / O, w = O * k, h = O * k;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    if (goc) ctx.rotate(goc);
    ctx.drawImage(im, cot * O, hang * O, O, O, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  /* Mọi atlas đều xếp CỘT = khoá, HÀNG = khung — kể cả fx. Bản trước fx xếp ngược lại
     nên veFX phải tra chéo; giờ thống nhất một luật cho cả bảy tệp. */
  G.veFX = function (ctx, id, x, y, cao, khung, goc) {
    if (!MAP || !MAP.fx || !MAP.fx[id]) return false;
    var m = MAP.fx[id];
    return veTam(ctx, 'fx', m[0], (khung | 0) % (m[1] || 1), x, y, cao || 40, goc);
  };

  /* ══════════ VŨ KHÍ CẦM TAY ══════════
     Sprite tướng (HoloCure) chỉ có bốn khung ĐỨNG YÊN — không ai vung tay bao giờ. Nên
     động tác đánh phải dựng bằng một lớp RỜI: vũ khí vẽ đè lên người, tự xoay và tự thọc
     tới theo mã. Nhờ thế mà hai mươi tướng + lính + quái đều có đòn đánh nhìn thấy được
     mà không phải vẽ lại một khung nào.

     Mọi hình trong vukhi.png đều CHĨA SANG PHẢI, chuôi ở bên trái, canh giữa ô. `goc` là
     hướng chĩa (radian). `neo` đẩy vũ khí ra xa tâm theo đúng hướng ấy — chính là độ dài
     cánh tay, và cũng chính là cú THỌC khi nó đổi theo thời gian. */
  G.veVuKhi = function (ctx, id, x, y, cao, goc, neo) {
    if (!MAP || !MAP.vukhi || !MAP.vukhi[id]) return false;
    var m = MAP.vukhi[id];
    var g = goc || 0;
    var n = neo || 0;
    /* Chĩa sang trái thì lật DỌC, không thì lưỡi kiếm quay xuống đất trông như gãy tay. */
    var lat = Math.abs(g) > Math.PI / 2;
    var im = ANH['vukhi'];
    if (!im || !im.width) return false;
    var O = o(), k = (cao || 26) / O, w = O * k, h = O * k;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x + Math.cos(g) * n, y + Math.sin(g) * n);
    ctx.rotate(g);
    if (lat) ctx.scale(1, -1);
    ctx.drawImage(im, m[0] * O, 0, O, O, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  };

  /** viên đạn: `goc` là hướng bay tính bằng radian, ảnh gốc chĩa sang phải */
  G.veDan = function (ctx, id, x, y, cao, goc) {
    if (!MAP || !MAP.dan || !MAP.dan[id]) return false;
    return veTam(ctx, 'dan', MAP.dan[id][0], 0, x, y, cao || 14, goc);
  };

  /** trụ / nhà chính / lõi: canh ĐÁY-GIỮA vì nó đứng trên mặt đất */
  G.veTru = function (ctx, id, x, y, cao) {
    if (!MAP || !MAP.tru || !MAP.tru[id]) return false;
    return veO(ctx, 'tru', MAP.tru[id][0], 0, x, y, cao || 48, false);
  };

  /* Ảnh tướng cho DOM — màn cấm chọn cần ảnh thật trong thẻ HTML, không phải trên canvas.
     Atlas xếp cột = tướng, hàng = khung hoạt ảnh, nên lấy khung 0 của đúng cột ấy. */
  /* Sprite trong atlas canh ĐÁY-GIỮA nên nhân vật chỉ chiếm phần dưới của ô 64px; dán nguyên ô
     vào thẻ 42px thì người bé tí nằm dưới đáy, trông như thiếu art. Cắt lấy dải CAO → ĐÁY
     (từ điểm phần trăm `tren` trở xuống) rồi phóng cho đầy ô. */
  G.anhTuong = function (id, cao, tren) {
    if (!MAP || !MAP.tuong || !MAP.tuong[id]) return null;
    var O = o();
    var cot = MAP.tuong[id][0];
    var soCot = Object.keys(MAP.tuong).length;
    var soHang = 0;
    for (var k in MAP.tuong) soHang = Math.max(soHang, MAP.tuong[k][1] || 1);
    var t0 = tren != null ? tren : (MAP.tuong[id][2] != null ? MAP.tuong[id][2] : 0.24);
    var kh = cao / (O * (1 - t0));
    /* Cắt mép trên xong thì ô đã phóng rộng hơn thẻ (O*kh > cao). Không kéo ngang vào
       giữa thì thẻ chỉ thấy phần bên TRÁI của ô — nhân vật lệch hẳn ra ngoài khung. */
    var lech = (O * kh - cao) / 2;
    return 'background-image:url(art/tuong.png?v=20260911a);' +
      'background-position:' + (-cot * O * kh - lech) + 'px ' + (-t0 * O * kh) + 'px;' +
      'background-size:' + (soCot * O * kh) + 'px ' + (soHang * O * kh) + 'px;' +
      'background-repeat:no-repeat;image-rendering:pixelated'; 
  };

  /** style nền cho icon TRANG BỊ trong thẻ HTML (ô đồ ở thẻ tuyển thủ, bảng cửa hàng) */
  G.anhDo = function (id, cao) {
    if (!MAP || !MAP['do'] || !MAP['do'][id]) return null;
    var O = o(), cot = MAP['do'][id][0];
    var soCot = Object.keys(MAP['do']).length;
    var kh = cao / O;
    return 'background-image:url(art/do.png?v=20260911a);' +
      'background-position:' + (-cot * O * kh) + 'px 0;' +
      'background-size:' + (soCot * O * kh) + 'px ' + (O * kh) + 'px;' +
      'image-rendering:pixelated';
  };

  G.oAnhDo = function (id, cao) {
    var st = G.anhDo(id, cao || 22);
    if (!st) return null;
    return G.el('i', { style: st + ';display:block;width:' + (cao || 22) + 'px;height:' + (cao || 22) + 'px' });
  };

  /** phần tử <i> ảnh tướng; trả null nếu thiếu atlas để chỗ gọi tự xử */
  G.oAnhTuong = function (id, cao) {
    var st = G.anhTuong(id, cao || 44);
    if (!st) return null;
    return G.el('i', { style: st + ';display:block;width:' + (cao || 44) + 'px;height:' + (cao || 44) + 'px' });
  };

  /** Chân dung cho DOM. `tren` cắt bỏ bấy nhiêu phần trăm mép trên rồi phóng cho đầy ô —
      sprite canh đáy-giữa nên phần trên ô toàn khoảng trống; dán nguyên ô vào một vòng
      tròn 40px thì người bé tí nằm sát đáy, nửa trên trống trơn. Mặc định 0.18. */
  G.anhNguoi = function (id, cao, tren) {
    if (!MAP || !MAP.nguoi || !MAP.nguoi[id]) return null;
    var O = o();
    var cot = MAP.nguoi[id][0];
    /* mép trên đo sẵn lúc ghép atlas (build_art.py ghi phần tử thứ ba) — không đoán */
    var t0 = tren != null ? tren : (MAP.nguoi[id][2] != null ? MAP.nguoi[id][2] : 0.18);
    var k = cao / (O * (1 - t0));
    var lech = (O * k - cao) / 2;
    return 'background-image:url(art/nguoi.png?v=20260911a);' +
      'background-position:' + (-cot * O * k - lech) + 'px ' + (-t0 * O * k) + 'px;' +
      'background-size:' + (MAP.nguoi ? Object.keys(MAP.nguoi).length * O * k : 0) + 'px ' + (O * k) + 'px;' +
      'background-repeat:no-repeat;image-rendering:pixelated';
  };

  /** phần tử <i> chân dung, dùng khắp các màn DOM */
  G.oAnh = function (id, cao, tren) {
    var st = G.anhNguoi(id, cao || 34, tren);
    var e = G.el('i', { style: (st || '') + ';display:block;width:' + (cao || 34) + 'px;height:' + (cao || 34) + 'px' });
    return st ? e : null;
  };

})(window);
