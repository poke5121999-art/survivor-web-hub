/*
 * Xúc tu đỏ gai của sự kiện thế giới TentacleAttack (V14: hoảng loạn cao). Dữ liệu: data/tentacle.js (tools/tentacle.py).
 *
 * WorldEventManager.cs (chỉ phần thấy được trên màn hình): mỗi worldEventRollFrequency (NORMAL 0,1 ngày) lúc đang đi biển (không neo, không câu, thời gian không
 * bị ép trôi) thăm dò một lần; WorldEventChance = 1 nên luôn bốc: lọc mọi WorldEventData (data/worldevents.js) theo TestWorldEvent rồi chọn theo
 * trọng số (SelectInsanityEvent). TentacleAttack: minWorldPhase 2, sanity ≤ 0,1, từ 0,75 qua nửa đêm tới 0,25, không ở STELLAR_BASIN / TWISTED_STRAND,
 * độ sâu tại (−2, 0, 12) phía trước thuyền > 0,1, nghỉ 3 ngày giữa hai lần. Sinh tại thuyền (playerSpawnOffset 0).
 *
 * AttackingTentacle.cs: gốc xúc tu bám theo vị trí thuyền + (−2, 0, 12) cục bộ với độ mạnh trackingStrength, giảm dần Lerp(f, 0, dt) và vị trí
 * Lerp(pos, đích, dt·Lerp(0, 5, f)); luôn quay mặt về thuyền Slerp(rot, đích, dt·Lerp(0, 40, mạnh)), mạnh = 1 từ lúc StartTrackingPlayer (0 s) tới
 * StopTrackingPlayer (3,875 s) rồi về 0. Hoạt ảnh: Empty →[play]→ Armature|Spawn (7,75 s, sự kiện AttackFinished ở cuối) → exit → Tentacle_Retract
 * (1,58 s, hoà 0,5 s) → AttackFinished → huỷ. Neo bến / thuyền vào bến thì rút ngay.
 *
 * [ĐỀ XUẤT] không có: kiểm vùng an toàn (DoesHitSafeZone: raycast layer safe zone), ooze, vùng bốc thăm ở chế độ PASSIVE, tiếng (emerge / submerge / attack
 * SFX), hạt BigSplash / TentacleTip / TentacleBase (chưa có trong data/particles.js), va chạm gây hại. Sự kiện khác trong danh sách ứng viên (cá voi, quạ...)
 * chưa có hình: bốc trúng thì chỉ ghi lịch sử nghỉ rồi bỏ.
 *
 *   DRTentacle.init(scene)  DRTentacle.update(dt)  DRTentacle.debug → { spawn(), state(), roll(), candidates() }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_TENTACLE, EV = root.DR_WORLDEVENTS, CFG = root.DR_CONFIG;
  if (!T || !D || !EV) { root.DRTentacle = null; return; }
  const ROLL_FREQ = (CFG.worldEventRollFrequency || { NORMAL: 0.1 }).NORMAL;        // GameConfigData.WorldEventRollFrequency[NORMAL]
  const CHANCE = CFG.worldEventChance == null ? 1 : CFG.worldEventChance;
  const ID = 'TentacleAttack';
  const SPAWN = D.clips.spawn, RETRACT = D.clips.retract;
  let scene = null, mat = null, tex = null, inst = null;
  let lastRoll = 0, current = null;
  const history = {}; // eventHistory (không lưu vào save)

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
  function spawn(force) {
    if (inst || !scene) return false;
    const b = root.DR.s.boat, o = build();
    scene.add(o.root); scene.add(o.mesh);
    o.root.position.set(b.x, 0, b.z);
    inst = { root: o.root, nodes: o.nodes, mesh: o.mesh, t: 0, retractT: 0, phase: 'spawn', blend: 0, follow: D.trackingStrength, track: 0, trackTarget: 0, fired: 0,
      yaw: 0, age: 0, prevT: -1 };
    // AttackingTentacle.OnEnable: Invoke("PlayAnimation", animationDelay); StartTrackingPlayer là sự kiện ở 0 s của clip nên bắt đầu cùng clip
    inst.delay = D.animationDelay;
    current = { id: ID, force: !!force };
    return true;
  }
  function finish() {
    if (!inst) return;
    scene.remove(inst.root); scene.remove(inst.mesh);
    inst.mesh.geometry.dispose();
    inst = null; current = null;
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

  // ---------------------------------------------------------------- WorldEventManager.TestWorldEvent / SelectInsanityEvent (phần dùng được)
  function depthOk(e, b) {
    if (!e.hasMinDepth) return true;
    const pts = e.depthTestPath, W = root.DRWorld;
    const at = p => { const w = offsetWorld(b, p); return W.depth01(w[0], w[1]) > e.minDepth; };
    if (!pts.length) return true;
    if (!e.isPath || pts.length === 1) return e.isPath ? at(pts[0]) : pts.every(at);
    const n = e.depthPathNumChecks;
    for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j <= n; j++) {
      const u = j / n, a = pts[i], c = pts[i + 1];
      if (!at([a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u, a[2] + (c[2] - a[2]) * u])) return false;
    }
    return true;
  }
  function test(name) {
    const e = EV[name], S = root.DR.s, b = S.boat;
    if ((S.worldPhase | 0) < e.minWorldPhase) return false;
    if (S.sanity < e.minSanity || S.sanity > e.maxSanity) return false;
    if (e.dispelByBanish && S.banishActive) return false;
    const tod = S.time - Math.floor(S.time);
    if (e.spawnStartTime < e.spawnEndTime) { if (tod < e.spawnStartTime || tod > e.spawnEndTime) return false; }
    else if (tod < e.spawnStartTime && tod > e.spawnEndTime) return false;
    if (!(S.time > (name in history ? history[name] : -Infinity) + (e.repeatDelay.NORMAL))) return false;
    if (!depthOk(e, b)) return false;
    const z = offsetWorld(b, e.zoneTestOffset);
    if (e.forbiddenZones.includes(root.DRWorld.zoneAt(z[0], z[1]))) return false;
    return true;
  }
  const candidates = () => Object.keys(EV).filter(test);
  function roll() {
    const list = candidates();
    if (!list.length) return null;
    let tot = 0; for (const n of list) tot += EV[n].weight;
    let r = Math.random() * tot, pick = list[list.length - 1];
    for (const n of list) { r -= EV[n].weight; if (r <= 0) { pick = n; break; } }
    history[pick] = root.DR.s.time;                                     // AddWorldEventToHistory
    if (pick === ID) spawn();
    return pick;
  }

  function update(dt) {
    const Dr = root.DR, S = Dr.s;
    if (!scene || !S || !S.boat) return;
    if (inst) {
      if (Dr.mode === 'dock' || S.dock) requestFinish();             // OnPlayerDockedToggled
      if (Dr.mode === 'title') { finish(); return; }
      if (inst) tick(Dr.mode === 'cargo' || Dr.paused ? 0 : dt);
      return;
    }
    if (S.time < lastRoll) lastRoll = S.time;                        // thời gian lùi (móc setTime)
    const playing = Dr.mode === 'sail' && !S.dock && !(root.DRMinigame && root.DRMinigame.isShown()) && !(root.DRSky && root.DRSky.forced);
    if (playing && S.time > lastRoll + ROLL_FREQ) {
      lastRoll = S.time;
      if (Math.random() < CHANCE) roll();
    }
  }
  function init(sc) {
    scene = sc;
    mat = material();
  }
  root.DRTentacle = { init, update, finish,
    debug: { spawn: () => spawn(true), roll, candidates, test, state: () => inst && { phase: inst.phase, t: inst.t, retractT: inst.retractT, x: inst.root.position.x, z: inst.root.position.z,
      yaw: inst.yaw, follow: inst.follow, track: inst.track }, get active() { return !!inst; }, get mesh() { return inst && inst.mesh; } } };
})(window);
