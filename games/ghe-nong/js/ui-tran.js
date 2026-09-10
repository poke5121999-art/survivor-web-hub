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
    veTren();
    veMini();
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
  function toaDo(x, y) {
    var s = Math.min(canvas.width, canvas.height) / 1000;
    var ox = (canvas.width - 1000 * s) / 2, oy = (canvas.height - 1000 * s) / 2;
    return [ox + x * s, oy + y * s, s];
  }

  function veBanDo() {
    if (!canvas) return;
    if (!ctx) ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;

    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, W, H);

    var p0 = toaDo(0, 0), s = p0[2];
    /* nền rừng */
    var g = ctx.createLinearGradient(p0[0], p0[1], p0[0] + 1000 * s, p0[1] + 1000 * s);
    g.addColorStop(0, '#16301f'); g.addColorStop(0.5, '#12261a'); g.addColorStop(1, '#16301f');
    ctx.fillStyle = g;
    ctx.fillRect(p0[0], p0[1], 1000 * s, 1000 * s);

    /* Sông chạy theo đường chéo CÒN LẠI — tức là cắt ngang đường giữa, không nằm trùng
       lên nó. Vẽ trùng thì đường giữa biến mất dưới dải xanh, chụp ảnh màn trận là thấy ngay.
       Đi qua đúng chỗ hai con quái lớn đứng (300,300) và (700,700), giống mọi bản đồ MOBA. */
    ctx.strokeStyle = 'rgba(74,157,248,.16)'; ctx.lineWidth = 62 * s;
    ctx.beginPath();
    var sa = toaDo(30, 30), sb = toaDo(970, 970);
    ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]);
    ctx.stroke();

    /* đường */
    ['tren', 'giua', 'duoi'].forEach(function (lane) {
      var wp = G.SIM_DUONG[lane];
      ctx.strokeStyle = '#2c4a35'; ctx.lineWidth = 34 * s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      wp.forEach(function (p, i) {
        var q = toaDo(p[0], p[1]);
        if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
      });
      ctx.stroke();
      ctx.strokeStyle = '#3a6045'; ctx.lineWidth = 22 * s;
      ctx.stroke();
    });

    /* quái rừng */
    tran.quai.forEach(function (q) {
      if (!q.song) return;
      var p = toaDo(q.x, q.y);
      if (!G.veQuai || !G.veQuai(ctx, 'bai', p[0], p[1] + 3, 18, Math.floor(tran.t * 2 + q.i))) {
        ctx.fillStyle = '#5a4a2a';
        ctx.beginPath(); ctx.arc(p[0], p[1], 6 * s * 1.6, 0, 7); ctx.fill();
      }
    });

    /* quái lớn */
    ['rong', 'chua'].forEach(function (k) {
      var q = tran.quaiLon[k];
      var p = toaDo(q.x, q.y);
      if (q.song) {
        if (!G.veQuai || !G.veQuai(ctx, k, p[0], p[1] + 10, 44, Math.floor(tran.t * 2))) {
          ctx.fillStyle = k === 'rong' ? '#7a3f8f' : '#8f3f3f';
          ctx.beginPath(); ctx.arc(p[0], p[1], 15 * s * 1.6, 0, 7); ctx.fill();
          ctx.strokeStyle = '#ffd76e'; ctx.lineWidth = 2; ctx.stroke();
        }
        thanhMau(p[0], p[1] - 20 * s, 36 * s, q.hp / q.hpMax, '#ffd76e');
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p[0], p[1], 13 * s * 1.6, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.font = (10) + 'px system-ui'; ctx.textAlign = 'center';
        var con = Math.max(0, Math.ceil(q.hienRa - tran.t));
        ctx.fillText(dinhDangGio(con), p[0], p[1] + 3);
      }
    });

    /* trụ */
    tran.tru.forEach(function (r) {
      if (!r.song) return;
      var p = toaDo(r.x, r.y);
      var w = (r.loi ? 22 : r.nha ? 16 : 12) * s * 1.6;
      ctx.fillStyle = r.doi === 'xanh' ? '#1d5f8f' : '#8f2d33';
      ctx.fillRect(p[0] - w / 2, p[1] - w / 2, w, w);
      ctx.strokeStyle = r.doi === 'xanh' ? '#7fd6ff' : '#ff9ec4';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p[0] - w / 2, p[1] - w / 2, w, w);
      if (r.hp < r.hpMax) thanhMau(p[0], p[1] - w / 2 - 5, w * 1.3, r.hp / r.hpMax, r.doi === 'xanh' ? '#7fd6ff' : '#ff9ec4');
    });

    /* lính */
    tran.linh.forEach(function (l) {
      var p = toaDo(l.x, l.y);
      ctx.fillStyle = l.doi === 'xanh' ? 'rgba(127,214,255,.85)' : 'rgba(255,158,196,.85)';
      ctx.beginPath(); ctx.arc(p[0], p[1], (l.xa ? 2.4 : 3) * s * 1.6, 0, 7); ctx.fill();
    });

    /* tướng */
    tran.nguoi.forEach(function (n) {
      if (n.chet > 0) return;
      var p = toaDo(n.x, n.y);
      var r = 7 * s * 1.6;
      /* vòng đội dưới chân */
      ctx.save();
      ctx.scale(1, 0.45);
      ctx.beginPath(); ctx.arc(p[0], (p[1] + 2) / 0.45, r + 3, 0, 7);
      ctx.fillStyle = n.doi === 'xanh' ? 'rgba(61,220,151,.35)' : 'rgba(229,72,77,.35)';
      ctx.fill();
      ctx.restore();

      var khung = Math.floor(tran.t * 3 + n.i * 1.3);
      var lat = n.mucTieu && n.mucTieu.x < n.x;
      if (!G.veTuong || !G.veTuong(ctx, n.tuong.id, p[0], p[1] + 4, 30, khung, lat)) {
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7);
        ctx.fillStyle = mauLop(n.tuong.lop);
        ctx.fill();
        ctx.strokeStyle = n.doi === 'xanh' ? '#3ddc97' : '#e5484d';
        ctx.lineWidth = 2; ctx.stroke();
      }
      thanhMau(p[0], p[1] - r - 6, 26 * s * 1.6, n.hp / n.hpMax, n.doi === 'xanh' ? '#3ddc97' : '#e5484d');
      ctx.fillStyle = '#fff'; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(n.ten + ' ' + n.cap, p[0], p[1] + r + 10);
      if (n.kc > 0) {
        ctx.strokeStyle = '#ffd76e'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p[0], p[1], r + 6, 0, 7); ctx.stroke();
      }
    });

    /* số sát thương bay lên */
    tran.bay.forEach(function (b) { bayHD.push(b); });
    tran.bay.length = 0;
    bayHD = bayHD.filter(function (b) { return tran.t - b.t < 1.1; });
    bayHD.forEach(function (b) {
      var p = toaDo(b.x, b.y);
      var tuoi = (tran.t - b.t) / 1.1;
      ctx.globalAlpha = 1 - tuoi;
      ctx.fillStyle = b.loai === 'pt' ? '#c89bff' : b.loai === 'hoi' ? '#7de3a0' : b.loai === 'ne' ? '#c8d3e0' : '#ffb36b';
      ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(b.chu, p[0], p[1] - 14 - tuoi * 22);
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

  function veThe() {
    var e = G.$('#tr-the'); if (!e) return;
    G.xoa(e);
    ['xanh', 'do'].forEach(function (doi) {
      var cot = G.el('div.the-cot');
      tran.nguoi.filter(function (n) { return n.doi === doi; }).forEach(function (n) {
        var d = G.el('div.the-nguoi' + (n.chet > 0 ? '.chet' : ''));
        d.appendChild(G.el('div.the-ten', { text: 'Lv' + n.cap + ' ' + n.ten }));
        var th = G.el('div.the-mau');
        th.appendChild(G.el('i', { style: 'width:' + G.kep(n.hp / n.hpMax * 100, 0, 100) + '%;background:' +
          (doi === 'xanh' ? '#3ddc97' : '#e5484d') }));
        d.appendChild(th);
        var do_ = G.el('div.the-do');
        for (var i = 0; i < 4; i++) {
          var m = n.do[i];
          do_.appendChild(G.el('span' + (m ? '.co' : ''), { title: m ? G.TB_THEO_ID[m].ten : '',
            style: m ? 'background:' + G.NHANH_MAU[G.TB_THEO_ID[m].nhanh] : '' }));
        }
        d.appendChild(do_);
        if (n.chet > 0) d.appendChild(G.el('div.the-hs', { text: Math.ceil(n.chet) + 's' }));
        cot.appendChild(d);
      });
      e.appendChild(cot);
    });
  }

  function veMini() {
    var c = G.$('#tr-mini'); if (!c) return;
    var x = c.getContext('2d');
    x.fillStyle = '#0e1a12'; x.fillRect(0, 0, 150, 150);
    var s = 150 / 1000;
    tran.tru.forEach(function (r) {
      if (!r.song) return;
      x.fillStyle = r.doi === 'xanh' ? '#2b8fd6' : '#c8393e';
      x.fillRect(r.x * s - 2, r.y * s - 2, 4, 4);
    });
    tran.nguoi.forEach(function (n) {
      if (n.chet > 0) return;
      x.fillStyle = n.doi === 'xanh' ? '#3ddc97' : '#e5484d';
      x.beginPath(); x.arc(n.x * s, n.y * s, 3, 0, 7); x.fill();
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
