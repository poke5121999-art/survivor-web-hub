import { deflateSync, inflateSync } from "node:zlib";

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePNG({ width, height, data }) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePNG(buf) {
  if (!Buffer.from(buf.subarray(0, 8)).equals(SIG)) throw new Error("file không phải PNG");
  let off = 8, width = 0, height = 0, depth = 0, ctype = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8), d = buf.subarray(off + 8, off + 8 + len);
    off += 12 + len;
    if (type === "IHDR") { width = d.readUInt32BE(0); height = d.readUInt32BE(4); depth = d[8]; ctype = d[9]; interlace = d[12]; }
    else if (type === "PLTE") palette = d;
    else if (type === "tRNS") trns = d;
    else if (type === "IDAT") idat.push(d);
    else if (type === "IEND") break;
  }
  if (interlace) throw new Error("PNG interlaced chưa hỗ trợ");
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!chans) throw new Error(`PNG color type ${ctype} lạ`);
  const bpp = Math.max(1, (chans * depth) >> 3), stride = (width * chans * depth + 7) >> 3;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const r = raw[src + x], a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[prev + x] : 0, c = x >= bpp && y ? px[prev + x - bpp] : 0;
      px[row + x] = (f === 0 ? r : f === 1 ? r + a : f === 2 ? r + b : f === 3 ? r + ((a + b) >> 1) : r + paeth(a, b, c)) & 255;
    }
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const sample = (y, i) => {
    if (depth === 8) return px[y * stride + i];
    if (depth === 16) return px[y * stride + i * 2];
    const bit = i * depth, byte = px[y * stride + (bit >> 3)];
    return (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };
  const scale = depth < 8 && ctype !== 3 ? 255 / ((1 << depth) - 1) : 1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4, i = x * chans;
    if (ctype === 3) {
      const p = sample(y, x);
      out[o] = palette[p * 3]; out[o + 1] = palette[p * 3 + 1]; out[o + 2] = palette[p * 3 + 2];
      out[o + 3] = trns && p < trns.length ? trns[p] : 255;
    } else if (ctype === 0 || ctype === 4) {
      const g = sample(y, i) * scale;
      out[o] = out[o + 1] = out[o + 2] = g;
      out[o + 3] = ctype === 4 ? sample(y, i + 1) : 255;
    } else {
      out[o] = sample(y, i); out[o + 1] = sample(y, i + 1); out[o + 2] = sample(y, i + 2);
      out[o + 3] = ctype === 6 ? sample(y, i + 3) : 255;
    }
  }
  return { width, height, data: out };
}
