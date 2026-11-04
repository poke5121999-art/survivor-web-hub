// Meta screens reached from the world map: the shop (JEWEL / GOLD / ETC tabs), the UPGRADE popup and the ITEM tab
// (Scene_Bag). Prices and rules come from js/meta.js -> data/meta.json (shop, items, upgrade). The original art is
// used throughout; positions are web layout (the original positions are computed from other nodes and were not
// recovered), so nothing here is CLIP-MEASURED unless it says so.
import { W, H } from './sim.js';

export const SHOP_LAYOUT = {
  tabs: ['JEWEL', 'GOLD', 'ETC'].map((name, i) => ({ name, x: 18 + i * 150, y: 186, w: 140, h: 62 })),
  row: i => ({ x: 18, y: 262 + i * 72, w: 444, h: 68 }),
  buy: i => ({ x: 338, y: 270 + i * 72, w: 116, h: 52 }),
  free: { x: 330, y: 132, w: 125, h: 59 },
  back: { x: 133, y: 712, w: 214, h: 64 },
};
export const UPG_LAYOUT = {
  close: { x: 412, y: 214, w: 50, h: 50 },
  weapon: { x: 206, y: 300, w: 122, h: 112 },
  armor: { x: 336, y: 300, w: 122, h: 112 },
};
// bag: 4 equip slots on the wall, 6 x 3 grid per page in the light panel, buttons on the stone strip
export const BAG_LAYOUT = {
  equip: [0, 1, 2, 3].map(i => ({ x: 38 + i * 106, y: 150, w: 86, h: 86 })),
  cell: i => ({ x: 22 + (i % 6) * 73, y: 352 + Math.floor(i / 6) * 92, w: 70, h: 86 }),
  prev: { x: 20, y: 640, w: 60, h: 46 },
  next: { x: 400, y: 640, w: 60, h: 46 },
  box: { x: 20, y: 700, w: 214, h: 64 },
  expand: { x: 246, y: 700, w: 214, h: 64 },
  back: { x: 400, y: 20, w: 64, h: 64 },
  // item info popup
  pop: { x: 20, y: 250, w: 440, h: 300 },
  equipBtn: { x: 36, y: 480, w: 126, h: 56 },
  intenBtn: { x: 177, y: 480, w: 126, h: 56 },
  sellBtn: { x: 318, y: 480, w: 126, h: 56 },
  popClose: { x: 412, y: 254, w: 44, h: 44 },
};
const PER_PAGE = 18;
const inside = (p, b) => !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
const fmt = (s, v) => s.replace('%d', v).replace('%%', '%');

export function createMetaUI(gfx, meta, metaData, hooks) {
  const { ctx, img, frame, frameC, label, plain } = gfx;
  const SHOP = metaData.shop;
  const MSG = SHOP.messages.value;
  const IT = metaData.items;
  const st = { tab: 'GOLD', page: 0, sel: null };

  function button(b, text, color = '#ffe9a8', size = 20, dim = false) {
    ctx.save();
    if (dim) ctx.globalAlpha = 0.5;
    ctx.drawImage(img('btn_r').img, b.x, b.y, b.w, b.h);
    ctx.restore();
    plain(text, b.x + b.w / 2, b.y + b.h / 2, size, color, 'center');
  }
  // gold / gem boards (board_money frame 0 gold, 1 gem) with the "+" that opens the shop
  function boards(x, y, plus = true) {
    frame('board_money', 0, x, y, { scale: 0.9 });
    frame('board_money', 1, x, y + 50, { scale: 0.9 });
    plain(String(meta.gold()), x + 158, y + 24, 19, '#f3e04a', 'right');
    plain(String(meta.gems()), x + 158, y + 74, 19, '#5fe0f0', 'right');
    if (plus) {
      ctx.drawImage(img('btn_more').img, x + 160, y + 3, 44, 29);
      ctx.drawImage(img('btn_more').img, x + 160, y + 53, 44, 29);
    }
  }
  const boardPlus = (x, y) => ({ gold: { x: x + 156, y, w: 52, h: 46 }, gem: { x: x + 156, y: y + 50, w: 52, h: 46 } });
  const itemIcon = (id, cx, cy, scale = 0.8) => {
    const k = meta.kind(id);
    const sheet = ['item_weapon', 'item_armor', 'item_ring', 'item_necklace'][k.slot];
    const order = metaData.items.kinds.value.filter(o => o.slot === k.slot).map(o => o.id);
    frameC(sheet, Math.max(0, order.indexOf(id)), cx, cy, { scale });
  };

  // ---------------- shop ----------------
  function shopRows() {
    if (st.tab === 'JEWEL') return SHOP.jewelPacks.value.map(p => ({ icon: ['icon_gem', 0], text: `${p.gems} JEWEL ${p.badge}`.trim(), price: `$${p.usd}`, off: true }));
    if (st.tab === 'GOLD') return SHOP.goldPacks.value.map(p => ({ icon: ['icons', 31], text: `${p.gold.toLocaleString('en-US')} GOLD`, gems: p.gems }));
    return SHOP.etc.value.map((e, i) => ({ icon: ['icons', 32 + i], text: e.label, gems: e.gems, off: e.key.startsWith('ticket') }));
  }
  function drawShop(dt) {
    const sb = img('shop_bg');
    ctx.drawImage(sb.img, 0, 0, sb.dw || sb.w, sb.dh || sb.h);
    gfx.tileX('bg_top', -70);
    label('SHOP', W / 2, 40, 30, '#ffd23a');
    boards(14, 76);
    // daily free jewel (Scene_MAP_UI::FUC_GET_JEWLE_ONCE_FOR_A_DAY): the original button plays an ad; here it is just once a day
    const fb = SHOP_LAYOUT.free;
    ctx.save();
    if (!meta.dailyGemReady()) ctx.globalAlpha = 0.4;
    ctx.drawImage(img('btn_free').img, fb.x, fb.y);
    ctx.restore();
    plain(meta.dailyGemReady() ? '+1 JEWEL TODAY' : 'COME BACK TOMORROW', fb.x + fb.w / 2, fb.y - 10, 12, '#fff', 'center');
    plain(`HEART ${meta.hearts()}/${meta.heartsMax()}`, 248, 104, 16, '#ff9a9a');
    for (const tb of SHOP_LAYOUT.tabs) {
      frame('btn_shop', tb.name === st.tab ? 0 : 1, tb.x, tb.y, { scale: tb.w / 110 });
      plain(tb.name, tb.x + tb.w / 2, tb.y + tb.h / 2 + 2, 20, tb.name === st.tab ? '#ffd23a' : '#9a8f80', 'center');
    }
    shopRows().forEach((r, i) => {
      const b = SHOP_LAYOUT.row(i);
      ctx.drawImage(img('list_shop').img, b.x, b.y);
      frameC(r.icon[0], r.icon[1], b.x + 38, b.y + 34, { scale: r.icon[0] === 'icons' ? 0.8 : 0.9 });
      plain(r.text, b.x + 76, b.y + 34, r.text.length > 22 ? 14 : 17, '#e8e0cc');
      const bb = SHOP_LAYOUT.buy(i);
      if (r.price) button(bb, r.price, '#bbb', 17, true);
      else {
        button(bb, '', '#fff', 17, r.off);
        frameC('icons', 6, bb.x + 30, bb.y + bb.h / 2, { scale: 0.5 });
        plain(String(r.gems), bb.x + 84, bb.y + bb.h / 2, 19, r.gems > meta.gems() ? '#ff8a7a' : '#fff', 'center');
      }
    });
    if (st.tab === 'JEWEL') plain('REAL-MONEY PACKS: NOT SOLD IN THE WEB VERSION', W / 2, 700, 13, '#ffb35a', 'center');
    if (st.tab === 'ETC') plain('TICKETS ARE FOR THE TOWER OF DEATH (NOT BUILT YET)', W / 2, 700, 13, '#ffb35a', 'center');
    button(SHOP_LAYOUT.back, 'BACK', '#ffe9a8', 24);
    hooks.drawToast(dt);
  }
  function shopTap(p) {
    if (inside(p, SHOP_LAYOUT.back)) return { back: true };
    if (inside(p, SHOP_LAYOUT.free)) {
      if (meta.claimDailyGem()) { hooks.toast(`+${SHOP.dailyGem.value} JEWEL\n${MSG.dailyGem}`); return { free: 'ok' }; }
      hooks.toast(MSG.dailyGem);
      return { free: 'done' };
    }
    const tb = SHOP_LAYOUT.tabs.find(t => inside(p, t));
    if (tb) { st.tab = tb.name; return { tab: tb.name }; }
    const i = shopRows().findIndex((r, j) => inside(p, SHOP_LAYOUT.buy(j)));
    if (i < 0) return null;
    if (st.tab === 'JEWEL') { hooks.toast('JEWEL PACKS ARE REAL-MONEY\nPURCHASES IN THE ORIGINAL GAME'); return { buy: 'jewel', result: 'off' }; }
    if (st.tab === 'ETC' && SHOP.etc.value[i].key.startsWith('ticket')) { hooks.toast('TICKETS ARE FOR THE TOWER OF DEATH\nNOT IN THE WEB VERSION YET'); return { buy: 'ticket', result: 'off' }; }
    const r = st.tab === 'GOLD' ? meta.buyGold(i) : meta.buyEtc(i);
    if (r === 'gems') hooks.toast(MSG.noGems);
    else if (r === 'heartMax') hooks.toast(MSG.heartMax);
    else if (r === 'ok') hooks.toast(st.tab === 'GOLD' ? `+${SHOP.goldPacks.value[i].gold} GOLD` : `${SHOP.etc.value[i].label}!`);
    return { buy: `${st.tab.toLowerCase()}${i}`, result: r };
  }

  // ---------------- UPGRADE popup (the prep panel's weapon / armor cards, reachable from the map) ----------------
  function drawUpgrade(drawCard, drawKnight) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img('popup_prep').img, 0, 200, W, 300);
    label('UPGRADE', W / 2, 236, 26, '#ffd23a');
    frame('btn_option', 6, UPG_LAYOUT.close.x, UPG_LAYOUT.close.y);
    drawKnight(110, 420, 0.85);
    const s = meta.stats();
    plain(`ATK ${s.atk}  DEF ${s.def}  HP ${s.hp}`, 24, 446, 14, '#fff');
    drawCard('weapon', UPG_LAYOUT.weapon);
    drawCard('armor', UPG_LAYOUT.armor);
    plain('SWORD: ATK + DASH POWER    HELMET: DEF + HP', W / 2, 474, 13, '#cfc7bd', 'center');
    boards(136, 520, false);
  }
  function upgradeTap(p) {
    if (inside(p, UPG_LAYOUT.close)) return { close: true };
    for (const kind of ['weapon', 'armor']) {
      if (!inside(p, UPG_LAYOUT[kind])) continue;
      const r = meta.upgrade(kind);
      if (r === 'gold') hooks.toast('NOT ENOUGH GOLD');
      else if (r === 'max') hooks.toast('MAX LEVEL');
      return { upgrade: kind, result: r };
    }
    if (p.y < 200 || p.y > 620) return { close: true };
    return null;
  }

  // ---------------- ITEM tab (Scene_Bag) ----------------
  function itemLines(it) {
    const k = meta.kind(it.id);
    const out = [];
    const mt = IT.mainText.value[String(k.main)];
    if (k.main >= 0 && mt) out.push(fmt(mt, meta.itemValue(it)));
    else out.push('NO EFFECT (CHEAP TO INTENSIFY)');
    for (const [ok, ov] of it.opts) out.push(`+ ${fmt(IT.optionText.value[ok], ov)}`);
    return out;
  }
  function drawBag(dt) {
    const bg = img('bag_bg');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(bg.img, 0, 0, W, H);
    label('INVENTORY', 24, 40, 26, '#ffd23a', 'left');
    frame('btn_option', 6, BAG_LAYOUT.back.x + 7, BAG_LAYOUT.back.y + 7);
    plain(`GOLD ${meta.gold()}   JEWEL ${meta.gems()}`, 24, 82, 16, '#f3e04a');
    const names = IT.slotNames.value;
    BAG_LAYOUT.equip.forEach((b, slot) => {
      frame('slot_item', 0, b.x - 2, b.y - 2, { scale: 1 });
      const it = meta.equipped(slot);
      if (it) itemIcon(it.id, b.x + b.w / 2, b.y + b.h / 2, 0.9);
      plain(names[slot], b.x + b.w / 2, b.y + b.h + 12, 12, '#fff', 'center');
    });
    const s = meta.stats();
    const bo = meta.itemBonus();
    plain(`ATK ${s.atk}  HP ${s.hp}  CRIT +${bo.crit}%  DASH ${s.skill}${bo.cd ? `  COOL -${bo.cd}s` : ''}`, W / 2, 278, 14, '#fff', 'center');
    const bag = meta.bag();
    const pages = Math.max(1, Math.ceil(meta.slots() / PER_PAGE));
    st.page = Math.min(st.page, pages - 1);
    for (let i = 0; i < PER_PAGE; i++) {
      const idx = st.page * PER_PAGE + i;
      if (idx >= meta.slots()) break;
      const b = BAG_LAYOUT.cell(i);
      frame('bag_slot', 0, b.x - 10, b.y - 2, { scale: 0.86 });
      const it = bag[idx];
      if (!it) continue;
      itemIcon(it.id, b.x + 28, b.y + 36, 0.72);
      if (it.lv) plain(`+${it.lv}`, b.x + 56, b.y + 10, 12, '#7fff7f', 'right');
      if (it.eq) plain('E', b.x + 2, b.y + 10, 13, '#ffd23a');
      if (st.sel === idx) { ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 3; ctx.strokeRect(b.x - 8, b.y - 1, 74, 76); }
    }
    plain(`${bag.length}/${meta.slots()}`, W / 2, 663, 18, '#fff', 'center');
    if (pages > 1) { button(BAG_LAYOUT.prev, '<', '#fff', 22); button(BAG_LAYOUT.next, '>', '#fff', 22); plain(`PAGE ${st.page + 1}/${pages}`, W / 2, 686, 12, '#cfc7bd', 'center'); }
    const box = BAG_LAYOUT.box;
    button(box, '', '#fff', 18);
    frameC('icons', 29, box.x + 30, box.y + 32, { scale: 0.55 });
    const free = hooks.freeBox && hooks.freeBox();
    plain('ITEM BOX', box.x + 112, box.y + 22, 17, '#fff', 'center');
    plain(free ? 'ONE FREE!!' : `${IT.boxGems.value} JEWEL`, box.x + 112, box.y + 44, 14, free ? '#7fff7f' : '#5fe0f0', 'center');
    const ex = BAG_LAYOUT.expand;
    const S = IT.slots.value;
    button(ex, '', '#fff', 18, meta.slots() >= S.max);
    plain(`EXPAND ${S.step} SLOTS`, ex.x + ex.w / 2, ex.y + 22, 16, '#fff', 'center');
    plain(meta.slots() >= S.max ? 'MAX' : `${S.gems} JEWEL`, ex.x + ex.w / 2, ex.y + 44, 14, '#5fe0f0', 'center');
    if (st.sel !== null && bag[st.sel]) drawItemPopup(bag[st.sel]);
    hooks.drawToast(dt);
  }
  function drawItemPopup(it) {
    const P = BAG_LAYOUT.pop;
    const k = meta.kind(it.id);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#17110c';
    ctx.fillRect(P.x + 4, P.y + 4, P.w - 8, P.h - 8);
    ctx.drawImage(img('popup_prep').img, P.x, P.y, P.w, P.h);
    frame('btn_option', 6, BAG_LAYOUT.popClose.x, BAG_LAYOUT.popClose.y, { scale: 0.88 });
    frame('slot_item', 0, P.x + 18, P.y + 50);
    itemIcon(it.id, P.x + 63, P.y + 95, 0.95);
    plain(IT.slotNames.value[k.slot], P.x + 124, P.y + 34, 13, '#cfc7bd');
    plain(`${k.name}${it.lv ? ` +${it.lv}` : ''}`, P.x + 124, P.y + 58, 19, '#ffd23a');
    itemLines(it).forEach((ln, i) => plain(ln, P.x + 124, P.y + 90 + i * 24, 14, i ? '#9fe0ff' : '#fff'));
    const BL = BAG_LAYOUT;
    button(BL.equipBtn, it.eq ? 'UNEQUIP' : 'EQUIP', '#fff', 17);
    button(BL.intenBtn, `INTEN ${meta.intenPrice(st.sel)}`, '#fff', 14);
    button(BL.sellBtn, `SELL +${IT.sellGold.value}`, '#fff', 15);
    plain('INTEN USES UP ONE OTHER UNEQUIPPED ITEM', W / 2, P.y + P.h + 16, 12, '#cfc7bd', 'center');
  }
  function bagTap(p) {
    const BL = BAG_LAYOUT;
    const bag = meta.bag();
    if (st.sel !== null && bag[st.sel]) {
      const i = st.sel;
      if (inside(p, BL.popClose) || !inside(p, BL.pop)) { st.sel = null; return { close: 'popup' }; }
      if (inside(p, BL.equipBtn)) {
        if (bag[i].eq) meta.unequip(i); else meta.equip(i);
        st.sel = null;
        return { equip: i, on: !!(bag[i] && bag[i].eq) };
      }
      if (inside(p, BL.sellBtn)) {
        meta.sell(i);
        st.sel = null;
        hooks.toast(`+${IT.sellGold.value} GOLD`);
        return { sell: i };
      }
      if (inside(p, BL.intenBtn)) {
        const r = meta.intensify(i);
        if (r === 'fodder') hooks.toast('NEED ONE OTHER UNEQUIPPED ITEM\nAS THE MATERIAL');
        else if (r === 'gold') hooks.toast('NOT ENOUGH GOLD');
        else if (r === 'ok') { hooks.toast('INTENSIFIED!'); st.sel = null; }
        return { inten: i, result: r };
      }
      return null;
    }
    if (inside(p, BL.back)) return { back: true };
    const ei = BL.equip.findIndex(b => inside(p, b));
    if (ei >= 0) { const it = meta.equipped(ei); if (it) st.sel = bag.indexOf(it); return { slot: ei }; }
    for (let c = 0; c < PER_PAGE; c++) {
      const idx = st.page * PER_PAGE + c;
      if (inside(p, BL.cell(c)) && bag[idx]) { st.sel = idx; return { item: idx }; }
    }
    const pages = Math.max(1, Math.ceil(meta.slots() / PER_PAGE));
    if (pages > 1 && inside(p, BL.prev)) { st.page = (st.page + pages - 1) % pages; return { page: st.page }; }
    if (pages > 1 && inside(p, BL.next)) { st.page = (st.page + 1) % pages; return { page: st.page }; }
    if (inside(p, BL.box)) {
      const free = hooks.freeBox && hooks.freeBox();
      // the tutorial box is free and always Metal Armor (actualCreateBoxItem @0x696b90)
      const r = meta.buyItemBox(Math.random, free ? 11 : null, !!free);
      if (r.r === 'gems') hooks.toast(MSG.noGems);
      else if (r.r === 'full') hooks.toast('NO FREE SLOT: SELL AN ITEM\nOR EXPAND THE SLOTS');
      else { hooks.toast(`GOT ${meta.kind(r.item.id).name.toUpperCase()}!`); st.page = Math.floor(r.index / PER_PAGE); }
      if (free && r.r === 'ok') meta.setTuto(26);
      return { box: r.r, free: !!free, index: r.index };
    }
    if (inside(p, BL.expand)) {
      const r = meta.expandSlots();
      if (r === 'gems') hooks.toast(MSG.noGems);
      else if (r === 'max') hooks.toast('SLOTS ARE ALREADY MAX');
      else hooks.toast(`+${IT.slots.value.step} SLOTS`);
      return { expand: r };
    }
    return null;
  }

  return { st, drawShop, shopTap, drawUpgrade, upgradeTap, drawBag, bagTap, boards, boardPlus, itemIcon };
}
