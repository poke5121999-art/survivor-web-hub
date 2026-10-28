#!/usr/bin/env node
/*
 * Hub card image (assets/thumbnails/stickman-hook.png): the stickman swinging on its rope next to a bumper.
 *   PLAYWRIGHT_PATH=<playwright module> node games/stickman-hook/tools/thumb.js [level, default 2] [hold ms, default 350]
 */
'use strict';
const path = require('path');
const L = require(path.join(__dirname, '..', '..', '..', 'tools', 'thumb-lib.js'));

async function main() {
  const level = process.argv[2] || '2';
  const holdMs = +(process.argv[3] || 350);
  const srv = await L.serve(), br = await L.browser();
  const { page, problems } = await L.openGame(br, srv.base, 'stickman-hook', 'level=' + level, { width: 1280, height: 720, scale: 2 });
  await page.waitForFunction(() => window.__sh && window.__sh.game.phase === 'play', null, { timeout: 30000 });
  await page.evaluate(() => { document.getElementById('hint').style.display = 'none'; });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__sh.setHold(true));
  await page.waitForTimeout(holdMs);
  // crop 800x450 CSS px around the stickman and its target so it still reads at card size (~340 px)
  const at = await page.evaluate(() => {
    const { player: p, world, cam } = window.__sh, t = world.targets[p.hooked] || p;
    const k = innerHeight / (2 * cam.zoom);
    const sx = (x) => innerWidth / 2 + (x - cam.x) * k, sy = (y) => innerHeight / 2 - (y - cam.y) * k;
    return { hooked: p.hooked, cx: (sx(p.x) + sx(t.x)) / 2, cy: (sy(p.y) + sy(t.y)) / 2 + 40 };
  });
  const w = 800, h = 450;
  const clip = { x: Math.max(0, Math.min(1280 - w, at.cx - w / 2)), y: Math.max(0, Math.min(720 - h, at.cy - h / 2)), width: w, height: h };
  console.log(JSON.stringify({ ...at, clip }));
  console.log('ảnh thẻ: ' + await L.saveThumb(page, 'stickman-hook', clip));
  if (problems.length) console.log(problems.join('\n'));
  await br.close(); srv.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
