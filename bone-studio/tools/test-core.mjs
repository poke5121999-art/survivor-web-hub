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
