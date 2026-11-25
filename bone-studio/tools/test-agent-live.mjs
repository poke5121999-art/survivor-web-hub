// Live agent loop on this machine: editor page → mock API (same contract as the Edge Function) → bone worker →
// real `claude -p` → events → canvas. node tools/test-agent-live.mjs [--sample robo] [--prompt "..."] [--mode agent|split] [--model sonnet]
//   --sample raw --image samples/split-bench/toc-dai.png : start empty and attach that image (pharaoh-raw = the owner's pharaoh)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serve, browser } from "./pw.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, "..", "..");
const A = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith("--") ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []));
const sample = A.sample ?? "robo", mode = A.mode ?? "agent", model = A.model ?? "sonnet";
const rawImage = sample === "pharaoh-raw" ? "samples/pharaoh/pharaoh-owner.png" : sample === "raw" ? A.image ?? (console.error("thiếu --image cho --sample raw"), process.exit(2)) : null;
const prompt = A.prompt ?? (mode === "split" ? "Cắt nhân vật này ra thành part và rig cho tôi." : "Làm animation 'vay-tay': tay trước (front-upper-arm, front-lower-arm) vẫy chào 2 lần trong 1.2 giây, đầu nghiêng nhẹ theo, lặp được.");
const OUT = join(REPO, ".chk", "agent-live", `${sample === "raw" ? "raw-" + A.image.replace(/^.*\//, "").replace(/\.\w+$/, "") : sample}-${mode}`);
mkdirSync(OUT, { recursive: true });
const kids = [];
const start = (args, env = {}) => { const p = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true }); kids.push(p); return p; };
const killAll = () => { for (const k of kids) { try { process.kill(-k.pid, "SIGKILL"); } catch {} } };
process.on("exit", killAll);
setTimeout(() => { console.log("FAIL quá 20 phút"); killAll(); process.exit(1); }, 20 * 60000).unref();

const ms = start([join(REPO, "tools/bone-worker/mock-server.mjs"), "0"]);
const port = await new Promise((res) => ms.stdout.on("data", (d) => { const m = String(d).match(/ready (\d+)/); if (m) res(+m[1]); }));
const api = `http://127.0.0.1:${port}`;
const wlog = [];
const worker = start([join(REPO, "tools/bone-worker/worker.mjs"), "--id", "linux:livetest", "--label", "live test", "--priority", "0", "--model", model, "--once", "--work-dir", join(REPO, ".chk", "agent-live", "work")],
  { BONE_SUPABASE_URL: api, BONE_ANON_KEY: "x", BONE_WORKER_KEY: "k" });
worker.stdout.on("data", (d) => wlog.push(String(d)));
worker.stderr.on("data", (d) => wlog.push(String(d)));

const { srv, base } = await serve();
const br = await browser();
let ok = false;
try {
  const page = await br.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("dialog", (d) => d.accept());
  await page.goto(`${base}/bone-studio/index.html?sample=${rawImage ? "empty" : sample}&api=${encodeURIComponent(api)}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const before = await page.evaluate(() => JSON.stringify(__BS.doc()));
  await page.locator('[data-tab="agent"]').click();
  const t0 = Date.now();
  await page.evaluate(async ({ prompt, mode, raw }) => {
    if (raw) {
      const f = new File([await (await fetch(raw)).blob()], raw.replace(/^.*\//, ""), { type: "image/png" });
      const input = document.querySelector('#xx-pane-agent input[type="file"]');
      const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files; input.dispatchEvent(new Event("change"));
    }
    await __BS.agent.send(prompt, { mode, only_worker: "linux:livetest" });
  }, { prompt, mode, raw: rawImage });
  const states = [];
  let shot = 0, last = "";
  for (;;) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => ({ locked: !!__BS.S.locked, key: JSON.stringify(__BS.doc()).length + ":" + __BS.doc().bones.length + ":" + Object.keys(__BS.doc().animations).length, bones: __BS.doc().bones.length }));
    if (s.key !== last) { states.push({ t: Math.round((Date.now() - t0) / 1000), ...s }); last = s.key; if (shot < 6 && states.length % 2 === 0) await page.screenshot({ path: join(OUT, `live-${++shot}.png`) }); }
    if (!s.locked && Date.now() - t0 > 5000) break;
  }
  await page.locator('[data-tab="agent"]').click();
  await page.screenshot({ path: join(OUT, "done.png") });
  const after = await page.evaluate(() => JSON.stringify(__BS.doc()));
  const info = await page.evaluate(() => ({
    latency: __BS.agent.latency.slice(), log: [...document.querySelectorAll(".xx-msg")].map((m) => m.textContent).slice(-40),
    anims: Object.keys(__BS.doc().animations), bones: __BS.doc().bones.length, slots: __BS.doc().slots.length,
  }));
  const newAnim = info.anims.find((a) => !JSON.parse(before).animations[a]);
  if (newAnim) {
    const png = await page.evaluate(async (a) => {
      const frames = __BS.io.renderFrames({ anim: a, fps: 8 });
      const c = document.createElement("canvas"); c.width = frames[0].width * frames.length; c.height = frames[0].height;
      const g = c.getContext("2d"); g.fillStyle = "#2a2c33"; g.fillRect(0, 0, c.width, c.height);
      frames.forEach((f, i) => g.drawImage(f, i * f.width, 0));
      return c.toDataURL("image/png");
    }, newAnim);
    writeFileSync(join(OUT, `strip-${newAnim}.png`), Buffer.from(png.split(",")[1], "base64"));
  }
  await page.evaluate(() => __BS.undo());
  const undone = await page.evaluate(() => JSON.stringify(__BS.doc()));
  const lat = info.latency.slice().sort((a, b) => a - b);
  const report = {
    prompt, mode, model, seconds: Math.round((Date.now() - t0) / 1000), changed: before !== after, liveStates: states.length,
    undoRestores: undone === before, latencyMs: lat.length ? { n: lat.length, min: lat[0], median: lat[lat.length >> 1], max: lat[lat.length - 1] } : null,
    bones: info.bones, slots: info.slots, anims: info.anims, newAnim, states,
  };
  writeFileSync(join(OUT, "report.json"), JSON.stringify({ ...report, log: info.log, worker: wlog.join("").slice(-6000) }, null, 1));
  console.log(JSON.stringify(report, null, 1));
  console.log("agent nói:\n" + info.log.join("\n").slice(-2500));
  ok = report.changed && report.liveStates >= 2 && report.undoRestores;
} finally {
  await br.close(); srv.close(); killAll();
}
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
