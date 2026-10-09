/*
 * Ba phép của DREDGE: Xua đuổi (Banish), Teo tàn (Atrophy), Hiện thân (Manifest), cắm vào DRAbilities.register.
 * Mã gốc: BanishAbility.cs:32-59, AtrophyAbility.cs:46-84 + QuickHarvestGridPanel.PopulateGridForAtrophy, TeleportAbility.cs:33-43 +
 * PlayerTeleport.cs:29-81. Thời lượng / hồi chiêu / castTime nằm ở AbilityData (data/world_data.js), số riêng từng phép ở
 * DR_BOAT.physics.abilities (BanishAbility, AtrophyAbility, TeleportAbility, PlayerTeleport) và DR_CONFIG (atrophy*).
 *
 * Móc cho chỗ khác:
 *   DR.on('banish', on => …)   Xua đuổi bật / tắt (BanishAbility.Activate / Deactivate; bản gốc các hệ quái và sự kiện thế giới
 *                              đọc cờ này qua TogglePlayerAbility). Bản web CHƯA có quái, sự kiện thế giới dị biến, lệnh ThreatBanished.
 *   DR.on('manifest', {from, to})  vừa dịch chuyển xong
 *   DR.on('atrophy', {spot, count})  vừa gặt một điểm cá
 *   DRSpells.banished  getter; DRSpells.busy  đang dịch chuyển / đang xem xác cá
 * Mở khoá: lệnh Yarn UnlockAbility (Collector_Award2Manifest, Collector_Award3Banish, Collector_Award4Atrophy, đổi relic ở
 * Người Sưu Tầm), js/yarn.js đã xử lý. DR_DEBUG.unlockSpells() mở cả ba để thử.
 */
(function (root) {
  'use strict';
  const D = root.DR, A = root.DRAbilities, G = root.DRGrid, R = root.DRRules, CFG = root.DR_CONFIG, ITEMS = root.DR_ITEMS;
  if (!A || !D) { console.error('[spells] abilities module not loaded'); return; }
  const PA = root.DR_BOAT.physics.abilities;
  const BAN = PA.BanishAbility, ATR = PA.AtrophyAbility, TEL = PA.TeleportAbility, PT = PA.PlayerTeleport;
  const S = () => D.s;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  // PlayerSanity.ChangeSanity: Clamp01(hiện tại + đổi)
  const changeSanity = v => { if (S()) S().sanity = clamp01((S().sanity == null ? 1 : S().sanity) + v); };
  const sfx = (k, v, r) => { try { if (root.DRAudio && DRAudio.resolve(k)) DRAudio.play(k, v, r); } catch (e) { /* tiếng không bắt buộc */ } };
  const voice = (k, o) => { try { return root.DRAudio && DRAudio.resolve(k) ? DRAudio.voice(k, o) : null; } catch (e) { return null; } };
  const spawn = (n, o) => { try { return root.DRParticles ? DRParticles.spawn(n, o) : null; } catch (e) { return null; } };
  const toast = t => { if (root.DRHud) DRHud.toast(t); };

  const Sp = { banished: false, busy: false, atrophy: null, tele: null };

  // ---------------------------------------------------------------------------------------------- Banish
  // Activate: vfxParticles.startLifetime = duration, phát mainSFX (clip "Banish - No Snuff", không lặp, dài 15 s), bật BanishEffect,
  // trừ sanityLossOnActivate. DelayedDeactivate: chờ duration, phát endSFX ("Banish - Snuff Only"), mainSFX tắt dần 0,5 s,
  // chờ animationEndDuration rồi Deactivate (tắt vfx). Cờ "đang Xua đuổi" = isActive (kéo dài tới hết animationEndDuration).
  class Banish extends A.Ability {
    constructor(id) { super(id); this.t = 0; this.phase = 0; this.fx = null; this.snd = null; }
    activate() {
      this.stopFx();
      this.fx = spawn('BanishEffect', { parent: root.DRBoat && DRBoat.bob, startLifetime: this.d.duration, loop: true });
      this.snd = voice('boat.banish.loop', { loop: false, vol: 1 });
      this.t = 0; this.phase = 1;
      changeSanity(BAN.sanityLossOnActivate);
      this.isActive = true;
      Sp.banished = true;
      D.emit('banish', true);                                      // Banish bật: quái / sự kiện thế giới nghe ở đây
      return this.baseActivate();
    }
    update(dt) {
      if (!this.phase) return;
      this.t += dt;
      if (this.phase === 1 && this.t >= this.d.duration) {
        this.phase = 2;
        sfx('boat.banish.snuff', BAN.endSFXVolume);   // endSFX 'Banish - Snuff Only'
        if (this.snd) { this.snd.gain(0, 0.5 / 3); this.snd.stop(0.5); }
        if (this.fx) { this.fx.stop(); }
      }
      if (this.phase === 2 && this.t >= this.d.duration + BAN.animationEndDuration) this.deactivate();
    }
    stopFx() {
      if (this.fx) this.fx.stop();
      if (this.snd) this.snd.stop(0.2);
      this.fx = this.snd = null;
    }
    deactivate() {
      this.phase = 0; this.t = 0;
      this.stopFx();
      const was = Sp.banished;
      Sp.banished = false;
      this.baseDeactivate(true);
      if (was) D.emit('banish', false);
    }
  }

  // ---------------------------------------------------------------------------------------------- Manifest
  // TeleportAbility.Activate → PlayerTeleport.Teleport: TeleportEffect tại người chơi, thân thuyền ẩn ngay, miễn nhiễm, tiếng castSFX,
  // khoá điều khiển; chờ preHoldTimeSec (1 s), đặt thuyền tới TeleportDestination (+ sóng), trừ sanityChange, chờ holdTimeSec (0,5 s),
  // hiện thuyền, trả điều khiển. Đích: object "TeleportDestination" (Game.unity, con của TheMarrows xoay 180° quanh y):
  // cục bộ (-80, 0, 100) → thế giới (80, 0, -100), sát Blackstone Isle (89,5; -123,5 trong data/mapmarkers.js).
  const DEST = { x: 80, z: -100 };
  class Manifest extends A.Ability {
    constructor(id) { super(id); this.t = 0; this.phase = 0; this.fx = null; this.from = null; }
    activate() {
      const b = S().boat;
      this.from = { x: b.x, z: b.z };
      this.fx = spawn('TeleportEffect', { parent: root.DRBoat && DRBoat.bob });
      if (root.DRBoat) { DRBoat.stop(); DRBoat.blocked = true; if (DRBoat.root) DRBoat.root.visible = false; }
      Sp.busy = true;
      sfx('boat.teleport');                                        // PlayerTeleport.castSFX
      D.emit('manifestBegin', { x: b.x, z: b.z });                 // GameEvents.TriggerTeleportBegin
      this.t = 0; this.phase = 1;
      this.isActive = true;
      this.baseActivate();
      return true;
    }
    update(dt) {
      if (!this.phase) return;
      this.t += dt;
      if (this.phase === 1 && this.t >= PT.preHoldTimeSec) {
        this.phase = 2; this.t = 0;
        const b = S().boat;
        D.s.dock = null;
        DRBoat.place(DEST.x, DEST.z, b.yaw);
        DRBoat.blocked = true;
        if (root.DRCamera) DRCamera.snap();
        if (root.DRWorld) DRWorld.stream(DEST.x, DEST.z);
        changeSanity(TEL.sanityChange);
        D.emit('manifest', { from: this.from, to: { x: DEST.x, z: DEST.z } });
      } else if (this.phase === 2 && this.t >= PT.holdTimeSec) this.deactivate();
    }
    deactivate() {
      if (this.phase) {
        if (root.DRBoat) { DRBoat.blocked = false; if (DRBoat.root) DRBoat.root.visible = true; }
        D.emit('manifestEnd', {});                                 // GameEvents.TriggerTeleportComplete
      }
      this.phase = 0; this.t = 0; this.fx = null; Sp.busy = false;
      this.baseDeactivate(true);
    }
  }

  // ---------------------------------------------------------------------------------------------- Atrophy
  // Activate: OverlapSphere(radius 50) quanh thuyền lấy điểm CÁ gần nhất (không bẫy cua) còn kho >= 1 → vào chế độ thu hoạch kiểu
  // Atrophy (camera nhóm người + điểm, hiệu ứng AtrophyPlayerEffect / AtrophyFishEffect, tiếng lặp "Atrophy - Loop" mờ dần 0,5 s,
  // trừ sanityLossOnActivate), mở lưới ATROPHY 6x6 bên trái: floor(kho) con cá của món kế tiếp, con đầu ép dị biến
  // (atrophyGuaranteedAberrationCount), độ tươi ngẫu nhiên [0,75; 1,5], 50% một con nhiễm ký sinh; kho điểm = atrophyStockPenalty.
  // Không có điểm: thông báo "notification.atrophy-failed", ability canFailCast.
  const isDay = () => { const tc = root.DRWorld.data.scene.logic.TimeController[0].fields; return R.isDay(S().time, tc.dawnTime, tc.duskTime); };
  function target() {
    const b = S().boat, day = isDay();
    let best = null, bd = Infinity;
    for (const sp of DRSpots.list || []) {
      if (sp.dredge) continue;
      const dist = Math.hypot(sp.x - b.x, sp.z - b.z);
      // [ĐỀ XUẤT] OverlapSphere chạm collider POI: tâm cách tối đa radius + bán kính collider của điểm
      if (dist > ATR.radius + (sp.r || 0)) continue;
      const list = R.spotList(sp.d, day) || [];
      const it = ITEMS[list[0]];
      if (!it || (G.subOf(it) & G.SUB.FISH) === 0) continue;
      if (DRSpots.regen(sp).stock < 1) continue;
      if (dist < bd) { bd = dist; best = sp; }
    }
    return best && { sp: best, dist: bd };
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function makeFish(id, forceAb) {
    const S0 = S(), v = S0.vars;
    let item = ITEMS[id], fid = id;
    if (forceAb && item.aberrations && item.aberrations.length) {   // FishAberrationGenerationMode.FORCE
      const ok = item.aberrations.filter(a => ITEMS[a] && (ITEMS[a].minWorldPhaseRequired || 0) <= S0.worldPhase);
      if (ok.length) { fid = ok[Math.floor(Math.random() * ok.length)]; item = ITEMS[fid]; }
    }
    // RANDOM_CHANCE cho các con sau con ép: cùng xác suất khi câu (rules.aberrationChance, không điểm đặc biệt)
    return { id: fid, item, extra: { size: R.rollSize(CFG, false), fresh: rnd(CFG.atrophyConditionMin, CFG.atrophyConditionMax) } };
  }
  function reap(sp) {
    const r = DRSpots.regen(sp), day = isDay();
    const id = R.pickWeighted(R.spotList(sp.d, day), ITEMS);          // HarvestPOIData.GetNextHarvestableItem
    const n = Math.floor(r.stock);
    const grid = G.create(root.DR_GRIDS.Atrophy);                     // GridKey.ATROPHY
    const made = [];
    let force = CFG.atrophyGuaranteedAberrationCount;
    for (let i = 0; i < n; i++) {
      const f = makeFish(id, force > 0 && S().vars['can-catch-aberrations']);
      if (force > 0) force--;
      made.push(f);
    }
    if (made.length && Math.random() < CFG.atrophyTotalParasiteChance) made[Math.floor(Math.random() * made.length)].extra.infected = true; // Infect()
    for (const f of made) {                                           // 5 lần thử ô ngẫu nhiên + xoay ngẫu nhiên, hết thì tìm chỗ trống
      let inst = null;
      for (let k = 0; k < 5 && !inst; k++)
        inst = G.place(grid, f.item, Math.floor(Math.random() * grid.cols), Math.floor(Math.random() * grid.rows), [0, 90, 180, 270][Math.floor(Math.random() * 4)], f.extra);
      if (!inst) inst = G.autoPlace(grid, f.item, f.extra);
      f.inst = inst;
    }
    r.stock = CFG.atrophyStockPenalty;                                // POIDataModel.AtrophyStock
    r.lastUpdate = S().time;
    return { grid, made };
  }
  class Atrophy extends A.Ability {
    constructor(id) { super(id); this.fx = []; this.snd = null; this.handle = null; }
    activate() {
      const tg = target();
      if (!tg) {
        toast('Không tìm thấy nạn nhân nào.');                       // notification.atrophy-failed
        return false;
      }
      const sp = tg.sp, b = S().boat;
      const out = reap(sp);
      this.fx = [
        spawn('AtrophyPlayerEffect', { pos: [b.x, 0, b.z], loop: true }),
        spawn('AtrophyFishEffect', { pos: [sp.x, 0, sp.z], loop: true })
      ];
      this.snd = voice('boat.atrophy.loop', { loop: true, vol: 0 });
      if (this.snd) this.snd.gain(ATR.loopAudioMaxVolume, ATR.loopAudioFadeDuration / 3);
      changeSanity(ATR.sanityLossOnActivate);
      Sp.atrophy = { sp, from: { x: b.x, z: b.z }, t: 0, dist: tg.dist };
      Sp.busy = true;
      this.isActive = true;
      this.baseActivate();                                           // castSFX "Atrophy - Cast"
      openGrid(this, sp, out);
      D.emit('atrophy', { spot: sp.id, count: out.made.length });
      this.isActive = false;                                         // Activate() gọi Deactivate() ngay sau base.Activate()
      this.baseDeactivate(true);
      return true;
    }
    finish() {                                                       // Harvester.OnDisable → OnHarvestModeToggled(false)
      for (const f of this.fx) if (f) f.stop();
      this.fx = [];
      if (this.snd) { this.snd.gain(0, ATR.loopAudioFadeDuration / 3); this.snd.stop(ATR.loopAudioFadeDuration); this.snd = null; }
      Sp.atrophy = null; Sp.busy = false; curGrid = null;
      if (root.DRCamera && DRCamera.override === camOverride) DRCamera.override = prevOverride;
    }
  }

  // QuickHarvestGridPanel (bảng trái): tiêu đề "Corpses Reaped", mô tả, nút "Take All"; "Take All" chuyển hết vào khoang (đủ chỗ), hết đồ thì thoát
  function openGrid(ab, sp, out) {
    const inv = () => D.grid('INVENTORY');
    curGrid = out.grid; curMade = out.made.length;
    const tab = { key: 'ATROPHY', title: 'Xác được gặt', grid: out.grid };
    const takeAll = () => {
      for (const it of out.grid.items.slice()) {
        const extra = Object.assign({}, it); for (const k of ['uid', 'id', 'x', 'y', 'rot', 'cells']) delete extra[k];
        const put = D.give(it.id, extra);
        if (put) G.remove(out.grid, it);
      }
      if (ab.handle) ab.handle.refresh();
      if (!out.grid.items.length && ab.handle) ab.handle.close();
    };
    prevOverride = DRCamera.override;
    DRCamera.override = camOverride;
    ab.handle = DRCargo.open({
      right: { tabs: ['INVENTORY'] },
      left: {
        kind: 'shop', title: 'Xác được gặt', subtitle: 'Tai ương đã giáng xuống những sinh vật này. Chúng sẽ không hồi phục.', tabs: [tab],
        footer: { buttons: [{ label: 'Lấy hết', id: 'atrophy-take-all', enabled: () => out.grid.items.length > 0 && !!inv(), run: takeAll }] }
      },
      onClose: () => { ab.handle = null; ab.finish(); }
    });
    if (!ab.handle) ab.finish();
  }

  // AtrophyVCam (PlayerContainer.prefab): FOV 40, nhóm {người chơi, điểm} trọng số 1 bán kính 0, FramingTransposer cách 15 m,
  // m_GroupFramingSize 0,8, tracked offset (-2, 2, -5). [ĐỀ XUẤT] cách đặt cụ thể: đứng sau thuyền nhìn về điểm, nghiêng xuống 30°,
  // lùi thêm khi cả hai không lọt khung; Cinemachine Zoom Only khoá FOV 40 nên không đổi FOV.
  let prevOverride = null, curGrid = null, curMade = 0;
  const _tp = new root.THREE.Vector3();
  const FOV = 40, DIST = 15, FRAMING = 0.8, PITCH = 30 * Math.PI / 180;
  function camOverride(cam, dt) {
    const a = Sp.atrophy;
    if (!a) { if (DRCamera.override === camOverride) DRCamera.override = prevOverride; return false; }
    const b = S().boat, T = root.THREE;
    a.t += dt;
    const cx = (b.x + a.sp.x) / 2, cz = (b.z + a.sp.z) / 2, gs = Math.hypot(a.sp.x - b.x, a.sp.z - b.z);
    let dx = a.sp.x - b.x, dz = a.sp.z - b.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const dist = Math.max(DIST, (gs / FRAMING) / (2 * Math.tan(FOV / 2 * Math.PI / 180)));
    const tx = cx - dx * dist * Math.cos(PITCH), ty = dist * Math.sin(PITCH), tz = cz - dz * dist * Math.cos(PITCH);
    if (!a.p) a.p = new T.Vector3(cam.position.x, cam.position.y, cam.position.z);
    a.p.lerp(_tp.set(tx, ty, tz), 1 - Math.exp(-3 * dt));      // damping 1 s của Transposer: [ĐỀ XUẤT] nội suy mũ
    cam.position.copy(a.p);
    cam.lookAt(cx, 0, cz);
    if (cam.fov !== FOV) { cam.fov = FOV; cam.updateProjectionMatrix(); }
    return true;
  }

  // ---------------------------------------------------------------------------------------------- đăng ký + móc kiểm thử
  const ab = {};
  function install() {
    ab.banish = A.register('banish', Banish);
    ab.manifest = A.register('manifest', Manifest);
    ab.atrophy = A.register('atrophy', Atrophy);
  }
  function reset() {
    for (const k of Object.keys(ab)) { const a = ab[k]; if (a.phase || a.isActive) { a.phase = 0; if (a.stopFx) a.stopFx(); } }
    if (ab.atrophy) ab.atrophy.finish();
    if (root.DRBoat) { DRBoat.blocked = false; if (DRBoat.root) DRBoat.root.visible = true; }
    Sp.banished = false; Sp.busy = false;
  }
  function hookDebug() {
    if (!root.DR_DEBUG || root.DR_DEBUG.unlockSpells) return;
    root.DR_DEBUG.unlockSpells = () => ['banish', 'atrophy', 'manifest'].map(id => A.unlock(id, true));
    root.DR_DEBUG.spells = () => ({ banished: Sp.banished, busy: Sp.busy, banish: { phase: ab.banish.phase, t: ab.banish.t }, manifest: { phase: ab.manifest.phase }, atrophy: !!Sp.atrophy, dest: DEST });
  }
  install();
  D.on('newgame', () => { reset(); hookDebug(); });
  D.on('load', () => { reset(); hookDebug(); });
  D.on('mode', hookDebug);
  Object.defineProperty(Sp, 'dest', { value: DEST });
  root.DRSpells = Sp;
  // móc kiểm thử: nội dung lưới ATROPHY đang mở; điểm cá ban ngày để dựng tình huống
  Sp.grid = () => curGrid && { made: curMade, n: curGrid.items.length, aberrant: curGrid.items.filter(i => ITEMS[i.id] && ITEMS[i.id].isAberration).length, fresh: curGrid.items.map(i => i.fresh), infected: curGrid.items.filter(i => i.infected).length };
  Sp.spotsForTest = () => DRSpots.list.filter(sp => !sp.dredge).map(sp => { const it = ITEMS[(R.spotList(sp.d, true) || [])[0]]; return { id: sp.id, fish: !!it && (G.subOf(it) & G.SUB.FISH) !== 0 && (it.aberrations || []).some(a => ITEMS[a] && (ITEMS[a].minWorldPhaseRequired || 0) <= S().worldPhase) && !!sp.d.items && sp.d.items.length > 0 }; });
  Sp.target = () => (S() && target()) || null;
  hookDebug();
})(window);
