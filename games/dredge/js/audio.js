/*
 * Tiếng: phát theo khoá ngữ nghĩa trong DR_AUDIO (sinh bởi tools/audio.py).
 *   DRAudio.play('fish.minigame.hit')         một phát
 *   DRAudio.loop('boat.engine.loop', 0.6, 1.2) vòng lặp theo tên, gọi lại để đổi âm lượng (0 = tắt dần) và tốc độ phát (cao độ)
 *   DRAudio.music('music.title')              một bản nhạc nền, đổi bản thì crossfade
 * WebAudio chỉ mở sau cú chạm/phím đầu tiên (luật autoplay của trình duyệt); trước đó mọi lệnh bị bỏ qua.
 */
(function (root) {
  'use strict';
  let ctx = null, master = null, muted = false;
  const buffers = {}, loading = {}, loops = {};
  let musicNode = null, musicKey = null;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  }
  if (typeof document !== 'undefined') {
    for (const ev of ['pointerdown', 'keydown', 'touchstart'])
      document.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  function def(key) {
    const d = root.DR_AUDIO && root.DR_AUDIO[key];
    if (!d) console.warn('[audio] key not found:', key);
    return d;
  }
  function load(key) {
    if (buffers[key]) return Promise.resolve(buffers[key]);
    if (loading[key]) return loading[key];
    const d = def(key);
    if (!d || !ctx) return Promise.resolve(null);
    loading[key] = fetch(d.src).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + d.src);
      return r.arrayBuffer();
    }).then(b => ctx.decodeAudioData(b)).then(buf => (buffers[key] = buf))
      .catch(e => { console.warn('[audio] load failed:', key, e.message); return null; });
    return loading[key];
  }

  function source(buf, vol, loop) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.loop = !!loop;
    g.gain.value = vol;
    src.connect(g); g.connect(master);
    return { src, g };
  }

  function play(key, vol) {
    if (!ctx) return;
    const d = def(key); if (!d) return;
    load(key).then(buf => {
      if (!buf) return;
      const n = source(buf, (vol == null ? 1 : vol) * (d.vol || 1), false);
      n.src.start();
    });
  }

  function loop(key, vol, rate) {
    if (!ctx) return;
    const d = def(key); if (!d) return;
    const target = (vol == null ? 1 : vol) * (d.vol || 1);
    rate = rate || 1;
    const cur = loops[key];
    if (cur) {
      if (cur.g) cur.g.gain.setTargetAtTime(target, ctx.currentTime, 0.25);
      if (cur.src) cur.src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.15);
      cur.target = target; cur.rate = rate;
      return;
    }
    if (target <= 0) return;
    const rec = loops[key] = { target, rate, g: null };
    load(key).then(buf => {
      if (!buf || loops[key] !== rec) return;
      const n = source(buf, 0, true);
      rec.g = n.g; rec.src = n.src;
      n.src.playbackRate.value = rec.rate;
      n.g.gain.setTargetAtTime(rec.target, ctx.currentTime, 0.25);
      n.src.start();
    });
  }
  function stopLoop(key) {
    const cur = loops[key];
    if (!cur) return;
    delete loops[key];
    if (cur.g) { cur.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); setTimeout(() => cur.src.stop(), 1200); }
  }

  function music(key, vol) {
    if (!ctx || key === musicKey) return;
    const old = musicNode;
    musicKey = key; musicNode = null;
    if (old) { old.g.gain.setTargetAtTime(0, ctx.currentTime, 0.8); setTimeout(() => old.src.stop(), 4000); }
    if (!key) return;
    const d = def(key); if (!d) return;
    load(key).then(buf => {
      if (!buf || musicKey !== key) return;
      const n = source(buf, 0, d.loop !== false);
      n.g.gain.setTargetAtTime((vol == null ? 0.7 : vol) * (d.vol || 1), ctx.currentTime, 0.8);
      n.src.start();
      musicNode = n;
    });
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
  }

  root.DRAudio = { play, loop, stopLoop, music, setMuted, isMuted: () => muted, unlock, preload: load };
})(typeof window !== 'undefined' ? window : globalThis);
