// Listening levers: writes spectrogram sheets (PNG) and, on request, every sound as WAV.
// Run: timeout 900 node tools/audio-export.js <sheetsDir> [wavDir]   e.g. .chk/before  (WAVs only when wavDir is given)
'use strict';
const path = require('path');
const fs = require('fs');
const PW = process.env.PLAYWRIGHT_PATH || path.join(process.env.HOME, '.cache/pw-node/node_modules/playwright-core');
const { serve } = require('../../../tools/thumb-lib.js');

const GROUPS = [
  ['audio-weapons.png', ['fire_']], ['audio-weapons2.png', ['mortar_', 'turret_', 'tower_']],
  ['audio-impacts.png', ['hit_', 'impact_', 'prop_', 'crate_', 'pot_', 'shield_', 'ram_']],
  ['audio-explosions.png', ['expl_', 'death', 'respawn']],
  ['audio-skills.png', ['sk_']], ['audio-pickups.png', ['pickup_', 'heal_', 'airdrop', 'crate_drop']],
  ['audio-ui.png', ['ui_', 'win', 'lose', 'horn', 'sting']],
  ['audio-music.png', ['@stems']], ['audio-ambience.png', ['@beds']],
];
(async () => {
  const [sheetDir, wavDir] = process.argv.slice(2);
  if (!sheetDir) { console.log('usage: node tools/audio-export.js <sheetsDir> [wavDir]'); process.exit(2); }
  const srv = await serve();
  await require('./lib.js').lockChrome();
  const br = await require(PW).chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await (await br.newContext()).newPage();
    page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
    await page.goto(srv.base + '/games/dau-truong-thep/tools/audio-harness.html');
    await page.waitForFunction('window.__harnessReady === true', null, { timeout: 30000 });
    console.log('TIMING', JSON.stringify(await page.evaluate('window.__timing()')));
    fs.mkdirSync(sheetDir, { recursive: true });
    for (const s of await page.evaluate((g) => window.__sheets(g), GROUPS)) {
      fs.writeFileSync(path.join(sheetDir, s.file), Buffer.from(s.png.split(',')[1], 'base64'));
      console.log('sheet', path.join(sheetDir, s.file));
    }
    if (wavDir) {
      const all = await page.evaluate('window.__exportAll()');
      for (const f of all) { const p = path.join(wavDir, f.file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.from(f.b64, 'base64')); }
      console.log('wav', all.length, 'files in', wavDir);
    }
  } finally { await br.close(); srv.close(); }
})();
