// Scripted play-through: start the mission, walk, shoot an enemy, capture frames, report errors.
'use strict';
const path = require('path'); const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const srv = await serve();
  const br = await require(PW).chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'play@test' })); } catch (e) {} });
  const page = await ctx.newPage(); const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(srv.base + '/games/ga-chim/index.html?nolock=1&q=medium');
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '0-title.jpg'), quality: 85 });
  await page.click('#btnStart');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '1-start.jpg'), quality: 85 });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW');
  await page.screenshot({ path: path.join(OUT, '2-walk.jpg'), quality: 85 });
  // put a crawler in front and shoot it
  await page.evaluate(`(() => { const G = __G; const P = G.player; const e = G.enemies.spawn('crawler', P.pos.clone().add(new (P.pos.constructor)(Math.sin(P.yaw)*-9, 0, Math.cos(P.yaw)*-9))); e.state='idle'; e.alert=0; window.__tgt = e; })()`);
  await page.evaluate(`(() => { const G=__G, P=G.player; const e2 = G.enemies.spawn('drone', P.pos.clone().add(new (P.pos.constructor)(Math.sin(P.yaw)*-6+2, 0, Math.cos(P.yaw)*-6))); e2.pos.y = 3.2; e2.state='idle'; e2.speed=0; e2.home=e2.pos.clone(); __tgt.pos.copy(P.pos).add(new (P.pos.constructor)(Math.sin(P.yaw)*-4.5, 0, Math.cos(P.yaw)*-4.5)); })()`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, '3-enemy.jpg'), quality: 85 });
  await page.evaluate(`(() => { const G=__G, P=G.player, e=__tgt; const d=e.pos.clone().setY(0.6).sub(G.camera.position); P.yaw=Math.atan2(-d.x,-d.z); P.pitch=Math.atan2(d.y, Math.hypot(d.x,d.z)); })()`);
  await page.mouse.down({ button: 'right' }); await page.waitForTimeout(400);
  await page.mouse.down(); await page.waitForTimeout(90); await page.screenshot({ path: path.join(OUT, '4-fire.jpg'), quality: 85 });
  await page.waitForTimeout(500); await page.mouse.up(); await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '5-after.jpg'), quality: 85 });
  const st = await page.evaluate(`(() => ({ hp: __tgt.hp, alive: __tgt.alive, ammo: __G.weapon.ammo, kills: __G.enemies.kills, state: __G.game.state, errors: __G.errors, audio: __G.audio.ready }))()`);
  console.log(JSON.stringify(st));
  // walk to cabinet A and restore it
  await page.evaluate(`(() => { const G=__G; const o=G.game.objectives.find(o=>o.id==='A'); G.player.pos.copy(o.pos).add(new (o.pos.constructor)(1.5,0,0)); G.enemies.list.forEach(e=>{ if(e.alive) G.enemies.kill(e, new (o.pos.constructor)(0,0,1)); }); })()`);
  await page.keyboard.down('KeyE'); await page.waitForTimeout(4500); await page.keyboard.up('KeyE');
  await page.screenshot({ path: path.join(OUT, '6-restored.jpg'), quality: 85 });
  console.log(JSON.stringify(await page.evaluate(`(() => ({ done: __G.game.objectives.map(o=>o.done), enemies: __G.enemies.alive, msg: document.getElementById('msg').textContent }))()`)));
  if (logs.length) console.log(logs.slice(0, 20).join('\n'));
  await br.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
