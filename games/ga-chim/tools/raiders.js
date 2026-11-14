// Captures each viewmodel hold: hip, ads, sprint, tactical sprint, wall, reload phases, inspect, melee.
'use strict';
const path = require('path'); const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const srv = await serve();
  const br = await require(PW).chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'poses@test' })); } catch (e) {} });
  const page = await ctx.newPage(); const logs = [];
  page.on('pageerror', (e) => logs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  await page.goto(srv.base + '/games/ga-chim/index.html?nolock=1&noaudio=1');
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 120000 });
  const shot = async (name, js, sec) => { await page.evaluate(`(() => { window.__paused = true; ${js}; __sim(${sec}); })()`); await page.screenshot({ path: path.join(OUT, name + '.jpg'), quality: 85 }); };
  await shot('r1-idle', `__setShot({ p: [-10.4, 1.7, 14], look: [-10.4, 1.2, 8] }); const G=__G; window.__r = [0,1,2].map(i => { const e = G.enemies.spawn('raider', new (G.camera.position.constructor)(-12 + i * 1.6, 0, 8.5)); e.yaw = 0.2*i; return e; })`, 0.5);
  await shot('r2-run', `const G=__G; __r.forEach((e,i)=>{ e.state='hunt'; e.alert=1; e.cd=99; e.los=false; })`, 0.6);
  await shot('r3-aim', `const G=__G; __r.forEach((e,i)=>{ e.pos.set(-12 + i*2.4, 0, 2); e.los=true; e.cd=0; })`, 0.9);
  await shot('r4-dead', `const G=__G; __r.forEach((e,i)=>G.enemies.kill(e, new (G.camera.position.constructor)(0,0,-1)))`, 0.9);
  if (logs.length) console.log(logs.slice(0, 10).join('\n'));
  await br.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
