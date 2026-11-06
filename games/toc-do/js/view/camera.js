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
    dist: 6.9, distSpeed: 1.4, height: 2.9, lookAhead: 5.0, lookUp: 0.95,
    fov: 66, fovSpeed: 6, fovBoost: 9, fovMini: 3,
    kLat: 9, kLon: 4.2, kUp: 7, velBlendDrift: 0.85, velBlendDrive: 0.25, rollDrift: 0.045,
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

  // Camera mở màn theo đường gốc (data/campaths.js: CameraPathAnimator của prefab scenecamerapath, đoạn thẳng 2 khoá).
  // Bản gốc có 3 đường cho mỗi map; chọn ngẫu nhiên một đường rồi bay rồi bay dọc đường đua (blend) về chỗ camera bám xe ở vạch xuất phát.
  // Đường dài 7 s (đường 3) rút còn tối đa SHOT_MAX giây để lượt chờ không quá lâu.
  const SHOT_MAX = 3.4;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), mtx = new THREE.Matrix4(), v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), vUp = new THREE.Vector3(0, 1, 0);
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  function lookQ(q, fwd, up) { mtx.lookAt(v0.set(0, 0, 0), fwd, up); return q.setFromRotationMatrix(mtx); }
  const smooth = (x) => x * x * (3 - 2 * x);

  // Lối bay về vạch xuất phát: đi dọc đường đua (đã chắc chắn trống) cách mặt đường ROUTE_UP m, từ điểm đường gần cuối shot
  // đến điểm đường gần xe mình đường ngắn nhất (BFS trên đồ thị next, hai chiều). Bay thẳng qua thành phố sẽ xuyên nhà.
  // Trả về mảng Vector3 (đã làm mượt), hoặc null nếu không tới được (rơi về Bezier vòng lên cao).
  const ROUTE_UP = 9;
  function route(trackId, from, goal) {
    const t = TD.TRACKS && TD.TRACKS[trackId];
    if (!t || !t.pts || !t.pts.next) return null;
    const P = t.pts, n = P.x.length;
    const near = (v) => { let b = 0, bd = 1e18; for (let i = 0; i < n; i++) { const d = (P.x[i] - v.x) ** 2 + (P.y[i] - v.y) ** 2 + (P.z[i] - v.z) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
    const a = near(from), b = near(goal);
    const adj = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) for (const j of P.next[i]) { adj[i].push(j); adj[j].push(i); }
    const prev = new Int32Array(n).fill(-2); prev[a] = -1;
    const q = [a];
    for (let h = 0; h < q.length && prev[b] === -2; h++) for (const j of adj[q[h]]) if (prev[j] === -2) { prev[j] = q[h]; q.push(j); }
    if (prev[b] === -2) return null;
    const idx = []; for (let i = b; i !== -1; i = prev[i]) idx.push(i);
    idx.reverse();
    const pts = idx.map((i) => new THREE.Vector3(P.x[i], P.y[i] + ROUTE_UP, P.z[i]));
    const sm = pts.map((_, i) => { const r = new THREE.Vector3(); let c = 0; for (let j = Math.max(0, i - 4); j <= Math.min(pts.length - 1, i + 4); j++) { r.add(pts[j]); c++; } return r.divideScalar(c); });
    return [from.clone(), ...sm, goal.clone()];
  }

  cam.hasIntro = function (trackId) { return !!(TD.CAMPATHS && TD.CAMPATHS[trackId]); };

  // Gọi mỗi khung trong lúc intro; trả về tổng độ dài intro (giây) hoặc 0 nếu đường này không có camera path (dùng orbit).
  cam.intro = function (dt, t, k, trackId) {
    const set = TD.CAMPATHS && TD.CAMPATHS[trackId];
    if (!set) return 0;
    if (!cam._in || t <= dt + 1e-9) {
      const shot = set.shots[cam.introShot != null ? cam.introShot : (Math.random() * set.shots.length) | 0];
      const dur = Math.min(shot.dur, SHOT_MAX);
      cam.snap(k);
      const goal = { p: cam.pos.clone(), look: cam.look.clone() };
      const kEnd = shot.keys[1], pEnd = V(kEnd.p);
      const d = goal.p.distanceTo(pEnd);
      const way = route(trackId, pEnd, goal.p);
      let len = d;
      if (way) { len = 0; way.cum = way.map((v, i) => (i ? (len += v.distanceTo(way[i - 1])) : 0)); }
      const blend = Math.min(2.4, Math.max(0.8, 0.5 + len / 400));
      const vel = V(shot.keys[1].p).sub(V(shot.keys[0].p)).divideScalar(shot.dur);
      cam._in = { shot, dur, blend, goal, d, total: dur + blend, vel, way, len };
    }
    const I = cam._in, o = cam.obj, keys = I.shot.keys;
    if (t < I.dur) {
      let u = t / I.dur;
      if (I.shot.ease === 'out') u = 1 - (1 - u) * (1 - u);
      o.position.copy(V(keys[0].p).lerp(V(keys[1].p), u));
      lookQ(qa, V(keys[0].fwd), V(keys[0].up)); lookQ(qb, V(keys[1].fwd), V(keys[1].up));
      o.quaternion.copy(qa.slerp(qb, u));
      cam.fov = keys[0].fov + (keys[1].fov - keys[0].fov) * u;
    } else {
      const u = Math.min(1, (t - I.dur) / I.blend), s = smooth(u);
      const p0 = V(keys[1].p), p1 = I.goal.p;
      if (I.way) {
        const W = I.way, L = s * I.len;
        let i = 1; while (i < W.length - 1 && W.cum[i] < L) i++;
        const f = (L - W.cum[i - 1]) / Math.max(1e-6, W.cum[i] - W.cum[i - 1]);
        o.position.copy(W[i - 1]).lerp(W[i], Math.min(1, Math.max(0, f)));
      } else {
        // Không có lối đi: Bezier bậc 3 vòng lên cao rồi hạ xuống vạch xuất phát.
        const H = Math.min(110, 12 + I.d * 0.5);
        const c0 = v1.copy(p0).addScaledVector(I.vel, I.blend * 0.5); c0.y += H;
        fwd.set(Math.sin(k.yaw), 0, Math.cos(k.yaw));
        const c1 = p1.clone().addScaledVector(fwd, -Math.min(30, I.d * 0.2)); c1.y += H * 0.55;
        const r = 1 - s;
        o.position.set(0, 0, 0).addScaledVector(p0, r * r * r).addScaledVector(c0, 3 * r * r * s)
          .addScaledVector(c1, 3 * r * s * s).addScaledVector(p1, s * s * s);
      }
      lookQ(qa, V(keys[1].fwd), V(keys[1].up));
      lookQ(qb, v1.copy(I.goal.look).sub(I.goal.p).normalize(), vUp);
      o.quaternion.copy(qa.slerp(qb, s));
      cam.fov = keys[1].fov + (C.fov - keys[1].fov) * s;
    }
    if (Math.abs(o.fov - cam.fov) > 0.01) { o.fov = cam.fov; o.updateProjectionMatrix(); }
    return I.total;
  };

  TD.cam = cam;
})(globalThis.TD = globalThis.TD || {});
