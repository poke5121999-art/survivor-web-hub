// Close-up of every kind of flying projectile frozen mid-air, for art review: acid, web, thrown rock, rocket,
// a skill lob, and gun tracers. Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/projshots.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.proj-blockade-z'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'proj@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?autostart=1&nolock=1&seed=3&noaudio=1&tod=' + (process.env.TOD || '0.45') + '&weather=clear');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    await page.evaluate(`(() => { const G = __G; const T = G.THREE; G.god = true; G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear();
      const P = G.player; P.pos.set(0, 0, 10); P.yaw = 0; P.pitch = 0.05; P.vel.set(0, 0, 0);
      const K = G.zombies.kinds; const V = (x, y, z) => new T.Vector3(x, y, z);
      const ka = K.projs; void ka;
      // acid and web from the left, a rock from the right, a rocket and a skill lob across the middle
      G.events.emit('zk', null);
      const acid = { t: 'proj', kind: 'acid', p: [-6, 3, -2], v: [9, 2, 2] }; const web = { t: 'proj', kind: 'web', p: [-5, 1.5, 2], v: [7, 3, 1] };
      K.remote(acid); K.remote(web);
      G.gear.throwRock(V(7, 4, -4), V(0, 1, 8), null);
      G.gear.fireRocket(V(-3, 1.6, 4), V(1, 0.05, -0.6).normalize());
      __sim(0.25);
      for (let i = 0; i < 4; i++) G.fx.tracer(V(2 + i * 0.3, 1.4, 6), V(-8 + i * 2, 1.2, -18));
      __sim(1 / 60); G.state = 'paused'; })()`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'projectiles.png') });
    console.log(errs.length ? 'errors: ' + errs.join(' | ') : 'ok');
  } finally { await br.close(); srv.close(); }
})().catch((e) => { console.error(e); process.exit(2); });
