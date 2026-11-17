// Parity captures against the original assets (no gameplay footage of com.mega.steal.egg exists):
//   start-scene  web: the game at start with the HUD hidden, CameraFollow pose (MainCamera pitch/yaw, distance 2.17,
//                height 1.13 behind the player start); ref: viewer.html rendering the GamePlay scene exactly as authored
//                in level2 (every object at its scene pose and active flag) from the same camera pose and FOV 60.
//   farm-scene   the same for a pose above the player farm (gate, fences, upgrade pad, rival farm).
//   hud-start    web: the game at start (full frame); ref: art/ui/preview.html?s=level2, the exporter's own uGUI render.
// Output: $PARITY or ~/stealegg-ref/parity/{web,ref}/<key>.png, then build with the parity-compare skill.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, openPage } = require('./harness');

const OUT = process.env.PARITY || path.join(os.homedir(), 'stealegg-ref', 'parity');
const VIEW = { width: 1280, height: 720 };

run('parity-capture', async ({ browser, base, check }) => {
  for (const d of ['web', 'ref']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
  const { ctx, page, errors } = await openPage(browser, `${base}/index.html?fresh&mute&seed=1`, { viewport: VIEW });
  await page.evaluate(() => window.__step(30, true));
  const poses = {};
  poses['start-scene'] = await page.evaluate(() => {
    const c = window.__game.view.camera, f = c.getWorldDirection(c.position.clone());
    return { cam: c.position.toArray(), look: c.position.clone().add(f.multiplyScalar(10)).toArray(), fov: c.fov };
  });
  await page.screenshot({ path: path.join(OUT, 'web', 'hud-start.png') });
  const shotNoHud = async key => {
    await page.evaluate(p => {
      const g = window.__game, c = g.view.camera;
      g.paused = true;
      document.getElementById('hud').style.visibility = 'hidden';
      document.querySelector('.hub-back').style.visibility = 'hidden';
      c.position.fromArray(p.cam); c.fov = p.fov; c.lookAt(p.look[0], p.look[1], p.look[2]); c.updateProjectionMatrix();
      g.view.renderer.render(g.view.scene, c);
    }, poses[key]);
    await page.screenshot({ path: path.join(OUT, 'web', `${key}.png`) });
  };
  await shotNoHud('start-scene');
  poses['farm-scene'] = await page.evaluate(() => {
    const F = window.__game.sim.D.farm.area.c;
    return { cam: [F[0] + 16, F[1] + 9, F[2] + 2], look: [F[0], F[1], F[2]], fov: 60 };
  });
  await shotNoHud('farm-scene');
  check('web captures without console errors', !errors.length, errors.slice(0, 2).join(' | '));
  await ctx.close();

  for (const key of ['start-scene', 'farm-scene']) {
    const p = poses[key];
    const vctx = await browser.newContext({ viewport: VIEW });
    const v = await vctx.newPage();
    await v.goto(`${base}/viewer.html?s=world&cam=${p.cam.join(',')}&look=${p.look.join(',')}&fov=${p.fov}`);
    await v.waitForFunction(() => window.__ready && (window.__frames || 0) > 5, null, { timeout: 120000 });
    await v.waitForTimeout(3000);
    await v.addStyleTag({ content: '#info, .info, #say { display: none !important; }' });
    await v.screenshot({ path: path.join(OUT, 'ref', `${key}.png`) });
    await vctx.close();
  }
  const pctx = await browser.newContext({ viewport: VIEW });
  const pv = await pctx.newPage();
  await pv.goto(`${base}/art/ui/preview.html?s=level2`);
  await pv.waitForTimeout(3000);
  await pv.addStyleTag({ content: '#info { display: none !important; }' });
  await pv.screenshot({ path: path.join(OUT, 'ref', 'hud-start.png') });
  await pctx.close();
  check('captures written', ['start-scene', 'farm-scene', 'hud-start'].every(k => fs.existsSync(path.join(OUT, 'web', `${k}.png`)) && fs.existsSync(path.join(OUT, 'ref', `${k}.png`))), OUT);
});
