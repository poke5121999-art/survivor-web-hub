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
  var TICK_GIAY = 40;             /* tick mỗi giây thật ở tốc độ ×1 → 20 phút trận ≈ 100 giây xem */
  var thoaiHD = [], bayHD = [], hieuHD = [];
  var truoc = 0, dong = 0;

  G.moManTran = function (t, cb) {
    tran = t; xongCB = cb; chay = true; tamDung = false; tocDo = 1;
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
    trai.appendChild(canvas);
    trai.appendChild(G.el('div.tr-thoai#tr-thoai'));
    trai.appendChild(G.el('div.tr-banner#tr-banner', { hidden: 'hidden' }));
    than.appendChild(trai);

    var phai = G.el('div.tr-phai');
    phai.appendChild(G.el('div.tr-matchup#tr-matchup'));
    phai.appendChild(G.el('div.tr-the#tr-the'));
    var duoi = G.el('div.tr-duoi');
    duoi.appendChild(G.el('canvas.tr-mini#tr-mini', { width: 150, height: 150 }));
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

    /* đáy: tốc độ */
    var day = G.el('div.tr-day');
    [0.5, 1, 2, 3].forEach(function (v) {
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
    if (!ctx) ctx = canvas.getContext('2d');
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
      if (!G.veQuai || !G.veQuai(ctx, loaiBai, p[0], p[1] + 3, 34 * s, Math.floor(tran.t * 2 + q.i))) {
        bong(p[0], p[1], 13 * s);
        ctx.fillStyle = '#5a4a2a';
        ctx.beginPath(); ctx.arc(p[0], p[1] - 6 * s, 9 * s, 0, 7); ctx.fill();
      }
    });

    /* ── hai con quái lớn ── */
    ['rong', 'chua'].forEach(function (kk) {
      var q = tran.quaiLon[kk];
      var p = toaDo(q.x, q.y);
      if (ngoaiMan(p, 120 * s)) return;
      if (q.song) {
        bong(p[0], p[1], 34 * s);
        if (!G.veQuai || !G.veQuai(ctx, kk, p[0], p[1] + 8 * s, 78 * s, Math.floor(tran.t * 2))) {
          ctx.fillStyle = kk === 'rong' ? '#7a3f8f' : '#8f3f3f';
          ctx.beginPath(); ctx.arc(p[0], p[1] - 20 * s, 26 * s, 0, 7); ctx.fill();
        }
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

    /* ── lính: dùng sprite thật trong atlas (quai.linh_can / quai.linh_xa) ── */
    tran.linh.forEach(function (l) {
      var p = toaDo(l.x, l.y);
      if (ngoaiMan(p, 40 * s)) return;
      var cao = (l.xa ? 20 : 22) * s;
      bong(p[0], p[1], cao * .34);
      var ok = G.veQuai && G.veQuai(ctx, l.xa ? 'linh_xa' : 'linh_can', p[0], p[1], cao,
        Math.floor(tran.t * 4 + p[0]));
      if (!ok) {
        ctx.fillStyle = l.doi === 'xanh' ? '#7fd6ff' : '#ff9ec4';
        ctx.beginPath(); ctx.arc(p[0], p[1] - cao * .4, cao * .3, 0, 7); ctx.fill();
      }
      /* vòng màu đội dưới chân để phân biệt hai bên */
      ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, .42);
      ctx.beginPath(); ctx.arc(0, 0, cao * .32, 0, 7);
      ctx.strokeStyle = l.doi === 'xanh' ? 'rgba(61,220,151,.85)' : 'rgba(229,72,77,.85)';
      ctx.lineWidth = Math.max(1, 1.6 * s); ctx.stroke();
      ctx.restore();
      if (l.hp < l.hpMax && s > .6) thanhMau(p[0], p[1] - cao - 3 * s, cao * .9, l.hp / l.hpMax,
        l.doi === 'xanh' ? '#3ddc97' : '#e5484d');
    });

    /* ── hiệu ứng dưới chân (vòng diện rộng) ── */
    veHieu(true, s);

    /* ── tướng ── */
    tran.nguoi.forEach(function (n) {
      if (n.chet > 0) return;
      var p = toaDo(n.x, n.y);
      var cao = 46 * s;
      if (ngoaiMan(p, cao * 2.4)) return;

      /* vòng đội dưới chân */
      ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, .42);
      ctx.beginPath(); ctx.arc(0, 0, cao * .40, 0, 7);
      ctx.fillStyle = n.doi === 'xanh' ? 'rgba(61,220,151,.30)' : 'rgba(229,72,77,.30)';
      ctx.fill();
      ctx.lineWidth = Math.max(1.4, 2.4 * s);
      ctx.strokeStyle = n.doi === 'xanh' ? 'rgba(61,220,151,.9)' : 'rgba(229,72,77,.9)';
      ctx.stroke();
      ctx.restore();

      var khung = Math.floor(tran.t * 3 + n.i * 1.3);
      var lat = n.mucTieu && n.mucTieu.x < n.x;
      if (!G.veTuong || !G.veTuong(ctx, n.tuong.id, p[0], p[1] + 3 * s, cao, khung, lat)) {
        ctx.beginPath(); ctx.arc(p[0], p[1] - cao * .4, cao * .32, 0, 7);
        ctx.fillStyle = mauLop(n.tuong.lop); ctx.fill();
      }

      thanhMau(p[0], p[1] - cao - 8 * s, cao * 1.05, n.hp / n.hpMax,
        n.doi === 'xanh' ? '#3ddc97' : '#e5484d');
      if (s > .55) chu('Lv' + n.cap + ' ' + n.ten, p[0], p[1] - cao - 13 * s,
        Math.max(9, 11 * s), n.doi === 'xanh' ? '#bff3dc' : '#ffc9cb');

      if (n.kc > 0) {
        ctx.strokeStyle = '#ffd76e'; ctx.lineWidth = Math.max(1.5, 2.5 * s);
        ctx.beginPath(); ctx.arc(p[0], p[1] - cao * .5, cao * .5, tran.t * 5, tran.t * 5 + 4.4); ctx.stroke();
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
    bayHD.forEach(function (b) {
      var p = toaDo(b.x, b.y);
      if (ngoaiMan(p, 40)) return;
      var tuoi = (tran.t - b.t) / 1.1;
      ctx.globalAlpha = 1 - tuoi;
      ctx.fillStyle = b.loai === 'pt' ? '#c89bff' : b.loai === 'hoi' ? '#7de3a0'
        : b.loai === 'ne' ? '#c8d3e0' : '#ffb36b';
      ctx.font = 'bold ' + Math.max(11, 14 * s) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000a'; ctx.lineWidth = 3;
      ctx.strokeText(b.chu, p[0], p[1] - 22 * s - tuoi * 30);
      ctx.fillText(b.chu, p[0], p[1] - 22 * s - tuoi * 30);
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

  /* ══════════ hiệu ứng ══════════
     Dữ liệu do sim.js đẩy ra (tran.hieu). Vẽ hai lượt: `duoi` là thứ nằm trên mặt đất
     (vòng diện rộng), còn lại vẽ đè lên người. */
  /* lớp tướng → loại đạn trong art/dan.png */
  var DAN_LOP = { xa: 'ten', phep: 'phep', ho: 'bang', sat: 'thuong', can: 'thuong' };

  function veHieu(duoi, s) {
    tran.hieu.forEach(function (h) { if (!h._v) { h._v = 1; hieuHD.push(h); } });
    hieuHD = hieuHD.filter(function (h) { return tran.t - h.t < 0.85; });

    hieuHD.forEach(function (h) {
      var tuoi = (tran.t - h.t) / 0.85;
      var laDuoi = (h.loai === 'chieu' || h.loai === 'cuoi') && h.dien;
      if (laDuoi !== duoi) return;
      var a = toaDo(h.x, h.y);
      var b = toaDo(h.x2 != null ? h.x2 : h.x, h.y2 != null ? h.y2 : h.y);
      var mau = h.doi === 'xanh' ? '#7de3ff' : '#ff9a86';
      ctx.globalAlpha = 1 - tuoi;

      if (h.loai === 'dan') {
        /* Viên đạn bay từ người bắn tới mục tiêu. Mỗi lớp một loại đạn riêng — xạ thủ
           bắn tên, pháp sư bắn cầu phép, hỗ trợ bắn mảnh băng — nên nhìn vệt đạn là
           đoán được ai đang đánh ai mà không cần đọc thẻ. */
        var t2 = Math.min(1, tuoi * 2.6);
        var x = a[0] + (b[0] - a[0]) * t2, y = a[1] + (b[1] - a[1]) * t2 - 14 * s;
        var xd = a[0] + (b[0] - a[0]) * Math.max(0, t2 - .22);
        var yd = a[1] + (b[1] - a[1]) * Math.max(0, t2 - .22) - 14 * s;
        var gocBay = Math.atan2(b[1] - a[1], b[0] - a[0]);
        var veDan = G.veDan && G.veDan(ctx, DAN_LOP[h.lop] || 'thuong', x, y, 15 * s, gocBay);
        if (!veDan) {
          ctx.strokeStyle = mau; ctx.lineWidth = Math.max(1.5, 3 * s); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(xd, yd); ctx.lineTo(x, y); ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(x, y, Math.max(1.6, 2.6 * s), 0, 7); ctx.fill();
        }
        /* tới nơi thì loé một chùm tia lửa ở chỗ trúng */
        if (t2 >= 1 && G.veFX) {
          G.veFX(ctx, 'dam', b[0], b[1] - 14 * s, 26 * s, Math.floor((tuoi - .38) * 12));
        }

      } else if (h.loai === 'chem') {
        /* Vệt chém: sprite lưỡi đao xoay đúng hướng đánh. Trước đây chỉ là một cung
           tròn vẽ tay nên đòn cận chiến trông như cái vòng, không ra nhát chém. */
        var cx = h.x2 != null ? b[0] : a[0], cy = (h.x2 != null ? b[1] : a[1]) - 14 * s;
        var okChem = G.veFX && G.veFX(ctx, 'chem', cx + Math.cos(h.goc) * 10 * s,
          cy + Math.sin(h.goc) * 10 * s, 52 * s, Math.floor(tuoi * 5), h.goc);
        if (!okChem) {
          var r = 26 * s * (0.6 + tuoi * 0.7);
          ctx.strokeStyle = mau; ctx.lineWidth = Math.max(2, 5 * s * (1 - tuoi));
          ctx.beginPath(); ctx.arc(cx, cy, r, h.goc - 0.9, h.goc + 0.9); ctx.stroke();
        }

      } else if (h.loai === 'tia') {
        /* trụ bắn: tia thẳng, dày rồi mảnh dần, kèm viên đạn năng lượng bay dọc theo */
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

      } else if (h.loai === 'chieu' || h.loai === 'cuoi') {
        var lon = h.loai === 'cuoi';
        if (h.dien) {
          /* vòng loang trên mặt đất */
          var rr = (lon ? 78 : 52) * s * (0.35 + tuoi);
          ctx.save(); ctx.translate(a[0], a[1]); ctx.scale(1, .45);
          ctx.beginPath(); ctx.arc(0, 0, rr, 0, 7);
          ctx.strokeStyle = h.pt ? '#c89bff' : mau;
          ctx.lineWidth = Math.max(2, (lon ? 8 : 5) * s * (1 - tuoi));
          ctx.stroke();
          ctx.fillStyle = (h.pt ? 'rgba(200,155,255,' : 'rgba(125,227,255,') + (0.16 * (1 - tuoi)) + ')';
          ctx.fill();
          ctx.restore();
        } else {
          /* tia phóng tới mục tiêu + chớp sáng ở đích */
          ctx.strokeStyle = h.pt ? '#c89bff' : mau;
          ctx.lineWidth = Math.max(2, (lon ? 9 : 5) * s * (1 - tuoi));
          ctx.beginPath();
          ctx.moveTo(a[0], a[1] - 20 * s); ctx.lineTo(b[0], b[1] - 16 * s);
          ctx.stroke();
          var rc = (lon ? 34 : 20) * s * (0.5 + tuoi);
          ctx.beginPath(); ctx.arc(b[0], b[1] - 16 * s, rc, 0, 7);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.4, 2.5 * s * (1 - tuoi));
          ctx.stroke();
        }
        if (lon && tuoi < .5 && G.veFX) {
          G.veFX(ctx, 'no', b[0], b[1] - 20 * s, 90 * s, Math.floor(tuoi * 10));
        }
        if (h.hoi && G.veFX) G.veFX(ctx, 'hoi', b[0], b[1] - 24 * s, 56 * s, Math.floor(tuoi * 8));
        if (h.chan && G.veFX) G.veFX(ctx, 'chan', b[0], b[1] - 24 * s, 62 * s, Math.floor(tuoi * 8));
      }
      ctx.globalAlpha = 1;
    });
  }

  function mauLop(l) {
    return { can: '#e8a35a', xa: '#6fc4f0', phep: '#b08af0', ho: '#5fe0b0', sat: '#ff8fb0' }[l] || '#ccc';
  }

  function thanhMau(x, y, w, p, mau) {
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(x - w / 2, y, w, 3.5);
    ctx.fillStyle = mau;
    ctx.fillRect(x - w / 2, y, w * G.kep(p, 0, 1), 3.5);
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

        var tren = G.el('div.the-tren');
        var a = G.oAnhTuong && G.oAnhTuong(n.tuong.id, 26);
        if (a) { a.className = 'the-anh'; tren.appendChild(a); }
        tren.appendChild(G.el('div.the-ten', { text: 'Lv' + n.cap + ' ' + n.ten }));
        tren.appendChild(G.el('div.the-kda', { text: n.k + '/' + n.d + '/' + n.a }));
        d.appendChild(tren);

        var th = G.el('div.the-mau');
        th.appendChild(G.el('i', { style: 'width:' + G.kep(n.hp / n.hpMax * 100, 0, 100) + '%;background:' +
          (doi === 'xanh' ? '#3ddc97' : '#e5484d') }));
        d.appendChild(th);

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
    var W = 150, H = 150;
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
