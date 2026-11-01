// Floating joystick (touch / mouse drag anywhere on the stage) plus WASD / arrow keys.
// Output: { x, z } in screen terms (x right, z down), length <= 1.
export class Input {
  constructor(stage, hud) {
    this.v = { x: 0, z: 0 };
    this.keys = new Set();
    this.joy = document.createElement('div');
    this.joy.className = 'joy';
    this.joy.innerHTML = '<i></i>';
    hud.appendChild(this.joy);
    this.knob = this.joy.firstChild;
    this.origin = null;
    const rect = () => stage.getBoundingClientRect();
    const radius = () => rect().width * 100 / 750;
    stage.addEventListener('pointerdown', e => {
      if (e.target.closest('.ui')) return;
      const r = rect();
      this.origin = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.joy.style.display = 'block';
      this.joy.style.left = `${e.clientX - r.left}px`;
      this.joy.style.top = `${e.clientY - r.top}px`;
      this.drag = { x: 0, z: 0 };
    });
    window.addEventListener('pointermove', e => {
      if (!this.origin || e.pointerId !== this.origin.id) return;
      let dx = e.clientX - this.origin.x, dz = e.clientY - this.origin.y;
      const R = radius(), len = Math.hypot(dx, dz);
      if (len > R) { dx *= R / len; dz *= R / len; }
      this.drag = { x: dx / R, z: dz / R };
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dz}px))`;
    });
    const end = e => {
      if (!this.origin || e.pointerId !== this.origin.id) return;
      this.origin = null; this.drag = null;
      this.joy.style.display = 'none';
      this.knob.style.transform = '';
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('keydown', e => this.keys.add(e.code));
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  read() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let z = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (x || z) {
      const l = Math.hypot(x, z);
      return { x: x / l, z: z / l };
    }
    return this.drag || { x: 0, z: 0 };
  }
}
