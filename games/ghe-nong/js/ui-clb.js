/* ui-clb.js — màn CLB, dựng theo màn Menu / Trainee Select của Uma Musume.
   (ảnh esport-ref/uma/sheets_guide/sheet001.jpg, RESEARCH.md §2)

   Bản trước bê bố cục TFM2: menu dọc bên trái, thẻ phẳng màu tối. Nhìn ra một cái app
   quản trị chứ không ra game. Uma điều hướng bằng HÀNG NÚT LỚN Ở ĐÁY, nội dung là thẻ
   trắng bo tròn có bóng đổ dày, nút là viên thuốc có gờ dưới, và mọi chỗ đều có mặt
   nhân vật. Ở đây làm đúng thế: thanh trên sáng · nội dung · cột phải là thẻ hành động
   · thanh nút ở đáy. Cùng bảng màu với màn huấn luyện, không thêm màu mới. */
(function (G) {
  'use strict';

  var trang = 'ca';
  var chon = { hlv: null, tt: [], cuu: [] };

  var MENU = [
    { id: 'ca', ten: ['Ca huấn', 'luyện'], ic: '🏟️' },
    { id: 'bxh', ten: ['Bảng xếp', 'hạng'], ic: '🏆' },
    { id: 'gacha', ten: ['Tuyển mộ'], ic: '🎁' },
    { id: 'hlv', ten: ['Huấn luyện', 'viên'], ic: '📋' },
    { id: 'tt', ten: ['Tuyển thủ'], ic: '👥' },
    { id: 'cuu', ten: ['Gia phả'], ic: '🌳' },
    { id: 'ky', ten: ['Sổ tay'], ic: '📘' },
    { id: 'cai', ten: ['Cài đặt'], ic: '⚙️' }
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
      var b = G.el('button' + (trang === x.id ? '.chon' : ''));
      b.appendChild(G.el('i', { text: x.ic }));
      x.ten.forEach(function (d) { b.appendChild(G.el('span', { text: d })); });
      /* chấm đỏ trên nút Bảng xếp hạng khi có tin chưa đọc — Uma đánh dấu mục có việc
         cần xem bằng chấm đỏ ở góc nút, không bắt người chơi tự đi soi từng mục */
      if (x.id === 'bxh' && G.soTinMoi) {
        var so = G.soTinMoi();
        if (so) b.appendChild(G.el('em', { text: String(so) }));
      }
      b.addEventListener('click', function () {
        G.tieng('cham');
        if (x.id === 'cai') return moCaiDat();
        trang = x.id; veMenu(); veGiua(); vePhai();
      });
      m.appendChild(b);
    });
  }

  /** một thẻ trắng có dải tiêu đề xanh, kiểu panel của Uma */
  function hop(dau) {
    var h = G.el('div.uc-hop');
    h.appendChild(G.el('div.uc-hop-dau', { text: dau }));
    var t = G.el('div.uc-hop-than');
    h.appendChild(t);
    h._than = t;
    return h;
  }

  function vePhai() {
    var p = G.xoa(G.$('#clb-phai'));
    var S = G.S;

    /* trang bảng xếp hạng chiếm luôn cột phải để làm khung đọc tin, y như TFM2 */
    if (trang === 'bxh' && G.veBXHPhai) { G.veBXHPhai(p); return; }

    if (S.ca) {
      var g = G.HLV_THEO_ID[S.ca.hlvId];
      var h1 = hop('CA ĐANG CHẠY'), t1 = h1._than;
      var dau = G.el('div', { style: 'display:flex;align-items:center;gap:10px' });
      var a1 = G.oAnh && G.oAnh(g.id, 52);
      if (a1) {
        a1.style.borderRadius = '13px'; a1.style.flex = 'none';
        a1.style.border = '2px solid #e6e2ef';
        dau.appendChild(a1);
      }
      var ph1 = G.el('div', { style: 'min-width:0' });
      ph1.appendChild(G.el('div', { text: g.ten, style: 'font-size:15px;font-weight:900;color:#4a3f48' }));
      ph1.appendChild(G.el('div.uc-phu', { text: 'Lượt ' + S.ca.luot + '/' + S.ca.soLuot }));
      dau.appendChild(ph1);
      t1.appendChild(dau);
      var th = G.el('div.uc-thanh', { style: 'margin:9px 0 12px' });
      th.appendChild(G.el('i', { style: 'width:' + (S.ca.luot / S.ca.soLuot * 100) +
        '%;background:linear-gradient(90deg,#a5e86a,#6ec409)' }));
      t1.appendChild(th);
      t1.appendChild(G.el('button.uc-nut', { text: '▶  Vào ca',
        onclick: function () { G.tieng('chon'); G.moManCa(hoiSinhCa(S.ca)); } }));
      t1.appendChild(G.el('button.uc-nut.phu', { text: 'Bỏ ca này', style: 'margin-top:8px',
        onclick: function () {
          G.hop({ sang: true, dau: 'Bỏ ca?', html: 'Mọi thứ đã nuôi trong ca sẽ mất, không để lại gì cả.',
            nut: [{ chu: 'Bỏ', do: true, gt: 1 }, { chu: 'Thôi', gt: 0, chinh: true }] })
            .then(function (r) { if (r) { G.S.ca = null; G.luu(); G.moManCLB(); } });
        } }));
      p.appendChild(h1);
      p.appendChild(hopThuHang());
      return;
    }

    var h2 = hop('BẮT ĐẦU MÙA MỚI'), t2 = h2._than;
    t2.appendChild(G.el('div.uc-phu', { text: 'Chọn 1 huấn luyện viên, 5 tuyển thủ đủ 5 vị trí, ' +
      'và 2 cựu huấn luyện viên để kế thừa.', style: 'margin-bottom:10px' }));

    /* Ba dòng kiểm, mỗi dòng có dấu ✓ — Uma luôn cho biết còn thiếu gì ngay cạnh nút,
       không để nút xám trơ mà không nói vì sao bấm không được. */
    var d = chon.tt.length ? G.duDoiHinh(chon.tt) : { du: false, thieu: [], thua: [] };
    dongKiem(t2, 'Huấn luyện viên', chon.hlv ? G.HLV_THEO_ID[chon.hlv].ten : 'chưa chọn', !!chon.hlv);
    dongKiem(t2, 'Tuyển thủ', chon.tt.length + '/5', chon.tt.length === 5 && d.du);
    dongKiem(t2, 'Cựu HLV', chon.cuu.length + '/2', true);
    if (chon.tt.length && !d.du) {
      t2.appendChild(G.el('div', { text: 'Thiếu: ' + d.thieu.map(function (v) {
        return G.VITRI_THEO_ID[v].ten; }).join(', '),
        style: 'font-size:11.5px;font-weight:800;color:#d9455c;margin-top:5px' }));
    }
    if (chon.tt.length && d.thua && d.thua.length) {
      t2.appendChild(G.el('div', { text: 'Trùng vị trí: ' + d.thua.map(function (v) {
        return G.VITRI_THEO_ID[v].ten; }).join(', '),
        style: 'font-size:11.5px;font-weight:800;color:#c8891a;margin-top:3px' }));
    }

    var ok = chon.hlv && chon.tt.length === 5 && d.du;
    var b = G.el('button.uc-nut' + (ok ? '' : '.tat'), { text: 'Bắt đầu ca', style: 'margin-top:11px' });
    if (ok) b.addEventListener('click', batDauCa);
    t2.appendChild(b);
    p.appendChild(h2);
    p.appendChild(hopThuHang());
  }

  function dongKiem(v, nhan, gt, ok) {
    var r = G.el('div', { style: 'display:flex;align-items:center;gap:6px;padding:3px 0' });
    r.appendChild(G.el('span', { text: ok ? '✓' : '·', style: 'width:14px;flex:none;font-weight:900;' +
      'color:' + (ok ? '#3d9c63' : '#b8b0c2') }));
    r.appendChild(G.el('span', { text: nhan, style: 'font-size:11.5px;color:#8a7f8f;flex:1' }));
    r.appendChild(G.el('b', { text: gt, style: 'font-size:12px;color:#4a3f48' }));
    v.appendChild(r);
  }

  /** thẻ nhỏ: mình đang đứng hạng mấy — có ở mọi trang để nhắc giải đang chạy */
  function hopThuHang() {
    var h = hop('VỊ THẾ CỦA TA'), t = h._than;
    if (!G.hangTa) { t.appendChild(G.el('div.uc-phu', { text: 'Chưa có mùa nào chạy.' })); return h; }
    var x = G.hangTa();
    var r = G.el('div', { style: 'display:flex;align-items:baseline;gap:8px' });
    r.appendChild(G.el('b', { text: '#' + x.hang, style: 'font-size:27px;font-weight:900;color:#3f6ab8' }));
    r.appendChild(G.el('span.uc-phu', { text: 'trên ' + x.tong + ' đội quốc nội' }));
    t.appendChild(r);
    t.appendChild(G.el('div.uc-phu', { text: (x.h.thang || 0) + ' thắng · ' + (x.h.thua || 0) + ' thua',
      style: 'margin-top:3px' }));
    t.appendChild(G.el('button.uc-nut-nho', { text: 'Xem bảng xếp hạng', style: 'margin-top:9px',
      onclick: function () { trang = 'bxh'; veMenu(); veGiua(); vePhai(); } }));
    return h;
  }


  /* ══════════ trang giữa ══════════ */
  function veGiua() {
    var g = G.xoa(G.$('#clb-giua'));
    if (trang === 'bxh') return G.veBXH(g, function () { veGiua(); vePhai(); });
    if (trang === 'ca') return veChonCa(g);
    if (trang === 'gacha') return veGacha(g);
    if (trang === 'hlv') return veKhoHLV(g);
    if (trang === 'tt') return veKhoTT(g);
    if (trang === 'cuu') return veGiaPha(g);
    if (trang === 'ky') return veSoTay(g);
  }

  function tieu(g, chu, phu) {
    g.appendChild(G.el('div.uc-tieu', { text: chu }));
    if (phu) g.appendChild(G.el('div.uc-mo', { text: phu }));
  }

  /* ── chọn đội cho ca ── */
  function veChonCa(g) {
    if (G.S.ca) {
      tieu(g, 'Đang có một ca dở dang', 'Bấm "Vào ca" bên phải để chơi tiếp.');
      return;
    }
    tieu(g, 'Chuẩn bị mùa giải', 'Vị trí của tuyển thủ là khoá cứng — phải đủ 5 vị trí mới ra sân được.');

    nhanNho(g, 'HUẤN LUYỆN VIÊN');
    var h = G.el('div.uc-luoi', { style: luoi(158) });
    G.S.khoHLV.forEach(function (b) {
      var goc = G.HLV_THEO_ID[b.id];
      h.appendChild(theHLV(goc, b, chon.hlv === b.id, function () {
        chon.hlv = (chon.hlv === b.id ? null : b.id); veGiua(); vePhai();
      }));
    });
    g.appendChild(h);

    nhanNho(g, 'TUYỂN THỦ  ·  chọn 5, đủ 5 vị trí');
    var t = G.el('div.uc-luoi', { style: luoi(146) });
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
      nhanNho(g, 'CỰU HUẤN LUYỆN VIÊN  ·  chọn tối đa 2');
      var c = G.el('div.uc-luoi', { style: luoi(172) });
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

  /* Nhãn nhóm và lưới thẻ đều dùng lớp trong css/ui.css (.uc-nhan / .uc-luoi) chứ không
     nhồi style vào từng chỗ gọi — bản trước mỗi thẻ tự khai màu tối nên đổi sang bảng màu
     Uma phải sửa hai chục chỗ. */
  function nhanNho(g, chu) { g.appendChild(G.el('div.uc-nhan', { text: chu })); }
  function luoi(w) { return 'grid-template-columns:repeat(auto-fill,minmax(' + w + 'px,1fr))'; }

  function theHLV(goc, b, dangChon, cb) {
    var d = G.el('div.uc-the.bam' + (dangChon ? '.chon' : ''), { style: 'text-align:center' });
    d.appendChild(G.el('div.uc-sao', { text: '★'.repeat(goc.sao) + (b.uncap ? '  ✦' + b.uncap : '') }));
    var anh1 = G.oAnh && G.oAnh(goc.id, 62);
    if (anh1) {
      anh1.style.margin = '3px auto';
      anh1.style.borderRadius = '50%';
      anh1.style.border = '3px solid ' + (dangChon ? '#ffd76e' : '#eae6f4');
      anh1.style.backgroundColor = '#f4f2f9';
      d.appendChild(anh1);
    }
    d.appendChild(G.el('div', { text: goc.ten, style: 'font-weight:900;font-size:13.5px;color:#4a3f48' }));
    d.appendChild(G.el('div.uc-phu', { text: '"' + goc.biet + '"' }));
    var nk = goc.nk;
    var ch = G.el('div.uc-chips', { style: 'justify-content:center' });
    ch.appendChild(G.el('span.uc-chip', { text: tenTheManh(nk.the) }));
    ch.appendChild(G.el('span.uc-chip', { text: tenTheManh(nk.san, G.TEN_SAN) }));
    d.appendChild(ch);
    d.addEventListener('click', function () { G.tieng('cham'); cb(); });
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

  var MAU_BAC = { UR: '#e5548c', SSR: '#e8a81c', SR: '#7351a7', R: '#3f8fd0', N: '#8a7f8f' };

  function theTT(goc, b, dangChon, cb) {
    var d = G.el('div.uc-the.bam' + (dangChon ? '.chon' : ''));
    var h = G.el('div', { style: 'display:flex;align-items:center;gap:7px' });
    var anh2 = G.oAnh && G.oAnh(goc.id, 34);
    if (anh2) {
      anh2.style.flex = 'none'; anh2.style.borderRadius = '50%';
      anh2.style.border = '2px solid #eae6f4'; anh2.style.backgroundColor = '#f4f2f9';
      h.appendChild(anh2);
    }
    h.appendChild(G.el('b', { text: goc.biet, style: 'font-size:13.5px;flex:1;min-width:0' }));
    h.appendChild(G.el('span.uc-chip', { text: goc.bac,
      style: 'color:' + (MAU_BAC[goc.bac] || '#8a7f8f') }));
    d.appendChild(h);
    d.appendChild(G.el('div.uc-phu', { text: G.VITRI_THEO_ID[goc.vt].ten + ' · ' +
      G.TT_LOAI_TEN[goc.loai] + ' · cấp ' + b.cap, style: 'margin-top:4px' }));
    var ch = G.el('div.uc-chips');
    goc.chat.forEach(function (c) { ch.appendChild(G.el('span.uc-chip', { text: G.CHAT[c].ten })); });
    d.appendChild(ch);
    d.addEventListener('click', function () { G.tieng('cham'); cb(); });
    return d;
  }

  function theCuu(hs, i, dangChon, cb) {
    var d = G.el('div.uc-the.bam' + (dangChon ? '.chon' : ''));
    d.appendChild(G.el('b', { text: hs.ten, style: 'font-size:13px' }));
    d.appendChild(G.el('div.uc-phu', { text: 'Mùa ' + hs.mua + ' · thắng ' + hs.thang + ' giải',
      style: 'margin-top:3px' }));
    var sp = G.el('div.uc-chips');
    (hs.sparks || []).forEach(function (x) {
      var mau = x.mau === 'xanh' ? '#3f8fd0' : x.mau === 'hong' ? '#e5548c'
        : x.mau === 'la' ? '#3d9c63' : '#8a7f8f';
      sp.appendChild(G.el('span.uc-chip', { text: tenSpark(x), style: 'color:' + mau }));
    });
    d.appendChild(sp);
    d.addEventListener('click', function () { G.tieng('cham'); cb(); });
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
    G.tieng('batdau');
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

  /* ── tuyển mộ ──
     Uma bày banner là MỘT TẤM ART TO: nhân vật đứng chồng lớp trên nền gradient, tên
     banner nằm dưới, rồi nút cam "quay 10" nổi bật hẳn so với nút quay 1 (ảnh
     esport-ref/uma/sheets_gacha/g001.jpg). Bản trước ở đây chỉ là một cái panel chữ —
     mở ra không có gì để muốn bấm. */
  var NEN_BANNER = {
    hlv: 'linear-gradient(135deg,#ffd6a8 0%,#ff9ec4 45%,#b79ae0 100%)',
    tt: 'linear-gradient(135deg,#a8e0ff 0%,#8fb8ff 45%,#b79ae0 100%)'
  };

  function veGacha(g) {
    if (G.day) G.day('gacha');
    tieu(g, 'Tuyển mộ', 'Tỉ lệ lấy đúng của Uma Musume: bậc cao nhất 3%, giữa 18%, thấp 79%. ' +
      'Quay 10 chắc chắn có ít nhất một cái bậc 2 trở lên. Đủ 200 vé thì tự chọn.');

    [['hlv', 'Banner Huấn Luyện Viên', G.HLV], ['tt', 'Banner Tuyển Thủ', G.TUYENTHU]].forEach(function (x) {
      var loai = x[0], kho = x[2];
      var k = G.el('div.uc-banner');
      k.appendChild(G.el('div.uc-bn-nen', { style: 'background:' + NEN_BANNER[loai] }));

      /* năm gương mặt bậc cao nhất, xếp chồng lệch nhau như poster banner */
      var mat = G.el('div.uc-bn-mat');
      var cao = kho.filter(function (m) { return loai === 'hlv' ? m.sao === 3 : m.bac === 'SSR'; });
      if (!cao.length) cao = kho.slice(0, 5);
      cao.slice(0, 5).forEach(function (m, i) {
        /* cắt sát hơn (12% mép trên) và phóng to hơn ô thường: đây là poster, người
           phải cao gần bằng khung banner mới ra dáng banner */
        var a = G.oAnh && G.oAnh(m.id, 132 - i * 11);
        if (a) {
          a.className = '';
          a.style.cssText += ';flex:none;margin-right:-22px;z-index:' + (9 - i) +
            ';filter:drop-shadow(0 3px 5px #0004)';
          mat.appendChild(a);
        }
      });
      mat.appendChild(G.el('div', { text: cao.length + ' cái bậc cao trong lượt này',
        style: 'margin-left:auto;align-self:flex-start;background:#ffffffdd;border-radius:99px;' +
          'padding:3px 11px;font-size:11px;font-weight:900;color:#6b5c68' }));
      k.appendChild(mat);

      var chu = G.el('div.uc-bn-chu');
      chu.appendChild(G.el('h4', { text: x[1] }));
      var hang = G.el('div.uc-bn-hang');
      var ve = G.el('div.uc-bn-ve');
      ve.appendChild(G.el('span', { text: 'Vé đổi ' + G.S.ve[loai] + '/200' }));
      var th = G.el('div.uc-thanh');
      th.appendChild(G.el('i', { style: 'width:' + (G.S.ve[loai] / 200 * 100) +
        '%;background:linear-gradient(90deg,#8fd8ff,#ffd76e)' }));
      ve.appendChild(th);
      hang.appendChild(ve);
      hang.appendChild(G.el('button.uc-nut.phu', { text: 'Quay 1 · 150',
        onclick: function () { quay(loai, 1); } }));
      hang.appendChild(G.el('button.uc-nut.cam', { text: 'Quay 10 · 1500',
        onclick: function () { quay(loai, 10); } }));
      hang.appendChild(G.el('button.uc-nut-nho', { text: 'Tỉ lệ', onclick: xemTiLe }));
      chu.appendChild(hang);
      k.appendChild(chu);
      g.appendChild(k);
    });
  }

  function xemTiLe() {
    G.hop({ sang: true, dau: 'Tỉ lệ', html:
      '<table style="width:100%;font-size:13px">' +
      '<tr><td>Bậc cao (SSR / 3★)</td><td align="right"><b>3.000%</b></td></tr>' +
      '<tr><td>Bậc giữa (SR / 2★)</td><td align="right"><b>18.000%</b></td></tr>' +
      '<tr><td>Bậc thấp (R / 1★)</td><td align="right"><b>79.000%</b></td></tr></table>' +
      '<div style="margin-top:10px;color:#8a7f8f">Quay 10 lần bảo đảm ít nhất một cái bậc giữa ' +
      'trở lên. Mỗi lần quay được 1 vé; đủ 200 vé thì tự chọn một cái bậc cao. Vé không mang ' +
      'sang banner khác.</div>' });
  }

  function quay(loai, n) {
    var gia = n === 10 ? 1500 : 150;
    if (G.S.clb.xu < gia) {
      G.hop({ sang: true, dau: 'Không đủ xu', html: 'Cần ' + gia + ' xu. Thắng giải để có thêm.' });
      return;
    }
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
    G.tieng(kq.some(function (x) { return x.bac === 3; }) ? 'quaySSR' : 'quay');
    hienKetQuaQuay(kq, loai);
  }

  /* Lưới 5 cột — quay 10 thì ra đúng hai hàng năm ô, y như bảng kết quả của Uma. */
  function hienKetQuaQuay(kq, loai) {
    var n = G.el('div');
    var l = G.el('div.uc-kq');
    kq.forEach(function (x) {
      var d = G.el('div.uc-kq-o.b' + x.bac);
      var a = G.oAnh && G.oAnh(x.id, 46);
      if (a) { a.style.borderRadius = '50%'; a.style.margin = '0 auto 4px'; d.appendChild(a); }
      d.appendChild(G.el('div.uc-sao', { text: '★'.repeat(x.bac) }));
      d.appendChild(G.el('b', { text: x.biet || x.ten }));
      d.appendChild(G.el('em' + (x.moi ? '.moi' : ''),
        { text: x.moi ? 'MỚI' : (x.thua ? '+xu' : '✦' + x.uncap) }));
      l.appendChild(d);
    });
    n.appendChild(l);
    if (kq.some(function (x) { return x.bac === 3; })) { G.phaoHoa(50); G.rung('to'); }
    G.hop({ sang: true, rong: 640, dau: 'Kết quả', node: n, nut: [{ chu: 'Xong', chinh: true }] })
      .then(function () { G.moManCLB('gacha'); });
  }

  /* ── kho ── */
  function veKhoHLV(g) {
    tieu(g, 'Huấn luyện viên', 'Đây là thứ được nuôi trong ca. Năng khiếu quyết định đội hợp lối chơi nào.');
    var l = G.el('div.uc-luoi', { style: luoi(214) });
    G.S.khoHLV.forEach(function (b) {
      var goc = G.HLV_THEO_ID[b.id];
      var d = G.el('div.uc-the');
      var dh = G.el('div', { style: 'display:flex;align-items:center;gap:9px' });
      var a = G.oAnh && G.oAnh(goc.id, 46);
      if (a) {
        a.style.flex = 'none'; a.style.borderRadius = '50%';
        a.style.border = '2px solid #eae6f4'; a.style.backgroundColor = '#f4f2f9';
        dh.appendChild(a);
      }
      var dp = G.el('div', { style: 'min-width:0' });
      dp.appendChild(G.el('div.uc-sao', { text: '★'.repeat(goc.sao) + (b.uncap ? '  ✦' + b.uncap : '') }));
      dp.appendChild(G.el('b', { text: goc.ten, style: 'font-size:14.5px' }));
      dh.appendChild(dp);
      d.appendChild(dh);
      d.appendChild(G.el('div.uc-phu', { text: goc.tieu, style: 'margin:6px 0 7px' }));
      var kn = G.KN_RIENG[goc.kn];
      d.appendChild(G.el('div', { html: '<b style="color:#3d9c63">' + kn.ten + '</b> — ' + kn.mota,
        style: 'font-size:11.5px;line-height:1.55;color:#6b5c68' }));
      d.appendChild(bangNK(goc.nk));
      l.appendChild(d);
    });
    g.appendChild(l);
  }

  function bangNK(nk) {
    var w = G.el('div', { style: 'margin-top:8px;display:flex;flex-direction:column;gap:3px' });
    [['Sân', nk.san, G.TEN_SAN], ['Nhịp', nk.nhip, G.TEN_NHIP], ['Thế', nk.the, G.TEN_THE]].forEach(function (r) {
      var h = G.el('div', { style: 'display:flex;gap:4px;align-items:center' });
      h.appendChild(G.el('span', { text: r[0], style: 'font-size:10px;color:#8a7f8f;width:28px;flex:none' }));
      for (var k in r[1]) {
        var hang = r[1][k];
        h.appendChild(G.el('span.uc-chip', { text: (r[2][k] || k) + ' ' + hang,
          style: 'color:' + mauHang(hang) }));
      }
      w.appendChild(h);
    });
    return w;
  }
  /* Cùng bảng màu với vòng hạng chữ ở màn huấn luyện (.uma-hang.h-S…) — cùng một hạng
     thì ở đâu cũng phải cùng màu, không thì người chơi phải học hai bộ màu. */
  function mauHang(h) {
    return { S: '#c8891a', A: '#c23a70', B: '#7351a7', C: '#2f6ba0', D: '#2e7d4f',
      E: '#5c7a2a', F: '#8a6a2a', G: '#8a7f8f' }[h] || '#8a7f8f';
  }

  function veKhoTT(g) {
    tieu(g, 'Tuyển thủ', 'Vị trí và chất chơi là khoá cứng. Cấp thẻ quyết định hiệu ứng mạnh tới đâu — '
      + 'thẻ cấp 1 chỉ chạy ở 40% sức.');
    ['tren', 'rung', 'giua', 'duoi', 'ho'].forEach(function (vt) {
      var ds = G.S.khoTT.filter(function (b) { return (G.TUYENTHU_THEO_ID[b.id] || {}).vt === vt; });
      if (!ds.length) return;
      nhanNho(g, G.VITRI_THEO_ID[vt].ten.toUpperCase());
      var l = G.el('div.uc-luoi', { style: luoi(222) });
      ds.forEach(function (b) {
        var goc = G.TUYENTHU_THEO_ID[b.id];
        var d = G.el('div.uc-the');
        var h = G.el('div', { style: 'display:flex;align-items:center;gap:8px' });
        var a = G.oAnh && G.oAnh(b.id, 40);
        if (a) {
          a.style.flex = 'none'; a.style.borderRadius = '50%';
          a.style.border = '2px solid #eae6f4'; a.style.backgroundColor = '#f4f2f9';
          h.appendChild(a);
        }
        var hp = G.el('div', { style: 'flex:1;min-width:0' });
        hp.appendChild(G.el('b', { text: goc.ten, style: 'font-size:13.5px' }));
        hp.appendChild(G.el('div.uc-phu', { text: G.TT_LOAI_TEN[goc.loai] + ' · ' + '★'.repeat(goc.vtSao) }));
        h.appendChild(hp);
        h.appendChild(G.el('span.uc-chip', { text: goc.bac + (b.uncap ? ' ✦' + b.uncap : ''),
          style: 'color:' + (MAU_BAC[goc.bac] || '#8a7f8f') }));
        d.appendChild(h);
        var ch = G.el('div.uc-chips');
        goc.chat.forEach(function (c) { ch.appendChild(G.el('span.uc-chip', { text: G.CHAT[c].ten })); });
        ch.appendChild(G.el('span.uc-chip', { text: 'tôi ' + goc.ego }));
        d.appendChild(ch);
        /* thông thạo tướng: hiện ảnh tướng kèm bậc, xem một cái là biết tủ của người này */
        var tt = G.el('div.uc-chips');
        G.tuongTheoViTri(goc.vt).forEach(function (t) {
          var bac = G.thongThao(b, t.id);
          var o = G.el('span.uc-chip', { style: 'color:' + (MAU_BAC[bac] || '#8a7f8f') +
            ';padding-left:2px', title: t.ten + ' — ' + bac });
          var at = G.oAnhTuong && G.oAnhTuong(t.id, 18);
          if (at) { at.style.borderRadius = '50%'; o.appendChild(at); }
          o.appendChild(G.el('b', { text: bac, style: 'font-size:10px' }));
          tt.appendChild(o);
        });
        d.appendChild(tt);
        d.appendChild(thanhCap(b, goc));
        var nb = G.el('button.uc-nut-nho', { text: 'Nuôi thẻ', style: 'width:100%;margin-top:8px' });
        nb.addEventListener('click', function () { G.tieng('cham'); moNuoiThe(b); });
        d.appendChild(nb);
        l.appendChild(d);
      });
      g.appendChild(l);
    });
  }

  function veGiaPha(g) {
    tieu(g, 'Gia phả', 'Mỗi mùa xong để lại một hồ sơ. Chọn 2 hồ sơ làm cựu HLV thì mùa sau được thừa hưởng spark của họ.');
    if (!G.S.cuu.length) {
      g.appendChild(G.el('div.uc-phu', { text: 'Chưa có mùa nào hoàn tất.' }));
      return;
    }
    var l = G.el('div.uc-luoi', { style: luoi(222) });
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
    var lai = G.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 12px' });
    [['ca', 'Một ngày ở trung tâm'], ['draft', 'Cấm và chọn'], ['tran', 'Xem trận'],
     ['gacha', 'Tuyển mộ'], ['ketthua', 'Thua là hết mùa']].forEach(function (x) {
      lai.appendChild(G.el('button.uc-nut-nho', { text: x[1],
        onclick: function () { G.dayLai(x[0]); } }));
    });
    g.appendChild(lai);

    muc.forEach(function (m) {
      var d = G.el('div.uc-the', { style: 'margin-bottom:8px' });
      d.appendChild(G.el('b', { text: m[0], style: 'font-size:13.5px' }));
      d.appendChild(G.el('div.uc-phu', { text: m[1], style: 'margin-top:3px' }));
      g.appendChild(d);
    });
  }

  /* ══════════ nuôi thẻ tuyển thủ ══════════
     Uma cho thẻ hỗ trợ lên tới cấp 50 và mọi hiệu ứng nội suy theo cấp; ở đây cũng vậy
     (`hesoCap` chạy từ 40% tới 100%). Nên chỗ này không phải màn phụ: một thẻ SSR cấp 1
     yếu hơn thẻ SR đã nuôi. Hộp thoại phải nói rõ "trước → sau", không để người chơi
     tiêu 3000 xu rồi tự đoán mình được gì. */
  function thanhCap(b, goc) {
    var tran = G.tranCap(goc.bac, b.uncap);
    var can = G.expCap(b.cap);
    var p = b.cap >= tran ? 1 : G.kep((b.exp || 0) / can, 0, 1);
    var d = G.el('div', { style: 'margin-top:6px' });
    var h = G.el('div', { style: 'display:flex;justify-content:space-between;font-size:10.5px;' +
      'font-weight:800;color:#8a7f8f' });
    h.appendChild(G.el('span', { text: 'Cấp ' + b.cap + '/' + tran }));
    h.appendChild(G.el('span', { text: b.cap >= tran ? 'đã tối đa' : (b.exp || 0) + '/' + can + ' kn' }));
    d.appendChild(h);
    var t = G.el('div.uc-thanh', { style: 'height:6px;margin-top:3px' });
    t.appendChild(G.el('i', { style: 'width:' + (p * 100) + '%;background:' +
      (b.cap >= tran ? 'linear-gradient(90deg,#ffd76e,#e8a81c)' : 'linear-gradient(90deg,#8fd8ff,#3f8fd0)') }));
    d.appendChild(t);
    return d;
  }

  function moNuoiThe(b) {
    var goc = G.TUYENTHU_THEO_ID[b.id];
    var n = G.el('div', { style: 'width:520px;max-width:86vw' });

    function ve() {
      G.xoa(n);
      var tran = G.tranCap(goc.bac, b.uncap);
      var toiDa = b.cap >= tran;

      var tren = G.el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:10px' });
      var a = G.oAnh && G.oAnh(b.id, 54);
      if (a) tren.appendChild(a);
      var ph = G.el('div', { style: 'flex:1' });
      ph.appendChild(G.el('div', { text: goc.ten, style: 'font-weight:900;font-size:15px;color:#4a3f48' }));
      ph.appendChild(G.el('div.uc-phu', {
        text: goc.bac + (b.uncap ? ' ✦' + b.uncap : '') + ' · ' + G.VITRI_THEO_ID[goc.vt].ten +
          ' · ' + G.TT_LOAI_TEN[goc.loai]
      }));
      tren.appendChild(ph);
      tren.appendChild(G.el('div', {
        text: 'Cấp ' + b.cap + '/' + tran,
        style: 'font-size:21px;font-weight:900;color:' + (toiDa ? '#c8891a' : '#3f6ab8')
      }));
      n.appendChild(tren);

      if (toiDa) {
        n.appendChild(G.el('div', {
          html: 'Thẻ đã tới trần cấp. Muốn nuôi tiếp thì phải <b>uncap</b> — quay trúng thẻ này ' +
            'lần nữa ở banner tuyển thủ, mỗi lần uncap mở thêm 5 cấp.',
          style: 'font-size:12.5px;color:#8a6a2a;line-height:1.7;background:#fffaeb;' +
            'border:2px solid #f0dfae;border-radius:12px;padding:10px'
        }));
      } else {
        var muaDuoc = G.capMuaDuoc(b);
        var moc = [1, 5, 10].filter(function (x) { return x <= tran - b.cap; });
        if (tran - b.cap > 10) moc.push(tran - b.cap);
        else if (moc.indexOf(tran - b.cap) < 0) moc.push(tran - b.cap);

        nhanNho(n, 'THUÊ CHUYÊN GIA KÈM');
        var hang = G.el('div', { style: 'display:flex;gap:7px;flex-wrap:wrap' });
        moc.forEach(function (so) {
          var t = G.giaNhieuCap(b, so);
          var du = t.xu <= G.S.clb.xu;
          var nb = G.el('button.uc-nut' + (du ? '' : '.tat'), {
            text: '+' + t.so + ' cấp  ·  ' + G.so(t.xu) + ' xu',
            style: 'width:auto;flex:none;padding:8px 14px;font-size:12.5px'
          });
          nb.addEventListener('click', function () {
            var len = G.nangCapTT(b, so);
            if (len) { G.tieng('tapTot'); ve(); veGiua(); vePhai(); }
          });
          hang.appendChild(nb);
        });
        n.appendChild(hang);
        n.appendChild(G.el('div.uc-phu', {
          text: 'Đang có ' + G.so(G.S.clb.xu) + ' xu — đủ cho ' + muaDuoc + ' cấp.',
          style: 'margin-top:6px'
        }));

        /* trước → sau, tính trên số cấp mua nổi (hoặc 5 cấp nếu chưa đủ xu) */
        var xem = Math.max(1, Math.min(muaDuoc || 5, tran - b.cap));
        nhanNho(n, 'NẾU LÊN ' + xem + ' CẤP');
        var bang = G.el('div', { style: 'background:#f7f6fb;border:2px solid #e6e2ef;' +
          'border-radius:12px;padding:4px 10px' });
        G.soHieu(b, b.cap + xem).forEach(function (x) {
          if (Math.abs(x.b - x.a) < (x.pt ? 0.0005 : 0.5)) return;
          var r = G.el('div', { style: 'display:flex;justify-content:space-between;gap:8px;padding:3px 0;font-size:12px' });
          r.appendChild(G.el('span', { text: x.ten, style: 'color:#8a7f8f' }));
          var v = G.el('span');
          v.appendChild(G.el('span', { text: so1(x.a, x.pt), style: 'color:#a09aa8' }));
          v.appendChild(G.el('span', { text: '  →  ', style: 'color:#c4bed0' }));
          v.appendChild(G.el('b', { text: so1(x.b, x.pt), style: 'color:#3d9c63' }));
          r.appendChild(v);
          bang.appendChild(r);
        });
        n.appendChild(bang);
      }

      n.appendChild(G.el('div.uc-phu', {
        html: 'Đường lên cấp thứ hai <b>không mua được</b>: cho thẻ này vào đội hình và chạy hết ' +
          'một mùa. Càng thắng nhiều giải càng nhiều kinh nghiệm.',
        style: 'margin-top:10px'
      }));
    }
    ve();
    return G.hop({ sang: true, dau: 'Nuôi thẻ — ' + goc.biet, node: n,
      nut: [{ chu: 'Xong', chinh: true }] });
  }

  function so1(v, pt) {
    return pt ? (Math.round(v * 1000) / 10) + '%' : String(Math.round(v));
  }

  function moCaiDat() {
    var n = G.el('div');
    var r = G.el('label', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:10px' });
    var cb = G.el('input', { type: 'checkbox' });
    cb.checked = !!G.S.cai.rung;
    cb.addEventListener('change', function () { G.S.cai.rung = cb.checked; G.CAI.rung = cb.checked; G.luu(); });
    r.appendChild(cb); r.appendChild(G.el('span', { text: 'Rung khi có khoảnh khắc lớn' }));
    n.appendChild(r);

    var r2 = G.el('label', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:10px' });
    var cb2 = G.el('input', { type: 'checkbox' });
    cb2.checked = G.S.cai.tieng !== false;
    cb2.addEventListener('change', function () {
      G.S.cai.tieng = cb2.checked; G.tatTieng(!cb2.checked); G.luu();
      if (cb2.checked) G.tieng('chon');
    });
    r2.appendChild(cb2); r2.appendChild(G.el('span', { text: 'Tiếng' }));
    n.appendChild(r2);
    n.appendChild(G.el('div.uc-phu', { text: 'Bản lưu nằm trong máy này. Xoá là mất hết.',
      style: 'margin:10px 0' }));
    G.hop({ sang: true, dau: 'Cài đặt', node: n, nut: [
      { chu: 'Xoá bản lưu', do: true, gt: 'xoa' },
      { chu: 'Đóng', chinh: true, gt: null }
    ] }).then(function (v) {
      if (v === 'xoa') {
        G.hop({ sang: true, dau: 'Chắc chưa?', html: 'Xoá là mất sạch huấn luyện viên, tuyển thủ, gia phả.',
          nut: [{ chu: 'Xoá', do: true, gt: 1 }, { chu: 'Thôi', gt: 0, chinh: true }] })
          .then(function (x) { if (x) { G.xoaSave(); chon = { hlv: null, tt: [], cuu: [] }; G.moManCLB('ca'); } });
      }
    });
  }

})(window);
