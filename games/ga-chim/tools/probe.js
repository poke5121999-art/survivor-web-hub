'use strict';
const { serve } = require('../../../tools/thumb-lib.js');
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
(async () => {
  const srv = await serve();
  const br = await require(PW).chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await br.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  await page.goto(srv.base + '/games/ga-chim/index.html?q=low&noaudio=1');
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 120000 });
  console.log(await page.evaluate(process.argv[2]));
  await br.close(); srv.close();
})();
