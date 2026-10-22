// Khung chung cho các màn mở đầu: lớp #intro phủ toàn màn, gốc canvas đơn vị prefab (cao 1080) scale theo
// SMUniformCanvasScaler (hud.js uiScale) như HUD; X() đặt phần tử theo toạ độ ảnh chụp 1280x720 (K = 2 đơn vị / px,
// giống js/ui/story.js) với neo trái / giữa / phải; popup Notice / Nickname theo prefab CommonPopup / CommonInputPopup.
import { paint, BORDER } from '../ui/sprites.js?v=20261022c';
import { uiScale, css } from '../ui/hud.js?v=20261022c';
import { L } from './text.js?v=20261022c';

// viền 9-slice của sprite dùng ở đây (ui/index.json border [l, b, r, t]) chưa có trong BORDER của HUD
Object.assign(BORDER, {
  'RankingPopup/Ranking_SlotBG': [69, 0, 69, 0],
  'Common/Ui_Bg_Rectangle_Round_02_20px': [8, 0, 10, 0],
  'Common/Ui_Frame_Outline': [60, 60, 60, 60],
  'Login/Login_Btn_Social_Discord': [100, 124, 100, 80],
});

export const NAVY = [0.086, 0.271, 0.424, 1], NAVY2 = [0.157, 0.376, 0.557, 1];
export const K = 2;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const errs = () => (window.__wosErrors = window.__wosErrors || []);

// Lớp phủ: #intro (px màn) > .iroot (đơn vị canvas, scale s). Trả { box, root, s, W, H, relayout, destroy }.
export function makeLayer(desktop) {
  const box = document.createElement('div'); box.id = 'intro'; box.dataset.desktop = desktop ? '1' : '0';
  const root = document.createElement('div'); root.className = 'iroot'; box.appendChild(root);
  document.body.appendChild(box);
  const L0 = { box, root, s: 1, W: 0, H: 0, subs: new Set() };
  L0.relayout = () => {
    const s = uiScale(desktop); L0.s = s; L0.W = innerWidth / s; L0.H = innerHeight / s;
    Object.assign(root.style, { width: L0.W + 'px', height: L0.H + 'px', transform: `scale(${s})` });
    for (const f of L0.subs) f();
  };
  L0.relayout(); addEventListener('resize', L0.relayout);
  L0.destroy = () => { removeEventListener('resize', L0.relayout); box.remove(); };
  return L0;
}

// (x, y) góc trái trên, (w, h) cỡ theo px ảnh 1280x720; o.ar neo mép phải, o.ac neo giữa ngang, o.ab neo đáy, o.am giữa dọc
export function X(parent, x, y, w, h, o = {}) {
  const e = document.createElement(o.tag || 'div'); e.className = 'u' + (o.cls ? ' ' + o.cls : '');
  const s = e.style;
  s.left = o.ar ? `calc(100% - ${(1280 - x) * K}px)` : o.ac ? `calc(50% + ${(x - 640) * K}px)` : x * K + 'px';
  s.top = o.ab ? `calc(100% - ${(720 - y) * K}px)` : o.am ? `calc(50% + ${(y - 360) * K}px)` : y * K + 'px';
  if (w != null) s.width = w * K + 'px'; if (h != null) s.height = h * K + 'px';
  if (o.spr) paint(e, o.spr, { color: o.col, sliced: o.sl });
  if (o.n) e.dataset.ui = o.n;
  parent.appendChild(e); return e;
}
export function T(parent, str, size, color = [1, 1, 1, 1], cls = '') {
  const e = document.createElement('span'); e.className = 'txt ' + cls; e.style.fontSize = size + 'px'; e.style.color = css(color);
  e.textContent = str; parent.appendChild(e); return e;
}
// Popup_01_Small có lề trong suốt 60/40/60/63 px quanh thân (bẫy 31 ARCH.md): (x, y, w, h) là thân thấy được
const MARGIN = [60, 40, 60, 63];
export function panel(parent, x, y, w, h, o = {}) {
  const [l, t, r, b] = MARGIN.map(v => v / K);
  const outer = X(parent, x - l, y - t, w + l + r, h + t + b, { ...o, spr: 'Container/Popup_01_Small', sl: true });
  const inner = X(outer, l, t, w, h, {});
  X(inner, w / 2 - 80, h / 2 - 115, 160, 147, { spr: 'Common/Popup_Bg_Symbol_01', cls: 'sym' });   // SymbolImage (0, 74) 321x295
  return inner;
}
export function button(parent, x, y, w, h, label, green, o = {}) {
  const b = X(parent, x, y, w, h, { ...o, spr: green ? (w > 140 ? 'Common/Btn_Square_01_Large_Green' : 'Common/Btn_Square_01_Medium_Green') : 'Common/Btn_Square_01_Medium_Blue', cls: 'btn center ' + (o.cls || '') });
  T(b, label, 46, NAVY, 'btxt');
  return b;
}
export function onTap(el, fn) {
  el.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); fn(e); });
}

// Notice (CommonPopup): tiêu đề + nội dung + nút. Trả Promise giá trị nút. Esc = nút đầu, Space/Enter = nút cuối.
// cx: tâm ngang theo px ảnh (g5/g7: 640).
export function notice(layer, { title = L('notice'), body, buttons, cx = 640, n = 'notice' }) {
  return new Promise(res => {
    const root = X(layer.root, 0, 0, null, null, { cls: 'full', n });
    const box = panel(root, cx - 222, 208, 445, 320, { ac: true, am: true });
    const tp = X(box, 102, -25, 240, 61, { spr: 'Common/Popup_Title_01', cls: 'center' }); T(tp, title, 44, [1, 1, 1, 1], 'ttl');
    const bd = X(box, 26, 82, 393, 130, { cls: 'center wrap' }); T(bd, body, 39, NAVY2, 'body');   // [ĐO TRONG ẢNH] g5/g7: chữ ~19 px
    const btns = buttons || [{ t: L('yes'), v: true, green: true }];
    const bw = 116, gap = 30, x0 = (445 - (btns.length * bw + (btns.length - 1) * gap)) / 2;
    const finish = v => { removeEventListener('keydown', key, true); root.remove(); res(v); };
    btns.forEach((b, i) => {
      const el = button(box, x0 + i * (bw + gap), 234, bw, 60, b.t, b.green, { n: 'popupBtn' });
      el.dataset.v = String(b.v); onTap(el, () => finish(b.v));
    });
    const key = e => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(btns[0].v); }
      else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); finish(btns[btns.length - 1].v); }
    };
    addEventListener('keydown', key, true);
  });
}

// băng chữ ngắn giữa trên (Registration succeeded! ở 0:09)
export function toast(layer, msg, ms = 1800) {
  const t = X(layer.root, 440, 120, 400, 34, { ac: true, cls: 'toast center', n: 'toast' }); T(t, msg, 30);
  setTimeout(() => t.classList.add('out'), ms - 400); setTimeout(() => t.remove(), ms);
}

// Nút Skip (ui_common SkipBTN: neo phải trên (-160, -140), 80x80, Btn_Square_07 + Icon_Skip, chữ dưới)
export function skipButton(parent, fn) {
  const b = document.createElement('div'); b.className = 'u btn skipbtn'; b.dataset.ui = 'skip';
  Object.assign(b.style, { right: (160 - 40) + 'px', top: (140 - 40) + 'px', width: '80px', height: '80px' });
  paint(b, 'Common/Btn_Square_07');
  const ic = document.createElement('div'); ic.className = 'u'; Object.assign(ic.style, { left: '15px', top: '15px', width: '50px', height: '50px' }); paint(ic, 'Icon/Icon_Skip'); b.appendChild(ic);
  const tx = document.createElement('div'); tx.className = 'u center'; Object.assign(tx.style, { left: '-60px', top: '95px', width: '200px', height: '50px' });
  T(tx, L('skip'), 36); b.appendChild(tx);
  onTap(b, fn); parent.appendChild(b); return b;
}

// ảnh/video từ repo asset; lỗi tải ghi __wosErrors
export function media(tag, src, cls) {
  const e = document.createElement(tag); if (cls) e.className = cls;
  if (tag === 'img') { e.draggable = false; e.alt = ''; e.decoding = 'async'; }
  e.onerror = () => errs().push('intro media load failed: ' + src);
  e.src = src; return e;
}
