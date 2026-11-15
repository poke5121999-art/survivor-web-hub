// Renders both layouts, then PIL composes reference | ours per weapon into shots/compare/
import { serve, launch } from './pw.mjs';
import { execFileSync } from 'node:child_process';
const srv = serve(8766, 200000); const b = await launch();
const errs = [];
for (const [n, w, h] of [[1, 1477, 718], [2, 2000, 1125]]) {
  const pg = await b.newPage({ viewport: { width: w, height: h } });
  pg.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); });
  pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await pg.goto(`http://localhost:8766/index.html?shot=${n}` + (process.argv[2] ? '&variant=' + process.argv[2] : ''));
  await pg.waitForFunction('window.__ready', null, { timeout: 60000 });
  await pg.waitForTimeout(300);
  const el = await pg.$('canvas'); await el.screenshot({ path: `shots/sheet${n}-ours.png` });
  errs.push(...(await pg.evaluate('window.__errors')));
  await pg.close();
}
console.log('errors:', JSON.stringify(errs)); await b.close(); srv.close();
execFileSync('python', ['tools/compose.py'], { stdio: 'inherit' }); process.exit(0);
