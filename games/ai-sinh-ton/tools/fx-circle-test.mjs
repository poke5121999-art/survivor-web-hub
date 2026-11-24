// Flat circles in the fight's effects (Addendum 8.5 and 9.4: no hand-drawn flat disc or ring; effects carry a material).
// Part A, census: a boss wave of three chapters plays with auto skills and ultimates, and every effect type is fired
// once more by hand (warnings of a normal enemy, a boss and a hero, a zone, a shock burst, a heal, a buff, a blast, the
// edge wash, the whirlwind); after every step the scene is walked and each visible mesh drawn with a RingGeometry or a
// CircleGeometry, or a flat glow quad as wide as it is long (a glowing disc on the floor), is a hit.
// Part B, edges: a circle warning (normal, boss, hero) and a zone are drawn alone over the bare floor, with and without;
// the outline is read along 180 rays from the centre and an ellipse (a circle in perspective) is fitted to it; the RMS
// distance of the outline from that ellipse, in % of the mean radius, tells a ruled circle from a torn, noisy edge.
// Part C, readability at xiaomi: colour distance (CIE76 dE) of the boss warning and the normal warning to the floor under
// them, and of the boss warning to the normal one (a boss warning must not read as a normal skill area).
// Part D, sheets: each effect type at its peak frame, cropped, per chapter, saved as .chk/fxc/<tag>/<type>-c<ch>.png;
// with --tag=after and a before set present, .chk/fxc/sheet-<type>.png puts before | after side by side per chapter.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/fx-circle-test.mjs [--tag=after] [--ch=1,3,5] [--no-census]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, launch, open as openPage, checker, ROOT } from './pw.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const TAG = arg('tag', 'after');
const CH = arg('ch', '1,3,5').split(',').map(Number);
const OUT = path.join(ROOT, '.chk', 'fxc'); const DIR = path.join(OUT, TAG); fs.mkdirSync(DIR, { recursive: true });
if (!process['env'].GL) process['env'].GL = 'swiftshader';
const { check, done } = checker();
const T0 = Date.now();
const py = (src, ...a) => execFileSync('python3', ['-c', src, ...a], { maxBuffer: 1 << 26 }).toString();

// ---------- page side ----------
// effect types: fire(x, z, hero uid) sends the same events the sim sends; frames to reach the look worth judging; crop
// half-size in metres around the point
const TYPES = [
  ['warn-enemy', 40, 4], ['warn-boss', 40, 5], ['warn-boss-line', 40, 7], ['warn-cone', 40, 6], ['warn-hero', 40, 4],
  ['shock', 8, 5], ['heal', 14, 3], ['buff', 12, 3], ['zone', 40, 5], ['blast', 7, 5], ['whirl', 24, 5], ['wash', 10, 0], ['markers', 1, 4],
];
const FIRE = ([type, x, z]) => {
  const G = window.__G; const A = G.actors; const fx = A.fx; const B = G.B; const h = B.heroes.find((u) => u.alive) || B.heroes[0];
  const E = (e) => fx.onEvent(e);
  switch (type) {
    case 'warn-enemy': E({ e: 'tele', shape: 'circle', x, z, r: 2.6, t: 1.2, team: 1, key: 'bloat' }); break;
    case 'warn-boss': E({ e: 'tele', shape: 'circle', x, z, r: 4.5, t: 1.2, team: 1, key: 'boss_slam' }); break;
    case 'warn-boss-line': E({ e: 'tele', shape: 'line', x: x - 6, z, x2: x + 6, z2: z, w: 2.4, t: 1.2, team: 1, key: 'boulder_roll' }); break;
    case 'warn-cone': E({ e: 'tele', shape: 'cone', x: x - 4, z, r: 9, ang: 0, deg: 50, t: 1.2, team: 1, key: 'void_breath' }); break;
    case 'warn-hero': E({ e: 'tele', shape: 'circle', x, z, r: 2.6, t: 1.2, team: 0, key: 'airstrike' }); break;
    case 'shock': E({ e: 'fx', key: 'boss_slam', part: 'burst', x, z, r: 4.5, team: 1, by: B.boss || 0 }); break;
    case 'heal': E({ e: 'fx', key: 'heal', part: 'heal', x: h.x, z: h.z, r: 2, team: 0, by: h.uid }); break;
    case 'buff': E({ e: 'buff', uid: h.uid, key: 'overdrive' }); break;
    case 'zone': E({ e: 'zone', id: 9e6 + Math.floor(x * 10), key: 'acid_sea', x, z, r: 4.5, dur: 6, team: 1 }); break;
    case 'blast': G.fx.explosion(new G.host.THREE.Vector3(x, 0.2, z), 0.7); break;
    case 'whirl': E({ e: 'fx', key: 'gust', part: 'burst', x, z, r: 3.5, team: 0, by: h.uid }); break;
    case 'wash': A.marks.wash(0xff3020, 0.6, 0.24); break;
    default: break;
  }
  return [h.x, h.z];
};
// Round-soft census (Addendum 11.3: effects speak the block language). An effect mesh is a hit when its geometry is a
// round solid (sphere, circle, ring, torus, rounded polyhedron, lathe, capsule), a cylinder or cone of more than 8 sides,
// or when any texture it draws with is a soft round dot: alpha graded in 3+ levels whose outline is the same distance from
// its centre in every direction (spread of 32 radii under 7% of their mean), as a square or a star never is. A dark round
// blot (mean colour under 20%) is a drop shadow, not a dot of light, and is left to the shadows' owner.
// where: 'battle' walks the scene minus the world (island, glow, abyss, mode props), the horde and every unit's own model;
// 'evolve' walks the evolution stage's own pieces (pedestal, rune, cocoon, shards, bits, mound).
const ROUNDS = (where) => {
  const G = window.__G; const hits = {};
  const ROUND = new Set(['SphereGeometry', 'CircleGeometry', 'RingGeometry', 'TorusGeometry', 'IcosahedronGeometry', 'DodecahedronGeometry', 'LatheGeometry', 'CapsuleGeometry']);
  const memo = window.__roundTex || (window.__roundTex = new Map());
  const roundSoft = (t) => {
    if (memo.has(t.uuid + t.version)) return memo.get(t.uuid + t.version);
    let res = false; const img = t.image;
    if (img && img.width && img.height) {
      const w = img.width, h = img.height; let d;
      if (img.data) d = img.data; else { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); c.drawImage(img, 0, 0); d = c.getImageData(0, 0, w, h).data; }
      const A = new Float32Array(w * h); let mx = 0; let opaque = true;
      for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] < 250) opaque = false;
      for (let i = 0; i < w * h; i++) { A[i] = opaque ? (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765 : d[i * 4 + 3] / 255; mx = Math.max(mx, A[i]); }
      if (mx > 0) {
        let n = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0; const lv = new Set();
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = A[y * w + x]; if (a > 0.12 * mx) { n++; sx += x; sy += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); lv.add(Math.round(a / mx * 15)); } }
        const asp = (x1 - x0 + 1) / (y1 - y0 + 1);
        if (n >= 9 && n < 0.97 * w * h && asp > 0.8 && asp < 1.25 && lv.size >= 3) {
          const cx = sx / n, cy = sy / n; const rs = [];
          for (let k = 0; k < 32; k++) { const an = k * Math.PI / 16; let r = 0; for (let s = 0; s < w + h; s += 0.25) { const x = Math.floor(cx + 0.5 + Math.cos(an) * s), y = Math.floor(cy + 0.5 + Math.sin(an) * s); if (x < 0 || y < 0 || x >= w || y >= h || A[y * w + x] <= 0.12 * mx) break; r = s; } rs.push(r); }
          const m = rs.reduce((a, b) => a + b, 0) / rs.length; const sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) * (b - m), 0) / rs.length);
          // a dark round blot is a unit's drop shadow (actors.js, out of the effects' scope), not a dot of light
          let lum = 0; for (let i = 0; i < w * h; i++) if (A[i] > 0.12 * mx) lum += (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765;
          res = m > 1 && sd / m < 0.07 && (opaque || lum / n > 0.2);
        }
      }
    }
    memo.set(t.uuid + t.version, res); return res;
  };
  const texOf = (m) => { const out = []; if (m.map) out.push(m.map); if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) out.push(u.value); return out; };
  const skip = new Set(); let roots;
  if (where === 'evolve') roots = (G.evolveUi && G.evolveUi.fx) || [];
  else {
    const A = G.actors; const B = G.B; const H = G.host;
    if (B) for (const u of B.units) { const n = A.nodeOf(u.uid); if (n) skip.add(n); }
    roots = H.scene.children.filter((o) => !['island', 'glow', 'abyss', 'mode'].includes(o.name) && !/^horde\./.test(o.name));
  }
  const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  const walk = (o) => {
    if (skip.has(o)) return;
    if ((o.isMesh || o.isSprite) && shown(o) && !(o.isInstancedMesh && o.count === 0) && !(o.geometry && o.geometry.isInstancedBufferGeometry && o.geometry.instanceCount === 0)) {
      const g = o.geometry; const mats = [].concat(o.material || []);
      if (!mats.every((m) => m.opacity === 0 && !m.isShaderMaterial)) {
        const kinds = [];
        if (g && ROUND.has(g.type)) kinds.push(g.type);
        const seg = g && g.parameters && g.parameters.radialSegments;
        if (g && (g.type === 'CylinderGeometry' || g.type === 'ConeGeometry') && seg > 8) kinds.push(`${g.type} ${seg} sides`);
        for (const m of mats) for (const t of texOf(m)) if (roundSoft(t)) kinds.push(`soft round texture ${t.name || t.uuid.slice(0, 6)}`);
        for (const k of kinds) { const c = mats[0] && mats[0].color ? mats[0].color.getHexString() : '-'; const l = `${k} col#${c}${o.name ? ' ' + o.name : ''}`; hits[l] = (hits[l] || 0) + (o.isInstancedMesh ? o.count : 1); }
      }
    }
    for (const c of o.children) walk(c);
  };
  for (const r of roots) walk(r);
  return hits;
};
// one large still particle of each kind the effects draw with (spark streak, shard, ember, wisp; the blast board's glow
// and smoke puffs; the local flash), alone over an empty frame, at fixed points on a 4 x 2 grid
const PARTS = [['spark-streak', 0], ['spark-shard', 1], ['spark-ember', 2], ['spark-wisp', 3], ['puff-glow'], ['puff-smoke'], ['flash']];
const SOLO = ([on, PARTS]) => {
  const G = window.__G; const H = G.host; const T = H.THREE; const fx = G.actors.fx;
  if (on === null) return null;
  fx.beats.sparks.clear(); G.fx.clear(); G.actors.marks.clear();
  const cam = H.camera; const at = (i) => { const v = new T.Vector3((i % 4 - 1.5) * 0.42, (i < 4 ? 0.25 : -0.25), 0.5).unproject(cam); const d = v.sub(cam.position).normalize(); return cam.position.clone().addScaledVector(d, 9); };
  const pts = [];
  PARTS.forEach(([name, kind], i) => {
    const p = at(i); pts.push([name, (i % 4 - 1.5) * 0.21 + 0.5, (i < 4 ? -0.125 : 0.125) + 0.5]);
    if (name.startsWith('spark')) fx.beats.sparks.emit({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, life: kind === 3 ? 0.15 : 0.4, w: 1.1, len: 1.1, stretch: 0, color: 0xffd080, a: 1, grav: 0, drag: 0, kind });
    else if (name === 'puff-glow') G.fx.puff(p, { glow: true, s0: 1.2, s1: 1.2, life: 50, c0: 0xffd080, c1: 0xffd080, a0: 1, spin: 0, rot: 0 });
    else if (name === 'puff-smoke') G.fx.puff(p, { s0: 1.2, s1: 1.2, life: 0.3, c0: 0xffd080, c1: 0xffd080, a0: 1, spin: 0, rot: 0 });
    else G.actors.marks.flash(p.x, p.y, p.z, 1.2, 0xffd080, 1);
  });
  return pts;
};
const SOLO_HIDE = (on) => {
  const H = window.__G.host; const puff = window.BZ.tex('puff');
  const keep = (o) => o.name === 'fx-sparks' || o.name === 'fx-flash' || !!(o.material && o.material.uniforms && o.material.uniforms.map && (o.material.uniforms.map.value === puff || o.material.uniforms.map.value.name === 'fx_glowpuff'));
  H.scene.children.forEach((o) => { if (o.isLight || o.isCamera) return; if (on) { if (o.__vis2 === undefined) o.__vis2 = o.visible; o.visible = keep(o); } else if (o.__vis2 !== undefined) { o.visible = o.__vis2; delete o.__vis2; } });
};
// show only the floor and the named effect layer ('tele' warnings, 'zone' zones) or nothing of it
const ALONE = ([what, on]) => {
  const H = window.__G.host; const isTele = (o) => o.name === 'teleB' || (o.material && o.material.isShaderMaterial && /#define uK/.test(o.material.fragmentShader || ''));
  const isZone = (o) => o.material && o.material.isShaderMaterial && o.material.uniforms && o.material.uniforms.uStyle && o.parent === H.scene && o.geometry.type === 'PlaneGeometry';
  const pick = what === 'tele' ? isTele : isZone;
  H.scene.children.forEach((o) => { if (o.isLight || o.isCamera) return; if (o.__vis === undefined) o.__vis = o.visible; o.visible = on === null ? o.__vis : (pick(o) ? on : ['island', 'abyss', 'floor', 'fog'].includes(o.name)); });
  // the HUD over the frame would cover parts of the outline in both frames alike: hidden while the layer is measured
  for (const el of document.querySelectorAll('#frame *')) { if (el.tagName === 'CANVAS' || el.querySelector('canvas')) continue; if (on === null) { if (el.__v !== undefined) { el.style.visibility = el.__v; delete el.__v; } } else if (el.__v === undefined) { el.__v = el.style.visibility; el.style.visibility = 'hidden'; } }
  if (on !== null) H.render(); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};
const PROJ = ([x, z, half]) => { const H = window.__G.host; const v = new H.THREE.Vector3(x, 0, z).project(H.camera); const w = new H.THREE.Vector3(x + half, 0, z).project(H.camera); return [(v.x + 1) / 2, (1 - v.y) / 2, Math.abs(w.x - v.x) / 2]; };

// ---------- python ----------
// outline bumpiness of the masked shape around (cx, cy) (frame fractions), and colour distances
const EDGE = `
import sys, json, math
from PIL import Image
a = Image.open(sys.argv[1]).convert('RGB'); b = Image.open(sys.argv[2]).convert('RGB'); W, H = a.size
cx = float(sys.argv[3]) * W; cy = float(sys.argv[4]) * H; R = float(sys.argv[5]) * W; pa = a.load(); pb = b.load()
def m(x, y):
    if x < 0 or y < 0 or x >= W or y >= H: return False
    p = pa[x, y]; q = pb[x, y]; return abs(p[0] - q[0]) + abs(p[1] - q[1]) + abs(p[2] - q[2]) > 24
# a ray that leaves the frame while still on the shape is clipped (-1): the frame edge is not the outline
rs = []
for i in range(180):
    t = i * math.pi / 90; r = 0.0; s = 0.0; last = False; clip = False
    while s < R * 1.5:
        x = int(cx + math.cos(t) * s); y = int(cy + math.sin(t) * s)
        if x < 0 or y < 0 or x >= W or y >= H:
            clip = last; break
        last = m(x, y)
        if last: r = s
        s += 0.5
    rs.append(-1.0 if clip else r)
clipped = sum(1 for r in rs if r < 0)
# a circle seen in perspective is an ellipse: fit a conic A x2 + B xy + C y2 + D x + E y = 1 to the outline points (least
# squares, 5x5 normal equations); what it does not explain, RMS of the geometric distance over the mean radius in %, is the
# outline's own tearing
ok = [r for r in rs if r > 0]; mr = sum(ok) / max(1, len(ok)); pts = [(math.cos(i * math.pi / 90) * rs[i] / mr, math.sin(i * math.pi / 90) * rs[i] / mr) for i in range(180) if rs[i] > 0]
rows = [[x * x, x * y, y * y, x, y] for x, y in pts]
M = [[sum(r[i] * r[j] for r in rows) for j in range(5)] + [sum(r[i] for r in rows)] for i in range(5)]
for c in range(5):
    piv = max(range(c, 5), key=lambda k: abs(M[k][c])); M[c], M[piv] = M[piv], M[c]
    for k in range(5):
        if k != c and M[c][c] != 0:
            f = M[k][c] / M[c][c]; M[k] = [M[k][j] - f * M[c][j] for j in range(6)]
A, B, C, D, E = [M[i][5] / M[i][i] if M[i][i] else 0 for i in range(5)]
ds = []
for x, y in pts:
    F = A * x * x + B * x * y + C * y * y + D * x + E * y - 1; gx = 2 * A * x + B * y + D; gy = B * x + 2 * C * y + E
    ds.append(F / max(1e-9, math.hypot(gx, gy)))
res = (sum(d * d for d in ds) / max(1, len(ds))) ** 0.5
print(json.dumps({'bump': 100 * res, 'clipped': clipped, 'r': mr, 'empty': sum(1 for r in rs if r == 0)}))`;
const LAB = `
def lab(c):
    v = []
    for q in c:
        q /= 255.0; v.append(q / 12.92 if q <= 0.04045 else ((q + 0.055) / 1.055) ** 2.4)
    x = (0.4124 * v[0] + 0.3576 * v[1] + 0.1805 * v[2]) / 0.95047; y = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; z = (0.0193 * v[0] + 0.1192 * v[1] + 0.9505 * v[2]) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z); return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))`;
// mean dE on vs off over the masked pixels, and the mean Lab colour of those pixels in the 'on' frame
const DE = `
import sys, json
from PIL import Image
${LAB}
a = Image.open(sys.argv[1]).convert('RGB'); b = Image.open(sys.argv[2]).convert('RGB'); pa = a.load(); pb = b.load(); s = 0; n = 0; L = [0, 0, 0]
for y in range(0, a.height, 2):
    for x in range(0, a.width, 2):
        p = pa[x, y]; q = pb[x, y]
        if abs(p[0] - q[0]) + abs(p[1] - q[1]) + abs(p[2] - q[2]) > 24:
            u, v = lab(p), lab(q); s += sum((u[k] - v[k]) ** 2 for k in range(3)) ** 0.5; n += 1; L = [L[k] + u[k] for k in range(3)]
print(json.dumps({'de': s / max(1, n), 'n': n, 'lab': [c / max(1, n) for c in L]}))`;
// each particle's window (frame fractions, a quarter of the width wide): masked pixels on vs off, then the spread of 32
// radii from the mask centroid over their mean, the count of brightness levels (16 steps) and how much of its box it fills
const PARTSHAPE = `
import sys, json, math
from PIL import Image
a = Image.open(sys.argv[1]).convert('RGB'); b = Image.open(sys.argv[2]).convert('RGB'); W, H = a.size; pa = a.load(); pb = b.load(); out = {}
for name, fx, fy in json.loads(sys.argv[3]):
    x0 = int((fx - 0.105) * W); x1 = int((fx + 0.105) * W); y0 = int((fy - 0.12) * H); y1 = int((fy + 0.12) * H)
    pts = []; lv = set(); mx = 1
    for y in range(max(0, y0), min(H, y1)):
        for x in range(max(0, x0), min(W, x1)):
            p = pa[x, y]; q = pb[x, y]; d = abs(p[0] - q[0]) + abs(p[1] - q[1]) + abs(p[2] - q[2])
            if d > 30: pts.append((x, y, d)); mx = max(mx, d)
    if not pts: out[name] = {'n': 0, 'cv': 1, 'levels': 0, 'fill': 0}; continue
    S = set((x, y) for x, y, _ in pts); cx = sum(x for x, _, _ in pts) / len(pts); cy = sum(y for _, y, _ in pts) / len(pts)
    for _, _, d in pts: lv.add(round(d / mx * 15))
    rs = []
    for k in range(32):
        an = k * math.pi / 16; r = 0; s = 0
        while s < W:
            if (int(cx + 0.5 + math.cos(an) * s), int(cy + 0.5 + math.sin(an) * s)) not in S: break
            r = s; s += 0.5
        rs.append(r)
    m = sum(rs) / 32; sd = (sum((r - m) ** 2 for r in rs) / 32) ** 0.5
    bx = max(x for x, _, _ in pts) - min(x for x, _, _ in pts) + 1; by = max(y for _, y, _ in pts) - min(y for _, y, _ in pts) + 1
    out[name] = {'n': len(pts), 'cv': sd / max(1e-6, m), 'levels': len(lv), 'fill': len(pts) / (bx * by)}
print(json.dumps(out))`;
const CROP = `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); W, H = im.size; cx = float(sys.argv[3]) * W; cy = float(sys.argv[4]) * H; hw = float(sys.argv[5]) * W
if hw <= 0: box = (0, 0, W, H)
else:
    hh = hw * 0.62; box = (int(max(0, cx - hw)), int(max(0, cy - hh)), int(min(W, cx + hw)), int(min(H, cy + hh)))
im.crop(box).resize((420, int(420 * (box[3] - box[1]) / max(1, box[2] - box[0])))).save(sys.argv[2])`;
const SHEET = `
import sys, json
from PIL import Image, ImageDraw
rows = json.loads(sys.argv[2]); W = 420; cells = []
for row in rows:
    r = []
    for label, f in row:
        im = Image.open(f).convert('RGB'); im = im.resize((W, int(im.height * W / im.width))); d = ImageDraw.Draw(im)
        d.rectangle([0, 0, W, 16], fill=(0, 0, 0)); d.text((5, 3), label, fill=(255, 255, 255)); r.append(im)
    cells.append(r)
H = max(im.height for r in cells for im in r); C = max(len(r) for r in cells)
s = Image.new('RGB', (C * W + (C + 1) * 6, len(cells) * H + (len(cells) + 1) * 6), (18, 18, 22))
for j, r in enumerate(cells):
    for i, im in enumerate(r): s.paste(im, (6 + i * (W + 6), 6 + j * (H + 6)))
s.save(sys.argv[1])`;

const srv = await serve();
const br = await launch();
const res = { tag: TAG, census: {}, edge: {}, de: {} };
try {
  for (const ch of CH) {
    const stage = (ch - 1) * 5 + 2;
    const { ctx, page, problems } = await openPage(br, srv.base, 'xiaomi', `autostart=1&stage=${stage}&wave=5&autoult=1&autopick=1&noaudio=1&seed=${stage}&q=low`, { freeze: true });
    await page.evaluate(() => { const H = window.__G.host; if (!H.__r) { H.__r = H.render; H.render = () => H.__r(null); } });
    await page.evaluate(() => window.__sim(6)); await page.evaluate(() => window.__step(6));
    const theme = await page.evaluate(() => window.__G.host.world.theme.name);
    const k = `chapter ${ch} (${theme})`;
    // ---- A: census over a played boss wave and every type fired by hand ----
    if (!argv.includes('--no-census')) {
      const hits = {};
      const add = (h) => { for (const [l, n] of Object.entries(h)) hits[l] = Math.max(hits[l] || 0, n); };
      for (let i = 0; i < 24; i++) { await page.evaluate(() => { window.__sim(0.5); window.__step(3); }); add(await page.evaluate(ROUNDS, 'battle')); }
      const c0 = await page.evaluate(() => { const B = window.__G.B; const h = B.heroes.find((u) => u.alive) || B.heroes[0]; return [h.x + 2.5, h.z]; });
      for (const [type, frames] of TYPES) {
        await page.evaluate(FIRE, [type, c0[0], c0[1]]);
        for (let f = 0; f < frames; f += 3) { await page.evaluate(() => window.__step(3)); add(await page.evaluate(ROUNDS, 'battle')); }
      }
      res.census[ch] = hits;
      const list = Object.entries(hits);
      check(list.length === 0, `${k}: effect meshes round or soft-round (sphere, circle, ring, cylinder > 8 sides, soft round texture) during a boss wave and every fired type: ${list.length}${list.length ? ' — ' + list.map(([l, n]) => `${l} x${n}`).join('; ') : ''}`);
      await page.evaluate(() => { window.__G.actors.marks.clear(); window.__step(2); });
    }
    // ---- E: one still particle of each kind alone, its outline read along 32 rays (chapter 1 only: the shapes are themed by nothing) ----
    if (ch === CH[0]) {
      const pts = await page.evaluate(SOLO, [true, PARTS]); await page.evaluate(SOLO_HIDE, true); await page.evaluate(() => window.__step(2));
      const fOn = path.join(DIR, 'parts-on.png'); await page.locator('#frame').screenshot({ path: fOn, scale: 'css' });
      await page.evaluate(() => { const G = window.__G; G.actors.fx.beats.sparks.clear(); G.fx.clear(); G.actors.marks.clear(); window.__step(2); });
      const fOff = path.join(DIR, 'parts-off.png'); await page.locator('#frame').screenshot({ path: fOff, scale: 'css' });
      await page.evaluate(SOLO_HIDE, false); await page.evaluate(SOLO, [null, PARTS]);
      const pr = JSON.parse(py(PARTSHAPE, fOn, fOff, JSON.stringify(pts))); res.parts = pr;
      for (const [name, m] of Object.entries(pr)) {
        console.log(`particle ${name}: ${m.n} px, outline spread ${m.cv.toFixed(3)} of its mean radius, ${m.levels} brightness levels, fill of its box ${m.fill.toFixed(2)}`);
        check(m.n > 30, `particle ${name} drawn alone (${m.n} px)`);
        check(!(m.cv < 0.07 && m.levels >= 3), `particle ${name} is not a soft round dot (outline spread ${m.cv.toFixed(3)} >= 0.07 or < 3 levels)`);
      }
    }
    // ---- B, C, D: each type alone at a fixed point near the heroes, frozen ----
    await page.evaluate(() => { window.__G.paused = true; });
    // the arena centre: a large warning there stays on open floor, clear of the frame edge and of the props round the rim
    const P = [0, 0];
    for (const [type, frames, half] of TYPES) {
      await page.evaluate(() => { window.__G.actors.marks.clear(); window.__G.fx.clear(); window.__step(1); });
      const hc = await page.evaluate(FIRE, [type, P[0], P[1]]);
      await page.evaluate(([n]) => window.__step(n), [frames]);
      const at = ['heal', 'buff', 'markers'].includes(type) ? hc : P;
      const pr = await page.evaluate(PROJ, [at[0], at[1], half || 1]);
      const full = path.join(DIR, `full-${type}-c${ch}.png`); await page.locator('#frame').screenshot({ path: full, scale: 'css' });
      py(CROP, full, path.join(DIR, `${type}-c${ch}.png`), String(pr[0]), String(pr[1]), String(half ? pr[2] : 0)); fs.unlinkSync(full);
      const layer = type.startsWith('warn') ? 'tele' : type === 'zone' ? 'zone' : '';
      if (layer) {
        const fOn = path.join(DIR, `on-${type}-c${ch}.png`); const fOff = path.join(DIR, `off-${type}-c${ch}.png`);
        await page.evaluate(ALONE, [layer, true]); await page.locator('#frame').screenshot({ path: fOn, scale: 'css' });
        await page.evaluate(ALONE, [layer, false]); await page.locator('#frame').screenshot({ path: fOff, scale: 'css' });
        await page.evaluate(ALONE, [layer, null]);
        const de = JSON.parse(py(DE, fOn, fOff)); res.de[`${type}-c${ch}`] = de;
        if (['warn-enemy', 'warn-boss', 'warn-hero', 'zone'].includes(type)) {
          const r = type === 'warn-boss' ? 4.5 : type === 'zone' ? 4.5 : 2.6; const pe = await page.evaluate(PROJ, [P[0], P[1], r]);
          const ed = JSON.parse(py(EDGE, fOn, fOff, String(pe[0]), String(pe[1]), String(pe[2]))); res.edge[`${type}-c${ch}`] = ed;
          console.log(`${k} ${type}: outline radius ${ed.r.toFixed(0)} px, tearing ${ed.bump.toFixed(2)}%, rays without it ${ed.empty}, clipped by the frame ${ed.clipped}; dE to floor ${de.de.toFixed(1)} over ${de.n} px`);
          check(ed.bump >= 1.5 && ed.empty <= 6 && ed.clipped <= 90, `${k} ${type}: outline is not a ruled circle (tearing ${ed.bump.toFixed(2)}% >= 1.5%, rays missing it ${ed.empty} <= 6)`);
        } else console.log(`${k} ${type}: dE to floor ${de.de.toFixed(1)} over ${de.n} px`);
      }
    }
    const b = res.de[`warn-boss-c${ch}`]; const n = res.de[`warn-enemy-c${ch}`]; const hh = res.de[`warn-hero-c${ch}`];
    if (b && n) {
      const bn = Math.hypot(...b.lab.map((v, i) => v - n.lab[i]));
      check(b.de >= 20, `${k}: boss warning to floor dE ${b.de.toFixed(1)} (>= 20)`);
      check(n.de >= 15, `${k}: normal enemy warning to floor dE ${n.de.toFixed(1)} (>= 15)`);
      check(bn >= 10, `${k}: boss warning colour apart from a normal warning dE ${bn.toFixed(1)} (>= 10)`);
      if (hh) check(hh.de < n.de, `${k}: hero skill area quieter than an enemy warning (dE ${hh.de.toFixed(1)} < ${n.de.toFixed(1)})`);
    }
    const bad = problems.filter((x) => !/Failed to load resource|\/js\/ui\//.test(x));
    check(bad.length === 0, `${k}: no console problems ${bad.slice(0, 2).join(' | ')}`);
    await ctx.close();
  }
  // ---- F: the evolution stage's own pieces through every beat of one evolution ----
  {
    const { ctx, page } = await openPage(br, srv.base, 'xiaomi', 'noaudio=1&q=low', { freeze: true });
    await page.evaluate(() => { const A = window.__G.meta.acc; A.heroes.tegiap = Object.assign(A.heroes.tegiap || {}, { level: 30, shards: 999, form: 1 }); A.gold = 1e7; for (const k of Object.keys(A.evo.stone)) A.evo.stone[k] = 999; A.evo.core = 99; A.cleared = Math.max(A.cleared, 20); });
    await page.evaluate(async () => { const m = await import(document.querySelector('script[src*="js/main.js"]').src.replace('main.js', 'ui/evolve.js')); window.__G.goto('heroes', { id: 'tegiap' }); m.openEvolve('tegiap', {}); });
    await page.evaluate(() => window.__step(40));
    const hits = {}; const add = (h) => { for (const [l, n] of Object.entries(h)) hits[l] = Math.max(hits[l] || 0, n); };
    add(await page.evaluate(ROUNDS, 'evolve'));
    const go = (await page.evaluate(() => window.__ui.targets())).find((q) => q.id === 'evolve-go');
    await page.touchscreen.tap(go.x + go.w / 2, go.y + go.h / 2); await page.evaluate(() => window.__step(2));
    const phases = new Set();
    for (let i = 0; i < 300; i++) { await page.evaluate(() => window.__step(3)); phases.add(await page.evaluate(() => window.__G.evolveUi.phase)); add(await page.evaluate(ROUNDS, 'evolve')); if (phases.has('done')) break; }
    const pieces = await page.evaluate(() => (window.__G.evolveUi.fx || []).length);
    res.census.evolve = hits; const list = Object.entries(hits);
    check(pieces >= 5, `evolution stage lists its own pieces for the census (${pieces})`);
    check(['cocoon', 'crack', 'burst', 'pose', 'done'].every((p) => phases.has(p)), `evolution walked cocoon, crack, burst, pose, done (${[...phases].join(' ')})`);
    check(list.length === 0, `evolution stage: round or soft-round pieces through every beat: ${list.length}${list.length ? ' — ' + list.map(([l, n]) => `${l} x${n}`).join('; ') : ''}`);
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, `${TAG}.json`), JSON.stringify(res, null, 1));
  const before = path.join(OUT, 'before');
  if (TAG !== 'before' && fs.existsSync(before)) {
    for (const [type] of TYPES) {
      const rows = CH.filter((ch) => fs.existsSync(path.join(before, `${type}-c${ch}.png`))).map((ch) => [[`before ${type} c${ch}`, path.join(before, `${type}-c${ch}.png`)], [`after ${type} c${ch}`, path.join(DIR, `${type}-c${ch}.png`)]]);
      if (rows.length) py(SHEET, path.join(OUT, `sheet-${type}.png`), JSON.stringify(rows));
    }
    console.log('sheets: ' + path.join(OUT, 'sheet-*.png'));
  }
} finally {
  await br.close(); srv.close();
}
console.log(`elapsed ${Math.round((Date.now() - T0) / 1000)} s`);
done();
