'use strict';
// Quick look at the menu and a match for the play modes work: node tools/modes-look.js <tag> [query] [js]
// Writes .chk/modes/<tag>-desk.png and <tag>-phone.png. js: optional code run in the page before the shot (string).
const { open, CHK, fs, path } = require('./lib.js');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || path.join(process.env.HOME, '.cache/pw-node/node_modules/playwright-core');
// Its own Chrome without the shared lock: a quick look must not wait 20 minutes behind ui-shots.
const session = async (fn) => { const srv = await serve(); const br = await require(PW).chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); try { return await fn(br, srv.base); } finally { await br.close(); srv.close(); } };
const tag = process.argv[2] || 'look', query = process.argv[3] || 'noaudio', js = process.argv[4] || '', wait = +(process.argv[5] || 1500), only = process.argv[6] || '';
const OUT = path.join(CHK, 'modes');
fs.mkdirSync(OUT, { recursive: true });
session(async (br, base) => {
  for (const [name, opts] of [['desk', { viewport: { width: 1280, height: 720 } }], ['phone', { viewport: { width: 1002, height: 461 }, touch: true }]].filter(([n]) => !only || n === only)) {
    const ctx = await br.newContext({ viewport: opts.viewport, deviceScaleFactor: name === 'phone' ? 2.75 : 1, hasTouch: !!opts.touch, isMobile: !!opts.touch });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) {} });
    const o = await open(br, base, query, { ctx });
    if (js) { await o.page.evaluate(js); }
    await o.page.waitForTimeout(wait);
    const f = path.join(OUT, `${tag}-${name}.png`);
    await o.page.screenshot({ path: f, timeout: 120000 });
    console.log('shot', f, o.problems.slice(0, 5).join(' | '));
    await ctx.close();
  }
}).catch((e) => { console.error(e); process.exit(1); });
