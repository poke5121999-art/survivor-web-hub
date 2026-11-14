// Voxel Lab - offline preview of a building generator: writes a PNG with front (-z), right side, top and an
// isometric view, coloured by the material palette, so a generator can be judged without the renderer.
// usage: node tools/preview-build.mjs <moduleFile> [seed] [out.png] [exportName]
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { colors, NAMES } from '../lib/materials.js';

const [, , file, seedArg = '1', out = 'preview.png', exportName] = process.argv;
const mod = await import(pathToFileURL(resolve(file)).href);
const gens = exportName ? [mod[exportName]] : (mod.default ? [].concat(mod.default) : Object.values(mod).filter(g => g && g.build));
const gen = gens[0];
const c = gen.build(+seedArg);
const { sx, sy, sz } = c;
const S = 3; // pixels per voxel in the orthographic views
const isoW = (sx + sz) * 2 + 4, isoH = sx + sz + sy * 2 + 4;
const W = Math.max(sx * S + sz * S + 30, sx * S + isoW + 30), H = sy * S + 20 + Math.max(sz * S, isoH) + 20;
const img = new Uint8Array(W * H * 3).fill(40);
const px = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; img[i] = r; img[i + 1] = g; img[i + 2] = b; };
const rect = (x, y, s, col, k) => { for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) px(x + i, y + j, col[0] * k, col[1] * k, col[2] * k); };
const col = m => [colors[m * 3], colors[m * 3 + 1], colors[m * 3 + 2]];
// front view: first solid along +z
for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) { const m = c.get(x, y, z); if (m) { rect(10 + x * S, 10 + (sy - 1 - y) * S, S, col(m), 1 - 0.5 * z / sz); break; } }
// right side view (looking along -x)
for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = sx - 1; x >= 0; x--) { const m = c.get(x, y, z); if (m) { rect(20 + sx * S + z * S, 10 + (sy - 1 - y) * S, S, col(m), 1 - 0.5 * (sx - 1 - x) / sx); break; } }
// top view
for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) for (let y = sy - 1; y >= 0; y--) { const m = c.get(x, y, z); if (m) { rect(10 + x * S, sy * S + 20 + (sz - 1 - z) * S, S, col(m), 0.5 + 0.5 * y / sy); break; } }
// isometric (painter's order: far to near), 2 px per voxel
const ox = 20 + sx * S, oy = sy * S + 20;
for (let y = 0; y < sy; y++) for (let z = sz - 1; z >= 0; z--) for (let x = 0; x < sx; x++) {
  const m = c.get(x, y, z); if (!m) continue;
  const top = !c.get(x, y + 1, z), left = !c.get(x, y, z - 1), right = !c.get(x + 1, y, z);
  if (!top && !left && !right) continue;
  const ix = ox + (x + (sz - 1 - z)) * 2, iy = oy + isoH - 4 - (sz - 1 - z) + x - y * 2 - sx;
  const k = top ? 1 : (left ? 0.8 : 0.62), cc = col(m);
  px(ix, iy, cc[0] * k, cc[1] * k, cc[2] * k); px(ix + 1, iy, cc[0] * k, cc[1] * k, cc[2] * k);
  px(ix, iy + 1, cc[0] * k * 0.9, cc[1] * k * 0.9, cc[2] * k * 0.9); px(ix + 1, iy + 1, cc[0] * k * 0.9, cc[1] * k * 0.9, cc[2] * k * 0.9);
}
// PNG encode
const crcT = new Int32Array(256).map((_, n) => { let c2 = n; for (let k = 0; k < 8; k++) c2 = c2 & 1 ? 0xedb88320 ^ (c2 >>> 1) : c2 >>> 1; return c2; });
const crc = b => { let c2 = -1; for (const v of b) c2 = crcT[(c2 ^ v) & 255] ^ (c2 >>> 8); return (c2 ^ -1) >>> 0; };
const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
const used = {}; for (const m of c.v) if (m) used[NAMES[m]] = (used[NAMES[m]] || 0) + 1;
console.log(JSON.stringify({ id: gen.id, seed: +seedArg, size: [sx, sy, sz], voxels: c.count(), floating: c.floating(), materials: used, out }));
