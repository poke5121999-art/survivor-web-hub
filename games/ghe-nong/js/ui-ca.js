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
    if (G.day) G.day('ca');
    var nl = G.$('#ca-nut-lich');
    if (nl && !nl._daGan) {
      nl._daGan = 1;
      nl.addEventListener('click', function () { G.tieng('cham'); G.moBXH('lich'); });
    }
  };

  function veTatCa() {
    veTren(); veRail(); veChiSo(); veSan(); veViec(); veNhatKy(); veCanh();
  }

  /** khung cảnh giữa màn: huấn luyện viên đứng lớn, tuyển thủ có mặt hôm nay đứng quanh */
  function veCanh() {
    var e = G.$('#ca-canh-nen'); if (!e) return;
    G.xoa(e);
    e.className = 'ca-canh-nen co-nguoi';

    var hlv = G.el('div.canh-hlv');
    var a = G.oAnh && G.oAnh(ca.hlvId, 196);
    if (a) hlv.appendChild(a);
    hlv.appendChild(G.el('div.canh-ten', { text: G.HLV_THEO_ID[ca.hlvId].biet }));
    e.appendChild(hlv);

    var hang = G.el('div.canh-hang');
    ca.tt.forEach(function (id, i) {
      var g = G.TUYENTHU_THEO_ID[id];
      var o = G.el('div.canh-tt' + (ca.oSan[i] < 0 ? '.vang' : '') +
        (sanDangXem >= 0 && ca.oSan[i] === sanDangXem ? '.sang' : ''));
      var b = G.oAnh && G.oAnh(id, 96);
      if (b) o.appendChild(b);
      o.appendChild(G.el('div.canh-ten', { text: g.biet + (ca.oSan[i] >= 0 ? ' · ' + G.TEN_CHISO[ca.oSan[i]] : ' · vắng') }));
      if (G.cauVong(ca, i, ca.oSan[i])) o.appendChild(G.el('div.canh-cv', { text: '🌈' }));
      if (ca.goiY[i]) o.appendChild(G.el('div.canh-goiy', { text: '!' }));
      hang.appendChild(o);
    });
    e.appendChild(hang);
  }

  /* ══════════ thanh trên: badge lượt · mục tiêu · thể lực · tâm trạng ══════════
     Bốn khối này lấy đúng của màn Career Uma (ảnh steam/shot05.jpg): badge số lượt có hai
     tai kẹp ở trên, viên thuốc mục tiêu có nút "Chi tiết", thanh thể lực CẦU VỒNG viền đậm,
     và chip tâm trạng bo tròn nằm góc phải. */
  function veTren() {
    var muc = G.LICH[ca.luot - 1] || {};
    G.$('#ca-luot-so').textContent = ca.soLuot - ca.luot + 1;
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
    e.className = 'uma-tam ' + t.lop;
  }

  function tenGiaiKe() {
    for (var i = ca.luot - 1; i < G.LICH.length; i++) if (G.LICH[i].giai) return G.LICH[i].giai.ten;
    return null;
  }

  /* ══════════ rail icon dọc bên phải ══════════ */
  var RAIL = [
    { id: 'bxh', ten: 'Bảng\nxếp hạng', ic: '🏆' },
    { id: 'tin', ten: 'Bản tin', ic: '📰' },
    { id: 'lich', ten: 'Lịch', ic: '📅' },
    { id: 'doi', ten: 'Tuyển thủ', ic: '👥' },
    { id: 'giaoan', ten: 'Kỹ năng', ic: '📗' },
    { id: 'so', ten: 'Sổ tay', ic: '📘' }
  ];

  function veRail() {
    var r = G.xoa(G.$('#ca-rail'));
    RAIL.forEach(function (x) {
      var b = G.el('button');
      b.appendChild(G.el('span.ic-to', { text: x.ic }));
      x.ten.split('\n').forEach(function (d) { b.appendChild(G.el('span', { text: d })); });
      if (x.id === 'tin') {
        var so = G.soTinMoi && G.soTinMoi();
        if (so) b.appendChild(G.el('i.cham', { text: so }));
      }
      if (x.id === 'bxh' && G.hangTa) {
        var ht = G.hangTa();
        b.appendChild(G.el('span', { text: 'hạng ' + ht.hang, style: 'color:#3f8fd0' }));
      }
      b.addEventListener('click', function () {
        G.tieng('cham');
        if (x.id === 'bxh') return G.moBXH();
        if (x.id === 'tin') return G.moBXH('tin');
        if (x.id === 'lich') return G.moBXH('lich');
        if (x.id === 'doi') return moDoiHinh();
        if (x.id === 'giaoan') return moGiaoAn();
        if (x.id === 'so') return G.dayLai && G.dayLai('ca');
      });
      r.appendChild(b);
    });
  }

  /* ══════════ bảng năm chỉ số ══════════
     Đúng cấu trúc của Uma: mỗi ô có dải tiêu đề xanh, dưới là VÒNG TRÒN HẠNG CHỮ rồi số
     hiện tại và "/trần". Ô cuối là điểm kỹ năng, tách riêng bằng màu tiêu đề khác. */
  var MAU_CS = ['#ff8d8d', '#8fd8ff', '#ffc46e', '#ff9ec4', '#a5e86a'];

  function veChiSo() {
    var b = G.xoa(G.$('#bang-chiso'));
    var xt = sanDangXem >= 0 ? G.xemTruoc(ca, sanDangXem) : null;

    for (var i = 0; i < 5; i++) {
      var v = ca.chiso[i], hang = G.hangChu(v), goc = G.hangChuGoc(v);
      var o = G.el('div.uma-cs');
      var dau = G.el('div.uma-cs-dau');
      dau.appendChild(G.el('i', { style: 'background:' + MAU_CS[i] }));
      dau.appendChild(G.el('span', { text: G.TEN_CHISO[i] }));
      o.appendChild(dau);

      var than = G.el('div.uma-cs-than');
      than.appendChild(G.el('div.uma-hang.h-' + goc, { text: hang }));
      var so = G.el('div.uma-cs-so');
      var bb = G.el('b', { text: String(v) });
      if (xt && xt.an[i]) {
        bb.textContent = v + '';
        bb.appendChild(G.el('em', { text: ' +' + xt.an[i],
          style: 'font-style:normal;font-size:12px;color:#3d9c63' }));
      }
      so.appendChild(bb);
      so.appendChild(G.el('span', { text: '/' + ca.tran[i] }));
      than.appendChild(so);
      o.appendChild(than);
      b.appendChild(o);
    }

    var kn = G.el('div.uma-cs.kn');
    kn.appendChild(G.el('div.uma-cs-dau', { text: 'Điểm KN' }));
    var t2 = G.el('div.uma-cs-than');
    var bk = G.el('b', { text: String(ca.diemKN), style: 'font-size:17px;font-weight:900;color:#4a3f48' });
    if (xt && xt.diemKN) bk.appendChild(G.el('em', { text: ' +' + xt.diemKN,
      style: 'font-style:normal;font-size:12px;color:#3d9c63' }));
    t2.appendChild(bk);
    kn.appendChild(t2);
    b.appendChild(kn);
  }

  /* ══════════ năm nút giáo án ══════════
     Viên thuốc bo tròn, icon tròn nhô lên giữa mép trên, cấp sân là chuỗi hạt ở góc, và
     MẶT TUYỂN THỦ có mặt hôm nay xếp thành cụm dưới đáy nút — y như thẻ hỗ trợ đứng trên
     nút tập của Uma. Viền vàng = đang xem trước. */
  var IC_SAN = ['🖱️', '🫀', '💪', '🔥', '🧠'];
  var KHOA_SAN = ['co', 'ben', 'luc', 'li', 'nao'];

  function veSan() {
    var h = G.xoa(G.$('#hang-san'));
    for (var s = 0; s < 5; s++) (function (s) {
      var xt = G.xemTruoc(ca, s);
      var b = G.el('div.uma-nut.' + KHOA_SAN[s] + (sanDangXem === s ? '.chon' : ''));

      b.appendChild(G.el('span.ic-tron', { text: IC_SAN[s] }));

      var cap = G.el('div.uma-cap');
      for (var k = 0; k < 5; k++) cap.appendChild(G.el('i' + (k < xt.cap ? '.co' : '')));
      b.appendChild(cap);

      b.appendChild(G.el('b', { text: G.TEN_CHISO[s] }));
      b.appendChild(G.el('em', { text: (xt.hao > 0 ? '+' : '') + xt.hao + ' thể lực' }));

      var mat = G.el('div.uma-mat');
      xt.nguoi.forEach(function (i) {
        var cv = G.cauVong(ca, i, s);
        var o = G.el('span' + (cv ? '.cam' : ''));
        var a = G.oAnh && G.oAnh(ca.tt[i], 22);
        if (a) o.appendChild(a);
        else o.appendChild(G.el('i', { style: 'background:#cfc8dc' }));
        mat.appendChild(o);
      });
      b.appendChild(mat);

      b.addEventListener('click', function () { chamSan(s); });
      h.appendChild(b);
    })(s);

    var hg = G.$('#ca-hong');
    if (sanDangXem >= 0) {
      var xt2 = G.xemTruoc(ca, sanDangXem);
      hg.hidden = false;
      hg.className = 'uma-hong' + (xt2.hong >= 25 ? ' nguy' : '');
      G.xoa(hg);
      hg.appendChild(document.createTextNode('Tỉ lệ hỏng '));
      hg.appendChild(G.el('b', { text: xt2.hong + '%' }));
      hg.appendChild(document.createTextNode(xt2.cauVong ? '  —  🌈 CẦU VỒNG! chạm lần nữa để tập'
        : '  —  chạm lần nữa để tập'));
    } else {
      hg.hidden = true;
    }
  }

  function chamSan(s) {
    if (sanDangXem !== s) { sanDangXem = s; G.tieng('cham'); veSan(); veChiSo(); veCanh(); return; }
    lamViec({ loai: 'tap', san: s });
  }

  /* ══════════ năm nút việc ══════════ */
  var VIEC = [
    { id: 'nghi', ten: 'Nghỉ', ic: '🛏️', phu: 'hồi thể lực' },
    { id: 'xahoi', ten: 'Xả hơi', ic: '🎡', phu: 'lên tâm trạng' },
    { id: 'yte', ten: 'Y tế', ic: '💊', phu: 'chữa trạng thái' },
    { id: 'giaoan', ten: 'Kỹ năng', ic: '📗', phu: 'tiêu điểm KN' },
    { id: 'giaohuu', ten: 'Giao hữu', ic: '🎮', phu: 'điểm KN + fan' }
  ];

  function veViec() {
    var h = G.xoa(G.$('#hang-viec'));
    VIEC.forEach(function (v) {
      var tat = v.id === 'giaohuu' && ca.theluc < 20;
      var b = G.el('div.uma-nut.v-' + v.id + (tat ? '.tat' : ''));
      b.appendChild(G.el('span.ic-tron', { text: v.ic }));
      b.appendChild(G.el('b', { text: v.ten }));
      b.appendChild(G.el('em', { text: v.phu }));
      if (!tat) b.addEventListener('click', function () {
        if (v.id === 'giaoan') { moGiaoAn(); return; }
        lamViec({ loai: v.id });
      });
      h.appendChild(b);
    });
  }

  /* ══════════ đội hình: hộp thoại từ rail ══════════ */
  function moDoiHinh() {
    var n = G.el('div');
    ca.tt.forEach(function (id, i) {
      var g = G.TUYENTHU_THEO_ID[id];
      var than = ca.than[i], cv = than >= 80;
      var d = G.el('div', { style: 'display:flex;gap:9px;align-items:center;padding:7px;' +
        'border-radius:11px;background:' + (cv ? '#fff6e2' : '#f6f4fb') +
        ';border:2px solid ' + (cv ? '#f0c56e' : '#eae6f4') + ';margin-bottom:6px' });
      var a = G.oAnh && G.oAnh(id, 40);
      if (a) { a.style.borderRadius = '50%'; a.style.flex = 'none'; d.appendChild(a); }
      var ph = G.el('div', { style: 'flex:1;min-width:0' });
      ph.appendChild(G.el('div', { text: g.biet + ' · ' + G.VITRI_THEO_ID[g.vt].ten,
        style: 'font-weight:800;font-size:13px;color:#4a3f48' }));
      var th = G.el('div', { style: 'height:7px;background:#e6e2ef;border-radius:99px;margin-top:4px;overflow:hidden' });
      th.appendChild(G.el('i', { style: 'display:block;height:100%;width:' + than + '%;background:' +
        (cv ? 'linear-gradient(90deg,#ffd76e,#f0932c)' : 'linear-gradient(90deg,#8fd8ff,#3f8fd0)') }));
      ph.appendChild(th);
      ph.appendChild(G.el('div', { text: 'Thân thiết ' + than + '/100' + (cv ? '  🌈 đã mở cầu vồng' : ''),
        style: 'font-size:10.5px;color:#8a7f8f;margin-top:3px' }));
      d.appendChild(ph);
      d.appendChild(G.el('div', { text: G.TT_LOAI_TEN[g.loai],
        style: 'font-size:11px;font-weight:800;color:#6b5c68;flex:none' }));
      d.addEventListener('click', function () { xemTuyenThu(id, i); });
      n.appendChild(d);
    });
    G.hop({ dau: 'Tuyển thủ trong ca', node: n, rong: 520 });
  }

  function veNhatKy() {
    var b = G.xoa(G.$('#nk-than'));
    var ds = ca.log.slice(-14).reverse();
    ds.forEach(function (k, idx) {
      var kh = G.el('div.nk-the' + (idx === 0 ? '.moi' : ''));
      kh.appendChild(G.el('div.nk-tieu', { text: 'Lượt ' + k.luot + ' · ' + k.tieu }));
      (k.dong || []).forEach(function (d) {
        var dg = G.el('div.nk-dong' + (d.vang ? '.vang' : (d.v < 0 || d.xau ? '.xau' : '')));
        dg.appendChild(G.el('span', { text: d.t }));
        if (d.v) dg.appendChild(G.el('b', { text: (d.v > 0 ? '+' : '') + d.v }));
        else if (d.xau) dg.appendChild(G.el('b', { text: '!' }));
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

    if (kq.hong) { G.tieng('hong'); G.rung('to'); }
    else if (kq.cauVong) { G.tieng('cauvong'); G.rung('vua'); G.phaoHoa(24); }
    else if (v.loai === 'tap') G.tieng('tap');
    else G.tieng('chon');
    if (kq.moCauVong) G.tieng('tapTot');

    veTatCa();
    luuCa();

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
    luuCa();

    var chuoi = Promise.resolve();
    if (r.camHung) {
      chuoi = chuoi.then(function () {
        var ghi = G.camHung(ca);
        G.tieng('camhung');
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
      if (ca.xong || ca.dut) return G.ketThucMua(ca);
      /* sau giải thì đang đứng ở màn trận / màn kết quả — phải quay lại màn huấn luyện */
      G.hienMan('man-ca');
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

  /** lưu ca kèm hạt ngẫu nhiên hiện tại */
  function luuCa() {
    if (ca && ca.rng) ca.hat = ca.rng.hat();
    G.S.ca = ca;
    G.luu();
  }

  /* các màn khác gọi lại để vẽ lại */
  G.veLaiCa = veTatCa;

})(window);
