/* sim.js — bộ mô phỏng trận đấu 5v5.

   Nguyên tắc gốc, bê thẳng từ Teamfight Manager 2 (RESEARCH.md §2.2):
   **chỉ số của người chơi KHÔNG cộng vào sát thương — nó đổi cách người đó ra quyết định.**
   Sát thương là của tướng và của đồ. NÃO thấp thì đi rồng sai giờ; LÌ thấp thì thua ba mạng
   là co rúm; CƠ thấp thì né chiêu kém, đánh hụt lính.

   Nhịp: một tick = 0.25 giây trong trận. Trận dài 22–34 phút tuỳ nhịp giải.
   Bản đồ toạ độ 0..1000, nhà xanh góc dưới trái, nhà đỏ góc trên phải.

   Mọi thứ ở đây là số. Vẽ nằm ở ui-tran.js. Có thể chạy toàn bộ trận không vẽ một khung nào
   (nút "xem kết quả luôn") — đó là lý do hai phần tách hẳn nhau.
*/
(function (G) {
  'use strict';

  var TICK = 0.25;                 /* giây trong trận cho mỗi tick */
  var NHA = { xanh: [120, 880], do: [880, 120] };

  /* ── đường đi ── */
  /* Ba đường phải ĐỐI XỨNG QUA ĐƯỜNG CHÉO y = x: điểm thứ i lật (x,y)→(y,x) phải
     trùng điểm thứ (n−1−i) của chính đường đó. Có vậy chỗ đứng của người đi đường trên bên
     xanh mới là ảnh gương của người đi đường trên bên đỏ.

     Bản cũ lệch chỉ vài chục điểm ảnh, trông thì cân, nhưng đo bằng máy thì kèo gương
     tuyệt đối xanh chỉ thắng 8/30. Sai số hình học nằm dưới ba mươi phút đánh nhau thì không
     triệt tiêu, nó cộng dồn. */
  var DUONG = {
    tren: [[120, 880], [120, 620], [120, 360], [140, 140], [360, 120], [620, 120], [880, 120]],
    giua: [[120, 880], [280, 720], [420, 580], [500, 500], [580, 420], [720, 280], [880, 120]],
    duoi: [[120, 880], [360, 900], [620, 900], [860, 860], [900, 620], [900, 360], [880, 120]]
  };

  /* trụ: [lane, phần trăm dọc đường, đội] — 2 trụ + 1 trụ lõi mỗi bên */
  var TRU = [
    ['tren', 0.22, 'xanh'], ['tren', 0.40, 'xanh'],
    ['giua', 0.22, 'xanh'], ['giua', 0.40, 'xanh'],
    ['duoi', 0.22, 'xanh'], ['duoi', 0.40, 'xanh'],
    ['tren', 0.78, 'do'], ['tren', 0.60, 'do'],
    ['giua', 0.78, 'do'], ['giua', 0.60, 'do'],
    ['duoi', 0.78, 'do'], ['duoi', 0.60, 'do']
  ];

  /* bãi quái rừng: [x, y, đội nào gần hơn] */
  var BAI = [
    [300, 700, 'xanh'], [240, 540, 'xanh'], [420, 780, 'xanh'], [180, 420, 'xanh'],
    /* lật qua đường chéo y = x của bốn bãi trên, không được đặt tay */
    [700, 300, 'do'], [540, 240, 'do'], [780, 420, 'do'], [420, 180, 'do']
  ];

  /* hai quái lớn — tên lấy tinh thần của Serpen / Morgard trong Teamfight Manager 2 */
  var QUAI_LON = {
    rong:  { ten: 'Rồng', x: 700, y: 700, hp: 4200, atk: 70, dau: 180, lap: 120, vang: 120, exp: 45 },
    chua:  { ten: 'Chúa Hang', x: 300, y: 300, hp: 9000, atk: 105, dau: 420, lap: 300, vang: 320, exp: 90 }
  };

  function xa(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function xaXY(x1, y1, x2, y2) { var dx = x1 - x2, dy = y1 - y2; return Math.sqrt(dx * dx + dy * dy); }

  /** điểm trên đường theo tỉ lệ 0..1 */
  function diemTren(lane, t) {
    var wp = DUONG[lane];
    var tong = 0, i, d = [];
    for (i = 1; i < wp.length; i++) { var l = xaXY(wp[i][0], wp[i][1], wp[i - 1][0], wp[i - 1][1]); d.push(l); tong += l; }
    var can = t * tong;
    for (i = 0; i < d.length; i++) {
      if (can <= d[i]) {
        var k = d[i] ? can / d[i] : 0;
        return [wp[i][0] + (wp[i + 1][0] - wp[i][0]) * k, wp[i][1] + (wp[i + 1][1] - wp[i][1]) * k];
      }
      can -= d[i];
    }
    return wp[wp.length - 1].slice();
  }

  /* ══════════════════════════════════════════════════════════
     TẠO TRẬN
     cau = {
       ta:  { ten, mau, nguoi: [ {vt, tuyenthuId, tuongId, tt:'SSR', nao, co, ben, luc, li, chat, ego, ten} ×5 ],
              heso: {…}, chienThuat: {…} }
       dich:{ … }  (giống hệt)
       nhip: 'chop'|'ngan'|'dai'|'sieu'
     }
     ══════════════════════════════════════════════════════════ */
  G.taoTran = function (cau, hat) {
    var rng = G.Rng(hat || (Date.now() & 0x7fffffff));
    var dai = { chop: 20 * 60, ngan: 26 * 60, dai: 32 * 60, sieu: 40 * 60 }[cau.nhip || 'ngan'];

    var tran = {
      rng: rng, t: 0, tick: 0, daiToiDa: dai, xong: false, thang: null,
      cau: cau,
      nguoi: [], linh: [], tru: [], quai: [], quaiLon: {},
      suKien: [], thoai: [], bay: [],
      vang: { xanh: 0, do: 0 }, mang: { xanh: 0, do: 0 },
      truHa: { xanh: 0, do: 0 }, rongHa: { xanh: 0, do: 0 }, chuaHa: { xanh: 0, do: 0 },
      chart: [], buff: { xanh: {}, do: {} },
      songLinh: 0
    };

    ['ta', 'dich'].forEach(function (ben) {
      var doi = ben === 'ta' ? 'xanh' : 'do';
      cau[ben].nguoi.forEach(function (n, i) {
        var t = G.TUONG_THEO_ID[n.tuongId];
        var cs = G.tuongOCap(t, 1);
        var heTT = G.TT_THEO_ID[n.tt || 'SR'].heso;
        var v = diemTren(n.vt === 'rung' ? 'giua' : (n.vt === 'ho' ? 'duoi' : n.vt), doi === 'xanh' ? 0.06 : 0.94);
        tran.nguoi.push({
          i: tran.nguoi.length, doi: doi, ben: ben, vt: n.vt,
          tuong: t, ten: n.ten, ttId: n.tuyenthuId,
          tt: n.tt || 'SR', heTT: heTT,
          chat: n.chat || ['thu'], ego: n.ego == null ? 40 : n.ego,
          cs: n.cs || { co: 600, ben: 600, luc: 600, li: 600, nao: 600 },
          heso: cau[ben].heso || {},
          cap: 1, exp: 0, vang: 500, do: [],
          hp: cs.hp * heTT * (1 + 0.14 * G.kep((n.cs && n.cs.ben || 0) / 1200, 0, 1)),
          hpMax: cs.hp * heTT * (1 + 0.14 * G.kep((n.cs && n.cs.ben || 0) / 1200, 0, 1)),
          x: v[0], y: v[1], nha: NHA[doi].slice(),
          cd: { chieu: 0, cuoi: 0 }, danh: 0,
          k: 0, d: 0, a: 0, dmg: 0, nhan: 0, hoi: 0,
          chet: 0, veNha: false, mucTieu: null, dem: 0,
          buff: [], dot: [], hieu: {}, kc: 0, cham: 0, lanCuoi: 0
        });
      });
    });

    /* trụ */
    TRU.forEach(function (r) {
      var p = diemTren(r[0], r[2] === 'xanh' ? r[1] : r[1]);
      tran.tru.push({ lane: r[0], doi: r[2], t: r[1], x: p[0], y: p[1],
        hp: 4800, hpMax: 4800, giap: 95, khang: 95, atk: 190, tam: 130, danh: 0, song: true });
    });
    /* hai trụ nhà + lõi */
    ['xanh', 'do'].forEach(function (d) {
      var n = NHA[d];
      tran.tru.push({ lane: 'nha', doi: d, x: n[0] + (d === 'xanh' ? 70 : -70), y: n[1] + (d === 'xanh' ? -70 : 70),
        hp: 6200, hpMax: 6200, giap: 120, khang: 120, atk: 240, tam: 150, danh: 0, song: true, nha: true });
      tran.tru.push({ lane: 'loi', doi: d, x: n[0], y: n[1],
        hp: 8200, hpMax: 8200, giap: 140, khang: 140, atk: 180, tam: 140, danh: 0, song: true, loi: true });
    });

    /* quái rừng */
    BAI.forEach(function (b, i) {
      tran.quai.push({ i: i, x: b[0], y: b[1], gan: b[2], hp: 900, hpMax: 900, atk: 40,
        song: true, hoi: 0, vang: 55, exp: 70 });
    });
    /* quái lớn */
    for (var k in QUAI_LON) {
      var q = QUAI_LON[k];
      tran.quaiLon[k] = { id: k, ten: q.ten, x: q.x, y: q.y, hp: 0, hpMax: q.hp, atk: q.atk,
        song: false, hienRa: q.dau, vang: q.vang, exp: q.exp, lap: q.lap, lan: 0 };
    }

    return tran;
  };

  /* ══════════════════ tiện ích ══════════════════ */

  /* Đọc năm chỉ số của huấn luyện viên vào thân thể tuyển thủ.

     Trước đây chỉ CƠ, LÌ, NÃO được dùng, và chỉ để nắn ngưỡng ra quyết định. LỰC và
     BỀN không xuất hiện một lần nào trong sim — tức là hai trong năm giáo án là tập không công,
     trái hẳn §2.1 của DESIGN.md. Đo bằng máy thì lộ ra ngay: cả mùa nuôi quân gần như
     không đổi được kết quả trận.

     Vẫn giữ tinh thần "chỉ số đổi quyết định, không đổi số sát thương" của Teamfight Manager:
     biên ở đây hẹp (±14%), nhỏ hơn nhiều so với cái mà một quyết định macro sai giá phải trả. */
  function heLuc(n) { return 0.86 + 0.28 * G.kep((n.cs && n.cs.luc || 0) / 1200, 0, 1); }
  function heBen(n) { return 1 + 0.14 * G.kep((n.cs && n.cs.ben || 0) / 1200, 0, 1); }
  function heCo(n) { return 1 + 0.12 * G.kep((n.cs && n.cs.co || 0) / 1200, 0, 1); }
  /** tụt sức cuối trận: từ phút 18 trở đi mỗi phút mất 1.5% sức đánh, BỀN cao thì gần như không mất */
  function heCuoiTran(n) {
    var thua = ((n.tTran || 0) - 18 * 60) / 60;
    if (thua <= 0) return 1;
    return 1 - Math.min(0.25, thua * 0.015 * (1 - G.kep((n.cs && n.cs.ben || 0) / 1200, 0, 1)));
  }
  G.heBenNguoi = heBen;

  function chiSoNguoi(n) {
    var cs = G.tuongOCap(n.tuong, n.cap);
    var d = G.congDo(n.do);
    var he = n.heTT;
    var b = { atk: 0, ap: 0, hp: 0, giap: 0, khang: 0, tocdanh: 0, tocchay: 0 };
    n.buff.forEach(function (x) { for (var k in x.cs) b[k] = (b[k] || 0) + x.cs[k]; });
    var kL = heLuc(n) * heCuoiTran(n);

    return {
      atk: ((cs.atk + d.atk) * he + b.atk) * kL,
      ap: ((cs.ap + d.ap) * he + b.ap) * kL,
      hpMax: (cs.hp + d.hp) * he * heBen(n),
      giap: (cs.giap + d.giap) * he * (1 + (b.giap || 0)),
      khang: (cs.khang + d.khang) * he * (1 + (b.khang || 0)),
      tam: cs.tam,
      tocdanh: cs.tocdanh * (1 + d.tocdanh + (b.tocdanh || 0)) * heCo(n),
      tocchay: cs.tocchay * (1 + d.tocchay + (b.tocchay || 0)) * (n.cham > 0 ? 0.65 : 1),
      hut: d.hut, dac: d.dac
    };
  }

  /** hệ số đội theo kỹ năng huấn luyện viên, giai đoạn trận, và tình thế */
  function hesoDoi(tran, doi, loai) {
    var ben = doi === 'xanh' ? 'ta' : 'dich';
    var h = tran.cau[ben].heso || {};
    var pha = tran.t < 600 ? 'dau' : tran.t < 1320 ? 'giua' : 'cuoi';
    var cheech = (tran.vang[doi] - tran.vang[doi === 'xanh' ? 'do' : 'xanh']);
    var the = cheech < -1500 ? 'thua' : cheech > 1500 ? 'thang' : null;

    var v = 1;
    (h.ds || []).forEach(function (k) {
      if (k.loai !== loai) return;
      if (k.pha !== 'luon' && k.pha !== pha) return;
      if (k.dk && k.dk !== the) return;
      v += k.muc;
    });
    return v;
  }

  function satThuong(tran, ke, bi, luong, loai, ghiNhan) {
    var csK = chiSoNguoi ? null : null;
    var giam;
    var csB = bi.tuong ? chiSoNguoi(bi) : { giap: bi.giap || 0, khang: bi.khang || 0 };
    if (loai === 'pt') {
      var kh = csB.khang || 0;
      if (ke.tuong && ke.do && ke.do.indexOf('ngoc3') >= 0) kh *= 0.8;
      giam = 100 / (100 + kh);
    } else {
      var gi = csB.giap || 0;
      if (ke.tuong && ke.do && ke.do.indexOf('luoi4') >= 0) gi *= 0.75;
      giam = 100 / (100 + gi);
    }
    var thuc = luong * giam;

    if (ke.tuong) thuc *= hesoDoi(tran, ke.doi, 'sat');
    if (bi.tuong) thuc /= hesoDoi(tran, bi.doi, 'chiu');

    /* Người khó giết hơn lính rất nhiều. Không có dòng này thì cả đội tan trong 2 giây và
       một trận ra 130 mạng — đo bằng máy, xem ghi chép cân bằng cuối file. */
    if (bi.tuong) thuc *= 0.22;

    if (bi.tuong && bi.hieu) {
      if (bi.hieu.giamNhan) thuc *= (1 - (bi.mucGiamNhan || 0.25));      /* Hiệp Sĩ: Chốt Chặn */
      if (bi.hieu.chan1) { delete bi.hieu.chan1; thuc = 0; }             /* Tử Chiến: Phản Kích */
      if (bi.hieu.chanPhep && loai === 'pt') { delete bi.hieu.chanPhep; thuc = 0; }  /* đồ Quạ Hoàng Hôn */
    }
    /* đồ Trọng Giáp Hắc Kỵ: phản 12% sát thương vật lý */
    if (bi.tuong && loai === 'vl' && ke.tuong && bi.do && bi.do.indexOf('thep3') >= 0) {
      ke.hp -= thuc * 0.12;
    }
    /* đồ Thành Trì Bất Khả: xuống dưới 30% máu thì bật một lá chắn lớn, 90 giây một lần */
    if (bi.tuong && bi.do && bi.do.indexOf('thep4') >= 0 && (bi.hp - thuc) < bi.hpMax * 0.3 &&
        (!bi.chanKhiThap || tran.t - bi.chanKhiThap > 90)) {
      bi.chanKhiThap = tran.t;
      bi.hp += bi.hpMax * 0.22;
      tran.bay.push({ x: bi.x, y: bi.y, chu: 'chắn!', loai: 'hoi', t: tran.t });
    }

    bi.hp -= thuc;
    /* Cuồng Chiến: Không Lùi — không tụt xuống dưới 1 máu trong mấy giây */
    if (bi.tuong && bi.hieu && bi.hieu.batTu && bi.hp < 1) bi.hp = 1;
    if (ke.tuong) { ke.dmg += thuc; ke.lanCuoi = tran.t; }
    if (bi.tuong) bi.nhan += thuc;

    if (ghiNhan !== false && bi.tuong) {
      tran.bay.push({ x: bi.x, y: bi.y, chu: Math.round(thuc), loai: loai, t: tran.t });
    }
    /* hút máu */
    if (ke.tuong && ke.hutTam) { }
    return thuc;
  }

  /* ══════════════════ độc / cháy theo thời gian ══════════════════
     Nỏ Độc sống bằng cái này: đánh thường cộng tầng độc, chiêu cuối kích nổ hết. Không có
     phần này thì con nó chỉ là một xạ thủ yếu — đúng cái bẫy đã sập lần đo cân bằng đầu tiên,
     khi mọi nội tại còn nằm trong dữ liệu mà bộ mô phỏng chưa đọc. */
  function themDot(ke, bi, d, cs) {
    if (!bi.dot) bi.dot = [];
    var cu = null;
    bi.dot.forEach(function (x) { if (x.nguon === ke.i) cu = x; });
    var moi = (d.g || 0) * (d.loai === 'pt' ? cs.ap : cs.atk) + (d.c || 0);
    if (cu) {
      cu.tang = Math.min(cu.tang + 1, d.congDon || 1);
      cu.conLai = d.giay;
      cu.moiGiay = moi;
    } else {
      bi.dot.push({ nguon: ke.i, tang: 1, moiGiay: moi, conLai: d.giay, loai: d.loai || 'pt' });
    }
  }

  function apDot(tran, n) {
    if (!n.dot || !n.dot.length) return;
    n.dot = n.dot.filter(function (d) {
      var ke = tran.nguoi[d.nguon] || { doi: n.doi === 'xanh' ? 'do' : 'xanh' };
      var luong = d.moiGiay * d.tang * TICK;
      var truoc = n.hp;
      satThuong(tran, ke, n, luong, d.loai, false);
      if (n.hp <= 0 && truoc > 0) n.dotAi = ke;
      d.conLai -= TICK;
      return d.conLai > 0;
    });
  }

  /* ══════════════════ CHỌN HÀNH ĐỘNG ══════════════════
     Đây là chỗ chỉ số của huấn luyện viên và chất chơi của tuyển thủ nói chuyện với nhau.
     nghe_lệnh = 0.55 + 0.40×(NÃO/1200) − 0.35×(cái tôi/100)   (DESIGN.md §3.5)          */

  function ngheLenh(n) {
    return G.kep(0.55 + 0.40 * (n.cs.nao / 1200) - 0.35 * (n.ego / 100), 0.1, 0.98);
  }

  function laneCua(n) {
    return n.vt === 'rung' ? 'giua' : (n.vt === 'ho' ? 'duoi' : n.vt);
  }

  function dichGanNhat(tran, n, banKinh) {
    var g = null, gd = 1e9;
    tran.nguoi.forEach(function (m) {
      if (m.doi === n.doi || m.chet > 0) return;
      var d = xa(n, m);
      if (d < gd) { gd = d; g = m; }
    });
    if (banKinh && gd > banKinh) return null;
    return g;
  }

  function linhGanNhat(tran, n, banKinh) {
    var g = null, gd = banKinh || 1e9;
    tran.linh.forEach(function (l) {
      if (l.doi === n.doi || l.hp <= 0) return;
      var d = xaXY(n.x, n.y, l.x, l.y);
      if (d < gd) { gd = d; g = l; }
    });
    return g;
  }

  function truGanNhat(tran, n, banKinh) {
    var g = null, gd = banKinh || 1e9;
    tran.tru.forEach(function (r) {
      if (r.doi === n.doi || !r.song) return;
      /* trụ sau chỉ đánh được khi trụ trước đã đổ */
      if (!trongTamDanh(tran, r)) return;
      var d = xaXY(n.x, n.y, r.x, r.y);
      if (d < gd) { gd = d; g = r; }
    });
    return g;
  }

  function trongTamDanh(tran, r) {
    if (r.lane === 'nha' || r.lane === 'loi') {
      /* nhà chỉ mở khi mất hết trụ ngoài của ít nhất một đường */
      var conNgoai = tran.tru.some(function (x) { return x.doi === r.doi && x.song && x.lane !== 'nha' && x.lane !== 'loi'; });
      if (r.lane === 'loi') {
        var conNha = tran.tru.some(function (x) { return x.doi === r.doi && x.song && x.lane === 'nha'; });
        return !conNha;
      }
      return !conNgoai || soTruSongCuaLane(tran, r.doi) === 0;
    }
    /* trụ trong chỉ mở khi trụ ngoài cùng đường đã đổ */
    var ngoai = tran.tru.filter(function (x) { return x.doi === r.doi && x.lane === r.lane && x.song; });
    if (!ngoai.length) return true;
    /* trụ gần nhà mình nhất là trụ phải giữ; đội tấn công phải phá trụ xa nhà địch trước */
    var thuTu = ngoai.slice().sort(function (a, b) {
      return r.doi === 'xanh' ? (a.t - b.t) : (b.t - a.t);
    });
    return thuTu[thuTu.length - 1] === r;
  }

  function soTruSongCuaLane(tran, doi) {
    var m = {};
    tran.tru.forEach(function (x) { if (x.doi === doi && x.song && x.lane !== 'nha' && x.lane !== 'loi') m[x.lane] = 1; });
    return Object.keys(m).length;
  }

  /** đội nào đang giao tranh ở đâu — trả về điểm tụ nếu có */
  function diemGiaoTranh(tran, doi) {
    var ds = tran.nguoi.filter(function (m) {
      return m.doi === doi && m.chet <= 0 && tran.t - m.lanCuoi < 4;
    });
    if (ds.length < 2) return null;
    var x = 0, y = 0;
    ds.forEach(function (m) { x += m.x; y += m.y; });
    return { x: x / ds.length, y: y / ds.length, so: ds.length };
  }

  function chonHanhDong(tran, n) {
    var ct = tran.cau[n.ben].chienThuat || {};
    var cs = n.cs;
    var nghe = ngheLenh(n);
    var rng = tran.rng;
    var chat = n.chat;

    /* 1. máu thấp → về nhà. Ngưỡng phụ thuộc LÌ: lì cao thì dám ở lại lâu hơn */
    var nguong = 0.34 - (cs.li / 1200) * 0.16;
    /* thua đậm mà LÌ thấp thì co rúm: ngưỡng vọt lên */
    var cheech = tran.vang[n.doi] - tran.vang[n.doi === 'xanh' ? 'do' : 'xanh'];
    if (cheech < -2000) nguong += (1 - cs.li / 1200) * 0.18;
    if (chat.indexOf('thu') >= 0) nguong += 0.05;
    if (chat.indexOf('lao') >= 0) nguong -= 0.06;

    if (n.hp / n.hpMax < nguong && !n.veNha) { n.veNha = true; }
    /* 0. chín mươi giây đầu chưa có gì để tranh: về đường của mình, ăn lính.
       Không có luật này thì mười người gặp nhau giữa bản đồ ở giây thứ 20 và trận mở màn
       bằng bảy mạng — đo được ở bản chẩn đoán. */
    if (tran.t < 90 && chat.indexOf('lao') < 0) {
      var laneDau = laneCua(n);
      var l0 = linhGanNhat(tran, n, 600);
      if (l0) return { loai: 'farm', x: l0.x, y: l0.y };
      var d0p = diemTren(laneDau, n.doi === 'xanh' ? 0.38 : 0.62);
      return { loai: 'giulane', x: d0p[0], y: d0p[1] };
    }

    /* 0b. địch vừa gãy hai người → chớp thời cơ. Đây là "macro", và NÃO là thứ quyết định
       có nhìn ra thời cơ hay không. Thiếu đoạn này thì hai đội đánh nhau tới hết giờ mà
       không ai đụng vào trụ — 147/300 trận hoà giờ ở bản đo trước. */
    var dichChet = 0;
    tran.nguoi.forEach(function (m) { if (m.doi !== n.doi && m.chet > 6) dichChet++; });
    if (dichChet >= 2 && rng.duoc(0.35 + cs.nao / 1200 * 0.5)) {
      var qLon = null;
      ['chua', 'rong'].forEach(function (k2) { var q2 = tran.quaiLon[k2]; if (!qLon && q2.song && q2.hp > 0) qLon = q2; });
      if (qLon && rng.duoc(0.45)) return { loai: 'quailon', x: qLon.x, y: qLon.y, mt: qLon };
      var tr2 = truGanNhat(tran, n, 1400);
      if (tr2) return { loai: 'daytru', x: tr2.x, y: tr2.y, tru: tr2 };
    }

    /* 1a. đội vừa mất người trong 9 giây qua → lùi lại thở.
       Giao tranh thật kết thúc khi một bên gãy, không phải khi cả mười người nằm xuống. */
    var vuaMat = (tran.matNguoi && tran.matNguoi[n.doi]) || -999;
    if (tran.t - vuaMat < 9 && n.hp / n.hpMax < 0.75 && chat.indexOf('lao') < 0) {
      var lui = diemTren(laneCua(n), n.doi === 'xanh' ? 0.16 : 0.84);
      return { loai: 'rut', x: lui[0], y: lui[1] };
    }

    /* 1a2. tay đôi mà đang lép vế máu → lùi về trụ, đừng cố đấm nốt.
       Đây là chỗ đẻ ra phần lớn số mạng trong bản đo đầu: hai người đứng ở đường đấm nhau
       tới chết vì không ai biết lùi. */
    var soGan = 0, dichGan1 = null;
    tran.nguoi.forEach(function (m) {
      if (m.doi === n.doi || m.chet > 0) return;
      if (xa(n, m) < 210) { soGan++; dichGan1 = m; }
    });
    if (soGan === 1 && dichGan1) {
      var lech = n.hp / n.hpMax - dichGan1.hp / dichGan1.hpMax;
      var gan = 0.15 + (1 - cs.li / 1200) * 0.12;
      if (lech < -gan && chat.indexOf('solo') < 0) {
        var lui2 = diemTren(laneCua(n), n.doi === 'xanh' ? 0.18 : 0.82);
        return { loai: 'rut', x: lui2[0], y: lui2[1] };
      }
    }

    /* 1b. thua quân số tại chỗ → rút.
       Không có đoạn này thì ai cũng đứng lì giữa bản đồ đấm nhau tới chết, và một trận ra
       hơn 120 mạng — đo bằng _tools/canbang.js. NÃO và LÌ quyết định đếm quân có đúng không. */
    var diBo = 0, taBo = 0;
    tran.nguoi.forEach(function (m) {
      if (m.chet > 0) return;
      var d0 = xa(n, m);
      if (d0 > 270) return;
      if (m.doi === n.doi) taBo++; else diBo++;
    });
    var thayDung = 0.45 + cs.nao / 1200 * 0.5;                 /* NÃO thấp thì đếm quân sai */
    if (diBo > taBo && rng.duoc(thayDung)) {
      var soChenh = diBo - taBo;
      var chiuNoi = n.hp / n.hpMax > 0.72 && soChenh === 1 && cs.li / 1200 > 0.6;
      if (!chiuNoi && chat.indexOf('lao') < 0) {
        var veP = diemTren(laneCua(n), n.doi === 'xanh' ? 0.14 : 0.86);
        return { loai: 'rut', x: veP[0], y: veP[1] };
      }
    }

    if (n.veNha) {
      if (xaXY(n.x, n.y, n.nha[0], n.nha[1]) < 60) {
        n.hp = Math.min(n.hpMax, n.hp + n.hpMax * 0.25);
        muaDo(tran, n);
        if (n.hp > n.hpMax * 0.9) n.veNha = false;
      }
      return { loai: 've', x: n.nha[0], y: n.nha[1] };
    }

    /* 2. quái lớn — NÃO quyết định biết trước bao lâu */
    var biet = 4 + (cs.nao / 1200) * 16;
    var mt = null;
    ['chua', 'rong'].forEach(function (k) {
      var q = tran.quaiLon[k];
      if (mt) return;
      if (q.song && q.hp > 0) mt = q;
      else if (!q.song && q.hienRa - tran.t < biet && q.hienRa - tran.t > 0) mt = q;
    });
    if (mt) {
      var muonDi = ct.rong === 'luon' ? 0.9 : ct.rong === 'nhuong' ? 0.15 : 0.55;
      if (chat.indexOf('mt') >= 0) muonDi += 0.35;
      if (n.vt === 'rung') muonDi += 0.25;
      /* nghe lệnh hay tự quyết */
      var p = nghe * muonDi + (1 - nghe) * (chat.indexOf('mt') >= 0 ? 0.85 : 0.3);
      if (rng.duoc(p * 0.35)) return { loai: 'quailon', x: mt.x, y: mt.y, mt: mt };
    }

    /* 3. có giao tranh gần → vào hùa */
    var gt = diemGiaoTranh(tran, n.doi);
    if (gt) {
      var kc = xaXY(n.x, n.y, gt.x, gt.y);
      var thichDanh = chat.indexOf('fight') >= 0 ? 0.9 : chat.indexOf('thu') >= 0 ? 0.35 : 0.6;
      var xa2 = kc < 260 ? 1 : kc < 480 ? 0.55 : 0.18;
      var p2 = (nghe * (ct.mucTieu === 'lao' ? 0.85 : 0.6) + (1 - nghe) * thichDanh) * xa2 * 0.55;
      if (n.hp / n.hpMax < 0.55) p2 *= 0.35;               /* máu mỏng thì đừng lao vào đám đông */
      if (rng.duoc(p2)) return { loai: 'tugiup', x: gt.x, y: gt.y };
    }

    /* 4. đi kèo (gank) — người có chất 'gank' và người đi rừng */
    if ((chat.indexOf('gank') >= 0 || n.vt === 'rung') && tran.t > 90 && tran.t < 1200) {
      var thichGank = ct.rung === 'gank' ? 0.8 : ct.rung === 'cuop' ? 0.35 : 0.4;
      var p3 = nghe * thichGank + (1 - nghe) * (chat.indexOf('gank') >= 0 ? 0.8 : 0.4);
      if (rng.duoc(p3 * 0.04)) {
        var nanNhan = null, gd = 1e9;
        tran.nguoi.forEach(function (m) {
          if (m.doi === n.doi || m.chet > 0) return;
          var d = xa(n, m);
          if (d < gd && d > 120) { gd = d; nanNhan = m; }
        });
        if (nanNhan) return { loai: 'gank', x: nanNhan.x, y: nanNhan.y };
      }
    }

    /* 5. đẩy lẻ — chất 'le' */
    if (chat.indexOf('le') >= 0 && tran.t > 420) {
      var tru = truGanNhat(tran, n, 900);
      if (tru && rng.duoc(0.5)) return { loai: 'daytru', x: tru.x, y: tru.y, tru: tru };
    }

    /* 6. đi rừng thì ăn quái */
    if (n.vt === 'rung') {
      var bai = null, bd = 1e9;
      tran.quai.forEach(function (q) {
        if (!q.song) return;
        var d = xaXY(n.x, n.y, q.x, q.y);
        if (d < bd) { bd = d; bai = q; }
      });
      if (bai) return { loai: 'anquai', x: bai.x, y: bai.y, quai: bai };
    }

    /* 7. mặc định: về đường của mình, đẩy lính */
    var lane = laneCua(n);
    var l = linhGanNhat(tran, n, 700);
    if (l) return { loai: 'farm', x: l.x, y: l.y };
    var tr = truGanNhat(tran, n, 700);
    if (tr) return { loai: 'daytru', x: tr.x, y: tr.y, tru: tr };
    var d2 = diemTren(lane, n.doi === 'xanh' ? 0.42 : 0.58);
    return { loai: 'giulane', x: d2[0], y: d2[1] };
  }

  /* ══════════════════ mua đồ ══════════════════ */
  function muaDo(tran, n) {
    var dich = tran.nguoi.filter(function (m) { return m.doi !== n.doi; });
    var vl = 0, pt = 0;
    dich.forEach(function (m) {
      var cs = G.tuongOCap(m.tuong, m.cap);
      vl += cs.atk; pt += cs.ap * 1.15;
    });
    var tong = vl + pt || 1;

    var cheech = tran.vang[n.doi] - tran.vang[n.doi === 'xanh' ? 'do' : 'xanh'];
    var lan = 0;
    while (lan++ < 3) {
      var id = G.nghiDo({
        vai: n.vt, lopTuong: n.tuong.lop,
        apVL: vl / tong, apPT: pt / tong,
        thua: G.kep(cheech / 6000, -1, 1),
        chat: n.chat, nao: n.cs.nao, daCo: n.do,
        rng: function () { return tran.rng(); }
      });
      if (!id) break;
      var m2 = G.TB_THEO_ID[id];
      /* món ghép: chỉ trả phần chênh */
      var truoc = n.do.filter(function (x) { return G.TB_THEO_ID[x].nhanh === m2.nhanh; });
      var gia = m2.gia;
      if (truoc.length) {
        var cu = truoc[truoc.length - 1];
        gia = Math.max(200, m2.gia - Math.floor(G.TB_THEO_ID[cu].gia * 0.55));
      }
      if (n.vang < gia) break;
      n.vang -= gia;
      if (truoc.length) n.do.splice(n.do.indexOf(truoc[truoc.length - 1]), 1);
      n.do.push(id);
      var cs2 = chiSoNguoi(n);
      n.hpMax = cs2.hpMax; n.hp = Math.min(n.hp + (m2.cs.hp || 0), n.hpMax);
      tran.suKien.push({ t: tran.t, loai: 'do', ai: n.i, mon: id });
    }
  }

  /* ══════════════════ lính ══════════════════ */
  function raLinh(tran) {
    ['tren', 'giua', 'duoi'].forEach(function (lane) {
      ['xanh', 'do'].forEach(function (doi) {
        for (var i = 0; i < 4; i++) {
          var t = doi === 'xanh' ? 0.03 : 0.97;
          var p = diemTren(lane, t);
          var xa2 = i >= 3;
          tran.linh.push({
            doi: doi, lane: lane, t: t, x: p[0] + (i - 1.5) * 8, y: p[1] + (i - 1.5) * 8,
            hp: xa2 ? 380 : 520, hpMax: xa2 ? 380 : 520,
            atk: xa2 ? 34 : 26, tam: xa2 ? 110 : 40, danh: 0,
            giap: 12, khang: 8, vang: xa2 ? 26 : 20, exp: 46, xa: xa2,
            /* bùa Chúa Hang có HẠN: so với đồng hồ trận, không phải chỉ xem có hay không.
               Để nguyên `? 1 : 0` thì đội ăn Chúa Hang đầu tiên có lính mạnh 1.4× tới hết trận — đo được:
               kèo gương mà bên nào ăn Chúa trước thì phá 6.4 trụ, bên kia 3.5. */
            buff: (tran.buff[doi].linh || 0) > tran.t ? 1 : 0
          });
        }
      });
    });
    tran.songLinh++;
  }

  /* ══════════════════ MỘT TICK ══════════════════ */
  G.tickTran = function (tran) {
    if (tran.xong) return;
    var rng = tran.rng;
    tran.tick++;
    tran.t += TICK;

    /* sóng lính mỗi 30 giây */
    if (tran.t >= 30 && Math.floor(tran.t / 30) > tran.songLinh - 1) raLinh(tran);

    /* quái lớn hiện ra */
    ['rong', 'chua'].forEach(function (k) {
      var q = tran.quaiLon[k];
      if (!q.song && tran.t >= q.hienRa) {
        q.song = true; q.hp = q.hpMax * (1 + q.lan * 0.12); q.hpMax = q.hp;
        tran.suKien.push({ t: tran.t, loai: 'quaiHien', quai: k });
      }
    });

    /* quái rừng hồi sinh */
    tran.quai.forEach(function (q) {
      if (!q.song && tran.t >= q.hoi) { q.song = true; q.hp = q.hpMax; }
    });

    /* ── từng người ──
       Thứ tự duyệt phải ĐẢO mỗi tick. Nếu luôn duyệt xanh trước thì xanh luôn ra đòn trước
       trong mọi pha đổi mạng — đo bằng máy: kèo hoàn toàn cân mà xanh thắng 12/12. */
    var thuTu = tran.nguoi.slice();
    /* dấu thời gian để heCuoiTran() biết đang ở phút thứ mấy */
    tran.nguoi.forEach(function (n) { n.tTran = tran.t; });
    if (tran.tick % 2 === 0) thuTu.reverse();
    thuTu.forEach(function (n) {
      if (n.chet > 0) {
        n.chet -= TICK;
        if (n.chet <= 0) {
          n.x = n.nha[0]; n.y = n.nha[1];
          n.hp = n.hpMax; n.veNha = false;
          muaDo(tran, n);
        }
        return;
      }
      apDot(tran, n);
      if (n.hp <= 0) { xuLyChet(tran, n.dotAi || { doi: n.doi === 'xanh' ? 'do' : 'xanh' }, n); return; }
      if (n.kc > 0) { n.kc -= TICK; return; }
      if (n.cham > 0) n.cham -= TICK;
      n.buff = n.buff.filter(function (b) { b.giay -= TICK; return b.giay > 0; });
      for (var hk in n.hieu) { n.hieu[hk] -= TICK; if (n.hieu[hk] <= 0) delete n.hieu[hk]; }

      var cs = chiSoNguoi(n);
      var noi = n.tuong.kn.noi.h;

      /* hồi máu ngoài giao tranh — ai cũng có, đường trên có nhiều nhất (buff vị trí của
         Teamfight Manager 2: hồi 1.5% máu tối đa mỗi giây) */
      if (tran.t - n.lanCuoi > 6) {
        var mucHoi = n.vt === 'tren' ? 0.015 : 0.006;
        if (xaXY(n.x, n.y, n.nha[0], n.nha[1]) < 220) mucHoi = 0.05;   /* trong sân nhà */
        n.hp = Math.min(n.hpMax, n.hp + n.hpMax * mucHoi * TICK);
      }
      if (n.vt === 'rung' && tran.t - n.lanCuoi > 4) cs.tocchay *= 1.2;

      /* nội tại dạng "hào quang": cộng chỉ số cho đồng đội đứng cạnh */
      if (noi.hao && tran.tick % 8 === 0) {
        tran.nguoi.forEach(function (m) {
          if (m.doi !== n.doi || m === n || m.chet > 0 || xa(n, m) > 200) return;
          m.buff.push({ cs: noi.hao, giay: 2.2 });
        });
      }
      /* nội tại của người đi rừng: khoẻ hơn khi đánh quái */
      if (noi.buffRung && tran.t - n.lanCuoi < 3) { cs.giap *= 1 + noi.buffRung.giap; cs.khang *= 1 + noi.buffRung.khang; }
      if (noi.buff && noi.buff.tocchayNgoai && tran.t - n.lanCuoi > 4) cs.tocchay *= 1 + noi.buff.tocchayNgoai;
      if (noi.buff && noi.buff.tocchayRung) cs.tocchay *= 1 + noi.buff.tocchayRung;

      /* quyết định lại mỗi ~1 giây */
      n.dem -= TICK;
      if (n.dem <= 0 || !n.mucTieu) {
        n.mucTieu = chonHanhDong(tran, n);
        n.dem = 0.8 + rng() * 0.6;
      }
      var mt = n.mucTieu;

      /* tìm thứ đánh được trong tầm */
      var muc = null;
      var dichGan = dichGanNhat(tran, n, cs.tam + 30);
      if (dichGan) muc = dichGan;
      if (!muc && mt.quai && mt.quai.song && xaXY(n.x, n.y, mt.quai.x, mt.quai.y) < cs.tam + 30) muc = mt.quai;
      if (!muc && mt.mt && mt.mt.song && xaXY(n.x, n.y, mt.mt.x, mt.mt.y) < cs.tam + 40) muc = mt.mt;
      if (!muc) {
        var l = linhGanNhat(tran, n, cs.tam + 20);
        if (l) muc = l;
      }
      if (!muc && mt.tru && mt.tru.song && xaXY(n.x, n.y, mt.tru.x, mt.tru.y) < cs.tam + 60) muc = mt.tru;

      if (muc) {
        /* đánh thường */
        n.danh -= TICK;
        if (n.danh <= 0) {
          n.danh = 1 / cs.tocdanh;
          var luong = cs.atk, loaiDon = 'vl';

          /* ─── NỘI TẠI (kỹ năng thứ ba của mỗi tướng, luôn bật) ─── */
          n.demDon = (n.demDon || 0) + 1;
          if (noi.moiN && n.demDon % noi.moiN === 0) {
            if (noi.dmg) luong *= (1 + noi.dmg.g);
            if (noi.kc && muc.tuong) muc.kc = Math.max(muc.kc, noi.kc);   /* Pháp Sét: đòn thứ tư gây choáng */
          }
          if (noi.theoMau) {                                              /* Cuồng Chiến */
            var mm = 1 - n.hp / n.hpMax;
            luong *= 1 + Math.min(noi.theoMau.tran, Math.floor(mm / noi.theoMau.moi) * noi.theoMau.cong);
          }
          if (noi.dmgTheoGiap) { luong += cs.giap * noi.dmgTheoGiap; }    /* Thánh Kiếm */
          if (noi.dmgTheoMauDich) {                                       /* Phá Cổ */
            var them2 = (muc.hpMax || 1000) * noi.dmgTheoMauDich;
            if (!muc.tuong) them2 = Math.min(them2, noi.tranQuai || 120);
            luong += them2;
          }
          if (noi.congDon) {                                              /* Xạ Thủ */
            n.congDon = Math.min((n.congDon || 0) + 1, noi.congDon.lan);
            n.hieu.congDon = 3;
          }
          if (n.hieu.congDon && noi.congDon) n.danh = 1 / (cs.tocdanh * (1 + noi.congDon.tocdanh * (n.congDon || 0)));
          else n.congDon = 0;
          if (noi.theoTam) {                                              /* Súng Trường */
            var kc2 = xaXY(n.x, n.y, muc.x, muc.y);
            luong *= 1 + noi.theoTam * G.kep(kc2 / cs.tam, 0, 1);
          }
          if (noi.sauLung && muc.tuong && rng.duoc(0.45)) luong *= 1 + noi.sauLung;   /* Bóng Đêm */
          if (noi.lienDon) {                                              /* Tử Chiến */
            if (n.mucCu === muc) luong *= 1 + noi.lienDon;
            n.mucCu = muc;
          }
          if (noi.themLinh && !muc.tuong) luong *= 1 + noi.themLinh;      /* Bom Xích */

          /* CƠ: đánh hụt (của mình) — người CƠ cao ít hụt hơn */
          if (muc.tuong && rng.duoc(G.kep(0.12 - n.cs.co / 1200 * 0.10, 0.01, 0.14))) luong *= 0.35;

          if (n.hieu.danhTru && !muc.tuong && muc.hpMax >= 3000) luong *= 1 + (n.mucDanhTru || 1.2);
          var thuc = satThuong(tran, n, muc, luong, loaiDon);
          if (cs.hut) n.hp = Math.min(n.hpMax, n.hp + thuc * cs.hut);
          if (n.hieu.hutMau) n.hp = Math.min(n.hpMax, n.hp + n.hpMax * (n.mucHutMau || 0.03));

          /* nội tại gây độc theo thời gian (Pháp Sư, Nỏ Độc) */
          if (noi.dot && muc.tuong) themDot(n, muc, noi.dot, cs);

          /* đồ: Bá Chủ Cuồng Phong văng đòn sang mục tiêu bên cạnh */
          if (cs.dac.indexOf('domino') >= 0 && muc.tuong) {
            var ben2 = null;
            tran.nguoi.forEach(function (m) {
              if (m.doi === n.doi || m === muc || m.chet > 0) return;
              if (xa(muc, m) < 120 && !ben2) ben2 = m;
            });
            if (ben2) satThuong(tran, n, ben2, luong * 0.4, 'vl');
          }
          xuLyChet(tran, n, muc);
        }

        /* chiêu */
        n.cd.chieu -= TICK; n.cd.cuoi -= TICK;
        if (n.cd.chieu <= 0 && muc.hp > 0) {
          dungChieu(tran, n, muc, n.tuong.kn.chieu, cs);
          n.cd.chieu = n.tuong.kn.chieu.hoi * (1 - G.kep(n.cs.co / 1200 * 0.12, 0, 0.12));
        }
        if (n.cap >= 5 && n.cd.cuoi <= 0 && muc.tuong && muc.hp > 0) {
          /* NÃO quyết định có bung chiêu cuối đúng lúc không */
          if (rng.duoc(0.35 + n.cs.nao / 1200 * 0.5)) {
            dungChieu(tran, n, muc, n.tuong.kn.cuoi, cs);
            n.cd.cuoi = n.tuong.kn.cuoi.hoi;
          }
        }
      } else {
        /* di chuyển */
        var dx = mt.x - n.x, dy = mt.y - n.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var toc = cs.tocchay * TICK * 1.35;
        if (d > toc) { n.x += dx / d * toc; n.y += dy / d * toc; }
        else { n.x = mt.x; n.y = mt.y; }
      }
    });

    /* ── lính ── */
    tran.linh.forEach(function (l) {
      if (l.hp <= 0) return;
      var muc = null, gd = l.tam + 10;
      tran.linh.forEach(function (m) {
        if (m.doi === l.doi || m.hp <= 0) return;
        var d = xaXY(l.x, l.y, m.x, m.y);
        if (d < gd) { gd = d; muc = m; }
      });
      if (!muc) {
        tran.nguoi.forEach(function (m) {
          if (m.doi === l.doi || m.chet > 0) return;
          var d = xaXY(l.x, l.y, m.x, m.y);
          if (d < gd) { gd = d; muc = m; }
        });
      }
      if (!muc) {
        tran.tru.forEach(function (r) {
          if (r.doi === l.doi || !r.song || !trongTamDanh(tran, r)) return;
          var d = xaXY(l.x, l.y, r.x, r.y);
          if (d < gd) { gd = d; muc = r; }
        });
      }
      if (muc) {
        l.danh -= TICK;
        if (l.danh <= 0) { l.danh = 1.1; satThuong(tran, l, muc, l.atk * (l.buff ? 1.4 : 1), 'vl', false); xuLyChet(tran, l, muc); }
      } else {
        l.t += (l.doi === 'xanh' ? 1 : -1) * 0.0016;
        l.t = G.kep(l.t, 0, 1);
        var p = diemTren(l.lane, l.t);
        l.x = p[0]; l.y = p[1];
      }
    });
    tran.linh = tran.linh.filter(function (l) { return l.hp > 0; });

    /* ── trụ bắn ── */
    tran.tru.forEach(function (r) {
      if (!r.song) return;
      r.danh -= TICK;
      if (r.danh > 0) return;
      var muc = null, gd = r.tam;
      tran.linh.forEach(function (l) {
        if (l.doi === r.doi || l.hp <= 0) return;
        var d = xaXY(r.x, r.y, l.x, l.y); if (d < gd) { gd = d; muc = l; }
      });
      if (!muc) {
        tran.nguoi.forEach(function (m) {
          if (m.doi === r.doi || m.chet > 0) return;
          var d = xaXY(r.x, r.y, m.x, m.y); if (d < gd) { gd = d; muc = m; }
        });
      }
      if (muc) { r.danh = 1.2; satThuong(tran, r, muc, r.atk, 'vl'); xuLyChet(tran, r, muc); }
    });

    /* ── quái lớn đánh trả ── */
    ['rong', 'chua'].forEach(function (k) {
      var q = tran.quaiLon[k];
      if (!q.song || q.hp <= 0) return;
      q.danh = (q.danh || 0) - TICK;
      if (q.danh > 0) return;
      var muc = null, gd = 120;
      tran.nguoi.forEach(function (m) {
        if (m.chet > 0) return;
        var d = xaXY(q.x, q.y, m.x, m.y); if (d < gd) { gd = d; muc = m; }
      });
      if (muc) { q.danh = 1.0; satThuong(tran, q, muc, q.atk, 'vl'); xuLyChet(tran, q, muc); }
    });

    /* ── vàng và kinh nghiệm trôi đều ── */
    if (tran.tick % 4 === 0) {
      tran.nguoi.forEach(function (n) {
        if (n.chet > 0) return;
        n.vang += 2.2;
        tran.vang[n.doi] += 2.2;
      });
    }

    /* biểu đồ chênh lệch vàng mỗi 30 giây */
    if (tran.tick % 120 === 0) {
      tran.chart.push({ t: tran.t, v: tran.vang.xanh - tran.vang.do });
    }

    /* ── điều kiện kết thúc ── */
    ['xanh', 'do'].forEach(function (d) {
      var loi = tran.tru.filter(function (r) { return r.doi === d && r.loi; })[0];
      if (loi && !loi.song && !tran.xong) {
        tran.xong = true;
        tran.thang = d === 'xanh' ? 'do' : 'xanh';
      }
    });
    if (!tran.xong && tran.t >= tran.daiToiDa) {
      tran.xong = true;
      tran.thang = tran.vang.xanh >= tran.vang.do ? 'xanh' : 'do';
      tran.hetGio = true;
    }
  };

  /* ══════════════════ chiêu ══════════════════ */
  function dungChieu(tran, n, muc, kn, cs) {
    var h = kn.h || {};
    var suc = h.dmg ? ((h.dmg.loai === 'pt' ? cs.ap : cs.atk) * (h.dmg.g || 0) + (h.dmg.c || 0)) : 0;
    var lap = h.lap || 1;

    var dsMuc = [muc];
    if (h.dmg && h.dmg.dien) {
      dsMuc = [];
      tran.nguoi.forEach(function (m) {
        if (m.doi === n.doi || m.chet > 0) return;
        if (xa(n, m) < 150) dsMuc.push(m);
      });
      tran.linh.forEach(function (l) {
        if (l.doi === n.doi || l.hp <= 0) return;
        if (xaXY(n.x, n.y, l.x, l.y) < 150) dsMuc.push(l);
      });
      if (!dsMuc.length) dsMuc = [muc];
    }

    /* Tia Chớp của Pháp Sét nảy qua ba người, mỗi lần nảy yếu đi */
    if (h.nay) {
      var nay = [muc];
      tran.nguoi.forEach(function (m) {
        if (nay.length >= h.nay) return;
        if (m.doi === n.doi || m.chet > 0 || m === muc) return;
        if (xa(muc, m) < 200) nay.push(m);
      });
      dsMuc = nay;
    }

    dsMuc.forEach(function (m, iM) {
      if (!m || m.hp <= 0) return;
      /* CƠ của người bị đánh = né chiêu. Đây là chỗ chỉ số CƠ nói tiếng nói rõ nhất. */
      if (m.tuong && !m.hieu.mienKc && tran.rng.duoc(G.kep(m.cs.co / 1200 * 0.22, 0, 0.22))) {
        tran.bay.push({ x: m.x, y: m.y, chu: 'né', loai: 'ne', t: tran.t });
        return;
      }
      var luongM = suc * lap;
      if (h.nay && iM > 0) luongM *= Math.pow(1 - (h.giamNay || 0.15), iM);
      if (h.theoMauMat && m.tuong) luongM += (m.hpMax - m.hp) * h.theoMauMat;   /* Phát Kết Liễu */

      if (luongM) {
        var luuGiap = 0;
        if (h.xuyenGiap && m.tuong) { luuGiap = 1; m.xuyenTam = h.xuyenGiap; }  /* Bắn Tỉa */
        satThuong(tran, n, m, luongM * (luuGiap ? (1 + h.xuyenGiap) : 1), (h.dmg && h.dmg.loai) || 'vl');
        if (luuGiap) delete m.xuyenTam;
      }
      /* nổ hết tầng độc đang có trên mục tiêu — Nỏ Độc: Bùng Độc */
      if (h.noDot && m.dot && m.dot.length) {
        var tang = 0;
        m.dot.forEach(function (d) { tang += d.tang; });
        satThuong(tran, n, m, ((h.noDot.g || 0) * cs.ap + (h.noDot.c || 0)) * tang, 'pt');
        m.dot = [];
      }
      if (h.themDot && m.tuong) {
        var dnoi = n.tuong.kn.noi.h.dot;
        if (dnoi) for (var q = 0; q < h.themDot; q++) themDot(n, m, dnoi, cs);
      }
      if (h.kc && m.tuong && !m.hieu.mienKc) m.kc = Math.max(m.kc, h.kc);
      if (h.khoa && m.tuong) { m.hieu.khoa = h.khoa; m.khoaVoi = n.i; }
      if (h.muMat && m.tuong) m.hieu.muMat = h.muMat;
      if (h.cham && m.tuong) m.cham = Math.max(m.cham, h.cham.giay);
      xuLyChet(tran, n, m);
    });

    /* hồi máu / khiên / buff cho phe mình */
    if (h.hoi) {
      var luong = (h.hoi.g || 0) * cs.ap + (h.hoi.c || 0);
      luong *= hesoDoi(tran, n.doi, 'hoi');
      var ds = h.doi ? tran.nguoi.filter(function (m) { return m.doi === n.doi && m.chet <= 0 && xa(n, m) < 200; }) : [nguoiYeuNhat(tran, n)];
      ds.forEach(function (m) {
        if (!m) return;
        var truoc = m.hp;
        var luongM2 = luong + (h.hoi.phanTramMau ? m.hpMax * h.hoi.phanTramMau * (h.lap || 1) : 0);
        m.hp = Math.min(m.hpMax, m.hp + luongM2);
        n.hoi += m.hp - truoc;
        tran.bay.push({ x: m.x, y: m.y, chu: '+' + Math.round(m.hp - truoc), loai: 'hoi', t: tran.t });
      });
    }
    if (h.chan) {
      var ch = (h.chan.g || 0) * cs.ap + (h.chan.c || 0);
      var m2 = h.doi ? null : nguoiYeuNhat(tran, n);
      if (m2) { m2.hp = Math.min(m2.hpMax * 1.4, m2.hp + ch); }
    }
    if (h.buff) {
      var b = { cs: {}, giay: h.buff.giay || 4 };
      ['atk', 'ap', 'tocdanh', 'tocchay', 'giap', 'khang'].forEach(function (k) { if (h.buff[k]) b.cs[k] = h.buff[k]; });
      if (h.buff.doi) {
        tran.nguoi.forEach(function (m) { if (m.doi === n.doi && m.chet <= 0 && xa(n, m) < 220) m.buff.push(JSON.parse(JSON.stringify(b))); });
      } else n.buff.push(b);
    }

    /* ─── hiệu ứng đặc biệt của chiêu cuối ─── */
    if (h.batTu) n.hieu.batTu = h.batTu;                                  /* Cuồng Chiến */
    if (h.chan1) n.hieu.chan1 = 6;                                        /* Tử Chiến */
    if (h.hutMau) { n.hieu.hutMau = (h.buff && h.buff.giay) || 6; n.mucHutMau = h.hutMau; }  /* Gấu Sư */
    if (h.giamNhan) {                                                     /* Hiệp Sĩ: Chốt Chặn */
      tran.nguoi.forEach(function (m) {
        if (m.doi !== n.doi || m.chet > 0 || xa(n, m) > 220) return;
        m.hieu.giamNhan = h.giay || 4; m.mucGiamNhan = h.giamNhan;
      });
    }
    if (h.mienKc) {                                                       /* Khiên Hồn: Vòm Chắn */
      tran.nguoi.forEach(function (m) {
        if (m.doi !== n.doi || m.chet > 0 || xa(n, m) > 200) return;
        m.hieu.mienKc = h.mienKc; m.kc = 0;
      });
    }
    if (h.goKc) {                                                         /* Thầy Thuốc: Cứu Rỗi */
      tran.nguoi.forEach(function (m) { if (m.doi === n.doi && xa(n, m) < 220) { m.kc = 0; m.cham = 0; } });
    }
    if (h.danhTru) n.hieu.danhTru = h.buff && h.buff.giay ? h.buff.giay : 8;  /* Phá Cổ: Công Thành */
    if (h.buff && h.buff.danhTru) { n.hieu.danhTru = h.buff.giay || 8; n.mucDanhTru = h.buff.danhTru; }
    if (h.phanTramMau) {                                                  /* Thánh Kiếm: Thánh Vực */
      tran.nguoi.forEach(function (m) {
        if (m.doi !== n.doi || m.chet > 0 || xa(n, m) > 210) return;
        var truoc2 = m.hp;
        m.hp = Math.min(m.hpMax, m.hp + m.hpMax * h.phanTramMau * (h.lap || 1));
        n.hoi += m.hp - truoc2;
      });
    }

    tran.suKien.push({ t: tran.t, loai: 'chieu', ai: n.i, ten: kn.ten, cuoi: kn.loai === 'cuoi' });
  }

  function nguoiYeuNhat(tran, n) {
    var g = null, gp = 2;
    tran.nguoi.forEach(function (m) {
      if (m.doi !== n.doi || m.chet > 0) return;
      if (xa(n, m) > 260) return;
      var p = m.hp / m.hpMax;
      if (p < gp) { gp = p; g = m; }
    });
    return g;
  }

  /* ══════════════════ chết và thưởng ══════════════════ */
  function xuLyChet(tran, ke, bi) {
    if (bi.hp > 0) return;

    if (bi.tuong) {
      /* tướng chết */
      bi.chet = 16 + Math.min(52, tran.t / 60 * 2.6);
      bi.d++;
      tran.matNguoi = tran.matNguoi || {};
      tran.matNguoi[bi.doi] = tran.t;
      if (ke.tuong) {
        ke.k++;
        /* Giá một cái đầu: ai đang có chuỗi thì đáng tiền, ai đang bị farm thì rẻ đi.
           Cộng thêm luật đuổi kịp — đội đang thua đậm giết được thì ăn dày hơn. Không có
           hai luật này thì trận nào lệch một chút là cuốn chiếu tới hết giờ. */
        bi.chuoi = 0;
        ke.chuoi = (ke.chuoi || 0) + 1;
        var gia = 220 * (0.5 + 0.5 * Math.min(1, (bi.chuoi0 || 0) / 4));
        if (bi.d - bi.k > 4) gia *= 0.55;
        var cheechV = tran.vang[ke.doi] - tran.vang[bi.doi];
        if (cheechV > 5000) gia *= 0.7; else if (cheechV < -5000) gia *= 1.4;
        gia = Math.round(gia);
        bi.chuoi0 = 0;
        ke.chuoi0 = (ke.chuoi0 || 0) + 1;
        ke.vang += gia;
        tran.vang[ke.doi] += gia;
        tran.mang[ke.doi]++;
        /* hỗ trợ quanh đó ăn assist */
        tran.nguoi.forEach(function (m) {
          if (m.doi !== ke.doi || m === ke || m.chet > 0) return;
          if (xa(m, bi) < 300) { m.a++; m.vang += 95; tran.vang[m.doi] += 95; }
        });
        tran.suKien.push({ t: tran.t, loai: 'mang', ai: ke.i, bi: bi.i });
      } else {
        tran.mang[bi.doi === 'xanh' ? 'do' : 'xanh']++;
        tran.suKien.push({ t: tran.t, loai: 'mang', ai: null, bi: bi.i });
      }
      bi.do = bi.do;   /* giữ đồ */
      return;
    }

    if (bi.song === false) return;

    if (bi.lap != null) {
      /* quái lớn */
      bi.song = false; bi.hp = 0; bi.lan++;
      bi.hienRa = tran.t + bi.lap;
      if (ke.tuong) {
        var d = ke.doi;
        tran.vang[d] += bi.vang * 5;
        if (bi.id === 'rong') { tran.rongHa[d]++; } else { tran.chuaHa[d]++; tran.buff[d].linh = tran.t + 60; }
        tran.nguoi.forEach(function (m) { if (m.doi === d) { m.vang += bi.vang; m.exp += bi.exp; lenCap(m); } });
        tran.suKien.push({ t: tran.t, loai: 'quaiLon', doi: d, quai: bi.id });
      }
      return;
    }

    if (bi.tam && bi.atk && bi.hpMax >= 3000) {
      /* trụ */
      bi.song = false;
      if (ke.tuong || ke.doi) {
        var d2 = ke.doi;
        tran.truHa[d2]++;
        tran.vang[d2] += 250;
        tran.nguoi.forEach(function (m) { if (m.doi === d2) m.vang += 50; });
        tran.suKien.push({ t: tran.t, loai: 'tru', doi: d2, lane: bi.lane, loi: !!bi.loi });
      }
      return;
    }

    /* quái rừng */
    if (bi.vang && bi.hoi != null) {
      bi.song = false; bi.hoi = tran.t + 60;
      if (ke.tuong) { ke.vang += bi.vang; tran.vang[ke.doi] += bi.vang; chiaExp(tran, ke, bi.exp, bi); }
      return;
    }

    /* lính */
    if (ke.tuong) {
      var them = bi.vang;
      if (ke.vt === 'duoi') them *= 1.2;      /* buff vị trí: xạ thủ +20% vàng */
      if (ke.vt === 'ho') them *= 0.85;
      them *= 0.92 + 0.16 * G.kep((ke.cs && ke.cs.luc || 0) / 1200, 0, 1);   /* LỰC: tốc độ farm */
      ke.vang += them;
      tran.vang[ke.doi] += them;
      chiaExp(tran, ke, bi.exp, bi);
    }
  }

  /** Kinh nghiệm chia cho mọi đồng đội đứng trong tầm — đúng luật MOBA, và cũng là thứ giữ cho
      người hỗ trợ không bị bỏ lại cấp 2 trong khi đường trên đã cấp 11. Buff vị trí của
      Teamfight Manager 2 áp ở đây: đường giữa +20% kinh nghiệm, hỗ trợ −30%. */
  function chiaExp(tran, ke, exp, bi) {
    var gan = tran.nguoi.filter(function (m) {
      return m.doi === ke.doi && m.chet <= 0 && (m === ke || xaXY(m.x, m.y, bi.x, bi.y) < 430);
    });
    if (!gan.length) gan = [ke];
    var chia = gan.length === 1 ? 1 : (0.62 + 0.38 / gan.length);
    var capTB = 0;
    tran.nguoi.forEach(function (m) { capTB += m.cap; });
    capTB /= tran.nguoi.length;
    gan.forEach(function (m) {
      var he = m.vt === 'giua' ? 1.2 : m.vt === 'ho' ? 0.7 : 1;
      if (m.cap < capTB - 1.5) he *= 1.35;      /* đuổi kịp: thua cấp thì học nhanh hơn */
      m.exp += exp * chia * he;
      lenCap(m);
    });
  }

  function lenCap(n) {
    var can = 120 + n.cap * 95;
    while (n.exp >= can && n.cap < 12) {
      n.exp -= can; n.cap++;
      var cs = G.tuongOCap(n.tuong, n.cap);
      var truoc = n.hpMax;
      n.hpMax = (cs.hp + G.congDo(n.do).hp) * n.heTT * G.heBenNguoi(n);
      n.hp += n.hpMax - truoc;
      can = 120 + n.cap * 95;
    }
  }

  /** chạy hết trận không vẽ — dùng cho nút "xem kết quả luôn" và cho các trận của đội máy */
  G.chayHet = function (tran, tranToiDa) {
    var d = 0;
    while (!tran.xong && d++ < (tranToiDa || 20000)) G.tickTran(tran);
    return G.ketQua(tran);
  };

  G.ketQua = function (tran) {
    var ds = tran.nguoi.map(function (n) {
      var diem = 4.2 + n.k * 0.42 + n.a * 0.16 - n.d * 0.42 + n.dmg / 26000 + n.hoi / 16000;
      return { i: n.i, doi: n.doi, ten: n.ten, tuong: n.tuong.ten, k: n.k, d: n.d, a: n.a,
        dmg: Math.round(n.dmg), nhan: Math.round(n.nhan), hoi: Math.round(n.hoi),
        cap: n.cap, vang: Math.round(n.vang), do: n.do.slice(),
        diem: Math.round(G.kep(diem, 0, 10) * 100) / 100 };
    });
    var mvp = null;
    ds.forEach(function (x) { if (x.doi === tran.thang && (!mvp || x.diem > mvp.diem)) mvp = x; });
    return {
      thang: tran.thang, thoiGian: tran.t, hetGio: !!tran.hetGio,
      mang: tran.mang, vang: tran.vang, tru: tran.truHa, rong: tran.rongHa, chua: tran.chuaHa,
      nguoi: ds, mvp: mvp ? mvp.i : null, chart: tran.chart
    };
  };

  G.SIM_TICK = TICK;
  G.SIM_DUONG = DUONG;
  G.SIM_NHA = NHA;
  G.diemTren = diemTren;

})(window);
