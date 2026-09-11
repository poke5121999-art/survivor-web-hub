/* data-tuyenthu.js — kho tuyển thủ (vai "thẻ hỗ trợ" của Uma).
   Một tuyển thủ vừa là THẺ NUÔI trong ca (đứng ở sân, lên thân thiết, nổ cầu vồng),
   vừa là NGƯỜI RA SÂN trong trận (có vị trí, có bảng thông thạo tướng).

   bac   : 'SSR' | 'SR' | 'R'
   loai  : co | ben | luc | li | nao | ban      (loại "ban" = Bạn Thân, đứng sân nào cũng được)
   vt    : VỊ TRÍ KHOÁ CỨNG — người này chỉ biết đá đúng chỗ đó, huấn luyện viên KHÔNG đổi được.
           vtSao 0..5 = giỏi tới đâu ở chính vị trí đó (kiểu sao vị trí của Teamfight Manager 2).
   chat  : CHẤT CHƠI KHOÁ CỨNG (xem G.CHAT bên dưới) — cũng không đổi được. Chiến thuật của
           huấn luyện viên chỉ *hướng* được đội; ai có cái tôi cao thì vẫn chơi theo ý mình.
   ego   : 0..100 — càng cao càng hay cãi lệnh để làm theo chất chơi của mình.
   hieu  : bộ hiệu ứng (DESIGN.md §3.2) — số ghi ở mức cấp tối đa, cấp thấp nội suy
   goiY  : kỹ năng mà thẻ này dạy cho HLV
   tt    : bảng thông thạo tướng, thiếu thì coi là 'N'
   tinh  : tính cách → chọn câu thoại trong trận
*/
(function (G) {
  'use strict';

  function P(o) {
    o.hieu = o.hieu || {};
    o.tt = o.tt || {};
    return o;
  }

  G.TUYENTHU = [
    /* ═════════ SSR ═════════ */
    P({
      id: 'tt_bao', ten: 'Nguyễn Hữu Bão', biet: 'Bão', bac: 'SSR', loai: 'co', vt: 'giua', vtSao: 5,
      tinh: 'tu_tin',
      hieu: { than: 0.22, congGiaoAn: { co: 0.14 }, hieuqua: 0.06, dau: { co: 30, nao: 12 },
              thanDau: 0.25, capGoiY: 3, tanSuatGoiY: 0.40, uuTien: 0.55, congDiemKN: 0.18 },
      goiY: ['bao_dau', 'gank_som', 'doc_bai'],
      tt: { phaposu: 'UR', bongdem: 'SSR', phapset: 'SR', tuchien: 'R' },
      tieu: 'Người ta gọi là Bão vì đường giữa của nó không có ngày nắng.'
    }),
    P({
      id: 'tt_nui', ten: 'Trương Đình Núi', biet: 'Núi', bac: 'SSR', loai: 'ben', vt: 'tren', vtSao: 5,
      tinh: 'it_noi',
      hieu: { than: 0.20, congGiaoAn: { ben: 0.15 }, hieuqua: 0.05, dau: { ben: 34, li: 14 },
              thanDau: 0.20, chongHong: 0.35, giamHao: 0.14, capGoiY: 2, tanSuatGoiY: 0.32, uuTien: 0.5 },
      goiY: ['lane_chac', 'the_luc', 'binh_tinh'],
      tt: { thanhkiem: 'UR', phaco: 'SSR', kiemsi: 'SR', cuongchien: 'R' },
      tieu: 'Đứng đường trên 4 năm, chưa từng bỏ trụ. Nói chuyện thì ba câu một ngày.'
    }),
    P({
      id: 'tt_lua', ten: 'Phạm Ngọc Lửa', biet: 'Lửa', bac: 'SSR', loai: 'luc', vt: 'duoi', vtSao: 5,
      tinh: 'nong',
      hieu: { than: 0.21, congGiaoAn: { luc: 0.15 }, hieuqua: 0.05, dau: { luc: 32, co: 12 },
              thuongThiDau: 0.16, capGoiY: 3, tanSuatGoiY: 0.35, uuTien: 0.5, congDiemKN: 0.12 },
      goiY: ['cuoi_manh', 'an_linh', 'giao_tranh'],
      tt: { xathu: 'UR', sungtruong: 'SSR', nodoc: 'SR', bomxich: 'R' },
      tieu: 'Bắn trước, hỏi sau. Về cuối trận là người cả đội đứng quanh bảo vệ.'
    }),
    P({
      id: 'tt_thep', ten: 'Lê Anh Thép', biet: 'Thép', bac: 'SSR', loai: 'li', vt: 'rung', vtSao: 5,
      tinh: 'lanh',
      hieu: { than: 0.20, congGiaoAn: { li: 0.15 }, hieuqua: 0.06, dau: { li: 34, ben: 12 },
              chongHong: 0.30, capGoiY: 2, tanSuatGoiY: 0.34, uuTien: 0.5, thuongThiDau: 0.10 },
      goiY: ['khong_hoang', 'lat_keo', 'cuop_rung'],
      tt: { bongma: 'UR', gaosu: 'SSR', kynhan: 'SR', thoisan: 'SR' },
      tieu: 'Thua 0-2 mặt vẫn không đổi. Nó rừng như đang giải toán.'
    }),
    P({
      id: 'tt_oc', ten: 'Hoàng Trí Óc', biet: 'Óc', bac: 'SSR', loai: 'nao', vt: 'ho', vtSao: 5,
      tinh: 'lanh',
      hieu: { than: 0.22, congGiaoAn: { nao: 0.16 }, hieuqua: 0.06, dau: { nao: 34, li: 10 },
              hoiNao: 3, capGoiY: 3, tanSuatGoiY: 0.42, uuTien: 0.55, congDiemKN: 0.22 },
      goiY: ['doc_bai', 'cam_mat', 'an_rong'],
      tt: { thaythuoc: 'UR', khienhon: 'SSR', nhacsi: 'SR', hiepsi: 'R' },
      tieu: 'Không giết ai cả mùa mà vẫn là người quyết định mọi trận.'
    }),
    P({
      id: 'tt_gio', ten: 'Đinh Như Gió', biet: 'Gió', bac: 'SSR', loai: 'co', vt: 'rung', vtSao: 4,
      tinh: 'vui',
      hieu: { than: 0.20, congGiaoAn: { co: 0.13 }, hieuqua: 0.05, dau: { co: 26, luc: 14 },
              tinhthan: 0.35, capGoiY: 2, tanSuatGoiY: 0.36, uuTien: 0.5, thuongThiDau: 0.12 },
      goiY: ['xoay_so', 'gank_som', 'nhip_tot'],
      tt: { kynhan: 'UR', thoisan: 'SSR', bongma: 'SR', gaosu: 'R' },
      tieu: 'Đi rừng như đùa mà kèo nào cũng có mặt.'
    }),
    P({
      id: 'tt_dan', ten: 'Vương Bảo Đàn', biet: 'Đàn', bac: 'SSR', loai: 'ban', vt: 'ho', vtSao: 4,
      tinh: 'vui',
      hieu: { than: 0.24, hieuqua: 0.09, tinhthan: 0.40, dau: { co: 12, ben: 12, luc: 12, li: 12, nao: 12 },
              thanDau: 0.30, capGoiY: 2, tanSuatGoiY: 0.38, giamHao: 0.10, congDiemKN: 0.15 },
      goiY: ['an_y', 'hoi_phuc', 'lam_quen'],
      tt: { nhacsi: 'UR', hiepsi: 'SSR', khienhon: 'SR', thaythuoc: 'SR' },
      tieu: 'Không phải người mạnh nhất phòng, nhưng thiếu nó là cả đội cãi nhau.'
    }),
    P({
      id: 'tt_song', ten: 'Bùi Trường Sóng', biet: 'Sóng', bac: 'SSR', loai: 'ben', vt: 'duoi', vtSao: 4,
      tinh: 'it_noi',
      hieu: { than: 0.19, congGiaoAn: { ben: 0.13 }, hieuqua: 0.06, dau: { ben: 28, luc: 16 },
              giamHao: 0.16, chongHong: 0.25, capGoiY: 2, tanSuatGoiY: 0.30, uuTien: 0.45 },
      goiY: ['the_luc', 'kinh_te', 'an_linh'],
      tt: { nodoc: 'UR', bomxich: 'SSR', xathu: 'SR', sungtruong: 'R' },
      tieu: 'Không nổ, không tụt. Cứ đều đều rồi thắng.'
    }),

    /* ═════════ SR ═════════ */
    P({
      id: 'tt_kien', ten: 'Đặng Văn Kiên', biet: 'Kiên', bac: 'SR', loai: 'li', vt: 'tren', vtSao: 4,
      tinh: 'lanh',
      hieu: { than: 0.15, congGiaoAn: { li: 0.10 }, hieuqua: 0.04, dau: { li: 22, ben: 10 },
              chongHong: 0.22, capGoiY: 2, tanSuatGoiY: 0.28, uuTien: 0.42 },
      goiY: ['khong_hoang', 'lane_chac'],
      tt: { cuongchien: 'SSR', kiemsi: 'SR', phaco: 'R', thanhkiem: 'R' },
      tieu: 'Bị vây ba người vẫn đứng đó ăn lính.'
    }),
    P({
      id: 'tt_minh', ten: 'Trần Quang Minh', biet: 'Minh', bac: 'SR', loai: 'nao', vt: 'giua', vtSao: 4,
      tinh: 'it_noi',
      hieu: { than: 0.15, congGiaoAn: { nao: 0.11 }, hieuqua: 0.04, dau: { nao: 24 },
              hoiNao: 2, capGoiY: 2, tanSuatGoiY: 0.32, congDiemKN: 0.14 },
      goiY: ['doc_bai', 'doi_lane'],
      tt: { phapset: 'SSR', phaposu: 'SR', tuchien: 'R', bongdem: 'R' },
      tieu: 'Ghi chép mọi trận đấu vào sổ tay giấy. Ai cũng cười cho tới lúc cần tra.'
    }),
    P({
      id: 'tt_hai', ten: 'Ngô Thanh Hải', biet: 'Hải', bac: 'SR', loai: 'co', vt: 'duoi', vtSao: 4,
      tinh: 'tu_tin',
      hieu: { than: 0.15, congGiaoAn: { co: 0.11 }, hieuqua: 0.04, dau: { co: 22, luc: 8 },
              capGoiY: 2, tanSuatGoiY: 0.30, thuongThiDau: 0.10 },
      goiY: ['an_linh', 'cuoi_manh'],
      tt: { sungtruong: 'SSR', xathu: 'SR', bomxich: 'R', nodoc: 'R' },
      tieu: 'Tay nhanh, mồm cũng nhanh.'
    }),
    P({
      id: 'tt_phong', ten: 'Lý Đại Phong', biet: 'Phong', bac: 'SR', loai: 'luc', vt: 'rung', vtSao: 4,
      tinh: 'nong',
      hieu: { than: 0.14, congGiaoAn: { luc: 0.11 }, hieuqua: 0.04, dau: { luc: 24, co: 8 },
              capGoiY: 2, tanSuatGoiY: 0.28, uuTien: 0.4 },
      goiY: ['cuop_rung', 'gank_som'],
      tt: { gaosu: 'SSR', kynhan: 'SR', bongma: 'R', thoisan: 'R' },
      tieu: 'Cứ thấy đèn xanh là lao. Đúng nửa số lần.'
    }),
    P({
      id: 'tt_an', ten: 'Phùng Bình An', biet: 'An', bac: 'SR', loai: 'ben', vt: 'ho', vtSao: 4,
      tinh: 'vui',
      hieu: { than: 0.16, congGiaoAn: { ben: 0.10 }, hieuqua: 0.04, dau: { ben: 22, nao: 8 },
              giamHao: 0.12, tinhthan: 0.25, capGoiY: 1, tanSuatGoiY: 0.26 },
      goiY: ['hoi_phuc', 'binh_tinh'],
      tt: { khienhon: 'SSR', thaythuoc: 'SR', hiepsi: 'R', nhacsi: 'R' },
      tieu: 'Người duy nhất trong đội ngủ đủ 8 tiếng.'
    }),
    P({
      id: 'tt_khanh', ten: 'Vũ Gia Khánh', biet: 'Khánh', bac: 'SR', loai: 'nao', vt: 'tren', vtSao: 3,
      tinh: 'lanh',
      hieu: { than: 0.14, congGiaoAn: { nao: 0.10 }, hieuqua: 0.04, dau: { nao: 20, li: 8 },
              capGoiY: 2, tanSuatGoiY: 0.30, congDiemKN: 0.12 },
      goiY: ['day_le', 'doi_lane'],
      tt: { thanhkiem: 'SSR', phaco: 'SR', kiemsi: 'R', cuongchien: 'R' },
      tieu: 'Đẩy lẻ giỏi tới mức đội bạn phải cử hai người trông.'
    }),
    P({
      id: 'tt_duy', ten: 'Cao Anh Duy', biet: 'Duy', bac: 'SR', loai: 'li', vt: 'giua', vtSao: 3,
      tinh: 'tu_tin',
      hieu: { than: 0.14, congGiaoAn: { li: 0.10 }, hieuqua: 0.04, dau: { li: 20, co: 10 },
              chongHong: 0.18, capGoiY: 1, tanSuatGoiY: 0.28 },
      goiY: ['lat_keo', 'binh_tinh'],
      tt: { tuchien: 'SSR', bongdem: 'SR', phaposu: 'R', phapset: 'R' },
      tieu: 'Càng bị chửi càng đánh hay. Không nên thử ở nhà.'
    }),
    P({
      id: 'tt_tam', ten: 'Đỗ Minh Tâm', biet: 'Tâm', bac: 'SR', loai: 'ban', vt: 'ho', vtSao: 3,
      tinh: 'vui',
      hieu: { than: 0.18, hieuqua: 0.06, tinhthan: 0.30, dau: { co: 8, ben: 8, luc: 8, li: 8, nao: 8 },
              thanDau: 0.22, capGoiY: 1, tanSuatGoiY: 0.30 },
      goiY: ['an_y', 'lam_quen'],
      tt: { hiepsi: 'SSR', nhacsi: 'SR', thaythuoc: 'R', khienhon: 'R' },
      tieu: 'Nấu ăn ngon. Trong esport thì đó là kỹ năng thật.'
    }),

    /* ═════════ R ═════════ */
    P({
      id: 'tt_nam', ten: 'Hà Văn Nam', biet: 'Nam', bac: 'R', loai: 'co', vt: 'tren', vtSao: 3,
      tinh: 'it_noi',
      hieu: { than: 0.10, congGiaoAn: { co: 0.07 }, hieuqua: 0.02, dau: { co: 12 }, capGoiY: 1, tanSuatGoiY: 0.20 },
      goiY: ['an_linh'], tt: { kiemsi: 'SR', cuongchien: 'R', phaco: 'R' },
      tieu: 'Chăm. Chỉ có chăm.'
    }),
    P({
      id: 'tt_long', ten: 'Trịnh Hải Long', biet: 'Long', bac: 'R', loai: 'luc', vt: 'giua', vtSao: 3,
      tinh: 'nong',
      hieu: { than: 0.10, congGiaoAn: { luc: 0.07 }, hieuqua: 0.02, dau: { luc: 12 }, capGoiY: 1, tanSuatGoiY: 0.20 },
      goiY: ['bao_dau'], tt: { phaposu: 'SR', tuchien: 'R', phapset: 'R' },
      tieu: 'Hay solo kill, hay chết vô nghĩa. Đúng một tỉ lệ.'
    }),
    P({
      id: 'tt_son', ten: 'Mai Tùng Sơn', biet: 'Sơn', bac: 'R', loai: 'ben', vt: 'rung', vtSao: 3,
      tinh: 'lanh',
      hieu: { than: 0.10, congGiaoAn: { ben: 0.07 }, hieuqua: 0.02, dau: { ben: 12 }, giamHao: 0.08, capGoiY: 1 },
      goiY: ['cuop_rung'], tt: { thoisan: 'SR', gaosu: 'R', kynhan: 'R' },
      tieu: 'Farm rừng như máy. Gank thì hên xui.'
    }),
    P({
      id: 'tt_vy', ten: 'Lâm Thảo Vy', biet: 'Vy', bac: 'R', loai: 'nao', vt: 'ho', vtSao: 3,
      tinh: 'vui',
      hieu: { than: 0.11, congGiaoAn: { nao: 0.07 }, hieuqua: 0.02, dau: { nao: 12 }, hoiNao: 1, capGoiY: 1 },
      goiY: ['cam_mat'], tt: { khienhon: 'SR', nhacsi: 'R', thaythuoc: 'R' },
      tieu: 'Cắm mắt nhiều nhất giải. Không ai nhớ tên.'
    }),
    P({
      id: 'tt_hung', ten: 'Bạch Mạnh Hùng', biet: 'Hùng', bac: 'R', loai: 'li', vt: 'duoi', vtSao: 3,
      tinh: 'tu_tin',
      hieu: { than: 0.10, congGiaoAn: { li: 0.07 }, hieuqua: 0.02, dau: { li: 12 }, chongHong: 0.12, capGoiY: 1 },
      goiY: ['khong_hoang'], tt: { bomxich: 'SR', nodoc: 'R', xathu: 'R' },
      tieu: 'Không bao giờ nhận là mình sai. Kể cả khi sai.'
    }),
    P({
      id: 'tt_thu', ten: 'Kiều Anh Thư', biet: 'Thư', bac: 'R', loai: 'ban', vt: 'giua', vtSao: 2,
      tinh: 'it_noi',
      hieu: { than: 0.13, hieuqua: 0.03, tinhthan: 0.18, dau: { co: 5, ben: 5, luc: 5, li: 5, nao: 5 }, capGoiY: 1 },
      goiY: ['an_y'], tt: { bongdem: 'SR', phapset: 'R', phaposu: 'R' },
      tieu: 'Đá dự bị hai mùa, không than một câu.'
    }),
    P({
      id: 'tt_dat', ten: 'Tô Thành Đạt', biet: 'Đạt', bac: 'R', loai: 'co', vt: 'rung', vtSao: 2,
      tinh: 'nong',
      hieu: { than: 0.10, congGiaoAn: { co: 0.06 }, hieuqua: 0.02, dau: { co: 10, luc: 5 }, capGoiY: 1 },
      goiY: ['xoay_so'], tt: { bongma: 'SR', kynhan: 'R', gaosu: 'R' },
      tieu: 'Tay nhanh hơn não. Đang sửa.'
    }),
    P({
      id: 'tt_lam', ten: 'Ngọc Lam', biet: 'Lam', bac: 'R', loai: 'ben', vt: 'tren', vtSao: 2,
      tinh: 'lanh',
      hieu: { than: 0.10, congGiaoAn: { ben: 0.06 }, hieuqua: 0.02, dau: { ben: 10, li: 5 }, chongHong: 0.10, capGoiY: 1 },
      goiY: ['the_luc'], tt: { phaco: 'SR', thanhkiem: 'R', kiemsi: 'R' },
      tieu: 'Chịu đòn giỏi. Đó cũng là một nghề.'
    })
  ];

  /* ═══════ CHẤT CHƠI — khoá cứng theo người, huấn luyện viên không sửa được ═══════
     Bộ mô phỏng đọc mấy thẻ này để lệch cây quyết định của từng người.
     "lech" là mức lệch so với lệnh chung: 1.0 = làm đúng như chiến thuật bảo. */
  G.CHAT = {
    le:    { ten: 'Thích đẩy lẻ',    mo: 'Hay tách đoàn đi ăn trụ một mình, kể cả lúc đội cần người.' },
    gank:  { ten: 'Hay đi kèo',      mo: 'Bỏ đường đi bắt người. Ăn thì tuyệt, hụt thì mất lính.' },
    farm:  { ten: 'Cắm mặt farm',    mo: 'Ưu tiên lính và quái hơn giao tranh. Đồ luôn sớm hơn người khác.' },
    fight: { ten: 'Máu giao tranh',  mo: 'Thấy đánh nhau là có mặt, dù đang ở nửa bản đồ bên kia.' },
    poke:  { ten: 'Đánh rỉa',        mo: 'Giữ khoảng cách, không lao. An toàn nhưng chậm kết trận.' },
    lao:   { ten: 'Lao trước',       mo: 'Người mở giao tranh. Đúng lúc thì thắng, sai lúc thì mất 5 mạng.' },
    thu:   { ten: 'Chơi chắc',       mo: 'Không mạo hiểm, ít chết, ít tạo được đột biến.' },
    mt:    { ten: 'Bám mục tiêu',    mo: 'Rồng và chúa hang là ưu tiên số một, hơn cả mạng.' },
    solo:  { ten: 'Thích solo',      mo: 'Tìm kèo tay đôi. Thắng thì gánh, thua thì gánh nặng cho đội.' },
    lead:  { ten: 'Người gọi kèo',   mo: 'Đội nghe theo người này; cả đội bám nhịp tốt hơn.' }
  };

  /* vị trí + chất chơi khoá cứng + cái tôi.
     Để riêng một bảng cho dễ đọc và dễ chỉnh cân bằng — nạp xong sẽ gộp vào từng người. */
  G.CHAT_TUYENTHU = {
    tt_bao:   { chat: ['solo', 'fight'], ego: 78 },
    tt_nui:   { chat: ['thu', 'farm'],   ego: 22 },
    tt_lua:   { chat: ['fight', 'poke'], ego: 71 },
    tt_thep:  { chat: ['mt', 'gank'],    ego: 34 },
    tt_oc:    { chat: ['lead', 'thu'],   ego: 18 },
    tt_gio:   { chat: ['gank', 'fight'], ego: 62 },
    tt_dan:   { chat: ['lead', 'fight'], ego: 25 },
    tt_song:  { chat: ['farm', 'poke'],  ego: 30 },

    tt_kien:  { chat: ['thu', 'le'],     ego: 28 },
    tt_minh:  { chat: ['poke', 'lead'],  ego: 24 },
    tt_hai:   { chat: ['farm', 'fight'], ego: 66 },
    tt_phong: { chat: ['gank', 'lao'],   ego: 74 },
    tt_an:    { chat: ['thu', 'lead'],   ego: 20 },
    tt_khanh: { chat: ['le', 'farm'],    ego: 45 },
    tt_duy:   { chat: ['solo', 'lao'],   ego: 82 },
    tt_tam:   { chat: ['lead', 'thu'],   ego: 16 },

    tt_nam:   { chat: ['farm', 'thu'],   ego: 26 },
    tt_long:  { chat: ['solo', 'lao'],   ego: 70 },
    tt_son:   { chat: ['farm', 'mt'],    ego: 30 },
    tt_vy:    { chat: ['thu', 'lead'],   ego: 19 },
    tt_hung:  { chat: ['fight', 'solo'], ego: 68 },
    tt_thu:   { chat: ['poke', 'farm'],  ego: 21 },
    tt_dat:   { chat: ['lao', 'gank'],   ego: 76 },
    tt_lam:   { chat: ['thu', 'le'],     ego: 27 }
  };

  G.TT_LOAI_TEN = { co: 'CƠ', ben: 'BỀN', luc: 'LỰC', li: 'LÌ', nao: 'NÃO', ban: 'BẠN' };
  G.TT_LOAI_LOP = { co: 'l-co', ben: 'l-ben', luc: 'l-luc', li: 'l-li', nao: 'l-nao', ban: 'l-ban' };

  G.TUYENTHU_THEO_ID = {};
  G.TUYENTHU.forEach(function (t) {
    var c = G.CHAT_TUYENTHU[t.id] || { chat: ['thu'], ego: 40 };
    t.chat = c.chat; t.ego = c.ego;
    G.TUYENTHU_THEO_ID[t.id] = t;
  });

  /** 5 tuyển thủ có phủ đủ 5 vị trí không? (vị trí khoá cứng nên đây là ràng buộc thật) */
  G.duDoiHinh = function (dsId) {
    var can = { tren: 0, rung: 0, giua: 0, duoi: 0, ho: 0 };
    dsId.forEach(function (id) {
      var g = G.TUYENTHU_THEO_ID[id]; if (g) can[g.vt]++;
    });
    var thieu = [], thua = [];
    for (var k in can) {
      if (can[k] === 0) thieu.push(k);
      if (can[k] > 1) thua.push(k);
    }
    return { du: thieu.length === 0, thieu: thieu, thua: thua };
  };

  /* trần cấp theo bậc + uncap (DESIGN.md §7.3) */
  G.tranCap = function (bac, uncap) {
    var g = bac === 'SSR' ? 40 : bac === 'SR' ? 35 : 30;
    return g + uncap * 5;
  };

  /** hệ số hiệu ứng theo cấp: cấp 1 = 40%, cấp trần = 100% */
  G.hesoCap = function (cap, bac, uncap) {
    var tran = G.tranCap(bac, uncap);
    return 0.4 + 0.6 * G.kep((cap - 1) / (tran - 1), 0, 1);
  };

  /** tạo bản ghi tuyển thủ trong kho người chơi */
  G.taoTuyenThu = function (id) {
    return { id: id, cap: 1, uncap: 0, manh: 0, exp: 0 };
  };

  /** lấy hiệu ứng thực (đã nhân hệ số cấp) */
  G.hieuThuc = function (ban) {
    var g = G.TUYENTHU_THEO_ID[ban.id];
    var k = G.hesoCap(ban.cap, g.bac, ban.uncap);
    var r = {};
    for (var t in g.hieu) {
      var v = g.hieu[t];
      if (typeof v === 'number') r[t] = v * k;
      else if (v && typeof v === 'object') {
        r[t] = {};
        for (var t2 in v) r[t][t2] = v[t2] * k;
      }
    }
    /* uncap 4 mở hiệu ứng ẩn: +8% thân thiết, +6% hiệu quả tập */
    if (ban.uncap >= 4) { r.than = (r.than || 0) + 0.08; r.hieuqua = (r.hieuqua || 0) + 0.06; }
    return r;
  };

  /* ══════════════════ NUÔI THẺ ══════════════════
     Trước đây `cap` của thẻ chỉ để đọc: gacha ra thẻ cấp 1 rồi nó ở cấp 1 tới hết game, mà
     `hesoCap` lại nhân hiệu ứng theo cấp — nghĩa là mọi thẻ đều chạy ở 40% sức. Có hai đường
     lên cấp, và cả hai đều phải có, vì chúng trả lời hai câu khác nhau:

       XU       — "tôi có 2000 xu, tiêu vào đâu bây giờ?"  → chủ động, tức thì, có giá rõ ràng
       KINH NGHIỆM — "chạy một mùa nữa để được gì?"        → thưởng cho việc chơi, không mua được

     Trần cấp do bậc thẻ và uncap quyết định (`tranCap`), nên thẻ SSR uncap 4 mới lên nổi 60. */

  /** giá xu để lên MỘT cấp từ cấp hiện tại; null nếu đã tới trần */
  G.giaCap = function (ban) {
    var g = G.TUYENTHU_THEO_ID[ban.id]; if (!g) return null;
    if (ban.cap >= G.tranCap(g.bac, ban.uncap)) return null;
    var heBac = g.bac === 'SSR' ? 1.35 : g.bac === 'SR' ? 1.15 : 1;
    return Math.round((30 + ban.cap * 7) * heBac);
  };

  /** kinh nghiệm cần để lên một cấp */
  G.expCap = function (cap) { return 40 + cap * 14; };

  /** tổng xu để lên `so` cấp — hiện trước khi bấm, không để người chơi bấm mò */
  G.giaNhieuCap = function (ban, so) {
    var g = G.TUYENTHU_THEO_ID[ban.id]; if (!g) return { so: 0, xu: 0 };
    var tran = G.tranCap(g.bac, ban.uncap);
    var cap = ban.cap, xu = 0, n = 0;
    var heBac = g.bac === 'SSR' ? 1.35 : g.bac === 'SR' ? 1.15 : 1;
    while (n < so && cap < tran) {
      xu += Math.round((30 + cap * 7) * heBac);
      cap++; n++;
    }
    return { so: n, xu: xu };
  };

  /** số cấp tối đa mua được với số xu đang có */
  G.capMuaDuoc = function (ban) {
    var g = G.TUYENTHU_THEO_ID[ban.id]; if (!g) return 0;
    var tran = G.tranCap(g.bac, ban.uncap);
    var heBac = g.bac === 'SSR' ? 1.35 : g.bac === 'SR' ? 1.15 : 1;
    var cap = ban.cap, con = G.S.clb.xu, n = 0;
    while (cap < tran) {
      var gia = Math.round((30 + cap * 7) * heBac);
      if (gia > con) break;
      con -= gia; cap++; n++;
    }
    return n;
  };

  /** tiêu xu để lên cấp; trả về số cấp thật sự lên được */
  G.nangCapTT = function (ban, so) {
    var t = G.giaNhieuCap(ban, so);
    if (!t.so || t.xu > G.S.clb.xu) return 0;
    G.S.clb.xu -= t.xu;
    ban.cap += t.so;
    G.luu();
    return t.so;
  };

  /** cộng kinh nghiệm (từ việc chạy hết một ca) và tự lên cấp; trả về số cấp lên được */
  G.themExpTT = function (ban, exp) {
    var g = G.TUYENTHU_THEO_ID[ban.id]; if (!g) return 0;
    var tran = G.tranCap(g.bac, ban.uncap);
    ban.exp = (ban.exp || 0) + exp;
    var len = 0;
    while (ban.cap < tran && ban.exp >= G.expCap(ban.cap)) {
      ban.exp -= G.expCap(ban.cap);
      ban.cap++; len++;
    }
    if (ban.cap >= tran) ban.exp = 0;
    return len;
  };

  /** so sánh hiệu ứng ở hai cấp — để màn nuôi thẻ hiện được "trước → sau" */
  G.soHieu = function (ban, capMoi) {
    var g = G.TUYENTHU_THEO_ID[ban.id];
    var a = G.hieuThuc(ban);
    var b = G.hieuThuc({ id: ban.id, cap: capMoi, uncap: ban.uncap });
    var ds = [];
    Object.keys(g.hieu).forEach(function (k) {
      if (k === 'dau') return;                       /* chỉ số khởi điểm gộp riêng bên dưới */
      if (typeof g.hieu[k] === 'number') {
        ds.push({ ten: G.TEN_HIEU[k] || k, a: a[k] || 0, b: b[k] || 0, pt: PHAN_TRAM[k] !== false });
      } else {
        for (var k2 in g.hieu[k]) {
          ds.push({ ten: (G.TEN_HIEU[k] || k) + ' ' + (G.TEN_CHISO[G.SAN_IDX[k2]] || k2),
            a: (a[k] || {})[k2] || 0, b: (b[k] || {})[k2] || 0, pt: PHAN_TRAM[k] !== false });
        }
      }
    });
    if (g.hieu.dau) {
      var ta = 0, tb = 0;
      for (var k3 in g.hieu.dau) { ta += (a.dau || {})[k3] || 0; tb += (b.dau || {})[k3] || 0; }
      ds.push({ ten: 'Chỉ số khởi điểm (tổng)', a: ta, b: tb, pt: false });
    }
    return ds;
  };

  var PHAN_TRAM = { dau: false, capGoiY: false, hoiNao: false };

  G.TEN_HIEU = {
    than: 'Thân thiết', tinhthan: 'Tinh thần', congGiaoAn: 'Cộng giáo án',
    hieuqua: 'Hiệu quả tập', dau: 'Chỉ số khởi điểm', thanDau: 'Thân thiết khởi điểm',
    thuongGiai: 'Thưởng thi đấu', thuongFan: 'Thưởng danh tiếng', capGoiY: 'Cấp gợi ý',
    tanSuatGoiY: 'Tần suất gợi ý', uuTien: 'Ưu tiên đúng sân', chongHong: 'Chống hỏng',
    giamHao: 'Giảm hao thể lực', congDiemKN: 'Cộng điểm kỹ năng', hoiNao: 'Hồi lực khi tập Não'
  };

  G.SAN_IDX = { co: 0, ben: 1, luc: 2, li: 3, nao: 4 };

  /** bậc thông thạo của tuyển thủ với một tướng */
  G.thongThao = function (ban, idTuong) {
    var g = G.TUYENTHU_THEO_ID[ban.id];
    var goc = (ban.tt && ban.tt[idTuong]) || g.tt[idTuong] || 'N';
    return goc;
  };

})(window);
