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
      this.events.push({ type: e.type === 'pointercancel' ? 'cancel' : 'up', p });
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.style.touchAction = 'none';
    window.addEventListener('keydown', (e) => { if (!this.keys.has(e.code)) this.down.add(e.code); this.keys.add(e.code); engine.audio?.ensure(); });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); this.up.add(e.code); });
    window.addEventListener('blur', () => this.keys.clear());
  }

  key(code) { return this.keys.has(code); }
  keyDown(code) { return this.down.has(code); }
  axis(neg, pos) { return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0); }

  endFrame() { this.down.clear(); this.up.clear(); }
}
