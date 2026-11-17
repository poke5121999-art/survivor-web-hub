'use strict';
// Frame time of a Phó bản stage vs a ranked match on the real page (desktop 1280x720): node tools/modes-perf.js [stage]
const { open, path } = require('./lib.js');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || path.join(process.env.HOME, '.cache/pw-node/node_modules/playwright-core');
(async () => {
  const srv = await serve(); const br = await require(PW).chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    for (const choice of [{ play: 'rank' }, { play: 'pve', stage: process.argv[2] || '1-4' }]) {
      const o = await open(br, srv.base, 'noaudio&q=low');
      await o.page.evaluate((c) => window.__start(c), choice);
      const t0 = Date.now();
      await o.page.waitForTimeout(6000);
      const r = await o.page.evaluate(() => ({ ms: __stats.ms, tick: __G.match.tick, units: __G.match.units.length, errs: (window.__errors || []).slice(0, 3) }));
      console.log(JSON.stringify(choice), JSON.stringify(r), 'wall', Date.now() - t0, o.problems.slice(0, 3).join(' | '));
      await o.close();
    }
  } finally { await br.close(); srv.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
