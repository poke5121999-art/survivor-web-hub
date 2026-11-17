'use strict';
// Quick look at the menu and a match for the play modes work: node tools/modes-look.js <tag> [query] [js]
// Writes .chk/modes/<tag>-desk.png and <tag>-phone.png. js: optional code run in the page before the shot (string).
const { session, open, CHK, fs, path } = require('./lib.js');
const tag = process.argv[2] || 'look', query = process.argv[3] || 'noaudio', js = process.argv[4] || '';
const OUT = path.join(CHK, 'modes');
fs.mkdirSync(OUT, { recursive: true });
session(async (br, base) => {
  for (const [name, opts] of [['desk', { viewport: { width: 1280, height: 720 } }], ['phone', { viewport: { width: 1002, height: 461 }, touch: true }]]) {
    const ctx = await br.newContext({ viewport: opts.viewport, deviceScaleFactor: name === 'phone' ? 2.75 : 1, hasTouch: !!opts.touch, isMobile: !!opts.touch });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) {} });
    const o = await open(br, base, query, { ctx });
    if (js) { await o.page.evaluate(js); }
    await o.page.waitForTimeout(1500);
    const f = path.join(OUT, `${tag}-${name}.png`);
    await o.page.screenshot({ path: f });
    console.log('shot', f, o.problems.slice(0, 5).join(' | '));
    await ctx.close();
  }
}).catch((e) => { console.error(e); process.exit(1); });
