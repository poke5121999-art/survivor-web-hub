// Tiếng gốc (AudioClip bóc ra mp3). SFX gọi theo tên clip như trong bảng/Lua, BGM chuyển mượt.
(function (VD) {
  'use strict';
  const A = { ctx: null, master: null, sfxBus: null, bgmBus: null, buffers: new Map(), loops: new Map(),
    bgm: null, bgmName: null, vol: { master: 0.9, sfx: 0.9, bgm: 0.55 }, muted: false, lastPlay: new Map() };

  function url(kind, name) {
    const a = VD.ASSETS && VD.ASSETS[kind] && VD.ASSETS[kind][name];
    return a ? (a.path || a) : 'audio/' + kind + '/' + name + '.mp3';
  }

  A.unlock = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    A.ctx = new C();
    A.master = A.ctx.createGain(); A.master.connect(A.ctx.destination);
    A.sfxBus = A.ctx.createGain(); A.sfxBus.connect(A.master);
    A.bgmBus = A.ctx.createGain(); A.bgmBus.connect(A.master);
    A.applyVolume();
  };
  A.applyVolume = function () {
    if (!A.ctx) return;
    A.master.gain.value = A.muted ? 0 : A.vol.master;
    A.sfxBus.gain.value = A.vol.sfx; A.bgmBus.gain.value = A.vol.bgm;
  };

  function load(kind, name) {
    const key = kind + ':' + name;
    if (A.buffers.has(key)) return A.buffers.get(key);
    const p = fetch(url(kind, name))
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => new Promise((res, rej) => A.ctx.decodeAudioData(b, res, rej)))
      .catch(() => null);          // clip thiếu: im lặng, không làm vỡ trận
    A.buffers.set(key, p);
    return p;
  }
  A.preload = names => { if (A.ctx) for (const n of names) load('sfx', n); };

  // opts: { vol, rate, pitchJitter, pos: {x,z} (giảm theo khoảng cách tới người nghe), loop, key }
  A.sfx = function (name, opts) {
    if (!A.ctx || !name) return null;
    opts = opts || {};
    // Cùng một clip bật lại dưới 30 ms (nhiều hitbox trúng một lúc) thì bỏ, tránh cộng dồn vỡ tiếng.
    const now = A.ctx.currentTime, last = A.lastPlay.get(name) || -1;
    if (!opts.loop && now - last < 0.03) return null;
    A.lastPlay.set(name, now);
    let vol = opts.vol == null ? 1 : opts.vol;
    if (opts.pos && A.listener) {
      const d = Math.hypot(opts.pos.x - A.listener.x, opts.pos.z - A.listener.z);
      vol *= Math.max(0, 1 - Math.max(0, d - 4) / 14);  // không có trong bảng: tắt dần 4–18 m
      if (vol <= 0.01) return null;
    }
    const h = { src: null, gain: null, stopped: false };
    load('sfx', name).then(buf => {
      if (!buf || h.stopped) return;
      const src = A.ctx.createBufferSource(); src.buffer = buf;
      src.playbackRate.value = (opts.rate || 1) * (1 + (opts.pitchJitter || 0) * (Math.random() * 2 - 1));
      src.loop = !!opts.loop;
      const g = A.ctx.createGain(); g.gain.value = vol;
      src.connect(g); g.connect(A.sfxBus); src.start();
      h.src = src; h.gain = g;
      if (opts.loop && opts.key) A.loops.set(opts.key, h);
    });
    return h;
  };
  A.stop = function (h, fade) {
    if (!h) return;
    h.stopped = true;
    if (h.src) {
      const t = A.ctx.currentTime;
      h.gain.gain.setTargetAtTime(0, t, (fade || 0.05) / 3);
      h.src.stop(t + (fade || 0.05) + 0.05);
    }
  };
  A.stopByName = function (key) { const h = A.loops.get(key); if (h) { A.stop(h, 0.2); A.loops.delete(key); } };

  // "NoBGM" của Lua gốc là một clip im lặng: coi như tắt nhạc.
  A.playBgm = function (name, fade) {
    if (name === 'NoBGM') name = null;
    if (!A.ctx || name === A.bgmName) return;
    A.bgmName = name;
    const old = A.bgm; A.bgm = null;
    const t = A.ctx.currentTime, f = fade == null ? 1.2 : fade;
    if (old && old.src) { old.gain.gain.setTargetAtTime(0, t, f / 3); old.src.stop(t + f + 0.2); }
    if (!name) return;
    load('bgm', name).then(buf => {
      if (!buf || A.bgmName !== name) return;
      const src = A.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = A.ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(A.bgmBus); src.start();
      g.gain.setTargetAtTime(1, A.ctx.currentTime, f / 3);
      A.bgm = { src, gain: g };
    });
  };
  A.stopBgm = fade => A.playBgm(null, fade);

  A.setListener = pos => { A.listener = pos; };

  VD.audio = A;
})(window.VD = window.VD || {});
