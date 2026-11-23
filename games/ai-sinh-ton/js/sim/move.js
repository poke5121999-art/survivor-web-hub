// How a unit covers ground in one tick. think() in battle.js has already set u.vx/u.vz from the AI's wish; this module
// owns what the body does with it (walk, hop, roll, fly, blink, burrow ... per the hero form's `move`, SCOPE section 5).
// Pure and deterministic: any random choice uses B.rng.
export function moveUnit(B, u, dt) {
  u.x += u.vx * dt; u.z += u.vz * dt;
}
