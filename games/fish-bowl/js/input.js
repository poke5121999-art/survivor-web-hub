// Player input: keyboard plus the HUD's ControlFreak2 controls, merged into one API. Tests and bots drive the same
// API the DOM handlers call (setAxis / hold / tap / look), so they go through the game's real input path.
//   axis()      -> {x, y} move stick (camera-relative: y forward, x right), |v| <= 1
//   held(name)  -> 'up' | 'down' | 'boost'
//   on(name,fn) -> fired by tap(name): 'jump', 'flop', 'pull', 'action'
//   look()      -> {dx, dy} camera drag in CSS px since the last call
const KEYS = {
  KeyW: ['fwd'], ArrowUp: ['fwd'], KeyS: ['back'], ArrowDown: ['back'],
  KeyA: ['left'], ArrowLeft: ['left'], KeyD: ['right'], ArrowRight: ['right'],
  Space: ['up', 'jump', 'flop'], KeyE: ['up'], KeyQ: ['down'], KeyC: ['down'],
  ShiftLeft: ['boost'], ShiftRight: ['boost'], KeyF: ['pull', 'action'], Enter: ['pull', 'action'],
};
const TAPS = new Set(['jump', 'flop', 'pull', 'action']);

export class Input {
  constructor() {
    this.state = {};
    this.stick = { x: 0, y: 0 };
    this.botAxis = null;
    this.drag = { dx: 0, dy: 0 };
    this.listeners = {};
    this.ui = null;
    addEventListener('keydown', e => {
      const acts = KEYS[e.code];
      if (!acts || e.repeat) return;
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      for (const a of acts) TAPS.has(a) ? this.tap(a) : this.hold(a, true);
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', e => { for (const a of KEYS[e.code] || []) if (!TAPS.has(a)) this.hold(a, false); });
    addEventListener('blur', () => { this.state = {}; });
  }

  hold(name, on) { this.state[name] = !!on; }
  held(name) { return !!this.state[name]; }
  tap(name) { for (const fn of this.listeners[name] || []) fn(); }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  clearListeners() { this.listeners = {}; }

  // bot / test stick; null hands control back to the touch stick and keys
  setAxis(x, y) { this.botAxis = x == null ? null : { x, y }; }
  addLook(dx, dy) { this.drag.dx += dx; this.drag.dy += dy; }

  axis() {
    if (this.botAxis) return { ...this.botAxis };
    const j = this.ui ? this.ui.joystick() : { x: 0, y: 0 };
    let x = j.x + (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let y = j.y + (this.held('fwd') ? 1 : 0) - (this.held('back') ? 1 : 0);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  look() {
    const p = this.ui ? this.ui.cameraPad() : { dx: 0, dy: 0 };
    const d = { dx: p.dx + this.drag.dx, dy: p.dy + this.drag.dy };
    this.drag = { dx: 0, dy: 0 };
    return d;
  }
}
