// Cache key for a deploy: writes ?v=<rev> onto every script tag of index.html and every relative import between
// our own modules, so a phone never mixes files of two deploys. One rev everywhere: two different query strings
// on the same file would load it twice as two modules.
// Usage: node games/ai-sinh-ton/tools/stamp.mjs <rev>     e.g. 20261119b
//        node games/ai-sinh-ton/tools/stamp.mjs --check   fails when the revs in the tree are not all the same
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rev = process.argv[2];
if (!rev || (rev !== '--check' && !/^\d{8}[a-z]{1,2}$/.test(rev))) { console.error('stamp: rev missing or not like 20261119b'); process.exit(1); }

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'bz') walk(p, out); } else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const IMPORT = /((?:from|import)\s*\(?\s*['"])(\.{1,2}\/[^'"?]+\.js)(\?v=[0-9a-z]+)?(['"])/g;
const TAG = /(src="(?!\.\.\/\.\.\/)[^"?]+\.js)\?v=[0-9a-z]+(")/g;
const files = [...walk(path.join(GAME, 'js')), path.join(GAME, 'index.html'), path.join(GAME, 'ui-demo.html')];
const seen = new Set(); let bare = 0; let changed = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const html = f.endsWith('.html');
  let out = src;
  if (rev === '--check') {
    for (const m of src.matchAll(html ? TAG : IMPORT)) { const v = html ? m[0].match(/\?v=([0-9a-z]+)/)[1] : (m[3] || '').slice(3); if (v) seen.add(v); else bare++; }
    if (html) for (const m of src.matchAll(IMPORT)) { if (m[3]) seen.add(m[3].slice(3)); else bare++; }
    continue;
  }
  out = out.replace(IMPORT, (m, a, file, v, z) => `${a}${file}?v=${rev}${z}`);
  if (html) out = out.replace(TAG, (m, a, z) => `${a}?v=${rev}${z}`);
  if (out !== src) { fs.writeFileSync(f, out); changed++; }
}
if (rev === '--check') {
  const ok = seen.size === 1 && bare === 0;
  console.log(ok ? `stamp: GATE PASS (every import and script tag carries ?v=${[...seen][0]})` : `stamp: revs in the tree: ${[...seen].join(', ') || 'none'}; imports without a rev: ${bare}`);
  process.exit(ok ? 0 : 1);
}
console.log(`stamp: ?v=${rev} written into ${changed} files`);
