// Meta screens reached from the world map: the shop (JEWEL / GOLD / ETC tabs), the UPGRADE popup and the ITEM tab
// (Scene_Bag). Prices and rules come from js/meta.js -> data/meta.json (shop, items, upgrade). The original art is
// used throughout; positions are web layout (the original positions are computed from other nodes and were not
// recovered), so nothing here is CLIP-MEASURED unless it says so.
import { W, H } from './sim.js';

export const SHOP_LAYOUT = {
  tabs: ['JEWEL', 'GOLD', 'ETC'].map((name, i) => ({ name, x: 18 + i * 150, y: 186, w: 140, h: 62 })),
  row: i => ({ x: 18, y: 258 + i * 63, w: 444, h: 60 }),
  buy: i => ({ x: 338, y: 262 + i * 63, w: 116, h: 52 }),
  free: { x: 330, y: 132, w: 125, h: 59 },
  back: { x: 133, y: 712, w: 214, h: 64 },
};
export const ABIL_LAYOUT = {
  row: i => ({ x: 30, y: 250 + i * 76, w: 420, h: 70 }),
  close: { x: 412, y: 186, w: 50, h: 50 },
};
// CLEAR BONUS band and chest tap boxes (clip n7SeP1LzYs8 t=4123 scaled to 480x800); ok = touch anywhere once the reward shows
export const BONUS_LAYOUT = { band: { x: 0, y: 282, w: 480, h: 240 }, chest: i => ({ x: [52, 185, 318][i], y: 384, w: 110, h: 124 }), ok: { x: 140, y: 630, w: 200, h: 60 } };
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
    if (st.tab === 'JEWEL') {
      return [...SHOP.jewelPacks.value.map((p, i) => ({ icon: ['icon_gem', Math.min(2, Math.floor(i / 2))], text: `${p.gems} JEWEL ${p.badge}`.trim(), price: `$${p.usd}`, free: true })),
        { icon: ['icons', 50], text: meta.save.noAds ? 'NO ADS (OWNED)' : 'REMOVE ADS', price: `$${SHOP.noAds.value.usd}`, free: !meta.save.noAds, owned: meta.save.noAds }];
    }
    if (st.tab === 'GOLD') return SHOP.goldPacks.value.map(p => ({ icon: ['icons', 31], text: `${p.gold.toLocaleString('en-US')} GOLD`, gems: p.gems }));
    return SHOP.etc.value.map((e, i) => ({ icon: ['icons', 32 + i], text: e.label, gems: e.gems }));
  }
  function drawShop(dt) {
    const sb = img('shop_bg');
    ctx.drawImage(sb.img, 0, 0, sb.dw || sb.w, sb.dh || sb.h);
    gfx.tileX('bg_top', -70);
    label('SHOP', W / 2, 40, 30, '#ffd23a');
    boards(14, 76);
    // FREE = rewarded video (+2 jewels, once per shop visit; cppOKtoGiveV4VCReward @0x642b00): no ad in the web, instant
    const fb = SHOP_LAYOUT.free;
    ctx.save();
    if (st.adUsed) ctx.globalAlpha = 0.4;
    ctx.drawImage(img('btn_free').img, fb.x, fb.y);
    ctx.restore();
    plain(st.adUsed ? 'AGAIN NEXT VISIT' : '+2 JEWEL (NO AD)', fb.x + fb.w / 2, fb.y - 10, 12, '#fff', 'center');
    plain(`HEART ${meta.hearts()}/${meta.heartsMax()}`, 248, 104, 16, '#ff9a9a');
    for (const tb of SHOP_LAYOUT.tabs) {
      frame('btn_shop', tb.name === st.tab ? 0 : 1, tb.x, tb.y, { scale: tb.w / 110 });
      plain(tb.name, tb.x + tb.w / 2, tb.y + tb.h / 2 + 2, 20, tb.name === st.tab ? '#ffd23a' : '#9a8f80', 'center');
    }
    shopRows().forEach((r, i) => {
      const b = SHOP_LAYOUT.row(i);
      ctx.drawImage(img('list_shop').img, b.x, b.y);
      frameC(r.icon[0], r.icon[1], b.x + 38, b.y + 30, { scale: r.icon[0] === 'icons' ? 0.75 : 0.85 });
      plain(r.text, b.x + 76, b.y + 30, r.text.length > 22 ? 14 : 17, '#e8e0cc');
      const bb = SHOP_LAYOUT.buy(i);
      if (r.free) { // fake IAP: the store price struck through, FREE on the button
        button(bb, '', '#fff', 17);
        plain(r.price, bb.x + bb.w / 2, bb.y + 15, 12, '#bbb', 'center');
        ctx.fillStyle = '#bbb';
        ctx.fillRect(bb.x + bb.w / 2 - 22, bb.y + 15, 44, 1.5);
        plain('FREE', bb.x + bb.w / 2, bb.y + 35, 18, '#7fff7f', 'center');
      } else if (r.owned) button(bb, 'OWNED', '#9a9a9a', 16, true);
      else if (r.price) button(bb, r.price, '#bbb', 17, true);
      else {
        button(bb, '', '#fff', 17, r.off);
        frameC('icons', 6, bb.x + 30, bb.y + bb.h / 2, { scale: 0.5 });
        plain(String(r.gems), bb.x + 84, bb.y + bb.h / 2, 19, r.gems > meta.gems() ? '#ff8a7a' : '#fff', 'center');
      }
    });
    if (st.tab === 'JEWEL') plain('WEB VERSION: EVERY PURCHASE IS FREE AND INSTANT', W / 2, 700, 13, '#7fff7f', 'center');
    if (st.tab === 'ETC') plain(`TICKET ${meta.tickets()}/${meta.save.ticketsMax}  (1 TICKET = 1 TOWER OF DEATH RUN)`, W / 2, 700, 13, '#cfc7bd', 'center');
    button(SHOP_LAYOUT.back, 'BACK', '#ffe9a8', 24);
    hooks.drawToast(dt);
  }
  function shopTap(p) {
    if (inside(p, SHOP_LAYOUT.back)) return { back: true };
    if (inside(p, SHOP_LAYOUT.free)) {
      if (st.adUsed) { hooks.toast('ONE FREE REWARD PER SHOP VISIT'); return { free: 'done' }; }
      st.adUsed = true;
      hooks.toast(`GET ${meta.claimAdJewels()} JEWELS`);
      return { free: 'ok' };
    }
    const tb = SHOP_LAYOUT.tabs.find(t => inside(p, t));
    if (tb) { st.tab = tb.name; return { tab: tb.name }; }
    const i = shopRows().findIndex((r, j) => inside(p, SHOP_LAYOUT.buy(j)));
    if (i < 0) return null;
    if (st.tab === 'JEWEL' && i === SHOP.jewelPacks.value.length) {
      if (meta.save.noAds) return { buy: 'noads', result: 'owned' };
      meta.buyNoAds(); hooks.toast('ADS REMOVED (THE WEB VERSION HAS NO ADS)'); return { buy: 'noads', result: 'ok' };
    }
    if (st.tab === 'JEWEL') { meta.buyJewelPack(i); hooks.toast(`+${SHOP.jewelPacks.value[i].gems} JEWEL\n(FREE IN THE WEB VERSION)`); return { buy: `jewel${i}`, result: 'ok' }; }
    const r = st.tab === 'GOLD' ? meta.buyGold(i) : meta.buyEtc(i);
    if (r === 'gems') hooks.toast(MSG.noGems);
    else if (r === 'heartMax') hooks.toast(MSG.heartMax);
    else if (r === 'ticketMax') hooks.toast(MSG.ticketMax);
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

  // ---------------- ABILITY popup (from the prep's ABILITY tile; Call_Back_Upgrade_Booster @0x55e0b8) ----------------
  function drawAbility() {
    const A = metaData.ability;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#17110c';
    ctx.fillRect(16, 180, W - 32, 440);
    ctx.drawImage(img('popup_prep').img, 10, 176, W - 20, 452);
    label('ABILITY', W / 2, 214, 26, '#ffd23a');
    frame('btn_option', 6, ABIL_LAYOUT.close.x, ABIL_LAYOUT.close.y);
    const hero = meta.roster()[meta.char()] || {};
    A.slots.value.forEach((sl0, i) => {
      const b = ABIL_LAYOUT.row(i);
      // slot 5 is "more chance to deal critical damage" for Teresa and Flashare, BERSERK time for the rest (6 s base for Elizabeth)
      const sl = i !== 4 ? sl0 : hero.slot5 === 'crit' ? { ...sl0, name: 'CRITICAL', pickup: null, text: `critical chance +${meta.abilityLevel(4)}%  (+1% per level)` }
        : hero.berserkBase ? { ...sl0, base: hero.berserkBase } : sl0;
      ctx.drawImage(img('list_shop').img, b.x, b.y, b.w, b.h);
      frameC('in_item', sl.icon, b.x + 36, b.y + 35, { scale: 0.95 });
      const lv = meta.abilityLevel(i);
      plain(`${sl.name}  Lv.${lv}/${A.cost.value.max}`, b.x + 70, b.y + 22, 16, '#ffe9a8');
      plain(sl.pickup ? `${sl.base + lv} SEC (+1 SEC PER LEVEL)` : sl.text.toUpperCase(), b.x + 70, b.y + 46, sl.pickup ? 13 : 10, sl.pickup ? '#e8e0cc' : '#ffb35a');
      const pr = meta.abilityPrice(i);
      frameC('icon_bag', 1, b.x + 330, b.y + 35, { scale: 0.6 });
      plain(pr === null ? 'MAX' : String(pr), b.x + 400, b.y + 35, 16, pr !== null && pr > meta.gold() ? '#ff8a7a' : '#f3e04a', 'right');
    });
    plain(`GOLD ${meta.gold()}   (PICKUPS DROP IN STAGES: x2 SCORE, x2 ATK, x2 DEF, BERSERK)`, W / 2, 640, 11, '#cfc7bd', 'center');
  }
  function abilityTap(p) {
    if (inside(p, ABIL_LAYOUT.close)) return { close: true };
    for (let i = 0; i < 5; i++) {
      if (!inside(p, ABIL_LAYOUT.row(i))) continue;
      const r = meta.upgradeAbility(i);
      if (r === 'gold') hooks.toast('NOT ENOUGH GOLD');
      else if (r === 'max') hooks.toast('MAX LEVEL');
      else hooks.toast(`${metaData.ability.slots.value[i].name} Lv.${meta.abilityLevel(i)}`);
      return { ability: i, result: r };
    }
    return null;
  }
  // ---------------- CLEAR BONUS chests (on the world map after a first clear of a chest stage; clip n7SeP1LzYs8 t=2290, 4123) ----
  // the map darkens, a band with red edges holds "PLEASE SELECT A BOX / CLEAR BONUS!!" and three eff_itembox chests with
  // bobbing icon_select arrows; the picked chest glows, the screen flashes white, then CONGRATULATION! shows the open chest
  // over turning blue rays (Eff_Flash_03) with GET n JEWELS or the item, and TOUCH SCREEN TO CONTINUE.
  const BONUS_OPEN = 0.7; // glow, then the white flash, then the reward view
  function drawBonus(b, dt) {
    b.t = (b.t || 0) + dt;
    const since = b.got ? b.t - b.at : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(0, 0, W, H);
    if (!b.got || since < BONUS_OPEN) {
      const band = BONUS_LAYOUT.band;
      ctx.fillStyle = 'rgba(0,0,0,0.86)';
      ctx.fillRect(0, band.y, W, band.h);
      ctx.fillStyle = '#c4161c';
      ctx.fillRect(0, band.y, W, 4);
      ctx.fillRect(0, band.y + band.h - 4, W, 4);
      plain('PLEASE SELECT A BOX', W / 2, band.y + 30, 15, '#fff', 'center');
      label('CLEAR BONUS!!', W / 2, band.y + 72, 26, '#ffd23a');
      for (let i = 0; i < 3; i++) {
        const c = BONUS_LAYOUT.chest(i), cx = c.x + c.w / 2, cy = c.y + c.h / 2 + 18;
        if (b.got && b.pick !== i) { frameC('eff_itembox', 0, cx, cy, { scale: 0.47, alpha: Math.max(0, 1 - since * 3) }); continue; }
        if (b.got) { // picked: shake, then the glow sheet frame swells over it
          const k = Math.min(1, since / BONUS_OPEN);
          frameC('eff_itembox', 0, cx + Math.sin(since * 60) * 3 * (1 - k), cy, { scale: 0.47 + 0.1 * k });
          frameC('eff_itembox', 1, cx, cy, { scale: 0.47 + 0.25 * k, alpha: k, add: true });
          continue;
        }
        frameC('eff_itembox', 0, cx, cy, { scale: 0.47 });
        frameC('icon_select', 0, cx, c.y + 8 + Math.sin(b.t * 6 + i * 0.8) * 5, { scale: 0.8 });
      }
      if (b.got && since > BONUS_OPEN - 0.2) { ctx.fillStyle = `rgba(255,255,255,${(since - (BONUS_OPEN - 0.2)) / 0.2})`; ctx.fillRect(0, 0, W, H); }
      return;
    }
    const f = since - BONUS_OPEN; // reward view, fading in from the white flash
    if (f < 0.35) { ctx.fillStyle = `rgba(255,255,255,${1 - f / 0.35})`; ctx.fillRect(0, 0, W, H); }
    label('CONGRATULATION!', W / 2, 264, 22, '#fff23a');
    const what = b.got.gems ? `GET ${b.got.gems} JEWELS` : `${meta.kind(b.got.item.id).name.toUpperCase()} ITEM GET`;
    plain(what, W / 2, 360, 17, '#fff', 'center');
    frameC('eff_flash03', 0, W / 2, 440, { scale: 2.4 + 0.15 * Math.sin(b.t * 4), rot: b.t * 0.8, add: true }); // 128 px art shown at 512
    frameC('eff_itembox', 2, W / 2, 452, { scale: 0.64 });
    if (b.got.gems) frameC('icon_reward', 2, W / 2, 432, { scale: 0.55 });
    else itemIcon(b.got.item.id, W / 2, 420, 1.1);
    if (f > BONUS_DONE_AFTER - BONUS_OPEN) plain('TOUCH SCREEN TO CONTINUE', W / 2, 658, 16, `rgba(255,255,255,${0.65 + 0.35 * Math.sin(b.t * 4)})`, 'center');
  }
  const BONUS_DONE_AFTER = 1.3; // seconds after the pick before a touch closes the reward
  function bonusTap(b, p) {
    if (b.got) return b.t - b.at >= BONUS_DONE_AFTER ? { done: true } : null;
    for (let i = 0; i < 3; i++) {
      if (!inside(p, BONUS_LAYOUT.chest(i))) continue;
      b.pick = i;
      b.at = b.t || 0;
      // the reward table is server data in the original (Call_Back_Chest_Reward @0x541088); the clips show 5 jewels,
      // 10 jewels or an item: the web picks one of those three evenly (web odds)
      const r = Math.floor(Math.random() * 3);
      if (r < 2) { const g = r ? 10 : 5; meta.addGems(g); b.got = { gems: g }; }
      else {
        const res = meta.buyItemBox(Math.random, null, true);
        b.got = res.r === 'ok' ? { item: res.item } : { gems: 10 };
        if (res.r !== 'ok') meta.addGems(10);
      }
      return { chest: i, got: b.got };
    }
    return null;
  }

  return { st, drawShop, shopTap, drawUpgrade, upgradeTap, drawBag, bagTap, boards, boardPlus, itemIcon, drawAbility, abilityTap, drawBonus, bonusTap };
}
