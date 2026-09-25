/* ui-tran.js — màn xem trận.

   Bố cục bê theo ảnh chụp Teamfight Manager 2 (RESEARCH.md §2.9):
     thanh trên  : hai đội, tỉ số mạng, vàng, số rồng/chúa/trụ, đồng hồ
     giữa trái   : bản đồ
     giữa phải   : bảng đối đầu 5 dòng · 10 thẻ tuyển thủ · bản đồ nhỏ · nút
     góc dưới trái: lời thoại
     đáy         : tốc độ 0.5/×1/×2/×3/⚡ · ẩn bảng số · tạm dừng · xem kết quả luôn

   Bản đồ vẽ bằng canvas, mọi thứ khác là DOM — DOM cập nhật 5 lần/giây chứ không mỗi khung,
   nếu không thì điện thoại nóng máy mà chẳng ai đọc kịp.
*/
(function (G) {
  'use strict';

  var tran = null, canvas = null, ctx = null;
  var chay = false, tocDo = 1, anBang = false, tamDung = false, daKet = false;
  var xongCB = null, khung = 0, lanDom = 0;
  /* ══════════ NHỊP XEM ══════════
     Bản trước để 40 tick/giây. Một tick là 0.25 giây trong trận, nên ×1 nghĩa là xem
     nhanh gấp MƯỜI lần thật: một trận 20 phút trôi qua trong 2 phút, ai cũng lướt vèo
     trên bản đồ, và không có chỗ nào cho một cú vung tay dài 0.2 giây tồn tại.
     Teamfight Manager 2 ở ×1 chạy khoảng 1.4 lần thật.

     Đo trong repo: một trận trung bình dài 1166 giây trong trận (10 trận, 915–1560).
       12 tick/giây → ×1 nhanh gấp 3 → ~6,5 phút xem. Nút 0.5 cho ra ~1,5 lần thật,
       tức là đúng nhịp ×1 của TFM2; nút ×6 cho lại đúng nhịp của bản cũ.
     Chậm lại chỉ có nghĩa khi có NỘI SUY đi kèm — xem `tiLe()` bên dưới. */
  /* Bộ mô phỏng chạy 60 tick một giây trận (nhịp TFM2, sim.js). Màn xem chạy NHIP_XEM giây trận
     cho mỗi giây thật ở ×1 — giữ đúng nhịp xem của bản trước (12 tick × 0,25 s = 3 giây trận). */
  var NHIP_XEM = 3;
  var thoaiHD = [], bayHD = [], hieuHD = [], ngaLuc = {};
  var daNghe = {}, daHa = {}, lenCapLuc = {};
  var truoc = 0, dong = 0;

  /* Giây hoạt ảnh TFM2 cho mỗi giây trong trận. Ở ×1 trận chạy nhanh gấp 3 lần thật; phát khung
     theo giờ trận thì một cú chém 0,4 giây chỉ còn một cái chớp. Trần 2 giây trận cho mỗi giây
     hoạt ảnh giữ cú chém trọn dáng mà vẫn kịp xong trước đòn kế (tốc đánh ~1,15/giây). */
  function heHinh() { return 1 / Math.min(NHIP_XEM * tocDo, 2); }
  /* tỉ lệ nội suy trong tick hiện tại (0..1) và mốc giờ đã nội suy */
  var ns = 0;

  /** giờ trong trận đã nội suy — dùng cho MỌI phép tính tuổi hiệu ứng, không thì
      hiệu ứng giật theo tick y như nhân vật trước khi có nội suy */
  function gio() { return tran.t - (G.SIM_TICK || 0.25) * (1 - ns); }

  /** vị trí đã nội suy của một thực thể có px/py */
  function viTri(o) {
    if (o.px == null) return [o.x, o.y];
    return [o.px + (o.x - o.px) * ns, o.py + (o.y - o.py) * ns];
  }

  /** hướng mặt: ưu tiên hướng do bộ mô phỏng ghi, không có thì suy từ quãng vừa đi */
  function huongCua(o) {
    if (o.huong != null) return o.huong;
    if (o.px == null) return 0;
    var dx = o.x - o.px, dy = o.y - o.py;
    if (dx * dx + dy * dy < 0.01) return o._h || 0;
    o._h = Math.atan2(dy, dx);
    return o._h;
  }

  /** đang đi hay đang đứng — quyết định có nhún chân hay không */
  function dangDi(o) {
    if (o.px == null) return false;
    var dx = o.x - o.px, dy = o.y - o.py;
    return dx * dx + dy * dy > 0.35;
  }

  G.moManTran = function (t, cb) {
    tran = t; xongCB = cb; chay = true; tamDung = false; tocDo = 1; daKet = false;
    /* trạng thái xem của trận trước không được lọt sang trận này: bảng số đang ẩn thì lần
       bấm đầu vô tác dụng, còn camera thì kẹt ở chỗ người xem kéo tới lần trước */
    anBang = false;
    cam.tuDong = true; cam.theo = null; cam.x = cam.mx = W0 / 2; cam.y = cam.my = H0 / 2;
    tran.veHinh = true;            /* từ đây sim mới dựng dữ liệu hiệu ứng — xem sim.js */
    thoaiHD = []; bayHD = []; hieuHD = []; ngaLuc = {};
    G.hienMan('man-tran');
    G.nhac(Math.random() < 0.5 ? 'tran' : 'tran2');
    /* nạp lười đúng 10 tướng đang đấu: sheet sprite riêng (RESEARCH §15.1) và tiếng riêng (§15.5) */
    var idTran = {};
    tran.nguoi.forEach(function (n) { idTran[n.tuong.id] = 1; if (G.napTuong) G.napTuong(n.tuong.id); });
    var tienTo = Object.keys(idTran).map(function (id) { return 'tran.' + id + '.'; });
    if (window.AM_BANG) Object.keys(window.AM_BANG.tieng).forEach(function (k) {
      var ph = k.split('.');
      if (ph[0] === 'tran' && !G.TUONG_THEO_ID[ph[1]] && !G.TUONG_CU[ph[1]]) tienTo.push(k);
    });
    G.napTieng(tienTo);
    daNghe = {}; daHa = {}; lenCapLuc = {};
    dungKhung();
    /* bài dạy lần đầu: trận ĐỨNG YÊN cho tới khi đóng hộp, không thì mất những giây đầu */
    if (G.day && !(G.S.day || {}).tran) {
      tamDung = true;
      G.day('tran').then(function () { tamDung = false; });
    }
    truoc = performance.now();
    requestAnimationFrame(vong);
  };

  /* ══════════ dựng khung DOM ══════════ */
  function dungKhung() {
    var m = G.xoa(G.$('#man-tran'));
    var c = tran.cau;

    /* thanh trên */
    var tren = G.el('div.tr-tren');
    tren.appendChild(G.el('div.tr-doi.trai', { html:
      '<span class="tr-cham" style="background:' + (c.ta.mau || '#3ddc97') + '"></span><b>' + c.ta.ten + '</b>' }));
    tren.appendChild(G.el('div.tr-so#tr-so-xanh', { text: '0' }));
    tren.appendChild(G.el('div.tr-giua', { html:
      '<div class="tr-dh" id="tr-dh">0:00</div><div class="tr-obj" id="tr-obj"></div>' }));
    tren.appendChild(G.el('div.tr-so#tr-so-do', { text: '0' }));
    tren.appendChild(G.el('div.tr-doi.phai', { html:
      '<b>' + c.dich.ten + '</b><span class="tr-cham" style="background:' + (c.dich.mau || '#e5484d') + '"></span>' }));
    m.appendChild(tren);

    /* thân */
    var than = G.el('div.tr-than');

    var trai = G.el('div.tr-ban');
    canvas = document.createElement('canvas');
    canvas.width = 830; canvas.height = 566;
    canvas.className = 'tr-canvas';
    /* LẤY NGỮ CẢNH NGAY TẠI ĐÂY.
       `dungKhung()` dựng một thẻ <canvas> MỚI cho mỗi trận, còn `ctx` là biến của cả
       mô-đun. Bản trước chỉ lấy ngữ cảnh một lần bằng `if (!ctx)` trong veBanDo(), nên
       từ TRẬN THỨ HAI trở đi mọi nét vẽ rơi vào cái canvas cũ đã bị vứt — canvas đang
       hiển thị không ai vẽ vào, và người chơi thấy MÀN ĐEN THUI. */
    ctx = canvas.getContext('2d');
    trai.appendChild(canvas);
    trai.appendChild(G.el('div.tr-thoai#tr-thoai'));
    trai.appendChild(G.el('div.tr-banner#tr-banner', { hidden: 'hidden' }));
    than.appendChild(trai);

    var phai = G.el('div.tr-phai');
    phai.appendChild(G.el('div.tr-matchup#tr-matchup'));
    phai.appendChild(G.el('div.tr-the#tr-the'));
    var duoi = G.el('div.tr-duoi');
    duoi.appendChild(G.el('canvas.tr-mini#tr-mini', { width: 132, height: 132 }));
    var nut = G.el('div.tr-nut');
    nut.appendChild(G.el('div.tr-cam#tr-cam'));
    nut.appendChild(G.el('button.nut', { text: 'Ẩn bảng số', onclick: function (e) {
      anBang = !anBang; e.target.textContent = anBang ? 'Hiện bảng số' : 'Ẩn bảng số';
      G.$('#tr-matchup').hidden = anBang; G.$('#tr-the').hidden = anBang;
    } }));
    nut.appendChild(G.el('button.nut#tr-nut-dung', { text: '⏸ Tạm dừng', onclick: function (e) {
      tamDung = !tamDung; e.target.textContent = tamDung ? '▶ Chạy tiếp' : '⏸ Tạm dừng';
    } }));
    nut.appendChild(G.el('button.nut', { text: '⚡ Xem kết quả luôn', onclick: function () {
      if (!chay) return;
      chay = false;
      tran.veHinh = false;       /* tua hết thì khỏi dựng hàng nghìn hiệu ứng không ai xem */
      G.chayHet(tran);
      ketThuc();
    } }));
    duoi.appendChild(nut);
    phai.appendChild(duoi);
    than.appendChild(phai);
    m.appendChild(than);

    /* đáy: hàng avatar nhảy camera + tốc độ.
       Teamfight Manager 2 xếp đúng mười ảnh tuyển thủ ở góc trái đáy màn, bấm một cái là
       camera nhảy tới người đó (bản PC còn gán phím F1–F10). Thiếu nó thì người xem chỉ
       còn cách kéo chuột đi tìm — mà trận đang chạy, tìm xong thì giao tranh đã tan. */
    var day = G.el('div.tr-day');
    var hangAnh = G.el('div.tr-anhday');
    tran.nguoi.forEach(function (n) {
      var b = G.el('button.tr-mat.' + n.doi + (cam.theo === n.i ? '.theo' : ''),
        { title: n.ten + ' — ' + n.tuong.ten });
      var am = G.oAnhTuong && G.oAnhTuong(n.tuong.id, 22);
      if (am) b.appendChild(am);
      else b.appendChild(G.el('i', { text: String(n.i + 1) }));
      b.addEventListener('click', function () {
        cam.theo = (cam.theo === n.i) ? null : n.i;
        cam.tuDong = cam.theo == null;
        G.tieng('cham');
        veThe(); veNutCam(); veDayAnh();
      });
      hangAnh.appendChild(b);
    });
    day.appendChild(hangAnh);
    [0.5, 1, 2, 3, 6].forEach(function (v) {
      day.appendChild(G.el('button.tocdo' + (v === 1 ? '.chon' : ''), { text: v === 1 ? '×1' : (v < 1 ? '0.5' : '×' + v),
        onclick: function (e) {
          tocDo = v;
          G.$$('.tocdo').forEach(function (b) { b.classList.remove('chon'); });
          e.target.classList.add('chon');
        } }));
    });
    m.appendChild(day);

    veMatchup();
    veThe();
    veNutCam();
    veTren();
    veMini();
    ganKeo();
  }

  /* ══════════ vòng lặp ══════════ */
  function vong(now) {
    if (!chay) return;
    var dt = Math.min(0.1, (now - truoc) / 1000);
    truoc = now;

    if (!tamDung && !tran.xong) {
      /* tích luỹ phần lẻ. Dùng Math.round thẳng thì trên máy chạy 200 khung/giây, dt = 0.005
         và số tick làm tròn thành 0 — trận đứng im ở 0:00, đúng lỗi bắt được khi chụp màn. */
      dong = (dong || 0) + NHIP_XEM * tocDo * dt / (G.SIM_TICK || 0.25);
      var soTick = Math.floor(dong);
      dong -= soTick;
      if (soTick > 1500) soTick = 1500;
      for (var i = 0; i < soTick && !tran.xong; i++) {
        G.tickTran(tran);
        thuThoai();
      }
    }
    /* `dong` giờ là PHẦN ĐÃ ĐI của tick kế tiếp, 0..1. Vẽ ở đúng tỉ lệ ấy giữa vị trí
       đầu tick (px,py) và vị trí cuối tick (x,y) thì người đi mượt ở 60 khung/giây dù
       bộ mô phỏng chỉ chạy 12 lần một giây. Đổi lại là trễ đúng một tick — 0,25 giây
       trong trận, không ai thấy. */
    ns = tamDung ? 1 : G.kep(dong, 0, 1);
    G.NS_XEM = ns;                 /* để kịch bản đo kiểm được nội suy có chạy thật không */

    camTick(dt);
    ngheTran();
    veBanDo();
    khung++;
    /* bảng số đang ẩn thì khỏi đập đi dựng lại hai chục nút DOM năm lần một giây */
    if (khung % 12 === 0) { if (!anBang) { veMatchup(); veThe(); } veTren(); veMini(); }

    if (tran.xong) { chay = false; return ketThuc(); }
    requestAnimationFrame(vong);
  }

  /* ══════════ tiếng tướng: đánh, chiêu, chiêu cuối, hồi sinh, lên cấp ══════════
     Bắt theo MỐC sim ghi lại (danhLuc, niemLuc, hoiLuc, cap) chứ không đẻ sự kiện mới trong sim.
     Tiếng nhỏ dần theo khoảng cách tới giữa khung, ra khỏi khung thì im: mười người đánh cùng
     lúc khắp bản đồ mà kêu hết thì chỉ còn một mớ ồn. */
  function ngheTran() {
    var W = canvas.width, H = canvas.height;
    tran.nguoi.forEach(function (n) {
      var cu = daNghe[n.i] || (daNghe[n.i] = { d: n.danhLuc, n: n.niemLuc, h: n.hoiLuc, c: n.cap });
      var moi = { d: n.danhLuc, n: n.niemLuc, h: n.hoiLuc, c: n.cap };
      daNghe[n.i] = moi;
      if (n.chet > 0) return;
      var p = toaDo(n.x, n.y);
      var xa = Math.hypot(p[0] - W / 2, p[1] - H / 2) / (0.6 * Math.max(W, H));
      var am = G.kep(1.25 - xa, 0, 1);
      if (am <= 0) return;
      var id = n.tuong.id, tenT;
      if (moi.n !== cu.n && moi.n != null) { tenT = G.tiengTuong(id, n.niemKn || 'skill'); if (tenT) G.tieng(tenT, am, 0.1); }
      else if (moi.d !== cu.d && moi.d != null) { tenT = G.tiengTuong(id, 'danh'); if (tenT) G.tieng(tenT, am * 0.8, 0.09); }
      if (moi.h !== cu.h && moi.h != null) G.tieng('tran.hoiSinh', am);
      if (moi.c > cu.c && n.doi === 'xanh') { lenCapLuc[n.i] = gio(); G.tieng('tran.lenCap', am * 0.8, 0.3); }
    });
  }

  /* ══════════ lời thoại và băng thông báo ══════════ */
  function thuThoai() {
    /* đọc sự kiện mới sinh ra từ bộ mô phỏng */
    while (tran.suKien.length) {
      var s = tran.suKien.shift();
      if (s.loai === 'mang') {
        var ke = s.ai != null ? tran.nguoi[s.ai] : null;
        var bi = tran.nguoi[s.bi];
        if (ke) {
          banner(ke.ten + ' hạ gục ' + bi.ten + '!', ke.doi);
          noi(ke, 'hagục');
        } else banner(bi.ten + ' đã gục', bi.doi === 'xanh' ? 'do' : 'xanh');
        noi(bi, 'biGiet');
        G.tieng(ke && ke.doi === 'xanh' ? 'mangTa' : 'mang');
        /* một người hạ liên tiếp trong 10 giây trận: tiếng xướng "double / triple takedown" của TFM2 */
        if (ke) {
          var ds = (daHa[ke.i] || []).filter(function (t0) { return s.t - t0 < 10; });
          ds.push(s.t); daHa[ke.i] = ds;
          if (ds.length >= 2) G.tieng('tran.ha' + Math.min(5, ds.length));
          if (ds.length >= 3) G.tieng('tran.hoReo', 0.8, 4);
        }
        G.rung('vua');
      } else if (s.loai === 'quaiLon') {
        G.tieng('tran.quaiLon');
        banner((s.doi === 'xanh' ? tran.cau.ta.ten : tran.cau.dich.ten) + ' hạ ' +
          (s.quai === 'rong' ? 'RỒNG' : 'CHÚA HANG') + '!', s.doi);
      } else if (s.loai === 'tru') {
        G.tieng(s.loi ? 'tran.loi' : 'tran.tru');
        if (s.loi) G.tieng('tran.hoReo', 1, 4);
        if (s.loi) banner('NHÀ CHÍNH ĐỔ!', s.doi);
      } else if (s.loai === 'knRieng') {
        /* Kỹ năng riêng của huấn luyện viên bật lên — thứ người chơi đã chọn ở màn
           ngoài, mà suốt bao lâu nay trong trận không thấy mặt mũi đâu. */
        banner('KỸ NĂNG HLV: ' + s.ten, s.doi);
        G.tieng('cauvong');
      } else if (s.loai === 'quaiHien') {
        var ai = tran.nguoi[Math.floor(tran.rng() * 10)];
        if (ai) noi(ai, 'quaiLon');
      }
    }
    /* thỉnh thoảng có người nói câu hợp tình huống */
    if (tran.tick % ((G.SIM_MOI_GIAY || 4) * 22) === 0) {
      var n = tran.nguoi[Math.floor(tran.rng() * tran.nguoi.length)];
      if (n && n.chet <= 0) {
        var th = n.hp / n.hpMax < 0.35 ? 'mauThap'
          : (n.mucTieu && n.mucTieu.loai === 'rut') ? 'rut'
          : (n.mucTieu && n.mucTieu.loai === 'gank') ? 'gank'
          : (n.mucTieu && n.mucTieu.loai === 'daytru') ? 'tru'
          : (n.mucTieu && n.mucTieu.loai === 'quailon') ? 'quaiLon'
          : (tran.t - n.lanCuoi < 3) ? 'danh' : null;
        if (th) noi(n, th);
      }
    }
  }

  function noi(n, tinhHuong) {
    var goc = G.TUYENTHU_THEO_ID[n.ttId];
    var chu = G.thoai(tinhHuong, (goc && goc.tinh) || 'lanh', function () { return tran.rng(); });
    if (!chu) return;
    if (thoaiHD.length && thoaiHD[thoaiHD.length - 1].chu === chu) return;
    thoaiHD.push({ ten: n.ten, chu: chu, doi: n.doi, t: tran.t });
    if (thoaiHD.length > 5) thoaiHD.shift();
    veThoai();
  }

  function veThoai() {
    var e = G.$('#tr-thoai'); if (!e) return;
    G.xoa(e);
    thoaiHD.forEach(function (t) {
      var d = G.el('div.tt-dong');
      d.appendChild(G.el('span.tt-ai', { text: t.ten + ':',
        style: 'color:' + (t.doi === 'xanh' ? (tran.cau.ta.mau || '#3ddc97') : (tran.cau.dich.mau || '#e5484d')) }));
      d.appendChild(G.el('span', { text: ' ' + t.chu }));
      e.appendChild(d);
    });
  }

  function banner(chu, doi) {
    var b = G.$('#tr-banner'); if (!b) return;
    G.xoa(b);
    b.appendChild(G.el('span', { text: chu,
      style: 'color:' + (doi === 'xanh' ? '#7fd6ff' : '#ff9ec4') }));
    b.hidden = false;
    clearTimeout(b._h);
    b._h = setTimeout(function () { b.hidden = true; }, 1800);
  }

  /* ══════════ vẽ bản đồ ══════════ */
  /* ══════════ KHÔNG GIAN THẾ GIỚI VÀ CAMERA ══════════

     Teamfight Manager 2 KHÔNG vẽ cả bản đồ cùng lúc: camera bám sát chỗ đang đánh nhau, thấy
     chừng một phần sáu bản đồ, người to rõ mặt, và có nút Auto Camera cùng cách bấm vào một
     tuyển thủ để bám theo người đó (đọc từ ảnh tfm2/sheets/sheet012 và trailer 1080p).

     Bản trước vẽ cả bản đồ vào khung 830×566 nên mỗi người chỉ còn 30 điểm ảnh, lính là chấm
     tròn 3 điểm ảnh, và chẳng có hiệu ứng nào — nhìn ra bảng tính chứ không ra trận đấu.

     Cách làm: THẾ GIỚI là đúng tấm bản đồ 5v5 của TFM2, 1280×1280 điểm ảnh, nhìn thẳng từ trên
     xuống như trong game gốc. Sân đấu là ô vuông 960×960 giữa tấm ảnh (lề 160 là tường viền), 1
     điểm ảnh = 1000 đơn vị của TFM2 (`game_setting.width = 960000`). Camera chỉ cắt-và-phóng từ
     tấm ảnh ấy. Các lớp vẽ theo đúng thứ tự của TFM2 (RESEARCH §13):
       ban-duoi.png  = background + wall_shadow + wall + bush_shadow + bush   (dưới người)
       người, quái, trụ
       ban-tren.png  = wall_5v5_front — mép tường dưới cùng, đè LÊN người đứng sát nó
     Cả ba ảnh do _tools/build_bando.py ghép từ bundle TFM2, không vẽ tay nét nào.  */
  var W0 = 1280, H0 = 1280;              /* cỡ tấm bản đồ TFM2 */
  var GOC_SAN = 160, KE_SAN = 0.96;      /* sân bắt đầu ở điểm ảnh 160; 1000 đơn vị trò chơi = 960 điểm ảnh */
  var MUC_ZOOM = [
    { k: 0.442, ten: 'Toàn cảnh' },
    { k: 0.8, ten: 'Xa' },
    { k: 1.3, ten: 'Gần' },
    { k: 2.0, ten: 'Rất gần' }
  ];
  var cam = { x: W0 / 2, y: H0 / 2, mx: W0 / 2, my: H0 / 2, iz: 2, tuDong: true, theo: null };

  /** toạ độ trò chơi (0..1000 vuông) → điểm ảnh trên tấm bản đồ TFM2 */
  function toaDoW(x, y) {
    return [GOC_SAN + x * KE_SAN, GOC_SAN + y * KE_SAN];
  }

  /** toạ độ trò chơi → toạ độ MÀN, qua camera. Phần tử thứ ba là hệ số cỡ (px / đơn vị thế giới) */
  function toaDo(x, y) {
    var k = MUC_ZOOM[cam.iz].k;
    var w = toaDoW(x, y);
    return [(w[0] - cam.x) * k + canvas.width / 2, (w[1] - cam.y) * k + canvas.height / 2, k];
  }

  /** chỗ đáng nhìn nhất lúc này: ưu tiên chỗ vừa có đánh nhau, rồi tới đám đông */
  function diemNong() {
    if (cam.theo != null) {
      var n = tran.nguoi[cam.theo];
      if (n) return toaDoW(n.x, n.y);
    }
    var tx = 0, ty = 0, tw = 0;
    tran.nguoi.forEach(function (n) {
      if (n.chet > 0) return;
      var w = 1;
      if (tran.t - n.lanCuoi < 3.5) w = 9;          /* vừa ra đòn hoặc vừa ăn đòn */
      else if (tran.t - n.lanCuoi < 8) w = 3;
      var p = toaDoW(n.x, n.y);
      tx += p[0] * w; ty += p[1] * w; tw += w;
    });
    /* quái lớn đang bị đánh cũng là tâm điểm */
    ['rong', 'chua'].forEach(function (kk) {
      var q = tran.quaiLon[kk];
      if (q && q.song && q.hp < q.hpMax * 0.98) {
        var p2 = toaDoW(q.x, q.y);
        tx += p2[0] * 7; ty += p2[1] * 7; tw += 7;
      }
    });
    if (!tw) return [W0 / 2, H0 / 2];
    return [tx / tw, ty / tw];
  }

  function camTick(dt) {
    if (cam.tuDong || cam.theo != null) {
      var d = diemNong();
      cam.mx = d[0]; cam.my = d[1];
    }
    var t = Math.min(1, dt * 3.2);
    cam.x += (cam.mx - cam.x) * t;
    cam.y += (cam.my - cam.y) * t;
    /* không cho camera trôi ra ngoài tấm bản đồ; khung rộng hơn tấm ảnh thì đứng giữa */
    var k = MUC_ZOOM[cam.iz].k;
    var nx = canvas.width / 2 / k, ny = canvas.height / 2 / k;
    cam.x = G.kep(cam.x, Math.min(nx, W0 / 2), Math.max(W0 - nx, W0 / 2));
    cam.y = G.kep(cam.y, Math.min(ny, H0 / 2), Math.max(H0 - ny, H0 / 2));
  }

  /* ══════════ ba lớp ảnh bản đồ TFM2 ══════════ */
  var ANH_BD = {};
  function anhBanDo(ten) {
    var a = ANH_BD[ten];
    if (!a) {
      a = ANH_BD[ten] = new Image();
      a.src = 'art/tfm/ban-' + ten + '.png?v=' + (G.ART_V || '');
    }
    return a.complete && a.naturalWidth ? a : null;
  }

  /** người đứng trong bụi thì mờ đi như TFM2 — ô bụi lấy từ lớp bush_5v5 (BAN_DO.bui) */
  function trongBui(x, y) {
    var bd = G.BAN_DO; if (!bd) return false;
    var o = bd.o, co = 1000 / o;
    var cx = G.kep(Math.floor(x / co), 0, o - 1), cy = G.kep(Math.floor(y / co), 0, o - 1);
    return bd.bui.charCodeAt(cy * o + cx) === 49;
  }

  /** cắt đúng ô camera từ một lớp ảnh bản đồ rồi phóng ra màn */
  function veLop(ten, W, H, k) {
    var a = anhBanDo(ten); if (!a) return false;
    var sw = W / k, sh = H / k, sx = cam.x - sw / 2, sy = cam.y - sh / 2;
    /* drawImage với ô nguồn thò ra ngoài ảnh thì có trình duyệt bỏ cả lần vẽ — kẹp lại */
    var x0 = Math.max(0, sx), y0 = Math.max(0, sy), x1 = Math.min(W0, sx + sw), y1 = Math.min(H0, sy + sh);
    if (x1 <= x0 || y1 <= y0) return true;
    ctx.drawImage(a, x0, y0, x1 - x0, y1 - y0, (x0 - sx) * k, (y0 - sy) * k, (x1 - x0) * k, (y1 - y0) * k);
    return true;
  }

  function veBanDo() {
    if (!canvas) return;
    /* Chốt chặn thứ hai: ngữ cảnh phải thuộc về đúng canvas đang treo trên màn. Lỡ có
       ai dựng lại khung mà quên dòng trên thì ở đây vẫn tự sửa, không đen màn nữa. */
    if (!ctx || ctx.canvas !== canvas) ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var k = MUC_ZOOM[cam.iz].k;
    var s = k;                                   /* px màn cho mỗi đơn vị thế giới */

    /* nền: lớp dưới của bản đồ TFM2 (đất, bóng tường, tường, bụi) */
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#080b10';
    ctx.fillRect(0, 0, W, H);
    veLop('duoi', W, H, k);

    /* ── bãi quái rừng ── */
    tran.quai.forEach(function (q) {
      if (!q.song) return;
      var p = toaDo(q.x, q.y);
      if (ngoaiMan(p, 60 * s)) return;
      /* Mỗi bãi là đúng con TFM2 đặt ở chỗ đó (ong / nấm / tê giác / gốc cây — BAN_DO.bai) */
      var khoaQ = 'quai.' + q.loai;
      var t = gio(), hq = heHinh();
      var tdq = t - (q.danhLuc == null ? -9 : q.danhLuc);
      var danhQ = tdq >= 0 && tdq * hq < G.dai(khoaQ, 'danh');
      bong(p[0], p[1], 12 * s);
      if (!G.veHinh(ctx, khoaQ, danhQ ? 'danh' : 'dung', danhQ ? tdq * hq : t * hq + q.i,
          p[0], p[1], s * 1.1, Math.cos(q.goc || 0) < 0, !danhQ)) {
        ctx.fillStyle = '#5a4a2a';
        ctx.beginPath(); ctx.arc(p[0], p[1] - 6 * s, 9 * s, 0, 7); ctx.fill();
      }
      if (q.hp < q.hpMax && s > .55) {
        thanhMau(p[0], p[1] - (G.caoHinh(khoaQ) || 30) * s * 1.1 - 5 * s, 30 * s, q.hp / q.hpMax, '#c8b06e', 3);
      }
    });

    /* ── hai con quái lớn ── */
    ['rong', 'chua'].forEach(function (kk) {
      var q = tran.quaiLon[kk];
      var p = toaDo(q.x, q.y);
      if (ngoaiMan(p, 120 * s)) return;
      if (q.song) {
        var tl = gio(), hl = heHinh();
        var tdl = tl - (q.danhLuc == null ? -9 : q.danhLuc);
        var khoaL = 'quai.' + kk;
        var danhL = tdl >= 0 && tdl * hl < G.dai(khoaL, 'danh');
        var kLon = s * (kk === 'chua' ? 1.0 : 1.25);
        bong(p[0], p[1], 34 * s);
        if (!G.veHinh(ctx, khoaL, danhL ? 'danh' : 'dung', danhL ? tdl * hl : tl * hl,
            p[0], p[1], kLon, kk === 'rong' && Math.cos(q.goc || 0) < 0, !danhL)) {
          ctx.fillStyle = kk === 'rong' ? '#7a3f8f' : '#8f3f3f';
          ctx.beginPath(); ctx.arc(p[0], p[1] - 20 * s, 26 * s, 0, 7); ctx.fill();
        }
        var dinhL = p[1] - (G.caoHinh(khoaL) || 50) * kLon;
        thanhMau(p[0], dinhL - 6 * s, 74 * s, q.hp / q.hpMax, '#ffd76e');
        chu(q.ten, p[0], dinhL - 12 * s, 11 * Math.max(.8, s), '#ffd76e');
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2;
        ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, .5);
        ctx.beginPath(); ctx.arc(0, 0, 30 * s, 0, 7); ctx.stroke();
        ctx.restore();
        var con = Math.max(0, Math.ceil(q.hienRa - tran.t));
        chu(q.ten + '  ' + dinhDangGio(con), p[0], p[1] - 4, 11 * Math.max(.85, s), 'rgba(255,255,255,.55)');
      }
    });

    /* ── trụ và lõi: thân + viên ngọc TFM2, ngọc bắn thì cả hai chạy khung "danh" ── */
    tran.tru.forEach(function (r) {
      if (!r.song) return;
      var p = toaDo(r.x, r.y);
      var kR = s * (r.loi ? 1.2 : r.nha ? 1.15 : 1.0);
      if (ngoaiMan(p, 90 * kR)) return;
      var mau = r.doi === 'xanh' ? '#4aa3e0' : '#e0564a';
      var khoaR = (r.loi ? 'loi.' : 'tru.') + r.doi, khoaNgoc = (r.loi ? 'loi.ngoc.' : 'tru.ngoc.') + r.doi;
      var hr = heHinh(), tdr = gio() - (r.danhLuc == null ? -9 : r.danhLuc);
      var danhR = tdr >= 0 && tdr * hr < G.dai(khoaR, 'danh');
      var ttR = danhR ? 'danh' : 'dung', tgR = danhR ? tdr * hr : tran.t * hr + r.x * 0.01;
      /* bóng đổ của chính TFM2 (tower_shadow / nexus_shadow), tâm đặt dưới chân */
      var khoaB = r.loi ? 'bong.loi' : 'bong.tru';
      if (!G.veHinhTam(ctx, khoaB, 'no', 0, p[0], p[1], kR, 0, false)) bong(p[0], p[1], 16 * kR);
      if (G.veHinh(ctx, khoaR, ttR, tgR, p[0], p[1], kR, false, !danhR)) {
        G.veHinh(ctx, khoaNgoc, ttR, tgR, p[0], p[1] - (G.caoHinh(khoaR) - G.caoHinh(khoaNgoc)) * kR, kR, false, !danhR);
      } else {
        ctx.fillStyle = mau;
        ctx.fillRect(p[0] - 8 * kR, p[1] - 50 * kR, 16 * kR, 50 * kR);
      }
      if (r.hp < r.hpMax) thanhMau(p[0], p[1] - (G.caoHinh(khoaR) || 50) * kR - 6 * s, 38 * s, r.hp / r.hpMax, mau);
    });

    /* ── LÍNH: sprite TFM2 hai màu đội, tự có khung chạy / thọc / bắn ── */
    tran.linh.forEach(function (l) {
      var vl = viTri(l);
      var p = toaDo(vl[0], vl[1]);
      if (ngoaiMan(p, 40 * s)) return;
      var t = gio(), hL = heHinh();
      var tdl = t - (l.danhLuc == null ? -9 : l.danhLuc);
      var khoaL2 = 'linh.' + (l.xa ? 'xa.' : 'can.') + l.doi;
      var danhL2 = tdl >= 0 && tdl * hL < G.dai(khoaL2, 'danh');
      bong(p[0], p[1], 7 * s);
      if (!G.veHinh(ctx, khoaL2, danhL2 ? 'danh' : dangDi(l) ? 'chay' : 'dung',
          danhL2 ? tdl * hL : (t + l.x * .01) * hL, p[0], p[1], s * 1.05, Math.cos(huongCua(l)) < 0, !danhL2)) {
        ctx.fillStyle = l.doi === 'xanh' ? '#7fd6ff' : '#ff9ec4';
        ctx.beginPath(); ctx.arc(p[0], p[1] - 8 * s, 6 * s, 0, 7); ctx.fill();
      }
      if (l.hp < l.hpMax && s > .6) thanhMau(p[0], p[1] - (G.caoHinh(khoaL2) || 16) * s * 1.05 - 3 * s, 18 * s,
        l.hp / l.hpMax, l.doi === 'xanh' ? '#3ddc97' : '#e5484d', 3);
    });

    /* ── hiệu ứng dưới chân (vòng diện rộng) ── */
    veHieu(true, s);

    /* ══════════ TƯỚNG ══════════
       Sprite TFM2 có sẵn khung đứng, chạy, đánh, chiêu, chiêu cuối, ăn đòn, chết. Chọn
       trạng thái theo mốc sim ghi lại; đòn và chiêu chạy hết dãy khung rồi mới trả về
       chạy/đứng. Lớp phủ thêm vào:
         ăn đòn   chớp trắng một nhịp
         niệm     sáng lên theo màu chiêu, TÊN CHIÊU hiện trên đầu
         hồi sinh luồng sáng dựng từ đất lên */
    tran.nguoi.forEach(function (n) {
      if (n.chet > 0) {
        if (ngaLuc[n.i] == null) ngaLuc[n.i] = gio();
        return veBia(n, s, (gio() - ngaLuc[n.i]) * heHinh());
      }
      ngaLuc[n.i] = null;
      var vn = viTri(n);
      var p = toaDo(vn[0], vn[1]);
      var cao = 46 * s;
      if (ngoaiMan(p, cao * 2.6)) return;
      var t = gio();

      var tDanh = t - (n.danhLuc == null ? -9 : n.danhLuc);
      var tNiem = t - (n.niemLuc == null ? -9 : n.niemLuc);
      var tDinh = t - (n.dinhLuc == null ? -9 : n.dinhLuc);
      var tHoi = t - (n.hoiLuc == null ? -9 : n.hoiLuc);
      var niem = (tNiem >= 0 && tNiem < 0.42) ? tNiem / 0.42 : -1;
      var goc = huongCua(n);
      var lat = Math.cos(goc) < 0;
      var di = dangDi(n);

      /* vòng đội dưới chân */
      ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, .42);
      ctx.beginPath(); ctx.arc(0, 0, cao * .40, 0, 7);
      ctx.fillStyle = n.doi === 'xanh' ? 'rgba(61,220,151,.30)' : 'rgba(229,72,77,.30)';
      ctx.fill();
      ctx.lineWidth = Math.max(1.4, 2.4 * s);
      ctx.strokeStyle = n.doi === 'xanh' ? 'rgba(61,220,151,.9)' : 'rgba(229,72,77,.9)';
      ctx.stroke();
      ctx.restore();

      /* luồng sáng hồi sinh */
      if (tHoi >= 0 && tHoi < 1.1) {
        var th = tHoi / 1.1;
        var gh = ctx.createLinearGradient(p[0], p[1], p[0], p[1] - cao * 2);
        gh.addColorStop(0, 'rgba(255,255,255,' + (0.55 * (1 - th)) + ')');
        gh.addColorStop(1, 'rgba(140,220,255,0)');
        ctx.fillStyle = gh;
        ctx.fillRect(p[0] - cao * .4, p[1] - cao * 2, cao * .8, cao * 2);
        G.veHinh(ctx, 'hieu.hoi_sinh', 'no', tHoi * heHinh(), p[0], p[1], s * 1.15, false, false);
      }

      /* sheet riêng của tướng TFM2 (sprites.js §15.4): tên hoạt ảnh tra qua G.animTuong */
      var idT = n.tuong.id;
      var hh = heHinh();
      var ttT = G.animTuong(idT, di ? 'chay' : 'dung'), tgT = (t + n.i * 0.37) * hh, lapT = true;
      var ttNiem = G.animTuong(idT, n.niemKn || 'skill');
      if (tNiem >= 0 && tNiem * hh < Math.max(0.3, G.daiT(idT, ttNiem))) {
        ttT = ttNiem; tgT = tNiem * hh; lapT = false;
      } else if (tDanh >= 0 && tDanh * hh < G.daiT(idT, G.animTuong(idT, 'danh'))) {
        ttT = G.animTuong(idT, 'danh'); tgT = tDanh * hh; lapT = false;
      } else if (tDinh >= 0 && tDinh * hh < 0.1) {
        ttT = G.animTuong(idT, 'dinh'); tgT = tDinh * hh; lapT = false;
      }
      var kT = s * 1.15, nx = p[0], ny = p[1];
      var veNguoi = function () { return G.veHinhT(ctx, idT, ttT, tgT, nx, ny, kT, lat, lapT); };

      ctx.save();
      /* trong bụi thì mờ đi, như TFM2 */
      if (trongBui(vn[0], vn[1])) ctx.globalAlpha = 0.55;
      /* VIỀN MÀU ĐỘI quanh người.
         Hai bên đều là sprite bảng màu na ná nhau; cái vòng mờ dưới chân không đủ
         để liếc một cái là biết ai phe nào — nhất là lúc mười người xúm vào một chỗ.
         Bóng đổ màu của canvas cho ra đúng một quầng ôm theo dáng người, chỉ tốn thêm
         một lần vẽ. Đây là thứ làm màn trận ĐỌC ĐƯỢC. */
      ctx.shadowColor = n.doi === 'xanh' ? '#25e08a' : '#ff4d55';
      ctx.shadowBlur = Math.max(4, 7 * s);
      var veOk = veNguoi();
      ctx.shadowBlur = 0;
      if (!veOk) {
        ctx.beginPath(); ctx.arc(nx, ny - cao * .4, cao * .32, 0, 7);
        ctx.fillStyle = mauLop(n.tuong.lop); ctx.fill();
      }
      /* chớp trắng khi vừa ăn đòn — vẽ chồng ở chế độ cộng sáng, rẻ hơn ctx.filter */
      if (tDinh >= 0 && tDinh < 0.16 && veOk) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.8 * (1 - tDinh / 0.16);
        veNguoi();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      /* đang niệm: bọc một lớp sáng theo màu của chiêu */
      if (niem >= 0 && veOk) {
        var fxN = fxCua(n.tuong.id, n.niemKn, n.niemCuoi);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45 * (1 - niem);
        veNguoi();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        if (fxN) {
          ctx.strokeStyle = fxN.mau;
          ctx.lineWidth = Math.max(1.5, 3 * s * (1 - niem));
          ctx.beginPath();
          ctx.arc(nx, ny - cao * .45, cao * (.45 + niem * .45), 0, 7);
          ctx.stroke();
        }
      }
      ctx.restore();

      /* thanh máu treo ngay trên đỉnh đầu thật, đo lúc dựng atlas */
      var dinhDau = p[1] - (G.caoHinhT(idT, 'idle') || 40) * kT - 5 * s;
      thanhMau(p[0], dinhDau, cao * 0.95, n.hp / n.hpMax,
        n.doi === 'xanh' ? '#3ddc97' : '#e5484d', Math.max(4, 5 * s));

      /* BIỂN SỐ NẰM DƯỚI CHÂN — đúng chỗ Teamfight Manager 2 đặt nó.
         Bản trước dồn tên lên trên đầu, chung chỗ với thanh máu, số sát thương bay lên và
         tên chiêu; mười người xúm lại là bốn tầng chữ chồng lên nhau thành một vũng mực.
         Khoảng dưới chân thì gần như luôn trống, vì bản đồ nghiêng và người đứng thưa.

         Vẫn phải SO LE theo chỉ số người: lúc bốn người xúm vào đúng một ô thì bốn cái
         biển nằm cùng một độ cao là đè khít lên nhau, đọc ra đúng chữ của người trên cùng.
         Ba bậc cách nhau một dòng là đủ tách, mà không đẩy biển đi xa khỏi chân ai. */
      if (s > .5) {
        var bien = 'Lv' + n.cap + ' ' + n.ten;
        var co = G.kep(10 * s, 8.5, 12.5);
        ctx.font = 'bold ' + co + 'px system-ui';
        var rong = ctx.measureText(bien).width + 8;
        var by = p[1] + 5 * s + (n.i % 3) * co * 1.35;
        ctx.fillStyle = n.doi === 'xanh' ? 'rgba(8,30,22,.72)' : 'rgba(34,10,12,.72)';
        ctx.fillRect(p[0] - rong / 2, by - co * .85, rong, co * 1.25);
        chu(bien, p[0], by + co * .18, co, n.doi === 'xanh' ? '#8ff0c4' : '#ffb4b8');
      }

      /* TÊN CHIÊU trên đầu người vừa bung — nhìn một cái là biết vừa dùng gì */
      if (tNiem >= 0 && tNiem < 1.25 && n.niemTen && s > .5) {
        var tn = tNiem / 1.25;
        var fxT = fxCua(n.tuong.id, n.niemKn, n.niemCuoi);
        ctx.globalAlpha = tn < .75 ? 1 : (1 - tn) * 4;
        chu((n.niemCuoi ? '★ ' : '') + n.niemTen, p[0],
          dinhDau - 12 * s - (n.i % 2) * 11 * s - tn * 14 * s,
          G.kep((n.niemCuoi ? 13 : 11.5) * s, 10, n.niemCuoi ? 17 : 14),
          (fxT && fxT.mau) || '#ffd76e');
        ctx.globalAlpha = 1;
      }

      if (n.kc > 0) G.veFX(ctx, 'choang', p[0], dinhDau - 6 * s, 26 * s, Math.floor(t * hh * 10));
      /* lên cấp: mũi tên "LV UP" của TFM2 bay lên đầu, chỉ phe mình cho khỏi rối */
      var tLen = lenCapLuc[n.i] == null ? -1 : (t - lenCapLuc[n.i]) * hh;
      if (tLen >= 0 && tLen < G.dai('hieu.len_cap', 'no')) {
        G.veHinh(ctx, 'hieu.len_cap', 'no', tLen, p[0], p[1], kT, false, false);
      }
      if (n.chan && n.chan.length) {
        ctx.strokeStyle = 'rgba(160,220,255,.8)'; ctx.lineWidth = Math.max(1.5, 3 * s);
        ctx.beginPath(); ctx.arc(p[0], p[1] - cao * .45, cao * .56, 0, 7); ctx.stroke();
      }
    });

    /* ── mép tường dưới cùng của TFM2 (wall_5v5_front): đè lên người đứng sát tường viền ── */
    veLop('tren', W, H, k);

    /* ── hiệu ứng trên đầu (đạn, chém, tia, chiêu) ── */
    veHieu(false, s);

    /* ── số sát thương bay lên ── */
    tran.bay.forEach(function (b) { bayHD.push(b); });
    tran.bay.length = 0;
    bayHD = bayHD.filter(function (b) { return tran.t - b.t < 1.1; });
    /* Mấy con số cùng nổ ra trên một người thì chồng khít lên nhau thành một cục mực
       ("2 2 3" đè lên nhau). Xoè chúng ra theo một quạt ỔN ĐỊNH tính từ chính dấu thời
       gian của số ấy — cùng một số thì khung nào cũng bay đúng đường ấy, không nhấp nháy. */
    bayHD.forEach(function (b, iB) {
      var p = toaDo(b.x, b.y);
      if (ngoaiMan(p, 60)) return;
      var t = gio();
      var tuoi = G.kep((t - b.t) / 1.1, 0, 1);
      if (b._q == null) b._q = (bam(b, iB) - 0.5);
      var quat = b._q;
      ctx.globalAlpha = 1 - tuoi * tuoi;
      ctx.fillStyle = b.loai === 'pt' ? '#c89bff' : b.loai === 'hoi' ? '#7de3a0'
        : b.loai === 'ne' ? '#c8d3e0' : '#ffb36b';
      var co = Math.max(11, (b.loai === 'ne' || b.loai === 'hoi' ? 12 : 14.5) * s);
      ctx.font = 'bold ' + co + 'px system-ui';
      ctx.textAlign = 'center';
      var bx = p[0] + quat * 46 * s * (0.35 + tuoi);
      var by = p[1] - 30 * s - tuoi * 34 * s;
      ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 3.5;
      ctx.strokeText(b.chu, bx, by);
      ctx.fillText(b.chu, bx, by);
      ctx.globalAlpha = 1;
    });
  }

  /* Kéo chuột để tự dọi camera, cuộn để phióng, bấm minimap để nhảy tới.
     TFM2 có cả ba, và thiếu chúng thì người xem không tự quyết định được mình muốn nhìn đâu. */
  var keo = { dang: false, tx: 0, ty: 0, ganWin: 0 };
  function ganKeo() {
    if (!canvas || canvas._daGan) return;
    canvas._daGan = 1;
    canvas.addEventListener('pointerdown', function (e) {
      keo.dang = true; keo.tx = e.clientX; keo.ty = e.clientY;
      cam.tuDong = false; cam.theo = null;
      veNutCam(); veThe();
    });
    /* canvas dựng mới mỗi trận, nhưng `window` thì không — gắn hai listener này đúng MỘT
       lần, không thì mỗi trận chồng thêm một cặp suốt cả mùa */
    if (!keo.ganWin) {
      keo.ganWin = 1;
      window.addEventListener('pointerup', function () { keo.dang = false; });
      window.addEventListener('pointermove', function (e) {
        if (!keo.dang || !canvas) return;
        var k = MUC_ZOOM[cam.iz].k;
        var r = canvas.getBoundingClientRect();
        var ti = canvas.width / (r.width || canvas.width);
        cam.mx -= (e.clientX - keo.tx) * ti / k;
        cam.my -= (e.clientY - keo.ty) * ti / k;
        cam.x = cam.mx; cam.y = cam.my;
        keo.tx = e.clientX; keo.ty = e.clientY;
      });
    }
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      cam.iz = G.kep(cam.iz + (e.deltaY > 0 ? -1 : 1), 0, MUC_ZOOM.length - 1);
      veNutCam();
    }, { passive: false });

    var mini = G.$('#tr-mini');
    if (mini && !mini._daGan) {
      mini._daGan = 1;
      mini.addEventListener('pointerdown', function (e) {
        var r = mini.getBoundingClientRect();
        var w = toaDoW((e.clientX - r.left) / r.width * 1000, (e.clientY - r.top) / r.height * 1000);
        cam.tuDong = false; cam.theo = null;
        cam.mx = w[0]; cam.my = w[1];
        cam.x = cam.mx; cam.y = cam.my;
        veNutCam(); veThe();
      });
    }
  }

  function ngoaiMan(p, le) {
    return p[0] < -le || p[1] < -le || p[0] > canvas.width + le || p[1] > canvas.height + le;
  }

  function bong(x, y, r) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, .4);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7);
    ctx.fillStyle = 'rgba(0,0,0,.34)'; ctx.fill();
    ctx.restore();
  }

  function chu(t, x, y, co, mau) {
    ctx.font = 'bold ' + co + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 3;
    ctx.strokeText(t, x, y);
    ctx.fillStyle = mau; ctx.fillText(t, x, y);
  }

  /* ══════════════════ HIỆU ỨNG ══════════════════
     Dữ liệu do sim.js đẩy ra (`tran.hieu`). Hai lượt vẽ: `duoi` là thứ nằm trên mặt đất
     (vòng loang, đám khói) — vẽ trước người; còn lại vẽ đè lên.

     Chỗ khác hẳn bản trước: chiêu KHÔNG còn dùng chung một hình. `h.tuong` + `h.kn` tra
     ra G.FX_CHIEU, và mỗi mục ở đó nói rõ bày ra kiểu gì (vòng / nổ / tia / lao / bắn /
     rơi / mưa / xích / khói / hào quang / khiên / hồi), dùng dáng nào trong fx.png và
     màu gì. Bốn mươi chiêu ra bốn mươi bộ mặt. */

  /* lớp tướng → loại đạn trong art/dan.png */
  var DAN_LOP = { xa: 'ten', phep: 'phep', ho: 'bang', sat: 'thuong', can: 'thuong', tru: 'tia', linh: 'ten', quai: 'thuong' };

  /** mặt của một chiêu: agent ảnh khai `<id>:<skill|skill2|ult>` trong G.FX_CHIEU (RESEARCH §15);
      chưa có thì lấy bộ mặc định cũ theo chiêu thường / chiêu cuối */
  function fxCua(id, kn, cuoi) {
    if (!G.fxChieu) return null;
    var co = G.FX_CHIEU && G.FX_CHIEU[id + ':' + kn];
    return co || G.fxChieu(id, (cuoi || kn === 'ult') ? 'cuoi' : 'chieu');
  }

  /** số giả ngẫu nhiên ỔN ĐỊNH theo (hiệu ứng, chỉ số) — cùng một giọt mưa thì khung nào
      cũng rơi đúng chỗ ấy. Dùng Math.random() ở đây là cả màn nhấp nháy loạn. */
  function bam(h, i) {
    var v = Math.sin((h.t * 97.13 + i * 41.7 + (h.x || 0) * 0.37)) * 43758.5453;
    return v - Math.floor(v);
  }

  /** vùng chiêu đang tồn tại (tran.vung) — vòng loang dưới đất */
  function veVung(s) {
    if (!tran.vung || !tran.vung.length) return;
    var t = gio();
    tran.vung.forEach(function (V) {
      var a = toaDo(V.x, V.y), b = toaDo(V.x + V.r, V.y);
      var r = Math.abs(b[0] - a[0]);
      var con = G.kep((V.den - t) / Math.max(0.2, V.den - V.bat), 0, 1);
      var cf = V.n && V.n.tuong ? fxCua(V.n.tuong.id, 'skill', false) : null;
      var mau = (cf && cf.mau) || (V.doi === 'xanh' ? '#7de3ff' : '#ff9a86');
      ctx.save(); ctx.translate(a[0], a[1]); ctx.scale(1, .42);
      ctx.globalAlpha = 0.18 + 0.12 * con;
      ctx.fillStyle = mau; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.lineWidth = Math.max(1, 2 * s); ctx.strokeStyle = mau;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
      ctx.restore();
    });
  }
  /** đạn bay của sim (tran.dan): đòn xa của tướng, mũi tên trụ, đạn chiêu */
  function veDanSim(s) {
    if (!tran.dan || !tran.dan.length) return;
    tran.dan.forEach(function (p) {
      var a = toaDo(p.x, p.y), co = (p.nho ? 11 : 16) * s;
      var goc = p.muc ? Math.atan2(p.muc.y - p.y, p.muc.x - p.x) : Math.atan2(p.ty - p.y, p.tx - p.x);
      var y = a[1] - (p.hinh === 'tru' ? 30 : 14) * s;
      if (!G.veDan || !G.veDan(ctx, DAN_LOP[p.hinh] || DAN_LOP[p.lop] || 'thuong', a[0], y, co, goc)) {
        ctx.fillStyle = p.doi === 'xanh' ? '#8fd8ff' : '#ffb0a2';
        ctx.beginPath(); ctx.arc(a[0], y, Math.max(1.8, 3 * s), 0, 7); ctx.fill();
      }
    });
  }

  function veHieu(duoi, s) {
    if (duoi) veVung(s); else veDanSim(s);
    tran.hieu.forEach(function (h) { if (!h._v) { h._v = 1; hieuHD.push(h); } });
    var t = gio();
    hieuHD = hieuHD.filter(function (h) { return t - h.t < (h._lau || 1.0); });

    hieuHD.forEach(function (h) {
      var cf = null;
      if ((h.loai === 'chieu' || h.loai === 'cuoi') && h.tuong) {
        cf = fxCua(h.tuong, h.kn || (h.loai === 'cuoi' ? 'ult' : 'skill'), h.loai === 'cuoi');
        /* vùng do bộ chạy chung sinh ra: bán kính thật của chiêu thay cho bán kính trong bảng */
        if (cf && h.r) cf = Object.assign({}, cf, { r: h.r, kieu: (cf.kieu === 'vong' || cf.kieu === 'no') ? cf.kieu : (h.dien ? 'vong' : cf.kieu) });
      }
      var lau = (cf && cf.lau) || (h.loai === 'hlv' ? 1.8 : 0.85);
      h._lau = lau;
      var tuoi = (t - h.t) / lau;
      if (tuoi < 0) tuoi = 0;
      if (tuoi > 1) return;

      var laDuoi = cf ? (cf.kieu === 'vong' || cf.kieu === 'khoi')
        : (h.loai === 'hlv');
      if (laDuoi !== duoi) return;

      var a = toaDo(h.x, h.y);
      var b = toaDo(h.x2 != null ? h.x2 : h.x, h.y2 != null ? h.y2 : h.y);
      var mau = cf ? cf.mau : (h.doi === 'xanh' ? '#7de3ff' : h.doi === 'quai' ? '#ffcf8a' : '#ff9a86');
      ctx.globalAlpha = 1 - tuoi * tuoi;

      if (cf) veChieu(h, cf, a, b, tuoi, s, mau);
      else if (h.loai === 'hlv') veKnRieng(h, a, tuoi, s);
      else veDonGian(h, a, b, tuoi, s, mau);

      ctx.globalAlpha = 1;
    });
  }

  /* ── đòn đánh thường, cú thọc, vuốt quái, tia trụ ── */
  function veDonGian(h, a, b, tuoi, s, mau) {
    if (h.loai === 'dan') {
      /* Viên đạn bay từ người bắn tới mục tiêu. "Bắn xa thì cầm súng, thấy rõ đạn" —
         nên viên đạn to hơn bản trước, có vệt đuôi, và nổ một chùm tia khi trúng. */
      var t2 = Math.min(1, tuoi * 2.6);
      var co = (h.nho ? 11 : 16) * s;
      var x = a[0] + (b[0] - a[0]) * t2, y = a[1] + (b[1] - a[1]) * t2 - 14 * s;
      var xd = a[0] + (b[0] - a[0]) * Math.max(0, t2 - .26);
      var yd = a[1] + (b[1] - a[1]) * Math.max(0, t2 - .26) - 14 * s;
      var gocBay = Math.atan2(b[1] - a[1], b[0] - a[0]);
      /* vệt đuôi */
      ctx.strokeStyle = mau; ctx.globalAlpha *= .5;
      ctx.lineWidth = Math.max(1, 2.2 * s); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(xd, yd); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha /= .5;
      var veDan = G.veDan && G.veDan(ctx, DAN_LOP[h.lop] || 'thuong', x, y, co, gocBay);
      if (!veDan) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, Math.max(1.8, 3 * s), 0, 7); ctx.fill();
      }
      if (t2 >= 1 && G.veFX) G.veFX(ctx, 'dam', b[0], b[1] - 14 * s, 26 * s, Math.floor((tuoi - .38) * 12));

    } else if (h.loai === 'chem') {
      var cx = h.x2 != null ? b[0] : a[0], cy = (h.x2 != null ? b[1] : a[1]) - 14 * s;
      var okChem = G.veFX && G.veFX(ctx, 'chem', cx + Math.cos(h.goc) * 10 * s,
        cy + Math.sin(h.goc) * 10 * s, 52 * s, Math.floor(tuoi * 5), h.goc);
      if (!okChem) {
        var r = 26 * s * (0.6 + tuoi * 0.7);
        ctx.strokeStyle = mau; ctx.lineWidth = Math.max(2, 5 * s * (1 - tuoi));
        ctx.beginPath(); ctx.arc(cx, cy, r, h.goc - 0.9, h.goc + 0.9); ctx.stroke();
      }

    } else if (h.loai === 'thoc') {
      /* cú thọc của lính cận chiến — một vệt đâm ngắn, không phải cung quét */
      var tx = b[0] - Math.cos(h.goc) * 8 * s, ty = b[1] - 12 * s - Math.sin(h.goc) * 5 * s;
      if (!G.veFX || !G.veFX(ctx, 'dam_xuyen', tx, ty, 30 * s, Math.floor(tuoi * 8), h.goc)) {
        ctx.strokeStyle = mau; ctx.lineWidth = Math.max(1.5, 3 * s * (1 - tuoi));
        ctx.beginPath();
        ctx.moveTo(tx - Math.cos(h.goc) * 10 * s, ty - Math.sin(h.goc) * 10 * s);
        ctx.lineTo(tx + Math.cos(h.goc) * 10 * s, ty + Math.sin(h.goc) * 10 * s);
        ctx.stroke();
      }

    } else if (h.loai === 'vuot') {
      /* vuốt của quái rừng / quái lớn */
      var co2 = (h.to ? 70 : 40) * s;
      if (!G.veFX || !G.veFX(ctx, 'vuot', a[0], a[1] - 16 * s, co2, Math.floor(tuoi * 6), h.goc)) {
        ctx.strokeStyle = '#ffcf8a'; ctx.lineWidth = Math.max(2, 4 * s * (1 - tuoi));
        for (var k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.arc(a[0], a[1] - 16 * s, co2 * .35, h.goc - .7 + k * .3, h.goc + .1 + k * .3);
          ctx.stroke();
        }
      }

    } else if (h.loai === 'tia') {
      ctx.strokeStyle = h.doi === 'xanh' ? '#8fd8ff' : '#ffb0a2';
      ctx.lineWidth = Math.max(1.5, 6 * s * (1 - tuoi));
      ctx.beginPath();
      ctx.moveTo(a[0], a[1] - 46 * s); ctx.lineTo(b[0], b[1] - 14 * s);
      ctx.stroke();
      if (G.veDan) {
        var tt = Math.min(1, tuoi * 3);
        G.veDan(ctx, 'tia', a[0] + (b[0] - a[0]) * tt,
          (a[1] - 46 * s) + ((b[1] - 14 * s) - (a[1] - 46 * s)) * tt, 18 * s, 0);
      }
    }
  }

  /* ── CHIÊU: mười một kiểu bày, tra từ G.FX_CHIEU ── */
  function veChieu(h, cf, a, b, tuoi, s, mau) {
    var fx = cf.fx, r = (cf.r || 40) * s, n = cf.n || 1;
    var kh = function (k) { return Math.floor((tuoi + (k || 0)) * 9); };

    if (cf.kieu === 'vong') {
      /* vòng loang dưới chân người dùng, dẹt theo phối cảnh */
      var rr = r * (0.30 + 0.85 * tuoi);
      ctx.save(); ctx.translate(a[0], a[1]); ctx.scale(1, .45);
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, 7);
      ctx.strokeStyle = mau; ctx.lineWidth = Math.max(2, 7 * s * (1 - tuoi));
      ctx.stroke();
      ctx.fillStyle = mau; ctx.globalAlpha *= .14 * (1 - tuoi);
      ctx.fill(); ctx.globalAlpha /= .14 * (1 - tuoi) || 1;
      ctx.restore();
      /* dáng chính, và n bản sao xoay quanh vòng nếu chiêu là kiểu quét nhiều nhát */
      for (var i = 0; i < n; i++) {
        var g = (cf.xoay ? tuoi * 7 : 0) + i * (6.283 / n);
        var dx = Math.cos(g) * rr * (n > 1 ? .72 : 0);
        var dy = Math.sin(g) * rr * (n > 1 ? .32 : 0);
        if (G.veFX) G.veFX(ctx, fx, a[0] + dx, a[1] - 16 * s + dy, r * .78, kh(i * .12), cf.xoay ? g : 0);
      }
      if (cf.rung && tuoi < .25) rungMan(s);

    } else if (cf.kieu === 'no') {
      if (!G.veFX || !G.veFX(ctx, fx, b[0], b[1] - 18 * s, r * (1.1 + tuoi * .7), kh())) {
        ctx.strokeStyle = mau; ctx.lineWidth = Math.max(2, 5 * s * (1 - tuoi));
        ctx.beginPath(); ctx.arc(b[0], b[1] - 18 * s, r * (.5 + tuoi), 0, 7); ctx.stroke();
      }

    } else if (cf.kieu === 'tia') {
      var gr = ctx.createLinearGradient(a[0], a[1] - 20 * s, b[0], b[1] - 16 * s);
      gr.addColorStop(0, mau + '00'); gr.addColorStop(.5, mau); gr.addColorStop(1, '#ffffff');
      ctx.strokeStyle = gr; ctx.lineWidth = Math.max(2, 11 * s * (1 - tuoi));
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a[0], a[1] - 20 * s); ctx.lineTo(b[0], b[1] - 16 * s); ctx.stroke();
      if (G.veFX) G.veFX(ctx, fx, b[0], b[1] - 18 * s, r * 1.6, kh(),
        Math.atan2(b[1] - a[1], b[0] - a[0]));

    } else if (cf.kieu === 'lao') {
      /* vệt lao từ chỗ đứng tới mục tiêu, dáng chính chạy dọc theo vệt */
      var tl = Math.min(1, tuoi * 2.2);
      var lx = a[0] + (b[0] - a[0]) * tl, ly = a[1] + (b[1] - a[1]) * tl - 16 * s;
      var gl = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.strokeStyle = mau; ctx.globalAlpha *= .55;
      ctx.lineWidth = Math.max(2, 9 * s * (1 - tuoi)); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a[0], a[1] - 16 * s); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.globalAlpha /= .55;
      if (G.veFX) G.veFX(ctx, fx, lx, ly, r * 1.8, kh(), gl);

    } else if (cf.kieu === 'ban') {
      /* một phát bắn: khói đầu nòng, viên đạn bay, chớp ở đích */
      var tb = Math.min(1, tuoi * (cf.xa ? 3.4 : 2.4));
      var bx = a[0] + (b[0] - a[0]) * tb, by = a[1] + (b[1] - a[1]) * tb - 16 * s;
      var gb = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (cf.xa) {
        ctx.strokeStyle = mau; ctx.globalAlpha *= .6;
        ctx.lineWidth = Math.max(1, 3 * s * (1 - tuoi));
        ctx.beginPath(); ctx.moveTo(a[0], a[1] - 16 * s); ctx.lineTo(bx, by); ctx.stroke();
        ctx.globalAlpha /= .6;
      }
      if (tuoi < .3 && G.veFX) G.veFX(ctx, 'dam', a[0] + Math.cos(gb) * 16 * s,
        a[1] - 18 * s + Math.sin(gb) * 10 * s, 24 * s, Math.floor(tuoi * 14));
      if (tb < 1) {
        if (!G.veDan || !G.veDan(ctx, cf.dan || 'thuong', bx, by, r * .9, gb)) {
          ctx.fillStyle = mau;
          ctx.beginPath(); ctx.arc(bx, by, r * .3, 0, 7); ctx.fill();
        }
      } else if (G.veFX) {
        G.veFX(ctx, fx, b[0], b[1] - 18 * s, r * 1.5, kh());
      }

    } else if (cf.kieu === 'roi') {
      /* rơi từ trời: vẽ vòng ngắm trước, rồi khối rơi xuống, rồi nổ */
      var tr0 = Math.min(1, tuoi * 1.9);
      ctx.save(); ctx.translate(b[0], b[1]); ctx.scale(1, .45);
      ctx.beginPath(); ctx.arc(0, 0, r * .8, 0, 7);
      ctx.strokeStyle = mau; ctx.lineWidth = Math.max(1.5, 3 * s);
      ctx.setLineDash([6 * s, 5 * s]); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      if (tr0 < 1) {
        var ry = b[1] - 18 * s - (1 - tr0) * 190 * s;
        if (G.veFX) G.veFX(ctx, fx, b[0], ry, r * .7, Math.floor(tuoi * 12));
      } else {
        if (G.veFX) G.veFX(ctx, fx, b[0], b[1] - 20 * s, r * 1.7, Math.floor((tuoi - .53) * 18));
        if (cf.rung) rungMan(s);
      }

    } else if (cf.kieu === 'mua') {
      /* n phát rơi rải trong vùng, mỗi phát lệch giờ một chút */
      for (var j = 0; j < n; j++) {
        var tre = j / (n + 1) * .55;
        var tj = (tuoi - tre) / (1 - tre);
        if (tj < 0) continue;
        var goc2 = bam(h, j) * 6.283, ban2 = Math.sqrt(bam(h, j + 50)) * r;
        var mx = b[0] + Math.cos(goc2) * ban2, my = b[1] + Math.sin(goc2) * ban2 * .45;
        var td = Math.min(1, tj * 2.6);
        if (td < 1) {
          var y2 = my - 18 * s - (1 - td) * 150 * s;
          if (cf.dan && G.veDan) G.veDan(ctx, cf.dan, mx, y2, 15 * s, 1.57);
          else if (G.veFX) G.veFX(ctx, fx, mx, y2, 26 * s, Math.floor(tj * 12));
        } else if (G.veFX) {
          G.veFX(ctx, fx, mx, my - 16 * s, 44 * s, Math.floor((tj - .38) * 14));
        }
      }
      if (cf.rung && tuoi < .5) rungMan(s);

    } else if (cf.kieu === 'xich') {
      /* tia nảy: đường gãy khúc từ người bắn tới mục tiêu rồi nảy tiếp */
      ctx.strokeStyle = mau; ctx.lineWidth = Math.max(1.5, 4 * s * (1 - tuoi));
      ctx.lineJoin = 'round';
      var px0 = a[0], py0 = a[1] - 18 * s;
      for (var m = 0; m < n; m++) {
        var tx2 = b[0] + (bam(h, m) - .5) * r * 1.1;
        var ty2 = b[1] - 16 * s + (bam(h, m + 20) - .5) * r * .5;
        ctx.beginPath(); ctx.moveTo(px0, py0);
        for (var seg = 1; seg <= 4; seg++) {
          var k2 = seg / 4;
          ctx.lineTo(px0 + (tx2 - px0) * k2 + (bam(h, m * 9 + seg) - .5) * 16 * s,
                     py0 + (ty2 - py0) * k2 + (bam(h, m * 9 + seg + 7) - .5) * 16 * s);
        }
        ctx.stroke();
        if (G.veFX) G.veFX(ctx, fx, tx2, ty2, 34 * s, kh(m * .1));
        px0 = tx2; py0 = ty2;
      }

    } else if (cf.kieu === 'khoi') {
      /* đám mây đọng lại, trôi chậm — sương độc */
      ctx.save(); ctx.translate(b[0], b[1]); ctx.scale(1, .45);
      ctx.beginPath(); ctx.arc(0, 0, r * .9, 0, 7);
      ctx.fillStyle = mau; ctx.globalAlpha *= .16;
      ctx.fill(); ctx.globalAlpha /= .16;
      ctx.restore();
      for (var q2 = 0; q2 < 6; q2++) {
        var gq = bam(h, q2) * 6.283 + tuoi * 1.2;
        var bq = (.35 + bam(h, q2 + 30) * .6) * r;
        if (G.veFX) G.veFX(ctx, fx, b[0] + Math.cos(gq) * bq,
          b[1] - 14 * s + Math.sin(gq) * bq * .45 - tuoi * 10 * s,
          30 * s, Math.floor(tuoi * 8 + q2));
      }

    } else if (cf.kieu === 'aura') {
      /* hào quang quanh người dùng (hoặc quanh mọi đồng đội nếu chiêu là buff đội) */
      var ds = [a];
      if (cf.doi) {
        ds = [];
        tran.nguoi.forEach(function (m) {
          if (m.doi !== h.doi || m.chet > 0) return;
          var vm = viTri(m); ds.push(toaDo(vm[0], vm[1]));
        });
        if (!ds.length) ds = [a];
      }
      ds.forEach(function (pp, iq) {
        var nh = 0.5 + 0.5 * Math.sin(tuoi * 9 + iq);
        ctx.save(); ctx.translate(pp[0], pp[1]); ctx.scale(1, .45);
        ctx.beginPath(); ctx.arc(0, 0, r * (.8 + nh * .25), 0, 7);
        ctx.strokeStyle = mau; ctx.lineWidth = Math.max(1.5, 4 * s * (1 - tuoi));
        ctx.stroke(); ctx.restore();
        if (G.veFX) G.veFX(ctx, fx, pp[0], pp[1] - 26 * s - tuoi * 16 * s, r * .9, kh(iq * .2));
      });

    } else if (cf.kieu === 'chan') {
      var rb = r * (1 + tuoi * .25);
      ctx.strokeStyle = mau; ctx.lineWidth = Math.max(2, 4 * s * (1 - tuoi));
      ctx.beginPath(); ctx.arc(b[0], b[1] - 20 * s, rb, 0, 7); ctx.stroke();
      ctx.fillStyle = mau; ctx.globalAlpha *= .12;
      ctx.beginPath(); ctx.arc(b[0], b[1] - 20 * s, rb, 0, 7); ctx.fill();
      ctx.globalAlpha /= .12;
      if (G.veFX) G.veFX(ctx, fx, b[0], b[1] - 22 * s, r * 1.8, kh());

    } else if (cf.kieu === 'hoi') {
      for (var z = 0; z < 4; z++) {
        var lz = (tuoi + z * .25) % 1;
        if (G.veFX) G.veFX(ctx, fx, b[0] + (bam(h, z) - .5) * r,
          b[1] - 14 * s - lz * 42 * s, 24 * s, 0);
      }
      ctx.strokeStyle = mau; ctx.lineWidth = Math.max(1.5, 3 * s * (1 - tuoi));
      ctx.save(); ctx.translate(b[0], b[1]); ctx.scale(1, .45);
      ctx.beginPath(); ctx.arc(0, 0, r * (.6 + tuoi * .6), 0, 7); ctx.stroke();
      ctx.restore();
    }
  }

  /* ── KỸ NĂNG RIÊNG CỦA HUẤN LUYỆN VIÊN ──
     Phủ lên cả đội một vòng sáng và kéo một tia từ tâm đội tới từng người, kèm tên kỹ
     năng. Đây là lần duy nhất trong trận người chơi THẤY được cái mình đã chọn ở màn
     ngoài đang làm việc. */
  function veKnRieng(h, a, tuoi, s) {
    var cf = (G.FX_KN_RIENG && G.FX_KN_RIENG[h.kn]) || { fx: 'xung', mau: '#ffd76e', chu: h.ten };
    var r = 210 * s * (0.25 + tuoi * 0.9);
    ctx.save(); ctx.translate(a[0], a[1]); ctx.scale(1, .45);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7);
    ctx.strokeStyle = cf.mau; ctx.lineWidth = Math.max(2, 9 * s * (1 - tuoi));
    ctx.stroke();
    ctx.restore();
    (h.ds || []).forEach(function (idx, k) {
      var n = tran.nguoi[idx]; if (!n || n.chet > 0) return;
      var vn = viTri(n), pp = toaDo(vn[0], vn[1]);
      ctx.strokeStyle = cf.mau; ctx.globalAlpha *= .45 * (1 - tuoi);
      ctx.lineWidth = Math.max(1, 3 * s);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(pp[0], pp[1] - 14 * s); ctx.stroke();
      ctx.globalAlpha /= .45 * (1 - tuoi) || 1;
      if (G.veFX) G.veFX(ctx, cf.fx, pp[0], pp[1] - 30 * s, 48 * s, Math.floor(tuoi * 10 + k));
    });
    if (s > .45) chu(cf.chu, a[0], a[1] - 40 * s - tuoi * 20 * s,
      Math.max(12, 16 * s), cf.mau);
  }

  /** rung nhẹ khung hình cho những chiêu đập xuống đất */
  function rungMan(s) {
    if (!canvas) return;
    var d = 3 * s;
    canvas.style.transform = 'translate(' + ((Math.random() - .5) * d).toFixed(1) + 'px,' +
      ((Math.random() - .5) * d).toFixed(1) + 'px)';
    clearTimeout(canvas._rung);
    canvas._rung = setTimeout(function () { canvas.style.transform = ''; }, 90);
  }

  /* ══════════ BIA MỘ ══════════
     Người chết biến mất tăm là mất luôn thông tin "chỗ này vừa có người ngã xuống, và
     còn bao lâu nữa họ quay lại". Teamfight Manager 2 đếm giờ hồi sinh ngay trên bản
     đồ nhỏ; ở đây đếm ngay tại chỗ ngã. */
  function veBia(n, s, tNga) {
    var p = toaDo(n.x, n.y);
    if (ngoaiMan(p, 50 * s)) return;
    /* ngã xuống bằng khung chết của TFM2, nằm lại một nhịp rồi mới hoá bia */
    var idB = n.tuong.id, animB = G.animTuong(idB, 'chet'), daiB = G.daiT(idB, animB);
    if (G.tuongSan(idB) && daiB > 0 && tNga < daiB + 0.6) {
      ctx.globalAlpha = tNga < daiB ? 1 : 1 - (tNga - daiB) / 0.6;
      G.veHinhT(ctx, idB, animB, tNga, p[0], p[1], s * 1.15, Math.cos(huongCua(n)) < 0, false);
      ctx.globalAlpha = 1;
      return;
    }
    var cao = 30 * s;
    ctx.globalAlpha = .5;
    ctx.fillStyle = n.doi === 'xanh' ? '#2e6b52' : '#6b2e34';
    ctx.beginPath();
    ctx.moveTo(p[0] - cao * .3, p[1]);
    ctx.lineTo(p[0] - cao * .3, p[1] - cao * .55);
    ctx.arc(p[0], p[1] - cao * .55, cao * .3, Math.PI, 0);
    ctx.lineTo(p[0] + cao * .3, p[1]);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    if (s > .5) chu(Math.ceil(n.chet) + 's', p[0], p[1] - cao * .95,
      Math.max(9, 10 * s), 'rgba(255,255,255,.65)');
  }

  /** vẽ lại hàng ảnh dưới đáy (đánh dấu người đang được camera bám) */
  function veDayAnh() {
    var h = G.$('.tr-anhday'); if (!h) return;
    G.$$('.tr-mat', h).forEach(function (b, i) {
      b.classList.toggle('theo', cam.theo === i);
    });
  }

  function mauLop(l) {
    return { can: '#e8a35a', xa: '#6fc4f0', phep: '#b08af0', ho: '#5fe0b0', sat: '#ff8fb0' }[l] || '#ccc';
  }

  /* Thanh máu 3,5px không viền chìm nghỉm vào nền cỏ xanh — nhìn cả màn không đọc được
     ai còn bao nhiêu máu. TFM2 để thanh máu DÀY, có khung tối bao quanh, nằm sát đầu.
     `day` cho phép lính/quái dùng thanh mảnh hơn tướng. */
  function thanhMau(x, y, w, p, mau, day) {
    var h = day || 4;
    var x0 = Math.round(x - w / 2), y0 = Math.round(y);
    ctx.fillStyle = 'rgba(0,0,0,.82)';
    ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = mau;
    ctx.fillRect(x0, y0, w * G.kep(p, 0, 1), h);
  }

  /* ══════════ bảng bên phải ══════════ */
  function veTren() {
    G.$('#tr-dh').textContent = dinhDangGio(tran.t);
    G.$('#tr-so-xanh').textContent = tran.mang.xanh;
    G.$('#tr-so-do').textContent = tran.mang.do;
    G.$('#tr-obj').innerHTML =
      '<span>🐲 ' + tran.rongHa.xanh + '</span><span>👑 ' + tran.chuaHa.xanh + '</span>' +
      '<span>🏛 ' + tran.truHa.xanh + '</span>' +
      '<span class="tr-vang">' + G.tien(Math.round(tran.vang.xanh)) + '</span>' +
      '<i>vs</i>' +
      '<span class="tr-vang">' + G.tien(Math.round(tran.vang.do)) + '</span>' +
      '<span>🏛 ' + tran.truHa.do + '</span><span>👑 ' + tran.chuaHa.do + '</span>' +
      '<span>🐲 ' + tran.rongHa.do + '</span>';
  }

  function veMatchup() {
    var e = G.$('#tr-matchup'); if (!e) return;
    G.xoa(e);
    var VT = ['tren', 'rung', 'giua', 'duoi', 'ho'];
    VT.forEach(function (vt) {
      var a = null, b = null;
      tran.nguoi.forEach(function (n) {
        if (n.vt !== vt) return;
        if (n.doi === 'xanh') a = n; else b = n;
      });
      if (!a || !b) return;
      var d = G.el('div.mu-dong');
      d.appendChild(G.el('span.mu-vt', { text: G.VITRI_THEO_ID[vt].tat }));
      d.appendChild(G.el('span.mu-ten', { text: a.tuong.ten }));
      d.appendChild(G.el('span.mu-kda', { text: a.k + '/' + a.d + '/' + a.a }));
      var chenh = Math.round(a.vang - b.vang);
      d.appendChild(G.el('span.mu-vang' + (chenh >= 0 ? '.hon' : '.kem'),
        { text: (chenh >= 0 ? '◀ ' : '') + G.tien(Math.abs(chenh)) + (chenh < 0 ? ' ▶' : '') }));
      d.appendChild(G.el('span.mu-kda', { text: b.k + '/' + b.d + '/' + b.a }));
      d.appendChild(G.el('span.mu-ten.phai', { text: b.tuong.ten }));
      e.appendChild(d);
    });
  }

  /* Thẻ tuyển thủ hai bên — theo đúng bảng bên rìa màn trận của Teamfight Manager 2:
     ảnh tướng, "Lv<cấp> <tên>", thanh máu, và HÀNG SÁU Ô ĐỒ. Bấm vào thẻ thì camera bám
     theo người đó, bấm lần nữa thì thả ra (TFM2 cũng cho bấm một tuyển thủ để theo dõi). */
  function veThe() {
    var e = G.$('#tr-the'); if (!e) return;
    G.xoa(e);
    ['xanh', 'do'].forEach(function (doi) {
      var cot = G.el('div.the-cot');
      tran.nguoi.filter(function (n) { return n.doi === doi; }).forEach(function (n) {
        var d = G.el('div.the-nguoi' + (n.chet > 0 ? '.chet' : '') + (cam.theo === n.i ? '.theo' : ''));

        var hoiC = (n.tuong.kn.ult && n.tuong.kn.ult.hoi) || 1;
        var duCap = n.cap >= 5;
        var san = duCap && n.cd.ult <= 0;
        var pC = !duCap ? 0 : G.kep(1 - n.cd.ult / hoiC, 0, 1);

        var tren = G.el('div.the-tren');
        var a = G.oAnhTuong && G.oAnhTuong(n.tuong.id, 26);
        if (a) { a.className = 'the-anh'; tren.appendChild(a); }
        tren.appendChild(G.el('div.the-ten', { text: (san ? '★ ' : '') + 'Lv' + n.cap + ' ' + n.ten }));
        tren.appendChild(G.el('div.the-kda', { text: n.k + '/' + n.d + '/' + n.a }));
        d.appendChild(tren);

        var th = G.el('div.the-mau');
        th.appendChild(G.el('i', { style: 'width:' + G.kep(n.hp / n.hpMax * 100, 0, 100) + '%;background:' +
          (doi === 'xanh' ? '#3ddc97' : '#e5484d') }));
        d.appendChild(th);

        /* THANH THỨ HAI = CHIÊU CUỐI.
           Teamfight Manager 2 để một thanh mana ngay dưới thanh máu. Ở đây không có mana,
           nhưng thứ người xem thật sự cần biết là "ai sắp bung chiêu cuối" — đó là khoảnh
           khắc quyết định giao tranh. Đầy và sáng vàng = sẵn sàng, và ghi luôn TÊN chiêu. */
        var tc = G.el('div.the-cuoi' + (san ? '.san' : ''), {
          title: n.tuong.kn.ult.ten + (san ? ' — sẵn sàng'
            : (!duCap ? ' — mở ở cấp 5' : ' — còn ' + Math.ceil(n.cd.ult) + 's')) });
        tc.appendChild(G.el('i', { style: 'width:' + (pC * 100) + '%' }));
        d.appendChild(tc);
        /* Chiêu cuối đầy thì viền thẻ sáng vàng và tên có dấu ★ — một dòng chữ nữa thì
           thẻ cao thêm, mà cột chỉ đủ chỗ cho đúng NĂM người mỗi bên. */
        if (san) { d.classList.add('san-cuoi'); }

        /* NĂM ô, không phải sáu: mỗi nhánh trang bị là một đường ghép và mua tầng sau
           thay tầng trước, nên một người giữ tối đa đúng năm món — một món mỗi nhánh.
           Vẽ sáu ô thì ô cuối vĩnh viễn trống, nhìn như đang thiếu đồ. */
        /* SÁU ô: sáu dòng đồ TFM2, mỗi dòng một ô (data-trangbi.js) */
        var do_ = G.el('div.the-do');
        for (var i = 0; i < (G.SO_O_DO || 6); i++) {
          var m = n.do[i];
          var o = G.el('span' + (m ? '.co' : ''));
          if (m) {
            var tb = G.TB_THEO_ID[m];
            o.setAttribute('title', tb.ten + ' — ' + tb.mo);
            var icon = G.oAnhDo && G.oAnhDo(m, 18);
            if (icon) {
              o.appendChild(icon);
              o.style.borderColor = G.NHANH_MAU[tb.nhanh];
            } else {
              o.style.background = G.NHANH_MAU[tb.nhanh];
              o.appendChild(G.el('i', { text: G.NHANH_DAU[tb.nhanh] || '◆' }));
            }
            o.appendChild(G.el('em', { text: String(tb.tang + 1) }));
          }
          do_.appendChild(o);
        }
        d.appendChild(do_);

        if (n.chet > 0) d.appendChild(G.el('div.the-hs', { text: Math.ceil(n.chet) + 's' }));
        d.addEventListener('click', function () {
          cam.theo = (cam.theo === n.i) ? null : n.i;
          cam.tuDong = cam.theo == null;
          veThe(); veNutCam();
        });
        cot.appendChild(d);
      });
      e.appendChild(cot);
    });
  }

  /* ══════════ nút camera ══════════ */
  function veNutCam() {
    var e = G.$('#tr-cam'); if (!e) return;
    G.xoa(e);
    var b = G.el('button.nut' + (cam.tuDong ? '.chinh' : ''), {
      text: cam.tuDong ? '🎥 Tự bám' : (cam.theo != null ? '👤 Đang theo người' : '🖐 Tự kéo')
    });
    b.addEventListener('click', function () {
      cam.tuDong = !cam.tuDong;
      if (cam.tuDong) cam.theo = null;
      veNutCam(); veThe();
    });
    e.appendChild(b);

    var z = G.el('div.tr-zoom');
    MUC_ZOOM.forEach(function (m, i) {
      var zb = G.el('button' + (cam.iz === i ? '.chon' : ''), { text: m.ten });
      zb.addEventListener('click', function () { cam.iz = i; veNutCam(); });
      z.appendChild(zb);
    });
    e.appendChild(z);
  }

  /* Minimap là đúng minimap_5v5 của TFM2 (nền + tường, ghép sẵn thành ban-nho.png) — cùng
     hướng nhìn thẳng từ trên xuống với bản đồ lớn, nên một điểm trên minimap ứng ngay một chỗ
     trên sân. Sân 0..1000 phủ trọn khung minimap, đúng như sheet gốc. */
  function toaDoMini(x, y, W, H) {
    return [x / 1000 * W, y / 1000 * H];
  }

  function veMini() {
    var c = G.$('#tr-mini'); if (!c) return;
    var x = c.getContext('2d');
    /* Đọc kích thước THẬT của thẻ canvas, đừng chép tay: đổi cỡ bản đồ nhỏ ở một chỗ mà
       quên chỗ kia là cả hình vẽ tràn ra ngoài khung. */
    var W = c.width, H = c.height;
    x.fillStyle = '#080b10'; x.fillRect(0, 0, W, H);
    var nho = anhBanDo('nho');
    if (nho) { x.imageSmoothingEnabled = false; x.drawImage(nho, 0, 0, W, H); }

    /* khung camera đang nhìn */
    var k = MUC_ZOOM[cam.iz].k, cw = canvas ? canvas.width / k : 0, chh = canvas ? canvas.height / k : 0;
    x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1;
    x.strokeRect((cam.x - cw / 2 - GOC_SAN) / (W0 - 2 * GOC_SAN) * W, (cam.y - chh / 2 - GOC_SAN) / (H0 - 2 * GOC_SAN) * H,
      cw / (W0 - 2 * GOC_SAN) * W, chh / (H0 - 2 * GOC_SAN) * H);

    tran.tru.forEach(function (r) {
      if (!r.song) return;
      var p = toaDoMini(r.x, r.y, W, H), o = r.loi ? 3 : 2;
      x.fillStyle = r.doi === 'xanh' ? '#2b8fd6' : '#c8393e';
      x.fillRect(p[0] - o, p[1] - o, o * 2, o * 2);
    });
    ['rong', 'chua'].forEach(function (kk) {
      var q = tran.quaiLon[kk]; if (!q || !q.song) return;
      var p = toaDoMini(q.x, q.y, W, H);
      x.fillStyle = '#ffd76e';
      x.beginPath(); x.arc(p[0], p[1], 3, 0, 7); x.fill();
    });
    tran.nguoi.forEach(function (n) {
      if (n.chet > 0) return;
      var p = toaDoMini(n.x, n.y, W, H);
      x.fillStyle = n.doi === 'xanh' ? '#3ddc97' : '#e5484d';
      x.beginPath(); x.arc(p[0], p[1], 3, 0, 7); x.fill();
      x.strokeStyle = 'rgba(0,0,0,.6)'; x.stroke();
    });
  }

  function dinhDangGio(t) {
    var p = Math.floor(t / 60), g = Math.floor(t % 60);
    return p + ':' + (g < 10 ? '0' : '') + g;
  }

  /* ══════════ kết thúc ══════════ */
  function ketThuc() {
    /* một trận kết thúc đúng một lần — bấm ⚡ lúc băng THẮNG/THUA đang hiện từng làm
       `xongCB` chạy hai lần: thắng cộng đôi, Bo3 xong sau một ván */
    if (daKet) return;
    daKet = true;
    var kq = G.ketQua(tran);
    G.tieng(kq.thang === 'xanh' ? 'thang' : 'thua');
    G.nhac(kq.thang === 'xanh' ? 'thang' : 'thua');
    if (kq.thang === 'xanh') G.tieng('tran.voTay');
    G.bangLon(kq.thang === 'xanh' ? 'THẮNG!' : 'THUA', dinhDangGio(kq.thoiGian) + (kq.hetGio ? ' · hết giờ' : ''), 1600)
      .then(function () {
        if (kq.thang === 'xanh') G.phaoHoa(60);
        return G.hienKetQua(kq, tran);
      })
      .then(function () { if (xongCB) xongCB(kq); });
  }

  /* bảng kết quả sau trận — theo đúng bố cục Match Result của Teamfight Manager 2 */
  G.hienKetQua = function (kq, tr) {
    var n = G.el('div.kq');

    var dau = G.el('div.kq-dau');
    dau.appendChild(G.el('b', { text: tr.cau.ta.ten }));
    dau.appendChild(G.el('span.kq-tt', { text: kq.thang === 'xanh' ? 'THẮNG' : 'THUA',
      style: 'color:' + (kq.thang === 'xanh' ? '#3ddc97' : '#e5484d') }));
    dau.appendChild(G.el('span', { text: dinhDangGio(kq.thoiGian) }));
    dau.appendChild(G.el('b', { text: tr.cau.dich.ten }));
    n.appendChild(dau);

    var maxDmg = 1;
    kq.nguoi.forEach(function (p) { if (p.dmg > maxDmg) maxDmg = p.dmg; });

    var bang = G.el('div.kq-bang');
    for (var i = 0; i < 5; i++) {
      var a = kq.nguoi[i], b = kq.nguoi[i + 5];
      var d = G.el('div.kq-dong');
      d.appendChild(theKQ(a, maxDmg, 'trai', kq.mvp === a.i));
      d.appendChild(G.el('span.kq-vt', { text: G.VITRI_THEO_ID[tr.nguoi[i].vt].tat }));
      d.appendChild(theKQ(b, maxDmg, 'phai', kq.mvp === b.i));
      bang.appendChild(d);
    }
    n.appendChild(bang);

    var so = G.el('div.kq-so');
    [['Mạng', kq.mang.xanh, kq.mang.do], ['Vàng', G.tien(Math.round(kq.vang.xanh)), G.tien(Math.round(kq.vang.do))],
     ['Trụ', kq.tru.xanh, kq.tru.do], ['Rồng', kq.rong.xanh, kq.rong.do], ['Chúa Hang', kq.chua.xanh, kq.chua.do]]
      .forEach(function (r) {
        var d2 = G.el('div.kq-so-dong');
        d2.appendChild(G.el('b', { text: String(r[1]) }));
        d2.appendChild(G.el('span', { text: r[0] }));
        d2.appendChild(G.el('b', { text: String(r[2]) }));
        so.appendChild(d2);
      });
    n.appendChild(so);

    /* biểu đồ chênh lệch vàng — thứ Teamfight Manager 2 đặt ngay giữa bảng kết quả */
    n.appendChild(G.el('div.kq-nhan', { text: 'Chênh lệch vàng theo phút' }));
    n.appendChild(veChart(kq.chart));

    return G.hop({ dau: 'Kết quả trận', node: n, nut: [{ chu: 'Tiếp ➜', chinh: true }] });
  };

  function theKQ(p, maxDmg, ben, mvp) {
    var d = G.el('div.kq-nguoi.' + ben);
    var ten = G.el('div.kq-ten');
    ten.appendChild(G.el('span', { text: (mvp ? '👑 ' : '') + p.ten + ' · ' + p.tuong }));
    d.appendChild(ten);
    var th = G.el('div.kq-dmg');
    th.appendChild(G.el('i', { style: 'width:' + (p.dmg / maxDmg * 100) + '%;background:' +
      (p.doi === 'xanh' ? 'linear-gradient(90deg,#2b8fd6,#3ddc97)' : 'linear-gradient(90deg,#8f2d33,#e5484d)') }));
    d.appendChild(th);
    d.appendChild(G.el('div.kq-phu', { text: 'Điểm ' + p.diem.toFixed(2) + '  (' + p.k + '/' + p.d + '/' + p.a + ')  ' + G.so(p.dmg) }));
    return d;
  }

  function veChart(ds) {
    var W = 500, H = 110;
    var c = document.createElement('canvas');
    c.width = W; c.height = H; c.className = 'kq-chart';
    var x = c.getContext('2d');
    x.fillStyle = '#0a1017'; x.fillRect(0, 0, W, H);
    if (!ds || ds.length < 2) return c;

    var max = 1;
    ds.forEach(function (p) { max = Math.max(max, Math.abs(p.v)); });
    x.strokeStyle = '#26303f'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke();

    /* vùng tô */
    x.beginPath();
    ds.forEach(function (p, i) {
      var px = i / (ds.length - 1) * W;
      var py = H / 2 - (p.v / max) * (H / 2 - 8);
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    });
    x.lineTo(W, H / 2); x.lineTo(0, H / 2); x.closePath();
    x.fillStyle = 'rgba(61,220,151,.14)'; x.fill();

    x.beginPath();
    ds.forEach(function (p, i) {
      var px = i / (ds.length - 1) * W;
      var py = H / 2 - (p.v / max) * (H / 2 - 8);
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    });
    x.strokeStyle = '#3ddc97'; x.lineWidth = 2; x.stroke();

    x.fillStyle = '#8b98a9'; x.font = '10px system-ui'; x.textAlign = 'left';
    x.fillText('+' + G.tien(max), 4, 12);
    x.fillText('−' + G.tien(max), 4, H - 4);
    return c;
  }

})(window);
