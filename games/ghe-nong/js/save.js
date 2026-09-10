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
      khoHLV: [],          /* [{id, uncap, nen[5], soCa, vodich}] */
      khoTT: [],           /* [{id, cap, uncap, exp}] */
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

  /** nhận một HLV từ gacha: trùng thì lên uncap, đủ 4 thì đổi thành mảnh */
  G.nhanHLV = function (id) {
    var b = G.coHLV(id);
    if (!b) { G.S.khoHLV.push(G.taoHLV(id)); return { moi: true, uncap: 0 }; }
    if (b.uncap < 4) { b.uncap++; return { moi: false, uncap: b.uncap }; }
    G.S.clb.xu += 300;
    return { moi: false, uncap: 4, thua: true };
  };

  G.nhanTT = function (id) {
    var b = G.coTT(id);
    if (!b) { G.S.khoTT.push(G.taoTuyenThu(id)); return { moi: true, uncap: 0 }; }
    if (b.uncap < 4) { b.uncap++; return { moi: false, uncap: b.uncap }; }
    G.S.clb.xu += 200;
    return { moi: false, uncap: 4, thua: true };
  };

})(window);
