/* sim.js — bộ mô phỏng trận đấu 5v5, chạy trên SỐ CỦA TEAMFIGHT MANAGER 2.

   Chủ dự án (2026-09-25): "copy hết skill + config + stats + equip + time của tfm2". Mọi con số
   của trận — chỉ số tướng và tăng theo cấp, kinh nghiệm mỗi cấp, vàng, hồi sinh, lính, quái,
   trụ, lõi, đồ, nhịp ra đòn (cooltime / duration / start_timing) — đọc từ window.TFM
   (js/data-tfm.js, sinh từ tệp cài đặt của TFM2). Bảng hằng số tự chế của bản trước (hãm
   tướng-đánh-tướng 0,40, trụ leo thang, tướng đập trụ ×1,8, giá mạng theo chuỗi…) BỎ HẾT:
   nhịp trận phải là nhịp của số TFM2, đo được ở RESEARCH §14.

   Nguyên tắc gốc vẫn giữ (RESEARCH §2.2): **chỉ số của người chơi KHÔNG cộng vào sát thương —
   nó đổi cách người đó ra quyết định.** Lớp huấn luyện của game này (thông thạo N→UR, CƠ/BỀN/
   LỰC/LÌ/NÃO) là mấy hệ số ±10–14% nhân vào, nằm ở chiSoNguoi / satThuong — đó là phần "của
   game này", không phải của TFM2, và ghi rõ ở §14.2.

   Đơn vị: sân 0..1000 (1 đơn vị = 960 đơn vị TFM2), giây (1 tick TFM2 = 1/60 giây). Bước thời
   gian của sim là `TICK` — chọn theo phép đo ở §14.1. Mọi bộ đếm trong sim tính bằng GIÂY,
   nên đổi TICK không đổi luật.

   Mọi thứ ở đây là số. Vẽ nằm ở ui-tran.js; chiêu nằm ở chieu.js (qua `G._sim`). Có thể chạy
   toàn bộ trận không vẽ một khung nào — đó là lý do ba phần tách hẳn nhau.
*/
(function (G) {
  'use strict';

  var TFM = G.TFM, CAI = TFM.cai;
  var TPS = G.TFM_TPS;                         /* 60 tick TFM2 một giây */
  var kc = G.kcTFM, giay = G.giayTFM;
  /* `[ĐO TRONG REPO]` §14.1: 60 Hz = đúng tick TFM2 (start_timing 13 tick là 13 tick, không làm
     tròn), 2,1 s một trận trong Node; 30 Hz 1,26 s; 20 Hz 0,94 s — kết quả trận giống nhau.
     Chọn 60. Bộ đo đặt G.SIM_TICK_DAT trước khi nạp để so nhịp. */
  var TICK = G.SIM_TICK_DAT || 1 / 60;
  var MOI_GIAY = Math.round(1 / TICK);         /* số tick sim trong một giây */
  var BK = kc(CAI.champion_radius);            /* bán kính người, đơn vị sim (~10,4) */
  var TAM_NHIN = kc(CAI.visible_distance);     /* 135 */
  var TAM_EXP = kc(CAI.minion_wave_setting.exp_range);   /* chia kinh nghiệm trong bán kính này */
  var DAI_TOI_DA = 40 * 60;                    /* TFM2 không có trần giờ; sim cần một trần để bộ đo dừng */

  /* ══════════ BẢN ĐỒ 5v5 CỦA TEAMFIGHT MANAGER 2 (RESEARCH §13) ══════════ */
  var BD = G.BAN_DO;
  var NHA = BD.gieng;
  var DUONG = BD.duong;
  var TRU = BD.tru;
  var BAI = BD.bai;
  var LOAI_BAI = { ong: 'bee_jungle', nam: 'mushroom_jungle', tegiac: 'rhino_jungle', goc: 'tree_jungle' };

  /* ══════════ TƯỜNG VÀ TÌM ĐƯỜNG (RESEARCH §13.3) ══════════ */
  var SO_O = BD.o, CO_O = 1000 / SO_O, SO_O2 = SO_O * SO_O;
  var CHAN = new Uint8Array(SO_O2);
  for (var io = 0; io < SO_O2; io++) CHAN[io] = BD.tuong.charCodeAt(io) === 49 ? 1 : 0;
  var THAY = (function () {
    var s = typeof atob === 'function' ? atob(BD.thay) : Buffer.from(BD.thay, 'base64').toString('binary');
    var a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  })();
  function thay(a, b) { var k = a * SO_O2 + b; return (THAY[k >> 3] >> (k & 7)) & 1; }
  function oCua(x, y) {
    var cx = Math.floor(x / CO_O), cy = Math.floor(y / CO_O);
    if (cx < 0) cx = 0; else if (cx >= SO_O) cx = SO_O - 1;
    if (cy < 0) cy = 0; else if (cy >= SO_O) cy = SO_O - 1;
    return cy * SO_O + cx;
  }
  var GAN = new Int16Array(SO_O2);
  for (var ig = 0; ig < SO_O2; ig++) {
    if (!CHAN[ig]) { GAN[ig] = ig; continue; }
    var tot = -1, dTot = 1e9;
    for (var jg = 0; jg < SO_O2; jg++) {
      if (CHAN[jg]) continue;
      var ddx = (jg % SO_O) - (ig % SO_O), ddy = Math.floor(jg / SO_O) - Math.floor(ig / SO_O);
      if (ddx * ddx + ddy * ddy < dTot) { dTot = ddx * ddx + ddy * ddy; tot = jg; }
    }
    GAN[ig] = tot;
  }
  var BUOC = new Array(SO_O2);
  var HX = [1, 0, -1, 0, 1, -1, 1, -1], HY = [0, 1, 0, -1, 1, 1, -1, -1];
  function bangToi(dich) {
    if (BUOC[dich]) return BUOC[dich];
    var ke = new Int16Array(SO_O2).fill(-1), hang = new Int16Array(SO_O2), dau = 0, cuoi = 0;
    ke[dich] = dich; hang[cuoi++] = dich;
    while (dau < cuoi) {
      var c = hang[dau++], cx = c % SO_O, cy = (c - cx) / SO_O;
      for (var h = 0; h < 8; h++) {
        var nx = cx + HX[h], ny = cy + HY[h];
        if (nx < 0 || ny < 0 || nx >= SO_O || ny >= SO_O) continue;
        var n = ny * SO_O + nx;
        if (ke[n] >= 0 || CHAN[n]) continue;
        if (h >= 4 && (CHAN[cy * SO_O + nx] || CHAN[ny * SO_O + cx])) continue;
        ke[n] = c; hang[cuoi++] = n;
      }
    }
    BUOC[dich] = ke;
    return ke;
  }
  var DIEM_DI = [0, 0];
  function diemDi(x, y, tx, ty) {
    var a = oCua(x, y), b = oCua(tx, ty);
    if (a === b || (!CHAN[b] && thay(a, b))) { DIEM_DI[0] = tx; DIEM_DI[1] = ty; return DIEM_DI; }
    if (CHAN[a]) a = GAN[a];
    b = GAN[b];
    var ke = bangToi(b), c = ke[a];
    if (c < 0) { DIEM_DI[0] = tx; DIEM_DI[1] = ty; return DIEM_DI; }
    for (var k = 0; k < 12 && c !== b; k++) {
      var n = ke[c];
      if (n < 0 || !thay(a, n)) break;
      c = n;
    }
    if (c === b) { DIEM_DI[0] = tx; DIEM_DI[1] = ty; return DIEM_DI; }
    DIEM_DI[0] = (c % SO_O + 0.5) * CO_O; DIEM_DI[1] = (Math.floor(c / SO_O) + 0.5) * CO_O;
    return DIEM_DI;
  }
  function catTuong(x0, y0, x1, y1) {
    var m = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 3) || 1;
    for (var k = 1; k <= m; k++) if (CHAN[oCua(x0 + (x1 - x0) * k / m, y0 + (y1 - y0) * k / m)]) return true;
    return false;
  }
  /** bước một đoạn `toc` về phía (tx, ty), vòng quanh tường; trả về true nếu đã tới nơi */
  function buocToi(n, tx, ty, toc) {
    var p = diemDi(n.x, n.y, tx, ty);
    var dx = p[0] - n.x, dy = p[1] - n.y, d = Math.sqrt(dx * dx + dy * dy);
    var nx = p[0], ny = p[1], toi = true;
    if (d > toc) { nx = n.x + dx / d * toc; ny = n.y + dy / d * toc; toi = false; }
    if (catTuong(n.x, n.y, nx, ny)) {
      if (!catTuong(n.x, n.y, nx, n.y)) ny = n.y;
      else if (!catTuong(n.x, n.y, n.x, ny)) nx = n.x;
      else {
        var oc = oCua(n.x, n.y);
        nx = n.x + ((oc % SO_O + 0.5) * CO_O - n.x) * 0.5;
        ny = n.y + ((Math.floor(oc / SO_O) + 0.5) * CO_O - n.y) * 0.5;
      }
      toi = false;
    }
    n.x = nx; n.y = ny;
    var o = oCua(n.x, n.y);
    if (CHAN[o]) { var g = GAN[o]; n.x = (g % SO_O + 0.5) * CO_O; n.y = (Math.floor(g / SO_O) + 0.5) * CO_O; }
    return toi && p[0] === tx && p[1] === ty;
  }
  G.SIM_DIEM_DI = diemDi;
  G.SIM_CHAN = function (x, y) { return CHAN[oCua(x, y)] === 1; };

  /* ══════════ dữ liệu trình bày (không đọc lại trong luồng tính) ══════════ */
  function hieuUng(tran, o) {
    if (!tran.veHinh) return;
    o.t = tran.t;
    tran.hieu.push(o);
    if (tran.hieu.length > 300) tran.hieu.shift();
  }
  function soBay(tran, o) {
    if (!tran.veHinh) return;
    o.t = tran.t;
    tran.bay.push(o);
    if (tran.bay.length > 400) tran.bay.shift();
  }

  function xa(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function xaXY(x1, y1, x2, y2) { var dx = x1 - x2, dy = y1 - y2; return Math.sqrt(dx * dx + dy * dy); }
  function doiKia(doi) { return doi === 'xanh' ? 'do' : 'xanh'; }

  /** điểm trên đường theo tỉ lệ 0..1 */
  var DAI_DUONG = {};
  function diemTren(lane, t) {
    var wp = DUONG[lane];
    var tong = 0, i, d = [];
    for (i = 1; i < wp.length; i++) { var l = xaXY(wp[i][0], wp[i][1], wp[i - 1][0], wp[i - 1][1]); d.push(l); tong += l; }
    DAI_DUONG[lane] = tong;
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
  ['tren', 'giua', 'duoi'].forEach(function (l) { diemTren(l, 0); });

  /* ══════════ bậc tăng trưởng của lính / quái theo giờ trận (minion_wave_setting) ══════════ */
  var SONG = CAI.minion_wave_setting;
  function bacTang(t) {
    var tick = t * TPS;
    if (tick < SONG.growth_start_tick) return 0;
    var toiDa = Math.floor((SONG.growth_end_tick - SONG.growth_start_tick) / SONG.growth_tick) + 1;
    return Math.min(toiDa, Math.floor((tick - SONG.growth_start_tick) / SONG.growth_tick) + 1);
  }
  function chiSoQuai(cau, buoc) {
    var s = cau.stat, g = cau.growth || {};
    return {
      hp: s.hp + (g.hp || 0) * buoc, atk: s.attack + (g.attack || 0) * buoc,
      giap: s.defence + (g.defence || 0) * buoc, khang: s.magic_resistance + (g.magic_resistance || 0) * buoc,
      tocchay: (s.move_speed + (g.move_speed || 0) * buoc) * TPS / G.TFM_DV
    };
  }

  /* ══════════════════════════════════════════════════════════
     TẠO TRẬN
     cau = { ta: { ten, mau, nguoi: [ {vt, tuyenthuId, tuongId, tt, chat, ego, cs:{co,ben,luc,li,nao}, ten} ×5 ],
                   heso, chienThuat }, dich: {…}, nhip }
     ══════════════════════════════════════════════════════════ */
  G.taoTran = function (cau, hat) {
    var rng = G.Rng(hat || (Date.now() & 0x7fffffff));

    var tran = {
      rng: rng, t: 0, tick: 0, daiToiDa: DAI_TOI_DA, xong: false, thang: null,
      cau: cau, veHinh: false,
      nguoi: [], linh: [], tru: [], quai: [], quaiLon: {},
      dan: [], vung: [], hen: [], chanDan: [],
      suKien: [], thoai: [], bay: [], hieu: [],
      vang: { xanh: 0, do: 0 }, mang: { xanh: 0, do: 0 },
      truHa: { xanh: 0, do: 0 }, rongHa: { xanh: 0, do: 0 }, chuaHa: { xanh: 0, do: 0 },
      chart: [], buff: { xanh: { linh: 0, linhLan: 0, serpen: 0 }, do: { linh: 0, linhLan: 0, serpen: 0 } },
      keHoach: { xanh: null, do: null },
      songLinh: 0, matNguoi: { xanh: -999, do: -999 },
      /* tầng đội của bộ não TFM2 và số đếm cho bộ đo (RESEARCH §16) */
      doiNao: { xanh: taoNao(), do: taoNao() },
      thongKe: { boCuoc: {}, loi: { lapse: 0, misjudge: 0, tuChoi: 0, ngheNham: 0, chetKhiLapse: 0 }, rut: {},
        gankDi: 0, gankMang: 0, goiTapTrung: 0, tranhQuai: 0, cuopThu: 0 }
    };

    ['ta', 'dich'].forEach(function (ben) {
      var doi = ben === 'ta' ? 'xanh' : 'do';
      cau[ben].nguoi.forEach(function (n) {
        var t = G.TUONG_THEO_ID[n.tuongId];
        if (!t) throw new Error('không có tướng ' + n.tuongId);
        var heTT = G.TT_THEO_ID[n.tt || 'SR'].heso;
        var v = diemTren(n.vt === 'rung' ? 'giua' : (n.vt === 'ho' ? 'duoi' : n.vt), doi === 'xanh' ? 0.06 : 0.94);
        var cs1 = G.tuongOCap(t, 1);
        var hp0 = cs1.hp * heTT * (1 + 0.14 * G.kep((n.cs && n.cs.ben || 0) / 1200, 0, 1));
        tran.nguoi.push({
          i: tran.nguoi.length, doi: doi, ben: ben, vt: n.vt,
          tuong: t, ten: n.ten, ttId: n.tuyenthuId,
          tt: n.tt || 'SR', heTT: heTT,
          chat: n.chat || ['thu'], ego: n.ego == null ? 40 : n.ego,
          cs: n.cs || { co: 600, ben: 600, luc: 600, li: 600, nao: 600 },
          heso: cau[ben].heso || {},
          cap: 1, exp: 0, vang: CAI.start_gold, do: [],
          hp: hp0, hpMax: hp0,
          x: v[0], y: v[1], nha: NHA[doi].slice(),
          /* nhịp ra đòn của TFM2 */
          cd: { danh: 0, skill: 0, skill2: 0, ult: 0 }, hanh: null,
          k: 0, d: 0, a: 0, dmg: 0, nhan: 0, hoi: 0,
          chet: 0, veNha: false, hoiVe: 0, mucTieu: null, dem: 0,
          /* trạng thái */
          buff: [], dot: [], chan: [], hieu: {},
          kc: 0, kcLoai: '', troi: 0, im: 0, so: 0, soAi: -1, khieu: 0, khieuAi: -1,
          anMinh: 0, khongChon: 0, batTu: 0, mienKc: 0,
          chamMuc: 0, chamDen: 0, lao: null, ep: null,
          lanCuoi: -99, dinhLuc: -9,
          /* ── HÌNH DÁNG ĐỐI TƯỢNG KHAI ĐỦ Ở ĐÂY (RESEARCH §7.8: gắn thêm giữa trận làm V8 chậm 2,4 lần) ── */
          px: v[0], py: v[1], huong: null, _h: 0,
          danhLuc: -9, danhGoc: 0, niemLuc: -9, niemTen: '', niemCuoi: false, niemKn: '',
          hoiLuc: -9, tTran: 0, _cs: null, _csTick: -1,
          truBan: -99, danhTuongLuc: -99, danhTuongAi: -1, nham: -1, nhamLuc: -9,
          mucCu: null, kyLuat: false, _hoiSinhTai: false, _tran: null,
          /* bộ não TFM2 (§16): lời gọi của đội, đứng hình (lapse), lý do rút, bắt lẻ, nghe mục tiêu chung */
          goi: null, lapseDen: -9, rutLyDo: '', gankAi: -1, gankLuc: -99, ngheAi: -1, ngheLuc: -99, _laoTru: false,
          /* móc cho chiêu / nội tại (§16.6): giải giới, đòn đánh kế tiếp, phân tán sát thương, liên kết, móc sự kiện */
          giaiGioi: 0, donKe: null, phanTan: null, lienKet: null, moc: { biDanh: null, giet: null }, _batDau: false
        });
      });
    });

    /* trụ: 2 mỗi đường mỗi bên (tower), 2 trụ đôi trước nhà (twin_tower), lõi (nexus) */
    function tru(cau2, o) {
      var s = cau2.stat, a = cau2.attack || null;
      return G.gop({
        hp: s.hp, hpMax: s.hp, giap: s.defence, khang: s.magic_resistance, atk: s.attack,
        tam: a ? kc(a.range) : 0, hoi: a ? giay(a.cooltime) : 0, tocDan: a ? kc(a.speed) * TPS : 0,
        danh: 0, song: true, laTru: true, mucAi: null, vangTru: cau2.gold || 0,
        danhLuc: -9, dinhLuc: -9, nha: false, loi: false
      }, o);
    }
    TRU.forEach(function (r) {
      tran.tru.push(tru(CAI.tower, { lane: r[0], doi: r[2], t: r[1], x: r[3], y: r[4] }));
    });
    ['xanh', 'do'].forEach(function (d) {
      BD.nha[d].forEach(function (p) {
        tran.tru.push(tru(CAI.twin_tower, { lane: 'nha', doi: d, t: 0, x: p[0], y: p[1], nha: true }));
      });
      tran.tru.push(tru(CAI.nexus, { lane: 'loi', doi: d, t: 0, x: BD.loi[d][0], y: BD.loi[d][1], loi: true }));
    });

    /* quái rừng: bốn bãi mỗi bên, loại quái đọc từ bản đồ */
    BAI.forEach(function (b, i) {
      var cau2 = CAI[LOAI_BAI[b[3]]];
      var c0 = chiSoQuai(cau2, 0);
      tran.quai.push({ i: i, x: b[0], y: b[1], gan: b[2], loai: b[3], cau: cau2,
        hp: 0, hpMax: c0.hp, atk: c0.atk, giap: c0.giap, khang: c0.khang,
        tam: kc(cau2.attack.range), hoiDanh: giay(cau2.attack.cooltime),
        song: false, hoi: giay(cau2.first_spawn_tick), vang: cau2.gold, exp: cau2.exp,
        danh: 0, danhLuc: -9, goc: 0, dinhLuc: -9, mucAi: null });
    });
    /* hai quái lớn: Chúa Hang = epic (Morgard) góc trên trái, Rồng = serpen góc dưới phải */
    [['chua', 'Chúa Hang', CAI.epic_jungle, BD.quaiLon.chua], ['rong', 'Rồng', CAI.serpen_jungle, BD.quaiLon.rong]].forEach(function (q) {
      var cau2 = q[2], c0 = chiSoQuai(cau2, 0);
      tran.quaiLon[q[0]] = { id: q[0], ten: q[1], x: q[3][0], y: q[3][1], cau: cau2,
        hp: 0, hpMax: c0.hp, atk: c0.atk, giap: c0.giap, khang: c0.khang,
        tam: kc(cau2.attack.range), hoiDanh: giay(cau2.attack.cooltime),
        song: false, hienRa: giay(cau2.first_spawn_tick), vang: cau2.gold, exp: cau2.exp, lan: 0,
        danh: 0, danhLuc: -9, goc: 0, dinhLuc: -9, mucAi: null };
    });

    /* sóng lính đầu ở tick 10, rồi mỗi 660 tick */
    henSau(tran, giay(SONG.start_tick), function () { raLinh(tran); });
    return tran;
  };
  G.gop = G.gop || function (a, b) { for (var k in b) a[k] = b[k]; return a; };

  /* ══════════════════ chỉ số ══════════════════ */
  /* Lớp huấn luyện của game này (DESIGN §2.1): biên hẹp, nhỏ hơn giá một quyết định sai */
  function heLuc(n) { return 0.89 + 0.21 * G.kep((n.cs && n.cs.luc || 0) / 1200, 0, 1); }
  function heBen(n) { return 1 + 0.14 * G.kep((n.cs && n.cs.ben || 0) / 1200, 0, 1); }
  function heCo(n) { return 1 + 0.12 * G.kep((n.cs && n.cs.co || 0) / 1200, 0, 1); }
  function heCuoiTran(n) {
    var thua = ((n.tTran || 0) - 18 * 60) / 60;
    if (thua <= 0) return 1;
    return 1 - Math.min(0.25, thua * 0.015 * (1 - G.kep((n.cs && n.cs.ben || 0) / 1200, 0, 1)));
  }
  G.heBenNguoi = heBen;

  var CS_RONG = { atkM: 1, apM: 1, giapM: 1, khangM: 1, tocchay: 1 };   /* epic_permanent_stat: ×3% mỗi Rồng */
  function chiSoNguoi(tran, n) {
    if (n._csTick === tran.tick && n._cs) return n._cs;
    var cs = G.tuongOCap(n.tuong, n.cap);
    var d = G.congDo(n.do);
    var b = {};
    for (var i = 0; i < n.buff.length; i++) { var bc = n.buff[i].cs; for (var k in bc) b[k] = (b[k] || 0) + bc[k]; }
    var rong = tran.buff[n.doi].serpen || 0;
    if (rong) for (var kr in CS_RONG) b[kr] = (b[kr] || 0) + CS_RONG[kr] * 3 * rong * (kr === 'tocchay' ? 1 / 3 : 1);
    var he = n.heTT;
    var kL = heLuc(n) * heCuoiTran(n);
    function s(k) { return (d[k] || 0) + (b[k] || 0); }
    var r = {
      atk: (cs.atk + s('atk')) * (1 + s('atkM') / 100) * he * kL,
      ap: (cs.ap + s('ap')) * (1 + s('apM') / 100) * he * kL,
      hpMax: (cs.hp + s('hp')) * (1 + s('hpM') / 100) * he * heBen(n),
      giap: Math.max(0, (cs.giap + s('giap')) * (1 + s('giapM') / 100) * he),
      khang: Math.max(0, (cs.khang + s('khang')) * (1 + s('khangM') / 100) * he),
      tam: cs.tam + kc(s('tam')),
      tocdanh: cs.tocdanh * Math.max(0.2, 1 + s('tocdanh') / 100) * heCo(n),
      tocchay: cs.tocchay * Math.max(0.15, 1 + s('tocchay') / 100) * (n.chamDen > tran.t ? 1 - n.chamMuc / 100 : 1),
      hoiChieu: G.kep(s('hoiChieu'), 0, 70), hoiCuoi: G.kep(s('hoiCuoi'), 0, 70),
      vamp: s('vamp'), crit: s('crit'), xuyenGiap: s('xuyenGiap'), xuyenKhang: s('xuyenKhang'),
      giamDanh: s('giamDanh'), giamChieu: s('giamChieu'), giamNhan: s('giamNhan'), tangNhan: s('tangNhan'),
      kienCuong: s('kienCuong'), giamHoi: s('giamHoi'), phanDon: s('phanDon'), hpRegen: cs.hpRegen + s('hpRegen'),
      mienKc: !!(b.mienKc), batTu: !!(b.batTu), dac: d.dac
    };
    /* buff vị trí ĐI RỪNG của TFM2: +20% tốc chạy (ở đây: ngoài giao tranh) */
    if (n.vt === 'rung' && tran.t - n.lanCuoi > 4) r.tocchay *= 1 + CAI.jungle_move_speed_bonus / 100;
    n._cs = r; n._csTick = tran.tick;
    return r;
  }

  /** hệ số đội theo kỹ năng huấn luyện viên, giai đoạn trận, và tình thế (lớp của game này) */
  function hesoDoi(tran, doi, loai) {
    var ben = doi === 'xanh' ? 'ta' : 'dich';
    var h = tran.cau[ben].heso || {};
    var pha = tran.t < 480 ? 'dau' : tran.t < 900 ? 'giua' : 'cuoi';
    var cheech = (tran.vang[doi] - tran.vang[doiKia(doi)]);
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

  /* ══════════════════ SÁT THƯƠNG ══════════════════
     Công thức giáp: TFM2 không ghi trong dữ liệu (§14.2), giữ 100/(100+giáp) của bản trước.
     Xuyên giáp/kháng của đồ trừ phần trăm giáp trước khi tính. Lá chắn ăn trước máu. */
  function satThuong(tran, ke, bi, luong, loai, o) {
    o = o || {};
    if (bi.hp <= 0 || (bi.tuong && bi.chet > 0) || (bi.song === false && !bi.tuong)) return 0;
    var csB = bi.tuong ? chiSoNguoi(tran, bi) : { giap: bi.giap || 0, khang: bi.khang || 0 };
    var csK = ke.tuong ? chiSoNguoi(tran, ke) : null;
    var thuc;
    if (loai === 'thuc') thuc = luong;
    else {
      var def = loai === 'pt' ? csB.khang : csB.giap;
      var xuyen = csK ? (loai === 'pt' ? csK.xuyenKhang : csK.xuyenGiap) : 0;
      def *= 1 - G.kep(xuyen, 0, 100) / 100;
      thuc = luong * 100 / (100 + Math.max(0, def));
    }
    /* LÌ = bản lĩnh lúc nguy: dưới 40% máu thì người LÌ cao chịu đòn tốt hơn tới 25% (lớp game này) */
    if (bi.tuong && bi.hp < bi.hpMax * 0.4) thuc *= 1 - 0.25 * G.kep(bi.cs.li / 1200, 0, 1);
    if (ke.tuong) thuc *= hesoDoi(tran, ke.doi, 'sat');
    if (bi.tuong) {
      thuc /= hesoDoi(tran, bi.doi, 'chiu');
      if (o.danh && csB.giamDanh) thuc *= 1 - csB.giamDanh / 100;
      if (o.chieu && csB.giamChieu) thuc *= 1 - csB.giamChieu / 100;
      if (csB.giamNhan) thuc *= Math.max(0, 1 - csB.giamNhan / 100);
      if (csB.tangNhan) thuc *= 1 + csB.tangNhan / 100;
      if (bi.hieu.giamNhan) thuc *= 1 - bi.hieu.giamNhan;
      bi.dinhLuc = tran.t;
    }
    /* trụ bắn lính: TFM2 chặn ở from_tower_damage % máu tối đa mỗi phát (30 cận / 80 xa) */
    if (ke.laTru && bi.linh) thuc = Math.min(thuc, bi.hpMax * bi.tuTru / 100);
    if (ke.tuong && bi.tuong) { ke.danhTuongLuc = tran.t; ke.danhTuongAi = bi.i; }
    if (ke.laTru && bi.tuong) bi.truBan = tran.t;

    if (bi.tuong && !o.lienKet) {
      /* liên kết / chịu hộ (§16.6): một phần sát thương chuyển sang người kia (không dội ngược) */
      var lk = bi.lienKet;
      if (lk && lk.den > tran.t && lk.voi && lk.voi.chet <= 0 && lk.voi.hp > 0) {
        var chuyen = thuc * lk.pt / 100;
        thuc -= chuyen;
        satThuong(tran, ke, lk.voi, chuyen, 'thuc', { ghiNhan: false, lienKet: true });
      }
      /* phân tán: X % sát thương nhận biến thành sát thương trả dần trong `lau` giây */
      var ptn = bi.phanTan;
      if (ptn && ptn.den > tran.t) {
        var doi = thuc * ptn.pt / 100;
        thuc -= doi; ptn.no += doi; ptn.moiGiay += doi / ptn.lau;
      }
    }
    /* lá chắn ăn trước; khiên có `khiVo` thì báo lúc bị đánh vỡ (không phải lúc hết hạn) */
    if (bi.tuong && bi.chan.length) {
      var vo = null;
      for (var i = 0; i < bi.chan.length && thuc > 0; i++) {
        var c = bi.chan[i];
        var an = Math.min(c.luong, thuc);
        c.luong -= an; thuc -= an;
        if (c.luong <= 0.5 && c.khiVo) { vo = vo || []; vo.push(c.khiVo); c.khiVo = null; }
      }
      bi.chan = bi.chan.filter(function (c2) { return c2.luong > 0.5; });
      if (vo) for (var iv2 = 0; iv2 < vo.length; iv2++) vo[iv2](ke);
    }
    bi.hp -= thuc;
    if (bi.tuong && (bi.batTu > tran.t || csB.batTu) && bi.hp < 1) bi.hp = 1;
    if (tran.soiSat) tran.soiSat(ke, bi, thuc, loai, o);      /* móc cho bộ đo (soiAI, chay.js); trận thật để trống */
    if (ke.tuong) { ke.dmg += thuc; ke.lanCuoi = tran.t; }
    if (bi.tuong) {
      bi.nhan += thuc; bi.lanCuoi = tran.t;
      if (o.ghiNhan !== false) soBay(tran, { x: bi.x, y: bi.y, chu: Math.round(thuc), loai: loai });
      /* Pháo Đài Bất Hoại: bị đánh thường thì trả sát thương phép = flat + ratio% giáp */
      if (o.danh && ke.tuong && csB.dac.length) {
        for (var j = 0; j < csB.dac.length; j++) {
          var m = csB.dac[j].tfm;
          if (m.flat_damage != null) satThuong(tran, bi, ke, m.flat_damage + csB.giap * (m.defence_ratio || 0) / 100, 'pt', { ghiNhan: false });
        }
      }
      if (csB.phanDon && ke.tuong && loai !== 'thuc') satThuong(tran, bi, ke, thuc * csB.phanDon / 100, 'thuc', { ghiNhan: false });
    }
    if (bi.tuong && bi.moc.biDanh && thuc > 0) { var mb = bi.moc.biDanh; if (mb.den > tran.t) mb.fn(ke, thuc, o); else bi.moc.biDanh = null; }
    if (bi.hp <= 0) xuLyChet(tran, ke, bi);
    return thuc;
  }

  function hoiMau(tran, ke, m, luong) {
    if (!m || m.hp <= 0 || (m.tuong && m.chet > 0)) return 0;
    if (m.tuong) {
      var cs = chiSoNguoi(tran, m);
      if (cs.giamHoi) luong *= Math.max(0, 1 - cs.giamHoi / 100);
      if (ke && ke.tuong) luong *= hesoDoi(tran, ke.doi, 'hoi');
    }
    var truoc = m.hp;
    m.hp = Math.min(m.hpMax, m.hp + luong);
    var them = m.hp - truoc;
    if (ke && ke.tuong && ke !== m) ke.hoi += them;
    if (them > 1 && m.tuong) soBay(tran, { x: m.x, y: m.y, chu: '+' + Math.round(them), loai: 'hoi' });
    return them;
  }
  function themChan(tran, m, luong, lau, ke, khiVo) {
    if (!m || !m.tuong || m.chet > 0 || luong <= 0) return;
    m.chan.push({ luong: luong, den: tran.t + lau, khiVo: khiVo || null });
    m.hieu.chan = lau;
    if (ke && ke.tuong && ke !== m) ke.hoi += luong * 0.5;
    soBay(tran, { x: m.x, y: m.y, chu: 'chắn', loai: 'hoi' });
  }
  function themBuff(tran, m, cs, lau, ten) {
    if (!m || !m.tuong || m.chet > 0) return;
    /* cùng tên thì làm mới, không chồng */
    for (var i = 0; i < m.buff.length; i++) if (m.buff[i].ten === ten) { m.buff[i].cs = cs; m.buff[i].den = tran.t + lau; return; }
    m.buff.push({ cs: cs, den: tran.t + lau, ten: ten });
  }
  /** khống chế: choang / hat (hất tung) / troi (trói: không đi được) / im (câm chiêu) / khieu (khiêu khích) / so (sợ) */
  function khongChe(tran, ke, m, loai, lau) {
    if (!m || !m.tuong || m.chet > 0) return;
    var cs = chiSoNguoi(tran, m);
    if (m.mienKc > tran.t || cs.mienKc) { soBay(tran, { x: m.x, y: m.y, chu: 'miễn', loai: 'ne' }); return; }
    lau *= Math.max(0, 1 - cs.kienCuong / 100);
    if (lau <= 0) return;
    if (loai === 'choang' || loai === 'hat') {
      m.kc = Math.max(m.kc, lau); m.kcLoai = loai;
      if (m.hanh && !m.hanh.daRa) m.hanh = null;       /* đang niệm mà bị choáng thì mất chiêu */
      m.lao = null;
    } else if (loai === 'troi') m.troi = Math.max(m.troi, tran.t + lau);
    else if (loai === 'im') m.im = Math.max(m.im, tran.t + lau);
    else if (loai === 'khieu') { m.khieu = tran.t + lau; m.khieuAi = ke.i; m.mucTieu = null; }
    else if (loai === 'so') { m.so = tran.t + lau; m.soAi = ke.i; m.mucTieu = null; }
  }
  function lamCham(tran, m, muc, lau) {
    if (!m || !m.tuong || m.chet > 0) return;
    var cs = chiSoNguoi(tran, m);
    lau *= Math.max(0, 1 - cs.kienCuong / 100);
    if (tran.t + lau > m.chamDen || muc > m.chamMuc) { m.chamMuc = Math.max(muc, m.chamDen > tran.t ? m.chamMuc : 0); m.chamDen = Math.max(m.chamDen, tran.t + lau); }
  }
  function dayLui(tran, m, tuX, tuY, toc, lau) {
    if (!m || !m.tuong || m.chet > 0) return;
    var cs = chiSoNguoi(tran, m);
    if (m.mienKc > tran.t || cs.mienKc) return;
    var dx = m.x - tuX, dy = m.y - tuY, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var xaDi = toc * lau;
    m.ep = { tx: m.x + dx / d * xaDi, ty: m.y + dy / d * xaDi, toc: toc, den: tran.t + lau };
    m.lao = null;
  }
  function keoVe(tran, m, toiX, toiY, toc, lau) {
    if (!m || !m.tuong || m.chet > 0) return;
    var cs = chiSoNguoi(tran, m);
    if (m.mienKc > tran.t || cs.mienKc) return;
    var dx = toiX - m.x, dy = toiY - m.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var xaDi = Math.min(d - BK * 2, toc * lau);
    if (xaDi <= 0) return;
    m.ep = { tx: m.x + dx / d * xaDi, ty: m.y + dy / d * xaDi, toc: toc, den: tran.t + lau };
    m.lao = null;
  }
  function laoToi(tran, n, x, y, toc, xong, o) {
    n.lao = { tx: x, ty: y, toc: toc || 200, xong: xong || null, moiBuoc: o.moiBuoc || null, bat: tran.t };
    if (!o.khongDoi) n.huong = Math.atan2(y - n.y, x - n.x);
  }
  function banDan(tran, ke, muc, x, y, toc, khi, o) {
    tran.dan.push({ x: ke.x, y: ke.y, x0: ke.x, y0: ke.y, muc: muc || null, tx: x, ty: y, toc: toc || 300,
      ke: ke, doi: ke.doi, khi: khi, r: o.r || 0, xuyen: !!o.xuyen, loc: o.loc || null, ketThuc: o.ketThuc || null,
      trung: null, ban: tran.t, hinh: o.hinh || (ke.laTru ? 'tru' : ke.linh ? 'linh' : (ke.tuong ? ke.tuong.lop : 'quai')),
      lop: ke.tuong ? ke.tuong.lop : 'xa', nho: !!o.nho });
  }
  function taoVung(tran, ke, x, y, r, lau, moi, fn, o) {
    tran.vung.push({ x: x, y: y, r: r, den: tran.t + lau, moi: moi, ke: tran.t, fn: fn, ketThuc: o.ketThuc || null,
      hoi: o.hoi || null, loc: o.loc || null, minh: !!o.minh, n: ke, doi: ke.doi, ten: o.ten || '', dsCuoi: null, bat: tran.t });
    hieuUng(tran, { loai: 'vung', x: x, y: y, r: r, doi: ke.doi, lau: lau, tuong: ke.tuong && ke.tuong.id });
  }
  function themDot(tran, ke, m, moiGiay, lau, loai, ten) {
    if (!m || m.hp <= 0 || (m.tuong && m.chet > 0)) return;
    if (!m.dot) m.dot = [];
    for (var i = 0; i < m.dot.length; i++) {
      if (m.dot[i].ten === ten && m.dot[i].nguon === ke.i) { m.dot[i].moiGiay = moiGiay; m.dot[i].den = tran.t + lau; return; }
    }
    m.dot.push({ nguon: ke.i, moiGiay: moiGiay, den: tran.t + lau, loai: loai, ten: ten, ke: ke });
  }
  function henSau(tran, lau, fn) { tran.hen.push({ t: tran.t + lau, fn: fn }); }

  /* lính do chiêu triệu hồi: đi theo chủ, đánh thứ chủ đánh */
  function trieuHoi(tran, chu, o) {
    var s = o.stat, ap = chiSoNguoi(tran, chu).ap, ta = o.theoAP || {};
    var hp = s.hp + (ta.hp || 0) * ap / 100, atk = s.attack + (ta.attack || 0) * ap / 100;
    var l = {
      doi: chu.doi, lane: chu.vt === 'rung' ? 'giua' : chu.vt === 'ho' ? 'duoi' : chu.vt, t: 0,
      x: chu.x + 6, y: chu.y + 6, hp: hp, hpMax: hp, atk: atk, tam: kc(o.danh.range || 12000),
      hoiDanh: giay(o.danh.cooltime || 32), giap: s.defence || 0, khang: s.magic_resistance || 0,
      vang: 0, exp: 0, xa: false, buff: 0, tocchay: (s.move_speed || 1000) * TPS / G.TFM_DV,
      linh: true, tuTru: 100, trieu: true, chu: chu, lau: tran.t + o.lau, ten: o.ten || '',
      danh: 0, mucAi: null, px: chu.x + 6, py: chu.y + 6, huong: null, _h: 0, goc: 0, danhLuc: -9, dinhLuc: -9
    };
    tran.linh.push(l);
    return l;
  }
  function hoiSinh(tran, ke, m, phanTram) {
    if (!m || !m.tuong || m.chet <= 0) return false;
    m.chet = 0.01;
    m.hp = m.hpMax * phanTram;
    m.x = ke.x + 8; m.y = ke.y + 8; m.px = m.x; m.py = m.y;
    m._hoiSinhTai = true;
    return true;
  }

  /* ══════════════════ truy vấn cho chiêu ══════════════════ */
  function chonDuoc(m, t) { return !(m.tuong && (m.chet > 0 || m.khongChon > t)); }
  function dichTrong(tran, n, x, y, r, o) {
    var ra = [], r2 = r * r, t = tran.t;
    if (!o.linh) for (var i = 0; i < tran.nguoi.length; i++) {
      var m = tran.nguoi[i];
      if (m.doi === n.doi || !chonDuoc(m, t)) continue;
      var dx = m.x - x, dy = m.y - y;
      if (dx * dx + dy * dy <= r2 + BK * BK) ra.push(m);
    }
    if (o.tuong) return ra;
    for (var j = 0; j < tran.linh.length; j++) {
      var l = tran.linh[j];
      if (l.doi === n.doi || l.hp <= 0) continue;
      var dx2 = l.x - x, dy2 = l.y - y;
      if (dx2 * dx2 + dy2 * dy2 <= r2) ra.push(l);
    }
    if (o.linh) return ra;
    for (var k = 0; k < tran.quai.length; k++) {
      var q = tran.quai[k];
      if (!q.song || q.hp <= 0) continue;
      var dx3 = q.x - x, dy3 = q.y - y;
      if (dx3 * dx3 + dy3 * dy3 <= r2) ra.push(q);
    }
    for (var kq in tran.quaiLon) {
      var ql = tran.quaiLon[kq];
      if (!ql.song || ql.hp <= 0) continue;
      var dx4 = ql.x - x, dy4 = ql.y - y;
      if (dx4 * dx4 + dy4 * dy4 <= r2 + 400) ra.push(ql);
    }
    if (o.tru) for (var z = 0; z < tran.tru.length; z++) {
      var rr = tran.tru[z];
      if (rr.doi === n.doi || !rr.song) continue;
      var dx5 = rr.x - x, dy5 = rr.y - y;
      if (dx5 * dx5 + dy5 * dy5 <= r2 + 400) ra.push(rr);
    }
    return ra;
  }
  function dongMinhTrong(tran, n, x, y, r, o) {
    var ra = [], r2 = r * r;
    for (var i = 0; i < tran.nguoi.length; i++) {
      var m = tran.nguoi[i];
      if (m.doi !== n.doi || m.chet > 0) continue;
      if (m === n && o.keMinh === false) continue;
      var dx = m.x - x, dy = m.y - y;
      if (dx * dx + dy * dy <= r2 + BK * BK) ra.push(m);
    }
    return ra;
  }
  function dichGanNhat(tran, n, r, o) {
    var ds = dichTrong(tran, n, n.x, n.y, r, o), g = null, gd = 1e9;
    for (var i = 0; i < ds.length; i++) {
      if (o.quaiLon && ds[i].hienRa == null) continue;
      var d = xa(n, ds[i]);
      if (d < gd) { gd = d; g = ds[i]; }
    }
    return g;
  }
  function dongMinhYeuNhat(tran, n, r, keMinh) {
    var g = null, gp = 2;
    for (var i = 0; i < tran.nguoi.length; i++) {
      var m = tran.nguoi[i];
      if (m.doi !== n.doi || m.chet > 0) continue;
      if (m === n && !keMinh) continue;
      if (xa(n, m) > r + BK) continue;
      var p = m.hp / m.hpMax;
      if (p < gp) { gp = p; g = m; }
    }
    return g;
  }
  function trongNon(n, m, nuaGoc) {
    var h = n.huong == null ? 0 : n.huong;
    var g = Math.atan2(m.y - n.y, m.x - n.x);
    var d = Math.abs(((g - h + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return d <= nuaGoc * Math.PI / 180 + 0.05;
  }

  G._sim = {
    BK: BK, TICK: TICK, xa: xa, trongNon: trongNon,
    chiSo: function (n) { return n._cs || chiSoNguoi(n._tran, n); },
    dichTrong: dichTrong, dongMinhTrong: dongMinhTrong, dichGanNhat: dichGanNhat, dongMinhYeuNhat: dongMinhYeuNhat,
    satThuong: satThuong, hoiMau: hoiMau, themChan: themChan, themBuff: themBuff, khongChe: khongChe, lamCham: lamCham,
    dayLui: dayLui, keoVe: keoVe, laoToi: laoToi, banDan: banDan, taoVung: taoVung, themDot: themDot, henSau: henSau,
    trieuHoi: trieuHoi, hoiSinh: hoiSinh, hieuUng: hieuUng, soBay: soBay
  };

  /* ══════════════════ NHỊP RA ĐÒN CỦA TFM2 ══════════════════
     Mỗi hành động (đánh thường, skill, skill2, ult) có: `cooltime` (đếm từ lúc bắt đầu),
     `duration` (khoá người bấy nhiêu tick), `start_timing` (tick ra đòn), `cancelable`
     (sau khi ra đòn được bỏ dở phần còn lại), `can_use_with_move` (vừa đi vừa đánh). */
  function batDauHanh(tran, n, loai, muc, x, y, cs) {
    var a = n.tuong.tfm[loai === 'danh' ? 'attack' : loai];
    var kn = n.tuong.kn[loai];
    n.hanh = { loai: loai, bat: tran.t, dai: giay(a.duration || 20), moc: giay(a.start_timing || 10), daRa: false,
      muc: muc || null, x: x != null ? x : (muc ? muc.x : n.x), y: y != null ? y : (muc ? muc.y : n.y),
      coDi: !!a.can_use_with_move, huy: !!a.cancelable };
    if (loai === 'danh') n.cd.danh = giay(a.cooltime || 60) / Math.max(0.2, cs.tocdanh / (TPS / (a.cooltime || 60)));
    else n.cd[loai] = giay(a.cooltime || 300) * (1 - (loai === 'ult' ? Math.max(cs.hoiChieu, cs.hoiCuoi) : cs.hoiChieu) / 100);
    var tx = n.hanh.x, ty = n.hanh.y;
    if (tx !== n.x || ty !== n.y) n.huong = Math.atan2(ty - n.y, tx - n.x);
    if (loai === 'danh') { n.danhLuc = tran.t; n.danhGoc = n.huong || 0; }
    else {
      n.niemLuc = tran.t; n.niemTen = kn.ten; n.niemKn = loai; n.niemCuoi = loai === 'ult';
      hieuUng(tran, { loai: loai === 'ult' ? 'cuoi' : 'chieu', tuong: n.tuong.id, kn: loai, x: n.x, y: n.y,
        x2: tx, y2: ty, doi: n.doi, ten: kn.ten, ai: n.i, niem: true });
      tran.suKien.push({ t: tran.t, loai: 'chieu', ai: n.i, ten: kn.ten, cuoi: loai === 'ult', kn: loai });
    }
  }
  function tickHanh(tran, n, cs) {
    var h = n.hanh;
    if (!h) return;
    if (!h.daRa && tran.t >= h.bat + h.moc) {
      h.daRa = true;
      if (h.loai === 'danh') raDanh(tran, n, h, cs);
      else G.chayChieu(tran, n, h.loai, h);
    }
    if (n.hanh === h && tran.t >= h.bat + h.dai) n.hanh = null;
  }
  function trongTamDanh(n, m, cs) {
    return xa(n, m) <= cs.tam + BK * 2 + (m.laTru ? 6 : (m.hienRa != null ? 8 : 0));
  }
  function raDanh(tran, n, h, cs) {
    var m = h.muc;
    if (!m || m.hp <= 0 || (m.tuong && m.chet > 0) || (m.song === false && !m.tuong)) return;
    var a = n.tuong.tfm.attack;
    if (a.speed && cs.tam > 30) {
      banDan(tran, n, m, m.x, m.y, kc(a.speed) * TPS, function (bi) { donThuong(tran, n, bi, cs); }, { hinh: n.tuong.lop });
    } else {
      donThuong(tran, n, m, cs);
      if (tran.veHinh) hieuUng(tran, { loai: 'chem', x: m.x, y: m.y, goc: n.danhGoc, doi: n.doi });
    }
  }
  function donThuong(tran, n, m, cs) {
    if (m.hp <= 0 || (m.tuong && m.chet > 0)) return;
    var a = n.tuong.tfm.attack;
    var luong = cs.atk * ((a.attack_ratio == null ? 100 : a.attack_ratio) / 100) + (a.attack || 0);
    if (cs.crit && tran.rng.duoc(cs.crit / 100)) luong *= 1.5;      /* `[ĐỀ XUẤT]` hệ số chí mạng TFM2 không có trong dữ liệu */
    /* CƠ: đánh hụt (lớp game này) — người CƠ cao ít hụt hơn */
    if (m.tuong && tran.rng.duoc(G.kep(0.12 - n.cs.co / 1200 * 0.10, 0.01, 0.14))) luong *= 0.35;
    var thuc = satThuong(tran, n, m, luong, 'vl', { danh: true });
    if (cs.vamp && thuc > 0) hoiMau(tran, null, n, thuc * cs.vamp / 100);
    /* đòn đánh kế tiếp có hiệu ứng (§16.6): `con` đòn, hay vô hạn tới `den` */
    var dk = n.donKe;
    if (dk) {
      if (dk.den <= tran.t) n.donKe = null;
      else { dk.fn(m, thuc); if (dk.con > 0) { dk.con--; if (dk.con <= 0) n.donKe = null; } }
    }
    /* Buff vị trí ĐI RỪNG của TFM2: hành quyết quái lớn khi máu ≤ jungle_execute_threshold */
    if (n.vt === 'rung' && m.hienRa != null && m.hp > 0 && m.hp <= CAI.jungle_execute_threshold) {
      m.hp = 0;
      hieuUng(tran, { loai: 'cuoi', x: n.x, y: n.y, x2: m.x, y2: m.y, doi: n.doi, dien: true });
      xuLyChet(tran, n, m);
    }
  }

  /* ══════════════════ mua đồ ══════════════════ */
  function muaDo(tran, n) {
    var vl = 0, pt = 0;
    tran.nguoi.forEach(function (m) {
      if (m.doi === n.doi) return;
      var cs = G.tuongOCap(m.tuong, m.cap);
      vl += cs.atk; pt += cs.ap * 1.15;
    });
    var tong = vl + pt || 1;
    var cheech = tran.vang[n.doi] - tran.vang[doiKia(n.doi)];
    var lan = 0;
    while (lan++ < 3) {
      if (n.do.length >= G.SO_O_DO && !n.do.some(function (id) { return G.TB_THEO_ID[id].ke; })) break;
      var id = G.nghiDo({
        vai: n.vt, lopTuong: n.tuong.lop, the: n.tuong.the,
        apVL: vl / tong, apPT: pt / tong,
        thua: G.kep(cheech / 6000, -1, 1),
        chat: n.chat, nao: n.cs.nao, daCo: n.do,
        rng: function () { return tran.rng(); }
      });
      if (!id) break;
      var m2 = G.TB_THEO_ID[id];
      if (n.vang < m2.gia) break;
      var truoc = n.do.filter(function (x) { return G.TB_THEO_ID[x].nhanh === m2.nhanh; });
      if (!truoc.length && n.do.length >= G.SO_O_DO) break;
      n.vang -= m2.gia;
      if (truoc.length) n.do.splice(n.do.indexOf(truoc[0]), 1);
      n.do.push(id);
      n._csTick = -1;
      var cs2 = chiSoNguoi(tran, n);
      var them = cs2.hpMax - n.hpMax;
      n.hpMax = cs2.hpMax; n.hp = Math.min(n.hp + Math.max(0, them), n.hpMax);
      tran.suKien.push({ t: tran.t, loai: 'do', ai: n.i, mon: id });
    }
  }

  /* ══════════════════ lính ══════════════════ */
  function raLinh(tran) {
    var buoc = bacTang(tran.t);
    tran.songLinh++;
    var dsSinh = [];
    for (var i = 0; i < SONG.melee_count; i++) dsSinh.push('melee_minion');
    for (var j = 0; j < SONG.range_count; j++) dsSinh.push('range_minion');
    dsSinh.forEach(function (loai, k) {
      henSau(tran, giay(SONG.tick_per_spawn) * k, function () {
        ['tren', 'giua', 'duoi'].forEach(function (lane) {
          ['xanh', 'do'].forEach(function (doi) { sinhLinh(tran, lane, doi, loai, buoc, k); });
        });
      });
    });
    henSau(tran, giay(SONG.tick_per_wave), function () { raLinh(tran); });
  }
  function sinhLinh(tran, lane, doi, loai, buoc, k) {
    var cau = CAI[loai], c = chiSoQuai(cau, buoc);
    var t = doi === 'xanh' ? 0.03 : 0.97;
    var p = diemTren(lane, t);
    var xa2 = loai === 'range_minion';
    var l = {
      doi: doi, lane: lane, t: t, x: p[0] + (k - 1) * 6, y: p[1] + (k - 1) * 6,
      hp: c.hp, hpMax: c.hp, atk: c.atk, giap: c.giap, khang: c.khang,
      tam: kc(cau.attack.range), hoiDanh: giay(cau.attack.cooltime), tocchay: c.tocchay,
      danh: 0, vang: Math.min(cau.max_gold, cau.gold + cau.growth_gold * buoc), exp: cau.exp + cau.growth_exp * buoc,
      xa: xa2, buff: 0, linh: true, tuTru: cau.from_tower_damage, trieu: false, chu: null, lau: 0, ten: '',
      mucAi: null, px: p[0] + (k - 1) * 6, py: p[1] + (k - 1) * 6, huong: null, _h: 0, goc: 0, danhLuc: -9, dinhLuc: -9
    };
    if (tran.buff[doi].linh > tran.t) buffLinhChua(tran, l, tran.buff[doi].linhLan);
    tran.linh.push(l);
  }
  /* bùa Chúa Hang lên lính: epic_minion_buff + epic_minion_buff_increase × (lần − 1), có hạn 5400 tick */
  function buffLinhChua(tran, l, lan) {
    var b = CAI.epic_minion_buff, t = CAI.epic_minion_buff_increase, k = Math.max(0, lan - 1);
    var hpM = (b.hp_mult + t.hp_mult * k) / 100;
    var hpMoi = (l.hpMax + b.hp + t.hp * k) * (1 + hpM);
    l.hp = l.hp / l.hpMax * hpMoi; l.hpMax = hpMoi;
    l.atk += b.attack + t.attack * k;
    l.giap += b.defence + t.defence * k; l.khang += b.magic_resistance + t.magic_resistance * k;
    l.tocchay *= 1 + (b.move_speed_mult + t.move_speed_mult * k) / 100;
    l.hoiDanh /= 1 + (b.attack_speed_mult + t.attack_speed_mult * k) / 100;
    l.buff = 1;
  }

  /* ══════════════════ chết và thưởng ══════════════════ */
  function thoiGianHoiSinh(tran, n) {
    var tick = CAI.respawn_tick + CAI.respawn_growth_per_level * (n.cap - 1) +
      CAI.respawn_growth * Math.floor(tran.t * TPS / CAI.respawn_growth_term);
    return giay(Math.min(CAI.respawn_max, tick));
  }
  function xuLyChet(tran, ke, bi) {
    if (bi.hp > 0) return;
    if (bi.tuong) {
      if (bi.chet > 0) return;
      bi.hp = 0;
      bi.chet = thoiGianHoiSinh(tran, bi);
      bi.d++;
      bi.hanh = null; bi.lao = null; bi.ep = null; bi.kc = 0; bi.chan = []; bi.dot = []; bi.hoiVe = 0;
      bi.buff = bi.buff.filter(function (b) { return b.den > tran.t + 600; });   /* chỉ giữ buff vĩnh viễn */
      tran.matNguoi[bi.doi] = tran.t;
      if (bi.lapseDen > tran.t) tran.thongKe.loi.chetKhiLapse++;
      if (bi.goi && bi.goi.loai === 'thu') bi.goi = null;
      var keT = ke && ke.tuong ? ke : (ke && ke.ke && ke.ke.tuong ? ke.ke : null);
      if (keT && keT.doi !== bi.doi) {
        keT.k++;
        if (keT.moc.giet) { var mg = keT.moc.giet; if (mg.den > tran.t) mg.fn(bi); else keT.moc.giet = null; }
        keT.vang += CAI.kill_gold; tran.vang[keT.doi] += CAI.kill_gold;
        var expGiet = CAI.kill_exp + CAI.kill_exp_growth * (bi.cap - 1);
        themExp(tran, keT, expGiet);
        tran.mang[keT.doi]++;
        var tuGank = keT.gankAi === bi.i && tran.t - keT.gankLuc < 25;
        tran.nguoi.forEach(function (m) {
          if (m.doi !== keT.doi || m === keT || m.chet > 0) return;
          if (xa(m, bi) < TAM_EXP) {
            m.a++; m.vang += CAI.assist_gold; tran.vang[m.doi] += CAI.assist_gold;
            themExp(tran, m, expGiet * CAI.assist_exp_ratio / 100);
            if (m.gankAi === bi.i && tran.t - m.gankLuc < 25) tuGank = true;
          }
        });
        if (tuGank) tran.thongKe.gankMang++;
        tran.suKien.push({ t: tran.t, loai: 'mang', ai: keT.i, bi: bi.i });
      } else {
        tran.mang[doiKia(bi.doi)]++;
        tran.suKien.push({ t: tran.t, loai: 'mang', ai: null, bi: bi.i });
      }
      return;
    }
    if (bi.song === false && !bi.linh) return;
    var d = ke && (ke.doi || (ke.ke && ke.ke.doi));
    var keT2 = ke && ke.tuong ? ke : (ke && ke.ke && ke.ke.tuong ? ke.ke : null);

    if (bi.lap != null || bi.hienRa != null) {
      /* quái lớn: vàng + kinh nghiệm cho CẢ ĐỘI, mỗi lần sau đắt thêm growth_gold */
      bi.song = false; bi.hp = 0; bi.lan++;
      bi.hienRa = tran.t + giay(bi.cau.respawn_tick);
      if (d) {
        var vangQ = bi.vang + bi.cau.growth_gold * (bi.lan - 1);
        tran.nguoi.forEach(function (m) { if (m.doi === d) { m.vang += vangQ; tran.vang[d] += vangQ; themExp(tran, m, bi.exp); } });
        if (bi.id === 'rong') { tran.rongHa[d]++; tran.buff[d].serpen++; }
        else {
          tran.chuaHa[d]++;
          tran.buff[d].linh = tran.t + giay(CAI.epic_minion_buff_duration);
          tran.buff[d].linhLan = tran.chuaHa[d];
          tran.linh.forEach(function (l) { if (l.doi === d && !l.buff && !l.trieu) buffLinhChua(tran, l, tran.chuaHa[d]); });
        }
        /* ghi cho bộ đo: ăn theo màn (pha) hay tự phát, có phải cướp không (địch ≥ 2 người đứng đó, mình ≤ 2) */
        var mlD = tran.doiNao[d].ml, taCo = 0, dichCo = 0;
        tran.nguoi.forEach(function (m) {
          if (m.chet > 0 || xaXY(m.x, m.y, bi.x, bi.y) > 200) return;
          if (m.doi === d) taCo++; else dichCo++;
        });
        tran.suKien.push({ t: tran.t, loai: 'quaiLon', doi: d, quai: bi.id,
          pha: mlD.quai === bi.id ? mlD.pha : null, cuop: dichCo >= 2 && taCo <= 2 });
        if (mlD.quai === bi.id) xongMl(tran, d);
        var kiaD = doiKia(d);
        if (tran.doiNao[kiaD].ml.quai === bi.id) huyMl(tran, kiaD, 'MatQuai');
      }
      return;
    }
    if (bi.laTru) {
      bi.song = false; bi.hp = 0;
      if (d) {
        tran.truHa[d]++;
        tran.nguoi.forEach(function (m) { if (m.doi === d) { m.vang += bi.vangTru; tran.vang[d] += bi.vangTru; } });
        tran.suKien.push({ t: tran.t, loai: 'tru', doi: d, lane: bi.lane, loi: !!bi.loi });
      }
      return;
    }
    if (bi.cau && bi.hoi != null) {
      /* quái rừng */
      bi.song = false; bi.hp = 0; bi.hoi = tran.t + giay(bi.cau.respawn_tick);
      if (keT2) {
        var vangB = bi.vang + bi.cau.growth_gold * bacTang(tran.t);
        keT2.vang += vangB; tran.vang[keT2.doi] += vangB;
        chiaExp(tran, keT2, bi.exp + bi.cau.growth_exp * bacTang(tran.t), bi);
      }
      return;
    }
    /* lính */
    if (bi.linh && bi.trieu) { bi.hp = 0; return; }
    if (keT2 && bi.linh) {
      var them = bi.vang;
      if (keT2.vt === 'duoi') them *= 1 + CAI.bottom_gold_bonus / 100;
      if (keT2.vt === 'ho') them *= 1 - CAI.support_gold_reduction / 100;
      them *= 0.92 + 0.16 * G.kep((keT2.cs && keT2.cs.luc || 0) / 1200, 0, 1);   /* LỰC: tốc độ farm (lớp game này) */
      /* Buff vị trí HỖ TRỢ của TFM2: last-hit thì đồng đội GẦN NHẤT nhận vàng */
      var nhan = keT2;
      if (keT2.vt === 'ho') {
        var ganNhat = null, dGan = 1e9;
        tran.nguoi.forEach(function (m) {
          if (m.doi !== keT2.doi || m === keT2 || m.chet > 0) return;
          var dd = xaXY(m.x, m.y, bi.x, bi.y);
          if (dd < 520 && dd < dGan) { dGan = dd; ganNhat = m; }
        });
        if (ganNhat) nhan = ganNhat;
      }
      nhan.vang += them;
      tran.vang[keT2.doi] += them;
      chiaExp(tran, keT2, bi.exp, bi);
    }
  }

  /** Kinh nghiệm chia cho đồng đội trong exp_range; 2/3/4+ người thì mỗi người còn 100/80/60% */
  function chiaExp(tran, ke, exp, bi) {
    var gan = [];
    for (var i = 0; i < tran.nguoi.length; i++) {
      var m = tran.nguoi[i];
      if (m.doi === ke.doi && m.chet <= 0 && (m === ke || xaXY(m.x, m.y, bi.x, bi.y) < TAM_EXP)) gan.push(m);
    }
    if (!gan.length) gan = [ke];
    var he = gan.length <= 1 ? 100 : gan.length === 2 ? SONG.exp_decay2 : gan.length === 3 ? SONG.exp_decay3 : SONG.exp_decay4;
    gan.forEach(function (m) { themExp(tran, m, exp * he / 100); });
  }
  function themExp(tran, n, exp) {
    if (n.vt === 'giua') exp *= 1 + CAI.mid_exp_bonus / 100;
    if (n.vt === 'ho') exp *= 1 - CAI.support_exp_reduction / 100;
    n.exp += exp;
    lenCap(tran, n);
  }
  function lenCap(tran, n) {
    while (n.cap < G.CAP_TOI_DA && n.exp >= CAI.need_exp[n.cap - 1]) {
      n.exp -= CAI.need_exp[n.cap - 1]; n.cap++;
      n._csTick = -1;
      var cs = chiSoNguoi(tran, n);
      var truoc = n.hpMax;
      n.hpMax = cs.hpMax;
      n.hp += Math.max(0, n.hpMax - truoc);
    }
  }

  /* ══════════════════ BỘ NÃO — chép cách quyết định của TFM2 (bước 5; D:\tfm2-ref\AI_BRAIN.md; RESEARCH §16) ══════════════════
     Ba tầng như TFM2: ĐỘI (tickDoi: màn tranh quái lớn theo chuỗi pha, gọi giữ trụ, gọi mục tiêu chung)
     → CÁ NHÂN (chonHanhDong: đánh hay chạy bằng cuộc đua "ai chết trước") → CHIÊU (thuChieu: theo
     casting_target, biết giữ). Chỉ số tuyển thủ KHÔNG cộng sát thương; nó bật các KIỂU SAI có tên
     (AI_BRAIN §5): lapse (đứng hình — NÃO theo giờ trận, LÌ khi đội thua vàng), misjudge (nhiễu vào
     cuộc đua — NÃO), tuChoi (từ chối lời gọi — cái tôi + NÃO), ngheNham (nghe nhầm mục tiêu chung).
     Mọi số đếm nằm ở `tran.thongKe` cho bộ đo (_tools/soiAI.js). */
  var MW = TFM.macro || { gold: 1, exp: 1, kill: 400, death: 400, tower: 500, epic: 2800, serpen: 700, nexus: 20000 };
  /* `[ĐỀ XUẤT]` AI_BRAIN §8: quorum_k, số giây Prepare gọi trước, biên cuộc đua là hằng số trong exe, không đọc được */
  var K_QUAI = { chua: 3, rong: 3 };
  var BAO_TRUOC = 30;

  function taoNao() {
    return {
      ml: { quai: null, pha: null, bat: 0, hanChot: 0, tapX: 0, tapY: 0, k: 0, ds: [], henLai: 0, cuopAi: -1, cuopLuc: 0 },
      tapTrung: { ai: -1, luc: -99, goi: -1 },
      thu: { tru: null, luc: -99, ds: [] }
    };
  }
  G.taoNaoDoi = taoNao;
  function chienThuatCua(tran, doi) { return tran.cau[doi === 'xanh' ? 'ta' : 'dich'].chienThuat || {}; }
  function ngheLenh(n) {
    return G.kep(0.55 + 0.40 * (n.cs.nao / 1200) - 0.35 * (n.ego / 100), 0.1, 0.98);
  }
  function chatCo(n, c) { return n.chat.indexOf(c) >= 0; }
  function laneCua(n) { return n.vt === 'rung' ? 'giua' : (n.vt === 'ho' ? 'duoi' : n.vt); }
  function demSong(tran, doi) {
    var s = 0;
    for (var i = 0; i < tran.nguoi.length; i++) if (tran.nguoi[i].doi === doi && tran.nguoi[i].chet <= 0) s++;
    return s;
  }
  function goi(tran, doi, kieu, chu, ai) {
    tran.suKien.push({ t: tran.t, loai: 'goi', doi: doi, kieu: kieu, chu: chu, ai: ai == null ? null : ai });
  }
  function ghiDem(bang, k) { bang[k] = (bang[k] || 0) + 1; }
  /** điểm đứng được (không nằm trong tường) gần (x, y) nhất */
  function diemTrong(x, y) {
    var o = oCua(x, y);
    if (!CHAN[o]) return [x, y];
    var g = GAN[o];
    return [(g % SO_O + 0.5) * CO_O, (Math.floor(g / SO_O) + 0.5) * CO_O];
  }
  /** điểm cách `tu` một đoạn `d` về phía giếng nhà của đội */
  function vePhiaNha(tu, doi, d) {
    var nha = NHA[doi], dx = nha[0] - tu.x, dy = nha[1] - tu.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
    return diemTrong(tu.x + dx / l * d, tu.y + dy / l * d);
  }

  /* `[BẪY ĐÃ SẬP]` §16: tầm trụ đo tâm-tới-tâm (78) còn tầm đánh của tướng đo mép-tới-mép (+2 BK + 6), nên xạ thủ
     tầm 60000 (62,5 + 27 = 89) gõ trụ từ NGOÀI tầm trụ — trụ đổ trước 2 tướng không lính mà không bắn phát nào.
     Trụ cũng với tới mép người: tầm + 2 BK + 6, dùng chung cho tickTru và mọi phép "đứng trong tầm trụ". */
  function tamTru(r) { return r.tam + BK * 2 + 6; }
  function truPhu(tran, x, y, doiTru) {
    for (var i = 0; i < tran.tru.length; i++) {
      var r = tran.tru[i];
      if (r.doi !== doiTru || !r.song || !r.tam) continue;
      var dx = r.x - x, dy = r.y - y, tt = tamTru(r);
      if (dx * dx + dy * dy < tt * tt) return r;
    }
    return null;
  }
  function coLinhTa(tran, x, y, doi, banKinh) {
    for (var i = 0; i < tran.linh.length; i++) {
      var l = tran.linh[i];
      if (l.doi !== doi || l.hp <= 0) continue;
      var dx = l.x - x, dy = l.y - y;
      if (dx * dx + dy * dy < banKinh * banKinh) return true;
    }
    return false;
  }
  function demLinhDich(tran, doi, x, y, r) {
    var s = 0;
    for (var i = 0; i < tran.linh.length; i++) {
      var l = tran.linh[i];
      if (l.doi === doi || l.hp <= 0) continue;
      if (xaXY(l.x, l.y, x, y) < r) s++;
    }
    return s;
  }

  /* ── ước sát thương: đầu vào của cuộc đua ── */
  /** chiêu của một tướng, phân tích một lần: sát thương gốc + hệ số, hồi chiêu, có khống chế, diện rộng */
  function uocChieu(t) {
    if (t._uc) return t._uc;
    var r = [];
    ['skill', 'skill2', 'ult'].forEach(function (l) {
      var kn = t.kn[l], a = t.tfm[l];
      if (!kn || !a) return;
      var pt = kn._pt || (kn._pt = G.phanTichChieu(kn.p, kn.moGoc));
      var kc = (pt.choang || pt.hat || pt.troi || pt.khieu || pt.so || pt.me || pt.im) > 0;
      var lop = a.casting_target || (pt.hoiSinh ? 'AllyChampion'
        : ((pt.hoi || pt.chan || pt.hoiPhanTramMau) && !pt.coDmg) ? 'Ally'
        : (pt.coDmg || kc || pt.chamMuc || Object.keys(pt.buffDich).length) ? ((kc || l === 'ult') ? 'EnemyChampion' : 'EnemyWithoutTower')
        : 'AllyOnlySelf');
      r.push({ loai: l, dmg: pt.coDmg ? pt.dmg : 0, he: pt.coDmg ? pt.he : 0, theo: pt.theo, pt: pt.pt,
        hoi: giay(a.cooltime || 300), kc: kc, dien: pt.banKinh > 0, banKinh: pt.banKinh, tam: a.range || pt.tamChieu || 0, lop: lop,
        lao: !!pt.lao || (a.effect && JSON.stringify(a.effect).indexOf('"Rush"') >= 0) });
    });
    t._uc = r;
    return r;
  }
  function satMotChieu(c, cs, giap, khang) {
    return (c.dmg + c.he / 100 * (c.theo === 'ap' ? cs.ap : cs.atk)) * 100 / (100 + (c.pt ? khang : giap));
  }
  /** sát thương mỗi giây của `ke` lên `bia`: đánh thường + chiêu thường rải trên hồi chiêu */
  function dpsLen(tran, ke, cs, bia) {
    var csB = bia.tuong ? chiSoNguoi(tran, bia) : bia;
    var giap = csB.giap || 0, khang = csB.khang || 0;
    var a = ke.tuong.tfm.attack;
    var danh = (cs.atk * ((a.attack_ratio == null ? 100 : a.attack_ratio) / 100) + (a.attack || 0)) * cs.tocdanh * 100 / (100 + giap);
    var chieu = 0, uc = uocChieu(ke.tuong);
    for (var i = 0; i < uc.length; i++) {
      var c = uc[i];
      if (!c.dmg && !c.he) continue;
      if (c.loai === 'ult' && ke.cap < 5) continue;
      chieu += satMotChieu(c, cs, giap, khang) / Math.max(4, c.hoi);
    }
    return danh + chieu;
  }
  /** đòn dồn một lượt: các chiêu đang sẵn (`nuke` của TFM2) */
  function donDon(tran, ke, cs, bia) {
    var csB = chiSoNguoi(tran, bia), s = 0, uc = uocChieu(ke.tuong);
    for (var i = 0; i < uc.length; i++) {
      var c = uc[i];
      if ((!c.dmg && !c.he) || ke.cd[c.loai] > 0) continue;
      if (c.loai === 'ult' && ke.cap < 5) continue;
      s += satMotChieu(c, cs, csB.giap, csB.khang);
    }
    return s;
  }
  function dpsTru(r, giap) { return r.atk * 100 / (100 + giap) / (r.hoi || 0.67); }
  function tongChan(m) { var s = 0; for (var i = 0; i < m.chan.length; i++) s += m.chan[i].luong; return s; }

  /** CUỘC ĐUA "AI CHẾT TRƯỚC" (AI_BRAIN §2.4): mình sống được bao nhiêu giây trước sát thương của
      những kẻ địch có mặt và kịp tới trong `tamToi` giây (`can_near_enemies`), cộng trụ nếu trụ sẽ
      nhắm mình (`die_tick_with_tower`), cộng lính đang đánh mình; phe mình (có mặt / kịp tới) cần
      bao nhiêu giây để hạ `muc` (`ttk_ticks`), cộng trụ nhà nếu `muc` đứng dưới trụ mình.
      `o.bien` là biên phải thắng (âm = dám vào khi sát nút — `aggressive`). `o.lao` = định đánh
      tướng dưới trụ địch (trụ chắc chắn nhắm mình). NÃO = judgement: nhiễu nhân vào hai con số;
      nhiễu lật kết luận thì đếm misjudge. */
  function duaChet(tran, n, muc, o) {
    o = o || {};
    var t = tran.t, dk = doiKia(n.doi), i, m, cs, d, toi;
    var csN = chiSoNguoi(tran, n);
    var tamToi = o.tamToi == null ? 2 : o.tamToi;
    var dpsMinh = 0, dpsMuc = 0, dichGan = 0, taGan = 1, nuke = 0, coTru = false;
    for (i = 0; i < tran.nguoi.length; i++) {
      m = tran.nguoi[i];
      if (m.chet > 0 || m === n) continue;
      cs = chiSoNguoi(tran, m);
      if (m.doi !== n.doi) {
        if (m.anMinh > t && t - m.lanCuoi > 1) continue;
        d = xa(n, m);
        toi = (d - cs.tam - BK * 2) / Math.max(1, cs.tocchay);
        if (toi > tamToi) continue;
        dichGan++;
        var he = toi <= 0 ? 1 : 1 - toi / tamToi * 0.5;
        dpsMinh += dpsLen(tran, m, cs, n) * he;
        if (toi <= 0.5) nuke += donDon(tran, m, cs, n);
      } else if (muc) {
        d = xa(m, muc);
        toi = (d - cs.tam - BK * 2) / Math.max(1, cs.tocchay);
        if (toi > tamToi) continue;
        taGan++;
        dpsMuc += dpsLen(tran, m, cs, muc) * (toi <= 0 ? 1 : 1 - toi / tamToi * 0.5);
      }
    }
    if (muc) dpsMuc += dpsLen(tran, n, csN, muc);
    /* trụ địch: chỉ tính khi nó SẼ nhắm mình — không có lính nhà đỡ, vừa bị bắn, hay mình định đánh tướng dưới trụ */
    var tr = truPhu(tran, n.x, n.y, dk);
    if (tr && (o.lao || t - n.truBan < 2 || !coLinhTa(tran, tr.x, tr.y, n.doi, tr.tam))) { coTru = true; dpsMinh += dpsTru(tr, csN.giap); }
    /* trụ nhà: `muc` đứng trong tầm trụ mình mà đánh mình (hay đánh ai đang trong tầm) là trụ đổi mục tiêu sang nó —
       nên khi mình cũng ở trong tầm thì trụ nhà đứng về phía mình trong cuộc đua */
    if (muc && muc.tuong) {
      var trN = truPhu(tran, muc.x, muc.y, n.doi);
      if (trN && (o.lao || muc.danhTuongAi === n.i || xaXY(n.x, n.y, trN.x, trN.y) < tamTru(trN) || !coLinhTa(tran, trN.x, trN.y, dk, trN.tam))) dpsMuc += dpsTru(trN, chiSoNguoi(tran, muc).giap);
      else if (dichGan) {
        /* mình đứng dưới trụ nhà: kẻ nào vào đánh mình là trụ đổi sang nó (§16) — trụ đứng về phía mình dù `muc` còn ở ngoài */
        var trMinh = truPhu(tran, n.x, n.y, n.doi);
        if (trMinh) dpsMuc += dpsTru(trMinh, chiSoNguoi(tran, muc).giap);
      }
    }
    for (i = 0; i < tran.linh.length; i++) {
      var l = tran.linh[i];
      if (l.doi === n.doi || l.hp <= 0) continue;
      if (l.mucAi === n || xaXY(l.x, l.y, n.x, n.y) < l.tam + BK * 2) dpsMinh += l.atk * 100 / (100 + csN.giap) / l.hoiDanh;
    }
    var mauMinh = n.hp + tongChan(n);
    var minh = mauMinh / Math.max(1, dpsMinh);
    if (nuke >= mauMinh) minh = Math.min(minh, 0.8);
    var dich = muc ? (muc.hp + (muc.tuong ? tongChan(muc) : 0)) / Math.max(1, dpsMuc) : 99;
    var nhieu = 0.35 * (1 - G.kep(n.cs.nao / 1200, 0, 1));
    var mN = minh * (1 + (tran.rng() - 0.5) * 2 * nhieu), dN = dich * (1 + (tran.rng() - 0.5) * 2 * nhieu);
    /* ba kết cục: THẮNG (nó chết trước mình), THUA RÕ (mình chết trước nó ≥ 30 %: chạy), còn lại GIỮ THẾ
       (không mở, không chạy — TFM2 `Hold`). `bien` dịch cả hai mép: chất `lao` dám vào khi sát nút và
       chịu đứng lâu hơn; chất `thu` ngược lại. */
    var bien = o.bien || 0;
    var thangThat = dich < minh * (1 - bien), thang = dN < mN * (1 - bien);
    var thuaThat = minh * (1.3 + bien) < dich, thua = mN * (1.3 + bien) < dN;
    if (thang !== thangThat || thua !== thuaThat) tran.thongKe.loi.misjudge++;
    var lyDo = '';
    if (thua) {
      if (coTru) lyDo = 'truBan';
      else if (nuke >= mauMinh) lyDo = 'donDap';
      else if (dichGan > taGan) lyDo = 'thuaNguoi';
      else if (n.hp / n.hpMax < 0.3) lyDo = 'sapChet';
      else lyDo = 'thuaDua';
    }
    return { thang: thang, thua: thua, minh: mN, dich: dN, dichGan: dichGan, taGan: taGan, coTru: coTru, lyDo: lyDo, dpsMinh: dpsMinh };
  }
  /** cuộc đua của CẢ NHÓM quanh một điểm (màn quái lớn, giữ trụ, vào hùa): tổng máu / tổng sát thương hai phe.
      `loi` > 1 là phe mình sống lâu hơn; `thang` khi lợi rõ (> 1,1), `thua` khi thiệt rõ (< 0,75), giữa là giằng co
      (Poking: đứng lại cấu máu, cuộc đua cá nhân quyết định ai vào) */
  function duaDoi(tran, doi, x, y, r) {
    var kia = doiKia(doi), ta = [], dich = [], i;
    for (i = 0; i < tran.nguoi.length; i++) {
      var m = tran.nguoi[i];
      if (m.chet > 0 || xaXY(m.x, m.y, x, y) > r) continue;
      (m.doi === doi ? ta : dich).push(m);
    }
    if (!dich.length) return { thang: true, thua: false, loi: 9, ta: ta.length, dich: 0 };
    if (!ta.length) return { thang: false, thua: true, loi: 0, ta: 0, dich: dich.length };
    var mauTa = 0, mauDich = 0, dpsTa = 0, dpsDich = 0;
    for (i = 0; i < ta.length; i++) { mauTa += ta[i].hp + tongChan(ta[i]); dpsTa += dpsLen(tran, ta[i], chiSoNguoi(tran, ta[i]), dich[i % dich.length]); }
    for (i = 0; i < dich.length; i++) { mauDich += dich[i].hp + tongChan(dich[i]); dpsDich += dpsLen(tran, dich[i], chiSoNguoi(tran, dich[i]), ta[i % ta.length]); }
    var trTa = truPhu(tran, x, y, doi), trDich = truPhu(tran, x, y, kia);
    if (trTa) dpsTa += dpsTru(trTa, 60);
    if (trDich) dpsDich += dpsTru(trDich, 60);
    var loi = (mauTa / Math.max(1, dpsDich)) / (mauDich / Math.max(1, dpsTa));
    return { thang: loi > 1.1, thua: loi < 0.75, loi: loi, ta: ta.length, dich: dich.length };
  }

  /* ══════ TẦNG ĐỘI ══════ */
  function tickDoi(tran, doi) {
    tickMucTieuLon(tran, doi);
    tickThu(tran, doi);
    tickTapTrung(tran, doi);
  }

  /* Màn tranh quái lớn (AI_BRAIN §4.5): Prepare(chuanBi) → Setup(tap) → Check(kiem) → EnemyHunt(sanDich)
     → Assemble(hop) → Hunt(san) → Battle(danh), rẽ GiveUp(bỏ, có lý do) hay Steal(cuop). Cả đội được
     GỌI; ai từ chối thì đếm tuChoi; đủ `k` người mới đánh; quá hạn chót thì cắt. */
  function doiPha(tran, doi, pha) {
    var ml = tran.doiNao[doi].ml;
    if (ml.pha === pha) return;
    ml.pha = pha; ml.bat = tran.t;
    var ten = ml.quai === 'chua' ? 'Chúa Hang' : 'Rồng';
    var chu = { tap: 'Ổn đấy, ra ' + ten, kiem: 'Kiểm bãi ' + ten, sanDich: 'Bọn nó có thể đang ở ' + ten,
      hop: 'Tụ ở ' + ten, san: 'Bắt đầu ' + ten + '!', danh: 'Sẵn sàng đánh nếu bọn nó tới' }[pha];
    if (chu) goi(tran, doi, 'quailon', chu, ml.ds[0]);
  }
  function huyMl(tran, doi, lyDo) {
    var ml = tran.doiNao[doi].ml;
    if (!ml.pha) return;
    ghiDem(tran.thongKe.boCuoc, lyDo);
    var ten = ml.quai === 'chua' ? 'Chúa Hang' : 'Rồng';
    goi(tran, doi, 'bo', lyDo === 'StackAhead' ? 'Hơn tầng rồi, ' + ten + ' không đáng'
      : lyDo === 'Outnumbered' || lyDo === 'ThuaDua' ? 'Bọn nó đông hơn ở ' + ten + ', lùi' : 'Bỏ ' + ten, ml.ds[0]);
    thaMl(tran, doi);
    ml.henLai = tran.t + 25;
  }
  function xongMl(tran, doi) {
    thaMl(tran, doi);
    tran.doiNao[doi].ml.henLai = tran.t + 10;
  }
  function thaMl(tran, doi) {
    var ml = tran.doiNao[doi].ml;
    for (var i = 0; i < tran.nguoi.length; i++) {
      var n = tran.nguoi[i];
      if (n.doi === doi && n.goi && (n.goi.loai === 'quailon' || n.goi.loai === 'cuop')) n.goi = null;
    }
    ml.pha = null; ml.quai = null; ml.ds = []; ml.cuopAi = -1;
  }
  function tickMucTieuLon(tran, doi) {
    var nao = tran.doiNao[doi], ml = nao.ml, t = tran.t, kia = doiKia(doi), ct = chienThuatCua(tran, doi);
    var i, n, q;
    if (!ml.pha) {
      /* canh cướp (Steal): đội kia đang săn mà mình không có màn → người đi rừng rình ở mép bãi */
      if (ml.cuopAi < 0) {
        var mlKia = tran.doiNao[kia].ml;
        if (mlKia.pha === 'san' || mlKia.pha === 'danh') {
          q = tran.quaiLon[mlKia.quai];
          if (q.song && q.hp < q.hpMax * 0.6) {
            var rung = null;
            for (i = 0; i < tran.nguoi.length; i++) { n = tran.nguoi[i]; if (n.doi === doi && n.chet <= 0 && (n.vt === 'rung' || !rung) && !n.veNha) { rung = n; if (n.vt === 'rung') break; } }
            if (rung && xaXY(rung.x, rung.y, q.x, q.y) < 450) {
              rung.goi = { loai: 'cuop', quai: mlKia.quai };
              ml.cuopAi = rung.i; ml.cuopLuc = t;
              ghiDem(tran.thongKe, 'cuopThu');
              goi(tran, doi, 'cuop', 'Rình cướp ' + q.ten, rung.i);
            }
          }
        }
      } else {
        n = tran.nguoi[ml.cuopAi];
        q = tran.quaiLon[n.goi && n.goi.quai];
        if (!n.goi || n.goi.loai !== 'cuop' || !q || !q.song || t - ml.cuopLuc > 45 || n.chet > 0) { if (n.goi && n.goi.loai === 'cuop') n.goi = null; ml.cuopAi = -1; }
        return;
      }
      if (t < ml.henLai) return;
      var chon = null, giaTot = 0;
      ['chua', 'rong'].forEach(function (k) {
        var q2 = tran.quaiLon[k];
        var sap = q2.song ? 0 : q2.hienRa - t;
        if (sap > BAO_TRUOC) return;
        var gia = k === 'chua' ? MW.epic : MW.serpen;
        if (gia > giaTot) { giaTot = gia; chon = k; }
      });
      if (!chon) return;
      q = tran.quaiLon[chon];
      var song = demSong(tran, doi), songDich = demSong(tran, kia);
      var chenh = tran.vang[doi] - tran.vang[kia];
      /* lệnh Rồng của màn chiến thuật: luon ↔ Must, tuy ↔ Flexible, nhuong ↔ Concede (early_serpen của TFM2) */
      var di;
      if (ct.rong === 'luon') di = song >= 2;
      else if (ct.rong === 'nhuong') di = song > songDich || chenh > 1500;
      else di = song >= songDich || chenh > -1500;
      var lyDo = di ? '' : 'BatLoi';
      if (di && chon === 'rong' && tran.buff[doi].serpen - tran.buff[kia].serpen >= 2 && songDich >= song) { di = false; lyDo = 'StackAhead'; }
      /* thời gian hạ quái (pred_dpt): cả đội gõ mà quá 50 s thì chưa đủ sức, để sau (Chúa Hang 10000 máu 150 giáp) */
      if (di) {
        var cQ = chiSoQuai(q.cau, q.lan), dpsQ = 0;
        for (i = 0; i < tran.nguoi.length; i++) { n = tran.nguoi[i]; if (n.doi === doi && n.chet <= 0) dpsQ += dpsLen(tran, n, chiSoNguoi(tran, n), cQ); }
        if (cQ.hp / Math.max(1, dpsQ) > 50) { di = false; lyDo = 'QuaLau'; }
      }
      if (!di) { ghiDem(tran.thongKe.boCuoc, lyDo); ml.henLai = t + (lyDo === 'QuaLau' ? 40 : 20); return; }
      ml.quai = chon; ml.pha = 'chuanBi'; ml.bat = t; ml.k = Math.min(K_QUAI[chon], song); ml.ds = [];
      var tap = vePhiaNha(q, doi, 95);
      ml.tapX = tap[0]; ml.tapY = tap[1];
      ml.hanChot = Math.max(t, q.song ? t : q.hienRa) + 25;
      for (i = 0; i < tran.nguoi.length; i++) {
        n = tran.nguoi[i];
        if (n.doi !== doi) continue;
        /* early_serpen_top: đường trên không xuống Rồng trừ khi lệnh 'luon' (Must); object_buildup Split: đường
           đối diện Chúa Hang (dưới) ở lại đẩy — bỏ trống cả ba đường là lính địch gõ trụ không ai cản (§16) */
        if (chon === 'rong' && n.vt === 'tren' && ct.rong !== 'luon') continue;
        if (chon === 'chua' && n.vt === 'duoi' && ct.rong !== 'luon') continue;
        /* TaskDecline: cái tôi cao / NÃO thấp thì từ chối lời gọi */
        if (tran.rng.duoc((1 - ngheLenh(n)) * 0.35)) { tran.thongKe.loi.tuChoi++; continue; }
        ml.ds.push(n.i);
        n.goi = { loai: 'quailon', quai: chon };
      }
      if (ml.ds.length < 2) { ml.pha = null; ml.quai = null; ml.ds = []; ghiDem(tran.thongKe.boCuoc, 'ThieuNguoi'); ml.henLai = t + 20; return; }
      tran.thongKe.tranhQuai++;
      goi(tran, doi, 'quailon', (chon === 'chua' ? 'Chúa Hang' : 'Rồng') + (q.song ? ' đang mở' : ' ra trong ' + Math.round(q.hienRa - t) + 's'), ml.ds[0]);
      return;
    }
    q = tran.quaiLon[ml.quai];
    var taO = 0, dichO = 0;
    for (i = 0; i < tran.nguoi.length; i++) {
      n = tran.nguoi[i];
      if (n.chet > 0) continue;
      var d = xaXY(n.x, n.y, q.x, q.y);
      if (d > 200) continue;
      if (n.doi === doi) taO++; else dichO++;
    }
    switch (ml.pha) {
      case 'chuanBi':
        if (t - ml.bat > 12 || q.song) doiPha(tran, doi, 'tap');
        break;
      case 'tap':
        if (taO >= 1) doiPha(tran, doi, 'kiem');
        else if (t > ml.hanChot) huyMl(tran, doi, 'HetHan');
        break;
      case 'kiem':
        doiPha(tran, doi, dichO ? 'sanDich' : 'hop');
        break;
      case 'sanDich':
        if (!dichO) doiPha(tran, doi, 'hop');
        else {
          var duaS = duaDoi(tran, doi, q.x, q.y, 260);
          if (duaS.thua || dichO >= taO + 2) huyMl(tran, doi, dichO > taO ? 'Outnumbered' : 'ThuaDua');
          else if (duaS.thang || t - ml.bat > 4) doiPha(tran, doi, 'danh');
        }
        break;
      case 'hop':
        if (dichO > taO) doiPha(tran, doi, 'sanDich');
        else if (q.song && taO >= ml.k) doiPha(tran, doi, 'san');
        else if (t > ml.hanChot) { if (q.song && taO >= 2 && !dichO) doiPha(tran, doi, 'san'); else huyMl(tran, doi, 'HetHan'); }
        break;
      case 'san':
        if (!q.song) { xongMl(tran, doi); break; }
        if (dichO) {
          var dua = duaDoi(tran, doi, q.x, q.y, 260);
          if (dua.thua || dichO >= taO + 2) huyMl(tran, doi, dichO > taO ? 'Outnumbered' : 'ThuaDua');
          else doiPha(tran, doi, 'danh');
        }
        break;
      case 'danh':
        if (!q.song) { xongMl(tran, doi); break; }
        if (!dichO) doiPha(tran, doi, 'san');
        else { var duaD = duaDoi(tran, doi, q.x, q.y, 260); if (duaD.thua || dichO >= taO + 2) huyMl(tran, doi, dichO > taO ? 'Outnumbered' : 'ThuaDua'); }
        break;
    }
  }

  /* Giữ trụ (AI_BRAIN §4.6 tower_discipline + defense Gather/Battle): trụ nào của mình đang bị ép
     (tướng địch trong tầm + 110, hay ≥ 3 lính địch trong tầm) thì gọi người đi đường ấy và những
     người gần nhất đang rảnh về đứng SAU trụ. Đứng dưới trụ thì cuộc đua có trụ nhà cộng cho mình. */
  function tickThu(tran, doi) {
    var nao = tran.doiNao[doi], thu = nao.thu, t = tran.t, ct = chienThuatCua(tran, doi);
    var tot = null, diemTot = 0, i, n;
    for (var z = 0; z < tran.tru.length; z++) {
      var r = tran.tru[z];
      if (r.doi !== doi || !r.song || !truMo(tran, r)) continue;
      var dichC = 0, ta = 0;
      for (i = 0; i < tran.nguoi.length; i++) {
        n = tran.nguoi[i];
        if (n.chet > 0) continue;
        var d = xaXY(n.x, n.y, r.x, r.y);
        if (n.doi === doi) { if (d < r.tam + 90) ta++; }
        else if (d < r.tam + 110) dichC++;
      }
      var dichL = demLinhDich(tran, doi, r.x, r.y, Math.max(r.tam, 45) + 30);
      if (!dichC && dichL < 3) continue;
      var diem = dichC * 2 + (dichL >= 3 ? 1 : 0) + (1 - r.hp / r.hpMax) * 2 + (r.nha ? 2 : 0) + (r.loi ? 4 : 0) - ta * 1.2;
      if (diem > diemTot) { diemTot = diem; tot = { r: r, dichC: dichC, dichL: dichL, ta: ta }; }
    }
    if (!tot) {
      if (thu.tru && t - thu.luc > 4) {
        for (i = 0; i < thu.ds.length; i++) { n = tran.nguoi[thu.ds[i]]; if (n.goi && n.goi.loai === 'thu') n.goi = null; }
        thu.tru = null; thu.ds = [];
      }
      return;
    }
    thu.luc = t;
    /* đủ người: một người cho mỗi tướng địch, một cho mỗi ba lính; nhà / lõi thì gọi tất cả */
    var can = (tot.r.nha || tot.r.loi) ? 5 : Math.max(1, tot.dichC + Math.ceil(tot.dichL / 3) + (ct.mucTieu === 'lao' ? 1 : 0));
    if (thu.tru === tot.r && thu.ds.length >= can) return;
    if (thu.tru !== tot.r) {
      for (i = 0; i < thu.ds.length; i++) { n = tran.nguoi[thu.ds[i]]; if (n.goi && n.goi.loai === 'thu') n.goi = null; }
      thu.ds = [];
    }
    thu.tru = tot.r;
    /* nhà bị ép thì bỏ màn quái lớn (DefenseNexus đứng trên mọi thứ) */
    if ((tot.r.nha || tot.r.loi) && nao.ml.pha) huyMl(tran, doi, 'GiuNha');
    var ung = [], truocDo = thu.ds.length;
    for (i = 0; i < tran.nguoi.length; i++) {
      n = tran.nguoi[i];
      if (n.doi !== doi || n.chet > 0 || thu.ds.indexOf(n.i) >= 0) continue;
      if (n.goi && n.goi.loai === 'quailon' && (nao.ml.pha === 'san' || nao.ml.pha === 'danh')) continue;
      if (n.veNha && n.hp / n.hpMax < 0.45) continue;
      var uu = xaXY(n.x, n.y, tot.r.x, tot.r.y) - (laneCua(n) === tot.r.lane ? 200 : 0) - (tot.r.nha || tot.r.loi ? 300 : 0);
      ung.push({ n: n, uu: uu });
    }
    ung.sort(function (a, b) { return a.uu - b.uu; });
    for (i = 0; i < ung.length && thu.ds.length < can; i++) {
      n = ung[i].n;
      if (ung[i].uu > 700 && !(tot.r.nha || tot.r.loi)) break;
      if (tran.rng.duoc((1 - ngheLenh(n)) * 0.25)) { tran.thongKe.loi.tuChoi++; continue; }
      n.goi = { loai: 'thu', tru: tot.r };
      thu.ds.push(n.i);
    }
    if (thu.ds.length > truocDo) goi(tran, doi, 'thu', (tot.r.nha || tot.r.loi) ? 'Về giữ nhà!' : 'Giữ trụ ' + { tren: 'trên', giua: 'giữa', duoi: 'dưới' }[tot.r.lane], thu.ds[0]);
  }

  /* Mục tiêu chung do NGƯỜI GỌI chọn (AI_BRAIN §4.1 battle.focus): trong một giao tranh, người có
     NÃO cao / cái tôi thấp / chất 'lead' gọi một mục tiêu; người nghe cộng điểm cho nó, và có thể
     nghe nhầm (misread_target). */
  function tickTapTrung(tran, doi) {
    var tt = tran.doiNao[doi].tapTrung, t = tran.t;
    if (t - tt.luc < 2) return;
    var gt = diemGiaoTranh(tran, doi);
    if (!gt) { tt.ai = -1; return; }
    var goiAi = null, diemG = -1, i, m;
    for (i = 0; i < tran.nguoi.length; i++) {
      m = tran.nguoi[i];
      if (m.doi !== doi || m.chet > 0 || xaXY(m.x, m.y, gt.x, gt.y) > 300) continue;
      var dg = m.cs.nao / 1200 + (100 - m.ego) / 200 + (chatCo(m, 'lead') ? 0.5 : 0);
      if (dg > diemG) { diemG = dg; goiAi = m; }
    }
    if (!goiAi) return;
    var tot = null, diemT = -1e9;
    for (i = 0; i < tran.nguoi.length; i++) {
      m = tran.nguoi[i];
      if (m.doi === doi || m.chet > 0 || m.khongChon > t) continue;
      var d = xaXY(m.x, m.y, gt.x, gt.y);
      if (d > 260) continue;
      var diem = (1 - m.hp / m.hpMax) * 2 + (LOP_MEM[m.tuong.lop] ? 0.8 : 0) + (m.kc > 0 ? 0.7 : 0) - d / 260;
      if (diem > diemT) { diemT = diem; tot = m; }
    }
    if (!tot) return;
    if (tt.ai !== tot.i) { tran.thongKe.goiTapTrung++; goi(tran, doi, 'tapTrung', 'Dồn ' + tot.ten + '!', goiAi.i); }
    tt.ai = tot.i; tt.luc = t; tt.goi = goiAi.i;
  }

  /* ══════ TẦNG CÁ NHÂN ══════ */
  var LOP_MEM = { xa: 1, phep: 1, ho: 1 };
  /* Điểm mục tiêu (RESEARCH §8.2) + mục tiêu chung của đội (+4 × nghe lệnh, có thể nghe nhầm). NÃO thấp thì nhiễu. */
  function mucTieuTot(tran, n, tam, cs) {
    var tot = null, diemTot = -1e9, t = tran.t;
    var laSat = n.tuong.lop === 'sat';
    var uocDon = cs.atk * 0.5;
    var nhieu = 1 - G.kep(n.cs.nao / 1200, 0, 1);
    var tt = tran.doiNao[n.doi].tapTrung, chung = -1;
    if (tt.ai >= 0 && t - tt.luc < 4) {
      if (n.ngheLuc !== tt.luc) {
        n.ngheLuc = tt.luc; n.ngheAi = tt.ai;
        if (tt.goi !== n.i && tran.rng.duoc((1 - ngheLenh(n)) * 0.15)) {
          var gan = dichGanNhat(tran, n, 300, { tuong: true });
          if (gan && gan.i !== tt.ai) { n.ngheAi = gan.i; tran.thongKe.loi.ngheNham++; }
        }
      }
      chung = n.ngheAi;
    }
    for (var i = 0; i < tran.nguoi.length; i++) {
      var m = tran.nguoi[i];
      if (m.doi === n.doi || m.chet > 0 || m.khongChon > t || (m.anMinh > t && t - m.lanCuoi > 1)) continue;
      var d = xa(n, m);
      if (d > tam) continue;
      var diem = 1.2 * (1 - d / tam);
      diem += (1 - m.hp / m.hpMax) * 1.9;
      if (m.hp <= uocDon) diem += 6;
      if (m.kc > 0 || m.chamDen > t) diem += 0.7;
      if (LOP_MEM[m.tuong.lop]) diem += 0.6 + (laSat ? 0.5 : 0);
      if (m.i === chung) diem += 4 * ngheLenh(n);
      var cung = 0;
      for (var j = 0; j < tran.nguoi.length; j++) {
        var a = tran.nguoi[j];
        if (a.doi !== n.doi || a === n || a.chet > 0) continue;
        if (a.nham === m.i) cung++;
      }
      diem += Math.min(cung, 3) * 1.8;
      diem += (tran.rng() - 0.5) * 2.4 * nhieu;
      if (diem > diemTot) { diemTot = diem; tot = m; }
    }
    if (tot) n.nham = tot.i;
    return tot;
  }

  function linhGanNhat(tran, n, banKinh) {
    var g = null, gd = banKinh || 1e9;
    for (var i = 0; i < tran.linh.length; i++) {
      var l = tran.linh[i];
      if (l.doi === n.doi || l.hp <= 0) continue;
      var d = xaXY(n.x, n.y, l.x, l.y);
      if (d < gd) { gd = d; g = l; }
    }
    return g;
  }
  /** lính địch gần nhất mà ĂN ĐƯỢC: cùng đường mình (không thì năm người dạt hết về giữa —
      §14.5), và con đứng trong tầm trụ địch chỉ tính khi lính nhà mình đang đỡ đạn ở đó */
  function linhAnDuoc(tran, n, banKinh, lane) {
    var g = null, gd = banKinh || 1e9;
    var dk = doiKia(n.doi);
    for (var i = 0; i < tran.linh.length; i++) {
      var l = tran.linh[i];
      if (l.doi === n.doi || l.hp <= 0 || l.trieu) continue;
      if (lane && l.lane !== lane) continue;
      var d = xaXY(n.x, n.y, l.x, l.y);
      if (d >= gd) continue;
      /* `[BẪY ĐÃ SẬP]` §16: lính đứng SAU trụ địch (theo tham số đường l.t) thì đường tới nó xuyên tầm trụ —
         người đi đường cũ đi bộ qua trụ để "ăn lính" và chết ở giây 24, 63 */
      var tTru = truTruocCua(tran, dk, l.lane);
      if (tTru != null && (n.doi === 'xanh' ? l.t > tTru - 0.03 : l.t < tTru + 0.03)) continue;
      var tr = truPhu(tran, l.x, l.y, dk);
      if (tr && !coLinhTa(tran, tr.x, tr.y, n.doi, tr.tam)) continue;
      gd = d; g = l;
    }
    return g;
  }
  /** tham số đường của trụ đứng trước nhất (còn sống) của đội `doiTru` trên `lane`; null nếu đường sạch */
  function truTruocCua(tran, doiTru, lane) {
    var tt = null;
    for (var i = 0; i < tran.tru.length; i++) {
      var r = tran.tru[i];
      if (r.doi !== doiTru || !r.song || r.lane !== lane) continue;
      if (tt == null || (doiTru === 'do' ? r.t < tt : r.t > tt)) tt = r.t;
    }
    return tt;
  }
  function truGanNhat(tran, n, banKinh) {
    var g = null, gd = banKinh || 1e9;
    for (var i = 0; i < tran.tru.length; i++) {
      var r = tran.tru[i];
      if (r.doi === n.doi || !r.song) continue;
      if (!truMo(tran, r)) continue;
      var d = xaXY(n.x, n.y, r.x, r.y);
      if (d < gd) { gd = d; g = r; }
    }
    return g;
  }
  function coLaneSach(tran, doi) {
    var con = { tren: 0, giua: 0, duoi: 0 };
    tran.tru.forEach(function (x) {
      if (x.doi !== doi || x.lane === 'nha' || x.lane === 'loi') return;
      if (x.song) con[x.lane]++;
    });
    return !con.tren || !con.giua || !con.duoi;
  }
  /** trụ này đã ĐÁNH ĐƯỢC chưa (trụ sau chỉ mở khi trụ trước đổ; nhà mở khi một đường sạch; lõi khi hết trụ nhà) */
  function truMo(tran, r) {
    if (r.lane === 'nha' || r.lane === 'loi') {
      if (r.lane === 'loi') return !tran.tru.some(function (x) { return x.doi === r.doi && x.song && x.lane === 'nha'; });
      return coLaneSach(tran, r.doi);
    }
    var ngoai = tran.tru.filter(function (x) { return x.doi === r.doi && x.lane === r.lane && x.song; });
    if (!ngoai.length) return true;
    var thuTu = ngoai.slice().sort(function (a, b) { return r.doi === 'xanh' ? (a.t - b.t) : (b.t - a.t); });
    return thuTu[thuTu.length - 1] === r;
  }
  function diemGiaoTranh(tran, doi) {
    var ds = tran.nguoi.filter(function (m) { return m.doi === doi && m.chet <= 0 && tran.t - m.lanCuoi < 4; });
    if (ds.length < 2) return null;
    var x = 0, y = 0;
    ds.forEach(function (m) { x += m.x; y += m.y; });
    return { x: x / ds.length, y: y / ds.length, so: ds.length };
  }
  function truMoCuaLane(tran, doiDich, lane) {
    var ds = tran.tru.filter(function (x) { return x.doi === doiDich && x.song && x.lane === lane && truMo(tran, x); });
    if (ds.length) return ds[0];
    var sau = tran.tru.filter(function (x) {
      return x.doi === doiDich && x.song && (x.lane === 'nha' || x.lane === 'loi') && truMo(tran, x);
    });
    return sau[0] || null;
  }
  function cuaSoDut(tran, doi) {
    var kia = doiKia(doi);
    var gay = 0;
    for (var i = 0; i < tran.nguoi.length; i++) { var m = tran.nguoi[i]; if (m.doi === kia && m.chet > 8) gay++; }
    if (gay < 3) return false;
    for (var j = 0; j < tran.tru.length; j++) {
      var r = tran.tru[j];
      if (r.doi === kia && r.song && (r.lane === 'nha' || r.lane === 'loi') && truMo(tran, r)) return r;
    }
    return false;
  }
  function keHoachDoi(tran, doi) {
    var k = tran.keHoach[doi];
    if (k && tran.t - k.t < (k.dut ? 15 : 8)) return k;
    var kia = doiKia(doi);
    var song = 0, chetDich = 0;
    tran.nguoi.forEach(function (m) {
      if (m.doi === doi) { if (m.chet <= 0) song++; }
      else if (m.chet > 5) chetDich++;
    });
    var tot = 'giua', diemTot = -1e9;
    ['tren', 'giua', 'duoi'].forEach(function (l) {
      var con = 0;
      tran.tru.forEach(function (x) { if (x.doi === kia && x.song && x.lane === l) con++; });
      var diem = (2 - con) * 3;
      var muc = truMoCuaLane(tran, kia, l);
      if (muc) diem += (1 - muc.hp / muc.hpMax) * 3;
      else diem -= 6;
      if (diem > diemTot) { diemTot = diem; tot = l; }
    });
    var loRa = tran.tru.some(function (x) {
      return x.doi === kia && x.song && (x.lane === 'nha' || x.lane === 'loi') && truMo(tran, x);
    });
    /* "đủ người là đẩy" chỉ bật sau pha đi đường — lúc Chúa Hang ra lần đầu (RESEARCH §13.5) */
    var moc = giay(CAI.epic_jungle.first_spawn_tick);
    k = { loai: (loRa || chetDich >= 2 || (song >= 4 && tran.t > moc)) ? 'day' : 'thu', lane: tot, t: tran.t, dut: loRa };
    tran.keHoach[doi] = k;
    return k;
  }
  /** chỗ rút: sau trụ nhà gần nhất còn đứng mà gần nhà hơn mình; không có thì về giếng */
  function diemRut(tran, n) {
    var nha = n.nha, dNha = xaXY(n.x, n.y, nha[0], nha[1]);
    var tot = null, dTot = 1e9;
    for (var i = 0; i < tran.tru.length; i++) {
      var r = tran.tru[i];
      if (r.doi !== n.doi || !r.song || !r.tam) continue;
      if (xaXY(r.x, r.y, nha[0], nha[1]) > dNha - 20) continue;
      var d = xaXY(n.x, n.y, r.x, r.y);
      if (d < dTot) { dTot = d; tot = r; }
    }
    if (!tot) return { x: nha[0], y: nha[1] };
    var p = vePhiaNha(tot, n.doi, 18);
    return { x: p[0], y: p[1] };
  }
  function rut(tran, n, lyDo) {
    ghiDem(tran.thongKe.rut, lyDo);
    n.rutLyDo = lyDo;
    var p = diemRut(tran, n);
    return { loai: 'rut', x: p.x, y: p.y, lyDo: lyDo };
  }

  /* Bắt lẻ theo TÌNH TRẠNG ĐƯỜNG (AI_BRAIN §4.4, P6): chấm từng người đi đường địch — máu thấp, xa trụ
     nó, người đi đường mình còn sống và khoẻ, không quá xa, và cuộc đua giả định "mình đứng cạnh nó"
     phải thắng. Chỉ đi khi thắng. */
  /** đường thẳng tới (x, y) có đi qua tầm trụ địch không (dò 6 điểm) */
  function truTrenDuong(tran, n, x, y) {
    var dk = doiKia(n.doi);
    for (var k = 1; k <= 6; k++) if (truPhu(tran, n.x + (x - n.x) * k / 6, n.y + (y - n.y) * k / 6, dk)) return true;
    return false;
  }
  function chonGank(tran, n) {
    var dk = doiKia(n.doi), tot = null, diemTot = 1.0, i, m;
    for (i = 0; i < tran.nguoi.length; i++) {
      m = tran.nguoi[i];
      if (m.doi === n.doi || m.chet > 0 || m.vt === 'rung' || m.khongChon > tran.t) continue;
      var d = xa(n, m);
      if (d < 120 || d > 520) continue;
      var diem = (1 - m.hp / m.hpMax) * 2 - d / 400;
      var truNo = null, dTru = 1e9;
      for (var z = 0; z < tran.tru.length; z++) {
        var r = tran.tru[z];
        if (r.doi !== dk || !r.song || !r.tam) continue;
        var dr = xaXY(r.x, r.y, m.x, m.y);
        if (dr < dTru) { dTru = dr; truNo = r; }
      }
      diem += (truNo && dTru < truNo.tam + 40) ? -2 : 1.2;
      var banTa = null;
      for (var j = 0; j < tran.nguoi.length; j++) {
        var b = tran.nguoi[j];
        if (b.doi !== n.doi || b === n || b.chet > 0 || b.vt === 'rung') continue;
        if (xa(b, m) < 160 && b.hp / b.hpMax >= 0.5) { banTa = b; break; }
      }
      diem += banTa ? 1.5 + (chatCo(banTa, 'gank') ? 0.6 : 0) : -1;
      if (diem <= diemTot) continue;
      /* cuộc đua giả định: mình đứng cạnh nó (đổi tạm toạ độ rồi trả lại) */
      var x0 = n.x, y0 = n.y;
      n.x = m.x + (n.x < m.x ? -25 : 25); n.y = m.y;
      var dua = duaChet(tran, n, m, { bien: 0.1 });
      n.x = x0; n.y = y0;
      if (!dua.thang) continue;
      diemTot = diem; tot = m;
    }
    return tot;
  }

  var DUNG_GO = { farm: 1, giulane: 1, thu: 1, daytru: 1, chotru: 1 };
  function chonHanhDong(tran, n) {
    var ct = tran.cau[n.ben].chienThuat || {};
    var cs = n.cs;
    var nghe = ngheLenh(n);
    var rng = tran.rng;
    var chat = n.chat;
    var dk = doiKia(n.doi);
    var t = tran.t;
    var nao = tran.doiNao[n.doi];
    var cu = (n.mucTieu && n.mucTieu.loai) || '';
    function giu(loai, p) { return cu === loai ? Math.min(0.97, p * 2.8 + 0.22) : p; }

    /* 0. CUỘC ĐUA "AI CHẾT TRƯỚC" đứng đầu: có địch có mặt / kịp tới, hay trụ đang nhắm mình, thì
       so hai con số. Thua thì rút, ghi lý do (BattleStop của TFM2: TowerFocused / BurstRisk /
       Outnumbered / LowHp / race lost). Không còn ngưỡng máu cố định, không còn đếm đầu trong bán kính. */
    var dichKe = dichGanNhat(tran, n, 250, { tuong: true });
    var truDich = truPhu(tran, n.x, n.y, dk);
    var linhDanhToi = 0;
    for (var il = 0; il < tran.linh.length; il++) {
      var ll = tran.linh[il];
      if (ll.doi !== n.doi && ll.hp > 0 && ll.mucAi === n) linhDanhToi++;
    }
    /* giữ nhà là LastStand (DefenseNexus của TFM2): không chạy trừ khi sắp chết hẳn */
    var giuNha = n.goi && n.goi.loai === 'thu' && (n.goi.tru.nha || n.goi.tru.loi) && n.hp / n.hpMax > 0.2;
    if (!giuNha && (dichKe || (truDich && t - n.truBan < 2) || linhDanhToi >= 2)) {
      var bien = chatCo(n, 'lao') ? -0.25 : chatCo(n, 'thu') ? 0.15 : 0;
      if (ct.mucTieu === 'lao') bien -= 0.08;
      var mucDua = dichKe ? mucTieuTot(tran, n, 250, cs) : null;
      var dua = duaChet(tran, n, mucDua, { bien: bien, lao: !!(mucDua && truPhu(tran, mucDua.x, mucDua.y, dk)) });
      var ketLieu = mucDua && dua.dich < 1.2 && n.hp / n.hpMax > 0.3 && !dua.coTru;
      if (dua.thua && !ketLieu) { n.veNha = n.veNha || (n.hp / n.hpMax < 0.35); return rut(tran, n, dua.lyDo); }
    }
    /* máu mòn mà quanh không ai: về giếng (TFM2 không hồi máu tự nhiên — §14.5) */
    var nguong = 0.36 + (chatCo(n, 'thu') ? 0.05 : 0) - (chatCo(n, 'lao') ? 0.06 : 0);
    if (n.hp / n.hpMax < nguong && !n.veNha) n.veNha = true;
    if (n.veNha) {
      if (xaXY(n.x, n.y, n.nha[0], n.nha[1]) < 60) {
        muaDo(tran, n);
        if (n.hp > n.hpMax * 0.9) n.veNha = false;
      }
      if (n.veNha) return { loai: 've', x: n.nha[0], y: n.nha[1] };
    }

    var truDut = cuaSoDut(tran, n.doi);
    if (truDut && n.hp / n.hpMax > 0.18) return diemDayTru(tran, n, truDut);

    /* 1. LỜI GỌI CỦA ĐỘI (tầng đội đã quyết): màn quái lớn / giữ trụ / rình cướp */
    if (n.goi) {
      var g = n.goi, ml = nao.ml;
      if (g.loai === 'quailon') {
        var q = tran.quaiLon[g.quai];
        if (ml.quai !== g.quai || !ml.pha) n.goi = null;
        else if (ml.pha === 'chuanBi') {
          if (n.hp / n.hpMax < 0.55 && !dichKe) { n.veNha = true; return { loai: 've', x: n.nha[0], y: n.nha[1] }; }
          if (xaXY(n.x, n.y, ml.tapX, ml.tapY) > 260) return { loai: 'quailon', x: ml.tapX, y: ml.tapY, mt: null, pha: ml.pha };
        } else if (ml.pha === 'san' || ml.pha === 'danh' || ml.pha === 'sanDich') {
          return { loai: 'quailon', x: q.x, y: q.y, mt: q.song ? q : null, pha: ml.pha };
        } else return { loai: 'quailon', x: ml.tapX, y: ml.tapY, mt: null, pha: ml.pha };
      } else if (g.loai === 'thu') {
        var r0 = g.tru;
        if (!r0.song || nao.thu.tru !== r0) n.goi = null;
        else {
          /* lính địch đang gõ trụ là thứ giết trụ: dọn nó trước (LineDefense) */
          var lT = null, dlT = 1e9, vongT = Math.max(r0.tam, 45) + 30;
          for (var jl = 0; jl < tran.linh.length; jl++) {
            var lj = tran.linh[jl];
            if (lj.doi === n.doi || lj.hp <= 0 || xaXY(lj.x, lj.y, r0.x, r0.y) > vongT) continue;
            var dj = xaXY(lj.x, lj.y, n.x, n.y);
            if (dj < dlT) { dlT = dj; lT = lj; }
          }
          if (lT) return { loai: 'thu', x: lT.x, y: lT.y, tru: r0, linh: lT };
          /* đứng trong tầm trụ, về phía địch đang ép (xạ thủ với tới kẻ đang gõ trụ); Force Fight (mucTieu 'lao') ra sát mép */
          var dichT = null, dT = 1e9;
          for (var iT = 0; iT < tran.nguoi.length; iT++) {
            var mT = tran.nguoi[iT];
            if (mT.doi === n.doi || mT.chet > 0) continue;
            var ddT = xaXY(mT.x, mT.y, r0.x, r0.y);
            if (ddT < dT) { dT = ddT; dichT = mT; }
          }
          var pT;
          if (dichT && dT < r0.tam + 160) {
            var uxT = (dichT.x - r0.x) / (dT || 1), uyT = (dichT.y - r0.y) / (dT || 1), rT = r0.tam * (ct.mucTieu === 'lao' ? 0.95 : 0.6);
            pT = diemTrong(r0.x + uxT * rT, r0.y + uyT * rT);
          } else pT = vePhiaNha(r0, n.doi, -30);
          return { loai: 'thu', x: pT[0], y: pT[1], tru: r0 };
        }
      } else if (g.loai === 'cuop') {
        var qc = tran.quaiLon[g.quai];
        if (!qc.song) n.goi = null;
        else if (qc.hp <= CAI.jungle_execute_threshold * 1.6 || qc.hp / qc.hpMax < 0.15) return { loai: 'quailon', x: qc.x, y: qc.y, mt: qc, cuop: true };
        else { var pC = vePhiaNha(qc, n.doi, 115); return { loai: 'quailon', x: pC[0], y: pC[1], mt: null, cuop: true }; }
      }
    }

    /* 2. chín mươi giây đầu chưa có gì để tranh: về đường của mình, ăn lính */
    if (t < 90 && !chatCo(n, 'lao')) {
      var laneDau = laneCua(n);
      var l0 = linhAnDuoc(tran, n, 600, laneDau);
      if (l0) return { loai: 'farm', x: l0.x, y: l0.y };
      var d0p = diemTren(laneDau, n.doi === 'xanh' ? 0.38 : 0.62);
      return { loai: 'giulane', x: d0p[0], y: d0p[1] };
    }

    /* 3. địch vừa gãy hai người → chớp thời cơ đẩy trụ theo kế hoạch đội */
    var dichChet = 0;
    tran.nguoi.forEach(function (m) { if (m.doi !== n.doi && m.chet > 6) dichChet++; });
    if (dichChet >= 2 && rng.duoc(giu('daytru', 0.35 + cs.nao / 1200 * 0.5))) {
      var khCH = keHoachDoi(tran, n.doi);
      var tr2 = truMoCuaLane(tran, dk, khCH.lane) || truGanNhat(tran, n, 1400);
      if (tr2) return diemDayTru(tran, n, tr2);
    }

    /* 4. có giao tranh gần → vào hùa, nhưng chỉ khi cuộc đua có mình vào là thắng (JoinGate) */
    var gt = diemGiaoTranh(tran, n.doi);
    if (gt) {
      var kcc = xaXY(n.x, n.y, gt.x, gt.y);
      var thichDanh = chatCo(n, 'fight') ? 0.9 : chatCo(n, 'thu') ? 0.35 : 0.6;
      var xa2 = kcc < 260 ? 1 : kcc < 480 ? 0.55 : 0.18;
      var p2 = (nghe * (ct.mucTieu === 'lao' ? 0.85 : 0.6) + (1 - nghe) * thichDanh) * xa2 * 0.7;
      if (n.hp / n.hpMax < 0.5) p2 *= 0.3;
      if (rng.duoc(giu('tugiup', p2)) && !duaDoi(tran, n.doi, gt.x, gt.y, 280).thua) return { loai: 'tugiup', x: gt.x, y: gt.y };
    }

    /* 5. bắt lẻ theo tình trạng đường */
    if ((chatCo(n, 'gank') || n.vt === 'rung') && t > 90 && t < 1500) {
      var thichGank = ct.rung === 'gank' ? 0.8 : ct.rung === 'cuop' ? 0.35 : 0.45;
      var p3 = nghe * thichGank + (1 - nghe) * (chatCo(n, 'gank') ? 0.8 : 0.4);
      if (cu === 'gank' || rng.duoc(p3 * 0.08)) {
        var nan = (cu === 'gank' && n.mucTieu.ai >= 0 && tran.nguoi[n.mucTieu.ai].chet <= 0 && t - n.gankLuc < 20) ? tran.nguoi[n.mucTieu.ai] : chonGank(tran, n);
        if (nan) {
          if (n.gankAi !== nan.i || t - n.gankLuc > 20) { n.gankAi = nan.i; n.gankLuc = t; tran.thongKe.gankDi++; }
          return { loai: 'gank', x: nan.x, y: nan.y, ai: nan.i };
        }
      }
    }
    /* 6. đẩy lẻ */
    if (chatCo(n, 'le') && t > 420) {
      var truL = truGanNhat(tran, n, 900);
      if (truL && rng.duoc(giu('daytru', 0.5))) return diemDayTru(tran, n, truL);
    }
    /* 7. đi rừng thì ăn quái */
    if (n.vt === 'rung') {
      var bai = null, bd = 1e9;
      tran.quai.forEach(function (q2) {
        if (!q2.song) return;
        if (q2.gan !== n.doi && (ct.rung !== 'cuop' || truTrenDuong(tran, n, q2.x, q2.y))) return;
        var d = xaXY(n.x, n.y, q2.x, q2.y);
        if (d < bd) { bd = d; bai = q2; }
      });
      if (bai) return { loai: 'anquai', x: bai.x, y: bai.y, quai: bai };
    }
    /* 8. theo kế hoạch của đội */
    var kh = keHoachDoi(tran, n.doi);
    if (kh.loai === 'day' && (kh.dut || (n.vt !== 'rung' && !chatCo(n, 'le')))) {
      var truKH = truMoCuaLane(tran, dk, kh.lane);
      if (truKH) {
        var lk = linhAnDuoc(tran, n, 320, kh.lane);
        if (lk && rng.duoc(0.45)) return { loai: 'farm', x: lk.x, y: lk.y };
        return diemDayTru(tran, n, truKH);
      }
    }
    /* 9. mặc định: về đường của mình, đẩy lính */
    var lane = laneCua(n);
    var l = linhAnDuoc(tran, n, 700, lane);
    if (l) return { loai: 'farm', x: l.x, y: l.y };
    var tr = truGanNhat(tran, n, 700);
    if (tr) return diemDayTru(tran, n, tr);
    var d2 = diemTren(lane, n.doi === 'xanh' ? 0.42 : 0.58);
    return { loai: 'giulane', x: d2[0], y: d2[1] };
  }

  /* Vào gõ trụ khi có lính đỡ; không có lính thì chỉ khi CUỘC ĐUA TRỤ thắng: trụ đổ (theo tổng
     sát thương phe mình đang gõ) trước khi trụ giết mình, và có ≥ 1 đồng đội cùng gõ (AI_BRAIN §4.6:
     `focdt < mdt_tw`). Không thì đứng chờ ở mép tầm. */
  function diemDayTru(tran, n, r) {
    /* lính đỡ đạn phải chịu được ít nhất ba phát trụ nữa (mỗi phát lấy 30 % / 80 % máu tối đa của lính) */
    var soak = 0;
    for (var il = 0; il < tran.linh.length; il++) {
      var ll = tran.linh[il];
      if (ll.doi !== n.doi || ll.hp <= 0 || xaXY(ll.x, ll.y, r.x, r.y) > tamTru(r)) continue;
      soak += Math.ceil(ll.hp / (ll.hpMax * ll.tuTru / 100));
    }
    var vao = soak >= 3;
    if (!vao && tran.t - n.truBan > 2) {
      var dpsTa = 0, cung = 0;
      for (var i = 0; i < tran.nguoi.length; i++) {
        var m = tran.nguoi[i];
        if (m.doi !== n.doi || m.chet > 0) continue;
        if (xaXY(m.x, m.y, r.x, r.y) > r.tam + 80) continue;
        dpsTa += dpsLen(tran, m, chiSoNguoi(tran, m), r);
        if (m !== n) cung++;
      }
      var cs = chiSoNguoi(tran, n);
      vao = cung >= 1 && dpsTa > 0 && r.hp / dpsTa < (n.hp + tongChan(n)) / dpsTru(r, cs.giap) * 0.8;
    }
    if (vao) return { loai: 'daytru', x: r.x, y: r.y, tru: r };
    var dx = n.x - r.x, dy = n.y - r.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var can = r.tam + 40;
    return { loai: 'chotru', x: r.x + dx / d * can, y: r.y + dy / d * can, tru: r };
  }

  /* ══════════════════ CHIÊU: theo casting_target, và biết GIỮ (AI_BRAIN §4.1, P3) ══════════════════
     Tướng mod đọc thẳng `casting_target`; tướng gốc suy từ phân tích (uocChieu): có khống chế hay là
     chiêu cuối ⇒ EnemyChampion (chỉ tung vào tướng địch / quái lớn), sát thương thường ⇒
     EnemyWithoutTower (được ném vào lính khi đang ăn lính, chiêu diện rộng trúng ≥ 3 con và không có
     tướng địch trong tầm × 1,3), hồi / khiên ⇒ Ally (ai dưới 60 % máu), buff mình ⇒ AllyOnlySelf (chỉ
     khi đang đổi máu với tướng — STEROID_WIN). Chiêu cuối chấm giá trị kỳ vọng: diện rộng trúng ≥ 2
     tướng, hoặc mục tiêu chung của đội, hoặc kết liễu, hoặc mình sắp chết, hoặc ôm quá lâu.
     Ult mở từ cấp 5 (`[ĐỀ XUẤT]`). */
  function thuChieu(tran, n, cs, muc, mt) {
    if (n.im > tran.t) return false;
    var rng = tran.rng, t = tran.t;
    var dichTuong = !!(muc && muc.tuong && muc.doi !== n.doi);
    var quaiLon = !!(muc && muc.hienRa != null);
    var dangFarm = mt && (mt.loai === 'farm' || mt.loai === 'giulane' || mt.loai === 'thu');
    var uc = uocChieu(n.tuong);
    var thuTu = ['ult', 'skill', 'skill2'];
    for (var i = 0; i < thuTu.length; i++) {
      var loai = thuTu[i];
      if (n.cd[loai] > 0 || !n.tuong.tfm[loai]) continue;
      if (loai === 'ult' && n.cap < 5) continue;
      var c = null;
      for (var j = 0; j < uc.length; j++) if (uc[j].loai === loai) c = uc[j];
      if (!c) continue;
      var lop = c.lop, choLinh = false;
      if (lop === 'EnemyChampion' || lop === 'EnemyChampionInCc' || lop === 'EnemyChampionRecentlyAttacked' || lop === 'BothChampion') {
        if (!dichTuong && !(quaiLon && loai !== 'ult' && !c.kc)) continue;
        if (n.kyLuat) continue;
        if (c.kc && dichTuong && muc.kc > 0.5) continue;
        /* chiêu lao tới mục tiêu đứng dưới trụ địch = tự chui vào trụ: chỉ khi cuộc đua lao trụ thắng */
        if (c.lao && dichTuong && truPhu(tran, muc.x, muc.y, doiKia(n.doi)) && !duaChet(tran, n, muc, { lao: true }).thang) continue;
        if (loai === 'ult') {
          var tt = tran.doiNao[n.doi].tapTrung;
          var dichQuanh = 0;
          if (c.dien) {
            var tamX = c.banKinh ? kc(c.banKinh) : 0, cx = c.tam ? muc.x : n.x, cy = c.tam ? muc.y : n.y;
            for (var k = 0; k < tran.nguoi.length; k++) {
              var m = tran.nguoi[k];
              if (m.doi === n.doi || m.chet > 0) continue;
              if (xaXY(m.x, m.y, cx, cy) <= tamX + BK * 2) dichQuanh++;
            }
          }
          var chung = tt.ai === muc.i && t - tt.luc < 4;
          var sapChet = n.hp / n.hpMax < 0.3;
          var ketLieu = dichTuong && (c.dmg || c.he) && muc.hp + tongChan(muc) <= satMotChieu(c, cs, chiSoNguoi(tran, muc).giap, chiSoNguoi(tran, muc).khang) * 1.1;
          var laoTru = c.kc && truPhu(tran, muc.x, muc.y, doiKia(n.doi));
          if (!(dichQuanh >= 2 || chung || sapChet || ketLieu || laoTru || n.cd.ult < -40 || (!c.dien && !c.kc && dichTuong))) continue;
          /* NÃO thấp thì nhìn ra thời điểm chậm hơn: hụt lượt này, thử lại sau 0,4 s */
          if (!rng.duoc(0.55 + n.cs.nao / 1200 * 0.45)) { n.cd.ult = 0.4; continue; }
        }
      } else if (lop === 'EnemyWithoutTower' || lop === 'Enemy' || lop === 'BothWithoutTower' || lop === 'Both') {
        if (!dichTuong && !quaiLon) {
          /* ném vào lính: đang ăn lính / giữ trụ, không có tướng địch trong tầm × 1,3, và (diện rộng trúng ≥ 3 con,
             hay đang giữ trụ mà sóng địch ≥ 3 con đang gõ trụ — dọn sóng là việc sống còn với số TFM2) */
          if (!muc || !muc.linh || !dangFarm || dichGanNhat(tran, n, kc(c.tam || c.banKinh || 30000) * 1.3, { tuong: true })) continue;
          var giuTru = mt.loai === 'thu' && mt.tru && demLinhDich(tran, n.doi, mt.tru.x, mt.tru.y, Math.max(mt.tru.tam, 45) + 30) >= 3;
          if (!giuTru && !(c.dien && c.banKinh && demLinhDich(tran, n.doi, muc.x, muc.y, kc(c.banKinh)) >= 3)) continue;
          choLinh = true;
        } else if (n.kyLuat && dichTuong) continue;
      } else if (lop === 'AllyOnlySelf') {
        if (!dichTuong) continue;
      }
      var chon = G.chonMucChieu(tran, n, loai, cs, muc, { linh: choLinh, nguongHoi: 0.6 });
      if (!chon) continue;
      if (chon.muc && chon.muc.linh && !choLinh) continue;
      if (n.kyLuat && chon.muc && chon.muc.tuong && chon.muc.doi !== n.doi) continue;
      batDauHanh(tran, n, loai, chon.muc, chon.x, chon.y, cs);
      return true;
    }
    return false;
  }

  /* ══════════════════ MỘT TICK ══════════════════ */
  G.tickTran = function (tran) {
    if (tran.xong) return;
    var rng = tran.rng;
    var t;

    /* tầng đội nghĩ mỗi giây, hai đội lệch nửa giây */
    if (tran.tick % MOI_GIAY === 0) tickDoi(tran, 'xanh');
    else if (tran.tick % MOI_GIAY === (MOI_GIAY >> 1)) tickDoi(tran, 'do');
    if (tran.veHinh) {
      tran.nguoi.forEach(function (n) { n.px = n.x; n.py = n.y; });
      tran.linh.forEach(function (l) { l.px = l.x; l.py = l.y; });
    }

    tran.tick++;
    tran.t += TICK;
    t = tran.t;
    knRieng(tran);

    /* hẹn giờ (sóng lính, chiêu trễ, chùm đạn) */
    if (tran.hen.length) {
      var conHen = [];
      for (var ih = 0; ih < tran.hen.length; ih++) {
        var h = tran.hen[ih];
        if (h.t <= t) h.fn(); else conHen.push(h);
      }
      tran.hen = conHen;
    }

    /* quái lớn hiện ra / quái rừng hồi sinh — mạnh dần theo bậc tăng trưởng */
    var buoc = bacTang(t);
    ['rong', 'chua'].forEach(function (k) {
      var q = tran.quaiLon[k];
      if (!q.song && t >= q.hienRa) {
        var c = chiSoQuai(q.cau, q.lan);
        q.song = true; q.hp = c.hp; q.hpMax = c.hp; q.atk = c.atk; q.giap = c.giap; q.khang = c.khang; q.mucAi = null;
        tran.suKien.push({ t: t, loai: 'quaiHien', quai: k });
      }
    });
    tran.quai.forEach(function (q) {
      if (!q.song && t >= q.hoi) {
        var c = chiSoQuai(q.cau, buoc);
        q.song = true; q.hp = c.hp; q.hpMax = c.hp; q.atk = c.atk; q.giap = c.giap; q.khang = c.khang; q.mucAi = null;
      }
    });

    /* ── từng người ── thứ tự ĐẢO mỗi tick (§7: luôn xanh trước thì xanh thắng 12/12) */
    var thuTu = tran.nguoi.slice();
    if (tran.tick % 2 === 0) thuTu.reverse();
    thuTu.forEach(function (n) { n.tTran = t; n._tran = tran; tickNguoi(tran, n); });

    /* ── đạn bay ── */
    tickDan(tran);
    /* ── vùng ── */
    tickVung(tran);
    /* ── lính ── */
    tickLinh(tran);
    /* ── trụ ── */
    tickTru(tran);
    /* ── quái ── */
    tickQuai(tran);

    /* ── vàng trôi đều (gold_per_second, cả lúc chết) ── */
    var vangTick = CAI.gold_per_second * TICK;
    for (var iv = 0; iv < tran.nguoi.length; iv++) { var nv = tran.nguoi[iv]; nv.vang += vangTick; tran.vang[nv.doi] += vangTick; }

    if (tran.tick % (MOI_GIAY * 30) === 0) tran.chart.push({ t: t, v: tran.vang.xanh - tran.vang.do });

    /* ── điều kiện kết thúc ── */
    for (var it = 0; it < tran.tru.length; it++) {
      var loi = tran.tru[it];
      if (loi.loi && !loi.song && !tran.xong) { tran.xong = true; tran.thang = doiKia(loi.doi); }
    }
    if (!tran.xong && t >= tran.daiToiDa) {
      tran.xong = true;
      tran.thang = tran.vang.xanh >= tran.vang.do ? 'xanh' : 'do';
      tran.hetGio = true;
    }
  };

  function tickNguoi(tran, n) {
    var t = tran.t, rng = tran.rng;
    if (n.chet > 0) {
      n.chet -= TICK;
      if (n.chet <= 0) {
        n.chet = 0;
        if (!n._hoiSinhTai) { n.x = n.nha[0]; n.y = n.nha[1]; n.hp = n.hpMax; }
        n._hoiSinhTai = false;
        n.px = n.x; n.py = n.y; n.veNha = false; n.hoiLuc = t; n.mucTieu = null;
        n._csTick = -1;
        muaDo(tran, n);
      }
      return;
    }
    /* trạng thái hết hạn */
    if (n.buff.length) n.buff = n.buff.filter(function (b) { return b.den > t; });
    if (n.chan.length) n.chan = n.chan.filter(function (c) { return c.den > t && c.luong > 0.5; });
    for (var hk in n.hieu) { n.hieu[hk] -= TICK; if (n.hieu[hk] <= 0) delete n.hieu[hk]; }
    n._csTick = -1;
    var cs = chiSoNguoi(tran, n);
    if (Math.abs(cs.hpMax - n.hpMax) > 0.5) {
      var them = cs.hpMax - n.hpMax;
      n.hpMax = cs.hpMax; n.hp = Math.min(n.hpMax, n.hp + Math.max(0, them));
    }
    if (!n._batDau) { n._batDau = true; if (G.khoiDongChieu) G.khoiDongChieu(tran, n); }
    /* sát thương đã phân tán trả dần */
    if (n.phanTan && n.phanTan.no > 0) {
      var tra = Math.min(n.phanTan.no, n.phanTan.moiGiay * TICK);
      n.phanTan.no -= tra;
      if (n.phanTan.no <= 0.01) { n.phanTan.no = 0; n.phanTan.moiGiay = 0; }
      satThuong(tran, { doi: doiKia(n.doi) }, n, tra, 'thuc', { ghiNhan: false, lienKet: true });
      if (n.chet > 0) return;
    }
    /* độc / cháy */
    if (n.dot.length) {
      for (var id = 0; id < n.dot.length; id++) {
        var d = n.dot[id];
        satThuong(tran, d.ke || { doi: doiKia(n.doi) }, n, d.moiGiay * TICK, d.loai, { ghiNhan: false, chieu: true });
        if (n.chet > 0) return;
      }
      n.dot = n.dot.filter(function (d2) { return d2.den > t; });
    }
    /* hồi máu: hp_regen của đồ + buff vị trí đường trên + sân nhà (nexus_heal) + đồ Nhẫn Luân Hồi… */
    var hoiMoiGiay = cs.hpRegen;
    if (n.vt === 'tren' && t - n.lanCuoi > 6) hoiMoiGiay += n.hpMax * CAI.top_hp_regen_percent / 100;
    for (var jd = 0; jd < cs.dac.length; jd++) {
      var md = cs.dac[jd].tfm;
      if (md.flat_regen != null) hoiMoiGiay += md.flat_regen + n.hpMax * (md.max_hp_regen_ratio || 0) / 100;
      if (md.flat_aoe_damage != null && tran.tick % MOI_GIAY === 0) {
        var dsQ = dichTrong(tran, n, n.x, n.y, kc(md.aoe_range || 30000), {});
        for (var q = 0; q < dsQ.length; q++) satThuong(tran, n, dsQ[q], md.flat_aoe_damage + n.hpMax * (md.max_hp_aoe_ratio || 0) / 100, 'pt', { ghiNhan: false });
      }
    }
    var oNha = xaXY(n.x, n.y, n.nha[0], n.nha[1]) < 60;
    if (oNha) hoiMoiGiay += n.hpMax * CAI.nexus_heal / 100 * TPS / CAI.nexus_heal_tick;
    if (hoiMoiGiay > 0 && n.hp < n.hpMax) n.hp = Math.min(n.hpMax, n.hp + hoiMoiGiay * TICK);
    /* giếng địch bắn: well_damage mỗi well_damage_tick */
    var nhaDich = NHA[doiKia(n.doi)];
    if (xaXY(n.x, n.y, nhaDich[0], nhaDich[1]) < 60 && tran.tick % Math.max(1, Math.round(CAI.well_damage_tick / TPS / TICK)) === 0) {
      satThuong(tran, { doi: doiKia(n.doi), laTru: true }, n, CAI.well_damage, 'thuc', {});
      if (n.chet > 0) return;
    }

    /* đang hành động: tới mốc thì ra đòn */
    tickHanh(tran, n, cs);
    if (n.chet > 0) return;

    /* bị đẩy / kéo */
    if (n.ep) {
      var e = n.ep, dxE = e.tx - n.x, dyE = e.ty - n.y, dE = Math.sqrt(dxE * dxE + dyE * dyE);
      var bE = e.toc * TICK;
      if (dE <= bE || t >= e.den) { buocToi(n, e.tx, e.ty, dE); n.ep = null; }
      else buocToi(n, e.tx, e.ty, bE);
      return;
    }
    /* choáng / hất tung */
    if (n.kc > 0) { n.kc -= TICK; if (n.kc <= 0) { n.kc = 0; n.kcLoai = ''; } return; }
    /* đang lao */
    if (n.lao) {
      var L = n.lao;
      var toi = buocToi(n, L.tx, L.ty, L.toc * TICK);
      if (L.moiBuoc) L.moiBuoc();
      if (toi || t - L.bat > 1.5 || xaXY(n.x, n.y, L.tx, L.ty) < 1.5) { n.lao = null; if (L.xong) L.xong(); }
      return;
    }

    /* hồi về nhà (return_tick): đứng niệm 2 giây khi không ai quấy, rồi về giếng */
    if (n.hoiVe) {
      if (t - n.lanCuoi < 0.5 && n.dinhLuc > n.hoiVe) { n.hoiVe = 0; }
      else if (t - n.hoiVe >= giay(CAI.return_tick)) {
        n.hoiVe = 0; n.x = n.nha[0]; n.y = n.nha[1]; n.px = n.x; n.py = n.y; n.hoiLuc = t; n.mucTieu = null;
        return;
      } else return;
    }

    /* quyết định lại mỗi ~1,5–2,5 giây; NÃO cao nghĩ lại dày hơn.
       Vừa ăn phát đạn trụ ĐẦU TIÊN thì nghĩ lại NGAY: trụ TFM2 bắn 0,67 giây một phát, mỗi
       phát ~45% máu tướng cấp 1 — chờ tới lượt nghĩ sau là phát thứ ba đã tới (§14.5). */
    n.dem -= TICK;
    var dangLapse = t < n.lapseDen;
    var dangRutCu = n.mucTieu && (n.mucTieu.loai === 'rut' || n.mucTieu.loai === 've');
    if (!dangLapse && !dangRutCu && n.mucTieu) {
      if (t - n.truBan < TICK * 1.5) n.dem = 0;
      /* vừa bị tướng địch đánh, hay máu tụt sâu lúc đang bị đánh → nghĩ lại ngay (kiểm 0,2 giây một lần) */
      if (tran.tick % 6 === 0 && t - n.lanCuoi < 2 && (n.hp / n.hpMax < 0.42 || t - n.dinhLuc < 0.3)) n.dem = 0;
    }
    /* đang gõ trụ mà lính đỡ đạn đã chết → nghĩ lại ngay (veto_crash / siege soak của TFM2) */
    if (tran.tick % 6 === 0 && n.mucTieu && n.mucTieu.loai === 'daytru' && n.mucTieu.tru && !coLinhTa(tran, n.mucTieu.tru.x, n.mucTieu.tru.y, n.doi, tamTru(n.mucTieu.tru))) n.dem = 0;
    if (n.dem <= 0 || !n.mucTieu) {
      /* lapse (AI_BRAIN §5): NÃO = concentration, xác suất đứng hình tăng theo giờ trận; LÌ = mental,
         tăng khi đội đang thua vàng. Đứng hình = giữ nguyên ý định cũ thêm 0,8–1,8 s, không phản ứng. */
      var chenhVang = tran.vang[n.doi] - tran.vang[doiKia(n.doi)];
      var pLapse = 0.005 + 0.04 * (1 - G.kep(n.cs.nao / 1200, 0, 1)) * Math.min(1, t / 1200) +
        0.06 * (1 - G.kep(n.cs.li / 1200, 0, 1)) * (chenhVang < -1500 ? 1 : 0);
      if (n.mucTieu && rng.duoc(pLapse)) {
        n.lapseDen = t + 0.8 + rng() * 1.0; n.dem = n.lapseDen - t;
        tran.thongKe.loi.lapse++;
      } else {
        n.mucTieu = chonHanhDong(tran, n);
        var lo = n.mucTieu.loai;
        /* nhịp TFM2 nhanh gấp đôi bản cũ (một pha đổi mạng 2–4 giây) nên nghĩ lại dày hơn;
           `giu()` vẫn giữ ý định cũ để không dao động (RESEARCH §8.2) */
        n.dem = (lo === 'rut' || lo === 've') ? 1.4 + rng() * 0.8 : 0.9 + rng() * 0.7;
        n.dem *= 1.15 - 0.35 * G.kep(n.cs.nao / 1200, 0, 1);
      }
    }
    var mt = n.mucTieu;
    var dangRut = mt.loai === 'rut' || mt.loai === 've';

    /* mục tiêu đánh trong tầm */
    var muc = null;
    var tamDanh = cs.tam + BK * 2;
    if (n.khieu > t) {
      var kh = tran.nguoi[n.khieuAi];
      muc = (kh && kh.chet <= 0) ? kh : null;
      if (muc && xa(n, muc) > tamDanh) { buocToi(n, muc.x, muc.y, cs.tocchay * TICK); return; }
    } else if (n.so > t) {
      var sk = tran.nguoi[n.soAi];
      if (sk) { var dxS = n.x - sk.x, dyS = n.y - sk.y, dS = Math.sqrt(dxS * dxS + dyS * dyS) || 1; buocToi(n, n.x + dxS / dS * 40, n.y + dyS / dS * 40, cs.tocchay * TICK); }
      return;
    } else {
      var dichGan = mucTieuTot(tran, n, tamDanh + 6, cs);
      /* kỷ luật đi đường (RESEARCH §8.2): tám phút đầu, đang ăn lính thì không quay sang đấm tướng.
         Áp cho cả CHIÊU: số TFM2 một chiêu cấp 1 ăn 15–30% máu, hai người ném chiêu qua lại
         mỗi lần hồi xong là chết cả đôi ở giây 20 (§14.5). */
      n.kyLuat = false;
      if (dichGan && !dangRut && t < 480 && (mt.loai === 'farm' || mt.loai === 'giulane')) {
        var mauMinh = n.hp / n.hpMax, mauNo = dichGan.hp / dichGan.hpMax;
        var biNoDanh = dichGan.danhTuongAi === n.i && t - dichGan.danhTuongLuc < 2.5 && mauMinh >= mauNo - 0.05;
        var ngonAn = mauNo < 0.4 && mauMinh > mauNo + 0.15;
        var hamChem = chatCo(n, 'lao') || chatCo(n, 'solo');
        if (!biNoDanh && !ngonAn && !hamChem) { dichGan = null; n.kyLuat = true; }
      }
      /* đứng trong tầm trụ địch thì KHÔNG khơi mào đánh tướng (trụ đổi mục tiêu sang mình ngay),
         trừ khi cuộc đua CÓ TRỤ vẫn thắng (lao trụ: nó chết trước khi trụ giết mình — AI_BRAIN §4.6) */
      if (dichGan && truPhu(tran, n.x, n.y, doiKia(n.doi))) {
        var noDangDanhMinh = dichGan.danhTuongAi === n.i && t - dichGan.danhTuongLuc < 2.5;
        if (!noDangDanhMinh && !(tran.tick % 6 === 0 ? (n._laoTru = duaChet(tran, n, dichGan, { lao: true }).thang) : n._laoTru)) { dichGan = null; n.kyLuat = true; }
      }
      if (dichGan) muc = dichGan; else n.nham = -1;
      if (!muc && (mt.loai === 'daytru' || mt.loai === 'chotru') && mt.tru && mt.tru.song && trongTamDanh(n, mt.tru, cs)) muc = mt.tru;
      if (!muc && mt.quai && mt.quai.song && trongTamDanh(n, mt.quai, cs)) muc = mt.quai;
      if (!muc && mt.mt && mt.mt.song && trongTamDanh(n, mt.mt, cs)) muc = mt.mt;
      /* §16: đang ĐI (vào hùa, bắt lẻ, tới điểm tập, về nhà) thì không dừng lại gõ trụ hay lính tiện tay —
         "đứng đánh" trụ địch giữa đường là đứng trong tầm trụ; rút mà còn vung đao vào lính là đi bằng tốc độ
         hoạt ảnh (TFM2 RunAway không đánh). Lính chỉ bị đánh khi ý định là ăn lính / giữ trụ / đẩy trụ. */
      var dungGo = DUNG_GO[mt.loai] === 1;
      if (!muc && dungGo) { var trGan = truGanNhat(tran, n, tamDanh + 6); if (trGan) muc = trGan; }
      if (!muc && (dungGo || mt.loai === 'anquai' || (dangRut && n.hanh && n.hanh.coDi))) { var l = linhGanNhat(tran, n, tamDanh); if (l) muc = l; }
      if (muc && dangRut && !muc.tuong && !n.tuong.tfm.attack.can_use_with_move) muc = null;
    }

    /* ra chiêu / đánh thường — chỉ khi rảnh tay (không đang khoá trong một hành động) */
    var ranh = !n.hanh || (n.hanh.huy && n.hanh.daRa);
    if (ranh && (muc || tran.tick % 3 === 0) && n.troi <= t && !(dangRut && !muc)) {
      var raChieu = (muc && (muc.tuong || muc.hienRa != null)) || (tran.tick % 3 === 0 && !dangRut);
      if (raChieu && thuChieu(tran, n, cs, muc, mt)) ranh = false;
    }
    if (ranh && muc && n.cd.danh <= 0 && n.giaiGioi <= t) {
      batDauHanh(tran, n, 'danh', muc, null, null, cs);
      ranh = false;
    }
    for (var kcd in n.cd) n.cd[kcd] -= TICK;

    /* di chuyển: không khoá trong hành động (hoặc hành động cho phép đi), không bị trói */
    var coDi = (!n.hanh || n.hanh.coDi || (n.hanh.huy && n.hanh.daRa)) && n.troi <= t;
    if (!coDi) return;
    if (muc && !dangRut) return;                      /* đứng đánh */
    if (mt.loai === 've' && !oNha && xaXY(n.x, n.y, mt.x, mt.y) > 80) {
      /* không ai quanh thì niệm hồi về, nhanh hơn đi bộ */
      if (!dichGanNhat(tran, n, TAM_NHIN, { tuong: true }) && t - n.lanCuoi > 3) { n.hoiVe = t; return; }
    }
    var dx = mt.x - n.x, dy = mt.y - n.y;
    var dd = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dd > 1) n.huong = Math.atan2(dy, dx);
    /* xạ thủ / pháp sư / hỗ trợ dừng ở mép tầm bắn khi vào hùa */
    var lui = (cs.tam > 45 && (mt.loai === 'tugiup' || mt.loai === 'gank')) ? cs.tam * 0.72 : 0;
    if (dd <= lui) return;
    buocToi(n, mt.x, mt.y, cs.tocchay * TICK);
  }

  /* ── đạn ── */
  function tickDan(tran) {
    if (!tran.dan.length) return;
    var t = tran.t, con = [];
    for (var i = 0; i < tran.dan.length; i++) {
      var p = tran.dan[i];
      var song = true;
      /* vùng chặn đạn (§16.6): đạn của phe kia bay vào là tan, xét TRƯỚC khi chạm */
      for (var ic = 0; ic < tran.chanDan.length; ic++) {
        var cz = tran.chanDan[ic];
        if (cz.doi === p.doi || cz.den <= t) continue;
        if (xaXY(cz.x, cz.y, p.x, p.y) <= cz.r) { song = false; break; }
      }
      if (!song) continue;
      if (p.muc) {
        var m = p.muc;
        if (m.hp <= 0 || (m.tuong && m.chet > 0) || (m.song === false && !m.tuong)) { song = false; }
        else {
          var dx = m.x - p.x, dy = m.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
          var b = p.toc * TICK;
          if (d <= b + 2) { p.x = m.x; p.y = m.y; p.khi(m); song = false; }
          else { p.x += dx / d * b; p.y += dy / d * b; }
        }
      } else {
        var dx2 = p.tx - p.x, dy2 = p.ty - p.y, d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        var b2 = p.toc * TICK;
        if (d2 <= b2) { p.x = p.tx; p.y = p.ty; song = false; }
        else { p.x += dx2 / d2 * b2; p.y += dy2 / d2 * b2; }
        if (p.r > 0) {
          var ds = dichTrong(tran, p.ke, p.x, p.y, p.r, p.loc || {});
          for (var j = 0; j < ds.length; j++) {
            var v = ds[j], k = v.i != null ? 'n' + v.i : (v.lane || 'q') + v.x;
            if (!p.trung) p.trung = {};
            if (p.trung[k]) continue;
            p.trung[k] = 1;
            p.khi(v);
            if (!p.xuyen) { song = false; break; }
          }
        }
        if (!song && p.ketThuc) p.ketThuc(p.x, p.y);
      }
      if (t - p.ban > 4) song = false;
      if (song) con.push(p);
    }
    tran.dan = con;
  }
  /* ── vùng tồn tại một lúc ── */
  function tickVung(tran) {
    if (tran.chanDan.length && tran.tick % 15 === 0) tran.chanDan = tran.chanDan.filter(function (z) { return z.den > tran.t; });
    if (!tran.vung.length) return;
    var t = tran.t, con = [];
    for (var i = 0; i < tran.vung.length; i++) {
      var V = tran.vung[i];
      if (t >= V.ke) {
        var ds = V.minh ? dongMinhTrong(tran, V.n, V.x, V.y, V.r, { keMinh: true }) : dichTrong(tran, V.n, V.x, V.y, V.r, V.loc || {});
        V.dsCuoi = ds;
        if (V.fn) V.fn(V, ds);
        if (V.hoi) V.hoi(V, dongMinhTrong(tran, V.n, V.x, V.y, V.r, { keMinh: true }));
        V.ke += V.moi;
      }
      if (t >= V.den) { if (V.ketThuc) V.ketThuc(V.dsCuoi || []); continue; }
      con.push(V);
    }
    tran.vung = con;
  }

  /* ── lính: nhắm lại 0,1 giây một lần; giữa chừng giữ mục tiêu ── */
  function tickLinh(tran) {
    var t = tran.t, timLai = tran.tick % 3 === 0;
    for (var i = 0; i < tran.linh.length; i++) {
      var l = tran.linh[i];
      if (l.hp <= 0) continue;
      if (l.trieu) {
        if (t > l.lau || l.chu.chet > 0) { l.hp = 0; continue; }
      }
      var muc = l.mucAi;
      if (muc && (muc.hp <= 0 || (muc.tuong && muc.chet > 0) || (muc.song === false && !muc.tuong) || xaXY(l.x, l.y, muc.x, muc.y) > l.tam + BK * 2 + 6)) muc = null;
      if (!muc && timLai) {
        var gd = l.tam + BK * 2 + 4;
        if (l.trieu) {
          /* lính triệu hồi đánh thứ chủ đang đánh, nếu không thì kẻ gần */
          var mc = l.chu.hanh && l.chu.hanh.muc;
          if (mc && mc.hp > 0 && mc.doi !== l.doi && xaXY(l.x, l.y, mc.x, mc.y) < gd + 30) muc = mc;
        }
        if (!muc) {
          for (var j = 0; j < tran.linh.length; j++) {
            var m = tran.linh[j];
            if (m.doi === l.doi || m.hp <= 0) continue;
            var d = xaXY(l.x, l.y, m.x, m.y);
            if (d < gd) { gd = d; muc = m; }
          }
          if (!muc) for (var k = 0; k < tran.nguoi.length; k++) {
            var nn = tran.nguoi[k];
            if (nn.doi === l.doi || nn.chet > 0 || nn.khongChon > t) continue;
            var d3 = xaXY(l.x, l.y, nn.x, nn.y);
            if (d3 < gd) { gd = d3; muc = nn; }
          }
          if (!muc && !l.trieu) for (var z = 0; z < tran.tru.length; z++) {
            var r = tran.tru[z];
            if (r.doi === l.doi || !r.song || !truMo(tran, r)) continue;
            var d4 = xaXY(l.x, l.y, r.x, r.y);
            if (d4 < gd + 6) { gd = d4; muc = r; }
          }
        }
        l.mucAi = muc;
      }
      if (muc) {
        l.danh -= TICK;
        if (l.danh <= 0) {
          l.danh = l.hoiDanh;
          l.danhLuc = t;
          l.goc = Math.atan2(muc.y - l.y, muc.x - l.x);
          l.huong = l.goc;
          if (tran.veHinh) {
            if (l.xa) hieuUng(tran, { loai: 'dan', x: l.x, y: l.y, x2: muc.x, y2: muc.y, lop: 'xa', doi: l.doi, nho: 1, vk: 'sung_ngan' });
            else hieuUng(tran, { loai: 'thoc', x: l.x, y: l.y, x2: muc.x, y2: muc.y, goc: l.goc, doi: l.doi, vk: 'thuong' });
          }
          satThuong(tran, l, muc, l.atk, 'vl', { ghiNhan: false, danh: true });
        }
      } else if (l.trieu) {
        var c = l.chu;
        if (xaXY(l.x, l.y, c.x, c.y) > 40) { l.huong = null; buocToi(l, c.x, c.y, l.tocchay * TICK); }
      } else {
        var huongDi = (l.doi === 'xanh' ? 1 : -1);
        l.huong = null;
        l.t += huongDi * l.tocchay * TICK / DAI_DUONG[l.lane];
        l.t = G.kep(l.t, 0, 1);
        var p = diemTren(l.lane, l.t);
        l.x = p[0]; l.y = p[1];
      }
    }
    if (tran.tick % 15 === 0) tran.linh = tran.linh.filter(function (l2) { return l2.hp > 0; });
  }

  /* ── trụ: lính trước, tướng đang đánh tướng nhà thì đổi mục tiêu ngay ── */
  function tickTru(tran) {
    var t = tran.t;
    for (var i = 0; i < tran.tru.length; i++) {
      var r = tran.tru[i];
      if (!r.song || !r.tam) continue;
      r.danh -= TICK;
      if (r.danh > 0) continue;
      var muc = r.mucAi, gd = tamTru(r);
      if (muc && (muc.hp <= 0 || (muc.tuong && muc.chet > 0) || xaXY(r.x, r.y, muc.x, muc.y) > gd)) muc = null;
      if (!muc) {
        for (var j = 0; j < tran.linh.length; j++) {
          var l = tran.linh[j];
          if (l.doi === r.doi || l.hp <= 0) continue;
          var d = xaXY(r.x, r.y, l.x, l.y); if (d < gd) { gd = d; muc = l; }
        }
        if (!muc) for (var k = 0; k < tran.nguoi.length; k++) {
          var m = tran.nguoi[k];
          if (m.doi === r.doi || m.chet > 0 || m.khongChon > t) continue;
          var d2 = xaXY(r.x, r.y, m.x, m.y); if (d2 < gd) { gd = d2; muc = m; }
        }
      }
      for (var z = 0; z < tran.nguoi.length; z++) {
        var mz = tran.nguoi[z];
        if (mz.doi === r.doi || mz.chet > 0) continue;
        if (t - mz.danhTuongLuc > 1.5) continue;
        var nanNhan = tran.nguoi[mz.danhTuongAi];
        if (!nanNhan || nanNhan.doi !== r.doi || nanNhan.chet > 0) continue;
        if (xaXY(r.x, r.y, mz.x, mz.y) > gd) continue;
        if (xaXY(r.x, r.y, nanNhan.x, nanNhan.y) > gd) continue;
        muc = mz;
      }
      r.mucAi = muc;
      if (!muc) continue;
      r.danh = r.hoi;
      r.danhLuc = t;
      var luong = r.atk;
      (function (rr, mm) {
        banDan(tran, rr, mm, mm.x, mm.y, rr.tocDan || 375, function (bi) {
          satThuong(tran, rr, bi, luong, 'vl', { danh: true });
        }, { hinh: 'tru' });
      })(r, muc);
      if (tran.veHinh) hieuUng(tran, { loai: 'tia', x: r.x, y: r.y, x2: muc.x, y2: muc.y, doi: r.doi });
    }
  }

  /* ── quái rừng và quái lớn đánh trả ── */
  function tickQuai(tran) {
    var t = tran.t;
    var ds = tran.quai, timLai = tran.tick % 3 === 0;
    for (var pass = 0; pass < 2; pass++) {
      var list = pass === 0 ? ds : [tran.quaiLon.rong, tran.quaiLon.chua];
      for (var i = 0; i < list.length; i++) {
        var q = list[i];
        if (!q.song || q.hp <= 0) continue;
        q.danh -= TICK;
        if (q.danh > 0) continue;
        var muc = q.mucAi, gd = q.tam + BK * 2;
        if (muc && (muc.chet > 0 || xaXY(q.x, q.y, muc.x, muc.y) > gd)) muc = null;
        if (!muc && timLai) {
          for (var k = 0; k < tran.nguoi.length; k++) {
            var m = tran.nguoi[k];
            if (m.chet > 0) continue;
            var d = xaXY(q.x, q.y, m.x, m.y); if (d < gd) { gd = d; muc = m; }
          }
          q.mucAi = muc;
        }
        if (!muc) { q.danh = 0.1; continue; }
        q.danh = q.hoiDanh;
        q.danhLuc = t;
        q.goc = Math.atan2(muc.y - q.y, muc.x - q.x);
        if (tran.veHinh) hieuUng(tran, { loai: 'vuot', x: muc.x, y: muc.y, goc: q.goc, to: pass === 1 ? 1 : 0, doi: 'quai' });
        satThuong(tran, q, muc, q.atk, 'vl', { danh: true });
      }
    }
  }

  /* ══════════════════ KỸ NĂNG RIÊNG CỦA HUẤN LUYỆN VIÊN (trình bày, RESEARCH §7.5) ══════════════════ */
  function phaCua(t) { return t < 600 ? 'dau' : t < 1320 ? 'giua' : 'cuoi'; }
  function knRieng(tran) {
    if (tran.tick % (MOI_GIAY * 2) !== 0) return;
    ['xanh', 'do'].forEach(function (doi) {
      var ben = doi === 'xanh' ? 'ta' : 'dich';
      var h = tran.cau[ben] && tran.cau[ben].heso;
      var r = h && h.rieng;
      if (!r) return;
      var bat = (r.pha === 'luon' || r.pha === phaCua(tran.t));
      if (bat && r.dk === 'thua') bat = (doi === 'xanh' ? tran.vang.xanh < tran.vang.do : tran.vang.do < tran.vang.xanh);
      if (!bat) { r._dang = false; return; }
      if (r._dang) return;
      r._dang = true;
      var song = tran.nguoi.filter(function (n) { return n.doi === doi && n.chet <= 0; });
      if (!song.length) return;
      var mx = 0, my = 0;
      song.forEach(function (n) { mx += n.x; my += n.y; });
      hieuUng(tran, { loai: 'hlv', kn: r.id, ten: r.ten, doi: doi, x: mx / song.length, y: my / song.length,
        ds: song.map(function (n) { return n.i; }) });
      tran.suKien.push({ t: tran.t, loai: 'knRieng', doi: doi, ten: r.ten, kn: r.id });
    });
  }

  /** chạy hết trận không vẽ — nút "xem kết quả luôn" và các trận của đội máy */
  G.chayHet = function (tran, tranToiDa) {
    var d = 0, toiDa = tranToiDa || Math.ceil(DAI_TOI_DA / TICK) + 10;
    while (!tran.xong && d++ < toiDa) G.tickTran(tran);
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
  G.SIM_MOI_GIAY = MOI_GIAY;
  G.SIM_DUONG = DUONG;
  G.SIM_NHA = NHA;
  G.diemTren = diemTren;

})(window);
