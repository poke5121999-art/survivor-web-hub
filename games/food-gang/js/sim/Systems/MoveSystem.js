// AgentMoveSystem + CharacterController2D (spec Part 2).
import { f, SMath } from '../Core/Vec2.js';
import { GamePhase, KccMoveType, StatusFlags } from '../Data/Enums.js';
import { SimEventType } from '../State/SimEvent.js';
import { has } from '../State/MatchState.js';
import { overlapCircle } from './Physics2D.js';

const SLOW_FLAG_MULT = f(0.35);
const POISON_FLAG_MULT = 0.5;
const CEILING_NORMAL_Y = -0.75;
const F001 = f(0.01), F0001 = f(0.001), F01 = f(0.1);

export function update(c, a) {
  if (c.s.phase === GamePhase.GameOver) {
    a.velocity.x = 0;
    kccMove(c, a, 0);
    return;
  }
  if ((a.flags & (StatusFlags.Dead | StatusFlags.Freeze)) !== 0) return;

  let locked = false;
  if (a.isBusy) {
    const asset = c.act(a.currentIsSpecial ? a.specialRef : a.actionRef);
    locked = asset != null && asset.lockMovement;
  }
  const noSlow = !has(a, StatusFlags.SlowDown);
  const poison = has(a, StatusFlags.Poison);

  if (a.grounded) { a.isJumping = false; a.isFalling = false; }
  else if (!a.isJumping && !a.isFalling) a.isFalling = true;

  let speed = f(a.speedMultiplier * a.moveSpeed);
  if (!noSlow) speed = f(speed * SLOW_FLAG_MULT);
  if (poison) speed = f(speed * POISON_FLAG_MULT);

  let dir;
  if (a.isPushback) {
    a.pushbackTimer = f(a.pushbackTimer - c.dt);
    if (a.pushbackTimer <= 0) a.isPushback = false;
    a.kccMaxSpeed = f(Math.abs(a.pushbackValue) * speed);
    dir = a.pushbackValue > 0 ? 1 : -1;
  } else if (a.isDashing) {
    if (a.dashIgnoreGravity) a.velocity.y = 0;
    if (a.dashDirection.y !== 0) a.velocity.y = a.dashDirection.y;
    a.dashTimer = f(a.dashTimer - c.dt);
    if (a.dashTimer <= 0) a.isDashing = false;
    const vx = f(a.dashDirection.x * speed);
    let signed = a.facingLeft ? -vx : vx;
    if (a.dashBackwards) signed = -signed;
    a.kccMaxSpeed = Math.abs(vx);
    a.velocity.x = signed;
    dir = 0;
  } else if (locked) {
    a.kccMaxSpeed = 0;
    dir = 0;
  } else {
    a.kccMaxSpeed = speed;
    const x = a.directionX;
    dir = x > 0 ? 1 : x < 0 ? -1 : 0;
    if (x !== 0) a.facingLeft = x < 0;
    if (a.jump && a.grounded && a.velocity.y <= 0 && noSlow) {
      a.velocity.y = c.db.kcc.baseJumpImpulse;
      a.kccJumped = true;
      a.isJumping = true;
      c.emit(SimEventType.AgentJumped, { agent: a.id, pos: a.pos });
      a.jump = false;
    }
  }
  kccMove(c, a, dir);
}

/** CharacterController2D.Move: ComputeRawMovement, ComputeRawSteer, integrate, penetration correction. */
export function kccMove(c, a, inputX) {
  const k = c.db.kcc;
  const dt = c.dt;
  const contacts = c.contacts;
  overlapCircle(c.map, { x: a.pos.x, y: f(a.pos.y + k.offsetY) }, k.radius, k.extent, k.layerMask, contacts);
  const n = Math.min(contacts.length, k.maxContacts);

  const groundCos = k.groundCos;
  let grounded = false;
  let gnx = 0, gny = 1;
  let snx = 0, sny = 0;
  let steep = false;
  let cx = 0, cy = 0;
  let maxPen = 0;
  for (let i = 0; i < n; i++) {
    const ct = contacts[i];
    // AgentMoveSystem.OnCharacterCollision2D: a head bump stops the rise
    if (ct.normal.y <= CEILING_NORMAL_Y && a.velocity.y > 0 && !a.grounded) a.velocity.y = 0;
    if (ct.normal.y >= groundCos) {
      if (!grounded || ct.normal.y > gny) { gnx = ct.normal.x; gny = ct.normal.y; }
      grounded = true;
    } else if (!steep && ct.normal.y >= F001) {
      steep = true;
      snx = ct.normal.x; sny = ct.normal.y;
    }
    if (ct.penetration > 0) {
      cx = f(cx + f(ct.normal.x * ct.penetration));
      cy = f(cy + f(ct.normal.y * ct.penetration));
      if (ct.penetration > maxPen) maxPen = ct.penetration;
    }
  }

  let type;
  let tx = 0, ty = 0;
  if (n === 0) type = KccMoveType.FreeFall;
  else if (grounded) {
    if (inputX !== 0) {
      type = KccMoveType.Horizontal;
      tx = f(gny * inputX);
      ty = f(-gnx * inputX);
    } else type = KccMoveType.None;
  } else if (steep && sny >= F001) {
    // kcc_rawmove.txt @0x40353a4: SlopeFall needs dot(up, normal) >= 0.01, so walls and ceilings stay FreeFall
    type = KccMoveType.SlopeFall;
    const ux = f(0 + f(snx * sny)), uy = f(-1 + f(sny * sny));
    const m = f(Math.sqrt(f(f(ux * ux) + f(uy * uy))));
    if (m > f(1e-9)) { tx = f(ux / m); ty = f(uy / m); }
  } else type = KccMoveType.FreeFall;

  a.grounded = grounded;
  let minVy = -100;
  const maxVy = 100;
  const t = f(k.braking * dt);
  let vx = a.velocity.x, vy = a.velocity.y;
  let clamp = true;
  switch (type) {
    case KccMoveType.FreeFall:
      vy = f(vy - f(k.gravity * dt));
      if (k.airControl && inputX !== 0) vx = f(vx + f(f(k.acceleration * inputX) * dt));
      else vx = SMath.lerp(vx, 0, t);
      break;
    case KccMoveType.None:
      if (vx !== 0) { vx = SMath.lerp(vx, 0, t); if (Math.abs(vx) < F01) vx = 0; }
      if (vy !== 0 && !a.kccJumped) { vy = SMath.lerp(vy, 0, t); if (Math.abs(vy) < F01) vy = 0; }
      minVy = 0;
      break;
    case KccMoveType.SlopeFall: {
      const acc = f(k.acceleration * dt);
      vx = f(vx + f(tx * acc));
      vy = f(vy + f(ty * acc));
      minVy = -k.maxSlopeSpeed;
      break;
    }
    case KccMoveType.Horizontal: {
      const acc = f(k.acceleration * dt);
      vx = f(vx + f(tx * acc));
      vy = f(vy + f(ty * acc));
      const dot = f(f(vx * tx) + f(vy * ty));
      vx = SMath.lerp(vx, f(tx * dot), t);
      if (!a.kccJumped) vy = SMath.lerp(vy, f(ty * dot), t);
      const ms = a.kccMaxSpeed;
      if (Math.abs(dot) > ms) {
        const over = f(SMath.sign(dot) * f(Math.abs(dot) - ms));
        vx = f(vx - f(tx * over));
        vy = f(vy - f(ty * over));
      }
      clamp = false;
      break;
    }
  }
  if (clamp) {
    vy = SMath.clamp(vy, minVy, maxVy);
    vx = SMath.clamp(vx, -a.kccMaxSpeed, a.kccMaxSpeed);
  }
  a.kccJumped = false;
  a.velocity = { x: vx, y: vy };

  let px = f(a.pos.x + f(vx * dt)), py = f(a.pos.y + f(vy * dt));
  if (maxPen >= F0001) {
    if (maxPen > k.maxPenetration) { px = f(px + cx); py = f(py + cy); }
    else { px = f(px + f(cx * k.penetrationCorrection)); py = f(py + f(cy * k.penetrationCorrection)); }
  }
  a.pos = { x: px, y: py };
}

export const MoveSystem = Object.freeze({ update, kccMove });
