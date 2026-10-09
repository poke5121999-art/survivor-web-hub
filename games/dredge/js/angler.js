/*
 * Night Angler (MarrowMonster) — quái giả dạng thuyền ma ở The Marrows (MONSTERS.md §2.1, đơn vị U1). Dữ liệu: data/angler.js (tools/angler.py).
 *
 * MonsterManager.cs (Logic/MonsterManager của Game.unity): secondsBetweenChecks 3, hai cấu hình maxSpawned 1, mỗi cấu hình một đường 10 điểm.
 *   Update (:110-126): qua mốc hoàng hôn (prevGameTime < DuskTime 0,75 < Time) thì canSpawn = true; mỗi 3 s nếu canSpawn và Banish không bật thì thử sinh.
 *   TrySpawnMonster (:136-170): count < maxSpawned, WorldPhase ≥ worldPhaseMin 1, giờ > spawnTime 0,85 hoặc < despawnTime 0,15; vị trí path[4], thuyền
 *   gần hơn spawnMinDistance 50 m thì thử tối đa 10 điểm ngẫu nhiên của đường. OnPlayerHitByMonster (:72-75, chỉ angler phát) → canSpawn = false.
 * MarrowMonster.cs:
 *   tuần tra (:261-283, 404-418) theo điểm gần nhất rồi lần lượt, tới điểm khi < waypointDistanceThreshold 2 m; RangeSensor (SensorRange 1, mỗi 1 s,
 *   cần tầm nhìn, đảo chặn — layer 7/15) chạm cầu phát hiện của thuyền (DRDetect, PlayerDetectionCollider) → săn (:442-455), mỗi 0,3 s tìm đường tới
 *   thuyền + hướng·2 m (:420-440); mất dấu quá playerLostThreshold 5 s → tuần tra (:245-252).
 *   tốc độ (:289-301): moveSpeedScalar 0,15 · clamp(trạng thái × MovementSpeedModifier, 30, 45), tấn công ×3 kẹp 100; Lerp(cur, đích, dt), khởi đầu = 0,7.
 *   tấn công (:284-287, 311-351): đang thấy thuyền, < attackDistanceThreshold 6 m, tia tới tâm thuyền không vướng đảo → trigger 'attack'
 *   (MarrowMonster_Attack 2,667 s, sự kiện AnimationComplete), bật capsule (r 0,8, cao 3, trục z) — chạm thuyền: VariablePlayerDamager 2 điểm
 *   (requireOneHealthToKill 0, một lần), SFX 'Marrow Monster - Attack', hitVFX BoatDamageFX, 0,25 s tắt capsule, 0,5 s → Despawn.
 *   Despawn (:212-225, 302-306): bình minh (0,15 < giờ < 0,85), trúng đòn, Banish (:475-483); chìm xuống disappearDepth 3, chạy về path[0] tốc fleeSpeed,
 *   Retreat; huỷ sau ≥ 5 s khi cách path[0] < 5 m hoặc cách thuyền > despawnDistanceThreshold 50 m.
 *   Tiếng (:353-394): Idle Loop / Aggro Loop hoà theo trạng thái săn (Lerp dt), gọi Call 1-3 / Aggro Call 1-3 mỗi 10-20 s; mới thấy thuyền thì gọi ngay
 *   (timeOfLastPlayerDetectionAudioClipPlayed không bao giờ được ghi ở bản gốc nên điều kiện 20 s luôn đúng).
 * Hình: cây Transform của prefab (MarrowMonster → Monster [BuoyantObject + Animator Swim] → GhostModel (GhostBoat1_0, FogGhost_Shader) + Model →
 *   marrow_swim [Animator Idle ×4 / Attack] → monster_marrow (SkinnedMesh, Monster_Shader)). BuoyantObject (strength 2, objectDepth 1,8 → 3 khi
 *   lặn, Rigidbody khối 50, drag 5): gia tốc lên g·min(sâu,1)/objectDepth·strength − g, nên nổi cân bằng ở 0,9 m dưới mặt nước, còn ở 3 thì chìm hẳn.
 *   NavMeshAgent (speed đặt mỗi khung, acceleration 8, angularSpeed 120°/s, autoBraking 0) chạy trên DRNav (lưới navmesh-generic).
 *   Volume cục bộ MonsterProfile (ChromaticAberration 0,6, Vignette đỏ 0,35 / smoothness 0,75), VFXVolumeFader blendDistance 0 → 50 trong 2 s khi sinh,
 *   về 0 khi Despawn; trọng số = 1 − khoảng cách camera / blendDistance.
 *
 *   DRAngler.update(dt)  (js/boat.js gọi mỗi khung, dt = 0 khi tạm dừng)
 *   DRAngler.debug → { list(), manager(), clear(), los(ax, az, bx, bz), detect(i) }
 */
(function (root) {
  'use strict';
  const T = root.THREE, A = root.DR_ANGLER;
  if (!T || !A || !A.nodes) { root.DRAngler = null; return; }
  const MD = A.data, MM = A.monster, MGR = A.manager, BU = A.buoyancy, AU = A.audio;
  const DUSK = (root.DR_ENV && root.DR_ENV.time && root.DR_ENV.time.duskTime) || 0.75;   // TimeController.DuskTime (data/env.js)
  const G = 9.81;
  const tod = () => { const t = root.DR.s.time; return t - Math.floor(t); };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------------------------------------------------------------- giải mã mesh (base64, xem tools/angler.py)
  function bytes(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function geometry(M) {
    const g = new T.BufferGeometry(), q = new Int16Array(bytes(M.pos).buffer), pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) { const c = i % 3; pos[i] = M.min[c] + (q[i] + 32768) / 65535 * (M.max[c] - M.min[c]); }
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const uq = new Uint16Array(bytes(M.uv).buffer), uv = new Float32Array(uq.length);
    for (let i = 0; i < uq.length; i++) uv[i] = uq[i] / 65535;
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    if (M.color) g.setAttribute('color', new T.BufferAttribute(bytes(M.color), 4, true));
    if (M.skinIndex) {
      g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(bytes(M.skinIndex)), 4));
      g.setAttribute('skinWeight', new T.BufferAttribute(bytes(M.skinWeight), 4, true));
    }
    g.setIndex(new T.BufferAttribute(new Uint16Array(bytes(M.index).buffer), 1));
    return g;
  }

  // ---------------------------------------------------------------- hoạt ảnh (AnimationCurve Hermite theo từng thành phần, Euler ZXY = 'YXZ')
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
  const CLIPS = A.clips, D2R = Math.PI / 180, _v = [0, 0, 0, 0], _e = new T.Euler();
  for (const k in CLIPS) {
    const c = CLIPS[k];
    c.byNode = {};
    for (const cv of c.curves) (c.byNode[cv.node] = c.byNode[cv.node] || {})[cv.kind] = cv.keys;
    c.nodes = Object.keys(c.byNode).map(Number);
  }
  function pose() { return { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() }; }
  function sample(clip, t, node, out) {
    const r = A.nodes[node], c = clip.byNode[node];
    out.p.fromArray(r.p); out.q.fromArray(r.q); out.s.fromArray(r.s);
    if (!c) return out;
    if (c.p) { hermite(c.p, t, 3, _v); out.p.set(_v[0], _v[1], _v[2]); }
    if (c.q) { hermite(c.q, t, 4, _v); out.q.set(_v[0], _v[1], _v[2], _v[3]).normalize(); }
    if (c.e) { hermite(c.e, t, 3, _v); out.q.setFromEuler(_e.set(_v[0] * D2R, _v[1] * D2R, _v[2] * D2R, 'YXZ')); }
    if (c.s) { hermite(c.s, t, 3, _v); out.s.set(_v[0], _v[1], _v[2]); }
    return out;
  }
  const clipT = (c, t) => (c.loop ? ((t % c.len) + c.len) % c.len : Math.min(t, c.len));
  const POS_AN = A.animator.MarrowMonsterPositionAnimator, STATE_AN = A.animator.MarrowMonsterStateAnimator;
  const ST = STATE_AN.states, IDLE = 'Idle', ATTACK = 'MarrowMonster_Attack';
  const TR_IN = STATE_AN.transitions.find(t => t.from === IDLE && t.to === ATTACK), TR_OUT = STATE_AN.transitions.find(t => t.from === ATTACK && t.to === IDLE);

  // ---------------------------------------------------------------- vật liệu
  let monsterMat = null, ghostMat = null, geoSkin = null, geoGhost = null;
  function materials() {
    const L = new T.TextureLoader(), M = A.mat.monster, GH = A.mat.ghost;
    const alb = L.load(M.albedo), emi = L.load(M.emission), gem = L.load(GH.emission);
    alb.encoding = T.sRGBEncoding; emi.encoding = T.LinearEncoding; gem.encoding = T.sRGBEncoding;
    // Monster_Shader (DXBC pass Universal Forward, D:/dredge-ref/cache/angler/shaders/Monster_Shader.txt; tools/angler.py --dis):
    //   màu = Texture × (đèn phụ + màu nắng _MainLightColor + SH ambient + (1 − mask.b) + (tint, 0, 0)) — không N·L, không bóng, không mây;
    //   sương như Lit; Emission × (1 − sat(độ sâu mắt / _EmissionEffectiveDistance 35)), kẹp [0,1], × EmissionStrength 7, cộng SAU sương.
    monsterMat = new T.MeshBasicMaterial({ map: alb });
    const um = { uEmis: { value: emi }, uEmisDist: { value: M.emissionEffectiveDistance }, uEmisK: { value: M.emissionStrength } };
    monsterMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, um);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uEmis; uniform float uEmisDist; uniform float uEmisK;')
        .replace('#include <output_fragment>', `
  vec3 wpA = vDrFogW;
  vec3 litA = diffuseColor.rgb * (uDrSunCol + drEnvLights(wpA) + uDrAmb + (1.0 - drEnvMaskB(wpA.xz)) + vec3(uDrTintK, 0.0, 0.0));
  vec3 emA = clamp(drS2L(texture2D(uEmis, vUv).rgb) * (1.0 - clamp(vFogDepth / uEmisDist, 0.0, 1.0)), 0.0, 1.0) * uEmisK;
  gl_FragColor = vec4(litA, 1.0);`)
        .replace('#include <fog_fragment>', '#include <fog_fragment>\n  gl_FragColor.rgb += linearToOutputTexel(vec4(emA, 1.0)).rgb;');
    };
    monsterMat.customProgramCacheKey = () => 'drAnglerMonster';
    // FogGhost_Shader (DXBC, FogGhost_Shader.txt): Blend SrcAlpha OneMinusSrcAlpha, ZWrite off, Cull back, hàng đợi 3000.
    //   màu = Emission × màu đỉnh × 2, rồi sương; alpha = Emission.a × màu đỉnh.a × sat(khoảng cách camera·0,04 − 0,9) (vô hình trong 22,5 m, rõ hẳn
    //   từ 47,5 m) × (1 − sat(((nắng.y + 1)/2 − 0,263218)·41,425377)) (chỉ hiện khi mặt trời dưới chân trời) × Opacity 1 × (1 − |Σ đèn phụ|)^100
    //   (tan biến trong vùng đèn thuyền). AppearOnlyInFog 0.
    ghostMat = new T.MeshBasicMaterial({ map: gem, vertexColors: true, transparent: true, depthWrite: false });
    const ug = { uOpacity: { value: GH.opacity } };
    ghostMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, ug);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uOpacity;')
        .replace('#include <output_fragment>', `
  vec3 wpG = vDrFogW;
  float nightG = 1.0 - clamp(((uDrSunDir.y + 1.0) * 0.5 - 0.263218) * 41.425377, 0.0, 1.0);
  vec3 camG = -(transpose(mat3(viewMatrix)) * viewMatrix[3].xyz);   // _WorldSpaceCameraPos (three r140 không cập nhật cameraPosition cho MeshBasicMaterial)
  float aG = diffuseColor.a * clamp(distance(camG, wpG) * 0.04 - 0.9, 0.0, 1.0) * nightG * uOpacity * pow(max(1.0 - length(drEnvLights(wpG)), 0.0), 100.0);
  gl_FragColor = vec4(diffuseColor.rgb * 2.0, aG);`);
    };
    ghostMat.customProgramCacheKey = () => 'drAnglerGhost';
    geoSkin = geometry(A.skin.mesh);
    geoGhost = geometry(A.ghost.mesh);
    // cắt theo khung nhìn: hình cầu bao tư thế nghỉ (không gian nút monster_marrow, đơn vị cm) nới ×1,6 cho hoạt ảnh lao cắn [ĐỀ XUẤT]
    geoSkin.computeBoundingSphere(); geoSkin.boundingSphere.radius *= 1.6;
  }

  // ---------------------------------------------------------------- một con
  let scene = null;
  const list = [];
  function sceneOf() {
    if (scene) return scene;
    let o = root.DRBoat && DRBoat.root;
    while (o && o.parent) o = o.parent;
    if (o && o.isScene) { scene = o; materials(); }
    return scene;
  }
  function build() {
    const nodes = A.nodes.map((n, i) => {
      const o = A.skin.bones.includes(i) ? new T.Bone() : new T.Object3D();
      o.name = n.name; o.position.fromArray(n.p); o.quaternion.fromArray(n.q); o.scale.fromArray(n.s);
      return o;
    });
    A.nodes.forEach((n, i) => { if (n.parent >= 0) nodes[n.parent].add(nodes[i]); });
    const skin = new T.SkinnedMesh(geoSkin, monsterMat);
    skin.name = 'monster_marrow';
    skin.bind(new T.Skeleton(A.skin.bones.map(i => nodes[i]), A.skin.bindPoses.map(a => new T.Matrix4().fromArray(a))), new T.Matrix4());
    nodes[A.skin.node].add(skin);
    const ghost = new T.Mesh(geoGhost, ghostMat);
    ghost.name = 'GhostBoat1_0'; ghost.renderOrder = 3;
    nodes[A.ghost.node].add(ghost);
    return { root: nodes[0], nodes, skin, ghost };
  }
  const _p1 = pose(), _p2 = pose();

  function spawn(cfgIndex, pt) {
    const sc = sceneOf();
    if (!sc) return null;
    const o = build();
    sc.add(o.root);
    o.root.position.set(pt[0], 0, pt[1]);
    const m = {
      cfg: cfgIndex, path: MGR.configs[cfgIndex].path, o, x: pt[0], z: pt[1], yaw: 0, vx: 0, vz: 0, y: 0, vy: 0, depth: MD.idleDepth,
      // MarrowMonster.Init
      followWaypoints: true, seek: false, flee: false, detects: false, despawning: false, attacking: false, canDamage: true, hit: false,
      pathIndex: -1, hasWaypoint: false, lostTime: -Infinity, targetTime: -Infinity, despawnTimer: 0, cached: null, corners: null, ci: 0,
      speed: MD.patrolSpeed, lerped: MD.patrolSpeed, callT: lerp(MM.callAudioDelayMin, MM.callAudioDelayMax, Math.random()), idleVol: 0,
      sensorT: 0, swimT: 0, state: IDLE, stateT: 0, prev: null, prevT: 0, blend: 1, blendDur: 0, fadeK: 0, fadeTo: MM ? 1 : 1, fadeFrom: 0, fadeT: 0,
      age: 0, done: false
    };
    m.wake = root.DRParticles ? DRParticles.spawn(A.particles.wake[0], { parent: o.nodes[A.particles.wake[1]], loop: true }) : null;
    const vp = { x: m.x, y: 0, z: m.z };
    m.snd = {};
    if (root.DRAudio) for (const k of ['idle', 'aggro']) m.snd[k] = DRAudio.voice(AU[k].clip, { loop: true, vol: 0, pos: vp, min: AU[k].min, max: AU[k].max });
    list.push(m);
    root.DR.emit('anglerSpawned', { cfg: cfgIndex, x: m.x, z: m.z });   // một Night Angler vừa xuất hiện (tiếng / HUD nghe ở đây)
    return m;
  }
  function destroy(m) {
    if (m.done) return;
    m.done = true;
    if (m.o.root.parent) m.o.root.parent.remove(m.o.root);
    m.o.skin.skeleton.dispose();
    if (m.wake) m.wake.stop();
    for (const k in m.snd) if (m.snd[k]) m.snd[k].stop(0.2);
    const i = list.indexOf(m);
    if (i >= 0) list.splice(i, 1);
    counts[m.cfg] = Math.max(0, counts[m.cfg] - 1);          // OnMonsterDespawned
  }

  // ---------------------------------------------------------------- NavMeshAgent (đơn giản hoá: đi theo các góc của DRNav.path)
  function setPath(m, x, z) {
    const p = root.DRNav && DRNav.path ? DRNav.path({ x: m.x, z: m.z }, { x, z }) : null;
    m.corners = p; m.ci = p ? 1 : 0;
    return !!p;
  }
  function agentStep(m, dt) {
    const AG = A.agent;
    let dx = 0, dz = 0, want = 0;
    if (m.corners && m.ci < m.corners.length) {
      let c = m.corners[m.ci];
      let d = Math.hypot(c.x - m.x, c.z - m.z);
      while (d < 0.5 && m.ci < m.corners.length - 1) { m.ci++; c = m.corners[m.ci]; d = Math.hypot(c.x - m.x, c.z - m.z); }
      if (d >= 0.05) { dx = (c.x - m.x) / d; dz = (c.z - m.z) / d; want = m.speed; }
      if (d < 0.05 || (m.ci === m.corners.length - 1 && d < m.speed * dt)) { want = Math.min(want, d / Math.max(dt, 1e-4)); }
    }
    // vận tốc tiến tới vận tốc mong muốn với gia tốc tối đa acceleration (m/s²)
    const tx = dx * want - m.vx, tz = dz * want - m.vz, tl = Math.hypot(tx, tz), mx = AG.acceleration * dt;
    if (tl > mx) { m.vx += tx / tl * mx; m.vz += tz / tl * mx; } else { m.vx += tx; m.vz += tz; }
    const sp = Math.hypot(m.vx, m.vz);
    if (sp > m.speed && sp > 0) { m.vx *= m.speed / sp; m.vz *= m.speed / sp; }
    m.x += m.vx * dt; m.z += m.vz * dt;
    // updateRotation: quay về hướng vận tốc với angularSpeed (°/s); +z Unity = −z three
    if (sp > 0.05) {
      const goal = Math.atan2(-m.vx, -m.vz);
      let d = goal - m.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const st = AG.angularSpeed * D2R * dt;
      m.yaw += clamp(d, -st, st);
    }
  }

  // ---------------------------------------------------------------- cảm biến (RangeSensor + PlayerDetectionCollider) và tầm nhìn
  // Tầm nhìn: tia chặn bởi layer 7/15 (đảo, đá) — web dùng landmask: chặn nếu một điểm cách nhau 1 m trên đoạn nằm trong đất (sdf ≤ 0) [ĐỀ XUẤT]
  function los(ax, az, bx, bz) {
    const W = root.DRWorld, d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d));
    if (!W || !W.sdf) return true;
    for (let i = 1; i < n; i++) { const k = i / n; if (W.sdf(ax + (bx - ax) * k, az + (bz - az) * k) <= 0) return false; }
    return true;
  }
  function sensorPulse(m) {
    const b = root.DR.s.boat;
    const inRange = root.DRDetect ? DRDetect.within(m.x, m.z, A.sensor.range) : Math.hypot(m.x - b.x, m.z - b.z) < 20 + A.sensor.range;
    const seen = inRange && (!A.sensor.lineOfSight || los(m.x, m.z, b.x, b.z));
    if (seen && !m.sensed) { m.sensed = true; onDetected(m); }
    else if (!seen && m.sensed) { m.sensed = false; onLost(m); }
  }
  function onDetected(m) {                                               // OnPlayerTargetDetected (:442-455)
    if (m.flee) return;
    m.seek = true; m.followWaypoints = false; m.detects = true; m.lostTime = Infinity;
    callAudio(m);                                                        // :450 — mốc 20 s không bao giờ được ghi ở bản gốc
    root.DR.emit('anglerHunt', { cfg: m.cfg });   // angler bắt đầu săn thuyền
  }
  function onLost(m) {                                                   // OnPlayerTargetLost (:457-465)
    if (!m.detects) return;
    const b = root.DR.s.boat;
    m.detects = false; m.lostTime = clock; m.cached = { x: b.x, z: b.z };
  }
  function toPatrol(m) {                                                 // TransitionFromHuntingToPatrolling + SeekClosestWaypoint
    m.seek = false; m.followWaypoints = true; m.hasWaypoint = false;
    m.pathIndex = closest(m);
  }
  function closest(m) {
    let best = Infinity, k = 0;
    m.path.forEach((p, i) => { const d = Math.hypot(p[0] - m.x, p[1] - m.z); if (d < best) { best = d; k = i; } });
    return k;
  }
  function evaluatePath(m) {                                             // EvaluatePathToPlayer (:420-440)
    const b = root.DR.s.boat, src = m.detects ? b : m.cached;
    let vx = src.x - m.x, vz = src.z - m.z; const l = Math.hypot(vx, vz) || 1;
    vx /= l; vz /= l;
    m.targetTime = clock;
    if (setPath(m, b.x + vx * 2, b.z + vz * 2)) { m.seek = true; m.followWaypoints = false; }
    else { m.seek = false; m.hasWaypoint = false; m.followWaypoints = true; }
  }

  // ---------------------------------------------------------------- tấn công
  // Thân thuyền: collider tag Player (DR_BOAT.colliderSize.player, như js/tentacle.js) — hộp định hướng; capsule của quái: đoạn thẳng trục z cục bộ
  const PC = (root.DR_BOAT && DR_BOAT.colliderSize && DR_BOAT.colliderSize.player) || { center: [0, 0.376, 0], size: [1.216, 0.648, 2.529] };
  const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3();
  function hullObb() {
    const bob = root.DRBoat && DRBoat.bob;
    if (!bob) return null;
    bob.updateWorldMatrix(true, false);
    const e = bob.matrixWorld.elements, h = [PC.size[0] / 2, PC.size[1] / 2, PC.size[2] / 2], ax = [];
    for (let i = 0; i < 3; i++) {
      const v = [e[i * 4], e[i * 4 + 1], e[i * 4 + 2]], l = Math.hypot(v[0], v[1], v[2]) || 1;
      ax.push({ u: [v[0] / l, v[1] / l, v[2] / l], h: h[i] * l });
    }
    const p = _c.set(PC.center[0], PC.center[1], -PC.center[2]).applyMatrix4(bob.matrixWorld);
    return { p: [p.x, p.y, p.z], ax };
  }
  function pointObb(o, x, y, z) {                                         // khoảng cách điểm → hộp định hướng
    const d = [x - o.p[0], y - o.p[1], z - o.p[2]];
    let s = 0;
    for (const a of o.ax) {
      const t = d[0] * a.u[0] + d[1] * a.u[1] + d[2] * a.u[2], ex = Math.abs(t) - a.h;
      if (ex > 0) s += ex * ex;
    }
    return Math.sqrt(s);
  }
  function capsuleHits(m) {
    const C = A.collider, n = m.o.nodes[C.node], half = Math.max(0, C.height / 2 - C.radius), hull = hullObb();
    if (!hull) return false;
    n.updateWorldMatrix(true, false);
    _a.set(C.center[0], C.center[1], C.center[2] - half).applyMatrix4(n.matrixWorld);
    _b.set(C.center[0], C.center[1], C.center[2] + half).applyMatrix4(n.matrixWorld);
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      if (pointObb(hull, lerp(_a.x, _b.x, k), lerp(_a.y, _b.y, k), lerp(_a.z, _b.z, k)) < C.radius) return true;
    }
    return false;
  }
  function tryAttack(m) {                                                 // TryDoAttack: tia tới ColliderCenter, viewLayerMask (đảo chặn)
    const b = root.DR.s.boat;
    if (Math.hypot(b.x - m.x, b.z - m.z) < MM.attackDistanceThreshold && los(m.x, m.z, b.x, b.z)) doAttack(m);
  }
  function doAttack(m) {
    m.attacking = true; m.collider = true;
    setState(m, ATTACK, TR_IN ? TR_IN.duration : 0.25);
    root.DR.emit('anglerAttack', { cfg: m.cfg });   // angler lao lên cắn (trigger 'attack')
  }
  function onAttackComplete(m) {                                          // AnimationEvents.OnComplete (AnimationComplete ở 2,667 s)
    m.collider = false; m.attacking = false;
  }
  function onPlayerHit(m) {                                               // OnPlayerHit (:343-351) + VariablePlayerDamager.OnPlayerHit
    m.canDamage = false; m.hit = true;
    if (root.DRBoat && DRBoat.monsterHit) DRBoat.monsterHit(A.damager.damagePoints, { requireOneHealth: !!A.damager.requireOneHealthToKill, source: 'MarrowMonster' });
    if (root.DRAudio) DRAudio.play(AU.attack);
    if (root.DRParticles) DRParticles.spawn(A.particles.hit[0], { parent: m.o.root });
    canSpawn = false;                                                      // GameEvents.TriggerPlayerHitByMonster → MonsterManager
    m.timers = [[0.25, () => { m.collider = false; }], [0.5, () => despawn(m)]];   // DelayedDespawn
  }
  function despawn(m) {                                                   // Despawn (:212-225)
    if (m.despawning) return;
    m.despawning = true; m.followWaypoints = false; m.seek = false; m.flee = true; m.detects = false; m.attacking = false;
    m.depth = MD.disappearDepth;
    m.fadeFrom = m.fadeK; m.fadeTo = 0; m.fadeT = 0;                       // volumeFader.FadeOut
    if (root.DRAudio) { const r = AU.retreat; DRAudio.play(r.clip, r.vol, 1, { pos: { x: m.x, y: 0, z: m.z }, min: r.min, max: r.max }); }
    setPath(m, m.path[0][0], m.path[0][1]);
    if (m.wake) m.wake.stop();                                             // bubbles.Stop()
    root.DR.emit('anglerDespawn', { cfg: m.cfg });   // angler bắt đầu lặn đi
  }
  function callAudio(m) {                                                 // DoCallAudio (:381-394)
    const set = m.seek ? AU.aggroCalls : AU.calls, src = m.seek ? AU.aggroCall : AU.call;
    if (root.DRAudio) DRAudio.play(set[Math.floor(Math.random() * set.length)], src.vol, 1, { pos: { x: m.x, y: 0, z: m.z }, min: src.min, max: src.max });
    m.callT = lerp(MM.callAudioDelayMin, MM.callAudioDelayMax, Math.random());
  }

  // ---------------------------------------------------------------- trạng thái Animator marrow_swim
  function setState(m, name, dur) {
    m.prev = m.state; m.prevT = m.stateT; m.state = name; m.stateT = 0; m.blendDur = dur; m.blend = dur > 0 ? 0 : 1;
  }
  function animate(m, dt) {
    // Animator Monster: Swim (lặp 4 s) cho nút Model
    m.swimT += dt * POS_AN.states.Swim.speed;
    const sw = CLIPS[POS_AN.states.Swim.clip];
    for (const ni of sw.nodes) { sample(sw, clipT(sw, m.swimT), ni, _p1); const n = m.o.nodes[ni]; n.position.copy(_p1.p); n.quaternion.copy(_p1.q); n.scale.copy(_p1.s); }
    // Animator marrow_swim: Idle (×4) ⇄ MarrowMonster_Attack
    const cs = CLIPS[ST[m.state].clip], t0 = m.stateT;
    m.stateT += dt * ST[m.state].speed;
    if (m.prev) m.prevT += dt * ST[m.prev].speed;
    if (m.blend < 1) { m.blend = Math.min(1, m.blend + dt / m.blendDur); if (m.blend >= 1) m.prev = null; }
    for (const e of cs.events) if (e.t > t0 && e.t <= m.stateT) { if (e.fn === 'AnimationComplete') onAttackComplete(m); }
    if (m.state === ATTACK && TR_OUT && m.stateT >= TR_OUT.exitTime * cs.len) setState(m, IDLE, TR_OUT.duration);   // exitTime 1, 0,25 s
    const cur = CLIPS[ST[m.state].clip], prv = m.prev ? CLIPS[ST[m.prev].clip] : null;
    for (const ni of cur.nodes) {
      sample(cur, clipT(cur, m.stateT), ni, _p1);
      if (prv) { sample(prv, clipT(prv, m.prevT), ni, _p2); _p1.p.lerp(_p2.p, 1 - m.blend); _p1.q.slerp(_p2.q, 1 - m.blend); _p1.s.lerp(_p2.s, 1 - m.blend); }
      const n = m.o.nodes[ni]; n.position.copy(_p1.p); n.quaternion.copy(_p1.q); n.scale.copy(_p1.s);
    }
  }

  // ---------------------------------------------------------------- một khung của một con (MarrowMonster.Update :227-309)
  function tick(m, dt) {
    const b = root.DR.s.boat, t = tod();
    m.age += dt;
    if (m.timers) for (const tm of m.timers) if (tm[0] > 0 && (tm[0] -= dt) <= 0) tm[1]();
    let num = MD.patrolSpeed;
    if (m.despawning) m.despawnTimer += dt;
    if (!m.despawning && t > MD.despawnTime && t < MD.spawnTime) despawn(m);
    else {
      if (m.seek) { num = MD.huntSpeed; if (clock > m.lostTime + MD.playerLostThreshold) toPatrol(m); }
      if (m.detects && clock > m.targetTime + MM.playerTargetReevaluationInterval) evaluatePath(m);
      else if (m.flee) num = MD.fleeSpeed;
      else if (m.followWaypoints) {
        num = MD.patrolSpeed;
        if (m.pathIndex !== -1 && Math.hypot(m.x - m.path[m.pathIndex][0], m.z - m.path[m.pathIndex][1]) < MM.waypointDistanceThreshold) {
          m.pathIndex = (m.pathIndex + 1) % m.path.length; m.hasWaypoint = false;
        }
        if (!m.hasWaypoint) {
          if (m.pathIndex === -1) m.pathIndex = closest(m);
          setPath(m, m.path[m.pathIndex][0], m.path[m.pathIndex][1]);
          m.hasWaypoint = true;
        }
      }
      if (m.canDamage && !m.attacking && m.detects && !m.flee && Math.hypot(m.x - b.x, m.z - b.z) < MM.attackDistanceThreshold) tryAttack(m);
    }
    // tốc độ (:289-301)
    const mod = (root.DRBoat && DRBoat.stats && DRBoat.stats.moveMod) || 10;
    let v = num * mod, goal;
    if (m.attacking) { v *= MM.attackSpeedBoostFactor; goal = MM.moveSpeedScalar * clamp(v, MM.boatSpeedMin, MM.attackMaxBoatSpeed); }
    else goal = MM.moveSpeedScalar * clamp(v, MM.boatSpeedMin, MM.boatSpeedMax);
    m.lerped = lerp(m.lerped, goal, Math.min(1, dt));
    m.speed = m.lerped;
    agentStep(m, dt);
    // RangeSensor: nhịp CheckInterval 1 s
    if ((m.sensorT -= dt) <= 0) { m.sensorT += A.sensor.interval; if (!m.flee) sensorPulse(m); }
    // BuoyantObject (một effector ở gốc Monster), mặt nước y = 0 [ĐỀ XUẤT: bỏ sóng]
    const d = 0 - m.y, up = d > 0 ? G * Math.min(d, 1) / m.depth * BU.strength : 0;
    m.vy += (up - G * BU.gravityModifier) * dt;
    m.vy /= 1 + BU.drag * dt;                                               // Rigidbody.drag (PhysX: v · 1/(1 + dt·drag))
    m.y += m.vy * dt;
    // capsule chạm thuyền
    if (m.collider && m.canDamage && !m.hit && dt > 0 && capsuleHits(m)) onPlayerHit(m);
    // VFXVolumeFader (DOTween tuyến tính)
    m.fadeT += dt;
    m.fadeK = lerp(m.fadeFrom, m.fadeTo, Math.min(1, m.fadeT / A.fader.blendDurationSec));
    // huỷ (:302-306)
    if (m.despawning && m.despawnTimer >= 5 && (Math.hypot(m.path[0][0] - m.x, m.path[0][1] - m.z) < 5 || Math.hypot(b.x - m.x, b.z - m.z) > MD.despawnDistanceThreshold)) {
      destroy(m); return;
    }
    // tiếng (:353-379)
    if (m.flee) m.idleVol = lerp(m.idleVol, 0, Math.min(1, dt));
    else m.idleVol = lerp(m.idleVol, m.seek ? 0 : 1, Math.min(1, dt));
    if (m.snd.idle) { m.snd.idle.gain(m.idleVol); m.snd.idle.pos(m.x, 0, m.z); }
    if (m.snd.aggro) { m.snd.aggro.gain(m.flee ? m.idleVol : 1 - m.idleVol); m.snd.aggro.pos(m.x, 0, m.z); }
    if (!m.flee && (m.callT -= dt) <= 0) callAudio(m);
    // đặt hình
    const o = m.o;
    o.root.position.set(m.x, 0, m.z); o.root.rotation.set(0, m.yaw, 0);
    o.nodes[BU.node].position.y = dbg.y == null ? m.y : dbg.y;     // dbg.y: móc kiểm thử nhấc thân lên khỏi nước để chụp
    animate(m, dt);
  }

  // ---------------------------------------------------------------- MonsterManager
  let canSpawn = true, banish = false, checkT = 0, prevTod = null, clock = 0;
  const dbg = { y: null };
  const counts = MGR.configs.map(() => 0);
  function trySpawn() {
    const s = root.DR.s, b = s.boat, t = tod();
    MGR.configs.forEach((c, i) => {
      if (counts[i] >= c.maxSpawned || ((s.worldPhase | 0) < MD.worldPhaseMin)) return;
      if (!(t > MD.spawnTime) && !(t < MD.despawnTime)) return;
      let p = c.path[4];
      for (let k = 0; k < 10; k++) {
        if (!(Math.hypot(b.x - p[0], b.z - p[1]) < MD.spawnMinDistance)) break;
        p = c.path[Math.floor(Math.random() * c.path.length)];
      }
      if (spawn(i, p)) counts[i]++;
    });
  }
  function clear() { for (const m of list.slice()) destroy(m); counts.fill(0); }
  function post() {
    // MonsterProfile (priority 2): ChromaticAberration 0,6 hoà theo trọng số khoảng cách camera; quang sai của js/sky.js tính xong trước khung này
    // nên ở đây chỉ Lerp(giá trị hiện có, 0,6, w) — xấp xỉ thứ tự hoà volume của URP [ĐỀ XUẤT]. Vignette đỏ: lớp phủ CSS [ĐỀ XUẤT] (web chưa có pass vignette).
    const cam = root.DRCamera && DRCamera.cam, P = root.DRSky && DRSky.post;
    let w = 0;
    for (const m of list) {
      const bd = A.fader.maxBlendDistance * m.fadeK;
      if (bd <= 0 || !cam) continue;
      const d = Math.max(0, Math.hypot(cam.position.x - m.x, cam.position.y - m.y, cam.position.z - m.z) - 0.1);
      w = Math.max(w, 1 - d / bd);
    }
    w = clamp(w, 0, 1);
    if (P && P.uber && P.uber.uniforms.uCA && w > 0) {
      const u = P.uber.uniforms.uCA, cur = u.value / 0.05;
      u.value = lerp(cur, 0.6, w) * 0.05;
    }
    vignette(w);
  }
  let vig = null;
  function vignette(w) {
    if (!vig) {
      if (w <= 0 || typeof document === 'undefined') return;
      const cv = document.getElementById('dr-canvas');
      vig = document.createElement('div');
      vig.id = 'dr-angler-vignette';
      // Vignette: màu (1, 0, 0,008), intensity 0,35, smoothness 0,75 (MonsterProfile_0 / Vignette_3.asset)
      vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;opacity:0;' +
        'background:radial-gradient(ellipse at center, rgba(255,0,2,0) 45%, rgba(255,0,2,0.35) 100%)';
      (cv && cv.parentNode ? cv.parentNode : document.body).insertBefore(vig, cv ? cv.nextSibling : null);
    }
    vig.style.opacity = w.toFixed(3);
  }

  function update(dt) {
    const Dr = root.DR, s = Dr && Dr.s;
    if (!s || !s.boat) return;
    if (Dr.mode === 'title') { if (list.length) clear(); return; }
    if (!sceneOf()) return;
    if (Dr.mode === 'over') dt = 0;
    clock += dt;
    const t = tod();
    // MonsterManager.Update
    if (prevTod == null) prevTod = t;
    if (!canSpawn && prevTod < DUSK && t > DUSK) canSpawn = true;
    checkT -= dt;
    if (dt > 0 && checkT <= 0 && canSpawn && !banish) { trySpawn(); checkT = MGR.secondsBetweenChecks; }
    prevTod = t;
    if (dt > 0) for (const m of list.slice()) tick(m, dt);
    post();
  }

  function bind() {
    const Dr = root.DR;
    if (!Dr || !Dr.on) return;
    Dr.on('banish', on => {                                                // OnPlayerAbilityToggled(banish)
      banish = !!on;
      if (on) for (const m of list.slice()) { if (!m.despawning) { Dr.emit('threatBanished', { source: 'MarrowMonster', active: m.seek || m.attacking }); m.collider = false; despawn(m); } }
    });
    const reset = () => { clear(); canSpawn = true; banish = false; checkT = 0; prevTod = null; };
    Dr.on('newgame', reset); Dr.on('load', reset);
    Dr.on('mode', m => { if (m === 'title') clear(); });
  }
  bind();

  root.DRAngler = {
    update,
    get active() { return list.length; },
    debug: {
      list: () => list.map(m => ({ cfg: m.cfg, x: +m.x.toFixed(2), z: +m.z.toFixed(2), y: +m.y.toFixed(3), yaw: m.yaw, speed: m.speed,
        seek: m.seek, detects: m.detects, flee: m.flee, attacking: m.attacking, despawning: m.despawning, hit: m.hit, state: m.state,
        pathIndex: m.pathIndex, fade: m.fadeK, age: m.age, despawnTimer: m.despawnTimer })),
      manager: () => ({ canSpawn, banish, checkT, counts: counts.slice(), prevTod }),
      clear, los, set y(v) { dbg.y = v; }, get y() { return dbg.y; },
      get objects() { return list.map(m => m.o.root); }
    }
  };
})(window);
