#!/usr/bin/env node
/* Chụp mọi màn UI ở 832x384 (Galaxy S22 ngang) và 1280x720 vào thư mục ra. Console phải 0 lỗi. Trần 150 s. */
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { PW } = require('./pw.js');
const { chromium } = require(PW);

const OUT = process.argv[2] || require('./pw.js').scratch('ui');
const SCREENS = ['home', 'modes', 'squad', 'gacha', 'shop', 'quest', 'settings', 'confirm', 'toast',
  'hud', 'hud-touch', 'hud-pad', 'runend-win', 'runend-lose'];
const SIZES = [[832, 384], [1280, 720]];

(async () => {
  const killer = setTimeout(() => { console.error('quá 150 s, dừng'); process.exit(3); }, 150000);
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  let code = 0;
  try {
    for (const [w, h] of SIZES) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${w}x${h} ${m.type()}: ${m.text()}`); });
      page.on('pageerror', e => errors.push(`${w}x${h} pageerror: ${e.message}`));
      page.on('requestfailed', r => errors.push(`${w}x${h} requestfailed: ${r.url()}`));
      page.on('response', r => { if (r.status() >= 400) errors.push(`${w}x${h} http ${r.status()}: ${r.url()}`); });
      await page.goto(srv.base + '/games/repo3d/ui-preview.html', { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', null, { timeout: 20000 });
      for (const s of SCREENS) {
        await page.evaluate(n => window.__screen(n), s);
        await page.waitForTimeout(350); // animation pop 0.22 s
        await page.screenshot({ path: path.join(OUT, `${s}_${w}x${h}.png`) });
      }
      await page.close();
    }
  } finally {
    await browser.close();
    srv.close();
    clearTimeout(killer);
  }
  console.log('console lỗi/cảnh báo: ' + errors.length);
  errors.slice(0, 20).forEach(e => console.log('  ' + e));
  console.log('ảnh: ' + OUT);
  process.exit(errors.length ? 1 : code);
})().catch(e => { console.error(e); process.exit(2); });
