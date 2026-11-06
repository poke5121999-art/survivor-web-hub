// WING tab (Scene_Pet: guardians) and EXPLORE tab (Scene_Adventure: expeditions), with the original art. Rules and
// numbers come from js/meta.js -> data/meta.json (guardians, explore). Positions are web layout.
import { W, H } from './sim.js';

const PER_PAGE = 18;
const inside = (p, b) => !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
export const WING_LAYOUT = {
  side: { L: { x: 96, y: 128, w: 86, h: 100 }, R: { x: 298, y: 128, w: 86, h: 100 } },
  cell: i => ({ x: 22 + (i % 6) * 73, y: 350 + Math.floor(i / 6) * 92, w: 70, h: 86 }),
  prev: { x: 20, y: 640, w: 60, h: 46 },
  next: { x: 400, y: 640, w: 60, h: 46 },
  expand: { x: 150, y: 640, w: 180, h: 46 },
  gold: { x: 20, y: 700, w: 214, h: 64 },
  gems: { x: 246, y: 700, w: 214, h: 64 },
  back: { x: 400, y: 20, w: 64, h: 64 },
  pop: { x: 20, y: 230, w: 440, h: 330 },
  popClose: { x: 412, y: 234, w: 44, h: 44 },
  bL: { x: 30, y: 490, w: 100, h: 54 },
  bR: { x: 136, y: 490, w: 100, h: 54 },
  bMix: { x: 242, y: 490, w: 100, h: 54 },
  bSell: { x: 348, y: 490, w: 100, h: 54 },
};
export const EXP_LAYOUT = {
  row: i => ({ x: 16, y: 130 + i * 92, w: 448, h: 82 }),
  back: { x: 400, y: 20, w: 64, h: 64 },
  pop: { x: 20, y: 220, w: 440, h: 360 },
  popClose: { x: 412, y: 224, w: 44, h: 44 },
  b1: { x: 40, y: 500, w: 190, h: 60 },
  b2: { x: 250, y: 500, w: 190, h: 60 },
};
export const TOWER_LAYOUT = {
  enter: { x: 150, y: 540, w: 180, h: 180 }, // clip c1 13:59: the ENTER disc sits low, centre about 0.79 H
  back: { x: 400, y: 20, w: 64, h: 64 },
  shop: { x: 133, y: 300, w: 214, h: 64 },
};
const hms = s => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function createWingUI(gfx, meta, metaData, hooks) {
  const { ctx, img, frame, frameC, label, plain } = gfx;
  const G = metaData.guardians;
  const E = metaData.explore;
  const st = { page: 0, sel: null, mix: null, exSel: null, result: null, t: 0 };

  function button(b, text, color = '#ffe9a8', size = 18, dim = false) {
    ctx.save();
    if (dim) ctx.globalAlpha = 0.45;
    ctx.drawImage(img('btn_r').img, b.x, b.y, b.w, b.h);
    ctx.restore();
    if (text) plain(text, b.x + b.w / 2, b.y + b.h / 2, size, color, 'center');
  }
  function popupBox(P) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#17110c';
    ctx.fillRect(P.x + 4, P.y + 4, P.w - 8, P.h - 8);
    ctx.drawImage(img('popup_prep').img, P.x, P.y, P.w, P.h);
  }
  // guardian_NN: 2x2 frames, 4-frame idle at 0.1 s a frame (Init_Guardian)
  const petIcon = (kind, cx, cy, scale = 0.8) => frameC(`guardian_${String(kind).padStart(2, '0')}`, Math.floor(st.t * 10) % 4, cx, cy, { scale });
  const tierColor = t => ['#e8e0cc', '#7fd0ff', '#ffb84a'][t];

  // ---------------- WING ----------------
  function drawWing(dt) {
    st.t += dt;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img('bag_bg').img, 0, 0, W, H);
    label('GUARDIAN WING', 24, 40, 24, '#ffd23a', 'left');
    frame('btn_option', 6, WING_LAYOUT.back.x + 7, WING_LAYOUT.back.y + 7);
    plain(`GOLD ${meta.gold()}   JEWEL ${meta.gems()}`, 24, 82, 16, '#f3e04a');
    for (const side of ['L', 'R']) {
      const b = WING_LAYOUT.side[side];
      ctx.drawImage(img('slot_guardian').img, b.x, b.y);
      const g = meta.petOn(side);
      if (g) { petIcon(g.kind, b.x + 43, b.y + 44, 0.9); plain(`Lv.${g.lv + 1}`, b.x + 43, b.y + 92, 12, '#fff', 'center'); }
      plain(side === 'L' ? 'LEFT' : 'RIGHT', b.x + 43, b.y + 114, 13, '#fff', 'center');
    }
    plain('GUARDIANS SHOOT ON THEIR SIDE BUT NEVER LAND THE KILLING BLOW', W / 2, 278, 12, '#cfc7bd', 'center');
    if (st.mix !== null) plain('MIX: TAP A GUARDIAN OF THE SAME LEVEL', W / 2, 300, 14, '#7fff7f', 'center');
    const pets = meta.pets();
    const pages = Math.max(1, Math.ceil(meta.petSlots() / PER_PAGE));
    st.page = Math.min(st.page, pages - 1);
    for (let i = 0; i < PER_PAGE; i++) {
      const idx = st.page * PER_PAGE + i;
      if (idx >= meta.petSlots()) break;
      const b = WING_LAYOUT.cell(i);
      frame('bag_slot', 0, b.x - 10, b.y - 2, { scale: 0.86 });
      const g = pets[idx];
      if (!g) continue;
      petIcon(g.kind, b.x + 28, b.y + 34, 0.62);
      plain(`Lv.${g.lv + 1}`, b.x + 28, b.y + 66, 11, tierColor(meta.gkind(g.kind).tier), 'center');
      if (g.eq) plain(g.eq, b.x + 2, b.y + 10, 13, '#ffd23a');
      if (st.mix === idx) { ctx.strokeStyle = '#7fff7f'; ctx.lineWidth = 3; ctx.strokeRect(b.x - 8, b.y - 1, 74, 76); }
    }
    plain(`${pets.length}/${meta.petSlots()}  +5 SLOTS: 10 JEWEL`, W / 2, 663, 14, '#fff', 'center');
    if (pages > 1) { button(WING_LAYOUT.prev, '<', '#fff', 22); button(WING_LAYOUT.next, '>', '#fff', 22); }
    button(WING_LAYOUT.gold, '', '#fff');
    plain('SUMMON', WING_LAYOUT.gold.x + 107, WING_LAYOUT.gold.y + 22, 17, '#fff', 'center');
    plain(`${G.summonGold.value.gold} GOLD`, WING_LAYOUT.gold.x + 107, WING_LAYOUT.gold.y + 44, 14, '#f3e04a', 'center');
    button(WING_LAYOUT.gems, '', '#fff');
    plain('SUMMON RARE+', WING_LAYOUT.gems.x + 107, WING_LAYOUT.gems.y + 22, 17, '#fff', 'center');
    plain(`${G.summonGems.value.gems} JEWEL`, WING_LAYOUT.gems.x + 107, WING_LAYOUT.gems.y + 44, 14, '#5fe0f0', 'center');
    if (st.sel !== null && pets[st.sel] && st.mix === null) drawPetPopup(pets[st.sel]);
    hooks.drawToast(dt);
  }
  function drawPetPopup(g) {
    const P = WING_LAYOUT.pop;
    const k = meta.gkind(g.kind);
    popupBox(P);
    frame('btn_option', 6, WING_LAYOUT.popClose.x, WING_LAYOUT.popClose.y, { scale: 0.88 });
    ctx.drawImage(img('slot_guardian').img, P.x + 20, P.y + 50);
    petIcon(g.kind, P.x + 63, P.y + 94, 0.95);
    plain(`${G.tierNames.value[k.tier]} / ${G.styleNames.value[k.style]}`, P.x + 124, P.y + 36, 13, tierColor(k.tier));
    plain(`${k.name}  Lv.${g.lv + 1}`, P.x + 124, P.y + 62, 19, '#ffd23a');
    plain(G.styleText.value[k.style].toUpperCase() + (k.id === 24 ? ' (DOUBLE SHOT)' : ''), P.x + 124, P.y + 90, 13, '#fff');
    plain(k.style === 3 ? 'ITEM PICKUPS ARE NOT IN THE WEB VERSION YET' : `BULLET DAMAGE ${2 * (g.lv + 1)}`, P.x + 124, P.y + 114, 14, k.style === 3 ? '#ffb35a' : '#9fe0ff');
    const T = G.expTable.value;
    plain(g.lv >= 9 ? `EXP ${g.exp} (Lv.10+: MIX ONLY)` : `EXP ${g.exp} / ${T[g.lv + 1]}`, P.x + 124, P.y + 138, 13, '#cfc7bd');
    const L = WING_LAYOUT;
    button(L.bL, g.eq === 'L' ? 'UNEQUIP' : 'LEFT', '#fff', 15);
    button(L.bR, g.eq === 'R' ? 'UNEQUIP' : 'RIGHT', '#fff', 15);
    button(L.bMix, 'MIX', '#fff', 16, g.lv >= G.mixMax.value);
    button(L.bSell, `SELL`, '#fff', 16);
    plain(`MIX: THIS ONE Lv+1, THE OTHER (SAME LEVEL) DISAPPEARS. SELL: +${G.sellGold.value} GOLD`, W / 2, P.y + P.h + 14, 11, '#cfc7bd', 'center');
  }
  function wingTap(p) {
    const L = WING_LAYOUT;
    const pets = meta.pets();
    const cellAt = () => { for (let c = 0; c < PER_PAGE; c++) { const idx = st.page * PER_PAGE + c; if (inside(p, L.cell(c)) && pets[idx]) return idx; } return -1; };
    if (st.mix !== null) {
      const j = cellAt();
      const a = st.mix;
      st.mix = null;
      if (j < 0 || j === a) return { mix: 'cancel' };
      const r = meta.mixPets(a, j);
      if (r === 'level') hooks.toast('ONLY GUARDIANS OF THE SAME LEVEL CAN MIX');
      else if (r === 'max') hooks.toast('CAN NOT MIX ANY MORE: LEVEL IS MAX');
      else if (r === 'ok') { hooks.toast('MIX COMPLETE: Lv + 1'); st.sel = null; }
      return { mix: r };
    }
    if (st.sel !== null && pets[st.sel]) {
      const i = st.sel;
      const g = pets[i];
      if (inside(p, L.popClose) || !inside(p, L.pop)) { st.sel = null; return { close: 'popup' }; }
      for (const side of ['L', 'R']) {
        if (!inside(p, side === 'L' ? L.bL : L.bR)) continue;
        if (g.eq === side) meta.unequipPet(i); else meta.equipPet(i, side);
        st.sel = null;
        return { equip: side, on: g.eq === side };
      }
      if (inside(p, L.bMix)) { if (g.lv >= G.mixMax.value) { hooks.toast('CAN NOT MIX ANY MORE: LEVEL IS MAX'); return { mix: 'max' }; } st.mix = i; return { mix: 'pick' }; }
      if (inside(p, L.bSell)) { meta.sellPet(i); st.sel = null; hooks.toast(`+${G.sellGold.value} GOLD`); return { sell: i }; }
      return null;
    }
    if (inside(p, L.back)) return { back: true };
    for (const side of ['L', 'R']) if (inside(p, L.side[side])) { const g = meta.petOn(side); if (g) st.sel = pets.indexOf(g); return { side }; }
    const j = cellAt();
    if (j >= 0) { st.sel = j; return { pet: j }; }
    const pages = Math.max(1, Math.ceil(meta.petSlots() / PER_PAGE));
    if (pages > 1 && inside(p, L.prev)) { st.page = (st.page + pages - 1) % pages; return { page: st.page }; }
    if (pages > 1 && inside(p, L.next)) { st.page = (st.page + 1) % pages; return { page: st.page }; }
    if (inside(p, L.expand)) {
      const r = meta.expandPetSlots();
      hooks.toast(r === 'gems' ? metaData.shop.messages.value.noGems : r === 'max' ? 'SLOTS ARE ALREADY MAX' : '+5 SLOTS');
      return { expand: r };
    }
    for (const mode of [0, 1]) {
      if (!inside(p, mode ? L.gems : L.gold)) continue;
      const r = meta.summon(mode);
      if (r.r === 'gold') hooks.toast('NOT ENOUGH GOLD');
      else if (r.r === 'gems') hooks.toast(metaData.shop.messages.value.noGems);
      else if (r.r === 'full') hooks.toast('NO FREE SLOT');
      else { const k = meta.gkind(r.pet.kind); hooks.toast(`${G.tierNames.value[k.tier]}! ${k.name} Lv.${r.pet.lv + 1}`); st.page = Math.floor(r.index / PER_PAGE); }
      return { summon: mode, result: r.r, index: r.index };
    }
    return null;
  }

  // ---------------- EXPLORE ----------------
  function drawExplore(dt) {
    st.t += dt;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img('explore_bg').img, 0, 0, W, H);
    label('EXPEDITION', 24, 40, 24, '#ffd23a', 'left');
    frame('btn_option', 6, EXP_LAYOUT.back.x + 7, EXP_LAYOUT.back.y + 7);
    plain(`EXPEDITION ABILITY : ${meta.expedAbility()}   GOLD ${meta.gold()}   JEWEL ${meta.gems()}`, 24, 90, 13, '#f3e04a');
    const ex = meta.exped();
    const left = meta.expedLeft();
    E.areas.value.forEach((a, i) => {
      const b = EXP_LAYOUT.row(i);
      ctx.drawImage(img('list_bg_explore').img, b.x, b.y);
      frameC('icon_explore', a.icon, b.x + 41, b.y + 41, { scale: 1 });
      plain(a.name, b.x + 88, b.y + 22, 17, '#ffe9a8');
      plain(`${a.min / 60} HOURS   GOLD ${a.gold[0]}+`, b.x + 88, b.y + 46, 13, '#e8e0cc');
      let s = 'CAN SEND EXPEDITION TO THIS AREA.';
      let c = '#9fe0ff';
      if (ex.area === i) { s = left > 0 ? `EXPLORING... ${hms(left)}` : 'EXPEDITION COMPLETE'; c = left > 0 ? '#ffd23a' : '#7fff7f'; }
      else if (ex.area >= 0) { s = 'THE KNIGHT IS AWAY'; c = '#9a9a9a'; }
      plain(s, b.x + 88, b.y + 66, 12, c);
    });
    plain('ONLY THE KNIGHT IS IN THE WEB VERSION: ONE EXPEDITION AT A TIME', W / 2, 610, 12, '#cfc7bd', 'center');
    if (st.result) drawExpResult();
    else if (st.exSel !== null) drawAreaPopup(st.exSel);
    hooks.drawToast(dt);
  }
  function drawAreaPopup(i) {
    const P = EXP_LAYOUT.pop;
    const a = E.areas.value[i];
    const ex = meta.exped();
    popupBox(P);
    frame('btn_option', 6, EXP_LAYOUT.popClose.x, EXP_LAYOUT.popClose.y, { scale: 0.88 });
    frameC('icon_explore', a.icon, P.x + 60, P.y + 80);
    plain(a.name, P.x + 110, P.y + 50, 19, '#ffd23a');
    a.text.split('\n').forEach((ln, k) => plain(ln, P.x + 110, P.y + 78 + k * 18, 12, '#e8e0cc'));
    const t = meta.expedTier();
    plain(`EXPEDITION ABILITY : ${meta.expedAbility()}`, P.x + 30, P.y + 150, 15, '#fff');
    plain(E.tiers.value.labels[t], P.x + 30, P.y + 176, 14, '#9fe0ff');
    plain(`GOLD ${a.gold[0] + t * a.gold[1]} - ${a.gold[0] + t * a.gold[1] + a.gold[2] - 1}`, P.x + 30, P.y + 202, 14, '#f3e04a');
    plain(a.items.rolls === 0 ? 'NO ITEMS' : a.items.rolls ? `ITEM CHANCE ${a.items.chance + a.items.perTier * t}%` : `${a.items.two !== undefined ? '1-2' : '2-3'} ITEMS`, P.x + 30, P.y + 226, 14, '#cfc7bd');
    const L = EXP_LAYOUT;
    if (ex.area === i) {
      const left = meta.expedLeft();
      plain(left > 0 ? `TIME LEFT ${hms(left)}` : 'EXPEDITION COMPLETE', P.x + 30, P.y + 254, 15, '#ffd23a');
      if (left > 0) { button(L.b1, `${meta.finishPrice()} FINISH NOW`, '#5fe0f0', 15); button(L.b2, 'CANCEL', '#fff', 16); }
      else button(L.b1, 'COLLECT', '#7fff7f', 18);
    } else {
      plain(`ESTIMATED TIME : ${a.min / 60}:00:00`, P.x + 30, P.y + 254, 15, '#fff');
      button(L.b1, ex.area >= 0 ? 'BUSY' : 'SEND', '#fff', 18, ex.area >= 0);
    }
  }
  function drawExpResult() {
    const P = EXP_LAYOUT.pop;
    const r = st.result;
    popupBox(P);
    label('EXPEDITION SUCCESS!!', W / 2, P.y + 50, 22, '#ffd23a');
    plain(`GET ${r.gold} GOLD`, W / 2, P.y + 100, 20, '#f3e04a', 'center');
    plain(r.items.length ? `${r.items.length} ITEM${r.items.length > 1 ? 'S' : ''} TO THE INVENTORY` : 'NO ITEM THIS TIME', W / 2, P.y + 134, 15, '#fff', 'center');
    r.items.forEach((it, k) => hooks.itemIcon(it.id, W / 2 - (r.items.length - 1) * 45 + k * 90, P.y + 200, 0.8));
    button(EXP_LAYOUT.b1, 'OK', '#fff', 18);
  }
  function exploreTap(p) {
    const L = EXP_LAYOUT;
    if (st.result) { if (inside(p, L.b1) || !inside(p, L.pop)) st.result = null; return { result: 'close' }; }
    if (st.exSel !== null) {
      const i = st.exSel;
      const ex = meta.exped();
      if (inside(p, L.popClose) || !inside(p, L.pop)) { st.exSel = null; return { close: 'popup' }; }
      if (ex.area === i) {
        if (meta.expedLeft() > 0) {
          if (inside(p, L.b1)) { const r = meta.finishNow(); if (r === 'gems') hooks.toast(metaData.shop.messages.value.noGems); return { finish: r }; }
          if (inside(p, L.b2)) { meta.cancelExped(); st.exSel = null; hooks.toast('EXPEDITION CANCELLED: NO REWARD'); return { cancel: true }; }
        } else if (inside(p, L.b1)) {
          st.result = meta.collectExped();
          st.exSel = null;
          return { collect: st.result ? st.result.gold : 0 };
        }
        return null;
      }
      if (inside(p, L.b1)) {
        const r = meta.startExped(i);
        if (r === 'busy') hooks.toast('THE KNIGHT IS ALREADY ON AN EXPEDITION');
        else if (r === 'ok') { hooks.toast('EXPEDITION STARTED'); st.exSel = null; }
        return { send: r };
      }
      return null;
    }
    if (inside(p, L.back)) return { back: true };
    const i = E.areas.value.findIndex((a, k) => inside(p, L.row(k)));
    if (i >= 0) { st.exSel = i; return { area: i }; }
    return null;
  }

  // ---------------- TOWER lobby (Scene_Tower: best score, tickets, ENTER) ----------------
  function drawTower(dt) {
    st.t += dt;
    const bg = img('tower_00');
    ctx.drawImage(bg.img, 0, 0, W, H);
    label('DEATH TOWER', W / 2, 44, 30, '#ffd23a');
    frame('btn_option', 6, TOWER_LAYOUT.back.x + 7, TOWER_LAYOUT.back.y + 7);
    // tickets with the regen time, top-left as the original lobby (clip c1 13:59: ticket icon, count, 00:00)
    const left = meta.tickTickets();
    frame('icons', 35, 4, 76, { scale: 0.8 });
    label(String(meta.tickets()), 54, 100, 22, '#fff', 'left');
    label(`${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`, 8, 140, 15, '#fff', 'left');
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(20, 160, W - 40, 130);
    plain(`BEST SCORE : ${meta.towerBest()}`, W / 2, 182, 20, '#fff', 'center');
    plain('(THE ONLINE RANKING IS NOT IN THE WEB VERSION)', W / 2, 206, 11, '#cfc7bd', 'center');
    plain('ENDLESS FLOORS: MONSTERS HIT x2 AND MOVE FASTER', W / 2, 230, 13, '#e8e0cc', 'center');
    plain(`FLOORS 1-${hooks.towerFloors()} ARE IN THE WEB VERSION (THE ORIGINAL HAS 50 SCRIPTS)`, W / 2, 252, 12, '#ffb35a', 'center');
    plain('1 TICKET PER RUN. THE SCORE IS THE RECORD.', W / 2, 274, 12, '#cfc7bd', 'center');
    const b = TOWER_LAYOUT.enter;
    const s = 1 + 0.03 * Math.sin(st.t * 4);
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    ctx.scale(s, s);
    ctx.drawImage(img('btn_enter_tower').img, -b.w / 2, -b.h / 2);
    ctx.restore();
    label('ENTER', W / 2, b.y + b.h - 26, 22, '#fff');
    button(TOWER_LAYOUT.shop, 'BUY TICKETS', '#5fe0f0', 18);
    hooks.drawToast(dt);
  }
  function towerTap(p) {
    if (inside(p, TOWER_LAYOUT.back)) return { back: true };
    if (inside(p, TOWER_LAYOUT.shop)) return { shop: true };
    if (inside(p, TOWER_LAYOUT.enter)) return { enter: true };
    return null;
  }

  return { st, drawWing, wingTap, drawExplore, exploreTap, drawTower, towerTap };
}
