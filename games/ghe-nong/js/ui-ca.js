/* ui-ca.js — màn huấn luyện (bố cục ngang, 3 cột: chỉ số | sân tập | nhật ký).
   Luật thao tác: chạm sân lần 1 = XEM TRƯỚC, chạm lần 2 = CHỐT. Không có hộp xác nhận
   (DESIGN.md §8.2) — trên điện thoại một hộp xác nhận cho mỗi lượt là cực hình. */
(function (G) {
  'use strict';

  var ca = null;
  var sanDangXem = -1;

  G.moManCa = function (c) {
    ca = c;
    sanDangXem = -1;
    G.hienMan('man-ca');
    veTatCa();
  };

  function veTatCa() {
    veTren(); veChiSo(); veDoi(); veSan(); veViec(); veNhatKy();
  }

  /* ── thanh trên ── */
  function veTren() {
    var muc = G.LICH[ca.luot - 1] || {};
    G.$('#ca-luot-so').textContent = ca.luot;
    G.$('#ca-luot-tong').textContent = ca.soLuot;

    var mt = muc.giai ? ('Hôm nay có trận: ' + muc.giai.ten)
      : (muc.gd || '') + ' — trận kế: ' + (tenGiaiKe() || 'hết mùa');
    G.$('#ca-mucteu-chu').textContent = mt;

    var p = ca.theluc / ca.thelucMax;
    G.$('#ca-luc-thanh').style.width = (p * 100) + '%';
    G.$('#ca-luc-so').textContent = ca.theluc + '/' + ca.thelucMax;

    var t = G.TAM[ca.tam];
    var e = G.$('#ca-tam');
    e.textContent = t.ten;
    e.className = 'ca-tam ' + t.lop;
  }

  function tenGiaiKe() {
    for (var i = ca.luot - 1; i < G.LICH.length; i++) if (G.LICH[i].giai) return G.LICH[i].giai.ten;
    return null;
  }

  /* ── cột trái: chỉ số ── */
  function veChiSo() {
    var b = G.xoa(G.$('#bang-chiso'));
    var xt = sanDangXem >= 0 ? G.xemTruoc(ca, sanDangXem) : null;

    for (var i = 0; i < 5; i++) {
      var v = ca.chiso[i], hang = G.hangChu(v), goc = G.hangChuGoc(v);
      var d = G.el('div.cs-dong');
      d.appendChild(G.el('div.cs-ten', { text: G.TEN_CHISO[i] }));
      d.appendChild(G.el('div.cs-hang.h-' + goc, { text: hang }));
      var th = G.el('div.cs-thanh');
      th.appendChild(G.el('i', { style: 'width:' + (v / ca.tran[i] * 100) + '%' }));
      d.appendChild(th);
      var so = G.el('div.cs-so');
      so.textContent = v;
      if (xt && xt.an[i]) so.appendChild(G.el('span.cs-them', { text: ' +' + xt.an[i] }));
      d.appendChild(so);
      b.appendChild(d);
    }

    var dm = G.el('div.cs-diem');
    dm.appendChild(G.el('span', { text: 'Điểm kỹ năng' }));
    var bb = G.el('b', { text: String(ca.diemKN) });
    if (xt && xt.diemKN) bb.textContent = ca.diemKN + ' (+' + xt.diemKN + ')';
    dm.appendChild(bb);
    b.appendChild(dm);

    if (ca.trangThai.length) {
      var tt = G.el('div.cs-diem', { style: 'border-color:#5a2a2a' });
      tt.appendChild(G.el('span', { text: 'Trạng thái xấu' }));
      tt.appendChild(G.el('b', { text: ca.trangThai.map(function (x) { return G.TEN_TRANGTHAI[x]; }).join(', '), style: 'color:#f0a0a0;font-size:11px' }));
      b.appendChild(tt);
    }
  }

  /* ── cột trái dưới: 5 tuyển thủ ── */
  function veDoi() {
    var b = G.xoa(G.$('#bang-doi'));
    b.appendChild(G.el('h4', { text: 'Tuyển thủ trong ca' }));
    ca.tt.forEach(function (id, i) {
      var g = G.TUYENTHU_THEO_ID[id]; if (!g) return;
      var cv = ca.than[i] >= 80;
      var the = G.el('div.tt-the' + (cv ? '.cam' : ''));
      the.appendChild(G.el('div.tt-anh', { text: g.biet.slice(0, 1) }));
      var ph = G.el('div');
      var ten = G.el('div.tt-ten');
      ten.appendChild(G.el('span', { text: g.biet }));
      ten.appendChild(G.el('span.tt-loai.' + G.TT_LOAI_LOP[g.loai], { text: G.TT_LOAI_TEN[g.loai] }));
      ten.appendChild(G.el('span.tt-loai', { text: G.VITRI_THEO_ID[g.vt].tat }));
      ph.appendChild(ten);
      var th = G.el('div.tt-than');
      th.appendChild(G.el('i', { style: 'width:' + ca.than[i] + '%' }));
      ph.appendChild(th);
      ph.appendChild(G.el('div', { text: ca.than[i] + '/100' + (ca.oSan[i] >= 0 ? ' · ' + G.TEN_CHISO[ca.oSan[i]] : ' · vắng'),
        style: 'font-size:10px;color:#8b98a9;margin-top:2px' }));
      the.appendChild(ph);
      the.addEventListener('click', function () { xemTuyenThu(id, i); });
      b.appendChild(the);
    });
  }

  function xemTuyenThu(id, i) {
    var g = G.TUYENTHU_THEO_ID[id];
    var b = G.coTT(id) || { cap: 1, uncap: 0 };
    var n = G.el('div');
    n.appendChild(G.el('div', { html: '<b>' + g.ten + '</b> · ' + g.bac + ' · cấp ' + b.cap +
      ' · ' + G.VITRI_THEO_ID[g.vt].ten + ' ' + '★'.repeat(g.vtSao) }));
    n.appendChild(G.el('div', { text: g.tieu, style: 'color:#8b98a9;margin:6px 0 10px' }));
    n.appendChild(G.el('div', { html: '<b>Chất chơi (khoá cứng):</b> ' +
      g.chat.map(function (c) { return G.CHAT[c].ten; }).join(' · ') + ' — cái tôi ' + g.ego }));
    n.appendChild(G.el('div', { text: g.chat.map(function (c) { return G.CHAT[c].mo; }).join(' '),
      style: 'color:#8b98a9;margin:4px 0 10px;font-size:12.5px' }));

    var tt = G.el('div', { html: '<b>Thông thạo tướng</b>' });
    var lst = G.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px' });
    G.tuongTheoViTri(g.vt).forEach(function (t) {
      var bac = G.thongThao(b.id ? b : { id: id }, t.id) || 'N';
      var m = G.TT_THEO_ID[bac];
      lst.appendChild(G.el('span', { text: t.ten + ' ' + bac,
        style: 'padding:3px 8px;border-radius:6px;background:#111926;border:1px solid #26303f;font-size:12px;color:' + m.mau }));
    });
    tt.appendChild(lst);
    n.appendChild(tt);

    n.appendChild(G.el('div', { html: '<b>Dạy kỹ năng:</b> ' +
      (g.goiY || []).map(function (k) { return (G.knTatCa(k) || {}).ten || k; }).join(', '),
      style: 'margin-top:10px' }));

    G.hop({ dau: g.biet + ' — ' + G.TT_LOAI_TEN[g.loai], node: n });
  }

  /* ── cột giữa: 5 sân ── */
  function veSan() {
    var h = G.xoa(G.$('#hang-san'));
    for (var s = 0; s < 5; s++) (function (s) {
      var xt = G.xemTruoc(ca, s);
      var cv = xt.cauVong;
      var d = G.el('div.san' + (sanDangXem === s ? '.chon' : '') + (cv ? '.cauvong' : ''));

      if (sanDangXem === s) {
        var xem = G.el('div.san-xem');
        for (var i = 0; i < 5; i++) if (xt.an[i]) xem.appendChild(G.el('span', { text: '+' + xt.an[i] + ' ' + G.TEN_CHISO[i] }));
        d.appendChild(xem);
      }

      d.appendChild(G.el('div.san-ten', { text: G.TEN_CHISO[s] }));
      d.appendChild(G.el('div.san-cap', { text: 'Cấp ' + xt.cap + ' · ' + (xt.hao > 0 ? '+' : '') + xt.hao + ' thể lực' }));

      var ng = G.el('div.san-nguoi');
      xt.nguoi.forEach(function (i) {
        var g = G.TUYENTHU_THEO_ID[ca.tt[i]];
        var sp = G.el('span' + (G.cauVong(ca, i, s) ? '.cam' : ''), { text: g.biet.slice(0, 1) });
        if (ca.goiY[i]) sp.appendChild(G.el('em', { text: '!' }));
        ng.appendChild(sp);
      });
      d.appendChild(ng);

      if (sanDangXem === s) d.appendChild(G.el('div.san-mui', { text: '▼' }));

      d.addEventListener('click', function () { chamSan(s); });
      h.appendChild(d);
    })(s);

    var hg = G.$('#ca-hong');
    if (sanDangXem >= 0) {
      var xt2 = G.xemTruoc(ca, sanDangXem);
      hg.hidden = false;
      hg.className = 'ca-hong' + (xt2.hong >= 25 ? ' nguy' : '');
      G.xoa(hg);
      hg.appendChild(document.createTextNode('Hỏng: '));
      hg.appendChild(G.el('b', { text: xt2.hong + '%' }));
      hg.appendChild(document.createTextNode('  —  chạm lần nữa để tập'));
    } else {
      hg.hidden = true;
    }
  }

  function chamSan(s) {
    if (sanDangXem !== s) { sanDangXem = s; veSan(); veChiSo(); return; }
    lamViec({ loai: 'tap', san: s });
  }

  /* ── cột giữa dưới: nút việc ── */
  function veViec() {
    var h = G.xoa(G.$('#hang-viec'));
    var ds = [
      { id: 'nghi', ten: 'Nghỉ' },
      { id: 'xahoi', ten: 'Xả hơi' },
      { id: 'yte', ten: 'Phòng y tế' },
      { id: 'giaoan', ten: 'Giáo án' },
      { id: 'giaohuu', ten: 'Kèo giao hữu' }
    ];
    ds.forEach(function (v) {
      var b = G.el('button.viec', { text: v.ten });
      if (v.id === 'giaohuu' && ca.theluc < 20) b.disabled = true;
      b.addEventListener('click', function () {
        if (v.id === 'giaoan') { moGiaoAn(); return; }
        lamViec({ loai: v.id });
      });
      h.appendChild(b);
    });
  }

  /* ── cột phải: nhật ký ── */
  function veNhatKy() {
    var b = G.xoa(G.$('#nk-than'));
    var ds = ca.log.slice(-14).reverse();
    ds.forEach(function (k, idx) {
      var kh = G.el('div.nk-khoi' + (idx === 0 ? '.moi' : ''));
      kh.appendChild(G.el('div.nk-tieu', { text: 'Lượt ' + k.luot + ' · ' + k.tieu }));
      (k.dong || []).forEach(function (d) {
        var dg = G.el('div.nk-dong');
        dg.appendChild(G.el('span', { text: d.t }));
        if (d.v) {
          dg.appendChild(G.el('b', { text: (d.v > 0 ? '+' : '') + d.v,
            class: d.vang ? 'vang' : (d.v > 0 ? 'len' : 'xuong') }));
        } else if (d.xau) {
          dg.appendChild(G.el('b', { text: '!', class: 'xuong' }));
        }
        kh.appendChild(dg);
      });
      b.appendChild(kh);
    });
  }

  /* ── làm một việc rồi sang lượt ── */
  function lamViec(v) {
    var kq = G.lamViec(ca, v);
    if (!kq) return;

    sanDangXem = -1;

    /* số bay lên khung cảnh */
    var bay = G.$('#ca-bay');
    (kq.dong || []).forEach(function (d, i) {
      if (!d.v) return;
      var mau = d.vang ? '#ffd76e' : (d.v > 0 ? '#3ddc97' : '#e5484d');
      G.soBay(bay, (d.v > 0 ? '+' : '') + d.v + ' ' + d.t, mau, 26 + i * 11, 46 + (i % 3) * 8);
    });

    if (kq.cauVong) { G.rung('vua'); G.phaoHoa(24); }
    if (kq.hong) G.rung('to');

    veTatCa();
    G.luu();

    var chuoi = Promise.resolve();
    if (kq.moCauVong) chuoi = chuoi.then(function () { return G.bangLon('CẦU VỒNG MỞ!', 'tập đúng sân của người ấy để ăn dày', 1300); });
    if (kq.sk) chuoi = chuoi.then(function () { return hienSuKien(kq.sk); });

    chuoi.then(function () { return ketLuot(); });
  }

  function hienSuKien(sk) {
    return new Promise(function (xong) {
      var n = G.el('div');
      var ng = G.el('div.sk-nguoi');
      ng.appendChild(G.el('div.sk-anh', { text: '👤' }));
      var ph = G.el('div');
      if (sk.tenNguoi) ph.appendChild(G.el('div', { text: sk.tenNguoi, style: 'color:#7fd6ff;font-weight:700;margin-bottom:4px' }));
      ph.appendChild(G.el('div', { text: sk.chu }));
      ng.appendChild(ph);
      n.appendChild(ng);

      var ch = G.el('div.sk-chon');
      sk.chon.forEach(function (c, i) {
        ch.appendChild(G.el('button', { text: c.chu, onclick: function () {
          var ghi = G.apSuKien(ca, sk, i);
          G.$('#lop-phu').hidden = true;
          veTatCa();
          var bay = G.$('#ca-bay');
          ghi.forEach(function (d, k) {
            if (!d.v) return;
            G.soBay(bay, (d.v > 0 ? '+' : '') + d.v + ' ' + d.t, d.vang ? '#ffd76e' : (d.v > 0 ? '#3ddc97' : '#e5484d'), 30 + k * 12, 44 + (k % 3) * 9);
          });
          xong();
        } }));
      });
      n.appendChild(ch);

      var phu = G.$('#lop-phu');
      G.xoa(phu);
      var hop = G.el('div.hop');
      hop.appendChild(G.el('div.hop-dau', { text: sk.tieu }));
      var than = G.el('div.hop-than'); than.appendChild(n);
      hop.appendChild(than);
      phu.appendChild(hop);
      phu.hidden = false;
    });
  }

  function ketLuot() {
    var r = G.sangLuot(ca);
    G.luu();

    var chuoi = Promise.resolve();
    if (r.camHung) {
      chuoi = chuoi.then(function () {
        var ghi = G.camHung(ca);
        G.phaoHoa(60);
        G.rung('to');
        veTatCa();
        return G.bangLon('CẢM HỨNG!', 'di sản của người đi trước', 1700);
      });
    }
    if (r.giai) {
      chuoi = chuoi.then(function () { return G.vaoGiai(ca, r.giai); });
    }
    chuoi.then(function () {
      if (ca.xong) return G.ketThucMua(ca);
      veTatCa();
    });
  }

  /* ── màn giáo án (mua kỹ năng) ── */
  function moGiaoAn() {
    var n = G.el('div');
    n.appendChild(G.el('div', { html: 'Điểm kỹ năng: <b style="color:#f2c94c">' + ca.diemKN + '</b>' +
      ' — gợi ý từ tuyển thủ làm kỹ năng rẻ đi tới 45%.', style: 'margin-bottom:10px' }));

    var ds = G.KYNANG.filter(function (k) { return ca.kyNang.indexOf(k.id) < 0; });
    ds.sort(function (a, b) {
      var ha = (ca.hint[a.id] || 0), hb = (ca.hint[b.id] || 0);
      if (ha !== hb) return hb - ha;
      return a.gia - b.gia;
    });

    var lst = G.el('div');
    ds.slice(0, 22).forEach(function (k) {
      var gia = G.giaKyNang(ca, k.id);
      var loi = G.coTheMua(ca, k.id);
      var d = G.el('div', { style: 'display:flex;gap:10px;align-items:center;padding:7px;border-radius:8px;' +
        'background:#111926;border:1px solid #26303f;margin-bottom:6px' });
      var tr = G.el('div', { style: 'flex:1' });
      var ten = G.el('div', { style: 'font-weight:700;font-size:13px' });
      ten.appendChild(G.el('span', { text: k.ten }));
      if (ca.hint[k.id]) ten.appendChild(G.el('span', { text: '  ✦ gợi ý ×' + ca.hint[k.id], style: 'color:#f2c94c;font-size:11px' }));
      tr.appendChild(ten);
      tr.appendChild(G.el('div', { text: k.mota, style: 'font-size:11.5px;color:#8b98a9' }));
      d.appendChild(tr);
      var nut = G.el('button.nut' + (loi ? '' : '.chinh'), { text: gia + ' điểm' });
      if (loi) { nut.disabled = true; nut.style.opacity = .45; }
      nut.addEventListener('click', function () {
        if (G.muaKyNang(ca, k.id)) return;
        G.luu(); G.$('#lop-phu').hidden = true; veTatCa(); moGiaoAn();
      });
      d.appendChild(nut);
      lst.appendChild(d);
    });
    n.appendChild(lst);

    G.hop({ dau: 'Giáo án — mua kỹ năng', node: n, nut: [{ chu: 'Xong', chinh: true }] });
  }

  /* các màn khác gọi lại để vẽ lại */
  G.veLaiCa = veTatCa;

})(window);
