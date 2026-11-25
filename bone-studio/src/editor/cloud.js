// Cloud save for signed-in members (bone_projects + Storage, one file per version) and the admin "Máy" panel.
import { S, doc, h, toast } from "./state.js?v=20261125o";
import { api, signedIn, MOCK } from "./api.js?v=20261125o";
import { bundle, loadProject } from "./io.js?v=20261125o";

const KEY = "xx-cloud-ids";
const ids = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };
const remember = (local, cloud) => { try { localStorage.setItem(KEY, JSON.stringify({ ...ids(), [local]: cloud })); } catch {} };

export async function cloudSave() {
  if (!signedIn() || MOCK) throw new Error("cần đăng nhập thành viên hub để lưu cloud");
  const cloudId = S.projectId ? ids()[S.projectId] : null;
  const b = JSON.stringify(await bundle());
  const { project, upload } = await api("project_save", { id: cloudId ?? undefined, name: doc().name });
  const r = await fetch(upload.uploadUrl, { method: "PUT", headers: { "content-type": "application/json" }, body: b });
  if (!r.ok) throw new Error(`tải lên lỗi ${r.status}`);
  const { project: p } = await api("project_commit", { id: project.id, path: upload.path, size: b.length });
  if (S.projectId) remember(S.projectId, project.id);
  S.cloudId = project.id;
  return { id: project.id, versions: p.versions.length, size: b.length };
}

export async function cloudDialog(dialog) {
  if (!signedIn() || MOCK) return dialog("Cloud", h("p", { class: "xx-note", text: "Lưu cloud cần đăng nhập thành viên hub." }), h("a", { class: "xx-btn xx-btn--ghost", href: "../login.html", text: "Đăng nhập" }));
  const list = h("div", { class: "xx-list" }, h("p", { class: "xx-note", text: "đang tải…" }));
  const saveBtn = h("button", { class: "xx-btn xx-btn--primary", text: "Lưu phiên bản mới lên cloud", onclick: async () => {
    saveBtn.disabled = true;
    try { const r = await cloudSave(); toast(`Đã lưu cloud, phiên bản ${r.versions} (${Math.round(r.size / 1024)} KB)`); close(); } catch (e) { toast(e.message, true); saveBtn.disabled = false; }
  } });
  const close = dialog("Cloud", h("p", { class: "xx-note", text: "Mỗi lần lưu là một phiên bản; mở được ở máy khác khi đăng nhập cùng tài khoản." }), saveBtn, h("div", { class: "xx-group", text: "Dự án của bạn" }), list);
  try {
    const { projects } = await api("project_list");
    list.replaceChildren(...(projects.length ? projects.map((p) => h("button", { onclick: () => showVersions(p, list, close) }, h("span", { text: p.name }), h("span", { class: "xx-muted", text: `${p.versions} bản · ${new Date(p.updated_at).toLocaleString("vi-VN")}` }))) : [h("p", { class: "xx-note", text: "Chưa có dự án trên cloud." })]));
  } catch (e) { list.replaceChildren(h("p", { class: "xx-note", text: "Lỗi: " + e.message })); }
}
async function showVersions(p, list, close) {
  const { project } = await api("project_get", { id: p.id });
  list.replaceChildren(h("div", { class: "xx-group", text: project.name }), ...project.versions.slice().reverse().map((v) => h("button", { onclick: async () => {
    try {
      const b = await (await fetch(v.url)).json();
      await loadProject(b.doc, b.images);
      S.cloudId = project.id;
      close();
      toast(`Đã mở ${project.name} bản ${v.v}`);
    } catch (e) { toast("Mở lỗi: " + e.message, true); }
  } }, h("span", { text: `Bản ${v.v}` }), h("span", { class: "xx-muted", text: `${Math.round(v.size / 1024)} KB · ${new Date(v.at).toLocaleString("vi-VN")}` }))));
}

// Admin: worker priority / enable / model, like the "Máy gen" tab of Xưởng VFX.
const WST = { idle: "Rảnh", busy: "Đang làm", paused: "Tạm dừng", quota: "Hết hạn mức", offline: "Offline" };
export async function workersPanel(el) {
  try {
    const me = await api("me");
    if (!me.isAdmin) { el.replaceChildren(); return; }
    const { workers } = await api("workers");
    el.replaceChildren(h("div", { class: "xx-group", text: "Máy agent (admin)" }), ...workers.map((w) => {
      const pr = h("input", { type: "number", value: w.priority, min: 0, max: 99, style: "width:48px", class: "xx-input" });
      const dl = h("input", { type: "number", value: w.claim_delay_s, min: 0, max: 3600, style: "width:56px", class: "xx-input" });
      const md = h("select", { class: "xx-input", style: "width:80px" }, ...["opus", "sonnet", "haiku", "fable"].map((m) => h("option", { value: m, text: m, selected: m === w.model })));
      const en = h("input", { type: "checkbox", checked: w.enabled });
      const save = async () => { try { await api("worker_update", { id: w.id, patch: { enabled: en.checked, priority: +pr.value, claim_delay_s: +dl.value, model: md.value } }); toast(`Đã lưu ${w.label}`); } catch (e) { toast(e.message, true); } };
      for (const x of [pr, dl, md, en]) x.addEventListener("change", save);
      return h("div", { style: "padding:4px 8px;border-bottom:1px solid var(--line)" },
        h("div", { class: "xx-row-flex" }, en, h("b", { text: w.label, class: "grow" }), h("span", { class: "xx-muted", text: WST[w.status] ?? w.status })),
        h("div", { class: "xx-row-flex", style: "margin-top:4px" }, h("span", { class: "xx-muted", text: "ưu tiên" }), pr, h("span", { class: "xx-muted", text: "chờ (s)" }), dl, md));
    }));
  } catch { el.replaceChildren(); }
}
