#!/usr/bin/env node
/*
 * Chụp ảnh thẻ hub (assets/thumbnails/stardew.png) từ Quần Đảo Sao Rơi: ván mới, nhân vật đứng giữa đảo nhà
 * với nhà, ruộng, cây, rương và con cáo. Màn dọc chụp ở 720x1560, cắt khung 16:9 quanh nhân vật (bỏ HUD).
 * Dùng:  node games/stardew/tools/thumb.js
 */
'use strict';
const path = require('path');
const T = require(path.join(__dirname, '..', '..', '..', 'tools', 'thumb-lib.js'));

async function main() {
  const srv = await T.serve(), br = await T.browser();
  const { page, ctx, problems } = await T.openGame(br, srv.base, 'stardew', 'new=1', { width: 720, height: 1560 });
  ctx.setDefaultTimeout(120000);
  await page.waitForFunction(() => window.GAME && window.GAME.sim && window.ISL_TUTORIAL, null, { timeout: 60000 });
  const clear = () => page.evaluate(() => { window.ISL_TUTORIAL.skipAll(); window.ISL_UI.closeAll(); });
  await clear();
  await page.waitForTimeout(3000);
  await clear();
  await page.waitForTimeout(1500);
  console.log('ảnh thẻ: ' + await T.saveThumb(page, 'stardew', { x: 0, y: 490, width: 720, height: 405 }));
  const errs = await page.evaluate(() => window.__errs || []);
  problems.push(...errs);
  if (problems.length) { console.error('lỗi trang:\n  ' + problems.join('\n  ')); process.exitCode = 1; }
  await br.close(); srv.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
