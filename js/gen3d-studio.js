/*
 * Xưởng 3D (gen3d.html). Hợp đồng API, vòng đời job, dữ liệu: docs/gen3d-studio.md.
 * Bố cục: rail công cụ | panel trái theo công cụ | viewport three.js | panel phải Assets/Property.
 * ?mock=1 dùng API giả trong js/gen3d-mock.js.
 */
const MOCK = /[?&]mock=1\b/.test(location.search);
const CFG = window.SUPABASE_CONFIG || {};
const CFG_KEY = "gen3d.cfg.v1";
const UI_KEY = "gen3d.ui.v1";

const STAGES = {
  shape: [["setup", "Chuẩn bị"], ["segment", "Tách nền"], ["generate", "Dựng hình"], ["optimize", "Tối ưu lưới"], ["uploading", "Tải lên"]],
  texture: [["setup", "Chuẩn bị"], ["delight", "Khử sáng"], ["project", "Chiếu ảnh"], ["inpaint", "Vẽ bù"], ["bake", "Bake atlas"], ["uploading", "Tải lên"]],
  rig: [["setup", "Chuẩn bị"], ["skeleton", "Đặt xương"], ["skin", "Skin weights"], ["uploading", "Tải lên"]],
};
const STATUS = { queued: ["Đang chờ", "wait"], running: ["Đang làm", "run"], done: ["Xong", "ok"], failed: ["Lỗi", "bad"], canceled: ["Đã huỷ", "off"] };
const WSTATUS = { idle: ["Rảnh", "ok"], busy: ["Đang làm", "run"], paused: ["Tạm dừng", "wait"], lowmem: ["Thiếu RAM/VRAM", "bad"], offline: ["Offline", "off"] };
const KIND_LABEL = { shape: "Model", texture: "Texture", rig: "Xương" };
const VIEWS = [["front", "Trước"], ["left", "Trái"], ["right", "Phải"], ["back", "Sau"]];
const ACCEPT = /^image\/(png|jpeg|webp)$/;
const ULTRA_REQ = "Ultra cần ~12 GB RAM trống trên máy gen, có thể chờ lâu.";
const DEFAULT_CFG = { ultra: false, ai_complete: false, texture: true, quality: "2K", remove_lighting: true, pbr: false, topology: "triangle", polycount: 100000 };
const TIPS = {
  ultra: "Lưới marching cubes dày hơn và nhiều bước khử nhiễu hơn: mesh mịn, nhiều chi tiết hơn nhưng gen lâu hơn và tốn VRAM hơn. Máy gen cần ~12 GB RAM trống mới chạy, có thể chờ lâu; chờ 5 phút không đủ thì job báo lỗi.",
  ai_complete: "Vùng không ảnh nào nhìn thấy: tắt thì tô bằng màu lân cận, bật thì model diffusion vẽ bù. Chỉ có tác dụng khi gen texture.",
  texture: "Bật thì máy gen texture luôn ngay sau khi dựng hình, ra một phiên bản texture riêng. Tắt thì chỉ ra mesh trắng, gen texture sau cũng được.",
  quality: "Cạnh atlas texture: 2K = 2048, 4K = 4096, 8K = 8192 px. Càng lớn càng nét, file càng nặng.",
  remove_lighting: "Khử bóng và đổ sáng có sẵn trong ảnh trước khi chiếu màu lên mesh, để model không dính bóng của ảnh chụp. Tranh vẽ, anime, màu phẳng: nên tắt, bật thì da mặt bị bệch loang.",
  pbr: "Thêm map metallic-roughness và normal ngoài màu nền (albedo).",
  topology: "Triangle: giảm mesh còn số tam giác đã chọn. Quad: remesh thành mặt tứ giác (Instant Meshes), dễ chỉnh tay và rig hơn.",
  polycount: "Số mặt sau khi tối ưu: tam giác với Triangle, mặt tứ giác với Quad. Từ 500 tới 2.000.000.",
};
const ICON = {
  model: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M21 7l-9 5-9-5"/>',
  texture: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  rig: '<circle cx="12" cy="4" r="2"/><path d="M12 6v7M12 13l-4 8M12 13l4 8M5 9h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/>',
  reset: '<path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8"/><path d="M3 3v5h5"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h0"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-4"/>',
  retry: '<path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  down: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  up: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

/* ---------- tiện ích ---------- */
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style") e.style.cssText = v;
    else if (["value", "checked", "disabled", "hidden"].includes(k)) e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const $ = (id) => document.getElementById(id);
const fill = (el, ...kids) => { el.replaceChildren(...kids.flat(Infinity).filter((c) => c != null && c !== false)); return el; };
function toast(msg) {
  const t = h("div", { class: "dz-toast", text: msg });
  $("g3-toasts").append(t);
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
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString("vi-VN", { hour12: false }) : "—");
const ago = (iso) => (!iso ? "chưa từng" : Date.now() - Date.parse(iso) < 5000 ? "vừa xong" : fmtDur(Date.now() - Date.parse(iso)) + " trước");
const pill = (kind, label) => h("span", { class: "g3-pill g3-pill--" + kind, text: label });
const statusPill = (s) => pill((STATUS[s] || ["", "off"])[1], (STATUS[s] || [s])[0]);
const kindTag = (k) => h("span", { class: "g3-kind g3-kind--" + k, text: KIND_LABEL[k] || k });
const active = (j) => j && (j.status === "queued" || j.status === "running");
const fmtN = (n) => (n == null ? "—" : Number(n).toLocaleString("vi-VN"));
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === "object" ? { ...d, ...v } : { ...d }; } catch { return { ...d }; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* chế độ riêng tư */ } },
};

/* ---------- tooltip "?" ---------- */
let tipEl = null;
function help(key) {
  const b = h("button", { class: "g3-help", type: "button", "aria-label": TIPS[key], text: "?" });
  const show = () => {
    hideTip();
    tipEl = h("div", { class: "g3-tip", role: "tooltip", text: TIPS[key] });
    document.body.append(tipEl);
    const r = b.getBoundingClientRect(), w = tipEl.offsetWidth;
    tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    tipEl.style.top = (r.bottom + 6 + tipEl.offsetHeight > innerHeight ? r.top - tipEl.offsetHeight - 6 : r.bottom + 6) + "px";
  };
  for (const ev of ["mouseenter", "focus"]) b.addEventListener(ev, show);
  for (const ev of ["mouseleave", "blur"]) b.addEventListener(ev, hideTip);
  b.addEventListener("click", (e) => { e.preventDefault(); show(); });
  return b;
}
function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }

/* ---------- API ---------- */
class ApiError extends Error { constructor(kind, message) { super(message); this.kind = kind; } }
let mockMod = null, mockP = null;
const loadMock = () => (mockP ||= import("./gen3d-mock.js").then((m) => (mockMod = m)));
const base = () => String(CFG.url || "").replace(/\/+$/, "");
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
    res = await fetch(base() + "/functions/v1/gen3d-studio", {
      method: "POST",
      headers: { apikey: CFG.anonKey, Authorization: "Bearer " + (tok || CFG.anonKey), "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
  } catch { throw new ApiError("network", "Không nối được máy chủ, kiểm tra mạng rồi thử lại."); }
  let d = null;
  try { d = JSON.parse(await res.text()); } catch { d = null; }
  if (d && d.ok) return d;
  if (res.status === 404 && !(d && d.error && d.error.code)) throw new ApiError("closed", "Xưởng chưa mở: máy chủ chưa cài chức năng gen3d-studio.");
  if (res.status === 401) throw new ApiError("auth", "Bạn chưa đăng nhập hoặc phiên đã hết hạn. Đăng nhập lại rồi thử lại.");
  if (res.status === 403) throw new ApiError("auth", (d && d.error && d.error.message) || "Tài khoản chưa có quyền dùng Xưởng 3D.");
  throw new ApiError("api", (d && d.error && d.error.message) || "Máy chủ trả lỗi " + res.status + ".");
}
async function putFile(uploadUrl, blob, type) {
  if (uploadUrl.startsWith("mock://")) { (await loadMock()).storeBlob(uploadUrl.slice(11), blob); return; }
  let res;
  try { res = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": type }, body: blob }); } catch { throw new ApiError("network", "Không tải được ảnh lên, kiểm tra mạng."); }
  if (!res.ok) throw new ApiError("api", "Tải ảnh lên không được (lỗi " + res.status + ").");
}
function pubUrl(path) {
  if (!path) return "";
  if (/^(data:|blob:|https?:)/.test(path)) return path;
  if (MOCK) return (mockMod && mockMod.blobUrl(path)) || "";
  return base() + "/storage/v1/object/public/gen3d/" + path;
}

/* ---------- trạng thái ---------- */
const ui = store.get(UI_KEY, { tool: "model", rtab: "assets", filter: "all", mode: "multi" });
const S = {
  cfg: store.get(CFG_KEY, DEFAULT_CFG),
  me: { isAdmin: false },
  jobs: [], jobsLoaded: false,
  sel: null, job: null, chain: [], logN: -1,
  workers: [], workersLoaded: false,
  slots: {}, title: "", busy: false,
  banner: null,
};
const last = { jobs: 0, job: 0, workers: 0, chain: 0 };
const saveUi = () => store.set(UI_KEY, ui);
const saveCfg = () => store.set(CFG_KEY, S.cfg);
const textureParams = () => ({ quality: S.cfg.quality, ai_complete: S.cfg.ai_complete, remove_lighting: S.cfg.remove_lighting, pbr: S.cfg.pbr });

function banner(err) {
  const el = $("g3-banner");
  S.banner = err || null;
  fill(el);
  el.hidden = !err;
  if (!err) return;
  el.append(h("span", { text: err.message || String(err) }));
  if (err.kind === "auth") el.append(h("a", { class: "btn btn--sm", href: "login.html?next=gen3d.html", text: "Đăng nhập" }));
  else el.append(h("button", { class: "btn btn--sm", type: "button", text: "Thử lại", onclick: () => { banner(null); refreshJobs(); } }));
}
const guard = (p) => p.then((v) => { if (S.banner) banner(null); return v; }, (e) => { banner(e instanceof ApiError ? e : new ApiError("api", e.message)); throw e; });

/* ---------- control nhỏ ---------- */
function toggle(key, label, onChange) {
  const input = h("input", { type: "checkbox", class: "g3-toggle", checked: !!S.cfg[key], "aria-label": label, onchange: (e) => { S.cfg[key] = e.target.checked; saveCfg(); onChange && onChange(); syncCfgViews(); } });
  input.dataset.cfg = key;
  return h("div", { class: "g3-opt" }, h("span", { class: "g3-optl", text: label }), TIPS[key] ? help(key) : null, input);
}
function seg(items, get, set) {
  const root = h("div", { class: "g3-seg", role: "group" });
  const paint = () => root.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(get()))));
  for (const [v, label] of items) root.append(h("button", { type: "button", "data-v": v, text: label, onclick: () => { set(v); paint(); } }));
  root.repaint = paint;
  paint();
  return root;
}
const PMIN = 500, PMAX = 2000000;
const toSlider = (v) => Math.round((Math.log(v / PMIN) / Math.log(PMAX / PMIN)) * 1000);
function niceRound(v) { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1)); return Math.round(v / p) * p; }
const fromSlider = (s) => Math.min(PMAX, Math.max(PMIN, niceRound(PMIN * Math.pow(PMAX / PMIN, s / 1000))));
function polycount() {
  const range = h("input", { type: "range", min: 0, max: 1000, step: 1, value: toSlider(S.cfg.polycount), "aria-label": "Polycount" });
  const box = h("input", { type: "number", min: PMIN, max: PMAX, step: 1, value: S.cfg.polycount, "aria-label": "Polycount (số)" });
  range.addEventListener("input", () => { S.cfg.polycount = fromSlider(+range.value); box.value = S.cfg.polycount; saveCfg(); syncCfgViews(); });
  box.addEventListener("change", () => {
    const v = Math.round(+box.value);
    S.cfg.polycount = Number.isFinite(v) ? Math.min(PMAX, Math.max(PMIN, v)) : DEFAULT_CFG.polycount;
    box.value = S.cfg.polycount; range.value = toSlider(S.cfg.polycount); saveCfg(); syncCfgViews();
  });
  const root = h("div", { class: "g3-poly" }, h("div", { class: "g3-poly__s" }, range, h("div", {}, h("span", { text: "500" }), h("span", { text: "2000000" }))), box);
  root.repaint = () => { range.value = toSlider(S.cfg.polycount); box.value = S.cfg.polycount; };
  return root;
}
function textureOpts() {
  const q = seg([["2K", "2K"], ["4K", "4K"], ["8K", "8K"]], () => S.cfg.quality, (v) => { S.cfg.quality = v; saveCfg(); syncCfgViews(); });
  return h("div", { class: "g3-sub" },
    h("div", { class: "g3-opt" }, h("span", { class: "g3-optl", text: "Texture Quality" }), help("quality")), q,
    toggle("remove_lighting", "Remove Lighting"), toggle("pbr", "PBR"));
}
// Mọi bảng config (popup, panel Texture) cùng đọc S.cfg; đổi một chỗ thì vẽ lại chỗ khác.
function syncCfgViews() {
  document.querySelectorAll("input[data-cfg]").forEach((i) => { i.checked = !!S.cfg[i.dataset.cfg]; });
  document.querySelectorAll(".g3-seg, .g3-poly").forEach((s) => s.repaint && s.repaint());
  document.querySelectorAll("[data-texsub]").forEach((el) => { el.hidden = !S.cfg.texture; });
  if (P.chips) paintChips();
}

/* ---------- popup Geometry & Texture ---------- */
let cfgDialog = null;
function openConfig() {
  if (!cfgDialog) {
    const texSub = textureOpts();
    texSub.dataset.texsub = "1";
    cfgDialog = h("dialog", { class: "g3-cfg", "aria-label": "Geometry & Texture" },
      h("div", { class: "g3-cfg__head" },
        h("div", {}, h("b", { text: "Geometry & Texture" }), h("p", { text: "Cài đặt tự lưu cho lần sau" })),
        h("button", { class: "g3-cfg__x", type: "button", "aria-label": "Đóng", text: "×", onclick: () => cfgDialog.close() })),
      h("div", { class: "g3-cfg__grp" }, toggle("ultra", "Ultra Mesh Quality"), h("p", { class: "g3-dim g3-ultra-req", text: ULTRA_REQ }), toggle("ai_complete", "AI Complete")),
      h("div", { class: "g3-cfg__grp g3-cfg__grp--tex" }, toggle("texture", "Texture"), texSub),
      h("div", { class: "g3-cfg__grp" },
        h("div", { class: "g3-opt" }, h("span", { class: "g3-optl", text: "Topology" }), help("topology")),
        seg([["quad", "▢ Quad"], ["triangle", "△ Triangle"]], () => S.cfg.topology, (v) => { S.cfg.topology = v; saveCfg(); syncCfgViews(); }),
        h("div", { class: "g3-opt" }, h("span", { class: "g3-optl", text: "Polycount" }), help("polycount")),
        polycount()));
    cfgDialog.addEventListener("close", () => { hideTip(); paintCfgRow(); });
    cfgDialog.addEventListener("keydown", (e) => { if (e.key === "Escape") cfgDialog.close(); });
    document.addEventListener("pointerdown", (e) => { if (cfgDialog.open && !cfgDialog.contains(e.target) && !e.target.closest(".g3-row--cfg") && !e.target.closest(".g3-tip")) cfgDialog.close(); });
    document.body.append(cfgDialog);
  }
  if (cfgDialog.open) { cfgDialog.close(); return; }
  syncCfgViews();
  const r = $("g3-left").getBoundingClientRect();
  cfgDialog.style.left = (innerWidth < 700 ? 16 : r.right + 8) + "px";
  cfgDialog.style.bottom = Math.max(8, innerHeight - r.bottom) + "px";
  cfgDialog.show();
  cfgDialog.querySelector(".g3-cfg__x").focus();
  paintCfgRow();
}
function paintCfgRow() { document.querySelectorAll(".g3-row--cfg span:last-child").forEach((e) => { e.textContent = cfgDialog && cfgDialog.open ? "‹" : "›"; }); }

/* ---------- ảnh vào ---------- */
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const m = Math.max(bmp.width, bmp.height);
  if (m <= 2048) { bmp.close && bmp.close(); return file; }
  const k = 2048 / m, c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const blob = await new Promise((r) => c.toBlob(r, type, 0.92));
  return new File([blob], file.name.replace(/\.\w+$/, "") + (type === "image/png" ? ".png" : ".jpg"), { type });
}
async function putSlot(view, raw) {
  if (!raw) return;
  if (!ACCEPT.test(raw.type)) return toast("Chỉ nhận ảnh png, jpg, webp");
  if (raw.size > 15 * 1024 * 1024) return toast(raw.name + " nặng quá 15 MB");
  let f = raw;
  try { f = await shrink(raw); } catch { f = raw; }
  if (S.slots[view]) URL.revokeObjectURL(S.slots[view].url);
  S.slots[view] = { blob: f, type: f.type, name: f.name || view + ".png", url: URL.createObjectURL(f) };
  paintLeft();
}
const shownViews = () => (ui.mode === "one" ? [VIEWS[0]] : VIEWS);
function firstEmpty() { const v = shownViews().find(([k]) => !S.slots[k]); return v ? v[0] : shownViews()[0][0]; }
let hoverSlot = null;
document.addEventListener("paste", (e) => {
  if (ui.tool !== "model") return;
  const files = [...(e.clipboardData ? e.clipboardData.files : [])].filter((f) => ACCEPT.test(f.type));
  if (!files.length) return;
  e.preventDefault();
  let view = hoverSlot || firstEmpty();
  for (const f of files) { putSlot(view, f); view = firstEmpty(); }
});
function slot(view, label) {
  const s = S.slots[view];
  const input = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", hidden: true, onchange: () => { putSlot(view, input.files[0]); input.value = ""; } });
  const el = h("div", { class: "g3-slot", tabindex: 0, role: "button", "aria-label": "Ảnh " + label, "data-view": view },
    s ? h("img", { src: s.url, alt: label }) : h("div", {}, h("b", { text: label }), h("span", { text: ui.mode === "one" ? "Kéo thả, bấm chọn hoặc Ctrl+V. png, jpg, webp ≤ 15 MB" : "Kéo thả / dán" })),
    ui.mode === "multi" ? h("span", { class: "g3-slot__tag", text: label }) : null,
    s ? h("button", { class: "g3-slot__x", type: "button", "aria-label": "Bỏ ảnh " + label, text: "×", onclick: (e) => { e.stopPropagation(); URL.revokeObjectURL(s.url); delete S.slots[view]; paintLeft(); } }) : null,
    input);
  el.addEventListener("click", () => input.click());
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  el.addEventListener("mouseenter", () => { hoverSlot = view; });
  el.addEventListener("mouseleave", () => { hoverSlot = null; });
  for (const ev of ["dragenter", "dragover"]) el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.add("is-over"); });
  for (const ev of ["dragleave", "drop"]) el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.remove("is-over"); });
  el.addEventListener("drop", (e) => {
    const fs = [...e.dataTransfer.files];
    putSlot(view, fs[0]);
    for (const f of fs.slice(1)) { const v = firstEmpty(); if (v !== view) putSlot(v, f); }
  });
  return el;
}

/* ---------- panel trái ---------- */
const P = {};
const TOOLS = [["model", "Model", "model"], ["texture", "Texture", "texture"], ["rig", "Rig", "rig"]];
function buildRail() {
  const rail = $("g3-rail");
  const btn = ([id, label, icon]) => h("button", { class: "g3-rail__btn", type: "button", "data-tool": id, "aria-pressed": "false", html: svg(icon) + `<span>${label}</span>`, onclick: () => setTool(id) });
  fill(rail, TOOLS.map(btn), h("span", { class: "g3-spacer" }), btn(["workers", "Máy gen", "gear"]));
}
function setTool(t) {
  ui.tool = t; saveUi();
  if (t === "workers") { if (location.hash !== "#workers") history.replaceState(null, "", "#workers"); refreshWorkers(true); }
  else if (location.hash === "#workers") history.replaceState(null, "", S.sel ? "#job=" + S.sel : location.pathname + location.search);
  paintRail(); paintLeft(); paintView();
}
function paintRail() { $("g3-rail").querySelectorAll("[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === ui.tool))); }

function paintChips() {
  const c = S.cfg;
  fill(P.chips, [c.ultra ? "Ultra" : null, c.topology === "quad" ? "Quad" : "Triangle", fmtN(c.polycount) + " mặt", c.texture ? "Texture " + c.quality : "Không texture",
    c.texture && c.pbr ? "PBR" : null, c.ai_complete ? "AI Complete" : null].filter(Boolean).map((t) => h("span", { class: "g3-chip", text: t })));
}
// Model tự tải lên (import_model) không có ảnh chụp: máy gen texture chiếu màu từ ảnh nên không làm được.
const isUpload = (j) => !!(j && j.params && j.params.source === "upload");
const NO_PHOTO_TEX = "Model tự tải lên không có ảnh chụp nào. Gen texture chiếu màu từ ảnh trước, sau, trái, phải, nên chỉ chạy trên model dựng từ ảnh.";
// Model gốc cho Gen texture / Gen xương từ job đang chọn.
function baseFor(kind) {
  const j = S.job;
  if (!j) return null;
  const byId = (id) => S.chain.find((x) => x.id === id) || S.jobs.find((x) => x.id === id);
  if (kind === "texture") {
    if (j.kind === "shape") return j.status === "done" ? j : null;
    const p = byId(j.parent_id);
    return j.kind === "texture" && p && p.status === "done" ? p : null;
  }
  if (j.kind !== "rig") return j.status === "done" ? j : null;
  const p = byId(j.parent_id);
  return p && p.status === "done" ? p : null;
}
function pickCard(job, empty) {
  if (!job) return h("div", { class: "g3-emptytool" }, h("div", { class: "g3-emptytool__art", html: svg(empty.icon) }),
    h("p", {}, h("b", { text: "Chọn" }), " một model trong Assets bên phải hoặc ", h("b", { text: "tải model của bạn" }), " lên để " + empty.what + "."),
    h("button", { class: "g3-upbtn", type: "button", html: svg("up") + "<span>Upload 3D Model</span>", onclick: pickModelFile }),
    h("p", { class: "g3-dim", text: "GLB, OBJ, FBX, STL · ≤ 50 MB" }));
  const th = job.result && job.result.files && job.result.files.thumb;
  return h("div", { class: "g3-pick" }, th ? h("img", { src: pubUrl(th), alt: "" }) : h("div", { class: "g3-asset__ph", style: "width:56px;height:56px", text: "◇" }),
    h("div", {}, h("b", { text: job.title || "Model" }), kindTag(job.kind), " ", h("span", { class: "g3-dim", text: job.result && job.result.stats && job.result.stats.tris ? fmtN(job.result.stats.tris) + " tam giác" : "" })));
}
function paintLeft() {
  const L = $("g3-left");
  hideTip();
  if (ui.tool === "model") {
    const nSel = Object.keys(S.slots).filter((k) => shownViews().some(([v]) => v === k)).length;
    const title = h("input", { class: "g3-input", type: "text", maxlength: 120, placeholder: "Tên model (không bắt buộc)", value: S.title, "aria-label": "Tên model", oninput: (e) => { S.title = e.target.value; } });
    P.chips = h("div", { class: "g3-chips" });
    paintChips();
    const go = h("button", { type: "button", disabled: S.busy || !nSel, onclick: submitShape, text: S.busy ? "Đang gửi…" : "Generate" });
    fill(L,
      h("h2", { html: svg("model") + "Tạo model" }),
      h("div", { class: "g3-up" },
        h("div", { class: "g3-tabs2", role: "group" },
          [["one", "Một ảnh"], ["multi", "Nhiều góc"]].map(([m, label]) => h("button", { type: "button", "aria-pressed": String(ui.mode === m), text: label, onclick: () => { ui.mode = m; saveUi(); paintLeft(); } }))),
        h("div", { class: "g3-slots" + (ui.mode === "one" ? " g3-slots--one" : " g3-slots--multi") }, shownViews().map(([v, label]) => slot(v, label))),
        h("p", { class: "g3-dim", style: "margin:8px 2px 0", text: ui.mode === "one" ? "Ảnh chụp thẳng mặt trước, nền gọn. Thêm góc khác ở tab Nhiều góc để texture đúng màu hơn." : "Ít nhất 1 ảnh. Ảnh trước dùng dựng hình; sau, trái, phải dùng chiếu màu khi gen texture." }),
        h("p", { class: "g3-note", text: "Nhân vật định gắn xương: đứng A-pose (tay dang chéo xuống, không áp sát thân), hai chân tách hẳn nhau. Chân dính hay tay dính thân thì mesh liền một mảng, chạy anim bị kéo giãn." }),
        nSel === 1 ? h("p", { class: "g3-note g3-note--warn", text: "Chỉ 1 ảnh: lưng và hai bên hông là máy đoán (hình lẫn màu). Muốn đúng thì thêm ảnh sau, trái, phải ở tab Nhiều góc." }) : null),
      h("div", { class: "g3-sec", text: "Tên" }), title,
      h("div", { class: "g3-sec", text: "General Settings" }),
      h("button", { class: "g3-row g3-row--cfg", type: "button", "aria-haspopup": "dialog", onclick: openConfig }, h("span", { text: "Geometry & Texture" }), h("span", { text: cfgDialog && cfgDialog.open ? "‹" : "›" })),
      P.chips,
      h("div", { class: "g3-go" }, go, h("p", { class: "g3-dim", text: "Máy PC nhận trước; vài phút một model. Đóng trang thì job vẫn chạy." })));
    return;
  }
  if (ui.tool === "texture") {
    const b = baseFor("texture");
    fill(L,
      h("h2", { html: svg("texture") + "Gen texture" }),
      b ? h("div", { class: "g3-sec", text: "Model đang chọn" }) : null,
      pickCard(b, { icon: "texture", what: "gen texture" }),
      b ? [h("div", { class: "g3-sec", text: "Texture" }),
        h("div", { class: "g3-cfg__grp g3-cfg__grp--tex", style: "border-radius:10px" }, textureOpts()),
        h("div", { class: "g3-cfg__grp", style: "padding:0" }, toggle("ai_complete", "AI Complete")),
        isUpload(b) ? h("p", { class: "g3-note g3-note--warn", text: NO_PHOTO_TEX }) : h("p", { class: "g3-note", text: "Mỗi lần gen là một phiên bản texture mới cạnh bản cũ. Màu chiếu từ ảnh trước, sau, trái, phải đã gửi lúc tạo model." }),
        h("div", { class: "g3-go" }, h("button", { type: "button", disabled: isUpload(b), onclick: () => submitChild("texture"), text: "Gen texture" }))] : null);
    return;
  }
  if (ui.tool === "rig") {
    const b = baseFor("rig");
    const rigs = S.chain.filter((j) => j.kind === "rig" && j.status === "done");
    fill(L,
      h("h2", { html: svg("rig") + "Gen xương" }),
      b ? h("div", { class: "g3-sec", text: "Model đang chọn" }) : null,
      pickCard(b, { icon: "rig", what: "gen xương" }),
      b && h("p", { class: "g3-note", text: "Xương humanoid tên mixamorig:* đứng T-pose, nên mọi anim Mixamo chạy thẳng lên model không cần map. Hợp với nhân vật hai chân hai tay." }),
      rigs.length ? h("div", { class: "g3-sec", text: "Đã có xương" }) : null,
      rigs.map((r) => h("div", { class: "g3-btns" }, h("a", { class: "g3-btn", href: "#job=" + r.id, text: "Bản xương " + clock(r.finished_at) }), h("a", { class: "g3-btn", href: animUrl(r.id), text: "▶ Thử anim" }))),
      b ? h("div", { class: "g3-go" }, h("button", { type: "button", onclick: () => submitChild("rig"), text: "Gen xương" })) : null);
    return;
  }
  fill(L, h("h2", { html: svg("gear") + "Máy gen" }),
    h("p", { class: "g3-note", text: "Số ưu tiên nhỏ nhận job trước. Máy ưu tiên lớn nhường job trong N giây khi còn máy ưu tiên nhỏ hơn đang rảnh và làm được loại job đó." }),
    h("p", { class: "g3-note", text: "Thiếu RAM/VRAM: máy tự đo trước mỗi lần nhận (PC cần commit trống ≥ 8 GB, VRAM trống ≥ 4 GB). Thiếu thì không nhận, job rơi sang máy sau." }),
    S.me.isAdmin ? null : h("p", { class: "g3-note", text: "Chỉ admin sửa được cấu hình máy." }));
}
const animUrl = (id) => "gen3d-anim.html?job=" + encodeURIComponent(id) + (MOCK ? "&mock=1" : "");

/* ---------- gửi job ---------- */
async function submitShape() {
  const views = shownViews().map(([v]) => v).filter((v) => S.slots[v]);
  if (!views.length || S.busy) return;
  S.busy = true; paintLeft();
  try {
    const up = await guard(api("upload_urls", { files: views.map((v) => ({ name: v + "-" + S.slots[v].name, type: S.slots[v].type, size: S.slots[v].blob.size })) }));
    await guard(Promise.all(up.files.map((u, i) => putFile(u.uploadUrl, S.slots[views[i]].blob, S.slots[views[i]].type))));
    const c = S.cfg;
    const r = await guard(api("submit", {
      kind: "shape", title: S.title.trim() || (S.slots.front || S.slots[views[0]]).name.replace(/\.\w+$/, ""),
      params: { views: Object.fromEntries(views.map((v, i) => [v, up.files[i].path])), ultra: c.ultra, topology: c.topology, polycount: c.polycount,
        seed: Math.floor(Math.random() * 2 ** 31), texture: c.texture ? textureParams() : null },
    }));
    toast("Đã gửi, máy gen sẽ nhận khi rảnh");
    for (const v of Object.keys(S.slots)) URL.revokeObjectURL(S.slots[v].url);
    S.slots = {}; S.title = "";
    afterSubmit(r.job);
  } catch { /* banner */ }
  S.busy = false; paintLeft();
}
async function submitChild(kind, parent) {
  const b = parent || baseFor(kind);
  if (!b) return toast(kind === "texture" ? "Chọn một model đã xong trước" : "Chọn model đã xong trước");
  if (kind === "texture" && isUpload(b)) return toast(NO_PHOTO_TEX);
  try {
    const r = await guard(api("submit", { kind, parent_id: b.id, params: kind === "texture" ? textureParams() : { skeleton: "mixamo" } }));
    toast(kind === "texture" ? "Đã gửi gen texture" : "Đã gửi gen xương");
    afterSubmit(r.job);
  } catch { /* banner */ }
}
async function resubmit() {
  const j = S.job;
  if (!j) return;
  try {
    const r = j.kind === "shape"
      ? await guard(api("submit", { kind: "shape", title: j.title, params: { ...j.params, seed: Math.floor(Math.random() * 2 ** 31) } }))
      : await guard(api("submit", { kind: j.kind, parent_id: j.parent_id, title: j.title, params: j.params }));
    toast("Đã gửi lại với seed mới");
    afterSubmit(r.job);
  } catch { /* banner */ }
}
function afterSubmit(job) {
  S.jobs.unshift(job);
  ui.rtab = "property"; saveUi();
  location.hash = "#job=" + job.id;
}

/* ---------- tải model của mình lên ---------- */
let modelInput = null;
function pickModelFile() {
  modelInput ||= h("input", { type: "file", id: "g3-model-file", accept: ".glb,.obj,.fbx,.stl", hidden: true, onchange: () => { const f = modelInput.files[0]; modelInput.value = ""; if (f) importModel(f); } });
  if (!modelInput.isConnected) document.body.append(modelInput);
  modelInput.click();
}
// OBJ/FBX/STL đổi sang glb ngay trong trình duyệt (loader three.js + GLTFExporter), máy gen chỉ phải đọc glb.
async function toGlb(file) {
  const ext = ((file.name.match(/\.(\w+)$/) || [])[1] || "").toLowerCase();
  if (ext === "glb") return file;
  const T = await import("three");
  const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
  const buf = await file.arrayBuffer();
  let obj;
  if (ext === "obj") { const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js"); obj = new OBJLoader().parse(new TextDecoder().decode(buf)); }
  else if (ext === "fbx") { const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js"); obj = new FBXLoader().parse(buf, ""); }
  else if (ext === "stl") { const { STLLoader } = await import("three/addons/loaders/STLLoader.js"); obj = new T.Mesh(new STLLoader().parse(buf), new T.MeshStandardMaterial({ color: 0xcccccc })); }
  else throw new Error("không nhận định dạng ." + ext);
  const out = await new GLTFExporter().parseAsync(obj, { binary: true, animations: obj.animations || [] });
  return new File([out], file.name.replace(/\.\w+$/, "") + ".glb", { type: "model/gltf-binary" });
}
async function importModel(file) {
  if (file.size > 150 * 1024 * 1024) return toast("File nặng quá 150 MB");
  S.importing = true; paintRight();
  try {
    const glb = await toGlb(file);
    if (glb.size > 50 * 1024 * 1024) throw new ApiError("api", "glb sau khi đổi nặng hơn 50 MB");
    const up = await guard(api("upload_urls", { files: [{ name: glb.name, type: "model/gltf-binary", size: glb.size }] }));
    await guard(putFile(up.files[0].uploadUrl, glb, "model/gltf-binary"));
    const r = await guard(api("import_model", { title: file.name.replace(/\.\w+$/, ""), file_name: file.name, glb: up.files[0].path, stats: { bytes: glb.size } }));
    toast("Đã tải model lên");
    S.jobs.unshift(r.job);
    location.hash = "#job=" + r.job.id;
  } catch (e) { if (!(e instanceof ApiError)) toast("Không đọc được model: " + e.message); }
  S.importing = false; paintRight();
}

/* ---------- danh sách job ---------- */
async function refreshJobs() {
  last.jobs = Date.now();
  try {
    const r = await guard(api("list", { mine: ui.filter === "mine", limit: 80 }));
    S.jobs = r.jobs; S.jobsLoaded = true;
    paintRight();
  } catch { /* banner */ }
}
async function select(id) {
  if (S.sel !== id) { S.sel = id; S.job = S.jobs.find((j) => j.id === id) || null; S.chain = []; S.logN = -1; viewer.clear(); }
  paintView(); paintRight();
  await refreshJob(true);
}
async function refreshJob(withChain) {
  if (!S.sel) return;
  const id = S.sel;
  last.job = Date.now();
  try {
    const r = await guard(api("get", { id }));
    if (S.sel !== id) return;
    const was = S.job && S.job.status;
    S.job = r.job;
    const i = S.jobs.findIndex((j) => j.id === id);
    if (i >= 0) S.jobs[i] = { ...r.job, log: undefined };
    if (withChain || was !== r.job.status) {
      const c = await guard(api("chain", { id }));
      if (S.sel !== id) return;
      S.chain = c.jobs;
    }
    if (r.job.status === "done") viewer.show(r.job);
    if (ui.tool !== "model") paintLeft();
    paintView(); paintRight();
  } catch { /* banner */ }
}

// Bản đang chọn đã xong nhưng còn phiên bản con đang chạy (vd. texture tự ra sau shape): cập nhật cây phiên bản.
async function refreshChain() {
  const id = S.sel;
  last.chain = Date.now();
  try {
    const c = await guard(api("chain", { id }));
    if (S.sel !== id) return;
    S.chain = c.jobs;
    for (const x of c.jobs) { const i = S.jobs.findIndex((j) => j.id === x.id); if (i >= 0) S.jobs[i] = x; else if (!S.jobs.length || ui.filter === "all") S.jobs.unshift(x); }
    paintRight(); paintBar();
    if (ui.tool !== "model") paintLeft();
  } catch { /* banner */ }
}

/* ---------- viewer ---------- */
const viewer = (() => {
  let T = null, addons = null, renderer, scene, camera, controls, root = null, grid, lights = [], lightMode = 0, loadedFor = null;
  let mode = "lit", texOn = true, rafOn = false, loadToken = 0;
  const camStack = [];
  let checkerTex = null;
  const origMats = new Map();
  const V = { stats: null, el: null };

  async function ensure() {
    if (T) return;
    T = await import("three");
    const [{ OrbitControls }, { GLTFLoader }, { OBJExporter }] = await Promise.all([
      import("three/addons/controls/OrbitControls.js"), import("three/addons/loaders/GLTFLoader.js"), import("three/addons/exporters/OBJExporter.js")]);
    addons = { OrbitControls, GLTFLoader, OBJExporter };
    const cv = V.canvas;
    renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(40, 1, 0.01, 1000);
    camera.position.set(1.6, 1.2, 2.4);
    controls = new addons.OrbitControls(camera, cv);
    controls.enableDamping = true;
    controls.addEventListener("start", () => { camStack.push([camera.position.clone(), controls.target.clone()]); if (camStack.length > 30) camStack.shift(); paintBar(); });
    grid = new T.GridHelper(4, 20, 0x666670, 0x3a3b42);
    grid.material.transparent = true; grid.material.opacity = 0.5;
    scene.add(grid);
    setLights(0);
    new ResizeObserver(resize).observe(V.el);
    resize();
    if (!rafOn) { rafOn = true; requestAnimationFrame(tick); }
  }
  function setLights(m) {
    lightMode = m;
    lights.forEach((l) => scene.remove(l));
    const hemi = new T.HemisphereLight(0xffffff, 0x444450, m === 1 ? 2.2 : 1.1);
    const key = new T.DirectionalLight(0xffffff, m === 1 ? 0.6 : m === 2 ? 3.2 : 2.2); key.position.set(3, 5, 4);
    const rim = new T.DirectionalLight(0xaabbff, m === 2 ? 0 : 1.0); rim.position.set(-4, 2, -3);
    lights = [hemi, key, rim];
    lights.forEach((l) => scene.add(l));
  }
  function resize() {
    if (!renderer) return;
    const w = V.el.clientWidth, hh = V.el.clientHeight;
    renderer.setSize(w, hh, false);
    camera.aspect = w / Math.max(1, hh);
    camera.updateProjectionMatrix();
  }
  function tick() {
    requestAnimationFrame(tick);
    if (!renderer || document.hidden) return;
    controls.update();
    renderer.render(scene, camera);
    drawGizmo();
  }
  function drawGizmo() {
    const c = V.gizmo;
    if (!c) return;
    const g = c.getContext("2d"), s = c.width / 2;
    g.clearRect(0, 0, c.width, c.height);
    const axes = [[new T.Vector3(1, 0, 0), "#ff4d5e", "X"], [new T.Vector3(0, 1, 0), "#7ddc3a", "Y"], [new T.Vector3(0, 0, 1), "#3f8cff", "Z"]]
      .map(([v, col, n]) => [v.applyQuaternion(camera.quaternion.clone().invert()), col, n]).sort((a, b) => a[0].z - b[0].z);
    for (const [v, col, n] of axes) {
      const x = s + v.x * s * 0.7, y = s - v.y * s * 0.7;
      g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(s, s); g.lineTo(x, y); g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill();
      g.fillStyle = "#111"; g.font = "bold 10px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(n, x, y + 0.5);
    }
  }
  function frame(obj) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
    const box = new T.Box3().setFromObject(obj, true);
    const size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
    const r = Math.max(size.x, size.y, size.z) || 1;
    controls.target.copy(center);
    camera.position.copy(center).add(new T.Vector3(0.7, 0.45, 1).normalize().multiplyScalar(r * 1.9));
    camera.near = r / 100; camera.far = r * 100; camera.updateProjectionMatrix();
    grid.scale.setScalar(r / 2); grid.position.y = box.min.y;
    controls.update();
  }
  function checker() {
    if (checkerTex) return checkerTex;
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const g = c.getContext("2d");
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? "#e8e8ee" : "#3b3f9a"; g.fillRect(x * 32, y * 32, 32, 32); }
    g.fillStyle = "#ff5a3c"; g.font = "bold 18px sans-serif";
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) g.fillText(String.fromCharCode(65 + x) + (y + 1), x * 64 + 8, y * 64 + 24);
    checkerTex = new T.CanvasTexture(c); checkerTex.colorSpace = T.SRGBColorSpace; checkerTex.wrapS = checkerTex.wrapT = T.RepeatWrapping;
    return checkerTex;
  }
  function hasTexture() { let t = false; origMats.forEach((m) => { (Array.isArray(m) ? m : [m]).forEach((x) => { if (x.map) t = true; }); }); return t; }
  function applyMode() {
    if (!root) return;
    root.traverse((o) => {
      if (!o.isMesh) return;
      const orig = origMats.get(o);
      const one = (m) => {
        if (mode === "clay") return new T.MeshStandardMaterial({ color: 0xbfc0c6, roughness: 0.85 });
        if (mode === "normal") return new T.MeshNormalMaterial();
        if (mode === "wire") return new T.MeshBasicMaterial({ color: 0x9ec5ff, wireframe: true });
        if (mode === "uv") return new T.MeshStandardMaterial({ map: checker(), roughness: 0.8 });
        if (!texOn && m.map) { const c = m.clone(); c.map = null; return c; }
        return m;
      };
      o.material = Array.isArray(orig) ? orig.map(one) : one(orig);
    });
  }
  function stats() {
    let tris = 0, verts = 0;
    root && root.traverse((o) => { if (o.isMesh) { const g = o.geometry; verts += g.attributes.position.count; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    return { tris: Math.round(tris), verts };
  }
  return {
    mount(el) {
      V.el = el;
      V.canvas = h("canvas", { class: "g3-cv", "aria-label": "Khung xem model 3D" });
      V.gizmo = h("canvas", { class: "g3-gizmo", width: 140, height: 140 });
      return [V.canvas, V.gizmo];
    },
    get loadedFor() { return loadedFor; },
    get mode() { return mode; },
    get texOn() { return texOn; },
    get canUndo() { return camStack.length > 0; },
    get loaded() { return !!root; },
    hasTexture: () => !!root && hasTexture(),
    stats: () => (root ? stats() : null),
    async show(job) {
      const glb = job.result && job.result.files && job.result.files.glb;
      if (!glb || loadedFor === job.id + glb) return;
      loadedFor = job.id + glb;
      const token = ++loadToken;
      V.status = "Đang nạp model…"; paintView();
      try {
        await ensure();
        const gltf = await new addons.GLTFLoader().loadAsync(pubUrl(glb));
        if (token !== loadToken) return;
        if (root) scene.remove(root);
        root = gltf.scene; origMats.clear();
        root.traverse((o) => { if (o.isMesh) { origMats.set(o, o.material); o.frustumCulled = false; } });
        scene.add(root);
        frame(root);
        camStack.length = 0;
        applyMode();
        V.status = null;
      } catch (e) {
        if (token === loadToken) { V.status = "Không nạp được glb: " + e.message; loadedFor = null; }
      }
      paintView();
    },
    clear() { loadToken++; loadedFor = null; V.status = null; if (root && scene) { scene.remove(root); root = null; origMats.clear(); } },
    get status() { return V.status; },
    setMode(m) { mode = m; applyMode(); paintBar(); },
    toggleTex() { texOn = !texOn; applyMode(); paintBar(); },
    cycleLight() { if (scene) { setLights((lightMode + 1) % 3); toast(["Đèn studio", "Đèn đều (xem màu)", "Đèn gắt một phía"][lightMode]); } },
    reset() { if (root) { camStack.push([camera.position.clone(), controls.target.clone()]); frame(root); paintBar(); } },
    undo() { const s = camStack.pop(); if (s) { camera.position.copy(s[0]); controls.target.copy(s[1]); controls.update(); } paintBar(); },
    shot(name) { if (!renderer) return; renderer.render(scene, camera); V.canvas.toBlob((b) => saveBlob(b, name + ".png")); },
    obj(name) { if (root) saveBlob(new Blob([new addons.OBJExporter().parse(root)], { type: "text/plain" }), name + ".obj"); },
  };
})();
function saveBlob(blob, filename) {
  const a = h("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function saveUrl(url, filename) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("lỗi " + r.status);
  saveBlob(await r.blob(), filename);
}
const fileBase = (j) => ((j.title || "model").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "model") + "-" + j.kind;

/* ---------- viewport ---------- */
function buildView() {
  const V = $("g3-view");
  const [cv, gizmo] = viewer.mount(V);
  P.stats = h("div", { class: "g3-stats", "aria-live": "polite" });
  P.overlay = h("div");
  P.bar = h("div", { class: "g3-bar" });
  P.helpPane = h("div", { class: "g3-help-pane", hidden: true },
    h("b", { text: "Điều khiển" }),
    h("ul", {}, ["Kéo chuột trái: xoay", "Kéo chuột phải / Shift+kéo: dời", "Lăn chuột: phóng to thu nhỏ", "Nút ↶ dưới đáy: về góc nhìn trước", "Đổi chế độ xem: lit, clay, normal, lưới, UV checker"].map((t) => h("li", { text: t }))));
  const ib = (icon, label, fn) => h("button", { class: "g3-ib", type: "button", title: label, "aria-label": label, html: svg(icon), onclick: fn });
  P.vbtns = h("div", { class: "g3-vbtns" },
    ib("sun", "Đổi đèn", () => viewer.cycleLight()),
    ib("camera", "Chụp màn hình", () => S.job && viewer.shot(fileBase(S.job))),
    ib("reset", "Về góc nhìn ban đầu", () => viewer.reset()),
    ib("help", "Hướng dẫn", () => { P.helpPane.hidden = !P.helpPane.hidden; }));
  P.workers = h("div", { class: "g3-workers", hidden: true });
  fill(V, cv, gizmo, P.stats, P.vbtns, P.helpPane, P.overlay, P.bar, P.workers);
}
function stepper(j) {
  const st = STAGES[j.kind] || [];
  const idx = st.findIndex((s) => s[0] === j.stage);
  return h("ol", { class: "g3-steps" }, st.map(([k, label], i) => {
    const s = j.status === "done" || i < idx ? "done" : i === idx ? (j.status === "running" ? "now" : j.status === "failed" ? "bad" : "done") : "todo";
    return h("li", { class: "g3-step g3-step--" + s }, h("i", { text: s === "done" ? "✓" : i + 1 }), h("span", { text: label }));
  }));
}
function paintView() {
  if (!P.overlay) return;
  P.workers.hidden = ui.tool !== "workers";
  if (ui.tool === "workers") { paintWorkers(); return; }
  const j = S.job;
  const st = viewer.stats();
  const root = j && (S.chain.find((x) => x.kind === "shape") || (j.kind === "shape" ? j : null));
  const topo = (root && root.params && root.params.topology) || (j && j.params && j.params.topology);
  fill(P.stats, st ? [h("span", { text: "Topology" }), h("b", { text: topo === "quad" ? "Quad" : "Triangle" }),
    h("span", { text: "Faces" }), h("b", { text: fmtN(st.tris) }), h("span", { text: "Vertices" }), h("b", { text: fmtN(st.verts) })] : []);
  if (!j) {
    fill(P.overlay, h("div", { class: "g3-empty" }, h("b", { text: S.sel ? "Đang tải…" : "Chưa chọn model" }),
      h("span", { text: S.sel ? "" : "Gửi ảnh ở cột trái để dựng model mới, hoặc bấm một model trong Assets bên phải." })));
  } else if (j.status !== "done") {
    const prev = j.preview ? pubUrl(j.preview) : "";
    fill(P.overlay, h("div", { class: "g3-prog" },
      h("h3", {}, kindTag(j.kind), h("span", { text: j.title || "Model" }), statusPill(j.status)),
      h("div", { class: "g3-dim", text: j.status === "queued" ? (j.queue_ahead > 0 ? "Xếp hàng: còn " + j.queue_ahead + " việc trước bạn · " : j.queue_ahead === 0 ? "Tới lượt, chờ máy gen nhận · " : "Đang chờ máy gen rảnh · ") + fmtDur(Date.now() - Date.parse(j.created_at)) : j.worker ? "Máy " + j.worker + " · " + fmtDur(Date.now() - Date.parse(j.claimed_at || j.created_at)) : "" }),
      stepper(j),
      prev ? h("img", { src: prev, alt: "Ảnh xem trước" }) : null,
      j.error ? h("div", { class: "g3-err", text: j.error }) : null,
      (j.log || []).length ? h("div", { class: "g3-dim", text: "↳ " + j.log[j.log.length - 1].msg }) : null,
      h("div", { class: "g3-btns" },
        active(j) ? h("button", { class: "g3-btn g3-btn--danger", type: "button", text: "Huỷ", onclick: () => jobAction("cancel") }) : null,
        j.status === "failed" || j.status === "canceled" ? h("button", { class: "g3-btn", type: "button", text: "Chạy lại", onclick: () => jobAction("retry") }) : null)));
  } else {
    fill(P.overlay, viewer.status ? h("div", { class: "g3-empty" }, h("b", { text: viewer.status })) : null);
  }
  paintBar();
}
const MODES = [["lit", "Có đèn, vật liệu gốc", "radial-gradient(circle at 35% 35%, #fff, #8a8a92)"], ["clay", "Đất sét (chỉ hình khối)", "radial-gradient(circle at 35% 35%, #ddd, #555)"],
  ["normal", "Normal", "conic-gradient(#ff7ad9, #7a8cff, #6ef0ff, #a5ff7a, #ff7ad9)"], ["wire", "Lưới (wireframe)", "repeating-linear-gradient(45deg, #9ec5ff 0 2px, #222 2px 6px)"],
  ["uv", "UV checker", "conic-gradient(#3b3f9a 0 25%, #e8e8ee 0 50%, #3b3f9a 0 75%, #e8e8ee 0)"]];
function paintBar() {
  if (!P.bar) return;
  const j = S.job, done = j && j.status === "done" && viewer.loaded;
  const tb = (icon, label, fn, opts = {}) => h("button", { class: "g3-tb" + (opts.primary ? " g3-tb--primary" : ""), type: "button", disabled: !!opts.disabled, title: opts.title || label, onclick: fn, html: (icon ? svg(icon) : "") + `<span>${label}</span>` });
  const texBase = baseFor("texture"), rigBase = baseFor("rig");
  const quad = j && ((S.chain.find((x) => x.kind === "shape") || j).params || {}).topology === "quad";
  fill(P.bar,
    h("div", { class: "g3-bar__row", role: "group", "aria-label": "Chế độ xem" },
      MODES.map(([m, label, bg]) => h("button", { class: "g3-mode", type: "button", title: label, "aria-label": label, "aria-pressed": String(viewer.mode === m), disabled: !done, style: "background:" + bg, onclick: () => viewer.setMode(m) })),
      done && viewer.hasTexture() ? [h("span", { class: "g3-sep" }), tb(null, viewer.texOn ? "Texture: bật" : "Texture: tắt", () => viewer.toggleTex(), { title: "Bật/tắt texture (chế độ có đèn)" })] : null),
    h("div", { class: "g3-bar__row" },
      h("button", { class: "g3-ib", type: "button", title: "Về góc nhìn trước", "aria-label": "Về góc nhìn trước", disabled: !viewer.canUndo, html: svg("undo"), onclick: () => viewer.undo() }),
      h("span", { class: "g3-sep" }),
      tb("retry", "Gen lại", resubmit, { disabled: !j || active(j), title: "Gửi lại cùng thông số với seed mới" }),
      tb("texture", "Gen texture", () => submitChild("texture"), { disabled: !texBase || isUpload(texBase), title: isUpload(texBase) ? NO_PHOTO_TEX : "Gen texture với cài đặt Texture hiện tại" }),
      tb("rig", "Gen xương", () => submitChild("rig"), { disabled: !rigBase }),
      j && j.kind === "rig" && j.status === "done" ? h("a", { class: "g3-tb g3-tb--link", href: animUrl(j.id), html: svg("play") + "<span>Thử anim</span>" }) : null,
      h("span", { class: "g3-sep" }),
      tb("down", "Export GLB", async () => { try { await saveUrl(pubUrl(j.result.files.glb), fileBase(j) + ".glb"); } catch (e) { toast("Không tải được: " + e.message); } }, { primary: true, disabled: !done }),
      quad ? tb("down", "OBJ", () => viewer.obj(fileBase(j)), { disabled: !done, title: "Xuất OBJ (mesh quad)" }) : null,
      canDelete(j) ? [h("span", { class: "g3-sep" }), h("button", { class: "g3-tb g3-tb--danger", type: "button", title: "Xoá model này cùng các phiên bản con", onclick: () => deleteJob(), html: "<span>Xoá</span>" })] : null));
}
async function jobAction(a) {
  try {
    await guard(api(a, { id: S.sel }));
    toast(a === "cancel" ? "Đã huỷ job" : "Đã đưa job về hàng đợi");
    S.logN = -1;
    await refreshJob(true);
    refreshJobs();
  } catch { /* banner */ }
}
const canDelete = (j) => !!j && !active(j) && (S.me.isAdmin || j.created_by === S.me.id);
async function deleteJob(j = S.job) {
  const inChain = S.chain.some((x) => x.id === j.id);
  const kids = inChain ? S.chain.filter((x) => x.id !== j.id && isDescendant(x, j.id)).length : 0;
  const tail = kids ? ` và ${kids} phiên bản con` : inChain ? "" : " và mọi phiên bản con (texture, xương) nếu có";
  if (!confirm(`Xoá ${KIND_LABEL[j.kind]} "${j.title || "Model"}"${tail}? Không khôi phục được.`)) return;
  try {
    await guard(api("delete", { id: j.id }));
    toast("Đã xoá");
    if (S.sel === j.id || inChain) {
      S.sel = null; S.job = null; S.chain = []; viewer.clear();
      history.replaceState(null, "", location.pathname + location.search);
      paintView(); paintRight();
    }
    refreshJobs();
  } catch { /* banner */ }
}
function isDescendant(x, id) {
  const by = new Map(S.chain.map((c) => [c.id, c]));
  for (let p = x.parent_id, n = 0; p && n < 20; n++) { if (p === id) return true; p = (by.get(p) || {}).parent_id; }
  return false;
}

/* ---------- panel phải ---------- */
function paintRight() {
  const R = $("g3-right");
  if (!P.rbody) {
    P.rtabs = h("div", { class: "g3-rtabs", role: "tablist" });
    P.rbody = h("div", { class: "g3-rbody" });
    fill(R, P.rtabs, P.rbody);
  }
  fill(P.rtabs, [["assets", "Assets"], ["property", "Property"]].map(([t, label]) => h("button", { type: "button", role: "tab", "aria-selected": String(ui.rtab === t), text: label, onclick: () => { ui.rtab = t; saveUi(); paintRight(); } })));
  if (ui.rtab === "assets") paintAssets(); else paintProperty();
}
function progressPct(j) {
  if (j.status === "done") return 100;
  const st = STAGES[j.kind] || [];
  const i = st.findIndex((s) => s[0] === j.stage);
  return j.status === "running" ? Math.round(((Math.max(0, i) + 0.5) / st.length) * 100) : 0;
}
function paintAssets() {
  const filt = seg([["all", "Tất cả"], ["mine", "Của tôi"]], () => ui.filter, (v) => { ui.filter = v; saveUi(); S.jobsLoaded = false; S.jobs = []; paintAssets(); refreshJobs(); });
  const list = h("div", { class: "g3-assets" },
    h("button", { class: "g3-asset g3-asset--up", type: "button", onclick: pickModelFile, disabled: !!S.importing },
      h("span", { class: "g3-upicon", html: svg("up") }), h("b", { text: S.importing ? "Đang tải lên…" : "Upload 3D Model" }), h("small", { text: "GLB, OBJ, FBX, STL ≤ 50 MB" })));
  if (!S.jobs.length) list.append(h("p", { class: "g3-empty-list", text: S.jobsLoaded ? "Chưa có model nào. Gửi ảnh ở cột trái." : "Đang tải…" }));
  for (const j of S.jobs) {
    const th = j.result && j.result.files && j.result.files.thumb ? pubUrl(j.result.files.thumb) : j.preview ? pubUrl(j.preview) : "";
    const stage = j.status === "running" ? ((STAGES[j.kind] || []).find((s) => s[0] === j.stage) || [0, j.stage])[1] : null;
    list.append(h("a", { class: "g3-asset", href: "#job=" + j.id, "aria-current": String(j.id === S.sel), title: `${KIND_LABEL[j.kind]} · ${j.title} · ${j.author}` },
      th ? h("img", { src: th, alt: "", loading: "lazy" }) : h("div", { class: "g3-asset__ph", text: j.status === "failed" ? "!" : "◇" }),
      h("span", { class: "g3-asset__k" }, kindTag(j.kind)),
      j.status !== "done" ? h("span", { class: "g3-asset__s" }, statusPill(j.status)) : null,
      h("span", { class: "g3-asset__t" }, stage ? h("span", { class: "g3-asset__stage", text: stage }) : null, j.title || "Model"),
      active(j) ? h("span", { class: "g3-asset__bar", style: "width:" + progressPct(j) + "%" }) : null,
      canDelete(j) ? h("button", { class: "g3-asset__x", type: "button", title: "Xoá", "aria-label": "Xoá " + (j.title || "model"), text: "×", onclick: (e) => { e.preventDefault(); e.stopPropagation(); deleteJob(j); } }) : null));
  }
  fill(P.rbody, h("div", { class: "g3-filter" }, filt, h("span", { class: "g3-spacer" }), h("button", { class: "g3-btn", type: "button", text: "↻", title: "Làm mới", "aria-label": "Làm mới", onclick: refreshJobs })), list);
}
function paintProperty() {
  const j = S.job;
  if (!j) { fill(P.rbody, h("p", { class: "g3-empty-list", text: "Chọn một model trong Assets để xem thông số." })); return; }
  const p = j.params || {};
  const root = S.chain.find((x) => x.id === j.root_id) || (j.kind === "shape" ? j : null);
  const views = (root && root.params && root.params.views) || {};
  const rows = [["Loại", KIND_LABEL[j.kind]], ["Trạng thái", (STATUS[j.status] || [j.status])[0]], ["Người gửi", j.author], ["Máy gen", j.worker || "—"], ["Gửi lúc", dateTime(j.created_at)],
    ["Chờ", j.claimed_at ? fmtDur(Date.parse(j.claimed_at) - Date.parse(j.created_at)) : active(j) ? fmtDur(Date.now() - Date.parse(j.created_at)) : "—"],
    ["Chạy", j.claimed_at ? fmtDur(Date.parse(j.finished_at || new Date().toISOString()) - Date.parse(j.claimed_at)) : "—"], ["Lượt thử", j.attempts]];
  if (j.kind === "shape") rows.push(["Ultra", p.ultra ? "bật" : "tắt"], ["Topology", p.topology === "quad" ? "Quad" : "Triangle"], ["Polycount", fmtN(p.polycount)], ["Seed", p.seed], ["Texture kèm", p.texture ? p.texture.quality : "không"]);
  if (j.kind === "texture") rows.push(["Chất lượng", p.quality], ["AI Complete", p.ai_complete ? "bật" : "tắt"], ["Remove Lighting", p.remove_lighting ? "bật" : "tắt"], ["PBR", p.pbr ? "bật" : "tắt"]);
  if (j.kind === "rig") rows.push(["Xương", "Mixamo (mixamorig:*)"]);
  const s = (j.result && j.result.stats) || {};
  if (s.tris) rows.push(["Tam giác", fmtN(s.tris)]);
  if (s.quads) rows.push(["Tứ giác", fmtN(s.quads)]);
  if (s.verts) rows.push(["Đỉnh", fmtN(s.verts)]);
  if (s.bytes) rows.push(["Dung lượng", (s.bytes / 1048576).toFixed(2) + " MB"]);
  if (s.seconds) rows.push(["Thời gian pipeline", fmtDur(s.seconds * 1000)]);
  if (s.vram_peak_mb) rows.push(["VRAM đỉnh", fmtN(s.vram_peak_mb) + " MB"]);
  const log = j.log || [];
  const logEl = h("div", { class: "g3-log", role: "log" }, log.map((l) => h("div", {}, h("time", { text: clock(l.t) }), l.stage ? h("em", { text: l.stage }) : null, h("span", { text: l.msg }))));
  fill(P.rbody, h("div", { class: "g3-prop" },
    h("h3", { text: j.title || "Model" }), h("div", {}, kindTag(j.kind), " ", statusPill(j.status)),
    Object.keys(views).length ? h("div", { class: "g3-views" }, VIEWS.filter(([v]) => views[v]).map(([v, label]) => h("figure", {}, h("img", { src: pubUrl(views[v]), alt: label }), h("figcaption", { text: label })))) : null,
    j.error ? h("div", { class: "g3-err", text: j.error }) : null,
    h("dl", { class: "g3-kv" }, rows.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: String(v) })])),
    h("div", { class: "g3-btns" },
      active(j) ? h("button", { class: "g3-btn g3-btn--danger", type: "button", text: "Huỷ", onclick: () => jobAction("cancel") }) : null,
      j.status === "failed" || j.status === "canceled" ? h("button", { class: "g3-btn", type: "button", text: "Chạy lại", onclick: () => jobAction("retry") }) : null,
      canDelete(j) ? h("button", { class: "g3-btn g3-btn--danger", type: "button", text: "Xoá", onclick: () => deleteJob() }) : null),
    h("div", { class: "g3-sec", text: "Các phiên bản" }), chainTree(),
    h("div", { class: "g3-sec", text: "Nhật ký" }), logEl));
  logEl.scrollTop = logEl.scrollHeight;
}
function chainTree() {
  const jobs = S.chain.length ? S.chain : S.job ? [S.job] : [];
  const kids = (id) => jobs.filter((x) => x.parent_id === id);
  const node = (x) => h("li", {},
    x.id === S.sel ? h("span", { class: "g3-cur" }, kindTag(x.kind), x.kind === "shape" ? (x.title || "Model") : clock(x.created_at), statusPill(x.status))
      : h("a", { href: "#job=" + x.id }, kindTag(x.kind), x.kind === "shape" ? (x.title || "Model") : clock(x.created_at), statusPill(x.status)),
    kids(x.id).length ? h("ul", {}, kids(x.id).map(node)) : null);
  const roots = jobs.filter((x) => !x.parent_id || !jobs.some((y) => y.id === x.parent_id));
  return h("ul", { class: "g3-tree" }, roots.map(node));
}

/* ---------- máy gen ---------- */
const online = (w) => w.last_seen && Date.now() - Date.parse(w.last_seen) <= 45000;
async function refreshWorkers(force) {
  last.workers = Date.now();
  if (!force && P.workers && P.workers.contains(document.activeElement) && document.activeElement.matches("input")) return;
  try {
    const r = await guard(api("workers"));
    S.workers = r.workers; S.workersLoaded = true;
    if (ui.tool === "workers") paintWorkers();
  } catch { /* banner */ }
}
function paintWorkers() {
  const admin = S.me.isAdmin;
  const upd = async (w, patch) => {
    try { const r = await guard(api("worker_update", { id: w.id, patch })); Object.assign(w, r.worker); toast("Đã lưu " + (w.label || w.id)); paintWorkers(); }
    catch { refreshWorkers(true); }
  };
  const meter = (free, total) => (total ? h("span", { class: "g3-meter", title: `trống ${free} / ${total}` }, h("i", { style: `width:${Math.round((free / total) * 100)}%` })) : null);
  const cards = S.workers.slice().sort((a, b) => a.priority - b.priority).map((w) => {
    const st = online(w) ? w.status : "offline", [lab, k] = WSTATUS[st] || [st, "off"];
    const num = (key, min) => admin ? h("input", { type: "number", min, step: 1, value: w[key], "aria-label": key, onchange: (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= min) upd(w, { [key]: v }); else e.target.value = w[key]; } }) : h("span", { text: w[key] });
    const row = (label, el) => h("div", { class: "g3-wrow" }, h("span", { text: label }), el);
    const g = w.gpu || {}, m = w.mem || {};
    return h("article", { class: "g3-worker" + (w.enabled ? "" : " is-off") },
      h("div", { class: "g3-worker__head" }, h("b", { text: w.label || w.id }), pill(k, lab), w.enabled ? null : pill("off", "Đã tắt")),
      h("code", { class: "g3-dim", text: w.id }),
      row("Làm được", h("span", {}, (w.caps || []).map((c) => [kindTag(c), " "]))),
      row("GPU", h("span", { text: g.name ? `${g.name}` : "—" })),
      g.vram_total_mb ? row("VRAM trống", h("span", {}, meter(g.vram_free_mb, g.vram_total_mb), ` ${(g.vram_free_mb / 1024).toFixed(1)} / ${(g.vram_total_mb / 1024).toFixed(1)} GB`)) : null,
      m.commit_free_gb != null ? row("Commit trống", h("span", { text: m.commit_free_gb + " GB" })) : null,
      m.ram_free_gb != null ? row("RAM trống", h("span", { text: m.ram_free_gb + " GB" })) : null,
      row("Việc đang làm", w.current_job ? h("a", { href: "#job=" + w.current_job, onclick: () => setTool("model"), text: "mở job" }) : h("span", { class: "g3-dim", text: "không có" })),
      row("Đã xong", h("span", { text: w.jobs_done + " job" })),
      row("Thấy lần cuối", h("span", { text: ago(w.last_seen) })),
      row("Bật", admin ? h("input", { type: "checkbox", class: "g3-toggle", "aria-label": "Bật máy", checked: w.enabled, onchange: (e) => upd(w, { enabled: e.target.checked }) }) : h("span", { text: w.enabled ? "bật" : "tắt" })),
      row("Ưu tiên", num("priority", 0)),
      row("Nhường (giây)", num("claim_delay_s", 0)),
      w.note ? h("p", { class: "g3-dim", text: w.note }) : null);
  });
  fill(P.workers, h("h2", { text: "Máy gen" }),
    h("p", { class: "g3-dim", text: "PC ưu tiên 0, linux2 ưu tiên 1, linux ưu tiên 2. Máy tự báo loại job làm được (caps) và RAM/VRAM mỗi lần chào." }),
    h("div", { class: "g3-wgrid" }, cards.length ? cards : h("p", { class: "g3-empty-list", text: S.workersLoaded ? "Chưa có máy gen nào báo danh." : "Đang tải…" })));
}

/* ---------- định tuyến, vòng cập nhật ---------- */
function route() {
  const hs = decodeURIComponent(location.hash.slice(1));
  const m = hs.match(/^job=(.+)$/);
  if (hs === "workers") { if (ui.tool !== "workers") setTool("workers"); return; }
  if (ui.tool === "workers") { ui.tool = "model"; saveUi(); paintRail(); paintLeft(); }
  if (m) select(m[1]);
  paintView();
}
function heartbeat() {
  if (document.hidden) return;
  const now = Date.now();
  if (S.job && active(S.job) && now - last.job >= 2000) refreshJob(false);
  else if (S.sel && S.chain.some(active) && now - last.chain >= 3000) refreshChain();
  if (now - last.jobs >= (S.jobs.some(active) ? 5000 : 30000)) refreshJobs();
  if (ui.tool === "workers" && now - last.workers >= 8000) refreshWorkers();
  if (S.job && active(S.job)) paintView();
}

function boot() {
  buildRail(); buildView();
  if (location.hash === "#workers") ui.tool = "workers";
  else if (ui.tool === "workers") ui.tool = "model";
  paintRail(); paintLeft(); paintRight();
  addEventListener("hashchange", route);
  setInterval(heartbeat, 1000);
  refreshJobs();
  route();
  if (ui.tool === "workers") refreshWorkers(true);
  api("me").then((r) => {
    S.me = { isAdmin: !!r.isAdmin, ...r.user };
    $("g3-me").textContent = (r.user.email || "").split("@")[0] + (r.isAdmin ? " · admin" : "") + (MOCK ? " · MOCK" : "");
    if (ui.tool === "workers") { paintWorkers(); paintLeft(); }
  }, (e) => banner(e));
  window.__gen3d = { S, ui, viewer };
}
boot();
