// Screenshot the sprite render proof. Usage: node render-proof.js [id] [form]
const path = require('path'), http = require('http'), fs = require('fs');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');
const id = (process.argv[2] || '026'), form = (process.argv[3] || 'f');

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    let fp = path.join(dir, p);
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
}

(async () => {
  const srv = serve(ROOT); await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1060, height: 900 } });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[err]', e.message));
  await page.goto(`http://localhost:${port}/test/render-proof.html`);
  await page.evaluate(([i, f]) => window.run(i, f), [id, form]);
  await page.waitForFunction(() => document.title === 'done', { timeout: 8000 }).catch(() => {});
  const out = path.join(__dirname, `proof_${id}_${form}.png`);
  await page.screenshot({ path: out });
  console.log('screenshot', out);
  await browser.close(); srv.close();
})();
