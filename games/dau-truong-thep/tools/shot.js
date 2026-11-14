// Screenshot the game in a scripted state.
//   node tools/shot.js <name> [query] [ticks] [shotJSON] [evalJS]
// Opens ?manual&noaudio&autostart&<query>, steps <ticks> sim ticks, poses the camera with shotJSON (__setShot), runs evalJS in the page
// before the final frame, and writes .chk/<name>.png. Prints __stats and any page problems.
'use strict';
const { session, open, CHK, fs, path } = require('./lib.js');

const [name = 'shot', query = '', ticks = '90', shot = '', js = ''] = process.argv.slice(2);

session(async (br, base) => {
  const g = await open(br, base, 'manual&noaudio&autostart&' + query);
  const fatal = await g.page.evaluate(() => { const f = document.getElementById('fatal'); return f && f.style.display === 'block' ? f.textContent : ''; });
  if (fatal) { console.log('FATAL', fatal); console.log(g.problems.join('\n')); process.exitCode = 1; return; }
  await g.page.evaluate(({ ticks, shot, js }) => {
    window.__step(ticks, false);
    if (shot) window.__setShot(JSON.parse(shot));
    if (js) (0, eval)(js);
    window.__step(1, true); window.__step(0, true);
  }, { ticks: Number(ticks), shot, js });
  fs.mkdirSync(CHK, { recursive: true });
  const file = path.join(CHK, name + '.png');
  await g.page.screenshot({ path: file });
  const info = await g.page.evaluate(() => ({ stats: window.__stats, errors: window.__errors, score: window.__G.match && window.__G.match.score, t: window.__G.match && window.__G.match.time }));
  console.log(file, JSON.stringify(info));
  if (g.problems.length) console.log('PROBLEMS\n' + g.problems.slice(0, 12).join('\n'));
  await g.close();
});
