/*
 * Xưởng VFX (vfx.html). Hợp đồng API, vòng đời job, hình dạng dữ liệu: docs/vfx-studio.md.
 * Thư viện pixelfx (1,1 MB) chỉ nạp khi cần; ?mock=1 dùng API giả trong js/vfx-mock.js.
 */
const MOCK = /[?&]mock=1\b/.test(location.search);
const CFG = window.SUPABASE_CONFIG || {};
const LIB_URL = "../vfx/pixelfx-lib.js?v=20261117a";

const STAGES = [["setup", "Chuẩn bị"], ["drafting", "Phác thảo"], ["refining", "Tinh chỉnh"], ["checking", "Kiểm tra"], ["rendering", "Render"], ["uploading", "Tải lên"]];
const STATUS = {
  queued: ["Đang chờ", "wait"], running: ["Đang làm", "run"], done: ["Xong", "ok"], failed: ["Lỗi", "bad"], canceled: ["Đã huỷ", "off"],
};
const WSTATUS = { idle: ["Rảnh", "ok"], busy: ["Đang làm", "run"], paused: ["Tạm dừng", "wait"], quota: ["Hết hạn mức", "bad"], offline: ["Offline", "off"] };
const BG_LABEL = { none: "Trong suốt", dark: "Tối", ground: "Mặt đất", sky: "Trời đêm", light: "Sáng" };
const EXAMPLES = [
  "Vụ nổ lửa nhỏ khi đạn trúng tường",
  "Hồi máu xanh lá bay lên quanh nhân vật, lặp",
  "Chém kiếm vòng cung trắng, để lại vệt mờ",
  "Cổng dịch chuyển tím xoay, nổ sao khi mở",
  "Mưa tia lửa điện quanh cột đèn, lặp",
];
const ACCEPT = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm))$/;
const TABS = [["new", "Tạo mới"], ["jobs", "Job của đội"], ["lib", "Thư viện"], ["workers", "Máy gen"]];
const APP_URL = "https://github.com/patch-gg/pixelfx";

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function toast(msg) {
  const t = h("div", { class: "dz-toast", text: msg });
  $("vx-toasts").append(t);
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
  return h("span", { class: "vx-el", "data-t0": Date.parse(t0), "data-t1": live ? "" : Date.parse(job.finished_at || t0), "data-pre": job.status === "queued" ? "chờ " : live ? "" : "mất " });
}
function tickElapsed() {
  for (const e of document.querySelectorAll(".vx-el")) {
    const t0 = +e.dataset.t0, t1 = e.dataset.t1 ? +e.dataset.t1 : Date.now();
    e.textContent = e.dataset.pre + fmtDur(t1 - t0);
  }
}
const pill = (kind, label) => h("span", { class: "vx-pill vx-pill--" + kind, text: label });
const statusPill = (s) => pill((STATUS[s] || ["", "off"])[1], (STATUS[s] || [s])[0]);

/* ---------- API ---------- */
class ApiError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}
let mockMod = null;
const loadMock = () => (mockMod ||= import("./vfx-mock.js"));
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
    res = await fetch(base() + "/functions/v1/vfx-studio", {
      method: "POST",
      headers: { apikey: CFG.anonKey, Authorization: "Bearer " + (tok || CFG.anonKey), "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
  } catch { throw new ApiError("network", "Không nối được máy chủ, kiểm tra mạng rồi thử lại."); }
  const text = await res.text();
  let d = null;
  try { d = JSON.parse(text); } catch { d = null; }
  if (d && d.ok) return d;
  if (res.status === 404 && !(d && d.error && d.error.code)) throw new ApiError("closed", "Xưởng chưa mở: máy chủ chưa cài chức năng vfx-studio. Báo admin triển khai rồi thử lại.");
  if (res.status === 401 || res.status === 403) throw new ApiError("auth", "Bạn chưa đăng nhập, phiên đã hết hạn hoặc tài khoản chưa được duyệt.");
  throw new ApiError("api", (d && d.error && d.error.message) || "Máy chủ trả lỗi " + res.status + ".");
}
async function putFile(uploadUrl, blob, type) {
  if (uploadUrl.startsWith("mock://")) { await loadMock(); window.__vfxMock.uploads.push({ name: blob.name, type, size: blob.size }); window.__vfxMock.blobs[uploadUrl.slice(11)] = URL.createObjectURL(blob); return; }
  let res;
  try { res = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": type }, body: blob }); } catch { throw new ApiError("network", "Không tải được ảnh lên, kiểm tra mạng."); }
  if (!res.ok) throw new ApiError("api", "Tải file lên không được (lỗi " + res.status + ").");
}
function pubUrl(path, bust) {
  if (!path) return "";
  if (path.startsWith("data:")) return path;
  if (MOCK && window.__vfxMock && window.__vfxMock.blobs[path]) return window.__vfxMock.blobs[path];
  const u = MOCK ? new URL("vfx/" + path, location.href).href : base() + "/storage/v1/object/public/vfx/" + path;
  return bust ? u + "?t=" + Date.now() : u;
}

/* ---------- trạng thái ---------- */
const S = {
  tab: "new",
  me: { isAdmin: false },
  banner: null,
  lib: null,
  jobs: [], jobsLoaded: false, jobsFilter: "all",
  workers: [], workersLoaded: false,
  libView: { cat: "all", q: "" },
  form: { prompt: "", files: [], kind: "auto", size: "auto", duration: "", palette: null, actor: "auto", category: "", base: null, busy: false, moreOpen: false },
  detail: null,
};
const last = { jobs: 0, job: 0, workers: 0 };
const P = {};

function banner(err) {
  const el = $("vx-banner");
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

let libPromise = null;
function ensureLib() {
  return (libPromise ||= import(LIB_URL).then((m) => (S.lib = m), (e) => { libPromise = null; throw e; }));
}

/* ---------- dropzone ---------- */
async function shrink(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  const bmp = await createImageBitmap(file);
  const m = Math.max(bmp.width, bmp.height);
  if (m <= 1024) { bmp.close && bmp.close(); return file; }
  const k = 1024 / m, c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, file.type, 0.92));
  return new File([blob], file.name, { type: file.type });
}
function dropzone(files, onChange) {
  const input = h("input", { type: "file", multiple: true, hidden: true, accept: "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" });
  const thumbs = h("div", { class: "vx-thumbs" });
  const box = h("div", { class: "vx-drop", tabindex: 0, role: "button", "aria-label": "Thêm ảnh, GIF hoặc clip tham chiếu" },
    h("b", { text: "Kéo ảnh, GIF hoặc clip ngắn vào đây" }),
    h("span", { text: "hoặc bấm để chọn, hoặc dán bằng Ctrl+V. png, jpg, webp, gif, mp4, webm; tối đa 6 file, 15 MB mỗi file." }));
  const root = h("div", { class: "vx-dz" }, box, input, thumbs);
  const paint = () => {
    thumbs.replaceChildren(...files.map((f, i) => h("figure", { class: "vx-thumb" },
      f.kind === "video" ? h("video", { src: f.url, muted: true, preload: "metadata", playsinline: true }) : h("img", { src: f.url, alt: f.name }),
      h("figcaption", { text: f.name }),
      h("button", { class: "vx-thumb__x", type: "button", "aria-label": "Bỏ " + f.name, text: "×", onclick: () => { URL.revokeObjectURL(f.url); files.splice(i, 1); paint(); onChange(); } }))));
  };
  const dz = {
    el: root, files, paint,
    async add(list) {
      for (const raw of list) {
        if (!ACCEPT.test(raw.type)) { toast("Không nhận định dạng " + (raw.type || raw.name)); continue; }
        if (files.length >= 6) { toast("Tối đa 6 file tham chiếu"); break; }
        if (raw.size > 15 * 1024 * 1024) { toast(raw.name + " nặng quá 15 MB"); continue; }
        let f = raw;
        try { f = await shrink(raw); } catch { f = raw; }
        const kind = f.type === "image/gif" ? "gif" : f.type.startsWith("video/") ? "video" : "image";
        files.push({ name: f.name || "ảnh dán", kind, blob: f, type: f.type, url: URL.createObjectURL(f) });
      }
      paint(); onChange();
    },
    clear() { files.forEach((f) => URL.revokeObjectURL(f.url)); files.length = 0; paint(); onChange(); },
  };
  box.addEventListener("click", () => input.click());
  box.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { dz.add([...input.files]); input.value = ""; });
  for (const ev of ["dragenter", "dragover"]) box.addEventListener(ev, (e) => { e.preventDefault(); box.classList.add("is-over"); });
  for (const ev of ["dragleave", "drop"]) box.addEventListener(ev, (e) => { e.preventDefault(); box.classList.remove("is-over"); });
  box.addEventListener("drop", (e) => dz.add([...e.dataTransfer.files]));
  return dz;
}
document.addEventListener("paste", (e) => {
  const dz = S.detail && S.detail.dz && !$("pane-detail").hidden ? S.detail.dz : S.tab === "new" && !S.detail ? P.dz : null;
  if (!dz) return;
  const fs = [...(e.clipboardData ? e.clipboardData.files : [])];
  if (!fs.length) return;
  e.preventDefault();
  dz.add(fs);
});
async function uploadRefs(files) {
  if (!files.length) return [];
  const r = await api("upload_urls", { files: files.map((f) => ({ name: f.name, type: f.type, size: f.blob.size })) });
  await Promise.all(r.files.map((u, i) => putFile(u.uploadUrl, files[i].blob, files[i].type)));
  return r.files.map((u, i) => ({ path: u.path, kind: files[i].kind, name: files[i].name }));
}

/* ---------- màu ---------- */
const hex2 = (n) => n.toString(16).padStart(2, "0");
const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
function medianCut(px, n) {
  let boxes = [px];
  while (boxes.length < n) {
    let bi = -1, bs = 0, bc = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const p of b) { lo = Math.min(lo, p[c]); hi = Math.max(hi, p[c]); }
        const s = (hi - lo) * Math.sqrt(b.length);
        if (s > bs) { bs = s; bi = i; bc = c; }
      }
    });
    if (bi < 0) break;
    const b = boxes[bi].sort((x, y) => x[bc] - y[bc]), mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((s, p) => s + p[c], 0) / b.length))).sort((a, b) => luma(a) - luma(b))
    .map((c) => "#" + c.map(hex2).join(""));
}
async function paletteFromImage(file) {
  const bmp = await createImageBitmap(file.blob);
  const k = Math.min(1, 96 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext("2d");
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data, px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
  if (px.length < 2) throw new Error("Ảnh trống, không lấy được màu");
  return medianCut(px, 6);
}
function rampEditor(arr, onInput, onStruct) {
  const row = h("div", { class: "vx-ramp" });
  arr.forEach((c, i) => row.append(h("input", {
    type: "color", value: /^#[0-9a-f]{6}$/i.test(c) ? c : "#000000", "aria-label": "Màu " + (i + 1),
    oninput: (e) => { arr[i] = e.target.value; onInput(arr.slice()); },
    onchange: () => onStruct && onStruct(arr.slice()),
  })));
  if (onStruct) row.append(
    h("button", { class: "btn btn--sm", type: "button", text: "+", title: "Thêm một nấc sáng hơn", disabled: arr.length >= 12, onclick: () => onStruct([...arr, arr[arr.length - 1]]) }),
    h("button", { class: "btn btn--sm", type: "button", text: "−", title: "Bớt một nấc", disabled: arr.length <= 2, onclick: () => onStruct(arr.slice(0, -1)) }));
  return row;
}
function strip(colors) {
  return h("span", { class: "vx-strip" }, colors.map((c) => h("i", { style: "background:" + c })));
}
function paletteChooser({ PAL, get, set, fromImage, none = "Tự chọn" }) {
  const root = h("div", { class: "vx-pal" });
  const preset = (v, label) => h("button", {
    class: "vx-preset", type: "button", "aria-pressed": String(same(get(), v)), title: label,
    onclick: () => { set(v ? v.slice() : null); paint(); },
  }, h("span", { text: label }), v ? strip(v) : null);
  const paint = () => {
    const cur = get();
    root.replaceChildren(
      h("div", { class: "vx-pal__grid" }, preset(null, none), Object.entries(PAL).map(([k, v]) => preset(v, k))),
      cur ? h("div", { class: "vx-pal__cur" }, h("span", { class: "vx-label", text: "Dải màu tối → sáng, bấm ô để sửa" }),
        rampEditor(cur.slice(), (a) => set(a), (a) => { set(a); paint(); })) : null,
      fromImage ? h("button", {
        class: "btn btn--sm", type: "button", text: "Lấy màu từ ảnh",
        onclick: async () => {
          const f = fromImage();
          if (!f) return toast("Thêm một ảnh tham chiếu trước");
          try { set(await paletteFromImage(f)); paint(); toast("Đã lấy 6 màu từ " + f.name); } catch (e) { toast(e.message); }
        },
      }) : null);
  };
  paint();
  root.repaint = paint;
  return root;
}
function segment(items, get, set) {
  const root = h("div", { class: "vx-seg", role: "group" });
  const paint = () => root.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(get()))));
  for (const [v, label] of items) root.append(h("button", { type: "button", "data-v": v, text: label, onclick: () => { set(v); paint(); } }));
  paint();
  return root;
}
const field = (label, ...kids) => h("div", { class: "vx-field" }, h("span", { class: "vx-label", text: label }), ...kids);

/* ---------- form chỉnh option của effect ---------- */
const isRampOpt = (v) => Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === "string" && /^#[0-9a-f]{3,8}$/i.test(c));
function optionsForm(defaults, values, onChange) {
  const root = h("div", { class: "vx-opts" });
  const keys = Object.keys(defaults).filter((k) => k !== "palette" && k !== "seed");
  for (const k of keys) {
    const def = defaults[k], cur = () => (k in values ? values[k] : def);
    if (typeof def === "number") {
      const int = Number.isInteger(def), mag = Math.abs(def), max = int ? Math.max(10, mag * 3) : Math.max(1, mag * 3), min = def < 0 ? -max : 0;
      const num = h("input", { type: "number", value: cur(), step: int ? 1 : 0.01 });
      const rng = h("input", { type: "range", min, max, step: int ? 1 : 0.01, value: cur() });
      const put = (v) => { if (!Number.isFinite(v)) return; values[k] = v; num.value = v; rng.value = v; onChange(); };
      rng.addEventListener("input", () => put(+rng.value));
      num.addEventListener("input", () => { const v = parseFloat(num.value); if (Number.isFinite(v)) { values[k] = v; rng.value = v; onChange(); } });
      root.append(h("label", { class: "vx-opt" }, h("span", { text: k }), rng, num));
    } else if (typeof def === "boolean") {
      root.append(h("label", { class: "vx-opt vx-opt--check" }, h("input", { type: "checkbox", checked: cur(), onchange: (e) => { values[k] = e.target.checked; onChange(); } }), h("span", { text: k })));
    } else if (typeof def === "string" && !isRampOpt([def])) {
      root.append(h("label", { class: "vx-opt" }, h("span", { text: k }), h("input", { type: "text", value: cur(), oninput: (e) => { values[k] = e.target.value; onChange(); } })));
    } else if (isRampOpt(def)) {
      const arr = (isRampOpt(cur()) ? cur() : def).slice();
      root.append(h("div", { class: "vx-opt vx-opt--ramp" }, h("span", { text: k }), rampEditor(arr, (a) => { values[k] = a; onChange(); })));
    }
  }
  if (!root.children.length) root.append(h("p", { class: "vx-dim", text: "Effect này không có thông số riêng." }));
  return root;
}

/* ---------- player ---------- */
const isScreen = (m) => m.size[0] >= 320 && Math.abs(m.size[0] / m.size[1] - 16 / 9) < 0.05;
function makeEntry(id, mod, core) {
  const meta = { fps: 30, bg: "dark", loop: false, duration: 1, tags: [], options: {}, ...mod.meta };
  return { id, name: meta.name || id, cat: id.split("/")[0], meta, mod: { ...mod, meta }, core };
}
class Player {
  constructor(canvas, entry, { aspect, pad, opts = {}, bg }) {
    Object.assign(this, { canvas, entry, core: entry.core, ctx: canvas.getContext("2d"), opts, flip: false, actor: true, speed: 1, playing: true, bg: bg || entry.meta.bg });
    this.layout(aspect, pad);
  }
  get acted() { return !!this.entry.mod.act && this.actor; }
  layout(aspect, pad) {
    Object.assign(this, { aspect, pad });
    const { core, entry } = this, acted = this.acted, b = acted ? { ...core.actBounds(entry.mod) } : null;
    if (b) b.y1 = Math.min(b.y1, 22);
    const [w, hh] = acted ? [b.x1 - b.x0, b.y1 - b.y0] : entry.meta.size, [ox, oy] = acted ? [-b.x0, -b.y0] : entry.meta.origin;
    const k = acted ? Math.min(pad, 1.1) : pad;
    this.W = Math.ceil(Math.max(w * k, hh * k * aspect));
    this.H = Math.ceil(this.W / aspect);
    this.x = Math.floor((this.W - w) / 2) + ox;
    this.y = acted ? Math.max(oy + 2, this.H - b.y1 - 2) : Math.floor((this.H - hh) / 2) + oy;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    if (!this.fixedFit) {
      const shown = this.canvas.getBoundingClientRect().width * devicePixelRatio;
      this.canvas.style.imageRendering = shown && shown < this.W ? "auto" : "";
    }
    this.frame = core.createFrame(this.W, this.H);
    this.img = this.ctx.createImageData(this.W, this.H);
    this.setBg(this.bg);
    this.restart();
  }
  fit(aw, ah) {
    this.fixedFit = true;
    const k = Math.floor(Math.min(aw / this.W, ah / this.H)), s = this.canvas.style;
    if (k >= 1) { s.width = this.W * k + "px"; s.height = this.H * k + "px"; s.imageRendering = ""; }
    else { s.width = Math.floor(aw) + "px"; s.height = Math.round((aw * this.H) / this.W) + "px"; s.imageRendering = "auto"; }
  }
  setBg(kind) {
    this.bg = kind;
    this.bgBuf = kind === "none" ? null : this.core.backdrop(kind, this.W, this.H, this.y);
    this.dirty = true;
  }
  restart() {
    this.inst = (this.acted ? this.core.createAct : this.core.createFx)(this.entry.mod, { x: this.x, y: this.y, flip: this.flip, ...this.opts });
    this.acc = 0; this.wait = 0; this.dirty = true;
  }
  tick(dt) {
    const m = this.entry.meta, step = 1 / m.fps;
    if (this.playing) this.acc = Math.min(this.acc + dt * this.speed, 0.25);
    let moved = false;
    while (this.acc >= step) {
      this.acc -= step;
      if (!m.loop && (this.acted ? this.inst.done() : this.inst.t >= m.duration)) {
        this.wait += step;
        if (this.wait > 0.45) this.restart();
      } else this.inst.update(step);
      moved = true;
    }
    if (moved || this.dirty) this.render();
  }
  render() {
    const { core } = this, f = core.clearFrame(this.frame), m = this.entry.meta;
    if (this.acted) {
      this.inst.draw(f);
      core.composite(f, this.img.data, this.bgBuf);
      const [sx, sy] = this.inst.shake;
      if (sx || sy) this.ctx.clearRect(0, 0, this.W, this.H);
      this.ctx.putImageData(this.img, sx, sy);
      this.dirty = false;
      return;
    }
    this.inst.draw(f, "back");
    const tt = m.loop ? this.inst.t % m.duration : Math.min(this.inst.t, m.duration);
    if (m.actor && this.actor) core.drawActor(core.painterFor(f).place(this.x, this.y, this.flip), this.inst.options.actor ?? core.stockActor(), core.actorAlphaOf(this.entry.mod, tt, this.inst.options));
    this.inst.draw(f, "front");
    core.composite(f, this.img.data, this.bgBuf);
    this.ctx.putImageData(this.img, 0, 0);
    this.dirty = false;
  }
}

/* ---------- sprite sheet làm phía trình duyệt, cùng dạng với fxlib.spriteSheet ---------- */
function edgeFade(f, E = 8) {
  const { w, h: hh, light: L } = f;
  for (let y = 0; y < hh; y++) {
    const ey = Math.min(y, hh - 1 - y);
    for (let x = 0; x < w; x++) {
      const e = Math.min(ey, x, w - 1 - x);
      if (e >= E) { x = w - 1 - E; continue; }
      const i = y * w + x, l = L[i];
      if (!(l & 0xffffff)) continue;
      const u = (e + 0.5) / E, k = u * u * (3 - 2 * u);
      L[i] = (l & 0xff000000) | Math.round((l & 255) * k) | (Math.round(((l >>> 8) & 255) * k) << 8) | (Math.round(((l >>> 16) & 255) * k) << 16);
    }
  }
}
function renderSheet(entry, opts, flip) {
  const { core, meta: m, mod } = entry, [w, hh] = m.size, [ox, oy] = m.origin, fps = m.fps;
  const n = Math.max(1, Math.round(m.duration * fps) + (m.loop ? 0 : 1));
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt((n * hh) / w)))), rows = Math.ceil(n / cols);
  const name = entry.id.split("/").pop();
  const cv = document.createElement("canvas");
  cv.width = cols * w; cv.height = rows * hh;
  const g = cv.getContext("2d"), frame = core.createFrame(w, hh), img = g.createImageData(w, hh);
  const inst = core.createFx(mod, { x: ox, y: oy, ...opts, flip });
  const fade = !isScreen(m), json = { frames: [], meta: {} };
  for (let i = 0; i < n; i++) {
    if (i) inst.update(1 / fps);
    core.clearFrame(frame);
    inst.draw(frame);
    if (fade) edgeFade(frame);
    core.composite(frame, img.data, null);
    const x = (i % cols) * w, y = Math.floor(i / cols) * hh;
    g.putImageData(img, x, y);
    json.frames.push({ filename: `${name} ${i}`, frame: { x, y, w, h: hh }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w, h: hh }, sourceSize: { w, h: hh }, duration: Math.round(1000 / fps) });
  }
  json.meta = {
    app: APP_URL, version: "1", image: `${name}.png`, format: "RGBA8888", size: { w: cols * w, h: rows * hh }, scale: "1",
    frameTags: [{ name, from: 0, to: n - 1, direction: "forward" }],
    pixelfx: { id: entry.id, name: m.name, fps, loop: m.loop, frames: n, frameSize: [w, hh], pivot: m.origin, columns: cols, ...(mod.act ? { act: core.actTiming(mod) } : {}) },
  };
  return { canvas: cv, json, name, n };
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

/* ---------- tab Tạo mới ---------- */
function buildNew() {
  const F = S.form, pane = $("pane-new");
  const prompt = h("textarea", { class: "vx-prompt", rows: 4, placeholder: "Mô tả hiệu ứng bạn muốn. Ví dụ: vụ nổ lửa nhỏ khi đạn trúng tường, 6 khung, màu cam đậm.", "aria-label": "Mô tả hiệu ứng", oninput: (e) => { F.prompt = e.target.value; sync(); } });
  const chips = h("div", { class: "vx-chips" }, EXAMPLES.map((t) => h("button", { class: "vx-chip", type: "button", text: t, onclick: () => { F.prompt = t; prompt.value = t; sync(); prompt.focus(); } })));
  const baseChip = h("div", { class: "vx-base", hidden: true });
  P.dz = dropzone(F.files, () => sync());
  const fromImage = () => F.files.find((f) => f.kind === "image" || f.kind === "gif");
  const optBody = h("div", { class: "vx-more__body" });
  const submit = h("button", { class: "btn btn--primary vx-submit", type: "button", text: "Gửi cho máy gen", disabled: true, onclick: send });
  P.sync = sync;
  P.baseChip = baseChip;

  const more = h("details", { class: "vx-more", ontoggle: (e) => {
    F.moreOpen = e.target.open;
    if (F.moreOpen && !optBody.dataset.ready) {
      optBody.textContent = "Đang tải bảng màu…";
      ensureLib().then((lib) => fillOptions(lib), () => { optBody.textContent = "Không tải được bảng màu."; });
    }
  } }, h("summary", { text: "Tuỳ chọn thêm" }), optBody);

  function fillOptions(lib) {
    optBody.dataset.ready = "1";
    const dur = h("input", { type: "number", min: 0.2, max: 10, step: 0.1, placeholder: "Tự chọn", "aria-label": "Thời lượng (giây)", value: F.duration, oninput: (e) => { F.duration = e.target.value; } });
    const cat = h("select", { "aria-label": "Nhóm gợi ý", onchange: (e) => { F.category = e.target.value; } },
      h("option", { value: "", text: "Tự chọn" }), lib.categories.map((c) => h("option", { value: c.id, text: c.name + " — " + c.blurb, selected: F.category === c.id })));
    P.pal = paletteChooser({ PAL: lib.PAL, get: () => F.palette, set: (v) => { F.palette = v; }, fromImage });
    optBody.replaceChildren(
      field("Kiểu", segment([["auto", "Tự chọn"], ["oneshot", "Một phát"], ["loop", "Lặp"]], () => F.kind, (v) => { F.kind = v; })),
      field("Cỡ", segment([["auto", "Tự chọn"], ["S", "Nhỏ ~32px"], ["M", "Vừa ~64px"], ["L", "Lớn ~128px"]], () => F.size, (v) => { F.size = v; })),
      field("Thời lượng (giây)", dur),
      field("Nhân vật", segment([["auto", "Tự chọn"], ["yes", "Có nhân vật diễn"], ["no", "Chỉ effect"]], () => F.actor, (v) => { F.actor = v; })),
      field("Nhóm gợi ý", cat),
      field("Bảng màu", P.pal));
  }

  async function send() {
    if (F.busy || !F.prompt.trim()) return;
    F.busy = true; sync();
    try {
      const refs = await guard(uploadRefs(F.files));
      const dur = parseFloat(F.duration);
      const r = await guard(api("submit", {
        prompt: F.prompt.trim(), title: F.prompt.trim().slice(0, 40), refs,
        params: { kind: F.kind, size: F.size, duration: Number.isFinite(dur) ? dur : null, fps: null, palette: F.palette, actor: F.actor, category: F.category || null },
        base_effect: F.base,
      }));
      toast("Đã gửi, máy gen sẽ nhận ngay khi rảnh");
      F.prompt = ""; F.base = null; prompt.value = "";
      P.dz.clear();
      S.jobsLoaded = false;
      location.hash = "#job=" + r.job.id;
    } catch { /* banner đã hiện */ }
    F.busy = false; sync();
  }
  function sync() {
    submit.disabled = F.busy || !F.prompt.trim();
    submit.textContent = F.busy ? "Đang gửi…" : "Gửi cho máy gen";
    baseChip.hidden = !F.base;
    baseChip.replaceChildren(...(F.base ? [h("span", { class: "vx-label", text: "Dựa trên" }), h("b", { text: F.base }),
      h("button", { class: "vx-thumb__x vx-base__x", type: "button", "aria-label": "Bỏ", text: "×", onclick: () => { F.base = null; sync(); } })] : []));
  }

  pane.replaceChildren(h("div", { class: "vx-new" },
    h("section", { class: "vx-card-box" },
      h("label", { class: "vx-label", for: "vx-prompt", text: "Bạn muốn hiệu ứng gì?" }),
      prompt, chips, baseChip,
      h("span", { class: "vx-label", text: "Ảnh, GIF hay clip tham chiếu (không bắt buộc)" }), P.dz.el,
      more,
      h("div", { class: "vx-send" }, submit, h("p", { class: "vx-dim", text: "Máy linux nhận trước, thường 10–25 phút. Bạn có thể đóng trang, job vẫn chạy; xem tiến độ ở tab Job của đội." }))),
    h("aside", { class: "vx-tips vx-card-box" },
      h("h3", { text: "Viết sao cho máy hiểu" }),
      h("ul", {}, [
        "Nói rõ nó diễn ra khi nào: đạn trúng tường, nhân vật hồi máu, mở rương.",
        "Một phát (nổ, chém) hay lặp (lửa trại, hào quang)?",
        "Kèm ảnh game của bạn để máy học màu và độ lớn pixel.",
        "Thích một effect trong Thư viện thì bấm “Dựa trên cái này” rồi nói muốn đổi gì.",
      ].map((t) => h("li", { text: t }))))));
  prompt.id = "vx-prompt";
  sync();
}

/* ---------- tab Job của đội ---------- */
const active = (j) => j.status === "queued" || j.status === "running";
async function refreshJobs() {
  last.jobs = Date.now();
  try {
    const r = await guard(api("list", { mine: S.jobsFilter === "mine", limit: 60 }));
    S.jobs = r.jobs; S.jobsLoaded = true;
    if (S.tab === "jobs" && !S.detail) paintJobs();
    if (S.detail && S.detail.kind === "job") paintChain();
  } catch { /* banner */ }
}
function buildJobs() {
  const pane = $("pane-jobs");
  P.jobsGrid = h("div", { class: "vx-grid" });
  pane.replaceChildren(
    h("div", { class: "vx-bar" },
      segment([["all", "Tất cả"], ["mine", "Của tôi"]], () => S.jobsFilter, (v) => { S.jobsFilter = v; S.jobsLoaded = false; P.jobsGrid.replaceChildren(); refreshJobs(); }),
      h("span", { class: "vx-spacer" }),
      h("button", { class: "btn btn--sm", type: "button", text: "Làm mới", onclick: refreshJobs }),
      h("a", { class: "btn btn--primary btn--sm", href: "#new", text: "+ Tạo mới" })),
    P.jobsGrid);
}
function jobThumb(j) {
  const f = j.result && j.result.files;
  const src = f && f.contact ? pubUrl(f.contact) : j.preview ? pubUrl(j.preview) : "";
  return h("div", { class: "vx-card__thumb" }, src ? h("img", { src, alt: "", loading: "lazy" }) : h("span", { class: "vx-card__ph", text: j.status === "failed" ? "!" : "…" }));
}
function paintJobs() {
  const g = P.jobsGrid;
  if (!S.jobs.length) {
    g.replaceChildren(h("p", { class: "vx-empty", text: S.jobsLoaded ? "Chưa có job nào. Qua tab Tạo mới để gửi yêu cầu đầu tiên." : "Đang tải…" }));
    return;
  }
  g.replaceChildren(...S.jobs.map((j) => h("a", { class: "vx-card", href: "#job=" + j.id },
    jobThumb(j),
    h("div", { class: "vx-card__body" },
      h("div", { class: "vx-card__top" }, h("b", { class: "vx-card__title", text: j.title || j.prompt }), statusPill(j.status)),
      h("p", { class: "vx-card__prompt", text: j.prompt }),
      h("div", { class: "vx-card__meta" }, h("span", { text: j.author }), j.worker ? h("span", { text: j.worker }) : null, elapsedSpan(j))))));
  tickElapsed();
}

/* ---------- chi tiết job / effect ---------- */
function closeDetail() {
  S.detail = null;
  P.player = null;
}
async function openDetail(kind, id) {
  if (S.detail && S.detail.kind === kind && S.detail.id === id) return;
  closeDetail();
  const D = S.detail = { kind, id, job: null, entry: null, built: false, opts: {}, logN: -1, dz: null, token: Symbol() };
  buildDetailShell(D);
  render();
  try {
    if (kind === "job") {
      if (!S.jobsLoaded) refreshJobs();
      await refreshJob(true);
    } else {
      const lib = await guard(ensureLib());
      if (S.detail !== D) return;
      if (!lib.effects[id]) { D.el.top.replaceChildren(h("p", { class: "vx-empty", text: "Không có effect " + id + " trong thư viện." })); return; }
      D.entry = makeEntry(id, lib.effects[id], lib);
      paintTop(D);
      buildPlayer(D);
    }
  } catch { /* banner */ }
}
async function refreshJob(first) {
  const D = S.detail;
  if (!D || D.kind !== "job") return;
  last.job = Date.now();
  const r = await guard(api("get", { id: D.id }));
  if (S.detail !== D) return;
  D.job = r.job;
  paintTop(D);
  if (D.job.status === "done" && !D.entry && !D.loading) await loadJobEntry(D);
  if (first) paintChain();
}
async function loadJobEntry(D) {
  const j = D.job, f = j.result && j.result.files;
  if (!f || !f.bundle) { D.playerBox.replaceChildren(h("p", { class: "vx-empty", text: "Job đã xong nhưng chưa có bundle để chơi thử." })); return; }
  D.loading = true;
  D.playerBox.replaceChildren(h("p", { class: "vx-empty", text: "Đang nạp effect…" }));
  try {
    const url = new URL(pubUrl(f.bundle), location.href).href + (f.bundle.startsWith("data:") ? "" : "?v=" + encodeURIComponent(j.finished_at || ""));
    const b = await import(url);
    if (S.detail !== D) return;
    D.entry = makeEntry(j.result.effect_id, b.fx, b);
    buildPlayer(D);
  } catch (e) {
    D.playerBox.replaceChildren(h("p", { class: "vx-empty", text: "Không nạp được effect: " + e.message }));
  }
  D.loading = false;
}
function buildDetailShell(D) {
  const pane = $("pane-detail");
  D.el = { top: h("div", { class: "vx-top" }), chain: h("div", { class: "vx-chain", hidden: true }) };
  D.playerBox = h("div", { class: "vx-playerbox" });
  D.reviseBox = h("div", { class: "vx-revise vx-card-box", hidden: true });
  pane.replaceChildren(
    h("a", { class: "vx-back", href: D.kind === "job" ? "#jobs" : "#lib", text: D.kind === "job" ? "← Danh sách job" : "← Thư viện" }),
    D.el.top, D.playerBox, D.reviseBox, D.el.chain);
  if (D.kind === "job") {
    const log = h("div", { class: "vx-log", role: "log", "aria-live": "polite" });
    D.ref = {
      title: h("h2", { class: "vx-h2" }), pill: h("span"), meta: h("div", { class: "vx-meta" }), prompt: h("p", { class: "vx-prompt-show" }), refs: h("div", { class: "vx-refs" }),
      stepper: h("ol", { class: "vx-stepper" }), log, live: h("img", { class: "vx-live", alt: "Ảnh xem trước", hidden: true }), err: h("p", { class: "vx-err", hidden: true }), btns: h("div", { class: "vx-bar" }),
    };
    const r = D.ref;
    D.el.top.append(h("div", { class: "vx-head" }, r.title, r.pill), r.meta, r.prompt, r.refs, r.err, r.stepper, h("div", { class: "vx-work" }, r.log, r.live), r.btns);
  } else {
    D.ref = { title: h("h2", { class: "vx-h2" }), meta: h("div", { class: "vx-meta" }), prompt: h("p", { class: "vx-prompt-show" }), btns: h("div", { class: "vx-bar" }) };
    D.el.top.append(h("div", { class: "vx-head" }, D.ref.title), D.ref.meta, D.ref.prompt, D.ref.btns);
  }
}
function paintTop(D) {
  const r = D.ref;
  if (D.kind === "fx") {
    const e = D.entry, m = e.meta;
    r.title.textContent = m.name || e.id;
    r.meta.replaceChildren(...[e.id, m.loop ? "lặp" : "một phát", `${+m.duration.toFixed(2)} s · ${m.fps} fps`, `${m.size[0]}×${m.size[1]} px`].map((t) => h("span", { text: t })));
    r.prompt.textContent = m.desc || "";
    r.btns.replaceChildren(h("button", { class: "btn btn--primary btn--sm", type: "button", text: "Dựa trên cái này", onclick: () => { S.form.base = e.id; P.sync(); location.hash = "#new"; setTimeout(() => $("vx-prompt").focus(), 50); } }));
    return;
  }
  const j = D.job;
  if (!j) return;
  r.title.textContent = j.title || j.prompt;
  r.pill.replaceWith(r.pill = statusPill(j.status));
  const par = j.params || {};
  r.meta.replaceChildren(
    h("span", { text: "bởi " + j.author }), j.worker ? h("span", { text: "máy " + j.worker }) : null, elapsedSpan(j),
    j.stage && j.status === "running" ? h("span", { text: "bước: " + (STAGES.find((s) => s[0] === j.stage) || [0, j.stage])[1] }) : null,
    par.kind && par.kind !== "auto" ? h("span", { text: par.kind === "loop" ? "lặp" : "một phát" }) : null,
    par.size && par.size !== "auto" ? h("span", { text: "cỡ " + par.size }) : null,
    j.base_effect ? h("span", { text: "dựa trên " + j.base_effect }) : null);
  r.prompt.textContent = j.prompt;
  r.refs.replaceChildren(...(j.refs || []).map((x) => (x.kind === "video" ? h("a", { class: "vx-refchip", href: pubUrl(x.path), target: "_blank", rel: "noopener", text: "▶ " + x.name }) : h("img", { src: pubUrl(x.path), alt: x.name, title: x.name }))));
  r.err.hidden = !j.error;
  r.err.textContent = j.error || "";
  const idx = STAGES.findIndex((s) => s[0] === j.stage);
  r.stepper.hidden = j.status === "queued" && idx < 0;
  r.stepper.replaceChildren(...STAGES.map(([k, label], i) => {
    const st = j.status === "done" || i < idx ? "done" : i === idx ? (j.status === "failed" ? "bad" : j.status === "running" ? "now" : "done") : "todo";
    return h("li", { class: "vx-step vx-step--" + st }, h("i", { text: st === "done" ? "✓" : i + 1 }), h("span", { text: label }));
  }));
  const log = j.log || [];
  if (D.logN !== log.length) {
    const near = r.log.scrollHeight - r.log.scrollTop - r.log.clientHeight < 40;
    r.log.replaceChildren(...log.map((l) => h("div", { class: "vx-log__l" }, h("time", { text: clock(l.t) }), l.stage ? h("em", { text: (STAGES.find((s) => s[0] === l.stage) || [0, l.stage])[1] }) : null, h("span", { text: l.msg }))));
    if (near || D.logN < 0) r.log.scrollTop = r.log.scrollHeight;
    D.logN = log.length;
  }
  const prev = j.preview ? pubUrl(j.preview) : "";
  r.live.hidden = !prev || j.status === "done";
  if (prev && (j.status === "running" || !r.live.src)) {
    if (prev.startsWith("data:")) { if (r.live.src !== prev) r.live.src = prev; }
    else { const im = new Image(); im.onload = () => { r.live.src = im.src; }; im.src = prev + "?t=" + Date.now(); }
  }
  if (D.btnKey !== j.status) r.btns.replaceChildren(
    active(j) ? h("button", { class: "btn btn--danger btn--sm", type: "button", text: "Huỷ job", onclick: () => jobAction("cancel") }) : null,
    j.status === "failed" || j.status === "canceled" ? h("button", { class: "btn btn--primary btn--sm", type: "button", text: "Thử lại", onclick: () => jobAction("retry") }) : null);
  D.btnKey = j.status;
  if (j.status === "done" && !D.revBuilt) buildRevise(D);
  D.reviseBox.hidden = j.status !== "done";
}
async function jobAction(a) {
  const D = S.detail;
  try {
    await guard(api(a, { id: D.id }));
    D.logN = -1;
    toast(a === "cancel" ? "Đã huỷ job" : "Đã đưa job về hàng đợi");
    await refreshJob();
  } catch { /* banner */ }
}
function buildRevise(D) {
  D.revBuilt = true;
  const files = [];
  const text = h("textarea", { class: "vx-prompt", rows: 3, placeholder: "Muốn sửa gì? Ví dụ: chậm lại một nửa, đổi sang màu xanh, bỏ khói.", "aria-label": "Góp ý để sửa tiếp" });
  D.dz = dropzone(files, () => {});
  const btn = h("button", { class: "btn btn--primary", type: "button", text: "Gửi sửa tiếp", onclick: async () => {
    if (!text.value.trim()) return toast("Gõ điều muốn sửa trước");
    btn.disabled = true;
    try {
      const refs = await guard(uploadRefs(files));
      const r = await guard(api("submit", { prompt: text.value.trim(), title: (D.job.title || "") + " v2", refs, params: D.job.params || {}, base_effect: null, parent_id: D.job.id }));
      S.jobsLoaded = false;
      toast("Đã gửi bản sửa");
      location.hash = "#job=" + r.job.id;
    } catch { /* banner */ }
    btn.disabled = false;
  } });
  D.reviseBox.replaceChildren(h("h3", { text: "Sửa tiếp" }), h("p", { class: "vx-dim", text: "Máy sẽ lấy bản này làm gốc và sửa theo góp ý của bạn. Mỗi lần sửa là một phiên bản mới, bản cũ vẫn giữ." }), text, D.dz.el, btn);
}
function paintChain() {
  const D = S.detail;
  if (!D || D.kind !== "job" || !D.job) return;
  const byId = new Map(S.jobs.map((j) => [j.id, j]));
  byId.set(D.job.id, D.job);
  const anc = [];
  for (let c = D.job, n = 0; c.parent_id && n < 20; n++) {
    const p = byId.get(c.parent_id);
    if (!p) { anc.unshift({ id: c.parent_id, title: "bản gốc" }); break; }
    anc.unshift(p); c = p;
  }
  const kids = S.jobs.filter((j) => j.parent_id === D.job.id);
  D.el.chain.hidden = !anc.length && !kids.length;
  const link = (j, cur) => cur ? h("b", { class: "vx-chain__cur", text: "bản này" }) : h("a", { href: "#job=" + j.id }, j.title || j.id, j.status ? statusPill(j.status) : null);
  D.el.chain.replaceChildren(h("span", { class: "vx-label", text: "Các phiên bản" }),
    h("div", { class: "vx-chain__row" }, ...anc.flatMap((a) => [link(a), h("span", { text: "→" })]), link(D.job, true),
      kids.length ? h("span", { text: "→" }) : null, ...kids.map((k) => link(k))));
}

function buildPlayer(D) {
  const e = D.entry, m = e.meta, lib = e.core, mod = e.mod;
  const box = D.playerBox;
  const canvas = h("canvas", { class: "vx-cv", "aria-label": m.name || e.id });
  const stage = h("div", { class: "vx-stage" }, canvas);
  const screen = isScreen(m);
  const bgs = ["dark", "ground", "sky", "light", "none"];
  const player = D.player = new Player(canvas, e, { aspect: screen ? 16 / 9 : 16 / 10, pad: screen ? 1 : 1.6, opts: D.opts, bg: bgs.includes(m.bg) ? m.bg : "dark" });
  P.player = player;
  const fit = () => { if (S.detail === D) player.fit(Math.max(240, stage.clientWidth - 16), Math.min(560, Math.max(260, innerHeight * 0.62))); };
  D.fit = fit;
  const rebuild = () => player.restart();
  let rafPending = false;
  const soft = () => { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; player.restart(); }); };

  const playBtn = h("button", { class: "btn btn--sm", type: "button", text: "⏸ Dừng", onclick: () => { player.playing = !player.playing; playBtn.textContent = player.playing ? "⏸ Dừng" : "▶ Chạy"; } });
  const seed = h("input", { type: "number", min: 1, step: 1, "aria-label": "Seed", value: D.opts.seed ?? m.options.seed ?? "", placeholder: "ngẫu nhiên", oninput: (ev) => { const v = parseInt(ev.target.value, 10); if (Number.isFinite(v)) D.opts.seed = v; else delete D.opts.seed; soft(); } });
  const flipBtn = h("button", { class: "btn btn--sm", type: "button", "aria-pressed": "false", text: "Lật ngang", onclick: () => { player.flip = !player.flip; flipBtn.setAttribute("aria-pressed", String(player.flip)); rebuild(); } });
  const hasActor = !!mod.act || !!m.actor;
  const actorBtn = h("button", { class: "btn btn--sm", type: "button", "aria-pressed": "true", text: "Hiện nhân vật", onclick: () => { player.actor = !player.actor; actorBtn.setAttribute("aria-pressed", String(player.actor)); if (mod.act) { player.layout(player.aspect, player.pad); fit(); } player.dirty = true; } });
  const optBox = h("div", { class: "vx-optbox" });
  const palWrap = h("div");
  const pal = paletteChooser({ PAL: lib.PAL, none: "Màu gốc", get: () => D.opts.palette || null, set: (v) => { if (v) D.opts.palette = v; else delete D.opts.palette; soft(); } });
  palWrap.append(pal);
  const paintOpts = () => optBox.replaceChildren(optionsForm(m.options, D.opts, soft));
  paintOpts();
  const resetBtn = h("button", { class: "btn btn--sm btn--ghost", type: "button", text: "Về thông số gốc", onclick: () => { for (const k of Object.keys(D.opts)) delete D.opts[k]; seed.value = m.options.seed ?? ""; pal.repaint(); paintOpts(); rebuild(); } });

  const dl = (label, fn) => h("button", { class: "btn btn--sm", type: "button", text: label, onclick: async (ev) => { ev.target.disabled = true; try { await fn(); } catch (err) { toast("Không tải được: " + err.message); } ev.target.disabled = false; } });
  const f = (D.job && D.job.result && D.job.result.files) || {};
  const slug = e.id.split("/").pop();
  const downloads = h("div", { class: "vx-bar vx-dl" },
    dl("Sprite sheet PNG", async () => { const s = renderSheet(e, D.opts, player.flip); saveBlob(await new Promise((r) => s.canvas.toBlob(r, "image/png")), s.name + ".png"); }),
    dl("JSON (Aseprite)", async () => { const s = renderSheet(e, D.opts, player.flip); saveBlob(new Blob([JSON.stringify(s.json, null, 2)], { type: "application/json" }), s.name + ".json"); }),
    f.gif ? dl("GIF gốc", () => saveUrl(pubUrl(f.gif), slug + ".gif")) : null,
    f.src ? dl("File .js của effect", () => saveUrl(pubUrl(f.src), slug + ".js")) : null);

  const speed = segment([[0.25, "0,25×"], [0.5, "0,5×"], [1, "1×"], [1.5, "1,5×"], [2, "2×"]], () => player.speed, (v) => { player.speed = +v; });
  const bgSeg = segment(bgs.map((b) => [b, BG_LABEL[b]]), () => player.bg, (v) => player.setBg(v));
  const facts = !(D.job && D.job.result) ? null : h("p", { class: "vx-dim", text: (D.job.result.desc || "") });

  box.replaceChildren(h("div", { class: "vx-player" },
    h("div", { class: "vx-player__stage" }, stage,
      h("div", { class: "vx-bar" }, playBtn, h("button", { class: "btn btn--sm", type: "button", text: "↻ Chạy lại", onclick: rebuild }), speed)),
    h("div", { class: "vx-player__ctl" },
      facts,
      field("Nền", bgSeg),
      h("div", { class: "vx-field vx-field--row" }, h("label", { class: "vx-label", text: "Seed" }), seed,
        h("button", { class: "btn btn--sm", type: "button", text: "🎲 Ngẫu nhiên", onclick: () => { D.opts.seed = 1 + Math.floor(Math.random() * 9999); seed.value = D.opts.seed; rebuild(); } }),
        flipBtn, hasActor ? actorBtn : null),
      h("details", { class: "vx-more", open: true }, h("summary", { text: "Đổi màu" }), palWrap),
      h("details", { class: "vx-more", open: true }, h("summary", { text: "Thông số của effect" }), optBox, resetBtn),
      h("div", {}, h("span", { class: "vx-label", text: "Tải về, theo thông số đang chỉnh" }), downloads))));
  fit();
  requestAnimationFrame(fit);
  D.dlReady = true;
}
addEventListener("resize", () => { if (S.detail && S.detail.fit) S.detail.fit(); });

/* ---------- tab Thư viện ---------- */
function buildLib() {
  const pane = $("pane-lib");
  P.libBody = h("div", { class: "vx-libbody" }, h("p", { class: "vx-empty", text: "Đang nạp thư viện…" }));
  P.libSearch = h("input", { type: "search", class: "vx-search", placeholder: "Tìm effect: lửa, nổ, heal, thunder…", "aria-label": "Tìm effect", oninput: (e) => { S.libView.q = e.target.value; filterLib(); } });
  P.libCats = h("div", { class: "vx-chips vx-chips--scroll" });
  pane.replaceChildren(h("div", { class: "vx-bar" }, P.libSearch, h("span", { class: "vx-dim", id: "vx-libcount" })), P.libCats, P.libBody);
}
const tiles = [];
async function enterLib() {
  if (P.libReady) return;
  try {
    const lib = await guard(ensureLib());
    P.libReady = true;
    const FX = Object.entries(lib.effects).map(([id, mod]) => makeEntry(id, mod, lib));
    $("vx-libcount").textContent = FX.length + " effect";
    const io = new IntersectionObserver((es) => {
      for (const en of es) {
        const t = en.target._tile;
        t.visible = en.isIntersecting;
        if (t.visible && !t.player) {
          try { t.player = isScreen(t.e.meta) ? new Player(t.cv, t.e, { aspect: 16 / 9, pad: 1 }) : new Player(t.cv, t.e, { aspect: 6 / 5, pad: 1.25 }); } catch { t.player = null; }
        }
      }
    }, { rootMargin: "200px" });
    const mkChip = (id, label) => h("button", { class: "vx-chip", type: "button", "data-cat": id, "aria-pressed": String(id === S.libView.cat), text: label, onclick: () => { S.libView.cat = id; filterLib(); } });
    P.libCats.replaceChildren(mkChip("all", "Tất cả"), ...lib.categories.filter((c) => FX.some((f) => f.cat === c.id)).map((c) => mkChip(c.id, c.name)));
    P.libSecs = [];
    P.libBody.replaceChildren();
    for (const c of lib.categories) {
      const list = FX.filter((f) => f.cat === c.id);
      if (!list.length) continue;
      const grid = h("div", { class: "vx-tiles" });
      const sec = h("section", { class: "vx-lsec" }, h("h3", {}, c.name, h("small", { text: c.blurb })), grid);
      const items = list.map((e) => {
        const cv = h("canvas", { "aria-label": e.name });
        const fig = h("a", { class: "vx-tile" + (isScreen(e.meta) ? " vx-tile--wide" : ""), href: "#fx=" + e.id }, h("div", { class: "vx-tile__stage" }, cv),
          h("div", { class: "vx-tile__cap" }, h("b", { text: e.name }), h("small", { text: e.meta.loop ? "lặp" : +e.meta.duration.toFixed(2) + " s" })));
        const t = { e, cv, fig, player: null, visible: false };
        fig._tile = t;
        tiles.push(t);
        io.observe(fig);
        grid.append(fig);
        return t;
      });
      P.libSecs.push({ c, sec, items });
      P.libBody.append(sec);
    }
    P.libBody.append(h("p", { class: "vx-empty", id: "vx-libnone", hidden: true, text: "Không có effect nào khớp." }));
    filterLib();
  } catch { /* banner */ }
}
function filterLib() {
  if (!P.libSecs) return;
  const q = S.libView.q.trim().toLowerCase();
  let n = 0;
  P.libCats.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === S.libView.cat)));
  for (const s of P.libSecs) {
    let any = false;
    for (const t of s.items) {
      const m = t.e.meta, hit = (S.libView.cat === "all" || S.libView.cat === s.c.id) && (!q || [t.e.id, t.e.name, m.desc, ...(m.tags || [])].join(" ").toLowerCase().includes(q));
      t.fig.hidden = !hit;
      any ||= hit; n += hit;
    }
    s.sec.hidden = !any;
  }
  $("vx-libnone").hidden = n > 0;
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
  P.wList = h("div", { class: "vx-workers" });
  $("pane-workers").replaceChildren(
    h("p", { class: "vx-dim vx-wnote", text: "Số ưu tiên nhỏ nhận trước; máy khác nhường job trong N giây." }), P.wList);
}
function paintWorkers() {
  if (!S.workers.length) { P.wList.replaceChildren(h("p", { class: "vx-empty", text: S.workersLoaded ? "Chưa có máy gen nào báo danh." : "Đang tải…" })); return; }
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
    const st = online(w) ? w.status : "offline", [lab, kind] = WSTATUS[st] || [st, "off"];
    const num = (key, min, step) => admin
      ? h("input", { type: "number", min, step, value: w[key], "data-k": key, onchange: (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= min) upd(w, { [key]: v }); else e.target.value = w[key]; } })
      : h("span", { text: w[key] });
    const row = (label, el) => h("div", { class: "vx-wrow" }, h("span", { class: "vx-label", text: label }), el);
    return h("article", { class: "vx-worker" + (w.enabled ? "" : " is-off"), "data-id": w.id },
      h("div", { class: "vx-worker__head" }, h("b", { text: w.label || w.id }), pill(kind, lab), w.enabled ? null : pill("off", "Đã tắt")),
      h("code", { class: "vx-dim", text: w.id }),
      row("Việc đang làm", w.current_job ? h("a", { href: "#job=" + w.current_job, text: "mở job" }) : h("span", { class: "vx-dim", text: "không có" })),
      row("Đã xong", h("span", { text: w.jobs_done + " job" })),
      row("Thấy lần cuối", h("span", { text: ago(w.last_seen) })),
      row("Bật", admin ? h("input", { type: "checkbox", "aria-label": "Bật máy", checked: w.enabled, onchange: (e) => upd(w, { enabled: e.target.checked }) }) : h("span", { text: w.enabled ? "bật" : "tắt" })),
      row("Ưu tiên", num("priority", 0, 1)),
      row("Nhường (giây)", num("claim_delay_s", 0, 1)),
      row("Model", admin ? h("select", { "aria-label": "Model", onchange: (e) => upd(w, { model: e.target.value }) }, ["opus", "sonnet"].map((m) => h("option", { value: m, text: m, selected: w.model === m }))) : h("span", { text: w.model })),
      row("Tối đa (phút)", num("max_minutes", 1, 1)),
      w.note ? h("p", { class: "vx-dim", text: w.note }) : null);
  }));
  if (!admin) P.wList.append(h("p", { class: "vx-dim", text: "Chỉ admin mới sửa được cấu hình máy." }));
}

/* ---------- khung trang, định tuyến ---------- */
function render() {
  const D = S.detail;
  $("vx-tabs").querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === S.tab)));
  for (const [t] of TABS) $("pane-" + t).hidden = !!D || t !== S.tab;
  $("pane-detail").hidden = !D;
}
function route() {
  const hs = decodeURIComponent(location.hash.slice(1));
  let m;
  if ((m = hs.match(/^job=(.+)$/))) { S.tab = "jobs"; openDetail("job", m[1]); }
  else if ((m = hs.match(/^fx=(.+)$/))) { S.tab = "lib"; openDetail("fx", m[1]); }
  else {
    closeDetail();
    if (TABS.some(([t]) => t === hs)) S.tab = hs;
    if (S.tab === "jobs") refreshJobs();
    if (S.tab === "lib") enterLib();
    if (S.tab === "workers") refreshWorkers(true);
    if (S.tab === "new" && S.form.moreOpen) P.sync();
  }
  render();
}
function heartbeat() {
  const now = Date.now(), D = S.detail;
  tickElapsed();
  if (document.hidden) return;
  if (D && D.kind === "job" && D.job && active(D.job) && now - last.job >= 1500) refreshJob().catch(() => {});
  else if (!D && S.tab === "jobs" && S.jobs.some(active) && now - last.jobs >= 5000) refreshJobs();
  else if (!D && S.tab === "workers" && now - last.workers >= 8000) refreshWorkers();
}
let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const D = S.detail;
  if (D) { if (D.player && D.dlReady) D.player.tick(dt); }
  else if (S.tab === "lib") for (const t of tiles) if (t.visible && t.player && !t.fig.hidden) t.player.tick(dt);
  requestAnimationFrame(loop);
}

function boot() {
  const tabs = $("vx-tabs"), root = $("vx-root");
  tabs.replaceChildren(...TABS.map(([t, label]) => h("button", { type: "button", role: "tab", "data-tab": t, text: label, onclick: () => { if (location.hash === "#" + t) route(); else location.hash = "#" + t; } })));
  root.replaceChildren(...[...TABS.map(([t]) => t), "detail"].map((t) => h("section", { id: "pane-" + t, class: "vx-pane", hidden: true })));
  buildNew(); buildJobs(); buildLib(); buildWorkers();
  addEventListener("hashchange", route);
  setInterval(heartbeat, 500);
  requestAnimationFrame(loop);
  route();
  api("me").then((r) => { S.me = { isAdmin: !!r.isAdmin, ...r.user }; if (S.tab === "workers") paintWorkers(); }, (e) => banner(e));
  window.__vfx = S;
}
boot();
