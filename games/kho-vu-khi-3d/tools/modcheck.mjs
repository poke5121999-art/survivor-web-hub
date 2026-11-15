import { serve, launch } from './pw.mjs';
const srv = serve(8990, 120000); const browser = await launch();
const page = await browser.newPage(); await page.goto('http://localhost:8990/index.html?only=none').catch(() => {});
for (const m of process.argv.slice(2)) console.log(m, await page.evaluate(async (u) => { try { await import(u); return 'ok'; } catch (e) { return String(e) + ' ' + (e.stack || ''); } }, '/' + m));
await browser.close(); srv.close(); process.exit(0);
