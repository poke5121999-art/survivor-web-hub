#!/usr/bin/env node
/* Move mode of games/cats-soup in a real browser: long-press opens it, a mouse drag moves a facility to an empty cell,
 * a drag onto another facility swaps them, storage in and out, keep all, forest resize, undo.
 *   node test/cats-soup-move.js            (local server)      CS_URL=<page url> node test/cats-soup-move.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots', 'cats-soup-move');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg' };
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
  fs.mkdirSync(OUT, { recursive: true });
  const srv = process.env.CS_URL ? null : await serve();
  const url = process.env.CS_URL || `http://localhost:${srv.address().port}/games/cats-soup/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${url}?demo=8&zoom=4`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  // Screen pixel of a facility (by work id) or of a field cell.
  const screenOf = (id, cell) => page.evaluate(([id, cell]) => {
    const m = window.__move;
    const w = id != null ? m.game.state.works.find(o => o.id === id) : null;
    const v = m.mark.position.clone().set((w ? w.pos[0] : cell[0]) * 1.5, 0, -(w ? w.pos[1] : cell[1]) * 1.5);
    v.project(m.camera.cam);
    const r = m.camera.canvas.getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  }, [id, cell]);
  const layout = () => page.evaluate(() => window.__game.layout());

  const works = (await layout()).works;
  const [aId] = works[1];
  let [x, y] = await screenOf(aId);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await page.waitForTimeout(800);
  check('long-press on a facility opens move mode', await page.evaluate(() => window.__move.on && !!document.querySelector('.movemode')));
  await page.screenshot({ path: path.join(OUT, '01-open.png') });

  const empty = await page.evaluate(() => window.__game.emptyCells()[0]);
  const before = await layout();
  [x, y] = await screenOf(aId);
  const [tx, ty] = await screenOf(null, empty);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + (tx - x) * i / 10, y + (ty - y) * i / 10);
  await page.mouse.up();
  await page.waitForTimeout(300);
  let pos = await page.evaluate(id => window.__game.state.works.find(w => w.id === id).pos, aId);
  check('dragging a facility onto an empty cell moves it there', pos[0] === empty[0] && pos[1] === empty[1], `${pos} -> ${empty}`);

  const [bId, bPos] = before.works[2];
  [x, y] = await screenOf(aId);
  const [sx, sy] = await screenOf(bId);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + (sx - x) * i / 10, y + (sy - y) * i / 10);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await page.evaluate(([a, b]) => [a, b].map(id => window.__game.state.works.find(w => w.id === id).pos), [aId, bId]);
  check('dropping onto another facility swaps them', after[0].join() === bPos.join() && after[1].join() === empty.join(), JSON.stringify(after));
  await page.screenshot({ path: path.join(OUT, '02-swapped.png') });

  const kept = await page.evaluate(id => { const g = window.__game; g.keepWork(g.state.works.find(w => w.id === id)); return [g.state.works.length, g.state.storage.length]; }, bId);
  check('keep sends a facility to storage', kept[1] === 1, JSON.stringify(kept));
  await page.evaluate(() => window.__move.openStorage());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '03-storage.png') });
  await page.click('.panel .row .price');
  await page.waitForTimeout(300);
  check('taking it out of storage puts it back on the field', await page.evaluate(() => window.__game.state.storage.length === 0));
  await page.evaluate(() => window.__hud.close());
  await page.click('.movemode [data-n="bt_keep_all"] .w:visible');
  await page.waitForTimeout(300);
  check('keep all empties the field', await page.evaluate(() => window.__game.state.works.length === 0 && window.__game.state.storage.length === 8));
  await page.click('.movemode [data-n="bt_revert"] .w:visible');
  await page.waitForTimeout(300);
  check('undo brings the field back', await page.evaluate(() => window.__game.state.works.length === 8 && window.__game.state.storage.length === 0));
  const size = await page.evaluate(() => { const g = window.__game; const s0 = g.state.mapSize; const ok = g.setMapSize(0); return [s0, ok, g.state.mapSize, g.state.works.length + g.state.storage.length, g.state.works.length <= g.field().length]; });
  check('shrinking the forest stores what no longer fits', size[1] && size[2] === 0 && size[3] === 8 && size[4], JSON.stringify(size));
  await page.evaluate(() => window.__move.openSize());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '04-size.png') });
  await page.evaluate(() => window.__hud.close());
  await page.click('.movemode [data-n="bt_close"] .w:visible');
  await page.waitForTimeout(300);
  check('back leaves move mode and shows the HUD', await page.evaluate(() => !window.__move.on && !document.querySelector('.movemode')));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: path.join(OUT, '05-closed.png') });
  await browser.close();
  if (srv) srv.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
