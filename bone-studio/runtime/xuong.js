// Xưởng Xương runtime: pose, timelines, world transforms, canvas2D drawing.
// Reads the Xưởng Xương document format (docs/bone-studio.md). No DOM needed except draw2d().

export const DEG = Math.PI / 180;
const cosd = (d) => Math.cos(d * DEG), sind = (d) => Math.sin(d * DEG);

export const BONE_DEFAULTS = { parent: null, length: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, inherit: "normal" };
export const INHERIT = ["normal", "onlyTranslation", "noRotationOrReflection", "noScale", "noScaleOrReflection"];
export const BLENDS = ["normal", "additive", "multiply", "screen"];

export function parseColor(hex) {
  const s = String(hex ?? "ffffffff").replace(/^#/, "");
  const n = (i) => (s.length >= i + 2 ? parseInt(s.slice(i, i + 2), 16) / 255 : 1);
  return [n(0), n(2), n(4), s.length >= 8 ? n(6) : 1];
}
export function colorHex(c) {
  return c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
}

// ---- curves ------------------------------------------------------------------------------------
// curve: undefined | "linear" = linear, "stepped", or [x1, y1, x2, y2] normalized bezier (0..1 in time and value)
export function curveAt(curve, p) {
  if (!curve || curve === "linear") return p;
  if (curve === "stepped") return 0;
  const [x1, y1, x2, y2] = curve;
  let lo = 0, hi = 1, t = p;
  for (let i = 0; i < 24; i++) {
    const x = bez(x1, x2, t);
    if (Math.abs(x - p) < 1e-6) break;
    if (x < p) lo = t; else hi = t;
    t = (lo + hi) / 2;
  }
  return bez(y1, y2, t);
}
const bez = (a, b, t) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;

// keys sorted by time. Returns [index of key at or before time, fraction toward next] or [-1, 0] before first key.
export function findKey(keys, time) {
  if (!keys?.length || time < keys[0].time) return [-1, 0];
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].time <= time) i++;
  const k = keys[i], n = keys[i + 1];
  if (!n) return [i, 0];
  const span = n.time - k.time;
  return [i, span > 0 ? curveAt(k.curve, (time - k.time) / span) : 0];
}

// ---- skeleton index ----------------------------------------------------------------------------
export function getAttachment(doc, skin, slot, name) {
  if (name == null) return null;
  const s = doc.skins?.find((k) => k.name === skin);
  return s?.attachments?.[slot]?.[name] ?? doc.skins?.find((k) => k.name === "default")?.attachments?.[slot]?.[name] ?? null;
}

export function buildSkeleton(doc) {
  const index = new Map();
  const bones = doc.bones.map((b, i) => {
    index.set(b.name, i);
    return { ...BONE_DEFAULTS, ...b, index: i, parentIndex: -1, children: [] };
  });
  for (const b of bones) {
    if (b.parent != null) {
      const p = index.get(b.parent);
      if (p === undefined) throw new Error(`bone "${b.name}" trỏ tới cha "${b.parent}" không tồn tại`);
      b.parentIndex = p;
      bones[p].children.push(b.index);
    }
  }
  const order = [];
  const visit = (i) => { order.push(i); for (const c of bones[i].children) visit(c); };
  bones.forEach((b) => { if (b.parentIndex < 0) visit(b.index); });
  const slotIndex = new Map();
  const slots = doc.slots.map((s, i) => {
    slotIndex.set(s.name, i);
    const bi = index.get(s.bone);
    if (bi === undefined) throw new Error(`slot "${s.name}" trỏ tới bone "${s.bone}" không tồn tại`);
    return { ...s, index: i, boneIndex: bi, color: parseColor(s.color), dark: s.dark ? parseColor(s.dark) : null, blend: s.blend ?? "normal" };
  });
  const ik = (doc.ik ?? []).map((c) => ({ ...c, boneIdx: c.bones.map((n) => index.get(n)), targetIdx: index.get(c.target) }))
    .filter((c) => c.boneIdx.every((i) => i !== undefined) && c.targetIdx !== undefined);
  const transform = (doc.transform ?? []).map((c) => ({ ...c, boneIdx: c.bones.map((n) => index.get(n)), targetIdx: index.get(c.target) }))
    .filter((c) => c.boneIdx.every((i) => i !== undefined) && c.targetIdx !== undefined);
  // constraint order: explicit "order" first, otherwise IK before transform, each in list order
  const constraints = [...ik.map((c, n) => ({ kind: "ik", n, order: c.order ?? n })), ...transform.map((c, n) => ({ kind: "transform", n, order: c.order ?? ik.length + n }))]
    .sort((a, b) => a.order - b.order);
  return { doc, bones, boneIndex: index, order, slots, slotIndex, ik, transform, constraints };
}

// ---- pose --------------------------------------------------------------------------------------
export function setupPose(sk, skin = "default") {
  return {
    skin,
    bones: sk.bones.map((b) => ({ x: b.x, y: b.y, rotation: b.rotation, scaleX: b.scaleX, scaleY: b.scaleY, shearX: b.shearX, shearY: b.shearY, inherit: b.inherit, a: 1, b: 0, c: 0, d: 1, wx: 0, wy: 0 })),
    slots: sk.slots.map((s) => ({ attachment: s.attachment ?? null, color: s.color.slice(), dark: s.dark?.slice() ?? null, deform: null })),
    drawOrder: sk.slots.map((s) => s.index),
    ik: sk.ik.map((c) => ({ mix: c.mix ?? 1, softness: c.softness ?? 0, bendPositive: c.bendPositive ?? true, compress: !!c.compress, stretch: !!c.stretch })),
    transform: sk.transform.map(transformMixes),
  };
}

export const TRANSFORM_MIXES = ["mixRotate", "mixX", "mixY", "mixScaleX", "mixScaleY", "mixShearY"];
export function transformMixes(c) {
  return { mixRotate: c.mixRotate ?? 1, mixX: c.mixX ?? 1, mixY: c.mixY ?? c.mixX ?? 1, mixScaleX: c.mixScaleX ?? 1, mixScaleY: c.mixScaleY ?? c.mixScaleX ?? 1, mixShearY: c.mixShearY ?? 1 };
}
export function updateWorld(sk, pose) {
  for (const i of sk.order) worldOf(sk, pose, i);
  for (const c of sk.constraints ?? []) {
    if (c.kind === "ik") applyIk(sk, pose, sk.ik[c.n], pose.ik[c.n]);
    else applyTransform(sk, pose, sk.transform[c.n], pose.transform?.[c.n] ?? transformMixes(sk.transform[c.n]));
  }
}

// ---- transform constraint ----------------------------------------------------------------------
// Copies the target's rotation / translation / scale / shearY onto each constrained bone, plus offsets, by mix.
// world (default): match the target in world space. local: match the target's local values. relative: add them.
const wrap180 = (d) => ((((d % 360) + 540) % 360) - 180);
const shearOf = (p) => (Math.atan2(p.d, p.b) - Math.atan2(p.c, p.a)) / DEG - 90;
function applyTransform(sk, pose, c, st) {
  const t = pose.bones[c.targetIdx], off = { r: c.rotation ?? 0, x: c.x ?? 0, y: c.y ?? 0, sx: c.scaleX ?? 0, sy: c.scaleY ?? 0, sh: c.shearY ?? 0 };
  for (const i of c.boneIdx) {
    const p = pose.bones[i];
    if (c.local && c.relative) {
      p.rotation += (t.rotation + off.r) * st.mixRotate;
      p.x += (t.x + off.x) * st.mixX; p.y += (t.y + off.y) * st.mixY;
      p.scaleX *= 1 + (t.scaleX - 1 + off.sx) * st.mixScaleX; p.scaleY *= 1 + (t.scaleY - 1 + off.sy) * st.mixScaleY;
      p.shearY += (t.shearY + off.sh) * st.mixShearY;
    } else if (c.local) {
      p.rotation += wrap180(t.rotation + off.r - p.rotation) * st.mixRotate;
      p.x = lerp(p.x, t.x + off.x, st.mixX); p.y = lerp(p.y, t.y + off.y, st.mixY);
      p.scaleX = lerp(p.scaleX, t.scaleX + off.sx, st.mixScaleX); p.scaleY = lerp(p.scaleY, t.scaleY + off.sy, st.mixScaleY);
      p.shearY = lerp(p.shearY, t.shearY + off.sh, st.mixShearY);
    } else {
      worldOf(sk, pose, i);
      const pi = sk.bones[i].parentIndex, q = pi < 0 ? null : pose.bones[pi];
      const flip = q && q.a * q.d - q.b * q.c < 0 ? -1 : 1;
      if (c.relative) p.rotation += flip * (worldRotation(t) + off.r) * st.mixRotate;
      else p.rotation += flip * wrap180(worldRotation(t) + off.r - worldRotation(p)) * st.mixRotate;
      let wx, wy;
      if (c.relative) { wx = p.wx + (t.wx + off.x) * st.mixX; wy = p.wy + (t.wy + off.y) * st.mixY; }
      else { const [tx, ty] = localToWorld(t, off.x, off.y); wx = lerp(p.wx, tx, st.mixX); wy = lerp(p.wy, ty, st.mixY); }
      if (st.mixX || st.mixY) { const [lx, ly] = q ? worldToLocal(q, wx, wy) : [wx, wy]; p.x = lx; p.y = ly; }
      const cx = Math.hypot(p.a, p.c), cy = Math.hypot(p.b, p.d), tx = Math.hypot(t.a, t.c) + off.sx, ty = Math.hypot(t.b, t.d) + off.sy;
      if (cx > 1e-6) p.scaleX *= c.relative ? 1 + (tx - 1) * st.mixScaleX : 1 + (tx / cx - 1) * st.mixScaleX;
      if (cy > 1e-6) p.scaleY *= c.relative ? 1 + (ty - 1) * st.mixScaleY : 1 + (ty / cy - 1) * st.mixScaleY;
      if (st.mixShearY) p.shearY += c.relative ? (shearOf(t) + off.sh) * st.mixShearY : wrap180(shearOf(t) + off.sh - shearOf(p)) * st.mixShearY;
    }
    updateChildren(sk, pose, i);
  }
}

function worldOf(sk, pose, i) {
  const bd = sk.bones[i], p = pose.bones[i];
  const rx = p.rotation + p.shearX, ry = p.rotation + 90 + p.shearY;
  const la = cosd(rx) * p.scaleX, lb = cosd(ry) * p.scaleY, lc = sind(rx) * p.scaleX, ld = sind(ry) * p.scaleY;
  if (bd.parentIndex < 0) {
    p.a = la; p.b = lb; p.c = lc; p.d = ld; p.wx = p.x; p.wy = p.y;
    return;
  }
  const q = pose.bones[bd.parentIndex];
  let pa = q.a, pb = q.b, pc = q.c, pd = q.d;
  p.wx = pa * p.x + pb * p.y + q.wx;
  p.wy = pc * p.x + pd * p.y + q.wy;
  const mode = p.inherit ?? "normal";
  if (mode !== "normal") {
    const det = pa * pd - pb * pc, sign = det < 0 ? -1 : 1, th = Math.atan2(pc, pa), ct = Math.cos(th), st = Math.sin(th);
    if (mode === "onlyTranslation") { pa = 1; pb = 0; pc = 0; pd = 1; }
    else if (mode === "noRotationOrReflection") {
      // R(-th) * P, then undo reflection on the second row
      const a = ct * pa + st * pc, b = ct * pb + st * pd, c = -st * pa + ct * pc, d = -st * pb + ct * pd;
      pa = a; pb = b; pc = c * sign; pd = d * sign;
    } else if (mode === "noScale") { pa = ct; pb = -st * sign; pc = st; pd = ct * sign; }
    else { pa = ct; pb = -st; pc = st; pd = ct; }
  }
  p.a = pa * la + pb * lc; p.b = pa * lb + pb * ld;
  p.c = pc * la + pd * lc; p.d = pc * lb + pd * ld;
}

export function updateChildren(sk, pose, i) {
  worldOf(sk, pose, i);
  for (const c of sk.bones[i].children) updateChildren(sk, pose, c);
}

// world point -> bone-local point of bone i's parent space (for posing)
export function worldToParent(sk, pose, i, wx, wy) {
  const pi = sk.bones[i].parentIndex;
  if (pi < 0) return [wx, wy];
  return worldToLocal(pose.bones[pi], wx, wy);
}
export function worldToLocal(p, wx, wy) {
  const det = p.a * p.d - p.b * p.c || 1e-9, x = wx - p.wx, y = wy - p.wy;
  return [(p.d * x - p.b * y) / det, (p.a * y - p.c * x) / det];
}
export function localToWorld(p, x, y) { return [p.a * x + p.b * y + p.wx, p.c * x + p.d * y + p.wy]; }
export function worldRotation(p) { return Math.atan2(p.c, p.a) / DEG; }
export function worldScaleX(p) { return Math.hypot(p.a, p.c); }

// ---- IK ----------------------------------------------------------------------------------------
function applyIk(sk, pose, c, st) {
  if (!st.mix) return;
  const t = pose.bones[c.targetIdx];
  if (c.boneIdx.length === 1) ik1(sk, pose, c.boneIdx[0], t.wx, t.wy, st);
  else ik2(sk, pose, c.boneIdx[0], c.boneIdx[1], t.wx, t.wy, st);
}

function parentRotation(sk, pose, i) {
  const pi = sk.bones[i].parentIndex;
  return pi < 0 ? 0 : worldRotation(pose.bones[pi]);
}
function rotateToward(sk, pose, i, wx, wy, mix) {
  const p = pose.bones[i];
  const want = Math.atan2(wy - p.wy, wx - p.wx) / DEG - parentRotation(sk, pose, i) - p.shearX;
  let d = (((want - p.rotation) % 360) + 540) % 360 - 180;
  p.rotation += d * mix;
}
function ik1(sk, pose, i, wx, wy, st) {
  rotateToward(sk, pose, i, wx, wy, st.mix);
  const b = sk.bones[i], p = pose.bones[i];
  if ((st.stretch || st.compress) && b.length > 0) {
    worldOf(sk, pose, i);
    const dist = Math.hypot(wx - p.wx, wy - p.wy), len = b.length * worldScaleX(p);
    if ((st.stretch && dist > len) || (st.compress && dist < len)) p.scaleX *= 1 + ((dist / len) - 1) * st.mix;
  }
  updateChildren(sk, pose, i);
}
function ik2(sk, pose, pi, ci, wx, wy, st) {
  const P = pose.bones[pi], C = pose.bones[ci];
  const l1 = Math.hypot(C.x * worldScaleX(P), C.y * worldScaleX(P)) || 1e-6;
  const l2 = (sk.bones[ci].length || 1e-6) * worldScaleX(C);
  let dx = wx - P.wx, dy = wy - P.wy, dist = Math.hypot(dx, dy);
  const reach = l1 + l2;
  if (st.softness > 0 && dist > reach - st.softness) {
    const s = st.softness, over = dist - (reach - s);
    const soft = reach - s + s * (1 - Math.exp(-over / s));
    dx *= soft / dist; dy *= soft / dist; dist = soft;
  }
  let stretch = 1;
  if (st.stretch && dist > reach) { stretch = dist / reach; dist = reach * 0.99999; }
  dist = Math.min(dist, reach * 0.99999);
  dist = Math.max(dist, Math.abs(l1 - l2) + 1e-6);
  const bend = st.bendPositive ? 1 : -1;
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const a1 = Math.atan2(dy, dx) - bend * Math.acos(Math.max(-1, Math.min(1, cosA)));
  const elbowX = P.wx + Math.cos(a1) * l1, elbowY = P.wy + Math.sin(a1) * l1;
  const offset = Math.atan2(C.y, C.x) / DEG;
  const want1 = a1 / DEG - offset - parentRotation(sk, pose, pi) - P.shearX;
  P.rotation += ((((want1 - P.rotation) % 360) + 540) % 360 - 180) * st.mix;
  if (stretch > 1) P.scaleX *= 1 + (stretch - 1) * st.mix;
  updateChildren(sk, pose, pi);
  rotateToward(sk, pose, ci, P.wx + (wx - P.wx), P.wy + (wy - P.wy), st.mix);
  void elbowX; void elbowY;
  if (stretch > 1) C.scaleX *= 1 + (stretch - 1) * st.mix;
  updateChildren(sk, pose, ci);
}

// ---- animation ---------------------------------------------------------------------------------
export function animationDuration(anim) {
  let d = 0;
  const scan = (keys) => { if (Array.isArray(keys)) for (const k of keys) d = Math.max(d, k.time); };
  for (const tl of Object.values(anim?.bones ?? {})) Object.values(tl).forEach(scan);
  for (const tl of Object.values(anim?.slots ?? {})) Object.values(tl).forEach(scan);
  for (const tl of Object.values(anim?.ik ?? {})) scan(tl);
  for (const s of Object.values(anim?.deform ?? {})) for (const a of Object.values(s)) for (const k of Object.values(a)) scan(k);
  scan(anim?.drawOrder); scan(anim?.events);
  return d;
}

const lerp = (a, b, t) => a + (b - a) * t;
const angleLerp = (a, b, t) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;

function sample1(keys, time, field) {
  const [i, f] = findKey(keys, time);
  if (i < 0) return null;
  const k = keys[i], n = keys[i + 1];
  return n ? lerp(k[field], n[field], f) : k[field];
}
function sample2(keys, time, fx, fy) {
  const [i, f] = findKey(keys, time);
  if (i < 0) return null;
  const k = keys[i], n = keys[i + 1];
  return n ? [lerp(k[fx], n[fx], f), lerp(k[fy], n[fy], f)] : [k[fx], k[fy]];
}

// Applies anim at time onto pose with weight alpha (1 = replace). Values in keys are relative to the setup pose.
export function applyAnimation(sk, pose, anim, time, alpha = 1, events = null, lastTime = -1) {
  if (!anim) return;
  for (const [name, tl] of Object.entries(anim.bones ?? {})) {
    const i = sk.boneIndex.get(name);
    if (i === undefined) continue;
    const b = sk.bones[i], p = pose.bones[i];
    if (tl.rotate) { const v = sample1(tl.rotate, time, "value"); const r = b.rotation + (v ?? 0); p.rotation = alpha >= 1 ? r : angleLerp(p.rotation, r, alpha); }
    if (tl.translate) { const v = sample2(tl.translate, time, "x", "y") ?? [0, 0]; p.x = lerp(p.x, b.x + v[0], alpha); p.y = lerp(p.y, b.y + v[1], alpha); }
    if (tl.scale) { const v = sample2(tl.scale, time, "x", "y") ?? [1, 1]; p.scaleX = lerp(p.scaleX, b.scaleX * v[0], alpha); p.scaleY = lerp(p.scaleY, b.scaleY * v[1], alpha); }
    if (tl.shear) { const v = sample2(tl.shear, time, "x", "y") ?? [0, 0]; p.shearX = lerp(p.shearX, b.shearX + v[0], alpha); p.shearY = lerp(p.shearY, b.shearY + v[1], alpha); }
    if (tl.inherit) { const [k] = findKey(tl.inherit, time); if (k >= 0 && alpha >= 0.5) p.inherit = tl.inherit[k].value; }
  }
  for (const [name, tl] of Object.entries(anim.slots ?? {})) {
    const i = sk.slotIndex.get(name);
    if (i === undefined) continue;
    const s = sk.slots[i], p = pose.slots[i];
    if (tl.attachment && alpha >= 0.5) {
      const [k] = findKey(tl.attachment, time);
      p.attachment = k < 0 ? s.attachment ?? null : tl.attachment[k].name ?? null;
    }
    if (tl.rgba) {
      const [k, f] = findKey(tl.rgba, time);
      const c = k < 0 ? s.color : tl.rgba[k + 1] ? mixColor(parseColor(tl.rgba[k].color), parseColor(tl.rgba[k + 1].color), f) : parseColor(tl.rgba[k].color);
      p.color = mixColor(p.color, c, alpha);
    }
  }
  if (anim.ik) for (const [name, keys] of Object.entries(anim.ik)) {
    const n = sk.ik.findIndex((c) => c.name === name);
    if (n < 0) continue;
    const [k, f] = findKey(keys, time), st = pose.ik[n];
    if (k < 0) continue;
    const a = keys[k], b = keys[k + 1] ?? a;
    st.mix = lerp(st.mix, lerp(a.mix ?? 1, b.mix ?? 1, f), alpha);
    st.softness = lerp(st.softness, lerp(a.softness ?? 0, b.softness ?? 0, f), alpha);
    if (alpha >= 0.5) { st.bendPositive = a.bendPositive ?? true; st.stretch = !!a.stretch; st.compress = !!a.compress; }
  }
  if (anim.transform) for (const [name, keys] of Object.entries(anim.transform)) {
    const n = sk.transform.findIndex((c) => c.name === name);
    if (n < 0) continue;
    const [k, f] = findKey(keys, time), st = pose.transform[n];
    if (k < 0) continue;
    const a = transformMixes(keys[k]), b = keys[k + 1] ? transformMixes(keys[k + 1]) : a;
    for (const m of TRANSFORM_MIXES) st[m] = lerp(st[m], lerp(a[m], b[m], f), alpha);
  }
  if (anim.deform) for (const [skin, slots] of Object.entries(anim.deform)) {
    if (skin !== pose.skin && skin !== "default") continue;
    for (const [slotName, atts] of Object.entries(slots)) {
      const i = sk.slotIndex.get(slotName);
      if (i === undefined) continue;
      const p = pose.slots[i];
      for (const [attName, keys] of Object.entries(atts)) {
        if (p.attachment !== attName) continue;
        const [k, f] = findKey(keys, time);
        if (k < 0) continue;
        const a = keys[k].vertices, b = keys[k + 1]?.vertices ?? a, n = Math.max(a.length, b.length);
        const out = new Float32Array(n);
        for (let j = 0; j < n; j++) out[j] = lerp(a[j] ?? 0, b[j] ?? 0, f) * alpha + (p.deform?.[j] ?? 0) * (1 - alpha);
        p.deform = out;
      }
    }
  }
  if (anim.drawOrder?.length && alpha >= 0.5) {
    const [k] = findKey(anim.drawOrder, time);
    if (k >= 0 && anim.drawOrder[k].order) {
      const seen = new Set(), order = [];
      for (const n of anim.drawOrder[k].order) { const i = sk.slotIndex.get(n); if (i !== undefined && !seen.has(i)) { seen.add(i); order.push(i); } }
      for (const s of sk.slots) if (!seen.has(s.index)) order.push(s.index);
      pose.drawOrder = order;
    } else if (k < 0) pose.drawOrder = sk.slots.map((s) => s.index);
  }
  if (events && anim.events) {
    for (const e of anim.events) if ((lastTime < 0 ? e.time <= time : e.time > lastTime && e.time <= time)) events.push(e);
  }
}
const mixColor = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];

// pose at (anim, time) from scratch, world transforms included
export function poseAt(sk, anim, time, skin = "default") {
  const pose = setupPose(sk, skin);
  applyAnimation(sk, pose, anim, time);
  updateWorld(sk, pose);
  return pose;
}

// ---- attachments -------------------------------------------------------------------------------
// region quad in bone space, order: bottom-left, bottom-right, top-right, top-left; uvs matching (v down)
export function regionLocal(att) {
  const w = att.width, h = att.height, sx = att.scaleX ?? 1, sy = att.scaleY ?? 1, r = (att.rotation ?? 0) * DEG;
  const cs = Math.cos(r), sn = Math.sin(r), x = att.x ?? 0, y = att.y ?? 0;
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const out = new Float32Array(8);
  pts.forEach(([px, py], i) => {
    px *= sx; py *= sy;
    out[i * 2] = x + px * cs - py * sn;
    out[i * 2 + 1] = y + px * sn + py * cs;
  });
  return out;
}
export const REGION_UVS = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
export const REGION_TRIS = [0, 1, 2, 2, 3, 0];

export function isWeighted(att) { return att.vertices.length > att.uvs.length; }

// world vertices of a region/mesh/boundingbox/clipping/point attachment on a slot
export function worldVertices(sk, pose, slotIndex, att) {
  const bone = pose.bones[sk.slots[slotIndex].boneIndex], deform = pose.slots[slotIndex].deform;
  if (att.type === "region" || !att.type) {
    const l = regionLocal(att), out = new Float32Array(8);
    for (let i = 0; i < 4; i++) { const [x, y] = localToWorld(bone, l[i * 2], l[i * 2 + 1]); out[i * 2] = x; out[i * 2 + 1] = y; }
    return out;
  }
  if (att.type === "point") return new Float32Array(localToWorld(bone, att.x ?? 0, att.y ?? 0));
  const n = att.uvs ? att.uvs.length / 2 : att.vertexCount, out = new Float32Array(n * 2), v = att.vertices;
  if (!(att.uvs ? isWeighted(att) : v.length > n * 2)) {
    for (let i = 0; i < n; i++) {
      const [x, y] = localToWorld(bone, v[i * 2] + (deform?.[i * 2] ?? 0), v[i * 2 + 1] + (deform?.[i * 2 + 1] ?? 0));
      out[i * 2] = x; out[i * 2 + 1] = y;
    }
    return out;
  }
  let j = 0, f = 0;
  for (let i = 0; i < n; i++) {
    const count = v[j++];
    let wx = 0, wy = 0;
    for (let k = 0; k < count; k++, j += 4, f += 2) {
      const b = pose.bones[v[j]], x = v[j + 1] + (deform?.[f] ?? 0), y = v[j + 2] + (deform?.[f + 1] ?? 0), w = v[j + 3];
      wx += (b.a * x + b.b * y + b.wx) * w;
      wy += (b.c * x + b.d * y + b.wy) * w;
    }
    out[i * 2] = wx; out[i * 2 + 1] = wy;
  }
  return out;
}

// Everything a renderer needs, in draw order: [{ slot, att, image, verts, uvs, tris, color, blend }]
export function drawList(sk, pose) {
  const out = [];
  for (const si of pose.drawOrder) {
    const sp = pose.slots[si], s = sk.slots[si];
    if (s.hidden) continue;
    const bone = sk.bones[s.boneIndex];
    if (bone.hidden) continue;
    const att = getAttachment(sk.doc, pose.skin, s.name, sp.attachment);
    if (!att || !(att.type === "region" || att.type === "mesh" || !att.type)) continue;
    const ac = parseColor(att.color), sc = sp.color;
    const color = [ac[0] * sc[0], ac[1] * sc[1], ac[2] * sc[2], ac[3] * sc[3]];
    if (color[3] <= 0) continue;
    const mesh = att.type === "mesh";
    out.push({
      slot: s.name, slotIndex: si, name: sp.attachment, att, image: att.path ?? sp.attachment,
      verts: worldVertices(sk, pose, si, att),
      uvs: mesh ? att.uvs : REGION_UVS, tris: mesh ? att.triangles : REGION_TRIS,
      color, blend: s.blend ?? "normal",
    });
  }
  return out;
}

export function bounds(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of list) for (let i = 0; i < d.verts.length; i += 2) {
    x0 = Math.min(x0, d.verts[i]); x1 = Math.max(x1, d.verts[i]);
    y0 = Math.min(y0, d.verts[i + 1]); y1 = Math.max(y1, d.verts[i + 1]);
  }
  return isFinite(x0) ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : { x: 0, y: 0, width: 0, height: 0 };
}

// ---- AnimationState (tracks + crossfade) -------------------------------------------------------
export class AnimationState {
  constructor(sk) { this.sk = sk; this.tracks = []; this.timeScale = 1; this.listeners = []; this.defaultMix = 0.2; this.mixes = {}; }
  setMix(from, to, d) { this.mixes[`${from}>${to}`] = d; }
  setAnimation(track, name, loop = true) {
    const anim = this.sk.doc.animations?.[name];
    if (!anim) throw new Error(`không có animation "${name}"`);
    const prev = this.tracks[track];
    const mix = prev ? this.mixes[`${prev.name}>${name}`] ?? this.defaultMix : 0;
    this.tracks[track] = { name, anim, loop, time: 0, last: -1, duration: animationDuration(anim), alpha: 1, from: prev && mix > 0 ? { ...prev, from: null } : null, mixTime: 0, mixDuration: mix };
    return this.tracks[track];
  }
  clearTrack(track) { this.tracks[track] = null; }
  update(dt) {
    for (const t of this.tracks) {
      if (!t) continue;
      t.last = t.time; t.time += dt * this.timeScale;
      if (t.from) { t.from.last = t.from.time; t.from.time += dt * this.timeScale; t.mixTime += dt * this.timeScale; if (t.mixTime >= t.mixDuration) t.from = null; }
    }
  }
  apply(pose) {
    for (const t of this.tracks) {
      if (!t) continue;
      const local = (e) => (e.loop && e.duration > 0 ? e.time % e.duration : Math.min(e.time, e.duration));
      const localLast = (e) => (e.last < 0 ? -1 : e.loop && e.duration > 0 ? e.last % e.duration : Math.min(e.last, e.duration));
      if (t.from) applyAnimation(this.sk, pose, t.from.anim, local(t.from), t.alpha);
      const ev = [];
      const a = t.from ? Math.min(1, t.mixTime / t.mixDuration) * t.alpha : t.alpha;
      let lt = localLast(t);
      if (lt > local(t)) { applyAnimation(this.sk, setupPose(this.sk), t.anim, t.duration, 0, ev, lt); lt = -1; }
      applyAnimation(this.sk, pose, t.anim, local(t), a, ev, lt);
      for (const e of ev) for (const fn of this.listeners) fn(e, t);
    }
  }
}

// ---- canvas2D drawing --------------------------------------------------------------------------
// images: Map(path -> { source: CanvasImageSource, x, y, w, h, rotate, offX, offY, origW, origH } | CanvasImageSource)
// A bare image source means the whole source is the region.
const BLEND_OP = { normal: "source-over", additive: "lighter", multiply: "multiply", screen: "screen" };

export function draw2d(ctx, list, images, opts = {}) {
  const tintCache = opts.tintCache ?? (draw2d._cache ??= new Map());
  for (const d of list) {
    const img = images.get(d.image);
    if (!img) continue;
    const r = img.source ? img : { source: img, x: 0, y: 0, w: img.width, h: img.height, offX: 0, offY: 0, origW: img.width, origH: img.height, rotate: false };
    let src = r.source, sx = r.x, sy = r.y;
    if (d.color[0] < 0.999 || d.color[1] < 0.999 || d.color[2] < 0.999) {
      const key = `${d.image}|${d.color.slice(0, 3).map((c) => Math.round(c * 32)).join(",")}`;
      let t = tintCache.get(key);
      if (!t) { t = tinted(r, d.color); tintCache.set(key, t); if (tintCache.size > 300) tintCache.delete(tintCache.keys().next().value); }
      src = t; sx = 0; sy = 0;
    }
    ctx.globalAlpha = d.color[3];
    ctx.globalCompositeOperation = BLEND_OP[d.blend] ?? "source-over";
    if (d.att.type === "mesh") drawMesh(ctx, src, sx, sy, r, d);
    else drawRegion(ctx, src, sx, sy, r, d.verts);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function tinted(r, color) {
  const c = new OffscreenCanvas(r.rotate ? r.h : r.w, r.rotate ? r.w : r.h), g = c.getContext("2d");
  g.drawImage(r.source, r.x, r.y, c.width, c.height, 0, 0, c.width, c.height);
  g.globalCompositeOperation = "multiply";
  g.fillStyle = `rgb(${color[0] * 255},${color[1] * 255},${color[2] * 255})`;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(r.source, r.x, r.y, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

// verts: BL, BR, TR, TL in world (y up). The region's packed rect may be stripped: it covers offX..offX+w of origW.
function drawRegion(ctx, src, sx, sy, r, v) {
  const fx = r.offX / r.origW, fy = r.offY / r.origH, fw = r.w / r.origW, fh = r.h / r.origH;
  const ux = [v[2] - v[0], v[3] - v[1]], uy = [v[6] - v[0], v[7] - v[1]];
  const ox = v[0] + ux[0] * fx + uy[0] * fy, oy = v[1] + ux[1] * fx + uy[1] * fy;
  // map image pixel (px, py) with py down, origin at top-left of packed rect
  const W = r.w, H = r.h;
  const ax = (ux[0] * fw) / W, ay = (ux[1] * fw) / W, bx = (-uy[0] * fh) / H, by = (-uy[1] * fh) / H;
  const tx = ox + uy[0] * fh, ty = oy + uy[1] * fh;
  ctx.save();
  ctx.transform(ax, ay, bx, by, tx, ty);
  if (r.rotate) { ctx.translate(0, H); ctx.rotate(-Math.PI / 2); ctx.drawImage(src, sx, sy, H, W, 0, 0, H, W); }
  else ctx.drawImage(src, sx, sy, W, H, 0, 0, W, H);
  ctx.restore();
}

function drawMesh(ctx, src, sx, sy, r, d) {
  const v = d.verts, uv = d.uvs, t = d.tris;
  const pw = r.origW, ph = r.origH;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 2, b = t[i + 1] * 2, c = t[i + 2] * 2;
    const u0 = uv[a] * pw - r.offX, v0 = uv[a + 1] * ph - (ph - r.offY - r.h);
    const u1 = uv[b] * pw - r.offX, v1 = uv[b + 1] * ph - (ph - r.offY - r.h);
    const u2 = uv[c] * pw - r.offX, v2 = uv[c + 1] * ph - (ph - r.offY - r.h);
    const x0 = v[a], y0 = v[a + 1], x1 = v[b], y1 = v[b + 1], x2 = v[c], y2 = v[c + 1];
    const den = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    if (Math.abs(den) < 1e-9) continue;
    const m11 = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / den, m12 = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / den;
    const m21 = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / den, m22 = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / den;
    const dx = x0 - m11 * u0 - m21 * v0, dy = y0 - m12 * u0 - m22 * v0;
    // expand triangle ~0.5px to hide seams
    const cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3, grow = (x, y) => { const l = Math.hypot(x - cx, y - cy) || 1; return [x + ((x - cx) / l) * 0.6, y + ((y - cy) / l) * 0.6]; };
    const [g0x, g0y] = grow(x0, y0), [g1x, g1y] = grow(x1, y1), [g2x, g2y] = grow(x2, y2);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(g0x, g0y); ctx.lineTo(g1x, g1y); ctx.lineTo(g2x, g2y); ctx.closePath(); ctx.clip();
    ctx.transform(m11, m12, m21, m22, dx, dy);
    ctx.drawImage(src, sx, sy, r.w, r.h, 0, 0, r.w, r.h);
    ctx.restore();
  }
}

// ---- atlas -------------------------------------------------------------------------------------
// Parses both the keyed (bounds:/offsets:) and the legacy (xy:/size:/orig:/offset:) atlas styles.
export function parseAtlas(text) {
  const pages = [];
  let page = null, region = null;
  const lines = text.split(/\r?\n/);
  const nums = (v) => v.split(",").map((s) => +s.trim());
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], line = raw.trim();
    if (!line) { page = null; region = null; continue; }
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!page) { page = { name: line, regions: [], size: null, pma: false, filter: null }; pages.push(page); continue; }
    if (m && !region) {
      const [, k, v] = m;
      if (k === "size") page.size = nums(v);
      else if (k === "pma") page.pma = v === "true";
      else if (k === "filter") page.filter = v;
      else page[k] = v;
      continue;
    }
    if (!m || (/^\S/.test(raw) && !/^(bounds|offsets|rotate|index|split|pad|xy|size|orig|offset)\s*:/.test(line))) {
      region = { name: line, x: 0, y: 0, w: 0, h: 0, offX: 0, offY: 0, origW: 0, origH: 0, rotate: 0, index: -1 };
      page.regions.push(region);
      continue;
    }
    const [, k, v] = m;
    if (k === "bounds") [region.x, region.y, region.w, region.h] = nums(v);
    else if (k === "offsets") [region.offX, region.offY, region.origW, region.origH] = nums(v);
    else if (k === "xy") [region.x, region.y] = nums(v);
    else if (k === "size") [region.w, region.h] = nums(v);
    else if (k === "orig") [region.origW, region.origH] = nums(v);
    else if (k === "offset") [region.offX, region.offY] = nums(v);
    else if (k === "rotate") region.rotate = v === "true" ? 90 : v === "false" ? 0 : +v;
    else if (k === "index") region.index = +v;
    else region[k] = v;
  }
  for (const p of pages) for (const r of p.regions) {
    // bounds w/h are the unrotated size on the page; legacy size is the original orientation
    if (r.rotate === 90 && r.legacy) [r.w, r.h] = [r.h, r.w];
    if (!r.origW) { r.origW = r.w; r.origH = r.h; }
  }
  return pages;
}

export function writeAtlas(pages) {
  const out = [];
  for (const p of pages) {
    out.push(p.name, `size: ${p.width}, ${p.height}`, "filter: Linear, Linear");
    if (p.pma) out.push("pma: true");
    for (const r of p.regions) {
      out.push(r.name, `bounds: ${r.x}, ${r.y}, ${r.w}, ${r.h}`);
      if (r.offX || r.offY || r.origW !== r.w || r.origH !== r.h) out.push(`offsets: ${r.offX}, ${r.offY}, ${r.origW}, ${r.origH}`);
      if (r.rotate) out.push(`rotate: ${r.rotate === 90 ? "true" : r.rotate}`);
    }
    out.push("");
  }
  return out.join("\n");
}
