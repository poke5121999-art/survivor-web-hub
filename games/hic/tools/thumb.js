#!/usr/bin/env node
/*
 * Chụp ảnh thẻ hub (assets/thumbnails/hic.png) từ Hắn Đang Tới: bot dạo bản đồ hạt giống cố định tới trận
 * auto-battler đầu tiên, chụp lúc hai bên đang đánh nhau.
 * Dùng:  node games/hic/tools/thumb.js [seed] [giây-chờ-sau-khi-vào-trận]
 */
'use strict';
const path = require('path');
const T = require(path.join(__dirname, '..', '..', '..', 'tools', 'thumb-lib.js'));

async function main() {
  const seed = +(process.argv[2] || 7), delay = +(process.argv[3] || 1.5);
  const srv = await T.serve(), br = await T.browser();
  const { page, ctx, problems } = await T.openGame(br, srv.base, 'hic', '', { width: 1280, height: 720 });
  ctx.setDefaultTimeout(120000);
  await page.waitForFunction(() => window.HIC_UI && window.HIC_BOT && window.HIC_UI.run, null, { timeout: 60000 });
  await page.evaluate((s) => { window.HIC_UI.newRun(s); window.HIC_BOT.start(30);
    // Dừng bot đúng lúc trận bắt đầu, nếu không nó bấm lướt qua trận trước khi kịp chụp.
    new MutationObserver((_, o) => { if (document.querySelector('#hic-battle canvas.hic-scene')) { window.HIC_BOT.stop(); o.disconnect(); } })
      .observe(document.getElementById('hic-battle'), { childList: true });
  }, seed);
  await page.waitForFunction(() => { return !!document.querySelector('#hic-battle canvas.hic-scene'); }, null, { timeout: 120000, polling: 50 });
  await page.waitForTimeout(delay * 1000);
  console.log('ảnh thẻ: ' + await T.saveThumb(page, 'hic'));
  const errs = await page.evaluate(() => window.__errs || []);
  problems.push(...errs);
  if (problems.length) { console.error('lỗi trang:\n  ' + problems.join('\n  ')); process.exitCode = 1; }
  await br.close(); srv.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
