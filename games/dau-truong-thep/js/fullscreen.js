// Page fullscreen for touch devices, the visual-viewport size that the renderer and the CSS follow, and the iOS "add to home screen" hint.
// iPhone Safari has no page fullscreen: there `supported` is false and the web app manifest does the job once installed.

const HINT_KEY = 'dtt.a2hs.v1';

export function makeFullscreen(G) {
  const de = document.documentElement, vv = window.visualViewport;
  const reqFn = de.requestFullscreen || de.webkitRequestFullscreen;
  const iphone = /iPhone|iPod/.test(navigator.userAgent);
  const ios = iphone || /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const supported = !!reqFn && !iphone;
  const touch = matchMedia('(pointer: coarse)').matches;
  const listeners = [];
  // After the player leaves fullscreen we stop grabbing it on every tap and only re-enter when a match starts or resumes.
  let left = false, wantAuto = true;

  const elem = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  let pending = null;
  async function request() {
    try {
      const p = reqFn.call(de, { navigationUI: 'hide' });
      if (p && p.then) await p;
    } catch (err) { api.lastError = String(err && err.message || err); return false; }
    lock();
    return true;
  }
  const api = {
    supported,
    get active() { return !!elem(); },
    async enter() {
      if (!supported || elem()) return false;
      // pointerup and the click that follows it are one tap: share the request.
      if (pending) return pending;
      return (pending = request().finally(() => { pending = null; }));
    },
    async exit() {
      if (!elem()) return;
      left = true;
      try { const f = document.exitFullscreen || document.webkitExitFullscreen; const p = f.call(document); if (p && p.then) await p; } catch (err) { api.lastError = String(err && err.message || err); }
    },
    toggle() { return elem() ? api.exit() : (left = false, api.enter()); },
    onchange(fn) { listeners.push(fn); },
    lastError: null,
  };

  function lock() {
    try { const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (p && p.catch) p.catch(() => {}); } catch (err) { /* desktop and iOS refuse */ }
  }

  // Auto entry runs inside the gesture that triggered it; a failed attempt is not retried until the next gesture.
  function auto() {
    if (!supported || !touch || !wantAuto || elem()) return;
    api.enter().then((ok) => { if (ok) left = false; });
  }
  const tap = (e) => { if (!left && (e.type === 'click' || e.pointerType === 'touch' || e.pointerType === 'pen')) auto(); };
  addEventListener('pointerup', tap, true); addEventListener('click', tap, true);
  G.bus.on('ui:play', auto);
  G.bus.on('ui:pause', (p) => { if (p && !p.paused) auto(); });

  function fsChange() {
    if (!elem()) { if (document.visibilityState !== 'hidden') left = true; try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (err) { /* not locked */ } }
    for (const fn of listeners) { try { fn(api.active); } catch (err) { console.error(err); } }
    viewportChanged();
  }
  document.addEventListener('fullscreenchange', fsChange); document.addEventListener('webkitfullscreenchange', fsChange);

  // Viewport size: CSS variables for the stylesheets and a callback for the renderer. Orientation and fullscreen changes report stale sizes for a moment, so they are re-read later.
  const vpFns = [];
  const size = () => ({ w: vv ? vv.width : innerWidth, h: vv ? vv.height : innerHeight });
  function viewportChanged() {
    const s = size();
    de.style.setProperty('--vvw', s.w + 'px'); de.style.setProperty('--vvh', s.h + 'px');
    for (const fn of vpFns) { try { fn(s); } catch (err) { console.error(err); } }
  }
  const later = () => { viewportChanged(); requestAnimationFrame(viewportChanged); setTimeout(viewportChanged, 300); };
  api.size = size;
  api.onviewport = (fn) => { vpFns.push(fn); };
  if (vv) { vv.addEventListener('resize', viewportChanged); vv.addEventListener('scroll', viewportChanged); }
  addEventListener('resize', viewportChanged); addEventListener('orientationchange', later);
  if (screen.orientation) screen.orientation.addEventListener('change', later);
  document.addEventListener('fullscreenchange', later);
  viewportChanged();

  // iOS: a one-time, dismissible hint on the menu while the page runs in a normal Safari tab.
  const standalone = navigator.standalone === true || matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
  let seen = false; try { seen = !!localStorage.getItem(HINT_KEY); } catch (err) { /* private mode */ }
  if (ios && !supported && !standalone && !seen) {
    const box = document.createElement('div');
    box.id = 'a2hs-hint'; box.setAttribute('role', 'note');
    box.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:max(8px,env(safe-area-inset-top));z-index:55;max-width:min(520px,70vw);box-sizing:border-box;padding:8px 36px 8px 12px;background:rgba(10,18,12,.92);border:1px solid #f2b632;color:#e9eef2;font:700 13px/1.35 system-ui,sans-serif;display:none';
    box.innerHTML = '<div>Thêm vào Màn hình chính để chơi toàn màn hình</div><div style="font-weight:400;color:#9fb0bd;margin-top:2px">Bấm nút Chia sẻ <svg width="13" height="15" viewBox="0 0 24 28" style="vertical-align:-2px" fill="none" stroke="#f2b632" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17V3M7 8l5-5 5 5M5 12H3v14h18V12h-2"/></svg> rồi chọn &quot;Thêm vào Màn hình chính&quot;.</div>'
      + '<button type="button" aria-label="Đóng" style="position:absolute;right:0;top:0;width:44px;height:44px;border:0;background:none;color:#fff;font:700 20px system-ui,sans-serif">×</button>';
    box.querySelector('button').onclick = () => { try { localStorage.setItem(HINT_KEY, '1'); } catch (err) { /* private mode */ } box.remove(); mo.disconnect(); };
    const sync = () => { box.style.display = document.body.classList.contains('in-match') ? 'none' : 'block'; };
    const mo = new MutationObserver(sync); mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.body.appendChild(box); sync();
  }
  return api;
}
