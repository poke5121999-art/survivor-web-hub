// Plays one full AI match on the real page for every map and AI level, and saves the last frame of each.
// Usage: node games/phao-may/tools/tour.js   (PM_BASE to test a deployed copy)
'use strict';
const { session, open, checker, CHK, fs, path } = require('./lib.js');
const check = checker();
session(async (br, base) => {
  fs.mkdirSync(CHK, { recursive: true });
  const maps = ['doiche', 'vinhda', 'lolua', 'bang', 'pho', 'hoangmac'], kinds = ['coc', 'chuon', 'oc', 'tegiac', 'sua', 'rua', 'nhim', 'co'];
  let k = 0;
  for (const map of maps) for (const level of ['easy', 'medium', 'hard']) {
    const unit = kinds[k % 8], foe = kinds[(k + 3) % 8]; k++;
    const { page, problems, close } = await open(br, base, `noaudio=1&nogov=1&manual=1&q=low&autostart=1&auto=1&seed=${20 + k}&map=${map}&ai=${level}&unit=${unit}&foe=${foe}`, { width: 640, height: 360 });
    const r = await page.evaluate(`(() => { const s = window.__G.sim; let g = 0; while (s.phase !== 'over' && g++ < 90) __sim(20); __tick(30);
      return { phase: s.phase, turns: s.turnN, winner: s.winner, dealt: s.units.map((u) => s.stats[u.id].dealt) }; })()`);
    const errs = (await page.evaluate('window.__errors')).concat(problems);
    check(r.phase === 'over' && errs.length === 0, `${map} ${level} ${unit} vs ${foe}: ends in ${r.turns} turns, winner ${r.winner}, damage ${r.dealt.join(' / ')}` + (errs.length ? ' ERRORS ' + errs.join(' | ').slice(0, 300) : ''));
    await page.screenshot({ path: path.join(CHK, `tour-${map}-${level}.png`) });
    await close();
  }
  check.done();
});
