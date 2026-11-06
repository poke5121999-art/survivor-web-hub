// One player's input for one tick (FG.Sim.InputFrame / Quantum.Input): {encodedDirection, down, pressed}.
// `down` is the button level; `pressed` carries edges the client saw between two sends so a short tap is
// not lost. The sim also derives edges from `down` against the previous tick.
import { f } from '../Core/Vec2.js';
import { InputButtons } from '../Data/Enums.js';

export const NEUTRAL = 127;

function encode(dirX) {
  const v = Math.trunc(f(f(dirX) * 127)) + 127;
  return v < 0 ? 0 : v > 254 ? 254 : v;
}

export const InputFrame = Object.freeze({
  NEUTRAL,
  none: () => ({ encodedDirection: NEUTRAL, down: InputButtons.None, pressed: InputButtons.None }),
  make: (dirX, down = InputButtons.None, pressed = InputButtons.None) => ({ encodedDirection: encode(dirX), down, pressed }),
  /** Input.get_DirectionX: (EncodedDirection - 127) / 127. */
  directionX: (inp) => f((inp.encodedDirection - 127) / 127),
  setDirectionX: (inp, dirX) => { inp.encodedDirection = encode(dirX); },
});
