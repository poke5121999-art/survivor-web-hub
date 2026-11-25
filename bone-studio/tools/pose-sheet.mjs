// Extreme-pose review sheet: torso/head rotations rendered side by side with ONE shared frame box, so every cell
// has the same size and the ground line lines up (no transparent gaps between cells of different heights).
// node tools/pose-sheet.mjs <project dir> <out.png> [--poses "than:dau,…"]   default: 0:0,25:0,-25:0,0:30,0:-30,20:25,-20:-30
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderFrames, loadImages } from "../cli/bone-cli.mjs";
import { encodePNG } from "../cli/png.mjs";

const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error("thiếu tham số: node tools/pose-sheet.mjs <thư mục project> <out.png>"); process.exit(2); }
const pi = process.argv.indexOf("--poses");
const poses = (pi > 0 ? process.argv[pi + 1] : "0:0,25:0,-25:0,0:30,0:-30,20:25,-20:-30").split(",").map((s) => s.split(":").map(Number));
const doc = JSON.parse(readFileSync(join(dir, "doc.json"), "utf8"));
const track = (k) => poses.map((p, i) => ({ time: i, value: p[k], curve: "stepped" }));
doc.animations = { ...doc.animations, _poses: { bones: { than: { rotate: track(0) }, dau: { rotate: track(1) } } } };
const im = renderFrames(doc, loadImages(dir, doc), poses.map((_, i) => ({ anim: "_poses", time: i })), { pad: 30 });
writeFileSync(out, encodePNG(im));
console.log(`${out}: ${poses.length} tư thế, ${im.width}×${im.height}`);
