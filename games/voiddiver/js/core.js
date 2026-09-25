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
    enabled: true,
    down(a) { if (!this.held[a]) this.pressed[a] = true; this.held[a] = true; },
    up(a) { if (this.held[a]) this.released[a] = true; this.held[a] = false; },
    endFrame() { this.pressed = Object.create(null); this.released = Object.create(null); },
    clear() { this.held = Object.create(null); this.endFrame(); },
  };

  function bind(el) {
    addEventListener('keydown', e => {
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
    addEventListener('pointerup', e => { const a = MOUSEMAP[e.button]; if (a) input.up(a); });
    // Ngắm nghe trên window và tính theo khung canvas, để lớp phủ nào nằm trên canvas cũng không làm mất hướng ngắm.
    addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      input.mouse.x = e.clientX - r.left; input.mouse.y = e.clientY - r.top;
      input.mouse.inside = input.mouse.x >= 0 && input.mouse.y >= 0 && input.mouse.x <= r.width && input.mouse.y <= r.height;
    });
  }

  function pollMove() {
    const h = input.held;
    let x = (h.right ? 1 : 0) - (h.left ? 1 : 0), y = (h.up ? 1 : 0) - (h.down ? 1 : 0);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0, ay = -(p.axes[1] || 0);
      if (Math.hypot(ax, ay) > 0.2) { x = ax; y = ay; }
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    input.move.x = x; input.move.y = y;
  }

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
          pollMove();
          // Trong hitstop giữ nguyên phím vừa nhấn để đòn nối combo không bị nuốt.
          if (this.hitstop > 0) { this.hitstop -= STEP; }
          else {
            this.time += STEP * this.timeScale; this.frame++;
            if (this.update) this.update(STEP * this.timeScale);
            input.endFrame();
          }
        }
        if (this.render) this.render(dt);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    stop() { this.running = false; },
  };

  VD.input = input;
  VD.bindInput = bind;
  VD.rng = rng;
  VD.save = save;
  VD.loop = loop;
  VD.STEP = STEP;
})(window.VD = window.VD || {});
