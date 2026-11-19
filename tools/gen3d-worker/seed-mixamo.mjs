#!/usr/bin/env node
// Dự phòng cho thư viện anim: tách clip của Soldier.glb + Xbot.glb (mẫu three.js, xương Mixamo) thành clip glb,
// tải lên gen3d/mixamo/seed-*.glb và seed-index.json (trang Thử anim dùng khi index.json chưa có). Chỉ ghi đè index.json khi --write-index (mặc định để yên index của import-mixamo.mjs).
//   node tools/gen3d-worker/seed-mixamo.mjs [--cache <dir>] [--write-index] [--no-upload]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readAccessor, readGlb, uploadMixamo, workerKey, writeClipGlb } from "./glb-clip.mjs";

const argv = process.argv.slice(2), A = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) A[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
const CACHE = resolve(A.cache ?? join(homedir(), "gen3d-worker", "cache"));
const SRC = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/";
mkdirSync(CACHE, { recursive: true });

async function fetchModel(name) {
  const p = join(CACHE, name);
  if (!existsSync(p)) {
    const r = await fetch(SRC + name, { signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`tải ${name} lỗi ${r.status}`);
    writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  }
  return p;
}

function clipsOf(model, glbPath) {
  const g = readGlb(glbPath), J = g.json;
  const joints = J.skins[0].joints;
  const local = new Map(joints.map((n, i) => [n, i]));
  const nodes = joints.map((n) => {
    const nd = J.nodes[n];
    return { name: nd.name, t: nd.translation, r: nd.rotation, children: (nd.children ?? []).filter((c) => local.has(c)).map((c) => local.get(c)) };
  });
  const isChild = new Set(nodes.flatMap((n) => n.children));
  const roots = nodes.map((_, i) => i).filter((i) => !isChild.has(i));
  return (J.animations ?? []).map((an) => {
    const tracks = [];
    for (const ch of an.channels) {
      if (!local.has(ch.target.node) || !["rotation", "translation"].includes(ch.target.path)) continue;
      const s = an.samplers[ch.sampler];
      tracks.push({ node: local.get(ch.target.node), path: ch.target.path, times: readAccessor(g, s.input), values: readAccessor(g, s.output) });
    }
    const { glb, duration } = writeClipGlb({ name: an.name, nodes, roots, tracks });
    const id = `seed-${model}-${an.name}`.replace(/[^A-Za-z0-9._-]+/g, "-");
    return { entry: { id, name: `${an.name} (${model})`, file: id + ".glb", duration: +duration.toFixed(3), inplace: false, description: `Clip mẫu từ ${model}.glb của three.js` }, glb };
  });
}

const all = [];
for (const m of ["Xbot", "Soldier"]) all.push(...clipsOf(m, await fetchModel(m + ".glb")));
const out = join(CACHE, "seed-clips");
mkdirSync(out, { recursive: true });
for (const c of all) writeFileSync(join(out, c.entry.file), c.glb);
const index = all.map((c) => c.entry);
writeFileSync(join(out, "index.json"), JSON.stringify(index, null, 1));
console.log(`${all.length} clip: ${index.map((e) => e.name).join(", ")}`);
if (!A["no-upload"]) {
  const files = all.map((c) => ({ name: c.entry.file, type: "model/gltf-binary", body: c.glb }));
  files.push({ name: "seed-index.json", type: "application/json", body: Buffer.from(JSON.stringify(index)) });
  if (A["write-index"]) files.push({ name: "index.json", type: "application/json", body: Buffer.from(JSON.stringify(index)) });
  await uploadMixamo(files, workerKey());
  console.log(`đã tải lên ${files.length} file vào gen3d/mixamo/${A["write-index"] ? " (kèm index.json)" : ""}`);
}
