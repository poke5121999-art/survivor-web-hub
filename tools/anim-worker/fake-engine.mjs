#!/usr/bin/env node
// Engine giả cho worker.mjs: cùng hợp đồng CLI với anim-gen nhưng chỉ dùng ffmpeg phóng/xoay/dịch nhẹ ảnh vào, 16 fps. Không cần GPU.
//   node fake-engine.mjs --engine <e> --image in.png --prompt "..." --seconds N --seed S [--steps N] [--remove-bg] --out DIR
// Biến môi trường: FAKE_SLEEP_MS (chờ thêm trước khi ghi, để thử huỷ job), FAKE_FAIL=1 (thoát mã 3 kèm một dòng stderr).
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const a = process.argv.slice(2), arg = {};
for (let i = 0; i < a.length; i++) {
  if (!a[i].startsWith("--")) continue;
  const k = a[i].slice(2);
  arg[k] = k === "remove-bg" ? true : a[++i];
}
const emit = (stage, step, total, msg) => process.stdout.write(JSON.stringify({ stage, step, total, msg }) + "\n");
const die = (msg, code = 2) => { process.stderr.write(msg + "\n"); process.exit(code); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!arg.image || !arg.out || !arg.prompt) die("thiếu --image, --prompt hoặc --out");
if (process.env.FAKE_FAIL) die("fake-engine: lỗi giả theo FAKE_FAIL", 3);

const FPS = 16, seconds = Math.min(5, Math.max(1, +arg.seconds || 2)), N = Math.round(FPS * seconds);
const seed = Number.isFinite(+arg.seed) ? +arg.seed : 0;
const t0 = Date.now();
const ff = (args) => spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8", windowsHide: true });

emit("load", 0, 1, `fake engine ${arg.engine ?? "auto"}, prompt: ${String(arg.prompt).slice(0, 80)}`);
const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", arg.image], { encoding: "utf8", windowsHide: true });
const m = /^(\d+)x(\d+)/.exec(pr.stdout.trim());
if (!m) die(`không đọc được kích thước ảnh ${arg.image}`);
let [w, h] = [+m[1], +m[2]];
const k = Math.min(1, 512 / Math.max(w, h));
w = Math.max(2, Math.round((w * k) / 2) * 2); h = Math.max(2, Math.round((h * k) / 2) * 2);
emit("load", 1, 1, `ảnh ${w}x${h}`);

const framesDir = join(arg.out, "frames");
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
const sleepMs = +(process.env.FAKE_SLEEP_MS ?? 0);
for (let t = 0, s = 0; t < sleepMs; t += 250, s++) { await sleep(250); emit("sample", s, Math.ceil(sleepMs / 250), "đang chờ giả"); }

// biên độ nhỏ, đổi theo seed: phóng ±4%, dịch ±3% chiều rộng, xoay ±2,5°
const ph = (seed % 628) / 100;
const z = `1+0.04*sin(2*PI*on/${N}+${ph.toFixed(2)})`;
const vf = [
  `scale=${w * 2}:${h * 2}:flags=lanczos`,
  `zoompan=z='${z}':x='iw/2-(iw/zoom/2)+${(w * 0.03).toFixed(1)}*sin(2*PI*on/${N})':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${FPS}`,
  "format=rgba",
  `rotate=a='0.044*sin(2*PI*n/${N}+${ph.toFixed(2)})':c=none:ow=iw:oh=ih`,
].join(",");
emit("sample", 0, 1, `${N} khung`);
const r = ff(["-loop", "1", "-i", arg.image, "-vf", vf, "-frames:v", String(N), join(framesDir, "%04d.png")]);
if (r.status !== 0) die(`ffmpeg lỗi: ${(r.stderr || "").trim().split("\n").pop()}`);
emit("sample", 1, 1, "xong khung");
const files = readdirSync(framesDir).filter((f) => f.endsWith(".png"));
emit("frames", files.length, files.length, `${files.length} khung PNG`);

const v = ff(["-framerate", String(FPS), "-i", join(framesDir, "%04d.png"), "-pix_fmt", "yuv420p", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2:color=white", join(arg.out, "video.mp4")]);
if (v.status !== 0) die(`ffmpeg video lỗi: ${(v.stderr || "").trim().split("\n").pop()}`);
emit("decode", 1, 1, "video.mp4");
writeFileSync(join(arg.out, "meta.json"), JSON.stringify({
  engine: "fake", fps: FPS, width: w, height: h, frames: files.length, seconds, seed,
  timings: { total: +((Date.now() - t0) / 1000).toFixed(2) },
}, null, 1));
