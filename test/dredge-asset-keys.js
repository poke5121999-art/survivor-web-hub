/*
 * Cổng kiểm của Biển Mù: mọi tên tiếng và tên hệ hạt mà mã game gọi bằng chữ cố định phải có dữ liệu đi kèm.
 *   node test/dredge-asset-keys.js
 * Tiếng: khoá ngữ nghĩa của data/audio.js hoặc tên clip gốc (trường orig), tra bằng DRAudio.resolve của js/audio.js.
 * Hạt: tên prefab gốc là khoá của window.DR_PARTICLES trong data/particles.js.
 * Khoá ghép chuỗi lúc chạy ('boat.impact.' + loại) không kiểm được bằng cách đọc mã nên được bỏ qua.
 * Không cần trình duyệt; chạy dưới 1 giây.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const G = process.env.DR_GAME_DIR ? path.resolve(process.env.DR_GAME_DIR) : path.resolve(__dirname, '../games/dredge');

const box = { console: { warn() {}, log() {}, error() {} } };
box.window = box; box.globalThis = box;
vm.createContext(box);
for (const f of ['data/audio.js', 'js/audio.js', 'data/particles.js']) {
  const p = path.join(G, f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), box, { filename: f });
}
const AUDIO = box.DR_AUDIO || {}, PARTS = box.DR_PARTICLES || {};
// Hệ hạt do mô-đun riêng góp vào DR_PARTICLES lúc chạy (data/sbcreature.js, data/jelly.js: particles.systems)
for (const f of ['data/sbcreature.js', 'data/jelly.js']) {
  const p = path.join(G, f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), box, { filename: f });
}
for (const k of ['DR_SBCREATURE', 'DR_JELLY']) if (box[k] && box[k].particles && box[k].particles.systems) for (const n of Object.keys(box[k].particles.systems)) PARTS[n] = PARTS[n] || box[k].particles.systems[n];
const resolve = k => (box.DRAudio && box.DRAudio.resolve ? box.DRAudio.resolve(k) : (AUDIO[k] ? k : null));

// Bỏ chú thích (giữ nguyên số dòng) để ví dụ trong phần mô tả không bị tính là lời gọi.
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const sources = fs.readdirSync(path.join(G, 'js')).filter(f => f.endsWith('.js')).map(f => ({ f: 'js/' + f, t: strip(fs.readFileSync(path.join(G, 'js', f), 'utf8')) }));
// Khoá tiếng mà mã tự thêm vào DR_AUDIO lúc chạy: { 'khoá': { src: ... } } hoặc DR_AUDIO['khoá'] = ...
const runtimeAudio = new Set();
for (const s of sources) {
  for (const m of s.t.matchAll(/['"]([a-zA-Z][\w.-]+)['"]\s*:\s*\{\s*src\s*:/g)) runtimeAudio.add(m[1]);
  for (const m of s.t.matchAll(/DR_AUDIO\[\s*['"]([^'"]+)['"]\s*\]\s*=[^=]/g)) runtimeAudio.add(m[1]);
}

const lineOf = (t, i) => t.slice(0, i).split('\n').length;
const missing = { audio: [], particles: [] };
let nAudio = 0, nParts = 0;
for (const s of sources) {
  const wrappers = [...s.t.matchAll(/const\s+(\w+)\s*=\s*\(?\s*\w+[^=]*=>\s*\{[^}]*DRAudio\.play\(/g)].map(m => m[1]);
  const callee = ['DRAudio\\.(?:play|loop|music|preload|stopLoop)', ...wrappers.map(w => '(?<![\\w.])' + w)].join('|');
  const re = new RegExp('(?:' + callee + ')\\(\\s*([\'"])([^\'"]+)\\1\\s*([,)+])', 'g');
  // play(điều kiện ? 'a' : 'b'): kiểm cả hai khoá
  const reTern = new RegExp('(?:' + callee + ')\\(\\s*[^\'";{}]+?\\?\\s*([\'"])([^\'"]+)\\1\\s*:\\s*([\'"])([^\'"]+)\\3\\s*[,)]', 'g');
  for (const m of s.t.matchAll(reTern)) for (const k of [m[2], m[4]]) {
    nAudio++;
    if (!resolve(k) && !runtimeAudio.has(k)) missing.audio.push(`${s.f}:${lineOf(s.t, m.index)} '${k}'`);
  }
  for (const m of s.t.matchAll(re)) {
    if (m[3] === '+') continue;
    nAudio++;
    if (!resolve(m[2]) && !runtimeAudio.has(m[2])) missing.audio.push(`${s.f}:${lineOf(s.t, m.index)} '${m[2]}'`);
  }
  for (const m of s.t.matchAll(/DRParticles\.spawn\(\s*(['"])([^'"]+)\1\s*([,)+])/g)) {
    if (m[3] === '+') continue;
    nParts++;
    if (!PARTS[m[2]]) missing.particles.push(`${s.f}:${lineOf(s.t, m.index)} '${m[2]}'`);
  }
}

let fail = 0;
const report = (name, n, list) => {
  if (list.length) { fail += list.length; console.log(`  ✘ ${name}: ${list.length}/${n} tên gọi trong mã không có dữ liệu`); for (const l of list) console.log('      ' + l); }
  else console.log(`  ✔ ${name}: ${n} tên gọi trong mã đều có dữ liệu`);
};
console.log('DREDGE asset keys — ' + G);
report('tiếng', nAudio, missing.audio);
report('hệ hạt', nParts, missing.particles);
console.log(fail ? `${fail} tên thiếu dữ liệu` : 'đạt');
process.exit(fail ? 1 : 0);
