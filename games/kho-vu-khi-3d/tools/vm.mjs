// TR-9 in Saltline's hip viewmodel pose next to Ga Chìm's viewmodel frame -> shots/tr9-vs-gachim.png
import { serve, launch, open, ROOT } from './pw.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const [gachim] = process.argv.slice(2);
const srv = serve(8797, 200000); const browser = await launch();
try {
  const { page, errors } = await open(browser, 'http://localhost:8797/index.html?shot=1', { w: 1280, h: 720 });
  await page.evaluate(() => __api.viewmodel('tr9')); await page.waitForTimeout(500);
  const ours = path.join(ROOT, 'shots', 'tr9-viewmodel.png'); await page.screenshot({ path: ours });
  execFileSync('python', [path.join(ROOT, 'tools', 'pair.py'), path.join(ROOT, 'shots', 'tr9-vs-gachim.png'), gachim, ours]);
  console.log('ok', errors.filter((e) => !e.includes('X3595')).join('|'));
} finally { await browser.close(); srv.close(); }
process.exit(0);
