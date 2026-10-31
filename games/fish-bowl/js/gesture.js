// Level 5 shape recognition: a port of the "Gesture Recognizer" asset the game ships (GestureRecognizer.Recognizer,
// Detail = 100), read from the arm64 code. Pipeline per line (Recognizer.NormalizeData): NormalizeClosedLines,
// NormalizeScale, NormalizeDistribution; then CalcScore -> Score.get_score. The pattern and the stroke go through the
// same pipeline. Patterns are the original GesturePattern lines (0..1 box, y up); all five have useLinesDirections = 0
// and useLinesOrder = 0, so a pattern is also tried reversed and (closed ones) from every start point.
export const PATTERNS = {
  Circle: { closed: true, pts: [[0.5, 1], [0.25, 0.9375], [0.0625, 0.75], [0, 0.5], [0.0625, 0.25], [0.25, 0.0625], [0.5, 0], [0.75, 0.0625], [0.9375, 0.25], [1, 0.5], [0.9375, 0.75], [0.75, 0.9375]] },
  heart: { closed: true, pts: [[0.4375, 0.0625], [0, 0.5], [0, 0.875], [0.125, 1], [0.375, 1], [0.5, 0.875], [0.625, 1], [0.875, 1], [1, 0.875], [1, 0.5], [0.5625, 0.0625]] },
  bolt: { closed: false, pts: [[0.6875, 1], [0.3125, 0.6875], [0.6875, 0.3125], [0.3125, 0]] },
  loop: { closed: false, pts: [[0.75, 1], [0.25, 0.5], [0.25, 0], [0.75, 0], [0.75, 0.5], [0.25, 1]] },
  Triangle: { closed: true, pts: [[0.875, 0.125], [0.5, 0.875], [0.125, 0.125]] },
};

const DETAIL = 100;
const DEG = 180 / Math.PI;
const wrap360 = d => d - 360 * Math.floor(d / 360);

// NormalizeClosedLines: a closed line gets one more point 99% of the way back to its start.
function closeLine(pts, closed) {
  if (!closed) return pts;
  const l = pts[pts.length - 1], f = pts[0];
  return [...pts, [l[0] + (f[0] - l[0]) * 0.99, l[1] + (f[1] - l[1]) * 0.99]];
}

// NormalizeScale: CalcRect is the square (side = longer bbox side, centred) and every point maps into 0..1 of it.
function scaleToUnit(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const s = Math.max(x1 - x0, y1 - y0);
  const rx = (x0 + x1) / 2 - s / 2, ry = (y0 + y1) / 2 - s / 2;
  const f = (v, o) => (s === 0 ? 0 : Math.min(1, Math.max(0, (v - o) / s)));
  return pts.map(([x, y]) => [f(x, rx), f(y, ry)]);
}

// NormalizeDistribution + FindByNormalized: DETAIL + 1 points at equal arc-length steps.
function distribute(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = c[c.length - 1];
  const out = [];
  for (let k = 0; k <= DETAIL; k++) {
    const t = k / DETAIL;
    let p = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = c[i] / total, b = c[i + 1] / total;
      if (a > t || b < t) continue;
      const u = a === b ? 0 : Math.min(1, Math.max(0, (t - a) / (b - a)));
      p = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
      break;
    }
    out.push(p || (t > 0.5 ? pts[pts.length - 1] : pts[0]).slice());
  }
  return out;
}

// CalcAngles: heading of the chord from the point 10 behind to the point 10 ahead, 0..360.
function angles(p) {
  return p.map((_, i) => {
    const a = p[Math.max(i - 10, 0)], b = p[Math.min(i + 10, p.length - 1)];
    const d = Math.atan2(b[1] - a[1], b[0] - a[0]) * DEG;
    return d < 0 ? d + 360 : d;
  });
}

// CalcCurvature: turn between the chord to +10 and the chord after it, -180..180; the 10 points at each end are 0.
function curvature(p) {
  const out = Array(10).fill(0);
  for (let i = 0; i + 20 < p.length; i++) {
    const a = p[i], b = p[i + 10], c = p[i + 20];
    const d = wrap360((Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])) * DEG);
    out.push(d > 180 ? d - 360 : d);
  }
  while (out.length < p.length) out.push(0);
  return out;
}

// CalcLinearListScore: summed distances over the query's points (the pattern list may be one point longer).
function linear(q, p) {
  const aq = angles(q), ap = angles(p), cq = curvature(q), cp = curvature(p);
  let pos = 0, curv = 0, ang = 0;
  for (let i = 0; i < q.length; i++) {
    pos += Math.hypot(q[i][0] - p[i][0], q[i][1] - p[i][1]) / Math.SQRT2;
    curv += Math.abs(cq[i] - cp[i]) / 360;
    let d = wrap360(ap[i] - aq[i]);
    if (d > 180) d -= 360;
    ang += Math.abs(d) / 360;
  }
  return { pos, curv, ang };
}

// Score.get_score: position counts 4x, curvature and angle 1x each, every term 1 - distance/50 clamped to 0..1.
export function combine(s) {
  const t = v => { const x = 1 - v / 50; return x >= 0 ? Math.min(x, 1) : 0; };
  return Math.min(1, Math.max(0, (4 * t(s.pos) + t(s.curv) + t(s.ang)) / 6));
}

// CalcCircularListScore: a closed pattern is tried from every start point, DETAIL + 2 points each (the last one only
// feeds the angle and curvature windows).
function circular(q, p) {
  let best = null, bs = -1;
  for (let r = 0; r < p.length; r++) {
    const rot = Array.from({ length: p.length + 1 }, (_, j) => p[(r + j) % p.length]);
    const s = linear(q, rot), v = combine(s);
    if (best === null || v > bs) { best = s; bs = v; }
  }
  return best;
}

const prepared = new Map();
function pattern(id) {
  if (!prepared.has(id)) {
    const p = PATTERNS[id];
    prepared.set(id, { closed: p.closed, pts: distribute(scaleToUnit(closeLine(p.pts, p.closed))) });
  }
  return prepared.get(id);
}

// stroke: [[x, y], ...] in any units with y up (one drawn line, never closed). Returns Score.get_score, 0..1. The
// game accepts it at RecognizedEvents.scoreToAccept (Circle 0.6, the others 0.8).
export function score(id, stroke) {
  if (stroke.length < 2) return 0;
  const q = distribute(scaleToUnit(stroke));
  if (q.some(([x, y]) => Number.isNaN(x) || Number.isNaN(y))) return 0; // every point the same: the original divides by 0
  const p = pattern(id);
  const run = pts => (p.closed ? circular(q, pts) : linear(q, pts));
  const a = combine(run(p.pts)), b = combine(run(p.pts.slice().reverse()));
  return Math.max(a, b);
}
