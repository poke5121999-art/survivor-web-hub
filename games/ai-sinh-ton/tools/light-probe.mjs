// One stage's light state from inside the page (sun, shadow map, shadow overlays): node tools/light-probe.mjs <stage> [q] [phone]
import { serve, launch, open as openPage } from './pw.mjs';
const [stage = '2', q = 'medium', ph = 's22'] = process.argv.slice(2);
const srv = await serve(); const br = await launch();
try {
  const { page, problems } = await openPage(br, srv.base, ph, `autostart=1&stage=${stage}&noaudio=1&seed=3&q=${q}`, { freeze: true });
  await page.evaluate(() => window.__sim(6)); await page.evaluate(() => window.__step(4));
  console.log(JSON.stringify(await page.evaluate(() => {
    const H = window.__G.host; let shade = 0; let cast = 0; let recv = 0;
    H.scene.traverse((o) => { if (o.name === 'shade') shade++; if (o.castShadow) cast++; if (o.receiveShadow) recv++; });
    return { theme: H.world.theme.name, map: H.renderer.shadowMap.enabled, sunCast: H.sun.castShadow, sunPos: H.sun.position.toArray().map((v) => +v.toFixed(1)), shade, cast, recv, draws: H.stats.draws, mapTex: !!(H.sun.shadow.map) };
  })));
  if (process.env.EVAL) console.log(await page.evaluate((js) => (0, eval)(js), process.env.EVAL));
  if (process.env.SHOT) {
    const jss = (process.env.JS || '').split('@@');
    for (let i = 0; i < jss.length; i++) {
      const out = await page.evaluate((js) => { const H = window.__G.host; if (!H.__r) { H.__r = H.render; H.render = () => H.__r(null); } const r = js ? (0, eval)(js) : ''; window.__step(1); return r; }, jss[i]);
      if (out !== undefined && out !== '') console.log(i, out);
      await page.locator('#frame').screenshot({ path: process.env.SHOT.replace('.png', `-${i}.png`) });
    }
  }
  console.log(problems.slice(0, 3).join('\n'));
} finally { await br.close(); srv.close(); }
