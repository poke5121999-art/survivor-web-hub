// Phones (owner report 2026-11-02, "the game does not fill the screen"): the canvas already covers the whole viewport
// (any aspect: the camera widens horizontally), but in landscape the browser's address / navigation bars eat a large
// share of the height. The first tap of a touch device asks for real fullscreen (the bars go away) and a landscape
// lock; after the player leaves fullscreen (back gesture, app switch) the next tap asks again, at most every 3 s.
// iPhone Safari has no element fullscreen: there "Add to Home Screen" (apple-mobile-web-app-capable) is the way.
export function installFullscreen(target = document.documentElement) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const req = target.requestFullscreen || target.webkitRequestFullscreen;
  const state = { coarse, supported: !!req, requests: 0, granted: 0, last: 0, error: null };
  window.fgFullscreen = state;
  if (!coarse || !req) return state;
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const ask = () => {
    if (isFull() || performance.now() - state.last < 3000) return;
    state.last = performance.now();
    state.requests++;
    let p;
    try { p = req.call(target, { navigationUI: 'hide' }); } catch (e) { state.error = String(e && e.message || e); return; }
    Promise.resolve(p).then(() => {
      state.granted++;
      const o = screen.orientation;
      if (o && o.lock) o.lock('landscape').catch(() => { /* not allowed on this device */ });
    }).catch((e) => { state.error = String(e && e.message || e); });
  };
  // pointerup / touchend count as user activation for requestFullscreen
  window.addEventListener('pointerup', ask, { passive: true });
  window.addEventListener('touchend', ask, { passive: true });
  return state;
}
