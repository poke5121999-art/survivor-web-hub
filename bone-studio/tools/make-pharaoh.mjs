// The owner's pharaoh: auto split with the vision skeleton, then idle / walk / attack keyed as commands.
// Output: samples/pharaoh/project/ (doc.json + images). Rerunnable.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePNG, encodePNG } from "../cli/png.mjs";
import { autoSplit } from "../src/split/index.js";
import { applyAll, emptyDoc } from "../src/commands.js";

const HERE = dirname(fileURLToPath(import.meta.url)), S = join(HERE, "..", "samples", "pharaoh");
const OUT = process.argv[2] ?? join(S, "project");

export function pharaohAnimations() {
  const C = [], E = [0.42, 0, 0.58, 1];
  const k = (anim, bone, prop, time, value, curve = E) => C.push({ type: "key.set", anim, track: { bone, prop }, time, value, curve });
  C.push({ type: "event.add", name: "buoc-chan" }, { type: "event.add", name: "phep", int: 25 });

  C.push({ type: "anim.add", name: "idle" });
  for (const [t, f] of [[0, 0], [0.8, 1], [1.6, 0]]) {
    k("idle", "hong", "translate", t, { x: 0, y: -3 * f });
    k("idle", "than", "rotate", t, 1.5 * f);
    k("idle", "dau", "rotate", t, -2 * f);
    k("idle", "tay-trai-tren", "rotate", t, 3 * f);
    k("idle", "tay-phai-tren", "rotate", t, -2 * f);
    k("idle", "vay", "rotate", t, -1.5 * f);
  }
  const flick = [[0, 1, 1, 0], [0.2, 0.9, 1.12, 4], [0.4, 1.06, 0.94, -3], [0.6, 0.94, 1.1, 2], [0.8, 1.04, 0.96, -4], [1.0, 0.92, 1.12, 3], [1.2, 1.05, 0.95, -2], [1.4, 0.95, 1.08, 2], [1.6, 1, 1, 0]];
  for (const [t, sx, sy, r] of flick) { k("idle", "lua", "scale", t, { x: sx, y: sy }, "linear"); k("idle", "lua", "rotate", t, r, "linear"); }

  C.push({ type: "anim.add", name: "walk" });
  // 1.0 s cycle; the character faces left, so forward is -x: a thigh swings forward with a negative rotation
  const legs = [[0, -22, 10, 0], [0.25, 0, 30, -4], [0.5, 22, 5, 0], [0.75, 0, 30, -4], [1.0, -22, 10, 0]];
  for (const [t, th, kn, bob] of legs) {
    k("walk", "chan-trai-dui", "rotate", t, th);
    k("walk", "chan-trai-ong", "rotate", t, th < 0 ? kn * 0.4 : kn);
    k("walk", "chan-phai-dui", "rotate", t, -th);
    k("walk", "chan-phai-ong", "rotate", t, th > 0 ? kn * 0.4 : kn === 30 ? 30 : kn);
    k("walk", "hong", "translate", t, { x: 0, y: bob });
    k("walk", "tay-trai-tren", "rotate", t, -th * 0.7);
    k("walk", "tay-phai-tren", "rotate", t, th * 0.25);
    k("walk", "than", "rotate", t, bob ? 2 : 0);
    k("walk", "vay", "rotate", t, -th * 0.35);
    k("walk", "dau", "rotate", t, bob ? -1.5 : 0);
  }
  for (const [t, sx] of [[0, 1], [0.25, 1.1], [0.5, 0.92], [0.75, 1.08], [1.0, 1]]) k("walk", "lua", "scale", t, { x: sx, y: 2 - sx }, "linear");
  C.push({ type: "key.set", anim: "walk", track: { event: true }, time: 0, value: { name: "buoc-chan" } });
  C.push({ type: "key.set", anim: "walk", track: { event: true }, time: 0.5, value: { name: "buoc-chan" } });

  C.push({ type: "anim.add", name: "attack" });
  // wind-up: staff raised high; strike: thrust forward-down; flame flares at the hit
  for (const [t, up, lo, body, fl, head, curve] of [
    [0, 0, 0, 0, 1, 0, E], [0.35, -40, -20, 6, 1.15, -4, [0.2, 0.6, 0.4, 1]], [0.5, 45, 25, -8, 1.8, 5, E], [0.7, 45, 25, -8, 1.4, 5, E], [1.2, 0, 0, 0, 1, 0, E],
  ]) {
    k("attack", "tay-phai-tren", "rotate", t, up, curve);
    k("attack", "tay-phai-duoi", "rotate", t, lo, curve);
    k("attack", "than", "rotate", t, body, curve);
    k("attack", "dau", "rotate", t, head, curve);
    k("attack", "lua", "scale", t, { x: fl, y: fl }, curve);
    k("attack", "tay-trai-tren", "rotate", t, -body * 1.5, curve);
    k("attack", "hong", "translate", t, { x: body * 0.8, y: -Math.abs(body) * 0.4 }, curve);
  }
  C.push({ type: "key.set", anim: "attack", track: { event: true }, time: 0.5, value: { name: "phep" } });
  return C;
}

export function buildPharaoh() {
  const src = decodePNG(readFileSync(join(S, "pharaoh-owner.png")));
  const skeleton = JSON.parse(readFileSync(join(S, "skeleton.json"), "utf8"));
  const r = autoSplit(src, { skeleton });
  const doc = applyAll(emptyDoc("Pharaoh"), [...r.commands, ...pharaohAnimations()]).doc;
  return { doc, parts: r.parts, split: r };
}

if (process.argv[1]?.endsWith("make-pharaoh.mjs")) {
  const { doc, parts } = buildPharaoh();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "images"), { recursive: true });
  for (const p of parts) if (p) writeFileSync(join(OUT, "images", `${p.name}.png`), encodePNG(p.image));
  writeFileSync(join(OUT, "doc.json"), JSON.stringify(doc, null, 1));
  console.log(`đã ghi ${OUT}: ${doc.bones.length} bone, ${doc.slots.length} slot, animation: ${Object.keys(doc.animations).join(", ")}`);
}
