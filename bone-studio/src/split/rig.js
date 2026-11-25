// From a native-grid image and a skeleton spec to rig parts: labels, hidden-pixel fill, cropped part images, commands.
// Skeleton spec (coordinates in SOURCE image pixels, y down):
//   { joints: { name: [x, y] }, parts: [{ name, from, to, parent? }] }   parts listed bottom → top (draw order)
import { img } from "./pixels.js?v=20261125b";

// ---- masks -------------------------------------------------------------------------------------
export function alphaMask(im) {
  const m = new Uint8Array(im.width * im.height);
  for (let i = 0; i < m.length; i++) m[i] = im.data[i * 4 + 3] > 127 ? 1 : 0;
  return m;
}
// Chamfer distance to the nearest 0 pixel.
export function distanceTransform(mask, w, h) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + a); else v = Math.min(v, a);
    if (y > 0) v = Math.min(v, d[i - w] + a); else v = Math.min(v, a);
    if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + b);
    if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + b);
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + a); else v = Math.min(v, a);
    if (y < h - 1) v = Math.min(v, d[i + w] + a); else v = Math.min(v, a);
    if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + b);
    if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + b);
    d[i] = v;
  }
  return d;
}
function components(mask, w, h) {
  const lab = new Int32Array(w * h).fill(-1), comps = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const id = comps.length, st = [s], px = [];
    lab[s] = id;
    while (st.length) {
      const i = st.pop(); px.push(i);
      const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && mask[j] && lab[j] < 0) { lab[j] = id; st.push(j); }
    }
    comps.push(px);
  }
  return { lab, comps };
}

// ---- heuristic skeleton (offline quick mode) ---------------------------------------------------
// Humanoid guess from the silhouette: thin long pieces become props, the remaining body gets template joints
// adjusted to where the head, arms and legs actually are. Output in source pixels.
export function heuristicSkeleton(native, scale = 1, phase = [0, 0]) {
  const w = native.width, h = native.height, mask = alphaMask(native);
  const dt = distanceTransform(mask, w, h);
  let maxDt = 0;
  for (const v of dt) if (v > maxDt && v < 1e8) maxDt = v;
  // body = pixels within reach of a thick core; thin pieces far from it are props
  const r = Math.max(2, maxDt * 0.22);
  const core = new Uint8Array(w * h);
  for (let i = 0; i < core.length; i++) core[i] = dt[i] >= r ? 1 : 0;
  const coreDt = distanceTransform(core.map((v) => 1 - v), w, h);
  const body = new Uint8Array(w * h);
  for (let i = 0; i < body.length; i++) body[i] = mask[i] && coreDt[i] <= r + 1.5 ? 1 : 0;
  const { comps } = components(body, w, h);
  comps.sort((a, b) => b.length - a.length);
  const main = new Uint8Array(w * h);
  for (const i of comps[0] ?? []) main[i] = 1;
  let x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let i = 0; i < main.length; i++) if (main[i]) { const x = i % w, y = (i / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const rowSpan = (y) => { let a = -1, b = -1; for (let x = 0; x < w; x++) if (main[y * w + x]) { if (a < 0) a = x; b = x; } return [a, b]; };
  const runs = (y) => { const out = []; let s = -1; for (let x = 0; x <= w; x++) { const on = x < w && main[y * w + x]; if (on && s < 0) s = x; if (!on && s >= 0) { out.push([s, x - 1]); s = -1; } } return out; };
  const cx = (a) => (a[0] + a[1]) / 2;
  const toSrcOut = (J, parts, source) => {
    const joints = {};
    for (const [k, v] of Object.entries(J)) joints[k] = [Math.round(((v[0] + 0.5) * scale + phase[0]) * 10) / 10, Math.round(((v[1] + 0.5) * scale + phase[1]) * 10) / 10];
    return { joints, parts, root: parts[0] ? parts.find((p) => p.parent === "hong")?.from ?? parts[0].from : null, source };
  };
  const footRuns = runs(Math.round(y1 - bh * 0.1)).filter((q) => q[1] - q[0] >= 1);
  if (footRuns.length >= 3) {
    // quadruped: legs are the runs at the bottom, body above them, head on the heavier end, tail on the other
    let legTop = y1;
    while (legTop > y0 && runs(legTop).filter((q) => q[1] - q[0] >= 1).length >= 3) legTop--;
    const mid = Math.round((y0 + legTop) / 2), [bx0, bx1] = rowSpan(Math.max(y0, legTop - 1));
    const mass = (xa, xb) => { let n = 0; for (let y = y0; y <= y1; y++) for (let x = xa; x <= xb; x++) n += main[y * w + x]; return n; };
    const q4 = Math.round(bw / 4), headRight = mass(x1 - q4, x1) >= mass(x0, x0 + q4);
    const end = (right) => { let best = null; for (let i = 0; i < w * h; i++) if (mask[i]) { const x = i % w, y = (i / w) | 0; if (y > legTop) continue; const sc = (right ? x : -x) * 2 - y; if (!best || sc > best.sc) best = { sc, p: [x, y] }; } return best.p; };
    const front = headRight ? bx1 - (bx1 - bx0) * 0.15 : bx0 + (bx1 - bx0) * 0.15, back = headRight ? bx0 + (bx1 - bx0) * 0.15 : bx1 - (bx1 - bx0) * 0.15;
    const J = { hip: [back, mid], shoulder: [front, mid], head_tip: end(headRight), tail_tip: end(!headRight) };
    const legs = footRuns.slice(0, 4).sort((a, b) => a[0] - b[0]);
    const P = [];
    legs.forEach((r, i) => {
      const x = cx(r), atFront = headRight ? x > (bx0 + bx1) / 2 : x < (bx0 + bx1) / 2;
      J[`leg${i}_top`] = [x, legTop - 1]; J[`leg${i}_knee`] = [x, (legTop + y1) / 2]; J[`leg${i}_foot`] = [x, y1];
      P.push({ i, atFront, far: i % 2 === 0 });
    });
    const parts = [];
    for (const l of P.filter((l) => l.far)) parts.push({ name: `chan-${l.i + 1}-tren`, from: `leg${l.i}_top`, to: `leg${l.i}_knee`, parent: l.atFront ? "than" : "hong-sau" }, { name: `chan-${l.i + 1}-duoi`, from: `leg${l.i}_knee`, to: `leg${l.i}_foot`, parent: `chan-${l.i + 1}-tren` });
    parts.push({ name: "duoi", from: "hip", to: "tail_tip", parent: "hong-sau" });
    parts.unshift({ name: "hong-sau", from: "hip", to: "shoulder", parent: "hong" });
    parts.push({ name: "than", from: "hip", to: "shoulder", parent: "hong" }, { name: "dau", from: "shoulder", to: "head_tip", parent: "than" });
    for (const l of P.filter((l) => !l.far)) parts.push({ name: `chan-${l.i + 1}-tren`, from: `leg${l.i}_top`, to: `leg${l.i}_knee`, parent: l.atFront ? "than" : "hong-sau" }, { name: `chan-${l.i + 1}-duoi`, from: `leg${l.i}_knee`, to: `leg${l.i}_foot`, parent: `chan-${l.i + 1}-tren` });
    // the back half is only a bone for the hind legs and tail; drop its own part so the body keeps those pixels
    parts.shift();
    for (const p of parts) if (p.parent === "hong-sau") p.parent = "than";
    return toSrcOut(J, parts, "heuristic-4-chan");
  }
  let split2 = false;
  for (let y = y1; y > y0 + bh * 0.5 && !split2; y--) split2 = runs(y).filter((q) => q[1] - q[0] >= 1).length >= 2;
  if (!split2) {
    // blob: one squashy body; a narrow cap on top (hat, ears, crest) becomes its own part
    let maxW = 0;
    for (let y = y0; y <= y1; y++) { const [a, b] = rowSpan(y); if (a >= 0) maxW = Math.max(maxW, b - a + 1); }
    let capBase = y0;
    while (capBase < y1) { const [a, b] = rowSpan(capBase); if (a >= 0 && b - a + 1 > maxW * 0.6) break; capBase++; }
    const [ca, cb] = rowSpan(Math.max(y0, capBase - 1));
    const J = { base: [(x0 + x1) / 2, y1], top: [(x0 + x1) / 2, capBase], cap_base: [(ca + cb) / 2, capBase], cap_top: [(ca + cb) / 2, y0] };
    const parts = [{ name: "than", from: "base", to: "top", parent: "hong" }];
    if (capBase - y0 > bh * 0.12) parts.push({ name: "dinh", from: "cap_base", to: "cap_top", parent: "than" });
    return toSrcOut(J, parts, "heuristic-khoi");
  }
  // head: centre of the top 18 % of the body
  let hx = 0, hn = 0;
  for (let y = y0; y < y0 + bh * 0.18; y++) { const [a, b] = rowSpan(y); if (a >= 0) { hx += (a + b) / 2; hn++; } }
  hx = hn ? hx / hn : (x0 + x1) / 2;
  // legs: lowest rows where the body splits into two runs
  let crotch = y0 + bh * 0.72, legs = null;
  for (let y = y1; y > y0 + bh * 0.5; y--) {
    const rr = runs(y).filter((q) => q[1] - q[0] >= 1);
    if (rr.length >= 2) { const sorted = rr.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 2).sort((a, b) => a[0] - b[0]); legs = sorted; crotch = y; }
    else if (legs) break;
  }
  const legL = legs ? cx(legs[0]) : x0 + bw * 0.35, legR = legs ? cx(legs[1]) : x0 + bw * 0.65;
  const neckY = y0 + bh * 0.3, shoulderY = y0 + bh * 0.36, pelvisY = Math.min(crotch, y0 + bh * 0.72);
  const torsoX = (legL + legR) / 2 * 0.5 + hx * 0.5;
  // arms: widest extent at chest-to-waist rows beyond the torso core
  const torsoHalf = Math.max(bw * 0.18, (legR - legL) / 2 + 1);
  let left = [x0, shoulderY + bh * 0.2], right = [x1, shoulderY + bh * 0.2];
  for (let y = Math.round(shoulderY); y < pelvisY; y++) {
    const [a, b] = rowSpan(y);
    if (a >= 0 && a < left[0] + 0.5) left = [a, y];
    if (b >= 0 && b > right[0] - 0.5) right = [b, y];
  }
  const J = {
    head_top: [hx, y0], neck: [hx, neckY], pelvis: [torsoX, pelvisY],
    l_shoulder: [torsoX - torsoHalf, shoulderY], l_elbow: [(torsoX - torsoHalf + left[0]) / 2, (shoulderY + left[1]) / 2], l_wrist: [left[0] + 2, left[1]],
    r_shoulder: [torsoX + torsoHalf, shoulderY], r_elbow: [(torsoX + torsoHalf + right[0]) / 2, (shoulderY + right[1]) / 2], r_wrist: [right[0] - 2, right[1]],
    l_hip: [legL, pelvisY], l_knee: [legL, (pelvisY + y1) / 2], l_ankle: [legL, y1 - bh * 0.05],
    r_hip: [legR, pelvisY], r_knee: [legR, (pelvisY + y1) / 2], r_ankle: [legR, y1 - bh * 0.05],
  };
  const parts = [
    { name: "chan-sau-dui", from: "l_hip", to: "l_knee", parent: "hong" }, { name: "chan-sau-ong", from: "l_knee", to: "l_ankle", parent: "chan-sau-dui" },
    { name: "chan-truoc-dui", from: "r_hip", to: "r_knee", parent: "hong" }, { name: "chan-truoc-ong", from: "r_knee", to: "r_ankle", parent: "chan-truoc-dui" },
    { name: "than", from: "pelvis", to: "neck", parent: "hong" },
    { name: "dau", from: "neck", to: "head_top", parent: "than" },
    { name: "tay-trai-tren", from: "l_shoulder", to: "l_elbow", parent: "than" }, { name: "tay-trai-duoi", from: "l_elbow", to: "l_wrist", parent: "tay-trai-tren" },
    { name: "tay-phai-tren", from: "r_shoulder", to: "r_elbow", parent: "than" }, { name: "tay-phai-duoi", from: "r_elbow", to: "r_wrist", parent: "tay-phai-tren" },
  ];
  // props: thin components left over (staffs, swords, tails), attached to the nearest wrist
  for (const comp of comps.slice(1).concat(leftovers(mask, main, w, h))) {
    if (comp.length < Math.max(12, bw * bh * 0.01)) continue;
    const ends = farthestPair(comp, w);
    const name = `vat-${parts.filter((p) => p.name.startsWith("vat-")).length + 1}`;
    J[`${name}_a`] = ends[0]; J[`${name}_b`] = ends[1];
    const wr = ["l_wrist", "r_wrist"].sort((a, b) => segDist(J[a], ends[0], ends[1]) - segDist(J[b], ends[0], ends[1]))[0];
    parts.push({ name, from: `${name}_a`, to: `${name}_b`, parent: wr === "l_wrist" ? "tay-trai-duoi" : "tay-phai-duoi", prop: true });
  }
  const toSrc = ([x, y]) => [Math.round(((x + 0.5) * scale + phase[0]) * 10) / 10, Math.round(((y + 0.5) * scale + phase[1]) * 10) / 10];
  const joints = {};
  for (const [k, v] of Object.entries(J)) joints[k] = toSrc(v);
  // the prop goes just under the hand that holds it
  const props = parts.filter((p) => p.prop), rest = parts.filter((p) => !p.prop);
  for (const p of props) { const i = rest.findIndex((q) => q.name === p.parent); rest.splice(i, 0, p); }
  return { joints, parts: rest.map(({ prop, ...p }) => p), root: "pelvis", source: "heuristic" };
}
function leftovers(mask, main, w, h) {
  const rest = new Uint8Array(w * h);
  for (let i = 0; i < rest.length; i++) rest[i] = mask[i] && !main[i] ? 1 : 0;
  // pieces touching the main body are limbs bits, not props: keep only pieces mostly away from it
  const md = distanceTransform(main.map((v) => 1 - v), w, h);
  return components(rest, w, h).comps.filter((c) => c.filter((i) => md[i] > 3).length > c.length * 0.5);
}
function farthestPair(px, w) {
  const p = (i) => [i % w, (i / w) | 0];
  let a = p(px[0]), best = 0, b = a;
  for (const i of px) { const q = p(i), d = (q[0] - a[0]) ** 2 + (q[1] - a[1]) ** 2; if (d > best) { best = d; b = q; } }
  best = 0; let c = b;
  for (const i of px) { const q = p(i), d = (q[0] - b[0]) ** 2 + (q[1] - b[1]) ** 2; if (d > best) { best = d; c = q; } }
  return [b, c];
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// ---- segmentation ------------------------------------------------------------------------------
// Each opaque pixel goes to the part whose bone segment is nearest relative to that part's thickness,
// then a few smoothing passes that keep borders on colour edges.
export function segment(native, spec, scale = 1, phase = [0, 0]) {
  const w = native.width, h = native.height, mask = alphaMask(native), dt = distanceTransform(mask, w, h);
  const toN = ([x, y]) => [(x - phase[0]) / scale - 0.5, (y - phase[1]) / scale - 0.5];
  const segs = spec.parts.map((p) => ({ a: toN(spec.joints[p.from]), b: toN(spec.joints[p.to]) }));
  // thickness = largest inscribed radius sampled along the segment
  for (const s of segs) {
    const v = [];
    for (let t = 0.1; t <= 0.9; t += 0.05) {
      const x = Math.round(s.a[0] + (s.b[0] - s.a[0]) * t), y = Math.round(s.a[1] + (s.b[1] - s.a[1]) * t);
      if (x >= 0 && y >= 0 && x < w && y < h && dt[y * w + x] > 0 && dt[y * w + x] < 1e8) v.push(dt[y * w + x]);
    }
    v.sort((a, b) => a - b);
    s.r = Math.max(1, v.length ? v[v.length >> 1] : 1);
  }
  const n = segs.length, labels = new Int16Array(w * h).fill(-1), cost = new Float32Array(w * h * n);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const p = [i % w, (i / w) | 0];
    let best = 0, bc = Infinity;
    for (let k = 0; k < n; k++) {
      const dd = segDist(p, segs[k].a, segs[k].b), c = Math.max(0, dd - segs[k].r) + (0.5 * dd) / (segs[k].r + 1);
      cost[i * n + k] = c;
      if (c < bc) { bc = c; best = k; }
    }
    labels[i] = best;
  }
  // smoothing: a pixel switches to a neighbour's label when that is nearly as cheap and the colours match
  const d = native.data, col = (i, j) => Math.abs(d[i * 4] - d[j * 4]) + Math.abs(d[i * 4 + 1] - d[j * 4 + 1]) + Math.abs(d[i * 4 + 2] - d[j * 4 + 2]);
  for (let it = 0; it < 4; it++) {
    const next = labels.slice();
    for (let i = 0; i < w * h; i++) {
      if (labels[i] < 0) continue;
      const x = i % w, y = (i / w) | 0, votes = new Map();
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j < 0 || labels[j] < 0) continue;
        const wgt = col(i, j) < 60 ? 1 : 0.2;
        votes.set(labels[j], (votes.get(labels[j]) ?? 0) + wgt);
      }
      let best = labels[i], bs = -Infinity;
      for (const [k, v] of votes) {
        const s = v * 0.35 - cost[i * n + k];
        if (s > bs) { bs = s; best = k; }
      }
      next[i] = best;
    }
    labels.set(next);
  }
  return { labels, segs, w, h };
}

// ---- hidden-pixel fill + part images -----------------------------------------------------------
// A part is extended under the parts drawn in front of it, inside its own capsule, and the new pixels take the
// most common colour of already-filled neighbours (stays on the pixel grid, no blur). The setup pose is unchanged
// because every added pixel sits under a part that is drawn on top.
export function cutParts(native, seg, spec, { fill = true, grow = 1.15 } = {}) {
  const { labels, segs, w, h } = seg, n = segs.length, d = native.data;
  const out = [];
  for (let k = 0; k < n; k++) {
    const own = new Uint8Array(w * h);
    for (let i = 0; i < own.length; i++) own[i] = labels[i] === k ? 1 : 0;
    const filled = own.slice();
    const colour = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < own.length; i++) if (own[i]) colour.set(d.subarray(i * 4, i * 4 + 4), i * 4);
    let added = 0;
    if (fill) {
      const target = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        if (own[i] || labels[i] <= k) continue; // only under parts drawn later (on top)
        const p = [i % w, (i / w) | 0];
        if (segDist(p, segs[k].a, segs[k].b) <= segs[k].r * grow) target[i] = 1;
      }
      for (let pass = 0; pass < 200; pass++) {
        const batch = [];
        for (let i = 0; i < w * h; i++) {
          if (!target[i] || filled[i]) continue;
          const x = i % w, y = (i / w) | 0, votes = new Map();
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            if (!filled[j]) continue;
            const key = (colour[j * 4] << 16) | (colour[j * 4 + 1] << 8) | colour[j * 4 + 2];
            votes.set(key, (votes.get(key) ?? 0) + (dx && dy ? 1 : 2));
          }
          if (!votes.size) continue;
          let bk = 0, bv = -1;
          for (const [key, v] of votes) if (v > bv) { bv = v; bk = key; }
          batch.push([i, bk]);
        }
        if (!batch.length) break;
        for (const [i, key] of batch) { filled[i] = 1; colour[i * 4] = key >> 16; colour[i * 4 + 1] = (key >> 8) & 255; colour[i * 4 + 2] = key & 255; colour[i * 4 + 3] = 255; added++; }
      }
    }
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < w * h; i++) if (filled[i]) { const x = i % w, y = (i / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) { out.push(null); continue; }
    const im = img(x1 - x0 + 1, y1 - y0 + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (filled[i]) im.data.set(colour.subarray(i * 4, i * 4 + 4), ((y - y0) * im.width + (x - x0)) * 4);
    }
    out.push({ name: spec.parts[k].name, image: im, x: x0, y: y0, pixels: own.reduce((a, b) => a + b, 0), added });
  }
  return out;
}

// ---- commands ----------------------------------------------------------------------------------
// World units = source pixels, y up, origin at the bottom centre of the opaque area. Part images are on the
// native grid and drawn scaled by `scale` (nearest filtering keeps them crisp).
export function rigCommands(spec, parts, { scale, phase = [0, 0], srcHeight, prefix = "", origin }) {
  const C = [];
  const ox = origin?.[0] ?? 0, oy = origin?.[1] ?? srcHeight;
  const W = ([x, y]) => [x - ox, oy - y];
  const jw = (name) => W(spec.joints[name]);
  const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  const r2 = (v) => Math.round(v * 100) / 100;
  const world = new Map();
  const rootJ = jw(spec.root ?? spec.parts[0].from);
  C.push({ type: "doc.set", props: { pixelArt: scale >= 2 } });
  C.push({ type: "bone.add", name: `${prefix}hong`, x: r2(rootJ[0]), y: r2(rootJ[1]), rotation: 90, length: 0 });
  world.set(`${prefix}hong`, { x: rootJ[0], y: rootJ[1], rot: 90 });
  const byName = new Map(spec.parts.map((p) => [p.name, p]));
  const done = new Set();
  const addBone = (p) => {
    if (done.has(p.name)) return;
    const parent = p.parent && byName.has(p.parent) ? p.parent : null;
    if (parent) addBone(byName.get(parent));
    const pw = world.get(`${prefix}${parent ?? "hong"}`) ?? world.get(`${prefix}hong`);
    const a = jw(p.from), b = jw(p.to), rot = ang(a, b);
    const dx = a[0] - pw.x, dy = a[1] - pw.y, pr = -pw.rot * Math.PI / 180;
    C.push({ type: "bone.add", name: `${prefix}${p.name}`, parent: `${prefix}${parent ?? "hong"}`,
      x: r2(dx * Math.cos(pr) - dy * Math.sin(pr)), y: r2(dx * Math.sin(pr) + dy * Math.cos(pr)), rotation: r2(rot - pw.rot), length: r2(Math.hypot(b[0] - a[0], b[1] - a[1])) });
    world.set(`${prefix}${p.name}`, { x: a[0], y: a[1], rot });
    done.add(p.name);
  };
  spec.parts.forEach(addBone);
  spec.parts.forEach((p, k) => {
    const part = parts[k];
    if (!part) return;
    const path = `${prefix}${p.name}`, bw = world.get(path);
    // centre of the part image in world, then into bone space
    const cxs = (part.x + part.image.width / 2) * scale + phase[0], cys = (part.y + part.image.height / 2) * scale + phase[1];
    const [cx, cy] = W([cxs, cys]);
    const dx = cx - bw.x, dy = cy - bw.y, br = -bw.rot * Math.PI / 180;
    C.push({ type: "image.add", path, width: part.image.width, height: part.image.height });
    C.push({ type: "slot.add", name: path, bone: path, attachment: path });
    C.push({ type: "attachment.add", slot: path, name: path, attachment: {
      path, x: r2(dx * Math.cos(br) - dy * Math.sin(br)), y: r2(dx * Math.sin(br) + dy * Math.cos(br)), rotation: r2(-bw.rot),
      width: r2(part.image.width * scale), height: r2(part.image.height * scale) } });
  });
  return C;
}
