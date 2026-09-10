/* tieng.js — âm thanh tổng hợp bằng WebAudio, không dùng một tệp .mp3 nào.

   Vì sao tự tổng hợp: game này đã nặng phần ảnh; thêm chục tệp âm thanh nữa thì lần tải đầu
   trên 3G thành cực hình. Mấy tiếng ở đây đều là dao động cơ bản + bao hình, tổng cộng chưa
   tới 150 dòng.

   Bài học từ Chuyến Tàu Cuối trong repo này: ở đó `G.onSfx` được gọi 14 chỗ mà chẳng ai gắn
   gì vào, nên game im lặng suốt. Ở đây bảng tiếng và chỗ gọi được viết CÙNG LÚC.
*/
(function (G) {
  'use strict';

  var ctx = null, master = null, bat = true;

  function moCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    return ctx;
  }

  /* trình duyệt di động chỉ cho phát tiếng sau khi người dùng chạm màn hình */
  function danhThuc() {
    var c = moCtx();
    if (c && c.state === 'suspended') c.resume();
  }
  window.addEventListener('pointerdown', danhThuc, { passive: true });
  window.addEventListener('keydown', danhThuc);

  function song(kieu, f0, f1, dai, am, tre) {
    if (!bat) return;
    var c = moCtx(); if (!c) return;
    var t = c.currentTime + (tre || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = kieu;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dai);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(am, t + Math.min(0.02, dai * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dai);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dai + 0.02);
  }

  function on(dai, am, tre, loc) {
    if (!bat) return;
    var c = moCtx(); if (!c) return;
    var t = c.currentTime + (tre || 0);
    var n = Math.floor(c.sampleRate * dai);
    var b = c.createBuffer(1, n, c.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = c.createBufferSource(); s.buffer = b;
    var g = c.createGain(); g.gain.value = am;
    var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = loc || 1400;
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t);
  }

  var BANG = {
    cham:      function () { song('triangle', 520, 660, 0.05, 0.16); },
    chon:      function () { song('triangle', 700, 900, 0.07, 0.2); },
    huy:       function () { song('sine', 400, 240, 0.09, 0.16); },
    tap:       function () { song('square', 300, 520, 0.09, 0.13); on(0.09, 0.1, 0.02, 1800); },
    tapTot:    function () { song('triangle', 620, 980, 0.14, 0.2); song('triangle', 980, 1250, 0.12, 0.14, 0.1); },
    hong:      function () { song('sawtooth', 260, 90, 0.32, 0.22); on(0.22, 0.16, 0, 700); },
    cauvong:   function () {
      [660, 880, 1100, 1320].forEach(function (f, i) { song('triangle', f, f * 1.28, 0.22, 0.16, i * 0.075); });
      on(0.3, 0.06, 0, 3000);
    },
    camhung:   function () {
      [523, 659, 784, 1047, 1319].forEach(function (f, i) { song('sine', f, f, 0.4, 0.16, i * 0.1); });
    },
    mang:      function () { song('square', 180, 70, 0.16, 0.2); on(0.14, 0.2, 0, 900); },
    mangTa:    function () { song('square', 700, 1000, 0.1, 0.18); song('square', 1000, 1400, 0.09, 0.14, 0.08); },
    tru:       function () { song('sawtooth', 150, 55, 0.5, 0.24); on(0.4, 0.22, 0, 500); },
    quaiLon:   function () { song('sawtooth', 110, 60, 0.7, 0.26); song('sine', 330, 220, 0.5, 0.12, 0.05); },
    thang:     function () { [523, 659, 784, 1047].forEach(function (f, i) { song('triangle', f, f, 0.28, 0.2, i * 0.11); }); },
    thua:      function () { [440, 392, 330, 262].forEach(function (f, i) { song('sine', f, f, 0.32, 0.16, i * 0.13); }); },
    quay:      function () { song('sine', 300, 1200, 0.55, 0.12); on(0.5, 0.05, 0, 4000); },
    quaySSR:   function () {
      [784, 988, 1175, 1568].forEach(function (f, i) { song('triangle', f, f, 0.5, 0.2, i * 0.09); });
      on(0.6, 0.08, 0, 5000);
    },
    batdau:    function () { song('sawtooth', 220, 440, 0.25, 0.2); song('sine', 440, 660, 0.3, 0.12, 0.12); }
  };

  /** phát một tiếng theo tên; tên lạ thì im, không văng lỗi */
  G.tieng = function (ten) {
    var f = BANG[ten];
    if (f) { try { f(); } catch (e) { /* thiết bị không cho phát thì thôi */ } }
  };

  G.tatTieng = function (v) { bat = !v; };
  G.dangCoTieng = function () { return bat; };

})(window);
