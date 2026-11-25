import test from 'node:test';
import assert from 'node:assert/strict';
import { readPSD } from '../src/psd.js';

// ---- bộ ghi PSD nhỏ (RGB 8 bit) ----
class W {
  constructor() { this.a = []; }
  u8(x) { this.a.push(x & 255); return this; }
  u16(x) { return this.u8(x >> 8).u8(x); }
  u32(x) { return this.u16(x >>> 16).u16(x & 0xffff); }
  bytes(b) { for (const x of b) this.a.push(x); return this; }
  str(s) { for (const c of s) this.u8(c.charCodeAt(0)); return this; }
  get length() { return this.a.length; }
  out() { return Uint8Array.from(this.a); }
}
const bytesOf = (fn) => { const w = new W(); fn(w); return w.a; };

function packBits(row) {
  const o = [];
  let i = 0;
  while (i < row.length) {
    let run = 1;
    while (i + run < row.length && row[i + run] === row[i] && run < 128) run++;
    if (run >= 2) { o.push(257 - run, row[i]); i += run; continue; }
    let j = i;
    while (j < row.length && j - i < 128 && !(j + 1 < row.length && row[j] === row[j + 1])) j++;
    if (j === i) j = i + 1;
    o.push(j - i - 1, ...row.slice(i, j));
    i = j;
  }
  return o;
}

function channelData(plane, w, h, rle) {
  const wr = new W();
  if (!rle) { wr.u16(0).bytes(plane); return wr.a; }
  const rows = [];
  for (let y = 0; y < h; y++) rows.push(packBits(plane.slice(y * w, (y + 1) * w)));
  wr.u16(1);
  for (const r of rows) wr.u16(r.length);
  for (const r of rows) wr.bytes(r);
  return wr.a;
}

// layer: {name, left, top, w, h, rgba(Uint8Array), rle, visible, opacity(0..255), key, sect}
function build(width, height, layers) {
  const recs = new W(), datas = [];
  for (const L of layers) {
    const w = L.w || 0, h = L.h || 0;
    const chans = [];
    const ids = [0, 1, 2, -1];
    for (const id of ids) {
      if (!L.rgba) { chans.push({ id, data: [0, 0] }); continue; }
      const plane = new Array(w * h);
      const c = id === -1 ? 3 : id;
      for (let i = 0; i < w * h; i++) plane[i] = L.rgba[i * 4 + c];
      chans.push({ id, data: channelData(plane, w, h, L.rle) });
    }
    recs.u32(L.top || 0).u32(L.left || 0).u32((L.top || 0) + h).u32((L.left || 0) + w);
    recs.u16(chans.length);
    for (const c of chans) recs.u16(c.id & 0xffff).u32(c.data.length);
    recs.str('8BIM').str(L.key || 'norm').u8(L.opacity ?? 255).u8(0).u8(L.visible === false ? 2 : 0).u8(0);
    const extra = new W();
    extra.u32(0).u32(0); // mask, blending ranges
    const pn = [...L.name].map((c) => (c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 63));
    extra.u8(pn.length).bytes(pn);
    while ((extra.length - 8) % 4 !== 0 || false) { if ((1 + pn.length + ((extra.length - 8 - 1 - pn.length))) % 4 === 0) break; extra.u8(0); }
    const blocks = new W();
    const u = new W().u32([...L.name].length);
    for (let i = 0; i < L.name.length; i++) u.u16(L.name.charCodeAt(i));
    if (u.length % 2) u.u8(0);
    blocks.str('8BIM').str('luni').u32(u.length).bytes(u.a);
    if (L.sect !== undefined) blocks.str('8BIM').str('lsct').u32(4).u32(L.sect);
    extra.bytes(blocks.a);
    recs.u32(extra.length).bytes(extra.a);
    for (const c of chans) datas.push(c.data);
  }
  const info = new W().u16(layers.length).bytes(recs.a);
  for (const d of datas) info.bytes(d);
  if (info.length % 2) info.u8(0);
  const layerMask = new W().u32(info.length).bytes(info.a).u32(0); // + global mask len 0
  const f = new W();
  f.str('8BPS').u16(1).bytes([0, 0, 0, 0, 0, 0]).u16(4).u32(height).u32(width).u16(8).u16(3);
  f.u32(0).u32(0).u32(layerMask.length).bytes(layerMask.a);
  f.u16(0).bytes(new Array(width * height * 3).fill(0)); // ảnh gộp (không dùng)
  return f.out();
}

function solid(w, h, f) {
  const a = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.set(f(x, y), (y * w + x) * 4);
  return a;
}

const headImg = solid(5, 4, (x, y) => (x < 2 ? [200, 10, 20, 255] : [x * 30, y * 40, 77, x === 4 ? 128 : 255])); // có đoạn lặp lẫn khác
const bodyImg = solid(3, 3, (x, y) => [x * 80, y * 80, 255 - x * 10, 255]);
const hiddenImg = solid(2, 2, () => [1, 2, 3, 255]);

function sampleFile() {
  // thứ tự file: dưới -> trên
  return build(64, 48, [
    { name: '</Layer group>', sect: 3 },
    { name: 'Thân', left: 10, top: 12, w: 3, h: 3, rgba: bodyImg, rle: false, key: 'mul ', opacity: 128 },
    { name: '</Layer group>', sect: 3 },
    { name: 'Đầu', left: 20, top: 5, w: 5, h: 4, rgba: headImg, rle: true },
    { name: 'Con', sect: 1 },
    { name: 'Nhóm', sect: 1 },
    { name: 'Ẩn', left: 1, top: 2, w: 2, h: 2, rgba: hiddenImg, rle: true, visible: false },
    { name: 'Trống', w: 0, h: 0 },
  ]);
}

test('đọc tên, vị trí, nhóm, hiển thị, điểm ảnh', () => {
  const psd = readPSD(sampleFile());
  assert.equal(psd.width, 64);
  assert.equal(psd.height, 48);
  assert.deepEqual(psd.layers.map((l) => l.name), ['Thân', 'Đầu', 'Ẩn']);
  const [body, head, hid] = psd.layers;

  assert.deepEqual([body.left, body.top, body.width, body.height], [10, 12, 3, 3]);
  assert.deepEqual(body.groupPath, ['Nhóm']);
  assert.equal(body.blend, 'multiply');
  assert.ok(Math.abs(body.opacity - 128 / 255) < 1e-9);
  assert.equal(body.visible, true);
  assert.deepEqual([...body.image.data], [...bodyImg]);

  assert.deepEqual([head.left, head.top, head.width, head.height], [20, 5, 5, 4]);
  assert.deepEqual(head.groupPath, ['Nhóm', 'Con']);
  assert.equal(head.blend, 'normal');
  assert.equal(head.opacity, 1);
  assert.deepEqual([...head.image.data], [...headImg]);

  assert.equal(hid.visible, false);
  assert.deepEqual(hid.groupPath, []);
  assert.deepEqual([...hid.image.data], [...hiddenImg]);
});

test('nhóm ẩn làm ẩn lớp con', () => {
  const f = build(8, 8, [
    { name: '</Layer group>', sect: 3 },
    { name: 'A', left: 0, top: 0, w: 2, h: 2, rgba: hiddenImg, rle: false },
    { name: 'G', sect: 1, visible: false },
  ]);
  const l = readPSD(f).layers;
  assert.equal(l.length, 1);
  assert.equal(l[0].visible, false);
  assert.deepEqual(l[0].groupPath, ['G']);
});

test('lỗi tiếng Việt cho chế độ màu và độ sâu không hỗ trợ', () => {
  const f = sampleFile();
  const cmyk = f.slice(); cmyk[25] = 4;
  assert.throws(() => readPSD(cmyk), /PSD chế độ màu CMYK chưa hỗ trợ/);
  const d16 = f.slice(); d16[22] = 0; d16[23] = 16;
  assert.throws(() => readPSD(d16), /độ sâu 16 bit/);
  assert.throws(() => readPSD(new Uint8Array(40)), /Không phải tệp PSD/);
});
