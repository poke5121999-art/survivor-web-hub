// Test silhouettes for the auto split: flat backgrounds like the owner's image. Output samples/split-bench/*.png
import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePNG } from "../cli/png.mjs";
import { renderFrames, loadImages } from "../cli/bone-cli.mjs";
import { upscale } from "../src/split/pixels.js";

const HERE = dirname(fileURLToPath(import.meta.url)), OUT = join(HERE, "..", "samples", "split-bench");
const BG = [182, 196, 210, 255];
function canvas(w, h) { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) d.set(BG, i); return { width: w, height: h, data: d }; }
function ellipse(im, cx, cy, rx, ry, col, rot = 0, edge = [30, 28, 34]) {
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let y = Math.floor(cy - Math.max(rx, ry)); y <= cy + Math.max(rx, ry); y++) for (let x = Math.floor(cx - Math.max(rx, ry)); x <= cx + Math.max(rx, ry); x++) {
    if (x < 0 || y < 0 || x >= im.width || y >= im.height) continue;
    const dx = x - cx, dy = y - cy, u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry, d = u * u + v * v;
    if (d > 1) continue;
    const o = (y * im.width + x) * 4, k = d > 0.72 ? edge : col.map((v2, i) => (i < 3 ? v2 * (1 - 0.25 * (dy / ry + 1) / 2) : v2));
    im.data.set([...k.slice(0, 3), 255], o);
  }
}
// quadruped (fox-like), pixel art at 4x
const q = canvas(64, 44);
const fur = [214, 120, 52], dark = [150, 80, 36];
ellipse(q, 14, 30, 3, 9, dark, 0.15); ellipse(q, 22, 31, 3, 9, fur, -0.1);
ellipse(q, 40, 31, 3, 9, dark, 0.1); ellipse(q, 47, 30, 3, 9, fur, -0.15);
ellipse(q, 31, 22, 19, 8, fur);
ellipse(q, 52, 13, 8, 7, fur); ellipse(q, 59, 15, 4, 3, [240, 230, 220]); ellipse(q, 49, 6, 2, 4, dark, -0.3); ellipse(q, 55, 5, 2, 4, dark, 0.3);
ellipse(q, 7, 14, 9, 4, fur, -0.7); ellipse(q, 3, 9, 3, 3, [240, 230, 220]);
writeFileSync(join(OUT, "cao.png"), encodePNG(upscale(q, 4)));
// blob slime with a hat, pixel art at 5x
const b = canvas(40, 36);
ellipse(b, 20, 24, 17, 11, [90, 200, 120]); ellipse(b, 14, 21, 2, 3, [20, 30, 30]); ellipse(b, 25, 21, 2, 3, [20, 30, 30]);
ellipse(b, 20, 11, 9, 4, [120, 70, 160]); ellipse(b, 20, 6, 5, 6, [120, 70, 160]);
writeFileSync(join(OUT, "slime.png"), encodePNG(upscale(b, 5)));
// robo with sword, flattened render of the rig, 2x
const dir = join(HERE, "..", "samples", "robo"), doc = JSON.parse(readFileSync(join(dir, "doc.json"), "utf8"));
const r = renderFrames(doc, loadImages(dir, doc), [{ time: 0 }], { scale: 2, pad: 20, bg: BG });
writeFileSync(join(OUT, "robo.png"), encodePNG(r));
console.log("đã ghi cao.png, slime.png, robo.png");
