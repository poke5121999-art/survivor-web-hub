/*
 * Thuyền ma (sự kiện GhostBoat_Player1/2/3/Pirate) và FogGhost tĩnh (sự kiện FogGhost) — đơn vị U4 của MONSTERS.md §2.4, §2.5.
 * Dữ liệu: data/ghosts.js + art/vfx/ghosts/meshes.bin (tools/ghosts.py). Lịch bốc thăm: js/events.js (DREvents).
 *
 * GhostBoatWorldEvent.cs (prefab GhostBoat_*):
 *   Awake: NavMesh.SamplePosition(vị trí sinh, 5 m, mặt nạ 1) rồi tia xuống layer cấm (7, 15, 24, 25: đất) — không có thì huỷ sinh (OnEventSpawnAborted).
 *   Activate: animator FogGhost_FadeIn (Opacity 0 → 1 trong 2 s, tiếp tuyến 0 = smoothstep), chọn đích, hẹn FoghornEnd sau Random(foghornMin, foghornMax) s.
 *     Tiếng còi `foghorn-loop-far` phát từ lúc sinh (PlayOnAwake, vòng lặp), FoghornEnd dừng nó và PlayOneShot `foghorn-end-far`.
 *   PickDestination: RandomNavMeshLocation(maxTravelDistance 100) = onUnitSphere·100 + vị trí, SamplePosition bán kính 100; lặp tới khi cách ≥ 50 m.
 *     NavMeshAgent tốc độ 3,5 m/s, tăng tốc 8, quay 120°/s, tự phanh. transform.rotation = LookRotation(destination) chỉ là hướng khởi đầu: LookRotation nhận
 *     TOẠ ĐỘ đích (không phải hiệu với vị trí) nên hướng ban đầu là hướng từ gốc thế giới tới đích; agent quay dần về hướng chạy.
 *   Update: kết thúc khi Time.time > spawnTime + durationSec (20 s, Pirate 30 s) HOẶC cách đích < 10 m HOẶC cách người chơi < 25 m.
 *   RequestEventFinish: animator FogGhost_FadeOut (1 → 0, 2 s, bắt đầu từ 1 dù lúc ấy mới mờ một nửa: đúng như clip), FoghornEnd nếu còn hẹn,
 *     sau finishDelaySec 2 s thì EventFinished + huỷ. Agent không dừng khi đang mờ dần. KHÔNG có collider: vô hại.
 *
 * FogGhost.cs (15 vật tĩnh của scene, 7 ở The Marrows):
 *   Start: đăng ký FOG_GHOST rồi SetActive(false). Activate: bật, hasBeenSeen = fadingOut = false, animator FogGhost_FadeIn, RequestEventFinish
 *   → EventFinished NGAY (bộ lập lịch rảnh trở lại). Update: chưa thấy mà renderer.isVisible và cách người chơi < seenMaxDistanceThreshold thì hasBeenSeen;
 *   nếu manuallyFadeOutIfCloserThanSeenDistance thì mờ dần luôn. Đã thấy mà ra khỏi khung hình thì FogGhost_FadeOut rồi tắt.
 *   isVisible = hộp bao nằm trong chóp nhìn của camera (web: cầu bao của mesh trong Frustum của DRCamera.cam).
 *
 * Vật liệu GhostBoat_Mat = Shader Graphs/FogGhost_Shader (blend SrcAlpha/OneMinusSrcAlpha, ZWrite tắt, ZTest LEqual, cull sau, hàng đợi 3000).
 * Dựng lại từ DXBC fragment (cache angler/shaders/FogGhost_Shader.txt, cùng biến thể không keyword):
 *   màu = pow(sương, 10)·(màu sương − tex·màuĐỉnh) + 2·tex·màuĐỉnh      (sương = công thức Lit_Shader của js/sky.js, không có vòng đèn xua sương)
 *   alpha = Opacity · đêm · sat(d·0,04 − 0,9) · alphaĐỉnh · pow(max(1 − |đèn phụ|, 0), 100)
 *   đêm = 1 − sat(((dir.y + 1)·0,5 − 0,263218)·41,425377) ; d = khoảng cách tới camera: chỉ hiện từ 22,5 m, đủ độ mờ ở 47,5 m; đèn thuyền xoá bóng ma.
 *   [ĐỀ XUẤT] tex nhân màu đỉnh thật sự là t1 (Emission) × v4; hai texture "nonModifiable" của shader (t0 = mặt nạ sương toàn cục) đã nằm trong
 *   drEnvMaskB của js/sky.js. Quy ước hướng sáng (dir.y) lấy theo uDrSunDir của sky.js như phần sương màu (cùng cb0[5]).
 *
 *   DRGhosts.debug → { boats(), statics(), activate(tênVậtTĩnh), force(sựKiện), stats() }
 */
(function (root) {
  'use strict';
  const T = root.THREE, G = root.DR_GHOSTS, EV = root.DR_WORLDEVENTS;
  if (!T || !G || !G.meshes || !G.boats || !EV) { root.DRGhosts = null; return; }
  const VER = (function () { try { const m = /[?&]v=([^&]+)/.exec(document.currentScript.src); return m ? m[1] : ''; } catch (e) { return ''; } })();
  const Dr = () => root.DR, S = () => root.DR.s;
  const RENDER_ORDER = 3;                              // sau nước (1) và bọt (2): hàng đợi 3000 của shader gốc

  // ---------------------------------------------------------------- đường cong Hermite 2 khoá (AnimationCurve của FadeIn/FadeOut)
  function curve(c, t) {
    const k = c.keys, a = k[0], b = k[k.length - 1];
    if (t <= a[0]) return a[1];
    if (t >= b[0]) return b[1];
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) {
      const p = k[i - 1], q = k[i], d = q[0] - p[0], u = (t - p[0]) / d, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * p[1] + (u3 - 2 * u2 + u) * p[3] * d + (-2 * u3 + 3 * u2) * q[1] + (u3 - u2) * q[2] * d;
    }
    return b[1];
  }
  const FADE_IN = t => curve(G.fade.in, t), FADE_OUT = t => curve(G.fade.out, t);

  // ---------------------------------------------------------------- nạp mesh (art/vfx/ghosts/meshes.bin) và texture
  let binP = null, bin = null, tex = null;
  const geos = {};
  function ensure() {
    if (binP) return binP;
    const q = VER ? '?v=' + VER : '';
    binP = fetch(G.meshFile + q).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + G.meshFile); return r.arrayBuffer(); })
      .then(b => { bin = b; return b; })
      .catch(e => { console.error('[ghosts] mesh load failed:', e && e.message || e); binP = null; return null; });
    return binP;
  }
  function geometry(name) {
    if (geos[name]) return geos[name];
    const m = G.meshes[name];
    if (!m || !bin) return null;
    let o = m.off;
    const n = m.n, qp = new Int16Array(bin, o, n * 3); o += n * 6;
    const qu = new Int16Array(bin, o, n * 2); o += n * 4;
    let qc = null;
    if (m.col) { qc = new Uint8Array(bin, o, n * 4); o += n * 4; }
    const idx = new Uint16Array(bin, o, m.tri * 3);
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) pos[i * 3 + c] = m.bb[c] + qp[i * 3 + c] / 32767 * m.bb[3 + c];
      for (let c = 0; c < 2; c++) uv[i * 2 + c] = m.uvb[c] + qu[i * 2 + c] / 32767 * m.uvb[2 + c];
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    if (qc) { const col = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) col[i] = qc[i] / 255; g.setAttribute('color', new T.BufferAttribute(col, 4)); }
    g.setIndex(new T.BufferAttribute(Uint16Array.from(idx), 1));
    g.computeBoundingSphere();
    geos[name] = g;
    return g;
  }
  function texture() {
    if (tex) return tex;
    tex = new T.TextureLoader().load(G.tex + (VER ? '?v=' + VER : ''));
    tex.flipY = false;                                  // uv đã lật v như glTF (tools/world.py Meshes.get)
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.encoding = T.sRGBEncoding;
    return tex;
  }

  // ---------------------------------------------------------------- vật liệu FogGhost_Shader
  const DX = G.shader.dxbc;
  function material(hasColor) {
    const m = new T.MeshBasicMaterial({ map: texture(), transparent: true, depthWrite: false, vertexColors: !!hasColor, fog: true });
    const uOp = { value: 0 };
    m.userData.uOp = uOp;
    m.onBeforeCompile = sh => {
      sh.uniforms.uGhostOp = uOp;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGhostOp;')
        .replace('#include <output_fragment>', `
  vec3 wpG = vDrFogW;
  vec3 lightG = drEnvLights(wpG);
  float fogG = drEnvFogAmount(wpG, vec3(0.0), drEnvMaskB(wpG.xz));
  vec3 fogCG = drS2L(drEnvFogColor(wpG));
  vec3 emG = diffuseColor.rgb;
  vec3 colG = pow(fogG, ${DX.fogPow.toFixed(1)}) * (fogCG - emG) + ${DX.emitK.toFixed(1)} * emG;
  float nightG = 1.0 - clamp(((uDrSunDir.y + 1.0) * 0.5 - ${DX.nightA}) * ${DX.nightK}, 0.0, 1.0);
  float alphaG = uGhostOp * nightG * clamp(distance(wpG, cameraPosition) * ${DX.distK} + ${DX.distOffset}, 0.0, 1.0)
    * diffuseColor.a * pow(max(1.0 - length(lightG), 0.0), ${DX.lightPow.toFixed(1)});
  gl_FragColor = vec4(colG, alphaG);`)
        .replace('#include <fog_fragment>', '');          // sương đã nằm trong màu: không trộn sương chuẩn lần nữa
    };
    m.customProgramCacheKey = () => 'drGhost';
    return m;
  }

  // ---------------------------------------------------------------- dựng một bóng ma trong scene
  let scene = null;
  function getScene() {
    if (scene && scene.parent === null) return scene;
    let o = root.DRBoat && root.DRBoat.bob;
    while (o && o.parent) o = o.parent;
    scene = o && o.isScene ? o : (root.DR_DEBUG && root.DR_DEBUG.scene) || null;
    return scene;
  }
  // Mesh chưa nạp xong thì giữ chỗ (Group) và gắn mesh khi có; trả { node, setOp(v), mesh() , dispose() }
  function makeGhost(meshName, place) {
    const node = new T.Group();
    node.name = 'Ghost:' + meshName;
    const gh = { node, mesh: null, mat: null, op: 0, disposed: false };
    place(node);
    gh.setOp = v => { gh.op = v; if (gh.mat) gh.mat.userData.uOp.value = v; };
    const build = () => {
      if (gh.disposed || gh.mesh) return;
      const g = geometry(meshName);
      if (!g) return;
      gh.mat = material(!!G.meshes[meshName].col);
      gh.mat.userData.uOp.value = gh.op;
      gh.mesh = new T.Mesh(g, gh.mat);
      gh.mesh.renderOrder = RENDER_ORDER;
      gh.mesh.frustumCulled = false;                     // isVisible tự kiểm bằng Frustum; vẽ luôn để không nhấp nháy ở mép
      node.add(gh.mesh);
    };
    if (bin) build(); else ensure().then(build);
    gh.dispose = () => {
      gh.disposed = true;
      if (node.parent) node.parent.remove(node);
      if (gh.mat) gh.mat.dispose();
    };
    return gh;
  }

  // ---------------------------------------------------------------- thuyền ma
  const boats = [];                                      // các thuyền đang sống
  const fw = yaw => [-Math.sin(yaw), -Math.cos(yaw)];
  function voiceBase(key, want) { const d = root.DR_AUDIO && root.DR_AUDIO[key]; return want / ((d && d.vol) || 1); }   // âm lượng thực = âm lượng AudioSource của prefab
  function spawnBoat(name, e, ctx) {
    const B = G.boats[name], N = root.DRNav, sc = getScene();
    if (!B || !N || !sc) return null;
    const sp = N.sample({ x: ctx.x, z: ctx.z }, 5, 'generic');   // Awake: NavMesh.SamplePosition(…, 5 m, 1)
    if (!sp) return null;                                          // không có lưới đi được / đất ở dưới: huỷ sinh, xoá lịch sử
    const st = {
      name, B, x: sp.x, z: sp.z, yaw: 0, v: 0, age: 0, dur: e.durationSec, dest: null, path: null, pi: 1,
      tIn: 0, tOut: 0, finishing: false, reason: null, done: false, hornT: 0, horn: null, hornEnded: false,
      gh: null
    };
    st.gh = makeGhost(B.mesh, n => {
      n.scale.fromArray(B.modelScale); n.position.set(st.x, 0, st.z);
      sc.add(n);
    });
    st.gh.setOp(0);
    pickDestination(st);
    st.yaw = st.dest ? Math.atan2(-st.dest.x, -st.dest.z) : ctx.yaw;   // LookRotation(destination): hướng từ gốc thế giới tới đích (xem đầu tệp)
    st.gh.node.rotation.y = st.yaw;
    st.hornT = B.foghornMin + Math.random() * (B.foghornMax - B.foghornMin);
    if (root.DRAudio) st.horn = root.DRAudio.voice('boat.horn.far.loop', { loop: true, vol: voiceBase('boat.horn.far.loop', B.horn.vol), rate: B.horn.pitch,
      pos: { x: st.x, y: 0, z: st.z }, min: B.horn.min, max: B.horn.max });
    const handle = {
      get done() { return st.done; },
      update: dt => tickBoat(st, dt),
      requestFinish: () => { st.reason = st.reason || 'external'; finishBoat(st); },
      dispose: () => { disposeBoat(st); }
    };
    st.handle = handle;
    boats.push(st);
    return handle;
  }
  function randomNavLocation(st, r) {                    // onUnitSphere·r + vị trí; SamplePosition(…, r) tính khoảng cách 3D tới lưới ở y = 0
    let x, y, z, n;
    do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; n = x * x + y * y + z * z; } while (n > 1 || n < 1e-4);
    n = Math.sqrt(n);
    const dy = y / n * r, rr = Math.sqrt(Math.max(0, r * r - dy * dy));
    return root.DRNav.sample({ x: st.x + x / n * r, z: st.z + z / n * r }, rr, 'generic');
  }
  function pickDestination(st) {
    let best = null, bd = 0;
    for (let i = 0; i < 10; i++) {                        // bản gốc lặp tới khi ≥ maxTravelDistance·0,5; chặn 10 lần cho khỏi treo khi lưới hẹp
      const p = randomNavLocation(st, st.B.maxTravelDistance);
      const d = p ? Math.hypot(p.x - st.x, p.z - st.z) : 0;
      if (d > bd) { best = p; bd = d; }
      if (d >= st.B.maxTravelDistance * 0.5) break;
    }
    st.dest = best;
    st.path = best ? root.DRNav.path({ x: st.x, z: st.z }, best, 'generic') : null;
    st.pi = 1;
  }
  function foghornEnd(st) {
    if (st.hornEnded) return;
    st.hornEnded = true;
    if (st.horn) st.horn.stop(0.05);
    if (root.DRAudio) root.DRAudio.play('boat.horn.far.end', voiceBase('boat.horn.far.end', st.B.horn.vol), st.B.horn.pitch,
      { pos: { x: st.x, y: 0, z: st.z }, min: st.B.horn.min, max: st.B.horn.max });
  }
  function finishBoat(st) {
    if (st.finishing || st.done) return;
    st.finishing = true; st.tOut = 0;
    foghornEnd(st);                                       // RequestEventFinish: nếu còn hẹn còi thì phát tiếng kết ngay
  }
  function disposeBoat(st) {
    if (st.horn) st.horn.stop(0.1);
    st.gh.dispose();
    st.done = true;
    const i = boats.indexOf(st);
    if (i >= 0) boats.splice(i, 1);
  }
  function moveBoat(st, dt) {
    const A = st.B.agent;
    let rem = 0, tx = st.x, tz = st.z;
    if (st.path && st.pi < st.path.length) {
      rem = Math.hypot(st.path[st.pi].x - st.x, st.path[st.pi].z - st.z);
      for (let i = st.pi; i < st.path.length - 1; i++) rem += Math.hypot(st.path[i + 1].x - st.path[i].x, st.path[i + 1].z - st.path[i].z);
      tx = st.path[st.pi].x; tz = st.path[st.pi].z;
    }
    const vmax = Math.min(A.speed, Math.sqrt(2 * A.accel * rem));        // autoBraking, stoppingDistance 0
    st.v += Math.max(-A.accel * dt, Math.min(A.accel * dt, vmax - st.v));
    let step = st.v * dt;
    while (step > 0 && st.path && st.pi < st.path.length) {
      const dx = st.path[st.pi].x - st.x, dz = st.path[st.pi].z - st.z, d = Math.hypot(dx, dz);
      if (d <= step) { st.x = st.path[st.pi].x; st.z = st.path[st.pi].z; step -= d; st.pi++; }
      else { st.x += dx / d * step; st.z += dz / d * step; step = 0; }
    }
    if (st.v > 0.05 && (tx !== st.x || tz !== st.z)) {   // updateRotation: quay về hướng chạy, tối đa angularSpeed °/s
      const want = Math.atan2(-(tx - st.x), -(tz - st.z));
      let dy = want - st.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const m = A.angular * Math.PI / 180 * dt;
      st.yaw += Math.max(-m, Math.min(m, dy));
    }
    st.gh.node.position.set(st.x, 0, st.z);
    st.gh.node.rotation.y = st.yaw;
  }
  function tickBoat(st, dt) {
    if (st.done) return;
    const b = S().boat;
    st.age += dt;
    if (!st.finishing) {
      st.tIn += dt;
      if (st.age > st.dur) { st.reason = 'duration'; finishBoat(st); }
      else if (st.dest && Math.hypot(st.x - st.dest.x, st.z - st.dest.z) < st.B.despawnDestinationProximity) { st.reason = 'destination'; finishBoat(st); }
      else if (Math.hypot(st.x - b.x, st.z - b.z) < st.B.despawnPlayerProximity) { st.reason = 'player'; finishBoat(st); }
    }
    if (st.finishing) st.tOut += dt;
    st.gh.setOp(st.finishing ? FADE_OUT(st.tOut) : FADE_IN(st.tIn));
    moveBoat(st, dt);
    if (!st.hornEnded) { st.hornT -= dt; if (st.hornT <= 0) foghornEnd(st); }
    if (st.horn && !st.hornEnded) st.horn.pos(st.x, 0, st.z);
    if (st.finishing && st.tOut >= st.B.finishDelaySec) disposeBoat(st);
  }
  if (root.DREvents) for (const name of Object.keys(G.boats)) root.DREvents.register(name, { spawn: (e, ctx) => spawnBoat(name, e, ctx) });

  // ---------------------------------------------------------------- FogGhost tĩnh
  const frustum = new T.Frustum(), pm = new T.Matrix4();
  const statics = [];
  let looping = false, last = 0;
  function visibleInView(gh) {
    const cam = root.DRCamera && root.DRCamera.cam;
    if (!cam || !gh.mesh) return false;
    cam.updateMatrixWorld();
    pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    gh.node.updateMatrixWorld(true);
    return frustum.intersectsObject(gh.mesh);
  }
  function setupStatic(d) {
    return { d, gh: null, active: false, phase: '', t: 0, seen: false, fading: false };   // mesh dựng lúc kích hoạt đầu tiên
  }
  function activateStatic(st) {
    const sc = getScene();
    if (!sc) return false;
    if (!st.gh) {
      const d = st.d;
      st.gh = makeGhost(d.mesh, n => { n.position.fromArray(d.pos); n.quaternion.fromArray(d.q); n.scale.fromArray(d.scale); });
    }
    if (!st.gh.node.parent) sc.add(st.gh.node);
    st.gh.node.visible = true; st.active = true; st.phase = 'in'; st.t = 0; st.seen = false; st.fading = false;
    st.gh.setOp(FADE_IN(0));
    loop();
    return true;
  }
  function deactivateStatic(st) {
    st.active = false; st.phase = '';
    if (st.gh) { st.gh.node.visible = false; st.gh.setOp(0); }
  }
  function startFadeOut(st) { st.fading = true; st.phase = 'out'; st.t = 0; }
  function tickStatic(st, dt) {
    const b = S().boat;
    st.t += dt;
    if (st.phase === 'in') st.gh.setOp(FADE_IN(st.t));
    else if (st.phase === 'out') {
      st.gh.setOp(FADE_OUT(st.t));
      if (st.t >= G.fade.out.len) deactivateStatic(st);           // OnFadeOutComplete: SetActive(false)
      return;
    }
    const vis = visibleInView(st.gh);
    if (!st.seen) {                                               // FogGhost.Update
      if (vis && Math.hypot(st.d.x - b.x, st.d.z - b.z) < st.d.seen) { st.seen = true; if (!st.fading && st.d.manual) startFadeOut(st); }
    }
    if (!st.fading && st.seen && !vis) startFadeOut(st);
  }
  function loop() {
    if (looping) return;
    looping = true; last = performance.now();
    const f = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const D = Dr(), act = statics.filter(s => s.active);
      if (!act.length || !D.s) { looping = false; return; }
      const stopped = D.paused || D.mode === 'cargo' || D.mode === 'title';
      for (const s of act) tickStatic(s, stopped ? 0 : dt);
      root.requestAnimationFrame(f);
    };
    root.requestAnimationFrame(f);
  }
  for (const d of G.statics) {
    const st = setupStatic(d);
    statics.push(st);
    if (root.DREvents) root.DREvents.staticEvent('FOG_GHOST', {
      x: d.x, z: d.z, name: d.name,
      activate() {                                                // FogGhost.Activate → RequestEventFinish → EventFinished ngay
        const ok = activateStatic(st);
        return { done: true, aborted: !ok, requestFinish() {} };
      }
    });
  }

  // ---------------------------------------------------------------- dọn khi về màn đầu / ván mới / nạp sổ
  function reset() {
    for (const st of boats.slice()) disposeBoat(st);
    for (const s of statics) if (s.active) deactivateStatic(s);
  }
  if (root.DR && root.DR.on) {
    root.DR.on('newgame', reset); root.DR.on('load', reset);
    root.DR.on('mode', m => { if (m === 'title') reset(); });
  }
  // nạp trước mesh để lần sinh đầu không phải chờ
  if (typeof document !== 'undefined') {
    const pre = () => ensure();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pre); else pre();
  }

  root.DRGhosts = {
    reset,
    debug: {
      boats: () => boats.map(b => ({ name: b.name, x: b.x, z: b.z, yaw: b.yaw, v: b.v, age: b.age, op: b.gh.op, finishing: b.finishing, reason: b.reason || null, tOut: b.tOut, tIn: b.tIn, dur: b.dur, dest: b.dest,
        dPlayer: Math.hypot(b.x - S().boat.x, b.z - S().boat.z), hasMesh: !!b.gh.mesh, horn: b.hornEnded ? 'end' : 'loop' })),
      statics: () => statics.map(s => ({ name: s.d.name, mesh: s.d.mesh, active: s.active, phase: s.phase, t: s.t, op: s.gh ? s.gh.op : 0, seen: s.seen, fading: s.fading, hasMesh: !!(s.gh && s.gh.mesh) })),
      activate: name => { const s = statics.find(x => x.d.name === name); return s ? activateStatic(s) : false; },
      force: name => (root.DREvents ? root.DREvents.debug.force(name) : null),
      stats: () => ({ boats: boats.length, activeStatics: statics.filter(s => s.active).length, meshesLoaded: !!bin })
    }
  };
})(window);
