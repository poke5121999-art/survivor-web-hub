// node tools/shot.mjs <out.png> "<query>" [w h]   e.g. node tools/shot.mjs shots/tr9.png "only=tr9&shot=1&yaw=20"
import { serve, launch, open } from './pw.mjs';
const [out, q = '', w = '1280', h = '800'] = process.argv.slice(2);
const srv = serve(8790 + Math.floor(Math.random() * 100), 240000);
const port = srv.address().port;
const browser = await launch();
try {
  const { page, errors } = await open(browser, `http://localhost:${port}/index.html?${q}`, { w: +w, h: +h });
  await page.waitForTimeout(600);
  await page.screenshot({ path: out });
  const info = await page.evaluate(() => window.__api ? window.__api.state.items.map((it) => it.meta.id + ':' + it.meta.tris).join(' ') : 'no api');
  console.log(out, info.slice(0, 300));
  if (errors.length) console.log('ERRORS:', errors.join('\n'));
} finally { await browser.close(); srv.close(); }
process.exit(0);
