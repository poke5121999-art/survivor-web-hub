// Boot, shared state G, main loop, match lifecycle, and the test hooks.
(function () {
  'use strict';
  const PM = globalThis.PM, P = PM.params;
  const G = (PM.G = { bus: PM.Bus(), state: 'boot', sim: null, map: null, playerTeam: 0, simSpeed: 1, time: 0 });
  window.__G = G; window.__errors = PM.errors; window.__ready = false; window.__frames = 0;
  window.addEventListener('error', (e) => PM.errors.push('window: ' + e.message));
  window.addEventListener('unhandledrejection', (e) => PM.errors.push('promise: ' + (e.reason && e.reason.stack || e.reason)));

  const $ = (id) => document.getElementById(id);
  function fatal(msg) { const el = $('fatal'); el.style.display = 'block'; el.textContent = msg; }
  function progress(f, msg) { const b = $('boot-bar'); if (b) b.style.width = Math.round(f * 100) + '%'; const m = $('boot-msg'); if (m) m.textContent = msg; }
  const nextFrame = () => new Promise((r) => setTimeout(r, 0));

  function pickQuality() {
    if (P.q && PM.QUALITY[P.q]) return P.q;
    const saved = G.settings && G.settings.quality;
    if (saved && PM.QUALITY[saved]) return saved;
    const phone = (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 820) || /Android|iPhone|iPad/i.test(navigator.userAgent);
    return phone ? 'low' : 'medium';
  }

  const modules = [];
  function addModule(name, mod) { if (mod && mod.update) modules.push({ name, mod, broken: false }); return mod; }

  // A match owns everything that depends on the map and the sim; ending it disposes those.
  G.startMatch = function (cfg) {
    G.endMatch();
    G.matchCfg = cfg;
    G.map = PM.MAPS[cfg.map];
    G.sim = PM.Sim.create(cfg);
    G.playerTeam = cfg.playerTeam === undefined ? 0 : cfg.playerTeam;
    G.sky = PM.Sky(G, G.map.theme || PM.THEMES[cfg.map]);
    G.terrainMesh = PM.TerrainMesh(G, G.sim.terrain, G.map);
    if (PM.Scenery) G.scenery = PM.Scenery(G);
    if (PM.Units3D) G.units3d = PM.Units3D(G);
    if (PM.Fx) G.fx = PM.Fx(G);
    if (PM.Director) G.director = PM.Director(G);
    G.gfx.shadowDirty = true;
    G.state = 'playing';
    G.bus.emit('match:start', cfg);
    const a = G.sim.active;
    G.rig.focus(a.x, a.y + 6, 80, true);
  };
  G.endMatch = function () {
    if (!G.sim) return;
    for (const k of ['director', 'fx', 'units3d', 'scenery', 'terrainMesh']) { if (G[k] && G[k].dispose) G[k].dispose(); G[k] = null; }
    const keep = new Set([]);
    for (let i = G.scene.children.length - 1; i >= 0; i--) if (!keep.has(G.scene.children[i])) G.scene.remove(G.scene.children[i]);
    G.scene.environment = null;
    G.sim = null; G.sky = null;
    G.bus.emit('match:end', null);
  };

  function simFrame(dt) {
    const sim = G.sim;
    if (!sim || G.paused || (G.state !== 'playing' && G.state !== 'title')) return;
    G.acc = (G.acc || 0) + dt * G.simSpeed;
    const DT = PM.RULES.dt;
    let n = 0;
    while (G.acc >= DT && n < 12) { sim.step(); G.acc -= DT; n++; }
    if (n === 12) G.acc = 0;
    drainEvents();
  }
  function drainEvents() {
    const sim = G.sim;
    if (!sim || !sim.events.length) return;
    const evs = sim.events.splice(0, sim.events.length);
    for (const ev of evs) G.bus.emit('sim:' + ev.type, ev);
  }

  function frame(dt, noDraw) {
    G.time += dt;
    simFrame(dt);
    if (G.terrainMesh) G.terrainMesh.sync();
    if (G.sky) G.sky.update(dt);
    for (const m of modules) {
      if (m.broken) continue;
      try { m.mod.update(dt); } catch (err) { m.broken = true; PM.logError('[loop] ' + m.name + '.update threw', err); }
    }
    for (const k of ['director', 'units3d', 'fx', 'scenery']) {
      const mod = G[k];
      if (!mod || !mod.update || mod.broken) continue;
      try { mod.update(dt); } catch (err) { mod.broken = true; PM.logError('[loop] ' + k + '.update threw', err); }
    }
    G.rig.update(dt);
    G.gfx.env.fogStart = G.rig.dist + 16;
    if (!noDraw) G.gfx.render(G.scene, G.camera, dt);
    window.__frames++;
  }

  async function boot() {
    try {
      const canvas = (G.canvas = $('view'));
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) { fatal('Trình duyệt này không có WebGL2 nên Pháo Mây không chạy được. Hãy bật tăng tốc phần cứng hoặc dùng Chrome, Edge, Firefox bản mới.'); return; }
      G.THREE = window.THREE;
      G.settings = PM.store.read('phaomay.settings.v1', {});
      progress(0.1, 'Đánh thức bộ dựng hình');
      G.scene = new THREE.Scene();
      G.gfx = PM.Gfx(G);
      G.rig = PM.CameraRig(G);
      G.gfx.setQuality(pickQuality());
      G.shared = {};
      await nextFrame();
      progress(0.3, 'Nung vật liệu');
      G.bake = PM.Bake(G);
      G.bake.noise();
      for (const s of ['soil', 'rock', 'grass', 'leaf', 'wood', 'bronze', 'paint', 'steel']) { G.bake.set(s); await nextFrame(); }
      progress(0.6, 'Dựng đảo');
      if (PM.Meta) G.meta = PM.Meta(G);
      if (PM.Audio) G.audio = addModule('audio', PM.Audio.init(G));
      if (G.audio && G.settings.volume !== undefined) G.audio.setVolume(G.settings.volume);
      if (G.audio && G.settings.music !== undefined && G.audio.setMusicVolume) G.audio.setMusicVolume(G.settings.music);
      if (PM.Input) G.input = addModule('input', PM.Input(G));
      if (PM.UI) G.ui = addModule('ui', PM.UI(G));
      window.addEventListener('resize', () => G.gfx.resize());
      await nextFrame();

      const cfg = PM.matchFromParams ? PM.matchFromParams() : null;
      if (P.autostart) {
        G.demo = false;
        G.startMatch(cfg || { seed: +(P.seed || 1), map: P.map || 'doiche', first: 0, flip: false, playerTeam: 0,
          teams: [[{ kind: P.unit || 'coc', ai: P.auto ? (P.ai || 'hard') : null, items: ['heal', 'double', 'tele'] }], [{ kind: P.foe || 'chuon', ai: P.ai || 'medium', items: ['heal', 'shield', 'boost'] }]] });
      } else if (G.ui && G.ui.showTitle) G.ui.showTitle();
      progress(1, 'Sẵn sàng');
      $('boot').classList.add('done');
      if (P.manual) $('boot').style.display = 'none';

      let last = performance.now(), sm = 1 / 60;
      const manual = !!P.manual;
      if (!manual) {
        G.renderer.setAnimationLoop(() => {
          const now = performance.now(), raw = Math.min(0.1, (now - last) / 1000); last = now;
          sm += (raw - sm) * 0.2;
          G.gfx.governor(raw * 1000);
          frame(Math.min(sm, 1 / 20));
        });
      }
      // readPixels after each frame forces the GPU to finish it; without that a headless GPU queues hundreds of frames and the next screenshot times out.
      const px = new Uint8Array(4);
      window.__step = (n, dt) => { const gl = G.renderer.getContext(); for (let i = 0; i < (n || 1); i++) { frame(dt || 1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return window.__frames; };
      // Run whole frames (sim, effects, camera, HUD) without drawing, then draw one.
      window.__tick = (n, dt) => { for (let i = 0; i < n; i++) frame(dt || 1 / 60, true); window.__step(1, dt || 1 / 60); return window.__frames; };
      // Advance the match without drawing, then draw one frame.
      window.__sim = (seconds) => { const steps = Math.round(seconds / PM.RULES.dt); for (let i = 0; i < steps && G.sim && G.sim.phase !== 'over'; i++) { G.sim.step(); if (i % 4 === 0) drainEvents(); } drainEvents(); frame(1 / 60); return G.sim ? G.sim.phase : null; };
      window.__setShot = (o) => { if (typeof o === 'string') o = SHOTS[o] || SHOTS.wide; G.rig.focus(o.x, o.y, o.dist, true); G.rig.manual = 1e9; frame(1 / 60); };
      window.__fire = (o) => G.sim && G.sim.fireNow(o);
      Object.defineProperty(window, '__stats', { get() { return Object.assign(G.gfx.stats(), G.gfx.info(), { frames: window.__frames, state: G.state, phase: G.sim ? G.sim.phase : null }); } });
      frame(1 / 60); frame(1 / 60);
      window.__ready = true;
    } catch (err) {
      PM.logError('[boot] failed', err);
      fatal('Khởi động hỏng:\n' + (err && err.stack ? err.stack : err));
    }
  }
  const SHOTS = { wide: { x: 84, y: 46, dist: 190 }, left: { x: 40, y: 50, dist: 70 }, mid: { x: 86, y: 52, dist: 80 }, right: { x: 132, y: 50, dist: 70 }, close: { x: 38, y: 51, dist: 45 }, u0: { x: 36, y: 56.5, dist: 20 }, u1: { x: 134, y: 53, dist: 20 } };
  PM.SHOTS = SHOTS;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
