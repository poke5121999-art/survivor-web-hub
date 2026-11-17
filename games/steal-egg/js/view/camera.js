// CameraFollow on MainCamera (decompiled UpdateCameraPosition, RotateCamera; values from art/world/scene.json):
//   rotation = Euler(pitch, yaw, 0); position = player - rotation * forward * distance + up * height,
//   both eased with Lerp/Slerp(t = deltaTime * followSpeed), so followSpeed 100 is a hard follow at normal frame rates.
// CameraDragArea.OnDrag: yaw += dx * rotationSpeed * 0.02, pitch -= dy * rotationSpeed * 0.02 (screen pixels, y up),
// pitch clamped to [yMinLimit, yMaxLimit]. rotationSpeed is overwritten by Settings.Sensitivity (PlayerPrefs
// "sensitivity", default 10) in OnEnable.
// Angles are kept in Unity's frame (degrees, yaw about +y from +z); the exporter's z flip is applied when placing.
import * as THREE from 'three';

const DEG = Math.PI / 180;

export class FollowCamera {
  constructor(camera, cameraNode) {
    const n = cameraNode.userData.node, f = n.k.CameraFollow, C = n.k.Camera;
    this.camera = camera;
    this.followSpeed = f.followSpeed;
    this.distance = f.distance;
    this.height = f.height;
    this.rotationSpeed = 10;
    this.yMin = f.yMinLimit;
    this.yMax = f.yMaxLimit;
    camera.fov = C['field of view'] ?? C.m_FieldOfView ?? 60;
    camera.near = C['near clip plane'] ?? C.m_NearClipPlane ?? 0.3;
    camera.far = C['far clip plane'] ?? C.m_FarClipPlane ?? 1000;
    camera.updateProjectionMatrix();
    // Start(): x = eulerAngles.y, y = eulerAngles.x of the scene's MainCamera.
    cameraNode.updateWorldMatrix(true, false);
    const q = new THREE.Quaternion();
    cameraNode.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    this.x = Math.atan2(fwd.x, -fwd.z) / DEG;
    this.y = Math.asin(-THREE.MathUtils.clamp(fwd.y, -1, 1)) / DEG;
    camera.position.setFromMatrixPosition(cameraNode.matrixWorld);
    camera.quaternion.copy(q);
    this.goal = new THREE.Quaternion();
    this.look = new THREE.Object3D();
  }

  // Unity forward of Euler(pitch, yaw, 0), in three.js space.
  forward(out = new THREE.Vector3()) {
    const x = this.x * DEG, y = this.y * DEG;
    return out.set(Math.sin(x) * Math.cos(y), -Math.sin(y), -Math.cos(x) * Math.cos(y));
  }

  // Yaw of the camera on the ground plane in the sim's convention (forward = (sin, cos) in three.js x/z).
  groundYaw() {
    const f = this.forward();
    return Math.atan2(f.x, f.z);
  }

  // dx, dy in screen pixels with y down (DOM); Unity's pointer y grows upward.
  drag(dx, dy) {
    this.x += dx * this.rotationSpeed * 0.02;
    this.y = THREE.MathUtils.clamp(this.y + dy * this.rotationSpeed * 0.02, this.yMin, this.yMax);
  }

  update(dt, target) {
    const f = this.forward();
    const want = new THREE.Vector3(target.x - f.x * this.distance, target.y - f.y * this.distance + this.height, target.z - f.z * this.distance);
    const k = THREE.MathUtils.clamp(dt * this.followSpeed, 0, 1);
    this.camera.position.lerp(want, k);
    this.look.position.set(0, 0, 0);
    this.look.lookAt(f.x, f.y, f.z);
    // Object3D.lookAt points +z at the target; a camera looks down -z, so turn half way around y.
    this.goal.copy(this.look.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    this.camera.quaternion.slerp(this.goal, k);
  }
}
