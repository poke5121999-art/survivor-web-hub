/*
 * Lưới kéo, bẫy cua và mồi (GR-06, GR-07, GR-13, GR-11a) — chép từ bản gốc (D:\dredge-ref\src):
 *   TrawlNetAbility.cs, DeployPotAbility.cs, SerializedCrabPotPOIData.cs, PlacedHarvestPOI.cs, OccasionalGridPanel.cs,
 *   BaitAbility.cs, BaitPOIDataModel.cs, HarvestZoneDetector.cs, HarvestZone.cs, ActiveAbilityInfoPanel.cs, Ability.cs (CycleItem).
 * Số liệu: DR_ITEMS (timeBetweenCatchRolls, catchRate, maxDurabilityDays, gridConfig, harvestableTypes, cờ canBeCaughtBy*),
 *   DR_CONFIG (depthBands, maxCrabPotCount, numFishInBaitBall*, researchItemCrabPotSpawnChance...), vùng thu hoạch HarvestZone
 *   (art/world/markers.json, volumes type 'harvestZone'), DR_DEPLOY (tools/deploy.py: phao, mồi, vật liệu), DR_ANIM (CrabPotBuoy_Animator,
 *   TrawlNet_Animator), DR_BOAT.physics.abilityAudio.TrawlNetAbility (tên clip), DR_BOAT.abilityUI.rects (DeployableAbilityInfoPanel).
 *
 * Năng lực cắm vào DRAbilities.register('trawl' | 'pot' | 'bait'); nút dùng như các năng lực khác (chuột phải).
 *   Z / X (CycleAbilityPrev/Next, DredgeControlBindings.cs:373-378) đổi món dùng (loại bẫy, loại mồi) khi năng lực ấy đang chọn.
 *   Space cạnh phao bẫy (prompt.pot "Check Pot") mở lưới bẫy bên trái khoang: Lấy hết / Nhặt bẫy (OccasionalGridPanel).
 * Sổ lưu: DR.s.pots = [{ x, z, deployableItemId, durability, timeUntilNextCatchRoll, lastUpdate, grid }] (SaveData.serializedCrabPotPOIs;
 *   yRotation/depth/items là NonSerialized như bản gốc), lưới bẫy ở DR.s.grids['POT_<n>'], lưới kéo ở DR.s.grids.TRAWL_NET.
 *   Điểm mồi KHÔNG lưu (BaitAbility.DeployBait chỉ Instantiate, không ghi SaveData).
 * Sự kiện phát ra (DR.emit):
 *   'trawlCatch' { id, inst }     — TrawlNetAbility.AddTrawlItem: một món vào lưới kéo
 *   'potDeployed' { pot }         — DeployPotAbility.DeployCrabPot
 *   'potCollected' { pot, picked } — OccasionalGridPanel: lấy hết / nhặt bẫy
 *   'baitDeployed' { id, stock }  — BaitAbility.DeployBait
 *   'catch' (cùng lược đồ với js/spots.js, thêm src 'trawl' | 'pot') — ItemManager.SetItemSeen → banner loài mới
 * Móc: DRDeploy.debug(), .pots(), .mapMarkers(), .catchable(kind, x, z), .selectedItem(abilityId)
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR, CFG = root.DR_CONFIG, ITEMS = root.DR_ITEMS, DEP = root.DR_DEPLOY, R = root.DRRules;
  const AB = root.DRAbilities, B = root.DR_BOAT;
  if (!AB || !DEP) throw new Error('deploy.js loaded before abilities.js / data/deploy.js');
  const G = () => root.DRGrid;
  const S = () => D.s;
  const AA = (B.physics.abilityAudio || {}).TrawlNetAbility || { fields: {} };
  const TA = B.physics.abilities.TrawlNetAbility || {};
  const UIR = B.abilityUI.rects;
  const URLB = f => new URL(f, document.baseURI).href;
  const str = k => (root.DR_STR && root.DR_STR[k]) || k;
  const toast = t => { if (root.DRHud && DRHud.toast) DRHud.toast(t); };
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const num = v => typeof v === 'number' ? v : parseFloat(v) || 0;
  const maintenance = () => root.DRBooks ? DRBooks.mod('EQUIPMENT_MAINTENANCE') : 0;   // ResearchedEquipmentMaintenanceModifier (js/books.js)
  const LISTENER_R = B.colliderSize.spheres.find(s => s.node === 'POIInteractionListener').radius;   // 1,5 m
  const sfx = (k, v) => { try { if (k && root.DRAudio && DRAudio.resolve(k)) DRAudio.play(k, v == null ? 1 : v); } catch (e) { /* tiếng là phần phụ */ } };

  // ------------------------------------------------------------------------------------------------ vùng thu hoạch
  // HarvestZone: collider (cầu / hộp) + harvestableItems + day/night. HarvestZoneDetector dò bằng trigger của thuyền;
  // [ĐỀ XUẤT] web xét tâm thuyền nằm trong khối (bán kính vùng 200-450 m nên sai lệch vài mét không đáng kể).
  let ZONES = null;
  function zones() {
    if (ZONES) return ZONES;
    const vols = (root.DRWorld && DRWorld.data && DRWorld.data.markers.volumes) || [];
    ZONES = vols.filter(v => v.type === 'harvestZone' && v.active !== false && v.colliders && v.colliders.length).map(v => ({
      name: v.name, items: v.items || [], day: !!v.fields.day, night: !!v.fields.night, cols: v.colliders
    }));
    return ZONES;
  }
  function inCol(c, x, z) {
    const sc = c.scale || [1, 1, 1], ce = c.center || [0, 0, 0];
    const cs = Math.cos(c.rotY || 0), sn = Math.sin(c.rotY || 0);
    // tâm collider = vị trí + (center xoay theo rotY, nhân scale); toạ độ cục bộ của điểm thì xoay ngược
    const cx = c.pos[0] + (ce[0] * sc[0]) * cs + (ce[2] * sc[2]) * sn, cz = c.pos[2] - (ce[0] * sc[0]) * sn + (ce[2] * sc[2]) * cs;
    const dx = x - cx, dz = z - cz;
    if (c.shape === 'sphere') return Math.hypot(dx, dz) <= c.radius * Math.max(Math.abs(sc[0]), Math.abs(sc[2]));
    if (c.shape === 'box') {
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      return Math.abs(lx) <= c.size[0] * Math.abs(sc[0]) / 2 && Math.abs(lz) <= c.size[2] * Math.abs(sc[2]) / 2;
    }
    if (c.outlineXZ) {                                              // lưới lồi: điểm trong đa giác bao
      let inside = false; const P = c.outlineXZ;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) inside = !inside;
      }
      return inside;
    }
    return false;
  }
  const zonesAt = (x, z) => zones().filter(zn => zn.cols.some(c => inCol(c, x, z)));
  // HarvestableItemData.CanCatchByDepth: depth thô 0..1 so với GameConfigData.DepthBands[min].x / [max].y
  function canCatchByDepth(it, depth) {
    if (!it.hasMinDepth && !it.hasMaxDepth) return true;
    const bands = CFG.depthBands || {};
    if (it.hasMinDepth && depth < (bands[it.minDepth] || [0, 0])[0]) return false;
    if (it.hasMaxDepth && depth > (bands[it.maxDepth] || [0, 1])[1]) return false;
    return true;
  }
  // HarvestZoneDetector.GetHarvestableItemIds(func, depth, isDay): vùng đang chạm, đúng ngày/đêm, đúng độ sâu, không trùng
  function zoneItems(x, z, fn, depth, isDay) {
    const out = [];
    for (const zn of zonesAt(x, z)) {
      if ((isDay && !zn.day) || (!isDay && !zn.night)) continue;
      for (const id of zn.items) {
        const it = ITEMS[id];
        if (!it || out.includes(id) || (fn && !fn(it)) || !canCatchByDepth(it, depth)) continue;
        out.push(id);
      }
    }
    return out;
  }
  const depthAt = (x, z) => root.DRWorld ? DRWorld.depth01(x, z) : 0;   // WaveController.SampleWaterDepthAtPosition: kênh G
  function isDay() {
    const tc = root.DRWorld && DRWorld.data && DRWorld.data.scene.logic.TimeController[0].fields;
    return tc ? R.isDay(S().time, tc.dawnTime, tc.duskTime) : true;
  }
  // ItemManager.GetFormattedDepthString: thô × depthModifier, một chữ số lẻ, "m" (dấu phẩy thập phân tiếng Việt)
  const depthStr = d => (Math.round(d * num(CFG.depthModifier || 100) * 10) / 10).toFixed(1).replace('.', ',') + 'm';

  // ------------------------------------------------------------------------------------------------ tạo cá (ItemManager.CreateFishItem)
  // sizeMode 'ANY' | 'NO_BIG_TROPHY'; abMul = aberrationBonusMultiplier. Trả { id, extra } (id có thể đã thành dị biến).
  function createFish(id, sizeMode, abMul) {
    const s = S(), v = s.vars, it = ITEMS[id];
    let outId = id, hit = false;
    if (it && v['can-catch-aberrations'] && (it.aberrations || []).length && (s.caught[id] || 0) > 0) {
      const st = root.DRBoat.stats || {};
      let p = Math.min(num(CFG.maxAberrationSpawnChance), (isDay() ? num(CFG.baseAberrationSpawnChance) : num(CFG.nightAberrationSpawnChance)) +
        num(v['aberration-spawn-modifier']) + num(st.aberrationBonus));
      p *= abMul;
      if (Math.random() < p) {
        const wp = s.worldPhase | 0;
        let cand = it.aberrations.filter(a => ITEMS[a] && wp >= (ITEMS[a].minWorldPhaseRequired | 0) && !(s.caught[a] > 0));
        if (!cand.length) cand = it.aberrations.filter(a => ITEMS[a] && wp >= (ITEMS[a].minWorldPhaseRequired | 0));
        if (cand.length) { outId = cand[Math.floor(Math.random() * cand.length)]; hit = true; }
      }
    }
    // nhánh RANDOM_CHANCE luôn cập nhật hệ số: trúng thì về 0, trượt thì cộng SpawnChanceIncreasePerNonAberrationCaught
    if (hit) { v['aberration-spawn-modifier'] = 0; v['num-aberrations-caught'] = (v['num-aberrations-caught'] || 0) + 1; }
    else v['aberration-spawn-modifier'] = num(v['aberration-spawn-modifier']) + num(CFG.spawnChanceIncreasePerNonAberrationCaught);
    const g = R.gaussSize();
    const size = sizeMode === 'ANY' ? g : Math.min(g, num(CFG.trophyMaxSize) - 0.01);
    return { id: outId, aberrant: hit, extra: { size, fresh: num(CFG.maxFreshness) } };
  }
  // ItemManager.SetItemSeen: đếm loài đã bắt; banner loài mới nghe DR 'catch' (js/banner.js)
  function seen(id, extra, src) {
    const s = S(), it = ITEMS[id], isFish = (G().subOf(it) & G().SUB.FISH) !== 0;
    const isNew = !(s.caught[id] > 0);
    if (isFish) s.caught[id] = (s.caught[id] || 0) + 1;
    const size = extra && extra.size != null ? extra.size : null;
    D.emit('catch', { id, item: it, aberrant: !!it.isAberration, trophy: false, trophySize: !!(isFish && size != null && size >= num(CFG.trophyMaxSize)),
      size, isNew: isNew && isFish, cm: 0, placed: true, relic: String(it.subtype) === 'RELIC', holding: null, src });   // phát khi món mới được "thấy"
  }

  // ------------------------------------------------------------------------------------------------ khoang / món dùng
  const inv = () => D.grid('INVENTORY');
  const isEquip = it => (G().typeOf(it) & G().TYPE.EQUIPMENT) !== 0;
  const ofSub = sub => { const g = inv(); return g ? g.items.filter(i => { const it = ITEMS[i.id]; return it && isEquip(it) && (G().subOf(it) & sub); }) : []; };
  // SpatialItemInstance.durability: món mới tạo có độ bền đầy (ItemManager); DR.give / cửa hàng web không ghi `dur` nên điền ở đây
  function fillDurability() {
    const s = S();
    if (!s) return;
    for (const key of ['INVENTORY', 'STORAGE']) {
      if (!s.grids[key]) continue;
      for (const i of D.grid(key).items) {
        const it = ITEMS[i.id];
        if (it && it.damageMode === 'DURABILITY' && it.maxDurabilityDays && i.dur == null) i.dur = num(it.maxDurabilityDays);
      }
    }
  }
  // Ability.CycleItem: danh sách món khác loại mà năng lực dùng, chỉ số hiện tại quay vòng (NegativeMod)
  const cyc = { trawl: 0, pot: 0, bait: 0 };
  function uniqueItems(id) {
    const g = inv();
    if (!g) return [];
    let ids = [];
    if (id === 'trawl') ids = ofSub(G().SUB.NET).map(i => i.id);                              // TrawlNetAbility: không sắp xếp
    else if (id === 'pot') ids = ofSub(G().SUB.POT).map(i => i.id).sort();                    // DeployPotAbility: orderby id
    else if (id === 'bait') ids = g.items.map(i => i.id).filter(x => DEP.bait.items.includes(x)).sort();   // BaitAbility.baitItems, orderby id
    return ids.filter((x, k) => ids.indexOf(x) === k);
  }
  function selectedItem(id) {
    const u = uniqueItems(id);
    if (!u.length) return null;
    cyc[id] = ((cyc[id] % u.length) + u.length) % u.length;
    return u[cyc[id]];
  }
  function cycle(dir) {
    const id = AB.selected();
    if (!(id in cyc) || !(AB.data(id) || {}).allowItemCycling) return false;
    const u = uniqueItems(id);
    sfx(((B.physics.abilityAudio || {}).BaitAbility || { fields: {} }).fields.swapItemSFXAssetReference || 'click-back');   // swapItemSFXAssetReference
    if (!u.length) return true;
    cyc[id] = (((cyc[id] + dir) % u.length) + u.length) % u.length;
    info.dirty = true;
    return true;
  }

  // ================================================================================================ GR-06 lưới kéo
  const NET = { inst: null, key: null, mode: 'NONE', roll: 0, anim: null, animNode: null, fill: 0, lastT: null, catches: 0, broke: 0 };
  // SaveData.EquippedTrawlNetInstance: món NET đầu tiên trong khoang (kể cả hỏng)
  const equippedNet = () => ofSub(G().SUB.NET)[0] || null;
  // TrawlNetAbility.RefreshNetMode: oozeNetData / materialNetData (cùng quy ước với js/boat.js netKind: tir-net1 hút bùn, tir-net2 vật liệu)
  const netMode = inst => !inst ? 'NONE' : inst.id === 'tir-net1' ? 'TRAWL_OOZE' : inst.id === 'tir-net2' ? 'TRAWL_MATERIAL' : 'TRAWL';
  const netKey = inst => inst ? inst.uid + ':' + inst.id : null;
  // PlayerStats.CalculateEquipmentStats → TrawlNet.Init(gridConfig); TrawlNetAbility.OnItemInventoryChanged: không còn lưới thì xoá sạch,
  // đổi lưới thì đặt lại các món vừa chỗ (TryToRemoveExcessItems), món không vừa bị bỏ
  function syncNet() {
    const s = S();
    if (!s) return;
    const inst = equippedNet(), key = netKey(inst);
    if (key === NET.key && (!inst || s.grids.TRAWL_NET)) { NET.inst = inst; return; }
    NET.key = key; NET.inst = inst; NET.mode = netMode(inst);
    const old = s.grids.TRAWL_NET ? D.grid('TRAWL_NET').items.slice() : [];
    if (!inst) delete s.grids.TRAWL_NET;
    else {
      const cfgName = ITEMS[inst.id].gridConfig;
      if (!s.grids.TRAWL_NET || s.grids.TRAWL_NET.cfg !== cfgName) {
        s.grids.TRAWL_NET = { cfg: cfgName, items: [], damage: [], extra: [] };
        const g = D.grid('TRAWL_NET');
        for (const o of old) { const it = ITEMS[o.id]; const sp = it && G().findSpot(g, it, 0, false); if (sp) G().place(g, it, sp.x, sp.y, sp.rot, extraOf(o)); }
      }
    }
    const ab = ABS.trawl;
    if (ab && ab.isActive && (!inst || !(inst.dur > 0))) ab.deactivate();
    refreshNetAnim();
  }
  const extraOf = o => { const e = {}; for (const k of Object.keys(o)) if (!['uid', 'id', 'x', 'y', 'rot', 'cells'].includes(k)) e[k] = o[k]; return e; };
  // TrawlNetAbility.RefreshTimeUntilNextCatchRoll: lần đầu (chưa bắt con nào bằng lưới) 1/48 ngày, sau đó timeBetweenCatchRolls / gadget
  function resetRoll() {
    const it = NET.inst && ITEMS[NET.inst.id];
    NET.roll = !(S().vars['net-fish-caught'] > 0) ? 0.0208333333333333 : num(it.timeBetweenCatchRolls) / num((root.DRBoat.stats || {}).trawlRate || 1);
  }
  // CheckCanBeCaughtByThisNet: canBeCaughtByNet và harvestableType nằm trong harvestableTypes của lưới
  const netFilter = netId => it => !!it.canBeCaughtByNet && (ITEMS[netId].harvestableTypes || []).includes(it.harvestableType);
  // TrawlNetAbility.AddTrawlItem
  function addTrawlItem() {
    const b = S().boat, net = NET.inst, depth = depthAt(b.x, b.z);
    const ids = zoneItems(b.x, b.z, netFilter(net.id), depth, isDay());
    if (!ids.length) return null;
    const id = R.pickWeighted(ids, ITEMS), it = ITEMS[id];
    const g = D.grid('TRAWL_NET'), spot = G().findSpot(g, it, 0, false);
    if (!spot) { console.warn('[deploy] trawl net has no space for', id); return null; }
    let made = null;
    if (NET.mode === 'TRAWL') {
      // cá lưới: NO_BIG_TROPHY; loài không câu/bẫy được thì cỡ ANY và xác suất dị biến ×2
      const wild = !it.canBeCaughtByPot && !it.canBeCaughtByRod;
      const f = createFish(id, wild ? 'ANY' : 'NO_BIG_TROPHY', wild ? 2 : 1);
      made = G().place(g, ITEMS[f.id], spot.x, spot.y, spot.rot, f.extra) || G().autoPlace(g, ITEMS[f.id], f.extra);
      if (made) seen(f.id, f.extra, 'trawl');
    } else if (NET.mode === 'TRAWL_MATERIAL') {
      made = G().place(g, it, spot.x, spot.y, spot.rot, null);
      if (made) seen(id, null, 'trawl');
    }
    if (!made) return null;
    sfx(NET.mode === 'TRAWL_MATERIAL' ? AA.fields.materialNetCatchSFX : AA.fields.catchSFX, TA.catchSFXVolume);
    S().vars['net-fish-caught'] = (S().vars['net-fish-caught'] || 0) + 1;
    NET.catches++;
    D.emit('trawlCatch', { id: made.id, inst: made });              // phát khi một món vào lưới kéo
    D.emit('cargo', 'TRAWL_NET', made);
    refreshNetAnim();
    info.dirty = true;
    return made;
  }
  // SerializableGrid.GetFillProportional(subtype): số ô bị món loại ấy chiếm / số ô không ẩn
  function fillProp(g, sub) {
    let cells = 0, used = 0;
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (!g.cells[y * g.cols + x].hidden) cells++;
    for (const i of g.items) if (G().subOf(ITEMS[i.id]) & sub) used += i.cells.length;
    return cells ? used / cells : 0;
  }
  // TrawlNetAbility.RefreshNetFullness + RefreshDeploymentState: tham số Animator "isDeployed", "fullness" của TrawlNet_Animator
  function refreshNetAnim() {
    const s = S(), g = s && s.grids.TRAWL_NET ? D.grid('TRAWL_NET') : null;
    NET.fill = !g ? 0 : NET.mode === 'TRAWL' ? fillProp(g, G().SUB.FISH) : NET.mode === 'TRAWL_MATERIAL' ? fillProp(g, G().SUB.MATERIAL) + fillProp(g, G().SUB.TRINKET) : 0;
    const p = netAnimator();
    if (p) { p.set('isDeployed', !!(ABS.trawl && ABS.trawl.isActive)); p.set('fullness', NET.fill); }
  }
  // bộ chạy Animator gắn vào nút TrawlNet của thân thuyền hiện tại (boat.glb); [thiếu] lưới da của TrawlNet và các con cá Net_xx
  // không có trong boat.glb (skin bị bỏ khi xuất) nên clip chỉ dời được xương TrawlArm/NetMesh — xem DRDeploy.debug().netAnimMissing
  function netAnimator() {
    if (!root.DRAnim || !root.DRBoat || !DRBoat.root) return null;
    const tier = S() ? S().hullTier : 1, eq = (B.tierEquipment['Boat' + tier] || {}).net || {};
    const path = eq.trawl;
    let node = null;
    if (path) {
      const tierNode = DRBoat.root.getObjectByName('Boat' + tier);
      if (tierNode) tierNode.traverse(o => { if (!node && /^TrawlNet(_\d+)?$/.test(o.name)) node = o; });
    }
    if (node !== NET.animNode) {
      if (NET.anim) { try { NET.anim.destroy(); } catch (e) { /* bộ chạy cũ */ } }
      NET.anim = node ? DRAnim.bind(node, 'TrawlNet_Animator', { auto: false }) : null;
      NET.animNode = node;
    }
    return NET.anim;
  }

  class Trawl extends AB.Ability {
    // TrawlNetAbility.Activate: đang thả thì kéo lên; lưới còn độ bền thì thả, đặt hẹn giờ quăng, phát tiếng thả theo loại lưới
    activate(quiet) {
      if (this.isActive) { this.deactivate(); return false; }
      syncNet();
      const inst = NET.inst;
      if (!inst || !(inst.dur > 0)) return false;
      this.isActive = true;
      NET.mode = netMode(inst);
      resetRoll();
      NET.lastT = S().time;
      if (!quiet) sfx(NET.mode === 'TRAWL_MATERIAL' ? AA.fields.materialNetDeploySFX : NET.mode === 'TRAWL_OOZE' ? AA.fields.oozeDeploySFX : AA.fields.deploySFX);
      const ok = this.baseActivate();
      refreshNetAnim();
      info.dirty = true;
      return ok;
    }
    // TrawlNetAbility.Deactivate: lưới còn bền thì tiếng kéo lên, hết bền thì tiếng đứt
    deactivate(quiet) {
      if (this.isActive && !quiet) {
        if (NET.mode === 'TRAWL_OOZE') sfx(AA.fields.oozeEndSFX, TA.endSFXVolume);
        else if (NET.inst && NET.inst.dur > 0) sfx(NET.mode === 'TRAWL_MATERIAL' ? AA.fields.materialNetRetractSFX : AA.fields.retractSFX, TA.endSFXVolume);
        else { sfx(NET.mode === 'TRAWL_MATERIAL' ? AA.fields.materialNetBreakSFX : AA.fields.breakSFX, TA.breakSFXVolume); NET.broke++; }
      }
      this.baseDeactivate(true);
      refreshNetAnim();
      info.dirty = true;
    }
  }
  // TrawlNetAbility.Update: chỉ khi đang thả và thuyền đang chạy (Controller.IsMoving = có lực lái): độ bền −= Δngày·(1 − bảo trì),
  // hẹn giờ −= Δngày; hết hẹn thì Random.value < catchRate ⇒ AddTrawlItem, rồi đặt lại hẹn. Hết bền ⇒ kéo lên (tiếng đứt).
  // Không có giảm tốc khi thả lưới: TrawlNetAbility/PlayerController không đổi lực máy theo lưới.
  function tickTrawl() {
    const ab = ABS.trawl, s = S();
    const now = s.time, change = NET.lastT == null ? 0 : now - NET.lastT;
    NET.lastT = now;
    if (!ab || !ab.isActive || !NET.inst) return;
    if (!(NET.inst.dur > 0)) { ab.deactivate(); D.emit('cargo', 'INVENTORY', null); return; }
    const moving = D.mode === 'sail' && root.DRBoat && DRBoat.moved;
    const dt = moving ? change : 0;
    // SpatialItemInstance.ChangeDurability: kẹp [0, maxDurabilityDays]
    if (moving && change) NET.inst.dur = Math.max(0, Math.min(num(ITEMS[NET.inst.id].maxDurabilityDays), NET.inst.dur - change * (1 - maintenance())));
    if (NET.inst.dur > 0) {
      if (NET.mode === 'TRAWL' || NET.mode === 'TRAWL_MATERIAL') {
        NET.roll -= dt;
        if (NET.roll <= 0) {
          if (Math.random() < num(ITEMS[NET.inst.id].catchRate)) addTrawlItem();
          resetRoll();
        }
      }
      // [ĐỀ XUẤT] TRAWL_OOZE (lưới hút bùn) cần OozePatchManager — web chưa có vệt bùn nên lưới này không thu được gì
    } else { ab.deactivate(); D.emit('cargo', 'INVENTORY', null); }
  }

  // ================================================================================================ GR-07 bẫy cua
  const POT_VIS = new Map();                                        // bản ghi bẫy → { group, anim, nodes, y, t, state }
  const pots = () => { const s = S(); if (!s) return []; s.pots = s.pots || []; return s.pots; };
  let potSeq = 0;
  function newPotKey() {
    const s = S();
    let k;
    do k = 'POT_' + (++potSeq); while (s.grids[k]);
    return k;
  }
  // BoatModelProxy.DeployPosition (nút DeployPosition của thân BoatN trong boat.glb) → vị trí thế giới
  const _v = new T.Vector3();
  function deployPos() {
    const b = S().boat, tier = S().hullTier;
    let node = null;
    const tn = root.DRBoat && DRBoat.root && DRBoat.root.getObjectByName('Boat' + tier);
    if (tn) tn.traverse(o => { if (!node && /^DeployPosition(_\d+)?$/.test(o.name)) node = o; });
    if (node) { node.updateWorldMatrix(true, false); node.getWorldPosition(_v); return { x: _v.x, z: _v.z, yaw: b.yaw }; }
    const at = ((B.tiers[tier - 1] || B.tiers[0]).attach || {}).DeployPosition || { pos: [0, 0, 0] }, p = at.pos;
    const c = Math.cos(b.yaw), sn = Math.sin(b.yaw);
    return { x: b.x + p[0] * c + p[2] * sn, z: b.z - p[0] * sn + p[2] * c, yaw: b.yaw };
  }
  // SerializedCrabPotPOIData.RefreshCatchableItems: vùng dưới bẫy (RaycastAll xuống, KHÔNG xét ngày/đêm), canBeCaughtByPot,
  // lưới bẫy nhận type/subtype của món (HasFlag), đúng độ sâu tại bẫy
  function potItems(p) {
    const cfg = root.DR_GRIDS[ITEMS[p.deployableItemId].gridConfig];
    const mt = G().mask(cfg.mainItemType, G().TYPE), ms = G().mask(cfg.mainItemSubtype, G().SUB);
    const out = [];
    for (const zn of zonesAt(p.x, p.z)) for (const id of zn.items) {
      const it = ITEMS[id];
      if (!it || out.includes(id) || !it.canBeCaughtByPot) continue;
      const t = G().typeOf(it), sb = G().subOf(it);
      if ((mt & t) !== t || (ms & sb) !== sb || !canCatchByDepth(it, p.depth)) continue;
      out.push(id);
    }
    return out;
  }
  // SerializedCrabPotPOIData.CalculateCatchRoll (đệ quy theo từng khúc TimeBetweenCatchRolls, viết thành vòng lặp)
  function catchRoll(p, elapsed) {
    const it = ITEMS[p.deployableItemId], tbcr = num(it.timeBetweenCatchRolls);
    let flag = false;
    for (;;) {
      const step = Math.min(elapsed, tbcr);
      elapsed -= step;
      p.timeUntilNextCatchRoll -= step;
      if (p.timeUntilNextCatchRoll <= 0 && p.durability > 0) {
        if (Math.random() < num(it.catchRate)) {
          p.items = p.items || potItems(p);
          if (!p.items.length) return false;                        // GetRandomHarvestableItem() == null ⇒ return false (bỏ phần thời gian còn lại)
          let id = R.pickWeighted(p.items, ITEMS), h = ITEMS[id];
          if (h.canBeReplacedWithResearchItem && ITEMS['research-item'] && Math.random() < num(CFG.researchItemCrabPotSpawnChance)) { id = 'research-item'; h = ITEMS[id]; }
          const g = D.grid(p.grid), spot = G().findSpot(g, h, 0, false);
          if (spot) {
            let extra = null;
            if (G().subOf(h) & G().SUB.FISH) { const f = createFish(id, 'ANY', 1 + num(it.aberrationBonus)); id = f.id; extra = f.extra; }
            const made = G().place(g, ITEMS[id], spot.x, spot.y, spot.rot, Object.assign({ seen: false }, extra || {})) || G().autoPlace(g, ITEMS[id], Object.assign({ seen: false }, extra || {}));
            if (made) flag = true;
          }
        }
        p.timeUntilNextCatchRoll = tbcr;
      }
      if (!(elapsed > 0)) break;
    }
    return flag;
  }
  // SerializedCrabPotPOIData.AdjustDurability: −Δngày·(1 − bảo trì), kẹp [0, maxDurabilityDays]; trả true khi vừa hỏng
  function adjustDurability(p, now) {
    const had = p.durability > 0;
    const d = now - p.lastUpdate;
    p.lastUpdate = now;
    p.durability = Math.max(0, Math.min(num(ITEMS[p.deployableItemId].maxDurabilityDays), p.durability - d * (1 - maintenance())));
    return p.durability <= 0 && had;
  }
  // PlacedHarvestPOI.AdjustStockLevels: quăng trước (theo now − lastUpdate) rồi trừ độ bền (cập nhật lastUpdate)
  function tickPots() {
    const now = S().time;
    for (const p of pots()) {
      if (catchRoll(p, now - p.lastUpdate)) D.emit('cargo', p.grid, null);
      adjustDurability(p, now);
      setVisual(p);
    }
  }

  // DeployPotAbility.DeployCrabPot
  function deployPot(inst) {
    const dp = deployPos(), it = ITEMS[inst.id];
    const key = newPotKey();
    S().grids[key] = { cfg: it.gridConfig, items: [], damage: [], extra: [] };
    const p = { x: dp.x, z: dp.z, deployableItemId: inst.id, durability: inst.dur == null ? num(it.maxDurabilityDays) : inst.dur,
      timeUntilNextCatchRoll: num(it.timeBetweenCatchRolls), lastUpdate: S().time, grid: key };
    Object.defineProperty(p, 'yRotation', { value: dp.yaw, writable: true, enumerable: false });   // NonSerialized
    pots().push(p);
    initPot(p, true);
    toast('Đã thả ' + it.name + ' ở độ sâu ' + depthStr(p.depth) + '.');   // notification.crab-pot-deployed
    D.emit('potDeployed', { pot: p });                                       // phát khi một bẫy được thả
    return true;
  }
  // SerializedCrabPotPOIData.Init (+ GameSceneInitializer.CreatePlacedHarvestPOI): độ sâu, danh sách bắt được, dựng phao
  function initPot(p, fresh) {
    Object.defineProperty(p, 'depth', { value: depthAt(p.x, p.z), writable: true, enumerable: false });
    Object.defineProperty(p, 'items', { value: null, writable: true, enumerable: false });
    p.items = potItems(p);
    buildBuoy(p, fresh);
  }
  class Pot extends AB.Ability {
    // DeployPotAbility.Activate: bẫy cùng loại đang chọn có độ bền lớn nhất (> 0); không có thì báo; thả xong bỏ khỏi khoang
    activate() {
      const sel = selectedItem('pot');
      const list = ofSub(G().SUB.POT).filter(i => i.id === sel);
      let ok = false;
      if (list.length) {
        let best = null, max = 0;
        for (const i of list) { const d = i.dur == null ? num(ITEMS[i.id].maxDurabilityDays) : i.dur; if (d > max && d > 0) { max = d; best = i; } }
        if (!best) toast('Không còn ' + ITEMS[sel].name + ' nào còn độ bền.');                    // notification.deploy-pot.none-with-durability
        else if (pots().length >= num(CFG.maxCrabPotCount)) {
          // [ĐỀ XUẤT] GameConfigData.maxCrabPotCount (25) và chuỗi notification.crab-pot-deployment-failed-too-many có trong dữ liệu,
          // nhưng mã 1.5.3 không còn chỗ nào đọc: web chặn ở đây đúng như chuỗi gốc mô tả
          toast('Vượt quá số bẫy cho phép. Không thả được.');
          sfx('ui.grid.error');
        } else if (deployPot(best)) {
          G().remove(inv(), best);
          D.emit('cargo', 'INVENTORY', null);
          this.isActive = true; ok = true;
        }
      }
      this.baseActivate();
      this.deactivate();
      info.dirty = true;
      return ok;
    }
  }

  // ---- phao (PlacedHarvestPOI / PlacedMaterialHarvestPOI)
  const TEX = {};
  function tex(path) {
    if (!TEX[path]) {
      const t = new T.TextureLoader().load(URLB(path));
      t.encoding = T.sRGBEncoding; t.magFilter = t.minFilter = T.NearestFilter;   // filterMode 0 (Point), wrapU 1 (Clamp)
      t.wrapS = t.wrapT = T.ClampToEdgeWrapping; t.generateMipmaps = false;
      TEX[path] = t;
    }
    return TEX[path];
  }
  const GEO = {}, MAT = {};
  function geo(name) {
    if (!GEO[name]) {
      const m = DEP.meshes[name], g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(m.p, 3));
      if (m.n) g.setAttribute('normal', new T.Float32BufferAttribute(m.n, 3)); else g.computeVertexNormals();
      if (m.uv) g.setAttribute('uv', new T.Float32BufferAttribute(m.uv, 2));
      g.setIndex(m.i);
      GEO[name] = g;
    }
    return GEO[name];
  }
  // Lit_Shader: albedo + phát sáng × LightStrength; LightsFlicker nhân thêm LightFlickerGradient.r (sRGB→tuyến tính) theo
  // u = (x + z Unity của vật) − _GameTime·0,1 như js/world.js. [ĐỀ XUẤT] chiếu sáng bằng Lambert như thân thuyền (js/boat.js)
  function mat(name) {
    if (!MAT[name]) {
      const d = DEP.materials[name];
      const m = d.map ? new T.MeshLambertMaterial({ map: tex(d.map) }) : new T.MeshLambertMaterial({ color: new T.Color(d.color[0], d.color[1], d.color[2]) });
      if (d.emissiveMap) { m.emissiveMap = tex(d.emissiveMap); m.emissive = new T.Color(1, 1, 1); m.emissiveIntensity = num(d.lightStrength); }
      m.name = name;
      m.userData.flicker = d.flicker ? (d.flickerGradient || { r: [1] }).r : null;
      MAT[name] = m;
    }
    return MAT[name];
  }
  function buildBuoy(p, fresh) {
    const scene = root.DRBoat && DRBoat.root && DRBoat.root.parent;
    if (!scene) return;
    const pf = DEP.prefabs[p.deployableItemId === DEP.materialPotItem ? 'PlacedMaterialHarvestPOI' : 'PlacedHarvestPOI'];
    const objs = pf.nodes.map(n => {
      let o;
      if (n.mesh) {
        const m = n.mat ? mat(n.mat) : mat('CrabPotBuoy_Mat');
        // vật liệu nhấp nháy dùng chung: mỗi phao một bản để pha nhấp nháy theo vị trí riêng
        o = new T.Mesh(geo(n.mesh), m.userData.flicker ? m.clone() : m);
        if (m.userData.flicker) o.material.userData.flicker = m.userData.flicker;
      } else o = new T.Group();
      o.name = n.name;
      o.position.set(n.pos[0], n.pos[1], n.pos[2]);
      o.quaternion.set(n.q[0], n.q[1], n.q[2], n.q[3]);
      o.scale.set(n.s[0], n.s[1], n.s[2]);
      o.visible = n.active;
      return o;
    });
    pf.nodes.forEach((n, i) => { if (n.parent >= 0) objs[n.parent].add(objs[i]); });
    const group = objs[0];
    group.position.set(p.x, 0, p.z);                                 // Instantiate ở y = 0, SimpleBuoyantObject kéo lên mặt sóng
    group.rotation.set(0, p.yRotation || 0, 0);
    scene.add(group);
    let anim = null;
    if (root.DRAnim && pf.animator && pf.animator.controller) {
      anim = DRAnim.bind(objs[pf.animator.node], pf.animator.controller, { auto: false });
      if (fresh) anim.trigger('deploy');                              // PlacedHarvestPOI.Awake: SetTrigger("deploy") khi cảnh đã dựng xong
    }
    const st = {};
    for (const [k, idx] of Object.entries(pf.states)) st[k] = objs[idx];
    const vis = { group, anim, st, y: 0, target: 0, t: 0, flick: objs.filter(o => o.isMesh && o.material.userData.flicker) };
    POT_VIS.set(p, vis);
    setVisual(p);
  }
  // PlacedHarvestPOI.UpdateVisuals: còn bền ⇒ có đồ: ready (đèn nhấp nháy), trống: idle; hết bền ⇒ broken
  function setVisual(p) {
    const v = POT_VIS.get(p);
    if (!v) return;
    const stock = S().grids[p.grid] ? D.grid(p.grid).items.length : 0;
    const want = p.durability > 0 ? (stock >= 1 ? 'ready' : 'idle') : 'broken';
    if (v.state === want) return;
    v.state = want;
    for (const [k, o] of Object.entries(v.st)) o.visible = k === want;
  }
  function removeBuoy(p) {
    const v = POT_VIS.get(p);
    if (!v) return;
    if (v.anim) { try { v.anim.destroy(); } catch (e) { /* đã huỷ */ } }
    if (v.group.parent) v.group.parent.remove(v.group);
    v.group.traverse(o => { if (o.isMesh && o.material.userData.flicker && o.material !== MAT[o.material.name]) o.material.dispose(); });
    POT_VIS.delete(p);
  }
  let flickR = null;
  const s2l = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  function updateBuoys(dt) {
    if (!POT_VIS.size) return;
    const W = root.DRWater, Wd = root.DRWorld, gt = root.DRSky && DRSky.uniforms ? DRSky.uniforms.uDrTime.value : performance.now() / 1000;
    for (const [p, v] of POT_VIS) {
      // SimpleBuoyantObject: đích = sóng tại chỗ + objectDepth, lấy lại mỗi timeBetweenUpdatingWaveSteepnessSec; y = Lerp(y, đích, dt)
      const pf = DEP.prefabs.PlacedHarvestPOI.buoyant;
      v.t -= dt;
      if (v.t <= 0 && W && W.wave && Wd) {
        v.t = pf.every;
        const k = Math.min(1, Wd.steep01(p.x, p.z) * 10) * W.uniforms.uWaveSteep.value;
        v.target = W.wave(p.x, p.z, k)[0] + pf.depth;
      }
      v.y += (v.target - v.y) * Math.min(1, dt);
      v.group.position.y = v.y;
      if (v.anim) v.anim.update(dt);
      if (v.state === 'ready') for (const o of v.flick) {
        const r = o.material.userData.flicker, ph = p.x - p.z - gt * 0.1;
        const u = ph - Math.floor(ph), i = Math.min(r.length - 1, Math.floor(u * r.length));
        flickR = r[i];
        o.material.emissiveIntensity = num(DEP.materials[o.material.name] ? DEP.materials[o.material.name].lightStrength : 4) * s2l(flickR);
      }
    }
  }

  // ---- mở bẫy (Harvester.ShowHarvestGrid → OccasionalGridPanel)
  let openPot = null;
  const nearPot = () => {
    const b = S().boat, r = DEP.prefabs.PlacedHarvestPOI.collider.radius + LISTENER_R;
    let best = null, bd = 1e9;
    for (const p of pots()) { const d = Math.hypot(p.x - b.x, p.z - b.z); if (d <= r && d < bd) { bd = d; best = p; } }
    return best;
  };
  function showPot(p) {
    if (!root.DRCargo || !DRCargo.open) return false;
    const it = ITEMS[p.deployableItemId], g = D.grid(p.grid);
    // OccasionalGridPanel.Show: món cá chưa "thấy" đếm vào PotCrabsCaught; TriggerFishCaught
    for (const i of g.items) {
      if (i.seen === false) {
        if (G().subOf(ITEMS[i.id]) & G().SUB.FISH) S().vars['pot-crabs-caught'] = (S().vars['pot-crabs-caught'] || 0) + 1;
        i.seen = true;
        seen(i.id, i, 'pot');
      }
    }
    if (root.DRBoat) DRBoat.stop();
    // label.deployable.durability-value "{0} remaining" / tooltip.deployable.durability-broken "Needs Repair"; DepthMeter: độ sâu tại bẫy
    const durTxt = () => p.durability > 0 ? 'Còn ' + fmtDays(p.durability) : 'Cần sửa';
    openPot = p;
    // CrabPotSlidePanel (Game.unity): 650×550, lưới 450×450 giữa bảng, tên trên, độ bền dưới tên, hai nút đáy ⇒ dựng bằng bảng kiểu
    // QuestGridSlidePanel cùng kích thước (gridHeightOverride = 550 − hàng·60) thay cho bảng kho 650×800; lưới là DR.s.grids[p.grid]
    const cfgName = it.gridConfig, rows = root.DR_GRIDS[cfgName].rows;
    const h = DRCargo.open({
      right: { tabs: ['INVENTORY'] },
      left: {
        kind: 'quest', subtitle: durTxt(),
        quest: { gridConfiguration: cfgName, gridKey: p.grid, isSaved: true, questGridExitMode: 'REVISITABLE', titleString: it.name,
          gridHeightOverride: 550 - rows * 60 },
        footer: {
          help: 'Độ sâu ' + depthStr(p.depth),
          buttons: [
            { id: 'take-all', label: 'Lấy hết', enabled: () => D.grid(p.grid).items.length > 0, run: () => takeAll(p, h) },   // button.deployable-take-all
            { id: 'pick-up', label: 'Nhặt bẫy', run: () => pickUp(p, h) }                                                          // button.deployable-pick-up
          ]
        }
      },
      onClose: () => { openPot = null; setVisual(p); }
    });
    sfx('Crab Pot - Open');                                           // [ĐỀ XUẤT] OccasionalGridPanel.openSFX bị AssetRipper bỏ; clip cùng tên
    return !!h;
  }
  // LanguageManager.FormatTimeStringForDurability: [ĐỀ XUẤT] "x ngày" / "x giờ" (chuỗi gốc qua tooltip.time.*)
  const fmtDays = d => d >= 1 ? (Math.round(d * 10) / 10).toString().replace('.', ',') + ' ngày' : Math.max(1, Math.round(d * 24)) + ' giờ';
  // OccasionalGridPanel.EmptyDeployableIntoInventory: từ món cuối về đầu, món nào vừa khoang thì chuyển
  function emptyInto(p) {
    const g = D.grid(p.grid), iv = inv();
    for (let k = g.items.length - 1; k >= 0; k--) {
      const i = g.items[k], it = ITEMS[i.id], spot = G().findSpot(iv, it, 0, false);
      if (!spot) continue;
      G().remove(g, i);
      const made = G().place(iv, it, spot.x, spot.y, spot.rot, extraOf(i));
      if (made) D.emit('cargo', 'INVENTORY', made);
    }
    setVisual(p);
  }
  function takeAll(p, h) {
    emptyInto(p);
    sfx('Crab Pot - Pick up');                                        // BasicButtonWrapper.submitSFX (Game.unity)
    if (D.grid(p.grid).items.length) toast('Không đủ chỗ cho mọi món.');   // notification.crab-pot-pickup-failed
    else if (h) h.close();
    D.emit('potCollected', { pot: p, picked: false });               // phát khi lấy đồ khỏi bẫy
  }
  function pickUp(p, h) {
    if (D.grid(p.grid).items.length) emptyInto(p);
    sfx('Crab Pot - Pick up');
    const it = ITEMS[p.deployableItemId], iv = inv();
    const spot = D.grid(p.grid).items.length ? null : G().findSpot(iv, it, 0, false);
    if (!spot) { toast('Không đủ chỗ cho mọi món.'); return; }
    removePot(p);
    const made = G().place(iv, it, spot.x, spot.y, spot.rot, { dur: p.durability });
    D.emit('cargo', 'INVENTORY', made);
    D.emit('potCollected', { pot: p, picked: true });                // phát khi nhặt bẫy lên thuyền
    if (h) h.close();
  }
  function removePot(p) {
    const list = pots(), k = list.indexOf(p);
    if (k >= 0) list.splice(k, 1);
    delete S().grids[p.grid];
    removeBuoy(p);
  }

  // ================================================================================================ GR-13 mồi
  const BAITS = [];                                                  // { handle, stack, fx, id }
  let baitSeq = 0;
  // BaitAbility.GetFishForBait
  function fishForBait(baitId) {
    const s = S(), zone = root.DRWorld ? DRWorld.zoneAt(s.boat.x, s.boat.z) : 'THE_MARROWS', tir = (s.vars['tir-world-phase'] | 0);
    const st = root.DRBoat.stats || { harvestTypes: new Set(), advancedTypes: new Set() };
    const hasEq = it => it.requiresAdvancedEquipment ? st.advancedTypes.has(it.harvestableType) : st.harvestTypes.has(it.harvestableType);
    const inZone = it => (it.zonesFoundIn || []).includes(zone);
    const fish = Object.values(ITEMS).filter(i => i.cls === 'FishItemData' && (G().subOf(i) & G().SUB.FISH));
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    let list;
    if (baitId === 'bait') list = shuffle(fish.filter(i => !i.isAberration && i.canAppearInBaitBalls && i.canBeCaughtByRod && inZone(i) && (i.tirPhase | 0) <= tir && hasEq(i)));
    else if (baitId === 'bait-exotic') list = fish.filter(i => i.locationHiddenUntilCaught && i.canBeCaughtByRod && !i.isAberration && inZone(i) && (i.tirPhase | 0) <= tir);
    else if (baitId === 'bait-ab' && s.vars['can-catch-aberrations']) {
      const wp = s.worldPhase | 0;
      list = shuffle(fish.filter(i => i.isAberration && !i.locationHiddenUntilCaught && i.nonAberrationParent && ITEMS[i.nonAberrationParent] &&
        ITEMS[i.nonAberrationParent].canAppearInBaitBalls && i.canBeCaughtByRod && inZone(i) && (i.tirPhase | 0) <= tir && hasEq(i) &&
        (s.caught[i.nonAberrationParent] || 0) > 0 && wp >= (i.minWorldPhaseRequired | 0)));
    } else if (baitId === 'bait-crab') list = shuffle(fish.filter(i => i.canBeCaughtByPot && !i.isAberration && i.canAppearInBaitBalls && (i.tirPhase | 0) <= tir && inZone(i)));
    else return [];
    return list.slice(0, Math.min(list.length, num(CFG.numFishSpeciesInBaitBall))).map(i => i.id);
  }
  // BaitAbility.DeployBait: ngăn xếp cá (Stack: đẩy list[i % n], lấy từ đỉnh), không hồi kho; Random.Range(int, int) không lấy cận trên
  function deployBait(inst) {
    const baitId = inst.id;
    let list = fishForBait(baitId);
    if (!list.length) { toast('Chẳng con cá nào cắn mồi.'); return false; }                   // notification.bait-failed
    let n = num(CFG.numFishInBaitBallMin) + Math.floor(Math.random() * (num(CFG.numFishInBaitBallMax) - num(CFG.numFishInBaitBallMin)));
    if (baitId === 'bait-exotic') n = 1;
    const deep = ITEMS[DEP.bait.deepForm];
    if (baitId === 'bait-ab' && deep && root.DRQuests && DRQuests.state && DRQuests.state(deep.questCompleteRequired) === 'COMPLETED' &&
      (deep.zonesFoundIn || []).includes(DRWorld.zoneAt(S().boat.x, S().boat.z)) && Math.random() <= num(deep.baitChanceOverride)) { n = 1; list = [deep.id]; }
    const stack = [];
    for (let i = 0; i < n; i++) stack.push(list[i % list.length]);
    const dp = deployPos(), id = 'bait-' + (++baitSeq);
    const pf = DEP.prefabs.BaitPOI;
    // [ĐỀ XUẤT] HarvestPOI của mồi không bao giờ "đặc biệt" (BaitPOIDataModel.CanBeSpecial = false): ép xác suất 0
    const d = { id, items: [stack[stack.length - 1]], nightItems: [], usesTimeSpecificStock: false, startStock: n, maxStock: n, doesRestock: false,
      overrideDefaultDaySpecialChance: true, overriddenDaytimeSpecialChance: 0, overrideDefaultNightSpecialChance: true, overriddenNighttimeSpecialChance: 0 };
    const handle = DRSpots.addTemp({ id, x: dp.x, z: dp.z, r: pf.collider.radius, d });
    // HarvestPOI.Start: harvestParticlePrefab của BaitPOI = BaitParticles (bầy mồi)
    let fx = null;
    try { if (root.DRParticles) fx = DRParticles.spawn(pf.harvestParticlePrefab || 'BaitParticles', { pos: [dp.x, 0, dp.z], yaw: dp.yaw, loop: true }); } catch (e) { fx = null; }
    BAITS.push({ id, handle, stack, fx, item: baitId });
    G().remove(inv(), inst);
    D.emit('cargo', 'INVENTORY', null);
    D.emit('baitDeployed', { id, stock: n, fish: stack.slice() });   // phát khi thả mồi: điểm câu tạm với n con
    info.dirty = true;
    return true;
  }
  // BaitPOIDataModel.AddStock(-1): mỗi con bắt được lấy khỏi đỉnh ngăn xếp, con kế tiếp là món đầu của điểm
  function onCatch(made) {
    const cur = root.DRSpots && DRSpots.cur;
    if (!cur || !cur.sp) return;
    const b = BAITS.find(x => x.handle.sp === cur.sp);
    if (!b || !made || made.src) return;
    b.stack.pop();
    if (b.stack.length) cur.sp.d.items = [b.stack[b.stack.length - 1]];
  }
  function sweepBaits() {
    for (let k = BAITS.length - 1; k >= 0; k--) {
      const b = BAITS[k], r = S().spots[b.id];
      if (root.DRSpots && DRSpots.cur && DRSpots.cur.sp === b.handle.sp) continue;
      // HarvestPOI.OnStockUpdated: hết kho thì tắt collider; [ĐỀ XUẤT] web bỏ hẳn điểm (không còn tương tác, bầy mồi tắt)
      if (!b.stack.length || (r && r.stock < 1)) removeBait(b);
    }
  }
  function removeBait(b) {
    const k = BAITS.indexOf(b);
    if (k >= 0) BAITS.splice(k, 1);
    try { b.handle.remove(); } catch (e) { /* đã gỡ */ }
    if (b.fx) { try { b.fx.stop(); } catch (e) { /* hệ hạt dùng chung */ } }
  }
  class Bait extends AB.Ability {
    // BaitAbility.Activate: luôn trả true (kể cả khi mồi không dụ được cá: mồi giữ lại, chỉ báo)
    activate() {
      const sel = selectedItem('bait'), inst = sel && inv().items.find(i => i.id === sel);
      if (inst) { this.isActive = true; deployBait(inst); }
      else console.warn('[deploy] bait ability used with no bait in cargo');
      this.baseActivate();
      this.deactivate();
      return true;
    }
  }

  // ================================================================================================ bảng thông tin (DeployableAbilityInfoPanel)
  // ActiveAbilityInfoPanel: hiện khi chọn bẫy / mồi / lưới; tên món (Z/X đổi), độ sâu hiện tại, "chất lượng" = số loài bắt được ở đây
  // (0 Không có / 1 Ít / ≥2 Nhiều), làm mới mỗi timeBetweenUpdates 0,5 s; trượt vào animateXAmount 75 trong 0,35 s OutExpo.
  // ActiveTrawlTab: thẻ đếm số món trong lưới khi lưới đang thả (showsCounter).
  const info = { el: null, dirty: true, t: 0, shown: false, a: 0 };
  const QUAL = ['Không có', 'Ít', 'Nhiều'], QCOL = ['#dc2c38', '#ffffff', '#74d27a'];   // ability.harvest-quality.*, NEGATIVE/NEUTRAL/POSITIVE
  function rect(path, parent) {
    const r = UIR[path];
    if (!r) throw new Error('ability UI rect not found: ' + path);
    const ax0 = parent.x + r.aMin[0] * parent.w, ax1 = parent.x + r.aMax[0] * parent.w;
    const ay0 = parent.y + r.aMin[1] * parent.h, ay1 = parent.y + r.aMax[1] * parent.h;
    const w = ax1 - ax0 + r.size[0], h = ay1 - ay0 + r.size[1];
    const px = ax0 + (ax1 - ax0) * r.pivot[0] + r.pos[0], py = ay0 + (ay1 - ay0) * r.pivot[1] + r.pos[1];
    return { x: px - w * r.pivot[0], y: py - h * r.pivot[1], w, h };
  }
  function place(e, R0, parent) {
    e.style.left = (R0.x - parent.x) + 'px'; e.style.top = (parent.y + parent.h - (R0.y + R0.h)) + 'px';
    e.style.width = R0.w + 'px'; e.style.height = R0.h + 'px';
    return e;
  }
  const el = (tag, cls, parent, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; };
  function buildInfo() {
    const box = info.el = el('div', 'dp-ui');
    box.id = 'dr-deploy';
    document.body.appendChild(box);
    const scr = { x: 0, y: 0, w: 1920, h: 1080 };
    const A = rect('ActiveAbility', scr), C = rect('ActiveAbility/Container', A);
    const P = 'ActiveAbility/Container/DeployableAbilityInfoPanel';
    const frame = { x: 0, y: 0, w: 0, h: 0 };
    const pnR = rect(P, C), ctR = rect(P + '/Container', pnR), coR = rect(P + '/Container/Contents', ctR);
    const bar = info.bar = el('div', 'dp-bar', box);
    const pn = info.panel = place(el('div', 'dp-panel', bar), ctR, frame);
    const co = { x: ctR.x, y: ctR.y, w: ctR.w, h: ctR.h };
    const hdR = rect(P + '/Container/Contents/Header', coR);
    const hd = place(el('div', 'dp-head', pn), hdR, co);
    info.prev = place(el('b', 'dp-key', hd, 'Z'), rect(P + '/Container/Contents/Header/CycleItemPrev', hdR), hdR);
    info.name = place(el('span', 'dp-name', hd), rect(P + '/Container/Contents/Header/ItemNameText', hdR), hdR);
    info.next = place(el('b', 'dp-key', hd, 'X'), rect(P + '/Container/Contents/Header/CycleItemNext', hdR), hdR);
    const goR = rect(P + '/Container/Contents/GameObject', coR);
    const go = place(el('div', 'dp-body', pn), goR, co);
    const dR = rect(P + '/Container/Contents/GameObject/Depth', goR), qR = rect(P + '/Container/Contents/GameObject/Quality', goR);
    const dp = place(el('div', 'dp-cell', go), dR, goR), qp = place(el('div', 'dp-cell', go), qR, goR);
    place(el('i', 'dp-ic dp-depth', dp), rect(P + '/Container/Contents/GameObject/Depth/DepthIcon', dR), dR);
    info.depth = place(el('span', 'dp-val', dp), rect(P + '/Container/Contents/GameObject/Depth/DepthText', dR), dR);
    info.qic = place(el('i', 'dp-ic', qp), rect(P + '/Container/Contents/GameObject/Quality/QualityIcon', qR), qR);
    info.qual = place(el('span', 'dp-val', qp), rect(P + '/Container/Contents/GameObject/Quality/QualityValueText', qR), qR);
    // ActiveTrawlTab (neo trái giữa Container, x 40, y 240)
    const TT = 'ActiveAbility/Container/ActiveTrawlTab', ttR = rect(TT, C), tcR = rect(TT + '/Container', ttR);
    const tab = info.tab = place(el('div', 'dp-tab', bar), tcR, frame);
    place(el('i', 'dp-tabbg', tab), rect(TT + '/Container/Backplate', tcR), tcR);
    place(el('i', 'dp-ic dp-trawl', tab), rect(TT + '/Container/Icon', tcR), tcR);
    const icR = rect(TT + '/Container/ItemCounter', tcR);
    const ic = place(el('div', 'dp-count', tab), icR, tcR);
    info.count = el('span', '', ic);
    tab.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); openNet(); });   // [ĐỀ XUẤT] chạm/bấm thẻ = mở lưới
    tab.style.pointerEvents = 'auto';
    // nhắc tương tác với phao (prompt.pot "Check Pot")
    info.prompt = el('div', 'hud-prompt dp-prompt', box);
    el('b', '', info.prompt, 'Kiểm tra bẫy — Space');
    info.prompt.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); const np = S() && D.mode === 'sail' && !openPot ? nearPot() : null; if (np) showPot(np); });
    info.promptSub = el('span', '', info.prompt);
    resize();
    addEventListener('resize', resize);
  }
  function resize() { if (info.bar) info.bar.style.transform = 'scale(' + (innerHeight / 1080) + ')'; }
  const SPR = n => 'url("' + URLB('art/ui/sprites/' + n + '.webp') + '")';
  function abilityBase() {
    if (!S() || D.mode !== 'sail') return false;
    const p = document.getElementById('dr-pause');
    if (p && !p.hidden) return false;
    if (root.DRDialogue && DRDialogue.isOpen && DRDialogue.isOpen()) return false;
    if (root.DRIntro && DRIntro.playing) return false;
    if (root.DRCargo && DRCargo.isOpen && DRCargo.isOpen()) return false;
    return true;
  }
  function catchable(kind, x, z, itemId) {
    const depth = depthAt(x, z);
    if (kind === 'pot') {
      if (!itemId) return [];
      if (itemId === DEP.materialPotItem) return null;               // POT_MATERIAL: luôn "Nhiều" (num = 2)
      const ms = G().mask(root.DR_GRIDS[ITEMS[itemId].gridConfig].mainItemSubtype, G().SUB);
      return zoneItems(x, z, it => !!it.canBeCaughtByPot && (ms & G().subOf(it)) === G().subOf(it), depth, true);   // isDay: true như bản gốc
    }
    if (kind === 'trawl') {
      if (!itemId) return [];
      if (netMode({ id: itemId }) === 'TRAWL_MATERIAL') return null;
      if (netMode({ id: itemId }) === 'TRAWL_OOZE') return [];
      return zoneItems(x, z, netFilter(itemId), depth, isDay());
    }
    if (kind === 'bait') return fishForBait(itemId || 'bait');
    return [];
  }
  function refreshInfo(dt) {
    const sel = AB.selected(), on = abilityBase() && (sel === 'pot' || sel === 'bait' || sel === 'trawl');
    const want = on ? 1 : 0;
    info.a += (want - info.a) * Math.min(1, dt / 0.35 * 3);         // [ĐỀ XUẤT] OutExpo 0,35 s xấp xỉ bằng lọc mũ
    info.panel.style.opacity = info.a.toFixed(3);
    info.panel.style.transform = 'translateX(' + (-75 * (1 - info.a)).toFixed(1) + 'px)';   // animateXAmount 75
    info.panel.style.display = info.a > 0.01 ? 'block' : 'none';
    // thẻ lưới kéo: đang thả lưới và đang ở lớp lái thuyền
    const tr = ABS.trawl && ABS.trawl.isActive && abilityBase();
    info.tab.style.display = tr ? 'block' : 'none';
    if (tr) info.count.textContent = S().grids.TRAWL_NET ? D.grid('TRAWL_NET').items.length : 0;
    info.t -= dt;
    if (on && (info.t <= 0 || info.dirty)) {
      info.t = 0.5; info.dirty = false;
      const item = selectedItem(sel), n = uniqueItems(sel).length;
      info.name.textContent = item ? ITEMS[item].name : 'Không có món';                         // noItemStringKey
      info.name.style.color = item ? '#fff' : '#dc2c38';
      info.prev.style.visibility = info.next.style.visibility = n > 1 ? 'visible' : 'hidden';
      const b = S().boat;
      info.depth.textContent = depthStr(depthAt(b.x, b.z));
      const list = catchable(sel, b.x, b.z, item);
      const q = list === null ? 2 : Math.min(2, list.length);
      info.qual.textContent = QUAL[q]; info.qual.style.color = QCOL[q];
      // [ĐỀ XUẤT] sprite chất lượng: trường potQualityIcon… bị AssetRipper bỏ; chọn sprite cùng tên trong art/ui/sprites
      const ic = sel === 'pot' ? (item === DEP.materialPotItem ? 'MaterialsIcon' : 'CrabIcon')
        : sel === 'trawl' ? (netMode({ id: item }) === 'TRAWL_MATERIAL' ? 'MaterialsIcon' : 'FishIcon')
          : ({ 'bait-crab': 'BaitCrabIcon', 'bait-exotic': 'BaitExoticIcon', 'bait-ab': 'BaitAberratedIcon' }[item] || 'BaitRegularIcon');
      info.qic.style.backgroundImage = SPR(ic);
      info.sel = { ability: sel, item, n, quality: q, species: list };
    }
    // nhắc phao
    const np = D.mode === 'sail' && S() && !(D.view && D.view.nearSpot) && !(root.DRDocks && DRDocks.near) ? nearPot() : null;
    info.prompt.classList.toggle('on', !!np);
    if (np) info.promptSub.textContent = ITEMS[np.deployableItemId].name + ' · ' + D.grid(np.grid).items.length + ' món';
  }
  // mở lưới kéo: bảng khoang với tab lưới đứng trước — [ĐỀ XUẤT] chạm thẻ ActiveTrawlTab mở thẳng tab lưới
  function openNet() {
    if (!S() || !S().grids.TRAWL_NET || !root.DRCargo) return;
    const net = NET.inst && ITEMS[NET.inst.id];
    DRCargo.open({ right: { tabs: ['TRAWL_NET', 'INVENTORY'] }, title: net ? net.name : 'Lưới kéo' });
  }

  // ================================================================================================ đăng ký + vòng lặp
  const ABS = {};
  ABS.trawl = AB.register('trawl', Trawl);
  ABS.pot = AB.register('pot', Pot);
  ABS.bait = AB.register('bait', Bait);

  function fromSave() {
    // Ability.Init: persistAbilityToggle ⇒ abilityToggleStates.trawl = true thì Activate() lại khi nạp (không phát tiếng)
    for (const v of [...POT_VIS.keys()]) removeBuoy(v);
    for (const b of BAITS.slice()) removeBait(b);
    NET.key = null; NET.lastT = null; NET.catches = 0;
    const s = S();
    if (!s) return;
    fillDurability();
    syncNet();
    potSeq = 0;
    for (const k of Object.keys(s.grids)) { const m = /^POT_(\d+)$/.exec(k); if (m) potSeq = Math.max(potSeq, +m[1]); }
    for (const p of pots()) initPot(p, false);
    if (s.abilityToggles && s.abilityToggles.trawl && NET.inst && NET.inst.dur > 0) ABS.trawl.activate(true);
    info.dirty = true;
  }

  let last = 0, potT = 0, syncT = 0, built = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min(0.1, last ? (now - last) / 1000 : 0.016); last = now;
    if (!S() || D.mode === 'title') return;
    if (!built && root.DRBoat && DRBoat.root && DRBoat.root.parent) { built = true; for (const p of pots()) if (!POT_VIS.has(p)) initPot(p, false); }
    const p = document.getElementById('dr-pause'), paused = !!(p && !p.hidden);
    const dt = paused ? 0 : rdt * (D.timeScale == null ? 1 : D.timeScale);
    syncT -= rdt;
    if (syncT <= 0) { syncT = 0.5; fillDurability(); syncNet(); sweepBaits(); }
    tickTrawl();
    // HarvestPOI.Update: realTimeBetweenStockChecksSec = 1 giây thật
    potT -= rdt;
    if (potT <= 0) { potT = 1; tickPots(); }
    updateBuoys(dt);
    if (NET.anim) NET.anim.update(dt);
    if (info.el) refreshInfo(rdt);
  }

  function init() {
    buildInfo();
    D.on('newgame', fromSave); D.on('load', fromSave);
    D.on('cargo', key => { if (!key || key === 'INVENTORY' || key === 'STORAGE') { fillDurability(); syncNet(); } info.dirty = true; });
    D.on('catch', onCatch);
    D.on('abilitySelected', () => { info.dirty = true; });
    D.on('harvestEnd', () => sweepBaits());
    // Space cạnh phao: chỉ khi không có điểm câu hợp lệ hay bến trong tầm (main.js ưu tiên hai thứ ấy)
    if (root.DRInput) DRInput.on('interact', () => {
      if (!S() || D.mode !== 'sail' || openPot) return;
      if ((D.view && D.view.nearSpot) || (root.DRDocks && DRDocks.near)) return;
      const np = nearPot();
      if (np) showPot(np);
    });
    // Z / X: CycleAbilityPrev / Next khi năng lực có allowItemCycling đang chọn (lớp BASE: đang lái, không mở cửa sổ)
    addEventListener('keydown', e => {
      if (e.repeat || !abilityBase() || AB.radialOpen) return;
      if (e.code === 'KeyZ' || e.code === 'KeyX') { if (cycle(e.code === 'KeyZ' ? -1 : 1)) e.preventDefault(); }
    });
    requestAnimationFrame(frame);
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);

  root.DRDeploy = {
    pots: () => pots().map(p => ({ x: p.x, z: p.z, id: p.deployableItemId, durability: p.durability, roll: p.timeUntilNextCatchRoll, grid: p.grid,
      items: S().grids[p.grid] ? D.grid(p.grid).items.map(i => i.id) : [], depth: p.depth, catchable: p.items, state: (POT_VIS.get(p) || {}).state })),
    // MapWindow: CrabPotMapMarker / MaterialPotMapMarker ở toạ độ mỗi bẫy (web chưa có cửa sổ bản đồ; chủ bản đồ đọc ở đây)
    mapMarkers: () => pots().map(p => ({ x: p.x, z: p.z, prefab: p.deployableItemId === DEP.materialPotItem ? 'MaterialPotMapMarker' : 'CrabPotMapMarker' })),
    catchable, selectedItem, cycle, openNet, showPot: i => { const p = pots()[i]; return p ? showPot(p) : false; },
    debug() {
      const t = NET.inst;
      return {
        trawl: { active: !!(ABS.trawl && ABS.trawl.isActive), net: t ? t.id : null, dur: t ? t.dur : null, roll: NET.roll, mode: NET.mode, fill: NET.fill,
          count: S() && S().grids.TRAWL_NET ? D.grid('TRAWL_NET').items.length : 0, catches: NET.catches, broke: NET.broke,
          netFishCaught: S() ? S().vars['net-fish-caught'] || 0 : 0, anim: NET.anim ? NET.anim.state(0).name : null, netAnimMissing: NET.anim ? NET.anim.missing.slice(0, 8) : null },
        pots: pots().length, baits: BAITS.map(b => ({ id: b.id, stack: b.stack.slice(), x: b.handle.sp.x, z: b.handle.sp.z, item: b.item })),
        info: info.sel || null, prompt: info.prompt ? info.prompt.classList.contains('on') : false, openPot: !!openPot
      };
    }
  };
})(window);
