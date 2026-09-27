/*
 * Mọi đường dẫn tệp mà game gọi tới phải khớp tên trên đĩa đúng từng chữ hoa/thường.
 * Windows bỏ qua hoa/thường nên chạy ở máy vẫn được; GitHub Pages thì phân biệt và trả 404.
 * Quét: uri ảnh/buffer bên trong mọi .glb, và mọi chuỗi 'art/…' hay 'audio/…' trong data/*.js.
 *
 * Chạy:  node games/pokeone/tools/check_case.js      (thoát 1 nếu có đường dẫn sai)
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

const listing = new Map();
function exactExists(abs) {
  const rel = path.relative(ROOT, abs).split(path.sep);
  let dir = ROOT;
  for (const part of rel) {
    if (!listing.has(dir)) listing.set(dir, fs.existsSync(dir) ? new Set(fs.readdirSync(dir)) : new Set());
    if (!listing.get(dir).has(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const bad = [];
let refs = 0;

for (const f of walk(path.join(ROOT, 'art'), []).filter(f => f.endsWith('.glb'))) {
  const b = fs.readFileSync(f);
  const len = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + len).toString('utf8'));
  for (const item of [].concat(json.images || [], json.buffers || [])) {
    if (!item.uri || item.uri.startsWith('data:')) continue;
    refs++;
    const target = path.join(path.dirname(f), decodeURIComponent(item.uri));
    if (!exactExists(target)) bad.push(path.relative(ROOT, f) + ' → ' + item.uri);
  }
}

for (const f of fs.readdirSync(path.join(ROOT, 'data')).filter(n => n.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(ROOT, 'data', f), 'utf8');
  for (const m of src.matchAll(/['"]((?:art|audio)\/[^'"]+\.(?:png|glb|ogg|mp3|ttf|jpg))['"]/g)) {
    refs++;
    if (!exactExists(path.join(ROOT, m[1]))) bad.push('data/' + f + ' → ' + m[1]);
  }
}

console.log(refs + ' references checked, ' + bad.length + ' wrong-case or missing');
for (const b of [...new Set(bad)].slice(0, 60)) console.log('  ✘ ' + b);
process.exit(bad.length ? 1 : 0);
