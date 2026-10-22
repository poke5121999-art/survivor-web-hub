// Phần mở đầu của bản web (pha F2), theo thứ tự clip DcGavHFwqtk 0:00-1:12 (docs/research/QUESTLINE.md "Vào game"):
//   Touch To Start -> (chưa có nhân vật) Nickname Setting -> tạo nhân vật trước gương -> truyện tranh -> chọn ba lô
//   (slime khởi đầu) -> phim tỉnh dậy -> game (quán trọ 257, nhiệm vụ 1).
// Đã có nhân vật (bản lưu có `profile`) thì Touch To Start vào thẳng game. `?intro=0` bỏ hẳn phần mở đầu (test cũ, chụp so).
// `?intro=nick|custom|comic|pack|film` nhảy thẳng tới một màn để chụp so ảnh (không ghi bản lưu khi chưa đi hết).
//
// Bản lưu: localStorage['wos.save'].profile = { name, look (avatar.js), slime, bag, at } qua loadSave/writeSave của
// js/state.js. Ghi trước khi js/quest/engine.js đọc bản lưu (engine giữ trường lạ khi ghi lại).
import * as THREE from 'three';
import { REV, PARAMS } from '../config.js?v=20261022c';
import { loadJSON, loadGLB } from '../assets.js?v=20261022c';
import { loadSave, writeSave, SAVE_VERSION, state } from '../state.js?v=20261022c';
import { makeLayer } from './ui.js?v=20261022c';
import { titleScreen, createCharacter } from './screens.js?v=20261022c';
import { comic, pickBackpack, wakeFilm, BAGS } from './prologue.js?v=20261022c';
import { buildAvatar, normLook, DEFAULT_LOOK } from './avatar.js?v=20261022c';
import { attachSetting } from './setting.js?v=20261022c';
import { uiUrl } from '../ui/sprites.js?v=20261022c';

export { attachSetting };

const START_GOLD = 10000;   // như js/quest/engine.js (Vàng mở đầu [ĐO TRONG CLIP]); chỉ dùng khi chưa có bản lưu
export function readProfile() {
  const s = loadSave(START_GOLD);
  return s && s.profile && s.profile.look ? s.profile : null;
}
export function writeProfile(profile) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('wos.save') || 'null'); } catch (e) { s = null; }
  if (!s || s.v !== SAVE_VERSION) s = { v: SAVE_VERSION };
  s.profile = profile;
  return writeSave(s);
}

function loadCss() {
  return new Promise(res => {
    const href = new URL('css/intro.css?v=' + REV, location.href).href;
    if ([...document.styleSheets].some(x => x.href === href)) return res();
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
    l.onload = res; l.onerror = () => { (window.__wosErrors = window.__wosErrors || []).push('intro css load failed'); res(); };
    document.head.appendChild(l);
  });
}
// sprite popup/nút: tải trước để Notice không hiện nút trống lúc mạng chậm
const POPUP_SPR = ['Container/Popup_01_Small', 'Common/Popup_Title_01', 'Common/Popup_Bg_Symbol_01', 'Common/Btn_Square_01_Medium_Blue',
  'Common/Btn_Square_01_Medium_Green', 'Common/Btn_Square_01_Large_Green', 'RankingPopup/Ranking_SlotBG'];
const preImg = url => new Promise(res => { const im = new Image(); im.onload = im.onerror = () => res(im); im.src = url; });

// Chạy phần mở đầu. Trả profile (null khi ?intro=0: game dùng avatar mặc định như trước).
export async function runIntro(platform) {
  const mode = PARAMS.get('intro');
  if (mode === '0') return null;
  await loadCss();
  const desktop = platform === 'pc';
  const layer = makeLayer(desktop);
  const W = window.WOS_INTRO = { stage: 'title', layer, profile: null };
  let renderer = null;
  const getRenderer = () => renderer || (renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: PARAMS.has('shot') }));
  try {
    let profile = readProfile();
    const jump = mode && mode !== '1' ? mode : null;
    const fresh = !profile || jump;
    // tải trước những thứ màn kế cần (thanh "Loading resources" chạy theo số việc xong)
    const pre = fresh
      ? [loadJSON('player/index.json'), preImg(uiUrl('Customize/Customize_Bg')), loadGLB('player/PC_Man_BaseRig.glb'), loadGLB('player/anim_man.glb'),
         ...POPUP_SPR.map(k => preImg(uiUrl(k)))]
      : [loadJSON('player/index.json'), loadJSON('slime/index.json')];
    if (!jump || jump === 'title') {
      W.stage = 'title';
      const t = await titleScreen(layer, { preload: pre });
      t.close();
    }
    if (profile && !jump) { layer.destroy(); W.stage = 'done'; W.profile = profile; return profile; }
    let name = profile ? profile.name : null, look = profile ? normLook(profile.look) : normLook(DEFAULT_LOOK), bag = BAGS[0];
    const order = ['title', 'nick', 'custom', 'comic', 'pack', 'film'];
    const from = Math.max(0, order.indexOf(jump || 'title'));
    if (from <= 2) {
      W.stage = 'nick';
      const r = await createCharacter(layer, getRenderer(), { skipName: from === 2 ? (name || PARAMS.get('name') || 'TamSlime') : null });
      name = r.name; look = r.look;
    }
    W.look = look; W.name = name;
    if (from <= 3) { W.stage = 'comic'; await comic(layer, look.gender); }
    if (from <= 4) { W.stage = 'pack'; bag = await pickBackpack(layer, getRenderer()); }
    profile = { name: name || 'TamSlime', look, slime: bag.slime, bag: bag.id, at: new Date().toISOString() };
    if (!jump || from <= 2) writeProfile(profile);   // chỉ ghi khi đi đủ đặt tên + tạo nhân vật
    W.profile = profile;
    if (from <= 5) { W.stage = 'film'; W.film = await wakeFilm(layer); }
    layer.destroy(); W.stage = 'done';
    return profile;
  } finally {
    if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
  }
}

// Avatar trong game theo profile (thay Player.create(gender) của game.js); null profile = mặc định
export function avatarFor(profile) { return buildAvatar(profile && profile.look); }
// tên người chơi và slime đồng hành theo profile vào kho trạng thái HUD
export function applyProfile(profile) {
  if (!profile) return;
  state.player.name = profile.name;
}
