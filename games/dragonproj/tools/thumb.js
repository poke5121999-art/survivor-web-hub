#!/usr/bin/env node
/*
 * Chụp ảnh thẻ hub (assets/thumbnails/dragonproj.png) từ ải đầu của Săn Rồng, bot đang đánh Behemoth ở chặng boss.
 * Màn dọc 540x960 (viewport 720x1280), cắt khung 16:9 quanh người chơi và boss; Math.random được gieo cố định để chạy lại ra cùng cảnh.
 * Dùng:  node games/dragonproj/tools/thumb.js [giây-chờ]
 */
'use strict';
const path = require('path');
const T = require(path.join(__dirname, '..', '..', '..', 'tools', 'thumb-lib.js'));

async function main() {
  const wait = +(process.argv[2] || 14);
  const srv = await T.serve(), br = await T.browser();
  const { page, ctx, problems } = await T.openGame(br, srv.base, 'dragonproj', '', { width: 720, height: 1280 });
  ctx.setDefaultTimeout(150000);
  await page.waitForFunction(() => window.DP && window.DP.UI && window.DP.UI.save, null, { timeout: 30000 });
  await page.evaluate(() => {
    let a = 20261009;
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const D = window.DP;
    D.tutSkip(D.UI.save); D.UI.saveNow();
    D.UI.startStage(D.STAGES[0].id);
    D.UI.battle.startBossPhase();
    D.UI.battle.boss.y = D.UI.battle.player.y - 170;
    window.DPBot.on();
  });
  await page.waitForTimeout(wait * 1000);
  const y = await page.evaluate(() => {
    const b = window.DP.UI.battle, k = 720 / 540, sy = (w) => (w - b.camY) * b.camZ * k;
    const mid = (sy(b.boss.y) + sy(b.player.y)) / 2;
    return Math.round(Math.max(0, Math.min(1280 - 405, mid - 250)));
  });
  console.log('ảnh thẻ: ' + await T.saveThumb(page, 'dragonproj', { x: 0, y, width: 720, height: 405 }));
  const errs = await page.evaluate(() => window.__errs || []);
  problems.push(...errs);
  if (problems.length) { console.error('lỗi trang:\n  ' + problems.join('\n  ')); process.exitCode = 1; }
  await br.close(); srv.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
