#!/usr/bin/env node
// Xưởng Xương worker: one process per Claude account. See docs/bone-studio.md for the API contract.
import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WIN = process.platform === "win32";
const HERE = dirname(fileURLToPath(import.meta.url));
const BONE_CLI = resolve(HERE, "..", "..", "bone-studio", "cli", "bone-cli.mjs");

const argv = process.argv.slice(2), A = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) continue;
  const k = argv[i].slice(2);
  if (k === "once") A.once = true;
  else A[k] = argv[++i];
}
const E = process["env"];
const WORKER_ID = A.id ?? E.BONE_WORKER_ID ?? `${hostname()}:claude`;
const ACCOUNT = A.account ?? E.BONE_ACCOUNT ?? WORKER_ID.split(":")[1] ?? "claude";
const HOST = WORKER_ID.split(":")[0];
const LABEL = A.label ?? E.BONE_LABEL ?? WORKER_ID;
const DEFAULTS = {
  priority: +(A.priority ?? E.BONE_PRIORITY ?? 0),
  claim_delay_s: +(A.delay ?? E.BONE_DELAY ?? 0),
  model: A.model ?? E.BONE_MODEL ?? "opus",
  max_minutes: +(A["max-minutes"] ?? E.BONE_MAX_MINUTES ?? 25),
};
const WORK_DIR = resolve(A["work-dir"] ?? E.BONE_WORK_DIR ?? join(homedir(), "bone-worker"));
const CONFIG_DIR = A["config-dir"] ?? E.BONE_CONFIG_DIR ?? null;
const POLL_MS = +(A.poll ?? E.BONE_POLL ?? 4) * 1000;
const ONCE = !!A.once;
const SUPABASE_URL = E.BONE_SUPABASE_URL ?? "https://jvdguaecnllejdmgytia.supabase.co";
const ANON = E.BONE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZGd1YWVjbmxsZWpkbWd5dGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDM3MTAsImV4cCI6MjEwMDgxOTcxMH0.oo1rodkh8_c7tBa-jptqHfemxmY9h8Q_r8DYrUYL9AI";
const readKey = (f) => { try { return readFileSync(join(homedir(), f), "utf8").trim(); } catch { return ""; } };
const WORKER_KEY = E.BONE_WORKER_KEY ?? (readKey(".bone-worker-key") || readKey(".vfx-worker-key"));
const CLAUDE_BIN = (() => {
  const b = A["claude-bin"] ?? E.BONE_CLAUDE_BIN ?? "claude";
  if (b === "claude" && WIN) {
    const p = join(homedir(), ".local", "bin", "claude.exe");
    if (existsSync(p)) return p;
  }
  return b;
})();
const LOG_FILE = join(WORK_DIR, `worker-${ACCOUNT}.log`);
const FN = `${SUPABASE_URL}/functions/v1/bone-studio`;
const TICK_MS = 300;

mkdirSync(WORK_DIR, { recursive: true });
if (!WORKER_KEY || !ANON) { console.error("thiếu BONE_WORKER_KEY (~/.bone-worker-key hoặc ~/.vfx-worker-key) hoặc anon key"); process.exit(2); }

function log(msg) {
  const line = `${new Date().toISOString()} [${WORKER_ID}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + "\n"); } catch {}
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const fwd = (p) => (WIN ? p.replace(/\\/g, "/") : p);

let config = { ...DEFAULTS, enabled: true };
async function api(action, body = {}, timeoutMs = 30000) {
  const r = await fetch(FN, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json", "x-bone-worker-key": WORKER_KEY },
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

function run(cmd, args, { cwd, input, timeout = 60000, extraEnv, onLine } = {}) {
  return new Promise((done) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: { ...E, ...extraEnv }, windowsHide: true, detached: !WIN, stdio: ["pipe", "pipe", "pipe"] });
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

// ---- helpers for one job ----------------------------------------------------------------------
const pub = (path) => `${SUPABASE_URL}/storage/v1/object/public/bone/${path.split("/").map(encodeURIComponent).join("/")}`;
async function download(url, file) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`tải ${url} lỗi ${r.status}`);
  mkdirSync(dirname(file), { recursive: true });
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
}
async function putFile(uploadUrl, body, type) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": type }, body, signal: AbortSignal.timeout(120000) });
      if (r.ok) return;
      if (i === 2) throw new Error(`PUT lỗi ${r.status}`);
    } catch (e) { if (i === 2) throw e; }
    await sleep(1500 * (i + 1));
  }
}
const safeRel = (p) => typeof p === "string" && p && !p.includes("..") && !/^([/\\]|[A-Za-z]:)/.test(p) && !p.includes("\0");
const pngSize = (buf) => (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : { width: 0, height: 0 });
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : ""));
const UNATTENDED = "You run unattended inside a rigging job queue; nobody reads your chat except as short notes to the artist. Ignore any personal reply format or output style. Do the task in the user message, then end with one plain line. Every note and the final line are read by a Vietnamese artist: write them in Vietnamese with full diacritics.";

const SPLIT_BLOCK = `# Mode: split  [mode:split]

The first reference picture is a whole character in one image. Turn it into parts, bones and slots:
1. \`{{cli}} split detect <picture>\` for the background, pixel factor and a suggested skeleton. Look at the picture with the Read tool.
2. \`{{cli}} split grid <picture> --zoom 2 --step 20 --out {{dir}}/out/grid.png\` and open the PNG: it is the picture
   enlarged with a coordinate grid, so you can read joint positions exactly. Use \`--crop x,y,w,h\` to zoom into one
   region (head, hands, feet) when a joint is unclear.
3. Write \`{{dir}}/skeleton.json\`: { "joints": { "name": [x, y] }, "parts": [{ "name", "from", "to", "parent" }], "root": "joint" }
   with x, y in pixels of the original picture (origin top-left, y down) and parts in draw order, bottom to top.
   Check it with \`split grid <picture> --skeleton {{dir}}/skeleton.json --out {{dir}}/out/grid2.png\` and fix joints that are off.
4. \`{{cli}} split auto <picture> --skeleton {{dir}}/skeleton.json\` cuts the parts and adds images, bones and slots.
   This is the step the artist sees live (the new part pictures arrive one by one).
5. \`render\` the setup pose, open it, compare with the original, fix with \`apply\` (bone.set, slot.move, attachment.set).
The job is only done when at least one part picture was cut.`;

const AGENT_BLOCK = "# Mode: agent\n\nDo what the request says on the current project.";

function summarize(c) {
  const t = String(c?.result?.result ?? "").trim().split(/\n/).filter(Boolean).pop() ?? "";
  return t.replace(/\s+/g, " ").slice(0, 300) || "đã xong";
}

// ---- one job ----------------------------------------------------------------------------------
async function runJob(job) {
  const jobDir = join(WORK_DIR, "jobs", job.id), refsDir = join(jobDir, "refs"), imgDir = join(jobDir, "images");
  const evFile = join(jobDir, "events.ndjson");
  const split = job.params?.mode === "split";
  const T0 = Date.now();
  let stage = "setup", aborted = null, sessionId = null, lastClaude = null;
  const outbox = [];
  let pushing = false, offset = 0, partial = "", chain = Promise.resolve();
  let nCmds = 0, nImages = 0, previewTick = 0;
  const latencies = [], previewMtime = new Map();

  rmSync(jobDir, { recursive: true, force: true });
  mkdirSync(refsDir, { recursive: true });
  mkdirSync(imgDir, { recursive: true });

  const noteStatus = (st) => { if ((st === "canceled" || st === "lost") && !aborted) { aborted = st; log(`job ${st}: dừng Claude`); killAll(); } };
  const emitEv = (kind, data, t0 = Date.now()) => outbox.push({ kind, data, t0 });
  const setStage = (s) => {
    if (s === stage) return;
    stage = s; log(`stage ${s}`);
    emitEv("stage", { stage: s });
    api("progress", { worker_id: WORKER_ID, job_id: job.id, stage: s }).then((r) => noteStatus(r.job_status)).catch((e) => log(`progress lỗi: ${e.message}`));
  };

  async function uploadPng(file, name) {
    const u = (await api("upload_urls", { job_id: job.id, files: [{ name, type: "image/png" }] })).files[0];
    const buf = readFileSync(file);
    await putFile(u.uploadUrl, buf, "image/png");
    return { path: u.path, ...pngSize(buf) };
  }

  // one events.ndjson line -> outbox (images are uploaded first so the event can carry the Storage path)
  async function handleLine(line) {
    let e; try { e = JSON.parse(line); } catch { return; }
    const t0 = typeof e.t === "number" ? e.t : Date.now();
    if (e.kind === "cmds" && Array.isArray(e.cmds)) emitEv("cmds", { cmds: e.cmds, ...(e.note ? { note: e.note } : {}) }, t0);
    else if (e.kind === "image" && safeRel(e.path)) {
      const f = join(imgDir, `${e.path}.png`);
      if (!existsSync(f)) return log(`ảnh ${e.path} không có file, bỏ qua`);
      try {
        const up = await uploadPng(f, `images/${e.path}.png`);
        emitEv("image", { name: e.path, path: up.path, width: up.width, height: up.height }, t0);
      } catch (err) { log(`tải ảnh ${e.path} lỗi: ${err.message}`); }
    }
  }
  function tail() {
    let size = 0;
    try { size = statSync(evFile).size; } catch { return; }
    if (size <= offset) return;
    const fd = openSync(evFile, "r");
    const buf = Buffer.alloc(size - offset);
    try { readSync(fd, buf, 0, buf.length, offset); } finally { closeSync(fd); }
    offset = size;
    partial += buf.toString("utf8");
    let i;
    while ((i = partial.indexOf("\n")) >= 0) {
      const l = partial.slice(0, i); partial = partial.slice(i + 1);
      if (l.trim()) chain = chain.then(() => handleLine(l));
    }
  }
  async function flush() {
    if (pushing || !outbox.length) return;
    pushing = true;
    const batch = outbox.splice(0, 200);
    try {
      const r = await api("push_events", { worker_id: WORKER_ID, job_id: job.id, events: batch.map(({ kind, data }) => ({ kind, data })) });
      const now = Date.now();
      for (const e of batch) {
        if (e.kind === "cmds") nCmds++;
        if (e.kind === "image") nImages++;
        const ms = now - e.t0;
        latencies.push(ms);
        log(`event ${e.kind} đã đẩy sau ${ms} ms (seq ${r.seq})`);
      }
      noteStatus(r.job_status);
    } catch (e) {
      outbox.unshift(...batch);
      log(`push_events lỗi: ${e.message}`);
    } finally { pushing = false; }
  }
  // PNGs Claude renders for itself (render.png, strip.png, out/*.png) become `preview` events
  async function previews() {
    for (const d of [jobDir, join(jobDir, "out")]) {
      let names = [];
      try { names = readdirSync(d).filter((n) => n.toLowerCase().endsWith(".png")); } catch { continue; }
      for (const n of names) {
        const f = join(d, n);
        let m; try { m = statSync(f).mtimeMs; } catch { continue; }
        if (previewMtime.get(f) === m) continue;
        previewMtime.set(f, m);
        try { emitEv("preview", { path: (await uploadPng(f, `preview/${Date.now()}-${n}`)).path }); }
        catch (e) { log(`preview lỗi: ${e.message}`); }
        return;
      }
    }
  }
  let looping = true;
  const loop = (async () => {
    while (looping) {
      const t = Date.now();
      try {
        tail();
        if (++previewTick % 10 === 0) await previews();
        await flush();
      } catch (e) { log(`vòng đẩy event lỗi: ${e.message}`); }
      await sleep(Math.max(20, TICK_MS - (Date.now() - t)));
    }
  })();
  const drain = async () => {
    for (let i = 0; i < 3; i++) {
      tail();
      await chain;
      let guard = 0;
      while ((outbox.length || pushing) && guard++ < 200) { if (!pushing) await flush(); else await sleep(30); }
    }
  };
  let hbBusy = false;
  const hb = setInterval(async () => {
    if (hbBusy) return;
    hbBusy = true;
    try { noteStatus(await heartbeat(job.id)); } catch (e) { log(`heartbeat lỗi: ${e.message}`); } finally { hbBusy = false; }
  }, 10000);

  const fail = async (error, requeue = false) => {
    log(`fail${requeue ? " (requeue)" : ""}: ${error}`);
    try { await api("fail", { worker_id: WORKER_ID, job_id: job.id, error: String(error).slice(0, 500), requeue }); } catch (e) { log(`fail lỗi: ${e.message}`); }
  };

  try {
    // 1. bundle + refs
    const bundle = JSON.parse((await download(pub(job.project), join(jobDir, "bundle.json"))).toString("utf8"));
    if (!bundle?.doc || typeof bundle.doc !== "object") throw new Error("bản chụp dự án không có doc");
    writeFileSync(join(jobDir, "doc.json"), JSON.stringify(bundle.doc, null, 1));
    let nImg = 0;
    for (const [p, data] of Object.entries(bundle.images ?? {})) {
      const m = /^data:image\/png;base64,(.*)$/s.exec(String(data));
      if (!safeRel(p) || !m) { log(`bỏ qua ảnh ${p} trong bản chụp`); continue; }
      const f = join(imgDir, `${p}.png`);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, Buffer.from(m[1], "base64"));
      nImg++;
    }
    rmSync(join(jobDir, "bundle.json"), { force: true });
    log(`bản chụp: ${(bundle.doc.bones ?? []).length} bone, ${nImg} ảnh`);

    const refLines = [];
    for (const [i, r] of (job.refs ?? []).entries()) {
      if (r.kind === "bundle") continue;
      const local = join(refsDir, `${i}-${basename(r.path).replace(/[^\w.-]/g, "_")}`);
      await download(pub(r.path), local);
      refLines.push(`- ${fwd(local)} (reference picture "${r.name ?? ""}")`);
    }
    const ctx = job.context ?? {}, cl = [];
    if (ctx.selection?.length) cl.push(`The artist has selected: ${ctx.selection.join(", ")}.`);
    if (ctx.anim) cl.push(`The animation open in the editor is "${ctx.anim}"${typeof ctx.time === "number" ? ` at ${ctx.time} s` : ""}.`);
    const vars = { cli: `node "${fwd(BONE_CLI)}"`, dir: fwd(jobDir) };
    const brief = fill(readFileSync(join(HERE, "brief.md"), "utf8"), {
      ...vars, title: job.title ?? "", request: job.prompt ?? "",
      context: cl.length ? "Context from the editor: " + cl.join(" ") : "",
      refs: refLines.length ? "Reference pictures (open each with the Read tool and study it before you start):\n" + refLines.join("\n") : "No reference pictures.",
      mode: fill(split ? SPLIT_BLOCK : AGENT_BLOCK, vars),
    });
    writeFileSync(join(jobDir, "brief.txt"), brief);
    if (split && !refLines.length) return await fail("job split cần ít nhất một ảnh nguyên con làm ảnh tham khảo");

    // 2. claude
    const viaNode = /\.(mjs|js)$/.test(CLAUDE_BIN);
    const claudeCmd = viaNode ? process.execPath : CLAUDE_BIN;
    const claudeArgs = (extra = []) => {
      const a = ["-p", "--model", config.model, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions",
        "--setting-sources", "project,local", "--append-system-prompt", UNATTENDED, ...extra];
      return viaNode ? [CLAUDE_BIN, ...a] : a;
    };
    const childEnv = { BONE_DIR: jobDir, ...(CONFIG_DIR ? { CLAUDE_CONFIG_DIR: CONFIG_DIR } : {}) };
    const runClaude = async (input, extra = []) => {
      let result = null;
      const left = Math.max(180000, T0 + config.max_minutes * 60000 - Date.now());
      const r = await run(claudeCmd, claudeArgs(extra), {
        cwd: jobDir, input, timeout: left, extraEnv: childEnv,
        onLine: (line) => {
          let j; try { j = JSON.parse(line); } catch { return; }
          if (j.type === "system" && j.session_id) sessionId = j.session_id;
          if (j.type === "result") { result = j; if (j.session_id) sessionId = j.session_id; }
          if (j.type !== "assistant") return;
          for (const b of j.message?.content ?? []) {
            if (b.type === "text" && b.text?.trim()) { setStage("thinking"); emitEv("say", { text: b.text.trim().slice(0, 1000) }); }
            if (b.type === "tool_use") {
              const c = String(b.input?.command ?? "");
              if (b.name === "Bash" && /\b(apply|split\s+auto|import-image)\b/.test(c)) setStage("editing");
              else if (b.name === "Bash" && /\b(render|strip|info|split\s+(grid|detect))\b/.test(c)) setStage("checking");
              else if (b.name === "Read") setStage("checking");
            }
          }
        },
      });
      return { ...r, result };
    };
    const stopped = async () => {
      if (aborted) return true;
      if (shutdown) { await fail("máy chạy tắt", true); return true; }
      return false;
    };
    const timeoutMsg = () => `quá ${config.max_minutes} phút`;
    const checkInfo = () => run(process.execPath, [BONE_CLI, "info", "--dir", jobDir], { timeout: 30000 });
    const satisfied = async () => {
      await drain();
      const ok = (await checkInfo()).code === 0;
      return { why: !ok ? "bone-cli info báo lỗi trên doc.json" : nCmds < 1 ? "chưa có lần apply nào thành công" : split && nImages < 1 ? "chưa cắt ra part nào (không có ảnh mới)" : null };
    };

    setStage("thinking");
    lastClaude = await runClaude(brief);
    let c = lastClaude;
    if (await stopped()) return;
    if (c.timedOut) return await fail(timeoutMsg());
    const tailTxt = `${c.result?.result ?? ""}\n${c.err}\n${c.out.slice(-1500)}`;
    if (c.code !== 0 || c.result?.is_error) {
      if (/\/login|\b401\b|not logged in|invalid api key|authentication_error/i.test(tailTxt)) {
        setState("auth", `cần /login cho ${ACCOUNT}`, 10 * 60000);
        return await fail(`tài khoản ${ACCOUNT} cần đăng nhập`, true);
      }
      if (/usage limit|rate.?limit|\b429\b|overloaded|limit reached|quota/i.test(tailTxt)) {
        let until = Date.now() + 15 * 60000;
        const ep = tailTxt.match(/\|(\d{10})\b/);
        const tm = tailTxt.match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
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

    // 3. the job's own check: valid doc and something actually changed; otherwise nudge the same session
    let chk = await satisfied();
    for (let nudge = 0; chk.why && nudge < 2 && sessionId && !aborted && !shutdown; nudge++) {
      setStage("checking");
      log(`chưa đạt (${chk.why}), nhắc Claude lần ${nudge + 1}`);
      lastClaude = await runClaude(`The job is not finished: ${chk.why}. Do the task from the brief now with the bone-cli command line: ${split ? "cut the parts with `split auto` after writing skeleton.json, " : "apply the change with `apply` in small steps, "}then look at a render and stop with a one-line summary. If doc.json is broken, run \`info\` to see the error and repair it with apply.`, ["--resume", sessionId]);
      c = lastClaude;
      if (await stopped()) return;
      if (c.timedOut) return await fail(timeoutMsg());
      chk = await satisfied();
    }
    if (aborted) return;
    if (chk.why) return await fail(`${chk.why}: ${String(c.result?.result || c.err || "Claude không có đầu ra").slice(0, 300)}`);

    // 4. upload the final doc
    setStage("uploading");
    const docUp = (await api("upload_urls", { job_id: job.id, files: [{ name: "doc.json", type: "application/json" }] })).files[0];
    await putFile(docUp.uploadUrl, readFileSync(join(jobDir, "doc.json")), "application/json");
    if (aborted) return;
    await drain();
    await api("complete", { worker_id: WORKER_ID, job_id: job.id, result: { doc: docUp.path, summary: summarize(lastClaude) } });
    const s = [...latencies].sort((a, b) => a - b);
    log(`xong job ${job.id} sau ${Math.round((Date.now() - T0) / 1000)} s; ${nCmds} cmds, ${nImages} ảnh; trễ event min/trung vị/max = ${s[0] ?? "-"}/${s[s.length >> 1] ?? "-"}/${s[s.length - 1] ?? "-"} ms`);
  } catch (e) {
    if (!aborted) await fail(`worker lỗi: ${e.message ?? e}`, shutdown);
  } finally {
    looping = false;
    clearInterval(hb);
    await loop.catch(() => {});
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
  log(`khởi động: work-dir ${WORK_DIR}, claude ${CLAUDE_BIN}, config-dir ${CONFIG_DIR ?? "(mặc định)"}, bone-cli ${BONE_CLI}`);
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
