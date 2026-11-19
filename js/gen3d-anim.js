/*
 * Thử anim (gen3d-anim.html?job=<id job rig>). Nạp glb có xương mixamorig, danh sách anim từ gen3d/mixamo/index.json,
 * gắn clip vào AnimationMixer theo tên xương. Hợp đồng: docs/gen3d-studio.md, mục Thử anim.
 * Retarget theo không gian thế giới: mỗi xương lấy độ xoay của clip so với tư thế nghỉ của clip (Δ = W_clip(t) · W_clipNghỉ⁻¹),
 * đặt lên tư thế nghỉ của model (W = Δ · W_modelNghỉ). Nhờ vậy xương cùng tên nhưng trục cục bộ khác (Xbot xuất qua Blender,
 * FBX Mixamo, rig của máy gen) vẫn chạy đúng, miễn hai bên cùng đứng T-pose. Hips dịch chuyển theo tỉ lệ chiều cao Hips.
 */
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MOCK = /[?&]mock=1\b/.test(location.search);
const Q = new URLSearchParams(location.search);
const CFG = window.SUPABASE_CONFIG || {};
const BASE = String(CFG.url || "").replace(/\/+$/, "");
const LIB = BASE + "/storage/v1/object/public/gen3d/mixamo/";
const $ = (id) => document.getElementById(id);
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};
function banner(msg, link) {
  const el = $("g3-banner");
  el.replaceChildren(h("span", { text: msg }), link ? h("a", { class: "btn btn--sm", href: link[1], text: link[0] }) : null);
  el.hidden = false;
}

async function api(action, body) {
  if (MOCK) return (await import("./gen3d-mock.js")).call(action, body);
  const s = window.HubSession && window.HubSession.get();
  let tok = s && s.accessToken;
  if (s && window.HubSession.isExpired() && window.HubAuth) {
    const r = await window.HubAuth.refresh(s);
    if (r && r.ok) { window.HubSession.set(r.session); tok = r.session.accessToken; }
  }
  const res = await fetch(BASE + "/functions/v1/gen3d-studio", {
    method: "POST", headers: { apikey: CFG.anonKey, Authorization: "Bearer " + (tok || CFG.anonKey), "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const d = await res.json().catch(() => null);
  if (!d || !d.ok) throw Object.assign(new Error((d && d.error && d.error.message) || "Máy chủ trả lỗi " + res.status), { status: res.status });
  return d;
}
const pubUrl = (p) => (/^(https?:|data:|blob:)/.test(p) ? p : BASE + "/storage/v1/object/public/gen3d/" + p);

/* ---------- cảnh ---------- */
const view = $("ga-view");
const cv = h("canvas", { class: "g3-cv", "aria-label": "Khung xem anim" });
view.prepend(cv);
const renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(40, 1, 0.01, 1000);
const controls = new OrbitControls(camera, cv);
controls.enableDamping = true;
scene.add(new T.HemisphereLight(0xffffff, 0x444450, 1.2));
const key = new T.DirectionalLight(0xffffff, 2.4); key.position.set(3, 5, 4); scene.add(key);
const rim = new T.DirectionalLight(0xaabbff, 1); rim.position.set(-4, 2, -3); scene.add(rim);
const grid = new T.GridHelper(10, 40, 0x77778a, 0x3a3b42);
grid.material.transparent = true; grid.material.opacity = 0.6;
scene.add(grid);
function resize() {
  const w = view.clientWidth, hh = view.clientHeight;
  renderer.setSize(w, hh, false);
  camera.aspect = w / Math.max(1, hh); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
resize();

const A = { model: null, mixer: null, action: null, clipEntry: null, playing: true, speed: 1, loop: true, inplace: false, bones: new Map(), hipsName: null, hipsRest: null, height: 1, helper: null };
const clock = new T.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = clock.getDelta();
  if (A.mixer && A.playing) A.mixer.update(dt * A.speed);
  if (A.action) {
    const d = A.action.getClip().duration || 1;
    const t = A.loop ? A.action.time % d : Math.min(A.action.time, d);
    $("ga-time").textContent = `${t.toFixed(2)} / ${d.toFixed(2)} s`;
    if (document.activeElement !== $("ga-scrub")) $("ga-scrub").value = String(Math.round((t / d) * 1000));
  }
  controls.update();
  renderer.render(scene, camera);
}

/* ---------- tên xương ---------- */
// "mixamorig:Hips", "mixamorigHips", "mixamorig1:LeftArm" → "hips", "leftarm". GLTFLoader bỏ dấu ":" khỏi tên node.
const norm = (n) => String(n).toLowerCase().replace(/^mixamorig\d*[:_]?/, "").replace(/[^a-z0-9]/g, "");

async function loadModel(url) {
  const g = await new GLTFLoader().loadAsync(url);
  const m = g.scene;
  m.traverse((o) => { if (o.isMesh) o.frustumCulled = false; if (o.isBone) A.bones.set(norm(o.name), o); });
  if (!A.bones.size) throw new Error("model không có xương; mở từ một job Gen xương đã xong");
  const hips = A.bones.get("hips");
  if (!hips) throw new Error("không thấy xương Hips (mixamorig:Hips) trong model");
  A.hipsName = hips.name;
  A.hipsRest = hips.position.clone();
  scene.add(m);
  A.model = m;
  A.mixer = new T.AnimationMixer(m);
  A.helper = new T.SkeletonHelper(m);
  A.helper.visible = false;
  scene.add(A.helper);
  m.updateMatrixWorld(true);
  m.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
  const box = new T.Box3().setFromObject(m, true), size = box.getSize(new T.Vector3()), c = box.getCenter(new T.Vector3());
  A.height = size.y || 1;
  grid.scale.setScalar(A.height / 1.8);
  grid.position.y = box.min.y;
  controls.target.set(c.x, c.y, c.z);
  camera.position.set(c.x + A.height * 1.1, c.y + A.height * 0.35, c.z + A.height * 2.2);
  camera.near = A.height / 200; camera.far = A.height * 200; camera.updateProjectionMatrix();
}

/* ---------- clip ---------- */
const clipCache = new Map();
async function loadClip(entry) {
  if (!clipCache.has(entry.file)) {
    clipCache.set(entry.file, new GLTFLoader().loadAsync(LIB + entry.file).then((g) => {
      const clip = g.animations[0];
      const nodes = new Map();
      g.scene.traverse((o) => { if (o !== g.scene && o.name) { nodes.set(norm(o.name), o); o.userData.rest = [o.position.clone(), o.quaternion.clone()]; } });
      return { clip, root: g.scene, nodes };
    }).catch((e) => { clipCache.delete(entry.file); throw e; }));
  }
  return clipCache.get(entry.file);
}
const _p = new T.Vector3(), _s = new T.Vector3(), _q = new T.Quaternion(), _m = new T.Matrix4();
const worldQ = (o) => (o.matrixWorld.decompose(_p, _q, _s), _q.clone());
const worldP = (o) => new T.Vector3().setFromMatrixPosition(o.matrixWorld);
function setRest(root) { root.traverse((o) => { if (o.userData.rest) { o.position.copy(o.userData.rest[0]); o.quaternion.copy(o.userData.rest[1]); } }); root.updateMatrixWorld(true); }
function retarget({ clip, root, nodes }) {
  // tư thế nghỉ hai bên
  setRest(root); setRest(A.model);
  const tgt = [];
  A.model.traverse((o) => { if (o.isBone) tgt.push(o); });
  const restW = new Map(tgt.map((b) => [b, worldQ(b)]));
  const parentRestW = new Map(tgt.map((b) => [b, b.parent ? worldQ(b.parent) : new T.Quaternion()]));
  const map = new Map();
  for (const b of tgt) { const s = nodes.get(norm(b.name)); if (s) map.set(b, { src: s, srcRestW: worldQ(s) }); }
  const sHips = nodes.get("hips"), tHips = A.bones.get("hips");
  const sHipsRest = sHips ? worldP(sHips) : null, tHipsRest = worldP(tHips);
  const tHipsParentInv = tHips.parent ? _m.copy(tHips.parent.matrixWorld).invert().clone() : new T.Matrix4();
  const k = sHipsRest && sHipsRest.y ? tHipsRest.y / sHipsRest.y : 1;
  // bộ nội suy cho từng track của clip, gắn vào node nguồn
  const interps = [];
  let times = new Float32Array([0]);
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf(".");
    const node = nodes.get(norm(t.name.slice(0, dot))), prop = t.name.slice(dot + 1);
    if (!node || (prop !== "quaternion" && prop !== "position")) continue;
    if (prop === "position" && node !== sHips) continue;
    interps.push({ node, prop, it: t.createInterpolant() });
    if (t.times.length > times.length) times = t.times;
  }
  const out = new Map([...map.keys()].map((b) => [b, new Float32Array(times.length * 4)]));
  const hipsPos = new Float32Array(times.length * 3);
  const W = new Map();
  for (let f = 0; f < times.length; f++) {
    setRest(root);
    for (const { node, prop, it } of interps) {
      const v = it.evaluate(times[f]);
      if (prop === "quaternion") node.quaternion.fromArray(v).normalize(); else node.position.fromArray(v);
    }
    root.updateMatrixWorld(true);
    W.clear();
    for (const b of tgt) {
      const pw = W.get(b.parent) || parentRestW.get(b);
      const m = map.get(b);
      let w;
      if (m) {
        w = worldQ(m.src).multiply(m.srcRestW.clone().invert()).multiply(restW.get(b));
        const local = pw.clone().invert().multiply(w);
        local.toArray(out.get(b), f * 4);
      } else w = pw.clone().multiply(b.userData.rest[1]);
      W.set(b, w);
    }
    if (sHips) {
      const d = worldP(sHips).sub(sHipsRest).multiplyScalar(k);
      if (A.inplace) { d.x = 0; d.z = 0; }
      tHipsRest.clone().add(d).applyMatrix4(tHipsParentInv).toArray(hipsPos, f * 3);
    }
  }
  const tracks = [...out].map(([b, v]) => new T.QuaternionKeyframeTrack(b.name + ".quaternion", times, v));
  if (sHips) tracks.push(new T.VectorKeyframeTrack(tHips.name + ".position", times, hipsPos));
  setRest(A.model);
  return new T.AnimationClip(clip.name, clip.duration, tracks);
}
let playToken = 0;
async function play(entry, keepTime) {
  const token = ++playToken;
  A.clipEntry = entry;
  paintList();
  try {
    const data = await loadClip(entry);
    if (token !== playToken || !A.mixer) return;
    const t0 = keepTime && A.action ? A.action.time : 0;
    A.mixer.stopAllAction();
    if (A.action) A.mixer.uncacheClip(A.action.getClip());
    const clip = retarget(data);
    A.action = A.mixer.clipAction(clip);
    A.action.setLoop(A.loop ? T.LoopRepeat : T.LoopOnce, Infinity);
    A.action.clampWhenFinished = true;
    A.action.play();
    A.action.time = t0;
    window.__anim = { clip: entry.id, tracks: clip.tracks.length, duration: clip.duration };
  } catch (e) {
    banner("Không nạp được anim " + entry.name + ": " + e.message);
  }
}

/* ---------- danh sách ---------- */
let LIST = [], filtered = [];
const gif = h("img", { class: "ga-gif", alt: "", hidden: true });
document.body.append(gif);
function paintList() {
  const q = $("ga-q").value.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  filtered = LIST.filter((e) => !words.length || words.every((w) => (e.name + " " + (e.description || "")).toLowerCase().includes(w)));
  $("ga-count").textContent = `${filtered.length} / ${LIST.length} anim`;
  const box = $("ga-items");
  box.replaceChildren(...filtered.slice(0, 400).map((e) => {
    const b = h("button", { class: "ga-item", type: "button", role: "option", "aria-pressed": String(A.clipEntry === e), title: e.description || e.name, onclick: () => play(e) },
      h("b", { text: e.name }), h("small", { text: `${e.duration.toFixed(1)} s${e.description && e.description !== e.name ? " · " + e.description : ""}` }));
    if (e.gif) {
      b.addEventListener("mouseenter", () => {
        gif.src = e.gif; gif.hidden = false;
        const r = b.getBoundingClientRect();
        gif.style.left = r.right + 10 + "px"; gif.style.top = Math.min(innerHeight - 190, Math.max(8, r.top - 60)) + "px";
      });
      b.addEventListener("mouseleave", () => { gif.hidden = true; });
    }
    return b;
  }), filtered.length > 400 ? h("p", { class: "g3-dim", text: `… còn ${filtered.length - 400} anim, gõ để lọc` }) : null);
  const cur = box.querySelector('[aria-pressed="true"]');
  if (cur) cur.scrollIntoView({ block: "nearest" });
}
async function loadIndex() {
  const hour = Math.floor(Date.now() / 3600000);
  const get = async (f) => { const r = await fetch(LIB + f + "?h=" + hour); if (!r.ok) throw new Error(f + " " + r.status); return r.json(); };
  let main = [], seed = [];
  try { main = await get("index.json"); } catch { /* chưa import */ }
  try { seed = await get("seed-index.json"); } catch { /* chưa seed */ }
  LIST = [...main, ...seed];
  if (!LIST.length) banner("Thư viện anim chưa có clip nào (gen3d/mixamo/index.json). Chạy tools/gen3d-worker/import-mixamo.mjs.");
}

/* ---------- điều khiển ---------- */
$("ga-q").addEventListener("input", paintList);
$("ga-play").addEventListener("click", () => { A.playing = !A.playing; $("ga-play").textContent = A.playing ? "⏸ Dừng" : "▶ Chạy"; });
$("ga-speed").addEventListener("input", (e) => { A.speed = +e.target.value; $("ga-speedv").textContent = A.speed.toFixed(2) + "×"; });
$("ga-loop").addEventListener("change", (e) => { A.loop = e.target.checked; if (A.action) { A.action.setLoop(A.loop ? T.LoopRepeat : T.LoopOnce, Infinity); if (A.loop) A.action.reset().play(); } });
$("ga-inplace").addEventListener("change", (e) => { A.inplace = e.target.checked; if (A.clipEntry) play(A.clipEntry, true); });
$("ga-grid").addEventListener("change", (e) => { grid.visible = e.target.checked; });
$("ga-skel").addEventListener("change", (e) => { if (A.helper) A.helper.visible = e.target.checked; });
$("ga-scrub").addEventListener("input", (e) => { if (A.action) { A.action.time = (+e.target.value / 1000) * A.action.getClip().duration; A.action.paused = false; A.mixer.update(0); } });
addEventListener("keydown", (e) => {
  if (e.target.matches("input[type=search]")) return;
  if (e.key === " ") { e.preventDefault(); $("ga-play").click(); }
  const i = filtered.indexOf(A.clipEntry);
  if (e.key === "ArrowDown" && filtered[i + 1]) { e.preventDefault(); play(filtered[i + 1]); }
  if (e.key === "ArrowUp" && filtered[i - 1]) { e.preventDefault(); play(filtered[i - 1]); }
});

async function boot() {
  requestAnimationFrame(tick);
  const indexP = loadIndex();
  const id = Q.get("job");
  if (MOCK) $("ga-back").href = "gen3d.html?mock=1" + (id ? "#job=" + id : "");
  else if (id) $("ga-back").href = "gen3d.html#job=" + id;
  try {
    if (!id) throw new Error("thiếu ?job=<id job Gen xương>");
    const { job } = await api("get", { id });
    if (job.kind !== "rig") throw new Error("job này là " + job.kind + ", cần job Gen xương");
    if (job.status !== "done") throw new Error("job Gen xương chưa xong");
    $("ga-model").textContent = (job.title || "Model") + " · xương Mixamo";
    await loadModel(pubUrl(job.result.files.glb));
    A.model.traverse((o) => { if (o.isBone) o.userData.rest = [o.position.clone(), o.quaternion.clone()]; });
  } catch (e) {
    banner("Không mở được model: " + e.message, e.status === 401 ? ["Đăng nhập", "login.html?next=gen3d.html"] : ["Về Xưởng 3D", $("ga-back").href]);
  }
  await indexP;
  paintList();
  const want = Q.get("clip");
  const first = (want && LIST.find((e) => e.id === want || e.name.toLowerCase() === want.toLowerCase())) || LIST.find((e) => /idle/i.test(e.name)) || LIST[0];
  if (first && A.model) play(first);
}
boot();
