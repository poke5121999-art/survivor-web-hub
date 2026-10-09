/*
 * Lây nhiễm ký sinh (InfectionHelper.cs) — đơn vị U7 infection, MONSTERS.md §2.7 + §3.2.
 *
 * Số gốc (GameConfigDataProd.asset:264-266, đã vào data/config.js): itemInfectionSpreadIntervalDays 0,2; itemInfectionSpreadChance 0,15;
 *   infectionAberrationSwapChance 0,15.
 * Nhịp (InfectionHelper.Update :14-22): mỗi khi TimeAndDay - gameTimeOfLastInfect > 0,2 ngày thì đặt mốc = TimeAndDay (lưu SaveData.LastInfectTime) rồi TryInfect.
 * TryInfect (:24-52): lần lượt lưới STORAGE, TRAWL_NET, INVENTORY (cả ba canBecomeAberration = true). Chỉ lưới INVENTORY có thông báo:
 *   số cá nhiễm trước = 1 và sau > 1 → "notification.infection-spread-1"; trước > 1 và sau > trước → "-n". (Nhánh trước = 0 sau > 0 là LogError gốc, bỏ qua.)
 * TryInfectGrid (:54-91): danh sách cá nhiễm LẤY MỘT LẦN trước vòng lặp (cá mới nhiễm trong cùng nhịp không lây tiếp), duyệt ngược; mỗi ô của cá,
 *   8 ô lân cận trong lưới, bỏ ô thuộc chính con cá; nếu ô có cá khác, chưa nhiễm, CanBeInfected (canBeInfected && !isAberration) và
 *   Random.value < 0,15 thì InfectItem. Một con cá chạm nhiều ô nhiễm được tung nhiều lần (đúng như bản gốc).
 * InfectItem (GridManager.cs:744-752): FishItemInstance.Infect() (isInfected = true, freshness = 0), rồi nếu canBecomeAberrations và
 *   Random.value < 0,15 → ItemManager.ReplaceFishWithAberration (ItemManager.cs:601-624): bốc ngẫu nhiên một trong FishItemData.Aberrations
 *   (allowUndiscovered = true: không cần đã bắt được), gỡ cá cũ, thêm con mới cùng vị trí/xoay, cùng size và freshness, và nhiễm sẵn (autoInfect).
 *   [ĐỀ XUẤT] Gốc không kiểm chỗ trống khi thay; web kiểm canPlace (một vài dị biến khác dấu chân), không vừa thì giữ con cũ (đã nhiễm).
 *
 * Trạng thái dùng chung qua DR.s (thoả thuận với U6 scares, js/scares.js):
 *   DR.s.lastInfectTime   số thực, SaveData.LastInfectTime — mốc của nhịp lây (U7 sở hữu; chưa có thì lấy luôn thời gian hiện tại)
 *   inst.infected = true  cờ trên mỗi con cá trong DR.s.grids[key].items (FishItemInstance.isInfected); cargo.js vẽ hạt nhiễm, grid.js/rules.js
 *                         để cá nhiễm đứng độ tươi 0 và không ươn
 *   DR.emit('cargo', key) mỗi khi lưới đổi vì lây (hộp hàng đang mở được vẽ lại qua DRCargo.refresh)
 * U6 gọi DRInfection.infectRandom() cho sự kiện Parasite (hoặc tự đặt inst.infected như scares.js làm); hai bên đều khớp GridManager.InfectRandomItemInInventory.
 *
 * API: DRInfection.{ tick(), spread(key, canAberrate) → {changed}, infectItem(inst, key, canAberrate), infectRandom(), rng (đặt hàm khác để gieo mầm cho kiểm thử),
 *   canInfect(inst), count(key) }
 */
(function (root) {
  'use strict';
  const G = root.DRGrid, CFG = root.DR_CONFIG || {}, ITEMS = root.DR_ITEMS || {};
  const INTERVAL = CFG.itemInfectionSpreadIntervalDays == null ? 0.2 : CFG.itemInfectionSpreadIntervalDays;
  const CHANCE = CFG.itemInfectionSpreadChance == null ? 0.15 : CFG.itemInfectionSpreadChance;
  const SWAP = CFG.infectionAberrationSwapChance == null ? 0.15 : CFG.infectionAberrationSwapChance;
  const api = { rng: Math.random };

  const isFish = d => !!d && (G.subOf(d) & G.SUB.FISH) !== 0;
  // FishItemData.CanBeInfected
  const canInfect = inst => { const d = inst && ITEMS[inst.id]; return isFish(d) && d.canBeInfected !== false && !d.isAberration; };
  const fishOf = g => g.items.filter(i => isFish(ITEMS[i.id]));
  const count = key => { const s = root.DR && DR.s; return s && s.grids[key] ? fishOf(DR.grid(key)).filter(i => i.infected).length : 0; };
  const toast = t => { if (root.DRHud && DRHud.toast) DRHud.toast(t); };

  // ItemManager.ReplaceFishWithAberration (autoInfect true, allowUndiscovered true)
  function replaceWithAberration(g, inst) {
    const list = (ITEMS[inst.id].aberrations || []).filter(a => ITEMS[a]);
    if (!list.length) return inst;
    const nid = list[Math.floor(api.rng() * list.length)], nd = ITEMS[nid];
    const at = g.items.indexOf(inst);
    G.remove(g, inst);
    const out = G.place(g, nd, inst.x, inst.y, inst.rot || 0, { size: inst.size, fresh: inst.fresh, infected: true });
    if (!out) { g.items.splice(at, 0, inst); return inst; }          // [ĐỀ XUẤT] không vừa chỗ: giữ con cũ
    return out;
  }

  // GridManager.InfectItem
  function infectItem(inst, key, canAberrate) {
    inst.infected = true; inst.fresh = 0;                            // FishItemInstance.Infect(): freshness = 0
    const g = root.DR.grid(key);
    if (canAberrate && api.rng() < SWAP) return replaceWithAberration(g, inst);
    return inst;
  }

  // GridManager.InfectRandomItemInInventory (:689-699): xáo trộn rồi lấy con đầu chưa nhiễm và CanBeInfected; không đổi thành dị biến
  function infectRandom() {
    const g = root.DR.s.grids.INVENTORY && root.DR.grid('INVENTORY');
    if (!g) return null;
    const pool = g.items.filter(i => canInfect(i) && !i.infected);
    if (!pool.length) return null;
    const f = pool[Math.floor(api.rng() * pool.length)];
    infectItem(f, 'INVENTORY', false);
    toast('Có thứ gì đó trườn vào khoang chứa của bạn.');            // notification.infection-start
    root.DR.emit('cargo', 'INVENTORY', f);
    return f;
  }

  // InfectionHelper.TryInfectGrid
  function spread(key, canAberrate) {
    const out = { changed: false };
    if (!root.DR.s.grids[key]) return out;
    const g = root.DR.grid(key);
    const src = fishOf(g).filter(i => i.infected);
    for (let a = src.length - 1; a >= 0; a--) {
      const f = src[a], mine = f.cells;
      for (let c = mine.length - 1; c >= 0; c--) {
        const cx = mine[c][0], cy = mine[c][1];
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= g.cols || ny < 0 || ny >= g.rows) continue;
          if (mine.some(m => m[0] === nx && m[1] === ny)) continue;
          const t = G.itemAt(g, nx, ny);
          if (t && isFish(ITEMS[t.id]) && !t.infected && canInfect(t) && api.rng() < CHANCE) { infectItem(t, key, canAberrate); out.changed = true; }
        }
      }
    }
    return out;
  }

  // InfectionHelper.TryInfect
  function tryInfect() {
    const s = root.DR.s, ch = [];
    for (const key of ['STORAGE', 'TRAWL_NET']) if (spread(key, true).changed) ch.push(key);
    const before = count('INVENTORY');
    if (s.grids.INVENTORY && spread('INVENTORY', true).changed) {
      ch.push('INVENTORY');
      const after = count('INVENTORY');
      if (before === 1 && after > 1) toast('Một mùi hôi thối bốc lên từ khoang chứa của bạn.');               // notification.infection-spread-1
      else if (before > 1 && after > before) toast('Mùi hôi thối trong khoang chứa càng nồng hơn.');          // notification.infection-spread-n
    }
    for (const k of ch) root.DR.emit('cargo', k, null);
    if (ch.length && root.DRCargo && DRCargo.isOpen && DRCargo.isOpen()) DRCargo.refresh();
    return ch;
  }

  // InfectionHelper.Update
  function tick() {
    const D = root.DR, s = D && D.s;
    if (!s || !s.grids || D.mode === 'title') return null;
    if (s.lastInfectTime == null || s.time < s.lastInfectTime) s.lastInfectTime = s.time;   // mốc chưa có / thời gian lùi (ván mới, nạp sổ)
    if (s.time - s.lastInfectTime > INTERVAL) { s.lastInfectTime = s.time; return tryInfect(); }
    return null;
  }

  Object.assign(api, { tick, tryInfect, spread, infectItem, infectRandom, canInfect, count, INTERVAL, CHANCE, SWAP });
  root.DRInfection = api;
  // main.js không có móc cho mô-đun mới (seam đã đóng): tự chạy theo khung hình, thời gian game quyết định nhịp nên không phụ thuộc dt
  (function loop() { try { tick(); } catch (e) { console.error('[infection] tick failed:', e); } root.requestAnimationFrame(loop); })();
})(typeof window !== 'undefined' ? window : globalThis);
