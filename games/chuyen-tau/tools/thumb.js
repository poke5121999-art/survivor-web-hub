#!/usr/bin/env node
/*
 * Ảnh thẻ hub (assets/thumbnails/chuyen-tau.png): đoàn tàu đang chạy, người chơi trên nóc toa bắn quái leo lên tàu.
 * Dùng:  node games/chuyen-tau/tools/thumb.js [giây-tua-nhanh]   (mặc định 77.5; chụp ở 1280x720)
 */
'use strict';
const path = require('path');
const L = require(path.join(__dirname, '..', '..', '..', 'tools', 'thumb-lib.js'));

async function main() {
  const secs = parseFloat(process.argv[2] || '77.5');
  const srv = await L.serve(), br = await L.browser();
  const { page, problems } = await L.openGame(br, srv.base, 'chuyen-tau');
  await page.waitForFunction(() => window.CT && CT.UI && CT.UI.startRun && CT.MAPS, null, { timeout: 60000 });
  const info = await page.evaluate((secs) => {
    Math.random = (function () { let s = 12345; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    CT.UI.startRun(CT.MAPS[0].id);
    const G = CT.GAME;
    for (let i = 0; i < secs * 60; i++) { G.IN.fire = i > 45 * 60; G.R().p.hp = G.R().p.hpMax; G.R().p.iframe = 0; G.step(1 / 60); }
    const R = G.R();
    R.msg = ''; R.msgT = 0;
    return { map: R.map.id, night: R.isNight, foes: R.foes.length, phase: R.phase, t: R.t };
  }, secs);
  await page.waitForTimeout(800);
  console.log(JSON.stringify(info));
  console.log('ảnh thẻ: ' + await L.saveThumb(page, 'chuyen-tau'));
  if (problems.length) console.error('lỗi trang:\n  ' + problems.join('\n  '));
  await br.close(); srv.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
