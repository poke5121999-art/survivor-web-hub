/* Chợ Phiên — BZAudio: phát tiếng gốc (games/bazaar/audio/*.ogg, bảng khoá ngữ nghĩa ở data/audio.js, AUDIO.md).
   WebAudio; mỗi khoá có nhiều biến thể → bốc ngẫu nhiên (FMOD multi-instrument cũng bốc ngẫu nhiên).
   Âm lượng tổng + tắt tiếng lưu ở localStorage (bọc try/catch). Mở khoá AudioContext ở cú chạm/phím đầu tiên.
   Chặn dồn tiếng: một khoá không phát lại trong MIN_GAP ms, tối đa MAX_VOICES tiếng cùng lúc (tua 3× rất dày). */
(function (root) {
  'use strict';
  var A = root.BZAudio = {};
  var LS = 'bz.audio.v1';
  var MIN_GAP = 45, MAX_VOICES = 18, STALE_MS = 220;
  var ctx = null, master = null, musicGain = null, buffers = {}, loading = {}, lastAt = {}, voices = 0, unlocked = false, pendingMusic = null, pendingPreload = [];
  var st = { vol: 0.7, muted: false };
  var music = null;
  A.stats = { played: 0, skipped: 0, missing: 0 };

  try { var s = JSON.parse(root.localStorage.getItem(LS) || 'null'); if (s && typeof s.vol === 'number') { st.vol = Math.max(0, Math.min(1, s.vol)); st.muted = !!s.muted; } } catch (e) { /* bỏ qua: chế độ riêng tư */ }
  function persist() { try { root.localStorage.setItem(LS, JSON.stringify(st)); } catch (e) { /* bỏ qua */ } }

  // AudioContext chỉ tạo sau cú chạm/phím đầu tiên (chính sách autoplay của trình duyệt)
  function ensure() {
    if (ctx) return ctx;
    if (!unlocked) return null;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.42; musicGain.connect(master);
    applyVol();
    return ctx;
  }
  function applyVol() { if (master) master.gain.setTargetAtTime(st.muted ? 0 : st.vol, ctx.currentTime, 0.02); }
  A.unlock = function () {
    unlocked = true;
    var c = ensure();
    if (c && c.state === 'suspended') c.resume();
    if (pendingPreload.length) { var p = pendingPreload; pendingPreload = []; A.preload(p); }
    if (pendingMusic) { var m = pendingMusic; pendingMusic = null; A.music(m.key, m.fade); }
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    root.addEventListener(ev, function once() { A.unlock(); }, { capture: true, passive: true });
  });

  function entry(key) {
    var M = root.BZ_AUDIO || {}, AL = root.BZ_AUDIO_ALIAS || {};
    var k = key, hops = 0;
    while (!M[k] && AL[k] && hops++ < 4) k = AL[k];
    return M[k] || null;
  }
  A.has = function (key) { return !!entry(key); };
  function load(src) {
    if (buffers[src]) return Promise.resolve(buffers[src]);
    if (loading[src]) return loading[src];
    var c = ensure();
    if (!c) return Promise.reject(new Error('audio context unavailable'));
    loading[src] = fetch(src).then(function (r) {
      if (!r.ok) throw new Error('audio file not found: ' + src);
      return r.arrayBuffer();
    }).then(function (ab) {
      return new Promise(function (res, rej) { c.decodeAudioData(ab, res, rej); });
    }).then(function (b) { buffers[src] = b; return b; }, function (e) { A.stats.missing++; loading[src] = null; throw e; });
    return loading[src];
  }
  A.preload = function (keys) {
    if (!ensure()) { pendingPreload = pendingPreload.concat(keys); return; }
    keys.forEach(function (k) { var e = entry(k); if (e) e.src.forEach(function (s) { load(s).catch(function () {}); }); });
  };

  // play(key, {vol, rate}) — trả true nếu đã lên lịch phát
  A.play = function (key, o) {
    o = o || {};
    var e = entry(key);
    if (!e) return false;
    var c = ensure();
    if (!c || st.muted || st.vol <= 0) return false;
    var now = performance.now();
    if (lastAt[key] && now - lastAt[key] < (o.gap || MIN_GAP)) { A.stats.skipped++; return false; }
    if (voices >= MAX_VOICES) { A.stats.skipped++; return false; }
    lastAt[key] = now;
    var src = e.src[Math.floor(Math.random() * e.src.length)];
    var asked = now;
    load(src).then(function (buf) {
      if (performance.now() - asked > STALE_MS && !o.late) return; // tải xong quá trễ: bỏ, khỏi lệch hình
      if (c.state !== 'running') return;
      var n = c.createBufferSource(); n.buffer = buf;
      if (o.rate) n.playbackRate.value = o.rate;
      var g = c.createGain(); g.gain.value = (e.vol == null ? 0.8 : e.vol) * (o.vol == null ? 1 : o.vol);
      n.connect(g); g.connect(master);
      voices++; A.stats.played++;
      n.onended = function () { voices--; };
      n.start();
    }).catch(function () {});
    return true;
  };

  A.music = function (key, fadeIn) {
    var e = entry(key);
    A.stopMusic(0.4);
    if (!e) return;
    var c = ensure();
    if (!c) { pendingMusic = { key: key, fade: fadeIn }; return; }
    var src = e.src[0], token = {};
    music = token;
    load(src).then(function (buf) {
      if (music !== token) return;
      var n = c.createBufferSource(); n.buffer = buf; n.loop = true;
      var g = c.createGain(); g.gain.value = 0; g.connect(musicGain); n.connect(g);
      g.gain.setTargetAtTime((e.vol == null ? 0.8 : e.vol), c.currentTime, (fadeIn || 1.2) / 3);
      n.start();
      token.n = n; token.g = g;
    }).catch(function () {});
  };
  A.stopMusic = function (fade) {
    pendingMusic = null;
    var m = music; music = null;
    if (!m || !m.g || !ctx) return;
    m.g.gain.setTargetAtTime(0, ctx.currentTime, (fade || 0.6) / 3);
    setTimeout(function () { try { m.n.stop(); } catch (e) { /* đã dừng */ } }, (fade || 0.6) * 1500);
  };

  A.getVolume = function () { return st.vol; };
  A.isMuted = function () { return st.muted; };
  A.setVolume = function (v) { st.vol = Math.max(0, Math.min(1, +v || 0)); if (st.vol > 0) st.muted = false; persist(); if (ctx) applyVol(); };
  A.setMuted = function (m) { st.muted = !!m; persist(); if (ctx) applyVol(); };
  A.toggleMute = function () { A.setMuted(!st.muted); return st.muted; };
})(window);
