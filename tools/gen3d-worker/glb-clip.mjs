// Read/write "animation-only" GLB files for the Mixamo clip library (docs/gen3d-studio.md, Thử anim).
// A clip GLB holds the bone hierarchy (nodes with rest TRS, no mesh, no skin) and one animation.
// Rotations are stored as normalized int16 (glTF core allows it; three.js GLTFLoader dequantizes), translations as float.
import { readFileSync } from "node:fs";

const SUPA = "https://jvdguaecnllejdmgytia.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZGd1YWVjbmxsZWpkbWd5dGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDM3MTAsImV4cCI6MjEwMDgxOTcxMH0.oo1rodkh8_c7tBa-jptqHfemxmY9h8Q_r8DYrUYL9AI";

/** nodes: [{ name, t:[3], r:[4], children:[idx] }], roots: [idx], tracks: [{ node, path: "rotation"|"translation", times, values }] */
export function writeClipGlb({ name, nodes, roots, tracks }) {
  const chunks = [];
  let len = 0;
  const views = [], accessors = [];
  const add = (u8) => {
    const pad = (4 - (len % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); len += pad; }
    views.push({ buffer: 0, byteOffset: len, byteLength: u8.byteLength });
    chunks.push(u8); len += u8.byteLength;
    return views.length - 1;
  };
  const timeAcc = new Map();
  const timesAccessor = (times) => {
    const key = `${times.length}:${times[0]}:${times[times.length - 1]}`;
    if (timeAcc.has(key)) return timeAcc.get(key);
    const f = Float32Array.from(times);
    accessors.push({ bufferView: add(new Uint8Array(f.buffer)), componentType: 5126, count: f.length, type: "SCALAR", min: [f[0]], max: [f[f.length - 1]] });
    timeAcc.set(key, accessors.length - 1);
    return accessors.length - 1;
  };
  const samplers = [], channels = [];
  let duration = 0;
  for (const tr of tracks) {
    if (!tr.times.length) continue;
    duration = Math.max(duration, tr.times[tr.times.length - 1]);
    const input = timesAccessor(tr.times);
    let output;
    if (tr.path === "rotation") {
      const q = new Int16Array(tr.values.length);
      for (let i = 0; i < q.length; i++) q[i] = Math.round(Math.max(-1, Math.min(1, tr.values[i])) * 32767);
      accessors.push({ bufferView: add(new Uint8Array(q.buffer)), componentType: 5122, normalized: true, count: q.length / 4, type: "VEC4" });
    } else {
      const f = Float32Array.from(tr.values);
      accessors.push({ bufferView: add(new Uint8Array(f.buffer)), componentType: 5126, count: f.length / 3, type: "VEC3" });
    }
    output = accessors.length - 1;
    samplers.push({ input, output, interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node: tr.node, path: tr.path } });
  }
  const gltf = {
    asset: { version: "2.0", generator: "gen3d glb-clip" },
    scene: 0,
    scenes: [{ nodes: roots }],
    nodes: nodes.map((n) => ({ name: n.name, ...(n.t ? { translation: n.t } : {}), ...(n.r ? { rotation: n.r } : {}), ...(n.children?.length ? { children: n.children } : {}) })),
    animations: [{ name, samplers, channels }],
    accessors, bufferViews: views, buffers: [{ byteLength: len + ((4 - (len % 4)) % 4) }],
  };
  return { glb: packGlb(gltf, chunks, len), duration };
}

function packGlb(gltf, chunks, len) {
  const binPad = (4 - (len % 4)) % 4;
  let js = Buffer.from(JSON.stringify(gltf));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const total = 12 + 8 + js.length + 8 + len + binPad;
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(len + binPad, 0); binHead.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, js, binHead, ...chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)), Buffer.alloc(binPad)]);
}

export function readGlb(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} không phải GLB`);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString("utf8"));
  const bl = b.readUInt32LE(20 + jl);
  const bin = b.subarray(28 + jl, 28 + jl + bl);
  return { json, bin };
}

const COMP = { 5120: [Int8Array, 127], 5121: [Uint8Array, 255], 5122: [Int16Array, 32767], 5123: [Uint16Array, 65535], 5125: [Uint32Array, 0], 5126: [Float32Array, 0] };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
export function readAccessor({ json, bin }, i) {
  const a = json.accessors[i], v = json.bufferViews[a.bufferView];
  const [T, norm] = COMP[a.componentType];
  const n = a.count * SIZE[a.type];
  const off = bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0);
  const src = new T(bin.buffer.slice(off, off + n * T.BYTES_PER_ELEMENT));
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) out[k] = a.normalized && norm ? Math.max(src[k] / norm, -1) : src[k];
  return out;
}

// ---- tải lên bucket gen3d/mixamo qua function gen3d-studio (khoá worker) ----
export async function uploadMixamo(files, workerKey, { concurrency = 4, log = console.log } = {}) {
  // files: [{ name, type, body: Buffer }]
  const out = [];
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    const r = await retry(() => fetch(`${SUPA}/functions/v1/gen3d-studio`, {
      method: "POST",
      headers: { apikey: ANON, "content-type": "application/json", "x-gen3d-worker-key": workerKey },
      body: JSON.stringify({ action: "mixamo_upload_urls", files: batch.map((f) => ({ name: f.name, type: f.type })) }),
      signal: AbortSignal.timeout(60000),
    }).then(async (x) => { const j = await x.json(); if (!j.ok) throw new Error(j.error?.message ?? x.status); return j; }));
    let k = 0;
    const work = async () => {
      while (k < batch.length) {
        const idx = k++;
        const u = r.files[idx];
        await retry(() => fetch(u.uploadUrl, { method: "PUT", headers: { "content-type": batch[idx].type }, body: batch[idx].body, signal: AbortSignal.timeout(120000) })
          .then(async (x) => { if (!x.ok) throw new Error(`PUT ${x.status} ${await x.text()}`); }));
        out.push(batch[idx].name);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, work));
    log(`  đã tải lên ${Math.min(i + 50, files.length)}/${files.length}`);
  }
  return out;
}

async function retry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

export const PUBLIC_MIXAMO = `${SUPA}/storage/v1/object/public/gen3d/mixamo/`;
export function workerKey() {
  if (process.env.GEN3D_WORKER_KEY) return process.env.GEN3D_WORKER_KEY.trim();
  const home = process.env.USERPROFILE || process.env.HOME;
  return readFileSync(`${home}/.gen3d-worker-key`, "utf8").trim();
}
