/*
 * Bến (Dock trong markers.json): gợi ý cập bến khi thuyền ở gần và chậm, Space → tự lái vào DockSlot gần nhất
 * như DockPOIHandler (MoveTowards 1 m/s, quay về hướng slot hoặc ngược lại, cái nào gần hơn), rồi DR.setMode('dock').
 * Rời bến (dock → sail): đẩy thuyền ra vài mét.
 * Bến DLC (TPR ×4, Pontoon TPR, Expedition Site, The Iron Rig) bị bỏ qua trừ khi URL có ?dlc=1 (W0); DRDocks.isDlc(marker).
 *   DRDocks.init(world)  DRDocks.update(dt, x, z)  DRDocks.interact()  DRDocks.dockAt(id, slot)  DRDocks.nearestDist(x, z)
 * Tiếng bến (DockAudio.RefreshDockAudio, đọc DockData trong data/world_data.js):
 *   dock.music            getter: khoá nhạc bến hiện hành (MusicAssetOverrides thắng nhạc gốc), tra theo trường orig của DR_AUDIO
 *   DRDocks.ambience(dock) { day, night } TÊN clip gốc tiếng nền ngày/đêm của bến (đã áp AmbienceDay|NightAssetOverrides);
 *                          DRSfx.dockEnter (js/sfx.js) đổi tên thành khoá và bật hai vòng lặp, docks.js không phát gì
 *   Rời bến gọi DRSfx.dockLeave() (js/sfx.js) nếu có, không thì tắt nhạc.
 */
(function (root) {
  'use strict';
  const STR = root.DR_STR || {};
  const DOCK_R = 8;          // [ĐỀ XUẤT] DockPOI không có collider trong markers.json
  const DOCK_MAX_SPEED = 2.5; // [ĐỀ XUẤT] m/s, "đủ chậm" để hiện gợi ý cập bến
  const REACH = 0.3, ANGLE = 0.14; // [ĐỀ XUẤT] dockProximityThreshold / dockRotationThreshold nằm ở prefab
  const PUSH = 4;            // [ĐỀ XUẤT] m đẩy ra khi rời bến
  const Dk = root.DRDocks = { list: [], byId: {}, docking: null };

  // DockAudio.RefreshDockAudio: MusicAssetOverrides / AmbienceDay|NightAssetOverrides, cái đầu danh sách thoả đủ ba điều kiện thì thắng:
  // đã qua hết nodesVisited, mọi boolValues bật, TIRWorldPhase >= tirWorldPhase (DLC2: bản web luôn 0).
  function overrideOf(list) {
    const D = root.DR;
    for (const o of list || []) {
      if ((o.nodesVisited || []).every(n => root.DRYarn && DRYarn.visited(n)) && (o.boolValues || []).every(b => D.s && D.s.vars && D.s.vars[b])
        && ((D.s && D.s.vars && D.s.vars['tir-world-phase']) | 0) >= (o.tirWorldPhase || 0)) return o;
    }
    return null;
  }
  const dockData = id => root.DR_WORLD && root.DR_WORLD.DockData && root.DR_WORLD.DockData[id];
  function pickName(dd, base, overrides) {
    const o = overrideOf(dd[overrides]);
    return o ? o.assetReference : dd[base];
  }
  // tên clip gốc -> khoá phát: khớp đúng tên tệp (DRAudio.resolve), nên "Old Mayor's Dock Empty Theme" khác "Old Mayor's Theme"
  function clipKey(name) {
    if (!name || !root.DR_AUDIO) return null;
    const k = root.DRAudio && DRAudio.resolve(name);
    if (k) return k;
    for (const [kk, v] of Object.entries(root.DR_AUDIO)) if (/^music\./.test(kk) && v.orig && v.orig.indexOf(name) >= 0) return kk;
    return null;
  }
  function musicKey(id) {
    const dd = dockData(id);
    return dd ? clipKey(pickName(dd, 'musicAssetReference', 'musicAssetOverrides')) : null;
  }

  // W0: bến DLC (EntitlementDependantObject: không có DLC thì tắt GameObject) chỉ mở với ?dlc=1.
  // markers.json: path "DLC1/Docks/..." (4 bến TPR + Pontoon TPR), "DLC2/The Iron Rig Dock"; Expedition Site nằm ở "Docks/"
  // nhưng điểm đến duy nhất là destination.expedition-site-photographer (DLC1 Photographer).
  const DLC_PATH = /^DLC\d\//, DLC_IDS = ['dock.photographer-camp'];
  const dlcOn = () => { try { return new URLSearchParams(root.location.search).get('dlc') === '1'; } catch (e) { return false; } };
  Dk.isDlc = d => DLC_PATH.test(d.path || '') || DLC_IDS.includes(d.dockData && d.dockData.id);

  function init(world) {
    const dlc = dlcOn();
    for (const d of world.data.markers.docks) {
      if (!d.dockData) continue;
      if (!dlc && Dk.isDlc(d)) continue;   // W0: bến DLC ẩn khi không có ?dlc=1
      const id = d.dockData.id, poi = (d.pois || []).find(p => p.class === 'DockPOI');
      const dock = {
        id, name: STR[id] || (root.DR_WORLD.DockData[id] || {}).dockNameKey || d.name, pos: d.pos,
        poi: poi ? { x: poi.pos[0], z: poi.pos[2] } : { x: d.pos[0], z: d.pos[2] },
        slots: (d.slots || []).map(s => ({ x: s.pos[0], z: s.pos[2], yaw: s.rotY })),
        lookAt: d.lookAtTarget ? d.lookAtTarget.pos : d.pos,
        destinations: (d.destinations || []).map(x => ({ id: x.id, cls: x.class, titleKey: x.id, title: STR[x.id] || x.id, speaker: null, pos: x.pos }))
          // DockData.speakers là nhân vật đứng ở bến (Mayor, Lighthouse Keeper...); ngủ nằm trong BoatActionsDestination của mọi bến.
          .concat(((root.DR_WORLD.DockData[id] || {}).speakers || []).map(sp => ({ id: 'speaker.' + sp, cls: 'CharacterDestination', speaker: sp })))
          .concat(d.boatActionsDestination ? [{ id: 'destination.rest', cls: 'RestDestination' }] : []),
        music: null
      };
      // nhạc bến tính lại mỗi lần đọc: ghi đè theo cốt truyện (Old Mayor, Iron Rig...) có hiệu lực ngay (yarn.js RestartWorldMusic dùng cái này)
      Object.defineProperty(dock, 'music', { get: () => musicKey(id), enumerable: true });
      if (!dock.slots.length) dock.slots.push({ x: dock.poi.x, z: dock.poi.z, yaw: d.rotY });
      Dk.list.push(dock); Dk.byId[id] = dock;
    }
  }

  function nearestDist(x, z) {
    let best = 1e9;
    for (const d of Dk.list) best = Math.min(best, Math.hypot(d.poi.x - x, d.poi.z - z));
    return best;
  }

  let near = null;
  function update(dt, x, z) {
    const D = root.DR;
    near = null;
    if (D.mode === 'sail' && !Dk.docking && root.DRBoat.speed() < DOCK_MAX_SPEED) {
      let bd = DOCK_R;
      for (const d of Dk.list) { const dd = Math.hypot(d.poi.x - x, d.poi.z - z); if (dd < bd) { bd = dd; near = d; } }
    }
    D.view.nearDock = near ? { id: near.id, name: near.name } : null;
  }

  function slotYaw(slot, yaw) {
    // DockPOIHandler.OnPressBegin: hướng slot hoặc ngược lại, cái nào gần hướng hiện tại hơn
    const diff = a => Math.abs(Math.atan2(Math.sin(a - yaw), Math.cos(a - yaw)));
    return diff(slot.yaw) <= diff(slot.yaw + Math.PI) ? slot.yaw : slot.yaw + Math.PI;
  }

  function interact() {
    const D = root.DR, b = D.s.boat;
    if (!near || Dk.docking) return false;
    const dock = near;
    let idx = 0, bd = 1e9;
    dock.slots.forEach((s, i) => { const d = Math.hypot(s.x - b.x, s.z - b.z); if (d < bd) { bd = d; idx = i; } });
    const slot = dock.slots[idx];
    Dk.docking = { dock, idx };
    if (root.DRAudio) DRAudio.loop('boat.dock.progress', 0.7);
    root.DRBoat.autoMove({ x: slot.x, z: slot.z, yaw: slotYaw(slot, b.yaw), reach: REACH, angle: ANGLE }, () => arrive(dock, idx));
    return true;
  }
  function cancel() {
    if (!Dk.docking) return;
    Dk.docking = null; root.DRBoat.auto = null;
    if (root.DRAudio) DRAudio.loop('boat.dock.progress', 0);
  }
  function arrive(dock, idx) {
    Dk.docking = null;
    if (root.DRAudio) { DRAudio.loop('boat.dock.progress', 0); DRAudio.play('boat.dock.docked'); }
    dockAt(dock.id, idx, true, true);
  }

  // Player.Dock: lưu dockId + dockSlotIndex, cờ "has-visited-dock-{id}", lưu sổ.
  // keepYaw: vừa tự lái vào (giữ hướng đã quay); không thì đặt đúng hướng slot như GameSceneInitializer
  function dockAt(id, idx, save, keepYaw) {
    const D = root.DR, dock = Dk.byId[id];
    if (!dock) return false;
    idx = Math.min(idx || 0, dock.slots.length - 1);
    const slot = dock.slots[idx], b = D.s.boat;
    root.DRBoat.place(slot.x, slot.z, keepYaw ? slotYaw(slot, b.yaw) : slot.yaw);
    D.s.dock = id; D.s.dockSlot = idx;
    D.s.vars['has-visited-dock-' + id] = true;
    if (root.DRCamera) DRCamera.dock({ slot, lookAt: dock.lookAt, pos: dock.pos });
    const ok = D.setMode('dock', { dockId: id, name: dock.name, destinations: dock.destinations });
    if (save) D.save();
    // js/sfx.js lo nhạc (có ghi đè), tiếng nền ngày/đêm và dừng nhạc chớp; không có thì giữ cách cũ
    if (root.DRSfx) DRSfx.dockEnter(dock);
    else if (!root.DRDock && root.DRAudio && dock.music) DRAudio.music(dock.music);
    return ok;
  }

  // Rời bến: tìm hướng ra nước sâu từ tâm bến qua slot, tự lái ra PUSH m.
  function undock() {
    const D = root.DR, dock = Dk.byId[D.s.dock], b = D.s.boat;
    D.s.dock = null;
    if (root.DRCamera) { DRCamera.dock(null); DRCamera.snap(); }
    if (root.DRAudio) DRAudio.play('boat.dock.undocked');
    // DockAudio.OnPlayerDockedToggled(null): RequestMusicStop + tắt tiếng nền bến (trước đây có js/dock.js thì nhạc bến vẫn phát ngoài khơi)
    if (root.DRSfx) DRSfx.dockLeave(); else if (root.DRAudio) DRAudio.music(null);
    if (!dock) return;
    let dx = b.x - dock.pos[0], dz = b.z - dock.pos[2];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let best = null;
    for (const a of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
      const cx = dx * Math.cos(a) - dz * Math.sin(a), cz = dx * Math.sin(a) + dz * Math.cos(a);
      const tx = b.x + cx * PUSH, tz = b.z + cz * PUSH;
      if (root.DRWorld.sdf(tx, tz) > 1.6) { best = { x: tx, z: tz }; break; }
    }
    if (best) root.DRBoat.autoMove(best, null, 1.5);
  }

  // tên clip tiếng nền ngày / đêm của bến sau khi xét ghi đè (DRSfx.dockEnter đổi tên thành khoá phát)
  function ambience(dock) {
    const dd = dock && dockData(dock.id);
    if (!dd) return null;
    const day = pickName(dd, 'ambienceDayAssetReference', 'ambienceDayAssetOverrides');
    const night = pickName(dd, 'ambienceNightAssetReference', 'ambienceNightAssetOverrides');
    return day || night ? { day: day || null, night: night || null } : null;
  }

  Object.assign(Dk, { init, update, interact, cancel, dockAt, undock, nearestDist, ambience });
  Object.defineProperty(Dk, 'near', { get: () => near });
})(window);
