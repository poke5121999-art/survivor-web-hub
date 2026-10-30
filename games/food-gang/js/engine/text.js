// TextMeshPro-like layout over the exported SDF font asset (glyph metrics in font point units).
// Characters the SDF atlas lacks (CJK, Arabic, accents the atlas was not baked with...) fall back to Canvas2D glyphs kept
// in a dynamic atlas (see "Fallback glyphs" at the bottom); Arabic words are rasterized as whole runs so letters join.
import { stats } from './assets.js';

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
    let ch = s[i];
    const cp = s.codePointAt(i);
    if (cp > 0xFFFF) { ch = String.fromCodePoint(cp); }
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
    if (ch.length > 1) i += ch.length - 1;
  }
  return clusterArabic(out);
}

// ---- script classes ----
export const isArabic = (c) => (c >= 0x600 && c <= 0x6FF) || (c >= 0x750 && c <= 0x77F) || (c >= 0x8A0 && c <= 0x8FF) || (c >= 0xFB50 && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFF);
// breaks may fall between any two of these (Han, kana, CJK punctuation, full-width); Hangul keeps word wrap like TMP
export const isCJK = (c) => (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF) || (c >= 0xFE30 && c <= 0xFE4F) || (c >= 0xFF00 && c <= 0xFFEF) || (c >= 0x20000 && c <= 0x2FA1F);
const ZERO_WIDTH = (c) => (c >= 0x200B && c <= 0x200F) || (c >= 0x202A && c <= 0x202E) || c === 0x2060 || c === 0xFEFF || (c >= 0x2066 && c <= 0x2069);
// kinsoku (D:/foodgang-ref/export/text/LineBreaking *.txt): cannot start / cannot end a line
const NO_START = new Set(')]｝〕〉》」』】〙〗〟’”｠»ヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻‐゠–〜?!‼⁇⁈⁉・、%,.:;。！？］）：；＝}¢°"†‡℃〆％，．');
const NO_END = new Set('([｛〔〈《「『【〘〖〝‘“｟«$—…‥〳〴〵［（{£¥"々〇＄￥￦#');

// consecutive Arabic code points (same style) become one item so the canvas can shape/join the whole word
function clusterArabic(items) {
  const out = [];
  let run = null;
  for (const it of items) {
    const code = it.ch.codePointAt(0);
    const inRun = isArabic(code) || ((code === 0x200C || code === 0x200D) && run);
    if (inRun) {
      if (run && run.color === it.color && run.bold === it.bold && run.size === it.size) { run.ch += it.ch; continue; }
      run = { ch: it.ch, color: it.color, bold: it.bold, size: it.size, rtl: true };
      out.push(run);
    } else { run = null; out.push(it); }
  }
  return out;
}

const H_LEFT = 1, H_CENTER = 2, H_RIGHT = 4, H_JUST = 8, H_FLUSH = 16, H_GEOM = 32;
const V_TOP = 256, V_MID = 512, V_BOT = 1024, V_BASE = 2048, V_GEOM = 4096, V_CAP = 8192;

const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' };

function glyphFor(font, c, code) {
  if (c.rtl) return fbGlyph(font, c.ch, c.bold, true);
  let g = font.glyphs.get(code);
  if (!g && code === 0xA0) g = font.glyphs.get(32);
  if (!g) g = fbGlyph(font, c.ch, c.bold, false);
  return g || font.glyphs.get(9633) || font.glyphs.get(32);
}

// Unicode bidi, reduced: Arabic words (rtl items) are strong R, letters/digits strong L, the rest neutral. Levels follow
// the first strong item; reversing runs from the highest level down gives the visual order. Brackets at odd levels mirror.
function reorderBidi(font, line, em, cfg) {
  const gl = line.glyphs, n = gl.length;
  if (!gl.some((q) => q.rtl)) return;
  const cls = gl.map((q) => (q.rtl ? 'R' : /[\p{L}\p{N}]/u.test(q.ch) ? 'L' : 'N'));
  const first = cls.find((k) => k !== 'N');
  const base = first === 'R' ? 1 : 0;
  const res = cls.slice();
  for (let i = 0; i < n; i++) {
    if (cls[i] !== 'N') continue;
    let j = i; while (j < n && cls[j] === 'N') j++;
    const prev = i ? cls[i - 1] : null, next = j < n ? cls[j] : null;
    const k = prev && next && prev === next ? prev : (base ? 'R' : 'L');
    for (let m = i; m < j; m++) res[m] = k;
    i = j - 1;
  }
  const lv = res.map((k) => (k === 'R' ? 1 : base ? 2 : 0));
  const maxL = Math.max(...lv);
  for (let l = maxL; l >= 1; l--) {
    for (let i = 0; i < n;) {
      if (lv[i] < l) { i++; continue; }
      let j = i; while (j < n && lv[j] >= l) j++;
      for (let a = i, b = j - 1; a < b; a++, b--) { [gl[a], gl[b]] = [gl[b], gl[a]]; [lv[a], lv[b]] = [lv[b], lv[a]]; }
      i = j;
    }
  }
  let x = 0;
  for (let i = 0; i < n; i++) {
    const q = gl[i];
    if (lv[i] & 1 && MIRROR[q.ch] && !q.rtl) {
      const g = font.glyphs.get(MIRROR[q.ch].codePointAt(0));
      if (g) { q.g = g; q.adv = g[6] * q.ssc + (cfg.charSpacing || 0) * em + (q.bold ? (font.weights?.boldSpacing ?? 7) * em : 0); q.vis = (g[4] + g[7]) * q.ssc; }
    }
    q.x = x; x += q.adv;
  }
}

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
    if (ZERO_WIDTH(code) || code < 32) continue;
    const g = glyphFor(font, c, code);
    if (!g) continue;
    const ssc = typeof c.size === 'object' ? c.size.abs / face.pointSize : sc * c.size;
    let adv = g[6] * ssc + (cfg.charSpacing || 0) * em;
    if (c.bold) adv += (font.weights?.boldSpacing ?? 7) * em;
    if (c.ch === ' ') adv += (cfg.wordSpacing || 0) * em;
    // CJK has no spaces: a break may fall between any two characters unless kinsoku forbids it
    const pg = line.glyphs[line.glyphs.length - 1];
    if (pg && pg.ch !== ' ' && c.ch !== ' ' && (isCJK(pg.code) || isCJK(code)) && !NO_START.has(c.ch) && !NO_END.has(pg.ch)) lastBreak = line.glyphs.length - 1;
    if (wrap && rectW > 0 && x + g[4] * ssc + g[7] * ssc > rectW + 0.01 && c.ch !== ' ' && line.glyphs.length) {
      if (lastBreak >= 0) {
        const carry = line.glyphs.splice(lastBreak + 1);
        const shift = carry.length ? carry[0].x : 0;
        // drop trailing spaces from the closed line
        while (line.glyphs.length && line.glyphs[line.glyphs.length - 1].ch === ' ') line.glyphs.pop();
        line.w = line.glyphs.length ? line.glyphs[line.glyphs.length - 1].x + line.glyphs[line.glyphs.length - 1].vis : 0;
        pushLine();
        for (const q of carry) { q.x -= shift; line.glyphs.push(q); }
        x = carry.length ? carry[carry.length - 1].x + carry[carry.length - 1].adv : 0;
      } else pushLine();
    }
    line.glyphs.push({ g, x, ssc, adv, ch: c.ch, code, color: c.color, bold: c.bold, rtl: !!c.rtl, vis: (g[4] + g[7]) * ssc });
    if (c.ch === ' ') lastBreak = line.glyphs.length - 1;
    x += adv;
    line.w = Math.max(line.w, c.ch === ' ' ? line.w : x - adv + (g[4] + g[7]) * ssc);
  }
  lines.push(line);
  for (const L of lines) {
    while (L.glyphs.length && L.glyphs[L.glyphs.length - 1].ch === ' ') L.glyphs.pop();
    reorderBidi(font, L, em, cfg);
    L.w = L.glyphs.length ? Math.max(...L.glyphs.map((q) => q.x + (q.ch === ' ' ? 0 : q.vis))) : 0;
    L.adv = L.glyphs.length ? Math.max(...L.glyphs.map((q) => q.x + q.adv)) : 0;
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
      if (q.ch === ' ' || q.ch === '	') continue;
      const g = q.g, s = q.ssc;
      if (g.fb && !(g[2] > 0 && g[3] > 0)) continue;   // blank fallback glyph
      const pg = g.fb ? g.pad : pad, pu = g.fb ? g.padPx : pad;
      const gx = x0 + q.x + (g[4] - pg) * s;
      const gy = base + (g[5] - g[8] - pg) * s;
      quads.push({ x0: gx, y0: gy, x1: gx + (g[7] + 2 * pg) * s, y1: gy + (g[8] + 2 * pg) * s, s,
        u0: g[0] - pu, v0: g[1] - pu, u1: g[0] + g[2] + pu, v1: g[1] + g[3] + pu, color: q.color, bold: q.bold, page: g.fb ? g.page : null });
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


// ------------------------------------------------------------------------------------------------ Fallback glyphs
// The original falls back to NotoSans*-Bold SDF fonts (many MB). Here a missing character is rasterized by Canvas2D and
// packed into 1024x1024 alpha pages that grow by adding pages. Characters covered by the shipped Tobi OTF (accents the
// SDF atlas was not baked with) use that face so they look like the rest; everything else uses a bold system sans-serif.
// Metrics come from measureText and are scaled to the TMP point size (RASTER px = one em = face.pointSize points), so
// advance, bearings, alignment, autoSize and wrapping behave like SDF glyphs. Glyph records match the SDF layout
// [x, y(bottom-up), w, h, bearingX, bearingY, advance, w, h] + { fb, page, pad, padPx }.
const RASTER = 64, PAGE = 1024, GPAD = 2;
const STACK = "'Noto Sans', 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC', 'Noto Sans Arabic', 'Noto Sans Thai', 'Segoe UI', 'Microsoft YaHei', 'Yu Gothic', 'Malgun Gothic', Tahoma, sans-serif";

export const fallbackState = { pages: [], glyphs: new Map(), cover: null, family: null, ctx: null };

// codepoint ranges of the Tobi OTF (cmap format 4 or 12), so we know which missing characters it can draw
function parseCmap(buf) {
  const v = new DataView(buf);
  const n = v.getUint16(4);
  let off = 0;
  for (let i = 0; i < n; i++) if (v.getUint32(12 + i * 16) === 0x636d6170) off = v.getUint32(12 + i * 16 + 8);
  if (!off) return [];
  const sub = [];
  for (let i = 0; i < v.getUint16(off + 2); i++) sub.push({ pid: v.getUint16(off + 4 + i * 8), eid: v.getUint16(off + 6 + i * 8), o: off + v.getUint32(off + 8 + i * 8) });
  const t = sub.find((x) => x.pid === 3 && x.eid === 10) || sub.find((x) => x.pid === 3 && x.eid === 1) || sub.find((x) => x.pid === 0) || sub[0];
  if (!t) return [];
  const ranges = [];
  const fmt = v.getUint16(t.o);
  if (fmt === 12) {
    for (let i = 0, g = v.getUint32(t.o + 12); i < g; i++) ranges.push([v.getUint32(t.o + 16 + i * 12), v.getUint32(t.o + 20 + i * 12)]);
  } else if (fmt === 4) {
    const sc = v.getUint16(t.o + 6) / 2;
    const ends = t.o + 14, starts = ends + sc * 2 + 2;
    for (let i = 0; i < sc; i++) { const e = v.getUint16(ends + i * 2), b = v.getUint16(starts + i * 2); if (b !== 0xFFFF) ranges.push([b, e]); }
  }
  return ranges;
}

// Loads the OTF as the page font 'FgTobi'. Safe to call once per font; resolves when canvas can use it.
export async function loadFallbackFont(url) {
  const st = fallbackState;
  if (st.loading) return st.loading;
  st.loading = (async () => {
    try {
      const buf = await (await fetch(url)).arrayBuffer();
      st.cover = parseCmap(buf);
      const ff = new FontFace('FgTobi', buf);
      await ff.load();
      document.fonts.add(ff);
      st.family = 'FgTobi';
    } catch (e) { stats.errors.push('fallback font: ' + e.message); }
    return st;
  })();
  return st.loading;
}

const inTobi = (code) => { const c = fallbackState.cover; return !!c && c.some((r) => code >= r[0] && code <= r[1]); };

function newPage() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = PAGE;
  const page = { cv, ctx: cv.getContext('2d', { willReadFrequently: false }), x: 0, y: 0, rowH: 0, dirty: true, tex: null, id: fallbackState.pages.length };
  fallbackState.pages.push(page);
  stats.fbPages = fallbackState.pages.length;
  return page;
}

function alloc(w, h) {
  const st = fallbackState;
  let pg = st.pages[st.pages.length - 1] || newPage();
  if (pg.x + w > PAGE) { pg.y += pg.rowH; pg.x = 0; pg.rowH = 0; }
  if (pg.y + h > PAGE) { pg = newPage(); }
  const r = { page: pg, x: pg.x, y: pg.y };
  pg.x += w; pg.rowH = Math.max(pg.rowH, h);
  return r;
}

function fbGlyph(font, str, bold, run) {
  if (typeof document === 'undefined') return null;
  const code = str.codePointAt(0);
  const tobi = !run && inTobi(code);
  const key = (tobi ? 'T' : run ? 'R' : 'N') + (bold && !tobi ? 'b' : '') + str + font.face.pointSize;
  const st = fallbackState;
  let g = st.glyphs.get(key);
  if (g !== undefined) return g;
  if (!st.ctx) st.ctx = document.createElement('canvas').getContext('2d');
  const ctx = st.ctx;
  ctx.font = tobi ? `${RASTER}px ${st.family}` : `bold ${RASTER}px ${STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.direction = run ? 'rtl' : 'ltr';
  const mt = ctx.measureText(str);
  const k = font.face.pointSize / RASTER;
  const L = Math.ceil(Math.max(0, mt.actualBoundingBoxLeft)), Rr = Math.ceil(Math.max(0, mt.actualBoundingBoxRight));
  const asc = Math.ceil(mt.actualBoundingBoxAscent), desc = Math.ceil(Math.max(0, mt.actualBoundingBoxDescent));
  const wpx = Rr + L, hpx = asc + desc;
  g = [0, 0, 0, 0, 0, 0, mt.width * k, 0, 0];
  g.fb = true; g.pad = GPAD * k; g.padPx = GPAD; g.page = null;
  if (wpx > 0 && hpx > 0 && wpx < PAGE - 8 && hpx < PAGE - 8) {
    const cell = alloc(wpx + GPAD * 2, hpx + GPAD * 2);
    const pg = cell.page;
    pg.ctx.font = ctx.font; pg.ctx.textAlign = 'left'; pg.ctx.textBaseline = 'alphabetic'; pg.ctx.direction = ctx.direction;
    pg.ctx.fillStyle = '#fff';
    pg.ctx.fillText(str, cell.x + GPAD + L, cell.y + GPAD + asc);
    pg.dirty = true;
    g[0] = cell.x + GPAD; g[1] = PAGE - (cell.y + GPAD + hpx); g[2] = wpx; g[3] = hpx;
    g[4] = -L * k; g[5] = asc * k; g[7] = wpx * k; g[8] = hpx * k;
    g.page = pg;
  }
  stats.fbGlyphs++;
  st.glyphs.set(key, g);
  return g;
}

// GL texture of a fallback page, re-uploaded when new glyphs were drawn into it (R = Renderer)
export function fallbackTexture(R, page) {
  const gl = R.gl;
  if (!page.tex) {
    page.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, page.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    page.dirty = true;
  }
  if (page.dirty) {
    gl.bindTexture(gl.TEXTURE_2D, page.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, page.cv);
    page.dirty = false;
  }
  return page.tex;
}
