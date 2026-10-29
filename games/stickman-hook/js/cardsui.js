// Cards views, loaded the first time the cards page, a booster or the black market opens: the CardsPage (perk level,
// one CardsUI block per category, HolderCardItemUI cards), the BoosterOpeningPopup and the market's booster / black
// market (every section, ads.js offers). Art: art/m-cards.webp, art/m-boost.webp, art/m-market.webp (tools/build_menus.py);
// rules: js/cards.js, js/ads.js.
import { sheet, kitStyle, spr, slice, cut, U, label, glText, artPage } from './uikit.js';
import { adIcon, watch } from './ads.js';

const CSS = `
#cards .abody { overflow: auto; padding: 0 0 calc(env(safe-area-inset-bottom) + ${U(40)}); }
#cards .ctitle { position: relative; flex: none; height: ${U(250)}; margin: ${U(10)} 0 ${U(90)}; }
#cards .ctitle .perks { position: absolute; left: 50%; top: 0; width: ${U(240)}; height: ${U(240)}; margin-left: ${U(-120)}; }
#cards .ctitle .lvl { position: absolute; left: 50%; bottom: ${U(-35 - 27.5)}; width: ${U(187)}; height: ${U(55)}; margin-left: ${U(-93.5)};
  border-radius: ${U(18)}; background: rgba(6, 44, 85, .44); display: flex; align-items: center; justify-content: center; }
#cards .ctitle .lvl small { position: absolute; left: 0; right: 0; top: ${U(-30)}; display: flex; justify-content: center; }
#cards .fitw { transform-origin: 50% 0; }
#cards .cat { width: ${U(675)}; margin: 0 auto ${U(30)}; }
#cards .cat .ban { position: relative; height: ${U(75)}; display: flex; align-items: center; justify-content: center; }
#cards .cat .ban .bt { padding-bottom: ${U(7)}; }
#cards .cat .ban .cnt { position: absolute; right: ${U(10)}; top: 50%; width: ${U(107)}; height: ${U(36)}; margin-top: ${U(-14)};
  border-radius: ${U(12)}; background: rgba(147, 187, 233, .87); display: flex; align-items: center; justify-content: center; }
#cards .cat .ban .cnt small { position: absolute; left: 0; right: 0; top: ${U(-12)}; display: flex; justify-content: center; }
#cards .grid { display: grid; grid-template-columns: repeat(3, ${U(188)}); gap: ${U(10)} ${U(5)}; justify-content: center;
  padding-top: ${U(10)}; background: rgba(0, 20, 46, .49); }
.hcard { position: relative; width: ${U(188)}; height: ${U(300)}; }
.hcard .sh { position: absolute; inset: 0; }
.ccard { position: absolute; left: 50%; top: ${U(3)}; width: ${U(180)}; height: ${U(255.6)}; margin-left: ${U(-90)}; cursor: pointer; }
.ccard > * { position: absolute; }
.ccard .hold { inset: 0; }
.ccard .pat { left: 4%; right: 4%; top: -1%; bottom: 3%; }
.ccard .top { left: 0; right: ${U(5)}; top: ${U(3)}; height: ${U(30)}; }
.ccard .mode { position: absolute; inset: 0; border-radius: ${U(14)} ${U(14)} 0 0; display: flex; align-items: center; justify-content: flex-end;
  padding-right: 5%; }
.ccard .lv { position: absolute; left: 0; top: 0; bottom: 0; width: ${U(74)}; display: flex; align-items: flex-end; gap: ${U(1)}; padding-left: ${U(4)};
  box-sizing: border-box; }
.ccard .ic { left: 5%; right: 5%; top: 20%; height: 63%; }
.ccard .ic .glow { position: absolute; inset: -7%; opacity: .47; }
.ccard .ic .im { position: absolute; inset: 0; }
.ccard .nm { left: 5%; right: 5%; top: 15%; height: 20%; display: flex; align-items: center; justify-content: center; flex-direction: column; }
.ccard .val { left: 4%; right: 4%; bottom: 5%; height: ${U(32)}; display: flex; align-items: center; justify-content: center; }
.ccard .val .bg { position: absolute; inset: 0; }
.ccard .val canvas, .ccard .val span { position: relative; }
.ccard.locked .ic .im { filter: grayscale(1) brightness(.85); opacity: .75; }
.ccard.locked .ic .glow { display: none; }
.cbar { position: absolute; left: 50%; bottom: ${U(22 - 17)}; width: ${U(175)}; height: ${U(34)}; margin-left: ${U(-87.5)}; }
.cbar > * { position: absolute; }
.cbar .bg { inset: 0; }
.cbar .fillw { left: ${U(2)}; top: ${U(2)}; bottom: ${U(2)}; overflow: hidden; border-radius: ${U(14)}; }
.cbar .fill { position: absolute; left: 0; top: 0; bottom: 0; }
.cbar .t { inset: 0; display: flex; align-items: center; justify-content: center; }
.cbar .ar { right: ${U(-15)}; top: 50%; width: ${U(35)}; height: ${U(35)}; margin-top: ${U(-19)}; }
.cbar .lk { left: 50%; top: 50%; width: ${U(36)}; height: ${U(48)}; margin: ${U(-28)} 0 0 ${U(-18)}; }
.cbar.max .fill { filter: hue-rotate(-60deg) saturate(1.4); }

/* BoosterOpeningPopup */
#boostPop { inset: 0; background: linear-gradient(90deg, #0c142b, #2169d4); overflow: hidden; z-index: 40; touch-action: none; }
#boostPop .bpat { position: absolute; inset: -50%; transform: rotate(-20deg); }
#boostPop .pack { position: absolute; left: 50%; top: calc(50% + ${U(16)}); width: ${U(336)}; height: ${U(524)}; margin: ${U(-262)} 0 0 ${U(-168)};
  transform-origin: 50% 50%; }
#boostPop .pack > i { position: absolute; inset: 0; }
#boostPop .pack .tp { clip-path: inset(0 0 87.8% 0); }
#boostPop .pack .bt { clip-path: inset(12.2% 0 0 0); }
#boostPop .flash { position: absolute; left: 50%; top: 50%; width: ${U(990)}; height: ${U(1485)}; margin: ${U(-742)} 0 0 ${U(-495)};
  background: radial-gradient(closest-side, #fff, rgba(255,255,255,0)); opacity: 0; pointer-events: none; }
#boostPop .you { position: absolute; left: 0; right: 0; top: calc(env(safe-area-inset-top) + ${U(130)}); display: flex; justify-content: center;
  opacity: 0; transition: opacity .3s; }
#boostPop .left { position: absolute; left: 0; right: 0; bottom: ${U(560)}; display: flex; justify-content: center; }
#boostPop .tap { position: absolute; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom) + ${U(80)}); display: flex; justify-content: center;
  animation: bptap 1.2s ease-in-out infinite; }
@keyframes bptap { 50% { opacity: .45; } }
#boostPop .bc { position: absolute; left: 50%; top: 50%; width: ${U(180)}; height: ${U(256)}; transition: transform .35s cubic-bezier(.2,1.4,.4,1), opacity .25s; }
#boostPop .bc .ccard { left: 0; top: 0; margin: 0; width: 100%; height: 100%; }
#boostPop .bc .rays { position: absolute; left: 50%; top: 50%; width: ${U(500)}; height: ${U(500)}; margin: ${U(-250)} 0 0 ${U(-250)}; opacity: .25;
  animation: bprot 8s linear infinite; }
@keyframes bprot { to { transform: rotate(360deg); } }
#boostPop .bc .stk { position: absolute; right: ${U(-10)}; bottom: ${U(-14)}; }
#boostPop .bc .new { position: absolute; right: ${U(-30)}; top: ${U(-24)}; width: ${U(85)}; height: ${U(65)}; }
#boostPop .bc .cname { position: absolute; left: 50%; bottom: calc(100% + ${U(16)}); width: ${U(380)}; margin-left: ${U(-190)}; display: flex;
  flex-direction: column; align-items: center; gap: ${U(4)}; }
#boostPop .bc .cbar { bottom: ${U(-75)}; transform: scale(1.3); }
#boostPop .bc .coin { position: absolute; inset: 0; }
#boostPop .sum .bc { transition: transform .45s ease, opacity .25s; }
#boostPop .close { position: absolute; left: 50%; bottom: calc(env(safe-area-inset-bottom) + ${U(70)}); width: ${U(320)}; height: ${U(110)};
  margin-left: ${U(-160)}; border: 0; background: none; cursor: pointer; display: none; align-items: center; justify-content: center; }
#boostPop.done .close { display: flex; }
#boostPop.done .tap { display: none; }

/* market: booster offers and the black market (inside menus.js openMarket's sheet) */
.mk .bm-ban { position: relative; height: ${U(68)}; margin: ${U(24)} 0 ${U(10)}; display: flex; align-items: center; justify-content: center; gap: ${U(14)}; }
.mk .bm-ban .bg { position: absolute; inset: 0; }
.mk .bm-ban .bg.s { transform: translateY(${U(5)}); }
.mk .bm-ban .ttl { position: relative; }
.mk .bm-ban .tm { position: relative; display: flex; align-items: center; gap: ${U(4)}; height: ${U(30)}; padding: 0 ${U(10)} 0 ${U(30)};
  border-radius: ${U(10)}; background: #2876eb; font: 800 ${U(18)} system-ui; color: #ffcb34; }
.mk .bm-ban .tm i { position: absolute; left: ${U(4)}; top: 50%; width: ${U(25)}; height: ${U(25)}; margin-top: ${U(-12.5)}; }
.mk .bm-sub { margin: ${U(10)} 0 ${U(4)}; font-size: 15px; font-weight: 900; text-align: center; }
.mk .bm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: rgba(0, 20, 46, .49); border-radius: 14px; padding: 10px; }
.mk .bm-grid.locked { position: relative; }
.mk .bm-grid.locked::after { content: attr(data-lock); position: absolute; inset: 0; background: rgba(0,0,0,.7); border-radius: 14px; display: grid;
  place-items: center; font: 900 18px system-ui; }
.ocard { position: relative; aspect-ratio: 180 / 250; border-radius: 14px; cursor: pointer; }
.ocard > * { position: absolute; }
.ocard .hold { inset: 0; }
.ocard .glow { inset: 8%; opacity: .35; }
.ocard .ill { left: 50%; top: 50%; width: 78%; height: 44%; transform: translate(-50%, -62%); }
.ocard .ttl { left: 0; right: 0; top: 0; height: 12%; border-radius: 14px 14px 0 0; display: flex; align-items: center; justify-content: center;
  gap: 4px; padding: 0 6px; font: 900 10px/1 system-ui; color: #fff; text-transform: uppercase; overflow: hidden; white-space: nowrap; }
.ocard .ttl b { color: #b6ff58; }
.ocard .ttl span { overflow: hidden; text-overflow: ellipsis; opacity: .9; }
.ocard .nm { left: 4%; right: 4%; top: 14%; text-align: center; font: 900 12px/1.1 system-ui; color: #fff; -webkit-text-stroke: 3px #1a1c4b;
  paint-order: stroke fill; text-transform: uppercase; }
.ocard .q { right: 8%; top: 52%; font: 900 22px system-ui; color: #fff; -webkit-text-stroke: 4px #1a1c4b; paint-order: stroke fill; }
.ocard .pb { left: 11%; right: 11%; bottom: 27%; height: 11%; }
.ocard .buy { left: 0; right: 0; bottom: 0; height: 24%; border: 0; border-radius: 0 0 14px 14px; background: #fff; display: flex;
  align-items: center; justify-content: center; gap: 4px; font: 900 18px system-ui; color: #1a1c4b; cursor: pointer; }
.ocard .buy i { width: 22px; height: 22px; }
.ocard .buy:disabled { opacity: .55; cursor: default; }
.ocard .sold { inset: 0; border-radius: 14px; background: rgba(0,0,0,.72); display: grid; place-items: center; }
.ocard .sold i { width: 36%; aspect-ratio: 65 / 59; }
.ocard .nm.qty { top: 3%; display: flex; justify-content: center; }
.ocard .ill + .nm.qty ~ .q { display: none; }
.ocard .disc { left: -6%; top: -5%; width: 36%; aspect-ratio: 1; display: grid; place-items: center; padding-bottom: 6%; box-sizing: border-box; }
.ocard .buy.free { background: #74e67d; }
.ocard .buy.rew { background: #f7a402; }
.ocard .buy.na { background: rgba(16, 28, 67, .6); color: #fff; font: 800 10px/1.1 system-ui; }
.ocard .buy.na em, .soff .buy.na em { color: #fcd225; font-style: normal; }
.buy .ad { display: block; width: 26px; height: 22px; }
.buy.iap { flex-direction: row; gap: 4px; }
.buy.iap s { font: 800 10px system-ui; color: #7d93ab; text-decoration-color: #e53935; text-decoration-thickness: 2px; }
.buy.iap .usd { font: 900 17px system-ui; color: #1a1c4b; }
/* MarketSpecialOfferCard: background 2:1, illustration left, reward holders right, bottom bar with title and price */
.mk .soff { position: relative; aspect-ratio: 700 / 420; margin: 6px 0 14px; border-radius: 14px; overflow: visible; }
.soff > * { position: absolute; }
.soff .sbg { left: 0; right: 0; top: 0; height: 83.3%; border-radius: 14px; }
.soff .ill { left: 2%; top: 4%; width: 44%; height: 72%; }
.soff.solo .ill { left: 20%; width: 60%; }
.soff .rw { right: 2%; top: 5%; width: 52%; height: 72%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; align-content: center; }
.soff .rh { position: relative; aspect-ratio: 1; border-radius: 10px; background: rgba(29, 35, 76, .42); }
.soff .rh i { position: absolute; inset: 4% 8% 30%; }
.soff .rh span { position: absolute; left: 2px; right: 2px; bottom: 3px; text-align: center; font: 900 9px/1.05 system-ui; color: #fff;
  -webkit-text-stroke: 2px #1a1c4b; paint-order: stroke fill; text-transform: uppercase; }
.soff .disc { left: -2%; top: -4%; width: 15%; aspect-ratio: 1; display: grid; place-items: center; padding-bottom: 3%; box-sizing: border-box; }
.soff .bar { left: 0; right: 0; bottom: 0; height: 22%; border-radius: 0 0 14px 14px; background: rgba(0, 0, 0, .39); display: flex; align-items: center; }
.soff .st { flex: 1; padding: 0 8px; color: #fff; font: 900 15px/1.1 system-ui; -webkit-text-stroke: 3px #1a1c4b; paint-order: stroke fill; }
.soff .st small { display: block; font: 700 10px/1.15 system-ui; -webkit-text-stroke: 0; opacity: .9; }
.soff .buy { position: relative; width: 36%; height: 100%; border: 0; border-radius: 12px 0 14px 0; background: #fff; display: flex;
  align-items: center; justify-content: center; gap: 4px; cursor: pointer; }
.soff .buy.rew { background: #f7a402; }
.soff .buy.free { background: #74e67d; }
`;

// A sprite fitted inside the element's box (Image preserveAspect / AspectRatioFitter)
function fit(el, sh, name) {
  if (!sh.rects[name]) return el;
  Object.assign(el.style, { backgroundImage: `url(${cut(sh, name)})`, backgroundSize: 'contain', backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat' });
  return el;
}

let styled = false;
function style() {
  kitStyle();
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

export async function sheets(app) {
  const [cards, boost] = await Promise.all([sheet(app, 'cards'), sheet(app, 'boost')]);
  return { cards, boost };
}

// A sprite tinted with a colour (the category patterns are white with alpha; CardBackground material colours them).
const tints = new Map();
function tinted(sh, name, color) {
  const key = name + color;
  if (!tints.has(key)) {
    const r = sh.rects[name], c = document.createElement('canvas');
    c.width = r[2]; c.height = r[3];
    const g = c.getContext('2d');
    g.drawImage(sh.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, r[2], r[3]);
    tints.set(key, c.toDataURL());
  }
  return tints.get(key);
}
const rgba = (hex) => { // #RRGGBBAA -> css
  const n = parseInt(hex.slice(1, 7), 16), a = hex.length > 7 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
};
const HOLDER = { common: 'CardHolder_common', epic: 'CardHolder_epic', legendary: 'CardyHolder_legendary' };

// CardItemUI: holder by rarity (locked: CardLocked), the category pattern in the rarity's bgPatternColor (locked
// #B4B4B4, CardItemBackgroundUI.lockedPatternColor), top bar with the category name and the "LV." badge, the icon over
// a ShinySun, the name, the value (cardMultiplier with the current effect, or the level-1 effect when locked).
export function cardEl(app, sh, cards, c, o = {}) {
  const el = document.createElement('div');
  const lv = o.level ?? cards.level(app.save, c.id), locked = lv < 1;
  el.className = 'ccard' + (locked ? ' locked' : '');
  el.dataset.id = c.id;
  const rar = cards.d.rarity[c.rarity];
  el.innerHTML = `<i class="hold"></i><i class="pat"></i><div class="top"><div class="mode"></div><div class="lv"></div></div>
    <div class="ic"><i class="glow"></i><i class="im"></i></div><div class="nm"></div><div class="val"><i class="bg"></i></div>`;
  slice(el.querySelector('.hold'), sh, locked ? 'CardLocked_common' : HOLDER[c.rarity], 180 / 336 * 0.6);
  const pat = el.querySelector('.pat'), cat = cards.cat(c.cat);
  Object.assign(pat.style, { backgroundImage: `url(${tinted(sh, cat.pattern, locked ? 'rgba(180,180,180,.3)' : rgba(rar[2]))})`,
    backgroundSize: '100% 100%' });
  const mode = el.querySelector('.mode');
  mode.style.background = locked ? '#6d7f93' : rgba(rar[1]);
  mode.appendChild(label(app, cat.name, 10.5));
  const lvb = el.querySelector('.lv');
  spr(lvb, sh, 'LevelBackground');
  if (locked) lvb.style.visibility = 'hidden';
  else lvb.append(label(app, 'LV.', 12), label(app, String(lv), 22));
  spr(el.querySelector('.glow'), sh, 'ShinySun');
  fit(el.querySelector('.im'), sh, c.sprite);
  const nm = el.querySelector('.nm');
  for (const line of c.name.split('\n')) nm.appendChild(label(app, line, 17));
  // [ĐỀ XUẤT] the value strip (GradientHorizontalInOut, white in the prefab) in the rarity's dark colour, as the clips
  Object.assign(el.querySelector('.val .bg').style, { backgroundImage: `url(${tinted(sh, 'GradientHorizontalInOut', locked ? '#6d7f93' : rgba(rar[1]))})`,
    backgroundSize: '100% 100%' });
  el.querySelector('.val').appendChild(label(app, cards.valueText(c.id, Math.max(lv, 1)), 22));
  return el;
}

// CardItemProgressBarUI: cards owned toward the next level (green), "n/m" text, the level-up arrow; max level: MAX.
export function barEl(app, sh, cards, c, o = {}) {
  const el = document.createElement('div');
  el.className = 'cbar';
  el.innerHTML = '<i class="bg"></i><div class="fillw"><i class="fill"></i></div><div class="t"></div>';
  slice(el.querySelector('.bg'), sh, 'HolderProgressBar', 1); // the borders cover the whole height, as Unity shrinks them to fit
  spr(el.querySelector('.fill'), sh, 'ProgressBar');
  const p = o.progress || cards.progress(app.save, c.id);
  const fw = el.querySelector('.fillw');
  fw.style.right = U(2);
  el.querySelector('.fill').style.width = '100%';
  fw.style.width = `calc((100% - ${U(4)}) * ${p.max ? 1 : Math.min(1, p.have / p.need)})`;
  fw.style.right = '';
  if (p.max) { el.classList.add('max'); el.querySelector('.t').appendChild(label(app, 'MAX', 20)); }
  else el.querySelector('.t').appendChild(label(app, `${p.have}/${p.need}`, 20));
  if (!p.max && p.have >= p.need) { const a = document.createElement('i'); a.className = 'ar'; spr(a, sh, 'ArrowIcon'); el.appendChild(a); }
  if (p.locked) { const l = document.createElement('i'); l.className = 'lk'; fit(l, sh, 'Icon_Lock'); el.appendChild(l); }
  return el;
}

const VI = { global: 'Mọi chế độ', normal: 'Chế độ chính', tournament: 'Đua', adventure: 'Phiêu lưu', challenge: 'Thử thách',
  grapple: 'Grapple', pachinko: 'Lucky Drop' };

// CardsPage: UIGradient #0082FF -> #00EAFF, Pattern_CardMenu (alpha 12/255), title holder (Icon_Perks 240, "Cards",
// perk level "{0}/{1}"), then one CardsUI per category: Banner with the category name and its "level n/m" counter, a
// 3-column grid of 188 x 300 cells (GridLayoutGroup spacing 5 x 10) on #00142E7D.
export async function openCards(app, cards) {
  style();
  const { cards: sh } = await sheets(app);
  const { body } = await artPage(app, 'cards', 'cards', { grad: 'linear-gradient(#0082ff, #00eaff)', pattern: 'Pattern_CardMenu',
    patSize: 256, patAlpha: 0.08, title: 'Thẻ bài' });
  // the page is 750 reference units wide; CardsUI is 675: narrower phones scale the blocks down to the width
  const k = () => Math.min(1, (window.innerWidth - 12) / ((700 * window.innerHeight) / 1334));
  const render = () => {
    body.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'ctitle';
    t.innerHTML = '<i class="perks"></i><div class="lvl"><small></small><b class="pl"></b></div>';
    fit(t.querySelector('.perks'), sh, 'Icon_Perks');
    t.querySelector('small').appendChild(label(app, 'level', 23));
    const pl = t.querySelector('.pl');
    pl.textContent = `${cards.perk(app.save)}/${cards.perkMax()}`;
    glText(app, pl, 30);
    body.appendChild(t);
    for (const cat of cards.cats) {
      const list = cards.list.filter((c) => c.cat === cat.id);
      const sec = document.createElement('div');
      sec.className = 'cat';
      sec.style.zoom = k();
      sec.dataset.cat = cat.id;
      sec.innerHTML = '<div class="ban"><b class="bt"></b><div class="cnt"><small></small><b class="n"></b></div></div><div class="grid"></div>';
      slice(sec.querySelector('.ban'), sh, 'Banner', 0.8);
      sec.querySelector('.bt').appendChild(label(app, cat.name, 32));
      sec.querySelector('.cnt small').appendChild(label(app, 'level', 16));
      const n = sec.querySelector('.n');
      n.textContent = `${cards.perkOf(app.save, cat.id)}/${cards.perkMaxOf(cat.id)}`;
      glText(app, n, 22);
      sec.title = VI[cat.id] || cat.name;
      const grid = sec.querySelector('.grid');
      for (const c of list) {
        const cell = document.createElement('div');
        cell.className = 'hcard';
        cell.innerHTML = '<i class="sh"></i>';
        slice(cell.querySelector('.sh'), sh, 'SquareInsideShadow', 0.5);
        cell.querySelector('.sh').style.filter = 'brightness(.35)';
        cell.appendChild(cardEl(app, sh, cards, c));
        cell.appendChild(barEl(app, sh, cards, c));
        cell.title = cards.info(app.save, c.id);
        cell.onclick = () => app.toast(cards.info(app.save, c.id));
        grid.appendChild(cell);
      }
      body.appendChild(sec);
    }
  };
  render();
  return { render };
}

// ---- toasts for card effects (NormalCardsEffectPopup / SmallCardsEffectPopup, reduced to a toast) ----
const RES_VI = { 'progression.xp': 'XP', 'currency.skin_coins': 'xu', 'progression.race_trophies': 'cúp', 'currency.adventure_tokens': 'xu phiêu lưu' };
export function boostToast(app, res, src, n) {
  const c = app.cards?.boostBy.get(`${res}_${src}`.toLowerCase());
  const name = c ? app.cards.byId.get(c.card).name.replace(/\n/g, ' ') : 'Thẻ';
  app.toast(`${name}: +${n} ${RES_VI[res] || res}`);
}
export function cardToast(app, id) {
  const c = app.cards?.byId.get(id);
  if (c) app.toast(`${c.name.replace(/\n/g, ' ')}!`);
}
const SECOND = { 'mode.normal': 'card.second_chance_normal', 'mode.challenge': 'card.second_chance_challenge',
  'mode.grapple': 'card.second_chance_grapple', 'mode.tournament': 'card.second_chance_tournament' };
export function secondChance(app, modeId) { cardToast(app, SECOND[modeId]); }

// ---- BoosterOpeningPopup ----
// BG UIGradient #0C142B -> #2169D4 (angle 0), Pattern_CardMenu tinted #040711; the pack (Boosters/<R>/NoOutline,
// 420 x 655 at scale 0.8). RunOpenFlow [asm 0x1145c04]: with >= 2 cards the pack opens (openingDelay 0.5 s, the top
// tears off, displayDelay 1.0 s, blast), 300 ms [asm 0x1145fb4], then one card at a time (pop to scale 1.6 in ~0.67 s:
// speedUp 3 [asm 0x1143294]), its name above, "+n" stack, NEW tag, the bar. Then the recap (>= 2 cards): a ring of
// radius 210, y x 1.2, from 90 degrees [asm 0x1146088]. [ĐỀ XUẤT] the bar shows its end state (no count-up), the pack
// tear is a slide of its top 12 %.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export async function openBooster(app, cards, rand = Math.random) {
  style();
  const { cards: sh, boost: bsh } = await sheets(app);
  const s = app.save, inst = s.boosterQueue?.[0];
  if (!inst) return null;
  const box = cards.content(s, inst, rand);
  const before = Object.fromEntries(box.items.filter((i) => i.card).map((i) => [i.card, cards.count(s, i.card)]));
  const got = cards.consume(s, box);
  app.writeSave();
  const b = cards.boosters[box.id];
  let el = document.getElementById('boostPop');
  if (!el) { el = document.createElement('div'); el.id = 'boostPop'; document.body.appendChild(el); }
  el.className = 'ui overlay';
  el.dataset.inst = inst;
  el.innerHTML = `<i class="bpat"></i><div class="flash"></div><div class="you"></div><div class="cards"></div>
    <div class="pack"><i class="bt"></i><i class="tp"></i></div><div class="tap"></div><button class="close"></button>`;
  const pat = el.querySelector('.bpat');
  Object.assign(pat.style, { backgroundImage: `url(${tinted(sh, 'Pattern_CardMenu', '#040711')})`, backgroundSize: `${U(256)} ${U(256)}` });
  const pack = el.querySelector('.pack');
  for (const i of pack.children) spr(i, bsh, b[10]);
  el.querySelector('.you').appendChild(label(app, 'You got :', 50));
  el.querySelector('.tap').appendChild(label(app, 'Tap To Continue', 44));
  el.querySelector('.close').appendChild(label(app, 'Close', 50));
  app.overlay('boostPop', true);
  app.play('popup_in');
  const state = { box, el, phase: 'pack', closed: false };
  el.__state = state;
  let tapped = null;
  const tap = () => new Promise((r) => { tapped = r; });
  el.onpointerdown = () => { const t = tapped; tapped = null; t?.(); };
  const many = box.items.length >= 2;
  if (many) {
    await tap();
    pack.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0)' }], { duration: 500 });
    await wait(500); // openingDelay
    pack.querySelector('.tp').animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${U(60)}, ${U(-260)}) rotate(14deg)`, opacity: 0 }],
      { duration: 600, fill: 'forwards', easing: 'ease-in' });
    await wait(1000); // displayDelay
    el.querySelector('.flash').animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 500 });
    pack.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 300, fill: 'forwards' });
    app.play('popup_in');
    await wait(300);
  } else pack.style.display = 'none';
  const host = el.querySelector('.cards'), nodes = [];
  state.phase = 'cards';
  for (let i = 0; i < box.items.length; i++) {
    const n = boosterCard(app, sh, bsh, cards, box.items[i], before);
    host.appendChild(n);
    nodes.push(n);
    n.style.transform = 'translate(-50%, -50%) scale(0)';
    n.getBoundingClientRect();
    n.style.transform = 'translate(-50%, -50%) scale(1.6)';
    app.play('button');
    state.shown = i + 1;
    if (many) { await tap(); n.style.opacity = '0'; await wait(250); n.style.display = 'none'; }
  }
  if (many) {
    el.querySelector('.you').style.opacity = 1;
    nodes.forEach((n, i) => {
      const a = (90 + (360 * i) / nodes.length) * (Math.PI / 180);
      n.style.display = '';
      n.querySelector('.cname')?.remove();
      n.querySelector('.cbar')?.remove();
      n.style.transform = `translate(calc(-50% + ${U(210 * Math.cos(a))}), calc(-50% - ${U(210 * 1.2 * Math.sin(a))})) scale(.8)`;
      n.style.opacity = '1';
    });
  }
  state.phase = 'done';
  el.classList.add('done');
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    if (cards.extraDraw(s, box)) cardToast(app, 'card.extra_draw');
    app.writeSave();
    app.overlay('boostPop', false);
    app.play('popup_out');
    state.closed = true;
  };
  if (cards.canOneMore(box)) {
    const om = document.createElement('button');
    om.className = 'more';
    om.style.cssText = `position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom) + ${U(200)});width:${U(310)};height:${U(110)};`
      + `margin-left:${U(-155)};border:0;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:${U(8)}`;
    slice(om, bsh, 'OutlinedButtonGold', 0.5);
    om.appendChild(label(app, '+1 Card', 36));
    const t = document.createElement('i'), how = adIcon(s);
    Object.assign(t.style, { width: U(56), height: U(44), display: 'block' });
    spr(t, bsh, how === 'ticket' ? 'SkipTickets' : 'AdIcon');
    om.appendChild(t);
    om.dataset.icon = how;
    // LaunchRewarded (rewarded.one_more_card) [asm 0x114533c]: the ad is granted at once, a skip ticket pays it when owned
    om.title = how === 'ticket' ? '+1 thẻ: 1 vé bỏ qua thay quảng cáo' : '+1 thẻ: quảng cáo có thưởng (nhận ngay)';
    om.onclick = (e) => {
      e.stopPropagation();
      watch(s);
      cards.oneMore(s, box);
      finish();
    };
    el.appendChild(om);
  }
  el.querySelector('.close').onclick = (e) => { e.stopPropagation(); finish(); };
  await new Promise((r) => { const t = setInterval(() => { if (state.closed) { clearInterval(t); r(); } }, 100); });
  return { box, got };
}

// BoosterCardItemUI: rays (ShinySun 500, turning), the card (or CoinCardItemUI: CardHolder + MarketOfferSkinCoins_3 and
// the amount), its name and mode above, "+n" (#FAC112, 48), NEW (Img_New) for a new card, the bar (scale 1.5).
function boosterCard(app, sh, bsh, cards, it, before) {
  const n = document.createElement('div');
  n.className = 'bc';
  n.innerHTML = '<i class="rays"></i>';
  spr(n.querySelector('.rays'), sh, 'ShinySun');
  if (!it.card) {
    const c = document.createElement('div');
    c.className = 'coin';
    slice(c, sh, HOLDER[it.rarity] || 'CardHolder_common', (180 / 336) * 0.6);
    const im = document.createElement('i');
    Object.assign(im.style, { position: 'absolute', inset: '8%' });
    fit(im, bsh, 'MarketOfferSkinCoins_3');
    c.appendChild(im);
    const q = document.createElement('div');
    Object.assign(q.style, { position: 'absolute', right: '6%', bottom: '6%' });
    q.appendChild(label(app, String(it.coins), 40, '#ffd23f'));
    c.appendChild(q);
    n.appendChild(c);
    n.dataset.coins = it.coins;
    return n;
  }
  const c = cards.byId.get(it.card), s = app.save;
  n.dataset.card = it.card;
  n.dataset.qty = it.qty;
  n.appendChild(cardEl(app, sh, cards, c));
  const nm = document.createElement('div');
  nm.className = 'cname';
  for (const line of c.name.split('\n')) nm.appendChild(label(app, line, 30));
  nm.appendChild(label(app, cards.cat(c.cat).name, 22, '#b3cbff'));
  n.appendChild(nm);
  const st = document.createElement('div');
  st.className = 'stk';
  st.appendChild(label(app, '+' + it.qty, 44, '#fac112'));
  n.appendChild(st);
  if (it.isNew) { const nw = document.createElement('i'); nw.className = 'new'; spr(nw, bsh, 'Img_New'); n.appendChild(nw); }
  n.appendChild(barEl(app, sh, cards, c));
  const was = before[it.card] ?? 0;
  if (was > 0 && cards.level(s, it.card) > cards.level(s, it.card, was)) {
    const lu = document.createElement('div');
    Object.assign(lu.style, { position: 'absolute', left: 0, right: 0, bottom: U(-120), display: 'flex', justifyContent: 'center' });
    lu.appendChild(label(app, 'Level up', 30, '#a0f534'));
    n.appendChild(lu);
  }
  if (it.doubled) n.dataset.doubled = '1';
  return n;
}

// ---- market sections (inside menus.js openMarket): boosters for coins, then the Black Market ----
// Booster offers: offer.boosters_1..3 (1 epic, 1 legendary, 5 legendary), MarketOfferBoosterItem cards. Black Market
// (MarketBlackMarketSection): title banner with the time left to the next 6 h rotation, "Instant Unlock & Achievements
// Skip" (3 customization items, flat price) and "Instant Perks Upgrade" (3 cards: the XP left in the level x unit price);
// requirement has_cards for the cards and the boosters (offerGroup purchaseRequirementId).
const fmtTime = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map((v) => String(v).padStart(2, '0')).join(':'); };
const richName = (t) => t.replace(/<color=(#[0-9A-Fa-f]{6})>/g, '<span style="color:$1">').replace(/<\/color>/g, '</span>');
let timer = 0;
// The market (MarketPage): five sections in the config order (market.sections) -- Special Offers, Boosters, Black Market,
// Coins, Skip Tickets -- each a MarketTitleBanner in the section colours (view_templates market_section.*). Offers come from
// data/ads.json through ads.js Shop (visible by display requirement, priced by the first matching price). Cards:
// MarketSpecialOfferCard (background, illustration, reward holders, bottom bar with title and price), MarketOfferSingleItem
// (180 x 250: colour, illustration, quantity, purchase button: FREE "free" ButtonGreen, REWARDED "get" + AdIcon
// ButtonOrange, IAP the price on ButtonWhite with the undiscounted price struck through). Every IAP / rewarded button
// grants at once (owner rule): app.bonus.buy.
const ADDR = { 'GameModes/Adventure/Icon': 'Icon_Compass', 'Boosters/Common/Market': 'common_market', 'Boosters/Epic/Market': 'epic_market',
  'Boosters/Legendary/Market': 'legendary_market', 'Boosters/Legendary/MultipleMarket': 'legendary_multiplemarket' };
function addrName(a) {
  if (ADDR[a]) return ADDR[a];
  const p = a.split('/');
  if (p[0] === 'Market' && p[1] === 'Offer') return /^\d+$/.test(p[3]) ? `MarketOffer${p[2]}_${p[3]}` : `MarketOffer${p[2]}${p[3]}`;
  if (p[0] === 'Market' && p[1] === 'Reward') return 'MarketReward' + p[2];
  return p[p.length - 1];
}
// MarketDiscountPercentageDisplayer.Initialize [asm 0x2f6b410]: hidden under 1, else "+{5 * round(20 * (1 / (1 - d/100) - 1))}%"
export const discountText = (d) => (d >= 1 ? `+${5 * Math.round(20 * (1 / (1 - d / 100) - 1))}%` : '');
// MarketNotDiscountedPriceDisplayer: the price before the discount, price / (1 - d / 100), in the same "0.99$" format
const oldPrice = (usd, d) => (parseFloat(usd) / (1 - d / 100)).toFixed(2) + '$';
const plain = (t) => String(t).replace(/<[^>]+>/g, '').replace(/\n/g, ' ');
const fmtLeft = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)), p = (n) => String(n).padStart(2, '0'); return `${p(Math.floor(t / 3600))}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}`; };

function banner(app, bsh, title, col, shadow) {
  const ban = document.createElement('div');
  ban.className = 'bm-ban';
  ban.innerHTML = '<i class="bg s"></i><i class="bg"></i><b class="ttl"></b>';
  const [shd, top] = ban.querySelectorAll('.bg');
  for (const [e, c] of [[shd, shadow], [top, col]]) Object.assign(e.style, { backgroundImage: `url(${tinted(bsh, 'MarketTitleBanner', c.slice(0, 7))})`, backgroundSize: '100% 100%' });
  ban.querySelector('.ttl').appendChild(label(app, title, 32));
  return ban;
}

export async function marketSections(app, cards, root, rerender) {
  style();
  const [{ cards: sh, boost: bsh }, msh] = await Promise.all([sheets(app), sheet(app, 'market')]);
  const s = app.save, shop = app.bonus.shop, now = Date.now();
  const pick = (name) => [msh, bsh, sh].find((x) => x.rects[name]);
  const art = (el, name) => { const x = pick(name); if (x) fit(el, x, name); return el; };
  const coin = (btn, price) => {
    btn.innerHTML = `<span>${price}</span><i></i>`;
    spr(btn.querySelector('i'), sh, 'SkinCoins');
    btn.disabled = s.coins < price;
  };
  const done = (r, msg) => {
    if (r.refused) { app.toast(r.refused === 'coins' ? `Cần ${r.price} xu` : 'Đã mua'); return; }
    app.play('popup_in');
    app.writeSave();
    app.applyEquip();
    app.toast(msg);
    app.hud();
    rerender();
  };
  const buy = (id) => { const r = app.bonus.buy(id); if (!r.refused) rerender(); };
  // StickmanHookMarketOfferPurchaseButtonView: one of Free / Rewarded / Iap / NotAvailable (timer to the next period)
  const priceButton = (btn, o, big) => {
    const p = shop.price(s, o, now), why = shop.blocked(s, o, now);
    btn.dataset.pay = p.pay;
    if (why && why.startsWith('didnt_buy_')) {
      btn.className = 'buy na';
      const end = new Date(now); end.setHours(24, 0, 0, 0);
      btn.innerHTML = `<small>available<br>in <em>${fmtLeft(end - now)}</em></small>`;
      btn.disabled = true;
      return;
    }
    if (p.pay === 'FREE') { btn.className = 'buy free'; btn.appendChild(label(app, 'free', 28)); }
    else if (p.pay === 'REWARDED') {
      btn.className = 'buy rew';
      btn.appendChild(label(app, big ? 'Get' : 'get', big ? 25 : 28));
      const i = document.createElement('i');
      i.className = 'ad';
      art(i, adIcon(s) === 'ticket' ? 'SkipTickets' : 'AdIcon');
      btn.dataset.icon = adIcon(s);
      btn.appendChild(i);
    } else {
      btn.className = 'buy iap';
      if (p.discount) { const o2 = document.createElement('s'); o2.textContent = oldPrice(p.usd, p.discount); btn.appendChild(o2); }
      const t = document.createElement('b');
      t.className = 'usd';
      t.textContent = p.usd;
      btn.appendChild(t);
      btn.title = 'Giá tham khảo [ĐỀ XUẤT]; bấm là nhận ngay';
    }
    if (why === 'has_cards') { btn.disabled = true; btn.title = 'Cần có thẻ đầu tiên'; }
    btn.onclick = (e) => { e.stopPropagation(); buy(o.id); };
  };
  // a MarketOfferSingleItem / booster offer card
  const single = (grid, o) => {
    const c = o.card, el = document.createElement('div');
    el.className = 'ocard';
    el.dataset.offer = o.id;
    el.innerHTML = '<i class="hold"></i><i class="glow"></i><i class="ill"></i><div class="nm"></div><b class="q"></b><i class="disc"></i><button></button>';
    el.querySelector('.hold').style.cssText = `background:${c.bg_color.slice(0, 7)};border-radius:14px;box-shadow:0 4px 0 ${c.bg_shadowColor.slice(0, 7)} inset`;
    spr(el.querySelector('.glow'), bsh, 'Glow');
    art(el.querySelector('.ill'), addrName(c.mainSpriteAddress));
    if (c.prefab === 'Boosters') {
      el.querySelector('.nm').innerHTML = richName(c.title).replace(/\n/g, '<br>');
      el.querySelector('.q').textContent = (c.quantityTextTemplate || 'x{0}').replace('{0}', o.content[0][1]);
    } else {
      const q = el.querySelector('.nm');
      q.className = 'nm qty';
      q.appendChild(label(app, c.title, 36, '#FFD54A'));
      q.dataset.q = c.title;
    }
    const p = shop.price(s, o, now);
    if (p?.discount) { const d = el.querySelector('.disc'); spr(d, bsh, 'DiscountBadge'); d.appendChild(label(app, discountText(p.discount), 13)); }
    else el.querySelector('.disc').remove();
    priceButton(el.querySelector('button'), o, false);
    grid.appendChild(el);
  };
  // a MarketSpecialOfferCard
  const special = (o) => {
    const c = o.card, el = document.createElement('div');
    el.className = 'soff';
    el.dataset.offer = o.id;
    el.innerHTML = '<i class="sbg"></i><i class="ill"></i><div class="rw"></div><i class="disc"></i>'
      + '<div class="bar"><div class="st"></div><button></button></div>';
    art(el.querySelector('.sbg'), addrName(c.bg_spriteAddress));
    el.querySelector('.sbg').style.filter = `drop-shadow(0 ${U(6)} 0 ${c.bg_shadowColor.slice(0, 7)})`;
    art(el.querySelector('.ill'), addrName(c.mainSpriteAddress));
    const rw = el.querySelector('.rw');
    for (const [t, a, rq] of c.rewards || []) {
      if (rq && !shop.req(s, rq, now)) continue;
      const h = document.createElement('div');
      h.className = 'rh';
      h.innerHTML = '<i></i><span></span>';
      art(h.querySelector('i'), addrName(a));
      h.querySelector('span').innerHTML = richName(t).replace(/\n/g, '<br>');
      rw.appendChild(h);
    }
    if (!rw.childElementCount) el.classList.add('solo');
    const st = el.querySelector('.st');
    st.innerHTML = `<b>${plain(c.title)}</b>${c.subTitle ? `<small>${richName(c.subTitle)}</small>` : ''}`;
    const p = shop.price(s, o, now);
    if (p?.discount) { const d = el.querySelector('.disc'); spr(d, bsh, 'DiscountBadge'); d.appendChild(label(app, discountText(p.discount), 13.6)); }
    else el.querySelector('.disc').remove();
    priceButton(el.querySelector('.bar button'), o, true);
    return el;
  };
  for (const sec of shop.d.sections) {
    const groups = Object.entries(shop.d.groups).filter(([, g]) => g.section === sec.id).map(([id]) => id);
    if (sec.id === 'black_market') { await blackMarket(app, cards, root, sh, bsh, coin, done, sec, rerender); continue; }
    if (!groups.some((g) => shop.offers(s, g, now).length)) continue;
    const ban = banner(app, bsh, sec.title, sec.color, sec.shadow);
    ban.dataset.section = sec.id;
    root.appendChild(ban);
    for (const g of groups) {
      const list = shop.offers(s, g, now);
      if (!list.length) continue;
      if (shop.d.groups[g].title) root.insertAdjacentHTML('beforeend', `<div class="bm-sub">${shop.d.groups[g].title}</div>`);
      if (g === 'special_offers') { for (const o of list) root.appendChild(special(o)); continue; }
      const grid = document.createElement('div');
      grid.className = 'bm-grid';
      grid.dataset.group = g;
      for (const o of list) single(grid, o);
      root.appendChild(grid);
    }
  }
}

async function blackMarket(app, cards, root, sh, bsh, coin, done, sec, rerender) {
  const s = app.save;
  // black market
  const has = cards.hasCards(s), bm = cards.market(s);
  app.writeSave();
  // MarketTitleBanner in the section colours (market_section.black_market), with the round's timer
  const ban = banner(app, bsh, sec.title, sec.color, sec.shadow);
  ban.dataset.section = sec.id;
  ban.insertAdjacentHTML('beforeend', '<span class="tm"><i></i><b></b></span>');
  spr(ban.querySelector('.tm i'), bsh, 'Icon_Timer');
  const tm = ban.querySelector('.tm b');
  const tick = () => { tm.textContent = fmtTime(bm.end - Date.now()); if (Date.now() >= bm.end) { clearInterval(timer); rerender(); } };
  tick();
  clearInterval(timer);
  timer = setInterval(() => { if (!ban.isConnected) clearInterval(timer); else tick(); }, 1000);
  root.appendChild(ban);
  // customization items
  root.insertAdjacentHTML('beforeend', '<div class="bm-sub">Instant Unlock &amp; Achievements Skip</div>');
  const ig = document.createElement('div');
  ig.className = 'bm-grid';
  const icons = await app.custom.icons().catch(() => null);
  for (const res of bm.items) {
    const it = app.meta.byId.get(res), price = cards.d.market[res][1], owned = app.meta.ownsRes(s, res);
    const o = document.createElement('div');
    o.className = 'ocard';
    o.dataset.item = res;
    o.innerHTML = '<i class="hold"></i><i class="glow"></i><canvas class="ill"></canvas><div class="ttl"></div><div class="nm"></div><button class="buy"></button>';
    slice(o.querySelector('.hold'), sh, HOLDER[it.rarity] || 'CardHolder_epic', (180 / 336) * 0.6);
    spr(o.querySelector('.glow'), sh, 'ShinySun');
    o.querySelector('.ttl').style.background = 'rgba(11,138,219,.6)';
    o.querySelector('.ttl').textContent = 'Skip';
    o.querySelector('.nm').textContent = it.title;
    if (icons) drawIcon(o.querySelector('.ill'), icons, it);
    const btn = o.querySelector('.buy');
    coin(btn, price);
    if (owned) o.insertAdjacentHTML('beforeend', '<div class="sold"><i></i></div>');
    btn.onclick = () => done(cards.buyItem(s, res), 'Mở khoá: ' + it.title);
    ig.appendChild(o);
  }
  root.appendChild(ig);
  // cards
  root.insertAdjacentHTML('beforeend', '<div class="bm-sub">Instant Perks Upgrade</div>');
  const cg = document.createElement('div');
  cg.className = 'bm-grid' + (has ? '' : ' locked');
  cg.dataset.lock = 'Cần có thẻ đầu tiên';
  for (const id of bm.cards) {
    const c = cards.byId.get(id), off = bm.offers[id], sold = bm.bought.includes(id) || cards.isMax(s, id);
    const o = document.createElement('div');
    o.className = 'ocard';
    o.dataset.card = id;
    o.innerHTML = '<i class="hold"></i><i class="glow"></i><i class="ill"></i><div class="ttl"></div><div class="nm"></div><button class="buy"></button>';
    slice(o.querySelector('.hold'), sh, HOLDER[c.rarity], (180 / 336) * 0.6);
    spr(o.querySelector('.glow'), sh, 'ShinySun');
    fit(o.querySelector('.ill'), sh, c.sprite);
    const ttl = o.querySelector('.ttl');
    ttl.style.background = rgba(cards.d.rarity[c.rarity][1]);
    ttl.innerHTML = `LVL <b>${cards.level(s, id)}</b><span>${cards.cat(c.cat).name}</span>`;
    o.querySelector('.nm').textContent = c.name.replace(/\n/g, ' ');
    const pb = barEl(app, sh, cards, c);
    pb.style.cssText = 'left:11%;right:11%;bottom:27%;width:auto;height:11%;margin:0';
    const plus = pb.querySelector('.t');
    plus.innerHTML = '';
    plus.appendChild(label(app, '+' + off.qty, 20, '#dbff8d'));
    o.appendChild(pb);
    const btn = o.querySelector('.buy');
    coin(btn, off.price);
    if (sold) o.insertAdjacentHTML('beforeend', '<div class="sold"><i></i></div>');
    btn.onclick = () => done(cards.buyCard(s, id), `+${off.qty} ${c.name.replace(/\n/g, ' ')}`);
    cg.appendChild(o);
  }
  root.appendChild(cg);
  root.querySelectorAll('.sold i').forEach((i) => spr(i, sh, 'IconValidate'));
}

function drawIcon(cv, icons, it) {
  const r = icons.rects[it.kind + '/' + it.asset];
  cv.width = cv.height = 160;
  if (!r) return;
  const k = 160 / Math.max(r[2], r[3]);
  cv.getContext('2d').drawImage(icons.img, r[0], r[1], r[2], r[3], (160 - r[2] * k) / 2, (160 - r[3] * k) / 2, r[2] * k, r[3] * k);
}
