// Shared Playwright plumbing for the browser tools: static server on the repo root (or AST_BASE for the deployed
// site), Chrome launch, the two phone sizes, the hub session the login gate wants, and error capture.
// Two Chromes at a time on this box: every tool takes one of two slot files before launching.
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
  s22: { viewport: { width: 780, height: 360 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  xiaomi: { viewport: { width: 1002, height: 461 }, deviceScaleFactor: 2.75, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
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

// Two Chromes at most on this box, across every session and worktree (each worktree's .chk is a link to the main one):
// a tool holds one of two slot files, written with its pid; a slot whose pid is gone is free again. The old single lock
// file counts as a held slot while a tool started before this change is still running.
const SLOTS = ['A', 'B'].map((k) => LOCK + '.' + k);
let mine = '';
const holder = (f) => { let pid = 0; try { pid = +fs.readFileSync(f, 'utf8'); } catch (e) { return 0; } if (!pid) return 0; try { process.kill(pid, 0); return pid; } catch (e) { try { fs.unlinkSync(f); } catch (e2) {} return 0; } };
function takeLock() {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  const until = Date.now() + 1800000;
  for (;;) {
    const held = [...SLOTS, LOCK].filter((f) => holder(f)).length;
    if (held < SLOTS.length) for (const f of SLOTS) { try { fs.writeFileSync(f, String(process.pid), { flag: 'wx' }); mine = f; return; } catch (e) {} }
    if (Date.now() > until) throw new Error('both chrome slots held for 30 minutes (pids ' + SLOTS.map(holder).join(', ') + ')');
    execFileSync('sleep', ['2']);
  }
}
function dropLock() { try { if (mine && +fs.readFileSync(mine, 'utf8') === process.pid) fs.unlinkSync(mine); } catch (e) {} mine = ''; }

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
  // freeze: the game's own frame loop (main.js `loop`) never gets its first frame, so nothing moves in real time between
  // the tool's calls; the tool drives the fight with __sim(seconds) and the HUD/animation clocks with __step(frames).
  // Done from the start (not after ready) because a loop that already ran has advanced the fight by a random amount.
  if (opts.freeze) await ctx.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    // js/feedback-capture.js re-wraps requestAnimationFrame with an anonymous callback, which would hide the name: keep ours
    const gate = (cb) => (cb && cb.name === 'loop' ? 0 : raf(cb));
    Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, get: () => gate, set: () => {} });
    // the view also reads performance.now (actor animation clocks, hit-stop) and Math.random (particles): a virtual clock
    // that only __step/__sim advance and a fixed-seed generator make those the same on every run too
    let vt = 1000; let seed = 12345;
    performance.now = () => vt;
    Math.random = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (const [name, ms] of [['__step', (n) => (n === undefined ? 1 : n) * 1000 / 60], ['__sim', (n) => n * 1000]]) {
      let fn;
      Object.defineProperty(window, name, { configurable: true, get: () => fn, set: (f) => { fn = (n) => { vt += ms(n); return f(n); }; } });
    }
  });
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
