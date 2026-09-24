/*
 * Bộ trộn WebAudio: master → music / amb / sfx.
 * Vòng lặp nào cũng phát bằng "bản sau chồng lên đuôi bản trước" (XFADE giây), nên chỗ
 * nối không phụ thuộc đoạn đệm im lặng mà bộ mã hoá mp3 chèn vào đầu và cuối tệp.
 * Mở bằng file:// thì fetch hỏng: game vẫn chạy, chỉ im tiếng.
 */
(function (XD) {
  'use strict';
  var XFADE = 3.5;
  var A = XD.audio = {
    ctx: null, ok: false, muted: false, buffers: {}, failed: 0, loaded: 0,
    buses: {}, loops: {}, musicKey: null,
  };

  function tryParse() {
    try { return localStorage.getItem('xd.muted') === '1'; } catch (e) { return false; }
  }
  A.muted = tryParse();

  A.unlock = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctx = A.ctx = new AC();
    var master = ctx.createGain();
    master.gain.value = A.muted ? 0 : XD.MIX.bus.master;
    master.connect(ctx.destination);
    A.buses.master = master;
    ['music', 'amb', 'sfx'].forEach(function (b) {
      var g = ctx.createGain(); g.gain.value = XD.MIX.bus[b]; g.connect(master); A.buses[b] = g;
    });
    A.ok = true;
    load();
  };

  function load() {
    Object.keys(window.XD_AUDIO || {}).forEach(function (key) {
      fetch('audio/' + key + '.mp3?v=20260924a')
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then(function (buf) { return new Promise(function (res, rej) { A.ctx.decodeAudioData(buf, res, rej); }); })
        .then(function (b) { A.buffers[key] = b; A.loaded++; })
        .catch(function () { A.failed++; });
    });
  }

  A.setMuted = function (m) {
    A.muted = m;
    try { localStorage.setItem('xd.muted', m ? '1' : '0'); } catch (e) { /* riêng tư: bỏ qua */ }
    if (A.ctx) A.buses.master.gain.setTargetAtTime(m ? 0 : XD.MIX.bus.master, A.ctx.currentTime, 0.15);
  };

  // Một lớp lặp: target là âm lượng mong muốn, đổi mượt bằng setTargetAtTime.
  function Loop(key, bus) {
    this.key = key; this.bus = bus; this.target = 0; this.out = null; this.next = 0; this.voices = [];
  }
  Loop.prototype.tick = function (now) {
    var b = A.buffers[this.key];
    if (!b) return;
    if (!this.out) {
      this.out = A.ctx.createGain(); this.out.gain.value = 0; this.out.connect(A.buses[this.bus]);
      this.next = now + 0.05;
    }
    this.out.gain.setTargetAtTime(this.target, now, 1.2);
    if (this.target < 0.001) {
      if (!this.quietSince) this.quietSince = now;
      if (now - this.quietSince > 7 && this.voices.length) this.stop();
      if (!this.voices.length) return;
    } else this.quietSince = 0;
    if (now > this.next - 0.6) {
      var src = A.ctx.createBufferSource(), env = A.ctx.createGain(), t0 = Math.max(this.next, now + 0.02);
      var len = b.duration, fade = Math.min(XFADE, len / 4);
      src.buffer = b;
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(1, t0 + fade);
      env.gain.setValueAtTime(1, t0 + len - fade);
      env.gain.linearRampToValueAtTime(0, t0 + len);
      src.connect(env); env.connect(this.out);
      src.start(t0); src.stop(t0 + len + 0.05);
      var self = this;
      src.onended = function () { self.voices = self.voices.filter(function (v) { return v !== src; }); };
      this.voices.push(src);
      this.next = t0 + len - fade;
    }
  };
  Loop.prototype.stop = function () {
    this.voices.forEach(function (v) { try { v.stop(); } catch (e) { /* đã dừng */ } });
    this.voices = [];
  };

  function loop(key, bus) {
    return A.loops[key] || (A.loops[key] = new Loop(key, bus));
  }

  // mix = { music: 'day', beds: {water: 0.6, ...} } — gọi mỗi khung.
  A.update = function (mix) {
    if (!A.ok || !A.ctx) return;
    var now = A.ctx.currentTime;
    var mk = XD.MIX.music_keys[mix.music];
    Object.keys(XD.MIX.music_keys).forEach(function (k) {
      var key = XD.MIX.music_keys[k];
      loop(key, 'music').target = key === mk ? mix.musicGain : 0;
    });
    A.musicKey = mk;
    Object.keys(XD.MIX.beds).forEach(function (name) {
      var d = XD.MIX.beds[name];
      loop(d.key, 'amb').target = (mix.beds[name] || 0) * d.gain;
    });
    Object.keys(A.loops).forEach(function (k) { A.loops[k].tick(now); });
  };

  A.play = function (name, opt) {
    if (!A.ok || !A.ctx || A.muted) return;
    var d = XD.MIX.sfx[name];
    var key = d.keys[(Math.random() * d.keys.length) | 0];
    var b = A.buffers[key];
    if (!b) return;
    opt = opt || {};
    var src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = b;
    src.playbackRate.value = (opt.rate || 1) * (1 + ((Math.random() - 0.5) * (opt.jitter || 0.08)));
    g.gain.value = d.gain * (opt.gain == null ? 1 : opt.gain);
    var node = g;
    if (A.ctx.createStereoPanner && opt.pan) {
      var p = A.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opt.pan)); g.connect(p); node = p;
    }
    src.connect(g); node.connect(A.buses.sfx);
    src.start();
  };
})(window.XD = window.XD || {});
