// Playwright helpers for the checks: launch Chrome, a deterministic clock (rAF and performance.now driven by
// __step(n), Math.random seeded), console-error capture, and an in-browser image compositor for compare sheets.
'use strict';
const fs = require('fs');
const path = require('path');
const PW = process.env.PW || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const { chromium } = require(PW);

const DETERMINISTIC = `(() => {
  let t = 1000, q = [];
  performance.now = () => t;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { ms = ms || 1000 / 60; for (let i = 0; i < n; i++) { t += ms; const cbs = q; q = []; for (const cb of cbs) cb(t); } return t; };
  let a = 12345 >>> 0;
  Math.random = function () { a = (a + 0x6D2B79F5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
})();`;

async function launch() {
  return chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] });
}

async function openPage(browser, url, { w = 1600, h = 900, deterministic = true, dpr = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  if (deterministic) await page.addInitScript(DETERMINISTIC);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  return { page, ctx, errors };
}

// compose images (PNG buffers) into a grid sheet with captions, returns a PNG buffer. cells: [{buf, label}], cols
async function sheet(browser, cells, opts = {}) {
  const { cols = 2, cw = 800, ch = 450, title = '' } = opts;
  const ctx = await browser.newContext({ viewport: { width: 400, height: 300 } });
  const page = await ctx.newPage();
  // a cell is {buf} (PNG bytes), {url} (fetched by the page; keeps big sheets out of the protocol) or empty
  const data = cells.map((c) => ({ src: c.url || (c.buf ? 'data:image/png;base64,' + c.buf.toString('base64') : null), label: c.label || '' }));
  if (opts.base) await page.goto(opts.base);
  const out = await page.evaluate(async ({ data, cols, cw, ch, title }) => {
    const rows = Math.ceil(data.length / cols), top = title ? 34 : 0, cap = 22;
    const cv = document.createElement('canvas'); cv.width = cols * cw; cv.height = top + rows * (ch + cap); const g = cv.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height); g.font = '15px system-ui, sans-serif'; g.fillStyle = '#ddd';
    if (title) { g.font = 'bold 18px system-ui, sans-serif'; g.fillText(title, 10, 23); g.font = '15px system-ui, sans-serif'; }
    for (let i = 0; i < data.length; i++) {
      const d = data[i], x = (i % cols) * cw, y = top + Math.floor(i / cols) * (ch + cap);
      if (d.src) { const im = new Image(); im.src = d.src; await im.decode(); const s = Math.min(cw / im.width, ch / im.height); g.drawImage(im, x + (cw - im.width * s) / 2, y, im.width * s, im.height * s); }
      g.fillStyle = '#ddd'; g.fillText(d.label, x + 8, y + ch + 16);
    }
    return cv.toDataURL('image/png');
  }, { data, cols, cw, ch, title });
  await ctx.close();
  return Buffer.from(out.split(',')[1], 'base64');
}

// mean absolute difference per channel (0..255) between two PNG buffers of equal size, plus a diff image
async function diff(browser, a, b) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 300 } });
  const page = await ctx.newPage();
  const r = await page.evaluate(async ({ a, b }) => {
    const load = async (s) => { const im = new Image(); im.src = s; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
    const A = await load(a), B = await load(b); const n = A.width * A.height; let s = 0, big = 0;
    const c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const g = c.getContext('2d'); const D = g.createImageData(A.width, A.height);
    for (let i = 0; i < n; i++) { const k = i * 4; const d = (Math.abs(A.data[k] - B.data[k]) + Math.abs(A.data[k + 1] - B.data[k + 1]) + Math.abs(A.data[k + 2] - B.data[k + 2])) / 3; s += d; if (d > 24) big++; const v = Math.min(255, d * 6); D.data[k] = v; D.data[k + 1] = v * 0.5; D.data[k + 2] = 0; D.data[k + 3] = 255; }
    g.putImageData(D, 0, 0); return { mad: s / n, bigPct: big / n * 100, img: c.toDataURL('image/png') };
  }, { a: 'data:image/png;base64,' + a.toString('base64'), b: 'data:image/png;base64,' + b.toString('base64') });
  await ctx.close();
  return { mad: r.mad, bigPct: r.bigPct, img: Buffer.from(r.img.split(',')[1], 'base64') };
}

function save(file, buf) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); }

module.exports = { launch, openPage, sheet, diff, save, DETERMINISTIC };
