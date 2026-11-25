// node tools/shot.mjs "<query>" out.png ["<js to run before the shot>"]
import { serve, browser, openEditor } from "./pw.mjs";
const [q = "", out = "shot.png", js] = process.argv.slice(2);
const { srv, base } = await serve();
const br = await browser();
try {
  const page = await openEditor(br, `${base}/bone-studio/index.html${q}`);
  if (js) { await page.evaluate(js); await page.waitForTimeout(500); }
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ errors: await page.evaluate(() => window.__errors), console: page.logs }));
} finally { await br.close(); srv.close(); }
