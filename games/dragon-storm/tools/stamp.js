// node games/dragon-storm/tools/stamp.js <rev>   (same convention as games/burger and games/casual-farm)
// GitHub Pages caches every file for 10 minutes and `import './sim.js'` carries no ?v=, so a new main.js could run
// against an old sim.js. The import map in index.html maps every module URL to the same URL with ?v=<rev>; this
// rewrites that map and every other ?v= in index.html, and writes version.json + rev/version.json.
// Data/art fetches take ?v= from main.js's own URL.
'use strict';
const fs = require('fs');
const path = require('path');

const rev = process.argv[2];
if (!/^\d{8}[a-z]$/.test(rev || '')) {
  console.error('usage: node stamp.js <rev like 20261102a>');
  process.exit(1);
}
const G = path.join(__dirname, '..');
const walk = d => fs.readdirSync(path.join(G, d), { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []));
const modules = [...walk('js'), ...walk('vendor')].sort();
const imports = {};
for (const f of modules) imports[`./${f}`] = `./${f}?v=${rev}`;
const map = `<script type="importmap">\n${JSON.stringify({ imports }, null, 1)}\n</script>`;
const page = path.join(G, 'index.html');
let html = fs.readFileSync(page, 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, map).replace(/\?v=\d{8}[a-z]/g, `?v=${rev}`);
fs.writeFileSync(page, html);
const ver = JSON.stringify({ rev, stamped: new Date().toISOString() }) + '\n';
fs.writeFileSync(path.join(G, 'version.json'), ver);
fs.mkdirSync(path.join(G, 'rev'), { recursive: true });
fs.writeFileSync(path.join(G, 'rev', 'version.json'), ver);
console.log(`index.html: ${modules.length} modules stamped ?v=${rev}`);
