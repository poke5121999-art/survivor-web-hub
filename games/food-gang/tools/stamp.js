#!/usr/bin/env node
// Stamps index.html with a cache rev (hub rule: every script / link / data file carries ?v=<rev>):
// rewrites the import map so every ES module under js/ resolves to "<path>?v=<rev>", every "?v=..." in the page,
// and <html data-rev> (the engine appends it to data, art and audio fetches).
//   node tools/stamp.js            -> next rev of today (20261030a, 20261030b, ...)
//   node tools/stamp.js 20261031a  -> that rev
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'index.html');
let html = fs.readFileSync(HTML, 'utf8');

const old = (html.match(/data-rev="([^"]*)"/) || [])[1] || '';
let rev = process.argv[2];
if (!rev) {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  rev = old.startsWith(day) ? day + String.fromCharCode(old.charCodeAt(8) + 1) : day + 'a';
}

const mods = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'test') walk(p); } else if (e.name.endsWith('.js') && e.name !== 'dev.js') mods.push(p);
  }
};
walk(path.join(ROOT, 'js'));
const rel = (p) => './' + path.relative(ROOT, p).split(path.sep).join('/');
const map = { imports: Object.fromEntries(mods.map(rel).sort().map((m) => [m, `${m}?v=${rev}`])) };
const block = `<script type="importmap">\n${JSON.stringify(map, null, 1)}\n</script>`;
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, block);
html = html.replace(/\?v=[0-9a-z]+/g, `?v=${rev}`);
html = html.replace(/data-rev="[^"]*"/, `data-rev="${rev}"`);
fs.writeFileSync(HTML, html);
console.log(`index.html rev ${old || '-'} -> ${rev} (${mods.length} modules)`);
