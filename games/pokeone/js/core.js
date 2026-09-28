/*
 * Khung chung: dữ liệu lưu, cài đặt, âm thanh, phím, nạp model, máy trạng thái cảnh.
 * Mọi tệp khác gắn vào window.P1. Không module, không build: mở bằng <script>.
 */
(function (P1) {
  'use strict';

  /* ---------- lưu trữ (localStorage có thể ném lỗi ở tab riêng tư) ---------- */
  const store = {
    get(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
    set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* bỏ qua */ } },
  };
  const SAVE_KEY = 'pokeone.save.v1', SETTINGS_KEY = 'pokeone.settings.v1';

  function newState() {
    return {
      v: 1,
      player: { name: 'Trainer', gender: 'male', look: { body: '0_0', cloth: '0', hair: '1', hat: '' } },
      map: 'pallet_house_2f', x: 0, z: 0, face: 2,
      party: [], box: [],
      bag: { potion: 0, pokeball: 0 },
      money: 3000, trainerExp: 0,
      flags: {}, quest: 'the_pokemon_prof',
      dex: { seen: {}, caught: {} },
      lastHeal: { map: 'pallet_house_1f', x: 0, z: 0 },
      playSeconds: 0, created: Date.now(),
    };
  }

  P1.store = store;
  P1.state = null;
  P1.hasSave = () => !!store.get(SAVE_KEY);
  P1.newGame = () => { P1.state = newState(); return P1.state; };
  P1.load = () => {
    const s = store.get(SAVE_KEY);
    P1.state = s && s.v === 1 ? Object.assign(newState(), s) : null;
    // Bản lưu của bản 3D (PokéOne) có ngoại hình dạng '00_00' + khoá 'clothe', không có tệp PRO tương ứng.
    if (P1.state && P1.state.player.look.clothe !== undefined) P1.state.player.look = newState().player.look;
    return P1.state;
  };
  P1.save = () => store.set(SAVE_KEY, P1.state);
  P1.wipe = () => store.del(SAVE_KEY);
  P1.flag = (k, v) => { if (v === undefined) return !!P1.state.flags[k]; P1.state.flags[k] = v; };
  P1.seen = dex => { P1.state.dex.seen[dex] = 1; };
  P1.caught = dex => { P1.state.dex.seen[dex] = 1; P1.state.dex.caught[dex] = 1; };

  /* ---------- cài đặt: định nghĩa gốc ở data/settings.js (SETTINGS_DEF) ---------- */
  // Mặc định lấy từ OptionsHandler.Load gốc (data/settings.js): nhạc 0,35, tiếng 0,45, Bump Sound tắt.
  const settings = Object.assign({ musicVolume: 0.35, soundVolume: 0.45, bumpSound: false, battleCamera: true, battleFlash: true },
    store.get(SETTINGS_KEY) || {});
  P1.settings = settings;
  P1.setSetting = (k, v) => {
    settings[k] = v; store.set(SETTINGS_KEY, settings);
    if (k === 'musicVolume') audio.musicVolume(v);
  };

  /* ---------- âm thanh ---------- */
  const audio = (function () {
    let ctx = null, sfxGain = null;
    const buffers = {}, pending = {};
    let music = null, musicKey = null, fadeTimer = 0;
    function ac() {
      if (!ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ctx = new C(); sfxGain = ctx.createGain(); sfxGain.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function buffer(url) {
      if (buffers[url]) return Promise.resolve(buffers[url]);
      if (pending[url]) return pending[url];
      const c = ac();
      if (!c) return Promise.resolve(null);
      pending[url] = fetch(url).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('audio missing: ' + url)))
        .then(b => new Promise((res, rej) => c.decodeAudioData(b, res, rej)))
        .then(buf => (buffers[url] = buf))
        .catch(() => null);
      return pending[url];
    }
    function play(url, opt) {
      opt = opt || {};
      return buffer(url).then(buf => {
        if (!buf) return null;
        const src = ctx.createBufferSource(); src.buffer = buf;
        if (opt.rate) src.playbackRate.value = opt.rate;
        const g = ctx.createGain(); g.gain.value = (opt.volume == null ? 1 : opt.volume) * settings.soundVolume;
        src.connect(g); g.connect(sfxGain); src.start();
        return src;
      });
    }
    return {
      unlock: ac,
      sfx(key, opt) { const url = P1.SFX && P1.SFX[key]; return url ? play(url, opt) : Promise.resolve(null); },
      cry(dex, opt) { return play((P1.CRY_PATH || 'audio/cry/') + dex + '.ogg', opt); },
      preload(urls) { return Promise.all(urls.map(buffer)); },
      music(key, opt) {
        opt = opt || {};
        if (key === musicKey && music) return;
        const url = key && P1.MUSIC && P1.MUSIC[key];
        const old = music;
        musicKey = key; music = null;
        clearInterval(fadeTimer);
        if (old) {
          const v0 = old.volume;
          let t = 0;
          fadeTimer = setInterval(() => {
            t += 0.1; old.volume = Math.max(0, v0 * (1 - t));
            if (t >= 1) { clearInterval(fadeTimer); old.pause(); }
          }, 40);
        }
        if (!url) return;
        const el = new Audio(url);
        el.loop = opt.loop !== false; el.volume = settings.musicVolume;
        el.play().catch(() => { /* chờ cú chạm đầu tiên */ });
        music = el;
      },
      musicKey: () => musicKey,
      musicVolume(v) { if (music) music.volume = v; },
      resumeMusic() { if (music && music.paused) music.play().catch(() => {}); },
    };
  })();
  P1.audio = audio;

  /* ---------- phím (wiki: WASD/mũi tên đi, SPACE tương tác, ESC menu, SHIFT xe) ---------- */
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    Space: 'a', Enter: 'a', Escape: 'menu', Backspace: 'b', ShiftLeft: 'mount', ShiftRight: 'mount',
    Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  };
  const held = {}, pressed = [];
  const input = {
    held, map: KEYMAP,
    axis() {
      return { x: (held.right ? 1 : 0) - (held.left ? 1 : 0), y: (held.down ? 1 : 0) - (held.up ? 1 : 0) };
    },
    take(action) { const i = pressed.indexOf(action); if (i < 0) return false; pressed.splice(i, 1); return true; },
    clear() { pressed.length = 0; for (const k in held) held[k] = false; },
    press(action) { pressed.push(action); },
    stick: { x: 0, y: 0 },
  };
  function typing(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); }
  window.addEventListener('keydown', e => {
    audio.unlock(); audio.resumeMusic();
    if (typing(e)) return;
    const a = KEYMAP[e.code];
    if (!a) return;
    e.preventDefault();
    if (!e.repeat) pressed.push(a);
    held[a] = true;
  });
  window.addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) held[a] = false; });
  window.addEventListener('blur', () => input.clear());
  window.addEventListener('pointerdown', () => { audio.unlock(); audio.resumeMusic(); }, { capture: true });
  P1.input = input;

  /* ---------- màn 2D dùng chung: một canvas phủ cửa sổ, vẽ pixel sắc (không làm mịn) ---------- */
  const view = { canvas: null, ctx: null, w: 0, h: 0, dpr: 1 };
  view.fit = () => {
    const c = view.canvas;
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = window.innerWidth; view.h = window.innerHeight;
    c.width = Math.round(view.w * view.dpr); c.height = Math.round(view.h * view.dpr);
    view.ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    view.ctx.imageSmoothingEnabled = false;
  };
  P1.view = () => {
    if (view.canvas) return view;
    view.canvas = document.getElementById('view');
    view.ctx = view.canvas.getContext('2d');
    window.addEventListener('resize', view.fit); view.fit();
    return view;
  };

  /* ---------- ảnh có đệm: P1.img(url) trả Promise, P1.imgNow(url) trả ảnh đã tải hoặc null (cho vòng vẽ) ---------- */
  const imgCache = {};
  P1.img = url => {
    let e = imgCache[url];
    if (!e) {
      e = imgCache[url] = { el: new Image(), ok: false };
      e.p = new Promise((res, rej) => {
        e.el.onload = () => { e.ok = true; res(e.el); };
        e.el.onerror = () => rej(new Error('image missing: ' + url));
      });
      e.p.catch(() => {});
      e.el.src = url;
    }
    return e.p;
  };
  P1.imgNow = url => { const e = imgCache[url]; if (!e) { P1.img(url); return null; } return e.ok ? e.el : null; };

  /* ---------- giờ trong ngày (PokéOne chia sáng/trưa/chiều/đêm; mốc giờ theo HGSS, chưa có nguồn PokéOne) ---------- */
  P1.period = (d) => {
    const h = (d || new Date()).getHours();
    return h >= 4 && h < 10 ? 'morning' : h >= 10 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'evening' : 'night';
  };

  /* ---------- máy trạng thái cảnh ---------- */
  const scenes = {};
  let current = null, currentName = '', last = 0, switching = null;
  P1.scene = {
    add(name, s) { scenes[name] = s; },
    get name() { return currentName; },
    get current() { return current; },
    go(name, args) {
      const next = scenes[name];
      if (!next) throw new Error('scene not registered: ' + name);
      const prev = current;
      switching = Promise.resolve(prev && prev.exit && prev.exit(name))
        .then(() => { current = next; currentName = name; input.clear(); return next.enter && next.enter(args || {}); })
        .then(() => { switching = null; })
        .catch(e => { switching = null; console.error(e); });
      return switching;
    },
  };
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    if (P1.state) P1.state.playSeconds += dt;
    if (current && !switching && current.update) current.update(dt);
    if (current && current.render) current.render(dt);
    requestAnimationFrame(frame);
  }
  P1.start = (first, args) => { requestAnimationFrame(frame); return P1.scene.go(first, args); };

  P1.debug = { get state() { return P1.state; }, scene: () => currentName };
})(window.P1 = window.P1 || {});
