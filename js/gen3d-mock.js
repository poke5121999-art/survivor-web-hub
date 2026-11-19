/* API giả cho gen3d.html?mock=1 và gen3d-anim.html?mock=1: job trong bộ nhớ, tự chạy queued -> running -> done.
   Model kết quả là mẫu của three.js (chỉ để thử giao diện). Không dùng ở bản thật. */
const EX = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/";
const GLB = { shape: EX + "LeePerrySmith/LeePerrySmith.glb", texture: EX + "Soldier.glb", rig: EX + "Xbot.glb" };
const STAGES = {
  shape: [["setup", "Tải ảnh vào máy"], ["segment", "Tách nền 1 ảnh"], ["generate", "TripoSG dựng hình"], ["optimize", "Giảm lưới theo polycount"], ["uploading", "Tải kết quả lên"]],
  texture: [["setup", "Tải mesh và ảnh"], ["delight", "Khử sáng"], ["project", "Chiếu ảnh lên mesh"], ["inpaint", "Vẽ bù vùng mù"], ["bake", "Bake atlas"], ["uploading", "Tải kết quả lên"]],
  rig: [["setup", "Tải mesh"], ["skeleton", "Đặt xương mixamorig"], ["skin", "Tính skin weights"], ["uploading", "Tải kết quả lên"]],
};
const STEP_MS = 900;
const iso = () => new Date().toISOString();
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const ME = { id: "u-mock", email: "tester@hub.local", role: "admin" };
const blobs = {};

export function storeBlob(path, blob) { blobs[path] = URL.createObjectURL(blob); }
export function blobUrl(path) { return blobs[path] || thumbs[path] || ""; }

const thumbs = {};
function thumb(key, hue, label) {
  if (thumbs[key]) return key;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const bg = g.createRadialGradient(128, 110, 10, 128, 128, 180);
  bg.addColorStop(0, "#3a3b42"); bg.addColorStop(1, "#16171b");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  const s = g.createRadialGradient(105, 95, 8, 128, 128, 80);
  s.addColorStop(0, `hsl(${hue} 70% 80%)`); s.addColorStop(1, `hsl(${hue} 45% 28%)`);
  g.fillStyle = s; g.beginPath(); g.arc(128, 128, 78, 0, 7); g.fill();
  if (key.startsWith("mock/view")) { g.fillStyle = "#fff"; g.font = "bold 15px sans-serif"; g.textAlign = "center"; g.fillText(label, 128, 236); }
  thumbs[key] = c.toDataURL("image/png");
  return key;
}

const workers = [
  { id: "pc:gen3d", label: "PC · RTX 3050", host: "HOB-THOR", caps: ["shape", "texture", "rig"], enabled: true, priority: 0, claim_delay_s: 0, status: "idle", note: null, current_job: null, last_seen: iso(), jobs_done: 23,
    gpu: { name: "NVIDIA GeForce RTX 3050", vram_total_mb: 8192, vram_free_mb: 5600 }, mem: { commit_free_gb: 14.2, ram_free_gb: 9.1 } },
  { id: "linux2:gen3d", label: "linux2", host: "NHANNGO", caps: ["shape", "rig"], enabled: true, priority: 1, claim_delay_s: 30, status: "lowmem", note: "VRAM trống 2.1 GB < 4 GB", current_job: null, last_seen: iso(), jobs_done: 4,
    gpu: { name: "NVIDIA GeForce RTX 3060", vram_total_mb: 12288, vram_free_mb: 2150 }, mem: { ram_free_gb: 11.4 } },
  { id: "linux:gen3d", label: "linux", host: "linux", caps: ["rig"], enabled: false, priority: 2, claim_delay_s: 60, status: "paused", note: "tắt từ trang admin", current_job: null, last_seen: ago(600), jobs_done: 0,
    gpu: null, mem: { ram_free_gb: 20.5 } },
];
const jobs = [];

function mk(kind, o) {
  const id = o.id || "mock-" + Math.random().toString(36).slice(2, 8);
  return {
    id, created_at: iso(), created_by: ME.id, author: "tester", title: "Model", kind, parent_id: null, root_id: id, params: {},
    status: "queued", stage: null, worker: null, attempts: 0, claimed_at: null, heartbeat_at: null, finished_at: null,
    log: [{ t: iso(), stage: null, msg: "Job vào hàng đợi" }], preview: null, result: null, error: null, ...o,
  };
}
function doneResult(kind, title) {
  const hue = { shape: 220, texture: 25, rig: 160 }[kind];
  const stats = { shape: { tris: 19740, verts: 9871, bytes: 1180000, seconds: 74, vram_peak_mb: 5120 }, texture: { tris: 19740, verts: 9871, bytes: 4300000, seconds: 131 }, rig: { tris: 19740, verts: 9871, bytes: 2900000, seconds: 22 } }[kind];
  return { files: { glb: GLB[kind], thumb: thumb("mock/" + kind + "-" + title, hue, title + " · " + kind) }, stats };
}
function seed() {
  const v = { front: thumb("mock/view-front", 200, "ảnh trước"), left: thumb("mock/view-left", 210, "ảnh trái") };
  const s = mk("shape", { id: "seed-shape", created_at: ago(5400), title: "Đầu tượng", author: "mai", created_by: "u-other", params: { views: v, ultra: false, topology: "triangle", polycount: 20000, seed: 4242, texture: null },
    status: "done", worker: "pc:gen3d", attempts: 1, claimed_at: ago(5390), finished_at: ago(5300), result: doneResult("shape", "Đầu tượng") });
  s.log.push({ t: ago(5390), stage: "setup", msg: "PC · RTX 3050 nhận job" }, { t: ago(5300), stage: null, msg: "xong: 19740 tam giác" });
  const t = mk("texture", { id: "seed-texture", created_at: ago(5200), title: "Đầu tượng", author: "mai", created_by: "u-other", parent_id: s.id, root_id: s.id, params: { quality: "4K", ai_complete: true, remove_lighting: true, pbr: false },
    status: "done", worker: "pc:gen3d", attempts: 1, claimed_at: ago(5190), finished_at: ago(5050), result: doneResult("texture", "Đầu tượng") });
  const r = mk("rig", { id: "seed-rig", created_at: ago(5000), title: "Đầu tượng", author: "mai", created_by: "u-other", parent_id: t.id, root_id: s.id, params: { skeleton: "mixamo" },
    status: "done", worker: "pc:gen3d", attempts: 1, claimed_at: ago(4990), finished_at: ago(4960), result: doneResult("rig", "Đầu tượng") });
  const f = mk("shape", { id: "seed-failed", created_at: ago(9000), title: "Ghế gỗ", params: { views: { front: thumb("mock/view-chair", 30, "ghế") }, ultra: true, topology: "quad", polycount: 8000, seed: 7, texture: null },
    status: "failed", stage: "generate", worker: "linux2:gen3d", attempts: 1, claimed_at: ago(8990), finished_at: ago(8900), error: "pipeline shape thoát mã 1: CUDA out of memory" });
  jobs.push(r, t, s, f);
}
seed();

function advance(job) {
  const w = workers.find((x) => x.enabled && x.status !== "lowmem" && x.caps.includes(job.kind)) || workers[0];
  w.status = "busy"; w.current_job = job.id; w.last_seen = iso();
  Object.assign(job, { status: "running", worker: w.id, attempts: job.attempts + 1, claimed_at: iso(), heartbeat_at: iso() });
  job.log.push({ t: iso(), stage: "setup", msg: `${w.label} nhận job` });
  let i = 0;
  const step = () => {
    if (job.status !== "running") { w.status = "idle"; w.current_job = null; return; }
    const st = STAGES[job.kind];
    if (i >= st.length) {
      Object.assign(job, { status: "done", stage: null, finished_at: iso(), result: doneResult(job.kind, job.title) });
      job.log.push({ t: iso(), stage: null, msg: "xong" });
      w.status = "idle"; w.current_job = null; w.jobs_done++;
      if (job.kind === "shape" && job.params.texture) {
        const c = mk("texture", { title: job.title, parent_id: job.id, root_id: job.root_id, params: { ...job.params.texture } });
        c.log.push({ t: iso(), stage: null, msg: "bật Texture lúc gửi, tự gen texture sau shape" });
        jobs.unshift(c); queue(c);
      }
      return;
    }
    const [stage, msg] = st[i++];
    job.stage = stage; job.heartbeat_at = iso();
    job.log.push({ t: iso(), stage, msg });
    if (stage === "generate" || stage === "bake") job.preview = thumb("mock/prev-" + job.id + stage, 40 * i, "xem trước " + stage);
    setTimeout(step, STEP_MS);
  };
  step();
}
const queue = (job) => setTimeout(() => { if (job.status === "queued") advance(job); }, STEP_MS);
const pub = (j) => { const { log, ...rest } = j; return JSON.parse(JSON.stringify(rest)); };
const fail = (code, message) => { const e = new Error(message); e.mock = { code, message }; throw e; };

export async function call(action, body = {}) {
  await new Promise((r) => setTimeout(r, 100));
  const find = (id = body.id) => jobs.find((j) => j.id === id) || fail("NOT_FOUND", "không có job này");
  switch (action) {
    case "me": return { ok: true, user: ME, isAdmin: true };
    case "upload_urls": {
      const stamp = Date.now();
      return { ok: true, files: (body.files || []).map((f, i) => { const path = `refs/mock/${stamp}/${i}-${f.name}`; return { path, uploadUrl: "mock://put/" + path, publicUrl: "" }; }) };
    }
    case "submit": {
      const kind = body.kind || "shape";
      let parent = null;
      if (kind !== "shape") {
        parent = find(body.parent_id);
        if (parent.status !== "done") fail("INVALID", "job cha chưa xong hoặc chưa có file glb");
        if (kind === "texture" && parent.kind !== "shape") fail("INVALID", "texture chỉ gen được trên mesh của job shape");
      } else if (!body.params || !body.params.views || !Object.keys(body.params.views).length) fail("INVALID", "cần ít nhất 1 ảnh");
      const job = mk(kind, { title: body.title || (parent ? find(parent.root_id).title : "Model mới"), params: body.params || {}, parent_id: parent ? parent.id : null });
      job.root_id = parent ? parent.root_id : job.id;
      jobs.unshift(job); queue(job);
      return { ok: true, job: pub(job) };
    }
    case "import_model": {
      const job = mk("shape", { title: body.title || "Model tải lên", params: { source: "upload", file_name: body.file_name, views: {}, topology: "triangle" }, status: "done", finished_at: iso(),
        result: { files: { glb: body.glb, ...(body.thumb ? { thumb: body.thumb } : {}) }, stats: body.stats || {} } });
      job.log.push({ t: iso(), stage: null, msg: "tester tải model lên" });
      jobs.unshift(job);
      return { ok: true, job: pub(job) };
    }
    case "list": return { ok: true, jobs: jobs.filter((j) => !body.mine || j.created_by === ME.id).slice(0, body.limit || 60).map(pub) };
    case "get": return { ok: true, job: JSON.parse(JSON.stringify(find())) };
    case "chain": { const j = find(); return { ok: true, root_id: j.root_id, jobs: jobs.filter((x) => x.root_id === j.root_id).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(pub) }; }
    case "cancel": { const j = find(); if (j.status === "queued" || j.status === "running") { j.status = "canceled"; j.finished_at = iso(); j.log.push({ t: iso(), stage: null, msg: "tester huỷ job" }); } return { ok: true, job: pub(j) }; }
    case "retry": { const j = find(); Object.assign(j, { status: "queued", error: null, stage: null, finished_at: null, created_at: iso() }); j.log.push({ t: iso(), stage: null, msg: "tester cho chạy lại" }); queue(j); return { ok: true, job: pub(j) }; }
    case "delete": {
      const gone = new Set([body.id]);
      for (let k = 0; k < 5; k++) jobs.forEach((x) => { if (gone.has(x.parent_id)) gone.add(x.id); });
      for (let i = jobs.length - 1; i >= 0; i--) if (gone.has(jobs[i].id)) jobs.splice(i, 1);
      return { ok: true, deleted: body.id };
    }
    case "workers": workers.forEach((w) => { if (w.enabled) w.last_seen = iso(); }); return { ok: true, workers: JSON.parse(JSON.stringify(workers)) };
    case "worker_update": { const w = workers.find((x) => x.id === body.id) || fail("NOT_FOUND", "không có máy gen này"); Object.assign(w, body.patch || {}); return { ok: true, worker: JSON.parse(JSON.stringify(w)) }; }
    default: fail("INVALID", "action lạ: " + action);
  }
}
