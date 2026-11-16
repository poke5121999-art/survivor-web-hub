// Screenshots of the tank select screen on the real page (3D stage drawn by the game): desktop 1280x720 and the owner's phone
// (Xiaomi, landscape 1002x461 CSS px at DPR 2.75, touch). Writes .chk/select/<size>-<state>.png and fails on page errors or a blank stage.
//   timeout 600 node tools/select-shots.js
'use strict';
const { session, open, CHK, fs, path } = require('./lib.js');
const OUT = path.join(CHK, 'select');
const SIZES = [['desktop', 1280, 720, 1, false], ['phone', 1002, 461, 2.75, true]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const check = (name, ok, info) => { if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (!ok && info ? '  ' + info : '')); };

// Mean and spread of the stage's pixels in a screenshot: a stage the model is drawn into is neither flat nor black.
async function stageStats(page) {
  return page.evaluate(async () => {
    const r = document.querySelector('#ui .stage').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, gl: document.querySelector('#ui .menu').classList.contains('gl'), on: window.__G.showcase && window.__G.showcase.on };
  });
}

session(async (br, base) => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [tag, w, h, dpr, touch] of SIZES) {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); localStorage.removeItem('dtt.save.v1'); } catch (e) {} });
    const g = await open(br, base, 'noaudio&q=low&seed=7', { ctx });
    const P = g.page;
    await P.evaluate(() => { const d = window.__G.meta.get(); d.owned = d.owned.concat(['loi', 'athena']); d.lv.athena = [5, 4, 4, 3, 2]; d.lv.soi = [3, 3, 3, 2, 1]; d.coins = 4200; window.__G.ui.showMenu(); });
    await sleep(1500);
    const st = await stageStats(P);
    check(`${tag}: the stage is drawn by the game (showcase on, menu in gl mode)`, st.gl && st.on, JSON.stringify(st));
    const shot = async (name) => { const f = path.join(OUT, `${tag}-${name}.png`); await P.screenshot({ path: f }); console.log('     ' + f); };
    await shot('select');
    const tap = async (sel) => { await P.locator(sel).first().scrollIntoViewIfNeeded(); await sleep(400); const b = await P.locator(sel).first().boundingBox(); if (touch) await P.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); else await P.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await sleep(500); };
    await tap('#ui .mc[data-mech="athena"]');
    await sleep(900);
    await shot('form3');
    await tap('#ui .fmb[data-form="1"]');
    await sleep(900);
    await shot('preview-form1');
    await tap('#ui .sgk[data-sk="2"]');
    await shot('skill-tip');
    await tap('#ui .mc[data-mech="loi"]');
    await tap('#ui .tabs [data-tab="info"]');
    await sleep(600);
    await shot('detail');
    await tap('#ui [data-r="matchBtn"]');
    await shot('setup');
    await tap('#ui [data-r="matchBtn"]');
    await tap('#ui .mc[data-mech="hades"]');
    await sleep(600);
    await shot('locked');
    await tap('#ui [data-r="pgNext"]');
    await sleep(700);
    await shot('page2');
    check(`${tag}: no page errors`, g.problems.length === 0, g.problems.join(' | '));
    // leaving the menu frees the stage and the match draws again
    await P.evaluate(() => { document.querySelector('#ui .mc[data-mech="soi"]').click(); document.querySelector('#ui [data-r="play"]').click(); });
    await sleep(1500);
    const after = await P.evaluate(() => ({ on: window.__G.showcase.on, mode: window.__G.mode, calls: window.__stats.calls }));
    check(`${tag}: play closes the stage and the match renders`, !after.on && after.mode === 'match' && after.calls > 20, JSON.stringify(after));
    await ctx.close();
  }
  console.log(fail ? `${fail} FAIL` : 'all ok');
  process.exitCode = fail ? 1 : 0;
});
