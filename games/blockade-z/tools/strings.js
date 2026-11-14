// Strings: nothing the player reads may be written into the code or the page. This scans index.html and js/*.js (comments
// aside) for Vietnamese letters outside the tables, and checks the two tables against each other: the same keys, the same
// {n} placeholders, the same HTML tags, no Vietnamese left in the English one, and every key the code asks for exists.
// No browser needed. Usage: node games/blockade-z/tools/strings.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/;
const fails = []; let passed = 0;
const check = (ok, name) => { if (ok) passed++; else fails.push(name); console.log((ok ? 'PASS ' : 'FAIL ') + name); };

// JS with its comments blanked out (strings and templates kept; line numbers kept)
function noComments(src) {
  let out = ''; let i = 0; const n = src.length; let q = null;
  while (i < n) {
    const c = src[i]; const d = src[i + 1];
    if (q) { out += c; if (c === '\\') { out += d; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '\'' || c === '"' || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); const end = j < 0 ? n : j + 2; out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    out += c; i++;
  }
  return out;
}
const lines = (text, file) => text.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => VI.test(l)).map(([n, l]) => `${file}:${n}: ${l.trim().slice(0, 90)}`);

const table = (lang) => { const BZ = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'js', `lang-${lang}.js`), 'utf8'))({ BZ }); return BZ.STR[lang]; };
const vi = table('vi'); const en = table('en');

let stray = []; const used = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter((x) => x.endsWith('.js')).sort()) {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  if (f === 'lang-vi.js' || f === 'lang-en.js') continue;
  for (const m of noComments(src).matchAll(/BZ\.t\(\s*["']([^"']+)["']/g)) used.add(m[1]);
  // the one place a language is named in its own tongue
  stray = stray.concat(lines(noComments(src).replace("['vi', 'Tiếng Việt']", "['vi', '']"), 'js/' + f));
}
{ const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/<t-x k="([^"]+)"|data-t-[a-z-]+="([^"]+)"|BZ\.t\(\s*["']([^"']+)["']/g)) used.add(m[1] || m[2] || m[3]);
  const bare = html.replace(/<!--[\s\S]*?-->/g, (s) => s.replace(/[^\n]/g, ' ')).replace(/<script\b[^>]*>([\s\S]*?)<\/script>/g, (s, body) => s.replace(body, noComments(body))).replace(/<style\b[^>]*>([\s\S]*?)<\/style>/g, (s, body) => s.replace(body, noComments(body)));
  stray = stray.concat(lines(bare, 'index.html')); }
check(stray.length === 0, `no Vietnamese text outside the tables in index.html and js/*.js${stray.length ? ' (' + stray.length + '): ' + stray.slice(0, 6).join(' | ') : ''}`);

const kv = Object.keys(vi); const ke = Object.keys(en);
const missing = kv.filter((k) => !(k in en)); const extra = ke.filter((k) => !(k in vi));
check(missing.length === 0 && extra.length === 0, `the English table has the same ${kv.length} keys as the Vietnamese one${missing.length ? '; missing: ' + missing.slice(0, 8).join(', ') : ''}${extra.length ? '; extra: ' + extra.slice(0, 8).join(', ') : ''}`);
const ph = (s) => (s.match(/\{\d+\}/g) || []).sort().join(''); const tags = (s) => (s.match(/<[^>]+>/g) || []).map((t) => t.replace(/\s+/g, ' ')).sort().join('');
const badPh = kv.filter((k) => k in en && ph(vi[k]) !== ph(en[k])); const badTag = kv.filter((k) => k in en && tags(vi[k]) !== tags(en[k]));
check(badPh.length === 0, `every {n} placeholder is in both languages${badPh.length ? '; differ: ' + badPh.slice(0, 8).join(', ') : ''}`);
check(badTag.length === 0, `every HTML tag is in both languages${badTag.length ? '; differ: ' + badTag.slice(0, 8).join(', ') : ''}`);
const viInEn = ke.filter((k) => VI.test(en[k]));
check(viInEn.length === 0, `no Vietnamese left in the English table${viInEn.length ? ': ' + viInEn.slice(0, 8).join(', ') : ''}`);
const empty = ke.filter((k) => typeof en[k] !== 'string' || (!en[k].length && vi[k].length));
check(empty.length === 0, `no English entry is empty${empty.length ? ': ' + empty.slice(0, 8).join(', ') : ''}`);
// the Settings popup builds its keys: T('x') is 'set.x', and the option, hint, tab and key names come from its own lists
{ const src = noComments(fs.readFileSync(path.join(ROOT, 'js', 'settings.js'), 'utf8')); for (const m of src.matchAll(/\bT\('([^']+)'/g)) if (!/\.$/.test(m[1])) used.add('set.' + m[1]); for (const m of src.matchAll(/\bT\(\w+ \? '(\w+)' : '(\w+)'\)/g)) { used.add('set.' + m[1]); used.add('set.' + m[2]); }
  const ids = [...src.matchAll(/\['(\w+)', '(?:range|toggle|select|lang|keys)'/g)].map((m) => m[1]); for (const id of ids) { used.add('set.o.' + id); used.add('set.h.' + id); }
  for (const m of src.matchAll(/\['[\w]+', '((?:view|q|fps|xh|col)\.[\w]+)'\]|\[\d+, '(fps\.[\w]+)'\]/g)) used.add('set.' + (m[1] || m[2]));
  for (const m of src.matchAll(/^\s*\['(general|graphics|audio|controls|interface)', \[/gm)) used.add('set.tab.' + m[1]);
  const acts = src.slice(src.indexOf('BZ.KEY_ACTIONS = '), src.indexOf('const XCOL')); for (const m of acts.matchAll(/\['(\w+)', '\w+'\]/g)) used.add('set.key.' + m[1]); }
const unknown = [...used].filter((k) => !(k in vi) && !/\.$/.test(k));
check(unknown.length === 0 && used.size > 100, `every key the code asks for (${used.size}) is in the table${unknown.length ? '; unknown: ' + unknown.slice(0, 8).join(', ') : ''}`);
const unused = kv.filter((k) => !used.has(k));
check(unused.length === 0, `no key in the table is unused${unused.length ? ' (' + unused.length + '): ' + unused.slice(0, 8).join(', ') : ''}`);
console.log(fails.length ? `${fails.length} FAIL of ${fails.length + passed}` : `ALL PASS (${passed} checks)`);
process.exit(fails.length ? 1 : 0);
