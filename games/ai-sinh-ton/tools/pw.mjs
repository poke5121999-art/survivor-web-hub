// Shared Playwright plumbing for the browser tools: static server on the repo root (or AST_BASE for the deployed
// site), Chrome launch, the two phone sizes, the hub session the login gate wants, and error capture.
// One Chrome at a time on this box: every tool takes the lock file before launching.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV = process['env'];
export const ROOT = path.resolve(HERE, '../../..');
export const GAME = '/games/ai-sinh-ton/index.html';
const PW = ENV.PLAYWRIGHT_PATH || path.join(ENV.HOME, '.cache/pw-node/node_modules/playwright-core');
const LOCK = path.join(ROOT, '.chk', 'chrome.lock');

export const PHONES = {
  s22: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  xiaomi: { viewport: { width: 461, height: 1002 }, deviceScaleFactor: 2.75, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

export function serve() {
  if (ENV.AST_BASE) return Promise.resolve({ base: ENV.AST_BASE.replace(/\/$/, ''), close() {} });
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.stat(f, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(f).pipe(res);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ base: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() }));
  });
}

function takeLock() {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  const until = Date.now() + 600000;
  for (;;) {
    try { fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); return; } catch (e) {
      let pid = 0; try { pid = +fs.readFileSync(LOCK, 'utf8'); } catch (e2) { continue; }
      let alive = false; try { process.kill(pid, 0); alive = true; } catch (e3) { alive = false; }
      if (!alive) { try { fs.unlinkSync(LOCK); } catch (e4) {} continue; }
      if (Date.now() > until) throw new Error('chrome lock held by pid ' + pid + ' for 10 minutes');
      execFileSync('sleep', ['2']);
    }
  }
}
function dropLock() { try { if (+fs.readFileSync(LOCK, 'utf8') === process.pid) fs.unlinkSync(LOCK); } catch (e) {} }

// GL=egl uses the GPU (default), GL=swiftshader the software path
export async function launch() {
  takeLock();
  process.on('exit', dropLock);
  const gl = ENV.GL || 'egl';
  const args = gl === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'];
  const br = await require(PW).chromium.launch({ channel: 'chrome', headless: true, args: [...args, '--autoplay-policy=no-user-gesture-required'] });
  const close = br.close.bind(br);
  br.close = async () => { await close(); dropLock(); };
  return br;
}

// a page on the game with a member session, console errors collected in `problems`
export async function open(br, base, phone, query = '', opts = {}) {
  const ctx = await br.newContext(PHONES[phone]);
  await ctx.addInitScript((keep) => {
    try {
      localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'test@local' }));
      if (!keep && !sessionStorage.getItem('__fresh')) { localStorage.removeItem('aisinhton.save.v1'); localStorage.removeItem('aisinhton.settings.v1'); sessionStorage.setItem('__fresh', '1'); }
    } catch (e) {}
  }, !!opts.keepSave);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 300)); });
  page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));
  const q = opts.fresh || /(^|&)preset=/.test(query) ? query : (query ? query + '&' : '') + 'preset=vet';
  await page.goto(base + (opts.path || GAME) + (q ? '?' + q : ''));
  if (!opts.noWait) await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
  return { ctx, page, problems };
}

export function checker() {
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); return ok; };
  const done = () => { console.log(fails.length ? `\n${fails.length} FAILED\n` + fails.map((f) => '  - ' + f).join('\n') : '\nALL PASS'); process.exitCode = fails.length ? 1 : 0; };
  return { check, done, fails };
}

// tile PNG files into one review sheet with PIL
export function sheet(files, out, cols = 4, cellW = 360) {
  const py = `
import sys
from PIL import Image
files=sys.argv[3:]; cols=int(sys.argv[2]); W=${cellW}
ims=[Image.open(f).convert('RGB') for f in files]
ims=[i.resize((W,int(i.height*W/i.width))) for i in ims]
H=max(i.height for i in ims); rows=(len(ims)+cols-1)//cols
s=Image.new('RGB',(cols*W+(cols+1)*8, rows*H+(rows+1)*8),(18,18,22))
for k,i in enumerate(ims): s.paste(i,(8+(k%cols)*(W+8), 8+(k//cols)*(H+8)))
s.save(sys.argv[1])`;
  execFileSync('python3', ['-c', py, out, String(cols), ...files]);
}
