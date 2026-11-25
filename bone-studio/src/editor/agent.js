// Agent panel: prompt → job → live event stream applied as one undo group.
import { S, doc, emit, h, toast, selectedBones } from "./state.js?v=20261125b";
import { api, uploadFiles, publicUrl, signedIn, MOCK, mockPut } from "./api.js?v=20261125b";
import { bundle, setImage } from "./io.js?v=20261125b";

const pane = document.getElementById("xx-pane-agent");
const log = h("div", { class: "xx-agent-log" });
const ta = h("textarea", { placeholder: "Ví dụ: rig nhân vật này · làm walk cycle 12 khung · tay gập sai, sửa IK · thêm chớp mắt mỗi 3 giây", spellcheck: "false" });
const chips = h("div", { class: "xx-chips" });
const refInput = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", multiple: true, hidden: true });
const status = h("span", { class: "xx-muted" });
const sendBtn = h("button", { class: "xx-btn xx-btn--primary", text: "Gửi cho agent" });
const stopBtn = h("button", { class: "xx-btn xx-btn--ghost", text: "Dừng", hidden: true });
let refs = [], current = null;
export const latency = [];

pane.append(h("div", { class: "xx-agent" }, log, h("div", { class: "xx-agent-form" },
  chips, ta,
  h("div", { class: "xx-row-flex" },
    h("button", { class: "xx-btn xx-btn--ghost", text: "📎 Ảnh tham khảo", onclick: () => refInput.click() }), refInput,
    h("span", { class: "grow" }), stopBtn, sendBtn),
  status)));

refInput.addEventListener("change", () => { refs = [...refInput.files]; renderChips(); });
ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } e.stopPropagation(); });
sendBtn.addEventListener("click", () => send());
stopBtn.addEventListener("click", () => stop());

function msg(kind, text, small) {
  const m = h("div", { class: `xx-msg xx-msg--${kind}` }, text, small ? h("small", { text: small }) : null);
  log.append(m);
  log.scrollTop = log.scrollHeight;
  return m;
}
export function renderChips() {
  const sel = selectedBones();
  chips.replaceChildren(
    ...sel.map((b) => h("span", { class: "xx-chip", text: `🦴 ${b}` })),
    S.anim ? h("span", { class: "xx-chip", text: `▶ ${S.anim} @ ${S.time.toFixed(2)}s` }) : null,
    ...refs.map((f) => h("span", { class: "xx-chip", text: `🖼 ${f.name}` })),
  );
}
function intro() {
  if (!signedIn()) {
    log.replaceChildren(msg("sys", "Agent cần đăng nhập thành viên hub (role member, artist hoặc admin)."), h("a", { class: "xx-btn xx-btn--ghost", href: "../login.html", text: "Đăng nhập" }));
    sendBtn.disabled = true;
    return;
  }
  msg("sys", MOCK ? "Chế độ thử (?mock=1): agent giả, chỉ để kiểm luồng." : "Gõ yêu cầu, chọn bone hoặc animation để agent biết bạn đang nói tới đâu. Agent sửa trực tiếp trên canvas; cả lượt là một bước Hoàn tác (Ctrl+Z).");
}

export async function send(prompt = ta.value.trim(), params = {}) {
  if (!prompt) return;
  if (current) return toast("Agent đang làm việc khác", true);
  const context = { selection: selectedBones(), anim: S.anim, time: S.time, mode: S.mode, skin: S.skin };
  msg("me", prompt);
  ta.value = "";
  status.textContent = "đang gửi…";
  try {
    const b = await bundle();
    const files = [{ name: "bundle.json", type: "application/json", blob: new Blob([JSON.stringify(b)], { type: "application/json" }) }, ...refs.map((f) => ({ name: f.name, type: f.type || "image/png", blob: f }))];
    const up = await uploadFiles(files);
    const { job } = await api("submit", { prompt, title: prompt.slice(0, 80), project: up[0].path, refs: up.slice(1).map((u, i) => ({ path: u.path, kind: "image", name: refs[i].name })), context, params });
    refs = []; refInput.value = ""; renderChips();
    follow(job, prompt);
    return job;
  } catch (e) {
    status.textContent = "";
    msg("sys", "Gửi không được: " + e.message);
  }
}

function lock(label) {
  S.locked = { label };
  const el = document.getElementById("xx-lock");
  el.hidden = false;
  el.replaceChildren(h("span", { text: "🤖 " + label }), h("button", { class: "xx-btn xx-btn--ghost", text: "Dừng", onclick: stop }));
  sendBtn.hidden = true; stopBtn.hidden = false;
  emit("lock");
}
function unlock() {
  S.locked = null;
  document.getElementById("xx-lock").hidden = true;
  sendBtn.hidden = false; stopBtn.hidden = true;
  emit("lock");
}

async function follow(job, prompt) {
  current = { id: job.id, since: 0, applied: 0, failed: 0, startedAt: Date.now() };
  S.hist.begin(`Agent: ${prompt.slice(0, 40)}`);
  lock(`Agent đang làm: ${prompt.slice(0, 50)}`);
  status.textContent = "đang chờ máy nhận…";
  const STAGES = { setup: "chuẩn bị", thinking: "đang xem", editing: "đang sửa", checking: "đang kiểm", uploading: "đang gửi kết quả" };
  try {
    while (current) {
      const r = await api("events", { id: current.id, since: current.since }).catch((e) => ({ error: e }));
      if (r.error) { status.textContent = "mất kết nối, thử lại…"; await sleep(1500); continue; }
      if (r.job.status === "queued" && current.since > 0) current.since = 0;
      for (const ev of r.events) {
        current.since = Math.max(current.since, ev.seq);
        await applyEvent(ev);
      }
      const j = r.job;
      status.textContent = j.status === "queued" ? "đang chờ máy nhận…" : j.status === "running" ? `${STAGES[j.stage] ?? j.stage ?? "đang làm"} · ${current.applied} bước` : "";
      if (["done", "failed", "canceled"].includes(j.status)) { await finish(j); break; }
      await sleep(500);
    }
  } finally {
    if (S.hist.open) S.hist.end();
    current = null;
    unlock();
    emit("doc");
  }
}
async function applyEvent(ev) {
  const d = ev.data ?? {};
  if (ev.kind === "say") msg("agent", d.text);
  else if (ev.kind === "image") {
    try { const blob = await (await fetch(publicUrl(d.path))).blob(); await setImage(d.name, blob); } catch (e) { msg("sys", `Không tải được ảnh ${d.name}: ${e.message}`); }
  } else if (ev.kind === "cmds") {
    for (const c of d.cmds ?? []) {
      try { S.hist.run(c); current.applied++; } catch (e) { current.failed++; console.warn("agent cmd lỗi", c, e); }
    }
    const t = Date.parse(ev.t);
    if (t) latency.push(Date.now() - t);
    if (d.note) msg("sys", "✎ " + d.note);
    emit("doc");
  } else if (ev.kind === "preview") {
    const img = h("img", { src: publicUrl(d.path), style: "max-width:100%;border-radius:6px;background:#2a2c33" });
    log.append(h("div", { class: "xx-msg xx-msg--agent" }, img, h("small", { text: "agent tự nhìn bản render" })));
  }
}
async function finish(j) {
  if (j.status === "done" && j.result?.doc && !MOCK) {
    try {
      const final = await (await fetch(publicUrl(j.result.doc))).json();
      if (JSON.stringify(final) !== JSON.stringify(doc())) { S.hist.run({ type: "$replace", doc: final }); msg("sys", "Đồng bộ lại theo bản cuối của agent."); }
    } catch (e) { msg("sys", "Không tải được bản cuối: " + e.message); }
  }
  const took = Math.round((Date.now() - current.startedAt) / 1000);
  if (j.status === "done") msg("sys", `Xong sau ${took} giây, ${current.applied} thay đổi${current.failed ? `, ${current.failed} lệnh lỗi bỏ qua` : ""}. Hoàn tác cả lượt: Ctrl+Z.${j.result?.summary ? "\n" + j.result.summary : ""}`);
  else if (j.status === "failed") msg("sys", `Agent hỏng: ${j.error ?? "không rõ"}. Những gì đã áp vẫn còn, Ctrl+Z để bỏ.`);
  else msg("sys", "Đã dừng. Những gì agent đã làm vẫn còn, Ctrl+Z để bỏ.");
}
async function stop() {
  if (!current) return;
  try { await api("cancel", { id: current.id }); } catch (e) { toast(e.message, true); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const agentBusy = () => !!current;
void mockPut;

intro();
