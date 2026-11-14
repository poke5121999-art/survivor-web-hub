// Review sheet of a bot fight: frames taken every few seconds of one match, written as .chk/sheet-<q>-<n>.png.
//   node tools/sheet.js [quality] [seed] [frames] [everyTicks] [startTicks]
'use strict';
const { session, open, CHK, path, fs } = require('./lib.js');
const [q = 'high', seed = '3', frames = '6', every = '240', start = '300'] = process.argv.slice(2);
session(async (br, base) => {
  fs.mkdirSync(CHK, { recursive: true });
  const g = await open(br, base, `manual&noaudio&autostart&spectate&seed=${seed}&bots=hard&q=${q}`);
  await g.page.evaluate((n) => window.__step(n, false), Number(start));
  for (let i = 0; i < Number(frames); i++) {
    await g.page.evaluate((n) => { window.__step(n, false); for (let k = 0; k < 12; k++) window.__step(1, true); }, Number(every));
    const file = path.join(CHK, `sheet-${q}-${i}.png`);
    await g.page.screenshot({ path: file });
    console.log(file, await g.page.evaluate(() => window.__G.match.score.join('-') + ' t=' + window.__G.match.time.toFixed(0)));
  }
  const errs = await g.page.evaluate(() => window.__errors);
  if (errs.length || g.problems.length) console.log('PROBLEMS', errs.concat(g.problems).slice(0, 6).join('\n'));
  await g.close();
});
