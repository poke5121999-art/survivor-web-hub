/*
 * Leviathan: sự kiện thế giới Leviathan / LeviathanAttack (LeviathanWorldEvent.cs, LeviathanAnimationEvents.cs) và ranh giới thế giới (BoundaryEnforcer.cs).
 * Đơn vị R7 (WORLD-GAPS.md §6). Dữ liệu: data/leviathan.js + art/vfx/leviathan/head.bin (tools/leviathan.py).
 *
 * Ranh giới (BoundaryEnforcer.cs:42-60; số ở markers.json "Boundary": mềm 1800, cứng 2000, kiểm mỗi 0,25 s, tâm (127,9 ; −7,6)):
 *   cách tâm > cứng VÀ chưa sinh VÀ sự kiện hiện tại không phải LeviathanAttack → DoEvent(LeviathanAttack), đã sinh = true;
 *   cách tâm < mềm → đã sinh = false (người chơi phải vào lại mới bị tấn công lần nữa);
 *   cách tâm > mềm → hiện OutOfBoundsWarning ("Entering Uncharted Waters / TURN BACK").
 *   teleportCooldownSec / teleportInProgress của bản gốc không bao giờ được đặt (mã chết), web không chép.
 * Sự kiện (LeviathanWorldEvent.cs:136-285), FixedUpdate 0,02 s như Unity:
 *   Activate: điểm giao = thuyền + forward·50; hai đầu đường = điểm giao ± right·100; thử 10 góc xoay quanh điểm giao (num3 −= 18·i, dồn), mỗi lần lấy 11
 *     mẫu độ sâu > minDepth. Cờ "không đủ sâu" KHÔNG được xoá giữa các lần thử (bản gốc: flag2 khai báo ngoài vòng for), nên chỉ lần thử đầu có thể thành công.
 *     Không có đường → OnEventSpawnAborted. Đi từ đầu này sang đầu kia với pathLength / (spawn + hold + despawn) = 10 m/s.
 *   SPAWNING 5 s (y −40 → −12) → HOLDING 10 s (y −12) → DESPAWNING 5 s (y −12 → −40); hết DESPAWNING: nếu attackAfterDive VÀ thuyền còn đủ sâu VÀ không ở vùng cấm
 *     VÀ không trong vùng an toàn → ATTACKING (trigger "attack", tiếng Attack), ngược lại kết thúc.
 *   ATTACKING: thân dính vào thuyền, quay nhìn (thuyền − điểm đích). Sự kiện hoạt ảnh của Leviathan_Attack: 1,5 s DisableMovement, 1,833 s DisableBoatModel,
 *     3,333 s KillPlayer — cả ba bị bỏ qua nếu thuyền đã dùng Hiện thân (OnTeleportBegin) và KillPlayer bỏ qua nếu trong vùng an toàn.
 *   Hiện thân: OnTeleportBegin → hasPlayerTeleportedAway; OnTeleportComplete → RequestEventFinish.
 * [ĐỀ XUẤT] Nhìn thấy thân dưới nước (bản gốc dùng khúc xạ nhân tạo _ArtificialRefractAmount 1 → 5 → 1 của shader đồ thị Leviathan_Shader): xem chú thích ở material().
 *   Dòng chữ cảnh báo tiếng Việt, kiểu chữ tự chọn.
 * [ĐỀ XUẤT] Mesh nạp bất đồng bộ sau khi tệp chạy 1,5 s; chưa nạp xong thì vẫn chạy đủ trạng thái (chết vẫn đúng) chỉ không thấy thân.
 *
 *   DRLeviathan.update(dt) (bao DRBoat.update, không sửa js/boat.js)   DRLeviathan.ready
 *   DRLeviathan.debug → { state(), boundary(), force(name), simulate(sec), warningVisible(), inst, check() }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_LEVIATHAN, EV = root.DR_WORLDEVENTS;
  if (!T || !D || !D.bones || !EV) { root.DRLeviathan = null; return; }
  const REV = (document.currentScript && (document.currentScript.src.match(/[?&]v=([^&]+)/) || [])[1]) || '';
  const P = D.params, FIXED = P.fixedDt, S = () => root.DR.s;
  const IDS = ['Leviathan', 'LeviathanAttack'];
  let scene = null, mat = null, inst = null, meshData = null, meshLoading = null, frozen = false;

  // ---------------------------------------------------------------- tiếng: khoá mới chèn vào DR_AUDIO (không sửa data/audio.js)
  const A = root.DR_AUDIO = root.DR_AUDIO || {};
  for (const k in D.audio) if (!A[k]) A[k] = Object.assign({ bus: 'sfx' }, D.audio[k]);
  const voice = (k, o) => { try { return root.DRAudio && DRAudio.resolve(k) ? DRAudio.voice(k, o) : null; } catch (e) { return null; } };
  const CALLS = ['event.leviathan.call1', 'event.leviathan.call2', 'event.leviathan.call3'];

  // ---------------------------------------------------------------- AnimationCurve (Hermite theo khóa; độ dốc Infinity = bậc thang) và clip
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
  const CV = D.curves;
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
  const IDLE = D.clips.idle, ATTACK = D.clips.attack, ANIMATED = new Set();
  for (const clip of [IDLE, ATTACK]) {
    clip.byBone = {};
    for (const nm in clip.curves) for (const k in clip.curves[nm]) {
      const cv = clip.curves[nm][k];
      (clip.byBone[cv.bone] = clip.byBone[cv.bone] || {})[k] = cv.keys;
      ANIMATED.add(cv.bone);
    }
  }
  const ANIM_LIST = Array.from(ANIMATED).sort((a, b) => a - b);

  // ---------------------------------------------------------------- mesh (head.bin)
  function loadMesh() {
    if (meshLoading) return meshLoading;
    const M = D.mesh;
    meshLoading = fetch(M.url + (REV ? '?v=' + REV : '')).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then(buf => {
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
    }).catch(e => { console.warn('[leviathan] head.bin load failed:', e.message); meshLoading = null; });
    return meshLoading;
  }

  // ---------------------------------------------------------------- vật liệu: Lit_Shader (như js/mimic.js: albedo × (nắng + đèn phụ + ambient + (1 − WaveMask.b))), sương của web
  // [ĐỀ XUẤT] Thân dưới nước: bản gốc dùng shader đồ thị Leviathan_Shader (_ArtificialRefractAmount 1 → 5 → 1) để thấy bóng khổng lồ qua nước; nước của web trong suốt theo
  // độ sâu nên thân ở y −12 hoàn toàn mất. Ở đây thân vẽ SAU nước (renderOrder 3, pha trộn) và ghi độ sâu như thể nằm ngay dưới mặt nước (gl_FragDepth: điểm cắt tia nhìn với
  // mặt y = 0, lùi 0,8 m về phía camera, cộng 1% khoảng chìm để các lớp thân không đè lẫn nhau), nên thuyền vẫn che được thân và thân không bị mặt nước nuốt. Phần chìm sẫm
  // về màu nước sâu, độ phủ uSub từ đường cong refract: 1 → 0, 5 → 0,8; phần trên mặt nước (y ≥ 0) đục hoàn toàn. Khi tấn công uSub cố định 0,85.
  const SUB_MAX = 0.8, SUB_ATTACK = 0.85;
  let uSub = null, uVP = null;
  function material() {
    const L = new T.TextureLoader(), alb = L.load(D.tex.albedo + (REV ? '?v=' + REV : ''));
    alb.encoding = T.sRGBEncoding; alb.wrapS = alb.wrapT = T.RepeatWrapping;
    const m = new T.MeshBasicMaterial({ map: alb, side: T.FrontSide, transparent: true, depthWrite: true });
    uSub = { value: 0 }; uVP = { value: new T.Matrix4() };
    m.onBeforeCompile = sh => {
      sh.uniforms.uSub = uSub; sh.uniforms.uVP = uVP;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSub; uniform mat4 uVP;')
        .replace('#include <output_fragment>', `
  vec3 wpA = vDrFogW;
  vec3 litA = diffuseColor.rgb * (uDrSunCol + drEnvLights(wpA) + uDrAmb + (1.0 - drEnvMaskB(wpA.xz)) + vec3(uDrTintK, 0.0, 0.0));
  float surfA = clamp(1.0 + wpA.y * 0.25, 0.0, 1.0);
  litA = mix(mix(litA, vec3(0.02, 0.05, 0.06), 0.45), litA, surfA);
  gl_FragColor = vec4(litA, mix(uSub, 1.0, surfA));
  if (wpA.y < 0.0 && cameraPosition.y > 0.0) {
    vec3 rdA = wpA - cameraPosition; float dPA = length(rdA); rdA /= dPA;
    float dQA = cameraPosition.y / max(-rdA.y, 1e-4);
    vec4 cA = uVP * vec4(cameraPosition + rdA * max(dQA + 0.01 * (dPA - dQA) - 0.8, 0.1), 1.0);
    gl_FragDepth = (cA.z / cA.w) * 0.5 + 0.5;
  } else gl_FragDepth = gl_FragCoord.z;`);
    };
    m.customProgramCacheKey = () => 'drLeviathan2';
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
      mesh.frustumCulled = false; mesh.name = 'LeviathanHead'; mesh.renderOrder = 3;   // sau nước (1) và bọt (2)
      mesh.onBeforeRender = (r, sc, cam) => { uVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); };
      mesh.bind(new T.Skeleton(D.skinBones.map(i => nodes[i]), D.bindPoses.map(a => new T.Matrix4().fromArray(a))), new T.Matrix4());
    }
    return { root: nodes[0], nodes, mesh };
  }

  // ---------------------------------------------------------------- tiện ích
  const _e = new T.Euler(0, 0, 0, 'YXZ');
  function lookQ(dx, dy, dz, out) {                                // LookRotation(hướng, up = y) trong toạ độ three.js: tiến tới = −z
    const h = Math.hypot(dx, dz);
    _e.set(Math.atan2(dy, h), Math.atan2(-dx, -dz), 0, 'YXZ');
    return out.setFromEuler(_e);
  }
  const fw = b => [-Math.sin(b.yaw), -Math.cos(b.yaw)];            // forward / right của thuyền trong three.js (js/events.js)
  const rt = b => [Math.cos(b.yaw), -Math.sin(b.yaw)];
  const boatY = () => (root.DRBoat && DRBoat.root ? DRBoat.root.position.y : 0);
  const deep = (x, z, min) => root.DRWorld.depth01(x, z) > min;
  const safe = (x, z) => !!(root.DREvents && DREvents.safe(x, z));
  function ensureScene() {
    if (scene) return true;
    let o = root.DRBoat && DRBoat.root;
    while (o && o.parent) o = o.parent;
    if (o && o.isScene) { scene = o; mat = material(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- Activate
  function spawn(e, ctx, withAttack) {
    if (inst || !ensureScene()) return null;
    const b = S().boat, f = fw(b), r = rt(b), half = P.pathLength * 0.5;
    const px = b.x + f[0] * P.intersectionPointOffsetZ, pz = b.z + f[1] * P.intersectionPointOffsetZ;   // điểm giao
    let ax = px + r[0] * half, az = pz + r[1] * half, bx = px - r[0] * half, bz = pz - r[1] * half;
    const minDepth = e.minDepth;
    let found = false, failed = false, ang = 0;
    for (let i = 0; i < 10; i++) {
      ang -= 18 * i;
      const th = ang * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
      const rot = (x, z) => [px + (x - px) * c - (z - pz) * s, pz + (x - px) * s + (z - pz) * c];   // RotatePointAroundPivot (Euler y, trái tay) trong z đổi dấu
      const p4 = rot(ax, az), p5 = rot(bx, bz);
      for (let j = 0; j <= 10; j++) {
        const t = j / 10;
        if (!deep(p4[0] + (p5[0] - p4[0]) * t, p4[1] + (p5[1] - p4[1]) * t, minDepth)) { failed = true; break; }
      }
      if (!failed) { found = true; ax = p4[0]; az = p4[1]; bx = p5[0]; bz = p5[1]; break; }
    }
    if (!found) return null;                                       // OnEventSpawnAborted + RequestEventFinish
    const o = build();
    scene.add(o.root); if (o.mesh) scene.add(o.mesh);
    const dl = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / dl, dz = (bz - az) / dl;
    o.root.position.set(ax, -40, az);
    lookQ(dx, 0, dz, o.root.quaternion);
    inst = { root: o.root, nodes: o.nodes, mesh: o.mesh, attackAfterDive: !!withAttack, e, state: 'SPAWNING', dir: [dx, dz], dest: [bx, bz], moveSpeed: P.pathLength / (P.spawnDuration + P.holdDuration + P.despawnDuration),
      t0: 0, clock: 0, acc: 0, age: 0, stateT: 0, away: false, sub: false, done: false, finishRequested: false, animT: 0, attackT: -1, fired: 0, disabledMove: false, disabledBoat: false, killed: false,
      refract: CV.spawnMaterialVisibilityCurve[0][1], rumble: null, wake: null, alt: null, loadedMesh: !!o.mesh };
    const pos = () => ({ x: inst.root.position.x, y: inst.root.position.y, z: inst.root.position.z });
    const A1 = P.audio;
    inst.rumble = voice('event.leviathan.rumble', { loop: true, vol: 0, pos: pos(), min: A1.rumble[0], max: A1.rumble[1] });
    inst.wake = voice('event.leviathan.wake', { loop: true, vol: 0, pos: pos(), min: A1.wake[0], max: A1.wake[1] });
    inst.call = voice(CALLS[Math.floor(Math.random() * CALLS.length)], { vol: 1, pos: pos(), min: A1.rumble[0], max: A1.rumble[1] });   // rumbleAudioSource.PlayOneShot(leviathanCallSFX.PickRandom())
    inst.boom = voice('event.leviathan.boom', { vol: 1, pos: pos(), min: A1.alt[0], max: A1.alt[1] });                                  // altAudioSource.PlayOneShot(leviathanAppearSFX)
    inst.sub = false;
    if (!meshData) loadMesh();
    pose();
    return handle;
  }

  // ---------------------------------------------------------------- RequestEventFinish / dọn
  function restoreBoat() {
    if (!root.DRBoat) return;
    if (inst && inst.disabledMove) DRBoat.blocked = false;                     // dọn khi sự kiện bị huỷ (ván mới / nạp sổ / hết hoạt ảnh mà thuyền chưa chết)
    if (inst && inst.disabledBoat && DRBoat.root) DRBoat.root.visible = true;
  }
  function requestFinish() {                                       // RequestEventFinish: Destroy ngay
    if (!inst || inst.finishRequested) return;
    inst.finishRequested = true; inst.done = true;
  }
  function finish() {
    if (!inst) return;
    restoreBoat();
    for (const v of [inst.rumble, inst.wake, inst.call, inst.boom, inst.atk]) { try { if (v) v.stop(0.3); } catch (e) { /* đã dừng */ } }
    scene.remove(inst.root); if (inst.mesh) { scene.remove(inst.mesh); inst.mesh.geometry.dispose(); }
    inst = null;
  }

  // ---------------------------------------------------------------- một bước FixedUpdate (LeviathanWorldEvent.cs:185-248)
  function fixed(dt) {
    const I = inst, b = S().boat;
    I.clock += dt; I.stateT += dt;
    const prog = d => (I.clock - I.t0) / d;
    let y = I.root.position.y;
    if (I.state === 'SPAWNING') {
      const p = prog(P.spawnDuration);
      y = evalCurve(CV.spawnYPosCurve, p);
      I.vRumble = P.maxVolume * evalCurve(CV.spawnVolumeCurve, p); I.vWake = P.maxVolume * evalCurve(CV.spawnWakeVolumeCurve, p);
      I.refract = evalCurve(CV.spawnMaterialVisibilityCurve, p);
      if (p >= 1) { I.t0 = I.clock; I.state = 'HOLDING'; I.stateT = 0; }
    } else if (I.state === 'DESPAWNING') {
      const p = prog(P.despawnDuration);
      y = evalCurve(CV.despawnYPosCurve, p);
      I.vRumble = P.maxVolume * evalCurve(CV.despawnVolumeCurve, p); I.vWake = P.maxVolume * evalCurve(CV.despawnWakeVolumeCurve, p);
      I.refract = evalCurve(CV.despawnMaterialVisibilityCurve, p);
      if (p >= 1) {
        const zone = root.DRWorld.zoneAt(b.x, b.z);
        if (I.attackAfterDive && deep(b.x, b.z, I.e.minDepth) && !(I.e.forbiddenZones || []).includes(zone) && !safe(b.x, b.z)) {
          I.state = 'ATTACKING'; I.stateT = 0; I.attackT = 0; I.fired = 0;                    // animator.SetTrigger("attack"): Idle → Attack, 0 s
          I.atk = voice('event.leviathan.attack', { vol: 1, pos: { x: b.x, y: 0, z: b.z }, min: P.audio.alt[0], max: P.audio.alt[1] });
        } else requestFinish();
      }
    } else if (I.state === 'HOLDING') {
      const p = prog(P.holdDuration);
      y = evalCurve(CV.holdYPosCurve, p);
      if (p >= 1) { I.t0 = I.clock; I.state = 'DESPAWNING'; I.stateT = 0; }
    }
    if (I.state === 'ATTACKING') {
      if (!I.away) {
        I.root.position.set(b.x, boatY(), b.z);
        lookQ(b.x - I.dest[0], 0, b.z - I.dest[1], I.root.quaternion);                          // LookRotation(người chơi − điểm đích)
      }
    } else {
      I.root.position.y = y;
      I.root.position.x += I.dir[0] * I.moveSpeed * dt; I.root.position.z += I.dir[1] * I.moveSpeed * dt;
    }
    I.root.updateMatrixWorld(true);
  }

  // sự kiện hoạt ảnh của Leviathan_Attack (LeviathanAnimationEvents.cs)
  function fireEvent(fn) {
    const I = inst, b = S().boat;
    if (I.away) return;
    if (fn === 'DisableMovement') { if (root.DRBoat) { DRBoat.stop(); DRBoat.blocked = true; } I.disabledMove = true; }
    else if (fn === 'DisableBoatModel') { if (root.DRBoat && DRBoat.root) DRBoat.root.visible = false; I.disabledBoat = true; }
    else if (fn === 'KillPlayer') {
      if (!safe(b.x, b.z)) { I.killed = true; root.DR.emit('death', 'leviathan'); }             // Player.Die()
    }
  }

  // ---------------------------------------------------------------- hoạt ảnh
  const _p1 = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() };
  function pose() {
    const I = inst, clip = I.attackT >= 0 ? ATTACK : IDLE, t = I.attackT >= 0 ? Math.min(I.attackT, clip.len) : I.animT % clip.len;
    for (const bi of ANIM_LIST) {
      sample(clip, t, bi, _p1);
      const n = I.nodes[bi];
      n.position.copy(_p1.p); n.quaternion.copy(_p1.q); n.scale.copy(_p1.s);
    }
  }
  function animate(dt) {
    const I = inst;
    if (I.attackT >= 0) {
      const t0 = I.attackT; I.attackT += dt;
      for (const ev of ATTACK.events) if (ev.t > t0 && ev.t <= I.attackT) fireEvent(ev.fn);
      // [ĐỀ XUẤT] bản gốc không bao giờ kết thúc ATTACKING nếu KillPlayer bị vùng an toàn chặn (thuyền kẹt không mô hình); web kết thúc sau hết clip + 0,5 s
      if (!I.killed && I.attackT > ATTACK.len + 0.5) requestFinish();
    } else I.animT += dt;
    pose();
  }

  function update(dt) {
    if (!inst) return;
    const I = inst;
    if (dt <= 0 || frozen) return;
    I.age += dt; I.acc += dt;
    let steps = 0;
    while (I.acc >= FIXED && steps < 25 && inst === I && !I.done) { I.acc -= FIXED; steps++; fixed(FIXED); }
    if (I.acc > FIXED) I.acc = 0;
    if (inst !== I || I.done) return;
    animate(dt);
    const p = I.root.position;
    for (const v of [I.rumble, I.wake, I.call, I.boom]) if (v) v.pos(p.x, p.y, p.z);
    if (uSub) uSub.value = I.state === 'ATTACKING' ? SUB_ATTACK : SUB_MAX * Math.min(1, Math.max(0, (I.refract - 1) / 4));
    if (I.rumble && I.vRumble != null) I.rumble.gain(I.vRumble, 0.05);
    if (I.wake && I.vWake != null) I.wake.gain(I.vWake, 0.05);
  }

  // ---------------------------------------------------------------- lịch sự kiện: js/events.js
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
  if (root.DREvents) {
    DREvents.register('Leviathan', { spawn: (e, ctx) => spawn(e, ctx, false) });
    DREvents.register('LeviathanAttack', { spawn: (e, ctx) => spawn(e, ctx, true) });
  }
  // Hiện thân: OnTeleportBegin → hasPlayerTeleportedAway + đăng ký OnTeleportComplete; OnTeleportComplete → RequestEventFinish
  if (root.DR && root.DR.on) {
    root.DR.on('manifestBegin', () => { if (inst && !inst.finishRequested) { inst.away = true; inst.sub = true; } });
    root.DR.on('manifestEnd', () => { if (inst && inst.sub) { inst.sub = false; requestFinish(); } });
  }

  // ---------------------------------------------------------------- BoundaryEnforcer
  const B = D.boundary;
  let bAcc = 0, bSpawned = false, bWarn = false, bDist = 0, warnEl = null;
  function warning(show) {
    if (!warnEl) {
      const st = document.createElement('style');
      st.textContent = '#dr-oob{position:fixed;left:0;right:0;top:16%;text-align:center;pointer-events:none;z-index:40;font:700 clamp(18px,3.2vw,34px)/1.35 inherit;letter-spacing:.08em;' +
        'color:#e8b7a0;text-shadow:0 0 12px #000,0 2px 4px #000;white-space:pre-line;opacity:0;transition:opacity .6s}#dr-oob.on{opacity:1}';
      document.head.appendChild(st);
      warnEl = document.createElement('div'); warnEl.id = 'dr-oob';
      warnEl.textContent = 'Đang vào vùng nước chưa lập bản đồ\nQUAY LẠI';       // out-of-bounds-warning: "Entering Uncharted Waters\nTURN BACK"
      document.body.appendChild(warnEl);
    }
    warnEl.classList.toggle('on', !!show);
  }
  function boundaryCheck() {                                       // DoBoundaryCheck
    const s = S(), b = s.boat;
    const d = Math.hypot(b.x - B.center[0], b.z - B.center[1]);
    bDist = d;
    const cur = root.DREvents && DREvents.current;
    if (d > B.hard && !bSpawned && !(cur && cur.name === B.event)) {
      if (root.DREvents) DREvents.debug.force(B.event);            // WorldEventManager.DoEvent
      bSpawned = true;
    }
    if (d < B.soft) bSpawned = false;
    bWarn = d > B.soft;
    warning(bWarn);
  }
  function updateBoundary(dt) {
    const Dr = root.DR;
    if (!Dr.s || !Dr.s.boat || Dr.mode === 'title') { if (bWarn) { bWarn = false; warning(false); } bSpawned = false; return; }
    if (Dr.mode === 'over') { warning(false); return; }
    bAcc += dt;
    if (bAcc > B.checkIntervalSec) { bAcc = 0; boundaryCheck(); }
  }
  if (root.DR && root.DR.on) { const rs = () => { bSpawned = false; bAcc = 0; bWarn = false; if (warnEl) warning(false); }; root.DR.on('newgame', rs); root.DR.on('load', rs); }

  // nhịp khung: bọc DRBoat.update (main.js gọi DRBoat.update(dt) mỗi khung, dt = 0 khi tạm dừng), không sửa js/boat.js
  let loadTimer = null;
  function tick(dt) {
    if (!scene) ensureScene();
    if (scene && !meshData && !meshLoading && !loadTimer) loadTimer = setTimeout(loadMesh, 1500);
    updateBoundary(dt);
  }
  if (root.DRBoat && typeof DRBoat.update === 'function' && !DRBoat.update._leviathan) {
    const orig = DRBoat.update;
    const wrapped = function (dt, env) { const r = orig.apply(this, arguments); try { tick(dt); } catch (e) { console.error('[leviathan]', e); } return r; };
    wrapped._leviathan = true;
    DRBoat.update = wrapped;
  }

  root.DRLeviathan = {
    update, get ready() { return !!meshData; },
    debug: {
      force: n => { if (inst) return false; if (root.DREvents) DREvents.debug.force(n || 'LeviathanAttack'); return !!inst; },
      simulate(sec) { const f = frozen; frozen = false; const n = Math.round(sec / FIXED); for (let i = 0; i < n && inst; i++) handle.update(FIXED); frozen = f; return !!inst; },
      freeze(on) { frozen = !!on; },
      state() {
        if (!inst) return null;
        const p = inst.root.position, b = S().boat;
        return { state: inst.state, x: p.x, y: p.y, z: p.z, clock: inst.clock, stateT: inst.stateT, attackT: inst.attackT, away: inst.away, refract: inst.refract, done: inst.done,
          killed: inst.killed, disabledMove: inst.disabledMove, disabledBoat: inst.disabledBoat, dist: Math.hypot(p.x - b.x, p.z - b.z), moveSpeed: inst.moveSpeed, dir: inst.dir.slice(), mesh: !!inst.mesh,
          rumbleVol: inst.vRumble, wakeVol: inst.vWake };
      },
      boundary: () => ({ dist: bDist, spawned: bSpawned, warn: bWarn, soft: B.soft, hard: B.hard, center: B.center.slice() }),
      check: () => { boundaryCheck(); return { dist: bDist, spawned: bSpawned, warn: bWarn }; },
      warningVisible: () => !!(warnEl && warnEl.classList.contains('on')),
      place(p) { if (!inst) return false; inst.root.position.x = p.x; inst.root.position.z = p.z; if (p.y != null) inst.root.position.y = p.y; inst.root.updateMatrixWorld(true); return true; },
      skipTo(sec) { if (!inst) return false; const f = frozen; frozen = false; while (inst && inst.clock < sec) handle.update(FIXED); frozen = f; return !!inst; },
      get active() { return !!inst; }, get mesh() { return inst && inst.mesh; }, get meshReady() { return !!meshData; }
    }
  };
})(window);
