// Takes screenshots for review sheets. Usage: node games/phao-may/tools/shot.js <name> "<query>" [shot ...]
// Each shot is a camera pose name from PM.SHOTS or x,y,dist. Files land in .chk/<name>-<shot>.png.
'use strict';
const { session, open, CHK, fs, path } = require('./lib.js');
const [name, query, ...shots] = process.argv.slice(2);
fs.mkdirSync(CHK, { recursive: true });
session(async (br, base) => {
  const t0 = Date.now();
  const { page, problems } = await open(br, base, (query || 'autostart=1') + '&noaudio=1&nogov=1&manual=1');
  console.log('boot ms', Date.now() - t0);
  const pre = process.env.PM_EVAL;
  if (pre) console.log('eval ->', JSON.stringify(await page.evaluate(pre)));
  for (const s of shots.length ? shots : ['wide']) {
    const pose = /^[\d.-]+,/.test(s) ? (() => { const [x, y, dist] = s.split(',').map(Number); return { x, y, dist }; })() : s;
    if (s === 'keep') await page.evaluate(() => window.__step(1)); else await page.evaluate((p) => { window.__setShot(p); window.__step(3); }, pose);
    const file = path.join(CHK, `${name}-${String(s).replace(/[^\w.-]/g, '_')}.png`);
    await page.screenshot({ path: file });
    console.log('saved', file);
  }
  console.log('stats', JSON.stringify(await page.evaluate('window.__stats')));
  const errs = await page.evaluate('window.__errors');
  if (errs.length || problems.length) console.log('ERRORS', JSON.stringify(errs.concat(problems), null, 1).slice(0, 3000));
});
