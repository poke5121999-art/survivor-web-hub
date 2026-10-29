// Home screen (HomePage prefab of ui_pages_home, MenuBar of ui_hud_menubar, XpRoadHomeBar), loaded the first time it
// shows; never with `?level=`. Layout in reference units (uikit.js), art from art/m-home.webp (tools/build_menus.py).
// The markup is in index.html: main.js and bonus.js write the numbers (#coins, #tickets, #rank, #xptext, #wheelPrice,
// #playLevel...), this module places and paints them and draws them in the game font.
import { sheet, kitStyle, spr, slice, tile, U, glText } from './uikit.js';

// HomePage Background/Color UIGradient: #006DCF at the top to #00EAFF at the bottom; Pattern_MainMenu tiled, alpha 9/255
// on the prefab, the clip shows it brighter (2026 clip 3:18): [ĐỀ XUẤT] 0.09.
const CSS = `
#start { display: none; }
#start.on { display: block; }
#start .hbg { position: absolute; inset: 0; background: linear-gradient(#006dcf, #00eaff); overflow: hidden; }
#start .hpat { position: absolute; inset: -50%; transform: rotate(-20deg); }
#start button { border: 0; padding: 0; background: none; cursor: pointer; font: inherit; color: #fff; }
#start [data-s] { display: block; }
#btnSettings { position: absolute; left: ${U(60 - 33)}; top: calc(env(safe-area-inset-top) + ${U(80 - 35)}); width: ${U(66)}; height: ${U(70)};
  filter: drop-shadow(0 ${U(5)} 0 rgba(0,0,0,.3)); }
#start .hcur { position: absolute; right: ${U(15)}; top: calc(env(safe-area-inset-top) + ${U(32)}); display: flex; gap: ${U(14)}; }
#start .hpill { position: relative; display: flex; align-items: center; height: ${U(46)}; min-width: ${U(170)}; border-radius: ${U(23)};
  background: rgba(8, 23, 58, .32); padding: 0 ${U(50)} 0 ${U(54)}; box-sizing: border-box; }
#start .hpill i:first-child { position: absolute; left: ${U(-6)}; top: 50%; width: ${U(58)}; height: ${U(58)}; transform: translateY(-50%); }
#start .hpill .add { position: absolute; right: ${U(4)}; top: 50%; width: ${U(40)}; height: ${U(42)}; transform: translateY(-50%); }
#start .hpill b { flex: 1; text-align: center; font-size: ${U(30)}; }
#xpbar { position: absolute; left: 50%; top: calc(env(safe-area-inset-top) + ${U(190)}); width: ${U(380)}; height: ${U(60)}; margin-left: ${U(-190)}; }
#xpbar .bar { position: absolute; inset: 0; }
#xpfill { position: absolute; left: ${U(3)}; top: ${U(4)}; bottom: ${U(4)}; }
#xptext { position: absolute; left: 0; right: 0; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; font-size: ${U(32)}; }
#xpbar .medal { position: absolute; left: ${U(-20 - 85 + 3)}; top: 50%; width: ${U(170)}; height: ${U(170)}; transform: translateY(-50%) scale(.6); }
#rank { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: ${U(44)}; }
#xpbar .gift { position: absolute; right: ${U(-20 - 85 + 3)}; top: 50%; width: ${U(170)}; height: ${U(170)}; transform: translateY(-50%) scale(.64); }
#roadBadge { position: absolute; right: ${U(-40)}; top: ${U(-34)}; min-width: ${U(40)}; height: ${U(40)}; border-radius: ${U(20)}; background: #fd0d0d;
  border: ${U(4)} solid #fff; font-size: ${U(24)}; display: grid; place-items: center; }
#start .hplayer { position: absolute; left: 50%; top: 50%; width: ${U(420)}; height: ${U(420)}; margin: ${U(-210)} 0 0 ${U(-210)}; pointer-events: none; }
#start .hplayer .light { position: absolute; inset: -25%; opacity: .85; }
#start .hplayer .shadow { position: absolute; left: 24%; right: 24%; top: 71%; height: ${U(50)}; margin-top: ${U(-25)}; border-radius: 50%;
  background: rgba(12, 14, 58, .5); }
#homePlayer { position: absolute; inset: 0; width: 100%; height: 100%; }
#start .hcol { position: absolute; top: 50%; width: ${U(140)}; transform: translateY(calc(-50% - ${U(100)})); background: rgba(8, 23, 58, .25);
  border-radius: ${U(22)}; display: flex; flex-direction: column; padding: ${U(8)} 0; }
#start .hcol.l { left: ${U(16)}; }
#start .hcol.r { right: ${U(16)}; }
#start .hw { position: relative; height: ${U(120)}; display: block; }
#start .hw > i { position: absolute; left: ${U(12)}; right: ${U(12)}; top: ${U(4)}; bottom: ${U(26)}; }
#start .hw > span { position: absolute; left: 0; right: 0; bottom: ${U(2)}; text-align: center; font-size: ${U(17)}; }
#start .hw .cnt { left: 50%; width: ${U(102)}; margin-left: ${U(-51)}; height: ${U(25)}; display: flex; align-items: center; justify-content: center;
  gap: ${U(2)}; }
#start .hw .cnt b { font-size: ${U(15)}; }
#start .hw .cnt i { width: ${U(15)}; height: ${U(15)}; }
#start .dot { position: absolute; left: ${U(18)}; top: ${U(10)}; width: ${U(25)}; height: ${U(25)}; border-radius: 50%; background: #fd0d0d;
  border: ${U(3)} solid #fff; display: none; }
#start .dot.on { display: block; }
#start .hm { position: absolute; left: 50%; top: 50%; width: ${U(135)}; height: ${U(155)}; background: rgba(8, 23, 58, .25); border-radius: ${U(22)}; }
#btnTour { margin: ${U(326 - 77.5)} 0 0 ${U(-220 - 67.5)}; }
#btnAdv { margin: ${U(326 - 77.5)} 0 0 ${U(220 - 67.5)}; }
#start .hm .bt { position: absolute; left: ${U(5)}; top: ${U(5)}; width: ${U(125)}; height: ${U(125)}; filter: drop-shadow(0 ${U(5)} 0 rgba(0,0,0,.25)); }
#start .hm .ic { position: absolute; left: ${U(17.5)}; top: ${U(10)}; width: ${U(100)}; height: ${U(100)}; }
#start .hm .pos { position: absolute; left: 50%; top: ${U(84)}; width: ${U(71)}; height: ${U(27)}; margin-left: ${U(-35.5)}; border-radius: ${U(8)};
  background: rgba(48, 29, 96, .6); font-size: ${U(25)}; display: flex; align-items: center; justify-content: center; }
#start .hm .pos:empty { display: none; }
#start .hm .time { position: absolute; left: 0; right: 0; bottom: ${U(4)}; text-align: center; font-size: ${U(18)}; }
#btnPlay { position: absolute; left: 50%; bottom: calc(env(safe-area-inset-bottom) + ${U(375 - 72.5)}); width: ${U(275)}; height: ${U(145)};
  margin-left: ${U(-137.5)}; }
#btnPlay:active, #start .hm:active, #start .hw:active { transform: scale(.95); }
#btnPlay .pt { position: absolute; left: 0; right: 0; top: ${U(72.5 - 28 - 36)}; text-align: center; font-size: ${U(66)};
  -webkit-text-stroke-color: #0f5d14; }
#btnPlay .pc { position: absolute; left: 50%; top: ${U(72.5 + 24 - 18)}; width: ${U(148)}; height: ${U(36)}; margin-left: ${U(-74)};
  border-radius: ${U(10)}; background: rgba(25, 137, 27, .57); display: flex; align-items: center; justify-content: center; }
#playLevel { font-size: ${U(25)}; }
#start .mbar { position: absolute; left: 0; right: 0; bottom: 0; height: calc(env(safe-area-inset-bottom) + ${U(140)}); display: flex;
  background: linear-gradient(rgba(42, 91, 152, 0), rgba(42, 91, 152, .7) ${U(30)}); padding-bottom: env(safe-area-inset-bottom); box-sizing: border-box; }
#start .mbar button { position: relative; flex: 1; height: ${U(140)}; }
#start .mbar button.sel { flex: 1.25; margin-top: ${U(-18)}; height: ${U(158)}; filter: brightness(1.12); }
#start .mbar button > i { position: absolute; left: 50%; top: 45%; width: ${U(100)}; height: ${U(100)}; margin: ${U(-50)} 0 0 ${U(-50)}; }
#start .mbar button.sel > i { top: 40%; }
#start .mbar button.sel > span { position: absolute; left: ${U(-10)}; right: ${U(-10)}; bottom: ${U(10)}; text-align: center; font-size: ${U(21)}; }
#start .mbar .num { position: absolute; left: 50%; bottom: ${U(8)}; width: ${U(110)}; height: ${U(30)}; margin-left: ${U(-55)}; font-size: ${U(25)};
  display: flex; align-items: center; justify-content: center; }
#start .mbar .num:empty { display: none; }
#start .hw.off { display: none; }
#hmTut { position: absolute; inset: 0; background: rgba(0, 0, 0, .6667); display: none; z-index: 1; }
#start.ftue #hmTut { display: block; }
#start.ftue .hcur, #start.ftue #btnPlay { z-index: 2; }
#start.ftue .mbar { display: none; }
#start .tutHand { position: absolute; left: ${U(137.5 + 192.5 - 75)}; top: ${U(72.5 - 87 - 75)}; width: ${U(150)}; height: ${U(150)};
  pointer-events: none; display: none; }
#start.ftue .tutHand { display: block; }
#start .tutHand > i { position: absolute; left: ${U(29.75)}; bottom: ${U(10.85)}; width: ${U(97.27)}; height: ${U(124.72)};
  filter: drop-shadow(${U(6.64)} ${U(1.48)} 0 rgba(0, 0, 0, .5)); }
#start .tutHand > b { position: absolute; left: ${U(75 - 26 - 50)}; top: ${U(75 + 51 - 50)}; width: ${U(100)}; height: ${U(100)}; display: none; }
#start .tutHand > b > i { position: absolute; left: ${U(2.03)}; top: ${U(2.3)}; width: ${U(97.45)}; height: ${U(95.08)}; }
`;

// First run (HomePage.<Activate>d__36 [asm 0x1168f40..0x1168fa8]): _tutorialOverlay and _tutorialHand are active while
// GetMaxLevelAchieved("mode.normal") < 1, i.e. save.best < 1. TutorialDarkOverlay = white_square_2px #000000AA, a raycast
// target over the whole page (the second last child); PlayButton (the last child) stays above it with its TutorialHand
// (150 x 150 at the PlayButton's anchor (1.2, 1.1)). The page HUD (MainCurrenciesWidget) sits on the PageHUDs layer above
// the page, so it is not darkened. MenuBar: NavigationService shows it only from one cleared level on [asm 0x1165230..0x11652e4].
// Hand_animation (60 fps, loop 70 frames): keys [t, v, c0, c1, c2], v(t) = v + c2 d + c1 d^2 + c0 d^3 (d = t - key), a key
// with no coefficients holds its value (dump/ftue/anim_TutorialHand.txt, tools/ftue_anim.py).
const F = (n) => n / 60, LOOP = F(70);
const HAND = {
  rot: [[0, -90, 5898.9526, -1917.1598, 0], [F(13), -120, -1221.8685, 1035.1244, 0], [F(32), -55, -81200.1016, 10740.0107, 288],
    [F(38), 0, 2212.1067, -1437.8695, 0], [F(64), -90]],
  scale: [[0, 1, 1.0792, -1.2581, 0], [F(32), 0.8059, 102.9495, -13.3371, -0.4211], [F(38), 0.7333, -6.5544, 4.2604, 0], [F(64), 1]],
  x: [[0, 0, -2752.8447, 894.6746, 0], [F(13), 14, 7809.8823, -3709.6943, 0], [F(32), -110], [F(38), -110, -2703.686, 1757.3961, 0], [F(64), 0]],
  y: [[0, 0, -2752.8447, 894.6746, 0], [F(13), 14, 1710.616, -1070.2268, 0], [F(32), -39, 17680.0254, -1836.0028, -163.2],
    [F(38), -56, -1376.422, 894.6744, 0], [F(64), 0]],
  // CircleLight (path #f1389125): m_IsActive from frame 38, scale 1 -> 1.79 and alpha 1 -> 0 by frame 51
  cs: [[0, 1], [F(38), 1, -155.339, 50.4852, 0], [F(51), 1.79]],
  ca: [[0, 1], [F(38), 1, 196.6317, -63.9053, 0], [F(51), 0]],
};
export function handAt(t) {
  const ev = (keys) => {
    let i = 0;
    while (i + 1 < keys.length && keys[i + 1][0] <= t) i++;
    const [t0, v, c0, c1, c2] = keys[i], d = t - t0;
    return c0 === undefined || i === keys.length - 1 ? v : v + c2 * d + c1 * d * d + c0 * d * d * d;
  };
  return { rot: ev(HAND.rot), scale: ev(HAND.scale), x: ev(HAND.x), y: ev(HAND.y), light: t >= F(38), cs: ev(HAND.cs), ca: ev(HAND.ca) };
}

let tut = null, tutRaf = 0;
async function ftue(app, on) {
  const root = document.getElementById('start');
  root.classList.toggle('ftue', on);
  if (!on || tut) { if (on && !tutRaf) animHand(); return; }
  tut = {};
  const ov = document.createElement('div');
  ov.id = 'hmTut';
  root.insertBefore(ov, document.getElementById('btnPlay'));
  // the hand art (art/m-ftue.webp, 11 KB) is fetched only while the tutorial is on
  const fs = await sheet(app, 'ftue');
  const hand = document.createElement('div');
  hand.className = 'tutHand';
  hand.innerHTML = '<i></i><b><i></i></b>';
  spr(hand.firstChild, fs, 'Hand_tutorial');
  spr(hand.lastChild.firstChild, fs, 'CircleLight');
  document.getElementById('btnPlay').appendChild(hand);
  tut = { hand, light: hand.lastChild, t0: performance.now() };
  animHand();
}
function animHand() {
  const root = document.getElementById('start');
  if (!tut?.hand || !root.classList.contains('ftue') || !root.classList.contains('on')) { tutRaf = 0; return; }
  tutRaf = requestAnimationFrame(animHand);
  const a = handAt(((performance.now() - tut.t0) / 1000) % LOOP);
  // Unity: z counter-clockwise, y up; the box turns and scales about its centre (pivot 0.5)
  tut.hand.style.transform = `translate(${U(a.x)}, ${U(-a.y)}) rotate(${-a.rot}deg) scale(${a.scale})`;
  Object.assign(tut.light.style, { display: a.light ? 'block' : 'none', opacity: Math.max(0, Math.min(1, a.ca)), transform: `scale(${a.cs})` });
}

let ready = null, sh = null, raf = 0;

// Tournament / adventure buttons: TabLocker until the mode is open; Timer = time left of the day / week.
function modeButton(app, el, id, art) {
  const m = app.meta.d.modes.find((x) => x[0] === id), st = m ? app.meta.modeState(app.save, m) : { open: false };
  spr(el.querySelector('.bt'), sh, st.open ? art[0] : art[1]);
  spr(el.querySelector('.ic'), sh, st.open ? art[2] : art[3]);
  const now = new Date(), end = new Date(now);
  if (id === 'mode.adventure') end.setDate(end.getDate() + ((8 - end.getDay()) % 7 || 7));
  else end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  const min = Math.max(0, Math.round((end - now) / 60000)), d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60);
  el.querySelector('.time').textContent = !st.open ? '' : d ? `${d}D ${h}H` : `${h}H ${min % 60}M`;
  el.classList.toggle('off', !st.open);
  return st.open;
}

export function setup(app) {
  ready ||= (async () => {
    kitStyle();
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
    sh = await sheet(app, 'home');
    const root = document.getElementById('start');
    for (const el of root.querySelectorAll('[data-s]')) spr(el, sh, el.dataset.s);
    tile(root.querySelector('.hpat'), sh, 'Pattern_MainMenu', 256, 0.09);
    slice(root.querySelector('#xpbar .bar'), sh, 'TrophyRoadBarXp_Holder', 1);
    spr(document.getElementById('xpfill'), sh, 'BarFill');
    for (const b of root.querySelectorAll('.mbar button')) slice(b, sh, 'HolderMenu', 0.5);
    spr(document.querySelector('#btnShop .num'), sh, 'HolderCollectionNumber');
    // numbers in the game font (main.js / bonus.js keep writing their text)
    const gl = [['coins', 30], ['tickets', 30], ['rank', 44], ['xptext', 32], ['wheelPrice', 15], ['playLevel', 25], ['skinCount', 25]];
    for (const [id, px] of gl) glText(app, document.getElementById(id), px);
    for (const el of root.querySelectorAll('.hm .pos, .hm .time, .hw > span:not(.cnt)')) glText(app, el, parseFloat(getComputedStyle(el).fontSize) / (document.body.clientHeight / 1334));
    // HomePage.OnSettingsButtonClicked [asm 0x1168298] opens SettingsPopup (js/settings.js, loaded on the first click)
    root.querySelector('#btnSettings').onclick = () => app.openSettings();
    root.querySelector('#btnAddCoins').onclick = (e) => { e.stopPropagation(); app.openMenu('openMarket'); };
    root.querySelector('#btnTabShop').onclick = () => app.openMenu('openMarket');
    root.querySelector('#btnWheel').onclick = () => app.openMenu('openWheel');
    // MenuBar cards tab: TabLocker until the first card (requirement has_cards); the welcome booster comes at 550 XP
    root.querySelector('#btnCards').onclick = () => {
      if (app.cards?.hasCards(app.save)) app.openCards();
      else app.toast('Thẻ bài mở khi nhận gói thẻ chào mừng (Đường XP, 550 XP)');
    };
    const open = (id) => () => {
      const m = app.meta.d.modes.find((x) => x[0] === id), st = app.meta.modeState(app.save, m);
      if (st.open) app.openMode(id); else app.toast(st.need ? `Cần ${st.need.value} XP` : 'Chưa mở');
    };
    root.querySelector('#btnTour').onclick = open('mode.tournament');
    root.querySelector('#btnAdv').onclick = open('mode.adventure');
    root.querySelector('#btnLucky').onclick = open('mode.pachinko');
    root.classList.add('ready');
  })();
  return ready;
}

// The equipped skin on the home screen (MainMenuPlayer: 1.5 x a square of the width minus 320, its idle animation is the
// skin's dance clip; the default skin's frame CHAR_Classic0010 is in the home sheet so its sheet does not load here).
function drawPlayer(app) {
  const c = document.getElementById('homePlayer');
  if (!c || !document.getElementById('start').classList.contains('on')) { raf = 0; return; }
  raf = requestAnimationFrame(() => drawPlayer(app));
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(c.clientWidth * dpr);
  if (!w) return;
  if (c.width !== w) { c.width = w; c.height = w; }
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, w);
  const sk = app.look.skin;
  let img, r, k;
  if (sk && sk.dance.frames.length) {
    const name = sk.dance.frames[Math.floor((performance.now() / 1000) * sk.dance.fps) % sk.dance.frames.length];
    [img, r] = sk.frames[name];
  } else { img = sh.img; r = sh.rects.CHAR_Classic0010; }
  // [ĐỀ XUẤT] the stickman 0.55 of the box tall (the default frame is trimmed in the sheet; skin frames keep their margin,
  // so they are drawn 1.3 x), feet on the Shadow (anchored 0.3 from the bottom)
  k = (w * (img === sh.img ? 0.55 : 0.72)) / r[3];
  g.drawImage(img, r[0], r[1], r[2], r[3], (w - r[2] * k) / 2, w * (img === sh.img ? 0.71 : 0.77) - r[3] * k, r[2] * k, r[3] * k);
}

// Called by main.js each time the home screen shows (and on hud()).
export function show(app) {
  if (!sh) return;
  const { meta, save } = app;
  ftue(app, save.best < 1).catch(() => {});
  // HomePage.UpdateUI: the Lucky Wheel widget is active once mode.lucky_wheel is unlocked (its XP road step claimed)
  // [asm 0x1168118..0x1168160]; the Lucky Drop widget always [asm 0x1168164..0x116819c]
  document.getElementById('btnWheel').classList.toggle('off', !save.modes['mode.lucky_wheel']?.unlocked);
  // PassedRank shows the league medal of the current rank
  const lg = meta.league(save.xp), medal = { Bronze: 'BronzeMedals_01', Silver: 'SilverMedals_01', Gold: 'GoldMedal_01',
    Platine: 'OtherMedals_01', Diamond: 'Diamond_Small', Master: 'Master_Small' }[lg] || 'BronzeMedals_01';
  spr(document.querySelector('#xpbar .medal'), sh, medal);
  const owned = meta.items.filter((it) => it.kind === 'skins').length;
  document.getElementById('skinCount').textContent = `${save.owned.skins.length}/${owned}`;
  modeButton(app, document.getElementById('btnTour'), 'mode.tournament', ['Button_Tournament', 'Button_TournamentLocked', 'Icon_Trophy', 'Icon_TrophyLocked']);
  modeButton(app, document.getElementById('btnAdv'), 'mode.adventure', ['Button_Adventure', 'Button_AdventureLocked', 'Icon_Compass', 'Icon_CompassLocked']);
  const cardsOn = !!app.cards?.hasCards(save), bc = document.getElementById('btnCards');
  if (bc.dataset.on !== String(cardsOn)) {
    bc.dataset.on = cardsOn;
    spr(bc.querySelector('i'), sh, cardsOn ? 'Icon_Cards' : 'Icon_CardsLocked');
    bc.title = cardsOn ? 'Thẻ bài' : 'Thẻ bài (mở ở 550 XP)';
  }
  if (!raf) drawPlayer(app);
}
