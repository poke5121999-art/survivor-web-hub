// Editor state shared by all panels. The document lives in S.hist (History); everything else is view state.
import { History } from "../history.js?v=20261125n";
import { emptyDoc } from "../commands.js?v=20261125n";
import { buildSkeleton, setupPose, applyAnimation, updateWorld, animationDuration, findKey, AnimationState, Physics } from "../../runtime/xuong.js?v=20261125n";

export const S = {
  hist: new History(emptyDoc()),
  mode: "setup", tool: "rotate", axes: "local",
  sel: null,            // { kind: "bone"|"slot"|"attachment"|"skin"|"anim"|"event"|"image"|"ik", name, slot?, skin? }
  multi: [],            // extra selected bone names
  anim: null, time: 0, playing: false, speed: 1, loop: true, autoKey: true,
  onion: { on: false, before: 2, after: 2, step: 2 },
  skin: "default",
  view: { x: 0, y: 120, zoom: 1, fitted: false },
  images: new Map(),    // path -> HTMLCanvasElement | ImageBitmap (what the renderer draws)
  blobs: new Map(),     // path -> Blob (PNG, what gets saved)
  overrides: {},        // animate mode, unkeyed edits: { bone: { rotation?, x?, y?, scaleX?, scaleY? } }
  showBones: true, showImages: true, pixelView: null, rotSnap: (() => { try { return +localStorage.getItem("xx-rot-snap") || 0; } catch { return 0; } })(),
  locked: null,         // agent job running: { label, cancel() }
  projectId: null, savedAt: 0, dirty: false,
  keySel: [],           // selected keys in the dopesheet: [{ track, time }]
  vsel: [],             // selected mesh vertex indices
};
export const doc = () => S.hist.doc;

const listeners = new Set();
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let pending = null;
export function emit(what = "all") {
  if (pending) { pending.add(what); return; }
  pending = new Set([what]);
  queueMicrotask(() => { const all = pending; pending = null; for (const w of all) for (const fn of listeners) fn(w); });
}

// ---- skeleton cache + displayed pose -----------------------------------------------------------
let skCache = { doc: null, sk: null, error: null };
export function skeleton() {
  const d = doc();
  if (skCache.doc !== d) {
    try { skCache = { doc: d, sk: buildSkeleton(d), error: null }; } catch (e) { skCache = { doc: d, sk: null, error: e }; }
  }
  return skCache.sk;
}
export const currentAnim = () => (S.anim ? doc().animations[S.anim] : null);
export const duration = () => animationDuration(currentAnim());

// Crossfade preview: plays `from`, then mixes into `to` over `mix` seconds, looping the pair. Viewport only.
export function startMixPreview(from, to, mix) {
  const sk = skeleton();
  const st = new AnimationState(sk);
  st.defaultMix = mix;
  st.setAnimation(0, from, true);
  S.mixPreview = { st, from, to, mix, t: 0, switched: false, fromDur: animationDuration(doc().animations[from]) };
  emit("mix");
}
export function stopMixPreview() { S.mixPreview = null; emit("mix"); }
export function tickMixPreview(dt) {
  const m = S.mixPreview;
  if (!m) return;
  m.t += dt * S.speed;
  if (!m.switched && m.t >= Math.max(0.6, m.fromDur)) { m.st.setAnimation(0, m.to, true); m.switched = true; }
  if (m.switched && m.t >= Math.max(0.6, m.fromDur) + Math.max(1.2, animationDuration(doc().animations[m.to]))) { m.st.setAnimation(0, m.from, true); m.switched = false; m.t = 0; }
  m.st.update(dt * S.speed);
}
// physics runs only while playing in animate mode: stepped once per frame (stepPhysics), applied to every pose
export function stepPhysics(dt) {
  const sk = skeleton();
  if (!S.playing || S.mode !== "animate" || !sk?.physics?.length) { S.physicsSim = null; return; }
  if (S.physicsSim?.sk !== sk) S.physicsSim = new Physics(sk);
  S.physicsSim.step(poseAtTime(S.time, { physics: false }), dt);
}
export function poseAtTime(time, { withOverrides = true, physics = true } = {}) {
  const sk = skeleton();
  if (!sk) return null;
  if (S.mixPreview && withOverrides) { const p = setupPose(sk, S.skin); S.mixPreview.st.apply(p); updateWorld(sk, p); return p; }
  const pose = setupPose(sk, S.skin);
  if (S.mode === "animate" && currentAnim()) applyAnimation(sk, pose, currentAnim(), time);
  if (withOverrides && S.mode === "animate") {
    for (const [name, o] of Object.entries(S.overrides)) {
      const i = sk.boneIndex.get(name);
      if (i !== undefined) Object.assign(pose.bones[i], o);
    }
  }
  updateWorld(sk, pose);
  if (physics && withOverrides && S.playing && S.physicsSim?.sk === sk) S.physicsSim.apply(pose);
  return pose;
}

// ---- edits: setup mode writes the setup pose, animate mode writes keys (or overrides) -------------
const REL = {
  rotate: (b, v) => v.rotation - b.rotation,
  translate: (b, v) => ({ x: round(v.x - b.x), y: round(v.y - b.y) }),
  scale: (b, v) => ({ x: round(b.scaleX ? v.scaleX / b.scaleX : 1), y: round(b.scaleY ? v.scaleY / b.scaleY : 1) }),
  shear: (b, v) => ({ x: round(v.shearX - b.shearX), y: round(v.shearY - b.shearY) }),
};
export const PROP_FIELDS = { rotate: ["rotation"], translate: ["x", "y"], scale: ["scaleX", "scaleY"], shear: ["shearX", "shearY"] };
const round = (v) => Math.round(v * 1000) / 1000;

// Applies new local bone values ({ rotation }, { x, y }, ...). key: coalescing key for drags.
export function editBone(name, values, { coalesce } = {}) {
  if (S.locked) { toast("Agent đang sửa dự án, đợi xong hoặc bấm Dừng", true); return; }
  const d = doc();
  const b = d.bones.find((x) => x.name === name);
  if (!b) return;
  for (const k of Object.keys(values)) values[k] = round(values[k]);
  if (S.mode === "setup" || !S.anim) {
    const cmd = { type: "bone.set", name, props: values, ...(S.compensate ? { compensate: true } : {}) };
    coalesce ? S.hist.runCoalesced(cmd, `${coalesce}:${name}`) : S.hist.run(cmd);
    return;
  }
  const prop = Object.keys(PROP_FIELDS).find((p) => PROP_FIELDS[p].includes(Object.keys(values)[0]));
  const cur = currentLocal(name);
  const full = { ...cur, ...values };
  if (S.autoKey) {
    const cmd = { type: "key.set", anim: S.anim, track: { bone: name, prop }, time: S.time, value: REL[prop](b, full) };
    coalesce ? S.hist.runCoalesced(cmd, `${coalesce}:${name}:${prop}`) : S.hist.run(cmd);
    const o = S.overrides[name];
    if (o) { for (const f of PROP_FIELDS[prop]) delete o[f]; if (!Object.keys(o).length) delete S.overrides[name]; }
  } else {
    S.overrides[name] = { ...(S.overrides[name] ?? {}), ...values };
    emit("pose");
  }
}
export function currentLocal(name) {
  const sk = skeleton(), pose = poseAtTime(S.time);
  const p = pose.bones[sk.boneIndex.get(name)];
  return { rotation: p.rotation, x: p.x, y: p.y, scaleX: p.scaleX, scaleY: p.scaleY, shearX: p.shearX, shearY: p.shearY };
}
// K: key every overridden property at the current time.
export function keyOverrides() {
  if (!S.anim) return 0;
  const d = doc();
  let n = 0;
  S.hist.begin("Key");
  for (const [name, o] of Object.entries(S.overrides)) {
    const b = d.bones.find((x) => x.name === name);
    if (!b) continue;
    const full = { ...currentLocal(name), ...o };
    for (const prop of Object.keys(PROP_FIELDS)) {
      if (!PROP_FIELDS[prop].some((f) => f in o)) continue;
      S.hist.run({ type: "key.set", anim: S.anim, track: { bone: name, prop }, time: S.time, value: REL[prop](b, full) });
      n++;
    }
  }
  S.hist.end();
  S.overrides = {};
  return n;
}
export function keyAll(name) {
  if (!S.anim) return;
  const b = doc().bones.find((x) => x.name === name), full = currentLocal(name);
  S.hist.begin("Key bone");
  for (const prop of ["rotate", "translate", "scale"]) S.hist.run({ type: "key.set", anim: S.anim, track: { bone: name, prop }, time: S.time, value: REL[prop](b, full) });
  S.hist.end();
}
// key state of a bone property at the current time: "key" | "changed" | "none"
export function keyState(name, prop) {
  if (S.overrides[name] && PROP_FIELDS[prop].some((f) => f in S.overrides[name])) return "changed";
  const keys = currentAnim()?.bones?.[name]?.[prop];
  if (keys?.some((k) => Math.abs(k.time - S.time) < 1e-3)) return "key";
  return "none";
}
export function setTime(t) {
  const fps = doc().fps || 30;
  S.time = Math.max(0, Math.round(t * fps * 1000) / 1000 / fps);
  if (Object.keys(S.overrides).length) S.overrides = {};
  emit("time");
}
export const frame = () => Math.round(S.time * (doc().fps || 30) * 100) / 100;
export { findKey };

// ---- selection ---------------------------------------------------------------------------------
export function select(sel, add = false) {
  if (add && sel?.kind === "bone" && S.sel?.kind === "bone") {
    const all = new Set([S.sel.name, ...S.multi]);
    if (all.has(sel.name)) all.delete(sel.name); else all.add(sel.name);
    const list = [...all];
    S.sel = list.length ? { kind: "bone", name: list[list.length - 1] } : null;
    S.multi = list.slice(0, -1);
  } else { if (JSON.stringify(sel) !== JSON.stringify(S.sel)) S.vsel = []; S.sel = sel; S.multi = []; }
  emit("sel");
}
export const selectedBones = () => (S.sel?.kind === "bone" ? [S.sel.name, ...S.multi] : S.sel?.kind === "slot" ? [doc().slots.find((s) => s.name === S.sel.name)?.bone].filter(Boolean) : []);

// ---- toasts ------------------------------------------------------------------------------------
export function toast(msg, bad = false) {
  const t = document.createElement("div");
  t.className = "xx-toast" + (bad ? " is-bad" : "");
  t.textContent = msg;
  document.getElementById("xx-toasts").append(t);
  setTimeout(() => t.classList.add("is-out"), bad ? 5200 : 2600);
  setTimeout(() => t.remove(), bad ? 5600 : 3000);
}
// runs a command (or a list as one undo step) and turns validation errors into a toast
export function run(cmds, label) {
  const list = Array.isArray(cmds) ? cmds : [cmds];
  if (S.locked) { toast("Agent đang sửa dự án, đợi xong hoặc bấm Dừng", true); return false; }
  S.hist.begin(label ?? list[0]?.type);
  try { for (const c of list) S.hist.run(c); S.hist.end(); return true; }
  catch (e) { S.hist.cancel(); toast(e.message, true); return false; }
}

// replaceChildren(null) would insert the text "null"; panels pass optional nodes as `cond ? node : null`
const nativeReplace = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function (...k) { return nativeReplace.apply(this, k.flat().filter((c) => c != null && c !== false)); };

export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style") e.style.cssText = v;
    else if (["value", "checked", "disabled", "hidden", "selected"].includes(k)) e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
