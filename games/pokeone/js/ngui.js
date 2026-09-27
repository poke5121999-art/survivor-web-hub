// Vẽ cây UI NGUI (data/ui.js) bằng DOM. Mô tả dữ liệu và cách dùng: tools/README-ui.md.
// P1.ngui.build(tênPanel, phần tử cha, opts) -> { root, find, label, sprite, show, ... }
(function () {
  'use strict';
  const P1 = window.P1 = window.P1 || {};

  const PIVOT = {
    TopLeft: [0, 1], Top: [0.5, 1], TopRight: [1, 1], Left: [0, 0.5], Center: [0.5, 0.5], Right: [1, 0.5],
    BottomLeft: [0, 0], Bottom: [0.5, 0], BottomRight: [1, 0],
  };
  const CHILD_PANEL_Z = 100000;

  // Ma trận affine 2D [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f (giống CSS matrix()).
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const inv = (m) => {
    const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
    const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
    return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
  };
  const lerp = (a, b, t) => a + (b - a) * t;

  function rgba(hex) {
    hex = hex || '#ffffffff';
    return [1, 3, 5, 7].map((i) => parseInt(hex.substr(i, 2) || 'ff', 16) / 255);
  }
  const css = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a === undefined ? c[3] : a})`;

  // ---------------------------------------------------------------- tài nguyên

  const images = {};
  function image(url, onload) {
    let rec = images[url];
    if (!rec) {
      rec = images[url] = { img: new Image(), ok: false, wait: [] };
      rec.done = new Promise((res) => {
        rec.img.onload = () => { rec.ok = true; rec.wait.splice(0).forEach((f) => f()); res(); };
        rec.img.onerror = () => res();
      });
      rec.img.src = url;
    }
    if (!rec.ok && onload) rec.wait.push(onload);
    return rec;
  }

  let fontsInjected = false;
  function injectFonts(base) {
    if (fontsInjected) return;
    fontsInjected = true;
    const rules = Object.entries(P1.UI_WEBFONTS || {}).map(([name, f]) =>
      `@font-face{font-family:'P1${name}';src:url('${base}art/ui/${f.file}') format('truetype');font-weight:100 900;font-display:block}`);
    rules.push('.p1ng-root{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;overflow:hidden}' +
      '.p1ng-panel{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}' +
      '.p1ng-w{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;box-sizing:border-box}' +
      '.p1ng-w.p1ng-hit{pointer-events:auto}' +
      '.p1ng-label{display:flex;flex-direction:column;line-height:1;overflow:visible}' +
      '.p1ng-label>div{white-space:pre-wrap;overflow-wrap:break-word}' +
      '.p1ng-sym{display:inline-block;vertical-align:baseline;background-repeat:no-repeat}');
    const st = document.createElement('style');
    st.textContent = rules.join('\n');
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- nút

  class Node {
    constructor(d, parent, path) {
      this.d = d;
      this.name = d.n;
      this.parent = parent;
      this.path = path;
      this.active = d.a;
      this.pos = d.p.slice();
      this.shift = [0, 0];    // dịch thêm do mã game (trượt thanh máu vào...), cộng sau anchor
      this.scale = d.s.slice();
      this.w = d.w ? Object.assign({}, d.w, { size: d.w.size.slice() }) : null;
      this.pn = d.pn ? Object.assign({}, d.pn, d.pn.range ? { range: d.pn.range.slice(), off: d.pn.off.slice() } : {}) : null;
      this.alpha = this.pn ? this.pn.alpha : 1;
      this.world = [1, 0, 0, 1, 0, 0];
      this.kids = (d.c || []).map((c) => new Node(c, this, path + '/' + c.n));
      this.state = null;      // trạng thái nút bấm: null | 'hover' | 'pressed' | 'disabled'
      this.toggled = d.x && d.x.UIToggle ? !!d.x.UIToggle.startsActive : null;
    }
    get activeInHierarchy() {
      for (let n = this; n; n = n.parent) if (!n.active) return false;
      return true;
    }
    walk(fn) { fn(this); this.kids.forEach((k) => k.walk(fn)); }
    local() {
      const r = (this.d.r || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      return [c * this.scale[0], s * this.scale[0], -s * this.scale[1], c * this.scale[1],
        this.pos[0] + this.shift[0], this.pos[1] + this.shift[1]];
    }
    // Hình chữ nhật widget trong toạ độ cục bộ: [x0, y0, x1, y1] (y hướng lên như Unity).
    rect() {
      const [w, h] = this.w.size, pv = PIVOT[this.w.pivot] || PIVOT.Center;
      const x0 = -pv[0] * w, y0 = -pv[1] * h;
      return [x0, y0, x0 + w, y0 + h];
    }
  }

  function spriteData(atlas, name) {
    const a = P1.ATLAS && P1.ATLAS[atlas];
    return a && a.s[name] ? { a, r: a.s[name] } : null;
  }

  // Vùng vẽ thật của sprite: NGUI trừ padding (UISprite.drawingDimensions).
  function drawingRect(n, sd) {
    let [x0, y0, x1, y1] = n.rect();
    if (!sd || n.w.type === 'tiled') return [x0, y0, x1, y1];
    let [, , sw, sh, , , , , pl, pr, pt, pb] = sd.r;
    const flip = n.w.flip || '';
    if (flip === 'h' || flip === 'both') [pl, pr] = [pr, pl];
    if (flip === 'v' || flip === 'both') [pt, pb] = [pb, pt];
    const tw = sw + pl + pr, th = sh + pt + pb;
    let px = 1, py = 1;
    if (tw > 0 && th > 0 && (n.w.type === 'simple' || n.w.type === 'filled')) {
      if (tw & 1) pr++;
      if (th & 1) pt++;
      px = (x1 - x0) / tw;
      py = (y1 - y0) / th;
    }
    return [x0 + pl * px, y0 + pb * py, x1 - pr * px, y1 - pt * py];
  }

  // ---------------------------------------------------------------- vẽ sprite / texture lên canvas

  // Vẽ sprite/texture chưa tô màu vào canvas. false = ảnh chưa tải xong (sẽ vẽ lại khi tải).
  function paint(n, cv, dr) {
    const w = n.w;
    let src, sx, sy, sw, sh, bl = 0, br = 0, bt = 0, bb = 0;
    if (w.kind === 'sprite') {
      const sd = spriteData(w.atlas, w.sprite);
      if (!sd) return true;
      const rec = image(ngui.base + sd.a.img, () => n.ui && n.ui.redraw(n));
      if (!rec.ok) return false;
      src = rec.img;
      [sx, sy, sw, sh, bl, br, bt, bb] = sd.r;
    } else {
      if (!w.tex || w.tex.startsWith('rt:')) return true;
      const rec = image(ngui.base + w.tex, () => n.ui && n.ui.redraw(n));
      if (!rec.ok) return false;
      src = rec.img;
      const uv = w.uv || [0, 0, 1, 1], W = src.naturalWidth, H = src.naturalHeight;
      sx = uv[0] * W; sw = uv[2] * W; sh = uv[3] * H; sy = H - (uv[1] + uv[3]) * H;
      if (w.border) [bl, bb, br, bt] = w.border;
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const dw = dr[2] - dr[0], dh = dr[3] - dr[1];
    if (dw <= 0 || dh <= 0) return true;
    const kx = cv.width / dw, ky = cv.height / dh;
    ctx.imageSmoothingEnabled = true;
    ctx.save();
    const flip = w.flip || '';
    if (flip === 'h' || flip === 'both') { ctx.translate(cv.width, 0); ctx.scale(-1, 1); }
    if (flip === 'v' || flip === 'both') { ctx.translate(0, cv.height); ctx.scale(1, -1); }
    ctx.scale(kx, ky);
    const blit = (ax, ay, aw, ah, x, y, ww, hh) => {
      if (aw > 0 && ah > 0 && ww > 0 && hh > 0) ctx.drawImage(src, ax, ay, aw, ah, x, y, ww, hh);
    };
    if (w.type === 'filled' && w.fill) {
      fillClip(ctx, w.fill, dw, dh);
      blit(sx, sy, sw, sh, 0, 0, dw, dh);
    } else if ((w.type === 'sliced' || w.type === 'advanced') && (bl || br || bt || bb)) {
      // 9 mảnh: góc giữ nguyên cỡ, cạnh và giữa kéo giãn. Viền lớn hơn widget thì co tỉ lệ như NGUI.
      let l = bl, r = br, t = bt, b = bb;
      if (l + r > dw) { const f = dw / (l + r); l *= f; r *= f; }
      if (t + b > dh) { const f = dh / (t + b); t *= f; b *= f; }
      const cx = [0, l, dw - r, dw], cw = [l, dw - l - r, r];
      const cy = [0, t, dh - b, dh], ch = [t, dh - t - b, b];
      const ax = [sx, sx + bl, sx + sw - br], aw = [bl, sw - bl - br, br];
      const ay = [sy, sy + bt, sy + sh - bb], ah = [bt, sh - bt - bb, bb];
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
          if (i === 1 && j === 1 && w.center === false) continue;
          blit(ax[i], ay[j], aw[i], ah[j], cx[i], cy[j], cw[i], ch[j]);
        }
      }
    } else if (w.type === 'tiled') {
      for (let y = 0; y < dh; y += sh) {
        for (let x = 0; x < dw; x += sw) {
          const ww = Math.min(sw, dw - x), hh = Math.min(sh, dh - y);
          blit(sx, sy + sh - hh, ww, hh, x, dh - y - hh, ww, hh);
        }
      }
    } else {
      blit(sx, sy, sw, sh, 0, 0, dw, dh);
    }
    ctx.restore();
    return true;
  }

  // Tô màu kiểu NGUI (màu đỉnh nhân vào texture): multiply cả khung rồi cắt lại theo alpha của bản chưa tô.
  const scratch = document.createElement('canvas');
  function drawSprite(n, cv, dr) {
    if (!paint(n, cv, dr)) return false;
    const c = rgba(n.w.color);
    if (c[0] > 0.999 && c[1] > 0.999 && c[2] > 0.999) return true;
    scratch.width = cv.width; scratch.height = cv.height;
    scratch.getContext('2d').drawImage(cv, 0, 0);
    const ctx = cv.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = css(c, 1);
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
    return true;
  }

  // Cắt vùng tô theo fillAmount. Canvas đang ở toạ độ widget (y xuống), cỡ dw x dh.
  function fillClip(ctx, f, dw, dh) {
    const amt = Math.max(0, Math.min(1, f.amt));
    ctx.beginPath();
    if (f.dir === 'horizontal') {
      const ww = dw * amt;
      ctx.rect(f.inv ? dw - ww : 0, 0, ww, dh);
    } else if (f.dir === 'vertical') {
      const hh = dh * amt;
      ctx.rect(0, f.inv ? 0 : dh - hh, dw, hh);
    } else {
      // radial: tâm ở giữa (radial360), góc (radial90) hoặc cạnh dưới (radial180); quét theo chiều kim đồng hồ từ đỉnh
      const cx = f.dir === 'radial90' ? 0 : dw / 2, cy = f.dir === 'radial360' ? dh / 2 : dh;
      const span = { radial90: Math.PI / 2, radial180: Math.PI, radial360: Math.PI * 2 }[f.dir];
      const start = f.dir === 'radial180' ? Math.PI : -Math.PI / 2;
      const R = Math.hypot(dw, dh) * 2;
      ctx.moveTo(cx, cy);
      if (f.inv) ctx.arc(cx, cy, R, start + span, start + span - span * amt, true);
      else ctx.arc(cx, cy, R, start, start + span * amt, false);
      ctx.closePath();
    }
    ctx.clip();
  }

  // ---------------------------------------------------------------- chữ (BBCode NGUI tối thiểu + ký hiệu font)

  function fontOf(w) {
    const f = P1.UI_FONTS && P1.UI_FONTS[w.font];
    return f || { web: 'Arimo', weight: 400, k: 1.05, size: w.fontSize, sym: {} };
  }

  function fillLabel(n, box) {
    const w = n.w, f = fontOf(w);
    box.textContent = '';
    const line = document.createElement('div');
    box.appendChild(line);
    let text = w.text == null ? '' : String(w.text);
    if (w.style === 'upper') text = text.toUpperCase();
    const stack = [];
    let cur = line, bold = 0, ital = 0, und = 0, strike = 0;
    const span = () => {
      const s = document.createElement('span');
      if (stack.length) s.style.color = stack[stack.length - 1];
      if (bold) s.style.fontWeight = '700';
      if (ital) s.style.fontStyle = 'italic';
      const deco = [und && 'underline', strike && 'line-through'].filter(Boolean).join(' ');
      if (deco) s.style.textDecoration = deco;
      line.appendChild(s);
      cur = s;
    };
    const syms = w.symbols === false ? {} : (f.sym || {});
    let i = 0, buf = '';
    const flush = () => { if (buf) { span(); cur.textContent = buf; buf = ''; } };
    while (i < text.length) {
      const ch = text[i];
      if (ch === '[' && w.bbcode !== false) {
        const end = text.indexOf(']', i);
        if (end > i) {
          const tag = text.slice(i + 1, end);
          const low = tag.toLowerCase();
          let used = true;
          if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(tag)) { flush(); stack.push('#' + tag); }
          else if (tag === '-') { flush(); stack.pop(); }
          else if (low === 'b' || low === '/b') { flush(); bold = low === 'b' ? 1 : 0; }
          else if (low === 'i' || low === '/i') { flush(); ital = low === 'i' ? 1 : 0; }
          else if (low === 'u' || low === '/u') { flush(); und = low === 'u' ? 1 : 0; }
          else if (low === 's' || low === '/s') { flush(); strike = low === 's' ? 1 : 0; }
          else if (/^\/?(sub|sup|c|url(=.*)?)$/.test(low) || /^[0-9a-f]{2}$/i.test(tag)) { flush(); }
          else if (syms['[' + tag + ']']) { flush(); line.appendChild(symbol(f, syms['[' + tag + ']'], w.fontSize)); }
          else used = false;
          if (used) { i = end + 1; continue; }
        }
      }
      buf += ch;
      i++;
    }
    flush();
  }

  function symbol(f, spriteName, fontSize) {
    const el = document.createElement('span');
    el.className = 'p1ng-sym';
    const sd = spriteData(f.atlas || 'GUIAtlas', spriteName);
    if (!sd) return el;
    const k = fontSize / (f.size || fontSize);
    const [x, y, w, h] = sd.r;
    Object.assign(el.style, {
      width: w * k + 'px', height: h * k + 'px',
      backgroundImage: `url('${ngui.base + sd.a.img}')`,
      backgroundSize: `${sd.a.w * k}px ${sd.a.h * k}px`,
      backgroundPosition: `${-x * k}px ${-y * k}px`,
    });
    return el;
  }

  function styleLabel(n, el) {
    const w = n.w, f = fontOf(w);
    const c = rgba(w.color);
    const pv = PIVOT[w.pivot] || PIVOT.Center;
    let align = w.align;
    if (align === 'auto') align = pv[0] === 0 ? 'left' : pv[0] === 1 ? 'right' : 'center';
    const fs = w.fontSize * f.k;
    const st = el.style;
    st.fontFamily = `'P1${f.web}', ${f.web === 'Aldrich' ? 'sans-serif' : 'Arial, sans-serif'}`;
    st.fontWeight = w.style === 'bold' || w.style === 'bolditalic' ? '700' : String(f.weight || 400);
    st.fontStyle = w.style === 'italic' || w.style === 'bolditalic' ? 'italic' : 'normal';
    st.fontSize = fs + 'px';
    st.lineHeight = (w.fontSize + (w.spacing ? w.spacing[1] : 0)) + 'px';
    st.letterSpacing = w.spacing && w.spacing[0] ? w.spacing[0] + 'px' : '';
    st.color = css(c, 1);
    st.textAlign = align === 'justified' ? 'justify' : align;
    st.justifyContent = pv[1] === 1 ? 'flex-start' : pv[1] === 0 ? 'flex-end' : 'center';
    st.alignItems = 'stretch';
    const free = w.overflow === 'resizeFreely';
    el.firstChild && (el.firstChild.style.whiteSpace = free ? 'pre' : 'pre-wrap');
    st.overflow = w.overflow === 'clamp' ? 'hidden' : 'visible';
    if (free) {
      st.alignItems = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
    }
    const e = w.effect;
    if (e) {
      const ec = rgba(e.color), col = css(ec, ec[3]);
      const [dx, dy] = e.dist;
      const offs = e.style === 'shadow' ? [[dx, dy]]
        : e.style === 'outline' ? [[dx, dy], [-dx, -dy], [dx, -dy], [-dx, dy]]
          : [[dx, dy], [-dx, -dy], [dx, -dy], [-dx, dy], [dx, 0], [-dx, 0], [0, dy], [0, -dy]];
      st.textShadow = offs.map(([x, y]) => `${x}px ${y}px 0 ${col}`).join(',');
    } else st.textShadow = '';
  }

  // ShrinkContent: NGUI giảm cỡ chữ tới khi vừa khung.
  function shrinkLabel(n, el) {
    if (n.w.overflow !== 'shrink') return;
    const f = fontOf(n.w), base = n.w.fontSize * f.k;
    const [W, H] = n.w.size;
    let fs = base;
    el.style.fontSize = fs + 'px';
    el.style.lineHeight = n.w.fontSize + 'px';
    const inner = el.firstChild;
    for (let i = 0; i < 12 && inner && (inner.scrollWidth > W + 0.5 || inner.scrollHeight > H + 0.5) && fs > 4; i++) {
      fs *= 0.9;
      el.style.fontSize = fs + 'px';
      el.style.lineHeight = n.w.fontSize * fs / base + 'px';
    }
  }

  // ---------------------------------------------------------------- bố cục (anchor, grid, table)

  class UI {
    constructor(key, host, opts) {
      const data = P1.UI[key] || (P1.UI_PREFABS && P1.UI_PREFABS[key]);
      if (!data) throw new Error('ngui: không có panel "' + key + '" trong P1.UI / P1.UI_PREFABS');
      this.key = key;
      this.host = host;
      this.opts = opts || {};
      this.cfg = key.startsWith('title:') ? P1.UI_ROOT.title : P1.UI_ROOT;
      this.ghosts = {};
      this.top = new Node(data, null, key);
      if (this.opts.active !== false) this.top.active = true;
      if (this.opts.play !== false) this.playTweensTo(this.top);
      this.index = {};
      this.top.walk((n) => { this.index[n.path] = n; n.ui = this; });
      this.handlers = {};
      this.dom();
      this.refresh();
      // Cỡ chữ ShrinkContent đo theo font web: đo lại khi font tải xong.
      if (document.fonts) {
        document.fonts.ready.then(() => {
          this.top.walk((n) => { if (n.w && n.w.kind === 'label') n.drawn = null; });
          if (this.rootEl.isConnected) this.refresh();
        });
      }
      if (this.opts.resize !== false) {
        this.onResize = () => this.refresh();
        window.addEventListener('resize', this.onResize);
      }
    }

    // Panel đóng sẵn có TweenAlpha 0->1: mở ra thì lấy giá trị cuối như lúc tween chạy xong.
    playTweensTo(n) {
      (n.d.tw || []).forEach((t) => {
        if (t.kind === 'TweenAlpha' && typeof t.to === 'number') {
          if (n.pn) n.alpha = t.to;
          else if (n.w) { const c = rgba(n.w.color); c[3] = t.to; n.w.color = '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); }
        }
      });
    }

    // Kích thước màn ảo theo UIRoot (Flexible: pixel-perfect, kẹp chiều cao trong [minimumHeight, maximumHeight]).
    screen() {
      const cw = this.host.clientWidth || window.innerWidth, ch = this.host.clientHeight || window.innerHeight;
      const c = this.cfg;
      let H;
      if (c.style === 'flexible') H = Math.min(Math.max(ch, c.minimumHeight), c.maximumHeight);
      else if (c.fitWidth && !c.fitHeight) H = Math.round(c.manualWidth * ch / cw);
      else if (c.fitWidth && c.fitHeight) H = Math.max(c.manualHeight, Math.round(c.manualWidth * ch / cw));
      else H = c.manualHeight;
      if (this.opts.virtualHeight) H = this.opts.virtualHeight;
      const k = ch / H;
      return { W: cw / k, H, k, cw, ch };
    }

    resolve(path) {
      if (path == null) return null;
      if (path === '' || path === 'title:') return 'screen';
      if (this.index[path]) return this.index[path];
      const key = path.startsWith('prefab:') || path.startsWith('title:')
        ? path.split('/')[0] : path.split('/')[0];
      const data = P1.UI[key] || (P1.UI_PREFABS && P1.UI_PREFABS[key]);
      if (!data || this.resolving) return null;
      let g = this.ghosts[key];
      if (!g) {
        g = this.ghosts[key] = { top: new Node(data, null, key), index: {} };
        g.top.walk((n) => { g.index[n.path] = n; });
        this.resolving = true;
        const saved = this.index;
        this.index = Object.assign({}, saved, g.index);
        this.layoutTree(g.top, [1, 0, 0, 1, 0, 0]);
        this.index = saved;
        this.resolving = false;
      }
      return g.index[path] || null;
    }

    // Bốn điểm giữa cạnh (trái, trên, phải, dưới) của target, trong toạ độ cục bộ của `space` (ma trận thế giới).
    sides(target, spaceWorld) {
      const iw = inv(spaceWorld);
      let corners;
      if (target === 'screen' || (target.pn && target.pn.clip === 'none' && !target.w)) {
        const s = this.scr;
        corners = [[-s.W / 2, -s.H / 2], [-s.W / 2, s.H / 2], [s.W / 2, s.H / 2], [s.W / 2, -s.H / 2]];
      } else if (target.pn && target.pn.range) {
        const [cx, cy, w, h] = target.pn.range, [ox, oy] = target.pn.off;
        const x0 = cx + ox - w / 2, y0 = cy + oy - h / 2;
        corners = [[x0, y0], [x0, y0 + h], [x0 + w, y0 + h], [x0 + w, y0]].map(([x, y]) => apply(target.world, x, y));
      } else if (target.w) {
        const [x0, y0, x1, y1] = target.rect();
        corners = [[x0, y0], [x0, y1], [x1, y1], [x1, y0]].map(([x, y]) => apply(target.world, x, y));
      } else return null;
      const c = corners.map(([x, y]) => apply(iw, x, y));
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return [mid(c[0], c[1]), mid(c[1], c[2]), mid(c[2], c[3]), mid(c[3], c[0])];
    }

    anchorEdges(anc, parentWorld, fallback) {
      const out = {};
      for (const side of ['l', 'r', 'b', 't']) {
        const a = anc[side];
        if (!a) { out[side] = fallback[side]; continue; }
        const t = this.resolve(a[0]);
        if (!t) { out[side] = fallback[side]; continue; }
        const s = this.sides(t, parentWorld);
        if (s) {
          out[side] = side === 'l' || side === 'r' ? lerp(s[0][0], s[2][0], a[1]) + a[2] : lerp(s[3][1], s[1][1], a[1]) + a[2];
        } else {
          const p = apply(inv(parentWorld), t.world[4], t.world[5]);
          out[side] = (side === 'l' || side === 'r' ? p[0] : p[1]) + a[2];
        }
      }
      return out;
    }

    anchorWidget(n, parentWorld) {
      const w = n.w, pv = PIVOT[w.pivot] || PIVOT.Center;
      const [W, H] = w.size;
      const fb = { l: n.pos[0] - pv[0] * W, r: n.pos[0] - pv[0] * W + W, b: n.pos[1] - pv[1] * H, t: n.pos[1] - pv[1] * H + H };
      const e = this.anchorEdges(w.anc, parentWorld, fb);
      n.pos[0] = Math.round(lerp(e.l, e.r, pv[0]));
      n.pos[1] = Math.round(lerp(e.b, e.t, pv[1]));
      let nw = Math.floor(e.r - e.l + 0.5), nh = Math.floor(e.t - e.b + 0.5);
      if (w.aspect && w.aspect[1]) {
        if (w.aspect[0] === 2) nw = Math.round(nh * w.aspect[1]); else nh = Math.round(nw / w.aspect[1]);
      }
      w.size = [Math.max(2, nw), Math.max(2, nh)];
    }

    anchorPanel(n, parentWorld) {
      const p = n.pn;
      if (!p.range) return;
      const [cx, cy, w, h] = p.range, [ox, oy] = p.off;
      const x0 = n.pos[0] + ox + cx - w / 2, y0 = n.pos[1] + oy + cy - h / 2;
      const e = this.anchorEdges(p.anc, parentWorld, { l: x0, r: x0 + w, b: y0, t: y0 + h });
      const dx = n.pos[0] + ox, dy = n.pos[1] + oy;
      p.range = [lerp(e.l, e.r, 0.5) - dx, lerp(e.b, e.t, 0.5) - dy,
        Math.max(e.r - e.l, 2, p.soft[0]), Math.max(e.t - e.b, 2, p.soft[1])];
    }

    // UIGrid.ResetPosition
    grid(n) {
      const g = n.d.g;
      let list = n.kids.filter((k) => !g.hide || k.active);
      if (g.sort === 'alpha') list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
      let x = 0, y = 0, maxX = 0, maxY = 0;
      for (const t of list) {
        if (g.arr === 'snap') {
          if (g.cw > 0) t.pos[0] = Math.round(t.pos[0] / g.cw) * g.cw;
          if (g.ch > 0) t.pos[1] = Math.round(t.pos[1] / g.ch) * g.ch;
        } else if (g.arr === 'h') { t.pos[0] = g.cw * x; t.pos[1] = -g.ch * y; }
        else { t.pos[0] = g.cw * y; t.pos[1] = -g.ch * x; }
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        if (++x >= g.max && g.max > 0) { x = 0; ++y; }
      }
      if (g.pivot !== 'TopLeft' && g.arr !== 'snap') {
        const po = PIVOT[g.pivot];
        const fx = g.arr === 'h' ? lerp(0, maxX * g.cw, po[0]) : lerp(0, maxY * g.cw, po[0]);
        const fy = g.arr === 'h' ? lerp(-maxY * g.ch, 0, po[1]) : lerp(-maxX * g.ch, 0, po[1]);
        for (const t of list) { t.pos[0] -= fx; t.pos[1] -= fy; }
      }
    }

    // Khung bao các widget đang bật dưới `n`, trong toạ độ cục bộ của `n` (NGUIMath.CalculateRelativeWidgetBounds).
    bounds(n, considerInactive) {
      let b = null;
      const visit = (m, M) => {
        if (!considerInactive && !m.active) return;
        if (m.w && !m.w.off) {
          const [x0, y0, x1, y1] = m.rect();
          for (const [x, y] of [[x0, y0], [x1, y1], [x0, y1], [x1, y0]]) {
            const p = apply(M, x, y);
            if (!b) b = [p[0], p[1], p[0], p[1]];
            else { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
          }
        }
        m.kids.forEach((k) => visit(k, mul(M, k.local())));
      };
      visit(n, [1, 0, 0, 1, 0, 0]);
      return b || [0, 0, 0, 0];
    }

    // UITable.RepositionVariableSize
    table(n) {
      const t = n.d.t;
      const cols = t.columns || 0;
      let list = n.kids.filter((k) => !t.hideInactive || k.active);
      if (t.sorting === 1) list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
      const enc = (B, b) => [Math.min(B[0], b[0]), Math.min(B[1], b[1]), Math.max(B[2], b[2]), Math.max(B[3], b[3])];
      const Z = [0, 0, 0, 0];
      const bs = [], rowsB = [], colsB = [];
      let x = 0, y = 0;
      for (const k of list) {
        const b0 = this.bounds(k, !t.hideInactive);
        const b = [b0[0] * k.scale[0], b0[1] * k.scale[1], b0[2] * k.scale[0], b0[3] * k.scale[1]];
        bs.push([b, x, y]);
        rowsB[x] = enc(rowsB[x] || Z, b);
        colsB[y] = enc(colsB[y] || Z, b);
        if (++x >= cols && cols > 0) { x = 0; ++y; }
      }
      const po = PIVOT[['TopLeft', 'Top', 'TopRight', 'Left', 'Center', 'Right', 'BottomLeft', 'Bottom', 'BottomRight'][t.cellAlignment] || 'TopLeft'];
      const pad = t.padding || { x: 0, y: 0 };
      let xo = 0, yo = 0;
      list.forEach((k, i) => {
        const [b, bx, by] = bs[i], br = rowsB[bx], bc = colsB[by];
        const ext = [(b[2] - b[0]) / 2, (b[3] - b[1]) / 2], cen = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
        k.pos[0] = xo + ext[0] - cen[0] - (lerp(0, b[2] - b[0] - br[2] + br[0], po[0]) - pad.x);
        if (t.direction === 0) k.pos[1] = -yo - ext[1] - cen[1] + (lerp(b[3] - b[1] - bc[3] + bc[1], 0, po[1]) - pad.y);
        else k.pos[1] = yo + ext[1] - cen[1] - (lerp(0, b[3] - b[1] - bc[3] + bc[1], po[1]) - pad.y);
        xo += br[2] - br[0] + pad.x * 2;
        if (bx + 1 >= cols && cols > 0) { yo += bc[3] - bc[1] + pad.y * 2; xo = 0; }
      });
      const pv = ['TopLeft', 'Top', 'TopRight', 'Left', 'Center', 'Right', 'BottomLeft', 'Bottom', 'BottomRight'][t.pivot];
      if (pv && pv !== 'TopLeft') {
        const pp = PIVOT[pv], b = this.bounds(n, false);
        const fx = lerp(0, b[2] - b[0], pp[0]), fy = lerp(-(b[3] - b[1]), 0, pp[1]);
        list.forEach((k) => { k.pos[0] -= fx; k.pos[1] -= fy; });
      }
    }

    layoutTree(n, parentWorld) {
      if (n.w && n.w.anc) this.anchorWidget(n, parentWorld);
      if (n.pn && n.pn.anc) this.anchorPanel(n, parentWorld);
      if (n.d.g) this.grid(n);
      n.world = mul(parentWorld, n.local());
      n.kids.forEach((k) => this.layoutTree(k, n.world));
      if (n.d.t) {
        this.table(n);
        n.kids.forEach((k) => this.layoutTree(k, n.world));
      }
    }

    // ---------------------------------------------------------------- DOM

    dom() {
      injectFonts(ngui.base);
      this.rootEl = document.createElement('div');
      this.rootEl.className = 'p1ng-root';
      this.rootEl.dataset.panel = this.key;
      this.host.appendChild(this.rootEl);
      const make = (n, container) => {
        if (n.pn || n === this.top) {
          const c = document.createElement('div');
          c.className = 'p1ng-panel';
          c.dataset.name = n.name;
          container.appendChild(c);
          n.panelEl = c;
          container = c;
        }
        n.container = container;
        if (n.w || n.d.col) {
          const kind = n.w ? n.w.kind : 'widget';
          const el = document.createElement(kind === 'sprite' || kind === 'texture' ? 'canvas' : 'div');
          el.className = 'p1ng-w' + (kind === 'label' ? ' p1ng-label' : '');
          el.dataset.name = n.name;
          if (n.d.col) { el.classList.add('p1ng-hit'); this.bindInput(n, el); }
          container.appendChild(el);
          n.el = el;
        }
        n.kids.forEach((k) => make(k, container));
      };
      make(this.top, this.rootEl);
    }

    bindInput(n, el) {
      const b = n.d.b;
      const target = () => (b && b.target ? this.index[b.target] : n) || n;
      const setState = (s) => {
        if (n.state === 'disabled') return;
        n.state = s;
        if (b) this.paintButton(target(), b, s);
      };
      el.addEventListener('pointerenter', () => setState('hover'));
      el.addEventListener('pointerleave', () => setState(null));
      el.addEventListener('pointerdown', () => setState('pressed'));
      el.addEventListener('pointerup', () => setState('hover'));
      if (n.d.x && n.d.x.UIDragScrollView) {
        el.addEventListener('wheel', (ev) => {
          const sv = this.scrollViewOf(n);
          if (sv) { ev.preventDefault(); this.scroll(sv, 0, ev.deltaY * 0.5); }
        }, { passive: false });
      }
      el.addEventListener('click', (ev) => {
        if (n.state === 'disabled') return;
        if (n.toggled !== null) this.toggle(n, !n.toggled || !!(n.d.x.UIToggle.group && !n.d.x.UIToggle.optionCanBeNone));
        const fns = (this.handlers[n.path] || []).concat(this.handlers[n.name] || []);
        fns.forEach((f) => f(n, ev));
        if (this.opts.onClick) this.opts.onClick(n, ev);
      });
    }

    paintButton(t, b, s) {
      if (!t.w) return;
      if (t.normal === undefined) t.normal = { color: t.w.color, sprite: t.w.sprite };
      t.w.color = s === 'hover' ? b.hover : s === 'pressed' ? b.pressed : s === 'disabled' ? b.disabled : t.normal.color;
      const spr = s === 'hover' ? b.hoverSprite : s === 'pressed' ? b.pressedSprite : s === 'disabled' ? b.disabledSprite : null;
      t.w.sprite = spr || t.normal.sprite;
      this.draw(t);
    }

    toggle(n, on) {
      const tg = n.d.x.UIToggle;
      if (on && tg.group) {
        Object.values(this.index).forEach((m) => {
          if (m !== n && m.d.x && m.d.x.UIToggle && m.d.x.UIToggle.group === tg.group) this.toggle(m, false);
        });
      }
      n.toggled = on;
      const spr = tg.activeSprite && this.index[tg.activeSprite];
      if (spr && spr.w) {
        const c = rgba(spr.w.color);
        c[3] = (tg.invertSpriteState ? !on : on) ? 1 : 0;
        spr.w.color = '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
        this.draw(spr);
      }
    }

    // UIDragScrollView chuyển lăn chuột cho UIScrollView gần nhất (tổ tiên, hoặc con cháu như 'Background - Options').
    scrollViewOf(n) {
      for (let p = n; p; p = p.parent) if (p.d.x && p.d.x.UIScrollView && p.pn) return p;
      let hit = null;
      n.walk((m) => { if (!hit && m.d.x && m.d.x.UIScrollView && m.pn) hit = m; });
      return hit;
    }

    // Cuộn panel clip như UIScrollView: dời panel và bù clipOffset để vùng clip đứng yên, kẹp trong nội dung.
    scroll(name, dx, dy) {
      const n = this.need(name), p = n.pn;
      if (!p || !p.range) return n;
      const mv = (n.d.x && n.d.x.UIScrollView && n.d.x.UIScrollView.movement) || 0;
      const b = this.bounds(n, false);
      const clamp = (c, half, lo, hi, d) => {
        if (hi - lo <= half * 2) return 0;
        const next = Math.min(Math.max(c - d, lo + half), hi - half);
        return c - next;
      };
      const ax = mv === 1 ? 0 : clamp(p.range[0] + p.off[0], p.range[2] / 2, b[0], b[2], -dx);
      const ay = mv === 0 ? 0 : clamp(p.range[1] + p.off[1], p.range[3] / 2, b[1], b[3], dy);
      n.pos[0] -= ax; p.off[0] += ax;
      n.pos[1] += ay; p.off[1] -= ay;
      this.refresh();
      return n;
    }

    // Alpha cuối của widget: alpha màu nhân với alpha widget cha (dừng ở panel, panel có opacity riêng).
    finalAlpha(n) {
      let a = n.w ? rgba(n.w.color)[3] : 1;
      for (let p = n.parent; p && !p.pn; p = p.parent) if (p.w) a *= rgba(p.w.color)[3];
      return a;
    }

    refresh() {
      this.scr = this.screen();
      const { W, H, k } = this.scr;
      Object.assign(this.rootEl.style, { width: W + 'px', height: H + 'px', transform: `scale(${k})` });
      const origin = [1, 0, 0, 1, 0, 0];
      this.top.walk((n) => this.measureLabel(n));
      for (let pass = 0; pass < 2; pass++) this.layoutTree(this.top, origin);
      this.top.walk((n) => this.draw(n));
      if (this.top.d.x && this.top.d.x.UIToggle) this.toggle(this.top, this.top.toggled);
      this.top.walk((n) => { if (n.toggled !== null && n !== this.top) this.toggle(n, n.toggled); });
    }

    // ResizeFreely / ResizeHeight: NGUI đổi cỡ widget theo chữ, anchor của nút khác (khung bong bóng thoại...)
    // bám theo cỡ mới. Đo chữ web ở cỡ chưa biến đổi (đơn vị NGUI cục bộ).
    labelKey(w) { return [w.text, w.font, w.fontSize, w.color, w.size, w.effect && w.effect.style].join('|'); }
    measureLabel(n) {
      const w = n.w;
      if (!w || w.kind !== 'label' || !n.el || (w.overflow !== 'resizeFreely' && w.overflow !== 'resizeHeight')) return;
      if (!n.activeInHierarchy || w.off) return;
      const el = n.el;
      el.style.display = '';
      fillLabel(n, el);
      styleLabel(n, el);
      const inner = el.firstChild;
      if (w.overflow === 'resizeFreely') {
        inner.style.width = 'max-content';
        const lh = w.fontSize + (w.spacing ? w.spacing[1] : 0);
        w.size = [Math.max(2, Math.ceil(inner.offsetWidth)), Math.max(lh, Math.ceil(inner.offsetHeight))];
      } else {
        el.style.width = w.size[0] + 'px';
        w.size = [w.size[0], Math.max(w.fontSize, Math.ceil(inner.offsetHeight))];
      }
      n.drawn = this.labelKey(w);
    }

    toCss(M) {
      const { W, H } = this.scr;
      return mul([1, 0, 0, -1, W / 2, H / 2], M);
    }

    draw(n) {
      if (n.panelEl) {
        const vis = n.activeInHierarchy && !(n.pn && n.pn.disabled);
        const st = n.panelEl.style;
        st.display = vis ? '' : 'none';
        st.opacity = n.alpha;
        st.zIndex = n === this.top ? '' : String(CHILD_PANEL_Z + (n.pn ? n.pn.depth : 0));
        if (n.pn && n.pn.range && n.pn.clip !== 'constrain') {
          const [cx, cy, w, h] = n.pn.range, [ox, oy] = n.pn.off;
          const x0 = cx + ox - w / 2, y0 = cy + oy - h / 2;
          const M = this.toCss(n.world);
          const pts = [[x0, y0], [x0, y0 + h], [x0 + w, y0 + h], [x0 + w, y0]].map(([x, y]) => apply(M, x, y));
          st.clipPath = 'polygon(' + pts.map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`).join(',') + ')';
          // SoftClip: mờ dần ở mép trong `soft` đơn vị (panel không quay nên vùng clip thẳng trục)
          const sx = n.pn.clip === 'soft' ? n.pn.soft[0] * Math.abs(M[0]) : 0, sy = n.pn.clip === 'soft' ? n.pn.soft[1] * Math.abs(M[3]) : 0;
          if (sx || sy) {
            const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
            const L = Math.min(...xs), R = Math.max(...xs), T = Math.min(...ys), B = Math.max(...ys);
            const g = (dir, a, b, s) => `linear-gradient(${dir}, transparent ${a}px, #000 ${a + s}px, #000 ${b - s}px, transparent ${b}px)`;
            st.maskImage = st.webkitMaskImage = g('to right', L, R, sx) + ',' + g('to bottom', T, B, sy);
            st.maskComposite = 'intersect';
            st.webkitMaskComposite = 'source-in';
          } else st.maskImage = st.webkitMaskImage = '';
        } else st.clipPath = '';
      }
      if (!n.el) return;
      const el = n.el;
      const vis = n.activeInHierarchy && !(n.w && n.w.off);
      el.style.display = vis ? '' : 'none';
      if (!vis) return;
      const w = n.w || { size: [0, 0], pivot: 'Center', depth: 0, kind: 'widget' };
      if (!n.w) {   // collider không có widget: bỏ qua (không biết cỡ)
        el.style.display = 'none';
        return;
      }
      const sd = w.kind === 'sprite' ? spriteData(w.atlas, w.sprite) : null;
      const dr = w.kind === 'sprite' || w.kind === 'texture' ? drawingRect(n, sd) : n.rect();
      const dw = dr[2] - dr[0], dh = dr[3] - dr[1];
      const M = this.toCss(mul(n.world, [1, 0, 0, -1, dr[0], dr[3]]));
      el.style.transform = `matrix(${M.map((v) => +v.toFixed(4)).join(',')})`;
      el.style.width = Math.max(0, dw) + 'px';
      el.style.height = Math.max(0, dh) + 'px';
      el.style.zIndex = String(w.depth);
      el.style.opacity = this.finalAlpha(n);
      if (w.kind === 'sprite' || w.kind === 'texture') {
        const sx = Math.hypot(n.world[0], n.world[1]), sy = Math.hypot(n.world[2], n.world[3]);
        const dpr = window.devicePixelRatio || 1;
        const cw = Math.max(1, Math.min(4096, Math.round(dw * sx * this.scr.k * dpr)));
        const ch = Math.max(1, Math.min(4096, Math.round(dh * sy * this.scr.k * dpr)));
        const key = [cw, ch, w.atlas, w.sprite, w.tex, w.color, w.type, w.fill && w.fill.amt, w.flip].join('|');
        if (n.drawn !== key) {
          el.width = cw; el.height = ch;
          if (drawSprite(n, el, dr)) n.drawn = key;
          else n.drawn = null;
        }
      } else if (w.kind === 'label') {
        const key = this.labelKey(w);
        if (n.drawn !== key) {
          fillLabel(n, el);
          styleLabel(n, el);
          shrinkLabel(n, el);
          n.drawn = key;
        }
      }
    }

    redraw(n) { n.drawn = null; this.draw(n); }

    // ---------------------------------------------------------------- API

    find(name) {
      if (this.index[name]) return this.index[name];
      if (this.index[this.key + '/' + name]) return this.index[this.key + '/' + name];
      let hit = null;
      const suffix = '/' + name;
      this.top.walk((n) => { if (!hit && (n.name === name || n.path.endsWith(suffix))) hit = n; });
      return hit;
    }
    need(name) {
      const n = typeof name === 'string' ? this.find(name) : name;
      if (!n) throw new Error('ngui: không thấy nút "' + name + '" trong ' + this.key);
      return n;
    }
    label(name, text) {
      const n = this.need(name);
      n.w.text = text;
      n.drawn = null;
      if (n.w.overflow === 'resizeFreely' || n.w.overflow === 'resizeHeight') this.refresh();
      else this.draw(n);
      return n;
    }
    sprite(name, spriteName, atlas) {
      const n = this.need(name);
      n.w.sprite = spriteName;
      if (atlas) n.w.atlas = atlas;
      if (n.normal) n.normal.sprite = spriteName;
      this.draw(n);
      return n;
    }
    // UITexture: đường dẫn ảnh tương đối với games/pokeone/ (icon vật phẩm, ảnh Pokémon...).
    texture(name, url) { const n = this.need(name); n.w.tex = url; n.drawn = null; this.draw(n); return n; }
    color(name, hex) { const n = this.need(name); n.w.color = hex; if (n.normal) n.normal.color = hex; this.draw(n); n.kids.forEach((k) => k.walk((m) => this.draw(m))); return n; }
    fill(name, amount) { const n = this.need(name); n.w.fill = Object.assign({ dir: 'horizontal', inv: 0 }, n.w.fill, { amt: amount }); this.draw(n); return n; }
    show(name, on) { const n = this.need(name); n.active = !!on; this.refresh(); return n; }
    // Dịch nút so với chỗ anchor/transform đặt (đơn vị NGUI, y hướng lên).
    offset(name, dx, dy) { const n = this.need(name); n.shift = [dx, dy]; this.refresh(); return n; }
    enable(name, on) {
      const n = this.need(name), b = n.d.b;
      n.state = on ? null : 'disabled';
      if (b) this.paintButton((b.target && this.index[b.target]) || n, b, n.state);
      return n;
    }
    // UISlider/UIProgressBar: foreground là sprite filled thì đổi fillAmount, ngược lại co chiều rộng.
    value(name, v) {
      const n = this.need(name), s = n.d.x && (n.d.x.UISlider || n.d.x.UIScrollBar);
      const fg = s && this.index[s.mFG];
      if (!fg || !fg.w) return n;
      if (fg.w.type === 'filled') this.fill(fg, v);
      else {
        if (fg.fullW === undefined) fg.fullW = fg.w.size[0];
        fg.w.size[0] = Math.max(2, Math.round(fg.fullW * v));
        this.refresh();
      }
      return n;
    }
    on(name, fn) { const n = this.need(name); (this.handlers[n.path] = this.handlers[n.path] || []).push(fn); return n; }
    // Chèn một bản sao prefab/nút vào dưới `parentName` (dòng danh sách, ô túi đồ...). Trả về nút mới.
    add(parentName, key, newName) {
      const parent = this.need(parentName);
      const src = P1.UI_PREFABS[key] || P1.UI[key] || this.need(key).d;
      const name = newName || src.n;
      const path = parent.path + '/' + name;
      const oldPath = P1.UI_PREFABS[key] || P1.UI[key] ? key : this.need(key).path;
      // anchor/tham chiếu trong bản sao trỏ theo đường dẫn cũ: đổi sang đường dẫn mới
      const json = JSON.stringify(src).split('"' + oldPath + '/').join('"' + path + '/').split('"' + oldPath + '"').join('"' + path + '"');
      const data = JSON.parse(json);
      data.n = name;
      data.a = true;
      const n = new Node(data, parent, path);
      parent.kids.push(n);
      n.walk((m) => { this.index[m.path] = m; m.ui = this; });
      const container = parent.panelEl || parent.container;
      const make = (m, c) => {
        if (m.pn) { const pc = document.createElement('div'); pc.className = 'p1ng-panel'; c.appendChild(pc); m.panelEl = pc; c = pc; }
        m.container = c;
        if (m.w || m.d.col) {
          const kind = m.w ? m.w.kind : 'widget';
          const el = document.createElement(kind === 'sprite' || kind === 'texture' ? 'canvas' : 'div');
          el.className = 'p1ng-w' + (kind === 'label' ? ' p1ng-label' : '');
          el.dataset.name = m.name;
          if (m.d.col) { el.classList.add('p1ng-hit'); this.bindInput(m, el); }
          c.appendChild(el);
          m.el = el;
        }
        m.kids.forEach((k) => make(k, c));
      };
      make(n, container);
      this.refresh();
      return n;
    }
    remove(name) {
      const n = this.need(name);
      n.walk((m) => { delete this.index[m.path]; if (m.el) m.el.remove(); if (m.panelEl) m.panelEl.remove(); });
      n.parent.kids.splice(n.parent.kids.indexOf(n), 1);
      this.refresh();
    }
    destroy() {
      if (this.onResize) window.removeEventListener('resize', this.onResize);
      this.rootEl.remove();
    }
  }

  const ngui = P1.ngui = {
    base: '',          // tiền tố đường dẫn tới games/pokeone/ (ui-viewer.html đặt '../')
    build(panelName, parentEl, opts) {
      const ui = new UI(panelName, parentEl, opts);
      return {
        root: ui.rootEl,
        ui,
        find: (n) => ui.find(n),
        label: (n, t) => ui.label(n, t),
        sprite: (n, s, a) => ui.sprite(n, s, a),
        show: (n, on) => ui.show(n, on),
        offset: (n, dx, dy) => ui.offset(n, dx, dy),
        scroll: (n, dx, dy) => ui.scroll(n, dx, dy),
        color: (n, c) => ui.color(n, c),
        texture: (n, url) => ui.texture(n, url),
        fill: (n, v) => ui.fill(n, v),
        value: (n, v) => ui.value(n, v),
        enable: (n, on) => ui.enable(n, on),
        on: (n, fn) => ui.on(n, fn),
        add: (p, k, name) => ui.add(p, k, name),
        remove: (n) => ui.remove(n),
        refresh: () => ui.refresh(),
        destroy: () => ui.destroy(),
      };
    },
    panels() { return Object.keys(P1.UI || {}); },
    // Hứa hẹn xong khi font web và mọi ảnh atlas/texture đang tải đã về (để chụp ảnh kiểm).
    async ready() {
      for (let i = 0; i < 3; i++) {
        await Promise.all(Object.values(images).map((r) => r.done));
        if (document.fonts) await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => r()));
      }
    },
  };
})();
