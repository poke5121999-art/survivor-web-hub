// Review screenshots for polish work: menus, a fight in first and third person, an explosion, a boss,
// the upgrade pick, the death screen, and the phone layout.
// Usage: PLAYWRIGHT_PATH=<playwright-core> [ONLY=title,fight] node games/blockade-z/tools/review.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || 'playwright-core';
const OUT = process.argv[2] || '.chk-polish/review'; fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);

const BOT = `(() => { const G = __G; const P = G.player; let t = null; let best = 1e9;
  for (const z of G.zombies.list) { if (!z.alive) continue; const d = Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z); if (d < best) { best = d; t = z; } }
  P.input.fire = false;
  if (t) { const dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z, dy = t.pos.y + 1.2 * t.T.scale - (P.pos.y + 1.6); P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); P.input.fire = true; }
})()`;

(async () => {
  const srv = await serve();
  const base = (process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?';
  const br = await require(PW).chromium.launch({ channel: process.env.BZ_CHANNEL || 'chrome', headless: true, args: ['--ignore-gpu-blocklist'] });
  const problems = [];
  async function open(query, mobile) {
    const ctx = await br.newContext(mobile ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'review@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(query + ' pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(query + ' console: ' + m.text().slice(0, 200)); });
    await page.goto(base + query + '&noaudio=1');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    return { page, ctx };
  }
  const shot = async (page, name, wait = 350) => { await page.waitForTimeout(wait); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('shot ' + name); };
  // run the fight for a while with the bot aiming, then leave the scene mid-action
  const fight = async (page, secs) => { for (let i = 0; i < secs * 10; i++) { await page.evaluate(BOT); await page.evaluate('__sim(0.1)'); } };
  try {
    for (const mob of process.env.MOB === '1' ? [true] : process.env.MOB === '0' ? [false] : [false, true]) {
      const m = mob ? 'm-' : '';
      if (want('title')) { const { page, ctx } = await open('meta=1&seed=3', mob); await shot(page, m + 'title', 900); await ctx.close(); }
      if (want('select')) { const { page, ctx } = await open('select=1&seed=3', mob); await page.evaluate('__sim(1.2)'); await shot(page, m + 'select', 900); await ctx.close(); }
      if (want('fight')) {
        for (const [tag, q] of [['fp', 'fp=1&hero=mua'], ['tp', 'tp=1&hero=gio'], ['night', 'fp=1&hero=phao&tod=0&weather=storm']]) {
          if (mob && tag !== 'fp') continue;
          const { page, ctx } = await open(q + '&autostart=1&nolock=1&god=1&seed=5&wave=6', mob);
          await page.evaluate("__setShot('plaza')"); await fight(page, 14); await shot(page, m + 'fight-' + tag + '-a', 120);
          await fight(page, 3); await shot(page, m + 'fight-' + tag + '-b', 120);
          await ctx.close();
        }
      }
      if (want('boom') && !mob) {
        const { page, ctx } = await open('fp=1&autostart=1&nolock=1&god=1&seed=5&tod=0.5', mob);
        await page.evaluate(`(() => { const G = __G; __setShot('plaza'); G.wave.toSpawn = 0; G.zombies.clear(); __sim(0.2); G.fx.explosion(new G.THREE.Vector3(0, 0.4, -1), 1); __sim(0.08); })()`);
        await shot(page, 'boom-1', 60);
        await page.evaluate('__sim(0.3)'); await shot(page, 'boom-2', 60);
        await page.evaluate('__sim(0.9)'); await shot(page, 'boom-3', 60);
        await ctx.close();
      }
      if (want('boss') && !mob) {
        for (const b of ['giant', 'dragon']) {
          const { page, ctx } = await open('fp=1&autostart=1&nolock=1&god=1&seed=5&hero=mua&boss=' + b, mob);
          await page.evaluate("__setShot('plaza')"); await fight(page, 9); await shot(page, 'boss-' + b + '-a', 120);
          await fight(page, 5); await shot(page, 'boss-' + b + '-b', 120);
          await ctx.close();
        }
      }
      if (want('pick')) {
        const { page, ctx } = await open('fp=1&autostart=1&nolock=1&god=1&seed=5', mob);
        await page.evaluate(`(() => { const G = __G; __sim(4); for (const z of [...G.zombies.list]) if (z.alive) G.zombies.damage(z, 99999, 'body', {}); G.wave.toSpawn = 0; G.wave.killed = G.wave.total; __sim(0.3); })()`);
        await shot(page, m + 'pick', 900);
        await ctx.close();
      }
      if (want('dead')) {
        const { page, ctx } = await open('fp=1&autostart=1&nolock=1&seed=5&wave=3', mob);
        await page.evaluate("__setShot('plaza')"); await fight(page, 6);
        await page.evaluate(`(() => { const G = __G; G.kills = 37; G.score = 5240; G.player.hurt(9999, G.player.pos.clone().setZ(G.player.pos.z - 2)); })()`);
        await page.waitForTimeout(1200); await shot(page, m + 'dead', 600);
        await ctx.close();
      }
      if (want('pause') && !mob) {
        const { page, ctx } = await open('fp=1&autostart=1&nolock=1&god=1&seed=5', mob);
        await page.evaluate("__setShot('plaza'); __sim(3)"); await page.keyboard.press('KeyP'); await shot(page, 'pause', 500);
        await ctx.close();
      }
    }
  } finally { await br.close(); srv.close(); }
  for (const p of problems) console.log('PROBLEM ' + p);
  console.log(problems.length ? 'PROBLEMS ' + problems.length : 'REVIEW DONE');
})().catch((e) => { console.error(e); process.exit(2); });
