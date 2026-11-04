// First-time user experience: the original guided steps (Scene_WorldMap / Scene_UI / Scene_Bag FUC_TUTO*), with their
// texts (GAME_INFO_TEXT 1206..1255), spotlight sheets (tuto_bg_NN), red bubble pointer (tuto_chat_bg) and dotted
// attack line (tuto_obj). Done flags are the save's tuto{} (TUTO%d bytes at GameData+0x4b5c+i). Source and order:
// meta/re_notes/ftue.md. One step is shown at a time; while it shows, a stage is held (FUC_UI_PAUSE) and taps are
// ignored for the first 1.0 s. Positions in the notes are Cocos coordinates (origin bottom-left, 480x800 design):
// a text "at (240,625)" is drawn here at y = 800 - 625 = 175 (checked on clip c2 1:44, TUTO06's text near the top). A "button" step only lets a tap on its target through (TUTO04/05/06, map bubbles);
// a "tap" step closes on a tap anywhere ("TAB ANYWHERE TO CONTINUE").
//
// Steps built: TUTO1, 2, 03, 04, 05, 06, 16, 07, 15, 32, 21, 22, 23, 8, 26, 24. Not built: TUTO17-20 (in-stage
// pickups are not in the web version, so their flags are set when stage 2's result is left, as the original's retry
// guard does), TUTO25 INTEN walkthrough, TUTO31 AUTO walkthrough, tower / wing / expedition steps (no such tabs yet).
// Web addition (labelled, no original step exists): SHOP bubble after the first upgrade.
import { W, H } from './sim.js';

const TXT = {
  t1: 'STORY(WORLD MAP)\nCLEAR ALL THE STORIES ONE BY ONE!\nSTART WITH FIRST STAGES!', // 1206
  t1b: 'SELECT FIRST STAGE!', // 1232
  t2: 'READY\nUPGRADE YOUR CHARACTER OR BUY BOOSTER ITEMS BEFORE ENTERING STAGE.', // 1207
  enter: 'ENTER', // 1233
  t3: 'YOU CAN NOT MOVE IN THIS GAME.\nWAIT UNTIL MONSTERS ARE CLOSE ENOUGH', // 1208
  t4: 'WHEN MONSTERS ARE IN RANGE,\nPRESS ATTACK BUTTON TO ATTACK!', // 1209
  t5: 'NOW TO THE LEFT!', // 1210
  tab: 'TAB\nBUTTON!', // 1235
  t6: 'SKILL ACTIVATED.\nPRESS BUTTON TO SLAIN ALL!', // 1211
  t6b: 'TAB SKILL BUTTON', // 1236
  t7: 'CONGRATULATION! CLEARED FIRST STAGE!\nCLEAR ALL THE STAGES TO SEAL DARK LORD,\nTHE EVIL DRAGON AGAIN!', // 1212
  t7b: 'TO NEXT STAGE', // 1237
  t15: 'ENTER 2nd STAGE', // 1240
  t16: 'MONSTER DROPS GOLD AND IT WILL BE AUTO-COLLECTED\n(GEMS ARE MORE VALUABLE THAN GOLD)', // 1224
  t21: 'CHARACTER WILL GET STRONGER\nAS YOU UPGRADE WITH GOLDS', // 1229
  t21b: 'UPGRADE', // 1241
  t32: 'THE HIGHER DIFFICULTY LEVEL, THE MORE GOLD YOU GET!\nHARD MODE: GOLD x2 / HELL MODE: GOLD x3\nHELL MODE CLEAR: GOLD x4', // 1231
  t23: 'THERE IS\nAN ITEM', // 1242
  t8: 'INVENTORY\nEQUIP ITEMS AND GET STRONGER', // 1213
  t8b: 'TO GET ITEMS:\n1. BUY ITEM BOX WITH JEWELS\n2. GET FLYING ITEM BOX IN THE TOWER OF DEATH', // 1214
  t26: 'ITEM\nDRAW!', // 1246
  t26b: 'ONE FREE!!', // 1247
  select: 'SELECT', // 1243
  any: 'TAB ANYWHERE TO CONTINUE', // 1234
  shop: 'SHOP', // web addition
  shopText: 'SHOP: TRADE JEWELS FOR GOLD AND HEARTS.\nTAP FREE! IN THE SHOP FOR 1 JEWEL EVERY DAY.', // web addition
};
// spotlight sheets: where each sheet's lit hole is (measured from the alpha channel of the original files)
const HOLES = { tuto_bg_01: [174, 546], tuto_bg_03: [240, 376], tuto_bg_13: [109, 393], tuto_bg_08: null };
const GATE = 1.0; // taps ignored for the first second (Scene_UI::onTouchesBegan gate)

export function createFtue(gfx, meta) {
  const { ctx, img, plain } = gfx;
  let cur = null; // the step on screen
  let pending2 = false;
  let lastL = null; // TUTO2 shows on the first prep after TUTO1 (its flag is set with TUTO1's)
  const done = n => meta.tutoDone(n);
  const inside = (p, b) => !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

  function show(step) { cur = { t: 0, ...step }; return cur; }
  const clear = () => { cur = null; };

  // ---- triggers, asked by main.js each frame with what is on screen ----
  // ui: { scene, prep, popup, sim, stageIdx, L (layout rects), firstCoin, mapNode0 }
  function check(ui) {
    if (cur) return cur;
    const { scene, L } = ui;
    lastL = L;
    if (scene === 'map' && ui.prep === null && !ui.popup) {
      if (!done(1)) {
        return show({ id: 'TUTO1', kind: 'button', sheet: 'tuto_bg_01', hole: ui.mapNode0, target: { x: ui.mapNode0[0] - 34, y: ui.mapNode0[1] - 34, w: 68, h: 68 },
          text: TXT.t1, textY: 250, bubble: TXT.t1b, wide: true, on: () => { meta.setTuto(1, 2); pending2 = true; } });
      }
      if (done(22) && !done('shop')) {
        return show({ id: 'SHOP', web: true, kind: 'button', target: L.shopBtn, text: TXT.shopText, textY: 470, bubble: TXT.shop, on: () => meta.setTuto('shop') });
      }
      if (meta.tabOpen('ITEM') && !done(23)) {
        return show({ id: 'TUTO23', kind: 'button', target: L.itemTab, bubble: TXT.t23, on: () => meta.setTuto(23) });
      }
    }
    if (scene === 'map' && ui.prep !== null && !ui.popup) {
      if (ui.prep === 0 && pending2) return show({ id: 'TUTO2', kind: 'button', target: L.start, text: TXT.t2, textY: 760, bubble: TXT.enter, wide: true, on: () => { pending2 = false; } });
      if (ui.prep === 1 && done(7) && !done(15)) return show({ id: 'TUTO15', kind: 'button', target: L.start, bubble: TXT.t15, wide: true, on: () => meta.setTuto(15) });
      if (done(20) && !done(21)) return show({ id: 'TUTO21', kind: 'button', target: L.weapon, text: TXT.t21, textY: 760, bubble: TXT.t21b, on: () => meta.setTuto(21) });
      if (done(21) && !done(22)) return show({ id: 'TUTO22', kind: 'button', target: L.armor, text: TXT.t21, textY: 760, bubble: TXT.t21b, on: () => meta.setTuto(22) });
    }
    if (scene === 'bag') {
      if (!done(8)) return show({ id: 'TUTO8', kind: 'tap', sheet: 'tuto_bg_08', text: TXT.t8, textY: 175, text2: TXT.t8b, text2Y: 470, anyY: 680, on: () => meta.setTuto(8) });
      if (!done(26) && !ui.popup) return show({ id: 'TUTO26', kind: 'button', target: L.box, bubble: TXT.t26, bubble2: TXT.t26b }); // flag set by the free box itself (metaUI)
      if (done(26) && !done(24) && meta.bag().length) {
        if (!ui.popup) return show({ id: 'TUTO24', kind: 'button', target: L.cell0, bubble: TXT.select });
        return show({ id: 'TUTO24_EQUIP', kind: 'button', target: L.equipBtn, bubble: TXT.select, on: () => meta.setTuto(24) });
      }
    }
    if (scene === 'stage' && ui.sim) {
      const s = ui.sim;
      if (s.phase === 'play' && !s.paused) {
        if (ui.stageIdx === 0 && !done(3)) {
          // stage 1 script markers 77777 / 77778 / 77779 at 2.0 / 3.2 / 7.1 s (SCH_PLAY_BY_SCENARIO)
          const seen = s.tuto || (s.tuto = {});
          if (s.clock >= 2.0 && !seen[3]) { seen[3] = true; return hold(s, { id: 'TUTO03', kind: 'tap', sheet: 'tuto_bg_03', text: TXT.t3, textY: 175, obj: [280, 380] }); }
          if (s.clock >= 3.2 && !seen[4]) { seen[4] = true; return hold(s, { id: 'TUTO04', lane: true, kind: 'button', target: L.right, keys: ['ArrowRight', 'd', 'D'], text: TXT.t4, textY: 195, obj: [280, 380], bubble: TXT.tab }); }
          if (s.clock >= 7.1 && !seen[5]) { seen[5] = true; return hold(s, { id: 'TUTO05', lane: true, kind: 'button', target: L.left, keys: ['ArrowLeft', 'a', 'A'], text: TXT.t5, textY: 195, obj: [192, 380], bubble: TXT.tab }); }
        }
        // the dash gauge fills for the first time, any stage (SCH_CHECK_MISSION_TARGET_TIME); its flag is set at once
        if (!done(6) && s.hero.dashCd <= 0 && s.clock > 0.5) {
          meta.setTuto(6);
          return hold(s, { id: 'TUTO06', lane: true, kind: 'button', target: L.red, keys: ['x', 'X', 'Enter'], text: TXT.t6, textY: 195, bubble: TXT.t6b, wide: true });
        }
        if (ui.stageIdx <= 1 && !done(16) && ui.firstCoin) {
          meta.setTuto(16);
          return hold(s, { id: 'TUTO16', kind: 'tap', sheet: 'tuto_bg_13', text: TXT.t16, textY: 125 });
        }
        // stage 2 markers 77780 / 77781 (3.5 / 10.1 s), once TUTO20 is done and stage 3 is not cleared yet
        if (ui.stageIdx === 1 && done(20) && !done(32) && !meta.stageInfo(meta.stageIds[2]).cleared && s.clock >= 3.5) {
          meta.setTuto(32);
          return hold(s, { id: 'TUTO32', kind: 'tap', text: TXT.t32, textY: 200 });
        }
      }
      if (s.phase === 'result' && s.won && !done(7)) {
        return show({ id: 'TUTO07', kind: 'button', target: L.next, text: TXT.t7, textY: 175, bubble: TXT.t7b, wide: true, gate: 0.6, on: () => meta.setTuto(3, 4, 5, 6, 7) });
      }
    }
    return null;
  }
  function hold(s, step) { s.tutoHold = true; return show({ ...step, sim: s, L: lastL }); }
  function release() {
    if (cur && cur.sim) cur.sim.tutoHold = false;
    if (cur && cur.on) cur.on();
    clear();
  }

  // ---- input: 'block' swallows the tap, 'pass' lets main.js handle it as usual (after the step is released) ----
  function tap(p) {
    if (!cur) return null;
    if (cur.t < (cur.gate ?? GATE)) return 'block';
    if (cur.kind === 'tap') { release(); return 'block'; }
    if (inside(p, cur.target)) { release(); return 'pass'; }
    return 'block';
  }
  function key(k) {
    if (!cur) return null;
    if (cur.t < (cur.gate ?? GATE)) return 'block';
    if (cur.kind === 'tap') { release(); return 'block'; }
    if (cur.keys && cur.keys.includes(k)) { release(); return 'pass'; }
    return 'block';
  }
  // a step whose screen went away (prep closed, stage left) is dropped without setting its flag
  function drop() { if (cur && cur.sim) cur.sim.tutoHold = false; clear(); }

  // ---- drawing ----
  function dim(sheet, at, lane) {
    ctx.save();
    if (lane) {
      // in-stage button steps (clip c2 1:44, TUTO06): the lane stays lit, the HUD and the pad go dark except the target
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.beginPath();
      ctx.rect(0, 0, W, lane.y);
      ctx.rect(0, lane.y + lane.h, W, H - lane.y - lane.h);
      if (at) { ctx.moveTo(at[0] + at[2], at[1]); ctx.arc(at[0], at[1], at[2], 0, Math.PI * 2, true); }
      ctx.fill('evenodd');
    } else if (sheet && img(sheet)) {
      const h = HOLES[sheet];
      const dx = h && at ? at[0] - h[0] : 0;
      const dy = h && at ? at[1] - h[1] : 0;
      ctx.drawImage(img(sheet).img, dx, dy, W, H);
      // black out what the shifted sheet does not cover (the original's four 480x800 sprites around it)
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      if (dy > 0) ctx.fillRect(0, 0, W, dy);
      if (dy < 0) ctx.fillRect(0, H + dy, W, -dy);
      if (dx > 0) ctx.fillRect(0, 0, dx, H);
      if (dx < 0) ctx.fillRect(W + dx, 0, -dx, H);
    } else if (at) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(at[0], at[1], at[2] || 70, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
  function lines(text, y, size = 18, color = '#fff', band = true) {
    const ls = text.split('\n');
    // a dark band behind the text so it reads over any screen (the original sheets are 80% black there)
    if (band) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      const hh = ls.length * (size + 6) + 14;
      ctx.fillRect(0, y - hh / 2, W, hh);
      ctx.restore();
    }
    ls.forEach((ln, i) => {
      let z = size;
      ctx.font = `600 ${z}px Arial, Helvetica, sans-serif`;
      while (z > 11 && ctx.measureText(ln).width > W - 30) { z--; ctx.font = `600 ${z}px Arial, Helvetica, sans-serif`; }
      plain(ln, W / 2, y + (i - (ls.length - 1) / 2) * (z + 6), z, color, 'center');
    });
  }
  // red bubble pointing at the target: above it with the tail down, or below it flipped when there is no room
  function bubble(text, b, wide, t, second) {
    const k = wide ? 'tuto_chat_w' : 'tuto_chat';
    const a = img(k);
    const cx = Math.max(a.w / 2 + 4, Math.min(W - a.w / 2 - 4, b.x + b.w / 2));
    const up = b.y - a.h - 4 < 90;
    const by = up ? b.y + b.h + 4 : b.y - a.h - 4;
    const s = 1 + 0.05 * Math.sin(t * 6);
    ctx.save();
    ctx.translate(cx, by + a.h / 2);
    ctx.scale(s, up ? -s : s);
    ctx.drawImage(a.img, -a.w / 2, -a.h / 2);
    ctx.restore();
    const ty = by + (up ? a.h * 0.58 : a.h * 0.42);
    const ls = text.split('\n');
    ls.forEach((ln, i) => plain(ln, cx, ty + (i - (ls.length - 1) / 2) * 20, wide ? 17 : 16, '#fff', 'center'));
    if (second) plain(second, cx, up ? by + a.h + 18 : by - 14, 16, '#7fff7f', 'center');
  }
  function draw(dt) {
    if (!cur) return;
    cur.t += dt;
    const tb = cur.target;
    const at = cur.hole || (tb ? [tb.x + tb.w / 2, tb.y + tb.h / 2, Math.max(tb.w, tb.h) * (cur.lane ? 0.5 : 0.62)] : null);
    dim(cur.sheet, cur.sheet === 'tuto_bg_01' ? at : cur.sheet ? null : at, cur.lane && cur.L ? cur.L.lane : null);
    if (cur.obj) ctx.drawImage(img('tuto_obj').img, cur.obj[0] - 59, cur.obj[1] - 9);
    // in-stage texts are yellow on the dim (clip c2 1:44); map / prep / result texts get a dark band
    if (cur.text) lines(cur.text, cur.textY || 175, cur.sim ? 16 : 18, cur.sim ? '#fff35a' : '#fff', !cur.sim && (!cur.sheet || cur.sheet === 'tuto_bg_01'));
    if (cur.text2) lines(cur.text2, cur.text2Y || 470, 15, '#fff', false);
    if (cur.kind === 'tap' && cur.t >= 0.3) {
      ctx.save();
      ctx.globalAlpha = cur.t < GATE ? Math.min(1, (cur.t - 0.3) / 0.3) : 0.55 + 0.45 * Math.cos((cur.t - GATE) * Math.PI / 0.6);
      plain(TXT.any, W / 2, cur.anyY || 600, 22, '#ffd23a', 'center');
      ctx.restore();
    }
    if (cur.bubble && tb) bubble(cur.bubble, tb, cur.wide, cur.t, cur.bubble2);
    if (cur.web) plain('(web version tip)', W / 2, (cur.textY || 470) + 44, 11, '#bbb', 'center');
  }

  return { check, tap, key, draw, drop, release, get cur() { return cur; }, active: () => !!cur, freeBox: () => !done(26), TXT };
}
