#!/usr/bin/env node
/* Mèo & Súp "equip" in a real browser (games/cats-soup, rules in D:/catsoup-ref/rules/equip.md): worn items show on the 3D
 * cat (hat on the head bone, glasses, cloth laid over the fur, a friend beside it, a balloon above), the fitting room opens
 * for a cat, a tap tries an item on the dummy and Apply wears it, reward 5 shows the drawn cards, the worn items survive a
 * reload, and no page errors.
 *   node test/cats-soup-equip-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-equip-play.js
 * Query flags used: ?fresh (ignore the save), ?zoom=1.7 (close camera), ?demo=N, ?speed=k. Screenshots: shots/cats-soup-equip-play/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-equip-play');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, s) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, b) => {
        if (e) { s.writeHead(404); s.end(); return; }
        s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        s.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = process.env.CS_URL ? null : await serve();
  const url = process.env.CS_URL || `http://localhost:${srv.address().port}/games/cats-soup/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 450, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const wait = ms => page.waitForTimeout(ms);
  // Frame the first cat's object close up ("?zoom=1.7" is the page's own close camera; this goes closer on the cat).
  const frame = () => page.evaluate(() => {
    const e = window.__equip, c = window.__game.state.cats[0], o = e.ctx.view.cats.get(c.id).obj;
    e.ctx.camera.target.set(o.position.x, 0.3, o.position.z);
    e.ctx.camera.size = 0.7;
    e.ctx.camera.update();
  });

  await page.goto(`${url}?fresh&zoom=1.7`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  check('equip view mounted (window.__equip, 6 worn slots in state)', await page.evaluate(() => !!window.__equip && Array.isArray(window.__game.state.equip.items)));

  // ---- hat on the head, glasses, cloth, friend, balloon ----
  const set = await page.evaluate(async () => {
    const g = window.__game, F = g.feat.equip, c = g.state.cats[0];
    for (const i of [102, 1, 201, 222, 301]) F.grant(g, i);
    const w = [102, 1, 201, 301].map(i => F.wear(g, c.id, i).ok);
    w.push(F.wear(g, c.id, 222, { slot: 1 }).ok);
    await new Promise(r => setTimeout(r, 4000));
    return { w, worn: F.worn(g, c.id) };
  });
  check('wear: hat 102, cloth 1, glasses 201, balloon 222, friend 301 all accepted', set.w.every(Boolean), JSON.stringify(set));
  const geo = await page.evaluate(() => {
    const e = window.__equip, c = window.__game.state.cats[0], ent = e.ctx.view.cats.get(c.id);
    const head = ent.obj.getObjectByName('Bip001 Head');
    const V = ent.obj.position.constructor;
    const wp = o => o.getWorldPosition(new V()).toArray();
    const hat = head.children.find(o => o.name === 'head2');
    const glasses = head.children.find(o => o.name === 'acce1');
    const balloon = ent.obj.children.find(o => o.name === 'acce22');
    const pet = ent.obj.children.find(o => o.name === 'pet1');
    const hd = wp(head);
    const dist = o => Math.hypot(...wp(o).map((v, k) => v - hd[k]));
    const body = [];
    ent.obj.traverse(o => { const u = o.isSkinnedMesh && o.material.uniforms; if (u && u.map && u.fragMode && u.fragMode.value === 0) body.push(u.map.value.isCanvasTexture); });
    return { sig: ent.eqSig, objs: ent.eqObjs.length, hat: !!hat && dist(hat), glasses: !!glasses && dist(glasses), balloon: !!balloon, pet: !!pet, cloth: body };
  });
  check('worn signature and 4 item objects on the cat', geo.sig === '102,1,201,222,301,0' && geo.objs === 4, JSON.stringify(geo));
  check('the hat object is a child of "Bip001 Head", at the head (< 0.05)', geo.hat !== false && geo.hat < 0.05, `${geo.hat}`);
  check('the glasses are a child of "Bip001 Head" at the head', geo.glasses !== false && geo.glasses < 0.05, `${geo.glasses}`);
  check('balloon floats on the cat and the friend stands beside it', geo.balloon && geo.pet);
  check('cloth: the body texture is the fur with the outfit laid over it (canvas)', geo.cloth.some(Boolean), JSON.stringify(geo.cloth));
  await frame();
  await wait(800);
  await shot('01-worn-closeup');

  // ---- fitting room ----
  await page.evaluate(() => window.__equip.openFor(window.__game.state.cats[0]));
  await wait(2500);
  await shot('02-fitting-room');
  const room = await page.evaluate(() => ({
    cells: document.querySelectorAll('.eq-grid .cell').length, slots: document.querySelectorAll('.eq-slots .slot').length,
    on: document.querySelectorAll('.eq-slots .slot.on').length, tabs: [...document.querySelectorAll('.eq-filters .f')].map(x => x.textContent),
    title: document.querySelector('.eq-top .ttl').textContent,
  }));
  check('fitting room: title "Phòng Thử", 6 slots, 5 of them filled, 10 filter tabs, a page of cells', room.title === 'Phòng Thử' && room.slots === 6 && room.on === 5 && room.tabs.length === 10 && room.cells === 40, JSON.stringify(room));
  // try an unowned hat on: the dummy changes, the real cat does not
  await page.locator('.eq-filters .f').nth(1).click();
  await wait(500);
  const tryOn = await page.evaluate(async () => {
    const g = window.__game, F = g.feat.equip, c = g.state.cats[0];
    const cell = [...document.querySelectorAll('.eq-grid .cell.off')].find(x => g.t.Equip.find(e => e.index === +x.dataset.i).type === 0);
    if (!cell) return null;
    const i = +cell.dataset.i;
    cell.click();
    await new Promise(r => setTimeout(r, 1500));
    return { i, preview: [...document.querySelectorAll('.eq-slots .slot.on')].length, worn: F.worn(g, c.id).join(','), info: document.querySelector('.eq-info .nm').textContent };
  });
  check('tapping an unowned hat tries it on (preview), the cat keeps its real outfit', tryOn && tryOn.worn === '102,1,201,222,301,0' && tryOn.info.length > 0, JSON.stringify(tryOn));
  await shot('03-try-on');
  await page.locator('.eq-btns .btn.blue').click();
  await wait(500);
  const after = await page.evaluate(() => window.__game.feat.equip.worn(window.__game, window.__game.state.cats[0].id).join(','));
  check('Apply leaves out the unowned hat (cat keeps the old hat)', after === '102,1,201,222,301,0', after);
  // own a second hat, try it, apply
  await page.evaluate(() => { window.__game.feat.equip.grant(window.__game, 103); });
  await page.evaluate(() => { const c = window.__game.state.cats[0]; window.__equip.close(); window.__equip.openFor(c); });
  await wait(800);
  await page.evaluate(() => document.querySelector('.eq-grid .cell[data-i="103"]').click());
  await page.locator('.eq-btns .btn.blue').click();
  await wait(2500);
  const hat2 = await page.evaluate(() => {
    const g = window.__game, ent = window.__equip.ctx.view.cats.get(g.state.cats[0].id);
    return { worn: g.feat.equip.worn(g, g.state.cats[0].id)[0], onHead: !!ent.obj.getObjectByName('Bip001 Head').children.find(o => o.name === 'head3') };
  });
  check('Apply wears the owned hat 103 and it appears on the head bone', hat2.worn === 103 && hat2.onHead, JSON.stringify(hat2));
  // inventory tab lists the owned cards with level
  await page.locator('.eq-tabs .tab').nth(1).click();
  await wait(300);
  const inv = await page.evaluate(() => [...document.querySelectorAll('.eq-grid .cell')].map(c => c.querySelector('.lv') && c.querySelector('.lv').textContent));
  check('inventory tab lists owned cards with a level', inv.length >= 6 && inv.every(x => /^Lv\.\d+$/.test(x)), JSON.stringify(inv.slice(0, 8)));
  await shot('04-inventory');
  await page.locator('.eq-top .x').click();
  await wait(300);
  check('closing the room removes it and gives the camera back', await page.evaluate(() => !document.querySelector('.eq-room') && window.__equip.ctx.camera.size === 0.7));

  // ---- reward type 5 shows the drawn cards ----
  const drawn = await page.evaluate(async () => {
    const g = window.__game;
    const out = g.reward(5, 3, { from: 'chest' });
    await new Promise(r => setTimeout(r, 400));
    return { n: out.items.length, rows: document.querySelectorAll('.eq-pop .row').length };
  });
  check('reward 5 x3 opens the drawn-cards popup with 3 rows', drawn.n === 3 && drawn.rows === 3, JSON.stringify(drawn));
  await shot('05-drawn');
  await page.locator('.eq-pop .btn').click();

  // ---- the worn items survive a reload ----
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await page.waitForFunction(() => { const g = window.__game; const e = window.__equip.ctx.view.cats.get(g.state.cats[0].id); return e && e.eqObjs && e.eqObjs.length === 4; }, null, { timeout: 30000 }).catch(() => {});
  const back = await page.evaluate(() => {
    const g = window.__game, ent = window.__equip.ctx.view.cats.get(g.state.cats[0].id);
    return { worn: g.feat.equip.worn(g, g.state.cats[0].id).join(','), owned: g.feat.equip.ownedList(g).length, sig: ent.eqSig, objs: ent.eqObjs.length };
  });
  check('reload keeps the worn slots and dresses the cat again', back.worn === '103,1,201,222,301,0' && back.sig === back.worn && back.objs === 4 && back.owned >= 6, JSON.stringify(back));
  await frame();
  await wait(600);
  await shot('06-after-reload');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
