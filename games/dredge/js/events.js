/*
 * Bộ lập lịch sự kiện thế giới (WorldEventManager.cs) và vùng phát hiện quái (PlayerDetectionCollider.cs) — seam S1 của MONSTERS.md §0.1, §0.3.
 *
 * Bốc thăm (WorldEventManager.Update/RollForEvent, :138-183):
 *   mỗi khung: nếu TimeAndDay > timeOfLastRoll + rollFrequency (GameConfigData.WorldEventRollFrequency[NORMAL] 0,1 ngày) VÀ currentEvent == null
 *   → timeOfLastRoll = TimeAndDay, rồi RollForEvent: bỏ nếu đang neo bến, đang câu, thời gian bị ép trôi; Random < WorldEventChance (1) thì
 *   SelectInsanityEvent = chọn theo trọng số trong mọi WorldEventData qua TestWorldEvent (:285-308) → DoEvent.
 *   Thời gian chỉ trôi khi thuyền chạy / câu cá (TimeController), nên đứng yên thì không bao giờ bốc.
 * TestWorldEvent (:310-449) theo đúng thứ tự gốc: chế độ PASSIVE, worldPhase, khoảng sanity, Banish, khung giờ (quấn qua nửa đêm khi start > end),
 *   repeatDelay theo eventHistory (LƯU vào sổ: DR.s.eventHistory, ghi giá trị timeOfLastRoll), vùng an toàn (layer 27) tại thuyền và thuyền +
 *   safeZoneHitCheckOffset, itemInventoryConditions, độ sâu (đường depthTestPath hoặc từng điểm; mỗi điểm cũng không được nằm trong vùng an toàn),
 *   forbiddenZones tại thuyền + zoneTestOffset.
 * DoEvent (:185-240): SPAWN_PREFAB / PLAYER_CHILD sinh ở thuyền + right·off.x + forward·off.z, y = off.y; EYE_PARTICLES dùng vật tĩnh của cảnh;
 *   FOG_GHOST chọn vật tĩnh GẦN NHẤT. Có sự kiện thì đặt currentEvent, xoá bộ đếm còi, ghi lịch sử.
 * Kết thúc: neo bến → RequestEventFinish (:130-136); Banish bật → kết thúc sự kiện có dispelByBanish (:109-118); còi: giữ cộng foghornHoldTime,
 *   mỗi lần bấm foghornBlastCount++, đủ foghornDispelCount lần hoặc giữ đủ foghornDispelTime giây thì kết thúc (:120-157); thả còi thì
 *   foghornHoldTime giảm dần về 0. Hai bộ đếm về 0 mỗi khi có sự kiện mới hoặc sự kiện kết thúc (:236-237, :281-282).
 *
 * Hợp đồng cho các đơn vị tính năng (U1..U10):
 *   DREvents.register(name, { spawn(e, ctx) → handle | null })   name = tên WorldEventData (khoá của DR_WORLDEVENTS)
 *     ctx = { x, z, y, yaw, boat }  vị trí sinh three.js (đã đổi dấu z) theo playerSpawnOffset; trả null = huỷ sinh (OnEventSpawnAborted: xoá lịch sử)
 *     handle = { update(dt)?, requestFinish(), done, aborted?, dispose()? }  — DREvents gọi update mỗi khung; done = true thì giải phóng
 *     currentEvent; aborted = true lúc done thì xoá lịch sử như OnEventSpawnAborted; dispose() gọi khi về màn đầu / ván mới / nạp sổ.
 *   DREvents.staticEvent(type, obj)   obj = { x, z, activate(e, ctx) → handle }  type 'FOG_GHOST' | 'EYE_PARTICLES' (RegisterStaticWorldEvent)
 *   DREvents.phase()  = SaveData.WorldPhase: web giữ ở DR.s.worldPhase (state.js: saveDataTemplate "world-phase"), lệnh Yarn
 *     IncreaseWorldPhase (js/yarn.js:520) cộng 1: 1 Collector_StrangeFish_Proposal_Accepted … 5 Collector_Award4Atrophy (MONSTERS.md đầu tệp).
 *   DREvents.current  { name, e, handle } | null;  DREvents.banished;  DREvents.safe(x, z) (DRSafeZones của js/nav.js, chưa có thì false)
 *   Sự kiện DR.emit: 'worldEvent' (name, {handled}), 'worldEventFinished' (name), 'threatBanished' ().
 *   [ĐỀ XUẤT] Sự kiện được bốc nhưng chưa đơn vị nào register: ghi lịch sử (repeatDelay vẫn áp) rồi bỏ, không giữ currentEvent — bản gốc
 *   có prefab thật nên luôn sống tới khi tự kết thúc. Trọng số giữ nguyên để tỉ lệ bốc giống bản gốc.
 *   [ĐỀ XUẤT] Không có chế độ PASSIVE / NIGHTMARE trên web: luôn NORMAL. Không có ooze ở bản gốc (OozePatchManager là DLC2): forbidOoze bỏ qua.
 *
 * DRDetect.radius() — PlayerDetectionCollider.FixedUpdate (:80-88), số ở PlayerContainer.prefab (baseRadius 20, addedRadiusForLight 30,
 *   addedRadiusForFoghorn 50, addedRadiusForMovement 30, lerpSpeedLight 3, lerpSpeedFoghorn 5, lerpSpeedMovement 1, movementSpeedMin 0,
 *   movementSpeedMax 5): bán kính = 20 + đèn + còi + 30·invLerp(0, 5, tốc độ m/s), mỗi phần Lerp(cur, đích, dt·tốc độ lerp).
 *
 *   DREvents.debug → { candidates(), test(name) → {ok, fails}, roll(), force(name), log, history() }
 */
(function (root) {
  'use strict';
  const EV = root.DR_WORLDEVENTS || {}, CFG = root.DR_CONFIG || {};
  let MODE = 'NORMAL';   // W7: DREvents.setGameMode(m) (menus.js) đổi theo SettingsSaveData.gameMode
  const FREQ = () => (CFG.worldEventRollFrequency || { NORMAL: 0.1 })[MODE];   // GameConfigData.WorldEventRollFrequency
  const CHANCE = CFG.worldEventChance == null ? 1 : CFG.worldEventChance;      // GameConfigData.WorldEventChance
  const handlers = {}, statics = {};
  const live = [];                     // mọi sự kiện đang sống (force có thể chồng lên currentEvent như DoEvent gốc)
  const log = [];                      // nhật ký bốc thăm cho kiểm thử: { t, pick, candidates }
  let current = null, lastRoll = null, banish = false, horn = false, hornHold = 0, hornBlasts = 0;
  const warned = new Set();

  const D = () => root.DR, S = () => root.DR.s;
  const history = () => { const s = S(); if (!s.eventHistory) s.eventHistory = {}; return s.eventHistory; };
  const phase = () => (S() && S().worldPhase) | 0;
  const safe = (x, z) => !!(root.DRSafeZones && typeof root.DRSafeZones.hit === 'function' && root.DRSafeZones.hit(x, z));

  // Unity right/forward của thuyền → three.js: yaw 0 nhìn −z (js/boat.js)
  const fw = b => [-Math.sin(b.yaw), -Math.cos(b.yaw)];
  const rt = b => [Math.cos(b.yaw), -Math.sin(b.yaw)];
  function offsetWorld(b, p) { const f = fw(b), r = rt(b); return [b.x + r[0] * p[0] + f[0] * p[2], b.z + r[1] * p[0] + f[1] * p[2]]; }

  // ---------------------------------------------------------------- điều kiện khoang (InventoryCondition)
  // SerializableGrid.GetAllItemsOfType: itemType.HasFlag(types) && (subtypes NONE || itemSubtype.HasFlag(subtypes))
  function itemsOfType(c) {
    const G = root.DRGrid, inv = D().grid('INVENTORY'), I = root.DR_ITEMS;
    if (!inv || !G) return [];
    const tm = G.mask(c.itemType, G.TYPE), sm = G.mask(c.itemSubtype, G.SUB);
    return inv.items.filter(i => {
      const d = I[i.id];
      if (!d) return false;
      if ((G.typeOf(d) & tm) !== tm) return false;
      return sm === 0 || (G.subOf(d) & sm) === sm;
    }).map(i => I[i.id]);
  }
  const sizeOf = d => d.dims ? d.dims.length : (d.w | 0) * (d.h | 0);       // SpatialItemData.GetSize = dimensions.Count
  function condition(c) {
    if (c._t === 'NumItemsOfTypeCondition') return itemsOfType(c).length >= c.minNumber;           // NumItemsOfTypeCondition.cs
    if (c._t === 'NumItemsOfSizeAndTypeCondition') {                                                 // NumItemsOfSizeAndTypeCondition.cs
      let n = 0;
      for (const d of itemsOfType(c)) { const sz = sizeOf(d); if (c.max && sz <= c.size) n++; else if (c.min && sz >= c.size) n++; }
      return n >= c.minNumber;
    }
    if (!warned.has(c._t)) { warned.add(c._t); console.warn('[events] inventory condition not ported:', c._t); }
    return false;
  }

  // ---------------------------------------------------------------- độ sâu (CheckDepthPath / CheckDepthRelativePoint, :457-512)
  function depthPoint(b, p, min) {
    const w = offsetWorld(b, p);
    return root.DRWorld.depth01(w[0], w[1]) > min && !safe(w[0], w[1]);
  }
  function depthOk(e, b) {
    const pts = e.depthTestPath || [];
    if (!e.isPath) return pts.every(p => depthPoint(b, p, e.minDepth));
    if (!pts.length) return true;
    if (pts.length === 1) return depthPoint(b, pts[0], e.minDepth);
    const n = e.depthPathNumChecks, k = 1 / n;
    for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j <= n; j++) {
      const a = pts[i], c = pts[i + 1], u = k * j;
      if (!depthPoint(b, [a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u, a[2] + (c[2] - a[2]) * u], e.minDepth)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- TestWorldEvent (:310-449)
  function test(name, exitEarly) {
    const e = EV[name], s = S();
    if (!e || !s) return exitEarly === false ? { ok: false, fails: ['missing'] } : false;
    const b = s.boat, fails = [];
    const fail = why => { fails.push(why); return exitEarly !== false; };
    const tod = s.time - Math.floor(s.time);
    if (MODE === 'PASSIVE' && !e.allowInPassiveMode && fail('passive')) return false;
    if (phase() < e.minWorldPhase && fail('phase')) return false;
    if ((s.sanity < e.minSanity || s.sanity > e.maxSanity) && fail('sanity')) return false;
    if (banish && e.dispelByBanish && fail('banish')) return false;
    if (e.spawnStartTime < e.spawnEndTime) { if ((tod < e.spawnStartTime || tod > e.spawnEndTime) && fail('time')) return false; }
    else if (tod < e.spawnStartTime && tod > e.spawnEndTime && fail('time')) return false;
    const h = history();
    if (!(s.time > (name in h ? h[name] : -Infinity) + e.repeatDelay[MODE]) && fail('repeat')) return false;
    if (e.doSafeZoneHitCheck) {
      if (safe(b.x, b.z) && fail('safezone')) return false;
      const o = e.safeZoneHitCheckOffset || [0, 0, 0], w = offsetWorld(b, o);  // transform.up·y không đổi x, z của tia thẳng đứng
      if (safe(w[0], w[1]) && fail('safezone-offset')) return false;
    }
    if (!(e.itemInventoryConditions || []).every(condition) && fail('inventory')) return false;
    if (e.hasMinDepth && !depthOk(e, b) && fail('depth')) return false;
    const fz = (e.forbiddenZones || []).filter(z => z !== 'NONE');
    if (fz.length) {
      const z = offsetWorld(b, e.zoneTestOffset || [0, 0, 0]);
      if (fz.includes(root.DRWorld.zoneAt(z[0], z[1]))) { fails.push('zone'); return exitEarly === false ? { ok: false, fails } : false; }
    }
    return exitEarly === false ? { ok: !fails.length, fails } : true;
  }
  const candidates = () => Object.keys(EV).filter(n => test(n, true));

  // MathUtil.GetRandomWeightedIndex
  function pickWeighted(list) {
    let tot = 0; for (const n of list) tot += EV[n].weight;
    let r = Math.random() * tot;
    for (const n of list) { r -= EV[n].weight; if (r <= 0) return n; }
    return list[list.length - 1];
  }

  // ---------------------------------------------------------------- DoEvent (:185-240)
  function isFishing() { return D().mode === 'harvest' || !!(root.DRMinigame && DRMinigame.isShown && DRMinigame.isShown()); }
  const isDocked = () => D().mode === 'dock' || !!S().dock;
  function doEvent(name) {
    const e = EV[name], s = S(), b = s.boat;
    if (!e) return null;
    const off = e.playerSpawnOffset || [0, 0, 0], w = offsetWorld(b, off);
    const ctx = { x: w[0], z: w[1], y: off[1], yaw: b.yaw, boat: b };
    let handle = null, impl = handlers[name];
    if (impl) handle = impl.spawn(e, ctx);
    else if (e.eventType === 'FOG_GHOST' || e.eventType === 'EYE_PARTICLES') {
      const list = statics[e.eventType] || [];
      let best = null, bd = Infinity;
      for (const o of list) { const d = Math.hypot(o.x - b.x, o.z - b.z); if (d < bd) { bd = d; best = o; } }
      if (e.eventType === 'EYE_PARTICLES') best = list[0] || null;   // một vật FollowPlayer/EyeParticles duy nhất
      if (best) handle = best.activate(e, ctx);
    }
    const handled = !!handle;
    if (handle) {
      const entry = { name, e, handle, t: s.time };
      live.push(entry);
      current = entry;
      hornHold = 0; hornBlasts = 0;
    }
    if (handled || !impl) history()[name] = lastRoll == null ? s.time : lastRoll;   // AddWorldEventToHistory(data, timeOfLastRoll)
    D().emit('worldEvent', name, { handled });   // một sự kiện thế giới vừa được bốc / ép: âm thanh, HUD nghe ở đây
    return handle || null;
  }
  function finishEntry(entry) {
    const i = live.indexOf(entry);
    if (i >= 0) live.splice(i, 1);
    if (entry.handle.aborted) delete history()[entry.name];             // OnEventSpawnAborted
    if (current === entry) { current = null; hornHold = 0; hornBlasts = 0; }  // OnEventFinished
    D().emit('worldEventFinished', entry.name);   // sự kiện thế giới đã xong
  }
  function requestFinish(entry) { if (entry && !entry.finishing) { entry.finishing = true; try { entry.handle.requestFinish(); } catch (err) { console.error('[events] requestFinish failed:', entry.name, err); } } }
  function disposeAll() {
    for (const en of live.slice()) { try { if (en.handle.dispose) en.handle.dispose(); else en.handle.requestFinish(); } catch (err) { console.error('[events] dispose failed:', en.name, err); } }
    live.length = 0; current = null; hornHold = 0; hornBlasts = 0;
  }

  function rollForEvent() {
    const s = S();
    let pick = null, list = [];
    if (!isDocked() && !isFishing() && !(root.DRSky && DRSky.forced) && Math.random() < CHANCE) {
      list = candidates();
      if (list.length) { pick = pickWeighted(list); doEvent(pick); }
    }
    log.push({ t: s.time, pick, candidates: list });
    if (log.length > 200) log.shift();
    return pick;
  }

  // ---------------------------------------------------------------- vùng phát hiện (PlayerDetectionCollider)
  const DET = { base: 20, light: 30, horn: 50, move: 30, kLight: 3, kHorn: 5, kMove: 1, vMin: 0, vMax: 5 }; // PlayerContainer.prefab:209066-209074
  const det = { light: 0, horn: 0, move: 0 };
  function detUpdate(dt) {
    const s = S(), k = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
    det.light = k(det.light, s.lightsOn ? DET.light : 0, dt * DET.kLight);
    det.horn = k(det.horn, horn ? DET.horn : 0, dt * DET.kHorn);
    const v = root.DRBoat ? DRBoat.speed() : 0, p = Math.min(1, Math.max(0, (v - DET.vMin) / (DET.vMax - DET.vMin)));
    det.move = k(det.move, DET.move * p, dt * DET.kMove);
  }
  root.DRDetect = {
    radius: () => DET.base + det.light + det.horn + det.move,
    state: () => Object.assign({ radius: DET.base + det.light + det.horn + det.move }, det),
    // quái có RangeSensor (SensorRange 1) chạm cầu phát hiện: khoảng cách tới thuyền < bán kính + r
    within: (x, z, r) => { const b = S().boat; return Math.hypot(x - b.x, z - b.z) < DET.base + det.light + det.horn + det.move + (r || 0); }
  };

  // ---------------------------------------------------------------- vòng lặp (js/boat.js update gọi mỗi khung, dt = 0 khi tạm dừng)
  function update(dt) {
    const Dr = D(), s = Dr && Dr.s;
    if (!s || !s.boat) return;
    if (Dr.mode === 'title') { if (live.length) disposeAll(); return; }
    if (lastRoll == null || s.time < lastRoll) lastRoll = s.time;       // OnEnable: timeOfLastRoll = TimeAndDay; thời gian lùi (móc setTime)
    detUpdate(dt);
    const playing = Dr.mode !== 'over' && dt > 0;
    if (playing && s.time > lastRoll + FREQ() && !current) { lastRoll = s.time; rollForEvent(); }
    if (current && isDocked()) requestFinish(current);                   // OnPlayerDockedToggled(dock)
    if (horn) {
      hornHold += dt;
      if (current && current.e.dispelByFoghorn && (hornBlasts >= current.e.foghornDispelCount || hornHold >= current.e.foghornDispelTime)) requestFinish(current);
    } else hornHold = Math.max(0, hornHold - dt);
    for (const en of live.slice()) {
      if (en.handle.update) { try { en.handle.update(dt); } catch (err) { console.error('[events] update failed:', en.name, err); en.handle.done = true; } }
      if (en.handle.done) finishEntry(en);
    }
  }

  function bind() {
    const Dr = D();
    if (!Dr || !Dr.on) return;
    Dr.on('banish', on => {                                              // OnPlayerAbilityToggled(banish)
      banish = !!on;
      if (on && current && current.e.dispelByBanish) { Dr.emit('threatBanished'); requestFinish(current); }   // TriggerThreatBanished
    });
    Dr.on('abilityToggled', a => { if (a && a.id === 'foghorn') { horn = !!a.active; if (horn) hornBlasts++; } });
    const reset = () => { disposeAll(); lastRoll = S() ? S().time : null; if (S()) history(); det.light = det.horn = det.move = 0; };
    Dr.on('newgame', reset); Dr.on('load', reset);
    Dr.on('mode', m => { if (m === 'title') disposeAll(); });       // về màn đầu: dọn mọi sự kiện đang sống
  }
  bind();

  root.DREvents = {
    register(name, impl) {
      if (!EV[name]) console.warn('[events] register: no WorldEventData named', name);
      handlers[name] = impl;
    },
    staticEvent(type, obj) { (statics[type] = statics[type] || []).push(obj); },   // RegisterStaticWorldEvent
    update, phase, safe, test, candidates, offsetWorld,
    // W7 (WorldEventManager.OnGameModeChanged :59-67): đổi chế độ thì PASSIVE dọn sự kiện đang chạy không cho phép ở PASSIVE, tần suất bốc lấy lại từ GameConfigData
    setGameMode(m) {
      if (!(m === 'NORMAL' || m === 'PASSIVE' || m === 'NIGHTMARE')) return;
      MODE = m;
      if (m === 'PASSIVE' && current && !current.e.allowInPassiveMode && current.e.dispelByBanish) requestFinish(current);
    },
    get gameMode() { return MODE; }, get rollFrequency() { return FREQ(); },
    get current() { return current; },
    get banished() { return banish; },
    get foghorn() { return { active: horn, hold: hornHold, blasts: hornBlasts }; },
    debug: {
      candidates, test: n => test(n, false), roll: rollForEvent,
      force: n => doEvent(n),                                           // lệnh terminal "world.event <id>": bỏ qua mọi điều kiện
      get log() { return log; }, history: () => Object.assign({}, history()),
      get lastRoll() { return lastRoll; }, live: () => live.map(e => e.name)
    }
  };
})(window);
