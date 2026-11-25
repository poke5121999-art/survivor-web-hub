#!/usr/bin/env node
// End-to-end test of the agent pipeline without Supabase or Claude:
// mock-server (in-memory API + storage) <- worker.mjs --once <- fake-claude.mjs (runs the real bone-cli).
// Asserts live event delivery and prints event latency (events.ndjson `t` -> visible through the `events` action).
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const WORKER_DIR = join(ROOT, "tools", "bone-worker");
const SAMPLE = join(ROOT, "bone-studio", "samples", "robo");
const WID = "test:fake";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const kids = [];
function killKids() {
  for (const c of kids) { try { process.kill(-c.pid, "SIGKILL"); } catch { try { c.kill("SIGKILL"); } catch {} } }
}
let workDir = null;
function finish(code, msg) {
  if (msg) console.error(msg);
  killKids();
  if (workDir) try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  process.exit(code);
}
const overall = setTimeout(() => finish(1, "FAIL: quá 120 s"), 120000);
overall.unref();
process.on("SIGINT", () => finish(130));
process.on("SIGTERM", () => finish(143));

function start(args, opts = {}) {
  const c = spawn(process.execPath, args, { detached: true, stdio: ["ignore", "pipe", "pipe"], ...opts });
  kids.push(c);
  return c;
}

async function main() {
  const srv = start([join(WORKER_DIR, "mock-server.mjs"), "0"]);
  srv.stderr.on("data", (d) => process.stderr.write(`[mock] ${d}`));
  const port = await new Promise((res, rej) => {
    let buf = "";
    srv.stdout.on("data", (d) => { buf += d; const m = buf.match(/ready (\d+)/); if (m) res(+m[1]); });
    srv.on("exit", () => rej(new Error("mock-server thoát sớm")));
  });
  const BASE = `http://127.0.0.1:${port}`;
  console.log(`mock-server pid ${srv.pid} port ${port}`);

  const call = async (action, body = {}) => {
    const r = await fetch(`${BASE}/functions/v1/bone-studio`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer test-token", apikey: "x" }, body: JSON.stringify({ action, ...body }) });
    const j = await r.json();
    if (!j.ok) throw new Error(`${action}: ${j.error?.code} ${j.error?.message}`);
    return j;
  };

  // bundle from samples/robo
  const doc = JSON.parse(readFileSync(join(SAMPLE, "doc.json"), "utf8"));
  const images = {};
  const walk = (d) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else if (n.endsWith(".png")) images[relative(join(SAMPLE, "images"), f).replace(/\\/g, "/").replace(/\.png$/, "")] = "data:image/png;base64," + readFileSync(f).toString("base64"); } };
  walk(join(SAMPLE, "images"));
  const bundle = JSON.stringify({ doc, images });
  const up = (await call("upload_urls", { files: [{ name: "bundle.json", type: "application/json", size: bundle.length }] })).files[0];
  const put = await fetch(up.uploadUrl, { method: "PUT", headers: { "content-type": "application/json" }, body: bundle });
  if (!put.ok) throw new Error(`PUT bundle ${put.status}`);

  const { job } = await call("submit", { prompt: "thêm bone agent-bone và animation agent-wave", title: "test mock", project: up.path, params: { only_worker: WID } });
  console.log(`job ${job.id}`);

  workDir = mkdtempSync(join(tmpdir(), "bone-test-"));
  const wk = start([join(WORKER_DIR, "worker.mjs"), "--once", "--id", WID, "--poll", "0.3", "--work-dir", workDir, "--claude-bin", join(WORKER_DIR, "fake-claude.mjs"), "--model", "sonnet"], {
    env: { ...process.env, BONE_SUPABASE_URL: BASE, BONE_ANON_KEY: "x", BONE_WORKER_KEY: "k" },
  });
  let wlog = "";
  wk.stdout.on("data", (d) => { wlog += d; });
  wk.stderr.on("data", (d) => { wlog += d; });
  const wexit = new Promise((r) => wk.on("exit", r));
  console.log(`worker pid ${wk.pid}`);

  // poll `events` like the page does
  const seen = new Map(); // seq -> { ev, at }
  let since = 0, last = null;
  for (;;) {
    const r = await call("events", { id: job.id, since });
    const at = Date.now();
    for (const ev of r.events) { if (!seen.has(ev.seq)) seen.set(ev.seq, { ev, at }); since = Math.max(since, ev.seq); }
    last = r.job;
    if (["done", "failed", "canceled"].includes(last.status) && !r.events.length) break;
    await sleep(100);
  }
  await Promise.race([wexit, sleep(5000)]);

  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };
  const all = [...seen.values()];
  const cmds = all.filter((x) => x.ev.kind === "cmds");
  console.log(`events: ${all.map((x) => x.ev.kind).join(",")}`);
  ok(last.status === "done", `job status ${last.status} (${last.error ?? ""})`);
  ok(cmds.length >= 3, `chỉ ${cmds.length} event cmds (cần >= 3)`);
  const times = cmds.map((x) => x.at);
  ok(new Set(times).size >= 3 && times.at(-1) - times[0] >= 500, `event cmds không đến rải rác theo thời gian: ${times.map((t) => t - times[0]).join(",")} ms`);
  ok(all.every((x, i) => x.ev.seq === i + 1), "seq không liền mạch từ 1");

  let finalDoc = null;
  if (last.result?.doc) {
    const r = await fetch(`${BASE}/storage/v1/object/public/bone/${last.result.doc}`);
    ok(r.ok, `tải doc cuối lỗi ${r.status}`);
    if (r.ok) finalDoc = await r.json();
  } else ok(false, "result.doc trống");
  ok(finalDoc?.bones?.some((b) => b.name === "agent-bone"), "doc cuối không có bone agent-bone");
  ok(!!finalDoc?.animations?.["agent-wave"], "doc cuối không có animation agent-wave");

  // latency: i-th cmds line in events.ndjson vs i-th cmds event first visible
  const lines = readFileSync(join(workDir, "jobs", job.id, "events.ndjson"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.kind === "cmds");
  ok(lines.length === cmds.length, `events.ndjson có ${lines.length} dòng cmds, nhận ${cmds.length} event`);
  const lat = lines.map((l, i) => (cmds[i] ? cmds[i].at - l.t : NaN)).filter((x) => !isNaN(x)).sort((a, b) => a - b);
  if (lat.length) console.log(`latency events.ndjson -> hiện trong events (ms): min ${lat[0]} / trung vị ${lat[lat.length >> 1]} / max ${lat.at(-1)}  (n=${lat.length})`);
  ok(lat.length && lat.at(-1) < 3000, `latency quá cao: ${lat.at(-1)} ms`);

  if (fails.length) { console.error("--- worker log ---\n" + wlog.split("\n").slice(-30).join("\n")); return finish(1, "FAIL:\n- " + fails.join("\n- ")); }
  console.log("PASS");
  finish(0);
}
main().catch((e) => finish(1, `FAIL: ${e.stack ?? e}`));
