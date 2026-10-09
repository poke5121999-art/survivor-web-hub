// Camera bám sau xe. Bản gốc không để lộ thông số camera thường (chỉ có RoadCameraAdditionParam cộng thêm khi phun),
// nên các số dưới là chọn theo cảm giác, ghi rõ ở C.
// - Hướng camera trộn giữa mũi xe và hướng vận tốc: khi drift camera đi theo đường xe trượt, thân xe lộ ra nghiêng
//   một góc, giống góc nhìn drift của Zing Speed.
// - Lò xo dọc mềm hơn lò xo ngang: lúc phun xe vọt ra xa camera rồi camera đuổi kịp, đó là phần lớn cảm giác tốc độ.
// - FOV nới theo tốc độ và thêm khi phun; rung theo xung (đập tường, tiếp đất), tắt được trong cài đặt.
(function (TD) {
  'use strict';
  const THREE = window.THREE;
  const C = {
    dist: 5.4, distSpeed: 1.1, height: 2.05, lookAhead: 5.0, lookUp: 0.95,
    fov: 60, fovSpeed: 7, fovBoost: 11, fovMini: 4,
    kLat: 9, kLon: 4.2, kUp: 7, velBlendDrift: 0.62, velBlendDrive: 0.25, rollDrift: 0.045,
  };
  const cam = { C, obj: null, pos: new THREE.Vector3(), look: new THREE.Vector3(), yaw: 0, fov: C.fov, shakeT: 0, shakeP: 0,
    roll: 0, mode: 'chase', t: 0, dip: 0 };
  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();

  cam.init = function (camera) { cam.obj = camera; camera.fov = C.fov; camera.near = 0.3; camera.far = 3000; camera.updateProjectionMatrix(); };

  cam.kick = function (power) {
    const s = TD.save && TD.save.d && TD.save.d.settings;
    if (s && s.shake === false) return;
    cam.shakeP = Math.min(1.2, Math.max(cam.shakeP, power)); cam.shakeT = 0;
  };
  cam.landDip = function (power) { cam.dip = Math.min(0.6, cam.dip + power * 0.35); };

  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // Đặt ngay sau xe, không nội suy (đầu trận, sau hồi sinh).
  cam.snap = function (k) {
    cam.yaw = k.yaw;
    fwd.set(Math.sin(k.yaw), 0, Math.cos(k.yaw));
    cam.pos.set(k.x - fwd.x * C.dist, k.y + C.height, k.z - fwd.z * C.dist);
    cam.look.set(k.x + fwd.x * C.lookAhead, k.y + C.lookUp, k.z + fwd.z * C.lookAhead);
  };

  // k: Kart của mô phỏng (yaw: 0 = hướng +z, tăng ngược chiều kim đồng hồ nhìn từ trên). boost 0..1, mini 0..1.
  cam.update = function (dt, k, boost, mini) {
    const o = cam.obj;
    cam.t += dt;
    const sp = Math.hypot(k.vx, k.vz);
    const velYaw = sp > 3 ? Math.atan2(k.vx, k.vz) : k.yaw;
    const drifting = k.st === 'drift';
    const blend = drifting ? C.velBlendDrift : C.velBlendDrive;
    const wantYaw = k.yaw + wrap(velYaw - k.yaw) * blend;
    cam.yaw += wrap(wantYaw - cam.yaw) * (1 - Math.exp(-dt * (drifting ? 5.5 : 7)));
    fwd.set(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
    const sf = Math.min(1, sp / 60);
    const dist = C.dist + C.distSpeed * sf + boost * 0.9;
    const want = tmp.set(k.x - fwd.x * dist, k.y + C.height + sf * 0.25 - cam.dip, k.z - fwd.z * dist);
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const d = want.clone().sub(cam.pos);
    const lon = d.dot(fwd), lat = d.dot(side);
    const aLon = 1 - Math.exp(-dt * C.kLon), aLat = 1 - Math.exp(-dt * C.kLat), aUp = 1 - Math.exp(-dt * C.kUp);
    cam.pos.addScaledVector(fwd, lon * aLon).addScaledVector(side, lat * aLat);
    cam.pos.y += d.y * aUp;
    // Không để camera tụt quá xa khi xe vọt lên lúc phun (giữ xe trong khung).
    const back = tmp.set(k.x, 0, k.z).sub(new THREE.Vector3(cam.pos.x, 0, cam.pos.z)).dot(fwd);
    if (back > dist * 1.6) cam.pos.addScaledVector(fwd, back - dist * 1.6);
    cam.dip *= Math.exp(-dt * 6);
    cam.look.set(k.x + fwd.x * C.lookAhead, k.y + C.lookUp, k.z + fwd.z * C.lookAhead);
    const wantFov = C.fov + C.fovSpeed * sf + C.fovBoost * boost + C.fovMini * mini;
    cam.fov += (wantFov - cam.fov) * (1 - Math.exp(-dt * (wantFov > cam.fov ? 7 : 2.5)));
    const wantRoll = drifting ? -k.drift.dir * C.rollDrift : 0;
    cam.roll += (wantRoll - cam.roll) * (1 - Math.exp(-dt * 4));
    o.position.copy(cam.pos);
    if (cam.shakeP > 0.01) {
      cam.shakeT += dt;
      const a = cam.shakeP * 0.22;
      o.position.x += Math.sin(cam.t * 71) * a; o.position.y += Math.sin(cam.t * 53 + 1) * a * 0.7;
      cam.shakeP *= Math.exp(-dt * 7);
    }
    o.up.set(Math.sin(cam.roll) * fwd.z, Math.cos(cam.roll), -Math.sin(cam.roll) * fwd.x);
    o.lookAt(cam.look);
    if (Math.abs(o.fov - cam.fov) > 0.01) { o.fov = cam.fov; o.updateProjectionMatrix(); }
  };

  // Vòng quanh đoàn xe trước khi đếm ngược (bản gốc chạy CameraPath "OpeningCamera" riêng từng đường).
  cam.orbit = function (dt, cx, cy, cz, yaw0, t) {
    const o = cam.obj;
    const a = yaw0 + Math.PI * 0.85 - t * 0.45;
    const r = 16 - t * 1.6;
    o.position.set(cx + Math.sin(a) * r, cy + 4.5 - t * 0.4, cz + Math.cos(a) * r);
    o.up.set(0, 1, 0);
    o.lookAt(cx, cy + 0.8, cz);
    o.fov = 55; o.updateProjectionMatrix();
    cam.fov = 55;
  };

  TD.cam = cam;
})(globalThis.TD = globalThis.TD || {});
