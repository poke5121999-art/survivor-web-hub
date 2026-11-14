// Techniques studied from Voxel Engine by mattshumer (spawn.co), analysis/audio-physical.md; code is our own.
// Fixed Web Audio graph + voice pool with priority stealing, master chain, blast ducking (doc §10).

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const fin = (x, d) => (Number.isFinite(x) ? x : d);

const SMALL = 24, BIG = 8, STEAL_MARGIN = 1.25, STEAL_FADE = 0.004, AUDIBLE = 0.002;
const MAX_STARTS = 6, QUEUE_MAX = 48, QUEUE_AGE = 0.1;

function softClipCurve() { // linear under 0.7, tanh shoulder to 0.97; domain +-4 (doc §10.4)
  const N = 8193, c = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1) * 2 - 1) * 4, a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= 0.7 ? a : 0.7 + 0.27 * Math.tanh((a - 0.7) / 0.27));
  }
  return c;
}

export function createMixer(ctx, bank, irChannels) {
  // ---- master chain: sfx -> master -> compressor -> pre 1/4 -> soft clip -> volume -> out
  const sfx = ctx.createGain(); sfx.gain.value = 1.1;
  const master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
  const pre = ctx.createGain(); pre.gain.value = 0.25;
  const shaper = ctx.createWaveShaper(); shaper.curve = softClipCurve();
  const vol = ctx.createGain(); vol.gain.value = 1;
  sfx.connect(master); master.connect(comp); comp.connect(pre); pre.connect(shaper); shaper.connect(vol);
  vol.connect(ctx.destination);

  // ---- small bus (ducked + muffled) and big bus (un-ducked)
  const smallBus = ctx.createGain();
  const muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.5;
  const duck = ctx.createGain();
  smallBus.connect(muffle); muffle.connect(duck); duck.connect(sfx);
  const bigBus = ctx.createGain(); bigBus.connect(sfx);

  // ---- reverb send (procedural IR)
  const revIn = ctx.createGain();
  let conv = null;
  if (irChannels) {
    const ib = ctx.createBuffer(2, irChannels[0].length, ctx.sampleRate);
    ib.copyToChannel(irChannels[0], 0); ib.copyToChannel(irChannels[1], 1);
    conv = ctx.createConvolver(); conv.normalize = false; conv.buffer = ib;
    const wet = ctx.createGain(); wet.gain.value = 0.8;
    revIn.connect(conv); conv.connect(wet); wet.connect(duck);
  }

  // ---- voices
  const caps = { small: SMALL, big: BIG };
  const pools = { small: [], big: [] };
  let queue = [], startsThisFrame = 0, lastPick = {};

  function score(v, now) { return v.score * Math.exp(-(now - v.t0) / Math.max(0.02, v.tau / v.rate)); }

  function release(v) {
    const pool = v.big ? pools.big : pools.small, i = pool.indexOf(v);
    if (i >= 0) pool.splice(i, 1);
    try { v.src.disconnect(); v.lp.disconnect(); v.g.disconnect(); v.pan.disconnect(); if (v.send) v.send.disconnect(); } catch (e) { /* ignore */ }
  }

  function start(p, now) {
    const entry = bank.get(p.id);
    if (!entry) return false;
    const gain = fin(p.gain, 0), rate = clamp(fin(p.rate, 1), 0.25, 4);
    if (!(gain >= AUDIBLE)) return false;
    const big = !!p.big, pool = big ? pools.big : pools.small, sc = gain * fin(p.prio, 1);
    if (pool.length >= (big ? caps.big : caps.small)) {
      let q = null, qs = Infinity;
      for (const v of pool) { const s = score(v, now); if (s < qs) { qs = s; q = v; } }
      if (!q || !(sc > qs * STEAL_MARGIN)) return false;
      try { q.g.gain.cancelScheduledValues(now); q.g.gain.setValueAtTime(q.g.gain.value, now); q.g.gain.linearRampToValueAtTime(0, now + STEAL_FADE); q.src.stop(now + STEAL_FADE + 0.001); } catch (e) { /* ignore */ }
      pool.splice(pool.indexOf(q), 1);
      setTimeout(() => release(q), 30);
    }
    // variant pick, avoiding the previous one
    const nv = entry.variants.length;
    let vi = (Math.random() * nv) | 0;
    if (nv > 1 && lastPick[p.id] === vi) vi = (vi + 1) % nv;
    lastPick[p.id] = vi;
    const buffer = entry.variants[vi];
    const src = ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = rate;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = clamp(fin(p.cutoff, 20000), 60, 20000);
    const g = ctx.createGain(); g.gain.value = gain;
    const pan = ctx.createStereoPanner(); pan.pan.value = clamp(fin(p.pan, 0), -0.8, 0.8);
    src.connect(lp); lp.connect(g); g.connect(pan); pan.connect(big ? bigBus : smallBus);
    let send = null;
    if (conv && p.send > 0.01) { send = ctx.createGain(); send.gain.value = clamp(p.send, 0, 1); pan.connect(send); send.connect(revIn); }
    const v = { src, lp, g, pan, send, big, score: sc, t0: now, tau: entry.tau, rate };
    pool.push(v);
    src.onended = () => release(v);
    try { src.start(now + clamp(fin(p.delay, 0), 0, 3)); } catch (e) { release(v); return false; }
    return true;
  }

  return {
    out: vol, // final output node (tap for measurement)
    submit(p, ctxNow) { // queued; at most MAX_STARTS per frame (big voices exempt), overflow parked
      p.t = ctxNow;
      if (queue.length < QUEUE_MAX) queue.push(p);
    },
    flush(now) {
      startsThisFrame = 0;
      const rest = [];
      for (const p of queue) {
        if (now - p.t > QUEUE_AGE) continue;
        if (!p.big && startsThisFrame >= MAX_STARTS) { rest.push(p); continue; }
        if (start(p, now)) startsThisFrame++;
      }
      queue = rest;
    },
    createLoop(id, big) { // continuous drone: returns {set(gain, cutoff, rate, pan), stop()}
      const entry = bank.get(id);
      if (!entry) return null;
      const src = ctx.createBufferSource(); src.buffer = entry.variants[0]; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000;
      const g = ctx.createGain(); g.gain.value = 0;
      const pan = ctx.createStereoPanner();
      src.connect(lp); lp.connect(g); g.connect(pan); pan.connect(big ? bigBus : smallBus);
      src.start();
      return {
        set(gain, cutoff, rate, pn) {
          const t = ctx.currentTime;
          g.gain.setTargetAtTime(fin(gain, 0), t, 0.07);
          lp.frequency.setTargetAtTime(clamp(fin(cutoff, 20000), 60, 20000), t, 0.07);
          src.playbackRate.setTargetAtTime(clamp(fin(rate, 1), 0.25, 4), t, 0.1);
          pan.pan.setTargetAtTime(clamp(fin(pn, 0), -0.8, 0.8), t, 0.1);
        },
        stop() { try { src.stop(); src.disconnect(); lp.disconnect(); g.disconnect(); pan.disconnect(); } catch (e) { /* ignore */ } },
      };
    },
    // blast ducking + muffle (doc §10.5); depth 0..1 arriving `delay` s from now
    blast(depth, delay = 0) {
      depth = clamp(fin(depth, 0), 0, 0.85);
      if (depth <= 0) return;
      const t = ctx.currentTime + clamp(delay, 0, 3), rec = 0.5 + 1.4 * depth;
      const floor = 1 - 0.8 * depth, cut = 20000 * Math.pow(1 - 0.9 * depth, 3) + 250;
      try {
        duck.gain.cancelScheduledValues(t);
        duck.gain.setTargetAtTime(floor, t, 0.008);
        duck.gain.setTargetAtTime(1, t + 0.03, rec / 3);
        muffle.frequency.cancelScheduledValues(t);
        muffle.frequency.setTargetAtTime(cut, t, 0.008);
        muffle.frequency.setValueAtTime(cut, t + 0.03);
        muffle.frequency.exponentialRampToValueAtTime(20000, t + 0.03 + 1.2 * rec);
      } catch (e) { /* ignore */ }
    },
    setVolume(v) { try { vol.gain.setTargetAtTime(clamp(fin(v, 1), 0, 1), ctx.currentTime, 0.05); } catch (e) { /* ignore */ } },
    setLimits(small, big) { caps.small = small; caps.big = big; },
    voices() { return pools.small.length + pools.big.length; },
  };
}
