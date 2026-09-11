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
  var chay = false, tocDo = 1, anBang = false, tamDung = false;
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
  var TICK_GIAY = 12;
  var thoaiHD = [], bayHD = [], hieuHD = [];
  var truoc = 0, dong = 0;
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
    tran = t; xongCB = cb; chay = true; tamDung = false; tocDo = 1;
    tran.veHinh = true;            /* từ đây sim mới dựng dữ liệu hiệu ứng — xem sim.js */
    thoaiHD = []; bayHD = []; hieuHD = [];
    G.hienMan('man-tran');
    dungKhung();
    if (G.day) G.day('tran');
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
      chay = false;
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
      dong = (dong || 0) + TICK_GIAY * tocDo * dt;
      var soTick = Math.floor(dong);
      dong -= soTick;
      if (soTick > 400) soTick = 400;
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
    veBanDo();
    khung++;
    if (khung % 12 === 0) { veMatchup(); veThe(); veTren(); veMini(); }

    if (tran.xong) { chay = false; return ketThuc(); }
    requestAnimationFrame(vong);
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
        G.rung('vua');
      } else if (s.loai === 'quaiLon') {
        G.tieng('quaiLon');
        banner((s.doi === 'xanh' ? tran.cau.ta.ten : tran.cau.dich.ten) + ' hạ ' +
          (s.quai === 'rong' ? 'RỒNG' : 'CHÚA HANG') + '!', s.doi);
      } else if (s.loai === 'tru') {
        G.tieng('tru');
        if (s.loi) banner('NHÀ CHÍNH ĐỔ!', s.doi);
      } else if (s.loai === 'knRieng') {
        /* Kỹ năng riêng của huấn luyện viên bật lên — thứ người chơi đã chọn ở màn
           ngoài, mà suốt bao lâu nay trong trận không thấy mặt mũi đâu. */
        banner('KỸ NĂNG HLV: ' + s.ten, s.doi);
        G.tieng('quaiLon');
      } else if (s.loai === 'quaiHien') {
        var ai = tran.nguoi[Math.floor(tran.rng() * 10)];
        if (ai) noi(ai, 'quaiLon');
      }
    }
    /* thỉnh thoảng có người nói câu hợp tình huống */
    if (tran.tick % 90 === 0) {
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

     Cách làm: dựng nền MỘT LẦN vào một canvas THẾ GIỚI 2048×1024 (hình thoi trải hết), rồi
     camera chỉ là phép cắt-và-phóng từ canvas ấy. Mọi thứ động cũng quy về toạ độ thế giới.  */
  var W0 = 2048, H0 = 1024;              /* cỡ canvas thế giới */
  var MUC_ZOOM = [
    { k: 0.405, ten: 'Toàn cảnh' },
    { k: 0.75, ten: 'Xa' },
    { k: 1.15, ten: 'Gần' },
    { k: 1.7, ten: 'Rất gần' }
  ];
  var cam = { x: W0 / 2, y: H0 / 2, mx: W0 / 2, my: H0 / 2, iz: 2, tuDong: true, theo: null };

  /** toạ độ trò chơi (0..1000 vuông) → toạ độ THẾ GIỚI (hình thoi 2048×1024) */
  function toaDoW(x, y) {
    var m = 26;
    return [W0 / 2 + ((x - y) / 1000) * (W0 / 2 - m), m + ((x + y) / 2000) * (H0 - 2 * m)];
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
    /* không cho camera trôi ra ngoài thế giới */
    var k = MUC_ZOOM[cam.iz].k;
    var nx = canvas.width / 2 / k, ny = canvas.height / 2 / k;
    cam.x = G.kep(cam.x, Math.min(nx, W0 / 2), Math.max(W0 - nx, W0 / 2));
    cam.y = G.kep(cam.y, Math.min(ny, H0 / 2), Math.max(H0 - ny, H0 / 2));
  }

  /* ══════════ nền tĩnh, vẽ một lần vào canvas thế giới ══════════ */
  var nenC = null;

  function dungNen() {
    if (nenC) return nenC;
    nenC = document.createElement('canvas');
    nenC.width = W0; nenC.height = H0;
    var c = nenC.getContext('2d');
    var rng = G.Rng(20260910);
    var S = H0 / 1000;                     /* hệ số quy đổi đơn vị trò chơi → điểm ảnh thế giới */

    function P(x, y) { return toaDoW(x, y); }
    function duongDan(lane, dai) {
      var wp = G.SIM_DUONG[lane];
      c.beginPath();
      wp.forEach(function (p, i) {
        var q = P(p[0], p[1]);
        if (i === 0) c.moveTo(q[0], q[1]); else c.lineTo(q[0], q[1]);
      });
      c.lineWidth = dai; c.lineCap = 'round'; c.lineJoin = 'round';
      c.stroke();
    }

    c.fillStyle = '#080b10';
    c.fillRect(0, 0, W0, H0);

    c.save();
    var g0 = P(0, 0), g1 = P(1000, 0), g2 = P(1000, 1000), g3 = P(0, 1000);
    c.beginPath();
    c.moveTo(g0[0], g0[1]); c.lineTo(g1[0], g1[1]); c.lineTo(g2[0], g2[1]); c.lineTo(g3[0], g3[1]);
    c.closePath();
    c.clip();

    var nen = c.createLinearGradient(0, 0, 0, H0);
    nen.addColorStop(0, '#17331f'); nen.addColorStop(0.5, '#132a1b'); nen.addColorStop(1, '#17331f');
    c.fillStyle = nen; c.fillRect(0, 0, W0, H0);

    /* vệt cỏ + đốm sáng cho mặt đất không phẳng lì */
    for (var i = 0; i < 900; i++) {
      var gx = rng() * 1000, gy = rng() * 1000, p = P(gx, gy);
      c.fillStyle = rng.duoc(0.5) ? 'rgba(255,255,255,.022)' : 'rgba(0,0,0,.055)';
      c.beginPath();
      c.ellipse(p[0], p[1], (7 + rng() * 26) * S, (3 + rng() * 8) * S, 0, 0, 7);
      c.fill();
    }
    /* búi cỏ nhỏ, chỉ thấy khi zoom gần */
    for (var i2 = 0; i2 < 700; i2++) {
      var bx = rng() * 1000, by = rng() * 1000, pb = P(bx, by);
      c.strokeStyle = 'rgba(150,210,140,.16)'; c.lineWidth = 1.4;
      for (var la = 0; la < 3; la++) {
        c.beginPath();
        c.moveTo(pb[0] + (la - 1) * 2.5, pb[1]);
        c.quadraticCurveTo(pb[0] + (la - 1) * 4, pb[1] - 5, pb[0] + (la - 1) * 6, pb[1] - 9);
        c.stroke();
      }
    }

    var TAM_RUNG = [[205, 480], [385, 760], [520, 240], [795, 615]];
    TAM_RUNG.forEach(function (t) {
      var p2 = P(t[0], t[1]);
      var gr = c.createRadialGradient(p2[0], p2[1], 10, p2[0], p2[1], 300);
      gr.addColorStop(0, 'rgba(6,20,11,.5)');
      gr.addColorStop(1, 'rgba(6,20,11,0)');
      c.fillStyle = gr; c.fillRect(0, 0, W0, H0);
    });

    /* sông */
    var sa = P(20, 20), sb = P(980, 980);
    c.strokeStyle = 'rgba(26,52,74,.72)'; c.lineWidth = 34 * S * 1.9;
    c.beginPath(); c.moveTo(sa[0], sa[1]); c.lineTo(sb[0], sb[1]); c.stroke();
    c.strokeStyle = 'rgba(74,157,248,.14)'; c.lineWidth = 24 * S * 1.9;
    c.beginPath(); c.moveTo(sa[0], sa[1]); c.lineTo(sb[0], sb[1]); c.stroke();
    c.strokeStyle = 'rgba(170,220,255,.18)'; c.lineWidth = 2;
    for (var w = 0; w < 46; w++) {
      var t2 = 30 + w * 21, lech = (w % 2 ? 1 : -1) * (8 + rng() * 10);
      var q1 = P(t2 + lech, t2 - lech), q2 = P(t2 + lech + 22, t2 - lech + 22);
      c.beginPath(); c.moveTo(q1[0], q1[1]); c.lineTo(q2[0], q2[1]); c.stroke();
    }

    /* hố hai con quái lớn */
    [[300, 300], [700, 700]].forEach(function (o) {
      var p3 = P(o[0], o[1]);
      c.save(); c.translate(p3[0], p3[1]); c.scale(1, 0.5);
      c.beginPath(); c.arc(0, 0, 96, 0, 7);
      c.fillStyle = 'rgba(12,26,18,.8)'; c.fill();
      c.lineWidth = 7; c.strokeStyle = 'rgba(180,150,90,.4)'; c.stroke();
      c.restore();
    });

    /* ba đường */
    ['tren', 'giua', 'duoi'].forEach(function (lane) {
      c.strokeStyle = 'rgba(8,18,12,.55)'; duongDan(lane, 44 * S * 1.9);
      c.strokeStyle = '#3c5b40';          duongDan(lane, 34 * S * 1.9);
      c.strokeStyle = '#5c7a4e';          duongDan(lane, 23 * S * 1.9);
      c.strokeStyle = 'rgba(190,180,120,.14)'; duongDan(lane, 11 * S * 1.9);
    });

    /* bụi rậm */
    [[210, 700], [320, 830], [700, 300], [790, 180], [420, 480], [580, 520],
     [180, 250], [250, 170], [820, 750], [750, 830]].forEach(function (b) {
      var p4 = P(b[0], b[1]);
      c.save(); c.translate(p4[0], p4[1]); c.scale(1, 0.5);
      c.beginPath(); c.arc(0, 0, 48, 0, 7);
      c.fillStyle = 'rgba(20,58,32,.88)'; c.fill();
      c.lineWidth = 4; c.strokeStyle = 'rgba(120,190,130,.16)'; c.stroke();
      c.restore();
    });

    /* sân hai nhà */
    [['xanh', G.SIM_NHA.xanh, '61,220,151'], ['do', G.SIM_NHA.do, '229,72,77']].forEach(function (b) {
      var p5 = P(b[1][0], b[1][1]);
      var gr2 = c.createRadialGradient(p5[0], p5[1], 8, p5[0], p5[1], 250);
      gr2.addColorStop(0, 'rgba(' + b[2] + ',.30)');
      gr2.addColorStop(0.6, 'rgba(' + b[2] + ',.10)');
      gr2.addColorStop(1, 'rgba(' + b[2] + ',0)');
      c.fillStyle = gr2; c.fillRect(0, 0, W0, H0);
      c.save(); c.translate(p5[0], p5[1]); c.scale(1, 0.5);
      c.beginPath(); c.arc(0, 0, 92, 0, 7);
      c.lineWidth = 6; c.strokeStyle = 'rgba(' + b[2] + ',.5)'; c.stroke();
      c.restore();
    });

    /* cây */
    function xaDuong(x, y) {
      var gan = 1e9;
      ['tren', 'giua', 'duoi'].forEach(function (lane) {
        G.SIM_DUONG[lane].forEach(function (p6, k, ds) {
          if (!k) return;
          var a = ds[k - 1], bb = p6;
          var dx = bb[0] - a[0], dy = bb[1] - a[1];
          var l2 = dx * dx + dy * dy || 1;
          var t3 = G.kep(((x - a[0]) * dx + (y - a[1]) * dy) / l2, 0, 1);
          var cx = a[0] + dx * t3, cy = a[1] + dy * t3;
          var d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
          if (d < gan) gan = d;
        });
      });
      return gan;
    }
    var cay = [];
    for (var n2 = 0; n2 < 4200 && cay.length < 150; n2++) {
      var cx2 = 60 + rng() * 880, cy2 = 60 + rng() * 880;
      if (xaDuong(cx2, cy2) < 128) continue;
      if (Math.abs(cx2 - cy2) < 118) continue;
      var trongRung = false, xaTam = 1e9;
      TAM_RUNG.forEach(function (t6) {
        var d2 = Math.sqrt((cx2 - t6[0]) * (cx2 - t6[0]) + (cy2 - t6[1]) * (cy2 - t6[1]));
        if (d2 < xaTam) xaTam = d2;
        if (d2 < 210) trongRung = true;
      });
      if (!trongRung || xaTam < 44) continue;
      cay.push([cx2, cy2, 9 + rng() * 6]);
    }
    cay.sort(function (a, b) { return (a[0] + a[1]) - (b[0] + b[1]); });
    cay.forEach(function (t4) {
      var p7 = P(t4[0], t4[1]), r2 = t4[2] * S * 1.9;
      c.save(); c.translate(p7[0], p7[1] + r2 * 0.5); c.scale(1, 0.4);
      c.beginPath(); c.arc(0, 0, r2 * 0.95, 0, 7);
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fill();
      c.restore();
      c.fillStyle = '#2a1f14';
      c.fillRect(p7[0] - r2 * 0.13, p7[1] - r2 * 0.2, r2 * 0.26, r2 * 0.72);
      c.beginPath(); c.arc(p7[0], p7[1] - r2 * 0.55, r2, 0, 7);
      c.fillStyle = '#1b4426'; c.fill();
      c.beginPath(); c.arc(p7[0] - r2 * 0.25, p7[1] - r2 * 0.8, r2 * 0.72, 0, 7);
      c.fillStyle = '#215230'; c.fill();
      c.beginPath(); c.arc(p7[0] + r2 * 0.2, p7[1] - r2 * 0.95, r2 * 0.5, 0, 7);
      c.fillStyle = '#2a6839'; c.fill();
    });

    c.restore();

    /* viền + chữ chỉ đường */
    c.beginPath();
    c.moveTo(g0[0], g0[1]); c.lineTo(g1[0], g1[1]); c.lineTo(g2[0], g2[1]); c.lineTo(g3[0], g3[1]);
    c.closePath();
    c.lineWidth = 3; c.strokeStyle = 'rgba(140,170,150,.22)'; c.stroke();

    c.font = 'bold 20px system-ui'; c.textAlign = 'center';
    c.fillStyle = 'rgba(210,230,215,.26)';
    [['tren', 500, 60, 'ĐƯỜNG TRÊN'], ['giua', 500, 500, 'ĐƯỜNG GIỮA'], ['duoi', 500, 940, 'ĐƯỜNG DƯỚI']]
      .forEach(function (x2) {
        var p8 = P(x2[1], x2[2]);
        c.fillText(x2[3], p8[0], p8[1] - 26);
      });
    c.fillStyle = 'rgba(170,215,180,.34)';
    TAM_RUNG.forEach(function (t5) {
      var p9 = P(t5[0], t5[1]);
      c.fillText('RỪNG', p9[0], p9[1]);
    });
    c.fillStyle = 'rgba(255,215,110,.4)';
    [[300, 300, 'CHÚA HANG'], [700, 700, 'RỒNG']].forEach(function (o2) {
      var pa = P(o2[0], o2[1]);
      c.fillText(o2[2], pa[0], pa[1] + 62);
    });
    c.fillStyle = 'rgba(61,220,151,.5)';
    var pn = P(G.SIM_NHA.xanh[0], G.SIM_NHA.xanh[1]);
    c.fillText('NHÀ TA', pn[0], pn[1] + 66);
    c.fillStyle = 'rgba(229,72,77,.5)';
    var pd = P(G.SIM_NHA.do[0], G.SIM_NHA.do[1]);
    c.fillText('NHÀ ĐỊCH', pd[0], pd[1] + 66);

    return nenC;
  }

  function veBanDo() {
    if (!canvas) return;
    /* Chốt chặn thứ hai: ngữ cảnh phải thuộc về đúng canvas đang treo trên màn. Lỡ có
       ai dựng lại khung mà quên dòng trên thì ở đây vẫn tự sửa, không đen màn nữa. */
    if (!ctx || ctx.canvas !== canvas) ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var k = MUC_ZOOM[cam.iz].k;
    var s = k;                                   /* px màn cho mỗi đơn vị thế giới */

    /* nền: cắt đúng ô camera từ canvas thế giới rồi phóng */
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#080b10';
    ctx.fillRect(0, 0, W, H);
    var sw = W / k, sh = H / k;
    ctx.drawImage(dungNen(), cam.x - sw / 2, cam.y - sh / 2, sw, sh, 0, 0, W, H);

    /* ── bãi quái rừng ── */
    tran.quai.forEach(function (q) {
      if (!q.song) return;
      var p = toaDo(q.x, q.y);
      if (ngoaiMan(p, 60 * s)) return;
      /* Bốn bãi bốn con khác nhau (lợn / nấm / rùa / yêu tinh) — tám bãi giống hệt nhau
         thì người xem không nhớ nổi mình vừa ăn bãi nào. Chốt theo chỉ số bãi nên hai
         nửa bản đồ đối xứng vẫn ra cùng một con ở cùng một chỗ. */
      var loaiBai = 'bai' + (1 + (q.i % 4));
      var t = gio();
      var tdq = t - (q.danhLuc == null ? -9 : q.danhLuc);
      /* Nhún người theo nhịp thở, và CHỒM TỚI khi vừa vung — quái rừng bản trước chỉ
         chạy bốn khung idle cho có, đứng im cho người ta đập. */
      var chom = (tdq >= 0 && tdq < 0.3) ? Math.sin(tdq / 0.3 * Math.PI) : 0;
      var qx = p[0] + Math.cos(q.goc || 0) * chom * 9 * s;
      var qy = p[1] + Math.sin(q.goc || 0) * chom * 6 * s;
      var tho = Math.sin(t * 2.2 + q.i) * 1.4 * s;
      bong(qx, p[1], 12 * s);
      var kq = 1 + chom * 0.12;
      ctx.save(); ctx.translate(qx, qy); ctx.scale(kq, kq); ctx.translate(-qx, -qy);
      if (!G.veQuai || !G.veQuai(ctx, loaiBai, qx, qy + 3 - tho, 34 * s,
            Math.floor(t * (chom ? 9 : 3) + q.i))) {
        ctx.fillStyle = '#5a4a2a';
        ctx.beginPath(); ctx.arc(qx, qy - 6 * s, 9 * s, 0, 7); ctx.fill();
      }
      ctx.restore();
      if (q.hp < q.hpMax && s > .55) thanhMau(p[0], p[1] - 40 * s, 30 * s, q.hp / q.hpMax, '#c8b06e', 3);
    });

    /* ── hai con quái lớn ── */
    ['rong', 'chua'].forEach(function (kk) {
      var q = tran.quaiLon[kk];
      var p = toaDo(q.x, q.y);
      if (ngoaiMan(p, 120 * s)) return;
      if (q.song) {
        var tl = gio();
        var tdl = tl - (q.danhLuc == null ? -9 : q.danhLuc);
        var chomL = (tdl >= 0 && tdl < 0.34) ? Math.sin(tdl / 0.34 * Math.PI) : 0;
        var lx = p[0] + Math.cos(q.goc || 0) * chomL * 20 * s;
        var ly = p[1] + Math.sin(q.goc || 0) * chomL * 12 * s;
        bong(lx, p[1], 34 * s);
        var kL = 1 + chomL * 0.1;
        ctx.save(); ctx.translate(lx, ly); ctx.scale(kL, kL); ctx.translate(-lx, -ly);
        if (!G.veQuai || !G.veQuai(ctx, kk, lx, ly + 8 * s, 78 * s,
              Math.floor(tl * (chomL ? 10 : 2.4)))) {
          ctx.fillStyle = kk === 'rong' ? '#7a3f8f' : '#8f3f3f';
          ctx.beginPath(); ctx.arc(lx, ly - 20 * s, 26 * s, 0, 7); ctx.fill();
        }
        ctx.restore();
        thanhMau(p[0], p[1] - 62 * s, 74 * s, q.hp / q.hpMax, '#ffd76e');
        chu(q.ten, p[0], p[1] - 68 * s, 11 * Math.max(.8, s), '#ffd76e');
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2;
        ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, .5);
        ctx.beginPath(); ctx.arc(0, 0, 30 * s, 0, 7); ctx.stroke();
        ctx.restore();
        var con = Math.max(0, Math.ceil(q.hienRa - tran.t));
        chu(q.ten + '  ' + dinhDangGio(con), p[0], p[1] - 4, 11 * Math.max(.85, s), 'rgba(255,255,255,.55)');
      }
    });

    /* ── trụ: bệ đá + thân + lõi phát sáng ── */
    tran.tru.forEach(function (r) {
      if (!r.song) return;
      var p = toaDo(r.x, r.y);
      var cao = (r.loi ? 62 : r.nha ? 48 : 40) * s;
      if (ngoaiMan(p, cao * 2)) return;
      var xanh = r.doi === 'xanh';
      var mau = xanh ? '#4aa3e0' : '#e0564a';
      var sang = xanh ? '#a9e6ff' : '#ffb0a2';

      /* Sprite thật (art/tru.png, lấy của chế độ thủ thành Soul Knight): trụ đường,
         nhà chính, lõi — mỗi thứ một dáng, hai bên hai màu. Vẫn giữ nguyên bệ đá và
         quầng sáng vẽ tay ở dưới/trên để trụ có bóng đổ và nhấp nháy theo nhịp. */
      var khoaTru = (r.loi ? 'loi_' : r.nha ? 'nha_' : 'tru_') + (xanh ? 'xanh' : 'do');
      if (G.veTru) {
        /* bệ đá dưới chân cho khỏi trôi lơ lửng */
        ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, .42);
        ctx.beginPath(); ctx.arc(0, 0, cao * .46, 0, 7);
        ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, cao * .46, 0, 7);
        ctx.strokeStyle = xanh ? 'rgba(74,163,224,.55)' : 'rgba(224,86,74,.55)';
        ctx.lineWidth = Math.max(1, 2 * s); ctx.stroke();
        ctx.restore();

        if (G.veTru(ctx, khoaTru, p[0], p[1] + 2 * s, cao * 1.32)) {
          /* quầng sáng đỉnh trụ, nhấp nháy nhẹ để biết nó còn sống */
          var nh0 = 0.5 + 0.3 * Math.sin(tran.t * 3 + p[0] * 0.01);
          var g0 = ctx.createRadialGradient(p[0], p[1] - cao * 1.06, 0, p[0], p[1] - cao * 1.06, cao * .5);
          g0.addColorStop(0, sang); g0.addColorStop(1, mau + '00');
          ctx.globalAlpha = nh0 * .55; ctx.fillStyle = g0;
          ctx.beginPath(); ctx.arc(p[0], p[1] - cao * 1.06, cao * .5, 0, 7); ctx.fill();
          ctx.globalAlpha = 1;
          if (r.hp < r.hpMax) thanhMau(p[0], p[1] - cao * 1.5, cao * .95, r.hp / r.hpMax, mau);
          return;
        }
      }

      /* bệ */
      ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, .48);
      ctx.beginPath(); ctx.arc(0, 0, cao * .52, 0, 7);
      ctx.fillStyle = '#3b4450'; ctx.fill();
      ctx.lineWidth = Math.max(1, 3 * s); ctx.strokeStyle = '#59636f'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, cao * .38, 0, 7);
      ctx.fillStyle = '#4a5563'; ctx.fill();
      ctx.restore();

      /* thân tháp */
      var w = cao * .34;
      ctx.fillStyle = '#5b6673';
      ctx.beginPath();
      ctx.moveTo(p[0] - w, p[1] - 2);
      ctx.lineTo(p[0] - w * .62, p[1] - cao * .82);
      ctx.lineTo(p[0] + w * .62, p[1] - cao * .82);
      ctx.lineTo(p[0] + w, p[1] - 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6d7886';
      ctx.fillRect(p[0] - w * .72, p[1] - cao * .86, w * 1.44, cao * .09);

      /* lõi sáng, nhấp nháy nhẹ */
      var nh = 0.72 + 0.28 * Math.sin(tran.t * 3 + p[0] * 0.01);
      var gr = ctx.createRadialGradient(p[0], p[1] - cao * 1.02, 0, p[0], p[1] - cao * 1.02, cao * .42);
      gr.addColorStop(0, sang); gr.addColorStop(1, mau + '00');
      ctx.globalAlpha = nh; ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(p[0], p[1] - cao * 1.02, cao * .42, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = sang;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1] - cao * 1.22);
      ctx.lineTo(p[0] + cao * .13, p[1] - cao * 1.0);
      ctx.lineTo(p[0], p[1] - cao * .82);
      ctx.lineTo(p[0] - cao * .13, p[1] - cao * 1.0);
      ctx.closePath(); ctx.fill();

      if (r.hp < r.hpMax) thanhMau(p[0], p[1] - cao * 1.34, cao * .95, r.hp / r.hpMax, mau);
    });

    /* ── LÍNH ──
       Chủ dự án: "lính đánh thường thì thêm cây spear vào cầm trên tay thọc thọc nhau,
       bắn xa thì cầm súng, thấy rõ đạn." Lính cận cầm THƯƠNG và thọc tới; lính xa cầm
       SÚNG NGẮN, giật lùi một nhịp rồi viên đạn bay ra (hiệu ứng `dan` do sim đẩy). */
    tran.linh.forEach(function (l) {
      var vl = viTri(l);
      var p = toaDo(vl[0], vl[1]);
      if (ngoaiMan(p, 40 * s)) return;
      var cao = (l.xa ? 20 : 22) * s;
      var t = gio();
      var tdl = t - (l.danhLuc == null ? -9 : l.danhLuc);
      var danh = (tdl >= 0 && tdl < 0.34) ? tdl / 0.34 : -1;
      var gocL = huongCua(l);
      var latL = Math.cos(gocL) < 0;
      var diL = dangDi(l);
      var nhun = diL ? Math.abs(Math.sin(t * 11 + l.x)) * 1.6 * s : 0;
      /* lính cận chồm theo cú thọc, lính xa giật lùi theo phát bắn */
      var day = danh >= 0
        ? (l.xa ? -Math.sin(danh * Math.PI) * 2.5 * s : Math.sin(danh * Math.PI) * 5 * s)
        : 0;
      var lx = p[0] + Math.cos(gocL) * day, ly = p[1] + Math.sin(gocL) * day * .6;
      bong(p[0], p[1], cao * .34);
      var ok = G.veQuai && G.veQuai(ctx, l.xa ? 'linh_xa' : 'linh_can', lx, ly - nhun, cao,
        Math.floor(t * (diL ? 7 : 3) + l.x));
      if (!ok) {
        ctx.fillStyle = l.doi === 'xanh' ? '#7fd6ff' : '#ff9ec4';
        ctx.beginPath(); ctx.arc(lx, ly - cao * .4, cao * .3, 0, 7); ctx.fill();
      }
      veVuKhiTay(l.xa ? 'sung_ngan' : 'thuong', lx, ly, cao, gocL, danh, latL);
      if (l.xa && danh >= 0 && danh < .3 && G.veFX) {
        G.veFX(ctx, 'dam', lx + Math.cos(gocL) * cao * .75, ly - cao * .48 + Math.sin(gocL) * cao * .5,
          cao * .6, Math.floor(danh * 12));
      }
      /* vòng màu đội dưới chân để phân biệt hai bên */
      ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, .42);
      ctx.beginPath(); ctx.arc(0, 0, cao * .32, 0, 7);
      ctx.strokeStyle = l.doi === 'xanh' ? 'rgba(61,220,151,.85)' : 'rgba(229,72,77,.85)';
      ctx.lineWidth = Math.max(1, 1.6 * s); ctx.stroke();
      ctx.restore();
      if (l.hp < l.hpMax && s > .6) thanhMau(lx, ly - cao - 3 * s, cao * .9, l.hp / l.hpMax,
        l.doi === 'xanh' ? '#3ddc97' : '#e5484d', 3);
    });

    /* ── hiệu ứng dưới chân (vòng diện rộng) ── */
    veHieu(true, s);

    /* ══════════ TƯỚNG ══════════
       Sprite gốc chỉ có bốn khung ĐỨNG YÊN, nên toàn bộ "đang làm gì" phải dựng bằng
       phép biến hình + một lớp vũ khí rời:
         đi       nhún chân theo nhịp, khung chạy nhanh hơn
         ra đòn   chồm tới theo hướng đánh, vũ khí vung/thọc
         niệm     phình người một nhịp, sáng lên, TÊN CHIÊU hiện trên đầu
         ăn đòn   chớp trắng một nhịp
         hồi sinh luồng sáng dựng từ đất lên
       Không có mấy cái này thì trận là mười hình đứng im trượt qua nhau. */
    tran.nguoi.forEach(function (n) {
      if (n.chet > 0) return veBia(n, s);
      var vn = viTri(n);
      var p = toaDo(vn[0], vn[1]);
      var cao = 46 * s;
      if (ngoaiMan(p, cao * 2.6)) return;
      var t = gio();

      var tDanh = t - (n.danhLuc == null ? -9 : n.danhLuc);
      var tNiem = t - (n.niemLuc == null ? -9 : n.niemLuc);
      var tDinh = t - (n.dinhLuc == null ? -9 : n.dinhLuc);
      var tHoi = t - (n.hoiLuc == null ? -9 : n.hoiLuc);
      var danh = (tDanh >= 0 && tDanh < 0.32) ? tDanh / 0.32 : -1;
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
      }

      /* nhún chân khi đi; chồm tới khi ra đòn */
      var nhun = di ? Math.abs(Math.sin(t * 9 + n.i)) * 2.4 * s : 0;
      var day = danh >= 0 ? Math.sin(danh * Math.PI) * 6.5 * s : 0;
      var nx = p[0] + Math.cos(goc) * day;
      var ny = p[1] + Math.sin(goc) * day * .55;
      var phong = niem >= 0 ? 1 + 0.2 * Math.sin(niem * Math.PI) : 1;
      var khung = Math.floor(t * (di ? 7 : 3) + n.i * 1.3);

      ctx.save();
      ctx.translate(nx, ny); ctx.scale(phong, phong); ctx.translate(-nx, -ny);
      /* VIỀN MÀU ĐỘI quanh người.
         Hai bên đều là sprite anime bảng màu na ná nhau; cái vòng mờ dưới chân không đủ
         để liếc một cái là biết ai phe nào — nhất là lúc mười người xúm vào một chỗ.
         Bóng đổ màu của canvas cho ra đúng một quầng ôm theo dáng người, chỉ tốn thêm
         một lần vẽ. Đây là thứ làm màn trận ĐỌC ĐƯỢC. */
      ctx.shadowColor = n.doi === 'xanh' ? '#25e08a' : '#ff4d55';
      ctx.shadowBlur = Math.max(4, 7 * s);
      var veOk = G.veTuong && G.veTuong(ctx, n.tuong.id, nx, ny + 3 * s - nhun, cao, khung, lat);
      ctx.shadowBlur = 0;
      if (!veOk) {
        ctx.beginPath(); ctx.arc(nx, ny - cao * .4, cao * .32, 0, 7);
        ctx.fillStyle = mauLop(n.tuong.lop); ctx.fill();
      }
      /* chớp trắng khi vừa ăn đòn — vẽ chồng ở chế độ cộng sáng, rẻ hơn ctx.filter */
      if (tDinh >= 0 && tDinh < 0.16 && veOk) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.8 * (1 - tDinh / 0.16);
        G.veTuong(ctx, n.tuong.id, nx, ny + 3 * s - nhun, cao, khung, lat);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      /* đang niệm: bọc một lớp sáng theo màu của chiêu */
      if (niem >= 0 && veOk) {
        var fxN = G.fxChieu ? G.fxChieu(n.tuong.id, n.niemCuoi ? 'cuoi' : 'chieu') : null;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 * (1 - niem);
        G.veTuong(ctx, n.tuong.id, nx, ny + 3 * s - nhun, cao, khung, lat);
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

      /* vũ khí cầm tay — thứ làm cho đòn đánh NHÌN THẤY ĐƯỢC */
      veVuKhiTay(G.vuKhiCua ? G.vuKhiCua(n.tuong) : null, nx, ny - nhun, cao, goc, danh, lat);

      /* Đặt thanh máu ngay trên ĐỈNH ĐẦU THẬT, không phải trên mép ô atlas: ô cao 64 mà
         người chỉ vẽ ở phần dưới, nên treo theo mép ô thì thanh máu lơ lửng cách đầu cả
         một thân người và không ai nối được thanh nào với ai. */
      var mepT = G.mepTuong ? G.mepTuong(n.tuong.id) : 0;
      var dinhDau = p[1] - cao * (1 - mepT) - 6 * s;
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
        var fxT = G.fxChieu ? G.fxChieu(n.tuong.id, n.niemCuoi ? 'cuoi' : 'chieu') : null;
        ctx.globalAlpha = tn < .75 ? 1 : (1 - tn) * 4;
        chu((n.niemCuoi ? '★ ' : '') + n.niemTen, p[0],
          dinhDau - 12 * s - (n.i % 2) * 11 * s - tn * 14 * s,
          G.kep((n.niemCuoi ? 13 : 11.5) * s, 10, n.niemCuoi ? 17 : 14),
          (fxT && fxT.mau) || '#ffd76e');
        ctx.globalAlpha = 1;
      }

      if (n.kc > 0) {
        ctx.strokeStyle = '#ffd76e'; ctx.lineWidth = Math.max(1.5, 2.5 * s);
        ctx.beginPath(); ctx.arc(p[0], p[1] - cao * .5, cao * .5, t * 5, t * 5 + 4.4); ctx.stroke();
        if (G.veFX) G.veFX(ctx, 'sao', p[0], p[1] - cao * 1.12, cao * .5, Math.floor(t * 8));
      }
      if (n.hieu && n.hieu.chan) {
        ctx.strokeStyle = 'rgba(160,220,255,.8)'; ctx.lineWidth = Math.max(1.5, 3 * s);
        ctx.beginPath(); ctx.arc(p[0], p[1] - cao * .45, cao * .56, 0, 7); ctx.stroke();
      }
    });

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
  function ganKeo() {
    if (!canvas || canvas._daGan) return;
    canvas._daGan = 1;
    var dang = false, tx = 0, ty = 0;
    canvas.addEventListener('pointerdown', function (e) {
      dang = true; tx = e.clientX; ty = e.clientY;
      cam.tuDong = false; cam.theo = null;
      veNutCam(); veThe();
    });
    window.addEventListener('pointerup', function () { dang = false; });
    window.addEventListener('pointermove', function (e) {
      if (!dang) return;
      var k = MUC_ZOOM[cam.iz].k;
      var r = canvas.getBoundingClientRect();
      var ti = canvas.width / (r.width || canvas.width);
      cam.mx -= (e.clientX - tx) * ti / k;
      cam.my -= (e.clientY - ty) * ti / k;
      cam.x = cam.mx; cam.y = cam.my;
      tx = e.clientX; ty = e.clientY;
    });
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
        var mx = (e.clientX - r.left) / r.width * 150;
        var my = (e.clientY - r.top) / r.height * 150;
        cam.tuDong = false; cam.theo = null;
        cam.mx = mx / 150 * W0; cam.my = my / 150 * H0;
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
  var DAN_LOP = { xa: 'ten', phep: 'phep', ho: 'bang', sat: 'thuong', can: 'thuong' };

  /** số giả ngẫu nhiên ỔN ĐỊNH theo (hiệu ứng, chỉ số) — cùng một giọt mưa thì khung nào
      cũng rơi đúng chỗ ấy. Dùng Math.random() ở đây là cả màn nhấp nháy loạn. */
  function bam(h, i) {
    var v = Math.sin((h.t * 97.13 + i * 41.7 + (h.x || 0) * 0.37)) * 43758.5453;
    return v - Math.floor(v);
  }

  function veHieu(duoi, s) {
    tran.hieu.forEach(function (h) { if (!h._v) { h._v = 1; hieuHD.push(h); } });
    var t = gio();
    hieuHD = hieuHD.filter(function (h) { return t - h.t < (h._lau || 1.0); });

    hieuHD.forEach(function (h) {
      var cf = null;
      if (h.loai === 'chieu' || h.loai === 'cuoi') {
        cf = G.fxChieu ? G.fxChieu(h.tuong, h.kn || h.loai) : null;
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

  /* ══════════ VŨ KHÍ TRÊN TAY ══════════
     `pha` là tiến độ của cú đánh, 0..1; −1 nghĩa là đang nghỉ.

     Vũ khí ĐÂM (giáo, thương, dao) thì THỌC tới rồi rút về — chủ dự án gọi đúng tên:
     "thọc thọc nhau". Vũ khí VUNG (kiếm, rìu, búa) thì quét một cung từ sau ra trước.
     Vũ khí BẮN (cung, súng, bom) thì giật lùi một nhịp rồi về chỗ, còn viên đạn do
     hiệu ứng `dan` lo. Ba nhóm ba động tác khác hẳn nhau, nên nhìn tay là biết loại. */
  function veVuKhiTay(vk, x, y, cao, goc, pha, lat) {
    if (!vk || !G.veVuKhi) return;
    /* Ba con số này là "cánh tay": cao tay, độ vươn, cỡ vũ khí. Để rộng quá thì vũ khí
       trôi lơ lửng cạnh người như một món đồ rơi; để hẹp quá thì nó lẫn vào thân. */
    var tay = y - cao * 0.40;
    var neo = cao * 0.21;
    var g = goc;
    var co = cao * 0.46;
    var ban = G.VUKHI_BAN && G.VUKHI_BAN[vk];
    var thoc = G.VUKHI_THOC && G.VUKHI_THOC[vk];

    if (pha >= 0) {
      var cung = Math.sin(pha * Math.PI);
      if (ban) {
        neo -= cung * cao * 0.10;                   /* giật lùi */
        g = goc - cung * 0.14;
      } else if (thoc) {
        neo += cung * cao * 0.44;                   /* THỌC tới rồi rút */
        co *= 1 + cung * 0.08;
      } else {
        g = goc - 1.15 + 2.3 * pha;                 /* VUNG một cung */
        neo += cung * cao * 0.14;
      }
    } else if (!ban && !thoc) {
      g = goc - 0.5;                                /* nghỉ: vác chếch lên vai */
    }
    G.veVuKhi(ctx, vk, x, tay, co, g, neo);
  }

  /* ══════════ BIA MỘ ══════════
     Người chết biến mất tăm là mất luôn thông tin "chỗ này vừa có người ngã xuống, và
     còn bao lâu nữa họ quay lại". Teamfight Manager 2 đếm giờ hồi sinh ngay trên bản
     đồ nhỏ; ở đây đếm ngay tại chỗ ngã. */
  function veBia(n, s) {
    var p = toaDo(n.x, n.y);
    if (ngoaiMan(p, 50 * s)) return;
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

        var hoiC = (n.tuong.kn.cuoi && n.tuong.kn.cuoi.hoi) || 1;
        var duCap = n.cap >= 5;
        var san = duCap && n.cd.cuoi <= 0;
        var pC = !duCap ? 0 : G.kep(1 - n.cd.cuoi / hoiC, 0, 1);

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
          title: n.tuong.kn.cuoi.ten + (san ? ' — sẵn sàng'
            : (!duCap ? ' — mở ở cấp 5' : ' — còn ' + Math.ceil(n.cd.cuoi) + 's')) });
        tc.appendChild(G.el('i', { style: 'width:' + (pC * 100) + '%' }));
        d.appendChild(tc);
        /* Chiêu cuối đầy thì viền thẻ sáng vàng và tên có dấu ★ — một dòng chữ nữa thì
           thẻ cao thêm, mà cột chỉ đủ chỗ cho đúng NĂM người mỗi bên. */
        if (san) { d.classList.add('san-cuoi'); }

        /* NĂM ô, không phải sáu: mỗi nhánh trang bị là một đường ghép và mua tầng sau
           thay tầng trước, nên một người giữ tối đa đúng năm món — một món mỗi nhánh.
           Vẽ sáu ô thì ô cuối vĩnh viễn trống, nhìn như đang thiếu đồ. */
        var do_ = G.el('div.the-do');
        for (var i = 0; i < 5; i++) {
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
            o.appendChild(G.el('em', { text: String(tb.tang || '') }));
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

  /* Minimap dùng đúng phép xoay của bản đồ lớn — hai hình khác hướng nhau thì minimap
     thành vô dụng, nhìn một cái không biết điểm ấy ứng với chỗ nào trên sân. */
  function toaDoMini(x, y, W, H) {
    var m = 5;
    return [W / 2 + ((x - y) / 1000) * (W / 2 - m), m + ((x + y) / 2000) * (H - 2 * m)];
  }

  function veMini() {
    var c = G.$('#tr-mini'); if (!c) return;
    var x = c.getContext('2d');
    /* Đọc kích thước THẬT của thẻ canvas, đừng chép tay: đổi cỡ bản đồ nhỏ ở một chỗ mà
       quên chỗ kia là cả hình vẽ tràn ra ngoài khung. */
    var W = c.width, H = c.height;
    x.fillStyle = '#080b10'; x.fillRect(0, 0, W, H);

    /* hình thoi + ba đường, để minimap cũng đọc được là map ba đường */
    var g0 = toaDoMini(0, 0, W, H), g1 = toaDoMini(1000, 0, W, H),
        g2 = toaDoMini(1000, 1000, W, H), g3 = toaDoMini(0, 1000, W, H);
    x.beginPath();
    x.moveTo(g0[0], g0[1]); x.lineTo(g1[0], g1[1]); x.lineTo(g2[0], g2[1]); x.lineTo(g3[0], g3[1]);
    x.closePath();
    x.fillStyle = '#12251a'; x.fill();
    x.strokeStyle = 'rgba(140,170,150,.18)'; x.lineWidth = 1; x.stroke();

    x.strokeStyle = '#3a5a3e'; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
    ['tren', 'giua', 'duoi'].forEach(function (lane) {
      x.beginPath();
      G.SIM_DUONG[lane].forEach(function (p, i) {
        var q = toaDoMini(p[0], p[1], W, H);
        if (i === 0) x.moveTo(q[0], q[1]); else x.lineTo(q[0], q[1]);
      });
      x.stroke();
    });
    /* sông */
    var sa = toaDoMini(20, 20, W, H), sb = toaDoMini(980, 980, W, H);
    x.strokeStyle = 'rgba(74,157,248,.22)'; x.lineWidth = 7;
    x.beginPath(); x.moveTo(sa[0], sa[1]); x.lineTo(sb[0], sb[1]); x.stroke();

    tran.tru.forEach(function (r) {
      if (!r.song) return;
      var p = toaDoMini(r.x, r.y, W, H);
      x.fillStyle = r.doi === 'xanh' ? '#2b8fd6' : '#c8393e';
      x.fillRect(p[0] - 2, p[1] - 2, 4, 4);
    });
    ['rong', 'chua'].forEach(function (k) {
      var q = tran.quaiLon[k]; if (!q || !q.song) return;
      var p = toaDoMini(q.x, q.y, W, H);
      x.fillStyle = '#ffd76e';
      x.beginPath(); x.arc(p[0], p[1], 3, 0, 7); x.fill();
    });
    tran.nguoi.forEach(function (n) {
      if (n.chet > 0) return;
      var p = toaDoMini(n.x, n.y, W, H);
      x.fillStyle = n.doi === 'xanh' ? '#3ddc97' : '#e5484d';
      x.beginPath(); x.arc(p[0], p[1], 3, 0, 7); x.fill();
    });
  }

  function dinhDangGio(t) {
    var p = Math.floor(t / 60), g = Math.floor(t % 60);
    return p + ':' + (g < 10 ? '0' : '') + g;
  }

  /* ══════════ kết thúc ══════════ */
  function ketThuc() {
    var kq = G.ketQua(tran);
    G.tieng(kq.thang === 'xanh' ? 'thang' : 'thua');
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
