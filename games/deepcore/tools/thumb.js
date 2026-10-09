#!/usr/bin/env node
/*
 * Ảnh thẻ hub (assets/thumbnails/deepcore.png): thợ mỏ đục vỉa pha lê xanh trong Hang Pha Lê, linh thú đi theo, quái lảng vảng.
 * Dùng:  node games/deepcore/tools/thumb.js [giây-tua-nhanh] [biome, mặc định crystal]   (mặc định 60; màn dọc 405x720, hạt giống cố định)
 */
'use strict';
const path = require('path');
const L = require(path.join(__dirname, '..', '..', '..', 'tools', 'thumb-lib.js'));

async function main() {
  const secs = parseFloat(process.argv[2] || '60');
  const biome = process.argv[3] || 'crystal';
  const srv = await L.serve(), br = await L.browser();
  const { page, problems } = await L.openGame(br, srv.base, 'deepcore', '', { width: 405, height: 720, scale: 2 });
  await page.waitForFunction(() => window.DC && DC.game && DC.game.state && DC.Screens, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(([secs, biome]) => {
    const G = DC, g = G.game, T = 16;
    Date.now = () => 1700000000000;
    g.startRun(biome, 1);
    g.hurtPlayer = () => 0; g.player.hurt = () => 0;
    g.readDir = function () {
      const p = g.player, w = g.world;
      let best = null, bd = 1e9;
      const tx = p.tileX(), ty = p.tileY();
      for (let y = ty - 8; y <= ty + 8; y++) for (let x = tx - 8; x <= tx + 8; x++) {
        if (!w.inside(x, y) || w.kind[w.idx(x, y)] !== G.TK.ORE) continue;
        const d = (x - tx) * (x - tx) + (y - ty) * (y - ty);
        if (d < bd) { bd = d; best = [x, y]; }
      }
      if (!best) return { x: 0, y: 0 };
      const dx = best[0] * T + 8 - p.x, dy = best[1] * T + 8 - p.y, m = Math.hypot(dx, dy) || 1;
      return { x: dx / m, y: dy / m };
    };
    for (let i = 0; i < secs * 60; i++) { if (g.state === 'levelup') g.state = 'play'; g.update(1 / 60); }
    return { state: g.state, enemies: g.enemies.length, pets: g.pets.length, t: g.dir.phase };
  }, [secs, biome]);
  await page.waitForTimeout(600);
  console.log(JSON.stringify(info));
  console.log('ảnh thẻ: ' + await L.saveThumb(page, 'deepcore', { x: 62, y: 210, width: 300, height: 240 }));
  if (problems.length) console.error('lỗi trang:\n  ' + problems.join('\n  '));
  await br.close(); srv.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
