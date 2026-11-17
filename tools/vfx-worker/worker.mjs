#!/usr/bin/env node
// Xưởng VFX worker: one process per Claude account. See docs/vfx-studio.md for the API contract.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WIN = process.platform === "win32";
const HERE = dirname(fileURLToPath(import.meta.url));
const PIXELFX_REPO = "https://github.com/patch-gg/pixelfx", PIXELFX_COMMIT = "5294518";

const argv = process.argv.slice(2), A = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) continue;
  const k = argv[i].slice(2);
  if (k === "once") A.once = true;
  else A[k] = argv[++i];
}
const env = process.env;
const WORKER_ID = A.id ?? env.VFX_WORKER_ID ?? `${hostname()}:claude`;
const ACCOUNT = A.account ?? env.VFX_ACCOUNT ?? WORKER_ID.split(":")[1] ?? "claude";
const HOST = WORKER_ID.split(":")[0];
const LABEL = A.label ?? env.VFX_LABEL ?? WORKER_ID;
const DEFAULTS = {
  priority: +(A.priority ?? env.VFX_PRIORITY ?? 0),
  claim_delay_s: +(A.delay ?? env.VFX_DELAY ?? 0),
  model: A.model ?? env.VFX_MODEL ?? "opus",
  max_minutes: +(A["max-minutes"] ?? env.VFX_MAX_MINUTES ?? 25),
};
const WORK_DIR = resolve(A["work-dir"] ?? env.VFX_WORK_DIR ?? join(homedir(), "vfx-worker"));
const CONFIG_DIR = A["config-dir"] ?? env.VFX_CONFIG_DIR ?? null;
const POLL_MS = +(A.poll ?? env.VFX_POLL ?? 4) * 1000;
const ONCE = !!A.once;
const SUPABASE_URL = env.VFX_SUPABASE_URL ?? "https://jvdguaecnllejdmgytia.supabase.co";
const ANON = env.VFX_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZGd1YWVjbmxsZWpkbWd5dGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDM3MTAsImV4cCI6MjEwMDgxOTcxMH0.oo1rodkh8_c7tBa-jptqHfemxmY9h8Q_r8DYrUYL9AI";
const WORKER_KEY = env.VFX_WORKER_KEY ?? (() => {
  try { return readFileSync(join(homedir(), ".vfx-worker-key"), "utf8").trim(); } catch { return ""; }
})();
const CLAUDE_BIN = (() => {
  const b = A["claude-bin"] ?? env.VFX_CLAUDE_BIN ?? "claude";
  if (b === "claude" && WIN) {
    const p = join(homedir(), ".local", "bin", "claude.exe");
    if (existsSync(p)) return p;
  }
  return b;
})();
const CHECKOUT = join(WORK_DIR, `pixelfx-${ACCOUNT}`);
const LOG_FILE = join(WORK_DIR, `worker-${ACCOUNT}.log`);
const FN = `${SUPABASE_URL}/functions/v1/vfx-studio`;

mkdirSync(WORK_DIR, { recursive: true });
if (!WORKER_KEY || !ANON) { console.error("thiếu VFX_WORKER_KEY (~/.vfx-worker-key) hoặc anon key"); process.exit(2); }

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
    headers: { apikey: ANON, "content-type": "application/json", "x-vfx-worker-key": WORKER_KEY },
    body: JSON.stringify({ action, ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await r.json().catch(() => ({ ok: false, error: { code: "bad_json", message: `HTTP ${r.status}` } }));
  if (!j.ok) throw new Error(`${action}: ${j.error?.code ?? r.status} ${j.error?.message ?? ""}`.trim());
  if (j.config) config = { ...config, ...j.config };
  return j;
}

// ---- process handling -------------------------------------------------------------------------
const kids = new Set();
function killTree(child) {
  if (!child.pid) return;
  try {
    if (WIN) spawn("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore", windowsHide: true });
    else process.kill(-child.pid, "SIGKILL");
  } catch { try { child.kill("SIGKILL"); } catch {} }
}
const killAll = () => kids.forEach(killTree);

function run(cmd, args, { cwd, input, timeout = 60000, extraEnv, shell = false, onLine } = {}) {
  return new Promise((done) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: { ...env, ...extraEnv }, shell, windowsHide: true, detached: !WIN, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) { return done({ code: -1, out: "", err: String(e), timedOut: false }); }
    kids.add(child);
    let out = "", err = "", timedOut = false, buf = "", finished = false;
    const cap = (s, add) => (s + add).slice(-200000);
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
const sh = (cmd, args, o = {}) => run(cmd, args, { ...o, shell: o.shell ?? (WIN && cmd === "npm") });

// ---- state machine ----------------------------------------------------------------------------
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

// ---- pixelfx checkout -------------------------------------------------------------------------
async function setupCheckout() {
  if (!existsSync(join(CHECKOUT, ".git"))) {
    log(`clone pixelfx -> ${CHECKOUT}`);
    let r = await run("git", ["clone", PIXELFX_REPO, CHECKOUT], { timeout: 300000 });
    if (r.code) throw new Error(`git clone lỗi: ${r.err.slice(-300)}`);
    r = await run("git", ["checkout", PIXELFX_COMMIT], { cwd: CHECKOUT, timeout: 60000 });
    if (r.code) throw new Error(`git checkout lỗi: ${r.err.slice(-300)}`);
  }
  if (!existsSync(join(CHECKOUT, "node_modules", "esbuild"))) {
    log("npm ci");
    const r = await sh("npm", ["ci"], { cwd: CHECKOUT, timeout: 600000 });
    if (r.code) throw new Error(`npm ci lỗi: ${(r.err || r.out).slice(-300)}`);
  }
}
async function resetCheckout() {
  rmSync(join(CHECKOUT, "src", "fx", "studio"), { recursive: true, force: true });
  rmSync(join(CHECKOUT, "records", "studio"), { recursive: true, force: true });
  await run("git", ["checkout", "--", "src", "tools", "docs"], { cwd: CHECKOUT, timeout: 60000 });
}

// ---- helpers for one job ----------------------------------------------------------------------
const pub = (path) => `${SUPABASE_URL}/storage/v1/object/public/vfx/${path}`;
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
let ffmpegOk = null;
function hasFfmpeg() {
  if (ffmpegOk === null) ffmpegOk = !spawnSync("ffmpeg", ["-version"], { stdio: "ignore", windowsHide: true }).error;
  return ffmpegOk;
}
async function framesSheet(input, out) {
  let fps = 2;
  const pr = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", input], { timeout: 20000 });
  const dur = parseFloat(pr.out);
  if (dur > 0) fps = 12 / dur;
  const r = await run("ffmpeg", ["-v", "error", "-y", "-i", input, "-vf", `fps=${fps.toFixed(4)},scale=192:-2,tile=4x3`, "-frames:v", "1", out], { timeout: 60000 });
  return r.code === 0 && existsSync(out);
}

function sizeWord(s) {
  return { S: "about 32 px on the longest side (meta.size around [32, 32])", M: "about 64 px on the longest side (meta.size around [64, 64])", L: "about 128 px on the longest side (meta.size around [128, 128])" }[s] ?? "pick the size the effect needs";
}
function direction(job) {
  const p = job.params ?? {}, d = [];
  d.push(`- Size: ${sizeWord(p.size)}.`);
  d.push(p.kind === "oneshot" ? "- Kind: one-shot (meta.loop = false; it must end on an empty frame)." : p.kind === "loop" ? "- Kind: seamless loop (meta.loop = true; no seam at the wrap)." : "- Kind: choose one-shot or loop, whichever fits the request.");
  if (p.duration) d.push(`- Duration: ${p.duration} seconds (meta.duration).`);
  if (p.fps) d.push(`- Frame rate: ${p.fps} fps (meta.fps).`);
  if (Array.isArray(p.palette) && p.palette.length) d.push(`- Palette: use exactly these colours, dark to light, as meta.options.palette: ${JSON.stringify(p.palette)}. Build every ramp from them.`);
  if (p.actor === "yes") d.push("- Actor: yes. Give the module an `act` (see docs/AUTHORING.md) with wind-up, freeze on contact and recovery, so a character performs it.");
  else if (p.actor === "no") d.push("- Actor: no. Make it a pure effect, no `act` export.");
  else d.push("- Actor: your call. Add an `act` only if the request is clearly a character action.");
  if (p.category) d.push(`- Category hint: ${p.category} (study the library effects in src/fx/${p.category}/ first).`);
  return d.join("\n");
}
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : ""));
const ID_RE = /^[a-z0-9-]+\/[a-z0-9-]+$/;
const MIN_ROUNDS = 3;
const UNATTENDED = "You run unattended inside a VFX generation queue; nobody reads your chat. Ignore any personal reply format or output style. Do the task in the user message, then end with one plain English line.";

const TOOL_RUN = (c, tool) => new RegExp(`node\\s+(\\S*/)?tools/${tool}\\.mjs\\s+\\S*studio/`).test(c);
const fxPath = (p) => (String(p).replace(/\\/g, "/").match(/src\/fx\/([\w-]+\/[\w-]+)\.js/) ?? [])[1];

function summarizeTool(b) {
  const i = b.input ?? {}, p = String(i.file_path ?? ""), f = p ? basename(p) : "";
  if (b.name === "Read") {
    if (/[\\/]refs[\\/]/.test(p)) return "xem ảnh tham khảo";
    if (/contact\.png$/.test(p)) return "nhìn contact sheet";
    const fx = fxPath(p);
    return fx && !fx.startsWith("studio/") ? `đọc effect mẫu ${fx}` : `đọc ${f}`;
  }
  if (b.name === "Write" || b.name === "Edit" || b.name === "MultiEdit") return `${b.name === "Write" ? "viết" : "sửa"} ${f}`;
  if (b.name === "Bash") {
    const c = String(i.command ?? "");
    if (TOOL_RUN(c, "render")) return "render bản đang làm";
    if (TOOL_RUN(c, "check")) return "chạy check";
    if (TOOL_RUN(c, "act")) return "xem nhân vật diễn";
    if (/tools\/list\.mjs/.test(c)) return `tìm effect mẫu: ${c.replace(/.*list\.mjs/, "").trim().slice(0, 40)}`;
    return `$ ${c.replace(/\s+/g, " ").slice(0, 70)}`;
  }
  return `dùng ${b.name}`;
}

// ---- one job ----------------------------------------------------------------------------------
async function runJob(job) {
  const slug = `vfx-${job.id.replace(/-/g, "").slice(0, 8)}`, effectId = `studio/${slug}`;
  const jobDir = join(WORK_DIR, "jobs", job.id), refsDir = join(jobDir, "refs");
  const fxFile = join(CHECKOUT, "src", "fx", "studio", `${slug}.js`), recDir = join(CHECKOUT, "records", "studio", slug);
  const T0 = Date.now();
  let stage = "setup", renders = 0, aborted = null, sessionId = null, lastProg = 0, pending = [], previewPath = null, previewMtime = 0;
  const say = (msg) => { if (msg) pending.push(msg); };
  const setStage = (s) => { if (s !== stage) { stage = s; log(`stage ${s}`); } };
  const noteStatus = (st) => { if ((st === "canceled" || st === "lost") && !aborted) { aborted = st; log(`job ${st}: dừng Claude`); killAll(); } };

  const flush = async () => {
    if (!pending.length && !previewPath) return;
    const msg = pending.splice(0).join(" · ").slice(0, 400) || "xem trước mới", preview = previewPath;
    previewPath = null; lastProg = Date.now();
    try { noteStatus((await api("progress", { worker_id: WORKER_ID, job_id: job.id, stage, msg, ...(preview ? { preview } : {}) })).job_status); }
    catch (e) { log(`progress lỗi: ${e.message}`); }
  };
  const uploadLive = async () => {
    const f = join(recDir, "contact.png");
    if (!existsSync(f)) return;
    const m = statSync(f).mtimeMs;
    if (m === previewMtime) return;
    previewMtime = m;
    try {
      const u = (await api("upload_urls", { job_id: job.id, files: [{ name: "live-contact.png", type: "image/png" }] })).files[0];
      await putFile(u.uploadUrl, f, "image/png");
      previewPath = u.path;
    } catch (e) { log(`preview lỗi: ${e.message}`); }
  };
  let ticks = 0, busy = false;
  const ticker = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      ticks++;
      if (Date.now() - lastProg >= 4000) await flush();
      if (ticks % 10 === 0) await uploadLive();
      if (ticks % 20 === 0) { try { noteStatus(await heartbeat(job.id)); } catch (e) { log(`heartbeat lỗi: ${e.message}`); } }
    } finally { busy = false; }
  }, 1000);

  const fail = async (error, requeue = false) => {
    log(`fail${requeue ? " (requeue)" : ""}: ${error}`);
    try { await api("fail", { worker_id: WORKER_ID, job_id: job.id, error: String(error).slice(0, 500), requeue }); } catch (e) { log(`fail lỗi: ${e.message}`); }
  };

  try {
    say("chuẩn bị máy gen");
    await flush();
    await setupCheckout();
    await resetCheckout();
    mkdirSync(refsDir, { recursive: true });
    mkdirSync(dirname(fxFile), { recursive: true });

    const refLines = [];
    for (const [i, r] of (job.refs ?? []).entries()) {
      const local = join(refsDir, `${i}-${basename(r.path).replace(/[^\w.-]/g, "_")}`);
      await download(pub(r.path), local);
      if (r.kind === "image") refLines.push(`- ${local} (image "${r.name ?? ""}")`);
      else if (!hasFfmpeg()) log(`bỏ qua ${r.kind} ${r.name}: không có ffmpeg`);
      else {
        const sheet = join(refsDir, `${i}-frames.png`);
        if (await framesSheet(local, sheet)) refLines.push(`- ${sheet} (frames sheet: up to 12 evenly spaced frames of the ${r.kind} "${r.name ?? ""}", left to right, top to bottom)`);
        else log(`không tách được khung từ ${r.name}`);
      }
    }

    let base = "", parent = "";
    const parentSrc = job.parent?.result?.files?.src;
    if (parentSrc) {
      await download(pub(parentSrc), fxFile);
      parent = `This is a REVISION. The artist's previous version is already at src/fx/studio/${slug}.js (id ${effectId}). Read it, then change it according to the feedback in the request. Keep everything the artist did not complain about. Do not start over.`;
    } else if (job.base_effect && ID_RE.test(job.base_effect)) {
      const src = join(CHECKOUT, "src", "fx", `${job.base_effect}.js`), cat = job.base_effect.split("/")[0];
      if (existsSync(src)) {
        const code = readFileSync(src, "utf8").replace(/(from\s*|import\s*\(\s*)(["'])\.\/([^"']+)\2/g, `$1$2../${cat}/$3$2`);
        writeFileSync(fxFile, code);
        base = `Start from the library effect ${job.base_effect}: it is already copied to src/fx/studio/${slug}.js with its relative imports rewritten to ../${cat}/. Change it into what the artist asks for; rename meta.name and meta.desc.`;
      } else log(`base_effect ${job.base_effect} không tồn tại, bỏ qua`);
    }

    const brief = fill(readFileSync(join(HERE, "brief.md"), "utf8"), {
      slug, effect_id: effectId, title: job.title ?? "", request: job.prompt ?? "", direction: direction(job),
      refs: refLines.length ? "Reference images (open each with the Read tool and study it before drafting):\n" + refLines.join("\n") : "No reference images.",
      base, parent,
    });
    writeFileSync(join(jobDir, "brief.txt"), brief);

    const viaNode = /\.(mjs|js)$/.test(CLAUDE_BIN);
    const claudeCmd = viaNode ? process.execPath : CLAUDE_BIN;
    const claudeArgs = (extra = []) => {
      const a = ["-p", "--model", config.model, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions",
        "--setting-sources", "project,local", "--append-system-prompt", UNATTENDED, ...extra];
      return viaNode ? [CLAUDE_BIN, ...a] : a;
    };
    const childEnv = { ...(CONFIG_DIR ? { CLAUDE_CONFIG_DIR: CONFIG_DIR } : {}) };

    const runClaude = async (input, extra = []) => {
      let result = null;
      const left = Math.max(180000, T0 + config.max_minutes * 60000 - Date.now());
      const r = await run(claudeCmd, claudeArgs(extra), {
        cwd: CHECKOUT, input, timeout: left, extraEnv: childEnv,
        onLine: (line) => {
          let j; try { j = JSON.parse(line); } catch { return; }
          if (j.type === "system" && j.session_id) sessionId = j.session_id;
          if (j.type === "result") { result = j; if (j.session_id) sessionId = j.session_id; }
          if (j.type !== "assistant") return;
          for (const b of j.message?.content ?? []) {
            if (b.type === "text" && b.text?.trim()) say(b.text.trim().slice(0, 200));
            if (b.type === "tool_use") {
              say(summarizeTool(b));
              const c = String(b.input?.command ?? ""), f = String(b.input?.file_path ?? "");
              if (/^(Write|Edit|MultiEdit)$/.test(b.name) && f.includes("studio") && stage === "setup") setStage("drafting");
              if (b.name === "Bash" && TOOL_RUN(c, "render")) { renders++; setStage("refining"); say(`vòng nhìn-sửa thứ ${renders}`); }
              if (b.name === "Bash" && TOOL_RUN(c, "check")) setStage("checking");
            }
          }
        },
      });
      return { ...r, result };
    };
    const stopped = async () => {
      if (aborted) return true;
      if (shutdown) { await fail("máy gen tắt", true); return true; }
      return false;
    };
    const timeoutMsg = () => `quá ${config.max_minutes} phút`;

    say(`bắt đầu vẽ ${effectId}`);
    let c = await runClaude(brief);
    if (await stopped()) return;
    if (c.timedOut) return await fail(timeoutMsg());
    const tail = `${c.result?.result ?? ""}\n${c.err}\n${c.out.slice(-1500)}`;
    if (c.code !== 0 || c.result?.is_error) {
      if (/\/login|\b401\b|not logged in|invalid api key|authentication_error/i.test(tail)) {
        setState("auth", `cần /login cho ${ACCOUNT}`, 10 * 60000);
        return await fail(`tài khoản ${ACCOUNT} cần đăng nhập`, true);
      }
      if (/usage limit|rate.?limit|\b429\b|overloaded|limit reached|quota/i.test(tail)) {
        let until = Date.now() + 15 * 60000;
        const ep = tail.match(/\|(\d{10})\b/);
        const tm = tail.match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (ep) until = +ep[1] * 1000;
        else if (tm) {
          const h = tm[3] ? (+tm[1] % 12) + (/pm/i.test(tm[3]) ? 12 : 0) : +tm[1] % 24;
          const d = new Date(); d.setHours(h, +(tm[2] ?? 0), 0, 0);
          if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
          until = d.getTime();
        }
        until = Math.min(Math.max(until, Date.now() + 60000), Date.now() + 6 * 3600000);
        setState("quota", `hết hạn mức, thử lại lúc ${hhmm(new Date(until))}`, until - Date.now());
        return await fail("hết hạn mức Claude", true);
      }
    }
    if (!existsSync(fxFile)) return await fail(`Claude không ghi ra ${basename(fxFile)}: ${String(c.result?.result || c.err || "không có đầu ra").slice(0, 300)}`);

    for (let nudge = 0; renders < MIN_ROUNDS && nudge < 2 && sessionId && !aborted && !shutdown; nudge++) {
      say(`mới ${renders} vòng nhìn-sửa, bắt làm đủ ${MIN_ROUNDS}`);
      c = await runClaude(`You stopped after ${renders} render-look-fix round(s); the bar is at least ${MIN_ROUNDS}. Render ${effectId} again, open records/studio/${slug}/contact.png, judge it like a picky pixel artist against the request (read, timing, silhouette at 1x, palette discipline, clean ending or seamless loop), fix the worst thing, and repeat until you have done ${MIN_ROUNDS} rounds in total. Then stop with a one-line summary.`, ["--resume", sessionId]);
      if (await stopped()) return;
      if (c.timedOut) return await fail(timeoutMsg());
    }

    setStage("checking"); say("kiểm tra check.mjs");
    const doCheck = async () => {
      const r = await run(process.execPath, ["tools/check.mjs", effectId], { cwd: CHECKOUT, timeout: 120000 });
      const text = `${r.out}\n${r.err}`;
      return { clean: r.code === 0 && !r.timedOut && !/^(warn|FAIL)\b/m.test(text), text: text.trim().slice(-3000) };
    };
    let ck = await doCheck();
    if (!ck.clean && sessionId && !aborted && !shutdown) {
      say("check chưa sạch, nhờ Claude sửa");
      setStage("refining");
      const fixPrompt = `node tools/check.mjs ${effectId} is not clean. Output:\n\n${ck.text}\n\nFix src/fx/studio/${slug}.js so the check passes with no warnings, re-render once to confirm, delete any temporary drafts in src/fx/studio/, then stop.`;
      c = await runClaude(fixPrompt, ["--resume", sessionId]);
      if (await stopped()) return;
      if (c.timedOut) return await fail(timeoutMsg());
      setStage("checking");
      ck = await doCheck();
    }
    if (!ck.clean) log(`CẢNH BÁO: check chưa sạch sau lần sửa: ${ck.text.slice(-400)}`);
    if (!existsSync(fxFile)) return await fail("file effect biến mất sau khi sửa");

    setStage("rendering"); say("render GIF, sprite sheet, bundle");
    await flush();
    const rr = await run(process.execPath, ["tools/render.mjs", effectId, "--sheet", ...(hasFfmpeg() ? ["--gif"] : [])], { cwd: CHECKOUT, timeout: 180000 });
    if (rr.code !== 0) return await fail(`render lỗi: ${(rr.err || rr.out).slice(-300)}`);

    const metaRun = await run(process.execPath, ["--input-type=module", "-e",
      'import {pathToFileURL} from "node:url";const m=await import(pathToFileURL(process.argv[1]).href);console.log("@@META"+JSON.stringify({meta:m.meta,hasAct:!!m.act}))', fxFile], { cwd: CHECKOUT, timeout: 30000 });
    const mm = metaRun.out.match(/@@META(.*)/);
    if (!mm) return await fail(`đọc meta lỗi: ${(metaRun.err || metaRun.out).slice(-300)}`);
    const { meta, hasAct } = JSON.parse(mm[1]);

    const actGif = join(recDir, "act.gif");
    if (hasAct && hasFfmpeg()) {
      const ar = await run(process.execPath, ["tools/act.mjs", effectId, "--mp4", "--out", actGif], { cwd: CHECKOUT, timeout: 180000 });
      if (ar.code !== 0) log(`act gif lỗi: ${(ar.err || ar.out).slice(-200)}`);
    }

    const entry = join(CHECKOUT, `.vfx-entry-${slug}.mjs`), bundleFile = join(jobDir, `${slug}.bundle.js`);
    writeFileSync(entry, `export * as fx from "./src/fx/studio/${slug}.js"; export * from "./src/core/index.js";\n`);
    const build = `require("esbuild").buildSync(${JSON.stringify({ entryPoints: [entry], bundle: true, format: "esm", minify: true, legalComments: "none", outfile: bundleFile })})`;
    const er = await run(process.execPath, ["-e", build], { cwd: CHECKOUT, timeout: 120000 });
    rmSync(entry, { force: true });
    if (er.code !== 0 || !existsSync(bundleFile)) return await fail(`bundle lỗi: ${(er.err || er.out).slice(-300)}`);

    setStage("uploading"); say("tải kết quả lên");
    const candidates = [
      ["src", fxFile, `${slug}.js`, "text/javascript"],
      ["bundle", bundleFile, `${slug}.bundle.js`, "text/javascript"],
      ["gif", join(recDir, "anim.gif"), "anim.gif", "image/gif"],
      ["contact", join(recDir, "contact.png"), "contact.png", "image/png"],
      ["sheet_png", join(recDir, `${slug}.png`), `${slug}.png`, "image/png"],
      ["sheet_json", join(recDir, `${slug}.json`), `${slug}.json`, "application/json"],
      ["act_gif", actGif, "act.gif", "image/gif"],
    ].filter(([, f]) => existsSync(f));
    const urls = (await api("upload_urls", { job_id: job.id, files: candidates.map(([, , name, type]) => ({ name, type })) })).files;
    const files = {};
    for (const [i, [key, f, , type]] of candidates.entries()) {
      const t1 = Date.now();
      await putFile(urls[i].uploadUrl, f, type);
      log(`tải lên ${key} (${statSync(f).size} B) ${Date.now() - t1} ms`);
      files[key] = urls[i].path;
    }
    if (aborted) return;
    await flush();
    const result = {
      effect_id: effectId, name: meta.name, desc: meta.desc,
      meta: { size: meta.size, origin: meta.origin, duration: meta.duration, loop: !!meta.loop, fps: meta.fps ?? 30, options: meta.options ?? {}, hasAct },
      files,
    };
    await api("complete", { worker_id: WORKER_ID, job_id: job.id, result });
    log(`xong ${effectId} sau ${Math.round((Date.now() - T0) / 1000)} s`);
  } catch (e) {
    if (!aborted) await fail(`worker lỗi: ${e.message ?? e}`, shutdown);
  } finally {
    clearInterval(ticker);
    killAll();
  }
}

// ---- main loop --------------------------------------------------------------------------------
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
  log(`khởi động: work-dir ${WORK_DIR}, claude ${CLAUDE_BIN}, config-dir ${CONFIG_DIR ?? "(mặc định)"}`);
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
