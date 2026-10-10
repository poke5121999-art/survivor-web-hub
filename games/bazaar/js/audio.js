/* Chợ Phiên — BZAudio: phát tiếng gốc (games/bazaar/audio/*.ogg, bảng khoá ngữ nghĩa ở data/audio.js, AUDIO.md).
   WebAudio; mỗi khoá có nhiều biến thể → bốc ngẫu nhiên (FMOD multi-instrument cũng bốc ngẫu nhiên).
   Âm lượng tổng + tắt tiếng lưu ở localStorage (bọc try/catch). Mở khoá AudioContext ở cú chạm/phím đầu tiên.
   Trộn tiếng theo nhóm (entry.group của data/audio.js: trans/vo/board/combat/card/ui/env…), thay cho "bỏ tiếng" cũ (VFX-20):
    - cùng khoá trong GAP ms → GỘP (một tiếng cho nhiều sự kiện cùng khung, không tính là mất);
    - mỗi khoá tối đa `max` bản cùng lúc, mỗi nhóm tối đa GROUP[g].max tiếng: đầy thì CƯỚP tiếng cũ nhất có ưu tiên ≤ tiếng mới (tắt dần 15 ms);
    - tiếng dài (> 2 s, vd board.crit 3,4 s, combat.fly_start 4,5 s) mặc định 1 bản + giãn ≥ 0,9 s (VFX-21);
    - nhóm trans (băng-rôn thắng/thua) và board.crit hạ nhạc + tiếng trận một lúc (ducking).
   Nhạc (FLOW-15): gọi lại cùng khoá thì không phát lại từ 0:00; nhạc bàn của hero là playlist music.<hero>.1..3, nhớ chỗ đang nghe,
   hết bài sang bài kế. Nền môi trường (FLOW-14): ambience.<hero> lặp dưới nhạc bàn + thỉnh thoảng một tiếng env.<hero>.* (đồ vật trên bàn). */
(function (root) {
  'use strict';
  var A = root.BZAudio = {};
  var LS = 'bz.audio.v1';
  var MIN_GAP = 30, MAX_VOICES = 28, STALE_MS = 260;
  // nhóm: max tiếng cùng lúc, hệ số âm lượng (data ghi mọi SFX 0,9 → trộn lại theo nhóm [ĐỀ XUẤT]), ưu tiên khi cướp tiếng
  var GROUP = {
    trans: { max: 2, gain: 1.0, pri: 6 }, vo: { max: 1, gain: 1.0, pri: 5 }, ui: { max: 4, gain: 0.95, pri: 4 },
    board: { max: 5, gain: 0.85, pri: 3 }, combat: { max: 9, gain: 0.78, pri: 2 }, card: { max: 4, gain: 0.7, pri: 1 },
    skill: { max: 3, gain: 0.8, pri: 2 }, env: { max: 2, gain: 0.55, pri: 0 }, _: { max: 4, gain: 0.85, pri: 2 }
  };
  // luật riêng theo khoá: gap (ms) giữa hai lần phát, max bản cùng lúc
  var KEY = {
    'board.crit': { gap: 1200, max: 1, duck: 0.6 }, 'combat.critgain_shot': { gap: 220, max: 2 }, 'card.statBuff': { gap: 180, max: 2 },
    'combat.hitStun': { gap: 250, max: 1 }, 'board.tickBurn': { gap: 120, max: 2 }, 'board.tickPoison': { gap: 120, max: 2 }, 'board.tickRegen': { gap: 160, max: 2 },
    'board.sandstorm': { gap: 4000, max: 1 }, 'combat.fly_start': { gap: 1500, max: 1 }, 'combat.rage': { gap: 2000, max: 1 }
  };
  var VO_GAP = 6000; // một câu thoại của hero không lặp lại trong 6 s (FLOW-24: "nobuyspace" 5 lần trong 16 s)
  var ctx = null, master = null, sfxBus = null, musicGain = null, ambGain = null, buffers = {}, loading = {}, lastAt = {}, voices = [], unlocked = false,
    pendingMusic = null, pendingAmb = null, pendingPreload = [];
  var st = { vol: 0.7, muted: false };
  var music = null, amb = null, resume = {}, playlist = {}, envTimer = null;
  A.stats = { played: 0, merged: 0, stolen: 0, skipped: 0, missing: 0 };

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
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.42; musicGain.connect(master);
    ambGain = ctx.createGain(); ambGain.gain.value = 0.5; ambGain.connect(master);
    applyVol();
    return ctx;
  }
  function applyVol() { if (master) master.gain.setTargetAtTime(st.muted ? 0 : st.vol, ctx.currentTime, 0.02); }
  function wake() { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed' && !document.hidden) { try { ctx.resume(); } catch (e) { /* bỏ qua */ } } }
  A.unlock = function () {
    unlocked = true;
    var c = ensure();
    if (c) wake(); // 'suspended' hoặc 'interrupted' (iOS sau cuộc gọi / chuyển ứng dụng) — MOBILE-16
    if (pendingPreload.length) { var p = pendingPreload; pendingPreload = []; A.preload(p); }
    if (pendingMusic) { var m = pendingMusic; pendingMusic = null; A.music(m.key, m.fade); }
    if (pendingAmb) { var am = pendingAmb; pendingAmb = null; A.ambience(am); }
  };
  // iOS Safari chỉ tính touchend/click là cử chỉ mở khoá (MOBILE-16)
  ['pointerdown', 'keydown', 'touchstart', 'touchend', 'mousedown', 'click'].forEach(function (ev) {
    root.addEventListener(ev, function once() { A.unlock(); }, { capture: true, passive: true });
  });
  // thẻ ẩn: tạm dừng cả AudioContext (nhạc không kêu khi chuyển tab/khoá máy), hiện lại thì chạy tiếp
  if (root.document) document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    try { if (document.hidden) ctx.suspend(); else wake(); } catch (e) { /* bỏ qua */ }
  });
  root.addEventListener('pageshow', function () { wake(); });

  function resolve(key) {
    var M = root.BZ_AUDIO || {}, AL = root.BZ_AUDIO_ALIAS || {};
    var k = key, hops = 0;
    while (!M[k] && AL[k] && hops++ < 4) k = AL[k];
    return M[k] ? k : null;
  }
  function entry(key) { var k = resolve(key); return k ? root.BZ_AUDIO[k] : null; }
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

  function groupOf(k, e) { var g = (e && e.group) || String(k).split('.')[0]; return GROUP[g] ? g : '_'; }
  function durOf(e) { var d = e && e.dur; return Array.isArray(d) ? Math.max.apply(null, d) : (+d || 0); }
  function ruleOf(k, e) {
    var r = KEY[k] || {}, long = durOf(e) > 2;
    var gap = r.gap != null ? r.gap : (/^vo\./.test(k) ? VO_GAP : long ? 900 : MIN_GAP);
    var max = r.max != null ? r.max : (long ? 1 : 3);
    return { gap: gap, max: max, duck: r.duck };
  }
  function stopVoice(v) {
    if (v.dead) return; v.dead = true;
    var i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1);
    try { v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.015); v.n.stop(ctx.currentTime + 0.08); } catch (e) { /* đã dừng */ }
  }
  // cướp tiếng cũ nhất trong danh sách có ưu tiên ≤ pri; không có thì trả false (tiếng mới bị bỏ)
  function steal(list, pri) {
    var best = null;
    for (var i = 0; i < list.length; i++) { var v = list[i]; if (v.pri <= pri && (!best || v.pri < best.pri || (v.pri === best.pri && v.t0 < best.t0))) best = v; }
    if (!best) return false;
    stopVoice(best); A.stats.stolen++;
    return true;
  }
  // hạ nhạc + tiếng trận trong `sec` giây (băng-rôn, chí mạng)
  A.duck = function (amount, sec) {
    var c = ensure(); if (!c) return;
    var t = c.currentTime, a = Math.max(0.15, Math.min(1, amount));
    musicGain.gain.cancelScheduledValues(t); musicGain.gain.setTargetAtTime(0.42 * a, t, 0.05); musicGain.gain.setTargetAtTime(0.42, t + sec, 0.35);
    ambGain.gain.cancelScheduledValues(t); ambGain.gain.setTargetAtTime(0.5 * a, t, 0.05); ambGain.gain.setTargetAtTime(0.5, t + sec, 0.35);
  };

  // play(key, {vol, rate, gap, late}) — trả true nếu đã lên lịch phát (hoặc gộp vào tiếng cùng khoá vừa phát)
  A.play = function (key, o) {
    o = o || {};
    var k = resolve(key), e = k && root.BZ_AUDIO[k];
    if (!e) return false;
    var c = ensure();
    if (!c || st.muted || st.vol <= 0) return false;
    var now = performance.now(), R = ruleOf(k, e);
    if (lastAt[k] && now - lastAt[k] < (o.gap || R.gap)) { A.stats.merged++; return true; }
    lastAt[k] = now;
    var gname = groupOf(k, e), G = GROUP[gname];
    var src = e.src[Math.floor(Math.random() * e.src.length)];
    load(src).then(function (buf) {
      if (performance.now() - now > STALE_MS && !o.late) { A.stats.skipped++; return; } // tải xong quá trễ: bỏ, khỏi lệch hình
      if (c.state !== 'running') return;
      // giới hạn theo khoá → theo nhóm → toàn cục: cướp tiếng cũ thay vì bỏ tiếng mới
      var same = voices.filter(function (v) { return v.k === k; });
      if (same.length >= R.max && !steal(same, 99)) return;
      var inG = voices.filter(function (v) { return v.grp === gname; });
      if (inG.length >= G.max && !steal(inG, G.pri)) { A.stats.skipped++; return; }
      if (voices.length >= MAX_VOICES && !steal(voices, G.pri)) { A.stats.skipped++; return; }
      var n = c.createBufferSource(); n.buffer = buf;
      if (o.rate) n.playbackRate.value = o.rate;
      var g = c.createGain(); g.gain.value = (e.vol == null ? 0.8 : e.vol) * G.gain * (o.vol == null ? 1 : o.vol);
      n.connect(g); g.connect(sfxBus);
      var v = { k: k, grp: gname, pri: G.pri, n: n, g: g, t0: now };
      voices.push(v); A.stats.played++;
      n.onended = function () { v.dead = true; var i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); };
      n.start();
      if (gname === 'trans') A.duck(0.45, Math.min(3, Math.max(1.2, durOf(e))));
      else if (R.duck) A.duck(R.duck, 1.0);
    }).catch(function () {});
    return true;
  };
  A.voices = function () { return voices.map(function (v) { return v.k; }); };

  // ---------- nhạc ----------
  function heroOfTrack(k) { var m = /^music\.([a-z]+)\.(\d)$/.exec(k || ''); return m ? m[1] : null; }
  function tracksOf(hero) { var out = []; for (var i = 1; i <= 5; i++) if (resolve('music.' + hero + '.' + i) === 'music.' + hero + '.' + i) out.push('music.' + hero + '.' + i); return out; }
  function startTrack(k, fadeIn, token) {
    var e = root.BZ_AUDIO[k], c = ensure(), hero = heroOfTrack(k);
    load(e.src[0]).then(function (buf) {
      if (music !== token) return;
      var off = (resume[k] || 0) % (buf.duration || 1);
      var n = c.createBufferSource(); n.buffer = buf; n.loop = !hero || tracksOf(hero).length < 2; // playlist: hết bài sang bài kế
      var g = c.createGain(); g.gain.value = 0; g.connect(musicGain); n.connect(g);
      g.gain.setTargetAtTime((e.vol == null ? 0.8 : e.vol), c.currentTime, (fadeIn || 1.2) / 3);
      n.start(0, off);
      token.n = n; token.g = g; token.k = k; token.t0 = c.currentTime; token.off = off; token.dur = buf.duration;
      n.onended = function () {
        if (music !== token || token.stopping || n.loop) return;
        var list = tracksOf(hero), nx = list[(list.indexOf(k) + 1) % list.length];
        resume[k] = 0; resume[nx] = 0; playlist[hero] = nx;
        var t2 = { key: token.key }; music = t2; startTrack(nx, 1.5, t2);
      };
    }).catch(function () {});
  }
  A.music = function (key, fadeIn) {
    var k = resolve(key);
    if (!k) { A.stopMusic(0.4); return; }
    var hero = heroOfTrack(k);
    // đang phát đúng bài này: không phát lại từ 0:00; bài khác của hero (ui/top.js đổi bài theo ngày) thì phát tiếp từ chỗ đã nghe dở (resume)
    if (music && !music.stopping && (music.k || music.key) === k) return;
    A.stopMusic(0.4);
    // nền môi trường theo hero đi cùng nhạc bàn; menu chính / kết run thì tắt; nhạc trận giữ nguyên nền đang có
    if (hero) A.ambience('ambience.' + hero);
    else if (/^music\.(mainMenu|endrun)/.test(k)) A.ambience(null);
    var c = ensure();
    if (!c) { pendingMusic = { key: k, fade: fadeIn }; return; }
    if (hero) playlist[hero] = k;
    var token = { key: k };
    music = token;
    startTrack(k, fadeIn, token);
  };
  A.stopMusic = function (fade) {
    pendingMusic = null;
    var m = music; music = null;
    if (!m || !m.g || !ctx) return;
    m.stopping = true;
    if (m.k && m.dur && heroOfTrack(m.k)) resume[m.k] = (m.off + (ctx.currentTime - m.t0)) % m.dur; // nhớ chỗ đang nghe (FLOW-15)
    m.g.gain.setTargetAtTime(0, ctx.currentTime, (fade || 0.6) / 3);
    setTimeout(function () { try { m.n.stop(); } catch (e) { /* đã dừng */ } }, (fade || 0.6) * 1500);
  };
  A.musicKey = function () { return music ? (music.k || music.key) : null; };
  A.musicPos = function () { return music && music.n && ctx ? (music.off + ctx.currentTime - music.t0) % (music.dur || 1) : null; }; // giây đang nghe (kiểm FLOW-15)

  // ---------- nền môi trường ----------
  var envKeys = null;
  function envFor(hero) {
    if (!envKeys) { envKeys = {}; Object.keys(root.BZ_AUDIO || {}).forEach(function (k) { var m = /^env\.([a-z]+)\./.exec(k); if (m) (envKeys[m[1]] = envKeys[m[1]] || []).push(k); }); }
    return envKeys[hero] || [];
  }
  function scheduleEnv(hero) {
    clearTimeout(envTimer);
    var list = envFor(hero); if (!list.length) return;
    envTimer = setTimeout(function () {
      if (!amb || amb.key !== 'ambience.' + hero) return;
      if (!document.hidden) A.play(list[Math.floor(Math.random() * list.length)], { vol: 0.8 });
      scheduleEnv(hero);
    }, 14000 + Math.random() * 16000);
  }
  // ambience(key | null): lặp nền môi trường, chuyển mờ 1,5 s
  A.ambience = function (key) {
    var k = key ? resolve(key) : null;
    if (amb && amb.key === k) return;
    var c = ensure();
    if (!c) { pendingAmb = k; return; }
    var old = amb; amb = null; clearTimeout(envTimer);
    if (old && old.g) { old.g.gain.setTargetAtTime(0, c.currentTime, 0.5); setTimeout(function () { try { old.n.stop(); } catch (e) { /* đã dừng */ } }, 2200); }
    if (!k) return;
    var e = root.BZ_AUDIO[k], token = { key: k };
    amb = token;
    load(e.src[0]).then(function (buf) {
      if (amb !== token) return;
      var n = c.createBufferSource(); n.buffer = buf; n.loop = true;
      var g = c.createGain(); g.gain.value = 0; g.connect(ambGain); n.connect(g);
      g.gain.setTargetAtTime(e.vol == null ? 0.5 : e.vol, c.currentTime, 0.5);
      n.start(0, Math.random() * buf.duration);
      token.n = n; token.g = g;
      var hero = (/^ambience\.([a-z]+)$/.exec(k) || [])[1]; if (hero) scheduleEnv(hero);
    }).catch(function () {});
  };
  A.ambienceKey = function () { return amb ? amb.key : null; };

  A.getVolume = function () { return st.vol; };
  A.isMuted = function () { return st.muted; };
  A.setVolume = function (v) { st.vol = Math.max(0, Math.min(1, +v || 0)); if (st.vol > 0) st.muted = false; persist(); if (ctx) applyVol(); };
  A.setMuted = function (m) { st.muted = !!m; persist(); if (ctx) applyVol(); };
  A.toggleMute = function () { A.setMuted(!st.muted); return st.muted; };
})(window);
