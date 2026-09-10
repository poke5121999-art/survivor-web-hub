/* data-giai.js — lịch một mùa và các đội đối thủ.
   Nhịp do chủ dự án chốt: 5 ngày tập → 1 giải, lặp 4 lần; rồi chung kết thế giới
   xen kẽ 1 ngày tập → 1 trận (DESIGN.md §4.1). */
(function (G) {
  'use strict';

  /* Lịch 24 lượt. Lượt nào có "giai" thì sau khi làm xong việc của lượt đó sẽ vào trận. */
  G.LICH = (function () {
    var l = [], i;
    function tap(n, giaidoan) { for (var k = 0; k < n; k++) l.push({ loai: 'tap', gd: giaidoan }); }
    function giai(o) { l[l.length - 1].giai = o; }

    tap(5, 'Vòng bảng quốc nội');
    giai({ id: 'g1', ten: 'Vòng bảng — Lượt 1', the: 'Bo1', bac: 1, muc: 'thang', sanDau: 'online',
           nhip: 'ngan', thuong: { xu: 300, fan: 4000 }, doi: 'ai_low' });
    tap(5, 'Vòng bảng quốc nội');
    giai({ id: 'g2', ten: 'Vòng bảng — Lượt 2', the: 'Bo1', bac: 1, muc: 'thang', sanDau: 'online',
           nhip: 'chop', thuong: { xu: 350, fan: 5000 }, doi: 'ai_low' });
    tap(5, 'Tranh vé play-off');
    giai({ id: 'g3', ten: 'Play-off quốc nội', the: 'Bo3', bac: 2, muc: 'thang', sanDau: 'lan',
           nhip: 'dai', thuong: { xu: 600, fan: 9000 }, doi: 'ai_mid' });
    tap(5, 'Chung kết quốc nội');
    giai({ id: 'g4', ten: 'Chung kết quốc nội', the: 'Bo3', bac: 2, muc: 'thang', sanDau: 'lan',
           nhip: 'ngan', thuong: { xu: 900, fan: 14000 }, doi: 'ai_mid' });

    /* chung kết thế giới: 1 tập → 1 trận, bốn lần */
    tap(1, 'Chung kết thế giới');
    giai({ id: 'w1', ten: 'CKTG — Tứ kết', the: 'Bo3', bac: 3, muc: 'thang', sanDau: 'lan',
           nhip: 'dai', thuong: { xu: 1200, fan: 20000 }, doi: 'ai_hi' });
    tap(1, 'Chung kết thế giới');
    giai({ id: 'w2', ten: 'CKTG — Bán kết', the: 'Bo5', bac: 3, muc: 'thang', sanDau: 'lan',
           nhip: 'sieu', thuong: { xu: 1600, fan: 28000 }, doi: 'ai_hi' });
    tap(1, 'Chung kết thế giới');
    giai({ id: 'w3', ten: 'CKTG — Tranh vé chung kết', the: 'Bo5', bac: 4, muc: 'thang', sanDau: 'lan',
           nhip: 'dai', thuong: { xu: 2000, fan: 36000 }, doi: 'ai_top' });
    tap(1, 'Chung kết thế giới');
    giai({ id: 'w4', ten: 'CHUNG KẾT THẾ GIỚI', the: 'Bo5', bac: 5, muc: 'thang', sanDau: 'lan',
           nhip: 'sieu', thuong: { xu: 3000, fan: 60000 }, doi: 'ai_top' });

    for (i = 0; i < l.length; i++) l[i].so = i + 1;
    return l;
  })();

  G.SO_LUOT = G.LICH.length;

  /* ── 24 đội đối thủ ──────────────────────────────────────────────────────────
     Trước đây chỉ có 13 đội và họ đúng nghĩa là "một con số `suc`": gặp xong rồi biến mất,
     không ai biết họ đứng thứ mấy, đang thắng hay đang thua. Không có bảng xếp hạng thì không
     có cạnh tranh, mà không có cạnh tranh thì thắng một giải cũng chẳng để làm gì.

     Giờ 24 đội, chia hai khu:
       vn — **giải quốc nội**: 11 đội + CLB của người chơi = 12 đội, đá vòng tròn suốt mùa.
       qt — **quốc tế**: 13 đội, chỉ gặp ở chung kết thế giới, nhưng vẫn có thành tích riêng
            để bảng xếp hạng thế giới không phải bảng chết.

     Mỗi đội có:
       suc   sức mạnh nền (chỉ số trung bình quy đổi 0..1200) — đã cân bằng máy, xem RESEARCH.md §4.3
       the   thế trận ưa dùng: quyết định cách máy draft và chiến thuật
       tuong nhóm tướng họ hay lấy — làm cho bảng "tướng hay pick" của báo cáo có nghĩa
       sao   tên ngôi sao của đội, để bản tin gọi được tên người
       tieu  một câu nhận diện, dùng trong bản tin và báo cáo trước trận
     ── */
  function D(id, ten, tat, khu, suc, the, tuong, mau, sao, tieu) {
    return { id: id, ten: ten, tat: tat, khu: khu, suc: suc, the: the, tuong: tuong,
      mau: mau, sao: sao, tieu: tieu };
  }

  G.DOI_AI = [
    /* ═════ QUỐC NỘI — 11 đội, đá cùng bảng với người chơi ═════ */
    D('d_meo', 'Mèo Đá', 'MĐ', 'vn', 58, 'bamnhip',
      ['kiemsi', 'xathu', 'thaythuoc', 'gaosu', 'phaposu'], '#6fc4f0', 'Tí',
      'Đội trẻ nhất giải. Chưa thắng ai nhưng cũng chưa sợ ai.'),
    D('d_song', 'Sóng Xanh', 'SX', 'vn', 62, 'nuoimuon',
      ['hiepsi', 'sungtruong', 'khienhon', 'thoisan', 'phaposu'], '#5fe0b0', 'Hạ',
      'Đá chậm, farm sạch, và thường hết giờ trước khi kịp bung.'),
    D('d_bao', 'Báo Đen', 'BĐ', 'vn', 68, 'baodau',
      ['cuongchien', 'bongma', 'nodoc', 'nhacsi', 'phapset'], '#b08af0', 'Khải',
      'Mười phút đầu là của họ. Phút hai mươi thì tuỳ.'),
    D('d_dieu', 'Diều Hâu', 'DH', 'vn', 74, 'bamnhip',
      ['thanhkiem', 'bomxich', 'nhacsi', 'bongma', 'bongdem'], '#f0a86f', 'Vũ',
      'Không có gì đặc biệt, và đó là điểm mạnh của họ.'),
    D('d_cavoi', 'Cá Voi Trắng', 'CV', 'vn', 96, 'nuoimuon',
      ['phaco', 'gaosu', 'phaposu', 'sungtruong', 'thaythuoc'], '#9fd8e8', 'Đại',
      'Chịu trận giỏi nhất giải. Ai muốn thắng phải kết liễu trước phút 25.'),
    D('d_kien', 'Kiến Lửa', 'KL', 'vn', 120, 'baodau',
      ['cuongchien', 'kynhan', 'nodoc', 'phapset', 'nhacsi'], '#ff7a45', 'Bảo',
      'Năm người xông vào cùng lúc. Không có kế hoạch B.'),
    D('d_ong', 'Ong Vàng', 'OV', 'vn', 140, 'bamnhip',
      ['kiemsi', 'thoisan', 'bongdem', 'xathu', 'khienhon'], '#ffcc3d', 'Nghĩa',
      'Đội kỷ luật nhất giải quốc nội. Không bao giờ tự thua.'),
    D('d_ho', 'Hổ Xám', 'HX', 'vn', 150, 'baodau',
      ['cuongchien', 'kynhan', 'xathu', 'hiepsi', 'bongdem'], '#e5484d', 'Sơn',
      'Vô địch quốc nội ba mùa liền. Ai cũng muốn hạ họ.'),
    D('d_ran', 'Rắn Lục', 'RL', 'vn', 162, 'nuoimuon',
      ['phaco', 'nodoc', 'phapset', 'khienhon', 'thoisan'], '#3ddc97', 'Tuệ',
      'Nhường hết nửa đầu rồi siết cổ từ phút 25.'),
    D('d_soi', 'Sói Tuyết', 'ST', 'vn', 172, 'bamnhip',
      ['thanhkiem', 'gaosu', 'phaposu', 'sungtruong', 'thaythuoc'], '#7fd6ff', 'Lâm',
      'Không có ngôi sao nào, nhưng năm người đá như một.'),
    D('d_quy', 'Quỷ Đỏ', 'QĐ', 'vn', 186, 'bungcuoi',
      ['phaco', 'bongma', 'phapset', 'xathu', 'khienhon'], '#ff8fb0', 'Huy',
      'Thắng đậm hoặc thua đậm. Trận nào của họ cũng đáng xem.'),

    /* ═════ QUỐC TẾ — 13 đội, gặp ở chung kết thế giới ═════ */
    D('d_gio', 'Gió Bắc', 'GB', 'qt', 240, 'bamnhip',
      ['kiemsi', 'kynhan', 'bongdem', 'sungtruong', 'nhacsi'], '#a8c4d8', 'Wen',
      'Khu vực lạnh nhất, lối chơi cũng lạnh nhất.'),
    D('d_bacau', 'Bạch Âu', 'BA', 'qt', 244, 'nuoimuon',
      ['thanhkiem', 'gaosu', 'phapset', 'nodoc', 'thaythuoc'], '#e8e4d8', 'Leon',
      'Đại diện phương Tây. Đá dài, đá chắc, không ai thích gặp.'),
    D('d_hai', 'Hải Lang', 'HL', 'qt', 252, 'baodau',
      ['cuongchien', 'bongma', 'xathu', 'hiepsi', 'phaposu'], '#3f8fd0', 'Kaito',
      'Invade từ giây thứ mười. Có mùa vô địch, có mùa về bét.'),
    D('d_rong', 'Rồng Vàng', 'RV', 'qt', 258, 'bamnhip',
      ['thanhkiem', 'kynhan', 'phaposu', 'sungtruong', 'khienhon'], '#ffd76e', 'Long',
      'Đội đông fan nhất thế giới. Áp lực khán giả là vũ khí của họ.'),
    D('d_thien', 'Thiên Lôi', 'TL', 'qt', 264, 'bungcuoi',
      ['phaco', 'thoisan', 'phapset', 'bomxich', 'nhacsi'], '#c9a0ff', 'Rai',
      'Chờ giao tranh tổng cuối rồi xoá sổ. Không quan tâm phút 10.'),
    D('d_phuong', 'Phượng Bạc', 'PB', 'qt', 270, 'bungcuoi',
      ['hiepsi', 'gaosu', 'phapset', 'xathu', 'nhacsi'], '#c8d3e0', 'Mira',
      'Lật kèo là nghề. Thua 0-2 vẫn chưa ai dám ăn mừng.'),
    D('d_hoa', 'Hoả Diệm', 'HD', 'qt', 276, 'baodau',
      ['cuongchien', 'bongma', 'nodoc', 'bongdem', 'khienhon'], '#ff6b3d', 'Yan',
      'Đá nhanh tới mức đối thủ chưa kịp mua đồ thứ hai.'),
    D('d_lang', 'Lang Vương', 'LV', 'qt', 290, 'baodau',
      ['cuongchien', 'bongma', 'bongdem', 'nodoc', 'nhacsi'], '#a77bf3', 'Fen',
      'Đi rừng hay nhất thế giới, và cả đội đá quanh người đó.'),
    D('d_bang', 'Băng Nguyên', 'BN', 'qt', 318, 'nuoimuon',
      ['phaco', 'gaosu', 'phaposu', 'sungtruong', 'thaythuoc'], '#8fe0ff', 'Ise',
      'Bốn mươi phút không phải trận dài, với họ đó là kế hoạch.'),
    D('d_thanh', 'Thánh Chiến', 'TC', 'qt', 330, 'bamnhip',
      ['thanhkiem', 'kynhan', 'phapset', 'xathu', 'thaythuoc'], '#f2c94c', 'Sein',
      'Không có điểm yếu nào đủ lớn để khai thác.'),
    D('d_sat', 'Sắt Đen', 'SĐ', 'qt', 336, 'bungcuoi',
      ['phaco', 'thoisan', 'bongdem', 'bomxich', 'khienhon'], '#8a939e', 'Dorn',
      'Ba lần á quân thế giới. Mùa nào cũng nói mùa này là của mình.'),
    D('d_vang', 'Vàng Ròng', 'VR', 'qt', 348, 'baodau',
      ['kiemsi', 'kynhan', 'phaposu', 'xathu', 'nhacsi'], '#f5d76e', 'Aru',
      'Mua sạch ngôi sao của mọi khu vực. Và nó có tác dụng.'),
    D('d_vuong', 'Vương Triều', 'VT', 'qt', 352, 'nuoimuon',
      ['phaco', 'gaosu', 'phaposu', 'sungtruong', 'khienhon'], '#4a9df8', 'Zhe',
      'Đương kim vô địch thế giới. Hai mùa chưa thua một loạt Bo5 nào.')
  ];

  G.DOI_THEO_ID = {};
  G.DOI_AI.forEach(function (d) { G.DOI_THEO_ID[d.id] = d; });

  G.DOI_QUOC_NOI = G.DOI_AI.filter(function (d) { return d.khu === 'vn'; }).map(function (d) { return d.id; });
  G.DOI_QUOC_TE = G.DOI_AI.filter(function (d) { return d.khu === 'qt'; }).map(function (d) { return d.id; });

  /* Nhóm bốc thăm cho từng bậc giải. Sức trung bình của mỗi nhóm là con số đã đo cân bằng
     (RESEARCH.md §4.3) — thêm đội vào nhóm thì phải giữ trung bình, không thì tỉ lệ thắng lệch. */
  G.NHOM_DOI = {
    ai_low: ['d_meo', 'd_bao', 'd_song', 'd_dieu'],
    ai_mid: ['d_ho', 'd_ran', 'd_soi', 'd_quy'],
    ai_hi: ['d_gio', 'd_bacau', 'd_hai', 'd_rong', 'd_thien', 'd_phuong', 'd_hoa', 'd_lang'],
    ai_top: ['d_bang', 'd_thanh', 'd_sat', 'd_vang', 'd_vuong']
  };

  /* tên tuyển thủ máy — ghép ngẫu nhiên cho có không khí */
  G.TEN_MAY = ['Zeta', 'Kobi', 'Ryn', 'Vex', 'Nao', 'Suri', 'Dex', 'Milo', 'Khoa', 'Bin',
               'Tuan', 'Rin', 'Kaz', 'Oto', 'Jin', 'Luca', 'Ari', 'Sen', 'Bo', 'Tik',
               'Meo', 'Xu', 'Bear', 'Neo', 'Kai', 'Rex', 'Sol', 'Vy', 'Duy', 'Hao'];

})(window);
