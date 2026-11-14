// Voxel prototype audio (?vox=1): modal impacts, rubble grain clouds, debris roll, glass, creak.
// Engine = our voxel-lab WebAudio director (../../../voxel-lab/lib/audio). This file only adapts it to the game:
//  - shares the game's AudioContext (the lab asks `new AudioContext()` once in start(); we hand it ours for that call),
//  - re-routes the lab's output into our own level node (Settings volume x effects slider, tracked by wrapping
//    G.audio.setVolume / setMix, because js/audio.js exposes no bus),
//  - batches API calls into one lab event list per frame, with a token bucket per kind,
//  - renders the lab's sound bank on a ~45% duty cycle (3 ms slice every ~6 ms) so boot/play never hitches.
// Every method exists and is a no-op with ?noaudio=1, ?voxaudio=0, a missing context, or a failed lab import.
(() => {
  const BZ = window.BZ; const V = BZ && BZ.vox;
  if (!V || !V.register) return;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const fin = Number.isFinite;
  const SURF = { stone: 'stone', plaster: 'plaster', wood: 'wood', metal: 'metal', glass: 'glass', flesh: 'soft' };
  let MT = null; // voxel-lab materials table (numeric mat id -> audio class + granular flag), loaded with the lab
  const NOOP_KEYS = ['impact', 'breakAt', 'rubble', 'blast', 'detach', 'creak', 'event', 'update'];
  const mat = (s, loose) => (SURF[s] || 'stone') + (loose ? '~' : '');

  function noop(reason) {
    const api = { on: false, reason, stats: () => ({ on: false, reason }) };
    for (const k of NOOP_KEYS) api[k] = () => {};
    return api;
  }

  V.register('audio', (G) => {
    const A = G.audio;
    if (!V.want('audio')) return noop('voxaudio=0');
    if (!A || !A.ctx || (BZ.params && BZ.params.noaudio)) return noop('no audio context');
    const ctx = A.ctx;
    const api = noop(''); api.on = true; api.reason = '';
    let lab = null, started = false, failed = false, t0 = 0, clock = 0;
    let pending = []; const later = [];
    const MAXQ = 700; // events per frame handed to the director (it strides above 1024 anyway and folds the rest into grain clouds)
    let lastBlast = -9, lastBlastP = null;
    const drops = { rate: 0, far: 0, notReady: 0 };
    const out = ctx.createGain(); // lab master -> out (level) -> soft limiter -> destination
    const lim = ctx.createWaveShaper(); // linear below 0.8, tanh shoulder to 1.0: the raised level must never clip the output
    { const N = 4097, c = new Float32Array(N); for (let i = 0; i < N; i++) { const x = (i / (N - 1) * 2 - 1) * 4, a = Math.abs(x); c[i] = Math.sign(x) * (a <= 0.8 ? a : 0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2)); } lim.curve = c; }
    const trimN = ctx.createGain(); trimN.connect(out); // lab -> trimN (blast trim) -> out (level) -> limiter
    out.connect(lim); lim.connect(ctx.destination);
    const lvl = { volume: 1, sfx: 1 };
    const TRIM = 0.2;
    let KOUT = 0.3; // lab chain already soft-clips to 0.97 on its own; level set by measurement against the game's own mix
    function applyLevel() { try { out.gain.setTargetAtTime(KOUT * lvl.volume * lvl.sfx, ctx.currentTime, 0.02); } catch (e) { /* ignore */ } }
    try { const s = G.settings; if (s) { if (fin(s.volume)) lvl.volume = s.volume; if (fin(s.sfx)) lvl.sfx = clamp(s.sfx, 0, 1); } } catch (e) { /* ignore */ }
    applyLevel();
    // follow the game's own volume and effects sliders (and blur-mute, which calls setVolume(0))
    const sv = A.setVolume, sm = A.setMix;
    A.setVolume = function (v) { if (fin(v)) { lvl.volume = clamp(v, 0, 1); applyLevel(); } return sv && sv.apply(this, arguments); };
    A.setMix = function (s) { if (s && fin(s.sfx)) { lvl.sfx = clamp(s.sfx, 0, 1); applyLevel(); } return sm && sm.apply(this, arguments); };

    // per-kind token buckets: [capacity, refill per second]
    const bucketCfg = { impact: [3, 16], flesh: [2, 10], break: [4, 12], rubble: [4, 14], detach: [3, 6], creak: [1, 1.5], blast: [1, 4], raw: [60, 1200] };
    const bucket = {}; for (const k in bucketCfg) bucket[k] = { n: bucketCfg[k][0], t: 0 };
    function take(k) {
      const b = bucket[k], c = bucketCfg[k], now = performance.now() / 1000;
      b.n = Math.min(c[0], b.n + (now - b.t) * c[1]); b.t = now;
      if (b.n < 1) { drops.rate++; return false; }
      b.n -= 1; return true;
    }
    const cam = { p: null, f: null };
    function near(p, max) { // cheap far cull (the director attenuates by distance anyway)
      if (!cam.p) return true;
      const dx = p.x - cam.p.x, dy = p.y - cam.p.y, dz = p.z - cam.p.z;
      if (dx * dx + dy * dy + dz * dz > max * max) { drops.far++; return false; }
      return true;
    }
    function push(ev) { if (!lab || !lab.ready) { drops.notReady++; return; } if (pending.length < MAXQ) pending.push(ev); }
    const P3 = (p) => (p && fin(p.x) && fin(p.y) && fin(p.z) ? p : null);
    const wrap = (fn) => function () { try { fn.apply(null, arguments); } catch (e) { if (!api.err) { api.err = String(e && e.stack || e); console.error('[vox/audio] ' + api.err); } } };

    api.impact = wrap((o) => {
      const p = o && P3(o.point); if (!p || !near(p, 90)) return;
      const m = clamp(fin(o.mag) ? o.mag : 0.5, 0, 1), s = SURF[o.surface] ? o.surface : 'stone';
      if (s === 'flesh') { if (!take('flesh')) return; for (let i = 0; i < 2; i++) push({ kind: 'mobhit', x: p.x, y: p.y, z: p.z, mat: 'soft', mag: 8 + 32 * m - i * 3, a: 3 }); return; } // twice: the lab's soft thud is its quietest class
      if (!take('impact')) return;
      push({ kind: 'impact', x: p.x, y: p.y, z: p.z, mat: mat(s), mag: 40 + 2400 * m * m, a: 2 + 9 * m });
    });
    api.breakAt = wrap((o) => {
      const p = o && P3(o.point); if (!p || !near(p, 120)) return;
      const n = clamp(fin(o.n) ? o.n : 1, 1, 2000);
      if (!take('break')) return;
      if (o.surface === 'glass') push({ kind: 'glass', x: p.x, y: p.y, z: p.z, mat: 'glass', mag: n });
      else push({ kind: 'break', x: p.x, y: p.y, z: p.z, mat: mat(o.surface), mag: n });
    });
    api.rubble = wrap((o) => {
      const p = o && P3(o.point); if (!p || !near(p, 90)) return;
      if (!take('rubble')) return;
      push({ kind: 'rubble', x: p.x, y: p.y, z: p.z, mat: mat(o.surface, true), mag: clamp(fin(o.n) ? o.n : 1, 1, 200) });
    });
    api.detach = wrap((o) => {
      const p = o && P3(o.point); if (!p || !near(p, 120)) return;
      if (!take('detach')) return;
      push({ kind: 'detach', x: p.x, y: p.y, z: p.z, mat: mat(o.surface), mag: clamp(fin(o.n) ? o.n : 1, 0.2, 5000) });
    });
    api.creak = wrap((o) => {
      const p = o && P3(o.point); if (!p || !near(p, 90)) return;
      if (!take('creak')) return;
      push({ kind: 'creak', x: p.x, y: p.y, z: p.z, mat: mat(o.surface || 'wood'), mag: clamp(fin(o.ratio) ? o.ratio : 1, 0, 3), b: 0.1 });
    });
    // the game plays its own 'boom'; we add the lab's explosion layers at reduced size (so the sum stays under the game's boom),
    // then a stone burst and a rubble tail
    function blastAt(p, r, pw, fromSim) {
      if (fromSim && clock - lastBlast < 0.6 && lastBlastP && Math.abs(lastBlastP.x - p.x) + Math.abs(lastBlastP.z - p.z) < 6) return; // the game's blast() already voiced this one
      if (!take('blast')) return;
      lastBlast = clock; lastBlastP = { x: p.x, z: p.z };
      // the game's own boom already peaks ~0.8-0.9 at the destination: pull our whole branch down for the blast and its collapse, then let it recover
      try { const t = ctx.currentTime; trimN.gain.cancelScheduledValues(t); trimN.gain.setValueAtTime(TRIM, t); trimN.gain.setTargetAtTime(1, t + 0.6, 1.1); } catch (e) { /* ignore */ }
      const n = clamp(40 * r * r * pw, 40, 900), base = { x: p.x, y: p.y, z: p.z };
      push({ ...base, kind: 'explosion', mat: 'stone', mag: clamp(r * 0.55, 0.4, 8), a: pw, b: 0 });
      later.push({ at: clock + 0.12, ev: { ...base, kind: 'break', mat: 'stone', mag: n } });
      for (let i = 0; i < 6; i++) later.push({ at: clock + 0.3 + i * 0.22 + Math.random() * 0.1, ev: { ...base, x: p.x + (Math.random() - 0.5) * r, z: p.z + (Math.random() - 0.5) * r, kind: 'rubble', mat: 'stone~', mag: clamp(14 * r / (1 + i * 0.5), 3, 120) } });
    }
    api.blast = wrap((o) => {
      const p = o && P3(o.point); if (!p || !near(p, 160)) return;
      blastAt(p, clamp(fin(o.r) ? o.r : 3, 0.5, 20), clamp(fin(o.power) ? o.power : 1, 0.1, 5), false);
    });
    api.event = wrap((e) => {
      if (!e || typeof e.kind !== 'string' || !fin(e.x) || !fin(e.y) || !fin(e.z)) return;
      if (!take('raw')) return;
      let m = 'stone';
      if (typeof e.mat === 'number') { if (MT) { const i = e.mat | 0; m = (MT.audioClass[i] || 'stone') + (MT.flags[i] & MT.F.GRANULAR ? '~' : ''); } }
      else if (typeof e.mat === 'string') m = e.mat;
      if (e.kind === 'explosion') { const q = P3(e); if (q && near(q, 160)) blastAt(q, clamp(fin(e.mag) ? e.mag : 3, 0.5, 20), clamp(fin(e.a) ? e.a : 1, 0.1, 5), true); return; }
      push({ kind: e.kind, x: e.x, y: e.y, z: e.z, mag: e.mag, mat: m, a: e.a, b: e.b });
    });

    function startLab() {
      started = true;
      Promise.all([import('../../../voxel-lab/lib/audio/index.js'), import('../../../voxel-lab/lib/materials.js').catch(() => null)]).then(([mod, mt]) => {
        MT = mt;
        // the lab builds its own AudioContext inside start(); give it ours for that one synchronous call, and
        // pace its bank renderer (it yields through MessageChannel; stretch each yield to ~4 ms so the page keeps frames)
        const RealAC = globalThis.AudioContext, RealWK = globalThis.webkitAudioContext, RealMC = globalThis.MessageChannel;
        function PacedChannel() { const ch = new RealMC(); const p2 = ch.port2; const post = p2.postMessage.bind(p2); this.port1 = ch.port1; this.port2 = { postMessage: (m) => setTimeout(() => post(m), 4) }; }
        lab = mod.createAudio({ classOf: (m) => String(m).replace('~', ''), isLoose: (m) => String(m).endsWith('~') });
        try {
          globalThis.AudioContext = function () { return ctx; }; globalThis.webkitAudioContext = globalThis.AudioContext; globalThis.MessageChannel = PacedChannel;
          t0 = performance.now(); api.bankStart = t0; lab.start();
        } finally { globalThis.AudioContext = RealAC; globalThis.webkitAudioContext = RealWK; globalThis.MessageChannel = RealMC; }
        // reroute the lab's final node (it connected to ctx.destination) through our level node
        const wait = () => {
          if (lab.ready && lab._out) { try { lab._out.disconnect(); lab._out.connect(trimN); } catch (e) { failed = true; console.error('[vox/audio] reroute failed', e); } return; }
          if (lab.lastError) { failed = true; console.error('[vox/audio] lab failed: ' + lab.lastError); return; }
          setTimeout(wait, 100);
        };
        wait();
      }).catch((e) => { failed = true; console.error('[vox/audio] cannot load voxel-lab audio', e); });
    }

    let frames = 0; const fwd = { x: 0, y: 0, z: -1 };
    api.update = wrap((gdt, dt) => {
      const d = fin(dt) ? dt : 0.016;
      clock += d; frames++;
      const c = G.camera;
      if (c) {
        cam.p = c.position;
        if (c.getWorldDirection) { try { const v = fwd.v || (fwd.v = new window.THREE.Vector3()); c.getWorldDirection(v); fwd.x = v.x; fwd.y = v.y; fwd.z = v.z; } catch (e) { /* keep last */ } }
        if (lab) lab.setListener(c.position.x, c.position.y, c.position.z, fwd.x, fwd.y, fwd.z);
      }
      if (!started && !failed && frames > 60 && ctx.state !== 'closed') startLab(); // after the first second of play
      if (!lab || !lab.ready || failed) { later.length = 0; pending.length = 0; return; }
      for (let i = later.length - 1; i >= 0; i--) if (later[i].at <= clock) { push(later[i].ev); later.splice(i, 1); }
      const batch = pending; pending = [];
      lab.handleEvents(batch, clamp(d, 0.001, 0.1));
    });
    api.stats = () => ({ on: true, ready: !!(lab && lab.ready), failed, err: api.err || null, lab: lab ? lab.stats() : null, drops: { ...drops }, level: out.gain.value, bankWallMs: lab ? lab.stats().bankWallMs : 0 });
    api.setK = (k) => { if (fin(k)) { KOUT = k; applyLevel(); } };
    api._out = lim; api._lab = () => lab; api._ctx = ctx;
    return api;
  });
})();
