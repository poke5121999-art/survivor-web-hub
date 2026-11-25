// Timeline: playback bar and dopesheet.
import { S, doc, emit, on, h, run, setTime, duration, currentAnim, selectedBones, frame, toast, startMixPreview, stopMixPreview, tickMixPreview } from "./state.js?v=20261125l";
import { drawGraph, graphDown, graphMove, graphUp, graphLegend } from "./graph.js?v=20261125l";
import { newAnim } from "./panels.js?v=20261125l";

const root = document.getElementById("xx-timeline");
const COLORS = { rotate: "#7fd36b", translate: "#4fb3ff", scale: "#e8504a", shear: "#c07cff", attachment: "#f0d23a", rgba: "#ff8fd0", drawOrder: "#cfcfcf", events: "#ffffff", ik: "#f0a63a", transform: "#8fd3ff", dark: "#b07040" };
const RULER = 20, ROW = 20;
let tlView = "dope", pxPerFrame = 12, scroll = 0, vscroll = 0, rows = [], expanded = new Set(), dragKeys = null, scrubbing = false;

const bar = h("div", { class: "xx-tl-bar" });
const names = h("div", { class: "xx-tl-names" });
const cwrap = h("div", { class: "xx-tl-canvas" });
const cv = h("canvas");
cwrap.append(cv);
root.append(bar, h("div", { class: "xx-tl-body" }, names, cwrap));
const ctx = cv.getContext("2d");

function trackKeys(anim, tr) {
  if (!anim) return [];
  if (tr.bone) return anim.bones?.[tr.bone]?.[tr.prop] ?? [];
  if (tr.slot) return anim.slots?.[tr.slot]?.[tr.prop] ?? [];
  if (tr.drawOrder) return anim.drawOrder ?? [];
  if (tr.event) return anim.events ?? [];
  if (tr.ik) return anim.ik?.[tr.ik] ?? [];
  if (tr.transform) return anim.transform?.[tr.transform] ?? [];
  return [];
}
const propOf = (tr) => tr.prop ?? (tr.drawOrder ? "drawOrder" : tr.event ? "events" : tr.transform ? "transform" : "ik");

function buildRows() {
  const d = doc(), a = currentAnim(), out = [], sel = new Set(selectedBones());
  const all = [];
  const boneNames = d.bones.map((b) => b.name).filter((n) => a?.bones?.[n] || sel.has(n));
  for (const n of boneNames) {
    const tracks = ["rotate", "translate", "scale", "shear"].map((p) => ({ bone: n, prop: p }));
    const open = expanded.has(n) || sel.has(n);
    const has = tracks.filter((t) => trackKeys(a, t).length || open);
    all.push(...tracks);
    out.push({ id: "b:" + n, label: n, icon: "🦴", tracks, open, bone: n });
    if (open) for (const t of tracks) out.push({ id: `b:${n}:${t.prop}`, label: { rotate: "xoay", translate: "dời", scale: "scale", shear: "shear" }[t.prop], sub: true, tracks: [t] });
    void has;
  }
  for (const s of d.slots) {
    for (const p of ["attachment", "rgba", "dark"]) {
      const t = { slot: s.name, prop: p };
      if (!trackKeys(a, t).length && !(S.sel?.kind === "slot" && S.sel.name === s.name)) continue;
      all.push(t);
      out.push({ id: `s:${s.name}:${p}`, label: `${s.name} · ${{ attachment: "ảnh", rgba: "màu", dark: "màu tối" }[p]}`, icon: "▭", tracks: [t] });
    }
  }
  for (const c of d.ik ?? []) if (a?.ik?.[c.name]) { const t = { ik: c.name }; all.push(t); out.push({ id: "ik:" + c.name, label: c.name, icon: "⟳", tracks: [t] }); }
  for (const c of d.transform ?? []) if (a?.transform?.[c.name]) { const t = { transform: c.name }; all.push(t); out.push({ id: "tc:" + c.name, label: c.name, icon: "⇉", tracks: [t] }); }
  const dt = { drawOrder: true }, ev = { event: true };
  all.push(dt, ev);
  out.push({ id: "draworder", label: "Draw order", icon: "≡", tracks: [dt] }, { id: "events", label: "Event", icon: "⚑", tracks: [ev] });
  out.unshift({ id: "all", label: S.anim ?? "(chưa có animation)", icon: "▶", tracks: all, summary: true });
  return out;
}

function renderBar() {
  const d = doc(), anims = Object.keys(d.animations);
  const sel = h("select", { title: "Animation đang sửa", onchange: () => { S.anim = sel.value || null; S.time = 0; S.keySel = []; emit("anim"); } },
    h("option", { value: "", text: "— chọn animation —" }), ...anims.map((n) => h("option", { value: n, text: n, selected: n === S.anim })));
  const fr = h("input", { type: "number", min: 0, step: 1, value: frame(), title: "Khung hiện tại", onchange: () => setTime(+fr.value / (d.fps || 30)) });
  const speed = h("select", { title: "Tốc độ phát", onchange: () => { S.speed = +speed.value; } }, ...[0.25, 0.5, 1, 1.5, 2].map((v) => h("option", { value: v, text: v * 100 + "%", selected: v === S.speed })));
  const curveBtn = (label, curve, tip) => h("button", { text: label, title: tip, disabled: !S.keySel.length, onclick: () => setCurve(curve) });
  const mixTo = h("select", { title: "Trộn sang animation" }, ...anims.filter((n) => n !== S.anim).map((n) => h("option", { value: n, text: "→ " + n })));
  const mixDur = h("input", { type: "number", min: 0, max: 2, step: 0.05, value: 0.25, title: "Thời gian trộn (giây)", style: "width:58px" });
  const ob = h("input", { type: "number", min: 0, max: 10, value: S.onion.before, title: "Số khung ma phía trước", style: "width:42px", onchange: () => { S.onion.before = +ob.value; } });
  const oa = h("input", { type: "number", min: 0, max: 10, value: S.onion.after, title: "Số khung ma phía sau", style: "width:42px", onchange: () => { S.onion.after = +oa.value; } });
  bar.replaceChildren(
    h("button", { text: tlView === "dope" ? "Dopesheet" : "Graph", title: "Đổi giữa dopesheet và graph (đường cong)", class: "is-on", onclick: () => { tlView = tlView === "dope" ? "graph" : "dope"; refresh(); } }),
    sel, h("button", { text: "+", title: "Animation mới", onclick: newAnim }),
    h("span", { class: "xx-sep" }),
    h("button", { text: "⏮", title: "Về đầu (Home)", onclick: () => setTime(0) }),
    h("button", { text: "◀", title: "Khung trước (←)", onclick: () => step(-1) }),
    h("button", { text: S.playing ? "⏸" : "▶", title: "Phát / dừng (Space)", class: S.playing ? "is-on" : "", onclick: togglePlay }),
    h("button", { text: "▶", title: "Khung sau (→)", onclick: () => step(1) }),
    h("button", { text: "⟲", title: "Lặp", class: S.loop ? "is-on" : "", onclick: () => { S.loop = !S.loop; renderBar(); } }),
    speed, h("span", { class: "xx-muted", text: "khung" }), fr,
    h("span", { class: "xx-muted", text: `/ ${Math.round(duration() * d.fps)} · ${d.fps} fps` }),
    h("span", { class: "xx-sep" }),
    h("button", { text: "Auto key", title: "Mọi thay đổi tự thành key", class: S.autoKey ? "is-on" : "", onclick: () => { S.autoKey = !S.autoKey; emit("tools"); } }),
    h("button", { text: "Onion", title: "Hiện khung ma trước/sau", class: S.onion.on ? "is-on" : "", onclick: () => { S.onion.on = !S.onion.on; renderBar(); } }), ob, oa,
    h("span", { class: "xx-sep" }),
    curveBtn("Linear", "linear", "Curve tuyến tính"), curveBtn("Stepped", "stepped", "Giữ nguyên tới key sau"),
    curveBtn("Ease", [0.42, 0, 0.58, 1], "Chậm-nhanh-chậm"), curveBtn("In", [0.42, 0, 1, 1], "Chậm lúc đầu"), curveBtn("Out", [0, 0, 0.58, 1], "Chậm lúc cuối"),
    h("button", { text: "Xoá key", disabled: !S.keySel.length, title: "Delete", onclick: deleteKeys }),
    h("span", { class: "xx-sep" }),
    mixTo, mixDur,
    h("button", { text: S.mixPreview ? "■ Dừng trộn" : "Xem trộn", class: S.mixPreview ? "is-on" : "", title: "Phát animation đang sửa rồi chuyển mượt sang animation đã chọn, lặp lại", disabled: !S.anim || anims.length < 2,
      onclick: () => { if (S.mixPreview) stopMixPreview(); else startMixPreview(S.anim, mixTo.value, +mixDur.value); renderBar(); } }),
  );
}

function renderNames() {
  if (tlView === "graph") {
    names.replaceChildren(h("div", { style: `height:${RULER}px;border-bottom:1px solid var(--line)`, text: selectedBones()[0] ? "🦴 " + selectedBones()[0] : "" }),
      ...graphLegend().map((c) => h("div", { style: `cursor:pointer;color:${c.hidden ? "var(--muted)" : c.color}`, title: "Bấm để ẩn/hiện", onclick: () => { c.toggle(); renderNames(); } }, h("span", { text: c.hidden ? "○" : "●" }), h("span", { text: c.label }))));
    return;
  }
  names.replaceChildren(h("div", { style: `height:${RULER}px;border-bottom:1px solid var(--line)` }),
    ...rows.map((r) => h("div", { class: (r.sub ? "is-sub " : "") + (r.bone && selectedBones().includes(r.bone) ? "is-sel" : ""), title: r.label,
      onclick: () => { if (r.bone) { expanded.has(r.bone) ? expanded.delete(r.bone) : expanded.add(r.bone); refresh(); } } },
      h("span", { text: r.icon ?? "" }), h("span", { text: r.label }))));
}

const xOf = (t) => (t * (doc().fps || 30) - scroll) * pxPerFrame + 10;
const tOf = (x) => ((x - 10) / pxPerFrame + scroll) / (doc().fps || 30);

export function drawTimeline() {
  if (S.mode !== "animate") return;
  const r = cwrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (!r.width) return;
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height, fps = doc().fps || 30, a = currentAnim(), dur = duration();
  ctx.fillStyle = "#1e2026"; ctx.fillRect(0, 0, W, H);
  // rows
  rows.forEach((row, i) => { ctx.fillStyle = i % 2 ? "#202329" : "#1c1e23"; ctx.fillRect(0, RULER + i * ROW - vscroll, W, ROW); });
  // ruler + frame grid
  ctx.fillStyle = "#24272e"; ctx.fillRect(0, 0, W, RULER);
  const every = pxPerFrame >= 10 ? 1 : pxPerFrame >= 4 ? 5 : 10;
  ctx.font = "10px ui-monospace, monospace"; ctx.textBaseline = "middle";
  for (let f = Math.floor(scroll); xOf(f / fps) < W; f++) {
    const x = Math.round(xOf(f / fps)) + 0.5;
    if (f % every) continue;
    ctx.strokeStyle = f % (every * 5) === 0 ? "#3a3e48" : "#2a2d34";
    ctx.beginPath(); ctx.moveTo(x, f % (every * 5) === 0 ? 4 : 12); ctx.lineTo(x, H); ctx.stroke();
    if (f % (every * 5) === 0) { ctx.fillStyle = "#8a909e"; ctx.fillText(String(f), x + 3, 9); }
  }
  if (tlView === "graph") {
    ctx.save(); ctx.beginPath(); ctx.rect(0, RULER, W, H - RULER); ctx.clip();
    drawGraph(ctx, W, H, xOf, RULER);
    ctx.restore();
    const gx = xOf(S.time);
    ctx.strokeStyle = "#4fd0ff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); ctx.lineWidth = 1;
    return;
  }
  // duration line
  if (dur > 0) { const x = xOf(dur); ctx.strokeStyle = "#f0a63a88"; ctx.beginPath(); ctx.moveTo(x, RULER); ctx.lineTo(x, H); ctx.stroke(); }
  // keys
  ctx.save(); ctx.beginPath(); ctx.rect(0, RULER, W, H - RULER); ctx.clip();
  const selKey = (tr, t) => S.keySel.some((k) => JSON.stringify(k.track) === JSON.stringify(tr) && Math.abs(k.time - t) < 1e-4);
  rows.forEach((row, i) => {
    const y = RULER + i * ROW + ROW / 2 - vscroll, seen = new Map();
    if (y < RULER - ROW || y > H + ROW) return;
    for (const tr of row.tracks) {
      const keys = trackKeys(a, tr);
      keys.forEach((k, n) => {
        const x = xOf(k.time + (dragKeys?.moving && selKey(tr, k.time) ? dragKeys.dt : 0));
        if (row.tracks.length === 1 && keys[n + 1] && (tr.bone || tr.prop === "rgba" || tr.prop === "dark" || tr.transform)) {
          const x2 = xOf(keys[n + 1].time);
          ctx.strokeStyle = COLORS[propOf(tr)] + "66"; ctx.setLineDash(k.curve === "stepped" ? [2, 3] : []);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y); ctx.stroke(); ctx.setLineDash([]);
        }
        const prev = seen.get(k.time);
        seen.set(k.time, { color: prev && prev.color !== COLORS[propOf(tr)] ? "#ffffff" : COLORS[propOf(tr)], sel: (prev?.sel ?? false) || selKey(tr, k.time) });
      });
    }
    for (const [t, { color, sel }] of seen) {
      const x = xOf(t + (dragKeys?.moving && sel ? dragKeys.dt : 0)), s = row.summary ? 5 : 4.5;
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath();
      ctx.fillStyle = sel ? "#ffd84a" : color; ctx.fill(); ctx.strokeStyle = sel ? "#fff" : "#0008"; ctx.stroke();
    }
  });
  ctx.restore();
  // playhead
  const px = xOf(S.time);
  ctx.strokeStyle = "#4fd0ff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = "#4fd0ff"; ctx.fillRect(px - 14, 2, 28, 15); ctx.fillStyle = "#08131d"; ctx.textAlign = "center"; ctx.fillText(String(Math.round(S.time * fps * 10) / 10), px, 10); ctx.textAlign = "left";
  if (dragKeys?.box) { ctx.strokeStyle = "#4fb3ff"; ctx.setLineDash([4, 3]); ctx.strokeRect(dragKeys.box.x0, dragKeys.box.y0, dragKeys.box.x1 - dragKeys.box.x0, dragKeys.box.y1 - dragKeys.box.y0); ctx.setLineDash([]); }
}

function keysAt(row, t) {
  const a = currentAnim(), out = [];
  for (const tr of row.tracks) for (const k of trackKeys(a, tr)) if (Math.abs(k.time - t) < 1e-4) out.push({ track: tr, time: k.time });
  return out;
}
function hitKey(x, y) {
  const i = Math.floor((y - RULER + vscroll) / ROW), row = rows[i];
  if (!row) return null;
  const a = currentAnim();
  let best = null, bd = 7;
  for (const tr of row.tracks) for (const k of trackKeys(a, tr)) { const d = Math.abs(xOf(k.time) - x); if (d < bd) { bd = d; best = k.time; } }
  return best === null ? null : { row, time: best };
}

cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId);
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (y < RULER || e.button === 1) { scrubbing = true; setTime(Math.max(0, tOf(x))); return; }
  if (tlView === "graph") { if (!graphDown(x, y, e)) { scrubbing = true; setTime(Math.max(0, tOf(x))); } renderBar(); return; }
  const hit = hitKey(x, y);
  if (!hit) {
    if (!e.ctrlKey) S.keySel = [];
    dragKeys = { box: { x0: x, y0: y, x1: x, y1: y } };
    setTime(Math.max(0, tOf(x)));
    return;
  }
  const ks = keysAt(hit.row, hit.time);
  const isIn = ks.every((k) => S.keySel.some((s) => JSON.stringify(s.track) === JSON.stringify(k.track) && Math.abs(s.time - k.time) < 1e-4));
  if (e.ctrlKey || e.metaKey) S.keySel = isIn ? S.keySel.filter((s) => !ks.some((k) => JSON.stringify(s.track) === JSON.stringify(k.track) && Math.abs(s.time - k.time) < 1e-4)) : [...S.keySel, ...ks];
  else if (!isIn) S.keySel = ks;
  dragKeys = { x0: x, dt: 0, moving: false, copy: e.altKey };
  setTime(hit.time);
  renderBar();
});
cv.addEventListener("pointermove", (e) => {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (scrubbing) { setTime(Math.max(0, tOf(x))); return; }
  if (tlView === "graph") { graphMove(x, y, e); return; }
  if (!dragKeys) return;
  if (dragKeys.box) { dragKeys.box.x1 = x; dragKeys.box.y1 = y; return; }
  const fps = doc().fps || 30;
  const df = Math.round((x - dragKeys.x0) / pxPerFrame);
  const minT = Math.min(...S.keySel.map((k) => k.time));
  dragKeys.dt = Math.max(-minT, df / fps);
  dragKeys.moving = df !== 0;
});
cv.addEventListener("pointerup", () => {
  scrubbing = false;
  if (graphUp()) return;
  const d = dragKeys;
  dragKeys = null;
  if (!d) return;
  if (d.box) {
    const { x0, x1, y0, y1 } = d.box, X0 = Math.min(x0, x1), X1 = Math.max(x0, x1), Y0 = Math.min(y0, y1), Y1 = Math.max(y0, y1);
    if (X1 - X0 > 3) {
      const a = currentAnim();
      rows.forEach((row, i) => {
        const yy = RULER + i * ROW + ROW / 2 - vscroll;
        if (yy < Y0 || yy > Y1 || row.summary) return;
        for (const tr of row.tracks) for (const k of trackKeys(a, tr)) { const kx = xOf(k.time); if (kx >= X0 && kx <= X1 && !S.keySel.some((s) => JSON.stringify(s.track) === JSON.stringify(tr) && s.time === k.time)) S.keySel.push({ track: tr, time: k.time }); }
      });
    }
    renderBar();
    return;
  }
  if (d.moving && d.dt) moveKeys(d.dt);
});
function onWheel(e) {
  e.preventDefault();
  if (e.ctrlKey) pxPerFrame = Math.max(2, Math.min(60, pxPerFrame * Math.exp(-e.deltaY * 0.002)));
  else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) scroll = Math.max(0, scroll + (e.deltaX || e.deltaY) / pxPerFrame);
  else { const max = Math.max(0, rows.length * ROW + RULER - cwrap.clientHeight + 4); vscroll = Math.max(0, Math.min(max, vscroll + e.deltaY)); names.scrollTop = vscroll; }
}
cv.addEventListener("wheel", onWheel, { passive: false });
names.addEventListener("wheel", onWheel, { passive: false });

function moveKeys(dt) {
  const cmds = [];
  // move later keys first when going right (and earlier first when going left) so they do not overwrite each other
  const list = [...S.keySel].sort((a, b) => (dt > 0 ? b.time - a.time : a.time - b.time));
  for (const k of list) cmds.push({ type: "key.move", anim: S.anim, track: k.track, time: k.time, to: Math.round((k.time + dt) * 1e4) / 1e4 });
  if (run(cmds, "Dời key")) { S.keySel = S.keySel.map((k) => ({ ...k, time: Math.round((k.time + dt) * 1e4) / 1e4 })); setTime(S.time + dt); }
}
export function deleteKeys() {
  if (!S.keySel.length) return;
  const a = currentAnim();
  const cmds = S.keySel.map((k) => ({ type: "key.remove", anim: S.anim, track: k.track, time: k.time, ...(k.track.event ? { value: { name: trackKeys(a, k.track).find((x) => Math.abs(x.time - k.time) < 1e-4)?.name } } : {}) }));
  if (run(cmds, "Xoá key")) S.keySel = [];
}
function setCurve(curve) {
  const cmds = S.keySel.filter((k) => k.track.bone || k.track.prop === "rgba" || k.track.prop === "dark" || k.track.ik || k.track.transform).map((k) => ({ type: "key.curve", anim: S.anim, track: k.track, time: k.time, curve }));
  if (!cmds.length) return toast("Key đang chọn không có curve (ảnh, draw order, event)", true);
  run(cmds, "Đổi curve");
}
export function copyKeys() {
  const a = currentAnim(), t0 = Math.min(...S.keySel.map((k) => k.time));
  return S.keySel.map((k) => { const key = trackKeys(a, k.track).find((x) => Math.abs(x.time - k.time) < 1e-4); return { track: k.track, dt: k.time - t0, key }; });
}
// Paste at the playhead. Keys copied from one bone land on the selected bone when exactly one bone is selected.
export function pasteKeys(clip) {
  if (!clip?.length || !S.anim) return;
  const sel = selectedBones(), srcBones = [...new Set(clip.filter((c) => c.track.bone).map((c) => c.track.bone))];
  const remap = srcBones.length === 1 && sel.length === 1 ? { [srcBones[0]]: sel[0] } : {};
  const cmds = clip.map(({ track, dt, key }) => {
    const tr = track.bone ? { ...track, bone: remap[track.bone] ?? track.bone } : track;
    const { time, curve, ...fields } = key;
    const value = tr.bone ? (tr.prop === "rotate" ? fields.value : { x: fields.x, y: fields.y }) : tr.prop === "attachment" ? fields.name : tr.prop === "rgba" || tr.prop === "dark" ? fields.color : tr.drawOrder ? fields.order : tr.event ? fields : fields;
    return { type: "key.set", anim: S.anim, track: tr, time: Math.round((S.time + dt) * 1e4) / 1e4, value, ...(curve ? { curve } : {}) };
  });
  run(cmds, "Dán key");
}

export function step(n) {
  const fps = doc().fps || 30, dur = duration();
  let t = Math.round(S.time * fps + n) / fps;
  if (S.loop && dur > 0) t = ((t % dur) + dur) % dur;
  setTime(Math.max(0, t));
}
export function jumpKey(dir) {
  const a = currentAnim(), times = new Set();
  for (const r of rows) for (const tr of r.tracks) for (const k of trackKeys(a, tr)) times.add(k.time);
  const sorted = [...times].sort((x, y) => x - y);
  const t = dir > 0 ? sorted.find((x) => x > S.time + 1e-4) : sorted.reverse().find((x) => x < S.time - 1e-4);
  if (t !== undefined) setTime(t);
}
export function togglePlay() {
  if (!S.anim) return toast("Chưa chọn animation", true);
  S.playing = !S.playing;
  if (S.playing && S.time >= duration() - 1e-4) S.time = 0;
  renderBar();
}
export function tick(dt) {
  if (S.mixPreview) { tickMixPreview(dt); return; }
  if (!S.playing) return;
  const dur = duration();
  let t = S.time + dt * S.speed;
  if (t > dur) { if (S.loop && dur > 0) t %= dur; else { t = dur; S.playing = false; renderBar(); } }
  S.time = t;
  if (Object.keys(S.overrides).length) S.overrides = {};
  const fr = bar.querySelector('input[type="number"]');
  if (fr && document.activeElement !== fr) fr.value = frame();
}

function refresh() { rows = buildRows(); renderNames(); renderBar(); }
on((what) => { if (what !== "view" && what !== "pose") { if (what === "time") { const fr = bar.querySelector('input[type="number"]'); if (fr && document.activeElement !== fr) fr.value = frame(); } else refresh(); } });
refresh();
