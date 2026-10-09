// Tiếng: phát theo tên event Wwise gốc (TD.AUDIO, sinh bởi tools/export_audio.py), bốn bus có công tắc riêng.
// Mọi tệp được nạp và giải mã ngay khi mở khoá âm thanh (cú chạm đầu tiên): trên Pages tải + giải mã trễ hơn
// thời lượng của tiếng ngắn, nên nạp lười thì lần phát đầu bị câm (bài học Biển Mù, commit b9a19cae).
// Bank tiếng xe gốc (Default_Vehicle.bnk) không có trong APK, nên tiếng máy được tổng hợp bằng WebAudio.
(function (TD) {
  'use strict';
  const A = {
    ctx: null, ready: false, buf: {}, loops: {}, bus: {}, engine: null,
    vol: { master: 0.9, music: 0.55, sfx: 0.9, voice: 1, engine: 0.55 },
  };

  A.unlock = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    const master = A.ctx.createGain();
    const comp = A.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(A.ctx.destination);
    A.bus.master = master;
    for (const b of ['music', 'sfx', 'voice', 'engine']) { A.bus[b] = A.ctx.createGain(); A.bus[b].connect(master); }
    A.applySettings();
    A.preload();
  };

  A.applySettings = function () {
    if (!A.ctx) return;
    const s = (TD.save && TD.save.d && TD.save.d.settings) || {};
    const t = A.ctx.currentTime;
    A.bus.master.gain.setTargetAtTime(A.vol.master, t, 0.02);
    A.bus.music.gain.setTargetAtTime(s.music === false ? 0 : A.vol.music, t, 0.05);
    const sfx = s.sfx === false ? 0 : 1;
    A.bus.sfx.gain.setTargetAtTime(A.vol.sfx * sfx, t, 0.02);
    A.bus.voice.gain.setTargetAtTime(A.vol.voice * sfx, t, 0.02);
    A.bus.engine.gain.setTargetAtTime(A.vol.engine * sfx, t, 0.02);
  };

  A.preload = function () {
    const files = new Set();
    for (const k in TD.AUDIO || {}) for (const f of TD.AUDIO[k].files) files.add(f);
    A.total = files.size; A.loaded = 0;
    return Promise.all([...files].map((f) => fetch(f + '?v=' + (TD.REV || ''))
      .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
      .then((b) => A.ctx.decodeAudioData(b))
      .then((d) => { A.buf[f] = d; A.loaded++; })
      .catch((e) => console.warn('audio: không nạp được ' + f, e.message))))
      .then(() => { A.ready = true; });
  };

  function pick(ev) {
    const e = TD.AUDIO && TD.AUDIO[ev];
    if (!e || !e.files.length) return null;
    const f = e.files[(Math.random() * e.files.length) | 0];
    return A.buf[f] ? { e, b: A.buf[f] } : null;
  }

  // opt: { vol, rate, pan, jitter } ; jitter = độ lệch cao độ ngẫu nhiên để tiếng lặp không đều đều.
  A.play = function (ev, opt) {
    if (!A.ctx) return null;
    const p = pick(ev);
    if (!p) return null;
    opt = opt || {};
    const src = A.ctx.createBufferSource();
    src.buffer = p.b;
    src.loop = !!p.e.loop;
    src.playbackRate.value = (opt.rate || 1) * (1 + (opt.jitter || 0) * (Math.random() * 2 - 1));
    const g = A.ctx.createGain();
    g.gain.value = (p.e.vol == null ? 1 : p.e.vol) * (opt.vol == null ? 1 : opt.vol);
    let node = g;
    if (opt.pan && A.ctx.createStereoPanner) {
      const pn = A.ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, opt.pan)); g.connect(pn); node = pn;
    }
    node.connect(A.bus[p.e.bus] || A.bus.sfx);
    src.connect(g);
    src.start();
    return { src, g };
  };

  // Tiếng lặp có tên (lốp rít khi drift, gió khi phun): bật/tắt mượt, không chồng hai bản.
  A.loop = function (key, ev, on, vol) {
    if (!A.ctx) return;
    let l = A.loops[key];
    const t = A.ctx.currentTime;
    if (on) {
      if (!l) {
        const h = A.play(ev, { vol: 0 });
        if (!h) return;
        h.src.loop = true;
        l = A.loops[key] = h;
      }
      l.g.gain.setTargetAtTime(vol == null ? 1 : vol, t, 0.04);
    } else if (l) {
      l.g.gain.setTargetAtTime(0, t, 0.08);
      const s = l.src;
      setTimeout(() => { try { s.stop(); } catch (e) { /* đã dừng */ } }, 400);
      delete A.loops[key];
    }
  };

  A.stopAll = function () {
    for (const k of Object.keys(A.loops)) A.loop(k, null, false);
    A.music(null);
    A.engineStop();
    if (A._skid) A._skid.out.gain.setTargetAtTime(0, A.ctx.currentTime, 0.05);
  };

  A.music = function (ev) {
    if (!A.ctx) return;
    if (A._music) {
      const m = A._music; m.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.4);
      setTimeout(() => { try { m.src.stop(); } catch (e) { /* đã dừng */ } }, 2000);
      A._music = null;
    }
    if (ev) { A._music = A.play(ev); if (A._music) A._music.src.loop = true; }
  };

  // Tiếng máy tổng hợp: hai sóng răng cưa lệch nhau (tiếng "rè" của máy kart nhỏ) + nhiễu lọc, qua lọc thông thấp.
  // Vòng tua đi theo tốc độ qua 5 số; lên số thì tua tụt, nghe ra nhịp tăng tốc thay vì một nốt trượt dài.
  A.engineStart = function () {
    if (!A.ctx || A.engine) return;
    const c = A.ctx, out = c.createGain(); out.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 3;
    const o1 = c.createOscillator(); o1.type = 'sawtooth';
    const o2 = c.createOscillator(); o2.type = 'sawtooth';
    const o3 = c.createOscillator(); o3.type = 'square';
    const g1 = c.createGain(); g1.gain.value = 0.35;
    const g2 = c.createGain(); g2.gain.value = 0.25;
    const g3 = c.createGain(); g3.gain.value = 0.12;
    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const ns = c.createBufferSource(); ns.buffer = nb; ns.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1400; nf.Q.value = 0.8;
    const ng = c.createGain(); ng.gain.value = 0.06;
    o1.connect(g1); o2.connect(g2); o3.connect(g3); g1.connect(lp); g2.connect(lp); g3.connect(lp);
    ns.connect(nf); nf.connect(ng); ng.connect(out);
    lp.connect(out); out.connect(A.bus.engine);
    o1.start(); o2.start(); o3.start(); ns.start();
    A.engine = { out, lp, o1, o2, o3, ng, nf, rpm: 0.15 };
  };

  A.engineStop = function () {
    const e = A.engine;
    if (!e) return;
    e.out.gain.setTargetAtTime(0, A.ctx.currentTime, 0.1);
    setTimeout(() => { for (const o of [e.o1, e.o2, e.o3]) try { o.stop(); } catch (x) { /* đã dừng */ } }, 500);
    A.engine = null;
  };

  // kmh: tốc độ hiển thị; load 0..1 (ga), boost 0..1 (đang phun).
  A.engineUpdate = function (kmh, load, boost, dt) {
    const e = A.engine;
    if (!e) return;
    const gears = [0, 45, 85, 125, 165, 210, 400];
    let gi = 1;
    while (gi < gears.length - 1 && kmh > gears[gi]) gi++;
    const lo = gears[gi - 1], hi = gears[gi];
    const frac = Math.max(0, Math.min(1, (kmh - lo) / (hi - lo)));
    const target = gi === 1 ? 0.15 + 0.85 * frac : 0.45 + 0.55 * frac;
    e.rpm += (target - e.rpm) * Math.min(1, dt * 10);
    const f = 55 + e.rpm * 150 + boost * 25;
    const t = A.ctx.currentTime;
    e.o1.frequency.setTargetAtTime(f, t, 0.03);
    e.o2.frequency.setTargetAtTime(f * 1.505, t, 0.03);
    e.o3.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    e.lp.frequency.setTargetAtTime(500 + e.rpm * 1700 + load * 600 + boost * 900, t, 0.05);
    e.nf.frequency.setTargetAtTime(900 + e.rpm * 1500, t, 0.05);
    e.ng.gain.setTargetAtTime(0.03 + 0.05 * load + 0.08 * boost, t, 0.05);
    e.out.gain.setTargetAtTime(0.28 + 0.22 * load + 0.15 * boost, t, 0.05);
  };

  // Lốp rít khi drift: không bank nào trong APK có tiếng này (TD.AUDIO_MISSING có Play_Tire_friction), nên tổng hợp từ
  // nhiễu qua hai lọc băng hẹp cộng hưởng; cao độ nhích theo tốc độ và góc trượt để rít "căng" hơn khi bẻ gắt.
  A.skid = function (amount, kmh) {
    if (!A.ctx) return;
    const c = A.ctx;
    if (!A._skid) {
      const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const ns = c.createBufferSource(); ns.buffer = nb; ns.loop = true;
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 18; f1.frequency.value = 1300;
      const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 12; f2.frequency.value = 2650;
      const g1 = c.createGain(); g1.gain.value = 1.6; const g2 = c.createGain(); g2.gain.value = 0.7;
      const out = c.createGain(); out.gain.value = 0;
      const lfo = c.createOscillator(); lfo.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 60;
      lfo.connect(lg); lg.connect(f1.frequency); lfo.start();
      ns.connect(f1); ns.connect(f2); f1.connect(g1); f2.connect(g2); g1.connect(out); g2.connect(out);
      out.connect(A.bus.sfx); ns.start();
      A._skid = { out, f1, f2 };
    }
    const s = A._skid, t = c.currentTime;
    s.f1.frequency.setTargetAtTime(1050 + kmh * 2.2 + amount * 250, t, 0.05);
    s.f2.frequency.setTargetAtTime(2300 + kmh * 3 + amount * 400, t, 0.05);
    s.out.gain.setTargetAtTime(amount * 0.55, t, amount > 0 ? 0.03 : 0.09);
  };

  TD.audio = A;
})(globalThis.TD = globalThis.TD || {});
