// Tiếng tổng hợp bằng WebAudio, nghe sự kiện SK.on(...). Bản rip không có âm thanh nên tất cả tự tạo.
(function () {
  'use strict';
  const SK = window.SK;
  const KEY = 'sk-muted';
  const sfx = SK.sfx = { stats: {}, muted: false, ctx: null, errors: 0 };
  try { sfx.muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* không có localStorage */ }

  let master = null, noiseBuf = null, btn = null;
  const last = {};   // giới hạn tần suất theo tên: [thời điểm cửa sổ, số lần]

  function ensure() {
    if (sfx.ctx) return sfx.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      const c = sfx.ctx = new AC();
      master = c.createGain(); master.gain.value = 0.5;
      const comp = c.createDynamicsCompressor();
      master.connect(comp); comp.connect(c.destination);
      noiseBuf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { sfx.errors++; sfx.ctx = null; }
    return sfx.ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlock, { capture: true });

  function env(g, t, a, dur, vol) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  // tone = dao động có trượt tần số; noise = ồn trắng qua bộ lọc.
  function tone(type, f0, f1, dur, vol, delay) {
    const c = sfx.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.004, dur, vol);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(ftype, f0, f1, dur, vol, delay, q) {
    const c = sfx.ctx, t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; f.type = ftype; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.003, dur, vol);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.2); s.stop(t + dur + 0.02);
  }
  const jit = () => 1 + (Math.random() - 0.5) * 0.12;

  // tên -> [số lần tối đa, trong cửa sổ giây]
  const LIMIT = { fire: [4, 0.05], eFire: [2, 0.06], hit: [3, 0.05], kill: [3, 0.08], hurt: [2, 0.1],
    coin: [3, 0.06], energy: [2, 0.08], pot: [1, 0.1], brk: [2, 0.08], lock: [1, 0.3], clear: [1, 0.3],
    stage: [1, 0.5], skill: [1, 0.15], end: [1, 1] };

  function play(name, fn) {
    if (sfx.muted) return;
    const c = sfx.ctx;
    if (!c || c.state !== 'running') return;
    const now = c.currentTime, L = LIMIT[name] || [4, 0.05], s = last[name] || (last[name] = [0, 0]);
    if (now - s[0] > L[1]) { s[0] = now; s[1] = 0; }
    if (s[1] >= L[0]) return;
    s[1]++;
    try { fn(); sfx.stats[name] = (sfx.stats[name] || 0) + 1; }
    catch (e) { sfx.errors++; }
  }

  const FIRE = {
    gun() { tone('square', 520 * jit(), 140, 0.08, 0.22); noise('bandpass', 2400, 900, 0.05, 0.16); },
    smg() { tone('square', 700 * jit(), 300, 0.035, 0.14); noise('highpass', 3000, 3000, 0.025, 0.1); },
    shotgun() { noise('lowpass', 2200, 300, 0.22, 0.5); tone('sawtooth', 160, 45, 0.18, 0.3); },
    staff() { tone('sine', 900 * jit(), 1500, 0.14, 0.2); tone('triangle', 450, 750, 0.14, 0.12); },
    laser() { tone('sawtooth', 1800 * jit(), 250, 0.16, 0.14); },
    bow() { tone('triangle', 330 * jit(), 180, 0.1, 0.24); noise('bandpass', 1400, 600, 0.09, 0.14, 0.02, 3); },
    melee() { noise('bandpass', 500, 2600, 0.14, 0.32, 0, 1.5); },
    launcher() { tone('square', 200, 60, 0.2, 0.25); noise('lowpass', 900, 200, 0.16, 0.3); }
  };
  function fireKind(w) {
    const d = (w && w.def) || {}, k = d.kind;
    if (k === 'gun') return (d.pellets || 1) > 1 ? 'shotgun' : (d.rps || 0) >= 6 ? 'smg' : 'gun';
    return FIRE[k] ? k : 'gun';
  }

  SK.on('fire', (G, p, w) => play('fire', FIRE[fireKind(w)]));
  SK.on('enemyFire', () => play('eFire', () => { tone('triangle', 360 * jit(), 200, 0.08, 0.1); noise('bandpass', 1200, 700, 0.05, 0.06); }));
  SK.on('enemyHit', (G, e, dmg, crit) => play('hit', () => {
    if (crit) { tone('square', 1100, 1700, 0.07, 0.14); noise('highpass', 4000, 4000, 0.05, 0.14); }
    else { tone('sine', 190 * jit(), 90, 0.07, 0.24); noise('lowpass', 1200, 400, 0.05, 0.12); }
  }));
  SK.on('enemyKill', () => play('kill', () => { tone('square', 420 * jit(), 70, 0.2, 0.2); noise('lowpass', 1800, 250, 0.2, 0.25); }));
  SK.on('playerHurt', (G, p) => play('hurt', () => {
    // Còn giáp sau đòn = kim loại; hết giáp bị trừ máu = nặng hơn.
    if (p && p.armor > 0) { tone('square', 1500, 900, 0.1, 0.16); tone('square', 2250, 1350, 0.1, 0.1); noise('highpass', 5000, 5000, 0.06, 0.12); }
    else { tone('sawtooth', 240, 60, 0.3, 0.32); noise('lowpass', 900, 150, 0.26, 0.35); }
  }));
  SK.on('pickup', (G, kind) => {
    if (kind === 'coin') play('coin', () => { const f = 1300 * jit(); tone('square', f, f, 0.05, 0.12); tone('square', f * 1.5, f * 1.5, 0.09, 0.12, 0.05); });
    else if (kind === 'energy') play('energy', () => { tone('sine', 500, 1100, 0.14, 0.2); tone('triangle', 1000, 2200, 0.14, 0.08); });
    else play('pot', () => { tone('sine', 520, 520, 0.09, 0.2); tone('sine', 660, 660, 0.09, 0.2, 0.08); tone('sine', 880, 880, 0.16, 0.2, 0.16); });
  });
  SK.on('obstacleBreak', () => play('brk', () => { noise('bandpass', 1800, 500, 0.16, 0.4, 0, 2); tone('square', 260, 90, 0.08, 0.16); noise('highpass', 3500, 3500, 0.06, 0.15, 0.05); }));
  SK.on('roomLock', () => play('lock', () => { tone('sawtooth', 110, 45, 0.3, 0.4); noise('lowpass', 700, 120, 0.28, 0.45); tone('square', 1400, 900, 0.05, 0.12, 0.02); }));
  SK.on('roomClear', () => play('clear', () => {
    noise('bandpass', 300, 900, 0.3, 0.2, 0, 1);
    [784, 988, 1319].forEach((f, i) => tone('triangle', f, f, 0.22, 0.2, 0.18 + i * 0.09));
  }));
  // Đi qua cổng sang ải mới phát ra stageEnter, nên whoosh này cũng là tiếng cổng.
  SK.on('stageEnter', () => play('stage', () => { noise('bandpass', 200, 3000, 0.7, 0.3, 0, 0.8); tone('sine', 150, 500, 0.6, 0.12); }));
  SK.on('skill', () => play('skill', () => { tone('sawtooth', 200, 900, 0.25, 0.2); tone('square', 400, 1800, 0.25, 0.08); noise('bandpass', 800, 3000, 0.25, 0.15); }));
  SK.on('runEnd', (G, r) => play('end', () => {
    const won = !!(r && r.won), seq = won ? [523, 659, 784, 1047, 1319] : [392, 330, 262, 196];
    seq.forEach((f, i) => tone(won ? 'triangle' : 'sawtooth', f, f, won ? 0.3 : 0.4, won ? 0.22 : 0.18, i * (won ? 0.11 : 0.22)));
  }));

  function setMuted(m) {
    sfx.muted = !!m;
    try { localStorage.setItem(KEY, sfx.muted ? '1' : '0'); } catch (e) { /* bỏ qua */ }
    if (btn) { btn.textContent = sfx.muted ? '🔇' : '🔊'; btn.title = sfx.muted ? 'Bật tiếng (M)' : 'Tắt tiếng (M)'; btn.setAttribute('aria-pressed', String(sfx.muted)); }
  }
  sfx.setMuted = setMuted;

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
