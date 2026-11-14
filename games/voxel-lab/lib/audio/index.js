// Techniques studied from Voxel Engine by mattshumer (spawn.co), analysis/audio-physical.md; code is our own.
// Public API: createAudio(opts). WebAudio-only synthesis, bank pre-rendered in small slices (doc §9, §12, §13).
import { DEFS, ORDER, renderVariant, renderIR } from './bank.js';
import { createMixer } from './mixer.js';
import { createDirector } from './director.js';

const SLICE_MS = 3; // run render tasks for at most this long before yielding to the page

export function createAudio(opts = {}) {
  const classOf = opts.classOf || (() => 'stone');
  const isLoose = opts.isLoose || (() => false);
  let ctx = null, mixer = null, director = null, started = false, failed = false, ready = false;
  let bankCpuMs = 0, bankWallMs = 0, maxSliceMs = 0, volume = 1, muted = false, bankBytes = 0, lastNow = 0;
  const bank = new Map();
  const api = { _ctx: null, _out: null };
  const worst = { ms: 0, id: '' };
  api.worst = worst;

  function applyVolume() { if (mixer) mixer.setVolume(muted ? 0 : volume); }

  // Scheduler: drives generators in slices; yields via MessageChannel (no 4 ms timer clamp)
  function renderBank(ir) {
    const ch = new MessageChannel(), tw0 = performance.now();
    const queue = [];
    for (const id of ORDER) { const d = DEFS.find((x) => x.id === id); if (d) for (let v = 0; v < d.variants; v++) queue.push([d, v]); }
    let cur = null, curDef = null, qi = 0;
    const irGen = renderIR(ctx.sampleRate);
    let irDone = false;
    function step() {
      const t0 = performance.now();
      try {
        while (performance.now() - t0 < SLICE_MS) {
          if (!irDone && qi >= 2) { // IR after the first sounds (doc render order)
            const r = irGen.next();
            if (r.done) { irDone = true; ir.ch = r.value; }
            continue;
          }
          if (!cur) {
            if (qi >= queue.length) {
              if (!irDone) { qi = 2; continue; }
              finish(); return;
            }
            [curDef] = queue[qi]; cur = renderVariant(curDef, queue[qi][1]);
          }
          const n0 = performance.now(); const r = cur.next(); const nd = performance.now() - n0; if (nd > worst.ms) { worst.ms = nd; worst.id = curDef.id + ':' + queue[qi][1]; }
          if (r.done) {
            const a = r.value, ab = ctx.createBuffer(1, a.length, curDef.sr);
            ab.copyToChannel(a, 0); bankBytes += a.length * 4;
            let e = bank.get(curDef.id);
            if (!e) { e = { variants: [], tau: curDef.tau, prio: curDef.prio }; bank.set(curDef.id, e); }
            e.variants.push(ab);
            cur = null; qi++;
          }
        }
      } catch (err) { failed = true; api.lastError = String(err && err.stack || err); return; }
      const dt = performance.now() - t0;
      bankCpuMs += dt; if (dt > maxSliceMs) maxSliceMs = dt;
      ch.port2.postMessage(0);
    }
    function finish() {
      bankCpuMs += 0;
      bankWallMs = performance.now() - tw0;
      mixer = createMixer(ctx, bank, ir.ch);
      const slow = bankCpuMs > 1200 || (typeof navigator !== 'undefined' && navigator.hardwareConcurrency <= 2);
      if (slow) mixer.setLimits(12, 4);
      director = createDirector({ mixer, classOf, isLoose, now: () => ctx.currentTime });
      api._out = mixer.out;
      if (lastL) director.setListener(...lastL);
      applyVolume();
      ready = true;
    }
    ch.port1.onmessage = step;
    ch.port2.postMessage(0);
  }

  let lastL = null;
  const ir = { ch: null };

  api.start = function start() {
    if (failed) return;
    if (started) { try { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); } catch (e) { /* ignore */ } return; }
    started = true;
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) { failed = true; return; }
      ctx = new AC({ latencyHint: 'interactive' });
      api._ctx = ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      renderBank(ir);
    } catch (e) { failed = true; ctx = null; api.lastError = String(e && e.stack || e); }
  };

  Object.defineProperty(api, 'ready', { get: () => ready && !failed });

  api.setListener = (px, py, pz, fx, fy, fz) => {
    lastL = [px, py, pz, fx, fy, fz];
    if (ready && director) director.setListener(px, py, pz, fx, fy, fz);
  };

  api.handleEvents = (events, dt) => {
    if (!ready || failed || muted || !director) return;
    try { director.handleEvents(events, dt); } catch (e) { /* never break the game loop */ }
  };

  api.setFire = (intensity, x, y, z) => { if (ready && director) { try { director.setFire(intensity, x, y, z); } catch (e) { /* ignore */ } } };
  api.setMaster = (v) => { volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1; applyVolume(); };
  api.setMuted = (m) => { muted = !!m; applyVolume(); };
  api.stats = () => ({
    voices: mixer ? mixer.voices() : 0,
    clouds: director ? director.stats().clouds : 0,
    bankMs: Math.round(bankCpuMs),
    bankWallMs: Math.round(bankWallMs),
    maxSliceMs: Math.round(maxSliceMs * 10) / 10,
    worstStep: worst.id + ' ' + Math.round(worst.ms * 10) / 10,
    bankKB: Math.round(bankBytes / 1024),
    ctxState: ctx ? ctx.state : 'none',
  });
  return api;
}
