// Client for the bone-studio Edge Function (docs/bone-studio.md). ?mock=1 → in-page fake agent; ?api=<base> → other server.
const Q = new URLSearchParams(location.search);
export const MOCK = Q.get("mock") === "1";
const CFG = window.SUPABASE_CONFIG || {};
const BASE = Q.get("api") || CFG.url || "";
const FN = `${BASE.replace(/\/+$/, "")}/functions/v1/bone-studio`;

export function signedIn() {
  if (MOCK || Q.get("api")) return true;
  const s = window.HubSession?.get?.();
  return !!(s && s.kind === "member" && s.accessToken);
}
async function token() {
  if (MOCK || Q.get("api")) return "local";
  const s = window.HubSession?.get?.();
  if (s && window.HubSession.isExpired?.() && window.HubAuth) {
    const r = await window.HubAuth.refresh(s).catch(() => null);
    if (r?.ok) { window.HubSession.set(r.session); return r.session.accessToken; }
  }
  return s?.accessToken;
}
export async function api(action, body = {}) {
  if (MOCK) return mock(action, body);
  const r = await fetch(FN, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: CFG.anonKey ?? "local", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ action, ...body }),
  });
  const j = await r.json().catch(() => ({ ok: false, error: { message: `HTTP ${r.status}` } }));
  if (!j.ok) throw new Error(j.error?.message ?? `lỗi ${r.status}`);
  return j;
}
export async function uploadFiles(files) {
  // files: [{ name, type, blob }]
  const { files: urls } = await api("upload_urls", { files: files.map((f) => ({ name: f.name, type: f.type, size: f.blob.size })) });
  if (MOCK) return urls;
  for (const [i, u] of urls.entries()) {
    const r = await fetch(u.uploadUrl, { method: "PUT", headers: { "content-type": files[i].type }, body: files[i].blob });
    if (!r.ok) throw new Error(`tải lên ${files[i].name} lỗi ${r.status}`);
  }
  return urls;
}
export const publicUrl = (path) => (MOCK ? mockStore.get(path) : `${BASE.replace(/\/+$/, "")}/storage/v1/object/public/bone/${path}`);

// ---- in-page mock: a scripted agent that edits through the same event stream ----------------------
const mockStore = new Map(), jobs = new Map();
let seqJob = 0;
async function mock(action, b) {
  await new Promise((r) => setTimeout(r, 30));
  if (action === "me") return { ok: true, user: { id: "mock", email: "mock@local", role: "member" }, isAdmin: true };
  if (action === "upload_urls") return { ok: true, files: b.files.map((f, i) => { const path = `refs/mock/${Date.now()}/${i}-${f.name}`; return { path, uploadUrl: "mock:" + path, publicUrl: path }; }) };
  if (action === "submit") {
    const id = `mock-${++seqJob}`, job = { id, status: "queued", stage: null, prompt: b.prompt, params: b.params ?? {}, events: [], created_at: new Date().toISOString(), title: b.title ?? b.prompt.slice(0, 60) };
    jobs.set(id, job);
    runMockJob(job, b);
    return { ok: true, job: strip(job) };
  }
  if (action === "events") { const j = jobs.get(b.id); return { ok: true, events: j.events.filter((e) => e.seq > (b.since ?? 0)), job: strip(j) }; }
  if (action === "cancel") { const j = jobs.get(b.id); j.status = "canceled"; return { ok: true, job: strip(j) }; }
  if (action === "list") return { ok: true, jobs: [...jobs.values()].map(strip).reverse(), total: jobs.size, page: 1, pages: 1 };
  if (action === "workers") return { ok: true, workers: [{ id: "mock:agent", label: "Agent giả (mock)", status: "idle", enabled: true, priority: 0, claim_delay_s: 0, model: "opus", max_minutes: 10, last_seen: new Date().toISOString() }] };
  if (action === "worker_update") return { ok: true, worker: {} };
  if (action === "project_list") return { ok: true, projects: [] };
  throw new Error(`mock: action ${action} chưa có`);
}
const strip = ({ events, ...j }) => j;
export function mockPut(path, blob) { mockStore.set(path, URL.createObjectURL(blob)); }
async function runMockJob(job, b) {
  const push = (kind, data) => job.events.push({ seq: job.events.length + 1, t: new Date().toISOString(), kind, data });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(300);
  if (job.status === "canceled") return;
  job.status = "running"; job.stage = "thinking";
  push("stage", { stage: "thinking" });
  push("say", { text: "Mình xem dự án và yêu cầu trước (agent giả, chỉ để thử luồng)." });
  const bone = `agent-${job.id.split("-")[1]}`;
  const ctx = b.context ?? {};
  const parent = ctx.selection?.[0] ?? "root";
  await wait(400);
  job.stage = "editing"; push("stage", { stage: "editing" });
  push("cmds", { cmds: [{ type: "bone.add", name: bone, parent, x: 20, y: 0, rotation: 30, length: 40 }], note: "thêm một bone" });
  push("say", { text: `Đã thêm bone ${bone} dưới ${parent}.` });
  await wait(400);
  const anim = `${bone}-wave`;
  push("cmds", { cmds: [{ type: "anim.add", name: anim }, { type: "key.set", anim, track: { bone, prop: "rotate" }, time: 0, value: 0 }], note: "tạo animation" });
  await wait(400);
  push("cmds", { cmds: [{ type: "key.set", anim, track: { bone, prop: "rotate" }, time: 0.5, value: 45, curve: [0.42, 0, 0.58, 1] }, { type: "key.set", anim, track: { bone, prop: "rotate" }, time: 1, value: 0 }], note: "key vẫy" });
  push("say", { text: "Xong: một bone mới và animation vẫy 1 giây." });
  await wait(200);
  if (job.status === "canceled") return;
  job.status = "done"; job.stage = null; job.result = { summary: "agent giả: thêm bone và animation" };
}
