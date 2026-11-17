// Player kinematics: StarterAssets.ThirdPersonController (Move, JumpAndGravity, GroundedCheck) as used by Player1..6,
// with the CharacterController held on the navmesh instead of colliders. Pure JS, three.js world coordinates.
// Facing: yaw is the angle with forward = (sin yaw, 0, cos yaw); the view turns rigs by yaw + PI (rigs face local -z).

// Serialized values on Player1's ThirdPersonController (art/world/scene.json) and its class defaults (_terminalVelocity).
export const THIRD_PERSON = {
  moveSpeed: 5.5, sprintSpeed: 7, rotationSmoothTime: 0.12, speedChangeRate: 10,
  jumpHeight: 0.5, gravity: -15, jumpTimeout: 0.3, fallTimeout: 0.15, terminalVelocity: 53,
};
// CharacterController on Player1 (art/world/scene.json): radius 0.56, height 1.8, step 0.25 in local units, and the
// Player1 node is scaled 0.4, so the capsule the physics sees is 0.224 / 0.72 / 0.1 metres.
export const BODY = { radius: 0.56 * 0.4, height: 1.8 * 0.4, step: 0.25 * 0.4 };
const SPEED_OFFSET = 0.1;
const SUBSTEP = 0.08; // metres per collision substep, below the capsule radius so thin gates cannot be skipped
const GROUND_SNAP = 0.05;

export function newMover(pos, yaw = 0) {
  return {
    pos: [...pos], yaw, speed: 0, blend: 0, vy: 0, grounded: true, freeFall: false, jumping: false,
    jumpT: THIRD_PERSON.jumpTimeout, fallT: THIRD_PERSON.fallTimeout, turnVel: 0,
  };
}

const wrapPi = a => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

// Unity Mathf.SmoothDampAngle in radians.
function smoothDampAngle(cur, target, state, smoothTime, dt) {
  const t = cur + wrapPi(target - cur);
  const omega = 2 / smoothTime, x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - t;
  const temp = (state.turnVel + omega * change) * dt;
  state.turnVel = (state.turnVel - omega * temp) * exp;
  let out = t + (change + temp) * exp;
  if ((t - cur > 0) === (out > t)) { out = t; state.turnVel = (out - t) / dt; }
  return out;
}

// input: { dir: [x, z] world direction (any length, zero = no input), jump: bool, sprint: bool }.
export function stepMover(m, input, nav, dt, tune = THIRD_PERSON) {
  const [ix, iz] = input.dir || [0, 0];
  const hasInput = ix !== 0 || iz !== 0;

  // JumpAndGravity
  if (m.grounded) {
    m.fallT = tune.fallTimeout;
    m.jumping = false;
    m.freeFall = false;
    if (m.vy < 0) m.vy = -2;
    if (input.jump && m.jumpT <= 0) { m.vy = Math.sqrt(tune.jumpHeight * -2 * tune.gravity); m.jumping = true; }
    if (m.jumpT >= 0) m.jumpT -= dt;
  } else {
    m.jumpT = tune.jumpTimeout;
    if (m.fallT >= 0) m.fallT -= dt;
    else m.freeFall = true;
  }
  if (m.vy < tune.terminalVelocity) m.vy += tune.gravity * dt;

  // Move: analogMovement is off, so any stick deflection asks for full speed.
  const target = hasInput ? (input.sprint ? tune.sprintSpeed : tune.moveSpeed) : 0;
  if (m.speed < target - SPEED_OFFSET || m.speed > target + SPEED_OFFSET) {
    m.speed = Math.round((m.speed + (target - m.speed) * Math.min(1, dt * tune.speedChangeRate)) * 1000) / 1000;
  } else m.speed = target;
  m.blend += (target - m.blend) * Math.min(1, dt * tune.speedChangeRate);
  if (m.blend < 0.01) m.blend = 0;

  if (hasInput) {
    m.targetYaw = Math.atan2(ix, iz);
    m.yaw = smoothDampAngle(m.yaw, m.targetYaw, m, tune.rotationSmoothTime, dt);
  }
  const ty = m.targetYaw ?? m.yaw;
  const nx = m.pos[0] + Math.sin(ty) * m.speed * dt, nz = m.pos[2] + Math.cos(ty) * m.speed * dt;
  // Walk the step in short pieces: push the capsule out of static colliders (slides along their sides), then keep it
  // on the navmesh. Solids only exist when nav.setColliders() ran (nav.pushOut missing = navmesh-only movement).
  const r = m.radius ?? BODY.radius;
  const dx = nx - m.pos[0], dz = nz - m.pos[2], n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / SUBSTEP));
  let px = m.pos[0], pz = m.pos[2], c = nav.clamp(px, pz, m.pos[1]);
  for (let i = 1; i <= n; i++) {
    px += dx / n; pz += dz / n;
    if (nav.pushOut) { const o = nav.pushOut(px, pz, m.pos[1], r, BODY.height, BODY.step); px = o.x; pz = o.z; }
    c = nav.clamp(px, pz, m.pos[1]);
    px = c.x; pz = c.z;
  }
  // Blocked moves lose their speed like CharacterController.velocity does against a wall.
  const moved = Math.hypot(c.x - m.pos[0], c.z - m.pos[2]);
  if (m.speed > 0 && moved < m.speed * dt * 0.5 && hasInput) m.speed = Math.max(moved / dt, 0);
  m.pos[0] = c.x;
  m.pos[2] = c.z;

  // GroundedCheck against the navmesh floor.
  const y = m.pos[1] + m.vy * dt;
  if (y <= c.y + GROUND_SNAP && m.vy <= 0) {
    m.pos[1] = c.y;
    m.grounded = true;
  } else {
    m.pos[1] = Math.max(y, c.y);
    m.grounded = false;
  }
  return m;
}
