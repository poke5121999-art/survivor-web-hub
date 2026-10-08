/*
 * Banner thông báo của DREDGE (BannersUI + BannerUI trong Scenes/Game.unity; tools/banner_ui.py -> art/ui/banner/banner_ui.js).
 *  - Hàng đợi (BannersUI.AddNewListing): mỗi banner giữ holdTimeSec 5 s tính từ lúc hiện (BannersUI.cs:9, Update trừ unscaledDeltaTime),
 *    rồi Animator chuyển "showing" = false -> clip Exit 0,25 s; banner kế chỉ hiện khi Exit gọi OnHideCompleteEventFired.
 *  - Vị trí: BannerUIContainer.anchoredPosition.y = topYPos 250 khi không có cửa sổ nào mở, bottomYPos −250 khi có
 *    (UI.ShowingWindowTypes; lúc thu hoạch bản gốc luôn mở khoang: Harvester.OnEnable -> ToggleInventorySolo).
 *  - Loài mới (BannersUI.OnItemSeen: GetCaughtCountById == 0 trước khi tăng): tên cá màu NEUTRAL + notification.fish-discovered.subtitle,
 *    ảnh cá (món 1 ô thu 0,5), tiếng fishSFX "Fish - New" hoặc aberrationSFX "Fish - New Aberration" (BannerUI.ShowFishDiscovered).
 *  - Cá cúp (ItemManager.SetItemSeen: size ≥ TrophyMaxSize -> TriggerTrophyFishCaught, SAU banner loài mới): notification.trophy-fish.title,
 *    chữ phụ = biểu tượng cúp vàng #FFD104 + cỡ (ItemManager.GetFormattedFishSizeString), tiếng regularSFX "Notification - Generic".
 *  - Cổ vật (itemSubtype RELIC): notification.relic-discovered.title màu CRITICAL + .subtitle, ảnh món, tiếng regularSFX.
 * Nghe DR.on('catch', made) (js/spots.js phát). DRBanner._debug() / DRBanner.history cho kiểm thử.
 */
(function (root) {
  'use strict';
  const B = root.DR_BANNER_UI;
  if (!B) { console.error('[banner] art/ui/banner/banner_ui.js not loaded; banners disabled'); return; }
  const me = document.currentScript, ver = (me && me.src.match(/\?v=[^&]*/) || [''])[0];
  const URLB = f => new URL('../' + f, (me && me.src) || location.href).href;
  const spr = n => URLB('art/ui/banner/sprites/' + n + '.webp' + ver);
  // chuỗi gốc (data/strings.js, tiếng Anh) -> tiếng Việt; khoá giữ nguyên tên của bảng chuỗi
  const T = {
    'notification.fish-discovered.subtitle': 'Đã thêm dữ liệu loài vào Bách khoa.',   // "Species data added to Encyclopedia."
    'notification.trophy-fish.title': 'Bắt được cá cúp',                               // "Trophy Caught"
    'notification.relic-discovered.title': 'Tìm thấy cổ vật',                          // "Relic Discovered"
    'notification.relic-discovered.subtitle': 'Hãy mang về cho Nhà Sưu Tầm.'           // "Return to The Collector."
  };

  // ------------------------------------------------------------------------------------------ dựng cây RectTransform -> DOM
  const host = document.createElement('div');
  host.id = 'dr-banner';
  const N = {};                                   // đường dẫn -> { el, n, s: {apx, apy, sx, sy, alpha, on} }
  function build(n, path, parentEl) {
    const el = document.createElement('div'), r = n.rt, c = (n.c || []);
    el.className = 'bn-n'; el.dataset.n = n.n;
    const nd = { el, n, rt: r, s: { apx: r ? r.ap[0] : 0, apy: r ? r.ap[1] : 0, sx: r ? r.sc[0] : 1, sy: r ? r.sc[1] : 1, alpha: 1, on: !!n.on } };
    nd.base = Object.assign({}, nd.s);
    const img = c.find(x => x.script === 'Image'), tmp = c.find(x => x.script === 'TMP');
    if (img && img.spr && B.sprites[img.spr]) {                         // ảnh cá mẫu của cảnh (mackerel) bỏ: lúc chạy gán sprite của món
      const meta = B.sprites[img.spr];
      el.classList.add('bn-i');
      if (img.type === 1 && meta && meta.border.some(v => v > 0)) {          // Image Sliced: viền theo ppu (100 px ảnh = 100 đơn vị ở ppu 100)
        const b = meta.border, k = 100 / meta.ppu;
        // viền 9 mảnh vẽ ở ::before để con (Title, Subtitle) vẫn đo theo cả khung RectTransform, không bị viền CSS thu hẹp
        el.classList.add('sl');
        el.style.setProperty('--bsrc', 'url(' + spr(img.spr) + ')');
        el.style.setProperty('--bslice', b[3] + ' ' + b[2] + ' ' + b[1] + ' ' + b[0]);
        el.style.setProperty('--bw', [b[3], b[2], b[1], b[0]].map(v => 'calc(' + (v * k).toFixed(3) + ' * var(--u))').join(' '));
      } else el.style.backgroundImage = 'url(' + spr(img.spr) + ')';
      if (img.pa) el.classList.add('pa');
      const a = parseInt(String(img.col).slice(7, 9) || 'ff', 16) / 255;
      if (a < 1) el.style.opacity = a.toFixed(3);
    }
    if (tmp) {
      el.classList.add('bn-t');
      nd.span = document.createElement('span'); el.appendChild(nd.span);
      el.style.justifyContent = tmp.halign === 2 ? 'center' : tmp.halign === 4 ? 'flex-end' : 'flex-start';
      el.style.textAlign = tmp.halign === 2 ? 'center' : tmp.halign === 4 ? 'right' : 'left';
      nd.tmp = tmp;
    }
    N[path] = nd;
    parentEl.appendChild(el);
    for (const k of n.k || []) build(k, path + '/' + k.n, el);
    apply(nd, true);
    return nd;
  }
  function apply(nd, all) {
    const r = nd.rt, s = nd.s, el = nd.el;
    if (r) {
      el.style.left = 'calc(' + (r.amin[0] * 100) + '% + ' + (s.apx - r.piv[0] * r.sd[0]) + ' * var(--u))';
      el.style.bottom = 'calc(' + (r.amin[1] * 100) + '% + ' + (s.apy - r.piv[1] * r.sd[1]) + ' * var(--u))';
      if (all) {
        el.style.width = 'calc(' + ((r.amax[0] - r.amin[0]) * 100) + '% + ' + r.sd[0] + ' * var(--u))';
        el.style.height = 'calc(' + ((r.amax[1] - r.amin[1]) * 100) + '% + ' + r.sd[1] + ' * var(--u))';
        el.style.transformOrigin = (r.piv[0] * 100) + '% ' + ((1 - r.piv[1]) * 100) + '%';
      }
      el.style.transform = s.sx !== 1 || s.sy !== 1 ? 'scale(' + s.sx + ',' + s.sy + ')' : '';
    }
    el.classList.toggle('off', !s.on);
    if (nd.cg) el.style.opacity = String(s.alpha);
  }
  const root0 = build(B.tree, B.tree.n, host);
  const CONT = N['Banners/BannerUIContainer'], UI = N['Banners/BannerUIContainer/BannerUI'];
  UI.cg = true;                                   // CanvasGroup.m_Alpha của BannerUI (clip Enter/Exit)
  const TITLE = N['Banners/BannerUIContainer/BannerUI/Backplate/Title'], SUB = N['Banners/BannerUIContainer/BannerUI/Backplate/Subtitle'];
  const IMG = N['Banners/BannerUIContainer/BannerUI/ImageBackplate/Image'];

  // ------------------------------------------------------------------------------------------ Animator (clip Enter / Exit / Idle)
  function hermite(keys, t) {
    const n = keys.length;
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0; while (i < n - 2 && t >= keys[i + 1][0]) i++;
    const k0 = keys[i], k1 = keys[i + 1], dt = k1[0] - k0[0], s = (t - k0[0]) / dt;
    if (Array.isArray(k0[1])) return k0[1].map((v, j) => v + (k1[1][j] - v) * s);
    const o = k0[3], inn = k1[2];
    if (!isFinite(o) || !isFinite(inn)) return k0[1];
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * k0[1] + (s3 - 2 * s2 + s) * o * dt + (-2 * s3 + 3 * s2) * k1[1] + (s3 - s2) * inn * dt;
  }
  let clip = null, clipT = 0;
  function playClip(name) { clip = B.clips[B.states[name].clip]; clipT = 0; sample(); }
  function sample() {
    if (!clip) return;
    const touched = new Set();
    for (const cv of clip.curves) {
      const nd = N['Banners/BannerUIContainer' + (cv.path ? '/' + cv.path : '')];
      if (!nd) continue;
      const v = hermite(cv.keys, Math.min(clipT, clip.len));
      if (cv.kind === 'scale') { nd.s.sx = v[0]; nd.s.sy = v[1]; }
      else if (cv.attr === 'm_Alpha') nd.s.alpha = v;
      else if (cv.attr === 'm_AnchoredPosition.x') nd.s.apx = v;
      else if (cv.attr === 'm_AnchoredPosition.y') nd.s.apy = v;
      else if (cv.attr === 'm_IsActive') nd.s.on = v >= 0.5;
      touched.add(nd);
    }
    for (const nd of touched) apply(nd);
  }

  // ------------------------------------------------------------------------------------------ hàng đợi BannersUI
  const queue = [], history = [];
  let cur = null, raf = 0, last = 0;
  const windowOpen = () => { const D = root.DR; return !!(D && (D.mode === 'harvest' || D.mode === 'cargo' || (root.DRCargo && DRCargo.isOpen && DRCargo.isOpen()))); };
  function add(L) { queue.push(L); if (queue.length === 1 && !cur) next(); }
  function next() {
    if (cur || !queue.length) return;
    if (root.DR && DR.mode === 'over') { queue.length = 0; return; }   // GameManager.Player.IsAlive
    const L = queue.shift();
    CONT.s.apy = windowOpen() ? B.pos.bottom : B.pos.top; apply(CONT);
    fill(L);
    cur = { L, t: 0, hiding: false };
    history.push({ kind: L.kind, id: L.id, title: TITLE.span.textContent, pos: CONT.s.apy, at: performance.now() });
    try { root.DRAudio && DRAudio.play(L.sfx); } catch (e) { /* tiếng là phần phụ */ }
    playClip('Enter');                                                  // animator.SetBool("showing", true): Idle/Exit -> Enter
    host.classList.add('on');
    cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!cur) return;
    clipT += dt; sample();
    cur.t += dt;
    if (!cur.hiding && cur.t >= B.hold) { cur.hiding = true; playClip('Exit'); }   // RequestHide: "showing" = false -> Exit
    else if (cur.hiding) {
      const ev = (clip.events || []).find(e => e.fn === 'OnHideCompleteEventFired');
      if (clipT >= (ev ? ev.t : clip.len)) {                             // OnHideCompleteEventFired -> ProcessListing
        cur = null; playClip(B.default); host.classList.remove('on');
        if (queue.length) { next(); return; }
      }
    }
    raf = requestAnimationFrame(tick);
  }
  const fmtSize = (it, size) => {                                       // ItemManager.GetFormattedFishSizeString (đơn vị mét, "n2")
    const cm = (it.minSizeCentimeters || 0) + ((it.maxSizeCentimeters || 0) - (it.minSizeCentimeters || 0)) * size;
    const f = v => v.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return cm > 100 ? f(Math.round(cm / 100 * 100) / 100) + ' m' : f(Math.round(cm * 10) / 10) + ' cm';
  };
  function setText(nd, html, color) {
    nd.span.innerHTML = html;
    const latin = /^[\x20-\x7e -ÿ]*$/.test(nd.span.textContent);
    nd.el.style.fontFamily = latin ? '"FrontPageNeue", "Signika", sans-serif' : '"Signika", "Segoe UI", sans-serif';
    nd.el.style.color = color || '#ffffff';
    fit(nd);
  }
  // TMP enableAutoSizing: cỡ lớn nhất trong [fontSizeMin, fontSizeMax] còn vừa khung
  function fit(nd) {
    const t = nd.tmp, el = nd.el, sp = nd.span, u = parseFloat(host.style.getPropertyValue('--u')) || 1;
    let lo = t.auto ? t.min : t.size, hi = t.auto ? t.max : t.size;
    const ok = sz => { el.style.fontSize = (sz * u).toFixed(2) + 'px'; return sp.scrollWidth <= el.clientWidth + 1 && sp.offsetHeight <= el.clientHeight + 1; };
    if (ok(hi)) return;
    for (let i = 0; i < 9 && hi - lo > 0.25; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
    el.style.fontSize = (lo * u).toFixed(2) + 'px';
  }
  function fill(L) {
    const it = L.item, C = B.colors;
    IMG.el.style.backgroundImage = it && it.sprite ? 'url(' + URLB(it.sprite) + ')' : '';
    const small = it && it.dims && it.dims.length === 1 && L.kind !== 'relic';
    IMG.s.sx = IMG.s.sy = small ? 0.5 : 1; apply(IMG);
    if (L.kind === 'fish') { setText(TITLE, esc(it.name), C.NEUTRAL); setText(SUB, T['notification.fish-discovered.subtitle']); }
    else if (L.kind === 'trophy') {
      setText(TITLE, T['notification.trophy-fish.title'], C.NEUTRAL);
      setText(SUB, '<i class="bn-ico" style="--k:url(' + spr('TrophyIcon') + ');--c:' + C.TROPHY + '"></i>' + fmtSize(it, L.size));
    } else if (L.kind === 'relic') { setText(TITLE, T['notification.relic-discovered.title'], C.CRITICAL); setText(SUB, T['notification.relic-discovered.subtitle']); }
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------------------------------------ nguồn sự kiện
  function onCatch(made) {
    if (!made || !made.item) return;
    if (made.isNew) add({ kind: 'fish', id: made.id, item: made.item, sfx: made.aberrant ? B.sfx.aberrationSFX : B.sfx.fishSFX });
    else if (made.relic) add({ kind: 'relic', id: made.id, item: made.item, sfx: B.sfx.regularSFX });
    if (made.trophySize) add({ kind: 'trophy', id: made.id, item: made.item, size: made.size, sfx: B.sfx.regularSFX });
  }
  function resize() {
    // CanvasScaler ScaleWithScreenSize 1920x1080, khớp theo chiều cao (m_MatchWidthOrHeight 1); [ĐỀ XUẤT] sàn 0,6 cho điện thoại ngang như js/minigame.js
    const W = root.innerWidth, Hh = root.innerHeight, ref = B.canvas ? B.canvas.ref : [1920, 1080];
    const u = Math.max(Hh / ref[1], Math.min(0.6, W / 1440));
    host.style.setProperty('--u', u + 'px');
    if (cur) { fit(TITLE); fit(SUB); }
  }
  function init() {
    document.body.appendChild(host);
    resize();
    playClip(B.default);
    if (root.DR && DR.on) DR.on('catch', onCatch);
  }
  root.addEventListener('resize', resize);
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);

  root.DRBanner = {
    history, add,
    _debug: () => ({ showing: !!cur, hiding: !!(cur && cur.hiding), kind: cur && cur.L.kind, id: cur && cur.L.id, title: TITLE.span.textContent, subtitle: SUB.span.textContent,
      queue: queue.map(q => q.kind), pos: CONT.s.apy, rect: cur ? UI.el.getBoundingClientRect().toJSON() : null })
  };
})(window);
