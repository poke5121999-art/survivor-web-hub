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

// Death zones. LoadingSceneLogic.AfterSceneLoaded -> CameraService.SetupCamera [asm 0x127a010] with the scene camera's
// orthographicSize 5: width w = 10 x aspect, height h = 10. PlaceBorder [asm 0x127a1b0] sizes the two children of the
// camera, CameraLimitsBottom (mask down) and CameraLimitsLeft (mask left): BoxCollider2D 1 x 1, offset 0.6 x mask
// [asm 0x127a290..0x127a2d0], uniform scale |w / 0.32| (bottom) or |h / 0.32| (left), 0.32 = the SpriteRenderer size
// [asm 0x127a31c..0x127a394], centre at mask x (w or h) / 2 x (1 + _percentageBorderMargin 0.01) from the camera
// [asm 0x127a3ec..0x127a460] (CameraConfig in resources.assets: 0.01, 5, 15). So each box's near edge lies 0.1 x scale
// beyond the frame: bottom 5.05 + 0.3125 w below the centre, left 0.505 w + 3.125 left of it. OnTriggerStay2D with a
// "CameraLimits*" collider kills (TryKillPlayer [asm 0x120500c..0x12050c0]): the player's circle (radius r) touches it.
export const LIMITS = { size: 5, margin: 0.01, sprite: 0.32, offset: 0.6 };
export function deathLimits(aspect, r) {
  const h = 2 * LIMITS.size, w = h * aspect, k = 1 + LIMITS.margin, out = LIMITS.offset - 0.5;
  return { bottom: -(h / 2 * k + out * w / LIMITS.sprite) + r, left: -(w / 2 * k + out * h / LIMITS.sprite) + r };
}
