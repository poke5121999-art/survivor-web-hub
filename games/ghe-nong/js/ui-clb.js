/* ui-clb.js — màn CLB, dựng theo màn Menu / Trainee Select của Uma Musume.
   (ảnh esport-ref/uma/sheets_guide/sheet001.jpg, RESEARCH.md §2)

   Bản trước bê bố cục TFM2: menu dọc bên trái, thẻ phẳng màu tối. Nhìn ra một cái app
   quản trị chứ không ra game. Uma điều hướng bằng HÀNG NÚT LỚN Ở ĐÁY, nội dung là thẻ
   trắng bo tròn có bóng đổ dày, nút là viên thuốc có gờ dưới, và mọi chỗ đều có mặt
   nhân vật. Ở đây làm đúng thế: thanh trên sáng · nội dung · cột phải là thẻ hành động
   · thanh nút ở đáy. Cùng bảng màu với màn huấn luyện, không thêm màu mới. */
/* ui-clb.js — MÀN NGOÀI RUN, dựng theo màn Home của Uma Musume.
   (đọc từ esport-ref/uma/sheets_career/sheet001.jpg và sheets_guide/sheet001–003.jpg)

   ┌─ VÌ SAO PHẢI DỰNG LẠI ────────────────────────────────────────────────────┐
   │ Bản trước gộp mọi thứ thành TÁM nút ngang bằng nhau ở đáy, trong đó "Ca   │
   │ huấn luyện" chỉ là một tab như mọi tab khác, và bảng xếp hạng của mùa —   │
   │ thứ chỉ tồn tại bên trong MỘT run — lại nằm ngoài run. Mở game lên chưa   │
   │ vào ca nào đã thấy "Hạng 11/12 · 0 trận": một mùa giải không tồn tại.     │
   │ Uma không làm thế. Ở Uma, một RUN (Career) là một chế độ RIÊNG BIỆT.      │
   └───────────────────────────────────────────────────────────────────────────┘

   Uma Home có đúng chừng này nút, không hơn:
     • THANH DƯỚI — 5 nút: Enhance · Story · Home · Race · Scout (Home ở giữa, to
       hơn, tô xanh).
     • BA NÚT TRÒN nổi phía trên: Club · Concert Theater · Shop.
     • MỘT NÚT LỚN "CAREER" đứng riêng — cửa duy nhất vào một run.

   Ánh xạ sang Ghế Nóng, theo CHỨC NĂNG chứ không theo tên:
     Enhance → Nuôi thẻ   Story → Gia phả   Home → Nhà
     Race    → Giải đấu   Scout → Tuyển mộ
     Club    → Huấn luyện viên   Concert Theater → Sổ tay   Shop → Cài đặt
     CAREER  → VÀO CA

   Và luồng vào run cũng đúng bốn bước của Uma (Scenario → Trainee → Legacy →
   Support Formation → Start Career!), mỗi bước có [Quay lại], thanh 5 nút vẫn
   nằm đó, panel bên phải đổi nội dung theo bước. */
(function (G) {
  'use strict';

  var trang = 'nha';
  var buoc = -1;                       /* -1 = không ở trong luồng vào ca */
  var chon = { hlv: null, tt: [], cuu: [] };

  /* thanh dưới — ĐÚNG NĂM nút, không thêm bớt */
  var NAV = [
    { id: 'nuoi', ten: ['Nuôi thẻ'], ic: '🃏' },
    { id: 'giapha', ten: ['Gia phả'], ic: '🌳' },
    { id: 'nha', ten: ['Nhà'], ic: '🏠', giua: true },
    { id: 'giai', ten: ['Giải đấu'], ic: '🏆' },
    { id: 'gacha', ten: ['Tuyển mộ'], ic: '🎁' }
  ];

  /* ba nút tròn nhỏ nổi phía trên thanh dưới */
  var TRON = [
    { id: 'hlv', ten: 'Huấn luyện viên', ic: '📋' },
    { id: 'sotay', ten: 'Sổ tay', ic: '📘' },
    { id: 'cai', ten: 'Cài đặt', ic: '⚙️' }
  ];

  /* bốn bước vào một run, đúng thứ tự của Uma */
  var BUOC = [
    { id: 'the', ten: 'Chọn thể thức', nut: 'Tiếp' },
    { id: 'hlv', ten: 'Chọn huấn luyện viên', nut: 'Tiếp' },
    { id: 'cuu', ten: 'Chọn cựu huấn luyện viên', nut: 'Xác nhận' },
    { id: 'doi', ten: 'Đội hình tuyển thủ', nut: 'BẮT ĐẦU CA!' }
  ];

  G.moManCLB = function (t) {
    if (t) { trang = t; buoc = -1; }
    G.hienMan('man-clb');
    veTat();
  };

  function veTat() { veTren(); veMenu(); veTron(); veCareer(); veGiua(); vePhai(); }

  function doiTrang(t) {
    trang = t; buoc = -1;
    G.tieng('cham');
    veTat();
  }

  function veTren() {
    var S = G.S;
    G.$('#clb-ten').textContent = S.clb.ten;
    G.$('#clb-mua').textContent = 'Mùa ' + S.clb.mua;
    G.$('#vi-xu').textContent = G.so(S.clb.xu);
    G.$('#vi-ve').textContent = S.clb.ve + '/' + S.clb.veToiDa;
    G.$('#vi-fan').textContent = G.tien(S.clb.fan);
    /* Huy hiệu hạng ở góc trái, y như "LEAP RANK E1 / 9440" của Uma — danh vọng là
       thứ tích luỹ QUA CÁC RUN, nên nó thuộc về màn ngoài chứ không thuộc về run. */
    var h = G.$('#clb-hang');
    var dv = S.clb.danhVong || 0;
    h.querySelector('b').textContent = hangCLB(dv);
    h.querySelector('i').textContent = G.so(dv);
  }

  function hangCLB(dv) {
    var N = [[60000, 'S'], [30000, 'A'], [14000, 'B'], [6000, 'C'], [2500, 'D'], [800, 'E'], [0, 'F']];
    for (var i = 0; i < N.length; i++) if (dv >= N[i][0]) return N[i][1];
    return 'F';
  }

  /* ── thanh dưới: năm nút ── */
  function veMenu() {
    var m = G.xoa(G.$('#clb-menu'));
    NAV.forEach(function (x) {
      var b = G.el('button' + (trang === x.id && buoc < 0 ? '.chon' : '') + (x.giua ? '.giua' : ''));
      b.appendChild(G.el('i', { text: x.ic }));
      x.ten.forEach(function (d) { b.appendChild(G.el('span', { text: d })); });
      b.addEventListener('click', function () { doiTrang(x.id); });
      m.appendChild(b);
    });
  }

  /* ── ba nút tròn ── */
  function veTron() {
    var e = G.xoa(G.$('#clb-tron'));
    /* Trong luồng vào ca thì ba nút tròn biến mất — Uma cũng thế: luồng Career chiếm
       lấy khu vực ấy, chỉ còn [Quay lại] và nút đi tiếp. */
    if (buoc >= 0) return;
    TRON.forEach(function (x) {
      var b = G.el('button.uc-tron-nut' + (trang === x.id && buoc < 0 ? '.chon' : ''));
      b.appendChild(G.el('i', { text: x.ic }));
      b.appendChild(G.el('span', { text: x.ten }));
      b.addEventListener('click', function () {
        if (x.id === 'cai') { G.tieng('cham'); return moCaiDat(); }
        doiTrang(x.id);
      });
      e.appendChild(b);
    });
  }

  /* ── nút lớn VÀO CA ──
     Uma để CAREER đứng riêng, to, có viền vàng nhấp nháy. Đó là cách nói "đây là
     việc chính, mấy nút kia là việc phụ" mà không cần một dòng chữ nào. */
  function veCareer() {
    var e = G.xoa(G.$('#clb-career'));
    /* Đang trong luồng thì chỗ này là CHÂN BƯỚC, không phải nút CAREER. */
    if (buoc >= 0) return veChanBuoc(e);
    var dangCo = !!G.S.ca;
    var b = G.el('button.uc-career-nut' + (dangCo ? '.tiep' : ''));
    var mat = G.el('div.uc-career-mat');
    if (dangCo) {
      var a = G.oAnh && G.oAnh(G.S.ca.hlvId, 62);
      if (a) mat.appendChild(a);
    } else {
      G.S.khoHLV.slice(0, 3).forEach(function (x, k) {
        var a2 = G.oAnh && G.oAnh(x.id, 58 - k * 4);
        if (a2) mat.appendChild(a2);
      });
    }
    b.appendChild(mat);
    var chu = G.el('div.uc-career-chu');
    chu.appendChild(G.el('b', { text: dangCo ? 'CHƠI TIẾP' : 'VÀO CA' }));
    chu.appendChild(G.el('em', { text: dangCo
      ? 'Lượt ' + G.S.ca.luot + '/' + G.S.ca.soLuot
      : 'một mùa 24 lượt' }));
    b.appendChild(chu);
    b.addEventListener('click', function () {
      G.tieng('chon');
      if (dangCo) return G.moManCa(hoiSinhCa(G.S.ca));
      /* Uma mở Trainee Select là đã có sẵn một người được chọn, không để trống —
         người chơi thấy ngay cái thẻ lớn trông thế nào rồi mới đổi. */
      chon = { hlv: (G.S.khoHLV[0] || {}).id || null, tt: [], cuu: [] };
      buoc = 0; veTat();
    });
    e.appendChild(b);
  }

  /* ── panel bên phải ── */
  function vePhai() {
    var p = G.xoa(G.$('#clb-phai'));
    var dau = 'CLB';
    var than = null;

    if (buoc >= 0) {
      /* Trong luồng vào ca: hai bước cuối cho xem SPARK sẽ thừa hưởng, đúng chỗ
         Uma đặt panel Sparks. Hai bước đầu thì nói rõ bước này đang chọn gì. */
      dau = BUOC[buoc].ten.toUpperCase();
      than = G.el('div');
      if (BUOC[buoc].id === 'cuu' || BUOC[buoc].id === 'doi') veSpark(than);
      else than.appendChild(G.el('div.uc-phu', { text: moTaBuoc(BUOC[buoc].id) }));
    } else if (trang === 'nha') {
      dau = 'CÂU LẠC BỘ';
      than = veNhaPhai();
    } else {
      dau = 'HƯỚNG DẪN';
      than = G.el('div');
      than.appendChild(G.el('div.uc-phu', { text: moTaTrang(trang) }));
    }

    var h = G.el('div.uc-panel-trong');
    h.appendChild(G.el('div.uc-panel-dau', { text: dau }));
    var t = G.el('div.uc-panel-than');
    if (than) t.appendChild(than);
    h.appendChild(t);
    p.appendChild(h);
  }

  function moTaBuoc(id) {
    return {
      the: 'Một mùa có 24 lượt: cứ 5 ngày tập thì 1 giải, lặp bốn lần; tới chung kết ' +
        'thế giới thì một ngày tập một trận. Hết mùa là hết ca — chỉ số nuôi được KHÔNG ' +
        'mang sang ca sau, chỉ có hồ sơ cựu huấn luyện viên ở lại.',
      hlv: 'Huấn luyện viên là người được nuôi trong ca này. Năng khiếu của họ quyết định ' +
        'đội hợp thể trận nào và hợp sân nào — chọn sai là cả mùa chạy ngược gió.'
    }[id] || '';
  }

  function moTaTrang(t) {
    return {
      nuoi: 'Thẻ tuyển thủ lên cấp bằng xu và bằng kinh nghiệm chạy hết một mùa. ' +
        'Thẻ cấp 1 chỉ chạy ở 40% sức, nên nuôi thẻ là thứ mang sang được ca sau.',
      giapha: 'Mỗi ca chạy xong để lại một hồ sơ. Chọn 2 hồ sơ làm cựu huấn luyện viên ' +
        'thì ca sau được thừa hưởng spark của họ.',
      giai: 'Thể thức mùa giải, và 24 đội máy mà mình sẽ gặp. Bảng xếp hạng SỐNG chỉ ' +
        'có bên trong một ca đang chạy — vì mỗi ca là một mùa riêng.',
      gacha: 'Tỉ lệ lấy đúng của Uma Musume: bậc cao nhất 3%, giữa 18%, thấp 79%. ' +
        'Quay 10 chắc chắn có ít nhất một cái bậc 2 trở lên.',
      hlv: 'Kho huấn luyện viên. Đây là thứ được nuôi trong ca — quay trúng trùng thì ' +
        'được uncap, mở thêm trần.',
      sotay: 'Luật chơi, viết ngắn.'
    }[t] || '';
  }

  function veNhaPhai() {
    var n = G.el('div');
    var S = G.S;
    if (S.ca) {
      n.appendChild(G.el('div.uc-phu', { text: 'Đang có một ca dở dang. Bấm VÀO CA để chơi tiếp, ' +
        'hoặc bỏ ca để bắt đầu lại từ đầu.' }));
      n.appendChild(G.el('button.uc-nut.phu', { text: 'Bỏ ca này', style: 'margin-top:10px',
        onclick: function () {
          G.hop({ sang: true, dau: 'Bỏ ca?', html: 'Mọi thứ đã nuôi trong ca sẽ mất, không để lại gì cả.',
            nut: [{ chu: 'Bỏ', do: true, gt: 1 }, { chu: 'Thôi', gt: 0, chinh: true }] })
            .then(function (r) {
              if (!r) return;
              G.S.ca = null;
              if (G.dongMua) G.dongMua();
              G.luu(); G.moManCLB('nha');
            });
        } }));
      return n;
    }
    /* Chưa có ca: nói CLB đang có gì, và mùa gần nhất ra sao. */
    [['Huấn luyện viên', S.khoHLV.length], ['Tuyển thủ', S.khoTT.length],
     ['Hồ sơ gia phả', S.cuu.length], ['Mùa đã chạy', S.clb.mua - 1]].forEach(function (r) {
      var d = G.el('div', { style: 'display:flex;justify-content:space-between;padding:4px 0' });
      d.appendChild(G.el('span.uc-phu', { text: r[0] }));
      d.appendChild(G.el('b', { text: String(r[1]), style: 'color:#4a3f48' }));
      n.appendChild(d);
    });
    if (S.cuu.length) {
      n.appendChild(G.el('div.uc-nhan', { text: 'MÙA GẦN NHẤT' }));
      n.appendChild(theCuu(S.cuu[0], 0, false, function () {}));
    }
    return n;
  }

  /** panel Spark: hai cựu HLV đang chọn để lại những gì */
  function veSpark(n) {
    if (!chon.cuu.length) {
      n.appendChild(G.el('div.uc-phu', { text: 'Chưa chọn cựu huấn luyện viên nào. ' +
        'Mỗi người để lại spark: xanh cộng chỉ số, hồng nâng năng khiếu, lá truyền kỹ năng riêng.' }));
      return;
    }
    chon.cuu.forEach(function (i, k) {
      var hs = G.S.cuu[i]; if (!hs) return;
      n.appendChild(G.el('div.uc-nhan', { text: (k === 0 ? 'CỰU HLV 1' : 'CỰU HLV 2') + ' · ' + hs.ten }));
      (hs.sparks || []).forEach(function (x) {
        var d = G.el('div.uc-spark.s-' + (x.mau || 'trang'));
        d.appendChild(G.el('b', { text: tenSpark(x).replace(/★+$/, '').trim() }));
        d.appendChild(G.el('em', { text: '★'.repeat(x.sao) }));
        n.appendChild(d);
      });
    });
  }

  /* ══════════ khung giữa ══════════ */
  function veGiua() {
    var g = G.xoa(G.$('#clb-giua'));
    if (buoc >= 0) return veBuoc(g);
    if (trang === 'nha') return veNha(g);
    if (trang === 'nuoi') return veKhoTT(g);
    if (trang === 'giapha') return veGiaPha(g);
    if (trang === 'giai') return veGiaiDau(g);
    if (trang === 'gacha') return veGacha(g);
    if (trang === 'hlv') return veKhoHLV(g);
    if (trang === 'sotay') return veSoTay(g);
  }

  /* ── trang NHÀ: đội hình gần nhất đứng giữa sân, không có bảng biểu gì ──
     Uma Home là nhân vật đứng giữa màn, không phải một bảng dữ liệu. */
  function veNha(g) {
    var S = G.S;
    var k = G.el('div.uc-nha');
    var hlvId = (S.ca && S.ca.hlvId) || (S.khoHLV[0] && S.khoHLV[0].id);
    if (hlvId) {
      var o = G.el('div.uc-nha-hlv');
      var a = G.oAnh && G.oAnh(hlvId, 168);
      if (a) o.appendChild(a);
      o.appendChild(G.el('div.uc-nha-ten', { text: (G.HLV_THEO_ID[hlvId] || {}).biet || '' }));
      k.appendChild(o);
    }
    var hang = G.el('div.uc-nha-hang');
    var ds = (S.ca && S.ca.tt) || S.khoTT.slice(0, 5).map(function (x) { return x.id; });
    ds.forEach(function (id) {
      var goc = G.TUYENTHU_THEO_ID[id]; if (!goc) return;
      var o2 = G.el('div.uc-nha-tt');
      var a2 = G.oAnh && G.oAnh(id, 86);
      if (a2) o2.appendChild(a2);
      o2.appendChild(G.el('div.uc-nha-ten', { text: goc.biet }));
      hang.appendChild(o2);
    });
    k.appendChild(hang);
    g.appendChild(k);
  }

  /* ── trang GIẢI ĐẤU: thể thức mùa + 24 đội, KHÔNG có bảng xếp hạng sống ── */
  function veGiaiDau(g) {
    tieu(g, 'Giải đấu', 'Một mùa có 8 giải. Bảng xếp hạng sống nằm trong ca đang chạy — ' +
      'mỗi ca là một mùa riêng, hết ca là bảng ấy khép lại.');

    nhanNho(g, 'THỂ THỨC MỘT MÙA');
    var l = G.el('div.uc-luoi', { style: luoi(226) });
    G.LICH.forEach(function (x, i) {
      if (!x.giai) return;
      var gi = x.giai;
      var d = G.el('div.uc-the');
      d.appendChild(G.el('div.uc-phu', { text: 'Lượt ' + (i + 1) }));
      d.appendChild(G.el('b', { text: gi.ten, style: 'font-size:13.5px' }));
      var ch = G.el('div.uc-chips');
      ch.appendChild(G.el('span.uc-chip', { text: gi.the }));
      ch.appendChild(G.el('span.uc-chip', { text: gi.sanDau === 'lan' ? 'sân LAN' : 'thi đấu mạng' }));
      ch.appendChild(G.el('span.uc-chip', { text: G.TEN_NHIP[gi.nhip] }));
      d.appendChild(ch);
      d.appendChild(G.el('div.uc-phu', { text: 'Thưởng ' + G.so(gi.thuong.xu) + ' xu · ' +
        G.tien(gi.thuong.fan) + ' fan', style: 'margin-top:5px' }));
      l.appendChild(d);
    });
    g.appendChild(l);

    nhanNho(g, '24 ĐỘI MÁY');
    var l2 = G.el('div.uc-luoi', { style: luoi(168) });
    G.DOI_AI.forEach(function (d) {
      var o = G.el('div.uc-the.bam');
      var h = G.el('div', { style: 'display:flex;align-items:center;gap:6px' });
      h.appendChild(G.el('i', { style: 'width:9px;height:9px;border-radius:3px;flex:none;background:' + d.mau }));
      h.appendChild(G.el('b', { text: d.ten, style: 'font-size:13px;flex:1' }));
      h.appendChild(G.el('span.uc-chip', { text: d.khu === 'vn' ? 'nội' : 'quốc tế' }));
      o.appendChild(h);
      o.appendChild(G.el('div.uc-phu', { text: 'sao: ' + d.sao + ' · lối ' +
        (G.TEN_THE[d.the] || d.the), style: 'margin-top:3px' }));
      o.addEventListener('click', function () { G.tieng('cham'); hopDoiNgoai(d); });
      l2.appendChild(o);
    });
    g.appendChild(l2);
  }

  function hopDoiNgoai(d) {
    var n = G.el('div');
    n.appendChild(G.el('div.bx-than', { text: d.tieu }));
    n.appendChild(G.el('div.uc-nhan', { text: 'TƯỚNG HAY LẤY' }));
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

  /* ══════════ luồng vào ca: bốn bước ══════════ */
  function veBuoc(g) {
    var b = BUOC[buoc];
    g.appendChild(G.el('div.uc-buoc-dau', {}, [
      G.el('span', { text: 'BƯỚC ' + (buoc + 1) + '/4' }),
      G.el('b', { text: b.ten })
    ]));

    if (b.id === 'the') veBuocThe(g);
    if (b.id === 'hlv') veBuocHLV(g);
    if (b.id === 'cuu') veBuocCuu(g);
    if (b.id === 'doi') veBuocDoi(g);

  }

  /* chân bước: [Quay lại] [Tiếp / Xác nhận / BẮT ĐẦU CA!] — đứng đúng chỗ nút CAREER */
  function veChanBuoc(e) {
    var b = BUOC[buoc];
    var chan = G.el('div.uc-buoc-chan');
    chan.appendChild(G.el('button.uc-nut-nho', { text: '‹ Quay lại', onclick: function () {
      G.tieng('cham');
      if (buoc === 0) { buoc = -1; } else { buoc--; }
      veTat();
    } }));
    chan.appendChild(G.el('div.uc-buoc-nhac', { text: nhacBuoc(b.id) }));
    var ok = buocXong(b.id);
    var np = G.el('button.uc-nut' + (b.id === 'doi' ? '.cam' : '') + (ok ? '' : '.tat'),
      { text: b.nut, style: 'width:auto;min-width:200px' });
    if (ok) np.addEventListener('click', function () {
      G.tieng('chon');
      if (buoc < 3) { buoc++; veTat(); return; }
      batDauCa();
    });
    chan.appendChild(np);
    e.appendChild(chan);
  }

  function buocXong(id) {
    if (id === 'the') return true;
    if (id === 'hlv') return !!chon.hlv;
    if (id === 'cuu') return true;                       /* chọn 0 cựu HLV vẫn chạy được */
    return chon.tt.length === 5 && G.duDoiHinh(chon.tt).du;
  }

  function nhacBuoc(id) {
    if (id === 'hlv' && !chon.hlv) return 'Chọn một huấn luyện viên để đi tiếp.';
    if (id === 'cuu') return 'Chọn tối đa 2 — bỏ trống cũng chạy được, chỉ là không có spark.';
    if (id === 'doi') {
      if (chon.tt.length !== 5) return 'Đang chọn ' + chon.tt.length + '/5 tuyển thủ.';
      var d = G.duDoiHinh(chon.tt);
      if (!d.du) return 'Thiếu: ' + d.thieu.map(function (v) { return G.VITRI_THEO_ID[v].ten; }).join(', ');
      return 'Đủ năm vị trí. Bấm để vào ca.';
    }
    return '';
  }

  function veBuocThe(g) {
    var k = G.el('div.uc-the', { style: 'max-width:620px' });
    k.appendChild(G.el('b', { text: 'Mùa giải quốc nội → Chung kết thế giới', style: 'font-size:16px' }));
    k.appendChild(G.el('div.uc-phu', { text: '24 lượt · 8 giải · một huấn luyện viên · năm tuyển thủ',
      style: 'margin:4px 0 9px' }));
    var ds = [
      ['5 ngày tập rồi 1 giải', 'lặp bốn lần, tới chung kết thế giới thì một ngày tập một trận'],
      ['Thua là hết mùa', 'từ vòng play-off trở đi, thua một giải là ca dừng ở đó'],
      ['Chỉ số không mang sang', 'hết ca là chỉ số về 0; chỉ hồ sơ cựu HLV và cấp thẻ ở lại'],
      ['Bảng xếp hạng sống trong ca', '24 đội máy đá song song, một vòng mỗi ba lượt']
    ];
    ds.forEach(function (x) {
      var d = G.el('div', { style: 'display:flex;gap:8px;padding:5px 0;border-top:1px solid #eee9f6' });
      d.appendChild(G.el('b', { text: x[0], style: 'flex:none;width:210px;font-size:12.5px' }));
      d.appendChild(G.el('span.uc-phu', { text: x[1] }));
      k.appendChild(d);
    });
    g.appendChild(k);
  }

  function veBuocHLV(g) {
    /* Uma: người đang chọn hiện TO ở trên (chỉ số + năng khiếu), lưới bên dưới. */
    if (chon.hlv) g.appendChild(theHLVTo(G.HLV_THEO_ID[chon.hlv], G.coHLV(chon.hlv)));
    var h = G.el('div.uc-luoi', { style: luoi(158) });
    G.S.khoHLV.forEach(function (b) {
      var goc = G.HLV_THEO_ID[b.id];
      h.appendChild(theHLV(goc, b, chon.hlv === b.id, function () {
        chon.hlv = b.id; veTat();
      }));
    });
    g.appendChild(h);
  }

  function theHLVTo(goc, b) {
    var k = G.el('div.uc-to');
    var a = G.oAnh && G.oAnh(goc.id, 104);
    if (a) { a.className = 'uc-to-anh'; k.appendChild(a); }
    var ph = G.el('div.uc-to-chu');
    ph.appendChild(G.el('div.uc-sao', { text: '★'.repeat(goc.sao) + ((b && b.uncap) ? '  ✦' + b.uncap : '') }));
    ph.appendChild(G.el('b', { text: goc.ten, style: 'font-size:17px' }));
    ph.appendChild(G.el('div.uc-phu', { text: '"' + goc.biet + '" — ' + goc.tieu }));
    var kn = G.KN_RIENG[goc.kn];
    ph.appendChild(G.el('div', { html: '<b style="color:#3d9c63">' + kn.ten + '</b> — ' + kn.mota,
      style: 'font-size:11.5px;line-height:1.55;color:#6b5c68;margin-top:5px' }));
    ph.appendChild(bangNK(goc.nk));
    k.appendChild(ph);
    return k;
  }

  function veBuocCuu(g) {
    if (!G.S.cuu.length) {
      g.appendChild(G.el('div.uc-the', { style: 'max-width:620px' }, [
        G.el('b', { text: 'Chưa có hồ sơ nào' }),
        G.el('div.uc-phu', { text: 'Chạy hết một mùa thì hồ sơ huấn luyện viên ấy vào gia phả, ' +
          'và ca sau được chọn tối đa 2 hồ sơ để thừa hưởng spark.' })
      ]));
      return;
    }
    /* hai ô trống ở trên, y như "1st Legacy / 2nd Legacy" của Uma */
    var o = G.el('div.uc-legacy');
    for (var k = 0; k < 2; k++) (function (k) {
      var i = chon.cuu[k];
      var d = G.el('div.uc-legacy-o' + (i == null ? '.trong' : ''));
      if (i == null) d.appendChild(G.el('span', { text: 'Cựu HLV ' + (k + 1) }));
      else {
        var hs = G.S.cuu[i];
        d.appendChild(G.el('b', { text: hs.ten }));
        d.appendChild(G.el('span', { text: 'Mùa ' + hs.mua + ' · thắng ' + hs.thang + ' giải' }));
        d.appendChild(G.el('button.uc-nut-nho', { text: 'Bỏ ra', onclick: function () {
          chon.cuu.splice(k, 1); veTat();
        } }));
      }
      o.appendChild(d);
    })(k);
    g.appendChild(o);

    var c = G.el('div.uc-luoi', { style: luoi(172) });
    G.S.cuu.slice(0, 18).forEach(function (hs, i) {
      c.appendChild(theCuu(hs, i, chon.cuu.indexOf(i) >= 0, function () {
        var k2 = chon.cuu.indexOf(i);
        if (k2 >= 0) chon.cuu.splice(k2, 1);
        else if (chon.cuu.length < 2) chon.cuu.push(i);
        veTat();
      }));
    });
    g.appendChild(c);
  }

  function veBuocDoi(g) {
    /* Uma "Support Formation": lưới ô đội hình ở trên, kho ở dưới, có [Tự chọn]. */
    var VT = ['tren', 'rung', 'giua', 'duoi', 'ho'];
    var theoVT = {};
    chon.tt.forEach(function (id) {
      var goc = G.TUYENTHU_THEO_ID[id]; if (goc) theoVT[goc.vt] = id;
    });

    var o = G.el('div.uc-oform');
    VT.forEach(function (vt) {
      var id = theoVT[vt];
      var d = G.el('div.uc-oform-o' + (id ? '' : '.trong'));
      d.appendChild(G.el('div.uc-oform-vt', { text: G.VITRI_THEO_ID[vt].ten }));
      if (id) {
        var goc = G.TUYENTHU_THEO_ID[id], b = G.coTT(id) || {};
        var a = G.oAnh && G.oAnh(id, 62);
        if (a) d.appendChild(a);
        d.appendChild(G.el('b', { text: goc.biet }));
        d.appendChild(G.el('em', { text: goc.bac + ' · cấp ' + (b.cap || 1) }));
        d.addEventListener('click', function () {
          chon.tt.splice(chon.tt.indexOf(id), 1); veTat();
        });
      } else {
        d.appendChild(G.el('span', { text: '+' }));
      }
      o.appendChild(d);
    });
    g.appendChild(o);

    var hang = G.el('div.uc-buoc-hanh');
    hang.appendChild(G.el('button.uc-nut-nho', { text: 'Xoá hết', onclick: function () {
      chon.tt = []; veTat();
    } }));
    hang.appendChild(G.el('button.uc-nut-nho', { text: 'Tự chọn', onclick: function () {
      chon.tt = [];
      VT.forEach(function (vt) {
        var ds = G.S.khoTT.filter(function (x) {
          return (G.TUYENTHU_THEO_ID[x.id] || {}).vt === vt;
        }).sort(function (a, b) { return (b.cap || 1) - (a.cap || 1); });
        if (ds[0]) chon.tt.push(ds[0].id);
      });
      veTat();
    } }));
    g.appendChild(hang);

    var t = G.el('div.uc-luoi', { style: luoi(146) });
    VT.forEach(function (vt) {
      G.S.khoTT.forEach(function (b) {
        var goc = G.TUYENTHU_THEO_ID[b.id];
        if (!goc || goc.vt !== vt) return;
        t.appendChild(theTT(goc, b, chon.tt.indexOf(b.id) >= 0, function () {
          var i = chon.tt.indexOf(b.id);
          if (i >= 0) { chon.tt.splice(i, 1); veTat(); return; }
          /* một vị trí chỉ một người: chọn người mới thì người cũ ra */
          var cu = chon.tt.filter(function (x) {
            return (G.TUYENTHU_THEO_ID[x] || {}).vt === goc.vt;
          })[0];
          if (cu) chon.tt.splice(chon.tt.indexOf(cu), 1);
          if (chon.tt.length < 5) chon.tt.push(b.id);
          veTat();
        }));
      });
    });
    g.appendChild(t);
  }

  function tieu(g, chu, phu) {
    g.appendChild(G.el('div.uc-tieu', { text: chu }));
    if (phu) g.appendChild(G.el('div.uc-mo', { text: phu }));
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
    /* MỘT RUN = MỘT MÙA. Bảng xếp hạng và bản tin dựng mới ở đây, và bị khép lại ở
       G.ketCa — chứ không phải dựng lười lúc có ai đó hỏi tới. Không có dòng này thì
       màn ngoài cũng gọi được G.mua() và bày ra một mùa chưa hề bắt đầu. */
    if (G.moMua) G.S.mua = G.moMua(G.S.clb.mua);
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
          .then(function (x) { if (x) { G.xoaSave(); chon = { hlv: null, tt: [], cuu: [] }; G.moManCLB('nha'); } });
      }
    });
  }

})(window);
