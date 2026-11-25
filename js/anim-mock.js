/* API giả cho anim.html?mock=1: job nằm trong bộ nhớ, tự chạy queued -> running -> done và sinh khung hình bằng canvas. Không dùng ở bản thật. */

const STAGES = ["setup", "rewriting", "load", "sample", "decode", "frames", "bg", "uploading"];
const STAGE_MSG = {
  setup: "Tải ảnh, dựng thư mục làm việc",
  rewriting: "Viết lại mô tả thành prompt chuyển động tiếng Anh",
  load: "Nạp model vào GPU",
  sample: "Sample khung tiềm ẩn",
  decode: "Giải mã video",
  frames: "Tách video thành khung PNG",
  bg: "Xoá nền",
  uploading: "Tải khung hình lên",
};
const STEP_MS = 700;
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const iso = () => new Date().toISOString();
const ME = { id: "u-mock", email: "tester@hub.local", role: "admin" };

/** Nhân vật pixel nhỏ nhún nhảy: khung i trên n. Trả data URL PNG nền trong suốt. */
export function drawFrame(i, n, w = 160, h = 200, hue = 210) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  const t = (i / n) * Math.PI * 2, bob = Math.round(Math.sin(t * 2) * 4), sway = Math.round(Math.sin(t) * 6), arm = Math.sin(t) * 14;
  const px = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), ww, hh); };
  const cx = w / 2 + sway / 2;
  px(cx - 26, h - 22, 52, 6, "rgba(0,0,0,0.25)");
  px(cx - 20, 118 + bob, 14, 54, `hsl(${hue} 40% 30%)`);
  px(cx + 6, 118 + bob, 14, 54, `hsl(${hue} 40% 30%)`);
  px(cx - 26, 62 + bob, 52, 64, `hsl(${hue} 65% 52%)`);
  px(cx - 26, 62 + bob, 52, 8, `hsl(${hue} 70% 68%)`);
  px(cx - 40, 66 + bob + arm * 0.4, 14, 46, `hsl(${hue} 60% 44%)`);
  px(cx + 26, 66 + bob - arm, 14, 46, `hsl(${hue} 60% 44%)`);
  px(cx + 26, 56 + bob - arm, 14, 12, "#f2c9a0");
  px(cx - 22, 18 + bob, 44, 44, "#f2c9a0");
  px(cx - 26, 10 + bob, 52, 16, `hsl(${(hue + 150) % 360} 55% 35%)`);
  px(cx - 12, 36 + bob, 6, 6, "#222");
  px(cx + 6, 36 + bob, 6, 6, "#222");
  px(cx - 6, 50 + bob, 12, 3, "#a64");
  return c.toDataURL("image/png");
}

function doneResult(seed, frames = 24, hue = 210) {
  const files = Array.from({ length: frames }, (_, i) => drawFrame(i, frames, 160, 200, hue));
  return {
    engine: "fake", fps: 16, width: 160, height: 200, frames, seconds: frames / 16, seed,
    timings: { load: 4.1, sample: 38.2, decode: 3.5, frames: 0.9, total: 47.6 },
    files: { video: null, meta: null, frames: files },
  };
}

const state = {
  jobs: [],
  uploads: [],
  blobs: {},
  workers: [
    { id: "linux:claude", label: "Linux · claude", host: "linux", account: "claude", enabled: true, priority: 0, claim_delay_s: 0, max_minutes: 30, engine_default: "auto", min_free_gb: 20, status: "busy", note: "", current_job: null, last_seen: iso(), jobs_done: 41 },
    { id: "pc:claude", label: "PC · claude", host: "pc", account: "claude", enabled: true, priority: 1, claim_delay_s: 20, max_minutes: 30, engine_default: "auto", min_free_gb: 20, status: "lowmem", note: "commit trống 12.4 GB < 20 GB", current_job: null, last_seen: iso(), jobs_done: 5 },
  ],
};
window.__animMock = state;

function seed() {
  const base = { created_by: "u-other", author: "mai", refs: [], parent_id: null, attempts: 1, error: null, progress: null };
  state.jobs.push({
    ...base, id: "seed-done", created_at: ago(3600), title: "Hiệp sĩ vẫy tay", prompt: "Hiệp sĩ vẫy tay chào, nhún nhẹ", prompt_en: "The knight waves one hand in greeting while bobbing gently, standing in place.",
    image: { path: "mock/in.png", name: "hiep-si.png", w: 160, h: 200 }, params: { engine: "auto", seconds: 1.5, seed: 1234, steps: null, remove_bg: true, rewrite: true, only_worker: null },
    status: "done", stage: null, worker: "linux:claude", claimed_at: ago(3500), heartbeat_at: ago(3000), finished_at: ago(2900),
    log: [{ t: ago(3500), stage: "setup", msg: "Linux · claude nhận job" }, { t: ago(2900), stage: null, msg: "xong: 24 khung, 16 fps" }],
    result: doneResult(1234, 24, 210),
  });
  state.jobs.push({
    ...base, id: "seed-failed", created_at: ago(7200), created_by: "u-mock", author: "tester", title: "Rồng bay", prompt: "Rồng vỗ cánh bay lên", prompt_en: null,
    image: { path: "mock/in2.png", name: "rong.png", w: 512, h: 512 }, params: { engine: "wan5b", seconds: 3, seed: null, steps: null, remove_bg: false, rewrite: true, only_worker: null },
    status: "failed", stage: null, worker: "pc:claude", claimed_at: ago(7000), heartbeat_at: ago(6800), finished_at: ago(6700),
    log: [{ t: ago(7000), stage: "setup", msg: "PC · claude nhận job" }, { t: ago(6700), stage: null, msg: "hỏng: engine thoát mã 1: CUDA out of memory" }], result: null, error: "engine thoát mã 1: CUDA out of memory",
  });
}
seed();
state.blobs["mock/in.png"] = drawFrame(0, 24, 160, 200, 210);
state.blobs["mock/in2.png"] = drawFrame(5, 24, 160, 200, 300);

function advance(job) {
  const w = state.workers[0];
  w.status = "busy"; w.current_job = job.id; w.last_seen = iso();
  job.status = "running"; job.worker = w.id; job.attempts += 1; job.claimed_at = iso(); job.heartbeat_at = iso();
  let i = 0, step = 0;
  const tick = () => {
    if (job.status !== "running") { w.status = "idle"; w.current_job = null; return; }
    if (i >= STAGES.length) {
      job.status = "done"; job.stage = null; job.progress = null; job.finished_at = iso();
      job.result = doneResult(job.params.seed ?? 7, Math.round(16 * job.params.seconds), 20 + (job.title.length * 23) % 300);
      job.log.push({ t: iso(), stage: null, msg: `xong: ${job.result.frames} khung, 16 fps` });
      w.status = "idle"; w.current_job = null; w.jobs_done += 1; w.last_seen = iso();
      return;
    }
    const st = STAGES[i];
    job.stage = st; job.heartbeat_at = iso(); w.last_seen = iso();
    if (st === "sample") {
      if (step === 0) job.log.push({ t: iso(), stage: st, msg: STAGE_MSG[st] });
      step += 5;
      job.progress = { stage: st, step, total: 20 };
      if (step >= 20) { i++; step = 0; }
    } else {
      job.log.push({ t: iso(), stage: st, msg: STAGE_MSG[st] });
      job.progress = null;
      if (st === "rewriting") job.prompt_en = "The character gently waves one hand while standing in place, camera static.";
      i++;
    }
    setTimeout(tick, STEP_MS);
  };
  tick();
}
function queue(job) { setTimeout(() => { if (job.status === "queued") advance(job); }, STEP_MS); }

const pub = (j) => { const { log, ...rest } = j; return JSON.parse(JSON.stringify(rest)); };
const fail = (code, message) => { const e = new Error(message); e.mock = { code, message }; throw e; };

export async function call(action, body = {}) {
  await new Promise((r) => setTimeout(r, 80));
  const find = () => state.jobs.find((j) => j.id === body.id) || fail("not_found", "Không tìm thấy job");
  switch (action) {
    case "me": return { ok: true, user: ME, isAdmin: true };
    case "upload_urls": {
      const f = (body.files || [])[0] || {};
      const path = `refs/mock/${Date.now()}-${f.name}`;
      return { ok: true, files: [{ path, uploadUrl: "mock://put/" + path, publicUrl: "mock://pub/0" }] };
    }
    case "submit": {
      const id = "mock-" + Math.random().toString(36).slice(2, 8);
      const p = body.params || {};
      const job = {
        id, created_at: iso(), created_by: ME.id, author: "tester", title: body.title || String(body.prompt).slice(0, 40), prompt: body.prompt, prompt_en: null,
        image: body.image, params: { engine: "auto", seconds: 2, seed: null, steps: null, remove_bg: false, rewrite: true, only_worker: null, ...p },
        parent_id: body.parent_id || null, status: "queued", stage: null, worker: null, attempts: 0, claimed_at: null, heartbeat_at: null, finished_at: null,
        progress: null, log: [{ t: iso(), stage: null, msg: "tester gửi yêu cầu" }], result: null, error: null,
      };
      state.jobs.unshift(job);
      queue(job);
      return { ok: true, job: pub(job) };
    }
    case "list": {
      let jobs = state.jobs.slice();
      if (body.mine) jobs = jobs.filter((j) => j.created_by === ME.id);
      const size = Math.min(100, body.page_size || 30);
      const pages = Math.max(1, Math.ceil(jobs.length / size));
      const page = Math.min(pages, Math.max(1, body.page || 1));
      return { ok: true, jobs: jobs.slice((page - 1) * size, page * size).map(pub), total: jobs.length, page, page_size: size, pages };
    }
    case "get": {
      const j = find(), fam = [];
      for (let c = j, n = 0; c.parent_id && n < 20; n++) { c = state.jobs.find((x) => x.id === c.parent_id); if (!c) break; fam.push(c); }
      fam.push(...state.jobs.filter((x) => x.parent_id === j.id));
      return { ok: true, job: JSON.parse(JSON.stringify(j)), family: fam.map(({ id, title, status, parent_id }) => ({ id, title, status, parent_id })) };
    }
    case "delete": {
      const j = find();
      if (j.status === "running") fail("CONFLICT", "job đang gen, huỷ trước rồi mới xoá");
      state.jobs = state.jobs.filter((x) => x !== j);
      state.jobs.forEach((x) => { if (x.parent_id === j.id) x.parent_id = null; });
      return { ok: true, deleted: j.id, files_removed: 0 };
    }
    case "cancel": {
      const j = find();
      if (j.status === "queued" || j.status === "running") { j.status = "canceled"; j.finished_at = iso(); j.progress = null; j.log.push({ t: iso(), stage: j.stage, msg: "tester huỷ job" }); }
      return { ok: true, job: pub(j) };
    }
    case "retry": {
      const j = find();
      j.status = "queued"; j.error = null; j.stage = null; j.finished_at = null; j.progress = null; j.result = null; j.log.push({ t: iso(), stage: null, msg: "tester cho chạy lại" });
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
