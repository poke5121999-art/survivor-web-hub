/*
 * w2overflow (WORLD-GAPS.md §6 W2): kho tràn. Cổng gốc: OverflowStorageDestination.cs (AlwaysShow chỉ khi lưới còn món),
 * OverflowStorageDestinationUI.cs (bảng kho tràn + khoang cùng trượt vào; không có nút mua bán), GridKey.OVERFLOW_STORAGE = 2000,
 * GridConfigurationData/OverflowStorage.asset (9 cột × 11 hàng, nhận mọi loại, đồ thuộc về người chơi).
 *   - DR.s.grids.OVERFLOW_STORAGE luôn có (ván mới và ván nạp), cấu hình "OverflowStorage"; js/upgrade.js dồn đồ thừa vào đây.
 *   - Điểm đến chỉ hiện ở bến khi còn món (DROverflow.alwaysShow → js/dock.js visibleDests).
 *   - Chỉ lấy ra, không cất vào: canPlace chặn mọi nơi đặt ở lưới này [ĐỀ XUẤT theo WORLD-GAPS "take only"]; Esc trả món về chỗ cũ.
 *   - Chuột giữa trên món trong kho tràn = "Về khoang" (cùng nhãn với QuickMove của kho thường).
 *   DROverflow.ensure()  DROverflow.grid()  DROverflow.count()  DROverflow.alwaysShow()
 */
(function (root) {
  'use strict';
  const KEY = 'OVERFLOW_STORAGE', CFG = 'OverflowStorage';
  const G = root.DRGrid;

  function ensure() {
    if (!root.DR || !DR.s) return null;
    if (!DR.s.grids[KEY]) DR.s.grids[KEY] = { cfg: CFG, items: [], damage: [], extra: [] };
    return DR.grid(KEY);
  }
  const count = () => { const r = root.DR && DR.s && DR.s.grids[KEY]; return r ? r.items.length : 0; };
  const alwaysShow = () => count() > 0;           // OverflowStorageDestination.AlwaysShow

  // Chuyển món sang khoang (như QuickMove): bỏ khỏi kho tràn, đặt vào chỗ trống đầu tiên của INVENTORY
  function toCargo(inst, handle) {
    const og = ensure(), inv = DR.grid('INVENTORY'), def = DR.item(inst.id);
    const spot = G.findSpot(inv, def, 0, false);
    if (!spot) { if (root.DRHud && DRHud.toast) DRHud.toast('Không tìm được chỗ cho món này'); return false; }   // notification.quick-move-failed
    G.remove(og, inst);
    inst.uid = inv.seq++; inst.x = spot.x; inst.y = spot.y; inst.rot = spot.rot; inst.cells = G.footprint(def, spot.x, spot.y, spot.rot);
    inv.items.push(inst);
    DR.emit('cargo', 'INVENTORY', inst);
    DR.emit('cargo', KEY, null);
    if (handle && handle.refresh) handle.refresh();
    return true;
  }

  function handler(ref) {
    return {
      name: 'overflow',
      canPlace: (def, key) => key === KEY ? false : true,
      prompts(c) {
        const hv = c && c.hovered;
        if (c && c.held || !hv || !hv.inst || !hv.gr || hv.gr.key !== KEY || hv.def.moveMode === 'INSTALL') return [];
        return [{ id: 'to-cargo', label: 'Về khoang', bind: 'mmb', hold: 0, enabled: true, run: () => toCargo(hv.inst, ref.h) }];
      }
    };
  }

  // OverflowStorageDestinationUI.ShowMainUI: bảng kho tràn bên trái + khoang bên phải, cho dời đồ (CanMoveInstalledItems)
  function open(d, ctx) {
    if (!root.DRCargo) return false;
    ensure();
    ctx.close();
    const ref = { h: null };
    ref.h = DRCargo.open({
      right: { tabs: ['INVENTORY'], cur: 'INVENTORY' },
      left: { kind: 'storage', key: KEY, title: (root.DR_STR && DR_STR['title.overflow-storage'] && 'Kho tràn') || 'Kho tràn', handler: handler(ref) },
      mode: 'equip',
      onClose: () => { if (ctx.isCurrent()) ctx.leave(); }
    });
    return true;
  }

  if (root.DR && DR.on) { DR.on('newgame', ensure); DR.on('load', ensure); }
  if (root.DRDock && DRDock.registerDest) DRDock.registerDest('OverflowStorageDestination', open);
  else console.warn('[overflow] DRDock.registerDest missing: load js/dock.js before js/overflow.js');

  root.DROverflow = { ensure, grid: ensure, count, alwaysShow, toCargo, KEY };
})(window);
