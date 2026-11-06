// node games/mini-mart-coop/tools/stamp.js <rev>
// Same job as games/casual-farm/tools/stamp.js: an import map that maps every module URL to itself with ?v=<rev>, so a
// new boot.js never runs against a cached older game.js. It covers this game's modules and the solo game's modules it
// imports (keys are page-relative URLs, which match after resolution), plus `three`.
'use strict';
const fs = require('fs');
const path = require('path');

const rev = process.argv[2];
if (!/^\d{8}[a-z]$/.test(rev || '')) {
  console.error('usage: node stamp.js <rev like 20261028a>');
  process.exit(1);
}
const G = path.join(__dirname, '..');
const SOLO = path.join(G, '..', 'casual-farm');
const walk = (root, d) => fs.readdirSync(path.join(root, d), { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? walk(root, `${d}/${e.name}`) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []));

const imports = { three: `../casual-farm/vendor/three.module.min.js?v=${rev}` };
for (const f of walk(G, 'js').sort()) imports[`./${f}`] = `./${f}?v=${rev}`;
for (const f of [...walk(SOLO, 'js'), ...walk(SOLO, 'vendor')].sort()) imports[`../casual-farm/${f}`] = `../casual-farm/${f}?v=${rev}`;
const map = `<script type="importmap">\n${JSON.stringify({ imports }, null, 1)}\n</script>`;

const page = path.join(G, 'index.html');
let html = fs.readFileSync(page, 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, map).replace(/\?v=\d{8}[a-z]/g, `?v=${rev}`);
fs.writeFileSync(page, html);
console.log(`index.html: ${Object.keys(imports).length} modules stamped ?v=${rev}`);
