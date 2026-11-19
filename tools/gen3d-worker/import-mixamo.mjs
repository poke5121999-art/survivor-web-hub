#!/usr/bin/env node
// Đổi thư mục FBX Mixamo ("Without Skin", skeleton Y Bot) thành clip glb + index.json rồi tải lên gen3d/mixamo/.
// Chạy lại được: clip đã đổi và đã tải lên (ghi trong <out>/state.json) thì bỏ qua, chỉ làm file mới.
//
//   node tools/gen3d-worker/import-mixamo.mjs --fbx D:\gen3d-mixamo\fbx --meta D:\gen3d-mixamo\motions.json [--out D:\gen3d-mixamo\glb] [--no-upload] [--limit N]
//
// Tên file FBX dạng <Tên>__<id8>.fbx; id8 khớp đầu id trong motions.json để lấy tên, mô tả, ảnh, GIF.
// Cần: npm install trong tools/gen3d-worker (three 0.160.0), ~/.gen3d-worker-key.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { uploadMixamo, workerKey, writeClipGlb } from "./glb-clip.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const { FBXLoader } = await import(pathToFileURL(join(HERE, "node_modules/three/examples/jsm/loaders/FBXLoader.js")).href);

const argv = process.argv.slice(2), A = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) A[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
if (!A.fbx) { console.error("thiếu --fbx <thư mục FBX>"); process.exit(2); }
const FBX = resolve(A.fbx), OUT = resolve(A.out ?? join(FBX, "..", "glb"));
const UPLOAD = !A["no-upload"], LIMIT = A.limit ? +A.limit : Infinity;
mkdirSync(OUT, { recursive: true });
const STATE = join(OUT, "state.json");
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const saveState = () => { writeFileSync(STATE + ".tmp", JSON.stringify(state)); renameSync(STATE + ".tmp", STATE); };

const meta = new Map();
if (A.meta) {
  const raw = JSON.parse(readFileSync(resolve(A.meta), "utf8"));
  for (const m of Array.isArray(raw) ? raw : raw.motions ?? Object.values(raw)) meta.set(String(m.id).slice(0, 8), m);
}

function convert(file) {
  const buf = readFileSync(file);
  const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), "");
  const clip = obj.animations[0];
  if (!clip) throw new Error("không có animation");
  const bones = [];
  obj.traverse((o) => { if (o.isBone) bones.push(o); });
  if (!bones.length) throw new Error("không có xương");
  const index = new Map(bones.map((b, i) => [b.name, i]));
  const nodes = bones.map((b) => ({
    name: b.name,
    t: b.position.toArray().map((v) => +v.toFixed(5)),
    r: b.quaternion.toArray().map((v) => +v.toFixed(7)),
    children: b.children.filter((c) => index.has(c.name)).map((c) => index.get(c.name)),
  }));
  const roots = bones.filter((b) => !index.has(b.parent?.name)).map((b) => index.get(b.name));
  const tracks = [];
  for (const t of clip.tracks) {
    const m = t.name.match(/^(.*)\.(quaternion|position)$/);
    if (!m || !index.has(m[1])) continue;
    tracks.push({ node: index.get(m[1]), path: m[2] === "quaternion" ? "rotation" : "translation", times: t.times, values: t.values });
  }
  return writeClipGlb({ name: basename(file, ".fbx"), nodes, roots, tracks });
}

const files = readdirSync(FBX).filter((f) => /\.fbx$/i.test(f)).sort();
const left = files.filter((f) => !state[basename(f, ".fbx")]?.uploaded || !UPLOAD);
const todo = left.slice(0, LIMIT);
console.log(`${files.length} FBX, đã xong ${files.length - left.length}, lần này làm ${todo.length}`);
const t0 = Date.now();
let pending = [], bytes = 0, errors = 0;

async function flush() {
  if (!pending.length) return;
  if (UPLOAD) {
    await uploadMixamo(pending.map((p) => ({ name: p.file, type: "model/gltf-binary", body: p.body })), workerKey());
    for (const p of pending) state[p.key].uploaded = true;
  }
  pending = [];
  saveState();
}

for (const [n, f] of todo.entries()) {
  const key = basename(f, ".fbx");
  const src = join(FBX, f);
  try {
    if (Date.now() - statSync(src).mtimeMs < 5000) { console.log(`bỏ qua ${f}: còn đang tải về`); continue; }
    const { glb, duration } = convert(src);
    const file = key.replace(/[^A-Za-z0-9._-]+/g, "-") + ".glb";
    writeFileSync(join(OUT, file), glb);
    const id8 = (key.match(/__([0-9a-f]{8})$/i) || [])[1];
    const m = meta.get(id8) ?? {};
    state[key] = {
      id: key, name: m.name ?? key.replace(/__[0-9a-f]{8}$/i, "").replace(/_/g, " "), file, duration: +duration.toFixed(3), inplace: false,
      ...(m.description ? { description: m.description } : {}), ...(m.thumbnail ? { thumb: m.thumbnail } : {}), ...(m.thumbnail_animated ? { gif: m.thumbnail_animated } : {}),
      bytes: glb.length, uploaded: false,
    };
    pending.push({ key, file, body: glb });
    bytes += glb.length;
  } catch (e) {
    errors++;
    console.log(`LỖI ${f}: ${e.message}`);
  }
  if (pending.length >= 50) await flush();
  if ((n + 1) % 100 === 0) console.log(`${n + 1}/${todo.length}, ${(bytes / 1e6).toFixed(1)} MB, ${Math.round((Date.now() - t0) / 1000)} s`);
}
await flush();

const index = Object.values(state).filter((s) => s.uploaded || !UPLOAD)
  .map(({ uploaded, bytes: _b, ...rest }) => rest).sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));
if (UPLOAD) await uploadMixamo([{ name: "index.json", type: "application/json", body: Buffer.from(JSON.stringify(index)) }], workerKey());
console.log(`xong: index ${index.length} clip, mới ${todo.length - errors}, lỗi ${errors}, ${(bytes / 1e6).toFixed(1)} MB, ${Math.round((Date.now() - t0) / 1000)} s`);
