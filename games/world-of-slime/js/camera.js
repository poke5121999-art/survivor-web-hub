// Camera theo FollowCamera + CameraController (CODE.md §8): góc cúi cố định 40 độ (level3 Main Camera),
// bám người chơi có vùng chết, tốc độ bám minSpeed..maxSpeed theo khoảng lệch, kẹp theo cameraMoveRect,
// zoom bằng con lăn / chụm. Số trên prefab chưa đọc -> CAMERA trong config.js ghi [ĐỀ XUẤT].
import * as THREE from 'three';
import { CAMERA, PARAMS } from './config.js?v=20261022d';

const D2R = Math.PI / 180;

export class FollowCamera {
  constructor(map, aspect) {
    this.cam = new THREE.PerspectiveCamera(CAMERA.fov, aspect, 5, 600);
    this.dist = CAMERA.dist; this.pitch = +PARAMS.get('pitch') || CAMERA.pitch;   // ?pitch= để so ảnh
    this.focus = null;          // điểm bám, toạ độ Unity {x, y, z}
    this.setMap(map);
  }
  // cameraMoveRect của ClientMapData (null ở kho 478 -> cả bản đồ); fov của rect là FOV dọc (8 ở Larus)
  setMap(map) {
    const rect = map.data.client.cameraMoveRect || {};
    this.rect = { x0: rect.startX ?? 0, z0: rect.startY ?? 0, x1: rect.endX ?? map.width, z1: rect.endY ?? map.height };
    this.cam.fov = rect.fov || CAMERA.fov; this.cam.updateProjectionMatrix();
    this.focus = null;
  }
  setAspect(a) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); }
  zoom(f) { this.dist = Math.min(CAMERA.zoomMax, Math.max(CAMERA.zoomMin, this.dist * f)); }
  wheel(notches) { this.zoom(Math.pow(1.12, notches)); }

  // mặt đất nhìn thấy quanh điểm bám: nửa bề ngang, khoảng gần (âm) và xa theo trục z
  footprint(dist = this.effDist()) {
    const p = this.pitch * D2R, v = this.cam.fov * D2R / 2;
    const H = dist * Math.sin(p), B = dist * Math.cos(p);
    const far = H / Math.tan(Math.max(0.05, p - v)) - B, near = H / Math.tan(p + v) - B;
    const halfW = Math.tan(v) * this.cam.aspect * dist;
    return { halfW, near, far };
  }
  // màn rộng (mobile 19.5:9) nhìn thấy nhiều hơn bản đồ: kéo camera lại gần cho vừa cameraMoveRect [ĐỀ XUẤT]
  effDist() {
    const f1 = this.footprint(1), r = this.rect;
    const fit = Math.min((r.x1 - r.x0) / (2 * f1.halfW), (r.z1 - r.z0) / (f1.far - f1.near)) * 0.96;
    return Math.min(this.dist, fit);
  }
  // cameraMoveRect giới hạn ĐIỂM NHÌN (tâm màn), không giới hạn mép màn: inn1.png người chơi ở x 9.7 vẫn đứng giữa màn
  // dù rect bắt đầu ở x 0 và màn rộng ~40 m (mép trái thấy nền tối ngoài nhà). [ĐỀ XUẤT] cách đọc
  // MapFuncHelper.CameraMoveLimitRectToLimitPos (chưa dịch ngược hết).
  clamp(x, z) {
    const r = this.rect;
    return { x: Math.min(r.x1, Math.max(r.x0, x)), z: Math.min(r.z1, Math.max(r.z0, z)) };
  }
  update(dt, target, snap = false) {
    if (!this.focus || snap) this.focus = { x: target.x, y: target.y, z: target.z };
    const dz = CAMERA.deadZone, f = this.focus;
    const ex = target.x - f.x, ez = target.z - f.z;
    const ox = Math.sign(ex) * Math.max(0, Math.abs(ex) - dz[0]), oz = Math.sign(ez) * Math.max(0, Math.abs(ez) - dz[1]);
    const off = Math.hypot(ox, oz);
    if (off > 1e-4) {
      const sp = CAMERA.minSpeed + (CAMERA.maxSpeed - CAMERA.minSpeed) * Math.min(1, off / CAMERA.distanceForMaxSpeed);
      const k = Math.min(1, sp * dt / off);
      f.x += ox * k; f.z += oz * k;
    }
    f.y += (target.y - f.y) * Math.min(1, dt * 4);
    const c = this.clamp(f.x, f.z);
    const p = this.pitch * D2R, d = this.effDist();
    // Unity (x, y, z) -> three (-x, y, z); camera nhìn theo +z
    this.cam.position.set(-c.x, f.y + d * Math.sin(p), c.z - d * Math.cos(p));
    this.cam.lookAt(-c.x, f.y, c.z);
  }
}
