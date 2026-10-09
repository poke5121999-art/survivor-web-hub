/*
 * Chợ và xưởng tàu dựng lại theo bản gốc trên mối nối DRCargo: bảng hàng là LƯỚI bên trái, khoang người chơi bên phải.
 * Mã gốc: MarketDestinationUI, BuyModeActionHandler, SellModeActionHandler (+ TypeSell / SpecificSell), RepairActionHandler, RepairAllButton,
 * ShopRestocker, ShopData, ItemManager.GetItemValue / GetRepairAllCost / RepairHullDamage / RepairAllItemDurability, GridManager.QuickTransferItemToGrid.
 * Số liệu: data/shop_ui.js (tools/shop_ui.py: trường MarketDestination + bố cục ShipyardSlidePanel / MarketSlidePanel),
 * DR_WORLD.ShopData / ShopRestocker, DR_CONFIG (hullRepairCostPerSquare 30, potRepairCostPerDay 5, netRepairCostPerDay 50, gridConfigs, colors).
 *
 *   DRShop.open(dest, { onClose })  mở bảng hàng + khoang cho MarketDestination / ShipyardDestination (dock.js gọi)
 *   DRShop.restock(force)           ShopRestocker.TryRefreshShops: dựng lại mọi lưới hàng (sang ngày mới, xong nghiên cứu)
 *   DRShop.grid(gridKey)            lưới hàng đã lưu: DR.s.grids['Shop_' + GridKey] (tiền tố Shop_ để cargo.js coi là IN_SHOP)
 *   DRShop.buyPrice(def)  DRShop.sellPrice(inst, destId)  DRShop.repairAllCost()  DRShop._debug()
 * Điều khiển PC như DredgeControlBindings: chuột trái = Mua / Sửa; F = Bán (thiết bị giữ 0,75 s), giữ F 0,5 s = Bán hết;
 * giữ R 1 s = Sửa tất cả; T = vào / thoát chế độ sửa (chỉ ở tab Khoang, tay không).
 * Sự kiện phát: 'itemPurchased' (id, giá), 'itemSold' (id, giá), 'itemsRepaired' (), 'cargo' (khoá lưới).
 */
(function (root) {
  'use strict';
  const G = root.DRGrid;
  const SHOP = 'Shop_';
  const ui = () => root.DR_SHOP_UI || { dests: {}, layout: {} };
  const cfg = () => root.DR_CONFIG || {};
  // GameConfigDataProd.colors: [0] NEUTRAL, [2] POSITIVE, [3] NEGATIVE
  const color = i => ((cfg().colors || [])[i]) || ['#ffffff', '', '#74d27a', '#dc2c38'][i];
  const r2 = v => Math.round(v * 100) / 100;
  // decimal.ToString("n2") của bản tiếng Anh: dấu phẩy nghìn
  const money = v => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isFish = def => G.subOf(def) === G.SUB.FISH;
  const isEquip = def => G.typeOf(def) === G.TYPE.EQUIPMENT;
  const hasFlag = (mask, v) => (mask & v) === v;                              // Enum.HasFlag
  const visited = n => !!(root.DRYarn && DRYarn.visited(n));
  const toastRaw = t => { if (root.DRHud && DRHud.toast) DRHud.toast(t); };
  // tên sprite gốc -> tệp đã xuất (data/ui.js: cùng tên có nhiều bản, manifest chỉ bản đúng)
  const SPRITE = n => new URL((root.DR_UI && DR_UI[n]) || 'art/ui/sprites/' + n + '.webp', document.baseURI).href;

  // tiêu đề tab (titleKey gốc) -> tiếng Việt; chưa có thì dùng chữ gốc tiếng Anh
  const KIND_VN = { rods: 'Cần câu', engines: 'Động cơ', nets: 'Lưới kéo', lights: 'Đèn', pots: 'Bẫy cua', materials: 'Đồ lặt vặt' };
  const OWNER_VN = { 'title.shipwright-': 'Thợ đóng tàu', 'title.travelling-merchant-': 'Lái buôn rong', 'title.undermarket-': 'Chợ ngầm' };
  const TITLE_VN = { 'title.fishmonger-store': 'Cửa hàng cá', 'destination.if-whaling-yards': 'Bãi cá voi', 'destination.lm-trader': 'Lái buôn' };
  function tabTitle(t) {
    if (TITLE_VN[t.titleKey]) return TITLE_VN[t.titleKey];
    for (const p in OWNER_VN) if ((t.titleKey || '').startsWith(p) && KIND_VN[t.titleKey.slice(p.length)]) return OWNER_VN[p] + ' - ' + KIND_VN[t.titleKey.slice(p.length)];
    return t.title || t.gridKey;
  }
  // prompt.sell-all-fish / prompt.sell-all-trinkets; notification.sell-fish-bulk / sell-trinkets-bulk
  const SELL_ALL_VN = { 'prompt.sell-all-fish': 'Bán hết cá', 'prompt.sell-all-trinkets': 'Bán hết đồ lặt vặt' };
  const BULK_VN = { 'notification.sell-fish-bulk': n => 'Đã bán ' + n + ' con cá', 'notification.sell-trinkets-bulk': n => 'Đã bán ' + n + ' món lặt vặt' };

  // ---------------------------------------------------------------- giá (ItemManager.GetItemValue, ResearchedBarteringModifier = 1: bản web chưa có nghiên cứu)
  const buyPrice = def => DRRules.buyPrice(def, 1);
  function sellPrice(inst, mod) {
    const def = DR.item(inst.id);
    if (isFish(def)) return DRRules.sellPrice(cfg(), def, inst, mod, 1);         // cá: value x max(1, mod) x cỡ x tươi
    let v = (def.hasSellOverride ? +def.sellOverrideValue : +def.value || 0) * mod;   // còn lại: value x mod (x0,5 ở xưởng tàu)
    if (def.damageMode === 'DURABILITY' && def.maxDurabilityDays) {
      const d = inst.dur == null ? def.maxDurabilityDays : inst.dur;
      v *= Math.min(1, Math.max(0.1, d / def.maxDurabilityDays));
    }
    return r2(Math.max(0, v));
  }

  // ---------------------------------------------------------------- lưới hàng + nhập hàng (ShopRestocker)
  const gridName = key => SHOP + key;
  function grid(key) {
    const name = gridName(key), conf = (cfg().gridConfigs || {})[key];
    if (!DR.s.grids[name]) {
      if (!conf) throw new Error('shop grid config not found: ' + key);
      DR.s.grids[name] = { cfg: conf, items: [], damage: [], extra: [] };
    }
    return DR.grid(name);
  }
  const restocker = () => ((root.DR_WORLD || {}).ShopRestocker || {}).ShopRestocker || { shopDataGridConfigs: {}, itemsToKeepInStock: [] };
  const list = v => Array.isArray(v) ? v : v && Array.isArray(v._items) ? v._items : [];   // data.py có khi ghi ArrayList Odin
  const subName = v => Array.isArray(v) ? v[0] : v;

  // ShopData.GetNewStock: luôn có (tung chance từng chiếc), đồ đã nghiên cứu, theo world phase, theo node hội thoại (ANY = 0, ALL = 1)
  function newStock(sd) {
    const out = [];
    const push = (id, n, chance) => { const def = (root.DR_ITEMS || {})[id]; if (!def) return; for (let i = 0; i < n; i++) if (chance == null || Math.random() < chance) out.push(def); };
    for (const e of list(sd.alwaysInStock)) push(e.itemData, e.count | 0, e.chance == null ? 1 : e.chance);
    const pool = list(sd.itemSubtypesFromResearchPool).map(subName);
    for (const id of DR.s.itemIdsResearched || []) {
      const def = (root.DR_ITEMS || {})[id];
      if (def && pool.includes(def.subtype)) push(id, sd.countOfEachItemFromResearchPool | 0, null);
    }
    for (const p of list(sd.phaseLinkedShopData)) if ((DR.s.worldPhase || 0) >= p.phase) for (const e of list(p.itemData)) push(e.itemData, e.count | 0, null);
    for (const p of list(sd.dialogueLinkedShopData)) {
      const nodes = list(p.dialogueNodes), all = p.requireMode === 1 || p.requireMode === 'ALL';
      if (all ? nodes.every(visited) : nodes.some(visited)) for (const e of list(p.itemData)) push(e.itemData, e.count | 0, null);
    }
    return out;
  }
  const ORDER = def => { const s = G.subOf(def); return s === G.SUB.ROD ? 1 : s === G.SUB.ENGINE ? 2 : s === G.SUB.NET ? 3 : 4; };
  function refreshShop(sdName, key) {
    const sd = ((root.DR_WORLD || {}).ShopData || {})[sdName];
    if (!sd) { console.warn('[shop] ShopData not found:', sdName); return; }
    const g = grid(key), keep = restocker().itemsToKeepInStock || [];
    for (const it of g.items.slice()) if (!keep.includes(it.id)) G.remove(g, it);
    const stock = newStock(sd).map((d, i) => [d, i]).sort((a, b) => ORDER(a[0]) - ORDER(b[0]) || a[1] - b[1]).map(x => x[0]);
    for (const def of stock) {
      const s = G.findSpot(g, def, 0, true);                                    // FindPositionForObject(..., 0, prioritizeRotation: true)
      if (s) G.place(g, def, s.x, s.y, s.rot, def.maxDurabilityDays ? { dur: def.maxDurabilityDays } : null);
    }
    DR.emit('cargo', gridName(key), null);                                     // lưới hàng đổi
  }
  // OnDayChanged / OnResearchCompleted -> dueForRefresh; TryRefreshShops chờ khi cửa sổ chợ đang mở. Bản web xét lúc mở chợ: cùng kết quả
  // vì lưới hàng chỉ nhìn thấy khi mở. Lần đầu (lưới chưa có) cũng nhập hàng như ShopRestocker.OnEnable.
  function restock(force) {
    if (!root.DR || !DR.s) return false;
    const v = DR.s.vars, day = Math.floor(DR.s.time), cfgs = restocker().shopDataGridConfigs || {};
    const fresh = Object.values(cfgs).some(k => !DR.s.grids[gridName(k)]);
    if (!force && !fresh && !v['shop-restock-due'] && v['shop-restock-day'] === day) return false;
    for (const [sdName, key] of Object.entries(cfgs)) refreshShop(sdName, key);
    v['shop-restock-day'] = day; v['shop-restock-due'] = false;
    return true;
  }

  // ---------------------------------------------------------------- quy tắc mua bán của từng điểm đến
  // TypeSellModeActionHandler.DoesStoreAcceptThisItem / SpecificSellModeActionHandler
  function accepts(c, def, bulk) {
    if (c.specificItemsBought && c.specificItemsBought.length) return c.specificItemsBought.includes(def.id);
    if (def.canBeSoldByPlayer === false) return false;
    const t = G.typeOf(def), s = G.subOf(def);
    if (c.itemSubtypesBought === -1) return hasFlag(c.itemTypesBought, t);
    if (bulk) return hasFlag(c.bulkItemTypesBought, t) && hasFlag(c.bulkItemSubtypesBought, s);
    return hasFlag(c.itemTypesBought, t) && hasFlag(c.itemSubtypesBought, s);
  }
  // MarketDestination.GetGridKeyForItemType: tab đầu tiên mà cấu hình lưới nhận loại món; cá luôn NONE (bán là mất)
  function gridKeyFor(c, def) {
    if (G.subOf(def) === G.SUB.FISH) return null;
    const t = G.typeOf(def), s = G.subOf(def);
    for (const tab of c.tabs || []) {
      const gc = (root.DR_GRIDS || {})[(cfg().gridConfigs || {})[tab.gridKey]];
      if (gc && hasFlag(G.mask(gc.mainItemType, G.TYPE), t) && hasFlag(G.mask(gc.mainItemSubtype, G.SUB), s)) return tab.gridKey;
    }
    return null;
  }
  const tabOpen = t => t.gridKey !== 'NONE' && (!t.unlockNodes || t.unlockNodes.every(visited));   // MarketDestinationUI.ShowMainUI

  // ---------------------------------------------------------------- tiền + nợ
  const debtLeft = () => Math.max(0, (DR.s.vars['gm-debt'] != null ? DR.s.vars['gm-debt'] : cfg().greaterMarrowDebt) - (DR.s.vars['gm-repayments'] || 0));
  // SellModeActionHandler.ProcessDebtRepayment: chỉ ở destination.gm-fishmonger, min(nợ còn, thu x greaterMarrowDebtRepaymentProportion)
  function repay(destId, income) {
    if (destId !== 'destination.gm-fishmonger') return 0;
    const left = debtLeft();
    if (!(left > 0)) return 0;
    const r = r2(Math.min(left, income * (cfg().greaterMarrowDebtRepaymentProportion || 0)));
    DR.s.vars['gm-repayments'] = r2((DR.s.vars['gm-repayments'] || 0) + r);
    return r;
  }
  // thông báo có tô màu (<color=POSITIVE>+$X</color>, <color=NEGATIVE>-$Y</color>); DRHud.toast chỉ nhận chữ nên tô lại phần tử vừa thêm
  function notify(parts) {
    const text = parts.map(p => p[0]).join('');
    toastRaw(text);
    const box = document.querySelector('.hud-toasts');
    const t = box && box.lastElementChild;
    if (!t || t.textContent !== text) return;
    t.textContent = '';
    t.style.whiteSpace = 'pre-line';
    for (const [s, c] of parts) { const sp = document.createElement('span'); sp.textContent = s; if (c) sp.style.color = c; t.appendChild(sp); }
    t.dataset.shop = '1';
  }
  const plus = v => ['+' + money(v), color(2)], minus = v => ['-' + money(v), color(3)];

  // ---------------------------------------------------------------- phiên đang mở
  let cur = null;      // { dest, c, handle, onClose }

  // BuyModeActionHandler.BuyFocusedItem: trừ tiền, món lên con trỏ (JUST_PURCHASED), người chơi tự đặt / xoay
  function buy(hv, ctx) {
    const def = hv.def, price = buyPrice(def);
    if (DR.s.funds < price) return;
    DR.addFunds(-price);
    G.remove(hv.gr.g, hv.inst);
    ctx.take(hv.inst, 'buy');
    root.DRYarn.recordShopTransaction(cur.dest.id, price);
    root.DRYarn.recordItemTransaction(def.id, false);
    DR.emit('cargo', hv.key, null);
    DR.emit('itemPurchased', def.id, price);                                  // GameEvents.TriggerItemPurchased
    DR.save();
  }

  // SellModeActionHandler.SellFocusedItem: QuickTransferItemToGrid về tab hàng hợp (cá: huỷ), rồi cộng tiền / hoàn tiền
  function sellOne(t, ctx) {
    const c = cur.c, def = t.def, inst = t.inst;
    if (!accepts(c, def, false)) return;
    const refund = t.st === 'JUST_PURCHASED';
    const key = gridKeyFor(c, def);
    let spot = null, g = null;
    if (key) {
      g = grid(key);
      spot = G.findSpot(g, def, 0, false);
      if (!spot && !c.allowSellIfGridFull) { root.DRAudio && DRAudio.play('ui.grid.error'); return; }
    }
    if (t.held) {
      if (t.src && DR.s.grids[t.src]) G.remove(DR.grid(t.src), inst);
      ctx.drop();
    } else G.remove(t.gr.g, inst);
    if (spot) {
      inst.uid = g.seq++; inst.x = spot.x; inst.y = spot.y; inst.rot = spot.rot; inst.cells = G.footprint(def, spot.x, spot.y, spot.rot);
      g.items.push(inst);
    }
    const num = refund ? buyPrice(def) : sellPrice(inst, c.sellValueModifier);
    if (!refund && isFish(def)) DR.s.vars['fish-sale-total'] = r2((DR.s.vars['fish-sale-total'] || 0) + num);
    else if (!refund && G.subOf(def) === G.SUB.TRINKET) DR.s.vars['trinket-sale-total'] = r2((DR.s.vars['trinket-sale-total'] || 0) + num);
    const debt = repay(cur.dest.id, num), income = r2(num - debt);
    // UIController.PrepareItemNameForSellNotification: sell-fish-debt / refund-item / sell-item
    if (debt > 0) notify([['Đã bán ' + def.name + ': '], plus(income), ['\nTrừ nợ: '], minus(debt)]);
    else notify([[(refund ? 'Đã hoàn tiền ' : 'Đã bán ') + def.name + ': '], plus(income)]);
    DR.addFunds(income);
    root.DRYarn.recordShopTransaction(cur.dest.id, refund ? -num : num);
    root.DRYarn.recordItemTransaction(def.id, true);
    DR.emit('cargo', t.src || (t.gr && t.gr.key) || 'INVENTORY', null);
    if (key) DR.emit('cargo', gridName(key), null);
    DR.emit('itemSold', def.id, num);                                          // GameEvents.TriggerItemSold
    DR.save();
  }

  // GetBulkSellableItemInstances: khoang + lưới kéo, GetAllItemsOfType (itemType.HasFlag(loại sỉ)), canBeSoldInBulkAction
  function bulkList() {
    const c = cur.c, out = [];
    for (const k of ['INVENTORY', 'TRAWL_NET']) {
      if (!DR.s.grids[k]) continue;
      for (const inst of DR.grid(k).items) {
        const def = DR.item(inst.id), t = G.typeOf(def), s = G.subOf(def);
        if (hasFlag(t, c.bulkItemTypesBought) && (!c.bulkItemSubtypesBought || hasFlag(s, c.bulkItemSubtypesBought)) && def.canBeSoldInBulkAction !== false && accepts(c, def, true)) out.push([k, inst]);
      }
    }
    return out;
  }
  // SellModeActionHandler.OnSellAllPressed: cả món đang cầm nếu chợ nhận; một thông báo tổng (có dòng trừ nợ ở người buôn cá)
  function sellAll(ctx) {
    const c = cur.c, items = bulkList(), h = ctx.held;
    if (h && accepts(c, h.def, true)) items.push([h.src, h.inst, true]);
    if (!items.length) return;
    let total = 0;
    for (const [k, inst, held] of items) {
      const def = DR.item(inst.id), v = sellPrice(inst, c.sellValueModifier);
      if (isFish(def)) DR.s.vars['fish-sale-total'] = r2((DR.s.vars['fish-sale-total'] || 0) + v);
      else if (G.subOf(def) === G.SUB.TRINKET) DR.s.vars['trinket-sale-total'] = r2((DR.s.vars['trinket-sale-total'] || 0) + v);
      total += v;
      if (held) { if (k && DR.s.grids[k]) G.remove(DR.grid(k), inst); ctx.drop(); } else G.remove(DR.grid(k), inst);
      root.DRYarn.recordItemTransaction(inst.id, true);
      DR.emit('itemSold', inst.id, v);
    }
    total = r2(total);
    root.DRYarn.recordShopTransaction(cur.dest.id, total);
    const debt = repay(cur.dest.id, total), income = r2(total - debt);
    const head = (BULK_VN[c.bulkSellNotificationString] || (n => 'Đã bán ' + n + ' món'))(items.length) + ': ';
    if (debt > 0) notify([['Đã bán ' + items.length + ' con cá: '], plus(income), ['\nTrừ nợ: '], minus(debt)]);   // notification.sell-fish-bulk-debt
    else notify([[head], plus(income)]);
    DR.addFunds(income);
    DR.emit('cargo', 'INVENTORY', null);
    DR.save();
  }

  // ---------------------------------------------------------------- sửa (RepairActionHandler, ItemManager)
  const missing = (inst, def) => Math.max(0, (def.maxDurabilityDays || 0) - (inst.dur == null ? def.maxDurabilityDays || 0 : inst.dur));
  function itemRepairCost(inst, def) {
    const m = missing(inst, def), s = G.subOf(def);
    if (!(m > 0)) return null;
    if (s === G.SUB.POT) return r2((cfg().potRepairCostPerDay || 0) * m);
    if (s === G.SUB.NET) return r2((cfg().netRepairCostPerDay || 0) * m);
    return null;
  }
  // GetRepairAllCost: ô hỏng x hullRepairCostPerSquare + thiết bị độ bền còn thiếu (bẫy x5/ngày, lưới x50/ngày)
  function repairAllCost() {
    const inv = DR.grid('INVENTORY');
    let cost = inv.damage.length * (cfg().hullRepairCostPerSquare || 0);
    for (const inst of inv.items) { const def = DR.item(inst.id); if (def.damageMode === 'DURABILITY') cost += itemRepairCost(inst, def) || 0; }
    return r2(cost);
  }
  function repairCell(x, y) {
    const inv = DR.grid('INVENTORY'), cost = cfg().hullRepairCostPerSquare || 0;
    const i = inv.damage.findIndex(d => d[0] === x && d[1] === y);
    if (i < 0 || DR.s.funds < cost) return;
    DR.addFunds(-cost);
    inv.damage.splice(i, 1);
    DR.emit('cargo', 'INVENTORY', null);
    DR.emit('itemsRepaired');                                                 // GameEvents.TriggerOnPlayerDamageChanged
    DR.save();
  }
  function repairItem(inst, def, cost) {
    if (DR.s.funds < cost) return;
    DR.addFunds(-cost);
    inst.dur = def.maxDurabilityDays;                                         // SpatialItemInstance.RepairToFullDurability
    DR.emit('cargo', 'INVENTORY', null);
    DR.emit('itemsRepaired');                                                 // GameEvents.TriggerItemsRepaired
    DR.save();
  }
  // RepairAllButton.DoRepairAll = RepairHullDamage (trừ cả tiền độ bền, chỉ khi đủ tiền) + RepairAllItemDurability (luôn chạy, quirk gốc)
  function repairAll() {
    const inv = DR.grid('INVENTORY'), cost = repairAllCost();
    if (DR.s.funds >= cost) { if (cost > 0) DR.addFunds(-cost); inv.damage.length = 0; }
    for (const inst of inv.items) { const def = DR.item(inst.id); if (isEquip(def) && def.damageMode === 'DURABILITY') inst.dur = def.maxDurabilityDays; }
    DR.emit('cargo', 'INVENTORY', null);
    DR.emit('itemsRepaired');
    DR.save();
  }

  // ---------------------------------------------------------------- prompt (handler của mối nối DRCargo)
  // nút vùng điều khiển / chân bảng nền sáng: giá đủ tiền để màu chữ của nút (priceColor null)
  const SELL_STATES = ['IN_INVENTORY', 'IN_STORAGE', 'BEING_HARVESTED'];
  // cảm ứng không có phím F: Bán / Hoàn tiền thành nút ở vùng điều khiển [ĐỀ XUẤT] (bản gốc chỉ ghi trong tooltip)
  const coarse = () => !!(root.matchMedia && matchMedia('(pointer: coarse)').matches);
  function prompts(ctx) {
    if (!cur) return [];
    const c = cur.c, out = [], h = ctx.held, hv = ctx.hovered, funds = DR.s.funds;
    if (c.allowRepairs) {
      // RepairActionHandler: nút bật chế độ sửa chỉ ở tab Khoang khi tay không; Sửa tất cả giữ R 1 s ở vùng điều khiển
      if (ctx.tab === 'INVENTORY' && !h) out.push({ id: 'repair-mode', label: ctx.mode === 'repair' ? 'Thoát chế độ sửa' : 'Vào chế độ sửa', bind: 'KeyT', hold: 0, area: 'control', enabled: true,
        run: x => x.setMode(x.mode === 'repair' ? 'equip' : 'repair') });
      const all = repairAllCost();
      out.push({ id: 'repair-all', label: 'Sửa tất cả', price: all, priceColor: funds >= all ? null : color(3), bind: 'KeyR', hold: 1, area: 'control', enabled: all > 0 && funds >= all, run: repairAll });
    }
    if (ctx.mode === 'repair') {
      if (!h && hv) {
        let cost = null, run = null;
        if (hv.damaged && hv.key === 'INVENTORY' && (!hv.inst || hv.def.damageMode !== 'DURABILITY')) { cost = cfg().hullRepairCostPerSquare || 0; run = () => repairCell(hv.cell[0], hv.cell[1]); }
        else if (hv.inst && hv.def.damageMode === 'DURABILITY') { cost = itemRepairCost(hv.inst, hv.def); run = () => repairItem(hv.inst, hv.def, cost); }
        if (cost != null) out.push({ id: 'repair', label: 'Sửa', price: cost, priceColor: funds >= cost ? '#ffffff' : color(3), bind: 'lmb', hold: 0, enabled: funds >= cost, run });
      }
      return out;
    }
    // Mua: rê lên món trong lưới hàng, tay không; giá trắng (NEUTRAL) khi đủ tiền, đỏ (NEGATIVE) khi thiếu
    if (!h && hv && hv.inst && hv.st === 'IN_SHOP') {
      const price = buyPrice(hv.def), ok = funds >= price;
      out.push({ id: 'buy', label: 'Mua', price, priceColor: ok ? color(0) : color(3), bind: 'lmb', hold: 0, enabled: ok, run: x => buy(hv, x) });
    }
    // Bán / Hoàn tiền: món đang rê (tay không) hoặc món đang cầm; giá xanh (POSITIVE); thiết bị phải giữ 0,75 s
    const t = h ? { held: true, inst: h.inst, def: h.def, st: h.st, src: h.src } : hv && hv.inst ? { inst: hv.inst, def: hv.def, st: hv.st, gr: hv.gr } : null;
    let sellBound = false;
    if (t && accepts(c, t.def, false) && (SELL_STATES.includes(t.st) || t.st === 'JUST_PURCHASED')) {
      const refund = t.st === 'JUST_PURCHASED';
      const price = refund ? buyPrice(t.def) : sellPrice(t.inst, c.sellValueModifier);
      out.push({ id: refund ? 'refund' : 'sell', label: refund ? 'Hoàn tiền' : 'Bán', price, priceColor: color(2), bind: 'KeyF', hold: isEquip(t.def) ? 0.75 : 0, enabled: true, area: coarse() ? 'control' : 'tip', run: x => sellOne(t, x) });
      sellBound = true;
    }
    if (c.allowBulkSell) {
      // Bán hết: giữ F 0,5 s ở vùng điều khiển. Khi F đang dành cho món đang rê thì chỉ còn nút bấm-giữ [ĐỀ XUẤT] (bản gốc chồng hai hành động lên F)
      const items = bulkList(), total = r2(items.reduce((s, [, i]) => s + sellPrice(i, c.sellValueModifier), 0));
      const okAll = !(h && h.st === 'JUST_PURCHASED') && items.length > 0;
      out.push({ id: 'sell-all', label: SELL_ALL_VN[c.bulkSellPromptString] || 'Bán hết', price: total, bind: sellBound ? 'btn' : 'KeyF', hold: 0.5, area: 'control', enabled: okAll, run: sellAll });
    }
    return out;
  }

  function handler() {
    return {
      name: 'shop',
      canPlace: (def, key) => !String(key).startsWith(SHOP),
      prompts,
      onClose() { /* lưới hàng đã nằm trong DR.s.grids */ }
    };
  }

  // ---------------------------------------------------------------- bố cục (đơn vị canvas, gốc trên-trái)
  // RectTransform -> hộp trong cha: neo + pivot + anchoredPosition + sizeDelta (trục y của Unity hướng lên)
  function rectIn(p, n) {
    const w = (n.amax[0] - n.amin[0]) * p.w + n.size[0], h = (n.amax[1] - n.amin[1]) * p.h + n.size[1];
    const ax = (n.amin[0] + (n.amax[0] - n.amin[0]) * n.pivot[0]) * p.w + n.pos[0];
    const ay = (n.amin[1] + (n.amax[1] - n.amin[1]) * n.pivot[1]) * p.h + n.pos[1];
    const left = ax - w * n.pivot[0], bottom = ay - h * n.pivot[1];
    return { x: p.x + left, y: p.y + (p.h - bottom - h), w, h };
  }
  // ShipyardSlidePanel: lưới ShopGrid nằm trong TabbedPanelContainer/Panels/ShopPanel/Container; MarketSlidePanel: MarketGrid nằm thẳng trong bảng
  function spec(kind) {
    const L = ui().layout;
    const P = L[kind + '.panel'];
    if (!P) return null;
    const panel = { x: 0, y: 0, w: P.size[0], h: P.size[1] };
    let g;
    if (kind === 'shipyard') {
      const tb = rectIn(panel, L['shipyard.tabbed']);
      const pn = rectIn(tb, L['shipyard.panels']);
      g = rectIn(pn, L['shipyard.grid']);
    } else g = rectIn(panel, L['market.grid']);
    return { w: panel.w, h: panel.h, x: 0, y: null, dy: -P.pos[1], gridX: g.x, gridY: g.y, gridW: g.w, gridH: g.h, title: true };
  }

  // ---------------------------------------------------------------- mở / đóng (MarketDestinationUI.ShowMainUI)
  const PLAYER_TABS = { 0: 'TRAWL_NET', 1: 'INVENTORY', 3: 'STORAGE' };      // PlayerTabbedPanel: 0 lưới kéo, 1 khoang, 2 cabin (chưa có), 3 kho
  function open(dest, opts) {
    const c = ui().dests[dest.id];
    if (!c) { console.warn('[shop] destination has no market config:', dest.id); return false; }
    if (!root.DRCargo) return false;
    opts = opts || {};
    restock(false);
    const tabs = (c.tabs || []).filter(tabOpen).map(t => ({ key: gridName(t.gridKey), icon: t.icon ? SPRITE(t.icon) : null, title: tabTitle(t), grid: grid(t.gridKey) }));
    const kind = c.cls === 'ShipyardDestination' ? 'shipyard' : 'market';
    let left = null;
    if (tabs.length) {
      left = { kind: 'shop', tabs, spec: spec(kind), shopKind: kind };
      // MarketDestinationUI.OnMarketTabChanged: tiêu đề đổi theo tab
      Object.defineProperty(left, 'title', { get: () => (tabs.find(t => t.key === left.cur) || tabs[0]).title, enumerable: true });
      if (c.allowRepairs) left.footer = { help: '', buttons: [{ id: 'repair-all-btn', label: 'Sửa tất cả', get price() { return repairAllCost(); },
        get priceColor() { return DR.s.funds >= repairAllCost() ? null : color(3); }, enabled: x => !x.held, run: repairAll }] };
    }
    const right = (c.playerTabs || [1]).map(i => PLAYER_TABS[i]).filter(k => k && (k !== 'STORAGE' || c.allowStorageAccess));
    cur = { dest, c, onClose: opts.onClose };
    cur.handle = DRCargo.open({
      right: { tabs: right.length ? right : ['INVENTORY'], cur: 'INVENTORY' }, left, mode: 'equip', handler: handler(),
      onClose: r => { const cb = cur && cur.onClose; cur = null; if (cb) cb(r); }
    });
    return true;
  }

  if (root.DR && DR.on) {
    DR.on('researchCompleted', () => { if (DR.s) DR.s.vars['shop-restock-due'] = true; });   // ShopRestocker.OnResearchCompleted
    // ShopRestocker.OnEnable sau khi nạp ván: lưới hàng nào rỗng thì nhập lại
    DR.on('load', () => {
      const cfgs = restocker().shopDataGridConfigs || {};
      if (Object.values(cfgs).some(k => !DR.s.grids[gridName(k)] || !(DR.s.grids[gridName(k)].items || []).length)) DR.s.vars['shop-restock-due'] = true;
    });
  }

  root.DRShop = {
    open, restock, grid, buyPrice, sellPrice: (inst, destId) => sellPrice(inst, ((ui().dests[destId] || {}).sellValueModifier) || 1),
    repairAllCost, accepts: (destId, def, bulk) => accepts(ui().dests[destId] || {}, def, !!bulk), spec, isOpen: () => !!cur,
    _debug: () => cur && { dest: cur.dest.id, cls: cur.c.cls }
  };
})(window);
