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
  await shot('a-hip', `__setShot('gun')`, 1.0);
  await shot('b-ads', `__setShot('gunads')`, 1.0);
  await shot('c-sprint', `__setShot('gun'); __G.player.keys.add('KeyW'); __G.player.keys.add('ShiftLeft')`, 0.6);
  await shot('d-tac', ``, 1.2);
  await shot('e-wall', `__G.player.keys.clear(); __setShot('wall')`, 1.0);
  await shot('f-reload1', `__setShot('gun'); __G.weapon.ammo = 10; __G.weapon.startReload()`, 0.45);
  await shot('g-reload2', ``, 0.5);
  await shot('h-reload3', ``, 0.45);
  await shot('i-inspect', `__G.weapon.startInspect()`, 1.4);
  await shot('j-melee', `__sim(2); __G.weapon.startMelee()`, 0.18);
  if (logs.length) console.log(logs.slice(0, 10).join('\n'));
  await br.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
