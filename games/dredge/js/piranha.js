/*
 * Cá piranha của Devil's Spine và Mẹ Không Mắt (DSMonsterManager.cs, DSLittleMonsterSpawner.cs, DSLittleMonster.cs, DSBigMonster.cs; WORLD-GAPS.md R5).
 * Dữ liệu: data/piranha.js (tools/piranha.py đọc Game.unity + hai prefab + clip + NavMesh DS_Large).
 *
 * Cá nhỏ (DSLittleMonster)
 *   20 DSLittleMonsterSpawner trong scene (DevilsSpine/Monsters/MonsterSpawners/1..20), mỗi cái 2-4 cấu hình (tốc độ, tầm nhìn, vòng quanh nhà).
 *   Spawner (Update mỗi timeBetweenSpawnChecksSec 0,5 s, :69-92): không Xua đuổi, người chơi cách < spawnDistance 80, số cá < số cấu hình, đã 0,5 s từ lần sinh
 *   trước → sinh thêm 1 con; còn nếu cách > despawnDistance 90 → tất cả Despawn(ignoreIfChasing). Xua đuổi bật → Despawn hết kể cả cá đang đuổi.
 *   Cá (FixedUpdate 0,02 s, :140-155): LookForPlayer → CheckHomeDistance → TurnToTarget → WiggleTurn → Move → UpdateAttachment.
 *     IDLE nhìn thấy thuyền (mỗi lookFrequencySec 1 s, thuyền trong maxRange 75 của nhà, tia nhìn tới tâm thuyền trong viewDistance 10-25 m không bị đất chặn) → CHASING.
 *     CHASING không bao giờ mất dấu bằng mắt (canLosePlayerBySight = 0 ở cả 20 spawner); ra khỏi maxRange, đụng đất, chạm vent, PASSIVE → RETURNING_HOME.
 *     RETURNING_HOME + đụng đất → Despawn; về gần nhà (< 2·circleDistance) → IDLE; IDLE xa nhà > 35 m → Despawn.
 *     Lực tiến = forward · speed lên Rigidbody khối lượng 0,1, drag 10 (PhysX: v += F/m·dt, rồi v *= 1 − drag·dt): tốc độ cân bằng 0,8·speed.
 *     Bám: cách điểm bám thuyền (y −0,3) < attachDistanceThreshold 5 → PlayerStats.AttachMonsterToPlayer (đếm +1, tiếng Latch On); xa hơn thì nhả.
 *   Tốc độ thuyền (PlayerController.cs:180): max(AttachedMonsterMovementSpeedFactor · MovementSpeedModifier, BasePlayerSpeed) · baseMovementModifier, với
 *   AttachedMonsterMovementSpeedFactor = lerp(1, 0, clamp01(số cá bám / numAttachedMonstersToNullifyEngines 6)) (PlayerStats.cs:76).
 *   Vent (27 collider tag Vent, capsule trigger bán kính 5, cao 25,16): cá chạm vào thì kêu (nếu đang đuổi) và bị đuổi về nhà (RETURNING_HOME).
 *
 * Mẹ (DSBigMonster)
 *   DSMonsterManager (590, 610 Unity): mỗi 1 s, thuyền cách < spawnRange 300 và chưa có mẹ → sinh; mẹ cách thuyền > despawnRange 500 → huỷ.
 *   Mẹ chạy NavMeshAgent (tốc độ 5 → Lerp mỗi khung tới tốc độ đích, gia tốc 8, quay 180°/s) trên NavMesh DS_Large riêng (art/piranha/navmask-ds.png):
 *   tuần tra 15 điểm EntityPath (tốc độ 3); có ≥ 1 cá bám, thuyền cách mẹ < playerDetectionThreshold 100 và quá attackDelay 7 s từ đòn trước → đuổi (tốc độ 6)
 *   nếu thuyền cách neo (550, 544) < deaggroRange 250; hết cá bám thì về đường tuần tra. Cách thuyền < 7 m, quá 7 s từ đòn trước, tia nhìn trúng thuyền → đánh:
 *   Attack 4,3 s (LungeStart 0,533 s: tất cả cá nhỏ về nhà và bị chặn 7 s; DamageCollider bật 0 → 1,5 s; AttackComplete 3,833 s). Hàm trúng:
 *   DamageCollider (cầu r 1, nút con xương headroot_jnt) chạm thân thuyền → GridManager.AddDamageToInventory(3, +1 ác mộng): DRBoat.monsterHit(3), KHÔNG có
 *   requireOneHealthToKill và không có thời gian miễn → có thể chìm thuyền. Xua đuổi bật: không đuổi, không đánh; đang đuổi thì về đường tuần tra.
 *   Mẹ có một spawner riêng (3 cá, spawnDistance 150, maxRange 200) quanh LittleMonsterAnchor.
 *
 * [ĐỀ XUẤT] khác bản gốc: bảng va chạm vật lý (Physics) không đọc được nên cá chỉ va đất (landmask SDF ≤ 0,2 m) chứ không va thuyền; BumpCollider (capsule của mẹ
 * để thuyền đụng vào) chưa có; tia nhìn bị đất chặn theo landmask như js/angler.js; hạt bọt BoatTrailParticles của cá và FX của đòn đánh chưa có; vòng tiếng
 * "Latched Ambience" khi bị bám chưa có; xuống bến (dock) thì dọn hết (bản gốc không có bến trong Devil's Spine); y của mẹ = 0 (mặt nước).
 *
 *   DRPiranha.init(scene)  .update(dt)  .finish()  .speedFactor()  .moveSpeed(stats)  .attached
 *   DRPiranha.debug → { state(), simulate(sec), spawnerStates(), place(i, {x,y,z}), force.chase(i), mother(), spawnMother({x,z}), killMother(), nav, ... }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_PIRANHA;
  if (!T || !D || !D.little || !D.mother) { root.DRPiranha = null; return; }
  const L = D.little, M = D.mother, CFG = D.cfg, FIXED = CFG.fixedDt, DEG = Math.PI / 180;
  const S = { IDLE: 'IDLE', CHASING: 'CHASING', DESPAWNING: 'DESPAWNING', HOME: 'RETURNING_HOME' };
  let scene = null, clock = 0, banish = false, navReady = false, lastMode = 'NORMAL';
  const littles = [], spawners = [];
  let mother = null, mgrCheck = -Infinity, attached = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const moveTowards = (a, b, d) => (Math.abs(b - a) <= d ? b : a + Math.sign(b - a) * d);
  const NULLIFY = (root.DR_CONFIG && root.DR_CONFIG.numAttachedMonstersToNullifyEngines) || CFG.numAttachedMonstersToNullifyEngines;

  // ---------------------------------------------------------------- người chơi
  const _b = { x: 0, y: 0, z: 0, yaw: 0 };
  function boat() {
    const b = root.DR && root.DR.s && root.DR.s.boat;
    if (!b) { _b.x = _b.z = _b.y = 0; return _b; }
    _b.x = b.x; _b.z = b.z; _b.yaw = b.yaw || 0;
    _b.y = root.DRBoat && DRBoat.root ? DRBoat.root.position.y : 0;
    return _b;
  }
  const gameMode = () => (root.DREvents && DREvents.gameMode) || 'NORMAL';
  const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const live = () => root.DR && root.DR.s && (root.DR.mode === 'sail' || root.DR.mode === 'harvest');

  // ---------------------------------------------------------------- tốc độ thuyền (PlayerStats.AttachedMonsterMovementSpeedFactor + PlayerController.cs:180)
  function speedFactor() { return 1 + (0 - 1) * clamp(attached / NULLIFY, 0, 1); }
  function moveSpeed(st) {
    const f = speedFactor();
    if (f >= 1) return st.speed;
    const C = root.DR_CONFIG || {};
    return Math.max(f * st.moveMod, +C.basePlayerSpeed || 0) * (+C.baseMovementSpeedModifier || 1);
  }

  // ---------------------------------------------------------------- âm thanh (DR_AUDIO có khoá ds.* do data/piranha.js thêm)
  const AK = (M.audio && M.audio.keys) || {};
  function sfx(key, pos, o) {
    if (!root.DRAudio) return null;
    try { return DRAudio.play(AK[key], 1, o && o.rate, { pos: { x: pos.x, y: pos.y, z: pos.z }, min: o && o.min != null ? o.min : 5, max: o && o.max != null ? o.max : 50 }); } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- hoạt ảnh (Hermite theo thành phần như AnimationCurve; chép js/phantomshark.js)
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
  function sampleBone(def, clip, t, bone, out) {
    const c = clip.curves[bone], b = def.bones[bone];
    out.p.set(b.p[0], b.p[1], b.p[2]); out.q.set(b.q[0], b.q[1], b.q[2], b.q[3]); out.s.set(b.s[0], b.s[1], b.s[2]);
    if (!c) return out;
    if (c.p) { hermite(c.p, t, 3, _v); out.p.set(_v[0], _v[1], _v[2]); }
    if (c.q) { hermite(c.q, t, 4, _v); out.q.set(_v[0], _v[1], _v[2], _v[3]).normalize(); }
    if (c.s) { hermite(c.s, t, 3, _v); out.s.set(_v[0], _v[1], _v[2]); }
    return out;
  }
  const stepVal = (keys, t) => { let v = keys[0][1]; for (const k of keys) if (k[0] <= t) v = k[1]; return v; };   // đường cong m_IsActive hằng từng bước
  for (const def of [L, M]) {
    def.animated = new Set();
    for (const nm in def.clips) for (const bi in def.clips[nm].curves) def.animated.add(+bi);
    def.animList = Array.from(def.animated).filter(i => i > 0).sort((a, b) => a - b);
  }

  // ---------------------------------------------------------------- vật liệu: Monster_Shader (mẹ = chính xác; cá = Lit_Shader, cùng bố cục [ĐỀ XUẤT])
  const MATS = {};
  function material(kind) {
    if (MATS[kind]) return MATS[kind];
    const def = kind === 'little' ? L : M, loader = new T.TextureLoader();
    const alb = loader.load(def.tex.albedo), emi = loader.load(def.tex.emissive);
    alb.encoding = T.sRGBEncoding; emi.encoding = T.LinearEncoding;
    // Monster_Shader (mẹ dùng đúng Shader Graphs/Monster_Shader_0 như angler; js/angler.js): màu = Texture × (nắng + đèn phụ + ambient + (1 − mask.b) + tint),
    // Emission × (1 − sat(độ sâu mắt / _EmissionEffectiveDistance)) × EmissionStrength cộng SAU sương. Cá nhỏ dùng Lit_Shader_2 (_LightStrength 4, không có
    // _EmissionEffectiveDistance): [ĐỀ XUẤT] cùng công thức ánh sáng toon, phát sáng × 4 không tắt theo khoảng cách.
    const strength = kind === 'little' ? (def.floats._LightStrength || 4) : (def.floats.Vector1_b0d9cca47aa941e7b3c694dbf011a310 || 7);
    const dist = kind === 'little' ? 1e6 : (def.floats._EmissionEffectiveDistance || 35);
    const m = new T.MeshBasicMaterial({ map: alb });
    const um = { uEmis: { value: emi }, uEmisDist: { value: dist }, uEmisK: { value: strength } };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, um);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uEmis; uniform float uEmisDist; uniform float uEmisK;')
        .replace('#include <output_fragment>', `
  vec3 wpA = vDrFogW;
  vec3 litA = diffuseColor.rgb * (uDrSunCol + drEnvLights(wpA) + uDrAmb + (1.0 - drEnvMaskB(wpA.xz)) + vec3(uDrTintK, 0.0, 0.0));
  vec3 emA = clamp(drS2L(texture2D(uEmis, vUv).rgb) * (1.0 - clamp(vFogDepth / uEmisDist, 0.0, 1.0)), 0.0, 1.0) * uEmisK;
  gl_FragColor = vec4(litA, 1.0);`)
        .replace('#include <fog_fragment>', '#include <fog_fragment>\n  gl_FragColor.rgb += linearToOutputTexel(vec4(emA, 1.0)).rgb;');
    };
    m.customProgramCacheKey = () => 'drPiranha_' + kind;
    return (MATS[kind] = m);
  }
  const GEO = {};
  function geometry(kind) {
    if (GEO[kind]) return GEO[kind];
    const def = kind === 'little' ? L : M, me = def.mesh, g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(me.pos), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(me.uv), 2));
    g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(me.skinIndex), 4));
    const w = new Float32Array(me.skinWeight.length);
    for (let i = 0; i < w.length; i += 4) {
      const s = (me.skinWeight[i] + me.skinWeight[i + 1] + me.skinWeight[i + 2] + me.skinWeight[i + 3]) || 1;
      for (let k = 0; k < 4; k++) w[i + k] = me.skinWeight[i + k] / s;
    }
    g.setAttribute('skinWeight', new T.BufferAttribute(w, 4));
    g.setIndex(me.index);
    return (GEO[kind] = g);
  }
  function build(kind) {
    const def = kind === 'little' ? L : M;
    const nodes = def.bones.map((b, i) => {
      const o = def.skinBones.includes(i) ? new T.Bone() : new T.Object3D();
      o.name = b.name; o.position.fromArray(b.p); o.quaternion.fromArray(b.q); o.scale.fromArray(b.s);
      return o;
    });
    def.bones.forEach((b, i) => { if (b.parent >= 0) nodes[b.parent].add(nodes[i]); });
    const mesh = new T.SkinnedMesh(geometry(kind), material(kind));
    mesh.frustumCulled = false; mesh.name = kind === 'little' ? 'DSLittleMonster' : 'DSBigMonster';
    mesh.bind(new T.Skeleton(def.skinBones.map(i => nodes[i]), def.bindPoses.map(a => new T.Matrix4().fromArray(a))), new T.Matrix4());
    scene.add(nodes[0]); scene.add(mesh);
    return { root: nodes[0], nodes, mesh };
  }
  function dispose(o) { scene.remove(o.root); scene.remove(o.mesh); if (o.mesh.skeleton) o.mesh.skeleton.dispose(); }

  // ---------------------------------------------------------------- toán hướng (three.js: tiến tới = −z; LookRotation(hướng, up = y))
  const _e = new T.Euler(0, 0, 0, 'YXZ'), _q = new T.Quaternion(), _f = new T.Vector3(), _y = new T.Vector3(0, 1, 0);
  function lookQ(dx, dy, dz, out) {
    const h = Math.hypot(dx, dz);
    _e.set(Math.atan2(dy, h), Math.atan2(-dx, -dz), 0, 'YXZ');
    return out.setFromEuler(_e);
  }
  const forward = (q, out) => out.set(0, 0, -1).applyQuaternion(q);

  // ---------------------------------------------------------------- đất / tia nhìn (landmask như js/angler.js)
  const solid = (x, z, r) => { const W = root.DRWorld; return !!(W && W.sdf && W.landBox && W.sdf(x, z) <= r); };
  function los(ax, az, bx, bz) {
    const W = root.DRWorld, d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d));
    if (!W || !W.sdf || !W.landBox) return true;
    for (let i = 1; i < n; i++) { const k = i / n; if (W.sdf(ax + (bx - ax) * k, az + (bz - az) * k) <= 0) return false; }
    return true;
  }

  // ================================================================ CÁ NHỎ
  let uid = 0;
  function spawnLittle(sp) {
    const idx = sp.monsters.length, cfg = sp.cfgs[idx], o = build('little');
    const h = sp.homePos();
    const m = {
      id: ++uid, sp, idx, cfg, state: S.IDLE, pos: { x: sp.pos().x, y: sp.pos().y, z: sp.pos().z }, v: { x: 0, y: 0, z: 0 }, q: new T.Quaternion(), name: 'DSLittleMonster-' + idx + '-' + sp.name,
      lastLook: -Infinity, suppress: 0, isAttached: false, nextLatched: 0, vents: new Set(), touching: false, acc: 0, home: h,
      model: 'spawn', modelT: 0, swimT: Math.random() * L.clips.swim.len, o, done: false, distHome: 0, wig: 0 };
    o.root.position.set(m.pos.x, m.pos.y, m.pos.z);
    sp.monsters.push(m); littles.push(m);
    poseLittle(m);
    return m;
  }
  function despawnLittle(m, ignoreIfChasing, isBanish) {            // DSLittleMonster.Despawn (:107-118)
    if (ignoreIfChasing && m.state === S.CHASING) return;
    m.state = S.DESPAWNING; m.model = 'despawn'; m.modelT = 0;       // trigger despawn (AnyState → Despawn, 0 s) + foamParticles.Stop
    // bản gốc: if (isBanish && currentState == CHASING) PlayOneShot(scream): trạng thái vừa đặt DESPAWNING nên nhánh này không bao giờ chạy
  }
  function destroyLittle(m) {                                       // OnDespawnComplete → OnDespawn + Destroy → OnDestroy → Detach
    detach(m);
    m.done = true;
    const sp = m.sp, i = sp.monsters.indexOf(m); if (i >= 0) sp.monsters.splice(i, 1);
    const j = littles.indexOf(m); if (j >= 0) littles.splice(j, 1);
    dispose(m.o);
  }
  function attach(m) {
    if (m.isAttached) return;
    attached++; m.isAttached = true;
    sfx('detect', m.pos);
    m.nextLatched = rnd(L.latchedCallDelay[0], L.latchedCallDelay[1]);
    onMonsterAttached();                                            // GameEvents.TriggerMonsterAttachedToPlayer → DSBigMonster.OnMonsterAttachedToPlayer
  }
  function detach(m) {
    if (!m.isAttached) return;
    if (attached > 0) attached--;
    m.isAttached = false;
  }
  function sendHome(m) { m.state = S.HOME; }

  function lookForPlayer(m) {                                       // :183-209
    if (gameMode() === 'PASSIVE' || clock < m.lastLook + m.cfg.lookFrequencySec || m.suppress > 0) return;
    if (m.state !== S.IDLE && (!m.sp.d.canLosePlayerBySight || m.state !== S.CHASING)) return;
    m.lastLook = clock;
    const b = boat(), c = { x: b.x, y: b.y + CFG.colliderCenterY, z: b.z };
    let seen = false;
    if (dist3(m.home, c) < m.sp.d.maxRange) {
      const d = dist3(m.pos, c);
      // Raycast(viewDistance, layerMask Player/CollidesWithPlayer/...) trúng collider Player trước: web = tâm thuyền trong tầm, thân thuyền cách tâm ~1 m [ĐỀ XUẤT], không bị đất chặn
      seen = d - 1 <= m.cfg.viewDistance && los(m.pos.x, m.pos.z, c.x, c.z);
    }
    if (m.state === S.IDLE && seen) m.state = S.CHASING;
    else if (m.state === S.CHASING && !seen) m.state = S.IDLE;
  }
  function checkHome(m) {                                           // :161-177
    m.distHome = dist3(m.pos, m.home);
    if (m.state === S.CHASING && m.distHome > m.sp.d.maxRange) { m.state = S.HOME; m.why = 'range'; }
    else if (m.state === S.HOME && m.distHome < m.cfg.circleDistance * 2) m.state = S.IDLE;
    else if (m.state === S.IDLE && m.distHome > m.sp.d.displacedDespawnDistance) despawnLittle(m, false, false);
  }
  function smoothLookAt(m, tx, ty, tz, turn) {
    const dx = tx - m.pos.x, dy = ty - m.pos.y, dz = tz - m.pos.z;
    if (dx * dx + dy * dy + dz * dz < 1e-12) return;
    lookQ(dx, dy, dz, _q);
    m.q.slerp(_q, clamp(turn * FIXED, 0, 1));
  }
  function turnToTarget(m) {                                        // :255-266
    if (m.state === S.CHASING) {
      const b = boat();
      smoothLookAt(m, b.x, b.y + CFG.attachPointY, b.z, m.cfg.turnSpeed);
    } else {                                                        // CircleObject(homeAnchor); Unity z → three −z
      const h = m.home;
      smoothLookAt(m, h.x + Math.sin(clock * m.cfg.circleSpeed) * m.cfg.circleDistance, h.y, h.z - Math.cos(clock * m.cfg.circleSpeed) * m.cfg.circleDistance, m.cfg.circleSpeed);
    }
  }
  function wiggle(m) {                                              // eulerAngles.y += sin(t·wiggleSpeed)·wiggleAmount (cộng dồn mỗi bước; Unity y dương = ngược chiều three)
    _q.setFromAxisAngle(_y, -Math.sin(clock * m.cfg.wiggleSpeed) * m.cfg.wiggleAmount * DEG);
    m.q.premultiply(_q);
  }
  function inVent(m, v) {
    const r = v.radius * Math.max(v.scale[0], v.scale[2]);
    if (Math.hypot(m.pos.x - v.pos[0], m.pos.z - v.pos[2]) > r) return false;
    return Math.abs(m.pos.y - v.pos[1]) <= v.height * v.scale[1] / 2;
  }
  function physics(m) {                                             // Rigidbody: AddForce(forward·speed) rồi PhysX tích phân, rồi va chạm
    forward(m.q, _f);
    const rb = L.rb, k = FIXED / rb.mass, damp = Math.max(0, 1 - rb.drag * FIXED);
    m.v.x = (m.v.x + _f.x * m.cfg.speed * k) * damp; m.v.y = (m.v.y + _f.y * m.cfg.speed * k) * damp; m.v.z = (m.v.z + _f.z * m.cfg.speed * k) * damp;
    const ox = m.pos.x, oz = m.pos.z;
    m.pos.x += m.v.x * FIXED; m.pos.y += m.v.y * FIXED; m.pos.z += m.v.z * FIXED;
    // OnCollisionEnter (:279-293): đất (collider không phải SafeCollider)
    const hit = solid(m.pos.x, m.pos.z, 0.2);
    if (hit) { m.pos.x = ox; m.pos.z = oz; m.v.x = m.v.z = 0; }
    if (hit && !m.touching) {
      m.why = 'land:' + m.state;
      if (m.state === S.CHASING) m.state = S.HOME;
      else if (m.state === S.HOME) despawnLittle(m, false, false);
    }
    m.touching = hit;
    // OnTriggerEnter (:229-238): vent
    for (let i = 0; i < D.vents.length; i++) {
      const v = D.vents[i], inside = v.active !== false && inVent(m, v);
      if (inside && !m.vents.has(i)) {
        m.vents.add(i);
        if (m.state === S.CHASING) sfx('scream', m.pos);
        m.why = 'vent:' + m.state; sendHome(m);
      } else if (!inside && m.vents.has(i)) m.vents.delete(i);
    }
  }
  function updateAttachment(m) {                                    // :295-306
    const b = boat();
    const ap = { x: b.x, y: b.y + CFG.attachPointY, z: b.z };
    if (gameMode() !== 'PASSIVE' && dist3(ap, m.pos) < m.sp.d.attachDistance) attach(m); else detach(m);
  }
  function fixedLittle(m) {
    if (m.sp.mother) m.home = m.sp.homePos();                          // LittleMonsterAnchor đi theo mẹ
    lookForPlayer(m); checkHome(m);
    if (m.done) return;
    turnToTarget(m); wiggle(m); physics(m); updateAttachment(m);
  }
  const _pl = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() };
  function poseLittle(m) {
    const nodes = m.o.nodes, SW = L.clips.swim;
    for (const bi of L.animList) {
      sampleBone(L, SW, m.swimT % SW.len, bi, _pl);
      const n = nodes[bi]; n.position.copy(_pl.p); n.quaternion.copy(_pl.q); n.scale.copy(_pl.s);
    }
    const RC = L.rootClips, mn = nodes[1];                          // nút Model: Spawn / Idle / Despawn của animator gốc
    const clip = RC[m.model];
    if (clip && clip.model) {
      const c = clip.model;
      if (c.p) { hermite(c.p, Math.min(m.modelT, clip.len), 3, _v); mn.position.set(_v[0], _v[1], _v[2]); }
      if (c.s) { hermite(c.s, Math.min(m.modelT, clip.len), 3, _v); mn.scale.set(_v[0], _v[1], _v[2]); }
    }
    m.o.root.position.set(m.pos.x, m.pos.y, m.pos.z); m.o.root.quaternion.copy(m.q);
    m.o.root.updateMatrixWorld(true);
  }
  function updateLittle(m, dt) {                                    // Update (:157-165) + hoạt ảnh
    if (m.suppress > 0) m.suppress -= dt;
    if (m.isAttached) {
      m.nextLatched -= dt;
      if (m.nextLatched <= 0) { sfx(['latched1', 'latched2', 'latched3'][Math.floor(Math.random() * 3)], m.pos); m.nextLatched = rnd(L.latchedCallDelay[0], L.latchedCallDelay[1]); }
    }
    m.swimT += dt; m.modelT += dt;
    if (m.model === 'spawn' && m.modelT >= RCs('spawn').len) { m.model = 'idle'; m.modelT = 0; }
    else if (m.model === 'despawn' && m.modelT >= RCs('despawn').len) { destroyLittle(m); return; }
    poseLittle(m);
  }
  const RCs = n => L.rootClips[n];

  // ---------------------------------------------------------------- spawner
  function makeSpawner(d, opt) {
    const sp = { d, name: d.name.split('/').pop(), cfgs: d.cfgs, monsters: [], lastSpawn: -Infinity, lastCheck: -Infinity, suppressed: false,
      pos: opt && opt.pos || (() => ({ x: d.pos[0], y: d.pos[1], z: d.pos[2] })), homePos: opt && opt.home || (() => ({ x: d.home[0], y: d.home[1], z: d.home[2] })), mother: !!opt };
    return sp;
  }
  function spawnerStep(sp) {                                        // DSLittleMonsterSpawner.Update (:69-92)
    const d = sp.d;
    if (clock <= sp.lastCheck + d.timeBetweenChecks || noLittles) return;
    sp.lastCheck = clock;
    const b = boat(), p = sp.pos(), n = dist3(p, b);
    if (!banish && n < d.spawnDistance && sp.monsters.length < sp.cfgs.length && clock > sp.lastSpawn + d.timeBetweenSpawns) { sp.lastSpawn = clock; spawnLittle(sp); }
    else if (n > d.despawnDistance && sp.monsters.length > 0) for (const m of sp.monsters.slice()) if (m.state !== S.DESPAWNING) despawnLittle(m, true, false);
  }
  function dismissAndSuppress(sec) {                                // GameEvents.OnDismissAndSuppressDSLittleMonsters
    for (const m of littles) if (m.state !== S.DESPAWNING) { sendHome(m); m.suppress = sec; }
  }
  function onBanish(on) {
    banish = !!on;
    if (on) for (const m of littles.slice()) if (m.state !== S.DESPAWNING) despawnLittle(m, false, true);
    if (on && mother && mother.mode === 'CHASING') { if (root.DR) DR.emit('threatBanished', { source: 'DSBigMonster' }); returnToPath(); }
  }

  // ================================================================ NAVMESH DS_Large (bitmap 1 m) + A*
  const NV = D.nav;
  let grid = null;
  function loadNav() {
    const BASE = (document.currentScript && document.currentScript.src || '').replace(/js\/piranha\.js.*$/, '');
    const REV = ((document.currentScript && document.currentScript.src || '').match(/[?&]v=([^&]+)/) || [])[1] || '';
    return fetch(BASE + NV.png + (REV ? '?v=' + REV : '')).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then(b => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
      .then(bmp => {
        const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0);
        const d = x.getImageData(0, 0, bmp.width, bmp.height).data, g = new Uint8Array(bmp.width * bmp.height);
        for (let i = 0; i < g.length; i++) g[i] = d[i * 4] > 127 ? 1 : 0;
        grid = g; navReady = true;
      }).catch(e => { console.warn('[piranha] không nạp được navmask-ds:', e && e.message || e); });
  }
  const cellOf = (x, z) => { const i = Math.floor((x - NV.x0) / NV.res), j = Math.floor((z - NV.z0) / NV.res); return (i < 0 || j < 0 || i >= NV.cols || j >= NV.rows) ? -1 : j * NV.cols + i; };
  const walk = (x, z) => { const k = cellOf(x, z); return k >= 0 && grid && grid[k] === 1; };
  function sampleNav(x, z, r) {                                      // NavMesh.SamplePosition
    if (walk(x, z)) return { x, z };
    let best = null, bd = Infinity;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const d = dx * dx + dz * dz; if (d < bd && walk(x + dx, z + dz)) { bd = d; best = { x: x + dx, z: z + dz }; } }
    return best;
  }
  function lineWalkable(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.5));
    for (let i = 1; i <= n; i++) { const k = i / n; if (!walk(ax + (bx - ax) * k, az + (bz - az) * k)) return false; }
    return true;
  }
  function astar(a, b) {                                             // lưới 1 m, 8 hướng, rồi kéo thẳng; null nếu không có đường
    const s = sampleNav(a.x, a.z, 6), g = sampleNav(b.x, b.z, 6);
    if (!s || !g) return null;
    const W = NV.cols, N = W * NV.rows, si = cellOf(s.x, s.z), gi = cellOf(g.x, g.z);
    const gx = gi % W, gz = (gi / W) | 0;
    const gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [], push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
    const h = k => { const dx = Math.abs((k % W) - gx), dz = Math.abs(((k / W) | 0) - gz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    gs[si] = 0; push(si, h(si));
    let found = false, guard = 0;
    while (heap.length && guard++ < 400000) {
      const k = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === gi) { found = true; break; }
      const kx = k % W, kz = (k / W) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = kx + dx, nz = kz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= NV.rows) continue;
        const nk = nz * W + nx;
        if (!grid[nk] || closed[nk]) continue;
        if (dx && dz && (!grid[kz * W + nx] || !grid[nz * W + kx])) continue;          // không cắt góc
        const ng = gs[k] + (dx && dz ? 1.414 : 1);
        if (ng < gs[nk]) { gs[nk] = ng; came[nk] = k; push(nk, ng + h(nk)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = gi; k !== -1; k = came[k]) cells.push({ x: NV.x0 + (k % W) + 0.5, z: NV.z0 + ((k / W) | 0) + 0.5 });
    cells.reverse();
    cells[0] = { x: s.x, z: s.z }; cells[cells.length - 1] = { x: g.x, z: g.z };
    const out = [cells[0]];
    let i = 0;
    while (i < cells.length - 1) {                                     // kéo thẳng: điểm xa nhất còn nhìn thấy được
      let j = cells.length - 1;
      while (j > i + 1 && !lineWalkable(cells[i].x, cells[i].z, cells[j].x, cells[j].z)) j--;
      out.push(cells[j]); i = j;
    }
    return out;
  }

  // ================================================================ MẸ KHÔNG MẮT
  function spawnMother(at) {
    if (mother || !navReady) return null;
    const o = build('mother'), A = M.agent;
    const p0 = sampleNav(at.x, at.z, 20) || at;
    mother = { o, x: p0.x, z: p0.z, y: 0, yaw: 0, vx: 0, vz: 0, speed: A.speed, speedTarget: M.patrolSpeed, mode: 'NONE', corners: null, ci: 0, enabled: true, pathIdx: 0,
      route: true, lastAttack: -Infinity, nextIdle: rnd(M.timeBetweenIdleCalls[0], M.timeBetweenIdleCalls[1]), lastResponse: -Infinity, untilResponse: Infinity, lastPath: -Infinity,
      prox: 0, proxT: Infinity, attackT: -1, w: 0, idleT: 0, hitDone: false, detecting: false, started: false, loop: null, call: null, sp: null, t: 0, pitch: 1 };
    // Init(routeConfig): SetDestination(route[0]); mother.route → SimplePathFollow đang tắt cho tới ReturnToPath
    mother.sp = makeSpawner(Object.assign({ name: 'Mother' }, M.spawner), { pos: () => spawnerPos(), home: () => homePos() });
    mother.o.root.position.set(mother.x, mother.y, mother.z);
    posMother();
    if (root.DRAudio) mother.loop = DRAudio.voice(AK.proximity, { loop: true, pos: { x: mother.x, y: mother.y, z: mother.z }, min: M.audio.proximity.min, max: M.audio.proximity.max });
    return mother;
  }
  const _lv = new T.Vector3();
  function localToWorld(arr) { _lv.set(arr[0], arr[1], arr[2]); mother.o.root.updateMatrixWorld(true); return mother.o.root.localToWorld(_lv.clone()); }
  const SPN = M.bones.findIndex(b => b.name === 'DSMotherMonsterSpawner');
  const spawnerPos = () => { const p = localToWorld(M.bones[SPN].p); return { x: p.x, y: p.y, z: p.z }; };
  const homePos = () => { const p = localToWorld(M.spawner.homeLocal); return { x: p.x, y: p.y, z: p.z }; };
  function killMother() {
    if (!mother) return;
    for (const m of mother.sp.monsters.slice()) destroyLittle(m);
    if (mother.loop) mother.loop.stop(0.05);
    dispose(mother.o); mother = null;
  }
  function setPath(x, z) {                                           // NavMeshAgent.SetDestination
    const p = astar({ x: mother.x, z: mother.z }, { x, z });
    mother.corners = p; mother.ci = p ? 1 : 0;
    return !!p;
  }
  function returnToPath() {                                          // DSBigMonster.ReturnToPath (:313-319) + SimplePathFollow.MoveToClosestPathPoint
    mother.chase = false; mother.route = true;
    mother.mode = 'PATROLLING'; mother.speedTarget = M.patrolSpeed;
    if (!mother.enabled) return;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < D.route.length; i++) { const d = Math.hypot(mother.x - D.route[i][0], mother.z - D.route[i][2]); if (d < bd) { bd = d; bi = i; } }
    mother.pathIdx = bi; setPath(D.route[bi][0], D.route[bi][2]);
  }
  function beginChasing() {                                          // :321-329
    const b = boat();
    if (Math.hypot(b.x - D.manager.anchor[0], b.y - D.manager.anchor[1], b.z - D.manager.anchor[2]) < D.manager.deaggroRange) {
      mother.route = false; mother.chase = true; mother.mode = 'CHASING'; mother.speedTarget = M.chaseSpeed; mother.lastPath = -Infinity;
    }
  }
  function onMonsterAttached() {                                     // :158-164
    if (mother && clock > mother.lastResponse + M.timeBetweenResponseCalls && mother.untilResponse > 1.5) mother.untilResponse = 1.5;
  }
  function mcall(key) {
    const rate = rnd(M.audioPitch[0], M.audioPitch[1]);
    sfx(key, { x: mother.x, y: mother.y, z: mother.z }, { rate, min: (M.audio.callRange || { min: 15 }).min, max: (M.audio.callRange || { max: 300 }).max });
  }
  function agentStep(dt) {                                           // NavMeshAgent: tiến theo các góc, gia tốc, quay angularSpeed
    const A = M.agent;
    let dx = 0, dz = 0, want = 0;
    if (mother.enabled && mother.corners && mother.ci < mother.corners.length) {
      let c = mother.corners[mother.ci], d = Math.hypot(c.x - mother.x, c.z - mother.z);
      while (d < 0.5 && mother.ci < mother.corners.length - 1) { mother.ci++; c = mother.corners[mother.ci]; d = Math.hypot(c.x - mother.x, c.z - mother.z); }
      if (d >= 0.05) { dx = (c.x - mother.x) / d; dz = (c.z - mother.z) / d; want = mother.speed; }
    }
    if (!mother.enabled) { mother.vx = mother.vz = 0; return; }
    const tx = dx * want - mother.vx, tz = dz * want - mother.vz, tl = Math.hypot(tx, tz), mx = A.acceleration * dt;
    if (tl > mx) { mother.vx += tx / tl * mx; mother.vz += tz / tl * mx; } else { mother.vx += tx; mother.vz += tz; }
    const sp = Math.hypot(mother.vx, mother.vz);
    if (sp > mother.speed && sp > 0) { mother.vx *= mother.speed / sp; mother.vz *= mother.speed / sp; }
    mother.x += mother.vx * dt; mother.z += mother.vz * dt;
    if (sp > 0.05) {
      const goal = Math.atan2(-mother.vx, -mother.vz);
      let d = goal - mother.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const st = A.angularSpeed * DEG * dt;
      mother.yaw += clamp(d, -st, st);
    }
  }
  const BL = D.mother.bones, ATK = M.clips.attack, IDL = M.clips.idle;
  const _m1 = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() }, _m2 = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() };
  function posMother() {
    const o = mother.o, w = mother.w;
    for (const bi of M.animList) {
      sampleBone(M, IDL, mother.idleT % IDL.len, bi, _m1);
      if (w > 0 && mother.attackT >= 0) { sampleBone(M, ATK, Math.min(mother.attackT, ATK.len), bi, _m2); _m1.p.lerp(_m2.p, w); _m1.q.slerp(_m2.q, w); _m1.s.lerp(_m2.s, w); }
      const n = o.nodes[bi]; n.position.copy(_m1.p); n.quaternion.copy(_m1.q); n.scale.copy(_m1.s);
    }
    o.root.position.set(mother.x, mother.y, mother.z);
    o.root.rotation.set(0, mother.yaw, 0);
    o.root.updateMatrixWorld(true);
  }
  // DamageCollider: bật theo đường cong m_IsActive của clip (Attack: 1 trong 0 → 1,5 s, SwimIdle: 0)
  const DC = M.bones.findIndex(b => b.name === 'DamageCollider'), DCC = M.colliders.find(c => c.node === 'DamageCollider');
  function damageActive() {
    if (!mother || mother.attackT < 0) return false;
    const f = ATK.floats[DC];
    return f ? stepVal(f.keys, mother.attackT) > 0 : false;
  }
  const PC = (root.DR_BOAT && DR_BOAT.colliderSize && DR_BOAT.colliderSize.player) || { center: [0, 0.376, 0], size: [1.216, 0.648, 2.529] };
  const _pa = new T.Vector3(), _inv = new T.Matrix4();
  function sphereHitsBoat(c, r) {                                    // cầu với hộp bao thân thuyền (hệ cục bộ của thuyền)
    const bob = root.DRBoat && DRBoat.bob;
    if (!bob) { const b = boat(); return Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z) <= r + 1; }
    bob.updateWorldMatrix(true, false);
    _inv.copy(bob.matrixWorld).invert();
    _pa.copy(c).applyMatrix4(_inv);
    const ce = PC.center, h = PC.size;
    const dx = Math.max(Math.abs(_pa.x - ce[0]) - h[0] / 2, 0), dy = Math.max(Math.abs(_pa.y - ce[1]) - h[1] / 2, 0), dz = Math.max(Math.abs(_pa.z + ce[2]) - h[2] / 2, 0);
    return Math.hypot(dx, dy, dz) <= r;
  }
  function tryAttack() {                                             // TryDoAttack (:176-183) + DoAttack
    const b = boat(), ct = { x: b.x, y: b.y + CFG.colliderCenterY, z: b.z };
    const d = Math.hypot(ct.x - mother.x, ct.y - mother.y, ct.z - mother.z);
    if (d <= M.attackDistanceThreshold && los(mother.x, mother.z, ct.x, ct.z)) doAttack();
  }
  function doAttack() {
    mother.lastAttack = clock; mother.attackT = 0; mother.w = 0; mother.hitDone = false; mother.evLungeStart = mother.evAttackComplete = false; mother.detecting = true; mother.lunged = false; mother.attacks = (mother.attacks || 0) + 1;
  }
  function onPlayerHit() {                                           // OnPlayerHit (:196-213)
    mother.hitDone = true; mother.detecting = false;
    mcall('attack');
    mother.enabled = false; mother.vx = mother.vz = 0;               // navMeshAgent.enabled = false cho tới AttackComplete
    let n = M.damagePoints;
    if (gameMode() === 'NIGHTMARE') n++;
    mother.lastHit = { points: n, t: clock };
    if (M.instaKill) { if (root.DR) DR.emit('death'); return; }
    if (root.DRBoat && DRBoat.monsterHit) DRBoat.monsterHit(n, { requireOneHealth: false, source: 'DSBigMonster' });   // GridManager.AddDamageToInventory(n)
  }
  function attackStep(dt) {
    mother.attackT += dt;
    mother.w = Math.min(1, mother.attackT / 0.25);                   // Idle → DS_Attack: hoà 0,25 s (cố định), clip Attack chạy từ 0
    for (const e of ATK.events) {
      if (!mother['ev' + e.fn] && mother.attackT >= e.t) {
        mother['ev' + e.fn] = true;
        if (e.fn === 'LungeStart') dismissAndSuppress(M.littleMonsterSuppressionDuration);
        else if (e.fn === 'AttackComplete') {
          mother.lastAttack = clock; mother.enabled = true; returnToPath(); mother.detecting = false;
        }
      }
    }
    if (mother.detecting && !mother.hitDone && damageActive()) {
      mother.o.nodes[DC].updateWorldMatrix(true, false);
      const c = new T.Vector3(DCC.center[0], DCC.center[1], DCC.center[2]).applyMatrix4(mother.o.nodes[DC].matrixWorld);
      if (sphereHitsBoat(c, DCC.radius)) onPlayerHit();
    }
    if (mother.attackT >= ATK.len) {                                 // hết clip: DS_Attack → Idle (exit time 1, 0 s)
      mother.attackT = -1; mother.w = 0; mother.evLungeStart = mother.evAttackComplete = false;
      if (mother.detecting) { mother.detecting = false; }
    }
  }
  function updateMother(dt) {
    const m = mother, b = boat(), A = M.agent;
    m.t += dt; m.idleT += dt;
    if (!m.started) { m.started = true; setPath(D.route[0][0], D.route[0][2]); returnToPath(); }
    // âm thanh gọi
    m.untilResponse -= dt;
    if (m.untilResponse <= 0) { m.untilResponse = Infinity; m.lastResponse = clock; mcall('response'); }
    if (m.mode === 'PATROLLING' || m.mode === 'CHASING') {
      m.nextIdle -= dt;
      if (m.nextIdle < 0 && clock > m.lastResponse + M.timeBetweenResponseCalls) { m.nextIdle = rnd(M.timeBetweenIdleCalls[0], M.timeBetweenIdleCalls[1]); mcall('idle'); }
    }
    m.proxT += dt;
    if (m.proxT > M.proximityUpdateSec) { m.proxT = 0; m.prox = Math.hypot(m.x - b.x, m.y - b.y, m.z - b.z); }
    // Update :215-263
    if (!banish && m.mode === 'CHASING' && clock > m.lastAttack + M.attackDelay && Math.hypot(m.x - b.x, m.y - b.y, m.z - b.z) < M.attackDistanceThreshold && m.attackT < 0) tryAttack();
    if (m.mode === 'NONE') returnToPath();
    else if (!banish && m.mode === 'PATROLLING' && attached > 0 && m.prox < M.playerDetectionThreshold && clock > m.lastAttack + M.attackDelay) beginChasing();
    else if (m.mode === 'CHASING' && attached <= 0) returnToPath();
    m.speed = m.speed + (m.speedTarget - m.speed) * clamp(dt, 0, 1);   // Mathf.Lerp(speed, target, Time.deltaTime)
    // SimplePathFollow.Update: tới điểm (< 2 m) thì sang điểm kế (vòng lặp)
    if (m.route && m.enabled) {
      const r = D.route[m.pathIdx];
      if (Math.hypot(m.x - r[0], m.z - r[2]) < M.pathFollow.waypointDistanceThreshold) { m.pathIdx = (m.pathIdx + 1) % D.route.length; setPath(D.route[m.pathIdx][0], D.route[m.pathIdx][2]); }
    }
    // TargetFollow.Update: 0,25 s một lần tìm đường tới thuyền (+ vượt quá tối đa 4 m); không tìm được → OnPathError → về đường tuần tra
    if (m.chase && m.enabled && clock > m.lastPath + M.targetFollow.refreshSec) {
      const tf = M.targetFollow, d0 = Math.hypot(b.x - m.x, b.z - m.z);
      if (d0 >= tf.pathLockThreshold) {
        let ok = false;
        for (let num = 4; num >= 0 && !ok; num--) {
          const dx = (b.x - m.x) / d0, dz = (b.z - m.z) / d0, tx = b.x + dx * num, tz = b.z + dz * num;
          if (walk(tx, tz) && setPath(tx, tz)) ok = true;
        }
        if (ok) m.lastPath = clock; else returnToPath();
      }
    }
    // bước tác tử + hoạt ảnh
    const nSteps = Math.max(1, Math.round(dt / FIXED));
    for (let i = 0; i < nSteps; i++) agentStep(dt / nSteps);
    if (m.attackT >= 0) attackStep(dt);
    posMother();
    if (m.loop) m.loop.pos(m.x, m.y, m.z);
    // spawner riêng của mẹ
    spawnerStep(m.sp);
  }

  // ================================================================ MANAGER + VÒNG CHẠY
  function managerStep() {                                           // DSMonsterManager.Update (:56-69)
    const g = D.manager;
    if (clock <= mgrCheck + g.timeBetweenSpawnChecks) return;
    mgrCheck = clock;
    const b = boat();
    const dm = Math.hypot(b.x - g.pos[0], b.y - g.pos[1], b.z - g.pos[2]);
    if (!mother && dm < g.spawnRange && !suppress) spawnMother({ x: g.pos[0], z: g.pos[2] });
    else if (mother && Math.hypot(b.x - mother.x, b.y - mother.y, b.z - mother.z) > g.despawnRange) killMother();
  }
  let suppress = false, frozen = false, noLittles = false;   // frozen: chỉ cho kiểm thử (khung thật không chạy mô phỏng, simulate() chạy tất định)
  let acc = 0;
  function tick(dt) {
    if (!scene || dt <= 0) return;
    const mode = gameMode();
    if (mode !== lastMode) { // OnGameModeChanged: PASSIVE → cá đang đuổi về nhà
      if (mode === 'PASSIVE') for (const m of littles) if (m.state === S.CHASING) m.state = S.HOME;
      lastMode = mode;
    }
    clock += dt;
    managerStep();
    for (const sp of spawners) spawnerStep(sp);
    acc += dt;
    let n = 0;
    while (acc >= FIXED && n++ < 25) { acc -= FIXED; fixedAll(); }
    if (acc > FIXED) acc = 0;
    for (const m of littles.slice()) if (!m.done) updateLittle(m, dt);
    if (mother) updateMother(dt);
  }
  function fixedAll() { for (const m of littles.slice()) if (!m.done) fixedLittle(m); }
  function update(dt) {
    if (!scene) return;
    const Dr = root.DR;
    if (!Dr || !Dr.s || Dr.mode === 'title') return;
    if (!live() || frozen) return;
    tick(dt);
  }
  function clearAll() {
    for (const m of littles.slice()) destroyLittle(m);
    killMother();
    attached = 0;
  }
  function init(sc) {
    scene = sc;
    if (!spawners.length) for (const d of D.spawners) if (d.active !== false) spawners.push(makeSpawner(d));
    if (root.DR) {
      DR.on('banish', onBanish);
      DR.on('mode', m => { if (m === 'dock' || m === 'title' || m === 'over') clearAll(); });
    }
    loadNav();
  }
  function finish() { clearAll(); }

  // ---------------------------------------------------------------- móc kiểm thử
  const debug = {
    state() {
      return { attached, factor: speedFactor(), clock, banish, littles: littles.map(m => ({ id: m.id, sp: m.sp.name, idx: m.idx, state: m.state, x: m.pos.x, y: m.pos.y, z: m.pos.z, attached: m.isAttached,
        why: m.why, model: m.model, speed: Math.hypot(m.v.x, m.v.y, m.v.z), suppress: m.suppress, speedCfg: m.cfg.speed })), mother: mother && {
        x: mother.x, y: mother.y, z: mother.z, yaw: mother.yaw, mode: mother.mode, speed: mother.speed, speedTarget: mother.speedTarget, attackT: mother.attackT, enabled: mother.enabled,
        lastAttack: mother.lastAttack, prox: mother.prox, pathIdx: mother.pathIdx, hit: mother.hitDone, lastHit: mother.lastHit, attacks: mother.attacks || 0, little: mother.sp.monsters.length,
        corners: mother.corners ? mother.corners.length : 0, damageActive: damageActive() }, navReady, spawners: spawners.length };
    },
    simulate(sec) {                                                  // chạy tất định, bỏ qua kiểm tra chế độ
      const n = Math.round(sec / FIXED);
      for (let i = 0; i < n; i++) tick(FIXED);
      return true;
    },
    place(i, p) { const m = littles[i]; if (!m) return false; if (p.x != null) m.pos.x = p.x; if (p.y != null) m.pos.y = p.y; if (p.z != null) m.pos.z = p.z; m.v.x = m.v.y = m.v.z = 0; return true; },
    setState(i, s) { if (littles[i]) littles[i].state = s; return !!littles[i]; },
    spawners: () => spawners.map(s => ({ name: s.name, n: s.monsters.length, cfgs: s.cfgs.length, pos: s.pos(), home: s.homePos() })),
    spawnMother(at) { suppress = false; return !!spawnMother(at || { x: D.manager.pos[0], z: D.manager.pos[2] }); },
    placeMother(p) { if (!mother) return false; mother.x = p.x; mother.z = p.z; if (p.yaw != null) mother.yaw = p.yaw; posMother(); return true; },
    killMother, clearAll, clearLittles() { for (const m of littles.slice()) destroyLittle(m); attached = 0; }, setSuppress(v) { suppress = !!v; },
    setMotherState(s) { if (!mother) return false; if (s === 'chase') beginChasing(); else if (s === 'patrol') returnToPath(); return true; },
    forceAttack() { if (mother && mother.attackT < 0) { doAttack(); return true; } return false; },
    setAttached(n) { attached = n; },
    astar, walk, sampleNav, solid,
    get nav() { return NV; }, get motherObj() { return mother; }, get littleObjs() { return littles; },
    freeze(on) { frozen = !!on; }, noLittles(on) { noLittles = !!on; }, freeClock(v) { clock = v; }
  };
  root.DRPiranha = { init, update, finish, speedFactor, moveSpeed, get attached() { return attached; }, debug, data: D };
})(window);
