// Crisp canvas text for the UI kit: rasterised at devicePixelRatio * u texels per design px, cached by
// string and style, drawn on a quad. Padding is measured from the real glyph ink, so Ầ Ễ Ộ Ữ are never clipped.

import { beastWords } from './words.js?v=20261124b';

const FAMILY = '"Arial Black","Segoe UI Black",Roboto,"Noto Sans","DejaVu Sans",sans-serif';
const MAX_TEX = 2048;

export function makeText(THREE, { scale, mkNode }) {
  const cache = new Map();
  const live = new Set();
  const meas = document.createElement('canvas').getContext('2d');

  function wrap(str, font, maxW, sc) {
    const out = [];
    for (const para of String(str).split('\n')) {
      if (!maxW) { out.push(para); continue; }
      meas.font = font; let line = '';
      for (const word of para.split(' ')) {
        const t = line ? line + ' ' + word : word;
        if (line && meas.measureText(t).width / sc > maxW) { out.push(line); line = word; } else line = t;
      }
      out.push(line);
    }
    return out;
  }

  // one raster: returns { canvas, tex, layout } and counts references
  function raster(str, st, sc) {
    const key = `${str}|${st.size}|${st.weight}|${st.color}|${st.outline}|${st.outlineW}|${st.align}|${st.maxW}|${st.lineH}|${st.shadow}|${sc}`;
    let e = cache.get(key); if (e) { e.refs++; return e; }
    let s2 = sc;
    const font = (k) => `${st.weight} ${st.size * k}px ${FAMILY}`;
    meas.font = font(s2);
    let lines = wrap(str, font(s2), st.maxW, s2);
    let widest = 0; for (const l of lines) widest = Math.max(widest, meas.measureText(l).width / s2);
    const ow = st.outline == null ? 0 : st.outlineW;
    let padX = Math.ceil(ow + st.size * 0.12 + 1);
    if ((widest + padX * 2) * s2 > MAX_TEX) { s2 = MAX_TEX / (widest + padX * 2); meas.font = font(s2); }
    // real ink extents of every line, taken at the raster scale
    let ia = 0, id = 0; let fa = 0, fd = 0;
    for (const l of lines) {
      const m = meas.measureText(l || ' ');
      ia = Math.max(ia, m.actualBoundingBoxAscent / s2); id = Math.max(id, m.actualBoundingBoxDescent / s2);
      fa = Math.max(fa, (m.fontBoundingBoxAscent ?? st.size * 0.95) / s2); fd = Math.max(fd, (m.fontBoundingBoxDescent ?? st.size * 0.25) / s2);
    }
    const lineH = st.lineH, lead = (lineH - (fa + fd)) / 2;
    const baseOff = lead + fa;                       // baseline below the top of a line box
    const needTop = Math.max(0, ia - baseOff) + ow + 2 / s2 + st.size * 0.04;
    const needBot = Math.max(0, id - (lineH - baseOff)) + ow + 2 / s2 + st.size * 0.04;
    const padT = Math.ceil(needTop * s2) / s2, padB = Math.ceil(needBot * s2) / s2;
    const innerW = widest, innerH = lines.length * lineH;
    const cw = Math.ceil((innerW + padX * 2) * s2), ch = Math.ceil((innerH + padT + padB) * s2);
    const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
    const g = canvas.getContext('2d');
    g.font = font(s2); g.textBaseline = 'alphabetic'; g.lineJoin = 'round'; g.miterLimit = 2; g.textAlign = st.align;
    const ax = st.align === 'left' ? padX : st.align === 'right' ? padX + innerW : padX + innerW / 2;
    lines.forEach((l, i) => {
      const y = padT + i * lineH + baseOff;
      if (st.shadow) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(l, ax * s2, (y + st.shadow) * s2); }
      if (ow) { g.strokeStyle = st.outlineCss; g.lineWidth = ow * 2 * s2; g.strokeText(l, ax * s2, y * s2); }
      g.fillStyle = st.colorCss; g.fillText(l, ax * s2, y * s2);
    });
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    e = { key, canvas, tex, refs: 1, s: s2, cw, ch, padX, padT, padB, innerW, innerH, texelsPerUnit: cw / (innerW + padX * 2) };
    cache.set(key, e); return e;
  }
  function release(e) { if (--e.refs <= 0) { e.tex.dispose(); cache.delete(e.key); } }

  const css = (hex) => '#' + (hex & 0xffffff).toString(16).padStart(6, '0');

  function text(str, o = {}) {
    const size = o.size ?? 16;
    const st = {
      size, weight: o.weight ?? 900, align: o.align ?? 'left', maxW: o.maxW || 0, lineH: o.lineH ?? Math.round(size * 1.22),
      outline: o.outline === null ? null : (o.outline ?? 0x1a1420), color: o.color ?? 0xffffff, shadow: o.shadow || 0,
    };
    st.outlineW = st.outline == null ? 0 : (o.outlineW ?? Math.max(1.4, size * 0.13));
    st.colorCss = css(st.color); st.outlineCss = css(st.outline ?? 0);
    const upper = !!o.upper, mid = o.valign === 'mid';
    const n = mkNode(0, 0);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); n.add(mesh);
    let cur = null, text0 = '';
    const rec = { n, redo: () => apply(text0) };
    function apply(s) {
      text0 = String(s); const w = beastWords(text0), shown = upper ? w.toLocaleUpperCase('vi') : w;
      const prev = cur; cur = raster(shown, st, scale()); if (prev) release(prev);
      const e = cur; mat.map = e.tex; mat.needsUpdate = true;
      const qw = e.cw / e.s, qh = e.ch / e.s; mesh.scale.set(qw, qh, 1);
      const cx = st.align === 'left' ? -e.padX + qw / 2 : st.align === 'right' ? e.padX - qw / 2 : 0;
      const cy = e.padT - qh / 2 + (mid ? e.innerH / 2 : 0);
      mesh.position.set(cx, cy, 0);
      n.str = shown; // read by tools/text-fit-test.mjs
      n.w = e.innerW; n.h = e.innerH; n.canvas = e.canvas; n.quadW = qw; n.texels = e.texelsPerUnit; n.padT = e.padT; n.padB = e.padB;
    }
    n.set = (s) => { if (String(s) !== text0) apply(s); return n; };
    n.setColor = (c) => { mat.color.set(c); return n; };       // tint multiplies the baked colour: pass 0xffffff to reset
    n.setOpacity = (a) => { mat.opacity = a; return n; };
    n.dispose = () => { if (cur) release(cur); cur = null; mat.dispose(); mesh.geometry.dispose(); live.delete(rec); n.parent && n.parent.remove(n); };
    n.mesh = mesh; apply(str); live.add(rec);
    return n;
  }
  const reraster = () => { for (const r of live) r.redo(); };
  // advance width of a string in design units at the kit's font, without rasterising it
  const measure = (str, size, weight = 900) => { meas.font = `${weight} ${size}px ${FAMILY}`; return meas.measureText(String(str)).width; };
  return { text, reraster, measure, stats: () => ({ cached: cache.size, live: live.size }) };
}
