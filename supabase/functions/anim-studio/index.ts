import postgres from "npm:postgres@3.4.5";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_KEY = Deno.env.get("ANIM_WORKER_KEY") ?? "";
const BUCKET = "anim";
const ONLINE_S = 45;
const STALE_S = 180;
const MAX_ATTEMPTS = 3;
const LOG_KEEP = 200;
const ART_ROLES = ["member", "artist", "admin"];

const ALLOWED_ORIGIN = "https://poke5121999-art.github.io";
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3, idle_timeout: 20 });

const DDL = `
create table if not exists public.anim_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  author text not null default '',
  title text not null default '',
  prompt text not null,
  prompt_en text,
  image jsonb not null,
  params jsonb not null default '{}',
  parent_id uuid references public.anim_jobs(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','done','failed','canceled')),
  stage text,
  worker text,
  attempts int not null default 0,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  progress jsonb,
  log jsonb not null default '[]',
  result jsonb,
  error text
);
create index if not exists anim_jobs_queue on public.anim_jobs (status, created_at);
alter table public.anim_jobs enable row level security;
create table if not exists public.anim_workers (
  id text primary key,
  label text not null default '',
  host text not null default '',
  account text not null default '',
  enabled boolean not null default true,
  priority int not null default 1,
  claim_delay_s int not null default 20,
  max_minutes int not null default 30,
  engine_default text not null default 'auto',
  min_free_gb int not null default 20,
  status text not null default 'idle',
  note text,
  current_job uuid,
  last_seen timestamptz,
  jobs_done int not null default 0
);
alter table public.anim_workers enable row level security;
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
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-anim-worker-key",
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
  if (!ART_ROLES.includes(role)) fail(403, "FORBIDDEN", `Tài khoản đang ở role "${role}", chưa được dùng Xưởng Anim. Nhờ admin duyệt thành member hoặc artist ở trang Duyệt tài khoản.`);
  return { id: u.id, email: u.email ?? "", role, isAdmin: role === "admin" };
}

function isWorker(req: Request) {
  const k = req.headers.get("x-anim-worker-key");
  return !!k && !!WORKER_KEY && k === WORKER_KEY;
}

const JOB_SUMMARY = sql`id, created_at, created_by, author, title, prompt, prompt_en, image, params, parent_id,
  status, stage, worker, attempts, claimed_at, heartbeat_at, finished_at, progress, result, error`;

const WORKER_COLS = sql`id, label, host, account, enabled, priority, claim_delay_s, max_minutes, engine_default, min_free_gb, note, current_job,
  last_seen, jobs_done,
  case when last_seen is null or last_seen < now() - make_interval(secs => ${ONLINE_S}) then 'offline' else status end as status`;

const ENGINES = ["auto", "framepack", "wan5b", "ltx"];
const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"];
const OUT_TYPES = ["image/png", "video/mp4", "application/json"];
const STAGES = ["setup", "rewriting", "load", "sample", "decode", "frames", "bg", "uploading"];
const WORKER_STATUS = ["idle", "busy", "paused", "quota", "lowmem"];
const MAX_FRAMES = 200;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const pick = <T extends string>(v: unknown, list: readonly T[], dflt: T): T => (list.includes(v as T) ? (v as T) : dflt);
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : fail(400, "INVALID", "id không hợp lệ"));
const safeName = (n: unknown) => (str(n, 80).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+/, "") || "file");
// tên file của worker: "video.mp4", "meta.json" hoặc "frames/0001.png" (một cấp thư mục)
const outName = (n: unknown) => {
  const m = /^(frames\/)?([A-Za-z0-9._-]{1,60})$/.exec(str(n, 80));
  return m ? (m[1] ?? "") + m[2] : safeName(n);
};

function parseParams(p: any) {
  p = p && typeof p === "object" ? p : {};
  const seed = typeof p.seed === "number" && isFinite(p.seed) ? Math.round(Math.min(2147483647, Math.max(0, p.seed))) : null;
  const steps = num(p.steps, 1, 200);
  return {
    engine: pick(p.engine, ENGINES, "auto"),
    seconds: Math.round((num(p.seconds, 1, 5) ?? 2) * 2) / 2,
    seed,
    steps: steps === null ? null : Math.round(steps),
    remove_bg: p.remove_bg === true,
    rewrite: p.rewrite !== false,
    only_worker: str(p.only_worker, 200) || null,
  };
}

function parseImage(im: any, userId: string) {
  const path = str(im?.path, 300);
  if (!path.startsWith(`refs/${userId}/`)) fail(400, "INVALID", `ảnh không thuộc người gửi: ${path}`);
  const dim = (v: unknown) => Math.round(num(v, 0, 16384) ?? 0);
  return { path, name: str(im?.name, 120), w: dim(im?.w), h: dim(im?.h) };
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

async function getJob(id: string, withLog = true) {
  const [j] = withLog ? await sql`select ${JOB_SUMMARY}, log from public.anim_jobs where id = ${id}`
    : await sql`select ${JOB_SUMMARY} from public.anim_jobs where id = ${id}`;
  return j ?? fail(404, "NOT_FOUND", "không có job này");
}

async function appendLog(id: string, stage: string | null, msg: string) {
  const line = sql.json([{ t: new Date().toISOString(), stage, msg: msg.slice(0, 500) }]);
  await sql`update public.anim_jobs set log = (
      select coalesce(jsonb_agg(e order by n), '[]'::jsonb) from (
        select e, n from jsonb_array_elements(log || ${line}) with ordinality as x(e, n)
        order by n desc limit ${LOG_KEEP}) y)
    where id = ${id}`;
}

async function reap() {
  const stale = await sql`update public.anim_jobs set
      status = case when attempts >= ${MAX_ATTEMPTS} then 'failed' else 'queued' end,
      error = case when attempts >= ${MAX_ATTEMPTS} then 'máy gen im lặng quá lâu ở cả ' || attempts || ' lần thử' else error end,
      finished_at = case when attempts >= ${MAX_ATTEMPTS} then now() else null end,
      stage = null, worker = null
    where status = 'running' and heartbeat_at < now() - make_interval(secs => ${STALE_S})
    returning id, status`;
  for (const j of stale) await appendLog(j.id, null, j.status === "queued" ? "máy gen mất liên lạc, trả job về hàng đợi" : "máy gen mất liên lạc, dừng job");
}

const art: Record<string, (b: any, u: User) => Promise<unknown>> = {
  async me(_b, u) {
    return { user: { id: u.id, email: u.email, role: u.role }, isAdmin: u.isAdmin };
  },

  async upload_urls(b, u) {
    const files = Array.isArray(b.files) ? b.files : [];
    if (files.length !== 1) fail(400, "INVALID", "mỗi job một ảnh");
    const f = files[0];
    if (!UPLOAD_TYPES.includes(f?.type)) fail(400, "INVALID", `không nhận loại file ${f?.type} (png, jpeg, webp)`);
    if (typeof f.size === "number" && f.size > 15 * 1024 * 1024) fail(400, "INVALID", `${f.name} lớn hơn 15 MB`);
    const stamp = crypto.randomUUID().slice(0, 8);
    return { files: await signUpload([{ path: `refs/${u.id}/${stamp}/${safeName(f.name)}`, type: f.type }]) };
  },

  async submit(b, u) {
    const prompt = str(b.prompt, 4000);
    if (!prompt) fail(400, "INVALID", "chưa có mô tả chuyển động");
    const [{ n }] = await sql`select count(*)::int as n from public.anim_jobs where created_by = ${u.id} and status in ('queued','running')`;
    if (n >= 6) fail(429, "TOO_MANY", "bạn đang có 6 job chờ hoặc đang gen, đợi bớt rồi gửi tiếp");
    const parent = b.parent_id ? uuid(b.parent_id) : null;
    if (parent) {
      const [p] = await sql`select status from public.anim_jobs where id = ${parent}`;
      if (!p || p.status !== "done") fail(400, "INVALID", "chỉ sửa tiếp được job đã xong");
    }
    const row = {
      created_by: u.id,
      author: u.email.split("@")[0],
      title: str(b.title, 120) || prompt.slice(0, 60),
      prompt,
      image: sql.json(parseImage(b.image, u.id)),
      params: sql.json(parseParams(b.params)),
      parent_id: parent,
    };
    const [j] = await sql`insert into public.anim_jobs ${sql(row)} returning id`;
    await appendLog(j.id, null, `${row.author} gửi yêu cầu`);
    return { job: await getJob(j.id) };
  },

  async list(b, u) {
    // page/page_size: trang đánh số (1 = mới nhất). limit (không kèm page/page_size): kiểu cũ, chỉ `limit` job mới nhất.
    const legacy = b.page === undefined && b.page_size === undefined && b.limit !== undefined;
    const size = legacy ? Math.round(num(b.limit, 1, 200) ?? 60) : Math.round(num(b.page_size, 1, 100) ?? 30);
    const where = b.mine ? sql`where created_by = ${u.id}` : sql``;
    const [{ n }] = await sql`select count(*)::int as n from public.anim_jobs ${where}`;
    const pages = Math.max(1, Math.ceil(n / size));
    const page = Math.min(pages, Math.max(1, Math.round(num(b.page, 1, 1e6) ?? 1)));
    const jobs = await sql`select ${JOB_SUMMARY} from public.anim_jobs ${where}
      order by created_at desc, id desc limit ${size} offset ${(page - 1) * size}`;
    return { jobs, total: n, page, page_size: size, pages };
  },

  async get(b) {
    const id = uuid(b.id);
    const job = await getJob(id);
    // các phiên bản: tổ tiên theo parent_id và con trực tiếp, để chuỗi phiên bản không phụ thuộc trang đang xem
    const family = await sql`with recursive anc as (
        select id, parent_id, 0 as d from public.anim_jobs where id = ${job.parent_id ?? null}
        union all select p.id, p.parent_id, a.d + 1 from public.anim_jobs p join anc a on p.id = a.parent_id where a.d < 20)
      select id, title, status, parent_id from public.anim_jobs where id in (select id from anc) or parent_id = ${id}`;
    return { job, family };
  },

  async cancel(b, u) {
    const id = uuid(b.id);
    const [j] = await sql`update public.anim_jobs set status = 'canceled', stage = null, finished_at = now()
      where id = ${id} and status in ('queued','running') and (created_by = ${u.id} or ${u.isAdmin})
      returning id`;
    if (!j) fail(409, "CONFLICT", "job không còn huỷ được, hoặc không phải của bạn");
    await appendLog(id, null, `${u.email.split("@")[0]} huỷ job`);
    return { job: await getJob(id) };
  },

  async retry(b, u) {
    const id = uuid(b.id);
    const [j] = await sql`update public.anim_jobs set status = 'queued', stage = null, worker = null, error = null,
        finished_at = null, attempts = 0, created_at = now(), progress = null, result = null, prompt_en = null
      where id = ${id} and status in ('failed','canceled') and (created_by = ${u.id} or ${u.isAdmin})
      returning id`;
    if (!j) fail(409, "CONFLICT", "job này không chạy lại được");
    await appendLog(id, null, `${u.email.split("@")[0]} cho chạy lại`);
    return { job: await getJob(id) };
  },

  async delete(b, u) {
    const id = uuid(b.id);
    const [j] = await sql`select status, created_by, image from public.anim_jobs where id = ${id}`;
    if (!j) fail(404, "NOT_FOUND", "không có job này");
    if (j.created_by !== u.id && !u.isAdmin) fail(403, "FORBIDDEN", "job này không phải của bạn");
    if (j.status === "running") fail(409, "CONFLICT", "job đang gen, huỷ trước rồi mới xoá");
    const [d] = await sql`delete from public.anim_jobs where id = ${id} and status <> 'running' returning id`;
    if (!d) fail(409, "CONFLICT", "job vừa được máy gen nhận, huỷ trước rồi mới xoá");
    // hàng đã xoá; dọn file sau. Lỗi Storage không làm hỏng lần xoá, chỉ báo lại.
    try {
      const refs = [j.image?.path].filter((p: unknown) => typeof p === "string" && p.startsWith("refs/")) as string[];
      const kept = refs.length ? (await sql`select distinct image->>'path' as p from public.anim_jobs
        where image->>'path' in ${sql(refs)}`).map((r: any) => r.p) : [];
      const paths = [...(await listFiles(`out/${id}/`)), ...(await listFiles(`out/${id}/frames/`)), ...refs.filter((p: string) => !kept.includes(p))];
      const removed = await removeFiles(paths);
      console.log(`anim delete ${id} by ${u.email}: ${removed}/${paths.length} file`);
      return { deleted: id, files_removed: removed };
    } catch (e) {
      console.error(`anim delete ${id}: dọn file lỗi`, e);
      return { deleted: id, files_removed: 0, files_error: String((e as Error).message) };
    }
  },

  async workers() {
    return { workers: await sql`select ${WORKER_COLS} from public.anim_workers order by priority, id` };
  },

  async worker_update(b, u) {
    if (!u.isAdmin) fail(403, "FORBIDDEN", "chỉ admin chỉnh được máy gen");
    const id = str(b.id, 60), p = b.patch ?? {};
    const patch: Record<string, unknown> = {};
    if (typeof p.enabled === "boolean") patch.enabled = p.enabled;
    if (num(p.priority, 0, 99) !== null) patch.priority = Math.round(p.priority);
    if (num(p.claim_delay_s, 0, 3600) !== null) patch.claim_delay_s = Math.round(p.claim_delay_s);
    if (num(p.max_minutes, 5, 180) !== null) patch.max_minutes = Math.round(p.max_minutes);
    if (ENGINES.includes(p.engine_default)) patch.engine_default = p.engine_default;
    if (num(p.min_free_gb, 0, 512) !== null) patch.min_free_gb = Math.round(p.min_free_gb);
    if (typeof p.label === "string") patch.label = str(p.label, 60);
    if (!Object.keys(patch).length) fail(400, "INVALID", "không có gì để đổi");
    const [w] = await sql`update public.anim_workers set ${sql(patch)} where id = ${id} returning id`;
    if (!w) fail(404, "NOT_FOUND", "không có máy gen này");
    const [row] = await sql`select ${WORKER_COLS} from public.anim_workers where id = ${id}`;
    return { worker: row };
  },
};

async function workerConfig(id: string) {
  const [w] = await sql`select ${WORKER_COLS} from public.anim_workers where id = ${id}`;
  return w ?? fail(404, "NOT_FOUND", `máy gen ${id} chưa chào (hello)`);
}

async function ownedRunning(workerId: string, jobId: string) {
  const [j] = await sql`select status, worker from public.anim_jobs where id = ${jobId}`;
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
      engine_default: ENGINES.includes(d.engine_default) ? d.engine_default : "auto",
      min_free_gb: Math.round(num(d.min_free_gb, 0, 512) ?? 20),
      max_minutes: num(d.max_minutes, 5, 180) ?? 30,
      status: "idle",
    };
    await sql`insert into public.anim_workers ${sql(row)}
      on conflict (id) do update set label = excluded.label, host = excluded.host, account = excluded.account,
        status = 'idle', current_job = null, note = null`;
    await sql`update public.anim_workers set last_seen = now() where id = ${id}`;
    await sql`update public.anim_jobs set status = 'queued', stage = null, worker = null
      where worker = ${id} and status = 'running'`;
    return { config: await workerConfig(id) };
  },

  async claim(b) {
    const id = str(b.worker_id, 60);
    await reap();
    await sql`update public.anim_workers set last_seen = now() where id = ${id}`;
    const config = await workerConfig(id);
    if (!config.enabled || config.status === "lowmem") return { job: null, config };
    const [j] = await sql`
      with me as (select * from public.anim_workers where id = ${id}),
      pick as (
        select j.id from public.anim_jobs j, me
        where j.status = 'queued'
          and (j.params->>'only_worker' is null or me.id = any(string_to_array(j.params->>'only_worker', ',')))
          and (
          j.created_at <= now() - make_interval(secs => me.claim_delay_s)
          or not exists (
            select 1 from public.anim_workers o
            where o.enabled and o.priority < me.priority and o.status = 'idle'
              and (j.params->>'only_worker' is null or o.id = any(string_to_array(j.params->>'only_worker', ',')))
              and o.last_seen > now() - make_interval(secs => ${ONLINE_S})))
        order by j.created_at
        for update of j skip locked
        limit 1)
      update public.anim_jobs j set status = 'running', worker = ${id}, stage = 'setup', attempts = j.attempts + 1,
        claimed_at = now(), heartbeat_at = now(), error = null
      from pick where j.id = pick.id
      returning j.id`;
    if (!j) return { job: null, config };
    await sql`update public.anim_workers set status = 'busy', current_job = ${j.id}, note = null where id = ${id}`;
    await appendLog(j.id, "setup", `${config.label} nhận job`);
    const job = await getJob(j.id);
    return { job, config: await workerConfig(id) };
  },

  async bye(b) {
    const id = str(b.worker_id, 60);
    await sql`update public.anim_jobs set status = 'queued', stage = null, worker = null
      where worker = ${id} and status = 'running'`;
    await sql`delete from public.anim_workers where id = ${id}`;
    return { deleted: id };
  },

  async heartbeat(b) {
    const id = str(b.worker_id, 60);
    const status = pick(b.status, WORKER_STATUS, "idle");
    const jobId = b.job_id ? uuid(b.job_id) : null;
    await sql`update public.anim_workers set last_seen = now(), status = ${status}, note = ${str(b.note, 200) || null},
      current_job = ${jobId} where id = ${id}`;
    let job_status = null;
    if (jobId) {
      const [j] = await sql`update public.anim_jobs set heartbeat_at = now() where id = ${jobId} and worker = ${id}
        returning status`;
      job_status = j?.status ?? "lost";
    }
    return { config: await workerConfig(id), job_status };
  },

  async progress(b) {
    const id = str(b.worker_id, 60), jobId = uuid(b.job_id);
    if (!(await ownedRunning(id, jobId))) return { job_status: (await getJob(jobId, false)).status };
    const stage = pick(b.stage, STAGES, "setup");
    const step = num(b.step, 0, 1e6), total = num(b.total, 0, 1e6);
    const prog = step !== null && total !== null ? sql.json({ stage, step, total }) : null;
    const en = str(b.prompt_en, 1000) || null;
    await sql`update public.anim_jobs set stage = ${stage}, heartbeat_at = now(),
      progress = ${prog}, prompt_en = coalesce(${en}, prompt_en) where id = ${jobId}`;
    await sql`update public.anim_workers set last_seen = now() where id = ${id}`;
    if (b.msg) await appendLog(jobId, stage, str(b.msg, 500));
    return { job_status: "running" };
  },

  async upload_urls(b) {
    const jobId = uuid(b.job_id);
    const files = Array.isArray(b.files) ? b.files.slice(0, MAX_FRAMES + 8) : [];
    if (!files.length) fail(400, "INVALID", "không có file");
    return {
      files: await signUpload(files.map((f: any) => {
        if (!OUT_TYPES.includes(f?.type)) fail(400, "INVALID", `không nhận loại file ${f?.type}`);
        return { path: `out/${jobId}/${outName(f.name)}`, type: f.type };
      })),
    };
  },

  async complete(b) {
    const id = str(b.worker_id, 60), jobId = uuid(b.job_id), r = b.result ?? {};
    const pre = `out/${jobId}/`;
    const f = r.files ?? {};
    const frames = (Array.isArray(f.frames) ? f.frames : []).filter((p: unknown) => typeof p === "string" && p.startsWith(pre + "frames/")).slice(0, MAX_FRAMES);
    if (!frames.length) fail(400, "INVALID", "kết quả không có khung hình nào");
    const files = {
      video: typeof f.video === "string" && f.video.startsWith(pre) ? f.video : null,
      meta: typeof f.meta === "string" && f.meta.startsWith(pre) ? f.meta : null,
      frames,
    };
    const n = (v: unknown, lo: number, hi: number) => num(v, lo, hi) ?? 0;
    const result = {
      engine: str(r.engine, 40), fps: n(r.fps, 1, 120), width: n(r.width, 0, 16384), height: n(r.height, 0, 16384),
      frames: frames.length, seconds: n(r.seconds, 0, 60), seed: typeof r.seed === "number" ? Math.round(r.seed) : null,
      timings: r.timings && typeof r.timings === "object" ? r.timings : {}, files,
    };
    const [j] = await sql`update public.anim_jobs set status = 'done', stage = null, progress = null, finished_at = now(),
        result = ${sql.json(result)}, error = null
      where id = ${jobId} and worker = ${id} and status = 'running' returning id`;
    if (!j) fail(409, "CONFLICT", "job không còn thuộc máy này (đã huỷ hoặc đã trả về hàng đợi)");
    await sql`update public.anim_workers set status = 'idle', current_job = null, jobs_done = jobs_done + 1,
      last_seen = now() where id = ${id}`;
    await appendLog(jobId, null, `xong: ${frames.length} khung, ${result.fps} fps`);
    return { job: await getJob(jobId) };
  },

  async fail(b) {
    const id = str(b.worker_id, 60), jobId = uuid(b.job_id), error = str(b.error, 2000) || "lỗi không rõ";
    const requeue = b.requeue === true;
    const [j] = requeue
      ? await sql`update public.anim_jobs set status = 'queued', stage = null, worker = null, progress = null,
          attempts = greatest(attempts - 1, 0) where id = ${jobId} and worker = ${id} and status = 'running' returning id`
      : await sql`update public.anim_jobs set status = 'failed', stage = null, finished_at = now(), error = ${error}
          where id = ${jobId} and worker = ${id} and status = 'running' returning id`;
    await sql`update public.anim_workers set current_job = null, last_seen = now(),
      status = case when status = 'busy' then 'idle' else status end where id = ${id}`;
    if (j) await appendLog(jobId, null, requeue ? `trả job về hàng đợi: ${error}` : `hỏng: ${error}`);
    return { job: j ? await getJob(jobId) : null };
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
      const h = worker[action] ?? fail(400, "INVALID", `action máy gen lạ: ${action}`);
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
