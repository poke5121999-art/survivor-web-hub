// Menu kit shared by the home screen (home.js), the meta menus (menus.js) and the tournament page (race.js).
// - Per-screen sprite sheets from tools/build_menus.py (art/m-<screen>.webp + data/m-<screen>.json), fetched the first
//   time that screen opens.
// - Layout in reference units: CanvasScaler 750 x 1334 matched to the height, so 1 unit = 100vh / 1334 (`--u`).
// - Labels in the game's Junegull font (a canvas drawn from art/font.webp) when every letter is in the font; the font has
//   no Vietnamese letters, so Vietnamese labels use a system font with the same dark-blue outline (TMP "DarkBlue").

const sheets = {};
// `app.V` is the build's ?v= query.
export function sheet(app, screen) {
  sheets[screen] ||= Promise.all([
    fetch('./data/m-' + screen + '.json' + app.V).then((r) => { if (!r.ok) throw new Error('m-' + screen + '.json ' + r.status); return r.json(); }),
    new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('m-' + screen + '.webp')); i.src = './art/m-' + screen + '.webp' + app.V; }),
  ]).then(([rects, img]) => ({ rects, img, url: img.src }));
  return sheets[screen];
}

let styled = false;
export function kitStyle() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
:root { --u: calc(100vh / 1334); }
@supports (height: 100dvh) { :root { --u: calc(100dvh / 1334); } }
.k-abs { position: absolute; }
.k-sp { background-repeat: no-repeat; }
.k-vi { font: 900 calc(var(--u) * 30)/1 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; text-transform: uppercase;
  -webkit-text-stroke: calc(var(--u) * 5) #1a1c4b; paint-order: stroke fill; letter-spacing: .02em; white-space: nowrap; }
canvas.k-gl { display: block; pointer-events: none; }
.apage { inset: 0; flex-direction: column; overflow: hidden; color: #fff; }
.apage .abg { position: absolute; inset: 0; overflow: hidden; }
.apage .apat { position: absolute; inset: -50%; transform: rotate(-20deg); }
.apage header { position: relative; display: flex; align-items: center; gap: ${U(16)}; padding: calc(env(safe-area-inset-top) + ${U(24)}) ${U(24)} ${U(10)};
  min-height: ${U(90)}; }
.apage header h2 { flex: 1; margin: 0; display: flex; justify-content: center; align-items: center; gap: ${U(10)}; font-size: ${U(56)}; }
.apage .x { width: ${U(90)}; height: ${U(90)}; border: 0; padding: 0; background-color: transparent; cursor: pointer; flex: none;
  filter: drop-shadow(0 ${U(5)} 0 rgba(0,0,0,.3)); }
.apage .acoin { position: relative; display: flex; align-items: center; height: ${U(46)}; min-width: ${U(150)}; border-radius: ${U(23)};
  background: rgba(8, 23, 58, .32); padding: 0 ${U(18)} 0 ${U(56)}; box-sizing: border-box; flex: none; }
.apage .acoin i { position: absolute; left: ${U(-6)}; top: 50%; width: ${U(58)}; height: ${U(58)}; transform: translateY(-50%); }
.apage .acoin b { flex: 1; text-align: center; font-size: ${U(30)}; }
.apage .abody { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
`;
  document.head.appendChild(st);
}

export const U = (n) => `calc(var(--u) * ${n})`;

// The sprite as the element's background, stretched to the element's box.
export function spr(el, sh, name) {
  const r = sh.rects[name], [W, H] = sh.rects._size;
  if (!r) return el;
  Object.assign(el.style, { backgroundImage: `url(${sh.url})`, backgroundRepeat: 'no-repeat',
    backgroundSize: `${(W / r[2]) * 100}% ${(H / r[3]) * 100}%`,
    backgroundPosition: `${W === r[2] ? 0 : (r[0] / (W - r[2])) * 100}% ${H === r[3] ? 0 : (r[1] / (H - r[3])) * 100}%` });
  return el;
}

// One sprite cut out as an image URL (for 9-slice borders and tiled patterns).
const cuts = new Map();
export function cut(sh, name) {
  const key = sh.url + '#' + name;
  if (!cuts.has(key)) {
    const r = sh.rects[name], c = document.createElement('canvas');
    c.width = r[2]; c.height = r[3];
    c.getContext('2d').drawImage(sh.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    cuts.set(key, c.toDataURL());
  }
  return cuts.get(key);
}

// A sprite fitted inside the element's box (Image preserveAspect / AspectRatioFitter)
export function fit(el, sh, name) {
  if (!sh.rects[name]) return el;
  Object.assign(el.style, { backgroundImage: `url(${cut(sh, name)})`, backgroundSize: 'contain', backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat' });
  return el;
}

// Image type Sliced: the sprite's border [l, b, r, t] (sheet px) drawn at `k` reference units per sheet px.
export function slice(el, sh, name, k = 1) {
  const r = sh.rects[name];
  if (!r) return el;
  const [l, b, rr, t] = r.slice(4);
  Object.assign(el.style, { borderStyle: 'solid', borderImageSource: `url(${cut(sh, name)})`,
    borderImageSlice: `${t} ${rr} ${b} ${l} fill`, borderImageRepeat: 'stretch',
    borderWidth: `${U(t * k)} ${U(rr * k)} ${U(b * k)} ${U(l * k)}`, boxSizing: 'border-box', background: 'none' });
  return el;
}

// Image type Tiled (the page patterns), `size` reference units per tile, faded to `alpha`.
export function tile(el, sh, name, size, alpha = 1) {
  Object.assign(el.style, { backgroundImage: `url(${cut(sh, name)})`, backgroundSize: `${U(size)} ${U(size)}`, opacity: alpha });
  return el;
}

// A label in the game font when it has every letter, else a system-font span (Vietnamese). `px` reference units.
export function label(app, text, px, color = null) {
  const { fontImg, font } = app.atlas;
  const up = String(text).toUpperCase();
  if (![...up].every((ch) => font.glyphs[ch])) {
    const s = document.createElement('span');
    s.className = 'k-vi';
    s.textContent = text;
    s.style.fontSize = U(px * 0.86);
    s.style.webkitTextStroke = `${U(Math.max(3, px * 0.16))} #1a1c4b`;
    if (color) s.style.color = color;
    return s;
  }
  const dpr = Math.min(3, window.devicePixelRatio || 1), cssPx = (px * window.innerHeight) / 1334;
  const k = (cssPx * dpr) / font.size;
  let w = 0;
  for (const ch of up) w += font.glyphs[ch][6];
  const c = document.createElement('canvas');
  c.className = 'k-gl';
  c.width = Math.ceil(w * k + 8 * k); c.height = Math.ceil(font.lineHeight * k + 6 * k);
  const g = c.getContext('2d'), img = color ? app.R.fontIn(color) : fontImg;
  let x = 4 * k;
  const base = (font.ascent + 4) * k;
  for (const ch of up) {
    const q = font.glyphs[ch];
    if (q[2] > 1) g.drawImage(img, q[0], q[1], q[2], q[3], x + q[4] * k, base - q[5] * k, q[2] * k, q[3] * k);
    x += q[6] * k;
  }
  c.style.width = c.width / dpr + 'px';
  c.style.height = c.height / dpr + 'px';
  return c;
}

// Keep an element's text (other modules and the tests read and write it) but show it in the game font: the label is
// redrawn as the element's background whenever the text changes. Text with letters the font lacks stays as it is.
export function glText(app, el, px, color = null) {
  if (!el || el.dataset.gl) return;
  el.dataset.gl = '1';
  const draw = () => {
    const t = el.textContent;
    const c = t && label(app, t, px, color);
    if (!c || c.tagName !== 'CANVAS') { Object.assign(el.style, { color: '', backgroundImage: '' }); if (c) el.classList.add('k-vi'); return; }
    el.classList.remove('k-vi');
    Object.assign(el.style, { color: 'transparent', backgroundImage: `url(${c.toDataURL()})`, backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center', backgroundSize: `${c.style.width} ${c.style.height}`, minWidth: c.style.width });
  };
  new MutationObserver(draw).observe(el, { childList: true, characterData: true, subtree: true });
  draw();
}

// A full-screen page drawn with a screen's sheet: background (CSS gradient + the page's tiled pattern), header with the
// home button (.x, closes), the title and the coin count (.c). `o`: {grad, pattern, patSize, patAlpha, title, onClose}.
// Returns {el, body, sh}; the overlay is shown through app.overlay(id, true).
export async function artPage(app, id, screen, o) {
  kitStyle();
  const sh = await sheet(app, screen);
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  el.className = 'ui overlay apage';
  el.innerHTML = `<div class="abg" style="background:${o.grad}"><i class="apat"></i></div><header><button class="x" title="Về trang chính"></button>
    <h2></h2><div class="acoin" title="Xu"><i></i><b class="c"></b></div></header><div class="abody"></div>`;
  if (o.pattern) tile(el.querySelector('.apat'), sh, o.pattern, o.patSize || 256, o.patAlpha ?? 0.1);
  spr(el.querySelector('.x'), sh, 'Icon_Home');
  spr(el.querySelector('.acoin i'), sh, 'SkinCoins');
  const h2 = el.querySelector('h2');
  if (o.title) h2.appendChild(label(app, o.title, 56));
  if (o.icon) { const i = document.createElement('i'); Object.assign(i.style, { width: U(70), height: U(70), display: 'block' }); h2.appendChild(spr(i, sh, o.icon)); }
  const c = el.querySelector('.c');
  c.textContent = app.save.coins;
  glText(app, c, 30);
  el.querySelector('.x').onclick = () => { app.play('popup_out'); (o.onClose || (() => { app.overlay(id, false); app.hud(); }))(); };
  app.overlay(id, true);
  return { el, body: el.querySelector('.abody'), sh };
}

// An absolutely placed box: centre (x, y) in reference units from the parent's anchor, size (w, h).
// anchor: [ax, ay] of the parent box (0..1, y down), as RectTransform anchors with the pivot in the middle.
export function box(parent, cls, x, y, w, h, anchor = [0.5, 0.5]) {
  const el = document.createElement('div');
  el.className = 'k-abs ' + (cls || '');
  Object.assign(el.style, { left: `calc(${anchor[0] * 100}% + ${U(x - w / 2)})`, top: `calc(${anchor[1] * 100}% + ${U(y - h / 2)})`,
    width: U(w), height: U(h) });
  parent.appendChild(el);
  return el;
}
