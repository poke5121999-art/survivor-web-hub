// node games/lumber-inc/tools/stamp.js <rev>
// GitHub Pages caches every file for 10 minutes and module imports carry no ?v=, so the import map in index.html maps
// every module URL to the same URL with ?v=<rev>, and every other ?v= in the page is set to <rev>. Data fetches take
// ?v= from main.js's own URL. Same scheme as games/casual-farm/tools/stamp.js.
'use strict';
const fs = require('fs');
const path = require('path');

const rev = process.argv[2];
if (!/^\d{8}[a-z]$/.test(rev || '')) {
  console.error('usage: node stamp.js <rev like 20261031a>');
  process.exit(1);
}
const G = path.join(__dirname, '..');
const walk = d => fs.readdirSync(path.join(G, d), { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []));
const modules = [...walk('js'), ...walk('vendor')].sort();
const imports = { three: `./vendor/three.module.min.js?v=${rev}` };
for (const f of modules) imports[`./${f}`] = `./${f}?v=${rev}`;
const map = `<script type="importmap">\n${JSON.stringify({ imports }, null, 1)}\n</script>`;
const page = path.join(G, 'index.html');
let html = fs.readFileSync(page, 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, map)
  .replace(/((?:src|href)="[^"]+?\.(?:js|css))(?:\?v=\d{8}[a-z])?"/g, `$1?v=${rev}"`);
fs.writeFileSync(page, html);
console.log(`index.html: ${modules.length} modules stamped ?v=${rev}`);
