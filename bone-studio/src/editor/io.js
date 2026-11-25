// Saving, loading, importing and exporting in the browser.
import { S, doc, emit, h, toast, run, skeleton } from "./state.js?v=20261125m";
import { emptyDoc } from "../commands.js?v=20261125m";
import { exportBundle, usedImages } from "../export.js?v=20261125m";
import { fromSpine } from "../spine-io.js?v=20261125m";
import { zip, unzip } from "../zip.js?v=20261125m";
import { encodeGIF } from "../gif.js?v=20261125m";
import { readPSD } from "../psd.js?v=20261125m";
import { parseAtlas, poseAt, drawList, draw2d, bounds, animationDuration, buildSkeleton } from "../../runtime/xuong.js?v=20261125m";

// ---- images ------------------------------------------------------------------------------------
export async function blobToCanvas(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0);
  bmp.close?.();
  return c;
}
export const canvasToBlob = (c) => new Promise((res) => c.toBlob(res, "image/png"));
export async function setImage(path, blob) {
  const c = await blobToCanvas(blob);
  S.images.set(path, c);
  S.blobs.set(path, blob);
  return c;
}
export function rgbaToCanvas(im) {
  const c = document.createElement("canvas");
  c.width = im.width; c.height = im.height;
  c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(im.data), im.width, im.height), 0, 0);
  return c;
}
export function canvasToRgba(c) {
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height);
  return { width: c.width, height: c.height, data: d.data };
}

// ---- IndexedDB ---------------------------------------------------------------------------------
const DB = "xuong-xuong", STORE = "projects";
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: "id" }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), st = t.objectStore(STORE);
    const out = fn(st);
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}
export async function saveLocal() {
  const d = doc();
  S.projectId ??= "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const images = {};
  for (const p of Object.keys(d.images)) if (S.blobs.has(p)) images[p] = S.blobs.get(p);
  const prev = await tx("readonly", (st) => st.get(S.projectId)).catch(() => null);
  const history = [...(prev?.history ?? []), { at: Date.now(), doc: prev?.doc }].filter((x) => x.doc).slice(-20);
  await tx("readwrite", (st) => st.put({ id: S.projectId, name: d.name, doc: d, images, updatedAt: Date.now(), history }));
  S.savedAt = Date.now(); S.dirty = false;
  try { localStorage.setItem("xx-last", S.projectId); } catch {}
  emit("saved");
}
export async function listLocal() {
  const all = await tx("readonly", (st) => st.getAll()).catch(() => []);
  return (all ?? []).map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, bones: p.doc?.bones?.length ?? 0 })).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function openLocal(id) {
  const p = await tx("readonly", (st) => st.get(id));
  if (!p) throw new Error("không thấy dự án trong máy");
  await loadProject(p.doc, p.images);
  S.projectId = id;
  try { localStorage.setItem("xx-last", id); } catch {}
}
export async function deleteLocal(id) { await tx("readwrite", (st) => st.delete(id)); }

export async function loadProject(d, images = {}) {
  S.images.clear(); S.blobs.clear();
  for (const [p, b] of Object.entries(images)) { try { await setImage(p, b instanceof Blob ? b : await (await fetch(b)).blob()); } catch { toast(`ảnh ${p} hỏng`, true); } }
  S.hist.reset(d);
  S.sel = null; S.multi = []; S.anim = Object.keys(d.animations)[0] ?? null; S.time = 0; S.overrides = {}; S.keySel = []; S.skin = "default";
  S.projectId = null; S.dirty = false; S.view.fitted = false;
  emit("load");
}
export async function newProject() { await loadProject(emptyDoc()); S.mode = "setup"; emit("mode"); }

// bundle for the agent and the cloud: { doc, images: { path: dataURL } }
export async function bundle() {
  const images = {};
  for (const p of Object.keys(doc().images)) {
    const b = S.blobs.get(p);
    if (b) images[p] = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
  }
  return { doc: doc(), images };
}

// ---- import ------------------------------------------------------------------------------------
const stripExt = (n) => n.replace(/\.(png|jpe?g|webp)$/i, "");
function uniquePath(base) { const d = doc(); let p = base, n = 1; while (d.images[p]) p = `${base}-${++n}`; return p; }
// files: File[] (may carry webkitRelativePath). Adds images and, if withSlots, one slot + region each on the root bone.
export async function importImages(files, { withSlots = true } = {}) {
  const pngs = [...files].filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name));
  if (!pngs.length) return toast("Không có ảnh PNG/JPEG/WebP", true);
  const cmds = [];
  const bone = S.sel?.kind === "bone" ? S.sel.name : doc().bones[0].name;
  for (const f of pngs) {
    const rel = (f.webkitRelativePath || f.name).split("/").slice(f.webkitRelativePath ? 1 : 0).join("/");
    const path = uniquePath(stripExt(rel).replace(/[^\p{L}\p{N}_/.-]+/gu, "-"));
    const c = await setImage(path, f);
    cmds.push({ type: "image.add", path, width: c.width, height: c.height });
    if (withSlots) {
      const slot = uniqueSlot(path.split("/").pop(), cmds);
      cmds.push({ type: "slot.add", name: slot, bone, attachment: path }, { type: "attachment.add", slot, name: path, attachment: { width: c.width, height: c.height, y: c.height / 2 } });
    }
  }
  if (run(cmds, `Nhập ${pngs.length} ảnh`)) toast(`Đã nhập ${pngs.length} ảnh`);
}
function uniqueSlot(base, pending) {
  const names = new Set([...doc().slots.map((s) => s.name), ...pending.filter((c) => c.type === "slot.add").map((c) => c.name)]);
  let n = base, i = 1;
  while (names.has(n)) n = `${base}-${++i}`;
  return n;
}
export async function replaceImage(path, file) {
  const c = await setImage(path, file);
  run([{ type: "image.add", path, width: c.width, height: c.height }], "Thay ảnh");
}

// Spine JSON + atlas (+ page PNGs), or a zip of them, or JSON + loose images.
export async function importSpine(files) {
  let list = [...files];
  const z = list.find((f) => /\.zip$/i.test(f.name));
  if (z) {
    const entries = await unzip(new Uint8Array(await z.arrayBuffer()), inflateRaw);
    list = entries.map((e) => new File([e.data], e.name.split("/").pop(), { type: /\.png$/i.test(e.name) ? "image/png" : "application/octet-stream" }));
  }
  const jf = list.find((f) => /\.json$/i.test(f.name));
  if (!jf) return toast("Cần file .json", true);
  const json = JSON.parse(await jf.text());
  if (json.format === "xuong") return importOwn(json, list);
  const { doc: d, warnings, version } = fromSpine(json, { name: stripExt(jf.name.replace(/\.json$/i, "")) });
  const images = {};
  const af = list.find((f) => /\.atlas(\.txt)?$/i.test(f.name));
  if (af) {
    const pages = parseAtlas(await af.text());
    for (const pg of pages) {
      const pf = list.find((f) => f.name === pg.name.split("/").pop());
      if (!pf) { warnings.push(`thiếu trang atlas ${pg.name}`); continue; }
      const page = await blobToCanvas(pf);
      for (const r of pg.regions) images[r.name] = await canvasToBlob(unpackRegion(page, r));
    }
  } else {
    for (const f of list) if (/\.(png|jpe?g|webp)$/i.test(f.name)) images[stripExt(f.name)] = f;
  }
  for (const [p, b] of Object.entries(images)) { const c = await blobToCanvas(b); d.images[p] = { width: c.width, height: c.height }; }
  const missing = usedImages({ ...d, images: Object.fromEntries(Object.keys(d.images).map((k) => [k, 1])) }).length;
  await loadProject(d, images);
  toast(`Đã mở JSON ${version}: ${d.bones.length} bone, ${Object.keys(d.animations).length} animation${warnings.length ? ` · ${warnings.length} cảnh báo` : ""}`);
  if (warnings.length) console.warn("Nhập JSON:", warnings), toast(warnings.slice(0, 3).join(" · "), true);
  void missing;
}
async function importOwn(json, list) {
  const images = {};
  const af = list.find((f) => /\.atlas$/i.test(f.name));
  if (af) for (const pg of parseAtlas(await af.text())) {
    const pf = list.find((f) => f.name === pg.name.split("/").pop());
    if (!pf) continue;
    const page = await blobToCanvas(pf);
    for (const r of pg.regions) images[r.name] = await canvasToBlob(unpackRegion(page, r));
  }
  await loadProject(json, images);
  toast(`Đã mở ${json.name}`);
}
// region on an atlas page → its own original-size image (undoes rotation and whitespace stripping)
export function unpackRegion(page, r) {
  const c = document.createElement("canvas");
  c.width = r.origW; c.height = r.origH;
  const g = c.getContext("2d"), top = r.origH - r.offY - r.h;
  if (r.rotate === 90) { g.save(); g.translate(r.offX, top + r.h); g.rotate(-Math.PI / 2); g.drawImage(page, r.x, r.y, r.h, r.w, 0, 0, r.h, r.w); g.restore(); }
  else g.drawImage(page, r.x, r.y, r.w, r.h, r.offX, top, r.w, r.h);
  return c;
}
async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
}

// ---- export ------------------------------------------------------------------------------------
export const browserIO = () => ({
  size: (p) => S.images.get(p) ?? { width: 1, height: 1 },
  newPage: (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; },
  blit: (page, p, x, y) => { const im = S.images.get(p); if (im) page.getContext("2d").drawImage(im, x, y); },
  encode: async (page) => new Uint8Array(await (await canvasToBlob(page)).arrayBuffer()),
});
export function download(name, data, type = "application/octet-stream") {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const slug = () => (doc().name || "skeleton").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "skeleton";
export async function exportData(format) {
  const files = await exportBundle(doc(), browserIO(), { format, base: slug() });
  download(`${slug()}-${format}.zip`, zip(files), "application/zip");
  return files;
}

// renders an animation to frames on canvases. opts: { anim, fps, scale, pad, background }
export function renderFrames({ anim, fps = doc().fps || 30, scale = 1, pad = 4, background = null, skin = S.skin } = {}) {
  const d = doc(), sk = buildSkeleton(d), a = anim ? d.animations[anim] : null;
  const dur = animationDuration(a), n = Math.max(1, Math.round(dur * fps)) + (a && dur > 0 ? 0 : 0);
  const times = Array.from({ length: n }, (_, i) => (dur > 0 ? (i / n) * dur : 0));
  let box = null;
  for (const t of times) { const b = bounds(drawList(sk, poseAt(sk, a, t, skin))); box = box ? union(box, b) : b; }
  const W = Math.ceil(box.width * scale) + pad * 2, H = Math.ceil(box.height * scale) + pad * 2;
  return times.map((t) => {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    if (background) { g.fillStyle = background; g.fillRect(0, 0, W, H); }
    g.setTransform(scale, 0, 0, -scale, pad - box.x * scale, pad + (box.y + box.height) * scale);
    g.imageSmoothingEnabled = !(S.pixelView ?? d.pixelArt);
    draw2d(g, drawList(sk, poseAt(sk, a, t, skin)), S.images);
    return c;
  });
}
const union = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }; };

export async function exportSequence(anim, opts) {
  const frames = renderFrames({ anim, ...opts }), files = [];
  for (const [i, c] of frames.entries()) files.push({ name: `${anim}_${String(i).padStart(3, "0")}.png`, data: new Uint8Array(await (await canvasToBlob(c)).arrayBuffer()) });
  download(`${slug()}-${anim}-png.zip`, zip(files), "application/zip");
}
export async function exportSheet(anim, opts) {
  const frames = renderFrames({ anim, ...opts }), fw = frames[0].width, fh = frames[0].height;
  const cols = Math.ceil(Math.sqrt(frames.length)), rows = Math.ceil(frames.length / cols);
  const c = document.createElement("canvas");
  c.width = cols * fw; c.height = rows * fh;
  const g = c.getContext("2d"), json = { frames: {}, meta: { app: "Xưởng Xương", image: `${slug()}-${anim}.png`, size: { w: c.width, h: c.height }, frameTags: [{ name: anim, from: 0, to: frames.length - 1, direction: "forward" }] } };
  const fps = opts?.fps ?? doc().fps ?? 30;
  frames.forEach((f, i) => {
    const x = (i % cols) * fw, y = Math.floor(i / cols) * fh;
    g.drawImage(f, x, y);
    json.frames[`${anim} ${i}`] = { frame: { x, y, w: fw, h: fh }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: fw, h: fh }, sourceSize: { w: fw, h: fh }, duration: Math.round(1000 / fps) };
  });
  const png = new Uint8Array(await (await canvasToBlob(c)).arrayBuffer());
  download(`${slug()}-${anim}-sheet.zip`, zip([{ name: `${slug()}-${anim}.png`, data: png }, { name: `${slug()}-${anim}.json`, data: new TextEncoder().encode(JSON.stringify(json, null, 1)) }]), "application/zip");
}
export async function exportWebM(anim, opts) {
  const frames = renderFrames({ anim, background: opts?.background ?? null, ...opts });
  const fps = opts?.fps ?? doc().fps ?? 30, c = document.createElement("canvas");
  c.width = frames[0].width; c.height = frames[0].height;
  const g = c.getContext("2d"), stream = c.captureStream(0), track = stream.getVideoTracks()[0];
  const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((res) => (rec.onstop = res));
  rec.start();
  for (const f of frames) { g.clearRect(0, 0, c.width, c.height); g.drawImage(f, 0, 0); track.requestFrame?.(); await new Promise((r) => setTimeout(r, 1000 / fps)); }
  rec.stop(); await done;
  download(`${slug()}-${anim}.webm`, new Blob(chunks, { type: "video/webm" }));
}
void skeleton;

export async function exportGIF(anim, opts) {
  const frames = renderFrames({ anim, ...opts }).map(canvasToRgba);
  const fps = opts?.fps ?? doc().fps ?? 30;
  download(`${slug()}-${anim}.gif`, encodeGIF(frames, { delayMs: 1000 / fps, loop: true }), "image/gif");
}

// PSD: every visible pixel layer becomes an image + slot + region on the root bone, placed where it sits on the canvas
// (canvas centre bottom = world origin), bottom layer drawn first.
export async function importPSD(file) {
  const psd = readPSD(new Uint8Array(await file.arrayBuffer()));
  const layers = psd.layers.filter((l) => l.visible && l.width && l.height);
  if (!layers.length) return toast("PSD không có lớp ảnh nào đang hiện", true);
  const cmds = [], bone = doc().bones[0].name;
  const BL = { normal: "normal", multiply: "multiply", screen: "screen", additive: "additive" };
  for (const l of layers) {
    const base = [...l.groupPath, l.name].join("/").replace(/[^\p{L}\p{N}_/.-]+/gu, "-") || "lop";
    const path = uniquePath(base);
    await setImage(path, await canvasToBlob(rgbaToCanvas(l.image)));
    const slot = uniqueSlot(path.split("/").pop(), cmds);
    const alpha = Math.round((l.opacity ?? 1) * 255).toString(16).padStart(2, "0");
    cmds.push({ type: "image.add", path, width: l.width, height: l.height },
      { type: "slot.add", name: slot, bone, attachment: path, color: "ffffff" + alpha, blend: BL[l.blend] ?? "normal" },
      { type: "attachment.add", slot, name: path, attachment: { width: l.width, height: l.height, x: l.left + l.width / 2 - psd.width / 2, y: psd.height - (l.top + l.height / 2) } });
  }
  if (run(cmds, `Nhập PSD ${file.name}`)) toast(`Đã nhập ${layers.length} lớp từ PSD`);
}
