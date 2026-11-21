// ?perf=1: a small readout in the bottom-left corner (the HUD leaves it empty) so the owner can watch the cost on a real
// phone: frames per second, draw calls, triangles and monsters alive, refreshed twice a second. A plain DOM element over
// the canvas with its own requestAnimationFrame counter; without the parameter nothing is created.
export function createPerf(game, frame, params) {
  if (!params || !params.perf || params.perf === '0') return null;
  const el = document.createElement('div');
  el.id = 'perf';
  el.style.cssText = 'position:absolute;left:6px;bottom:6px;z-index:9999;pointer-events:none;padding:3px 6px;border-radius:4px;'
    + 'background:rgba(0,0,0,.62);color:#b8ff9a;font:600 11px/1.3 ui-monospace,monospace;white-space:pre;';
  frame.appendChild(el);
  let n = 0; let t0 = performance.now(); let worst = 0; let prev = t0;
  function tick(now) {
    n++; worst = Math.max(worst, now - prev); prev = now;
    if (now - t0 >= 500) {
      const fps = (n * 1000) / (now - t0); const s = window.__stats || {}; const B = game.B;
      const alive = B ? B.enemies.reduce((k, e) => k + (e.alive ? 1 : 0), 0) : 0;
      el.textContent = `${fps.toFixed(0)} fps  max ${worst.toFixed(0)} ms\n${s.draws || 0} draws  ${((s.tris || 0) / 1000).toFixed(0)}k tris\n${alive} quái`;
      n = 0; t0 = now; worst = 0;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return el;
}
