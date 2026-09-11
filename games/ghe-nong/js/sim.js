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

  /* Hiệu ứng cho phần VẼ: đạn bay, vệt chém, vòng diện rộng, tia trụ bắn. Chỉ là dự liệu
     trình bày — không đọc lại trong luồng tính toán nên không đổi kết quả trận. Trước đây
     không có gì cả: cả trận chỉ thấy người đứng cạnh nhau và số trừ bay lên, nên nhìn như
     bảng tính chứ không như trận đấu. */
  function hieuUng(tran, o) {
    /* KHÔNG AI XEM THÌ KHÔNG DỰNG.
       `tran.veHinh` chỉ bật khi màn xem trận mở ra. Bộ đo tỉ lệ thắng chạy ~300 trận liền
       một mạch bằng `chayHet()`; mỗi trận có hàng chục nghìn đòn đánh của lính, mà từ đợt
       này mỗi đòn đều đẩy ra một hiệu ứng để vẽ cú thọc. Dựng hết rồi bỏ đi là tự nhân
       thời gian đo lên nhiều lần — mà dữ liệu trình bày thì không đọc lại trong luồng
       tính toán, nên bỏ hẳn cũng KHÔNG đổi một con số nào của kết quả trận. */
    if (!tran.veHinh) return;
    o.t = tran.t;
    tran.hieu.push(o);
    if (tran.hieu.length > 300) tran.hieu.shift();
  }

  /** số bay lên — cũng là dữ liệu trình bày, cùng một luật với hieuUng() */
  function soBay(tran, o) {
    if (!tran.veHinh) return;
    o.t = tran.t;
    tran.bay.push(o);
    if (tran.bay.length > 400) tran.bay.shift();
  }

  /* ══════════════════ SỨC NẶNG CỦA TRỤ ══════════════════
     `[ĐO TRONG REPO]` Bản trước: trụ bắn một phát vào tướng cấp 8 ăn **23 máu** trên
     ~1.700 máu — tức là phải đứng dưới trụ **85 giây** mới chết. Nên trụ không phải là
     mối nguy, nó là đồ trang trí: đo ra **45% số mạng xảy ra ngay trong tầm trụ địch**,
     và mỗi người đứng trong tầm trụ địch trung bình **276 giây một trận**.

     Nguyên nhân: dòng `if (bi.tuong) thuc *= 0.22` trong satThuong(). Cái hãm ấy có lý do
     — nó là nút vặn nhịp cho tướng-đánh-tướng, không có nó thì cả đội tan trong 2 giây —
     nhưng nó đang hãm CẢ đòn của trụ. Trụ phải có thang riêng.

     Thêm luật leo thang của mọi game MOBA: bắn liên tiếp vào CÙNG một người thì mỗi phát
     một mạnh hơn. Đây mới là thứ làm người ta sợ trụ, chứ không phải con số phát đầu. */
  /* `[ĐO TRONG REPO]` Vặn số này là vặn cả thế trận, nên ghi lại cả ba nấc đã thử:
       0.22 (bản cũ, không leo thang) → trụ bắn 23 máu, 85 giây mới giết nổi một người:
            trụ là đồ trang trí, 45% số mạng xảy ra ngay dưới trụ địch.
       0.75 + leo tới ×3.0           → trụ bắn 81→243: đúng là đáng sợ, nhưng KHÔNG AI
            phá nổi trụ nữa — trụ ngoài đổ 4,9/12 và 96% số trận hết giờ.
       0.55 + leo tới ×2.2           → 60→131 máu một phát. Đứng lì dưới trụ vẫn chết,
            mà cả đội xúm vào vẫn vây được trụ. */
  /* Hãm sát thương TƯỚNG-ĐÁNH-TƯỚNG. Không có nó thì cả đội tan trong hai giây và một
     trận ra 130 mạng (§4.2). Nhưng vặn quá chặt thì giao tranh không bao giờ phân thắng
     bại: đo được **12,8 mạng một trận**, tức gần như không có pha nào bên nào gãy ba
     người cùng lúc — mà đó lại đúng là cửa sổ duy nhất để dứt điểm một trận MOBA.

     Quét lại, mỗi mức 100 trận (RESEARCH.md §8.6):
       0,22 → 12,8 mạng · 22,9 phút · **57% hết giờ** · lõi đổ 0,43/2 · trụ đổ 9,6
       0,28 → 16,6 mạng · 22,3 phút ·   50% hết giờ · lõi đổ 0,50/2 · trụ đổ 9,5
       0,34 → 19,7 mạng · 20,9 phút ·   32% hết giờ · lõi đổ 0,68/2 · trụ đổ 9,5
       0,40 → 22,3 mạng · 18,8 phút · **17% hết giờ** · lõi đổ 0,83/2 · trụ đổ 9,0  ← chốt
       0,46 → 26,2 mạng · 17,2 phút ·   13% hết giờ · lõi đổ 0,87/2 · trụ đổ 8,4
     Chốt 0,40 chứ không phải 0,46: 0,46 tuy ít hết giờ hơn nhưng trận rút còn 17 phút và
     **số trụ đổ tụt từ 9,0 xuống 8,4** — phần vây trụ bắt đầu bị giao tranh nuốt mất. */
  var HAM_TUONG = 0.40;
  var TRU_HAM = 0.55;                       /* thay cho HAM_TUONG khi kẻ bắn là trụ */
  var TRU_LEO = [1, 1.4, 1.8, 2.2];         /* phát thứ 1,2,3,4+ vào cùng một người */
  var TRU_QUEN = 5;                         /* rời mục tiêu quá ngần này giây thì quên */

  function leoTru(tran, r, bi) {
    /* Cả đội xúm vào thì trụ KHÔNG dồn được leo thang lên một người: nó phải chia đạn
       ra, và người này lùi thì người khác vào. Đây là chỗ phân biệt "một mình lao vào
       trụ" (chết) với "cả đội vây trụ" (ăn được) — thiếu nó thì trụ vô địch trước mọi
       pha vây, và trận không bao giờ kết thúc. */
    var xum = 0;
    tran.nguoi.forEach(function (m) {
      if (m.doi === r.doi || m.chet > 0) return;
      if (xaXY(r.x, r.y, m.x, m.y) < r.tam) xum++;
    });
    if (xum >= 3) { r.leoAi = bi.i; r.leo = 0; }
    if (r.leoAi !== bi.i || tran.t - r.leoLuc > TRU_QUEN) { r.leoAi = bi.i; r.leo = 0; }
    r.leoLuc = tran.t;
    var k = TRU_LEO[Math.min(r.leo, TRU_LEO.length - 1)];
    r.leo++;
    return k;
  }

  /** trụ CÒN SỐNG của đội `doiTru` đang phủ điểm (x,y) — null nếu điểm ấy an toàn */
  function truPhu(tran, x, y, doiTru) {
    for (var i = 0; i < tran.tru.length; i++) {
      var r = tran.tru[i];
      if (r.doi !== doiTru || !r.song) continue;
      var dx = r.x - x, dy = r.y - y;
      if (dx * dx + dy * dy < r.tam * r.tam) return r;
    }
    return null;
  }

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
      veHinh: false,        /* bật khi màn xem trận mở — xem hieuUng() */
      nguoi: [], linh: [], tru: [], quai: [], quaiLon: {},
      suKien: [], thoai: [], bay: [], hieu: [],
      vang: { xanh: 0, do: 0 }, mang: { xanh: 0, do: 0 },
      truHa: { xanh: 0, do: 0 }, rongHa: { xanh: 0, do: 0 }, chuaHa: { xanh: 0, do: 0 },
      chart: [], buff: { xanh: {}, do: {} },
      keHoach: { xanh: null, do: null },
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
          buff: [], dot: [], hieu: {}, kc: 0, cham: 0, lanCuoi: 0,
          /* ── HÌNH DÁNG ĐỐI TƯỢNG PHẢI KHAI ĐỦ Ở ĐÂY ──
             Mọi trường dưới đây trước kia được GẮN THÊM giữa trận (px/py cho nội suy, các
             mốc thời gian cho hoạt ảnh, mấy biến đếm của nội tại). Trong V8, gắn thêm một
             thuộc tính mới vào đối tượng đã dùng rồi là đổi hidden class, và khi cùng một
             mảng có thực thể mang hình dáng khác nhau thì mọi phép đọc thuộc tính trong
             vòng lặp nóng rơi xuống đường chậm.
             [ĐO TRONG REPO] để chúng gắn thêm: 333 µs/tick. Khai sẵn ở đây: xem §7.6.
             Bộ đo tỉ lệ thắng chạy ~7,5 triệu tick nên chỗ này là phút, không phải µs. */
          px: v[0], py: v[1], huong: null, _h: 0,
          danhLuc: -9, danhGoc: 0, niemLuc: -9, niemTen: '', niemCuoi: false,
          dinhLuc: -9, hoiLuc: -9, tTran: 0,
          truBan: -99, danhTuongLuc: -99, danhTuongAi: -1, nham: -1,
          demDon: 0, congDon: 0, mucCu: null, chuoi: 0, chuoi0: 0,
          cdChanPhep: 0, chanKhiThap: 0, mucGiamNhan: 0, mucHutMau: 0, mucDanhTru: 0
        });
      });
    });

    /* trụ */
    TRU.forEach(function (r) {
      var p = diemTren(r[0], r[2] === 'xanh' ? r[1] : r[1]);
      tran.tru.push({ lane: r[0], doi: r[2], t: r[1], x: p[0], y: p[1],
        hp: 4800, hpMax: 4800, giap: 95, khang: 95, atk: 190, tam: 130, danh: 0, song: true,
        nha: false, loi: false, danhLuc: -9, dinhLuc: -9,
        laTru: true, leoAi: -1, leo: 0, leoLuc: -99 });
    });
    /* hai trụ nhà + lõi */
    ['xanh', 'do'].forEach(function (d) {
      var n = NHA[d];
      tran.tru.push({ lane: 'nha', doi: d, x: n[0] + (d === 'xanh' ? 70 : -70), y: n[1] + (d === 'xanh' ? -70 : 70),
        hp: 5000, hpMax: 5000, giap: 110, khang: 110, atk: 240, tam: 150, danh: 0, song: true,
        nha: true, loi: false, danhLuc: -9, dinhLuc: -9,
        laTru: true, leoAi: -1, leo: 0, leoLuc: -99 });
      tran.tru.push({ lane: 'loi', doi: d, x: n[0], y: n[1],
        hp: 6000, hpMax: 6000, giap: 110, khang: 110, atk: 180, tam: 140, danh: 0, song: true,
        nha: false, loi: true, danhLuc: -9, dinhLuc: -9,
        laTru: true, leoAi: -1, leo: 0, leoLuc: -99 });
    });

    /* quái rừng */
    BAI.forEach(function (b, i) {
      tran.quai.push({ i: i, x: b[0], y: b[1], gan: b[2], hp: 900, hpMax: 900, atk: 40,
        song: true, hoi: 0, vang: 55, exp: 70,
        danh: 0, danhLuc: -9, goc: 0, dinhLuc: -9 });
    });
    /* quái lớn */
    for (var k in QUAI_LON) {
      var q = QUAI_LON[k];
      tran.quaiLon[k] = { id: k, ten: q.ten, x: q.x, y: q.y, hp: 0, hpMax: q.hp, atk: q.atk,
        song: false, hienRa: q.dau, vang: q.vang, exp: q.exp, lap: q.lap, lan: 0,
        danh: 0, danhLuc: -9, goc: 0, dinhLuc: -9 };
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

    /* MỌI khoá buff là PHẦN TRĂM, kể cả atk và ap. Trước đây atk/ap cộng thẳng còn
       giáp/kháng/tốc nhân phần trăm — nên một chiêu khai `buff: { atk: 0.30 }` chỉ cộng
       0.3 điểm công, tức là không có gì. Lệch luật giữa các khoá là cái bẫy im lặng:
       không lỗi, không cảnh báo, chỉ là chiêu đó vô dụng. */
    return {
      atk: (cs.atk + d.atk) * he * (1 + (b.atk || 0)) * kL,
      ap: (cs.ap + d.ap) * he * (1 + (b.ap || 0)) * kL,
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

  /* Mọi hiệu ứng đặc biệt của trang bị đọc qua THẺ `dac`, không phải qua id món.
     Trước đây bốn hiệu ứng dò `n.do.indexOf('luoi4')`, ba hiệu ứng còn lại thì KHÔNG AI
     ĐỌC — tức Quạ Hoàng Hôn, Màn Huỷ Diệt và Tiên Tri Vực Thẳm chỉ là cục chỉ số, mà
     bảng mô tả vẫn hứa với người chơi là có tác dụng. Một cửa vào duy nhất thì đổi id
     món hay thêm món mới cũng không sót. */
  function coDac(n, the) {
    if (!n || !n.do || !n.do.length) return false;
    for (var i = 0; i < n.do.length; i++) {
      var m = G.TB_THEO_ID[n.do[i]];
      if (m && m.dac === the) return true;
    }
    return false;
  }

  function satThuong(tran, ke, bi, luong, loai, ghiNhan) {
    var csK = chiSoNguoi ? null : null;
    var giam;
    var csB = bi.tuong ? chiSoNguoi(bi) : { giap: bi.giap || 0, khang: bi.khang || 0 };
    if (loai === 'pt') {
      var kh = csB.khang || 0;
      if (coDac(ke, 'xuyenkhang')) kh *= 0.8;             /* Trượng Mê Hoặc */
      giam = 100 / (100 + kh);
    } else {
      var gi = csB.giap || 0;
      if (coDac(ke, 'xuyengiap')) gi *= 0.75;             /* Phán Quyết Bá Vương */
      giam = 100 / (100 + gi);
    }
    var thuc = luong * giam;

    if (ke.tuong) thuc *= hesoDoi(tran, ke.doi, 'sat');
    if (bi.tuong) thuc /= hesoDoi(tran, bi.doi, 'chiu');

    /* Người khó giết hơn lính rất nhiều. Không có dòng này thì cả đội tan trong 2 giây và
       một trận ra 130 mạng — đo bằng máy, xem ghi chép cân bằng cuối file.
       NHƯNG cái hãm này là nút vặn nhịp cho tướng-đánh-tướng, KHÔNG được hãm cả đòn trụ:
       hãm luôn thì trụ bắn 85 giây mới giết nổi một người, và cả bản đồ mất chỗ nguy hiểm.
       Trụ đi thang riêng, có leo thang theo số phát liên tiếp. */
    /* ═══ TƯỚNG ĐẬP TRỤ NHANH HƠN ═══
       `[ĐO TRONG REPO]` Khi trụ có sức nặng thật, cán cân lật hẳn sang phía trụ: người
       đẩy ăn vài phát là phải lùi, mà trụ thì 4.800 máu. Đo ra **trụ ngoài chỉ đổ 4,9/12
       và 96% số trận hết giờ** — không ai phá nổi cái gì.
       Ở MOBA thật, vây trụ là việc NHANH: cả đội xúm vào thì một trụ đổ trong mươi giây.
       Cho tướng (chỉ tướng, không phải lính) đập trụ mạnh hơn 80% thì giữ được cả hai:
       trụ vẫn đáng sợ với người lao vào một mình, mà cả đội xúm vào thì vẫn ăn được. */
    if (bi.laTru && ke.tuong) thuc *= 1.8;

    if (bi.tuong) {
      if (ke.laTru) {
        thuc *= TRU_HAM * leoTru(tran, ke, bi);
        bi.truBan = tran.t;                 /* để bộ não biết mình đang ăn đạn trụ */
      } else {
        thuc *= HAM_TUONG;
      }
    }
    /* Tướng vừa đánh tướng — trụ đọc dấu này để ĐỔI MỤC TIÊU sang kẻ lao vào. */
    if (ke.tuong && bi.tuong) { ke.danhTuongLuc = tran.t; ke.danhTuongAi = bi.i; }

    if (bi.tuong && bi.hieu) {
      if (bi.hieu.giamNhan) thuc *= (1 - (bi.mucGiamNhan || 0.25));      /* Hiệp Sĩ: Chốt Chặn */
      if (bi.hieu.chan1) { delete bi.hieu.chan1; thuc = 0; }             /* Tử Chiến: Phản Kích */
    }
    /* đồ Trọng Giáp Hắc Kỵ: phản 12% sát thương vật lý */
    if (bi.tuong && loai === 'vl' && ke.tuong && coDac(bi, 'phandon')) {
      ke.hp -= thuc * 0.12;
    }
    /* đồ Thành Trì Bất Khả: xuống dưới 30% máu thì bật một lá chắn lớn, 90 giây một lần */
    if (bi.tuong && coDac(bi, 'chan_khi_thap') && (bi.hp - thuc) < bi.hpMax * 0.3 &&
        (!bi.chanKhiThap || tran.t - bi.chanKhiThap > 90)) {
      bi.chanKhiThap = tran.t;
      bi.hp += bi.hpMax * 0.22;
      soBay(tran, { x: bi.x, y: bi.y, chu: 'chắn!', loai: 'hoi' });
    }

    bi.hp -= thuc;
    bi.dinhLuc = tran.t;                    /* mốc để chớp trắng một nhịp khi ăn đòn */
    /* Cuồng Chiến: Không Lùi — không tụt xuống dưới 1 máu trong mấy giây */
    if (bi.tuong && bi.hieu && bi.hieu.batTu && bi.hp < 1) bi.hp = 1;
    if (ke.tuong) { ke.dmg += thuc; ke.lanCuoi = tran.t; }
    if (bi.tuong) bi.nhan += thuc;

    if (ghiNhan !== false && bi.tuong) {
      soBay(tran, { x: bi.x, y: bi.y, chu: Math.round(thuc), loai: loai });
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

  /* ══════════════════ MỤC TIÊU ĐÁNG ĐÁNH NHẤT ══════════════════
     `[ĐO TRONG REPO]` Bản trước ai cũng đánh NGƯỜI GẦN NHẤT. Năm người đánh năm mục tiêu
     khác nhau thì không giết nổi ai, và cả trận biến thành một đám đông gõ lẫn nhau —
     93 mạng một trận, mà phần lớn là đổi mạng ngẫu nhiên chứ không phải ai thắng giao
     tranh. Ở MOBA thật, thứ phân định giao tranh là TẬP TRUNG HOẢ LỰC.

     Năm thứ cộng điểm, xếp theo sức nặng:
       giết được ngay   +6   không có gì đáng hơn một cái đầu chắc chắn
       đồng đội đang đánh +1.8 ← đây chính là chỗ sinh ra tập trung hoả lực
       máu càng ít càng đáng +1.9
       đang bị khống chế +0.7   người không chạy được là người nên đánh
       lớp mềm (xa/phép/hỗ trợ) +0.6, sát thủ thấy càng đáng +0.5 nữa
       gần hơn thì hơn  +1.2   nhưng là thứ NHẸ NHẤT, không phải thứ duy nhất như trước

     NÃO quyết định nhìn có ra hay không: não thấp thì điểm bị nhiễu, chọn gần như bừa. */
  var LOP_MEM = { xa: 1, phep: 1, ho: 1 };

  function mucTieuTot(tran, n, tam, cs) {
    var tot = null, diemTot = -1e9;
    var laSat = n.tuong.lop === 'sat';
    var uocDon = cs.atk * 0.26;                 /* ước lượng một đòn thường ăn bao nhiêu */
    var nhieu = 1 - G.kep(n.cs.nao / 1200, 0, 1);   /* não thấp → nhiễu cao */
    tran.nguoi.forEach(function (m) {
      if (m.doi === n.doi || m.chet > 0) return;
      var d = xa(n, m);
      if (d > tam) return;
      var diem = 1.2 * (1 - d / tam);
      diem += (1 - m.hp / m.hpMax) * 1.9;
      if (m.hp <= uocDon) diem += 6;
      if (m.kc > 0 || m.cham > 0) diem += 0.7;
      if (LOP_MEM[m.tuong.lop]) diem += 0.6 + (laSat ? 0.5 : 0);
      /* đồng đội đang nhắm ai thì mình nhắm người đó */
      var cung = 0;
      tran.nguoi.forEach(function (a) {
        if (a.doi !== n.doi || a === n || a.chet > 0) return;
        if (a.nham === m.i) cung++;
      });
      diem += Math.min(cung, 3) * 1.8;
      diem += (tran.rng() - 0.5) * 2.4 * nhieu;
      if (diem > diemTot) { diemTot = diem; tot = m; }
    });
    if (tot) n.nham = tot.i;
    return tot;
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

  /** đội `doi` đã MẤT SẠCH trụ ngoài của ít nhất MỘT đường chưa */
  function coLaneSach(tran, doi) {
    var con = { tren: 0, giua: 0, duoi: 0 };
    tran.tru.forEach(function (x) {
      if (x.doi !== doi || x.lane === 'nha' || x.lane === 'loi') return;
      if (x.song) con[x.lane]++;
    });
    return !con.tren || !con.giua || !con.duoi;
  }

  function trongTamDanh(tran, r) {
    if (r.lane === 'nha' || r.lane === 'loi') {
      if (r.lane === 'loi') {
        var conNha = tran.tru.some(function (x) { return x.doi === r.doi && x.song && x.lane === 'nha'; });
        return !conNha;
      }
      /* ═══ CHỖ NÀY TỪNG NÓI MỘT ĐẰNG LÀM MỘT NẺO ═══
         Chú thích cũ ghi "nhà chỉ mở khi mất hết trụ ngoài của **ít nhất một đường**",
         nhưng mã lại đòi mất SẠCH CẢ SÁU trụ ngoài (`!conNgoai` và `soTruSongCuaLane
         === 0` là hai cách viết của cùng một điều kiện). Luật của mọi game MOBA là luật
         trong chú thích: dọn sạch MỘT đường là mở được nhà.

         `[ĐO TRONG REPO]` Hậu quả khi trụ còn yếu thì không ai để ý — hai bên cuối cùng
         cũng mất hết sáu trụ. Nhưng khi trụ có sức nặng thật (đợt này) thì nó lộ ra ngay:
         trụ ngoài đổ 9,2/12, trụ nhà đổ **0,3/2**, lõi đổ **0,04/2**, và **96% số trận
         phải phân thắng bằng vàng vì hết giờ**. Không ai chạm nổi vào nhà. */
      return coLaneSach(tran, r.doi);
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

  /* ══════════════════ KẾ HOẠCH CỦA CẢ ĐỘI ══════════════════
     `[ĐO TRONG REPO]` Đây là chỗ "ngu" nặng nhất, và nó không nằm trong đầu từng người mà
     nằm ở chỗ KHÔNG AI BÀN VỚI AI. Mỗi người tự chọn cái trụ gần mình nhất, nên năm người
     gõ ba đường khác nhau, mỗi đường một tí. Kết quả đo được: trụ ngoài đổ **8,9/12** —
     tức 4,45 trên mỗi bên trong tổng số 6 — mà rải đều ba đường, nên **không đường nào
     sạch**, nhà không bao giờ mở, lõi không bao giờ bị chạm tới, và **92% số trận phải
     phân thắng bằng vàng vì hết giờ**.

     Sửa bằng một biến duy nhất cho cả đội: đẩy đường nào. Tính lại 8 giây một lần (đủ
     chậm để không dao động, đủ nhanh để bắt kịp một pha ăn ba mạng), và mọi người khi
     không có việc gấp hơn thì kéo về đúng đường ấy.

     Chọn đường theo hai thứ, cộng lại:
       đường đã phá được nhiều trụ hơn  → đẩy tiếp cho xong, đừng bỏ dở
       trụ tiếp theo của đường ấy máu thấp → gần đổ rồi, dứt điểm đi   */
  function truMoCuaLane(tran, doiDich, lane) {
    var ds = tran.tru.filter(function (x) {
      return x.doi === doiDich && x.song && x.lane === lane && trongTamDanh(tran, x);
    });
    if (ds.length) return ds[0];
    /* đường đã sạch → chuyển sang nhà rồi lõi */
    var sau = tran.tru.filter(function (x) {
      return x.doi === doiDich && x.song && (x.lane === 'nha' || x.lane === 'loi') &&
        trongTamDanh(tran, x);
    });
    return sau[0] || null;
  }

  /* ══════════════════ CỬA SỔ DỨT ĐIỂM ══════════════════
     `[ĐO TRONG REPO]` Đo trên 150 trận: trụ nhà của bên yếu hơn bị gõ xuống còn **24% máu**
     mà vẫn **59% số trận phải phân thắng bằng vàng vì hết giờ**. Tức là không phải "không
     tới nổi nhà" — mà là **tới rồi, gõ gần xong, rồi bỏ về**. Lý do: mỗi người vẫn tự
     chấm điểm riêng, hễ tụt máu hay ăn một phát trụ là lùi ra, và khi họ quay lại thì
     người phòng thủ đã hồi sinh đủ mặt.

     Ở MOBA thật, trận kết thúc trong đúng một loại cửa sổ: **đội kia gãy mấy người cùng
     lúc**. Không ai còn giữ nhà thì cả đội vào, và không ai lùi cho tới khi lõi đổ hoặc
     người phòng thủ hồi sinh. Đây là luật thiếu hẳn, không phải con số cần vặn.

     Cửa sổ mở khi: địch gãy từ 3 người trở lên mà còn phải chờ hồi sinh lâu (>8 giây),
     và có một trụ nhà hoặc lõi của địch đang đánh được. Trong cửa sổ ấy, luật "sợ trụ" và
     luật "máu thấp thì về" bị tắt (trừ khi đã dưới 18% máu — thế thì về vẫn hơn). */
  function cuaSoDut(tran, doi) {
    var kia = doi === 'xanh' ? 'do' : 'xanh';
    var gay = 0;
    for (var i = 0; i < tran.nguoi.length; i++) {
      var m = tran.nguoi[i];
      if (m.doi === kia && m.chet > 8) gay++;
    }
    if (gay < 3) return false;
    for (var j = 0; j < tran.tru.length; j++) {
      var r = tran.tru[j];
      if (r.doi === kia && r.song && (r.lane === 'nha' || r.lane === 'loi') &&
          trongTamDanh(tran, r)) return r;
    }
    return false;
  }

  function keHoachDoi(tran, doi) {
    var k = tran.keHoach[doi];
    if (k && tran.t - k.t < (k.dut ? 15 : 8)) return k;
    var kia = doi === 'xanh' ? 'do' : 'xanh';
    var song = 0, chetDich = 0;
    tran.nguoi.forEach(function (m) {
      if (m.doi === doi) { if (m.chet <= 0) song++; }
      else if (m.chet > 5) chetDich++;
    });
    var tot = 'giua', diemTot = -1e9;
    ['tren', 'giua', 'duoi'].forEach(function (l) {
      var con = 0;
      tran.tru.forEach(function (x) {
        if (x.doi === kia && x.song && x.lane === l) con++;
      });
      var diem = (2 - con) * 3;
      var muc = truMoCuaLane(tran, kia, l);
      if (muc) diem += (1 - muc.hp / muc.hpMax) * 3;
      else diem -= 6;
      if (diem > diemTot) { diemTot = diem; tot = l; }
    });
    /* Đẩy khi đang hơn người, hoặc gần đủ đội. Thiếu người thì thủ, đừng đâm đầu. */
    /* Nhà địch đã lộ ra = giai đoạn DỨT ĐIỂM: cả đội vào, kể cả người đi rừng và người
       quen đẩy lẻ, và giữ kế hoạch lâu gấp đôi cho khỏi bỏ dở. */
    var loRa = tran.tru.some(function (x) {
      return x.doi === kia && x.song && (x.lane === 'nha' || x.lane === 'loi') &&
        trongTamDanh(tran, x);
    });
    k = { loai: (loRa || chetDich >= 2 || song >= 4) ? 'day' : 'thu',
      lane: tot, t: tran.t, dut: loRa };
    tran.keHoach[doi] = k;
    return k;
  }

  /** điểm LÙI RA khỏi tầm một cái trụ, về phía nhà mình */
  function raKhoiTru(n, r) {
    var dx = n.x - r.x, dy = n.y - r.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    /* đứng ngay ở mép thì vẫn ăn đạn lúc trụ bắn phát cuối — lùi dư 70 */
    var can = r.tam + 70;
    return { x: r.x + dx / d * can, y: r.y + dy / d * can };
  }

  /** có lính nhà mình đứng đỡ đạn quanh điểm này không */
  function coLinhTa(tran, x, y, doi, banKinh) {
    for (var i = 0; i < tran.linh.length; i++) {
      var l = tran.linh[i];
      if (l.doi !== doi || l.hp <= 0) continue;
      var dx = l.x - x, dy = l.y - y;
      if (dx * dx + dy * dy < banKinh * banKinh) return true;
    }
    return false;
  }

  function chonHanhDong(tran, n) {
    var ct = tran.cau[n.ben].chienThuat || {};
    var cs = n.cs;
    var nghe = ngheLenh(n);
    var rng = tran.rng;
    var chat = n.chat;
    var doiKia = n.doi === 'xanh' ? 'do' : 'xanh';
    /* Cửa sổ dứt điểm: địch gãy quá nửa đội và nhà của họ đang hở. Bỏ hết luật sợ sệt,
       cả đội vào nhà. Chỉ người sắp chết hẳn (dưới 18% máu) mới được phép quay về. */
    var truDut = cuaSoDut(tran, n.doi);
    if (truDut && n.hp / n.hpMax > 0.18) {
      n.veNha = false;
      return diemDayTru(tran, n, truDut);
    }

    /* GIỮ LẤY Ý ĐỊNH CŨ.
       `[ĐO TRONG REPO]` Bản trước đo được **172 lần đổi ý mỗi phút** cho cả đội — mỗi
       người đổi kế hoạch 3,5 giây một lần. Lý do: mọi luật dưới đây đều tung xúc xắc
       lại từ đầu ở MỖI lần quyết định, nên người ta dao động giữa "vào hùa" và "về ăn
       lính" mà không bao giờ làm xong việc gì. Người chơi nhìn vào chỉ thấy mười cái
       chấm chạy tới chạy lui vô nghĩa — đó chính là cái "ngu" dễ thấy nhất.
       `giu()` nhân mạnh xác suất cho việc ĐANG LÀM, nên đã trót làm gì thì làm cho xong. */
    var cu = (n.mucTieu && n.mucTieu.loai) || '';
    function giu(loai, p) { return cu === loai ? Math.min(0.97, p * 2.8 + 0.22) : p; }

    /* 1. máu thấp → về nhà. Ngưỡng phụ thuộc LÌ: lì cao thì dám ở lại lâu hơn */
    /* `[BẪY ĐÃ SẬP]` Đã thử nâng ngưỡng rút lên 0,42 cho "rút sớm hơn". Nhưng khi đã sửa
       cái lỗi "rút mà không chạy" thì lệnh rút BẮT ĐẦU CÓ HIỆU LỰC THẬT, và nâng ngưỡng
       nữa là thành ra ai cũng bỏ chạy: đo được **18 mạng một trận** và **100% số trận hết
       giờ** — không giao tranh nào phân thắng bại, nên không đội nào có cửa sổ hơn người
       để mà đẩy. Trả lại 0,34. Bài học: sửa xong một lỗi thì phải ĐO LẠI mấy con số đã
       chỉnh dựa trên cái lỗi ấy, đừng chồng thêm. */
    var nguong = 0.34 - (cs.li / 1200) * 0.16;
    /* thua đậm mà LÌ thấp thì co rúm: ngưỡng vọt lên */
    var cheech = tran.vang[n.doi] - tran.vang[n.doi === 'xanh' ? 'do' : 'xanh'];
    if (cheech < -2000) nguong += (1 - cs.li / 1200) * 0.18;
    if (chat.indexOf('thu') >= 0) nguong += 0.05;
    if (chat.indexOf('lao') >= 0) nguong -= 0.06;

    if (n.hp / n.hpMax < nguong && !n.veNha) { n.veNha = true; }
    /* ═══ 0a. ĐANG ĐỨNG TRONG TẦM TRỤ ĐỊCH ═══
       `[ĐO TRONG REPO]` Bản trước: **45% số mạng** xảy ra ngay trong tầm trụ địch, và mỗi
       người đứng trong tầm trụ địch trung bình **276 giây một trận**. Bộ não không hề biết
       trụ tồn tại — nó chỉ thấy "có địch, đánh thôi".

       Luật thật của MOBA: đứng dưới trụ địch chỉ chấp nhận được khi CÓ LÍNH NHÀ MÌNH đỡ
       đạn, hoặc khi cố tình LAO VÀO để kết liễu một mục tiêu sắp chết và mình đủ máu.
       Ngoài hai trường hợp ấy, đứng đó là tự sát. */
    var truDich = truPhu(tran, n.x, n.y, doiKia);
    if (truDich) {
      /* Điều kiện phải là ĐANG ĂN ĐẠN TRỤ, không phải "đang ở trong tầm".
         Bản đầu của luật này bắt lùi ngay khi bước vào tầm trụ mà không có lính đỡ. Kết
         quả đo được: thời gian đứng dưới trụ giảm một nửa (276 → 132 giây) nhưng **số trụ
         đổ mỗi trận cũng giảm một nửa (10 → 5,2) và 100% số trận phải phân thắng bằng
         vàng vì hết giờ**. Sợ trụ tới mức không ai phá nổi trụ thì trận không bao giờ
         kết thúc — chữa một bệnh, đẻ ra một bệnh nặng hơn.
         Người chơi thật vẫn áp sát trụ để gõ, ăn một hai phát rồi lùi ra cho hết leo
         thang. Cái phải tránh là ĐỨNG LÌ ăn phát thứ ba thứ tư. */
      var dangAnDan = tran.t - n.truBan < 3;
      var maunn = n.hp / n.hpMax;
      /* có ai sắp chết để mà lao vào không */
      var moiNgon = null;
      tran.nguoi.forEach(function (m) {
        if (m.doi === n.doi || m.chet > 0) return;
        if (m.hp / m.hpMax > 0.34) return;
        if (xa(n, m) > 260) return;
        moiNgon = m;
      });
      var dongDoi = 0;
      tran.nguoi.forEach(function (m) {
        if (m.doi !== n.doi || m === n || m.chet > 0) return;
        if (xa(n, m) < 300) dongDoi++;
      });
      /* LÌ cao thì dám lao sâu hơn; chất 'lao' thì gần như luôn dám */
      var damLao = moiNgon && maunn > 0.58 - cs.li / 1200 * 0.18 &&
        (dongDoi >= 1 || chat.indexOf('lao') >= 0);
      /* Ba cửa ra, đều cần ĐANG bị trụ bắn: máu đã mỏng, hoặc ăn quá hai phát liên tiếp
         (leo thang bắt đầu đau), hoặc đang một mình. */
      var anNhieu = truDich.leoAi === n.i && truDich.leo >= 2;
      var phaiRa = !damLao && dangAnDan && (maunn < 0.62 || anNhieu || dongDoi === 0);
      if (phaiRa && chat.indexOf('lao') < 0) {
        var ra = raKhoiTru(n, truDich);
        return { loai: 'rut', x: ra.x, y: ra.y, vitru: 1 };
      }
    }

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
    if (dichChet >= 2 && rng.duoc(giu('daytru', 0.35 + cs.nao / 1200 * 0.5))) {
      var qLon = null;
      ['chua', 'rong'].forEach(function (k2) { var q2 = tran.quaiLon[k2]; if (!qLon && q2.song && q2.hp > 0) qLon = q2; });
      if (qLon && rng.duoc(0.45)) return { loai: 'quailon', x: qLon.x, y: qLon.y, mt: qLon };
      var khCH = keHoachDoi(tran, n.doi);
      var tr2 = truMoCuaLane(tran, doiKia, khCH.lane) || truGanNhat(tran, n, 1400);
      if (tr2) return diemDayTru(tran, n, tr2);
    }

    /* 1a. đội vừa mất người trong 9 giây qua → lùi lại thở.
       Giao tranh thật kết thúc khi một bên gãy, không phải khi cả mười người nằm xuống. */
    var vuaMat = (tran.matNguoi && tran.matNguoi[n.doi]) || -999;
    if (tran.t - vuaMat < 9 && n.hp / n.hpMax < 0.6 && chat.indexOf('lao') < 0) {
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
      if (rng.duoc(giu('quailon', p * 0.35))) return { loai: 'quailon', x: mt.x, y: mt.y, mt: mt };
    }

    /* 3. có giao tranh gần → vào hùa */
    var gt = diemGiaoTranh(tran, n.doi);
    if (gt) {
      var kc = xaXY(n.x, n.y, gt.x, gt.y);
      var thichDanh = chat.indexOf('fight') >= 0 ? 0.9 : chat.indexOf('thu') >= 0 ? 0.35 : 0.6;
      var xa2 = kc < 260 ? 1 : kc < 480 ? 0.55 : 0.18;
      var p2 = (nghe * (ct.mucTieu === 'lao' ? 0.85 : 0.6) + (1 - nghe) * thichDanh) * xa2 * 0.55;
      if (n.hp / n.hpMax < 0.55) p2 *= 0.35;               /* máu mỏng thì đừng lao vào đám đông */
      /* Đừng chạy vào một đám đánh nhau NẰM TRONG TẦM TRỤ ĐỊCH mà không có lính đỡ. */
      var truOGT = truPhu(tran, gt.x, gt.y, doiKia);
      if (truOGT && !coLinhTa(tran, truOGT.x, truOGT.y, n.doi, truOGT.tam + 40)) p2 *= 0.25;
      if (rng.duoc(giu('tugiup', p2))) return { loai: 'tugiup', x: gt.x, y: gt.y };
    }

    /* 4. đi kèo (gank) — người có chất 'gank' và người đi rừng */
    if ((chat.indexOf('gank') >= 0 || n.vt === 'rung') && tran.t > 90 && tran.t < 1200) {
      var thichGank = ct.rung === 'gank' ? 0.8 : ct.rung === 'cuop' ? 0.35 : 0.4;
      var p3 = nghe * thichGank + (1 - nghe) * (chat.indexOf('gank') >= 0 ? 0.8 : 0.4);
      if (rng.duoc(giu('gank', p3 * 0.04))) {
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
      if (tru && rng.duoc(giu('daytru', 0.5))) return diemDayTru(tran, n, tru);
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

    /* ═══ 6b. THEO KẾ HOẠCH CỦA ĐỘI ═══
       Không có việc gì gấp hơn thì kéo về đúng đường cả đội đang đẩy. Đây là chỗ biến
       năm người đi năm hướng thành một mũi. Người đi rừng và người "đẩy lẻ" được miễn:
       việc của họ vốn là ở chỗ khác. */
    var kh = keHoachDoi(tran, n.doi);
    if (kh.loai === 'day' && (kh.dut || (n.vt !== 'rung' && chat.indexOf('le') < 0))) {
      var truKH = truMoCuaLane(tran, doiKia, kh.lane);
      if (truKH) {
        /* trên đường tới đó, gặp lính thì vẫn ăn — nhưng chỉ lính CÙNG ĐƯỜNG */
        var lk = linhGanNhat(tran, n, 320);
        if (lk && rng.duoc(0.45)) return { loai: 'farm', x: lk.x, y: lk.y };
        return diemDayTru(tran, n, truKH);
      }
    }

    /* 7. mặc định: về đường của mình, đẩy lính */
    var lane = laneCua(n);
    var l = linhGanNhat(tran, n, 700);
    if (l) return { loai: 'farm', x: l.x, y: l.y };
    var tr = truGanNhat(tran, n, 700);
    if (tr) return diemDayTru(tran, n, tr);
    var d2 = diemTren(lane, n.doi === 'xanh' ? 0.42 : 0.58);
    return { loai: 'giulane', x: d2[0], y: d2[1] };
  }

  /** Điểm đứng khi đẩy trụ.
      Có lính nhà mình đỡ đạn thì áp sát mà đập; chưa có thì đứng ngoài mép tầm trụ chờ
      sóng lính tới. Bản trước luôn trả về đúng toạ độ trụ, nên ai cũng ôm lấy chân trụ
      địch mà gõ trong khi trụ bắn thẳng vào mặt. */
  function diemDayTru(tran, n, r) {
    /* Có lính nhà mình đỡ đạn, HOẶC mình còn khoẻ và trụ chưa kịp bắn mình mấy phát —
       thì cứ áp sát mà đập. Chỉ khi mỏng máu mà lại không có lính thì mới đứng ngoài
       mép chờ sóng lính sau. Bản đầu bắt chờ lính trong MỌI trường hợp, và thế là không
       ai phá nổi trụ: 100% số trận hết giờ. */
    var coLinh = coLinhTa(tran, r.x, r.y, n.doi, r.tam + 60);
    var khoe = n.hp / n.hpMax > 0.5 && !(r.leoAi === n.i && r.leo >= 3);
    if (coLinh || khoe) {
      return { loai: 'daytru', x: r.x, y: r.y, tru: r };
    }
    var dx = n.x - r.x, dy = n.y - r.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var can = r.tam + 50;
    return { loai: 'chotru', x: r.x + dx / d * can, y: r.y + dy / d * can, tru: r };
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
          /* `[BẪY ĐÃ SẬP]` Đã thử "siêu lính": sau phút 10 lính khoẻ dần lên, hòng phá
             thế bế tắc cuối trận. Đo ra thì NGƯỢC LẠI — hết giờ tăng từ 63% lên **92%**.
             Lý do rõ ràng khi nhìn lại: lính khoẻ lên cho CẢ HAI BÊN, nên hai sóng lính
             chỉ đâm vào nhau lâu hơn ở giữa đường và chẳng bên nào tới được chân trụ.
             Buff đối xứng không phá được thế bế tắc, nó chỉ làm hàng thủ dày thêm. */
          tran.linh.push({
            doi: doi, lane: lane, t: t, x: p[0] + (i - 1.5) * 8, y: p[1] + (i - 1.5) * 8,
            hp: xa2 ? 380 : 520, hpMax: xa2 ? 380 : 520,
            atk: xa2 ? 34 : 26, tam: xa2 ? 110 : 40, danh: 0,
            giap: 12, khang: 8, vang: xa2 ? 26 : 20, exp: 46, xa: xa2,
            /* bùa Chúa Hang có HẠN: so với đồng hồ trận, không phải chỉ xem có hay không.
               Để nguyên `? 1 : 0` thì đội ăn Chúa Hang đầu tiên có lính mạnh 1.4× tới hết trận — đo được:
               kèo gương mà bên nào ăn Chúa trước thì phá 6.4 trụ, bên kia 3.5. */
            buff: (tran.buff[doi].linh || 0) > tran.t ? 1 : 0,
            /* cùng lý do với `nguoi` ở trên — khai đủ để hình dáng đối tượng đứng yên */
            px: p[0] + (i - 1.5) * 8, py: p[1] + (i - 1.5) * 8,
            huong: null, _h: 0, goc: 0, danhLuc: -9, dinhLuc: -9
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

    /* ── CHỤP VỊ TRÍ ĐẦU TICK ──
       Một tick là 0.25 giây trong trận, còn màn hình vẽ 60 khung một giây. Nếu vẽ thẳng
       x/y hiện tại thì người không đi mà NHẢY: mỗi lần nhảy một quãng 0.25 giây đường
       chạy. Chép lại vị trí cũ ở đây để ui-tran.js nội suy giữa hai tick — đây là thứ
       làm cho trận trông như đang chuyển động chứ không phải một chuỗi ảnh chụp. */
    if (tran.veHinh) {
      tran.nguoi.forEach(function (n) { n.px = n.x; n.py = n.y; });
      tran.linh.forEach(function (l) { l.px = l.x; l.py = l.y; });
    }

    tran.tick++;
    tran.t += TICK;
    knRieng(tran);

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
          n.px = n.x; n.py = n.y;              /* khỏi nội suy cả quãng đường về nhà */
          n.hp = n.hpMax; n.veNha = false;
          n.hoiLuc = tran.t;                   /* mốc để vẽ luồng sáng hồi sinh */
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
        /* Nghĩ lại THƯA HƠN, và việc RÚT thì bám lấy lâu hơn hẳn.
           Cứ 0,8–1,4 giây nghĩ lại một lần là quá dày: chưa đi được nửa đường tới chỗ
           định tới thì đã đổi ý. Riêng lệnh rút mà cũng đổi ý giữa chừng thì thành ra
           chạy hai bước rồi quay lại đấm tiếp — đo được 79% số mạng xảy ra lúc nạn nhân
           ĐANG RÚT, phần lớn là vì rút nửa vời như thế. */
        var lo = n.mucTieu.loai;
        n.dem = (lo === 'rut' || lo === 've') ? 2.4 + rng() * 1.4 : 1.5 + rng() * 1.1;
      }
      var mt = n.mucTieu;

      /* tìm thứ đánh được trong tầm */
      var muc = null;
      var dangRut = mt.loai === 'rut' || mt.loai === 've';
      var dichGan = mucTieuTot(tran, n, cs.tam + 30, cs);
      if (dichGan) muc = dichGan;
      else n.nham = -1;
      /* ═══ ĐANG ĐẨY TRỤ THÌ ĐẬP TRỤ ═══
         `[ĐO TRONG REPO]` Đây là chỗ giấu kỹ nhất của cả đợt này. Thứ tự chọn mục tiêu để
         TRỤ ĐỨNG CUỐI — sau tướng, sau quái rừng, sau quái lớn, và sau cả LÍNH. Mà vây trụ
         thì quanh chân trụ lúc nào chẳng có lính địch. Nên người đi đẩy trụ đứng ngay dưới
         chân trụ… quay ra gõ lính, hết đợt này tới đợt khác.
         Đo được: năm người ở trong tầm trụ địch tổng cộng 775 giây-người mỗi trận. Với
         ~300 sát thương/giây lên trụ thì ngần ấy thời gian đủ phá 48 cái trụ. Thực tế phá
         được **3,35 trên sáu**. Không phải họ không tới nơi — là tới nơi rồi làm việc khác.
         Trụ phải đứng ngay sau tướng: có tướng địch thì đánh tướng, không thì đập trụ. */
      if (!muc && (mt.loai === 'daytru' || mt.loai === 'chotru') && mt.tru && mt.tru.song &&
          xaXY(n.x, n.y, mt.tru.x, mt.tru.y) < cs.tam + 60) muc = mt.tru;
      if (!muc && mt.quai && mt.quai.song && xaXY(n.x, n.y, mt.quai.x, mt.quai.y) < cs.tam + 30) muc = mt.quai;
      if (!muc && mt.mt && mt.mt.song && xaXY(n.x, n.y, mt.mt.x, mt.mt.y) < cs.tam + 40) muc = mt.mt;
      /* Không có tướng địch mà có trụ địch trong tầm thì ĐẬP TRỤ, đừng quay ra gõ lính.
         Trụ phải đứng TRƯỚC lính trong thứ tự ưu tiên: đứng sau lính thì người vây trụ
         vĩnh viễn bận dọn quân, và không trận nào kết thúc được. */
      if (!muc && !dangRut) {
        var trGan = truGanNhat(tran, n, cs.tam + 60);
        if (trGan) muc = trGan;
      }
      if (!muc) {
        var l = linhGanNhat(tran, n, cs.tam + 20);
        if (l) muc = l;
      }

      /* ═══ RÚT LÀ PHẢI CHẠY ═══
         `[ĐO TRONG REPO]` **84% số mạng xảy ra lúc nạn nhân ĐANG RÚT.** Nhìn con số ấy
         thì tưởng quyết định rút tới quá muộn — nhưng lỗi nặng hơn thế: nhánh `if (muc)`
         bên dưới ĐỨNG YÊN MÀ ĐÁNH, và nó chạy trước nhánh di chuyển. Nên hễ còn một kẻ
         địch trong tầm là người "đang rút" **không nhúc nhích một bước nào** — họ đứng đó
         đánh nhau cho tới chết, mang theo cái nhãn `rut`.

         Đây đúng là thứ chủ dự án gọi là "AI ngu": lệnh rút có, mà không ai rút.

         Chỉ có một lý do đáng dừng lại: kết liễu được ngay. Ngoài ra thì chạy. */
      /* `chotru` là ĐỨNG NGOÀI MÉP TẦM TRỤ chờ sóng lính — không phải chạy trốn. Xếp nó
         vào nhóm "đang rút" thì người đứng đó không đánh cả lính đang dọn quân mình, và
         cả pha đẩy đường đứng hình. Chỉ `rut` và `ve` mới là chạy. */
      /* Rút thì VỪA CHẠY VỪA ĐÁNH — đây là kiting, và nó là cách người ta rút thật.
         `[BẪY ĐÃ SẬP]` Bản sửa đầu tiên cắt luôn mục tiêu khi đang rút, tức là "rút thì
         cấm đánh". Nghe hợp lý, đo ra thì hỏng: mọi giao tranh tan ngay khi bắt đầu, vì
         hễ một người thấy mình đang lép vế quân số là bỏ chạy, làm phe mình lép hơn nữa,
         và cả hai bên cùng chạy. Đo được **19 mạng một trận** (bản gốc 93) và **100% số
         trận hết giờ** — không trận nào phân được thắng bại.
         Lỗi thật nằm ở chỗ khác: nhánh đánh và nhánh đi là `if/else`, nên hễ còn kẻ địch
         trong tầm là người "đang rút" KHÔNG NHÚC NHÍCH. Tách hai nhánh ra là xong. */
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
          /* Mốc cho hoạt ảnh: lúc nào ra đòn và ra về hướng nào. ui-tran.js đọc hai số
             này để thọc/vung vũ khí — không có chúng thì tướng đứng im suốt trận. */
          n.danhLuc = tran.t;
          n.danhGoc = Math.atan2(muc.y - n.y, muc.x - n.x);
          n.huong = n.danhGoc;
          /* Dựng đối số TRƯỚC khi gọi thì hieuUng() bỏ đi cũng đã tốn một lần cấp phát.
             Ở bộ đo cân bằng, ngần ấy lần cấp phát nhân với 7,5 triệu tick là hàng phút. */
          if (tran.veHinh) hieuUng(tran, cs.tam > 45
            ? { loai: 'dan', x: n.x, y: n.y, x2: muc.x, y2: muc.y, lop: n.tuong.lop,
                doi: n.doi, vk: G.vuKhiCua ? G.vuKhiCua(n.tuong) : null }
            : { loai: 'chem', x: muc.x, y: muc.y, goc: n.danhGoc, doi: n.doi,
                vk: G.vuKhiCua ? G.vuKhiCua(n.tuong) : null });
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
          /* Buff vị trí ĐI RỪNG của Teamfight Manager 2: "Execute epic monsters on hit
             when their HP is at or below 700". Cắt máu còn dưới ngưỡng thì đòn tiếp theo
             của người đi rừng LẤY LUÔN — nên tranh Rồng / Chúa Hang mà bên kia có người
             đi rừng đứng gần là mất, không cần tính sát thương nữa. Chỉ áp cho quái lớn
             (có `hienRa`), không áp cho tướng hay trụ. */
          if (n.vt === 'rung' && muc.hienRa != null && muc.hp > 0 && muc.hp <= 700) {
            muc.hp = 0;
            hieuUng(tran, { loai: 'cuoi', x: n.x, y: n.y, x2: muc.x, y2: muc.y,
              doi: n.doi, dien: true });
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
          /* ═══ BUNG CHIÊU CUỐI CÓ TÍNH TOÁN ═══
             Bản trước: hễ hồi xong và có tướng địch trong tầm là bung, bất kể đang ở
             đâu với ai. Chiêu cuối hồi 60–74 giây mà đổ vào một con lính thừa đứng lẻ
             thì cả giao tranh sau đó đánh tay không. Bốn điều kiện, và NÃO quyết định
             có nhìn ra hay không: */
          var dichQuanh = 0, taQuanh = 0;
          tran.nguoi.forEach(function (m) {
            if (m.chet > 0) return;
            if (m.doi === n.doi) { if (m !== n && xa(n, m) < 260) taQuanh++; }
            else if (xa(muc, m) < 220) dichQuanh++;
          });
          var dangGiaoTranh = dichQuanh >= 2 || taQuanh >= 1;
          var dangDe = muc.hp / muc.hpMax < 0.22 && dichQuanh <= 1;  /* thừa: auto cũng chết */
          var sapChet = n.hp / n.hpMax < 0.3;                        /* bung để đổi mạng */
          var doiLau = n.cd.cuoi < -25;                              /* ôm quá lâu là phí */
          var nen = (dangGiaoTranh && !dangDe) || sapChet || doiLau;
          if (nen && rng.duoc(0.55 + n.cs.nao / 1200 * 0.4)) {
            dungChieu(tran, n, muc, n.tuong.kn.cuoi, cs);
            n.cd.cuoi = n.tuong.kn.cuoi.hoi;
          }
        }
      } else {
        /* di chuyển */
        var dx = mt.x - n.x, dy = mt.y - n.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var toc = cs.tocchay * TICK * 1.35;
        if (d > 1) n.huong = Math.atan2(dy, dx);
        /* Xạ thủ / pháp sư / hỗ trợ KHÔNG đi thẳng vào tâm đám đánh nhau — họ dừng ở
           mép tầm bắn. Bản trước ai cũng chạy tới đúng toạ độ mục tiêu, nên người bắn
           xa đứng lẫn vào giữa đội hình địch và chết trước tiên. */
        var lui = (cs.tam > 45 && (mt.loai === 'tugiup' || mt.loai === 'gank')) ? cs.tam * 0.72 : 0;
        if (d <= lui) { /* đủ gần rồi, đứng lại chờ */ }
        else if (d > toc) { n.x += dx / d * toc; n.y += dy / d * toc; }
        else { n.x = mt.x; n.y = mt.y; }
      }

      /* ĐANG RÚT thì đi TIẾP, dù vừa ra đòn xong. Chân vẫn chạy, tay vẫn đánh. */
      if (dangRut && muc) {
        var rx = mt.x - n.x, ry = mt.y - n.y;
        var rd = Math.sqrt(rx * rx + ry * ry) || 1;
        var rtoc = cs.tocchay * TICK * 1.35;
        if (rd > rtoc) { n.x += rx / rd * rtoc; n.y += ry / rd * rtoc; }
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
        if (l.danh <= 0) {
          l.danh = 1.1;
          /* Chủ dự án: "lính đánh thường thì thêm cây spear vào cầm trên tay thọc thọc
             nhau, bắn xa thì cầm súng, thấy rõ đạn". Hai mốc dưới là tất cả những gì
             phần vẽ cần để dựng được cú thọc và phát bắn. */
          l.danhLuc = tran.t;
          l.goc = Math.atan2(muc.y - l.y, muc.x - l.x);
          l.huong = l.goc;
          if (tran.veHinh) {
            if (l.xa) hieuUng(tran, { loai: 'dan', x: l.x, y: l.y, x2: muc.x, y2: muc.y,
              lop: 'xa', doi: l.doi, nho: 1, vk: 'sung_ngan' });
            else hieuUng(tran, { loai: 'thoc', x: l.x, y: l.y, x2: muc.x, y2: muc.y,
              goc: l.goc, doi: l.doi, vk: 'thuong' });
          }
          satThuong(tran, l, muc, l.atk * (l.buff ? 1.4 : 1), 'vl', false);
          xuLyChet(tran, l, muc);
        }
      } else {
        var huongDi = (l.doi === 'xanh' ? 1 : -1);
        l.huong = null;                        /* đang đi theo đường, hướng tính từ px/py */
        l.t += huongDi * 0.0016;
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
      /* LUẬT ĐỔI MỤC TIÊU CỦA TRỤ — thứ làm cho "lao vào trụ" là canh bạc.
         Ở mọi game MOBA, trụ đang bắn lính mà có tướng địch đánh tướng nhà mình trong tầm
         thì trụ BỎ LÍNH, quay sang bắn kẻ lao vào ngay lập tức. Thiếu luật này thì đứng
         dưới trụ địch đánh nhau chẳng mất gì, vì trụ còn bận dọn lính. */
      tran.nguoi.forEach(function (m) {
        if (m.doi === r.doi || m.chet > 0) return;
        if (tran.t - m.danhTuongLuc > 1.5) return;
        var nanNhan = tran.nguoi[m.danhTuongAi];
        if (!nanNhan || nanNhan.doi !== r.doi || nanNhan.chet > 0) return;
        if (xaXY(r.x, r.y, m.x, m.y) > r.tam) return;
        if (xaXY(r.x, r.y, nanNhan.x, nanNhan.y) > r.tam) return;
        muc = m;
      });

      if (muc) {
        r.danh = 1.2;
        r.danhLuc = tran.t;
        if (tran.veHinh) hieuUng(tran, { loai: 'tia', x: r.x, y: r.y, x2: muc.x, y2: muc.y, doi: r.doi });
        satThuong(tran, r, muc, r.atk, 'vl'); xuLyChet(tran, r, muc);
      }
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
      if (muc) {
        q.danh = 1.0;
        q.danhLuc = tran.t;
        q.goc = Math.atan2(muc.y - q.y, muc.x - q.x);
        if (tran.veHinh) hieuUng(tran, { loai: 'vuot', x: muc.x, y: muc.y, goc: q.goc, to: 1, doi: 'quai' });
        satThuong(tran, q, muc, q.atk, 'vl'); xuLyChet(tran, q, muc);
      }
    });

    /* ── QUÁI RỪNG ĐÁNH TRẢ ──
       `atk: 40` đã nằm trong dữ liệu bãi quái từ đầu mà KHÔNG CHỖ NÀO ĐỌC: tám bãi
       đứng im cho người ta đập, không vung một cái. Đúng cái lỗi lặp lại của kho này
       (RESEARCH §6). Bốn bãi mỗi bên đối xứng nên thêm đòn đánh không lệch cán cân,
       chỉ làm người đi rừng phải trả giá máu khi ăn bãi — và quan trọng hơn: nhìn vào
       bãi quái là thấy có một trận đánh đang diễn ra. */
    /* Quét hai tick một lần: tám bãi × mười người là tám mươi phép đo khoảng cách, mà
       bãi quái đánh 1,4 giây một đòn nên quét mỗi tick chỉ tốn máy chứ không đổi kết quả.
       Bộ đo tỉ lệ thắng chạy 1600 trận liền một mạch — chỗ này nhân lên là thấy ngay. */
    if (tran.tick % 2 === 0) tran.quai.forEach(function (q) {
      if (!q.song || q.hp <= 0) return;
      q.danh = (q.danh || 0) - TICK * 2;
      if (q.danh > 0) return;
      var mucQ = null, gdQ = 70;
      tran.nguoi.forEach(function (m) {
        if (m.chet > 0) return;
        var d = xaXY(q.x, q.y, m.x, m.y);
        if (d < gdQ) { gdQ = d; mucQ = m; }
      });
      if (!mucQ) return;
      q.danh = 1.4;
      q.danhLuc = tran.t;
      q.goc = Math.atan2(mucQ.y - q.y, mucQ.x - q.x);
      if (tran.veHinh) hieuUng(tran, { loai: 'vuot', x: mucQ.x, y: mucQ.y, goc: q.goc, doi: 'quai' });
      satThuong(tran, q, mucQ, q.atk, 'vl');
      xuLyChet(tran, q, mucQ);
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

  /* ══════════════════ KỸ NĂNG RIÊNG CỦA HUẤN LUYỆN VIÊN ══════════════════
     Mười kỹ năng ở G.KN_RIENG vào tới bộ mô phỏng dưới dạng một dòng trong `heso.ds`
     — tức là một con số nhân vào sát thương, không hơn. Người chơi chọn huấn luyện
     viên phần lớn VÌ kỹ năng ấy, mà suốt trận không thấy nó xuất hiện lần nào.

     `hesoTu()` bên giai.js giờ gắn kèm `heso.rieng = {id, ten, pha, dk}`. Ở đây canh
     đúng lúc điều kiện của nó bật lên — bước vào giai đoạn của mình, hoặc đội bắt đầu
     bị dí — rồi bắn ra một hào quang phủ cả đội và một dòng băng. Chỉ là phần TRÌNH
     BÀY: không đụng vào con số nào, nên không đổi kết quả trận. */
  function phaCua(t) {
    return t < 600 ? 'dau' : t < 1320 ? 'giua' : 'cuoi';
  }

  function knRieng(tran) {
    if (tran.tick % 8 !== 0) return;                 /* 2 giây một lần là đủ */
    ['xanh', 'do'].forEach(function (doi) {
      var ben = doi === 'xanh' ? 'ta' : 'dich';
      var h = tran.cau[ben] && tran.cau[ben].heso;
      var r = h && h.rieng;
      if (!r) return;
      var bat = (r.pha === 'luon' || r.pha === phaCua(tran.t));
      if (bat && r.dk === 'thua') {
        bat = (doi === 'xanh' ? tran.vang.xanh < tran.vang.do : tran.vang.do < tran.vang.xanh);
      }
      if (!bat) { r._dang = false; return; }
      if (r._dang) return;                            /* chỉ nổ ở MÉP bật lên */
      r._dang = true;
      var song = tran.nguoi.filter(function (n) { return n.doi === doi && n.chet <= 0; });
      if (!song.length) return;
      var mx = 0, my = 0;
      song.forEach(function (n) { mx += n.x; my += n.y; });
      hieuUng(tran, { loai: 'hlv', kn: r.id, ten: r.ten, doi: doi,
        x: mx / song.length, y: my / song.length,
        ds: song.map(function (n) { return n.i; }) });
      tran.suKien.push({ t: tran.t, loai: 'knRieng', doi: doi, ten: r.ten, kn: r.id });
    });
  }

  /* ══════════════════ chiêu ══════════════════ */
  function dungChieu(tran, n, muc, kn, cs) {
    var h = kn.h || {};
    /* `tuong` + `kn` là hai trường quan trọng nhất ở đây: nhờ chúng mà ui-tran.js tra
       được G.FX_CHIEU và vẽ ĐÚNG mặt của chiêu ấy, thay vì một cái vòng loang dùng
       chung cho cả bốn mươi chiêu như bản trước. `ten` đi kèm để hiện tên chiêu trên
       đầu người dùng — nhìn một cái là biết vừa bung gì. */
    n.niemLuc = tran.t;
    n.niemTen = kn.ten;
    n.niemCuoi = kn.loai === 'cuoi';
    if (muc) n.huong = Math.atan2(muc.y - n.y, muc.x - n.x);
    hieuUng(tran, {
      loai: kn.loai === 'cuoi' ? 'cuoi' : 'chieu',
      tuong: n.tuong.id, kn: kn.loai === 'cuoi' ? 'cuoi' : 'chieu',
      x: n.x, y: n.y,
      x2: (muc && muc.x) || n.x, y2: (muc && muc.y) || n.y,
      dien: !!(h.dmg && h.dmg.dien), pt: !!(h.dmg && h.dmg.loai === 'pt'),
      hoi: !!h.hoi, chan: !!h.chan, kc: !!h.kc, doi: n.doi, ten: kn.ten, ai: n.i
    });
    var suc = h.dmg ? ((h.dmg.loai === 'pt' ? cs.ap : cs.atk) * (h.dmg.g || 0) + (h.dmg.c || 0)) : 0;
    /* đồ Tiên Tri Vực Thẳm (dac `no_dien`): kỹ năng gây thêm 12% sát thương */
    if (coDac(n, 'no_dien')) suc *= 1.12;
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

    /* đồ Quạ Hoàng Hôn (dac `chan_phep`): chặn đứng một kỹ năng, 60 giây một lần.
       Chặn ở ĐÂY, trước khi tính sát thương, để chặn cả sát thương lẫn hiệu ứng đi kèm
       (choáng, làm chậm) — chặn sau thì người bị khống chế xong mới thấy mình "chặn được".
       Trước đây `bi.hieu.chanPhep` được satThuong() đọc nhưng KHÔNG AI GÁN nó. */
    var chanBoi = null;
    if (h.dmg || h.kc || h.khoa || h.muMat) {
      for (var iC = 0; iC < dsMuc.length && !chanBoi; iC++) {
        var mc = dsMuc[iC];
        if (mc && mc.tuong && coDac(mc, 'chan_phep') && (mc.cdChanPhep || 0) <= tran.t) chanBoi = mc;
      }
    }
    if (chanBoi) {
      chanBoi.cdChanPhep = tran.t + 60;
      soBay(tran, { x: chanBoi.x, y: chanBoi.y, chu: 'chặn', loai: 'ne' });
      if (G.veFX) { /* hiệu ứng khiên vẽ ở ui-tran qua hieuUng bên trên */ }
      tran.suKien.push({ t: tran.t, loai: 'chanPhep', ai: chanBoi.i, ten: kn.ten });
      return;
    }

    dsMuc.forEach(function (m, iM) {
      if (!m || m.hp <= 0) return;
      /* CƠ của người bị đánh = né chiêu. Đây là chỗ chỉ số CƠ nói tiếng nói rõ nhất. */
      if (m.tuong && !m.hieu.mienKc && tran.rng.duoc(G.kep(m.cs.co / 1200 * 0.22, 0, 0.22))) {
        soBay(tran, { x: m.x, y: m.y, chu: 'né', loai: 'ne' });
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
      /* đồ Màn Huỷ Diệt (dac `giam_hoi`): kẻ địch đứng quanh người mang nó bị giảm 40%
         hiệu quả hồi máu. Đây là món phản đội có Thầy Thuốc — không có dòng này thì cả
         nhánh LỤA tầng 4 chỉ là một cục kháng phép. */
      var camHoi = 0;
      tran.nguoi.forEach(function (m) {
        if (m.doi === n.doi || m.chet > 0) return;
        if (coDac(m, 'giam_hoi') && xa(n, m) < 320) camHoi = 1;
      });
      if (camHoi) luong *= 0.6;
      var ds = h.doi ? tran.nguoi.filter(function (m) { return m.doi === n.doi && m.chet <= 0 && xa(n, m) < 200; }) : [nguoiYeuNhat(tran, n)];
      ds.forEach(function (m) {
        if (!m) return;
        var truoc = m.hp;
        var luongM2 = luong + (h.hoi.phanTramMau ? m.hpMax * h.hoi.phanTramMau * (h.lap || 1) : 0);
        m.hp = Math.min(m.hpMax, m.hp + luongM2);
        n.hoi += m.hp - truoc;
        soBay(tran, { x: m.x, y: m.y, chu: '+' + Math.round(m.hp - truoc), loai: 'hoi' });
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

      /* Buff vị trí HỖ TRỢ của Teamfight Manager 2: "On last hit, the nearest ally
         receives the gold". Người hỗ trợ ăn lính thì tiền sang tay ĐỒNG ĐỘI GẦN NHẤT,
         không vào ví mình — đó là cái làm cho hỗ trợ đứng cạnh xạ thủ có ích thật, chứ
         không phải chỉ là một người ít vàng. Không có ai gần thì đành tự giữ. */
      var nhan = ke;
      if (ke.vt === 'ho') {
        var ganNhat = null, dGan = 1e9;
        tran.nguoi.forEach(function (m) {
          if (m.doi !== ke.doi || m === ke || m.chet > 0) return;
          var d = xaXY(m.x, m.y, bi.x, bi.y);
          if (d < 520 && d < dGan) { dGan = d; ganNhat = m; }
        });
        if (ganNhat) nhan = ganNhat;
      }
      nhan.vang += them;
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
