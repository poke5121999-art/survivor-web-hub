// Smoke test for js/host/gfx.js + postfx.js: renders known scenes in headless Chromium (SwiftShader)
// and checks read-back pixels against values derived from the CpuCtx / shader formulas.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(os.homedir(), ".cache/pw-node/node_modules/playwright-core"));
const page = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "gfx-smoke.html")).href;

const px = {
  solid: [153, 102, 0, 255],
  imgR: [255, 0, 0, 255], imgG: [0, 255, 0, 255], imgB: [0, 0, 255, 255], imgHalf: [128, 128, 128, 128],
  reup1: [255, 0, 255, 255], reup2: [255, 0, 255, 255],
  smooth: [134, 134, 134, 255],
  add: [150, 70, 50, 255],
  mulImg: [100, 25, 50, 255],
  mulBd: [150, 62, 25, 255],
  soft: [200, 130, 40, 255],
  color: [192, 91, 120, 255],
  softHalf: [200, 115, 45, 255],
  grad150: [129, 129, 129, 255], grad120: [52, 52, 52, 255], grad199: [254, 254, 254, 255],
  radial: [134, 0, 51, 185], radialOut: [1, 0, 6, 6],
  shadowIn: [153, 153, 153, 255], shadowOut: [255, 255, 255, 255],
  blur97: [254, 254, 254, 255], blur98: [240, 240, 240, 255], blur99: [178, 178, 178, 255],
  blur100: [77, 77, 77, 255], blur101: [15, 15, 15, 255], blur105: [0, 0, 0, 255],
};
const canvas = {
  solid: [153, 102, 0, 255], imgHalf: [128, 128, 128, 255], imgB: [0, 0, 255, 255],
  postCenter: [232, 210, 187, 255], postCorner: [214, 194, 173, 255], postHud: [199, 96, 42, 255],
};
const tol = (name) => (name.startsWith("post") ? 2 : name === "smooth" ? 2 : 1);

let browser;
let failed = 0;
const check = (label, got, want, t) => {
  const ok = Array.isArray(got) && got.length === 4 && got.every((v, i) => Math.abs(v - want[i]) <= t);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(18)} got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
try {
  browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await browser.newPage();
  const logs = [];
  p.on("console", (m) => logs.push(m.text()));
  p.on("pageerror", (e) => logs.push("pageerror: " + e.message));
  await p.goto(page);
  const r = await p.evaluate(() => window.__result);
  if (!r || r.error) throw new Error("page failed: " + (r && r.error) + "\n" + logs.join("\n"));
  for (const [n, want] of Object.entries(px)) check("rt " + n, r.px[n], want, tol(n));
  for (const [n, want] of Object.entries(canvas)) check("canvas " + n, r.canvas[n], want, tol(n));
  const expect = (label, cond) => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} ${label}`); };
  expect(`frame A stats ${JSON.stringify(r.stats.A)}`, r.stats.A.quads === 24);
  expect(`frame B stats ${JSON.stringify(r.stats.B)} (1 shadow quad + 2 blur + 1 composite)`, r.stats.B.quads === 2 && r.stats.B.draws === 4);
  expect(`smooth image uses a standalone texture`, r.stats.smoothIsStandalone === true);
  expect(`PostFx.Render returned ${r.stats.post}`, r.stats.post === true);
  const bw = [0.2720, 0.2195, 0.1735];
  expect(`bloom[0] ${JSON.stringify(r.stats.bloom0.map((v) => +v.toFixed(4)))} ~ ${JSON.stringify(bw)}`, bw.every((v, i) => Math.abs(r.stats.bloom0[i] - v) < 0.003));
  expect(`gl error ${r.stats.glError}`, r.stats.glError === 0);
  if (logs.length) console.log("page console:\n" + logs.join("\n"));
} catch (e) {
  failed++;
  console.error(e);
} finally {
  if (browser) await browser.close();
}
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
