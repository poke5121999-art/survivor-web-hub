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
// visible effect meshes drawn as flat circles: RingGeometry / CircleGeometry, or a flat glow quad as wide as long
const CENSUS = () => {
  const G = window.__G; const H = G.host; const T = H.THREE; const glow = window.BZ.tex('glow'); const hits = {};
  const M = new T.Matrix4(); const sx = new T.Vector3(); const q = new T.Quaternion(); const p = new T.Vector3();
  const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  H.scene.traverse((o) => {
    if (!o.isMesh || o.isSprite || !shown(o)) return; if (o.isInstancedMesh && o.count === 0) return;
    const g = o.geometry; const mats = [].concat(o.material || []);
    if (mats.every((m) => m.opacity === 0 && !m.isShaderMaterial)) return;
    let kind = '';
    if (g.type === 'RingGeometry' || g.type === 'CircleGeometry') kind = g.type;
    else if (mats.some((m) => m.map && (m.map === glow || m.map.image === glow.image))) {
      if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox; const flatY = bb.max.y - bb.min.y < 1e-3;
      if (flatY) {
        const n = o.isInstancedMesh ? o.count : 1; let round = 0;
        for (let i = 0; i < n; i++) { if (o.isInstancedMesh) o.getMatrixAt(i, M); else M.copy(o.matrixWorld); M.decompose(p, q, sx); const r = Math.abs(sx.x) / Math.max(1e-6, Math.abs(sx.z)); if (r > 0.7 && r < 1.4 && sx.x > 1e-4) round++; }
        if (round) kind = 'flat glow disc';
      }
    }
    if (!kind) return;
    const c = mats[0] && mats[0].color ? mats[0].color.getHexString() : '-';
    const label = `${kind} r${(g.parameters && (g.parameters.innerRadius ?? g.parameters.radius)) ?? '-'} order${o.renderOrder} col#${c}${o.name ? ' ' + o.name : ''}`;
    hits[label] = (hits[label] || 0) + (o.isInstancedMesh ? o.count : 1);
  });
  return hits;
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
      for (let i = 0; i < 24; i++) { await page.evaluate(() => { window.__sim(0.5); window.__step(3); }); add(await page.evaluate(CENSUS)); }
      const c0 = await page.evaluate(() => { const B = window.__G.B; const h = B.heroes.find((u) => u.alive) || B.heroes[0]; return [h.x + 2.5, h.z]; });
      for (const [type, frames] of TYPES) {
        await page.evaluate(FIRE, [type, c0[0], c0[1]]);
        for (let f = 0; f < frames; f += 3) { await page.evaluate(() => window.__step(3)); add(await page.evaluate(CENSUS)); }
      }
      res.census[ch] = hits;
      const list = Object.entries(hits);
      check(list.length === 0, `${k}: effect meshes drawn as a flat circle / ring / glow disc during a boss wave and every fired type: ${list.length}${list.length ? ' — ' + list.map(([l, n]) => `${l} x${n}`).join('; ') : ''}`);
      await page.evaluate(() => { window.__G.actors.marks.clear(); window.__step(2); });
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
