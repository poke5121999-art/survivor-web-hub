// Túi đồ trong lượt lặn: mô hình hàng hoá mang theo (Item/Equipment/Bag), 6 ô nhanh, khe an toàn, túi phụ,
// bảng Tab (lưới icon gốc + "Kết quả Tìm kiếm" của rương), 6 ô đồ trên HUD.
// Số lấy từ bảng: Const.CharacterInventorySlotCount (23), SafeInventorySlotBaseCount (1), ItemCooltime (1 s),
// Item.InventoryCountMax (trần số lượng mỗi loại), Item.Cooltime, Item.SkillId (dùng đồ = chạy skill qua lõi combat),
// Bag.SlotCount theo Bag.Type ↔ Item/Equipment.BagType, Equipment.Corruption (cổ vật), Worth.
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
    if (typeof s === 'object') return { type: s.type, id: +s.id, count: +s.count || 1 };
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
  G.grade = g => { const r = G.row(g); return (r && r.Grade) || 'Normal'; };
  G.worth = g => { const r = G.row(g); return ((r && r.Worth) || 0) * (g.count || 1); };
  G.stackMax = g => { const r = G.row(g); return g.type === 'Item' && r ? Math.max(1, r.InventoryCountMax || 1) : 1; };
  G.bagType = g => { const r = G.row(g); return (r && r.BagType) || 'None'; };
  VD.goods = G;

  // ================================================================ mô hình
  const I = {
    slots: [], bags: [], safe: [], quick: [0, 0, 0, 0, 0, 0], cd: {}, gcd: 0, open: false, loot: null,
    onChange: null, onDrop: null, onUse: null, ui: null, hover: -1,
  };

  I.reset = function (opts) {
    opts = opts || {};
    const n = C('CharacterInventorySlotCount', 23);
    I.slots = new Array(n).fill(null);
    I.bags = (opts.bags || []).map(id => index().Bag.get(+id)).filter(Boolean);
    for (const b of I.bags) for (let i = 0; i < b.SlotCount; i++) I.slots.push({ bag: b.Type, g: null });
    // Ô thường là null|{g}; ô túi phụ có .bag (chỉ nhận hàng cùng BagType).
    for (let i = 0; i < n; i++) I.slots[i] = { bag: null, g: null };
    I.safe = new Array(C('SafeInventorySlotBaseCount', 1)).fill(null).map(() => ({ bag: 'Safe', g: null }));
    I.quick = (opts.quick || [0, 0, 0, 0, 0, 0]).slice(0, 6);
    while (I.quick.length < 6) I.quick.push(0);
    I.cd = {}; I.gcd = 0; I.loot = null;
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
    let left = g.count;
    const max = G.stackMax(g), bt = G.bagType(g);
    if (g.type === 'Item') {
      // Item.InventoryCountMax là trần tổng của một loại trong túi (PickUpItemMaxCount: "chỉ nhận được một phần").
      const have = I.count('Item', g.id);
      const room = Math.max(0, max - have);
      const put = Math.min(room, left);
      const same = allSlots().find(s => s.g && s.g.type === 'Item' && s.g.id === g.id);
      if (same) { same.g.count += put; left -= put; }
      else if (put > 0) {
        const s = freeSlot(bt);
        if (s) { s.g = { type: 'Item', id: g.id, count: put }; left -= put; }
      }
      if (left > 0 && room < g.count && !(opts && opts.silent)) toast(TX('PickUpItemMaxCount'));
    } else {
      while (left > 0) {
        const s = freeSlot(bt);
        if (!s) break;
        s.g = { type: g.type, id: g.id, count: 1, dur: g.dur };
        left--;
      }
    }
    if (left > 0 && !(opts && opts.silent)) toast(TX('NotEnoughInventorySlots') || TX('InventoryFull'));
    if (left < g.count && g.type === 'Item') autoQuick(g.id);
    changed();
    return left;
  };
  function freeSlot(bagType) {
    if (bagType && bagType !== 'None') { const b = I.slots.find(s => s.bag === bagType && !s.g); if (b) return b; }
    return I.slots.find(s => !s.bag && !s.g) || null;
  }
  // Đồ tiêu hao mới nhặt tự vào ô nhanh trống đầu tiên. [SUY LUẬN: bản gốc gán tay bằng phím số trong túi]
  function autoQuick(id) {
    const r = index().Item.get(id);
    if (!r || !r.CanUseFromQuickSlot || I.quick.indexOf(id) >= 0) return;
    const k = I.quick.indexOf(0);
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

  // ================================================================ rương / kết quả tìm kiếm
  // loot = { title, items:[goods], source }. Mở bảng Tab ở chế độ hai cột.
  I.openLoot = function (loot) { I.loot = loot; I.toggle(true); };
  I.take = function (k) {
    if (!I.loot) return;
    const g = I.loot.items[k];
    if (!g) return;
    const left = I.add(g);
    if (left <= 0) I.loot.items.splice(k, 1); else g.count = left;
    if (I.loot.onTake) I.loot.onTake(g, left);
    changed();
  };
  I.takeAll = function () {
    if (!I.loot) return 0;
    let n = 0;
    for (let k = I.loot.items.length - 1; k >= 0; k--) { const before = I.loot.items.length; I.take(k); if (I.loot.items.length < before) n++; }
    return n;
  };
  I.drop = function (idx) {
    const s = allSlots()[idx];
    if (!s || !s.g) return;
    if (s.bag === 'Safe') { /* khe an toàn: vẫn cho vứt */ }
    const g = s.g; s.g = null;
    if (I.onDrop) I.onDrop(g);
    changed();
  };

  // ================================================================ giao diện
  const GRADE_CLS = { Normal: 'g-normal', Rare: 'g-rare', Elite: 'g-elite', Epic: 'g-epic', Legend: 'g-legend', Unique: 'g-unique', None: 'g-normal' };
  function toast(s) { if (s && VD.dialog && VD.dialog.toast) VD.dialog.toast(s); }

  function build() {
    const ui = document.getElementById('ui') || document.body;
    const root = $('div', 'vd-inv', ui);
    root.innerHTML = `
      <div class="vd-inv-win">
        <div class="vd-inv-col bag"><div class="vd-inv-head"><b>${TX('Inventory') || 'Túi đồ'}</b><span class="stat"></span></div>
          <div class="vd-inv-grid main"></div>
          <div class="vd-inv-sub">${TX('SafeInventory') || 'Khe an toàn'}</div><div class="vd-inv-grid safe"></div>
          <div class="vd-inv-sub">${TX('UQuickSlotSettingPanel_Top_Caption') || 'Ô Nhanh'} · <i>${TX('QuickSlotGuide') || ''}</i></div><div class="vd-inv-grid quick"></div>
        </div>
        <div class="vd-inv-col loot"><div class="vd-inv-head"><b>${TX('LootingInventory') || 'Kết quả Tìm kiếm'}</b><button class="takeall">F</button></div>
          <div class="vd-inv-grid box"></div></div>
        <div class="vd-inv-tip"></div>
        <div class="vd-inv-close">Tab</div>
      </div>`;
    I.ui = {
      root, main: root.querySelector('.grid.main') || root.querySelector('.vd-inv-grid.main'), safe: root.querySelector('.vd-inv-grid.safe'),
      quick: root.querySelector('.vd-inv-grid.quick'), box: root.querySelector('.vd-inv-grid.box'), lootCol: root.querySelector('.vd-inv-col.loot'),
      stat: root.querySelector('.stat'), tip: root.querySelector('.vd-inv-tip'), lootTitle: root.querySelector('.vd-inv-col.loot b'),
    };
    root.querySelector('.takeall').onclick = () => I.takeAll();
    root.querySelector('.vd-inv-close').onclick = () => I.toggle(false);
    root.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('keydown', e => {
      if (!I.open) return;
      const m = /^Digit([1-6])$/.exec(e.code);
      if (m && I.hover >= 0) {
        const s = allSlots()[I.hover];
        const r = s && s.g && s.g.type === 'Item' ? G.row(s.g) : null;
        if (!r || !r.CanUseFromQuickSlot) { toast(TX('CannotRegisterToQuickSlot')); return; }
        const k = +m[1] - 1;
        const old = I.quick.indexOf(s.g.id); if (old >= 0) I.quick[old] = 0;
        I.quick[k] = s.g.id;
        changed();
      }
    });
  }

  function cell(parent, g, extra) {
    const el = $('div', 'vd-cell ' + (g ? GRADE_CLS[G.grade(g)] || '' : 'empty') + (extra ? ' ' + extra : ''), parent);
    if (g) {
      const img = $('img', null, el); img.src = G.icon(g); img.alt = ''; img.draggable = false;
      if (g.count > 1) $('span', 'n', el).textContent = g.count;
    }
    return el;
  }
  function tip(g, ev) {
    const t = I.ui.tip;
    if (!g) { t.style.display = 'none'; return; }
    const r = G.row(g) || {};
    const gr = TX('EGoodsGradeType_' + (r.Grade || 'Normal'));
    t.innerHTML = '';
    $('b', null, t).textContent = G.name(g);
    $('div', 'g', t).textContent = [gr, TX('EGoodsType_' + (r.GoodsType || g.type))].filter(Boolean).join(' · ');
    const d = G.desc(g); if (d) $('div', 'd', t).textContent = d.replace(/<[^>]+>/g, '');
    $('div', 'w', t).textContent = (TX('EEventConditionType_TeamTotalWorth') || 'Giá trị') + ': ' + G.worth(g) + (r.Corruption ? ' · ô nhiễm ' + r.Corruption : '');
    t.style.display = 'block';
  }

  function renderPanel() {
    if (!I.ui) return;
    const u = I.ui;
    u.main.innerHTML = ''; u.safe.innerHTML = ''; u.quick.innerHTML = ''; u.box.innerHTML = '';
    const all = allSlots();
    all.forEach((s, k) => {
      const el = cell(s.bag === 'Safe' ? u.safe : u.main, s.g, s.bag && s.bag !== 'Safe' ? 'bagslot' : '');
      el.onmouseenter = ev => { I.hover = k; tip(s.g, ev); };
      el.onmouseleave = () => { if (I.hover === k) I.hover = -1; tip(null); };
      el.onclick = () => { if (s.g && s.g.type === 'Item') I.use(s.g.id, 'inventory'); };
      el.oncontextmenu = ev => { ev.preventDefault(); I.drop(k); tip(null); };
    });
    I.quick.forEach((id, k) => {
      const g = id ? { type: 'Item', id, count: I.count('Item', id) } : null;
      const el = cell(u.quick, g, 'q');
      $('b', 'k', el).textContent = k + 1;
      el.onclick = () => { I.quick[k] = 0; changed(); };
    });
    u.lootCol.style.display = I.loot ? '' : 'none';
    if (I.loot) {
      u.lootTitle.textContent = I.loot.title || TX('LootingInventory');
      I.loot.items.forEach((g, k) => {
        const el = cell(u.box, g);
        el.onmouseenter = ev => tip(g, ev);
        el.onmouseleave = () => tip(null);
        el.onclick = () => { I.take(k); tip(null); };
      });
      if (!I.loot.items.length) $('div', 'vd-inv-empty', u.box).textContent = '—';
    }
    const used = I.slots.filter(s => s.g).length;
    u.stat.textContent = used + '/' + I.slots.length + ' · ' + (TX('EEventConditionType_TeamTotalWorth') || 'Giá trị') + ' ' + I.worth();
  }

  I.toggle = function (on) {
    if (!I.ui) build();
    I.open = on == null ? !I.open : !!on;
    I.ui.root.classList.toggle('on', I.open);
    if (!I.open) { I.loot = null; I.hover = -1; tip(null); }
    if (VD.input) { VD.input.enabled = !I.open; VD.input.clear(); }
    if (I.open) renderPanel();
  };

  // 6 ô đồ trên HUD (VD.hud.itemEls): icon + tổng số lượng + bóng hồi chiêu.
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

  // Phím 1–5 (InputAction PlayerFunc/UseItem, BindingIndex 0–4). Ô 6 không có phím trong bảng: bấm chuột.
  I.step = function () {
    const inp = VD.input;
    if (!inp || I.open || inp.enabled === false) return;
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
