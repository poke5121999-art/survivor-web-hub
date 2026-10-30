// Local player input (FoodGangInput): keyboard + mouse + the on-screen joystick/buttons (they write `virtual`).
// Press edges seen between ticks are kept until a tick consumes them, so a tap shorter than one tick still counts.
// Desktop: A/D or arrows move, W/Up/Space jump, J or left mouse (outside the HUD) attack, K special.
import { InputFrame, InputButtons } from '../../sim/index.js';

export class LocalInput {
  constructor(engine) {
    this.input = engine.input;
    this.virtual = { dirX: 0, jump: false, action: false, special: false };
    this.mouseAction = false;
    this.enabled = true;
    this.scripted = null;          // {dirX, down} from the test bridge overrides devices while set
    this.pending = 0;
    this.lastDown = 0;
    this.jumps = 0;
  }

  currentDown() {
    if (this.scripted) return this.scripted.down | 0;
    if (!this.enabled) return 0;
    const k = (c) => this.input.key(c);
    let b = 0;
    if (this.virtual.jump || k('KeyW') || k('ArrowUp') || k('Space')) b |= InputButtons.Jump;
    if (this.virtual.action || k('KeyJ') || this.mouseAction) b |= InputButtons.Action;
    if (this.virtual.special || k('KeyK')) b |= InputButtons.Special;
    return b;
  }

  currentDirX() {
    if (this.scripted) return Math.max(-1, Math.min(1, this.scripted.dirX || 0));
    if (!this.enabled) return 0;
    const k = (c) => this.input.key(c);
    let x = 0;
    if (k('KeyA') || k('ArrowLeft')) x -= 1;
    if (k('KeyD') || k('ArrowRight')) x += 1;
    if (Math.abs(this.virtual.dirX) > 0.2) x = Math.sign(this.virtual.dirX);
    return Math.max(-1, Math.min(1, x));
  }

  // once per rendered frame: remember edges so a tick that comes later still sees them
  sample() {
    const down = this.currentDown();
    this.pending |= down & ~this.lastDown;
    this.lastDown = down;
  }

  getInput() {
    const down = this.currentDown();
    const f = InputFrame.make(this.currentDirX(), down, this.pending | (down & ~this.lastDown));
    this.pending = 0;
    this.lastDown = down;
    return f;
  }

  resetVirtual() {
    this.virtual.dirX = 0;
    this.virtual.jump = this.virtual.action = this.virtual.special = false;
    this.mouseAction = false;
    this.pending = this.lastDown = 0;
  }
}
