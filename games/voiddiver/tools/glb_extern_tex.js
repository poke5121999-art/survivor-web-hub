// node tools/glb_extern_tex.js [art/sector]
// Tách ảnh nhúng trong glb sector ra tham chiếu tex/<tên>.webp dùng chung.
// Ảnh nhúng trùng khít bytes với tệp trong tex/ (đo 2026-09-25: 465/465), nên ghép theo md5, không đoán tên.
// Chạy lại được: glb không còn ảnh nhúng thì giữ nguyên.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '../art/sector'));
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const texByHash = new Map();
for (const f of fs.readdirSync(path.join(dir, 'tex'))) texByHash.set(md5(fs.readFileSync(path.join(dir, 'tex', f))), f);

const pad4 = n => (n + 3) & ~3;

function rewrite(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(file + ': không phải glb');
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  const binStart = 20 + jl + 8, binLen = b.readUInt32LE(20 + jl);
  const bin = b.slice(binStart, binStart + binLen);
  const imgBV = new Set();
  let changed = 0;
  for (const im of j.images || []) {
    if (im.bufferView == null) continue;
    const bv = j.bufferViews[im.bufferView];
    const data = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const name = texByHash.get(md5(data));
    if (!name) continue;
    imgBV.add(im.bufferView);
    delete im.bufferView;
    im.uri = 'tex/' + name;
    changed++;
  }
  if (!changed) return null;
  // Dồn buffer 0: chép lại mọi đoạn còn dùng (bufferView thường + đoạn nén EXT_meshopt_compression).
  const pieces = [];
  let off = 0;
  const place = data => { const at = off; pieces.push({ at, data }); off = pad4(off + data.length); return at; };
  const remap = new Map(), views = [];
  j.bufferViews.forEach((bv, i) => {
    if (imgBV.has(i)) return;
    const ext = bv.extensions && bv.extensions.EXT_meshopt_compression;
    if (ext && ext.buffer === 0) ext.byteOffset = place(bin.slice(ext.byteOffset || 0, (ext.byteOffset || 0) + ext.byteLength));
    else if (bv.buffer === 0) bv.byteOffset = place(bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
    remap.set(i, views.length); views.push(bv);
  });
  j.bufferViews = views;
  for (const a of j.accessors || []) {
    if (a.bufferView != null) a.bufferView = remap.get(a.bufferView);
    if (a.sparse) { a.sparse.indices.bufferView = remap.get(a.sparse.indices.bufferView); a.sparse.values.bufferView = remap.get(a.sparse.values.bufferView); }
  }
  const newBin = Buffer.alloc(pad4(off));
  for (const p of pieces) p.data.copy(newBin, p.at);
  j.buffers[0].byteLength = newBin.length;
  let js = Buffer.from(JSON.stringify(j), 'utf8');
  js = Buffer.concat([js, Buffer.alloc(pad4(js.length) - js.length, 0x20)]);
  const head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + newBin.length, 8);
  jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(newBin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  const out = Buffer.concat([head, jh, js, bh, newBin]);
  fs.writeFileSync(file, out);
  return { images: changed, before: b.length, after: out.length };
}

let before = 0, after = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.glb'))) {
  const r = rewrite(path.join(dir, f));
  if (r) { before += r.before; after += r.after; console.log(f, r.images, 'ảnh', (r.before / 1e6).toFixed(2), '→', (r.after / 1e6).toFixed(2), 'MB'); }
}
console.log('tổng', (before / 1e6).toFixed(1), '→', (after / 1e6).toFixed(1), 'MB');
