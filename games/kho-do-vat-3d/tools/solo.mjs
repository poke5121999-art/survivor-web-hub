// Close-up renders of single props (inspect view) -> shots/solo/<id>[-<variant>].png
// usage: node tools/solo.mjs id1,id2 [--variants] [--size 900x640] [--theta 0.35] [--phi 1.05]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core/index.js';
const pwMod = await import('file:///' + PW); const chromium = pwMod.chromium || pwMod.default.chromium;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ids = (process.argv[2] || '').split(',').filter(Boolean);
const [W, H] = arg('size', '900x640').split('x').map(Number);
const port = 8900 + Math.floor(Math.random() * 90);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const killer = setTimeout(() => { console.error('solo: timeout 180s'); process.exit(2); }, 180000);
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
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?shoot&sheet=variants`, { timeout: 30000 });
  await page.waitForFunction(() => window.SP && window.SP.ready, null, { timeout: 60000 });
  await page.evaluate(() => { for (const id of ['bar', 'hint', 'side']) document.getElementById(id).style.display = 'none'; });
  fs.mkdirSync(path.join(ROOT, 'shots', 'solo'), { recursive: true });
  for (const id of ids) {
    const vars = await page.evaluate((id) => (window.SP.PROPS.find((p) => p.id === id)?.variants || [{ label: '', seed: 1, opts: {} }]).map((v) => ({ label: v.label, seed: v.seed, opts: v.opts })), id);
    const list = process.argv.includes('--variants') ? vars : [vars[0]];
    for (const v of list) {
      const r = await page.evaluate(({ id, v, th, ph }) => { try { window.SP.inspect(id, v.seed, v.opts); window.SP.view(th, ph); return 'ok'; } catch (e) { return String(e.stack || e); } },
        { id, v, th: +arg('theta', 'NaN'), ph: +arg('phi', 'NaN') });
      if (r !== 'ok') { errors.push(id + ': ' + r); continue; }
      await page.waitForTimeout(250);
      const name = list.length > 1 ? `${id}-${(v.label || 'v').replace(/[^\w\u00C0-\u1EF9-]+/g, '_')}` : id;
      await page.screenshot({ path: path.join(ROOT, 'shots', 'solo', name + '.png') });
      console.log('shot', name);
    }
  }
} catch (e) { errors.push('solo failed: ' + (e.stack || e.message)); }
finally { if (browser) await browser.close(); server.close(); clearTimeout(killer); }
console.log(errors.length ? 'CONSOLE ISSUES:\n' + errors.join('\n') : 'console: 0 errors/warnings');
process.exit(0);
