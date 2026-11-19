// Xưởng 3D: hàng đợi job dựng model 3D (shape → texture → rig). Hợp đồng: docs/gen3d-studio.md.
// Chép kiến trúc từ supabase/functions/vfx-studio: auth hub + role, worker key, ưu tiên nhường, reaper, tự tạo bảng.
import postgres from "npm:postgres@3.4.5";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_KEY = Deno.env.get("GEN3D_WORKER_KEY") ?? "";
const BUCKET = "gen3d";
const ONLINE_S = 45;
const STALE_S = 180;
const MAX_ATTEMPTS = 3;
const LOG_KEEP = 200;
const ART_ROLES = ["member", "artist", "admin"];

const ALLOWED_ORIGIN = "https://poke5121999-art.github.io";
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3, idle_timeout: 20 });

const DDL = `
create table if not exists public.gen3d_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  author text not null default '',
  title text not null default '',
  kind text not null check (kind in ('shape','texture','rig')),
  parent_id uuid references public.gen3d_jobs(id) on delete cascade,
  root_id uuid,
  params jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','done','failed','canceled')),
  stage text,
  worker text,
  attempts int not null default 0,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  log jsonb not null default '[]',
  preview text,
  result jsonb,
  error text
);
create index if not exists gen3d_jobs_queue on public.gen3d_jobs (status, created_at);
create index if not exists gen3d_jobs_root on public.gen3d_jobs (root_id);
alter table public.gen3d_jobs enable row level security;
create table if not exists public.gen3d_workers (
  id text primary key,
  label text not null default '',
  host text not null default '',
  caps jsonb not null default '["shape","texture","rig"]',
  enabled boolean not null default true,
  priority int not null default 1,
  claim_delay_s int not null default 20,
  status text not null default 'idle',
  note text,
  current_job uuid,
  last_seen timestamptz,
  jobs_done int not null default 0,
  gpu jsonb,
  mem jsonb
);
alter table public.gen3d_workers enable row level security;
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
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-gen3d-worker-key",
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
  if (!ART_ROLES.includes(role)) fail(403, "FORBIDDEN", `Tài khoản đang ở role "${role}", chưa được dùng Xưởng 3D. Nhờ admin duyệt thành member hoặc artist ở trang Duyệt tài khoản.`);
  return { id: u.id, email: u.email ?? "", role, isAdmin: role === "admin" };
}

function isWorker(req: Request) {
  const k = req.headers.get("x-gen3d-worker-key");
  return !!k && !!WORKER_KEY && k === WORKER_KEY;
}

const JOB_SUMMARY = sql`id, created_at, created_by, author, title, kind, parent_id, root_id, params,
  status, stage, worker, attempts, claimed_at, heartbeat_at, finished_at, preview, result, error,
  case when status = 'queued' and params->>'only_worker' is null then (
    select count(*)::int from public.gen3d_jobs q
    where q.params->>'only_worker' is null
      and (q.status = 'running' or (q.status = 'queued' and q.created_at < gen3d_jobs.created_at))) end as queue_ahead`;

const WORKER_COLS = sql`id, label, host, caps, enabled, priority, claim_delay_s, note, current_job,
  last_seen, jobs_done, gpu, mem,
  case when last_seen is null or last_seen < now() - make_interval(secs => ${ONLINE_S}) then 'offline' else status end as status`;

const KINDS = ["shape", "texture", "rig"] as const;
const VIEWS = ["front", "back", "left", "right"] as const;
const QUALITIES = ["2K", "4K", "8K"] as const;
const TOPOLOGIES = ["triangle", "quad"] as const;
const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp", "model/gltf-binary"];
const MB = 1024 * 1024;
const OUT_TYPES = ["model/gltf-binary", "image/png", "image/jpeg", "image/webp", "application/json"];
const STAGES = ["setup", "segment", "generate", "optimize", "delight", "project", "inpaint", "bake", "skeleton", "skin", "uploading"];
const WORKER_STATUS = ["idle", "busy", "paused", "lowmem"];
const RESULT_FILES = ["glb", "raw_glb", "thumb", "albedo", "orm", "normal"];
const STAT_KEYS = ["tris", "quads", "verts", "bytes", "seconds", "vram_peak_mb"];

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const pick = <T extends string>(v: unknown, list: readonly T[], dflt: T): T => (list.includes(v as T) ? (v as T) : dflt);
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : fail(400, "INVALID", "id không hợp lệ"));
const safeName = (n: unknown) => (str(n, 80).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+/, "") || "file");
const parseCaps = (v: unknown) => {
  const caps = Array.isArray(v) ? KINDS.filter((k) => v.includes(k)) : [];
  return caps.length ? caps : [...KINDS];
};
const smallObj = (v: unknown) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string | number> = {};
  for (const [k, x] of Object.entries(v).slice(0, 8)) {
    if (typeof x === "number" && isFinite(x)) out[k.slice(0, 30)] = Math.round(x * 100) / 100;
    else if (typeof x === "string") out[k.slice(0, 30)] = x.slice(0, 80);
  }
  return out;
};

function parseTexture(p: any) {
  p = p && typeof p === "object" ? p : {};
  return {
    quality: pick(p.quality, QUALITIES, "4K"),
    ai_complete: p.ai_complete === true,
    remove_lighting: p.remove_lighting === true,
    pbr: p.pbr === true,
  };
}

function parseParams(kind: string, p: any, userId: string) {
  p = p && typeof p === "object" ? p : {};
  const only_worker = str(p.only_worker, 200) || null;
  if (kind === "texture") return { ...parseTexture(p), only_worker };
  if (kind === "rig") return { skeleton: "mixamo", only_worker };
  const views: Record<string, string> = {};
  for (const v of VIEWS) {
    const path = str(p.views?.[v], 300);
    if (!path) continue;
    if (!path.startsWith(`refs/${userId}/`)) fail(400, "INVALID", `ảnh ${v} không thuộc người gửi: ${path}`);
    views[v] = path;
  }
  if (!Object.keys(views).length) fail(400, "INVALID", "cần ít nhất 1 ảnh (trước, sau, trái hoặc phải)");
  return {
    views,
    ultra: p.ultra === true,
    topology: pick(p.topology, TOPOLOGIES, "triangle"),
    polycount: Math.round(num(p.polycount, 500, 2_000_000) ?? 100_000),
    seed: Math.round(num(p.seed, 0, 2_147_483_647) ?? Math.floor(Math.random() * 2_147_483_647)),
    texture: p.texture && typeof p.texture === "object" ? parseTexture(p.texture) : null,
    source: "generate",
    only_worker,
  };
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

async function getJob(id: string, withLog = true) {
  const [j] = withLog ? await sql`select ${JOB_SUMMARY}, log from public.gen3d_jobs where id = ${id}`
    : await sql`select ${JOB_SUMMARY} from public.gen3d_jobs where id = ${id}`;
  return j ?? fail(404, "NOT_FOUND", "không có job này");
}

async function appendLog(id: string, stage: string | null, msg: string) {
  const line = sql.json([{ t: new Date().toISOString(), stage, msg: msg.slice(0, 500) }]);
  await sql`update public.gen3d_jobs set log = (
      select coalesce(jsonb_agg(e order by n), '[]'::jsonb) from (
        select e, n from jsonb_array_elements(log || ${line}) with ordinality as x(e, n)
        order by n desc limit ${LOG_KEEP}) y)
    where id = ${id}`;
}

async function reap() {
  const stale = await sql`update public.gen3d_jobs set
      status = case when attempts >= ${MAX_ATTEMPTS} then 'failed' else 'queued' end,
      error = case when attempts >= ${MAX_ATTEMPTS} then 'máy gen im lặng quá lâu ở cả ' || attempts || ' lần thử' else error end,
      finished_at = case when attempts >= ${MAX_ATTEMPTS} then now() else null end,
      stage = null, worker = null
    where status = 'running' and heartbeat_at < now() - make_interval(secs => ${STALE_S})
    returning id, status`;
  for (const j of stale) await appendLog(j.id, null, j.status === "queued" ? "máy gen mất liên lạc, trả job về hàng đợi" : "máy gen mất liên lạc, dừng job");
}

// Job con texture/rig cần job cha đã xong và có glb. texture chỉ đi sau shape; rig đi sau shape hoặc texture.
async function checkParent(kind: string, parentId: string) {
  const [p] = await sql`select id, kind, status, root_id, result, params from public.gen3d_jobs where id = ${parentId}`;
  if (!p) fail(400, "INVALID", "không có job cha này");
  if (p.status !== "done" || typeof p.result?.files?.glb !== "string") fail(400, "INVALID", "job cha chưa xong hoặc chưa có file glb");
  if (kind === "texture" && p.kind !== "shape") fail(400, "INVALID", "texture chỉ gen được trên mesh của job shape");
  if (kind === "rig" && p.kind === "rig") fail(400, "INVALID", "model này đã có xương; rig từ job shape hoặc texture");
  return p;
}

async function insertJob(row: Record<string, unknown>, who: string, msg: string) {
  const [j] = await sql`insert into public.gen3d_jobs ${sql(row)} returning id`;
  if (!row.root_id) await sql`update public.gen3d_jobs set root_id = id where id = ${j.id}`;
  await appendLog(j.id, null, `${who} ${msg}`);
  return j.id as string;
}

const art: Record<string, (b: any, u: User) => Promise<unknown>> = {
  async me(_b, u) {
    return { user: { id: u.id, email: u.email, role: u.role }, isAdmin: u.isAdmin };
  },

  async upload_urls(b, u) {
    const files = Array.isArray(b.files) ? b.files : [];
    if (!files.length || files.length > 4) fail(400, "INVALID", "gửi từ 1 tới 4 file");
    const stamp = crypto.randomUUID().slice(0, 8);
    const list = files.map((f: any, i: number) => {
      if (!UPLOAD_TYPES.includes(f?.type)) fail(400, "INVALID", `không nhận loại file ${f?.type}`);
      const max = f.type === "model/gltf-binary" ? 50 * MB : 15 * MB;
      if (typeof f.size === "number" && f.size > max) fail(400, "INVALID", `${f.name} lớn hơn ${max / MB} MB`);
      return { path: `refs/${u.id}/${stamp}/${i}-${safeName(f.name)}`, type: f.type };
    });
    return { files: await signUpload(list) };
  },

  async submit(b, u) {
    const kind = pick(b.kind, KINDS, "shape");
    const [{ n }] = await sql`select count(*)::int as n from public.gen3d_jobs where created_by = ${u.id} and status in ('queued','running')`;
    if (n >= 6) fail(429, "TOO_MANY", "bạn đang có 6 job chờ hoặc đang gen, đợi bớt rồi gửi tiếp");
    let parent: any = null;
    if (kind !== "shape") {
      if (!b.parent_id) fail(400, "INVALID", `job ${kind} cần parent_id`);
      parent = await checkParent(kind, uuid(b.parent_id));
    }
    const params = parseParams(kind, b.params, u.id);
    if (parent && !params.only_worker && parent.params?.only_worker) params.only_worker = parent.params.only_worker;
    const author = u.email.split("@")[0];
    const id = await insertJob({
      created_by: u.id,
      author,
      title: str(b.title, 120) || (parent ? "" : "Model mới"),
      kind,
      parent_id: parent?.id ?? null,
      root_id: parent?.root_id ?? null,
      params: sql.json(params),
    }, author, kind === "shape" ? "gửi ảnh dựng model" : `gửi gen ${kind === "texture" ? "texture" : "xương"}`);
    if (parent && !(b.title ?? "").trim()) {
      await sql`update public.gen3d_jobs c set title = p.title from public.gen3d_jobs p where c.id = ${id} and p.id = ${parent.root_id}`;
    }
    return { job: await getJob(id) };
  },

  // Model người dùng tự tải lên (glb; OBJ/FBX/STL trang đổi sang glb trước): thành job shape đã xong, không qua máy gen,
  // để gen texture hay gen xương tiếp như model máy dựng.
  async import_model(b, u) {
    const own = (v: unknown, ext: RegExp) => {
      const path = str(v, 300);
      if (!path) return null;
      if (!path.startsWith(`refs/${u.id}/`) || !ext.test(path)) fail(400, "INVALID", `file không thuộc người gửi hoặc sai loại: ${path}`);
      return path;
    };
    const glb = own(b.glb, /.glb$/i) ?? fail(400, "INVALID", "thiếu glb");
    const thumb = own(b.thumb, /.(png|jpe?g|webp)$/i);
    const stats: Record<string, number> = {};
    for (const k of ["tris", "verts", "bytes"]) if (typeof b.stats?.[k] === "number" && isFinite(b.stats[k])) stats[k] = Math.round(b.stats[k]);
    const author = u.email.split("@")[0];
    const id = await insertJob({
      created_by: u.id, author, title: str(b.title, 120) || "Model tải lên", kind: "shape",
      params: sql.json({ source: "upload", file_name: str(b.file_name, 120) || null, views: {}, topology: "triangle" }),
      status: "done", finished_at: new Date(), result: sql.json({ files: { glb, ...(thumb ? { thumb } : {}) }, stats }),
    }, author, "tải model lên");
    return { job: await getJob(id) };
  },

  async list(b, u) {
    const limit = num(b.limit, 1, 200) ?? 60;
    const jobs = b.mine
      ? await sql`select ${JOB_SUMMARY} from public.gen3d_jobs where created_by = ${u.id} order by created_at desc limit ${limit}`
      : await sql`select ${JOB_SUMMARY} from public.gen3d_jobs order by created_at desc limit ${limit}`;
    return { jobs };
  },

  async get(b) {
    return { job: await getJob(uuid(b.id)) };
  },

  async chain(b) {
    const j = await getJob(uuid(b.id), false);
    const jobs = await sql`select ${JOB_SUMMARY} from public.gen3d_jobs where root_id = ${j.root_id ?? j.id} order by created_at`;
    return { root_id: j.root_id ?? j.id, jobs };
  },

  async cancel(b, u) {
    const id = uuid(b.id);
    const [j] = await sql`update public.gen3d_jobs set status = 'canceled', stage = null, finished_at = now()
      where id = ${id} and status in ('queued','running') and (created_by = ${u.id} or ${u.isAdmin})
      returning id`;
    if (!j) fail(409, "CONFLICT", "job không còn huỷ được, hoặc không phải của bạn");
    await appendLog(id, null, `${u.email.split("@")[0]} huỷ job`);
    return { job: await getJob(id) };
  },

  async retry(b, u) {
    const id = uuid(b.id);
    const [j] = await sql`update public.gen3d_jobs set status = 'queued', stage = null, worker = null, error = null,
        finished_at = null, attempts = 0, created_at = now()
      where id = ${id} and status in ('failed','canceled') and (created_by = ${u.id} or ${u.isAdmin})
      returning id`;
    if (!j) fail(409, "CONFLICT", "job này không chạy lại được");
    await appendLog(id, null, `${u.email.split("@")[0]} cho chạy lại`);
    return { job: await getJob(id) };
  },

  // Xoá một job xoá luôn các phiên bản con của nó (FK on delete cascade). Không xoá khi có job nào trong nhánh đang gen.
  async delete(b, u) {
    const id = uuid(b.id);
    const [busy] = await sql`with recursive t as (
        select id, status from public.gen3d_jobs where id = ${id}
        union all select c.id, c.status from public.gen3d_jobs c join t on c.parent_id = t.id)
      select count(*)::int as n from t where status = 'running'`;
    if (busy.n > 0) fail(409, "CONFLICT", "job này hoặc một phiên bản con đang gen, huỷ trước rồi xoá");
    const [j] = await sql`delete from public.gen3d_jobs
      where id = ${id} and (created_by = ${u.id} or ${u.isAdmin}) returning id`;
    if (!j) fail(409, "CONFLICT", "không có job này, hoặc không phải của bạn");
    return { deleted: id };
  },

  async workers() {
    return { workers: await sql`select ${WORKER_COLS} from public.gen3d_workers order by priority, id` };
  },

  async worker_update(b, u) {
    if (!u.isAdmin) fail(403, "FORBIDDEN", "chỉ admin chỉnh được máy gen");
    const id = str(b.id, 60), p = b.patch ?? {};
    const patch: Record<string, unknown> = {};
    if (typeof p.enabled === "boolean") patch.enabled = p.enabled;
    if (num(p.priority, 0, 99) !== null) patch.priority = Math.round(p.priority);
    if (num(p.claim_delay_s, 0, 3600) !== null) patch.claim_delay_s = Math.round(p.claim_delay_s);
    if (typeof p.label === "string") patch.label = str(p.label, 60);
    if (!Object.keys(patch).length) fail(400, "INVALID", "không có gì để đổi");
    const [w] = await sql`update public.gen3d_workers set ${sql(patch)} where id = ${id} returning id`;
    if (!w) fail(404, "NOT_FOUND", "không có máy gen này");
    const [row] = await sql`select ${WORKER_COLS} from public.gen3d_workers where id = ${id}`;
    return { worker: row };
  },
};

async function workerConfig(id: string) {
  const [w] = await sql`select ${WORKER_COLS} from public.gen3d_workers where id = ${id}`;
  return w ?? fail(404, "NOT_FOUND", `máy gen ${id} chưa chào (hello)`);
}

async function ownedRunning(workerId: string, jobId: string) {
  const [j] = await sql`select status, worker from public.gen3d_jobs where id = ${jobId}`;
  if (!j) fail(404, "NOT_FOUND", "không có job này");
  return j.worker === workerId && j.status === "running";
}

const worker: Record<string, (b: any) => Promise<unknown>> = {
  async hello(b) {
    const w = b.worker ?? {}, d = w.defaults ?? {};
    const id = str(w.id, 60);
    if (!/^[a-z0-9._-]+:[a-z0-9._-]+$/i.test(id)) fail(400, "INVALID", "worker.id phải có dạng máy:tên");
    const row = {
      id,
      label: str(w.label, 60) || id,
      host: str(w.host, 60),
      caps: sql.json(parseCaps(w.caps)),
      priority: num(d.priority, 0, 99) ?? 1,
      claim_delay_s: num(d.claim_delay_s, 0, 3600) ?? 20,
      status: "idle",
      gpu: sql.json(smallObj(w.gpu)),
      mem: sql.json(smallObj(w.mem)),
    };
    await sql`insert into public.gen3d_workers ${sql(row)}
      on conflict (id) do update set label = excluded.label, host = excluded.host, caps = excluded.caps,
        gpu = excluded.gpu, mem = excluded.mem, status = 'idle', current_job = null, note = null`;
    await sql`update public.gen3d_workers set last_seen = now() where id = ${id}`;
    await sql`update public.gen3d_jobs set status = 'queued', stage = null, worker = null
      where worker = ${id} and status = 'running'`;
    return { config: await workerConfig(id) };
  },

  async claim(b) {
    const id = str(b.worker_id, 60);
    await reap();
    await sql`update public.gen3d_workers set last_seen = now() where id = ${id}`;
    const config = await workerConfig(id);
    if (!config.enabled) return { job: null, config };
    // Một hàng đợi chung cho cả xưởng: job không ghim máy (only_worker) chạy lần lượt từng cái một, kể cả khi
    // nhiều máy cùng rảnh. Khoá advisory làm hai máy claim cùng lúc không cùng thấy "chưa có job nào chạy".
    const [j] = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('gen3d-claim'))`;
      return tx`
      with me as (select * from public.gen3d_workers where id = ${id}),
      busy as (select exists (select 1 from public.gen3d_jobs
        where status = 'running' and params->>'only_worker' is null) as running),
      pick as (
        select j.id from public.gen3d_jobs j, me, busy
        where j.status = 'queued'
          and (j.params->>'only_worker' is not null or not busy.running)
          and me.caps ? j.kind
          and (j.params->>'only_worker' is null or me.id = any(string_to_array(j.params->>'only_worker', ',')))
          and (
          j.created_at <= now() - make_interval(secs => me.claim_delay_s)
          or not exists (
            select 1 from public.gen3d_workers o
            where o.enabled and o.priority < me.priority and o.status = 'idle'
              and o.caps ? j.kind
              and (j.params->>'only_worker' is null or o.id = any(string_to_array(j.params->>'only_worker', ',')))
              and o.last_seen > now() - make_interval(secs => ${ONLINE_S})))
        order by j.created_at
        for update of j skip locked
        limit 1)
      update public.gen3d_jobs j set status = 'running', worker = ${id}, stage = 'setup', attempts = j.attempts + 1,
        claimed_at = now(), heartbeat_at = now(), error = null
      from pick where j.id = pick.id
      returning j.id`;
    });
    if (!j) return { job: null, config };
    await sql`update public.gen3d_workers set status = 'busy', current_job = ${j.id}, note = null where id = ${id}`;
    await appendLog(j.id, "setup", `${config.label} nhận job`);
    const job = await getJob(j.id);
    if (job.parent_id) job.parent = await getJob(job.parent_id, false);
    if (job.root_id && job.root_id !== job.id) job.root = await getJob(job.root_id, false);
    return { job, config: await workerConfig(id) };
  },

  async bye(b) {
    const id = str(b.worker_id, 60);
    await sql`update public.gen3d_jobs set status = 'queued', stage = null, worker = null
      where worker = ${id} and status = 'running'`;
    await sql`delete from public.gen3d_workers where id = ${id}`;
    return { deleted: id };
  },

  async heartbeat(b) {
    const id = str(b.worker_id, 60);
    const status = pick(b.status, WORKER_STATUS, "idle");
    const jobId = b.job_id ? uuid(b.job_id) : null;
    const gpu = smallObj(b.gpu), mem = smallObj(b.mem);
    await sql`update public.gen3d_workers set last_seen = now(), status = ${status}, note = ${str(b.note, 200) || null},
      current_job = ${jobId}, gpu = coalesce(${gpu ? sql.json(gpu) : null}, gpu), mem = coalesce(${mem ? sql.json(mem) : null}, mem)
      where id = ${id}`;
    let job_status = null;
    if (jobId) {
      const [j] = await sql`update public.gen3d_jobs set heartbeat_at = now() where id = ${jobId} and worker = ${id}
        returning status`;
      job_status = j?.status ?? "lost";
    }
    return { config: await workerConfig(id), job_status };
  },

  async progress(b) {
    const id = str(b.worker_id, 60), jobId = uuid(b.job_id);
    if (!(await ownedRunning(id, jobId))) return { job_status: (await getJob(jobId, false)).status };
    const stage = pick(b.stage, STAGES, "generate");
    const preview = typeof b.preview === "string" && b.preview.startsWith(`out/${jobId}/`) ? b.preview : null;
    await sql`update public.gen3d_jobs set stage = ${stage}, heartbeat_at = now(),
      preview = coalesce(${preview}, preview) where id = ${jobId}`;
    await sql`update public.gen3d_workers set last_seen = now() where id = ${id}`;
    if (b.msg) await appendLog(jobId, stage, str(b.msg, 500));
    return { job_status: "running" };
  },

  async upload_urls(b) {
    const jobId = uuid(b.job_id);
    const files = Array.isArray(b.files) ? b.files.slice(0, 16) : [];
    if (!files.length) fail(400, "INVALID", "không có file");
    return {
      files: await signUpload(files.map((f: any) => {
        if (!OUT_TYPES.includes(f?.type)) fail(400, "INVALID", `không nhận loại file ${f?.type}`);
        const name = str(f.name, 120).split("/").map(safeName).join("/");
        return { path: `out/${jobId}/${name}`, type: f.type };
      })),
    };
  },

  // Thư viện anim Mixamo dùng chung: gen3d/mixamo/<file>. Chỉ tools/gen3d-worker/seed-mixamo.mjs, import-mixamo.mjs gọi.
  async mixamo_upload_urls(b) {
    const files = Array.isArray(b.files) ? b.files.slice(0, 200) : [];
    if (!files.length) fail(400, "INVALID", "không có file");
    return {
      files: await signUpload(files.map((f: any) => {
        if (!["model/gltf-binary", "application/json"].includes(f?.type)) fail(400, "INVALID", `không nhận loại file ${f?.type}`);
        return { path: `mixamo/${safeName(f.name)}`, type: f.type };
      })),
    };
  },

  async complete(b) {
    const id = str(b.worker_id, 60), jobId = uuid(b.job_id), r = b.result ?? {};
    const inJob = (p: unknown) => typeof p === "string" && p.startsWith(`out/${jobId}/`);
    const files: Record<string, unknown> = {};
    for (const k of RESULT_FILES) if (inJob(r.files?.[k])) files[k] = r.files[k];
    const vc = r.files?.views_clean;
    if (vc && typeof vc === "object") {
      const clean: Record<string, string> = {};
      for (const v of VIEWS) if (inJob(vc[v])) clean[v] = vc[v];
      if (Object.keys(clean).length) files.views_clean = clean;
    }
    if (!files.glb) fail(400, "INVALID", "kết quả thiếu glb");
    const stats: Record<string, number> = {};
    for (const k of STAT_KEYS) if (typeof r.stats?.[k] === "number" && isFinite(r.stats[k])) stats[k] = r.stats[k];
    const result = { files, stats };
    const [j] = await sql`update public.gen3d_jobs set status = 'done', stage = null, finished_at = now(),
        result = ${sql.json(result)}, error = null
      where id = ${jobId} and worker = ${id} and status = 'running' returning id, kind, params, created_by, author, root_id`;
    if (!j) fail(409, "CONFLICT", "job không còn thuộc máy này (đã huỷ hoặc đã trả về hàng đợi)");
    await sql`update public.gen3d_workers set status = 'idle', current_job = null, jobs_done = jobs_done + 1,
      last_seen = now() where id = ${id}`;
    await appendLog(jobId, null, `xong${stats.tris ? `: ${stats.tris} tam giác` : ""}`);
    // Công tắc Texture bật lúc gửi shape: tự ra job con texture.
    let child = null;
    if (j.kind === "shape" && j.params?.texture) {
      const [root] = await sql`select title from public.gen3d_jobs where id = ${j.root_id}`;
      child = await insertJob({
        created_by: j.created_by, author: j.author, title: root?.title ?? "", kind: "texture",
        parent_id: jobId, root_id: j.root_id ?? jobId,
        params: sql.json({ ...parseTexture(j.params.texture), only_worker: j.params.only_worker ?? null }),
      }, j.author, "bật Texture lúc gửi, tự gen texture sau shape");
    }
    return { job: await getJob(jobId), child_id: child };
  },

  async fail(b) {
    const id = str(b.worker_id, 60), jobId = uuid(b.job_id), error = str(b.error, 2000) || "lỗi không rõ";
    const requeue = b.requeue === true;
    const [j] = requeue
      ? await sql`update public.gen3d_jobs set status = 'queued', stage = null, worker = null,
          attempts = greatest(attempts - 1, 0) where id = ${jobId} and worker = ${id} and status = 'running' returning id`
      : await sql`update public.gen3d_jobs set status = 'failed', stage = null, finished_at = now(), error = ${error}
          where id = ${jobId} and worker = ${id} and status = 'running' returning id`;
    await sql`update public.gen3d_workers set current_job = null, last_seen = now(),
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
