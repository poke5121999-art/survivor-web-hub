#!/usr/bin/env node
/*
 * Nhập UI của game Unity "Ca Trực Đêm: Biệt Đội" vào ui/ (chỉ đọc D:/REPO_Topdown).
 *
 *   node tools/import-ui.js [--src D:/REPO_Topdown]
 *
 * Chép:
 *   - WebPages/repo2d/ui-kit.css.txt          -> ui/ui-kit.css          (bộ popup pixel tím)
 *   - các luật CSS dùng chung (popup, toast, bảng kết ca re-*) rút từ WebPages/repo-squad/index.html.txt
 *       -> ui/squad-extract.css  (vh/vw đổi thành biến --vh/--vw vì UI nằm trong khung co giãn)
 *   - đúng những PNG mà ui/ui.js, ui/ui.css, ui-kit.css, squad-extract.css gọi tên:
 *       art/<đường dẫn>   <- Resources/WebArt/art/<đường dẫn>   ->  ui/art/...
 *       uiart/<đường dẫn> <- Resources/UI/Art/<đường dẫn>       ->  ui/uiart/...
 * Bỏ: thư mục Sk/, sk-*, Soul Knight, HoloCure (art-sources.md). Chạy lại thì làm mới từ repo Unity.
 * ui/ui.js và ui/ui.css là viết tay, không bị xoá.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const srcIdx = args.indexOf('--src');
const SRC = srcIdx >= 0 ? args[srcIdx + 1] : 'D:/REPO_Topdown';
const RES = path.join(SRC, 'Assets/Resources');
const WEBPAGES = path.join(RES, 'WebPages');
const ART_ROOTS = { art: path.join(RES, 'WebArt/art'), uiart: path.join(RES, 'UI/Art') };
const OUT = path.resolve(__dirname, '../ui');

const BLOCK = /(^|\/)sk(\/|$)|(^|\/)sk[-_]|soul|holocure|\/Sk\//i;

function die(msg) { console.error('LỖI: ' + msg); process.exit(1); }
if (!fs.existsSync(RES)) die('không thấy ' + RES);

// ---- dọn phần sinh ra
for (const p of ['art', 'uiart', 'ui-kit.css', 'squad-extract.css']) {
  fs.rmSync(path.join(OUT, p), { recursive: true, force: true });
}
fs.mkdirSync(OUT, { recursive: true });

// ---- 1. ui-kit.css
const kit = fs.readFileSync(path.join(WEBPAGES, 'repo2d/ui-kit.css.txt'), 'utf8');
fs.writeFileSync(path.join(OUT, 'ui-kit.css'), kit);

// ---- 2. luật dùng chung rút từ index.html.txt
const html = fs.readFileSync(path.join(WEBPAGES, 'repo-squad/index.html.txt'), 'utf8');
let styles = '';
html.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (_, s) => { styles += s + '\n'; return ''; });
styles = styles.replace(/\/\*[\s\S]*?\*\//g, '');
const KEEP = /^(\.modal|\.mcard|\.pop-|\.mline|\.toast|\.re-|\.b\.re-go|\.pull-grid|\.pcard|\.pc-)/;
const rules = [];
{
  let i = 0;
  while (i < styles.length) {
    const open = styles.indexOf('{', i);
    if (open < 0) break;
    const sel = styles.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < styles.length && depth) { const c = styles[j++]; if (c === '{') depth++; else if (c === '}') depth--; }
    const body = styles.slice(open + 1, j - 1);
    i = j;
    if (sel.startsWith('@')) continue;
    const parts = sel.split(',').map(s => s.trim());
    if (parts.every(p => KEEP.test(p) && !/body\.|\.in-run/.test(p))) rules.push(sel.replace(/\s+/g, ' ') + '{' + body.trim() + '}');
  }
}
if (rules.length < 40) die('rút được ' + rules.length + ' luật từ index.html.txt, ít bất thường (đổi cấu trúc?)');
const toVars = s => s.replace(/(-?\d*\.?\d+)vh\b/g, 'calc($1*var(--vh))').replace(/(-?\d*\.?\d+)vw\b/g, 'calc($1*var(--vw))')
  .replace(/\.\.\/repo2d\/art\//g, 'art/');
fs.writeFileSync(path.join(OUT, 'squad-extract.css'),
  '/* SINH RA bởi tools/import-ui.js từ WebPages/repo-squad/index.html.txt. Không sửa tay. */\n' + toVars(rules.join('\n')) + '\n');

// ---- 3. PNG được gọi tên
const scan = ['ui.js', 'ui.css', 'ui-kit.css', 'squad-extract.css'].map(f => path.join(OUT, f)).filter(f => fs.existsSync(f));
const want = new Set();
for (const f of scan) {
  const t = fs.readFileSync(f, 'utf8');
  t.replace(/\b(uiart|art)\/[\w\-./]+\.png/g, m => { want.add(m); return m; });
}
const copied = [], missing = [], blocked = [];
let total = 0;
for (const rel of [...want].sort()) {
  const root = rel.startsWith('uiart/') ? 'uiart' : 'art';
  const inner = rel.slice(root.length + 1);
  if (BLOCK.test(rel)) { blocked.push(rel); continue; }
  const from = path.join(ART_ROOTS[root], inner);
  if (!fs.existsSync(from)) { missing.push(rel); continue; }
  const to = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  const sz = fs.statSync(to).size;
  total += sz;
  copied.push([rel, sz]);
}
const textSz = ['ui-kit.css', 'squad-extract.css'].reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
console.log('rút ' + rules.length + ' luật CSS; chép ' + copied.length + ' PNG');
console.log('PNG ' + (total / 1048576).toFixed(2) + ' MB, CSS sinh ra ' + (textSz / 1024).toFixed(1) + ' KB');
console.log('lớn nhất:');
copied.sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([r, s]) => console.log('  ' + (s / 1024).toFixed(0).padStart(6) + ' KB  ' + r));
if (total / 1048576 > 20) console.log('CẢNH BÁO: vượt 20 MB');
if (blocked.length) console.log('bỏ (IP): ' + blocked.join(', '));
if (missing.length) { console.error('THIẾU trong repo Unity: ' + missing.join(', ')); process.exit(2); }
