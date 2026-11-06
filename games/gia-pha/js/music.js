/*
 * Nhạc nền. Danh sách phát = bài mặc định + các tệp nhạc người dùng tải lên (doc.playlist, đi theo
 * cây khi xuất/nhập và vào hoàn tác). Bật/tắt, âm lượng, trộn bài là sở thích của người xem nên nằm
 * trong localStorage, không nằm trong cây.
 *
 * Bài mặc định "Ru con" được tổng hợp ngay trong trình duyệt (OfflineAudioContext) rồi đóng thành
 * WAV, nên không có tệp nhạc nào phải tải về hay xin bản quyền, và mọi bài đi chung một <audio>.
 *
 * Trình duyệt chặn tự phát tiếng trước cú chạm đầu tiên, nên nhạc bắt đầu ở cú chạm đầu tiên.
 * Một AnalyserNode đo độ to từng khung, ghi vào biến CSS --beat để cây "thở" theo nhạc.
 */
(function (GP) {
  'use strict';
  const M = GP.model, S = GP.store;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const BUILTIN = 'builtin';
  const BUILTIN_NAME = 'Ru con (bài có sẵn)';
  const PREF = 'gia-pha.music';

  const Mu = {
    audio: null, cur: BUILTIN, level: 0, playing: false,
    prefs: { on: true, vol: 0.55, shuffle: false },
  };
  let ac = null, analyser = null, freq = null, builtinURL = null, building = null, menuEl = null;

  function loadPrefs() {
    try { Object.assign(Mu.prefs, JSON.parse(localStorage.getItem(PREF) || '{}')); } catch (e) { /* riêng tư */ }
  }
  function savePrefs() {
    try { localStorage.setItem(PREF, JSON.stringify(Mu.prefs)); } catch (e) { /* riêng tư */ }
  }

  const tracks = () => [BUILTIN].concat(S.doc ? S.doc.playlist : []);

  // ---------- bài mặc định ----------

  // Điệu ngũ cung Bắc (Đô Rê Fa Son La), 66 nhịp/phút, 16 ô nhịp. [cao độ MIDI, số phách].
  const MELODY = [
    [67, 1], [69, .5], [72, .5], [69, 1], [67, 1], [65, 1], [67, .5], [65, .5], [62, 2],
    [62, 1], [65, 1], [67, .5], [69, .5], [72, 1], [69, 1.5], [67, .5], [67, 2],
    [72, 1], [74, .5], [72, .5], [69, 1], [67, 1], [69, 1], [67, .5], [65, .5], [67, 2],
    [65, 1], [62, 1], [65, .5], [67, .5], [69, 1], [67, 1.5], [65, .5], [60, 2],
    [69, 1], [72, .5], [74, .5], [72, 1], [69, 1], [67, 1], [69, .5], [67, .5], [65, 2],
    [67, 1], [69, 1], [72, .5], [74, .5], [77, 1], [74, 1.5], [72, .5], [72, 2],
    [74, 1], [72, .5], [69, .5], [67, 1], [65, 1], [67, 1], [65, .5], [62, .5], [65, 2],
    [62, 1], [65, 1], [67, 1], [69, .5], [67, .5], [60, 4],
  ];
  const ROOTS = [48, 53, 50, 48, 53, 48, 50, 48, 53, 48, 50, 48, 50, 53, 50, 48];
  const BPM = 66;

  function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Tiếng gảy kiểu đàn tranh: vài hoạ âm tắt dần, hoạ âm cao tắt nhanh hơn, có rung nhẹ.
  function pluck(c, out, t, hz, vel, len) {
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + len);
    g.connect(out);
    [[1, 1, 1], [2, 0.42, 0.55], [3, 0.18, 0.35], [4, 0.08, 0.25]].forEach(([h, a, d]) => {
      const o = c.createOscillator(), og = c.createGain();
      o.frequency.setValueAtTime(hz * h, t);
      og.gain.setValueAtTime(a, t);
      og.gain.exponentialRampToValueAtTime(0.0005, t + len * d);
      const vib = c.createOscillator(), vg = c.createGain();
      vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(hz * h * 0.004, t + 0.35);
      vib.connect(vg); vg.connect(o.frequency);
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + len); vib.start(t); vib.stop(t + len);
    });
  }

  function pad(c, out, t, hz, len) {
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + len * 0.4);
    g.gain.linearRampToValueAtTime(0, t + len);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    f.connect(g); g.connect(out);
    for (const [r, det] of [[1, -4], [1, 4], [1.5, 0]]) {
      const o = c.createOscillator();
      o.type = 'triangle'; o.frequency.value = hz * r; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + len);
    }
  }

  function impulse(c, sec) {
    const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    }
    return b;
  }

  async function renderBuiltin() {
    const beat = 60 / BPM;
    const beats = MELODY.reduce((n, [, d]) => n + d, 0);
    const sec = beats * beat;
    const rate = 22050;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const c = new OAC(1, Math.ceil(rate * (sec + 0.05)), rate);
    const dry = c.createGain(); dry.gain.value = 0.8;
    const rev = c.createConvolver(); rev.buffer = impulse(c, 2.6);
    const wet = c.createGain(); wet.gain.value = 0.32;
    const bus = c.createGain();
    bus.connect(dry); bus.connect(rev); rev.connect(wet);
    const master = c.createGain(); master.gain.value = 0.9;
    dry.connect(master); wet.connect(master); master.connect(c.destination);
    let t = 0.02;
    for (const [m, d] of MELODY) { pluck(c, bus, t, midiHz(m), 0.32, Math.max(1.6, d * beat * 2.2)); t += d * beat; }
    ROOTS.forEach((r, bar) => {
      const t0 = 0.02 + bar * 4 * beat;
      pad(c, bus, t0, midiHz(r), 4 * beat + 0.4);
      [0, 7, 12, 7].forEach((iv, i) => pluck(c, bus, t0 + (i + 0.5) * beat, midiHz(r + 12 + iv), 0.075, 1.4));
    });
    const buf = await c.startRendering();
    return wav(buf.getChannelData(0), rate);
  }

  function wav(data, rate) {
    const n = data.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
    const k = peak > 0 ? 0.92 / peak : 1;
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i] * k)) * 32767, true);
    return new Blob([b], { type: 'audio/wav' });
  }

  function builtin() {
    if (builtinURL) return Promise.resolve(builtinURL);
    if (!building) building = renderBuiltin().then((blob) => (builtinURL = URL.createObjectURL(blob)));
    return building;
  }

  // ---------- phát ----------

  async function srcOf(id) {
    if (id === BUILTIN) return builtin();
    return S.url(id);
  }

  async function nameOf(id) {
    if (id === BUILTIN) return BUILTIN_NAME;
    const f = await S.getFile(id);
    return f ? f.name.replace(/\.[^.]+$/, '') : 'bài đã gỡ';
  }

  function wireAnalyser() {
    if (ac || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createMediaElementSource(Mu.audio);
      analyser = ac.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser); analyser.connect(ac.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) { ac = null; analyser = null; }
  }

  async function play(id) {
    const list = tracks();
    if (id == null || !list.includes(id)) id = list.includes(Mu.cur) ? Mu.cur : BUILTIN;
    const changed = id !== Mu.cur || !Mu.audio.src;
    Mu.cur = id;
    Mu.prefs.on = true; savePrefs();
    wireAnalyser();
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
    if (changed) {
      const u = await srcOf(id);
      if (Mu.cur !== id) return;
      if (!u) { next(); return; }
      Mu.audio.src = u;
    }
    try { await Mu.audio.play(); } catch (e) { /* chưa có cú chạm: chờ lần chạm sau */ }
    refresh();
  }

  function pause() {
    Mu.prefs.on = false; savePrefs();
    Mu.audio.pause();
    refresh();
  }

  function step(d) {
    const list = tracks();
    let i = list.indexOf(Mu.cur);
    if (Mu.prefs.shuffle && list.length > 2) {
      let j = i;
      while (j === i) j = Math.floor(Math.random() * list.length);
      i = j;
    } else i = (i + d + list.length) % list.length;
    Mu.audio.removeAttribute('src');
    Mu.cur = list[i];
    play(list[i]);
  }
  const next = () => step(1);
  const prev = () => step(-1);

  function meter() {
    let lv = 0;
    if (analyser && Mu.playing) {
      analyser.getByteFrequencyData(freq);
      let s = 0;
      for (let i = 1; i < 24; i++) s += freq[i];
      lv = Math.min(1, s / (23 * 190));
    }
    Mu.level += (lv - Mu.level) * 0.25;
    document.documentElement.style.setProperty('--beat', Mu.level.toFixed(3));
    requestAnimationFrame(meter);
  }

  // ---------- danh sách ----------

  async function upload(files) {
    const auds = files.filter((f) => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i.test(f.name));
    if (!auds.length) { GP.ui.toast({ text: 'Không có tệp nhạc nào trong số tệp vừa chọn', bad: true }); return; }
    const ids = [];
    try { for (const f of auds) ids.push((await S.putFile(f)).id); }
    catch (err) { GP.ui.toast({ text: 'Không lưu được nhạc (bộ nhớ trình duyệt đầy?): ' + err.message, bad: true }); if (!ids.length) return; }
    S.commit('Thêm ' + ids.length + ' bài nhạc', (t) => { t.playlist.push(...ids); });
    GP.ui.toast({ text: 'Đã thêm ' + ids.length + ' bài vào danh sách nhạc', undo: true });
    play(ids[0]);
  }

  function remove(id) {
    if (id === BUILTIN) return;
    const wasCur = Mu.cur === id;
    S.commit('Gỡ bài nhạc', (t) => { t.playlist = t.playlist.filter((x) => x !== id); });
    GP.ui.toast({ text: 'Đã gỡ bài khỏi danh sách', undo: true });
    if (wasCur) { Mu.audio.removeAttribute('src'); Mu.cur = BUILTIN; if (Mu.prefs.on) play(BUILTIN); else refresh(); }
  }

  // ---------- giao diện ----------

  function refresh() {
    const btn = $('#music-btn');
    if (btn) {
      btn.classList.toggle('on', Mu.playing);
      btn.title = Mu.playing ? 'Nhạc nền đang phát (bấm để mở danh sách)' : 'Nhạc nền đang tắt (bấm để mở danh sách)';
    }
    if (menuEl) renderMenu();
  }

  async function renderMenu() {
    const list = tracks();
    const names = await Promise.all(list.map(nameOf));
    if (!menuEl) return;
    const i = list.indexOf(Mu.cur);
    menuEl.innerHTML =
      '<div class="mu-now"><div class="mu-disc' + (Mu.playing ? ' spin' : '') + '"><i></i></div><div class="mu-t"><b>' + esc(names[i] || BUILTIN_NAME) + '</b>' +
        '<small>Bài ' + (i + 1) + ' / ' + list.length + (Mu.playing ? ' · đang phát' : ' · đang dừng') + '</small></div></div>' +
      '<div class="mu-ctl">' +
        '<button class="icon-btn" data-mu="prev" title="Bài trước">⏮</button>' +
        '<button class="icon-btn mu-play" data-mu="toggle" title="' + (Mu.playing ? 'Dừng' : 'Phát') + '">' + (Mu.playing ? '⏸' : '▶') + '</button>' +
        '<button class="icon-btn" data-mu="next" title="Bài sau">⏭</button>' +
        '<button class="icon-btn' + (Mu.prefs.shuffle ? ' on' : '') + '" data-mu="shuffle" title="Trộn bài">🔀</button>' +
        '<input type="range" min="0" max="1" step="0.05" value="' + Mu.prefs.vol + '" class="mu-vol" title="Âm lượng">' +
      '</div>' +
      '<div class="mu-list">' + list.map((id, k) =>
        '<div class="mu-row' + (id === Mu.cur ? ' cur' : '') + '" data-id="' + esc(id) + '"><button class="mu-pick" data-mu="pick">' +
          '<span class="mu-n">' + (id === Mu.cur && Mu.playing ? '<span class="eq"><i></i><i></i><i></i></span>' : k + 1) + '</span><span class="mu-nm">' + esc(names[k]) + '</span></button>' +
          (id === BUILTIN ? '<span class="mu-tag">mặc định</span>' : '<button class="icon-btn mu-x" data-mu="remove" title="Gỡ bài này">✕</button>') +
        '</div>').join('') + '</div>' +
      '<label class="btn mu-up">⇪ Tải nhạc lên<input type="file" accept="audio/*,.mp3,.m4a,.ogg,.wav,.flac,.opus" multiple hidden id="mu-file"></label>' +
      '<p class="mu-note">Nhạc tải lên được lưu trong trình duyệt và đi theo cây khi xuất ra tệp.</p>';
  }

  function openMenu(anchor) {
    if (menuEl) { closeMenu(); return; }
    menuEl = document.createElement('div');
    menuEl.className = 'menu mu-menu no-pan';
    menuEl.id = 'mu-menu';
    document.body.appendChild(menuEl);
    renderMenu().then(() => {
      if (!menuEl) return;
      const r = anchor.getBoundingClientRect();
      menuEl.style.left = Math.max(8, Math.min(innerWidth - menuEl.offsetWidth - 8, r.right - menuEl.offsetWidth)) + 'px';
      menuEl.style.top = (r.bottom + 6) + 'px';
      menuEl.style.maxHeight = (innerHeight - r.bottom - 20) + 'px';
      requestAnimationFrame(() => menuEl && menuEl.classList.add('in'));
    });
    menuEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mu]');
      if (!b) return;
      const act = b.dataset.mu, row = b.closest('.mu-row'), id = row && row.dataset.id;
      if (act === 'toggle') Mu.playing ? pause() : play();
      else if (act === 'prev') prev();
      else if (act === 'next') next();
      else if (act === 'shuffle') { Mu.prefs.shuffle = !Mu.prefs.shuffle; savePrefs(); refresh(); }
      else if (act === 'pick') play(id);
      else if (act === 'remove') remove(id);
    });
    menuEl.addEventListener('input', (e) => {
      if (!e.target.classList.contains('mu-vol')) return;
      Mu.prefs.vol = +e.target.value; Mu.audio.volume = Mu.prefs.vol; savePrefs();
    });
    menuEl.addEventListener('change', (e) => {
      if (e.target.id !== 'mu-file') return;
      const fs = Array.from(e.target.files); e.target.value = '';
      upload(fs);
    });
    setTimeout(() => document.addEventListener('pointerdown', away), 0);
  }
  function away(e) { if (menuEl && !menuEl.contains(e.target) && !e.target.closest('#music-btn')) closeMenu(); }
  function closeMenu() {
    if (!menuEl) return;
    menuEl.remove(); menuEl = null;
    document.removeEventListener('pointerdown', away);
  }

  function init() {
    loadPrefs();
    Mu.audio = $('#bgm');
    Mu.audio.volume = Mu.prefs.vol;
    Mu.audio.addEventListener('play', () => { Mu.playing = true; document.body.classList.add('music-on'); refresh(); });
    Mu.audio.addEventListener('pause', () => { Mu.playing = false; document.body.classList.remove('music-on'); refresh(); });
    Mu.audio.addEventListener('ended', () => (tracks().length > 1 ? next() : (Mu.audio.currentTime = 0, Mu.audio.play().catch(() => {}))));
    Mu.audio.addEventListener('error', () => { if (Mu.audio.getAttribute('src')) { GP.ui.toast({ text: 'Không phát được bài này, chuyển bài', bad: true }); setTimeout(next, 600); } });
    $('#music-btn').onclick = (e) => openMenu(e.currentTarget);
    const first = (e) => {
      if (e.target.closest('#music-btn,#mu-menu')) return;
      removeEventListener('pointerdown', first, true);
      if (Mu.prefs.on && !Mu.playing) play();
    };
    addEventListener('pointerdown', first, true);
    S.on('load', () => { if (!tracks().includes(Mu.cur)) { Mu.audio.removeAttribute('src'); Mu.cur = BUILTIN; if (Mu.prefs.on && Mu.playing) play(); } refresh(); });
    S.on('change', () => {
      if (!tracks().includes(Mu.cur)) { Mu.audio.removeAttribute('src'); Mu.cur = BUILTIN; if (Mu.prefs.on) play(); }
      if (menuEl) renderMenu();
    });
    requestAnimationFrame(meter);
    builtin().catch(() => {});
  }

  Object.assign(Mu, { init, play, pause, next, prev, upload, remove, tracks, BUILTIN, closeMenu });
  GP.music = Mu;
})(window.GP);
