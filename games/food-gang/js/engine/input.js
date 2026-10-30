// Pointer / touch / keyboard. Pointers are reported in canvas pixels with y up (Unity screen space).

export class Input {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.engine = engine;
    this.keys = new Set();
    this.down = new Set();     // pressed this frame
    this.up = new Set();       // released this frame
    this.pointers = new Map(); // id -> {x, y, startX, startY, target, t}
    this.events = [];
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * canvas.width / r.width, canvas.height - (e.clientY - r.top) * canvas.height / r.height];
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      const [x, y] = pos(e);
      const p = { id: e.pointerId, x, y, startX: x, startY: y, target: null, t: performance.now() };
      this.pointers.set(e.pointerId, p);
      // TMP_InputField: decided inside the DOM event so the HTML <input> can take focus (mobile keyboards need a user gesture)
      const ui = engine.ui;
      if (ui) { ui.domPointerDown(x, y); p.downInput = ui.inputAt(x, y); }
      this.events.push({ type: 'down', p });
      engine.audio?.ensure();
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      [p.x, p.y] = pos(e);
      this.events.push({ type: 'move', p });
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      [p.x, p.y] = pos(e);
      this.pointers.delete(e.pointerId);
      if (e.type === 'pointerup' && p.downInput && Math.hypot(p.x - p.startX, p.y - p.startY) < 10 && engine.ui.inputAt(p.x, p.y) === p.downInput) p.downInput.focus();
      this.events.push({ type: e.type === 'pointercancel' ? 'cancel' : 'up', p });
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => {
      const [x, y] = pos(e);
      const r = canvas.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;   // lines / pages -> css px
      this.events.push({ type: 'wheel', x, y, dx: e.deltaX * unit * canvas.width / r.width, dy: e.deltaY * unit * canvas.height / r.height });
      e.preventDefault();
    }, { passive: false });
    canvas.style.touchAction = 'none';
    // keys typed into an HTML <input> (TMP_InputField) must not drive the game
    const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return; if (!this.keys.has(e.code)) this.down.add(e.code); this.keys.add(e.code); engine.audio?.ensure(); });
    window.addEventListener('keyup', (e) => { if (typing(e)) return; this.keys.delete(e.code); this.up.add(e.code); });
    window.addEventListener('blur', () => this.keys.clear());
  }

  key(code) { return this.keys.has(code); }
  keyDown(code) { return this.down.has(code); }
  axis(neg, pos) { return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0); }

  endFrame() { this.down.clear(); this.up.clear(); }
}
