/*
 * Xúc tu đỏ gai của sự kiện thế giới TentacleAttack (V14: hoảng loạn cao). Dữ liệu: data/tentacle.js (tools/tentacle.py).
 *
 * Lịch bốc thăm: js/events.js (DREvents, chép WorldEventManager.cs). TentacleAttack: minWorldPhase 2, sanity ≤ 0,1, từ 0,75 qua nửa đêm tới 0,25,
 * không ở STELLAR_BASIN / TWISTED_STRAND, không trong vùng an toàn, độ sâu tại (−2, 0, 12) phía trước thuyền > 0,1, nghỉ 3 ngày (lịch sử lưu sổ),
 * Xua đuổi dập tắt. Sinh tại thuyền (playerSpawnOffset 0).
 *
 * AttackingTentacle.cs: gốc xúc tu bám theo vị trí thuyền + (−2, 0, 12) cục bộ với độ mạnh trackingStrength, giảm dần Lerp(f, 0, dt) và vị trí
 * Lerp(pos, đích, dt·Lerp(0, 5, f)); luôn quay mặt về thuyền Slerp(rot, đích, dt·Lerp(0, 40, mạnh)), mạnh = 1 từ lúc StartTrackingPlayer (0 s) tới
 * StopTrackingPlayer (3,875 s) rồi về 0. Hoạt ảnh: Empty →[play]→ Armature|Spawn (7,75 s, sự kiện AttackFinished ở cuối) → exit → Tentacle_Retract
 * (1,58 s, hoà 0,5 s) → AttackFinished → huỷ. Neo bến / thuyền vào bến thì rút ngay.
 *
 * Gây hại: VariablePlayerDamager 2 điểm, requireOneHealthToKill, một lần (DRBoat.monsterHit), chạm hộp va chạm của 4 xương.
 * [ĐỀ XUẤT] chưa có: tiếng (emerge / submerge / attack SFX), hạt BigSplash / TentacleTip / TentacleBase (chưa có trong data/particles.js).
 *
 *   DRTentacle.init(scene)  DRTentacle.update(dt)  DRTentacle.debug → { spawn(), state(), roll(), candidates() }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_TENTACLE, EV = root.DR_WORLDEVENTS;
  if (!T || !D || !EV) { root.DRTentacle = null; return; }
  const ID = 'TentacleAttack';
  const SPAWN = D.clips.spawn, RETRACT = D.clips.retract;
  let scene = null, mat = null, tex = null, inst = null;

  // ---------------------------------------------------------------- hoạt ảnh (Hermite theo từng thành phần như AnimationCurve)
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
  // Tư thế một clip tại thời điểm t cho xương i: ghi vào {p: Vector3, q: Quaternion, s: Vector3}; không có đường cong thì giữ tư thế nghỉ
  function sample(clip, t, bone, out) {
    const c = clip.byBone[bone];
    out.p.set(D.bones[bone].p[0], D.bones[bone].p[1], D.bones[bone].p[2]);
    out.q.set(D.bones[bone].q[0], D.bones[bone].q[1], D.bones[bone].q[2], D.bones[bone].q[3]);
    out.s.set(D.bones[bone].s[0], D.bones[bone].s[1], D.bones[bone].s[2]);
    if (!c) return out;
    if (c.p) { hermite(c.p, t, 3, _v); out.p.set(_v[0], _v[1], _v[2]); }
    if (c.q) { hermite(c.q, t, 4, _v); out.q.set(_v[0], _v[1], _v[2], _v[3]).normalize(); }
    if (c.s) { hermite(c.s, t, 3, _v); out.s.set(_v[0], _v[1], _v[2]); }
    return out;
  }
  for (const clip of [SPAWN, RETRACT]) {
    clip.byBone = {};
    for (const nm in clip.curves) for (const k in clip.curves[nm]) {
      const cv = clip.curves[nm][k];
      (clip.byBone[cv.bone] = clip.byBone[cv.bone] || {})[k] = cv.keys;
    }
  }

  // ---------------------------------------------------------------- vật liệu: MeshBasic + Lit toon của js/sky.js + emission
  function material() {
    const loader = new T.TextureLoader();
    const alb = loader.load(D.tex.albedo), emi = loader.load(D.tex.emission);
    for (const t of [alb, emi]) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    alb.encoding = T.sRGBEncoding;
    emi.encoding = T.LinearEncoding;
    const m = new T.MeshBasicMaterial({ map: alb });
    const uni = { uEmis: { value: emi }, uEmisDist: { value: D.emissionDistance } };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uEmis; uniform float uEmisDist;')
        .replace('#include <output_fragment>', `
  vec3 wpT = vDrFogW;
  vec3 litT = diffuseColor.rgb * (uDrSunCol * drEnvCloud(wpT) + drEnvLights(wpT) + uDrAmb + (1.0 - drEnvMaskB(wpT.xz)) + vec3(uDrTintK, 0.0, 0.0));
  // [ĐỀ XUẤT] Emission: cường độ ×1 (thuộc tính graph chưa dò được tên; ×3 làm xúc tu hồng nhạt hơn clip), không tắt theo khoảng cách (_EmissionEffectiveDistance 35 chưa rõ nghĩa), cộng SAU sương
  // để gai đỏ vẫn sáng xuyên màn sương đêm như clip (ObBBFGMem5U_1671)
  vec3 emT = drS2L(texture2D(uEmis, vUv).rgb) * 1.0;
  gl_FragColor = vec4(litT, 1.0);`)
        .replace('#include <fog_fragment>', '#include <fog_fragment>\n  gl_FragColor.rgb += linearToOutputTexel(vec4(emT, 1.0)).rgb;');
    };
    m.customProgramCacheKey = () => 'drTentacle';
    return m;
  }

  // ---------------------------------------------------------------- dựng một xúc tu
  function build() {
    const nodes = D.bones.map((b, i) => {
      const o = D.skinBones.includes(i) ? new T.Bone() : new T.Object3D();
      o.name = b.name; o.position.fromArray(b.p); o.quaternion.fromArray(b.q); o.scale.fromArray(b.s);
      return o;
    });
    D.bones.forEach((b, i) => { if (b.parent >= 0) nodes[b.parent].add(nodes[i]); });
    const M = D.mesh, g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(M.pos), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(M.nrm), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(M.uv), 2));
    g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(M.skinIndex), 4));
    g.setAttribute('skinWeight', new T.BufferAttribute(new Float32Array(M.skinWeight), 4));
    g.setIndex(M.index);
    const mesh = new T.SkinnedMesh(g, mat);
    mesh.frustumCulled = false;
    mesh.name = 'TentacleAttack';
    const bones = D.skinBones.map(i => nodes[i]);
    const inv = D.bindPoses.map(a => new T.Matrix4().fromArray(a));
    // mesh ở gốc thế giới, bindMatrix = đơn vị: bindpose Unity đã gồm biến đổi của nút Tentacle (xem tools/tentacle.py)
    mesh.bind(new T.Skeleton(bones, inv), new T.Matrix4());
    return { root: nodes[0], nodes, mesh };
  }

  // ---------------------------------------------------------------- sự kiện
  const fw = b => [-Math.sin(b.yaw), -Math.cos(b.yaw)];
  const rt = b => [Math.cos(b.yaw), -Math.sin(b.yaw)];
  function offsetWorld(b, p) { // (x phải, z trước) cục bộ của thuyền -> toạ độ thế giới
    const f = fw(b), r = rt(b);
    return [b.x + r[0] * p[0] + f[0] * p[2], b.z + r[1] * p[0] + f[1] * p[2]];
  }
  function spawn() {
    if (inst || !scene) return false;
    const b = root.DR.s.boat, o = build();
    scene.add(o.root); scene.add(o.mesh);
    o.root.position.set(b.x, 0, b.z);
    inst = { root: o.root, nodes: o.nodes, byName: Object.fromEntries(o.nodes.map(n => [n.name, n])), hit: false, mesh: o.mesh, t: 0, retractT: 0, phase: 'spawn', blend: 0, follow: D.trackingStrength, track: 0, trackTarget: 0, fired: 0,
      yaw: 0, age: 0, prevT: -1 };
    // AttackingTentacle.OnEnable: Invoke("PlayAnimation", animationDelay); StartTrackingPlayer là sự kiện ở 0 s của clip nên bắt đầu cùng clip
    inst.delay = D.animationDelay;
    return true;
  }
  function finish() {
    if (!inst) return;
    scene.remove(inst.root); scene.remove(inst.mesh);
    inst.mesh.geometry.dispose();
    inst = null;
  }
  function requestFinish() { if (inst && inst.phase === 'spawn') { inst.phase = 'retract'; inst.retractT = 0; inst.blend = 0; inst.spawnT = inst.t; } }

  const _p = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() }, _p2 = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() };
  function fire(fn) {
    if (fn === 'StartTrackingPlayer') { inst.follow = D.trackingStrength; inst.trackTarget = 1; }
    else if (fn === 'StopTrackingPlayer') inst.trackTarget = 0;
    else if (fn === 'AttackFinished') requestFinish();     // AttackingTentacleWorldEvent.OnSingleAttackComplete -> RequestEventFinish -> animator exit
  }
  function tick(dt) {
    const b = root.DR.s.boat, I = inst;
    I.age += dt;
    if (I.delay > 0) { I.delay -= dt; return; }
    // --- bám thuyền (TrackPlayer)
    I.follow += (0 - I.follow) * Math.min(1, dt);
    I.track += (I.trackTarget - I.track) * Math.min(1, dt);
    const tgt = offsetWorld(b, D.anchor), k = Math.min(1, dt * 5 * I.follow);
    I.root.position.x += (tgt[0] - I.root.position.x) * k; I.root.position.z += (tgt[1] - I.root.position.z) * k; I.root.position.y = 0;
    const dx = b.x - I.root.position.x, dz = b.z - I.root.position.z;
    if (Math.hypot(dx, dz) > 1e-6) {
      const want = Math.atan2(-dx, -dz);                                  // +z Unity cục bộ = −z three cục bộ
      let dy = want - I.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      I.yaw += dy * Math.min(1, dt * 40 * I.track);
      I.root.rotation.y = I.yaw;
    }
    // --- hoạt ảnh
    if (I.phase === 'spawn') {
      const t0 = I.prevT; I.t += dt; I.prevT = I.t;
      for (const e of SPAWN.events) if (e.t > t0 && e.t <= I.t) fire(e.fn);   // sự kiện hoạt ảnh (AnimationEvent) theo thứ tự thời gian
      if (I.phase === 'spawn' && I.t >= SPAWN.len) I.t -= SPAWN.len;       // clip lặp (m_LoopTime) cho tới khi exit kích Retract
    } else {
      I.retractT += dt; I.spawnT = (I.spawnT + dt) % SPAWN.len;
      I.blend = Math.min(1, I.retractT / D.retractBlend);
      if (I.retractT >= RETRACT.len) { finish(); return; }
    }
    for (const bi of D.skinBones.concat([2])) {
      const n = I.nodes[bi];
      if (I.phase === 'spawn') sample(SPAWN, I.t, bi, _p);
      else {
        sample(SPAWN, I.spawnT, bi, _p); sample(RETRACT, Math.min(I.retractT, RETRACT.len), bi, _p2);
        _p.p.lerp(_p2.p, I.blend); _p.q.slerp(_p2.q, I.blend); _p.s.lerp(_p2.s, I.blend);
      }
      n.position.copy(_p.p); n.quaternion.copy(_p.q); n.scale.copy(_p.s);
    }
  }

  // ---------------------------------------------------------------- lịch sự kiện: js/events.js (WorldEventManager)
  // AttackingTentacleWorldEvent: Activate sinh xúc tu; RequestEventFinish → animator exit → Retract → EventFinished khi huỷ.
  const handle = {
    requestFinish() { requestFinish(); },
    get done() { return !inst; },
    dispose() { finish(); }
  };
  if (root.DREvents) DREvents.register(ID, { spawn() { return spawn() ? handle : null; } });

  // ---------------------------------------------------------------- gây hại: VariablePlayerDamager (TentacleAttack.prefab)
  // damagePoints 2, oneHitOnly 1, requireOneHealthToKill 1; bốn SimplePlayerDetector trên các xương có BoxCollider (layer 7, tag SafeCollider,
  // không phải trigger): Bone.003 size (1,1, 3,5, 1,1) tâm (0, 1, 0); Bone.004 (0,5, 3,5, 0,5) tâm (0, 2, 0); Bone.007 (0,5, 5, 0,5) tâm (0, 1, 0);
  // Bone.012 (0,5, 3, 0,5) tâm (0, −0,5, 0). Hộp đối xứng quanh trục y của xương nên lật z (tools/tentacle.py) không đổi hộp.
  // Tag SafeCollider ⇒ PlayerCollider.ProcessHit coi là va chạm êm; thiệt hại chỉ đến từ VariablePlayerDamager.
  const HIT = { points: 2, oneHitOnly: true, requireOneHealth: true,
    boxes: [['Bone.003', [1.1, 3.5, 1.1], [0, 1, 0]], ['Bone.004', [0.5, 3.5, 0.5], [0, 2, 0]], ['Bone.007', [0.5, 5, 0.5], [0, 1, 0]], ['Bone.012', [0.5, 3, 0.5], [0, -0.5, 0]]] };
  // Thân thuyền: collider tag Player của PlayerContainer (MeshCollider lồi, trigger) — [ĐỀ XUẤT] thay bằng hộp bao của nó
  // (DR_BOAT.colliderSize.player: tâm (0,004, 0,376, −0,003), cỡ (1,216, 0,648, 2,529)); chạm = hai hộp định hướng giao nhau (định lý trục tách).
  const PC = (root.DR_BOAT && DR_BOAT.colliderSize && DR_BOAT.colliderSize.player) || { center: [0, 0.376, 0], size: [1.216, 0.648, 2.529] };
  const _m = new T.Matrix4();
  function obb(M, c, size) {                                         // tâm thế giới + 3 trục đã nhân nửa cạnh (gồm cả tỉ lệ của nút)
    const e = M.elements, ax = [], h = [size[0] / 2, size[1] / 2, size[2] / 2];
    for (let i = 0; i < 3; i++) ax.push([e[i * 4] * h[i], e[i * 4 + 1] * h[i], e[i * 4 + 2] * h[i]]);
    const p = new T.Vector3(c[0], c[1], c[2]).applyMatrix4(M);
    return { p: [p.x, p.y, p.z], ax };
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function overlap(A, B) {
    const d = [B.p[0] - A.p[0], B.p[1] - A.p[1], B.p[2] - A.p[2]], axes = A.ax.concat(B.ax);
    for (const a of A.ax) for (const b of B.ax) axes.push(cross(a, b));
    for (const L of axes) {
      if (dot(L, L) < 1e-10) continue;
      let ra = 0, rb = 0;
      for (const a of A.ax) ra += Math.abs(dot(a, L));
      for (const b of B.ax) rb += Math.abs(dot(b, L));
      if (Math.abs(dot(d, L)) > ra + rb) return false;
    }
    return true;
  }
  function contact() {
    const bob = root.DRBoat && DRBoat.bob;
    if (!bob) return false;
    bob.updateWorldMatrix(true, false);
    const hull = obb(bob.matrixWorld, [PC.center[0], PC.center[1], -PC.center[2]], PC.size);
    for (const [name, size, c] of HIT.boxes) {
      const n = inst.byName[name];
      if (!n) continue;
      n.updateWorldMatrix(true, false);
      if (overlap(hull, obb(_m.copy(n.matrixWorld), c, size))) return name;
    }
    return false;
  }

  // ---------------------------------------------------------------- tương thích kiểm thử cũ (dredge-vwater, dredge-tour)
  const candidates = () => (root.DREvents ? DREvents.candidates() : []);
  const test = name => (root.DREvents ? DREvents.test(name, true) : false);
  const roll = () => (root.DREvents ? DREvents.debug.roll() : null);

  function update(dt) {
    const Dr = root.DR, S = Dr.s;
    if (!scene || !S || !S.boat || !inst) return;
    if (Dr.mode === 'dock' || S.dock) requestFinish();             // OnPlayerDockedToggled
    if (Dr.mode === 'title') { finish(); return; }
    if (inst) tick(Dr.mode === 'cargo' || Dr.paused ? 0 : dt);
    if (inst && !inst.hit && dt > 0) {
      const h = contact();
      if (h) {
        inst.hit = h;                                                 // oneHitOnly: RemoveListeners sau cú đầu
        if (root.DRBoat && DRBoat.monsterHit) DRBoat.monsterHit(HIT.points, { requireOneHealth: HIT.requireOneHealth, source: ID });
      }
    }
  }
  function init(sc) {
    scene = sc;
    mat = material();
  }
  root.DRTentacle = { init, update, finish,
    debug: { spawn: () => { if (inst) return false; if (root.DREvents) DREvents.debug.force(ID); else spawn(true); return !!inst; }, roll, candidates, test, state: () => inst && { phase: inst.phase, t: inst.t, retractT: inst.retractT, x: inst.root.position.x, z: inst.root.position.z,
      yaw: inst.yaw, follow: inst.follow, track: inst.track }, get active() { return !!inst; }, get mesh() { return inst && inst.mesh; } } };
})(window);
