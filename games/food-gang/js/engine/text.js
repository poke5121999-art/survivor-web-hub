// TextMeshPro-like layout over the exported SDF font asset (glyph metrics in font point units).

const NAMED = { red: [1, 0, 0, 1], white: [1, 1, 1, 1], black: [0, 0, 0, 1], green: [0, 1, 0, 1], blue: [0, 0, 1, 1],
  yellow: [1, 0.92, 0.016, 1], orange: [1, 0.5, 0, 1], purple: [0.63, 0.13, 0.94, 1] };

function parseColor(s) {
  s = s.replace(/["']/g, '').trim();
  if (s[0] === '#') {
    const h = s.slice(1);
    const v = (i) => parseInt(h.substr(i, 2), 16) / 255;
    if (h.length === 3 || h.length === 4) { const w = (i) => parseInt(h[i] + h[i], 16) / 255; return [w(0), w(1), w(2), h.length === 4 ? w(3) : 1]; }
    return [v(0), v(2), v(4), h.length >= 8 ? v(6) : 1];
  }
  return NAMED[s.toLowerCase()] || null;
}

// rich text -> [{ch, color|null, bold, sizeMul}]
export function parseRich(text, rich) {
  const out = [];
  const colors = [], sizes = [];
  let bold = 0;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (rich && ch === '<') {
      const j = s.indexOf('>', i);
      if (j > i) {
        const tag = s.slice(i + 1, j).trim();
        const low = tag.toLowerCase();
        let ok = true;
        if (low.startsWith('color=')) { const c = parseColor(tag.slice(6)); if (c) colors.push(c); else ok = false; }
        else if (low.startsWith('#')) { const c = parseColor(tag); if (c) colors.push(c); else ok = false; }
        else if (low === '/color') colors.pop();
        else if (low === 'b') bold++;
        else if (low === '/b') bold = Math.max(0, bold - 1);
        else if (low.startsWith('size=')) { const v = tag.slice(5); sizes.push(v.endsWith('%') ? parseFloat(v) / 100 : { abs: parseFloat(v) }); }
        else if (low === '/size') sizes.pop();
        else if (low === 'br') out.push({ ch: '\n' });
        else if (/^\/?(i|u|s|uppercase|lowercase|smallcaps|nobr|mark|align|font|material|alpha|cspace|voffset|line-height|indent|pos|space|sprite|style|link|noparse|rotate|width|margin|mspace)\b/.test(low)
          || /^(alpha|cspace|voffset|line-height|indent|pos|space|sprite|style|link|rotate|width|margin|mspace|align|font|mark)=/.test(low)) { /* layout-neutral tags we skip */ }
        else ok = false;
        if (ok) { i = j; continue; }
      }
    }
    out.push({ ch, color: colors.length ? colors[colors.length - 1] : null, bold: bold > 0, size: sizes.length ? sizes[sizes.length - 1] : 1 });
  }
  return out;
}

const H_LEFT = 1, H_CENTER = 2, H_RIGHT = 4, H_JUST = 8, H_FLUSH = 16, H_GEOM = 32;
const V_TOP = 256, V_MID = 512, V_BOT = 1024, V_BASE = 2048, V_GEOM = 4096, V_CAP = 8192;

// Lay out at a given point size. Returns glyph records in rect-local units (origin = rect min corner, y up).
export function layout(font, chars, size, rectW, wrap, cfg) {
  const face = font.face;
  const sc = size / face.pointSize * (face.scale || 1);
  const em = size * 0.01;
  const lines = [];
  let line = { glyphs: [], w: 0, maxAsc: face.ascent * sc, maxDesc: face.descent * sc };
  let x = 0;
  let lastBreak = -1;
  const pushLine = () => { lines.push(line); line = { glyphs: [], w: 0, maxAsc: face.ascent * sc, maxDesc: face.descent * sc }; x = 0; lastBreak = -1; };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c.ch === '\n') { pushLine(); continue; }
    const code = c.ch.codePointAt(0);
    let g = font.glyphs.get(code);
    if (!g) g = font.glyphs.get(9633) || font.glyphs.get(32);
    if (!g) continue;
    const ssc = typeof c.size === 'object' ? c.size.abs / face.pointSize : sc * c.size;
    let adv = g[6] * ssc + (cfg.charSpacing || 0) * em;
    if (c.bold) adv += (font.weights?.boldSpacing ?? 7) * em;
    if (c.ch === ' ') adv += (cfg.wordSpacing || 0) * em;
    if (wrap && rectW > 0 && x + g[4] * ssc + g[7] * ssc > rectW + 0.01 && c.ch !== ' ' && line.glyphs.length) {
      if (lastBreak >= 0) {
        const carry = line.glyphs.splice(lastBreak + 1);
        const shift = carry.length ? carry[0].x : 0;
        line.w = lastBreak >= 0 && line.glyphs.length ? line.glyphs[line.glyphs.length - 1].x + line.glyphs[line.glyphs.length - 1].adv : 0;
        // drop trailing spaces from the closed line
        while (line.glyphs.length && line.glyphs[line.glyphs.length - 1].ch === ' ') line.glyphs.pop();
        line.w = line.glyphs.length ? line.glyphs[line.glyphs.length - 1].x + line.glyphs[line.glyphs.length - 1].vis : 0;
        pushLine();
        for (const q of carry) { q.x -= shift; line.glyphs.push(q); }
        x = carry.length ? carry[carry.length - 1].x + carry[carry.length - 1].adv : 0;
      } else pushLine();
    }
    line.glyphs.push({ g, x, ssc, adv, ch: c.ch, color: c.color, bold: c.bold, vis: (g[4] + g[7]) * ssc });
    if (c.ch === ' ') lastBreak = line.glyphs.length - 1;
    x += adv;
    line.w = Math.max(line.w, c.ch === ' ' ? line.w : x - adv + (g[4] + g[7]) * ssc);
  }
  lines.push(line);
  for (const L of lines) {
    while (L.glyphs.length && L.glyphs[L.glyphs.length - 1].ch === ' ') L.glyphs.pop();
    L.w = L.glyphs.length ? Math.max(...L.glyphs.map((q) => q.x + (q.ch === ' ' ? 0 : q.vis))) : 0;
    L.adv = L.glyphs.length ? L.glyphs[L.glyphs.length - 1].x + L.glyphs[L.glyphs.length - 1].adv : 0;
  }
  const lineH = (face.lineHeight || (face.ascent - face.descent)) * sc + (cfg.lineSpacing || 0) * em;
  const width = Math.max(0, ...lines.map((L) => L.w));
  const height = (face.ascent - face.descent) * sc + (lines.length - 1) * lineH;
  return { lines, sc, lineH, width, height, size, prefW: Math.max(0, ...lines.map((L) => L.adv)) };
}

// Resolve auto-size + alignment into positioned glyph quads (rect-local, y up, origin at rect min).
export function buildText(font, comp, rectW, rectH) {
  const chars = parseRich(comp.text, comp.richText !== 0);
  const m = comp.margin || [0, 0, 0, 0];
  const w = rectW - m[0] - m[2], h = rectH - m[1] - m[3];
  const wrap = comp.wrap !== 0 && comp.wrap !== false;
  const cfg = { charSpacing: comp.spacing?.char || 0, wordSpacing: comp.spacing?.word || 0, lineSpacing: comp.spacing?.line || 0 };
  let L;
  if (comp.autoSize) {
    let lo = comp.sizeMin || 1, hi = comp.sizeMax || comp.size || 36;
    L = layout(font, chars, hi, w, wrap, cfg);
    if (L.width > w + 0.01 || L.height > h + 0.01) {
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        const t = layout(font, chars, mid, w, wrap, cfg);
        if (t.width > w + 0.01 || t.height > h + 0.01) hi = mid; else { lo = mid; L = t; }
      }
      if (L.size > lo + 0.01 || L.width > w + 0.01 || L.height > h + 0.01) L = layout(font, chars, lo, w, wrap, cfg);
    }
  } else L = layout(font, chars, comp.size || 36, w, wrap, cfg);
  const face = font.face, sc = L.sc;
  const al = comp.align ?? 257;
  let top;
  const asc = face.ascent * sc, desc = face.descent * sc;
  if (al & V_TOP) top = rectH - m[3];
  else if (al & V_BOT) top = m[1] + L.height;
  else if (al & V_BASE) top = m[1] + h / 2 + asc;
  else if (al & V_CAP) top = m[1] + h / 2 + (asc - face.cap * sc) + face.cap * sc / 2;
  else top = m[1] + h / 2 + L.height / 2;
  const quads = [];
  const pad = font.padding;
  L.lines.forEach((line, li) => {
    const base = top - asc - li * L.lineH;
    let x0 = m[0];
    if (al & H_CENTER) x0 = m[0] + (w - line.w) / 2;
    else if (al & H_RIGHT) x0 = m[0] + w - line.w;
    for (const q of line.glyphs) {
      if (q.ch === ' ' || q.ch === '\t') continue;
      const g = q.g, s = q.ssc;
      const gx = x0 + q.x + (g[4] - pad) * s;
      const gy = base + (g[5] - g[8] - pad) * s;
      quads.push({ x0: gx, y0: gy, x1: gx + (g[7] + 2 * pad) * s, y1: gy + (g[8] + 2 * pad) * s,
        u0: g[0] - pad, v0: g[1] - pad, u1: g[0] + g[2] + pad, v1: g[1] + g[3] + pad, color: q.color, bold: q.bold });
    }
  });
  return { quads, width: L.width, height: L.height, size: L.size, prefW: L.prefW + m[0] + m[2], prefH: L.height + m[1] + m[3] };
}

export function preferredSize(font, comp) {
  const chars = parseRich(comp.text, comp.richText !== 0);
  const cfg = { charSpacing: comp.spacing?.char || 0, wordSpacing: comp.spacing?.word || 0, lineSpacing: comp.spacing?.line || 0 };
  const L = layout(font, chars, comp.autoSize ? comp.sizeMax : comp.size, 0, false, cfg);
  const m = comp.margin || [0, 0, 0, 0];
  return [L.prefW + m[0] + m[2], L.height + m[1] + m[3]];
}
