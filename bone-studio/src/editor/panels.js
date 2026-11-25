// Tree and properties panels.
import { S, doc, emit, on, h, select, run, toast, currentLocal, editBone, keyState, PROP_FIELDS, selectedBones, skeleton } from "./state.js";
import { getAttachment, parseColor, colorHex, INHERIT, BLENDS, animationDuration } from "../../runtime/xuong.js";

const treeEl = document.getElementById("xx-tree"), propsEl = document.getElementById("xx-props"), findEl = document.getElementById("xx-find");
const collapsed = new Set();
let filter = "";
findEl.addEventListener("input", () => { filter = findEl.value.trim().toLowerCase(); renderTree(); });

// ---- tree --------------------------------------------------------------------------------------
const isSel = (kind, name, extra = {}) => S.sel?.kind === kind && S.sel.name === name && Object.entries(extra).every(([k, v]) => S.sel[k] === v) || (kind === "bone" && S.multi.includes(name));
function row(depth, icon, name, sel, { kids, key, hidden, onEye, tag, drag, drop } = {}) {
  const r = h("div", { class: "xx-row" + (isSel(...sel) ? " is-sel" : "") + (hidden ? " is-hidden" : ""), style: `padding-left:${4 + depth * 14}px`, title: name, "data-name": name },
    h("span", { class: "xx-tw", text: kids ? (collapsed.has(key) ? "▸" : "▾") : "", onclick: (e) => { e.stopPropagation(); if (!kids) return; collapsed.has(key) ? collapsed.delete(key) : collapsed.add(key); renderTree(); } }),
    h("span", { class: "xx-ic", text: icon }),
    h("span", { class: "xx-nm", text: name }),
    tag ? h("span", { class: "xx-tag", text: tag }) : null,
    onEye ? h("span", { class: "xx-eye", text: hidden ? "◌" : "●", title: "Ẩn/hiện (chỉ trong editor)", onclick: (e) => { e.stopPropagation(); onEye(); } }) : null);
  r.addEventListener("click", (e) => { select({ kind: sel[0], name: sel[1], ...(sel[2] ?? {}) }, e.ctrlKey || e.metaKey); });
  r.addEventListener("dblclick", () => { if (sel[0] === "anim") { S.mode = "animate"; S.anim = sel[1]; emit("mode"); } });
  if (drag) { r.draggable = true; r.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/xx", JSON.stringify(drag))); }
  if (drop) {
    r.addEventListener("dragover", (e) => { e.preventDefault(); r.classList.add("is-drop"); });
    r.addEventListener("dragleave", () => r.classList.remove("is-drop"));
    r.addEventListener("drop", (e) => { e.preventDefault(); r.classList.remove("is-drop"); try { drop(JSON.parse(e.dataTransfer.getData("text/xx"))); } catch {} });
  }
  return r;
}
const group = (title, ...buttons) => h("div", { class: "xx-group" }, h("span", { text: title }), h("span", {}, ...buttons));
const gbtn = (text, title, fn) => h("button", { text, title, onclick: fn });
const match = (n) => !filter || n.toLowerCase().includes(filter);

export function renderTree() {
  const d = doc(), out = [];
  out.push(group("Skeleton", gbtn("+ bone", "Tạo bone con của bone đang chọn", addChildBone)));
  const kids = (p) => d.bones.filter((b) => b.parent === p);
  const slotsOf = (b) => d.slots.filter((s) => s.bone === b);
  const subtreeMatches = (b) => match(b.name) || slotsOf(b.name).some((s) => match(s.name)) || kids(b.name).some(subtreeMatches);
  const walk = (b, depth) => {
    if (!subtreeMatches(b)) return;
    const key = "b:" + b.name, ks = kids(b.name), ss = slotsOf(b.name);
    out.push(row(depth, "🦴", b.name, ["bone", b.name], {
      kids: ks.length + ss.length, key, hidden: b.hidden, onEye: () => run({ type: "bone.set", name: b.name, props: { hidden: !b.hidden } }, "Ẩn bone"),
      drag: { kind: "bone", name: b.name },
      drop: (src) => {
        if (src.kind === "bone" && src.name !== b.name) run({ type: "bone.reparent", name: src.name, parent: b.name }, "Đổi cha");
        if (src.kind === "slot") run({ type: "slot.rebone", name: src.name, bone: b.name }, "Chuyển slot");
        if (src.kind === "image") addImageSlot(src.name, b.name);
      },
    }));
    if (collapsed.has(key) && !filter) return;
    for (const s of ss) {
      if (!match(s.name) && !match(b.name)) continue;
      const atts = d.skins.flatMap((k) => Object.keys(k.attachments[s.name] ?? {}).map((a) => ({ skin: k.name, name: a })));
      const sk = "s:" + s.name;
      out.push(row(depth + 1, "▭", s.name, ["slot", s.name], { kids: atts.length, key: sk, hidden: s.hidden, tag: s.attachment ? "" : "trống",
        onEye: () => run({ type: "slot.set", name: s.name, props: { hidden: !s.hidden } }, "Ẩn slot"), drag: { kind: "slot", name: s.name },
        drop: (src) => { if (src.kind === "image") addImageAttachment(src.name, s.name); } }));
      if (collapsed.has(sk) && !filter) continue;
      for (const a of atts) {
        if (a.skin !== "default" && a.skin !== S.skin) continue;
        out.push(row(depth + 2, s.attachment === a.name ? "◉" : "○", a.name, ["attachment", a.name, { slot: s.name, skin: a.skin }], { tag: a.skin === "default" ? "" : a.skin }));
      }
    }
    for (const k of ks) walk(k, depth + 1);
  };
  kids(null).forEach((b) => walk(b, 0));

  out.push(group("Draw order (trên cùng = vẽ sau)"));
  [...d.slots].reverse().filter((s) => match(s.name)).forEach((s) => out.push(row(1, "≡", s.name, ["slot", s.name], { drag: { kind: "order", name: s.name },
    drop: (src) => { if (src.kind === "order" && src.name !== s.name) run({ type: "slot.move", name: src.name, index: d.slots.findIndex((x) => x.name === s.name) }, "Đổi draw order"); } })));

  out.push(group("Ảnh", gbtn("+ nhập", "Nhập ảnh", () => window.XX.importDialog())));
  const used = new Set(d.skins.flatMap((k) => Object.entries(k.attachments).flatMap(([sl, m]) => Object.entries(m).map(([n, a]) => a.path ?? n))));
  Object.keys(d.images).filter(match).forEach((p) => out.push(row(1, used.has(p) ? "🟩" : "🟧", p, ["image", p], { tag: `${d.images[p].width}×${d.images[p].height}`, drag: { kind: "image", name: p } })));

  out.push(group("Skin", gbtn("+", "Thêm skin", () => { const n = prompt("Tên skin mới"); if (n) run({ type: "skin.add", name: n.trim() }, "Thêm skin"); })));
  d.skins.forEach((k) => out.push(row(1, S.skin === k.name ? "◉" : "○", k.name, ["skin", k.name])));

  out.push(group("Event", gbtn("+", "Thêm event", () => { const n = prompt("Tên event mới"); if (n) run({ type: "event.add", name: n.trim() }, "Thêm event"); })));
  Object.keys(d.events).forEach((n) => out.push(row(1, "⚑", n, ["event", n])));

  if (d.ik?.length) { out.push(group("IK")); d.ik.forEach((c) => out.push(row(1, "⟳", c.name, ["ik", c.name], { tag: `→ ${c.target}` }))); }

  out.push(group("Animation", gbtn("+", "Thêm animation", newAnim)));
  Object.keys(d.animations).filter(match).forEach((n) => out.push(row(1, S.anim === n ? "▶" : "▷", n, ["anim", n], { tag: `${animationDuration(d.animations[n]).toFixed(2)}s` })));

  treeEl.replaceChildren(...out);
  treeEl.querySelector(".is-sel")?.scrollIntoView({ block: "nearest" });
}

export function newAnim() {
  const n = prompt("Tên animation mới", "walk");
  if (!n) return;
  if (run({ type: "anim.add", name: n.trim() }, "Thêm animation")) { S.anim = n.trim(); S.mode = "animate"; S.time = 0; emit("mode"); }
}
function uniqueName(list, base) { let n = 1, x = base; while (list.includes(x)) x = `${base}-${++n}`; return x; }
function addChildBone() {
  const d = doc(), parent = selectedBones()[0] ?? d.bones[0].name, p = d.bones.find((b) => b.name === parent);
  const name = uniqueName(d.bones.map((b) => b.name), "bone");
  if (run({ type: "bone.add", name, parent, x: p.length || 0, length: 40 }, "Tạo bone")) select({ kind: "bone", name });
}
export function addImageSlot(path, bone) {
  const d = doc(), img = d.images[path], name = uniqueName(d.slots.map((s) => s.name), path.split("/").pop());
  bone = bone ?? selectedBones()[0] ?? d.bones[0].name;
  if (run([{ type: "slot.add", name, bone, attachment: path }, { type: "attachment.add", slot: name, name: path, attachment: { width: img.width, height: img.height } }], "Thêm ảnh")) select({ kind: "slot", name });
}
function addImageAttachment(path, slot) {
  const d = doc(), img = d.images[path];
  run([{ type: "attachment.add", slot, name: path, skin: S.skin, attachment: { width: img.width, height: img.height } }, { type: "slot.set", name: slot, props: { attachment: path } }], "Thêm attachment");
}

// ---- properties --------------------------------------------------------------------------------
function numField(label, value, commit, { step = 1, digits = 2, key } = {}) {
  const input = h("input", { type: "text", value: fmt(value, digits), spellcheck: "false" });
  const apply = () => {
    const raw = input.value.trim();
    let v = Number(raw.replace(",", "."));
    const m = raw.match(/^([+\-*/])\s*(-?[\d.]+)$/);
    if (m && isNaN(v)) { const a = +m[2]; v = m[1] === "+" ? value + a : m[1] === "-" ? value - a : m[1] === "*" ? value * a : value / a; }
    if (isFinite(v) && v !== value) commit(v); else input.value = fmt(value, digits);
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { apply(); input.blur(); } if (e.key === "Escape") { input.value = fmt(value, digits); input.blur(); } });
  input.addEventListener("blur", apply);
  const lab = h("label", { text: label, title: "Kéo ngang để đổi (Shift = tinh)" });
  lab.addEventListener("pointerdown", (e) => {
    lab.setPointerCapture(e.pointerId);
    const x0 = e.clientX, v0 = value;
    S.hist.begin(`đổi ${label}`);
    const move = (ev) => { const v = v0 + (ev.clientX - x0) * step * (ev.shiftKey ? 0.1 : 1); input.value = fmt(v, digits); try { commit(v, true); } catch (err) { toast(err.message, true); } };
    const up = () => { lab.removeEventListener("pointermove", move); lab.removeEventListener("pointerup", up); S.hist.end(); emit("doc"); };
    lab.addEventListener("pointermove", move); lab.addEventListener("pointerup", up);
  });
  return h("div", { class: "xx-field" }, lab, input, key ?? h("span"));
}
const fmt = (v, d) => (v == null ? "" : String(Math.round(v * 10 ** d) / 10 ** d));
function pairField(label, a, b, commit, opts = {}) {
  const f1 = numField("", a, (v, live) => commit(v, b, live), opts).querySelector("input");
  const f2 = numField("", b, (v, live) => commit(a, v, live), opts).querySelector("input");
  return h("div", { class: "xx-field" }, h("label", { text: label }), h("div", { class: "xx-two" }, f1, f2), opts.key ?? h("span"));
}
function keyBtn(bone, prop) {
  if (S.mode !== "animate" || !S.anim) return null;
  const st = keyState(bone, prop);
  return h("button", { class: "xx-keybtn" + (st === "key" ? " is-key" : st === "changed" ? " is-changed" : ""), title: st === "key" ? "Có key ở khung này (bấm để xoá)" : "Đặt key", onclick: () => {
    if (st === "key") run({ type: "key.remove", anim: S.anim, track: { bone, prop }, time: S.time }, "Xoá key");
    else { const was = S.autoKey; S.autoKey = true; const v = currentLocal(bone); editBone(bone, Object.fromEntries(PROP_FIELDS[prop].map((f) => [f, (S.overrides[bone]?.[f]) ?? v[f]]))); S.autoKey = was; }
  } });
}
function textField(label, value, commit) {
  const input = h("input", { type: "text", value: value ?? "", spellcheck: "false" });
  const apply = () => { const v = input.value.trim(); if (v && v !== value) commit(v); else input.value = value ?? ""; };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  input.addEventListener("blur", apply);
  return h("div", { class: "xx-field" }, h("label", { text: label }), input, h("span"));
}
function selectField(label, value, options, commit) {
  const s = h("select", { onchange: () => commit(s.value === "__none" ? null : s.value) }, ...options.map(([v, t]) => h("option", { value: v ?? "__none", text: t, selected: v === value })));
  return h("div", { class: "xx-field" }, h("label", { text: label }), s, h("span"));
}
function colorField(label, hex, commit, key) {
  const c = parseColor(hex);
  const inp = h("input", { type: "color", class: "xx-swatch", value: "#" + colorHex(c).slice(0, 6) });
  const alpha = h("input", { type: "range", min: 0, max: 255, value: Math.round(c[3] * 255), style: "width:100%" });
  const send = () => commit(inp.value.slice(1) + Number(alpha.value).toString(16).padStart(2, "0"));
  inp.addEventListener("change", send); alpha.addEventListener("change", send);
  return h("div", { class: "xx-field" }, h("label", { text: label }), h("div", { class: "xx-two", style: "grid-template-columns:30px 1fr" }, inp, alpha), key ?? h("span"));
}
const actions = (...b) => h("div", { class: "xx-actions" }, ...b);
const act = (text, fn, danger) => h("button", { text, onclick: fn, class: danger ? "is-danger" : "" });
const title = (kind, name) => h("h3", {}, h("span", { class: "xx-kind", text: kind }), name);

export function renderProps() {
  const d = doc(), sel = S.sel, out = [];
  if (!sel) {
    out.push(title("dự án", d.name));
    out.push(numField("FPS", d.fps, (v) => run({ type: "doc.set", props: { fps: Math.round(v) } }), { digits: 0 }));
    out.push(selectField("Pixel art", String(!!d.pixelArt), [["true", "Có (nearest, giữ lưới)"], ["false", "Không"]], (v) => run({ type: "doc.set", props: { pixelArt: v === "true" } })));
    out.push(h("p", { class: "xx-note", text: "Chọn một bone, slot hay ảnh để sửa. Kéo ảnh PNG vào viewport để thêm. N: tạo bone · C: xoay · V: dời · X: scale · B: pose · Tab: Setup/Animate · K: key." }));
  } else if (sel.kind === "bone") {
    const b = d.bones.find((x) => x.name === sel.name);
    if (!b) return propsEl.replaceChildren();
    const v = S.mode === "animate" && S.anim ? { ...currentLocal(b.name), ...(S.overrides[b.name] ?? {}) } : b;
    out.push(title("bone", b.name));
    out.push(textField("Tên", b.name, (to) => { if (run({ type: "bone.rename", name: b.name, to })) select({ kind: "bone", name: to }); }));
    if (b.parent !== null) out.push(selectField("Cha", b.parent, d.bones.filter((x) => x.name !== b.name).map((x) => [x.name, x.name]), (p) => run({ type: "bone.reparent", name: b.name, parent: p }, "Đổi cha")));
    const edit = (vals, live) => { try { editBone(b.name, vals, live ? { coalesce: "field" } : {}); } catch (e) { toast(e.message, true); } };
    out.push(numField("Xoay", v.rotation, (x, live) => edit({ rotation: x }, live), { key: keyBtn(b.name, "rotate") }));
    out.push(pairField("Vị trí", v.x, v.y, (x, y, live) => edit({ x, y }, live), { key: keyBtn(b.name, "translate") }));
    out.push(pairField("Scale", v.scaleX, v.scaleY, (x, y, live) => edit({ scaleX: x, scaleY: y }, live), { step: 0.01, digits: 3, key: keyBtn(b.name, "scale") }));
    out.push(pairField("Shear", v.shearX, v.shearY, (x, y, live) => edit({ shearX: x, shearY: y }, live), { key: keyBtn(b.name, "shear") }));
    if (S.mode === "setup") {
      out.push(numField("Dài", b.length, (x) => run({ type: "bone.set", name: b.name, props: { length: Math.max(0, x) } })));
      out.push(selectField("Thừa kế", b.inherit, INHERIT.map((m) => [m, { normal: "Đầy đủ", onlyTranslation: "Chỉ vị trí", noRotationOrReflection: "Không xoay/lật", noScale: "Không scale", noScaleOrReflection: "Không scale/lật" }[m]]), (m) => run({ type: "bone.set", name: b.name, props: { inherit: m } })));
      out.push(colorField("Màu", b.color ?? "989898ff", (c) => run({ type: "bone.set", name: b.name, props: { color: c } })));
    }
    out.push(actions(
      act("+ Bone con", addChildBone),
      S.mode === "setup" ? act("+ Slot", () => { const n = uniqueName(d.slots.map((s) => s.name), b.name); run({ type: "slot.add", name: n, bone: b.name }, "Thêm slot"); }) : act("Key tất cả (K)", () => window.XX.keyNow()),
      selectedBones().length === 2 ? act("+ IK 2 bone", () => window.XX.addIk()) : null,
      act("Xoá", () => { if (confirm(`Xoá bone "${b.name}" cùng bone con và slot của nó?`) && run({ type: "bone.remove", name: b.name })) select(null); }, true),
    ));
  } else if (sel.kind === "slot") {
    const s = d.slots.find((x) => x.name === sel.name);
    if (!s) return propsEl.replaceChildren();
    const atts = [...new Set(d.skins.flatMap((k) => Object.keys(k.attachments[s.name] ?? {})))];
    out.push(title("slot", s.name));
    out.push(textField("Tên", s.name, (to) => { if (run({ type: "slot.rename", name: s.name, to })) select({ kind: "slot", name: to }); }));
    out.push(selectField("Bone", s.bone, d.bones.map((x) => [x.name, x.name]), (bn) => run({ type: "slot.rebone", name: s.name, bone: bn }, "Chuyển slot")));
    const animKeyed = S.mode === "animate" && S.anim;
    out.push(selectField("Đang hiện", s.attachment, [[null, "(không)"], ...atts.map((a) => [a, a])], (a) => animKeyed
      ? run({ type: "key.set", anim: S.anim, track: { slot: s.name, prop: "attachment" }, time: S.time, value: a }, "Key attachment")
      : run({ type: "slot.set", name: s.name, props: { attachment: a } })));
    out.push(colorField("Màu", s.color, (c) => animKeyed ? run({ type: "key.set", anim: S.anim, track: { slot: s.name, prop: "rgba" }, time: S.time, value: c }, "Key màu") : run({ type: "slot.set", name: s.name, props: { color: c } })));
    out.push(selectField("Blend", s.blend, BLENDS.map((m) => [m, { normal: "Thường", additive: "Cộng (sáng)", multiply: "Nhân", screen: "Screen" }[m]]), (m) => run({ type: "slot.set", name: s.name, props: { blend: m } })));
    const i = d.slots.indexOf(s);
    out.push(actions(
      act("▲ Lên", () => run({ type: "slot.move", name: s.name, index: i + 1 })),
      act("▼ Xuống", () => run({ type: "slot.move", name: s.name, index: i - 1 })),
      animKeyed ? act("Key draw order", () => run({ type: "key.set", anim: S.anim, track: { drawOrder: true }, time: S.time, value: d.slots.map((x) => x.name) }, "Key draw order")) : null,
      act("Xoá", () => { if (run({ type: "slot.remove", name: s.name })) select(null); }, true),
    ));
  } else if (sel.kind === "attachment") {
    const a = getAttachment(d, sel.skin, sel.slot, sel.name);
    if (!a) return propsEl.replaceChildren();
    out.push(title(a.type ?? "region", sel.name));
    const set = (props, live) => { const c = { type: "attachment.set", slot: sel.slot, name: sel.name, skin: sel.skin, props }; live ? S.hist.runCoalesced(c, "att") : run(c); };
    out.push(selectField("Ảnh", a.path ?? sel.name, Object.keys(d.images).map((p) => [p, p]), (p) => set({ path: p, width: d.images[p].width, height: d.images[p].height })));
    out.push(pairField("Vị trí", a.x ?? 0, a.y ?? 0, (x, y, live) => set({ x, y }, live)));
    out.push(numField("Xoay", a.rotation ?? 0, (x, live) => set({ rotation: x }, live)));
    out.push(pairField("Scale", a.scaleX ?? 1, a.scaleY ?? 1, (x, y, live) => set({ scaleX: x, scaleY: y }, live), { step: 0.01, digits: 3 }));
    out.push(pairField("Kích thước", a.width, a.height, (x, y, live) => set({ width: Math.max(1, x), height: Math.max(1, y) }, live)));
    out.push(actions(
      act("Hiện trong slot", () => run({ type: "slot.set", name: sel.slot, props: { attachment: sel.name } })),
      act("Xoá", () => { if (run({ type: "attachment.remove", slot: sel.slot, name: sel.name, skin: sel.skin })) select({ kind: "slot", name: sel.slot }); }, true),
    ));
  } else if (sel.kind === "image") {
    const im = d.images[sel.name];
    if (!im) return propsEl.replaceChildren();
    out.push(title("ảnh", sel.name));
    const src = S.images.get(sel.name);
    if (src) { const c = h("canvas", { width: Math.min(280, im.width * 4), height: Math.min(160, im.height * 4), style: "background:#2a2c33;border-radius:4px;max-width:100%" }); const g = c.getContext("2d"); const k = Math.min(c.width / im.width, c.height / im.height); g.imageSmoothingEnabled = !d.pixelArt; g.drawImage(src, (c.width - im.width * k) / 2, (c.height - im.height * k) / 2, im.width * k, im.height * k); out.push(c); }
    out.push(h("p", { class: "xx-note", text: `${im.width} × ${im.height} px` }));
    out.push(actions(act("Tạo slot trên bone đang chọn", () => addImageSlot(sel.name)), act("Thay ảnh…", () => window.XX.replaceImage(sel.name)), act("Xoá", () => { if (run({ type: "image.remove", path: sel.name })) select(null); }, true)));
  } else if (sel.kind === "skin") {
    out.push(title("skin", sel.name));
    out.push(actions(act("Dùng skin này", () => { S.skin = sel.name; emit("doc"); }),
      sel.name !== "default" ? act("Đổi tên", () => { const n = prompt("Tên mới", sel.name); if (n && run({ type: "skin.rename", name: sel.name, to: n })) { if (S.skin === sel.name) S.skin = n; select({ kind: "skin", name: n }); } }) : null,
      sel.name !== "default" ? act("Xoá", () => { if (run({ type: "skin.remove", name: sel.name })) { S.skin = "default"; select(null); } }, true) : null));
    out.push(h("p", { class: "xx-note", text: "Kéo ảnh từ mục Ảnh thả lên một slot để thêm attachment vào skin đang dùng." }));
  } else if (sel.kind === "event") {
    const e = d.events[sel.name];
    if (!e) return propsEl.replaceChildren();
    out.push(title("event", sel.name));
    out.push(numField("Int", e.int, (v) => run({ type: "event.set", name: sel.name, props: { int: Math.round(v) } }), { digits: 0 }));
    out.push(numField("Float", e.float, (v) => run({ type: "event.set", name: sel.name, props: { float: v } })));
    out.push(textField("Chuỗi", e.string, (v) => run({ type: "event.set", name: sel.name, props: { string: v } })));
    out.push(actions(S.mode === "animate" && S.anim ? act("Key event ở khung này", () => run({ type: "key.set", anim: S.anim, track: { event: true }, time: S.time, value: { name: sel.name } }, "Key event")) : null,
      act("Xoá", () => { if (run({ type: "event.remove", name: sel.name })) select(null); }, true)));
  } else if (sel.kind === "anim") {
    const a = d.animations[sel.name];
    if (!a) return propsEl.replaceChildren();
    out.push(title("animation", sel.name));
    out.push(textField("Tên", sel.name, (to) => { if (run({ type: "anim.rename", name: sel.name, to })) { if (S.anim === sel.name) S.anim = to; select({ kind: "anim", name: to }); } }));
    out.push(h("p", { class: "xx-note", text: `Dài ${animationDuration(a).toFixed(2)} s (${Math.round(animationDuration(a) * d.fps)} khung)` }));
    out.push(actions(act("Mở để sửa", () => { S.anim = sel.name; S.mode = "animate"; emit("mode"); }),
      act("Nhân bản", () => { const n = prompt("Tên bản sao", sel.name + "-2"); if (n) run({ type: "anim.duplicate", name: sel.name, to: n }); }),
      act("Xoá", () => { if (confirm(`Xoá animation "${sel.name}"?`) && run({ type: "anim.remove", name: sel.name })) { if (S.anim === sel.name) S.anim = null; select(null); } }, true)));
  } else if (sel.kind === "ik") {
    const c = d.ik.find((x) => x.name === sel.name);
    if (!c) return propsEl.replaceChildren();
    out.push(title("ik", c.name));
    out.push(h("p", { class: "xx-note", text: `Bone: ${c.bones.join(" → ")}` }));
    out.push(selectField("Target", c.target, d.bones.map((x) => [x.name, x.name]), (t) => run({ type: "ik.set", name: c.name, props: { target: t } })));
    out.push(numField("Mix", c.mix, (v) => run({ type: "ik.set", name: c.name, props: { mix: Math.max(0, Math.min(1, v)) } }), { step: 0.01 }));
    out.push(numField("Softness", c.softness, (v) => run({ type: "ik.set", name: c.name, props: { softness: Math.max(0, v) } })));
    out.push(selectField("Gập", String(c.bendPositive), [["true", "Dương"], ["false", "Âm"]], (v) => run({ type: "ik.set", name: c.name, props: { bendPositive: v === "true" } })));
    out.push(selectField("Kéo dài", String(c.stretch), [["false", "Không"], ["true", "Có"]], (v) => run({ type: "ik.set", name: c.name, props: { stretch: v === "true" } })));
    out.push(actions(act("Xoá", () => { if (run({ type: "ik.remove", name: c.name })) select(null); }, true)));
  }
  propsEl.replaceChildren(...out);
}

on((what) => {
  if (what === "time" && S.sel?.kind !== "bone") return;
  if (what === "pose" && S.sel?.kind !== "bone") return;
  if (what !== "time" && what !== "pose" && what !== "view") renderTree();
  if (what !== "view" && !propsEl.contains(document.activeElement)) renderProps();
});
void skeleton;
