// node tools/eval.mjs "<query>" "<js expression>"
import { serve, launch, open } from './pw.mjs';
const [q = '', expr = '1'] = process.argv.slice(2);
const srv = serve(8890 + Math.floor(Math.random() * 100), 200000);
const browser = await launch();
try {
  const { page, errors } = await open(browser, `http://localhost:${srv.address().port}/index.html?${q}`);
  console.log(JSON.stringify(await page.evaluate(expr), null, 1));
  if (errors.length) console.log('ERRORS:', errors.filter((e) => !e.includes('X3595')).join('\n'));
} finally { await browser.close(); srv.close(); }
process.exit(0);
