// Animated GIF89a encoder. Plain JS, no dependencies; works in browsers and Node.
// encodeGIF(frames, { delayMs, loop, transparent, maxColors }) -> Uint8Array
// frames: [{ width, height, data: Uint8ClampedArray (RGBA) }], all the same size.

function buildPalette(frames, limit, size) {
  // Count distinct opaque colors across all frames.
  const counts = new Map();
  let hasAlpha = false;
  for (const f of frames) {
    const d = f.data;
    for (let i = 0; i < size; i++) {
      const o = i * 4;
      if (d[o + 3] < 128) { hasAlpha = true; continue; }
      const k = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return { counts, hasAlpha };
}

function medianCut(counts, n) {
  const keys = Array.from(counts.keys());
  let boxes = [keys];
  const range = (box) => {
    let rn = 255, rx = 0, gn = 255, gx = 0, bn = 255, bx = 0;
    for (const k of box) {
      const r = k >> 16, g = (k >> 8) & 255, b = k & 255;
      if (r < rn) rn = r; if (r > rx) rx = r;
      if (g < gn) gn = g; if (g > gx) gx = g;
      if (b < bn) bn = b; if (b > bx) bx = b;
    }
    return [rx - rn, gx - gn, bx - bn];
  };
  while (boxes.length < n) {
    let best = -1, bestScore = -1, bestCh = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const rg = range(boxes[i]);
      const ch = rg[0] >= rg[1] && rg[0] >= rg[2] ? 0 : rg[1] >= rg[2] ? 1 : 2;
      const score = rg[ch];
      if (score > bestScore) { bestScore = score; best = i; bestCh = ch; }
    }
    if (best < 0) break;
    const box = boxes[best];
    const shift = 16 - 8 * bestCh;
    box.sort((a, b) => ((a >> shift) & 255) - ((b >> shift) & 255));
    let total = 0;
    for (const k of box) total += counts.get(k);
    let acc = 0, cut = 1;
    for (let i = 0; i < box.length - 1; i++) {
      acc += counts.get(box[i]);
      cut = i + 1;
      if (acc * 2 >= total) break;
    }
    boxes.splice(best, 1, box.slice(0, cut), box.slice(cut));
  }
  return boxes.map((box) => {
    let r = 0, g = 0, b = 0, w = 0;
    for (const k of box) {
      const c = counts.get(k);
      r += (k >> 16) * c; g += ((k >> 8) & 255) * c; b += (k & 255) * c; w += c;
    }
    return [Math.round(r / w), Math.round(g / w), Math.round(b / w)];
  });
}

class ByteSink {
  constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; }
  ensure(extra) {
    if (this.n + extra <= this.buf.length) return;
    let len = this.buf.length * 2;
    while (len < this.n + extra) len *= 2;
    const nb = new Uint8Array(len);
    nb.set(this.buf.subarray(0, this.n));
    this.buf = nb;
  }
  byte(v) { this.ensure(1); this.buf[this.n++] = v & 255; }
  u16(v) { this.byte(v); this.byte(v >> 8); }
  bytes(arr) { this.ensure(arr.length); this.buf.set(arr, this.n); this.n += arr.length; }
  ascii(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  result() { return this.buf.slice(0, this.n); }
}

function lzw(indices, minCodeSize, out) {
  const clear = 1 << minCodeSize, eoi = clear + 1;
  const HSIZE = 8192; // open-addressing table, > 2 * 4096
  const hKey = new Int32Array(HSIZE), hVal = new Int32Array(HSIZE);
  let size = minCodeSize + 1, next = eoi + 1;
  let acc = 0, accBits = 0;
  const block = new Uint8Array(255);
  let blen = 0;
  out.byte(minCodeSize);
  const flush = () => { if (blen) { out.byte(blen); out.bytes(block.subarray(0, blen)); blen = 0; } };
  const emit = (code) => {
    acc |= code << accBits;
    accBits += size;
    while (accBits >= 8) {
      block[blen++] = acc & 255;
      acc >>>= 8; accBits -= 8;
      if (blen === 255) flush();
    }
  };
  const reset = () => { hKey.fill(-1); size = minCodeSize + 1; next = eoi + 1; };
  reset();
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    let h = ((prefix << 5) ^ k ^ (prefix >> 3)) & (HSIZE - 1);
    let found = -1;
    while (hKey[h] !== -1) {
      if (hKey[h] === key) { found = hVal[h]; break; }
      h = (h + 1) & (HSIZE - 1);
    }
    if (found >= 0) { prefix = found; continue; }
    emit(prefix);
    if (next < 4096) {
      hKey[h] = key; hVal[h] = next++;
      if (next > (1 << size) && size < 12) size++;
    } else {
      emit(clear);
      reset();
    }
    prefix = k;
  }
  emit(prefix);
  // The decoder adds one more entry after reading the last code; keep its code size in step.
  if (next < 4096) { next++; if (next > (1 << size) && size < 12) size++; }
  emit(eoi);
  if (accBits > 0) { block[blen++] = acc & 255; if (blen === 255) flush(); }
  flush();
  out.byte(0);
}

export function encodeGIF(frames, { delayMs = 100, loop = true, transparent = true, maxColors = 256 } = {}) {
  if (!frames || !frames.length) throw new Error('no frames to encode');
  const { width, height } = frames[0];
  const size = width * height;
  for (const f of frames) {
    if (f.width !== width || f.height !== height) throw new Error('frame size differs from first frame');
    if (f.data.length < size * 4) throw new Error('frame data shorter than width*height*4');
  }
  const { counts, hasAlpha } = buildPalette(frames, maxColors, size);
  const useTrans = transparent && hasAlpha;
  const cap = Math.max(2, Math.min(256, maxColors | 0));
  const opaqueMax = Math.max(1, cap - (useTrans ? 1 : 0));

  let quant = false;
  let palette; // array of [r,g,b]
  const exact = new Map(); // color key -> index (filled for exact palettes)
  if (counts.size <= opaqueMax) {
    palette = [];
    for (const k of counts.keys()) { exact.set(k, palette.length); palette.push([k >> 16, (k >> 8) & 255, k & 255]); }
  } else {
    // Too many colors: quantize to 6 bits/channel (error <= 3) so median cut and lookups stay fast.
    const q = new Map();
    for (const [k, c] of counts) {
      const qk = ((k >> 18) << 12) | (((k >> 10) & 63) << 6) | ((k >> 2) & 63);
      q.set(qk, (q.get(qk) || 0) + c);
    }
    const ex = (v) => (v << 2) | (v >> 4);
    const qc = new Map();
    for (const [qk, c] of q) qc.set((ex(qk >> 12) << 16) | (ex((qk >> 6) & 63) << 8) | ex(qk & 63), c);
    palette = medianCut(qc, opaqueMax);
    quant = true;
  }
  if (!palette.length) palette.push([0, 0, 0]);
  const transIndex = useTrans ? palette.length : -1;
  const total = palette.length + (useTrans ? 1 : 0);
  let bits = 1;
  while ((1 << bits) < total) bits++;
  const tableSize = 1 << bits;
  const minCode = Math.max(2, bits);

  const qcache = new Uint16Array(1 << 18).fill(256); // 6-bit/channel lookup cache (lossy palettes only)
  const nearest = (r, g, b) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
      const d = dr * dr * 3 + dg * dg * 4 + db * db * 2;
      if (d < bd) { bd = d; best = i; if (!d) break; }
    }
    return best;
  };

  const out = new ByteSink();
  out.ascii('GIF89a');
  out.u16(width); out.u16(height);
  out.byte(0x80 | 0x70 | (bits - 1)); // global table, 8-bit color res, table size
  out.byte(useTrans ? transIndex : 0); // background color index
  out.byte(0); // pixel aspect ratio
  for (let i = 0; i < tableSize; i++) {
    const p = palette[i] || [0, 0, 0];
    out.byte(p[0]); out.byte(p[1]); out.byte(p[2]);
  }
  if (loop) {
    out.byte(0x21); out.byte(0xff); out.byte(11); out.ascii('NETSCAPE2.0');
    out.byte(3); out.byte(1); out.u16(0); out.byte(0);
  }
  const delay = Math.max(1, Math.round(delayMs / 10));
  const idx = new Uint8Array(size);
  for (const f of frames) {
    const d = f.data;
    for (let i = 0; i < size; i++) {
      const o = i * 4;
      if (d[o + 3] < 128) { idx[i] = useTrans ? transIndex : 0; continue; }
      if (quant) {
        const k = ((d[o] >> 2) << 12) | ((d[o + 1] >> 2) << 6) | (d[o + 2] >> 2);
        let v = qcache[k];
        if (v === 255 + 1) { v = nearest(d[o], d[o + 1], d[o + 2]); qcache[k] = v; }
        idx[i] = v;
        continue;
      }
      idx[i] = exact.get((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]);
    }
    out.byte(0x21); out.byte(0xf9); out.byte(4);
    out.byte((2 << 2) | (useTrans ? 1 : 0)); // disposal 2, transparency flag
    out.u16(delay);
    out.byte(useTrans ? transIndex : 0);
    out.byte(0);
    out.byte(0x2c); out.u16(0); out.u16(0); out.u16(width); out.u16(height); out.byte(0);
    lzw(idx, minCode, out);
  }
  out.byte(0x3b);
  return out.result();
}
