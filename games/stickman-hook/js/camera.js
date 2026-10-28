// Horizontal camera of a level, shared by main.js and the bot (test/stickman-hook-sim.js).
// The scene camera is ProCamera2D (scene level2 in data.unity3d, read raw by field order):
//   ProCamera2D: FollowHorizontal, HorizontalFollowSmoothness 0, so the camera sits on the player plus the influences;
//   ProCamera2DForwardFocus: Progressive, SpeedMultiplier 1, TransitionSmoothness 0.5, MaintainInfluenceOnStop,
//   MovementThreshold (0, 0), LeftFocus = RightFocus = 0.25 (PlayerCameraController.Awake copies LeftFocus to both).
// ForwardFocus.ApplyInfluence [asm 0x11b5860..0x11b5fbc]: the target influence is the horizontal speed clamped to
// +-0.25 screen widths [asm 0x11b5a80..0x11b5ab0]; MaintainInfluenceOnStop keeps the larger one in the direction of
// travel [asm 0x11b5b20..0x11b5b84, 0x11b5c64..0x11b5c78]; Mathf.SmoothDamp(influence, target, vel, 0.5) [asm 0x11b5f4c].
// Any speed above 0.25 widths/s saturates it, so in flight the player sits 0.25 widths left of the centre.

export const FOCUS = 0.25, FOCUS_SMOOTH = 0.5;

// UnityEngine.Mathf.SmoothDamp with maxSpeed = Infinity; `st.v` is the ref velocity.
export function smoothDamp(cur, target, st, smoothTime, dt) {
  if (!(dt > 0)) return cur;
  const t = Math.max(0.0001, smoothTime), omega = 2 / t, x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (st.v + omega * change) * dt;
  st.v = (st.v - omega * temp) * exp;
  let out = target + (change + temp) * exp;
  if ((target - cur > 0) === (out > target)) { out = target; st.v = 0; }
  return out;
}

// One frame of the influence. `ff` = {h, v}: current influence and its SmoothDamp velocity; `speed` world units/s;
// `width` = screen width in world units. Returns the influence (world units to add to the player's x).
export function forwardFocus(ff, speed, width, dt) {
  const lim = FOCUS * width;
  const s = Math.max(-lim, Math.min(lim, speed));
  let target;
  if (Math.abs(s) < 0.001) target = ff.h;
  else target = s > 0 ? Math.max(s, ff.h) : Math.min(s, ff.h);
  target = Math.max(-lim, Math.min(lim, target));
  ff.h = smoothDamp(ff.h, target, ff, FOCUS_SMOOTH, dt);
  return ff.h;
}
