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

  /* ── đội đối thủ ─────────────────────────────────────────────────────────────
     suc  : sức mạnh nền (chỉ số trung bình quy đổi 0..1200)
     the  : thế trận ưa dùng — dùng để chọn tướng và chiến thuật khi máy tự draft
     tuong: nhóm tướng họ hay lấy (để bảng "tướng hay pick" của báo cáo có ý nghĩa) */
  function D(id, ten, tat, suc, the, tuong, mau) {
    return { id: id, ten: ten, tat: tat, suc: suc, the: the, tuong: tuong, mau: mau };
  }

  G.DOI_AI = [
    /* nhóm yếu — vòng bảng */
    D('d_meo', 'Mèo Đá', 'MĐ', 58, 'bamnhip', ['kiemsi', 'xathu', 'thaythuoc', 'gaosu', 'phaposu'], '#6fc4f0'),
    D('d_bao', 'Báo Đen', 'BĐ', 68, 'baodau', ['cuongchien', 'bongma', 'nodoc', 'nhacsi', 'phapset'], '#b08af0'),
    D('d_song', 'Sóng Xanh', 'SX', 62, 'nuoimuon', ['hiepsi', 'sungtruong', 'khienhon', 'thoisan', 'phaposu'], '#5fe0b0'),
    D('d_dieu', 'Diều Hâu', 'DH', 74, 'bamnhip', ['thanhkiem', 'bomxich', 'nhacsi', 'bongma', 'bongdem'], '#f0a86f'),

    /* nhóm giữa — play-off, chung kết quốc nội */
    D('d_ho', 'Hổ Xám', 'HX', 150, 'baodau', ['cuongchien', 'kynhan', 'xathu', 'hiepsi', 'bongdem'], '#e5484d'),
    D('d_ran', 'Rắn Lục', 'RL', 162, 'nuoimuon', ['phaco', 'nodoc', 'phapset', 'khienhon', 'thoisan'], '#3ddc97'),
    D('d_soi', 'Sói Tuyết', 'ST', 172, 'bamnhip', ['thanhkiem', 'gaosu', 'phaposu', 'sungtruong', 'thaythuoc'], '#7fd6ff'),
    D('d_quy', 'Quỷ Đỏ', 'QĐ', 186, 'bungcuoi', ['phaco', 'bongma', 'phapset', 'xathu', 'khienhon'], '#ff8fb0'),

    /* nhóm mạnh — CKTG */
    D('d_rong', 'Rồng Vàng', 'RV', 258, 'bamnhip', ['thanhkiem', 'kynhan', 'phaposu', 'sungtruong', 'khienhon'], '#ffd76e'),
    D('d_phuong', 'Phượng Bạc', 'PB', 270, 'bungcuoi', ['hiepsi', 'gaosu', 'phapset', 'xathu', 'nhacsi'], '#c8d3e0'),
    D('d_lang', 'Lang Vương', 'LV', 288, 'baodau', ['cuongchien', 'bongma', 'bongdem', 'nodoc', 'nhacsi'], '#a77bf3'),

    /* nhóm đỉnh — chung kết */
    D('d_thanh', 'Thánh Chiến', 'TC', 330, 'bamnhip', ['thanhkiem', 'kynhan', 'phapset', 'xathu', 'thaythuoc'], '#f2c94c'),
    D('d_vuong', 'Vương Triều', 'VT', 352, 'nuoimuon', ['phaco', 'gaosu', 'phaposu', 'sungtruong', 'khienhon'], '#4a9df8')
  ];

  G.DOI_THEO_ID = {};
  G.DOI_AI.forEach(function (d) { G.DOI_THEO_ID[d.id] = d; });

  G.NHOM_DOI = {
    ai_low: ['d_meo', 'd_bao', 'd_song', 'd_dieu'],
    ai_mid: ['d_ho', 'd_ran', 'd_soi', 'd_quy'],
    ai_hi: ['d_rong', 'd_phuong', 'd_lang'],
    ai_top: ['d_thanh', 'd_vuong']
  };

  /* tên tuyển thủ máy — ghép ngẫu nhiên cho có không khí */
  G.TEN_MAY = ['Zeta', 'Kobi', 'Ryn', 'Vex', 'Nao', 'Suri', 'Dex', 'Milo', 'Khoa', 'Bin',
               'Tuan', 'Rin', 'Kaz', 'Oto', 'Jin', 'Luca', 'Ari', 'Sen', 'Bo', 'Tik',
               'Meo', 'Xu', 'Bear', 'Neo', 'Kai', 'Rex', 'Sol', 'Vy', 'Duy', 'Hao'];

})(window);
