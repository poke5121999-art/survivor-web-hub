// Bảng F3: Túi Đồ (I, InventoryUI), Kho Slime ở Allen (SlimeArchiveUI), Bách Khoa Slime (B, SlimeIndexUI), hỏi + đặt biệt danh
// sau khi bắt. Dựng như js/ui/story.js: X(parent, K, x, y, w, h) theo px ảnh 1280x720, K = 2 đơn vị canvas mỗi px (720p).
// Nguồn bố cục: Kho = khung v4van_sheet_slime_storage (ô trên trái, 640x360 -> x2) + prefab ui_view__SlimeArchiveUI; Bách khoa =
// gmwall_slimepedia + ui_view__SlimeIndexUI / SlimeIndexListCellPod; Túi = prefab ui_view__InventoryUI (clip không có cảnh túi,
// GAMEPLAY "Not seen: inventory/bag panel") nên chỗ đặt là tỉ lệ prefab quy ra ảnh [ĐỀ XUẤT]; biệt danh = v4van_nickname_synthesis_lab.
import * as THREE from 'three';
import { R, F, text } from './hud.js?v=20261022f';
import { paint } from './sprites.js?v=20261022f';
import { assetUrl } from '../assets.js?v=20261022f';
import { L } from '../../data/quest_text.js?v=20261022f';
import { X, panel, T, NAVY, NAVY2, fmt } from './story.js?v=20261022f';
import { Slime } from '../actors/actors.js?v=20261022f';
import { BAG_SLOTS } from '../quest/data.js?v=20261022f';
import { PARTY_MAX, STORAGE_MAX } from '../state.js?v=20261022f';
import { RULES } from '../combat/rules.js?v=20261022f';
import { item, itemIcon, bagSlots } from '../party/items.js?v=20261022f';
import { loadDex, speciesName, displayName, elementsOf, DEX_POINT } from '../party/roster.js?v=20261022f';

const K = 2;
const LIGHT = [0.74, 0.95, 1, 1];
// Enums.MonsterElement -> sprite Element/ (Ground = Soil, Electric = Electricity) + tên [LOC] UI.MonsterElement.*
const ELEM = {
  Fire: ['Fire', 'Fire', 'Fire', 'Lửa'], Water: ['Water', 'Water', 'Water', 'Nước'], Ground: ['Soil', 'Soil', 'Ground', 'Đất'], Wind: ['Wind', 'Wind', 'Wind', 'Gió'],
  Grass: ['Grass', 'Grass', 'Grass', 'Cỏ'], Steel: ['Steel', 'Steel', 'Metal', 'Thép'], Electric: ['Electric', 'Electricity', 'Electric', 'Điện'],
  Ice: ['Ice', 'Ice', 'Ice', 'Băng'], Magic: ['Magic', 'Magic', 'Magic', 'Phép Thuật'], Power: ['Power', 'Power', 'Power', 'Sức Mạnh'],
  Light: ['Light', 'Light', 'Light', 'Ánh Sáng'], Dark: ['Dark', 'Dark', 'Dark', 'Bóng Tối'], Poison: ['Poison', 'Poison', 'Poison', 'Độc'],
};
const vi = () => L('ui.ok') === 'Có';
const CSS = `
#hud .pn-card { overflow: hidden; }
#hud.mobile [data-hud="storagePod"] { overflow: visible; }   /* F5b: overflow hidden cắt vùng chạm 44 px (.btn::after) của ô đội */
#hud .pn-card img.sl { position:absolute; object-fit:contain; pointer-events:none; }
#hud .pn-card img.sil { filter: brightness(0) invert(0.86) sepia(0.25) hue-rotate(170deg) saturate(1.6); opacity:.75; }
#hud .pn-q { color: rgba(140,170,190,.55); font-weight:800; }
#hud .pn-sel { pointer-events:none; }
#hud .pn-input { position:absolute; border:none; outline:none; background:transparent; font: 700 34px Nunito, sans-serif; color:#16456b; text-align:center; }
#hud .pn-gauge { position:absolute; border-radius: 12px; overflow:hidden; }
#hud .pn-gauge > i { position:absolute; left:0; top:0; bottom:0; border-radius: 12px; }
#hud .pn-scroll { overflow-y:auto; overflow-x:hidden; scrollbar-width:none; }
#hud .pn-scroll::-webkit-scrollbar { display:none; }
#hud .view.pn-dark { background: linear-gradient(90deg, rgba(10,22,30,.35), rgba(0,25,50,.55)); }   /* DimDark (0.1,0.1,0.1,0.3) + DimAddDark (0,0.1,0.2,0.7) */
#hud .pn-canvas { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
`;
function css() { if (!document.getElementById('pn-css')) { const s = document.createElement('style'); s.id = 'pn-css'; s.textContent = CSS; document.head.appendChild(s); } }
function img(parent, src, x, y, w, h, cls = '') {
  const e = X(parent, K, x, y, w, h, { tag: 'img', cls }); e.crossOrigin = 'anonymous'; e.draggable = false; e.style.objectFit = 'contain';
  e.onerror = () => (window.__wosErrors = window.__wosErrors || []).push('panel image load failed: ' + src);
  e.src = assetUrl(src); return e;
}
function elemTag(parent, x, y, e, scale = 1) {
  const m = ELEM[e]; if (!m) return null;
  const t = X(parent, K, x, y, null, 29 * scale, { spr: 'Element/UI_Bg_Element_' + m[0], sl: true, cls: 'row center' }); t.style.gap = 6 * K + 'px';
  t.style.padding = `0 ${12 * K * scale}px 0 ${6 * K * scale}px`;
  F(t, 24 * K * scale, 24 * K * scale, { spr: 'Element/Element_' + m[1] });
  if (scale >= 1) text(t, vi() ? m[3] : m[2], 15 * K, [1, 1, 1, 1]);
  return t;
}
// thanh HP/MP/Thể lực như BaseStatLayout (GaugeRear Ui_Bg_Round_01_32px màu (0,0.2,0.3), GaugeFront UI_Gauge_*_Big)
function gauge(parent, x, y, w, h, v, front, label) {
  const g = X(parent, K, x, y, w, h, { spr: 'Common/Ui_Bg_Round_01_32px', col: [0, 0.2, 0.3, 1], sl: true });
  const f = R(g, { a: [0, 0, 0, 1], p: [2, 0], sz: [Math.max(0, Math.min(1, v)) * (w * K - 4), -4], pv: [0, 0.5] }); paint(f, front, { sliced: true });
  if (label) { const l = R(g, { a: [0, 0, 1, 1], cls: 'center' }); text(l, label, 11 * K, [1, 1, 1, 0.9], 'outline'); }
  return g;
}

// ảnh 3D slime (RawImage SlimePortrait / RenderTexturePortrait): dựng mô hình thật, chụp bằng renderer của game
const portraitCache = new Map();
export async function slimePortrait(renderer, typeId, size = 384) {
  const key = typeId + ':' + size;
  if (portraitCache.has(key)) return portraitCache.get(key);
  const a = await Slime.create(typeId);
  const o = a.object; a.update(0.01);
  const sc = new THREE.Scene(); sc.add(o); o.rotation.set(0, Math.PI + 0.35, 0); o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const r = Math.max(sz.x, sz.y, sz.z) * 0.62;
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 100);
  cam.position.set(c.x, c.y + r * 0.9, c.z - r / Math.tan(12 * Math.PI / 180) * 0.95); cam.lookAt(c);
  const rt = new THREE.WebGLRenderTarget(size, size); rt.texture.colorSpace = THREE.SRGBColorSpace;   // F5b: ghi sRGB như màn chính
  const old = renderer.getClearAlpha(), oc = renderer.getClearColor(new THREE.Color());
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam);
  const px = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  renderer.setRenderTarget(null); renderer.setClearColor(oc, old); rt.dispose();
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), im = g.createImageData(size, size);
  for (let y = 0; y < size; y++) im.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  g.putImageData(im, 0, 0);
  const url = cv.toDataURL();
  portraitCache.set(key, url);
  return url;
}
function putPortrait(el, renderer, typeId) {
  el.dataset.id = typeId; el.innerHTML = '';
  slimePortrait(renderer, typeId).then(u => {
    if (el.dataset.id !== typeId) return;
    const i = document.createElement('img'); i.src = u; i.className = 'pn-canvas'; i.dataset.hud = 'slimePortrait'; el.appendChild(i);
  }).catch(e => (window.__wosErrors = window.__wosErrors || []).push('slime portrait: ' + e.message));
}

export class Panels {
  constructor(story, { engine, renderer, useItem, quick }) {
    css();
    this.story = story; this.E = engine; this.renderer = renderer;
    this.useItem = useItem;    // (itemId, from 'bag'|'quick') -> 'ok' | mã lỗi
    this.quick = quick;        // { set(slot, itemId|null) }
  }
  get roster() { return this.E.roster; }
  isOpen(name) { return this.story.modalStack.some(m => m.name === name); }
  waitClose(root) { return new Promise(res => { const iv = setInterval(() => { if (!root.isConnected) { clearInterval(iv); res(); } }, 100); }); }

  // ================================================================ Túi Đồ (I)
  openBag() {
    if (this.isOpen('bag')) return Promise.resolve();
    const E = this.E, st = this.story;
    const root = st.view('bag', K, L('bag.title'), 'DialogueUI/Dialogue_Icon_Bag', L('bag.all'));
    // MoneyCoin (HeaderMoney2, -361,-74) như quầy
    const money = X(root, K, 1015, 22, 165, 35, { ar: true, spr: 'Common/Ui_Bg_Rectangle_Round_02_68px', col: [0.08, 0.12, 0.13, 0.59], sl: true });
    X(money, K, 6, 5, 25, 25, { spr: 'Icon/Icon_Currency_Coin' });
    const mt = X(money, K, 40, 0, 113, 35, { cls: 'row' }); mt.style.alignItems = 'center'; mt.style.justifyContent = 'flex-end';
    text(mt, fmt(E.save.gold), 18 * K).dataset.hud = 'bagGold';
    // Category (60,-50) 96 rộng: một tab Tiêu hao
    X(root, K, 43, 106, 30, 42, { spr: 'Category/Category_BG_Middle_Vertical', col: [1, 1, 1, 0.78] }); X(root, K, 45, 113, 26, 26, { spr: 'BuySellShopUI/Category_Inventory_ConsumableON' });
    const grid = X(root, K, 106, 96, 600, 500, { n: 'bagGrid' });
    const qcol = X(root, K, 726, 230, 56, 190, { n: 'bagQuick' });
    const det = panel(root, K, 912, 90, 318, 600, 'Container/Popup_01_Medium', { ar: true, n: 'bagDetail' });
    const bag = X(root, K, 122, 662, 118, 30, { spr: 'Common/Ui_Bg_Rectangle_Round_02_68px', col: [0.08, 0.12, 0.13, 0.59], sl: true, cls: 'row center', ab: true });
    bag.style.gap = '24px'; text(bag, L('ui.bag'), 15 * K); const bagText = text(bag, '', 15 * K); bagText.dataset.hud = 'bagCount';
    const org = X(root, K, 248, 662, 92, 30, { spr: 'Common/Ui_Bg_Rectangle_Round_02_68px', col: [0.08, 0.12, 0.13, 0.59], sl: true, cls: 'row center btn', ab: true });
    text(org, L('bag.organize'), 15 * K);
    let sel = 0;
    const stacks = () => {
      const out = [];
      for (const [id, n] of Object.entries(E.save.items)) {
        if (!(n > 0)) continue; const mx = (item(id) || {}).max || 99;
        for (let left = n; left > 0; left -= mx) out.push({ id: +id, n: Math.min(mx, left) });
      }
      return out;
    };
    const draw = () => {
      const list = stacks();
      grid.innerHTML = ''; qcol.innerHTML = ''; det.innerHTML = '';
      bagText.textContent = bagSlots(E.save.items) + '/' + BAG_SLOTS;
      // lưới 7 x 4 = 28 ô (Bag n/28): InventoryListCell = UI_Frame_Item_Box01 190x224 (7 cột [ĐỀ XUẤT])
      for (let i = 0; i < BAG_SLOTS; i++) {
        const s = list[i], x = (i % 7) * 85, y = Math.floor(i / 7) * 100;
        const c = X(grid, K, x, y, 80, 94, { cls: 'pn-card' + (s ? ' btn' : ''), n: s ? 'bagCell' : null });
        paint(c, 'Common/UI_Frame_Item_Box01', s ? {} : { color: [0, 0.1, 0.2, 0.6] });
        if (!s) continue;
        c.dataset.item = s.id;
        img(c, itemIcon(s.id), 12, 8, 56, 56);
        const cn = X(c, K, 0, 66, 76, 20, { cls: 'row center' }); text(cn, '× ' + s.n, 13 * K, NAVY);
        if (E.save.quick.includes(s.id)) X(c, K, 54, 4, 22, 22, { spr: 'InventoryUI/Icon_Inventory_QuickSlotArrow' });
        if (i === sel) X(c, K, -2, -2, 84, 98, { spr: 'Common/Ui_Frame_Outline', sl: true, cls: 'pn-sel' });
        c.addEventListener('pointerdown', e => { e.stopPropagation(); sel = i; draw(); });
      }
      // QuickSlotLayout: 3 InventoryQuickSlot 104 (Ui_Bg_Round_02_264px tối 0.8), "x 10", phím Q/E/R
      E.save.quick.forEach((id, i) => {
        const q = X(qcol, K, 0, i * 64, 56, 56, { spr: 'Common/Ui_Bg_Round_02_264px', col: [0.1, 0.1, 0.1, 0.8], cls: 'btn', n: 'bagQuickSlot' });
        q.dataset.slot = i; q.dataset.item = id != null ? id : '';
        if (id != null) { img(q, itemIcon(id), 6, 6, 44, 44); const ct = X(q, K, 0, 44, 56, 14, { cls: 'row center' }); text(ct, 'x ' + (E.save.items[id] || 0), 10 * K, [0.8, 0.9, 1, 1], 'outline'); }
        else X(q, K, 8, 8, 40, 40, { spr: 'InventoryUI/Icon_Inventory_Consumable', col: [0.2, 0.3, 0.4, 0.6] });
        if (st.hud.pc) X(q, K, -10, 18, 18, 18, { spr: 'resources/Common/' + ['key_Q', 'key_E', 'key_R'][i] });
        q.addEventListener('pointerdown', e => {
          e.stopPropagation(); const s = list[sel];
          if (s && item(s.id) && item(s.id).usable && item(s.id).usable.quick) { this.quick.set(i, s.id); st.hud.toast(L('item.addQuick')); }
          else if (id != null) { this.quick.set(i, null); st.hud.toast(L('item.removeQuick')); }
          draw();
        });
      });
      // ItemDetailInfoLayout: tên, loại, số lượng, ảnh lớn, mô tả, nút Thêm ô nhanh / Sử dụng
      const s = list[sel];
      if (!s) { const em = X(det, K, 0, 260, 318, 40, { cls: 'center' }); text(em, L('bag.empty'), 15 * K, NAVY2); return; }
      const m = item(s.id) || {}, u = m.usable;
      const top = X(det, K, 6, 4, 306, 180, { cls: 'shoptop' });
      const nm = X(top, K, 16, 40, 200, 34, { cls: 'row' }); text(nm, L('item.' + s.id), 22 * K, NAVY2).dataset.hud = 'bagItemName';
      const ty = X(top, K, 16, 78, 200, 20, { cls: 'row' }); text(ty, L('ui.consumable'), 14 * K, [0.09, 0.27, 0.42, 0.5]);
      const own = X(top, K, 16, 101, null, 20, { spr: 'Common/Ui_Bg_Round_02_Medium_32px', col: NAVY, sl: true, cls: 'row center' }); own.style.gap = '8px';
      text(own, L('ui.owned'), 13 * K); text(own, String(E.save.items[s.id] || 0), 13 * K).dataset.hud = 'bagOwned';
      img(top, itemIcon(s.id), 186, 52, 100, 100);
      const ds = X(det, K, 22, 200, 280, 120, {}); if (L('item.' + s.id + '.d') !== 'item.' + s.id + '.d') T(ds, L('item.' + s.id + '.d'), 14 * K, NAVY2, 'wrapl');
      const row = X(det, K, 0, 515, 318, 58, { cls: 'row center' }); row.style.gap = 12 * K + 'px';
      if (u && u.quick) {
        const inQ = E.save.quick.includes(s.id);
        const b = F(row, 140 * K, 58 * K, { spr: 'Common/Btn_Square_01_Medium_Blue', cls: 'btn center', n: 'bagQuickBtn' }); text(b, L(inQ ? 'bag.removeQuick' : 'bag.addQuick'), 15 * K, NAVY);
        b.addEventListener('pointerdown', e => {
          e.stopPropagation();
          if (inQ) { this.quick.set(E.save.quick.indexOf(s.id), null); st.hud.toast(L('item.removeQuick')); }
          else { const k = E.save.quick.indexOf(null); this.quick.set(k < 0 ? 0 : k, s.id); st.hud.toast(L('item.addQuick')); }
          draw();
        });
      }
      if (u) {
        const b = F(row, 118 * K, 58 * K, { spr: 'Common/Btn_Square_01_Medium_Green', cls: 'btn center', n: 'bagUse' }); text(b, L('bag.use'), 18 * K, NAVY);
        b.addEventListener('pointerdown', e => {
          e.stopPropagation();
          if (!u.inInv) { st.hud.toast(L('bag.cannotUse')); return; }   // Cube: canUseInInventory false
          const r = this.useItem(s.id, 'bag');
          if (r !== 'ok') st.hud.toast(L(r));
          draw();
        });
      }
    };
    draw();
    org.addEventListener('pointerdown', e => { e.stopPropagation(); sel = 0; draw(); });
    st.pushModal('bag', root, e => { if (e.code === 'Escape' || e.code === 'KeyI') st.popModal('bag'); });
    this.redrawBag = () => { if (root.isConnected) draw(); };
    return this.waitClose(root);
  }

  // ================================================================ Kho Slime (Allen)
  openStorage() {
    if (this.isOpen('storage')) return Promise.resolve();
    const st = this.story, Ro = this.roster;
    const root = st.view('storage', K, L('st.title'), 'DialogueUI/Dialogue_Icon_SlimeArchive'); root.classList.add('pn-dark');   // nền mờ + tối như v4van_sheet_slime_storage
    const pods = X(root, K, 48, 82, 74, 470, { n: 'storagePods' });
    const grid = X(root, K, 136, 86, 320, 380, { n: 'storageGrid' });
    const info = X(root, K, 462, 88, 360, 110, { n: 'storageInfo' });
    const portrait = X(root, K, 636, 384, 128, 128, { n: 'storagePortrait' });   // [ĐO TRONG ẢNH] slime ~90 px ở (700,445) của khung 1280x720
    const right = X(root, K, 962, 86, 290, 610, { ar: true, n: 'storageDetail' });
    const bag = X(root, K, 140, 668, 170, 30, { spr: 'Common/Ui_Bg_Rectangle_Round_02_68px', col: [0.1, 0.1, 0.1, 0.6], sl: true, cls: 'row', ab: true });
    bag.style.justifyContent = 'space-between'; bag.style.padding = `0 ${16 * K}px`;
    text(bag, L('st.bag'), 15 * K); const bagText = text(bag, '', 15 * K); bagText.dataset.hud = 'storageBag';
    let sel = { where: 'party', i: 0 };
    const draw = () => {
      pods.innerHTML = ''; grid.innerHTML = ''; info.innerHTML = ''; right.innerHTML = '';
      const party = Ro.partyRecs(), store = Ro.storageRecs();
      bagText.textContent = store.length + '/' + STORAGE_MAX;
      // SlimeInventoryPods: 6 SlimeArchivePodLayout 140x136 (UI_Bg_Slimeslot + Deco, LV, EquipMarker), ô trống UI_Bg_Slimeslot_Empty + Symbol
      for (let i = 0; i < PARTY_MAX; i++) {
        const r = party[i], y = i * 78;
        const p = X(pods, K, 0, y, 70, 68, { cls: 'pn-card' + (r ? ' btn' : ''), n: r ? 'storagePod' : 'storagePodEmpty' });
        if (!r) { paint(p, 'SlimeInventoryUI/UI_Bg_Slimeslot_Empty', { color: [0, 0.1, 0.2, 0.7], sliced: true }); X(p, K, 14, 14, 42, 38, { spr: 'Common/Popup_Bg_Symbol_01', col: [1, 1, 1, 0.1] }); continue; }
        p.dataset.uid = r.uid; p.dataset.name = displayName(r);
        paint(p, 'SlimeInventoryUI/UI_Bg_Slimeslot', { sliced: true });
        X(p, K, 2, 1, 66, 66, { spr: 'SlimeInventoryUI/UI_BG_Slimeslot_Deco', col: [1, 1, 1, 0.7], sl: true });
        const ic = img(p, 'img/sl/' + r.typeId + '.webp', 10, 2, 50, 50, 'sl' + (r.fainted ? ' fainted' : ''));
        void ic;
        const lv = X(p, K, 0, 46, 70, 18, { cls: 'row center' }); lv.style.gap = '4px'; text(lv, 'LV', 10 * K, NAVY); text(lv, String(r.level), 12 * K, NAVY);
        if (r.uid === Ro.active().uid) X(p, K, -6, -6, 26, 26, { spr: 'Icon/Icon_PartnerMarker_Badge' });
        if (sel.where === 'party' && sel.i === i) X(p, K, -3, -3, 76, 74, { spr: 'Common/Ui_Frame_Outline', sl: true, cls: 'pn-sel' });
        p.addEventListener('pointerdown', e => { e.stopPropagation(); sel = { where: 'party', i }; draw(); });
      }
      // SlimeStorageList: lưới 4 cột (SlimeArchiveListCellPod = UI_Frame_Slot_Box01, ảnh 110, "LV n"); ô trống tối
      for (let i = 0; i < STORAGE_MAX; i++) {
        const r = store[i], x = (i % 4) * 81, y = Math.floor(i / 4) * 94;
        const c = X(grid, K, x, y, 70, 78, { cls: 'pn-card' + (r ? ' btn' : ''), n: r ? 'storageCell' : null });
        if (!r) { X(c, K, 2, 4, 66, 72, { spr: 'Common/UI_Frame_Item_Box01', col: [0, 0.1, 0.2, 0.6] }); continue; }
        c.dataset.uid = r.uid; c.dataset.name = displayName(r);
        paint(c, 'Common/UI_Frame_Slot_Box01');
        img(c, 'img/sl/' + r.typeId + '.webp', 9, 6, 52, 52, 'sl');
        const lv = X(c, K, 0, 58, 70, 16, { cls: 'row center' }); lv.style.gap = '3px'; text(lv, 'LV', 9 * K, NAVY); text(lv, String(r.level), 11 * K, NAVY);
        if (sel.where === 'storage' && sel.i === i) X(c, K, -3, -3, 76, 84, { spr: 'Common/Ui_Frame_Outline', sl: true, cls: 'pn-sel' });
        c.addEventListener('pointerdown', e => { e.stopPropagation(); sel = { where: 'storage', i }; draw(); });
      }
      const r = (sel.where === 'party' ? party : store)[sel.i];
      if (!r) {
        portrait.innerHTML = ''; portrait.dataset.id = '';
        const em = X(right, K, 0, 240, 290, 40, { cls: 'center' }); text(em, L('st.emptySlot'), 15 * K, [1, 1, 1, 0.7]); return;
      }
      // SlimeNameLayout: biệt danh (fs54), tên loài xanh nhạt (fs36), thẻ hệ
      const n1 = X(info, K, 6, 2, 340, 26, { cls: 'row' }); n1.style.gap = 8 * K + 'px'; text(n1, displayName(r), 18 * K, [1, 1, 1, 1], 'outline').dataset.hud = 'storageName';
      if (r.uid === Ro.active().uid) F(n1, 22 * K, 22 * K, { spr: 'Icon/Icon_PartnerMarker' });
      if (r.fainted) F(n1, 22 * K, 22 * K, { spr: 'Icon/Icon_Faint' });
      const n2 = X(info, K, 6, 28, 340, 22, { cls: 'row' }); text(n2, speciesName(r.typeId), 15 * K, [0.6, 0.9, 1, 1]);
      elementsOf(r.typeId).forEach((e, k) => elemTag(info, 4 + k * 96, 54, e));
      if (portrait.dataset.id !== r.typeId) putPortrait(portrait, this.renderer, r.typeId);
      // BaseInfoLayout: Level + EXP, HP / MP / Stamina, Skill (4 ô khoá), nút Take It / Archive
      const lvb = X(right, K, 0, 0, 288, 58, { spr: 'Common/Ui_Bg_Round_01_40px', col: [1, 1, 1, 0.2], sl: true });
      const lt = X(lvb, K, 16, 6, 60, 14, { cls: 'row center' }); text(lt, L('st.level'), 9 * K, [0.8, 0.9, 1, 1]);
      const ln = X(lvb, K, 16, 20, 60, 32, { cls: 'row center' }); text(ln, String(r.level), 24 * K, [0.8, 0.9, 1, 1]);
      const need = RULES.partner.expToNext(r.level);
      const ex = X(lvb, K, 92, 16, 70, 18, { cls: 'row' }); text(ex, 'EXP', 11 * K, [1, 1, 1, 1]);
      const ev = X(lvb, K, 196, 16, 84, 18, { cls: 'row' }); ev.style.justifyContent = 'flex-end'; text(ev, r.exp + '/' + need, 10 * K, [1, 1, 1, 1]);
      X(lvb, K, 92, 37, 186, 7, { spr: 'Common/Ui_Bg_Rectangle_Round_02_20px', col: [0, 0.1, 0.2, 1], sl: true });
      X(lvb, K, 92, 37, Math.max(2, 186 * Math.min(1, r.exp / need)), 7, { spr: 'Common/UI_Exp_Gauge_Fill' });
      const mh = Ro.maxHp(r), mm = Ro.maxMp(r);
      const rows = [['HP', 'Stat/Icon_Stat_Hp', [0.6, 1, 0.4, 1], r.hp, 'Game/UI_Gauge_HP_Big', Math.round(r.hp * mh) + '/' + mh],
        ['MP', 'Stat/Icon_Stat_Mp', [0.5, 1, 1, 1], r.mp, 'Game/UI_Gauge_MP_Big', Math.round(r.mp * mm) + '/' + mm],
        [vi() ? 'Thể Lực' : 'Stamina', 'Stat/Icon_Stat_Stamina', [1, 0.8, 0.4, 1], r.stamina, 'Game/UI_Gauge_Stamina_Big', Math.round(r.stamina * 100) + '/100']];
      rows.forEach(([t0, ic, col, v, front, lab], k) => {
        const y = 66 + k * 22;
        X(right, K, 0, y + 2, 14, 14, { spr: ic, col });
        const tl = X(right, K, 20, y, 80, 18, { cls: 'row' }); text(tl, t0, 12 * K, [1, 1, 1, 1]);
        gauge(right, 108, y + 2, 180, 14, v, front, lab);
      });
      const sk = X(right, K, 0, 140, 200, 22, { cls: 'row' }); sk.style.gap = 6 * K + 'px';
      F(sk, 18 * K, 18 * K, { spr: 'DialogueUI/Dialogue_Icon_Perk' }); text(sk, L('st.skill'), 13 * K, [1, 1, 1, 1]);
      const sbg = X(right, K, 0, 166, 288, 376, { spr: 'Common/Ui_Bg_Round_01_40px', col: [1, 1, 1, 0.2], sl: true });
      for (let k = 0; k < 4; k++) { const s = X(sbg, K, 20 + k * 66, 14, 48, 48, { spr: 'Common/Ui_Bg_Round_02_264px', col: [0.04, 0.16, 0.22, 0.9] }); X(s, K, 14, 13, 20, 22, { spr: 'Icon/Icon_Lock', col: [0.55, 0.85, 0.9, 1] }); }
      X(sbg, K, 10, 74, 268, 292, { spr: 'Common/Ui_Bg_Round_01_40px', col: [0.1, 0.1, 0.1, 0.4], sl: true });
      const take = sel.where === 'storage';
      const btn = X(right, K, 130, 552, 158, 56, { spr: 'Common/Btn_Square_01_Medium_Blue', cls: 'btn center', n: take ? 'storageTake' : 'storageArchive' });
      text(btn, L(take ? 'st.take' : 'st.archive'), 19 * K, NAVY);
      btn.addEventListener('pointerdown', e => {
        e.stopPropagation();
        const res = take ? Ro.take(r.uid) : Ro.archive(r.uid);
        const msg = { full: take ? 'st.takeFail' : 'st.archiveFail', equipped: 'st.equipped', last: 'st.lastSlime', missing: take ? 'st.takeFail' : 'st.archiveFail' }[res];
        if (msg) st.hud.toast(L(msg));
        else sel = take ? { where: 'party', i: Ro.partyRecs().length - 1 } : { where: 'storage', i: Ro.storageRecs().length - 1 };
        this.E.sync(); draw();
      });
    };
    draw();
    st.pushModal('storage', root, e => { if (e.code === 'Escape') st.popModal('storage'); });
    this.E.ev('storageOpen', {});
    return this.waitClose(root);
  }

  // ================================================================ Bách Khoa Slime (B)
  async openDex() {
    if (this.isOpen('dex')) return;
    const st = this.story, Ro = this.roster, list = await loadDex();
    const root = st.view('dex', K, L('dex.title'), 'DialogueUI/Dialogue_Icon_Index'); root.classList.add('pn-dark');
    const pts = list.reduce((a, d) => a + (DEX_POINT[Ro.degree(d.id)] || 0), 0);
    const cp = X(root, K, 932, 24, 220, 32, { ar: true, cls: 'row' }); cp.style.gap = 10 * K + 'px';
    F(cp, 24 * K, 24 * K, { spr: 'Icon/Icon_IndexRank' });
    text(cp, L('dex.point') + ' ' + fmt(pts), 16 * K).dataset.hud = 'dexPoint';
    const sc = X(root, K, 44, 88, 540, 562, { cls: 'pn-scroll', n: 'dexGrid' });
    const found = list.filter(d => Ro.degree(d.id) >= 1).length, caught = list.filter(d => Ro.degree(d.id) >= 2).length;
    const p1 = X(root, K, 50, 662, 146, 30, { spr: 'Common/Ui_Bg_Rectangle_Round_02_68px', col: [0.1, 0.1, 0.1, 0.6], sl: true, cls: 'row center', ab: true });
    text(p1, L('dex.found', { FoundCount: found }), 13 * K).dataset.hud = 'dexFound';
    const p2 = X(root, K, 200, 662, 132, 30, { spr: 'Common/Ui_Bg_Rectangle_Round_02_68px', col: [0.1, 0.1, 0.1, 0.6], sl: true, cls: 'row center', ab: true });
    text(p2, L('dex.caught', { CaughtCount: caught }), 13 * K).dataset.hud = 'dexCaught';
    const flt = X(root, K, 504, 658, 40, 40, { spr: 'Common/Ui_Bg_Round_02_264px', col: [0.85, 0.93, 1, 1], ab: true }); X(flt, K, 10, 10, 20, 20, { spr: 'Icon/Icon_Filter', col: NAVY });
    const det = X(root, K, 600, 86, 640, 570, { n: 'dexDetail' });
    let sel = 0;
    const cells = [];
    const drawDetail = () => {
      det.innerHTML = '';
      const d = list[sel], g = Ro.degree(d.id);
      const stp = X(det, K, 8, 8, null, 26, { spr: 'Common/Ui_Bg_Rectangle_Round_02_42px', col: [0.1, 0.1, 0.2, 0.6], sl: true, cls: 'row center' }); stp.style.gap = 6 * K + 'px';
      F(stp, 20 * K, 20 * K, { spr: 'IndexUI/Icon_index_Step0' + g });
      text(stp, L(['dex.noData', 'dex.discover', 'dex.tame', 'dex.bond'][g]), 13 * K).dataset.hud = 'dexDegree';
      const no = X(det, K, 8, 36, 300, 32, { cls: 'row' }); no.style.gap = 8 * K + 'px'; text(no, 'No.', 20 * K, [1, 1, 1, 1], 'outline'); text(no, String(d.no).padStart(3, '0'), 20 * K, [1, 1, 1, 1], 'outline').dataset.hud = 'dexNo';
      const nm = X(det, K, 8, 68, 400, 28, { cls: 'row' }); text(nm, g ? speciesName(d.id) : '???', 18 * K, [0.6, 0.9, 1, 1]).dataset.hud = 'dexName';
      if (g) elementsOf(d.id).forEach((e, k) => elemTag(det, 8 + k * 96, 102, e));
      const pv = X(det, K, 170, 130, 300, 300, { n: 'dexPortrait' });
      if (g >= 2) putPortrait(pv, this.renderer, d.id);
      else if (g === 1) { const s = img(pv, 'img/sl/' + d.id + '.webp', 40, 40, 220, 220, 'sil'); s.style.position = 'absolute'; pv.parentElement.querySelector('[data-hud="dexPortrait"]').classList.add('pn-card'); }
      else X(det, K, 262, 186, 110, 110, { spr: 'Icon/Img_SkeletonIcon', col: [0.6, 0.9, 1, 0.7] });   // PortraitDefault [ĐO TRONG ẢNH] ~110 px ở (920,330)
      X(det, K, 0, 562, 640, 3, { spr: 'Common/Ui_Bg_Rectangle_Round_02_12px', col: [0.7, 0.9, 1, 0.2] });
      const b1 = X(det, K, 400, 504, 236, 22, { cls: 'row' }); b1.style.justifyContent = 'flex-end'; b1.style.gap = 6 * K + 'px';
      F(b1, 16 * K, 16 * K, { spr: 'IndexUI/Icon_Index_FirstRegist' }); text(b1, g >= 2 ? (Ro.partyRecs().concat(Ro.storageRecs()).find(r => r.typeId === d.id) || {}).tamedAt?.slice(0, 10).replace(/-/g, '.') || '???' : '???', 13 * K);
      const b2 = X(det, K, 300, 530, 336, 22, { cls: 'row' }); b2.style.justifyContent = 'flex-end'; b2.style.gap = 6 * K + 'px';
      F(b2, 16 * K, 16 * K, { spr: 'IndexUI/Icon_Index_FirstName' }); text(b2, '???', 13 * K);
      F(b2, 16 * K, 16 * K, { spr: 'IndexUI/Icon_Index_FirstCount' }); text(b2, '??? ' + L('dex.bonding'), 13 * K);
    };
    list.forEach((d, i) => {
      const g = Ro.degree(d.id), x = (i % 5) * 106, y = Math.floor(i / 5) * 128;
      // SlimeIndexListCellPod 186x224: UI_Frame_Slot_Box01, Index "001" fs20, Portrait 130, tên fs26, thẻ hệ nhỏ x0.6, badge N
      const c = X(sc, K, x + 6, y + 6, 93, 114, { cls: 'pn-card btn', n: 'dexCell' });
      c.dataset.id = d.id; c.dataset.degree = g;
      paint(c, 'Common/UI_Frame_Slot_Box01');
      const no = X(c, K, 0, 4, 93, 20, { cls: 'row center' }); text(no, String(d.no).padStart(3, '0'), 13 * K, NAVY).style.fontWeight = '800';
      if (g === 0) X(c, K, 22, 30, 50, 50, { spr: 'Icon/Img_SkeletonIcon', col: [0.1, 0.3, 0.4, 0.3] });   // DefaultIcon 124x104 (0.1,0.3,0.4,0.3)
      else {
        img(c, 'img/sl/' + d.id + '.webp', 16, 26, 62, 62, 'sl' + (g === 1 ? ' sil' : ''));
        const nm = X(c, K, 2, 92, 89, 18, { cls: 'row center' }); text(nm, speciesName(d.id), 10 * K, g === 1 ? [1, 1, 1, 1] : NAVY, g === 1 ? 'outline' : '');
        elementsOf(d.id).forEach((e, k) => { const t = X(c, K, 70, 4 + k * 20, 20, 18, { spr: 'Element/UI_Bg_Element_' + ELEM[e][0], sl: true }); X(t, K, 2, 1, 16, 16, { spr: 'Element/Element_' + ELEM[e][1] }); });
      }
      const outl = X(c, K, -2, -2, 97, 118, { spr: 'Common/Ui_Frame_Outline', sl: true, cls: 'pn-sel' }); outl.hidden = i !== sel;
      cells.push(outl);
      c.addEventListener('pointerdown', e => { e.stopPropagation(); cells[sel].hidden = true; sel = i; cells[sel].hidden = false; drawDetail(); });
    });
    drawDetail();
    st.pushModal('dex', root, e => {
      if (e.code === 'Escape' || e.code === 'KeyB') st.popModal('dex');
      else if (/^Arrow/.test(e.code)) { cells[sel].hidden = true; sel = Math.max(0, Math.min(list.length - 1, sel + { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 }[e.code])); cells[sel].hidden = false; drawDetail(); }
    });
    this.E.ev('dexOpen', { found, caught });
    return this.waitClose(root);
  }

  // ================================================================ biệt danh sau khi bắt (v4van_nickname_synthesis_lab)
  // "Would you like to give the <loài> a nickname?" [Next time] [Nickname] -> ô nhập (Nickname Setting, tối đa 18 ký tự)
  askNickname(rec) {
    const st = this.story;
    return new Promise(res => {
      const root = R(st.layer, { a: [0, 0, 1, 1], n: 'nickAsk', cls: 'view dimlight' });
      const pv = X(root, K, 560, 250, 160, 160, { ac: true, n: 'nickPortrait' });   // [ĐO TRONG ẢNH] slime ~130 px ở giữa khoang, chữ y 540, nút y 617 (khung 1280x720)
      putPortrait(pv, this.renderer, rec.typeId);
      const q = X(root, K, 240, 522, 800, 40, { ac: true, cls: 'center' }); text(q, L('tame.askNick', { name: speciesName(rec.typeId) }), 21 * K, [1, 1, 1, 1], 'outline').dataset.hud = 'nickAskText';
      const row = X(root, K, 340, 586, 600, 64, { ac: true, cls: 'row center' }); row.style.gap = 28 * K + 'px';
      const finish = v => { st.popModal('nickAsk'); res(v); };
      const mk = (label, green, nm, v) => {
        const b = F(row, 146 * K, 56 * K, { spr: green ? 'Common/Btn_Square_01_Medium_Green' : 'Common/Btn_Square_01_Medium_Blue', cls: 'btn center', n: nm });
        text(b, label, 17 * K, NAVY); b.addEventListener('pointerdown', e => { e.stopPropagation(); finish(v); });
      };
      mk(L('tame.nextTime'), false, 'nickLater', null);
      mk(L('tame.nickname'), true, 'nickYes', 'name');
      st.pushModal('nickAsk', root, e => { if (e.code === 'Escape') finish(null); else if (e.code === 'Space' || e.code === 'Enter') finish('name'); });
    }).then(v => v === 'name' ? this.nicknameInput(rec) : null);
  }
  nicknameInput(rec) {
    const st = this.story;
    return new Promise(res => {
      const root = R(st.layer, { a: [0, 0, 1, 1], n: 'nickInput', cls: 'view dimlight' });
      const box = panel(root, K, 418, 210, 444, 300, 'Container/Popup_01_Small', { ac: true, am: true });
      const tp = X(box, K, 104, -2, 236, 64, { spr: 'Common/Popup_Title_01', cls: 'center' }); text(tp, L('tame.nickTitle'), 18 * K);
      X(box, K, 40, 96, 364, 56, { spr: 'Common/Btn_Square_03_Large', sl: true });
      const inp = document.createElement('input'); inp.className = 'pn-input u'; inp.maxLength = 18; inp.dataset.hud = 'nickField';
      inp.placeholder = L('tame.nickHint', { Length: 18 }); inp.value = speciesName(rec.typeId);
      Object.assign(inp.style, { left: 52 * K + 'px', top: 100 * K + 'px', width: 340 * K + 'px', height: 48 * K + 'px' });
      box.appendChild(inp);
      const row = X(box, K, 0, 196, 444, 64, { cls: 'row center' }); row.style.gap = '56px';
      const finish = v => { st.popModal('nickInput'); res(v); };
      for (const [label, v, green, nm] of [[L('ui.cancel'), false, false, 'nickCancel'], [L('ui.confirm'), true, true, 'nickOk']]) {
        const b = F(row, 232, 124, { spr: green ? 'Common/Btn_Square_01_Medium_Green' : 'Common/Btn_Square_01_Medium_Blue', cls: 'btn center', n: nm });
        text(b, label, 21 * K, NAVY);
        b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); finish(v ? inp.value : null); });
      }
      st.pushModal('nickInput', root, e => { if (e.code === 'Escape') finish(null); else if (e.code === 'Enter' || e.code === 'NumpadEnter') finish(inp.value); });
      // ô nhập cần nhận phím: Story.key chặn mọi phím khi có bảng, nên chuyển chữ vào ô nhập ở đây
      inp.addEventListener('keydown', e => e.stopPropagation());
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
    }).then(v => { if (v != null && v.trim()) { this.roster.rename(rec.uid, v); this.E.sync(); } return v; });
  }
}
