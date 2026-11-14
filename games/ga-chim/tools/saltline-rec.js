// Runs the local Saltline mirror, drives fire/reload/sprint through its own input object, records video.
'use strict';
const http = require('http'); const fs = require('fs'); const path = require('path');
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const ROOT = 'D:/ref-saltline-gh/repo'; const OUT = process.argv[2]; const MODE = process.argv[3] || 'probe';
fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); s.end(d); }); }).listen(8733);
(async () => {
  const br = await require(PW).chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: MODE === 'rec' ? { dir: OUT, size: { width: 1280, height: 720 } } : undefined });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8733/?autostart=1&noaudio=1&q=high');
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  if (MODE === 'probe') {
    console.log(await page.evaluate(`(() => { const G = __G; const o = {}; for (const k of Object.keys(G)) o[k] = typeof G[k]; const inp = G.input || {}; return JSON.stringify({ G: o, input: Object.keys(inp).slice(0, 60), weapon: Object.keys(G.weapon || {}).slice(0, 60) }); })()`));
  } else {
    await page.evaluate(`(() => { const I = __G.input; I.locked = true; try { Object.defineProperty(document, 'pointerLockElement', { get: () => __G.renderer.domElement, configurable: true }); } catch (e) {} })()`);
    await page.waitForTimeout(1500);
    await page.mouse.down(); await page.waitForTimeout(1400); await page.mouse.up();
    await page.waitForTimeout(700);
    await page.mouse.down({ button: 'right' }); await page.waitForTimeout(500); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up(); await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(500);
    await page.keyboard.press('KeyR'); await page.waitForTimeout(2800);
    await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await page.waitForTimeout(1800); await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
    await page.waitForTimeout(600);
    console.log('ammo', await page.evaluate('__G.weapon.ammo'));
  }
  await ctx.close(); await br.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
