#!/usr/bin/env node
/*
 * Ảnh thẻ hub (assets/thumbnails/sprite-cutter.png): sheet slime mẫu với lưới cắt 4×2, khung đang chọn và nền ô cờ tối.
 * Dùng:  node games/sprite-cutter/tools/thumb.js   (chụp 1280x720 nét gấp đôi, cắt vùng 16:9 quanh sheet)
 */
'use strict';
const path = require('path');
const L = require(path.join(__dirname, '..', '..', '..', 'tools', 'thumb-lib.js'));

async function main() {
  const srv = await L.serve(), br = await L.browser();
  const { page, problems } = await L.openGame(br, srv.base, 'sprite-cutter', '', { width: 1280, height: 720, scale: 2 });
  await page.waitForFunction(() => typeof S !== 'undefined' && S.img && document.getElementById('sheet').width > 0, null, { timeout: 30000 });
  await page.evaluate(() => { S.playing = false; setCur(3); S.sel = 3; changed(); });
  await page.waitForTimeout(400);
  const clip = await page.evaluate(() => {
    const a = document.getElementById('sheet-box').getBoundingClientRect(), w = a.width + 16, h = w * 9 / 16;
    return { x: a.left - 8, y: a.top + a.height / 2 - h / 2, width: w, height: h };
  });
  console.log('ảnh thẻ: ' + await L.saveThumb(page, 'sprite-cutter', clip));
  if (problems.length) console.error('lỗi trang:\n  ' + problems.join('\n  '));
  await br.close(); srv.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
