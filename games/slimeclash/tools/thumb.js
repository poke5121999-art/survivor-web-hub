#!/usr/bin/env node
/*
 * Ảnh thẻ hub (assets/thumbnails/slimeclash.png): thẻ Khỉ nhào lộn và bàn cờ đầy slime, vừa ra đòn đầu nên máu quái đã tụt (cắt vùng giữa, chụp scale 2).
 * Dùng:  node games/slimeclash/tools/thumb.js   (màn dọc 405x720; trận lấy hạt giống theo chương/ngày nên chạy lại ra cùng ảnh)
 */
'use strict';
const path = require('path');
const L = require(path.join(__dirname, '..', '..', '..', 'tools', 'thumb-lib.js'));

async function main() {
  const srv = await L.serve(), br = await L.browser();
  const { page, problems } = await L.openGame(br, srv.base, 'slimeclash', '', { width: 405, height: 720, scale: 2 });
  await page.waitForSelector('#btn-fight');
  await page.click('#btn-fight');
  await page.waitForTimeout(1200);
  await page.click('#btn-end');
  await page.waitForTimeout(700);
  console.log('ảnh thẻ: ' + await L.saveThumb(page, 'slimeclash', { x: 12, y: 146, width: 381, height: 464 }));
  if (problems.length) console.error('lỗi trang:\n  ' + problems.join('\n  '));
  await br.close(); srv.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
