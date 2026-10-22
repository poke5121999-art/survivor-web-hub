// Sprite giao diện từ repo asset (ui/<folder>/<name>.webp). Viền 9-slice chép từ ui/index.json ([l, b, r, t] px của
// ảnh đã bóc) cho đúng những sprite HUD dùng, để không phải tải index.json 545 KB lúc vào game.
// Image.color của Unity nhân màu vào sprite: CSS không nhân được nên `tinted()` nhân sẵn trên canvas rồi trả blob URL.
import { assetUrl } from '../assets.js?v=20261022b';

export const BORDER = {
  'Common/Ui_Bg_Round_01_32px': [15, 15, 16, 16],
  'Common/Ui_Bg_Round_01_54px': [28, 27, 27, 26],   // 54 px: l + r = 55 > 54 (tâm âm) -> sliceCanvas kéo dãn dải giữa như Unity
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
  // hội thoại, nhiệm vụ, bảng (js/ui/story.js)
  'DialogueUI/Dialogue_Frame_Round': [192, 192, 192, 192],   // ảnh 384: viền 192 x2 không còn tâm (sliceCanvas kéo dãn dải giữa)
  'DialogueUI/Dialogue_List_Unpressed': [52, 46, 52, 46],   // 104x92: cũng không còn tâm
  'DialogueUI/Dialogue_List_Pressed': [52, 46, 52, 46],
  'Common/Ui_Bg_Rectangle_Round_05_Medium': [27, 0, 30, 0],
  'Container/Popup_01_Medium': [148, 183, 148, 127],
  'Container/Popup_01_Small': [200, 200, 200, 160],
  'Container/UI_BG_16px': [4, 4, 4, 4],
  'Common/Btn_Square_03_Large': [58, 0, 58, 0],
  'Common/Btn_Square_03_Medium': [37, 0, 40, 0],
  'Common/Ui_Bg_Rectangle_Round_02_68px': [26, 0, 27, 0],
  'Common/Ui_Bg_Round_02_Medium_54px': [54, 0, 54, 0],
  'Common/Btn_Square_02_Small_Blue': [36, 0, 104, 0],
  'Levelup/Ui_LevelUp_Bg': [0, 14, 0, 14],
  'MapText/UI_Map_Reveal_Paper_Outline': [45, 0, 45, 0],
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

// 9-slice vẽ ra canvas đúng cỡ phần tử (thay cho CSS border-image): border-image để lộ đường nối giữa các mảnh khi #hud
// bị scale, và để trống tâm khi viền chiếm hết ảnh (Dialogue_Frame_Round 384 viền 192x2, Ui_Bg_Round_01_54px). Unity
// kéo dãn dải giữa trong trường hợp đó và co viền theo tỉ lệ khi viền lớn hơn rect: làm y như vậy.
const imgCache = new Map();
const imgOf = url => imgCache.get(url) || (imgCache.set(url, loadImg(url)), imgCache.get(url));
// vẽ ở khung hình sau (rAF) và quan sát border-box: đổi viền trong callback làm ResizeObserver báo "loop completed"
const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(es => { const t = es.map(e => e.target); requestAnimationFrame(() => t.forEach(drawSlice)); }) : null;
function drawSlice(sp) {
  const im = sp._im, cv = sp._cv; if (!im || !cv) return;
  const w = Math.round(sp.offsetWidth), h = Math.round(sp.offsetHeight);
  if (w < 1 || h < 1 || (sp._w === w && sp._h === h)) return;
  sp._w = w; sp._h = h;
  const iw = im.naturalWidth, ih = im.naturalHeight;
  let [l, bo, r, t] = sp._b;
  if (l + r >= iw) { const k = (iw - 1) / (l + r); l *= k; r *= k; }      // nguồn: tâm >= 1 px
  if (t + bo >= ih) { const k = (ih - 1) / (t + bo); t *= k; bo *= k; }
  const kx = Math.min(1, w / (l + r || 1)), ky = Math.min(1, h / (t + bo || 1));
  const dl = l * kx, dr = r * kx, dt = t * ky, db = bo * ky;
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const sx = [0, l, iw - r, iw], dx = [0, dl, w - dr, w], sy = [0, t, ih - bo, ih], dy = [0, dt, h - db, h];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const sw = sx[i + 1] - sx[i], sh = sy[j + 1] - sy[j], ww = dx[i + 1] - dx[i], hh = dy[j + 1] - dy[j];
    if (sw > 0 && sh > 0 && ww > 0 && hh > 0) g.drawImage(im, sx[i], sy[j], sw, sh, dx[i], dy[j], ww + (i < 2 ? 0.5 : 0), hh + (j < 2 ? 0.5 : 0));
  }
  sp.style.borderImage = 'none'; sp.style.borderWidth = '0';
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
      imgOf(url).then(im => {
        sp._im = im; sp._b = b; sp._cv = document.createElement('canvas'); sp._cv.className = 'slice'; sp.appendChild(sp._cv);
        if (ro) ro.observe(sp, { box: 'border-box' }); requestAnimationFrame(() => drawSlice(sp));
      }).catch(() => {});
    } else {
      sp.style.backgroundImage = `url("${url}")`;
      sp.style.backgroundSize = '100% 100%';
    }
  });
  return sp;
}
