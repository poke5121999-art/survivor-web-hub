#!/usr/bin/env node
// In-memory stand-in for the bone-studio Edge Function + Storage, for tests (see docs/bone-studio.md "API").
// Art auth: any Bearer token (user "mock-user"). Worker auth: any non-empty x-bone-worker-key.
// Usage: node mock-server.mjs [port]   (0 or none = free port). Prints "ready <port>".
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const port = +(process.argv[2] ?? 0);
const BUCKET = "bone", ONLINE_MS = 45000;
const jobs = new Map(), events = new Map(), workers = new Map(), projects = new Map(), files = new Map();
const USER = { id: "mock-user", email: "mock@example.com", role: "admin" };
let base = "";

class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const fail = (status, code, message) => { throw new ApiError(status, code, message); };
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const now = () => new Date().toISOString();
const MODELS = ["opus", "sonnet", "haiku", "fable"];

const signed = (path, type) => ({ path, type, uploadUrl: `${base}/storage/v1/object/upload/sign/${BUCKET}/${path}?token=mock`, publicUrl: `${base}/storage/v1/object/public/${BUCKET}/${path}` });
const getJob = (id) => jobs.get(id) ?? fail(404, "NOT_FOUND", "không có job này");
const view = (j) => { const { ev_seq, ...r } = j; return r; };
const wview = (w) => ({ ...w, status: !w.last_seen || Date.now() - w.last_seen > ONLINE_MS ? "offline" : w.status });
const wconf = (id) => { const w = workers.get(id); return w ? wview(w) : fail(404, "NOT_FOUND", `máy ${id} chưa chào (hello)`); };

function jobEvents(id, since) {
  const j = getJob(id);
  return { events: (events.get(id) ?? []).filter((e) => e.seq > (+since || 0)).slice(0, 500), job: { id, status: j.status, stage: j.stage, error: j.error, result: j.result } };
}

const art = {
  me: () => ({ user: { id: USER.id, email: USER.email, role: USER.role }, isAdmin: true }),
  upload_urls(b) {
    const fl = Array.isArray(b.files) ? b.files : [];
    if (!fl.length || fl.length > 40) fail(400, "INVALID", "gửi từ 1 tới 40 file");
    const stamp = randomUUID().slice(0, 8);
    return { files: fl.map((f, i) => signed(`refs/${USER.id}/${stamp}/${i}-${str(f.name, 80).replace(/[^A-Za-z0-9._-]+/g, "-") || "file"}`, f.type)) };
  },
  submit(b) {
    const prompt = str(b.prompt, 4000);
    if (!prompt) fail(400, "INVALID", "chưa có yêu cầu");
    return { job: newJob(b, USER.id, USER.email.split("@")[0]) };
  },
  list: () => { const l = [...jobs.values()].reverse().map(view); return { jobs: l, total: l.length, page: 1, page_size: 30, pages: 1 }; },
  get: (b) => ({ job: view(getJob(b.id)) }),
  events: (b) => jobEvents(b.id, b.since),
  cancel(b) {
    const j = getJob(b.id);
    if (!["queued", "running"].includes(j.status)) fail(409, "CONFLICT", "job không còn huỷ được");
    Object.assign(j, { status: "canceled", stage: null, finished_at: now() });
    return { job: view(j) };
  },
  retry(b) {
    const j = getJob(b.id);
    if (!["failed", "canceled"].includes(j.status)) fail(409, "CONFLICT", "job này không chạy lại được");
    Object.assign(j, { status: "queued", stage: null, worker: null, error: null, finished_at: null, attempts: 0, result: null, created_at: now(), ev_seq: 0 });
    events.set(j.id, []);
    return { job: view(j) };
  },
  delete(b) { getJob(b.id); jobs.delete(b.id); events.delete(b.id); return { deleted: b.id }; },
  workers: () => ({ workers: [...workers.values()].map(wview) }),
  worker_update(b) {
    const w = workers.get(b.id) ?? fail(404, "NOT_FOUND", "không có máy này");
    const p = b.patch ?? {};
    for (const k of ["enabled", "priority", "claim_delay_s", "max_minutes", "label"]) if (k in p) w[k] = p[k];
    if (MODELS.includes(p.model)) w.model = p.model;
    return { worker: wview(w) };
  },
  project_list: () => ({ projects: [...projects.values()].map((p) => ({ id: p.id, name: p.name, updated_at: p.updated_at, versions: p.versions.length })) }),
  project_save(b) {
    let p = b.id ? projects.get(b.id) : null;
    if (b.id && !p) fail(404, "NOT_FOUND", "không có dự án này");
    if (!p) { p = { id: randomUUID(), name: "", updated_at: now(), next_v: 1, versions: [] }; projects.set(p.id, p); }
    p.name = str(b.name, 120) || "Dự án chưa đặt tên";
    const path = `projects/${USER.id}/${p.id}/v${p.next_v++}.json`;
    return { project: { id: p.id, name: p.name, updated_at: p.updated_at, versions: p.versions }, upload: { path, uploadUrl: signed(path, "application/json").uploadUrl } };
  },
  project_commit(b) {
    const p = projects.get(b.id) ?? fail(404, "NOT_FOUND", "không có dự án này");
    const m = String(b.path).match(/\/v(\d+)\.json$/) ?? fail(400, "INVALID", "đường dẫn phiên bản không khớp dự án");
    p.versions.push({ v: +m[1], path: b.path, size: b.size ?? 0, at: now() });
    p.updated_at = now();
    return { project: p };
  },
  project_get(b) {
    const p = projects.get(b.id) ?? fail(404, "NOT_FOUND", "không có dự án này");
    return { project: { ...p, versions: p.versions.map((v) => ({ ...v, url: `${base}/storage/v1/object/public/${BUCKET}/${v.path}` })) } };
  },
};

function newJob(b, userId, author) {
  const params = { mode: b.params?.mode === "split" ? "split" : "agent", only_worker: str(b.params?.only_worker, 200) || null };
  const id = randomUUID();
  const j = {
    id, created_at: now(), created_by: userId, author, title: str(b.title, 120) || str(b.prompt, 60), prompt: str(b.prompt, 4000),
    project: str(b.project, 300), refs: Array.isArray(b.refs) ? b.refs.slice(0, 8) : [], context: b.context ?? {}, params,
    status: "queued", stage: null, worker: null, attempts: 0, claimed_at: null, heartbeat_at: null, finished_at: null, result: null, error: null, ev_seq: 0,
  };
  jobs.set(id, j); events.set(id, []);
  return view(j);
}

function reap() {
  for (const j of jobs.values()) {
    if (j.status === "running" && Date.now() - new Date(j.heartbeat_at).getTime() > 180000) {
      Object.assign(j, j.attempts >= 3 ? { status: "failed", error: "máy chạy im lặng quá lâu", finished_at: now() } : { status: "queued" }, { stage: null, worker: null });
    }
  }
}

const worker = {
  hello(b) {
    const w = b.worker ?? {}, d = w.defaults ?? {}, id = str(w.id, 60);
    if (!/^[a-z0-9._-]+:[a-z0-9._-]+$/i.test(id)) fail(400, "INVALID", "worker.id phải có dạng host:account");
    const old = workers.get(id);
    workers.set(id, {
      id, label: str(w.label, 60) || id, host: str(w.host, 60), account: str(w.account, 60), enabled: old?.enabled ?? true,
      priority: old?.priority ?? d.priority ?? 1, claim_delay_s: old?.claim_delay_s ?? d.claim_delay_s ?? 20,
      model: old?.model ?? (MODELS.includes(d.model) ? d.model : "opus"), max_minutes: old?.max_minutes ?? d.max_minutes ?? 30,
      status: "idle", note: null, current_job: null, last_seen: Date.now(), jobs_done: old?.jobs_done ?? 0,
    });
    for (const j of jobs.values()) if (j.worker === id && j.status === "running") Object.assign(j, { status: "queued", stage: null, worker: null });
    return { config: wconf(id) };
  },
  claim(b) {
    reap();
    const me = workers.get(b.worker_id) ?? fail(404, "NOT_FOUND", "máy chưa chào (hello)");
    me.last_seen = Date.now();
    if (!me.enabled) return { job: null, config: wconf(me.id) };
    const allowed = (j, w) => !j.params.only_worker || j.params.only_worker.split(",").includes(w.id);
    for (const j of jobs.values()) {
      if (j.status !== "queued" || !allowed(j, me)) continue;
      const old = Date.now() - new Date(j.created_at).getTime() >= me.claim_delay_s * 1000;
      const yieldTo = [...workers.values()].some((o) => o.enabled && o.priority < me.priority && o.status === "idle" && Date.now() - o.last_seen < ONLINE_MS && allowed(j, o));
      if (!old && yieldTo) continue;
      Object.assign(j, { status: "running", worker: me.id, stage: "setup", attempts: j.attempts + 1, claimed_at: now(), heartbeat_at: now(), error: null, ev_seq: 0 });
      events.set(j.id, []);
      Object.assign(me, { status: "busy", current_job: j.id, note: null });
      return { job: view(j), config: wconf(me.id) };
    }
    return { job: null, config: wconf(me.id) };
  },
  bye(b) {
    for (const j of jobs.values()) if (j.worker === b.worker_id && j.status === "running") Object.assign(j, { status: "queued", stage: null, worker: null });
    workers.delete(b.worker_id);
    return { deleted: b.worker_id };
  },
  heartbeat(b) {
    const w = workers.get(b.worker_id) ?? fail(404, "NOT_FOUND", "máy chưa chào (hello)");
    Object.assign(w, { last_seen: Date.now(), status: ["idle", "busy", "paused", "quota"].includes(b.status) ? b.status : "idle", note: str(b.note, 200) || null, current_job: b.job_id ?? null });
    let job_status = null;
    if (b.job_id) { const j = jobs.get(b.job_id); if (j && j.worker === w.id) { j.heartbeat_at = now(); job_status = j.status; } else job_status = "lost"; }
    return { config: wconf(w.id), job_status };
  },
  progress(b) {
    const j = getJob(b.job_id);
    if (j.worker !== b.worker_id || j.status !== "running") return { job_status: j.status };
    j.stage = b.stage; j.heartbeat_at = now();
    return { job_status: "running" };
  },
  push_events(b) {
    const j = getJob(b.job_id);
    if (j.worker !== b.worker_id || j.status !== "running") return { seq: null, job_status: j.status };
    j.heartbeat_at = now();
    const list = events.get(j.id);
    for (const e of (Array.isArray(b.events) ? b.events : []).slice(0, 200)) list.push({ seq: ++j.ev_seq, t: now(), kind: e.kind, data: e.data ?? {} });
    return { seq: j.ev_seq, job_status: "running" };
  },
  upload_urls(b) {
    getJob(b.job_id);
    return { files: (b.files ?? []).map((f) => signed(`out/${b.job_id}/${String(f.name).split("/").map((s) => s.replace(/[^A-Za-z0-9._-]+/g, "-")).join("/")}`, f.type)) };
  },
  complete(b) {
    const j = getJob(b.job_id), r = b.result ?? {};
    if (!String(r.doc ?? "").startsWith(`out/${j.id}/`)) fail(400, "INVALID", "kết quả thiếu đường dẫn doc cuối");
    if (j.worker !== b.worker_id || j.status !== "running") fail(409, "CONFLICT", "job không còn thuộc máy này");
    Object.assign(j, { status: "done", stage: null, finished_at: now(), result: { doc: r.doc, summary: str(r.summary, 600) }, error: null });
    const w = workers.get(b.worker_id);
    if (w) Object.assign(w, { status: "idle", current_job: null, jobs_done: w.jobs_done + 1, last_seen: Date.now() });
    return { job: view(j) };
  },
  fail(b) {
    const j = getJob(b.job_id);
    if (j.worker === b.worker_id && j.status === "running") {
      if (b.requeue === true) Object.assign(j, { status: "queued", stage: null, worker: null, attempts: Math.max(0, j.attempts - 1) });
      else Object.assign(j, { status: "failed", stage: null, finished_at: now(), error: str(b.error, 2000) || "lỗi không rõ" });
    }
    const w = workers.get(b.worker_id);
    if (w) { w.current_job = null; w.last_seen = Date.now(); if (w.status === "busy") w.status = "idle"; }
    return { job: view(j) };
  },
  test_submit(b) {
    if (!str(b.params?.only_worker, 200)) fail(400, "INVALID", "test_submit cần params.only_worker");
    return { job: newJob(b, "test", "test") };
  },
  test_events: (b) => jobEvents(b.id, b.since),
  test_delete(b) { getJob(b.id); jobs.delete(b.id); events.delete(b.id); return { deleted: b.id }; },
};

function readBody(req) {
  return new Promise((res, rej) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => res(Buffer.concat(c))); req.on("error", rej); });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, base || "http://x");
  const send = (status, body, headers = {}) => { res.writeHead(status, { "access-control-allow-origin": "*", ...headers }); res.end(body); };
  const json = (status, o) => send(status, JSON.stringify(o), { "content-type": "application/json" });
  try {
    if (req.method === "OPTIONS") return send(204, "", { "access-control-allow-headers": "*", "access-control-allow-methods": "*" });
    const sp = url.pathname.match(/^\/storage\/v1\/object\/upload\/sign\/bone\/(.+)$/);
    if (sp && req.method === "PUT") { files.set(decodeURIComponent(sp[1]), { body: await readBody(req), type: req.headers["content-type"] ?? "application/octet-stream" }); return json(200, { Key: `bone/${sp[1]}` }); }
    const gp = url.pathname.match(/^\/storage\/v1\/object\/public\/bone\/(.+)$/);
    if (gp && req.method === "GET") {
      const f = files.get(decodeURIComponent(gp[1]));
      return f ? send(200, f.body, { "content-type": f.type }) : json(404, { error: "Not found" });
    }
    if (url.pathname === "/functions/v1/bone-studio" && req.method === "POST") {
      let body; try { body = JSON.parse((await readBody(req)).toString() || "{}"); } catch { fail(400, "INVALID", "body không phải JSON"); }
      const action = String(body.action ?? "");
      const wk = req.headers["x-bone-worker-key"];
      let out;
      if (wk) out = (worker[action] ?? fail(400, "INVALID", `action máy lạ: ${action}`))(body);
      else {
        if (!/^Bearer\s+\S+/i.test(req.headers.authorization ?? "")) fail(401, "UNAUTHENTICATED", "chưa đăng nhập");
        out = (art[action] ?? fail(400, "INVALID", `action lạ: ${action}`))(body);
      }
      return json(200, { ok: true, ...out });
    }
    json(404, { ok: false, error: { code: "NOT_FOUND", message: `${req.method} ${url.pathname}` } });
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { ok: false, error: { code: e.code, message: e.message } });
    console.error(e);
    json(500, { ok: false, error: { code: "INTERNAL", message: String(e?.message ?? e) } });
  }
});
server.listen(port, "127.0.0.1", () => { base = `http://127.0.0.1:${server.address().port}`; console.log(`ready ${server.address().port}`); });
