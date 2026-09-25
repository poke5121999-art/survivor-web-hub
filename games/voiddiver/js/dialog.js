// Giao diện thoại cho LuaApi: hộp thoại có chân dung, lựa chọn, ảnh nền, radio, bong bóng, toast, thư.
// Chân dung đặt tên "<id>_<cảm xúc>" như MD_GetPortraitName trong Common.lua.
(function (VD) {
  'use strict';
  const L = VD.lua;
  const $ = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };

  // skipAll: người chơi giữ "bỏ qua" → tua hết cuộc thoại hiện tại tới CloseDialogAsync. Lua vẫn chạy từng dòng theo thứ tự
  // (mỗi AppendDialogAsync/DelayDialogAsync trả task xong ngay), nên SetStep, SpawnMonster, SetCharacterStress, PlayBgm… vẫn chạy.
  const D = { root: null, box: null, open: false, skipFast: false, skipAll: false, radioTimer: 0 };
  // Giữ Esc bao lâu thì bỏ qua. [CHƯA RÕ] Bản gốc có SkipHoldDuration (CutscenePanelPresenter) nhưng số nằm trong mã, không trong prefab.
  const SKIP_HOLD = 1.0;
  const KEY_ICON = n => 'art/ui/tutorial/key/' + n + '.webp';

  // Ảnh chỉ dùng khi manifest có (portrait/dialogimage chưa bóc hết: tránh 404, thiếu thì để trống).
  function hasImg(kind, name) { const m = VD.ASSETS && VD.ASSETS[kind]; return !!(m && m[name]); }
  // Chuỗi LocalizedText có thẻ <color=#..>, <b>: gõ chữ trần, gõ xong thì hiện màu.
  const plain = s => String(s).replace(/<\/?(color|b|i|size)[^>]*>/g, '');
  const richHtml = s => (VD.ui && VD.ui.rich) ? VD.ui.rich(s) : plain(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function imgUrl(kind, name) {
    const a = VD.ASSETS && VD.ASSETS[kind] && VD.ASSETS[kind][name];
    return a ? (a.path || a) : 'art/ui/' + kind + '/' + name + '.webp';
  }
  function speakerName(type, id) {
    if (!id || id <= 0) return '';
    const T = VD.TEXT || {};
    if (id >= 600000 && id <= 799999) return T['TNpc_Name_' + id] || '';
    return T['TCharacter_Name_' + id] || T['TMonster_Name_' + id] || '';
  }
  const skipping = () => D.skipAll && D.open;
  const wait = ms => new Promise(r => setTimeout(r, skipping() ? 0 : D.skipFast ? Math.min(ms, 30) : ms));
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';

  // Hàng phím góc phải dưới như DialogPopup/Keys[] gốc: [Space][F] "Tiếp theo" (NextView), [Ctrl] "Bỏ qua nhanh" (QuickView).
  // Khung bỏ qua góc trái dưới dựng theo CutscenePanel gốc: nền gradient_circle_128 đen 80 %, phím Esc trong vòng đo giữ
  // circle_38 (Image Filled Radial360) và chữ CutSceneSkip "Giữ để bỏ qua". Bản gốc chỉ có khung này cho cắt cảnh;
  // dùng lại cho hội thoại vì DialogPopup gốc không có nút bỏ cả cuộc thoại. [SUY LUẬN]
  function keysHtml() {
    const k = n => `<img class="vd-key" src="${KEY_ICON(n)}" alt="">`;
    return `<span class="g">${k('Space_Key')}${k('F_Key')}<i>${TX('NextView') || 'Tiếp theo'}</i></span>` +
      `<span class="g">${k('Ctrl_Key')}<i>${TX('QuickView') || 'Bỏ qua nhanh'}</i></span>`;
  }
  function skipHtml() {
    return `<div class="dim"></div><div class="row"><div class="kp"><svg viewBox="0 0 42 42"><circle class="bg" cx="21" cy="21" r="19"/>` +
      `<circle class="fg" cx="21" cy="21" r="19"/></svg><img src="${KEY_ICON('Escape_Key')}" alt=""></div><span>${TX('CutSceneSkip') || 'Giữ để bỏ qua'}</span></div>`;
  }

  function build() {
    const root = $('div', 'vd-dialog', document.getElementById('ui') || document.body);
    root.innerHTML = `
      <div class="vd-dlg-bg"></div>
      <div class="vd-dlg-portraits"><img class="p0"><img class="p1"><img class="p2"></div>
      <div class="vd-dlg-box"><div class="vd-dlg-name"></div><div class="vd-dlg-text"></div><div class="vd-dlg-choices"></div>
        <div class="vd-dlg-hint">${keysHtml()}</div></div>
      <div class="vd-dlg-fade"></div>
      <div class="vd-dlg-skip" title="Esc">${skipHtml()}</div>`;
    D.root = root;
    D.bg = root.querySelector('.vd-dlg-bg');
    D.portraits = [...root.querySelectorAll('.vd-dlg-portraits img')];
    D.box = root.querySelector('.vd-dlg-box');
    D.name = root.querySelector('.vd-dlg-name');
    D.text = root.querySelector('.vd-dlg-text');
    D.choices = root.querySelector('.vd-dlg-choices');
    D.fade = root.querySelector('.vd-dlg-fade');
    D.toastBox = $('div', 'vd-toasts', document.getElementById('ui') || document.body);
    D.radio = $('div', 'vd-radio', document.getElementById('ui') || document.body);
    D.radio.innerHTML = '<img><div><b></b><span></span></div>';
    D.skipEl = root.querySelector('.vd-dlg-skip');
    D.skipFg = D.skipEl.querySelector('.fg');
    // Giữ chuột trên khung cũng tính như giữ Esc (người chơi không biết phím vẫn bấm được).
    D.skipEl.addEventListener('pointerdown', e => { e.stopPropagation(); if (e.button === 0) holdStart('ptr'); });
    D.skipEl.addEventListener('pointerup', e => { e.stopPropagation(); holdEnd('ptr'); });
    D.skipEl.addEventListener('pointerleave', () => holdEnd('ptr'));
  }

  // Ctrl (UI/NextFlow gốc) nghe từ lúc nạp trang: trước đây chỉ gắn khi dựng hộp thoại lần đầu nên Ctrl giữ sẵn bị bỏ lỡ.
  addEventListener('keydown', e => {
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') D.skipFast = true;
    if (e.code === 'Escape' && D.open && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); holdStart('key'); }
  }, true);
  addEventListener('keyup', e => {
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') D.skipFast = false;
    if (e.code === 'Escape') holdEnd('key');
  }, true);
  addEventListener('blur', () => { D.skipFast = false; holdEnd('key'); holdEnd('ptr'); });

  // ---- giữ để bỏ qua: vòng đo đầy sau SKIP_HOLD giây thì bật skipAll.
  const hold = { by: new Set(), t0: 0, raf: 0 };
  const RING = 2 * Math.PI * 19;
  function setRing(f) { if (D.skipFg) { D.skipFg.style.strokeDasharray = RING; D.skipFg.style.strokeDashoffset = RING * (1 - f); } }
  function holdStart(src) {
    if (!D.open || D.skipAll) return;
    if (!hold.by.size) { hold.t0 = performance.now(); D.skipEl && D.skipEl.classList.add('hold'); tickHold(); }
    hold.by.add(src);
  }
  function holdEnd(src) {
    hold.by.delete(src);
    if (hold.by.size) return;
    cancelAnimationFrame(hold.raf);
    if (D.skipEl) D.skipEl.classList.remove('hold');
    if (!D.skipAll) setRing(0);
  }
  function tickHold() {
    const f = Math.min(1, (performance.now() - hold.t0) / 1000 / SKIP_HOLD);
    setRing(f);
    if (f >= 1) { hold.by.clear(); if (D.skipEl) D.skipEl.classList.remove('hold'); startSkipAll(); return; }
    hold.raf = requestAnimationFrame(tickHold);
  }
  function startSkipAll() {
    if (!D.open) return;
    D.skipAll = true;
    D.root.classList.add('skipping');
    if (D.onAdvance) D.onAdvance();        // dòng đang đợi bấm tiếp: cho qua ngay
  }
  function endSkipAll() {
    D.skipAll = false;
    if (D.root) D.root.classList.remove('skipping');
    setRing(0);
  }
  D.skipAllNow = startSkipAll;             // kiểm thử / gỡ lỗi

  // Đợi người chơi bấm tiếp (hoặc tua nhanh). Trả index lựa chọn nếu có.
  function awaitAdvance(choices) {
    return new Promise(res => {
      if (choices && choices.length) {
        // Lựa chọn thì không tự chọn thay người chơi: dừng tua ở đây.
        if (D.skipAll) endSkipAll();
        D.choices.innerHTML = '';
        choices.forEach((c, i) => {
          const b = $('button', 'vd-choice', D.choices);
          b.textContent = L.text(c);
          b.onclick = ev => { ev.stopPropagation(); D.choices.innerHTML = ''; res(i); };
        });
        return;
      }
      if (skipping()) { res(-1); return; }
      if (D.skipFast) { setTimeout(() => res(-1), 60); return; }
      let fin = false;
      const done = () => { if (fin) return; fin = true; D.onAdvance = null; clearInterval(iv); removeEventListener('keydown', key); D.root.removeEventListener('pointerdown', click); res(-1); };
      D.onAdvance = done;
      const key = e => { if (e.code === 'KeyF' || e.code === 'Space' || e.code === 'Enter') done(); };
      const click = e => { if (e.button === 0) done(); };
      addEventListener('keydown', key); D.root.addEventListener('pointerdown', click);
      const iv = setInterval(() => { if (D.skipFast) { clearInterval(iv); done(); } }, 50);
    });
  }

  // speakers là bảng Lua {DialogSpeakerEntry×3}; phần tử có thể nil. idx −1 là "점장" (người chơi), không tên.
  const entry = (sp, i) => sp && typeof sp.get === 'function' ? sp.get(i + 1) : sp && sp[i];
  function showSpeakers(speakers, idx) {
    for (let i = 0; i < 3; i++) {
      const e = entry(speakers, i), img = D.portraits[i];
      const portrait = e && L.field(e, 'Portrait');
      if (portrait && hasImg('portrait', portrait)) { img.src = imgUrl('portrait', portrait); img.style.display = ''; img.classList.toggle('dim', idx !== i); }
      else img.style.display = 'none';
    }
    const sp = idx >= 0 ? entry(speakers, idx) : null;
    D.name.textContent = sp ? speakerName(L.field(sp, 'SpeakerType'), L.field(sp, 'Id')) : '';
    D.name.style.display = D.name.textContent ? '' : 'none';
  }

  async function typeText(msg) {
    const rich = richHtml(L.text(msg)), s = plain(L.text(msg));
    D.text.textContent = '';
    if (D.skipFast || skipping()) { D.text.innerHTML = rich; return; }
    let skip = false;
    const onSkip = () => { skip = true; };
    D.root.addEventListener('pointerdown', onSkip, { once: true });
    for (let i = 1; i <= s.length && !skip && !skipping(); i++) { D.text.textContent = s.slice(0, i); await new Promise(r => setTimeout(r, 18)); }
    D.text.innerHTML = rich;
    D.root.removeEventListener('pointerdown', onSkip);
  }

  const api = {
    OpenDialogAsync(mode) {
      if (!D.root) build();
      endSkipAll();
      D.open = true; D.root.classList.add('on'); D.box.style.visibility = 'hidden';
      D.portraits.forEach(p => { p.style.display = 'none'; });
      if (VD.input) VD.input.enabled = false;
      return L.task(wait(250));
    },
    CloseDialogAsync() {
      if (!D.root) return L.done();
      D.root.classList.remove('on'); D.open = false;
      endSkipAll(); holdEnd('key'); holdEnd('ptr');
      D.bg.style.backgroundImage = ''; D.bg.classList.remove('on');
      if (VD.input) { VD.input.enabled = true; VD.input.clear(); }
      return L.task(wait(250));
    },
    AppendDialogAsync(speakers, idx, msg, choices) {
      if (!D.root) build();
      D.box.style.visibility = '';
      showSpeakers(speakers, idx);
      const ch = choices ? L.table(choices) : null;
      return L.task((async () => { await typeText(msg); return awaitAdvance(ch && ch.length ? Array.from(ch) : null); })());
    },
    SetDialogImmediate(speakers, idx, msg) {
      if (!D.root) build();
      showSpeakers(speakers, idx); D.text.innerHTML = richHtml(L.text(msg));
      D.box.style.visibility = msg ? '' : 'hidden';
    },
    DelayDialogAsync(ms) { return L.task(wait(ms)); },
    WaitDelayAsync(ms) { return L.task(wait(ms)); },
    FadeOutDialog() { if (D.root) D.fade.classList.add('on'); },
    FadeInDialog() { if (D.root) D.fade.classList.remove('on'); },
    SetDialogCustomImageAsync(name) {
      if (!D.root) build();
      if (hasImg('dialogimage', name)) { D.bg.style.backgroundImage = 'url("' + imgUrl('dialogimage', name) + '")'; D.bg.classList.add('on'); }
      else { D.bg.style.backgroundImage = ''; D.bg.classList.toggle('on', !/Lounge/.test(name));   // ảnh sảnh thiếu: để lộ sảnh 3D phía sau
        D.missing = D.missing || new Set(); D.missing.add('dialogimage/' + name); }
      return L.task(wait(300));
    },
    ClearDialogCustomImageAsync() { if (D.root) D.bg.classList.remove('on'); return L.task(wait(250)); },
    ClearAllDialogCustomImagesAsync() { if (D.root) D.bg.classList.remove('on'); return L.task(wait(250)); },
    OpenNoteSystemPopup(keys, type) {
      if (!D.root) build();
      const list = L.table(keys) || [];
      const note = $('div', 'vd-note', D.root);
      note.innerHTML = `<div class="paper"></div><div class="vd-dlg-hint"><span class="g"><img class="vd-key" src="${KEY_ICON('Space_Key')}" alt=""><img class="vd-key" src="${KEY_ICON('F_Key')}" alt=""><i>${TX('Close') || 'Đóng'}</i></span></div>`;
      const paper = note.querySelector('.paper');
      for (let i = 0; i < list.length; i++) { const p = $('p', null, paper); p.textContent = (VD.TEXT && VD.TEXT[list[i]]) || L.text(list[i]); }
      return L.task(awaitAdvance(null).then(() => note.remove()));
    },
    ShowSystemToastText(msg) { toast(L.text(msg)); },
    ShowRadioText(type, id, image, msg) {
      if (!D.root) build();
      const img = D.radio.querySelector('img');
      const pid = id > 0 ? id : 700000;
      const pn = pid + '_' + (image || 'Default');
      if (hasImg('portrait', pn)) { img.src = imgUrl('portrait', pn); img.style.visibility = ''; } else img.style.visibility = 'hidden';
      D.radio.querySelector('b').textContent = speakerName(type, pid);
      D.radio.querySelector('span').textContent = L.text(msg);
      D.radio.classList.add('on');
      clearTimeout(D.radioTimer);
      D.radioTimer = setTimeout(() => D.radio.classList.remove('on'), 4200);
    },
    ShowBubbleText(type, id, msg) { if (VD.hud && VD.hud.bubble) VD.hud.bubble(type, id, L.text(msg)); else toast(L.text(msg)); },
    ShowMonologueText(type, id, msg) { if (VD.hud && VD.hud.bubble) VD.hud.bubble(type, id, L.text(msg)); else toast(L.text(msg)); },
  };

  function toast(s) {
    if (!D.root) build();
    const t = $('div', 'vd-toast', D.toastBox);
    t.textContent = s;
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
  }

  Object.assign(L.api, api);
  D.toast = toast;
  VD.dialog = D;
})(window.VD = window.VD || {});
