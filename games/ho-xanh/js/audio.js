// Tiếng: Web Audio, mở khoá ở lần chạm đầu tiên.
(function (HX) {
  'use strict';
  var A = window.HX_ASSETS.audio;
  var ctx = null, master = null, musicBus = null, sfxBus = null, buffers = {}, muted = false;
  var music = null, loops = {};

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    return ctx;
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  function loadOne(key) {
    if (buffers[key]) return Promise.resolve(buffers[key]);
    if (!ensure()) return Promise.resolve(null);
    return fetch(A[key].src).then(function (r) {
      if (!r.ok) throw new Error('sound not found: ' + A[key].src);
      return r.arrayBuffer();
    }).then(function (ab) {
      return new Promise(function (res) { ctx.decodeAudioData(ab, function (b) { buffers[key] = b; res(b); }, function () { res(null); }); });
    });
  }

  function load(keys, onEach) {
    return Promise.all(keys.map(function (k) { return loadOne(k).then(function (b) { if (onEach) onEach(k); return b; }); }));
  }

  function play(key, opts) {
    if (!ctx || muted || !buffers[key]) return null;
    opts = opts || {};
    var src = ctx.createBufferSource();
    src.buffer = buffers[key];
    src.playbackRate.value = opts.rate || 1;
    var g = ctx.createGain(); g.gain.value = opts.vol == null ? 1 : opts.vol;
    src.connect(g); g.connect(opts.bus === 'music' ? musicBus : sfxBus);
    src.loop = !!opts.loop;
    src.start();
    return { src: src, gain: g };
  }

  // Vòng lặp có tên: gọi lại cùng tên thì không chồng tiếng.
  function loop(name, key, vol) {
    if (loops[name] || !ctx || muted) return;
    var h = play(key, { loop: true, vol: 0 });
    if (!h) return;
    h.gain.gain.setTargetAtTime(vol == null ? 1 : vol, ctx.currentTime, 0.15);
    loops[name] = h;
  }
  function stopLoop(name, fade) {
    var h = loops[name];
    if (!h) return;
    delete loops[name];
    h.gain.gain.setTargetAtTime(0, ctx.currentTime, fade || 0.1);
    h.src.stop(ctx.currentTime + (fade || 0.1) * 5);
  }

  function playMusic(key, vol) {
    if (music && music.key === key) return;
    stopMusic();
    if (!ctx || muted || !buffers[key]) return;
    var h = play(key, { loop: true, vol: 0, bus: 'music' });
    h.gain.gain.setTargetAtTime(vol == null ? 1 : vol, ctx.currentTime, 0.8);
    music = { key: key, h: h };
  }
  function stopMusic(fade) {
    if (!music) return;
    var h = music.h; music = null;
    h.gain.gain.setTargetAtTime(0, ctx.currentTime, fade || 0.4);
    h.src.stop(ctx.currentTime + (fade || 0.4) * 5);
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 1;
  }

  HX.audio = {
    unlock: unlock, load: load, play: play, loop: loop, stopLoop: stopLoop,
    music: playMusic, stopMusic: stopMusic, setMuted: setMuted,
    isMuted: function () { return muted; },
    decoded: function () { return Object.keys(buffers).length; },
    stopAll: function () { Object.keys(loops).forEach(function (n) { stopLoop(n); }); stopMusic(); },
  };
})(window.HX = window.HX || {});
