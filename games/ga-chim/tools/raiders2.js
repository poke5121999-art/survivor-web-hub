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
  await shot('c1', `__setShot({ p: [-10.4, 1.5, 12], look: [-10.4, 1.1, 8] }); const G=__G; G.weapon.holder.visible=false; window.__r = [0,1,2].map(i => { const e = G.enemies.spawn('raider', new (G.camera.position.constructor)(-11.6 + i * 1.2, 0, 9.0 - i*0.3)); e.yaw = [Math.PI - 0.4, Math.PI, Math.PI + 0.9][i]; return e; }); __r[2].vel.set(-2.5,0,1.0); __r[1].aimK=1;`, 0.05);
  await shot('c2', `__r.forEach(e=>{e.speed=0;}); __r[0].state='hunt'; __r[0].alert=1; __r[0].los=true; __r[0].cd=0; __r[0].atk=1.0; __r[0].shots=0; __r[1].vel.set(0,0,3.5); __r[1].speed=3.5`, 0.35);
  if (logs.length) console.log(logs.slice(0, 10).join('\n'));
  await br.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
