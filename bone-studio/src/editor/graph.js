// Graph view: value-over-time curves of the selected bone's keyed channels, editable keys and bezier handles.
import { S, doc, run, setTime, currentAnim, selectedBones, toast } from "./state.js?v=20261125e";
import { curveAt } from "../../runtime/xuong.js?v=20261125e";

const CH = [
  { prop: "rotate", field: "value", label: "xoay", color: "#7fd36b" },
  { prop: "translate", field: "x", label: "dời x", color: "#4fb3ff" },
  { prop: "translate", field: "y", label: "dời y", color: "#2f7fd0" },
  { prop: "scale", field: "x", label: "scale x", color: "#e8504a" },
  { prop: "scale", field: "y", label: "scale y", color: "#b03a36" },
  { prop: "shear", field: "x", label: "shear x", color: "#c07cff" },
  { prop: "shear", field: "y", label: "shear y", color: "#8f5ac0" },
];
let view = null, drag = null, hidden = new Set();

function channels() {
  const a = currentAnim(), bone = selectedBones()[0];
  if (!a || !bone) return [];
  return CH.filter((c) => a.bones?.[bone]?.[c.prop]?.length && !hidden.has(c.label)).map((c) => ({ ...c, bone, keys: a.bones[bone][c.prop] }));
}
export function graphLegend() {
  const a = currentAnim(), bone = selectedBones()[0];
  return CH.filter((c) => a?.bones?.[bone]?.[c.prop]?.length).map((c) => ({ ...c, hidden: hidden.has(c.label), toggle: () => (hidden.has(c.label) ? hidden.delete(c.label) : hidden.add(c.label)) }));
}

// x: frames → px (same as the dopesheet), y: value → px, fitted to the visible channels
export function drawGraph(ctx, W, H, xOf, RULER) {
  const chs = channels();
  ctx.fillStyle = "#1c1e23"; ctx.fillRect(0, RULER, W, H - RULER);
  if (!chs.length) {
    ctx.fillStyle = "#8a909e"; ctx.font = "12px system-ui";
    ctx.fillText(selectedBones()[0] ? "Bone này chưa có key trong animation" : "Chọn một bone để xem đường cong", 16, RULER + 24);
    view = null; return;
  }
  let lo = Infinity, hi = -Infinity;
  for (const c of chs) for (const k of c.keys) { lo = Math.min(lo, k[c.field]); hi = Math.max(hi, k[c.field]); }
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.15;
  lo -= pad; hi += pad;
  const yOf = (v) => RULER + 8 + (1 - (v - lo) / (hi - lo)) * (H - RULER - 16);
  const vOf = (y) => lo + (1 - (y - RULER - 8) / (H - RULER - 16)) * (hi - lo);
  view = { yOf, vOf, xOf, chs };
  window.__graph = view;
  // zero line + value ticks
  ctx.font = "10px ui-monospace, monospace"; ctx.fillStyle = "#6c7280";
  for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4, y = yOf(v); ctx.strokeStyle = "#262a31"; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.fillText(v.toFixed(Math.abs(hi - lo) < 5 ? 2 : 0), 4, y - 2); }
  for (const c of chs) {
    ctx.strokeStyle = c.color; ctx.lineWidth = 1.6; ctx.beginPath();
    c.keys.forEach((k, i) => {
      const n = c.keys[i + 1], x0 = xOf(k.time), y0 = yOf(k[c.field]);
      if (i === 0) { ctx.moveTo(0, y0); ctx.lineTo(x0, y0); }
      if (!n) { ctx.lineTo(9999, y0); return; }
      const x1 = xOf(n.time);
      for (let s = 1; s <= 24; s++) { const p = s / 24, v = k[c.field] + (n[c.field] - k[c.field]) * curveAt(k.curve, p); ctx.lineTo(x0 + (x1 - x0) * p, yOf(v)); }
    });
    ctx.stroke(); ctx.lineWidth = 1;
    c.keys.forEach((k, i) => {
      const x = xOf(k.time), y = yOf(k[c.field]), sel = S.keySel.some((q) => q.track.bone === c.bone && q.track.prop === c.prop && Math.abs(q.time - k.time) < 1e-4);
      ctx.fillStyle = sel ? "#ffd84a" : c.color; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.strokeStyle = "#000a"; ctx.strokeRect(x - 4, y - 4, 8, 8);
      // bezier handles for the segment after a selected key
      const n = c.keys[i + 1];
      if (sel && n && Array.isArray(k.curve)) {
        const [h1, h2] = handles(c, k, n);
        ctx.strokeStyle = "#ffd84a99"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(h1[0], h1[1]); ctx.moveTo(xOf(n.time), yOf(n[c.field])); ctx.lineTo(h2[0], h2[1]); ctx.stroke();
        for (const hp of [h1, h2]) { ctx.beginPath(); ctx.arc(hp[0], hp[1], 4, 0, Math.PI * 2); ctx.fillStyle = "#ffd84a"; ctx.fill(); }
      }
    });
  }
}
function handles(c, k, n) {
  const [x1, y1, x2, y2] = k.curve, X0 = view.xOf(k.time), X1 = view.xOf(n.time), v0 = k[c.field], v1 = n[c.field];
  const dv = Math.abs(v1 - v0) < 1e-9 ? 1 : v1 - v0;
  return [[X0 + (X1 - X0) * x1, view.yOf(v0 + dv * y1)], [X0 + (X1 - X0) * x2, view.yOf(v0 + dv * y2)]];
}

export function graphDown(x, y, e) {
  if (!view) return false;
  for (const c of view.chs) for (let i = 0; i < c.keys.length; i++) {
    const k = c.keys[i], n = c.keys[i + 1];
    if (n && Array.isArray(k.curve) && S.keySel.some((q) => q.track.bone === c.bone && q.track.prop === c.prop && Math.abs(q.time - k.time) < 1e-4)) {
      const hs = handles(c, k, n);
      for (let hI = 0; hI < 2; hI++) if (Math.hypot(hs[hI][0] - x, hs[hI][1] - y) < 7) { drag = { kind: "handle", c, i, hI }; S.hist.begin("Sửa curve"); return true; }
    }
  }
  for (const c of view.chs) for (const k of c.keys) {
    if (Math.abs(view.xOf(k.time) - x) < 6 && Math.abs(view.yOf(k[c.field]) - y) < 6) {
      const tr = { bone: c.bone, prop: c.prop };
      if (!(e.ctrlKey || e.metaKey)) S.keySel = [];
      if (!S.keySel.some((q) => q.track.prop === tr.prop && q.track.bone === tr.bone && q.time === k.time)) S.keySel.push({ track: tr, time: k.time });
      setTime(k.time);
      drag = { kind: "key", c, key: { ...k }, x0: x, y0: y };
      S.hist.begin("Sửa key");
      return true;
    }
  }
  return false;
}
export function graphMove(x, y, e) {
  if (!drag) return false;
  try {
    if (drag.kind === "key") {
      const { c, key } = drag, v = view.vOf(y);
      const value = c.prop === "rotate" ? round(v) : { x: c.field === "x" ? round(v) : key.x, y: c.field === "y" ? round(v) : key.y };
      if (e.shiftKey || Math.abs(y - drag.y0) > 2) S.hist.runCoalesced({ type: "key.set", anim: S.anim, track: { bone: c.bone, prop: c.prop }, time: key.time, value, ...(key.curve ? { curve: key.curve } : {}) }, "gk");
    } else {
      const { c, i, hI } = drag, k = currentAnim().bones[c.bone][c.prop][i], n = currentAnim().bones[c.bone][c.prop][i + 1];
      const X0 = view.xOf(k.time), X1 = view.xOf(n.time), v0 = k[c.field], dv = Math.abs(n[c.field] - v0) < 1e-9 ? 1 : n[c.field] - v0;
      const cx = Math.max(0, Math.min(1, (x - X0) / (X1 - X0))), cy = (view.vOf(y) - v0) / dv;
      const cur = Array.isArray(k.curve) ? k.curve.slice() : [0.33, 0, 0.67, 1];
      if (hI === 0) { cur[0] = cx; cur[1] = cy; } else { cur[2] = cx; cur[3] = cy; }
      S.hist.runCoalesced({ type: "key.curve", anim: S.anim, track: { bone: c.bone, prop: c.prop }, time: k.time, curve: cur.map(round) }, "gc");
    }
  } catch (err) { toast(err.message, true); }
  return true;
}
export function graphUp() { if (!drag) return false; drag = null; S.hist.end(); return true; }
const round = (v) => Math.round(v * 1000) / 1000;
void run; void doc;
