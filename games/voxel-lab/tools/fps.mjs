// live-loop fps (pass --swiftshader for the software lower bound): idle, then during a tower collapse
import { withLab } from './serve.mjs';
for (const [name, q, w, h, query] of [['tower-med', 'med', 1280, 720, 'model=office-tower'], ['tower-low', 'low', 1280, 720, 'model=office-tower'], ['phone-low', 'low', 390, 844, 'model=tube-house'], ['row-low', 'low', 1280, 720, 'row=1']]) {
  await withLab(async (page, logs) => {
    await page.waitForTimeout(5000);
    const idle = await page.evaluate(() => { const g = __lab.R.gl3.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return { gl: (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?').slice(0, 60), fps: __lab.stats().fps }; });
    await page.evaluate(() => { const i = { x: __lab.orbit.tx, z: __lab.orbit.tz }; __lab.explode(i.x, 2.6, i.z, 3.5, 2); __lab.explode(i.x - 3, 2.6, i.z - 3, 3.5, 2); __lab.explode(i.x + 3, 2.6, i.z + 3, 3.5, 2); });
    let min = 999; for (let k = 0; k < 6; k++) { await page.waitForTimeout(1000); min = Math.min(min, await page.evaluate(() => __lab.stats().fps)); }
    const s = await page.evaluate(() => ({ s: __lab.stats(), e: __lab.errors }));
    await page.screenshot({ path: `shots/ui_${name}.png` });
    console.log(name, idle.gl, 'idle fps', idle.fps, 'collapse min fps', min, 'bodies', s.s.bodies, 'errors', JSON.stringify(s.e), 'console', logs.length, logs.slice(0, 2).join(' | '));
  }, { query: query + '&quality=' + q, width: w, height: h, timeoutMs: 100000 });
}
