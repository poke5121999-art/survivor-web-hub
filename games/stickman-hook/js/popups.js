// Popups of rev 20261028o (README "Popup: mở khoá, kỳ mới, ưu đãi, prompt cuối màn"), loaded on first use:
// - ModeUnlockedPopup, CustomizationItemUnlockedPopup, CollectionCompletedPopup for every grant list (main.js unlocks)
// - NewTournamentPopup / NewAdventurePopup, the home page's adventure_competition / tournament_competition prompters
// - MarketVipPopup / MarketOfferPopup (StickmanHookMarketOfferPopup) for the offers that have a viewPurchasePopupId
// - the end_game placement's optional prompters (lucky wheel, market, customization incentive) and the Adventure
//   incentive every 5th page claim
// Layout: RectTransforms of the prefabs (D:/stickman-hook-ref/dump/ftue/tree_*.txt, dump/offers/tree_*.txt) placed by
// rt() on the 750 x 1334 canvas matched to the height. Art: art/m-pmode / pseason / pskin / ovip / ooffer.webp.
// Popups queue one at a time like UIService.EnqueuePopupAsync; open / close go through uikit.js popOpen / popClose.
import { sheet, kitStyle, spr, slice, fit, U, label, tinted, popOpen, popClose } from './uikit.js';
import { watch, adIcon } from './ads.js';

const CSS = `
.pp { z-index: 7; overflow: hidden; color: #fff; }
.pp .abs, .pp button { position: absolute; }
.pp button { border: 0; padding: 0; background-color: transparent; cursor: pointer; }
.pp .ctr { display: flex; align-items: center; justify-content: center; flex-direction: column; }
.pp .row { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; }
.pp .sun { animation: ppsun 9s linear infinite; }
.pp .sun.slow { animation-duration: 18s; }
@keyframes ppsun { to { transform: rotate(-360deg); } }
.pp .pat { position: absolute; left: -100%; top: -100%; width: 300%; height: 300%; background-repeat: repeat; mix-blend-mode: plus-lighter;
  transform: rotate(-30deg); pointer-events: none; }
.pp .pop { animation: pppop .35s ease-out both; }
@keyframes pppop { 0% { transform: scale(0); } 70% { transform: scale(1.25); } 100% { transform: scale(1); } }
.pp .hide { visibility: hidden; }
.pp canvas.sk, .pp canvas.ic { position: absolute; inset: 0; width: 100%; height: 100%; }
`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const Q = { chain: Promise.resolve(), n: 0 };
// UIService.EnqueuePopupAsync: one popup at a time, in order
function enqueue(fn) {
  Q.n++;
  const p = Q.chain.then(fn).catch((e) => console.warn('popup', e)).finally(() => { Q.n--; });
  Q.chain = p;
  return p;
}
export const busy = () => Q.n > 0;

// RectTransform -> CSS: anchors [minX, minY, maxX, maxY] (y up), anchoredPosition, sizeDelta, pivot, in reference units
function rt(el, a, p = [0, 0], sz = [0, 0], pv = [0.5, 0.5]) {
  Object.assign(el.style, { position: 'absolute', left: `calc(${a[0] * 100}% + ${U(p[0] - pv[0] * sz[0])})`,
    width: `calc(${(a[2] - a[0]) * 100}% + ${U(sz[0])})`, bottom: `calc(${a[1] * 100}% + ${U(p[1] - pv[1] * sz[1])})`,
    height: `calc(${(a[3] - a[1]) * 100}% + ${U(sz[1])})` });
  return el;
}
const C = [0.5, 0.5, 0.5, 0.5], FULL = [0, 0, 1, 1];
function node(parent, a, p, sz, pv, tag = 'div', cls = 'abs') {
  const el = document.createElement(tag);
  el.className = cls;
  parent.appendChild(rt(el, a, p, sz, pv));
  return el;
}

// TMP rich text (<size=N|N%|Nem>, <color=#..>, \n) as rows of Junegull labels, one label per run
function rich(app, text, px, color = null, wrap = false) {
  const box = document.createElement('div');
  box.className = 'ctr';
  box.style.gap = U(px * 0.08);
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const row = document.createElement('div');
    row.className = 'row';
    row.style.columnGap = U(px * 0.25);
    if (!wrap) row.style.flexWrap = 'nowrap';
    const size = [px], col = [color];
    for (const m of line.matchAll(/<(\/?)(size|color)(?:=([^>]+))?>|([^<]+)/g)) {
      if (m[4]) { if (m[4].trim()) for (const w of m[4].trim().split(/\s+/)) row.appendChild(label(app, w, size.at(-1), col.at(-1))); continue; }
      const st = m[2] === 'size' ? size : col;
      if (m[1]) { if (st.length > 1) st.pop(); continue; }
      if (m[2] === 'color') { st.push(m[3]); continue; }
      const v = m[3];
      st.push(v.endsWith('%') ? (px * parseFloat(v)) / 100 : v.endsWith('em') ? px * parseFloat(v) : parseFloat(v));
    }
    if (row.children.length) box.appendChild(row);
  }
  return box;
}
// TMP auto size [ĐỀ XUẤT]: a text wider than its box shrinks to fit it (the original's labels never overflow)
function text(app, box, t, px, color, wrap = false) {
  box.classList.add('ctr');
  const r = rich(app, t, px, color, wrap);
  box.replaceChildren(r);
  requestAnimationFrame(() => {
    const k = box.clientWidth && r.scrollWidth > box.clientWidth ? box.clientWidth / r.scrollWidth : 1;
    if (k < 1) r.style.transform = `scale(${k})`;
  });
  return box;
}
const css = (hex) => hex.length > 7 ? [hex.slice(0, 7), parseInt(hex.slice(7), 16) / 255] : [hex, 1];
// Image tinted by its colour (white sprites), alpha as opacity
function tint(el, sh, name, color) {
  const [c, a] = css(color);
  Object.assign(el.style, { backgroundImage: tinted(sh, name, c), backgroundSize: 'contain', backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat', opacity: a });
  return el;
}
function root(app, id) {
  kitStyle();
  if (!document.getElementById('ppCss')) document.head.insertAdjacentHTML('beforeend', `<style id="ppCss">${CSS}</style>`);
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
  el.className = 'ui overlay pp';
  el.innerHTML = '';
  delete el.dataset.tweenOpen; delete el.dataset.tweenClose;
  return el;
}
// PopupBackground (UIGradient angle 0 + the tiled Pattern, MaterialTranslation): full-screen popups
function fullBg(el, sh, c1, c2, pattern, patColor, patPx = 341) {
  const bg = node(el, FULL);
  bg.style.background = `linear-gradient(${c1}, ${c2})`;
  const pat = document.createElement('i');
  pat.className = 'pat';
  const [, a] = css(patColor);
  // a white pattern under an additive material: brightness of the colour (#2b2b2b = 0.17) or its alpha
  const k = patColor.startsWith('#ffffff') ? a : parseInt(patColor.slice(1, 3), 16) / 255;
  Object.assign(pat.style, { backgroundImage: `url(${cutUrl(sh, pattern)})`, backgroundSize: `${U(patPx)} ${U(patPx)}`, opacity: k });
  bg.appendChild(pat);
  return bg;
}
const cutCache = new Map();
function cutUrl(sh, name) {
  const key = sh.url + name;
  if (!cutCache.has(key)) {
    const r = sh.rects[name], c = document.createElement('canvas');
    c.width = r[2]; c.height = r[3];
    c.getContext('2d').drawImage(sh.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    cutCache.set(key, c.toDataURL());
  }
  return cutCache.get(key);
}
function sun(el, sh, a, p, sz, color, slow = false) {
  const s = node(el, a, p, sz);
  s.classList.add('sun');
  if (slow) s.classList.add('slow');
  return tint(s, sh, 'ShinySun', color);
}
// A sliced button with its label (`k`: reference units per sheet px of the border)
function button(app, parent, sh, sprite, t, px, a, p, sz, pv, k = 1, color = null) {
  const b = node(parent, a, p, sz, pv, 'button', '');
  const bg = node(b, FULL);
  slice(bg, sh, sprite, k);
  const tx = node(b, FULL, [0, 5], [0, 0]);
  text(app, tx, t, px, color);
  return b;
}

// The equipped look of an item: a skin's dance clip on a canvas (SkinView), a rope / trail shop icon
function skinView(app, box, it, scale = 0.9) {
  const c = document.createElement('canvas');
  c.className = 'sk';
  c.style.inset = '-25%'; // dance frames larger than the first one draw past the box instead of being cut
  c.style.width = c.style.height = '150%';
  box.appendChild(c);
  app.custom.skin(it).then((sk) => {
    const frames = sk.dance.frames.length ? sk.dance.frames : Object.keys(sk.frames).slice(0, 1);
    const t0 = performance.now();
    const draw = () => {
      if (!c.isConnected) return;
      requestAnimationFrame(draw);
      const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
      if (!w) return;
      if (c.width !== w) { c.width = w; c.height = h; }
      const g = c.getContext('2d');
      g.clearRect(0, 0, w, h);
      const name = frames[Math.floor(((performance.now() - t0) / 1000) * (sk.dance.fps || 12)) % frames.length];
      const f = sk.frames[name];
      if (!f) return;
      // the prefab's skin Image is a UI sprite fitted in its box (preserveAspect); here the dance clip, every frame at the
      // scale and pivot that fit the first one, times `scale` [ĐỀ XUẤT]
      const [img, r] = f, r0 = sk.frames[frames[0]][1], k = Math.min(w / 1.5 / r0[2], h / 1.5 / r0[3]) * scale;
      const px = (w - r0[2] * k) / 2 + r0[4] * k, py = (h - r0[3] * k) / 2 + r0[5] * k;
      g.drawImage(img, r[0], r[1], r[2], r[3], px - r[4] * k, py - r[5] * k, r[2] * k, r[3] * k);
    };
    draw();
  }).catch(() => {});
  return c;
}
function iconView(app, box, it) {
  const c = document.createElement('canvas');
  c.className = 'ic';
  box.appendChild(c);
  app.custom.icons().then((icons) => {
    const r = icons.rects[it.kind + '/' + it.asset];
    if (!r) return;
    c.width = r[2]; c.height = r[3];
    c.style.objectFit = 'contain';
    const k = Math.min(1, 1);
    c.getContext('2d').drawImage(icons.img, r[0], r[1], r[2], r[3], 0, 0, r[2] * k, r[3] * k);
    Object.assign(c.style, { width: '100%', height: '100%', objectFit: 'contain' });
  }).catch(() => {});
  return c;
}

// CollectionProgressBar: CollectionName on top, then one CollectionProgressElement (77 x 84 rounded_square_shadow_bottom,
// IconValidate when owned, IconValidateSlot else) per item on a CollectionCompletionLink; complete: "Completed!" (#FFC327).
// `newIt`: the item just unlocked, whose slot pops (CollectionProgressBar.AnimateUnlock) after `delay` ms.
function collectionBar(app, parent, sh, col, opts) {
  const { meta, save } = app, items = meta.items.filter((o) => o.collection === col);
  const have = items.filter((o) => meta.ownsRes(save, o.id)).length, done = have >= items.length;
  const box = node(parent, opts.a, opts.p, opts.sz);
  const panel = document.createElement('div');
  panel.className = 'abs ctr';
  Object.assign(panel.style, { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', minWidth: U(340), padding: `${U(25)} ${U(30)} ${U(20)}`,
    gap: U(10), boxSizing: 'border-box' });
  const bg = document.createElement('i');
  bg.className = 'abs';
  bg.style.inset = '0';
  slice(bg, sh, 'rounded_square_128px', 0.5);
  const [c, a] = css(opts.color);
  bg.style.borderImageSource = tinted(sh, 'rounded_square_128px', c);
  bg.style.opacity = a;
  panel.appendChild(bg);
  const name = document.createElement('div');
  name.style.position = 'relative';
  text(app, name, meta.d.collections[col]?.[0] || col, opts.namePx || 37.5);
  panel.appendChild(name);
  const row = document.createElement('div');
  row.className = 'row';
  Object.assign(row.style, { position: 'relative', flexWrap: 'nowrap' });
  const gap = Math.min(107, 500 / Math.max(1, items.length)), k = Math.min(1, gap / 107);
  const link = document.createElement('i');
  Object.assign(link.style, { position: 'absolute', left: U(gap / 2), right: U(gap / 2), top: '50%', height: U(8 * k), marginTop: U(-4 * k),
    background: '#fff' });
  row.appendChild(link);
  const newIdx = opts.newIt ? items.indexOf(opts.newIt) : -1;
  items.forEach((it, i) => {
    const owned = meta.ownsRes(save, it.id);
    const cell = document.createElement('div');
    Object.assign(cell.style, { position: 'relative', width: U(gap), height: U(84 * k), display: 'flex', justifyContent: 'center' });
    const e = document.createElement('i');
    Object.assign(e.style, { position: 'relative', width: U(77 * k), height: U(84 * k) });
    slice(e, sh, 'rounded_square_shadow_bottom', 0.5 * k);
    const v = document.createElement('i');
    Object.assign(v.style, { position: 'absolute', left: '12%', right: '12%', top: '14%', bottom: '28%' });
    const ok = done && !opts.animateComplete ? 'Icon_Validate' : owned && i !== newIdx ? 'IconValidate' : 'IconValidateSlot';
    fit(v, sh, ok);
    v.dataset.state = ok;
    e.appendChild(v);
    cell.appendChild(e);
    row.appendChild(cell);
    if (i === newIdx && owned) setTimeout(() => { fit(v, sh, 'IconValidate'); v.dataset.state = 'IconValidate'; v.classList.add('pop'); }, opts.delay || 200);
  });
  panel.appendChild(row);
  const comp = document.createElement('div');
  comp.style.position = 'relative';
  comp.className = 'cdone';
  text(app, comp, 'Completed!', opts.donePx || 55.8, '#FFC327');
  if (!done) comp.style.display = 'none';
  else if (opts.animateComplete) {
    comp.classList.add('hide');
    setTimeout(() => { comp.classList.remove('hide'); comp.classList.add('pop'); row.querySelectorAll('i[data-state]').forEach((v) => fit(v, sh, 'Icon_Validate')); },
      opts.delay || 200);
  }
  panel.appendChild(comp);
  box.appendChild(panel);
  box.dataset.collection = `${col}:${have}/${items.length}`;
  return box;
}

async function show(app, id, kind, build) {
  const el = root(app, id);
  const o = await build(el);
  app.overlay(id, true);
  app.play('popup_in');
  const opened = popOpen(el, kind, o);
  return new Promise((resolve) => {
    let closing = false;
    // a page that takes the screen (a level starting, a mode opening) may hide every overlay: the popup is gone, the
    // queue goes on
    const mo = new MutationObserver(() => { if (!closing && !el.classList.contains('on')) { closing = true; mo.disconnect(); resolve('gone'); } });
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    el.__close = async (v) => {
      if (closing) return;
      closing = true;
      mo.disconnect();
      app.play('popup_out');
      await opened;
      await popClose(el, kind, o);
      app.overlay(id, false);
      app.hud();
      resolve(v);
    };
    o.ready?.(el.__close);
  });
}

// ---- ModeUnlockedPopup (UI/Popups/XpRoad/ModeUnlocked) ---------------------------------------------------------------
// GameModesService.OnModeUnlocked [asm 0x1297bdc] (any mode.* grant) and OnModeLevelUnlocked [asm 0x1297dec] (an
// unlocked_level_<mode> grant when the mode's autoUnlockNextLevel is false: Challenge) -> ShowModePopup [asm 0x1297c74].
// Activate [asm 0x11970a0]: title by mode, the mode's iconAddress 400 x 400, "Level {n}" under it for Challenge,
// "Try it!" (ActionButton) and "Tap to continue" (hidden for Tournament and Adventure). Background: the prefab's
// UIGradient #40E8EC -> #008FE1 (PaletteSettings._trophyRoadGraphicData not read). MadTween: no transition.
const MODE_TITLE = { 'mode.tournament': 'Tournament', 'mode.pachinko': 'Lucky Drop', 'mode.grapple': 'Grapple Mode', 'mode.adventure': 'Adventure' };
const MODE_ICON = { 'mode.tournament': 'ModeIcon_tournament', 'mode.pachinko': 'ModeIcon_pachinko', 'mode.grapple': 'ModeIcon_grapple',
  'mode.adventure': 'ModeIcon_adventure', 'mode.challenge': 'ModeIcon_challenge' };
export function modeUnlocked(app, modeId) {
  return enqueue(() => show(app, 'ppMode', 'instant', async (el) => {
    const sh = await sheet(app, 'pmode');
    el.dataset.mode = modeId;
    fullBg(el, sh, '#40E8EC', '#008FE1', 'Pattern_MainMenu', '#2b2b2bff');
    sun(el, sh, C, [0, 15], [900, 1250], '#da73d6ff');
    const mc = node(el, C, [0, 55], [400, 400]);
    fit(mc, sh, MODE_ICON[modeId] || MODE_ICON['mode.challenge']);
    mc.classList.add('pop');
    if (modeId === 'mode.challenge') {
      const n = app.save.modes['mode.challenge']?.levels || 1;
      text(app, node(mc, [0, 0, 1, 0], [0, 0], [0, 400]), `Level ${n}`, 60);
    }
    const title = `<size=80><color=#7BEFA9>${MODE_TITLE[modeId] || 'Challenge'}</color></size>\n\r<size=66>unlocked!</size>`;
    const top = text(app, node(el, [0, 1, 1, 1], [0, -250], [0, 100]), title, 49);
    top.dataset.title = (MODE_TITLE[modeId] || 'Challenge') + ' unlocked!';
    const tryIt = button(app, el, sh, 'OutlinedButtonGreen', 'Try it!', 36, [0.5, 0, 0.5, 0], [0, 240], [310, 120], [0.5, 0.5], 0.8);
    tryIt.className = 'try';
    let next = null;
    if (modeId !== 'mode.tournament' && modeId !== 'mode.adventure') {
      next = node(el, [0.5, 0, 0.5, 0], [0, 100], [600, 125], [0.5, 0.5], 'button', 'next');
      text(app, next, 'Tap to continue', 50, '#092B57');
    }
    return { ready: (close) => {
      // <Activate>b__19_0 [asm 0x1196dd0]: challenge / grapple -> MODES, tournament / adventure -> HOME, pachinko -> PACHINKO
      tryIt.onclick = async () => {
        app.play('button');
        await close('try');
        if (modeId === 'mode.challenge' || modeId === 'mode.grapple') app.openMenu('openModes');
        else if (modeId === 'mode.pachinko') app.openMode('mode.pachinko');
        else if (!document.getElementById('start').classList.contains('on')) { app.overlay('start', true); app.hud(); }
      };
      if (next) next.onclick = () => close('next');
    } };
  }));
}

// ---- CustomizationItemUnlockedPopup (CustomizationService.OnUnlocked [asm 0x1286724] for every skin / rope / trail grant)
// Activate [asm 0x129301c]: "New skin|rope|trail unlocked!", the skin (LayeredSkinView) or the rope / trail sprite
// (GiftContent), the collection bar, InfosBand "Stage {n} completed !" for road unlocks (normal / challenge / grapple;
// "Card Level {n}" for card perks). OnShowEndedAsync [asm 0x1294414]: 200 ms, AnimateUnlock, then "Equip It!"
// (OnEquipItClicked [asm 0x1292dc4]: select, close) and "Tap to continue". [ĐỀ XUẤT] AnimateUnlock 350 ms; the item's XP
// is counted at the grant (meta.js grantItem), not at this popup's ClaimItemReward.
const KIND_WORD = { skins: 'skin', ropes: 'rope', trails: 'trail' };
const BAND = { progression_road_achieved_level_mode_normal: 'Stage', progression_road_achieved_level_mode_challenge: 'Stage',
  progression_road_achieved_level_mode_grapple: 'Stage', progression_road_progression_cards_perk_level: 'Card Level' };
export function itemUnlocked(app, it) {
  return enqueue(() => show(app, 'ppItem', 'wait', async (el) => {
    const sh = await sheet(app, 'pmode');
    el.dataset.item = it.id;
    fullBg(el, sh, '#40E8EC', '#008FE1', 'Pattern_MainMenu', '#2b2b2bff');
    sun(el, sh, C, [0, 0], [900, 1250], '#c5e6e772');
    if (BAND[it.unlock]) {
      const band = node(el, [0, 1, 1, 1], [0, -101], [0, 70], [0.5, 1]);
      band.style.background = 'rgba(31, 31, 120, .5)';
      const n = it.value;
      text(app, band, BAND[it.unlock] === 'Stage' ? (n ? `Stage ${n} completed !` : 'Stage completed !') : n ? `Card Level ${n}` : 'Card Level Up', 42);
    }
    const w = KIND_WORD[it.kind] || 'skin';
    const title = text(app, node(el, [0, 1, 1, 1], [0, -205], [0, 195], [0.5, 1]),
      `<size=84><color=#FFC327>New ${w}</color></size>\n\r<size=66>unlocked!</size>`, 90);
    title.dataset.title = `New ${w} unlocked!`;
    if (it.kind === 'skins') skinView(app, node(el, C, [0, 0], [500, 500]), it, 0.75);
    else iconView(app, node(el, C, [0, 75], [400, 400]), it);
    if (it.collection) collectionBar(app, el, sh, it.collection, { a: [0, 0.5, 1, 0.5], p: [0, -240], sz: [0, 100], color: '#00559380', newIt: it, delay: 200 });
    const eq = button(app, el, sh, 'EquipButton', 'Equip It!', 42, [0.5, 0, 0.5, 0], [0, 190], [325, 130], [0.5, 0], 0.8);
    eq.className = 'equip hide';
    const next = node(el, [0, 0, 1, 0], [0, 125], [0, 125], [0.5, 0.5], 'button', 'next hide');
    text(app, next, 'Tap to continue', 50, '#114F88');
    return { ready: (close) => {
      setTimeout(() => { eq.classList.remove('hide'); next.classList.remove('hide'); el.dataset.ready = '1'; }, 200 + 350);
      eq.onclick = () => {
        app.play('button');
        app.save.equipped[it.kind] = it.name;
        app.writeSave();
        app.applyEquip();
        close('equip');
      };
      next.onclick = () => close('next');
    } };
  }));
}

// ---- CollectionCompletedPopup (ClaimItemReward -> OnCollectionCompleted [asm 0x1282a18], after the item's popup) ------
// Activate [asm 0x128c2bc] + OnShowEndedAsync [asm 0x128ca0c]: the collection's items dancing (DanceSkinsContent), the
// bar, 200 ms, AnimateCompleted, then "Tap to continue". UIGradient #FFCD36 -> #E18E01, ShinySun #FFCD368D. MadTween.
// DanceSkinsContainer slots: ropes Rope1..3, trails Trail1..3; skins [ĐỀ XUẤT] Skin6 / Skin3 / Skin10 for three, the
// first slots for more.
const SLOTS = {
  skins: [[-170, -42, 380], [0, -22, 450], [170, -42, 380], [-115, 113, 380], [115, 113, 380], [-100, -22, 380], [100, -22, 380]],
  trails: [[-115, 113, 280], [155, 115, 280], [58, -59, 280]],
  ropes: [[-131, 35, 280], [14, 25, 280], [150, 8, 280]],
};
export function collectionCompleted(app, col) {
  return enqueue(() => show(app, 'ppCol', 'instant', async (el) => {
    const sh = await sheet(app, 'pmode');
    el.dataset.collection = col;
    fullBg(el, sh, '#FFCD36', '#E18E01', 'Pattern_MainMenu', '#ffffff1e');
    sun(el, sh, C, [0, 15], [900, 1250], '#ffcd368d');
    const title = text(app, node(el, [0, 1, 1, 1], [0, -250], [0, 100]), '<size=80>Collection</size>\n\r<size=66><color=#FFC327>completed</color></size>', 49);
    title.dataset.title = 'Collection completed';
    const items = app.meta.items.filter((o) => o.collection === col);
    const dance = node(el, C, [0, 28], [0, 0]);
    const slots = SLOTS[items[0]?.kind] || SLOTS.skins;
    // the middle skin in front (Skin3 450 high is drawn last)
    items.slice(0, slots.length).forEach((it, i) => {
      const [x, y, s] = slots[i];
      const b = node(dance, C, [x, y], [s, s]);
      b.style.zIndex = i === 1 ? 2 : 1;
      if (it.kind === 'skins') skinView(app, b, it, 0.6); else iconView(app, b, it);
    });
    collectionBar(app, el, sh, col, { a: C, p: [0, -265], sz: [322, 170], color: '#af3f0080', animateComplete: true, delay: 200 });
    const next = node(el, [0.5, 0, 0.5, 0], [0, 180], [600, 125], [0.5, 0.5], 'button', 'next hide');
    text(app, next, 'Tap to continue', 50, '#AF3F00');
    return { ready: (close) => {
      setTimeout(() => { next.classList.remove('hide'); el.dataset.ready = '1'; }, 200 + 350);
      next.onclick = () => close('next');
    } };
  }));
}

// A grant list (Meta.grantReward / grantItem outputs) -> its popups, in grant order; a collection completes after the
// popup of the item that completed it. mode.lucky_wheel (XP road step 0) has no popup [ĐỀ XUẤT]: its title would be the
// default "Challenge" branch.
export function unlocks(app, got) {
  const jobs = [];
  for (const g of got || []) {
    if (g.item) jobs.push(itemUnlocked(app, g.item));
    else if (g.collection) jobs.push(collectionCompleted(app, g.collection));
    else if (g.mode && MODE_ICON[g.mode] && (g.unlocked || (g.mode === 'mode.challenge' && g.levels))) jobs.push(modeUnlocked(app, g.mode));
  }
  return Promise.all(jobs);
}

// ---- NewTournamentPopup / NewAdventurePopup (home prompters tournament_competition / adventure_competition) ----------
// TournamentCompetitionIncentiveController [asm 0x11901dc] / Adventure [asm 0x1269620]: Leaderboard.IsNew = status 1
// [asm 0x1156400], set when the period's leaderboard is created (mode unlocked), cleared by SetAsActive in OnHideEnded
// [asm 0x1238e04 / 0x113fe84] ("Let's go" and "Later" both). One per period: the day (tournament), the week (adventure).
// Timer: TimeServiceHelper.FormatTime, two components ("8h 54m"); closes itself under 1 s.
const NEW_IS = (s, id, period) => s.modes[id]?.unlocked && s.modes[id].seenNew !== period;
function periods(now = Date.now()) {
  const d = new Date(now), day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const week = day - ((d.getDay() + 6) % 7) * 86400000;
  return { day: String(day), dayEnd: day + 86400000, week: 'w' + week, weekEnd: week + 7 * 86400000 };
}
export function fmtTime(ms) {
  const t = Math.max(0, Math.floor(ms / 1000)), parts = [[Math.floor(t / 86400), 'd'], [Math.floor(t / 3600) % 24, 'h'], [Math.floor(t / 60) % 60, 'm'], [t % 60, 's']];
  const i = parts.findIndex(([v]) => v > 0);
  return parts.slice(i < 0 ? 3 : i, (i < 0 ? 3 : i) + 2).map(([v, u]) => v + u).join(' ');
}
function timer(app, el, box, end, px) {
  const tick = () => {
    if (!box.isConnected) return;
    const ms = end - Date.now();
    if (ms < 1000) { el.__close?.('timeout'); return; }
    text(app, box, fmtTime(ms), px);
    setTimeout(tick, 1000);
  };
  tick();
}
// Leaderboard.ConvertReward [asm 0x1157358..0x1157374]: the unowned skins of reward_pool.tournament_skin (mode-race.json),
// [played % count] (race.js claimBoard)
const TOUR_POOL = ['skin.dolphin', 'skin.stick_knight', 'skin.wolf', 'skin.yeti', 'skin.mjolnir', 'skin.sheep'];
export function prizeSkin(app) {
  const free = TOUR_POOL.filter((id) => !app.meta.ownsRes(app.save, id));
  return free.length ? app.meta.byId.get(free[(app.save.inv['leaderboard.tournament_played'] || 0) % free.length]) : null;
}
function newPopup(app, id, period, end) {
  const tour = id === 'mode.tournament';
  return enqueue(() => show(app, 'ppNew', 'unity', async (el) => {
    const sh = await sheet(app, 'pseason');
    el.dataset.mode = id;
    const bg = node(el, FULL);
    bg.style.background = 'rgba(0, 0, 0, .7843)'; // BG RawImage #000000C8
    let holder;
    if (tour) {
      // HolderAnchored (0.05, 0.15)..(0.95, 0.85), Holder AspectRatioFitter FitInParent 0.734
      const ha = node(bg, [0.05, 0.15, 0.95, 0.85]);
      holder = document.createElement('div');
      holder.className = 'abs';
      const W = document.body.clientWidth * 0.9, H = document.body.clientHeight * 0.7, w = Math.min(W, H * 0.734);
      Object.assign(holder.style, { left: '50%', top: '50%', width: w + 'px', height: w / 0.734 + 'px', transform: 'translate(-50%, -50%)' });
      ha.appendChild(holder);
      spr(holder, sh, 'Holder tournament');
      sun(holder, sh, [-0.07, -0.03, 1.08, 1.13], [0, 0], [0, 0], '#f177fcff');
      const timerBox = node(holder, [0.3, 0.88 + 0.12 * 0.42, 0.7, 0.88 + 0.12 * 0.89]);
      slice(timerBox, sh, 'HolderTime_01', 0.6);
      fit(node(timerBox, [-0.01, 0.9, 0.99, 4.35], [0, 3]), sh, 'Icon_Trophy');
      // [ĐỀ XUẤT] the title box (0.72..1.33 of the timer, +14) lifted 20 so the text sits on the pill, not over its time
      text(app, node(timerBox, [0.12, 0.72, 0.88, 1.33], [0, 34], [309, 34]), 'Tournament', 54.35);
      const tt = node(timerBox, [0.15, 0.17, 0.82, 0.83]);
      timer(app, el, tt, end, 27.7);
      const content = node(holder, [0, 0.21, 1, 0.92]);
      text(app, node(content, [0.16, 0.87, 0.84, 1]), 'TOP PRIZES', 55);
      // SetupStaticUI [asm 0x1239808]: GetRewardForPosition(0) = the tournament skin + 1000 coins
      const prize = node(content, [0, 0.19, 1, 0.87]);
      const sk = node(prize, [0, 0.06, 0.66, 1]);
      const skin = prizeSkin(app);
      if (skin) iconView(app, sk, skin); // the skin's UI sprite (shop icon), as SetupItem
      text(app, node(sk, [0.32, 0.23, 0.72, 0.33]), 'New skin', 34.45);
      const coins = node(prize, [0.52, 0.22, 1, 0.84]);
      for (const [a, pv] of [[[0.1, 0.43, 0.52, 0.94], null], [[0.18, 0.21, 0.55, 0.67], null], [[0.37, 0.46, 0.69, 0.85], null]]) fit(node(coins, a, [0, 0], [0, 0], pv || [0.5, 0.5]), sh, 'SkinCoins');
      text(app, node(coins, [0.3, 0.1, 0.71, 0.26]), 'x1000', 36.95);
      const rules = node(content, [0, 0, 1, 0.33]);
      rules.style.display = 'flex'; rules.style.justifyContent = 'center'; rules.style.alignItems = 'center'; rules.style.gap = U(30);
      // "{0} Competitors" with TournamentService.NB_PLAYERS 200 [asm 0x1239b24]
      for (const [ic, t] of [['CompetitorsIcon_01', '200 Competitors'], ['CupIcon_01', 'Win races to\nearn trophies']]) {
        const r = document.createElement('div');
        Object.assign(r.style, { position: 'relative', width: U(150), height: U(150) });
        spr(r, sh, 'HolderRules');
        r.appendChild(fit(rt(document.createElement('i'), [0.13, 0.3, 0.85, 0.95]), sh, ic));
        r.appendChild(text(app, rt(document.createElement('div'), [0, 0, 1, 0], [0, 12], [-24, 37], [0.5, 0]), t, 16));
        rules.appendChild(r);
      }
      const go = button(app, holder, sh, 'OutlinedButtonGreen', "Let's go", 42.35, [0.26, 0.06, 0.73, 0.19], [0, 0], [0, 0], [0.5, 0.5], 0.7);
      go.className = 'go';
    } else {
      holder = node(bg, C, [0, 0], [540, 750]);
      slice(holder, sh, 'Holder_Adventure', 1);
      sun(holder, sh, C, [0, 90], [650, 950], '#ffd9bdff', true);
      // TopHolder (8, -38) 621 x 99 from the top: its top edge 11.5 above the holder; HolderTimer 35 under that edge
      const timerBox = node(holder, [0.5, 1, 0.5, 1], [8, 11.5 - 35], [244, 70]);
      slice(timerBox, sh, 'rounded_square_128px' in sh.rects ? 'rounded_square_128px' : 'Holder_Counter', 0.5);
      timerBox.style.borderImageSource = tinted(sh, 'Holder_Counter', '#c3564a');
      fit(node(timerBox, [0.5, 1, 0.5, 1], [0, 72], [180, 234]), sh, 'Icon');
      text(app, node(timerBox, [0.5, 1, 0.5, 1], [0, 30], [515, 65]), 'New adventure', 50); // [ĐỀ XUẤT] +30, as the Tournament title
      fit(node(timerBox, [0, 0.5, 0, 0.5], [29, -15], [28, 29]), sh, 'Icon_Timer');
      const tt = node(timerBox, FULL);
      timer(app, el, tt, end, 30);
      const content = node(holder, C, [0, 57], [540, 500]);
      const pm = node(content, [0, 0, 1, 0], [0, 229 + 36 - 217], [-26, 434]);
      pm.style.overflow = 'hidden';
      pm.style.borderRadius = U(30);
      tint(node(pm, [0.5, 0, 0.5, 0], [249, 219], [975, 208], [0.6, 0.4]), sh, 'BG_Pattern01', '#f8b4b3a1');
      tint(node(pm, [0.5, 0, 0.5, 0], [365, 33], [1254, 268], [0.6, 0.4]), sh, 'BG_Pattern03', '#fdabaaac');
      tint(node(pm, [1, 0, 1, 0], [-10, 48], [400, 400], [0.6, 0.4]), sh, 'CompassBG', '#d45354ac');
      text(app, node(content, [0.5, 1, 0.5, 1], [0, -39], [428, 79]), 'weekly prizes', 40);
      const prizes = node(content, C, [0, 40], [620, 275]);
      // [ĐỀ XUẤT] the two prizes side by side: the layout's spacing -140 makes their texts overlap here
      const p1 = node(prizes, C, [-115, 0], [230, 230]);
      for (const [x, y, s, k] of [[-64, -10, 169, 1.5], [50, -10, 150, 1.5], [-1, 63, 169, 1]]) {
        const b = node(p1, C, [x, y], [s * k * 0.7, s * k * 0.7]);
        const sk = advSkins(app)[[-64, 50, -1].indexOf(x)];
        if (sk) iconView(app, b, sk);
      }
      text(app, node(p1, [0.5, 0, 0.5, 0], [0, 43], [250, 50]), '48 Ultimate skins\n<size=60%>Only unlockable here</size>', 26);
      const p2 = node(prizes, C, [115, 0], [230, 230]);
      fit(node(p2, C, [-15, -1], [180, 180]), sh, 'MarketOfferBoostersPackIllustration');
      fit(node(p2, C, [54, -22], [170, 170]), sh, 'Icon_CoinsMultiplier');
      text(app, node(p2, [0, 0, 1, 0], [0, 41], [0, 50]), '20000+ coins\n<size=60%>worth of rewards</size>', 28);
      const rules = node(content, [0, 0, 1, 0.33]);
      Object.assign(rules.style, { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: U(-49.7 + 60) });
      for (const [ic, t, sz] of [['Icon_Competitor', '1500 competitors on the same track', [106, 115]], ['Icon_Gameplay', 'New challenging\ngameplay', [111, 121]],
        ['Icon_Compass', 'EARN tokens to\nUpgrade skills', [111, 121]]]) {
        const r = document.createElement('div');
        Object.assign(r.style, { position: 'relative', width: U(145), height: U(145) });
        slice(r, sh, 'Holder_Counter', 0.5);
        r.style.borderImageSource = tinted(sh, 'Holder_Counter', '#a63945');
        r.style.opacity = 1;
        r.appendChild(fit(rt(document.createElement('i'), C, [0, 8], sz), sh, ic));
        r.appendChild(text(app, rt(document.createElement('div'), [0, 0, 1, 0], [0, 21], [0, 40]), t, 14, null, true));
        rules.appendChild(r);
      }
      const go = button(app, holder, sh, 'Button_Adventure', "Let's go", 38.45, [0.5, 0, 0.5, 0], [0, 108], [260, 105], [0.5, 0.5], 0.6);
      go.className = 'go';
    }
    const later = node(bg, tour ? [0.27, 0.08, 0.73, 0.15] : [0.5, 0, 0.5, 0], tour ? [0, 0] : [0, 230], tour ? [0, 0] : [287, 87], [0.5, 0.5], 'button', 'later');
    text(app, later, 'Later', 40);
    // NewTournamentPopup's Open clip also fades BG/Later_Text in from 0.1667 s
    if (tour) later.animate([{ opacity: 0 }, { opacity: 0, offset: 0.667 }, { opacity: 1 }], { duration: 250 });
    return { holder, bg, ready: (close) => {
      const done = () => { app.save.modes[id] = { ...app.save.modes[id], seenNew: period }; app.writeSave(); };
      // ClosePopupAndOpen...: TryGoTo(TOURNAMENT 6 | ADVENTURE 7), then Close
      el.querySelector('.go').onclick = async () => { app.play('button'); done(); await close('go'); app.openMode(id); };
      later.onclick = () => { done(); close('later'); };
    } };
  }));
}

// The prize images of NewAdventurePopup are runtime "UI" images: [ĐỀ XUẤT] three adventure-unlock skins
function advSkins(app) { return app.meta.items.filter((o) => o.kind === 'skins' && o.unlock === 'adventure').slice(0, 3); }

// HomePage.OnShowEnded -> ShowPrompts('home'): home_mandatory_set in order, promptsCap 1. The web runs xp_road_recovery
// (main.js roadPopup) and boosters_recovery (main.js nextBooster) itself; this adds adventure_competition, then
// tournament_competition. Returns the prompt shown, if any.
let homeBusy = false;
export async function homePrompts(app) {
  const s = app.save;
  if (homeBusy || busy() || s.best < 1 || s.boosterQueue?.length || app.meta.xpPending(s) > 0) return null;
  // only while the home page is what the player sees (a page opening from home closes others first)
  if (!document.getElementById('start').classList.contains('on')
    || [...document.querySelectorAll('.overlay.on')].some((e) => e.id !== 'start' && !e.classList.contains('pp'))) return null;
  const p = periods();
  const id = NEW_IS(s, 'mode.adventure', p.week) ? 'mode.adventure' : NEW_IS(s, 'mode.tournament', p.day) ? 'mode.tournament' : null;
  if (!id) return null;
  homeBusy = true;
  try {
    resetGames(s);
    await newPopup(app, id, id === 'mode.adventure' ? p.week : p.day, id === 'mode.adventure' ? p.weekEnd : p.dayEnd);
  } finally { homeBusy = false; }
  return id;
}

// ---- MarketVipPopup / MarketOfferPopup -------------------------------------------------------------------------------
// The offers with a viewPurchasePopupId (market): vip, vip_discount, adventure_1, adventure_2, boosters_pack. A market
// card's buy button (AMarketPurchaseButton.OnPurchaseClickedAsync [asm 0x26b7fa4..0x26b8558]) and the VIP widget
// (StickmanHookMarketOfferWidgetView.OnWidgetClicked [asm 0x124e3ac]) open the popup; its purchase button buys
// (IsDirectPurchase). Buying grants at once (owner's rule); "No, thanks" / "Later" close. Texts: view_templates.
export const POPUP_OFFERS = new Set(['offer.vip', 'offer.vip_discount', 'offer.adventure_1', 'offer.adventure_2', 'offer.boosters_pack']);
const VIP_ROWS = [
  ['MarketRewardNoAds', '<size=23><color=#FFC235>remove</size></color> all <size=23><color=#FF7F6D>FORCED Ads</color></size> forever', 'offer.vip'],
  ['MarketRewardPremiumCollectiblesWithXp', 'GET<size=23> <color=#FFC235> 9 premium skins</color></size>,<size=23><color=#FFC235> 3 Ropes </color></size>& <color=#FFC235></size><size=25>3 trails</color></size> worth <color=#96ECFF><size=23> 2000 XP</color></size>', 'skins'],
  ['SkipTicketsPile', 'get <size=23><color=#FFC235>rewards</color></size> Without watching the videos with <size=23> <color=#FFC235>60 SKIP tickets</color></size>'],
  ['SkinCoinsPile', 'Receive <size=23><color=#FFC235>3000 coins</color></size>'],
  ['MarketRewardLegendaryBoostersPile', 'Get x<size=23>3 <color=#FFC235>legendary</color> boosters</size>'],
];
const GENERIC = {
  'offer.adventure_1': { illu: 'MarketOfferAdventureIllustration', title: 'Starter Pack', desc: 'Boost your adventure', sub: 'Limited to 1 per week', art: 'adventure', week: true,
    rows: [['Icon', 'x15000 Tokens'], ['SkinCoinsPile', 'x3000 Coins']] },
  'offer.adventure_2': { illu: 'MarketOfferAdventureIllustration', title: 'Pro Offer', desc: 'Boost your adventure', sub: '', art: 'adventure', week: true,
    rows: [['Icon', 'x30000 Tokens'], ['SkinCoinsPile', 'x5000 Coins']] },
  'offer.boosters_pack': { illu: 'MarketOfferBoostersPackIllustration', title: 'Booster Pack', desc: 'Up to <color=#FFC235>900</color> Cards!', sub: 'One time offer', art: 'boosterspack', tint: '#ffffff7b',
    rows: [['common_market', 'x2 <color=#9FD3FF>common</color>\nBooster'], ['epic_market', 'x2 <color=#FDE0FF>Epic</color>\nBooster'],
      ['legendary_market', 'x2 <color=#FDD17D>Legendary</color>\nBooster']] },
};
function priceButton(app, parent, sh, o, a, p, sz, pv) {
  const s = app.save, pr = app.bonus.shop.price(s, o);
  const b = node(parent, a, p, sz, pv, 'button', 'buy');
  slice(node(b, FULL), sh, 'OutlinedButtonGold', 0.6);
  const row = node(b, FULL, [0, 4], [0, 0]);
  row.classList.add('row');
  row.style.gap = U(8);
  if (pr?.discount >= 1 && pr.usd) {
    const old = document.createElement('div');
    old.style.position = 'relative';
    old.appendChild(label(app, (parseFloat(pr.usd) / (1 - pr.discount / 100)).toFixed(2) + '$', 15, '#7D93AB'));
    const bar = document.createElement('i');
    Object.assign(bar.style, { position: 'absolute', left: '-4%', right: '-4%', top: '50%', height: U(7), marginTop: U(-3.5) });
    spr(bar, sh, 'DiscountRedBAr');
    old.appendChild(bar);
    row.appendChild(old);
  }
  row.appendChild(label(app, pr?.usd || 'Free', 37));
  b.title = 'Mua (bấm là nhận ngay, không trừ tiền)';
  b.dataset.price = pr?.usd || 'Free';
  return b;
}
export function offer(app, id, source = 'popup_offer_clicked') {
  const shop = app.bonus?.shop, o = shop?.d.offers.find((x) => x.id === id);
  if (!o || !POPUP_OFFERS.has(id)) return Promise.resolve(app.bonus?.buy(id));
  const vip = id.startsWith('offer.vip');
  let result = null;
  return enqueue(() => show(app, 'ppOffer', vip ? 'vip' : 'unity', async (el) => {
    const sh = await sheet(app, vip ? 'ovip' : 'ooffer');
    el.dataset.offer = id;
    el.dataset.source = source;
    const bg = node(el, FULL);
    bg.style.background = 'rgba(0, 0, 0, .7843)';
    let holder, later;
    if (vip) {
      // PopupHolder 546 wide (ContentSizeFitter) in BG's VerticalLayoutGroup; IMG_Vip pivot y 0.2 above the top
      holder = document.createElement('div');
      holder.className = 'abs ctr';
      Object.assign(holder.style, { left: '50%', top: '56%', width: U(546), transform: 'translate(-50%, -50%)', padding: `${U(70)} 0 ${U(30)}`,
        gap: U(10), boxSizing: 'border-box' });
      bg.appendChild(holder);
      const ob = node(holder, FULL);
      ob.style.borderRadius = U(40);
      ob.style.overflow = 'hidden';
      ob.style.boxShadow = `0 ${U(3)} 0 ${U(2)} #bf561e`;
      slice(node(ob, FULL), sh, 'VipPopupShadowBackground', 0.9);
      const pat = node(ob, FULL);
      Object.assign(pat.style, { backgroundImage: tinted(sh, 'VipPopupBackground', '#66d2ff'), backgroundSize: `${U(192)} ${U(184)}`, opacity: 0.13 });
      const icon = node(holder, [0.1, 1, 0.9, 1], [0, 0], [0, 412], [0.5, 0.2]);
      fit(icon, sh, id === 'offer.vip_discount' ? 'VipDiscountPopupIcon' : 'VipPopupIcon');
      const t = document.createElement('div');
      t.style.position = 'relative';
      holder.appendChild(text(app, t, 'VIP BUNDLE', 58));
      const welcome = (app.save.flags?.['flag.welcome_offer'] || 0) > 0;
      for (const [img, txt, only] of VIP_ROWS) {
        if (only === 'offer.vip' && id !== 'offer.vip') continue;
        if (only === 'skins' && id === 'offer.vip_discount' && welcome) continue;
        const r = document.createElement('div');
        r.className = 'vrow';
        Object.assign(r.style, { position: 'relative', width: U(500), height: U(100), display: 'flex', alignItems: 'center', gap: U(14) });
        const ih = document.createElement('i');
        Object.assign(ih.style, { position: 'relative', flex: 'none', width: U(100), height: U(90) });
        slice(ih, sh, 'rounded_square_shadow_top', 0.5);
        ih.style.borderImageSource = tinted(sh, 'rounded_square_shadow_top', '#05336a');
        ih.style.opacity = 0.59;
        const im = document.createElement('i');
        Object.assign(im.style, { position: 'absolute', left: U(14), width: U(90), height: U(90) });
        fit(im, sh, img);
        const tx = document.createElement('div');
        Object.assign(tx.style, { position: 'relative', flex: 1, alignItems: 'flex-start' });
        tx.appendChild(rich(app, txt, 19, null, true));
        tx.firstChild.style.alignItems = 'flex-start';
        for (const rw of tx.querySelectorAll('.row')) rw.style.justifyContent = 'flex-start';
        r.append(ih, im, tx);
        holder.appendChild(r);
      }
      const bh = document.createElement('div');
      Object.assign(bh.style, { position: 'relative', width: U(210), height: U(90), marginTop: U(10) });
      holder.appendChild(bh);
      priceButton(app, bh, sh, o, FULL);
      later = document.createElement('button');
      later.className = 'later';
      Object.assign(later.style, { left: '50%', bottom: U(60), width: U(616), height: U(150), transform: 'translateX(-50%)' });
      bg.appendChild(text(app, later, 'No, thanks', 40));
    } else {
      const g = GENERIC[id];
      holder = node(bg, C, [0, 40], [540, 463 + 100]);
      const box = node(holder, [0, 0, 1, 0], [0, 100 + 463 / 2], [0, 463]);
      const bgi = node(box, FULL);
      slice(bgi, sh, 'OfferBg_' + g.art, 1);
      if (g.tint) bgi.style.opacity = css(g.tint)[1];
      const sn = node(box, FULL);
      sn.classList.add('sun');
      tint(sn, sh, 'ShinySun', '#ffd1a784');
      const mask = node(box, FULL, [0, 0], [-16, -16]);
      Object.assign(mask.style, { overflow: 'hidden', borderRadius: U(32) });
      const ill = node(mask, FULL);
      fit(ill, sh, 'OfferIllu_' + g.art);
      ill.style.backgroundSize = 'cover';
      ill.style.transform = 'scale(1.06)';
      const col = document.createElement('div');
      col.className = 'abs ctr';
      Object.assign(col.style, { inset: '0', justifyContent: 'flex-start', paddingTop: U(52), gap: U(8) });
      box.appendChild(col);
      if (g.week) {
        const ht = node(box, [0.5, 1, 0.5, 1], [0, -8], [204, 40], [0.5, 1]);
        slice(ht, sh, 'rounded_square_flat_top', 0.3);
        ht.style.borderImageSource = tinted(sh, 'rounded_square_flat_top', '#bc798f');
        const tr = node(ht, FULL);
        tr.classList.add('row');
        tr.style.gap = U(6);
        const ic = document.createElement('i');
        Object.assign(ic.style, { width: U(28), height: U(29) });
        fit(ic, sh, 'Icon_Timer');
        const tt = document.createElement('div');
        tr.append(ic, tt);
        timer(app, el, tt, periods().weekEnd, 22);
      }
      const add = (t, px, h) => { const d = document.createElement('div'); Object.assign(d.style, { position: 'relative', minHeight: U(h) }); col.appendChild(text(app, d, t, px)); return d; };
      add(g.title, 50, 50);
      const ch = document.createElement('div');
      Object.assign(ch.style, { position: 'relative', height: U(209), display: 'flex', alignItems: 'center', gap: U(14) });
      const illu = document.createElement('i');
      Object.assign(illu.style, { position: 'relative', flex: 'none', width: U(g.rows.length > 2 ? 120 : 190), height: U(170) });
      fit(illu, sh, g.illu);
      ch.appendChild(illu);
      for (const [img, t] of g.rows) {
        const cell = document.createElement('div');
        Object.assign(cell.style, { position: 'relative', width: U(110), height: U(110) });
        slice(cell, sh, 'rounded_square_shadow_top', 0.5);
        cell.style.borderImageSource = tinted(sh, 'rounded_square_shadow_top', '#1d234c');
        const im = document.createElement('i');
        Object.assign(im.style, { position: 'absolute', inset: U(-2) });
        fit(im, sh, img);
        const tx = rt(document.createElement('div'), [0, 0, 1, 0], [0, 3], [-6, 35], [0.5, 0]);
        cell.append(im, text(app, tx, t, 15));
        ch.appendChild(cell);
      }
      col.appendChild(ch);
      add(g.desc, 30, 36);
      const bh = document.createElement('div');
      Object.assign(bh.style, { position: 'relative', width: U(200), height: U(90) });
      col.appendChild(bh);
      priceButton(app, bh, sh, o, FULL);
      if (g.sub) add(g.sub, 17.8, 21);
      later = node(holder, [0, 0, 1, 0], [0, 50], [0, 87], [0.5, 0.5], 'button', 'later');
      text(app, later, 'Later', 40);
    }
    return { holder, bg, ready: (close) => {
      el.querySelector('.buy').onclick = async () => {
        app.play('button');
        result = app.bonus.buy(id);
        await close('buy');
      };
      later.onclick = () => close('later');
    } };
  })).then(() => result);
}

// ---- End-game prompts (EngagementPromptService, placement end_game) ---------------------------------------------------
// AEndGamePage.OnShowEnded -> ShowPrompts [asm 0x28d6364] on the Normal / Challenge / Grapple end pages (the seasonal
// and tournament placements have no prompter set). optionalPromptsRequirementId played_enough_games_since_last_prompt:
// >= 3 games since the last shown prompt (GameCountPromptRequirementController [asm 0x2fa5240], reset when one shows
// [asm 0x2fa96f4]). end_game_optional_set with weights among the prompters that have something to show
// (ShowPromptsSet [asm 0x2fa9b80]), promptsCap 1:
//   lucky_wheel_incentive 1 (wheel unlocked, once per session, CanAffordSpinning [asm 0x115bd74]) -> the wheel popup;
//   market_incentive 11 (first visible offer with a popup [asm 0x2f63bbc]) -> its offer popup;
//   customization_item_unlock_incentive 4 (no old_no_ads; GetNextIncentiveShopItem [asm 0x12835d8]) -> the popup below;
//   seasonal_event 5: not built (SeasonalEventPopup) [ĐỀ XUẤT].
// [ĐỀ XUẤT] a "game" is an end page shown (the counter's event was not traced).
const GAMES = 'prompt.games_since_last';
function resetGames(s) { s.inv[GAMES] = 0; }
const session = { wheelSeen: false, skinSeen: new Set() };
const END_PLACEMENTS = new Set(['mode.normal', 'mode.challenge', 'mode.grapple']);
export function incentiveSkin(app) {
  const { meta, save } = app;
  if ((save.flags?.['flag.old_no_ads'] || 0) >= 1) return null;
  // skin collections not complete, fewest locked items first (b__8_1 [asm 0x1284408]); their locked REWARDED items
  const cols = Object.keys(meta.d.collections).filter((c) => meta.d.collections[c][1] === 'skins').map((c) => {
    const items = meta.items.filter((o) => o.collection === c);
    return { c, items, locked: items.filter((o) => !meta.ownsRes(save, o.id)) };
  }).filter((x) => x.locked.length).sort((a, b) => a.locked.length - b.locked.length);
  for (const x of cols) for (const it of x.locked) if (it.unlock === 'rewarded' && !session.skinSeen.has(it.id)) return it;
  return null;
}
export function marketOffer(app) {
  const shop = app.bonus?.shop;
  if (!shop) return null;
  return shop.d.offers.find((o) => POPUP_OFFERS.has(o.id) && shop.visible(app.save, o) && !shop.blocked(app.save, o)) || null;
}
export async function endPrompts(app, modeId, rand = Math.random) {
  const s = app.save;
  if (!END_PLACEMENTS.has(modeId) || s.best < 1) return null;
  s.inv[GAMES] = (s.inv[GAMES] || 0) + 1;
  app.writeSave();
  if (s.inv[GAMES] < 3 || busy()) return null;
  const bonus = await app.loadBonus();
  const can = [];
  if (s.modes['mode.lucky_wheel']?.unlocked && !session.wheelSeen && s.coins >= bonus.wheelPrice(s)) can.push(['wheel', 1]);
  const off = marketOffer(app);
  if (off) can.push(['market', 11, off]);
  const sk = incentiveSkin(app);
  if (sk) can.push(['skin', 4, sk]);
  if (!can.length) return null;
  let r = rand() * can.reduce((a, c) => a + c[1], 0), pick = can[0];
  for (const c of can) { if (r < c[1]) { pick = c; break; } r -= c[1]; }
  resetGames(s);
  app.writeSave();
  app.lastPrompt = pick[0];
  if (pick[0] === 'wheel') { session.wheelSeen = true; app.openMenu('openWheel'); }
  else if (pick[0] === 'market') await offer(app, pick[2].id, 'incentive_popup');
  else await rewardedSkin(app, pick[2]);
  return pick[0];
}

// IncentiveRewardedSkinUnlockPopup (UI/Popups/Incentive/RewardedSkinUnlock [asm 0x11f299c]): "Instant skin unlock!",
// the skin, "Get\n{0} XP" (the item's XP), the collection bar, the gold "unlock" button with the rewarded-ad icon
// (WatchRewardedAsync [asm 0x11f4090], placement rewarded.customization_incentive [asm 0x11f41d4]: granted at once, a skip
// ticket pays it when owned, ads.js watch) and "Later".
export function rewardedSkin(app, it) {
  session.skinSeen.add(it.id);
  let got = null;
  return enqueue(() => show(app, 'ppSkin', 'unity', async (el) => {
    const sh = await sheet(app, 'pskin');
    el.dataset.item = it.id;
    const bg = node(el, FULL);
    bg.style.background = 'rgba(0, 0, 0, .7843)';
    const ha = node(bg, [0.07, 0.15, 0.93, 0.85]);
    const holder = document.createElement('div');
    holder.className = 'abs';
    const W = document.body.clientWidth * 0.86, H = document.body.clientHeight * 0.7, w = Math.min(W, (H * 772) / 1024);
    Object.assign(holder.style, { left: '50%', top: '50%', width: w + 'px', height: (w * 1024) / 772 + 'px', transform: 'translate(-50%, -50%)' });
    ha.appendChild(holder);
    spr(holder, sh, 'HolderPopupCollection');
    sun(holder, sh, [-0.07, -0.08, 1.07, 1.08], [0, 65], [0, 46], '#fffc3eff');
    const top = node(holder, [0, 0.87, 1, 1]);
    top.dataset.spr = 'TopHolder'; // m_Type 0, m_PreserveAspect 0, anchors (0, 0.87)..(1, 1): stretched as in the prefab
    top.style.backgroundImage = tinted(sh, 'TopHolder', '#e57c00');
    top.style.backgroundSize = '100% 100%';
    text(app, node(top, [0.06, 0.19, 0.94, 0.81]), 'Instant skin unlock!', 51.35).dataset.title = 'Instant skin unlock!';
    const ch = node(holder, [0.05, 0.24, 0.94, 0.76]);
    const skin = node(ch, [0.02, 0.17, 0.98, 1.12]);
    skinView(app, skin, it, 0.8);
    const xp = node(skin, C, [115, -35], [100, 100]);
    fit(xp, sh, 'Xp');
    text(app, node(xp, [0.25, 0.25, 0.75, 0.75], [0, 0], [50, 0]), `Get\n${it.xp} XP`, 20.8).dataset.xp = it.xp;
    if (it.collection) collectionBar(app, holder, sh, it.collection, { a: [0.5, 0.31, 0.5, 0.31], p: [0, 21], sz: [322, 160], color: '#84392270', namePx: 18, donePx: 18 });
    const b = node(holder, [0.26, 0.08, 0.73, 0.21], [0, 0], [0, 0], [0.5, 0.5], 'button', 'unlock');
    slice(node(b, FULL), sh, 'OutlinedButtonGold', 0.6);
    const ic = node(b, [0.11, 0.3, 0.34, 0.8]);
    b.dataset.icon = adIcon(app.save);
    if (b.dataset.icon === 'ticket') app.icon?.(ic, 'ticket', 30); else fit(ic, sh, 'AdIcon');
    text(app, node(b, [0.39, 0.35, 0.85, 0.75]), 'unlock', 36.8);
    const later = node(bg, [0.27, 0.08, 0.73, 0.15], [0, 0], [0, 0], [0.5, 0.5], 'button', 'later');
    text(app, later, 'Later', 40);
    return { holder, bg, ready: (close) => {
      b.onclick = async () => {
        app.play('button');
        watch(app.save);
        got = [];
        app.meta.grantItem(app.save, it, got);
        app.writeSave();
        app.hud();
        await close('unlock');
      };
      later.onclick = () => close('later');
    } };
  })).then(() => (got ? app.unlocks(got) : null));
}

// ---- Adventure incentive (AdventureIncentivesService.TryShowInventive [asm 0x12669c8], from AdventurePage
// ClaimPendingRewards): every 5th call in a session ((c + 1) % 5 [asm 0x1266a54..0x1266a78]) the persisted rotation
// CurrentAdventureIncentive = (cur + 1) % 3 [asm 0x1266a88..0x1266aac]: 1 -> the visible adventure offer (adventure_1,
// else adventure_2), 2 -> offer.boosters_pack while visible and flag.booster_pack <= 0, 0 -> nothing (the VIP branch
// tests 3, which % 3 never gives).
const ADV = { count: 0 };
export const ADV_ROT = 'adventure.current_incentive';
export async function advIncentive(app) {
  ADV.count = (ADV.count + 1) % 5;
  if (ADV.count !== 0) return null;
  const s = app.save, bonus = await app.loadBonus(), shop = bonus.shop;
  const cur = (s.inv[ADV_ROT] || 0) % 3, next = (cur + 1) % 3;
  s.inv[ADV_ROT] = next;
  app.writeSave();
  const vis = (id) => { const o = shop.d.offers.find((x) => x.id === id); return o && shop.visible(s, o) && !shop.blocked(s, o) ? o : null; };
  let o = null;
  if (next === 1) o = vis('offer.adventure_1') || vis('offer.adventure_2');
  else if (next === 2 && (s.flags?.['flag.booster_pack'] || 0) <= 0) o = vis('offer.boosters_pack');
  if (!o) return null;
  await offer(app, o.id, 'popup_incentive_adventure');
  return o.id;
}

// a skin's dance in a box, for other pages (race.js TOP PRIZES)
export const skinIn = (app, box, it, scale) => skinView(app, box, it, scale);
