// Âm thanh Trốn Tìm: bộ phát WebAudio riêng (không nạp sfx.js của Soul Knight, vì nó cố định thư mục, chèn nút tắt tiếng và phím M).
// Tệp lấy từ SK_AUDIO.clips ở art/audio/. Giải mã lười, nạp trước các tiếng hay dùng sau cử chỉ đầu tiên (trình duyệt chặn âm thanh trước đó).
// Cài đặt tắt tiếng lưu ở localStorage 'tron-tim.audio' = {sfx: bool, music: bool} (true = đang tắt).
(function () {
  'use strict';
  const TT = window.TT = window.TT || {};
  const A = window.SK_AUDIO || { clips: {}, byHero: {}, events: {}, music: {} };
  const SRC = document.currentScript && document.currentScript.src;
  const BASE = new URL('../art/audio/', SRC || location.href).href;
  const KEY = 'tron-tim.audio';

  const state = { sfx: false, music: false };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* không có localStorage: dùng mặc định */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ sfx: !!state.sfx, music: !!state.music })); } catch (e) { /* bỏ qua */ } };

  let ctx = null, sfxBus = null, musicBus = null, unlocked = false;
  const bufs = new Map();      // tên clip -> AudioBuffer | Promise | null (hỏng)
  const lastAt = new Map();    // tên clip -> thời điểm phát gần nhất (chống chồng tiếng)
  let wantMusic = null, curMusic = null;
  const stats = { played: 0, decoded: 0, failed: 0, requested: 0, calls: {} };

  const PRELOAD = ['fx_sword_wield_01', 'fx_hit', 'fx_hit_p1', 'fx_dead', 'fx_healing2', 'fx_slash2', 'fx_ui_ding1', 'fx_btn_start', 'fx_cd_ready',
    'fx_error', 'fx_door', 'fx_transform', 'fx_skill', 'fx_skill_c2', 'fx_skill_c3', 'fx_skill_c4', 'fx_skill_c6', 'fx_skill_c8', 'fx_c11_skill_1',
    'fx_laser_eletric', 'fx_skill_jump', 'fx_shoot_e5', 'fx_applause', 'fx_fail', 'fx_flash_lighting', 'fx_transition_portal', 'fx_whirlwind'];

  function load(name) {
    if (bufs.has(name)) return bufs.get(name);
    const c = A.clips[name];
    if (!c || !ctx) { return null; }
    stats.requested++;
    const p = fetch(BASE + c.file).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
      .then(ab => new Promise((ok, no) => ctx.decodeAudioData(ab, ok, no)))
      .then(b => { bufs.set(name, b); stats.decoded++; return b; })
      .catch(() => { bufs.set(name, null); stats.failed++; return null; });
    bufs.set(name, p);
    return p;
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    sfxBus = ctx.createGain(); musicBus = ctx.createGain();
    sfxBus.gain.value = state.sfx ? 0 : 0.85; musicBus.gain.value = state.music ? 0 : 0.4;
    sfxBus.connect(ctx.destination); musicBus.connect(ctx.destination);
    return ctx;
  }

  function startSource(b, name, o) {
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = b; g.gain.value = o.vol == null ? 1 : o.vol;
    if (o.rate) s.playbackRate.value = o.rate;
    s.connect(g); g.connect(sfxBus); s.start();
    stats.played++;
  }

  // phát một tiếng. o: {vol (0..1), rate, gap (giây tối thiểu giữa hai lần cùng tiếng, mặc định 0.06)}
  function play(name, o) {
    o = o || {};
    stats.calls[name] = (stats.calls[name] || 0) + 1;   // đếm lời gọi (kể cả khi chưa mở khoá/tắt tiếng) để kiểm thử độ phủ
    if (!unlocked || !ctx || state.sfx) return false;
    const now = ctx.currentTime;
    if (now - (lastAt.get(name) || -9) < (o.gap == null ? 0.06 : o.gap)) return false;
    const b = load(name);
    if (!b) return false;
    lastAt.set(name, now);
    if (b.then) { const asked = performance.now(); b.then(x => { if (x && performance.now() - asked < 400) startSource(x, name, o); }); return true; }   // lần đầu: tiếng muộn quá 0.4 s thì bỏ
    startSource(b, name, o);
    return true;
  }

  function playMusic() {
    if (!unlocked || !ctx) return;
    const want = wantMusic;
    if (curMusic ? curMusic.name === want : !want) return;
    if (curMusic && curMusic.src) {   // tắt dần bản cũ
      const old = curMusic;
      old.g.gain.cancelScheduledValues(ctx.currentTime); old.g.gain.setValueAtTime(old.g.gain.value, ctx.currentTime); old.g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      try { old.src.stop(ctx.currentTime + 0.45); } catch (e) { /* đã dừng */ }
    }
    curMusic = null;
    if (!want) return;
    const clip = A.music[want] || want, b = load(clip);
    if (!b) return;
    const entry = { name: want, src: null, g: null };
    curMusic = entry;
    Promise.resolve(b).then(buf => {
      if (!buf || curMusic !== entry) return;
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = buf; s.loop = true; g.gain.setValueAtTime(0, ctx.currentTime); g.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.6);
      s.connect(g); g.connect(musicBus); s.start();
      entry.src = s; entry.g = g;
    });
  }

  function unlock() {
    if (unlocked) { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
    if (!ensureCtx()) return;
    unlocked = true;
    if (ctx.state === 'suspended') ctx.resume();
    PRELOAD.forEach(load);
    playMusic();
  }

  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, unlock, { passive: true }));

  TT.audio = {
    play,
    unlock,
    // tên 'battle' | 'lobby' (SK_AUDIO.music) hoặc tên clip; null = dừng
    music(name) { wantMusic = name || null; playMusic(); },
    setMuted(kind, on) {
      on = !!on;
      if (kind === 'all') { state.sfx = on; state.music = on; } else state[kind === 'music' ? 'music' : 'sfx'] = on;
      if (ctx) { sfxBus.gain.value = state.sfx ? 0 : 0.85; musicBus.gain.value = state.music ? 0 : 0.4; }
      save();
    },
    isMuted(kind) { return !!state[kind === 'music' ? 'music' : 'sfx']; },
    get unlocked() { return unlocked; },
    get music_now() { return curMusic ? curMusic.name : null; },
    stats, load,
    clips: () => Object.keys(A.clips)
  };

  // ---------------------------------------------------------------- nối sự kiện trận
  const hasClip = n => !!A.clips[n];
  const pick = (...names) => names.find(hasClip) || null;
  const mm = () => TT.M;
  // tiếng của sự kiện xảy ra tại (x,y) nhỏ dần theo khoảng cách tới người đang xem, 14 ô thì im
  function at(name, x, y, vol, o) {
    const m = mm();
    if (!name || !m) return;
    let k = 1;
    if (x != null && TT.viewerOf) { const v = TT.viewerOf(m), d = Math.hypot(v.x - x, v.y - y); k = Math.max(0, 1 - d / 14); }
    if (k < 0.05) return;
    play(name, Object.assign({ vol: (vol == null ? 1 : vol) * k }, o));
  }
  const pos = id => { const m = mm(), a = m && m.actors[id]; return a ? [a.x, a.y] : [null, null]; };

  const SKILL_CLIP = {   // tiếng riêng của từng kỹ năng: SK sfx[0] (TT_SKILLS86) nếu có, không thì byHero.skill, không thì sự kiện chung
    invisibility: 'fx_skill_c3', pray: 'fx_c11_skill_1', dodge: 'fx_skill_c2', emp: 'fx_laser_eletric',
    leap: 'fx_skill_jump', alien_swirl: 'fx_shoot_e5'
  };
  function skillClip(hero, id) {
    const bh = A.byHero[hero] && A.byHero[hero].skill;
    return pick(SKILL_CLIP[id], Array.isArray(bh) ? bh[0] : bh, A.events.skill);
  }
  TT.audio.skillClip = skillClip;

  TT.onEvent('phase', e => {
    if (e.phase === 'countdown') TT.audio.music('battle');
    else if (e.phase === 'ending') TT.audio.music(null);
  });
  TT.onEvent('attack', e => { const [x, y] = pos(e.id); at('fx_sword_wield_01', x, y, 0.8); });
  TT.onEvent('catch', e => { const [x, y] = pos(e.id); at('fx_hit', x, y, 1); at('fx_hit_p1', x, y, 0.7); });
  TT.onEvent('miss', e => at('fx_slash2', e.x, e.y, 0.35));
  TT.onEvent('down', e => { const [x, y] = pos(e.id); if (e.cause === 'zone') at('fx_hit_p1', x, y, 0.6); });
  TT.onEvent('revive', e => { const [x, y] = pos(e.id); at('fx_healing2', x, y, 0.9); });
  TT.onEvent('dead', e => { const [x, y] = pos(e.id); at('fx_dead', x, y, 1); });
  TT.onEvent('escape', e => { const [x, y] = pos(e.id); at('fx_transition_portal', x, y, 1); });
  TT.onEvent('box', e => at(e.kind === 'buff' ? 'fx_cd_ready' : 'fx_error', e.x, e.y, 0.8));
  TT.onEvent('zone', e => { if (e.step > 0) play('fx_whirlwind', { vol: 0.6, gap: 1 }); });
  TT.onEvent('scan', () => play('fx_flash_lighting', { vol: 0.8, gap: 1 }));
  TT.onEvent('gateOpen', () => play('fx_door', { vol: 1, gap: 1 }));
  TT.onEvent('transform', e => { const [x, y] = pos(e.id); at('fx_transform', x, y, 0.8); });
  TT.onEvent('skill', e => at(skillClip(e.hero, e.id), e.x, e.y, e.actor === (mm() && mm().human.id) ? 1 : 0.8));
  TT.onEvent('decoyPop', e => at('fx_hit', e.x, e.y, 0.7));
  TT.onEvent('end', r => {
    const m = mm(), win = m && r.winner === m.human.role;
    play(win ? 'fx_applause' : 'fx_fail', { vol: 1, gap: 1 });
  });

  // đếm lùi 3-2-1-GO: 'countdown' dài 8 s, đồng hồ HUD hiện 3 ở 4 s, 2 ở 5 s, 1 ở 6 s, GO ở 7 s (hud-min.js)
  TT.stepLayers.push(m => {
    if (m.phase !== 'countdown') { m._aud = null; return; }
    const sec = Math.floor(m.phaseT + 1e-6), au = m._aud || (m._aud = { sec: 3 });
    if (sec > au.sec) {
      au.sec = sec;
      if (sec >= 4 && sec <= 6) play('fx_ui_ding1', { vol: 0.9, gap: 0.3 });
      else if (sec === 7) play('fx_btn_start', { vol: 1, gap: 0.3 });
    }
  });
})();
