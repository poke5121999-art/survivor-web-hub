// Splitter rules on the bench: headwear and hair stay with the head, the chest stays with the torso.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePNG } from "../cli/png.mjs";
import { autoSplit } from "../src/split/index.js";

const S = join(dirname(fileURLToPath(import.meta.url)), "..", "samples");
const load = (f) => decodePNG(readFileSync(join(S, f)));
const labelAt = (r, x, y) => { const c = Math.floor((x - r.phase[0]) / r.scale), q = Math.floor((y - r.phase[1]) / r.scale); return r.spec.parts[r.seg.labels[q * r.seg.w + c]]?.name; };

test("pharaoh: the whole nemes (top, both lappets, back flap), cobra and beard belong to the head; the chest to the torso", () => {
  const r = autoSplit(load("pharaoh/pharaoh-owner.png"), { skeleton: JSON.parse(readFileSync(join(S, "pharaoh/skeleton.json"), "utf8")) });
  const expect = { "dải khăn trái": [140, 158, "dau"], "dải khăn phải": [238, 158, "dau"], "vạt sau vai": [104, 112, "dau"], "rắn": [206, 32, "dau"],
    "râu": [204, 176, "dau"], "đỉnh khăn": [170, 60, "dau"], "ngực": [200, 215, "than"], "đai lưng": [200, 280, "than"] };
  for (const [what, [x, y, part]] of Object.entries(expect)) assert.equal(labelAt(r, x, y), part, what);
});

test("long hair hanging over the shoulders stays with the head (vision skeleton ≥ 98 %; offline heuristic reported)", () => {
  const src = load("split-bench/toc-dai.png");
  const share = (r) => {
    const n = r.native, head = r.spec.parts.findIndex((p) => p.name === "dau");
    let hair = 0, onHead = 0;
    for (let i = 0; i < n.width * n.height; i++) {
      const o = i * 4;
      if (n.data[o + 3] && Math.abs(n.data[o] - 150) < 12 && Math.abs(n.data[o + 1] - 70) < 12 && Math.abs(n.data[o + 2] - 200) < 12) { hair++; if (r.seg.labels[i] === head) onHead++; }
    }
    return { hair, share: onHead / hair };
  };
  const vision = share(autoSplit(src, { skeleton: JSON.parse(readFileSync(join(S, "split-bench/toc-dai.skeleton.json"), "utf8")) }));
  const offline = share(autoSplit(src));
  console.log(`tóc thuộc đầu: vision ${(vision.share * 100).toFixed(1)} %, offline ${(offline.share * 100).toFixed(1)} % (${vision.hair} pixel tóc)`);
  assert.ok(vision.hair > 100);
  assert.ok(offline.share >= 0.9, `offline ${offline.share}`);
  assert.ok(vision.share >= 0.98, `vision ${vision.share}`);
});
