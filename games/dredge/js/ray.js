/*
 * Cá đuối quái MonsterRayFollow / MonsterRayAttack1 / MonsterRayAttack2 (MonsterRayWorldEvent.cs, MONSTERS.md §2.10; đơn vị U9).
 * Dữ liệu: data/ray.js (tools/ray.py: xương `monsterray` + mesh polySurface62 có trọng số xương, ba clip rayswim / rayattack / raytailswipe,
 * ba CapsuleCollider, SanityModifier, vật liệu MonsterRay_Mat). Lịch bốc thăm: js/events.js (DREvents): ba sự kiện cùng tên prefab
 * (minWorldPhase 2, 2, 3; sanity 0,5–0,75 / ≤ 0,5 / ≤ 0,25; Xua đuổi dập tắt; sinh ở thuyền + (25, 0, 25)).
 *
 * MonsterRayWorldEvent.cs (số ở prefab, data/ray.js `params`): sinh tan vào _DissolveAmount 1 → 0 trong spawnDurationSec 3 (DOTween ease mặc định
 *   OutQuad, DOTweenSettings defaultEaseType 6) → FOLLOWING. Mỗi khung (Update, :185-246):
 *     num = khoảng cách gốc cá đuối ↔ thuyền; FOLLOWING: num < attackRange thì timeWithinAttackRange += dt, ngược lại về 0; timeSpentFollowing += dt;
 *       > maxFollowDurationSec 15 → Despawn; elif chưa trúng && timeWithinAttackRange ≥ timeUntilAttack 0,1 && Time > timeOfLastAttack + 3 && loại cắn/quật
 *       → DoAttack; elif đã trúng && Time > timeOfPlayerHit + despawnDelay 1,5 → Despawn; elif timeWithinAttackRange > 0,1 && loại SHADOW → Despawn.
 *     (Cú trúng xảy ra giữa lúc ATTACKING nên Despawn kiểu "sau 1,5 s" chỉ chạy khi hoạt ảnh tấn công xong và trở về FOLLOWING: ≥ 3 s sau DoAttack.)
 *     Tốc độ NavMeshAgent = Lerp(lerped, moveSpeedScalar 0,15 · clamp(moveSpeed 5 · moveMod, 20, 65), dt), khởi đầu 5; DESPAWNING thì 0.
 *     num > stoppingDistance 2 và đã qua 0,35 s từ lần đặt đích trước: SetDestination(thuyền); đường không Complete → Despawn; thuyền nằm trong
 *       vùng an toàn (DoesHitSafeZone) → Despawn; model xoay Slerp(rot, LookRotation(model.position − prevPos), dt · rotationSpeed 2).
 *   DoAttack: cắn (Attack1) 1 điểm trigger `bite-attack`; quật (Attack2) 2 điểm trigger `tail-attack` (damagePoints đặt lúc DoAttack, :248-268).
 *   Hoạt ảnh: Swim Loop ⇄ Bite/Tail Attack (chuyển 0,25 s; về Swim khi hết clip); sự kiện AnimationComplete ở giây 3 → timeWithinAttackRange = 0,
 *   timeOfLastAttack = Time, FOLLOWING. Collider chỉ bật theo đường cong m_IsActive: JawCollider 0,333–1,333 s (cắn), TailCollider + TailJoinCollider
 *   0,433–2 s (quật). VariablePlayerDamager (oneHitOnly, requireOneHealthToKill, KHÔNG có thời gian miễn) → DRBoat.monsterHit; OnPlayerHit: tiếng
 *   Marrow Monster - Attack, hasHitPlayer, BoatDamageFX.
 *   RequestEventFinish (một lần): tắt SanityModifier, tiếng bơi + hoảng loạn tắt dần despawnDurationSec 3, tiếng tan, _DissolveAmount → 1 trong 3 s,
 *   xong thì EventFinished + huỷ. Neo bến / Xua đuổi (dispelByBanish) / còi: DREvents gọi requestFinish.
 *
 * NavMesh: agent type 658490984 = RayNavMeshSurface (vùng nông) → DRNav 'ray'. SetDestination lấy điểm navmesh gần đích trong bán kính
 * [ĐỀ XUẤT] 2 × agent radius 2,5 = 5 m (Unity dùng khoảng tìm theo bán kính agent); không có điểm hoặc không có đường trọn vẹn → đường không Complete.
 * Agent đặt lúc sinh: gần nhất trong 5 m [ĐỀ XUẤT]; không có thì lần đặt đích đầu tiên báo hỏng đường và Despawn ngay. Agent tăng tốc 5 m/s², dừng
 * khi còn ≤ stoppingDistance 2 m tới cuối đường.
 *
 * Vật liệu (Shader Graphs/MonsterRay_Shader, DXBC rã bằng tools/particles.py --dis → D:/dredge-ref/cache/ray/MonsterRay_Shader.txt): Albedo × ánh sáng
 * của thế giới + phát sáng = GlowMask cuộn UV (SpeedX, SpeedY) × nhiễu giá trị 3 tầng (hệ số 0,125 / 0,25 / 0,5 ở tỉ lệ ×1, ×½, ×¼) × GlowColour ×
 * GlowStrength; tan = ngưỡng theo độ cao thế giới lerp(DissolveBottom 3,3, DissolveTop 0,2, amount) + y, kẹp 0..2, so với ma trận Bayer 4×4 theo
 * pixel màn hình, bỏ điểm ảnh khi ngưỡng − Bayer < 0,5. [ĐỀ XUẤT] thứ tự (Bottom, Amount, Top) trong cbuffer suy từ hai đầu: amount 0 thấy hết thân
 * (y ≥ −1,9), amount 1 không thấy gì (thân y ≤ 0,3); ánh sáng dùng công thức chung drEnvLights (không chép toon của đồ thị); phát sáng chặn ở 1,2
 * vì web không có bloom HDR (GlowStrength 24,6).
 *
 *   DRRay.debug → { force(type 'Follow'|'Attack1'|'Attack2'), state(), active, mesh, setBoat... } ; DRRay.finish()
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_RAY, EV = root.DR_WORLDEVENTS;
  if (!T || !D || !D.bones || !EV) { root.DRRay = null; return; }
  const NAMES = { MonsterRayFollow: 'Follow', MonsterRayAttack1: 'Attack1', MonsterRayAttack2: 'Attack2' };
  const P = D.params, AG = D.agent, TR = D.transitions;
  const CLIPS = D.clips;
  let mat0 = null, inst = null, texes = null;

  const outQuad = t => 1 - (1 - t) * (1 - t);
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const S = () => root.DR.s;

  // ---------------------------------------------------------------- dữ liệu mesh (khối nhị phân base64 của tools/ray.py pack_mesh)
  let geoData = null;
  function decodeMesh() {
    if (geoData) return geoData;
    const M = D.mesh, bin = atob(M.b64), n = M.n, tr = M.tris * 3;
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    let o = 0;
    const u16 = (cnt) => { const a = new Uint16Array(u8.buffer.slice(o, o + cnt * 2)); o += cnt * 2; return a; };
    const pq = u16(n * 3), nq = new Int8Array(u8.buffer.slice(o, o + n * 3)); o += n * 3;
    if (o & 1) o++;
    const uq = u16(n * 2), si = u8.slice(o, o + n * 4); o += n * 4;
    const sw = u8.slice(o, o + n * 4); o += n * 4;
    if (o & 1) o++;
    const ix = u16(tr);
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), w = new Float32Array(n * 4);
    for (let i = 0; i < n * 3; i++) { const a = i % 3; pos[i] = M.pmin[a] + pq[i] / 65535 * (M.pmax[a] - M.pmin[a]); nrm[i] = nq[i] / 127; }
    for (let i = 0; i < n * 2; i++) { const a = i % 2; uv[i] = M.umin[a] + uq[i] / 65535 * (M.umax[a] - M.umin[a]); }
    for (let v = 0; v < n; v++) {
      let s = 0; for (let k = 0; k < 4; k++) s += sw[v * 4 + k];
      for (let k = 0; k < 4; k++) w[v * 4 + k] = s > 0 ? sw[v * 4 + k] / s : (k === 0 ? 1 : 0);
    }
    geoData = { pos, nrm, uv, w, si: new Uint16Array(si), ix };
    return geoData;
  }

  // ---------------------------------------------------------------- hoạt ảnh (Hermite theo từng thành phần như AnimationCurve, chép từ js/tentacle.js)
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
    const rest = D.bones[bone], c = clip.byBone[bone];
    out.p.set(rest.p[0], rest.p[1], rest.p[2]); out.q.set(rest.q[0], rest.q[1], rest.q[2], rest.q[3]); out.s.set(rest.s[0], rest.s[1], rest.s[2]);
    if (!c) return out;
    if (c.p) { hermite(c.p, t, 3, _v); out.p.set(_v[0], _v[1], _v[2]); }
    if (c.q) { hermite(c.q, t, 4, _v); out.q.set(_v[0], _v[1], _v[2], _v[3]).normalize(); }
    if (c.s) { hermite(c.s, t, 3, _v); out.s.set(_v[0], _v[1], _v[2]); }
    return out;
  }
  for (const k in CLIPS) {
    const clip = CLIPS[k]; clip.byBone = {};
    for (const nm in clip.curves) for (const kind in clip.curves[nm]) {
      const cv = clip.curves[nm][kind];
      (clip.byBone[cv.bone] = clip.byBone[cv.bone] || {})[kind] = cv.keys;
    }
  }
  const stepAt = (keys, t) => { let v = keys[0][1]; for (const k of keys) { if (k[0] <= t) v = k[1]; else break; } return v; };   // đường cong m_IsActive hằng từng đoạn
  const clipTime = (clip, t) => (clip.loop ? t % clip.len : Math.min(t, clip.len));
  const _pa = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() }, _pb = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() };

  // Animator của MonsterRay_Controller: Swim Loop → (trigger bite-attack | tail-attack, 0,25 s, không có exit time) → Bite/Tail Attack → (ExitTime 1,
  // 0,25 s) → Swim Loop. Cả hai clip cùng chạy trong lúc chuyển; vị trí / xoay / m_IsActive trộn tuyến tính theo trọng số.
  function newAnim() { return { cur: { clip: 'swim', t: 0 }, prev: null, blend: 0, dur: 0, left: false }; }
  function animTrigger(A, kind) {
    if (A.cur.clip !== 'swim') return false;
    A.prev = { clip: 'swim', t: A.cur.t }; A.cur = { clip: kind, t: 0 }; A.blend = 0; A.dur = TR.toAttack; A.left = false;
    return true;
  }
  function animTick(A, dt, onEvent) {
    const adv = (L) => {
      const c = CLIPS[L.clip], t0 = L.t; L.t += dt;
      for (const e of c.events) if (e.t > t0 && e.t <= L.t) onEvent(e.fn, L.clip);   // sự kiện hoạt ảnh (AnimationComplete) theo thứ tự thời gian
      if (c.loop) L.t %= c.len;
    };
    adv(A.cur); if (A.prev) adv(A.prev);
    if (A.prev) { A.blend += dt; if (A.blend >= A.dur) A.prev = null; }
    if (A.cur.clip !== 'swim' && !A.left && A.cur.t >= CLIPS[A.cur.clip].len) {   // ExitTime 1 → về Swim Loop (bắt đầu từ 0)
      A.prev = { clip: A.cur.clip, t: A.cur.t }; A.cur = { clip: 'swim', t: 0 }; A.blend = 0; A.dur = TR.toSwim; A.left = true;
    }
  }
  const animWeight = A => (A.prev ? clamp01(A.blend / A.dur) : 1);
  function posePose(A, bone, out) {
    sample(CLIPS[A.cur.clip], clipTime(CLIPS[A.cur.clip], A.cur.t), bone, _pa);
    if (!A.prev) return out.p.copy(_pa.p), out.q.copy(_pa.q), out.s.copy(_pa.s), out;
    sample(CLIPS[A.prev.clip], clipTime(CLIPS[A.prev.clip], A.prev.t), bone, _pb);
    const w = animWeight(A);
    out.p.copy(_pb.p).lerp(_pa.p, w); out.q.copy(_pb.q).slerp(_pa.q, w); out.s.copy(_pb.s).lerp(_pa.s, w);
    return out;
  }
  function activeValue(A, name) {
    const val = (L) => { const c = CLIPS[L.clip]; const k = c.active[name]; return k ? stepAt(k, clipTime(c, L.t)) : 0; };
    const cv = val(A.cur);
    return A.prev ? val(A.prev) * (1 - animWeight(A)) + cv * animWeight(A) : cv;
  }

  // ---------------------------------------------------------------- vật liệu
  function textures() {
    if (texes) return texes;
    const ld = new T.TextureLoader(), mk = (u, srgb) => { const t = ld.load(u); t.wrapS = t.wrapT = T.RepeatWrapping; if (srgb) t.encoding = T.sRGBEncoding; return t; };
    texes = { albedo: mk(D.tex.albedo, true), glow: mk(D.tex.glow, false) };
    return texes;
  }
  const PR = D.mat.props;
  const SEE_THROUGH = 1.0;   // [ĐỀ XUẤT] m: độ sâu làm vật dưới nước còn 1/e; = _Depth mặc định của WaterController (1) như kS của Water_Shader
  function material(texAlbedo, texGlow) {
    // Mặt nước web (js/water.js) tính độ trong theo đáy địa hình, không theo vật nằm dưới (không có bộ đệm sâu) nên thân cá đuối chìm dưới mặt nước bị
    // che hết. Vẽ SAU nước, không kiểm độ sâu, mờ dần theo độ sâu: alpha = exp(−sâu / SEE_THROUGH).
    const m = new T.MeshBasicMaterial({ map: texAlbedo, transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false });
    const uni = {
      uRayGlow: { value: texGlow }, uRayTime: { value: 0 }, uRayDissolve: { value: 1 },
      uRayTop: { value: PR.dissolveTop }, uRayBottom: { value: PR.dissolveBottom },
      uRayCol: { value: new T.Vector3(D.mat.glowColour[0], D.mat.glowColour[1], D.mat.glowColour[2]) },
      uRayP: { value: new T.Vector4(PR.glowScale, PR.speedX, PR.speedY, PR.glowStrength) }, uRayNoise: { value: PR.pulseNoiseScale }, uRaySee: { value: SEE_THROUGH }
    };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D uRayGlow; uniform float uRayTime, uRayDissolve, uRayTop, uRayBottom, uRayNoise, uRaySee; uniform vec3 uRayCol; uniform vec4 uRayP;
float rayHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float rayVNoise(vec2 p) {   // Unity Shader Graph "Simple Noise": nội suy 3t²−2t³ giữa bốn hash góc ô
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rayHash(i), rayHash(i + vec2(1.0, 0.0)), u.x), mix(rayHash(i + vec2(0.0, 1.0)), rayHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float rayBayer(vec2 fc) {   // ma trận Bayer 4×4 của DXBC: chỉ số ((x&3)<<2)|(y&3), giá trị n/17
  vec2 q = mod(floor(fc), 4.0);
  vec4 r0 = vec4(1.0, 9.0, 3.0, 11.0), r1 = vec4(13.0, 5.0, 15.0, 7.0), r2 = vec4(4.0, 12.0, 2.0, 10.0), r3 = vec4(16.0, 8.0, 14.0, 6.0);
  vec4 r = q.x < 0.5 ? r0 : (q.x < 1.5 ? r1 : (q.x < 2.5 ? r2 : r3));
  float v = q.y < 0.5 ? r.x : (q.y < 1.5 ? r.y : (q.y < 2.5 ? r.z : r.w));
  return v / 17.0;
}`).replace('#include <output_fragment>', `
  vec3 wpR = vDrFogW;
  float rThr = clamp(mix(uRayBottom, uRayTop, uRayDissolve) + wpR.y, 0.0, 2.0);
  if (rThr - rayBayer(gl_FragCoord.xy) - 0.5 < 0.0) discard;
  vec3 litR = diffuseColor.rgb * (uDrSunCol * drEnvCloud(wpR) + drEnvLights(wpR) + uDrAmb + (1.0 - drEnvMaskB(wpR.xz)) + vec3(uDrTintK, 0.0, 0.0));
  vec2 uvS = vUv + uRayTime * vec2(uRayP.y, uRayP.z);
  vec2 nP = uvS * uRayNoise;
  float nz = rayVNoise(nP) * 0.125 + rayVNoise(nP * 0.5) * 0.25 + rayVNoise(nP * 0.25) * 0.5;
  vec3 emR = min(drS2L(texture2D(uRayGlow, uvS * uRayP.x).rgb) * nz * uRayCol * uRayP.w, vec3(1.2));
  gl_FragColor = vec4(litR, 1.0);`)
        .replace('#include <fog_fragment>', '#include <fog_fragment>\n  gl_FragColor.rgb += linearToOutputTexel(vec4(emR, 1.0)).rgb;');
    };
    m.customProgramCacheKey = () => 'drRay';
    m.userData.uni = uni;
    return m;
  }

  // ---------------------------------------------------------------- dựng một con
  function build(mat) {
    const nodes = D.bones.map((b, i) => {
      const o = D.skinBones.includes(i) ? new T.Bone() : new T.Object3D();
      o.name = b.name; o.position.fromArray(b.p); o.quaternion.fromArray(b.q); o.scale.fromArray(b.s);
      return o;
    });
    D.bones.forEach((b, i) => { if (b.parent >= 0) nodes[b.parent].add(nodes[i]); });
    const G = decodeMesh(), g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(G.pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(G.nrm, 3));
    g.setAttribute('uv', new T.BufferAttribute(G.uv, 2));
    g.setAttribute('skinIndex', new T.BufferAttribute(G.si, 4));
    g.setAttribute('skinWeight', new T.BufferAttribute(G.w, 4));
    g.setIndex(new T.BufferAttribute(G.ix, 1));
    const mesh = new T.SkinnedMesh(g, mat);
    mesh.frustumCulled = false; mesh.name = 'MonsterRay'; mesh.renderOrder = 2.5;   // sau nước (1) và bọt (2)
    const inv = D.bindPoses.map(a => new T.Matrix4().fromArray(a));
    // bindpose Unity = (xương → monsterray)⁻¹, không phụ thuộc chỗ đặt nút model: mesh ở gốc thế giới, bindMatrix đơn vị (như js/tentacle.js)
    mesh.bind(new T.Skeleton(D.skinBones.map(i => nodes[i]), inv), new T.Matrix4());
    return { nodes, mesh };
  }

  // ---------------------------------------------------------------- tiếng
  const snd = (key, o) => { try { return root.DRAudio && DRAudio.resolve(key) ? DRAudio.voice(key, o) : null; } catch (e) { return null; } };
  const sfx2d = key => { try { return root.DRAudio && DRAudio.resolve(key) ? DRAudio.play(key, 1) : null; } catch (e) { return null; } };
  const pickRand = list => list[Math.floor(Math.random() * list.length)];

  // ---------------------------------------------------------------- sự kiện
  const Z_OFF = D.modelLocal;                          // nút `monsterray` ở local (0, 0, −1 Unity) = (0, 0, +1 three) của gốc
  function spawn(e, ctx, key) {
    const type = D.types[key], S0 = S(), b = S0.boat;
    const sc = root.DRBoat && DRBoat.root && DRBoat.root.parent;
    if (inst || !sc) return null;
    const m = material(textures().albedo, textures().glow);
    const o = build(m);
    // Awake: agent đặt lên navmesh gần nhất (đây: bán kính 5 m [ĐỀ XUẤT]); transform gốc quay về phía thuyền, không quay nữa (updateRotation = false)
    let x = ctx.x, z = ctx.z, onNav = true;
    const nav = root.DRNav;
    if (nav && nav.ready) { const sp = nav.sample({ x, z }, 5, 'ray'); if (sp) { x = sp.x; z = sp.z; } else onNav = false; }
    const yaw0 = Math.atan2(-(b.x - x), -(b.z - z));
    const rootG = new T.Group(); rootG.name = 'MonsterRayRoot'; rootG.position.set(x, 0, z); rootG.rotation.y = yaw0;
    sc.add(rootG); sc.add(o.nodes[0]); sc.add(o.mesh);
    const off = new T.Vector3(Z_OFF[0], Z_OFF[1], Z_OFF[2]).applyAxisAngle(new T.Vector3(0, 1, 0), yaw0);
    const me = {
      key, type, e, mat: m, uni: m.userData.uni, nodes: o.nodes, mesh: o.mesh, rootG, yaw0, off,
      x, z, onNav, vel: 0, path: null, pathI: 0, yaw: yaw0, prev: { x: x + off.x, z: z + off.z },
      state: 'SPAWNING', clock: 0, lastSet: -1e9, lerpedSpeed: P.moveSpeed, tFollow: 0, tInRange: 0, tHit: 0, hasHit: false, tLastAttack: 0,
      dissolve: 1, tween: null, finishRequested: false, done: false, anim: newAnim(), listener: false, hits: 0, destroyed: false,
      swim: null, panic: null, san: null, hitFx: null, fadeT: 0, log: []
    };
    me.swim = snd('event.ray.swim', { loop: true, vol: 0, pos: { x, y: 0, z }, min: 5, max: 50, offset: 'random' });   // m_Volume 0 → DOFade(1, 1 s)
    me.panic = snd('music.insanity.4', { loop: true, vol: 1, pos: { x, y: 0, z }, min: 5, max: 50 });                  // Panic Aura: Insanity Ambience 4
    me.fadeSwim = { from: 0, to: 1, t: 0, dur: 1 }; me.swimK = 0;
    const sn = D.sanity;
    if (root.DRSky && DRSky.addSanitySource) me.san = DRSky.addSanitySource({ x, z, day: sn.day, night: sn.night, r0: sn.r0, r1: sn.r1, min: [sn.minDay, sn.minNight] });
    inst = me;
    me.tween = { from: 1, to: 0, t: 0, dur: P.spawnDurationSec, done: () => { me.state = 'FOLLOWING'; } };
    me.dissolveSnd = snd('event.ray.dissolve', { vol: 0.75, pos: { x, y: 0, z }, min: 5, max: 50 });
    place(me);
    return handleFor(me);
  }
  function handleFor(me) {
    return {
      requestFinish() { if (!me.reason) me.reason = 'event'; requestFinish(me); },
      update(dt) { update(me, dt); },
      get done() { return me.done; },
      set done(v) { if (v) destroy(me); },   // DREvents gán done = true khi update ném lỗi
      dispose() { destroy(me); }
    };
  }
  function lerpDissolve(me, to, dur, done) { me.tween = { from: me.dissolve, to, t: 0, dur, done }; }   // LerpDissolveAmount: huỷ tween cũ (không gọi done)
  function destroy(me) {
    if (me.destroyed) return;
    me.destroyed = true; me.done = true;
    const sc = me.rootG.parent;
    for (const n of [me.rootG, me.nodes[0], me.mesh]) if (n.parent) n.parent.remove(n);
    me.mesh.geometry.dispose(); me.mat.dispose();
    for (const h of [me.swim, me.panic, me.dissolveSnd, me.dissolveSnd2]) if (h && h.stop) h.stop(0.1);
    if (me.san) me.san.remove();
    if (me.hitFx && me.hitFx.stop) me.hitFx.stop();
    if (inst === me) inst = null;
    void sc;
  }
  function requestFinish(me) {   // RequestEventFinish (:… ) một lần: finishRequested
    me.state = 'DESPAWNING';
    if (me.finishRequested) return;
    me.finishRequested = true;
    if (me.san) { me.san.remove(); me.san = null; }                                  // sanityModifier.SetActive(false)
    me.fadeSwim = { from: me.swimK, to: 0, t: 0, dur: P.despawnDurationSec, panic: true };   // swimAudio / panicAudio.DOFade(0, despawnDurationSec)
    me.dissolveSnd2 = snd('event.ray.dissolve', { vol: 0.75, pos: { x: me.x, y: 0, z: me.z }, min: 5, max: 50 });
    lerpDissolve(me, 1, P.despawnDurationSec, () => destroy(me));
  }
  const despawn = (me, why) => { if (!me.reason) me.reason = why; me.state = 'DESPAWNING'; requestFinish(me); };   // Despawn()

  function place(me) {
    const n0 = me.nodes[0];
    n0.position.set(me.x + me.off.x, me.off.y, me.z + me.off.z);
    n0.rotation.set(0, me.yaw, 0);
    me.rootG.position.set(me.x, 0, me.z);
  }

  // ---------------------------------------------------------------- NavMeshAgent
  function setDestination(me, tx, tz) {
    const nav = root.DRNav;
    if (!nav || !nav.ready || !me.onNav) return false;
    const here = nav.sample({ x: me.x, z: me.z }, 5, 'ray'), to = nav.sample({ x: tx, z: tz }, 2 * AG.radius, 'ray');   // [ĐỀ XUẤT] 2 × bán kính agent
    if (!here || !to) { me.path = null; return false; }
    const p = nav.path(here, to, 'ray');
    if (!p) { me.path = null; return false; }                                       // pathStatus Invalid / Partial
    me.path = p; me.pathI = p.length > 1 ? 1 : 0;
    return true;
  }
  function agentMove(me, speed, dt) {
    const p = me.path;
    let want = speed;
    // NavMeshAgent.stoppingDistance 2: trong vòng 2 m cuối đường thì dừng; bước cuối vượt qua ngưỡng một chút nên đứng ở ~1,9–2 m [ĐỀ XUẤT]
    // (luật SHADOW "num < attackRange 2" chỉ có thể xảy ra nhờ chút lấn này)
    if (!p || !p.length || Math.hypot(p[p.length - 1].x - me.x, p[p.length - 1].z - me.z) <= AG.stoppingDistance) { want = 0; me.vel = 0; }
    const a = AG.acceleration * dt;
    me.vel = me.vel < want ? Math.min(want, me.vel + a) : Math.max(want, me.vel - a);
    let step = me.vel * dt;
    while (step > 1e-9 && p && me.pathI < p.length) {
      const q = p[me.pathI], dx = q.x - me.x, dz = q.z - me.z, d = Math.hypot(dx, dz);
      if (d <= step) { me.x = q.x; me.z = q.z; step -= d; me.pathI++; } else { me.x += dx / d * step; me.z += dz / d * step; step = 0; }
    }
  }

  // ---------------------------------------------------------------- vòng lặp (MonsterRayWorldEvent.Update)
  function update(me, dt) {
    if (me.destroyed) return;
    const Dr = root.DR, st = S(), b = st.boat;
    if (Dr.mode === 'dock' || st.dock) { if (!me.reason) me.reason = 'dock'; requestFinish(me); }                            // OnPlayerDockedToggled (DREvents cũng gọi)
    if (dt <= 0) return;
    me.clock += dt;
    // tween dissolve (DOTween OutQuad)
    if (me.tween) {
      const tw = me.tween; tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      me.dissolve = tw.from + (tw.to - tw.from) * outQuad(k);
      if (k >= 1) { me.tween = null; me.dissolve = tw.to; if (tw.done) tw.done(); if (me.destroyed) return; }
    }
    me.uni.uRayDissolve.value = me.dissolve; me.uni.uRayTime.value = (me.uni.uRayTime.value + dt);
    const num = Math.hypot(me.x - b.x, me.z - b.z), ty = me.type;
    if (me.state === 'FOLLOWING') {
      me.tInRange = num < ty.attackRange ? me.tInRange + dt : 0;
      me.tFollow += dt;
      if (me.tFollow > P.maxFollowDurationSec) despawn(me, 'follow-timeout');
      else if (!me.hasHit && me.tInRange >= P.timeUntilAttack && me.clock > me.tLastAttack + P.attackCooldownSec && (ty.type === 1 || ty.type === 2)) doAttack(me);
      else if (me.hasHit && me.clock > me.tHit + P.despawnDelay) despawn(me, 'after-hit');
      else if (me.tInRange > P.timeUntilAttack && ty.type === 0) despawn(me, 'shadow');
    }
    let speed = 0;
    if (me.state !== 'DESPAWNING') {
      const mm = (root.DRBoat && DRBoat.stats && DRBoat.stats.moveMod) || 1;
      const target = P.moveSpeedScalar * Math.max(P.boatSpeedMin, Math.min(P.boatSpeedMax, P.moveSpeed * mm));
      me.lerpedSpeed += (target - me.lerpedSpeed) * Math.min(1, dt);                // Mathf.Lerp(a, b, Time.deltaTime)
      speed = me.lerpedSpeed;
    }
    if (me.state !== 'DESPAWNING' && num > AG.stoppingDistance) {
      if (me.clock > me.lastSet + D.timeBetweenDestinationSetsSec) {
        me.lastSet = me.clock;
        if (!setDestination(me, b.x, b.z)) despawn(me, 'path');                             // pathStatus != Complete
        if (root.DRSafeZones && DRSafeZones.hit(b.x, b.z)) despawn(me, 'safezone');              // DoesHitSafeZone(destination)
      }
      // model.rotation = Slerp(model.rotation, LookRotation(model.position − prevPos), dt · rotationSpeed); vector 0 → bỏ (Unity: identity + cảnh báo)
      const mx = me.x + me.off.x, mz = me.z + me.off.z, dx = mx - me.prev.x, dz = mz - me.prev.z;
      if (Math.hypot(dx, dz) > 1e-7) {
        const want = Math.atan2(-dx, -dz);
        let dy = want - me.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        me.yaw += dy * Math.min(1, dt * P.rotationSpeed);
      }
    }
    me.prev.x = me.x + me.off.x; me.prev.z = me.z + me.off.z;
    if (me.state === 'DESPAWNING') { me.vel = 0; speed = 0; }
    agentMove(me, speed, dt);
    place(me);
    // hoạt ảnh + tiếng + collider
    animTick(me.anim, dt, fn => { if (fn === 'AnimationComplete') onAttackComplete(me); });
    pose(me);
    audio(me, dt);
    if (me.san) { me.san.x = me.x; me.san.z = me.z; }
    if (me.listener && !me.hasHit) {
      const h = contact(me);
      if (h) onPlayerHit(me, h);
    }
  }
  const _pp = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() };
  function pose(me) {
    for (const bi of D.skinBones) {
      posePose(me.anim, bi, _pp);
      const n = me.nodes[bi]; n.position.copy(_pp.p); n.quaternion.copy(_pp.q); n.scale.copy(_pp.s);
    }
  }
  function audio(me, dt) {
    const f = me.fadeSwim;
    if (f) {
      f.t += dt;
      const k = outQuad(Math.min(1, f.t / f.dur)), v = f.from + (f.to - f.from) * k; me.swimK = v;   // DOFade, OutQuad
      if (me.swim && me.swim.gain) me.swim.gain(v, 0.05);
      if (f.panic && me.panic && me.panic.gain) me.panic.gain(v, 0.05);
      if (f.t >= f.dur) me.fadeSwim = null;
    }
    for (const h of [me.swim, me.panic, me.dissolveSnd, me.dissolveSnd2, me.atkSnd]) if (h && h.pos) h.pos(me.x, 0, me.z);
  }

  function doAttack(me) {
    me.state = 'ATTACKING';
    me.listener = true;                                                             // variablePlayerDamager.AddListeners()
    const bite = me.type.type === 1;
    animTrigger(me.anim, bite ? 'bite' : 'tail');
    const k = bite ? 'event.ray.chomp' + (1 + Math.floor(Math.random() * 3)) : 'event.ray.tail' + (1 + Math.floor(Math.random() * 3));   // attackClips.PickRandom()
    me.atkSnd = snd(k, { vol: 1, pos: { x: me.x, y: 0, z: me.z }, min: 5, max: 30 });
    me.attackAt = me.clock; me.attackKind = bite ? 'bite' : 'tail';
  }
  function onAttackComplete(me) {
    me.listener = false;                                                            // RemoveListeners
    me.tInRange = 0; me.tLastAttack = me.clock;
    if (me.state === 'ATTACKING') me.state = 'FOLLOWING';                           // đã DESPAWNING thì giữ
  }
  function onPlayerHit(me, which) {
    me.hits++;
    me.listener = false;                                                            // oneHitOnly: RemoveListeners
    const pts = me.type.type === 2 ? 2 : 1;                                         // damagePoints đặt ở DoAttack
    me.hitInfo = { at: me.clock, which, points: pts };
    if (root.DRBoat && DRBoat.monsterHit) DRBoat.monsterHit(pts, { requireOneHealth: me.type.requireOneHealthToKill, source: me.key });
    sfx2d('monster.marrow.attack');                                                 // attackSFX = Marrow Monster - Attack (SFX_PLAYER)
    me.hasHit = true; me.tHit = me.clock;
    if (root.DRParticles && DRParticles.has('MonsterRayBoatDamageFX')) me.hitFx = DRParticles.spawn('MonsterRayBoatDamageFX', { parent: me.rootG });   // hitVFX.SetActive(true)
  }

  // ---------------------------------------------------------------- va chạm: CapsuleCollider (xương) × thân thuyền
  // Thân thuyền: collider tag Player của PlayerContainer; [ĐỀ XUẤT] hộp bao DR_BOAT.colliderSize.player (như js/tentacle.js); capsule = đoạn trục ± bán kính.
  const PC = (root.DR_BOAT && DR_BOAT.colliderSize && DR_BOAT.colliderSize.player) || { center: [0, 0.376, 0], size: [1.216, 0.648, 2.529] };
  const _e = new T.Vector3(), _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _lm = new T.Matrix4(), _lp = new T.Vector3();
  function contact(me) {
    const bob = root.DRBoat && DRBoat.bob;
    if (!bob) return false;
    bob.updateWorldMatrix(true, false);
    const inv = _lm.copy(bob.matrixWorld).invert();
    const c = PC.center, h = [PC.size[0] / 2, PC.size[1] / 2, PC.size[2] / 2];
    for (const col of D.colliders) {
      if (activeValue(me.anim, col.name) < 0.5) continue;                           // GameObject collider tắt theo m_IsActive
      const n = me.nodes[col.bone];
      n.updateWorldMatrix(true, false);
      const ax = col.dir === 'x' ? 0 : col.dir === 'y' ? 1 : 2, half = Math.max(0, col.height / 2 - col.radius);
      _e.setFromMatrixColumn(n.matrixWorld, ax);                                    // trục capsule trong thế giới (đã gồm tỉ lệ, 1 ở đây)
      const sc = _e.length(); _e.normalize();
      _c.setFromMatrixPosition(n.matrixWorld);
      const R = col.radius * sc, N = 12;
      for (let i = 0; i <= N; i++) {
        const t = (i / N * 2 - 1) * half * sc;
        _lp.copy(_c).addScaledVector(_e, t).applyMatrix4(inv);                      // điểm trên trục, trong hệ thuyền (đơn vị mét, bob không co giãn)
        const dx = Math.max(Math.abs(_lp.x - c[0]) - h[0], 0), dy = Math.max(Math.abs(_lp.y - c[1]) - h[1], 0), dz = Math.max(Math.abs(_lp.z + c[2] - 0) - h[2], 0);
        if (dx * dx + dy * dy + dz * dz <= R * R) return col.name;
      }
    }
    void _a; void _b;
    return false;
  }

  // ---------------------------------------------------------------- DREvents
  for (const name in NAMES) {
    if (!EV[name]) continue;
    if (root.DREvents) DREvents.register(name, { spawn(e, ctx) { return spawn(e, ctx, NAMES[name]); } });
  }

  function finish() { if (inst) destroy(inst); }
  root.DRRay = {
    finish, update: () => {}, init: () => {},   // vòng lặp chạy qua handle.update của DREvents; init/update rỗng cho mã gọi chung kiểu DRTentacle
    debug: {
      force: name => { if (inst) return false; if (root.DREvents) DREvents.debug.force('MonsterRay' + name); return !!inst; },
      get active() { return !!inst; }, get inst() { return inst; },
      state: () => inst && { key: inst.key, reason: inst.reason || null, state: inst.state, x: inst.x, z: inst.z, yaw: inst.yaw, vel: inst.vel, dissolve: inst.dissolve, clock: inst.clock,
        tFollow: inst.tFollow, tInRange: inst.tInRange, hasHit: inst.hasHit, tHit: inst.tHit, hits: inst.hits, finishRequested: inst.finishRequested,
        anim: { clip: inst.anim.cur.clip, t: inst.anim.cur.t }, listener: inst.listener, onNav: inst.onNav, hitInfo: inst.hitInfo || null,
        actives: D.colliders.map(c => [c.name, activeValue(inst.anim, c.name)]), speed: inst.lerpedSpeed, path: inst.path ? inst.path.length : 0 },
      get mesh() { return inst && inst.mesh; }, contact: () => inst && contact(inst)
    }
  };
})(window);
