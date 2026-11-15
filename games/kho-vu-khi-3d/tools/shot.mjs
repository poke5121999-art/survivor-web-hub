// usage: node tools/shot.mjs <url-path> <out.png> [w h]
import { serve, launch } from './pw.mjs';
const [, , url, out, w = 1480, h = 900] = process.argv;
const srv = serve(8765, 90000); const b = await launch();
const pg = await b.newPage({ viewport: { width: +w, height: +h } });
const errs = []; pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); }); pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
await pg.goto('http://localhost:8765/' + url); await pg.waitForFunction('window.__ready', null, { timeout: 40000 }).catch(() => errs.push('NOT READY'));
await pg.waitForTimeout(500); await pg.screenshot({ path: out });
console.log('errors:', JSON.stringify(errs)); await b.close(); srv.close(); process.exit(0);
