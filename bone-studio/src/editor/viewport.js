// Viewport: draws the skeleton with canvas2D, handles picking, gizmos, bone creation, pan and zoom.
import { S, doc, emit, skeleton, poseAtTime, editBone, currentLocal, select, selectedBones, toast, run, duration } from "./state.js?v=20261125c";
import { drawList, draw2d, worldToLocal, worldToParent, worldVertices, getAttachment, bounds, DEG } from "../../runtime/xuong.js?v=20261125c";

const cv = document.getElementById("xx-canvas");
const ctx = cv.getContext("2d");
let W = 0, H = 0, DPR = 1;
let drag = null, hover = null, mouse = { x: 0, y: 0, wx: 0, wy: 0 }, space = false;

export const toScreen = (wx, wy) => [(wx - S.view.x) * S.view.zoom + W / 2, H / 2 - (wy - S.view.y) * S.view.zoom];
export const toWorld = (sx, sy) => [(sx - W / 2) / S.view.zoom + S.view.x, (H / 2 - sy) / S.view.zoom + S.view.y];

function resize() {
  DPR = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
}
new ResizeObserver(resize).observe(cv);

export function fit() {
  const sk = skeleton();
  if (!sk) return;
  const pose = poseAtTime(S.time), list = drawList(sk, pose);
  let b = bounds(list);
  if (b.width < 1) {
    const xs = pose.bones.map((p) => p.wx), ys = pose.bones.map((p) => p.wy);
    b = { x: Math.min(...xs) - 100, y: Math.min(...ys) - 50, width: Math.max(...xs) - Math.min(...xs) + 200, height: Math.max(...ys) - Math.min(...ys) + 200 };
  }
  if (!W) resize();
  S.view.x = b.x + b.width / 2; S.view.y = b.y + b.height / 2;
  S.view.zoom = Math.max(0.05, Math.min(16, Math.min((W - 80) / b.width, (H - 120) / b.height)));
  S.view.fitted = true;
  emit("view");
}

// ---- drawing -----------------------------------------------------------------------------------
export function draw() {
  if (!W) resize();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#2a2c33";
  ctx.fillRect(0, 0, W, H);
  grid();
  const sk = skeleton();
  if (!sk) { ctx.fillStyle = "#e8504a"; ctx.fillText("Tài liệu lỗi: " + (doc() && "không dựng được skeleton"), 20, 40); return; }
  const pixel = S.pixelView ?? doc().pixelArt;
  const world = () => { ctx.setTransform(DPR * S.view.zoom, 0, 0, -DPR * S.view.zoom, DPR * (W / 2 - S.view.x * S.view.zoom), DPR * (H / 2 + S.view.y * S.view.zoom)); ctx.imageSmoothingEnabled = !pixel; };
  if (S.onion.on && S.mode === "animate" && S.anim && S.showImages) {
    const fps = doc().fps || 30, dur = duration();
    for (const [dir, n, tint] of [[-1, S.onion.before, "#ff5050"], [1, S.onion.after, "#50a0ff"]]) {
      for (let i = n; i >= 1; i--) {
        let t = S.time + dir * i * S.onion.step / fps;
        if (S.loop && dur > 0) t = ((t % dur) + dur) % dur; else if (t < 0 || t > dur) continue;
        const p = poseAtTime(t, { withOverrides: false });
        world();
        ghost(drawList(sk, p), tint, 0.22 * (1 - (i - 1) / (n + 1)));
      }
    }
  }
  const pose = poseAtTime(S.time);
  const list = drawList(sk, pose);
  world();
  if (S.showImages) draw2d(ctx, list, S.images);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // selection outline for slots / attachments
  const sel = S.sel;
  if (sel && (sel.kind === "slot" || sel.kind === "attachment")) {
    const d = list.find((x) => x.slot === (sel.slot ?? sel.name));
    if (d) outline(d.verts, "#4fb3ff");
  }
  if (hover?.kind === "slot" && hover.name !== sel?.name) { const d = list.find((x) => x.slot === hover.name); if (d) outline(d.verts, "rgba(79,179,255,.45)"); }
  if (S.showBones) drawBones(sk, pose);
  if (drag?.box) {
    ctx.strokeStyle = "#4fb3ff"; ctx.setLineDash([4, 3]);
    ctx.strokeRect(drag.box.x0, drag.box.y0, mouse.x - drag.box.x0, mouse.y - drag.box.y0);
    ctx.setLineDash([]);
  }
  if (drag?.create) {
    const [ax, ay] = toScreen(drag.create.wx, drag.create.wy);
    ctx.strokeStyle = "#f0a63a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); ctx.lineWidth = 1;
  }
  document.getElementById("xx-zoom").textContent = Math.round(S.view.zoom * 100) + "%";
}

const ghostCache = new Map();
function ghost(list, tint, alpha) {
  for (const d of list) {
    const src = S.images.get(d.image);
    if (!src) continue;
    const key = d.image + tint;
    let g = ghostCache.get(key);
    if (!g || g.src !== src) {
      const c = new OffscreenCanvas(src.width, src.height), x = c.getContext("2d");
      x.drawImage(src, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = tint; x.fillRect(0, 0, c.width, c.height);
      g = { src, c }; ghostCache.set(key, g);
    }
    draw2d(ctx, [{ ...d, image: "g", color: [1, 1, 1, alpha] }], new Map([["g", g.c]]));
  }
}

function grid() {
  const z = S.view.zoom;
  let step = 50;
  while (step * z < 40) step *= 2;
  while (step * z > 160) step /= 2;
  const [x0, y1] = toWorld(0, 0), [x1, y0] = toWorld(W, H);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.04)";
  ctx.beginPath();
  for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const [sx] = toScreen(x, 0); ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, H); }
  for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const [, sy] = toScreen(0, y); ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(W, Math.round(sy) + 0.5); }
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  const [ox, oy] = toScreen(0, 0);
  ctx.beginPath(); ctx.moveTo(0, Math.round(oy) + 0.5); ctx.lineTo(W, Math.round(oy) + 0.5); ctx.moveTo(Math.round(ox) + 0.5, 0); ctx.lineTo(Math.round(ox) + 0.5, H); ctx.stroke();
}

function outline(v, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i < v.length; i += 2) { const [x, y] = toScreen(v[i], v[i + 1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.stroke(); ctx.lineWidth = 1;
}

function drawBones(sk, pose) {
  const selected = new Set(selectedBones());
  const d = doc();
  sk.bones.forEach((b, i) => {
    if (b.hidden) return;
    const p = pose.bones[i], [x, y] = toScreen(p.wx, p.wy);
    const isSel = selected.has(b.name), isHover = hover?.kind === "bone" && hover.name === b.name;
    const col = isSel ? "#4fd0ff" : isHover ? "#ffffff" : "#" + (b.color ?? "989898ff").slice(0, 6);
    const len = b.length * Math.hypot(p.a, p.c) * S.view.zoom;
    if (len > 4) {
      const ang = Math.atan2(p.c, p.a), w = Math.min(7, Math.max(3, len * 0.12));
      const tx = x + Math.cos(ang) * len, ty = y - Math.sin(ang) * len, nx = -Math.sin(-ang) * w, ny = Math.cos(-ang) * w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(-ang) * w * 1.6 + nx, y + Math.sin(-ang) * w * 1.6 + ny); ctx.lineTo(tx, ty);
      ctx.lineTo(x + Math.cos(-ang) * w * 1.6 - nx, y + Math.sin(-ang) * w * 1.6 - ny); ctx.closePath();
      ctx.fillStyle = col + (isSel ? "" : "aa"); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, isSel ? 4.5 : 3.5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.stroke();
    if (isSel || isHover) { ctx.fillStyle = "#e8eaf0"; ctx.font = "11px system-ui"; ctx.fillText(b.name, x + 7, y - 7); }
  });
  // IK targets
  for (const c of d.ik ?? []) {
    const i = sk.boneIndex.get(c.target);
    if (i === undefined) continue;
    const [x, y] = toScreen(pose.bones[i].wx, pose.bones[i].wy);
    ctx.strokeStyle = "#f0a63a"; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y); ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 11); ctx.stroke();
  }
  // rotate gizmo ring on the selected bone
  if (S.sel?.kind === "bone" && (S.tool === "rotate" || S.tool === "scale" || S.tool === "translate")) {
    const i = sk.boneIndex.get(S.sel.name);
    if (i !== undefined) {
      const p = pose.bones[i], [x, y] = toScreen(p.wx, p.wy);
      ctx.strokeStyle = S.tool === "rotate" ? "rgba(240,166,58,.7)" : S.tool === "translate" ? "rgba(79,208,255,.7)" : "rgba(73,179,107,.8)";
      ctx.lineWidth = 1.5;
      if (S.tool === "rotate") { ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.stroke(); }
      else if (S.tool === "translate") { arrow(x, y, x + 40, y); arrow(x, y, x, y - 40); }
      else { const a = Math.atan2(p.c, p.a); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 44, y - Math.sin(a) * 44); ctx.stroke(); ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x + Math.cos(a) * 44 - 4, y - Math.sin(a) * 44 - 4, 8, 8); }
      ctx.lineWidth = 1;
    }
  }
}
function arrow(x0, y0, x1, y1) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.lineTo(x1 - 7 * Math.cos(a - 0.4), y1 - 7 * Math.sin(a - 0.4)); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 7 * Math.cos(a + 0.4), y1 - 7 * Math.sin(a + 0.4)); ctx.stroke();
}

// ---- picking -----------------------------------------------------------------------------------
export function pick(sx, sy, { bonesOnly = false } = {}) {
  const sk = skeleton();
  if (!sk) return null;
  const pose = poseAtTime(S.time), d = doc();
  let best = null, bd = 9;
  if (S.showBones) sk.bones.forEach((b, i) => {
    if (b.hidden || b.select === false) return;
    const p = pose.bones[i], [x, y] = toScreen(p.wx, p.wy);
    const len = b.length * Math.hypot(p.a, p.c) * S.view.zoom, a = Math.atan2(p.c, p.a);
    const tx = x + Math.cos(a) * len, ty = y - Math.sin(a) * len;
    const dist = segDist(sx, sy, x, y, tx, ty) - (Math.hypot(sx - x, sy - y) < 6 ? 3 : 0);
    if (dist < bd) { bd = dist; best = { kind: "bone", name: b.name }; }
  });
  if (best || bonesOnly || !S.showImages) return best;
  const [wx, wy] = toWorld(sx, sy);
  for (let n = pose.drawOrder.length - 1; n >= 0; n--) {
    const si = pose.drawOrder[n], s = sk.slots[si];
    if (s.hidden) continue;
    const att = getAttachment(d, S.skin, s.name, pose.slots[si].attachment);
    if (!att || (att.type && att.type !== "region" && att.type !== "mesh")) continue;
    const v = worldVertices(sk, pose, si, att);
    if (att.type === "mesh" ? inMesh(v, att.triangles, wx, wy) : inPoly(v, wx, wy)) {
      if (opaqueAt(att, s.name, pose, sk, si, wx, wy)) return { kind: "slot", name: s.name };
    }
  }
  return null;
}
function opaqueAt(att, slot, pose, sk, si, wx, wy) {
  const img = S.images.get(att.path ?? pose.slots[si].attachment);
  if (!img || att.type === "mesh") return true;
  const bone = pose.bones[sk.slots[si].boneIndex];
  const [lx, ly] = worldToLocal(bone, wx, wy);
  const r = -(att.rotation ?? 0) * DEG, dx = lx - (att.x ?? 0), dy = ly - (att.y ?? 0);
  const ax = (dx * Math.cos(r) - dy * Math.sin(r)) / (att.scaleX ?? 1), ay = (dx * Math.sin(r) + dy * Math.cos(r)) / (att.scaleY ?? 1);
  const u = ax / att.width + 0.5, v = 0.5 - ay / att.height;
  const data = alphaOf(img);
  if (!data) return true;
  const px = Math.floor(u * img.width), py = Math.floor(v * img.height);
  return px >= 0 && py >= 0 && px < img.width && py < img.height && data[(py * img.width + px) * 4 + 3] > 20;
}
const alphaCache = new WeakMap();
function alphaOf(img) {
  let a = alphaCache.get(img);
  if (!a) {
    try { const c = new OffscreenCanvas(img.width, img.height), x = c.getContext("2d"); x.drawImage(img, 0, 0); a = x.getImageData(0, 0, img.width, img.height).data; } catch { a = null; }
    alphaCache.set(img, a);
  }
  return a;
}
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
function inPoly(v, x, y) {
  let c = false;
  for (let i = 0, j = v.length - 2; i < v.length; j = i, i += 2) if ((v[i + 1] > y) !== (v[j + 1] > y) && x < ((v[j] - v[i]) * (y - v[i + 1])) / (v[j + 1] - v[i + 1]) + v[i]) c = !c;
  return c;
}
function inMesh(v, t, x, y) {
  for (let i = 0; i < t.length; i += 3) if (inPoly([v[t[i] * 2], v[t[i] * 2 + 1], v[t[i + 1] * 2], v[t[i + 1] * 2 + 1], v[t[i + 2] * 2], v[t[i + 2] * 2 + 1]], x, y)) return true;
  return false;
}

// ---- interaction -------------------------------------------------------------------------------
function boneWorld(name) {
  const sk = skeleton(), pose = poseAtTime(S.time), i = sk.boneIndex.get(name);
  return { sk, pose, i, p: pose.bones[i] };
}
function parentRot(sk, pose, i) { const pi = sk.bones[i].parentIndex; return pi < 0 ? 0 : Math.atan2(pose.bones[pi].c, pose.bones[pi].a) / DEG; }

cv.addEventListener("contextmenu", (e) => e.preventDefault());
cv.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const [wx, wy] = toWorld(sx, sy);
  S.view.zoom = Math.max(0.05, Math.min(32, S.view.zoom * Math.exp(-e.deltaY * 0.0015)));
  const [nx, ny] = toWorld(sx, sy);
  S.view.x += wx - nx; S.view.y += wy - ny;
  emit("view");
}, { passive: false });

cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId);
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const [wx, wy] = toWorld(sx, sy);
  if (e.button === 1 || e.button === 2 || space) { drag = { pan: true, sx, sy, vx: S.view.x, vy: S.view.y }; return; }
  if (S.locked) { const hit = pick(sx, sy); select(hit); return; }
  if (S.tool === "create" && S.mode === "setup") {
    const hit = pick(sx, sy);
    if (e.ctrlKey && hit?.kind === "slot") { drag = { pending: hit.name }; return; }
    drag = { create: { wx, wy, parent: S.sel?.kind === "bone" ? S.sel.name : S.sel?.kind === "slot" ? doc().slots.find((s) => s.name === S.sel.name)?.bone : doc().bones[0]?.name } };
    return;
  }
  const hit = pick(sx, sy, { bonesOnly: S.tool === "pose" });
  const add = e.ctrlKey || e.metaKey || e.shiftKey;
  const transformTool = ["rotate", "translate", "scale"].includes(S.tool);
  if (!hit && (add || !transformTool || !S.sel || !["bone", "slot"].includes(S.sel.kind))) { if (!add) select(null); drag = { box: { x0: sx, y0: sy } }; return; }
  if (hit) {
    const already = (hit.kind === "bone" && selectedBones().includes(hit.name) && S.sel?.kind === "bone") || (hit.kind === "slot" && S.sel?.kind === "slot" && S.sel.name === hit.name);
    if (!already || add) select(hit, add);
  }
  // start a transform drag on the selected bone (a slot drag moves its attachment in setup, its bone in animate)
  let bone = S.sel?.kind === "bone" ? S.sel.name : null;
  if (S.sel?.kind === "slot") {
    if (S.mode === "setup" && S.tool === "translate") { startAttachmentDrag(S.sel.name, wx, wy); return; }
    bone = doc().slots.find((s) => s.name === S.sel.name)?.bone;
  }
  if (!bone) return;
  const { sk, pose, i, p } = boneWorld(bone);
  S.hist.begin(`${S.tool} ${bone}`);
  drag = { bone, tool: S.tool, wx, wy, start: currentLocal(bone), p0: { ...p }, parentRot: parentRot(sk, pose, i), others: S.multi.map((n) => ({ name: n, start: currentLocal(n) })) };
});

function startAttachmentDrag(slot, wx, wy) {
  const d = doc(), s = d.slots.find((x) => x.name === slot);
  const att = getAttachment(d, S.skin, slot, s.attachment);
  if (!att) return;
  const { p } = boneWorld(s.bone);
  S.hist.begin(`move ${slot}`);
  drag = { att: { slot, name: s.attachment, skin: d.skins.find((k) => k.name === S.skin)?.attachments?.[slot]?.[s.attachment] ? S.skin : "default", x: att.x ?? 0, y: att.y ?? 0, bone: p }, wx, wy };
}

cv.addEventListener("pointermove", (e) => {
  const r = cv.getBoundingClientRect();
  mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  [mouse.wx, mouse.wy] = toWorld(mouse.x, mouse.y);
  if (!drag) { const h = pick(mouse.x, mouse.y); if (JSON.stringify(h) !== JSON.stringify(hover)) { hover = h; } return; }
  if (drag.pan) { S.view.x = drag.vx - (mouse.x - drag.sx) / S.view.zoom; S.view.y = drag.vy + (mouse.y - drag.sy) / S.view.zoom; return; }
  if (drag.box || drag.create || drag.pending) return;
  if (drag.att) {
    const a = drag.att, [lx0, ly0] = worldToLocal(a.bone, drag.wx, drag.wy), [lx1, ly1] = worldToLocal(a.bone, mouse.wx, mouse.wy);
    try { S.hist.runCoalesced({ type: "attachment.set", slot: a.slot, name: a.name, skin: a.skin, props: { x: rnd(a.x + lx1 - lx0), y: rnd(a.y + ly1 - ly0) } }, "att"); } catch (err) { toast(err.message, true); }
    return;
  }
  const { bone, tool, start, p0 } = drag;
  try {
    if (tool === "rotate" || tool === "pose") {
      const a0 = Math.atan2(drag.wy - p0.wy, drag.wx - p0.wx), a1 = Math.atan2(mouse.wy - p0.wy, mouse.wx - p0.wx);
      let delta = (a1 - a0) / DEG;
      if (tool === "pose") delta = a1 / DEG - drag.parentRot - start.rotation;
      if (e.shiftKey) delta = Math.round((start.rotation + delta) / 15) * 15 - start.rotation;
      const det = drag.p0.a * drag.p0.d - drag.p0.b * drag.p0.c;
      let rot = start.rotation + (det < 0 ? -delta : delta);
      if (S.mode === "setup") rot = ((rot % 360) + 360) % 360;
      editBone(bone, { rotation: rot }, { coalesce: "rot" });
      for (const o of drag.others) editBone(o.name, { rotation: o.start.rotation + delta }, { coalesce: "rot" });
    } else if (tool === "translate") {
      const sk = skeleton(), i = sk.boneIndex.get(bone);
      const pose = poseAtTime(S.time);
      const [ax, ay] = worldToParent(sk, pose, i, drag.wx, drag.wy), [bx, by] = worldToParent(sk, pose, i, mouse.wx, mouse.wy);
      let dx = bx - ax, dy = by - ay;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      editBone(bone, { x: start.x + dx, y: start.y + dy }, { coalesce: "tr" });
    } else if (tool === "scale") {
      const d0 = Math.hypot(drag.wx - p0.wx, drag.wy - p0.wy) || 1, d1 = Math.hypot(mouse.wx - p0.wx, mouse.wy - p0.wy);
      const f = d1 / d0;
      editBone(bone, e.shiftKey ? { scaleX: start.scaleX * f } : { scaleX: start.scaleX * f, scaleY: start.scaleY * f }, { coalesce: "sc" });
    }
  } catch (err) { toast(err.message, true); drag = null; S.hist.cancel(); }
});
const rnd = (v) => Math.round(v * 100) / 100;

cv.addEventListener("pointerup", (e) => {
  const d = drag;
  drag = null;
  if (!d) return;
  if (d.pan) return;
  if (d.box) {
    const x0 = Math.min(d.box.x0, mouse.x), x1 = Math.max(d.box.x0, mouse.x), y0 = Math.min(d.box.y0, mouse.y), y1 = Math.max(d.box.y0, mouse.y);
    if (x1 - x0 < 4 && y1 - y0 < 4) return;
    const sk = skeleton(), pose = poseAtTime(S.time), names = [];
    sk.bones.forEach((b, i) => { const [x, y] = toScreen(pose.bones[i].wx, pose.bones[i].wy); if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && !b.hidden) names.push(b.name); });
    if (names.length) { S.sel = { kind: "bone", name: names[names.length - 1] }; S.multi = names.slice(0, -1); emit("sel"); }
    return;
  }
  if (d.pending) return createFromSlot(d.pending);
  if (d.create) return createBone(d.create, e.shiftKey);
  if (d.bone || d.att) { S.hist.end(); emit("doc"); }
});

function uniqueBoneName(base) {
  const names = new Set(doc().bones.map((b) => b.name));
  let n = 1, name = base;
  while (names.has(name)) name = `${base}-${++n}`;
  return name;
}
function createBone(c, keepSel) {
  const parent = c.parent ?? doc().bones[0]?.name;
  const sk = skeleton(), pose = poseAtTime(0), pi = sk.boneIndex.get(parent), P = pose.bones[pi];
  const [lx, ly] = worldToLocal(P, c.wx, c.wy);
  const dx = mouse.wx - c.wx, dy = mouse.wy - c.wy, len = Math.hypot(dx, dy);
  const worldRot = Math.atan2(dy, dx) / DEG, pr = Math.atan2(P.c, P.a) / DEG;
  const name = uniqueBoneName("bone");
  const sc = Math.hypot(P.a, P.c) || 1;
  if (run({ type: "bone.add", name, parent, x: rnd(lx), y: rnd(ly), rotation: len * S.view.zoom > 5 ? rnd(worldRot - pr) : 0, length: len * S.view.zoom > 5 ? rnd(len / sc) : 0 }, "Tạo bone") && !keepSel) select({ kind: "bone", name });
}
// Ctrl+click an image with the Create tool: new bone at the image centre, image moves onto it, named after it
function createFromSlot(slotName) {
  const d = doc(), s = d.slots.find((x) => x.name === slotName), sk = skeleton(), pose = poseAtTime(0);
  const att = getAttachment(d, S.skin, slotName, s.attachment);
  if (!att) return;
  const si = sk.slotIndex.get(slotName), v = worldVertices(sk, pose, si, att);
  let cx = 0, cy = 0;
  for (let i = 0; i < v.length; i += 2) { cx += v[i]; cy += v[i + 1]; }
  cx /= v.length / 2; cy /= v.length / 2;
  const parent = S.sel?.kind === "bone" ? S.sel.name : d.bones[0].name, P = pose.bones[sk.boneIndex.get(parent)];
  const [lx, ly] = worldToLocal(P, cx, cy), name = uniqueBoneName(slotName);
  if (run([{ type: "bone.add", name, parent, x: rnd(lx), y: rnd(ly) }, { type: "slot.rebone", name: slotName, bone: name }], "Tạo bone từ ảnh")) select({ kind: "bone", name });
}

window.addEventListener("keydown", (e) => { if (e.code === "Space" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { space = true; } });
window.addEventListener("keyup", (e) => { if (e.code === "Space") space = false; });

export function metrics() {
  const d = doc(), sk = skeleton();
  const atts = d.skins.reduce((n, s) => n + Object.values(s.attachments).reduce((m, a) => m + Object.keys(a).length, 0), 0);
  return `${d.bones.length} bone · ${d.slots.length} slot · ${atts} attachment · ${Object.keys(d.images).length} ảnh${sk ? "" : " · LỖI"}  |  ${Math.round(mouse.wx)}, ${Math.round(mouse.wy)}`;
}
