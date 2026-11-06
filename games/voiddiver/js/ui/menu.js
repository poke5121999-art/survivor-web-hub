// Khung MenuPopup gốc (remote_prefab_assets_popup/MenuPopup): 7 thẻ Tabs[] trên cùng + Pages[] — trang Túi đồ ở inventory.js,
// các trang còn lại ở ui/menu_pages.js. Tệp này lo: dựng thanh thẻ, đổi trang (Q/E, LT/RT, bấm), đóng (Esc/X/Tab/B/Start),
// điều khiển bằng tay cầm (UI + UiPad map của InputActionAsset: d-pad/cần trái dời ô, A chọn, B thoát…), đổi hình phím
// theo thiết bị như II_DeviceBasedObjectController / II_ImagePrompt.
// Toạ độ: khung tham chiếu 1920×1080 (CanvasScaler gốc), đo bằng tools/ui_inventory_dump.py — xem docs/DIVE.md §12.
(function (VD) {
  'use strict';
  const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const UI = 'art/ui/inventory/';

  // MenuPopup/Contents*/Tabs[]: thứ tự và sprite đúng prefab — OptionTab mang icon MenuSystem, SystemTab mang MenuOption.
  const TABS = [
    { id: 'Quest', icon: 'MenuQuest1', sub: 'MenuQuest2' },
    { id: 'Inventory', icon: 'MenuInventory' },
    { id: 'Character', icon: 'MenuCharacter' },
    { id: 'Archive', icon: 'MenuEncyclopedia' },
    { id: 'Squad', icon: 'MenuSquad' },
    { id: 'Option', icon: 'MenuSystem' },
    { id: 'System', icon: 'MenuOption' },
  ];
  const M = { TABS, pages: {}, cur: 'Inventory', ui: null, device: 'kbm', focusEl: null };

  // Nút tay cầm theo đường binding của InputActionAsset (UI/UiPad map); ảnh lấy từ bộ IconSet_XBox_VoidDiver qua VD.padIconUrl
  // (core.js, cùng bộ với VD.keyPrompt), không có thì dùng sprite XBox_* bóc từ dependencies_assets_texture.
  const PAD_PATH = { XBox_A: 'buttonSouth', XBox_B: 'buttonEast', XBox_X: 'buttonWest', XBox_Y: 'buttonNorth', XBox_LB: 'leftShoulder',
    XBox_RB: 'rightShoulder', XBox_LT: 'leftTrigger', XBox_RT: 'rightTrigger', XBox_Menu: 'start', XBox_View: 'select',
    XBox_Left_Stick: 'leftStick', XBox_Right_Stick: 'rightStick', XBox_Left_Stick_Click: 'leftStickPress', XBox_Right_Stick_Click: 'rightStickPress',
    XBox_Dpad: 'dpad', XBox_Dpad_Up: 'dpad/up', XBox_Dpad_Down: 'dpad/down', XBox_Dpad_Left: 'dpad/left', XBox_Dpad_Right: 'dpad/right' };
  M.padSrc = n => (VD.padIconUrl && PAD_PATH[n] ? VD.padIconUrl(PAD_PATH[n]) : UI + n + '.webp');
  M.padImg = (n, cls) => `<img class="${cls || 'key p'}" src="${M.padSrc(n)}" alt="">`;
  // Ảnh phím: bàn phím / chuột và tay cầm cùng chỗ, CSS hiện cái theo thiết bị đang dùng (.vd-inv.pad).
  M.key = function (keys, pads) {
    const k = (keys || []).map(n => `<img class="key k" src="${UI}${n}.webp" alt="">`).join('');
    const p = (pads || []).map(n => M.padImg(n)).join('');
    return k + p;
  };
  // Dải phím dưới trái của mỗi trang (KeyGuide!: HorizontalLayoutGroup cách 20, trong nhóm cách 14, chữ 20 #DCDCDC).
  M.keyGuide = function (items) {
    return `<div class="mp-keys">${items.map(x => `<div class="kg${x.cls ? ' ' + x.cls : ''}">${M.key(x.k, x.p)}<span>${x.html || TX(x.t)}</span></div>`).join('')}</div>`;
  };
  M.CLOSE = { k: ['Escape_Key', 'X_Key'], p: ['XBox_B'], t: 'UI_Close_Esc' };
  M.SELECT = { k: ['Mouse_Left_Key'], p: ['XBox_A'], t: 'Select' };

  M.register = function (id, def) { M.pages[id] = def; };

  // inventory.js gọi khi dựng bảng lần đầu: thanh thẻ + khung các trang khác.
  M.mount = function (ui) {
    M.ui = ui;
    const bar = ui.tabs;
    bar.innerHTML = TABS.map((t, i) => `<div class="tab" data-i="${i}" data-tab="${t.id}"><i style="--m:url(../${UI}${t.icon}.webp)"></i>${t.sub ? `<i class="sub" style="--m:url(../${UI}${t.sub}.webp)"></i>` : ''}</div>`).join('') +
      `<span class="kq">${M.key(['Q_Key'], ['XBox_LT'])}</span><span class="ke">${M.key(['E_Key'], ['XBox_RT'])}</span>`;
    bar.addEventListener('click', e => {
      const t = e.target.closest('.tab');
      if (!t) return;
      if (M.locked(t.dataset.tab)) { if (VD.dialog && VD.dialog.toast) VD.dialog.toast(TX('SquadTabLockedMessage')); sfx('Fail'); return; }
      M.show(t.dataset.tab);
    });
    bar.querySelector('.kq').addEventListener('click', () => M.cycle(-1));
    bar.querySelector('.ke').addEventListener('click', () => M.cycle(1));
    M.pageEls = { Inventory: ui.invPage };
    for (const t of TABS) {
      if (t.id === 'Inventory') continue;
      const el = $('div', 'vd-mp mp-' + t.id.toLowerCase(), ui.page);
      el.dataset.tab = t.id;
      M.pageEls[t.id] = el;
      const def = M.pages[t.id];
      if (def && def.build) def.build(el, M);
    }
    // Thiết bị lấy từ core.js (InputManager.OnAnyInputEvent gốc: ngưỡng chuột 20 px, cooldown 0,3 s) — một nguồn cho cả game.
    addEventListener('vd-device', e => applyDevice(e.detail === 'gamepad' ? 'pad' : 'kbm'));
    if (VD.input && VD.input.device) applyDevice(VD.input.device === 'gamepad' ? 'pad' : 'kbm');
    M.show('Inventory', true);
  };

  // Thẻ Tổ đội khoá khi chưa thoả Npc 700012 (Người gác cổng co-op).UnlockConditions hoặc còn trong hướng dẫn
  // (MenuPopupPresenter.IsSquadTabLocked = !CheckStateConditions(...) || IsTutorial). Thẻ khác không khoá. [ĐO]
  M.locked = function (id) {
    if (id !== 'Squad') return false;
    const p = (VD.profile && VD.profile.get && VD.profile.get()) || {};
    const npc = ((VD.T && VD.T.Npc) || []).find(n => n.Id === 700012);
    const ok = (npc && npc.UnlockConditions || []).every(([k, v]) => k === 'UserLevel' ? (p.userLevel || 1) >= v : k === 'None');
    return !ok || !!p.isTutorial;
  };
  M.show = function (id, quiet) {
    if (!M.pageEls || !M.pageEls[id]) return;
    if (M.locked(id)) return;
    const prev = M.cur;
    if (prev !== id && M.pages[prev] && M.pages[prev].hide) M.pages[prev].hide();
    M.cur = id;
    for (const k in M.pageEls) M.pageEls[k].classList.toggle('on', k === id);
    M.ui.tabs.querySelectorAll('.tab').forEach(t => { t.classList.toggle('on', t.dataset.tab === id); t.classList.toggle('locked', M.locked(t.dataset.tab)); });
    M.ui.root.dataset.tab = id;
    M.blur();
    if (id === 'Inventory') { if (VD.inventory.refresh) VD.inventory.refresh(); }
    else if (VD.inventory.hideTip) VD.inventory.hideTip();
    if (M.pages[id] && M.pages[id].show) M.pages[id].show();
    if (!quiet && prev !== id) sfx('ButtonClick');
    if (M.device === 'pad') M.autoFocus();
  };
  // Q/E (LT/RT): sang thẻ trái/phải, bỏ qua thẻ khoá, không vòng quanh (dừng ở thẻ đầu/cuối). [ĐO]
  M.cycle = function (d) {
    let i = TABS.findIndex(t => t.id === M.cur) + d;
    while (i >= 0 && i < TABS.length && M.locked(TABS[i].id)) i += d;
    if (i >= 0 && i < TABS.length) M.show(TABS[i].id);
  };
  M.onOpen = function (tab) {
    M.show(M.locked(tab) ? 'Inventory' : tab || 'Inventory', true);
    startPadLoop();
  };
  M.onClose = function () {
    if (M.pages[M.cur] && M.pages[M.cur].hide) M.pages[M.cur].hide();
    M.blur();
  };
  // Phím bàn phím khi bảng mở (inventory.js chuyển tới). Trả true nếu đã xử lý.
  M.onKey = function (e) {
    if (e.code === 'KeyQ' && !e.repeat) { e.preventDefault(); M.cycle(-1); return true; }
    if (e.code === 'KeyE' && !e.repeat) { e.preventDefault(); M.cycle(1); return true; }
    const p = M.pages[M.cur];
    return !!(p && p.onKey && p.onKey(e));
  };

  function sfx(n) { return VD.audio && VD.audio.sfx ? VD.audio.sfx(n) : null; }
  M.sfx = sfx;

  // ================================================================ thiết bị (II_DeviceBasedObjectController)
  function applyDevice(d) {
    if (M.device === d) return;
    M.device = d;
    if (M.ui) M.ui.root.classList.toggle('pad', d === 'pad');
    if (d === 'kbm') M.blur();
  }
  // Khi bảng mở, core.js không đọc tay cầm (menu.js đọc) nên báo ngược về core; core bắn 'vd-device' rồi applyDevice chạy.
  M.setDevice = function (d) {
    if (VD.input && VD.input.setDevice) VD.input.setDevice(d === 'pad' ? 'gamepad' : 'keyboard');
    else applyDevice(d);
  };

  // ================================================================ tay cầm
  // Chỉ số nút theo Gamepad "standard mapping" ↔ đường dẫn InputActionAsset gốc (UI + UiPad map, ~/Downloads/vd-ref/cache/input_strings.txt):
  //   0 buttonSouth  Submit / DragAndDrop / Skip        1 buttonEast   UI/Escape (đóng)
  //   2 buttonWest   UI/UseItem, UiPad/Restore          3 buttonNorth  UiPad/InsertGoods, QuickSubmit, Delete, UI/Toggle
  //   4 leftShoulder UI/InventorySelectOne              5 rightShoulder UiPad/DropGoods
  //   6 leftTrigger  UiPad/TabLeft                      7 rightTrigger UiPad/TabRight
  //   8 select       UI/MarkGoods                       9 start        UI/CloseMenu (InGame/Inventory khi đang đóng)
  //   11 rightStickPress UI/Organize                    12–15 d-pad    UiPad/MoveScroll, OptionLeft/Right
  //   cần trái (deadzone 0,25–0,925) MoveScroll; cần phải MovePanel.
  const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  M.BTN = BTN;
  const P = { prev: [], dir: null, dirAt: 0, rdir: null };
  function firstPad() {
    const ps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of ps || []) if (p && p.connected !== false && p.buttons && p.buttons.length) return p;
    return null;
  }
  // Đọc một khung: cạnh nhấn nút, hướng (d-pad / cần trái, lặp sau 0,35 s mỗi 0,12 s), hướng cần phải (một lần).
  M.padRead = function (now) {
    const p = firstPad();
    const out = { pressed: [], held: [], dir: null, rdir: null, any: false };
    if (!p) { P.prev = []; P.dir = null; P.rdir = null; return out; }
    const b = p.buttons.map(x => !!(x && (x.pressed || x.value > 0.5)));
    for (let i = 0; i < b.length; i++) {
      if (b[i]) out.held.push(i);
      if (b[i] && !P.prev[i]) out.pressed.push(i);
    }
    P.prev = b;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    let d = b[BTN.UP] ? 'up' : b[BTN.DOWN] ? 'down' : b[BTN.LEFT] ? 'left' : b[BTN.RIGHT] ? 'right' : null;
    if (!d && Math.hypot(ax, ay) > 0.5) d = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
    if (d && d !== P.dir) { out.dir = d; P.dirAt = now + 350; }
    else if (d && now >= P.dirAt) { out.dir = d; P.dirAt = now + 120; }
    P.dir = d;
    const rx = p.axes[2] || 0, ry = p.axes[3] || 0;
    const rd = Math.hypot(rx, ry) > 0.6 ? (Math.abs(rx) > Math.abs(ry) ? (rx > 0 ? 'right' : 'left') : (ry > 0 ? 'down' : 'up')) : null;
    if (rd && rd !== P.rdir) out.rdir = rd;
    P.rdir = rd;
    out.any = out.pressed.length > 0 || !!out.dir || !!out.rdir;
    return out;
  };

  let loopOn = false;
  function startPadLoop() {
    if (loopOn) return;
    loopOn = true;
    const tick = () => {
      if (!VD.inventory.open) { loopOn = false; return; }
      padStep(performance.now());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function padStep(now) {
    const r = M.padRead(now);
    if (!r.any) return;
    M.setDevice('pad');
    M.padInput(r);
  }
  // Tách riêng để bài kiểm gọi được với trạng thái giả.
  M.padInput = function (r) {
    const has = i => r.pressed.indexOf(i) >= 0;
    const pg = M.cur === 'Inventory' ? VD.inventory.padPage : M.pages[M.cur];
    const ctx = { held: i => r.held.indexOf(i) >= 0 };
    if (has(BTN.START)) { VD.inventory.toggle(false); return; }
    if (has(BTN.LT)) { M.cycle(-1); return; }
    if (has(BTN.RT)) { M.cycle(1); return; }
    if (!M.focusEl || !document.contains(M.focusEl) || !visible(M.focusEl)) M.autoFocus();
    if (r.dir) {
      if (!(pg && pg.padDir && pg.padDir(r.dir, M.focusEl, ctx))) M.move(r.dir);
    }
    if (r.rdir && pg && pg.padPanel) pg.padPanel(r.rdir, M.focusEl);
    for (const i of r.pressed) {
      if (i === BTN.START || i === BTN.LT || i === BTN.RT) continue;
      if (pg && pg.pad && pg.pad(i, M.focusEl, ctx)) continue;
      if (i === BTN.A && M.focusEl) { M.focusEl.click(); continue; }
      if (i === BTN.B) { VD.inventory.toggle(false); return; }
    }
  };

  // ---------------------------------------------------------------- tiêu điểm (dời theo hình học như Selectable.FindSelectable của uGUI)
  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }
  M.navItems = function () {
    const pg = M.cur === 'Inventory' ? VD.inventory.padPage : M.pages[M.cur];
    if (pg && pg.navItems) return pg.navItems().filter(visible);
    const el = M.pageEls && M.pageEls[M.cur];
    return el ? [...el.querySelectorAll('[data-nav]')].filter(e => !e.classList.contains('disabled') && visible(e)) : [];
  };
  M.autoFocus = function () {
    const items = M.navItems();
    if (items.length) M.focus(items[0]);
  };
  M.focus = function (el) {
    if (M.focusEl && M.focusEl !== el) M.focusEl.classList.remove('pad-focus');
    M.focusEl = el || null;
    if (!el) return;
    el.classList.add('pad-focus');
    const pg = M.cur === 'Inventory' ? VD.inventory.padPage : M.pages[M.cur];
    if (pg && pg.onFocus) pg.onFocus(el);
    else el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  M.blur = function () {
    if (M.focusEl) M.focusEl.classList.remove('pad-focus');
    M.focusEl = null;
  };
  M.move = function (dir) {
    const items = M.navItems();
    if (!items.length) return;
    const cur = M.focusEl && items.indexOf(M.focusEl) >= 0 ? M.focusEl : null;
    if (!cur) { M.focus(items[0]); return; }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best = null, bs = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;
      const along = dx * v[0] + dy * v[1];
      if (along <= 1) continue;
      const across = Math.abs(dx * v[1]) + Math.abs(dy * v[0]);
      const s = along + across * 2;
      if (s < bs) { bs = s; best = el; }
    }
    if (best) { M.focus(best); sfx('ButtonClick'); }
  };

  // Khi bảng đóng (lượt lặn đang chơi): Start mở trang Túi đồ (InGame/Inventory = <Gamepad>/start). Gọi từ inventory.step.
  M.padClosed = function () {
    const r = M.padRead(performance.now());
    if (r.pressed.indexOf(BTN.START) >= 0) { M.setDevice('pad'); return true; }
    return false;
  };

  VD.menu = M;
})(window.VD = window.VD || {});
