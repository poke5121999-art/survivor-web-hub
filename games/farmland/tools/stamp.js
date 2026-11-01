// node tools/stamp.js <rev like 20261031a>
// Writes an import map that maps every module URL (and `three`) to itself with ?v=<rev>, and bumps every ?v= in
// index.html, so a new main.js never runs against a cached older module. Also writes version.json.
'use strict';
const fs = require('fs');
const path = require('path');
const rev = process.argv[2];
if (!/^\d{8}[a-z]$/.test(rev || '')) { console.error('usage: node tools/stamp.js <rev like 20261031a>'); process.exit(1); }
const G = path.join(__dirname, '..');
const walk = d => fs.readdirSync(path.join(G, d), { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []));
const imports = { three: `./vendor/three.module.min.js?v=${rev}` };
for (const f of [...walk('js'), ...walk('vendor')].sort()) imports[`./${f}`] = `./${f}?v=${rev}`;
const map = `<script type="importmap">\n${JSON.stringify({ imports }, null, 1)}\n</script>`;
const page = path.join(G, 'index.html');
let html = fs.readFileSync(page, 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, map).replace(/\?v=\d{8}[a-z]/g, `?v=${rev}`);
fs.writeFileSync(page, html);
fs.writeFileSync(path.join(G, 'version.json'), JSON.stringify({ rev, built: new Date().toISOString() }) + '\n');
console.log(`index.html: ${Object.keys(imports).length} modules stamped ?v=${rev}`);
