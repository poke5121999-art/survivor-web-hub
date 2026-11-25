// Bộ đọc PSD/PSB thuần JS, không phụ thuộc. Viết theo đặc tả định dạng PSD công khai của Adobe.
// readPSD(bytes) -> { width, height, layers: [...] } (lớp xếp từ dưới lên trên).

const BLEND = { 'norm': 'normal', 'mul ': 'multiply', 'scrn': 'screen', 'lddg': 'additive' };
const MODE_NAMES = { 0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab' };
const WIDE_KEYS = new Set(['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD']);

class Reader {
  constructor(bytes) {
    this.b = bytes;
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.p = 0;
  }
  need(n) { if (this.p + n > this.b.length) throw new Error('Tệp PSD bị cắt cụt hoặc hỏng'); }
  u8() { this.need(1); return this.v.getUint8(this.p++); }
  u16() { this.need(2); const x = this.v.getUint16(this.p); this.p += 2; return x; }
  i16() { this.need(2); const x = this.v.getInt16(this.p); this.p += 2; return x; }
  u32() { this.need(4); const x = this.v.getUint32(this.p); this.p += 4; return x; }
  i32() { this.need(4); const x = this.v.getInt32(this.p); this.p += 4; return x; }
  u64() { const hi = this.u32(); const lo = this.u32(); return hi * 4294967296 + lo; }
  str(n) { this.need(n); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.b[this.p + i]); this.p += n; return s; }
  skip(n) { this.need(n); this.p += n; }
}

function utf16be(b, start, chars) {
  let s = '';
  for (let i = 0; i < chars; i++) s += String.fromCharCode((b[start + 2 * i] << 8) | b[start + 2 * i + 1]);
  return s;
}

function unpackBits(src, pos, end, out, outPos, outEnd) {
  while (pos < end && outPos < outEnd) {
    const n = (src[pos++] << 24) >> 24;
    if (n >= 0) {
      const c = n + 1;
      for (let i = 0; i < c && outPos < outEnd; i++) out[outPos++] = src[pos + i];
      pos += c;
    } else if (n !== -128) {
      const c = 1 - n, v = src[pos++];
      for (let i = 0; i < c && outPos < outEnd; i++) out[outPos++] = v;
    }
  }
}

// data = bytes kênh gồm 2 byte kiểu nén đầu tiên
function decodeChannel(data, w, h, big) {
  const out = new Uint8Array(w * h);
  if (w === 0 || h === 0) return out;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const comp = dv.getUint16(0);
  if (comp === 0) {
    if (data.length - 2 < w * h) throw new Error('Dữ liệu kênh PSD (raw) bị thiếu');
    out.set(data.subarray(2, 2 + w * h));
  } else if (comp === 1) {
    const cs = big ? 4 : 2;
    let off = 2 + h * cs;
    if (off > data.length) throw new Error('Dữ liệu kênh PSD (RLE) bị thiếu');
    for (let y = 0; y < h; y++) {
      const len = big ? dv.getUint32(2 + y * 4) : dv.getUint16(2 + y * 2);
      if (off + len > data.length) throw new Error('Dữ liệu kênh PSD (RLE) bị hỏng');
      unpackBits(data, off, off + len, out, y * w, (y + 1) * w);
      off += len;
    }
  } else {
    throw new Error('PSD kiểu nén ' + (comp === 2 ? 'ZIP' : comp === 3 ? 'ZIP có dự đoán' : comp) + ' chưa hỗ trợ (hãy lưu PSD với nén RLE hoặc không nén)');
  }
  return out;
}

export function readPSD(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  const r = new Reader(bytes);
  if (bytes.length < 26 || r.str(4) !== '8BPS') throw new Error('Không phải tệp PSD (thiếu dấu 8BPS)');
  const version = r.u16();
  if (version !== 1 && version !== 2) throw new Error('Phiên bản PSD ' + version + ' không hợp lệ');
  const big = version === 2;
  r.skip(6);
  r.u16(); // số kênh của ảnh gộp
  const height = r.u32(), width = r.u32();
  const depth = r.u16(), mode = r.u16();
  if (mode !== 3) throw new Error('PSD chế độ màu ' + (MODE_NAMES[mode] || mode) + ' chưa hỗ trợ (chỉ RGB)');
  if (depth !== 8) throw new Error('PSD độ sâu ' + depth + ' bit chưa hỗ trợ (chỉ RGB 8 bit)');
  r.skip(r.u32()); // color mode data
  r.skip(r.u32()); // image resources
  const miscLen = big ? r.u64() : r.u32();
  const miscEnd = r.p + miscLen;
  const result = { width, height, layers: [] };
  if (miscLen === 0) return result;
  const infoLen = big ? r.u64() : r.u32();
  if (infoLen === 0) return result;
  const infoEnd = r.p + infoLen;
  let count = r.i16();
  if (count < 0) count = -count;

  const recs = [];
  for (let i = 0; i < count; i++) {
    const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32();
    const nch = r.u16();
    const channels = [];
    for (let c = 0; c < nch; c++) channels.push({ id: r.i16(), len: big ? r.u64() : r.u32() });
    if (r.str(4) !== '8BIM') throw new Error('Bản ghi lớp PSD bị hỏng (sai dấu 8BIM)');
    const key = r.str(4);
    const opacity = r.u8() / 255;
    r.u8();
    const flags = r.u8();
    r.u8();
    const extraEnd = (() => { const n = r.u32(); return r.p + n; })();
    r.skip(r.u32()); // mask data
    r.skip(r.u32()); // blending ranges
    const nl = r.u8();
    let name = r.str(nl);
    r.skip((4 - ((nl + 1) % 4)) % 4);
    let sect = 0;
    while (r.p + 12 <= extraEnd) {
      const sig = r.str(4);
      if (sig !== '8BIM' && sig !== '8B64') break;
      const k = r.str(4);
      const len = big && WIDE_KEYS.has(k) ? r.u64() : r.u32();
      const end = r.p + len;
      if (k === 'luni' && len >= 4) {
        const n = r.u32();
        name = utf16be(bytes, r.p, Math.min(n, (len - 4) >> 1));
      } else if (k === 'lsct' && len >= 4) {
        sect = r.u32();
      }
      r.p = end;
      // một số trình ghi đệm thêm byte; tìm lại dấu 8BIM/8B64 kế tiếp trong 3 byte
      for (let pad = 0; pad < 4 && r.p + pad + 4 <= extraEnd; pad++) {
        const s4 = String.fromCharCode(bytes[r.p + pad], bytes[r.p + pad + 1], bytes[r.p + pad + 2], bytes[r.p + pad + 3]);
        if (s4 === '8BIM' || s4 === '8B64') { r.p += pad; break; }
      }
    }
    r.p = extraEnd;
    recs.push({ top, left, bottom, right, channels, key, opacity, visible: !(flags & 2), name, sect });
  }

  // dữ liệu kênh, theo đúng thứ tự bản ghi
  for (const rec of recs) {
    for (const ch of rec.channels) {
      r.need(ch.len);
      ch.data = bytes.subarray(r.p, r.p + ch.len);
      r.p += ch.len;
    }
  }
  void infoEnd; void miscEnd;

  // dựng cây nhóm: file lưu dưới -> trên; divider (3) mở, folder (1/2) đóng
  const stack = [];
  for (const rec of recs) {
    if (rec.sect === 3) {
      stack.push({ name: '', visible: true, parent: stack[stack.length - 1] || null });
      rec.divider = true;
    } else if (rec.sect === 1 || rec.sect === 2) {
      const g = stack.pop();
      if (g) { g.name = rec.name; g.visible = rec.visible; }
      rec.divider = true;
    } else {
      rec.group = stack[stack.length - 1] || null;
    }
  }

  for (const rec of recs) {
    if (rec.divider) continue;
    const w = rec.right - rec.left, h = rec.bottom - rec.top;
    if (w <= 0 || h <= 0) continue;
    const planes = {};
    for (const ch of rec.channels) {
      if (ch.id === 0 || ch.id === 1 || ch.id === 2 || ch.id === -1) {
        if (ch.len < 2) continue;
        planes[ch.id] = decodeChannel(ch.data, w, h, big);
      }
    }
    if (!planes[0] && !planes[1] && !planes[2] && !planes[-1]) continue;
    const data = new Uint8ClampedArray(w * h * 4);
    const R = planes[0], G = planes[1], B = planes[2], A = planes[-1];
    for (let i = 0, o = 0; i < w * h; i++, o += 4) {
      data[o] = R ? R[i] : 0;
      data[o + 1] = G ? G[i] : 0;
      data[o + 2] = B ? B[i] : 0;
      data[o + 3] = A ? A[i] : 255;
    }
    const path = [];
    let visible = rec.visible;
    for (let g = rec.group; g; g = g.parent) {
      path.unshift(g.name);
      if (!g.visible) visible = false;
    }
    result.layers.push({
      name: rec.name, left: rec.left, top: rec.top, width: w, height: h,
      visible, opacity: rec.opacity, blend: BLEND[rec.key] || rec.key.trim(),
      groupPath: path, image: { width: w, height: h, data },
    });
  }
  return result;
}
