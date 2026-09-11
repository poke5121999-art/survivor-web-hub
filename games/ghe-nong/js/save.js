/* save.js — trạng thái người chơi, lưu vào localStorage.
   Tự lưu sau mỗi lượt và sau mỗi trận; không có nút "Lưu" (DESIGN.md §10.4).
   Nếu hub có cầu nối đám mây (window.HubSave) thì đẩy thêm lên đó, nhưng KHÔNG bao giờ chặn
   người chơi vì chuyện đó — luật bất di bất dịch trong games/BRIDGE.md. */
(function (G) {
  'use strict';

  var KHOA = 'ghenong.save.v1';
  var PHIEN_BAN = 1;

  function moi() {
    return {
      v: PHIEN_BAN,
      clb: { ten: 'CLB Ghế Nóng', mua: 1, xu: 3000, ve: 5, veToiDa: 5, fan: 0, danhVong: 0 },
      khoHLV: [],          /* [{id, uncap, manh, nen[5], soCa, vodich}] */
      khoTT: [],           /* [{id, cap, uncap, manh, exp}] */
      cuu: [],             /* hồ sơ HLV đã tốt nghiệp — dùng làm cựu HLV kế thừa */
      ve: { hlv: 0, tt: 0 },   /* vé pity từng banner */
      ca: null,            /* ca đang chạy */
      mua: null,           /* bảng xếp hạng + bản tin của mùa này (mua.js tự dựng nếu thiếu) */
      lichSu: [],          /* kết quả các mùa đã xong */
      cai: { rung: true, mucSim: 'day', tocDo: 1 },
      day: { hienDraft: false, hienKeThua: false, hienChienThuat: false },
      tao: Date.now()
    };
  }

  G.S = null;

  G.taiSave = function () {
    var t = null;
    try { t = localStorage.getItem(KHOA); } catch (e) { t = null; }
    if (t) {
      try {
        var d = JSON.parse(t);
        if (d && d.v === PHIEN_BAN) { G.S = d; return G.S; }
      } catch (e) { /* hỏng thì bỏ, tạo mới */ }
    }
    G.S = moi();
    G.themKhoiDau();
    return G.S;
  };

  G.luu = function () {
    if (!G.S) return;
    try { localStorage.setItem(KHOA, JSON.stringify(G.S)); } catch (e) { /* hết chỗ thì thôi */ }
    /* đẩy lên hub nếu có — không chờ, không chặn */
    try {
      if (window.HubSave && window.HubSave.isAvailable && window.HubSave.isAvailable()) {
        clearTimeout(G._hen);
        G._hen = setTimeout(function () {
          try { window.HubSave.storeSave('ghe-nong', G.S, { version: PHIEN_BAN }); } catch (e) {}
        }, 1500);
      }
    } catch (e) {}
  };

  G.xoaSave = function () {
    try { localStorage.removeItem(KHOA); } catch (e) {}
    G.S = moi(); G.themKhoiDau(); G.luu();
  };

  /** người mới: cho sẵn 1 HLV 1 sao + 5 tuyển thủ R đủ 5 vị trí, để vào chơi được ngay */
  G.themKhoiDau = function () {
    var S = G.S;
    if (S.khoHLV.length) return;
    S.khoHLV.push(G.taoHLV('hlv_cu'));
    ['tt_nam', 'tt_son', 'tt_long', 'tt_hung', 'tt_vy'].forEach(function (id) {
      S.khoTT.push(G.taoTuyenThu(id));
    });
  };

  /* ── truy vấn kho ── */
  G.coHLV = function (id) {
    for (var i = 0; i < G.S.khoHLV.length; i++) if (G.S.khoHLV[i].id === id) return G.S.khoHLV[i];
    return null;
  };
  G.coTT = function (id) {
    for (var i = 0; i < G.S.khoTT.length; i++) if (G.S.khoTT[i].id === id) return G.S.khoTT[i];
    return null;
  };

  /* ══════════════ MẢNH TRÙNG VÀ MỞ TRẦN ══════════════
     Uma: quay trúng một thẻ đã có thì bản trùng KHÔNG tự dùng — nó rơi vào 保管室
     (kho mảnh), và người chơi phải tự mang tới màn 上限解放 mà tiêu, mỗi bậc ăn đúng
     một bản. Màn ấy bày sẵn cả bốn bậc kèm cái trần mới mà từng bậc mở ra, nên trước
     khi tiêu là đã biết mình đổi cái gì lấy cái gì.

     Bản trước ở đây tự cộng `uncap` ngay lúc quay. Kết quả: một trong những hệ thống
     nuôi quan trọng nhất của game chạy hoàn toàn sau lưng người chơi — dòng chữ "✦2"
     trên thẻ là toàn bộ những gì họ thấy, và không ai đoán ra "✦" nghĩa là trần cấp
     đã nới thêm mười cấp. Giờ mảnh nằm trong kho và phải tự mang đi tiêu. */

  /** mỗi bậc mở trần ăn đúng một mảnh — y Uma */
  G.MANH_MOI_BAC = 1;

  /** nhận một HLV từ gacha: trùng thì thành mảnh nằm chờ trong kho */
  G.nhanHLV = function (id) {
    var b = G.coHLV(id);
    if (!b) { G.S.khoHLV.push(G.taoHLV(id)); return { moi: true, manh: 0 }; }
    b.manh = (b.manh || 0) + 1;
    return { moi: false, manh: b.manh };
  };

  G.nhanTT = function (id) {
    var b = G.coTT(id);
    if (!b) { G.S.khoTT.push(G.taoTuyenThu(id)); return { moi: true, manh: 0 }; }
    b.manh = (b.manh || 0) + 1;
    return { moi: false, manh: b.manh };
  };

  /** thẻ này đang mở trần được không (còn bậc trống VÀ đủ mảnh) */
  G.coMoTran = function (ban) {
    return !!ban && (ban.uncap || 0) < 4 && (ban.manh || 0) >= G.MANH_MOI_BAC;
  };

  /** tiêu mảnh để lên một bậc trần; trả về 1 nếu mở được */
  G.moTran = function (ban) {
    if (!G.coMoTran(ban)) return 0;
    ban.manh -= G.MANH_MOI_BAC;
    ban.uncap = (ban.uncap || 0) + 1;
    G.luu();
    return 1;
  };

  /** đã mở hết bốn bậc thì mảnh thừa đổi lấy xu — đường thoát cho thẻ đã tối đa */
  G.doiManh = function (ban, loai) {
    if (!ban || (ban.manh || 0) < 1) return 0;
    var xu = loai === 'hlv' ? 300 : 200;
    ban.manh--;
    G.S.clb.xu += xu;
    G.luu();
    return xu;
  };

})(window);
