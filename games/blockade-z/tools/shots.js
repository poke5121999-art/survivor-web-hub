// Close-up screenshots for art review: the three zombie types and each gun.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/shots.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'shots@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(srv.base + '/games/blockade-z/index.html?autostart=1&nolock=1&seed=3&noaudio=1');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    await page.evaluate(`(() => { const G = __G; G.wave.toSpawn = 0; G.wave.total = 99; G.zombies.clear(); __setShot('plaza');
      const P = G.player; P.pos.set(0, 0, 8); P.yaw = 0; P.pitch = -0.05;
      const types = ['walker', 'runner', 'brute']; const xs = [-1.8, 0, 2.2];
      types.forEach((t, i) => { const z = G.zombies.spawn(t, 1, { x: xs[i], z: 4.2, dir: [0, -1], name: 't' }); z.pos.set(xs[i], 0, 4.2); z.yaw = 0; z.speed = 0; });
      __sim(0.4); })()`);
    await page.evaluate(`(() => { for (const z of __G.zombies.list) if (z.alive) { z.speed = 0; z.vel.set(0,0,0); } })()`);
    await page.evaluate("document.getElementById('banner').classList.remove('on')");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'zombies.png') });
    for (const id of ['pistol', 'shotgun', 'smg', 'rifle']) {
      await page.evaluate(`(() => { const G = __G; G.zombies.clear(); G.weapons.give('${id}'); __sim(0.7); })()`);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, 'gun-' + id + '.png'), clip: { x: 560, y: 300, width: 720, height: 420 } });
    }
    await page.evaluate(`(() => { __G.state = 'title'; __G.ui.show('title'); })()`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'title.png') });
    const mctx = await br.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await mctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'shots@test' })); } catch (e) {} });
    const mp = await mctx.newPage();
    await mp.goto(srv.base + '/games/blockade-z/index.html?autostart=1&seed=3&noaudio=1');
    await mp.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    await mp.evaluate("__setShot('plaza'); __sim(3)");
    await mp.waitForTimeout(500);
    await mp.screenshot({ path: path.join(OUT, 'mobile.png') });
  } finally { await br.close(); srv.close(); }
})().catch((e) => { console.error(e); process.exit(2); });
