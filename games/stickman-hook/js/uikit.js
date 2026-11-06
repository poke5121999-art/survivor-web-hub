// Menu kit shared by the home screen (home.js), the meta menus (menus.js) and the tournament page (race.js).
// - Per-screen sprite sheets from tools/build_menus.py (art/m-<screen>.webp + data/m-<screen>.json), fetched the first
//   time that screen opens.
// - Layout in reference units: CanvasScaler 750 x 1334 matched to the height, so 1 unit = the portrait frame's height / 1334
//   (`--u`, set in index.html with the frame: body is the frame, so its clientHeight is the canvas height).
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

// The sprite as the element's background. A sprite the original never stretches (data/m-*.json _keep, from the prefabs'
// Image m_PreserveAspect / rect sizes: tools/build_menus.py) is fitted in the box, centred; the rest (Sliced, Filled, Simple
// stretched by its anchors) is stretched to the box.
export function spr(el, sh, name) {
  const r = sh.rects[name], [W, H] = sh.rects._size;
  if (!r) return el;
  if ((sh.keep ||= new Set(sh.rects._keep || [])).has(name)) return fit(el, sh, name);
  el.dataset.spr = name;
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
  el.dataset.spr = name;
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
  const dpr = Math.min(3, window.devicePixelRatio || 1), cssPx = (px * document.body.clientHeight) / 1334;
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

// ---- Popup open / close (README "Popup: mở và đóng") ----------------------------------------------------------------
// Every popup goes through popOpen / popClose with the transition its prefab has (D:/stickman-hook-ref/dump/asm/tween):
// - 'instant': MadTweenAnimationController with empty Show/HideSequence (SettingsPopup, XpRoadPopup, PiggyBankPopup,
//   ModeUnlockedPopUp, CollectionCompletedPopUp): Show = alpha 1 at once [asm 0x30232f8], Hide = alpha 0 [asm 0x30234b0].
// - 'unity': DefaultPopupAnimator (UnityAnimationController [asm 0x303fcf8, 0x303f6c0]): Open 0.25 s scales
//   BG/HolderAnchored/Holder 0 -> 1.2 (0.1667 s) -> 1 and fades BG 0 -> 0.7843; Close 0.2833 s scales 1 -> 1.2 (0.0833 s)
//   -> 0 and fades BG out. Every key has zero tangents, so each segment is a smoothstep.
// - 'vip': NoAdsAnimator (MarketVipPopup): Open 0.4167 s, scale 0.5 -> 1.1 (0.25 s) -> 1, BG 0 -> 0.8 (0.3333 s);
//   Close 0.3 s, 1 -> 1.1 (0.0667 s) -> 0.1, BG 0.8 -> 0 (0.1667 s).
// - 'wait': DefaultPopupAnimator whose curve paths bind nothing (CustomizationItemUnlockedPopUp has "Background", not
//   "BG"; BoosterOpeningPopup): only the state times pass, nothing moves.
// Behind every popup the shared BackgroundLayer fades black 0 -> 0.7 in 0.2 s (PopupController.FadeInBackgroundLayer:
// DOFade 0.2 s, no SetEase = DOTween's default OutQuad [asm 0x3028f64]) and back to 0 on close [asm 0x3029358]; the
// close is awaited before the popup goes (ClosePopupAction [asm 0x3027f98]), together with that fade (Task.WhenAll).
export const TWEEN = {
  dim: { a: 0.7, ms: 200 },
  instant: { open: { ms: 0 }, close: { ms: 0 } },
  wait: { open: { ms: 250 }, close: { ms: 283.3 } },
  unity: { open: { ms: 250, scale: [[0, 0], [166.7, 1.2], [250, 1]], bg: [[0, 0], [250, 0.7843]] },
    close: { ms: 283.3, scale: [[0, 1], [83.3, 1.2], [283.3, 0]], bg: [[0, 0.7843], [283.3, 0]] } },
  vip: { open: { ms: 416.7, scale: [[0, 0.5], [250, 1.1], [416.7, 1]], bg: [[0, 0], [333.3, 0.8], [416.7, 0.8]] },
    close: { ms: 300, scale: [[0, 1], [66.7, 1.1], [300, 0.1]], bg: [[0, 0.8], [166.7, 0], [300, 0]] } },
};
// smoothstep keys -> Web Animations keyframes (8 linear steps per segment)
function keyframes(keys, ms, css) {
  const out = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    for (let k = 0; k < 8; k++) {
      const s = k / 8, v = a + (b - a) * (3 * s * s - 2 * s * s * s);
      out.push({ offset: Math.min(1, (t0 + (t1 - t0) * s) / ms), ...css(v) });
    }
  }
  const last = keys[keys.length - 1];
  if (last[0] < ms) out.push({ offset: last[0] / ms, ...css(last[1]) });
  out.push({ offset: 1, ...css(last[1]) });
  return out;
}
const now = () => performance.now();
// `el`: the popup's overlay; o.holder: element(s) scaled around the first one's centre (Holder pivot 0.5); o.bg: the
// element whose opacity follows the BG curve (its own colour at full opacity). Resolves when both transitions are over.
// el.dataset: tween (kind), tweenOpen / tweenClose (ms measured), for the tests.
export function popOpen(el, kind = 'unity', o = {}) {
  return pop(el, kind, 'open', o);
}
export function popClose(el, kind = 'unity', o = {}) {
  return pop(el, kind, 'close', o);
}
async function pop(el, kind, dir, o) {
  const spec = TWEEN[kind][dir], t0 = now();
  el.dataset.tween = kind;
  let dim = el.querySelector(':scope > .pdim');
  if (!dim) {
    dim = document.createElement('i');
    dim.className = 'pdim';
    dim.style.cssText = 'position:absolute;inset:0;background:#000;pointer-events:none;opacity:0';
    el.prepend(dim);
  }
  const anims = [dim.animate(dir === 'open' ? [{ opacity: 0 }, { opacity: TWEEN.dim.a }] : [{ opacity: TWEEN.dim.a }, { opacity: 0 }],
    { duration: TWEEN.dim.ms, easing: 'cubic-bezier(.25,.46,.45,.94)', fill: 'forwards' })];
  const hs = [o.holder].flat().filter(Boolean);
  if (spec.scale && hs.length) {
    const r = hs[0].getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (const h of hs) {
      const q = h.getBoundingClientRect();
      h.style.transformOrigin = `${cx - q.left}px ${cy - q.top}px`;
      anims.push(h.animate(keyframes(spec.scale, spec.ms, (v) => ({ transform: `scale(${v})` })), { duration: spec.ms, fill: dir === 'close' ? 'forwards' : 'none' }));
    }
  }
  if (spec.bg && o.bg) {
    const base = 1 / (kind === 'vip' ? 0.8 : 0.7843);
    anims.push(o.bg.animate(keyframes(spec.bg, spec.ms, (v) => ({ opacity: Math.min(1, v * base) })), { duration: spec.ms, fill: dir === 'close' ? 'forwards' : 'none' }));
  }
  // a close without its own animation hides the popup's content at once; only the shared layer fades
  if (dir === 'close' && !spec.ms) for (const c of el.children) if (c !== dim) c.style.visibility = 'hidden';
  await Promise.all([...anims.map((a) => a.finished.catch(() => {})), new Promise((r) => setTimeout(r, spec.ms))]);
  el.dataset['tween' + (dir === 'open' ? 'Open' : 'Close')] = Math.round(now() - t0);
  if (dir === 'close') { for (const a of anims) a.cancel(); for (const c of el.children) c.style.visibility = ''; }
}

// A white sprite tinted by the UI Image colour (multiply, alpha kept), as a CSS url()
const tints = new Map();
export function tinted(sh, name, color) {
  const key = sh.url + name + color;
  if (!tints.has(key)) {
    const r = sh.rects[name], c = document.createElement('canvas');
    c.width = r[2]; c.height = r[3];
    const g = c.getContext('2d');
    g.drawImage(sh.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = color; g.fillRect(0, 0, r[2], r[3]);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(sh.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    tints.set(key, c.toDataURL());
  }
  return `url(${tints.get(key)})`;
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
