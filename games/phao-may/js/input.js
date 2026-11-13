// Keyboard, mouse and touch. Writes sim.input only while a human unit is acting; the AI owns it otherwise.
(function () {
  'use strict';
  const PM = globalThis.PM;
  PM.Input = function (G) {
    const held = { left: false, right: false, up: false, down: false, fire: false };
    const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'fire' };
    const humanTurn = () => { const s = G.sim; return s && G.state === 'playing' && !G.paused && s.phase === 'turn' && s.active.alive && !s.active.ai; };
    const api = { held };
    api.hold = (name, on) => { held[name] = on; if (on && G.audio) G.audio.unlock(); };
    api.act = function (name, arg) {
      const s = G.sim;
      if (name === 'pause') { if (G.ui) G.ui.togglePause(); return; }
      if (name === 'focus') { G.rig.manual = 0; return; }
      if (!humanTurn()) { G.bus.emit('ui:deny'); return; }
      let ok = false;
      if (name === 'shot') ok = s.selectShot(arg);
      else if (name === 'item') ok = s.useItem(arg);
      else if (name === 'skip') ok = s.skip();
      G.bus.emit(ok ? 'ui:click' : 'ui:deny');
    };
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (KEYS[e.code]) e.preventDefault(); return; }
      if (G.audio) G.audio.unlock();
      if (KEYS[e.code]) { held[KEYS[e.code]] = true; e.preventDefault(); }
      else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') api.act('shot', +e.code.slice(5) - 1);
      else if (e.code === 'KeyZ') api.act('item', 0); else if (e.code === 'KeyX') api.act('item', 1); else if (e.code === 'KeyC') api.act('item', 2);
      else if (e.code === 'KeyP') api.act('skip'); else if (e.code === 'KeyF') api.act('focus'); else if (e.code === 'Escape') api.act('pause');
    });
    window.addEventListener('keyup', (e) => { if (KEYS[e.code]) held[KEYS[e.code]] = false; });
    window.addEventListener('blur', () => { for (const k in held) held[k] = false; });

    const cv = G.canvas, ptrs = new Map();
    let pinch = 0;
    const perPx = () => G.rig.span(G.rig.dist).h / cv.clientHeight;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; if (G.audio) G.audio.unlock(); });
    cv.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p || !G.sim) return;
      if (ptrs.size === 1) G.rig.pan(-(e.clientX - p.x) * perPx(), (e.clientY - p.y) * perPx());
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) G.rig.zoom(pinch / d);
        pinch = d;
      }
    });
    const up = (e) => { ptrs.delete(e.pointerId); pinch = 0; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); if (G.sim) G.rig.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    api.update = function () {
      if (!humanTurn()) return;
      const inp = G.sim.input;
      inp.move = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      inp.aim = (held.up ? 1 : 0) - (held.down ? 1 : 0);
      inp.charge = held.fire;
      if (inp.move || inp.aim || inp.charge) G.rig.manual = 0;
    };
    return api;
  };
})();
