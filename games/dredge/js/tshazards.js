/*
 * Mối nguy của Twisted Strand: tường rễ, nấm nổ, dây leo (WORLD-GAPS.md §4 / §6 R4, đơn vị r4ts).
 * Dữ liệu: data/tshazards.js (tools/tshazards.py: 20 TSRootWall + 99 ExplodingMushrooms của Game.unity, clip RootWall_* / ExplodingMushrooms_* / Vine_SpawnRW /
 * Tentacle_Retract, prefab Vines, tiếng).
 *
 * TSRootWall.cs (cấu hình ở cảnh: kiểm tra mỗi 10-20 s, người chơi trong 100 m, sanity ngưỡng 0,75, gần nhất 10 m, tiếng 15-50 m):
 *   Start: hạn kiểm tra = Random(10, 20). Update: hạn −= dt; ≤ 0 thì TryChangeState rồi đặt lại hạn.
 *   TryChangeState: d = khoảng cách tới thuyền; d > 100 thì thôi. Đang hiện HOẶC sanity ≤ 0,75, VÀ (d ≥ 10 HOẶC đang hiện) thì đảo isShowing, Animator.SetBool, tiếng
 *   emerge / submerge tại tường. Mặc định (OnEnable) isShowing = false: tường chìm, collider tắt.
 *   Animator RootWallController: HideIdle ⇄ Show (1,75 s, trồi 5 rễ; Colliders bật ở 0,4167 s) → ShowIdle ⇄ Hide (1 s; Colliders tắt ở 0,6 s) → HideIdle. Mỗi chuyển có exitTime.
 * ExplodingMushrooms.cs + clip (99 nhóm 3 nấm): OnTriggerEnter của SphereCollider trigger r 2,5 (chính nhóm): thuyền vào VÀ sanity < 0,25 thì growAudioSource.Play (pitch
 *   Random(0,8; 1,2) đặt ở Awake) + Animator trigger Explode. Idle → Explode (1,5 s: đầu rung ±2°, phình tới (2,3,2), sự kiện OnExplode ở 1,4833 s: Instantiate explodeVFX
 *   (MushroomSporeEffect, tiếng Mushroom Explode theo pitch của nhóm) + rung tay cầm; collider tắt) → Respawn (3,15 s: chìm −1,5 trồi lại; OnReset ở 1,6667 s dừng tiếng grow;
 *   collider bật lại ở 2,6333 s) → Idle sau exitTime 0,95 (2,9925 s). Trigger của Animator giữ tới khi tới Idle (thuyền đứng trong vùng lúc collider bật lại thì nổ tiếp).
 * VinesWorldEvent.cs + AttackingTentacle.cs: sự kiện Vines (data/worldevents.js: sanity ≤ 0,25, chỉ ở Twisted Strand, Xua đuổi dập tắt, 25 trọng số) sinh 4 dây Vine1..4 ở
 *   thuyền; mỗi dây bám thuyền theo tentacleAnchorPos / trackingStrength riêng, chạy clip Vine_SpawnRW (5,833 s) sau animationDelay (0,5 / 0 / 0,25 / 0,75 s). Mỗi dây ở cuối
 *   clip gọi AttackFinished; đủ 4 dây xong thì RequestEventFinish → Destroy NGAY (DelayedEventFinish đợi mọi IsAttackFinished, đã đủ) nên Retract chỉ chạy khi bị kết thúc
 *   SỚM (Xua đuổi / neo bến): animator exit → Tentacle_Retract (1,583 s, hoà 0,5 s) → AttackFinished. Prefab KHÔNG có VariablePlayerDamager: dây leo không gây hại
 *   (BoxCollider SafeCollider ở 4 xương). R3 Mind Sucker gọi DREvents.debug.force('Vines') ở sanity ≤ 0,05 (js/mindsucker.js:345).
 *
 * Vật cảnh: tường và nấm đã nằm sẵn trong instances.bin ở tư thế cảnh (= ShowIdle / Idle). Lúc chạy: tường bắt đầu CHÌM (ẩn 5 instance, xoá dấu chân khỏi landmask bằng
 *   DRWorld.carveLand); khi hiện thì vẽ bản động (hình học + vật liệu lấy từ ô thế giới đã nạp) và trả dấu chân lại. Nấm đứng yên vẫn là instance tĩnh; chỉ lúc nổ / mọc lại mới
 *   ẩn 6 instance và vẽ bản động. Ma trận động = M_instance · F·(Ws⁻¹·Wt)·F (F = gương x của instance có định thức âm, tools/world.py decompose).
 * [ĐỀ XUẤT] thuyền chạm vùng trigger nấm: khoảng cách ngang < r + 0,6 (nửa rộng hộp thuyền DR_BOAT.colliderSize.player = 0,608); dây leo không đẩy thuyền (collider SafeCollider
 *   của bản gốc là va chạm cứng, ở đây bỏ); hạt dây leo dùng TentacleBigSplash của xúc tu (cùng prefab hạt); rung tay cầm bỏ (web không có).
 *
 *   DRTSHazards.update(dt)  (bọc DRBoat.update như js/mindsucker.js; dây leo chạy qua handle.update của DREvents)
 *   DRTSHazards.debug → { walls, mushrooms, wallState(i), wallCheck(i), mushState(i), nearestMush(x, z), vines(), forceVines(), counts }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_TSHAZARDS;
  if (!T || !D || !D.walls) { root.DRTSHazards = null; return; }
  const WD = D.walls, MD = D.mushrooms, VD = D.vines;
  const WC = WD.cfg, MC = MD.cfg, CL = WD.clips, MCL = MD.clips;
  const S = () => root.DR.s;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const BOAT_R = 0.6;   // [ĐỀ XUẤT] nửa rộng hộp thuyền (DR_BOAT.colliderSize.player 1,216 / 2)
  const dbg = { sfx: [], vfx: [], hideCalls: 0, carve: 0, vine: [], vineDone: 0 };

  // ---------------------------------------------------------------- tiếng: clip của tools/tshazards.py, gọi được bằng khoá 'tshazards.<nhóm>.<tên>'
  const A = root.DR_AUDIO;
  for (const [grp, src] of [['wall', WD.audio], ['mush', MD.audio], ['vine', VD.audio]]) {
    if (A) for (const [nm, a] of Object.entries(src)) { const k = 'tshazards.' + grp + '.' + nm; if (!A[k]) A[k] = { src: a.src, loop: false, vol: 1, orig: a.orig, bus: 'sfx' }; }
  }
  function sfx(grp, nm, p, o) {
    const key = 'tshazards.' + grp + '.' + nm;
    dbg.sfx.push(key); if (dbg.sfx.length > 60) dbg.sfx.shift();
    try { return root.DRAudio && DRAudio.resolve(key) ? DRAudio.voice(key, Object.assign({ vol: 1, pos: { x: p.x, y: 0.5, z: p.z }, min: 15, max: 50 }, o || {})) : null; } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- mẫu clip (lấy mẫu 30 khung/giây, nội suy tuyến tính)
  function smp(arr, stride, n, fps, t, out) {
    const f = Math.min(n - 1, Math.max(0, t * fps)), i = Math.floor(f), a = f - i, j = Math.min(n - 1, i + 1);
    for (let c = 0; c < stride; c++) out[c] = arr[i * stride + c] + (arr[j * stride + c] - arr[i * stride + c]) * a;
    return out;
  }
  function stepVal(keys, t) {   // m_IsActive / m_Enabled: hằng từng đoạn, trước khoá đầu giữ giá trị khoá đầu
    let v = keys[0][1];
    for (const k of keys) if (t >= k[0]) v = k[1];
    return v;
  }

  // ---------------------------------------------------------------- lấy hình học + vật liệu của thế giới (instance tĩnh đã nạp)
  const partCache = new Map();   // chỉ số gốc của lô instance -> [{ geo, mat }]
  function worldParts(i) {
    const W = root.DRWorld;
    if (!W || !W.cells) return null;
    let found = null;
    for (const c of Object.values(W.cells)) {
      if (!c.group) continue;
      for (const im of c.group.children) {
        const off = im.userData && im.userData.off;
        if (off === undefined || !im.isInstancedMesh) continue;
        if (i >= off && i < off + im.count) { found = off; break; }
      }
      if (found !== null) break;
    }
    if (found === null) return null;
    if (partCache.has(found)) return partCache.get(found);
    const ps = [];
    for (const c of Object.values(W.cells)) {
      if (!c.group) continue;
      for (const im of c.group.children) if (im.isInstancedMesh && im.userData.off === found) ps.push({ geo: im.geometry, mat: im.material });
      if (ps.length) break;
    }
    partCache.set(found, ps);
    return ps;
  }
  let scene = null;
  function getScene() {
    if (!scene) scene = root.DRBoat && DRBoat.root && DRBoat.root.parent;
    return scene;
  }

  const _p = new T.Vector3(), _q = new T.Quaternion(), _s = new T.Vector3();
  const FLIP = new T.Matrix4().makeScale(-1, 1, 1);
  const comp = (m, p, q, s) => m.compose(_p.set(p[0], p[1], p[2]), _q.set(q[0], q[1], q[2], q[3]), _s.set(s[0], s[1], s[2]));
  const _L = new T.Matrix4(), _L2 = new T.Matrix4(), _R = new T.Matrix4(), _M = new T.Matrix4();
  // Một vật động: nhóm các Mesh dùng chung hình học/vật liệu với instance tĩnh; ma trận = M_instance · (F·R·F nếu gương) với R = Ws⁻¹·Wt
  function makeObj(ent) {
    const m = ent.m;
    return { ent, inst: ent.inst, mir: ent.mir, Ms: new T.Matrix4().compose(new T.Vector3(m[0], m[1], m[2]), new T.Quaternion(m[3], m[4], m[5], m[6]), new T.Vector3(m[7], m[8], m[9])),
      group: null, built: false };
  }
  function ensure(o) {
    if (o.built) return true;
    const sc = getScene(), ps = worldParts(o.inst);
    if (!sc || !ps || !ps.length) return false;
    const g = new T.Group();
    g.matrixAutoUpdate = false; g.visible = false; g.name = 'tshazard';
    for (const p of ps) { const me = new T.Mesh(p.geo, p.mat); me.frustumCulled = false; g.add(me); }
    sc.add(g);
    o.group = g; o.built = true;
    return true;
  }
  function setMatrix(o, R) {   // R = Ws⁻¹·Wt ở khung mesh (chưa gương)
    if (o.mir) { _R.copy(R); _R.premultiply(FLIP).multiply(FLIP); R = _R; }
    o.group.matrix.multiplyMatrices(o.Ms, R);
    o.group.matrixWorldNeedsUpdate = true;
  }
  const show = (o, on) => { if (o.group) o.group.visible = on; };

  // ---------------------------------------------------------------- tường rễ
  const walls = WD.list.map(d => ({
    d, id: d.id, target: false, phase: 'hideIdle', t: 0, timer: rand(WC.minTimeBetweenChecks, WC.maxTimeBetweenChecks), col: true, objs: null,
    insts: d.models.map(m => m.inst)
  }));
  let worldInit = false;
  function setCollider(w, on) {   // Colliders.m_IsActive: dấu chân va chạm trong landmask (DRWorld.carveLand: back = trả lại thành đất)
    if (w.col === on) return;
    w.col = on;
    const W = root.DRWorld;
    if (W && W.carveLand) { W.carveLand(w.d.fp, on); dbg.carve++; }
  }
  function wallObjs(w) {
    if (!w.objs) w.objs = w.d.models.map(m => { const o = makeObj(m); o.Ainv = comp(new T.Matrix4(), m.A.p, m.A.q, m.A.s).invert(); return o; });
    return w.objs;
  }
  const pos3 = [0, 0, 0], scl3 = [0, 0, 0];
  function wallPose(w) {
    const objs = w.objs;
    if (!objs) return;
    const live = w.phase !== 'hideIdle';
    for (let j = 0; j < 5; j++) {
      const o = objs[j];
      if (!o.built) continue;
      if (!live) { show(o, false); continue; }
      const A = o.ent.A;
      let p = A.p, s = A.s;
      if (w.phase === 'show' || w.phase === 'hide') {
        const c = CL[w.phase], m = c.m[j];
        p = smp(m.p, 3, c.n, c.fps, w.t, pos3); s = smp(m.s, 3, c.n, c.fps, w.t, scl3);
      }
      comp(_L, p, A.q, s);
      _R.multiplyMatrices(o.Ainv, _L);
      _L2.copy(_R);
      setMatrix(o, _L2);
      show(o, true);
    }
  }
  function wallStep(w, dt) {
    w.t += dt;
    for (let guard = 0; guard < 4; guard++) {
      if (w.phase === 'hideIdle') { if (w.target) { w.phase = 'show'; w.t = 0; } else break; }
      else if (w.phase === 'show') { if (w.t >= CL.show.len) { w.t -= CL.show.len; w.phase = 'showIdle'; } else break; }
      else if (w.phase === 'showIdle') { if (!w.target) { w.phase = 'hide'; w.t = 0; } else break; }
      else if (w.phase === 'hide') { if (w.t >= CL.hide.len) { w.t -= CL.hide.len; w.phase = 'hideIdle'; } else break; }
    }
    if (w.phase !== 'hideIdle' && !w.objs) wallObjs(w);
    if (w.objs && w.phase !== 'hideIdle') for (const o of w.objs) ensure(o);
    const on = w.phase === 'show' ? !!stepVal(CL.show.col, w.t) : w.phase === 'showIdle' ? true : w.phase === 'hide' ? !!stepVal(CL.hide.col, w.t) : false;
    setCollider(w, on);
    wallPose(w);
  }
  function tryChange(w) {   // TSRootWall.TryChangeState
    const b = S().boat, d = Math.hypot(w.d.x - b.x, w.d.z - b.z);
    if (d > WC.maxPlayerDistance) return false;
    const san = S().sanity;
    if ((w.target || !(san > WC.playerSanityThreshold)) && (!(d < WC.minPlayerDistance) || w.target)) {
      w.target = !w.target;
      sfx('wall', w.target ? 'emerge' : 'submerge', { x: w.d.x, z: w.d.z }, { min: WC.sfxCloseDistance, max: WC.sfxFarDistance });
      return true;
    }
    return false;
  }
  function initWorld() {   // tư thế đầu: tường chìm (Animator mặc định isShowing = false); instance tĩnh của cảnh là tư thế ShowIdle nên ẩn đi
    const W = root.DRWorld;
    if (!W || !W.hideInstances || !W.landBox || !W.carveLand) return false;
    const all = [];
    for (const w of walls) all.push(...w.insts);
    W.hideInstances(all, false); dbg.hideCalls++;
    for (const w of walls) { w.col = true; setCollider(w, false); }
    worldInit = true;
    return true;
  }
  function resetWalls() {
    for (const w of walls) {
      w.target = false; w.phase = 'hideIdle'; w.t = 0; w.timer = rand(WC.minTimeBetweenChecks, WC.maxTimeBetweenChecks);
      if (worldInit) setCollider(w, false);
      wallPose(w);
    }
  }

  // ---------------------------------------------------------------- nấm nổ
  const mush = MD.list.map(d => ({ d, id: d.id, phase: 'idle', t: 0, trig: false, wasIn: false, pitch: rand(MC.pitchMin, MC.pitchMax), objs: null, grow: null, first: false, hidden: false }));
  const activeM = new Set();
  const MPOS = [0, 0, 0], MSCL = [0, 0, 0], MQ = [0, 0, 0, 1];
  function mushObjs(m) {
    if (m.objs) return m.objs;
    m.objs = [];
    for (const n of m.d.nodes) {
      const Ss = comp(new T.Matrix4(), n.S.p, n.S.q, n.S.s);
      const head = makeObj(n.head), stalk = makeObj(n.stalk);
      head.inv = comp(new T.Matrix4(), n.head.T.p, n.head.T.q, n.head.T.s); head.inv.premultiply(Ss).invert();   // (Ss·Hs)⁻¹
      stalk.inv = comp(new T.Matrix4(), n.stalk.T.p, n.stalk.T.q, n.stalk.T.s); stalk.inv.premultiply(Ss).invert();
      m.objs.push({ n, head, stalk });
    }
    return m.objs;
  }
  function mushPose(m) {
    const C = MCL[m.phase];
    if (!C) return;
    const objs = m.objs;
    for (let k = 0; k < 3; k++) {
      const { n, head, stalk } = objs[k], cn = C.nodes[k];
      let sp = n.S.p;
      if (cn.S && cn.S.p) sp = smp(cn.S.p, 3, C.n, C.fps, m.t, MPOS);
      comp(_L, sp, n.S.q, n.S.s);                       // S(t)
      // đầu: R = (Ss·Hs)⁻¹ · S(t) · H(t)
      let hs = n.head.T.s, hq = n.head.T.q;
      if (cn.H && cn.H.s) hs = smp(cn.H.s, 3, C.n, C.fps, m.t, MSCL);
      if (cn.H && cn.H.q) { smp(cn.H.q, 4, C.n, C.fps, m.t, MQ); const l = Math.hypot(MQ[0], MQ[1], MQ[2], MQ[3]) || 1; hq = [MQ[0] / l, MQ[1] / l, MQ[2] / l, MQ[3] / l]; }
      comp(_L2, n.head.T.p, hq, hs);
      _R.multiplyMatrices(head.inv, _L).multiply(_L2);
      _M.copy(_R); setMatrix(head, _M);
      comp(_L2, n.stalk.T.p, n.stalk.T.q, n.stalk.T.s);
      _R.multiplyMatrices(stalk.inv, _L).multiply(_L2);
      _M.copy(_R); setMatrix(stalk, _M);
    }
  }
  function mushVisual(m, on) {   // bản động bật ⇄ instance tĩnh của 3 nấm (6 instance) ẩn
    const W = root.DRWorld;
    if (on) {
      const objs = mushObjs(m);
      let ok = true;
      for (const o of objs) { ok = ensure(o.head) && ok; ok = ensure(o.stalk) && ok; }
      if (!ok) return;
      if (!m.hidden) { W.hideInstances(objs.flatMap(o => [o.head.inst, o.stalk.inst]), false); m.hidden = true; dbg.hideCalls++; }
      for (const o of objs) { show(o.head, true); show(o.stalk, true); }
    } else if (m.objs) {
      for (const o of m.objs) { show(o.head, false); show(o.stalk, false); }
      if (m.hidden) { W.hideInstances(m.objs.flatMap(o => [o.head.inst, o.stalk.inst]), true); m.hidden = false; dbg.hideCalls++; }
    }
  }
  function onExplode(m) {   // ExplodingMushrooms.OnExplode: explodeVFX ở vị trí nhóm, AudioSource của nó lấy pitch của growAudioSource
    const p = { x: m.d.x, z: m.d.z };
    sfx('mush', 'explode', p, { rate: m.pitch, min: 10, max: 35 });
    try {
      if (root.DRParticles && DRParticles.has('MushroomSporeEffect')) { DRParticles.spawn('MushroomSporeEffect', { pos: new T.Vector3(p.x, 0, p.z) }); dbg.vfx.push('MushroomSporeEffect'); }
    } catch (e) { /* hạt không bắt buộc */ }
  }
  function mushEvent(m, fn) {
    if (fn === 'OnExplode') onExplode(m);
    else if (fn === 'OnReset') { if (m.grow && m.grow.stop) m.grow.stop(0.1); m.grow = null; }   // OnReset: growAudioSource.Stop
  }
  function mushStep(m, dt, b) {
    if (m.phase === 'idle') {
      if (m.trig) { m.trig = false; m.phase = 'explode'; m.t = 0; m.first = true; activeM.add(m); mushVisual(m, true); }
    } else {
      const C = MCL[m.phase], t0 = m.first ? -1 : m.t;
      m.first = false;
      m.t += dt;
      for (const e of C.ev) if (e.t > t0 && e.t <= m.t) mushEvent(m, e.fn);
      if (m.phase === 'explode' && m.t >= C.len) {
        const over = m.t - C.len; m.phase = 'respawn'; m.t = over; m.first = false;
        for (const e of MCL.respawn.ev) if (e.t <= over) mushEvent(m, e.fn);
      } else if (m.phase === 'respawn' && m.t >= C.len * 0.95) {   // exitTime 0,95 của chuyển Respawn → Idle
        m.phase = 'idle'; m.t = 0; activeM.delete(m); mushVisual(m, false);
        if (m.trig) { m.trig = false; m.phase = 'explode'; m.t = 0; m.first = true; activeM.add(m); mushVisual(m, true); }   // Trigger còn giữ: Idle → Explode ngay
      }
    }
    // SphereCollider trigger: bật ở Idle, tắt suốt Explode, bật lại ở 2,6333 s của Respawn
    const en = m.phase === 'idle' ? true : m.phase === 'explode' ? !!stepVal(MCL.explode.en, m.t) : !!stepVal(MCL.respawn.en, m.t);
    const c = m.d.trig, inside = Math.hypot(b.x - c.c[0], b.z - c.c[2]) < c.r + BOAT_R;
    if (en && inside && !m.wasIn) {   // OnTriggerEnter (tag Player)
      if (S().sanity < MC.sanityThreshold) {
        m.grow = sfx('mush', 'grow', { x: m.d.x, z: m.d.z }, { rate: m.pitch, min: MC.grow.min, max: MC.grow.max, vol: MC.grow.vol });
        m.trig = true;
      }
    }
    m.wasIn = en && inside;
    if (m.phase !== 'idle' && m.objs) mushPose(m);
  }
  function resetMush() {
    for (const m of mush) {
      m.phase = 'idle'; m.t = 0; m.trig = false; m.wasIn = false; m.first = false;
      if (m.grow && m.grow.stop) m.grow.stop(0.05);
      m.grow = null;
      if (m.objs || m.hidden) mushVisual(m, false);
    }
    activeM.clear();
  }

  // ---------------------------------------------------------------- dây leo (VinesWorldEvent + 4 AttackingTentacle)
  const SPAWN = VD.clips.spawn, RETRACT = VD.clips.retract;
  for (const clip of [SPAWN, RETRACT]) {
    clip.byBone = {};
    for (const nm in clip.curves) for (const k in clip.curves[nm]) {
      const cv = clip.curves[nm][k];
      (clip.byBone[cv.bone] = clip.byBone[cv.bone] || {})[k] = cv.keys;
    }
  }
  const POSED = [...new Set(Object.keys(SPAWN.byBone).concat(Object.keys(RETRACT.byBone)).map(Number))].filter(i => i !== 0);   // gốc Vine do TrackPlayer điều khiển
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
  const VP = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() }, VP2 = { p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() };
  function vsample(clip, t, bone, out) {
    const c = clip.byBone[bone], B = VD.bones[bone];
    out.p.fromArray(B.p); out.q.fromArray(B.q); out.s.fromArray(B.s);
    if (!c) return out;
    if (c.p) { hermite(c.p, t, 3, _v); out.p.set(_v[0], _v[1], _v[2]); }
    if (c.q) { hermite(c.q, t, 4, _v); out.q.set(_v[0], _v[1], _v[2], _v[3]).normalize(); }
    if (c.s) { hermite(c.s, t, 3, _v); out.s.set(_v[0], _v[1], _v[2]); }
    return out;
  }
  let vgeo = null, vmat = null;
  function vmaterial() {
    if (vmat) return vmat;
    const tex = new T.TextureLoader().load(VD.tex);
    tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.encoding = T.sRGBEncoding;
    const m = new T.MeshBasicMaterial({ map: tex });
    m.color.setRGB(VD.tint[0], VD.tint[1], VD.tint[2]);   // Color_9a80436d của TwistedStrandTreeTrunks_Mat (giá trị gamma như tools/world.py baseColorFactor)
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <output_fragment>', `
  vec3 wpV = vDrFogW;
  vec3 litV = diffuseColor.rgb * (uDrSunCol * drEnvCloud(wpV) + drEnvLights(wpV) + uDrAmb + (1.0 - drEnvMaskB(wpV.xz)) + vec3(uDrTintK, 0.0, 0.0));
  gl_FragColor = vec4(litV, 1.0);`);
    };
    m.customProgramCacheKey = () => 'drTSVine';
    vmat = m;
    return m;
  }
  function vgeometry() {
    if (vgeo) return vgeo;
    const M = VD.mesh, g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(M.pos), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(M.nrm), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(M.uv), 2));
    g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(M.skinIndex), 4));
    g.setAttribute('skinWeight', new T.BufferAttribute(new Float32Array(M.skinWeight), 4));
    g.setIndex(M.index);
    vgeo = g;
    return g;
  }
  function vbuild(vd) {   // như js/tentacle.js build(): nút Object3D, xương Bone, SkinnedMesh ở gốc thế giới với bindMatrix đơn vị
    const nodes = VD.bones.map((b, i) => {
      const o = VD.skinBones.includes(i) ? new T.Bone() : new T.Object3D();
      o.name = b.name; o.position.fromArray(b.p); o.quaternion.fromArray(b.q); o.scale.fromArray(b.s);
      return o;
    });
    VD.bones.forEach((b, i) => { if (b.parent >= 0) nodes[b.parent].add(nodes[i]); });
    nodes[0].scale.setScalar(vd.scale);   // Vine1..4 khác nhau ở tỉ lệ gốc (0,45 / 0,5 / 0,55 / 0,5)
    const mesh = new T.SkinnedMesh(vgeometry(), vmaterial());
    mesh.frustumCulled = false; mesh.name = vd.name;
    mesh.bind(new T.Skeleton(VD.skinBones.map(i => nodes[i]), VD.bindPoses.map(a => new T.Matrix4().fromArray(a))), new T.Matrix4());
    return { root: nodes[0], nodes, mesh };
  }
  let vinesInst = null;
  const fwd = b => [-Math.sin(b.yaw), -Math.cos(b.yaw)];
  const rgt = b => [Math.cos(b.yaw), -Math.sin(b.yaw)];
  function vfire(v, fn) {
    const p = { x: v.root.position.x, z: v.root.position.z };
    dbg.vine.push({ n: v.vd.name, fn, t: performance.now() }); if (dbg.vine.length > 80) dbg.vine.shift();
    if (fn === 'StartTrackingPlayer') { v.follow = v.vd.strength; v.trackTarget = 1; }
    else if (fn === 'StopTrackingPlayer') v.trackTarget = 0;
    else if (fn === 'PlayEmergeSFX') { if (v.vd.sfx) sfx('vine', 'emerge', p, { min: 15, max: 50 }); }
    else if (fn === 'PlayAttackSFX') { if (v.vd.sfx) sfx('vine', 'whip', p, { min: 15, max: 50 }); }
    else if (fn === 'PlaySubmergeSFX') { if (v.vd.sfx) sfx('vine', 'submerge', p, { min: 15, max: 50 }); }
    else if (fn === 'PlaySplashEffect') {
      try { if (root.DRParticles && DRParticles.has('TentacleBigSplash')) { DRParticles.spawn('TentacleBigSplash', { pos: new T.Vector3(p.x, 0, p.z), yaw: v.yaw }); dbg.vfx.push('TentacleBigSplash'); } } catch (e) { /* hạt không bắt buộc */ }
    } else if (fn === 'AttackFinished') v.finished = true;   // AttackingTentacle.AttackFinished: IsAttackFinished = true
  }
  function vtoRetract(v) {
    if (v.finished || v.phase === 'retract') return;
    v.spawnT = v.phase === 'spawn' ? v.t : 0;
    v.phase = 'retract'; v.retractT = 0; v.blend = 0; v.prevR = -1;
  }
  function vtick(v, dt) {
    const b = S().boat;
    // --- TrackPlayer
    v.follow += (0 - v.follow) * Math.min(1, dt);
    v.track += (v.trackTarget - v.track) * Math.min(1, dt);
    const f = fwd(b), r = rgt(b);
    const tx = b.x + f[0] * v.vd.anchor[2] + r[0] * v.vd.anchor[0], tz = b.z + f[1] * v.vd.anchor[2] + r[1] * v.vd.anchor[0];
    const k = Math.min(1, dt * 5 * clamp01(v.follow));   // Mathf.Lerp(0, 5, strength) kẹp [0, 1] ở tham số
    v.root.position.x += (tx - v.root.position.x) * k; v.root.position.z += (tz - v.root.position.z) * k; v.root.position.y = 0;
    const dx = b.x - v.root.position.x, dz = b.z - v.root.position.z;
    if (Math.hypot(dx, dz) > 1e-6) {
      const want = Math.atan2(-dx, -dz);   // +z Unity cục bộ = −z three cục bộ
      let dy = want - v.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      v.yaw += dy * Math.min(1, dt * 40 * clamp01(v.track));
      v.root.rotation.y = v.yaw;
    }
    // --- hoạt ảnh
    if (v.phase === 'wait') {
      v.delay -= dt;
      if (v.delay <= 0) { v.phase = 'spawn'; v.t = 0; v.prevT = -1; v.delay = 0; }   // Invoke("PlayAnimation", animationDelay) → trigger play
      else return;
    }
    if (v.phase === 'spawn') {
      if (v.finished) return;
      const t0 = v.prevT; v.t = Math.min(SPAWN.len, v.t + (v.prevT < 0 ? 0 : dt)); v.prevT = v.t;
      for (const e of SPAWN.events) if (e.t > t0 && e.t <= v.t) vfire(v, e.fn);
    } else if (v.phase === 'retract') {
      const t0 = v.prevR; v.retractT += dt; v.prevR = v.retractT;
      v.spawnT = (v.spawnT + dt) % SPAWN.len;
      v.blend = Math.min(1, v.retractT / VD.retractBlend);
      for (const e of RETRACT.events) if (e.t > t0 && e.t <= v.retractT) vfire(v, e.fn);
      if (v.retractT >= RETRACT.len) v.finished = true;
    }
    for (const bi of POSED) {
      const n = v.nodes[bi];
      if (v.phase === 'spawn') vsample(SPAWN, v.t, bi, VP);
      else {
        vsample(SPAWN, v.spawnT, bi, VP); vsample(RETRACT, Math.min(v.retractT, RETRACT.len), bi, VP2);
        VP.p.lerp(VP2.p, v.blend); VP.q.slerp(VP2.q, v.blend); VP.s.lerp(VP2.s, v.blend);
      }
      n.position.copy(VP.p); n.quaternion.copy(VP.q); n.scale.copy(VP.s);
    }
  }
  function vdispose() {
    if (!vinesInst) return;
    for (const v of vinesInst.list) { if (scene) { scene.remove(v.root); scene.remove(v.mesh); } }
    vinesInst.handle.done = true; dbg.vineDone = performance.now();
    vinesInst = null;
  }
  function vspawn(e, ctx) {
    const sc = getScene();
    if (vinesInst || !sc || !root.DR || !S()) return null;
    const list = VD.list.map(vd => {
      const o = vbuild(vd);
      sc.add(o.root); sc.add(o.mesh);
      o.root.position.set(ctx.x, 0, ctx.z);   // WorldEvent sinh ở thuyền + playerSpawnOffset (0); Vines.prefab Vine1..4 đều ở gốc prefab
      return { vd, root: o.root, nodes: o.nodes, mesh: o.mesh, phase: 'wait', delay: vd.delay, t: 0, prevT: -1, spawnT: 0, retractT: 0, prevR: -1, blend: 0,
        follow: 0, track: 1, trackTarget: 0, yaw: 0, finished: false };   // playerFollowStrength = 0, playerTrackingStrength = 1 (AttackingTentacle.cs field init)
    });
    const handle = {
      done: false, finishing: false,
      update(dt) {
        const Dr = root.DR;
        if (!vinesInst || vinesInst.handle !== handle) return;
        const d = Dr.mode === 'cargo' || Dr.paused ? 0 : dt;
        if (d > 0) for (const v of list) vtick(v, d);
        if (list.every(v => v.finished)) vdispose();      // OnSingleAttackComplete → RequestEventFinish → DelayedEventFinish → EventFinished + Destroy
      },
      requestFinish() {   // RequestEventFinish: mỗi dây RequestAttackFinish (animator exit)
        if (handle.finishing) return;
        handle.finishing = true;
        for (const v of list) vtoRetract(v);
      },
      dispose() { vdispose(); }
    };
    vinesInst = { list, handle };
    return handle;
  }
  if (root.DREvents) DREvents.register('Vines', { spawn: vspawn });

  // ---------------------------------------------------------------- vòng chính (nhịp khung của thuyền)
  let lastS = null;
  function update(dt) {
    const s = root.DR && root.DR.s;
    if (!s || !s.boat || root.DR.mode === 'title') return;
    if (s !== lastS) { lastS = s; resetMush(); resetWalls(); }
    if (!worldInit && !initWorld()) return;
    const d = root.DR.mode === 'cargo' || root.DR.paused ? 0 : dt;
    const b = s.boat;
    for (const w of walls) {
      if (d > 0) { w.timer -= d; if (w.timer <= 0) { tryChange(w); w.timer = rand(WC.minTimeBetweenChecks, WC.maxTimeBetweenChecks); } }
      if (d > 0 || w.phase !== 'hideIdle') wallStep(w, d);
    }
    for (const m of mush) {
      if (m.phase === 'idle' && !m.trig && Math.hypot(b.x - m.d.x, b.z - m.d.z) > 12) { m.wasIn = false; continue; }   // xa nhóm: không thể nằm trong vùng trigger (r 2,5)
      mushStep(m, d, b);
    }
  }
  if (root.DR && root.DR.on) {
    const reset = () => { if (worldInit) { resetMush(); resetWalls(); } };
    root.DR.on('newgame', reset); root.DR.on('load', reset);
  }
  if (root.DRBoat && typeof DRBoat.update === 'function' && !DRBoat.update._ts) {
    const orig = DRBoat.update;
    const wrapped = function (dt, env) { const r = orig.apply(this, arguments); try { update(dt); } catch (e) { console.error('[tshazards]', e); } return r; };
    wrapped._ts = true;
    // DRMindSucker đã bọc trước: giữ cờ của nó để không bọc đôi
    for (const k of Object.keys(orig)) wrapped[k] = orig[k];
    DRBoat.update = wrapped;
  }

  root.DRTSHazards = {
    update,
    debug: {
      counts: () => ({ walls: walls.length, mushrooms: mush.length, vines: VD.list.length }),
      wallState: i => { const w = walls[i]; return w && { showing: w.target, phase: w.phase, t: w.t, timer: w.timer, collider: w.col, x: w.d.x, z: w.d.z, fp: w.d.fp.length,
        visible: !!(w.objs && w.objs.some(o => o.group && o.group.visible)), built: !!(w.objs && w.objs.every(o => o.built)) }; },
      wallCheck: i => tryChange(walls[i]),
      wallTimer: (i, v) => { walls[i].timer = v; },
      nearestWall: (x, z) => walls.reduce((a, w) => (!a || Math.hypot(w.d.x - x, w.d.z - z) < Math.hypot(a.d.x - x, a.d.z - z) ? w : a), null).id,
      mushState: i => { const m = mush[i]; return m && { phase: m.phase, t: m.t, trig: m.trig, pitch: m.pitch, hidden: m.hidden, x: m.d.x, z: m.d.z, r: m.d.trig.r, visible: !!(m.objs && m.objs[0].head.group && m.objs[0].head.group.visible) }; },
      nearestMush: (x, z) => mush.reduce((a, m) => (!a || Math.hypot(m.d.x - x, m.d.z - z) < Math.hypot(a.d.x - x, a.d.z - z) ? m : a), null).id,
      vines: () => vinesInst && { done: vinesInst.handle.done, finishing: vinesInst.handle.finishing, list: vinesInst.list.map(v => ({ name: v.vd.name, phase: v.phase, t: v.t, retractT: v.retractT, finished: v.finished,
        x: v.root.position.x, z: v.root.position.z, yaw: v.yaw, follow: v.follow, track: v.track })) },
      forceVines: () => (root.DREvents ? !!DREvents.debug.force('Vines') : false),
      get activeMush() { return activeM.size; },
      log: dbg
    }
  };
})(window);
