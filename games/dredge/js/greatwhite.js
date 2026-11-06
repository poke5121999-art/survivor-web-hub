/*
 * Cá mập trắng lớn của sự kiện thế giới GreatWhite (GreatWhiteWorldEvent.cs, 156 dòng). Đơn vị R7 (WORLD-GAPS.md §6). Dữ liệu: data/greatwhite.js (tools/greatwhite.py).
 *
 * Điều kiện sinh nằm ở data/worldevents.js + js/events.js: minWorldPhase 1, sanity 0,25..0,75, giờ 0,25..0,75, độ sâu > 0,15 dọc đường (25,0,100) → (−25,0,100) → (0,0,0),
 *   forbiddenZones = mọi vùng trừ OPEN_OCEAN (THE_MARROWS, GALE_CLIFFS, STELLAR_BASIN, TWISTED_STRAND, DEVILS_SPINE, PALE_REACH = 95 trong enum cờ) tại thuyền +
 *   zoneTestOffset (25,0,100), không vùng an toàn, trọng số 30, repeatDelay 7 ngày. Nên cá mập KHÔNG BAO GIỜ sinh ngoài OPEN_OCEAN: kiểm bằng DREvents.debug.test('GreatWhite').
 * Vòng chạy (Update mỗi khung, Time.deltaTime):
 *   Awake: mô hình ở y = downY (−12). Activate: tốc độ agent = idleSpeed 5; đường đi = (thuyền + right·x + forward·z) với y = 0 cho mọi điểm trừ điểm cuối của
 *     depthTestPath (2 điểm); mô hình trồi lên y 0 trong 2 s (OutSine); tiếng vòng lặp tăng 0 → 1 trong 1 s; SetDestination(đường[0]).
 *   SWIMMING: tới cách điểm < 2 → điểm kế; hết đường → SEEKING, tốc độ agent pursueSpeed 7. SEEKING: 0,5 s một lần SetDestination(người chơi);
 *     hơn maxSeekTimeSec 20 s → ForceDespawn (3 s mô hình chìm về downY, tiếng tắt, rồi kết thúc).
 *   Gần người chơi < 25 m (SWIMMING/SEEKING): f = 1 − invLerp(0, 25, d); y mô hình = Lerp(y, curve(f)·downY, dt); âm lượng = 1 − f.
 *   d < 1 → RequestEventFinish (huỷ ngay, KHÔNG gây sát thương: cá mập chỉ rượt rồi lặn khi tới sát thuyền).
 *   Mô hình quay: Slerp(quay, LookRotation(vị trí − vị trí trước), dt·0,5) — quay chậm theo hướng chuyển động.
 * NavMeshAgent (speed 5, accel 8, angular 120 °/s, auto-braking) → bước đơn giản: đi theo các góc của DRNav.path('generic'), tăng tốc 8 m/s², quay đầu 120 °/s.
 *   [ĐỀ XUẤT] chưa có DRNav (hoặc không có đường) thì đi thẳng tới đích. Buoyant của BuoyantContainer (nhấp nhô theo sóng) chưa chép: mô hình ở y cục bộ như mã.
 *
 *   DRGreatWhite.update(dt) (bao DRBoat.update, không sửa js/boat.js)   DRGreatWhite.ready
 *   DRGreatWhite.debug → { state(), force(), simulate(sec), place({x, z}) }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_GREATWHITE, EV = root.DR_WORLDEVENTS;
  if (!T || !D || !D.bones || !EV) { root.DRGreatWhite = null; return; }
  const REV = (document.currentScript && (document.currentScript.src.match(/[?&]v=([^&]+)/) || [])[1]) || '';
  const ID = 'GreatWhite', P = D.params, S = () => root.DR.s;
  let scene = null, mat = null, inst = null, meshData = null, meshLoading = null, frozen = false;

  const A = root.DR_AUDIO = root.DR_AUDIO || {};
  for (const k in D.audio) if (!A[k]) A[k] = Object.assign({ bus: 'sfx' }, D.audio[k]);
  const voice = (k, o) => { try { return root.DRAudio && DRAudio.resolve(k) ? DRAudio.voice(k, o) : null; } catch (e) { return null; } };

  // ---------------------------------------------------------------- AnimationCurve của playerProximityDepth và clip swim_loop (Hermite như js/phantomshark.js)
  function evalCurve(keys, t) {
    const n = keys.length;
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 1;
    while (t > keys[i][0]) i++;
    const a = keys[i - 1], b = keys[i], d = b[0] - a[0], u = (t - a[0]) / d;
    if (a[3] == null || b[2] == null) return a[1];
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * a[3] * d + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * b[2] * d;
  }
  function hermite(keys, t, n, out) {
    const last = keys[keys.length - 1];
    let a = keys[0], b = keys[0];
    if (t >= last[0]) a = b = last;
    else if (t > keys[0][0]) for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { a = keys[i - 1]; b = keys[i]; break; }
    if (a === b) { for (let c = 0; c < n; c++) out[c] = a[1 + c]; return out; }
    const d = b[0] - a[0], u = (t - a[0]) / d, u2 = u * u, u3 = u2 * u;
    for (let c = 0; c < n; c++) {
      const m0 = a[1 + 2 * n + c], m1 = b[1 + n + c];
      if (!isFinite(m0) || !isFinite(m1)) { out[c] = a[1 + c]; continue; }
      out[c] = (2 * u3 - 3 * u2 + 1) * a[1 + c] + (u3 - 2 * u2 + u) * m0 * d + (-2 * u3 + 3 * u2) * b[1 + c] + (u3 - u2) * m1 * d;
    }
    return out;
  }
  const _v = [0, 0, 0, 0];
  function sample(clip, t, bone, out) {
    const c = clip.byBone[bone], b = D.bones[bone];
    out.p.set(b.p[0], b.p[1], b.p[2]); out.q.set(b.q[0], b.q[1], b.q[2], b.q[3]); out.s.set(b.s[0], b.s[1], b.s[2]);
    if (!c) return out;
    if (c.p) { hermite(c.p, t, 3, _v); out.p.set(_v[0], _v[1], _v[2]); }
    if (c.q) { hermite(c.q, t, 4, _v); out.q.set(_v[0], _v[1], _v[2], _v[3]).normalize(); }
    if (c.s) { hermite(c.s, t, 3, _v); out.s.set(_v[0], _v[1], _v[2]); }
    return out;
  }
  const CLIP = D.clip, ANIMATED = new Set();
  CLIP.byBone = {};
  for (const nm in CLIP.curves) for (const k in CLIP.curves[nm]) {
    const cv = CLIP.curves[nm][k];
    (CLIP.byBone[cv.bone] = CLIP.byBone[cv.bone] || {})[k] = cv.keys;
    ANIMATED.add(cv.bone);
  }
  const ANIM_LIST = Array.from(ANIMATED).sort((a, b) => a - b);

  // ---------------------------------------------------------------- mesh (shark.bin, định dạng của tools/leviathan.py)
  function loadMesh() {
    if (meshLoading) return meshLoading;
    meshLoading = fetch(D.mesh.url + (REV ? '?v=' + REV : '')).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then(buf => {
      const dv = new DataView(buf), nv = dv.getUint32(0, true), ni = dv.getUint32(4, true);
      const f = i => dv.getFloat32(8 + i * 4, true);
      const mn = [f(0), f(1), f(2)], mx = [f(3), f(4), f(5)], umn = [f(6), f(7)], umx = [f(8), f(9)];
      let o = 64;
      const q = new Uint16Array(buf, o, nv * 3); o += nv * 6;
      const qu = new Uint16Array(buf, o, nv * 2); o += nv * 4;
      const si = new Uint8Array(buf, o, nv * 4); o += nv * 4;
      const sw = new Uint8Array(buf, o, nv * 4); o += nv * 4;
      const idx = new Uint16Array(buf, o, ni);
      const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), wf = new Float32Array(nv * 4);
      for (let i = 0; i < nv * 3; i++) { const c = i % 3; pos[i] = mn[c] + q[i] / 65535 * (mx[c] - mn[c]); }
      for (let i = 0; i < nv * 2; i++) { const c = i % 2; uv[i] = umn[c] + qu[i] / 65535 * (umx[c] - umn[c]); }
      for (let i = 0; i < nv * 4; i++) wf[i] = sw[i] / 255;
      meshData = { pos, uv, si, wf, idx: Uint16Array.from(idx) };
    }).catch(e => { console.warn('[greatwhite] shark.bin load failed:', e.message); meshLoading = null; });
    return meshLoading;
  }

  // Shark_Mat dùng Lit_Shader: albedo × (nắng + đèn phụ + ambient + (1 − WaveMask.b)) như js/mimic.js
  function material() {
    const L = new T.TextureLoader(), alb = L.load(D.tex.albedo + (REV ? '?v=' + REV : ''));
    alb.encoding = T.sRGBEncoding; alb.wrapS = alb.wrapT = T.RepeatWrapping;
    const m = new T.MeshBasicMaterial({ map: alb, side: T.DoubleSide });
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <output_fragment>', `
  vec3 wpA = vDrFogW;
  vec3 litA = diffuseColor.rgb * (uDrSunCol + drEnvLights(wpA) + uDrAmb + (1.0 - drEnvMaskB(wpA.xz)) + vec3(uDrTintK, 0.0, 0.0));
  gl_FragColor = vec4(litA, 1.0);`);
    };
    m.customProgramCacheKey = () => 'drGreatWhite';
    return m;
  }
  function build() {
    const nodes = D.bones.map((b, i) => {
      const o = D.skinBones.includes(i) ? new T.Bone() : new T.Object3D();
      o.name = b.name; o.position.fromArray(b.p); o.quaternion.fromArray(b.q); o.scale.fromArray(b.s);
      return o;
    });
    D.bones.forEach((b, i) => { if (b.parent >= 0) nodes[b.parent].add(nodes[i]); });
    let mesh = null;
    if (meshData) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(meshData.pos, 3));
      g.setAttribute('uv', new T.BufferAttribute(meshData.uv, 2));
      g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(meshData.si), 4));
      g.setAttribute('skinWeight', new T.BufferAttribute(meshData.wf, 4));
      g.setIndex(new T.BufferAttribute(meshData.idx, 1));
      mesh = new T.SkinnedMesh(g, mat);
      mesh.frustumCulled = false; mesh.name = 'GreatWhiteShark';
      mesh.bind(new T.Skeleton(D.skinBones.map(i => nodes[i]), D.bindPoses.map(a => new T.Matrix4().fromArray(a))), new T.Matrix4());
    }
    return { root: nodes[0], model: nodes[D.modelNode], nodes, mesh };
  }
  function ensureScene() {
    if (scene) return true;
    let o = root.DRBoat && DRBoat.root;
    while (o && o.parent) o = o.parent;
    if (o && o.isScene) { scene = o; mat = material(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- tiện ích
  const outSine = u => Math.sin(u * Math.PI / 2), inSine = u => 1 - Math.cos(u * Math.PI / 2);
  const _e = new T.Euler(0, 0, 0, 'YXZ'), _q = new T.Quaternion();
  function lookQ(dx, dy, dz, out) {                                // LookRotation(hướng, up = y) trong toạ độ three.js: tiến tới = −z
    const h = Math.hypot(dx, dz);
    _e.set(Math.atan2(dy, h), Math.atan2(-dx, -dz), 0, 'YXZ');
    return out.setFromEuler(_e);
  }
  const fw = b => [-Math.sin(b.yaw), -Math.cos(b.yaw)];
  const rt = b => [Math.cos(b.yaw), -Math.sin(b.yaw)];
  const boatY = () => (root.DRBoat && DRBoat.root ? DRBoat.root.position.y : 0);
  const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

  // ---------------------------------------------------------------- NavMeshAgent đơn giản
  function setDestination(I, x, z) {
    const a = { x: I.root.position.x, z: I.root.position.z }, g = { x, z };
    let path = null;
    if (root.DRNav && DRNav.path) { try { path = DRNav.path(a, g, 'generic'); } catch (e) { path = null; } }
    if (!path || !path.length) path = [g];                          // [ĐỀ XUẤT] không có lưới / không có đường: đi thẳng
    I.agent.path = path.slice(); I.agent.dest = g;
    if (I.agent.path.length > 1 && Math.hypot(I.agent.path[0].x - a.x, I.agent.path[0].z - a.z) < 0.5) I.agent.path.shift();
  }
  function agentStep(I, dt) {
    const ag = I.agent, p = I.root.position;
    let tgt = ag.path[0];
    if (tgt && Math.hypot(tgt.x - p.x, tgt.z - p.z) < 0.3 && ag.path.length > 1) { ag.path.shift(); tgt = ag.path[0]; }
    let want = ag.speed;
    if (!tgt) want = 0;
    else {
      const dx = tgt.x - p.x, dz = tgt.z - p.z, dl = Math.hypot(dx, dz);
      if (ag.path.length === 1) want = Math.min(want, Math.sqrt(2 * P.accel * dl) + 0.01);   // AutoBraking: dừng đúng đích
      const th = Math.atan2(dx, dz), da = angDiff(ag.yaw, th), maxT = P.angular * Math.PI / 180 * dt;
      ag.yaw += Math.max(-maxT, Math.min(maxT, da));
    }
    ag.v += Math.max(-P.accel * dt, Math.min(P.accel * dt, want - ag.v));
    const k = ag.v * dt;
    p.x += Math.sin(ag.yaw) * k; p.z += Math.cos(ag.yaw) * k;
    if (tgt && ag.path.length === 1 && Math.hypot(tgt.x - p.x, tgt.z - p.z) < 0.05) ag.path = [];
  }

  // ---------------------------------------------------------------- Activate
  function spawn(e, ctx) {
    if (inst || !ensureScene()) return null;
    const o = build(), b = S().boat, f = fw(b), r = rt(b);
    scene.add(o.root); if (o.mesh) scene.add(o.mesh);
    o.root.position.set(ctx.x, 0, ctx.z);
    o.model.position.set(0, P.downY, 0);
    const pts = e.depthTestPath, path = [];
    for (let i = 0; i < pts.length - 1; i++) path.push({ x: b.x + pts[i][0] * r[0] + pts[i][2] * f[0], z: b.z + pts[i][0] * r[1] + pts[i][2] * f[1] });
    inst = { root: o.root, model: o.model, nodes: o.nodes, mesh: o.mesh, state: 'SWIMMING', path, pathIndex: 0, seekT: 0, lastPathT: 0, clock: 0, age: 0, riseT: 0, rising: true, riseFrom: P.downY,
      despawnT: -1, despawnFrom: 0, done: false, finishRequested: false, animT: 0, prev: new T.Vector3(), vol: 0, fadeT: 0, voice: null,
      agent: { path: [], dest: null, speed: P.idleSpeed, v: 0, yaw: 0 }, mQ: new T.Quaternion() };
    o.root.updateMatrixWorld(true);
    inst.model.getWorldPosition(inst.prev);
    inst.agent.yaw = Math.atan2(path[0].x - ctx.x, path[0].z - ctx.z);
    setDestination(inst, path[0].x, path[0].z);
    inst.voice = voice('event.greatwhite.loop', { loop: true, vol: 0, pos: { x: ctx.x, y: 0, z: ctx.z }, min: P.audioMin, max: P.audioMax });
    if (!meshData) loadMesh();
    pose();
    return handle;
  }
  function requestFinish() {
    if (!inst || inst.finishRequested) return;
    inst.finishRequested = true; inst.done = true;
  }
  function finish() {
    if (!inst) return;
    if (inst.voice) inst.voice.stop(0.2);
    scene.remove(inst.root); if (inst.mesh) { scene.remove(inst.mesh); inst.mesh.geometry.dispose(); }
    inst = null;
  }

  // ---------------------------------------------------------------- Update (GreatWhiteWorldEvent.cs:90-131)
  const _p1 = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() }, _wp = new T.Vector3(), _lq = new T.Quaternion();
  function pose() {
    const I = inst, t = I.animT % CLIP.len;
    for (const bi of ANIM_LIST) {
      sample(CLIP, t, bi, _p1);
      const n = I.nodes[bi];
      n.position.copy(_p1.p); n.quaternion.copy(_p1.q); n.scale.copy(_p1.s);
    }
  }
  function step(dt) {
    const I = inst, b = S().boat, p = I.root.position;
    I.clock += dt; I.age += dt; I.animT += dt;
    // DOTween: model.DOLocalMoveY(0, 2).SetEase(OutSine) từ y lúc Activate
    if (I.rising) { I.riseT += dt; const u = Math.min(1, I.riseT / P.riseSec); I.model.position.y = I.riseFrom + (0 - I.riseFrom) * outSine(u); if (u >= 1) I.rising = false; }
    if (I.fadeT < P.fadeInSec && I.state !== 'DESPAWNING') { I.fadeT += dt; I.vol = Math.min(1, I.fadeT / P.fadeInSec); }   // audioSource.DOFade(1, 1).From(0)
    agentStep(I, dt);
    if (I.state === 'SWIMMING') {
      const w = I.path[I.pathIndex];
      if (Math.hypot(p.x - w.x, p.z - w.z) < P.waypointDistanceThreshold) {
        I.pathIndex++;
        if (I.pathIndex < I.path.length) setDestination(I, I.path[I.pathIndex].x, I.path[I.pathIndex].z);
        else { I.state = 'SEEKING'; I.agent.speed = P.pursueSpeed; }
      }
    } else if (I.state === 'SEEKING' && I.clock > I.lastPathT + 0.5) { setDestination(I, b.x, b.z); I.lastPathT = I.clock; }
    if (I.state === 'SEEKING') {
      I.seekT += dt;
      if (I.seekT > P.maxSeekTimeSec) {                           // ForceDespawn
        I.state = 'DESPAWNING'; I.despawnT = 0; I.despawnFrom = I.model.position.y; I.rising = false; I.volFrom = I.vol;
      }
    }
    const d = Math.hypot(p.x - b.x, 0 - boatY(), p.z - b.z);
    if ((I.state === 'SWIMMING' || I.state === 'SEEKING') && d < P.playerDistanceThreshold) {
      const f = 1 - Math.min(1, Math.max(0, d / P.playerDistanceThreshold));
      const tgtY = evalCurve(D.curve, f) * P.downY;
      I.model.position.y += (tgtY - I.model.position.y) * Math.min(1, dt);        // Mathf.Lerp(y, b, Time.deltaTime)
      I.vol = 1 - f; I.fadeT = P.fadeInSec;
    }
    if (I.state === 'DESPAWNING') {
      I.despawnT += dt;
      const u = Math.min(1, I.despawnT / P.forceDespawnSec);
      I.model.position.y = I.despawnFrom + (P.downY - I.despawnFrom) * inSine(u);
      I.vol = I.volFrom * (1 - u);
      if (u >= 1) requestFinish();
    }
    if (d < P.despawnDistanceThreshold) requestFinish();
    // model.rotation = Slerp(model.rotation, LookRotation(model.position − prevPos), dt·rotationSpeed)
    I.root.updateMatrixWorld(true);
    I.model.getWorldPosition(_wp);
    const dx = _wp.x - I.prev.x, dy = _wp.y - I.prev.y, dz = _wp.z - I.prev.z;
    if (dx * dx + dy * dy + dz * dz > 1e-12) { lookQ(dx, dy, dz, _lq); I.model.quaternion.slerp(_lq, Math.min(1, dt * P.rotationSpeed)); }
    I.prev.copy(_wp);
    pose();
    I.root.updateMatrixWorld(true);
    if (I.voice) { I.model.getWorldPosition(_wp); I.voice.pos(_wp.x, _wp.y, _wp.z); I.voice.gain(I.vol, 0.05); }
  }
  function update(dt) {
    if (!inst || dt <= 0 || frozen) return;
    step(dt);
  }

  // ---------------------------------------------------------------- lịch sự kiện
  const handle = {
    requestFinish() { requestFinish(); },
    get done() { return !inst || inst.done; },
    update(dt) {
      const Dr = root.DR;
      if (Dr.mode === 'title') { finish(); return; }
      update(Dr.mode === 'cargo' || Dr.paused ? 0 : dt);
      if (inst && inst.done) finish();
    },
    dispose() { finish(); }
  };
  if (root.DREvents) DREvents.register(ID, { spawn });

  let loadTimer = null;
  function tick() {
    if (!scene) ensureScene();
    if (scene && !meshData && !meshLoading && !loadTimer) loadTimer = setTimeout(loadMesh, 1500);
  }
  if (root.DRBoat && typeof DRBoat.update === 'function' && !DRBoat.update._greatwhite) {
    const orig = DRBoat.update;
    const wrapped = function (dt, env) { const r = orig.apply(this, arguments); try { tick(); } catch (e) { console.error('[greatwhite]', e); } return r; };
    wrapped._greatwhite = true;
    DRBoat.update = wrapped;
  }

  root.DRGreatWhite = {
    update, get ready() { return !!meshData; },
    debug: {
      force: () => { if (inst) return false; if (root.DREvents) DREvents.debug.force(ID); return !!inst; },
      simulate(sec, dt) { const f = frozen; frozen = false; const h = dt || 0.02, n = Math.round(sec / h); for (let i = 0; i < n && inst; i++) handle.update(h); frozen = f; return !!inst; },
      freeze(on) { frozen = !!on; },
      place(p) { if (!inst) return false; inst.root.position.x = p.x; inst.root.position.z = p.z; inst.root.updateMatrixWorld(true); return true; },
      state() {
        if (!inst) return null;
        const p = inst.root.position, b = S().boat, wp = inst.model.getWorldPosition(new T.Vector3());
        return { state: inst.state, x: p.x, z: p.z, modelY: inst.model.position.y, wy: wp.y, speed: inst.agent.v, agentSpeed: inst.agent.speed, pathIndex: inst.pathIndex, seekT: inst.seekT, clock: inst.clock,
          dist: Math.hypot(p.x - b.x, p.z - b.z), done: inst.done, vol: inst.vol, path: inst.path.map(q => ({ x: q.x, z: q.z })), mesh: !!inst.mesh };
      },
      get active() { return !!inst; }, get mesh() { return inst && inst.mesh; }, get meshReady() { return !!meshData; }
    }
  };
})(window);
