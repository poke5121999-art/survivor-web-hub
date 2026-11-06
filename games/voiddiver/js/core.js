// Vòng lặp khung, input, RNG, lưu. Phím lấy từ InputActionAsset gốc (dependencies_assets_input).
(function (VD) {
  'use strict';

  // Tên hành động khớp InputActionAsset gốc (map Player/PlayerFunc/InGame).
  const KEYMAP = {
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
    ShiftLeft: 'Run', ShiftRight: 'Run',
    Space: 'SkillDash', KeyF: 'Interact', KeyV: 'SwapWeapon',
    KeyQ: 'SkillTwo', KeyE: 'SkillThree', KeyR: 'SkillFour', KeyC: 'SkillEquipment',
    Digit1: 'Item1', Digit2: 'Item2', Digit3: 'Item3', Digit4: 'Item4', Digit5: 'Item5',
    Tab: 'Inventory', KeyM: 'Minimap', Escape: 'Menu', KeyX: 'Menu', KeyG: 'ToggleQuestHud',
  };
  const MOUSEMAP = { 0: 'SkillBasicAttack', 2: 'SkillOne' };

  const input = {
    held: Object.create(null),     // hành động → đang giữ
    pressed: Object.create(null),  // hành động → nhấn trong khung này
    released: Object.create(null),
    mouse: { x: 0, y: 0, inside: false },
    move: { x: 0, y: 0 },          // trục màn hình: x phải, y lên
    // Tay cầm: hướng ngắm AimPad đã làm mượt (_aimPadDir), đang ngắm bằng cần phải (_isAimPadActive), đích (_aimPadTarget).
    aimPad: { x: 0, y: 0, active: false, tx: 0, ty: 0, offAt: 0 },
    padMove: null,                 // cần trái sau vùng chết (null = không đẩy)
    padQuick: 0,                   // ô nhanh đang chọn bằng D-pad (InGameQuickSlotPanel._selectedSlotIndex)
    device: 'keyboard',            // EControlDevice gốc: Keyboard (1) | GamePad (2); InputManager..ctor khởi đầu Keyboard
    enabled: true,
    down(a) { if (!this.held[a]) this.pressed[a] = true; this.held[a] = true; },
    up(a) { if (this.held[a]) this.released[a] = true; this.held[a] = false; },
    endFrame() { this.pressed = Object.create(null); this.released = Object.create(null); },
    clear() { this.held = Object.create(null); this.endFrame(); padHeld.forEach((v, k) => { if (v !== null) padHeld.set(k, null); }); },
  };

  // Đổi thiết bị như De.Base InputManager.OnAnyInputEvent: sự kiện tay cầm có cần vượt vùng chết, cò > 0,1 hay nút bấm → GamePad;
  // phím bất kỳ → Keyboard; chuột chỉ tính khi nhích ≥ 20 px trong một sự kiện hoặc có nút/lăn. Hai lần đổi cách nhau
  // ít nhất DEVICE_SWITCH_COOLDOWN 0,3 s. Có đổi thì bắn 'vd-device' để giao diện đổi ảnh phím.
  const DEVICE_SWITCH_COOLDOWN = 0.3, MOUSE_SWITCH_PX = 20, TRIGGER_SWITCH = 0.1;
  let lastSwitch = -Infinity;
  function setDevice(d) {
    if (d === input.device) return;
    const now = performance.now() / 1000;
    if (now - lastSwitch < DEVICE_SWITCH_COOLDOWN) return;
    lastSwitch = now;
    input.device = d;
    if (document.body) document.body.dataset.inputDevice = d;
    dispatchEvent(new CustomEvent('vd-device', { detail: d }));
  }
  input.setDevice = setDevice;
  input.isPad = () => input.device === 'gamepad';

  function bind(el) {
    addEventListener('keydown', e => {
      if (!e.vdPad) setDevice('keyboard');
      const a = KEYMAP[e.code];
      if (!a) return;
      if (a === 'Inventory' || a === 'SkillDash' || a === 'Menu') e.preventDefault();
      if (!e.repeat) input.down(a);
    });
    addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) input.up(a); });
    addEventListener('blur', () => input.clear());
    el.addEventListener('contextmenu', e => e.preventDefault());
    // Bấm chỉ tính khi trúng canvas: đang mở bảng giao diện mà bấm thì không vung kiếm.
    el.addEventListener('pointerdown', e => { const a = MOUSEMAP[e.button]; if (a) { e.preventDefault(); input.down(a); } });
    addEventListener('pointerdown', () => setDevice('keyboard'), true);
    addEventListener('wheel', () => setDevice('keyboard'), { capture: true, passive: true });
    addEventListener('pointerup', e => { const a = MOUSEMAP[e.button]; if (a) input.up(a); });
    // Ngắm nghe trên window và tính theo khung canvas, để lớp phủ nào nằm trên canvas cũng không làm mất hướng ngắm.
    addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      input.mouse.x = e.clientX - r.left; input.mouse.y = e.clientY - r.top;
      input.mouse.inside = input.mouse.x >= 0 && input.mouse.y >= 0 && input.mouse.x <= r.width && input.mouse.y <= r.height;
      if (Math.hypot(e.movementX || 0, e.movementY || 0) >= MOUSE_SWITCH_PX || e.buttons) setDevice('keyboard');
    });
  }

  // ---- tay cầm: binding nhóm GamePad của InputActionAsset gốc (PlayerFunc / InGame / InGamePad / Ui / Cutscene).
  // Chỉ số nút theo "standard mapping" của trình duyệt: 0 A (South), 1 B (East), 2 X (West), 3 Y (North), 4 LB, 5 RB, 6 LT,
  // 7 RT, 8 View (Select), 9 Menu (Start), 10 bấm cần trái, 11 bấm cần phải, 12–15 D-pad lên/xuống/trái/phải.
  const PAD_ACTION = {
    3: 'SkillBasicAttack',  // PlayerFunc/SkillBasicAttack <Gamepad>/buttonNorth
    2: 'SkillOne',          // buttonWest
    5: 'SkillTwo',          // rightShoulder
    7: 'SkillThree',        // rightTrigger
    6: 'SkillFour',         // leftTrigger
    13: 'SkillEquipment',   // dpad/down
    1: 'SkillDash',         // buttonEast
    0: 'Interact',          // buttonSouth
    10: 'Run',              // leftStickPress
    8: 'Minimap',           // InGame/Minimap <Gamepad>/select
  };
  // Hộp thoại / cắt cảnh đang mở: nút phát lại thành phím bàn phím để dialog.js dùng chung một đường nghe: A → Space (Ui/Skip
  // "Tiếp theo"), RT → Ctrl (Ui/NextFlow "Bỏ qua nhanh"), B → Escape (Ui/Escape, giữ để bỏ qua).
  // Start (InGame/Inventory) và mọi nút khi túi đồ mở do js/ui/menu.js tự đọc (VD.menu.padClosed / padInput).
  const PAD_UI_KEY = { 0: 'Space', 7: 'ControlLeft', 1: 'Escape' };
  const PAD_BUTTONS = [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15];   // nút làm đổi sang GamePad (cò 6/7 tính theo trị)
  // Vùng chết cần: StickDeadzone mặc định của Input System (0,125 / 0,925). [SUY LUẬN: InputSettings gốc chưa bóc; lấy mặc định Unity]
  const DZ_MIN = 0.125, DZ_MAX = 0.925;
  const AIM_PAD_DEACTIVATE_DELAY = 0.15;   // PlayerInputController const
  const AIM_PAD_SMOOTH = 40 / 100 * 10;    // get_AimPadSmoothSpeed = PadSensitivity (mặc định 40, CreateDefault) / 100 × 10
  const padHeld = new Map();               // nút → hành động / '#mã phím phát lại' / null (đang giữ nhưng không làm gì)
  const uiMode = () => (!!(VD.dialog && VD.dialog.open) || !!(VD.dive && VD.dive.cutscene)) && !(VD.inventory && VD.inventory.open);

  function stick(x, y) {
    const m = Math.hypot(x, y);
    if (m < DZ_MIN) return { x: 0, y: 0, m: 0 };
    const n = Math.min(1, (m - DZ_MIN) / (DZ_MAX - DZ_MIN));
    return { x: x / m * n, y: y / m * n, m: n };
  }
  function synth(type, code) {
    const ev = new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code.replace(/Left$/, ''), bubbles: true, cancelable: true });
    ev.vdPad = true;
    dispatchEvent(ev);
  }
  function padDown(i) {
    // D-pad trái/phải: InGamePad/QuickSlotMoveLeft/Right (vòng quanh 5 ô, OnQuickSlotMoveLeft); lên: QuickSlotUse.
    if (i === 14 || i === 15) { input.padQuick = (input.padQuick + (i === 15 ? 1 : -1) + 5) % 5; padHeld.set(i, null); return; }
    if (i === 12) { const a = 'Item' + (input.padQuick + 1); padHeld.set(i, a); input.down(a); return; }
    const key = uiMode() ? PAD_UI_KEY[i] : null;
    if (key) { padHeld.set(i, '#' + key); synth('keydown', key); return; }
    const a = PAD_ACTION[i] || null;
    padHeld.set(i, a);
    if (a) input.down(a);
  }
  function padUp(i) {
    const a = padHeld.get(i);
    padHeld.delete(i);
    if (!a) return;
    if (a[0] === '#') synth('keyup', a.slice(1)); else input.up(a);
  }

  function firstPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads || []) if (p && p.connected !== false) return p;
    return null;
  }

  // Mỗi bước cố định: đọc tay cầm, cập nhật nút / cần / hướng ngắm.
  function pollPad(dt) {
    const p = firstPad();
    if (!p) { for (const i of [...padHeld.keys()]) padUp(i); input.padMove = null; input.aimPad.active = false; return; }
    const b = p.buttons || [], ax = p.axes || [];
    const val = i => { const x = b[i]; return !x ? 0 : typeof x === 'object' ? (x.value || (x.pressed ? 1 : 0)) : +x; };
    const on = i => val(i) > 0.5 || !!(b[i] && b[i].pressed);
    const L = stick(ax[0] || 0, -(ax[1] || 0)), R = stick(ax[2] || 0, -(ax[3] || 0));
    let active = L.m > 0 || R.m > 0 || val(6) > TRIGGER_SWITCH || val(7) > TRIGGER_SWITCH;
    for (const i of PAD_BUTTONS) if (on(i)) active = true;
    if (active) setDevice('gamepad');
    for (let i = 0; i < 16; i++) { if (on(i)) { if (!padHeld.has(i)) padDown(i); } else if (padHeld.has(i)) padUp(i); }
    input.padMove = L.m > 0 ? L : null;
    // AimPad (OnAimPad): cần phải > 0,01 → đích = hướng × (1 − cos(độ lớn × π/2)), bật ngắm; thả cần → đích 0 và tắt ngắm
    // sau AIM_PAD_DEACTIVATE_DELAY. FixedUpdate: dir += (đích − dir) × clamp01(dt × AimPadSmoothSpeed).
    const A = input.aimPad, now = performance.now() / 1000;
    if (R.m > 0.01) {
      const k = (1 - Math.cos(Math.min(1, R.m) * Math.PI * 0.5)) / R.m;
      A.tx = R.x * k; A.ty = R.y * k; A.active = true; A.offAt = 0;
    } else {
      A.tx = 0; A.ty = 0;
      if (A.active && !A.offAt) A.offAt = now + AIM_PAD_DEACTIVATE_DELAY;
      if (A.offAt && now >= A.offAt) { A.active = false; A.offAt = 0; }
    }
    const f = Math.min(1, Math.max(0, dt * AIM_PAD_SMOOTH));
    A.x += (A.tx - A.x) * f; A.y += (A.ty - A.y) * f;
  }

  function pollMove(dt) {
    pollPad(dt);
    const h = input.held;
    let x = (h.right ? 1 : 0) - (h.left ? 1 : 0), y = (h.up ? 1 : 0) - (h.down ? 1 : 0);
    if (input.padMove) { x = input.padMove.x; y = input.padMove.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    input.move.x = x; input.move.y = y;
  }

  // ---- ảnh phím theo thiết bị (II_ImagePrompt gốc): bàn phím dùng sprite của prefab (art/ui/tutorial/key), tay cầm dùng bộ
  // IconSet_XBox_VoidDiver (fallbackGamepadIconSet của InputIconSetConfigurator) bóc ra art/ui/tutorial/pad.
  // only: 'kb' = deviceType KeyboardAndMouse (ẩn khi dùng tay cầm, như phím F của DialogPopup), 'pad' = chỉ tay cầm.
  // Hành động không có binding tay cầm (InGame/ToggleKeyGuide chỉ có O) → ảnh unboundData của bộ icon.
  const PAD_ICON = { buttonSouth: 'south', buttonEast: 'east', buttonWest: 'west', buttonNorth: 'north', leftShoulder: 'l1',
    leftTrigger: 'l2', rightShoulder: 'r1', rightTrigger: 'r2', leftStick: 'lStick', rightStick: 'rStick', leftStickPress: 'lStick_Click',
    rightStickPress: 'rStick_Click', dpad: 'dPad', 'dpad/up': 'dPad_Up', 'dpad/down': 'dPad_Down', 'dpad/left': 'dPad_Left',
    'dpad/right': 'dPad_Right', start: 'Start', select: 'Select' };
  const KEY_DIR = 'art/ui/tutorial/key/', PAD_DIR = 'art/ui/tutorial/pad/';
  VD.padIconUrl = p => PAD_DIR + (PAD_ICON[String(p || '').replace('<Gamepad>/', '')] || 'unbound') + '.webp';
  function promptState(img) {
    const pad = input.device === 'gamepad', only = img.dataset.only;
    const src = pad ? VD.padIconUrl(img.dataset.pad) : KEY_DIR + img.dataset.kb + '.webp';
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    img.hidden = (only === 'kb' && pad) || (only === 'pad' && !pad);
  }
  VD.keyPrompt = function (kb, pad, only, cls) {
    const img = document.createElement('img');
    img.className = cls || 'vd-key'; img.alt = '';
    img.dataset.kb = kb; img.dataset.pad = pad || ''; if (only) img.dataset.only = only;
    promptState(img);
    return img.outerHTML;
  };
  VD.refreshPrompts = root => (root || document).querySelectorAll('img[data-kb]').forEach(promptState);
  addEventListener('vd-device', () => VD.refreshPrompts());

  // mulberry32: đủ cho loot và spawn, tái lập được theo hạt giống.
  function rng(seed) {
    let s = seed >>> 0;
    const f = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (a, b) => a + (b - a) * f();
    f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.weighted = (items, w) => {
      let tot = 0; for (const it of items) tot += w(it);
      let r = f() * tot;
      for (const it of items) { r -= w(it); if (r <= 0) return it; }
      return items[items.length - 1];
    };
    return f;
  }

  const SAVE_KEY = 'voiddiver.save.v2';
  const save = {
    load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch (e) { return null; } },
    write(state) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* chế độ riêng tư */ } },
    wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* chế độ riêng tư */ } },
  };

  // Bước cố định 60 Hz cho mô phỏng, vẽ mỗi khung. `timeScale` dùng cho hitstop.
  const STEP = 1 / 60;
  const loop = {
    time: 0, frame: 0, timeScale: 1, hitstop: 0, running: false,
    update: null, render: null,
    start() {
      if (this.running) return;
      this.running = true;
      let last = performance.now(), acc = 0;
      const tick = now => {
        if (!this.running) return;
        let dt = Math.min(0.1, (now - last) / 1000); last = now;
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < 6) {
          acc -= STEP; steps++;
          pollMove(STEP);
          // Trong hitstop giữ nguyên phím vừa nhấn để đòn nối combo không bị nuốt.
          if (this.hitstop > 0) { this.hitstop -= STEP; }
          else {
            this.time += STEP * this.timeScale; this.frame++;
            if (this.update) this.update(STEP * this.timeScale);
            input.endFrame();
          }
        }
        this.alpha = Math.min(1, acc / STEP);   // phần bước chưa mô phỏng: stage.render nội suy vị trí hình
        if (this.render) this.render(dt);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    stop() { this.running = false; this.alpha = 1; },
  };

  VD.input = input;
  VD.PAD_ACTION = PAD_ACTION;
  VD.bindInput = bind;
  VD.rng = rng;
  VD.save = save;
  VD.loop = loop;
  VD.STEP = STEP;
})(window.VD = window.VD || {});
