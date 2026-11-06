/*
 * Lưới khoang thuyền và mọi lưới chứa đồ (kho, lưới kéo, bẫy cua, quầy hàng).
 * Luật chép từ SerializableGrid / GridCellData của bản gốc (D:\dredge-ref\src):
 *   - ô nhận hàng theo cờ: item có subtype thì so cờ subtype, không thì so cờ type;
 *   - ô có cấu hình itemType = 0 (ô ẩn, phần thân chưa nâng cấp) không nhận gì;
 *   - xoay 0/90/180/270 quanh ô gốc theo đúng công thức GetCellsAffectedByObjectAtPosition;
 *   - ô có vết hỏng (underlay "dmg") không đặt được đồ mới, trừ món có ignoreDamageWhenPlacing (động cơ, cần, đèn: đặt được, nhưng bị tắt).
 * Hàm thuần, không đụng DOM, chạy được trong node (test/dredge-rules.js).
 */
(function (root) {
  'use strict';

  // ALL = -1 như enum cờ của C#: mọi bit bật, nên phép & nào cũng khác 0.
  const TYPE = { NONE: 0, GENERAL: 1, EQUIPMENT: 2, DAMAGE: 4, ALL: -1 };
  const SUB = {
    NONE: 0, FISH: 1, ENGINE: 2, ROD: 4, GENERAL: 8, RELIC: 16, TRINKET: 32, MATERIAL: 64,
    LIGHT: 128, POT: 256, NET: 512, DREDGE: 1024, GADGET: 2048, ALL: -1
  };

  // data.py có thể ghi cờ dạng số hoặc danh sách tên; quy về số ở một chỗ.
  function mask(v, table) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return table[v] || 0;
    if (Array.isArray(v)) return v.reduce((m, n) => m | mask(n, table), 0);
    return 0;
  }
  const typeOf = it => mask(it.type, TYPE);
  const subOf = it => mask(it.subtype, SUB);

  // cfg: { columns, rows, mainItemType, mainItemSubtype, mainItemData, cellGroupConfigs:[{cells,itemType,itemSubtype,isHidden,damageImmune}] }
  function create(cfg, extraGroups) {
    const cols = cfg.columns, rows = cfg.rows, cells = new Array(cols * rows);
    const mainOnly = cfg.mainItemData && typeof cfg.mainItemData === 'string' ? cfg.mainItemData : null;
    for (let i = 0; i < cells.length; i++) {
      cells[i] = {
        type: mask(cfg.mainItemType, TYPE), sub: mask(cfg.mainItemSubtype, SUB),
        only: mainOnly, hidden: false, immune: false
      };
    }
    const groups = (cfg.cellGroupConfigs || []).concat(extraGroups || []);
    for (const g of groups) {
      for (const c of g.cells) {
        const cx = Array.isArray(c) ? c[0] : c.x, cy = Array.isArray(c) ? c[1] : c.y;
        const cell = cells[cy * cols + cx];
        if (!cell) continue;
        cell.type = mask(g.itemType, TYPE);
        cell.sub = mask(g.itemSubtype, SUB);
        cell.hidden = !!g.isHidden;
        cell.immune = !!g.damageImmune;
      }
    }
    return { cols, rows, cells, items: [], damage: [], seq: 1 };
  }

  function accepts(cell, it) {
    if (cell.only) return it.id === cell.only;
    if (cell.type === 0) return false;
    const s = subOf(it);
    if (s === 0) return (cell.type & typeOf(it)) !== 0;
    return (cell.sub & s) !== 0;
  }

  function footprint(it, x, y, rot) {
    const out = [];
    for (const d of it.dims) {
      const ox = d[0] !== undefined ? d[0] : d.x, oy = d[1] !== undefined ? d[1] : d.y;
      let cx = x + ox, cy = y + oy;
      if (rot === 90) { cx = x + oy; cy = y - ox; }
      else if (rot === 180) { cx = x - ox; cy = y - oy; }
      else if (rot === 270) { cx = x - oy; cy = y + ox; }
      out.push([cx, cy]);
    }
    return out;
  }

  const idx = (g, x, y) => (x >= 0 && x < g.cols && y >= 0 && y < g.rows) ? y * g.cols + x : -1;

  function itemAt(g, x, y) {
    for (const inst of g.items) {
      for (const [cx, cy] of inst.cells) if (cx === x && cy === y) return inst;
    }
    return null;
  }
  const isDamaged = (g, x, y) => g.damage.some(d => d[0] === x && d[1] === y);

  // ignore: một instance đang được nhấc lên (kéo thả) thì ô của nó coi như trống.
  function canPlace(g, it, x, y, rot, ignore) {
    const fp = footprint(it, x, y, rot);
    for (const [cx, cy] of fp) {
      const i = idx(g, cx, cy);
      if (i < 0) return false;
      const occ = itemAt(g, cx, cy);
      if (occ && occ !== ignore) return false;
      if (isDamaged(g, cx, cy) && !it.ignoreDamageWhenPlacing) return false;   // GridObject.GetPlacementResult: thiết bị bỏ qua ô hỏng
      if (!accepts(g.cells[i], it)) return false;
    }
    return true;
  }

  function place(g, it, x, y, rot, extra) {
    if (!canPlace(g, it, x, y, rot)) return null;
    const inst = Object.assign({ uid: g.seq++, id: it.id, x, y, rot, cells: footprint(it, x, y, rot) }, extra || {});
    g.items.push(inst);
    return inst;
  }

  function move(g, inst, it, x, y, rot) {
    if (!canPlace(g, it, x, y, rot, inst)) return false;
    inst.x = x; inst.y = y; inst.rot = rot; inst.cells = footprint(it, x, y, rot);
    return true;
  }

  function remove(g, inst) {
    const i = g.items.indexOf(inst);
    if (i >= 0) g.items.splice(i, 1);
    return i >= 0;
  }

  // FindPositionForObject: quét hàng rồi cột, mỗi ô thử 4 góc xoay (prioritizeRotation thì xoay ở vòng ngoài).
  function findSpot(g, it, startRot, prioritizeRotation) {
    const r0 = startRot || 0;
    if (prioritizeRotation) {
      for (let k = 0, r = r0; k < 4; k++, r = (r + 90) % 360)
        for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++)
          if (canPlace(g, it, x, y, r)) return { x, y, rot: r };
      return null;
    }
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++)
      for (let k = 0, r = r0; k < 4; k++, r = (r + 90) % 360)
        if (canPlace(g, it, x, y, r)) return { x, y, rot: r };
    return null;
  }

  function autoPlace(g, it, extra) {
    const s = findSpot(g, it, 0, false);
    return s ? place(g, it, s.x, s.y, s.rot, extra) : null;
  }

  // GridCellData.CanDamageThisCell; damageMode của item nằm trên ô quyết định ô có bị đánh không.
  function canDamage(g, x, y, itemsById, shipwrightOpen) {
    const cell = g.cells[idx(g, x, y)];
    if (!cell || cell.type === 0 || cell.immune || isDamaged(g, x, y)) return false;
    const occ = itemAt(g, x, y);
    if (occ && (itemsById[occ.id] || {}).damageMode === 'NONE') return false;
    if ((cell.type & TYPE.EQUIPMENT) && !shipwrightOpen) return false;
    return true;
  }

  // GridManager.AddDamageToInventory: tối đa 100 lần thử ô ngẫu nhiên, rồi ô hợp lệ đầu tiên.
  // Trả về { cell:[x,y], destroyed: inst|null } hoặc null khi không còn ô nào đánh được.
  function addDamage(g, itemsById, shipwrightOpen, rnd) {
    rnd = rnd || Math.random;
    let hit = null;
    for (let t = 0; t < 100 && !hit; t++) {
      const x = Math.floor(rnd() * g.cols), y = Math.floor(rnd() * g.rows);
      if (canDamage(g, x, y, itemsById, shipwrightOpen)) hit = [x, y];
    }
    for (let y = 0; y < g.rows && !hit; y++) for (let x = 0; x < g.cols && !hit; x++)
      if (canDamage(g, x, y, itemsById, shipwrightOpen)) hit = [x, y];
    if (!hit) return null;
    g.damage.push(hit);
    const occ = itemAt(g, hit[0], hit[1]);
    let destroyed = null;
    if (occ) {
      const mode = (itemsById[occ.id] || {}).damageMode;
      if (mode === 'DESTROY') { remove(g, occ); destroyed = occ; }
    }
    return { cell: hit, destroyed, on: occ };
  }

  const onDamaged = (g, inst) => inst.cells.some(([x, y]) => isDamaged(g, x, y));
  const usable = (g, x, y) => { const c = g.cells[idx(g, x, y)]; return !!c && c.type !== 0 && !c.hidden; };

  // ---- Cá ươn thành "Rot" (ItemManager.ReplaceFishWithRot, ItemManager.cs:584-599) ----
  // Cá nhiễm bệnh không ươn. Rot (1x1) đặt vào ô ĐẦU TIÊN của dấu chân con cá, giữ nguyên lưới; trả về instance Rot hoặc null.
  function rotFish(g, inst, itemsById) {
    if (inst.infected) return null;
    const rot = itemsById.rot;
    if (!rot) return null;
    const [x, y] = inst.cells[0];
    remove(g, inst);
    const out = { uid: g.seq++, id: 'rot', x, y, rot: 0, cells: footprint(rot, x, y, 0) };
    g.items.push(out);
    return out;
  }

  // ---- Độ tươi trôi theo thời gian (FreshnessCoroutine.AdjustFreshnessForGrid, FreshnessCoroutine.cs:48-91) ----
  // dDays = phần ngày vừa trôi. Khối băng (id chứa "ice-block") làm chậm mất tươi: InverseLerp(0, cellsForMaxFreshnessLossReduction, ô băng)
  // qua freshnessLossReductionCurve x maxFreshnessLossReduction; băng tự mòn durability theo coolingChange và biến mất khi <= 0.
  // Cá về 0 thì thành Rot. Trả về { rotted: [inst...], melted: [inst...] }.
  // AnimationCurve của Unity, data.py ghi thành [[t, giá trị, tiếp tuyến vào, tiếp tuyến ra], ...]: nội suy Hermite như sky.js.
  function hermite(keys, t) {
    const k = keys || [];
    if (!k.length) return t;
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) {
      const a = k[i - 1], b = k[i], d = b[0] - a[0];
      if (Math.abs(a[3]) > 1e20 || Math.abs(b[2]) > 1e20) return a[1];
      const u = (t - a[0]) / d, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * a[3] * d + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * b[2] * d;
    }
    return k[k.length - 1][1];
  }
  function tickFreshness(cfg, g, itemsById, dDays, evalCurve) {
    evalCurve = evalCurve || hermite;
    const out = { rotted: [], melted: [] };
    if (!(dDays > 0)) return out;
    const ice = g.items.filter(i => String(i.id).indexOf('ice-block') >= 0);
    let cooled = 0;
    for (const i of ice) cooled += ((itemsById[i.id] || {}).dims || []).length;
    let fishChange, coolingChange;
    if (!cooled) { fishChange = dDays * (+cfg.freshnessLossPerDay || 0); coolingChange = 0; }
    else {
      const t = cfg.cellsForMaxFreshnessLossReduction ? Math.min(1, Math.max(0, cooled / cfg.cellsForMaxFreshnessLossReduction)) : 1;
      const red = evalCurve(cfg.freshnessLossReductionCurve, t) * (+cfg.maxFreshnessLossReduction || 0);
      coolingChange = dDays * (1 - red);
      fishChange = coolingChange * (+cfg.freshnessLossPerDay || 0);
    }
    for (const i of ice) {
      i.dur = (i.dur == null ? (itemsById[i.id] || {}).maxDurabilityDays || 0 : i.dur) - coolingChange;
      if (i.dur <= 0) { remove(g, i); out.melted.push(i); }
    }
    for (const i of g.items.slice()) {
      const d = itemsById[i.id];
      if (!d || !(subOf(d) & SUB.FISH)) continue;
      if (i.infected) continue;                                     // DRRules.decayFish: cá nhiễm bệnh giữ nguyên
      i.fresh = Math.max((i.fresh == null ? +cfg.maxFreshness : i.fresh) - fishChange * (d.rotCoefficient == null ? 1 : +d.rotCoefficient), 0);
      if (i.fresh <= 0) { const r = rotFish(g, i, itemsById); if (r) out.rotted.push(i); }
    }
    return out;
  }

  // ---- Điều kiện hoàn thành lưới nộp đồ (CompletedGridCondition: ItemCountCondition, EmptyCondition) ----
  function countItem(g, id, itemsById, allowLinkedAberrations) {
    let n = 0;
    for (const i of g.items) {
      if (i.id === id) { n++; continue; }
      const d = allowLinkedAberrations && itemsById && itemsById[i.id];
      if (d && d.isAberration && d.nonAberrationParent === id) n++;
    }
    return n;
  }
  // Loại chưa dựng (CellCountOfItemTypeAndSubtype, ItemInventory, OtherQuest...) coi như chưa đạt để không mở khoá nhầm.
  function conditionMet(c, g, itemsById) {
    if (!c) return true;
    const t = c._t || (c.item != null ? 'ItemCountCondition' : '');
    if (t === 'EmptyCondition') return g.items.length === 0;
    if (t === 'ItemCountCondition') return countItem(g, c.item, itemsById, !!c.allowLinkedAberrations) >= (c.count | 0);
    return false;
  }
  const complete = (conds, g, itemsById) => (conds || []).every(c => conditionMet(c, g, itemsById));

  root.DRGrid = {
    TYPE, SUB, mask, typeOf, subOf, create, accepts, footprint, itemAt, isDamaged, canPlace, place, move,
    remove, findSpot, autoPlace, canDamage, addDamage, onDamaged, usable,
    rotFish, tickFreshness, countItem, conditionMet, complete, hermite
  };
})(typeof window !== 'undefined' ? window : globalThis);
