// Tree and properties panels.
import { S, doc, emit, on, h, select, run, toast, currentLocal, editBone, keyState, PROP_FIELDS, selectedBones, skeleton } from "./state.js?v=20261125o";
import { getAttachment, parseColor, colorHex, INHERIT, BLENDS, animationDuration } from "../../runtime/xuong.js?v=20261125o";

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
  if (d.physics?.length) { out.push(group("Physics")); d.physics.forEach((c) => out.push(row(1, "≈", c.name, ["physics", c.name], { tag: c.bone }))); }
  if (d.transform?.length) { out.push(group("Transform")); d.transform.forEach((c) => out.push(row(1, "⇉", c.name, ["transform", c.name], { tag: `← ${c.target}` }))); }

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
// bounding box / clipping around the slot's current image (in the slot bone's space); clipping gets its own slot
// placed just under this one and ends at it, so it clips exactly this slot
function addShape(s, type) {
  const d = doc(), cur = s.attachment && getAttachment(d, S.skin, s.name, s.attachment);
  let verts = [-20, -20, 20, -20, 20, 20, -20, 20];
  if (cur && (cur.type ?? "region") === "region") {
    const r = (cur.rotation ?? 0) * Math.PI / 180, hw = (cur.width * (cur.scaleX ?? 1)) / 2, hh = (cur.height * (cur.scaleY ?? 1)) / 2;
    verts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].flatMap(([x, y]) => [Math.round(((cur.x ?? 0) + x * Math.cos(r) - y * Math.sin(r)) * 100) / 100, Math.round(((cur.y ?? 0) + x * Math.sin(r) + y * Math.cos(r)) * 100) / 100]);
  }
  const taken = Object.keys(d.skins.find((k) => k.name === "default").attachments[s.name] ?? {});
  if (type === "point") {
    const n = uniqueName(taken, "diem");
    const pt = cur && (cur.type ?? "region") === "region" ? { x: cur.x ?? 0, y: cur.y ?? 0 } : { x: 0, y: 0 };
    if (run([{ type: "attachment.add", slot: s.name, name: n, attachment: { type: "point", ...pt, rotation: 0 } }], "Thêm point")) toast(`Đã thêm point "${n}" vào slot ${s.name} (đổi ảnh đang hiện của slot để thấy)`);
    return;
  }
  if (type === "boundingbox") {
    const n = uniqueName(taken, "va-cham");
    if (run([{ type: "attachment.add", slot: s.name, name: n, attachment: { type: "boundingbox", vertexCount: 4, vertices: verts } }], "Thêm bounding box")) toast(`Đã thêm bounding box "${n}" vào slot ${s.name} (đổi ảnh đang hiện của slot để thấy)`);
    return;
  }
  const slot = uniqueName(d.slots.map((x) => x.name), `${s.name}-cat`), idx = d.slots.findIndex((x) => x.name === s.name);
  if (run([
    { type: "slot.add", name: slot, bone: s.bone, attachment: "cat" },
    { type: "slot.move", name: slot, index: idx },
    { type: "attachment.add", slot, name: "cat", attachment: { type: "clipping", end: s.name, vertexCount: 4, vertices: verts } },
  ], "Thêm clipping")) select({ kind: "attachment", slot, name: "cat", skin: "default" });
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
      S.mode === "setup" && b.length > 0 ? act("Tách đôi", () => { const nn = uniqueName(d.bones.map((x) => x.name), `${b.name}-2`); if (run({ type: "bone.split", name: b.name, at: 0.5, newName: nn }, "Tách bone")) select({ kind: "bone", name: nn }); }) : null,
      act("Chép transform", () => { const c = currentLocal(b.name); S.clipTransform = { rotation: c.rotation, x: c.x, y: c.y, scaleX: c.scaleX, scaleY: c.scaleY, shearX: c.shearX, shearY: c.shearY }; toast(`Đã chép transform của ${b.name}`); }),
      S.clipTransform ? act("Dán transform", () => {
        S.hist.begin("Dán transform"); // one undo step for every bone and channel
        for (const n of selectedBones()) for (const v of [["rotation"], ["x", "y"], ["scaleX", "scaleY"], ["shearX", "shearY"]]) editBone(n, Object.fromEntries(v.map((f) => [f, S.clipTransform[f]])));
        S.hist.end(); emit("doc");
      }) : null,
      S.mode === "setup" ? act("+ Physics", () => {
        const name = uniqueName((d.physics ?? []).map((c) => c.name), `${b.name}-lac`);
        if (run({ type: "physics.add", name, bone: b.name }, "Thêm physics")) { select({ kind: "physics", name }); toast("Physics chỉ chạy khi phát animation (Space)"); }
      }) : null,
      selectedBones().length >= 2 && S.mode === "setup" ? act("+ Transform", () => {
        // the bone clicked last is the target; the others copy its transform, keeping where they are now (offsets)
        const target = S.sel.name, bones = selectedBones().filter((n) => n !== target), name = uniqueName((d.transform ?? []).map((c) => c.name), `${bones[0]}-theo-${target}`);
        if (run({ type: "transform.add", name, bones, target, mixRotate: 1, mixX: 0, mixY: 0, mixScaleX: 0, mixScaleY: 0, mixShearY: 0, local: true, relative: true }, "Tạo transform")) select({ kind: "transform", name });
      }) : null,
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
    // tint black: texture black becomes this colour (two-colour tint); off = plain tint
    out.push(h("label", { class: "xx-chk", title: "Tint black: chỗ đen của ảnh thành màu tối này (tô hai màu)" }, h("input", { type: "checkbox", checked: !!s.dark, onchange: (e) => run({ type: "slot.set", name: s.name, props: { dark: e.target.checked ? "000000" : null } }) }), " Màu tối (tint black)"));
    if (s.dark) out.push(colorField("Màu tối", s.dark + "ff", (c) => animKeyed ? run({ type: "key.set", anim: S.anim, track: { slot: s.name, prop: "dark" }, time: S.time, value: c.slice(0, 6) }, "Key màu tối") : run({ type: "slot.set", name: s.name, props: { dark: c.slice(0, 6) } })));
    out.push(selectField("Blend", s.blend, BLENDS.map((m) => [m, { normal: "Thường", additive: "Cộng (sáng)", multiply: "Nhân", screen: "Screen" }[m]]), (m) => run({ type: "slot.set", name: s.name, props: { blend: m } })));
    const i = d.slots.indexOf(s);
    out.push(actions(
      act("▲ Lên", () => run({ type: "slot.move", name: s.name, index: i + 1 })),
      act("▼ Xuống", () => run({ type: "slot.move", name: s.name, index: i - 1 })),
      animKeyed ? act("Key draw order", () => run({ type: "key.set", anim: S.anim, track: { drawOrder: true }, time: S.time, value: d.slots.map((x) => x.name) }, "Key draw order")) : null,
      S.mode === "setup" ? act("+ Bounding box", () => addShape(s, "boundingbox")) : null,
      S.mode === "setup" ? act("+ Clipping", () => addShape(s, "clipping")) : null,
      S.mode === "setup" ? act("+ Point", () => addShape(s, "point")) : null,
      act("Xoá", () => { if (run({ type: "slot.remove", name: s.name })) select(null); }, true),
    ));
  } else if (sel.kind === "attachment") {
    const a = getAttachment(d, sel.skin, sel.slot, sel.name);
    if (!a) return propsEl.replaceChildren();
    out.push(title(a.linkedParent ? "linked mesh" : a.type ?? "region", sel.name));
    if (a.linkedParent) out.push(h("p", { class: "xx-note", text: `Dùng lưới${a.inheritDeform ? " và deform" : ""} của mesh "${a.linkedParent}"; sửa đỉnh ở mesh gốc.` }));
    const set = (props, live) => { const c = { type: "attachment.set", slot: sel.slot, name: sel.name, skin: sel.skin, props }; live ? S.hist.runCoalesced(c, "att") : run(c); };
    out.push(selectField("Ảnh", a.path ?? sel.name, Object.keys(d.images).map((p) => [p, p]), (p) => set({ path: p, width: d.images[p].width, height: d.images[p].height })));
    if ((a.type ?? "region") === "region") {
      out.push(pairField("Vị trí", a.x ?? 0, a.y ?? 0, (x, y, live) => set({ x, y }, live)));
      out.push(numField("Xoay", a.rotation ?? 0, (x, live) => set({ rotation: x }, live)));
      out.push(pairField("Scale", a.scaleX ?? 1, a.scaleY ?? 1, (x, y, live) => set({ scaleX: x, scaleY: y }, live), { step: 0.01, digits: 3 }));
      out.push(pairField("Kích thước", a.width, a.height, (x, y, live) => set({ width: Math.max(1, x), height: Math.max(1, y) }, live)));
    }
    // sequence: numbered images (lua1, lua2 … or lua01 …) played as frames of one attachment
    const seqFamily = (() => {
      const m = /^(.*?)(\d+)$/.exec(a.path ?? sel.name);
      if (!m || a.sequence) return null;
      const nums = Object.keys(d.images).map((p) => (p.startsWith(m[1]) ? /^(\d+)$/.exec(p.slice(m[1].length))?.[1] : null)).filter(Boolean);
      const vals = nums.map(Number).sort((x, y) => x - y), start = vals[0];
      let count = 0; while (vals.includes(start + count)) count++;
      return count >= 2 ? { prefix: m[1], start, count, digits: nums.every((n) => n.length === nums[0].length) && nums[0].length > 1 ? nums[0].length : 0 } : null;
    })();
    if (a.sequence) {
      const q = a.sequence;
      out.push(h("p", { class: "xx-note", text: `Sequence ${q.count} khung: ${a.path ?? sel.name}${String(q.start).padStart(q.digits, "0")} … ${a.path ?? sel.name}${String(q.start + q.count - 1).padStart(q.digits, "0")}` }));
      out.push(numField("Khung setup", q.setup, (v) => set({ sequence: { ...q, setup: Math.round(v) } })));
      if (S.mode === "animate" && S.anim) {
        const key = (mode) => run({ type: "key.set", anim: S.anim, track: { sequence: { skin: sel.skin, slot: sel.slot, attachment: sel.name } }, time: S.time, value: { mode, index: 0, delay: 1 / d.fps * 2 } }, "Key sequence");
        out.push(actions(act("Key: chạy lặp", () => key("loop")), act("Key: chạy một lần", () => key("once")), act("Key: qua lại", () => key("pingpong")), act("Key: đứng khung", () => key("hold"))));
      }
    }
    const slotBone = d.slots.find((x) => x.name === sel.slot)?.bone;
    const near = [slotBone, d.bones.find((b) => b.name === slotBone)?.parent, ...d.bones.filter((b) => b.parent === slotBone).map((b) => b.name)].filter((b) => b && b !== d.bones[0].name);
    const weighted = a.type === "mesh" && a.vertices.length > a.uvs.length;
    if (a.type === "mesh" && !a.linkedParent && S.mode === "setup") out.push(h("label", { class: "xx-chk", title: "Click trong mesh để thêm đỉnh, chọn đỉnh rồi Delete để xoá; lưới tự tam giác hoá lại" }, h("input", { type: "checkbox", checked: !!S.meshEdit, onchange: (e) => { S.meshEdit = e.target.checked; S.vsel = []; } }), " Sửa đỉnh (click thêm, Delete xoá)"));
    if (weighted && S.mode === "setup") {
      // weight tools: brush (drag on the viewport; Alt = remove), smooth, prune
      const infl = [...new Set((() => { const v = a.vertices, out2 = []; for (let j = 0; j < v.length;) { const c = v[j++]; for (let k = 0; k < c; k++, j += 4) out2.push(d.bones[v[j]]?.name); } return out2; })())].filter(Boolean);
      const choices = [...new Set([...infl, ...near])];
      out.push(h("div", { class: "xx-group", text: "Weight" }));
      out.push(selectField("Cọ cho bone", S.wb?.bone ?? "", [["", "— tắt cọ —"], ...choices.map((n) => [n, n])], (v) => { S.wb = v ? { bone: v, amount: S.wb?.amount ?? 0.1, radius: S.wb?.radius ?? 30 } : null; emit("sel"); }));
      if (S.wb) {
        out.push(numField("Mỗi nét", S.wb.amount, (v) => { S.wb.amount = Math.max(0.01, Math.min(1, v)); }, { step: 0.05 }));
        out.push(numField("Bán kính (px)", S.wb.radius, (v) => { S.wb.radius = Math.max(4, Math.min(200, v)); }, { step: 2 }));
        out.push(h("p", { class: "xx-note", text: "Kéo trên viewport để tô weight cho bone đã chọn (đỏ = 1, xanh = 0); giữ Alt để bớt." }));
      }
      out.push(actions(act("Làm mượt", () => run({ type: "mesh.smoothWeights", slot: sel.slot, name: sel.name, skin: sel.skin, iterations: 2 }, "Làm mượt weight")),
        act("Bỏ weight nhỏ", () => run({ type: "mesh.pruneWeights", slot: sel.slot, name: sel.name, skin: sel.skin, threshold: 0.05, maxPerVertex: 4 }, "Bỏ weight nhỏ"))));
    }
    if (a.type === "mesh") out.push(h("p", { class: "xx-note", text: `${a.uvs.length / 2} đỉnh, ${a.triangles.length / 3} tam giác${weighted ? ", đã gắn weight" : ""}. Kéo các ô vuông trên viewport để dời đỉnh${S.mode === "animate" ? " (thành key deform)" : ""}; Ctrl+click chọn nhiều.` }));
    out.push(actions(
      (a.type ?? "region") === "region" ? act("Chuyển thành mesh 4×4", () => run({ type: "mesh.fromRegion", slot: sel.slot, name: sel.name, skin: sel.skin, cols: 4, rows: 4 }, "Tạo mesh")) : null,
      (a.type ?? "region") === "region" ? act("Mesh theo viền", async () => {
        const src = S.images.get(a.path ?? sel.name);
        if (!src) return toast("Chưa có ảnh để dò viền", true);
        const { traceOutline, simplify } = await import("../mesh-trace.js?v=20261125o");
        const c = new OffscreenCanvas(src.width, src.height), g = c.getContext("2d"); g.drawImage(src, 0, 0);
        const img = g.getImageData(0, 0, c.width, c.height), poly = simplify(traceOutline(img), 1.5);
        if (poly.length < 3) return toast("Ảnh trong suốt hết, không dò được viền", true);
        run({ type: "mesh.fromOutline", slot: sel.slot, name: sel.name, skin: sel.skin, outline: poly.map(([x, y]) => [Math.round((x / c.width) * 1e4) / 1e4, Math.round((y / c.height) * 1e4) / 1e4]), spacing: 0.2 }, "Mesh theo viền");
      }) : null,
      a.type === "mesh" && near.length ? act(`Bind weight: ${near.join(", ")}`, () => run({ type: "mesh.bind", slot: sel.slot, name: sel.name, skin: sel.skin, bones: near }, "Bind weight")) : null,
      weighted ? act("Bỏ weight", () => run({ type: "mesh.unbind", slot: sel.slot, name: sel.name, skin: sel.skin }, "Bỏ weight")) : null,
      a.type === "mesh" && !a.linkedParent ? act("+ Linked mesh", () => {
        // same mesh and deform, another image (e.g. a second facial expression drawn on the same shape)
        const imgs = Object.keys(d.images).filter((p) => p !== (a.path ?? sel.name));
        const p = prompt(`Ảnh cho linked mesh (cùng lưới và deform với "${sel.name}"):\n${imgs.join(", ")}`, imgs[0] ?? "");
        if (!p) return;
        if (!d.images[p]) return toast(`không có ảnh "${p}"`, true);
        const taken = Object.keys(d.skins.find((k) => k.name === sel.skin)?.attachments?.[sel.slot] ?? {}), n = uniqueName(taken, p);
        if (run({ type: "attachment.add", slot: sel.slot, name: n, skin: sel.skin, attachment: { type: "linkedmesh", parent: sel.name, path: p, width: d.images[p].width, height: d.images[p].height } }, "Thêm linked mesh")) select({ kind: "attachment", slot: sel.slot, name: n, skin: sel.skin });
      }) : null,
      seqFamily ? act(`Thành sequence (${seqFamily.count} khung)`, () => set({ path: seqFamily.prefix, sequence: { count: seqFamily.count, start: seqFamily.start, digits: seqFamily.digits } })) : null,
      a.sequence ? act("Bỏ sequence", () => set({ path: (a.path ?? sel.name) + String(a.sequence.start + a.sequence.setup).padStart(a.sequence.digits, "0"), sequence: null })) : null,
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
  } else if (sel.kind === "physics") {
    const c = d.physics?.find((x) => x.name === sel.name);
    if (!c) return propsEl.replaceChildren();
    const set = (props) => run({ type: "physics.set", name: c.name, props });
    out.push(title("physics", c.name));
    out.push(h("p", { class: "xx-note", text: `Đầu bone ${c.bone} treo trên lò xo, đung đưa khi bone chuyển động. Chỉ chạy khi phát animation.` }));
    out.push(selectField("Bone", c.bone, d.bones.map((x) => [x.name, x.name]), (v) => set({ bone: v })));
    const F = { rotate: ["Áp lên xoay", 0.05, 1], x: ["Áp lên dời X", 0.05, 0], y: ["Áp lên dời Y", 0.05, 0], inertia: ["Quán tính", 0.05, 0.5], strength: ["Độ cứng", 5, 100], damping: ["Giảm nảy (1 = không nảy)", 0.05, 0.5], mass: ["Khối lượng", 0.1, 1], wind: ["Gió (X)", 10, 0], gravity: ["Trọng lực", 10, 0], mix: ["Mix", 0.05, 1] };
    for (const [k, [label, step, dflt]] of Object.entries(F)) out.push(numField(label, c[k] ?? dflt, (v) => set({ [k]: k === "mass" ? Math.max(0.01, v) : v }), { step }));
    out.push(actions(act("Xoá", () => { if (run({ type: "physics.remove", name: c.name })) select(null); }, true)));
  } else if (sel.kind === "transform") {
    const c = d.transform?.find((x) => x.name === sel.name);
    if (!c) return propsEl.replaceChildren();
    const set = (props) => run({ type: "transform.set", name: c.name, props });
    out.push(title("transform", c.name));
    out.push(h("p", { class: "xx-note", text: `Bone ${c.bones.join(", ")} chép transform của ${c.target}.` }));
    out.push(selectField("Target", c.target, d.bones.map((x) => [x.name, x.name]), (t) => set({ target: t })));
    const mode = `${c.local ? "local" : "world"}-${c.relative ? "rel" : "abs"}`;
    out.push(selectField("Kiểu", mode, [["world-abs", "Thế giới, trùng target"], ["world-rel", "Thế giới, cộng thêm"], ["local-abs", "Cục bộ, trùng target"], ["local-rel", "Cục bộ, cộng thêm"]], (m) => set({ local: m.startsWith("local"), relative: m.endsWith("rel") })));
    out.push(h("div", { class: "xx-group", text: S.mode === "animate" && S.anim ? `Mix (key ở ${S.time.toFixed(2)} s)` : "Mix (0..1)" }));
    const mixes = { mixRotate: "Xoay", mixX: "Dời X", mixY: "Dời Y", mixScaleX: "Scale X", mixScaleY: "Scale Y", mixShearY: "Shear Y" };
    for (const [k, label] of Object.entries(mixes)) out.push(numField(label, c[k] ?? 1, (v) => {
      v = Math.max(0, Math.min(1, v));
      if (S.mode === "animate" && S.anim) run({ type: "key.set", anim: S.anim, track: { transform: c.name }, time: S.time, value: { ...Object.fromEntries(Object.keys(mixes).map((m) => [m, c[m] ?? 1])), [k]: v } });
      else set({ [k]: v });
    }, { step: 0.05 }));
    if (S.mode === "setup") {
      out.push(h("div", { class: "xx-group", text: "Lệch thêm" }));
      for (const [k, label] of Object.entries({ rotation: "Xoay", x: "X", y: "Y", scaleX: "Scale X", scaleY: "Scale Y", shearY: "Shear Y" })) out.push(numField(label, c[k] ?? 0, (v) => set({ [k]: v })));
    }
    out.push(actions(act("Xoá", () => { if (run({ type: "transform.remove", name: c.name })) select(null); }, true)));
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
  const typing = propsEl.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (what !== "view" && !typing) renderProps();
});
void skeleton;
