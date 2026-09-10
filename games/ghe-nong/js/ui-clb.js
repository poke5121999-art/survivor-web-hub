/* ui-clb.js — màn CLB: menu dọc bên trái, nội dung ở giữa, tóm tắt bên phải.
   Bố cục bê nguyên của Teamfight Manager 2 (RESEARCH.md §2.1) vì nó hợp màn ngang:
   menu dọc · nội dung · nút hành động chính ở góc phải. */
(function (G) {
  'use strict';

  var trang = 'ca';
  var chon = { hlv: null, tt: [], cuu: [] };

  var MENU = [
    { id: 'ca', ten: 'Ca huấn luyện' },
    { id: 'gacha', ten: 'Tuyển mộ' },
    { id: 'hlv', ten: 'Huấn luyện viên' },
    { id: 'tt', ten: 'Tuyển thủ' },
    { id: 'cuu', ten: 'Gia phả' },
    { id: 'ky', ten: 'Sổ tay' }
  ];

  G.moManCLB = function (t) {
    if (t) trang = t;
    G.hienMan('man-clb');
    veTren(); veMenu(); veGiua(); vePhai();
  };

  function veTren() {
    var S = G.S;
    G.$('#clb-ten').textContent = S.clb.ten;
    G.$('#clb-mua').textContent = 'Mùa ' + S.clb.mua;
    G.$('#vi-xu').textContent = G.so(S.clb.xu);
    G.$('#vi-ve').textContent = S.clb.ve + '/' + S.clb.veToiDa;
    G.$('#vi-fan').textContent = G.tien(S.clb.fan);
  }

  function veMenu() {
    var m = G.xoa(G.$('#clb-menu'));
    MENU.forEach(function (x) {
      m.appendChild(G.el('button' + (trang === x.id ? '.chon' : ''), {
        text: x.ten, onclick: function () { trang = x.id; veMenu(); veGiua(); vePhai(); }
      }));
    });
    m.appendChild(G.el('div.vach'));
    m.appendChild(G.el('button', { text: 'Cài đặt', onclick: moCaiDat }));
  }

  function vePhai() {
    var p = G.xoa(G.$('#clb-phai'));
    var S = G.S;

    if (S.ca) {
      p.appendChild(G.el('div', { text: 'CA ĐANG CHẠY', style: 'font-size:11px;color:#8b98a9;letter-spacing:.08em' }));
      var g = G.HLV_THEO_ID[S.ca.hlvId];
      p.appendChild(G.el('div', { text: g.ten, style: 'font-size:17px;font-weight:800;margin:6px 0' }));
      p.appendChild(G.el('div', { text: 'Lượt ' + S.ca.luot + '/' + S.ca.soLuot, style: 'color:#8b98a9;font-size:12px' }));
      var th = G.el('div', { style: 'height:6px;background:#0a1017;border-radius:99px;overflow:hidden;margin:8px 0 14px' });
      th.appendChild(G.el('i', { style: 'display:block;height:100%;width:' + (S.ca.luot / S.ca.soLuot * 100) + '%;background:#3ddc97' }));
      p.appendChild(th);
      p.appendChild(G.el('button.nut.chinh', { text: '▶  Vào ca', style: 'width:100%', onclick: function () {
        G.moManCa(hoiSinhCa(S.ca));
      } }));
      p.appendChild(G.el('button.nut', { text: 'Bỏ ca này', style: 'width:100%;margin-top:8px', onclick: function () {
        G.hop({ dau: 'Bỏ ca?', html: 'Mọi thứ đã nuôi trong ca sẽ mất, không để lại gì cả.',
          nut: [{ chu: 'Bỏ', do: true, gt: 1 }, { chu: 'Thôi', gt: 0, chinh: true }] })
          .then(function (r) { if (r) { G.S.ca = null; G.luu(); G.moManCLB(); } });
      } }));
      return;
    }

    p.appendChild(G.el('div', { text: 'BẮT ĐẦU MÙA MỚI', style: 'font-size:11px;color:#8b98a9;letter-spacing:.08em' }));
    p.appendChild(G.el('div', { text: 'Chọn 1 huấn luyện viên, 5 tuyển thủ đủ 5 vị trí, và 2 cựu huấn luyện viên để kế thừa.',
      style: 'font-size:12.5px;color:#8b98a9;margin:8px 0 12px;line-height:1.6' }));

    var ok = chon.hlv && chon.tt.length === 5 && G.duDoiHinh(chon.tt).du;
    var b = G.el('button.nut' + (ok ? '.chinh' : ''), { text: 'Bắt đầu ca', style: 'width:100%' });
    if (!ok) { b.disabled = true; b.style.opacity = .45; }
    b.addEventListener('click', batDauCa);
    p.appendChild(b);

    p.appendChild(G.el('div', { html: trangThaiChon(), style: 'font-size:12px;color:#8b98a9;margin-top:12px;line-height:1.7' }));
  }

  function trangThaiChon() {
    var s = [];
    s.push('HLV: ' + (chon.hlv ? '<b style="color:#e6edf5">' + G.HLV_THEO_ID[chon.hlv].ten + '</b>' : '—'));
    s.push('Tuyển thủ: <b style="color:#e6edf5">' + chon.tt.length + '/5</b>');
    if (chon.tt.length) {
      var d = G.duDoiHinh(chon.tt);
      if (!d.du) s.push('<span style="color:#e5484d">Thiếu: ' + d.thieu.map(function (v) { return G.VITRI_THEO_ID[v].ten; }).join(', ') + '</span>');
      if (d.thua.length) s.push('<span style="color:#f2c94c">Trùng vị trí: ' + d.thua.map(function (v) { return G.VITRI_THEO_ID[v].ten; }).join(', ') + '</span>');
    }
    s.push('Cựu HLV: <b style="color:#e6edf5">' + chon.cuu.length + '/2</b>');
    return s.join('<br>');
  }

  /* ══════════ trang giữa ══════════ */
  function veGiua() {
    var g = G.xoa(G.$('#clb-giua'));
    if (trang === 'ca') return veChonCa(g);
    if (trang === 'gacha') return veGacha(g);
    if (trang === 'hlv') return veKhoHLV(g);
    if (trang === 'tt') return veKhoTT(g);
    if (trang === 'cuu') return veGiaPha(g);
    if (trang === 'ky') return veSoTay(g);
  }

  function tieu(g, chu, phu) {
    g.appendChild(G.el('div', { text: chu, style: 'font-size:17px;font-weight:800' }));
    if (phu) g.appendChild(G.el('div', { text: phu, style: 'font-size:12.5px;color:#8b98a9;margin:4px 0 12px' }));
  }

  /* ── chọn đội cho ca ── */
  function veChonCa(g) {
    if (G.S.ca) {
      tieu(g, 'Đang có một ca dở dang', 'Bấm "Vào ca" bên phải để chơi tiếp.');
      return;
    }
    tieu(g, 'Chuẩn bị mùa giải', 'Vị trí của tuyển thủ là khoá cứng — phải đủ 5 vị trí mới ra sân được.');

    g.appendChild(G.el('div', { text: 'HUẤN LUYỆN VIÊN', style: nhanNho() }));
    var h = G.el('div', { style: luoi(148) });
    G.S.khoHLV.forEach(function (b) {
      var goc = G.HLV_THEO_ID[b.id];
      h.appendChild(theHLV(goc, b, chon.hlv === b.id, function () {
        chon.hlv = (chon.hlv === b.id ? null : b.id); veGiua(); vePhai();
      }));
    });
    g.appendChild(h);

    g.appendChild(G.el('div', { text: 'TUYỂN THỦ  (chọn 5, đủ 5 vị trí)', style: nhanNho() }));
    var t = G.el('div', { style: luoi(132) });
    var theoVT = { tren: [], rung: [], giua: [], duoi: [], ho: [] };
    G.S.khoTT.forEach(function (b) {
      var goc = G.TUYENTHU_THEO_ID[b.id]; if (goc) theoVT[goc.vt].push(b);
    });
    ['tren', 'rung', 'giua', 'duoi', 'ho'].forEach(function (vt) {
      theoVT[vt].forEach(function (b) {
        var goc = G.TUYENTHU_THEO_ID[b.id];
        t.appendChild(theTT(goc, b, chon.tt.indexOf(b.id) >= 0, function () {
          var i = chon.tt.indexOf(b.id);
          if (i >= 0) chon.tt.splice(i, 1);
          else if (chon.tt.length < 5) chon.tt.push(b.id);
          veGiua(); vePhai();
        }));
      });
    });
    g.appendChild(t);

    if (G.S.cuu.length) {
      g.appendChild(G.el('div', { text: 'CỰU HUẤN LUYỆN VIÊN  (chọn tối đa 2)', style: nhanNho() }));
      var c = G.el('div', { style: luoi(160) });
      G.S.cuu.slice(0, 12).forEach(function (hs, i) {
        c.appendChild(theCuu(hs, i, chon.cuu.indexOf(i) >= 0, function () {
          var k = chon.cuu.indexOf(i);
          if (k >= 0) chon.cuu.splice(k, 1);
          else if (chon.cuu.length < 2) chon.cuu.push(i);
          veGiua(); vePhai();
        }));
      });
      g.appendChild(c);
    }
  }

  function nhanNho() { return 'font-size:11px;color:#8b98a9;letter-spacing:.08em;margin:14px 0 7px'; }
  function luoi(w) { return 'display:grid;grid-template-columns:repeat(auto-fill,minmax(' + w + 'px,1fr));gap:8px'; }

  function theHLV(goc, b, dangChon, cb) {
    var d = G.el('div', { style: 'padding:9px;border-radius:11px;background:#111926;cursor:pointer;border:1px solid ' +
      (dangChon ? '#3ddc97' : '#26303f') + (dangChon ? ';box-shadow:0 0 0 2px #3ddc9744' : '') });
    d.appendChild(G.el('div', { text: '★'.repeat(goc.sao), style: 'color:#f2c94c;font-size:12px' }));
    d.appendChild(G.el('div', { text: goc.ten, style: 'font-weight:800;font-size:13px;margin:2px 0' }));
    d.appendChild(G.el('div', { text: '"' + goc.biet + '"' + (b.uncap ? '  ✦' + b.uncap : ''), style: 'font-size:11px;color:#8b98a9' }));
    var nk = goc.nk;
    d.appendChild(G.el('div', { html: 'Thế trận: <b>' + tenTheManh(nk.the) + '</b><br>Sân: <b>' + tenTheManh(nk.san, G.TEN_SAN) + '</b>',
      style: 'font-size:11px;color:#8b98a9;margin-top:5px;line-height:1.5' }));
    d.addEventListener('click', cb);
    return d;
  }

  function tenTheManh(nhom, ten) {
    var best = null, bh = -1;
    for (var k in nhom) {
      var i = G.THU_TU_NK.indexOf(nhom[k]);
      if (i > bh) { bh = i; best = k; }
    }
    var t = ten ? ten[best] : (G.TEN_THE[best] || G.TEN_NHIP[best] || best);
    return t + ' ' + nhom[best];
  }

  function theTT(goc, b, dangChon, cb) {
    var d = G.el('div', { style: 'padding:8px;border-radius:10px;background:#111926;cursor:pointer;border:1px solid ' +
      (dangChon ? '#3ddc97' : '#26303f') + (dangChon ? ';box-shadow:0 0 0 2px #3ddc9744' : '') });
    var h = G.el('div', { style: 'display:flex;justify-content:space-between;align-items:center' });
    h.appendChild(G.el('b', { text: goc.biet, style: 'font-size:13px' }));
    h.appendChild(G.el('span', { text: goc.bac, style: 'font-size:10px;padding:1px 5px;border-radius:4px;background:#1d2838;color:' +
      (goc.bac === 'SSR' ? '#ffd76e' : goc.bac === 'SR' ? '#b08af0' : '#8b98a9') }));
    d.appendChild(h);
    d.appendChild(G.el('div', { text: G.VITRI_THEO_ID[goc.vt].ten + ' · ' + G.TT_LOAI_TEN[goc.loai] + ' · c' + b.cap,
      style: 'font-size:11px;color:#8b98a9;margin-top:3px' }));
    d.appendChild(G.el('div', { text: goc.chat.map(function (c) { return G.CHAT[c].ten; }).join(' · '),
      style: 'font-size:10.5px;color:#6fc4f0;margin-top:3px' }));
    d.addEventListener('click', cb);
    return d;
  }

  function theCuu(hs, i, dangChon, cb) {
    var d = G.el('div', { style: 'padding:8px;border-radius:10px;background:#111926;cursor:pointer;border:1px solid ' +
      (dangChon ? '#f2c94c' : '#26303f') });
    d.appendChild(G.el('b', { text: hs.ten, style: 'font-size:12.5px' }));
    d.appendChild(G.el('div', { text: 'Mùa ' + hs.mua + ' · thắng ' + hs.thang + ' giải', style: 'font-size:11px;color:#8b98a9;margin:3px 0' }));
    var sp = G.el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;margin-top:4px' });
    (hs.sparks || []).forEach(function (s) {
      var mau = s.mau === 'xanh' ? '#4a9df8' : s.mau === 'hong' ? '#ff8fb0' : s.mau === 'la' ? '#3ddc97' : '#c8d3e0';
      sp.appendChild(G.el('span', { text: tenSpark(s), style: 'font-size:10px;padding:1px 5px;border-radius:4px;background:#0a1017;color:' + mau }));
    });
    d.appendChild(sp);
    d.addEventListener('click', cb);
    return d;
  }

  function tenSpark(s) {
    var sao = '★'.repeat(s.sao);
    if (s.mau === 'xanh') return G.TEN_CHISO[G.SAN.indexOf(s.khoa)] + sao;
    if (s.mau === 'hong') return (G.TEN_THE[s.khoa] || G.TEN_NHIP[s.khoa] || G.TEN_SAN[s.khoa] || s.khoa) + sao;
    if (s.mau === 'la') return 'Giáo án' + sao;
    return ((G.knTatCa(s.kn) || {}).ten || 'Bài học') + sao;
  }

  function batDauCa() {
    var cuu = chon.cuu.map(function (i) { return G.S.cuu[i]; });
    var ca = G.moCa(chon.hlv, chon.tt, cuu);
    G.S.ca = ca;               /* giữ nguyên tham chiếu: JSON.stringify tự bỏ qua hàm rng */
    G.luu();
    G.moManCa(ca);
  }

  /* ca có chứa hàm rng — lưu thì bỏ hàm, nạp lại thì dựng lại từ hạt giống */
  function luuCa(ca) {
    var c = {};
    for (var k in ca) if (k !== 'rng') c[k] = ca[k];
    c.hat = ca.rng.hat();
    return c;
  }
  function hoiSinhCa(c) {
    c.rng = G.Rng(c.hat || 1);
    return c;
  }
  G.luuCa = luuCa; G.hoiSinhCa = hoiSinhCa;

  /* ── gacha ── */
  function veGacha(g) {
    tieu(g, 'Tuyển mộ', 'Tỉ lệ lấy đúng của Uma Musume: bậc cao nhất 3%, giữa 18%, thấp 79%. Quay 10 chắc chắn có ít nhất một cái bậc 2 trở lên. Đủ 200 vé thì tự chọn.');

    [['hlv', 'Banner Huấn Luyện Viên', G.HLV, 'sao'], ['tt', 'Banner Tuyển Thủ', G.TUYENTHU, 'bac']].forEach(function (x) {
      var loai = x[0];
      var k = G.el('div', { style: 'padding:12px;border-radius:12px;background:linear-gradient(135deg,#16202c,#101823);' +
        'border:1px solid #26303f;margin-bottom:12px' });
      k.appendChild(G.el('div', { text: x[1], style: 'font-size:15px;font-weight:800' }));
      k.appendChild(G.el('div', { text: 'Vé đổi: ' + G.S.ve[loai] + '/200', style: 'font-size:12px;color:#8b98a9;margin:4px 0 8px' }));
      var th = G.el('div', { style: 'height:6px;background:#0a1017;border-radius:99px;overflow:hidden;margin-bottom:10px' });
      th.appendChild(G.el('i', { style: 'display:block;height:100%;width:' + (G.S.ve[loai] / 200 * 100) + '%;background:linear-gradient(90deg,#4a9df8,#ffd76e)' }));
      k.appendChild(th);
      var hang = G.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' });
      hang.appendChild(G.el('button.nut', { text: 'Quay 1 · 150 xu', onclick: function () { quay(loai, 1); } }));
      hang.appendChild(G.el('button.nut.chinh', { text: 'Quay 10 · 1500 xu', onclick: function () { quay(loai, 10); } }));
      hang.appendChild(G.el('button.nut', { text: 'Xem tỉ lệ', onclick: function () {
        G.hop({ dau: 'Tỉ lệ', html:
          '<table style="width:100%;font-size:13px"><tr><td>Bậc cao (SSR / 3★)</td><td align="right"><b>3.000%</b></td></tr>' +
          '<tr><td>Bậc giữa (SR / 2★)</td><td align="right"><b>18.000%</b></td></tr>' +
          '<tr><td>Bậc thấp (R / 1★)</td><td align="right"><b>79.000%</b></td></tr></table>' +
          '<div style="margin-top:10px;color:#8b98a9">Quay 10 lần bảo đảm ít nhất một cái bậc giữa trở lên. ' +
          'Mỗi lần quay được 1 vé; đủ 200 vé thì tự chọn một cái bậc cao. Vé không mang sang banner khác.</div>' });
      } }));
      k.appendChild(hang);
      g.appendChild(k);
    });
  }

  function quay(loai, n) {
    var gia = n === 10 ? 1500 : 150;
    if (G.S.clb.xu < gia) { G.hop({ dau: 'Không đủ xu', html: 'Cần ' + gia + ' xu. Thắng giải để có thêm.' }); return; }
    G.S.clb.xu -= gia;

    var rng = G.Rng((Date.now() ^ (Math.random() * 1e9)) & 0x7fffffff);
    var kho = loai === 'hlv' ? G.HLV : G.TUYENTHU;
    var kq = [], i;
    for (i = 0; i < n; i++) {
      var v = rng();
      var bac = v < 0.03 ? 3 : v < 0.21 ? 2 : 1;
      if (n === 10 && i === 9 && !kq.some(function (x) { return x.bac >= 2; })) bac = 2;
      var ds = kho.filter(function (x) { return (loai === 'hlv' ? x.sao : (x.bac === 'SSR' ? 3 : x.bac === 'SR' ? 2 : 1)) === bac; });
      var ra = rng.chon(ds);
      var r = loai === 'hlv' ? G.nhanHLV(ra.id) : G.nhanTT(ra.id);
      kq.push({ id: ra.id, ten: ra.ten, biet: ra.biet, bac: bac, moi: r.moi, uncap: r.uncap, thua: r.thua });
      G.S.ve[loai]++;
    }
    G.luu();
    hienKetQuaQuay(kq, loai);
  }

  function hienKetQuaQuay(kq, loai) {
    var n = G.el('div');
    var l = G.el('div', { style: 'display:grid;grid-template-columns:repeat(5,1fr);gap:8px' });
    kq.forEach(function (x) {
      var mau = x.bac === 3 ? '#ffd76e' : x.bac === 2 ? '#b08af0' : '#7d8794';
      var d = G.el('div', { style: 'padding:8px;border-radius:10px;background:#0d1420;border:1px solid ' + mau +
        ';text-align:center' });
      d.appendChild(G.el('div', { text: '★'.repeat(x.bac), style: 'color:' + mau + ';font-size:11px' }));
      d.appendChild(G.el('div', { text: x.biet || x.ten, style: 'font-weight:700;font-size:12px;margin-top:3px' }));
      d.appendChild(G.el('div', { text: x.moi ? 'MỚI' : (x.thua ? '+xu' : '✦' + x.uncap),
        style: 'font-size:10px;color:' + (x.moi ? '#3ddc97' : '#8b98a9') }));
      l.appendChild(d);
    });
    n.appendChild(l);
    if (kq.some(function (x) { return x.bac === 3; })) { G.phaoHoa(50); G.rung('to'); }
    G.hop({ dau: 'Kết quả', node: n, nut: [{ chu: 'Xong', chinh: true }] }).then(function () { G.moManCLB('gacha'); });
  }

  /* ── kho ── */
  function veKhoHLV(g) {
    tieu(g, 'Huấn luyện viên', 'Đây là thứ được nuôi trong ca. Năng khiếu quyết định đội hợp lối chơi nào.');
    var l = G.el('div', { style: luoi(200) });
    G.S.khoHLV.forEach(function (b) {
      var goc = G.HLV_THEO_ID[b.id];
      var d = G.el('div', { style: 'padding:10px;border-radius:11px;background:#111926;border:1px solid #26303f' });
      d.appendChild(G.el('div', { text: '★'.repeat(goc.sao) + (b.uncap ? '  ✦' + b.uncap : ''), style: 'color:#f2c94c;font-size:12px' }));
      d.appendChild(G.el('b', { text: goc.ten, style: 'font-size:14px' }));
      d.appendChild(G.el('div', { text: goc.tieu, style: 'font-size:11.5px;color:#8b98a9;margin:5px 0 7px;line-height:1.5' }));
      var kn = G.KN_RIENG[goc.kn];
      d.appendChild(G.el('div', { html: '<b style="color:#3ddc97">' + kn.ten + '</b> — ' + kn.mota, style: 'font-size:11.5px;line-height:1.5' }));
      d.appendChild(bangNK(goc.nk));
      l.appendChild(d);
    });
    g.appendChild(l);
  }

  function bangNK(nk) {
    var w = G.el('div', { style: 'margin-top:8px;display:flex;flex-direction:column;gap:3px' });
    [['Sân', nk.san, G.TEN_SAN], ['Nhịp', nk.nhip, G.TEN_NHIP], ['Thế', nk.the, G.TEN_THE]].forEach(function (r) {
      var h = G.el('div', { style: 'display:flex;gap:4px;align-items:center' });
      h.appendChild(G.el('span', { text: r[0], style: 'font-size:10px;color:#8b98a9;width:28px' }));
      for (var k in r[1]) {
        var hang = r[1][k];
        h.appendChild(G.el('span', { text: (r[2][k] || k) + ' ' + hang,
          style: 'font-size:10px;padding:1px 5px;border-radius:4px;background:#0a1017;color:' + mauHang(hang) }));
      }
      w.appendChild(h);
    });
    return w;
  }
  function mauHang(h) {
    return { S: '#ff8fb0', A: '#ffd76e', B: '#b08af0', C: '#7aaad8', D: '#7ad0d8', E: '#a9d87a', F: '#d8a07a', G: '#9aa' }[h] || '#9aa';
  }

  function veKhoTT(g) {
    tieu(g, 'Tuyển thủ', 'Vị trí và chất chơi là khoá cứng. Bảng thông thạo quyết định họ cầm tướng nào cho ra hồn.');
    ['tren', 'rung', 'giua', 'duoi', 'ho'].forEach(function (vt) {
      var ds = G.S.khoTT.filter(function (b) { return (G.TUYENTHU_THEO_ID[b.id] || {}).vt === vt; });
      if (!ds.length) return;
      g.appendChild(G.el('div', { text: G.VITRI_THEO_ID[vt].ten.toUpperCase(), style: nhanNho() }));
      var l = G.el('div', { style: luoi(210) });
      ds.forEach(function (b) {
        var goc = G.TUYENTHU_THEO_ID[b.id];
        var d = G.el('div', { style: 'padding:10px;border-radius:11px;background:#111926;border:1px solid #26303f' });
        var h = G.el('div', { style: 'display:flex;justify-content:space-between;align-items:center' });
        h.appendChild(G.el('b', { text: goc.ten, style: 'font-size:13px' }));
        h.appendChild(G.el('span', { text: goc.bac + (b.uncap ? ' ✦' + b.uncap : ''), style: 'font-size:11px;color:#f2c94c' }));
        d.appendChild(h);
        d.appendChild(G.el('div', { text: 'Cấp ' + b.cap + '/' + G.tranCap(goc.bac, b.uncap) + ' · ' + G.TT_LOAI_TEN[goc.loai] +
          ' · ' + '★'.repeat(goc.vtSao), style: 'font-size:11px;color:#8b98a9;margin:4px 0' }));
        d.appendChild(G.el('div', { text: goc.chat.map(function (c) { return G.CHAT[c].ten; }).join(' · ') + ' · tôi ' + goc.ego,
          style: 'font-size:11px;color:#6fc4f0' }));
        var tt = G.el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;margin-top:6px' });
        G.tuongTheoViTri(goc.vt).forEach(function (t) {
          var bac = G.thongThao(b, t.id);
          tt.appendChild(G.el('span', { text: t.ten + ' ' + bac,
            style: 'font-size:10px;padding:1px 5px;border-radius:4px;background:#0a1017;color:' + G.TT_THEO_ID[bac].mau }));
        });
        d.appendChild(tt);
        l.appendChild(d);
      });
      g.appendChild(l);
    });
  }

  function veGiaPha(g) {
    tieu(g, 'Gia phả', 'Mỗi mùa xong để lại một hồ sơ. Chọn 2 hồ sơ làm cựu HLV thì mùa sau được thừa hưởng spark của họ.');
    if (!G.S.cuu.length) {
      g.appendChild(G.el('div', { text: 'Chưa có mùa nào hoàn tất.', style: 'color:#8b98a9' }));
      return;
    }
    var l = G.el('div', { style: luoi(210) });
    G.S.cuu.forEach(function (hs, i) { l.appendChild(theCuu(hs, i, false, function () {})); });
    g.appendChild(l);
  }

  function veSoTay(g) {
    tieu(g, 'Sổ tay', 'Luật chơi, viết ngắn.');
    var muc = [
      ['Một mùa', '24 lượt: 5 ngày tập rồi 1 giải, lặp bốn lần; tới chung kết thế giới thì một ngày tập một trận, bốn lần.'],
      ['Năm giáo án', 'CƠ thao tác · BỀN thể lực · LỰC sức đánh · LÌ bản lĩnh · NÃO tư duy. Tập bốn lần thì sân lên một cấp, tối đa cấp 5.'],
      ['Thể lực và hỏng', 'Dưới 50 thể lực là bắt đầu có nguy cơ hỏng buổi tập. Tỉ lệ hỏng luôn hiện ngay cạnh nút.'],
      ['Cầu vồng', 'Thân thiết một tuyển thủ đạt 80 thì mở cầu vồng. Khi người đó đứng đúng sân sở trường, sân sáng lên và ăn chỉ số gấp rưỡi tới gấp đôi.'],
      ['Vị trí khoá cứng', 'Tuyển thủ chỉ đá đúng một vị trí và có hai nét chất chơi cố định. Huấn luyện viên không đổi được, chỉ hướng được.'],
      ['Thông thạo tướng', 'N < R < SR < SSR < UR. Càng cao thì cầm tướng đó càng mạnh. Ban đúng tướng UR của đối thủ là ban đúng người.'],
      ['Trang bị', 'Không ai chọn đồ hộ. Trong trận, mỗi tuyển thủ tự nhìn đội địch đánh bằng gì, mình đang thắng hay bị dí, rồi mua.'],
      ['Kế thừa', 'Hai cựu HLV mang theo spark: xanh cộng chỉ số, hồng nâng năng khiếu, lá truyền kỹ năng riêng, trắng cho gợi ý.']
    ];
    muc.forEach(function (m) {
      var d = G.el('div', { style: 'padding:9px 11px;border-radius:10px;background:#111926;border:1px solid #26303f;margin-bottom:7px' });
      d.appendChild(G.el('b', { text: m[0], style: 'font-size:13px' }));
      d.appendChild(G.el('div', { text: m[1], style: 'font-size:12.5px;color:#8b98a9;margin-top:3px;line-height:1.6' }));
      g.appendChild(d);
    });
  }

  function moCaiDat() {
    var n = G.el('div');
    var r = G.el('label', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:10px' });
    var cb = G.el('input', { type: 'checkbox' });
    cb.checked = !!G.S.cai.rung;
    cb.addEventListener('change', function () { G.S.cai.rung = cb.checked; G.CAI.rung = cb.checked; G.luu(); });
    r.appendChild(cb); r.appendChild(G.el('span', { text: 'Rung khi có khoảnh khắc lớn' }));
    n.appendChild(r);
    n.appendChild(G.el('div', { text: 'Bản lưu nằm trong máy này. Xoá là mất hết.', style: 'color:#8b98a9;font-size:12px;margin:10px 0' }));
    G.hop({ dau: 'Cài đặt', node: n, nut: [
      { chu: 'Xoá bản lưu', do: true, gt: 'xoa' },
      { chu: 'Đóng', chinh: true, gt: null }
    ] }).then(function (v) {
      if (v === 'xoa') {
        G.hop({ dau: 'Chắc chưa?', html: 'Xoá là mất sạch huấn luyện viên, tuyển thủ, gia phả.',
          nut: [{ chu: 'Xoá', do: true, gt: 1 }, { chu: 'Thôi', gt: 0, chinh: true }] })
          .then(function (x) { if (x) { G.xoaSave(); chon = { hlv: null, tt: [], cuu: [] }; G.moManCLB('ca'); } });
      }
    });
  }

})(window);
