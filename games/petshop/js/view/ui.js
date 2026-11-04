// The original uGUI screens (art/ui/ui.json, tools/export_ui.py) rebuilt as DOM.
// Layout follows RectTransform: anchors are fractions of the parent rect, sizeDelta adds to the anchor span, the
// pivot sits at anchor point + anchoredPosition (Unity y grows up). The canvas is CanvasScaler 720 x 1280 in Expand
// Pet Shop: CanvasScaler 1920 x 1080, MatchWidthOrHeight 0.5 (see resize).
// Image: m_Type 0 simple (stretched, or contained with preserveAspect), 1 sliced (CSS border-image from the sprite's
// border, drawn at border * 100 / (pixelsPerUnit * multiplier) canvas units). A tint other than white goes through a
// CSS mask filled with the colour (the tinted sprites are white shapes). TextMeshPro: size, colour, alignment,
// auto-size (shrunk until it fits), upper-case style; rich-text tags are dropped. The TMP fonts ship only as SDF
// atlases (Bakbak One), so text uses that family when installed and a heavy sans-serif otherwise.

const FONT = "'Noto Sans', 'Arial Narrow', sans-serif";
const rgba = c => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;
const white = c => c[0] > 0.99 && c[1] > 0.99 && c[2] > 0.99;

export class UiLayer {
  constructor(host, ui, base) {
    this.ui = ui;
    this.base = base;
    this.host = host;
    this.el = document.createElement('div');
    this.el.className = 'ui';
    host.appendChild(this.el);
    this.panels = [];
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const W = this.host.clientWidth || 360, H = this.host.clientHeight || 640;
    const [rw, rh] = this.ui.canvas;
    // CanvasScaler ScaleWithScreenSize, match mode 0 (MatchWidthOrHeight) at ui.match: log-space blend of the two ratios.
    const m = this.ui.match ?? 0.5;
    const k = Math.pow(2, (1 - m) * Math.log2(W / rw) + m * Math.log2(H / rh));
    this.k = k;
    this.cw = W / k; this.ch = H / k;
    Object.assign(this.el.style, { width: `${this.cw}px`, height: `${this.ch}px`, transform: `scale(${k})` });
    for (const p of this.panels) p.layout(this.cw, this.ch);
  }

  // A panel the caller places and lays out itself (list cells such as the skin shop's SkinForm).
  cell(name) { return new Panel(this, this.ui.roots[name]); }

  // A panel per exported root; its DOM lives inside the canvas layer.
  panel(name) {
    const p = new Panel(this, this.ui.roots[name]);
    this.el.appendChild(p.el);
    p.layout(this.cw, this.ch);
    this.panels.push(p);
    return p;
  }
}

export class Panel {
  constructor(layer, root) {
    this.layer = layer;
    this.root = root;
    this.nodes = new Map();      // path -> { el, n }
    this.el = this.make(root, '');
  }

  make(n, path) {
    const el = document.createElement('div');
    el.className = 'u';
    el.dataset.n = n.n;
    el._n = n;
    const p = path ? `${path}/${n.n}` : n.n;
    if (!this.nodes.has(p)) this.nodes.set(p, { el, n });
    el.hidden = !n.on;
    const im = n.img;
    if (im && im.s && im.on !== false) {
      const url = `url("${this.layer.base}/${im.s}")`;
      const tint = !white(im.c);
      if (im.t === 1 && im.border && im.border.some(b => b > 0)) {
        const [l, b, r, t] = im.border, sc = 100 / ((im.ppu || 100) * (im.pm || 1));
        const slice = `${t} ${r} ${b} ${l} fill`, width = `${t * sc}px ${r * sc}px ${b * sc}px ${l * sc}px`;
        if (tint) {
          el.style.webkitMaskBoxImage = `${url} ${t} ${r} ${b} ${l} / ${width}`;
          el.style.backgroundColor = rgba(im.c);
        } else {
          // On its own layer: real CSS borders would move the padding box the children are placed in.
          const bg = document.createElement('i');
          bg.className = 'sl';
          Object.assign(bg.style, { borderStyle: 'solid', borderWidth: width, borderImage: `${url} ${slice} / ${width}` });
          if (im.c[3] < 1) bg.style.opacity = im.c[3];
          el.appendChild(bg);
        }
      } else if (tint) {
        Object.assign(el.style, { webkitMaskImage: url, maskImage: url, webkitMaskSize: im.keep ? 'contain' : '100% 100%',
          maskSize: im.keep ? 'contain' : '100% 100%', webkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
          webkitMaskPosition: 'center', maskPosition: 'center', backgroundColor: rgba(im.c) });
      } else {
        Object.assign(el.style, { backgroundImage: url, backgroundSize: im.keep ? 'contain' : '100% 100%', backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center' });
        if (im.c[3] < 1) el.style.opacity = im.c[3];
      }
    }
    if (n.txt && n.txt.on !== false) {
      const t = n.txt, s = el.style;
      el.classList.add('t');
      if (t.wrap) el.classList.add('wrap');
      s.color = rgba(t.c);
      s.fontFamily = FONT;
      s.justifyContent = t.ha & 1 ? 'flex-start' : t.ha & 4 ? 'flex-end' : 'center';
      s.textAlign = t.ha & 1 ? 'left' : t.ha & 4 ? 'right' : 'center';
      s.alignItems = t.va & 256 ? 'flex-start' : t.va & 1024 ? 'flex-end' : 'center';
      if (t.style & 16) s.textTransform = 'uppercase';
      if (t.style & 8) s.textTransform = 'lowercase';
      if (t.mat && t.mat.ow > 0 && t.mat.oc) s.webkitTextStroke = `${(t.mat.ow * t.fs * 0.5).toFixed(1)}px ${rgba(t.mat.oc)}`;
      // TMP underlay (UNDERLAY_ON): a shadow copy behind the glyphs, offset in font units.
      if (t.mat && t.mat.uc && (t.mat.kw || []).includes('UNDERLAY_ON')) {
        const [ux, uy, us] = t.mat.ul;
        s.textShadow = `${(ux * t.fs * 0.1).toFixed(1)}px ${(-uy * t.fs * 0.1).toFixed(1)}px ${(1 + us * t.fs * 0.2).toFixed(1)}px ${rgba(t.mat.uc)}, 0 0 2px ${rgba(t.mat.uc)}`;
      }
      const span = document.createElement('span');
      el.appendChild(span);
      el._span = span;
      this.text(el, n, n.txt.t);
    }
    if (n.btn) el.classList.add('b');
    for (const k of n.kids || []) el.appendChild(this.make(k, p));
    return el;
  }

  layout(pw, ph, el = this.el) {
    const n = el._n, rt = n.rt;
    const ax0 = rt.a0[0] * pw, ax1 = rt.a1[0] * pw, ay0 = rt.a0[1] * ph, ay1 = rt.a1[1] * ph;
    const w = ax1 - ax0 + rt.size[0], h = ay1 - ay0 + rt.size[1];
    const px = ax0 + (ax1 - ax0) * rt.pv[0] + rt.pos[0], py = ay0 + (ay1 - ay0) * rt.pv[1] + rt.pos[1];
    const left = px - rt.pv[0] * w, bottom = py - rt.pv[1] * h;
    Object.assign(el.style, { left: `${left}px`, top: `${ph - bottom - h}px`, width: `${w}px`, height: `${h}px` });
    const tf = [];
    if (rt.sc[0] !== 1 || rt.sc[1] !== 1) tf.push(`scale(${rt.sc[0]},${rt.sc[1]})`);
    if (Math.abs(rt.rot) > 0.01) tf.push(`rotate(${-rt.rot}deg)`);
    if (tf.length) { el.style.transform = tf.join(' '); el.style.transformOrigin = `${rt.pv[0] * 100}% ${(1 - rt.pv[1]) * 100}%`; }
    for (const c of el.children) if (c._n && !c._cell) this.layout(w, h, c);   // list cells are placed by their owner
    if (el._span) this.fit(el);
  }

  // TMP auto-size: largest size up to fontSizeMax that fits the rect, not below fontSizeMin.
  fit(el) {
    const t = el._n.txt;
    let fs = t.auto ? t.max : t.fs;
    el.style.fontSize = `${fs}px`;
    if (!t.auto || !el.isConnected || !el._span.offsetWidth) return;
    const w = parseFloat(el.style.width), h = parseFloat(el.style.height);
    for (let i = 0; i < 40 && fs > t.min && (el._span.offsetWidth > w + 0.5 || el._span.offsetHeight > h + 0.5); i++) {
      fs = Math.max(t.min, fs * 0.92);
      el.style.fontSize = `${fs}px`;
    }
  }

  // TMP rich text: <color=#rrggbb> runs become coloured spans, other tags are dropped.
  text(el, n, value) {
    const raw = String(value);
    if (el._raw === raw) return;
    el._raw = raw;
    const span = el._span;
    span.textContent = '';
    let color = null;
    for (const part of raw.split(/(<[^>]+>)/)) {
      if (!part) continue;
      const m = /^<color=(#[0-9a-fA-F]{6,8})>$/.exec(part);
      if (m) { color = m[1].slice(0, 7); continue; }
      if (/^<\/color>$/.test(part)) { color = null; continue; }
      if (part[0] === '<' && part[part.length - 1] === '>') continue;
      if (color) { const c = document.createElement('span'); c.style.color = color; c.textContent = part; span.appendChild(c); }
      else span.appendChild(document.createTextNode(part));
    }
    this.fit(el);
  }

  // I2 Localize: every text with a term gets the term's translation (T returns null for unknown terms).
  translate(T) {
    for (const { el, n } of this.nodes.values()) {
      if (!el._span || !n.txt || !n.txt.term) continue;
      const v = T(n.txt.term);
      if (v != null) this.text(el, n, v);
    }
  }

  // q('Frame/UpgradeFrame1/Name') -> element (path below the root, first match).
  q(path) {
    const hit = this.nodes.get(`${this.root.n}/${path}`);
    return hit && hit.el;
  }

  set(path, value) { const el = this.q(path); if (el && el._span) this.text(el, el._n, value); }
  show(path, on) { const el = path ? this.q(path) : this.el; if (el) el.hidden = !on; }
}
