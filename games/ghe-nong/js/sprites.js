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
    var ds = ['tuong', 'nguoi', 'quai', 'fx'];
    can = ds.length;
    ds.forEach(function (t) {
      var im = new Image();
      im.onload = function () { ANH[t] = im; if (++xong >= can) { G.ART.sanSang = true; if (cb) cb(true); } };
      im.onerror = function () { if (++xong >= can) { G.ART.sanSang = true; if (cb) cb(true); } };
      im.src = 'art/' + t + '.png?v=20260910a';
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

  G.veFX = function (ctx, id, x, y, cao, khung) {
    if (!MAP || !MAP.fx || !MAP.fx[id]) return false;
    var m = MAP.fx[id];
    var im = ANH.fx;
    if (!im || !im.width) return false;
    var O = o();
    var c = (khung | 0) % (m[1] || 1);
    var k = (cao || 40) / O, w = O * k, h = O * k;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, c * O, m[0] * O, O, O, x - w / 2, y - h / 2, w, h);
    ctx.restore();
    return true;
  };

  /** chân dung cho DOM: trả về style background dùng cho một ô vuông cạnh `cao` */
  G.anhNguoi = function (id, cao) {
    if (!MAP || !MAP.nguoi || !MAP.nguoi[id]) return null;
    var O = o();
    var cot = MAP.nguoi[id][0];
    var k = cao / O;
    return 'background-image:url(art/nguoi.png?v=20260910a);' +
      'background-position:' + (-cot * O * k) + 'px 0;' +
      'background-size:' + (MAP.nguoi ? Object.keys(MAP.nguoi).length * O * k : 0) + 'px ' + (O * k) + 'px;' +
      'image-rendering:pixelated';
  };

  /** phần tử <i> chân dung, dùng khắp các màn DOM */
  G.oAnh = function (id, cao) {
    var st = G.anhNguoi(id, cao || 34);
    var e = G.el('i', { style: (st || '') + ';display:block;width:' + (cao || 34) + 'px;height:' + (cao || 34) + 'px' });
    return st ? e : null;
  };

})(window);
