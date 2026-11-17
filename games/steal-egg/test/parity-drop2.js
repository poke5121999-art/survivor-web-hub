// Parity captures of the Drop 2 panels: web = the game with the panel open the way the original opens it (1280x720);
// ref = art/ui/preview.html?s=level2&show=<node>, the exporter's own render of the same uGUI node at its serialized
// rect. Output: $PARITY or ~/stealegg-ref/parity/{web,ref}/<key>.png, then build with the parity-compare skill.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, openPage } = require('./harness');

const OUT = process.env.PARITY || path.join(os.homedir(), 'stealegg-ref', 'parity');
const VIEW = { width: 1280, height: 720 };

const KEYS = {
  'shop-panel': { show: 'Canvas/ShopPanle', setup: g => g.gv.panels.openShop(true) },
  'bat-shop': { show: 'Canvas/Bat shop', setup: g => { g.sim.state.actors[0].pos = g.sim.nav.closest(g.sim.D.zones.shops.bat.c); window.__step(25, true); } },
  'shoes-shop': { show: 'Canvas/shoes shop', setup: g => { g.sim.state.actors[0].pos = g.sim.nav.closest(g.sim.D.zones.shops.shoes.c); window.__step(25, true); } },
  'pedestal-panel': { show: 'unlockWaponPanels3/WeponUnlockPanel3', setup: g => {
    g.sim.state.actors[0].pos = g.sim.nav.closest(g.sim.D.weapons.pedestals[2].trigger.c); window.__step(2, true); g.gv.panels.pedestalPanel = 2; } },
  settings: { show: 'Canvas/Setting', setup: g => g.gv.panels.pause('setting') },
  pause: { show: 'Canvas/PauseGame', setup: g => g.gv.panels.pause('pause') },
  'ads-coins': { show: 'Canvas/ads panel/', also: 'Canvas/ads panel', hide: 'ads panel (1)', setup: g => window.__step(60 * 30, false) },
  'ads-health': { show: 'Canvas/ads panel (1)', setup: g => { const b = g.sim.state.adsBreak; b.interstitialNext = false; g.sim.state.actors[0].hp = 2; b.left = 1; window.__step(31, false); } },
};

run('parity-drop2', async ({ browser, base, check }) => {
  for (const d of ['web', 'ref']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
  for (const [key, k] of Object.entries(KEYS)) {
    const { ctx, page, errors } = await openPage(browser, `${base}/index.html?fresh&mute&seed=1`, { viewport: VIEW });
    await page.waitForFunction(() => window.__game.hudSpritesAll, null, { timeout: 60000 });   // menus' sprites and tints
    await page.evaluate(src => { (0, eval)(`(${src})`)(window.__game); window.__step(3, true); }, k.setup.toString());
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'web', `${key}.png`) });
    check(`${key}: web capture without console errors`, !errors.length, errors.slice(0, 2).join(' | '));
    await ctx.close();
    const pctx = await browser.newContext({ viewport: VIEW });
    const pv = await pctx.newPage();
    await pv.goto(`${base}/art/ui/preview.html?s=level2&show=${encodeURIComponent(k.also ? `${k.show},${k.also}` : k.show)}${k.hide ? `&hide=${encodeURIComponent(k.hide)}` : ''}`);
    await pv.waitForTimeout(2500);
    await pv.addStyleTag({ content: '#info { display: none !important; }' });
    await pv.screenshot({ path: path.join(OUT, 'ref', `${key}.png`) });
    await pctx.close();
  }
  check('captures written', Object.keys(KEYS).every(k => fs.existsSync(path.join(OUT, 'web', `${k}.png`)) && fs.existsSync(path.join(OUT, 'ref', `${k}.png`))), OUT);
});
