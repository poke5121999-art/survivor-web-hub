// Bakes the Blockade Z voxel characters (heroes, zombies / monsters, bosses) from the running game into data/bz-cast.js.
// Usage: node D:/voxel-chars/tools/bake-bz.js            (ONLY=thep,walker  to bake a few; OUT=<file> to write elsewhere)
// Starts its own static server on D:/hub-bzvox (read only), drives Chrome headless through Playwright, kills everything at the end.
'use strict';
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = 'D:/hub-bzvox';
const HERE = __dirname; const OUT = process.env.OUT || path.join(HERE, '..', 'data', 'bz-cast.js');
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const kill = setTimeout(() => { console.log('TIMEOUT (9 min)'); process.exit(3); }, 9 * 60 * 1000);
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(ROOT, u);
  if (!path.normalize(f).startsWith(path.normalize(ROOT))) { res.writeHead(403); return res.end(); }
  fs.stat(f, (e, st) => { if (e || !st.isFile()) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size }); fs.createReadStream(f).pipe(res); });
});
const srvKill = setTimeout(() => srv.close(), 9 * 60 * 1000);

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core');
  const br = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const errors = []; const chars = []; const report = []; let rev = '?';
  try {
    const ctx = await br.newContext({ viewport: { width: 640, height: 480 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'bake@test' })); } catch (e) {} });
    const page = await ctx.newPage(); page.setDefaultTimeout(120000);
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
    await page.goto(base + '/games/blockade-z/index.html?lang=vi&autostart=1&nolock=1&noaudio=1&seed=4&q=medium');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const m = /boot\.js\?v=(\w+)/.exec(fs.readFileSync(ROOT + '/games/blockade-z/index.html', 'utf8')); if (m) rev = m[1];
    // the same plain staging as tools/voxchars.js: no town, a flat floor, no HUD
    await page.evaluate(`(() => { const G = __G; G.god = true; G.tps.on = false; G.state = 'paused'; G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear();
      for (const c of G.scene.children) if (c === G.world.group || c.name === 'vox-town') c.visible = false; })()`);
    await page.evaluate(fs.readFileSync(path.join(HERE, 'bz-bake-page.js'), 'utf8'));
    const heroIds = await page.evaluate('BZ.HEROES.map((h) => h.id)'); const zIds = await page.evaluate('Object.keys(BZ.ZOMBIES)');
    const jobs = heroIds.map((id) => ['hero', id]).concat(zIds.map((id) => ['zombie', id]));
    for (const [kind, id] of jobs) {
      if (ONLY && !ONLY.has(id)) continue; const t0 = Date.now();
      let c; try { c = await page.evaluate(`BAKE.${kind}(${JSON.stringify(id)})`); } catch (e) { errors.push('bake ' + id + ': ' + String(e.message).slice(0, 300)); console.log('FAIL', id, String(e.message).slice(0, 200)); continue; }
      chars.push(c); const cl = Object.keys(c.clips).map((k) => k + ':' + c.clips[k].frames + 'f/' + c.clips[k].nodes.length + 'n');
      console.log((Date.now() - t0) + 'ms', c.group, c.id, c.name, 'h=' + c.height, 'vox=' + c.vox, 'nodes=' + c.nodes.length, 'parts=' + c.parts.length, cl.join(' '), c._skipped.length ? 'skipped=' + c._skipped.join(',') : '', JSON.stringify(c._info));
    }
  } finally { await br.close(); srv.close(); }
  const order = { heroes: 0, zombies: 1, bosses: 2 }; chars.sort((a, b) => order[a.group] - order[b.group]);
  const diag = {}; for (const c of chars) { diag[c.id] = { skipped: c._skipped, info: c._info, clips: c._clipInfo, bbox: c._bbox }; delete c._skipped; delete c._info; delete c._clipInfo; delete c._bbox; }
  const cast = { version: 1, made: new Date().toISOString().slice(0, 10), source: 'D:/hub-bzvox games/blockade-z rev ' + rev, chars };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, '// Blockade Z voxel cast, baked by tools/bake-bz.js. Format: see tools/check-bz-cast.js.\nexport const BZ_CAST = ' + JSON.stringify(cast) + ';\n');
  fs.writeFileSync(path.join(path.dirname(OUT), 'bz-cast.diag.json'), JSON.stringify(diag, null, 1));
  console.log('wrote', OUT, (fs.statSync(OUT).size / 1048576).toFixed(2) + ' MB,', chars.length, 'characters');
  console.log(errors.length ? 'PAGE ERRORS ' + errors.length + '\n' + errors.slice(0, 12).join('\n') : 'no page errors');
  clearTimeout(kill); clearTimeout(srvKill); process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.log('ERR', e); process.exit(2); });
