// Túi đồ trong lượt lặn: mô hình hàng hoá mang theo (Item/Equipment/Bag), ô nhanh, khe an toàn, túi phụ (Bag là một món hàng
// có ô riêng — BagPanel), trang Túi đồ của MenuPopup gốc (InventoryManagementPage: MyInventory trái, KeyGuide + QuickSlotSettingPanel
// hoặc BagPanel giữa, LootingInventory phải, ví tiền góc phải trên), lục rương kiểu hé lộ từng ô (TryReveal/GetRevealTime gốc),
// tooltip Item/Equipment/Bag đầy đủ, ô đồ nhanh trên HUD, điều khiển bằng tay cầm trong trang (menu.js lo khung và thẻ).
// Số lấy từ bảng: Const.CharacterInventorySlotCount (23), InventoryPageSlotCount (24), SafeInventorySlotBaseCount (1),
// ItemCooltime (1 s), Item.InventoryCountMax, Item.Cooltime, Item.SkillId, Bag.SlotCount/Type ↔ Item/Equipment.BagType,
// Equipment.Corruption/Stats/BrokenStats/EquipmentEffectIds/EquipmentSetGroupId/ArtifactCategory, Worth, buff LootingSpeedAmplifier.
// Bố cục, sprite, màu, phím: đo từ prefab gốc (tools/ui_inventory_dump.py), xem docs/DIVE.md §11–12.
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
  const BAG_PANEL = 4;          // BagPanel/Body*/GoodsSlots[]: ItemSlot_1..4 (Bag.SlotCount tối đa 4)
  const UI = 'art/ui/inventory/';
  const ICON_COMMON = (VD.ASSETS && VD.ASSETS.icon && VD.ASSETS.icon.common && VD.ASSETS.icon.common.dir) || 'art/ui/icon_common/';
  G.revealTime = g => REVEAL_TIME[G.grade(g)] || 0.8;
  G.color = g => GRADE_COLOR[G.grade(g)] || GRADE_COLOR.Normal;

  // ================================================================ mô hình
  const I = {
    slots: [], safe: [], quick: [0, 0, 0, 0, 0, 0], cd: {}, gcd: 0, open: false, loot: null, equip: null, bagOpen: null, hold: null,
    onChange: null, onDrop: null, onUse: null, ui: null, hover: null, sel: null, page: 0,
  };

  // Túi phụ: món Bag mang ô riêng g.inner = [{ bag: Bag.Type, g }] × Bag.SlotCount (ô chỉ nhận hàng cùng BagType).
  // Nằm trong đối tượng hàng nên đi cùng món túi khi kéo, vứt, cất kho, mất khi chết.
  function mkBag(g) {
    if (!g || g.type !== 'Bag') return g;
    const r = G.row(g);
    if (!r) return g;
    const old = g.inner || [];
    g.inner = [];
    for (let i = 0; i < r.SlotCount; i++) {
      const o = old[i], og = o && (Object.prototype.hasOwnProperty.call(o, 'g') ? o.g : o);
      g.inner.push({ bag: r.Type, g: og && og.type ? G.parse(og) : null });
    }
    g.count = 1;
    return g;
  }
  function innerOf(list) { const out = []; for (const s of list) if (s.g && s.g.inner) for (const x of s.g.inner) out.push(x); return out; }
  function allSlots() { return I.slots.concat(I.safe, innerOf(I.slots), innerOf(I.safe)); }
  function carriedBag(type) {
    for (const s of I.slots.concat(I.safe)) if (s.g && s.g.type === 'Bag') { const r = G.row(s.g); if (r && r.Type === type) return s.g; }
    return null;
  }

  I.reset = function (opts) {
    opts = opts || {};
    // opts.pack (sảnh): đặt nguyên từng món hồ sơ vào từng ô — qua I.add thì chồng vượt InventoryCountMax bị cắt mất khi ghi lại.
    const n = Math.max(opts.slots || C('CharacterInventorySlotCount', 23), (opts.pack || []).length);
    I.lounge = !!opts.lounge;
    I.onClose = opts.onClose || null;
    I.slots = [];
    for (let i = 0; i < n; i++) I.slots.push({ bag: null, g: null });
    I.safe = new Array(C('SafeInventorySlotBaseCount', 1)).fill(null).map(() => ({ bag: 'Safe', g: null }));
    I.quick = (opts.quick || [0, 0, 0, 0, 0, 0]).slice(0, 6);
    while (I.quick.length < 6) I.quick.push(0);
    I.equip = opts.equip || null;
    I.gear = mkGear(I.equip);
    I._skinDirty = true;
    I.cd = {}; I.gcd = 0; I.loot = null; I.page = 0; I.sel = null; I.bagOpen = null; I.hold = null;
    // opts.bags (Bag.Id) cũ: thành món Bag trong túi.
    for (const id of opts.bags || []) I.add({ type: 'Bag', id: +id, count: 1 }, { silent: true });
    for (const g of opts.goods || []) I.add(G.parse(g), { silent: true });
    (opts.pack || []).forEach((g, i) => { I.slots[i].g = mkBag(G.parse(g)); });
    for (const g of opts.safe || []) { const s = I.safe.find(x => !x.g); if (s) s.g = mkBag(G.parse(g)); }
    changed();
  };

  function changed() { if (I.onChange) I.onChange(); renderHud(); if (I.open) renderPanel(); }

  // Thêm hàng; trả số lượng không vừa (0 = vào hết). opts.silent: không toast.
  I.add = function (g, opts) {
    g = G.parse(g);
    if (!g || !(g.count > 0)) return 0;
    if (g.type === 'Gold') { if (VD.profile) VD.profile.giveGold(g.count); return 0; }
    if (g.type === 'Coin') { if (VD.profile) VD.profile.giveCoin(g.count); return 0; }
    const left = place(g, opts);
    if (left < g.count && g.type === 'Item') autoQuick(g.id);
    if (left < g.count) record(g);
    changed();
    return left;
  };
  // Đặt hàng vào túi (không gọi changed); trả phần không vừa.
  function place(g, opts) {
    let left = g.count;
    const quiet = opts && opts.silent;
    if (g.type === 'Item') {
      // Item.InventoryCountMax là trần tổng của một loại trong túi (PickUpItemMaxCount: "chỉ nhận được một phần").
      const room = Math.max(0, G.stackMax(g) - I.count('Item', g.id));
      const put = Math.min(room, left);
      // PlayerInventory.PushGoods: chồng vào chồng sẵn có trong túi phụ trước (StackIntoExistingBags), phần còn lại vào túi. [ĐO]
      const same = innerOf(I.slots.concat(I.safe)).find(s => s.g && G.same(s.g, g)) || I.slots.concat(I.safe).find(s => s.g && G.same(s.g, g));
      if (same) { same.g.count += put; left -= put; }
      else if (put > 0) {
        const s = freeSlot();
        if (s) { s.g = { type: 'Item', id: g.id, count: put, isNew: g.isNew }; left -= put; }
      }
      if (left > 0 && room < g.count && !quiet) toast(TX('PickUpItemMaxCount'));
      else if (left > 0 && !quiet) toast(TX('NotEnoughInventorySlots') || TX('InventoryFull'));
    } else if (g.type === 'Bag') {
      // "Chỉ có thể mang một túi cùng loại trong kho đồ" (TBag_Desc_*) — CannotCarrySameBagType.
      const r = G.row(g);
      if (r && carriedBag(r.Type)) { if (!quiet) toast(TX('CannotCarrySameBagType')); return left; }
      const s = freeSlot();
      if (s) { s.g = mkBag(Object.assign({}, g, { count: 1 })); left--; }
      if (left > 0 && !quiet && s) toast(TX('CannotCarrySameBagType'));
      else if (left > 0 && !quiet) toast(TX('NotEnoughInventorySlots') || TX('InventoryFull'));
    } else {
      while (left > 0) {
        const s = freeSlot();
        if (!s) break;
        s.g = Object.assign({}, g, { count: 1 });
        left--;
      }
      if (left > 0 && !quiet) toast(TX('NotEnoughInventorySlots') || TX('InventoryFull'));
    }
    return left;
  }
  // Ô trống của túi; ô trống trong túi phụ không tự nhận hàng (chỉ chồng vào chồng sẵn có) [SUY LUẬN từ tên hàm StackIntoExistingBagSlots].
  function freeSlot() { return I.slots.find(s => !s.g) || null; }
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
      if (s.g.count <= 0) { if (s.g === I.bagOpen) I.bagOpen = null; s.g = null; }
    }
    changed();
    return (n == null ? 1 : n) - left;
  };
  I.emptySlots = () => I.slots.filter(s => !s.g).length;
  // Hàng lớp ngoài (túi + khe an toàn); món Bag mang theo đồ bên trong nó (g.inner).
  I.goods = () => I.slots.concat(I.safe).filter(s => s.g).map(s => s.g);
  I.allGoods = () => allSlots().filter(s => s.g).map(s => s.g);
  I.worth = () => I.allGoods().reduce((a, g) => a + G.worth(g), 0);
  // Tổng ô nhiễm cổ vật đang mang (Equipment.Corruption của hàng GoodsType Artifact), tính cả trong túi cổ vật.
  I.corruption = () => I.allGoods().reduce((a, g) => {
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

  // ================================================================ hồ sơ khám phá (trang Archive)
  // Bản gốc lưu IsNewArchiveItem/Equipment/Monster ở dữ liệu người chơi; web ghi vào localStorage riêng. Món lần đầu có
  // trong hồ sơ mang cờ isNew (thẻ NEW trong tooltip, tắt khi rê chuột qua).
  const ARCH_KEY = 'voiddiver.archive.v1';
  let ARCH = null;
  I.archive = function () {
    if (!ARCH) { try { ARCH = JSON.parse(localStorage.getItem(ARCH_KEY)) || {}; } catch (e) { ARCH = {}; } }
    for (const k of ['Item', 'Equipment', 'Bag', 'Monster']) ARCH[k] = ARCH[k] || {};
    return ARCH;
  };
  function saveArch() { try { localStorage.setItem(ARCH_KEY, JSON.stringify(ARCH)); } catch (e) { /* bộ nhớ trình duyệt bị chặn */ } }
  function record(g) {
    const a = I.archive();
    if (!a[g.type] || a[g.type][g.id]) return;
    a[g.type][g.id] = 1;
    g.isNew = true;
    const s = allSlots().find(x => x.g && G.same(x.g, g));
    if (s) s.g.isNew = true;
    saveArch();
  }
  I.recordArchive = function () {
    const a = I.archive();
    let dirty = false;
    for (const g of I.allGoods()) if (a[g.type] && !a[g.type][g.id]) { a[g.type][g.id] = 1; dirty = true; }
    const D = VD.dive;
    for (const m of (D && D.mons) || []) if (m.dead && m.id && !a.Monster[m.id]) { a.Monster[m.id] = 1; dirty = true; }
    if (dirty) saveArch();
  };

  // ================================================================ dùng đồ
  // Item.SkillId chạy qua lõi combat (Skill.start force). Hồi chiêu: Item.Cooltime riêng + Const.ItemCooltime chung.
  I.use = function (id, from) {
    const r = index().Item.get(+id);
    const p = VD.stage && VD.stage.player;
    if (!r || !p || p.dead) return false;
    if (I.lounge) { toast(TX('CannotUseInLounge')); return false; }
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
  // "Dùng" (F / X tay cầm) lên một món: Item thì dùng, Bag thì mở/đóng BagPanel ("Sử dụng vật phẩm để xem bên trong túi").
  function useRef(ref) {
    const g = goodsOf(ref);
    if (!g) return;
    if (g.type === 'Bag' && (ref.a === 'inv' || ref.a === 'safe')) { I.openBag(I.bagOpen === g ? null : g); return; }
    // OnUseButtonClick: ô trang bị → UnequipToInventorySlot; trang bị ở túi / khe an toàn → EquipInventorySlot / EquipSafeSlot.
    if (ref.a === 'equip') { I.unequip(ref.k); refreshTip(); return; }
    if (g.type === 'Equipment' && (ref.a === 'inv' || ref.a === 'safe')) { I.equipFrom(ref.a, ref.k); refreshTip(); return; }
    if (g.type === 'Equipment') { toast(TX('SelectItemInInventory')); return; }
    if (g.type === 'Item' && (ref.a === 'inv' || ref.a === 'safe' || ref.a === 'quick' || ref.a === 'bag')) { I.use(g.id, 'inventory'); refreshTip(); }
  }
  I.openBag = function (g) {
    I.bagOpen = g && g.inner ? g : null;
    sfx(I.bagOpen ? 'PopUpOpen' : 'ButtonClick');
    renderPanel();
  };

  // ================================================================ trang bị trong lượt lặn (EquipmentInventoryPanel) [ĐO — GameAssembly]
  // Character gốc: WeaponSlots[2] + ActiveWeaponIndex, AccessorySlots[3], ArtifactSlots[2]; mỗi ô giữ một món hàng (có độ bền).
  // Bảng (InventoryManagementPagePresenter):
  // - Kéo món ở túi/khe an toàn/rương vào ô trang bị, hoặc F lên món đó (OnUseButtonClick → EquipInventorySlot/EquipSafeSlot):
  //   CheckEquipable — sai loại ô → NotEquipableEquipmentType; vũ khí khác TCharacter.WeaponType → NotEquipableWeaponType;
  //   trùng Equipment.EquipPartGroup với món đang đeo ở ô khác → DuplicateEquipPartGroup. Món cũ về đúng ô nguồn
  //   (CharacterController.OnEquipInventorySlot). Tiếng PlayEquipSound: "Equip", ô cổ vật "Equip2".
  // - F: không chỉ ô đích thì CharacterController.Equip chọn ô: vũ khí → ô đang cầm (ActiveWeaponIndex); phụ kiện/cổ vật → ô
  //   trống đầu tiên, hết ô trống thì ô 0 [SUY LUẬN: nhánh FirstOrDefault thứ hai chưa đọc].
  // - Bấm trái/phải/F lên ô trang bị = UnequipToInventorySlot: cần ô túi trống (NotEnoughInventorySlots), tiếng ItemRelease.
  //   Vũ khí cũng tháo được (CharacterController.Unequip không chặn; khoá CannotUnequipWeapon không có chỗ gọi trong bản demo).
  // - Kéo ô trang bị sang ô trang bị cùng loại = đổi chỗ (HandleSwapEquipmentSlots), khác loại → EquipementSlotTypeMismatch.
  //   Kéo ô trang bị ra túi/khe an toàn/rương = tháo vào đúng ô đó.
  // - V (SwapWeapon, ReqSwapWeapon AllowEmpty=false): đổi ActiveWeaponIndex khi ô kia có vũ khí; trong bảng thì không khi đang kéo.
  // Đổi xong: chỉ số tính lại (Stats.base với vũ khí đang cầm + phụ kiện + cổ vật), da vũ khí Spine đổi theo
  // Extensions.UpdateCharacterSkin ("weapon/" + Equipment.WeaponSkinName, không vũ khí = "weapon/dummy"), ô vũ khí HUD vẽ lại.
  const GEAR_CAT = ['Weapon', 'Accessory', 'Accessory', 'Accessory', 'Artifact', 'Artifact', 'Weapon'];
  const eqGoods = id => (id ? { type: 'Equipment', id: +id, count: 1 } : null);
  function mkGear(eq) {
    eq = eq || {};
    const p = VD.stage && VD.stage.player;
    const wid = eq.weaponId != null ? eq.weaponId : (p && p.row && p.row.DefaultWeaponId) || 0;
    const ids = (eq.equipmentIds || []).map(eqGoods).filter(Boolean);
    const of = t => ids.filter(g => (G.row(g) || {}).GoodsType === t);
    const acc = of('Accessory'), art = of('Artifact');
    const pad = (a, n) => { const o = []; for (let i = 0; i < n; i++) o.push(a[i] || null); return o; };
    return { weapon: [eqGoods(wid), eqGoods(eq.subWeaponId)], active: 0, acc: pad(acc, C('CharacterAccessorySlotCount', 3)), art: pad(art, C('CharacterArtifactSlotCount', 2)) };
  }
  // Ô trang bị k của bảng: 0 = vũ khí đang cầm, 1–3 phụ kiện, 4–5 cổ vật, 6 = vũ khí phụ (SubWeapon_).
  function gearSlot(k) {
    const G_ = I.gear;
    if (!G_) return null;
    k = +k;
    if (k === 0) return { cat: 'Weapon', arr: G_.weapon, i: G_.active };
    if (k === 6) return { cat: 'Weapon', arr: G_.weapon, i: 1 - G_.active };
    if (k >= 1 && k <= 3) return { cat: 'Accessory', arr: G_.acc, i: k - 1 };
    if (k >= 4 && k <= 5) return { cat: 'Artifact', arr: G_.art, i: k - 4 };
    return null;
  }
  const catOf = g => { const r = g && g.type === 'Equipment' ? G.row(g) : null; return r ? r.GoodsType : null; };
  function equipErr(g, gs) {
    const r = G.row(g);
    if (!r || catOf(g) !== gs.cat) return 'NotEquipableEquipmentType';
    const p = VD.stage && VD.stage.player;
    if (gs.cat === 'Weapon' && p && r.WeaponType !== p.row.WeaponType) return 'NotEquipableWeaponType';
    if (r.EquipPartGroup > 0) {
      const G_ = I.gear;
      const dup = [G_.weapon, G_.acc, G_.art].some(arr => arr.some((x, i) =>
        x && !(arr === gs.arr && i === gs.i) && (G.row(x) || {}).EquipPartGroup === r.EquipPartGroup));
      if (dup) return 'DuplicateEquipPartGroup';
    }
    return '';
  }
  // Ô đích mặc định khi F (không kéo vào ô cụ thể).
  function defaultGearK(cat) {
    if (cat === 'Weapon') return 0;
    const G_ = I.gear, arr = cat === 'Accessory' ? G_.acc : G_.art, base = cat === 'Accessory' ? 1 : 4;
    const i = arr.findIndex(x => !x);
    return base + (i < 0 ? 0 : i);
  }
  // Trang bị món ở ô (a, k) vào ô trang bị gk (bỏ trống = ô mặc định). Món đang đeo về đúng ô nguồn.
  I.equipFrom = function (a, k, gk) {
    const s = slotAt(a, k);
    if (!s || !s.g || (a === 'loot' && s.rev !== 2)) return false;
    const g = s.g, cat = catOf(g);
    if (!cat || (cat !== 'Weapon' && cat !== 'Accessory' && cat !== 'Artifact')) { toast(TX('NotEquipableEquipmentType')); return false; }
    const gs = gearSlot(gk != null ? gk : defaultGearK(cat));
    if (!gs) return false;
    const err = equipErr(g, gs);
    if (err) { toast(TX(err)); return false; }
    const old = gs.arr[gs.i];
    if (old && !canHold(s, old)) { toast(TX(holdErr(s, old))); return false; }
    if (g === I.bagOpen) I.bagOpen = null;
    gs.arr[gs.i] = g;           // trang bị không chồng (G.stackMax = 1)
    s.g = old || null;
    if (a === 'loot') { s.rev = 2; if (I.loot && I.loot.onTake) I.loot.onTake(gs.arr[gs.i], 0); }
    if (!isOwn(a)) record(g);
    sfx(gs.cat === 'Artifact' ? 'Equip2' : 'Equip');
    applyGear();
    changed();
    return true;
  };
  // Tháo ô trang bị gk vào ô (a, k) nếu có, không thì ô túi trống đầu tiên.
  I.unequip = function (gk, a, k) {
    const gs = gearSlot(gk);
    const g = gs && gs.arr[gs.i];
    if (!g) return false;
    let dst = a ? slotAt(a, k) : freeSlot();
    if (a && dst && dst.g) {
      // Thả lên món cùng loại: đổi chỗ (trang bị món ở ô đích vào ô này).
      if (catOf(dst.g) === gs.cat) return I.equipFrom(a, k, gk);
      dst = null;
    }
    if (!dst || (a === 'loot' && !I.loot)) { toast(TX('NotEnoughInventorySlots')); return false; }
    if (!canHold(dst, g)) { toast(TX(holdErr(dst, g))); return false; }
    dst.g = g;
    if (a === 'loot') dst.rev = 2;
    gs.arr[gs.i] = null;
    sfx('ItemRelease');
    applyGear();
    changed();
    return true;
  };
  // Bấm ô trang bị: túi phụ đang mở thì TransferEquipmentSlotToBagSlot (ô trống đầu tiên nhận được), không thì tháo vào túi.
  function unequipClick(gk) {
    const bag = I.bagOpen;
    if (bag) {
      const gs = gearSlot(gk), g = gs && gs.arr[gs.i];
      const k = g ? bag.inner.findIndex(s => !s.g && canHold(s, g)) : -1;
      if (g && k < 0) { toast(TX(holdErr(bag.inner[0] || {}, g) || 'NotEnoughInventorySlots')); return false; }
      return I.unequip(gk, 'bag', k);
    }
    return I.unequip(gk);
  }
  // Kéo ô trang bị sang ô trang bị khác (ReqSwapEquipmentSlots).
  I.swapGear = function (k1, k2) {
    const a = gearSlot(k1), b = gearSlot(k2);
    if (!a || !b || (a.arr === b.arr && a.i === b.i)) return false;
    if (a.cat !== b.cat) { toast(TX('EquipementSlotTypeMismatch')); return false; }
    const t = a.arr[a.i]; a.arr[a.i] = b.arr[b.i]; b.arr[b.i] = t;
    sfx(a.cat === 'Artifact' ? 'Equip2' : 'Equip');
    applyGear();
    changed();
    return true;
  };
  // V: đổi vũ khí đang cầm (AllowEmpty = false: ô kia trống thì thôi).
  I.swapWeapon = function () {
    const G_ = I.gear, p = VD.stage && VD.stage.player;
    if (!G_ || !G_.weapon[1 - G_.active] || (p && p.dead)) return false;
    G_.active = 1 - G_.active;
    applyGear();
    changed();
    if (VD.hud && VD.hud.itemEls && I._hudW) { I._hudW.classList.remove('swapped'); void I._hudW.offsetWidth; I._hudW.classList.add('swapped'); }
    return true;
  };
  I.weapon = () => (I.gear ? I.gear.weapon[I.gear.active] : null);
  I.subWeapon = () => (I.gear ? I.gear.weapon[1 - I.gear.active] : null);
  // Loadout theo dạng hồ sơ (profile.equip[char] = { weapon, acc, art }).
  I.gearIds = function () {
    const G_ = I.gear || { weapon: [], acc: [], art: [] }, id = g => (g ? +g.id : 0);
    return { weapon: id(G_.weapon[G_.active]), sub: id(G_.weapon[1 - G_.active]), acc: G_.acc.map(id), art: G_.art.map(id) };
  };
  function applyGear() {
    const p = VD.stage && VD.stage.player;
    const G_ = I.gear;
    if (!G_) return;
    const w = G_.weapon[G_.active];
    const ids = G_.acc.concat(G_.art).filter(Boolean).map(g => +g.id);
    I.equip = Object.assign({}, I.equip, { weaponId: w ? +w.id : 0, equipmentIds: ids });
    if (!p || p.kind !== 'char') return;
    const sb = VD.Stats.base(VD.combatDB(), 'char', p.row, { weaponId: w ? +w.id : 0, weaponBroken: !!(w && w.dur === 0), equipmentIds: ids });
    p.base = sb.base; p.baseFlat = sb.flat;
    VD.Stats.compute(p);
    if (p.hp > p.stats.HpMax) p.hp = p.stats.HpMax;
    if (p.stamina > p.stats.StaminaMax) p.stamina = p.stats.StaminaMax;
    I._skinDirty = true;
    weaponSkin();
    renderHudWeapon();
  }
  I.applyGear = applyGear;
  // Extensions.UpdateCharacterSkin: phần "weapon/…" của skin ghép theo vũ khí đang cầm. Hình nạp bất đồng bộ nên thử lại mỗi khung.
  function weaponSkin() {
    const p = VD.stage && VD.stage.player, G_ = I.gear;
    const v = p && VD.stage.vis && VD.stage.vis.get(p.uid);
    if (!v || !G_ || !window.spine) return;
    I._skinDirty = false;
    const w = G_.weapon[G_.active], r = w && G.row(w);
    const a = VD.ASSETS && VD.ASSETS.units && VD.ASSETS.units[p.id];
    const names = ((a && a.skins) || []).filter(n => !/^weapon\//.test(n)).concat('weapon/' + (r && r.WeaponSkinName ? r.WeaponSkinName : 'dummy'));
    for (const key in v.meshes) {
      const m = v.meshes[key], d = m.skeleton.data;
      const parts = names.map(n => d.findSkin(n)).filter(Boolean);
      if (!parts.length) continue;
      const skin = new window.spine.Skin('unit');
      for (const s of parts) skin.addSkin(s);
      m.skeleton.setSkin(skin);
      m.skeleton.setSlotsToSetupPose();
    }
    I.skinNames = names;
  }

  // ================================================================ lục rương (LootingInventory)
  // Rương giữ kho 30 ô trên thực thể (source.lootInv) nên đóng/mở lại vẫn còn trạng thái hé lộ.
  // Mỗi ô: { g, rev: 0 chưa hé lộ | 1 đang hé lộ | 2 đã hé lộ, t, dur }.
  function mkLoot(items, n, shown) {
    const slots = [];
    for (let i = 0; i < Math.max(n || LOOT_SLOTS, (items || []).length); i++) {
      const g = items && items[i] ? mkBag(G.parse(items[i])) : null;
      slots.push({ g, rev: g && !shown ? 0 : 2, t: 0, dur: 0 });
    }
    return { slots };
  }
  // loot = { title, items:[goods], source } → mở trang Túi đồ kèm cột "Kết quả Tìm kiếm".
  // loot.stash (sảnh): cột phải là kho — bố cục InventoryStash gốc (MenuPopup IsInLounge), loot.slots ô, hiện sẵn, không lục.
  I.openLoot = function (loot) {
    const src = loot.source;
    const inv = src ? (src.lootInv || (src.lootInv = mkLoot(loot.items))) : mkLoot(loot.items, loot.slots, loot.stash);
    inv.title = loot.title; inv.source = src || null; inv.onTake = loot.onTake || null; inv.search = !loot.stash && loot.search !== false;
    inv.stash = !!loot.stash;
    // items: hàng còn trong rương (đọc được từ bài kiểm và mã cũ).
    if (!Object.getOwnPropertyDescriptor(inv, 'items')) Object.defineProperty(inv, 'items', { get() { return inv.slots.filter(s => s.g).map(s => s.g); } });
    I.loot = inv;
    I.toggle(true, 'Inventory');
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
  function areaSlots(a) { return a === 'inv' ? I.slots : a === 'safe' ? I.safe : a === 'loot' ? (I.loot ? I.loot.slots : []) : a === 'bag' ? (I.bagOpen ? I.bagOpen.inner : []) : null; }
  function slotAt(a, k) { const arr = areaSlots(a); return arr ? arr[k] || null : null; }
  function isInner(s) { return !!(s && s.bag && s.bag !== 'Safe'); }
  // Ô túi phụ: không nhận túi (CannotPutBagInBag), chỉ nhận hàng cùng BagType (GoodsNotAllowedInBag).
  function holdErr(s, g) {
    if (!isInner(s)) return '';
    if (g.type === 'Bag') return 'CannotPutBagInBag';
    return G.bagType(g) === s.bag ? '' : 'GoodsNotAllowedInBag';
  }
  function canHold(s, g) { return !holdErr(s, g); }
  function amount(g, mod) { return mod === 'one' ? 1 : mod === 'half' ? Math.max(1, Math.ceil(g.count / 2)) : g.count; }
  function isOwn(a) { return a === 'inv' || a === 'safe' || a === 'bag'; }
  // Chuyển n món từ ô src sang ô dst (cùng hoặc khác khu). Trả số món đã chuyển.
  function moveTo(src, sa, dst, da, n) {
    if (!src || !dst || src === dst || !src.g) return 0;
    const g = src.g;
    n = Math.min(n, g.count);
    const err = holdErr(dst, g);
    if (err) { toast(TX(err)); return 0; }
    if (g.type === 'Bag' && isOwn(da) && !isOwn(sa)) {
      const r = G.row(g), have = r && carriedBag(r.Type);
      if (have && have !== dst.g) { toast(TX('SameBagAlreadyOwned')); return 0; }
    }
    // Item vào túi mình: trần tổng InventoryCountMax (không tính phần đang nằm trong túi sẵn).
    if (g.type === 'Item' && isOwn(da) && !isOwn(sa)) n = Math.min(n, Math.max(0, G.stackMax(g) - I.count('Item', g.id)));
    if (n <= 0) { toast(TX('PickUpItemMaxCount')); return 0; }
    if (!dst.g) {
      dst.g = Object.assign({}, g, { count: n });
      g.count -= n; if (g.count <= 0) src.g = null;
      if (g === I.bagOpen && !src.g) I.bagOpen = da === 'loot' ? null : dst.g;
      if (da === 'loot') { dst.rev = 2; dst.t = 0; }
      if (isOwn(da) && !isOwn(sa)) record(dst.g);
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
    if (I.bagOpen && (da === 'loot' && dst.g === I.bagOpen || sa === 'loot' && src.g === I.bagOpen)) I.bagOpen = null;
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
      if (moved > 0) { g.count -= moved; if (g.count <= 0) s.g = null; if (g.type === 'Item') autoQuick(g.id); record(g); }
      if (moved > 0 && I.loot.onTake) I.loot.onTake(take, left);
    } else {
      const L = I.loot.slots;
      const dst = (g.type === 'Item' && L.find(x => x.g && G.same(x.g, g) && x.rev === 2)) || L.find(x => !x.g);
      if (dst) moved = moveTo(s, a, dst, 'loot', want);
      if (moved > 0 && g === I.bagOpen && !s.g) I.bagOpen = null;
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
    // OnDropGoods gốc theo SlotCategory: Looting → CannotDropInLootInventory, Warehouse (kho) → CannotDropWarehouseItem.
    if (a === 'loot') { toast(TX(I.loot && I.loot.stash ? 'CannotDropWarehouseItem' : 'CannotDropInLootInventory')); return; }
    const s = slotAt(a, k);
    if (!s || !s.g) return;
    // Sảnh web không có hàng rơi dưới sàn (DropInventoryGoods gốc) nên vứt ở đây sẽ mất đồ: không cho vứt. [CHƯA RÕ]
    if (I.lounge) { sfx('Fail'); return; }
    const n = amount(s.g, mod);
    const g = Object.assign({}, s.g, { count: n });
    if (s.g === I.bagOpen) I.bagOpen = null;
    s.g.count -= n; if (s.g.count <= 0) s.g = null;
    sfx('ItemDrop');
    if (I.onDrop) I.onDrop(g);
    changed();
  };
  I.drop = function (idx) { const all = I.slots.concat(I.safe); const s = all[idx]; if (!s) return; if (idx < I.slots.length) I.discard('inv', idx); else I.discard('safe', idx - I.slots.length); };
  // "Sắp xếp" (R / RS bấm) — InventoryExtensions.Organize gốc: OrderBy(ô rỗng sau) → ThenBy(EGoodsType tăng) → ThenByDescending(bậc)
  // → ThenBy(Id); sắp xếp ổn định, KHÔNG gộp chồng. Chỉ sắp khu của ô đang chọn: túi (ReqOrganizeInventorySlots) hoặc khe an toàn
  // (ReqOrganizeInventorySafeSlots); ô túi phụ, rương, trang bị, ô nhanh thì không làm gì; không có ô chọn thì không làm gì. [ĐO]
  const GOODS_TYPE = ['None', 'Gold', 'Coin', 'Exp', 'Consumable', 'Valuable', 'Misc', 'Note', 'Blueprint', 'MusicDisc', 'Weapon', 'Accessory', 'Artifact', 'Bag'];
  const GRADE_RANK = ['None', 'Normal', 'Rare', 'Elite', 'Epic', 'Legend', 'Unique'];
  const typeRank = g => { const t = g.type === 'Bag' ? 'Bag' : (G.row(g) || {}).GoodsType; const i = GOODS_TYPE.indexOf(t); return i < 0 ? 0 : i; };
  const gradeRank = g => { const r = G.row(g); const i = GRADE_RANK.indexOf((r && r.Grade) || 'None'); return i < 0 ? 0 : i; };
  I.sortCompare = (a, b) => (!a - !b) || (!a ? 0 : (typeRank(a) - typeRank(b)) || (gradeRank(b) - gradeRank(a)) || (a.id - b.id));
  I.sort = function (area) {
    const arr = area === 'safe' ? I.safe : area === 'inv' || area == null ? I.slots : null;
    if (!arr) return false;
    const goods = arr.map(s => s.g).sort(I.sortCompare);   // Array.prototype.sort ổn định (ES2019) như LINQ OrderBy
    arr.forEach((s, i) => { s.g = goods[i] || null; });
    changed();
    return true;
  };
  // R / RS: khu của ô đang rê chuột, đang chọn (Selected!) hoặc đang được tay cầm chọn.
  function sortHere(ref) {
    const a = ref ? ref.a : I.sel ? I.sel.a : null;
    if (D.drag || !a) return;
    if (I.sort(a)) sfx('ButtonClick');
  }
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
  const PK = n => (VD.menu ? VD.menu.padImg(n) : `<img class="key p" src="${UI}${n}.webp" alt="">`);
  // Bảng phím InventoryKeyGuide gốc (lưới 2 cột, 265×43). Khoá chữ theo LocalizationText của prefab; hình tay cầm theo UI/UiPad map.
  // Hàng "nửa" chỉ có ở bàn phím (UiKeyboard/InventorySelectHalf); hàng A "Chọn" (UiPad/DragAndDrop) chỉ có ở tay cầm.
  const GUIDE = [
    { k: MOUSE('L'), p: PK('XBox_Y'), t: 'SlotInsertOne' }, { k: KEY('Ctrl_Key') + '<i>+</i>' + MOUSE('L'), p: PK('XBox_LB') + '<i>+</i>' + PK('XBox_Y'), t: 'SlotInsertAll' },
    { k: KEY('LeftShift_Key') + '<i>+</i>' + MOUSE('L'), t: 'SlotInsertHalf', only: 'kb' }, { k: MOUSE('R'), p: PK('XBox_RB'), t: 'SlotDiscardOne' },
    { k: KEY('Ctrl_Key') + '<i>+</i>' + MOUSE('R'), p: PK('XBox_LB') + '<i>+</i>' + PK('XBox_RB'), t: 'SlotDiscardAll' }, { k: KEY('LeftShift_Key') + '<i>+</i>' + MOUSE('R'), t: 'SlotDiscardHalf', only: 'kb' },
    { k: KEY('R_Key'), p: PK('XBox_Right_Stick_Click'), t: 'SlotSort' }, { k: KEY('N_Key'), p: PK('XBox_View'), t: 'SlotMarking' },
    { k: KEY('F_Key'), p: PK('XBox_X'), t: 'SlotUse' }, { k: KEY('Escape_Key') + KEY('X_Key'), p: PK('XBox_B'), t: 'UI_Close_Esc' },
    { p: PK('XBox_A'), t: 'Select', only: 'pad' },
  ];
  const guideRow = x => `<div class="g${x.only ? ' only-' + x.only : ''}"><i class="kk">${x.k || ''}</i><i class="kp">${x.p || ''}</i><span>${TX(x.t)}</span></div>`;

  function slotEl(parent, a, k) {
    const el = $('div', 'vs', parent);
    el.dataset.a = a; el.dataset.k = k;
    el.innerHTML = '<i class="lvl"></i><i class="cat"></i><i class="art"></i><img class="ic" alt="" draggable="false"><b class="n"></b><i class="fav"></i>' +
      '<i class="eye"><i class="pat"></i><i class="e3"></i><i class="e1"></i><i class="e2"></i></i><i class="lock"></i><i class="fx"></i><i class="hl"><i class="gw"></i><i class="ln"></i></i>';
    return el;
  }
  // Highlight (Glow rectangle_line_glow #A45646 cộng màu + Line trắng, DOTween Fade 0,6 yoyo 1 s). Gốc (RxHighlightOn): mọi ô của túi phụ
  // đang mở sáng khi món đang kéo không phải túi và Goods.PushableBagType == Bag.Type (RxIsDragAcceptable); ô trang bị sáng khi kéo
  // trang bị cùng loại (web: cả khi kéo bằng chuột lẫn tay cầm A). [ĐO — ui_inventory_il2cpp.py]
  function glowOn(s, a, k) {
    const h = I.hold;
    if (h && h.g && a === 'equip') return catOf(h.g) === GEAR_CAT[+k] && !(h.ref.a === 'equip' && +h.ref.k === +k);
    if (!h || !h.g || !s || a !== 'bag' || !I.bagOpen) return false;
    return h.g.type !== 'Bag' && G.bagType(h.g) === s.bag;
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
      if (g === I.bagOpen) cls.push('bagopen');
    }
    if (s && s.rev === 0 && g) cls.push('unrev');
    if (s && s.rev === 1 && g) cls.push('reving');
    if (isInner(s)) cls.push('bagslot');
    if (s && glowOn(s, el.dataset.a, el.dataset.k)) cls.push('glow');
    if (I.hold && s && s === slotAt(I.hold.ref.a, I.hold.ref.k)) cls.push('holding');
    if (extra) cls.push(extra);
    const key = I.hover && I.hover.el === el;
    if (key) cls.push('focus');
    if (el.classList.contains('pad-focus')) cls.push('pad-focus');
    if (I.sel && I.sel.a === el.dataset.a && +I.sel.k === +el.dataset.k) cls.push('sel');
    for (const c of el.classList) if (/^(s60|s90|cat-)/.test(c)) cls.push(c);
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
  I.slotEl = slotEl;
  I.paintSlot = paintSlot;

  function build() {
    const ui = document.getElementById('ui') || document.body;
    const root = $('div', 'vd-inv', ui);
    root.innerHTML = `
      <div class="vd-inv-bg"><i class="dim"></i><i class="grad"></i></div>
      <div class="vd-inv-page">
        <div class="vd-inv-tabs"></div>
        <div class="vd-mp mp-inventory">
        <div class="vd-inv-cur"><div class="row coin"><span class="cap">${TX('OwnedCoin')}</span><img src="${UI}Coin.webp" alt=""><b></b></div>
          <div class="row gold"><span class="cap">${TX('OwnedCurrency')}</span><img src="${UI}Gold.webp" alt=""><b></b></div></div>
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
          <div class="guide">${GUIDE.map(guideRow).join('')}</div>
          <div class="quick"><div class="head"><b>${TX('UQuickSlotSettingPanel_Top_Caption')}</b><span class="hint">${TX('UQuickSlotSettingPanel_Top_GuideText')}</span></div>
            <div class="row"><div class="vs locked empty"><i class="lock"></i></div></div></div>
          <div class="vd-inv-bag"><i class="shade"></i><i class="frame"></i><div class="head"><b class="bn"></b><span class="cnt"></span></div><div class="row"></div></div>
        </section>
        <section class="vd-inv-loot">
          <div class="head"><b>${TX('LootingInventory')}</b><span class="cnt"></span></div>
          <div class="line"></div>
          <div class="grid loot"></div>
        </section>
        <div class="vd-inv-tip"></div>
        </div>
        <div class="vd-inv-drag"></div>
      </div>`;
    const q = s => root.querySelector(s);
    I.ui = {
      root, page: q('.vd-inv-page'), tabs: q('.vd-inv-tabs'), invPage: q('.mp-inventory'), my: q('.vd-inv-my'), inv: q('.grid.inv'), safe: q('.grid.safe'), equip: q('.equip'),
      cnt: q('.vd-inv-my .head .cnt'), dots: q('.pager .dots'), pager: q('.pager'), corr: q('.corr'), cur: q('.vd-inv-cur'),
      quickBox: q('.vd-inv-center .quick'), quick: q('.quick .row'), bag: q('.vd-inv-bag'), bagRow: q('.vd-inv-bag .row'),
      lootSec: q('.vd-inv-loot'), loot: q('.grid.loot'), lootCnt: q('.vd-inv-loot .cnt'), lootTitle: q('.vd-inv-loot .head b'),
      tip: q('.vd-inv-tip'), drag: q('.vd-inv-drag'), guide: q('.guide'),
    };
    const pageSize = () => C('InventoryPageSlotCount', 24);
    for (let i = 0; i < pageSize(); i++) slotEl(I.ui.inv, 'inv', i);
    for (let i = 0; i < 6; i++) slotEl(I.ui.safe, 'safe', i);
    for (let i = 0; i < 6; i++) slotEl(I.ui.equip, 'equip', i);
    // SubWeapon_ (110×110, sau ô vũ khí chính): ô vũ khí phụ 70×70 lệch (−20, −20), phím V (KeyPrompt), mũi Swap, lớp Dim.
    I.ui.sub = $('div', 'subw', I.ui.equip, `<img class="kv" src="${UI}V_Key.webp" alt=""><i class="swap"></i>`);
    I.ui.subSlot = slotEl(I.ui.sub, 'equip', 6);
    $('i', 'dim', I.ui.sub);
    for (let i = 0; i < LOOT_SLOTS; i++) slotEl(I.ui.loot, 'loot', i);
    for (let i = 0; i < BAG_PANEL; i++) slotEl(I.ui.bagRow, 'bag', i);
    for (let i = 0; i < QUICK_PANEL; i++) { const el = slotEl(I.ui.quick, 'quick', i); $('img', 'kp', el).src = UI + (i + 1) + '_Key.webp'; }
    q('.pager .prev').onclick = () => { I.page = Math.max(0, I.page - 1); renderPanel(); };
    q('.pager .next').onclick = () => { I.page = Math.min(pages() - 1, I.page + 1); renderPanel(); };
    root.addEventListener('contextmenu', e => e.preventDefault());
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', () => endDrag(null));
    root.addEventListener('pointerover', e => { const el = e.target.closest('.vs'); if (el && el.dataset.a && I.ui.invPage.contains(el)) setHover(el); });
    root.addEventListener('pointerout', e => { const el = e.target.closest('.vs'); if (el && I.hover && I.hover.el === el && !el.contains(e.relatedTarget)) setHover(null); });
    q('.vd-inv-bg').addEventListener('click', () => { if (!D.drag) I.toggle(false); });
    addEventListener('keydown', onKey);
    addEventListener('resize', fit);
    if (VD.menu) VD.menu.mount(I.ui);
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
    if (ref.a === 'equip') { const gs = gearSlot(ref.k); return gs ? gs.arr[gs.i] || null : null; }
    if (ref.a === 'quick') { const id = I.quick[ref.k]; return id ? { type: 'Item', id, count: I.count('Item', id) } : null; }
    const s = slotAt(ref.a, ref.k);
    return s && s.g && (ref.a !== 'loot' || s.rev === 2) ? s.g : null;
  }
  function onDown(e) {
    const el = e.target.closest('.vs');
    if (!el || !el.dataset.a || !I.ui.invPage.contains(el)) return;
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
    if (!g) return;
    D.drag = { ref: d.ref, g, mod: d.mod };
    I.hold = { ref: d.ref, g, mouse: true };
    showGhost(g);
    tip(null);
    moveDrag(e.clientX, e.clientY);
    renderPanel();
  }
  function showGhost(g) {
    const dr = I.ui.drag;
    dr.innerHTML = ''; const de = slotEl(dr, '', 0); paintSlot(de, { g, rev: 2 });
    dr.style.display = 'block';
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
      if (ref.a === 'equip') { I.unequip(ref.k); tip(null); return; }
      I.discard(ref.a, ref.k, d.mod); tip(null); return;
    }
    if (d.btn !== 0) return;
    if (ref.a === 'quick') { if (I.quick[ref.k]) { I.quick[ref.k] = 0; sfx('ItemRelease'); changed(); } return; }
    // OnEquipmentSlotLeftClick: túi phụ đang mở thì cất vào túi phụ, không thì UnequipToInventorySlot.
    if (ref.a === 'equip') { unequipClick(ref.k); refreshTip(); return; }
    if (I.loot && goodsOf(ref)) { I.transfer(ref.a, ref.k, d.mod); refreshTip(); return; }
    // Không lục rương: bấm = chọn ô (Selected!).
    I.sel = goodsOf(ref) ? { a: d.el.dataset.a, k: d.el.dataset.k } : null;
    renderPanel();
  }
  function endDrag(target) {
    const dg = D.drag; D.drag = null;
    I.ui.drag.style.display = 'none';
    if (!dg) return;
    I.hold = null;
    const el = target && target.closest && target.closest('.vs');
    const to = el && slotOf(el);
    dropOn(dg.ref, to, el, dg.mod);
    renderPanel();
  }
  // Thả hàng đang cầm (chuột kéo hoặc tay cầm A) vào ô đích.
  function dropOn(from, to, el, mod) {
    if (!to || (to.a === from.a && to.k === from.k)) return;
    const g = goodsOf(from);
    if (!g) return;
    if (to.a === 'quick') { registerQuick(to.k, g); return; }
    if (from.a === 'quick') return;
    if (from.a === 'equip' && to.a === 'equip') { I.swapGear(from.k, to.k); return; }
    if (from.a === 'equip') { I.unequip(from.k, to.a, to.k); return; }
    if (to.a === 'equip') { I.equipFrom(from.a, from.k, to.k); return; }
    const src = slotAt(from.a, from.k), dst = slotAt(to.a, to.k);
    if (!dst || (to.a === 'loot' && dst.g && dst.rev !== 2)) return;
    const n = moveTo(src, from.a, dst, to.a, amount(src.g, mod));
    if (n > 0) { if (from.a === 'loot' && I.loot.onTake) I.loot.onTake(dst.g, 0); flash(to.a, el); changed(); }
  }
  function setHover(el) {
    const prev = I.hover && I.hover.el;
    I.hover = el ? { el, ref: slotOf(el) } : null;
    if (prev && prev !== el) prev.classList.remove('focus');
    if (el) el.classList.add('focus');
    refreshTip();
  }
  function refreshTip() {
    if (D.drag) return;
    const h = I.hover;
    const g = h ? goodsOf(h.ref) : null;
    tip(g, h);
    if (g && g.isNew) { g.isNew = false; }
  }
  function flash(a, el) { if (el) { el.classList.remove('confirm'); void el.offsetWidth; el.classList.add('confirm'); } }

  function onKey(e) {
    if (!I.open) return;
    const code = e.code;
    const M = VD.menu;
    if (code === 'KeyX') { e.preventDefault(); if (I.bagOpen && M && M.cur === 'Inventory') { I.openBag(null); return; } I.toggle(false); return; }
    if (M && M.onKey(e)) return;
    if (M && M.cur !== 'Inventory') return;
    const h = I.hover && I.hover.ref;
    const m = /^Digit([1-5])$/.exec(code);
    if (m) {
      e.preventDefault();
      const g = goodsOf(h);
      if (g && h.a !== 'quick' && h.a !== 'equip') registerQuick(+m[1] - 1, g);
      return;
    }
    if (code === 'KeyR' && !e.repeat) { e.preventDefault(); sortHere(h); return; }
    // OnSwapWeaponButtonClick: không đổi khi đang kéo (_isDragging).
    if (code === 'KeyV' && !e.repeat) { e.preventDefault(); if (!D.drag) I.swapWeapon(); return; }
    if (code === 'KeyN' && !e.repeat) { mark(h); return; }
    if (code === 'KeyF' && !e.repeat) { e.preventDefault(); useRef(h); }
  }
  function mark(h) {
    const s = h && (h.a === 'inv' || h.a === 'safe' || h.a === 'bag') ? slotAt(h.a, h.k) : null;
    if (s && s.g) { s.g.fav = !s.g.fav; changed(); }
  }
  // Esc khi túi phụ đang mở: đóng túi trước ("nhấn Hủy để chỉ đóng túi lại"). dive.js gọi trước khi đóng cả bảng.
  I.escape = function () {
    if (I.hold && !I.hold.mouse) { I.hold = null; I.ui.drag.style.display = 'none'; renderPanel(); return true; }
    if (I.bagOpen && VD.menu && VD.menu.cur === 'Inventory') { I.openBag(null); return true; }
    return false;
  };

  // ---------------------------------------------------------------- tooltip (GoodsTooltip → ItemTooltip / EquipmentTooltip / BagTooltip)
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rich = s => (VD.ui && VD.ui.rich ? VD.ui.rich(s) : esc(s).replace(/\\n|\n/g, '<br>'));
  const stashCount = g => ((VD.profile && VD.profile.get && VD.profile.get().stash) || []).reduce((a, x) => a + (x && x.type === g.type && +x.id === +g.id ? (+x.count || 1) : 0), 0);
  const statText = ([k, v]) => `${esc(TX('EStatType_' + k) || k)} ${v > 0 ? '+' : ''}${v}${/Percent$/.test(k) ? '%' : ''}`;
  // Dòng "caption ……… giá trị" (caption 16 #707070, giá trị 20 đậm #DCDCDC), vạch 2px #313131 dưới.
  const row = (cap, val, cls) => `<div class="row${cls ? ' ' + cls : ''}"><span>${esc(cap)}</span><b>${val}</b></div>`;
  const GOLD = v => `<img src="${UI}Gold.webp" alt="">${fmt(v)}`;
  const COIN = v => `<img src="${UI}Coin.webp" alt="">${fmt(v)}`;
  function tipHTML(g) {
    const r = G.row(g) || {};
    const gr = G.grade(g);
    const cat = r.GoodsType === 'Weapon' || r.GoodsType === 'Accessory' || r.GoodsType === 'Artifact' ? r.GoodsType : g.type === 'Bag' ? 'Bag' : '';
    let name = G.name(g);
    if (g.type === 'Bag' && g.inner) name += ` (${g.inner.filter(s => s.g).length}/${g.inner.length})`;
    const d = G.desc(g);
    let h = g.isNew ? '<div class="tag new">NEW</div>' : '';
    h += `<div class="title"><span class="grade" style="color:${G.color(g)}">${esc((TX('EGoodsGradeType_' + gr) || gr).toUpperCase())}</span>
      <b class="name">${esc(name)}</b>${cat ? `<i class="type" style="--m:url(../${UI}${cat}.webp)"></i>` : ''}${g.fav ? '<i class="mk"></i>' : ''}</div>`;
    if (g.type === 'Equipment') {
      const art = r.GoodsType === 'Artifact';
      // ArtifactTagGroup_: thẻ loại cổ vật (EArtifactCategory) + tiền tố (ArtifactPrefix; Id ≥ 20000 là tiền tố xấu — màu Negative_).
      if (art) h += `<div class="tags"><span class="ac">${esc(TX('EArtifactCategory_' + r.ArtifactCategory) || r.ArtifactCategory)}</span>${(g.prefixes || []).map(id => `<span class="ap ${id >= 20000 ? 'neg' : 'pos'}">${esc(TX('TArtifactPrefix_Name_' + id) || id)}</span>`).join('')}</div>`;
      // EffectGroup_: Skills[] (EquipmentSkillText — hiệu ứng trang bị, hiệu ứng bộ) rồi Stats[] (SubEffectText — chỉ số).
      const skills = (r.EquipmentEffectIds || []).map(id => rich(TX('TEquipmentEffect_Desc_' + id)));
      if (r.EquipmentSetGroupId > 0) for (const s of ((VD.T && VD.T.EquipmentSet) || []).filter(x => x.GroupId === r.EquipmentSetGroupId))
        skills.push(`<b style="color:#898989">${esc(TX('TEquipmentSet_Name_' + s.Id))} (${s.Count}):</b> ${rich(TX('TEquipmentSet_Desc_' + s.Id))}`);
      const broken = r.MaxDurability > 0 && g.dur === 0;
      const stats = (broken ? r.BrokenStats : r.Stats || []).filter(s => !(r.GoodsType === 'Weapon' && s[0] === 'Atk')).map(statText);
      for (const id of g.prefixes || []) { const pr = ((VD.T && VD.T.ArtifactPrefix) || []).find(p => p.Id === id); if (pr) for (const s of pr.Stats || []) stats.push(statText(s)); }
      if (skills.length || stats.length) h += `<div class="eff">${skills.map(x => `<p class="sk">${x}</p>`).join('')}${stats.map(x => `<p class="st">${x}</p>`).join('')}</div>`;
      if (art) {
        h += row(TX('CorruptionValue'), fmt(r.Corruption || 0), 'dim');
        const coin = VD.uiDeal && VD.uiDeal.basePrice ? VD.uiDeal.basePrice(g) : Math.round((r.Worth || 0) / C('CoinToGoldRate', 1));
        h += row(TX('UItemTooltip_ArtifactPrice_Caption'), `${COIN(coin)}<em class="gp">(${GOLD(G.worth(g))})</em>`, 'dim');
      }
      if (r.GoodsType === 'Weapon') {
        const atk = ((broken ? r.BrokenStats : r.Stats) || []).find(s => s[0] === 'Atk');
        if (atk) h += row(TX('UEquipmentTooltip_Attack_Caption'), fmt(atk[1]), 'big');
        if (r.ElementalType && r.ElementalType !== 'None') h += row(TX('UEquipmentTooltip_Elemental_Caption'), esc(TX('EElementalType_' + r.ElementalType) || TX('UCharacterInfoPanel_' + r.ElementalType + 'Resistance_Caption') || r.ElementalType), 'dim');
      }
      if (r.MaxDurability > 0) h += row(TX('UEquipmentTooltip_Durability_Caption'), `${g.dur != null ? g.dur : r.MaxDurability} / ${r.MaxDurability}`, 'dim');
      if (d) h += `<p class="desc">${rich(d)}</p>`;
      if (!art) h += row(TX('UItemTooltip_Price_Caption'), GOLD(G.worth(g)), 'price');
      h += row(TX('UItemTooltip_StashAmount_Caption'), fmt(stashCount(g)), 'amt');
    } else {
      if (d) h += `<p class="desc">${rich(d)}</p>`;
      h += row(TX('UItemTooltip_Price_Caption'), GOLD(G.worth(g) + (g.inner ? g.inner.reduce((a, s) => a + (s.g ? G.worth(s.g) : 0), 0) : 0)), 'price');
      if (g.type === 'Item') h += row(TX('UItemTooltip_InventoryAmount_Caption'), `${I.count('Item', g.id)} / ${G.stackMax(g)}`, 'amt');
      h += row(TX('UItemTooltip_StashAmount_Caption'), fmt(stashCount(g)), 'amt');
    }
    return `<div class="frame ${g.type === 'Equipment' ? 'eq' : g.type === 'Bag' ? 'bag' : 'item'}">${h}</div>`;
  }
  I.tipHTML = tipHTML;
  function tip(g, h) {
    const t = I.ui.tip;
    if (!g) { t.className = 'vd-inv-tip'; return; }
    t.innerHTML = tipHTML(g);
    // Vị trí: cột giữa, đỉnh 200; tooltip trang bị dài thì đẩy lên cho vừa khung 1080. Ô rương → bên trái LootingInventory.
    const side = h && h.ref && h.ref.a === 'loot' ? 'from-loot' : 'from-my';
    t.className = 'vd-inv-tip on ' + side;
    const ref = parseFloat(getComputedStyle(I.ui.page).getPropertyValue('--ref-h')) || 1080;
    t.style.top = '';
    const top = t.offsetTop, hh = t.offsetHeight;
    if (top + hh > ref - 20) t.style.top = Math.max(10, ref - 20 - hh) + 'px';
  }
  // Tooltip cho ô ở trang khác (Quest thưởng…): dùng khung tooltip của trang Túi đồ, đặt lên trang đang mở.
  I.showTipFor = function (g, el) {
    if (!I.ui || !g) return;
    const host = el.closest('.vd-mp');
    if (host && I.ui.tip.parentNode !== host) host.appendChild(I.ui.tip);
    tip(g, null);
    I.ui.tip.classList.add('float');
    const r = el.getBoundingClientRect(), pr = I.ui.page.getBoundingClientRect(), k = I.ui.scale || 1;
    I.ui.tip.style.left = Math.max(10, (r.left - pr.left) / k - 560) + 'px';
    I.ui.tip.style.top = Math.max(10, Math.min(1080 - 20 - I.ui.tip.offsetHeight, (r.top - pr.top) / k - 60)) + 'px';
  };
  I.hideTip = function () {
    if (!I.ui) return;
    tip(null);
    I.ui.tip.style.left = ''; I.ui.tip.style.top = '';
    if (I.ui.tip.parentNode !== I.ui.invPage) I.ui.invPage.appendChild(I.ui.tip);
  };

  // ---------------------------------------------------------------- vẽ bảng
  // 6 ô trang bị của bảng (vũ khí đang cầm, 3 phụ kiện, 2 cổ vật); vũ khí phụ là I.subWeapon() (ô k = 6).
  function equipList() {
    if (!I.gear) I.gear = mkGear(I.equip);
    const out = [];
    for (let k = 0; k < 6; k++) { const gs = gearSlot(k); out.push({ cat: gs.cat, g: gs.arr[gs.i] || null }); }
    return out;
  }
  I.equipList = equipList;
  function renderPanel() {
    if (!I.ui) return;
    const u = I.ui, per = C('InventoryPageSlotCount', 24);
    if (I.page >= pages()) I.page = pages() - 1;
    if (I.bagOpen && !I.slots.concat(I.safe).some(s => s.g === I.bagOpen)) I.bagOpen = null;
    [...u.inv.children].forEach((el, i) => paintSlot(el, I.slots[I.page * per + i] || null));
    [...u.safe.children].forEach((el, i) => paintSlot(el, I.safe[i] || null));
    equipList().forEach((e, i) => { const el = u.equip.children[i]; if (!el) return; paintSlot(el, { g: e.g }); el.classList.add('cat-' + e.cat.toLowerCase()); });
    paintSlot(u.subSlot, { g: I.subWeapon() }); u.subSlot.classList.add('cat-weapon');
    [...u.quick.querySelectorAll('.vs[data-a="quick"]')].forEach((el, i) => {
      const id = I.quick[i];
      paintSlot(el, { g: id ? { type: 'Item', id, count: I.count('Item', id) } : null });
      if (id && !I.count('Item', id)) el.classList.add('none');
    });
    // BagPanel thay chỗ QuickSlotSettingPanel ở cột giữa khi túi phụ đang mở. [SUY LUẬN: cùng toạ độ 690,854 trong prefab]
    const bag = I.bagOpen;
    u.bag.classList.toggle('on', !!bag);
    u.quickBox.classList.toggle('off', !!bag);
    if (bag) {
      u.bag.querySelector('.bn').textContent = G.name(bag);
      u.bag.querySelector('.cnt').innerHTML = `${bag.inner.filter(s => s.g).length}<em>/${bag.inner.length}</em>`;
      [...u.bagRow.children].forEach((el, i) => { el.style.display = i < bag.inner.length ? '' : 'none'; paintSlot(el, bag.inner[i] || null); });
    }
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
    // CurrencyLayout: CoinPanel (Coin) + CurrencyPanel (Gold) — ví của hồ sơ.
    const w = (VD.profile && VD.profile.get && VD.profile.get().wallet) || {};
    u.cur.querySelector('.coin b').textContent = fmt(w.coin || 0);
    u.cur.querySelector('.gold b').textContent = fmt(w.gold || 0);
    u.lootSec.style.display = I.loot ? '' : 'none';
    u.root.classList.toggle('looting', !!I.loot);
    u.lootSec.classList.toggle('stash', !!(I.loot && I.loot.stash));
    if (I.loot) {
      const L = I.loot.slots;
      u.lootTitle.textContent = I.loot.stash ? I.loot.title : TX('LootingInventory');
      while (u.loot.children.length < L.length) slotEl(u.loot, 'loot', u.loot.children.length);
      while (u.loot.children.length > L.length) u.loot.lastChild.remove();
      [...u.loot.children].forEach((el, i) => paintSlot(el, L[i] || null));
      u.lootCnt.innerHTML = `${L.filter(s => s.g).length}<em>/${L.length}</em>`;
    }
    if (I.hover && !document.contains(I.hover.el)) I.hover = null;
    refreshTip();
  }
  I.refresh = renderPanel;
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

  // Mở/đóng MenuPopup. tab: thẻ mở ra (mặc định Túi đồ — InGame/Inventory = Tab / Start).
  I.toggle = function (on, tab) {
    if (!I.ui) build();
    const was = I.open;
    I.open = on == null ? !I.open : !!on;
    I.ui.root.classList.toggle('on', I.open);
    const p = VD.stage && VD.stage.player;
    if (!I.open) {
      endLooting();
      endDrag(null); D.down = null;
      if (was && I.onClose) I.onClose();
      I.loot = null; I.hover = null; I.sel = null; I.bagOpen = null; I.hold = null; I.hideTip();
      if (VD.menu && was) VD.menu.onClose();
      // battle/search chỉ giữ khi đang lục rương (PlayAnimationByActionState gốc).
      if (p && p.drive && p.drive.loot) p.drive = null;
    } else {
      fit();
      if (!was) sfx('InventoryPopupOpen');
      if (I.loot && I.loot.search && p && !p.dead && (!p.drive || p.drive.loot)) p.drive = { name: 'battle/search', loop: true, t0: VD.stage.A.time, offset: 0, ts: 1, loot: true };
      I.recordArchive();
      if (VD.menu) VD.menu.onOpen(I.loot ? 'Inventory' : tab || (was ? VD.menu.cur : 'Inventory'));
    }
    if (VD.input) { VD.input.enabled = !I.open; VD.input.clear(); }
    if (I.open) renderPanel();
  };
  I.openMenu = tab => I.toggle(true, tab);

  // ---------------------------------------------------------------- tay cầm trong trang Túi đồ (menu.js gọi)
  // UI + UiPad map: A = DragAndDrop (cầm lên / đặt xuống), Y = InsertGoods (sang phía bên kia khi lục rương), RB = DropGoods (vứt),
  // LB giữ = InventorySelectOne (chỉ 1 món), X = UseItem (dùng / mở túi phụ), View = MarkGoods, RS bấm = Organize, B = thả tay / đóng.
  const B = () => VD.menu.BTN;
  I.padPage = {
    navItems() {
      const u = I.ui;
      return [...u.invPage.querySelectorAll('.vs[data-a]')].filter(el =>!el.classList.contains('locked') && el.offsetParent !== null && !(el.dataset.a === 'loot' && !I.loot));
    },
    onFocus(el) { setHover(el); if (I.hold && !I.hold.mouse) ghostAt(el); },
    pad(b, el, ctx) {
      const ref = el && slotOf(el);
      const mod = ctx.held(B().LB) ? 'one' : 'all';
      if (b === B().A) {
        if (I.hold) { const h = I.hold; I.hold = null; I.ui.drag.style.display = 'none'; dropOn(h.ref, ref, el, mod); renderPanel(); return true; }
        const g = goodsOf(ref);
        if (g) { I.hold = { ref, g }; showGhost(g); ghostAt(el); renderPanel(); sfx('ButtonClick'); }
        return true;
      }
      if (b === B().B) return I.escape();
      if (!ref) return false;
      if (b === B().Y) { if (I.loot && goodsOf(ref)) { I.transfer(ref.a, ref.k, mod); refreshTip(); } return true; }
      if (b === B().RB) { if (ref.a === 'quick') { if (I.quick[ref.k]) { I.quick[ref.k] = 0; sfx('ItemRelease'); changed(); } } else if (ref.a !== 'equip') I.discard(ref.a, ref.k, mod); return true; }
      if (b === B().X) { useRef(ref); return true; }
      if (b === B().SELECT) { mark(ref); return true; }
      if (b === B().RS) { sortHere(ref); return true; }
      return false;
    },
    // Cần phải (UiPad/MovePanel): nhảy sang panel bên cạnh (túi ↔ giữa ↔ rương).
    padPanel(dir, el) {
      const items = I.padPage.navItems();
      if (!el) { if (items[0]) VD.menu.focus(items[0]); return; }
      const box = x => x.closest('.grid, .row, .equip');
      const a = el.getBoundingClientRect();
      const v = { left: -1, right: 1, up: 0, down: 0 }[dir];
      if (!v) return;
      let best = null, bs = Infinity;
      for (const x of items) {
        if (box(x) === box(el)) continue;
        const b = x.getBoundingClientRect(), dx = (b.left - a.left) * v;
        if (dx <= 40) continue;
        const s = dx + Math.abs(b.top - a.top) * 2;
        if (s < bs) { bs = s; best = x; }
      }
      if (best) VD.menu.focus(best);
    },
  };
  function ghostAt(el) {
    const r = el.getBoundingClientRect(), pr = I.ui.page.getBoundingClientRect(), s = I.ui.scale || 1;
    I.ui.drag.style.transform = `translate(${(r.right - pr.left) / s - 34}px, ${(r.top - pr.top) / s - 26}px)`;
  }

  // ô đồ trên HUD (VD.hud.itemEls): icon + tổng số lượng + bóng hồi chiêu.
  function renderHud() {
    const els = VD.hud && VD.hud.itemEls;
    if (!els) return;
    renderHudWeapon();
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
  // InGameQuickSlotPanel gốc: WeaponSwapSlot 90×90 (vũ khí đang cầm) bên trái 5 ô đồ, SubWeapon_ 70×70 lệch (−20, −20) phía sau
  // với mũi Swap; đổi xong chạy SwapedFX (viền sáng). Web đặt vào hàng .vd-items của hud.js.
  function renderHudWeapon() {
    const items = VD.hud && VD.hud.items;
    if (!items || !I.gear) return;
    if (!I._hudW || I._hudW.parentNode !== items) {
      I._hudW = $('div', 'vd-wslot');
      I._hudW.innerHTML = `<i class="sub"><img alt=""></i><i class="swap"></i><i class="main"><img alt=""></i>`;
      items.insertBefore(I._hudW, items.firstChild);
    }
    const paint = (box, g) => {
      const img = box.querySelector('img'), src = g ? G.icon(g) : '';
      if (img.dataset.src !== src) { if (src) img.src = src; else img.removeAttribute('src'); img.dataset.src = src; }
      box.classList.toggle('empty', !g);
      box.style.setProperty('--gc', g ? G.color(g) : 'transparent');
    };
    paint(I._hudW.querySelector('.main'), I.weapon());
    paint(I._hudW.querySelector('.sub'), I.subWeapon());
    I._hudW.classList.toggle('nosub', !I.subWeapon());
  }
  I.renderHudWeapon = renderHudWeapon;
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
  // Bảng đóng mà tay cầm bấm Start (InGame/Inventory = <Gamepad>/start) thì mở trang Túi đồ.
  I.step = function (dt) {
    if (I._skinDirty) weaponSkin();
    if (I.open) { revealTick(dt || 0); return; }
    const inp = VD.input;
    if (!inp || inp.enabled === false) return;
    if (VD.menu && VD.menu.padClosed()) { I.toggle(true, 'Inventory'); return; }
    for (let k = 0; k < 5; k++) if (inp.pressed['Item' + (k + 1)]) I.useQuick(k);
    // PlayerInputController.OnSwapWeaponPerformed (V) → ReqSwapWeapon.
    if (inp.pressed.SwapWeapon) I.swapWeapon();
  };
  I.bindHudClicks = function () {
    const els = VD.hud && VD.hud.itemEls;
    if (!els || I._hudBound) return;
    I._hudBound = true;
    els.forEach((el, k) => { el.style.pointerEvents = 'auto'; el.addEventListener('pointerdown', e => { e.stopPropagation(); I.useQuick(k); }); });
  };

  VD.inventory = I;
})(window.VD = window.VD || {});
