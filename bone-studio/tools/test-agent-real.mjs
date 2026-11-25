// One real job through the deployed Edge Function and a real worker (worker key only, no art login):
// upload a project bundle, test_submit with only_worker, follow test_events, replay the commands on the bundle doc,
// compare with the worker's final doc, measure latency, clean up.
// node tools/test-agent-real.mjs [--worker linux:claude] [--sample robo] [--prompt "..."]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { applyAll } from "../src/commands.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const A = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith("--") ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []));
const URL_ = process.env.BONE_SUPABASE_URL ?? "https://jvdguaecnllejdmgytia.supabase.co";
const cfg = readFileSync(join(HERE, "..", "..", "js", "supabase-config.js"), "utf8");
const ANON = process.env.BONE_ANON_KEY ?? cfg.match(/anonKey:\s*"([^"]+)"/)[1];
const KEY = (() => { for (const f of [".bone-worker-key", ".vfx-worker-key"]) { try { return readFileSync(join(homedir(), f), "utf8").trim(); } catch {} } })();
const worker = A.worker ?? "linux:claude", sample = A.sample ?? "robo";
const prompt = A.prompt ?? "Làm animation 'chao' 1 giây, lặp được: bone front-upper-arm giơ lên (xoay khoảng 120 độ so với setup) rồi front-lower-arm vẫy qua lại 2 lần, head nghiêng nhẹ. Nhìn lại bản render trước khi xong.";
const OUT = join(HERE, "..", "..", ".chk", "agent-real");
mkdirSync(OUT, { recursive: true });

async function api(action, body = {}) {
  const r = await fetch(`${URL_}/functions/v1/bone-studio`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json", "x-bone-worker-key": KEY }, body: JSON.stringify({ action, ...body }) });
  const j = await r.json();
  if (!j.ok) throw new Error(`${action}: ${j.error?.code} ${j.error?.message}`);
  return j;
}
const dir = join(HERE, "..", "samples", sample === "pharaoh" ? "pharaoh/project" : "robo");
const doc0 = JSON.parse(readFileSync(join(dir, "doc.json"), "utf8"));
const images = Object.fromEntries(readdirSync(join(dir, "images")).map((f) => [f.replace(/\.png$/, ""), "data:image/png;base64," + readFileSync(join(dir, "images", f)).toString("base64")]));
const up = (await api("upload_urls", { job_id: randomUUID(), files: [{ name: "bundle.json", type: "application/json" }] })).files[0];
let r = await fetch(up.uploadUrl, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc: doc0, images }) });
if (!r.ok) throw new Error("PUT bundle " + r.status);
const { job } = await api("test_submit", { prompt, project: up.path, params: { only_worker: worker, mode: "agent" }, context: { selection: ["front-upper-arm"], anim: null, time: 0 } });
console.log(`job ${job.id} → ${worker}`);
const t0 = Date.now();
let since = 0, doc = doc0, cmdsEvents = 0, failedCmds = 0, status = null;
const lat = [], says = [];
try {
  for (;;) {
    if (Date.now() - t0 > 20 * 60000) throw new Error("quá 20 phút");
    const e = await api("test_events", { id: job.id, since });
    const now = Date.now();
    for (const ev of e.events) {
      since = Math.max(since, ev.seq);
      if (ev.kind === "cmds") { cmdsEvents++; lat.push(now - Date.parse(ev.t)); try { doc = applyAll(doc, ev.data.cmds).doc; } catch (err) { failedCmds++; console.log("lệnh lỗi:", err.message); } }
      if (ev.kind === "say") says.push(ev.data.text);
      if (ev.kind === "stage") console.log(`${Math.round((now - t0) / 1000)} s: ${ev.data.stage}`);
    }
    status = e.job.status;
    if (["done", "failed", "canceled"].includes(status)) {
      const final = e.job.result?.doc ? await (await fetch(`${URL_}/storage/v1/object/public/bone/${e.job.result.doc}`)).json() : null;
      lat.sort((a, b) => a - b);
      const report = {
        job: job.id, status, error: e.job.error ?? null, seconds: Math.round((Date.now() - t0) / 1000), cmdsEvents, failedCmds,
        replayEqualsFinal: final ? JSON.stringify(final) === JSON.stringify(doc) : null,
        newAnimations: Object.keys(doc.animations).filter((a) => !doc0.animations[a]),
        pollLatencyMs: lat.length ? { n: lat.length, min: lat[0], median: lat[lat.length >> 1], max: lat[lat.length - 1] } : null,
      };
      writeFileSync(join(OUT, `report-${job.id}.json`), JSON.stringify({ ...report, says, doc }, null, 1));
      console.log(JSON.stringify(report, null, 1));
      console.log("agent nói:\n" + says.join("\n").slice(-1500));
      const ok = status === "done" && cmdsEvents >= 2 && report.replayEqualsFinal === true && report.newAnimations.length > 0;
      console.log(ok ? "PASS" : "FAIL");
      process.exitCode = ok ? 0 : 1;
      break;
    }
    await new Promise((res) => setTimeout(res, 700));
  }
} finally {
  await api("test_delete", { id: job.id }).catch((e) => console.log("dọn job lỗi:", e.message));
}
