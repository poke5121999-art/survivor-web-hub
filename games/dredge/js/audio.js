/*
 * Tiếng: phát theo khoá ngữ nghĩa trong DR_AUDIO (sinh bởi tools/audio.py) HOẶC theo tên clip gốc ('Organic Item - Pick up').
 *   DRAudio.play('fish.minigame.hit', vol, rate, opts)   một phát; rate = cao độ như AudioSource.pitch (vd 0,95-1,05 ngẫu nhiên)
 *        opts { bus, pos: {x,y,z}, min, max }: nguồn 3D (PannerNode tuyến tính min..max như AudioRolloffMode.Linear của Unity)
 *   DRAudio.loop('boat.engine.loop', vol, rate, bus)     vòng lặp theo khoá, gọi lại để đổi âm lượng (0 = tắt dần) và tốc độ phát
 *   DRAudio.voice(key, { loop, vol, rate, bus, pos, min, max, offset, onend })  một giọng riêng (nhiều nguồn cùng clip): trả tay cầm
 *        { gain(v, tc), pos(x,y,z), stop(fade), alive }
 *   DRAudio.music('music.title', vol, bus, fade)         nhạc nền, đổi bản thì crossfade; DRAudio.stinger(key, vol) nhạc chớp (một lần)
 *   DRAudio.bus(name, gain, tc)                          âm lượng của một nhóm mixer của bản gốc (Day, Night, Weather, Music_Dock...)
 *   DRAudio.alias(từ, đến)                               khoá cũ của mã khác trỏ sang khoá đúng (vd 'ui.journal.open' -> 'Pursuits - Open')
 *   DRAudio.gate(khoá[], ms)                             bỏ qua lệnh phát các khoá ấy trong ms (một sự kiện chỉ nghe một tiếng)
 *   DRAudio.listener(x, y, z, fx, fy, fz)                vị trí/hướng người nghe (camera) cho nguồn 3D
 *   DRAudio.preload(khoá | khoá[])  DRAudio.state()  DRAudio.resolve(khoá)
 * WebAudio chỉ mở sau cú chạm/phím đầu tiên (luật autoplay của trình duyệt); trước đó mọi lệnh bị bỏ qua, nên bên gọi
 * (js/sfx.js) đặt lại trạng thái mong muốn mỗi nhịp thay vì chỉ phát một lần.
 */
(function (root) {
  'use strict';
  let ctx = null, master = null, muted = false;
  const buffers = {}, loading = {}, loops = {}, buses = {}, busWant = {}, gates = {}, aliases = {}, used = {};
  const voices = new Set();
  let bytes = 0;
  const MAX_BYTES = 96e6;    // [ĐỀ XUẤT] trần bộ nhớ giải mã (float32): vòng lặp 30 s mono ≈ 5,8 MB, nên giữ vài chục clip dài là đủ
  let musicNode = null, musicKey = null, stingerVoice = null;

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    for (const [n, g] of Object.entries(busWant)) busNode(n).gain.value = g;
  }
  if (typeof document !== 'undefined') {
    for (const ev of ['pointerdown', 'keydown', 'touchstart'])
      document.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  // Khoá là khoá ngữ nghĩa ('fish.minigame.hit') hoặc tên clip gốc ('Organic Item - Pick up', lấy từ trường orig
  // mà tools/audio.py ghi), để mã gọi được đúng tên trong bản gốc mà không cần chờ ai đặt khoá mới.
  let byOrig = null, byOrigN = -1;
  const norm = s => String(s).toLowerCase().replace(/\.(ogg|wav|mp3)$/, '').replace(/[\s_]+/g, ' ').trim();
  function resolve(key) {
    const A = root.DR_AUDIO || {};
    if (aliases[key]) key = aliases[key];
    if (A[key]) return key;
    const n = Object.keys(A).length;
    if (n !== byOrigN) {
      byOrig = {}; byOrigN = n;
      for (const [k, d] of Object.entries(A)) if (d.orig) byOrig[norm(d.orig.split('/').pop())] = k;
    }
    return byOrig[norm(key)] || null;
  }
  const warned = {};
  function def(key) {
    const k = resolve(key);
    if (!k) { if (!warned[key]) { warned[key] = 1; console.warn('[audio] key not found:', key); } return null; }
    return root.DR_AUDIO[k];
  }
  function load(key) {
    key = resolve(key) || key;
    if (buffers[key]) { used[key] = now(); return Promise.resolve(buffers[key]); }
    if (loading[key]) return loading[key];
    const d = def(key);
    if (!d || !ctx) return Promise.resolve(null);
    loading[key] = fetch(d.src).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + d.src);
      return r.arrayBuffer();
    }).then(b => ctx.decodeAudioData(b)).then(buf => {
      buf._drKey = key;   // dấu để bộ kiểm thử (test/dredge-sfx.js) biết nút nguồn nào phát khoá nào
      buffers[key] = buf; used[key] = now(); bytes += buf.length * buf.numberOfChannels * 4;
      delete loading[key]; evict();
      return buf;
    }).catch(e => { delete loading[key]; console.warn('[audio] load failed:', key, e.message); return null; });
    return loading[key];
  }
  // Giữ bộ nhớ có trần: bỏ clip dài ít dùng nhất mà không giọng nào đang giữ.
  function evict() {
    if (bytes <= MAX_BYTES) return;
    const busy = new Set([musicKey]);
    for (const v of voices) busy.add(v.key);
    for (const k of Object.keys(loops)) busy.add(k);
    const order = Object.keys(buffers).filter(k => !busy.has(k) && buffers[k].length * buffers[k].numberOfChannels * 4 > 400e3)
      .sort((a, b) => (used[a] || 0) - (used[b] || 0));
    for (const k of order) {
      if (bytes <= MAX_BYTES * 0.8) break;
      bytes -= buffers[k].length * buffers[k].numberOfChannels * 4;
      delete buffers[k];
    }
  }

  // ---- bus: nhóm mixer của bản gốc (Day, Night, Weather, Music_Dock...). Âm lượng đặt từ js/sfx.js theo snapshot.
  function busNode(name) {
    if (!ctx || !name) return null;
    if (!buses[name]) {
      const g = ctx.createGain();
      g.gain.value = name in busWant ? busWant[name] : 1;
      g.connect(master);
      buses[name] = g;
    }
    return buses[name];
  }
  function bus(name, gain, tc) {
    if (name in busWant && Math.abs(busWant[name] - gain) < 1e-4) return;
    busWant[name] = gain;
    if (ctx) busNode(name).gain.setTargetAtTime(gain, ctx.currentTime, Math.max(0.01, tc == null ? 0.25 : tc));
  }
  const out = name => busNode(name) || master;

  function gate(keys, ms) {
    const until = now() + ms;
    for (const k of [].concat(keys)) { const r = resolve(k); if (r) gates[r] = until; }
  }
  const gated = k => gates[k] && now() < gates[k];
  function alias(from, to) { aliases[from] = to; }

  function source(buf, vol, loop, bn) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.loop = !!loop;
    g.gain.value = vol;
    src.connect(g); g.connect(out(bn));
    return { src, g };
  }

  // ---- người nghe 3D
  function listener(x, y, z, fx, fy, fz) {
    if (!ctx) return;
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
      if (fx != null) { L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    } else {
      L.setPosition(x, y, z);
      if (fx != null) L.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  /*
   * Một giọng: src -> gain -> (panner) -> bus. Trả tay cầm ngay cả khi clip chưa nạp xong (phát khi nạp xong).
   * loop + offset 'random' = RandomizeAudioPlayback.Awake (bắt đầu ở chỗ ngẫu nhiên trong clip).
   */
  function voice(key, o) {
    o = o || {};
    // tay cầm "chết" (chưa mở WebAudio, khoá lạ, bị gate) vẫn có đủ hàm để bên gọi không phải kiểm tra
    const h = { key: null, alive: false, stopped: false, src: null, g: null, p: null, want: 0, kv: 1, bus: o.bus || null,
      gain() {}, pos() {}, stop() {} };
    if (!ctx) return h;
    const rk = resolve(key), d = rk && def(rk);
    if (!d || (o.gate !== false && gated(rk))) return h;
    h.key = rk; h.alive = true; h.kv = d.vol == null ? 1 : d.vol;
    h.bus = o.bus || d.bus || null;
    h.want = (o.vol == null ? 1 : o.vol) * h.kv;
    voices.add(h);
    h.gain = (v, tc) => {
      h.want = v * h.kv;
      if (h.g) h.g.gain.setTargetAtTime(h.want, ctx.currentTime, Math.max(0.01, tc == null ? 0.25 : tc));
    };
    h.pos = (x, y, z) => {
      if (!h.p) return;
      if (h.p.positionX) { h.p.positionX.value = x; h.p.positionY.value = y; h.p.positionZ.value = z; } else h.p.setPosition(x, y, z);
    };
    h.stop = fade => {
      h.stopped = true;
      if (!h.src) { h.alive = false; voices.delete(h); return; }
      const t = ctx.currentTime, f = fade == null ? 0.2 : fade;
      h.g.gain.cancelScheduledValues(t); h.g.gain.setTargetAtTime(0, t, Math.max(0.01, f / 3));
      try { h.src.stop(t + f + 0.05); } catch (e) { /* đã dừng */ }
    };
    load(rk).then(buf => {
      if (!buf || h.stopped) { h.alive = false; voices.delete(h); return; }
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; src.loop = !!o.loop;
      g.gain.value = o.fade ? 0 : h.want;
      src.connect(g);
      h.src = src; h.g = g;
      src._drKey = rk; src._drVol = h.want; src._drBus = h.bus;   // dấu cho bộ kiểm thử (test/dredge-sfx.js)
      if (o.pos) {   // nguồn 3D: AudioSource.spatialBlend 1 + AudioRolloffMode.Linear min..max
        const p = ctx.createPanner();
        p.panningModel = 'equalpower'; p.distanceModel = 'linear';
        p.refDistance = o.min == null ? 1 : o.min; p.maxDistance = o.max == null ? 500 : o.max; p.rolloffFactor = 1;
        h.p = p; g.connect(p); p.connect(out(h.bus));
        h.pos(o.pos.x, o.pos.y || 0, o.pos.z);
      } else g.connect(out(h.bus));
      if (o.rate) src.playbackRate.value = o.rate;
      if (o.fade) g.gain.setTargetAtTime(h.want, ctx.currentTime, Math.max(0.01, o.fade / 3));
      src.onended = () => { h.alive = false; voices.delete(h); if (o.onend) o.onend(h); };
      const off = o.offset === 'random' ? Math.random() * buf.duration : (o.offset || 0);
      src.start(0, o.loop ? off % buf.duration : off);
      if (h.stopped) h.stop(0.05);
    });
    return h;
  }

  // rate: tốc độ phát = cao độ, như AudioSource.pitch của Unity (vd 0,95-1,05 ngẫu nhiên cho tiếng trúng/trượt)
  function play(key, vol, rate, opts) {
    if (!ctx) return null;
    opts = opts || {};
    return voice(key, { loop: false, vol, rate, bus: opts.bus, pos: opts.pos, min: opts.min, max: opts.max });
  }

  function loop(key, vol, rate, bn) {
    if (!ctx) return;
    const d = def(key); if (!d) return;
    key = resolve(key);
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
    const rec = loops[key] = { target, rate, g: null, bus: bn || d.bus || null };
    load(key).then(buf => {
      if (!buf || loops[key] !== rec) return;
      const n = source(buf, 0, true, rec.bus);
      rec.g = n.g; rec.src = n.src;
      n.src._drKey = key; n.src._drVol = rec.target; n.src._drBus = rec.bus;
      n.src.playbackRate.value = rec.rate;
      n.g.gain.setTargetAtTime(rec.target, ctx.currentTime, 0.25);
      n.src.start();
    });
  }
  function stopLoop(key) {
    key = resolve(key) || key;
    const cur = loops[key];
    if (!cur) return;
    delete loops[key];
    if (cur.g) { cur.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); setTimeout(() => cur.src.stop(), 1200); }
  }

  // Nhạc nền (AudioPlayer.PlayMusic): đổi bản thì bản cũ tắt dần, bản mới vào dần. vol mặc định 1 = AudioPlayer.maxMusicVolume.
  function music(key, vol, bn, fade) {
    if (!ctx || key === musicKey) return;
    const old = musicNode, tc = fade == null ? 0.8 : fade / 3;
    musicKey = key; musicNode = null;
    if (old) { old.g.gain.setTargetAtTime(0, ctx.currentTime, tc); setTimeout(() => old.src.stop(), tc * 5 * 1000 + 200); }
    if (!key) return;
    const d = def(key); if (!d) return;
    const rk = resolve(key);
    load(rk).then(buf => {
      if (!buf || musicKey !== key) return;
      const n = source(buf, 0, d.loop !== false, bn || d.bus || null);
      n.src._drKey = rk; n.src._drBus = bn || d.bus || null;
      n.g.gain.setTargetAtTime((vol == null ? 1 : vol) * (d.vol || 1), ctx.currentTime, 0.8);
      n.src.start();
      musicNode = n;
    });
  }

  // Nhạc chớp (AudioLayer.MUSIC_STINGER): một lần, không lặp; chỉ một bản một lúc.
  function stinger(key, vol) {
    if (!ctx || (stingerVoice && stingerVoice.alive)) return null;
    const h = voice(key, { loop: false, vol, bus: 'Music_Stinger', gate: false, onend: () => { if (stingerVoice === h) stingerVoice = null; } });
    stingerVoice = h.alive ? h : null;
    return stingerVoice;
  }
  function stopStinger(fade) { if (stingerVoice) { stingerVoice.stop(fade == null ? 2.5 : fade); stingerVoice = null; } }
  const stingerPlaying = () => !!(stingerVoice && stingerVoice.alive);

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
  }

  // nạp trước: một khoá hoặc danh sách; nạp từng đợt nhỏ để khỏi nghẽn giải mã lúc đang chơi
  function preload(keys) {
    const list = [].concat(keys || []);
    if (!ctx) return Promise.resolve([]);
    const out = [];
    let i = 0;
    const next = () => {
      const part = list.slice(i, i += 4).map(k => load(k));
      if (!part.length) return Promise.resolve(out);
      return Promise.all(part).then(r => { out.push(...r); return next(); });
    };
    return next();
  }

  // ảnh chụp trạng thái cho bộ kiểm thử và gỡ lỗi
  function state() {
    const lp = {};
    for (const [k, r] of Object.entries(loops)) lp[k] = { target: r.target, rate: r.rate, bus: r.bus, running: !!r.src };
    return {
      ctx: ctx ? ctx.state : 'none', muted, music: musicKey, stinger: stingerVoice && stingerVoice.alive ? stingerVoice.key : null,
      loops: lp, buses: Object.assign({}, busWant), voices: voices.size, buffers: Object.keys(buffers).length, bytes
    };
  }

  root.DRAudio = {
    play, loop, stopLoop, music, stinger, stopStinger, stingerPlaying, voice, bus, gate, alias, listener, setMuted,
    isMuted: () => muted, unlock, preload, resolve, state
  };
})(typeof window !== 'undefined' ? window : globalThis);
