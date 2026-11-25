// Spine-compatible JSON: import (3.8 and 4.0–4.2) and export (4.2), written from the public format docs.
import { emptyDoc } from "./commands.js?v=20261125h";
import { animationDuration, buildSkeleton, setupPose, updateWorld, drawList, bounds } from "../runtime/xuong.js?v=20261125h";

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const lowerHex = (c, n = 8) => (c ? String(c).toLowerCase().padEnd(n, "f").slice(0, n) : undefined);

// ---- export ------------------------------------------------------------------------------------
function curveOut(key, next, values, nextValues) {
  if (!key.curve || !next) return undefined;
  if (key.curve === "stepped") return "stepped";
  const [x1, y1, x2, y2] = key.curve, t1 = key.time, dt = next.time - t1, out = [];
  values.forEach((v, i) => { const dv = nextValues[i] - v; out.push(r4(t1 + x1 * dt), r4(v + y1 * dv), r4(t1 + x2 * dt), r4(v + y2 * dv)); });
  return out;
}
function keysOut(keys, fields, valuesOf) {
  return keys.map((k, i) => {
    const o = {};
    if (k.time) o.time = r4(k.time);
    Object.assign(o, fields(k));
    const c = curveOut(k, keys[i + 1], valuesOf(k), keys[i + 1] ? valuesOf(keys[i + 1]) : []);
    if (c) o.curve = c;
    return o;
  });
}
const rgbaVals = (hex) => { const s = hex.padEnd(8, "f"); return [0, 2, 4, 6].map((i) => parseInt(s.slice(i, i + 2), 16) / 255); };

export function toSpine(doc, { imagesPath = "./images/" } = {}) {
  let aabb = { x: 0, y: 0, width: 0, height: 0 };
  try { const sk = buildSkeleton(doc), p = setupPose(sk); updateWorld(sk, p); aabb = bounds(drawList(sk, p)); } catch {}
  const json = { skeleton: { hash: hash(JSON.stringify(doc)), spine: "4.2.0", x: r4(aabb.x), y: r4(aabb.y), width: r4(aabb.width), height: r4(aabb.height), fps: doc.fps, images: imagesPath, audio: "" } };
  json.bones = doc.bones.map((b) => {
    const o = { name: b.name };
    if (b.parent) o.parent = b.parent;
    for (const [k, d] of [["length", 0], ["rotation", 0], ["x", 0], ["y", 0], ["scaleX", 1], ["scaleY", 1], ["shearX", 0], ["shearY", 0]]) if ((b[k] ?? d) !== d) o[k] = r4(b[k]);
    if (b.inherit && b.inherit !== "normal") o.inherit = b.inherit;
    if (b.color && b.color !== "989898ff") o.color = b.color;
    return o;
  });
  json.slots = doc.slots.map((s) => {
    const o = { name: s.name, bone: s.bone };
    if (s.color && s.color !== "ffffffff") o.color = s.color;
    if (s.dark) o.dark = s.dark;
    if (s.attachment) o.attachment = s.attachment;
    if (s.blend && s.blend !== "normal") o.blend = s.blend;
    return o;
  });
  if (doc.ik?.length) json.ik = doc.ik.map((c, i) => ({ name: c.name, order: i, bones: c.bones, target: c.target, ...(c.mix !== 1 ? { mix: c.mix } : {}), ...(c.softness ? { softness: c.softness } : {}), ...(c.bendPositive === false ? { bendPositive: false } : {}), ...(c.stretch ? { stretch: true } : {}), ...(c.compress ? { compress: true } : {}) }));
  json.skins = doc.skins.map((k) => {
    const atts = {};
    for (const [slot, m] of Object.entries(k.attachments)) {
      atts[slot] = {};
      for (const [name, a] of Object.entries(m)) {
        const o = {};
        if (a.type && a.type !== "region") o.type = a.type;
        if (a.path && a.path !== name) o.path = a.path;
        for (const [f, d] of [["x", 0], ["y", 0], ["rotation", 0], ["scaleX", 1], ["scaleY", 1]]) if (a[f] !== undefined && a[f] !== d) o[f] = r4(a[f]);
        for (const f of ["width", "height", "uvs", "triangles", "vertices", "hull", "edges", "vertexCount", "end"]) if (a[f] !== undefined) o[f] = a[f];
        if (a.color && a.color !== "ffffffff") o.color = a.color;
        atts[slot][name] = o;
      }
    }
    return { name: k.name, attachments: atts };
  });
  if (Object.keys(doc.events).length) json.events = Object.fromEntries(Object.entries(doc.events).map(([n, e]) => [n, { ...(e.int ? { int: e.int } : {}), ...(e.float ? { float: e.float } : {}), ...(e.string ? { string: e.string } : {}) }]));
  json.animations = {};
  const setupIndex = new Map(doc.slots.map((s, i) => [s.name, i]));
  for (const [an, a] of Object.entries(doc.animations)) {
    const o = {};
    if (a.bones) {
      o.bones = {};
      for (const [b, tl] of Object.entries(a.bones)) {
        const t = {};
        if (tl.rotate) t.rotate = keysOut(tl.rotate, (k) => ({ value: r4(k.value) }), (k) => [k.value]);
        for (const p of ["translate", "scale", "shear"]) if (tl[p]) t[p] = keysOut(tl[p], (k) => ({ x: r4(k.x), y: r4(k.y) }), (k) => [k.x, k.y]);
        o.bones[b] = t;
      }
    }
    if (a.slots) {
      o.slots = {};
      for (const [s, tl] of Object.entries(a.slots)) {
        const t = {};
        if (tl.attachment) t.attachment = tl.attachment.map((k) => ({ ...(k.time ? { time: r4(k.time) } : {}), name: k.name }));
        if (tl.rgba) t.rgba = keysOut(tl.rgba, (k) => ({ color: k.color }), (k) => rgbaVals(k.color));
        o.slots[s] = t;
      }
    }
    if (a.ik) o.ik = Object.fromEntries(Object.entries(a.ik).map(([n, keys]) => [n, keysOut(keys, (k) => ({ mix: k.mix ?? 1, softness: k.softness ?? 0, bendPositive: k.bendPositive ?? true, ...(k.stretch ? { stretch: true } : {}), ...(k.compress ? { compress: true } : {}) }), (k) => [k.mix ?? 1, k.softness ?? 0])]));
    if (a.drawOrder?.length) {
      o.drawOrder = a.drawOrder.map((k) => {
        const offsets = [];
        k.order.forEach((s, i) => { const d = i - setupIndex.get(s); if (d) offsets.push({ slot: s, offset: d }); });
        offsets.sort((x, y) => setupIndex.get(x.slot) - setupIndex.get(y.slot));
        return { ...(k.time ? { time: r4(k.time) } : {}), offsets };
      });
    }
    if (a.events?.length) o.events = a.events.map((e) => ({ ...(e.time ? { time: r4(e.time) } : {}), name: e.name, ...(e.int !== undefined ? { int: e.int } : {}), ...(e.float !== undefined ? { float: e.float } : {}), ...(e.string !== undefined ? { string: e.string } : {}) }));
    json.animations[an] = o;
  }
  return json;
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

// ---- import ------------------------------------------------------------------------------------
// Bezier from the file to our normalized form. 4.x: [t1,v1,t2,v2] per channel (absolute); 3.8: number + c2..c4, or a 4-array normalized.
function curveIn(k, next, vals, nextVals, v4) {
  const c = k.curve;
  if (c === undefined || c === null) return undefined;
  if (c === "stepped") return "stepped";
  if (typeof c === "number") return [c, k.c2 ?? 0, k.c3 ?? 1, k.c4 ?? 1].map(r4);
  if (!Array.isArray(c) || !next) return undefined;
  if (!v4 && c.length === 4) return c.map(r4);
  const t1 = k.time ?? 0, dt = (next.time ?? 0) - t1 || 1;
  for (let i = 0; i < vals.length && i * 4 + 3 < c.length; i++) {
    const dv = nextVals[i] - vals[i];
    if (Math.abs(dv) < 1e-9) continue;
    return [(c[i * 4] - t1) / dt, (c[i * 4 + 1] - vals[i]) / dv, (c[i * 4 + 2] - t1) / dt, (c[i * 4 + 3] - vals[i]) / dv].map(r4);
  }
  return [r4((c[0] - t1) / dt), 0, r4((c[2] - t1) / dt), 1];
}
function keysIn(list, fields, valuesOf, v4) {
  const keys = list ?? [];
  return keys.map((k, i) => {
    const o = { time: r4(k.time ?? 0), ...fields(k) };
    const c = curveIn(k, keys[i + 1], valuesOf(k), keys[i + 1] ? valuesOf(keys[i + 1]) : [], v4);
    if (c) o.curve = c;
    return o;
  });
}

export function fromSpine(json, { name = "Nhập từ JSON" } = {}) {
  const warnings = [];
  const ver = String(json.skeleton?.spine ?? json.skeleton?.version ?? "4.2");
  const v4 = !/^3\./.test(ver);
  const doc = emptyDoc(name);
  doc.fps = json.skeleton?.fps ?? 30;
  doc.bones = (json.bones ?? []).map((b) => ({
    name: b.name, parent: b.parent ?? null, length: b.length ?? 0, x: b.x ?? 0, y: b.y ?? 0, rotation: b.rotation ?? 0,
    scaleX: b.scaleX ?? 1, scaleY: b.scaleY ?? 1, shearX: b.shearX ?? 0, shearY: b.shearY ?? 0,
    inherit: b.inherit ?? b.transform ?? "normal", color: lowerHex(b.color) ?? "989898ff",
  }));
  if (!doc.bones.length) doc.bones = emptyDoc().bones;
  doc.slots = (json.slots ?? []).map((s) => ({ name: s.name, bone: s.bone, color: lowerHex(s.color) ?? "ffffffff", ...(s.dark ? { dark: lowerHex(s.dark, 6) } : {}), attachment: s.attachment ?? null, blend: s.blend ?? "normal" }));
  doc.ik = (json.ik ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((c) => ({ name: c.name, bones: c.bones, target: c.target, mix: c.mix ?? 1, softness: c.softness ?? 0, bendPositive: c.bendPositive ?? true, stretch: !!c.stretch, compress: !!c.compress }));
  for (const k of ["transform", "path", "physics"]) if (json[k]?.length) warnings.push(`${json[k].length} ${k} constraint chưa hỗ trợ, bị bỏ qua`);
  const skins = Array.isArray(json.skins) ? json.skins : Object.entries(json.skins ?? {}).map(([n, attachments]) => ({ name: n, attachments }));
  doc.skins = skins.map((k) => {
    const attachments = {};
    for (const [slot, m] of Object.entries(k.attachments ?? {})) {
      attachments[slot] = {};
      for (const [an, a] of Object.entries(m)) {
        const type = a.type ?? "region";
        if (type === "linkedmesh" || type === "path") { warnings.push(`attachment ${slot}/${an} kiểu ${type} chưa hỗ trợ, bị bỏ qua`); continue; }
        const o = { type, ...(a.path ? { path: a.path } : { path: a.name ?? an }) };
        for (const f of ["x", "y", "rotation", "scaleX", "scaleY", "width", "height", "uvs", "triangles", "vertices", "hull", "edges", "vertexCount", "end"]) if (a[f] !== undefined) o[f] = a[f];
        if (a.color) o.color = lowerHex(a.color);
        if (type === "region" && !(o.width && o.height)) { warnings.push(`region ${an} thiếu kích thước`); continue; }
        attachments[slot][an] = o;
      }
    }
    return { name: k.name, attachments };
  });
  if (!doc.skins.some((k) => k.name === "default")) doc.skins.unshift({ name: "default", attachments: {} });
  doc.events = Object.fromEntries(Object.entries(json.events ?? {}).map(([n, e]) => [n, { int: e.int ?? 0, float: e.float ?? 0, string: e.string ?? "" }]));
  const slotNames = doc.slots.map((s) => s.name);
  for (const [an, a] of Object.entries(json.animations ?? {})) {
    const o = {};
    for (const [b, tl] of Object.entries(a.bones ?? {})) {
      const t = {};
      if (tl.rotate) t.rotate = keysIn(tl.rotate, (k) => ({ value: k.value ?? k.angle ?? 0 }), (k) => [k.value ?? k.angle ?? 0], v4);
      for (const [p, d] of [["translate", 0], ["scale", 1], ["shear", 0]]) {
        if (tl[p]) t[p] = keysIn(tl[p], (k) => ({ x: k.x ?? d, y: k.y ?? d }), (k) => [k.x ?? d, k.y ?? d], v4);
        const xs = tl[p + "x"], ys = tl[p + "y"];
        if ((xs || ys) && !tl[p]) {
          const times = [...new Set([...(xs ?? []), ...(ys ?? [])].map((k) => k.time ?? 0))].sort((m, n) => m - n);
          const at = (list, time) => { if (!list?.length) return d; let v = list[0].value ?? d; for (const k of list) if ((k.time ?? 0) <= time) v = k.value ?? d; return v; };
          t[p] = times.map((time) => ({ time: r4(time), x: at(xs, time), y: at(ys, time) }));
          warnings.push(`${an}/${b}: ${p} X/Y tách riêng được gộp lại (curve mất)`);
        }
      }
      for (const k of Object.keys(tl)) if (!["rotate", "translate", "scale", "shear", "translatex", "translatey", "scalex", "scaley", "shearx", "sheary"].includes(k)) warnings.push(`${an}/${b}: timeline ${k} chưa hỗ trợ`);
      if (Object.keys(t).length) (o.bones ??= {})[b] = t;
    }
    for (const [s, tl] of Object.entries(a.slots ?? {})) {
      const t = {};
      if (tl.attachment) t.attachment = tl.attachment.map((k) => ({ time: r4(k.time ?? 0), name: k.name ?? null }));
      const col = tl.rgba ?? tl.color ?? tl.rgba2?.map((k) => ({ ...k, color: k.light })) ?? tl.twoColor?.map((k) => ({ ...k, color: k.light }));
      if (col) t.rgba = keysIn(col, (k) => ({ color: lowerHex(k.color) }), (k) => rgbaVals(lowerHex(k.color)), v4);
      if (tl.alpha && !col) t.rgba = keysIn(tl.alpha, (k) => ({ color: "ffffff" + Math.round((k.value ?? 1) * 255).toString(16).padStart(2, "0") }), (k) => [1, 1, 1, k.value ?? 1], v4);
      if (Object.keys(t).length) (o.slots ??= {})[s] = t;
    }
    for (const [n, keys] of Object.entries(a.ik ?? {})) (o.ik ??= {})[n] = keysIn(keys, (k) => ({ mix: k.mix ?? 1, softness: k.softness ?? 0, bendPositive: k.bendPositive ?? true, stretch: !!k.stretch, compress: !!k.compress }), (k) => [k.mix ?? 1, k.softness ?? 0], v4);
    const deformSrc = a.deform ?? Object.fromEntries(Object.entries(a.attachments ?? {}).map(([sk, slots]) => [sk, Object.fromEntries(Object.entries(slots).map(([sl, atts]) => [sl, Object.fromEntries(Object.entries(atts).filter(([, t]) => t.deform).map(([an2, t]) => [an2, t.deform]))]))]));
    for (const [sk, slots] of Object.entries(deformSrc ?? {})) for (const [sl, atts] of Object.entries(slots)) for (const [att, keys] of Object.entries(atts)) {
      ((((o.deform ??= {})[sk] ??= {})[sl] ??= {})[att]) = keys.map((k) => ({ time: r4(k.time ?? 0), vertices: [...new Array(k.offset ?? 0).fill(0), ...(k.vertices ?? [])] }));
    }
    const dOrder = a.drawOrder ?? a.draworder;
    if (dOrder?.length) o.drawOrder = dOrder.map((k) => ({ time: r4(k.time ?? 0), order: k.offsets ? applyOffsets(slotNames, k.offsets) : slotNames.slice() }));
    if (a.events?.length) o.events = a.events.map((e) => ({ time: r4(e.time ?? 0), name: e.name, ...(e.int !== undefined ? { int: e.int } : {}), ...(e.float !== undefined ? { float: e.float } : {}), ...(e.string !== undefined ? { string: e.string } : {}) }));
    for (const k of ["transform", "path", "physics"]) if (a[k]) warnings.push(`${an}: timeline ${k} chưa hỗ trợ`);
    doc.animations[an] = o;
  }
  return { doc, warnings: [...new Set(warnings)], version: ver };
}
// Spine's draw order offsets: listed slots move by offset from their setup index; the rest keep setup order in the gaps.
function applyOffsets(names, offsets) {
  const n = names.length, out = new Array(n).fill(null), unchanged = [];
  const idx = new Map(names.map((s, i) => [s, i]));
  let orig = 0;
  for (const o of offsets) {
    const i = idx.get(o.slot);
    if (i === undefined) continue;
    while (orig !== i) unchanged.push(names[orig++]);
    out[i + o.offset] = names[orig++];
  }
  while (orig < n) unchanged.push(names[orig++]);
  for (let i = n - 1; i >= 0; i--) if (out[i] === null) out[i] = unchanged.pop();
  return out;
}
export { animationDuration };
