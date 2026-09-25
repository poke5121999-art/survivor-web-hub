/* ui-ca.js — màn huấn luyện, chép màn Career / Training của Uma Musume bản PC.
   Bố cục (toạ độ trong css/ui.css): khung game dọc 540×720 · panel Nhật ký · rail.
   Hai lớp nút như Uma: sáu việc (Nghỉ · Tập · Kỹ năng / Y tế · Xả hơi · Giao hữu); bấm Tập thì
   thay bằng năm nút tròn của flash gốc `nut_tap` (pf_fl_singlemode_btn_trainingmenu00).
   Luật thao tác: chạm sân lần 1 = XEM TRƯỚC, chạm lần 2 = CHỐT. Không có hộp xác nhận
   (DESIGN.md §8.2) — trên điện thoại một hộp xác nhận cho mỗi lượt là cực hình. */
(function (G) {
  'use strict';

  var ca = null;
  var sanDangXem = -1;

  /* ══════════ bảng dữ liệu của màn ══════════ */

  /* sáu việc: `ic` hai khung ảnh gốc — khung 1 là bản "đang được mời" (Uma thêm trăng sao cho
     Rest khi mệt, dấu chấm than cho Infirmary khi có bệnh); `petit` là ô trong dải chibi của HLV */
  var VIEC = [
    { id: 'nghi', ten: 'Nghỉ', ic: 'nghi', goi: function () { return ca.theluc < 40; } },
    { id: 'tap', ten: 'Tập', petit: 0 },
    { id: 'giaoan', ten: 'Kỹ năng', ic: 'kn', goi: function () { return coKyNangMuaDuoc(); } },
    { id: 'yte', ten: 'Y tế', ic: 'yte', goi: function () { return ca.trangThai.length > 0; } },
    { id: 'xahoi', ten: 'Xả hơi', ic: 'xahoi', goi: function () { return ca.tam <= 1; } },
    { id: 'giaohuu', ten: 'Giao hữu', petit: 2, tat: function () { return ca.theluc < 20; } }
  ];

  /* năm sân theo thứ tự chỉ số Cơ · Bền · Lực · Lì · Não = Speed · Stamina · Power · Guts · Wit.
     `ma` là mã lệnh tập của Uma (101 Speed, 105 Stamina, 102 Power, 103 Guts, 106 Wit) — tên ảnh
     icon trên nút tròn. `nen` là nền cảnh khi đang xem sân ấy. */
  var SAN = [
    { khoa: 'co', ma: '00101', nen: 'tap0', noi: 'Đường đua cỏ' },
    { khoa: 'ben', ma: '00105', nen: 'tap1', noi: 'Hồ bơi' },
    { khoa: 'luc', ma: '00102', nen: 'tap2', noi: 'Phòng gym' },
    { khoa: 'li', ma: '00103', nen: 'tap3', noi: 'Đường đất' },
    { khoa: 'nao', ma: '00106', nen: 'tap4', noi: 'Lớp học' }
  ];
  /* màu viền chữ theo cấp sân = màu đế tròn singlemode_base_training_0N (lá · lam · cam · hồng · tím) */
  var MAU_CAP = ['#3f8f06', '#1f6fd0', '#d4760a', '#d8366f', '#8048cf'];
  var NUT_X = [98, 194, 290, 386, 482], NUT_Y = 628, NUT_K = 0.45;
  var HANG = 'GFEDCBAS';

  function anhCa(ten) { return 'art/uma/ca/' + ten + '.png?v=' + (G.ART_V || ''); }
  function anhNen(ten) { return 'art/uma/nen/' + ten + '.webp?v=' + (G.ART_V || ''); }
  function uma(id) { return (window.UMA_NGUOI || {})[id] || null; }
  function coKyNangMuaDuoc() {
    return G.KYNANG.some(function (k) { return ca.kyNang.indexOf(k.id) < 0 && !G.coTheMua(ca, k.id); });
  }

  G.moManCa = function (c) {
    ca = c;
    sanDangXem = -1;
    dangBan = false;
    mo = 'viec';
    G.hienMan('man-ca');
    ganNut();
    veTatCa();
    /* mở lại một ca tắt giữa chừng: lượt trước còn nợ giải / cảm hứng thì đá nốt, còn ca đã
       hết (chung kết xong, hay đã bị loại) thì sang thẳng màn kết mùa */
    if (ca.choCamHung || ca.giaiDo) return tiepLuot();
    if (ca.xong || ca.dut) return G.ketThucMua(ca);
    if (G.day) G.day('ca');
  };

  function ganNut() {
    var nl = G.$('#ca-nut-lich');
    if (nl && !nl._daGan) {
      nl._daGan = 1;
      nl.addEventListener('click', function () { G.tieng('cham'); G.moBXH('lich'); });
      G.$('#ca-nut-so').addEventListener('click', function () { G.tieng('cham'); if (G.dayLai) G.dayLai('ca'); });
    }
  }

  function veTatCa() {
    G.$('#hang-viec').hidden = (mo !== 'viec');
    G.$('#hang-san').hidden = (mo !== 'san');
    G.$('#ca-nhan').textContent = mo === 'san' ? 'Tập luyện' : 'Ca huấn luyện';
    G.$('#ca-khung').classList.toggle('san', mo === 'san');
    veNen(); veNguoi(); veTren(); veRail(); veChiSo(); veTang(); veViec(); veSan(); veHoTro(); veNhatKy();
  }

  /* ══════════ cảnh: nền tranh gốc + nhân vật đứng ══════════ */
  var nenDang = '';
  function veNen() {
    var k = mo === 'san' && sanDangXem >= 0 ? SAN[sanDangXem].nen : 'ca';
    if (k === nenDang) return;
    nenDang = k;
    var e = G.$('#ca-nen');
    e.style.backgroundImage = 'url(' + anhNen(k) + ')';
    e.classList.remove('doi'); void e.offsetWidth; e.classList.add('doi');
  }

  function veNguoi() {
    var u = uma(ca.hlvId);
    G.$('#ca-nguoi').style.backgroundImage = u ? 'url(' + u.dung + '?v=' + (G.ART_V || '') + ')' : 'none';
    var b = G.$('#ca-bong'), h = G.HLV_THEO_ID[ca.hlvId];
    b.hidden = mo !== 'viec' || !h || !h.tieu;
    if (h) b.textContent = h.tieu;
  }

  /* ══════════ thanh trên: tờ lịch lượt · mục tiêu · thể lực · tâm trạng · trận kế ══════════ */
  var luotCu = -1, tamCu = -1;
  function veTren() {
    var muc = G.LICH[ca.luot - 1] || {};
    var con = ca.soLuot - ca.luot + 1;
    G.$('#ca-luot-so').textContent = con;
    var lich = G.$('#ca-lich'), u = uma(ca.hlvId);
    if (u && u.luot) lich.style.backgroundImage = 'url(' + u.luot + '?v=' + (G.ART_V || '') + ')';
    if (luotCu !== -1 && luotCu !== con) { lich.classList.remove('nhay'); void lich.offsetWidth; lich.classList.add('nhay'); }
    luotCu = con;
    G.$('#ca-gd').textContent = 'Mùa ' + ((G.S.clb && G.S.clb.mua) || 1) + (muc.gd ? ' · ' + muc.gd : '');

    var ke = tenGiaiKe();
    G.$('#ca-mucteu-chu').textContent = muc.giai ? 'Hôm nay đấu: ' + muc.giai.ten
      : (ke ? 'Chuẩn bị cho ' + ke : 'Về đích mùa giải');
    G.$('#ca-giai').textContent = muc.giai ? muc.giai.ten : (ke || 'Hết mùa');

    var p = ca.theluc / ca.thelucMax;
    G.$('#ca-luc-thanh').style.width = (p * 100) + '%';
    G.$('#ca-luc-so').textContent = ca.theluc + '/' + ca.thelucMax;

    var t = G.$('#ca-tam');
    t.style.backgroundImage = 'url(art/uma/fl/cs_utx_ico_motivation_l_0' + ca.tam + '.png)';
    t.title = G.TAM[ca.tam].ten;
    if (tamCu !== -1 && tamCu !== ca.tam) { t.classList.remove('nhay'); void t.offsetWidth; t.classList.add('nhay'); }
    tamCu = ca.tam;
  }

  function tenGiaiKe() {
    for (var i = ca.luot - 1; i < G.LICH.length; i++) if (G.LICH[i].giai) return G.LICH[i].giai.ten;
    return null;
  }

  /* ══════════ rail dọc bên phải ══════════ */
  var RAIL = [
    { id: 'log', ten: 'Nhật ký' },
    { id: 'bxh', ten: 'Bảng\nxếp hạng' },
    { id: 'tin', ten: 'Bản tin' },
    { id: 'lich', ten: 'Lịch' },
    { id: 'doi', ten: 'Tuyển thủ' },
    { id: 'kn', ten: 'Kỹ năng' },
    { id: 'so', ten: 'Sổ tay' }
  ];

  function veRail() {
    var r = G.xoa(G.$('#ca-rail'));
    RAIL.forEach(function (x) {
      var b = G.el('button' + (x.id === 'log' ? '.chon' : ''));
      b.appendChild(G.el('i', { style: 'background-image:url(' + anhCa('ray_' + x.id) + ')' }));
      x.ten.split('\n').forEach(function (d) { b.appendChild(G.el('span', { text: d })); });
      if (x.id === 'tin') {
        var so = G.soTinMoi && G.soTinMoi();
        if (so) b.appendChild(G.el('em.cham', { text: so }));
      }
      if (x.id === 'bxh' && G.hangTa) b.appendChild(G.el('span.phu', { text: 'hạng ' + G.hangTa().hang }));
      b.addEventListener('click', function () {
        if (x.id === 'log') return;
        G.tieng('cham');
        if (x.id === 'bxh') return G.moBXH();
        if (x.id === 'tin') return G.moBXH('tin');
        if (x.id === 'lich') return G.moBXH('lich');
        if (x.id === 'doi') return moDoiHinh();
        if (x.id === 'kn') return moGiaoAn();
        if (x.id === 'so') return G.dayLai && G.dayLai('ca');
      });
      r.appendChild(b);
    });
  }

  /* ══════════ bảng năm chỉ số + điểm kỹ năng ══════════ */
  function veChiSo() {
    var b = G.xoa(G.$('#bang-chiso'));
    var nam = G.el('div.ca-cs-5');
    for (var i = 0; i < 5; i++) {
      var v = ca.chiso[i], goc = G.hangChuGoc(v);
      var o = G.el('div.ca-cs-o');
      var dau = G.el('div.ca-cs-dau');
      dau.appendChild(G.el('i', { style: 'background-image:url(art/uma/fl/cut_utx_ico_trainingcut_status_0' + i + '.png)' }));
      dau.appendChild(G.el('span', { text: G.TEN_CHISO[i] }));
      o.appendChild(dau);
      var than = G.el('div.ca-cs-than');
      var hg = G.el('i.hang', { style: 'background-image:url(' + anhCa('hang_' + Math.max(0, HANG.indexOf(goc))) + ')' });
      if (G.hangChu(v) !== goc) hg.appendChild(G.oUma('so.+', 9));
      than.appendChild(hg);
      var so = G.el('div.ca-cs-so');
      so.appendChild(G.el('b', { text: String(v) }));
      so.appendChild(G.el('span', { text: '/' + ca.tran[i] }));
      than.appendChild(so);
      o.appendChild(than);
      nam.appendChild(o);
    }
    b.appendChild(nam);
    var kn = G.el('div.ca-cs-kn');
    kn.appendChild(G.el('div.ca-cs-dau', { text: 'Điểm KN' }));
    kn.appendChild(G.el('b', { text: String(ca.diemKN) }));
    b.appendChild(kn);
  }

  /** hàng số cam "+N" trên đầu từng cột: xem trước khi đang chọn sân, hoặc số vừa ăn sau buổi tập.
      Số vừa ăn phải sống hết 1,5 giây dù màn bị vẽ lại (sang lượt vẽ lại ngay sau khi tập). */
  var bayDen = 0;
  function veTang(an, kn, bay) {
    if (!an && mo === 'viec' && performance.now() < bayDen) return;
    if (bay) bayDen = performance.now() + 1500;
    var h = G.xoa(G.$('#ca-tang'));
    h.classList.toggle('bay', !!bay);
    if (!an && mo === 'san' && sanDangXem >= 0) {
      var xt = G.xemTruoc(ca, sanDangXem);
      an = xt.an; kn = xt.diemKN;
    }
    for (var i = 0; i < 6; i++) {
      var o = G.el('div' + (i === 5 ? '.kn' : ''));
      var n = an ? (i < 5 ? an[i] : kn) : 0;
      if (n > 0) o.appendChild(G.oSoUma('+' + n, 22));
      h.appendChild(o);
    }
  }

  /* ══════════ sáu nút việc ══════════ */
  /* `mo` = đang mở lớp nào: 'viec' (sáu việc) hay 'san' (năm sân, sau khi bấm Tập) */
  var mo = 'viec';

  function veViec() {
    var h = G.xoa(G.$('#hang-viec'));
    if (mo !== 'viec') return;
    var u = uma(ca.hlvId);
    VIEC.forEach(function (v) {
      var tat = v.tat && v.tat();
      var goi = !tat && v.goi && v.goi();
      var b = G.el('div.uma-nut.v-' + v.id + (tat ? '.tat' : '') + (goi ? '.goi' : ''));
      if (v.ic) b.appendChild(G.el('i', { style: 'background-image:url(' + anhCa('ic_' + v.ic + (goi ? '1' : '0')) + ')' }));
      else if (u && u.petit) {
        /* chibi của chính HLV, như nút Training của Uma có chibi nhân vật đang nuôi */
        var o = v.petit + (v.id === 'tap' && coCauVong() ? 1 : 0);
        b.appendChild(G.el('i', { style: 'background-image:url(' + u.petit + '?v=' + (G.ART_V || '') + ');' +
          'background-size:400% 100%;background-position:' + (o * 100 / 3) + '% 0' }));
      }
      b.appendChild(G.el('b', { text: v.ten }));
      /* chấm cầu vồng trên nút Tập: có sân nổ cầu vồng thì thấy được TRƯỚC khi mở lớp sân */
      if (v.id === 'tap') {
        var cv = 0;
        for (var s2 = 0; s2 < 5; s2++) if (G.xemTruoc(ca, s2).cauVong) cv++;
        if (cv) b.appendChild(G.el('em.uma-cv', { text: '🌈' + (cv > 1 ? cv : '') }));
      }
      if (!tat) b.addEventListener('click', function () {
        if (dangBan) return;
        if (v.id === 'tap') { G.tieng('cham'); return moLop('san'); }
        if (v.id === 'giaoan') { G.tieng('cham'); return moGiaoAn(); }
        lamViec({ loai: v.id });
      });
      h.appendChild(b);
    });
  }

  function coCauVong() {
    for (var s = 0; s < 5; s++) if (G.xemTruoc(ca, s).cauVong) return true;
    return false;
  }

  function moLop(x) {
    mo = x;
    if (x === 'san') {
      /* Uma mở màn Training là đã nâng sẵn sân vừa tập lần trước: thấy ngay số xem trước */
      sanDangXem = ca.sanTruoc != null ? ca.sanTruoc : 0;
      dungNut();
      chonNut(sanDangXem, -1);
      if (flNhan) { flNhan.phat('', 'in'); }
    } else {
      sanDangXem = -1;
    }
    veTatCa();
    chay();
  }

  /* ══════════ năm sân: flash gốc trên canvas #ca-fl ══════════ */
  var nut = null, flNhan = null, flKq = null, kqHet = 0;

  function dungNut() {
    nut = SAN.map(function (x, s) {
      var fl = G.flUma('nut_tap');
      fl.chu('txt_rate_fail00', 'Tỉ lệ hỏng');
      return fl;
    });
    flNhan = G.flUma('nen_tap');
  }

  function capNhatNut() {
    if (!nut) dungNut();
    SAN.forEach(function (x, s) {
      var fl = nut[s], xt = G.xemTruoc(ca, s), cap = Math.min(5, Math.max(1, xt.cap));
      fl.dat('dum_base_trainingmenu00', G.anhFlRoi('singlemode_base_training_0' + cap));
      fl.dat('dum_ico_trainingmenu00', G.anhFlRoi('singlemode_training_' + (s === sanDangXem ? 'on_' : 'off_') + x.ma));
      fl.chu('txt_trainingmenu_menu00', G.TEN_CHISO[s]);
      fl.chu('txt_trainingmenu_lv00', 'Lv.' + cap);
      fl.chu('num_rate_fail00', xt.hong + '%');
      fl.mau = MAU_CAP[cap - 1];
      fl.phat('mc_btn_trainingmenu00/btn_training_menu_up00/mc_txt_ballon_rate00/txt_ballon_rate00',
        xt.hong <= 10 ? 'in1' : xt.hong < 30 ? 'in2' : 'in3');
    });
    if (sanDangXem >= 0 && flNhan) {
      var cap2 = Math.min(5, Math.max(1, G.xemTruoc(ca, sanDangXem).cap));
      flNhan.dat('dum_ico_trainingmenu00', G.anhFlRoi('singlemode_training_on_' + SAN[sanDangXem].ma));
      flNhan.chu('txt_trainingmenu_lv00', G.TEN_CHISO[sanDangXem] + ' Lv.' + cap2);
      flNhan.chu('txt_trainingmenu_exp00', SAN[sanDangXem].noi);
      flNhan.phat('mc_tx_menu_color00', 'lv' + cap2);
      flNhan.phat('mc_tx_menu_color01', 'lv' + cap2);
    }
  }

  var PHAN = ['btn_training_menu_up00', 'btn_training_menu_mid00', 'btn_training_menu_dn00'];
  function chonNut(moi, cu) {
    if (!nut) return;
    PHAN.forEach(function (p) {
      if (cu >= 0 && cu !== moi) nut[cu].phat('mc_btn_trainingmenu00/' + p, 'select_out');
      if (moi >= 0) nut[moi].phat('mc_btn_trainingmenu00/' + p, 'select_in');
    });
  }

  function veSan() {
    var h = G.xoa(G.$('#hang-san'));
    if (mo !== 'san') return;
    capNhatNut();
    SAN.forEach(function (x, s) {
      var b = G.el('div.uma-nut.san.' + x.khoa + (sanDangXem === s ? '.chon' : ''),
        { style: 'left:' + (NUT_X[s] - 45) + 'px' });
      b.addEventListener('click', function () { chamSan(s); });
      h.appendChild(b);
    });
    var ql = G.el('button.ca-back', { text: 'Quay lại' });
    ql.addEventListener('click', function () { if (dangBan) return; G.tieng('cham'); moLop('viec'); });
    h.appendChild(ql);
  }

  function chamSan(s) {
    if (mo !== 'san' || dangBan) return;
    if (sanDangXem !== s) {
      var cu = sanDangXem;
      sanDangXem = s;
      G.tieng('cham');
      chonNut(s, cu);
      if (flNhan) flNhan.phat('', 'in');
      veNen(); veSan(); veTang(); veHoTro();
      return;
    }
    nut[s].phat('mc_btn_trainingmenu00', 'DownIn');
    lamViec({ loai: 'tap', san: s });
  }

  /** mặt tuyển thủ có mặt ở sân đang xem, xếp dọc mép phải như thẻ hỗ trợ của Uma */
  function veHoTro() {
    var h = G.xoa(G.$('#ca-hotro'));
    if (mo !== 'san' || sanDangXem < 0) return;
    G.xemTruoc(ca, sanDangXem).nguoi.forEach(function (i) {
      var cv = G.cauVong(ca, i, sanDangXem);
      var o = G.el('div');
      var m = G.el('div.mat' + (cv ? '.cam' : ''));
      var a = G.oAnh && G.oAnh(ca.tt[i], 48);
      if (a) m.appendChild(a);
      o.appendChild(m);
      var th = G.el('div.than' + (ca.than[i] >= 80 ? '.cam' : ''));
      th.appendChild(G.el('i', { style: 'width:' + ca.than[i] + '%' }));
      o.appendChild(th);
      if (ca.goiY[i]) o.appendChild(G.el('b.goiy', { text: '!' }));
      h.appendChild(o);
    });
  }

  /* một vòng rAF vẽ mọi flash đang sống; tự tắt khi không còn gì để vẽ */
  var dangChay = false, tCu = 0;
  function chay() {
    if (dangChay) return;
    dangChay = true; tCu = performance.now();
    requestAnimationFrame(khung);
  }
  function khung(bay) {
    var man = G.$('#man-ca');
    var cv = G.$('#ca-fl'), ctx = cv.getContext('2d');
    var dt = Math.min(0.05, (bay - tCu) / 1000); tCu = bay;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    var con = false;
    if (!man.hidden && mo === 'san' && nut) {
      if (flNhan) flNhan.ve(ctx, 0, 157, 0.5, dt);
      /* nút đang chọn vẽ SAU CÙNG để bóng "Tỉ lệ hỏng" nằm trên hai nút kề */
      for (var s = 0; s < 5; s++) if (s !== sanDangXem) nut[s].ve(ctx, NUT_X[s], NUT_Y, NUT_K, dt);
      if (sanDangXem >= 0) nut[sanDangXem].ve(ctx, NUT_X[sanDangXem], NUT_Y, NUT_K, dt);
      con = true;
    }
    if (!man.hidden && flKq && bay < kqHet) { flKq.ve(ctx, 270, 330, 0.62, dt); con = true; }
    if (con) requestAnimationFrame(khung);
    else dangChay = false;
  }

  /** chữ kết quả buổi tập gốc (SUCCESS / FAIL từng chữ bật lên) giữa cảnh */
  function hienKetQuaTap(kq) {
    if (!flKq) flKq = G.flUma('kq_tap');
    if (!flKq) return;
    var nhan = kq.hong ? 'in_fail00' : kq.cauVong ? 'in_suc00x2' : 'in_suc00';
    flKq.phat('', nhan);
    kqHet = performance.now() + (kq.cauVong ? 2300 : 1100);
    chay();
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
      n.appendChild(d);
    });
    G.hop({ dau: 'Tuyển thủ trong ca', node: n, rong: 520 });
  }

  /* ══════════ Nhật ký: thẻ lời thoại như panel Log của Uma ══════════ */
  function veNhatKy() {
    var b = G.xoa(G.$('#nk-than'));
    ca.log.slice(-14).reverse().forEach(function (k, idx) {
      var kh = G.el('div.nk-the' + (idx === 0 ? '.moi' : ''));
      var m = G.el('div.nk-mat');
      var a = G.oAnh && G.oAnh(ca.hlvId, 50);
      if (a) m.appendChild(a);
      kh.appendChild(m);
      var bo = G.el('div.nk-bo');
      bo.appendChild(G.el('div.nk-tieu', { text: 'Lượt ' + k.luot + ' · ' + k.tieu }));
      (k.dong || []).forEach(function (d) {
        var dg = G.el('div.nk-dong' + (d.vang ? '.vang' : (d.v < 0 || d.xau ? '.xau' : '')));
        dg.appendChild(G.el('span', { text: d.t }));
        if (d.v) dg.appendChild(G.el('b', { text: (d.v > 0 ? '+' : '') + d.v }));
        else if (d.xau) dg.appendChild(G.el('b', { text: '!' }));
        bo.appendChild(dg);
      });
      kh.appendChild(bo);
      b.appendChild(kh);
    });
  }

  /* Chỉ số vừa tăng: số "+N" cam bật lên trên đúng cột, con số trong cột đếm từ giá trị cũ lên
     giá trị mới — Uma làm đúng như thế sau mỗi buổi tập. */
  function tangChiSo(truoc, truocKN) {
    var cuoi = ca.chiso.slice(), t0 = performance.now();
    var an = cuoi.map(function (v, i) { return Math.max(0, v - truoc[i]); });
    if (an.some(function (x) { return x > 0; }) || ca.diemKN > truocKN) {
      veTang(an, Math.max(0, ca.diemKN - truocKN), true);
      G.$('#ca-bong').style.visibility = 'hidden';     /* lời HLV nằm đúng chỗ số bay lên */
      setTimeout(function () { veTang(); G.$('#ca-bong').style.visibility = ''; }, 1600);
    }
    (function dem() {
      var p = Math.min(1, (performance.now() - t0) / 650), e = 1 - Math.pow(1 - p, 3);
      var o = G.$$('#bang-chiso .ca-cs-so b');
      cuoi.forEach(function (v, i) {
        if (v > truoc[i] && o[i] && ca.chiso[i] === v) o[i].textContent = String(Math.round(truoc[i] + (v - truoc[i]) * e));
      });
      if (p < 1) requestAnimationFrame(dem);
    })();
  }

  /* ── làm một việc rồi sang lượt ── */
  /* Chốt một lượt một việc. Băng lớn (CẦU VỒNG MỞ!, CẢM HỨNG!) không chặn chạm, và
     `veTatCa()` vẽ lại nút trước khi băng hạ — không có cờ này thì bấm thêm được việc thứ
     hai trên cùng lượt, `sangLuot` chạy hai lần và hai chuỗi vào giải chồng lên nhau. */
  var dangBan = false;

  function lamViec(v) {
    if (dangBan) return;
    var truocCS = ca.chiso.slice(), truocKN = ca.diemKN;
    var kq = G.lamViec(ca, v);
    if (!kq) return;
    dangBan = true;
    if (v.loai === 'tap') ca.sanTruoc = v.san;

    var chuoi = Promise.resolve();
    /* Uma: nút tròn nhún xuống rồi mới sang cảnh kết quả */
    if (v.loai === 'tap') chuoi = G.doi(260);

    chuoi = chuoi.then(function () {
      sanDangXem = -1;
      mo = 'viec';          /* làm xong một việc thì quay về lớp sáu nút, như Uma */

      var bay = G.$('#ca-bay');
      (kq.dong || []).forEach(function (d, i) {
        if (!d.v || v.loai === 'tap') return;
        var mau = d.vang ? '#ffb000' : (d.v > 0 ? '#3d9c1c' : '#e5484d');
        G.soBay(bay, (d.v > 0 ? '+' : '') + d.v + ' ' + d.t, mau, 26 + i * 11, 46 + (i % 3) * 8);
      });

      if (kq.hong) { G.tieng('hong'); G.rung('to'); }
      else if (kq.cauVong) { G.tieng('cauvong'); G.rung('vua'); G.phaoHoa(24); }
      else if (v.loai === 'tap') G.tieng('tap');
      else G.tieng('chon');
      if (kq.moCauVong) G.tieng('tapTot');
      if (v.loai === 'tap') hienKetQuaTap(kq);

      veTatCa();
      tangChiSo(truocCS, truocKN);
      luuCa();
    });

    if (kq.moCauVong) chuoi = chuoi.then(function () { return G.bangLon('CẦU VỒNG MỞ!', 'tập đúng sân của người ấy để ăn dày', 1300); });
    /* để số "+N" bay hết đã rồi mới bật hộp sự kiện — bật ngay thì khoảnh khắc được thưởng bị che mất */
    if (kq.sk) chuoi = chuoi.then(function () { return G.doi(900); }).then(function () { return hienSuKien(kq.sk); });

    chuoi.then(function () { return ketLuot(); });
  }

  function hienSuKien(sk) {
    return new Promise(function (xong) {
      var n = G.el('div');
      var ng = G.el('div.sk-nguoi');
      var anhSk = G.el('div.sk-anh');
      var mat = sk.nguoi != null && G.oAnh && G.oAnh(ca.tt[sk.nguoi], 70);
      if (mat) anhSk.appendChild(mat); else anhSk.textContent = '👤';
      ng.appendChild(anhSk);
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
            G.soBay(bay, (d.v > 0 ? '+' : '') + d.v + ' ' + d.t, d.vang ? '#ffb000' : (d.v > 0 ? '#3d9c1c' : '#e5484d'), 30 + k * 12, 44 + (k % 3) * 9);
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

  /* `[BẪY ĐÃ SẬP]` Bản cũ lưu NGAY sau `sangLuot` rồi mới vào giải. Tắt tab giữa giải là
     bản lưu đã sang lượt sau mà giải chưa hề đá: thua giải "phải thắng" chỉ cần tải lại là
     né, còn chung kết thế giới (lượt cuối, `ca.xong`) thì vào lại mọi nút đều chết — lối ra
     duy nhất là Bỏ ca. Giờ phần còn nợ của lượt (cảm hứng, giải) ghi vào bản lưu thành
     `ca.choCamHung` / `ca.giaiDo`, và `tiepLuot` trả nợ ấy — kể cả khi mở lại ca. */
  function ketLuot() {
    var r = G.sangLuot(ca);
    ca.choCamHung = !!r.camHung;
    ca.giaiDo = r.giai || null;
    luuCa();
    return tiepLuot();
  }

  function tiepLuot() {
    dangBan = true;
    var chuoi = Promise.resolve();
    if (ca.choCamHung) {
      chuoi = chuoi.then(function () {
        G.camHung(ca);
        ca.choCamHung = false;
        luuCa();
        G.tieng('camhung');
        G.phaoHoa(60);
        G.rung('to');
        veTatCa();
        return G.bangLon('CẢM HỨNG!', 'di sản của người đi trước', 1700);
      });
    }
    if (ca.giaiDo) {
      chuoi = chuoi.then(function () { return G.vaoGiai(ca, ca.giaiDo); })
        .then(function () { ca.giaiDo = null; luuCa(); });
    }
    return chuoi.then(function () {
      dangBan = false;
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
      var nut2 = G.el('button.nut' + (loi ? '' : '.chinh'), { text: gia + ' điểm' });
      if (loi) { nut2.disabled = true; nut2.style.opacity = .45; }
      nut2.addEventListener('click', function () {
        if (G.muaKyNang(ca, k.id)) return;
        G.luu(); G.$('#lop-phu').hidden = true; veTatCa(); moGiaoAn();
      });
      d.appendChild(nut2);
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
