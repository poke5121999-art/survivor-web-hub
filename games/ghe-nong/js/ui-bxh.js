/* ui-bxh.js — bảng xếp hạng, lịch đấu, bản tin.

   Bố cục lấy đúng của Teamfight Manager 2 (ảnh `tfm2/sheets/sheet007`, RESEARCH.md §2.13):
     giữa  → thanh tab (Quốc nội · Quốc tế · Bản tin · Lịch) rồi bảng
     phải  → khung chi tiết: chọn một tin thì đọc ở đây, còn ở bảng thì hiện đầu bảng và CLB ta

   Bảng có đúng những cột TFM2 có: Hạng · Đội · Trận · Thắng · Thua · Hiệu số ván, thêm cột
   **phong độ 5 trận** vì đó là thứ làm người ta thấy đội kia đang lên hay đang xuống.
*/
(function (G) {
  'use strict';

  var tab = 'vn';
  var tinChon = 0;

  var TAB = [
    { id: 'vn', ten: 'Quốc nội' },
    { id: 'qt', ten: 'Quốc tế' },
    { id: 'tin', ten: 'Bản tin' },
    { id: 'lich', ten: 'Lịch của ta' }
  ];

  /* ══════════ giữa ══════════ */

  G.veBXH = function (g, veLai) {
    var m = G.mua(); if (!m) return;

    var th = G.el('div.bx-tab');
    TAB.forEach(function (t) {
      var so = t.id === 'tin' ? G.soTinMoi() : 0;
      var b = G.el('button' + (tab === t.id ? '.chon' : ''), { text: t.ten });
      if (so) b.appendChild(G.el('i.bx-cham', { text: so }));
      b.addEventListener('click', function () {
        tab = t.id;
        if (tab === 'tin') G.docHetTin();
        G.tieng('cham');
        if (veLai) veLai();
      });
      th.appendChild(b);
    });
    g.appendChild(th);

    if (tab === 'vn' || tab === 'qt') veBang(g, tab);
    else if (tab === 'tin') veTin(g, veLai);
    else veLich(g);
  };

  function o(t) { return G.el('div.bx-o', { text: t }); }

  function veBang(g, khu) {
    var ds = G.bangXep(khu);
    g.appendChild(G.el('div.bx-nhan', {
      text: khu === 'vn' ? 'GIẢI QUỐC NỘI — 12 đội, bốn suất đi chung kết thế giới'
        : 'BẢNG XẾP HẠNG THẾ GIỚI — 13 đội mạnh nhất các khu vực'
    }));

    var b = G.el('div.bx-bang');
    var h = G.el('div.bx-hang.dau');
    h.appendChild(o('#'));
    h.appendChild(G.el('div.bx-o.ten', { text: 'ĐỘI' }));
    ['TRẬN', 'T', 'H', 'HIỆU SỐ', 'PHONG ĐỘ'].forEach(function (c) { h.appendChild(o(c)); });
    b.appendChild(h);

    ds.forEach(function (x) {
      var hs = x.h.vanT - x.h.vanH;
      var d = G.el('div.bx-hang' + (x.ta ? '.ta' : '') + (x.hang <= 4 && khu === 'vn' ? '.top' : ''));
      d.appendChild(G.el('div.bx-o.hang', { text: String(x.hang) }));

      var ten = G.el('div.bx-o.ten');
      ten.appendChild(G.el('i.bx-co', { style: 'background:' + x.mau }));
      ten.appendChild(G.el('b', { text: x.ten }));
      if (x.goc) ten.appendChild(G.el('span.bx-suc', { text: x.goc.tat }));
      d.appendChild(ten);

      d.appendChild(o(String(x.h.tran)));
      d.appendChild(G.el('div.bx-o.t', { text: String(x.h.thang) }));
      d.appendChild(G.el('div.bx-o.h', { text: String(x.h.thua) }));
      d.appendChild(G.el('div.bx-o', { text: (hs > 0 ? '+' : '') + hs }));

      var ph = G.el('div.bx-o.phong');
      if (!x.h.phong.length) ph.appendChild(G.el('span', { text: '—', style: 'color:#5a6675' }));
      x.h.phong.slice(0, 5).forEach(function (k) {
        ph.appendChild(G.el('span.bx-p' + (k === 'T' ? '.t' : '.h'), { text: k }));
      });
      d.appendChild(ph);

      if (x.goc) d.addEventListener('click', function () { hopDoi(x.goc); });
      b.appendChild(d);
    });
    g.appendChild(b);

    g.appendChild(G.el('div.bx-ghi', {
      text: 'Thắng một trận được 3 điểm. Chạm vào một đội để xem họ là ai và đang chơi thế nào.'
    }));
  }

  function veTin(g, veLai) {
    var m = G.mua();
    if (!m.tin.length) {
      g.appendChild(G.el('div.bx-ghi', { text: 'Chưa có tin nào. Cứ tập vài lượt là thế giới sẽ có chuyện.' }));
      return;
    }
    var l = G.el('div.bx-tin', { style: 'max-height:' + (G._bxhTrongHop ? '54vh' : '580px') + ';overflow:auto' });
    m.tin.forEach(function (t, i) {
      var d = G.el('div.bx-tin-o' + (i === tinChon ? '.chon' : '') + (t.moi ? '.moi' : ''));
      d.appendChild(G.el('div.bx-tin-loai', { text: nhanLoai(t.loai) }));
      d.appendChild(G.el('div.bx-tin-dau', { text: t.dau }));
      d.appendChild(G.el('div.bx-tin-luot', { text: t.luot ? 'lượt ' + t.luot : 'trước mùa' }));
      d.addEventListener('click', function () { tinChon = i; G.tieng('cham'); if (veLai) veLai(); });
      l.appendChild(d);
    });
    g.appendChild(l);
  }

  function nhanLoai(l) {
    return { soc: 'GÂY SỐC', chuoi: 'PHONG ĐỘ', chuyen: 'CHUYỂN NHƯỢNG',
      ta_thang: 'CLB CỦA TA', ta_thua: 'CLB CỦA TA', giai: 'GIẢI ĐẤU' }[l] || 'TIN';
  }

  function veLich(g) {
    var ca = G.S.ca;
    g.appendChild(G.el('div.bx-nhan', { text: 'LỊCH THI ĐẤU CỦA ' + G.S.clb.ten.toUpperCase() }));
    var b = G.el('div.bx-lich');
    var xong = {};
    ((ca && ca.thanhTich) || []).forEach(function (t) { xong[t.id] = t; });

    G.LICH.forEach(function (l, i) {
      if (!l.giai) return;
      var gi = l.giai;
      var kq = xong[gi.id];
      var d = G.el('div.bx-lich-o' + (kq ? (kq.thang ? '.thang' : '.thua') : ''));
      d.appendChild(G.el('div.bx-lich-luot', { text: 'Lượt ' + (i + 1) }));
      d.appendChild(G.el('b', { text: gi.ten }));
      d.appendChild(G.el('div.bx-lich-phu', {
        text: gi.the + ' · ' + (gi.sanDau === 'lan' ? 'sân LAN' : 'thi đấu mạng') +
          ' · nhịp ' + G.TEN_NHIP[gi.nhip]
      }));
      d.appendChild(G.el('div.bx-lich-kq', {
        text: kq ? (kq.thang ? 'THẮNG ' : 'THUA ') + (kq.ti || '') + '  ' + kq.doi
          : 'chưa đá · thưởng ' + G.so(gi.thuong.xu) + ' xu'
      }));
      b.appendChild(d);
    });
    g.appendChild(b);
  }

  /* ══════════ phải: khung chi tiết ══════════ */

  G.veBXHPhai = function (p) {
    var m = G.mua(); if (!m) return;

    if (tab === 'tin' && m.tin.length) {
      var t = m.tin[Math.min(tinChon, m.tin.length - 1)];
      p.appendChild(G.el('div.bx-nhan', { text: nhanLoai(t.loai) }));
      p.appendChild(G.el('div.bx-dau', { text: t.dau }));
      t.than.split('\n\n').forEach(function (d) {
        p.appendChild(G.el('div.bx-than', { text: d }));
      });
      (t.doi || []).forEach(function (id) {
        var d = G.DOI_THEO_ID[id]; if (!d) return;
        p.appendChild(theDoiNho(d));
      });
      return;
    }

    /* ở bảng: đầu bảng, và CLB của ta đang ở đâu */
    var khu = tab === 'qt' ? 'qt' : 'vn';
    var ds = G.bangXep(khu);
    p.appendChild(G.el('div.bx-nhan', { text: 'ĐANG DẪN ĐẦU' }));
    ds.slice(0, 3).forEach(function (x) {
      if (x.goc) p.appendChild(theDoiNho(x.goc, x.hang));
      else p.appendChild(G.el('div.bx-ta-dong', { text: x.hang + '. ' + x.ten }));
    });

    if (khu === 'vn') {
      var ht = G.hangTa();
      p.appendChild(G.el('div.bx-nhan', { text: 'CLB CỦA TA', style: 'margin-top:12px' }));
      var k = G.el('div.bx-ta' + (ht.hang <= 4 ? '.top' : ''));
      k.appendChild(G.el('b', { text: 'Hạng ' + ht.hang + '/' + ht.tong }));
      k.appendChild(G.el('div.bx-ta-phu', {
        text: ht.h.tran + ' trận · ' + ht.h.thang + ' thắng · ' + ht.h.thua + ' thua'
      }));
      k.appendChild(G.el('div.bx-ta-nhac', {
        text: ht.hang <= 4 ? 'Đang trong nhóm bốn đội đi chung kết thế giới.'
          : 'Phải vào nhóm bốn đội đầu mới có suất thế giới.'
      }));
      p.appendChild(k);
    }
  };

  function theDoiNho(d, hang) {
    var hd = G.hangDoi(d.id);
    var k = G.el('div.bx-doi');
    var h = G.el('div.bx-doi-dau');
    h.appendChild(G.el('i', { style: 'background:' + d.mau }));
    h.appendChild(G.el('b', { text: (hang ? hang + '. ' : '') + d.ten }));
    h.appendChild(G.el('span', { text: d.khu === 'vn' ? 'quốc nội' : 'quốc tế' }));
    k.appendChild(h);
    k.appendChild(G.el('div.bx-doi-so', {
      text: (hd ? hd.h.thang + 'T ' + hd.h.thua + 'H · hạng ' + hd.hang : '') + ' · sao: ' + d.sao
    }));
    k.appendChild(G.el('div.bx-doi-tieu', { text: d.tieu }));
    k.addEventListener('click', function () { hopDoi(d); });
    return k;
  }

  /* ══════════ hộp thoại một đội ══════════ */

  function hopDoi(d) {
    var hd = G.hangDoi(d.id) || { hang: '?', h: { tran: 0, thang: 0, thua: 0, phong: [] } };
    var n = G.el('div');
    n.appendChild(G.el('div.bx-than', { text: d.tieu }));

    var r = G.el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px' });
    [['Hạng', hd.hang], ['Trận', hd.h.tran], ['Thắng', hd.h.thang], ['Thua', hd.h.thua]].forEach(function (c) {
      var x = G.el('div.bx-so-o');
      x.appendChild(G.el('span', { text: c[0] }));
      x.appendChild(G.el('b', { text: String(c[1]) }));
      r.appendChild(x);
    });
    n.appendChild(r);

    n.appendChild(G.el('div.bx-doi-so', { html: 'Ngôi sao: <b>' + d.sao + '</b>' +
      '  ·  Thế trận: <b>' + (G.TEN_THE[d.the] || d.the) + '</b>' }));

    n.appendChild(G.el('div.bx-nhan', { text: 'TƯỚNG HAY LẤY' }));
    /* Hiện ẢNH tướng chứ không chỉ tên: trước trận người chơi cần nhìn ra ngay đội kia
       hay lấy con nào để mà cấm, và bảng cấm chọn cũng bày đúng những cái mặt đó. */
    var t = G.el('div.uc-chips');
    d.tuong.forEach(function (id) {
      var tu = G.TUONG_THEO_ID[id]; if (!tu) return;
      var o = G.el('span.uc-chip', { style: 'padding-left:2px' });
      var a = G.oAnhTuong && G.oAnhTuong(id, 18);
      if (a) { a.style.borderRadius = '50%'; o.appendChild(a); }
      o.appendChild(G.el('b', { text: tu.ten, style: 'font-weight:800' }));
      t.appendChild(o);
    });
    n.appendChild(t);

    G.hop({ sang: true, dau: d.ten, node: n });
  }

  /* ══════════ mở từ màn huấn luyện ══════════ */

  G.moBXH = function (moTab) {
    if (moTab) { tab = moTab; if (tab === 'tin') G.docHetTin(); }
    G._bxhTrongHop = 1;
    var n = G.el('div');
    function ve() {
      G.xoa(n);
      var l = G.el('div', { style: 'display:grid;grid-template-columns:1fr 268px;gap:12px;align-items:start' });
      var giua = G.el('div');
      var phai = G.el('div', { style: 'background:#f7f6fb;border:2px solid #e6e2ef;border-radius:14px;padding:10px' });
      G.veBXH(giua, ve);
      G.veBXHPhai(phai);
      l.appendChild(giua); l.appendChild(phai);
      n.appendChild(l);
    }
    ve();
    /* `sang: true`: hộp này mở từ rail của màn huấn luyện, tức là đang ở thế giới màu
       Uma. Bảng xếp hạng nền tối lọt vào giữa màn sáng thì trông như một cái cửa sổ của
       game khác. */
    return G.hop({ sang: true, dau: 'Bảng xếp hạng & bản tin', node: n, rong: 1080, cao: '506px',
      nut: [{ chu: 'Đóng', chinh: true }] })
      .then(function (r) { G._bxhTrongHop = 0; return r; });
  };

})(window);
