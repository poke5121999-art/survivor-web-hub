// Sân khấu bục nhận giải "CHAMPION" sau trận. Hình từ Scenes/StateScene/Podium.unity của bản gốc (tools/export_podium.py ->
// art/podium/podium.glb + meta.json: vị trí Rank1..3 / Pos4.., Car1 và ba camera path Single_1..3).
// - Vật liệu gốc là shader riêng (Basic_SepcularCubeNormal, UV_Offset_Mask_Additive); web vẽ MeshBasic: opaque (ảnh đã nướng sáng),
//   blend, add (cộng sáng) theo extras.kind, UV cuộn theo extras.scroll.
// - Sáu tay đua đứng theo hạng, xe người thắng đỗ ở Car1 (không tay đua). Tay đua dựng từ cùng glb tay đua của trận.
// - Tia laser xanh chạy ngang sân khấu là tự dựng (APK không có mesh laser trong scene này; clip gốc vẽ bằng hạt/quang).
(function (TD) {
  'use strict';
  const THREE = window.THREE;
  const P = { ready: false, loading: null, scene: null, root: null, cam: null, t: 0, actors: [], scroll: [], lasers: [], kartView: null, active: false };
  const REV = () => '?v=' + (TD.REV || '');
  const bufs = {};
  const fetchBuf = (u) => bufs[u] || (bufs[u] = fetch(u + REV()).then((r) => { if (!r.ok) throw new Error(u + ' http ' + r.status); return r.arrayBuffer(); }));
  const parse = (u) => fetchBuf(u).then((b) => new Promise((ok, no) => {
    const l = new THREE.GLTFLoader(); l.setMeshoptDecoder(window.MeshoptDecoder); l.parse(b.slice(0), '', ok, no);
  }));
  // Xếp hạng → chỗ đứng. Bản gốc chỉ có 3 bục + chỗ đứng sàn Pos4..8.
  const SLOT = ['Rank1', 'Rank2', 'Rank3', 'Pos4', 'Pos5', 'Pos6', 'Pos7', 'Pos8'];

  function buildMaterial(src, ex) {
    const map = src.map || null;
    if (map) { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4; }
    const tint = new THREE.Color(ex.tint[0], ex.tint[1], ex.tint[2]);
    if (ex.kind === 'opaque') {
      const m = new THREE.MeshBasicMaterial({ map, color: tint, side: ex.double ? THREE.DoubleSide : THREE.FrontSide });
      // Shader gốc cộng phản xạ cubemap xanh và ánh sáng nền (0,38 0,39 0,51) lên ảnh nướng; MeshBasic thiếu phần đó nên tường đen.
      // Hệ số đo từ khung clip 471 (ô caro (25,53,101) và (58,95,137), nền (0,31,72)), trong không gian tuyến tính.
      m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = diffuseColor.rgb * vec3(0.9, 1.4, 2.0) + vec3(0.0, 0.012, 0.06);'); };
      return m;
    }
    const m = new THREE.MeshBasicMaterial({ map, color: tint.multiplyScalar(ex.kind === 'add' ? Math.min(1.5, ex.bright * 0.5) : 1), transparent: true,
      depthWrite: false, side: THREE.DoubleSide, vertexColors: !!src.vertexColors,
      blending: ex.kind === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending });
    return m;
  }

  P.load = function () {
    if (P.loading) return P.loading;
    P.loading = Promise.all([fetch('art/podium/meta.json' + REV()).then((r) => r.json()), parse('art/podium/podium.glb')]).then(([meta, g]) => {
      P.meta = meta;
      const sc = P.scene = new THREE.Scene();
      sc.background = new THREE.Color(0x050a1c);
      sc.environment = TD.main && TD.main.env;   // xe cần ánh phản xạ như trong trận, thiếu thì kính xe loé trắng dưới bloom
      const root = P.root = new THREE.Group();
      sc.add(root);
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        const ex = o.material.userData || {};  // GLTFLoader r140 chép extras thẳng vào userData
        const e = Object.assign({ kind: 'opaque', tint: [1, 1, 1], bright: 1, scroll: [0, 0] }, ex);
        const m = buildMaterial(o.material, e);
        o.material = m; o.frustumCulled = false;
        // Thứ tự vẽ: nền → bục → hiệu ứng cộng sáng (không ghi sâu).
        o.renderOrder = e.kind === 'opaque' ? 0 : (e.kind === 'blend' ? 2 : 3);
        if (e.shader && /Sky_Diffuse/.test(e.shader)) o.renderOrder = -10;
        if ((e.scroll[0] || e.scroll[1]) && m.map) P.scroll.push({ map: m.map, sx: e.scroll[0], sy: e.scroll[1] });
      });
      root.add(g.scene);
      sc.add(new THREE.HemisphereLight(0x9fb4ff, 0x20243c, 0.6));
      const key = new THREE.DirectionalLight(0xdfe8ff, 1.3); key.position.set(-3, 9, -14); key.target.position.set(0, 1.5, -4.4); sc.add(key, key.target);
      const rim = new THREE.DirectionalLight(0x6fa8ff, 0.8); rim.position.set(4, 5, 8); sc.add(rim);
      // Laser xanh lá toả từ sàn sau bục lên hai bên; mỗi tia là một thanh mảnh cộng sáng, lắc chậm.
      const lm = new THREE.MeshBasicMaterial({ color: 0x1fd04a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      const geo = new THREE.CylinderGeometry(0.02, 0.02, 1, 4, 1, true); geo.translate(0, 0.5, 0);
      for (let i = 0; i < 8; i++) {
        const l = new THREE.Mesh(geo, lm);
        const side = i % 2 ? 1 : -1, k = i >> 1;
        l.userData = { base: new THREE.Vector3(side * (3.0 + k * 1.3), 0.7, 3.0), a: i * 1.3, side, k };
        l.scale.y = 28; l.renderOrder = 4; l.frustumCulled = false;
        sc.add(l); P.lasers.push(l);
      }
      P.cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
      P.ready = true;
    });
    return P.loading;
  };

  // Tay đua đứng: cùng glb tay đua của trận (không gắn vào xe) + clip ranking_0N của bản gốc (art/podium/rank_<id>.glb, cùng bộ xương).
  function stand(driverId, place, slot, yaw) {
    const id = TD.DRIVERS[driverId] ? driverId : Object.keys(TD.DRIVERS)[0];
    const drv = TD.DRIVERS[id];
    const a = { group: new THREE.Group(), mixer: null, ready: false };
    a.group.position.set(slot[0], slot[1], slot[2]);
    a.group.rotation.y = yaw;
    P.scene.add(a.group);
    a.loading = Promise.all([parse(drv.glb), parse('art/podium/rank_' + id + '.glb')]).then(([g, r]) => {
      g.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      a.group.add(g.scene);
      a.mixer = new THREE.AnimationMixer(g.scene);
      const want = 'ranking_0' + Math.min(6, place);
      const clip = r.animations.find((c) => c.name === want) || r.animations[0];
      if (clip) a.mixer.clipAction(clip).setLoop(THREE.LoopRepeat).play();
      a.ready = true;
    });
    return a;
  }

  // R.karts đã có place; tối đa 8 chỗ. Trả về Promise khi mọi mô hình đã nạp.
  P.enter = function (R, me) {
    P.leave();
    P.t = 0; P.active = true;
    const pos = P.meta.pos;
    const list = R.karts.slice().sort((a, b) => (a.place || 99) - (b.place || 99)).slice(0, SLOT.length);
    list.forEach((k, i) => {
      const s = pos[SLOT[i]];
      // Camera ở z âm nhìn về +z, tay đua quay mặt về −z; glb tay đua đã nhìn về −z nên giữ yaw 0.
      const a = stand(k.driverId, i + 1, s, 0);
      a.kart = k;
      P.actors.push(a);
    });
    const w = list[0];
    const dk = TD.Kart.create({ id: 0, carId: w.carId, driverId: '', name: '', ctrl: 'human' });
    dk.st = 'grid';
    const c = pos.Car1;
    dk.x = c[0]; dk.y = c[1]; dk.z = c[2]; dk.yaw = Math.PI * 0.82;
    P.kartView = TD.kartView.create(P.scene, dk);
    P.kartView.shadow.material.opacity = 0.5;
    P.carKart = dk;
    const loads = P.actors.map((a) => a.loading).concat([P.kartView.loading]);
    return Promise.all(loads).then(() => {
      // Ánh phản xạ của trận quá sáng so với sân khấu tối: hạ cường độ env của tay đua và xe.
      const dim = (o) => o.traverse((m) => { if (m.isMesh && m.material && 'envMapIntensity' in m.material) m.material.envMapIntensity = 0.3; });
      for (const a of P.actors) dim(a.group);
      dim(P.kartView.root);
    });
  };

  P.leave = function () {
    for (const a of P.actors) { if (a.group.parent) a.group.parent.remove(a.group); if (a.mixer) a.mixer.stopAllAction(); }
    P.actors.length = 0;
    if (P.kartView) {
      if (P.kartView.root.parent) P.kartView.root.parent.remove(P.kartView.root);
      const i = TD.kartView.list.indexOf(P.kartView); if (i >= 0) TD.kartView.list.splice(i, 1);
      P.kartView = null;
    }
    P.active = false;
  };

  const ease = { lin: (x) => x, out: (x) => 1 - (1 - x) * (1 - x) };
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  // Camera: ba shot Single_1..3 nối tiếp, shot cuối giữ ở khoá cuối.
  function placeCamera() {
    const names = ['CameraPathSingle_1', 'CameraPathSingle_2', 'CameraPathSingle_3'];
    let t = P.t, shot = null;
    for (const n of names) { const s = P.meta.shots[n]; if (!s) continue; if (t <= s.dur) { shot = s; break; } t -= s.dur; shot = s; if (n === names[2]) t = s.dur; }
    const s = shot, u = ease[s.ease](Math.min(1, Math.max(0, t / s.dur)));
    const a = s.keys[0], b = s.keys[1];
    v1.fromArray(a.p).lerp(v2.fromArray(b.p), u);
    P.cam.position.copy(v1);
    v3.fromArray(a.fwd).lerp(v2.fromArray(b.fwd), u).normalize();
    P.cam.up.fromArray(a.up).lerp(v2.fromArray(b.up), u).normalize();
    P.cam.lookAt(v1.clone().add(v3));
    const fov = a.fov + (b.fov - a.fov) * u;
    if (Math.abs(P.cam.fov - fov) > 0.01 || P.cam.aspect !== innerWidth / innerHeight) { P.cam.fov = fov; P.cam.aspect = innerWidth / innerHeight; P.cam.updateProjectionMatrix(); }
  }
  P.camTotal = function () { const s = P.meta.shots; return ['CameraPathSingle_1', 'CameraPathSingle_2', 'CameraPathSingle_3'].reduce((x, n) => x + (s[n] ? s[n].dur : 0), 0); };

  P.update = function (dt) {
    if (!P.ready || !P.active) return;
    P.t += dt;
    placeCamera();
    for (const s of P.scroll) { s.map.offset.x = (s.map.offset.x + s.sx * dt * 0.1) % 1; s.map.offset.y = (s.map.offset.y + s.sy * dt * 0.1) % 1; }
    for (const l of P.lasers) {
      const d = l.userData, a = d.a + P.t * (0.5 + d.k * 0.15);
      l.position.copy(d.base);
      v1.set(d.side * (0.75 + 0.2 * Math.sin(a)), 0.55 + 0.15 * Math.cos(a * 1.3), -0.3 + 0.25 * Math.sin(a * 0.7)).normalize();
      l.quaternion.setFromUnitVectors(v2.set(0, 1, 0), v1);
    }
    for (const a of P.actors) if (a.mixer) a.mixer.update(dt);
    if (P.kartView) TD.kartView.update(P.kartView, dt);
  };

  P.render = function () {
    if (!P.ready) return;
    const pf = TD.postfx.params;
    pf.radial = 0; pf.flash = 0;
    TD.postfx.render(P.scene, P.cam);
  };

  TD.podium = P;
})(globalThis.TD = globalThis.TD || {});
