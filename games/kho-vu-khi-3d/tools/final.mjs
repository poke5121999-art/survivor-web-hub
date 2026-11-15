// End-to-end check: desktop wall + grid, real mouse click to inspect + orbit drag + zoom, quality toggle, phone width.
// Writes shots/final-*.png and prints console errors (must be none).
import { serve, launch, open } from './pw.mjs';
const srv = serve(8798, 400000); const browser = await launch();
const base = 'http://localhost:8798/index.html';
let bad = 0;
try {
  // desktop
  let { page, errors } = await open(browser, base, { w: 1600, h: 900 });
  await page.waitForTimeout(500); await page.screenshot({ path: 'shots/final-wall.png' });
  // click the TR-9 on the wall (project its centre to screen)
  const xy = await page.evaluate(() => { const it = __api.state.items.find((x) => x.w.id === 'tr9'); const THREE_V = it.holder.getWorldPosition(it.holder.position.clone()); const b = it.meta.bounds.clone().applyMatrix4(it.holder.matrixWorld); const c = b.getCenter(THREE_V); c.project(__api.camera); return [(c.x * 0.5 + 0.5) * innerWidth, (-c.y * 0.5 + 0.5) * innerHeight]; });
  await page.mouse.click(xy[0], xy[1]); await page.waitForTimeout(600);
  const insp = await page.evaluate(() => (__api.state.inspect ? __api.state.inspect.meta.id : null));
  console.log('click ->', insp); if (insp !== 'tr9') bad++;
  await page.mouse.move(800, 450); await page.mouse.down(); await page.mouse.move(950, 420, { steps: 8 }); await page.mouse.up();
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300);
  await page.waitForTimeout(400); await page.screenshot({ path: 'shots/final-inspect-close.png' });
  await page.click('#q'); await page.waitForTimeout(800); await page.screenshot({ path: 'shots/final-inspect-low.png' });
  await page.click('#back'); await page.click('[data-view=grid]'); await page.waitForTimeout(600); await page.screenshot({ path: 'shots/final-grid.png' });
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 60) requestAnimationFrame(f); else r(Math.round(60000 / (performance.now() - t0))); }; requestAnimationFrame(f); }));
  console.log('desktop fps (low, headless)', fps, 'errors', errors.length); if (errors.length) { console.log(errors.join('\n')); bad++; }
  await page.close();
  // phone
  ({ page, errors } = await open(browser, base + '?view=grid', { w: 390, h: 844 }));
  await page.waitForTimeout(500); await page.screenshot({ path: 'shots/final-phone-grid.png' });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth); console.log('phone scrollWidth', sw); if (sw > 390) bad++;
  await page.evaluate(() => __api.inspect('katana-red')); await page.waitForTimeout(500); await page.screenshot({ path: 'shots/final-phone-inspect.png' });
  console.log('phone errors', errors.length); if (errors.length) { console.log(errors.join('\n')); bad++; }
} finally { await browser.close(); srv.close(); }
console.log(bad ? 'FAIL ' + bad : 'PASS');
process.exit(bad ? 1 : 0);
