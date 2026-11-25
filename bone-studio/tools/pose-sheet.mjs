// Extreme-pose review sheet: torso/head rotations rendered side by side with ONE shared frame box, so every cell
// has the same size and the ground line lines up (no transparent gaps between cells of different heights).
// node tools/pose-sheet.mjs <project dir> <out.png> [--poses "than:dau,…"]   default: 0:0,25:0,-25:0,0:30,0:-30,20:25,-20:-30
// node tools/pose-sheet.mjs <project dir> <out.png> --limbs   each limb raised/lowered to its extreme (upper arm ±120°,
//   forearm ±130°, thigh ±70°), one cell per bone and direction, setup pose first
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderFrames, loadImages } from "../cli/bone-cli.mjs";
import { encodePNG } from "../cli/png.mjs";

const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error("thiếu tham số: node tools/pose-sheet.mjs <thư mục project> <out.png>"); process.exit(2); }
if (process.argv.includes("--limbs")) {
  const doc = JSON.parse(readFileSync(join(dir, "doc.json"), "utf8"));
  const EXT = [[/^(.*-)?tay-.*-tren$/, 120], [/^(.*-)?tay-.*-duoi$/, 130], [/^(.*-)?chan-.*-dui$/, 70]];
  const cells = [{ label: "setup" }];
  for (const b of doc.bones) { const e = EXT.find(([re]) => re.test(b.name)); if (e) for (const s of [1, -1]) cells.push({ bone: b.name, value: s * e[1] }); }
  const bones = {};
  for (const c of cells) if (c.bone) bones[c.bone] = { rotate: cells.map((d, i) => ({ time: i, value: d.bone === c.bone ? d.value : 0, curve: "stepped" })) };
  doc.animations = { ...doc.animations, _limbs: { bones } };
  const im = renderFrames(doc, loadImages(dir, doc), cells.map((_, i) => ({ anim: "_limbs", time: i })), { pad: 30, cols: 5 });
  writeFileSync(out, encodePNG(im));
  console.log(`${out}: ${cells.map((c) => (c.bone ? `${c.bone} ${c.value > 0 ? "+" : ""}${c.value}°` : "setup")).join(" | ")}`);
  process.exit(0);
}
const pi = process.argv.indexOf("--poses");
const poses = (pi > 0 ? process.argv[pi + 1] : "0:0,25:0,-25:0,0:30,0:-30,20:25,-20:-30").split(",").map((s) => s.split(":").map(Number));
const doc = JSON.parse(readFileSync(join(dir, "doc.json"), "utf8"));
const track = (k) => poses.map((p, i) => ({ time: i, value: p[k], curve: "stepped" }));
doc.animations = { ...doc.animations, _poses: { bones: { than: { rotate: track(0) }, dau: { rotate: track(1) } } } };
const im = renderFrames(doc, loadImages(dir, doc), poses.map((_, i) => ({ anim: "_poses", time: i })), { pad: 30 });
writeFileSync(out, encodePNG(im));
console.log(`${out}: ${poses.length} tư thế, ${im.width}×${im.height}`);
