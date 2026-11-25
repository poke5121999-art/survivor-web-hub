// Command registry. Every change to a document, from the UI, the agent, the CLI or a test, is one of these.
// apply(doc, cmd) is pure: it returns a new doc and the exact inverse (a $patch command).
import { transaction, applyPatch } from "./tx.js?v=20261125c";
import { BONE_DEFAULTS, INHERIT, BLENDS, buildSkeleton, setupPose, updateWorld, DEG } from "../runtime/xuong.js?v=20261125c";

export const FORMAT = "xuong";
export const VERSION = 1;

export function emptyDoc(name = "Nhân vật mới") {
  return {
    format: FORMAT, version: VERSION, name, fps: 30, pixelArt: false,
    images: {},
    bones: [{ name: "root", parent: null, length: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, inherit: "normal", color: "989898ff" }],
    slots: [], skins: [{ name: "default", attachments: {} }], ik: [], events: {}, animations: {},
  };
}

class CommandError extends Error {}
const bad = (msg) => { throw new CommandError(msg); };

// ---- argument checks ---------------------------------------------------------------------------
const NAME_RE = /^[^\u0000-\u001f]{1,80}$/;
const name = (v, what) => (typeof v === "string" && NAME_RE.test(v) && v.trim() === v ? v : bad(`${what}: tên không hợp lệ (${JSON.stringify(v)})`));
const num = (v, what) => (typeof v === "number" && isFinite(v) ? v : bad(`${what}: cần một số, nhận ${JSON.stringify(v)}`));
const optNum = (v, what, dflt) => (v === undefined ? dflt : num(v, what));
const hex = (v, what) => (typeof v === "string" && /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) ? v.toLowerCase().padEnd(8, "f") : bad(`${what}: màu phải dạng rrggbbaa, nhận ${JSON.stringify(v)}`));
const oneOf = (v, list, what) => (list.includes(v) ? v : bad(`${what}: phải là một trong ${list.join(", ")}, nhận ${JSON.stringify(v)}`));
const time = (v) => Math.round(num(v, "time") * 1e4) / 1e4;
const curveArg = (c) => {
  if (c === undefined || c === null || c === "linear") return undefined;
  if (c === "stepped") return "stepped";
  if (Array.isArray(c) && c.length === 4 && c.every((x) => typeof x === "number" && isFinite(x)) && c[0] >= 0 && c[0] <= 1 && c[2] >= 0 && c[2] <= 1) return c.map((x) => Math.round(x * 1e4) / 1e4);
  return bad(`curve phải là "linear", "stepped" hoặc [x1,y1,x2,y2] với x trong 0..1, nhận ${JSON.stringify(c)}`);
};

const boneIdx = (doc, n) => { const i = doc.bones.findIndex((b) => b.name === n); return i >= 0 ? i : bad(`không có bone "${n}"`); };
const slotIdx = (doc, n) => { const i = doc.slots.findIndex((s) => s.name === n); return i >= 0 ? i : bad(`không có slot "${n}"`); };
const skinIdx = (doc, n) => { const i = doc.skins.findIndex((s) => s.name === n); return i >= 0 ? i : bad(`không có skin "${n}"`); };
const ikIdx = (doc, n) => { const i = (doc.ik ?? []).findIndex((s) => s.name === n); return i >= 0 ? i : bad(`không có IK "${n}"`); };
const animOf = (doc, n) => doc.animations[n] ?? bad(`không có animation "${n}"`);
const descendants = (doc, n) => {
  const out = new Set([n]);
  let grew = true;
  while (grew) { grew = false; for (const b of doc.bones) if (b.parent != null && out.has(b.parent) && !out.has(b.name)) { out.add(b.name); grew = true; } }
  return out;
};

const BONE_PROPS = {
  x: num, y: num, rotation: num, scaleX: num, scaleY: num, shearX: num, shearY: num,
  length: (v, w) => (num(v, w) >= 0 ? v : bad(`${w}: chiều dài không âm`)),
  inherit: (v, w) => oneOf(v, INHERIT, w), color: hex, hidden: (v) => !!v,
};
const SLOT_PROPS = {
  color: hex, dark: (v, w) => (v === null ? null : hex(v, w).slice(0, 6)), blend: (v, w) => oneOf(v, BLENDS, w),
  attachment: (v, w) => (v === null ? null : name(v, w)), hidden: (v) => !!v,
};
const ATT_TYPES = ["region", "mesh", "point", "boundingbox", "clipping"];
const ATT_PROPS = {
  x: num, y: num, rotation: num, scaleX: num, scaleY: num,
  width: (v, w) => (num(v, w) > 0 ? v : bad(`${w}: phải > 0`)), height: (v, w) => (num(v, w) > 0 ? v : bad(`${w}: phải > 0`)),
  color: hex, path: (v, w) => (v === null ? null : name(v, w)),
  uvs: numArray, triangles: numArray, vertices: numArray, hull: num, edges: numArray, vertexCount: num, end: (v, w) => name(v, w),
};
function numArray(v, w) { return Array.isArray(v) && v.every((x) => typeof x === "number" && isFinite(x)) ? v.slice() : bad(`${w}: cần mảng số`); }
function cleanProps(props, table, what) {
  if (!props || typeof props !== "object") bad(`${what}: thiếu props`);
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    const f = table[k] ?? bad(`${what}: thuộc tính lạ "${k}" (có: ${Object.keys(table).join(", ")})`);
    out[k] = f(v, `${what}.${k}`);
  }
  return out;
}
function cleanAttachment(a, what) {
  const type = oneOf(a?.type ?? "region", ATT_TYPES, `${what}.type`);
  const { type: _t, ...rest } = a ?? {};
  const out = { type, ...cleanProps(rest, ATT_PROPS, what) };
  if (type === "region" && !(out.width && out.height)) bad(`${what}: region cần width và height`);
  if (type === "mesh") {
    if (!out.uvs || !out.triangles || !out.vertices) bad(`${what}: mesh cần uvs, triangles, vertices`);
    if (out.triangles.some((i) => i < 0 || i >= out.uvs.length / 2)) bad(`${what}: triangles trỏ ra ngoài số đỉnh`);
  }
  return out;
}

// ---- tracks ------------------------------------------------------------------------------------
// track: { bone, prop: rotate|translate|scale|shear } | { slot, prop: attachment|rgba } | { drawOrder: true } | { event: true } | { ik }
const BONE_TL = ["rotate", "translate", "scale", "shear"];
function trackPath(doc, anim, tr) {
  if (!tr || typeof tr !== "object") bad("thiếu track");
  if (tr.bone !== undefined) { boneIdx(doc, tr.bone); return ["animations", anim, "bones", tr.bone, oneOf(tr.prop, BONE_TL, "track.prop")]; }
  if (tr.slot !== undefined) { slotIdx(doc, tr.slot); return ["animations", anim, "slots", tr.slot, oneOf(tr.prop, ["attachment", "rgba"], "track.prop")]; }
  if (tr.drawOrder) return ["animations", anim, "drawOrder"];
  if (tr.event) return ["animations", anim, "events"];
  if (tr.ik !== undefined) { ikIdx(doc, tr.ik); return ["animations", anim, "ik", tr.ik]; }
  return bad(`track lạ: ${JSON.stringify(tr)}`);
}
function keyFields(doc, tr, v) {
  if (tr.bone !== undefined) {
    if (tr.prop === "rotate") return { value: num(v, "value") };
    if (!v || typeof v !== "object") bad(`${tr.prop}: value phải là {x, y}`);
    return { x: num(v.x, "value.x"), y: num(v.y, "value.y") };
  }
  if (tr.slot !== undefined) {
    if (tr.prop === "attachment") return { name: v === null ? null : name(v, "value") };
    return { color: hex(v, "value") };
  }
  if (tr.drawOrder) {
    if (!Array.isArray(v)) bad("drawOrder: value phải là mảng tên slot");
    v.forEach((s) => slotIdx(doc, s));
    return { order: v.slice() };
  }
  if (tr.event) {
    const e = doc.events[v?.name] ?? bad(`không có event "${v?.name}"`);
    const out = { name: v.name };
    for (const k of ["int", "float"]) if (v[k] !== undefined && v[k] !== e[k]) out[k] = num(v[k], k);
    if (v.string !== undefined && v.string !== e.string) out.string = String(v.string);
    return out;
  }
  if (tr.ik !== undefined) {
    const o = {};
    if (v?.mix !== undefined) o.mix = num(v.mix, "mix");
    if (v?.softness !== undefined) o.softness = num(v.softness, "softness");
    for (const k of ["bendPositive", "stretch", "compress"]) if (v?.[k] !== undefined) o[k] = !!v[k];
    return o;
  }
}
const interpolates = (tr) => tr.bone !== undefined || tr.prop === "rgba" || tr.ik !== undefined;

// ---- helpers that rewrite references -----------------------------------------------------------
function mapAnimations(t, fn) {
  for (const [an, a] of Object.entries(t.get(["animations"]))) fn(an, a);
}
function worldOfBones(doc) {
  const sk = buildSkeleton(doc), pose = setupPose(sk);
  updateWorld(sk, pose);
  return { sk, pose };
}
function decompose(a, b, c, d) {
  const rotation = Math.atan2(c, a) / DEG, scaleX = Math.hypot(a, c), det = a * d - b * c;
  const scaleY = det / (scaleX || 1e-9);
  const shearY = (scaleY < 0 ? Math.atan2(-d, -b) : Math.atan2(d, b)) / DEG - 90 - rotation;
  return { rotation: tidy(rotation), scaleX: tidy(scaleX), scaleY: tidy(scaleY), shearX: 0, shearY: tidy(((shearY % 360) + 540) % 360 - 180) };
}
const tidy = (v) => Math.round(v * 1e5) / 1e5;
function inv(p) {
  const det = p.a * p.d - p.b * p.c || 1e-9;
  return { a: p.d / det, b: -p.b / det, c: -p.c / det, d: p.a / det };
}
const mul = (p, q) => ({ a: p.a * q.a + p.b * q.c, b: p.a * q.b + p.b * q.d, c: p.c * q.a + p.d * q.c, d: p.c * q.b + p.d * q.d });

// ---- registry ----------------------------------------------------------------------------------
// Each entry: { help, run(t, args, doc) } where t is a transaction on doc.
export const COMMANDS = {
  "doc.set": {
    help: "Đổi thuộc tính dự án: { props: { name?, fps?, pixelArt? } }",
    run(t, { props }) {
      for (const [k, v] of Object.entries(props ?? bad("thiếu props"))) {
        if (k === "name") t.set(["name"], name(v, "name"));
        else if (k === "fps") t.set(["fps"], num(v, "fps") > 0 && v <= 240 ? v : bad("fps trong 1..240"));
        else if (k === "pixelArt") t.set(["pixelArt"], !!v);
        else bad(`thuộc tính dự án lạ "${k}"`);
      }
    },
  },

  "image.add": {
    help: "Khai báo ảnh (điểm ảnh lưu riêng): { path, width, height }",
    run(t, { path, width, height }) {
      t.set(["images", name(path, "path")], { width: num(width, "width"), height: num(height, "height") });
    },
  },
  "image.remove": {
    help: "Xoá khai báo ảnh: { path }",
    run(t, { path }) { if (!t.get(["images", path])) bad(`không có ảnh "${path}"`); t.del(["images", path]); },
  },

  "bone.add": {
    help: "Thêm bone: { name, parent (mặc định root), x, y, rotation, length, scaleX, scaleY, shearX, shearY, inherit, color }",
    run(t, a, doc) {
      const n = name(a.name, "name");
      if (doc.bones.some((b) => b.name === n)) bad(`đã có bone "${n}"`);
      const parent = a.parent === undefined ? doc.bones[0]?.name ?? null : a.parent;
      if (parent !== null) boneIdx(doc, parent);
      else if (doc.bones.length) bad("chỉ được một bone gốc");
      const { name: _n, parent: _p, ...rest } = a;
      const bone = { ...BONE_DEFAULTS, color: "989898ff", ...cleanProps(rest, BONE_PROPS, "bone"), name: n, parent };
      const list = doc.bones.slice();
      list.push(bone);
      t.set(["bones"], list);
    },
  },
  "bone.set": {
    help: "Sửa setup pose / thuộc tính của bone: { name, props: { x, y, rotation, scaleX, scaleY, shearX, shearY, length, inherit, color, hidden } }",
    run(t, { name: n, props }, doc) {
      const i = boneIdx(doc, n);
      t.set(["bones", i], { ...doc.bones[i], ...cleanProps(props, BONE_PROPS, `bone ${n}`) });
    },
  },
  "bone.rename": {
    help: "Đổi tên bone (mọi tham chiếu đổi theo): { name, to }",
    run(t, { name: n, to }, doc) {
      const i = boneIdx(doc, n);
      to = name(to, "to");
      if (doc.bones.some((b) => b.name === to)) bad(`đã có bone "${to}"`);
      t.set(["bones"], doc.bones.map((b, j) => (j === i ? { ...b, name: to } : b.parent === n ? { ...b, parent: to } : b)));
      t.set(["slots"], doc.slots.map((s) => (s.bone === n ? { ...s, bone: to } : s)));
      t.set(["ik"], (doc.ik ?? []).map((c) => ({ ...c, bones: c.bones.map((b) => (b === n ? to : b)), target: c.target === n ? to : c.target })));
      mapAnimations(t, (an, a) => {
        if (a.bones?.[n]) { t.set(["animations", an, "bones", to], a.bones[n]); t.del(["animations", an, "bones", n]); }
      });
      renameWeights(t, doc, null);
    },
  },
  "bone.reparent": {
    help: "Đổi cha của bone, giữ nguyên vị trí trên màn hình: { name, parent, keepWorld = true }",
    run(t, { name: n, parent, keepWorld = true }, doc) {
      const i = boneIdx(doc, n);
      boneIdx(doc, parent);
      if (descendants(doc, n).has(parent)) bad(`không thể cho "${n}" làm con của chính con cháu nó ("${parent}")`);
      if (doc.bones[i].parent === null) bad("không đổi cha bone gốc");
      let b = { ...doc.bones[i], parent };
      if (keepWorld) {
        const { sk, pose } = worldOfBones(doc);
        const w = pose.bones[i], P = pose.bones[sk.boneIndex.get(parent)], Pi = inv(P);
        const dx = w.wx - P.wx, dy = w.wy - P.wy;
        const local = mul(Pi, w);
        b = { ...b, x: tidy(Pi.a * dx + Pi.b * dy), y: tidy(Pi.c * dx + Pi.d * dy), ...decompose(local.a, local.b, local.c, local.d) };
      }
      // parents must come before children in the list
      const list = doc.bones.filter((_, j) => j !== i);
      const sub = descendants(doc, n);
      const moved = list.filter((x) => sub.has(x.name));
      const rest = list.filter((x) => !sub.has(x.name));
      const pi = rest.findIndex((x) => x.name === parent);
      rest.splice(pi + 1, 0, b, ...moved);
      t.set(["bones"], rest);
    },
  },
  "bone.remove": {
    help: "Xoá bone cùng mọi bone con, slot và key của chúng: { name }",
    run(t, { name: n }, doc) {
      const i = boneIdx(doc, n);
      if (doc.bones[i].parent === null && doc.bones.length > 1) bad("không xoá bone gốc khi còn bone khác");
      const gone = descendants(doc, n);
      const slotsGone = new Set(doc.slots.filter((s) => gone.has(s.bone)).map((s) => s.name));
      t.set(["bones"], doc.bones.filter((b) => !gone.has(b.name)));
      t.set(["slots"], doc.slots.filter((s) => !slotsGone.has(s.name)));
      t.set(["ik"], (doc.ik ?? []).filter((c) => !gone.has(c.target) && !c.bones.some((b) => gone.has(b))));
      doc.skins.forEach((s, k) => { for (const sn of slotsGone) if (s.attachments[sn]) t.del(["skins", k, "attachments", sn]); });
      mapAnimations(t, (an, a) => {
        for (const bn of gone) if (a.bones?.[bn]) dropEmpty(t, ["animations", an, "bones", bn]);
        for (const sn of slotsGone) if (a.slots?.[sn]) dropEmpty(t, ["animations", an, "slots", sn]);
      });
    },
  },

  "slot.add": {
    help: "Thêm slot trên bone: { name, bone, attachment?, color?, blend?, index? (vị trí trong draw order, mặc định trên cùng) }",
    run(t, a, doc) {
      const n = name(a.name, "name");
      if (doc.slots.some((s) => s.name === n)) bad(`đã có slot "${n}"`);
      boneIdx(doc, a.bone);
      const { name: _n, bone, index, ...rest } = a;
      const slot = { name: n, bone, color: "ffffffff", attachment: null, blend: "normal", ...cleanProps(rest, SLOT_PROPS, "slot") };
      const list = doc.slots.slice();
      list.splice(index === undefined ? list.length : Math.max(0, Math.min(list.length, num(index, "index"))), 0, slot);
      t.set(["slots"], list);
    },
  },
  "slot.set": {
    help: "Sửa slot: { name, props: { color, dark, blend, attachment, hidden } }",
    run(t, { name: n, props }, doc) {
      const i = slotIdx(doc, n);
      t.set(["slots", i], { ...doc.slots[i], ...cleanProps(props, SLOT_PROPS, `slot ${n}`) });
    },
  },
  "slot.move": {
    help: "Đổi vị trí slot trong draw order (0 = vẽ dưới cùng): { name, index }",
    run(t, { name: n, index }, doc) {
      const i = slotIdx(doc, n), list = doc.slots.slice(), [s] = list.splice(i, 1);
      list.splice(Math.max(0, Math.min(list.length, num(index, "index"))), 0, s);
      t.set(["slots"], list);
    },
  },
  "slot.rebone": {
    help: "Chuyển slot sang bone khác, ảnh giữ nguyên chỗ trên màn hình: { name, bone }",
    run(t, { name: n, bone }, doc) {
      const i = slotIdx(doc, n), from = doc.slots[i].bone;
      boneIdx(doc, bone);
      const { sk, pose } = worldOfBones(doc);
      const A = pose.bones[sk.boneIndex.get(from)], B = pose.bones[sk.boneIndex.get(bone)], Bi = inv(B);
      const M = mul(Bi, A);
      doc.skins.forEach((s, k) => {
        for (const [an, att] of Object.entries(s.attachments[n] ?? {})) {
          if (att.type === "region" || att.type === "point" || !att.type) {
            const wx = A.a * (att.x ?? 0) + A.b * (att.y ?? 0) + A.wx - B.wx, wy = A.c * (att.x ?? 0) + A.d * (att.y ?? 0) + A.wy - B.wy;
            const r = (att.rotation ?? 0) * DEG, sx = att.scaleX ?? 1, sy = att.scaleY ?? 1;
            const L = { a: Math.cos(r) * sx, b: -Math.sin(r) * sy, c: Math.sin(r) * sx, d: Math.cos(r) * sy };
            const N = mul(M, L), dcp = decompose(N.a, N.b, N.c, N.d);
            t.set(["skins", k, "attachments", n, an], { ...att, x: tidy(Bi.a * wx + Bi.b * wy), y: tidy(Bi.c * wx + Bi.d * wy), rotation: dcp.rotation, scaleX: dcp.scaleX, scaleY: dcp.scaleY });
          } else if (att.uvs && att.vertices.length === att.uvs.length) {
            const v = att.vertices.slice();
            for (let j = 0; j < v.length; j += 2) {
              const wx = A.a * v[j] + A.b * v[j + 1] + A.wx - B.wx, wy = A.c * v[j] + A.d * v[j + 1] + A.wy - B.wy;
              v[j] = tidy(Bi.a * wx + Bi.b * wy); v[j + 1] = tidy(Bi.c * wx + Bi.d * wy);
            }
            t.set(["skins", k, "attachments", n, an], { ...att, vertices: v });
          }
        }
      });
      t.set(["slots", i], { ...doc.slots[i], bone });
    },
  },
  "slot.rename": {
    help: "Đổi tên slot: { name, to }",
    run(t, { name: n, to }, doc) {
      const i = slotIdx(doc, n);
      to = name(to, "to");
      if (doc.slots.some((s) => s.name === to)) bad(`đã có slot "${to}"`);
      t.set(["slots", i], { ...doc.slots[i], name: to });
      doc.skins.forEach((s, k) => { if (s.attachments[n]) { t.set(["skins", k, "attachments", to], s.attachments[n]); t.del(["skins", k, "attachments", n]); } });
      mapAnimations(t, (an, a) => {
        if (a.slots?.[n]) { t.set(["animations", an, "slots", to], a.slots[n]); t.del(["animations", an, "slots", n]); }
        if (a.drawOrder?.length) t.set(["animations", an, "drawOrder"], a.drawOrder.map((k) => ({ ...k, order: k.order.map((x) => (x === n ? to : x)) })));
      });
    },
  },
  "slot.remove": {
    help: "Xoá slot và mọi attachment, key của nó: { name }",
    run(t, { name: n }, doc) {
      slotIdx(doc, n);
      t.set(["slots"], doc.slots.filter((s) => s.name !== n));
      doc.skins.forEach((s, k) => { if (s.attachments[n]) t.del(["skins", k, "attachments", n]); });
      mapAnimations(t, (an, a) => {
        if (a.slots?.[n]) dropEmpty(t, ["animations", an, "slots", n]);
        if (a.drawOrder?.length) t.set(["animations", an, "drawOrder"], a.drawOrder.map((k) => ({ ...k, order: k.order.filter((x) => x !== n) })));
      });
    },
  },

  "attachment.add": {
    help: "Thêm attachment vào slot: { slot, name, skin = default, attachment: { type = region, path?, x, y, rotation, scaleX, scaleY, width, height, color } }",
    run(t, { slot, name: n, skin = "default", attachment }, doc) {
      slotIdx(doc, slot);
      const k = skinIdx(doc, skin);
      n = name(n, "name");
      if (doc.skins[k].attachments[slot]?.[n]) bad(`slot "${slot}" đã có attachment "${n}" trong skin "${skin}"`);
      t.set(["skins", k, "attachments", slot, n], cleanAttachment(attachment, "attachment"));
    },
  },
  "attachment.set": {
    help: "Sửa attachment: { slot, name, skin = default, props: { x, y, rotation, scaleX, scaleY, width, height, color, path, uvs, triangles, vertices, hull } }",
    run(t, { slot, name: n, skin = "default", props }, doc) {
      const k = skinIdx(doc, skin), att = doc.skins[k].attachments[slot]?.[n] ?? bad(`không có attachment "${n}" trong slot "${slot}" (skin "${skin}")`);
      t.set(["skins", k, "attachments", slot, n], cleanAttachment({ ...att, ...props }, "attachment"));
    },
  },
  "attachment.remove": {
    help: "Xoá attachment: { slot, name, skin = default }",
    run(t, { slot, name: n, skin = "default" }, doc) {
      const k = skinIdx(doc, skin);
      if (!doc.skins[k].attachments[slot]?.[n]) bad(`không có attachment "${n}" trong slot "${slot}"`);
      t.del(["skins", k, "attachments", slot, n]);
      if (Object.keys(doc.skins[k].attachments[slot]).length === 1) t.del(["skins", k, "attachments", slot]);
      const i = slotIdx(doc, slot);
      if (doc.slots[i].attachment === n && !doc.skins.some((s, j) => j !== k && s.attachments[slot]?.[n])) t.set(["slots", i, "attachment"], null);
    },
  },
  "attachment.rename": {
    help: "Đổi tên attachment (key và slot đổi theo): { slot, name, to, skin = default }",
    run(t, { slot, name: n, to, skin = "default" }, doc) {
      const k = skinIdx(doc, skin), att = doc.skins[k].attachments[slot]?.[n] ?? bad(`không có attachment "${n}"`);
      to = name(to, "to");
      if (doc.skins[k].attachments[slot][to]) bad(`đã có attachment "${to}"`);
      t.set(["skins", k, "attachments", slot, to], att.path ? att : { ...att, path: n });
      t.del(["skins", k, "attachments", slot, n]);
      const i = slotIdx(doc, slot);
      if (doc.slots[i].attachment === n) t.set(["slots", i, "attachment"], to);
      mapAnimations(t, (an, a) => {
        const keys = a.slots?.[slot]?.attachment;
        if (keys) t.set(["animations", an, "slots", slot, "attachment"], keys.map((x) => (x.name === n ? { ...x, name: to } : x)));
      });
    },
  },

  "skin.add": {
    help: "Thêm skin: { name }",
    run(t, { name: n }, doc) {
      n = name(n, "name");
      if (doc.skins.some((s) => s.name === n)) bad(`đã có skin "${n}"`);
      t.set(["skins"], [...doc.skins, { name: n, attachments: {} }]);
    },
  },
  "skin.remove": {
    help: "Xoá skin (không xoá được default): { name }",
    run(t, { name: n }, doc) {
      skinIdx(doc, n);
      if (n === "default") bad("không xoá skin default");
      t.set(["skins"], doc.skins.filter((s) => s.name !== n));
    },
  },
  "skin.rename": {
    help: "Đổi tên skin: { name, to }",
    run(t, { name: n, to }, doc) {
      const k = skinIdx(doc, n);
      if (n === "default") bad("không đổi tên skin default");
      to = name(to, "to");
      if (doc.skins.some((s) => s.name === to)) bad(`đã có skin "${to}"`);
      t.set(["skins", k, "name"], to);
    },
  },

  "event.add": {
    help: "Thêm event: { name, int = 0, float = 0, string = '' }",
    run(t, { name: n, int = 0, float = 0, string = "" }, doc) {
      n = name(n, "name");
      if (doc.events[n]) bad(`đã có event "${n}"`);
      t.set(["events", n], { int: num(int, "int"), float: num(float, "float"), string: String(string) });
    },
  },
  "event.set": {
    help: "Sửa giá trị mặc định của event: { name, props: { int, float, string } }",
    run(t, { name: n, props }, doc) {
      const e = doc.events[n] ?? bad(`không có event "${n}"`), o = { ...e };
      for (const [k, v] of Object.entries(props ?? {})) {
        if (k === "int" || k === "float") o[k] = num(v, k);
        else if (k === "string") o[k] = String(v);
        else bad(`thuộc tính event lạ "${k}"`);
      }
      t.set(["events", n], o);
    },
  },
  "event.remove": {
    help: "Xoá event và mọi key của nó: { name }",
    run(t, { name: n }, doc) {
      if (!doc.events[n]) bad(`không có event "${n}"`);
      t.del(["events", n]);
      mapAnimations(t, (an, a) => { if (a.events?.some((e) => e.name === n)) t.set(["animations", an, "events"], a.events.filter((e) => e.name !== n)); });
    },
  },

  "ik.add": {
    help: "Thêm IK: { name, bones: [cha, con] hoặc [bone], target, bendPositive = true, mix = 1, softness = 0, stretch = false, compress = false }",
    run(t, a, doc) {
      const n = name(a.name, "name");
      if ((doc.ik ?? []).some((c) => c.name === n)) bad(`đã có IK "${n}"`);
      if (!Array.isArray(a.bones) || a.bones.length < 1 || a.bones.length > 2) bad("IK cần 1 hoặc 2 bone");
      a.bones.forEach((b) => boneIdx(doc, b));
      if (a.bones.length === 2 && doc.bones[boneIdx(doc, a.bones[1])].parent !== a.bones[0]) bad(`bone "${a.bones[1]}" phải là con trực tiếp của "${a.bones[0]}"`);
      boneIdx(doc, a.target);
      if (descendants(doc, a.bones[0]).has(a.target)) bad(`target "${a.target}" không được là con cháu của bone bị IK`);
      const c = { name: n, bones: a.bones.slice(), target: a.target, bendPositive: a.bendPositive ?? true, mix: optNum(a.mix, "mix", 1), softness: optNum(a.softness, "softness", 0), stretch: !!a.stretch, compress: !!a.compress };
      t.set(["ik"], [...(doc.ik ?? []), c]);
    },
  },
  "ik.set": {
    help: "Sửa IK: { name, props: { target, bendPositive, mix, softness, stretch, compress } }",
    run(t, { name: n, props }, doc) {
      const i = ikIdx(doc, n), c = { ...doc.ik[i] };
      for (const [k, v] of Object.entries(props ?? {})) {
        if (k === "target") { boneIdx(doc, v); if (descendants(doc, c.bones[0]).has(v)) bad("target không được là con cháu"); c.target = v; }
        else if (k === "mix" || k === "softness") c[k] = num(v, k);
        else if (["bendPositive", "stretch", "compress"].includes(k)) c[k] = !!v;
        else bad(`thuộc tính IK lạ "${k}"`);
      }
      t.set(["ik", i], c);
    },
  },
  "ik.remove": {
    help: "Xoá IK: { name }",
    run(t, { name: n }, doc) {
      ikIdx(doc, n);
      t.set(["ik"], doc.ik.filter((c) => c.name !== n));
      mapAnimations(t, (an, a) => { if (a.ik?.[n]) dropEmpty(t, ["animations", an, "ik", n]); });
    },
  },

  "anim.add": {
    help: "Thêm animation rỗng: { name }",
    run(t, { name: n }, doc) {
      n = name(n, "name");
      if (doc.animations[n]) bad(`đã có animation "${n}"`);
      t.set(["animations", n], {});
    },
  },
  "anim.remove": { help: "Xoá animation: { name }", run(t, { name: n }, doc) { animOf(doc, n); t.del(["animations", n]); } },
  "anim.rename": {
    help: "Đổi tên animation: { name, to }",
    run(t, { name: n, to }, doc) {
      const a = animOf(doc, n);
      to = name(to, "to");
      if (doc.animations[to]) bad(`đã có animation "${to}"`);
      t.set(["animations", to], a);
      t.del(["animations", n]);
    },
  },
  "anim.duplicate": {
    help: "Nhân bản animation: { name, to }",
    run(t, { name: n, to }, doc) {
      const a = animOf(doc, n);
      to = name(to, "to");
      if (doc.animations[to]) bad(`đã có animation "${to}"`);
      t.set(["animations", to], JSON.parse(JSON.stringify(a)));
    },
  },
  "anim.clear": {
    help: "Xoá mọi key của animation (giữ animation): { name }",
    run(t, { name: n }, doc) { animOf(doc, n); t.set(["animations", n], {}); },
  },

  "key.set": {
    help: "Đặt (hoặc thay) key: { anim, track, time (giây), value, curve? }. track: {bone, prop: rotate|translate|scale|shear} (value: số độ cho rotate, {x,y} còn lại; giá trị tương đối với setup pose: rotate/translate/shear cộng, scale nhân), {slot, prop: attachment|rgba} (value: tên hoặc null / 'rrggbbaa'), {drawOrder:true} (value: mảng tên slot dưới→trên), {event:true} (value: {name, int?, float?, string?}), {ik} (value: {mix, softness, bendPositive, stretch, compress})",
    run(t, { anim, track, time: tm, value, curve }, doc) {
      animOf(doc, anim);
      const path = trackPath(doc, anim, track), at = time(tm);
      if (at < 0) bad("time không âm");
      const fields = keyFields(doc, track, value);
      const keys = (t.get(path) ?? []).slice();
      const key = { time: at, ...fields };
      if (interpolates(track)) { const c = curveArg(curve); if (c) key.curve = c; }
      if (track.event) { keys.push(key); keys.sort((x, y) => x.time - y.time); t.set(path, keys); return; }
      const i = keys.findIndex((k) => Math.abs(k.time - at) < 1e-4);
      if (i >= 0) { if (curve === undefined && keys[i].curve !== undefined && interpolates(track)) key.curve = keys[i].curve; keys[i] = key; }
      else { keys.push(key); keys.sort((x, y) => x.time - y.time); }
      t.set(path, keys);
    },
  },
  "key.remove": {
    help: "Xoá key tại thời điểm: { anim, track, time } (event: kèm value.name để chọn đúng event)",
    run(t, { anim, track, time: tm, value }, doc) {
      animOf(doc, anim);
      const path = trackPath(doc, anim, track), at = time(tm), keys = t.get(path) ?? [];
      const i = keys.findIndex((k) => Math.abs(k.time - at) < 1e-4 && (!track.event || !value?.name || k.name === value.name));
      if (i < 0) bad(`không có key ở ${at}s`);
      const rest = keys.filter((_, j) => j !== i);
      if (rest.length) t.set(path, rest);
      else dropEmpty(t, path);
    },
  },
  "key.move": {
    help: "Dời key sang thời điểm khác (đè key ở đó nếu có): { anim, track, time, to }",
    run(t, { anim, track, time: tm, to }, doc) {
      animOf(doc, anim);
      const path = trackPath(doc, anim, track), at = time(tm), dest = time(to);
      if (dest < 0) bad("to không âm");
      const keys = (t.get(path) ?? []).slice(), i = keys.findIndex((k) => Math.abs(k.time - at) < 1e-4);
      if (i < 0) bad(`không có key ở ${at}s`);
      const k = { ...keys[i], time: dest };
      const rest = keys.filter((x, j) => j !== i && (track.event || Math.abs(x.time - dest) >= 1e-4));
      rest.push(k); rest.sort((x, y) => x.time - y.time);
      t.set(path, rest);
    },
  },
  "key.curve": {
    help: "Đổi curve của key (đoạn từ key này tới key sau): { anim, track, time, curve: linear|stepped|[x1,y1,x2,y2] }",
    run(t, { anim, track, time: tm, curve }, doc) {
      animOf(doc, anim);
      if (!interpolates(track)) bad("track này không có curve");
      const path = trackPath(doc, anim, track), at = time(tm), keys = (t.get(path) ?? []).slice();
      const i = keys.findIndex((k) => Math.abs(k.time - at) < 1e-4);
      if (i < 0) bad(`không có key ở ${at}s`);
      const c = curveArg(curve), k = { ...keys[i] };
      if (c) k.curve = c; else delete k.curve;
      keys[i] = k;
      t.set(path, keys);
    },
  },

  // Internal: restore recorded state (undo). Not for agents.
  $patch: { help: "nội bộ", internal: true, run() {} },
  // Internal: replace whole doc (load, final sync).
  $replace: {
    help: "nội bộ: thay cả tài liệu { doc }", internal: true,
    run(t, { doc: next }) { for (const k of Object.keys(t.doc)) if (!(k in next)) t.del([k]); for (const [k, v] of Object.entries(next)) t.set([k], v); },
  },
};

function dropEmpty(t, path) {
  t.del(path);
  for (let n = path.length - 1; n > 2; n--) {
    const p = path.slice(0, n), o = t.get(p);
    if (o && typeof o === "object" && !Array.isArray(o) && !Object.keys(o).length) t.del(p); else break;
  }
}
function renameWeights() { /* weighted vertices store bone indices, not names: nothing to rename */ }

// ---- public API --------------------------------------------------------------------------------
export function apply(doc, cmd) {
  if (!cmd || typeof cmd !== "object") throw new CommandError("command phải là object { type, ... }");
  if (cmd.type === "$patch") return applyPatch(doc, cmd.ops);
  const def = COMMANDS[cmd.type] ?? bad(`command lạ "${cmd.type}". Có: ${Object.keys(COMMANDS).filter((k) => !k.startsWith("$")).join(", ")}`);
  const t = transaction(doc);
  const { type: _t, ...args } = cmd;
  def.run(t, args, doc);
  // weighted mesh vertices reference bones by index: refuse structural edits that would shift them
  if (t.doc.bones !== doc.bones && hasWeights(doc) && !sameBoneOrder(doc.bones, t.doc.bones)) {
    bad("đổi thứ tự bone khi có mesh gắn weight chưa hỗ trợ");
  }
  return { doc: t.doc, inverse: { type: "$patch", ops: t.inverse() } };
}
const hasWeights = (doc) => doc.skins.some((s) => Object.values(s.attachments).some((m) => Object.values(m).some((a) => a.uvs && a.vertices.length > a.uvs.length)));
const sameBoneOrder = (a, b) => a.length === b.length && a.every((x, i) => x.name === b[i].name);

// Applies a list atomically: all or nothing. Returns { doc, inverses } with inverses in undo order.
export function applyAll(doc, cmds) {
  const inverses = [];
  let d = doc;
  for (const [i, c] of cmds.entries()) {
    try {
      const r = apply(d, c);
      d = r.doc;
      inverses.unshift(r.inverse);
    } catch (e) {
      e.message = `command #${i + 1} (${c?.type}): ${e.message}`;
      throw e;
    }
  }
  return { doc: d, inverses };
}

export { CommandError };
