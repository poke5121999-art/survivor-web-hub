// Render each sheet layout in Chrome (Playwright), save shots/layout-<sheet>.png,
// collect console errors, dump per-prop tri counts, then build compare sheets with Python.
// usage: node tools/shoot.mjs [--sheets props,vehicles,workshop,campfire] [--only id1,id2] [--out subdir] [--q low]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core/index.js';
const pwMod = await import('file:///' + PW); const chromium = pwMod.chromium || pwMod.default.chromium;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const sheets = arg('sheets', 'props,vehicles,workshop,campfire').split(',');
const only = arg('only', '');
const port = +arg('port', String(8700 + Math.floor(Math.random() * 200)));
const q = arg('q', 'high');
const OUT = path.join(ROOT, 'shots', arg('out', ''));
const SIZES = { props: [1461, 829], vehicles: [1378, 773], workshop: [1446, 848], campfire: [1437, 761] };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css' };

const killer = setTimeout(() => { console.error('shoot: overall timeout 240s'); process.exit(2); }, 240000);
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(port);

const errors = [];
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  fs.mkdirSync(path.join(OUT, 'compare'), { recursive: true });
  const stats = {};
  for (const sh of sheets) {
    const [w, h] = SIZES[sh];
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${sh}] ${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`[${sh}] pageerror: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/index.html?shoot&sheet=${sh}${q === 'low' ? '&q=low' : ''}`, { timeout: 30000 });
    await page.waitForFunction(() => window.SP && window.SP.ready, null, { timeout: 60000 });
    await page.evaluate(() => { document.getElementById('bar').style.display = 'none'; document.getElementById('hint').style.display = 'none'; });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `layout-${sh}.png`) });
    stats[sh] = await page.evaluate(() => ({ perProp: window.SP.perProp(), render: null }));
    if (sh === 'workshop' || sh === 'campfire') { // scenes overlap: also shoot each prop alone for its compare tile
      for (const e of stats[sh].perProp) {
        await page.evaluate((c) => window.SP.isolate(c), e.cell);
        await page.waitForTimeout(120);
        await page.screenshot({ path: path.join(OUT, `layout-${sh}-${e.cell}.png`) });
      }
      await page.evaluate(() => window.SP.isolate(null));
    }
    if (sh === sheets[0]) stats.all = await page.evaluate(() => window.SP.allProps());
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 1));
} catch (e) { errors.push('shoot failed: ' + (e.stack || e.message)); }
finally { if (browser) await browser.close(); server.close(); }

const py = ['tools/compare.py', '--sheets', sheets.join(','), '--out', arg('out', '')]; if (only) py.push('--only', only);
try { console.log(execFileSync('python', py, { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 120000 }).toString()); }
catch (e) { errors.push('compare.py failed: ' + e.message); }
fs.writeFileSync(path.join(OUT, 'console.txt'), errors.join('\n') + '\n');
console.log(errors.length ? `CONSOLE ISSUES (${errors.length}):\n` + errors.slice(0, 30).join('\n') : 'console: 0 errors/warnings');
clearTimeout(killer);
process.exit(0);
