// Tiếng + nhạc thật của Soul Knight 8.6: phát mẫu .m4a đã bóc (art/audio) theo bảng data/sk-audio.js (SK_AUDIO).
// Bảng tra: vũ khí/quái/trùm/hero theo tên prefab (byWeapon/byPrefab/byHero), sự kiện chung (events), nhạc (music).
// Chạy từ file:// thì fetch bị chặn: im lặng, không lỗi. Thiếu SK_AUDIO cũng im lặng.
(function () {
  'use strict';
  const SK = window.SK;
  const KEY = 'sk-muted';
  const BASE = 'art/audio/';
  const A = window.SK_AUDIO || null;
  const sfx = SK.sfx = {
    stats: {},          // tên clip -> số lần AudioBufferSourceNode đã start (dùng cho kiểm thử)
    ev: {},             // tên sự kiện -> số lần đã phát
    muted: false, ctx: null, errors: 0, failed: {},
    music: { want: null, cur: null },
    mode: !A ? 'no-data' : location.protocol === 'file:' ? 'file' : 'on'
  };
  try { sfx.muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* không có localStorage */ }

  let master = null, musicBus = null, btn = null;
  const bufs = {};          // clip -> AudioBuffer | null (đã thử và hỏng) ; chỉ nhạc mới bị dỡ bớt
  const loading = {};       // clip -> Promise
  const active = new Set(); // nguồn đang phát (để tắt tiếng thì dừng hết)
  const perClip = {};       // clip -> số nguồn đang phát
  const lastAt = {};        // clip -> thời điểm phát gần nhất (giây ctx)

  function ensure() {
    if (sfx.ctx) return sfx.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      const c = sfx.ctx = new AC();
      master = c.createGain(); master.gain.value = 0.7;
      const comp = c.createDynamicsCompressor();
      master.connect(comp); comp.connect(c.destination);
      musicBus = c.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
    } catch (e) { sfx.errors++; sfx.ctx = null; }
    return sfx.ctx;
  }

  function usable() { return sfx.mode === 'on' && !sfx.muted && sfx.ctx && sfx.ctx.state === 'running'; }

  function load(name) {
    if (name in bufs) return Promise.resolve(bufs[name]);
    if (loading[name]) return loading[name];
    const meta = A && A.clips[name];
    if (!meta || sfx.mode !== 'on' || !sfx.ctx) return Promise.resolve(null);
    // decodeAudioData bản có callback chạy được cả trên Safari cũ.
    loading[name] = fetch(BASE + encodeURIComponent(meta.file))
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(ab => new Promise((ok, no) => sfx.ctx.decodeAudioData(ab, ok, no)))
      .then(b => { bufs[name] = b; return b; })
      .catch(() => { bufs[name] = null; sfx.failed[name] = 1; return null; })
      .then(b => { delete loading[name]; return b; });
    return loading[name];
  }

  // Giới hạn đa âm: mỗi clip tối đa `poly` nguồn cùng lúc và cách nhau `gap` giây; toàn cục 28 nguồn.
  function play(name, ev, o) {
    if (!name || !usable()) return false;
    const b = bufs[name];
    if (b === undefined) { load(name); return false; }   // lần đầu: nạp lười, tiếng sau mới có
    if (!b) return false;
    o = o || {};
    const c = sfx.ctx, now = c.currentTime;
    const poly = o.poly || 3, gap = o.gap === undefined ? 0.03 : o.gap;
    if ((perClip[name] || 0) >= poly || now - (lastAt[name] || -9) < gap || active.size >= 28) return false;
    try {
      const s = c.createBufferSource(), g = c.createGain();
      s.buffer = b;
      if (o.jit) s.playbackRate.value = 1 + (Math.random() - 0.5) * o.jit;
      g.gain.value = o.vol === undefined ? 0.8 : o.vol;
      s.connect(g); g.connect(o.bus || master);
      perClip[name] = (perClip[name] || 0) + 1; lastAt[name] = now;
      const ref = { s, g };
      active.add(ref);
      s.onended = () => { active.delete(ref); perClip[name]--; try { g.disconnect(); } catch (e) { /* đã ngắt */ } };
      s.start(0);
      sfx.stats[name] = (sfx.stats[name] || 0) + 1;
      sfx.ev[ev] = (sfx.ev[ev] || 0) + 1;
      return true;
    } catch (e) { sfx.errors++; return false; }
  }

  const pick = v => Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v;
  const evClip = k => A && A.events[k];
  const P = id => A && A.byPrefab[id];

  // ---------------------------------------------------------------- tra tiếng
  function fireClip(w) {
    if (!A || !w) return null;
    const bw = A.byWeapon[w.id];
    if (bw && bw.fire) return bw.fire;
    const k = w.def && w.def.kind;
    return A.byKind[k] || A.byKind.gun;
  }

  // ---------------------------------------------------------------- sự kiện game
  SK.on('fire', (G, p, w) => play(fireClip(w), 'fire', { poly: 2, gap: 0.045, vol: 0.55, jit: 0.06 }));
  SK.on('enemyFire', (G, e) => { const d = e && P(e.id); play((d && d.fire) || evClip('enemyFire'), 'enemyFire', { poly: 2, gap: 0.06, vol: 0.45, jit: 0.06 }); });
  SK.on('enemyHit', (G, e, dmg, crit) => play(evClip(crit ? 'enemyCrit' : 'enemyHit'), crit ? 'enemyCrit' : 'enemyHit', { poly: 3, gap: 0.04, vol: crit ? 0.6 : 0.5, jit: 0.1 }));
  SK.on('enemyKill', (G, e) => {
    const d = e && P(e.id);
    play(pick(d && d.dead) || evClip('enemyKill'), 'enemyKill', { poly: 3, gap: 0.05, vol: 0.7, jit: 0.05 });
  });
  SK.on('playerHurt', (G, p) => {
    const h = A && p && A.byHero[p.hero];
    play((h && h.hit) || evClip('playerHurt'), 'playerHurt', { poly: 2, gap: 0.1, vol: 0.9 });
  });
  SK.on('pickup', (G, kind) => {
    const k = kind === 'coin' ? 'coin' : kind === 'hp_pot' ? 'hpPot' : kind === 'energy' || kind === 'en_pot' ? 'energy' : 'pickup';
    play(evClip(k), k, { poly: 3, gap: 0.05, vol: 0.7 });
  });
  SK.on('obstacleBreak', () => play(evClip('obstacleBreak'), 'obstacleBreak', { poly: 2, gap: 0.08, vol: 0.6 }));
  SK.on('roomLock', () => play(evClip('roomLock'), 'roomLock', { poly: 1, gap: 0.3, vol: 0.85 }));
  SK.on('roomClear', () => play(evClip('roomClear'), 'roomClear', { poly: 1, gap: 0.3, vol: 0.8 }));
  SK.on('portalEnter', () => play(evClip('portal'), 'portal', { poly: 1, gap: 0.5, vol: 0.85 }));
  SK.on('skill', (G, p) => {
    const h = A && p && A.byHero[p.hero];
    play(pick(h && h.skill) || evClip('skill'), 'skill', { poly: 1, gap: 0.15, vol: 0.85 });
  });
  SK.on('runEnd', (G, r) => { const k = r && r.won ? 'win' : 'lose'; play(evClip(k), k, { poly: 1, gap: 1, vol: 0.85 }); });
  // Chế độ mùa giải (js/season/*)
  SK.on('seasonLoot', () => play(evClip('chestOpen'), 'chestOpen', { poly: 2, gap: 0.1, vol: 0.7 }));
  SK.on('seasonUse', () => play(evClip('hpPot'), 'hpPot', { poly: 2, gap: 0.1, vol: 0.7 }));
  SK.on('seasonQuestDone', () => play(evClip('uiLevelUp'), 'uiLevelUp', { poly: 1, gap: 0.3, vol: 0.8 }));
  SK.on('seasonUpgrade', () => play(evClip('uiLevelUp'), 'uiLevelUp', { poly: 1, gap: 0.3, vol: 0.8 }));
  SK.on('seasonExtract', () => play(evClip('win'), 'win', { poly: 1, gap: 1, vol: 0.85 }));
  SK.on('seasonDeath', () => play(evClip('lose'), 'lose', { poly: 1, gap: 1, vol: 0.85 }));

  // Bấm nút trong sảnh/hộp thoại: lobby.js không có sự kiện riêng nên nghe click nổi bọt.
  addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('button');
    if (!b || b === btn) return;
    const k = b.id === 'sk-start' || b.id === 'hs-start' ? 'uiStart' : 'uiClick';
    play(evClip(k), k, { poly: 2, gap: 0.05, vol: 0.7 });
  }, true);

  // ---------------------------------------------------------------- nhạc nền
  // Nhạc chọn theo trạng thái game (thăm dò 4 lần/giây): sảnh, ải theo theme, phòng trùm đang khoá, mùa giải.
  function wantMusic() {
    const G = SK.G, M = A && A.music;
    if (!M || !G) return null;
    if (G.state === 'season') {
      const S = G.season;
      if (!S || S.map === 'base') return M.season.base;
      return S.map === 's1' ? M.season.expedition : (M.season['expedition' + String(S.map).replace(/\D/g, '')] || M.season.expedition);
    }
    if (G.state === 'stage' && G.stage) {
      const r = G.room;
      if (r && r.type === 'boss' && r.state === 'locked') return M.boss[G.stage.level] || M.boss['1'];
      return M.theme[G.stage.theme] || M.theme.forest;
    }
    if (G.state === 'lobby') return M.lobby;
    return null;   // chết / thắng: để im cho tiếng thua/thắng nổi lên
  }

  const FADE = 0.9;
  function stopMusic(m, fade) {
    if (!m) return;
    const c = sfx.ctx, t = c.currentTime;
    try {
      m.g.gain.cancelScheduledValues(t); m.g.gain.setValueAtTime(m.g.gain.value, t);
      m.g.gain.linearRampToValueAtTime(0, t + fade);
      m.s.stop(t + fade + 0.05);
    } catch (e) { /* đã dừng */ }
    m.s.onended = () => { try { m.g.disconnect(); } catch (e) { /* đã ngắt */ } };
  }

  function killAll() {
    for (const r of active) { try { r.s.onended = null; r.s.stop(); r.g.disconnect(); } catch (e) { /* đã dừng */ } }
    active.clear();
    for (const k in perClip) perClip[k] = 0;
    const m = sfx.music.cur;
    if (m) { try { m.s.onended = null; m.s.stop(); m.g.disconnect(); } catch (e) { /* đã dừng */ } }
    sfx.music.cur = null;
  }

  let musicSeq = 0;
  function tickMusic() {
    if (!usable()) return;
    const want = wantMusic(), M = sfx.music;
    M.want = want;
    // Nạp trước vũ khí đang cầm để phát phát đầu tiên đã có tiếng.
    const G = SK.G;
    if (G && G.player && G.player.weapons) for (const w of G.player.weapons) { const n = fireClip(w); if (n && !(n in bufs)) load(n); }
    const h = G && G.player && A.byHero[G.player.hero];
    if (h) for (const n of [].concat(h.skill || [], h.hit || [])) if (!(n in bufs)) load(n);
    if (G && G.enemies) for (const e of G.enemies) { const d = P(e.id); if (!d) continue; if (d.fire && !(d.fire in bufs)) load(d.fire); const dd = pick(d.dead); if (dd && !(dd in bufs)) load(dd); }
    if ((M.cur && M.cur.name) === want) return;
    if (M.cur) { stopMusic(M.cur, FADE); M.cur = null; }
    if (!want) return;
    const seq = ++musicSeq;
    load(want).then(b => {
      if (!b || seq !== musicSeq || !usable()) return;
      const c = sfx.ctx, s = c.createBufferSource(), g = c.createGain();
      s.buffer = b; s.loop = true;
      g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(1, c.currentTime + FADE);
      s.connect(g); g.connect(musicBus);
      s.start(0);
      M.cur = { name: want, s, g };
      sfx.stats[want] = (sfx.stats[want] || 0) + 1;
      sfx.ev.music = (sfx.ev.music || 0) + 1;
      // Nhạc cũ đã dừng: bỏ bộ đệm giải mã (mỗi bài ~30 MB) để khỏi ngốn RAM.
      for (const k in bufs) if (A.clips[k] && A.clips[k].music && k !== want) delete bufs[k];
    });
  }

  function preload() {
    if (!A) return;
    for (const k in A.events) load(A.events[k]);
    for (const k in A.byKind) load(A.byKind[k]);
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    if (c && !unlock.done && sfx.mode === 'on') { unlock.done = true; preload(); setInterval(tickMusic, 250); tickMusic(); }
  }
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlock, { capture: true });

  function setMuted(m) {
    sfx.muted = !!m;
    try { localStorage.setItem(KEY, sfx.muted ? '1' : '0'); } catch (e) { /* bỏ qua */ }
    if (sfx.muted) killAll(); else tickMusic();
    if (btn) { btn.textContent = sfx.muted ? '🔇' : '🔊'; btn.title = sfx.muted ? 'Bật tiếng (M)' : 'Tắt tiếng (M)'; btn.setAttribute('aria-pressed', String(sfx.muted)); }
  }
  sfx.setMuted = setMuted;
  sfx.bufCount = () => Object.keys(bufs).filter(k => bufs[k]).length;

  function mkButton() {
    btn = document.createElement('button');
    btn.id = 'sk-mute'; btn.type = 'button';
    // Trên cùng, lệch phải giữa: tránh thanh máu (trái) và bản đồ nhỏ + vàng (phải).
    btn.style.cssText = 'position:fixed;top:6px;left:62%;z-index:30;width:30px;height:26px;padding:0;border:1px solid #0009;' +
      'border-radius:6px;background:rgba(0,0,0,.45);color:#fff;font:15px/24px sans-serif;cursor:pointer;opacity:.75';
    btn.addEventListener('click', e => { e.stopPropagation(); unlock(); setMuted(!sfx.muted); btn.blur(); });
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    document.body.appendChild(btn);
    setMuted(sfx.muted);
  }
  if (document.body) mkButton(); else addEventListener('DOMContentLoaded', mkButton);

  addEventListener('keydown', e => {
    if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) setMuted(!sfx.muted);
  });
})();
