// Techniques studied from Voxel Engine by mattshumer (spawn.co), analysis/audio-physical.md; code is our own.
// Self-test for lib/audio: static server + headless Chrome, measures peak/RMS per event kind.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
let chromium;
try { ({ chromium } = await import('file:///' + PW + '/index.mjs')); }
catch (e) { chromium = createRequire(PW + '/')('playwright-core').chromium; }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.normalize(path.join(ROOT, decodeURIComponent(req.url.split('?')[0])));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

let browser, report = { pass: false };
const hard = setTimeout(() => { console.log(JSON.stringify({ pass: false, error: 'hard timeout 90s' })); process.exit(2); }, 90000);

async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'], timeout: 30000 });
  const page = await browser.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${port}/lib/audio/test.html`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  const r = await page.evaluate(() => window.runAll());
  if (r.error) { report = { pass: false, ...r, problems }; return; }
  const fails = [];
  const kinds = {};
  for (const [k, v] of Object.entries(r.kinds)) {
    kinds[k] = v;
    if (k === 'unknown') { if (v.rms > 0.003) fails.push('unknown kind sounded'); continue; }
    if (!(v.rms > 0.003)) fails.push(`${k} inaudible rms=${v.rms}`);
    if (!(v.peak <= 1.0)) fails.push(`${k} clips peak=${v.peak}`);
  }
  if (!(r.collapse.peak <= 1.0)) fails.push('collapse clips ' + r.collapse.peak);
  if (!(r.collapse.voicesMax <= 32)) fails.push('voices over budget ' + r.collapse.voicesMax);
  if (!(r.collapse.rms > 0.003)) fails.push('collapse inaudible');
  if (problems.length) fails.push('console problems: ' + problems.length);
  if (r.stats.bankMs > 1500) fails.push('bank cpu ' + r.stats.bankMs);
  if (r.stats.bankKB > 12 * 1024) fails.push('bank memory ' + r.stats.bankKB);
  report = { pass: fails.length === 0, fails, bankMs: r.stats.bankMs, bankWallMs: r.stats.bankWallMs, maxSliceMs: r.stats.maxSliceMs, bankKB: r.stats.bankKB,
    sampleRate: r.sampleRate, preState: r.preState, kinds, collapse: r.collapse, stats: r.stats, voiceBudget: 32, consoleErrors: problems.length, problems };
}

try { await main(); } catch (e) { report = { pass: false, error: String(e && e.stack || e) }; }
finally {
  clearTimeout(hard);
  try { if (browser) await browser.close(); } catch (e) { /* ignore */ }
  try { server.close(); } catch (e) { /* ignore */ }
  try { fs.mkdirSync(path.join(ROOT, 'shots/audio'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'shots/audio/report.json'), JSON.stringify(report, null, 1)); } catch (e) { /* ignore */ }
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.pass ? 0 : 1);
}
