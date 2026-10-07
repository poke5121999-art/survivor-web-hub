/*
 * Bến (Dock trong markers.json): gợi ý cập bến khi thuyền ở gần và chậm, Space → tự lái vào DockSlot gần nhất
 * như DockPOIHandler (MoveTowards 1 m/s, quay về hướng slot hoặc ngược lại, cái nào gần hơn), rồi DR.setMode('dock').
 * Rời bến (dock → sail): đẩy thuyền ra vài mét.
 *   DRDocks.init(world)  DRDocks.update(dt, x, z)  DRDocks.interact()  DRDocks.dockAt(id, slot)  DRDocks.nearestDist(x, z)
 */
(function (root) {
  'use strict';
  const STR = root.DR_STR || {};
  const DOCK_R = 8;          // [ĐỀ XUẤT] DockPOI không có collider trong markers.json
  const DOCK_MAX_SPEED = 2.5; // [ĐỀ XUẤT] m/s, "đủ chậm" để hiện gợi ý cập bến
  const REACH = 0.3, ANGLE = 0.14; // [ĐỀ XUẤT] dockProximityThreshold / dockRotationThreshold nằm ở prefab
  const PUSH = 4;            // [ĐỀ XUẤT] m đẩy ra khi rời bến
  const Dk = root.DRDocks = { list: [], byId: {}, docking: null };

  function musicKey(id) {
    const dd = root.DR_WORLD && root.DR_WORLD.DockData && root.DR_WORLD.DockData[id];
    const name = dd && dd.musicAssetReference;
    if (!name || !root.DR_AUDIO) return null;
    for (const [k, v] of Object.entries(root.DR_AUDIO)) if (/^music\./.test(k) && v.orig && v.orig.indexOf(name) >= 0) return k;
    return null;
  }

  function init(world) {
    for (const d of world.data.markers.docks) {
      if (!d.dockData) continue;
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
        music: musicKey(id)
      };
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
    if (!root.DRDock && root.DRAudio && dock.music) DRAudio.music(dock.music);
    return ok;
  }

  // Rời bến: tìm hướng ra nước sâu từ tâm bến qua slot, tự lái ra PUSH m.
  function undock() {
    const D = root.DR, dock = Dk.byId[D.s.dock], b = D.s.boat;
    D.s.dock = null;
    if (root.DRCamera) { DRCamera.dock(null); DRCamera.snap(); }
    if (root.DRAudio) { DRAudio.play('boat.dock.undocked'); if (!root.DRDock) DRAudio.music(null); }
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

  Object.assign(Dk, { init, update, interact, cancel, dockAt, undock, nearestDist });
  Object.defineProperty(Dk, 'near', { get: () => near });
})(window);
