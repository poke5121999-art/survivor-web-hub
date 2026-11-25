/*
 * Xưởng Anim (anim.html). Hợp đồng API, vòng đời job, hình dạng dữ liệu: docs/anim-studio.md.
 * Cùng khung với Xưởng VFX (js/vfx-studio.js); khác ở chỗ sau khi job xong là trình sửa khung hình ngay trong trình duyệt.
 * ?mock=1 dùng API giả trong js/anim-mock.js.
 */
const MOCK = /[?&]mock=1\b/.test(location.search);
const CFG = window.SUPABASE_CONFIG || {};
const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
const GIFENC_URL = "https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js";

const STAGES = [["setup", "Chuẩn bị"], ["rewriting", "Viết prompt"], ["load", "Nạp model"], ["sample", "Sinh khung"], ["decode", "Giải mã"], ["frames", "Tách khung"], ["bg", "Xoá nền"], ["uploading", "Tải lên"]];
const STATUS = { queued: ["Đang chờ", "wait"], running: ["Đang làm", "run"], done: ["Xong", "ok"], failed: ["Lỗi", "bad"], canceled: ["Đã huỷ", "off"] };
const WSTATUS = { idle: ["Rảnh", "ok"], busy: ["Đang làm", "run"], paused: ["Tạm dừng", "wait"], quota: ["Hết hạn mức", "bad"], lowmem: ["Thiếu bộ nhớ", "wait"], offline: ["Offline", "off"] };
const ENGINES = [["auto", "Tự chọn"], ["framepack", "FramePack"], ["wan5b", "Wan 2.2 5B"], ["ltx", "LTX"]];
const EXAMPLES = [
  "Nhân vật thở nhẹ, đứng yên chờ (lặp)",
  "Vẫy tay chào rồi hạ tay xuống",
  "Vung kiếm chém ngang một lần",
  "Đi bộ tại chỗ, tay vung nhịp nhàng",
  "Nhảy lên rồi tiếp đất, áo choàng bay",
];
const ACCEPT = /^image\/(png|jpeg|webp)$/;
const TABS = [["new", "Tạo mới"], ["jobs", "Job của đội"], ["workers", "Máy gen"]];
const BG_LABEL = { checker: "Ô caro", dark: "Tối", light: "Sáng", color: "Màu" };

/* ---------- tiện ích ---------- */
// replaceChildren(null) chèn chữ "null"; nhiều chỗ truyền điều kiện ? node : null
const nativeReplace = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function (...k) { return nativeReplace.apply(this, k.flat().filter((c) => c != null && c !== false)); };
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style") e.style.cssText = v;
    else if (["value", "checked", "disabled", "hidden", "selected"].includes(k)) e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function toast(msg) {
  const t = h("div", { class: "dz-toast", text: msg });
  $("an-toasts").append(t);
  setTimeout(() => t.classList.add("is-out"), 2600);
  setTimeout(() => t.remove(), 3000);
}
function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + " giây";
  const m = Math.floor(s / 60);
  if (m < 60) return m + " phút " + String(s % 60).padStart(2, "0") + " giây";
  return Math.floor(m / 60) + " giờ " + (m % 60) + " phút";
}
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString("vi-VN", { hour12: false }) : "");
function ago(iso) {
  if (!iso) return "chưa từng";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  return s < 5 ? "vừa xong" : fmtDur(s * 1000) + " trước";
}
function elapsedSpan(job) {
  const t0 = job.status === "queued" ? job.created_at : job.claimed_at || job.created_at;
  const live = job.status === "queued" || job.status === "running";
  return h("span", { class: "an-el", "data-t0": Date.parse(t0), "data-t1": live ? "" : Date.parse(job.finished_at || t0), "data-pre": job.status === "queued" ? "chờ " : live ? "" : "mất " });
}
function tickElapsed() {
  for (const e of document.querySelectorAll(".an-el")) {
    const t0 = +e.dataset.t0, t1 = e.dataset.t1 ? +e.dataset.t1 : Date.now();
    e.textContent = e.dataset.pre + fmtDur(t1 - t0);
  }
}
const pill = (kind, label) => h("span", { class: "an-pill an-pill--" + kind, text: label });
const statusPill = (s) => pill((STATUS[s] || ["", "off"])[1], (STATUS[s] || [s])[0]);
const stageLabel = (k) => (STAGES.find((s) => s[0] === k) || [0, k])[1];
const slug = (s) => String(s || "anim").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "anim";
function segment(items, get, set) {
  const box = h("div", { class: "an-seg", role: "group" });
  const paint = () => box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(get() === b.dataset.v)));
  for (const [v, label] of items) box.append(h("button", { type: "button", "data-v": v, text: label, onclick: () => { set(v); paint(); } }));
  paint();
  box.repaint = paint;
  return box;
}
const field = (label, ...kids) => h("div", { class: "an-field" }, h("span", { class: "an-label", text: label }), ...kids);

/* ---------- API ---------- */
class ApiError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}
let mockMod = null;
const loadMock = () => (mockMod ||= import("./anim-mock.js"));
function base() { return String(CFG.url || "").replace(/\/+$/, ""); }
function accessToken() {
  const s = window.HubSession && window.HubSession.get();
  if (s && window.HubSession.isExpired() && window.HubAuth) {
    return window.HubAuth.refresh(s).then((r) => {
      if (r && r.ok) { window.HubSession.set(r.session); return r.session.accessToken; }
      return s.accessToken;
    });
  }
  return Promise.resolve(s && s.accessToken);
}
async function api(action, body = {}) {
  if (MOCK) {
    try { return await (await loadMock()).call(action, body); } catch (e) { throw new ApiError("api", (e.mock && e.mock.message) || e.message); }
  }
  const tok = await accessToken();
  let res;
  try {
    res = await fetch(base() + "/functions/v1/anim-studio", {
      method: "POST",
      headers: { apikey: CFG.anonKey, Authorization: "Bearer " + (tok || CFG.anonKey), "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
  } catch { throw new ApiError("network", "Không nối được máy chủ, kiểm tra mạng rồi thử lại."); }
  const text = await res.text();
  let d = null;
  try { d = JSON.parse(text); } catch { d = null; }
  if (d && d.ok) return d;
  if (res.status === 404 && !(d && d.error && d.error.code)) throw new ApiError("closed", "Xưởng chưa mở: máy chủ chưa cài chức năng anim-studio. Báo admin triển khai rồi thử lại.");
  if (res.status === 401) throw new ApiError("auth", "Bạn chưa đăng nhập hoặc phiên đã hết hạn. Đăng nhập lại rồi thử lại.");
  if (res.status === 403) throw new ApiError("auth", (d && d.error && d.error.message) || "Tài khoản chưa có quyền dùng Xưởng Anim.");
  throw new ApiError("api", (d && d.error && d.error.message) || "Máy chủ trả lỗi " + res.status + ".");
}
async function putFile(uploadUrl, blob, type) {
  if (uploadUrl.startsWith("mock://")) { const m = await loadMock(); void m; window.__animMock.blobs[uploadUrl.slice(11)] = URL.createObjectURL(blob); return; }
  let res;
  try { res = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": type }, body: blob }); } catch { throw new ApiError("network", "Không tải được ảnh lên, kiểm tra mạng."); }
  if (!res.ok) throw new ApiError("api", "Tải file lên không được (lỗi " + res.status + ").");
}
function pubUrl(path) {
  if (!path) return "";
  if (path.startsWith("data:") || path.startsWith("blob:")) return path;
  if (MOCK && window.__animMock && window.__animMock.blobs[path]) return window.__animMock.blobs[path];
  return MOCK ? "" : base() + "/storage/v1/object/public/anim/" + path;
}

/* ---------- trạng thái ---------- */
const S = {
  tab: "new",
  me: { isAdmin: false },
  banner: null,
  jobs: [], jobsLoaded: false, jobsFilter: "all", jobsPage: 1, jobsPages: 1, jobsTotal: 0,
  workers: [], workersLoaded: false,
  form: { prompt: "", file: null, w: 0, h: 0, seconds: 2, seed: "", engine: "auto", steps: "", remove_bg: false, rewrite: true, busy: false },
  detail: null,
};
const last = { jobs: 0, job: 0, workers: 0 };
const P = {};

function banner(err) {
  const el = $("an-banner");
  S.banner = err || null;
  el.replaceChildren();
  el.hidden = !err;
  if (!err) return;
  el.append(h("span", { text: err.message || String(err) }));
  if (err.kind === "auth") el.append(h("a", { class: "btn btn--sm", href: "login.html", text: "Đăng nhập" }));
  else el.append(h("button", { class: "btn btn--sm", type: "button", text: "Thử lại", onclick: () => { banner(null); route(); } }));
}
function guard(p) {
  return p.then((v) => { if (S.banner) banner(null); return v; }, (e) => { banner(e instanceof ApiError ? e : new ApiError("api", e.message)); throw e; });
}
function saveBlob(blob, filename) {
  const a = h("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function saveUrl(url, filename) {
  try { saveBlob(await (await fetch(url)).blob(), filename); } catch { window.open(url, "_blank", "noopener"); }
}

/* ---------- ảnh nhân vật: một file ---------- */
function imageDims(file) {
  return new Promise((ok, no) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { ok({ w: im.naturalWidth, h: im.naturalHeight, url: u }); };
    im.onerror = () => { URL.revokeObjectURL(u); no(new Error("không đọc được ảnh")); };
    im.src = u;
  });
}
function dropzone(onFile) {
  const input = h("input", { type: "file", hidden: true, accept: "image/png,image/jpeg,image/webp" });
  const box = h("div", { class: "an-drop", tabindex: 0, role: "button", "aria-label": "Chọn ảnh nhân vật" },
    h("b", { text: "Kéo ảnh nhân vật vào đây" }),
    h("span", { text: "hoặc bấm để chọn, hoặc dán bằng Ctrl+V. png, jpg, webp, tối đa 15 MB. Một ảnh mỗi job." }));
  const take = (files) => {
    const f = [...files].find((x) => ACCEPT.test(x.type));
    if (!f) return toast("Chỉ nhận ảnh png, jpg hoặc webp");
    if (f.size > 15 * 1024 * 1024) return toast("Ảnh lớn hơn 15 MB");
    onFile(f);
  };
  box.addEventListener("click", () => input.click());
  box.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { take(input.files); input.value = ""; });
  for (const ev of ["dragenter", "dragover"]) box.addEventListener(ev, (e) => { e.preventDefault(); box.classList.add("is-over"); });
  for (const ev of ["dragleave", "drop"]) box.addEventListener(ev, (e) => { e.preventDefault(); box.classList.remove("is-over"); });
  box.addEventListener("drop", (e) => take(e.dataTransfer.files));
  document.addEventListener("paste", (e) => { if (S.tab === "new" && !S.detail && e.clipboardData && e.clipboardData.files.length) take(e.clipboardData.files); });
  return { el: h("div", {}, box, input) };
}
async function uploadImage(file, dims) {
  const r = await api("upload_urls", { files: [{ name: file.name, type: file.type, size: file.size }] });
  const u = r.files[0];
  await putFile(u.uploadUrl, file, file.type);
  return { path: u.path, name: file.name, w: dims.w, h: dims.h };
}
function paramsFrom(F) {
  const seed = F.seed === "" ? null : Math.round(+F.seed), steps = F.steps === "" ? null : Math.round(+F.steps);
  return { engine: F.engine, seconds: F.seconds, seed: Number.isFinite(seed) ? seed : null, steps: Number.isFinite(steps) ? steps : null, remove_bg: F.remove_bg, rewrite: F.rewrite };
}

/* ---------- tab Tạo mới ---------- */
function buildNew() {
  const F = S.form, pane = $("pane-new");
  const prompt = h("textarea", { id: "an-prompt", class: "an-prompt", rows: 4, placeholder: "Nhân vật làm gì? Ví dụ: vẫy tay chào rồi hạ tay xuống. Gõ tiếng Việt hay tiếng Anh đều được.", "aria-label": "Mô tả chuyển động", oninput: (e) => { F.prompt = e.target.value; } });
  const prev = h("img", { class: "an-src-img", alt: "Ảnh nhân vật", hidden: true });
  const prevInfo = h("p", { class: "an-dim", hidden: true });
  const dz = dropzone(async (f) => {
    try {
      const d = await imageDims(f);
      if (F.url) URL.revokeObjectURL(F.url);
      F.file = f; F.w = d.w; F.h = d.h; F.url = d.url;
      prev.src = d.url; prev.hidden = false;
      prevInfo.hidden = false; prevInfo.textContent = `${f.name} · ${d.w}×${d.h} px · ${(f.size / 1024).toFixed(0)} KB`;
    } catch { toast("Không đọc được ảnh này"); }
  });
  const secs = h("input", { type: "range", min: 1, max: 5, step: 0.5, value: F.seconds, "aria-label": "Số giây" });
  const secsOut = h("b", { text: F.seconds + " giây" });
  secs.addEventListener("input", () => { F.seconds = +secs.value; secsOut.textContent = F.seconds + " giây"; });
  const engine = h("select", { "aria-label": "Engine", onchange: (e) => { F.engine = e.target.value; } }, ENGINES.map(([v, l]) => h("option", { value: v, text: l, selected: F.engine === v })));
  const seed = h("input", { type: "number", min: 0, max: 2147483647, step: 1, placeholder: "ngẫu nhiên", "aria-label": "Seed", oninput: (e) => { F.seed = e.target.value; } });
  const steps = h("input", { type: "number", min: 1, max: 200, step: 1, placeholder: "mặc định", "aria-label": "Số bước", oninput: (e) => { F.steps = e.target.value; } });
  const rm = h("input", { type: "checkbox", checked: F.remove_bg, onchange: (e) => { F.remove_bg = e.target.checked; } });
  const rw = h("input", { type: "checkbox", checked: F.rewrite, onchange: (e) => { F.rewrite = e.target.checked; } });
  const submit = h("button", { class: "btn btn--primary an-submit", type: "button", text: "Gửi cho máy gen", onclick: send });
  async function send() {
    if (F.busy) return;
    if (!F.file) return toast("Chọn một ảnh nhân vật trước");
    if (!F.prompt.trim()) { prompt.focus(); return toast("Gõ chuyển động muốn có trước"); }
    F.busy = true; submit.disabled = true; submit.textContent = "Đang gửi…";
    try {
      const image = await guard(uploadImage(F.file, { w: F.w, h: F.h }));
      const r = await guard(api("submit", { prompt: F.prompt.trim(), title: F.prompt.trim().slice(0, 60), image, params: paramsFrom(F) }));
      toast("Đã gửi, máy gen sẽ nhận trong giây lát");
      F.prompt = ""; prompt.value = "";
      S.jobsLoaded = false;
      location.hash = "#job=" + r.job.id;
    } catch { /* banner */ }
    F.busy = false; submit.disabled = false; submit.textContent = "Gửi cho máy gen";
  }
  pane.replaceChildren(h("div", { class: "an-new" },
    h("div", { class: "an-card-box" },
      field("1. Ảnh nhân vật", dz.el, prev, prevInfo),
      field("2. Chuyển động", prompt,
        h("div", { class: "an-chips" }, EXAMPLES.map((t) => h("button", { class: "an-chip", type: "button", text: t, onclick: () => { F.prompt = t; prompt.value = t; prompt.focus(); } })))),
      h("div", { class: "an-field" }, h("span", { class: "an-label", text: "3. Độ dài" }), secs, " ", secsOut),
      h("details", { class: "an-more", open: F.moreOpen },
        h("summary", { text: "Tuỳ chọn thêm" }),
        field("Engine", engine),
        h("div", { class: "an-field" }, h("span", { class: "an-label", text: "Seed" }), seed, h("p", { class: "an-dim", text: "Cùng ảnh, cùng prompt, cùng seed thì ra lại gần như y hệt." })),
        field("Số bước (để trống nếu không rành)", steps),
        h("label", { class: "an-check" }, rm, "Xoá nền sau khi gen"),
        h("label", { class: "an-check" }, rw, "Viết lại mô tả thành prompt tiếng Anh (khuyên bật)")),
      h("div", { class: "an-send" }, submit, h("p", { class: "an-dim", text: "Một clip mất vài phút. Xong thì bạn chỉnh từng khung ngay trong trang." }))),
    h("aside", { class: "an-card-box an-tips" }, h("h3", { text: "Mẹo để chuyển động đẹp" }), h("ul", {},
      h("li", { text: "Ảnh nhân vật rõ nét, đứng một mình, nền đơn giản hoặc trong suốt." }),
      h("li", { text: "Mô tả chỉ chuyển động của nhân vật; máy giữ camera đứng yên." }),
      h("li", { text: "Muốn lặp mượt (idle, thở, đi bộ), nói rõ \"lặp\", rồi cắt vào/ra trong trình sửa." }),
      h("li", { text: "1 đến 2 giây cho clip ngắn; dài hơn dễ bị trôi hình." }),
      h("li", { text: "Chưa ưng thì đổi seed, hoặc sửa mô tả rồi \"Gen lại\" từ trang chi tiết." })))));
}

/* ---------- tab Job ---------- */
const active = (j) => j.status === "queued" || j.status === "running";
const PAGE_SIZE = 30;
let jobsReq = 0;
async function refreshJobs() {
  last.jobs = Date.now();
  const n = ++jobsReq;
  try {
    const r = await guard(api("list", { mine: S.jobsFilter === "mine", page: S.jobsPage, page_size: PAGE_SIZE }));
    if (n !== jobsReq) return;
    S.jobs = r.jobs; S.jobsLoaded = true;
    S.jobsTotal = r.total ?? r.jobs.length; S.jobsPages = r.pages ?? 1;
    if (r.page && r.page !== S.jobsPage) { S.jobsPage = r.page; if (S.tab === "jobs" && !S.detail) history.replaceState(null, "", "#" + jobsHash()); }
    if (S.tab === "jobs" && !S.detail) paintJobs();
    if (S.detail && S.detail.kind === "job") paintChain();
  } catch { /* banner */ }
}
function buildJobs() {
  const pane = $("pane-jobs");
  P.jobsGrid = h("div", { class: "an-grid" });
  pane.replaceChildren(
    h("div", { class: "an-bar" },
      segment([["all", "Tất cả"], ["mine", "Của tôi"]], () => S.jobsFilter, (v) => { S.jobsFilter = v; S.jobsPage = 1; S.jobsLoaded = false; S.jobs = []; P.jobsGrid.replaceChildren(); P.pager.replaceChildren(); if (location.hash !== "#jobs") history.replaceState(null, "", "#jobs"); refreshJobs(); }),
      h("span", { class: "an-spacer" }),
      h("button", { class: "btn btn--sm", type: "button", text: "Làm mới", onclick: refreshJobs }),
      h("a", { class: "btn btn--primary btn--sm", href: "#new", text: "+ Tạo mới" })),
    P.jobsGrid, P.pager = h("nav", { class: "an-pager", "aria-label": "Trang job" }));
}
const jobsHash = () => (S.jobsPage > 1 ? "jobs=" + S.jobsPage : "jobs");
function goJobsPage(p) {
  p = Math.min(S.jobsPages, Math.max(1, p));
  if (p === S.jobsPage) return;
  S.jobsPage = p;
  location.hash = "#" + jobsHash();
  scrollTo({ top: 0, behavior: "smooth" });
}
function pageList(cur, n) {
  const want = [...new Set([1, n, cur - 2, cur - 1, cur, cur + 1, cur + 2])].filter((x) => x >= 1 && x <= n).sort((a, b) => a - b);
  const out = [];
  want.forEach((x, i) => { const gap = i ? x - want[i - 1] : 1; if (gap === 2) out.push(x - 1); else if (gap > 2) out.push(0); out.push(x); });
  return out;
}
function paintPager() {
  const n = S.jobsPages, cur = S.jobsPage;
  if (!S.jobsLoaded || !S.jobsTotal) { P.pager.replaceChildren(); return; }
  const btn = (label, p, title, cls = "") => h("button", { type: "button", class: "an-pager__b" + cls, text: label, title, "aria-label": title, "aria-current": cls.includes("is-cur") ? "page" : null, disabled: p < 1 || p > n || p === cur, onclick: () => goJobsPage(p) });
  P.pager.replaceChildren(
    n > 1 ? h("div", { class: "an-pager__row" },
      btn("«", 1, "Trang đầu", " is-end"), btn("‹", cur - 1, "Trang trước"),
      ...pageList(cur, n).map((x) => (x ? btn(String(x), x, "Trang " + x, x === cur ? " is-cur" : x !== 1 && x !== n && Math.abs(x - cur) >= 2 ? " is-num is-far" : " is-num") : h("span", { class: "an-pager__gap", text: "…" }))),
      btn("›", cur + 1, "Trang sau"), btn("»", n, "Trang cuối", " is-end")) : null,
    h("p", { class: "an-pager__info", text: `Trang ${cur}/${n} · tổng ${S.jobsTotal} job` }));
}
const canDelete = (j) => !!S.me.id && (j.created_by === S.me.id || S.me.isAdmin) && !active(j);
async function deleteJob(j) {
  if (!confirm("Xoá anim này? Không khôi phục được.\n\n" + (j.title || j.prompt))) return false;
  try {
    const r = await api("delete", { id: j.id });
    toast(r.files_error ? "Đã xoá (còn sót file trên kho, báo admin)" : "Đã xoá anim");
    S.jobs = S.jobs.filter((x) => x.id !== j.id);
    S.jobsTotal = Math.max(0, S.jobsTotal - 1);
    return true;
  } catch (e) {
    toast("Xoá không được: " + (e.message || e));
    return false;
  }
}
function jobThumbUrl(j) {
  const fr = j.result && j.result.files && j.result.files.frames;
  if (fr && fr.length) return pubUrl(fr[0]);
  return j.image ? pubUrl(j.image.path) : "";
}
function jobThumb(j) {
  const src = jobThumbUrl(j);
  return h("div", { class: "an-card__thumb" }, src ? h("img", { src, alt: "", loading: "lazy" }) : h("span", { class: "an-card__ph", text: j.status === "failed" ? "!" : "…" }));
}
function paintJobs() {
  const g = P.jobsGrid;
  if (!S.jobs.length) {
    g.replaceChildren(h("p", { class: "an-empty", text: S.jobsLoaded ? "Chưa có job nào. Qua tab Tạo mới để gửi yêu cầu đầu tiên." : "Đang tải…" }));
    return;
  }
  g.replaceChildren(...S.jobs.map((j) => h("div", { class: "an-cardwrap", "data-job": j.id },
    h("a", { class: "an-card", href: "#job=" + j.id },
      jobThumb(j),
      h("div", { class: "an-card__body" },
        h("div", { class: "an-card__top" }, h("b", { class: "an-card__title", text: j.title || j.prompt }), statusPill(j.status)),
        h("p", { class: "an-card__prompt", text: j.prompt }),
        j.status === "running" && j.progress && j.progress.total ? h("div", { class: "an-bar2" }, h("i", { style: `width:${Math.round((100 * j.progress.step) / j.progress.total)}%` })) : null,
        h("div", { class: "an-card__meta" }, h("span", { text: j.author }), j.worker ? h("span", { text: j.worker }) : null, j.result ? h("span", { text: j.result.frames + " khung" }) : null, elapsedSpan(j)))),
    canDelete(j) ? h("button", { class: "an-card__del", type: "button", title: "Xoá anim này", "aria-label": "Xoá anim " + (j.title || ""), text: "Xoá", onclick: async (ev) => { const b = ev.currentTarget; b.disabled = true; if (await deleteJob(j)) { paintJobs(); refreshJobs(); } else b.disabled = false; } }) : null)));
  tickElapsed();
  paintPager();
}

/* ---------- chi tiết job ---------- */
function closeDetail() {
  if (S.detail && S.detail.keys) removeEventListener("keydown", S.detail.keys);
  S.detail = null;
}
async function openDetail(id) {
  if (S.detail && S.detail.id === id) return;
  closeDetail();
  const D = S.detail = { id, job: null, logN: -1, token: Symbol(), ed: null };
  buildDetailShell(D);
  render();
  try {
    if (!S.jobsLoaded) refreshJobs();
    await refreshJob(true);
  } catch { /* banner */ }
}
async function refreshJob(first) {
  const D = S.detail;
  if (!D) return;
  last.job = Date.now();
  const r = await guard(api("get", { id: D.id }));
  if (S.detail !== D) return;
  D.job = r.job;
  D.family = r.family || D.family || [];
  paintTop(D);
  if (D.job.status === "done" && !D.ed && !D.loading) await loadEditor(D);
  if (first) paintChain();
}
function buildDetailShell(D) {
  const pane = $("pane-detail");
  D.el = { top: h("div", { class: "an-top" }, ), chain: h("div", { class: "an-chain", hidden: true }) };
  D.editorBox = h("div", { class: "an-editorbox" });
  D.reviseBox = h("div", { class: "an-revise an-card-box", hidden: true });
  const log = h("div", { class: "an-log", role: "log", "aria-live": "polite" });
  D.ref = {
    title: h("h2", { class: "an-h2" }), pill: h("span"), meta: h("div", { class: "an-meta" }), prompt: h("p", { class: "an-prompt-show" }), pe: h("p", { class: "an-pe", hidden: true }),
    src: h("div", { class: "an-refs" }), stepper: h("ol", { class: "an-stepper" }), bar: h("div", { class: "an-bar2", hidden: true }, h("i")), barl: h("p", { class: "an-barl", hidden: true }),
    log, err: h("p", { class: "an-err", hidden: true }), btns: h("div", { class: "an-bar" }),
  };
  const r = D.ref;
  D.el.top.append(h("div", { class: "an-head" }, r.title, r.pill), r.meta, r.prompt, r.pe, r.src, r.err, r.stepper, r.bar, r.barl, r.log, r.btns);
  pane.replaceChildren(h("a", { class: "an-back", href: "#" + jobsHash(), text: "← Danh sách job" }), D.el.top, D.editorBox, D.reviseBox, D.el.chain);
}
function paintTop(D) {
  const j = D.job, r = D.ref;
  if (!j) return;
  r.title.textContent = j.title || j.prompt;
  r.pill.replaceWith(r.pill = statusPill(j.status));
  const par = j.params || {};
  r.meta.replaceChildren(
    h("span", { text: "bởi " + j.author }), j.worker ? h("span", { text: "máy " + j.worker }) : null, elapsedSpan(j),
    j.stage && j.status === "running" ? h("span", { text: "bước: " + stageLabel(j.stage) }) : null,
    par.engine ? h("span", { text: "engine " + par.engine }) : null,
    par.seconds ? h("span", { text: par.seconds + " giây" }) : null,
    j.result && j.result.seed != null ? h("span", { text: "seed " + j.result.seed }) : par.seed != null ? h("span", { text: "seed " + par.seed }) : null,
    j.result ? h("span", { text: `${j.result.engine} · ${j.result.width}×${j.result.height} · ${j.result.fps} fps` }) : null);
  r.prompt.textContent = j.prompt;
  r.pe.hidden = !j.prompt_en;
  r.pe.replaceChildren(h("b", { text: "Prompt máy dùng: " }), j.prompt_en || "");
  if (D.srcPath !== (j.image && j.image.path)) {
    D.srcPath = j.image && j.image.path;
    r.src.replaceChildren(j.image ? h("img", { src: pubUrl(j.image.path), alt: "Ảnh nhân vật gốc", title: j.image.name || "" }) : null);
  }
  r.err.hidden = !j.error;
  r.err.textContent = j.error || "";
  const show = STAGES.filter(([k]) => (k !== "bg" || par.remove_bg) && (k !== "rewriting" || par.rewrite !== false));
  const idx = show.findIndex((s) => s[0] === j.stage);
  r.stepper.hidden = (j.status === "queued" && idx < 0) || j.status === "done";
  r.stepper.replaceChildren(...show.map(([k, label], i) => {
    const st = i < idx ? "done" : i === idx ? (j.status === "failed" ? "bad" : j.status === "running" ? "now" : "done") : "todo";
    return h("li", { class: "an-step an-step--" + st }, h("i", { text: st === "done" ? "✓" : i + 1 }), h("span", { text: label }));
  }));
  const pr = j.progress, has = j.status === "running" && pr && pr.total > 0;
  r.bar.hidden = r.barl.hidden = !has;
  if (has) {
    r.bar.firstChild.style.width = Math.round((100 * pr.step) / pr.total) + "%";
    r.barl.textContent = `${stageLabel(pr.stage)}: bước ${pr.step}/${pr.total}`;
  }
  const log = j.log || [];
  if (D.logN !== log.length) {
    const near = r.log.scrollHeight - r.log.scrollTop - r.log.clientHeight < 40;
    r.log.replaceChildren(...log.map((l) => h("div", { class: "an-log__l" }, h("time", { text: clock(l.t) }), l.stage ? h("em", { text: stageLabel(l.stage) }) : null, h("span", { text: l.msg }))));
    if (near || D.logN < 0) r.log.scrollTop = r.log.scrollHeight;
    D.logN = log.length;
  }
  r.log.hidden = j.status === "done" && D.logHidden !== false;
  const btnKey = j.status + ":" + canDelete(j) + ":" + !!(j.result && j.result.files.video);
  if (D.btnKey !== btnKey) r.btns.replaceChildren(
    active(j) ? h("button", { class: "btn btn--danger btn--sm", type: "button", text: "Huỷ job", onclick: () => jobAction("cancel") }) : null,
    j.status === "failed" || j.status === "canceled" ? h("button", { class: "btn btn--primary btn--sm", type: "button", text: "Thử lại", onclick: () => jobAction("retry") }) : null,
    j.status === "done" ? h("button", { class: "btn btn--sm", type: "button", text: r.log.hidden ? "Xem nhật ký" : "Ẩn nhật ký", onclick: (e) => { D.logHidden = !r.log.hidden ? true : false; r.log.hidden = !r.log.hidden; e.currentTarget.textContent = r.log.hidden ? "Xem nhật ký" : "Ẩn nhật ký"; } }) : null,
    canDelete(j) ? h("button", { class: "btn btn--danger btn--sm", type: "button", text: "Xoá anim", onclick: async (ev) => { const b = ev.currentTarget; b.disabled = true; if (await deleteJob(j)) location.hash = "#" + jobsHash(); else b.disabled = false; } }) : null);
  D.btnKey = btnKey;
  if (j.status === "done" && !D.revBuilt && (j.created_by === S.me.id)) buildRevise(D);
  D.reviseBox.hidden = !(j.status === "done" && D.revBuilt);
}
async function jobAction(a) {
  const D = S.detail;
  try {
    await guard(api(a, { id: D.id }));
    D.logN = -1; D.ed = null; D.editorBox.replaceChildren();
    toast(a === "cancel" ? "Đã huỷ job" : "Đã đưa job về hàng đợi");
    await refreshJob();
  } catch { /* banner */ }
}
function buildRevise(D) {
  D.revBuilt = true;
  const j = D.job, p = j.params || {};
  const text = h("textarea", { class: "an-prompt", rows: 3, placeholder: "Sửa mô tả hoặc thêm góp ý, ví dụ: chậm lại, vẫy tay cao hơn.", "aria-label": "Mô tả mới" });
  text.value = j.prompt;
  const seed = h("input", { type: "number", min: 0, max: 2147483647, placeholder: "ngẫu nhiên", "aria-label": "Seed mới" });
  const btn = h("button", { class: "btn btn--primary", type: "button", text: "Gen lại", onclick: async () => {
    if (!text.value.trim()) return toast("Gõ mô tả trước");
    btn.disabled = true;
    try {
      const r = await guard(api("submit", { prompt: text.value.trim(), title: (j.title || "") + " v2", image: j.image, params: { ...p, seed: seed.value === "" ? null : Math.round(+seed.value), only_worker: null }, parent_id: j.id }));
      S.jobsLoaded = false;
      toast("Đã gửi bản mới");
      location.hash = "#job=" + r.job.id;
    } catch { /* banner */ }
    btn.disabled = false;
  } });
  D.reviseBox.replaceChildren(h("h3", { text: "Gen lại" }), h("p", { class: "an-dim", text: "Dùng cùng ảnh, đổi mô tả hoặc seed. Mỗi lần gen là một phiên bản riêng, bản cũ vẫn giữ." }), text, h("div", { class: "an-field" }, h("span", { class: "an-label", text: "Seed (trống = ngẫu nhiên)" }), seed), btn);
}
function paintChain() {
  const D = S.detail;
  if (!D || !D.job) return;
  const byId = new Map([...S.jobs, ...(D.family || [])].map((j) => [j.id, j]));
  byId.set(D.job.id, D.job);
  const anc = [];
  for (let c = D.job, n = 0; c.parent_id && n < 20; n++) {
    const p = byId.get(c.parent_id);
    if (!p) { anc.unshift({ id: c.parent_id, title: "bản gốc" }); break; }
    anc.unshift(p); c = p;
  }
  const kids = [...byId.values()].filter((j) => j.parent_id === D.job.id);
  D.el.chain.hidden = !anc.length && !kids.length;
  const link = (j, cur) => cur ? h("b", { class: "an-chain__cur", text: "bản này" }) : h("a", { href: "#job=" + j.id }, j.title || j.id, j.status ? statusPill(j.status) : null);
  D.el.chain.replaceChildren(h("span", { class: "an-label", text: "Các phiên bản" }),
    h("div", { class: "an-chain__row" }, ...anc.flatMap((a) => [link(a), h("span", { text: "→" })]), link(D.job, true),
      kids.length ? h("span", { text: "→" }) : null, ...kids.map((k) => link(k))));
}

/* ---------- trình sửa khung hình ---------- */
const edKey = (id) => "anim-editor:" + id;
function edLoadState(id, n) {
  const d = { off: [], inI: 0, outI: n - 1, every: 1, fps: null, loop: "loop", onion: false, bg: "checker", color: "#1b1b24", zoom: "fit", cols: 0 };
  try {
    const s = JSON.parse(localStorage.getItem(edKey(id)) || "null");
    if (s && typeof s === "object") {
      if (Array.isArray(s.off)) d.off = s.off.filter((i) => Number.isInteger(i) && i >= 0 && i < n);
      if (Number.isInteger(s.inI)) d.inI = clamp(s.inI, 0, n - 1);
      if (Number.isInteger(s.outI)) d.outI = clamp(s.outI, d.inI, n - 1);
      if (Number.isInteger(s.every)) d.every = clamp(s.every, 1, 20);
      if (Number.isFinite(s.fps)) d.fps = clamp(s.fps, 1, 60);
      if (s.loop === "loop" || s.loop === "pingpong") d.loop = s.loop;
      if (typeof s.onion === "boolean") d.onion = s.onion;
      if (BG_LABEL[s.bg]) d.bg = s.bg;
      if (typeof s.color === "string" && /^#[0-9a-f]{6}$/i.test(s.color)) d.color = s.color;
      if (s.zoom === "fit" || [1, 2, 3, 4, 8].includes(s.zoom)) d.zoom = s.zoom;
      if (Number.isInteger(s.cols)) d.cols = clamp(s.cols, 0, 64);
    }
  } catch { /* localStorage không dùng được: chạy không nhớ */ }
  return d;
}
function loadImg(url) {
  return new Promise((ok, no) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => ok(im);
    im.onerror = () => no(new Error("không tải được " + url.slice(0, 80)));
    im.src = url;
  });
}
async function loadEditor(D) {
  const j = D.job, R = j.result, frames = (R && R.files && R.files.frames) || [];
  if (!frames.length) { D.editorBox.replaceChildren(h("p", { class: "an-noframes", text: "Job đã xong nhưng không có khung hình nào." })); return; }
  D.loading = true;
  const note = h("p", { class: "an-noframes", text: `Đang nạp ${frames.length} khung…` });
  D.editorBox.replaceChildren(note);
  try {
    let n = 0;
    const imgs = await Promise.all(frames.map((p) => loadImg(pubUrl(p)).then((im) => { note.textContent = `Đang nạp ${frames.length} khung… ${++n}/${frames.length}`; return im; })));
    if (S.detail !== D) return;
    D.ed = buildEditor(D, imgs);
  } catch (e) {
    D.editorBox.replaceChildren(h("p", { class: "an-noframes", text: "Không nạp được khung hình: " + e.message }));
  }
  D.loading = false;
}

function buildEditor(D, imgs) {
  const j = D.job, R = j.result, n = imgs.length, W = imgs[0].naturalWidth, H = imgs[0].naturalHeight;
  const st = edLoadState(j.id, n);
  const E = { n, imgs, W, H, keep: Array.from({ length: n }, (_, i) => !st.off.includes(i)), inI: st.inI, outI: st.outI, every: st.every, fps: st.fps ?? (R.fps || 16),
    loop: st.loop, onion: st.onion, bg: st.bg, color: st.color, zoom: st.zoom, cols: st.cols, playing: true, pos: 0, acc: 0, cur: 0 };
  const name = slug(j.title);
  const kept = () => { const a = []; for (let i = E.inI; i <= E.outI; i += E.every) if (E.keep[i]) a.push(i); return a; };
  const seq = () => { const a = kept(); return E.loop === "pingpong" && a.length > 2 ? a.concat(a.slice(1, -1).reverse()) : a; };
  let saveT = 0;
  const save = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        localStorage.setItem(edKey(j.id), JSON.stringify({ off: E.keep.flatMap((k, i) => (k ? [] : [i])), inI: E.inI, outI: E.outI, every: E.every, fps: E.fps, loop: E.loop, onion: E.onion, bg: E.bg, color: E.color, zoom: E.zoom, cols: E.cols }));
      } catch { /* bỏ qua */ }
    }, 250);
  };

  const cv = h("canvas", { width: W, height: H, "aria-label": "Xem trước animation" });
  const ctx = cv.getContext("2d");
  const view = h("div", { class: "an-view is-checker" }, cv);
  const info = h("div", { class: "an-ed__info" });
  const film = h("div", { class: "an-film", role: "listbox", "aria-label": "Các khung hình" });
  const tiles = imgs.map((im, i) => {
    const t = h("button", { type: "button", class: "an-fr", role: "option", "aria-label": "Khung " + (i + 1), onclick: () => { E.playing = false; E.cur = i; paint(); } },
      h("img", { src: im.src, alt: "", loading: "lazy", draggable: "false" }),
      h("span", { class: "an-fr__t", title: "Bật/tắt khung này", onclick: (ev) => { ev.stopPropagation(); E.keep[i] = !E.keep[i]; E.pos = 0; paint(); save(); } }));
    return t;
  });
  film.append(...tiles);

  const fitZoom = () => {
    const wAvail = Math.max(120, (view.clientWidth || 600) - 24), hAvail = Math.min(460, Math.round(innerHeight * 0.6));
    return Math.max(1, Math.floor(Math.min(wAvail / W, hAvail / H)));
  };
  const zoomNow = () => (E.zoom === "fit" ? fitZoom() : E.zoom);

  function drawCur() {
    const z = zoomNow();
    cv.style.width = W * z + "px"; cv.style.height = H * z + "px";
    ctx.clearRect(0, 0, W, H);
    if (E.bg !== "checker") { ctx.fillStyle = E.bg === "dark" ? "#14131a" : E.bg === "light" ? "#f2f0f7" : E.color; ctx.fillRect(0, 0, W, H); }
    const s = seq();
    if (E.onion && s.length > 1) {
      const k = E.playing ? s[(E.pos + s.length - 1) % s.length] : (() => { const a = kept(), at = a.indexOf(E.cur); return at > 0 ? a[at - 1] : a[a.length - 1]; })();
      if (k != null && k !== E.cur) { ctx.globalAlpha = 0.35; ctx.drawImage(imgs[k], 0, 0); ctx.globalAlpha = 1; }
    }
    ctx.drawImage(imgs[E.cur], 0, 0);
  }
  function paintFilm() {
    const k = kept();
    tiles.forEach((t, i) => {
      const onGrid = i >= E.inI && i <= E.outI && (i - E.inI) % E.every === 0;
      t.classList.toggle("is-off", !E.keep[i]);
      t.classList.toggle("is-out", i < E.inI || i > E.outI);
      t.classList.toggle("is-skip", !(i < E.inI || i > E.outI) && !onGrid);
      t.classList.toggle("is-cur", i === E.cur);
      t.classList.toggle("is-in", i === E.inI);
      t.classList.toggle("is-end", i === E.outI);
      t.setAttribute("aria-selected", String(i === E.cur));
      t.lastChild.textContent = (E.keep[i] ? "✓ " : "✕ ") + (i + 1);
    });
    const secs = k.length / E.fps;
    info.replaceChildren(
      h("span", { text: `Khung ${E.cur + 1}/${n}` }), h("span", { text: `${W}×${H} px` }),
      h("span", { text: `dùng ${k.length}/${n} khung` }), h("span", { text: `${E.fps} fps · ${secs.toFixed(2)} giây${E.loop === "pingpong" ? " (đi và về)" : ""}` }));
  }
  function paint() {
    drawCur(); paintFilm(); syncCtl();
    const t = tiles[E.cur];
    if (t && !E.playing) { const l = t.offsetLeft - film.clientWidth / 2 + t.clientWidth / 2; film.scrollTo({ left: l, behavior: "auto" }); }
  }
  const ensureCur = () => { const k = kept(); if (k.length && !k.includes(E.cur)) E.cur = k[0]; };
  E.tick = (dt) => {
    if (!E.playing) return;
    const s = seq();
    if (!s.length) return;
    E.acc += dt;
    const step = 1 / E.fps;
    if (E.acc < step) return;
    E.pos = (E.pos + Math.floor(E.acc / step)) % s.length;
    E.acc %= step;
    E.cur = s[E.pos];
    drawCur(); paintFilm();
    const t = tiles[E.cur];
    if (t) { const l = t.offsetLeft - film.clientWidth / 2 + t.clientWidth / 2; film.scrollTo({ left: l, behavior: "auto" }); }
  };
  const stepBy = (d) => {
    E.playing = false;
    const a = kept();
    if (!a.length) return;
    const at = a.findIndex((x) => x >= E.cur);
    const base = a.includes(E.cur) ? a.indexOf(E.cur) : at < 0 ? 0 : at;
    E.cur = a[(base + d + a.length) % a.length];
    paint();
  };
  const setPlay = (v) => { E.playing = v; if (v) { E.pos = Math.max(0, seq().indexOf(E.cur)); E.acc = 0; } paint(); };

  /* --- điều khiển --- */
  const ctl = {};
  const numIn = (key, min, max, set, label) => (ctl[key] = h("input", { type: "number", min, max, step: 1, "aria-label": label, onchange: (e) => { const v = Math.round(+e.target.value); if (Number.isFinite(v)) set(clamp(v, min, max)); paint(); save(); } }));
  const playBtn = h("button", { class: "btn btn--primary btn--sm", type: "button", onclick: () => setPlay(!E.playing) });
  const fpsR = h("input", { type: "range", min: 1, max: 60, step: 1, "aria-label": "Tốc độ khung hình", oninput: (e) => { E.fps = +e.target.value; paint(); save(); } });
  const fpsN = h("output", { class: "an-dim" });
  const inN = numIn("in", 1, n, (v) => { E.inI = v - 1; if (E.outI < E.inI) E.outI = E.inI; E.pos = 0; ensureCur(); }, "Khung vào");
  const outN = numIn("out", 1, n, (v) => { E.outI = v - 1; if (E.inI > E.outI) E.inI = E.outI; E.pos = 0; ensureCur(); }, "Khung ra");
  const everyN = numIn("every", 1, 20, (v) => { E.every = v; E.pos = 0; ensureCur(); }, "Giữ mỗi N khung");
  const loopSeg = segment([["loop", "Lặp"], ["pingpong", "Đi và về"]], () => E.loop, (v) => { E.loop = v; E.pos = 0; paint(); save(); });
  const onionB = h("button", { class: "btn btn--sm", type: "button", text: "Onion skin", "aria-pressed": "false", onclick: () => { E.onion = !E.onion; paint(); save(); } });
  const bgSeg = segment(Object.entries(BG_LABEL), () => E.bg, (v) => { E.bg = v; view.classList.toggle("is-checker", v === "checker"); paint(); save(); });
  const colorIn = h("input", { type: "color", "aria-label": "Màu nền", oninput: (e) => { E.color = e.target.value; E.bg = "color"; bgSeg.repaint(); view.classList.remove("is-checker"); paint(); save(); } });
  const zoomSeg = segment([["fit", "Vừa"], ["1", "1×"], ["2", "2×"], ["3", "3×"], ["4", "4×"], ["8", "8×"]], () => String(E.zoom), (v) => { E.zoom = v === "fit" ? "fit" : +v; paint(); save(); });
  const colsN = h("input", { type: "number", min: 0, max: 64, step: 1, "aria-label": "Số cột sprite sheet", onchange: (e) => { E.cols = clamp(Math.round(+e.target.value) || 0, 0, 64); save(); updSheet(); } });
  const sheetPrev = h("img", { class: "an-sheetprev", alt: "Xem trước sprite sheet", hidden: true });
  function syncCtl() {
    playBtn.textContent = E.playing ? "⏸ Dừng" : "▶ Phát";
    playBtn.setAttribute("aria-label", E.playing ? "Dừng" : "Phát");
    fpsR.value = E.fps; fpsN.textContent = E.fps + " fps";
    inN.value = E.inI + 1; outN.value = E.outI + 1; everyN.value = E.every;
    onionB.setAttribute("aria-pressed", String(E.onion));
    loopSeg.repaint(); bgSeg.repaint(); zoomSeg.repaint();
    colorIn.value = E.color; colsN.value = E.cols || "";
    view.classList.toggle("is-checker", E.bg === "checker");
  }

  /* --- xuất --- */
  const autoCols = (m) => (E.cols > 0 ? Math.min(E.cols, m) : Math.ceil(Math.sqrt(m)));
  const sheetCanvas = () => {
    const a = kept(), c = autoCols(a.length), rows = Math.ceil(a.length / c);
    const cvs = document.createElement("canvas");
    cvs.width = W * c; cvs.height = H * rows;
    const g = cvs.getContext("2d");
    a.forEach((fi, k) => g.drawImage(imgs[fi], (k % c) * W, Math.floor(k / c) * H));
    return { cvs, a, c, rows };
  };
  const sheetJson = (imageName, a, c, rows) => {
    const dur = Math.round(1000 / E.fps), frames = {};
    a.forEach((fi, k) => {
      frames[`${name}_${String(k).padStart(2, "0")}.png`] = { frame: { x: (k % c) * W, y: Math.floor(k / c) * H, w: W, h: H }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: W, h: H }, sourceSize: { w: W, h: H }, duration: dur, source_frame: fi + 1 };
    });
    return { frames, meta: { app: "xuong-anim", version: "1.0", image: imageName, format: "RGBA8888", size: { w: W * c, h: H * rows }, scale: "1",
      frameTags: [{ name: "anim", from: 0, to: Math.max(0, a.length - 1), direction: E.loop === "pingpong" ? "pingpong" : "forward" }], job: j.id, fps: E.fps } };
  };
  const toBlob = (c, type = "image/png") => new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("không dựng được ảnh"))), type));
  function updSheet() {
    const a = kept();
    if (!a.length) { sheetPrev.hidden = true; return; }
    const { cvs } = sheetCanvas();
    sheetPrev.hidden = false; sheetPrev.src = cvs.toDataURL("image/png");
  }
  const busyBtn = async (btn, label, fn) => {
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = label;
    try { await fn(); } catch (e) { toast("Xuất không được: " + (e.message || e)); }
    btn.disabled = false; btn.textContent = old;
  };
  const needFrames = () => { if (!kept().length) { toast("Chưa có khung nào được giữ"); return false; } return true; };
  const exPng = h("button", { class: "btn btn--sm", type: "button", text: "Sprite sheet PNG", onclick: (ev) => needFrames() && busyBtn(ev.currentTarget, "Đang dựng…", async () => { const s = sheetCanvas(); saveBlob(await toBlob(s.cvs), `${name}-sheet.png`); }) });
  const exJson = h("button", { class: "btn btn--sm", type: "button", text: "JSON (Aseprite)", onclick: (ev) => needFrames() && busyBtn(ev.currentTarget, "Đang dựng…", async () => { const s = sheetCanvas(); saveBlob(new Blob([JSON.stringify(sheetJson(`${name}-sheet.png`, s.a, s.c, s.rows), null, 2)], { type: "application/json" }), `${name}-sheet.json`); }) });
  const exZip = h("button", { class: "btn btn--sm", type: "button", text: "ZIP các khung", onclick: (ev) => needFrames() && busyBtn(ev.currentTarget, "Đang nén…", async () => {
    const Z = await loadScript(JSZIP_URL, "JSZip");
    const zip = new Z(), a = kept(), s = sheetCanvas();
    for (const [k, fi] of a.entries()) {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      c.getContext("2d").drawImage(imgs[fi], 0, 0);
      zip.file(`${name}_${String(k + 1).padStart(3, "0")}.png`, await toBlob(c));
    }
    zip.file(`${name}.json`, JSON.stringify(sheetJson(`${name}-sheet.png`, s.a, s.c, s.rows), null, 2));
    saveBlob(await zip.generateAsync({ type: "blob" }), `${name}-frames.zip`);
  }) });
  const exGif = h("button", { class: "btn btn--sm", type: "button", text: "GIF", onclick: (ev) => needFrames() && busyBtn(ev.currentTarget, "Đang mã hoá…", async () => {
    const { GIFEncoder, quantize, applyPalette } = await import(GIFENC_URL);
    const gif = GIFEncoder(), solid = E.bg !== "checker";
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    const delay = Math.round(1000 / E.fps);
    for (const fi of seq()) {
      g.clearRect(0, 0, W, H);
      if (solid) { g.fillStyle = E.bg === "dark" ? "#14131a" : E.bg === "light" ? "#f2f0f7" : E.color; g.fillRect(0, 0, W, H); }
      g.drawImage(imgs[fi], 0, 0);
      const data = g.getImageData(0, 0, W, H).data;
      if (solid) {
        const pal = quantize(data, 256, { format: "rgb565" });
        gif.writeFrame(applyPalette(data, pal, "rgb565"), W, H, { palette: pal, delay });
      } else {
        const pal = quantize(data, 256, { format: "rgba4444", oneBitAlpha: true });
        const ti = pal.findIndex((p) => p[3] === 0);
        gif.writeFrame(applyPalette(data, pal, "rgba4444"), W, H, { palette: pal, delay, transparent: ti >= 0, transparentIndex: Math.max(0, ti), dispose: 2 });
      }
    }
    gif.finish();
    saveBlob(new Blob([gif.bytes()], { type: "image/gif" }), `${name}.gif`);
  }) });
  const exVideo = R.files.video ? h("button", { class: "btn btn--sm", type: "button", text: "Video gốc", onclick: () => saveUrl(pubUrl(R.files.video), `${name}.mp4`) }) : null;

  const side = h("div", { class: "an-ed__side" },
    h("div", { class: "an-box" }, h("h3", { text: "Phát" }),
      h("div", { class: "an-row" }, playBtn, h("button", { class: "btn btn--sm", type: "button", "aria-label": "Khung trước", text: "◀", onclick: () => stepBy(-1) }), h("button", { class: "btn btn--sm", type: "button", "aria-label": "Khung sau", text: "▶|", onclick: () => stepBy(1) }), onionB),
      h("div", { class: "an-row" }, h("label", { text: "Tốc độ" }), fpsR, fpsN),
      h("div", { class: "an-row" }, h("label", { text: "Chế độ" }), loopSeg)),
    h("div", { class: "an-box" }, h("h3", { text: "Cắt và lọc khung" }),
      h("div", { class: "an-row" }, h("label", { text: "Vào / ra" }), inN, "–", outN),
      h("div", { class: "an-row" }, h("button", { class: "btn btn--sm", type: "button", text: "Đặt VÀO = khung này", onclick: () => { E.inI = E.cur; if (E.outI < E.inI) E.outI = E.inI; E.pos = 0; paint(); save(); } }), h("button", { class: "btn btn--sm", type: "button", text: "Đặt RA = khung này", onclick: () => { E.outI = E.cur; if (E.inI > E.outI) E.inI = E.outI; E.pos = 0; paint(); save(); } })),
      h("div", { class: "an-row" }, h("label", { text: "Giữ mỗi" }), everyN, "khung"),
      h("div", { class: "an-row" }, h("button", { class: "btn btn--sm", type: "button", text: "Bật/tắt khung này (X)", onclick: () => toggleCur() }), h("button", { class: "btn btn--sm", type: "button", text: "Bật lại tất cả", onclick: () => { E.keep.fill(true); E.inI = 0; E.outI = n - 1; E.every = 1; E.pos = 0; paint(); save(); } }))),
    h("div", { class: "an-box" }, h("h3", { text: "Nền và phóng to" }),
      h("div", { class: "an-row" }, bgSeg, colorIn),
      h("div", { class: "an-row" }, zoomSeg)),
    h("div", { class: "an-box" }, h("h3", { text: "Xuất" }),
      h("div", { class: "an-row" }, h("label", { text: "Số cột" }), colsN, h("span", { class: "an-dim", text: "trống = tự chia" })),
      h("div", { class: "an-dl" }, exPng, exJson, exZip, exGif, exVideo),
      sheetPrev, h("p", { class: "an-dim", text: "Xuất đúng các khung đang giữ, sau khi cắt và lọc. GIF có kèm chế độ đi và về." })));
  function toggleCur() { E.keep[E.cur] = !E.keep[E.cur]; E.pos = 0; paint(); save(); }

  D.editorBox.replaceChildren(h("div", { class: "an-ed" }, h("div", { class: "an-ed__stage" }, view, info, film), side));
  // phím tắt chỉ khi không gõ trong ô nhập
  D.keys = (ev) => {
    if (!S.detail || S.detail !== D || /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    if (ev.code === "Space") { ev.preventDefault(); setPlay(!E.playing); }
    else if (ev.key === "ArrowLeft") { ev.preventDefault(); stepBy(-1); }
    else if (ev.key === "ArrowRight") { ev.preventDefault(); stepBy(1); }
    else if (ev.key.toLowerCase() === "x") toggleCur();
    else if (ev.key.toLowerCase() === "i") { E.inI = E.cur; if (E.outI < E.inI) E.outI = E.inI; E.pos = 0; paint(); save(); }
    else if (ev.key.toLowerCase() === "o") { E.outI = E.cur; if (E.inI > E.outI) E.inI = E.outI; E.pos = 0; paint(); save(); }
  };
  addEventListener("keydown", D.keys);
  addEventListener("resize", () => { if (S.detail === D && E.zoom === "fit") drawCur(); });
  E.cur = kept()[0] ?? 0;
  syncCtl(); paint(); updSheet();
  window.__animEd = E;
  return E;
}
const scriptCache = {};
function loadScript(url, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  return (scriptCache[url] ||= new Promise((ok, no) => {
    const s = h("script", { src: url, crossorigin: "anonymous" });
    s.onload = () => (window[globalName] ? ok(window[globalName]) : no(new Error(globalName + " không nạp được")));
    s.onerror = () => { delete scriptCache[url]; no(new Error("không tải được thư viện " + globalName + ", kiểm tra mạng")); };
    document.head.append(s);
  }));
}

/* ---------- tab Máy gen ---------- */
const online = (w) => w.last_seen && Date.now() - Date.parse(w.last_seen) <= 45000;
async function refreshWorkers(force) {
  last.workers = Date.now();
  if (!force && $("pane-workers").contains(document.activeElement) && document.activeElement.matches("input,select")) return;
  try {
    const r = await guard(api("workers"));
    S.workers = r.workers; S.workersLoaded = true;
    if (S.tab === "workers" && !S.detail) paintWorkers();
  } catch { /* banner */ }
}
function buildWorkers() {
  P.wList = h("div", { class: "an-workers" });
  $("pane-workers").replaceChildren(
    h("p", { class: "an-dim an-wnote", text: "Số ưu tiên nhỏ nhận trước; máy khác nhường job trong N giây. Máy thiếu RAM/commit hoặc VRAM dưới ngưỡng thì tự dừng nhận job." }), P.wList);
}
function paintWorkers() {
  if (!S.workers.length) { P.wList.replaceChildren(h("p", { class: "an-empty", text: S.workersLoaded ? "Chưa có máy gen nào báo danh." : "Đang tải…" })); return; }
  const admin = S.me.isAdmin;
  const upd = async (w, patch) => {
    try {
      const r = await guard(api("worker_update", { id: w.id, patch }));
      Object.assign(w, r.worker);
      toast("Đã lưu cấu hình " + w.label);
      paintWorkers();
    } catch { refreshWorkers(true); }
  };
  P.wList.replaceChildren(...S.workers.slice().sort((a, b) => a.priority - b.priority).map((w) => {
    const stt = online(w) ? w.status : "offline", [lab, kind] = WSTATUS[stt] || [stt, "off"];
    const num = (key, min, step) => admin
      ? h("input", { type: "number", min, step, value: w[key], "data-k": key, "aria-label": key, onchange: (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= min) upd(w, { [key]: v }); else e.target.value = w[key]; } })
      : h("span", { text: w[key] });
    const row = (label, el) => h("div", { class: "an-wrow" }, h("span", { class: "an-label", text: label }), el);
    return h("article", { class: "an-worker" + (w.enabled ? "" : " is-off"), "data-id": w.id },
      h("div", { class: "an-worker__head" }, h("b", { text: w.label || w.id }), pill(kind, lab), w.enabled ? null : pill("off", "Đã tắt")),
      h("code", { class: "an-dim", text: w.id }),
      row("Việc đang làm", w.current_job ? h("a", { href: "#job=" + w.current_job, text: "mở job" }) : h("span", { class: "an-dim", text: "không có" })),
      row("Đã xong", h("span", { text: w.jobs_done + " job" })),
      row("Thấy lần cuối", h("span", { text: ago(w.last_seen) })),
      row("Bật", admin ? h("input", { type: "checkbox", "aria-label": "Bật máy", checked: w.enabled, onchange: (e) => upd(w, { enabled: e.target.checked }) }) : h("span", { text: w.enabled ? "bật" : "tắt" })),
      row("Ưu tiên", num("priority", 0, 1)),
      row("Nhường (giây)", num("claim_delay_s", 0, 1)),
      row("Engine mặc định", admin ? h("select", { "aria-label": "Engine mặc định", onchange: (e) => upd(w, { engine_default: e.target.value }) }, ENGINES.map(([v, l]) => h("option", { value: v, text: l, selected: w.engine_default === v }))) : h("span", { text: w.engine_default })),
      row("Trống tối thiểu (GB)", num("min_free_gb", 0, 1)),
      row("Tối đa (phút)", num("max_minutes", 5, 1)),
      w.note ? h("p", { class: "an-dim", text: w.note }) : null);
  }));
  if (!admin) P.wList.append(h("p", { class: "an-dim", text: "Chỉ admin mới sửa được cấu hình máy." }));
}

/* ---------- khung trang, định tuyến ---------- */
function render() {
  const D = S.detail;
  $("an-tabs").querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === S.tab)));
  for (const [t] of TABS) $("pane-" + t).hidden = !!D || t !== S.tab;
  $("pane-detail").hidden = !D;
}
function route() {
  const hs = decodeURIComponent(location.hash.slice(1));
  let m;
  if ((m = hs.match(/^job=(.+)$/))) { S.tab = "jobs"; openDetail(m[1]); }
  else {
    closeDetail();
    const pm = hs.match(/^jobs=(\d+)$/);
    if (pm) S.jobsPage = Math.max(1, +pm[1]);
    else if (hs === "jobs" && S.jobsPage > 1) history.replaceState(null, "", "#" + jobsHash());
    const hsTab = pm ? "jobs" : hs;
    if (TABS.some(([t]) => t === hsTab)) S.tab = hsTab;
    if (S.tab === "jobs") refreshJobs();
    if (S.tab === "workers") refreshWorkers(true);
  }
  render();
}
function heartbeat() {
  const now = Date.now(), D = S.detail;
  tickElapsed();
  if (document.hidden) return;
  if (D && D.job && active(D.job) && now - last.job >= 1500) refreshJob().catch(() => {});
  else if (!D && S.tab === "jobs" && S.jobs.some(active) && now - last.jobs >= 4000) refreshJobs();
  else if (!D && S.tab === "workers" && now - last.workers >= 8000) refreshWorkers();
}
let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const D = S.detail;
  if (D && D.ed && !document.hidden) D.ed.tick(dt);
  requestAnimationFrame(loop);
}

function boot() {
  const tabs = $("an-tabs"), root = $("an-root");
  tabs.replaceChildren(...TABS.map(([t, label]) => h("button", { type: "button", role: "tab", "data-tab": t, text: label, onclick: () => { if (location.hash === "#" + t) route(); else location.hash = "#" + t; } })));
  root.replaceChildren(...[...TABS.map(([t]) => t), "detail"].map((t) => h("section", { id: "pane-" + t, class: "an-pane", hidden: true })));
  buildNew(); buildJobs(); buildWorkers();
  addEventListener("hashchange", route);
  setInterval(heartbeat, 500);
  requestAnimationFrame(loop);
  route();
  api("me").then((r) => { S.me = { isAdmin: !!r.isAdmin, ...r.user }; if (S.tab === "workers") paintWorkers(); if (S.jobsLoaded && !S.detail) paintJobs(); if (S.detail && S.detail.job) paintTop(S.detail); }, (e) => banner(e));
  window.__anim = S;
}
boot();
