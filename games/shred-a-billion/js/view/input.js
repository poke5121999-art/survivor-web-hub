// Input: original PC scheme (WASD/arrows, mouse look, LMB primary, RMB secondary, E interact, Space jump,
// Shift sprint, Ctrl/C crouch, 1-5 hotbar, Tab/U upgrades, Esc pause) + touch (left stick, right drag look, buttons).
export class Input {
  constructor(canvas, hudRoot) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookDX = 0; this.lookDY = 0;
    this.primary = false; this.secondary = false;
    this.pressed = new Set();       // one-shot actions this frame
    this.touch = { stickId: null, sx: 0, sy: 0, mx: 0, mz: 0, lookId: null, lx: 0, ly: 0, active: false };
    this.enabled = true;
    this.sens = 1;
    addEventListener('keydown', e => this._key(e, true));
    addEventListener('keyup', e => this._key(e, false));
    addEventListener('blur', () => { this.keys.clear(); this.primary = this.secondary = false; });
    canvas.addEventListener('mousedown', e => {
      if (!this.enabled) return;
      if (document.pointerLockElement !== canvas && !this.touch.active) { this.requestLock(); }
      if (e.button === 0) { this.primary = true; this.pressed.add('primary'); }
      if (e.button === 2) { this.secondary = true; this.pressed.add('secondary'); }
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.primary = false; if (e.button === 2) this.secondary = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    // Chrome emits one huge movementX/Y right after the lock is taken (and sometimes on fast flicks across
    // the window edge): drop events for 150 ms after locking and any single jump over 600 px.
    this.lockedAt = 0;
    document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement === canvas) this.lockedAt = performance.now(); });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== canvas) return;
      if (performance.now() - this.lockedAt < 150) return;
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      this.lookDX += e.movementX; this.lookDY += e.movementY;
    });
    addEventListener('wheel', e => { if (this.enabled) this.pressed.add(e.deltaY > 0 ? 'nextTool' : 'prevTool'); }, { passive: true });
    this._bindTouch(hudRoot || canvas);
  }

  requestLock() {
    try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => { try { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch { } }); } catch { }   // no user gesture (a join that finished later): stay unlocked, a click locks
  }
  get locked() { return document.pointerLockElement === this.canvas; }

  _key(e, down) {
    const k = e.code;
    if (down) {
      if (!this.keys.has(k)) {
        const map = { KeyE: 'interact', KeyF: 'interact', Space: 'jump', Digit1: 'tool1', Digit2: 'tool2', Digit3: 'tool3', Digit4: 'tool4', Digit5: 'tool5',
          Tab: 'upgrades', KeyU: 'upgrades', KeyP: 'proficiencies', Escape: 'pause', KeyQ: 'drop', KeyH: 'hud', KeyI: 'stats' };
        if (map[k]) this.pressed.add(map[k]);
      }
      this.keys.add(k);
      if (k === 'Tab' || k === 'Space') e.preventDefault();
    } else this.keys.delete(k);
  }

  // movement axes from keys or the touch stick
  axes() {
    if (this.touch.stickId != null) return { mx: this.touch.mx, mz: this.touch.mz };
    const K = this.keys;
    const mx = (K.has('KeyD') || K.has('ArrowRight') ? 1 : 0) - (K.has('KeyA') || K.has('ArrowLeft') ? 1 : 0);
    const mz = (K.has('KeyW') || K.has('ArrowUp') ? 1 : 0) - (K.has('KeyS') || K.has('ArrowDown') ? 1 : 0);
    return { mx, mz };
  }
  get jump() { return this.keys.has('Space') || this.touch.jump; }
  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touch.sprint; }
  get crouch() { return this.keys.has('ControlLeft') || this.keys.has('KeyC') || this.touch.crouch; }

  consumeLook() { const d = [this.lookDX, this.lookDY]; this.lookDX = this.lookDY = 0; return d; }
  take(name) { if (this.pressed.has(name)) { this.pressed.delete(name); return true; } return false; }
  endFrame() { this.pressed.clear(); }

  _bindTouch(root) {
    const T = this.touch;
    const el = this.canvas;
    const opts = { passive: false };
    el.addEventListener('touchstart', e => {
      T.active = true;
      for (const t of e.changedTouches) {
        const w = el.clientWidth;
        if (t.clientX < w * 0.4 && T.stickId == null) { T.stickId = t.identifier; T.sx = t.clientX; T.sy = t.clientY; T.mx = T.mz = 0; this.onStick && this.onStick(true, t.clientX, t.clientY); }
        else if (T.lookId == null) { T.lookId = t.identifier; T.lx = t.clientX; T.ly = t.clientY; }
      }
      e.preventDefault();
    }, opts);
    el.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === T.stickId) {
          const R = 60; let dx = (t.clientX - T.sx) / R, dy = (t.clientY - T.sy) / R;
          const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
          T.mx = dx; T.mz = -dy; this.onStick && this.onStick(true, T.sx, T.sy, dx, dy);
        } else if (t.identifier === T.lookId) {
          // touch look: 1 px = 2.2 mouse units (phone screens are dense)
          this.lookDX += (t.clientX - T.lx) * 2.2; this.lookDY += (t.clientY - T.ly) * 2.2;
          T.lx = t.clientX; T.ly = t.clientY;
        }
      }
      e.preventDefault();
    }, opts);
    const end = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === T.stickId) { T.stickId = null; T.mx = T.mz = 0; this.onStick && this.onStick(false); }
        if (t.identifier === T.lookId) T.lookId = null;
      }
    };
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  }

  // on-screen buttons (created by the HUD) call these
  touchButton(name, down) {
    const T = this.touch;
    if (name === 'primary') { this.primary = down; if (down) this.pressed.add('primary'); }
    else if (name === 'secondary') { this.secondary = down; if (down) this.pressed.add('secondary'); }
    else if (name === 'jump') T.jump = down;
    else if (name === 'sprint') T.sprint = down;
    else if (name === 'crouch') T.crouch = down;
    else { if (name === 'interact') T.interactHeld = down; if (down) this.pressed.add(name); }
  }
}
