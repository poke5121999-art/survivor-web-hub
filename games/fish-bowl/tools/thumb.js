#!/usr/bin/env node
/*
 * Hub card image (assets/thumbnails/fish-bowl.png): the goldfish in its aquarium at the start of level 2, HUD hidden, cropped
 * 640x360 CSS px around the fish at scale 2 so it still reads at card size (~340 px).
 *   PLAYWRIGHT_PATH=<playwright module> node games/fish-bowl/tools/thumb.js [level, default 2] [wait ms, default 2500]
 */
'use strict';
const path = require('path');
const L = require(path.join(__dirname, '..', '..', '..', 'tools', 'thumb-lib.js'));

async function main() {
  const level = process.argv[2] || '2';
  const waitMs = +(process.argv[3] || 2500);
  const srv = await L.serve(), br = await L.browser();
  const { page, problems } = await L.openGame(br, srv.base, 'fish-bowl', `level=${level}&skip=1`, { width: 1280, height: 720, scale: 2 });
  await page.waitForFunction(() => window.__fb && window.__fb.texturesReady && window.__fb.state === 'playing', null, { timeout: 90000 });
  await page.evaluate(() => {
    for (const s of ['#ui', '#fx', 'a.hub']) { const e = document.querySelector(s); if (e) e.style.visibility = 'hidden'; }
  });
  await page.waitForTimeout(waitMs);
  const at = await page.evaluate(() => {
    const g = window.__fb.game, cam = g.stage.camera;
    const v = g.fish.root.getWorldPosition(cam.position.clone()).project(cam);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  });
  const w = 640, h = 360;
  const clip = { x: Math.max(0, Math.min(1280 - w, at.x - w / 2)), y: Math.max(0, Math.min(720 - h, at.y - h / 2)), width: w, height: h };
  console.log(JSON.stringify({ at, clip }));
  console.log('ảnh thẻ: ' + await L.saveThumb(page, 'fish-bowl', clip));
  if (problems.length) console.log(problems.join('\n'));
  await br.close(); srv.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
