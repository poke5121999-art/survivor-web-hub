// uGUI prefabs exported by tools/export_ui.py (art/ui/panels/<panel>.json) laid out as DOM: RectTransform anchors
// resolved against the CanvasScaler reference (750 wide, match width), Horizontal/VerticalLayoutGroup by hand, sprites
// 9-sliced with border-image, legacy Text in Poppins Bold with the English string behind Qarth.AutoTranslation.
// Ported from tools/ui-check.html. Nodes the game code switches on at runtime start hidden; callers toggle them.

const col = c => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;

export class UI {
  constructor(base, sprites, lang) {
    this.base = base;
    this.SPR = sprites;
    this.LANG = lang;
  }

  url(name) { return `${this.base}/sprites/${encodeURIComponent(name)}.webp`; }

  t(key, ...args) {
    let s = this.LANG[key] ?? key;
    args.forEach((a, i) => { s = s.replace(`{${i}}`, a); });
    return s;
  }

  // Lays one prefab out inside `host` (an absolutely positioned box). opts.hide / opts.show: node names to force.
  panel(pj, prefab, host, opts = {}) {
    const nodes = pj.prefabs[prefab || pj.main];
    const hide = new Set(opts.hide || []), show = new Set(opts.show || []);
    const scale = host.clientWidth / 750;
    const cw = 750, ch = host.clientHeight / scale;
    const root = document.createElement('div');
    root.className = 'ui-root';
    root.style.cssText = `position:absolute;left:0;top:0;width:${cw}px;height:${ch}px;transform:scale(${scale});transform-origin:0 0`;
    host.appendChild(root);
    const out = { root, nodes, els: new Map(), byName: new Map(), fits: [] };
    this.build(nodes, 0, root, { x: 0, y: 0, w: cw, h: ch }, null, out, hide, show);
    out.fits.forEach(([el, n]) => this.fit(el, n));
    out.get = name => (out.byName.get(name) || [])[0];
    out.find = path => [...out.els.values()].find(el => el.dataset.path.endsWith(path));
    return out;
  }

  box(n, p) {
    const r = n.rect, amin = r.anchorMin, amax = r.anchorMax, ap = r.anchoredPosition, sd = r.sizeDelta, pv = r.pivot;
    const w = (amax[0] - amin[0]) * p.w + sd[0], h = (amax[1] - amin[1]) * p.h + sd[1];
    const px = p.w * (amin[0] + (amax[0] - amin[0]) * pv[0]) + ap[0];
    const py = p.h * (amin[1] + (amax[1] - amin[1]) * pv[1]) + ap[1];
    return { x: px - pv[0] * w, y: p.h - (py - pv[1] * h) - h, w, h };
  }

  layoutBoxes(par, kids, pb) {
    const L = par.layout, pad = L.padding, [cw, ch] = L.controlChildSize, [fw, fh] = L.forceExpand;
    const horiz = L.type === 'horizontal';
    const innerW = pb.w - pad[0] - pad[2], innerH = pb.h - pad[1] - pad[3];
    const sizes = kids.map(k => {
      const sd = k.rect.sizeDelta, le = k.layoutElement || {};
      let w = sd[0], h = sd[1];
      if (cw) w = le.m_PreferredWidth || le.m_MinWidth || w;
      if (ch) h = le.m_PreferredHeight || le.m_MinHeight || h;
      return [w, h];
    });
    const sp = L.spacing;
    const total = sizes.reduce((a, s) => a + s[horiz ? 0 : 1], 0) + sp * Math.max(0, kids.length - 1);
    if (horiz && fh && ch) sizes.forEach(s => { s[1] = innerH; });
    if (!horiz && fw && cw) sizes.forEach(s => { s[0] = innerW; });
    const al = L.childAlignment;
    const ax = al.includes('Left') ? 0 : al.includes('Right') ? 1 : 0.5;
    const ay = al.startsWith('Upper') ? 0 : al.startsWith('Lower') ? 1 : 0.5;
    const res = [];
    let cur = horiz ? pad[0] + (innerW - total) * ax : pad[3] + (innerH - total) * ay;
    kids.forEach((k, i) => {
      const [w, h] = sizes[i];
      if (horiz) { res.push({ x: cur, y: pad[3] + (innerH - h) * ay, w, h }); cur += w + sp; } else { res.push({ x: pad[0] + (innerW - w) * ax, y: cur, w, h }); cur += h + sp; }
    });
    return res;
  }

  sprite(el, im) {
    const s = this.SPR[im.sprite];
    if (!s) return;
    const url = this.url(im.sprite);
    const tint = im.color;
    const white = tint[0] === 1 && tint[1] === 1 && tint[2] === 1;
    el.style.opacity = tint[3];
    const bl = s.border;
    if (im.type === 'sliced' && (bl[0] || bl[1] || bl[2] || bl[3])) {
      const [l, bo, r, t] = bl;
      el.style.borderStyle = 'solid';
      el.style.borderColor = 'transparent';
      el.style.borderImage = `url("${url}") ${t} ${r} ${bo} ${l} fill / ${t}px ${r}px ${bo}px ${l}px stretch`;
      el.style.borderWidth = `${t}px ${r}px ${bo}px ${l}px`;
    } else {
      el.style.backgroundImage = `url("${url}")`;
      el.style.backgroundSize = '100% 100%';
    }
    if (!white) el.style.filter = `drop-shadow(0 0 0 transparent)`;
    if (!white) {
      el.style.backgroundColor = col([tint[0], tint[1], tint[2], 1]);
      el.style.backgroundBlendMode = 'multiply';
      el.style.webkitMaskImage = `url("${url}")`;
      el.style.webkitMaskSize = '100% 100%';
      el.style.maskImage = `url("${url}")`;
      el.style.maskSize = '100% 100%';
    }
  }

  fit(el, n) {
    const t = n.text;
    if (!t || !t.bestFit) return;
    let fs = t.autoMax;
    el.style.fontSize = `${fs}px`;
    while (fs > t.autoMin && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
      fs--;
      el.style.fontSize = `${fs}px`;
    }
  }

  text(el, n, s) {
    el.textContent = s;
    if (n) this.fit(el, n);
  }

  build(nodes, i, parentEl, pb, bx, out, hide, show) {
    const n = nodes[i];
    const el = document.createElement('div');
    el.className = 'n';
    el.dataset.name = n.name;
    el.dataset.path = n.path;
    const b = bx || (n.rect ? this.box(n, pb) : { x: 0, y: 0, w: pb.w, h: pb.h });
    Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
    const pv = n.rect ? n.rect.pivot : [0.5, 0.5];
    el.style.transformOrigin = `${pv[0] * 100}% ${(1 - pv[1]) * 100}%`;
    const sc = n.rect ? n.rect.scale : [1, 1, 1];
    const rot = n.rect ? n.rect.rotZ : 0;
    if (sc[0] !== 1 || sc[1] !== 1 || rot) el.style.transform = `rotate(${-rot}deg) scale(${sc[0]},${sc[1]})`;
    if (n.canvasGroup && n.canvasGroup.alpha !== 1) el.style.opacity = n.canvasGroup.alpha;
    const im = n.image;
    if (im && im.sprite && im.enabled !== false) {
      this.sprite(el, im);
      if (im.type === 'filled' && im.fillMethod === 'horizontal') el.style.clipPath = `inset(0 ${(1 - im.fillAmount) * 100}% 0 0)`;
    } else if (im && !im.sprite && im.color[3] > 0 && im.enabled !== false && !im.rawTexture) {
      el.style.backgroundColor = col(im.color);
    }
    if (n.button) el.classList.add('btn');
    const t = n.text;
    if (t) {
      el.classList.add('t');
      el.textContent = n.loc && this.LANG[n.loc] != null ? this.LANG[n.loc] : t.text;
      Object.assign(el.style, {
        fontSize: `${t.fontSize}px`, color: col(t.color),
        justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[t.alignment[0]],
        alignItems: { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[t.alignment[1]],
        textAlign: t.alignment[0],
      });
      if (t.wrap === 'overflow') el.style.whiteSpace = 'pre';
      const ef = (n.effects || []).find(e => e.type === 'outline');
      if (ef) {
        const d = Math.max(1, Math.abs(ef.distance[0])), c = col(ef.effectColor || ef.color);
        el.style.textShadow = [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]].map(([x, y]) => `${x}px ${y}px 0 ${c}`).join(',');
      }
      const sh = (n.effects || []).find(e => e.type === 'shadow');
      if (sh && !ef) el.style.textShadow = `${sh.distance[0]}px ${-sh.distance[1]}px 0 ${col(sh.color)}`;
      out.fits.push([el, n]);
    }
    el._node = n;
    el._box = b;
    parentEl.appendChild(el);
    out.els.set(i, el);
    if (!out.byName.has(n.name)) out.byName.set(n.name, []);
    out.byName.get(n.name).push(el);
    const kids = [];
    nodes.forEach((k, j) => { if (k.parent === i) kids.push([k, j]); });
    const live = kids.filter(([k]) => !hide.has(k.name) && (k.active || show.has(k.name)));
    const own = { x: 0, y: 0, w: b.w, h: b.h };
    if (n.layout && n.layout.type !== 'grid') {
      const boxes = this.layoutBoxes(n, live.map(([k]) => k), own);
      live.forEach(([, j], q) => this.build(nodes, j, el, own, boxes[q], out, hide, show));
    } else {
      live.forEach(([k, j]) => {
        if (n.slider && n.slider.fill && n.slider.fillId === k.id) {
          const kk = JSON.parse(JSON.stringify(k));
          kk.rect.anchorMin[0] = 0;
          kk.rect.anchorMax[0] = Math.max(0.02, n.slider.value);
          const copy = nodes.slice();
          copy[j] = kk;
          this.build(copy, j, el, own, null, out, hide, show);
        } else {
          this.build(nodes, j, el, own, null, out, hide, show);
        }
      });
    }
    // Hidden-at-load children still get built (as display:none) so the game can switch them on.
    kids.filter(([k]) => !live.some(([l]) => l === k)).forEach(([, j]) => {
      const e = this.build(nodes, j, el, own, null, out, new Set(), new Set());
      e.style.display = 'none';
    });
    return el;
  }
}

// Slider fill (anchorMax.x = value) on an element built from a node with a slider.
export function setSlider(el, v) {
  const fill = el.querySelector('[data-name="Fill"]');
  if (fill) fill.style.width = `${Math.max(0, Math.min(1, v)) * 100}%`;
}
