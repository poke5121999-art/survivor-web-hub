/* data-trangbi.js — 20 trang bị, xếp thành 5 NHÁNH × 4 TẦNG, có đường ghép.

   Lấy khung của Teamfight Manager 2 (đọc từ ảnh `tfm2/key/it_666.jpg`: bảng Item Info bày
   Tier 1→5, mỗi món ghi "Builds From / Builds Into", ví dụ
   Iron Sword (T1, 500g, AD+15) → Soldier's Longsword (T2, 300g, AD+30) → Ruinous Blade → …).
   Ở đây rút còn 20 món cho vừa một trận ngắn trên web.

   ▲ LUẬT QUAN TRỌNG: KHÔNG ai chọn đồ hộ tuyển thủ. Huấn luyện viên không có nút nào ở đây.
     Mỗi người TỰ nghĩ trong trận: xem mình là ai, đội địch đánh bằng gì, mình đang thắng hay
     bị dí, rồi mua. Bộ óc đó nằm ở G.nghiDo() cuối file.

   Chỉ số món: atk · ap · hp · giap · khang · tocdanh(%) · tocchay(%) · hut(%)
   dac: thẻ hiệu ứng riêng mà bộ mô phỏng đọc.
*/
(function (G) {
  'use strict';

  function M(id, ten, nhanh, tang, gia, cs, dac, mo) {
    return { id: id, ten: ten, nhanh: nhanh, tang: tang, gia: gia, cs: cs, dac: dac || null, mo: mo || '' };
  }

  /* 5 nhánh:
     luoi  — sát thương vật lý thẳng
     gio   — tốc đánh, hút máu, đánh liên tục
     thep  — giáp + máu, chống vật lý
     lua   — kháng phép + máu, chống phép
     ngoc  — sức mạnh phép                                                     */

  G.TRANGBI = [
    /* ── nhánh LƯỠI: sát thương vật lý ───────────────────────────── */
    M('luoi1', 'Đoản Kiếm', 'luoi', 1, 500, { atk: 15 }, null,
      'Món rẻ nhất mà ai cầm cũng đau hơn.'),
    M('luoi2', 'Trường Kiếm Lính', 'luoi', 2, 800, { atk: 32 }, null,
      'Ghép từ Đoản Kiếm.'),
    M('luoi3', 'Lưỡi Tàn Phá', 'luoi', 3, 1300, { atk: 55, hut: 0.06 }, null,
      'Sát thương vật lý +55, hút máu 6%.'),
    M('luoi4', 'Phán Quyết Bá Vương', 'luoi', 4, 2200, { atk: 85, hut: 0.10 }, 'xuyengiap',
      'Bỏ qua 25% giáp của mục tiêu. Món kết thúc trận đấu.'),

    /* ── nhánh GIÓ: tốc đánh và đánh liên tục ────────────────────── */
    M('gio1', 'Chuỷ Thủ', 'gio', 1, 500, { tocdanh: 0.12 }, null,
      'Tốc đánh +12%.'),
    M('gio2', 'Dao Gió', 'gio', 2, 850, { tocdanh: 0.22, tocchay: 0.04 }, null,
      'Nhanh tay, nhanh chân.'),
    M('gio3', 'Song Đao Bão', 'gio', 3, 1350, { atk: 25, tocdanh: 0.32, tocchay: 0.05 }, null,
      'Vừa nhanh vừa đau.'),
    M('gio4', 'Bá Chủ Cuồng Phong', 'gio', 4, 2200, { atk: 40, tocdanh: 0.45, tocchay: 0.08 }, 'domino',
      'Đòn đánh văng sang mục tiêu bên cạnh 40% sát thương.'),

    /* ── nhánh THÉP: giáp và máu ─────────────────────────────────── */
    M('thep1', 'Giáp Sắt', 'thep', 1, 500, { giap: 22, hp: 120 }, null,
      'Chống người đánh tay.'),
    M('thep2', 'Giáp Gác Cổng', 'thep', 2, 850, { giap: 40, hp: 220 }, null,
      'Ghép từ Giáp Sắt.'),
    M('thep3', 'Trọng Giáp Hắc Kỵ', 'thep', 3, 1350, { giap: 62, hp: 380 }, 'phandon',
      'Phản 12% sát thương vật lý nhận được.'),
    M('thep4', 'Thành Trì Bất Khả', 'thep', 4, 2200, { giap: 90, hp: 600 }, 'chan_khi_thap',
      'Xuống dưới 30% máu thì nhận một lá chắn lớn, 90 giây một lần.'),

    /* ── nhánh LỤA: kháng phép và máu ────────────────────────────── */
    M('lua1', 'Áo Choàng Huyền', 'lua', 1, 500, { khang: 22, hp: 100 }, null,
      'Chống pháp sư.'),
    M('lua2', 'Mũ Trùm Đêm', 'lua', 2, 850, { khang: 40, hp: 180, tocchay: 0.04 }, null,
      'Nhẹ và kín.'),
    M('lua3', 'Quạ Hoàng Hôn', 'lua', 3, 1350, { khang: 60, hp: 320 }, 'chan_phep',
      'Chặn đứng một kỹ năng, 60 giây một lần.'),
    M('lua4', 'Màn Huỷ Diệt', 'lua', 4, 2200, { khang: 85, hp: 480, ap: 30 }, 'giam_hoi',
      'Kẻ địch quanh mình bị giảm 40% hiệu quả hồi máu.'),

    /* ── nhánh NGỌC: sức mạnh phép ───────────────────────────────── */
    M('ngoc1', 'Tinh Thạch', 'ngoc', 1, 500, { ap: 22 }, null,
      'Sức mạnh phép +22.'),
    M('ngoc2', 'Ngọc Linh Hồn', 'ngoc', 2, 850, { ap: 45 }, null,
      'Ghép từ Tinh Thạch.'),
    M('ngoc3', 'Trượng Mê Hoặc', 'ngoc', 3, 1350, { ap: 75, hp: 150 }, 'xuyenkhang',
      'Bỏ qua 20% kháng phép của mục tiêu.'),
    M('ngoc4', 'Tiên Tri Vực Thẳm', 'ngoc', 4, 2250, { ap: 115, hp: 250 }, 'no_dien',
      'Kỹ năng gây thêm 12% sát thương phép lên mọi mục tiêu gần đó.')
  ];

  G.TB_THEO_ID = {};
  G.TRANGBI.forEach(function (m) { G.TB_THEO_ID[m.id] = m; });

  G.NHANH_TEN = { luoi: 'Lưỡi', gio: 'Gió', thep: 'Thép', lua: 'Lụa', ngoc: 'Ngọc' };
  G.NHANH_MAU = { luoi: '#f0a86f', gio: '#6fc4f0', thep: '#c8d3e0', lua: '#b08af0', ngoc: '#5fe0b0' };

  /** món kế tiếp trong cùng nhánh (null nếu đã tầng 4) */
  G.monKe = function (nhanh, tang) {
    return G.TRANGBI.filter(function (m) { return m.nhanh === nhanh && m.tang === tang + 1; })[0] || null;
  };

  /* ══════════════════════════════════════════════════════════════════════════
     BỘ ÓC MUA ĐỒ — tuyển thủ tự nghĩ, không ai chọn hộ.

     Đầu vào (ct = "cảnh trận"):
       vai      'tren' | 'rung' | 'giua' | 'duoi' | 'ho'
       lopTuong 'can'|'xa'|'phep'|'ho'|'sat'
       apVL     0..1  — tỉ lệ sát thương VẬT LÝ mà đội địch đang dồn vào mình
       apPT     0..1  — tỉ lệ sát thương PHÉP
       thua     -1..1 — âm là đang bị dí (chênh vàng/mạng), dương là đang dẫn
       chat     mảng nét chất chơi ('thu','fight','le',…)
       nao      0..1200 — NÃO của huấn luyện viên, quyết định mua CHUẨN tới đâu
       daCo     mảng id món đã mua
       rng      hàm ngẫu nhiên

     Trả về: id món nên mua tiếp.

     Nguyên tắc (rút từ cách chơi MOBA thật, và từ lời khuyên trong hướng dẫn TFM2 —
     "ba món thủ trên Ogre khiến nó gần như bất tử"):
       1. Nhánh chính theo vai và lớp tướng — không ai bỏ nhánh chính quá 2 món.
       2. Nếu đội địch dồn một loại sát thương rõ rệt thì chen một món kháng đúng loại.
       3. Đang bị dí thì thủ sớm hơn; đang dẫn thì dồn sát thương để kết trận.
       4. NÃO thấp → có xác suất mua "theo thói quen" (nhánh chính) dù đang bị đánh chết.
     ════════════════════════════════════════════════════════════════════════ */

  var NHANH_CHINH = {
    duoi: ['luoi', 'gio'], rung: ['luoi', 'gio'], tren: ['luoi', 'thep'],
    giua: ['ngoc', 'luoi'], ho: ['ngoc', 'lua']
  };
  var THEO_LOP = { xa: ['gio', 'luoi'], sat: ['luoi', 'gio'], phep: ['ngoc'], ho: ['lua', 'ngoc'], can: ['luoi', 'thep'] };

  G.nghiDo = function (ct) {
    var rng = ct.rng || Math.random;
    var daCo = ct.daCo || [];

    /* đếm số món đã có theo nhánh + tầng cao nhất từng nhánh */
    var soMon = { luoi: 0, gio: 0, thep: 0, lua: 0, ngoc: 0 };
    var tangCao = { luoi: 0, gio: 0, thep: 0, lua: 0, ngoc: 0 };
    daCo.forEach(function (id) {
      var m = G.TB_THEO_ID[id]; if (!m) return;
      soMon[m.nhanh]++;
      if (m.tang > tangCao[m.nhanh]) tangCao[m.nhanh] = m.tang;
    });

    /* 1. nhánh chính */
    var chinh = (THEO_LOP[ct.lopTuong] || []).concat(NHANH_CHINH[ct.vai] || []);
    var uu = {};
    chinh.forEach(function (n, i) { uu[n] = (uu[n] || 0) + (3 - i * 0.6); });

    /* 2. đọc đội địch — chen món kháng đúng loại */
    var quyet = G.kep((ct.nao || 600) / 1200, 0, 1);     /* 0..1: đọc trận chuẩn tới đâu */
    var lechVL = (ct.apVL || 0.5) - 0.5;                  /* >0 nghĩa là địch nghiêng vật lý */
    uu.thep = (uu.thep || 0) + Math.max(0, lechVL) * 6 * (0.45 + 0.55 * quyet);
    uu.lua = (uu.lua || 0) + Math.max(0, -lechVL) * 6 * (0.45 + 0.55 * quyet);

    /* 3. thế trận */
    var thua = ct.thua || 0;
    if (thua < -0.15) { uu.thep = (uu.thep || 0) + 1.6; uu.lua = (uu.lua || 0) + 1.6; }
    if (thua > 0.20) { uu.luoi = (uu.luoi || 0) + 1.2; uu.ngoc = (uu.ngoc || 0) + 1.2; uu.gio = (uu.gio || 0) + 0.8; }

    /* 4. chất chơi khoá cứng cũng kéo tay người ta */
    (ct.chat || []).forEach(function (c) {
      if (c === 'thu') { uu.thep = (uu.thep || 0) + 1.0; uu.lua = (uu.lua || 0) + 1.0; }
      if (c === 'fight' || c === 'lao') { uu.luoi = (uu.luoi || 0) + 0.8; uu.ngoc = (uu.ngoc || 0) + 0.5; }
      if (c === 'le' || c === 'farm') { uu.gio = (uu.gio || 0) + 0.6; uu.luoi = (uu.luoi || 0) + 0.4; }
      if (c === 'poke') { uu.ngoc = (uu.ngoc || 0) + 0.6; }
      if (c === 'solo') { uu.luoi = (uu.luoi || 0) + 0.7; uu.hut = 0; }
    });

    /* pháp sư không mua Lưỡi, xạ thủ không mua Ngọc — trừ khi hết đường */
    if (ct.lopTuong === 'phep' || ct.lopTuong === 'ho') uu.luoi = (uu.luoi || 0) * 0.15;
    if (ct.lopTuong === 'xa' || ct.lopTuong === 'sat') uu.ngoc = (uu.ngoc || 0) * 0.15;

    /* không dồn quá 2 món cùng nhánh thủ, không quá 3 nhánh chính */
    ['thep', 'lua'].forEach(function (n) { if (soMon[n] >= 2) uu[n] *= 0.25; });
    ['luoi', 'gio', 'ngoc'].forEach(function (n) { if (soMon[n] >= 3) uu[n] *= 0.3; });

    /* 5. NÃO thấp thì thỉnh thoảng mua theo thói quen, bỏ qua tính toán */
    if (rng() > 0.35 + 0.6 * quyet) {
      var thoiQuen = (THEO_LOP[ct.lopTuong] || ['luoi'])[0];
      uu = {}; uu[thoiQuen] = 1;
    }

    /* chọn nhánh điểm cao nhất còn món để mua */
    var ds = Object.keys(uu).filter(function (n) {
      return G.NHANH_TEN[n] && tangCao[n] < 4;
    });
    if (!ds.length) return null;
    ds.sort(function (a, b) { return (uu[b] || 0) - (uu[a] || 0); });

    /* chút ngẫu nhiên giữa hai nhánh đầu để hai trận không giống hệt nhau */
    var chon = ds[0];
    if (ds.length > 1 && rng() < 0.22) chon = ds[1];

    var mon = G.monKe(chon, tangCao[chon]);
    return mon ? mon.id : null;
  };

  /** gộp chỉ số của cả túi đồ */
  G.congDo = function (dsId) {
    var r = { atk: 0, ap: 0, hp: 0, giap: 0, khang: 0, tocdanh: 0, tocchay: 0, hut: 0 }, dac = [];
    (dsId || []).forEach(function (id) {
      var m = G.TB_THEO_ID[id]; if (!m) return;
      for (var k in m.cs) r[k] = (r[k] || 0) + m.cs[k];
      if (m.dac) dac.push(m.dac);
    });
    r.dac = dac;
    return r;
  };

})(window);
