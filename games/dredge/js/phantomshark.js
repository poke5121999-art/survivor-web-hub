/*
 * Cá mập ma của sự kiện thế giới PhantomShark (PhantomSharkWorldEvent.cs, MONSTERS.md §2.11, đơn vị U10). Dữ liệu: data/phantomshark.js (tools/phantomshark.py).
 *
 * Lịch bốc thăm: js/events.js (DREvents). PhantomShark: minWorldPhase 2, sanity 0..0,25, cả ngày, độ sâu dọc đường (−25,0,80)→(−10,0,75)→(−5,0,60)→(0,0,0)
 * > 0,02, không vùng an toàn, Xua đuổi dập tắt, còi không. Sinh tại thuyền + (−25, 0, 80) cục bộ (trái 25, trước 80), y = −1.
 *
 * Vòng chạy chép PhantomSharkWorldEvent.cs: FixedUpdate 0,02 s (ProjectSettings/TimeManager) với Time.deltaTime = 0,02.
 *   Activate (:87-118): tốc độ 10, trạng thái Appear, độ mờ 0 → 1 trong 1,5 s (DOTween mặc định OutQuad) rồi sang Chase; tiếng Appear + vòng lặp tăng 0 → 1
 *   trong 1 s; mặt hướng về phía PHẢI của thuyền (LookAt(vị trí + player.right phẳng)).
 *   FixedUpdate (:120-150): currentTurnSpeed = MoveTowards(→ 10, dt·1,5); Appear/Chase: Slerp(quay, LookRotation(người chơi − cá mập), turn·dt);
 *   Chase: nếu |dot(forward, (cá mập − người chơi) chuẩn hoá)| < 0,9 (dodgeSensitivity) thì Disappear → RequestEventFinish; tốc độ MoveTowards(→ 40, dt·7)
 *   rồi rb.velocity = forward·tốc độ (Rigidbody drag 1: PhysX nhân vận tốc (1 − drag·dt) trước khi cộng vị trí).
 *   OnTriggerEnter (:174-183): chạm thân thuyền (tag Player) → Disappear, tắt collider, Bite = true (hoạt ảnh há miệng → về Swim 0,1 s), dừng tiếng, phát Impact;
 *   cùng cú chạm đó SimplePlayerDetector → VariablePlayerDamager (2 điểm, oneHitOnly, requireOneHealthToKill: DRBoat.monsterHit).
 *   RequestEventFinish (:185-203): Exiting, tắt collider, tốc độ về 10 (vẫn tiến và tăng tốc tiếp), bật DisappearParticles, độ mờ → 0 trong delayBeforeDestroying 1,5 s,
 *   tiếng tắt dần 1,5 s, rồi huỷ (EventFinished).
 *
 * Hoạt ảnh: PhantomShark_Animator (tools/phantomshark.py đọc từ tệp): Swim lặp; hết 1 vòng (exitTime 1) hoà 3,5 s sang SwimMouthOpen (không điều kiện, nên cá mập tự há miệng),
 * Bite → về Swim trong 0,1 s.
 * Vật liệu: PhantomShark_Shader (DXBC): tan theo màu đỉnh R + nhiễu cuộn theo thế giới, mép sáng đỏ; màu = albedo + (1,2·albedo)², sương của web phủ lên.
 *
 * [ĐỀ XUẤT] chưa có: Volume hậu kỳ MonsterProfile (vignette đỏ 0,35 + quang sai màu 0,6, blend 0 → 50 m): web chưa có đường cho volume tạm; rung tay cầm spawnVibration.
 * [ĐỀ XUẤT] y người chơi lấy từ DRBoat.root (nổi theo sóng) hoặc 0; cú chạm đo bằng capsule (r 0,9, cao 4, nút Collider xoay 90° nên trục là tiến tới) với hộp bao thân thuyền.
 *
 *   DRPhantomShark.init(scene)  .update(dt)  .finish()
 *   DRPhantomShark.debug → { force(), state(), simulate(sec), place({x, z, yaw}), active }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_PHANTOMSHARK, EV = root.DR_WORLDEVENTS;
  if (!T || !D || !D.bones || !EV) { root.DRPhantomShark = null; return; }
  const ID = 'PhantomShark', P = D.params, FIXED = P.fixedDt;
  let scene = null, mat = null, uni = null, inst = null, frozen = false;   // frozen: chỉ cho kiểm thử/ảnh chụp (đứng yên giữa chừng)

  // ---------------------------------------------------------------- hoạt ảnh (Hermite theo từng thành phần như AnimationCurve; chép js/tentacle.js)
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
  const SWIM = D.clips.swim, MOUTH = D.clips.mouth, ANIMATED = new Set();
  for (const clip of [SWIM, MOUTH]) {
    clip.byBone = {};
    for (const nm in clip.curves) for (const k in clip.curves[nm]) {
      const cv = clip.curves[nm][k];
      (clip.byBone[cv.bone] = clip.byBone[cv.bone] || {})[k] = cv.keys;
      ANIMATED.add(cv.bone);
    }
  }
  const ANIM_LIST = Array.from(ANIMATED).filter(i => i > 0).sort((a, b) => a - b);   // nút gốc do mã đặt, không do clip
  const CT = D.controller;

  // ---------------------------------------------------------------- vật liệu (PhantomShark_Shader, DXBC đọc bằng tools/particles.py --dis)
  function material() {
    const loader = new T.TextureLoader(), M = D.material;
    const alb = loader.load(D.tex.albedo), noise = loader.load(D.tex.noise);
    alb.encoding = T.sRGBEncoding; alb.wrapS = alb.wrapT = T.RepeatWrapping;
    noise.encoding = T.LinearEncoding; noise.wrapS = noise.wrapT = T.RepeatWrapping;
    const m = new T.MeshBasicMaterial({ map: alb, side: T.DoubleSide });
    m.defines = { DR_OWN_FOG: '' };                                       // js/sky.js: bỏ sương chung, shader tự sương   // shader gốc Cull Off (trạng thái pass), hàng đợi AlphaTest 2450, không pha trộn
    uni = { uOp: { value: 0 }, uNoise: { value: noise }, uTile: { value: new T.Vector2(M.uvTiling[0], M.uvTiling[1]) }, uT: { value: 0 } };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aDis; varying float vDis;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vDis = aDis;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uOp, uT; uniform vec2 uTile; uniform sampler2D uNoise; varying float vDis;\nfloat drEdge;')
        .replace('#include <output_fragment>', `
  // x = sat(2·(1 − _Opacity) + R − 1); n = 1 − nhiễu(thế giới.xz·UVTiling + 0,1·t); bỏ điểm ảnh khi n < x; mép = (n·x)^20
  float dsX = clamp(2.0 * (1.0 - uOp) + vDis - 1.0, 0.0, 1.0);
  float dsN = 1.0 - texture2D(uNoise, vec2(vDrFogW.x, -vDrFogW.z) * uTile + uT * ${M.scrollK.toFixed(2)}).r;
  if (dsN - dsX < 0.0) discard;
  drEdge = pow(dsN * dsX, ${M.edgePow.toFixed(1)});
  vec3 dsA = diffuseColor.rgb;
  gl_FragColor = vec4(dsA + (${M.selfLit.toFixed(1)} * dsA) * (${M.selfLit.toFixed(1)} * dsA), 1.0);`)
        .replace('#include <fog_fragment>', `
  // sương riêng của shader gốc: k = min(khoảng cách tới camera / 350, 1) (0,002857 trong DXBC), màu sương của web; KHÔNG có sương đêm theo đèn nên cá mập vẫn sáng trong tối.
  // [ĐỀ XUẤT] bỏ hạng sương theo mặt nạ sóng và theo độ cao (mặt nạ WaveMask chưa nối vào đây); trộn sau mã hoá màu nên phần tự phát sáng cũng bị sương k ≤ 0,1 ở 35 m
  gl_FragColor.rgb = mix(gl_FragColor.rgb, drEnvFogColor(vDrFogW), min(distance(vDrFogW, cameraPosition) * 0.002857, 1.0));
  gl_FragColor.rgb += linearToOutputTexel(vec4(drEdge * vec3(${M.edgeColor.map(v => v.toFixed(6)).join(', ')}), 1.0)).rgb;`);
    };
    m.customProgramCacheKey = () => 'drPhantomShark';
    return m;
  }

  // ---------------------------------------------------------------- dựng một con
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
    const dis = new Float32Array(M.col.length / 4);
    for (let i = 0; i < dis.length; i++) dis[i] = M.col[i * 4];                  // màu đỉnh R
    g.setAttribute('aDis', new T.BufferAttribute(dis, 1));
    g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(M.skinIndex), 4));
    g.setAttribute('skinWeight', new T.BufferAttribute(new Float32Array(M.skinWeight), 4));
    g.setIndex(M.index);
    const mesh = new T.SkinnedMesh(g, mat);
    mesh.frustumCulled = false; mesh.name = 'PhantomShark';
    mesh.bind(new T.Skeleton(D.skinBones.map(i => nodes[i]), D.bindPoses.map(a => new T.Matrix4().fromArray(a))), new T.Matrix4());
    return { root: nodes[0], nodes, mesh };
  }

  // ---------------------------------------------------------------- tiện ích
  const outQuad = u => 1 - (1 - u) * (1 - u);                      // Ease.OutQuad: mặc định của DOTween.To
  const moveTowards = (a, b, d) => (Math.abs(b - a) <= d ? b : a + Math.sign(b - a) * d);
  const _q = new T.Quaternion(), _e = new T.Euler(0, 0, 0, 'YXZ'), _f = new T.Vector3(), _d = new T.Vector3();
  function lookQ(dx, dy, dz, out) {                                // LookRotation(hướng, up = y) trong toạ độ three.js: tiến tới = −z
    const h = Math.hypot(dx, dz);
    _e.set(Math.atan2(dy, h), Math.atan2(-dx, -dz), 0, 'YXZ');
    return out.setFromEuler(_e);
  }
  const boatY = () => (root.DRBoat && DRBoat.root ? DRBoat.root.position.y : 0);

  // ---------------------------------------------------------------- sự kiện
  function spawn(e, ctx) {
    if (inst || !scene) return null;
    const o = build(), S = root.DR.s, b = S.boat;
    scene.add(o.root); scene.add(o.mesh);
    o.root.position.set(ctx.x, P.spawnY, ctx.z);
    // Activate: LookAt(vị trí + player.right chuẩn hoá phẳng); right của thuyền (js/events.js): (cos yaw, −sin yaw)
    lookQ(Math.cos(b.yaw), 0, -Math.sin(b.yaw), o.root.quaternion);
    inst = { root: o.root, nodes: o.nodes, mesh: o.mesh, state: 'Appear', speed: P.initialSpeed, turn: 0, opacity: 0, tween: null, acc: 0, age: 0,
      hit: false, bite: false, collider: true, finishRequested: false, done: false, dispose: false,
      animT: 0, mouthT: 0, w: 0, inMouth: false, biteT: -1, w0: 0, afters: [], parts: [], voice: null, loop: null, clock: 0 };
    uni.uOp.value = 0;
    lerpOpacity(1, P.appearFadeSec, () => { inst.state = 'Chase'; });
    if (root.DRParticles) {
      inst.parts.push(DRParticles.spawn(D.particles.appear, { parent: inst.root }));
      inst.parts.push(DRParticles.spawn(D.particles.wake, { parent: inst.root, loop: true }));
    }
    if (root.DRAudio) {
      inst.loop = DRAudio.voice('event.shark.loop', { loop: true, pos: headPos(), min: P.audio.min, max: P.audio.max, fade: P.audio.fadeInSec });
      inst.voice = DRAudio.voice('event.shark.appear', { loop: false, pos: headPos(), min: P.audio.min, max: P.audio.max });
    }
    pose();
    return handle;
  }
  const headPos = () => { const p = inst ? inst.root.position : { x: 0, y: 0, z: 0 }; return { x: p.x, y: p.y, z: p.z }; };
  function lerpOpacity(to, sec, done) {
    inst.tween = { from: inst.opacity, to, sec, t: 0, done };       // DOTween.To: huỷ tween cũ rồi bắt đầu mới
  }
  function stopAudio(fade) { if (inst.loop) inst.loop.stop(fade); }

  function requestFinish() {                                       // RequestEventFinish (:185-203)
    if (!inst) return;
    inst.state = 'Exiting';
    if (inst.finishRequested) return;
    inst.finishRequested = true;
    inst.collider = false;
    inst.speed = 10;
    if (root.DRParticles) inst.parts.push(DRParticles.spawn(D.particles.disappear, { parent: inst.root }));
    lerpOpacity(0, P.delayBeforeDestroying, null);
    if (inst.loop) inst.loop.gain(0, P.delayBeforeDestroying / 3);   // movementAudioSource.DOFade(0, delayBeforeDestroying)
    inst.afters.push({ t: P.delayBeforeDestroying, fn() { inst.done = true; } });
  }
  function finish() {
    if (!inst) return;
    for (const p of inst.parts) { try { p.stop(); } catch (err) { /* hệ đã giải phóng */ } }
    if (inst.loop) inst.loop.stop(0.05);
    if (inst.voice) inst.voice.stop(0.05);
    scene.remove(inst.root); scene.remove(inst.mesh);
    inst.mesh.geometry.dispose();
    inst = null;
  }

  // ---------------------------------------------------------------- vật lý: một bước FixedUpdate + trigger
  function fixed(dt) {
    const I = inst, S = root.DR.s, b = S.boat, py = boatY();
    const px = b.x, pz = b.z;
    const r = I.root, pos = r.position;
    I.turn = moveTowards(I.turn, P.turnSpeedMax, dt * P.turnSpeed);
    const look = () => { lookQ(px - pos.x, py - pos.y, pz - pos.z, _q); r.quaternion.slerp(_q, Math.min(1, I.turn * dt)); };
    if (I.state === 'Appear') look();
    else if (I.state === 'Chase') {
      look();
      _d.set(pos.x - px, pos.y - py, pos.z - pz).normalize();
      _f.set(0, 0, -1).applyQuaternion(r.quaternion);
      I.chaseDot = _f.dot(_d);                                       // giá trị đã dùng để xét tránh (kiểm thử đọc ở state().chaseDot)
      if (Math.abs(I.chaseDot) < P.dodgeSensitivity) I.state = 'Disappear';
    } else if (I.state === 'Disappear') requestFinish();
    // rb.velocity = forward · currentVelocity (luôn đặt lại mỗi bước: drag làm |v| < maxSpeed)
    I.speed = moveTowards(I.speed, P.maxSpeed, dt * P.acceleration);
    _f.set(0, 0, -1).applyQuaternion(r.quaternion);
    const k = I.speed * Math.max(0, 1 - P.drag * dt) * dt;
    pos.x += _f.x * k; pos.y += _f.y * k; pos.z += _f.z * k;
    r.updateMatrixWorld(true);
    if (I.collider && !I.hit && contact()) onTrigger();
  }
  function onTrigger() {                                           // OnTriggerEnter + VariablePlayerDamager.OnPlayerHit
    const I = inst;
    I.hit = true; I.state = 'Disappear'; I.collider = false; I.bite = true;
    I.biteT = 0; I.w0 = I.w;                                       // anim.SetBool("Bite", true): SwimMouthOpen → Swim trong 0,1 s
    if (I.loop) I.loop.stop(0.05);
    if (root.DRAudio) I.voice = DRAudio.voice('event.shark.impact', { loop: true, pos: headPos(), min: P.audio.min, max: P.audio.max });   // clip Impact trên nguồn Loop = true
    if (root.DRBoat && DRBoat.monsterHit) DRBoat.monsterHit(D.hit.points, { requireOneHealth: D.hit.requireOneHealth, source: ID });
  }

  // capsule (nút Collider) với hộp bao thân thuyền: khoảng cách đoạn trục → hộp lồi, tìm cực tiểu bằng tìm kiếm tam phân
  const PC = (root.DR_BOAT && DR_BOAT.colliderSize && DR_BOAT.colliderSize.player) || { center: [0, 0.376, 0], size: [1.216, 0.648, 2.529] };
  const _a = new T.Vector3(), _b = new T.Vector3(), _p = new T.Vector3(), _inv = new T.Matrix4();
  function hullDist(a, b) {                                        // trong hệ cục bộ của hộp: khoảng cách từ đoạn ab tới hộp (3 đoạn hằng)
    const c = PC.center, h = PC.size, f = t => {
      _p.lerpVectors(a, b, t);
      const dx = Math.max(Math.abs(_p.x - c[0]) - h[0] / 2, 0), dy = Math.max(Math.abs(_p.y - c[1]) - h[1] / 2, 0), dz = Math.max(Math.abs(_p.z + c[2]) - h[2] / 2, 0);
      return Math.hypot(dx, dy, dz);
    };
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (f(m1) < f(m2)) hi = m2; else lo = m1; }
    return f((lo + hi) / 2);
  }
  function contact() {
    const bob = root.DRBoat && DRBoat.bob;
    if (!bob) return false;
    bob.updateWorldMatrix(true, false);
    _inv.copy(bob.matrixWorld).invert();
    const n = inst.nodes[D.hit.node], cp = D.hit.capsule, ax = cp.dir;           // dir 1 = trục Y cục bộ
    n.updateWorldMatrix(true, false);
    const y0 = cp.center[1] - cp.height / 2 + cp.radius, y1 = cp.center[1] + cp.height / 2 - cp.radius;
    _a.set(cp.center[0], ax === 1 ? y0 : cp.center[1], -cp.center[2]).applyMatrix4(n.matrixWorld).applyMatrix4(_inv);
    _b.set(cp.center[0], ax === 1 ? y1 : cp.center[1], -cp.center[2]).applyMatrix4(n.matrixWorld).applyMatrix4(_inv);
    return hullDist(_a, _b) <= cp.radius;
  }

  // ---------------------------------------------------------------- hoạt ảnh + trình bày mỗi khung
  const _p1 = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() }, _p2 = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() };
  function pose() {
    const I = inst, w = I.w;
    for (const bi of ANIM_LIST) {
      sample(SWIM, I.animT % SWIM.len, bi, _p1);
      if (w > 0) { sample(MOUTH, I.mouthT % MOUTH.len, bi, _p2); _p1.p.lerp(_p2.p, w); _p1.q.slerp(_p2.q, w); _p1.s.lerp(_p2.s, w); }
      const n = I.nodes[bi];
      n.position.copy(_p1.p); n.quaternion.copy(_p1.q); n.scale.copy(_p1.s);
    }
  }
  function animate(dt) {
    const I = inst;

    I.animT += dt;
    if (I.biteT >= 0) {                                            // Bite: kéo về Swim trong mouthToSwim.dur giây từ mức hoà hiện tại
      I.biteT += dt; I.w = I.w0 * Math.max(0, 1 - I.biteT / CT.mouthToSwim.dur); I.mouthT += dt;
    } else if (I.animT >= SWIM.len * CT.swimToMouth.exitTime) {    // hết 1 vòng Swim: bắt đầu hoà sang SwimMouthOpen (Swim vẫn chạy trong lúc hoà)
      if (!I.inMouth) { I.inMouth = true; I.mouthT = 0; I.mouthStart = I.animT; }
      else I.mouthT += dt;
      I.w = Math.min(1, (I.animT - I.mouthStart) / CT.swimToMouth.dur);
    }
    pose();
  }

  function update(dt) {
    if (!scene || !inst) return;
    const I = inst;
    if (dt <= 0 || frozen) return;
    I.clock += dt; uni.uT.value += dt;
    // tween độ mờ (OnUpdate đặt _Opacity)
    if (I.tween) {
      const tw = I.tween; tw.t += dt;
      const u = Math.min(1, tw.t / tw.sec);
      I.opacity = tw.from + (tw.to - tw.from) * outQuad(u);
      uni.uOp.value = I.opacity;
      if (u >= 1) { I.tween = null; if (tw.done) tw.done(); }
    }
    for (const a of I.afters.slice()) { a.t -= dt; if (a.t <= 0) { I.afters.splice(I.afters.indexOf(a), 1); a.fn(); } }
    I.acc += dt; I.age += dt;
    let steps = 0;
    while (I.acc >= FIXED && steps < 25 && inst === I) { I.acc -= FIXED; steps++; fixed(FIXED); }
    if (I.acc > FIXED) I.acc = 0;                                  // bỏ phần dồn khi khung treo quá lâu
    animate(dt);
    const hp = headPos();
    if (I.loop) I.loop.pos(hp.x, hp.y, hp.z);
    if (I.voice) I.voice.pos(hp.x, hp.y, hp.z);
    I.root.updateMatrixWorld(true);
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
  if (root.DREvents) DREvents.register(ID, { spawn });

  function init(sc) { scene = sc; mat = material(); }
  root.DRPhantomShark = { init, update, finish,
    debug: {
      force: () => { if (inst) return false; if (root.DREvents) DREvents.debug.force(ID); return !!inst; },
      simulate(sec) { const f = frozen; frozen = false; const n = Math.round(sec / FIXED); for (let i = 0; i < n && inst; i++) { handle.update(FIXED); } frozen = f; return !!inst; },   // chạy thẳng, bỏ qua freeze: kiểm thử tất định
      freeze(on) { frozen = !!on; },
      place(p) { if (!inst) return false; inst.root.position.x = p.x; inst.root.position.z = p.z; if (p.y != null) inst.root.position.y = p.y;
        if (p.yaw != null) { _e.set(0, p.yaw, 0, 'YXZ'); inst.root.quaternion.setFromEuler(_e); } inst.root.updateMatrixWorld(true); return true; },
      state() {
        if (!inst) return null;
        const f = new T.Vector3(0, 0, -1).applyQuaternion(inst.root.quaternion), b = root.DR.s.boat;
        const d = new T.Vector3(inst.root.position.x - b.x, inst.root.position.y - boatY(), inst.root.position.z - b.z).normalize();
        return { state: inst.state, speed: inst.speed, turn: inst.turn, opacity: inst.opacity, x: inst.root.position.x, y: inst.root.position.y, z: inst.root.position.z,
          dot: f.dot(d), dist: Math.hypot(inst.root.position.x - b.x, inst.root.position.z - b.z), hit: inst.hit, bite: inst.bite, w: inst.w, age: inst.age,
          finishRequested: inst.finishRequested, chaseDot: inst.chaseDot };
      },
      get active() { return !!inst; }, get mesh() { return inst && inst.mesh; }
    } };
})(window);
