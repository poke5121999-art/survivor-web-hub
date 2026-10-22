// Màn tiêu đề (Touch To Start), đặt tên (CommonInputPopup) và tạo nhân vật trước gương (CustomizeUI).
// Toạ độ X() là px ảnh chụp demo thật 1280x720 (D:\wos-ref\pilot g1, g2, g4..g7, cust1..6) [ĐO TRONG ẢNH];
// phòng là sprite gốc Customize/Customize_Bg (3840x2160, prefab: cao 1440 đơn vị, giữa màn), avatar vẽ vào RawImage
// (-436, 60) 880x880 của prefab, đè lên tấm gương có sẵn trong ảnh nền.
import * as THREE from 'three';
import { assetUrl } from '../assets.js?v=20261022d';
import { uiUrl, paint } from '../ui/sprites.js?v=20261022d';
import { X, T, panel, button, onTap, notice, toast, media, NAVY2, sleep } from './ui.js?v=20261022d';
import { L } from './text.js?v=20261022d';
import { buildAvatar, normLook, randomLook, DEFAULT_LOOK, COUNTS } from './avatar.js?v=20261022d';

// ------------------------------------------------------------------ Touch To Start (g1) + Loading resources (g2)
export async function titleScreen(layer, { preload = [] } = {}) {
  const scr = X(layer.root, 0, 0, null, null, { cls: 'full title', n: 'title' });
  const v = media('video', assetUrl('img/login_bg.mp4'), 'cover');
  Object.assign(v, { muted: true, loop: true, autoplay: true, playsInline: true }); v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  layer.box.insertBefore(v, layer.root);
  X(scr, 525, 20, 230, 124, { ac: true, spr: 'Login/Login_Logo_Title_En', n: 'logo' });
  // nút mạng xã hội (g1: Instagram, X, Discord): nền Login_Btn_Social_* (234x230 có lề trong suốt rộng, thân thấy được
  // 58 px trong ảnh = ô ~112 px) + logo Icon/Icon_Logo_*. Không có nền riêng cho X: dùng nền Steam (tối) [ĐỀ XUẤT]
  for (const [y, bgs, logo] of [[461, 'Instagram', 'Instagram'], [535, 'Steam', 'X'], [610, 'Discord', 'Discord_Glyph']]) {
    const b = X(scr, 5, y - 27, 112, 112, { ab: true, spr: 'Login/Login_Btn_Social_' + bgs, n: 'social' });
    X(b, 38, 38, 36, 36, { spr: 'Icon/Icon_Logo_' + logo });
  }
  const ver = X(scr, 20, 682, 200, 20, { ab: true }); T(ver, L('version'), 26, [1, 1, 1, 0.9], 'ver');
  // thanh tải (g2): x 396..884, y 676; chữ "Loading resources" y 651
  const lab = X(scr, 440, 640, 400, 22, { ac: true, ab: true, cls: 'center' }); const labT = T(lab, L('loadingRes'), 28, [1, 1, 1, 1], 'tt');
  const bar = X(scr, 396, 672, 488, 9, { ac: true, ab: true, spr: 'Login/Login_Loading_Gauge_Bg', sl: true, n: 'titleBar' });
  const fill = X(bar, 0, -7, 0, 24, { spr: 'Login/Login_Loading_Gauge_Fill', sl: true });
  let done = 0; const total = Math.max(1, preload.length);
  const step = () => { done++; fill.style.width = Math.max(44, 976 * done / total) + 'px'; scr.dataset.progress = (done / total).toFixed(2); };
  await Promise.all(preload.map(p => Promise.resolve(p).catch(e => (window.__wosErrors = window.__wosErrors || []).push('intro preload: ' + (e && e.message || e))).then(step)));
  await sleep(250);
  bar.remove(); labT.textContent = L('touch'); labT.classList.add('pulse'); lab.dataset.ui = 'touch';
  scr.dataset.ready = '1';
  await new Promise(res => {
    const go = e => { if (e.type === 'keydown' && !/Space|Enter|NumpadEnter/.test(e.code)) return; removeEventListener('keydown', go, true); scr.removeEventListener('pointerdown', go); res(); };
    scr.addEventListener('pointerdown', go); addEventListener('keydown', go, true);
  });
  return { close() { scr.remove(); v.pause(); v.removeAttribute('src'); v.remove(); } };
}

// ------------------------------------------------------------------ phòng trước gương + avatar
function room(layer) {
  const bg = document.createElement('div'); bg.className = 'u roombg'; bg.dataset.ui = 'room';
  const im = media('img', uiUrl('Customize/Customize_Bg')); im.className = 'bgimg'; bg.appendChild(im);
  layer.root.appendChild(bg);
  // Background: cao 1440 đơn vị ở giữa màn (giữ tỉ lệ 16:9). Màn cao hơn / rộng hơn thì phóng cho phủ kín.
  const fit = () => {
    const h = Math.max(1440, layer.H, layer.W * 2160 / 3840), w = h * 3840 / 2160;
    Object.assign(bg.style, { width: w + 'px', height: h + 'px', left: (layer.W - w) / 2 + 'px', top: (layer.H - h) / 2 + 'px' });
    bg._k = h / 1440;
  };
  fit(); layer.subs.add(fit);
  return { el: bg, fit, remove() { layer.subs.delete(fit); bg.remove(); } };
}

// Gương: RawImage (-436, 60) 880x880 đơn vị so với tâm Background (gốc: camera riêng chụp avatar vào RenderTexture)
function mirror(layer, bg, renderer) {
  const cv = renderer.domElement; cv.className = 'mirror'; cv.dataset.ui = 'mirror';
  bg.el.appendChild(cv);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(20, 1, 0.05, 50);
  let avatar = null, last = performance.now(), raf = 0, h = 1;
  const place = () => {
    const k = bg.el._k || 1, size = 880 * k, w = parseFloat(bg.el.style.width), hh = parseFloat(bg.el.style.height);
    Object.assign(cv.style, { width: size + 'px', height: size + 'px', left: (w / 2 - 436 * k - size / 2) + 'px', top: (hh / 2 - 60 * k - size / 2) + 'px' });
    const px = Math.max(64, Math.round(size * layer.s * Math.min(devicePixelRatio || 1, 2)));
    renderer.setPixelRatio(1); renderer.setSize(px, px, false);
  };
  place(); layer.subs.add(place);
  // [ĐO TRONG ẢNH] g6: avatar cao 195 px trong RawImage 440 px (0.443), tâm dọc ở 0.64 từ mép trên
  const frame = () => {
    if (!avatar) return;
    avatar.object.position.set(0, 0, 0); avatar.object.rotation.set(0, Math.PI, 0); avatar.object.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(avatar.object); h = Math.max(0.3, bb.max.y - bb.min.y);
    const Hv = h / 0.443, d = Hv / 2 / Math.tan(10 * Math.PI / 180);
    const cy = (bb.min.y + bb.max.y) / 2 + (0.64 - 0.5) * Hv;
    cam.position.set(0, cy, -d); cam.lookAt(0, cy, 0);
  };
  const tick = now => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (avatar) avatar.update(dt);
    renderer.setClearColor(0x000000, 0); renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(tick);
  let gen = 0;
  return {
    async show(look) {
      const my = ++gen;
      const a = await buildAvatar(look);
      if (my !== gen) return avatar;
      if (avatar) scene.remove(avatar.object);
      avatar = a; scene.add(a.object); frame();
      cv.dataset.look = JSON.stringify(a.look);
      return a;
    },
    get avatar() { return avatar; }, el: cv,
    stop() { cancelAnimationFrame(raf); layer.subs.delete(place); cv.remove(); },
  };
}

// ------------------------------------------------------------------ Nickname Setting (g4) + Notice (g5)
async function nickname(layer) {
  for (;;) {
    const root = X(layer.root, 0, 0, null, null, { cls: 'full', n: 'nick' });
    const box = panel(root, 672, 207, 446, 320, { ac: true, am: true });
    const tp = X(box, 105, -25, 236, 61, { spr: 'Common/Popup_Title_01', cls: 'center' }); T(tp, L('nickTitle'), 44, [1, 1, 1, 1], 'ttl');
    const c = X(box, 0, 80, 446, 26, { cls: 'center' }); T(c, L('nickContent'), 37, NAVY2);
    const fld = X(box, 36, 123, 375, 65, { spr: 'RankingPopup/Ranking_SlotBG', col: [0.835, 0.925, 1, 0.8], sl: true, cls: 'center' });
    const inp = document.createElement('input'); inp.className = 'nickin'; inp.maxLength = 18; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.placeholder = L('nickHolder', { Length: 18 }); inp.dataset.ui = 'nickInput'; fld.appendChild(inp);
    const ok = button(box, 166, 236, 117, 60, L('done'), true, { n: 'nickDone' });
    const fixed = X(root, 672, 550, 446, 20, { ac: true, am: true, cls: 'center' }); T(fixed, L('nickFixed'), 26, [0.85, 0.85, 0.85, 1]);
    setTimeout(() => inp.focus(), 50);
    const name = await new Promise(res => {
      const submit = () => {
        const v = inp.value.trim();
        if (!v) { toast(layer, L('nickEmpty')); inp.focus(); return; }
        inp.removeEventListener('keydown', key); res(v);
      };
      const key = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); submit(); } };
      inp.addEventListener('keydown', key);
      onTap(ok, submit);
    });
    inp.blur();
    const yes = await notice(layer, { body: name + '\n' + L('nickConfirm'), buttons: [{ t: L('cancel'), v: false }, { t: L('confirm'), v: true, green: true }], n: 'nickConfirm' });
    root.remove();
    if (yes) { toast(layer, L('registered')); return name; }
  }
}

// ------------------------------------------------------------------ CustomizeUI (cust1..6, g6, g7)
const TABS = [
  { k: 'gender', icon: 'Category_Customize_01_Gender' },
  { k: 'skin', icon: 'Category_Customize_02_Skin' },
  { k: 'hair', icon: 'Category_Customize_03_Hair' },
  { k: 'hairColor', icon: 'Category_Customize_04_HairColor' },
  { k: 'face', icon: 'Category_Customize_05_Face' },
  { k: 'lens', icon: 'Category_Customize_06_Lens' },
  { k: 'acc', icon: 'Category_Customize_07_Decal' },
];
const two = n => String(n).padStart(2, '0');
const thumb = (k, i, g) => 'CustomizeUI/Customize_Thumb_' + ({
  skin: 'Skin_' + two(i), hair: 'Hair_' + (g === 'man' ? 'M' : 'F') + '_' + two(i + 1), hairColor: 'HairColor_' + two(i + 1),
  face: 'Face_' + (g === 'man' ? 'M' : 'F') + '_' + two(i + 1), lens: 'Lens_' + two(i + 1), acc: 'Decal_' + two(i + 1) }[k]);

const KEEP = [];
function preloadThumbs() {   // tải sẵn mọi thumb + icon tab: đổi tab không còn ô trống chờ ảnh
  const keys = [];
  for (const t of TABS) keys.push('CustomizeUI/' + t.icon + 'ON', 'CustomizeUI/' + t.icon + 'OFF');
  for (const g of ['man', 'woman']) for (const k of ['skin', 'hair', 'hairColor', 'face', 'lens', 'acc']) for (let i = 0; i < COUNTS[k]; i++) keys.push(thumb(k, k === 'skin' ? i + 1 : i, g));
  keys.push('CustomizeUI/Customize_Thumb_Gender_M', 'CustomizeUI/Customize_Thumb_Gender_F', 'CustomizeUI/Frame_Customize_Box', 'Common/Ui_Frame_Outline');
  for (const k of new Set(keys)) { const im = new Image(); im.src = uiUrl(k); KEEP.push(im); }
}
async function customize(layer, mir, look0) {
  let look = normLook(look0), tab = 0;
  const ui = X(layer.root, 0, 0, null, null, { cls: 'full', n: 'customize' });
  X(ui, 0, 0, null, null, { cls: 'dimR' });   // Dim: Ui_Gradient_Horizontal_02 phải -> trái, màu (0.181, 0.305, 0.358, 0.4)
  // thanh tab: x 625..1113, y 181..229 (Left 61 + Middle 73 x5 + Right 61) [ĐO TRONG ẢNH] cust1
  const bar = X(ui, 625, 181, 488, 48, { ac: true, am: true, cls: 'row', n: 'tabs' });
  const W = [61, 73, 73, 73, 73, 73, 61];
  const tabEls = TABS.map((t, i) => {
    const spr = i === 0 ? 'Category/Category_BG_Left' : i === 6 ? 'Category/Category_BG_Right' : 'Category/Category_BG_Middle_Horizontal';
    const x = W.slice(0, i).reduce((a, b) => a + b, 0);
    const cell = X(bar, x, 0, W[i], 48, { spr, col: [1, 1, 1, 0.784], cls: 'btn', n: 'tab' }); cell.dataset.k = t.k;
    const ic = X(cell, (W[i] - 40) / 2 + (i === 0 ? -3.4 : i === 6 ? 3.4 : 0), 4, 40, 40, {}); ic.className += ' ticon';
    cell._ic = ic; onTap(cell, () => setTab(i));
    return cell;
  });
  const desc = X(ui, 0, 0, null, 26, { ac: true, am: true, cls: 'tabdesc center', n: 'tabDesc' });
  const descT = T(desc, '', 30, [0.737, 0.954, 1, 1]);
  const grid = X(ui, 641, 248, 472, 280, { ac: true, am: true, n: 'grid' });
  const rnd = X(ui, 35, 609, 74, 74, { ab: true, spr: 'CustomizeUI/Btn_Customize_Random', cls: 'btn', n: 'random' });
  const rl = X(rnd, -30, 60, 134, 20, { cls: 'center' }); T(rl, L('random'), 34, [1, 1, 1, 1], 'outline');
  const done = button(ui, 1070, 619, 165, 62, L('done'), true, { ar: true, ab: true, n: 'done' });

  const apply = async (patch, rebuild) => {
    look = normLook({ ...look, ...patch });
    if (rebuild || !mir.avatar) await mir.show(look);
    else { mir.avatar.setLook(look); mir.avatar.look = look; }
    ui.dataset.look = JSON.stringify(look);
    draw();
  };
  const draw = () => {
    tabEls.forEach((c, i) => {
      const on = i === tab; c.classList.toggle('on', on);
      c._ic.querySelectorAll('.spr').forEach(s => s.remove()); paint(c._ic, 'CustomizeUI/' + TABS[i].icon + (on ? 'ON' : 'OFF'));
    });
    const c = tabEls[tab]; descT.textContent = L(TABS[tab].k);
    const cx = 625 + W.slice(0, tab).reduce((a, b) => a + b, 0) + W[tab] / 2;
    desc.style.left = `calc(50% + ${(cx - 640) * 2}px)`; desc.style.top = `calc(50% + ${(157 - 360) * 2}px)`;
    grid.innerHTML = '';
    const k = TABS[tab].k;
    if (k === 'gender') {
      for (const [i, g] of [['man', 'M'], ['woman', 'F']].entries()) {
        const on = look.gender === g[0];
        // [ĐO TRONG ẢNH] g6: thẻ nam x 648..860, nữ 885..1097, đáy y 532, đỉnh tóc y 250 (ảnh bị kéo ngang như Icon 540x600)
        const card = X(grid, i === 0 ? -29 : 208, -22, 285, 306, { cls: 'btn gcard' + (on ? ' on' : ''), n: 'opt' });
        card.dataset.v = g[0];
        X(card, 0, 0, 285, 306, { spr: 'CustomizeUI/Customize_Thumb_Gender_' + g[1], col: on ? null : [0.658, 0.619, 0.717, 1] });
        onTap(card, () => { if (look.gender !== g[0]) apply({ gender: g[0] }, true); });
      }
      return;
    }
    const n = COUNTS[k];
    for (let i = 0; i < n; i++) {
      const v = k === 'skin' ? i + 1 : i, on = look[k] === v;
      const cell = X(grid, (i % 4) * 118, Math.floor(i / 4) * 97, 107, 84, { spr: 'CustomizeUI/Frame_Customize_Box', cls: 'btn opt' + (on ? ' on' : ''), n: 'opt' });
      cell.dataset.v = String(v);
      X(cell, 6.5, -5, 94, 94, { spr: thumb(k, v, look.gender) });
      if (on) X(cell, -4, -3, 115, 90, { spr: 'Common/Ui_Frame_Outline', sl: true, cls: 'sel' });
      onTap(cell, () => apply({ [k]: v }, k === 'hair' || k === 'face'));
    }
  };
  const setTab = i => { tab = i; draw(); };
  onTap(rnd, () => apply(randomLook(), true));
  await apply({}, true);
  layer.box.dataset.stage = 'customize';
  for (;;) {
    await new Promise(res => onTap(done, res));
    const yes = await notice(layer, { body: L('lookConfirm'), buttons: [{ t: L('cancel'), v: false }, { t: L('confirm'), v: true, green: true }], n: 'lookConfirm' });
    if (yes) break;
  }
  ui.remove();
  return look;
}

// Toàn bộ: phòng + đặt tên + tạo nhân vật. Trả { name, look }.
export async function createCharacter(layer, renderer, { skipName } = {}) {
  const bg = room(layer);
  preloadThumbs();
  const mir = mirror(layer, bg, renderer);
  mir.show(DEFAULT_LOOK); mir.el.style.visibility = 'hidden';   // g4/g5: gương chưa có avatar lúc đặt tên
  layer.box.dataset.stage = 'nick';
  const name = skipName || await nickname(layer);
  mir.el.style.visibility = '';
  const look = await customize(layer, mir, DEFAULT_LOOK);
  await sleep(700);   // 0:30: giao diện tắt, còn gương, rồi tối dần (0:33)
  layer.box.classList.add('fadeout'); await sleep(600);
  mir.stop(); bg.remove(); layer.box.classList.remove('fadeout');
  return { name, look };
}
