// Side-on camera rig: looks at a point on the play plane from a slight height, follows a focus,
// zooms by distance, and shakes from a decaying trauma value.
(function () {
  'use strict';
  const PM = globalThis.PM;
  const PITCH = 0.095, FOV = 26;

  PM.CameraRig = function (G) {
    const THREE = globalThis.THREE;
    const cam = new THREE.PerspectiveCamera(FOV, 16 / 9, 5, 2600);
    cam.layers.enable(1);
    G.camera = cam;
    const rig = { x: 84, y: 50, dist: 120, tx: 84, ty: 50, tdist: 120, trauma: 0, manual: 0, snapNext: true, minDist: 45, maxDist: 190 };
    let t = 0;

    rig.focus = function (x, y, dist, snap) { rig.tx = x; rig.ty = y; if (dist) rig.tdist = dist; if (snap) rig.snapNext = true; };
    rig.shake = function (amount) { rig.trauma = Math.min(1, rig.trauma + amount); };
    rig.pan = function (dx, dy) { rig.tx += dx; rig.ty += dy; rig.manual = 2.5; };
    rig.zoom = function (f) { rig.tdist = PM.clamp(rig.tdist * f, rig.minDist, rig.maxDist); rig.manual = Math.max(rig.manual, 1.2); };
    // World units covered by the view at the play plane, for clamping to the map.
    rig.span = function (dist) { const h = 2 * dist * Math.tan(FOV * Math.PI / 360); return { w: h * cam.aspect, h }; };

    rig.update = function (dt) {
      t += dt; rig.manual = Math.max(0, rig.manual - dt);
      const map = G.map;
      if (map) {
        const s = rig.span(rig.tdist);
        const mx = Math.max(0, s.w / 2 - 22), my = s.h / 2;
        rig.tx = s.w >= map.w + 44 ? map.w / 2 : PM.clamp(rig.tx, mx, map.w - mx);
        rig.ty = PM.clamp(rig.ty, map.seaY - 6 + my * 0.75, map.h + 14 - my * 0.4);
      }
      const k = rig.snapNext ? 1 : 1 - Math.exp(-dt * 4.2);
      rig.snapNext = false;
      rig.x += (rig.tx - rig.x) * k; rig.y += (rig.ty - rig.y) * k; rig.dist += (rig.tdist - rig.dist) * k;
      rig.trauma = Math.max(0, rig.trauma - dt * 1.5);
      const sh = rig.trauma * rig.trauma * rig.dist * 0.012;
      const sx = sh * (Math.sin(t * 61) + Math.sin(t * 37.3)) * 0.5, sy = sh * (Math.sin(t * 53.1 + 1) + Math.sin(t * 29.7)) * 0.5;
      cam.position.set(rig.x + sx, rig.y + sy + Math.sin(PITCH) * rig.dist, Math.cos(PITCH) * rig.dist);
      cam.lookAt(rig.x + sx, rig.y + sy, 0);
      cam.rotateZ(sh * 0.004 * Math.sin(t * 43));
      cam.updateMatrixWorld();
    };
    rig.toScreen = function (x, y, z) {
      const v = new THREE.Vector3(x, y, z || 0).project(cam);
      return { x: (v.x * 0.5 + 0.5) * G.canvas.clientWidth, y: (0.5 - v.y * 0.5) * G.canvas.clientHeight, on: v.z < 1 };
    };
    return rig;
  };
})();
