/* data-kynang.js — kỹ năng của HLV.
   Kỹ năng KHÔNG đánh nhau trực tiếp; nó sửa "hệ số đội" mà bộ mô phỏng đọc mỗi tick.
   Đúng tinh thần Teamfight Manager 2: chỉ số và kỹ năng đổi HÀNH VI + hệ số, không phải
   cộng thẳng một cục sát thương (RESEARCH.md §2.2).

   hieu = { loai, pha, muc, dk }
     loai : sat      sát thương gây ra
            chiu     giảm sát thương nhận
            chay     tốc độ di chuyển / xoay trở
            vang     tiền kiếm được
            farm     tốc độ dọn lính, quái
            muctieu  sức mạnh khi đánh rồng / chúa hang / trụ
            hoi      hồi máu, khiên
            kc       chống khống chế
            mat      tầm nhìn (biết trước ý đồ địch)
            lat      khả năng lật kèo khi đang thua
            hop      độ ăn ý (giảm sai lầm cá nhân)
     pha  : dau (0–10 phút) · giua (10–22) · cuoi (22+) · luon
     dk   : null | 'thua' | 'thang' | 'ganks' | 'muctieu'
*/
(function (G) {
  'use strict';

  function K(id, ten, mota, gia, loai, pha, muc, dk, bac) {
    return {
      id: id, ten: ten, mota: mota, gia: gia, bac: bac || 'thuong',
      hieu: { loai: loai, pha: pha, muc: muc, dk: dk || null }
    };
  }

  G.KYNANG = [
    /* ── mở đầu trận ── */
    K('bao_dau', 'Bạo Đầu', 'Đội đánh rát 10 phút đầu: +6% sát thương giai đoạn đầu.', 120, 'sat', 'dau', 0.06),
    K('bao_dau_v', 'Bạo Đầu ✦', 'Bản nâng: +11% sát thương giai đoạn đầu.', 320, 'sat', 'dau', 0.11, null, 'vang'),
    K('lane_chac', 'Đứng Đường Chắc', 'Giảm 7% sát thương nhận 10 phút đầu.', 120, 'chiu', 'dau', 0.07),
    K('lane_chac_v', 'Đứng Đường Chắc ✦', 'Giảm 12% sát thương nhận 10 phút đầu.', 320, 'chiu', 'dau', 0.12, null, 'vang'),
    K('an_linh', 'Ăn Lính Sạch', 'Dọn lính nhanh hơn 8%.', 100, 'farm', 'luon', 0.08),
    K('an_linh_v', 'Ăn Lính Sạch ✦', 'Dọn lính nhanh hơn 14% và +5% vàng.', 300, 'farm', 'luon', 0.14, null, 'vang'),
    K('cuop_rung', 'Cướp Rừng', 'Đi rừng nhanh và trộm bãi: +10% tốc dọn quái rừng.', 110, 'farm', 'dau', 0.10),
    K('gank_som', 'Gank Sớm', 'Khi có kèo gank, +12% khả năng chốt mạng.', 140, 'sat', 'dau', 0.12, 'ganks'),

    /* ── giữa trận ── */
    K('nhip_tot', 'Giữ Nhịp', 'Giữ thế trận giữa: +6% mọi mặt trong giai đoạn giữa.', 150, 'hop', 'giua', 0.06),
    K('nhip_tot_v', 'Giữ Nhịp ✦', '+10% mọi mặt trong giai đoạn giữa.', 380, 'hop', 'giua', 0.10, null, 'vang'),
    K('doc_bai', 'Đọc Bài', 'Biết trước ý đồ đối thủ sớm hơn 3 giây.', 160, 'mat', 'luon', 0.12),
    K('doc_bai_v', 'Đọc Bài ✦', 'Biết trước ý đồ đối thủ sớm hơn 6 giây.', 400, 'mat', 'luon', 0.22, null, 'vang'),
    K('cam_mat', 'Cắm Mắt Kín', 'Ít bị bắt lẻ: −10% nguy cơ bị gank.', 130, 'mat', 'giua', 0.10),
    K('doi_lane', 'Đổi Đường Khéo', 'Đổi đường đúng lúc: +8% sức ép lên trụ.', 140, 'muctieu', 'giua', 0.08),
    K('an_rong', 'Ăn Rồng Gọn', '+12% sức mạnh khi đánh rồng và chúa hang.', 170, 'muctieu', 'luon', 0.12),
    K('an_rong_v', 'Ăn Rồng Gọn ✦', '+20% sức mạnh khi đánh mục tiêu lớn.', 420, 'muctieu', 'luon', 0.20, null, 'vang'),
    K('day_le', 'Đẩy Lẻ', 'Người đi lẻ +14% tốc phá trụ.', 150, 'muctieu', 'giua', 0.14),

    /* ── cuối trận ── */
    K('cuoi_manh', 'Bùng Cuối', '+8% sát thương từ phút 22.', 180, 'sat', 'cuoi', 0.08),
    K('cuoi_manh_v', 'Bùng Cuối ✦', '+14% sát thương từ phút 22.', 450, 'sat', 'cuoi', 0.14, null, 'vang'),
    K('giao_tranh', 'Giao Tranh Tổng', 'Đánh tổng 5v5: +9% sát thương và hồi máu.', 200, 'hop', 'cuoi', 0.09),
    K('giao_tranh_v', 'Giao Tranh Tổng ✦', 'Đánh tổng 5v5: +15%.', 480, 'hop', 'cuoi', 0.15, null, 'vang'),
    K('ket_gon', 'Kết Trận Gọn', 'Khi đang dẫn: +12% tốc phá nhà chính.', 190, 'muctieu', 'cuoi', 0.12, 'thang'),
    K('khong_hoang', 'Không Hoảng', 'Khi đang thua: giảm 10% sai lầm cá nhân.', 190, 'lat', 'luon', 0.10, 'thua'),
    K('khong_hoang_v', 'Không Hoảng ✦', 'Khi đang thua: giảm 18% sai lầm.', 460, 'lat', 'luon', 0.18, 'thua', 'vang'),
    K('lat_keo', 'Lật Kèo', 'Thua trên 3000 vàng thì +14% sát thương.', 220, 'lat', 'luon', 0.14, 'thua'),

    /* ── nền ── */
    K('the_luc', 'Nền Thể Lực', 'Không tụt phong độ về cuối: giữ 100% chỉ số sau phút 25.', 200, 'chiu', 'cuoi', 0.10),
    K('binh_tinh', 'Bình Tĩnh', 'Chống khống chế tốt hơn 10%.', 140, 'kc', 'luon', 0.10),
    K('an_y', 'Ăn Ý', 'Cả đội +5% mọi mặt.', 260, 'hop', 'luon', 0.05),
    K('an_y_v', 'Ăn Ý ✦', 'Cả đội +9% mọi mặt.', 600, 'hop', 'luon', 0.09, null, 'vang'),
    K('hoi_phuc', 'Hồi Phục Tốt', 'Hồi máu và khiên +12%.', 150, 'hoi', 'luon', 0.12),
    K('kinh_te', 'Kinh Tế Sạch', '+7% vàng cả đội.', 160, 'vang', 'luon', 0.07),
    K('kinh_te_v', 'Kinh Tế Sạch ✦', '+12% vàng cả đội.', 400, 'vang', 'luon', 0.12, null, 'vang'),
    K('xoay_so', 'Xoay Trở', '+8% tốc di chuyển đội hình.', 130, 'chay', 'luon', 0.08),
    K('lam_quen', 'Nhanh Quen Tướng', 'Tướng thông thạo thấp bớt bị phạt 40%.', 210, 'hop', 'luon', 0.07),
    K('ap_luc', 'Chịu Áp Lực Sân', 'Đấu LAN không bị trừ chỉ số.', 180, 'hop', 'luon', 0.06),
    K('doc_tuong', 'Đọc Bài Cấm', 'Cấm/chọn khôn hơn: đối thủ mất 1 lượt cấm hiệu quả.', 240, 'mat', 'luon', 0.15)
  ];

  G.KN_THEO_ID = {};
  G.KYNANG.forEach(function (k) { G.KN_THEO_ID[k.id] = k; });

  /* kỹ năng vàng cần bản thường tương ứng */
  G.KN_CAN = {
    bao_dau_v: 'bao_dau', lane_chac_v: 'lane_chac', an_linh_v: 'an_linh',
    nhip_tot_v: 'nhip_tot', doc_bai_v: 'doc_bai', an_rong_v: 'an_rong',
    cuoi_manh_v: 'cuoi_manh', giao_tranh_v: 'giao_tranh', khong_hoang_v: 'khong_hoang',
    an_y_v: 'an_y', kinh_te_v: 'kinh_te'
  };

  /* kỹ năng riêng của HLV — không mua được, gắn theo nhân vật */
  function R(id, ten, mota, loai, pha, muc, dk) {
    return { id: id, ten: ten, mota: mota, bac: 'rieng', gia: 0, hieu: { loai: loai, pha: pha, muc: muc, dk: dk || null } };
  }
  G.KN_RIENG = {
    lua_som: R('lua_som', 'Lửa Sớm', 'Mười phút đầu đội đánh như lên đồng: +12% sát thương, +8% tốc chạy.', 'sat', 'dau', 0.12),
    thep_nguoi: R('thep_nguoi', 'Người Thép', 'Khi thua trên 2000 vàng: giảm 16% sát thương nhận.', 'chiu', 'luon', 0.16, 'thua'),
    mat_than: R('mat_than', 'Mắt Thần', 'Luôn biết trước mục tiêu lớn 8 giây: +18% khả năng cướp.', 'muctieu', 'luon', 0.18),
    ban_tay: R('ban_tay', 'Bàn Tay Vàng', 'Cả đội +7% mọi mặt suốt trận.', 'hop', 'luon', 0.07),
    tan_cuoc: R('tan_cuoc', 'Tàn Cuộc', 'Từ phút 25: +20% sát thương.', 'sat', 'cuoi', 0.20),
    keo_dai: R('keo_dai', 'Kéo Dài', 'Trận càng dài đội càng khoẻ: +1% mỗi phút, tối đa +18%.', 'hop', 'cuoi', 0.18),
    cuop_nhip: R('cuop_nhip', 'Cướp Nhịp', 'Sau mỗi mạng hạ được, cả đội +4% tốc đánh trong 30 giây.', 'sat', 'giua', 0.14),
    giu_nha: R('giu_nha', 'Giữ Nhà', 'Khi thủ trong nhà: giảm 22% sát thương nhận.', 'chiu', 'luon', 0.22, 'thua'),
    doc_vi: R('doc_vi', 'Đọc Vị', 'Đối thủ mất 2 lượt cấm hiệu quả.', 'mat', 'luon', 0.25),
    nuoi_quan: R('nuoi_quan', 'Nuôi Quân', '+14% vàng, +10% tốc dọn lính.', 'vang', 'luon', 0.14)
  };

  G.knTatCa = function (id) { return G.KN_THEO_ID[id] || G.KN_RIENG[id] || null; };

})(window);
