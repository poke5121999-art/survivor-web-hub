// Mesh commands: region → grid mesh, automatic weights, vertex moves (setup) and deform offsets (animate).
// Weighted vertices follow the JSON layout: per vertex [count, (boneIndex, bindX, bindY, weight) × count].
import { buildSkeleton, setupPose, updateWorld, regionLocal, isWeighted, DEG } from "../runtime/xuong.js?v=20261125h";

const tidy = (v) => Math.round(v * 1e4) / 1e4;
const world = (doc) => { const sk = buildSkeleton(doc), p = setupPose(sk); updateWorld(sk, p); return { sk, pose: p }; };
const inv = (p) => { const det = p.a * p.d - p.b * p.c || 1e-9; return { a: p.d / det, b: -p.b / det, c: -p.c / det, d: p.a / det }; };
const toLocal = (p, x, y) => { const i = inv(p), dx = x - p.wx, dy = y - p.wy; return [i.a * dx + i.b * dy, i.c * dx + i.d * dy]; };
const toWorld = (p, x, y) => [p.a * x + p.b * y + p.wx, p.c * x + p.d * y + p.wy];

// world positions of a mesh's vertices at the setup pose (no deform)
export function meshWorld(doc, slot, att) {
  const { sk, pose } = world(doc), si = sk.slotIndex.get(slot), bone = pose.bones[sk.slots[si].boneIndex];
  const n = att.uvs.length / 2, v = att.vertices, out = [];
  if (!isWeighted(att)) { for (let i = 0; i < n; i++) out.push(toWorld(bone, v[i * 2], v[i * 2 + 1])); return { out, sk, pose }; }
  for (let i = 0, j = 0; i < n; i++) {
    const c = v[j++];
    let x = 0, y = 0;
    for (let k = 0; k < c; k++, j += 4) { const [wx, wy] = toWorld(pose.bones[v[j]], v[j + 1], v[j + 2]); x += wx * v[j + 3]; y += wy * v[j + 3]; }
    out.push([x, y]);
  }
  return { out, sk, pose };
}

export function gridMesh(att, cols, rows) {
  const q = regionLocal(att); // BL, BR, TR, TL in bone space
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const P = (i) => [q[i * 2], q[i * 2 + 1]];
  const vertices = [], uvs = [], triangles = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const u = c / cols, t = r / rows; // t: 0 bottom → 1 top
    const bottom = lerp2(P(0), P(1), u), top = lerp2(P(3), P(2), u), p = lerp2(bottom, top, t);
    vertices.push(tidy(p[0]), tidy(p[1]));
    uvs.push(tidy(u), tidy(1 - t));
  }
  const id = (r, c) => r * (cols + 1) + c;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) triangles.push(id(r, c), id(r, c + 1), id(r + 1, c + 1), id(r + 1, c + 1), id(r + 1, c), id(r, c));
  // hull: boundary walk, bottom row → right column → top row → left column
  const hull = [];
  for (let c = 0; c <= cols; c++) hull.push(id(0, c));
  for (let r = 1; r <= rows; r++) hull.push(id(r, cols));
  for (let c = cols - 1; c >= 0; c--) hull.push(id(rows, c));
  for (let r = rows - 1; r >= 1; r--) hull.push(id(r, 0));
  // reorder so hull vertices come first (JSON convention: hull = count of leading hull vertices)
  const order = [...hull, ...Array.from({ length: (rows + 1) * (cols + 1) }, (_, i) => i).filter((i) => !hull.includes(i))];
  const remap = new Map(order.map((o, n) => [o, n]));
  return {
    type: "mesh", path: att.path, color: att.color, width: att.width, height: att.height,
    vertices: order.flatMap((o) => [vertices[o * 2], vertices[o * 2 + 1]]), uvs: order.flatMap((o) => [uvs[o * 2], uvs[o * 2 + 1]]),
    triangles: triangles.map((t) => remap.get(t)), hull: hull.length,
  };
}

// distance from a world point to a bone drawn as a segment (zero-length bones are points)
function segDist([x, y], b, len) {
  const ax = b.wx, ay = b.wy, bx = b.wx + b.a * len, by = b.wy + b.c * len;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
export function autoWeights(doc, slot, att, boneNames, { maxPerVertex = 3, falloff = 3 } = {}) {
  const { out, sk, pose } = meshWorld(doc, slot, att);
  const bones = boneNames.map((n) => ({ i: sk.boneIndex.get(n), len: sk.bones[sk.boneIndex.get(n)].length }));
  const verts = [];
  for (const p of out) {
    let ws = bones.map((b) => ({ i: b.i, w: 1 / Math.pow(segDist(p, pose.bones[b.i], b.len) + 1, falloff) }));
    ws.sort((a, b) => b.w - a.w);
    ws = ws.slice(0, maxPerVertex);
    const sum = ws.reduce((s, x) => s + x.w, 0);
    ws = ws.map((x) => ({ ...x, w: x.w / sum })).filter((x) => x.w > 0.01);
    const s2 = ws.reduce((s, x) => s + x.w, 0);
    verts.push(ws.length);
    for (const x of ws) { const [lx, ly] = toLocal(pose.bones[x.i], p[0], p[1]); verts.push(x.i, tidy(lx), tidy(ly), tidy(x.w / s2)); }
  }
  return verts;
}
// Cloth hanging from an anchor bone (loincloth, tassets, skirt, cape): the top row follows the anchor only, lower
// rows blend towards the other bones (split between them by distance), up to `amount` at the bottom row.
export function hangWeights(doc, slot, att, boneNames, { amount = 0.7, falloff = 2 } = {}) {
  const { out, sk, pose } = meshWorld(doc, slot, att);
  const [anchor, ...rest] = boneNames.map((n) => ({ i: sk.boneIndex.get(n), len: sk.bones[sk.boneIndex.get(n)].length }));
  const ys = out.map((p) => p[1]), top = Math.max(...ys), bottom = Math.min(...ys), span = top - bottom || 1;
  const verts = [];
  for (const p of out) {
    const t = Math.max(0, Math.min(1, (top - p[1]) / span)) * amount;
    let ws = rest.map((b) => ({ i: b.i, w: 1 / Math.pow(segDist(p, pose.bones[b.i], b.len) + 1, falloff) }));
    const sum = ws.reduce((a, x) => a + x.w, 0) || 1;
    ws = [{ i: anchor.i, w: 1 - t }, ...ws.map((x) => ({ i: x.i, w: (t * x.w) / sum }))].filter((x) => x.w > 0.01);
    const s2 = ws.reduce((a, x) => a + x.w, 0);
    verts.push(ws.length);
    for (const x of ws) { const [lx, ly] = toLocal(pose.bones[x.i], p[0], p[1]); verts.push(x.i, tidy(lx), tidy(ly), tidy(x.w / s2)); }
  }
  return verts;
}
export function unweight(doc, slot, att) {
  const { out, sk, pose } = meshWorld(doc, slot, att), bone = pose.bones[sk.slots[sk.slotIndex.get(slot)].boneIndex];
  return out.flatMap(([x, y]) => toLocal(bone, x, y).map(tidy));
}
// moves vertices by a world delta at the setup pose
export function movedVertices(doc, slot, att, indices, dx, dy) {
  const { sk, pose } = world(doc), v = att.vertices.slice(), set = new Set(indices);
  if (!isWeighted(att)) {
    const b = pose.bones[sk.slots[sk.slotIndex.get(slot)].boneIndex], i2 = inv(b);
    const lx = i2.a * dx + i2.b * dy, ly = i2.c * dx + i2.d * dy;
    for (const i of set) { v[i * 2] = tidy(v[i * 2] + lx); v[i * 2 + 1] = tidy(v[i * 2 + 1] + ly); }
    return v;
  }
  for (let i = 0, j = 0; i < att.uvs.length / 2; i++) {
    const c = v[j++];
    for (let k = 0; k < c; k++, j += 4) if (set.has(i)) { const b = inv(pose.bones[v[j]]); v[j + 1] = tidy(v[j + 1] + b.a * dx + b.b * dy); v[j + 2] = tidy(v[j + 2] + b.c * dx + b.d * dy); }
  }
  return v;
}
// deform offsets that move the chosen vertices by a world delta under a given pose (animate mode)
export function deformOffsets(sk, pose, slot, att, base, indices, dx, dy) {
  const set = new Set(indices), v = att.vertices;
  const out = base ? Array.from(base) : [];
  if (!isWeighted(att)) {
    const n = att.uvs.length / 2;
    while (out.length < n * 2) out.push(0);
    const b = inv(pose.bones[sk.slots[sk.slotIndex.get(slot)].boneIndex]);
    for (const i of set) { out[i * 2] = tidy(out[i * 2] + b.a * dx + b.b * dy); out[i * 2 + 1] = tidy(out[i * 2 + 1] + b.c * dx + b.d * dy); }
    return out;
  }
  let f = 0;
  for (let i = 0, j = 0; i < att.uvs.length / 2; i++) {
    const c = v[j++];
    for (let k = 0; k < c; k++, j += 4, f += 2) {
      while (out.length < f + 2) out.push(0);
      if (set.has(i)) { const b = inv(pose.bones[v[j]]); out[f] = tidy(out[f] + b.a * dx + b.b * dy); out[f + 1] = tidy(out[f + 1] + b.c * dx + b.d * dy); }
    }
  }
  return out;
}
export { DEG };
