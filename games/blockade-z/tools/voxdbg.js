// scratch runner: node voxdbg.js "<query>" "<js expression>"  (prints the result and console errors)
'use strict';
const { serve } = require('../../../tools/thumb-lib.js'); const E = process['env'];
const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, +(E.TMO || 120000));
(async () => {
  const srv = await serve(); const br = await require(E.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const [w, h] = (E.VP || '800x600').split('x').map(Number);
    const ctx = await br.newContext({ viewport: { width: w, height: h }, hasTouch: !!E.TOUCH, isMobile: !!E.TOUCH });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'dbg@test' })); } catch (e) {} });
    const page = await ctx.newPage(); const bad = [];
    page.on('pageerror', (e) => bad.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) bad.push('console: ' + m.text().slice(0, 300)); });
    await page.goto(srv.base + '/games/blockade-z/index.html?lang=vi&nolock=1&noaudio=1&seed=4&' + (process.argv[2] || 'autostart=1'));
    if (!E.NOREADY) await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
    const r = await page.evaluate(process.argv[3] || '1'); console.log(typeof r === 'string' ? r : JSON.stringify(r));
    if (E.SHOT) await page.screenshot({ path: E.SHOT });
    console.log('problems: ' + bad.length + (bad.length ? '\n  ' + bad.slice(0, 6).join('\n  ') : ''));
  } catch (e) { console.log('FAIL ' + (e && e.stack || e)); }
  finally { await br.close(); srv.close(); clearTimeout(kill); }
})();
