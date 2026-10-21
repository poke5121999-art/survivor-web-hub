// Sprite giao diện từ repo asset (ui/<folder>/<name>.webp). Viền 9-slice chép từ ui/index.json ([l, b, r, t] px của
// ảnh đã bóc) cho đúng những sprite HUD dùng, để không phải tải index.json 545 KB lúc vào game.
// Image.color của Unity nhân màu vào sprite: CSS không nhân được nên `tinted()` nhân sẵn trên canvas rồi trả blob URL.
import { assetUrl } from '../assets.js?v=20261021b';

export const BORDER = {
  'Common/Ui_Bg_Round_01_32px': [15, 15, 16, 16],
  'Common/Ui_Bg_Round_01_54px': [28, 27, 27, 26],
  'Common/bg_common_badge_red_60px': [30, 0, 27, 0],
  'Common/Ui_Bg_Round_02_Medium_32px': [31, 0, 31, 0],
  'Game/UI_Gauge_BG01_1': [10, 9, 10, 9],
  'Game/UI_Gauge_BG01_2': [10, 9, 10, 9],
  'Game/UI_Gauge_BG02_1': [7, 6, 7, 6],
  'Game/UI_Gauge_HP': [6, 6, 6, 6],
  'Game/UI_Gauge_HP_Small': [4, 4, 4, 4],
  'Game/UI_Gauge_MP': [4, 4, 4, 4],
  'Game/UI_Gauge_Stamina': [4, 4, 4, 4],
  'Game/UI_PlayScene_QuestBG': [339, 24, 22, 24],
  'Game/UI_PlayerInfo_BG_Lv': [29, 0, 29, 0],
  'Login/Login_Loading_Gauge_Bg': [8, 0, 8, 0],
  'Login/Login_Loading_Gauge_Fill': [22, 0, 22, 0],
};

export const uiUrl = key => assetUrl('ui/' + key + '.webp');
export const used = new Set();            // mọi sprite HUD đã xin, để test đếm và kiểm 404

const isWhite = c => !c || (c[0] >= 0.999 && c[1] >= 0.999 && c[2] >= 0.999);
const cache = new Map();
const errors = () => (window.__wosErrors = window.__wosErrors || []);

function loadImg(url) {
  return new Promise((res, rej) => {
    const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => { errors().push('ui sprite load failed: ' + url); rej(new Error('ui sprite load failed: ' + url)); };
    im.src = url;
  });
}

// URL đã nhân màu (rgb, alpha giữ cho CSS opacity). Màu trắng thì trả thẳng URL gốc.
export function tinted(key, color) {
  used.add(key);
  const url = uiUrl(key);
  if (isWhite(color)) return Promise.resolve(url);
  const k = key + '|' + color.slice(0, 3).join(',');
  if (!cache.has(k)) cache.set(k, loadImg(url).then(im => {
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { p[i] *= color[0]; p[i + 1] *= color[1]; p[i + 2] *= color[2]; }
    g.putImageData(d, 0, 0);
    return new Promise(r => c.toBlob(b => r(URL.createObjectURL(b)), 'image/png'));
  }).catch(() => url));
  return cache.get(k);
}

// Gắn sprite vào phần tử: một lớp <i class="spr"> phủ kín phần tử (để alpha của Image.color không làm mờ con).
// type 0 (simple) = background co giãn, type 1 (sliced) = border-image theo BORDER. Trả về lớp sprite.
export function paint(el, key, { color, sliced = false } = {}) {
  const sp = document.createElement('i'); sp.className = 'spr';
  el.insertBefore(sp, el.firstChild);
  if (color && color[3] != null && color[3] < 1) sp.style.opacity = String(color[3]);
  sp.dataset.sprite = key;
  tinted(key, color).then(url => {
    const b = BORDER[key];
    if (sliced && b && b.some(v => v > 0)) {
      const [l, bo, r, t] = b;
      sp.style.borderStyle = 'solid';
      sp.style.borderWidth = `${t}px ${r}px ${bo}px ${l}px`;
      sp.style.borderImage = `url("${url}") ${t} ${r} ${bo} ${l} fill / ${t}px ${r}px ${bo}px ${l}px stretch`;
    } else {
      sp.style.backgroundImage = `url("${url}")`;
      sp.style.backgroundSize = '100% 100%';
    }
  });
  return sp;
}
