/* data-hlv.js — kho huấn luyện viên (vai "Umamusume": thứ được nuôi trong ca).
   Mỗi HLV có:
     sao      1..3  — bậc gacha
     nk       năng khiếu 3 nhóm, hạng G..S (DESIGN.md §2.3)
                san : { lan, online }
                nhip: { chop, ngan, dai, sieu }
                the : { baodau, bamnhip, nuoimuon, bungcuoi }
     kn       kỹ năng riêng (data-kynang.js → KN_RIENG)
     dau      chỉ số khởi điểm [co, ben, luc, li, nao]
     hop      hệ số hợp giáo án — nhân vào kết quả tập từng sân
     tang     trần chỉ số riêng (mặc định 1200)
     su       3 sự kiện riêng
*/
(function (G) {
  'use strict';

  function H(o) {
    o.tran = o.tran || [1200, 1200, 1200, 1200, 1200];
    o.hop = o.hop || [1, 1, 1, 1, 1];
    return o;
  }

  G.HLV = [
    /* ───────── 3 sao ───────── */
    H({
      id: 'hlv_lua', ten: 'Trần Bá Lửa', biet: 'Ông Lửa', sao: 3, kn: 'lua_som',
      nk: { san: { lan: 'A', online: 'B' }, nhip: { chop: 'S', ngan: 'A', dai: 'C', sieu: 'D' },
            the: { baodau: 'S', bamnhip: 'B', nuoimuon: 'D', bungcuoi: 'E' } },
      dau: [110, 70, 95, 85, 60], hop: [1.15, 0.95, 1.12, 1.05, 0.9],
      tieu: 'Từng đấm bàn giữa họp báo. Đội của ông không biết thế nào là phút thứ 30.',
      su: ['dot_lua', 'hop_bao', 'dem_truoc']
    }),
    H({
      id: 'hlv_thep', ten: 'Lý Thị Thép', biet: 'Bà Thép', sao: 3, kn: 'thep_nguoi',
      nk: { san: { lan: 'S', online: 'B' }, nhip: { chop: 'C', ngan: 'A', dai: 'S', sieu: 'A' },
            the: { baodau: 'D', bamnhip: 'A', nuoimuon: 'S', bungcuoi: 'B' } },
      dau: [70, 120, 70, 115, 85], hop: [0.92, 1.18, 0.95, 1.14, 1.0],
      tieu: 'Thua 0-2 vẫn ngồi thẳng lưng. Học trò của bà không ai biết bỏ cuộc.',
      su: ['tap_dem', 'ky_luat', 'thua_van_ngoi']
    }),
    H({
      id: 'hlv_mat', ten: 'Ngô Vĩnh Mẫn', biet: 'Mắt Thần', sao: 3, kn: 'mat_than',
      nk: { san: { lan: 'B', online: 'S' }, nhip: { chop: 'B', ngan: 'S', dai: 'A', sieu: 'B' },
            the: { baodau: 'B', bamnhip: 'S', nuoimuon: 'A', bungcuoi: 'C' } },
      dau: [80, 85, 70, 75, 130], hop: [0.95, 1.0, 0.92, 1.0, 1.2],
      tieu: 'Nhìn minimap nhiều hơn nhìn màn hình. Biết đối thủ định làm gì trước cả họ.',
      su: ['soi_bang', 'canh_bao', 'nuoc_co']
    }),
    H({
      id: 'hlv_vang', ten: 'Đặng Kim Bảo', biet: 'Bàn Tay Vàng', sao: 3, kn: 'ban_tay',
      nk: { san: { lan: 'A', online: 'A' }, nhip: { chop: 'A', ngan: 'A', dai: 'A', sieu: 'B' },
            the: { baodau: 'B', bamnhip: 'A', nuoimuon: 'A', bungcuoi: 'B' } },
      dau: [95, 95, 95, 95, 95], hop: [1.06, 1.06, 1.06, 1.06, 1.06],
      tieu: 'Không giỏi nhất thứ gì, nhưng đội nào qua tay cũng khá lên.',
      su: ['ban_tay_su', 'gio_com', 'lang_nghe']
    }),
    H({
      id: 'hlv_tan', ten: 'Hồ Tàn Cuộc', biet: 'Ông Cuối', sao: 3, kn: 'tan_cuoc',
      nk: { san: { lan: 'B', online: 'A' }, nhip: { chop: 'E', ngan: 'C', dai: 'A', sieu: 'S' },
            the: { baodau: 'F', bamnhip: 'C', nuoimuon: 'A', bungcuoi: 'S' } },
      dau: [75, 110, 105, 90, 80], hop: [0.95, 1.12, 1.14, 1.02, 0.96],
      tieu: 'Cứ để họ dẫn. Phút 35 mới là sân của tôi.',
      su: ['cho_doi', 'phut_35', 'nhin_dong_ho']
    }),

    /* ───────── 2 sao ───────── */
    H({
      id: 'hlv_nhip', ten: 'Vũ Giữ Nhịp', biet: 'Nhịp', sao: 2, kn: 'cuop_nhip',
      nk: { san: { lan: 'B', online: 'A' }, nhip: { chop: 'B', ngan: 'A', dai: 'B', sieu: 'C' },
            the: { baodau: 'B', bamnhip: 'A', nuoimuon: 'C', bungcuoi: 'D' } },
      dau: [90, 80, 85, 70, 90], hop: [1.08, 1.0, 1.04, 0.96, 1.06],
      tieu: 'Ăn một mạng là cả đội chạy nhanh hơn một nhịp.',
      su: ['bat_nhip', 'go_bo', 'chay_da']
    }),
    H({
      id: 'hlv_nha', ten: 'Phan Giữ Nhà', biet: 'Thủ Môn', sao: 2, kn: 'giu_nha',
      nk: { san: { lan: 'A', online: 'B' }, nhip: { chop: 'D', ngan: 'B', dai: 'A', sieu: 'A' },
            the: { baodau: 'E', bamnhip: 'B', nuoimuon: 'A', bungcuoi: 'B' } },
      dau: [70, 105, 65, 105, 80], hop: [0.94, 1.14, 0.92, 1.12, 1.0],
      tieu: 'Thua 10 mạng vẫn không mất nhà. Rồi lật.',
      su: ['thu_nha', 'chan_bai', 'giu_binh_tinh']
    }),
    H({
      id: 'hlv_vi', ten: 'Bùi Đọc Vị', biet: 'Thầy Bói', sao: 2, kn: 'doc_vi',
      nk: { san: { lan: 'B', online: 'A' }, nhip: { chop: 'B', ngan: 'A', dai: 'B', sieu: 'C' },
            the: { baodau: 'C', bamnhip: 'A', nuoimuon: 'B', bungcuoi: 'C' } },
      dau: [75, 75, 70, 80, 115], hop: [0.96, 0.98, 0.94, 1.0, 1.16],
      tieu: 'Cấm đúng tướng ruột của người ta là thắng nửa trận.',
      su: ['xem_bang', 'ban_dung', 'ghi_chep']
    }),
    H({
      id: 'hlv_quan', ten: 'Tạ Nuôi Quân', biet: 'Bác Cả', sao: 2, kn: 'nuoi_quan',
      nk: { san: { lan: 'B', online: 'B' }, nhip: { chop: 'C', ngan: 'B', dai: 'A', sieu: 'B' },
            the: { baodau: 'D', bamnhip: 'B', nuoimuon: 'A', bungcuoi: 'B' } },
      dau: [80, 90, 95, 70, 85], hop: [1.0, 1.05, 1.1, 0.95, 1.02],
      tieu: 'Cứ farm đi. Đồ đủ rồi tính.',
      su: ['nau_com', 'nuoi_quan_su', 'du_do']
    }),
    H({
      id: 'hlv_dai', ten: 'Kiều Kéo Dài', biet: 'Cô Dài', sao: 2, kn: 'keo_dai',
      nk: { san: { lan: 'C', online: 'A' }, nhip: { chop: 'E', ngan: 'C', dai: 'S', sieu: 'A' },
            the: { baodau: 'E', bamnhip: 'B', nuoimuon: 'A', bungcuoi: 'A' } },
      dau: [75, 115, 80, 95, 80], hop: [0.95, 1.16, 1.0, 1.06, 0.98],
      tieu: 'Trận dài là bạn. Ai vội thì thua.',
      su: ['keo_dai_su', 'thoi_gian', 'kien_nhan']
    }),

    /* ───────── 1 sao ───────── */
    H({
      id: 'hlv_tre', ten: 'Đỗ Trẻ', biet: 'Cu Đỗ', sao: 1, kn: 'lua_som',
      nk: { san: { lan: 'C', online: 'B' }, nhip: { chop: 'B', ngan: 'C', dai: 'D', sieu: 'E' },
            the: { baodau: 'B', bamnhip: 'C', nuoimuon: 'E', bungcuoi: 'F' } },
      dau: [70, 55, 65, 55, 50], hop: [1.05, 0.95, 1.0, 0.95, 0.95],
      tieu: 'Mới lên từ đội trẻ. Hăng, chưa khôn.',
      su: ['bo_ngo', 'hoc_viec', 'lan_dau']
    }),
    H({
      id: 'hlv_cu', ten: 'Lâm Lão Làng', biet: 'Chú Lâm', sao: 1, kn: 'ban_tay',
      nk: { san: { lan: 'B', online: 'C' }, nhip: { chop: 'C', ngan: 'B', dai: 'B', sieu: 'C' },
            the: { baodau: 'C', bamnhip: 'B', nuoimuon: 'B', bungcuoi: 'C' } },
      dau: [60, 70, 60, 75, 70], hop: [0.98, 1.02, 0.98, 1.04, 1.02],
      tieu: 'Đã dẫn 6 đội, chưa vô địch cái nào. Nhưng chưa đội nào xuống hạng.',
      su: ['ke_chuyen', 'nghe_cu', 'so_tay']
    }),
    H({
      id: 'hlv_may', ten: 'Ngọc Máy Tính', biet: 'Cô Số', sao: 1, kn: 'mat_than',
      nk: { san: { lan: 'C', online: 'A' }, nhip: { chop: 'C', ngan: 'B', dai: 'B', sieu: 'C' },
            the: { baodau: 'D', bamnhip: 'B', nuoimuon: 'B', bungcuoi: 'D' } },
      dau: [55, 60, 55, 60, 90], hop: [0.94, 0.98, 0.94, 0.98, 1.12],
      tieu: 'Tin bảng số hơn tin mắt mình. Thường thì bảng số đúng.',
      su: ['bang_tinh', 'so_lieu', 'cai_dat']
    }),
    H({
      id: 'hlv_ly', ten: 'Trịnh Kỷ Luật', biet: 'Thầy Trịnh', sao: 1, kn: 'thep_nguoi',
      nk: { san: { lan: 'B', online: 'C' }, nhip: { chop: 'D', ngan: 'C', dai: 'B', sieu: 'B' },
            the: { baodau: 'E', bamnhip: 'C', nuoimuon: 'B', bungcuoi: 'C' } },
      dau: [55, 85, 55, 90, 60], hop: [0.95, 1.08, 0.95, 1.1, 0.98],
      tieu: '11 giờ tắt máy. Không bàn cãi.',
      su: ['gio_giac', 'phat_the', 'ky_luat_2']
    }),
    H({
      id: 'hlv_vui', ten: 'Mai Vui Vẻ', biet: 'Chị Mai', sao: 1, kn: 'cuop_nhip',
      nk: { san: { lan: 'C', online: 'B' }, nhip: { chop: 'B', ngan: 'B', dai: 'C', sieu: 'D' },
            the: { baodau: 'C', bamnhip: 'B', nuoimuon: 'C', bungcuoi: 'D' } },
      dau: [65, 60, 65, 60, 70], hop: [1.02, 0.98, 1.02, 0.98, 1.04],
      tieu: 'Đội chị chưa vô địch nhưng chưa ai bỏ đi.',
      su: ['di_choi', 'sinh_nhat', 'cuoi_lon']
    })
  ];

  G.HLV_THEO_ID = {};
  G.HLV.forEach(function (h) { G.HLV_THEO_ID[h.id] = h; });

  G.TEN_CHISO = ['CƠ', 'BỀN', 'LỰC', 'LÌ', 'NÃO'];
  G.TEN_CHISO_DAI = ['Cơ · thao tác', 'Bền · thể lực', 'Lực · sức đánh', 'Lì · bản lĩnh', 'Não · tư duy'];
  G.KHOA_CHISO = ['co', 'ben', 'luc', 'li', 'nao'];

  G.TEN_THE = { baodau: 'Bạo Đầu', bamnhip: 'Bám Nhịp', nuoimuon: 'Nuôi Muộn', bungcuoi: 'Bùng Cuối' };
  G.TEN_NHIP = { chop: 'Chớp', ngan: 'Ngắn', dai: 'Dài', sieu: 'Siêu dài' };
  G.TEN_SAN = { lan: 'LAN', online: 'Online' };

  /** một HLV mới toanh trong kho người chơi */
  G.taoHLV = function (id) {
    var g = G.HLV_THEO_ID[id];
    return {
      id: id, uncap: 0, sao: g.sao,
      /* chỉ số "nền" tích luỹ qua các ca đã tốt nghiệp — mỗi ca xong cộng một ít */
      nen: [0, 0, 0, 0, 0],
      soCa: 0, vodich: 0
    };
  };

})(window);
