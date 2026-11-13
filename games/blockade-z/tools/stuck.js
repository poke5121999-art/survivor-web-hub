// Where do zombies get stuck? Runs several waves with an invulnerable player standing at different spots,
// and records every zombie that wanted to move but stayed within half a metre for 3 seconds.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/stuck.js [outDir]
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.stuck-blockade-z'); fs.mkdirSync(OUT, { recursive: true });
const SPOTS = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [[0, 0, 5], [-17, 6.85, -21], [20, 0, 20], [-24, 0, 1], [8, 0, -14]];

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  let total = 0;
  try {
    const ctx = await br.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'stuck@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?autostart=1&nolock=1&seed=11&noaudio=1&god=1&q=low');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const res = [];
    for (const [x, y, z] of SPOTS) {
      const r = await page.evaluate(`(() => { const G = __G; G.zombies.clear(); G.startWave(6); G.wave.bossAt = -1; const P = G.player; P.pos.set(${x}, ${y}, ${z}); P.vel.set(0, 0, 0);
        const track = new Map(); const stuck = []; const seen = new Set();
        for (let t = 0; t < 90; t += 0.25) {
          __sim(0.25); P.pos.set(${x}, ${y}, ${z}); P.vel.set(0, 0, 0); P.hp = P.maxHp;
          if (G.state === 'pick') G.pickChoose(G.pickOpts[0]);
          for (const q of G.zombies.list) {
            if (!q.alive) { track.delete(q); continue; }
            const d = Math.hypot(q.pos.x - P.pos.x, q.pos.z - P.pos.z);
            if (q.T.fly || q.hold || q.T.kind === 'egg' || d < 3.5) { track.delete(q); continue; }
            const k = track.get(q);
            if (!k || Math.hypot(q.pos.x - k.x, q.pos.z - k.z) > 0.5) { track.set(q, { x: q.pos.x, z: q.pos.z, t }); continue; }
            if (t - k.t >= 3 && !seen.has(q)) { seen.add(q); stuck.push({ type: q.type, x: +q.pos.x.toFixed(1), y: +q.pos.y.toFixed(1), z: +q.pos.z.toFixed(1), d: +d.toFixed(1), climb: !!q.climb, wallT: +(q.wallT || 0).toFixed(1), crawl: q.crawl, frozen: q.frozen > 0 }); }
          }
        }
        return { spot: [${x}, ${y}, ${z}], stuck, kills: G.wave.killed, regated: G.zombies.stats.regated }; })()`);
      res.push(r); total += r.stuck.length;
      console.log(JSON.stringify(r.spot), "stuck", r.stuck.length, "regated", r.regated, "kills", r.kills, JSON.stringify(r.stuck.slice(0, 12)));
    }
    fs.writeFileSync(path.join(OUT, 'stuck.json'), JSON.stringify(res, null, 1));
  } finally { await br.close(); srv.close(); }
  console.log('TOTAL stuck', total);
})().catch((e) => { console.error(e); process.exit(2); });
