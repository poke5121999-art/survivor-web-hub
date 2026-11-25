import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDoc, apply, applyAll } from "../src/commands.js";
import { History } from "../src/history.js";
import { buildSkeleton, poseAt, worldVertices, getAttachment, setupPose, updateWorld } from "../runtime/xuong.js";

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const run = (doc, cmds) => applyAll(doc, cmds).doc;
const world = (doc, bone, anim, time = 0) => {
  const sk = buildSkeleton(doc), p = poseAt(sk, anim ? doc.animations[anim] : null, time).bones[sk.boneIndex.get(bone)];
  return [p.wx, p.wy, Math.atan2(p.c, p.a) * 180 / Math.PI];
};

const ARM = [
  { type: "bone.add", name: "upper", x: 10, y: 0, rotation: 90, length: 20 },
  { type: "bone.add", name: "lower", parent: "upper", x: 20, length: 15 },
  { type: "slot.add", name: "hand", bone: "lower", attachment: "hand" },
  { type: "attachment.add", slot: "hand", name: "hand", attachment: { width: 4, height: 2, x: 15 } },
];

test("child bone world position follows the parent's rotation", () => {
  const d = run(emptyDoc(), ARM);
  const [x, y, r] = world(d, "lower");
  near(x, 10); near(y, 20); near(r, 90);
});

test("undo restores the exact document, redo replays it", () => {
  const h = new History(emptyDoc());
  const before = JSON.stringify(h.doc);
  h.begin("rig");
  for (const c of ARM) h.run(c);
  h.run({ type: "anim.add", name: "wave" });
  h.run({ type: "key.set", anim: "wave", track: { bone: "upper", prop: "rotate" }, time: 0, value: 0 });
  h.run({ type: "key.set", anim: "wave", track: { bone: "upper", prop: "rotate" }, time: 1, value: 45, curve: "stepped" });
  h.run({ type: "bone.rename", name: "upper", to: "shoulder" });
  h.run({ type: "slot.rename", name: "hand", to: "palm" });
  h.end();
  const after = JSON.stringify(h.doc);
  assert.equal(h.doc.animations.wave.bones.shoulder.rotate.length, 2);
  assert.equal(h.doc.slots[0].name, "palm");
  assert.ok(h.undo());
  assert.equal(JSON.stringify(h.doc), before);
  assert.ok(h.redo());
  assert.equal(JSON.stringify(h.doc), after);
});

test("apply never mutates its input", () => {
  const d = run(emptyDoc(), ARM), snap = JSON.stringify(d);
  apply(d, { type: "bone.set", name: "lower", props: { rotation: 30 } });
  apply(d, { type: "bone.remove", name: "upper" });
  assert.equal(JSON.stringify(d), snap);
});

test("reparent keeps the bone where it is on screen", () => {
  let d = run(emptyDoc(), [...ARM, { type: "bone.add", name: "other", x: -7, y: 3, rotation: -30, scaleX: 2 }]);
  const w0 = world(d, "lower");
  d = apply(d, { type: "bone.reparent", name: "lower", parent: "other" }).doc;
  assert.equal(d.bones.find((b) => b.name === "lower").parent, "other");
  const w1 = world(d, "lower");
  near(w1[0], w0[0]); near(w1[1], w0[1]); near(w1[2], w0[2]);
});

test("slot.rebone keeps the image where it is on screen", () => {
  let d = run(emptyDoc(), [...ARM, { type: "bone.add", name: "other", x: 3, y: -4, rotation: 70 }]);
  const verts = (doc) => {
    const sk = buildSkeleton(doc), pose = setupPose(sk); updateWorld(sk, pose);
    return [...worldVertices(sk, pose, 0, getAttachment(doc, "default", "hand", "hand"))];
  };
  const v0 = verts(d);
  d = apply(d, { type: "slot.rebone", name: "hand", bone: "other" }).doc;
  verts(d).forEach((v, i) => near(v, v0[i]));
});

test("keys interpolate linear, stepped and bezier", () => {
  const tr = { bone: "upper", prop: "rotate" };
  const base = run(emptyDoc(), [...ARM, { type: "anim.add", name: "a" },
    { type: "key.set", anim: "a", track: tr, time: 0, value: 0 }, { type: "key.set", anim: "a", track: tr, time: 1, value: 90 }]);
  near(world(base, "upper", "a", 0.5)[2], 90 + 45);
  const stepped = apply(base, { type: "key.curve", anim: "a", track: tr, time: 0, curve: "stepped" }).doc;
  near(world(stepped, "upper", "a", 0.99)[2], 90);
  const ease = apply(base, { type: "key.curve", anim: "a", track: tr, time: 0, curve: [0.42, 0, 0.58, 1] }).doc;
  near(world(ease, "upper", "a", 0.5)[2], 135);
  assert.ok(world(ease, "upper", "a", 0.25)[2] < 90 + 22.5 - 5, "ease-in-out is slower than linear at 25%");
});

test("attachment and draw order keys switch at their time", () => {
  const d = run(emptyDoc(), [...ARM,
    { type: "slot.add", name: "back", bone: "root", index: 0 },
    { type: "attachment.add", slot: "hand", name: "fist", attachment: { width: 3, height: 3 } },
    { type: "anim.add", name: "a" },
    { type: "key.set", anim: "a", track: { slot: "hand", prop: "attachment" }, time: 0.5, value: "fist" },
    { type: "key.set", anim: "a", track: { drawOrder: true }, time: 0.5, value: ["hand", "back"] },
  ]);
  const sk = buildSkeleton(d);
  assert.equal(poseAt(sk, d.animations.a, 0.4).slots[1].attachment, "hand");
  assert.equal(poseAt(sk, d.animations.a, 0.6).slots[1].attachment, "fist");
  assert.deepEqual(poseAt(sk, d.animations.a, 0.6).drawOrder, [1, 0]);
});

test("two-bone IK puts the lower bone's tip on the target", () => {
  const d = run(emptyDoc(), [...ARM, { type: "bone.add", name: "goal", x: 30, y: 10 },
    { type: "ik.add", name: "arm", bones: ["upper", "lower"], target: "goal" }]);
  const sk = buildSkeleton(d), pose = poseAt(sk, null, 0), lo = pose.bones[sk.boneIndex.get("lower")];
  near(lo.wx + lo.a * 15, 30, 0.05); near(lo.wy + lo.c * 15, 10, 0.05);
});

test("noRotationOrReflection child is not flipped by a mirrored parent", () => {
  const d = run(emptyDoc(), [
    { type: "bone.add", name: "p", scaleX: -1, rotation: 30 },
    { type: "bone.add", name: "c", parent: "p", x: 5, inherit: "noRotationOrReflection" },
  ]);
  const sk = buildSkeleton(d), pose = poseAt(sk, null, 0), c = pose.bones[sk.boneIndex.get("c")];
  near(c.a * c.d - c.b * c.c, 1); near(Math.atan2(c.c, c.a), 0);
});

test("invalid commands fail with a message and change nothing", () => {
  const d = run(emptyDoc(), ARM);
  assert.throws(() => apply(d, { type: "bone.add", name: "x", parent: "nope" }), /không có bone "nope"/);
  assert.throws(() => apply(d, { type: "bone.reparent", name: "upper", parent: "lower" }), /con cháu/);
  assert.throws(() => apply(d, { type: "key.set", anim: "zz", track: { bone: "upper", prop: "rotate" }, time: 0, value: 1 }), /không có animation/);
  assert.throws(() => applyAll(d, [{ type: "bone.add", name: "ok" }, { type: "bone.add", name: "ok" }]), /command #2.*đã có bone/);
  assert.throws(() => apply(d, { type: "frob" }), /command lạ/);
});

test("removing a bone removes its subtree, slots and keys", () => {
  const d = run(emptyDoc(), [...ARM, { type: "anim.add", name: "a" },
    { type: "key.set", anim: "a", track: { bone: "lower", prop: "rotate" }, time: 0, value: 5 },
    { type: "bone.remove", name: "upper" }]);
  assert.deepEqual(d.bones.map((b) => b.name), ["root"]);
  assert.deepEqual(d.slots, []);
  assert.deepEqual(d.animations.a, {});
  assert.deepEqual(d.skins[0].attachments, {});
});

test("Spine JSON export then import gives the same poses", async () => {
  const { buildSample } = await import("./make-sample.mjs");
  const { toSpine, fromSpine } = await import("../src/spine-io.js");
  const a = buildSample();
  const { doc: b, warnings } = fromSpine(JSON.parse(JSON.stringify(toSpine(a))));
  assert.deepEqual(warnings, []);
  const skA = buildSkeleton(a), skB = buildSkeleton(b);
  for (const anim of ["idle", "walk", "attack"]) for (const t of [0, 0.13, 0.37, 0.61]) {
    const pa = poseAt(skA, a.animations[anim], t), pb = poseAt(skB, b.animations[anim], t);
    pa.bones.forEach((p, i) => { near(p.wx, pb.bones[i].wx, 1e-2); near(p.wy, pb.bones[i].wy, 1e-2); near(p.a, pb.bones[i].a, 1e-3); });
  }
  assert.deepEqual(Object.keys(b.animations), ["idle", "walk", "attack"]);
  assert.equal(b.animations.walk.events.length, 2);
});

test("Spine draw order offsets round-trip", async () => {
  const { toSpine, fromSpine } = await import("../src/spine-io.js");
  const d = run(emptyDoc(), [
    ...["a", "b", "c", "d"].map((n) => ({ type: "slot.add", name: n, bone: "root" })),
    { type: "anim.add", name: "x" },
    { type: "key.set", anim: "x", track: { drawOrder: true }, time: 0.5, value: ["c", "a", "d", "b"] },
  ]);
  const back = fromSpine(toSpine(d)).doc;
  assert.deepEqual(back.animations.x.drawOrder[0].order, ["c", "a", "d", "b"]);
});

test("atlas pages hold every image without overlap", async () => {
  const { pack } = await import("../src/pack.js");
  const items = Array.from({ length: 30 }, (_, i) => ({ name: "i" + i, w: 5 + ((i * 37) % 120), h: 5 + ((i * 53) % 90) }));
  const pages = pack(items, { maxSize: 256, padding: 2 });
  const placed = pages.flatMap((p) => p.regions);
  assert.equal(placed.length, 30);
  for (const p of pages) for (const a of p.regions) {
    assert.ok(a.x + a.w <= p.width && a.y + a.h <= p.height);
    for (const b of p.regions) if (a !== b) assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `${a.name} overlaps ${b.name}`);
  }
});

test("mesh: grid from region looks the same, auto weights follow two bones, deform keys move vertices", async () => {
  const { meshWorld } = await import("../src/mesh.js");
  let d = run(emptyDoc(), [...ARM, { type: "slot.add", name: "skin", bone: "upper", attachment: "skin" },
    { type: "attachment.add", slot: "skin", name: "skin", attachment: { width: 40, height: 10, x: 17.5, rotation: 0 } }]);
  const sk0 = buildSkeleton(d), p0 = poseAt(sk0, null, 0), regionVerts = [...worldVertices(sk0, p0, sk0.slotIndex.get("skin"), getAttachment(d, "default", "skin", "skin"))];
  d = apply(d, { type: "mesh.fromRegion", slot: "skin", name: "skin", cols: 4, rows: 1 }).doc;
  const m = getAttachment(d, "default", "skin", "skin");
  assert.equal(m.type, "mesh"); assert.equal(m.uvs.length / 2, 10); assert.equal(m.triangles.length, 24);
  const { out } = meshWorld(d, "skin", m);
  const xs = out.map((p) => p[0]), ys = out.map((p) => p[1]);
  near(Math.min(...xs), Math.min(regionVerts[0], regionVerts[2], regionVerts[4], regionVerts[6]));
  near(Math.max(...ys), Math.max(regionVerts[1], regionVerts[3], regionVerts[5], regionVerts[7]));
  d = apply(d, { type: "mesh.bind", slot: "skin", name: "skin", bones: ["upper", "lower"] }).doc;
  const before = meshWorld(d, "skin", getAttachment(d, "default", "skin", "skin")).out;
  before.forEach((p, i) => { near(p[0], out[i][0], 1e-2); near(p[1], out[i][1], 1e-2); });
  // bend the elbow 90°: the top end of the mesh (near lower) moves, the bottom end (near the shoulder) stays
  const bent = apply(d, { type: "bone.set", name: "lower", props: { rotation: 90 } }).doc;
  const after = meshWorld(bent, "skin", getAttachment(bent, "default", "skin", "skin")).out;
  const topMoved = Math.hypot(after[4][0] - before[4][0], after[4][1] - before[4][1]), bottomMoved = Math.hypot(after[0][0] - before[0][0], after[0][1] - before[0][1]);
  assert.ok(topMoved > 5 && bottomMoved < 1, `đầu mesh dời ${topMoved}, gốc dời ${bottomMoved}`);
  // adding a bone keeps weights pointing at the same bones
  const more = apply(apply(d, { type: "bone.add", name: "extra", parent: "root" }).doc, { type: "bone.reparent", name: "extra", parent: "upper" }).doc;
  meshWorld(more, "skin", getAttachment(more, "default", "skin", "skin")).out.forEach((p, i) => { near(p[0], before[i][0], 1e-2); near(p[1], before[i][1], 1e-2); });
  assert.throws(() => apply(d, { type: "bone.remove", name: "lower" }), /bị xoá/);
  // a deform key on the weighted mesh moves vertex 0 by +5 in world x
  const { deformOffsets } = await import("../src/mesh.js");
  const sk = buildSkeleton(d), pose = poseAt(sk, null, 0);
  const offs = deformOffsets(sk, pose, "skin", getAttachment(d, "default", "skin", "skin"), null, [0], 5, 0);
  const anim = run(d, [{ type: "anim.add", name: "a" }, { type: "key.set", anim: "a", track: { deform: { slot: "skin", attachment: "skin" } }, time: 0, value: offs }]);
  const sk2 = buildSkeleton(anim), p2 = poseAt(sk2, anim.animations.a, 0), wv = worldVertices(sk2, p2, sk2.slotIndex.get("skin"), getAttachment(anim, "default", "skin", "skin"));
  near(wv[0], before[0][0] + 5, 1e-2); near(wv[1], before[0][1], 1e-2); near(wv[2], before[1][0], 1e-2);
});

test("transform constraint: world, local and relative modes, keyed mix, Spine round trip, bone rename/remove", async () => {
  const { toSpine, fromSpine } = await import("../src/spine-io.js");
  const base = run(emptyDoc(), [
    { type: "bone.add", name: "a", x: 0, y: 0, rotation: 30, length: 10 },
    { type: "bone.add", name: "b", x: 50, y: 0, rotation: 0, length: 10 },
    { type: "bone.add", name: "c", parent: "b", x: 10, length: 5 },
  ]);
  // world: b takes a's world rotation (+10) and sits at a's local point (5, 0)
  let d = run(base, [{ type: "transform.add", name: "tc", bones: ["b"], target: "a", rotation: 10, x: 5 }]);
  let [x, y, r] = world(d, "b");
  near(r, 40); near(x, 5 * Math.cos(30 * Math.PI / 180)); near(y, 5 * Math.sin(30 * Math.PI / 180));
  [x, y] = world(d, "c"); near(x, 5 * Math.cos(30 * Math.PI / 180) + 10 * Math.cos(40 * Math.PI / 180)); // child follows
  // half rotate mix, no translation
  d = run(d, [{ type: "transform.set", name: "tc", props: { mixRotate: 0.5, mixX: 0, mixY: 0 } }]);
  [x, y, r] = world(d, "b"); near(r, 20); near(x, 50); near(y, 0);
  // keyed mix: 0 at t=0, 1 at t=1 → half way at t=0.5
  d = run(d, [{ type: "anim.add", name: "m" },
    { type: "key.set", anim: "m", track: { transform: "tc" }, time: 0, value: { mixRotate: 0, mixX: 0, mixY: 0 } },
    { type: "key.set", anim: "m", track: { transform: "tc" }, time: 1, value: { mixRotate: 1, mixX: 0, mixY: 0 } }]);
  near(world(d, "b", "m", 0.5)[2], 20); near(world(d, "b", "m", 1)[2], 40);
  // local + relative: b's local rotation gets a's local rotation added
  const rel = run(base, [{ type: "transform.add", name: "tr", bones: ["b"], target: "a", local: true, relative: true, mixX: 0, mixY: 0 }]);
  near(world(rel, "b")[2], 30);
  // Spine JSON round trip keeps the constraint and its keys
  const { doc: back, warnings } = fromSpine(JSON.parse(JSON.stringify(toSpine(d))));
  assert.deepEqual(warnings, []);
  for (const t of [0, 0.25, 0.5, 1]) near(world(back, "b", "m", t)[2], world(d, "b", "m", t)[2]);
  // rename follows, removing the target removes the constraint
  const ren = run(d, [{ type: "bone.rename", name: "a", to: "goc" }]);
  assert.equal(ren.transform[0].target, "goc");
  assert.equal(run(d, [{ type: "bone.remove", name: "a" }]).transform.length, 0);
  assert.throws(() => run(base, [{ type: "transform.add", name: "x", bones: ["a"], target: "a" }]), /target/);
});

test("clipping: slots up to the end slot are cut to the clip polygon (concave too), later slots are not", async () => {
  const { drawList } = await import("../runtime/xuong.js");
  const area = (d) => { let a = 0; for (let i = 0; i < d.tris.length; i += 3) { const [p, q, r] = [d.tris[i], d.tris[i + 1], d.tris[i + 2]].map((k) => [d.verts[k * 2], d.verts[k * 2 + 1]]); a += Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / 2; } return a; };
  const d = run(emptyDoc(), [
    { type: "slot.add", name: "mask", bone: "root", attachment: "mask" },
    // L-shaped (concave) clip: the 10×10 square minus its top-right 5×5 quarter → area 75
    { type: "attachment.add", slot: "mask", name: "mask", attachment: { type: "clipping", end: "a", vertexCount: 6, vertices: [-5, -5, 5, -5, 5, 0, 0, 0, 0, 5, -5, 5] } },
    { type: "slot.add", name: "a", bone: "root", attachment: "a" },
    { type: "attachment.add", slot: "a", name: "a", attachment: { width: 20, height: 20 } },
    { type: "slot.add", name: "b", bone: "root", attachment: "b" },
    { type: "attachment.add", slot: "b", name: "b", attachment: { width: 20, height: 20 } },
  ]);
  const sk = buildSkeleton(d), list = drawList(sk, poseAt(sk, null, 0));
  assert.deepEqual(list.map((x) => x.slot), ["a", "b"]);
  near(area(list[0]), 75, 1e-3);
  assert.equal(list[0].mesh, true);
  near(area(list[1]), 400, 1e-3);
  // uvs follow the cut: the clipped corner (-5,-5) of a 20×20 region centred at 0 sits at u 0.25, v 0.75
  const k = [...Array(list[0].verts.length / 2).keys()].find((i) => Math.abs(list[0].verts[i * 2] + 5) < 1e-4 && Math.abs(list[0].verts[i * 2 + 1] + 5) < 1e-4);
  near(list[0].uvs[k * 2], 0.25); near(list[0].uvs[k * 2 + 1], 0.75);
});

test("tint black: dark colour keys interpolate, survive a Spine rgba2 round trip, and the raster maps texture black to dark", async () => {
  const { toSpine, fromSpine } = await import("../src/spine-io.js");
  const { drawTriangles } = await import("../cli/raster.mjs");
  const d = run(emptyDoc(), [
    { type: "slot.add", name: "s", bone: "root" },
    { type: "slot.set", name: "s", props: { dark: "000000" } },
    { type: "anim.add", name: "a" },
    { type: "key.set", anim: "a", track: { slot: "s", prop: "dark" }, time: 0, value: "000000" },
    { type: "key.set", anim: "a", track: { slot: "s", prop: "dark" }, time: 1, value: "ff0000" },
  ]);
  const dark = (doc, t) => { const sk = buildSkeleton(doc); return poseAt(sk, doc.animations.a, t).slots[0].dark; };
  near(dark(d, 0.5)[0], 0.5); near(dark(d, 0.5)[1], 0);
  const { doc: back, warnings } = fromSpine(JSON.parse(JSON.stringify(toSpine(d))));
  assert.deepEqual(warnings, []);
  for (const t of [0, 0.5, 1]) near(dark(back, t)[0], dark(d, t)[0], 1e-2);
  // a black texel with light white and dark red comes out red; a white texel stays white
  const surf = { width: 2, height: 1, data: new Uint8ClampedArray(8) };
  const img = { width: 2, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]) };
  drawTriangles(surf, img, [0, 0, 2, 0, 2, 1, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1], [0, 1, 2, 2, 3, 0], [1, 1, 1, 1], "normal", true, [1, 0, 0, 1]);
  assert.deepEqual([...surf.data], [255, 0, 0, 255, 255, 255, 255, 255]);
});

test("sequence attachment: frame per mode, image path, Spine round trip; deform keys and curves survive Spine export", async () => {
  const { toSpine, fromSpine } = await import("../src/spine-io.js");
  const { sequenceIndex, drawList } = await import("../runtime/xuong.js");
  const at = (mode, t) => sequenceIndex({ mode, index: 0, delay: 0.1 }, t, 4);
  assert.deepEqual([0, 0.1, 0.25, 0.35, 0.45, 0.65].map((t) => at("loop", t)), [0, 1, 2, 3, 0, 2]);
  assert.deepEqual([0, 0.35, 0.65].map((t) => at("once", t)), [0, 3, 3]);
  assert.deepEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((t) => at("pingpong", t)), [0, 1, 2, 3, 2, 1, 0]);
  assert.deepEqual([0, 0.1].map((t) => at("loopReverse", t)), [3, 2]);
  assert.equal(at("hold", 5), 0);
  let d = run(emptyDoc(), [
    { type: "slot.add", name: "lua", bone: "root", attachment: "lua" },
    { type: "attachment.add", slot: "lua", name: "lua", attachment: { width: 4, height: 4, sequence: { count: 4, start: 1, digits: 2 } } },
    { type: "anim.add", name: "chay" },
    { type: "key.set", anim: "chay", track: { sequence: { slot: "lua", attachment: "lua" } }, time: 0, value: { mode: "loop", delay: 0.1 } },
  ]);
  const img = (doc, t) => { const sk = buildSkeleton(doc); return drawList(sk, poseAt(sk, doc.animations.chay, t))[0].image; };
  assert.deepEqual([0, 0.15, 0.35].map((t) => img(d, t)), ["lua01", "lua02", "lua04"]);
  // a deformed mesh with a bezier key
  d = run(d, [
    { type: "slot.add", name: "m", bone: "root", attachment: "m" },
    { type: "attachment.add", slot: "m", name: "m", attachment: { width: 10, height: 10 } },
    { type: "mesh.fromRegion", slot: "m", name: "m", cols: 1, rows: 1 },
    { type: "key.set", anim: "chay", track: { deform: { slot: "m", attachment: "m" } }, time: 0, value: [0, 0, 0, 0, 0, 0, 0, 0], curve: [0.5, 0, 0.5, 1] },
    { type: "key.set", anim: "chay", track: { deform: { slot: "m", attachment: "m" } }, time: 1, value: [0, 0, 0, 0, 4, 4, 0, 0] },
  ]);
  const { doc: back, warnings } = fromSpine(JSON.parse(JSON.stringify(toSpine(d))));
  assert.deepEqual(warnings, []);
  assert.deepEqual([0, 0.15, 0.35].map((t) => img(back, t)), ["lua01", "lua02", "lua04"]);
  const vtx = (doc, t) => { const sk = buildSkeleton(doc); return Array.from(drawList(sk, poseAt(sk, doc.animations.chay, t)).find((x) => x.slot === "m").verts); };
  for (const t of [0.25, 0.5, 0.9]) vtx(d, t).forEach((v, i) => near(v, vtx(back, t)[i], 1e-2));
});
