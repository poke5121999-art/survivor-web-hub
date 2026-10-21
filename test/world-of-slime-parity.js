/*
 * Thế Giới Slime: chụp bản web cùng chỗ đứng + cùng điểm nhìn camera với ảnh chụp demo thật D:\wos-ref\pilot\<key>.png,
 * cho skill parity-compare. Ra D:\wos-ref\proof\larus\web\<key>.png và chép ảnh gốc vào ref\<key>\<key>.png.
 * Chỗ đứng / điểm nhìn đo trong ảnh (thước ~33 px/m ngang, ~25.7 px/m dọc ở góc cúi 50, mốc: đài phun nước (59.5, 69.5), cửa quán
 * trọ (87.5, 71.2), cửa kho (83.5, 93.0), nhà t01_house_004 (28.5, 47.5), phòng kho đối xứng quanh x 32.5).
 *   node test/world-of-slime-parity.js [key...]       (WOS_BASE, WOS_ASSETS như world-of-slime-larus.js)
 */
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const BASE = (process.env.WOS_BASE || 'http://127.0.0.1:8841/games/world-of-slime/').replace(/\/?$/, '/');
const ASSETS = process.env.WOS_ASSETS === undefined ? 'http://127.0.0.1:8842/' : process.env.WOS_ASSETS;
const OUT = process.env.WOS_PARITY || 'D:/wos-ref/proof/larus';
const PILOT = 'D:/wos-ref/pilot';

// key: [map, người chơi x,z, điểm nhìn x,z]  [ĐO TRONG ẢNH]
const SHOTS = {
  inn1: [257, 9.7, 34.5, 9.7, 34.5],
  w1: [257, 16.4, 34.5, 16.4, 34.5],
  w2: [257, 22.0, 30.0, 22.5, 29.0],
  out2: [110, 87.5, 69.6, 87.5, 70.0],
  v2: [110, 90.3, 67.3, 91.4, 68.9],
  v3: [110, 74.3, 76.5, 74.0, 80.8],
  v4: [110, 76.1, 97.6, 76.7, 99.2],
  x2: [110, 75.4, 70.4, 75.4, 70.6],
  x3: [110, 68.4, 67.4, 68.4, 66.8],
  x4: [110, 37.0, 54.1, 37.0, 53.7],
  x5: [110, 29.3, 57.4, 27.5, 56.8],
  s1: [110, 34.7, 54.9, 34.7, 54.1],
  b4: [110, 36.9, 53.9, 36.9, 53.3],
  v9: [478, 32.5, 24.0, 32.5, 24.4],
  al4: [478, 32.5, 36.4, 32.5, 38.3],
  h5: [478, 32.5, 36.4, 32.5, 38.3],
};

(async () => {
  const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
  fs.mkdirSync(OUT + '/web', { recursive: true });
  const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const kill = setTimeout(() => { console.log('timeout'); process.exit(2); }, 400000);
  const page = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  for (const k of keys) {
    const [m, px, pz, cx, cz] = SHOTS[k];
    const q = `?map=${m}&at=${px},${pz}&camat=${cx},${cz}` + (ASSETS ? '&assets=' + encodeURIComponent(ASSETS) : '');
    await page.goto(BASE + 'index.html' + q);
    await page.waitForFunction(() => window.__ready && WOS.npcs.length > 0, null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/web/${k}.png` });
    fs.mkdirSync(`${OUT}/ref/${k}`, { recursive: true });
    fs.copyFileSync(path.join(PILOT, k + '.png'), `${OUT}/ref/${k}/${k}.png`);
    console.log(k, 'ok');
  }
  clearTimeout(kill); await b.close();
})();
