/* donhay.js — ĐỘ NHẠY: quyết định của người chơi đổi được kết quả trận bao nhiêu?
 *
 *   BIEN=chiso SO_TRAN=60 node _tools/soiAI-node.js _tools/donhay.js
 *
 * `soiAI.js` hỏi "AI có ngu không", `canbang.js` hỏi "tướng nào lệch". Cả hai không trả lời
 * câu hỏi sống còn của một game QUẢN LÝ: cả mùa nuôi quân, cấm chọn, chọn thế trận — rốt cuộc
 * có làm trận đổi chiều không? Nếu mọi nút gạt chỉ dịch tỉ lệ thắng 2–3 điểm thì người chơi
 * đang ngồi xem xúc xắc.
 *
 * Cách đo: hai đội GIỐNG HỆT nhau (cùng tướng, cùng chất, cùng cái tôi), rồi đổi ĐÚNG MỘT
 * biến cho đội A. Mỗi hạt giống đá hai trận — A bên xanh rồi A bên đỏ — để triệt lợi thế
 * bên sân. Trả về tỉ lệ thắng của A kèm sai số chuẩn.
 *
 * BIEN (biến môi trường):
 *   goc      A = B — phải ra ~50%, không thì bộ đo hoặc bản đồ lệch
 *   chiso    A nuôi 900 mọi chỉ số, B 400 (một mùa tốt vs một mùa tệ)
 *   luc      chỉ LỰC: 1000 vs 300, còn lại 600
 *   ben      chỉ BỀN
 *   co       chỉ CƠ
 *   li       chỉ LÌ
 *   nao      chỉ NÃO
 *   thongthao A cầm UR, B cầm N · tt_SR_R: A cầm SR, B cầm R
 *   ego      A cái tôi 10, B cái tôi 85
 *   the_<id> A dùng thế trận <id> (baodau|bamnhip|nuoimuon|bungcuoi) kèm hệ số, B không gì
 *   ct_<id>  chỉ lệnh của thế trận (rồng, rừng, mục tiêu) · hs_<id> chỉ hệ số giai đoạn
 */
(function () {
  'use strict';
  var G = window;
  var env = (typeof process !== 'undefined' && process.env) || {};
  var SO = +env.SO_TRAN || 60;
  var BIEN = env.BIEN || 'goc';
  var VT = ['tren', 'rung', 'giua', 'duoi', 'ho'];
  var CHAT = ['fight', 'farm', 'gank', 'thu', 'le'];

  /* bản sao hệ số thế trận trong ui-draft.js (tệp ấy cần DOM nên Node không nạp) */
  var THE = {
    baodau: { ct: { rong: 'luon', rung: 'gank', mucTieu: 'lao' },
      heso: [{ loai: 'sat', pha: 'dau', muc: 0.05 }, { loai: 'sat', pha: 'cuoi', muc: -0.08 }] },
    bamnhip: { ct: { rong: 'tuy', rung: 'farm', mucTieu: 'poke' },
      heso: [{ loai: 'chiu', pha: 'luon', muc: 0.06 }] },
    nuoimuon: { ct: { rong: 'nhuong', rung: 'farm', mucTieu: 'poke' },
      heso: [{ loai: 'chiu', pha: 'dau', muc: 0.09 }, { loai: 'sat', pha: 'cuoi', muc: 0.16 }] },
    bungcuoi: { ct: { rong: 'nhuong', rung: 'farm', mucTieu: 'poke' },
      heso: [{ loai: 'sat', pha: 'cuoi', muc: 0.30 }, { loai: 'sat', pha: 'dau', muc: -0.07 }] }
  };

  function doi(ten, s, sua) {
    var d = {
      ten: ten, mau: '#fff', chienThuat: {}, heso: { ds: [] },
      nguoi: VT.map(function (vt, i) {
        var t = G.TUONG.filter(function (x) { return x.vt === vt; });
        return {
          vt: vt, tuongId: t[(i + s) % t.length].id, tt: 'SR',
          ten: ten + (i + 1), chat: [CHAT[(i + s) % 5]], ego: 45,
          cs: { co: 600, ben: 600, luc: 600, li: 600, nao: 600 }
        };
      })
    };
    if (sua) sua(d);
    return d;
  }
  function moiNguoi(f) { return function (d) { d.nguoi.forEach(f); }; }
  function mot(k, v) { return moiNguoi(function (n) { n.cs[k] = v; }); }

  var suaA = null, suaB = null;
  if (BIEN === 'chiso') {
    suaA = moiNguoi(function (n) { for (var k in n.cs) n.cs[k] = 900; });
    suaB = moiNguoi(function (n) { for (var k in n.cs) n.cs[k] = 400; });
  } else if (['luc', 'ben', 'co', 'li', 'nao'].indexOf(BIEN) >= 0) {
    suaA = mot(BIEN, 1000); suaB = mot(BIEN, 300);
  } else if (BIEN === 'thongthao') {
    suaA = moiNguoi(function (n) { n.tt = 'UR'; });
    suaB = moiNguoi(function (n) { n.tt = 'N'; });
  } else if (/^tt_/.test(BIEN)) {
    /* tt_SR_R: A cầm SR, B cầm R — một bậc thông thạo đáng bao nhiêu */
    var ba = BIEN.split('_');
    suaA = moiNguoi(function (n) { n.tt = ba[1]; });
    suaB = moiNguoi(function (n) { n.tt = ba[2]; });
  } else if (BIEN === 'ego') {
    suaA = moiNguoi(function (n) { n.ego = 10; });
    suaB = moiNguoi(function (n) { n.ego = 85; });
  } else if (/^(the|ct|hs)_/.test(BIEN)) {
    /* the_ = cả lệnh lẫn hệ số; ct_ = chỉ lệnh (rồng/rừng/mục tiêu); hs_ = chỉ hệ số giai đoạn.
       Tách ra để biết một thế trận thua là do LỆNH hay do SỐ. */
    var th = THE[BIEN.slice(3).replace(/^_/, '')];
    var loaiThe = BIEN.slice(0, 2);
    suaA = function (d) {
      if (loaiThe !== 'hs') d.chienThuat = th.ct;
      if (loaiThe !== 'ct') d.heso = { ds: th.heso.slice() };
    };
  }

  var thangA = 0, n = 0, dai = 0, hetGio = 0, cachVang = 0;
  for (var s = 0; s < SO; s++) {
    for (var ben = 0; ben < 2; ben++) {
      var A = doi('A', s, suaA), B = doi('B', s, suaB);
      var cau = ben === 0 ? { ta: A, dich: B } : { ta: B, dich: A };
      var tran = G.taoTran(cau, 7000 + s * 131);
      var kq = G.chayHet(tran, 40000);
      var mauA = ben === 0 ? 'xanh' : 'do';
      if (kq.thang === mauA) thangA++;
      n++;
      dai += kq.thoiGian;
      if (kq.hetGio) hetGio++;
      cachVang += Math.abs(kq.vang.xanh - kq.vang.do);
    }
  }
  var p = thangA / n;
  return {
    bien: BIEN, tran: n,
    thangA: Math.round(p * 1000) / 10 + '%',
    saiSo: '±' + Math.round(Math.sqrt(p * (1 - p) / n) * 1000) / 10,
    daiTB: Math.round(dai / n), hetGio: Math.round(hetGio / n * 100) + '%',
    lechVangTB: Math.round(cachVang / n)
  };
})();
