// Shared Playwright helpers: one local static server for the repo checkout + one headless Chrome.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".atlas": "text/plain" };
export function serve(port = 0) {
  return new Promise((res) => {
    const srv = createServer((req, rsp) => {
      const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let f = join(REPO, p);
      if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
      if (!f.startsWith(REPO) || !existsSync(f)) { rsp.writeHead(404); return rsp.end("not found"); }
      rsp.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream", "cache-control": "no-store" });
      rsp.end(readFileSync(f));
    });
    srv.listen(port, "127.0.0.1", () => res({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}
export async function browser() {
  const require = createRequire(import.meta.url);
  const pw = require(process.env.PLAYWRIGHT_PATH ?? `${process.env.HOME}/.cache/pw-node/node_modules/playwright-core`);
  return pw.chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
}
export async function openEditor(br, url, { width = 1440, height = 900 } = {}) {
  const page = await br.newPage({ viewport: { width, height }, deviceScaleFactor: 1, acceptDownloads: true });
  const logs = [];
  page.on("console", (m) => { if (m.type() === "error") logs.push(m.text()); });
  page.on("pageerror", (e) => logs.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  page.logs = logs;
  return page;
}
