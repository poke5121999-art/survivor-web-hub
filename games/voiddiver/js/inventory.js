// Túi đồ trong lượt lặn: mô hình hàng hoá mang theo (Item/Equipment/Bag), ô nhanh, khe an toàn, túi phụ,
// bảng Tab dựng lại MenuPopup → InventoryManagementPage gốc (MyInventory trái, QuickSlotSettingPanel + InventoryKeyGuide
// giữa, LootingInventory phải), lục rương kiểu hé lộ từng ô (TryReveal/GetRevealTime gốc), ô đồ nhanh trên HUD.
// Số lấy từ bảng: Const.CharacterInventorySlotCount (23), InventoryPageSlotCount (24), SafeInventorySlotBaseCount (1),
// ItemCooltime (1 s), Item.InventoryCountMax (trần số lượng mỗi loại), Item.Cooltime, Item.SkillId, Bag.SlotCount theo
// Bag.Type ↔ Item/Equipment.BagType, Equipment.Corruption (cổ vật), Worth, buff LootingSpeedAmplifier.
// Bố cục, sprite, màu, phím: đo từ prefab gốc (tools/ui_inventory_dump.py), xem docs/DIVE.md §10.
(function (VD) {
  'use strict';
  const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  function C(name, d) { return VD.combatDB().c(name, d); }

  // ================================================================ hàng hoá (GoodsData "Loại:Id:SốLượng")
  const G = { idx: null };
  function index() {
    if (G.idx) return G.idx;
    const T = VD.T || {};
    const m = (rows, k) => { const o = new Map(); for (const r of rows || []) o.set(r[k || 'Id'], r); return o; };
    G.idx = { Item: m(T.Item), Equipment: m(T.Equipment), Bag: m(T.Bag) };
    return G.idx;
  }
  G.parse = function (s) {
    if (!s) return null;
    if (Array.isArray(s)) return { type: s[0], id: +s[1], count: +s[2] || 1 };
    if (typeof s === 'object') return Object.assign({}, s, { id: +s.id, count: +s.count || 1 });
    const p = String(s).split(':');
    return { type: p[0], id: +p[1], count: +p[2] || 1 };
  };
  G.row = g => { const t = index()[g.type]; return t ? t.get(+g.id) || null : null; };
  G.name = g => {
    const key = g.type === 'Item' ? 'TItem_Name_' : g.type === 'Equipment' ? 'TEquipment_Name_' : g.type === 'Bag' ? 'TBag_Name_' : 'T' + g.type + '_Name_';
    return TX(key + g.id) || (g.type + ' ' + g.id);
  };
  G.desc = g => TX((g.type === 'Item' ? 'TItem_Desc_' : g.type === 'Equipment' ? 'TEquipment_Desc_' : 'TBag_Desc_') + g.id);
  // Icon gốc: tên sprite = Id của hàng bảng (ASSETS.md §7), atlas Icon_Item / Icon_Equipment / Icon_Bag.
  G.icon = g => {
    const kind = g.type === 'Item' ? 'item' : g.type === 'Equipment' ? 'equipment' : g.type === 'Bag' ? 'bag' : 'common';
    const a = VD.ASSETS && VD.ASSETS.icon && VD.ASSETS.icon[kind];
    return (a && a.dir ? a.dir : 'art/ui/icon_' + kind + '/') + g.id + '.webp';
  };
  G.grade = g => { const r = G.row(g); const gr = r && r.Grade; return !gr || gr === 'None' ? 'Normal' : gr; };
  G.worth = g => { const r = G.row(g); return ((r && r.Worth) || 0) * (g.count || 1); };
  G.stackMax = g => { const r = G.row(g); return g.type === 'Item' && r ? Math.max(1, r.InventoryCountMax || 1) : 1; };
  G.bagType = g => { const r = G.row(g); return (r && r.BagType) || 'None'; };
  G.same = (a, b) => !!(a && b && a.type === b.type && +a.id === +b.id);
  VD.goods = G;

  // ================================================================ số đo trong GameAssembly (không có trong bảng)
  // EnumExtensions.GetRevealTime(EGoodsGradeType): thời gian hé lộ một ô của rương theo bậc (giây).
  const REVEAL_TIME = { None: 0.8, Normal: 0.8, Rare: 1.1, Elite: 2.2, Epic: 3.1, Legend: 4, Unique: 4 };
  // EnumExtensions.GetRevealSfx: tiếng khi ô hé lộ xong.
  const REVEAL_SFX = { None: 'Looting_low', Normal: 'Looting_low', Rare: 'Looting_middle', Elite: 'Looting_high', Epic: 'Looting_high', Legend: 'Looting_veryhigh', Unique: 'Looting_veryhigh' };
  // EnumExtensions..cctor: màu bậc (Color32) — tô nền chấm LevelBg của ô, chữ bậc trong tooltip.
  const GRADE_COLOR = { None: '#898989', Normal: '#898989', Rare: '#2E9B8F', Elite: '#3E7FE0', Epic: '#C141CC', Legend: '#FF8F2B', Unique: '#FFF691' };
  const LOOT_SLOTS = 30;        // LootingInventoryPanelView.slots: 30 ô, lưới 6 cột — không có trong bảng
  const QUICK_PANEL = 5;        // QuickSlotSettingPanel gốc: 5 ô (phím 1–5) — không có trong bảng
  const UI = 'art/ui/inventory/';
  const ICON_COMMON = (VD.ASSETS && VD.ASSETS.icon && VD.ASSETS.icon.common && VD.ASSETS.icon.common.dir) || 'art/ui/icon_common/';
  G.revealTime = g => REVEAL_TIME[G.grade(g)] || 0.8;
  G.color = g => GRADE_COLOR[G.grade(g)] || GRADE_COLOR.Normal;

  // ================================================================ mô hình
  const I = {
    slots: [], bags: [], safe: [], quick: [0, 0, 0, 0, 0, 0], cd: {}, gcd: 0, open: false, loot: null, equip: null,
    onChange: null, onDrop: null, onUse: null, ui: null, hover: null, sel: null, page: 0,
  };

  I.reset = function (opts) {
    opts = opts || {};
    const n = C('CharacterInventorySlotCount', 23);
    // Ô thường là {bag:null, g}; ô túi phụ có .bag (chỉ nhận hàng cùng BagType); khe an toàn bag 'Safe'.
    I.slots = [];
    for (let i = 0; i < n; i++) I.slots.push({ bag: null, g: null });
    I.bags = (opts.bags || []).map(id => index().Bag.get(+id)).filter(Boolean);
    for (const b of I.bags) for (let i = 0; i < b.SlotCount; i++) I.slots.push({ bag: b.Type, g: null });
    I.safe = new Array(C('SafeInventorySlotBaseCount', 1)).fill(null).map(() => ({ bag: 'Safe', g: null }));
    I.quick = (opts.quick || [0, 0, 0, 0, 0, 0]).slice(0, 6);
    while (I.quick.length < 6) I.quick.push(0);
    I.equip = opts.equip || null;
    I.cd = {}; I.gcd = 0; I.loot = null; I.page = 0; I.sel = null;
    for (const g of opts.goods || []) I.add(G.parse(g), { silent: true });
    for (const g of opts.safe || []) { const s = I.safe.find(x => !x.g); if (s) s.g = G.parse(g); }
    changed();
  };

  function allSlots() { return I.slots.concat(I.safe); }
  function changed() { if (I.onChange) I.onChange(); renderHud(); if (I.open) renderPanel(); }

  // Thêm hàng; trả số lượng không vừa (0 = vào hết). opts.silent: không toast.
  I.add = function (g, opts) {
    g = G.parse(g);
    if (!g || !(g.count > 0)) return 0;
    if (g.type === 'Gold') { if (VD.profile) VD.profile.giveGold(g.count); return 0; }
    if (g.type === 'Coin') { if (VD.profile) VD.profile.giveCoin(g.count); return 0; }
    const left = place(g, opts);
    if (left < g.count && g.type === 'Item') autoQuick(g.id);
    changed();
    return left;
  };
  // Đặt hàng vào túi (không gọi changed); trả phần không vừa.
  function place(g, opts) {
    let left = g.count;
    const bt = G.bagType(g);
    if (g.type === 'Item') {
      // Item.InventoryCountMax là trần tổng của một loại trong túi (PickUpItemMaxCount: "chỉ nhận được một phần").
      const room = Math.max(0, G.stackMax(g) - I.count('Item', g.id));
      const put = Math.min(room, left);
      const same = allSlots().find(s => s.g && G.same(s.g, g));
      if (same) { same.g.count += put; left -= put; }
      else if (put > 0) {
        const s = freeSlot(bt);
        if (s) { s.g = { type: 'Item', id: g.id, count: put }; left -= put; }
      }
      if (left > 0 && room < g.count && !(opts && opts.silent)) toast(TX('PickUpItemMaxCount'));
      else if (left > 0 && !(opts && opts.silent)) toast(TX('NotEnoughInventorySlots') || TX('InventoryFull'));
    } else {
      while (left > 0) {
        const s = freeSlot(bt);
        if (!s) break;
        s.g = Object.assign({}, g, { count: 1 });
        left--;
      }
      if (left > 0 && !(opts && opts.silent)) toast(TX('NotEnoughInventorySlots') || TX('InventoryFull'));
    }
    return left;
  }
  function freeSlot(bagType) {
    if (bagType && bagType !== 'None') { const b = I.slots.find(s => s.bag === bagType && !s.g); if (b) return b; }
    return I.slots.find(s => !s.bag && !s.g) || null;
  }
  // Đồ tiêu hao mới nhặt tự vào ô nhanh trống đầu tiên. [SUY LUẬN: bản gốc gán tay bằng phím số trong túi]
  function autoQuick(id) {
    const r = index().Item.get(id);
    if (!r || !r.CanUseFromQuickSlot || I.quick.indexOf(id) >= 0) return;
    const k = I.quick.slice(0, QUICK_PANEL).indexOf(0);
    if (k >= 0) I.quick[k] = id;
  }

  I.count = function (type, id) {
    let n = 0;
    for (const s of allSlots()) if (s.g && s.g.type === type && s.g.id === +id) n += s.g.count;
    return n;
  };
  I.has = (type, id, n) => I.count(type, id) >= (n || 1);
  I.remove = function (type, id, n) {
    let left = n == null ? 1 : n;
    for (const s of allSlots()) {
      if (left <= 0) break;
      if (!s.g || s.g.type !== type || s.g.id !== +id) continue;
      const k = Math.min(left, s.g.count);
      s.g.count -= k; left -= k;
      if (s.g.count <= 0) s.g = null;
    }
    changed();
    return (n == null ? 1 : n) - left;
  };
  I.emptySlots = () => I.slots.filter(s => !s.bag && !s.g).length;
  I.goods = () => allSlots().filter(s => s.g).map(s => s.g);
  I.worth = () => I.goods().reduce((a, g) => a + G.worth(g), 0);
  // Tổng ô nhiễm cổ vật đang mang (Equipment.Corruption của hàng GoodsType Artifact).
  I.corruption = () => I.goods().reduce((a, g) => {
    const r = g.type === 'Equipment' ? G.row(g) : null;
    return a + (r && r.GoodsType === 'Artifact' ? (r.Corruption || 0) * g.count : 0);
  }, 0);
  // Chìa: đồ có KeyTypes chứa type (Key/Medicine), ưu tiên id nằm trong danh sách ids (rỗng = mọi đồ cùng loại).
  I.findKey = function (types, ids) {
    for (const s of allSlots()) {
      if (!s.g || s.g.type !== 'Item') continue;
      const r = G.row(s.g);
      if (!r) continue;
      const okType = (r.KeyTypes || []).some(t => types.indexOf(t) >= 0);
      if (!okType) continue;
      if (ids && ids.length && ids.indexOf(s.g.id) < 0) continue;
      return s.g.id;
    }
    return 0;
  };

  // ================================================================ dùng đồ
  // Item.SkillId chạy qua lõi combat (Skill.start force). Hồi chiêu: Item.Cooltime riêng + Const.ItemCooltime chung.
  I.use = function (id, from) {
    const r = index().Item.get(+id);
    const p = VD.stage && VD.stage.player;
    if (!r || !p || p.dead) return false;
    if (from === 'quick' && !r.CanUseFromQuickSlot) return false;
    if (from === 'inventory' && !r.CanUseFromInventory) { toast(TX('CannotUseInInventory')); return false; }
    if (!I.has('Item', id)) return false;
    const now = VD.stage.A.time;
    if ((I.cd[id] || 0) > now || I.gcd > now) return false;
    const db = VD.combatDB();
    if (!(r.SkillId > 0) || !db.skill(r.SkillId)) {
      console.warn('[inventory] Item ' + id + ' dùng skill ' + r.SkillId + ' nhưng VD.T.Skill không có');
      toast(G.name({ type: 'Item', id }) + ': thiếu dữ liệu skill ' + r.SkillId);
      return false;
    }
    const run = VD.Skill.start(VD.stage.A, p, r.SkillId, { force: true, slot: 'item' });
    if (!run) return false;
    I.remove('Item', id, 1);
    I.cd[id] = now + (r.Cooltime || 0);
    I.gcd = now + C('ItemCooltime', 1);
    for (const a of r.AddAfterConsumeIds || []) I.add({ type: 'Item', id: a, count: 1 }, { silent: true });
    if (I.onUse) I.onUse(id);
    return true;
  };
  I.useQuick = function (k) { const id = I.quick[k]; if (id) I.use(id, 'quick'); };

  // ================================================================ lục rương (LootingInventory)
  // Rương giữ kho 30 ô trên thực thể (source.lootInv) nên đóng/mở lại vẫn còn trạng thái hé lộ.
  // Mỗi ô: { g, rev: 0 chưa hé lộ | 1 đang hé lộ | 2 đã hé lộ, t, dur }.
  function mkLoot(items) {
    const slots = [];
    for (let i = 0; i < Math.max(LOOT_SLOTS, (items || []).length); i++) {
      const g = items && items[i] ? G.parse(items[i]) : null;
      slots.push({ g, rev: g ? 0 : 2, t: 0, dur: 0 });
    }
    return { slots };
  }
  // loot = { title, items:[goods], source } → mở bảng Tab kèm cột "Kết quả Tìm kiếm".
  I.openLoot = function (loot) {
    const src = loot.source;
    const inv = src ? (src.lootInv || (src.lootInv = mkLoot(loot.items))) : mkLoot(loot.items);
    inv.title = loot.title; inv.source = src || null; inv.onTake = loot.onTake || null;
    // items: hàng còn trong rương (đọc được từ bài kiểm và mã cũ).
    if (!Object.getOwnPropertyDescriptor(inv, 'items')) Object.defineProperty(inv, 'items', { get() { return inv.slots.filter(s => s.g).map(s => s.g); } });
    I.loot = inv;
    I.toggle(true);
  };
  // GetRevealDelayMultiplier gốc: max(0, 1 − ΣLootingSpeedAmplifier.Percent/100) theo buff của người lục.
  function revealMult() {
    const p = VD.stage && VD.stage.player;
    const pct = p && p.buffs && p.buffs.sum ? p.buffs.sum('LootingSpeedAmplifier', 'Percent') : 0;
    return Math.max(0, 1 - pct / 100);
  }
  // TryReveal gốc: lấy ô đầu tiên chưa hé lộ và không rỗng, chờ GetRevealTime(bậc) × hệ số, hé lộ, rồi tới ô kế.
  function revealTick(dt) {
    const L = I.loot;
    if (!L || !I.open) return;
    let cur = L.slots.find(s => s.rev === 1);
    if (!cur) {
      cur = L.slots.find(s => s.g && s.rev === 0);
      if (!cur) { stopLoop(); return; }
      cur.rev = 1; cur.t = 0; cur.dur = G.revealTime(cur.g) * revealMult();
      I.revealLoop = sfx('Looting_Loop', { loop: true, key: 'lootloop' });
      renderLootSlot(L.slots.indexOf(cur));
    }
    cur.t += dt;
    if (cur.t >= cur.dur) {
      cur.rev = 2;
      stopLoop();
      sfx(REVEAL_SFX[G.grade(cur.g)] || 'Looting_low');
      const k = L.slots.indexOf(cur);
      renderLootSlot(k, true);
    }
  }
  function stopLoop() { if (I.revealLoop) { VD.audio.stop(I.revealLoop, 0.05); I.revealLoop = null; } }
  // EndLooting: đóng bảng thì ô đang hé lộ quay lại chưa hé lộ (mở lại chờ lại từ đầu).
  function endLooting() {
    stopLoop();
    if (I.loot) for (const s of I.loot.slots) if (s.rev === 1) { s.rev = 0; s.t = 0; }
  }
  I.revealed = () => !I.loot || I.loot.slots.every(s => !s.g || s.rev === 2);

  // ================================================================ chuyển hàng giữa các ô
  function areaSlots(a) { return a === 'inv' ? I.slots : a === 'safe' ? I.safe : a === 'loot' ? (I.loot ? I.loot.slots : []) : null; }
  function slotAt(a, k) { const arr = areaSlots(a); return arr ? arr[k] || null : null; }
  function canHold(s, g) { return !s.bag || s.bag === 'Safe' || G.bagType(g) === s.bag; }
  function amount(g, mod) { return mod === 'one' ? 1 : mod === 'half' ? Math.max(1, Math.ceil(g.count / 2)) : g.count; }
  function isOwn(a) { return a === 'inv' || a === 'safe'; }
  // Chuyển n món từ ô src sang ô dst (cùng hoặc khác khu). Trả số món đã chuyển.
  function moveTo(src, sa, dst, da, n) {
    if (!src || !dst || src === dst || !src.g) return 0;
    const g = src.g;
    n = Math.min(n, g.count);
    if (!canHold(dst, g)) return 0;
    // Item vào túi mình: trần tổng InventoryCountMax (không tính phần đang nằm trong túi sẵn).
    if (g.type === 'Item' && isOwn(da) && !isOwn(sa)) n = Math.min(n, Math.max(0, G.stackMax(g) - I.count('Item', g.id)));
    if (n <= 0) { toast(TX('PickUpItemMaxCount')); return 0; }
    if (!dst.g) {
      dst.g = Object.assign({}, g, { count: n });
      g.count -= n; if (g.count <= 0) src.g = null;
      if (da === 'loot') { dst.rev = 2; dst.t = 0; }
      return n;
    }
    if (G.same(dst.g, g) && g.type === 'Item') {
      const cap = isOwn(da) ? G.stackMax(g) : Infinity;
      const put = isOwn(da) && isOwn(sa) ? n : Math.min(n, Math.max(0, cap - dst.g.count));
      if (put <= 0) return 0;
      dst.g.count += put; g.count -= put; if (g.count <= 0) src.g = null;
      return put;
    }
    // Khác hàng: chỉ đổi chỗ khi chuyển cả chồng và hai ô đều nhận được hàng của nhau.
    if (n < g.count || !canHold(src, dst.g)) return 0;
    const t = dst.g; dst.g = src.g; src.g = t;
    if (da === 'loot') dst.rev = 2;
    if (sa === 'loot') src.rev = 2;
    return n;
  }
  // Bấm chuột trái lên ô có hàng khi đang lục rương: đưa sang phía bên kia (OnLootingSlotToInventorySlot /
  // OnOnInventorySlotToLootingSlot). Chữ gốc: trái = "Bỏ vào tất cả", Ctrl + trái = "Bỏ vào 1", Shift + trái = nửa.
  I.transfer = function (a, k, mod) {
    const s = slotAt(a, k);
    if (!s || !s.g || !I.loot) return 0;
    if (a === 'loot' && s.rev !== 2) return 0;
    const g = s.g, want = amount(g, mod);
    let moved = 0;
    if (a === 'loot') {
      const take = Object.assign({}, g, { count: want });
      const left = place(take, {});
      moved = want - left;
      if (moved > 0) { g.count -= moved; if (g.count <= 0) s.g = null; if (g.type === 'Item') autoQuick(g.id); }
      if (moved > 0 && I.loot.onTake) I.loot.onTake(take, left);
    } else {
      const L = I.loot.slots;
      const dst = (g.type === 'Item' && L.find(x => x.g && G.same(x.g, g) && x.rev === 2)) || L.find(x => !x.g);
      if (dst) moved = moveTo(s, a, dst, 'loot', want);
    }
    if (moved > 0) { flash(a === 'loot' ? null : 'loot'); changed(); }
    return moved;
  };
  // Giữ tương thích: lấy ô k / lấy hết (chỉ ô đã hé lộ).
  I.take = function (k) {
    if (!I.loot) return;
    const withG = I.loot.slots.map((s, i) => i).filter(i => I.loot.slots[i].g);
    const i = withG[k];
    if (i != null) I.transfer('loot', i);
  };
  I.takeAll = function () {
    if (!I.loot) return 0;
    let n = 0;
    I.loot.slots.forEach((s, i) => { if (s.g && s.rev === 2 && I.transfer('loot', i) > 0) n++; });
    return n;
  };
  // Vứt xuống đất (RMB). Chữ gốc: phải = "Vứt bỏ tất cả", Ctrl + phải = 1, Shift + phải = nửa. Rương: CannotDropInLootInventory.
  I.discard = function (a, k, mod) {
    if (a === 'loot') { toast(TX('CannotDropInLootInventory')); return; }
    const s = slotAt(a, k);
    if (!s || !s.g) return;
    const n = amount(s.g, mod);
    const g = Object.assign({}, s.g, { count: n });
    s.g.count -= n; if (s.g.count <= 0) s.g = null;
    sfx('ItemDrop');
    if (I.onDrop) I.onDrop(g);
    changed();
  };
  I.drop = function (idx) { const all = allSlots(); const s = all[idx]; if (!s) return; if (idx < I.slots.length) I.discard('inv', idx); else I.discard('safe', idx - I.slots.length); };
  // "Sắp xếp" (R): gộp chồng cùng loại, rồi xếp theo bậc giảm dần, loại, id. Ô yêu thích lên đầu. [SUY LUẬN thứ tự]
  const GRADE_ORDER = ['Unique', 'Legend', 'Epic', 'Elite', 'Rare', 'Normal', 'None'];
  I.sort = function () {
    const plain = I.slots.filter(s => !s.bag);
    const goods = plain.filter(s => s.g).map(s => s.g);
    const merged = [];
    for (const g of goods) {
      const m = g.type === 'Item' && merged.find(x => G.same(x, g));
      if (m) m.count += g.count; else merged.push(Object.assign({}, g));
    }
    merged.sort((a, b) => (!!b.fav - !!a.fav) || (GRADE_ORDER.indexOf(G.grade(a)) - GRADE_ORDER.indexOf(G.grade(b))) || a.type.localeCompare(b.type) || a.id - b.id);
    plain.forEach((s, i) => { s.g = merged[i] || null; });
    changed();
  };
  function registerQuick(k, g) {
    const r = g && g.type === 'Item' ? G.row(g) : null;
    if (!r || !r.CanUseFromQuickSlot) { toast(TX('CannotRegisterToQuickSlot')); return; }
    const old = I.quick.indexOf(g.id); if (old >= 0) I.quick[old] = 0;
    I.quick[k] = g.id;
    sfx('ItemRelease');
    changed();
  }

  // ================================================================ giao diện
  function toast(s) { if (s && VD.dialog && VD.dialog.toast) VD.dialog.toast(s); }
  function sfx(name, o) { return VD.audio && VD.audio.sfx ? VD.audio.sfx(name, o) : null; }
  const KEY = n => `<img class="key" src="${UI}${n}.webp" alt="">`;
  const MOUSE = n => `<img class="mouse" src="${UI}img_mouse${n}click.webp" alt="">`;
  // Bảng phím InventoryKeyGuide gốc (lưới 2 cột, 265×43). Khoá chữ theo LocalizationText của prefab.
  const GUIDE = [
    { k: MOUSE('L'), t: 'SlotInsertOne' }, { k: KEY('Ctrl_Key') + '<i>+</i>' + MOUSE('L'), t: 'SlotInsertAll' },
    { k: KEY('LeftShift_Key') + '<i>+</i>' + MOUSE('L'), t: 'SlotInsertHalf' }, { k: MOUSE('R'), t: 'SlotDiscardOne' },
    { k: KEY('Ctrl_Key') + '<i>+</i>' + MOUSE('R'), t: 'SlotDiscardAll' }, { k: KEY('LeftShift_Key') + '<i>+</i>' + MOUSE('R'), t: 'SlotDiscardHalf' },
    { k: KEY('R_Key'), t: 'SlotSort' }, { k: KEY('N_Key'), t: 'SlotMarking' },
    { k: KEY('F_Key'), t: 'SlotUse' }, { k: KEY('Escape_Key') + KEY('X_Key'), t: 'UI_Close_Esc' },
  ];
  // MenuPopup.Tabs[]: 7 thẻ; trong lượt lặn chỉ thẻ Túi đồ mở (các trang khác không làm).
  const TABS = ['MenuQuest1', 'MenuInventory', 'MenuCharacter', 'MenuEncyclopedia', 'MenuSquad', 'MenuOption', 'MenuSystem'];

  function slotEl(parent, a, k) {
    const el = $('div', 'vs', parent);
    el.dataset.a = a; el.dataset.k = k;
    el.innerHTML = '<i class="lvl"></i><i class="cat"></i><i class="art"></i><img class="ic" alt="" draggable="false"><b class="n"></b><i class="fav"></i>' +
      '<i class="eye"><i class="pat"></i><i class="e3"></i><i class="e1"></i><i class="e2"></i></i><i class="lock"></i><i class="fx"></i>';
    return el;
  }
  function paintSlot(el, s, extra) {
    const g = s && s.g;
    const cls = ['vs'];
    if (!s) cls.push('locked');
    else if (!g) cls.push('empty');
    if (g) {
      cls.push('g-' + G.grade(g).toLowerCase());
      const r = G.row(g);
      if (r && r.GoodsType === 'Artifact') cls.push('artifact');
      if (g.fav) cls.push('favd');
    }
    if (s && s.rev === 0 && g) cls.push('unrev');
    if (s && s.rev === 1 && g) cls.push('reving');
    if (s && s.bag && s.bag !== 'Safe') cls.push('bagslot');
    if (extra) cls.push(extra);
    const key = I.hover && I.hover.el === el;
    if (key) cls.push('focus');
    if (I.sel && I.sel.a === el.dataset.a && +I.sel.k === +el.dataset.k) cls.push('sel');
    el.className = cls.join(' ');
    const img = el.querySelector('.ic');
    if (g && !(s.rev === 0 || s.rev === 1)) {
      const src = G.icon(g);
      if (img.dataset.src !== src) { img.src = src; img.dataset.src = src; }
      img.style.display = '';
      el.style.setProperty('--gc', G.color(g));
    } else { img.style.display = 'none'; img.removeAttribute('src'); img.dataset.src = ''; }
    const n = el.querySelector('.n');
    n.textContent = g && g.count > 1 && s.rev !== 0 && s.rev !== 1 ? g.count : '';
  }

  function build() {
    const ui = document.getElementById('ui') || document.body;
    const root = $('div', 'vd-inv', ui);
    root.innerHTML = `
      <div class="vd-inv-bg"><i class="dim"></i><i class="grad"></i></div>
      <div class="vd-inv-page">
        <div class="vd-inv-tabs">${TABS.map(t => `<div class="tab${t === 'MenuInventory' ? ' on' : ''}"><i style="--m:url(../${ICON_COMMON}${t}.webp)"></i></div>`).join('')}
          <span class="kq">${KEY('Q_Key')}</span><span class="ke">${KEY('E_Key')}</span></div>
        <section class="vd-inv-my">
          <div class="corr"><span class="cap">${TX('CorruptionValueTotal')}</span><span class="val"><i class="st"></i><b class="cur"></b><b class="max"></b></span></div>
          <div class="head"><b>${TX('Inventory')}</b><span class="cnt"></span></div>
          <div class="equip"></div>
          <div class="pager"><i class="prev"></i><span class="dots"></span><i class="next"></i></div>
          <div class="grid inv"></div>
          <div class="head safe"><b>${TX('SafeInventory')}</b></div>
          <div class="grid safe"></div>
        </section>
        <section class="vd-inv-center">
          <div class="guide">${GUIDE.map(x => `<div class="g">${x.k}<span>${TX(x.t)}</span></div>`).join('')}</div>
          <div class="quick"><div class="head"><b>${TX('UQuickSlotSettingPanel_Top_Caption')}</b><span class="hint">${TX('UQuickSlotSettingPanel_Top_GuideText')}</span></div>
            <div class="row"><div class="vs locked empty"><i class="lock"></i></div></div></div>
        </section>
        <section class="vd-inv-loot">
          <div class="head"><b>${TX('LootingInventory')}</b><span class="cnt"></span></div>
          <div class="line"></div>
          <div class="grid loot"></div>
        </section>
        <div class="vd-inv-tip"></div>
        <div class="vd-inv-drag"></div>
      </div>`;
    const q = s => root.querySelector(s);
    I.ui = {
      root, page: q('.vd-inv-page'), my: q('.vd-inv-my'), inv: q('.grid.inv'), safe: q('.grid.safe'), equip: q('.equip'),
      cnt: q('.vd-inv-my .head .cnt'), dots: q('.pager .dots'), pager: q('.pager'), corr: q('.corr'),
      quick: q('.quick .row'), lootSec: q('.vd-inv-loot'), loot: q('.grid.loot'), lootCnt: q('.vd-inv-loot .cnt'),
      tip: q('.vd-inv-tip'), drag: q('.vd-inv-drag'), guide: q('.guide'),
    };
    const pageSize = () => C('InventoryPageSlotCount', 24);
    for (let i = 0; i < pageSize(); i++) slotEl(I.ui.inv, 'inv', i);
    for (let i = 0; i < 6; i++) slotEl(I.ui.safe, 'safe', i);
    for (let i = 0; i < 6; i++) slotEl(I.ui.equip, 'equip', i);
    for (let i = 0; i < LOOT_SLOTS; i++) slotEl(I.ui.loot, 'loot', i);
    for (let i = 0; i < QUICK_PANEL; i++) { const el = slotEl(I.ui.quick, 'quick', i); $('img', 'kp', el).src = UI + (i + 1) + '_Key.webp'; }
    q('.pager .prev').onclick = () => { I.page = Math.max(0, I.page - 1); renderPanel(); };
    q('.pager .next').onclick = () => { I.page = Math.min(pages() - 1, I.page + 1); renderPanel(); };
    root.addEventListener('contextmenu', e => e.preventDefault());
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', () => endDrag(null));
    root.addEventListener('pointerover', e => { const el = e.target.closest('.vs'); if (el && el.dataset.a) setHover(el); });
    root.addEventListener('pointerout', e => { const el = e.target.closest('.vs'); if (el && I.hover && I.hover.el === el && !el.contains(e.relatedTarget)) setHover(null); });
    q('.vd-inv-bg').addEventListener('click', () => { if (!D.drag) I.toggle(false); });
    addEventListener('keydown', onKey);
    addEventListener('resize', fit);
  }
  function pages() { return Math.max(1, Math.ceil(I.slots.length / C('InventoryPageSlotCount', 24))); }

  // Khung tham chiếu 1920×1080 (CanvasScaler gốc) thu theo màn; màn thấp dùng khung gọn (css đặt --ref-w/--ref-h).
  function fit() {
    if (!I.ui) return;
    const cs = getComputedStyle(I.ui.page);
    const rw = parseFloat(cs.getPropertyValue('--ref-w')) || 1920, rh = parseFloat(cs.getPropertyValue('--ref-h')) || 1080;
    const s = Math.min(innerWidth / rw, innerHeight / rh);
    I.ui.page.style.transform = `translate(${(innerWidth - rw * s) / 2}px, ${(innerHeight - rh * s) / 2}px) scale(${s})`;
    I.ui.scale = s;
  }

  // ---------------------------------------------------------------- chuột: bấm, kéo thả (DraggingGoodsSlot), rê
  const D = { down: null, drag: null };
  const DRAG_PX = 10;           // InventoryGoodsSlotPresenter._dragThreshold
  function slotOf(el) {
    if (!el || !el.dataset.a) return null;
    const a = el.dataset.a, k = +el.dataset.k;
    if (a === 'inv') return { a, k: k + I.page * C('InventoryPageSlotCount', 24) };
    return { a, k };
  }
  function goodsOf(ref) {
    if (!ref) return null;
    if (ref.a === 'equip') { const e = equipList()[ref.k]; return e && e.g; }
    if (ref.a === 'quick') { const id = I.quick[ref.k]; return id ? { type: 'Item', id, count: I.count('Item', id) } : null; }
    const s = slotAt(ref.a, ref.k);
    return s && s.g && (ref.a !== 'loot' || s.rev === 2) ? s.g : null;
  }
  function onDown(e) {
    const el = e.target.closest('.vs');
    if (!el || !el.dataset.a) return;
    e.preventDefault();
    D.down = { el, ref: slotOf(el), x: e.clientX, y: e.clientY, btn: e.button, mod: e.ctrlKey ? 'one' : e.shiftKey ? 'half' : 'all', id: e.pointerId };
    try { I.ui.root.setPointerCapture(e.pointerId); } catch (_) { /* không bắt được con trỏ: kéo vẫn chạy trong bảng */ }
  }
  function onMove(e) {
    if (D.drag) { moveDrag(e.clientX, e.clientY); return; }
    const d = D.down;
    if (!d || d.btn !== 0) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_PX) return;
    const g = goodsOf(d.ref);
    if (!g || d.ref.a === 'equip') return;
    D.drag = { ref: d.ref, g, mod: d.mod };
    const dr = I.ui.drag;
    dr.innerHTML = ''; const de = slotEl(dr, '', 0); paintSlot(de, { g, rev: 2 });
    dr.style.display = 'block';
    tip(null);
    moveDrag(e.clientX, e.clientY);
  }
  function moveDrag(x, y) {
    const r = I.ui.page.getBoundingClientRect(), s = I.ui.scale || 1;
    I.ui.drag.style.transform = `translate(${(x - r.left) / s - 30}px, ${(y - r.top) / s - 30}px)`;
  }
  function onUp(e) {
    const d = D.down; D.down = null;
    try { I.ui.root.releasePointerCapture(e.pointerId); } catch (_) { /* đã nhả */ }
    if (D.drag) { endDrag(document.elementFromPoint(e.clientX, e.clientY)); return; }
    if (!d) return;
    const ref = d.ref;
    if (d.btn === 2) {
      if (ref.a === 'quick') { if (I.quick[ref.k]) { I.quick[ref.k] = 0; sfx('ItemRelease'); changed(); } return; }
      if (ref.a === 'equip') return;
      I.discard(ref.a, ref.k, d.mod); tip(null); return;
    }
    if (d.btn !== 0) return;
    if (ref.a === 'quick') { if (I.quick[ref.k]) { I.quick[ref.k] = 0; sfx('ItemRelease'); changed(); } return; }
    if (ref.a === 'equip') return;
    if (I.loot && goodsOf(ref)) { I.transfer(ref.a, ref.k, d.mod); refreshTip(); return; }
    // Không lục rương: bấm = chọn ô (Selected!).
    I.sel = goodsOf(ref) ? { a: d.el.dataset.a, k: d.el.dataset.k } : null;
    renderPanel();
  }
  function endDrag(target) {
    const dg = D.drag; D.drag = null;
    I.ui.drag.style.display = 'none';
    if (!dg) return;
    const el = target && target.closest && target.closest('.vs');
    const to = el && slotOf(el);
    if (!to || (to.a === dg.ref.a && to.k === dg.ref.k)) return;
    if (to.a === 'quick') { registerQuick(to.k, dg.g); return; }
    if (to.a === 'equip') return;
    const src = slotAt(dg.ref.a, dg.ref.k), dst = slotAt(to.a, to.k);
    if (!dst || (to.a === 'loot' && dst.g && dst.rev !== 2)) return;
    const n = moveTo(src, dg.ref.a, dst, to.a, amount(src.g, dg.mod));
    if (n > 0) { if (dg.ref.a === 'loot' && I.loot.onTake) I.loot.onTake(dst.g, 0); flash(to.a, el); changed(); }
  }
  function setHover(el) {
    const prev = I.hover && I.hover.el;
    I.hover = el ? { el, ref: slotOf(el) } : null;
    if (prev && prev !== el) prev.classList.remove('focus');
    if (el) el.classList.add('focus');
    refreshTip();
  }
  function refreshTip() { if (D.drag) return; const h = I.hover; tip(h ? goodsOf(h.ref) : null, h); }
  function flash(a, el) { if (el) { el.classList.remove('confirm'); void el.offsetWidth; el.classList.add('confirm'); } }

  function onKey(e) {
    if (!I.open) return;
    const code = e.code;
    if (code === 'KeyX') { e.preventDefault(); I.toggle(false); return; }
    const h = I.hover && I.hover.ref;
    const m = /^Digit([1-5])$/.exec(code);
    if (m) {
      e.preventDefault();
      const g = goodsOf(h);
      if (g && h.a !== 'quick' && h.a !== 'equip') registerQuick(+m[1] - 1, g);
      return;
    }
    if (code === 'KeyR' && !e.repeat) { e.preventDefault(); I.sort(); sfx('ButtonClick'); return; }
    if (code === 'KeyN' && !e.repeat) {
      const s = h && (h.a === 'inv' || h.a === 'safe') ? slotAt(h.a, h.k) : null;
      if (s && s.g) { s.g.fav = !s.g.fav; changed(); }
      return;
    }
    if (code === 'KeyF' && !e.repeat) {
      e.preventDefault();
      const g = goodsOf(h);
      if (g && g.type === 'Item' && (h.a === 'inv' || h.a === 'safe' || h.a === 'quick')) { I.use(g.id, 'inventory'); refreshTip(); }
    }
  }

  // ---------------------------------------------------------------- tooltip (GoodsTooltip → ItemTooltip/EquipmentTooltip)
  function tip(g, h) {
    const t = I.ui.tip;
    if (!g) { t.className = 'vd-inv-tip'; return; }
    const r = G.row(g) || {};
    const gr = G.grade(g);
    const cat = r.GoodsType === 'Weapon' || r.GoodsType === 'Accessory' || r.GoodsType === 'Artifact' ? r.GoodsType : '';
    const rows = [];
    const d = G.desc(g).replace(/<[^>]+>/g, '');
    if (g.type === 'Equipment' && r.MaxDurability > 0) rows.push([TX('UEquipmentTooltip_Durability_Caption'), (g.dur != null ? g.dur : r.MaxDurability) + ' / ' + r.MaxDurability]);
    for (const st of r.Stats || []) {
      const k = Array.isArray(st) ? st[0] : st.Type, v = Array.isArray(st) ? st[1] : st.Value;
      if (k && v != null && TX('EStatType_' + k)) rows.push([TX('EStatType_' + k), (v > 0 ? '+' : '') + v + (/Percent$/.test(k) ? '%' : '')]);
    }
    if (r.GoodsType === 'Artifact' && r.Corruption) rows.push([TX('CorruptionValue'), String(r.Corruption)]);
    t.innerHTML = `<div class="frame"><div class="title"><span class="grade" style="color:${G.color(g)}">${(TX('EGoodsGradeType_' + gr) || gr).toUpperCase()}</span>
        <b class="name">${esc(G.name(g))}</b>${cat ? `<i class="type" style="--m:url(../${UI}${cat}.webp)"></i>` : ''}${g.fav ? '<i class="mk"></i>' : ''}</div>
      ${d ? `<p class="desc">${esc(d)}</p>` : ''}
      ${rows.map(x => `<div class="row"><span>${esc(x[0])}</span><b>${esc(x[1])}</b></div>`).join('')}
      <div class="row price"><span>${TX('UItemTooltip_Price_Caption')}</span><b><img src="${ICON_COMMON}Gold.webp" alt="">${fmt(G.worth(g))}</b></div>
      ${g.type === 'Item' ? `<div class="row"><span>${TX('UItemTooltip_InventoryAmount_Caption')}</span><b>${I.count('Item', g.id)} / ${G.stackMax(g)}</b></div>` : ''}</div>`;
    // Vị trí: ô trong túi → tooltip bên phải MyInventory; ô rương → bên trái LootingInventory (anchor gốc ±55).
    const side = h && h.ref && h.ref.a === 'loot' ? 'from-loot' : 'from-my';
    t.className = 'vd-inv-tip on ' + side;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // ---------------------------------------------------------------- vẽ bảng
  function equipList() {
    const e = I.equip || {};
    const p = VD.stage && VD.stage.player;
    const out = [];
    const wid = e.weaponId || (p && p.row && p.row.DefaultWeaponId) || 0;
    out.push({ cat: 'Weapon', g: wid ? { type: 'Equipment', id: wid, count: 1 } : null });
    const ids = (e.equipmentIds || []).map(id => ({ type: 'Equipment', id: +id, count: 1 }));
    const acc = ids.filter(g => (G.row(g) || {}).GoodsType === 'Accessory');
    const art = ids.filter(g => (G.row(g) || {}).GoodsType === 'Artifact');
    for (let i = 0; i < C('CharacterAccessorySlotCount', 3); i++) out.push({ cat: 'Accessory', g: acc[i] || null });
    for (let i = 0; i < C('CharacterArtifactSlotCount', 2); i++) out.push({ cat: 'Artifact', g: art[i] || null });
    return out;
  }
  function renderPanel() {
    if (!I.ui) return;
    const u = I.ui, per = C('InventoryPageSlotCount', 24);
    if (I.page >= pages()) I.page = pages() - 1;
    [...u.inv.children].forEach((el, i) => paintSlot(el, I.slots[I.page * per + i] || null));
    [...u.safe.children].forEach((el, i) => paintSlot(el, I.safe[i] || null));
    equipList().forEach((e, i) => { const el = u.equip.children[i]; if (!el) return; paintSlot(el, { g: e.g }); el.classList.add('cat-' + e.cat.toLowerCase()); });
    [...u.quick.querySelectorAll('.vs[data-a="quick"]')].forEach((el, i) => {
      const id = I.quick[i];
      paintSlot(el, { g: id ? { type: 'Item', id, count: I.count('Item', id) } : null });
      if (id && !I.count('Item', id)) el.classList.add('none');
    });
    const n = pages();
    u.pager.classList.toggle('multi', n > 1);
    u.dots.innerHTML = Array.from({ length: n }, (_, i) => i === I.page ? `<b>${String(i + 1).padStart(2, '0')}</b>` : '<i></i>').join('');
    const used = I.slots.filter(s => s.g).length;
    u.cnt.innerHTML = `${used}<em>/${I.slots.length}</em>`;
    // Ô nhiễm: tổng / chỉ số CorruptionMax; trạng thái theo Corruption.csv trên phần vượt.
    const p = VD.stage && VD.stage.player;
    const cur = I.corruption(), max = p && VD.Stats ? Math.round(VD.Stats.get(p, 'CorruptionMax') || 0) : 0;
    let st = 'Safe';
    for (const r of (VD.T && VD.T.Corruption) || []) if (Math.max(0, cur - max) >= r.Threshold) st = r.State;
    u.corr.className = 'corr st-' + st.toLowerCase();
    u.corr.querySelector('.cur').textContent = cur;
    u.corr.querySelector('.max').textContent = '/ ' + max;
    u.lootSec.style.display = I.loot ? '' : 'none';
    u.root.classList.toggle('looting', !!I.loot);
    if (I.loot) {
      const L = I.loot.slots;
      [...u.loot.children].forEach((el, i) => paintSlot(el, L[i] || null));
      u.lootCnt.innerHTML = `${L.filter(s => s.g).length}<em>/${L.length}</em>`;
    }
    if (I.hover && !document.contains(I.hover.el)) I.hover = null;
    refreshTip();
  }
  function renderLootSlot(k, revealed) {
    if (!I.ui || !I.loot) return;
    const el = I.ui.loot.children[k];
    if (!el) return;
    if (revealed) {
      // SlotRevealingEnd 0,5 s: mắt chớp, mở to rồi tan dần trên nền hàng vừa hiện.
      paintSlot(el, I.loot.slots[k], 'reveal-end');
      clearTimeout(el._t);
      // Đóng bảng trong 0,5 s này thì I.loot đã null.
      el._t = setTimeout(() => { if (!I.loot) return; paintSlot(el, I.loot.slots[k]); if (I.hover && I.hover.el === el) refreshTip(); }, 500);
    } else paintSlot(el, I.loot.slots[k]);
    const L = I.loot.slots;
    I.ui.lootCnt.innerHTML = `${L.filter(s => s.g).length}<em>/${L.length}</em>`;
  }

  I.toggle = function (on) {
    if (!I.ui) build();
    const was = I.open;
    I.open = on == null ? !I.open : !!on;
    I.ui.root.classList.toggle('on', I.open);
    const p = VD.stage && VD.stage.player;
    if (!I.open) {
      endLooting();
      endDrag(null); D.down = null;
      I.loot = null; I.hover = null; I.sel = null; tip(null);
      // battle/search chỉ giữ khi đang lục rương (PlayAnimationByActionState gốc).
      if (p && p.drive && p.drive.loot) p.drive = null;
    } else {
      fit();
      if (!was) sfx('InventoryPopupOpen');
      if (I.loot && p && !p.dead && (!p.drive || p.drive.loot)) p.drive = { name: 'battle/search', loop: true, t0: VD.stage.A.time, offset: 0, ts: 1, loot: true };
    }
    if (VD.input) { VD.input.enabled = !I.open; VD.input.clear(); }
    if (I.open) renderPanel();
  };

  // ô đồ trên HUD (VD.hud.itemEls): icon + tổng số lượng + bóng hồi chiêu.
  function renderHud() {
    const els = VD.hud && VD.hud.itemEls;
    if (!els) return;
    els.forEach((el, k) => {
      const id = I.quick[k], img = el.querySelector('img'), n = el.querySelector('span');
      if (!id) { img.removeAttribute('src'); img.style.visibility = 'hidden'; n.textContent = ''; el.classList.add('empty'); return; }
      const src = G.icon({ type: 'Item', id });
      if (img.dataset.src !== src) { img.src = src; img.dataset.src = src; }
      img.style.visibility = '';
      const c = I.count('Item', id);
      n.textContent = c;
      el.classList.toggle('empty', c <= 0);
    });
  }
  I.renderHud = renderHud;
  I.updateHud = function () {
    const els = VD.hud && VD.hud.itemEls;
    if (!els || !VD.stage || !VD.stage.A) return;
    const now = VD.stage.A.time;
    els.forEach((el, k) => {
      const id = I.quick[k];
      const left = id ? Math.max((I.cd[id] || 0) - now, I.gcd - now) : 0;
      el.classList.toggle('cool', left > 0.05);
    });
  };

  // Mỗi khung: phím 1–5 (InputAction PlayerFunc/UseItem, BindingIndex 0–4) khi bảng đóng; hé lộ rương khi bảng mở.
  I.step = function (dt) {
    if (I.open) { revealTick(dt || 0); return; }
    const inp = VD.input;
    if (!inp || inp.enabled === false) return;
    for (let k = 0; k < 5; k++) if (inp.pressed['Item' + (k + 1)]) I.useQuick(k);
  };
  I.bindHudClicks = function () {
    const els = VD.hud && VD.hud.itemEls;
    if (!els || I._hudBound) return;
    I._hudBound = true;
    els.forEach((el, k) => { el.style.pointerEvents = 'auto'; el.addEventListener('pointerdown', e => { e.stopPropagation(); I.useQuick(k); }); });
  };

  VD.inventory = I;
})(window.VD = window.VD || {});
