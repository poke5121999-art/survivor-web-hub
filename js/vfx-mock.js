/* API giả cho vfx.html?mock=1: job nằm trong bộ nhớ, tự chạy queued -> running -> done. Không dùng ở bản thật. */

const STAGES = ["setup", "drafting", "refining", "checking", "rendering", "uploading"];
const STAGE_MSG = {
  setup: "Dựng thư mục làm việc, chép ảnh tham chiếu",
  drafting: "Claude phác bản đầu của effect",
  refining: "Chỉnh nhịp và màu cho khớp mô tả",
  checking: "Chạy kiểm tra: khung hình, viền, độ sáng",
  rendering: "Render contact sheet và GIF",
  uploading: "Tải kết quả lên",
};
const STEP_MS = 1000;
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const iso = () => new Date().toISOString();

const ME = { id: "u-mock", email: "tester@hub.local", role: "admin" };

function fakePng(text, hue) {
  const c = document.createElement("canvas");
  c.width = 320; c.height = 180;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 320, 180);
  grad.addColorStop(0, `hsl(${hue} 60% 14%)`);
  grad.addColorStop(1, `hsl(${(hue + 50) % 360} 70% 30%)`);
  g.fillStyle = grad; g.fillRect(0, 0, 320, 180);
  g.fillStyle = `hsl(${hue} 90% 65%)`;
  for (let i = 0; i < 12; i++) g.fillRect(40 + i * 20, 130 - ((i * 37) % 70), 12, 12);
  g.fillStyle = "#fff"; g.font = "bold 14px sans-serif";
  g.fillText(String(text).slice(0, 34), 12, 24);
  return c.toDataURL("image/png");
}

const state = {
  jobs: [],
  uploads: [],
  blobs: {},
  workers: [
    { id: "linux:claude", label: "linux · claude", host: "linux", account: "claude", enabled: true, priority: 0, claim_delay_s: 0, model: "opus", max_minutes: 25, status: "busy", note: "", current_job: null, last_seen: iso(), jobs_done: 41 },
    { id: "pc:claude", label: "PC · claude", host: "pc", account: "claude", enabled: true, priority: 1, claim_delay_s: 20, model: "sonnet", max_minutes: 20, status: "idle", note: "", current_job: null, last_seen: iso(), jobs_done: 12 },
    { id: "pc:claude2", label: "PC · claude2", host: "pc", account: "claude2", enabled: true, priority: 2, claim_delay_s: 20, model: "sonnet", max_minutes: 20, status: "idle", note: "", current_job: null, last_seen: iso(), jobs_done: 7 },
  ],
};
window.__vfxMock = state;

function doneResult(name) {
  return {
    effect_id: "studio/campfire", name, desc: "Lửa trại mẫu dùng cho chế độ giả lập.",
    meta: { size: [128, 128], origin: [64, 112], duration: 3, loop: true, fps: 30, options: {} },
    files: { src: "mock/campfire.bundle.js", bundle: "mock/campfire.bundle.js", gif: null, contact: fakePng(name, 20), sheet_png: null, sheet_json: null },
  };
}

function seed() {
  state.jobs.push({
    id: "seed-done", created_at: ago(3600), created_by: "u-other", author: "mai", title: "Lửa trại ban đêm", prompt: "Lửa trại nhỏ ban đêm, tàn lửa bay lên, lặp",
    refs: [], params: { kind: "loop", size: "M", duration: null, fps: null, palette: null, actor: "no", category: "fire" }, base_effect: null, parent_id: null,
    status: "done", stage: null, worker: "linux:claude", attempts: 1, claimed_at: ago(3500), heartbeat_at: ago(3000), finished_at: ago(2900),
    log: [{ t: ago(3500), stage: "setup", msg: "Nhận job" }, { t: ago(2900), stage: "uploading", msg: "Xong" }], preview: null, result: doneResult("Lửa trại ban đêm"), error: null,
  });
  state.jobs.push({
    id: "seed-failed", created_at: ago(7200), created_by: "u-mock", author: "tester", title: "Cổng dịch chuyển", prompt: "Cổng dịch chuyển tím xoay, nổ sao khi mở",
    refs: [], params: { kind: "oneshot", size: "L", duration: null, fps: null, palette: null, actor: "auto", category: null }, base_effect: null, parent_id: null,
    status: "failed", stage: "checking", worker: "pc:claude", attempts: 2, claimed_at: ago(7000), heartbeat_at: ago(6800), finished_at: ago(6700),
    log: [{ t: ago(7000), stage: "setup", msg: "Nhận job" }, { t: ago(6700), stage: "checking", msg: "Kiểm tra không qua: viền cắt mất 3 pixel" }], preview: null, result: null, error: "Kiểm tra không qua: viền cắt mất 3 pixel",
  });
}
seed();

function advance(job) {
  const w = state.workers[0];
  w.status = "busy"; w.current_job = job.id; w.last_seen = iso();
  job.status = "running"; job.worker = w.id; job.attempts += 1; job.claimed_at = iso(); job.heartbeat_at = iso();
  let i = 0;
  const step = () => {
    if (job.status !== "running") { w.status = "idle"; w.current_job = null; return; }
    if (i >= STAGES.length) {
      job.status = "done"; job.stage = null; job.finished_at = iso(); job.result = doneResult(job.title || "Effect mới");
      job.log.push({ t: iso(), stage: "uploading", msg: "Xong, đã tải kết quả lên" });
      w.status = "idle"; w.current_job = null; w.jobs_done += 1; w.last_seen = iso();
      return;
    }
    const st = STAGES[i++];
    job.stage = st; job.heartbeat_at = iso(); w.last_seen = iso();
    job.log.push({ t: iso(), stage: st, msg: STAGE_MSG[st] });
    if (st === "drafting" || st === "refining" || st === "rendering") {
      job.preview = fakePng(`${job.title || "job"} · ${st}`, 20 + i * 40);
      job.log.push({ t: iso(), stage: st, msg: `Cập nhật ảnh xem trước (${i}/6)` });
    }
    setTimeout(step, STEP_MS);
  };
  step();
}

function queue(job) { setTimeout(() => { if (job.status === "queued") advance(job); }, STEP_MS); }

const pub = (j) => { const { log, ...rest } = j; return JSON.parse(JSON.stringify(rest)); };
const fail = (code, message) => { const e = new Error(message); e.mock = { code, message }; throw e; };

export function publicUrl(path) {
  if (!path) return "";
  if (path.startsWith("data:")) return path;
  return new URL("vfx/" + path, location.href).href;
}

export async function call(action, body = {}) {
  await new Promise((r) => setTimeout(r, 120));
  const find = () => state.jobs.find((j) => j.id === body.id) || fail("not_found", "Không tìm thấy job");
  switch (action) {
    case "me": return { ok: true, user: ME, isAdmin: true };
    case "upload_urls": {
      const stamp = Date.now();
      return { ok: true, files: (body.files || []).map((f, i) => ({ path: `refs/mock/${stamp}-${i}-${f.name}`, uploadUrl: "mock://put/" + `refs/mock/${stamp}-${i}-${f.name}`, publicUrl: "mock://pub/" + i })) };
    }
    case "submit": {
      const id = "mock-" + Math.random().toString(36).slice(2, 8);
      const job = {
        id, created_at: iso(), created_by: ME.id, author: "tester", title: body.title || String(body.prompt).slice(0, 40), prompt: body.prompt,
        refs: body.refs || [], params: body.params || {}, base_effect: body.base_effect || null, parent_id: body.parent_id || null,
        status: "queued", stage: null, worker: null, attempts: 0, claimed_at: null, heartbeat_at: null, finished_at: null,
        log: [{ t: iso(), stage: null, msg: "Job vào hàng đợi" }], preview: null, result: null, error: null,
      };
      state.jobs.unshift(job);
      queue(job);
      return { ok: true, job: pub(job) };
    }
    case "list": {
      let jobs = state.jobs.slice();
      if (body.mine) jobs = jobs.filter((j) => j.created_by === ME.id);
      return { ok: true, jobs: jobs.slice(0, body.limit || 60).map(pub) };
    }
    case "get": return { ok: true, job: JSON.parse(JSON.stringify(find())) };
    case "cancel": {
      const j = find();
      if (j.status === "queued" || j.status === "running") { j.status = "canceled"; j.finished_at = iso(); j.log.push({ t: iso(), stage: j.stage, msg: "Đã huỷ" }); }
      return { ok: true, job: pub(j) };
    }
    case "retry": {
      const j = find();
      j.status = "queued"; j.error = null; j.stage = null; j.finished_at = null; j.log.push({ t: iso(), stage: null, msg: "Thử lại" });
      queue(j);
      return { ok: true, job: pub(j) };
    }
    case "workers": state.workers.forEach((w) => { if (w.status !== "offline") w.last_seen = iso(); }); return { ok: true, workers: JSON.parse(JSON.stringify(state.workers)) };
    case "worker_update": {
      const w = state.workers.find((x) => x.id === body.id) || fail("not_found", "Không tìm thấy máy");
      Object.assign(w, body.patch || {});
      return { ok: true, worker: JSON.parse(JSON.stringify(w)) };
    }
    default: fail("bad_action", "Hành động lạ: " + action);
  }
}
