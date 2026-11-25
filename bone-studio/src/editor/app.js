// Xưởng Xương editor entry: wiring, menus, dialogs, shortcuts, render loop, test hooks.
window.__errors = [];
window.addEventListener("error", (e) => window.__errors.push(String(e.message || e)));
window.addEventListener("unhandledrejection", (e) => window.__errors.push(String(e.reason?.message || e.reason)));

const { S, doc, emit, on, h, toast, run, select, selectedBones, keyOverrides, keyAll, setTime, skeleton, poseAtTime } = await import("./state.js?v=20261125b");
const VP = await import("./viewport.js?v=20261125b");
const { renderTree, renderProps } = await import("./panels.js?v=20261125b");
const TL = await import("./timeline.js?v=20261125b");
const IO = await import("./io.js?v=20261125b");
const AG = await import("./agent.js?v=20261125b");
const { importWhole } = await import("./splitui.js?v=20261125b");

const $ = (id) => document.getElementById(id);
const app = $("app"), modal = $("xx-modal");
const Q = new URLSearchParams(location.search);

// ---- tools pill --------------------------------------------------------------------------------
const TOOLS = [["pose", "Pose", "B"], ["create", "Tạo bone", "N"], ["rotate", "Xoay", "C"], ["translate", "Dời", "V"], ["scale", "Scale", "X"]];
function renderTools() {
  const t = $("xx-tools");
  t.replaceChildren(
    ...TOOLS.filter(([id]) => id !== "create" || S.mode === "setup").map(([id, label, key]) => h("button", { class: "xx-tool" + (S.tool === id ? " is-on" : ""), title: `${label} (${key})`, onclick: () => setTool(id) }, label, h("kbd", { text: key }))),
    S.mode === "animate" ? h("span", { class: "xx-sep" }) : null,
    S.mode === "animate" ? h("button", { class: "xx-tool is-auto" + (S.autoKey ? " is-on" : ""), title: "Auto key: mọi thay đổi tự thành key", onclick: () => { S.autoKey = !S.autoKey; emit("tools"); } }, "● Auto key") : null,
    S.mode === "animate" ? h("button", { class: "xx-tool", title: "Key những gì đã đổi (K)", onclick: keyNow }, "Key", h("kbd", { text: "K" })) : null,
  );
}
function setTool(id) { if (id === "create" && S.mode !== "setup") return; S.tool = id; emit("tools"); }
function setMode(m) {
  if (S.mode === m) return;
  S.mode = m; S.overrides = {}; S.playing = false;
  if (m === "animate" && !S.anim) S.anim = Object.keys(doc().animations)[0] ?? null;
  if (m === "setup" && S.tool === "pose") S.tool = "rotate";
  if (m === "animate" && S.tool === "create") S.tool = "rotate";
  emit("mode");
}
function renderMode() {
  app.classList.toggle("is-setup", S.mode === "setup");
  app.classList.toggle("is-animate", S.mode === "animate");
  $("xx-badge").textContent = S.mode === "setup" ? "SETUP" : `ANIMATE${S.anim ? " · " + S.anim : ""}`;
  for (const b of $("xx-mode").querySelectorAll("button")) b.classList.toggle("is-on", b.dataset.mode === S.mode);
}
$("xx-mode").addEventListener("click", (e) => { const m = e.target.closest("button")?.dataset.mode; if (m) setMode(m); });

function keyNow() {
  if (!S.anim) return toast("Chưa chọn animation", true);
  const n = keyOverrides();
  if (!n) for (const b of selectedBones()) keyAll(b);
  toast(n ? `Đã key ${n} thuộc tính` : "Đã key bone đang chọn");
}
function addIk() {
  const [a, b] = selectedBones();
  const d = doc(), A = d.bones.find((x) => x.name === a), B = d.bones.find((x) => x.name === b);
  const [parent, child] = B?.parent === a ? [a, b] : A?.parent === b ? [b, a] : [null, null];
  if (!parent) return toast("Chọn hai bone cha-con liền nhau để tạo IK", true);
  const sk = skeleton(), pose = poseAtTime(0), c = pose.bones[sk.boneIndex.get(child)], len = d.bones.find((x) => x.name === child).length;
  const tx = c.wx + c.a * len, ty = c.wy + c.c * len, target = `${child}-ik`;
  if (run([{ type: "bone.add", name: target, parent: d.bones[0].name, x: Math.round(tx * 100) / 100, y: Math.round(ty * 100) / 100 }, { type: "ik.add", name: `${parent}-ik`, bones: [parent, child], target }], "Tạo IK")) select({ kind: "bone", name: target });
}

// ---- menu + dialogs ----------------------------------------------------------------------------
function dialog(title, ...body) {
  const close = () => { modal.hidden = true; modal.replaceChildren(); };
  const box = h("div", { class: "xx-dialog" }, h("h2", { text: title }), ...body, h("div", { class: "xx-foot" }, h("button", { class: "xx-btn xx-btn--ghost", text: "Đóng", onclick: close })));
  modal.replaceChildren(box); modal.hidden = false;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  return close;
}
function pickFiles({ accept = "image/png,image/jpeg,image/webp", multiple = true, dir = false } = {}) {
  return new Promise((res) => {
    const i = h("input", { type: "file", accept, multiple, hidden: true });
    if (dir) i.webkitdirectory = true;
    i.addEventListener("change", () => { res([...i.files]); i.remove(); });
    document.body.append(i); i.click();
  });
}
const choice = (title, desc, fn) => h("button", { class: "xx-choice", onclick: fn }, h("b", { text: title }), h("span", { text: desc }));
function importDialog() {
  const close = dialog("Nhập",
    h("div", { class: "xx-choices" },
      choice("Nhập ảnh rời", "Nhiều PNG, mỗi ảnh một slot. Kéo thả vào viewport cũng được.", async () => { close(); await IO.importImages(await pickFiles()); }),
      choice("Nhập cả thư mục", "Mọi PNG trong thư mục, giữ thư mục con trong tên ảnh.", async () => { close(); await IO.importImages(await pickFiles({ dir: true })); }),
      choice("✂ Nhập ảnh nguyên con, tự cắt part", "Một ảnh cả nhân vật: bỏ nền, tìm part, cắt, vẽ bù chỗ bị che, dựng bone. Sửa được trước khi nhận.", async () => { close(); const [f] = await pickFiles({ multiple: false }); if (f) importWhole(f); }),
      choice("Mở JSON + atlas", "File .json (kiểu Spine 3.8/4.x hoặc Xưởng Xương) kèm .atlas, .png, hoặc một file .zip.", async () => { close(); const fs = await pickFiles({ accept: ".json,.atlas,.txt,.png,.zip" }); if (fs.length) await IO.importSpine(fs).catch((e) => toast(e.message, true)); }),
    ));
}
function exportDialog() {
  const anims = Object.keys(doc().animations);
  const animSel = h("select", { class: "xx-input" }, ...anims.map((a) => h("option", { value: a, text: a, selected: a === S.anim })));
  const scale = h("input", { class: "xx-input", type: "number", value: 1, min: 0.1, max: 8, step: 0.5 });
  const fps = h("input", { class: "xx-input", type: "number", value: doc().fps, min: 1, max: 60 });
  const opts = () => ({ scale: +scale.value || 1, fps: +fps.value || doc().fps });
  const wrap = (fn) => async () => { try { await fn(); toast("Đã xuất"); } catch (e) { toast("Xuất lỗi: " + e.message, true); } };
  dialog("Xuất",
    h("div", { class: "xx-choices" },
      choice("Xưởng Xương (.xuong.json + atlas)", "Cho runtime của hub (bone-studio/runtime/xuong.js).", wrap(() => IO.exportData("xuong"))),
      choice("JSON + atlas kiểu Spine 4.2", "Mở được bằng công cụ và runtime đọc định dạng Spine.", wrap(() => IO.exportData("spine"))),
    ),
    anims.length ? h("div", { style: "margin-top:12px" },
      h("div", { class: "xx-field" }, h("label", { text: "Animation" }), animSel, h("span")),
      h("div", { class: "xx-field" }, h("label", { text: "Scale" }), scale, h("span")),
      h("div", { class: "xx-field" }, h("label", { text: "FPS" }), fps, h("span")),
      h("div", { class: "xx-choices" },
        choice("Chuỗi PNG (.zip)", "Mỗi khung một PNG nền trong.", wrap(() => IO.exportSequence(animSel.value, opts()))),
        choice("Sprite sheet + JSON", "Một PNG lưới khung + JSON kiểu Aseprite.", wrap(() => IO.exportSheet(animSel.value, opts()))),
        choice("Video WebM", "Ghi animation thành video (nền trong nếu trình duyệt hỗ trợ).", wrap(() => IO.exportWebM(animSel.value, opts()))),
      )) : h("p", { class: "xx-note", text: "Chưa có animation: chỉ xuất được dữ liệu." }));
}
async function openDialog() {
  const list = await IO.listLocal();
  const close = dialog("Mở dự án",
    h("div", { class: "xx-group", text: "Trong máy này" }),
    list.length ? h("div", { class: "xx-list" }, ...list.map((p) => h("button", { onclick: async () => { close(); await IO.openLocal(p.id); toast(`Đã mở ${p.name}`); } }, h("span", { text: p.name }), h("span", { class: "xx-muted", text: new Date(p.updatedAt).toLocaleString("vi-VN") })))) : h("p", { class: "xx-note", text: "Chưa có dự án nào." }),
    h("div", { class: "xx-group", text: "Mẫu" }),
    h("div", { class: "xx-list" },
      h("button", { onclick: async () => { close(); await openSample("pharaoh"); } }, h("span", { text: "Pharaoh (pixel art, đã cắt part, idle/walk/attack)" })),
      h("button", { onclick: async () => { close(); await openSample("robo"); } }, h("span", { text: "Robo (vẽ bằng code, idle/walk/attack)" }))));
}
async function openSample(name) {
  const base = name === "pharaoh" ? "samples/pharaoh/project" : "samples/robo";
  const d = await (await fetch(`${base}/doc.json?v=20261125b`)).json();
  const images = {};
  await Promise.all(Object.keys(d.images).map(async (p) => { images[p] = await (await fetch(`${base}/images/${p}.png?v=20261125b`)).blob(); }));
  await IO.loadProject(d, images);
  toast(`Đã mở mẫu ${d.name}`);
}
const MENU = [
  ["Mới", () => { if (!S.dirty || confirm("Bỏ các thay đổi chưa lưu?")) IO.newProject(); }, "Dự án trống"],
  ["Mở…", openDialog, "Mở dự án trong máy hoặc mẫu (Ctrl+O)"],
  ["Lưu", () => IO.saveLocal().then(() => toast("Đã lưu trong máy")), "Lưu trong trình duyệt, dùng được offline (Ctrl+S)"],
  ["Nhập…", importDialog, "Ảnh rời, thư mục, ảnh nguyên con, JSON + atlas"],
  ["Xuất…", exportDialog, "JSON + atlas, PNG, sprite sheet, WebM"],
  ["↶", () => { S.hist.undo(); }, "Hoàn tác (Ctrl+Z)"],
  ["↷", () => { S.hist.redo(); }, "Làm lại (Ctrl+Shift+Z)"],
];
$("xx-menu").replaceChildren(...MENU.map(([t, fn, tip]) => h("button", { text: t, title: tip, onclick: fn })));
$("xx-name").addEventListener("change", (e) => { const v = e.target.value.trim(); if (v) run({ type: "doc.set", props: { name: v } }); });
$("xx-sidetabs").addEventListener("click", (e) => {
  const t = e.target.closest("button")?.dataset.tab;
  if (!t) return;
  for (const b of $("xx-sidetabs").children) b.classList.toggle("is-on", b.dataset.tab === t);
  $("xx-pane-tree").hidden = t !== "tree"; $("xx-pane-agent").hidden = t !== "agent";
  if (t === "agent") AG.renderChips();
});
$("xx-fit").onclick = VP.fit;
$("xx-zoom100").onclick = () => { S.view.zoom = 1; emit("view"); };
$("xx-show-bones").onchange = (e) => { S.showBones = e.target.checked; };
$("xx-show-images").onchange = (e) => { S.showImages = e.target.checked; };
$("xx-pixel").onchange = (e) => { S.pixelView = e.target.checked; };

window.XX = {
  importDialog, keyNow, addIk, fitView: VP.fit,
  replaceImage: async (path) => { const [f] = await pickFiles({ multiple: false }); if (f) await IO.replaceImage(path, f); },
};

// ---- drag & drop -------------------------------------------------------------------------------
const view = $("xx-view"), drop = $("xx-drop");
view.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); drop.hidden = false; } });
view.addEventListener("dragleave", () => { drop.hidden = true; });
view.addEventListener("drop", async (e) => {
  drop.hidden = true;
  if (![...e.dataTransfer.types].includes("Files")) return;
  e.preventDefault();
  const files = [...e.dataTransfer.files];
  if (files.some((f) => /\.(json|atlas|zip)$/i.test(f.name))) return IO.importSpine(files).catch((err) => toast(err.message, true));
  await IO.importImages(files);
});
window.addEventListener("paste", async (e) => {
  if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (files.length) { e.preventDefault(); await IO.importImages(files.map((f, i) => new File([f], `dan-${Date.now() % 100000}-${i}.png`, { type: f.type }))); }
});

// ---- keyboard ----------------------------------------------------------------------------------
let clip = null;
window.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  if (/INPUT|TEXTAREA|SELECT/.test(tag) && !(e.ctrlKey && e.key.toLowerCase() === "s")) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && k === "z") { e.preventDefault(); if (S.locked) return; e.shiftKey ? S.hist.redo() : S.hist.undo(); return; }
  if (ctrl && k === "y") { e.preventDefault(); if (!S.locked) S.hist.redo(); return; }
  if (ctrl && k === "s") { e.preventDefault(); IO.saveLocal().then(() => toast("Đã lưu trong máy")); return; }
  if (ctrl && k === "o") { e.preventDefault(); openDialog(); return; }
  if (ctrl && k === "e") { e.preventDefault(); exportDialog(); return; }
  if (ctrl && k === "f") { e.preventDefault(); if (e.shiftKey) VP.fit(); else { S.view.zoom = 1; emit("view"); } return; }
  if (ctrl && k === "c" && S.mode === "animate" && S.keySel.length) { clip = TL.copyKeys(); toast(`Đã chép ${clip.length} key`); return; }
  if (ctrl && k === "v" && S.mode === "animate" && clip) { TL.pasteKeys(clip); return; }
  if (ctrl) return;
  if (k === "tab") { e.preventDefault(); setMode(S.mode === "setup" ? "animate" : "setup"); return; }
  if (k === "b") return setTool("pose");
  if (k === "n") return setTool("create");
  if (k === "c") return setTool("rotate");
  if (k === "v") return setTool("translate");
  if (k === "x") return setTool("scale");
  if (k === "escape") { select(null); S.keySel = []; emit("sel"); return; }
  if (k === "k" && S.mode === "animate") return keyNow();
  if (k === "p" && S.sel) return toast("Đổi cha: kéo bone thả lên bone khác trong cây, hoặc chọn ở ô Cha", false);
  if (S.mode === "animate") {
    if (k === " " && !e.repeat) { e.preventDefault(); TL.togglePlay(); return; }
    if (k === "arrowleft") { e.preventDefault(); e.shiftKey ? TL.jumpKey(-1) : TL.step(-1); return; }
    if (k === "arrowright") { e.preventDefault(); e.shiftKey ? TL.jumpKey(1) : TL.step(1); return; }
    if (k === ",") return TL.jumpKey(-1);
    if (k === ".") return TL.jumpKey(1);
    if (k === "home") return setTime(0);
    if ((k === "delete" || k === "backspace") && S.keySel.length) return TL.deleteKeys();
  }
  if (k === "delete" && S.sel && S.mode === "setup") {
    const s = S.sel;
    const c = s.kind === "bone" ? { type: "bone.remove", name: s.name } : s.kind === "slot" ? { type: "slot.remove", name: s.name } : s.kind === "attachment" ? { type: "attachment.remove", slot: s.slot, name: s.name, skin: s.skin } : null;
    if (c && run(c)) select(null);
  }
  if ((k === "+" || k === "=" || k === "-") && S.sel?.kind === "slot") {
    const i = doc().slots.findIndex((x) => x.name === S.sel.name), n = e.shiftKey ? 5 : 1;
    run({ type: "slot.move", name: S.sel.name, index: i + (k === "-" ? -n : n) });
  }
});

// ---- state → UI --------------------------------------------------------------------------------
let saveTimer = 0;
S.hist.onChange = (_d, cmd) => {
  if (cmd?.type === "$reset") return emit("doc");
  S.dirty = true;
  $("xx-save-state").textContent = "chưa lưu";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (!S.locked) IO.saveLocal().catch((e) => toast("Tự lưu lỗi: " + e.message, true)); }, 1500);
  emit("doc");
};
on((what) => {
  if (what === "saved") { $("xx-save-state").textContent = "đã lưu " + new Date(S.savedAt).toLocaleTimeString("vi-VN", { hour12: false }); return; }
  if (["mode", "tools", "load", "doc", "all", "lock"].includes(what)) { renderTools(); renderMode(); }
  if (what === "load" || what === "doc" || what === "all") { const n = $("xx-name"); if (document.activeElement !== n) n.value = doc().name; }
  if (what === "load") { setTimeout(VP.fit, 30); S.pixelView = null; $("xx-pixel").checked = !!doc().pixelArt; }
  if (what === "sel") AG.renderChips();
});

// ---- loop --------------------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  TL.tick(dt);
  try { VP.draw(); TL.drawTimeline(); } catch (e) { if (!frame.err) { frame.err = true; console.error(e); window.__errors.push("draw: " + e.message); } }
  $("xx-metrics").textContent = VP.metrics();
  requestAnimationFrame(frame);
}

// ---- test hooks --------------------------------------------------------------------------------
window.__BS = {
  S, doc, emit, select, setTime, setMode, setTool, fit: VP.fit, toScreen: VP.toScreen, pick: VP.pick, io: IO, agent: AG, openSample, importWhole,
  apply(cmds, label = "test") { return run(cmds, label); },
  undo: () => S.hist.undo(), redo: () => S.hist.redo(),
  pose: (t = S.time) => poseAtTime(t),
};

// ---- start -------------------------------------------------------------------------------------
async function start() {
  const sample = Q.get("sample");
  let last = null;
  try { last = localStorage.getItem("xx-last"); } catch {}
  if (sample === "empty") await IO.newProject();
  else if (sample) await openSample(sample);
  else if (last && (await IO.listLocal()).some((p) => p.id === last)) await IO.openLocal(last).catch(() => openSample("pharaoh"));
  else await openSample("pharaoh");
  renderTools(); renderMode(); renderTree(); renderProps();
  requestAnimationFrame(frame);
  window.__ready = true;
}
start().catch((e) => { window.__errors.push("start: " + e.message); console.error(e); window.__ready = true; });
