/* tieng.js — tiếng và nhạc nền, phát từ tệp thật.

   Bảng `window.AM_BANG` (am/bang.js, sinh bởi _tools/build_tieng.py):
     tiếng: tên → [[tệp, trễ giây, âm lượng], ...]   một tên có thể là một chuỗi nhiều tiếng
     nhac:  tên → tệp                                  nhạc nền, lặp
   Ngoài trận lấy của Uma Musume, trong trận và cấm chọn lấy của Teamfight Manager 2.

   Hai kênh: TIẾNG và NHẠC, mỗi kênh một núm âm lượng trong Cài đặt (G.S.cai.amTieng /
   amNhac, 0..1). Tên lạ thì im, không văng lỗi.

   Bài học từ Chuyến Tàu Cuối trong repo này: ở đó `G.onSfx` được gọi 14 chỗ mà chẳng ai gắn
   gì vào, nên game im lặng suốt. Ở đây bảng tiếng và chỗ gọi được viết CÙNG LÚC.
*/
(function (G) {
  'use strict';

  var BANG = (window.AM_BANG && window.AM_BANG.tieng) || {};
  var NHAC = (window.AM_BANG && window.AM_BANG.nhac) || {};

  var ctx = null, kTieng = null, kNhac = null, bat = true;
  var amTieng = 0.8, amNhac = 0.45;
  var dem = {};            /* tệp → AudioBuffer, hoặc 'dang' khi đang nạp */
  var lanCuoi = {};        /* tên → giờ phát gần nhất, chặn một tiếng dồn chục lần một lúc */
  var dangKeu = 0;
  var TRAN_KEU = 24;

  function moCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    kTieng = ctx.createGain(); kTieng.gain.value = bat ? amTieng : 0; kTieng.connect(ctx.destination);
    kNhac = ctx.createGain(); kNhac.gain.value = bat ? amNhac : 0; kNhac.connect(ctx.destination);
    return ctx;
  }

  function nap(tep, xong) {
    var b = dem[tep];
    if (b && b !== 'dang') { if (xong) xong(b); return; }
    if (b === 'dang' || !moCtx()) return;
    dem[tep] = 'dang';
    fetch(tep).then(function (r) {
      if (!r.ok) throw new Error('tải tiếng hỏng ' + r.status + ' ' + tep);
      return r.arrayBuffer();
    }).then(function (buf) {
      ctx.decodeAudioData(buf, function (ab) { dem[tep] = ab; if (xong) xong(ab); },
        function () { delete dem[tep]; });
    }).catch(function () { delete dem[tep]; });
  }

  function phat(ab, tre, am) {
    if (dangKeu >= TRAN_KEU) return;
    var s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = ab;
    g.gain.value = am;
    s.connect(g); g.connect(kTieng);
    dangKeu++;
    s.onended = function () { dangKeu--; };
    s.start(ctx.currentTime + (tre || 0));
  }

  /* trình duyệt di động chỉ cho phát tiếng sau khi người dùng chạm màn hình */
  function danhThuc() {
    var c = moCtx();
    if (c && c.state === 'suspended') c.resume();
    if (nhacCho) { var n = nhacCho; nhacCho = null; G.nhac(n); }
  }
  window.addEventListener('pointerdown', danhThuc, { passive: true });
  window.addEventListener('keydown', danhThuc);

  /** Phát một tiếng theo tên. `am` (0..1) nhân thêm vào âm lượng — trận dùng để tiếng xa
      camera nhỏ đi. `cach` là số giây tối thiểu giữa hai lần phát cùng tên (mặc định 0,05). */
  G.tieng = function (ten, am, cach) {
    var ds = BANG[ten];
    if (!bat || !ds || !moCtx() || (am != null && am <= 0.02)) return;
    var bay = ctx.currentTime;
    if (bay - (lanCuoi[ten] || -9) < (cach == null ? 0.05 : cach)) return;
    lanCuoi[ten] = bay;
    ds.forEach(function (x) {
      nap(x[0], function (ab) {
        /* nạp lần đầu xong trễ quá thì bỏ: tiếng tới muộn nửa giây còn tệ hơn im */
        if (ctx.currentTime - bay < 0.25) phat(ab, x[1], x[2] * (am == null ? 1 : am));
      });
    });
  };

  /** nạp sẵn mọi tiếng có tên bắt đầu bằng một trong các tiền tố */
  G.napTieng = function (tienTo) {
    if (!moCtx()) return;
    Object.keys(BANG).forEach(function (ten) {
      if (tienTo.some(function (t) { return ten.indexOf(t) === 0; })) {
        BANG[ten].forEach(function (x) { nap(x[0]); });
      }
    });
  };

  /* ══════════ NHẠC NỀN ══════════
     Một thẻ <audio> cho mỗi bài, nối vào WebAudio để chỉnh được âm lượng cả trên iOS
     (ở đó audio.volume chỉ đọc). Đổi bài thì bài cũ nhỏ dần trong 0,8 giây. */
  var baiDang = null, nhacCho = null;

  function tatDan(b) {
    var g = b.g.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.8);
    setTimeout(function () { b.el.pause(); }, 900);
  }

  G.nhac = function (ten) {
    var tep = ten && NHAC[ten];
    if (baiDang && baiDang.ten === ten) return;
    if (!moCtx() || ctx.state === 'suspended') { nhacCho = ten; return; }
    if (baiDang) { tatDan(baiDang); baiDang = null; }
    if (!tep) return;
    var el = new Audio(tep);
    el.loop = true;
    el.preload = 'auto';
    var g = ctx.createGain();
    g.gain.value = 0;
    ctx.createMediaElementSource(el).connect(g);
    g.connect(kNhac);
    baiDang = { ten: ten, el: el, g: g };
    el.play().then(function () {
      g.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.8);
    }).catch(function () { nhacCho = ten; baiDang = null; });
  };

  function apAm() {
    if (!ctx) return;
    kTieng.gain.value = bat ? amTieng : 0;
    kNhac.gain.value = bat ? amNhac : 0;
  }

  G.tatTieng = function (v) { bat = !v; apAm(); };
  G.dangCoTieng = function () { return bat; };
  G.amLuong = function (kenh, v) {
    if (v == null) return kenh === 'nhac' ? amNhac : amTieng;
    if (kenh === 'nhac') amNhac = v; else amTieng = v;
    apAm();
  };

})(window);
