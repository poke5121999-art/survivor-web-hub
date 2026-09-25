/* fx-chieu.js — HIỆU ỨNG RIÊNG CHO TỪNG CHIÊU.

   ┌─ VÌ SAO CÓ TỆP NÀY ───────────────────────────────────────────────────────┐
   │ Bản trước cả bốn mươi chiêu của hai mươi tướng dùng CHUNG hai hình: một   │
   │ vòng loang dưới đất nếu `dien`, một tia sáng nếu không. Xem trận thì thấy │
   │ người đứng cạnh nhau, số trừ bay lên, thỉnh thoảng loé một cái vòng —     │
   │ không đọc ra được ai vừa làm gì.                                          │
   │                                                                          │
   │ Teamfight Manager 2 làm ngược lại: nhìn một giây là biết ai đang đánh     │
   │ thường, ai đang bung chiêu, chiêu gì. Động tác giờ nằm trong sprite TFM2  │
   │ (art/tfm); tệp này lo MỘT BỘ MẶT RIÊNG cho mỗi chiêu.                    │
   └──────────────────────────────────────────────────────────────────────────┘

   Không thể có bốn mươi bộ sprite riêng. Cách giải: art/fx.png có 26 DÁNG gốc,
   còn bảng dưới ghép DÁNG + MÀU + KIỂU BÀY cho từng chiêu. Hai chiêu cùng dùng
   `nolon` mà một cái rơi từ trời xuống màu cam, một cái nổ chùm ba phát màu tím
   thì mắt vẫn phân biệt được ngay.
*/
(function (G) {
  'use strict';

  /* ══════════ HIỆU ỨNG RIÊNG CHO TỪNG CHIÊU ══════════

     khoá = '<id tướng>:chieu' hoặc '<id tướng>:cuoi'

       kieu  cách bày ra màn — ui-tran.js có một hàm vẽ cho mỗi kiểu:
             vong  vòng loang dưới chân người dùng      no    nổ tại mục tiêu
             tia   chùm sáng từ người bắn tới mục tiêu  lao   lao/thọc tới mục tiêu
             ban   bắn một phát, có khói đầu nòng       roi   rơi từ trên trời xuống
             mua   nhiều phát rơi rải trong một vùng    xich  nảy qua nhiều mục tiêu
             khoi  đám mây đọng lại một lúc             aura  hào quang quanh người/đội
             chan  bong bóng khiên                      hoi   lấp lánh hồi máu
       fx    khoá hiệu ứng TFM2 ('hieu.<fx>' trong art/tfm/hinh.js), thiếu thì tra art/fx.png
       mau   màu chủ đạo (viền, tia, chữ)
       r     bán kính / tầm, đơn vị THẾ GIỚI (bản đồ 0..1000)
       n     số lần lặp cho `mua` / `xich` / `mua`
       lau   giây hiệu ứng còn nằm trên màn (mặc định 0.85)
  */
  G.FX_CHIEU = {
    /* ── đường trên ── */
    'kiemsi:chieu':     { kieu: 'vong', fx: 'chem_do', mau: '#ffd76e', r: 120 },
    'kiemsi:cuoi':      { kieu: 'vong', fx: 'luoi_xoay', mau: '#fff0b8', r: 165, n: 3, xoay: 1, lau: 1.6 },
    'cuongchien:chieu': { kieu: 'no',   fx: 'chem_mau',  mau: '#ff6b6b', r: 44 },
    'cuongchien:cuoi':  { kieu: 'aura', fx: 'lua_dung',     mau: '#ff4d4d', r: 62, lau: 1.5 },
    'phaco:chieu':      { kieu: 'vong', fx: 'vong_da',   mau: '#d9a05b', r: 130, rung: 1 },
    'phaco:cuoi':       { kieu: 'aura', fx: 'bua_quet',    mau: '#ffb648', r: 58, lau: 1.4 },
    'thanhkiem:chieu':  { kieu: 'tia',  fx: 'vet_tim', mau: '#fff3c4', r: 30 },
    'thanhkiem:cuoi':   { kieu: 'vong', fx: 'an_thanh',    mau: '#ffe9a8', r: 200, lau: 1.8, doi: 1 },

    /* ── đi rừng ── */
    'kynhan:chieu':     { kieu: 'lao',  fx: 'xung_gio', mau: '#9fd6ff', r: 34 },
    'kynhan:cuoi':      { kieu: 'aura', fx: 'xung_gio',     mau: '#8fe3ff', r: 56, lau: 1.4, doi: 1 },
    'gaosu:chieu':      { kieu: 'no',   fx: 'vuot_toi',    mau: '#ffb36b', r: 40 },
    'gaosu:cuoi':       { kieu: 'aura', fx: 'lua_dung',     mau: '#ff8a3d', r: 54, lau: 1.4 },
    'bongma:chieu':     { kieu: 'lao',  fx: 'hon_nho',     mau: '#b78aff', r: 34 },
    'bongma:cuoi':      { kieu: 'no',   fx: 'tu_than',   mau: '#c89bff', r: 56 },
    'thoisan:chieu':    { kieu: 'no',   fx: 'bay_kep', mau: '#9fe6ff', r: 40 },
    'thoisan:cuoi':     { kieu: 'vong', fx: 'song_lua',    mau: '#9fe6ff', r: 140, n: 3, lau: 1.5 },

    /* ── đường giữa ── */
    'phaposu:chieu':    { kieu: 'ban',  fx: 'no_lua',  mau: '#ff8a3d', r: 26, dan: 'phep' },
    'phaposu:cuoi':     { kieu: 'roi',  fx: 'thien_thach',   mau: '#ff6b3d', r: 150, lau: 1.6, rung: 1 },
    'phapset:chieu':    { kieu: 'xich', fx: 'set_toe',    mau: '#ffe66b', r: 200, n: 3 },
    'phapset:cuoi':     { kieu: 'mua',  fx: 'set_dung',     mau: '#ffe66b', r: 150, n: 6, lau: 1.7 },
    'bongdem:chieu':    { kieu: 'no',   fx: 'mieng_toi',    mau: '#a678ff', r: 42 },
    'bongdem:cuoi':     { kieu: 'vong', fx: 'vong_toi',    mau: '#6b4fa8', r: 175, lau: 1.6, toi: 1 },
    'tuchien:chieu':    { kieu: 'no',   fx: 'chem_mau',  mau: '#ff9ab0', r: 42 },
    'tuchien:cuoi':     { kieu: 'vong', fx: 'vong_trang', mau: '#ff6b8a', r: 120, lau: 1.4 },

    /* ── đường dưới ── */
    'xathu:chieu':      { kieu: 'ban',  fx: 'trung_vang',     mau: '#ffd76e', r: 22, dan: 'ten' },
    'xathu:cuoi':       { kieu: 'mua',  fx: 'ten_bay',     mau: '#ffd76e', r: 140, n: 8, dan: 'ten', lau: 1.6 },
    'sungtruong:chieu': { kieu: 'ban',  fx: 'ngam_tat',     mau: '#ffcf6b', r: 20, dan: 'tia', xa: 1 },
    'sungtruong:cuoi':  { kieu: 'ban',  fx: 'tam_ngam',   mau: '#ff5b5b', r: 48, dan: 'tia', xa: 1, lau: 1.3 },
    'nodoc:chieu':      { kieu: 'khoi', fx: 'khoi_doc',   mau: '#8ce06b', r: 130, lau: 2.4 },
    'nodoc:cuoi':       { kieu: 'no',   fx: 'ran_doc',   mau: '#6bd94a', r: 62, lau: 1.2 },
    'bomxich:chieu':    { kieu: 'roi',  fx: 'no_bom',   mau: '#ff9a3d', r: 95 },
    'bomxich:cuoi':     { kieu: 'mua',  fx: 'khoi_bom',   mau: '#ff7a2d', r: 130, n: 5, lau: 1.6, rung: 1 },

    /* ── hỗ trợ ── */
    'hiepsi:chieu':     { kieu: 'no',   fx: 'khien_bac',    mau: '#8fd8ff', r: 40 },
    'hiepsi:cuoi':      { kieu: 'aura', fx: 'vong_vang',    mau: '#8fd8ff', r: 58, lau: 1.5, doi: 1 },
    'thaythuoc:chieu':  { kieu: 'hoi',  fx: 'vung_hoi',     mau: '#7de3a0', r: 34 },
    'thaythuoc:cuoi':   { kieu: 'aura', fx: 'lap_lanh',     mau: '#7de3a0', r: 62, lau: 1.6, doi: 1 },
    'khienhon:chieu':   { kieu: 'chan', fx: 'khien_bac',    mau: '#9fd6ff', r: 38 },
    'khienhon:cuoi':    { kieu: 'aura', fx: 'khien_bac',    mau: '#b8e6ff', r: 66, lau: 1.7, doi: 1 },
    'nhacsi:chieu':     { kieu: 'ban',  fx: 'not_nhac', mau: '#ffa8e0', r: 28, dan: 'phep' },
    'nhacsi:cuoi':      { kieu: 'aura', fx: 'vong_nhac', mau: '#ffa8e0', r: 60, lau: 1.8, doi: 1 }
  };

  /** tra hiệu ứng của một chiêu; không có thì trả bộ mặc định để không bao giờ trắng màn */
  G.fxChieu = function (tuongId, loai) {
    return G.FX_CHIEU[tuongId + ':' + loai] ||
      (loai === 'cuoi'
        ? { kieu: 'vong', fx: 'no', mau: '#c89bff', r: 130, lau: 1.4 }
        : { kieu: 'no', fx: 'dam', mau: '#7de3ff', r: 40 });
  };

  /* ══════════ KỸ NĂNG RIÊNG CỦA HUẤN LUYỆN VIÊN ══════════
     Đây là thứ chủ dự án gọi là "kỹ năng riêng" — mười kỹ năng ở G.KN_RIENG. Trước
     giờ chúng chỉ là một con số nhân vào sát thương trong `hesoTu()`: không sự kiện,
     không hình, không dòng chữ. Người chơi chọn huấn luyện viên vì kỹ năng ấy mà cả
     trận không thấy nó xuất hiện lần nào.

     Giờ mỗi cái có một hào quang phủ cả đội + một dòng băng, nổ đúng lúc điều kiện
     của nó bật lên (vào giai đoạn đầu/giữa/cuối, hoặc lúc đội bắt đầu bị dí). */
  G.FX_KN_RIENG = {
    lua_som:    { fx: 'lua',     mau: '#ff6b3d', chu: 'LỬA SỚM' },
    thep_nguoi: { fx: 'chan',    mau: '#8fd8ff', chu: 'NGƯỜI THÉP' },
    mat_than:   { fx: 'sao',     mau: '#c89bff', chu: 'MẮT THẦN' },
    ban_tay:    { fx: 'xung',    mau: '#ffd76e', chu: 'BÀN TAY VÀNG' },
    tan_cuoc:   { fx: 'nolon',   mau: '#ff5b5b', chu: 'TÀN CUỘC' },
    keo_dai:    { fx: 'gio',     mau: '#8fe3ff', chu: 'KÉO DÀI' },
    cuop_nhip:  { fx: 'dien',    mau: '#ffe66b', chu: 'CƯỚP NHỊP' },
    giu_nha:    { fx: 'chan',    mau: '#7de3a0', chu: 'GIỮ NHÀ' },
    doc_vi:     { fx: 'saoroi',  mau: '#b78aff', chu: 'ĐỌC VỊ' },
    nuoi_quan:  { fx: 'noluc',   mau: '#8ce06b', chu: 'NUÔI QUÂN' }
  };

})(window);
