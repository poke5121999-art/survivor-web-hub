// World map, stage prep panel and shop, drawn with the original art. Layout is parity-only (no positions are in the
// recovered data): measured on clip c2 5:20 (map, shown at 1.6x: map y = clip y / 1.6 + 60) and clip c1 4:42 (prep,
// clip x/y * 0.625). Numbers shown (prices, levels, stats, gold) come from js/meta.js -> data/meta.json.
import { W, H } from './sim.js';

// stage button centres on map_00_01 (map pixels), clip c2 5:20: stages 1-4 and the reward chest. The original only
// draws stages that are open, so nothing past the last open stage is placed.
// stage 5 is the reward-chest slot (FUC_SET_REWARD_CHEST_POSITION puts the chest on every slot with index % 5 == 4;
// clip c1 7:56: after stage 4 the player taps the chest and the SHAMANKING prep opens). The framed square above
// node 4 in that clip is frame_photo_map, a friend's profile photo (social data), not a stage.
export const MAP_CHEST = [161, 577];
export const MAP_NODES = [[176, 772], [299, 761], [378, 667], [293, 579], MAP_CHEST]; // stage 1 sits on the map art's red X
const MAP_H = 1024;
const TAB_Y = 712;
export const MAP_BTN = {
  tabs: ['STORY', 'ITEM', 'TOWER', 'WING', 'EXPLORE'].map((name, i) => ({ name, x: 4 + i * 95, y: TAB_Y, w: 92, h: 80 })),
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
export const SHOP_BTN = { back: { x: 123, y: 700, w: 234, h: 64 } };

export function createScreens(gfx, meta, stages, metaData) {
  const { ctx, img, frame, frameC, digits, label, plain, tileX } = gfx;
  const titles = metaData.stages.titles.value;
  const stageTitle = i => (stages[meta.stageIds[i]] ? stages[meta.stageIds[i]].title : titles[i] || '');
  const state = { scroll: null, toast: null, toastT: 0 };

  const nodeOpen = i => i < meta.stageIds.length && meta.unlocked(meta.stageIds[i]);
  const heroNode = () => Math.max(0, meta.lastCleared());
  function clampScroll(v) { return Math.max(0, Math.min(MAP_H - H, v)); }
  // clip c2 5:20: the view puts the hero's stage at screen y ~607 (map scroll 60 with stage 3 current)
  function defaultScroll() { return clampScroll(MAP_NODES[heroNode()][1] - 607); }

  function drawKnight(cx, feetY, scale, f = 0) {
    const t = meta.tiers();
    const left = cx - 53 * scale;
    const top = feetY - 122 * scale;
    frame(`hero_armor_${t.armor}`, f, left, top, { scale });
    frame(`hero_sword_${t.sword}`, f, left, top, { scale });
  }

  function toast(text) { state.toast = text; state.toastT = 1.6; }
  function drawToast(dt) {
    if (!state.toast) return;
    state.toastT -= dt;
    if (state.toastT <= 0) { state.toast = null; return; }
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.toastT * 3);
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(40, 372, W - 80, 56);
    ctx.restore();
    label(state.toast, W / 2, 400, 18, '#ffd23a');
  }

  // ---------------- world map ----------------
  function drawMap(dt, t) {
    if (state.scroll === null) state.scroll = defaultScroll();
    const s = state.scroll;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const m = img('map_00_01');
    ctx.drawImage(m.img, 0, -s, m.dw || m.w, m.dh || m.h);
    // stage-5 slot = reward chest (clip c2 5:20: shown once stage 3 is cleared): btn_stage frame 51 (the gold pronged
    // ring), Eff_Flash_01 turning once every 5 s (RotateBy(5, 360) forever) and icon_clear_bonus on top
    // (Scene_WorldMap::FUC_SET_REWARD_CHEST_POSITION @0x557778). The light is drawn at its 128 px file size, which is
    // what the clip shows (CLIP-MEASURED; the C++ scales it by the scene scale). The reward itself is not built.
    if (meta.lastCleared() >= 2) {
      const [x, y] = MAP_CHEST;
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
    MAP_NODES.forEach(([x, y], i) => {
      if (!nodeOpen(i)) return;
      if (MAP_NODES[i] !== MAP_CHEST) frameC('btn_stage', i + 1, x, y - s, { scale: 0.85 }); // the chest is stage 5's button
      const info = meta.stageInfo(meta.stageIds[i]);
      if (info.stars > 0) frameC('star_map', info.stars - 1, x, y - s + 47, { scale: 0.85 });
    });
    const [hx, hy] = MAP_NODES[heroNode()];
    drawKnight(hx, hy - s - 29, 0.75);
    // top bar: chapter 1 dragon, hearts (display only)
    tileX('bg_top', 0);
    frame('chapter_tab', 0, 33, 38, { scale: 0.94 });
    frame('icons', 33, 2, 126, { scale: 1.0 });
    digits('no_score', 10, 36, 138, 'left', 0.8, -4);
    // bottom tabs: STORY open, the rest locked
    tileX('bg_bottom', TAB_Y - 52);
    for (const tb of MAP_BTN.tabs) {
      if (tb.name === 'STORY') {
        ctx.save();
        ctx.fillStyle = '#17120e';
        ctx.fillRect(tb.x, tb.y, tb.w, tb.h);
        ctx.strokeStyle = '#b9893a';
        ctx.lineWidth = 2;
        ctx.strokeRect(tb.x + 1, tb.y + 1, tb.w - 2, tb.h - 2);
        ctx.restore();
        frameC('icons', 1, tb.x + tb.w / 2, tb.y + 30, { scale: 0.8 });
        plain('STORY', tb.x + tb.w / 2, tb.y + 66, 16, '#fff', 'center');
      } else {
        ctx.drawImage(img('lock_tab').img, tb.x, tb.y, tb.w, tb.h);
        plain(tb.name, tb.x + tb.w / 2, tb.y + 66, 15, 'rgba(160,150,140,0.55)', 'center');
      }
    }
    drawToast(dt);
  }

  function mapTap(p) {
    const s = state.scroll ?? defaultScroll();
    for (let i = 0; i < MAP_NODES.length; i++) {
      const [x, y] = MAP_NODES[i];
      if (nodeOpen(i) && (p.x - x) ** 2 + (p.y - (y - s)) ** 2 <= 32 * 32) return { stage: i };
    }
    for (const tb of MAP_BTN.tabs) {
      if (p.x >= tb.x && p.x <= tb.x + tb.w && p.y >= tb.y && p.y <= tb.y + tb.h) {
        if (tb.name !== 'STORY') toast(`${tb.name} IS LOCKED`);
        return { tab: tb.name };
      }
    }
    return null;
  }
  const mapScrollBy = dy => { state.scroll = clampScroll((state.scroll ?? defaultScroll()) - dy); };

  // ---------------- stage prep panel (over the map) ----------------
  const inside = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  function drawCard(kind, b) {
    ctx.drawImage(img('btn_upgrade').img, b.x, b.y, b.w, b.h);
    const max = meta.isMax(kind);
    const lv = meta.level(kind);
    plain(max ? 'MAX' : `Lv.${meta.nextLabel(kind)}`, b.x + 12, b.y + 17, 16);
    frameC(kind === 'weapon' ? 'icon_sword' : 'icon_armor', Math.min(13, max ? lv : lv + 1), b.x + b.w / 2, b.y + 52, { scale: 0.92 });
    const pr = meta.price(kind);
    plain(max ? '-' : String(pr), b.x + b.w - 12, b.y + 94, 18, !max && pr > meta.gold() ? '#ff6a5a' : '#fff', 'right');
  }

  function drawPrep(stageIdx, t) {
    const id = meta.stageIds[stageIdx];
    const info = meta.stageInfo(id);
    const built = !!stages[id];
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    tileX('bg_top', 0);
    for (let i = 0; i < 3; i++) frameC('result_star', i < info.stars ? 1 : 0, 164 + i * 77, 44, { scale: 0.85 });
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
    plain('0', 384, 245, 19, '#5fe0f0', 'right');
    ctx.drawImage(img('btn_more').img, PREP_BTN.goldPlus.x, PREP_BTN.goldPlus.y);
    ctx.drawImage(img('btn_more').img, PREP_BTN.gemPlus.x, PREP_BTN.gemPlus.y);
    drawCard('weapon', PREP_BTN.weapon);
    drawCard('armor', PREP_BTN.armor);
    // booster row as in clip c1 7:57 (ABILITY, HP potion, sword spirit, winged shield, relic; HP potion selected with its
    // game-text description and BUY tile), then lock_bg_booster (alpha 232/255) over it, so it shows through faintly as
    // in clip c1 4:42. Counts are 0 before boosters exist; prices are left out (not recovered).
    ctx.drawImage(img('item_row').img, 15, 393);
    ctx.drawImage(img('booster_red').img, 16, 395, 88, 80);
    frameC('icons', 23, 60, 422, { scale: 0.8 });
    plain('ABILITY', 60, 462, 13, '#fff', 'center');
    [55, 41, 42, 44].forEach((f, i) => {
      const cx = 150 + i * 90;
      frameC('icons', f, cx, 432);
      plain('0', cx + 30, 410, 14, '#fff', 'right');
    });
    ctx.drawImage(img('booster_select').img, 105, 393);
    plain('HP POTION', 30, 496, 16, '#fff');
    plain('Restores 30% of HP immediately when', 30, 522, 14, '#cfc7bd');
    plain('use. Can equip up to 3', 30, 542, 14, '#cfc7bd');
    ctx.drawImage(img('booster_red').img, 370, 478, 86, 72);
    frameC('icons', 55, 405, 505, { scale: 0.7 });
    plain('BUY', 413, 540, 15, '#fff', 'center');
    ctx.drawImage(img('lock_items').img, 15, 391, 450, 168);
    plain(metaData.stages.itemsUnlockText.value, W / 2, 512, 17, '#fff', 'center');
    // NORMAL / HARD / HELL: NORMAL selected, the others locked
    PREP_BTN.modes.forEach((b, i) => {
      // locked HARD / HELL keep their teal frame, darkened, under the padlock (clip c1 4:42)
      if (i > 0) {
        frame('btn_mode', i, b.x, b.y, { scale: 0.9 });
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(b.x + 3, b.y + 3, 76 * 0.9 - 6, 60 * 0.9 - 6);
      }
      frame('btn_mode', i === 0 ? 0 : 3, b.x, b.y, { scale: 0.9 });
      if (i === 0) frameC('icon_check', 0, b.x + 34, b.y + 27, { scale: 1.25 });
    });
    const sb = PREP_BTN.start;
    ctx.save();
    if (!built) ctx.globalAlpha = 0.45;
    ctx.drawImage(img('btn_r').img, sb.x, sb.y, sb.w, sb.h);
    const bm = img('btn_menu').img;
    ctx.drawImage(bm, 40, 10, 44, 44, sb.x + sb.w - 56, sb.y + 7, 42, 42);
    ctx.restore();
    label(built ? 'START' : 'SOON', sb.x + 96, sb.y + sb.h / 2, 26, built ? '#ff9b1a' : '#999', 'center', false);
    plain('NORMAL', 16, 668, 17, '#fff');
    const three = info.stars === 3;
    plain(`${three ? '★' : '☆'} GET 3 STAR`, 16, 703, 18, three ? '#ffd23a' : '#9a9a9a');
    plain('♡ UNTOUCHED', 186, 703, 18, '#9a9a9a');
    ctx.drawImage(img('lock_tab').img, PREP_BTN.auto.x, PREP_BTN.auto.y, PREP_BTN.auto.w, PREP_BTN.auto.h);
    plain('AUTO', PREP_BTN.auto.x + 43, PREP_BTN.auto.y + 58, 14, 'rgba(160,150,140,0.6)', 'center');
    if (!built) plain('THIS STAGE IS NOT IN THE WEB VERSION YET', W / 2, 760, 14, '#ffb35a', 'center');
    void t;
  }

  function prepTap(p, stageIdx) {
    const id = meta.stageIds[stageIdx];
    if (inside(p, PREP_BTN.close)) return { close: true };
    if (inside(p, PREP_BTN.weapon) || inside(p, PREP_BTN.armor)) {
      const kind = inside(p, PREP_BTN.weapon) ? 'weapon' : 'armor';
      const r = meta.upgrade(kind);
      if (r === 'gold') toast('NOT ENOUGH GOLD');
      else if (r === 'max') toast('MAX LEVEL');
      return { upgrade: kind, result: r };
    }
    if (inside(p, PREP_BTN.goldPlus) || inside(p, PREP_BTN.gemPlus)) return { shop: true };
    if (inside(p, PREP_BTN.character)) { toast('OTHER HEROES ARE NOT BUILT YET'); return { character: true }; }
    if (PREP_BTN.modes.some((b, i) => i > 0 && inside(p, b))) { toast('HARD / HELL ARE LOCKED'); return { mode: true }; }
    if (inside(p, PREP_BTN.auto)) { toast('AUTO IS LOCKED'); return { auto: true }; }
    if (inside(p, PREP_BTN.start)) {
      if (!stages[id]) { toast('COMING SOON'); return { start: false }; }
      return { start: true, stage: id };
    }
    return null;
  }

  // ---------------- shop (buying turned off) ----------------
  function drawShop(dt) {
    const sb = img('shop_bg');
    ctx.drawImage(sb.img, 0, 0, sb.dw || sb.w, sb.dh || sb.h);
    tileX('bg_top', -70);
    label('SHOP', W / 2, 46, 30, '#ffd23a');
    frame('board_money', 0, 8, 120);
    frame('board_money', 1, 250, 120);
    plain(String(meta.gold()), 216, 146, 20, '#f3e04a', 'right');
    plain('0', 458, 146, 20, '#5fe0f0', 'right');
    const lines = ['GEM AND GOLD PACKS ARE SOLD FOR', 'REAL MONEY IN THE ORIGINAL GAME', '(PRICES COME FROM THE APP STORE).', 'BUYING IS TURNED OFF IN THE WEB VERSION.', 'EARN GOLD BY CLEARING STAGES.'];
    lines.forEach((ln, i) => {
      const y = 240 + i * 78;
      ctx.drawImage(img('list_shop').img, 18, y);
      frameC('icon_gem', i % 3, 52, y + 34, { scale: 0.8 });
      plain(ln, 84, y + 34, 15, '#e8e0cc');
    });
    const b = SHOP_BTN.back;
    ctx.drawImage(img('btn_r').img, b.x, b.y);
    plain('BACK', b.x + b.w / 2, b.y + b.h / 2, 24, '#ffe9a8', 'center');
    drawToast(dt);
  }
  const shopTap = p => (inside(p, SHOP_BTN.back) ? { back: true } : null);

  return {
    state, drawMap, mapTap, mapScrollBy, drawPrep, prepTap, drawShop, shopTap, toast, drawToast,
    resetScroll: () => { state.scroll = null; },
  };
}
