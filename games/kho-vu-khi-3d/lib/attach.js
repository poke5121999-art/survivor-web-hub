// Attach a built weapon to a character hand. Compatible with an inHand(group, side, aim) style API.
import * as THREE from '../vendor/three.module.min.js';

const _x = new THREE.Vector3(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

function basis(fwd, up) {
  const z = fwd.clone().normalize();
  const x = up.clone().sub(z.clone().multiplyScalar(up.dot(z)));
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0).sub(z.clone().multiplyScalar(z.x));
  x.normalize();
  const y = z.clone().cross(x);
  return new THREE.Matrix4().makeBasis(x, y, z);
}

/**
 * Parent `group` to `hand` (an Object3D at the palm) so its grip point sits at the hand origin and
 * its forward axis (tip / muzzle) points along `aim` (hand-local, default +Z).
 * side 'l' mirrors the up vector so the edge faces the same way for either hand.
 * Returns the group. For two-handed weapons use gripWorld(group,'grip2') for the off-hand target.
 */
export function inHand(group, hand, side = 'r', aim = new THREE.Vector3(0, 0, 1), handUp = new THREE.Vector3(0, 1, 0)) {
  const meta = group.userData.weapon, g = meta.grip;
  const up = handUp.clone(); if (side === 'l') up.x *= -1;
  const Mh = basis(aim, up), Mw = basis(g.fwd, g.up);
  const R = _m1.copy(Mh).multiply(_m2.copy(Mw).transpose());
  group.quaternion.setFromRotationMatrix(R);
  group.position.copy(g.pos).applyQuaternion(group.quaternion).negate();
  hand.add(group);
  return group;
}

/** World position of a named socket ('grip','grip2','muzzle','tip'); writes into `out`. */
export function gripWorld(group, name = 'grip2', out = new THREE.Vector3()) {
  const o = group.getObjectByName(name);
  if (!o) return null;
  group.updateWorldMatrix(true, false);
  return o.getWorldPosition(out);
}
