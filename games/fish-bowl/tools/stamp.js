// node games/fish-bowl/tools/stamp.js <rev>
// GitHub Pages caches every file for 10 minutes and module imports carry no ?v=, so a new main.js could run against an
// old game.js. The import map in index.html maps every module URL to the same URL with ?v=<rev> (relative imports
// resolve to these keys), window.FB_REV carries the rev to data fetches (stage.js, world.js, main.js), and every other
// ?v= in the page is rewritten. Same scheme as games/casual-farm/tools/stamp.js.
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

const page = path.join(G, 'index.html');
const imports = { three: `./vendor/three.module.min.js?v=${rev}` };
for (const f of modules) imports[`./${f}`] = `./${f}?v=${rev}`;
const map = `<script type="importmap">\n${JSON.stringify({ imports }, null, 1)}\n</script>\n<script>window.FB_REV = '${rev}';</script>`;
let html = fs.readFileSync(page, 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>(\n<script>window\.FB_REV = '[^']*';<\/script>)?/, map)
  .replace(/href="css\/game\.css(\?v=[^"]*)?"/, `href="css/game.css?v=${rev}"`)
  .replace(/src="js\/main\.js(\?v=[^"]*)?"/, `src="js/main.js?v=${rev}"`)
  .replace(/\?v=\d{8}[a-z]/g, `?v=${rev}`);
fs.writeFileSync(page, html);
console.log(`games/fish-bowl/index.html: ${modules.length} modules stamped ?v=${rev}`);
