/* sprites.js — nạp atlas và vẽ.

   LUẬT: trong code không có tên tệp ảnh nào, chỉ có khoá kiểu 'tuong.kiemsi'. Bảng tra nằm ở
   art/asset-map.js (sinh tự động bằng _tools/build_art.py). Thiếu ảnh thì mọi hàm vẽ trả về
   false và phần gọi tự vẽ hình học thay thế — game không bao giờ vỡ vì thiếu art.

   68 TƯỚNG TFM2 (RESEARCH.md §15): mỗi tướng một sheet RIÊNG (art/tfm/t/<id>.png+.js), nạp lười
   bằng G.napTuong(id) — khác hẳn atlas CHUNG window.TFM_HINH ở dưới (20 id tự chế đời cũ, atlas
   art/tfm/hinh.png, vẫn giữ nguyên). Vẽ bằng G.veHinhT/G.veHinhTamT, chân dung bằng
   G.anhTuongIcon. Xem toàn bộ hợp đồng ở khối "68 TƯỚNG TFM2" phía dưới trong tệp này.
*/
(function (G) {
  'use strict';

  /* MỘT số bản cho mọi ảnh atlas. Canvas từng nạp `?v=…12a` còn ảnh DOM nạp `?v=…11a`:
     mỗi atlas tải hai lần, và chân dung DOM có thể lấy ảnh cũ trong cache ghép với toạ độ mới.
     Đổi ảnh trong art/ thì tăng đúng số này. */
  var ART_V = '20260925i';
  G.ART_V = ART_V;              /* ui-tran nạp ba lớp ảnh bản đồ cùng phiên bản art */
  var MAP = window.ART_MAP || null;
  var ANH = {};
  var xong = 0, can = 0;

  G.ART = { sanSang: false };

  /* ══════════ HOẠT ẢNH TFM2 ══════════
     Bảng `window.TFM_HINH` (art/tfm/hinh.js, sinh bởi _tools/build_tfm.py):
     khoá → trạng thái → [x, y, w, h, ms]; "_" = [chân, đỉnh] đo từ TÂM khung.
     Khung TFM2 không kèm điểm neo; neo là tâm khung, nên đặt tâm ở (x, y − chân). */
  var TH = window.TFM_HINH || null;
  var ANH_TH = new Image();

  G.coHinh = function (khoa) { return !!(TH && TH[khoa] && ANH_TH.complete && ANH_TH.naturalWidth); };

  /** tổng thời lượng một trạng thái, giây */
  G.dai = function (khoa, tt) {
    var ds = TH && TH[khoa] && TH[khoa][tt];
    if (!ds) return 0;
    var s = 0;
    for (var i = 0; i < ds.length; i++) s += ds[i][4];
    return s / 1000;
  };

  /** chiều cao từ chân tới đỉnh đầu, điểm ảnh gốc */
  G.caoHinh = function (khoa) {
    var m = TH && TH[khoa];
    return m ? m._[0] + m._[1] : 0;
  };

  function khungLuc(ds, giay, lap) {
    var tong = 0, i;
    for (i = 0; i < ds.length; i++) tong += ds[i][4];
    var ms = giay * 1000;
    if (lap) ms = ((ms % tong) + tong) % tong;
    else if (ms >= tong) return ds[ds.length - 1];
    for (i = 0; i < ds.length; i++) {
      ms -= ds[i][4];
      if (ms < 0) return ds[i];
    }
    return ds[ds.length - 1];
  }

  /** Vẽ khoá `khoa` ở trạng thái `tt`, `giay` giây sau khi trạng thái bắt đầu.
      (x, y) là CHÂN; `k` là điểm ảnh màn cho mỗi điểm ảnh gốc. Thiếu thì trả false. */
  G.veHinh = function (ctx, khoa, tt, giay, x, y, k, lat, lap) {
    if (!G.coHinh(khoa)) return false;
    var m = TH[khoa], ds = m[tt] || m.dung;
    if (!ds) return false;
    var f = khungLuc(ds, giay, lap);
    var w = f[2] * k, h = f[3] * k, cy = y - m._[0] * k;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, cy);
    if (lat) ctx.scale(-1, 1);
    ctx.drawImage(ANH_TH, f[0], f[1], f[2], f[3], -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  };

  /** Vẽ một khung canh TÂM, có xoay — đạn và vụ nổ, thứ không đứng trên đất. */
  G.veHinhTam = function (ctx, khoa, tt, giay, x, y, k, goc, lap) {
    if (!G.coHinh(khoa)) return false;
    var ds = TH[khoa][tt];
    if (!ds) return false;
    var f = khungLuc(ds, giay, lap);
    var w = f[2] * k, h = f[3] * k;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    if (goc) ctx.rotate(goc);
    ctx.drawImage(ANH_TH, f[0], f[1], f[2], f[3], -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  };

  /* ══════════ 68 TƯỚNG TFM2 — sheet RIÊNG từng tướng, nạp lười ══════════
     Xem RESEARCH.md §15 cho hợp đồng đầy đủ với agent lõi/chiêu. Tóm tắt:

     `G.napTuong(id, cb)`   chèn <script src="art/tfm/t/<id>.js"> (một lần) + nạp PNG cùng tên;
                            cb(true/false) khi xong. Gọi lại khi đã nạp thì cb ngay, không tải lại.
     `G.tuongSan(id)`       true nếu tướng đã nạp xong (đồng bộ, không cần cb).
     `G.veHinhT(ctx, id, anim, giay, x, y, k, lat, lap)`   vẽ tướng, (x,y) là CHÂN — như veHinh cũ
                            nhưng `anim` là tên hoạt ảnh THẬT của TFM2 (không đổi tên như TUONG cũ
                            trong build_tfm.py): 'idle','run','attack','dead','hit','skill','skill2',
                            'ult','ult_effect',... — khác nhau theo từng tướng, tra trong
                            window.TFM_T[id].anim. Thiếu tướng/hoạt ảnh thì trả false.
     `G.veHinhTamT(ctx, id, anim, giay, x, y, k, goc, lap)`  như veHinhTam cũ — hiệu ứng chiêu
                            riêng của tướng (đạn, vùng nổ), canh TÂM, có xoay.
     `G.daiT(id, anim)` / `G.caoHinhT(id, anim)`   như G.dai / G.caoHinh cho sheet riêng.
     `G.anhTuongIcon(id, cao)`  style nền chân dung cho DOM, atlas CHUNG art/tfm/icon.png (68
                            tướng, không nạp lười — màn cấm chọn cần thấy hết cùng lúc).
  */
  var ANH_T = {};      /* id → Image */
  var DANG_NAP_T = {}; /* id → mảng cb đang chờ, hoặc true nếu đã xong */
  var TI = window.TFM_ICON || null;
  var ANH_ICON = new Image();

  G.tuongSan = function (id) {
    var im = ANH_T[id];
    return !!(window.TFM_T && window.TFM_T[id] && im && im.complete && im.naturalWidth);
  };

  G.napTuong = function (id, cb) {
    if (G.tuongSan(id)) { if (cb) cb(true); return; }
    if (DANG_NAP_T[id]) { if (cb) DANG_NAP_T[id].push(cb); return; }
    DANG_NAP_T[id] = cb ? [cb] : [];
    var xongCa = function (ok) {
      var ds = DANG_NAP_T[id]; DANG_NAP_T[id] = null;
      ds.forEach(function (f) { if (f) f(ok); });
    };
    var kt = function () {
      if (window.TFM_T && window.TFM_T[id] && ANH_T[id] && ANH_T[id].complete) xongCa(G.tuongSan(id));
    };
    if (!(window.TFM_T && window.TFM_T[id])) {
      var sc = document.createElement('script');
      sc.src = 'art/tfm/t/' + id + '.js?v=' + ART_V;
      sc.onload = kt;
      sc.onerror = function () { xongCa(false); };
      document.head.appendChild(sc);
    }
    var im = ANH_T[id] || (ANH_T[id] = new Image());
    im.onload = kt; im.onerror = function () { xongCa(false); };
    im.src = 'art/tfm/t/' + id + '.png?v=' + ART_V;
    kt();
  };

  function dsAnimT(id, anim) {
    var d = window.TFM_T && window.TFM_T[id];
    return d && d.anim && d.anim[anim];
  }

  G.daiT = function (id, anim) {
    var ds = dsAnimT(id, anim);
    if (!ds) return 0;
    var s = 0;
    for (var i = 0; i < ds.length; i++) s += ds[i][4];
    return s / 1000;
  };

  G.caoHinhT = function (id, anim) {
    var d = window.TFM_T && window.TFM_T[id];
    if (!d) return 0;
    return d._[0] + d._[1];
  };

  G.veHinhT = function (ctx, id, anim, giay, x, y, k, lat, lap) {
    if (!G.tuongSan(id)) return false;
    var d = window.TFM_T[id], ds = dsAnimT(id, anim) || dsAnimT(id, 'idle');
    if (!ds) return false;
    var f = khungLuc(ds, giay, lap);
    var w = f[2] * k, h = f[3] * k, cy = y - d._[0] * k;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, cy);
    if (lat) ctx.scale(-1, 1);
    ctx.drawImage(ANH_T[id], f[0], f[1], f[2], f[3], -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  };

  G.veHinhTamT = function (ctx, id, anim, giay, x, y, k, goc, lap) {
    if (!G.tuongSan(id)) return false;
    var ds = dsAnimT(id, anim);
    if (!ds) return false;
    var f = khungLuc(ds, giay, lap);
    var w = f[2] * k, h = f[3] * k;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    if (goc) ctx.rotate(goc);
    ctx.drawImage(ANH_T[id], f[0], f[1], f[2], f[3], -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  };

  /** chân dung DOM cho một trong 68 tướng TFM2 — atlas chung art/tfm/icon.png, không nạp lười */
  G.anhTuongIcon = function (id, cao) {
    var m = TI && TI[id];
    if (!m) return null;
    var k = cao / Math.max(m[2], m[3]);
    return 'background-image:url(art/tfm/icon.png?v=' + ART_V + ');' +
      'background-position:' + (-m[0] * k) + 'px ' + (-m[1] * k) + 'px;' +
      'background-size:' + (m[2] * k) + 'px ' + (m[3] * k) + 'px;' +
      'background-repeat:no-repeat;image-rendering:pixelated';
  };

  G.oAnhTuongIcon = function (id, cao) {
    var st = G.anhTuongIcon(id, cao || 44);
    if (!st) return null;
    return G.el('i', { style: st + ';display:block;width:' + (cao || 44) + 'px;height:' + (cao || 44) + 'px' });
  };

  G.taiArt = function (cb) {
    if (!MAP) { if (cb) cb(false); return; }
    if (TH) { ANH_TH.src = 'art/tfm/hinh.png?v=' + ART_V; }
    if (TI) { ANH_ICON.src = 'art/tfm/icon.png?v=' + ART_V; }
    var ds = ['nguoi', 'fx', 'dan', 'do'];
    can = ds.length;
    ds.forEach(function (t) {
      var im = new Image();
      im.onload = function () { ANH[t] = im; if (++xong >= can) { G.ART.sanSang = true; if (cb) cb(true); } };
      im.onerror = function () { if (++xong >= can) { G.ART.sanSang = true; if (cb) cb(true); } };
      im.src = 'art/' + t + '.png?v=' + ART_V;
    });
  };

  function o() { return (MAP && MAP._o) || 64; }

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
    /* hiệu ứng TFM2: co theo cạnh dài nhất của cả dãy, như ô 64 của atlas cũ */
    var h = TH && TH['hieu.' + id];
    if (h && G.coHinh('hieu.' + id)) {
      /* chỗ gọi có thể đưa số khung âm (tuổi hiệu ứng cộng độ lệch âm): lấy phần dư dương, không
         thì h.no[-3] ra undefined, ném lỗi giữa vòng vẽ và cả màn trận đứng hình */
      var n = h.no.length, f = h.no[(((khung | 0) % n) + n) % n], kk = (cao || 40) / Math.max(h._[2], h._[3]);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(x, y);
      if (goc) ctx.rotate(goc);
      ctx.drawImage(ANH_TH, f[0], f[1], f[2], f[3], -f[2] * kk / 2, -f[3] * kk / 2, f[2] * kk, f[3] * kk);
      ctx.restore();
      return true;
    }
    if (!MAP || !MAP.fx || !MAP.fx[id]) return false;
    var m = MAP.fx[id];
    return veTam(ctx, 'fx', m[0], (khung | 0) % (m[1] || 1), x, y, cao || 40, goc);
  };

  /** viên đạn: `goc` là hướng bay tính bằng radian, ảnh gốc chĩa sang phải */
  G.veDan = function (ctx, id, x, y, cao, goc) {
    if (!MAP || !MAP.dan || !MAP.dan[id]) return false;
    return veTam(ctx, 'dan', MAP.dan[id][0], 0, x, y, cao || 14, goc);
  };

  /* Ảnh tướng cho DOM — màn cấm chọn cần ảnh thật trong thẻ HTML, không phải trên canvas. */
  G.anhTuong = function (id, cao) {
    var m = TH && TH['tuong.' + id];
    if (!m) return null;
    /* ô vuông lấy từ đỉnh đầu xuống, cạnh bằng 62% chiều cao người */
    var f = m.dung[0], canh = Math.min(f[2], Math.round((m._[0] + m._[1]) * 0.62));
    var tren0 = Math.max(0, Math.round(f[3] / 2 - m._[1]) - 2);
    var trai = Math.round((f[2] - canh) / 2), kk = cao / canh;
    return 'background-image:url(art/tfm/hinh.png?v=' + ART_V + ');' +
      'background-position:' + (-(f[0] + trai) * kk) + 'px ' + (-(f[1] + tren0) * kk) + 'px;' +
      'background-size:' + (TH._co[0] * kk) + 'px ' + (TH._co[1] * kk) + 'px;' +
      'background-repeat:no-repeat;image-rendering:pixelated';
  };

  /* ══════════ GIAO DIỆN UMA ══════════
     `window.UMA_UI` (art/uma/ui.js, sinh bởi _tools/build_uma.py): khoá → [x, y, w, h].
     Trả một <i> vuông `cao` px, bên trong là một ô VỪA KHÍT sprite đặt giữa: tô nền thẳng lên
     ô vuông thì các sprite kề bên trong atlas lộ ra ở hai mép. Thiếu khoá thì trả chữ dự phòng. */
  var UI = window.UMA_UI || null;
  G.oUma = function (khoa, cao, duPhong) {
    var m = UI && UI[khoa];
    if (!m) return G.el('i', { text: duPhong || '' });
    var k = cao / Math.max(m[2], m[3]);
    var ngoai = G.el('i.ic-uma', { style: 'width:' + cao + 'px;height:' + cao + 'px' });
    ngoai.appendChild(G.el('u', { style: 'width:' + (m[2] * k).toFixed(1) + 'px;height:' + (m[3] * k).toFixed(1) + 'px;' +
      'background-image:url(art/uma/ui.png?v=' + ART_V + ');' +
      'background-position:' + (-m[0] * k).toFixed(1) + 'px ' + (-m[1] * k).toFixed(1) + 'px;' +
      'background-size:' + (UI._co[0] * k).toFixed(1) + 'px ' + (UI._co[1] * k).toFixed(1) + 'px' }));
    return ngoai;
  };

  /** số kiểu màn xem trước buổi tập của Uma ("+12" chữ cam viền trắng), cao `cao` px */
  G.oSoUma = function (chuoi, cao) {
    var d = G.el('span.so-uma');
    String(chuoi).split('').forEach(function (c) {
      var m = UI && UI['so.' + c];
      if (!m) { d.appendChild(G.el('b', { text: c })); return; }
      d.appendChild(G.oUma('so.' + c, cao * Math.max(m[2], m[3]) / m[3]));
    });
    return d;
  };

  /** style nền cho icon TRANG BỊ trong thẻ HTML (ô đồ ở thẻ tuyển thủ, bảng cửa hàng) */
  G.anhDo = function (id, cao) {
    if (!MAP || !MAP['do'] || !MAP['do'][id]) return null;
    var O = o(), cot = MAP['do'][id][0];
    var soCot = Object.keys(MAP['do']).length;
    var kh = cao / O;
    return 'background-image:url(art/do.png?v=' + ART_V + ');' +
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
    var U = window.UMA_NGUOI, u = U && U[id];
    if (u) {
      /* nhân vật Uma (art/uma/nguoi.js): ô to dùng tranh đứng, ô nhỏ dùng icon tròn */
      if (cao >= 150) {
        return 'background-image:url(' + u.dung + '?v=' + ART_V + ');background-size:contain;' +
          'background-position:50% 100%;background-repeat:no-repeat';
      }
      var k = cao / u.mat[2];
      return 'background-image:url(art/uma/mat.png?v=' + ART_V + ');' +
        'background-position:' + (-u.mat[0] * k) + 'px ' + (-u.mat[1] * k) + 'px;' +
        'background-size:' + (U._co[0] * k) + 'px ' + (U._co[1] * k) + 'px;background-repeat:no-repeat';
    }
    if (!MAP || !MAP.nguoi || !MAP.nguoi[id]) return null;
    var O = o();
    var cot = MAP.nguoi[id][0];
    /* mép trên đo sẵn lúc ghép atlas (build_art.py ghi phần tử thứ ba) — không đoán */
    var t0 = tren != null ? tren : (MAP.nguoi[id][2] != null ? MAP.nguoi[id][2] : 0.18);
    var k = cao / (O * (1 - t0));
    var lech = (O * k - cao) / 2;
    return 'background-image:url(art/nguoi.png?v=' + ART_V + ');' +
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
