// A small Cinemachine: the virtual cameras of data/vcams.json (tools/export_vcams.py) evaluated well enough for the
// game's shots. Body: Transposer (binding modes below), 3rdPersonFollow, or none (the vcam's own transform). Aim:
// Composer / HardLookAt (look at LookAt + tracked offset, Composer damped), SameAsFollowTarget, or none.
// Offsets in vcams.json are Unity space: converted with (x, y, -z) on use. Unity cameras look down local +Z, which the
// exporter's handedness flip turns into three's -Z, so a vcam transform is directly a three camera transform.
import * as THREE from 'three';

const U = v => new THREE.Vector3(v.x, v.y, -v.z);
const up = new THREE.Vector3(0, 1, 0);
const m4 = new THREE.Matrix4();

function yawOf(q) {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-f.x, -f.z);
}

function lookRotation(eye, target, out) {
  if (eye.distanceToSquared(target) < 1e-8) return out;
  m4.lookAt(eye, target, up);
  return out.setFromRotationMatrix(m4);
}

// Damping time t (Cinemachine's "approximate seconds to reach the target"): fraction of the gap closed this frame.
const damp = (t, dt) => (t > 0 ? 1 - Math.exp((-dt * 3) / t) : 1);

export class Cine {
  constructor(defs, find) {
    this.defs = defs;
    this.find = find;
    this.state = new Map();
    this.live = new Set();
    this.override = { follow: {}, look: {} };
  }

  // Pose of one vcam this frame: {pos, quat, fov}. `fresh` skips damping (the vcam just went live).
  pose(path, dt, fresh) {
    const d = this.defs[path];
    const node = this.find(path);
    if (!d || !node) return null;
    let st = this.state.get(path);
    if (!st || fresh) {
      st = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), aim: null, heading: null };
      this.state.set(path, st);
      fresh = true;
    }
    node.updateWorldMatrix(true, false);
    const own = new THREE.Vector3(), ownQ = new THREE.Quaternion();
    node.matrixWorld.decompose(own, ownQ, new THREE.Vector3());
    // gameplay assigns Follow/LookAt at runtime on vcams the scene leaves empty (cine.override.follow[path] = obj)
    const follow = this.override.follow[path] || (d.follow && this.find(d.follow));
    const look = this.override.look[path] || (d.look && this.find(d.look));
    const pos = own.clone();
    const b = d.body || {};
    if (follow && b.type === 'Transposer') {
      const fp = follow.getWorldPosition(new THREE.Vector3());
      const fq = follow.getWorldQuaternion(new THREE.Quaternion());
      const off = U(b.m_FollowOffset);
      // BindingMode: 0 LockToTargetOnAssign, 1 LockToTargetWithWorldUp, 2 LockToTargetNoRoll, 3 LockToTarget,
      // 4 WorldSpace, 5 SimpleFollowWithWorldUp
      const mode = b.m_BindingMode;
      if (mode === 4) pos.copy(fp).add(off);
      else if (mode === 5) {
        // keep the camera's own heading around the target, only distance/height follow
        const flat = st.pos.clone().sub(fp).setY(0);
        const yaw = fresh || flat.lengthSq() < 1e-6 ? yawOf(fq) : Math.atan2(-flat.x, -flat.z) + Math.PI;
        pos.copy(fp).add(off.clone().applyAxisAngle(up, yaw));
      } else if (mode === 3 || mode === 2) pos.copy(fp).add(off.applyQuaternion(fq));
      else pos.copy(fp).add(off.applyAxisAngle(up, yawOf(fq)));
      if (!fresh) pos.lerpVectors(st.pos, pos, damp(b.m_XDamping ?? 1, dt));
    } else if (follow && b.type === '3rdPersonFollow') {
      const fp = follow.getWorldPosition(new THREE.Vector3());
      const fq = follow.getWorldQuaternion(new THREE.Quaternion());
      const sh = U(b.ShoulderOffset);
      sh.x *= (b.CameraSide ?? 1) * 2 - 1;
      const hand = fp.clone().add(sh.applyQuaternion(fq)).add(new THREE.Vector3(0, b.VerticalArmLength || 0, 0));
      pos.copy(hand).add(new THREE.Vector3(0, 0, b.CameraDistance ?? 2).applyQuaternion(fq));
      if (!fresh) pos.lerpVectors(st.pos, pos, damp(b.Damping?.z ?? 0.3, dt));
    }
    const quat = ownQ.clone();
    const a = d.aim || {};
    if (look && (a.type === 'Composer' || a.type === 'HardLookAt')) {
      const target = look.getWorldPosition(new THREE.Vector3());
      if (a.m_TrackedObjectOffset) target.add(U(a.m_TrackedObjectOffset).applyQuaternion(look.getWorldQuaternion(new THREE.Quaternion())));
      if (!st.aim || fresh || a.type === 'HardLookAt') st.aim = target.clone();
      else st.aim.lerp(target, damp(Math.max(a.m_HorizontalDamping ?? 0.5, a.m_VerticalDamping ?? 0.5), dt));
      lookRotation(pos, st.aim, quat);
    } else if (follow && a.type === 'SameAsFollowTarget') {
      follow.getWorldQuaternion(quat);
    }
    st.pos.copy(pos);
    st.quat.copy(quat);
    return { pos, quat, fov: d.fov || 60 };
  }

  // shots: [{path, weight}] (weights sum to 1). Writes the blended pose into `camera`.
  apply(camera, shots, dt) {
    let pos = null, quat = null, fov = 0, wsum = 0;
    const nowLive = new Set();
    for (const s of shots) {
      if (s.weight <= 0) continue;
      nowLive.add(s.path);
      const p = this.pose(s.path, dt, !this.live.has(s.path));
      if (!p) continue;
      const k = s.weight / (wsum + s.weight);
      pos = pos ? pos.lerp(p.pos, k) : p.pos;
      quat = quat ? quat.slerp(p.quat, k) : p.quat;
      fov = fov + (p.fov - fov) * k;
      wsum += s.weight;
    }
    this.live = nowLive;
    if (!pos) return false;
    camera.position.copy(pos);
    camera.quaternion.copy(quat);
    if (Math.abs(camera.fov - fov) > 1e-3) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    return true;
  }
}
