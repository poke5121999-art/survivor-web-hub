/*
 * Vòi rồng (WaterspoutWorldEvent.cs, MONSTERS.md §2.9) — đơn vị U8. Dữ liệu: data/waterspout.js (tools/waterspout.py từ Waterspout.prefab +
 * Waterspout_Corrupt.prefab); hạt: data/particles.js (Waterspout, Waterspout_Corrupt, WaterspoutImpactfx); tiếng: data/audio.js (event.waterspout.*).
 *
 * Lịch bốc thăm: js/events.js (DREvents) — Waterspout: sanity 0,25..0,75, nghỉ 3 ngày, sinh ở (70, 0, 50) cục bộ, sống 25 s;
 * Waterspout_Corrupt: worldPhase ≥ 2, sanity ≤ 0,5, Xua đuổi dập tắt, sinh ở (−5, 0, 40), sống 40 s. Neo bến → events.js gọi requestFinish.
 *
 * Luật (WaterspoutWorldEvent.cs):
 *  - Awake (:87-114): NavMesh.SamplePosition(vị trí, 5 m, agent 0 = generic); không có điểm đi được thì EventFinished + Destroy ngay (lịch sử vẫn ghi:
 *    bản gốc không gọi OnEventSpawnAborted). [ĐỀ XUẤT] Lớp cấm forbiddenSpawnLayers (50364544 = lớp 7, 15, 24, 25) không có trên web: DRNav.walkable
 *    đã loại đất theo landmask nên dùng thay. Âm thanh fade 0→1 trong 1 s.
 *  - Activate (:117-143): tốc độ tự do = min(maxSpeed, moveSpeedScalar · moveSpeedProportionalToPlayer · BaseMovementSpeedModifier (10) · MoveMod),
 *    tăng tốc agent = tốc độ · accelerationFactor. Vòi thường: 1,8 · MoveMod, tối đa 10 (MOVING); vòi hỏng: 0,15·1,5·10 = 2,25 · MoveMod, tối đa 25 (CHASING).
 *    MOVING chọn đích: thử tối đa 10 lần điểm navmesh quanh vị trí trong 100 m (onUnitSphere · 100 rồi SamplePosition bán kính 100) cho tới khi cách ≥ 50 m
 *    (bản gốc quên tăng bộ đếm, ở đây giữ 10 lần). CHASING: SetDestination(thuyền) mỗi repathToPlayerInterval (0,25 s).
 *  - Update (:195-212): capSpeedWhenHarvesting (vòi hỏng) → agent.speed Lerp(speed, mở khung câu ? 0,1·tự do : tự do, dt); kết thúc khi quá durationSec
 *    HOẶC cách `destination` < 1 m (destination mặc định (0,0,0) với vòi CHASING — giữ nguyên chi tiết đó).
 *  - OnPlayerHit (:150-175): PlayerDetector (SphereCollider trigger r 0,5, tỉ lệ cả chuỗi = 1) chạm thân thuyền (collider tag Player) MỘT lần:
 *    tiếng trúng (3D, tuyến tính 50..100 m), hạt WaterspoutImpactfx tại thuyền, PlayerCollider.ProcessHit(không êm, không phải quái) = 1 ô hỏng nếu quá 1,5 s
 *    từ cú trước (DRBoat.processHit), Random < itemAddChance (0,25) và còn sống thì chọn ngẫu nhiên trong itemPool (thường: Blue Mackerel / Cod; hỏng:
 *    3 Mackerel + 3 Cod dị biến) → tự xếp vào khoang (FindSpaceAndAddObjectToGridData), thông báo notification.waterspout-item-added "{0} landed on deck.",
 *    SetItemSeen (phát 'catch' cho banner) + TriggerFishCaught; rồi RequestEventFinish.
 *  - RequestEventFinish (:213-243): tắt collider, ngừng hạt, tiếng fade 0 trong finishDelaySec (= startLifetime lớn nhất các hệ hạt = 2 s), rồi huỷ.
 *  [ĐỀ XUẤT] NavMeshAgent mô phỏng bằng đường A* lưới 1 m của DRNav (js/nav.js): vận tốc tiến tới tốc độ đích với gia tốc agent (m_Acceleration của
 *    prefab bị ghi đè bởi Activate), autoBraking (vòi thường) giảm tốc ở cuối đường theo √(2·a·dặm còn lại). Cỡ cú trúng = hộp bao thân thuyền như tentacle.js.
 *    Vật nhận vào khoang cỡ cá: size 0,5 và độ tươi đầy như js/yarn.js AddItemById.
 *
 *   DRWaterspout.debug → { state(), speed(name), force(name), items() }
 */
(function (root) {
  'use strict';
  const T = root.THREE, W = root.DR_WATERSPOUT, EV = root.DR_WORLDEVENTS;
  if (!T || !W || !EV) { root.DRWaterspout = null; return; }
  const BASEMOD = () => ((root.DR_CONFIG && DR_CONFIG.baseMovementSpeedModifier) || 10);   // GameConfigData.BaseMovementSpeedModifier
  const moveMod = () => (root.DRRules && root.DR && DR.s ? DRRules.stats(root.DR_CONFIG, DR.grid('INVENTORY'), root.DR_ITEMS).moveMod : 1);   // PlayerStats.MovementSpeedModifier (như boat.js refresh)
  const NAME = { Waterspout: 'Waterspout', Waterspout_Corrupt: 'Waterspout_Corrupt' };
  const live = new Set();
  const PC = (root.DR_BOAT && DR_BOAT.colliderSize && DR_BOAT.colliderSize.player) || { center: [0, 0.376, 0], size: [1.216, 0.648, 2.529] };

  // Mathf.Min(maxSpeed, scalar · proportional · BaseMovementSpeedModifier · MovementSpeedModifier) — WaterspoutWorldEvent.cs:119-121
  function freeSpeed(name) { const P = W[name]; return Math.min(P.maxSpeed, P.moveSpeedScalar * P.moveSpeedProportionalToPlayer * BASEMOD() * moveMod()); }

  // ---------------------------------------------------------------- hạt + tiếng
  const fx = (n, o) => { try { return root.DRParticles ? DRParticles.spawn(n, o) : null; } catch (e) { return null; } };
  function playSfx(key, vol, o) { try { if (root.DRAudio) DRAudio.play(key, vol, null, o); } catch (e) { /* tiếng không bắt buộc */ } }
  function loopVoice(key, P, x, z) {
    try { return root.DRAudio ? DRAudio.voice(key, { loop: true, vol: 1, fade: 1, pos: { x, y: 0, z }, min: P.audio.min, max: P.audio.max }) : null; } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- NavMeshAgent mô phỏng
  function nav() { return root.DRNav; }
  function setDestination(I, to) {
    const N = nav();
    if (!N) return false;
    const snap = N.walkable(to.x, to.z, 'generic') ? to : (N.sample(to, 50, 'generic') || null);   // SetDestination chiếu điểm đích lên navmesh
    if (!snap) return false;
    const p = N.path({ x: I.x, z: I.z }, snap, 'generic');
    if (!p || !p.length) return false;
    I.path = p; I.idx = (p.length > 1 && Math.hypot(p[0].x - I.x, p[0].z - I.z) < 0.5) ? 1 : 0;
    return true;
  }
  function pathLeft(I) {
    if (!I.path) return 0;
    let L = 0, px = I.x, pz = I.z;
    for (let i = I.idx; i < I.path.length; i++) { L += Math.hypot(I.path[i].x - px, I.path[i].z - pz); px = I.path[i].x; pz = I.path[i].z; }
    return L;
  }
  function stepAgent(I, dt) {
    const P = I.P, left = pathLeft(I);
    let target = I.speed;
    if (!left) target = 0;
    else if (P.agent.autoBraking) target = Math.min(target, Math.sqrt(2 * I.accel * left));         // NavMeshAgent.autoBraking
    const dv = target - I.v, am = I.accel * dt;
    I.v += Math.max(-am, Math.min(am, dv));                                                          // tăng / giảm tốc theo agent.acceleration
    let move = I.v * dt;
    while (move > 1e-9 && I.path && I.idx < I.path.length) {
      const w = I.path[I.idx], dx = w.x - I.x, dz = w.z - I.z, d = Math.hypot(dx, dz);
      if (d <= move) { I.x = w.x; I.z = w.z; move -= d; I.idx++; }
      else { I.x += dx / d * move; I.z += dz / d * move; move = 0; }
    }
  }

  // ---------------------------------------------------------------- chạm: cầu (r 0,5) với hộp bao thân thuyền
  const _inv = new T.Matrix4(), _c = new T.Vector3(), _w = new T.Vector3(), _q = new T.Vector3();
  function touching(I) {
    const bob = root.DRBoat && DRBoat.bob;
    if (!bob) return false;
    bob.updateWorldMatrix(true, false);
    _inv.copy(bob.matrixWorld).invert();
    _w.set(I.x + I.P.hitCenter[0], I.P.hitCenter[1], I.z - I.P.hitCenter[2]);                              // tâm cầu thế giới
    _c.copy(_w).applyMatrix4(_inv);                                                                         // ... trong hệ thuyền
    const h = [PC.size[0] / 2, PC.size[1] / 2, PC.size[2] / 2], c = [PC.center[0], PC.center[1], -PC.center[2]];   // lật z như tentacle.js
    _q.set(Math.max(c[0] - h[0], Math.min(c[0] + h[0], _c.x)), Math.max(c[1] - h[1], Math.min(c[1] + h[1], _c.y)), Math.max(c[2] - h[2], Math.min(c[2] + h[2], _c.z)));
    _q.applyMatrix4(bob.matrixWorld);
    return _w.distanceTo(_q) <= I.P.hitRadius;
  }

  // ---------------------------------------------------------------- vật nhận được (OnPlayerHit :162-171)
  function addItem(I) {
    const D = root.DR, G = root.DRGrid, ITEMS = root.DR_ITEMS, P = I.P;
    if (!(Math.random() < P.itemAddChance) || D.mode === 'over') return null;       // Random.value < itemAddChance && Player.IsAlive
    const id = P.itemPool[Math.min(P.itemPool.length - 1, Math.floor(Math.random() * P.itemPool.length))];   // List.PickRandom
    const d = ITEMS[id], g = D.grid('INVENTORY');
    if (!d || !g) return null;
    const inst = G.autoPlace(g, d, { size: 0.5, fresh: (root.DR_CONFIG && DR_CONFIG.maxFreshness) });    // FindSpaceAndAddObjectToGridData
    if (!inst) return null;
    D.emit('cargo', 'INVENTORY', inst);
    // ShowNotificationWithItemName(ITEM_ADDED, "notification.waterspout-item-added" = "{0} landed on deck.")
    if (root.DRHud && DRHud.toast) DRHud.toast((d.name || id) + ' văng lên boong.', 3500);
    const s = D.s;                                                                  // ItemManager.SetItemSeen
    const isNew = !(s.caught && s.caught[id] > 0);
    if (s.caught) s.caught[id] = (s.caught[id] || 0) + 1;
    D.emit('catch', { id, item: d, aberrant: !!d.isAberration, trophy: false, trophySize: false, size: 0.5, isNew, cm: 0, placed: true, relic: false, holding: null, src: 'waterspout' });
    return inst;
  }
  function onHit(I) {
    const D = root.DR, b = D.s.boat, P = I.P;
    I.hit = true;                                                                   // PlayerDetector.OnPlayerDetected bị gỡ sau lần đầu
    playSfx(I.name === 'Waterspout_Corrupt' ? 'event.waterspout.corruptStrike' : 'event.waterspout.strike', 1,
      { pos: { x: I.x, y: 0, z: I.z }, min: W.strikeRolloff[0], max: W.strikeRolloff[1] });
    fx('WaterspoutImpactfx', { pos: [b.x, 0, b.z] });
    const hurt = root.DRBoat && DRBoat.processHit ? DRBoat.processHit(false, false) : false;   // PlayerCollider.ProcessHit(false, false, uniqueVibration)
    const inst = addItem(I);
    I.lastHit = { hurt, item: inst ? inst.id : null, t: I.age };
    requestFinish(I);
  }

  // ---------------------------------------------------------------- vòng đời
  function requestFinish(I) {
    if (I.finishing) return;
    I.finishing = true;                                                             // collider tắt: không còn onHit
    if (I.fx) I.fx.stop();                                                          // particleSystems.ForEach(Stop)
    I.fade = W[I.name].finishDelaySec; I.fadeLeft = I.fade;
    if (I.voice) I.voice.gain(0, I.fade / 3);                                       // audioSource.DOFade(0, finishDelaySec)
  }
  function dispose(I) {
    if (I.fx) { I.fx.stop(); I.fx = null; }
    if (I.voice) { I.voice.stop(0.2); I.voice = null; }
    if (I.node && I.node.parent) I.node.parent.remove(I.node);
    I.done = true; live.delete(I);
  }
  function spawn(name, e, ctx) {
    const P = W[name], N = nav();
    const I = { name, P, e, x: ctx.x, z: ctx.z, v: 0, path: null, idx: 0, age: 0, hit: false, finishing: false, done: false, repath: 0, dest: { x: 0, z: 0 },
      dur: e.durationSec, node: new T.Object3D() };
    // Awake: NavMesh.SamplePosition(vị trí, 5 m, generic); không có điểm thì EventFinished + Destroy
    const snap = N ? N.sample({ x: ctx.x, z: ctx.z }, 5, 'generic') : null;
    if (!snap) { I.done = true; I.aborted = false; return I; }                       // lịch sử vẫn ghi (không OnEventSpawnAborted)
    I.x = snap.x; I.z = snap.z;
    I.node.position.set(I.x, 0, I.z);
    I.fx = fx(P.mode === 'CHASING' ? 'Waterspout_Corrupt' : 'Waterspout', { parent: I.node, loop: true });
    // Waterspout.prefab: GameObject GlowVortex và ConeVortex có m_IsActive 0 (chỉ bản Corrupt bật); data/particles.js (S2) vẫn chép cả hai nên tắt ở đây
    if (I.fx && P.mode !== 'CHASING') for (const s of I.fx.systems) if (s.node.name === 'GlowVortex' || s.node.name === 'ConeVortex') { s.emitting = false; s.playing = false; }
    I.voice = loopVoice(P.mode === 'CHASING' ? 'event.waterspout.corrupt' : 'event.waterspout.normal', P, I.x, I.z);
    // Activate
    I.free = freeSpeed(name); I.speed = I.free; I.accel = I.free * P.accelerationFactor;
    if (P.mode === 'MOVING') pickDestination(I);
    else if (P.mode === 'CHASING') seekPlayer(I);
    live.add(I);
    return I;
  }
  function pickDestination(I) {
    const P = I.P, R = P.maxTravelDistance, N = nav();
    let best = null;
    for (let n = 0; n < 10; n++) {
      const a = Math.random() * 2 * Math.PI, y = Math.random() * 2 - 1, h = Math.sqrt(1 - y * y);   // Random.onUnitSphere
      const s = N.sample({ x: I.x + Math.cos(a) * h * R, z: I.z + Math.sin(a) * h * R }, R, 'generic');
      best = s || { x: 0, z: 0 };                                                    // SamplePosition hỏng → Vector3.zero
      if (Math.hypot(best.x - I.x, best.z - I.z) >= R * 0.5) break;
    }
    I.dest = best;
    setDestination(I, best);
  }
  function seekPlayer(I) { const b = root.DR.s.boat; setDestination(I, { x: b.x, z: b.z }); }

  function update(I, dt) {
    const D = root.DR;
    if (I.done) return;
    I.age += dt;
    if (I.finishing) {
      I.fadeLeft -= dt;
      if (I.node) I.node.position.set(I.x, 0, I.z);
      if (I.fadeLeft <= 0) dispose(I);
      return;
    }
    if (I.P.capSpeedWhenHarvesting) {                                               // Mathf.Lerp(speed, IsHarvesting ? 0,1·tự do : tự do, dt)
      const goal = D.mode === 'harvest' ? I.free * 0.1 : I.free;
      I.speed += (goal - I.speed) * Math.min(1, dt);
    }
    if (I.age > I.dur || Math.hypot(I.x - I.dest.x, I.z - I.dest.z) < 1) { requestFinish(I); return; }
    if (I.P.mode === 'CHASING') { I.repath -= dt; if (I.repath <= 0) { I.repath = I.P.repathToPlayerInterval; seekPlayer(I); } }
    stepAgent(I, dt);
    I.node.position.set(I.x, 0, I.z);
    if (I.voice && I.voice.pos) I.voice.pos(I.x, 0, I.z);
    if (!I.hit && dt > 0 && touching(I)) onHit(I);
  }

  // ---------------------------------------------------------------- đăng ký với DREvents
  function register(name) {
    DREvents.register(name, {
      spawn(e, ctx) {
        const I = spawn(name, e, ctx);
        return {
          update(dt) { update(I, dt); this.done = I.done; },
          requestFinish() { requestFinish(I); },
          dispose() { dispose(I); },
          done: I.done, inst: I
        };
      }
    });
  }
  if (root.DREvents) { register('Waterspout'); register('Waterspout_Corrupt'); }

  root.DRWaterspout = {
    debug: {
      state() {
        const cur = root.DREvents && DREvents.current, I = cur && cur.handle && cur.handle.inst;
        if (!I || !NAME[I.name]) return null;
        return { name: I.name, x: I.x, z: I.z, v: I.v, speed: I.speed, free: I.free, accel: I.accel, age: I.age, hit: I.hit, finishing: I.finishing, done: I.done,
          dest: I.dest, mode: I.P.mode, lastHit: I.lastHit || null, left: pathLeft(I), voice: !!I.voice, fx: !!(I.fx && I.fx.alive) };
      },
      speed: freeSpeed,
      force: name => (root.DREvents ? !!DREvents.debug.force(name) : false),
      live: () => live.size
    }
  };
})(window);
