// Level 5 shape drawing, after the "Gesture Recognizer" asset the game ships (GestureRecognizer.Recognizer, Detail = 100).
// Patterns are the original GesturePattern lines (0..1 box, y up). The asset's method bodies are not in the IL2CPP
// dump, so scoring is a symmetric resampled-curve distance: both shapes are scaled into the unit box (aspect kept),
// resampled to DETAIL points along their length, and the mean nearest-point distance d maps to score = 1 - d / SPREAD.
// useLinesDirections = 0 in every pattern, so direction and start point do not matter.
export const PATTERNS = {
  Circle: { closed: true, pts: [[0.5, 1], [0.25, 0.9375], [0.0625, 0.75], [0, 0.5], [0.0625, 0.25], [0.25, 0.0625], [0.5, 0], [0.75, 0.0625], [0.9375, 0.25], [1, 0.5], [0.9375, 0.75], [0.75, 0.9375]] },
  heart: { closed: true, pts: [[0.4375, 0.0625], [0, 0.5], [0, 0.875], [0.125, 1], [0.375, 1], [0.5, 0.875], [0.625, 1], [0.875, 1], [1, 0.875], [1, 0.5], [0.5625, 0.0625]] },
  bolt: { closed: false, pts: [[0.6875, 1], [0.3125, 0.6875], [0.6875, 0.3125], [0.3125, 0]] },
  loop: { closed: false, pts: [[0.75, 1], [0.25, 0.5], [0.25, 0], [0.75, 0], [0.75, 0.5], [0.25, 1]] },
  Triangle: { closed: true, pts: [[0.875, 0.125], [0.5, 0.875], [0.125, 0.125]] },
};

const DETAIL = 100;
const SPREAD = 0.2;

function normalize(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const s = Math.max(x1 - x0, y1 - y0) || 1;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return pts.map(([x, y]) => [(x - cx) / s + 0.5, (y - cy) / s + 0.5]);
}

function resample(pts, closed) {
  const path = closed ? [...pts, pts[0]] : pts;
  const seg = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    seg.push(l);
    total += l;
  }
  if (!total) return Array.from({ length: DETAIL }, () => path[0].slice());
  const out = [];
  let i = 0, acc = 0;
  for (let k = 0; k < DETAIL; k++) {
    const want = (total * k) / (DETAIL - 1);
    while (i < seg.length - 1 && acc + seg[i] < want) acc += seg[i++];
    const t = seg[i] ? Math.min(1, (want - acc) / seg[i]) : 0;
    out.push([path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t]);
  }
  return out;
}

function meanNearest(a, b) {
  let sum = 0;
  for (const p of a) {
    let best = Infinity;
    for (const q of b) best = Math.min(best, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2);
    sum += Math.sqrt(best);
  }
  return sum / a.length;
}

const prepared = new Map();
function pattern(id) {
  if (!prepared.has(id)) {
    const p = PATTERNS[id];
    prepared.set(id, resample(normalize(p.pts), p.closed));
  }
  return prepared.get(id);
}

// stroke: [[x, y], ...] in any units with y up. Returns 0..1 (the game accepts Circle at 0.6, the rest at 0.8).
export function score(id, stroke) {
  if (stroke.length < 2) return 0;
  const q = resample(normalize(stroke), false);
  const p = pattern(id);
  const d = (meanNearest(q, p) + meanNearest(p, q)) / 2;
  return Math.max(0, 1 - d / SPREAD);
}
