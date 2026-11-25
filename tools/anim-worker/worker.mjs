#!/usr/bin/env node
// Xưởng Anim worker: một tiến trình mỗi máy/tài khoản. Hợp đồng API: docs/anim-studio.md.
// Việc gen do CLI engine (ANIM_ENGINE_CMD, mặc định ~/anim-studio/bin/anim-gen) làm; worker chỉ điều phối, ép trần bộ nhớ,
// viết lại prompt bằng `claude -p`, đẩy tiến độ và tải khung hình lên.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, extname, join, resolve } from "node:path";

const WIN = process.platform === "win32";
const argv = process.argv.slice(2), A = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) continue;
  const k = argv[i].slice(2);
  if (k === "once") A.once = true;
  else A[k] = argv[++i];
}
const env = process.env;
const WORKER_ID = A.id ?? env.ANIM_WORKER_ID ?? `${hostname()}:claude`;
const ACCOUNT = A.account ?? env.ANIM_ACCOUNT ?? WORKER_ID.split(":")[1] ?? "claude";
const HOST = WORKER_ID.split(":")[0];
const LABEL = A.label ?? env.ANIM_LABEL ?? WORKER_ID;
// min_free_gb: trần RAM (Linux MemAvailable) hoặc commit (Windows FreeVirtualMemory); VRAM có trần riêng.
const LOCAL_MIN_RAM = A["min-free-gb"] ?? env.ANIM_MIN_FREE_GB;   // có giá trị thì ghi đè cấu hình từ server (dùng khi test)
const MIN_VRAM = +(A["min-free-vram"] ?? env.ANIM_MIN_FREE_VRAM_GB ?? 6);
const DEFAULTS = {
  priority: +(A.priority ?? env.ANIM_PRIORITY ?? 0),
  claim_delay_s: +(A.delay ?? env.ANIM_DELAY ?? 0),
  max_minutes: +(A["max-minutes"] ?? env.ANIM_MAX_MINUTES ?? 30),
  engine_default: A.engine ?? env.ANIM_ENGINE ?? "auto",
  min_free_gb: +(LOCAL_MIN_RAM ?? 20),
};
const WORK_DIR = resolve(A["work-dir"] ?? env.ANIM_WORK_DIR ?? join(homedir(), "anim-worker"));
const CONFIG_DIR = A["config-dir"] ?? env.ANIM_CONFIG_DIR ?? null;
const POLL_MS = +(A.poll ?? env.ANIM_POLL ?? 4) * 1000;
const ONCE = !!A.once;
const ENGINE_CMD = A["engine-cmd"] ?? env.ANIM_ENGINE_CMD ?? join(homedir(), "anim-studio", "bin", WIN ? "anim-gen.cmd" : "anim-gen");
const SUPABASE_URL = env.ANIM_SUPABASE_URL ?? "https://jvdguaecnllejdmgytia.supabase.co";
const ANON = env.ANIM_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZGd1YWVjbmxsZWpkbWd5dGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDM3MTAsImV4cCI6MjEwMDgxOTcxMH0.oo1rodkh8_c7tBa-jptqHfemxmY9h8Q_r8DYrUYL9AI";
const WORKER_KEY = env.ANIM_WORKER_KEY ?? (() => {
  try { return readFileSync(join(homedir(), ".anim-worker-key"), "utf8").trim(); } catch { return ""; }
})();
const CLAUDE_BIN = (() => {
  const b = A["claude-bin"] ?? env.ANIM_CLAUDE_BIN ?? "claude";
  if (b === "claude" && WIN) {
    const p = join(homedir(), ".local", "bin", "claude.exe");
    if (existsSync(p)) return p;
  }
  return b;
})();
const LOG_FILE = join(WORK_DIR, `worker-${ACCOUNT}.log`);
const FN = `${SUPABASE_URL}/functions/v1/anim-studio`;
const STAGES = ["setup", "rewriting", "load", "sample", "decode", "frames", "bg", "uploading"];

mkdirSync(WORK_DIR, { recursive: true });
if (!WORKER_KEY || !ANON) { console.error("thiếu ANIM_WORKER_KEY (~/.anim-worker-key) hoặc anon key"); process.exit(2); }

function log(msg) {
  const line = `${new Date().toISOString()} [${WORKER_ID}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + "\n"); } catch {}
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

let config = { ...DEFAULTS, enabled: true };
async function api(action, body = {}, timeoutMs = 30000) {
  const r = await fetch(FN, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json", "x-anim-worker-key": WORKER_KEY },
    body: JSON.stringify({ action, ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await r.json().catch(() => ({ ok: false, error: { code: "bad_json", message: `HTTP ${r.status}` } }));
  if (!j.ok) throw new Error(`${action}: ${j.error?.code ?? r.status} ${j.error?.message ?? ""}`.trim());
  if (j.config) config = { ...config, ...j.config };
  return j;
}

// ---- tiến trình con ---------------------------------------------------------------------------
const kids = new Set();
function killTree(child) {
  if (!child.pid) return;
  try {
    if (WIN) spawn("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore", windowsHide: true });
    else process.kill(-child.pid, "SIGKILL");
  } catch { try { child.kill("SIGKILL"); } catch {} }
}
const killAll = () => kids.forEach(killTree);

function run(cmd, args, { cwd, input, timeout = 60000, extraEnv, shell = false, onLine, onChild } = {}) {
  return new Promise((done) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: { ...env, ...extraEnv }, shell, windowsHide: true, detached: !WIN, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) { return done({ code: -1, out: "", err: String(e), timedOut: false }); }
    kids.add(child);
    if (onChild) onChild(child);
    let out = "", err = "", timedOut = false, buf = "", finished = false;
    const cap = (s, add) => (s + add).slice(-100000);
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeout);
    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      kids.delete(child);
      if (onLine && buf.trim()) onLine(buf);
      done({ code, out, err, timedOut });
    };
    child.stdout.on("data", (d) => {
      const s = d.toString();
      out = cap(out, s);
      if (onLine) {
        buf += s;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) onLine(l); }
      }
    });
    child.stderr.on("data", (d) => { err = cap(err, d.toString()); });
    child.stdin.on("error", () => {});
    child.on("error", (e) => { err += String(e); finish(-1); });
    child.on("close", (code) => finish(code ?? -1));
    child.stdin.end(input ?? "");
  });
}

// ---- trần bộ nhớ: máy dùng chung, hết commit là tiến trình khác chết ---------------------------
function ramFreeGb() {
  try {
    if (!WIN) {
      const m = readFileSync("/proc/meminfo", "utf8").match(/MemAvailable:\s+(\d+) kB/);
      return m ? +m[1] / 1048576 : null;
    }
    // commit còn trống = FreeVirtualMemory (KB), không phải RAM trống
    const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory"], { encoding: "utf8", windowsHide: true, timeout: 15000 });
    const kb = parseInt(r.stdout, 10);
    return Number.isFinite(kb) ? kb / 1048576 : null;
  } catch { return null; }
}
function vramFreeGb() {
  try {
    const r = spawnSync("nvidia-smi", ["--query-gpu=memory.free", "--format=csv,noheader,nounits"], { encoding: "utf8", windowsHide: true, timeout: 15000 });
    if (r.error || r.status !== 0) return null;
    const v = r.stdout.split(/\r?\n/).map((s) => parseFloat(s)).filter(Number.isFinite);
    return v.length ? Math.max(...v) / 1024 : null;
  } catch { return null; }
}
/** null = đủ chỗ; chuỗi = lý do thiếu. Không đo được (không có nvidia-smi...) thì bỏ qua mục đó. */
function memoryGate() {
  const minRam = +(LOCAL_MIN_RAM ?? config.min_free_gb ?? 20);
  const ram = ramFreeGb(), vram = vramFreeGb();
  const what = WIN ? "commit" : "RAM";
  if (ram !== null && ram < minRam) return `${what} trống ${ram.toFixed(1)} GB < ${minRam} GB`;
  if (vram !== null && MIN_VRAM > 0 && vram < MIN_VRAM) return `VRAM trống ${vram.toFixed(1)} GB < ${MIN_VRAM} GB`;
  return null;
}

// ---- trạng thái -------------------------------------------------------------------------------
let state = "idle", stateUntil = 0, stateNote = "", shutdown = false;
function setState(s, note = "", ms = 0) {
  if (s !== state) log(`state ${state} -> ${s}${note ? ` (${note})` : ""}`);
  state = s; stateNote = note; stateUntil = ms ? Date.now() + ms : 0;
}
const hbStatus = () => (state === "working" ? "busy" : state === "auth" ? "paused" : state);
async function heartbeat(jobId) {
  const r = await api("heartbeat", { worker_id: WORKER_ID, status: hbStatus(), note: stateNote || undefined, job_id: jobId });
  return r.job_status;
}

// ---- file -------------------------------------------------------------------------------------
const pub = (path) => `${SUPABASE_URL}/storage/v1/object/public/anim/${path}`;
async function download(url, file) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`tải ${url} lỗi ${r.status}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
async function putFile(uploadUrl, file, type) {
  const body = readFileSync(file);
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": type }, body, signal: AbortSignal.timeout(120000) });
      if (r.ok) return;
      if (i === 2) throw new Error(`PUT lỗi ${r.status}`);
    } catch (e) { if (i === 2) throw e; }
    await sleep(1500 * (i + 1));
  }
}
function splitCmd(s) {
  const out = [];
  for (const m of String(s).matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

// ---- viết lại prompt --------------------------------------------------------------------------
const REWRITE_RULES = `You rewrite a game artist's short motion request (Vietnamese or English) into ONE English prompt for an image-to-video model that animates a single character image.
Rules: describe only the motion of the subject, in present tense, in 1 or 2 short sentences (under 40 words). The subject stays in place; the camera is static; the background stays unchanged; no scene cuts, no zoom, no new objects or characters. Keep the art style implied by the image. If the request asks for a loop (idle, breathing, walk cycle in place), say the motion returns smoothly to its start pose. Output the prompt only: no quotes, no preface, no markdown.`;
async function rewritePrompt(text) {
  const viaNode = /\.(mjs|js)$/.test(CLAUDE_BIN);
  const args = ["-p", "--model", "haiku", "--setting-sources", "project,local", "--append-system-prompt", REWRITE_RULES];
  const r = await run(viaNode ? process.execPath : CLAUDE_BIN, viaNode ? [CLAUDE_BIN, ...args] : args, {
    cwd: WORK_DIR, input: text, timeout: 90000, extraEnv: CONFIG_DIR ? { CLAUDE_CONFIG_DIR: CONFIG_DIR } : {},
  });
  const out = r.out.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, " ");
  if (r.code !== 0 || r.timedOut || !out || out.length > 600) throw new Error(`claude -p ${r.timedOut ? "quá giờ" : "lỗi " + r.code}: ${(r.err || r.out).trim().slice(-160)}`);
  return out;
}

// ---- một job ----------------------------------------------------------------------------------
async function runJob(job) {
  const jobDir = join(WORK_DIR, "jobs", job.id), outDir = join(jobDir, "out");
  const T0 = Date.now(), par = job.params ?? {};
  let stage = "setup", aborted = null, lastSent = 0, pend = null, promptEn = null, engineChild = null;
  const setStage = (s) => { if (STAGES.includes(s) && s !== stage) { stage = s; log(`stage ${s}`); } };
  const noteStatus = (st) => { if ((st === "canceled" || st === "lost") && !aborted) { aborted = st; log(`job ${st}: dừng engine`); killAll(); } };
  const say = (o) => { pend = { ...(pend ?? {}), ...o }; };

  const flush = async () => {
    if (!pend) return;
    const p = pend; pend = null; lastSent = Date.now();
    try {
      noteStatus((await api("progress", { worker_id: WORKER_ID, job_id: job.id, stage: p.stage ?? stage, step: p.step, total: p.total, msg: p.msg, prompt_en: p.prompt_en })).job_status);
    } catch (e) { log(`progress lỗi: ${e.message}`); }
  };
  let ticks = 0, busy = false;
  const ticker = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      ticks++;
      if (Date.now() - lastSent >= 2000) await flush();
      if (ticks % 20 === 0) { try { noteStatus(await heartbeat(job.id)); } catch (e) { log(`heartbeat lỗi: ${e.message}`); } }
    } finally { busy = false; }
  }, 1000);
  const fail = async (error, requeue = false) => {
    log(`fail${requeue ? " (requeue)" : ""}: ${error}`);
    try { await api("fail", { worker_id: WORKER_ID, job_id: job.id, error: String(error).slice(0, 500), requeue }); } catch (e) { log(`fail lỗi: ${e.message}`); }
  };

  try {
    rmSync(jobDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    say({ stage: "setup", msg: "chuẩn bị máy gen, tải ảnh" });
    await flush();
    const ext = extname(job.image?.path ?? "").toLowerCase() || ".png";
    const inFile = join(jobDir, "in" + ext);
    await download(pub(job.image.path), inFile);

    // 1. viết lại prompt
    let prompt = job.prompt;
    if (par.rewrite !== false) {
      setStage("rewriting"); say({ stage: "rewriting", msg: "viết lại mô tả thành prompt chuyển động tiếng Anh" }); await flush();
      try {
        promptEn = await rewritePrompt(job.prompt);
        prompt = promptEn;
        say({ prompt_en: promptEn, msg: `prompt: ${promptEn}` });
      } catch (e) { log(`rewrite lỗi, dùng nguyên văn: ${e.message}`); say({ msg: "không viết lại được prompt, dùng nguyên văn" }); }
      await flush();
    }
    if (aborted) return;

    // 2. engine
    const engine = par.engine && par.engine !== "auto" ? par.engine : (config.engine_default ?? "auto");
    const seed = Number.isInteger(par.seed) ? par.seed : Math.floor(Math.random() * 2147483647);
    const seconds = par.seconds ?? 2;
    const [bin, ...pre] = splitCmd(ENGINE_CMD);
    const eargs = [...pre, "--engine", engine, "--image", inFile, "--prompt", prompt, "--seconds", String(seconds), "--seed", String(seed)];
    if (Number.isInteger(par.steps)) eargs.push("--steps", String(par.steps));
    if (par.remove_bg) eargs.push("--remove-bg");
    eargs.push("--out", outDir);
    log(`engine: ${bin} ${eargs.join(" ")}`);
    setStage("load"); say({ stage: "load", msg: `engine ${engine}, ${seconds} s, seed ${seed}` });
    const limit = Math.max(120000, T0 + config.max_minutes * 60000 - Date.now());
    const er = await run(bin, eargs, {
      cwd: jobDir, timeout: limit, shell: WIN && /\.(cmd|bat)$/i.test(bin), extraEnv: { PYTHONUNBUFFERED: "1" }, onChild: (c) => { engineChild = c; },
      onLine: (line) => {
        let j; try { j = JSON.parse(line); } catch { return; }
        if (!j || typeof j !== "object") return;
        if (STAGES.includes(j.stage)) setStage(j.stage);
        say({ stage: stage, step: Number.isFinite(j.step) ? j.step : undefined, total: Number.isFinite(j.total) ? j.total : undefined, msg: j.msg ? String(j.msg).slice(0, 300) : undefined });
      },
    });
    engineChild = null;
    if (aborted) return;
    if (shutdown) return await fail("máy gen tắt", true);
    if (er.timedOut) return await fail(`engine quá ${config.max_minutes} phút`);
    if (er.code !== 0) {
      const last = er.err.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
      return await fail(`engine thoát mã ${er.code}: ${last.slice(0, 300) || "không có thông báo lỗi"}`);
    }
    await flush();

    // 3. đọc kết quả
    const metaFile = join(outDir, "meta.json"), framesDir = join(outDir, "frames"), videoFile = join(outDir, "video.mp4");
    if (!existsSync(metaFile)) return await fail("engine không ghi meta.json");
    let meta;
    try { meta = JSON.parse(readFileSync(metaFile, "utf8")); } catch (e) { return await fail(`meta.json hỏng: ${e.message}`); }
    const frames = existsSync(framesDir) ? readdirSync(framesDir).filter((f) => /\.png$/i.test(f)).sort() : [];
    if (!frames.length) return await fail("engine không ghi khung hình nào vào frames/");
    if (frames.length > 200) return await fail(`${frames.length} khung, quá giới hạn 200`);

    // 4. tải lên
    setStage("uploading"); say({ stage: "uploading", step: 0, total: frames.length, msg: `tải ${frames.length} khung lên` }); await flush();
    const list = [];
    if (existsSync(videoFile)) list.push({ key: "video", file: videoFile, name: "video.mp4", type: "video/mp4" });
    list.push({ key: "meta", file: metaFile, name: "meta.json", type: "application/json" });
    for (const f of frames) list.push({ key: "frame", file: join(framesDir, f), name: `frames/${f}`, type: "image/png" });
    const urls = (await api("upload_urls", { job_id: job.id, files: list.map(({ name, type }) => ({ name, type })) }, 60000)).files;
    let done = 0, next = 0;
    const lane = async () => {
      while (next < list.length && !aborted) {
        const i = next++;
        await putFile(urls[i].uploadUrl, list[i].file, list[i].type);
        list[i].path = urls[i].path;
        if (list[i].key === "frame") { done++; say({ stage: "uploading", step: done, total: frames.length }); }
      }
    };
    const t1 = Date.now();
    await Promise.all(Array.from({ length: 6 }, lane));
    if (aborted) return;
    log(`tải lên ${list.length} file (${list.reduce((s, x) => s + statSync(x.file).size, 0)} B) ${Date.now() - t1} ms`);
    await flush();
    const result = {
      engine: meta.engine ?? engine, fps: meta.fps, width: meta.width, height: meta.height, frames: frames.length,
      seconds: meta.seconds ?? seconds, seed: meta.seed ?? seed, timings: meta.timings ?? {},
      files: {
        video: list.find((x) => x.key === "video")?.path ?? null,
        meta: list.find((x) => x.key === "meta").path,
        frames: list.filter((x) => x.key === "frame").map((x) => x.path),
      },
    };
    await api("complete", { worker_id: WORKER_ID, job_id: job.id, result }, 60000);
    log(`xong ${frames.length} khung sau ${Math.round((Date.now() - T0) / 1000)} s`);
    rmSync(jobDir, { recursive: true, force: true });
  } catch (e) {
    if (!aborted) await fail(`worker lỗi: ${e.message ?? e}`, shutdown);
  } finally {
    clearInterval(ticker);
    if (engineChild) killTree(engineChild);
  }
}

// ---- vòng chính -------------------------------------------------------------------------------
async function hello() {
  for (let delay = 2000; !shutdown; delay = Math.min(delay * 2, 60000)) {
    try {
      await api("hello", { worker: { id: WORKER_ID, label: LABEL, host: HOST, account: ACCOUNT, defaults: DEFAULTS } });
      log(`hello ok, config ${JSON.stringify(config)}`);
      return;
    } catch (e) { log(`hello lỗi: ${e.message}, thử lại sau ${delay / 1000} s`); await sleep(delay); }
  }
}
function onSignal(sig) {
  if (shutdown) process.exit(1);
  shutdown = true;
  log(`nhận ${sig}`);
  if (state === "working") killAll();
  else process.exit(0);
}
process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));

async function main() {
  log(`khởi động: work-dir ${WORK_DIR}, engine ${ENGINE_CMD}, claude ${CLAUDE_BIN}, config-dir ${CONFIG_DIR ?? "(mặc định)"}`);
  await hello();
  let lastHb = 0, errs = 0;
  while (!shutdown) {
    try {
      if (state === "quota" || state === "auth") {
        if (Date.now() < stateUntil) {
          if (Date.now() - lastHb > 15000) { lastHb = Date.now(); await heartbeat(); }
          await sleep(2000);
          continue;
        }
        setState("idle");
      }
      if (config.enabled === false) {
        if (state !== "paused") setState("paused", "tắt từ trang admin");
        await heartbeat(); lastHb = Date.now();
        await sleep(POLL_MS * 2);
        continue;
      }
      if (state === "paused") setState("idle");
      // trần bộ nhớ trước MỖI lần nhận job
      const low = memoryGate();
      if (low) {
        if (state !== "lowmem" || stateNote !== low) setState("lowmem", low);
        await heartbeat(); lastHb = Date.now();
        await sleep(POLL_MS * 2);
        continue;
      }
      if (state === "lowmem") { setState("idle"); await heartbeat(); lastHb = Date.now(); }
      const { job } = await api("claim", { worker_id: WORKER_ID });
      errs = 0;
      if (!job) {
        if (Date.now() - lastHb > 15000) { lastHb = Date.now(); await heartbeat(); }
        await sleep(POLL_MS);
        continue;
      }
      log(`nhận job ${job.id} "${job.title ?? ""}"`);
      setState("working");
      await runJob(job);
      if (state === "working") setState("idle");
      lastHb = 0;
      if (ONCE) break;
    } catch (e) {
      log(`vòng chính lỗi: ${e.message}`);
      if (++errs % 5 === 0) await hello();
      await sleep(Math.min(POLL_MS * 2 ** Math.min(errs, 4), 60000));
    }
  }
  log("thoát");
  process.exit(0);
}
main();
