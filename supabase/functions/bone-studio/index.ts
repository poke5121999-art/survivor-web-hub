import postgres from "npm:postgres@3.4.5";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_KEY = Deno.env.get("BONE_WORKER_KEY") ?? "";
const BUCKET = "bone";
const ONLINE_S = 45;
const STALE_S = 180;
const MAX_ATTEMPTS = 3;
const ART_ROLES = ["member", "artist", "admin"];
const TEST_USER = "00000000-0000-0000-0000-000000000000";

const ALLOWED_ORIGIN = "https://poke5121999-art.github.io";
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3, idle_timeout: 20 });

const DDL = `
create table if not exists public.bone_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  author text not null default '',
  title text not null default '',
  prompt text not null,
  project text not null,
  refs jsonb not null default '[]',
  context jsonb not null default '{}',
  params jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','done','failed','canceled')),
  stage text,
  worker text,
  attempts int not null default 0,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  ev_seq int not null default 0,
  result jsonb,
  error text
);
create index if not exists bone_jobs_queue on public.bone_jobs (status, created_at);
alter table public.bone_jobs enable row level security;
create table if not exists public.bone_events (
  job_id uuid not null references public.bone_jobs(id) on delete cascade,
  seq int not null,
  t timestamptz not null default now(),
  kind text not null,
  data jsonb not null default '{}',
  primary key (job_id, seq)
);
alter table public.bone_events enable row level security;
create table if not exists public.bone_workers (
  id text primary key,
  label text not null default '',
  host text not null default '',
  account text not null default '',
  enabled boolean not null default true,
  priority int not null default 1,
  claim_delay_s int not null default 20,
  model text not null default 'opus',
  max_minutes int not null default 30,
  status text not null default 'idle',
  note text,
  current_job uuid,
  last_seen timestamptz,
  jobs_done int not null default 0
);
alter table public.bone_workers enable row level security;
create table if not exists public.bone_projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  next_v int not null default 1,
  versions jsonb not null default '[]'
);
create index if not exists bone_projects_owner on public.bone_projects (owner, updated_at desc);
alter table public.bone_projects enable row level security;
`;

let ready: Promise<void> | null = null;
function ensureReady(): Promise<void> {
  ready ??= (async () => {
    await sql.unsafe(DDL);
    const r = await fetch(`${URL_}/storage/v1/bucket`, {
      method: "POST",
      headers: svcHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 52428800 }),
    });
    if (!r.ok && r.status !== 409 && !(await r.text()).includes("already exists")) throw new Error(`bucket ${r.status}`);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
const fail = (status: number, code: string, message: string): never => {
  throw new ApiError(status, code, message);
};

function svcHeaders(extra: Record<string, string> = {}) {
  return { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, ...extra };
}

function corsHeaders(origin: string | null): Record<string, string> {
  const ok = origin !== null && (origin === ALLOWED_ORIGIN || LOCAL_ORIGIN.test(origin));
  return {
    ...(ok ? { "Access-Control-Allow-Origin": origin! } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-bone-worker-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

type User = { id: string; email: string; role: string; isAdmin: boolean };

async function artUser(req: Request): Promise<User> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token === ANON) fail(401, "UNAUTHENTICATED", "chưa đăng nhập");
  const r = await fetch(`${URL_}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON } });
  if (!r.ok) fail(401, "UNAUTHENTICATED", "phiên đăng nhập hết hạn");
  const u = await r.json();
  const [p] = await sql`select role from public.profiles where id = ${u.id}`;
  const role = p?.role ?? "pending";
  if (!ART_ROLES.includes(role)) fail(403, "FORBIDDEN", `Tài khoản đang ở role "${role}", chưa được dùng Xưởng Xương. Nhờ admin duyệt thành member hoặc artist ở trang Duyệt tài khoản.`);
  return { id: u.id, email: u.email ?? "", role, isAdmin: role === "admin" };
}

function isWorker(req: Request) {
  const k = req.headers.get("x-bone-worker-key");
  return !!k && !!WORKER_KEY && k === WORKER_KEY;
}

const JOB_COLS = sql`id, created_at, created_by, author, title, prompt, project, refs, context, params,
  status, stage, worker, attempts, claimed_at, heartbeat_at, finished_at, result, error`;

const WORKER_COLS = sql`id, label, host, account, enabled, priority, claim_delay_s, model, max_minutes, note, current_job,
  last_seen, jobs_done,
  case when last_seen is null or last_seen < now() - make_interval(secs => ${ONLINE_S}) then 'offline' else status end as status`;

const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp", "application/json"];
const OUT_TYPES = ["image/png", "application/json"];
const STAGES = ["setup", "thinking", "editing", "checking", "uploading"];
const MODES = ["agent", "split"];
const EVENT_KINDS = ["say", "cmds", "image", "stage", "preview"];
const WORKER_STATUS = ["idle", "busy", "paused", "quota"];
const MODELS = ["opus", "sonnet", "haiku", "fable"];

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const pick = <T extends string>(v: unknown, list: readonly T[], dflt: T): T => (list.includes(v as T) ? (v as T) : dflt);
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : fail(400, "INVALID", "id không hợp lệ"));
const safeName = (n: unknown) => (str(n, 80).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+/, "") || "file");
// Storage path from the client: no "..", no leading slash.
const cleanPath = (p: unknown) => {
  const s = str(p, 300);
  return s && !s.includes("..") && !s.startsWith("/") && !/[\\\0]/.test(s) ? s : "";
};

function parseParams(p: any) {
  p = p && typeof p === "object" ? p : {};
  return { mode: pick(p.mode, MODES, "agent"), only_worker: str(p.only_worker, 200) || null };
}

function parseContext(c: any) {
  c = c && typeof c === "object" ? c : {};
  return {
    selection: Array.isArray(c.selection) ? c.selection.filter((s: unknown) => typeof s === "string").slice(0, 50).map((s: string) => s.slice(0, 80)) : [],
    anim: str(c.anim, 80) || null,
    time: num(c.time, 0, 36000),
  };
}

function parseRefs(refs: unknown, userId: string) {
  if (!Array.isArray(refs)) return [];
  return refs.slice(0, 8).map((r: any) => {
    const path = cleanPath(r?.path);
    if (!path.startsWith(`refs/${userId}/`)) fail(400, "INVALID", `ảnh tham khảo không thuộc người gửi: ${path}`);
    return { path, kind: pick(r?.kind, ["image", "bundle"] as const, "image"), name: str(r?.name, 120) };
  });
}

async function signUpload(paths: { path: string; type: string }[]) {
  return Promise.all(paths.map(async ({ path, type }) => {
    const r = await fetch(`${URL_}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
      method: "POST",
      headers: svcHeaders({ "content-type": "application/json", "x-upsert": "true" }),
      body: "{}",
    });
    if (!r.ok) fail(502, "STORAGE", `không ký được URL tải lên (${r.status}): ${await r.text()}`);
    const { url } = await r.json();
    return { path, type, uploadUrl: `${URL_}/storage/v1${url}`, publicUrl: `${URL_}/storage/v1/object/public/${BUCKET}/${path}` };
  }));
}

async function listFiles(prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${URL_}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: svcHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ prefix, limit: 1000, offset }),
    });
    if (!r.ok) throw new Error(`storage list ${prefix} ${r.status}: ${await r.text()}`);
    const rows = await r.json();
    for (const f of rows) if (f.id) out.push(prefix + f.name);
    if (rows.length < 1000) return out;
  }
}

async function removeFiles(paths: string[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < paths.length; i += 500) {
    const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: svcHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ prefixes: paths.slice(i, i + 500) }),
    });
    if (!r.ok) throw new Error(`storage remove ${r.status}: ${await r.text()}`);
    n += (await r.json()).length;
  }
  return n;
}

async function getJob(id: string) {
  const [j] = await sql`select ${JOB_COLS} from public.bone_jobs where id = ${id}`;
  return j ?? fail(404, "NOT_FOUND", "không có job này");
}

async function reap() {
  await sql`update public.bone_jobs set
      status = case when attempts >= ${MAX_ATTEMPTS} then 'failed' else 'queued' end,
      error = case when attempts >= ${MAX_ATTEMPTS} then 'máy chạy im lặng quá lâu ở cả ' || attempts || ' lần thử' else error end,
      finished_at = case when attempts >= ${MAX_ATTEMPTS} then now() else null end,
      stage = null, worker = null
    where status = 'running' and heartbeat_at < now() - make_interval(secs => ${STALE_S})`;
}

async function jobEvents(id: string, since: unknown) {
  const s = Math.round(num(since, 0, 1e9) ?? 0);
  const events = await sql`select seq, t, kind, data from public.bone_events where job_id = ${id} and seq > ${s}
    order by seq limit 500`;
  const [job] = await sql`select id, status, stage, error, result from public.bone_jobs where id = ${id}`;
  return { events, job: job ?? fail(404, "NOT_FOUND", "không có job này") };
}

async function deleteJob(id: string, userId: string | null, isAdmin: boolean) {
  const [j] = await sql`select status, created_by, refs, project from public.bone_jobs where id = ${id}`;
  if (!j) fail(404, "NOT_FOUND", "không có job này");
  if (userId !== null && j.created_by !== userId && !isAdmin) fail(403, "FORBIDDEN", "job này không phải của bạn");
  if (j.status === "running") fail(409, "CONFLICT", "job đang chạy, huỷ trước rồi mới xoá");
  const [d] = await sql`delete from public.bone_jobs where id = ${id} and status <> 'running' returning id`;
  if (!d) fail(409, "CONFLICT", "job vừa được máy nhận, huỷ trước rồi mới xoá");
  try {
    // refs/ files (reference pictures and the bundle snapshot) are removed unless another job still points at them
    const mine = [...(Array.isArray(j.refs) ? j.refs.map((r: any) => r?.path) : []), j.project]
      .filter((p: unknown): p is string => typeof p === "string" && p.startsWith("refs/"));
    const kept = mine.length ? (await sql`select distinct p from (
        select r->>'path' as p from public.bone_jobs, jsonb_array_elements(refs) r
        union select project as p from public.bone_jobs) x where p in ${sql(mine)}`).map((r: any) => r.p) : [];
    const paths = [...(await listFiles(`out/${id}/`)), ...mine.filter((p) => !kept.includes(p))];
    const removed = await removeFiles(paths);
    console.log(`bone delete ${id}: ${removed}/${paths.length} file`);
    return { deleted: id, files_removed: removed };
  } catch (e) {
    console.error(`bone delete ${id}: dọn file lỗi`, e);
    return { deleted: id, files_removed: 0, files_error: String((e as Error).message) };
  }
}

async function insertJob(row: Record<string, unknown>) {
  const [j] = await sql`insert into public.bone_jobs ${sql(row)} returning id`;
  return getJob(j.id);
}

const art: Record<string, (b: any, u: User) => Promise<unknown>> = {
  async me(_b, u) {
    return { user: { id: u.id, email: u.email, role: u.role }, isAdmin: u.isAdmin };
  },

  async upload_urls(b, u) {
    const files = Array.isArray(b.files) ? b.files : [];
    if (!files.length || files.length > 40) fail(400, "INVALID", "gửi từ 1 tới 40 file");
    const stamp = crypto.randomUUID().slice(0, 8);
    const list = files.map((f: any, i: number) => {
      if (!UPLOAD_TYPES.includes(f?.type)) fail(400, "INVALID", `không nhận loại file ${f?.type}`);
      if (typeof f.size === "number" && f.size > 20 * 1024 * 1024) fail(400, "INVALID", `${f.name} lớn hơn 20 MB`);
      return { path: `refs/${u.id}/${stamp}/${i}-${safeName(f.name)}`, type: f.type };
    });
    return { files: await signUpload(list) };
  },

  async submit(b, u) {
    const prompt = str(b.prompt, 4000);
    if (!prompt) fail(400, "INVALID", "chưa có yêu cầu");
    const project = cleanPath(b.project);
    if (!project.startsWith(`refs/${u.id}/`) && !project.startsWith(`projects/${u.id}/`)) fail(400, "INVALID", "bản chụp dự án không thuộc người gửi");
    const [{ n }] = await sql`select count(*)::int as n from public.bone_jobs where created_by = ${u.id} and status in ('queued','running')`;
    if (n >= 6) fail(429, "TOO_MANY", "bạn đang có 6 job chờ hoặc đang chạy, đợi bớt rồi gửi tiếp");
    return {
      job: await insertJob({
        created_by: u.id,
        author: u.email.split("@")[0],
        title: str(b.title, 120) || prompt.slice(0, 60),
        prompt,
        project,
        refs: sql.json(parseRefs(b.refs, u.id)),
        context: sql.json(parseContext(b.context)),
        params: sql.json(parseParams(b.params)),
      }),
    };
  },

  async list(b, u) {
    const size = Math.round(num(b.page_size, 1, 100) ?? 30);
    const where = b.mine ? sql`where created_by = ${u.id}` : sql``;
    const [{ n }] = await sql`select count(*)::int as n from public.bone_jobs ${where}`;
    const pages = Math.max(1, Math.ceil(n / size));
    const page = Math.min(pages, Math.max(1, Math.round(num(b.page, 1, 1e6) ?? 1)));
    const jobs = await sql`select ${JOB_COLS} from public.bone_jobs ${where}
      order by created_at desc, id desc limit ${size} offset ${(page - 1) * size}`;
    return { jobs, total: n, page, page_size: size, pages };
  },

  async get(b) {
    return { job: await getJob(uuid(b.id)) };
  },

  async events(b) {
    return jobEvents(uuid(b.id), b.since);
  },

  async cancel(b, u) {
    const id = uuid(b.id);
    const [j] = await sql`update public.bone_jobs set status = 'canceled', stage = null, finished_at = now()
      where id = ${id} and status in ('queued','running') and (created_by = ${u.id} or ${u.isAdmin})
      returning id`;
    if (!j) fail(409, "CONFLICT", "job không còn huỷ được, hoặc không phải của bạn");
    return { job: await getJob(id) };
  },

  async retry(b, u) {
    const id = uuid(b.id);
    const [j] = await sql`update public.bone_jobs set status = 'queued', stage = null, worker = null, error = null,
        finished_at = null, attempts = 0, created_at = now(), result = null
      where id = ${id} and status in ('failed','canceled') and (created_by = ${u.id} or ${u.isAdmin})
      returning id`;
    if (!j) fail(409, "CONFLICT", "job này không chạy lại được");
    await sql`delete from public.bone_events where job_id = ${id}`;
    await sql`update public.bone_jobs set ev_seq = 0 where id = ${id}`;
    return { job: await getJob(id) };
  },

  async delete(b, u) {
    return deleteJob(uuid(b.id), u.id, u.isAdmin);
  },

  async workers() {
    return { workers: await sql`select ${WORKER_COLS} from public.bone_workers order by priority, id` };
  },

  async worker_update(b, u) {
    if (!u.isAdmin) fail(403, "FORBIDDEN", "chỉ admin chỉnh được máy chạy");
    const id = str(b.id, 60), p = b.patch ?? {};
    const patch: Record<string, unknown> = {};
    if (typeof p.enabled === "boolean") patch.enabled = p.enabled;
    if (num(p.priority, 0, 99) !== null) patch.priority = Math.round(p.priority);
    if (num(p.claim_delay_s, 0, 3600) !== null) patch.claim_delay_s = Math.round(p.claim_delay_s);
    if (num(p.max_minutes, 5, 180) !== null) patch.max_minutes = Math.round(p.max_minutes);
    if (MODELS.includes(p.model)) patch.model = p.model;
    if (typeof p.label === "string") patch.label = str(p.label, 60);
    if (!Object.keys(patch).length) fail(400, "INVALID", "không có gì để đổi");
    const [w] = await sql`update public.bone_workers set ${sql(patch)} where id = ${id} returning id`;
    if (!w) fail(404, "NOT_FOUND", "không có máy này");
    const [row] = await sql`select ${WORKER_COLS} from public.bone_workers where id = ${id}`;
    return { worker: row };
  },

  async project_list(_b, u) {
    const projects = await sql`select id, name, updated_at, jsonb_array_length(versions)::int as versions
      from public.bone_projects where owner = ${u.id} order by updated_at desc limit 200`;
    return { projects };
  },

  async project_save(b, u) {
    const name = str(b.name, 120) || "Dự án chưa đặt tên";
    let id: string;
    if (b.id) {
      id = uuid(b.id);
      const [p] = await sql`update public.bone_projects set name = ${name}, updated_at = now()
        where id = ${id} and owner = ${u.id} returning id`;
      if (!p) fail(404, "NOT_FOUND", "không có dự án này");
    } else {
      const [{ n }] = await sql`select count(*)::int as n from public.bone_projects where owner = ${u.id}`;
      if (n >= 200) fail(429, "TOO_MANY", "đã đủ 200 dự án, xoá bớt rồi lưu tiếp");
      [{ id }] = await sql`insert into public.bone_projects (owner, name) values (${u.id}, ${name}) returning id`;
    }
    // reserve the version number atomically; an uncommitted number is simply skipped
    const [{ v }] = await sql`update public.bone_projects set next_v = next_v + 1 where id = ${id} returning next_v - 1 as v`;
    const [{ project }] = await sql`select to_jsonb(p) - 'next_v' as project from public.bone_projects p where id = ${id}`;
    const path = `projects/${u.id}/${id}/v${v}.json`;
    const [upload] = await signUpload([{ path, type: "application/json" }]);
    return { project, upload: { path, uploadUrl: upload.uploadUrl } };
  },

  async project_commit(b, u) {
    const id = uuid(b.id), path = cleanPath(b.path);
    const m = path.match(new RegExp(`^projects/${u.id}/${id}/v(\\d+)\\.json$`));
    if (!m) fail(400, "INVALID", "đường dẫn phiên bản không khớp dự án");
    const v = +m![1];
    const size = Math.round(num(b.size, 0, 2e9) ?? 0);
    const [p] = await sql`update public.bone_projects set updated_at = now(),
        versions = (select coalesce(jsonb_agg(e order by (e->>'v')::int), '[]'::jsonb) from (
          select e from jsonb_array_elements(versions) e where (e->>'v')::int <> ${v}
          union all select ${sql.json({ v, path, size, at: new Date().toISOString() })}::jsonb) x)
      where id = ${id} and owner = ${u.id} returning id`;
    if (!p) fail(404, "NOT_FOUND", "không có dự án này");
    const [row] = await sql`select id, name, created_at, updated_at, versions from public.bone_projects where id = ${id}`;
    return { project: row };
  },

  async project_get(b, u) {
    const id = uuid(b.id);
    const [p] = await sql`select id, name, created_at, updated_at, versions from public.bone_projects
      where id = ${id} and (owner = ${u.id} or ${u.isAdmin})`;
    if (!p) fail(404, "NOT_FOUND", "không có dự án này");
    p.versions = (p.versions as any[]).map((x) => ({ ...x, url: `${URL_}/storage/v1/object/public/${BUCKET}/${x.path}` }));
    return { project: p };
  },
};

async function workerConfig(id: string) {
  const [w] = await sql`select ${WORKER_COLS} from public.bone_workers where id = ${id}`;
  return w ?? fail(404, "NOT_FOUND", `máy ${id} chưa chào (hello)`);
}

async function ownedRunning(workerId: string, jobId: string) {
  const [j] = await sql`select status, worker from public.bone_jobs where id = ${jobId}`;
  if (!j) fail(404, "NOT_FOUND", "không có job này");
  return j.worker === workerId && j.status === "running";
}

const worker: Record<string, (b: any) => Promise<unknown>> = {
  async hello(b) {
    const w = b.worker ?? {}, d = w.defaults ?? {};
    const id = str(w.id, 60);
    if (!/^[a-z0-9._-]+:[a-z0-9._-]+$/i.test(id)) fail(400, "INVALID", "worker.id phải có dạng host:account");
    const row = {
      id,
      label: str(w.label, 60) || id,
      host: str(w.host, 60),
      account: str(w.account, 60),
      priority: num(d.priority, 0, 99) ?? 1,
      claim_delay_s: num(d.claim_delay_s, 0, 3600) ?? 20,
      model: MODELS.includes(d.model) ? d.model : "opus",
      max_minutes: num(d.max_minutes, 5, 180) ?? 30,
      status: "idle",
    };
    await sql`insert into public.bone_workers ${sql(row)}
      on conflict (id) do update set label = excluded.label, host = excluded.host, account = excluded.account,
        status = 'idle', current_job = null, note = null`;
    await sql`update public.bone_workers set last_seen = now() where id = ${id}`;
    await sql`update public.bone_jobs set status = 'queued', stage = null, worker = null
      where worker = ${id} and status = 'running'`;
    return { config: await workerConfig(id) };
  },

  async claim(b) {
    const id = str(b.worker_id, 60);
    await reap();
    await sql`update public.bone_workers set last_seen = now() where id = ${id}`;
    const config = await workerConfig(id);
    if (!config.enabled) return { job: null, config };
    const [j] = await sql`
      with me as (select * from public.bone_workers where id = ${id}),
      pick as (
        select j.id from public.bone_jobs j, me
        where j.status = 'queued'
          and (j.params->>'only_worker' is null or me.id = any(string_to_array(j.params->>'only_worker', ',')))
          and (
          j.created_at <= now() - make_interval(secs => me.claim_delay_s)
          or not exists (
            select 1 from public.bone_workers o
            where o.enabled and o.priority < me.priority and o.status = 'idle'
              and (j.params->>'only_worker' is null or o.id = any(string_to_array(j.params->>'only_worker', ',')))
              and o.last_seen > now() - make_interval(secs => ${ONLINE_S})))
        order by j.created_at
        for update of j skip locked
        limit 1)
      update public.bone_jobs j set status = 'running', worker = ${id}, stage = 'setup', attempts = j.attempts + 1,
        claimed_at = now(), heartbeat_at = now(), error = null
      from pick where j.id = pick.id
      returning j.id`;
    if (!j) return { job: null, config };
    // a re-claimed job starts its event stream over (events of the dropped attempt would replay edits twice)
    await sql`delete from public.bone_events where job_id = ${j.id}`;
    await sql`update public.bone_jobs set ev_seq = 0 where id = ${j.id}`;
    await sql`update public.bone_workers set status = 'busy', current_job = ${j.id}, note = null where id = ${id}`;
    return { job: await getJob(j.id), config: await workerConfig(id) };
  },

  async bye(b) {
    const id = str(b.worker_id, 60);
    await sql`update public.bone_jobs set status = 'queued', stage = null, worker = null
      where worker = ${id} and status = 'running'`;
    await sql`delete from public.bone_workers where id = ${id}`;
    return { deleted: id };
  },

  async heartbeat(b) {
    const id = str(b.worker_id, 60);
    const status = pick(b.status, WORKER_STATUS, "idle");
    const jobId = b.job_id ? uuid(b.job_id) : null;
    await sql`update public.bone_workers set last_seen = now(), status = ${status}, note = ${str(b.note, 200) || null},
      current_job = ${jobId} where id = ${id}`;
    let job_status = null;
    if (jobId) {
      const [j] = await sql`update public.bone_jobs set heartbeat_at = now() where id = ${jobId} and worker = ${id}
        returning status`;
      job_status = j?.status ?? "lost";
    }
    return { config: await workerConfig(id), job_status };
  },

  async progress(b) {
    const id = str(b.worker_id, 60), jobId = uuid(b.job_id);
    if (!(await ownedRunning(id, jobId))) return { job_status: (await getJob(jobId)).status };
    const stage = pick(b.stage, STAGES, "thinking");
    await sql`update public.bone_jobs set stage = ${stage}, heartbeat_at = now() where id = ${jobId}`;
    await sql`update public.bone_workers set last_seen = now() where id = ${id}`;
    return { job_status: "running" };
  },

  async push_events(b) {
    const id = str(b.worker_id, 60), jobId = uuid(b.job_id);
    const evs = (Array.isArray(b.events) ? b.events : []).slice(0, 200).map((e: any) => {
      const kind = pick(e?.kind, EVENT_KINDS, "say");
      const data = e?.data && typeof e.data === "object" ? e.data : {};
      if (JSON.stringify(data).length > 400000) fail(400, "INVALID", "event quá lớn");
      return { kind, data };
    });
    // The counter column serialises concurrent pushes on the job row, so seq stays gap-free and unique.
    const out = await sql.begin(async (tx) => {
      const [j] = await tx`select status, worker from public.bone_jobs where id = ${jobId} for update`;
      if (!j) fail(404, "NOT_FOUND", "không có job này");
      if (j.worker !== id || j.status !== "running") return { seq: null, job_status: j.status };
      await tx`update public.bone_jobs set heartbeat_at = now() where id = ${jobId}`;
      if (!evs.length) return { seq: null, job_status: "running" };
      const [{ ev_seq }] = await tx`update public.bone_jobs set ev_seq = ev_seq + ${evs.length} where id = ${jobId} returning ev_seq`;
      const first = ev_seq - evs.length + 1;
      const rows = evs.map((e, i) => ({ job_id: jobId, seq: first + i, kind: e.kind, data: tx.json(e.data) }));
      await tx`insert into public.bone_events ${tx(rows)}`;
      return { seq: ev_seq, job_status: "running" };
    });
    if (out.seq === null && out.job_status === "running") {
      const [{ s }] = await sql`select ev_seq as s from public.bone_jobs where id = ${jobId}`;
      out.seq = s;
    }
    return out;
  },

  async upload_urls(b) {
    const jobId = uuid(b.job_id);
    const files = Array.isArray(b.files) ? b.files.slice(0, 40) : [];
    if (!files.length) fail(400, "INVALID", "không có file");
    return {
      files: await signUpload(files.map((f: any) => {
        if (!OUT_TYPES.includes(f?.type)) fail(400, "INVALID", `không nhận loại file ${f?.type}`);
        const name = String(f.name ?? "").split("/").map(safeName).join("/") || "file";
        return { path: `out/${jobId}/${name}`, type: f.type };
      })),
    };
  },

  async complete(b) {
    const id = str(b.worker_id, 60), jobId = uuid(b.job_id), r = b.result ?? {};
    const doc = cleanPath(r.doc);
    if (!doc.startsWith(`out/${jobId}/`)) fail(400, "INVALID", "kết quả thiếu đường dẫn doc cuối");
    const result = { doc, summary: str(r.summary, 600) };
    const [j] = await sql`update public.bone_jobs set status = 'done', stage = null, finished_at = now(),
        result = ${sql.json(result)}, error = null
      where id = ${jobId} and worker = ${id} and status = 'running' returning id`;
    if (!j) fail(409, "CONFLICT", "job không còn thuộc máy này (đã huỷ hoặc đã trả về hàng đợi)");
    await sql`update public.bone_workers set status = 'idle', current_job = null, jobs_done = jobs_done + 1,
      last_seen = now() where id = ${id}`;
    return { job: await getJob(jobId) };
  },

  async fail(b) {
    const id = str(b.worker_id, 60), jobId = uuid(b.job_id), error = str(b.error, 2000) || "lỗi không rõ";
    const requeue = b.requeue === true;
    const [j] = requeue
      ? await sql`update public.bone_jobs set status = 'queued', stage = null, worker = null,
          attempts = greatest(attempts - 1, 0) where id = ${jobId} and worker = ${id} and status = 'running' returning id`
      : await sql`update public.bone_jobs set status = 'failed', stage = null, finished_at = now(), error = ${error}
          where id = ${jobId} and worker = ${id} and status = 'running' returning id`;
    await sql`update public.bone_workers set current_job = null, last_seen = now(),
      status = case when status = 'busy' then 'idle' else status end where id = ${id}`;
    return { job: j ? await getJob(jobId) : null };
  },

  // ---- test-only: drive the queue without a hub account (worker key required) ----
  async test_submit(b) {
    const prompt = str(b.prompt, 4000);
    if (!prompt) fail(400, "INVALID", "chưa có yêu cầu");
    const params = parseParams(b.params);
    if (!params.only_worker) fail(400, "INVALID", "test_submit cần params.only_worker");
    const project = cleanPath(b.project);
    if (!project) fail(400, "INVALID", "thiếu project");
    return {
      job: await insertJob({
        created_by: TEST_USER,
        author: "test",
        title: str(b.title, 120) || prompt.slice(0, 60),
        prompt,
        project,
        refs: sql.json(Array.isArray(b.refs) ? b.refs.slice(0, 8).map((r: any) => ({ path: cleanPath(r?.path), kind: pick(r?.kind, ["image", "bundle"] as const, "image"), name: str(r?.name, 120) })) : []),
        context: sql.json(parseContext(b.context)),
        params: sql.json(params),
      }),
    };
  },

  async test_events(b) {
    return jobEvents(uuid(b.id), b.since);
  },

  async test_delete(b) {
    const id = uuid(b.id);
    const [j] = await sql`select created_by from public.bone_jobs where id = ${id}`;
    if (j && j.created_by !== TEST_USER) fail(403, "FORBIDDEN", "chỉ xoá được job do test_submit tạo");
    await sql`update public.bone_jobs set status = 'canceled' where id = ${id} and status = 'running'`;
    return deleteJob(id, null, true);
  },
};

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get("Origin"));
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { ok: false, error: { code: "INVALID", message: "chỉ nhận POST" } });
  try {
    await ensureReady();
    const body = await req.json().catch(() => fail(400, "INVALID", "body không phải JSON"));
    const action = String(body.action ?? "");
    let out: unknown;
    if (isWorker(req)) {
      const h = worker[action] ?? fail(400, "INVALID", `action máy lạ: ${action}`);
      out = await h(body);
    } else {
      const h = art[action] ?? fail(400, "INVALID", `action lạ: ${action}`);
      out = await h(body, await artUser(req));
    }
    return reply(200, { ok: true, ...(out as object) });
  } catch (e) {
    if (e instanceof ApiError) return reply(e.status, { ok: false, error: { code: e.code, message: e.message } });
    console.error(e);
    return reply(500, { ok: false, error: { code: "INTERNAL", message: String((e as Error)?.message ?? e) } });
  }
});
