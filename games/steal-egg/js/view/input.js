// Player input, the original's two paths merged:
// - touch: UIVirtualJoystick (InGame/JoyStick), UIVirtualButton jump (InGame/JumpBtn), the Attack button and
//   CameraDragArea (InGame/Drag, full screen under the buttons), each tracked by its own pointer id;
// - desktop: PlayerInput bindings WASD/arrows (Move), Space (Jump), Left Shift (Sprint), plus mouse drag on the same
//   Drag area and F for the attack button.
// Pointer positions are turned into stage coordinates first: on a phone held upright the stage is rotated 90 degrees.
const JOY = 'InGame/JoyStick';
const KEYS = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };

export class Input {
  constructor({ hud, stage, joystick }) {
    this.hud = hud;
    this.stage = stage;
    this.joyRange = joystick.joystickRange;
    this.joySize = hud.L.nodes[hud.index(JOY)].rect.sizeDelta;
    this.joy = [0, 0];
    this.joyId = null;
    this.keys = new Set();
    this.jumpHeld = false;
    this.sprint = false;
    this.attacks = 0;
    this.drags = new Map();
    this.onDrag = () => {};
    this.handle = hud.node(`${JOY}/Image_Handle`);
    this.bind();
  }

  // Client pixels -> stage pixels (stage.rotated: CSS translateX(100vw) rotate(90deg) around its top-left corner).
  toStage(cx, cy) {
    return this.stage.rotated ? [cy, window.innerWidth - cx] : [cx, cy];
  }

  bind() {
    const hud = this.hud;
    const joy = hud.node(JOY), drag = hud.node('InGame/Drag'), jump = hud.node('InGame/JumpBtn'), attack = hud.node('InGame/Attack');
    const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ } };

    joy.addEventListener('pointerdown', e => { e.preventDefault(); capture(joy, e); this.joyId = e.pointerId; this.joyAt(e); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === this.joyId) this.joyAt(e); });
    const joyUp = e => { if (e.pointerId === this.joyId) { this.joyId = null; this.setJoy(0, 0, 0, 0); } };
    joy.addEventListener('pointerup', joyUp);
    joy.addEventListener('pointercancel', joyUp);

    drag.addEventListener('pointerdown', e => { e.preventDefault(); capture(drag, e); this.drags.set(e.pointerId, this.toStage(e.clientX, e.clientY)); });
    drag.addEventListener('pointermove', e => {
      const last = this.drags.get(e.pointerId);
      if (!last) return;
      const p = this.toStage(e.clientX, e.clientY);
      this.drags.set(e.pointerId, p);
      // Unity pointer positions are device pixels.
      const k = window.devicePixelRatio || 1;
      this.onDrag((p[0] - last[0]) * k, (p[1] - last[1]) * k);
    });
    const dragUp = e => this.drags.delete(e.pointerId);
    drag.addEventListener('pointerup', dragUp);
    drag.addEventListener('pointercancel', dragUp);

    jump.addEventListener('pointerdown', e => { e.preventDefault(); capture(jump, e); this.jumpHeld = true; });
    for (const ev of ['pointerup', 'pointercancel']) jump.addEventListener(ev, () => { this.jumpHeld = false; });
    attack.addEventListener('click', () => { this.attacks++; });

    window.addEventListener('keydown', e => {
      if (KEYS[e.code]) this.keys.add(e.code);
      if (e.code === 'Space') this.jumpKey = true;
      if (e.code === 'ShiftLeft') this.sprint = true;
      if (e.code === 'KeyF' && !e.repeat) this.attacks++;
      if (KEYS[e.code] || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.jumpKey = false;
      if (e.code === 'ShiftLeft') this.sprint = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.jumpKey = false; this.sprint = false; });
  }

  // UIVirtualJoystick.OnDrag: local point / sizeDelta * 2.5; output unclamped, handle at clamp(1) * joystickRange.
  joyAt(e) {
    const [sx, sy] = this.toStage(e.clientX, e.clientY);
    const r = this.hud.rect(JOY), s = this.hud.scale;
    const lx = (sx - r.cx) / s, ly = -(sy - r.cy) / s;
    const x = lx / this.joySize[0] * 2.5, y = ly / this.joySize[1] * 2.5;
    const m = Math.hypot(x, y), c = m > 1 ? 1 / m : 1;
    this.setJoy(x, y, x * c * this.joyRange, y * c * this.joyRange);
  }

  setJoy(x, y, hx, hy) {
    this.joy = [x, y];
    if (this.handle) this.handle.style.translate = `${hx}px ${-hy}px`;
  }

  // StarterAssetsInputs.move: joystick while held, else the keyboard composite.
  move() {
    if (this.joyId != null) return this.joy;
    let x = 0, y = 0;
    for (const k of this.keys) { x += KEYS[k][0]; y += KEYS[k][1]; }
    const m = Math.hypot(x, y);
    return m ? [x / m, y / m] : [0, 0];
  }

  // ThirdPersonController: targetRotation = atan2(move.x, move.y) + camera yaw (Unity degrees), as a three.js x/z
  // direction (Unity (sin, cos) with z flipped).
  worldDir(cameraYawDeg) {
    const [x, y] = this.move();
    if (!x && !y) return [0, 0];
    const t = Math.atan2(x, y) + cameraYawDeg * Math.PI / 180;
    return [Math.sin(t), -Math.cos(t)];
  }

  jump() {
    return this.jumpHeld || !!this.jumpKey;
  }

  takeAttacks() {
    const n = this.attacks;
    this.attacks = 0;
    return n;
  }
}
