// Poses and clips for the chibi body (hand-written), in Lanternfall's HumanAnim format: carry / ready poses are
// { bone: [x, y, z] } Euler offsets, clips are mkClip(hitU, keys, base). Signs (bind pose, arms hanging):
//   lUp/rUp x < 0 raises the arm forward, lUp z > 0 / rUp z < 0 swings it out sideways; lFore/rFore x < 0 bends
//   the elbow; thigh x < 0 lifts the leg forward, shin x > 0 bends the knee; hand x > 0 tips a blade downward.
// POSES[name] = { carry, ready, clips: { attack }, style overrides, post? }; scene poses (sit, lean) use `post` to
// lower the hips, which HumanAnim calls after composing the pose and before solving.
import { rdy } from '../lf/heroes.js';
import { mkClip } from '../lf/anim.js';
import { stance as hStance } from '../lf/human.js';

// contrapposto base: weight on the right leg, left knee eased and turned out, hips tilted, shoulders countering, head
// turned; elbows soft. Every carry pose starts from it, so the whole roster stands like the sheet, not to attention.
export const CONTRA = { hips: [0.03, 0.11, 0.09], spine: [0.04, -0.04, -0.06], chest: [0.03, -0.07, -0.06], neck: [0.1, 0, 0], head: [-0.06, 0.24, 0.06],
  lThigh: [-0.22, 0.31, 0.22], lShin: [0.44, 0, 0], lFoot: [-0.12, 0, -0.12], rThigh: [0.04, -0.14, -0.14], rShin: [0.03, 0, 0], rFoot: [-0.04, 0, 0.13],
  lUp: [0.08, 0, 0.22], rUp: [0.04, 0, -0.24], lFore: [-0.5, 0.2, 0], rFore: [-0.42, -0.2, 0], lHand: [0.1, 0, 0.12], rHand: [0.1, 0, -0.12] };
const st = (o) => Object.assign(hStance({}), CONTRA, o);
// left/right mirror of a pose (swap sides, negate y/z rotations)
export function mirrorPose(p) { const o = {}; for (const k in p) { const m = k[0] === 'l' && k[1] === k[1].toUpperCase() ? 'r' + k.slice(1) : k[0] === 'r' && k[1] === k[1].toUpperCase() ? 'l' + k.slice(1) : k; const v = p[k]; o[m] = [v[0], -v[1], -v[2]]; } return o; }
const R = (o) => rdy(o);

const FISTS = R({ lUp: [-0.55, 0, 0.42], lFore: [-1.7, 0.3, 0], rUp: [-0.45, 0, -0.42], rFore: [-1.8, -0.3, 0], chest: [0.05, 0.15, 0] });
const PUNCH = mkClip(0.35, [
  { t: 0.25, e: 'out', b: { rUp: [-0.3, 0, -0.5], rFore: [-2.0, -0.3, 0], chest: [0.02, 0.35, 0] } },
  { t: 0.38, e: 'snap', b: { rUp: [-1.45, 0, -0.1], rFore: [-0.15, 0, 0], chest: [0.05, -0.3, 0] }, root: [0, 0, 0.06] },
  { t: 0.7, b: { rUp: [-0.45, 0, -0.42], rFore: [-1.8, -0.3, 0] } }], FISTS);

const ONE_READY = R({ rUp: [-0.35, 0, -0.32], rFore: [-1.25, 0, 0], rHand: [-0.2, 0, 0], lUp: [-0.4, 0, 0.4], lFore: [-1.3, 0, 0] });
const SWING1 = mkClip(0.42, [
  { t: 0.3, e: 'out', b: { rUp: [-2.6, 0, -0.35], rFore: [-0.9, 0, 0], rHand: [-0.6, 0, 0], chest: [-0.05, 0.3, 0], spine: [-0.04, 0.1, 0] } },
  { t: 0.44, e: 'snap', b: { rUp: [-0.6, 0, -0.15], rFore: [-0.2, 0, 0], rHand: [0.6, 0, 0], chest: [0.12, -0.35, 0], spine: [0.08, -0.1, 0] }, root: [0, -0.02, 0.05] },
  { t: 0.75, b: { rUp: [-0.35, 0, -0.32], rFore: [-1.25, 0, 0], rHand: [-0.2, 0, 0] } }], ONE_READY);

const TWO_CARRY = st({ rUp: [-0.35, 0.35, -0.15], rFore: [-1.05, 0, 0], rHand: [0.1, 0, 0.95], lUp: [-0.5, -0.3, 0.2], lFore: [-1.1, 0, 0] });
const TWO_READY = R({ rUp: [-0.55, 0.4, -0.2], rFore: [-1.3, 0, 0], rHand: [-0.2, 0, 0.7], lUp: [-0.7, -0.3, 0.2], lFore: [-1.0, 0, 0], chest: [0.05, 0.2, 0] });
const SWING2 = mkClip(0.45, [
  { t: 0.32, e: 'out', b: { rUp: [-2.7, 0.2, -0.2], rFore: [-0.9, 0, 0], rHand: [-0.7, 0, 0.4], chest: [-0.12, 0.25, 0] } },
  { t: 0.47, e: 'snap', b: { rUp: [-0.8, 0.3, -0.1], rFore: [-0.3, 0, 0], rHand: [0.7, 0, 0.4], chest: [0.2, -0.1, 0], spine: [0.12, 0, 0] }, root: [0, -0.04, 0.06] },
  { t: 0.8, b: { rUp: [-0.55, 0.4, -0.2], rFore: [-1.3, 0, 0], rHand: [-0.2, 0, 0.7], chest: [0.05, 0.2, 0] } }], TWO_READY);

const PISTOL_READY = R({ rUp: [-1.4, 0.05, -0.05], rFore: [-0.12, 0, 0], rHand: [0.05, 0, 0], lUp: [-1.25, -0.4, 0.15], lFore: [-0.5, 0, 0], chest: [0.03, 0.12, 0], head: [0.05, 0.25, 0] });
const FIRE = (base, up) => mkClip(0.3, [
  { t: 0.24, e: 'out', b: {} }, { t: 0.3, e: 'snap', b: { [up]: [base[up][0] - 0.2, base[up][1], base[up][2]], chest: [-0.05, base.chest ? base.chest[1] : 0, 0] }, root: [0, 0, -0.03] },
  { t: 0.45, e: 'out', b: { [up]: base[up] } }, { t: 0.52, e: 'snap', b: { [up]: [base[up][0] - 0.2, base[up][1], base[up][2]] }, root: [0, 0, -0.03] }, { t: 0.7, b: { [up]: base[up] } }], base);

// round 4: "port arms" like the sheet (r2c1, r2c14): rifle diagonal across the chest, muzzle up past the left
// shoulder, support hand IK-pinned to the handguard (was held low, muzzle at the floor)
const RIFLE_CARRY = st({ chest: [0.03, -0.2, -0.03], rUp: [-0.25, 1.1, -0.3], rFore: [-2.0, 0, 0], rHand: [0.0, 0, 0.5], lUp: [-0.7, -0.6, 0.1], lFore: [-1.05, 0, 0] });
const RIFLE_READY = R({ hips: [0.05, -0.55, 0], chest: [0.02, -0.1, 0], neck: [0.06, 0.25, 0], head: [0.08, 0.4, 0.05], rUp: [-0.8, 1.0, -0.45], rFore: [-1.9, 0, 0], rHand: [0.75, 0, 0], lUp: [-1.2, -0.5, 0.15], lFore: [-0.6, 0, 0] });

const CARRY = st({ lUp: [0.04, 0, 0.3], lFore: [-0.1, 0, 0], rUp: [0.04, 0, -0.3], rFore: [-0.1, 0, 0] });
const SHIELD = st({ lUp: [-0.35, 0, 0.15], lFore: [-1.4, 0.9, 0], lHand: [0, -0.6, 0] }); // forearm level across the body, board upright in front
const SHIELD_READY = R({ lUp: [-0.85, 0, 0.3], lFore: [-1.35, 0.7, 0], rUp: [-0.35, 0, -0.32], rFore: [-1.25, 0, 0], chest: [0.06, 0.15, 0] });
const BASH = mkClip(0.4, [{ t: 0.28, e: 'out', b: { chest: [0.0, 0.4, 0] } }, { t: 0.42, e: 'snap', b: { lUp: [-1.2, 0, 0.1], lFore: [-0.8, 0.7, 0], chest: [0.1, -0.2, 0] }, root: [0, 0, 0.1] }, { t: 0.8, b: {} }], SHIELD_READY);

export const POSES = {
  idle: { carry: st({}), ready: FISTS, clips: { attack: PUNCH }, library: true },
  contra: { carry: st({}), ready: FISTS, clips: { attack: PUNCH }, library: true },
  hip1: { carry: st({ lUp: [0.12, 0, 0.6], lFore: [-1.3, 0.95, 0], lHand: [0.3, 0, 0.3], head: [-0.04, -0.2, 0.06] }), ready: FISTS, clips: { attack: PUNCH }, swingL: 0.05, library: true },
  wave: { carry: st({ rUp: [-0.15, 0.2, -2.35], rFore: [-0.9, -0.4, 0], rHand: [0, 0, -0.3], head: [-0.1, -0.15, 0.04] }), ready: FISTS, clips: { attack: PUNCH }, swingR: 0.02, library: true,
    post: (an) => { const i = an.ix.rFore; an.f.euler[i + 2] += 0.45 * Math.sin(an.t * 7) * (1 - an.moveW); an.f.euler[an.ix.rUp + 2] += 2.0 * an.moveW; } },
  stance: { carry: rdy({ lUp: [-0.5, 0, 0.42], lFore: [-1.6, 0.3, 0], rUp: [-0.4, 0, -0.42], rFore: [-1.7, -0.3, 0], chest: [0.05, 0.15, 0], head: [0.05, -0.1, 0] }), ready: FISTS, clips: { attack: PUNCH }, library: true },
  carry: { carry: CARRY, ready: FISTS, clips: { attack: PUNCH }, swing: 0.4 },
  onehand: { carry: st({ rFore: [-0.55, -0.1, 0], rHand: [1.0, 0, 0] }), ready: ONE_READY, clips: { attack: SWING1 } },
  twohand: { carry: TWO_CARRY, ready: TWO_READY, clips: { attack: SWING2 }, swingL: 0.1, swingR: 0.15 },
  twohandLow: { carry: st({ rUp: [-0.1, 0.2, -0.18], rFore: [-0.4, 0, 0], rHand: [0.9, 0, 0.9], lUp: [-0.5, -0.3, 0.2], lFore: [-0.6, 0, 0] }), ready: TWO_READY, clips: { attack: SWING2 }, swingL: 0.1, swingR: 0.1 },
  shoulder: { carry: st({ rUp: [-0.6, 0.3, -0.35], rFore: [-2.35, 0, 0], rHand: [0.85, 1.0, 0], head: [-0.02, 0.3, -0.06] }), ready: ONE_READY, clips: { attack: SWING1 }, swingR: 0.1 },
  pistol: { carry: st({ rFore: [-0.75, 0, 0], rHand: [0.35, 0, 0] }), ready: PISTOL_READY, clips: { attack: FIRE(PISTOL_READY, 'rUp') } },
  // SMG held up beside the head, muzzle to the sky (sheet r2c9, r5c6); free hand eased at the hip
  smgUp: { carry: st({ rUp: [-0.5, -0.2, -0.45], rFore: [-1.9, 0, 0], rHand: [0.3, 0, -0.2], chest: [0.03, -0.1, -0.04], head: [-0.06, 0.3, 0.04] }), ready: PISTOL_READY, clips: { attack: FIRE(PISTOL_READY, 'rUp') }, swingR: 0.05 },

  rifle: { carry: RIFLE_CARRY, ready: RIFLE_READY, clips: { attack: FIRE(RIFLE_READY, 'rUp') }, swingL: 0.1, swingR: 0.1 },
  shield: { carry: SHIELD, ready: SHIELD_READY, clips: { attack: BASH }, swingL: 0.1 },
  drink: { carry: st({ lUp: [-0.35, -0.2, 0.35], lFore: [-1.7, 0.4, 0] }), ready: FISTS, clips: { attack: PUNCH }, swingL: 0.15 },
  radio: { carry: st({ lUp: [-0.45, 0.4, 0.55], lFore: [-2.45, 0.2, 0] }), ready: FISTS, clips: { attack: PUNCH }, swingL: 0.05 },
  map: { carry: st({ rUp: [-0.7, 0.35, -0.15], rFore: [-0.9, 0, 0], lUp: [-0.8, -0.3, 0.1], lFore: [-0.9, 0, 0] }), ready: FISTS, clips: { attack: PUNCH }, swingL: 0.05, swingR: 0.05 },
  binoculars: { carry: st({ rUp: [-1.4, 0.4, -0.45], rFore: [-2.3, 0, 0], rHand: [-0.3, 0, 0], lUp: [-1.4, -0.4, 0.45], lFore: [-2.3, 0, 0], neck: [0, 0, 0], head: [-0.15, 0, 0] }), ready: FISTS, clips: { attack: PUNCH }, swingL: 0.05, swingR: 0.05 },
  guitar: { carry: st({ rUp: [-0.4, 0.3, 0.1], rFore: [-1.3, 0, 0], rHand: [0, 0, 0.3], lUp: [-0.6, -0.3, 0.3], lFore: [-1.4, 0.4, 0], head: [0.12, 0.2, 0.08] }), ready: FISTS, clips: { attack: PUNCH }, swingL: 0.05, swingR: 0.05,
    post: (an) => { an.f.euler[an.ix.rFore] += 0.18 * Math.sin(an.t * 9) * (1 - an.moveW); } }, // strumming

  syringe: { carry: st({ rUp: [-0.3, 0, -0.3], rFore: [-1.9, -0.2, 0] }), ready: ONE_READY, clips: { attack: SWING1 } },
  crutch: { carry: st({ lUp: [-0.05, 0, 0.32], lFore: [-0.05, 0, 0] }), ready: FISTS, clips: { attack: PUNCH }, swingL: 0.3 },
  yoke: { carry: st({ lUp: [-0.15, 0, 1.35], lFore: [-1.6, 0.6, 0], rUp: [-0.15, 0, -1.35], rFore: [-1.6, -0.6, 0] }), ready: FISTS, clips: { attack: PUNCH }, swingL: 0.02, swingR: 0.02 },
  crossed: { carry: st({ lUp: [-0.3, -1.15, 0.25], lFore: [-1.75, 0, 0], rUp: [-0.32, 1.15, -0.25], rFore: [-1.7, 0, 0] }), ready: FISTS, clips: { attack: PUNCH }, swingL: 0.02, swingR: 0.02 },
  hips: { carry: st({ lUp: [-0.15, -1.4, 0.75], lFore: [-1.3, 0, 0], rUp: [-0.15, 1.4, -0.75], rFore: [-1.3, 0, 0] }), ready: FISTS, clips: { attack: PUNCH }, swingL: 0.05, swingR: 0.05 },
  shrug: { carry: st({ lUp: [-0.15, 1.4, 0.8], lFore: [-1.6, 0, 0], rUp: [-0.15, -1.4, -0.8], rFore: [-1.6, 0, 0], head: [-0.1, 0.1, 0.18] }), ready: FISTS, clips: { attack: PUNCH } },
};

// --- scene poses (campfire / workshop) ---
const hipsDown = (dy, dz) => (an) => { const ix = an.ix, T = an.f.trans; T[ix.hips + 1] += dy; T[ix.hips + 2] += dz || 0; };
const SIT_LEGS = { hips: [0, 0, 0], lThigh: [-1.45, 0.12, 0.06], lShin: [1.45, 0, 0], lFoot: [0.05, 0, 0], rThigh: [-1.45, -0.12, -0.06], rShin: [1.45, 0, 0], rFoot: [0.05, 0, 0] };
POSES.sitChair = { carry: st(Object.assign({}, SIT_LEGS, { spine: [-0.05, 0, 0], lUp: [-0.2, 0, 0.3], lFore: [-0.9, 0.3, 0], rUp: [-0.2, 0, -0.3], rFore: [-0.9, -0.3, 0] })), post: hipsDown(-0.42, -0.06), noWalk: true };
POSES.sitCross = { carry: st(Object.assign({}, SIT_LEGS, { lThigh: [-1.45, 0.0, 0.08], rThigh: [-1.9, -0.6, 0.0], rShin: [1.5, 0, 0], rFoot: [0.3, 0, 0], spine: [-0.08, 0, 0], chest: [-0.04, 0.05, 0],
  rUp: [-0.15, 0, -0.35], rFore: [-0.7, -0.3, 0], lUp: [-0.85, -0.25, 0.2], lFore: [-0.75, 0.3, 0], lHand: [0, 0, 0] })), post: hipsDown(-0.42, -0.06), noWalk: true };
// round 4: leaning back on the right hand, left forearm resting on the raised left knee, right leg out (campfire image)
POSES.sitGround = { carry: st({ hips: [-0.5, 0, 0], spine: [-0.15, 0, 0], chest: [-0.1, -0.1, 0], neck: [0.25, 0, 0], head: [0.2, 0.3, 0],
  lThigh: [-1.2, 0.25, 0.15], lShin: [1.8, 0, 0], lFoot: [-0.3, 0, 0], rThigh: [-1.0, -0.25, -0.2], rShin: [0.5, 0, 0], rFoot: [-0.1, 0, 0],
  rUp: [1.0, 0, -0.45], rFore: [0, 0, 0], rHand: [-0.6, 0, 0], lUp: [-0.55, 0.2, 0.2], lFore: [-0.9, 0.1, 0] }), post: hipsDown(-0.8, -0.1), noWalk: true };

POSES.rifleRelaxed = { carry: st({ chest: [0.03, -0.08, 0], rUp: [-0.2, 0.55, -0.1], rFore: [-1.05, 0, 0], rHand: [0.45, 0, 0], lUp: [-0.55, -0.55, 0.15], lFore: [-1.2, 0, 0] }), ready: RIFLE_READY, clips: { attack: FIRE(RIFLE_READY, 'rUp') }, swingL: 0.1, swingR: 0.1 };
POSES.inspect = { carry: st({ head: [0.3, 0.25, 0], neck: [0.2, 0, 0], chest: [0.05, -0.1, 0], rUp: [-0.55, 0.6, -0.25], rFore: [-1.55, 0, 0], rHand: [0.55, 0, 0.1], lUp: [-0.9, -0.4, 0.25], lFore: [-1.2, 0, 0] }), ready: RIFLE_READY, clips: { attack: FIRE(RIFLE_READY, 'rUp') }, swingL: 0.1, swingR: 0.1 };
POSES.deskSit = { carry: st(Object.assign({}, SIT_LEGS, { spine: [0.08, -0.15, 0], chest: [0.06, -0.2, 0], head: [0, -0.15, 0],
  rUp: [-1.05, 0.2, -0.1], rFore: [-0.45, 0, 0], rHand: [0.2, 0, 0], lUp: [-0.35, 0, 0.3], lFore: [-1.1, 0.2, 0] })), post: hipsDown(-0.42, -0.06), noWalk: true };

// --- zombies: hunched shamble, arms forward or dangling, lunge bite ---
const Z_CARRY = (arms) => hStance({ spine: [0.22, 0, 0.04], chest: [0.15, 0.05, -0.04], neck: [-0.15, 0, 0], head: [-0.1, 0.15, 0.18], hips: [0.06, 0.05, 0.03],
  lThigh: [-0.2, 0.2, 0.1], lShin: [0.35, 0, 0], rThigh: [0.05, -0.2, -0.08], rShin: [0.1, 0, 0],
  // round 4: reaching arms angle outward too (read from the front like the zombie sheet), dangling arms hang forward
  lUp: arms === 'dangle' ? [-0.25, 0, 0.3] : arms === 'one' ? [-1.05, 0, 0.5] : [-1.0, 0, 0.55], lFore: arms === 'dangle' ? [-0.35, 0, 0] : [-0.45, 0.3, 0], lHand: [0.45, 0, 0.1],
  rUp: arms === 'dangle' || arms === 'one' ? [-0.2, 0, -0.42] : [-0.75, 0, -0.6], rFore: arms === 'dangle' || arms === 'one' ? [-0.3, 0, 0] : [-0.6, -0.3, 0], rHand: [0.45, 0, -0.1] });

const LUNGE = (base) => mkClip(0.45, [
  { t: 0.3, e: 'out', b: { spine: [0.05, 0, 0], chest: [-0.1, 0, 0], lUp: [-2.0, 0, 0.3], rUp: [-2.0, 0, -0.3], lFore: [-0.3, 0, 0], rFore: [-0.3, 0, 0] }, root: [0, 0.02, -0.06] },
  { t: 0.47, e: 'snap', b: { spine: [0.4, 0, 0], chest: [0.3, 0, 0], head: [0.1, 0, 0], lUp: [-1.4, 0, 0.05], rUp: [-1.4, 0, -0.05], lFore: [-0.1, 0, 0], rFore: [-0.1, 0, 0] }, root: [0, -0.05, 0.22] },
  { t: 0.8, b: {} }], base);
{ // limping shambler: right foot bent inward, a dip on every right step
  const c = Object.assign(Z_CARRY('dangle'), { rThigh: [-0.15, -0.3, -0.12], rShin: [0.35, 0, 0], rFoot: [0.55, 0.45, 0.4] });
  POSES['zombie-limp'] = { carry: c, ready: c, clips: { attack: LUNGE(c) }, swingL: 0.6, swingR: 0.2, gait: { bounce: 0.4, sway: 2.6, lean: 2.2, lift: 0.45 }, stride: 0.7, speedK: 0.38, zombie: true,
    post: (an) => { const E = an.f.euler, ix = an.ix; E[ix.rFoot] += 0.4; E[ix.rFoot + 1] += 0.4; an.f.trans[ix.hips + 1] -= 0.035 * Math.max(0, Math.sin(an.ph)) * an.moveW; E[ix.spine + 2] += 0.08 * Math.sin(an.ph) * an.moveW; } };
}
for (const arms of ['forward', 'dangle', 'one']) {
  const c = Z_CARRY(arms);
  POSES['zombie-' + arms] = { carry: c, ready: c, clips: { attack: LUNGE(c) }, swingL: 0.12, swingR: arms === 'forward' ? 0.12 : 0.6, gait: { bounce: 0.5, sway: 2.2, lean: 2.0, lift: 0.55 }, stride: 0.75, speedK: 0.45, zombie: true };
}
