// Draws a simple jointed robot in code, rigs it and keys idle/walk/attack, all through bone-cli commands.
// Output: samples/robo/ (doc.json + images/*.png). Rerunnable; same output every run.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePNG } from "../cli/png.mjs";
import { emptyDoc, applyAll } from "../src/commands.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(HERE, "..", "samples", "robo");

function part(w, h, fill, edge, shape = "rect", extra) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = (x + 0.5) / w * 2 - 1, cy = (y + 0.5) / h * 2 - 1;
    let d;
    if (shape === "ellipse") d = Math.hypot(cx, cy);
    else { const rx = Math.max(0, Math.abs(cx) - 0.6) / 0.4, ry = Math.max(0, Math.abs(cy) - (1 - 0.4 * w / h)) / (0.4 * w / h); d = Math.hypot(rx, ry); }
    if (d > 1) continue;
    const o = (y * w + x) * 4, c = d > 1 - 3 / Math.min(w, h) * 2 ? edge : fill;
    const shade = 1 - 0.18 * ((x / w) * 0.6 + (y / h) * 0.4);
    data[o] = c[0] * shade; data[o + 1] = c[1] * shade; data[o + 2] = c[2] * shade; data[o + 3] = 255;
    extra?.(x, y, data, o);
  }
  return { width: w, height: h, data };
}
const DARK = [40, 44, 52];
const PARTS = {
  head: part(44, 40, [236, 196, 120], DARK, "ellipse", (x, y, d, o) => { if ((Math.abs(x - 28) < 3 || Math.abs(x - 36) < 3) && Math.abs(y - 18) < 3) { d[o] = 30; d[o + 1] = 30; d[o + 2] = 40; } }),
  torso: part(40, 60, [70, 140, 200], DARK),
  "upper-arm": part(14, 34, [90, 170, 120], DARK),
  "lower-arm": part(12, 30, [110, 190, 140], DARK),
  hand: part(16, 16, [236, 196, 120], DARK, "ellipse"),
  thigh: part(16, 38, [120, 110, 170], DARK),
  shin: part(14, 36, [140, 130, 190], DARK),
  foot: part(28, 12, [60, 60, 70], DARK),
  sword: part(8, 64, [210, 215, 225], DARK),
};

const C = [];
const add = (c) => C.push(c);
for (const [p, img] of Object.entries(PARTS)) add({ type: "image.add", path: p, width: img.width, height: img.height });
add({ type: "doc.set", props: { name: "Robo mẫu" } });
// skeleton: y up, feet at y = 0
add({ type: "bone.add", name: "hip", x: 0, y: 78, rotation: 90, length: 10 });
add({ type: "bone.add", name: "torso", parent: "hip", x: 0, y: 0, rotation: 0, length: 52 });
add({ type: "bone.add", name: "head", parent: "torso", x: 54, length: 34 });
for (const side of ["back", "front"]) {
  const s = side === "back" ? -1 : 1;
  add({ type: "bone.add", name: `${side}-upper-arm`, parent: "torso", x: 48, y: 0, rotation: 180, length: 30 });
  add({ type: "bone.add", name: `${side}-lower-arm`, parent: `${side}-upper-arm`, x: 30, length: 26 });
  add({ type: "bone.add", name: `${side}-hand`, parent: `${side}-lower-arm`, x: 27, length: 8 });
  add({ type: "bone.add", name: `${side}-thigh`, parent: "hip", x: 0, y: 6 * s, rotation: 180, length: 36 });
  add({ type: "bone.add", name: `${side}-shin`, parent: `${side}-thigh`, x: 36, length: 34 });
  add({ type: "bone.add", name: `${side}-foot`, parent: `${side}-shin`, x: 36, rotation: 90, length: 14 });
}
add({ type: "bone.add", name: "sword", parent: "front-hand", x: 4, rotation: 90, length: 60 });
// slots bottom → top
const slot = (name, bone, img, att) => {
  add({ type: "slot.add", name, bone, attachment: name });
  add({ type: "attachment.add", slot: name, name, attachment: { path: img, width: PARTS[img].width, height: PARTS[img].height, ...att } });
};
for (const side of ["back", "front"]) {
  if (side === "front") { slot("torso", "torso", "torso", { x: 24, rotation: -90 }); slot("head", "head", "head", { x: 18, rotation: -90 }); }
  slot(`${side}-thigh`, `${side}-thigh`, "thigh", { x: 18, rotation: 90 });
  slot(`${side}-shin`, `${side}-shin`, "shin", { x: 17, rotation: 90 });
  slot(`${side}-foot`, `${side}-foot`, "foot", { x: 4, y: -6, rotation: 0 });
  if (side === "front") slot("sword", "sword", "sword", { x: 30, rotation: 90 });
  slot(`${side}-upper-arm`, `${side}-upper-arm`, "upper-arm", { x: 14, rotation: 90 });
  slot(`${side}-lower-arm`, `${side}-lower-arm`, "lower-arm", { x: 13, rotation: 90 });
  slot(`${side}-hand`, `${side}-hand`, "hand", { x: 4 });
}
add({ type: "event.add", name: "footstep" });
add({ type: "event.add", name: "hit", int: 10 });

const key = (anim, bone, prop, time, value, curve) => add({ type: "key.set", anim, track: { bone, prop }, time, value, ...(curve ? { curve } : {}) });
const EASE = [0.42, 0, 0.58, 1];
// idle: breathing, 1.2 s loop
add({ type: "anim.add", name: "idle" });
for (const [t, dy, r] of [[0, 0, 0], [0.6, -2, 3], [1.2, 0, 0]]) {
  key("idle", "hip", "translate", t, { x: 0, y: dy }, EASE);
  key("idle", "head", "rotate", t, r, EASE);
  key("idle", "front-upper-arm", "rotate", t, -r, EASE);
  key("idle", "back-upper-arm", "rotate", t, r, EASE);
}
// walk: 0.8 s cycle, 12 frames at 15 fps
add({ type: "anim.add", name: "walk" });
const W = [[0, 25, -10, 0], [0.2, 0, 0, 3], [0.4, -25, -30, 0], [0.6, 0, -50, 3], [0.8, 25, -10, 0]];
for (const [t, th, sh, up] of W) {
  key("walk", "front-thigh", "rotate", t, th, EASE);
  key("walk", "front-shin", "rotate", t, sh, EASE);
  key("walk", "back-thigh", "rotate", t, -th, EASE);
  key("walk", "back-shin", "rotate", t, sh === -10 ? -30 : sh === -30 ? -10 : sh, EASE);
  key("walk", "front-upper-arm", "rotate", t, th * 0.8, EASE);
  key("walk", "back-upper-arm", "rotate", t, -th * 0.8, EASE);
  key("walk", "hip", "translate", t, { x: 0, y: up }, EASE);
}
add({ type: "key.set", anim: "walk", track: { event: true }, time: 0, value: { name: "footstep" } });
add({ type: "key.set", anim: "walk", track: { event: true }, time: 0.4, value: { name: "footstep" } });
// attack: wind-up, strike, recover
add({ type: "anim.add", name: "attack" });
for (const [t, ua, la, tor] of [[0, 0, 0, 0], [0.25, -150, -40, 10], [0.4, 60, 10, -15], [0.8, 0, 0, 0]]) {
  key("attack", "front-upper-arm", "rotate", t, ua, t === 0.25 ? [0.1, 0.8, 0.3, 1] : EASE);
  key("attack", "front-lower-arm", "rotate", t, la, EASE);
  key("attack", "torso", "rotate", t, tor, EASE);
}
add({ type: "key.set", anim: "attack", track: { event: true }, time: 0.4, value: { name: "hit" } });

export const SAMPLE_COMMANDS = C;
export function buildSample() { return applyAll(emptyDoc(), C).doc; }

if (process.argv[1]?.endsWith("make-sample.mjs")) {
  const doc = buildSample();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "images"), { recursive: true });
  for (const [p, img] of Object.entries(PARTS)) writeFileSync(join(OUT, "images", `${p}.png`), encodePNG(img));
  writeFileSync(join(OUT, "doc.json"), JSON.stringify(doc, null, 1));
  writeFileSync(join(OUT, "commands.json"), JSON.stringify(C));
  console.log(`đã ghi ${OUT}: ${doc.bones.length} bone, ${doc.slots.length} slot, ${Object.keys(doc.animations).length} animation, ${C.length} command`);
}
export { PARTS };
