/*
 * Cá voi xanh (BlueWhaleWorldEvent.cs), cá voi lộ diện + cá nhà táng (WhaleSightingWorldEvent.cs), đàn cá heo / cá voi sát thủ (CetaceanPodWorldEvent.cs +
 * Cetacean.cs): sinh vật lành, KHÔNG gây sát thương (không có collider nào, không gọi DRBoat.monsterHit). Đơn vị R8 (WORLD-GAPS.md §6).
 * Dữ liệu: data/cetaceans.js (tools/cetaceans.py: xương + mesh có trọng số + clip + Animator + số của từng prefab + tiếng + hệ hạt).
 * Lịch bốc thăm / điều kiện độ sâu / vùng / vùng an toàn: js/events.js (DREvents) với data/worldevents.js; mô-đun này chỉ đăng ký
 * BlueWhale, DolphinPod, OrcaPod, WhaleSighting, SpermWhale.
 *
 * BlueWhaleWorldEvent (số ở prefab, data/cetaceans.js events.blue): Awake: PodContainer ở y = exitY −15, tiếng bơi 0 → 1 trong 1 s, đếm 2,8 s tới tiếng Emerge.
 *   Activate: IDLING ngay (y nhảy tới idleY −0,5; hoạt ảnh bluewhale_emerge_RAW 8,63 s rồi swimloop lo phần nổi), đường đi = từ thuyền + depthTestPath[0] tới
 *   thuyền + depthTestPath[cuối] (right·x + forward·z lúc sinh, y = 0), PodContainer.rotation = LookRotation(cuối − đầu), gốc DOMove tuyến tính horizontalSpeed 3,5.
 *   Mỗi khung: cách đích < destinationProximityThreshold 30 thì RequestEventFinish; IDLING: khoảng cách thuyền–gốc < duckDistanceThreshold 35 thì y đích =
 *   Lerp(duckedY −1,5, idleY, InverseLerp(0, 35, khoảng cách)) và đặt thẳng (không làm mượt); tiếng kêu mỗi 6–10 s (3 clip, nguồn Call). Kết thúc: PodContainer
 *   chìm về exitY với tốc độ 3 m/s (ease InSine), tiếng bơi tắt dần, rồi EventFinished + huỷ.
 * CetaceanPodWorldEvent (DolphinPod 3 con, OrcaPod 2 con): PodContainer ở downY −15 lúc Awake; Activate: tween y → upY −0,5 với enterVerticalSpeed 3 (ease OutQuad),
 *   xong thì mỗi Cetacean CanJump = true và IDLING; đích = gốc + forward thuyền · pathLength 100 (y 0), DOMove tuyến tính 3,5 m/s; xoay PodContainer
 *   Slerp(quay, LookRotation(vị trí − vị trí khung trước), dt · rotationSpeed 1) mỗi khung (bắt đầu từ góc 0 của thế giới). Né: thuyền < duckDistanceThreshold
 *   (cá heo 12,5 / sát thủ 15) thì y = Lerp(duckedY (−2,5 / −8), upY, InverseLerp(0, ngưỡng, khoảng cách)) và CanJump = false, hết né thì CanJump = true.
 *   Tiếng kêu 5–8 s (cá heo) / 5–10 s (sát thủ) trừ khi EXITING; kết thúc: tween y → downY (InSine, 3 m/s), tắt dần tiếng bơi, tiếng Submerge nếu không đang né.
 *   Cetacean.Update: khi CanJump & isAllowedToJump, đếm lùi random(timeBetweenJumpsMin, Max) rồi SetTrigger("jump") + phát một clip nhảy (sau jumpAudioDelaySec);
 *   hoạt ảnh Animator: swimidle → (trigger jump, 0,25 s) → jump → (ExitTime 1) → swimidle; animatorSpeed riêng từng con (1 / 1,5 / 1,2; sát thủ 1 / 1,1); sự kiện
 *   hoạt ảnh FireSignal của sát thủ chơi BlowholeParticles.
 * WhaleSightingWorldEvent (WhaleSighting = prefab WhaleEvent 24 s, SpermWhale 12 s): Activate xoay gốc eulerAngles.y = góc thuyền + 180°; hoạt ảnh một clip duy nhất
 *   (WhaleWorldEvent 24,08 s lặp / spermwhale_breachattack 11,08 s) và hệ hạt bật theo đường cong m_IsActive; tiếng PlayOnAwake một lần. Hết finishDelaySec thì
 *   EventFinished + huỷ; RequestEventFinish (neo bến...) chỉ gọi EventFinished (sự kiện thôi chặn việc bốc mới), con vật vẫn bơi tới hết giờ như bản gốc.
 *
 * Nước: mặt nước web ghi chiều sâu nên thân chìm dưới mặt nước bị che hết (như cá đuối js/ray.js). Thân cá voi vẽ SAU nước, không kiểm độ sâu, mờ dần
 * theo độ sâu: alpha = exp(−sâu / SEE) [ĐỀ XUẤT SEE = 3 m]; phần nhô khỏi nước rõ hẳn. Ánh sáng: công thức chung drEnvLights như js/ray.js (Lit_Shader_0 / Leviathan_Shader
 * của bản gốc chỉ lấy MainTex; bọt tiếp xúc nước của Leviathan_Shader không có).
 * Ngân sách: data 0,5 MB + tiếng 0,4 MB (mp3 mono 48 kb/s; vòng lặp cắt 12 s, 24 kb/s) + 40 KB ảnh. Clip tiếng đặt vào DR_AUDIO (khoá cet.*), hệ hạt vào DR_PARTICLES (Cet_*).
 *
 *   DRCet.debug → { force(tên), instances(), step(dt), live(), calls() }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_CETACEANS;
  if (!T || !D || !D.models) { root.DRCet = null; return; }
  const S = () => root.DR.s;
  const SEE = 3;   // [ĐỀ XUẤT] m: độ sâu làm thân cá voi còn 1/e

  // ---------------------------------------------------------------- nối dữ liệu vào các bảng dùng chung
  const AUD = root.DR_AUDIO = root.DR_AUDIO || {};
  for (const k in D.audio) if (!AUD[k]) AUD[k] = D.audio[k];
  const PD = root.DR_PARTICLES = root.DR_PARTICLES || {}, PL = root.DR_PARTICLES_LIB = root.DR_PARTICLES_LIB || { textures: {}, sprites: {}, meshes: {} };
  for (const k in D.particles) PD[k] = D.particles[k];
  for (const kind of ['textures', 'sprites', 'meshes']) { PL[kind] = PL[kind] || {}; for (const k in D.plib[kind]) if (!(k in PL[kind])) PL[kind][k] = D.plib[kind][k]; }
  // jumpParticles.Play(): hệ có playOnAwake = false chỉ phát khi script gọi Play, nên làm bản play = 1 để DRParticles.spawn phát ngay
  const PLAY = {};
  for (const key in D.events) for (const c of D.events[key].cetaceans || []) if (c.jumpParticles) {
    const nm = 'Cet_' + key + '_' + c.jumpParticles;
    if (D.particles[nm] && !PLAY[nm]) { const cp = JSON.parse(JSON.stringify(D.particles[nm])); for (const n of cp.nodes) n.main.play = 1; PD[nm + '_play'] = cp; PLAY[nm] = nm + '_play'; }
  }

  // ---------------------------------------------------------------- tiện ích
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  const outQuad = u => 1 - (1 - u) * (1 - u), inSine = u => 1 - Math.cos(u * Math.PI / 2), linear = u => u;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const snd = (key, o) => { try { return root.DRAudio && DRAudio.resolve(key) ? DRAudio.voice(key, o) : null; } catch (e) { return null; } };
  const fw = b => [-Math.sin(b.yaw), -Math.cos(b.yaw)];
  const sceneOf = () => { let o = root.DRBoat && DRBoat.root; while (o && o.parent) o = o.parent; return o && o.isScene ? o : null; };
  // Quaternion.LookRotation(m) của Unity (hướng mô hình = +z Unity = −z three, up = +y) tính trong three; m = vector chuyển động (three)
  const _m = new T.Matrix4(), _o = new T.Vector3(), _u = new T.Vector3(0, 1, 0), _t = new T.Vector3();
  function lookQ(out, mx, my, mz) {
    if (mx * mx + my * my + mz * mz < 1e-12) return false;
    _t.set(mx, my, mz);
    _m.lookAt(_o, _t, _u);              // trục z của ma trận = eye − target = −m → trục −z (mặt trước mô hình) hướng theo m
    out.setFromRotationMatrix(_m);
    return true;
  }

  // ---------------------------------------------------------------- mesh / vật liệu / xương
  const geoCache = {}, texCache = {}, matCache = {};
  function decodeMesh(M) {
    const bin = atob(M.b64), n = M.n, tr = M.tris * 3;
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    let o = 0;
    const u16 = cnt => { const a = new Uint16Array(u8.buffer.slice(o, o + cnt * 2)); o += cnt * 2; return a; };
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
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(si), 4));
    g.setAttribute('skinWeight', new T.BufferAttribute(w, 4));
    g.setIndex(new T.BufferAttribute(ix, 1));
    return g;
  }
  function material(key, mi) {
    const id = key + mi;
    if (matCache[id]) return matCache[id];
    const md = D.models[key].meshes[mi];
    if (!texCache[md.tex]) { const t = new T.TextureLoader().load(md.tex); t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; texCache[md.tex] = t; }
    const m = new T.MeshBasicMaterial({ map: texCache[md.tex], transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false });
    const uni = { uCetSee: { value: SEE } };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uCetSee;')
        .replace('#include <output_fragment>', `
  vec3 wpC = vDrFogW;
  vec3 litC = diffuseColor.rgb * (uDrSunCol * drEnvCloud(wpC) + drEnvLights(wpC) + uDrAmb + (1.0 - drEnvMaskB(wpC.xz)) + vec3(uDrTintK, 0.0, 0.0));
  float aC = exp(-max(-wpC.y, 0.0) / uCetSee);
  gl_FragColor = vec4(litC * aC, aC);`);
    };
    m.customProgramCacheKey = () => 'drCetacean';
    return (matCache[id] = m);
  }
  function buildRig(key) {
    const Mo = D.models[key], boneSet = new Set();
    for (const md of Mo.meshes) for (const b of md.bones) boneSet.add(b);
    const nodes = Mo.nodes.map((n, i) => {
      const o = boneSet.has(i) ? new T.Bone() : new T.Object3D();
      o.name = n.name; o.position.fromArray(n.p); o.quaternion.fromArray(n.q); o.scale.fromArray(n.s);
      return o;
    });
    Mo.nodes.forEach((n, i) => { if (n.parent >= 0) nodes[n.parent].add(nodes[i]); });
    const meshes = Mo.meshes.map((md, mi) => {
      const id = key + mi;
      const g = geoCache[id] || (geoCache[id] = decodeMesh(md.mesh));
      const mesh = new T.SkinnedMesh(g, material(key, mi));
      mesh.frustumCulled = false; mesh.name = 'Cetacean_' + key + '_' + md.name; mesh.renderOrder = 2.5;   // sau nước (1) và bọt (2)
      // bindpose Unity = (xương → mesh)⁻¹: mesh ở gốc thế giới, bindMatrix đơn vị (như js/ray.js, js/tentacle.js)
      mesh.bind(new T.Skeleton(md.bones.map(i => nodes[i]), md.bind.map(a => new T.Matrix4().fromArray(a))), new T.Matrix4());
      return mesh;
    });
    return { nodes, meshes };
  }

  // ---------------------------------------------------------------- hoạt ảnh (Hermite như AnimationCurve, chép từ js/ray.js)
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
  const stepAt = (keys, t) => { let v = keys[0][1]; for (const k of keys) { if (k[0] <= t) v = k[1]; else break; } return v; };
  const _v = [0, 0, 0, 0], AX = new T.Vector3(1, 0, 0), AY = new T.Vector3(0, 1, 0), AZ = new T.Vector3(0, 0, 1);
  const _qa = new T.Quaternion(), _qb = new T.Quaternion(), _qc = new T.Quaternion();
  const DEG = Math.PI / 180;
  // Quaternion.Euler (Unity: Y · X · Z) rồi đổi dấu z của không gian: (−x, −y, z, w)
  function eulerQ(out, x, y, z) {
    _qa.setFromAxisAngle(AY, y * DEG); _qb.setFromAxisAngle(AX, x * DEG); _qc.setFromAxisAngle(AZ, z * DEG);
    out.copy(_qa).multiply(_qb).multiply(_qc);
    out.set(-out.x, -out.y, out.z, out.w);
    return out;
  }
  // trạng thái Animator -> clip; nút nào có đường cong ở bất kỳ clip nào
  for (const key in D.models) {
    const Mo = D.models[key];
    Mo.stateClip = {}; Mo.animated = new Set();
    const byFile = {};
    for (const k in Mo.clips) {
      const c = Mo.clips[k];
      byFile[c.src.replace('.anim', '')] = c;
      for (const n in c.curves) Mo.animated.add(+n);
    }
    for (const st in Mo.controller.states) Mo.stateClip[st] = byFile[Mo.controller.states[st].clip];
    Mo.animList = Array.from(Mo.animated).sort((a, b) => a - b);
  }
  const _p = new T.Vector3(), _s = new T.Vector3(), _pq = new T.Quaternion(), _p1 = new T.Vector3(), _q1 = new T.Quaternion(), _s1 = new T.Vector3();
  function samplePose(Mo, clip, t, idx, p, q, s) {
    const rest = Mo.nodes[idx], c = clip.curves[idx];
    p.fromArray(rest.p); q.fromArray(rest.q); s.fromArray(rest.s);
    if (!c) return;
    if (c.p) { hermite(c.p, t, 3, _v); p.set(_v[0], _v[1], _v[2]); }
    if (c.q) { hermite(c.q, t, 4, _v); q.set(_v[0], _v[1], _v[2], _v[3]).normalize(); }
    else if (c.e) { hermite(c.e, t, 3, _v); eulerQ(q, _v[0], _v[1], _v[2]); }
    if (c.s) { hermite(c.s, t, 3, _v); s.set(_v[0], _v[1], _v[2]); }
  }
  const clipT = (clip, t) => (clip.loop ? t % clip.len : Math.min(t, clip.len));
  function newAnim(Mo, speed) { return { cur: { st: Mo.controller.default, t: 0 }, prev: null, blend: 0, dur: 0, speed, trigger: false }; }
  function animTick(I, dt, onEvent) {
    const A = I.anim, Mo = I.Mo, C = Mo.controller;
    const adv = L => {
      const c = Mo.stateClip[L.st], t0 = L.t, sp = (C.states[L.st] || {}).speed || 1;
      L.t += dt * A.speed * sp;      // thời gian không quấn: ExitTime so với normalizedTime chưa quấn; lấy mẫu quấn bằng clipT
      for (const e of c.events) {
        const hit = c.loop ? Math.floor((L.t - e.t) / c.len) > Math.floor((t0 - e.t) / c.len) : (e.t > t0 && e.t <= L.t);
        if (hit) onEvent(e.fn);
      }
    };
    adv(A.cur); if (A.prev) adv(A.prev);
    if (A.prev) { A.blend += dt; if (A.blend >= A.dur) A.prev = null; }
    if (A.prev) return;                                   // đang chuyển tiếp: không nhận chuyển tiếp mới
    const c = Mo.stateClip[A.cur.st];
    for (const tr of C.transitions) {
      if (tr.from !== A.cur.st) continue;
      const byTrig = tr.cond.length && A.trigger && tr.cond.every(x => x === 'jump');
      const byExit = tr.hasExit && !tr.cond.length && A.cur.t / c.len >= tr.exit - 1e-6;
      if (!byTrig && !byExit) continue;
      if (byTrig) A.trigger = false;
      A.prev = tr.dur > 0 ? { st: A.cur.st, t: A.cur.t } : null;
      A.cur = { st: tr.to, t: 0 }; A.blend = 0; A.dur = tr.dur;
      break;
    }
  }
  const animWeight = A => (A.prev ? clamp01(A.blend / A.dur) : 1);
  function animApply(I) {
    const A = I.anim, Mo = I.Mo, w = animWeight(A), ca = Mo.stateClip[A.cur.st];
    const cb = A.prev ? Mo.stateClip[A.prev.st] : null;
    const p1 = _p1, q1 = _q1, s1 = _s1;
    for (const i of Mo.animList) {
      const o = I.nodes[i];
      samplePose(Mo, ca, clipT(ca, A.cur.t), i, _p, _pq, _s);
      if (cb) {
        samplePose(Mo, cb, clipT(cb, A.prev.t), i, p1, q1, s1);
        p1.lerp(_p, w); q1.slerp(_pq, w); s1.lerp(_s, w);
        o.position.copy(p1); o.quaternion.copy(q1); o.scale.copy(s1);
      } else { o.position.copy(_p); o.quaternion.copy(_pq); o.scale.copy(_s); }
    }
  }
  // GameObject bật/tắt theo đường cong m_IsActive của trạng thái hiện tại; trạng thái không có đường cong của nút đó thì trả về giá trị prefab
  function nodeActive(I, i) {
    const A = I.anim, c = I.Mo.stateClip[A.cur.st], k = c.active[i];
    if (k) return stepAt(k, clipT(c, A.cur.t)) >= 0.5;
    return I.Mo.nodes[i].active;
  }

  // ---------------------------------------------------------------- một con (Cetacean) = bộ xương + mesh + hệ hạt
  const live = [];                                          // mọi sự kiện đang sống (vòng lặp của riêng mô-đun, vì DREvents ngừng gọi update khi done)
  function makeInst(me, key, mountIdx, cfg) {
    const Mo = D.models[key], rig = buildRig(key);
    // chuỗi cha giữa Pod / gốc sự kiện và nút Animator (vd Dolphin1: p, s riêng); bỏ gốc sự kiện, bỏ "Pod", bỏ chính nút Animator
    const m = Mo.mounts[mountIdx], loc = m.local, names = m.chain;
    let parent = me.podG || me.rootG;
    const from = names[1] === 'Pod' ? 2 : 1;
    for (let i = from; i < loc.length - 1; i++) {
      const g = new T.Group(); g.name = names[i];
      g.position.fromArray(loc[i].p); g.quaternion.fromArray(loc[i].q); g.scale.fromArray(loc[i].s);
      parent.add(g); parent = g;
    }
    parent.add(rig.nodes[0]);
    const sc = me.scene;
    for (const mesh of rig.meshes) sc.add(mesh);
    const I = { me, key, Mo, nodes: rig.nodes, meshes: rig.meshes, mount: parent, cfg: cfg || {}, anim: newAnim(Mo, (cfg && cfg.animatorSpeed) || 1),
      fx: Mo.particleRoots.map(() => null), canJump: false, timer: 0 };
    if (cfg && cfg.isAllowedToJump) I.timer = rand(cfg.timeBetweenJumpsMin, cfg.timeBetweenJumpsMax);   // Cetacean.Awake
    return I;
  }
  const worldPos = (o, out) => { o.updateWorldMatrix(true, false); return out.setFromMatrixPosition(o.matrixWorld); };
  const _wp = new T.Vector3();
  function instFx(I) {
    const Mo = I.Mo;
    Mo.particleRoots.forEach((r, ri) => {
      if (!root.DRParticles || PLAY['Cet_' + I.key + '_' + r.name]) return;           // hệ của jumpParticles chỉ phát khi có tín hiệu
      const on = nodeActive(I, r.node);
      if (on && !I.fx[ri]) { try { I.fx[ri] = DRParticles.spawn(r.ps, { parent: I.nodes[r.parent] }); } catch (e) { I.fx[ri] = { stop() {} }; } }
      else if (!on && I.fx[ri]) { I.fx[ri].stop(); I.fx[ri] = null; }
    });
  }
  function instSignal(I, fn) {
    if (fn !== 'FireSignal' || !I.cfg.signalOnEvent || !I.cfg.jumpParticles || !root.DRParticles) return;
    const nm = 'Cet_' + I.key + '_' + I.cfg.jumpParticles, ri = I.Mo.particleRoots.findIndex(r => r.name === I.cfg.jumpParticles);
    if (ri >= 0 && PLAY[nm]) { try { I.fx[ri] = DRParticles.spawn(PLAY[nm], { parent: I.nodes[I.Mo.particleRoots[ri].parent] }); } catch (e) { /* hạt không bắt buộc */ } }
  }
  function instUpdate(I, dt) {
    const cfg = I.cfg;
    if (cfg.isAllowedToJump && I.canJump) {                 // Cetacean.Update
      I.timer -= dt;
      if (I.timer <= 0) {
        I.timer = rand(cfg.timeBetweenJumpsMin, cfg.timeBetweenJumpsMax);
        I.anim.trigger = true;
        I.me.calls.push({ t: I.me.t, jump: I.cfg.name });
        if (cfg.jumpAudio) {
          const key = pick(cfg.jumpClips), pos = worldPos(I.mount, new T.Vector3()), ja = cfg.jumpAudio;
          const play = () => snd(key, { vol: ja.vol, pos: { x: pos.x, y: 0, z: pos.z }, min: ja.min, max: ja.max });
          if (cfg.jumpAudioDelaySec > 0) I.me.later.push({ t: cfg.jumpAudioDelaySec, fn: play }); else play();
        }
      }
    }
    animTick(I, dt, fn => instSignal(I, fn));
    animApply(I);
    instFx(I);
  }
  function instDispose(I) {
    for (const f of I.fx) if (f && f.stop) f.stop();
    for (const m of I.meshes) { if (m.parent) m.parent.remove(m); if (m.skeleton) m.skeleton.dispose && m.skeleton.dispose(); }
    if (I.mount && I.mount.parent) I.mount.parent.remove(I.mount);
  }

  // ---------------------------------------------------------------- sự kiện
  function newEvent(kind, key, e, ctx) {
    const sc = sceneOf();
    if (!sc) return null;
    const E = D.events[key], rs = E.rootScale ? E.rootScale[0] : 1;
    const rootG = new T.Group(); rootG.name = 'Cet_' + key; rootG.position.set(ctx.x, 0, ctx.z); rootG.scale.setScalar(rs);
    sc.add(rootG);
    const me = { kind, key, e, E, rs, scene: sc, rootG, podG: null, insts: [], t: 0, finishRequested: false, done: false, destroyed: false, calls: [], later: [],
      voices: [], state: 'NONE', x: ctx.x, z: ctx.z, startY: ctx.y };
    live.push(me);
    return me;
  }
  const handleFor = me => ({
    requestFinish() { requestFinish(me); },
    get done() { return me.done; },
    set done(v) { if (v) { me.done = true; destroy(me); } },
    dispose() { destroy(me); }
  });
  function destroy(me) {
    if (me.destroyed) return;
    me.destroyed = true; me.done = true;
    for (const I of me.insts) instDispose(I);
    for (const v of me.voices) if (v && v.stop) v.stop(0.3);
    if (me.rootG.parent) me.rootG.parent.remove(me.rootG);
    const i = live.indexOf(me); if (i >= 0) live.splice(i, 1);
  }
  const audioAt = (me, key, src, extra) => snd(key, Object.assign({ vol: src.vol, pos: { x: me.x, y: 0, z: me.z }, min: src.min, max: src.max }, extra || {}));
  function say(me, key, src, extra) { const v = audioAt(me, key, src, extra); if (v) me.voices.push(v); return v; }

  // ---- BlueWhaleWorldEvent
  function spawnBlue(e, ctx) {
    const me = newEvent('blue', 'blue', e, ctx);
    if (!me) return null;
    const E = me.E, b = ctx.boat, path = e.depthTestPath;
    me.podG = new T.Group(); me.podG.name = 'PodContainer'; me.rootG.add(me.podG);
    me.podY = E.exitY;                                           // Awake
    me.insts.push(makeInst(me, 'blue', 0, null));
    me.swim = audioAt(me, E.swimAudio.key, E.swimAudio, { loop: true, vol: 0, offset: 'random' }); if (me.swim) { me.voices.push(me.swim); me.swim.gain(1, 0.4); }   // DOFade(1, 1 s).From(0)
    me.emergeT = E.emergeSoundDelay; me.emerged = false;
    // Activate
    me.state = 'IDLING'; me.callT = rand(E.timeBetweenCallsMin, E.timeBetweenCallsMax);
    const sp = root.DREvents.offsetWorld(b, path[0]), ep = root.DREvents.offsetWorld(b, path[path.length - 1]);
    me.start = { x: sp[0], z: sp[1] }; me.end = { x: ep[0], z: ep[1] };
    me.x = ctx.x; me.z = ctx.z;
    const dx = me.end.x - me.start.x, dz = me.end.z - me.start.z;
    lookQ(me.podG.quaternion, dx, 0, dz);
    me.move = { x0: me.x, z0: me.z, t: 0, dur: Math.hypot(me.end.x - me.x, me.end.z - me.z) / E.horizontalSpeed };
    place(me);
    return handleFor(me);
  }
  const place = me => { me.rootG.position.set(me.x, 0, me.z); me.podG.position.y = me.podY / me.rs; };
  function moveRoot(me, dt) {
    const mv = me.move; if (!mv) return;
    mv.t += dt; const u = mv.dur > 0 ? Math.min(1, mv.t / mv.dur) : 1;
    me.x = lerp(mv.x0, me.end.x, u); me.z = lerp(mv.z0, me.end.z, u);
  }
  function duck(me, dist, thr, idle, ducked) {
    let y, d = dist < thr;
    if (d) { me.isDucked = true; y = lerp(ducked, idle, clamp01(dist / thr)); } else y = idle;   // Mathf.Lerp(duckedY, idleY, InverseLerp(0, thr, dist))
    return { y, near: d };
  }
  function updateBlue(me, dt) {
    const E = me.E, b = S().boat;
    me.t += dt;
    moveRoot(me, dt);
    if (!me.finishRequested && Math.hypot(me.x - me.end.x, me.z - me.end.z) < E.destinationProximityThreshold) requestFinish(me);
    if (me.state === 'IDLING') {
      const r = duck(me, Math.hypot(b.x - me.x, b.z - me.z), E.duckDistanceThreshold, E.idleY, E.duckedY);
      me.podY = r.y;
      if (!r.near && me.isDucked && me.podY >= E.idleY - 1e-7) me.isDucked = false;
      me.callT -= dt;
      if (me.callT <= 0) { say(me, pick(E.callClips), E.callAudio); me.callT = rand(E.timeBetweenCallsMin, E.timeBetweenCallsMax); me.calls.push({ t: me.t, call: true }); }
    } else if (me.state === 'EXITING' && me.yTween) tweenY(me, dt);
    if (!me.emerged) { me.emergeT -= dt; if (me.emergeT <= 0) { me.emerged = true; say(me, E.emergeAudio.key, E.emergeAudio); } }
    if (me.swim) me.swim.pos(me.x, 0, me.z);
    place(me);
  }
  function tweenY(me, dt) {
    const tw = me.yTween; tw.t += dt;
    const u = tw.dur > 0 ? Math.min(1, tw.t / tw.dur) : 1;
    me.podY = lerp(tw.from, tw.to, tw.ease(u));
    if (u >= 1) { me.yTween = null; if (tw.done) tw.done(); }
  }

  // ---- CetaceanPodWorldEvent
  function spawnPod(key, e, ctx) {
    const me = newEvent('pod', key, e, ctx);
    if (!me) return null;
    const E = me.E, b = ctx.boat;
    me.podG = new T.Group(); me.podG.name = 'PodContainer'; me.rootG.add(me.podG);
    me.podY = E.downY; me.prevPod = new T.Vector3(me.x, me.podY, me.z);
    E.cetaceans.forEach((c, i) => me.insts.push(makeInst(me, key, i, c)));
    if (E.swimAudio) { me.swim = audioAt(me, E.swimAudio.key, E.swimAudio, { loop: true, vol: 0, offset: 'random' }); if (me.swim) { me.voices.push(me.swim); me.swim.gain(1, 0.4); } }
    // Activate
    const f = fw(b);
    me.end = { x: me.x + f[0] * E.pathLength, z: me.z + f[1] * E.pathLength };
    me.yTween = { from: me.podY, to: E.upY, t: 0, dur: Math.abs(me.podY - E.upY) / E.enterVerticalSpeed, ease: outQuad, done: () => { for (const I of me.insts) I.canJump = true; me.state = 'IDLING'; } };
    me.move = { x0: me.x, z0: me.z, t: 0, dur: E.pathLength / E.horizontalSpeed };
    me.callT = rand(E.timeBetweenCallsMin, E.timeBetweenCallsMax); me.state = 'ENTERING';
    place(me);
    return handleFor(me);
  }
  const _tq = new T.Quaternion();
  function updatePod(me, dt) {
    const E = me.E, b = S().boat;
    me.t += dt;
    moveRoot(me, dt);
    if (!me.finishRequested && Math.hypot(me.x - me.end.x, me.z - me.end.z) < E.destinationProximityThreshold) requestFinish(me);
    if (me.yTween) tweenY(me, dt);
    // xoay: Slerp(quay, LookRotation(vị trí − vị trí khung trước), dt · rotationSpeed)
    const mx = me.x - me.prevPod.x, my = me.podY - me.prevPod.y, mz = me.z - me.prevPod.z;
    if (lookQ(_tq, mx, my, mz)) me.podG.quaternion.slerp(_tq, clamp01(dt * E.rotationSpeed));
    me.prevPod.set(me.x, me.podY, me.z);
    if (me.state === 'IDLING') {
      const r = duck(me, Math.hypot(b.x - me.x, b.z - me.z), E.duckDistanceThreshold, E.upY, E.duckedY);
      if (r.near && !me.wasNear) for (const I of me.insts) I.canJump = false;
      me.wasNear = r.near;
      me.podY = r.y;
      if (!r.near && me.isDucked && me.podY >= E.upY - 1e-7) { me.isDucked = false; for (const I of me.insts) I.canJump = true; }
    }
    if (me.state !== 'EXITING') {
      me.callT -= dt;
      if (me.callT <= 0) { say(me, pick(E.callClips), E.callAudio); me.callT = rand(E.timeBetweenCallsMin, E.timeBetweenCallsMax); me.calls.push({ t: me.t, call: true }); }
    }
    if (me.swim) me.swim.pos(me.x, 0, me.z);
    place(me);
  }

  // ---- WhaleSightingWorldEvent (WhaleSighting, SpermWhale)
  function spawnSighting(key, e, ctx) {
    const me = newEvent('sight', key, e, ctx);
    if (!me) return null;
    me.rootG.position.set(ctx.x, 0, ctx.z);
    me.rootG.rotation.y = ctx.boat.yaw + Math.PI;                // Activate: eulerAngles.y = góc thuyền + 180° (Unity −φ ↔ three φ: cộng π như nhau)
    me.x = ctx.x; me.z = ctx.z;
    const I = makeInst(me, key, 0, null);
    I.canJump = false;
    me.insts.push(I);
    if (key === 'whale') I.nodes[0].position.y = ctx.y;          // Instantiate đặt gốc ở y = playerSpawnOffset.y (−22); sperm: nút Spermwhale tự có −3
    if (me.E.sound) say(me, me.E.sound.key, me.E.sound);
    me.finishAt = me.E.finishDelaySec;
    return handleFor(me);
  }
  function updateSight(me, dt) {
    me.t += dt;
    if (me.t >= me.finishAt) destroy(me);                        // DelayedEventFinish: EventFinished + Destroy
  }

  function requestFinish(me) {
    if (me.finishRequested) return;
    me.finishRequested = true;
    const E = me.E;
    if (me.kind === 'sight') { me.done = true; return; }          // RequestEventFinish: EventFinished ngay, vật thể sống tới hết finishDelaySec
    me.state = 'EXITING';
    for (const I of me.insts) I.canJump = false;
    me.yTween = { from: me.podY, to: me.kind === 'blue' ? E.exitY : E.downY, t: 0, ease: inSine, dur: 0,
      done: () => { me.done = true; destroy(me); } };
    me.yTween.dur = Math.abs(me.podY - me.yTween.to) / E.exitVerticalSpeed;
    if (me.swim) me.swim.gain(0, me.yTween.dur / 3);              // DOFade(0, duration)
    if (me.kind === 'pod' && !me.isDucked && E.submergeAudio) say(me, E.submergeAudio.key, E.submergeAudio);
  }

  function update(dt) {
    for (const me of live.slice()) {
      if (me.destroyed) continue;
      for (let i = me.later.length - 1; i >= 0; i--) { me.later[i].t -= dt; if (me.later[i].t <= 0) { const f = me.later[i].fn; me.later.splice(i, 1); f(); } }
      if (me.kind === 'blue') updateBlue(me, dt); else if (me.kind === 'pod') updatePod(me, dt); else updateSight(me, dt);
      if (me.destroyed) continue;
      for (const I of me.insts) instUpdate(I, dt);
    }
  }

  // ---------------------------------------------------------------- DREvents
  if (root.DREvents) {
    DREvents.register('BlueWhale', { spawn: (e, ctx) => spawnBlue(e, ctx) });
    DREvents.register('DolphinPod', { spawn: (e, ctx) => spawnPod('dolphin', e, ctx) });
    DREvents.register('OrcaPod', { spawn: (e, ctx) => spawnPod('orca', e, ctx) });
    DREvents.register('WhaleSighting', { spawn: (e, ctx) => spawnSighting('whale', e, ctx) });
    DREvents.register('SpermWhale', { spawn: (e, ctx) => spawnSighting('sperm', e, ctx) });
  }
  // nhịp khung: bọc DRBoat.update (main.js gọi DRBoat.update(dt) mỗi khung, dt = 0 khi tạm dừng), không sửa js/boat.js
  if (root.DRBoat && typeof DRBoat.update === 'function' && !DRBoat.update._cet) {
    const orig = DRBoat.update;
    const wrapped = function (dt) { const r = orig.apply(this, arguments); try { update(dt); } catch (err) { console.error('[cetaceans]', err); } return r; };
    wrapped._cet = true;
    for (const k in orig) wrapped[k] = orig[k];   // giữ cờ _mimic/_mind của mô-đun khác để chúng không bọc lần hai
    DRBoat.update = wrapped;
  }

  root.DRCet = {
    ready: true, update,
    debug: {
      force: name => (root.DREvents ? DREvents.debug.force(name) : null),
      live: () => live.map(m => ({ kind: m.kind, key: m.key, state: m.state, t: m.t, x: m.x, z: m.z, y: m.podY, done: m.done, finish: m.finishRequested, ducked: !!m.isDucked, insts: m.insts.length })),
      instances: () => live.map(m => ({ me: m, insts: m.insts })),
      calls: () => live.reduce((a, m) => a.concat(m.calls), []),
      step: dt => update(dt),
      clear: () => { for (const m of live.slice()) destroy(m); },
      fx: i => { const m = live[i]; return m ? m.insts.map(I => I.fx.map(f => !!f)) : []; },
      anim: i => { const m = live[i]; return m ? m.insts.map(I => ({ st: I.anim.cur.st, t: I.anim.cur.t, prev: I.anim.prev && I.anim.prev.st, speed: I.anim.speed, canJump: I.canJump })) : []; },
      damage: () => 0
    }
  };
})(window);
