// Đổi 13 file ngôn ngữ XML-ish của game gốc thành data/lang/<Tên>.json ({key: text}).
//   node tools/build_lang.js [thư mục nguồn]     mặc định D:/foodgang-ref/export/text
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || 'D:/foodgang-ref/export/text';
const OUT = path.join(__dirname, '..', 'data', 'lang');
const NAMES = ['Arabic', 'ChineseSimplified', 'ChineseTraditional', 'English', 'French', 'German', 'Italian', 'Japanese',
  'Korean', 'Portuguese', 'Russian', 'Spanish', 'Turkish'];

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');   // &amp; cuối cùng, tránh bỏ đôi

fs.mkdirSync(OUT, { recursive: true });
let en = null;
for (const name of NAMES) {
  const txt = fs.readFileSync(path.join(SRC, name + '.txt'), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const out = {};
  const re = /<Localizable Key="([^"]*)">([\s\S]*?)<\/Localizable>/g;
  let m;
  while ((m = re.exec(txt))) out[unescape(m[1])] = unescape(m[2]);
  if (name === 'English') en = out;
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(out));
  console.log(name.padEnd(20), Object.keys(out).length, 'khoá');
}
for (const name of NAMES) {
  const o = JSON.parse(fs.readFileSync(path.join(OUT, name + '.json'), 'utf8'));
  const miss = Object.keys(en).filter((k) => !(k in o));
  if (miss.length) console.log('  ' + name + ' thiếu ' + miss.length + ' khoá so với English:', miss.slice(0, 5).join(', '));
}
