// How the arena reads on screen (the "porthole" complaint): the floor must fill the frame, sink into soft fog with things in
// it, and have no hard-cut edge, flat colour area or hazard ring. Measured per phone size, chapter 1 to 3, clear and rain,
// on frames with the HUD hidden (the host's render is patched to skip the overlay). AFTER = this tree in landscape;
// BEFORE = the deployed portrait build (AST_BEFORE), measured at its own sizes and printed beside.
//  - rim margins: the spawn rim (1.04 of the ellipse) left/right points vs the frame width, top and bottom vs the HUD bar
//  - flat cells: share of 24 x 24 CSS px cells with luminance std < 1.5 over the whole frame
//  - edge step: along 16 radial lines on a frame without units, rain or HUD: largest luminance step between neighbouring CSS px
//    for r in 0.9..1.6 vs the largest step inside r < 0.8 of the same line (worst line printed)
//  - ring: no cell on the rim has the yellow-black hazard stripe signature
//  - coverage: every frame edge pixel's ground point lies inside the built floor square
//  - cost at q=low, stage 15: draw calls and triangles vs the deployed build
// Screenshots (before | after, wave 1 and a boss wave) and sheets go to .chk/landscape/.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/arena-look-test.mjs [--no-before] [--quick]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, launch, open as openPage, checker, ROOT, PHONES } from './pw.mjs';
import { ARENA } from '../js/sim/battle.js';

const OUT = path.join(ROOT, '.chk', 'landscape'); fs.mkdirSync(OUT, { recursive: true });
const BEFORE_BASE = (process['env'].AST_BEFORE || 'https://poke5121999-art.github.io/survivor-web-hub').replace(/\/$/, '');
const argv = process.argv.slice(2); const NO_BEFORE = argv.includes('--no-before'); const QUICK = argv.includes('--quick');
const { check, done } = checker();
PHONES.s22p = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };
PHONES.xiaomip = { viewport: { width: 461, height: 1002 }, deviceScaleFactor: 2.75, hasTouch: true, isMobile: true };
const OLD_ARENA = { x: 4.8, z: 9.4 }; const E_FLOOR = 30;
const CHAPTERS = [[1, 'street'], [2, 'parking'], [3, 'factory']]; const STAGE_OF = { 1: 1, 2: 6, 3: 11 };
const SETS = [['s22', 's22p'], ['xiaomi', 'xiaomip']]; // [after phone, before phone]

const py = (src, ...args) => execFileSync('python3', ['-c', src, ...args], { maxBuffer: 1 << 26 }).toString();

// in the page: hide the HUD (render without the overlay); optionally hide everything that is not floor, fog or light
const PREP = ([bare]) => {
  const G = window.__G; const H = G.host; if (!H.__r) { H.__r = H.render; H.render = () => H.__r(null); }
  if (bare) H.scene.children.forEach((o) => { if (!(o.name === 'floor' || o.name === 'fog' || o.isLight || o.isCamera)) o.visible = false; });
  for (let i = 0; i < 4; i++) window.__step(2);
};
// projections: rim points, hero heights, radial polylines, frame-edge ground extents. dims = the page's ellipse.
const PROBE = ([dims, E]) => {
  const G = window.__G; const H = G.host; const V = new H.THREE.Vector3(); const { w, h } = H.size;
  const pr = (x, y, z) => { V.set(x, y, z).project(H.camera); return [(V.x + 1) / 2 * w, (1 - V.y) / 2 * h]; };
  const rim = []; for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; rim.push(pr(Math.cos(a) * dims.x * 1.04, 0, Math.sin(a) * dims.z * 1.04)); }
  const inner = []; for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; inner.push(pr(Math.cos(a) * dims.x * 0.97, 0, Math.sin(a) * dims.z * 0.97)); }
  const lines = []; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const L = []; for (let r = 0; r <= 2.4001; r += 0.01) L.push([r, ...pr(Math.cos(a) * dims.x * r, 0, Math.sin(a) * dims.z * r)]); lines.push(L); }
  const heroes = []; for (const u of (G.B ? G.B.heroes : [])) { const n = G.actors.nodeOf(u.uid); if (!n) continue; const a = pr(n.position.x, 0, n.position.z); const b = pr(n.position.x, 2.7, n.position.z); heroes.push(Math.abs(a[1] - b[1])); }
  // ground point under each frame-edge pixel (and a 4 px shake margin)
  const cam = H.camera; let ext = 0; const ray = new H.THREE.Vector3(); const o = cam.position;
  for (let i = 0; i <= 60; i++) for (const [fx, fy] of [[i / 60, 0], [i / 60, 1], [0, i / 60], [1, i / 60]]) {
    ray.set(fx * 2 - 1, 1 - fy * 2, 0.5).unproject(cam).sub(o); if (ray.y >= -1e-4) { ext = 1e9; continue; }
    const t = -o.y / ray.y; ext = Math.max(ext, Math.abs(o.x + ray.x * t), Math.abs(o.z + ray.z * t));
  }
  return { w, h, rim, inner, lines, heroes, ext, pitch: G.cam.pitch ? +(G.cam.pitch * 180 / Math.PI).toFixed(1) : 50, dist: G.cam.dist, placed: H.fogK ? H.fogK.placed.length : 0, calls: H.fogK ? H.fogK.calls : 0 };
};

const FLAT = `
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('L'); W, Hh = json.loads(sys.argv[2])
im = im.resize((W, Hh), Image.BILINEAR); px = im.load(); n = 0; flat = 0; rows = []
for cy in range(0, Hh - 23, 24):
    for cx in range(0, W - 23, 24):
        v = [px[x, y] for y in range(cy, cy + 24, 2) for x in range(cx, cx + 24, 2)]
        m = sum(v) / len(v); sd = (sum((a - m) ** 2 for a in v) / len(v)) ** 0.5; n += 1; flat += sd < 1.5
print(json.dumps({'flat': flat / n, 'cells': n}))`;
const EDGE = `
import sys, json, math
from PIL import Image
im = Image.open(sys.argv[1]).convert('L'); d = json.load(open(sys.argv[2])); W, Hh = d['w'], d['h']
im = im.resize((W, Hh), Image.BILINEAR); px = im.load()
def lum(x, y):
    x0 = min(W - 2, max(0, int(x))); y0 = min(Hh - 2, max(0, int(y))); fx = x - x0; fy = y - y0
    return (px[x0, y0] * (1 - fx) + px[x0 + 1, y0] * fx) * (1 - fy) + (px[x0, y0 + 1] * (1 - fx) + px[x0 + 1, y0 + 1] * fx) * fy
worst = 0; mean = 0; wi = wo = 0; n = 0; gin = 0; ged = 0
for L in d['lines']:
    # resample the polyline every CSS px
    pts = []; acc = 0.0; prev = L[0]; pts.append((L[0][0], L[0][1], L[0][2])); nxt = 1.0
    for q in L[1:]:
        seg = math.hypot(q[1] - prev[1], q[2] - prev[2])
        while acc + seg >= nxt and seg > 0:
            t = (nxt - acc) / seg; pts.append((prev[0] + (q[0] - prev[0]) * t, prev[1] + (q[1] - prev[1]) * t, prev[2] + (q[2] - prev[2]) * t)); nxt += 1.0
        acc += seg; prev = q
    pts = [p for p in pts if 0 <= p[1] < W - 1 and 0 <= p[2] < Hh - 1]
    vals = [(p[0], lum(p[1], p[2])) for p in pts]
    stepIn = max([abs(vals[i + 1][1] - vals[i][1]) for i in range(len(vals) - 1) if vals[i][0] < 0.8] or [1e-6])
    stepEdge = max([abs(vals[i + 1][1] - vals[i][1]) for i in range(len(vals) - 1) if 0.9 <= vals[i][0] <= 1.6] or [0])
    ratio = stepEdge / max(stepIn, 1e-6); mean += ratio; n += 1
    gin = max(gin, stepIn); ged = max(ged, stepEdge)
    if ratio > worst: worst, wi, wo = ratio, stepIn, stepEdge
print(json.dumps({'global': ged / max(gin, 1e-6), 'gin': gin, 'ged': ged, 'worst': worst, 'mean': mean / n, 'stepIn': wi, 'stepEdge': wo}))`;
// cells along the rim with the hazard signature: >= 10% yellow-ish and >= 10% near-black pixels in a 12 px cell
const RING = `
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); d = json.load(open(sys.argv[2])); W, Hh = d['w'], d['h']; k = im.width / W; px = im.load(); hits = 0
for ring in (d['rim'], d['inner']):
    for (x, y) in ring:
        x0 = int((x - 6) * k); y0 = int((y - 6) * k); yel = blk = tot = 0
        for yy in range(max(0, y0), min(im.height, y0 + int(12 * k)), 2):
            for xx in range(max(0, x0), min(im.width, x0 + int(12 * k)), 2):
                r, g, b = px[xx, yy]; tot += 1
                if r > 170 and g > 130 and b < 90 and r - b > 100: yel += 1
                if max(r, g, b) < 45: blk += 1
        if tot and yel / tot >= 0.1 and blk / tot >= 0.1: hits += 1
print(json.dumps({'hits': hits}))`;

async function look(br, base, phone, stage, weather, dims, tag, wave, extra = {}) {
  const q = `autostart=1&stage=${stage}&wave=${wave}&noaudio=1&seed=${stage}${weather === 'clear' ? '&weather=clear' : ''}`;
  const r = await openPage(br, base, phone, q);
  const { page } = r; await page.evaluate(([s]) => window.__sim(s), [wave === 5 ? 7 : 3]);
  await page.evaluate(PREP, [false]);
  const f1 = path.join(OUT, `${tag}.png`); await page.locator('#frame').screenshot({ path: f1 });
  const p1 = await page.evaluate(PROBE, [dims, E_FLOOR]);
  const fl = JSON.parse(py(FLAT, f1, JSON.stringify([p1.w, p1.h])));
  let edge = null; let ring = null;
  if (extra.edge) {
    await page.evaluate(PREP, [true]);
    const f2 = path.join(OUT, `${tag}-bare.png`); await page.locator('#frame').screenshot({ path: f2 });
    const jf = path.join(OUT, `${tag}-probe.json`); fs.writeFileSync(jf, JSON.stringify(p1));
    edge = JSON.parse(py(EDGE, f2, jf)); ring = JSON.parse(py(RING, f1, jf)); fs.unlinkSync(jf);
  }
  const problems = r.problems.filter((x) => !/Failed to load resource/.test(x));
  await r.ctx.close();
  return { file: f1, p: p1, flat: fl.flat, edge, ring, problems };
}

async function cost(br, base, phone) {
  const r = await openPage(br, base, phone, 'autostart=1&stage=15&autoult=1&autopick=1&noaudio=1&seed=15&q=low');
  const st = await r.page.evaluate(() => { const G = window.__G; let best = { n: 0, i: 0 }; G.start(15, { seed: 15, auto: { ult: true, pick: 'best' } }); const B = G.B; for (let i = 0; i < 400 && (B.phase === 'fight' || B.phase === 'pick'); i++) { window.__sim(0.5); const k = B.enemies.filter((e) => e.alive).length; if (k > best.n) best = { n: k, i }; } return best; });
  await r.ctx.close();
  const r2 = await openPage(br, base, phone, 'autostart=1&stage=15&autoult=1&autopick=1&noaudio=1&seed=15&q=low');
  const o = await r2.page.evaluate(([best]) => { const G = window.__G; G.start(15, { seed: 15, auto: { ult: true, pick: 'best' } }); for (let i = 0; i <= best.i; i++) window.__sim(0.5); G.paused = true; window.__step(20); return { draws: window.__stats.draws, tris: window.__stats.tris }; }, [st]);
  await r2.ctx.close(); return { ...o, peak: st.n };
}

function sheetOf(rows, out) {
  py(`
import sys, json
from PIL import Image, ImageDraw
rows = json.loads(sys.argv[2]); out = sys.argv[1]; cells = []
for row in rows:
    r = []
    for label, f in row:
        im = Image.open(f).convert('RGB'); land = im.width > im.height
        im = im.resize((820, int(im.height * 820 / im.width)) if land else (int(im.width * 560 / im.height), 560)); d = ImageDraw.Draw(im); d.rectangle([0, 0, 260, 18], fill=(0, 0, 0)); d.text((4, 4), label, fill=(255, 255, 255)); r.append(im)
    cells.append(r)
H = max(i.height for r in cells for i in r); Wd = max(sum(i.width + 8 for i in r) for r in cells)
s = Image.new('RGB', (Wd + 8, len(cells) * (H + 8) + 8), (18, 18, 22)); y = 8
for r in cells:
    x = 8
    for i in r: s.paste(i, (x, y)); x += i.width + 8
    y += H + 8
s.save(out)`, out, JSON.stringify(rows));
}

const f1 = (x) => (x == null ? 'n/a' : x.toFixed(1));
const srv = await serve(); const br = await launch();
try {
  const res = { after: {}, before: {} };
  for (const [ph, phb] of SETS) {
    for (const [ch] of CHAPTERS) {
      const stage = STAGE_OF[ch];
      for (const weather of ['rain', 'clear']) {
        if (QUICK && weather === 'clear') continue;
        const a = await look(br, srv.base, ph, stage, weather, ARENA, `after-${ph}-c${ch}-${weather}-w1`, 1, { edge: true });
        res.after[`${ph}-c${ch}-${weather}`] = a;
        if (!NO_BEFORE) res.before[`${phb}-c${ch}-${weather}`] = await look(br, BEFORE_BASE, phb, stage, weather, OLD_ARENA, `before-${ph}-c${ch}-${weather}-w1`, 1, { edge: true });
      }
      res.after[`${ph}-c${ch}-boss`] = await look(br, srv.base, ph, stage, 'rain', ARENA, `after-${ph}-c${ch}-boss`, 5, {});
      if (!NO_BEFORE) res.before[`${phb}-c${ch}-boss`] = await look(br, BEFORE_BASE, phb, stage, 'rain', OLD_ARENA, `before-${ph}-c${ch}-boss`, 5, {});
    }
    const rows = CHAPTERS.map(([ch]) => [['before w1 c' + ch, path.join(OUT, `before-${ph}-c${ch}-rain-w1.png`)], ['after w1 c' + ch, path.join(OUT, `after-${ph}-c${ch}-rain-w1.png`)], ['before boss c' + ch, path.join(OUT, `before-${ph}-c${ch}-boss.png`)], ['after boss c' + ch, path.join(OUT, `after-${ph}-c${ch}-boss.png`)]].filter((c) => fs.existsSync(c[1])));
    sheetOf(rows, path.join(OUT, `battle-sheet-${ph}.png`)); console.log('sheet: ' + path.join(OUT, `battle-sheet-${ph}.png`));
  }

  for (const [k, a] of Object.entries(res.after)) {
    const [ph] = k.split('-'); const bk = Object.keys(res.before).find((x) => x === k.replace(ph, ph + 'p')); const b = bk ? res.before[bk] : null;
    console.log(`${k}: flat ${(100 * a.flat).toFixed(1)}% (before ${b ? (100 * b.flat).toFixed(1) + '%' : 'n/a'})${a.edge ? `, edge step ratio worst ${a.edge.worst.toFixed(2)} mean ${a.edge.mean.toFixed(2)} (${f1(a.edge.stepEdge)}/${f1(a.edge.stepIn)}; before ${b && b.edge ? b.edge.worst.toFixed(2) + ' (' + f1(b.edge.stepEdge) + '/' + f1(b.edge.stepIn) + ')' : 'n/a'})` : ''}${a.ring ? `, ring cells ${a.ring.hits} (before ${b && b.ring ? b.ring.hits : 'n/a'})` : ''}, floor reach ${f1(a.p.ext)} m, props ${a.p.placed}`);
    check(a.flat <= 0.05, `${k}: flat 24 px cells ${(100 * a.flat).toFixed(1)}% (<= 5%)`);
    check(a.problems.length === 0, `${k}: no console problems ${a.problems.slice(0, 2).join(' | ')}`);
    check(a.p.ext < E_FLOOR - 1.5, `${k}: every frame-edge pixel's ground point inside the built floor (max ${f1(a.p.ext)} m of ${E_FLOOR})`);
    if (a.edge) { check(a.edge.global <= 1.5, `${k}: largest step r 0.9..1.6 vs largest inside r < 0.8 over all 16 lines ${a.edge.global.toFixed(2)} (${f1(a.edge.ged)}/${f1(a.edge.gin)}) (<= 1.5; worst single line ${a.edge.worst.toFixed(2)}, floor texture seams cross some lines)`); check(/c3/.test(k) || a.ring.hits === 0, `${k}: hazard-stripe cells on the rim ${a.ring.hits} (= 0)`); }
    if (k.endsWith('rain') || k.endsWith('clear')) { if (k.endsWith('rain') && a.p.placed) check(a.p.placed >= 10 && a.p.placed <= 18, `${k}: ${a.p.placed} fog props placed (10..18), ${a.p.calls} extra draw calls (<= 6)`); }
  }
  // rim margins and hero size (rain frames, per size)
  for (const [ph] of SETS) {
    const a = res.after[`${ph}-c1-rain`]; const { w, h } = a.p; const xs = a.p.rim.map((p) => p[0]); const ys = a.p.rim.map((p) => p[1]);
    const left = 100 * Math.min(...xs) / w; const right = 100 * (w - Math.max(...xs)) / w; const top = Math.min(...ys) * 360 / h; const bot = 100 * (h - Math.max(...ys)) / h;
    console.log(`${ph} ${w}x${h}: spawn rim left ${left.toFixed(1)}% right ${right.toFixed(1)}% of width, top ${top.toFixed(0)} design px (bar 40), bottom ${bot.toFixed(1)}% of height; camera pitch ${a.p.pitch} deg dist ${a.p.dist.toFixed(1)}; hero height ${a.p.heroes.map((x) => x.toFixed(0)).join(',')} CSS px`);
    check(left >= 2 && left <= 4.2 && right >= 2 && right <= 4.2, `${ph}: spawn rim within 2-4% of the frame width from left/right (${left.toFixed(1)}%, ${right.toFixed(1)}%)`);
    check(top >= 38 && top <= 62, `${ph}: top rim point just under the top bar (${top.toFixed(0)} design px)`);
    check(bot <= 8, `${ph}: bottom rim point near the bottom edge (${bot.toFixed(1)}% of height; target <= 4%, check allows 8%)`);
  }
  // no hazard ring in the shader and no mesh named ring visible
  if (!NO_BEFORE) { const b = res.before['s22p-c1-rain']; console.log(`before s22 portrait: rim extremes ring cells ${b.ring.hits}`); }

  // cost
  const ca = await cost(br, srv.base, 's22'); const cb = NO_BEFORE ? null : await cost(br, BEFORE_BASE, 's22p');
  console.log(`q=low stage 15 peak: after draws ${ca.draws} tris ${ca.tris} (peak ${ca.peak}); before ${cb ? `draws ${cb.draws} tris ${cb.tris} (peak ${cb.peak})` : 'n/a'}`);
  if (cb) check(ca.draws - cb.draws <= 10, `q=low draws +${ca.draws - cb.draws} vs deployed (<= +10)`);
} finally { await br.close(); srv.close(); }
done();
