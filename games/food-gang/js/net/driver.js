// Keeps an online match running while its tab is hidden. A hidden tab gets no requestAnimationFrame and its
// main-thread timers are clamped to about once a second, so the engine stops calling MatchScene.update and a host would
// freeze every client. A dedicated worker's timer is not throttled, so its 60 Hz ticks drive runner.update() (wall clock,
// see MatchRunner.wallClock) while document.hidden; the engine takes over again when the tab is visible.
const TICK_MS = 16;
const SRC = `setInterval(() => postMessage(0), ${TICK_MS});`;

/** onTick(hidden) runs every TICK_MS; returns stop(). No-op where there is no document or Worker (node tests). */
export function keepAlive(onTick) {
  if (typeof document === 'undefined' || typeof Worker === 'undefined') return () => {};
  let url = null, worker = null;
  try {
    url = URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' }));
    worker = new Worker(url);
  } catch (e) {
    if (url) URL.revokeObjectURL(url);
    console.warn('[online] hidden-tab driver unavailable:', e && e.message);
    return () => {};
  }
  worker.onmessage = () => {
    try { onTick(document.hidden); } catch (e) { console.error(e); }
  };
  return () => { worker.terminate(); URL.revokeObjectURL(url); };
}
