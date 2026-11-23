// Phone orientation and fullscreen, the way Đấu Trường Thép does it (js/fullscreen.js there): Android Chrome gets page
// fullscreen plus screen.orientation.lock('landscape') on the first tap; a phone held upright gets a "rotate" cover
// and the battle pauses under it; iPhone/iPad Safari (no page fullscreen) gets a one-time "add to home screen" hint.
// game.fullscreen = { on, supported, toggle() }. The choice lives in game.settings.fullscreen (default: on for touch).

const HINT_KEY = 'aisinhton.a2hs.v1';

const SHARE_ICON = '<svg width="13" height="15" viewBox="0 0 24 28" style="vertical-align:-2px" fill="none" stroke="#ffb74a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18V3M7 8l5-5 5 5"/><path d="M6 12H4v13h16V12h-2"/></svg>';
const PHONE_ICON = '<svg viewBox="0 0 64 64" width="72" height="72" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="20" y="8" width="24" height="42" rx="4"/><path d="M28 44h8"/><path d="M12 56c10 6 30 6 40 0"/><path d="M48 52l4 4-6 2"/></svg>';

const CSS = `
#orient-rotate { position: fixed; inset: 0; z-index: 2147483000; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: #0b0d12; color: #ffe2a8; text-align: center; padding: 24px; box-sizing: border-box; font-family: system-ui, 'Segoe UI', Roboto, sans-serif; touch-action: none; }
#orient-rotate.show { display: flex; }
#orient-rotate svg { color: #ff9a2e; animation: orient-rot 2.4s ease-in-out infinite; }
#orient-rotate b { font-size: 22px; line-height: 1.5; letter-spacing: .04em; text-transform: uppercase; }
#orient-rotate span { font-size: 15px; line-height: 1.4; color: #9aa6b5; }
@keyframes orient-rot { 0%, 15% { transform: rotate(0); } 55%, 100% { transform: rotate(-90deg); } }
#orient-hint { position: absolute; left: 50%; transform: translateX(-50%); top: 8px; z-index: 40; max-width: 70%; box-sizing: border-box; padding: 8px 40px 8px 12px; background: rgba(14,12,18,.92); border: 2px solid #ff9a2e; border-radius: 8px; color: #fff3dc; font: 700 13px/1.4 system-ui, sans-serif; }
#orient-hint small { display: block; font-weight: 400; color: #b7c0cc; font-size: 12px; margin-top: 2px; }
#orient-hint button { position: absolute; right: 0; top: 0; width: 44px; height: 44px; border: 0; background: none; color: #fff; font: 700 22px system-ui, sans-serif; }
`;

export function createOrient(game, frame) {
  const de = document.documentElement;
  const ua = navigator.userAgent;
  const iphone = /iPhone|iPod/.test(ua);
  const ios = iphone || /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const touch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && /Mobi|Android|iPhone|iPad/.test(ua));
  const reqFn = () => de.requestFullscreen || de.webkitRequestFullscreen;
  const supported = !!reqFn() && !iphone;
  const fsElem = () => document.fullscreenElement || document.webkitFullscreenElement || null;

  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  // fullscreen: one attempt per page load (a tap that fails or that the player undoes is not retried on every tap)
  let attempted = false;
  const wanted = () => (game.settings && game.settings.fullscreen !== undefined ? !!game.settings.fullscreen : touch);

  async function enter() {
    attempted = true;
    const f = reqFn();
    if (!f || fsElem()) return;
    try { const p = f.call(de, { navigationUI: 'hide' }); if (p && p.then) await p; } catch (err) { return; }
    try {
      const o = screen.orientation;
      const p = o && o.lock && o.lock('landscape');
      if (p && p.catch) p.catch(() => {});
    } catch (err) { /* desktop and iOS refuse */ }
  }
  function leave() {
    if (!fsElem()) return;
    try { const f = document.exitFullscreen || document.webkitExitFullscreen; const p = f.call(document); if (p && p.catch) p.catch(() => {}); } catch (err) { /* already out */ }
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (err) { /* not locked */ }
  }
  const tap = (e) => {
    if (attempted || !supported || !wanted()) return;
    if (e.type === 'click' || e.pointerType === 'touch' || e.pointerType === 'pen') enter();
  };
  addEventListener('pointerup', tap, true); addEventListener('click', tap, true);

  const api = {
    supported,
    get on() { return wanted(); },
    toggle() {
      const next = !wanted();
      if (game.setSetting) game.setSetting('fullscreen', next); else if (game.settings) game.settings.fullscreen = next;
      apply();
      if (next && supported) enter();
      return next;
    },
  };
  function apply() { if (!wanted()) leave(); else if (!fsElem()) attempted = false; }
  if (game.events) game.events.on('setting', (e) => { if (e && e.key === 'fullscreen') { apply(); } });

  // rotate cover: a touch device held upright; the battle waits under it and gets its previous pause state back
  const cover = document.createElement('div');
  cover.id = 'orient-rotate'; cover.setAttribute('role', 'alert');
  cover.innerHTML = PHONE_ICON + '<b>Xoay ngang màn hình</b><span>Thú Hộ Vệ chơi ở màn ngang</span>';
  document.body.appendChild(cover);
  let shown = false, weHeld = false, inSet = false;
  const portrait = () => { const v = window.visualViewport; return (v ? v.height > v.width : innerHeight > innerWidth); };
  const inBattle = () => !!game.B && game.state === 'battle';
  function hold() { if (inBattle() && !game.paused && game.setPaused) { inSet = true; try { game.setPaused(true); } finally { inSet = false; } weHeld = true; } }
  function update() {
    const want = touch && portrait();
    if (want === shown) return;
    shown = want; cover.classList.toggle('show', shown);
    if (shown) hold();
    else if (weHeld) { weHeld = false; if (game.paused && game.setPaused) game.setPaused(false); }
  }
  addEventListener('resize', update); addEventListener('orientationchange', update);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', update);
  if (game.events) game.events.on('paused', (e) => { if (shown && !inSet && e && !e.paused) hold(); });
  update();

  // iPhone/iPad Safari: one dismissible hint while the page runs in a Safari tab
  const standalone = navigator.standalone === true || matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
  let seen = false; try { seen = !!localStorage.getItem(HINT_KEY); } catch (err) { /* private mode */ }
  if (ios && !supported && !standalone && !seen) {
    const box = document.createElement('div');
    box.id = 'orient-hint'; box.setAttribute('role', 'note');
    box.innerHTML = '<div>Thêm vào Màn hình chính để chơi toàn màn hình</div><small>Bấm nút Chia sẻ ' + SHARE_ICON + ' rồi chọn "Thêm vào Màn hình chính"</small><button type="button" aria-label="Đóng">×</button>';
    const close = () => { try { localStorage.setItem(HINT_KEY, '1'); } catch (err) { /* private mode */ } box.remove(); };
    box.querySelector('button').addEventListener('click', close);
    frame.appendChild(box);
    const sync = () => { if (!box.isConnected) return; box.style.display = game.state === 'battle' ? 'none' : ''; requestAnimationFrame(sync); };
    sync();
  }

  game.fullscreen = api;
  return api;
}
