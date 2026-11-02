// node games/cats-soup/tools/stamp.js <rev>
// Same scheme as games/casual-farm/tools/stamp.js: GitHub Pages caches every file for 10 minutes, so the import map in
// index.html maps every module URL to the same URL with ?v=<rev> (relative imports inside modules resolve through it),
// and main.js passes its own ?v= to every data fetch (globalThis.CS_V).
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
const files = [...walk('js'), ...walk('vendor')].sort();
const imports = { three: `./vendor/three.module.min.js?v=${rev}` };
for (const f of files) imports[`./${f}`] = `./${f}?v=${rev}`;
const map = `<script type="importmap">\n${JSON.stringify({ imports }, null, 1)}\n</script>`;
const page = path.join(G, 'index.html');
let html = fs.readFileSync(page, 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, map)
  .replace(/(href|src)="(\.\/[^"?]+\.(?:css|js))(\?v=[^"]*)?"/g, (m, a, u) => `${a}="${u}?v=${rev}"`);
fs.writeFileSync(page, html);
console.log(`index.html: ${files.length} modules stamped ?v=${rev}`);
