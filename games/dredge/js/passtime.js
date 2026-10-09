/*
 * Màn "thời gian trôi" dựng theo TimePassScrimUI.cs của bản gốc: toàn màn tối đi, tiêu đề trên một vòng tiến trình có đồng hồ cát ở giữa,
 * nút "Thức dậy [Esc]" (chỉ khi ngủ: TimePassageMode.SLEEP). Vòng đầy theo 1 − GetProportionForcefullyPassedTimeRemaining().
 * Nghe sự kiện 'passTime' (giờ, lý do) mà RestDestination (js/dock.js), cargo.js (lắp đồ: 'INSTALL'), yarn.js (lệnh PassTime) phát; sky.js lo đồng hồ
 * (DRSky.forced = { left, total, reason, sleep }, tính theo ngày) và phát 'passTimeDone' khi hết. Không sửa các file đó.
 *   DRPassTime.isShown()   DRPassTime.wake()  (dừng ngủ giữa chừng như StopForcefullyPassingTime)   DRPassTime._debug()
 * Số đo [ĐỀ XUẤT] đo từ khung clip 2170 (nhân đôi sang đơn vị canvas 1080p): vòng ~330, tiêu đề cao hơn tâm ~215, nút Thức dậy thấp hơn tâm ~215.
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  const ver = (me && me.src.match(/\?v=[^&]*/) || [''])[0];
  if (!document.querySelector('link[href*="passtime.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = new URL('../css/passtime.css' + ver, (me && me.src) || location.href).href;
    document.head.appendChild(l);
  }
  // feedback.pass-time-* của bản gốc (data/strings.js) -> tiếng Việt; lý do lạ thì dùng chữ chung
  const TEXT_VN = {
    'feedback.pass-time-rest': 'Đang nghỉ tới bình minh...',                       // Resting until dawn...
    'feedback.pass-time-install-equipment': 'Đang lắp thiết bị...',                // Installing Equipment...
    'feedback.pass-time-generic': 'Thời gian đang trôi...',                        // Passing Time...
    'feedback.pass-time-collector-install': 'Người sưu tầm đang mày mò con tàu của bạn...',
    'feedback.pass-time-paint-boat': 'Đang sơn tàu...',
    'feedback.pass-time-waiting-for-right-time': 'Đang chờ đúng lúc...'
  };
  const reasonKey = r => {
    r = String(r || '');
    if (TEXT_VN[r]) return r;
    if (/install/i.test(r)) return 'feedback.pass-time-install-equipment';
    if (/sleep|rest|ngủ/i.test(r)) return 'feedback.pass-time-rest';
    return 'feedback.pass-time-generic';
  };
  const sprite = n => new URL((root.DR_UI && DR_UI[n]) || 'art/ui/sprites/' + n + '.webp', document.baseURI).href;
  const el = (tag, cls, parent, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (parent) parent.appendChild(e);
    return e;
  };

  let host = null, parts = null, raf = 0, shown = false, sleeping = false, t0 = 0;
  function ensure() {
    if (host) return;
    host = el('div', 'dr-ui', document.body); host.id = 'dr-passtime';
    const ring = el('div', 'pt-ring', host);
    ring.style.setProperty('--ring', 'url(' + sprite('ring-high-res') + ')');
    // đồng hồ cát là anh em của vòng (vòng có mask nên con của nó bị cắt theo hình vòng)
    const glass = el('img', 'pt-glass', host); glass.alt = ''; glass.src = sprite('hourglass-icon');
    const title = el('div', 'pt-title', host);
    const wake = el('button', 'pt-wake', host);
    el('b', '', wake, 'Esc'); el('span', '', wake, 'Thức dậy');       // prompt.wake-up: Wake Up
    wake.onclick = () => wakeUp();
    parts = { ring, title, wake };
    scale(); root.addEventListener('resize', scale);
  }
  function scale() {
    if (!host) return;
    const h = root.innerHeight, w = root.innerWidth;
    let s = h / 1080;
    if (s < 0.6) s = Math.min(0.6, w / 1400);                       // màn thấp nới lên cho chữ còn đọc được [ĐỀ XUẤT]
    host.style.setProperty('--s', s.toFixed(4));
  }

  function frame() {
    if (!shown) return;
    const f = root.DRSky && DRSky.forced;
    if (f) {
      const p = f.total > 0 ? 1 - Math.max(0, f.left) / f.total : 1;
      host.style.setProperty('--p', (Math.max(0, Math.min(1, p)) * 360).toFixed(1) + 'deg');
    }
    raf = requestAnimationFrame(frame);
  }
  function show(hours, reason) {
    ensure();
    const key = reasonKey(reason);
    sleeping = key === 'feedback.pass-time-rest';
    parts.title.textContent = TEXT_VN[key];
    parts.wake.style.display = sleeping ? '' : 'none';
    host.style.setProperty('--p', '0deg');
    host.classList.add('on');
    host.dataset.reason = key;
    shown = true; t0 = performance.now();
    cancelAnimationFrame(raf); frame();
  }
  function hide() {
    shown = false; cancelAnimationFrame(raf);
    if (host) host.classList.remove('on');
  }
  // OnCancelButtonPressed -> TimeController.StopForcefullyPassingTime: sky.js kết thúc ở khung kế khi left <= 0
  function wakeUp() {
    const f = root.DRSky && DRSky.forced;
    if (shown && sleeping && f) f.left = 0;
  }

  root.addEventListener('keydown', e => {
    if (!shown || !sleeping || e.code !== 'Escape') return;
    e.preventDefault(); e.stopImmediatePropagation(); wakeUp();
  }, true);

  function wire() {
    if (!root.DR || !DR.on) return;
    DR.on('passTime', (hours, reason) => show(hours, reason));
    DR.on('passTimeDone', () => hide());
    DR.on('mode', m => { if (m === 'title') hide(); });
  }
  wire();

  root.DRPassTime = {
    isShown: () => shown, wake: wakeUp,
    _debug: () => ({ shown, sleeping, text: parts && parts.title.textContent, deg: host && host.style.getPropertyValue('--p'), ms: shown ? performance.now() - t0 : 0, forced: !!(root.DRSky && DRSky.forced) })
  };
})(window);
