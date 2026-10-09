#!/usr/bin/env node
/*
 * Chụp ảnh thẻ hub (assets/thumbnails/ghe-nong.png): trận 5v5 trên bản đồ, đang giữa giao tranh.
 * Dùng:  node games/ghe-nong/tools/thumb.js [số tick tua sẵn, mặc định 1500]
 */
'use strict';
const path = require('path');
const L = require(path.join(__dirname, '..', '..', '..', 'tools', 'thumb-lib.js'));
(async () => {
  const tick = process.argv[2] || '1500';
  const srv = await L.serve(), br = await L.browser();
  const { page, problems } = await L.openGame(br, srv.base, 'ghe-nong', null);
  await page.goto(srv.base + '/games/ghe-nong/index.html#tran:' + tick);
  await page.reload();
  await page.getByText('Hiểu rồi').click({ timeout: 60000 });
  await page.getByText('Tạm dừng').first().click({ timeout: 30000 });
  await page.waitForTimeout(1500);
  console.log('ảnh thẻ: ' + await L.saveThumb(page, 'ghe-nong'));
  if (problems.length) console.error('lỗi trang:\n  ' + problems.join('\n  '));
  await br.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
