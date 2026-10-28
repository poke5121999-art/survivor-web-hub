// Lucky Drop (Pachinko): drop the stickman, swing once on the top hook, bounce through pegs, land in one of 5 buckets.
// Self-contained mode, loaded by modes.js `launch` only when the mode opens; data/pachinko.json + art/pachinko*.webp
// load with it (tools/build_pachinko.py). Rules and asm addresses: docs/PACHINKO.md.
// The board is the camera view, like PachinkoLevelSpawner.Initialize (ViewportToWorldPoint (0,0) and (1,1)).
import { Player, PHYS, ST } from './physics.js';
import { Renderer } from './render.js';

const PV = '?v=20261028d';
const DEG = Math.PI / 180;
const SQRT3_2 = 0.8660254;
const REF_ASPECT = 750 / 1335; // BGGlow reference resolution; [ĐỀ XUẤT] boards never get wider than it (desktop)

let P = null; // data/pachinko.json
let art = null; // {img, bg, menu}

function loadAll(app) {
  if (P) return Promise.resolve();
  const img = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(u)); i.src = u; });
  return Promise.all([
    fetch('./data/pachinko.json' + PV).then((r) => { if (!r.ok) throw new Error('pachinko.json ' + r.status); return r.json(); }),
    img('./art/pachinko.webp' + PV), img('./art/pachinko-bg.webp' + PV),
    img('./art/menu.webp' + app.V).catch(() => null), // already cached by the home screen; coin icon only
  ]).then(([d, a, bg, menu]) => { P = d; art = { img: a, bg, menu }; });
}

// ---- random: UnityEngine.Random, or a seeded one for tests (?pseed=) --------------------------------------------------
function rng(seed) {
  if (seed == null) return Math.random;
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rangeF = (r, a, b) => a + (b - a) * r(); // Random.Range(float, float)
const rangeI = (r, a, b) => a + Math.floor((b - a) * r()); // Random.Range(int, int), max exclusive
function insideUnitCircle(r) { const a = r() * 2 * Math.PI, d = Math.sqrt(r()); return [Math.cos(a) * d, Math.sin(a) * d]; }
// System.Math.Round: half to even
function roundEven(v) { const f = Math.floor(v), d = v - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); }
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// ---- board generators: PachinkoLevelSpawner helpers ----------------------------------------------------------------------
// GetHexGridInRect [asm 0x1216410]: rows of x step 2dx, odd rows shifted by dx, cut at p1.x - 0.95 dx.
function* hexGridInRect(p0, p1, spacing, stretch) {
  const H = p1[1] - p0[1], W = p1[0] - p0[0];
  const rows = Math.trunc(H / spacing / SQRT3_2), cols = Math.trunc(W / (spacing * 0.5));
  let dx, dy, ox = 0, oy = 0;
  if (stretch) { dy = H / rows; dx = W / cols; } else {
    dx = spacing * 0.5; dy = spacing * SQRT3_2;
    ox = (W - dx * cols) * 0.5; oy = (H - dy * rows) * 0.5;
  }
  let shift = 0;
  for (let y = p0[1] + dy * 0.5 + oy; y < p1[1]; y += dy) {
    for (let x = p0[0] + dx + shift + ox; x <= p1[0] - 0.95 * dx; x += 2 * dx) yield [x, y];
    shift = shift === 0 ? dx : 0;
  }
}
// GetMaxPointsOnLine [asm 0x12167f8]
function* maxPointsOnLine(p0, p1, spacing, stretch) {
  const dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), n = Math.trunc(dist / spacing);
  if (stretch) spacing = dist / n;
  const off = stretch ? 0 : (dist - spacing * n) * 0.5;
  for (let i = 0; i < n; i++) {
    const t = clamp01((off + (i + 0.5) * spacing) / dist);
    yield [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
  }
}
// GetHexGrid [asm 0x121611c]: hexagon of `side` points per edge, rows j = 1-side .. side-1
function* hexGrid(p, side, d) {
  for (let j = 1 - side; j <= side - 1; j++) {
    const n = 2 * side - 2 - Math.abs(j);
    for (let i = -n * 0.5; i <= n * 0.5; i++) yield [p[0] + i * d, p[1] + d * j * SQRT3_2];
  }
}
// CircleOfPegs [asm 0x1215148] / CircleOfRectPegs [asm 0x121544c]: pegs at the middle of equal arcs, the left-over arc
// (arcGap) centred on startAngle + 90. Rect pegs count on radius - 0.25 and face the centre (SignedAngle(up, centre - p)).
function arcPositions(rad, count0Rad, arc, start, gap) {
  const circ = count0Rad * 2 * Math.PI;
  const count = Math.trunc((circ - gap) / arc);
  let step = arc, left = gap;
  if (gap === 0) step = circ / count; else left = circ - count * arc;
  const a0 = (left / count0Rad) * 0.5 + (start + 90) * DEG, da = step / count0Rad;
  const out = [];
  for (let i = 0; i < count; i++) out.push(a0 + da * (i + 0.5));
  return out;
}

class Board {
  constructor(W, H, rnd) {
    this.W = W; this.H = H; this.rnd = rnd;
    this.L = -W / 2; this.R = W / 2; this.B = -H / 2; this.T = H / 2;
    this.pegs = [];
  }
  pt([xb, dx, yb, dy]) { return [this[xb] + dx, this[yb] + dy]; }
  peg(kind, x, y, rot = 0, sx = 1) { this.pegs.push({ kind, x, y, rot, sx }); }
  // FillRectangleWithPegs [asm 0x1214d6c]: stretched hex grid of spacing TargetDistance, jitter randomness * TargetRandomness
  fill(p0, p1, randomness) {
    const s = P.settings, j = s.TargetRandomness * s.TargetDistance * randomness;
    for (const [x, y] of hexGridInRect(p0, p1, s.TargetDistance, true)) {
      const [ux, uy] = j ? insideUnitCircle(this.rnd) : [0, 0];
      this.peg('dot', x + ux * j, y + uy * j);
    }
  }
  circle(c, rad, arc, start, gap) {
    for (const a of arcPositions(rad, rad, arc, start, gap)) this.peg('dot', c[0] + Math.cos(a) * rad, c[1] + Math.sin(a) * rad);
  }
  cup(c, rad, arc, start, gap) {
    for (const a of arcPositions(rad, rad - 0.25, arc, start, gap)) this.peg('rect', c[0] + Math.cos(a) * rad, c[1] + Math.sin(a) * rad, a + Math.PI / 2);
  }
  // SpawnLine [asm 0x1215b60]: rect pegs of 0.75 along the segment, Math.Round(len / 0.75) of them, stretched to fit
  line(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), n = roundEven(len / 0.75);
    if (n < 1) return;
    const sx = len / (n * 0.75), rot = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) { const t = clamp01((i + 0.5) / n); this.peg('rect', a[0] + dx * t, a[1] + dy * t, rot, sx); }
  }
  body(p, ops) {
    for (const [op, ...a] of ops) {
      if (op === 'cup') this.cup(p, ...a);
      else if (op === 'flower') for (const q of hexGrid(p, a[0], a[1])) this.peg('dot', q[0], q[1]);
    }
  }
  build(type) {
    const Rr = Math.min(this.W / 2 - 0.5, this.H / 2 - 3.75), C = [0, -0.5];
    for (const [op, ...a] of P.boards[type].ops) {
      if (op === 'fill') this.fill(this.pt(a[0]), this.pt(a[1]), a[2]);
      else if (op === 'hexRect') for (const p of hexGridInRect(this.pt(a[0]), this.pt(a[1]), a[2], a[3])) this.body(p, a[4]);
      else if (op === 'line') for (const p of maxPointsOnLine(this.pt(a[0]), this.pt(a[1]), a[2], a[3])) this.body(p, a[4]);
      else if (op === 'concentric') {
        const n = Math.max(a[0], Math.trunc(Rr));
        for (let i = 1; i <= n; i++) this.circle(C, (Rr / n) * i, a[1], 0, 0);
        this.peg('dot', C[0], C[1]);
      } else if (op === 'bigCircle') {
        const s = rangeF(this.rnd, -60, 60), c = [C[0], C[1] + 1];
        this.cup(c, Rr - 0.25, 0.7, s, Rr * 0.5);
        const s2 = rangeF(this.rnd, -45, 45);
        this.cup(c, Rr - 1.25, 0.7, s + s2, (Rr * 0.5 * (Rr - 1)) / Rr);
      } else if (op === 'slopes') {
        const p0 = this.pt(a[0]), p1 = this.pt(a[1]), w = (p1[0] - p0[0]) * a[2];
        this.line([p0[0] + 0.125, p0[1]], [p0[0] + w + 0.125, p1[1]]);
        this.line([p1[0] - w - 0.125, p0[1]], [p1[0] - 0.125, p1[1]]);
      } else if (op === 'random') return this.build(rangeI(this.rnd, 0, a[0]));
    }
    return type;
  }
}

// ---- world: board + colliders ---------------------------------------------------------------------------------------
// Shapes: {t: 'c', x, y, r} circle, {t: 'p', pts} convex polygon (world, any winding), {t: 's', ax, ay, bx, by, r} capsule.
function boxPts(cx, cy, w, h, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot), out = [];
  for (const [u, v] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) out.push(cx + u * c - v * s, cy + u * s + v * c);
  return out;
}

function makeWorld(W, H, type, rnd, beforeSpawn) {
  const board = new Board(W, H, rnd);
  const built = board.build(type);
  const { L, R, B, T } = board, n = P.settings.NumberOfBuckets, bw = W / n;
  const shapes = [], pegs = [];
  for (const g of board.pegs) {
    const d = P.pegs[g.kind];
    const peg = { ...g, coins: 1, hits: 0, flash: -1, dying: -1, delay: 0, gone: false, bonus: false, extra: false };
    if (g.kind === 'dot') peg.shape = { t: 'c', x: g.x, y: g.y, r: d.circle };
    else if (g.kind === 'rect') peg.shape = { t: 'p', pts: boxPts(g.x, g.y, d.box[0] * g.sx, d.box[1], g.rot) };
    else {
      const c = Math.cos(g.rot), s = Math.sin(g.rot), pts = [];
      for (let i = 0; i < d.poly.length; i += 2) pts.push(g.x + d.poly[i] * c - d.poly[i + 1] * s, g.y + d.poly[i] * s + d.poly[i + 1] * c);
      peg.shape = { t: 'p', pts };
    }
    Object.assign(peg.shape, { bounce: d.bounce, peg });
    pegs.push(peg);
    shapes.push(peg.shape);
  }
  // bucket separators, corners, floor [asm 0x1212788..0x1212b8c, 0x1212bec..0x1212d8c, 0x1212f60..0x1213060]
  const pt = P.parts, sep = [];
  const addBoxes = (bx, by, list, flip = 1) => {
    for (const [ox, oy, w, h, e] of list) shapes.push({ t: 'p', pts: boxPts(bx + ox * flip, by + oy, w, h), bounce: e });
  };
  for (let i = 1; i < n; i++) {
    const x = L + bw * i;
    sep.push(x);
    addBoxes(x, B, pt.bucketWall.boxes);
    const [, cy, cr, ce] = pt.bucketWall.circle;
    shapes.push({ t: 'c', x, y: B + cy, r: cr, bounce: ce });
  }
  addBoxes(L, B, pt.bucketCorner.boxes);
  addBoxes(R, B, pt.bucketCorner.boxes, -1);
  const [, fy, , fh] = pt.bucketFloor.boxes[0];
  shapes.push({ t: 'p', pts: boxPts(0, B + fy, W, fh), bounce: 0 });
  // side walls: PachinkoWall.Init(0.16, H - 1.75) centred at y + 0.875, 0.08 inside the edges [asm 0x1212db8..0x1212f5c]
  const wallH = H - 1.75, wallY = (B + T) / 2 + 0.875;
  const walls = [L + 0.08, R - 0.08].map((x) => ({ x, y: wallY, w: 0.16, h: wallH, bump: -1 }));
  for (const w of walls) shapes.push({ t: 'p', pts: boxPts(w.x, w.y, w.w, w.h), bounce: pt.wall.bounce, wall: w });
  beforeSpawn?.(pegs);
  // spawn, bumper, target [asm 0x1213144..0x1213220]: one side of the centre picked at random, jittered by Range(-1, 1)
  const side = rnd() < 0.5 ? -2 : 2, jx = rangeF(rnd, -1, 1);
  const sx = -side + jx;
  const spawn = { x: sx, y: T - 0.5 };
  const [bl, bh] = pt.bumper.size;
  const bumper = { x: sx, y: T - 2.5, w: bl, h: bh, scale: 1, anim: -1, shrink: 0, gone: false };
  bumper.shape = { t: 's', ax: sx - (bl - bh) / 2, ay: bumper.y, bx: sx + (bl - bh) / 2, by: bumper.y, r: bh / 2, bounce: pt.bumper.bounce, bumper };
  shapes.push(bumper.shape);
  const target = { x: jx, y: T - 1.5, scale: 1, shrink: -1, gone: false };
  // buckets: glow sprite |i - n/2| % 3, reward peg at (centre, bottom + 1) [asm 0x12129ec..0x1212b84]
  const buckets = [];
  for (let i = 0; i < n; i++) buckets.push({ i, x: L + bw * (i + 0.5), w: bw, glow: P.parts.glows[Math.abs(i - Math.trunc(n / 2)) % 3] });
  return { type: built, asked: type, W, H, L, R, B, T, bw, shapes, pegs, sep, walls, spawn, bumper, target, buckets,
    targets: [target], finishX: Infinity, bumpers: [], caps: [], polys: [] };
}

// ---- physics: PlayerPachinko = PlayerDefault body + pachinko colliders -----------------------------------------------
function closestOnSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [ax + dx * t, ay + dy * t];
}
function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    if ((pts[i + 1] > py) !== (pts[j + 1] > py) && px < ((pts[j] - pts[i]) * (py - pts[i + 1])) / (pts[j + 1] - pts[i + 1]) + pts[i]) inside = !inside;
  }
  return inside;
}

class PachinkoPlayer extends Player {
  constructor(spawn) {
    super(spawn);
    this.contacts = [];
  }

  scale() {
    const t = Math.min(1, this.age / P.parts.player.growth);
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin(((t - 0.075) * (2 * Math.PI)) / 0.3) + 1;
  }

  accel(world) {
    const [ax, ay] = super.accel(world);
    return [ax, ay + PHYS.gravity * (P.settings.GravityMultiplier - 1)];
  }

  // Circle (radius 0.1125) against every shape; restitution max(material, 0) above the 1 m/s bounce threshold.
  collide(world) {
    const R = PHYS.radius;
    let out = null;
    for (const s of world.shapes) {
      if (s.off) continue;
      let qx, qy, rad = 0, inside = false;
      if (s.t === 'c') { qx = s.x; qy = s.y; rad = s.r; if (Math.abs(this.x - qx) > rad + R || Math.abs(this.y - qy) > rad + R) continue; }
      else if (s.t === 's') {
        if (this.x < Math.min(s.ax, s.bx) - s.r - R || this.x > Math.max(s.ax, s.bx) + s.r + R || Math.abs(this.y - s.ay) > s.r + R + 0.5) continue;
        [qx, qy] = closestOnSeg(this.x, this.y, s.ax, s.ay, s.bx, s.by); rad = s.r;
      } else {
        const p = s.pts;
        let best = Infinity;
        for (let i = 0; i < p.length; i += 2) {
          const j = (i + 2) % p.length;
          const [cx, cy] = closestOnSeg(this.x, this.y, p[i], p[i + 1], p[j], p[j + 1]);
          const d = (this.x - cx) ** 2 + (this.y - cy) ** 2;
          if (d < best) { best = d; qx = cx; qy = cy; }
        }
        if (best > (R + 0.6) ** 2) continue;
        inside = inPoly(this.x, this.y, p);
      }
      let dx = this.x - qx, dy = this.y - qy, d = Math.hypot(dx, dy);
      if (!inside && (d >= R + rad || d === 0)) continue;
      if (inside) { dx = -dx; dy = -dy; }
      const nx = dx / (d || 1), ny = dy / (d || 1);
      this.x = qx + nx * (R + rad); this.y = qy + ny * (R + rad);
      const vn = this.vx * nx + this.vy * ny;
      let enter = false;
      if (vn < 0) {
        const e = -vn > PHYS.bounceThreshold ? s.bounce : 0;
        this.vx -= (1 + e) * vn * nx; this.vy -= (1 + e) * vn * ny;
        enter = true;
      }
      this.contacts.push({ s, nx, ny, vn, enter });
      out = { n: [nx, ny], bumper: -1, enter };
    }
    return out;
  }
}

// ---- the mode ---------------------------------------------------------------------------------------------------------
const CSS = `
#pachinko { background: #141a5c; }
#pachinko canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
#pachinko .px { position: absolute; top: max(12px, env(safe-area-inset-top)); left: 12px; z-index: 2; }
#pachinko .res { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0, 20, 60, .72); z-index: 3; }
#pachinko .res.on { display: flex; }
#pachinko .card { background: #fff; color: #0d1b2a; border: 4px solid #0d1b2a; border-radius: 22px; padding: 18px; width: min(86vw, 380px);
  display: flex; flex-direction: column; gap: 10px; text-align: center; font: 700 17px system-ui, sans-serif; }
#pachinko .card h2 { margin: 0; font-size: 26px; }
#pachinko .card .row2 { display: flex; justify-content: space-between; gap: 8px; }
#pachinko .card .tot { font-size: 22px; color: #d97800; }
#pachinko .card .it { background: #ffd23f; border-radius: 12px; padding: 8px; }
`;

let live = null; // the running session

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

export async function open(app) {
  await Promise.all([loadAll(app), app.loadCards?.().catch(() => {})]);
  if (live) live.stop();
  if (!document.getElementById('pachinko-css')) { const st = el('style'); st.id = 'pachinko-css'; st.textContent = CSS; document.head.appendChild(st); }
  let root = document.getElementById('pachinko');
  if (!root) { root = el('div', 'ui overlay'); root.id = 'pachinko'; document.body.appendChild(root); }
  root.innerHTML = '';
  const cv = el('canvas');
  const exit = el('button', 'btn px', '✕');
  exit.title = 'Thoát';
  const res = el('div', 'res');
  root.append(cv, exit, res);
  for (const o of ['modes', 'start', 'levels']) if (document.getElementById(o)) app.overlay(o, false);
  app.overlay('pachinko', true);
  const q = new URLSearchParams(location.search);
  // test hooks: ?ptype= forces a board type (not saved), ?pseed= seeds Random, ?pbonus= marks N pegs as x10 like the card
  const num = (k) => (q.has(k) ? +q.get(k) : null);
  live = new Session(app, root, cv, res, num('ptype'), num('pseed'), num('pbonus') || 0);
  exit.onclick = () => { app.play('popup_out'); live.close(); };
  return live;
}

class Session {
  constructor(app, root, cv, res, forcedType, seed, bonus) {
    this.app = app; this.root = root; this.cv = cv; this.res = res;
    this.R = new Renderer(cv, app.atlas.img, app.atlas.rects, app.atlas.fontImg, app.atlas.font);
    this.R.theme = app.meta.themeFor('mode.pachinko', 0);
    this.rnd = rng(seed);
    this.state = pachinkoState(app, this.rnd);
    this.rewards = orderedRewards(this.state);
    this.R.resize();
    const aspect = Math.min(REF_ASPECT, cv.width / cv.height || REF_ASPECT);
    const H = P.settings.CameraSize * 2, W = H * aspect;
    this.cards = app.cards;
    this.world = makeWorld(W, H, forcedType ?? this.state.level, this.rnd, (pegs) => setupPegs(pegs, this.rnd, bonus, this.cards, app.save));
    this.extras = []; // card.pachinko_extra_stickman clones: {pl, touching, bucket}
    this.mainBucket = -1;
    this.player = new PachinkoPlayer(this.world.spawn);
    this.game = { phase: 'spawn', t: 0, hold: false, clock: 0, coins: 0, fx: [], trail: [], grabbed: false, bucket: -1, payout: null };
    this.touching = new Set();
    this.cam = { x: 0, y: 0, zoom: P.settings.CameraSize };
    this.acc = 0; this.last = 0; this.raf = 0;
    this.bind();
    this.raf = requestAnimationFrame((t) => this.frame(t));
    window.__pachinko = this;
  }

  bind() {
    const set = (v) => { if (this.game.phase === 'play' || !v) this.game.hold = v; };
    this.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); this.cv.setPointerCapture?.(e.pointerId); set(true); });
    this.cv.addEventListener('pointerup', () => set(false));
    this.cv.addEventListener('pointercancel', () => set(false));
    this.keys = (e) => {
      if (e.code !== 'Space' && e.code !== 'ArrowUp' && e.code !== 'KeyW') return;
      e.preventDefault();
      if (e.type === 'keydown' && !e.repeat) set(true); else if (e.type === 'keyup') set(false);
    };
    window.addEventListener('keydown', this.keys);
    window.addEventListener('keyup', this.keys);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('keydown', this.keys);
    window.removeEventListener('keyup', this.keys);
    if (live === this) live = null;
  }

  close() {
    this.stop();
    this.app.overlay('pachinko', false);
    this.app.overlay('start', true);
    this.app.hud();
  }

  frame(now) {
    if (!this.raf) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    this.R.resize();
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    this.update(dt);
    this.draw(now / 1000);
  }

  update(dt) {
    const g = this.game, w = this.world, STEP = PHYS.fixedDt;
    g.t += dt;
    if (g.phase === 'spawn' && g.t >= P.parts.player.timeToSpawn) { g.phase = 'play'; g.t = 0; }
    if (g.phase === 'play') {
      this.acc += dt;
      while (this.acc >= STEP && g.phase === 'play') {
        this.acc -= STEP;
        g.clock += STEP;
        this.tick(STEP);
      }
      this.sampleTrail();
    }
    for (const p of w.pegs) {
      if (p.gone) continue;
      if (p.flash >= 0) { p.flash += dt; if (p.flash >= MINI_BOUNCE) p.flash = -1; }
      // Disappear(delay): wait, then ShrinkToNothing(0.15) OutSine and SetActive(false) [asm 0x121b724, 0x121bc50]
      if (p.dying >= 0) { p.dying += dt; if (p.dying >= p.delay + PEG_SHRINK) p.gone = p.shape.off = true; }
    }
    const b = w.bumper;
    if (b.anim >= 0) { b.anim += dt; if (b.anim > 0.1) b.anim = -1; }
    // PachinkoBumper.OnGrab: first grab -> ShrinkToNothing(0.2) [asm 0x1218918, 0x1219098]
    if (g.grabbed && !b.gone) { b.shrink += dt; b.scale = outSine(Math.max(0, 1 - b.shrink / 0.2)); if (b.shrink >= 0.2) b.gone = b.shape.off = true; }
    // PachinkoTarget.UnHook: ShrinkToNothing(0.2) then SetActive(false) [asm 0x11a1a10, 0x11a1b48]
    const tg = w.target;
    if (tg.shrink >= 0 && !tg.gone) { tg.shrink += dt; tg.scale = outSine(Math.max(0, 1 - tg.shrink / 0.2)); if (tg.shrink >= 0.2) tg.gone = true; }
    for (const wl of w.walls) if (wl.bump >= 0) { wl.bump += dt; if (wl.bump > 0.15) wl.bump = -1; }
    for (const f of g.fx) f.t += dt;
    g.fx = g.fx.filter((f) => f.t < f.life);
    if (g.phase === 'end' && g.t > END_DELAY && !this.res.classList.contains('on')) this.showResult();
  }

  // one FixedUpdate: player step, then the contacts' gameplay (pegs, bumper, walls) and the bucket triggers
  tick(STEP) {
    if (this.mainBucket < 0) this.tickMain(STEP);
    for (const ex of this.extras) if (ex.bucket < 0) this.tickExtra(ex, STEP);
    // CollectReward removes each stickman as it lands; FinishLevel once none is left [asm 0x12a768c, 0x12a77b4..0x12a78ec]
    if (this.mainBucket >= 0 && this.extras.every((e) => e.bucket >= 0)) this.endRun();
  }

  // a clone (InitAsExtraStickman [asm 0x1217cec]): canGrab false, alpha 0.5; pegs, bumper and walls as the main one
  tickExtra(ex, STEP) {
    const w = this.world, pl = ex.pl;
    pl.contacts.length = 0;
    pl.step(STEP, w, false);
    ex.touching = this.contacts(pl, ex.touching, STEP);
    const i = this.bucketOf(pl);
    if (i >= 0) ex.bucket = i;
  }

  contacts(pl, touching, STEP) {
    const now = new Set();
    for (const c of pl.contacts) {
      const s = c.s;
      if (now.has(s)) continue;
      now.add(s);
      const enter = !touching.has(s);
      if (s.peg && enter) this.hitPeg(s.peg, c, pl);
      else if (s.bumper && enter) s.bumper.anim = 0;
      else if (s.wall) this.hitWall(s.wall, c, enter, STEP, pl);
    }
    return now;
  }

  // PachinkoRewardPeg trigger (BoxCollider2D offset (0, -1.2), size 2 x 3 under (bucket centre, bottom + 1))
  bucketOf(pl) {
    const w = this.world, [, oy, , th] = P.parts.rewardTrigger;
    const top = w.B + 1 + oy + th / 2;
    if (pl.y - PHYS.radius >= top) return -1;
    return Math.min(w.buckets.length - 1, Math.max(0, Math.floor((pl.x - w.L) / w.bw)));
  }

  tickMain(STEP) {
    const g = this.game, w = this.world, pl = this.player;
    const wasHooked = pl.hooked;
    pl.contacts.length = 0;
    pl.step(STEP, w, g.hold);
    if (pl.hooked >= 0 && wasHooked < 0) this.onGrab();
    if (pl.hooked < 0 && wasHooked >= 0) this.onRelease();
    // OnCollisionEnter2D fires when a contact starts, OnCollisionStay2D every step while it lasts
    this.touching = this.contacts(pl, this.touching, STEP);
    void w;
    const i = this.bucketOf(pl);
    if (i >= 0) this.enterBucket(i);
  }

  onGrab() { this.game.grabbed = true; }
  // the only target goes inactive at once and shrinks away: one swing per drop
  onRelease() {
    const w = this.world;
    w.targets = [];
    w.target.shrink = 0;
  }

  // PachinkoPeg.OnCollisionEnter2D [asm 0x121b128]: every new contact pays, not only the first
  hitPeg(peg, c, pl = this.player) {
    const g = this.game;
    g.coins += peg.coins; // CollectCoins(_coinCount: 1, 10 on a bonus peg) [asm 0x12a7550]
    g.fx.push({ kind: 'coin', x: peg.x, y: peg.y, n: peg.coins, t: 0, life: 0.8 });
    g.fx.push({ kind: 'ring', x: this.player.x - c.nx * PHYS.radius, y: this.player.y - c.ny * PHYS.radius, t: 0, life: 0.3 });
    // AddForce(-contact.normal * _minBumpForce, Impulse) on the stickman: away from the peg, / mass 2 [asm 0x121b2a4..0x121b32c]
    const k = P.pegs[peg.kind].minBump / PHYS.mass;
    pl.vx += c.nx * k; pl.vy += c.ny * k;
    // the extra-stickman peg: SpawnExtraStickman(peg) and Object.Destroy at once [asm 0x121b254..0x121b398]
    if (peg.extra) { this.spawnExtra(peg); peg.gone = peg.shape.off = true; peg.hits++; return; }
    // while not destroying: card.pachinko_bumper_resistance rolls value() < effect / 100 (when owned); a non-immediate
    // peg that resists keeps standing, else Disappear(destroyImmediate ? 0 : DisappearingTimer) [asm 0x121b39c..0x121b4d0]
    if (peg.dying < 0) {
      const resists = !!this.cards && this.cards.resists(this.app.save, this.rnd) && !peg.bonus;
      if (!resists && P.settings.Disappearing) { peg.dying = 0; peg.delay = peg.bonus ? 0 : P.settings.DisappearingTimer; }
    }
    peg.flash = 0; // MiniBounce(0.1): lit sprite and a 20 % pop, every hit [asm 0x121b4ec, 0x121b868]
    peg.hits++;
  }

  // PachinkoWall: on enter an impulse sign * clamp(25 - |vx|, 0, 2.5) along x [asm 0x1219df0], while touching
  // AddForce(sign * 20, Force) each step [asm 0x121a1d8]; sign -1 when the contact is left of the wall.
  hitWall(wl, c, enter, dt, pl = this.player) {
    const sign = pl.x < wl.x ? -1 : 1;
    if (enter) {
      pl.vx += (sign * Math.min(2.5, Math.max(0, 25 - Math.abs(pl.vx)))) / PHYS.mass;
      wl.bump = 0; wl.bumpY = pl.y; wl.bumpSign = sign;
    }
    pl.vx += ((sign * 20) / PHYS.mass) * dt;
  }

  // SpawnExtraStickmanAsync [asm 0x12a87b8..0x12a8920]: at the peg, velocity 10 (cos a, sin a), a = Range(45, 135) degrees
  spawnExtra(peg) {
    const a = (rangeI(this.rnd, 45, 135) * Math.PI) / 180;
    const pl = new PachinkoPlayer({ x: peg.x, y: peg.y });
    pl.vx = 10 * Math.cos(a); pl.vy = 10 * Math.sin(a);
    pl.extra = true;
    this.extras.push({ pl, touching: new Set(), bucket: -1 });
  }

  enterBucket(i) {
    const g = this.game;
    if (g.phase !== 'play' || this.mainBucket >= 0) return;
    this.mainBucket = i;
    g.bucket = i;
    g.hold = false;
    this.player.ungrab();
  }

  endRun() {
    const g = this.game;
    if (g.phase !== 'play') return;
    g.phase = 'end'; g.t = 0;
    g.payout = this.pay(this.mainBucket, this.extras.map((e) => e.bucket));
  }

  // NbCollectedCoins + the bucket's reward, granted and saved at once
  // CollectReward adds a coin bucket to NbCollectedCoins [asm 0x12a75a0]; WinRewards grants the item, then the coins,
  // no multiplier, no XP [asm 0x116f6a0]. Winning the main prize counts a main win and rebuilds the state.
  // Every stickman's bucket counts (WinRewards(list, coins) [asm 0x12a7ff8]). The coins grant has source "pachinko"
  // (card.pachinko_daily_coins_boost: the day's first 100 coins [asm 0x116f88c..0x116f8c0]).
  pay(i, more = []) {
    const { app } = this, { meta, save } = app, got = [];
    const r = this.rewards[i], all = [i, ...more].map((b) => this.rewards[b]);
    const coins = this.game.coins;
    let bucketCoins = 0;
    for (const x of all) if (x.id !== 'currency.skin_coins') meta.grantReward(save, [x.id, x.qty], got); else bucketCoins += x.qty;
    const total = coins + bucketCoins;
    if (total) meta.grantReward(save, ['currency.skin_coins', total], got, 'pachinko');
    if ([i, ...more].includes(Math.floor(P.settings.NumberOfBuckets * 0.5))) {
      save.inv ||= {};
      save.inv[MAIN_WINS] = (save.inv[MAIN_WINS] || 0) + 1;
      slotOf(save).state = null;
    }
    app.writeSave();
    if (got.some((x) => x.item)) app.applyEquip();
    return { pegs: coins, reward: r, rewards: all, bucketCoins, got };
  }

  showResult() {
    const { pegs, got, bucketCoins } = this.game.payout;
    const item = got.find((x) => x.item)?.item;
    const paid = got.filter((x) => x.coins).reduce((t, x) => t + x.coins, 0);
    const kind = { skins: 'Skin', ropes: 'Dây', trails: 'Vệt' };
    this.res.innerHTML = `<div class="card"><h2>Lucky Drop</h2>
      <div class="row2"><span>Xu từ chốt</span><b>${pegs}</b></div>
      <div class="row2"><span>Thưởng ô ${this.game.bucket + 1}</span><b>${bucketCoins ? bucketCoins + ' xu' : 'vật phẩm'}</b></div>
      ${item ? `<div class="it">Mở khoá ${kind[item.kind] || ''}: <b>${item.title}</b></div>` : ''}
      ${this.extras.length ? `<div class="row2"><span>Người que phụ</span><b>${this.extras.length}</b></div>` : ''}
      <div class="row2 tot"><span>Tổng xu</span><b>+${paid || pegs + bucketCoins}</b></div>
      <button class="big" id="pachinkoHome">Về trang chính</button></div>`;
    this.res.classList.add('on');
    this.app.play('popup_in');
    this.res.querySelector('#pachinkoHome').onclick = () => { this.app.play('button'); this.close(); };
  }

  sampleTrail() {
    const tr = this.app.look.trail;
    if (!tr) return;
    const pts = this.game.trail, l = pts[pts.length - 1], pl = this.player;
    if (!l || Math.hypot(pl.x - l.x, pl.y - l.y) > 0.02) pts.push({ x: pl.x, y: pl.y, t: this.game.clock });
    while (pts.length && this.game.clock - pts[0].t > tr.time) pts.shift();
  }

  // ---- drawing ----
  fitCamera() {
    const { cv } = this, a = cv.width / cv.height;
    this.cam.zoom = Math.max(P.settings.CameraSize, this.world.W / 2 / a);
  }

  spr(name, m, opts) { const r = P.atlas.rects[name]; if (r) this.R.spriteFrom(art.img, name, r, m, opts); }

  draw(t) {
    const { R, world: w, game: g } = this;
    this.fitCamera();
    R.begin(this.cam);
    const { ctx, cv } = R;
    // BGGlow: BG2 stretched to cover the board at the 750 x 1335 reference ratio [asm 0x1212318..0x121237c].
    // [ĐỀ XUẤT] outside a board narrower than the screen (desktop) stays BG2's edge colour.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#181f78';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const [x0, y0] = this.screen(w.L, w.T), [x1, y1] = this.screen(w.R, w.B), d = R.dpr;
    const k = Math.max((x1 - x0) / 750, (y1 - y0) / 1335);
    ctx.drawImage(art.bg, ((x0 + x1) / 2 - 375 * k) * d, ((y0 + y1) / 2 - 667.5 * k) * d, 750 * k * d, 1335 * k * d);
    // bucket glows, floor
    for (const b of w.buckets) this.spr(b.glow, [b.w * 10, 0, 0, 1, b.x, w.B]);
    this.spr('BucketFloor', [w.W * 10, 0, 0, 1, 0, w.B]);
    this.drawWalls();
    this.drawBumper(t);
    this.drawTarget(t);
    for (const p of w.pegs) this.drawPeg(p);
    for (const x of w.sep) this.spr('BucketWall', [1, 0, 0, 1, x, w.B]);
    this.spr('BucketCorner', [1, 0, 0, 1, w.L, w.B]);
    this.spr('BucketCorner', [-1, 0, 0, 1, w.R, w.B]);
    this.drawPlayer(t);
    for (const x of w.sep) this.spr('BucketWallFront', [1, 0, 0, 1, x, w.B]);
    this.spr('BucketCornerFront', [1, 0, 0, 1, w.L, w.B]);
    this.spr('BucketCornerFront', [-1, 0, 0, 1, w.R, w.B]);
    this.spr('BucketFloorFront', [w.W * 10, 0, 0, 1, 0, w.B]);
    for (const f of g.fx) if (f.kind === 'ring') { const s = 0.4 + f.t * 2; this.spr('HitRing', [s, 0, 0, s, f.x, f.y], { alpha: 1 - f.t / f.life }); }
    this.drawLabels(t);
  }

  // screen CSS px of a world point
  screen(x, y) {
    const { R } = this, v = R.viewMatrix();
    return [(v[0] * x + v[4]) / R.dpr, (v[3] * y + v[5]) / R.dpr];
  }

  drawWalls() {
    const { ctx } = this.R;
    for (const wl of this.world.walls) {
      this.R.setWorld([1, 0, 0, 1, wl.x, wl.y]);
      const gr = ctx.createLinearGradient(0, wl.h / 2, 0, -wl.h / 2);
      gr.addColorStop(0, 'rgb(249,202,27)'); // FourColorGradient _TopColor
      gr.addColorStop(1, 'rgb(229,124,1)'); // _BottomColor
      ctx.globalAlpha = 1;
      ctx.fillStyle = gr;
      ctx.strokeStyle = 'rgb(179,81,35)'; // WallOutline _Color
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.roundRect(-wl.w / 2, -wl.h / 2, wl.w, wl.h, wl.w / 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  drawBumper() {
    const b = this.world.bumper;
    if (b.gone) return;
    // BumpMesh(0.1) on hit [asm 0x1218ad8]: [ĐỀ XUẤT] drawn as a squash of the whole mesh
    const sq = b.anim >= 0 ? 1 - 0.25 * Math.sin((b.anim / 0.1) * Math.PI) : 1;
    this.spr('Bumper', [b.scale, 0, 0, b.scale * sq, b.x, b.y]);
  }

  drawTarget(t) {
    const tg = this.world.target, pl = this.player;
    if (tg.gone) return;
    const s = 0.5 * tg.scale, sh = this.R.theme;
    const hooked = pl.hooked === 0;
    this.R.sprite('A_PlotColorisable', [s, 0, 0, s, tg.x, tg.y - 0.15], { shadow: true });
    this.R.sprite('A_PlotColorisable', [s, 0, 0, s, tg.x, tg.y], { tint: sh.targets });
    this.R.sprite(hooked ? 'A_PlotSelected' : 'A_PlotNeutral', [s, 0, 0, s, tg.x, tg.y]);
    this.spr('Hook', [s * 0.5, 0, 0, s * 0.5, tg.x, tg.y]);
    if (!hooked && this.game.phase === 'play' && pl.closest === 0) {
      const k = 0.6 * (1 + 0.05 * Math.sin(t * 12)) * tg.scale;
      this.R.sprite('A_PlotNearestFeedback', [k, 0, 0, k, tg.x, tg.y]);
    }
  }

  drawPeg(p) {
    if (p.gone) return;
    const d = P.pegs[p.kind];
    // MiniBounce: lit sprite for 0.1 s, scale 1 + 0.2 OutSine up and down; the lit sprite stays once the peg is dying
    const lit = p.flash >= 0 || p.dying >= 0;
    const name = lit ? d.sprites.lit : p.extra ? d.sprites.extra : p.bonus ? d.sprites.special : d.sprites.neutral;
    let s = d.visual;
    if (p.flash >= 0) { const k = p.flash / MINI_BOUNCE; s *= 1 + 0.2 * outSine(k < 0.5 ? 2 * k : 2 * (1 - k)); }
    if (p.dying > p.delay) s *= outSine(Math.max(0, 1 - (p.dying - p.delay) / PEG_SHRINK));
    const c = Math.cos(p.rot), sn = Math.sin(p.rot);
    this.spr(name, [c * s * p.sx, sn * s * p.sx, -sn * s, c * s, p.x, p.y]);
  }

  drawPlayer() {
    const { R, game: g, app } = this, look = app.look, pl = this.player, alpha = 1;
    if (g.trail.length > 1) R.trail(g.trail, g.clock, look.trail);
    if (pl.hooked >= 0) {
      const tg = this.world.target, a = pl.anchor();
      if (look.rope) R.rope(look.rope.img, look.rope.rect, tg.x, tg.y, a.x, a.y, look.rope.width, look.rope.period);
      else R.line(a.x, a.y, tg.x, tg.y, 0.045, '#0d1b2a');
    }
    if (g.phase === 'spawn') {
      const k = g.t / P.parts.player.timeToSpawn, s = 0.15 + k * 0.5;
      R.sprite('A_PlotNearestFeedback', [s, 0, 0, s, this.world.spawn.x, this.world.spawn.y], { alpha: 1 - k });
      return;
    }
    this.drawBody(pl, alpha);
    for (const ex of this.extras) this.drawBody(ex.pl, 0.5);
  }

  drawBody(pl, alpha) {
    const { R, app } = this, look = app.look;
    const sk = look.skin;
    let sheet = null, name;
    if (!sk) name = pl.frame();
    else {
      const f = sk.states[pl.state] || sk.states[ST.FALL];
      sheet = sk; name = f.length > 1 ? f[Math.floor((pl.time - pl.stateTime) * 15) % f.length] : f[0];
    }
    const s = 0.3 * pl.scale(), fx = pl.flipX ? -1 : 1;
    const c = Math.cos(pl.angle) * s, sn = Math.sin(pl.angle) * s;
    const m = [c * fx, sn * fx, -sn, c, pl.x, pl.y], sm = [m[0], m[1], m[2], m[3], m[4], m[5] - 0.1];
    if (!sheet) { R.sprite(name, sm, { shadow: true, alpha }); R.sprite(name, m, { alpha }); return; }
    const [img, r] = sheet.frames[name];
    if (!app.meta.byId.get(sheet.id).noShadow) R.spriteFrom(img, name, r, sm, { shadow: true, alpha });
    R.spriteFrom(img, name, r, m, { alpha });
  }

  drawLabels() {
    const { R, world: w, game: g } = this;
    const k = R.k / R.dpr; // CSS px per world unit
    // bucket rewards at the reward peg (bucket centre, bottom + 1)
    w.buckets.forEach((b, i) => {
      const r = this.rewards[i], [sx, sy] = this.screen(b.x, w.B + 1);
      const px = Math.min(22, b.w * k * 0.32);
      if (r.id === 'currency.skin_coins') {
        this.coinIcon(sx, sy - px * 0.9, px * 1.3);
        R.text(String(r.qty), sx, sy + px * 0.5, px);
      } else {
        const it = this.app.meta.byId.get(r.id);
        R.text(({ skins: 'SKIN', ropes: 'ROPE', trails: 'TRAIL' })[it?.kind] || 'ITEM', sx, sy - px * 0.5, px);
        R.text(it ? it.title : r.id, sx, sy + px * 0.6, Math.min(px * 0.7, (b.w * k * 0.9 * px * 0.7) / Math.max(1, R.measure(it ? it.title : r.id, px * 0.7))));
      }
    });
    // x10 label on bonus pegs (TextMeshPro "10" child)
    for (const p of w.pegs) if (p.bonus && !p.gone) { const [sx, sy] = this.screen(p.x, p.y); R.text('X10', sx, sy, Math.max(9, k * 0.28)); }
    for (const f of g.fx) if (f.kind === 'coin') {
      const [sx, sy] = this.screen(f.x, f.y + f.t * 1.2);
      R.text('+' + f.n, sx, sy, Math.max(12, k * 0.35), 0.5, 1 - f.t / f.life);
    }
    const W = this.cv.width / R.dpr;
    this.coinIcon(W / 2 - 40, 34, 30);
    R.text(String(g.coins), W / 2 - 20, 34, 30, 0);
  }

  coinIcon(x, y, px) {
    const rr = this.app.meta.d.menu.coin;
    if (!art.menu || !rr) return;
    const { ctx, dpr } = this.R, kk = (px * dpr) / Math.max(rr[2], rr[3]);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(art.menu, rr[0], rr[1], rr[2], rr[3], x * dpr - (rr[2] * kk) / 2, y * dpr - (rr[3] * kk) / 2, rr[2] * kk, rr[3] * kk);
  }
}

const MINI_BOUNCE = 0.1, PEG_SHRINK = 0.15; // PachinkoPeg MiniBounce(0.1), ShrinkToNothing(0.15)
const outSine = (t) => Math.sin((t * Math.PI) / 2);
const END_DELAY = 1.0; // [ĐỀ XUẤT] result panel after the stickman settles in the bucket

// ---- service: level type and rewards (PachinkoService) ----------------------------------------------------------------
// The state (board type + bucket rewards) is kept until the main prize is won (WinRewards -> ResetPachinkoState
// [asm 0x116fb4c..0x116fb54]), so the same board comes back after a coin bucket. Saved in save.modes['mode.pachinko'].
const MAIN_WINS = 'progression.pachinko_main_wins';

function slotOf(save) { save.modes ||= {}; return (save.modes['mode.pachinko'] ||= {}); }

function weighted(rnd, list, w) {
  const total = list.reduce((s, x) => s + w(x), 0);
  let v = rnd() * total;
  for (const x of list) { v -= w(x); if (v < 0) return x; }
  return list[list.length - 1];
}

function pachinkoState(app, rnd) {
  const { meta, save } = app, slot = slotOf(save);
  if (slot.state) return slot.state;
  // GetNextLevel [asm 0x116f190]: main wins 0..6 walk the 7 types in order, then Random.Range(0, 7). LOOP never comes.
  const wins = save.inv?.[MAIN_WINS] || 0;
  const level = wins < 7 ? wins : rangeI(rnd, 0, 7);
  // GenerateMainReward [asm 0x116ee44]: the FIRST option not owned yet, in list order (weights unused); none -> null
  const it = P.rewards.main.map(([id]) => meta.byId.get(id)).find((x) => x && !save.owned[x.kind].includes(x.name));
  const n = P.settings.NumberOfBuckets;
  // ResetPachinkoState [asm 0x116ebb4]: floor((main ? n - 1 : n) / 2) coin rewards = 2, weighted picks with
  // replacement, sorted ascending (GenerateSecondaryRewards [asm 0x116ef24]); no main -> the larger coin reward
  const count = Math.floor((it ? n - 1 : n) * 0.5), sec = [];
  for (let i = 0; i < count; i++) { const o = weighted(rnd, P.rewards.secondary, (x) => x[2]); sec.push({ id: o[0], qty: o[1] }); }
  sec.sort((a, b) => a.qty - b.qty);
  const main = it ? { id: it.id, qty: 1 } : sec[sec.length - 1];
  // ResetPachinkoState also rolls GetBonusGamesLimit (card.pachinko_lucky_drop_limit: System.Random NextDouble <
  // effect / 100 -> 1) into PachinkoState._bonusGamesLimit [asm 0x116ed48, 0x116f26c]. No code of 9.9.60 reads it.
  slot.state = { level, main, sec, bonusGames: app.cards ? app.cards.bonusGames(save) : 0 };
  app.writeSave();
  return slot.state;
}

// get_OrderedRewards [asm 0x116e078]: [sec0, sec1, MAIN, sec1, sec0], coins rising toward the centre
function orderedRewards(st) {
  const n = P.settings.NumberOfBuckets, mid = Math.floor(n * 0.5), out = [];
  for (let i = 0; i < n; i++) out.push(i < mid ? st.sec[i] : i === mid ? st.main : st.sec[2 * mid - i]);
  return out;
}

// PachinkoLevelSpawner.Initialize card rolls on the pegs sorted top first (Comparer: Math.Round(b.y - a.y)
// [asm 0x121ae30]): card.pachinko_extra_stickman (one value() roll, then one of the ~10 highest pegs) and
// card.pachinko_x10_multiplier (5 value() rolls, then k x Range(0, count - 1)) [asm 0x1212548..0x1212718], js/cards.js
// pachinkoRolls. Nothing is rolled for a card not owned. `bonus` (?pbonus=, tests) adds N x10 pegs the same way.
function setupPegs(pegs, rnd, bonus, cards, save) {
  const list = [...pegs].sort((a, b) => roundEven(b.y - a.y));
  if (cards) {
    const r = cards.pachinkoRolls(save, list, rnd, (a, b) => rangeI(rnd, a, b));
    // SetAsExtraStickman [asm 0x121b024]: extra sprite, destroy immediately, still 1 coin
    if (r.extra) r.extra.extra = true;
    for (const p of r.bonus) { p.bonus = true; p.coins = 10; }
  }
  for (let k = 0; k < bonus && list.length > 1; k++) {
    const p = list.splice(rangeI(rnd, 0, list.length - 1), 1)[0];
    p.bonus = true; p.coins = 10; // SetAsBonus: 10 coins, special sprite, x10 label, disappears without delay [asm 0x121b084]
  }
}
