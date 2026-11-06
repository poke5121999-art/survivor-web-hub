/*
 * WorldStateChanger (paudit): cấu hình đổi trạng thái thế giới theo cốt truyện, xét lại mỗi lần cập / rời bến.
 * Dữ liệu: data/worldstate.js (tools/worldstate.py bóc 9 WorldStateChangerConfig của Game.unity).
 *
 * Gốc:
 *   - WorldStateChanger.cs: OnEnable → CheckPersistence của mọi cấu hình; GameEvents.OnPlayerDockedToggled → dueForRefresh; Update: mọi cấu hình
 *     chưa Done mà EvaluateCondition() đúng thì Do().
 *   - WorldStateChangerConfig.cs:73-125 EvaluateCondition: triggerOnDock / triggerOnUndock; node đã thăm (ALL / ANY), node chưa thăm (ALL: không node
 *     nào đã thăm / ANY: không phải mọi node... đúng như mã: ALL → mọi node chưa thăm, ANY → !Any(đã thăm)); vùng WHITELIST / BLACKLIST
 *     (ZoneEnum cờ); bến hiện tại hoặc bến trước WHITELIST / BLACKLIST. Do(): chạy hành động, done = true; persists thì ghi persistenceBoolKey.
 *   - BooleanSetWorldStateAction.cs:7-10: SaveData.SetBoolVariable(boolName, enabledIfMet).
 * Chặn tiến trình nếu thiếu: OldMayorDockEnabler (sau Collector_Award4Atrophy) đặt "old-mayor-available" = true → bốn bến Old Mayor chạy
 *   OldMayor_Intro (OldMayorDock_N_Root) → Lighthouse Keeper hỏi sách → kết tốt. OldMayorDockDisabler tắt lại sau OldMayor_Intro.
 * [ĐỀ XUẤT] GameObjectToggleWorldStateAction (lửa trại, nhà của Builder, ...) chưa dựng: data chỉ đếm `toggles`.
 *
 *   DRWorldState.refresh()   xét lại ngay (test)      DRWorldState.list()   [{ name, done }]
 */
(function (root) {
  'use strict';
  const D = root.DR, C = root.DR_WORLDSTATE;
  if (!D || !Array.isArray(C)) { root.DRWorldState = null; return; }
  const ZONE = { THE_MARROWS: 1, GALE_CLIFFS: 2, STELLAR_BASIN: 4, TWISTED_STRAND: 8, DEVILS_SPINE: 0x10, OPEN_OCEAN: 0x20, PALE_REACH: 0x40 };
  const visited = n => !!(root.DRYarn && DRYarn.visited(n));
  let done = new Set(), prevDock = null, due = false;

  function check(c) {
    const docked = !!D.s.dock;
    if (docked && !c.onDock) return false;
    if (!docked && !c.onUndock) return false;
    let ok = true;
    if (c.vMode === 3) ok = c.visited.every(visited);
    else if (c.vMode === 4) ok = c.visited.some(visited);
    if (c.uMode === 3) ok = ok && c.unvisited.every(n => !visited(n));
    else if (c.uMode === 4) ok = ok && !c.unvisited.some(visited);
    const zf = ZONE[(D.view && D.view.zoneId) || 'THE_MARROWS'] || 0;
    if (c.zMode === 1) ok = ok && !!(c.zones & zf);
    else if (c.zMode === 2) ok = ok && !(c.zones & zf);
    const dk = D.s.dock || prevDock;
    if (dk) {
      if (c.dMode === 1) ok = ok && c.docks.includes(dk);
      else if (c.dMode === 2) ok = ok && !c.docks.includes(dk);
    }
    return ok;
  }
  function act(c) {
    for (const [k, v] of c.bools) D.s.vars[k] = v;                        // BooleanSetWorldStateAction
    done.add(c.name);
    if (c.persists && c.key) D.s.vars[c.key] = true;
    D.emit('worldState', c.name);
  }
  function refresh() {
    if (!D.s || !D.s.vars) return;
    for (const c of C) if (!done.has(c.name) && check(c)) act(c);
  }
  function start() {                                                       // OnEnable: CheckPersistence
    done = new Set(); prevDock = D.s && D.s.dock || null;
    if (D.s && D.s.vars) for (const c of C) if (c.persists && c.key && D.s.vars[c.key]) act(c);
    due = true;
  }
  D.on('newgame', start);
  D.on('load', start);
  D.on('mode', (m, info) => {                                              // OnPlayerDockedToggled
    if (m === 'dock' || (info && info.prev === 'dock')) { due = true; if (D.s && D.s.dock) prevDock = D.s.dock; }
  });
  (function tick() {                                                       // Update: dueForRefresh
    if (due && D.s) { due = false; try { refresh(); } catch (e) { console.error('[worldstate] refresh failed:', e); } }
    if (D.s && D.s.dock) prevDock = D.s.dock;
    root.requestAnimationFrame ? root.requestAnimationFrame(tick) : root.setTimeout(tick, 100);
  })();

  root.DRWorldState = { refresh, list: () => C.map(c => ({ name: c.name, done: done.has(c.name) })) };
})(window);
