// Renders every synthesized sound on the page and checks it: audible, no clipping, no NaN.
// Usage: node games/phao-may/tools/audio.js
'use strict';
const { session, open, checker } = require('./lib.js');
const check = checker();
session(async (br, base) => {
  const { page, problems, close } = await open(br, base, 'nogov=1&manual=1&q=low&autostart=1', { width: 640, height: 360 });
  const rows = await page.evaluate('window.__G.audio.diag()');
  check(rows.length >= 30, `the sound table renders ${rows.length} sounds`);
  const bad = rows.filter((r) => r.nan || r.clipped || !(r.peak > 0.02) || !(r.dur > 0.01));
  check(bad.length === 0, 'every sound is audible, finite and unclipped' + (bad.length ? ': ' + JSON.stringify(bad).slice(0, 500) : ''));
  const played = await page.evaluate(`(async () => { const G = window.__G; G.audio.unlock(); await new Promise((r) => setTimeout(r, 300));
    __fire({ angle: 60, power: 50, shot: 0 }); __sim(5); for (let i = 0; i < 30; i++) G.audio.update(1 / 60); return { ready: G.audio.ready, progress: G.audio.progress }; })()`);
  check(played.progress >= 0 && played.progress <= 1, 'audio keeps running through a shot ' + JSON.stringify(played));
  const errs = (await page.evaluate('window.__errors')).concat(problems);
  check(errs.length === 0, 'no errors with audio on' + (errs.length ? ': ' + errs.join(' | ').slice(0, 800) : ''));
  await close();
  check.done();
});
