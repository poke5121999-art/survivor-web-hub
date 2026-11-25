import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { exportBundle } from "../src/export.js";
import { loadImages } from "./bone-cli.mjs";
import { encodePNG } from "./png.mjs";

export function nodeIO(images) {
  return {
    size: (p) => images.get(p) ?? { width: 1, height: 1 },
    newPage: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    blit(page, p, x, y) {
      const im = images.get(p);
      if (!im) return;
      for (let r = 0; r < im.height; r++) page.data.set(im.data.subarray(r * im.width * 4, (r + 1) * im.width * 4), ((y + r) * page.width + x) * 4);
    },
    encode: (page) => new Uint8Array(encodePNG(page)),
  };
}
export async function exportCli({ dir, doc, opt, die }) {
  const format = opt.format ?? "xuong";
  if (!["xuong", "spine"].includes(format)) die("--format là xuong hoặc spine");
  const out = resolve(opt.out ?? join(dir, "export"));
  mkdirSync(out, { recursive: true });
  const files = await exportBundle(doc, nodeIO(loadImages(dir, doc)), { format });
  for (const f of files) writeFileSync(join(out, f.name), f.data);
  console.log(`đã xuất ${files.length} file vào ${out}: ${files.map((f) => f.name).join(", ")}`);
}
