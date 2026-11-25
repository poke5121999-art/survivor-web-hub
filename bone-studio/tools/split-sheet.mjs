// Review sheet for the auto split: original | part labels | rebuilt setup pose (with bones) | cut parts.
// node tools/split-sheet.mjs <image.png> <out.png> [--skeleton s.json]
import { readFileSync, writeFileSync } from "node:fs";
import { decodePNG, encodePNG } from "../cli/png.mjs";
import { autoSplit } from "../src/split/index.js";
import { applyAll, emptyDoc } from "../src/commands.js";
import { renderFrames } from "../cli/bone-cli.mjs";
import { upscale, img } from "../src/split/pixels.js";

const [file, out] = process.argv.slice(2);
const sk = process.argv.indexOf("--skeleton");
const skeleton = sk > 0 ? JSON.parse(readFileSync(process.argv[sk + 1], "utf8")) : undefined;
const src = decodePNG(readFileSync(file));
const t0 = Date.now();
const r = autoSplit(src, { skeleton });
const ms = Date.now() - t0;

export function sheetFor(src, r) {
  const PAL = [[230, 80, 80], [80, 200, 120], [90, 140, 240], [240, 200, 60], [200, 90, 220], [60, 210, 220], [250, 140, 60], [150, 150, 255], [160, 230, 90], [255, 120, 180], [120, 90, 60], [200, 200, 200], [90, 90, 200], [40, 160, 90]];
  const { labels, w, h } = r.seg;
  const lab = img(w, h);
  for (let i = 0; i < w * h; i++) {
    if (labels[i] < 0) continue;
    const c = PAL[labels[i] % PAL.length], o = i * 4, s = r.native.data;
    lab.data.set([(c[0] * 2 + s[o]) / 3, (c[1] * 2 + s[o + 1]) / 3, (c[2] * 2 + s[o + 2]) / 3, 255], o);
  }
  const labUp = upscale(lab, r.scale);
  const doc = applyAll(emptyDoc(), r.commands).doc;
  const images = new Map(r.parts.filter(Boolean).map((p) => [p.name, p.image]));
  const rig = renderFrames(doc, images, [{ time: 0 }], { bones: true, pad: 4, bg: [40, 42, 48, 255] });
  // parts on a grid, each upscaled
  const cell = 120, cols = 7, rows = Math.ceil(r.parts.length / cols);
  const grid = img(cols * cell, rows * cell);
  for (let i = 0; i < grid.data.length; i += 4) grid.data.set([32, 34, 40, 255], i);
  r.parts.forEach((p, k) => {
    if (!p) return;
    const s = Math.min((cell - 8) / Math.max(p.image.width, p.image.height), 4);
    const up = upscale(p.image, s), ox = (k % cols) * cell + 4, oy = Math.floor(k / cols) * cell + 4, c = PAL[k % PAL.length];
    for (let y = 0; y < up.height; y++) for (let x = 0; x < up.width; x++) {
      const i = (y * up.width + x) * 4, o = ((oy + y) * grid.width + ox + x) * 4;
      if (up.data[i + 3]) grid.data.set(up.data.subarray(i, i + 4), o);
    }
    for (let x = 0; x < cell - 8; x++) grid.data.set([...c, 255], ((oy + cell - 9) * grid.width + ox + x) * 4);
  });
  const pieces = [src, labUp, rig];
  const W = pieces.reduce((s, p) => s + p.width + 8, 8), H = Math.max(...pieces.map((p) => p.height)) + 16 + grid.height;
  const sheet = img(Math.max(W, grid.width + 16), H);
  for (let i = 0; i < sheet.data.length; i += 4) sheet.data.set([24, 25, 30, 255], i);
  let x = 8;
  const blit = (p, ox, oy) => { for (let y = 0; y < p.height; y++) for (let xx = 0; xx < p.width; xx++) { const i = (y * p.width + xx) * 4, o = ((oy + y) * sheet.width + ox + xx) * 4; if (p.data[i + 3]) sheet.data.set(p.data.subarray(i, i + 4), o); } };
  for (const p of pieces) { blit(p, x, 8); x += p.width + 8; }
  blit(grid, 8, Math.max(...pieces.map((p) => p.height)) + 12);
  return sheet;
}

if (process.argv[1]?.endsWith("split-sheet.mjs")) {
  writeFileSync(out, encodePNG(sheetFor(src, r)));
  console.log(JSON.stringify({ ms, scale: r.scale, native: [r.native.width, r.native.height], parts: r.parts.map((p) => p && `${p.name}:${p.pixels}+${p.added}`), source: r.spec.source ?? "skeleton file" }));
}
