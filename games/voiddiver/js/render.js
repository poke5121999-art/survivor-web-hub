// Scene three.js, camera gốc, đèn, rung. Số camera đo từ prefab CameraManager (ARCH.md, ASSETS.md §3).
(function (VD) {
  'use strict';
  const THREE = window.THREE;

  // PlayerVCamTemplate: FollowOffset (25, 21, −25) Unity = (25, 21, 25) three; FOV dọc 10°; damping 1 s mỗi trục.
  const CAM_OFFSET = new THREE.Vector3(25, 21, 25);
  const CAM_FOV = 10, CAM_DAMP = 1.0;
  // Số đèn điểm cố định: đổi số đèn làm three biên dịch lại mọi shader, nên giữ một pool và dời đèn gần nhất vào.
  const POINT_POOL = 8;

  const R = {
    renderer: null, scene: null, camera: null,
    target: new THREE.Vector3(), camPos: new THREE.Vector3(),
    ambient: null, sun: null, points: [], lightSources: [],
    shakeAmp: 0, shakeT: 0, shakeFreq: 5,
    fov: CAM_FOV, offset: CAM_OFFSET.clone(),
  };

  R.init = function (canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x000000, 1);
    R.renderer = renderer;
    R.scene = new THREE.Scene();
    R.camera = new THREE.PerspectiveCamera(CAM_FOV, 16 / 9, 0.1, 500);
    // Theme Town: DirectionalLight (0.3, 0.3, 0.5) × 0.3, xoay (45°, 45°). Ambient ≈ màu bóng nền của shader BG.
    R.ambient = new THREE.AmbientLight(new THREE.Color(0.5, 0.5, 0.6), 0.55);
    R.sun = new THREE.DirectionalLight(new THREE.Color(0.3, 0.3, 0.5), 0.3 * 3);
    R.sun.position.set(-1, 1.414, 1).multiplyScalar(20);
    R.scene.add(R.ambient, R.sun, R.sun.target);
    for (let i = 0; i < POINT_POOL; i++) {
      const p = new THREE.PointLight(0xffffff, 0, 5, 2);
      R.points.push(p); R.scene.add(p);
    }
    R.resize();
    addEventListener('resize', R.resize);
  };

  R.resize = function () {
    const c = R.renderer.domElement, w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight;
    R.renderer.setSize(w, h, false);
    R.camera.aspect = w / h;
    R.camera.updateProjectionMatrix();
  };

  R.setView = function ({ fov, offset }) {
    if (fov) { R.fov = fov; R.camera.fov = fov; R.camera.updateProjectionMatrix(); }
    if (offset) R.offset.copy(offset);
  };

  // Nguồn sáng tĩnh của map: {pos:[x,y,z], color:[r,g,b], intensity, range}. Mỗi khung chọn POINT_POOL cái gần mục tiêu nhất.
  R.setLightSources = function (list) { R.lightSources = list; };

  R.snap = function (pos) {
    R.target.set(pos.x, 0, pos.z);
    R.camPos.copy(R.target).add(R.offset);
  };

  R.follow = function (pos, dt) {
    R.target.set(pos.x, 0, pos.z);
    const want = R.target.clone().add(R.offset);
    // Cinemachine Damper.Damp: sau đúng CAM_DAMP giây còn 1% quãng (hệ số ln 100 = 4.605).
    const k = 1 - Math.exp(-4.605 * dt / CAM_DAMP);
    R.camPos.lerp(want, k);
  };

  R.shake = function (amp, dur) {
    if (amp > R.shakeAmp) R.shakeAmp = amp;
    R.shakeT = Math.max(R.shakeT, dur || 0.2);
  };

  const tmp = new THREE.Vector3();
  R.draw = function (dt, time) {
    const cam = R.camera;
    cam.position.copy(R.camPos);
    if (R.shakeT > 0) {
      R.shakeT -= dt;
      const a = R.shakeAmp * Math.max(0, Math.min(1, R.shakeT * 5));
      const f = R.shakeFreq * 6.283;
      cam.position.x += Math.sin(time * f * 1.3) * a;
      cam.position.y += Math.sin(time * f * 1.7 + 1.1) * a;
      cam.position.z += Math.sin(time * f * 1.1 + 2.3) * a;
      if (R.shakeT <= 0) R.shakeAmp = 0;
    }
    tmp.copy(cam.position).sub(R.offset);
    cam.lookAt(tmp);
    if (R.lightSources.length) {
      const t = R.target;
      const near = R.lightSources
        .map(l => ({ l, d: (l.pos[0] - t.x) ** 2 + (l.pos[2] - t.z) ** 2 }))
        .sort((a, b) => a.d - b.d);
      for (let i = 0; i < R.points.length; i++) {
        const p = R.points[i], s = near[i] && near[i].l;
        if (!s || near[i].d > 30 * 30) { p.intensity = 0; continue; }
        p.position.set(s.pos[0], s.pos[1], s.pos[2]);
        p.color.setRGB(s.color[0], s.color[1], s.color[2]);
        p.distance = s.range; p.intensity = s.intensity * 2.2;
      }
    }
    if (VD.postfx && VD.postfx.enabled) VD.postfx.render(R.scene, cam, time); else R.renderer.render(R.scene, cam);
  };

  // Tầm nhìn nón của nhân vật ("PlaneSight" gốc): Character.SightAngle 120°, SightRange 5 m, SightBackRange 1 m;
  // hết pin còn Const.BlindSightRange 1 m. Vá vào mọi material môi trường: ngoài nón tối và ngả lạnh.
  R.sight = {
    uSightPos: { value: new THREE.Vector2(0, 0) },
    uSightDir: { value: new THREE.Vector2(1, 0) },
    uSightCos: { value: Math.cos(Math.PI / 3) },
    uSightRange: { value: 5 },
    uSightBack: { value: 1 },
    uSightDark: { value: new THREE.Color(0.16, 0.17, 0.24) },  // không có trong bảng: chỉnh bằng mắt theo ảnh Steam
    uSightOn: { value: 1 },
  };
  R.setSight = function (x, z, face, angleDeg, range, back) {
    const s = R.sight;
    s.uSightPos.value.set(x, z);
    s.uSightDir.value.set(Math.cos(face), Math.sin(face));
    s.uSightCos.value = Math.cos((angleDeg / 2) * Math.PI / 180);
    s.uSightRange.value = range; s.uSightBack.value = back;
  };
  // Khoét mái: mã nhóm trong kênh A của COLOR_0 (world.js updateCutoff). Không có attribute thì WebGL cho (0,0,0,1) → mã 255.
  R.cut = { uCut: { value: new THREE.Vector4(-1, -1, -1, -1) }, uCutY: { value: 0.9 } };
  R.patchSight = function (mat) {
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, R.sight, R.cut);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSightW;\nvarying float vCutId;\nattribute vec4 color;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSightW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvCutId = floor(color.a * 255.0 + 0.5);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vSightW; varying float vCutId; uniform vec4 uCut; uniform float uCutY;
uniform vec2 uSightPos, uSightDir; uniform float uSightCos, uSightRange, uSightBack, uSightOn; uniform vec3 uSightDark;
float sightAt(vec2 p) {
  vec2 d = p - uSightPos; float l = length(d);
  float back = 1.0 - smoothstep(uSightBack * 0.7, uSightBack, l);
  float c = dot(d / max(l, 1e-4), uSightDir);
  float cone = smoothstep(uSightCos - 0.06, uSightCos + 0.02, c) * (1.0 - smoothstep(uSightRange * 0.8, uSightRange * 1.05, l));
  return max(back, cone);
}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (vSightW.y > uCutY && (abs(vCutId - uCut.x) < 0.5 || abs(vCutId - uCut.y) < 0.5 || abs(vCutId - uCut.z) < 0.5 || abs(vCutId - uCut.w) < 0.5)) discard;`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
if (uSightOn > 0.5) { float s = sightAt(vSightW.xz); float fall = 1.0 - clamp(length(vSightW.xz - uSightPos) / uSightRange, 0.0, 1.0); gl_FragColor.rgb = mix(gl_FragColor.rgb * uSightDark * 3.6, gl_FragColor.rgb * vec3(1.0, 0.98, 0.93) * (1.55 + 1.5 * fall * fall), s); }`);
    };
    mat.customProgramCacheKey = () => 'sight';
    return mat;
  };

  // Chiếu toạ độ chuột (px trong canvas) xuống mặt đất y = h.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  R.screenToGround = function (mx, my, h) {
    const c = R.renderer.domElement;
    ndc.set((mx / c.clientWidth) * 2 - 1, -(my / c.clientHeight) * 2 + 1);
    ray.setFromCamera(ndc, R.camera);
    plane.constant = -(h || 0);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
  };

  // Hướng "lên" của màn hình trên mặt đất: camera yaw 315° nên W đi về phía (−1, 0, −1)/√2 trong toạ độ three.
  R.screenAxes = function () {
    const f = new THREE.Vector3(); R.camera.getWorldDirection(f); f.y = 0; f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    return { fwd: f, right: r };
  };

  VD.render = R;
})(window.VD = window.VD || {});
