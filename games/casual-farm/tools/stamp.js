// node games/casual-farm/tools/stamp.js <rev>
// GitHub Pages caches every file for 10 minutes, and `import './view/game.js'` carries no ?v=, so a new main.js could
// run against an old game.js. The import map in index.html maps every module URL to the same URL with ?v=<rev>
// (URL-like keys match after resolution, so relative imports inside modules are covered too). This rewrites that
// map and every other ?v= in index.html; data fetches already take ?v= from main.js's own URL.
// games/cho-viet runs this engine with a theme, so its page is stamped with the same rev: the engine's modules under
// ../casual-farm/ plus its own js/.
'use strict';
const fs = require('fs');
const path = require('path');

const rev = process.argv[2];
if (!/^\d{8}[a-z]$/.test(rev || '')) {
  console.error('usage: node stamp.js <rev like 20261026a>');
  process.exit(1);
}
const G = path.join(__dirname, '..');
const walk = (base, d) => fs.readdirSync(path.join(base, d), { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? walk(base, `${d}/${e.name}`) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []));
const engine = [...walk(G, 'js'), ...walk(G, 'vendor')].sort();

function stamp(page, prefix, own) {
  const imports = { three: `${prefix}vendor/three.module.min.js?v=${rev}` };
  for (const f of engine) imports[`${prefix}${f}`] = `${prefix}${f}?v=${rev}`;
  for (const f of own) imports[`./${f}`] = `./${f}?v=${rev}`;
  const map = `<script type="importmap">\n${JSON.stringify({ imports }, null, 1)}\n</script>`;
  let html = fs.readFileSync(page, 'utf8');
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, map).replace(/\?v=\d{8}[a-z]/g, `?v=${rev}`);
  fs.writeFileSync(page, html);
  console.log(`${path.relative(path.join(G, '..'), page)}: ${engine.length + own.length} modules stamped ?v=${rev}`);
}

stamp(path.join(G, 'index.html'), './', []);
const CV = path.join(G, '..', 'cho-viet');
if (fs.existsSync(path.join(CV, 'index.html'))) stamp(path.join(CV, 'index.html'), '../casual-farm/', walk(CV, 'js').sort());
