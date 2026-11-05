// World map, stage prep panel and shop, drawn with the original art. Layout is parity-only (no positions are in the
// recovered data): measured on clip c2 5:20 (map, shown at 1.6x: map y = clip y / 1.6 + 60) and clip c1 4:42 (prep,
// clip x/y * 0.625). Numbers shown (prices, levels, stats, gold) come from js/meta.js -> data/meta.json.
import { W, H } from './sim.js';

// stage button centres on map_00_01 (map pixels), clip c2 5:20: stages 1-4 and the reward chest. The original only
// draws stages that are open, so nothing past the last open stage is placed.
// stage 5 is the reward-chest slot (FUC_SET_REWARD_CHEST_POSITION puts the chest on every slot with index % 5 == 4;
// clip c1 7:56: after stage 4 the player taps the chest and the SHAMANKING prep opens). The framed square above
// node 4 in that clip is frame_photo_map, a friend's profile photo (social data), not a stage.
// Drop 6: the chapter map is one tall layer (map_00_01 at the bottom, map_00_02 above it: Scene_WorldMap, cocos y up).
// Web map y runs top-down over both images: map_00_02 = 0..1023, map_00_01 = 1024..2047. Stages 6-15 are the original
// button positions (fractions of 480x800 per map image, meta/re_notes/stages_6_15.md); stages 1-5 keep the clip-measured
// positions. Every stage with index % 5 == 4 (5, 10, 15) is a reward-chest slot.
const M1 = 1024;
export const MAP_CHEST = [161, 577 + M1];
export const MAP_NODES = [[176, 772 + M1], [299, 761 + M1], [378, 667 + M1], [293, 579 + M1], MAP_CHEST, // stage 1 on the red X
  [136, 458 + M1], [266, 427 + M1], [308, 306 + M1], [151, 267 + M1], [288, 166 + M1], [172, 126 + M1], [110, 28 + M1],
  [103, 922], [234, 1006], [358, 982]];
const isChest = i => i % 5 === 4;
const MAP_H = 2048;
const TAB_Y = 712;
// Drop 5: the shop and the upgrade are on the map itself (owner QA: they were only reachable from the stage prep).
// The original map has no fixed SHOP / UPGRADE buttons in this version; btn_shop / btn_upgrade are the original art,
// the positions are web layout. The gold / gem boards with "+" open the shop on the GOLD / JEWEL tab.
export const MAP_BTN = {
  tabs: ['STORY', 'ITEM', 'TOWER', 'WING', 'EXPLORE'].map((name, i) => ({ name, x: 4 + i * 95, y: TAB_Y, w: 92, h: 80 })),
  tabIcons: { STORY: 1, ITEM: 2, TOWER: 9, WING: 42, EXPLORE: 4 },
  shop: { x: 12, y: 584, w: 110, h: 74 },
  upgrade: { x: 368, y: 566, w: 100, h: 92 },
  goldPlus: { x: 418, y: 14, w: 52, h: 46 },
  gemPlus: { x: 418, y: 64, w: 52, h: 46 },
};
export const PREP_BTN = {
  close: { x: 428, y: 108, w: 50, h: 50 },
  character: { x: 22, y: 342, w: 180, h: 50 },
  goldPlus: { x: 400, y: 184, w: 64, h: 42 },
  gemPlus: { x: 400, y: 226, w: 64, h: 42 },
  weapon: { x: 206, y: 269, w: 122, h: 112 },
  armor: { x: 336, y: 269, w: 122, h: 112 },
  modes: [0, 1, 2].map(i => ({ x: 16 + i * 76, y: 581, w: 68, h: 54 })),
  start: { x: 247, y: 580, w: 228, h: 56 },
  auto: { x: 389, y: 648, w: 86, h: 68 },
};
export function createScreens(gfx, meta, stages, metaData, metaUI) {
  const { ctx, img, frame, frameC, digits, label, plain, tileX } = gfx;
  const titles = metaData.stages.titles.value;
  const stageTitle = i => (stages[meta.stageIds[i]] ? stages[meta.stageIds[i]].title : titles[i] || '');
  const state = { scroll: null, toast: null, toastT: 0, prepIdx: null, mode: 0, sel: 'potion', giftBanner: false };
  // booster row slots (clip c1 7:57): ABILITY then the four boosters, the BUY tile under the last one
  const SLOT = i => ({ x: 105 + i * 90, y: 393, w: 90, h: 82 });
  const ABILITY = { x: 16, y: 395, w: 88, h: 80 };
  const BUY = { x: 370, y: 478, w: 86, h: 72 };

  const inside = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  const nodeOpen = i => i < meta.stageIds.length && meta.unlocked(meta.stageIds[i]);
  const heroNode = () => Math.max(0, meta.lastCleared());
  function clampScroll(v) { return Math.max(0, Math.min(MAP_H - H, v)); }
  // clip c2 5:20: the view puts the hero's stage at screen y ~607 (map scroll 60 with stage 3 current)
  // stages 6+ sit mid-screen so the SHOP / UPGRADE buttons do not cover their buttons (web layout)
  function defaultScroll() { return clampScroll(MAP_NODES[heroNode()][1] - (heroNode() < 5 ? 607 : 420)); }

  // the hero in use at its tiers (t = { armor, sword, set } overrides it, e.g. for the SELECT CHARACTER portraits)
  function drawKnight(cx, feetY, scale, f = 0, t = meta.tiers(), alpha = 1) {
    const left = cx - 53 * scale;
    const top = feetY - 122 * scale;
    const key = (part, tier) => (t.set && t.set !== '01' ? `hero_${part}_c${t.set}_${tier}` : `hero_${part}_${tier}`);
    frame(key('armor', t.armor), f, left, top, { scale, alpha });
    frame(key('sword', t.sword), f, left, top, { scale, alpha });
  }

  function toast(text) { state.toast = text; state.toastT = String(text).includes('\n') ? 2.6 : 1.6; }
  function drawToast(dt) {
    if (!state.toast) return;
    state.toastT -= dt;
    if (state.toastT <= 0) { state.toast = null; return; }
    // one or more lines ("\n"), each shrunk until it fits the box
    const lines = String(state.toast).split('\n');
    const h = 28 + lines.length * 24;
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.toastT * 3);
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(24, 400 - h / 2, W - 48, h);
    ctx.restore();
    lines.forEach((ln, i) => {
      let size = 18;
      const fnt = z => `900 ${z}px "Arial Black", Arial, sans-serif`;
      ctx.font = fnt(size);
      while (size > 10 && ctx.measureText(ln).width > W - 76) { size--; ctx.font = fnt(size); }
      label(ln, W / 2, 400 - ((lines.length - 1) * 24) / 2 + i * 24, size, '#ffd23a');
    });
  }

  // ---------------- world map ----------------
  function drawMap(dt, t) {
    if (state.scroll === null) state.scroll = defaultScroll();
    const s = state.scroll;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    for (const [k, y0] of [['map_00_02', 0], ['map_00_01', M1]]) {
      const m = img(k);
      if (y0 - s < H && y0 - s + 1024 > 0) ctx.drawImage(m.img, 0, y0 - s, m.dw || m.w, m.dh || m.h);
    }
    // stage-5 slot = reward chest (clip c2 5:20: shown once stage 3 is cleared): btn_stage frame 51 (the gold pronged
    // ring), Eff_Flash_01 turning once every 5 s (RotateBy(5, 360) forever) and icon_clear_bonus on top
    // (Scene_WorldMap::FUC_SET_REWARD_CHEST_POSITION @0x557778). The light is drawn at its 128 px file size, which is
    // what the clip shows (CLIP-MEASURED; the C++ scales it by the scene scale). The reward itself is not built.
    for (let ci = 4; ci < MAP_NODES.length; ci += 5) {
      if (meta.lastCleared() < ci - 2) continue;
      const [x, y] = MAP_NODES[ci];
      frameC('btn_stage', 51, x, y - s, { scale: 1.15 });
      const fl = img('eff_flash01');
      ctx.save();
      ctx.translate(x, y - s);
      ctx.rotate(((t % 5) / 5) * Math.PI * 2);
      ctx.drawImage(fl.img, -fl.w / 2, -fl.h / 2, fl.w, fl.h);
      ctx.restore();
      frameC('icon_clear_bonus', 0, x, y - s);
    }
    // open stages: numbered button, stars under cleared ones
    // stages ahead are drawn as grey buttons (btn_stage frame 0) up to the next reward chest (clip c1 13:00: grey
    // buttons for 7-9 above a cleared 6)
    const nextOpen = meta.lastCleared() + 1;
    const chestAhead = nextOpen + ((4 - (nextOpen % 5)) + 5) % 5;
    MAP_NODES.forEach(([x, y], i) => {
      if (!nodeOpen(i) && i <= chestAhead && !isChest(i)) frameC('btn_stage', 0, x, y - s, { scale: 0.85 });
    });
    MAP_NODES.forEach(([x, y], i) => {
      if (!nodeOpen(i)) return;
      if (!isChest(i)) frameC('btn_stage', i + 1, x, y - s, { scale: 0.85 }); // a chest slot is that stage's button
      const info = meta.stageInfo(meta.stageIds[i]);
      if (info.stars > 0) frameC('star_map', info.stars - 1, x, y - s + 47, { scale: 0.85 });
    });
    const [hx, hy] = MAP_NODES[heroNode()];
    drawKnight(hx, hy - s - 29, 0.75);
    // top bar: chapter 1 dragon, hearts with the time to the next one (clip c2 1:02 "10 / 00:00"), gold / gems
    tileX('bg_top', 0);
    frame('chapter_tab', 0, 33, 38, { scale: 0.94 });
    frame('icons', 32, 2, 126, { scale: 1.0 });
    digits('no_score', meta.hearts(), 36, 138, 'left', 0.8, -4);
    const left = meta.tickHearts();
    label(`${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`, 8, 180, 17, '#fff', 'left');
    metaUI.boards(258, 14);
    // SHOP and UPGRADE buttons (owner QA: make them obvious); "!" bobs on UPGRADE while an upgrade is affordable
    const sb = MAP_BTN.shop;
    frame('btn_shop', 0, sb.x, sb.y);
    frameC('icons', 30, sb.x + 30, sb.y + 36, { scale: 0.62 });
    label('SHOP', sb.x + 74, sb.y + 37, 18, '#ffd23a');
    const ub = MAP_BTN.upgrade;
    ctx.drawImage(img('btn_upgrade').img, ub.x, ub.y, ub.w, ub.h);
    frameC('icon_sword', Math.min(13, meta.level('weapon') + 1), ub.x + ub.w / 2, ub.y + 40, { scale: 0.62 });
    label('UPGRADE', ub.x + ub.w / 2, ub.y + 80, 13, '#fff');
    const can = ['weapon', 'armor'].some(k => !meta.isMax(k) && meta.price(k) <= meta.gold());
    if (can) frameC('icons', 52, ub.x + ub.w - 6, ub.y + 8 + Math.sin(t * 6) * 4, { scale: 0.7 });
    // bottom tabs: STORY, ITEM once stage 5 is cleared; TOWER / WING / EXPLORE need stages 6 / 10 / 15
    tileX('bg_bottom', TAB_Y - 52);
    for (const tb of MAP_BTN.tabs) {
      if (tb.name === 'STORY' || meta.tabOpen(tb.name)) {
        ctx.save();
        ctx.fillStyle = '#17120e';
        ctx.fillRect(tb.x, tb.y, tb.w, tb.h);
        ctx.strokeStyle = '#b9893a';
        ctx.lineWidth = 2;
        ctx.strokeRect(tb.x + 1, tb.y + 1, tb.w - 2, tb.h - 2);
        ctx.restore();
        frameC('icons', MAP_BTN.tabIcons[tb.name], tb.x + tb.w / 2, tb.y + 30, { scale: 0.8 });
        plain(tb.name, tb.x + tb.w / 2, tb.y + 66, 16, '#fff', 'center');
      } else {
        ctx.drawImage(img('lock_tab').img, tb.x, tb.y, tb.w, tb.h);
        plain(tb.name, tb.x + tb.w / 2, tb.y + 66, 15, 'rgba(160,150,140,0.55)', 'center');
      }
    }
    drawToast(dt);
  }

  function mapTap(p) {
    const s = state.scroll ?? defaultScroll();
    // the bars and buttons drawn over the map take the tap first; a stage button under them cannot be hit
    if (inside(p, MAP_BTN.shop)) return { shop: 'GOLD' };
    if (inside(p, MAP_BTN.goldPlus)) return { shop: 'GOLD' };
    if (inside(p, MAP_BTN.gemPlus)) return { shop: 'JEWEL' };
    if (inside(p, MAP_BTN.upgrade)) return { upgrade: true };
    for (const tb of MAP_BTN.tabs) {
      if (inside(p, tb)) {
        const open = tb.name === 'STORY' || meta.tabOpen(tb.name);
        if (!open) toast(meta.tabInfo(tb.name).locked.toUpperCase());
        return { tab: tb.name, open };
      }
    }
    if (p.y < 112 || p.y > TAB_Y - 52) return null;
    for (let i = 0; i < MAP_NODES.length; i++) {
      const [x, y] = MAP_NODES[i];
      if (nodeOpen(i) && (p.x - x) ** 2 + (p.y - (y - s)) ** 2 <= 32 * 32) return { stage: i };
    }
    return null;
  }
  const mapScrollBy = dy => { state.scroll = clampScroll((state.scroll ?? defaultScroll()) - dy); };

  // ---------------- stage prep panel (over the map) ----------------
  function drawCard(kind, b) {
    ctx.drawImage(img('btn_upgrade').img, b.x, b.y, b.w, b.h);
    const max = meta.isMax(kind);
    const lv = meta.level(kind);
    plain(max ? 'MAX' : `Lv.${meta.nextLabel(kind)}`, b.x + 12, b.y + 17, 16);
    frameC(kind === 'weapon' ? 'icon_sword' : 'icon_armor', Math.min(13, max ? lv : lv + 1), b.x + b.w / 2, b.y + 52, { scale: 0.92 });
    const pr = meta.price(kind);
    plain(max ? '-' : String(pr), b.x + b.w - 12, b.y + 94, 18, !max && pr > meta.gold() ? '#ff6a5a' : '#fff', 'right');
  }

  // booster row (clip c1 7:57): locked until stage 4 is cleared (lock_bg_booster, 91% black, over the faint row as in
  // clip c1 4:42), then live: owned counts, the selected booster's description and price, BUY.
  function drawBoosterRow() {
    const open = meta.boosterRowOpen();
    const sel = meta.items.find(i => i.key === state.sel) || meta.items[0];
    ctx.drawImage(img('item_row').img, 15, 393);
    ctx.drawImage(img('booster_red').img, ABILITY.x, ABILITY.y, ABILITY.w, ABILITY.h);
    frameC('icons', 23, 60, 422, { scale: 0.8 });
    plain('ABILITY', 60, 462, 13, '#fff', 'center');
    meta.items.forEach((it, i) => {
      const b = SLOT(i);
      frameC('icons', it.icon, b.x + 45, 432);
      plain(String(open ? meta.owned(it.key) : 0), b.x + 75, 410, 14, '#fff', 'right');
    });
    const si = meta.items.indexOf(sel);
    ctx.drawImage(img('booster_select').img, SLOT(si).x, 393);
    plain(sel.name, 30, 496, 16, '#fff');
    plain(sel.text[0], 30, 522, 14, '#cfc7bd');
    plain(sel.text[1], 30, 542, 14, '#cfc7bd');
    ctx.drawImage(img('booster_red').img, BUY.x, BUY.y, BUY.w, BUY.h);
    frameC('icons', sel.icon, BUY.x + 35, 505, { scale: 0.7 });
    plain('BUY', BUY.x + 43, 540, 15, '#fff', 'center');
    if (open) {
      frameC('icon_bag', 1, 300, 494, { scale: 0.6 });
      plain(String(sel.price), 360, 496, 16, sel.price > meta.gold() ? '#ff6a5a' : '#f3e04a', 'right');
      if (state.giftBanner) { // clip c1 7:57: blue banner over the row the first time
        ctx.fillStyle = 'rgba(20,40,160,0.85)';
        ctx.fillRect(110, 424, 300, 46);
        const g = metaData.boosters.freeGift.value.text.split('\n');
        plain(g[0], 260, 440, 14, '#fff', 'center');
        plain(g[1], 260, 459, 13, '#fff', 'center');
      }
    } else {
      ctx.drawImage(img('lock_items').img, 15, 391, 450, 168);
      plain(metaData.stages.itemsUnlockText.value, W / 2, 512, 17, '#fff', 'center');
    }
  }

  function drawPrep(stageIdx, t) {
    const id = meta.stageIds[stageIdx];
    const info = meta.stageInfo(id);
    if (state.prepIdx !== stageIdx) { state.prepIdx = stageIdx; state.mode = meta.defaultMode(id); }
    const mode = state.mode;
    const built = !!stages[id];
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    tileX('bg_top', 0);
    const mStars = meta.modeStars(id, mode);
    for (let i = 0; i < 3; i++) frameC('result_star', i < mStars ? 1 : 0, 164 + i * 77, 44, { scale: 0.85 });
    ctx.drawImage(img('popup_prep').img, 0, 96);
    ctx.fillStyle = '#16120f';
    ctx.fillRect(0, 608, W, H - 608);
    plain(`STAGE ${stageIdx + 1}`, W / 2, 122, 18, '#fff', 'center');
    plain(stageTitle(stageIdx), W / 2, 146, 19, '#fff', 'center');
    frame('btn_option', 6, PREP_BTN.close.x, PREP_BTN.close.y);
    // preview window + gold / gem bars are part of bg_upgrade
    ctx.drawImage(img('bg_upgrade').img, 16, 180);
    drawKnight(112, 322, 0.85);
    const st = meta.stats();
    plain(`ATK ${st.atk}  SKILL ${st.skill}  DEF ${st.def}  HP ${st.hp}`, 28, 198, 12, '#fff');
    ctx.drawImage(img('btn_r180').img, PREP_BTN.character.x, PREP_BTN.character.y);
    plain('CHARACTER', PREP_BTN.character.x + 90, PREP_BTN.character.y + 25, 19, '#fff', 'center');
    plain(String(meta.gold()), 384, 203, 19, '#f3e04a', 'right');
    plain(String(meta.gems()), 384, 245, 19, '#5fe0f0', 'right');
    ctx.drawImage(img('btn_more').img, PREP_BTN.goldPlus.x, PREP_BTN.goldPlus.y);
    ctx.drawImage(img('btn_more').img, PREP_BTN.gemPlus.x, PREP_BTN.gemPlus.y);
    drawCard('weapon', PREP_BTN.weapon);
    drawCard('armor', PREP_BTN.armor);
    drawBoosterRow();
    // NORMAL / HARD / HELL (btn_mode 0-2 = 1-3 skulls, 3 = padlock): open modes keep their frame, the picked one gets
    // the check; a mode opens after GET 3 STAR + UNTOUCHED in the one before (data/meta.json difficulty.challenges)
    PREP_BTN.modes.forEach((b, i) => {
      const open = meta.modeOpen(id, i);
      frame('btn_mode', i, b.x, b.y, { scale: 0.9 });
      if (!open) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(b.x + 3, b.y + 3, 76 * 0.9 - 6, 60 * 0.9 - 6);
        frame('btn_mode', 3, b.x, b.y, { scale: 0.9 });
      }
      if (i === mode) frameC('icon_check', 0, b.x + 34, b.y + 27, { scale: 1.25 });
    });
    const sb = PREP_BTN.start;
    ctx.save();
    if (!built) ctx.globalAlpha = 0.45;
    ctx.drawImage(img('btn_r').img, sb.x, sb.y, sb.w, sb.h);
    const bm = img('btn_menu').img;
    ctx.drawImage(bm, 40, 10, 44, 44, sb.x + sb.w - 56, sb.y + 7, 42, 42);
    ctx.restore();
    label(built ? 'START' : 'SOON', sb.x + 96, sb.y + sb.h / 2, 26, built ? '#ff9b1a' : '#999', 'center', false);
    plain(meta.modeLabel(id, mode), 16, 668, 17, mode === 0 ? '#fff' : mode === 1 ? '#7fd0ff' : '#ff7a6a');
    // this mode's two challenges (lit when done): 3 stars, a clear without taking a hit
    const three = mStars === 3;
    const unt = info.untouched[mode];
    plain(`${three ? '★' : '☆'} GET 3 STAR`, 16, 703, 18, three ? '#ffd23a' : '#9a9a9a');
    plain(`${unt ? '♥' : '♡'} UNTOUCHED`, 186, 703, 18, unt ? '#ffd23a' : '#9a9a9a');
    ctx.drawImage(img('lock_tab').img, PREP_BTN.auto.x, PREP_BTN.auto.y, PREP_BTN.auto.w, PREP_BTN.auto.h);
    plain('AUTO', PREP_BTN.auto.x + 43, PREP_BTN.auto.y + 58, 14, 'rgba(160,150,140,0.6)', 'center');
    if (!built) plain('THIS STAGE IS NOT IN THE WEB VERSION YET', W / 2, 760, 14, '#ffb35a', 'center');
    void t;
  }

  function prepTap(p, stageIdx) {
    const id = meta.stageIds[stageIdx];
    if (inside(p, PREP_BTN.close)) { state.prepIdx = null; state.giftBanner = false; return { close: true }; }
    if (inside(p, PREP_BTN.weapon) || inside(p, PREP_BTN.armor)) {
      const kind = inside(p, PREP_BTN.weapon) ? 'weapon' : 'armor';
      const r = meta.upgrade(kind);
      if (r === 'gold') toast('NOT ENOUGH GOLD');
      else if (r === 'max') toast('MAX LEVEL');
      return { upgrade: kind, result: r };
    }
    if (inside(p, PREP_BTN.goldPlus)) return { shop: 'GOLD' };
    if (inside(p, PREP_BTN.gemPlus)) return { shop: 'JEWEL' };
    if (inside(p, PREP_BTN.character)) return { character: true };
    const mi = PREP_BTN.modes.findIndex(b => inside(p, b));
    if (mi >= 0) {
      if (meta.modeOpen(id, mi)) { state.mode = mi; return { mode: mi }; }
      toast(`${meta.modes[mi].name}: GET 3 STAR + UNTOUCHED IN ${meta.modes[mi - 1].name} FIRST`);
      return { mode: mi, locked: true };
    }
    if (meta.boosterRowOpen()) {
      const si = meta.items.findIndex((it, i) => inside(p, SLOT(i)));
      if (si >= 0) { state.sel = meta.items[si].key; state.giftBanner = false; return { booster: state.sel }; }
      if (inside(p, BUY)) {
        const r = meta.buyBooster(state.sel);
        if (r === 'gold') toast('NOT ENOUGH GOLD');
        else if (r === 'notbuilt') toast('DESTINY BOOSTER\nIS NOT IN THE WEB VERSION YET');
        state.giftBanner = false;
        return { buy: state.sel, result: r };
      }
      if (inside(p, ABILITY)) return { ability: true };
    }
    if (inside(p, PREP_BTN.auto)) { toast('AUTO IS LOCKED'); return { auto: true }; }
    if (inside(p, PREP_BTN.start)) {
      if (!stages[id]) { toast('COMING SOON'); return { start: false }; }
      state.giftBanner = false;
      return { start: true, stage: id, mode: state.mode };
    }
    return null;
  }

  return {
    state, drawMap, mapTap, mapScrollBy, drawPrep, prepTap, toast, drawToast, drawCard, drawKnight,
    resetScroll: () => { state.scroll = null; state.prepIdx = null; },
    scroll: () => state.scroll ?? defaultScroll(),
  };
}
