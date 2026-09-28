/*
 * Lớp giao diện của cảnh bản đồ: phím ảo cho điện thoại, màn đen chuyển map, tên vùng, ảnh Pokémon lớn,
 * sổ nhiệm vụ (khung atlas PRO qua P1.proui), và hộp thoại dự phòng khi shell (js/menus.js) chưa có.
 * HUD, menu và hộp thoại thật thuộc menus.js. Mọi DOM gắn vào #ui và gỡ hết trong unmount().
 *
 * Phím ảo: d-pad góc dưới trái, nâng 34 px để chừa hàng nút menu HUD; A/B/MENU/QUEST nằm ngay bên trái vùng 440×280 góc dưới phải (để dành cho khung chat).
 */
(function (P1) {
  'use strict';

  const CSS = `
.p1w-fade{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .25s linear;z-index:40}
.p1w-area{position:fixed;left:50%;top:14px;transform:translate(-50%,-80px);transition:transform .35s ease;z-index:30;
  background:rgba(22,30,40,.82);border:2px solid #9fb3c8;border-radius:6px;color:#fff;font:15px Aldrich,Arimo,sans-serif;padding:6px 18px;pointer-events:none}
.p1w-area.on{transform:translate(-50%,0)}
.p1w-mon{position:fixed;left:50%;top:18%;transform:translateX(-50%);width:min(40vh,256px);height:min(40vh,256px);z-index:31;pointer-events:none;
  background:radial-gradient(circle,rgba(255,255,255,.9) 0,rgba(210,230,255,.75) 55%,rgba(0,0,0,0) 72%)}
.p1w-mon img{width:100%;height:100%;image-rendering:pixelated;object-fit:contain}
.p1w-dpad{position:fixed;left:calc(18px + env(safe-area-inset-left));bottom:calc(34px + env(safe-area-inset-bottom));width:132px;height:132px;pointer-events:auto;touch-action:none;z-index:35}
.p1w-dpad i{position:absolute;width:44px;height:44px;background:rgba(20,28,38,.55);border:2px solid rgba(255,255,255,.55);border-radius:8px}
.p1w-dpad i.on{background:rgba(120,180,255,.6)}
.p1w-btn{position:fixed;width:58px;height:58px;border-radius:50%;background:rgba(20,28,38,.55);border:2px solid rgba(255,255,255,.6);
  color:#fff;font:bold 20px Arimo,sans-serif;display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;z-index:35}
.p1w-btn.on{background:rgba(120,180,255,.6)}
.p1w-btn.small{width:46px;height:30px;border-radius:15px;font-size:12px}
.p1w-dlg{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);width:min(760px,94vw);min-height:86px;z-index:38;
  background:rgba(250,250,252,.96);color:#1c232b;border:3px solid #3c5a78;border-radius:8px;font:17px/1.35 Arimo,sans-serif;padding:10px 16px;white-space:pre-wrap}
.p1w-dlg b{display:block;color:#2c6aa0;font-size:14px}
.p1w-dlg .opt{display:block;margin:4px 0;padding:4px 10px;border:2px solid #9ab;border-radius:5px;background:#eef3f8;cursor:pointer}
.p1w-dlg .opt.sel{border-color:#2c6aa0;background:#d7e9fb}
.p1w-toast{position:fixed;right:16px;top:64px;z-index:33;background:rgba(22,30,40,.85);border:2px solid #d9b44a;color:#fff;border-radius:6px;
  font:14px Aldrich,Arimo,sans-serif;padding:6px 12px;opacity:0;transition:opacity .3s;pointer-events:none;max-width:44vw}
.p1w-toast.on{opacity:1}
.p1w-toast small{display:block;color:#ffd970;font-size:12px}
.p1w-quest{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,92vw);min-height:230px;z-index:36;
  background:#3a353d;color:#e8e4ec;font:14px/1.45 Arimo,Arial,sans-serif;box-sizing:border-box;padding:4px 10px}
.p1w-quest .qh{position:absolute;left:0;right:0;top:-50px;height:36px;display:flex;align-items:center;justify-content:center;
  font:bold 16px Aldrich,Arimo,sans-serif;color:#fff;text-shadow:0 1px 0 #000}
.p1w-quest .qx{position:absolute;right:-6px;top:-48px;width:28px;height:28px;cursor:pointer;border:0;padding:0}
.p1w-quest .qn{font-weight:bold;font-size:16px;color:#ffd970;margin:2px 0 4px}
.p1w-quest .qg{margin-bottom:6px;white-space:pre-wrap}
.p1w-quest .qf{color:#7fc8ff;margin-bottom:8px}
.p1w-quest .qr b{display:block;color:#bdb6c6;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.p1w-quest .qr div{padding-left:10px}
`;

  let root = null, style = null;
  function el(tag, cls, parent) { const e = document.createElement(tag); if (cls) e.className = cls; (parent || root).appendChild(e); return e; }

  function mount() {
    if (root) return root;
    if (!style) { style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style); }
    root = document.createElement('div');
    root.className = 'p1w-root';
    (document.getElementById('ui') || document.body).appendChild(root);
    fade.el = el('div', 'p1w-fade');
    area.el = el('div', 'p1w-area');
    toast.el = el('div', 'p1w-toast');
    window.addEventListener('keydown', onKey);
    return root;
  }
  // Phím Quest Log gốc là L (data/settings.js, dòng Controls). Chỉ mở khi đang đi lại tự do.
  function onKey(e) {
    if (e.code !== 'KeyL' || e.repeat || P1.scene.name !== 'world') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (quests.isOpen() || (P1.world && P1.world.mode === 'explore' && !(P1.ui && P1.ui.isOpen && P1.ui.isOpen()))) quests.toggle();
  }
  function unmount() {
    window.removeEventListener('keydown', onKey);
    pad.off();
    quests.close();
    if (root) root.remove();
    root = null;
  }

  /* ---------- màn đen ---------- */
  const fade = {
    el: null,
    to(v, ms) {
      if (!fade.el) return Promise.resolve();
      fade.el.style.transitionDuration = (ms == null ? 250 : ms) + 'ms';
      fade.el.style.opacity = v;
      return new Promise(r => setTimeout(r, ms == null ? 260 : ms + 10));
    },
  };

  /* ---------- tên vùng khi đổi vùng (Label - Location gốc nằm ở HUD của shell; đây là bảng nổi) ---------- */
  const area = {
    el: null, timer: 0,
    show(name) {
      if (!area.el) return;
      area.el.textContent = name;
      area.el.classList.add('on');
      clearTimeout(area.timer);
      area.timer = setTimeout(() => area.el && area.el.classList.remove('on'), 2200);
    },
  };

  const toast = {
    el: null, timer: 0,
    show(title, sub) {
      if (!toast.el) return;
      toast.el.innerHTML = '';
      const s = document.createElement('small'); s.textContent = title;
      toast.el.appendChild(s);
      toast.el.appendChild(document.createTextNode(sub));
      toast.el.classList.add('on');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => toast.el && toast.el.classList.remove('on'), 3500);
    },
  };

  /* ---------- ảnh Pokémon lớn khi chọn khởi đầu ---------- */
  let monEl = null;
  function showMon(dex) {
    if (monEl) { monEl.remove(); monEl = null; }
    if (!dex || !root) return;
    monEl = el('div', 'p1w-mon');
    const img = el('img', '', monEl);
    img.src = 'art/pro/poke/front/' + dex + '.png';
    img.alt = '';
  }

  /* ---------- phím ảo ---------- */
  const pad = {
    els: [], on: false,
    wanted() {
      const q = P1.query && P1.query.get('touch');
      if (q === '0') return false;
      if (q === '1') return true;
      return (navigator.maxTouchPoints || 0) > 0 || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
    },
    show() {
      if (pad.on || !root || !pad.wanted()) return;
      pad.on = true;
      const input = P1.input;
      const hold = (a, v) => { if (v && !input.held[a]) input.press(a); input.held[a] = v; };
      const d = el('div', 'p1w-dpad');
      const keys = { up: [44, 0], left: [0, 44], right: [88, 44], down: [44, 88] };
      const cells = {};
      for (const k in keys) { const i = el('i', '', d); i.style.left = keys[k][0] + 'px'; i.style.top = keys[k][1] + 'px'; i.dataset.dir = k; cells[k] = i; }
      let cur = '';
      const set = dir => {
        if (dir === cur) return;
        if (cur) { hold(cur, false); cells[cur].classList.remove('on'); }
        cur = dir;
        if (cur) { hold(cur, true); cells[cur].classList.add('on'); }
      };
      const at = e => {
        const r = d.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
        if (Math.hypot(x, y) < 12) return '';
        return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
      };
      d.addEventListener('pointerdown', e => { d.setPointerCapture && d.setPointerCapture(e.pointerId); set(at(e)); e.preventDefault(); });
      d.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') set(at(e)); });
      const up = () => set('');
      d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up); d.addEventListener('lostpointercapture', up);
      pad.els.push(d);
      const btn = (label, action, css, cls) => {
        const b = el('div', 'p1w-btn' + (cls ? ' ' + cls : ''));
        b.textContent = label; b.dataset.action = action;
        Object.assign(b.style, css);
        b.addEventListener('pointerdown', e => { b.classList.add('on'); if (action === 'menu') openMenu(); else if (action === 'quests') quests.toggle(); else hold(action, true); e.preventDefault(); });
        const rel = () => { b.classList.remove('on'); if (action !== 'menu' && action !== 'quests') hold(action, false); };
        b.addEventListener('pointerup', rel); b.addEventListener('pointercancel', rel); b.addEventListener('pointerleave', rel);
        pad.els.push(b);
        return b;
      };
      // Góc dưới phải 440×280 là chỗ khung chat (luồng mạng): cụm nút đứng ngay bên trái nó.
      const R = 452;
      btn('A', 'a', { right: 'calc(' + R + 'px + env(safe-area-inset-right))', bottom: 'calc(64px + env(safe-area-inset-bottom))' });
      btn('B', 'b', { right: 'calc(' + (R + 66) + 'px + env(safe-area-inset-right))', bottom: 'calc(22px + env(safe-area-inset-bottom))' });
      btn('MENU', 'menu', { right: 'calc(' + R + 'px + env(safe-area-inset-right))', bottom: 'calc(136px + env(safe-area-inset-bottom))' }, 'small');
      btn('QUEST', 'quests', { right: 'calc(' + (R + 54) + 'px + env(safe-area-inset-right))', bottom: 'calc(136px + env(safe-area-inset-bottom))' }, 'small');
    },
    off() { pad.els.forEach(e => e.remove()); pad.els = []; pad.on = false; },
  };

  /* Menu chính do shell giữ (ESC). Nút ảo gửi đúng phím ESC để shell tự xử lý. */
  function openMenu() {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape', bubbles: true })), 30);
  }

  /* ---------- hộp thoại dự phòng (khi chưa có P1.dialog của shell) ---------- */
  const fallback = {
    box: null,
    open(name) {
      if (!root) mount();
      if (!fallback.box) fallback.box = el('div', 'p1w-dlg');
      fallback.box.innerHTML = '';
      if (name) { const b = el('b', '', fallback.box); b.textContent = name; }
      return fallback.box;
    },
    close() { if (fallback.box) { fallback.box.remove(); fallback.box = null; } },
    waitA() {
      return new Promise(res => {
        const box = fallback.box;
        const done = () => { box.removeEventListener('pointerdown', click); res(); };
        const click = e => { e.preventDefault(); cancelAnimationFrame(t); done(); };
        box.addEventListener('pointerdown', click);
        let t = 0;
        const poll = () => { if (P1.input.take('a') || P1.input.take('b')) done(); else t = requestAnimationFrame(poll); };
        P1.input.take('a');
        t = requestAnimationFrame(poll);
      });
    },
    async say(text, opt) {
      const lines = Array.isArray(text) ? text : [text];
      for (const line of lines) {
        const box = fallback.open(opt && opt.name);
        box.appendChild(document.createTextNode(line));
        await fallback.waitA();
      }
      fallback.close();
    },
    choose(text, options) {
      return new Promise(res => {
        const box = fallback.open('');
        box.appendChild(document.createTextNode(text));
        let sel = 0;
        const opts = options.map((o, i) => {
          const d = el('span', 'opt', box); d.textContent = (i + 1) + '. ' + o;
          d.addEventListener('pointerdown', e => { e.preventDefault(); finish(i); });
          return d;
        });
        const paint = () => opts.forEach((d, i) => d.classList.toggle('sel', i === sel));
        paint();
        let t = 0;
        const finish = i => { cancelAnimationFrame(t); fallback.close(); res(i); };
        P1.input.take('a');
        const poll = () => {
          const I = P1.input;
          if (I.take('down')) { sel = (sel + 1) % opts.length; paint(); }
          if (I.take('up')) { sel = (sel + opts.length - 1) % opts.length; paint(); }
          for (let i = 0; i < Math.min(4, opts.length); i++) if (I.take(String(i + 1))) return finish(i);
          if (I.take('a')) return finish(sel);
          if (I.take('b')) return finish(opts.length - 1);
          t = requestAnimationFrame(poll);
        };
        t = requestAnimationFrame(poll);
      });
    },
  };

  /* ---------- sổ nhiệm vụ (phím L): khung 'window_no border' của atlas PRO, nút đóng 'Button_round_X_*' ---------- */
  function sprite(e, name, opt) {
    try { if (P1.proui && P1.proui.has(name)) { P1.proui.apply(e, name, opt); return true; } } catch (err) { /* atlas chưa tải */ }
    return false;
  }
  const quests = {
    panel: null,
    current() { const id = P1.state.quest; return id && P1.QUESTS && P1.QUESTS[id] && !P1.state.flags['quest_done_' + id] ? P1.QUESTS[id] : null; },
    rewards(q) {
      const out = [];
      if (q.exp) out.push(q.exp + ' EXP');
      if (q.money) out.push('[PD]' + q.money);
      for (const it of q.items || []) out.push(it.n + 'x ' + P1.script.itemName(it.id));
      return out;
    },
    toggle() { if (quests.panel) quests.close(); else quests.open(); },
    open() {
      if (quests.panel || !root) return;
      const p = quests.panel = el('div', 'p1w-quest');
      if (!sprite(p, 'window_no border')) Object.assign(p.style, { border: '2px solid #6b6272', borderTopWidth: '58px', borderRadius: '8px', padding: '10px 14px' });
      const add = (cls, text, parent) => { const e = el('div', cls, parent || p); if (text != null) e.textContent = text; return e; };
      add('qh', 'Nhiệm vụ');
      const x = el('button', 'qx', p);
      x.title = 'Đóng';
      if (!sprite(x, 'Button_round_X_normal')) x.textContent = '×';
      x.addEventListener('pointerenter', () => sprite(x, 'Button_round_X_hover'));
      x.addEventListener('pointerleave', () => sprite(x, 'Button_round_X_normal'));
      x.addEventListener('pointerdown', e => { e.preventDefault(); sprite(x, 'Button_round_X_pressed'); });
      x.addEventListener('click', () => quests.close());
      const q = quests.current();
      if (!q) { add('qg', 'Chưa có nhiệm vụ nào.'); return; }
      add('qn', q.name);
      add('qg', q.goal || '');
      if (q.from) add('qf', 'Từ: ' + q.from);
      const r = add('qr');
      el('b', '', r).textContent = 'Phần thưởng';
      for (const t of quests.rewards(q)) add('', t, r);
    },
    close() { if (quests.panel) { quests.panel.remove(); quests.panel = null; } },
    isOpen() { return !!quests.panel; },
  };

  P1.worldUi = { mount, unmount, fade, area, toast, showMon, pad, fallback, quests, openMenu };
})(window.P1 = window.P1 || {});
