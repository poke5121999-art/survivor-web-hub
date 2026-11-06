/* Âm thanh — tổng hợp bằng WebAudio, không tải tệp nào.
 *
 * WHY: kho Soul Knight đã bóc chỉ còn hình (nhạc và sound_effect.ab bị lọc bỏ
 * lúc bóc), và một game "đã tay" mà câm thì mọi cú đánh đều nhẹ bẫng. Tổng hợp
 * tại chỗ cho ra tiếng kiểu 8-bit khớp với art pixel, nặng 0 KB, và không có
 * tệp nào có thể 404.
 * ROOT-CAUSE: trình duyệt trên điện thoại khoá AudioContext cho tới cú chạm đầu
 * tiên, nên `unlock()` phải được gọi từ một pointerdown thật — gọi lúc tải
 * trang thì context đứng im ở trạng thái 'suspended' và không phát ra gì.
 */
(function (global) {
  'use strict';

  var ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  var KEY = 'hic.audio.v1';
  var prefs = { sfx: true, music: true };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) prefs = saved; } catch (e) { /* riêng tư */ }

  function ensure() {
    if (ac) return ac;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.9;
    // Nén nhẹ để mười tiếng nổ cùng lúc không vỡ loa điện thoại.
    var comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.12;
    master.connect(comp); comp.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = prefs.sfx ? 0.55 : 0; sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = prefs.music ? 0.16 : 0; musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1, ac.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  }

  function unlock() {
    if (!ensure()) return;
    if (ac.state === 'suspended') ac.resume();
    startMusic();
  }

  /* ---------------------------------------------------------- nguyên liệu */

  function env(g, t, a, peak, dur) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  }

  function tone(type, f0, f1, dur, vol, when, bus) {
    if (!ac) return;
    var t = ac.currentTime + (when || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.004, vol, dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, vol, filt, f0, f1, when, q) {
    if (!ac) return;
    var t = ac.currentTime + (when || 0);
    var s = ac.createBufferSource(); s.buffer = noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    var f = ac.createBiquadFilter(); f.type = filt || 'lowpass';
    f.frequency.setValueAtTime(f0 || 2000, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q || 0.8;
    var g = ac.createGain();
    env(g, t, 0.002, vol, dur);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  function jit(x, amt) { return x * (1 + (Math.random() - 0.5) * (amt || 0.08)); }

  /* Chặn một tiếng bị gọi dồn trong cùng một khung hình (x4 tốc độ trận đánh
     có thể bắn 5 cú đánh trong 16ms, nghe thành một tiếng rè). */
  var lastAt = {};
  function throttle(name, ms) {
    var now = ac ? ac.currentTime * 1000 : 0;
    if (lastAt[name] && now - lastAt[name] < ms) return false;
    lastAt[name] = now;
    return true;
  }

  /* ---------------------------------------------------------------- tiếng */

  var S = {
    step: function () {
      if (!throttle('step', 60)) return;
      noise(0.05, 0.10, 'bandpass', jit(900, 0.3), 400, 0, 1.2);
    },
    bump: function () { if (throttle('bump', 120)) tone('sine', 140, 70, 0.09, 0.25); },
    tap: function () { if (throttle('tap', 40)) tone('square', jit(880, 0.04), 1320, 0.035, 0.07); },
    open: function () {
      noise(0.16, 0.10, 'bandpass', 500, 2400, 0, 2);
      tone('triangle', 420, 640, 0.10, 0.08, 0.02);
    },
    close: function () { noise(0.10, 0.07, 'bandpass', 1800, 500, 0, 2); },
    pick: function () {
      tone('square', 660, 660, 0.06, 0.11);
      tone('square', 990, 990, 0.09, 0.11, 0.06);
      tone('triangle', 1320, 1320, 0.14, 0.09, 0.12);
    },
    coin: function () {
      if (!throttle('coin', 50)) return;
      tone('square', 988, 988, 0.05, 0.10);
      tone('square', 1319, 1319, 0.16, 0.10, 0.05);
    },
    chest: function () {
      noise(0.22, 0.14, 'bandpass', 300, 900, 0, 4);
      [784, 988, 1175, 1568].forEach(function (f, i) { tone('triangle', f, f, 0.12, 0.08, 0.14 + i * 0.05); });
    },
    swing: function () {
      if (!throttle('swing', 50)) return;
      noise(0.12, 0.16, 'bandpass', jit(1200), 3800, 0, 1.4);
    },
    hit: function (power) {
      if (!throttle('hit', 45)) return;
      var p = Math.min(1, power || 0.4);
      noise(0.10 + p * 0.08, 0.30 + p * 0.3, 'lowpass', 3200, 300);
      tone('sine', jit(180), 50, 0.14 + p * 0.1, 0.45 + p * 0.3);
      tone('square', jit(90), 40, 0.06, 0.10);
    },
    crit: function () {
      noise(0.28, 0.6, 'lowpass', 5000, 200);
      tone('sine', 220, 38, 0.32, 0.8);
      tone('sawtooth', 660, 110, 0.18, 0.12, 0.01);
    },
    armor: function () {
      if (!throttle('armor', 50)) return;
      tone('triangle', jit(1800, 0.06), 1500, 0.12, 0.14);
      tone('square', jit(2700, 0.06), 2400, 0.05, 0.05);
      noise(0.06, 0.12, 'highpass', 4000, 3000);
    },
    armorUp: function () {
      tone('triangle', 520, 1040, 0.16, 0.12);
      tone('sine', 1560, 1560, 0.18, 0.06, 0.08);
    },
    heal: function () {
      if (!throttle('heal', 80)) return;
      [523, 659, 784, 1047].forEach(function (f, i) { tone('sine', f, f * 1.01, 0.12, 0.10, i * 0.045); });
    },
    buff: function () {
      if (!throttle('buff', 80)) return;
      tone('square', 440, 880, 0.12, 0.07);
      tone('triangle', 880, 1320, 0.10, 0.06, 0.05);
    },
    debuff: function () {
      if (!throttle('debuff', 80)) return;
      tone('square', 620, 260, 0.16, 0.07);
    },
    thorns: function () { if (throttle('thorns', 80)) { noise(0.08, 0.14, 'highpass', 2500, 5000); tone('sawtooth', 900, 700, 0.06, 0.05); } },
    stun: function () {
      for (var i = 0; i < 4; i++) tone('sine', i % 2 ? 1400 : 1100, i % 2 ? 1100 : 1400, 0.07, 0.08, i * 0.07);
    },
    death: function () {
      noise(0.45, 0.35, 'lowpass', 1600, 120);
      tone('sawtooth', 300, 40, 0.5, 0.22);
    },
    alert: function () {
      tone('square', 1200, 1200, 0.05, 0.10);
      tone('square', 1600, 1600, 0.08, 0.10, 0.07);
    },
    win: function () {
      [523, 659, 784, 1047, 1319].forEach(function (f, i) {
        tone('square', f, f, 0.12, 0.08, i * 0.09);
        tone('triangle', f / 2, f / 2, 0.14, 0.08, i * 0.09);
      });
    },
    lose: function () {
      [392, 370, 311, 262].forEach(function (f, i) { tone('triangle', f, f * 0.98, 0.28, 0.14, i * 0.22); });
      tone('sine', 70, 40, 1.2, 0.3, 0.5);
    },
    fightStart: function () {
      noise(0.3, 0.25, 'bandpass', 200, 1800, 0, 1);
      tone('square', 196, 196, 0.10, 0.10, 0.05);
      tone('square', 294, 294, 0.16, 0.10, 0.16);
    },
    boss: function () {
      for (var i = 0; i < 3; i++) {
        tone('sine', 70, 38, 0.5, 0.9, i * 0.55);
        noise(0.35, 0.3, 'lowpass', 400, 60, i * 0.55);
      }
      tone('sawtooth', 110, 104, 1.8, 0.10, 0.2);
    },
    dusk: function () {
      tone('sine', 196, 185, 1.6, 0.12);
      tone('sine', 233, 220, 1.6, 0.08, 0.3);
    },
    dawn: function () {
      [2200, 2600, 2400, 3000].forEach(function (f, i) { tone('sine', f, f * 1.2, 0.06, 0.05, 0.1 + i * 0.09); });
    },
    levelUp: function () {
      [392, 523, 659, 784, 1047].forEach(function (f, i) { tone('square', f, f, 0.1, 0.07, i * 0.06); });
      tone('triangle', 1568, 1568, 0.5, 0.08, 0.3);
    },
    forge: function () {
      for (var i = 0; i < 3; i++) {
        tone('triangle', 2000, 1700, 0.12, 0.16, i * 0.16);
        noise(0.08, 0.2, 'highpass', 3000, 2000, i * 0.16);
      }
    },
    /* Vung theo LOẠI vũ khí: lưỡi sắc rít cao và ngắn, đồ cùn trầm và dày, cung
       bật dây. Cùng một tiếng cho mọi món là thứ làm đổi vũ khí không có cảm giác gì. */
    swingBlade: function () {
      if (!throttle('swing', 50)) return;
      noise(0.09, 0.2, 'bandpass', jit(2600), 7000, 0, 2.5);
      tone('sine', jit(1400), 700, 0.06, 0.04);
    },
    swingBlunt: function () {
      if (!throttle('swing', 50)) return;
      noise(0.18, 0.22, 'bandpass', jit(500), 1400, 0, 1.2);
    },
    swingBow: function () {
      if (!throttle('swing', 50)) return;
      tone('triangle', jit(220), 180, 0.12, 0.2);
      tone('square', jit(440), 330, 0.05, 0.05);
      noise(0.14, 0.12, 'highpass', 3000, 6000, 0.04);
    },
    swingClaw: function () {
      if (!throttle('swing', 50)) return;
      noise(0.12, 0.18, 'bandpass', jit(1500), 3000, 0, 1.8);
      tone('sawtooth', jit(160), 90, 0.12, 0.05, 0.02);
    },
    hitBlade: function (p) {
      if (!throttle('hit', 45)) return;
      p = Math.min(1, p || 0.4);
      noise(0.07, 0.35 + p * 0.25, 'highpass', 2500, 1200);
      tone('sine', jit(240), 70, 0.12 + p * 0.08, 0.35 + p * 0.3);
      tone('square', jit(1800), 900, 0.03, 0.05);
    },
    hitBlunt: function (p) {
      if (!throttle('hit', 45)) return;
      p = Math.min(1, p || 0.4);
      noise(0.16, 0.4 + p * 0.3, 'lowpass', 1400, 120);
      tone('sine', jit(120), 38, 0.22 + p * 0.1, 0.7 + p * 0.2);
    },
    hitFlesh: function (p) {
      if (!throttle('hit', 45)) return;
      p = Math.min(1, p || 0.4);
      noise(0.1, 0.3 + p * 0.2, 'bandpass', jit(900), 400, 0, 1.5);
      tone('sine', jit(200), 60, 0.15, 0.45 + p * 0.25);
    },
    armorBreak: function () {
      noise(0.35, 0.45, 'highpass', 6000, 2000);
      for (var i = 0; i < 7; i++) tone('triangle', jit(2400, 0.5), jit(1600, 0.5), 0.08 + Math.random() * 0.1, 0.07, i * 0.025);
      tone('sine', 180, 60, 0.25, 0.4);
    },
    proc: function (i) {
      if (!throttle('proc', 70)) return;
      var f = [1047, 1175, 1319, 1568][(i || 0) % 4];
      tone('sine', f, f, 0.18, 0.08);
      tone('triangle', f * 1.5, f * 1.5, 0.12, 0.04, 0.03);
    },
    tweet: function () {
      if (!throttle('tweet', 400)) return;
      for (var i = 0; i < 3; i++) tone('sine', 2600 + i * 200, 3400, 0.05, 0.05, i * 0.08);
    },
    dash: function () { if (throttle('dash', 60)) noise(0.12, 0.12, 'bandpass', 700, 2600, 0, 1); },
    thud: function () { tone('sine', 90, 40, 0.18, 0.5); noise(0.1, 0.2, 'lowpass', 600, 100); },
    heartbeat: function () {
      tone('sine', 60, 45, 0.12, 0.9);
      tone('sine', 55, 40, 0.12, 0.7, 0.18);
    },
    roar: function () {
      noise(0.9, 0.35, 'bandpass', 300, 140, 0, 2);
      tone('sawtooth', 110, 70, 0.9, 0.18);
      tone('sawtooth', 116, 72, 0.9, 0.12, 0.02);
    },
    coinBounce: function () { if (throttle('coinb', 35)) tone('square', jit(1760, 0.15), jit(2100, 0.1), 0.03, 0.05); },
    bubble: function () {
      for (var i = 0; i < 5; i++) tone('sine', jit(300, 0.4), jit(700, 0.3), 0.07, 0.08, i * 0.07);
    }
  };

  /* ------------------------------------------------------------------ nhạc */

  /* Nhạc nền: một cây đàn gảy năm cung, thưa và buồn — đúng chất "hắn đang
     tới". Không phải một tệp lặp, nên không bao giờ nghe thấy chỗ nối.
     Đêm xuống thì chuyển sang âm giai thứ và chậm lại. */
  var musicTimer = null, night = false, beat = 0, mode = 'map';
  var DAY = [262, 294, 330, 392, 440, 523, 587, 659];
  var NIGHT = [220, 247, 262, 330, 349, 440, 494, 523];
  function pluck(f, when, vol) {
    tone('triangle', f, f * 0.995, 0.9, vol, when, musicBus);
    tone('sine', f * 2, f * 2, 0.4, vol * 0.3, when, musicBus);
  }
  function kick(when, vol) {
    tone('sine', 110, 40, 0.16, vol, when, musicBus);
  }
  function hat(when, vol) {
    if (!ac) return;
    var t = ac.currentTime + when;
    var s = ac.createBufferSource(); s.buffer = noiseBuf;
    var f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    var g = ac.createGain(); env(g, t, 0.001, vol, 0.04);
    s.connect(f); f.connect(g); g.connect(musicBus);
    s.start(t, Math.random() * 0.5); s.stop(t + 0.08);
  }
  /* Ba chế độ nhạc: bản đồ (gảy thưa), trận (bass chạy + trống, nhanh gấp đôi)
     và trùm (trống trận nặng, âm giai thứ, bass rền). Đổi chế độ không cắt tiếng
     đang ngân — nó chỉ đổi thứ được gảy ở nhịp kế tiếp, nên chuyển cảnh mượt. */
  var FIGHT_BASS = [110, 110, 131, 110, 147, 131, 110, 98];
  var BOSS_BASS = [73, 73, 78, 73, 65, 73, 82, 78];
  function startMusic() {
    if (musicTimer || !ac) return;
    musicTimer = setInterval(function () {
      if (!ac || ac.state !== 'running' || !prefs.music) return;
      beat++;
      if (mode === 'fight' || mode === 'boss') {
        var boss = mode === 'boss';
        var bass = boss ? BOSS_BASS : FIGHT_BASS;
        var b = bass[beat % bass.length];
        tone(boss ? 'sawtooth' : 'square', b, b, 0.2, boss ? 0.14 : 0.1, 0, musicBus);
        if (beat % 2 === 0) kick(0, boss ? 0.8 : 0.5);
        if (boss && beat % 8 === 6) { kick(0.11, 0.6); }
        hat(0.115, boss ? 0.05 : 0.07);
        if (beat % 4 === 3 && Math.random() < 0.6) {
          var sc = boss ? NIGHT : DAY;
          pluck(sc[4 + Math.floor(Math.random() * 4)], 0, 0.12);
        }
        return;
      }
      if (beat % 2) return;   // bản đồ: nửa nhịp
      var scale = night ? NIGHT : DAY;
      if (beat % 16 === 0) { pluck(scale[0] / 2, 0, 0.35); pluck(scale[night ? 3 : 4] / 2, 0.02, 0.2); }
      if (Math.random() < (night ? 0.35 : 0.5)) pluck(scale[Math.floor(Math.random() * scale.length)], Math.random() * 0.1, 0.18);
    }, 230);
  }

  function savePrefs() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* riêng tư */ } }

  global.HIC_SFX = {
    unlock: unlock,
    play: function (name, arg) {
      if (!ac || !prefs.sfx || ac.state !== 'running') return;
      var f = S[name];
      if (f) { try { f(arg); } catch (e) { /* một tiếng hỏng không được làm hỏng game */ } }
    },
    setNight: function (v) { night = !!v; },
    setMode: function (m) { mode = m || 'map'; beat = 0; },
    prefs: function () { return { sfx: prefs.sfx, music: prefs.music }; },
    toggle: function (which) {
      prefs[which] = !prefs[which];
      if (ac) {
        if (which === 'sfx') sfxBus.gain.value = prefs.sfx ? 0.55 : 0;
        if (which === 'music') musicBus.gain.value = prefs.music ? 0.16 : 0;
      }
      savePrefs();
      return prefs[which];
    },
    names: Object.keys(S)
  };
})(window);
