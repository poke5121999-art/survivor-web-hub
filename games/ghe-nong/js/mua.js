/* mua.js — MÙA GIẢI: bảng xếp hạng 24 đội, lịch đấu, và bản tin.
   Không đụng DOM. Phần vẽ nằm ở ui-bxh.js.

   Vì sao có tệp này: 24 đội máy trước đây chỉ là một con số `suc` — gặp xong rồi biến mất.
   Người chơi không biết mình đứng thứ mấy, không biết Hổ Xám đang thắng mấy trận liền, nên
   thắng một giải cũng chẳng có cảm giác gì. Thứ tạo ra cạnh tranh không phải trận đấu, mà là
   **cái bảng** người ta soi trước và sau mỗi trận.

   Lấy đúng bố cục của Teamfight Manager 2 (RESEARCH.md §2.13 và ảnh `tfm2/sheets/sheet007`):
     Rankings → Hạng · Đội · Số trận · Thắng · Thua · Hiệu số ván
     News     → danh sách theo ngày, chọn một tin thì hiện chi tiết bên phải

   Cấu trúc:
     G.S.mua = {
       so    : mùa thứ mấy
       vong  : đã chạy bao nhiêu vòng đấu của máy
       bxh   : { <id đội | 'ta'> : {tran, thang, thua, vanT, vanH, diem, phong: ['T','H',…]} }
       tin   : [ {luot, loai, dau, than, doi[], moi} ]  — mới nhất ở đầu
       ck    : chuyển nhượng đã xảy ra (để không lặp)
     }
   Toàn bộ nằm trong bản lưu, nên đóng game mở lại vẫn thấy đúng bảng.
*/
(function (G) {
  'use strict';

  var DIEM_THANG = 3;
  var TIN_TOI_DA = 60;          /* giữ 60 tin gần nhất, cũ hơn thì bỏ */

  /* ══════════════════ mở một mùa ══════════════════ */

  function hangTrong() {
    return { tran: 0, thang: 0, thua: 0, vanT: 0, vanH: 0, diem: 0, phong: [] };
  }

  /* Lịch vòng tròn theo phương pháp vòng xỏay: n đội → n−1 vòng, mỗi vòng mỗi đội đá
     đúng một trận (số đội lẻ thì mỗi vòng có một đội được nghỉ).

     Bản đầu ghép cặp ngẫu nhiên mỗi vòng, và bảng xếp hạng thành vô nghĩa: hết mùa có đội đá
     7 trận, đội khác đá 18 trận, và Mèo Đá yếu nhất giải lại đứng hạng 5 chỉ vì được ra sân nhiều.
     Một cái bảng không công bằng thì không ai soi. */
  function lichVongTron(rng, ds) {
    var t = rng.tron(ds);
    if (t.length % 2) t.push(null);
    var n = t.length, vong = [];
    for (var r = 0; r < n - 1; r++) {
      var cap = [];
      for (var i = 0; i < n / 2; i++) {
        var a = t[i], b = t[n - 1 - i];
        if (a && b) cap.push([a, b]);
      }
      vong.push(cap);
      t.splice(1, 0, t.pop());
    }
    return vong;
  }

  G.moMua = function (so) {
    var m = { so: so || 1, vong: 0, bxh: {}, tin: [], ck: [], bien: {} };
    G.DOI_AI.forEach(function (d) { m.bxh[d.id] = hangTrong(); });
    m.bxh.ta = hangTrong();
    var rng = G.Rng((Date.now() ^ (so * 7919)) & 0x7fffffff);
    m.lich = { vn: lichVongTron(rng, G.DOI_QUOC_NOI), qt: lichVongTron(rng, G.DOI_QUOC_TE) };
    return m;
  };

  /** bảo đảm G.S.mua tồn tại và đúng mùa — gọi được ở bất cứ đâu */
  G.mua = function () {
    if (!G.S) return null;
    if (!G.S.mua || G.S.mua.so !== G.S.clb.mua) {
      G.S.mua = G.moMua(G.S.clb.mua);
      G.tinKhaiMac();
    }
    /* bản lưu cũ có thể thiếu đội mới thêm vào */
    G.DOI_AI.forEach(function (d) { if (!G.S.mua.bxh[d.id]) G.S.mua.bxh[d.id] = hangTrong(); });
    if (!G.S.mua.bxh.ta) G.S.mua.bxh.ta = hangTrong();
    return G.S.mua;
  };

  /* ══════════════════ sức mạnh và tỉ lệ thắng ══════════════════ */

  /** sức hiện tại của một đội máy: sức nền + biến động chuyển nhượng trong mùa */
  G.sucDoi = function (id) {
    var d = G.DOI_THEO_ID[id];
    if (!d) return 0;
    var m = G.mua();
    var them = (m && m.bien && m.bien[id]) || 0;
    return Math.max(30, d.suc + them);
  };

  /** sức quy đổi của CLB người chơi, để đứng cùng thang với đội máy */
  G.sucTa = function () {
    var ca = G.S && G.S.ca;
    if (!ca || !ca.chiso) return 60;
    var t = 0;
    for (var i = 0; i < 5; i++) t += ca.chiso[i];
    return Math.round(t / 5);
  };

  /** xác suất A thắng B — thang Elo, 150 điểm sức = gấp mười lần cửa.
      Để thang 220 thì bảng quốc tế phẳng dính: đội mạnh nhất và yếu nhất cùng 3 thắng. */
  function tiThang(sucA, sucB) {
    return G.kep(1 / (1 + Math.pow(10, (sucB - sucA) / 150)), 0.04, 0.96);
  }
  G.tiThang = tiThang;

  /** chạy một loạt Bo3 bằng số, không dựng trận thật (dùng cho trận của máy với nhau) */
  function daBo3(rng, sucA, sucB) {
    var p = tiThang(sucA, sucB), a = 0, b = 0;
    while (a < 2 && b < 2) { if (rng.duoc(p)) a++; else b++; }
    return [a, b];
  }

  /* ══════════════════ ghi kết quả vào bảng ══════════════════ */

  G.ghiKetQua = function (idA, idB, vanA, vanB) {
    var m = G.mua(); if (!m) return;
    var A = m.bxh[idA], B = m.bxh[idB];
    if (!A || !B) return;
    [[A, vanA, vanB], [B, vanB, vanA]].forEach(function (x) {
      var h = x[0];
      h.tran++;
      h.vanT += x[1]; h.vanH += x[2];
      if (x[1] > x[2]) { h.thang++; h.diem += DIEM_THANG; h.phong.unshift('T'); }
      else { h.thua++; h.phong.unshift('H'); }
      if (h.phong.length > 5) h.phong.length = 5;
    });
  };

  /** bảng đã sắp: điểm → hiệu số ván → số ván thắng */
  G.bangXep = function (khu) {
    var m = G.mua(); if (!m) return [];
    var ds = [];
    if (khu !== 'qt') ds.push({ id: 'ta', ta: true, ten: G.S.clb.ten, tat: 'TA', mau: '#3ddc97', h: m.bxh.ta });
    G.DOI_AI.forEach(function (d) {
      if (khu && d.khu !== khu) return;
      ds.push({ id: d.id, goc: d, ten: d.ten, tat: d.tat, mau: d.mau, h: m.bxh[d.id] || hangTrong() });
    });
    ds.sort(function (a, b) {
      if (b.h.diem !== a.h.diem) return b.h.diem - a.h.diem;
      var ha = a.h.vanT - a.h.vanH, hb = b.h.vanT - b.h.vanH;
      if (hb !== ha) return hb - ha;
      if (b.h.vanT !== a.h.vanT) return b.h.vanT - a.h.vanT;
      return (b.goc ? b.goc.suc : G.sucTa()) - (a.goc ? a.goc.suc : G.sucTa());
    });
    ds.forEach(function (x, i) { x.hang = i + 1; });
    return ds;
  };

  /** hạng hiện tại của CLB người chơi trong bảng quốc nội */
  G.hangTa = function () {
    var b = G.bangXep('vn');
    for (var i = 0; i < b.length; i++) if (b[i].ta) return { hang: b[i].hang, tong: b.length, h: b[i].h };
    return { hang: b.length, tong: b.length, h: hangTrong() };
  };

  /** hạng của một đội máy trong bảng khu của nó */
  G.hangDoi = function (id) {
    var d = G.DOI_THEO_ID[id]; if (!d) return null;
    var b = G.bangXep(d.khu);
    for (var i = 0; i < b.length; i++) if (b[i].id === id) return { hang: b[i].hang, tong: b.length, h: b[i].h };
    return null;
  };

  /* ══════════════════ bản tin ══════════════════ */

  G.themTin = function (loai, dau, than, doi) {
    var m = G.mua(); if (!m) return;
    m.tin.unshift({
      luot: (G.S.ca && G.S.ca.luot) || 0,
      mua: m.so, loai: loai, dau: dau, than: than,
      doi: doi || [], moi: 1
    });
    if (m.tin.length > TIN_TOI_DA) m.tin.length = TIN_TOI_DA;
  };

  G.soTinMoi = function () {
    var m = G.mua(); if (!m) return 0;
    var n = 0;
    m.tin.forEach(function (t) { if (t.moi) n++; });
    return n;
  };

  G.docHetTin = function () {
    var m = G.mua(); if (!m) return;
    m.tin.forEach(function (t) { t.moi = 0; });
  };

  G.tinKhaiMac = function () {
    var m = G.S.mua;
    var vd = G.bangXep('vn').filter(function (x) { return !x.ta; })[0];
    G.themTin('giai', 'Mùa ' + m.so + ' khai mạc',
      'Mười hai đội vào giải quốc nội, bốn suất đi chung kết thế giới. ' +
      (vd ? vd.ten + ' bị coi là ứng viên số một. ' : '') +
      G.S.clb.ten + ' đá trận đầu ở lượt 5.', vd ? [vd.id] : []);
  };

  /* ══════════════════ một vòng đấu của máy ══════════════════
     Gọi sau mỗi lượt huấn luyện. Ghép ngẫu nhiên các đội trong cùng khu (trừ CLB người chơi),
     đá Bo3 bằng số, rồi đẻ ra bản tin. Rẻ tới mức chạy mỗi lượt cũng không thấy. */

  /* Một vòng đấu cứ BA LƯỢT tập một lần → 24 lượt của mùa ra 8 vòng, đúng bằng 8 giải
     của người chơi. Có vậy điểm trên bảng mới so được với CLB của ta. */
  var MOI_MAY_LUOT = 3;

  G.vongDoiMay = function (rng, luot) {
    var m = G.mua(); if (!m) return [];
    if (luot != null && luot % MOI_MAY_LUOT !== 0) return [];
    if (!m.lich) {
      var r0 = G.Rng((Date.now() ^ 12345) & 0x7fffffff);
      m.lich = { vn: lichVongTron(r0, G.DOI_QUOC_NOI), qt: lichVongTron(r0, G.DOI_QUOC_TE) };
    }
    var kq = [];

    ['vn', 'qt'].forEach(function (khu) {
      var ds = m.lich[khu];
      if (!ds || !ds.length) return;
      var cap = ds[m.vong % ds.length];
      cap.forEach(function (c) {
        var sa = G.sucDoi(c[0]), sb = G.sucDoi(c[1]);
        var v = daBo3(rng, sa, sb);
        G.ghiKetQua(c[0], c[1], v[0], v[1]);
        kq.push({ a: c[0], b: c[1], v: v, lech: sa - sb });
      });
    });
    m.vong++;

    /* ── tin từ kết quả: chỉ kể chuyện đáng kể ── */
    kq.forEach(function (r) {
      var A = G.DOI_THEO_ID[r.a], B = G.DOI_THEO_ID[r.b];
      var thangA = r.v[0] > r.v[1];
      var keYeu = thangA ? (r.lech < -60) : (r.lech > 60);
      if (keYeu) {
        var w = thangA ? A : B, l = thangA ? B : A;
        G.themTin('soc', w.ten + ' hạ ' + l.ten + ' ' + Math.max(r.v[0], r.v[1]) + '-' + Math.min(r.v[0], r.v[1]),
          'Không ai nghĩ ' + w.ten + ' làm được. ' + w.tieu + ' Bên kia bàn, ' + l.ten +
          ' rời sân không nói một câu.', [w.id, l.id]);
      }
    });

    /* ── tin từ chuỗi phong độ ── */
    G.DOI_AI.forEach(function (d) {
      var h = m.bxh[d.id];
      if (!h || h.phong.length < 4) return;
      var bon = h.phong.slice(0, 4).join('');
      if (bon === 'TTTT' && !daKe(m, 'chuoi_t_' + d.id)) {
        ke(m, 'chuoi_t_' + d.id);
        var hd = G.hangDoi(d.id);
        G.themTin('chuoi', d.ten + ' thắng bốn trận liền',
          d.tieu + ' Họ đang đứng hạng ' + (hd ? hd.hang : '?') + ' và chưa có dấu hiệu chậm lại. ' +
          'Ngôi sao ' + d.sao + ' được gọi là người chơi hay nhất vòng này.', [d.id]);
      }
      if (bon === 'HHHH' && !daKe(m, 'chuoi_h_' + d.id)) {
        ke(m, 'chuoi_h_' + d.id);
        G.themTin('chuoi', d.ten + ' thua bốn trận liền',
          'Phòng họp của ' + d.ten + ' sáng đèn tới khuya. Có tin ban lãnh đạo đang hỏi giá ' +
          'một huấn luyện viên mới.', [d.id]);
      }
    });

    /* ── chuyển nhượng giữa mùa: đội nào cũng có thể mạnh lên hoặc yếu đi ── */
    if (m.vong >= 3 && rng.duoc(0.34)) chuyenNhuong(rng, m);

    return kq;
  };

  function ke(m, khoa) { m.ck.push(khoa); if (m.ck.length > 120) m.ck.shift(); }
  function daKe(m, khoa) { return m.ck.indexOf(khoa) >= 0; }

  function chuyenNhuong(rng, m) {
    m.bien = m.bien || {};
    var ds = G.DOI_AI.slice();
    var den = rng.chon(ds);
    var di = rng.chon(ds.filter(function (d) { return d.id !== den.id && d.khu === den.khu; }));
    if (!di) return;
    var khoa = 'ck_' + di.id + '_' + den.id;
    if (daKe(m, khoa)) return;
    ke(m, khoa);

    var muc = rng.khoang(10, 26);
    m.bien[den.id] = (m.bien[den.id] || 0) + muc;
    m.bien[di.id] = (m.bien[di.id] || 0) - Math.round(muc * 0.8);

    G.themTin('chuyen', den.ten + ' ký ' + di.sao + ' từ ' + di.ten,
      di.sao + ' rời ' + di.ten + ' sau ' + rng.khoang(1, 4) + ' mùa. ' + den.ten +
      ' trả một khoản phí không công bố. ' + den.tieu +
      '\n\nBan huấn luyện ' + di.ten + ' nói họ đã có người thay, nhưng không ai tin lắm.',
      [den.id, di.id]);
  }

  /* ══════════════════ kết quả của CLB người chơi ══════════════════ */

  G.ghiGiaiCuaTa = function (giai, doiMay, thangTa, thangDich) {
    var m = G.mua(); if (!m) return;
    G.ghiKetQua('ta', doiMay.goc.id, thangTa, thangDich);
    var thang = thangTa > thangDich;
    var ht = G.hangTa();

    G.themTin(thang ? 'ta_thang' : 'ta_thua',
      (thang ? G.S.clb.ten + ' thắng ' : G.S.clb.ten + ' thua ') + doiMay.ten +
      ' ' + thangTa + '-' + thangDich,
      giai.ten + '. ' + (thang
        ? 'Sau trận này ' + G.S.clb.ten + ' đứng hạng ' + ht.hang + '/' + ht.tong + ' giải quốc nội.'
        : doiMay.goc.tieu + ' ' + G.S.clb.ten + ' tụt xuống hạng ' + ht.hang + '/' + ht.tong + '.'),
      [doiMay.goc.id]);
  };

  /* ══════════════════ kết mùa ══════════════════ */

  G.ketMuaBXH = function () {
    var m = G.mua(); if (!m) return null;
    var vn = G.bangXep('vn'), qt = G.bangXep('qt');
    var ht = G.hangTa();
    G.themTin('giai', 'Mùa ' + m.so + ' hạ màn',
      'Vô địch quốc nội: ' + (vn[0] ? vn[0].ten : '?') + '. Đứng đầu thế giới: ' +
      (qt[0] ? qt[0].ten : '?') + '. ' + G.S.clb.ten + ' cán mốc hạng ' + ht.hang + '/' + ht.tong + '.',
      [vn[0] && vn[0].id, qt[0] && qt[0].id].filter(Boolean));
    return { vn: vn, qt: qt, ta: ht };
  };

})(window);
