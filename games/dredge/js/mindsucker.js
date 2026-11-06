/*
 * Mind Sucker (TSMonster) của Twisted Strand + ba bẫy cối của Phi công (WORLD-GAPS.md §4 / §6 R3, đơn vị r3mind).
 * Dữ liệu: data/mindsucker.js (tools/mindsucker.py: 14 TSMonsterTriggerBox + 20 điểm xuất hiện, cấu hình TSMonster, NavMeshAgent, Eye,
 * InsanityEffector, xương + mesh polySurface341, 13 clip TSM_*, ba bẫy Trap1-3, clip TwistedStrandTrapActivate, mesh bẫy, vật liệu, tiếng).
 *
 * TwistedStrandMonsterManager.cs (:50-66): thuyền đi VÀO một hộp kích hoạt (OnTriggerEnter) thì, nếu Xua đuổi không bật, chưa có quái và
 *   GetActiveTrapState(box.associatedMonsterId) == 0 (bẫy của vùng đó chưa mồi), đặt quái ở một điểm ngẫu nhiên trong spawnPointCandidates.
 *   Quái despawn xong (OnDespawned) thì tắt và cho sinh lại. Chỉ một con trong cả vùng.
 * TSMonster.cs (Update :176-275), số ở cảnh (data `monster.cfg`):
 *   - Animator: Spawn 3,33 s -[hết]-> SpawnIdle (lặp 1,33 s) -[emerge, exitTime 1]-> SpawnIdletoSearch 2,67 s -[hết]-> SearchIdle (lặp 5 s)
 *     ⇄ [detectsPlayer] SearchIdletoDrain 1,33 s -> DrainIdle (lặp 4 s); bất kỳ -[despawn]-> Banish 1,33 s. Chuyển 0,25 s có chéo mờ.
 *   - Sự kiện clip: OnPeekComplete (cuối Spawn) -> PEEKING; peekTimeUntilEmergeSec 1,5 -> EMERGING + trigger emerge; PlayEmergeSFX (0,5 s);
 *     OnEmergeComplete (2,667 s) -> SEARCHING (timeUntilSearchExpires = 7).
 *   - SEARCHING: Eye (FieldOfView: bán kính 20, góc 360°, chặn bởi đảo) thấy thuyền VÀ thuyền đang động (|v| > 0,25 m/s hoặc |ω| > 0,1 rad/s)
 *     thì timeSpentDetectingPlayer += dt, hạn tìm về 7; đủ detectTimeUntilDrainSec 1 -> DRAINING (detectsPlayer = true). Ngược lại hạn tìm −= dt,
 *     thời gian phát hiện −= dt (≥ 0); hết hạn tìm -> Despawn. => Đứng yên cạnh nó thì không bị hút, chỉ cần chờ nó lặn.
 *   - DRAINING: xa hơn stoppingDistance 8 thì bơi theo thuyền (NavMeshAgent 3,5 m/s, gia tốc 8, tìm đường lại mỗi 0,5 s); gần hơn thì đứng và quay
 *     về thuyền 2 rad/s. Mất dấu (Eye không thấy hoặc cuối đường cách thuyền > 2 m) đủ 3 s -> SEARCHING. Đã hút ≥ 5 s và sanity ≤ 0,05 ->
 *     DoEvent(Vines) + Despawn. Banish bật / bắt đầu hội thoại / cách điểm sinh > 100 m -> Despawn (Banish 1,33 s, tắt sau 2,5 s).
 *   - Hút: InsanityEffector (con của head_ctrl, chỉ bật trong DrainIdle theo m_IsActive của clip) là CapsuleCollider trigger bán kính 3,5,
 *     dài 20 theo trục z của đầu, mang SanityModifier full −10 (≤ 20 m, −10 tới 21 m), ignoreTimescale = 1: PlayerSanity cộng −10 vào tốc độ rồi
 *     × GlobalSanityModifier 0,015 × (1 − ResearchedSanityModifier) mỗi giây THẬT (kể cả khi thuyền đứng, giờ không trôi) = −0,15/s.
 *     [ĐỀ XUẤT] trục đầu lấy theo hướng thân quái (head_ctrl quay theo hoạt ảnh, không bóc rig ctrl); phần nền ngày/đêm vẫn do js/sky.js tính
 *     theo hệ số thời gian (bản gốc lấy ×1 khi có ignoreTimescale).
 * Bẫy (MortarQuestStepAnimatorTriggerable.cs + TwistedStrandTrapAnimationEvents.cs, Animator TwistedStrandTrapMain):
 *   Yarn Trap_Load: SetActiveTrapState n 1 + SetQuestStepCompleted SoldierSubMonster{n}_Trap -> QuestStepTriggerer -> trigger Activate ->
 *   clip TwistedStrandTrapActivate 20,567 s: quái trong bẫy trồi lên (Spawn -> Emerge -> BaitSeekMove), 10 s ăn mồi, 13 s bẫy sập, 17 s cối bắn
 *   (tiếng ở trại Phi công, tối đa 750 m), 19,4 s tiếng nổ, 20,333 s trúng, 20,567 s SetDestroyed + OnAnimationComplete: CompleteQuestStep
 *   SoldierSubMonster{n}_Wait + SetActiveTrapState n 2. Yarn Trap_InspectCorpse đưa "Chunk of Flesh" (quest-corpse, lưới SoldierInspectTrap{n})
 *   rồi trạng thái 3. Start(): trạng thái 1 khi nạp (thoát giữa chừng) -> hoàn tất ngay; 1/2/3 -> bẫy vỡ.
 *   Soldier_DeliverTrophy3 (xác thứ ba) mở lưới SoldierRelic (GridConfiguration Relic4Pickup, đặt sẵn relic4) => nguồn của relic4 (WORLD-GAPS §7.1).
 *   [ĐỀ XUẤT] lưới bẫy MonsterTrap_mesh đứng ở tư thế lưu trong cảnh (không chạy TrapActivateRW: hàm kẹp không rơi); hạt nổ cối thay bằng
 *   TentacleBigSplash + chớp sáng (MortarHit/ExplosionEffect chưa bóc).
 *
 *   DRMindSucker.update(dt)      gọi theo khung của thuyền (bọc DRBoat.update, không sửa js/boat.js)
 *   DRMindSucker.debug → { state(), boxes, spawnAt(boxName, k), despawn(), trap(n), drainRate, setT(n, t) }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_MINDSUCKER;
  if (!T || !D || !D.bones) { root.DRMindSucker = null; return; }
  const CFG = D.monster.cfg, AG = D.monster.agent, EYE = D.monster.eye, EFF = D.monster.effector, SAN = D.monster.sanity;
  const S = () => root.DR.s;
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // ---------------------------------------------------------------- tiếng: clip của tools/mindsucker.py, gọi được bằng tên gốc
  const A = root.DR_AUDIO;
  if (A) for (const [nm, a] of Object.entries(D.audio)) {
    const key = 'monster.mindsucker.' + nm.replace(/^Twisted Strand Monster - /, '').replace(/[^A-Za-z0-9]+/g, '_');
    if (!A[key]) A[key] = { src: a.src, loop: a.loop, vol: 1, orig: nm, bus: 'sfx' };
  }
  const voice = (nm, o) => { try { return root.DRAudio && nm && DRAudio.resolve(nm) ? DRAudio.voice(nm, o) : null; } catch (e) { return null; } };
  const sfx3 = (nm, p, src) => voice(nm, { vol: src ? src.vol : 1, pos: { x: p.x, y: 0.5, z: p.z }, min: src ? src.min : 15, max: src ? src.max : 75 });

  // ---------------------------------------------------------------- giải mã
  const bytes = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  function skinGeo() {   // định dạng ray.py pack_mesh
    const M = D.mesh, u8 = bytes(M.b64), n = M.n, tr = M.tris * 3;
    let o = 0;
    const u16 = c => { const a = new Uint16Array(u8.buffer.slice(o, o + c * 2)); o += c * 2; return a; };
    const pq = u16(n * 3), nq = new Int8Array(u8.buffer.slice(o, o + n * 3)); o += n * 3; if (o & 1) o++;
    const uq = u16(n * 2), si = u8.slice(o, o + n * 4); o += n * 4;
    const sw = u8.slice(o, o + n * 4); o += n * 4; if (o & 1) o++;
    const ix = u16(tr);
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), w = new Float32Array(n * 4);
    for (let i = 0; i < n * 3; i++) { const a = i % 3; pos[i] = M.pmin[a] + pq[i] / 65535 * (M.pmax[a] - M.pmin[a]); nrm[i] = nq[i] / 127; }
    for (let i = 0; i < n * 2; i++) { const a = i % 2; uv[i] = M.umin[a] + uq[i] / 65535 * (M.umax[a] - M.umin[a]); }
    for (let v = 0; v < n; v++) { let s = 0; for (let k = 0; k < 4; k++) s += sw[v * 4 + k]; for (let k = 0; k < 4; k++) w[v * 4 + k] = s > 0 ? sw[v * 4 + k] / s : (k ? 0 : 1); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(si), 4));
    g.setAttribute('skinWeight', new T.BufferAttribute(w, 4)); g.setIndex(new T.BufferAttribute(ix, 1));
    D.groups.forEach((gr, i) => g.addGroup(gr.start, gr.count, i));
    return g;
  }
  function staticGeo(M) {   // định dạng mindsucker.py merge
    const u8 = bytes(M.b64), n = M.n;
    let o = 0;
    const pq = new Uint16Array(u8.buffer.slice(0, n * 6)); o = n * 6;
    const nq = new Int8Array(u8.buffer.slice(o, o + n * 3)); o += n * 3; if (o & 1) o++;
    const uq = new Uint16Array(u8.buffer.slice(o, o + n * 4)); o += n * 4;
    const ix = new Uint16Array(u8.buffer.slice(o, o + M.tris * 6));
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let i = 0; i < n * 3; i++) { const a = i % 3; pos[i] = M.pmin[a] + pq[i] / 65535 * (M.pmax[a] - M.pmin[a]); nrm[i] = nq[i] / 127; }
    for (let i = 0; i < n * 2; i++) { const a = i % 2; uv[i] = M.umin[a] + uq[i] / 65535 * (M.umax[a] - M.umin[a]); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setIndex(new T.BufferAttribute(ix, 1));
    return g;
  }
  // rãnh hoạt ảnh: Int16 base64 -> Float32 (quaternion /32767, vị trí theo hộp)
  function track(t) {
    if (t._q !== undefined) return t;
    t._q = t.q ? Float32Array.from(new Int16Array(bytes(t.q).buffer), v => v / 32767) : null;
    if (t.p) {
      const r = new Int16Array(bytes(t.p).buffer), p = new Float32Array(r.length);
      for (let i = 0; i < r.length; i++) { const a = i % 3; p[i] = t.plo[a] + (r[i] + 32768) / 65535 * (t.phi[a] - t.plo[a]); }
      t._p = p;
    } else t._p = null;
    return t;
  }

  // ---------------------------------------------------------------- vật liệu (ánh sáng chung của thế giới như js/ray.js, có kiểm độ sâu)
  const texCache = {};
  const tex = (nm, srgb) => {
    if (!texCache[nm]) { const t = new T.TextureLoader().load(D.tex[nm]); t.wrapS = t.wrapT = T.RepeatWrapping; if (srgb) t.encoding = T.sRGBEncoding; texCache[nm] = t; }
    return texCache[nm];
  };
  const GLOW_K = 0.1;   // [ĐỀ XUẤT] phát sáng = GlowMask × màu × (Vector1 hoạt ảnh 0..30) × 0,1, chặn 1,2 (web không có bloom HDR; chưa rã DXBC GlowPulse_Shader)
  function material(name, uni) {
    const md = D.mat[name] || {};
    const m = new T.MeshBasicMaterial({ map: md.map ? tex(md.map, true) : null, side: T.FrontSide });
    const glow = !!md.glow;
    const u = uni ? { uMsGlow: uni.uMsGlow, uMsCol: uni.uMsCol } : { uMsGlow: { value: 0 }, uMsCol: { value: new T.Vector3(...(md.glowColour || [0, 0, 0])) } };
    if (glow) u.uMsTex = { value: tex(md.glow, false) };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + (glow ? 'uniform sampler2D uMsTex; uniform float uMsGlow; uniform vec3 uMsCol;\n' : ''))
        .replace('#include <output_fragment>', `
  vec3 wpM = vDrFogW;
  vec3 litM = diffuseColor.rgb * (uDrSunCol * drEnvCloud(wpM) + drEnvLights(wpM) + uDrAmb + (1.0 - drEnvMaskB(wpM.xz)) + vec3(uDrTintK, 0.0, 0.0));
  gl_FragColor = vec4(litM, 1.0);`)
        .replace('#include <fog_fragment>', '#include <fog_fragment>\n' + (glow ? '  gl_FragColor.rgb += linearToOutputTexel(vec4(min(drS2L(texture2D(uMsTex, vUv).rgb) * uMsCol * uMsGlow * ' + GLOW_K.toFixed(3) + ', vec3(1.2)), 1.0)).rgb;' : ''));
    };
    m.customProgramCacheKey = () => 'drMind' + (glow ? 'G' : '');
    m.userData.uni = u;
    return m;
  }

  // ---------------------------------------------------------------- một bộ xương + mesh (quái lang thang hoặc quái trong bẫy)
  const SKIN_GEO = { g: null };
  function buildMonster(parent) {
    const nodes = D.bones.map((b, i) => {
      const o = D.skinBones.includes(i) ? new T.Bone() : new T.Object3D();
      o.name = b.name; o.position.fromArray(b.p); o.quaternion.fromArray(b.q); o.scale.fromArray(b.s);
      o.userData.rest = { p: b.p, q: b.q };
      return o;
    });
    const rootG = new T.Group(); rootG.name = 'TSMonster';
    D.bones.forEach((b, i) => (b.parent >= 0 ? nodes[b.parent] : rootG).add(nodes[i]));
    if (!SKIN_GEO.g) SKIN_GEO.g = skinGeo();
    const uni = { uMsGlow: { value: 0 }, uMsCol: { value: new T.Vector3(0.451, 0.361, 0.18) } };   // một bộ uniform cho cả hai vật liệu (renderer.material.* của clip)
    const mats = D.groups.map(g => material(g.mat, uni));
    const mesh = new T.SkinnedMesh(SKIN_GEO.g, mats);
    mesh.frustumCulled = false; mesh.renderOrder = 2.5; mesh.name = 'polySurface341';
    // bindpose Unity = (xương → nút Animator)⁻¹: mesh ở gốc thế giới, bindMatrix đơn vị (như js/ray.js)
    mesh.bind(new T.Skeleton(D.skinBones.map(i => nodes[i]), D.bindPoses.map(a => new T.Matrix4().fromArray(a))), new T.Matrix4());
    parent.add(rootG);
    return { root: rootG, nodes, mesh, uni, anim: player(nodes, uni) };
  }

  // Bộ chạy clip: chéo mờ tuyến tính (nlerp) trong dur giây; sự kiện clip phát khi đầu đọc đi qua (trước, sau].
  function player(nodes, uni) {
    const P = { clip: null, name: '', t: 0, prev: null, fade: 0, dur: 0, onEvent: null, onLoop: null, done: false, rootSink: null };
    const qa = new T.Quaternion(), qb = new T.Quaternion(), pa = new T.Vector3();
    function sampleInto(c, t, out) {   // out[b] = {q: [..], p: [..]}
      const f = Math.min(c.n - 1, Math.max(0, t * c.fps)), i0 = Math.floor(f), a = f - i0;
      for (const tr0 of c.tracks) {
        const tr = track(tr0), o = out[tr.b] || (out[tr.b] = {});
        if (tr._q) {
          const n = tr.qn, j0 = Math.min(n - 1, i0) * 4, j1 = Math.min(n - 1, i0 + 1) * 4;
          qa.set(tr._q[j0], tr._q[j0 + 1], tr._q[j0 + 2], tr._q[j0 + 3]);
          if (n > 1 && a > 0) { qb.set(tr._q[j1], tr._q[j1 + 1], tr._q[j1 + 2], tr._q[j1 + 3]); qa.slerp(qb, a); }
          o.q = [qa.x, qa.y, qa.z, qa.w];
        }
        if (tr._p) {
          const n = tr.pn, j0 = Math.min(n - 1, i0) * 3, j1 = Math.min(n - 1, i0 + 1) * 3, b = n > 1 ? a : 0;
          o.p = [tr._p[j0] + (tr._p[j1] - tr._p[j0]) * b, tr._p[j0 + 1] + (tr._p[j1 + 1] - tr._p[j0 + 1]) * b, tr._p[j0 + 2] + (tr._p[j1 + 2] - tr._p[j0 + 2]) * b];
        }
      }
      if (c.glow) out.glow = c.glow[Math.min(c.n - 1, Math.round(f))];
      if (c.col) out.col = c.col[Math.min(c.n - 1, Math.round(f))];
      return out;
    }
    P.play = (name, dur) => {
      if (P.clip) P.prev = { clip: P.clip, t: P.t };
      P.clip = D.clips[name]; P.name = name; P.t = 0; P.dur = dur || 0; P.fade = 0; P.done = false;
    };
    P.update = dt => {
      const c = P.clip; if (!c) return;
      const t0 = P.t;
      P.t += dt;
      if (P.prev) { P.prev.t += dt; P.fade += dt; if (P.fade >= P.dur) P.prev = null; }
      for (const e of c.events) if (e.t > (t0 === 0 ? -1 : t0) && e.t <= Math.min(P.t, c.len) && P.onEvent) P.onEvent(e.fn, P.name);
      if (P.t >= c.len) {
        if (c.loop) { P.t -= c.len; if (P.onLoop) P.onLoop(P.name); for (const e of c.events) if (e.t <= P.t && P.onEvent) P.onEvent(e.fn, P.name); }
        else if (!P.done) { P.done = true; P.t = c.len; if (P.onEnd) P.onEnd(P.name); }
      }
      if (P.clip !== c) return;   // onEvent/onEnd đã đổi clip: khung sau lấy mẫu
      const cur = sampleInto(c, Math.min(P.t, c.len), {});
      let w = 1, old = null;
      if (P.prev && P.dur > 0) { w = clamp01(P.fade / P.dur); old = sampleInto(P.prev.clip, P.prev.clip.loop ? P.prev.t % P.prev.clip.len : Math.min(P.prev.t, P.prev.clip.len), {}); }
      for (const k in cur) {
        if (k === 'glow' || k === 'col') continue;
        const o = cur[k], node = k === 'root' ? P.rootSink : nodes[k];
        if (!node) continue;
        const ob = old && old[k];
        if (o.q) { node.quaternion.fromArray(o.q); if (ob && ob.q) { qb.fromArray(ob.q); node.quaternion.copy(qb.slerp(node.quaternion, w)); } }
        if (o.p) { node.position.fromArray(o.p); if (ob && ob.p) { pa.fromArray(ob.p); node.position.lerpVectors(pa, node.position, w); } }
      }
      if (uni) {
        if (cur.glow != null) uni.uMsGlow.value = old && old.glow != null ? old.glow + (cur.glow - old.glow) * w : cur.glow;
        if (cur.col) uni.uMsCol.value.set(cur.col[0], cur.col[1], cur.col[2]);
      }
    };
    return P;
  }

  // ---------------------------------------------------------------- quái lang thang
  const ST = { SPAWNING: 'SPAWNING', PEEKING: 'PEEKING', EMERGING: 'EMERGING', SEARCHING: 'SEARCHING', DRAINING: 'DRAINING', DESPAWNING: 'DESPAWNING' };
  let scene = null, mon = null, M = null;   // M: trạng thái con đang sống
  const _v = new T.Vector3();
  let banish = false, lastS = null;
  const boxIn = D.manager.boxes.map(() => false);
  const dbg = { spawns: 0, despawns: 0, drained: 0, lastDespawn: '', rate: 0 };

  function ensureScene() {
    if (scene) return true;
    scene = root.DRBoat && DRBoat.root && DRBoat.root.parent;
    return !!scene;
  }
  function spawn(box, k) {
    if (!ensureScene()) return false;
    const sp = D.manager.spawns[box.spawns[k == null ? Math.floor(Math.random() * box.spawns.length) : k]];
    if (!mon) mon = buildMonster(scene);
    scene.add(mon.mesh);
    mon.root.visible = mon.mesh.visible = true;
    mon.root.position.set(sp.x, 0, sp.z); mon.root.rotation.set(0, sp.yaw, 0);
    M = { state: ST.SPAWNING, box: box.name, spawn: { x: sp.x, z: sp.z }, x: sp.x, z: sp.z, yaw: sp.yaw, peek: 0, detect: 0, lost: 0, expire: CFG.searchTimeUntilGiveUpSec,
      repath: CFG.timeBetweenRepaths, drainT: 0, detects: false, emergePending: false, path: null, speed: 0, despawnT: 0, scanVol: 0, drainVol: 0,
      scan: null, drain: null, eff: false, tracked: false, eyeT: 0 };
    const P = mon.anim;
    P.onEvent = (fn, clip) => {
      if (!M) return;
      if (fn === 'OnPeekComplete' && M.state === ST.SPAWNING) M.state = ST.PEEKING;          // TSMonster.OnPeekComplete (bỏ đăng ký sau lần đầu)
      else if (fn === 'OnEmergeComplete' && M.state === ST.EMERGING) { M.expire = CFG.searchTimeUntilGiveUpSec; M.state = ST.SEARCHING; }
      else if (fn === 'PlayEmergeSFX') { const p = { x: M.x, z: M.z }; sfx3(pick(D.monster.audio.emerge), p, D.monster.audio.main); sfx3(pick(D.monster.audio.splash), p, D.monster.audio.main); }
      else if (fn === 'PlaySubmergeSFX') sfx3(pick(D.monster.audio.submerge), { x: M.x, z: M.z }, D.monster.audio.main);
    };
    // máy trạng thái của TwistedStrandMonsterAnimator (chuyển: data `ctrl.transitions`)
    P.onEnd = name => {
      if (name === 'TSM_SpawnRW') P.play('TSM_SpawnIdleRW', 0);
      else if (name === 'TSM_SpawnIdletoSearchRW') P.play('TSM_SearchIdleRW', 0);
      else if (name === 'TSM_SearchIdletoDrainRW') P.play('TSM_DrainIdleRW', 0);
    };
    P.onLoop = name => { if (name === 'TSM_SpawnIdleRW' && M && M.emergePending) { M.emergePending = false; P.play('TSM_SpawnIdletoSearchRW', 0); } };   // exitTime 1
    P.clip = null; P.prev = null; P.play('TSM_SpawnRW', 0);
    const au = D.monster.audio;
    M.scan = voice(au.scan.clip, { loop: true, vol: 0, pos: { x: M.x, y: 1, z: M.z }, min: au.scan.min, max: au.scan.max });
    M.drain = voice(au.drain.clip, { loop: true, vol: 0, pos: { x: M.x, y: 1, z: M.z }, min: au.drain.min, max: au.drain.max });
    dbg.spawns++;
    return true;
  }
  function despawn(why) {
    if (!M || M.state === ST.DESPAWNING) return;
    M.state = ST.DESPAWNING; M.despawnT = 0; M.eff = false; dbg.lastDespawn = why || '';
    mon.anim.play('TSM_BanishRW', 0.25);   // any-state -[despawn]-> TSM_Banish
  }
  function finishDespawn() {   // OnDespawnComplete (Invoke 2,5 s) -> manager tắt quái
    if (M) { if (M.scan) M.scan.stop(0.3); if (M.drain) M.drain.stop(0.3); }
    M = null; dbg.despawns++;
    if (mon) { mon.root.visible = false; mon.mesh.visible = false; if (mon.mesh.parent) mon.mesh.parent.remove(mon.mesh); }
  }
  const trapState = id => (S().vars['trap-' + id + '-state'] | 0);
  const banishOn = () => banish || !!(root.DREvents && DREvents.banished);
  const gameMode = () => (root.DREvents && DREvents.gameMode) || 'NORMAL';

  function boxHit(bx, x, z) {   // hộp xoay quanh y (three: rotation.y = yaw), cạnh x = hx, z = hz (+ đệm cho thân thuyền)
    const dx = x - bx.x, dz = z - bx.z, c = Math.cos(bx.yaw), s = Math.sin(bx.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c, pad = D.manager.triggerPad;
    return Math.abs(lx) <= bx.hx + pad && Math.abs(lz) <= bx.hz + pad;
  }
  function eyeSees(b) {   // FieldOfView.FindTargetForMask: trong bán kính, góc 360°, không bị đảo chắn
    const d = Math.hypot(b.x - M.x, b.z - M.z, EYE.y);
    if (d > EYE.viewRadius) return false;
    const nav = root.DRNav;
    return !(nav && nav.ready && nav.ray({ x: M.x, z: M.z }, { x: b.x, z: b.z }, 'generic'));
  }
  function turnTo(tx, tz, rate, dt) {
    const want = Math.atan2(-(tx - M.x), -(tz - M.z));
    let d = want - M.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const st = rate * dt;
    M.yaw += Math.abs(d) <= st ? d : Math.sign(d) * st;
  }
  let prevYaw = null;
  function boatMotion(b, dt) {
    const v = Math.hypot(b.vx || 0, b.vz || 0);
    let w = 0;
    if (prevYaw != null && dt > 0) { let d = b.yaw - prevYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); w = Math.abs(d) / dt; }
    prevYaw = b.yaw;
    return { v, w };
  }
  function effectorHit(b) {   // CapsuleCollider (trục z của InsanityEffector, tâm z 10, cao 20, bán kính 3,5) ở đầu quái
    const head = mon.nodes[D.monster.headBone];
    head.getWorldPosition(_v);
    const fx = -Math.sin(M.yaw), fz = -Math.cos(M.yaw);          // hướng trước của thân quái (three)
    const a = EFF.center[2] - (EFF.height / 2 - EFF.radius), bb = EFF.center[2] + (EFF.height / 2 - EFF.radius);
    const dx = b.x - _v.x, dz = b.z - _v.z, dy = 0 - _v.y;
    const along = Math.max(a, Math.min(bb, dx * fx + dz * fz));
    const px = _v.x + fx * along, pz = _v.z + fz * along;
    return Math.hypot(b.x - px, dy, b.z - pz) <= EFF.radius;
  }
  function sanityValue(b, day) {   // SanityModifier.GetModifierValueForPoint (khoảng cách tới gốc InsanityEffector = đầu)
    const d = Math.hypot(b.x - _v.x, b.z - _v.z, _v.y);
    if (d > SAN.partialValueRadius) return 0;
    const full = day ? SAN.fullValueDay : SAN.fullValueNight, mn = day ? SAN.partialValueMinDay : SAN.partialValueMinNight;
    if (d < SAN.fullValueRadius) return full;
    return mn + (full - mn) * (1 - (d - SAN.fullValueRadius) / (SAN.partialValueRadius - SAN.fullValueRadius));
  }

  function updateMonster(dt, b) {
    const P = mon.anim;
    if (M.state === ST.DESPAWNING) {
      M.despawnT += dt;
      if (M.despawnT >= CFG.despawnInvokeSec) { finishDespawn(); return; }
    } else if (Math.hypot(M.x - M.spawn.x, M.z - M.spawn.z) > CFG.spawnDistanceThreshold) despawn('distance');
    if (M.state === ST.PEEKING) {
      M.peek += dt;
      if (M.peek >= CFG.peekTimeUntilEmergeSec) { M.state = ST.EMERGING; M.emergePending = true; }
    }
    // Eye.FindTarget mỗi 0,25 s
    M.eyeT -= dt;
    if (M.eyeT <= 0) { M.eyeT = EYE.timeBetweenSearchesSec; M.tracked = eyeSees(b); }
    const mo = boatMotion(b, dt);
    if (M.state === ST.SEARCHING) {
      if (gameMode() !== 'PASSIVE' && M.tracked && (mo.v > CFG.velocityMagnitudeThreshold || mo.w > CFG.angularVelocityMagnitudeThreshold)) {
        M.detect += dt; M.expire = CFG.searchTimeUntilGiveUpSec;
        if (M.detect >= CFG.detectTimeUntilDrainSec) {
          M.lost = 0; M.repath = 0; M.state = ST.DRAINING; M.detects = true;
          if (P.name === 'TSM_SearchIdleRW') P.play('TSM_SearchIdletoDrainRW', 0.25);
        }
      } else {
        M.expire -= dt; M.detect = Math.max(0, M.detect - dt);
      }
      if (M.expire <= 0) despawn('search expired');
    }
    if (M.state === ST.DRAINING) {
      if (gameMode() === 'PASSIVE') despawn('passive');
      const dist = Math.hypot(M.x - b.x, M.z - b.z);
      const close = dist < AG.stoppingDistance;
      if (close) { M.speed = 0; turnTo(b.x, b.z, CFG.rotationSpeedRadPerSec, dt); }
      M.drainT += dt;
      if (M.drainT >= CFG.minTimeSpentDraining && S().sanity <= CFG.drainSanityCut) {
        try { if (root.DREvents && DREvents.debug) DREvents.debug.force(CFG.vineAttack); } catch (e) { /* Vines thuộc đơn vị R4 */ }
        despawn('vines');
      }
      let reach = true;
      M.repath -= dt;
      if (M.repath <= 0 && !close) {
        M.repath = CFG.timeBetweenRepaths;
        const nav = root.DRNav;
        M.path = nav && nav.ready ? nav.path({ x: M.x, z: M.z }, { x: b.x, z: b.z }, 'generic') : [{ x: M.x, z: M.z }, { x: b.x, z: b.z }];
        if (M.path && M.path.length) { const e = M.path[M.path.length - 1]; reach = Math.hypot(e.x - b.x, e.z - b.z) < CFG.arriveDistanceThreshold; }
      }
      if (reach && M.tracked) M.lost = 0; else M.lost += dt;
      if (M.lost >= CFG.lossTimeUntilLoseDetectionSec) {
        M.detect = 0; M.expire = CFG.searchTimeUntilGiveUpSec; M.state = ST.SEARCHING; M.detects = false;
        if (P.name !== 'TSM_SearchIdleRW') P.play('TSM_SearchIdleRW', 0.25);   // DrainIdle / SearchIdletoDrain -[!detectsPlayer]-> SearchIdle
      }
      // NavMeshAgent: tăng tốc 8 m/s² tới 3,5 m/s theo các góc đường, dừng khi còn ≤ stoppingDistance tới thuyền
      if (!close && M.path && M.path.length > 1) {
        while (M.path.length > 1 && Math.hypot(M.path[1].x - M.x, M.path[1].z - M.z) < 0.5) M.path.shift();
        const nx = M.path[Math.min(1, M.path.length - 1)];
        M.speed = Math.min(AG.speed, M.speed + AG.acceleration * dt);
        const dx = nx.x - M.x, dz = nx.z - M.z, L = Math.hypot(dx, dz) || 1, st = Math.min(L, M.speed * dt);
        M.x += dx / L * st; M.z += dz / L * st;
        turnTo(nx.x, nx.z, AG.angularSpeed * Math.PI / 180, dt);
      }
    }
    // hoạt ảnh + đặt gốc
    P.update(dt);
    mon.root.position.set(M.x, 0, M.z); mon.root.rotation.set(0, M.yaw, 0);
    mon.root.updateMatrixWorld(true);
    // hút sanity: InsanityEffector bật trong DrainIdle (m_IsActive), tắt ở Banish
    M.eff = M.state !== ST.DESPAWNING && P.name === 'TSM_DrainIdleRW';
    dbg.rate = 0;
    if (M.eff && effectorHit(b)) {
      const day = root.DRSky && DRSky.env ? DRSky.env.isDay : true;
      let r = sanityValue(b, day) * (root.DR_CONFIG.globalSanityModifier || 0.015);
      if (r < 0) r *= 1 - (root.DRBooks ? DRBooks.mod('SANITY_RESILIENCE') : 0);
      dbg.rate = r;
      const s0 = S().sanity;
      S().sanity = clamp01(s0 + r * dt);   // ignoreTimescale: theo giây thật
      dbg.drained += s0 - S().sanity;
    }
    // tiếng quét / hút: âm lượng Lerp(v, đích, dt)
    M.scanVol += ((M.state === ST.SEARCHING ? 1 : 0) - M.scanVol) * Math.min(1, dt);
    M.drainVol += ((M.state === ST.DRAINING ? 1 : 0) - M.drainVol) * Math.min(1, dt);
    if (M.scan) { M.scan.gain(M.scanVol, 0.05); M.scan.pos(M.x, 1, M.z); }
    if (M.drain) { M.drain.gain(M.drainVol, 0.05); M.drain.pos(M.x, 1, M.z); }
  }

  // ---------------------------------------------------------------- bẫy
  const traps = [];
  let trapsFor = null;
  const TM = D.trapMain, EVT = TM.events;
  const activeAt = (name, t) => { const k = TM.active[name]; if (!k) return null; let v = k[0][1]; for (const [tt, vv] of k) if (t >= tt) v = vv; return !!v; };
  function buildTraps() {
    if (!ensureScene()) return false;
    const geos = {};
    const group = (kind) => {
      const g = new T.Group(); g.name = kind;
      for (const [mn, M0] of Object.entries(D.trapMesh[kind])) {
        const key = kind + '|' + mn;
        if (!geos[key]) geos[key] = staticGeo(M0);
        const m = new T.Mesh(geos[key], material(mn));
        m.renderOrder = 2.5; g.add(m);
      }
      return g;
    };
    for (const tr of D.traps) {
      const g = new T.Group(); g.name = tr.name;
      g.position.set(tr.x, 0, tr.z); g.rotation.y = tr.yaw;
      const act = group('active'), des = group('destroyed'), bait = group('bait');
      g.add(act, des, bait);
      scene.add(g);
      traps.push({ d: tr, g, act, des, bait, mon: null, seq: -1, fired: 0, hitFx: null });
    }
    return true;
  }
  function showIdle(t) { t.act.visible = true; t.des.visible = false; t.bait.visible = false; if (t.mon) { t.mon.root.visible = t.mon.mesh.visible = false; } }
  function showDestroyed(t) { t.act.visible = false; t.des.visible = true; t.bait.visible = false; if (t.mon) { t.mon.root.visible = t.mon.mesh.visible = false; } }
  function trapMonster(t) {
    if (!t.mon) {
      t.mon = buildMonster(t.g);
      t.mon.anim.rootSink = t.mon.root;
      const ml = t.d.monsterLocal; t.mon.root.position.fromArray(ml.p); t.mon.root.quaternion.fromArray(ml.q);
      const P = t.mon.anim;   // TSMonsterTrapped: Spawn -> Emerge -[exit 0,906, 0,25 s]-> BaitSeekMove ⇄ Eat -> BaitEatStart -> BaitEatIdle -[TriggerTrap]-> TrapActivate
      P.onEnd = n => {
        if (n === 'TSM_Spawn') P.play('TSM_SpawnIdletoSearch', 0);
        else if (n === 'TSM_BaitEatStart') P.play('TSM_BaitEatIdle', 0);
      };
    }
    scene.add(t.mon.mesh);
    t.mon.root.visible = t.mon.mesh.visible = true;
    return t.mon;
  }
  // root của quái trong bẫy chạy theo đường cong 'TSMonster' của TwistedStrandTrapActivate
  function placeTrapRoot(t, time) {
    const f = Math.min(TM.n - 1, time * TM.fps), i0 = Math.floor(f), a = f - i0;
    for (const tr0 of TM.tracks) {
      const tr = track(tr0);
      if (tr._p) { const n = tr.pn, j0 = Math.min(n - 1, i0) * 3, j1 = Math.min(n - 1, i0 + 1) * 3, b = n > 1 ? a : 0;
        t.mon.root.position.set(tr._p[j0] + (tr._p[j1] - tr._p[j0]) * b, tr._p[j0 + 1] + (tr._p[j1 + 1] - tr._p[j0 + 1]) * b, tr._p[j0 + 2] + (tr._p[j1 + 2] - tr._p[j0 + 2]) * b); }
      if (tr._q) t.mon.root.quaternion.set(tr._q[0], tr._q[1], tr._q[2], tr._q[3]);
    }
  }
  function startSequence(t) {   // QuestStepAnimatorTriggerable.Trigger: animator.SetTrigger("Activate")
    if (t.seq >= 0) return;
    t.seq = 0; t.fired = 0;
    t.act.visible = true; t.des.visible = false; t.bait.visible = true;
    const m = trapMonster(t); m.anim.clip = null; m.anim.prev = null;
    m.root.visible = m.mesh.visible = false;
  }
  function trapEvent(t, fn) {
    const p = { x: t.d.x, z: t.d.z }, A0 = D.trapAudio, src = t.d.audio.trap;
    const P = t.mon && t.mon.anim;
    switch (fn) {
      case 'StartMonsterAnimations': if (P) { t.mon.root.visible = t.mon.mesh.visible = true; P.play('TSM_Spawn', 0); } break;
      case 'PlayEmergeSFX': sfx3(pick(A0.emerge), p, src); break;
      case 'PlayEmergeCallSFX': sfx3(pick(A0.emergeCall), p, src); break;
      case 'StartBaitEat': if (P) P.play('TSM_BaitEatStart', 0.25); break;
      case 'PlayEatingSFX': sfx3(A0.eating, p, src); break;
      case 'PlayTriggerSFX': sfx3(A0.trigger, p, src); break;
      case 'StartTrap': if (P) P.play('TSM_TrapActivate', 0); break;
      case 'PlayTrappedSFX': sfx3(pick(A0.trapped), p, src); break;
      case 'PlayFireSFX': { const ms = t.d.audio.mortar; sfx3(ms.clip, { x: t.d.mortarAt[0], z: t.d.mortarAt[1] }, ms); break; }
      case 'PlayExplodeSFX': sfx3(A0.explode, p, src); break;
      case 'MortarHit': {
        try { if (root.DRParticles && DRParticles.has('TentacleBigSplash')) DRParticles.spawn('TentacleBigSplash', { pos: new T.Vector3(p.x, 0, p.z) }); } catch (e) { /* hạt không bắt buộc */ }
        const fl = new T.PointLight(0xffb060, 6, 40, 2); fl.position.set(p.x, 3, p.z); scene.add(fl); t.hitFx = { l: fl, t: 0 };
        const b = S().boat, k = Math.max(0, 1 - Math.hypot(b.x - p.x, b.z - p.z) / 60);
        if (root.DRBoat) DRBoat.shake = Math.max(DRBoat.shake || 0, 0.6 * k);   // GenerateImpulse (CinemachineImpulseSource)
        break;
      }
      case 'OnAnimationComplete': onAnimationComplete(t); break;
      default: break;
    }
  }
  function onAnimationComplete(t) {   // MortarQuestStepAnimatorTriggerable.OnAnimationComplete
    t.seq = -1; showDestroyed(t);
    if (root.DRQuests) DRQuests.completeStep(t.d.completeStep);
    S().vars['trap-' + t.d.id + '-state'] = 2;
  }
  function updateTrap(t, dt) {
    if (t.hitFx) { t.hitFx.t += dt; t.hitFx.l.intensity = 6 * Math.max(0, 1 - t.hitFx.t / 0.4); if (t.hitFx.t > 0.4) { scene.remove(t.hitFx.l); t.hitFx = null; } }
    if (t.seq < 0) return;
    t.seq += dt;
    while (t.fired < EVT.length && EVT[t.fired].t <= t.seq) { const e = EVT[t.fired++]; trapEvent(t, e.fn); if (t.seq < 0) return; }
    if (t.seq > TM.len + 0.5) { onAnimationComplete(t); return; }
    const P = t.mon.anim;
    // Emerge -> BaitSeekMove ở exitTime 0,90625 (chéo 0,25 s)
    if (P.name === 'TSM_SpawnIdletoSearch' && P.t >= 0.90625 * P.clip.len) P.play('TSM_BaitSeekMoveLoop', 0.25);
    P.update(dt);
    placeTrapRoot(t, t.seq);
    t.bait.visible = activeAt('Bait', t.seq) !== false && t.seq < TM.len;
  }
  function initTraps() {   // MortarQuestStepAnimatorTriggerable.Start theo trạng thái lưu
    for (const t of traps) {
      t.seq = -1; t.fired = 0;
      const st = trapState(t.d.id);
      if (st === 1) onAnimationComplete(t);
      if (st === 1 || st === 2 || st === 3) showDestroyed(t); else showIdle(t);
    }
  }

  // ---------------------------------------------------------------- vòng chính
  function update(dt) {
    const s = root.DR && root.DR.s;
    if (!s || !s.boat) return;
    if (!traps.length && !buildTraps()) return;
    if (s !== lastS) { lastS = s; initTraps(); if (M) finishDespawn(); boxIn.fill(false); prevYaw = null; }
    if (!(dt > 0)) return;
    const b = s.boat;
    // OnTriggerEnter của các hộp
    D.manager.boxes.forEach((bx, i) => {
      const inside = boxHit(bx, b.x, b.z);
      if (inside && !boxIn[i] && root.DR.mode === 'sail' && !banishOn() && !M && trapState(bx.id) === 0) spawn(bx);
      boxIn[i] = inside;
    });
    if (M) updateMonster(dt, b); else boatMotion(b, dt);
    for (const t of traps) updateTrap(t, dt);
  }

  if (root.DR && root.DR.on) {
    root.DR.on('banish', on => { banish = !!on; if (on && M) despawn('banish'); });                   // OnPlayerAbilityToggled(banish)
    root.DR.on('dialogue', open => { if (open && M) despawn('dialogue'); });                          // OnDialogueStarted
    root.DR.on('questStep', id => { const t = traps.find(x => x.d.step === id); if (t) startSequence(t); });   // QuestStepTriggerer
  }
  // nhịp khung: bọc DRBoat.update (main.js gọi DRBoat.update(dt) mỗi khung, dt = 0 khi tạm dừng), không sửa js/boat.js
  if (root.DRBoat && typeof DRBoat.update === 'function' && !DRBoat.update._ms) {
    const orig = DRBoat.update;
    const wrapped = function (dt, env) { const r = orig.apply(this, arguments); try { update(dt); } catch (e) { console.error('[mindsucker]', e); } return r; };
    wrapped._ms = true;
    DRBoat.update = wrapped;
  }

  root.DRMindSucker = {
    update,
    get active() { return !!M; },
    debug: {
      state: () => M ? { state: M.state, anim: mon.anim.name, x: M.x, z: M.z, yaw: M.yaw, box: M.box, detect: M.detect, expire: M.expire, lost: M.lost,
        drainT: M.drainT, eff: M.eff, tracked: M.tracked, glow: mon.uni.uMsGlow.value } : null,
      stats: () => Object.assign({}, dbg),
      boxes: D.manager.boxes, spawns: D.manager.spawns,
      spawnAt: (name, k) => { const bx = D.manager.boxes.find(x => x.name === name); return !!bx && !M && spawn(bx, k); },
      despawn: () => despawn('debug'),
      trap: n => { const t = traps.find(x => x.d.id === n); return t && { seq: t.seq, fired: t.fired, active: t.act.visible, destroyed: t.des.visible, bait: t.bait.visible,
        monster: !!(t.mon && t.mon.root.visible), anim: t.mon && t.mon.anim.name, state: trapState(n) }; },
      setT: (n, time) => { const t = traps.find(x => x.d.id === n); if (t && t.seq >= 0) { while (t.fired < EVT.length && EVT[t.fired].t <= time) trapEvent(t, EVT[t.fired++].fn); t.seq = time; } },
    },
  };
})(window);
