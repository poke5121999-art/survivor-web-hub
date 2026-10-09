/*
 * Bộ dựng chung cho Bản đồ (js/map.js) và Bách khoa (js/encyclopedia.js): dựng cây RectTransform của data/encyclopedia.js
 * (tools/book_ui.py) thành DOM tuyệt đối, cùng cách js/upgrade.js (cssRect, ảnh Sliced theo ppu, chữ TMP theo đường cơ sở của font gốc).
 *   DRBookKit.mount(node, parent, opts) → { byPath, texts }   opts.skip(node, path) → true thì bỏ cả nhánh; opts.on(node, box, path)
 *   DRBookKit.fit(ctx, scale)            đặt --s và đo lại chữ
 *   DRBookKit.setText(box, str)          đổi chữ của một node TMP         DRBookKit.setSprite(box, name|url)   đổi ảnh (name trong DR_BOOK.sprites)
 *   DRBookKit.setTint(box, [r,g,b,a])    Image.color                      DRBookKit.rect(box)                  { x, y, w, h } theo px màn hình
 *   DRBookKit.el(tag, cls, parent, txt)  DRBookKit.art(rel)               DRBookKit.rgba([r,g,b,a])            DRBookKit.px(n)
 */
(function (root) {
  'use strict';
  const B = root.DR_BOOK;
  if (!B) { console.error('[book] data/encyclopedia.js chưa nạp'); return; }
  const me = document.currentScript;
  const el = (tag, cls, parent, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (parent) parent.appendChild(e);
    return e;
  };
  const art = rel => 'url(' + new URL('../' + rel, (me && me.src) || location.href).href + ')';
  const rgba = c => c[3] >= 0.999 ? 'rgb(' + c.slice(0, 3).map(v => Math.round(v * 255)).join(',') + ')'
    : 'rgba(' + c.slice(0, 3).map(v => Math.round(v * 255)).join(',') + ',' + c[3] + ')';
  const r3 = v => Math.round(v * 1000) / 1000;
  const px = n => 'calc(var(--s)*' + r3(n) + 'px)';
  const lin = (pct, n) => !pct ? px(n) : !n ? pct + '%' : 'calc(' + r3(pct) + '% + var(--s)*' + r3(n) + 'px)';
  const FONTS = B.font;                                                              // theo họ phông của từng node: Front Page Neue, Hahmlet
  const fm = n => FONTS[n.tx.f] || Object.values(FONTS)[0];
  const CSSFONT = f => f === 'Hahmlet' ? '600 100px "Hahmlet","Signika",serif' : '100px "Front Page Neue","Signika",sans-serif';
  const isWhite = c => c[0] > 0.999 && c[1] > 0.999 && c[2] > 0.999 && c[3] > 0.999;

  // RectTransform → CSS tuyệt đối (như upgrade.js cssRect); scale âm lật quanh pivot
  function cssRect(rt) {
    const [ax0, ay0] = rt.amin, [ax1, ay1] = rt.amax, [pvx, pvy] = rt.piv, [apx, apy] = rt.ap, [w, h] = rt.sd;
    const o = { left: lin(ax0 * 100, apx - pvx * w), top: lin((1 - ay1) * 100, -apy - (1 - pvy) * h), width: lin((ax1 - ax0) * 100, w), height: lin((ay1 - ay0) * 100, h) };
    if (rt.sc) { o.transform = 'scale(' + rt.sc[0] + ',' + rt.sc[1] + ')'; o.transformOrigin = (pvx * 100) + '% ' + ((1 - pvy) * 100) + '%'; }
    return o;
  }
  function sizeOf(rt, p) {
    const d = i => rt.amax[i] === rt.amin[i] ? rt.sd[i] : p ? (rt.amax[i] - rt.amin[i]) * p[i] + rt.sd[i] : null;
    const w = d(0), h = d(1);
    return w == null || h == null ? null : [w, h];
  }
  // Unity Image.GetAdjustedBorders: viền (ppu/100) co lại khi khung nhỏ hơn tổng viền
  function borders(sp, w, h) {
    const k = 100 / sp.ppu;
    let [l, b, r, t] = sp.b.map(v => v * k);
    if (w != null && l + r > w && l + r) { const q = w / (l + r); l *= q; r *= q; }
    if (h != null && b + t > h && b + t) { const q = h / (b + t); b *= q; t *= q; }
    return { l, b, r, t, slice: [sp.b[3], sp.b[2], sp.b[1], sp.b[0]] };
  }

  function paintImage(box, n, size, tint) {
    const bg = box._bg || (box._bg = el('i', 'bk-bg', box));
    const im = n.img, sp = im.s && B.sprites[im.s];
    bg.className = 'bk-bg'; bg.removeAttribute('style');
    box._size = size;
    if (!sp || im.s === 'square' || /^square_/.test(im.s || '')) {
      if (im.dyn) { bg.classList.add('si'); return; }                              // ảnh đặt lúc chạy (cá): để trống tới khi setSprite
      bg.classList.add('solid'); bg.style.setProperty('--c', rgba(im.c)); return;
    }
    const url = art(sp.f);
    bg.style.setProperty('--sp', url);
    if (im.t === 1) {                                                                 // Sliced
      const b = borders(sp, size && size[0], size && size[1]);
      const bw = px(b.t) + ' ' + px(b.r) + ' ' + px(b.b) + ' ' + px(b.l);
      bg.style.setProperty('--bw', bw);
      bg.style.setProperty('--bi', url + ' ' + b.slice.join(' ') + (im.fc ? ' fill' : '') + ' / ' + bw + ' stretch');
      bg.classList.add(tint ? 'mul' : 'sl');
    } else {
      bg.classList.add(tint ? 'mulm' : 'si');
      if (im.pa) bg.classList.add('pa');
    }
    if (tint) bg.style.setProperty('--c', rgba(im.c));
  }

  function paintRaw(box, n) {                                                         // RawImage: texture lặp theo uvRect (width x height lần trên khung)
    const bg = box._bg = el('i', 'bk-bg raw', box), rw = n.raw, sp = B.sprites[rw.s];
    bg.style.setProperty('--sp', art(sp.f));
    bg.style.setProperty('--c', rgba(rw.c));
    bg.style.setProperty('--tw', (100 / rw.uv[2]) + '%'); bg.style.setProperty('--th', (100 / rw.uv[3]) + '%');
    bg.style.setProperty('--ux', '0'); bg.style.setProperty('--uy', '0');
  }

  function buildText(box, n, multi) {
    const tx = n.tx;
    box.classList.add('bk-t');
    if (multi) box.classList.add('wrap');
    const s = el('span', 'bk-tx', box);
    const i = el('i', '', s, tx.t);
    s.style.color = rgba(tx.c);
    if (tx.f === 'Hahmlet') { s.style.fontFamily = '"Hahmlet","Signika",serif'; s.style.fontWeight = '600'; }
    s.style.textAlign = tx.h === 1 ? 'left' : tx.h === 4 ? 'right' : tx.h === 8 ? 'justify' : 'center';
    box._tx = { n, i, s, multi: !!multi };
  }
  let _B = {}, _cv = null;
  function baseline(f) {
    if (_B[f] != null) return _B[f];
    const d = el('div', '', document.body);
    d.style.cssText = 'position:absolute;left:-999px;top:0;line-height:1;visibility:hidden;font:' + CSSFONT(f).replace('100px', '100px/1');
    d.innerHTML = 'Hx<i style="display:inline-block;width:0;height:0"></i>';
    _B[f] = (d.querySelector('i').getBoundingClientRect().bottom - d.getBoundingClientRect().top) / 100;
    d.remove();
    return _B[f];
  }
  function measure(text, f) {
    _cv = _cv || document.createElement('canvas').getContext('2d');
    _cv.font = CSSFONT(f);
    const m = _cv.measureText(text);
    return { asc: m.actualBoundingBoxAscent / 100, desc: m.actualBoundingBoxDescent / 100 };
  }
  const resetMetrics = () => { _B = {}; };
  function placeText(box, scale) {
    const { n, i, s, multi } = box._tx, tx = n.tx, FM = fm(n), pt = FM.pointSize;
    let size = tx.s;
    s.style.fontSize = px(size);
    if (multi) {                                                                      // nhiều dòng: thu nhỏ tới khi vừa chiều cao khung (autosize của TMP)
      s.style.textAlign = tx.h === 1 ? 'left' : tx.h === 4 ? 'right' : 'center';
      s.style.alignItems = tx.v === 256 ? 'flex-start' : tx.v === 1024 ? 'flex-end' : 'center';
      if (tx.au) {
        const ch = box.clientHeight / scale;
        for (let g = 0; g < 14 && i.getBoundingClientRect().height / scale > ch + 0.5 && size > tx.mn; g++) { size = Math.max(tx.mn, size - 1); s.style.fontSize = px(size); }
      }
      box._tx.size = size; return;
    }
    let below;
    if (tx.v === 8192) below = FM.cap / pt / 2;
    else if (tx.v === 512) below = (FM.ascent + FM.descent) / pt / 2;
    else if (tx.v === 4096) { const m = measure(i.textContent, tx.f); below = (m.asc - m.desc) / 2; }
    else below = (FM.ascent + FM.descent) / pt / 2;
    const topMode = tx.v === 256;                                                    // Top: đỉnh dòng (đường lên của font) chạm mép trên khung
    if (tx.au) {
      const cw = box.clientWidth / scale, tw = i.getBoundingClientRect().width / scale;
      if (cw > 0 && tw > cw) size = Math.max(tx.mn, Math.floor(size * cw / tw * 100) / 100);
      s.style.fontSize = px(size);
    }
    box._tx.size = size;
    if (topMode) s.style.top = px((FM.ascent / pt - baseline(tx.f)) * size);
    else s.style.top = 'calc(50% + var(--s)*' + ((below - baseline(tx.f)) * size) + 'px)';
  }

  // dựng cây: node.on = 0 và không có opts.keepOff → bỏ cả nhánh
  function mount(tree, parent, opts) {
    opts = opts || {};
    const ctx = { byPath: {}, texts: [], opts };
    const mk = (n, par, rel, psize) => {
      const path = rel == null ? '' : rel;
      if (opts.skip && opts.skip(n, path)) return null;
      if (!n.on && !(opts.keepOff && opts.keepOff(n, path))) return null;
      const box = el('div', 'bk-n', par);
      box.dataset.n = n.n;
      ctx.byPath[path] = box;
      if (n.rt) Object.assign(box.style, cssRect(n.rt));
      else box.style.cssText = 'position:absolute;inset:0';
      const size = n.rt ? sizeOf(n.rt, psize) : psize;
      box._n = n; box._size = size;
      if (/Mask$/.test(n.n) || n.mask != null) box.classList.add('bk-clip');                 // Mask: cắt con theo khung
      if (n.img && n.mask !== 0 && n.img.en !== 0) paintImage(box, n, size, n.img.dyn || !isWhite(n.img.c) && !!(n.img.s && B.sprites[n.img.s] && !/^square/.test(n.img.s)) || (opts.tint && opts.tint(n, path)));
      if (n.raw) paintRaw(box, n);
      if (n.tx) { buildText(box, n, opts.multi && opts.multi(n, path)); ctx.texts.push(box); }
      for (const k of n.k || []) mk(k, box, path ? path + '/' + k.n : k.n, size);
      if (opts.on) opts.on(n, box, path);
      return box;
    };
    ctx.root = mk(tree, parent, '', null);
    return ctx;
  }

  function fit(ctx, host, w, h) {
    const scale = Math.min(h / B.canvas.h, w / B.canvas.w);
    host.style.setProperty('--s', scale.toFixed(5));
    for (const b of ctx.texts) placeText(b, scale);
    ctx.scale = scale;
    return scale;
  }
  function setText(box, str) {
    if (!box || !box._tx) return;
    if (box._tx.i.textContent === str) return;
    box._tx.i.textContent = str;
    if (box._tx.n.tx.au && box._tx.size) box._tx.s.style.fontSize = px(box._tx.n.tx.s);
  }
  function setSprite(box, nameOrUrl) {
    const bg = box._bg; if (!bg) return;
    if (!nameOrUrl) { bg.style.setProperty('--sp', 'none'); return; }
    const sp = B.sprites[nameOrUrl];
    bg.style.setProperty('--sp', sp ? art(sp.f) : (/^url\(/.test(nameOrUrl) ? nameOrUrl : art(nameOrUrl)));
  }
  function setTint(box, col) { if (box && box._bg) box._bg.style.setProperty('--c', rgba(col)); }
  const rect = b => { const q = b.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; };

  // ================================================================ cửa sổ chung: DRBook
  // Một cửa sổ mở một lúc (Bản đồ / Bách khoa). Giống Time.timeScale = 0 của PopupWindow (pauseGame): DR.timeScale ép gần 0 mỗi khung
  // (js/abilities.js đặt lại 1 khi vòng chọn đóng), nuốt phím lái, Esc / X đóng. Phím M / L mở, bấm lại thì đóng.
  //   DRBook.openMap()  DRBook.openEncyclopedia()  DRBook.isOpen()  DRBook.busy()  DRBook.modalOn(id, closeFn, keyFn)  DRBook.modalOff(id)
  const TS_FROZEN = 0.0001;                       // [ĐỀ XUẤT] 0 làm particles.js / camera.js chia cho dt = 0; 1e-4 đứng yên mà không chia 0
  let M = null, ts0 = 1;
  const D = () => root.DR;
  const typing = e => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  function busy() {
    const d = D();
    if (!d || !d.s || !(d.mode === 'sail' || d.mode === 'dock')) return true;
    if (M) return true;
    const open = o => o && o.isOpen && o.isOpen();
    if (open(root.DRCargo) || open(root.DRDialogue) || open(root.DRUpgrade) || open(root.DRShop) || open(root.DRMinigame)) return true;
    if (root.DRIntro && DRIntro.playing) return true;
    if (root.DRHud && DRHud.journalOpen && DRHud.journalOpen()) return true;
    if (root.DRDocks && DRDocks.docking) return true;
    const p = document.getElementById('dr-pause'); if (p && !p.hidden) return true;
    return false;
  }
  function freeze() {
    if (!M) return;
    const d = D(); if (d) d.timeScale = TS_FROZEN;
    root.requestAnimationFrame(freeze);
  }
  function modalOn(id, closeFn, keyFn) {
    M = { id, close: closeFn, key: keyFn || null };
    const d = D();
    ts0 = d.timeScale == null || d.timeScale <= TS_FROZEN ? 1 : d.timeScale;
    if (root.DRInput && DRInput.keys) DRInput.keys.clear();         // thả phím đang giữ: thuyền không chạy tiếp khi cửa sổ mở
    document.body.classList.add('bk-open');
    freeze();
  }
  function modalOff(id) {
    if (!M || M.id !== id) return;
    M = null;
    const d = D(); if (d) d.timeScale = ts0 === 0.3 ? 1 : ts0;
    document.body.classList.remove('bk-open');
  }
  root.addEventListener('keydown', e => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.code)) return;
    const k = e.code;
    if (M) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      if (k === 'Escape' || k === 'KeyX' || (k === 'KeyM' && M.id === 'map') || (k === 'KeyL' && M.id === 'enc')) { M.close(); return; }
      if (M.key) M.key(e);
      return;
    }
    if (e.repeat || busy()) return;
    if (k === 'KeyM' && root.DRMap) { e.preventDefault(); e.stopImmediatePropagation(); DRMap.open(); }
    else if (k === 'KeyL' && root.DREncyclopedia) { e.preventDefault(); e.stopImmediatePropagation(); DREncyclopedia.open(); }
  }, true);
  if (root.DR && DR.on) {
    DR.on('mode', m => { if (M && !(m === 'sail' || m === 'dock')) M.close(); });
    DR.on('dialogue', on => { if (on && M) M.close(); });
  }
  root.DRBook = { openMap: () => !!(root.DRMap && DRMap.open()), openEncyclopedia: () => !!(root.DREncyclopedia && DREncyclopedia.open()),
    isOpen: () => !!M, which: () => (M ? M.id : null), busy, modalOn, modalOff };

  root.DRBookKit = { el, art, rgba, px, lin, cssRect, sizeOf, borders, mount, fit, setText, setSprite, setTint, rect, placeText, isWhite, resetMetrics };
})(window);
