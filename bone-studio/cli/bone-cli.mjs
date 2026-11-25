#!/usr/bin/env node
// bone-cli: the lever every actor uses. A project is a folder: doc.json + images/<path>.png (+ events.ndjson log).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { COMMANDS, applyAll, emptyDoc } from "../src/commands.js";
import { buildSkeleton, poseAt, drawList, bounds, animationDuration, getAttachment } from "../runtime/xuong.js";
import { decodePNG, encodePNG } from "./png.mjs";
import { createSurface, drawTriangles, drawLine } from "./raster.mjs";

const HELP = `bone-cli <lệnh> [--dir thư-mục-dự-án] ...

  new [--name tên]                 tạo doc.json rỗng
  info                             tóm tắt: cây bone, slot, skin, animation
  commands                         danh sách command và tham số
  apply '<json>' | --file f.json   áp một command hoặc mảng command (tất cả hoặc không gì), ghi doc.json
  render [--anim a] [--time s] [--out f.png] [--scale n] [--bones] [--size WxH]
  strip  --anim a [--frames n] [--out f.png] [--scale n] [--bones]   dải khung đều nhau trong animation
  import-image <file.png> [--path tên]   chép ảnh vào images/ và khai báo (image.add)
  split <lệnh>                     tự cắt ảnh nguyên con (xem: bone-cli split help)
  export --format xuong|spine --out thư-mục`;

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = {};
const pos = [];
for (let i = 1; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    const k = argv[i].slice(2), v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) opt[k] = true; else { opt[k] = v; i++; }
  } else pos.push(argv[i]);
}
const DIR = resolve(opt.dir ?? process.env.BONE_DIR ?? ".");
const DOC = join(DIR, "doc.json");
const die = (msg) => { console.error(`lỗi: ${msg}`); process.exit(1); };

export const loadDoc = (dir = DIR) => JSON.parse(readFileSync(join(dir, "doc.json"), "utf8"));
const saveDoc = (doc) => writeFileSync(DOC, JSON.stringify(doc, null, 1));
const logEvent = (e) => appendFileSync(join(DIR, "events.ndjson"), JSON.stringify({ t: Date.now(), ...e }) + "\n");

export function loadImages(dir, doc) {
  const m = new Map();
  for (const p of Object.keys(doc.images ?? {})) {
    const f = join(dir, "images", `${p}.png`);
    if (existsSync(f)) m.set(p, decodePNG(readFileSync(f)));
  }
  return m;
}

function info(doc) {
  const out = [`Dự án "${doc.name}", ${doc.fps} fps${doc.pixelArt ? ", pixel art" : ""}`, "Bone (cha → con, x y rot len):"];
  const kids = (p) => doc.bones.filter((b) => b.parent === p);
  const walk = (b, d) => {
    const slots = doc.slots.filter((s) => s.bone === b.name).map((s) => s.name);
    out.push(`${"  ".repeat(d + 1)}${b.name}  (${r(b.x)}, ${r(b.y)}) ${r(b.rotation)}° len ${r(b.length)}${b.scaleX !== 1 || b.scaleY !== 1 ? ` scale ${r(b.scaleX)},${r(b.scaleY)}` : ""}${slots.length ? `  slot: ${slots.join(", ")}` : ""}`);
    kids(b.name).forEach((k) => walk(k, d + 1));
  };
  kids(null).forEach((b) => walk(b, 0));
  out.push("Slot theo draw order (dưới → trên):");
  for (const s of doc.slots) {
    const atts = doc.skins.flatMap((k) => Object.keys(k.attachments[s.name] ?? {}).map((a) => (k.name === "default" ? a : `${k.name}:${a}`)));
    out.push(`  ${s.name} @${s.bone}  hiện: ${s.attachment ?? "(không)"}  có: ${atts.join(", ") || "-"}${s.blend !== "normal" ? `  blend ${s.blend}` : ""}`);
  }
  if (doc.ik?.length) out.push("IK: " + doc.ik.map((c) => `${c.name} [${c.bones.join(" > ")}] → ${c.target}`).join("; "));
  out.push(`Skin: ${doc.skins.map((s) => s.name).join(", ")}`);
  out.push(`Event: ${Object.keys(doc.events).join(", ") || "-"}`);
  out.push("Animation:");
  for (const [n, a] of Object.entries(doc.animations)) {
    const tracks = [...Object.entries(a.bones ?? {}).map(([b, t]) => `${b}.${Object.keys(t).join("/")}`), ...Object.entries(a.slots ?? {}).map(([s, t]) => `${s}.${Object.keys(t).join("/")}`)];
    out.push(`  ${n}: ${r(animationDuration(a))}s, ${tracks.length} track${tracks.length ? ` (${tracks.slice(0, 12).join(", ")}${tracks.length > 12 ? ", …" : ""})` : ""}`);
  }
  out.push(`Ảnh: ${Object.entries(doc.images).map(([p, i]) => `${p} ${i.width}x${i.height}`).join(", ") || "-"}`);
  return out.join("\n");
}
const r = (v) => Math.round(v * 100) / 100;

// Renders frames to one RGBA surface. frames: [{ anim, time }]
export function renderFrames(doc, images, frames, { scale = 1, bones = false, cols = frames.length, pad = 8, bg = [58, 60, 66, 255], fixed } = {}) {
  const sk = buildSkeleton(doc);
  const lists = frames.map((f) => { const pose = poseAt(sk, f.anim ? doc.animations[f.anim] : null, f.time ?? 0, f.skin); return { pose, list: drawList(sk, pose) }; });
  let bx = fixed;
  if (!bx) {
    const all = lists.flatMap((l) => l.list);
    const pts = lists.flatMap((l) => l.pose.bones.map((b) => ({ verts: [b.wx, b.wy] })));
    bx = bounds(all.length ? all.concat(bones ? pts : []) : pts);
    if (bx.width < 1) bx = { x: bx.x - 50, y: bx.y - 50, width: 100, height: 100 };
  }
  const cw = Math.ceil(bx.width * scale) + pad * 2, ch = Math.ceil(bx.height * scale) + pad * 2;
  const rows = Math.ceil(frames.length / cols);
  const surf = createSurface(cw * cols, ch * rows, bg);
  lists.forEach(({ pose, list }, n) => {
    const ox = (n % cols) * cw + pad, oy = Math.floor(n / cols) * ch + pad;
    const tx = (x) => ox + (x - bx.x) * scale, ty = (y) => oy + (bx.y + bx.height - y) * scale;
    for (const d of list) {
      const img = images.get(d.image);
      if (!img) continue;
      const v = new Float32Array(d.verts.length);
      for (let i = 0; i < v.length; i += 2) { v[i] = tx(d.verts[i]); v[i + 1] = ty(d.verts[i + 1]); }
      drawTriangles(surf, img, v, d.uvs, d.tris, d.color, d.blend, doc.pixelArt);
    }
    if (bones) {
      sk.bones.forEach((b, i) => {
        const p = pose.bones[i], len = b.length || 0;
        const x2 = p.wx + p.a * len, y2 = p.wy + p.c * len;
        drawLine(surf, tx(p.wx), ty(p.wy), tx(x2), ty(y2), [255, 210, 60, 0.9], 2);
        drawLine(surf, tx(p.wx) - 2, ty(p.wy), tx(p.wx) + 2, ty(p.wy), [255, 90, 60, 1], 3);
      });
    }
  });
  return surf;
}

function framesOf(doc, anim, n) {
  const a = doc.animations[anim] ?? die(`không có animation "${anim}"`);
  const d = animationDuration(a);
  return Array.from({ length: n }, (_, i) => ({ anim, time: n > 1 ? (d * i) / n : 0 }));
}

async function main() {
  if (!cmd || cmd === "help" || cmd === "--help") return console.log(HELP);
  if (cmd === "new") {
    mkdirSync(DIR, { recursive: true });
    if (existsSync(DOC) && !opt.force) die(`${DOC} đã có (thêm --force để ghi đè)`);
    saveDoc(emptyDoc(opt.name ?? "Nhân vật mới"));
    return console.log(`đã tạo ${DOC}`);
  }
  if (cmd === "commands") {
    return console.log(Object.entries(COMMANDS).filter(([, c]) => !c.internal).map(([k, c]) => `${k}\n    ${c.help}`).join("\n"));
  }
  if (!existsSync(DOC)) die(`không thấy ${DOC} (dùng --dir hoặc bone-cli new)`);
  const doc = loadDoc();
  if (cmd === "info") return console.log(info(doc));
  if (cmd === "apply") {
    const text = opt.file ? readFileSync(opt.file, "utf8") : pos[0] ?? die("thiếu JSON command");
    let cmds;
    try { cmds = JSON.parse(text); } catch (e) { die(`JSON hỏng: ${e.message}`); }
    if (!Array.isArray(cmds)) cmds = [cmds];
    let next;
    try { next = applyAll(doc, cmds).doc; } catch (e) { die(e.message); }
    saveDoc(next);
    logEvent({ kind: "cmds", cmds, note: opt.note ?? null });
    return console.log(`ok: áp ${cmds.length} command (${[...new Set(cmds.map((c) => c.type))].join(", ")})`);
  }
  if (cmd === "render" || cmd === "strip") {
    const images = loadImages(DIR, doc);
    const scale = +(opt.scale ?? 1);
    const frames = cmd === "render" ? [{ anim: opt.anim, time: +(opt.time ?? 0), skin: opt.skin }] : framesOf(doc, opt.anim ?? die("strip cần --anim"), +(opt.frames ?? 8));
    const surf = renderFrames(doc, images, frames, { scale, bones: !!opt.bones, cols: +(opt.cols ?? frames.length) });
    const out = resolve(opt.out ?? join(DIR, cmd === "render" ? "render.png" : "strip.png"));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, encodePNG(surf));
    return console.log(`đã ghi ${out} (${surf.width}x${surf.height})`);
  }
  if (cmd === "import-image") {
    const file = pos[0] ?? die("thiếu file PNG");
    const img = decodePNG(readFileSync(file));
    const path = opt.path ?? file.replace(/^.*[\\/]/, "").replace(/\.png$/i, "");
    const dest = join(DIR, "images", `${path}.png`);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(file));
    let next;
    try { next = applyAll(doc, [{ type: "image.add", path, width: img.width, height: img.height }]).doc; } catch (e) { die(e.message); }
    saveDoc(next);
    logEvent({ kind: "image", path });
    logEvent({ kind: "cmds", cmds: [{ type: "image.add", path, width: img.width, height: img.height }] });
    return console.log(`ok: ảnh ${path} ${img.width}x${img.height}`);
  }
  if (cmd === "split") {
    const { splitCli } = await import("./split-cli.mjs");
    return splitCli({ dir: DIR, doc, pos, opt, saveDoc, logEvent, die });
  }
  if (cmd === "export") {
    const { exportCli } = await import("./export-cli.mjs");
    return exportCli({ dir: DIR, doc, opt, die });
  }
  die(`lệnh lạ "${cmd}"\n${HELP}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("bone-cli.mjs")) main();
void getAttachment;
