import { serve, launch } from './pw.mjs';
const srv = serve(8767, 150000); const b = await launch(); const errs = [];
const run = async (name, url, w, h, act) => {
  const pg = await b.newPage({ viewport: { width: w, height: h } });
  pg.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(name + ': ' + m.text()); });
  pg.on('pageerror', (e) => errs.push(name + ' PAGEERR ' + e.message));
  await pg.goto('http://localhost:8767/' + url); await pg.waitForFunction('window.__ready', null, { timeout: 60000 });
  if (act) await act(pg);
  await pg.waitForTimeout(600); await pg.screenshot({ path: `shots/${name}.png` });
  errs.push(...(await pg.evaluate('window.__errors')).map((e) => name + ' ' + e)); await pg.close();
};
await run('desktop-sheet1', 'index.html', 1500, 900);
await run('desktop-sheet2', 'index.html', 1500, 900, async (pg) => { await pg.click('[data-sheet="2"]'); });
await run('inspect-gun', 'index.html#shotgun-pump-tape', 1000, 1000, async (pg) => { await pg.click('#variant'); });
await run('inspect-hand', 'index.html#kitchen-knife', 900, 900, async (pg) => { await pg.check('#hand'); });
await run('phone-grid', 'index.html', 390, 844);
await run('phone-inspect', 'index.html#katana-red', 390, 844);
await run('variant1-sheet', 'index.html?shot=1&variant=1', 1477, 718);
// click-to-inspect
const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
pg.on('pageerror', (e) => errs.push('click PAGEERR ' + e.message));
await pg.goto('http://localhost:8767/index.html'); await pg.waitForFunction('window.__ready');
const box = await (await pg.$('canvas')).boundingBox(); const k = box.width / 1477;
await pg.mouse.click(box.x + 308 * k, box.y + 293 * k); await pg.waitForTimeout(500);
console.log('inspect title after click:', await pg.textContent('#winfo h2'));
const tris = await pg.evaluate(() => window.__app.weapons.map((w, i) => [w.id, window.__app.getWeapon(i, 0).userData.weapon.tris, window.__app.getWeapon(i, 1).userData.weapon.tris]));
console.log(JSON.stringify(tris));
console.log('errors:', JSON.stringify(errs)); await b.close(); srv.close(); process.exit(0);
