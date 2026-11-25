import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { decodePNG, encodePNG } from "./png.mjs";
import { analyze, autoSplit } from "../src/split/index.js";
import { applyAll } from "../src/commands.js";

const HELP = `bone-cli split <lệnh>
  detect <ảnh.png>                       in nền, hệ số pixel và khung xương gợi ý (JSON, toạ độ pixel ảnh gốc)
  grid <ảnh.png> [--crop x,y,w,h] [--zoom 2] [--step 20] [--skeleton s.json] [--out f.png]
                                         ảnh phóng to có lưới toạ độ (và dấu + ở các khớp) để đọc toạ độ chính xác
  auto <ảnh.png> [--skeleton s.json] [--prefix p] [--no-fill]
                                         cắt part theo khung xương (mặc định: gợi ý tự động), thêm ảnh, bone, slot vào dự án
Khung xương: { "joints": { "tên": [x, y] }, "parts": [{ "name", "from", "to", "parent" }], "root": "tên khớp" }
  x, y theo pixel ảnh gốc (gốc trên-trái, y xuống). parts xếp theo thứ tự vẽ dưới → trên.
  parent "hong" là bone gốc split auto tự tạo ở khớp root; mỗi part thành một bone + slot + ảnh cùng tên.`;

export async function splitCli({ dir, doc, pos, opt, saveDoc, logEvent, die }) {
  const sub = pos[0];
  if (!sub || sub === "help") return console.log(HELP);
  const file = pos[1] ?? die("thiếu đường dẫn ảnh");
  const src = decodePNG(readFileSync(file));
  if (sub === "detect") {
    const a = analyze(src);
    const { heuristicSkeleton } = await import("../src/split/rig.js");
    const spec = heuristicSkeleton(a.native, a.scale, a.phase);
    return console.log(JSON.stringify({ size: [src.width, src.height], background: a.background, scale: a.scale, phase: a.phase, pixelArt: a.pixelArt, native: [a.native.width, a.native.height], skeleton: spec }, null, 1));
  }
  if (sub === "grid") {
    const { gridOverlay } = await import("../src/split/grid.js");
    const crop = typeof opt.crop === "string" ? opt.crop.split(",").map(Number) : undefined;
    const joints = opt.skeleton ? JSON.parse(readFileSync(opt.skeleton, "utf8")).joints : undefined;
    const out = gridOverlay(src, { zoom: +(opt.zoom ?? 2), step: +(opt.step ?? 20), crop, joints });
    const f = opt.out ?? join(dir, "grid.png");
    writeFileSync(f, encodePNG(out));
    return console.log(`đã ghi ${f} (${out.width}x${out.height}); số trên/trái là toạ độ pixel ảnh gốc`);
  }
  if (sub === "auto") {
    const skeleton = opt.skeleton ? JSON.parse(readFileSync(opt.skeleton, "utf8")) : undefined;
    const r = autoSplit(src, { skeleton, prefix: typeof opt.prefix === "string" ? opt.prefix : "", fill: !opt["no-fill"] });
    for (const p of r.parts) {
      if (!p) continue;
      const f = join(dir, "images", `${(typeof opt.prefix === "string" ? opt.prefix : "") + p.name}.png`);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, encodePNG(p.image));
    }
    let next;
    try { next = applyAll(doc, r.commands).doc; } catch (e) { die(e.message); }
    saveDoc(next);
    // the artist watches: bones first, then one part at a time
    const pre = r.commands.filter((c) => c.type === "doc.set" || c.type === "bone.add");
    logEvent({ kind: "cmds", cmds: pre, note: `dựng ${pre.length - 1} bone theo khung xương` });
    const rest = r.commands.filter((c) => !pre.includes(c));
    for (let i = 0; i < rest.length; i += 3) {
      const chunk = rest.slice(i, i + 3), img = chunk.find((c) => c.type === "image.add");
      await new Promise((res) => setTimeout(res, opt.fast ? 0 : 150));
      if (img) logEvent({ kind: "image", path: img.path });
      logEvent({ kind: "cmds", cmds: chunk, ...(i === 0 ? { note: "cắt từng part" } : {}) });
    }
    return console.log(`ok: ${r.parts.filter(Boolean).length} part, hệ số pixel ${r.scale}, lưới gốc ${r.native.width}x${r.native.height}, vẽ bù ${r.parts.reduce((s, p) => s + (p?.added ?? 0), 0)} pixel`);
  }
  die(`lệnh split lạ "${sub}"\n${HELP}`);
}
