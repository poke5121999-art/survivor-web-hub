// How the battle world reads on screen: a lit block island (js/view/pad.js, world.js) over water or a fog abyss that fills the
// whole wide frame. Measured on frames with the HUD hidden (the host's render is patched to skip the overlay).
//  - coverage: share of 24 x 24 design px cells with luminance std < 1.5 (<= 3%); BEFORE = the deployed portrait build
//  - outline: the island outline polygon (from the page's own data) deviates from its best-fit ellipse by >= 0.5 m RMS and
//    has >= 12 corners; no hazard-stripe texture on any mesh in the scene
//  - lighting: >= 4 warm sources inside the frame; warm pixels (hue 15-55, sat > 0.35, value > 0.5) 0.5% .. 12%; ring
//    contrast (team rings vs the floor under them, measured by drawing the frame with and without the rings) >= the
//    tree's value before the island (.chk/landscape/baseline-tree.json, written by --baseline on the old tree)
//  - depth: the water/abyss alone differs between the near (bottom) and far (top) edge; >= 30 drifting light particles
//  - play area empty: no decoration box corner above y 0.05 inside 1.08 of the ellipse; nothing on the near rim over 1.2 m
//  - spawns: 200 first visible frames on stages 3, 8, 15 at or outside 1.0 of the ellipse, at or below the surface, rising
//  - heroes never under the hero block (x 240..540, y > 280 design px): stages 3, 8, 15, 30, 400 samples
//  - cost at q=low, s22, stage 15 peak: draws <= deployed + 25, render() CPU <= 1.3 x the tree before, world build < 250 ms
// Sheets: .chk/landscape/world-<phone>.png (six chapters, wave 1 and boss wave), world-vs-ref.png (stage shots beside the
// owner's references).
// Usage: PLAYWRIGHT_PATH=... timeout 1800 node games/ai-sinh-ton/tools/arena-look-test.mjs [--quick] [--phones=s22] [--ch=1,2]
//        [--baseline] (measure this tree as the "before" for ring contrast and render cost) [--refresh-before]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { serve, launch, open as openPage, checker, ROOT, PHONES } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'landscape'); fs.mkdirSync(OUT, { recursive: true });
const REFS = path.join(os.homedir(), 'handoff', 'ai-sinh-ton-refs');
const BEFORE_BASE = (process['env'].AST_BEFORE || 'https://poke5121999-art.github.io/survivor-web-hub').replace(/\/$/, '');
const BEFORE_JSON = path.join(OUT, 'before-deployed.json'); const TREE_JSON = path.join(OUT, 'baseline-tree.json');
const argv = process.argv.slice(2); const arg = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const GPATH = arg('path') || undefined; // another copy of the game under the repo root (the --baseline snapshot)
const QUICK = argv.includes('--quick'); const BASELINE = argv.includes('--baseline'); const REFRESH = argv.includes('--refresh-before');
const PH = arg('phones') ? arg('phones').split(',') : (QUICK ? ['s22'] : ['s22', 'xiaomi', 'desktop']);
const CH = arg('ch') ? arg('ch').split(',').map(Number) : [1, 2, 3, 4, 5, 6];
const stageOf = (ch) => (ch - 1) * 5 + 1;
const HUD = { top: 40, x0: 240, x1: 540, y0: 280 };
const { check, done } = checker();
const T0 = Date.now();
PHONES.s22p = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };
const py = (src, ...args) => execFileSync('python3', ['-c', src, ...args], { maxBuffer: 1 << 26 }).toString();

// in the page: hide the HUD; bare = only the named world groups stay visible
const PREP = () => { const H = window.__G.host; if (!H.__r) { H.__r = H.render; H.render = () => H.__r(null); } const sc = window.__G.screens && window.__G.screens[window.__G.screen]; void sc; for (let i = 0; i < 4; i++) window.__step(2); };
const ONLY = ([names]) => { const H = window.__G.host; H.scene.children.forEach((o) => { if (o.isLight || o.isCamera) return; if (o.__vis === undefined) o.__vis = o.visible; o.visible = names ? names.includes(o.name) : o.__vis; }); window.__step(1); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); };
// rings over the bare floor: everything but the floor (island or old floor), its surroundings and the team rings is hidden,
// so the with/without difference is the rings alone (no rain, particles or flicker between the two frames)
const RINGS = ([on]) => { const H = window.__G.host; const isRing = (o) => { const p = o.geometry && o.geometry.type === 'RingGeometry' && o.geometry.parameters; return !!p && (Math.abs(p.innerRadius - 0.5) < 1e-3 || Math.abs(p.innerRadius - 0.62) < 1e-3); };
  if (H.__bg === undefined) H.__bg = H.scene.background;
  H.scene.background = on === 'mask' ? new H.THREE.Color(0) : H.__bg; if (on === 'mask') H.renderer.setClearColor(0, 1); else if (H.__bg && H.__bg.isColor) H.renderer.setClearColor(H.__bg, 1);
  window.__G.paused = true; H.scene.children.forEach((o) => { if (o.isLight || o.isCamera) return; if (o.__vis === undefined) o.__vis = o.visible; o.visible = on === null ? o.__vis : (isRing(o) ? on !== 'off' : on !== 'mask' && ['island', 'abyss', 'floor', 'fog'].includes(o.name)); }); window.__step(1); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); };

// world data seen through the game's own camera
const PROBE = () => {
  const G = window.__G; const H = G.host; const V = new H.THREE.Vector3(); const { w, h } = H.size; const u = H.size.u || 1;
  const pr = (x, y, z) => { V.set(x, y, z).project(H.camera); return [(V.x + 1) / 2 * w / u, (1 - V.y) / 2 * h / u, V.z]; };
  const W = H.world; const pad = W && W.pad;
  const lights = W ? W.lights().map((L) => ({ warm: L.warm, p: pr(L.x, L.y, L.z) })) : [];
  const hero = []; for (const un of (G.B ? G.B.heroes : [])) { const n = G.actors.nodeOf(un.uid); if (!n) continue; const a = pr(n.position.x, 0, n.position.z); const b = pr(n.position.x, 2.7, n.position.z); hero.push(Math.abs(a[1] - b[1])); }
  let hazard = 0; H.scene.traverse((o) => { const m = o.material; for (const mm of [].concat(m || [])) if (mm && mm.map && /hazard/.test(mm.map.name || '')) hazard++; });
  const rim = []; for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; rim.push(pr(Math.cos(a) * 9.6 * 1.04, 0, Math.sin(a) * 4.6 * 1.04)); }
  return { w, h, u, lights, hero, hazard, rim, pitch: +(G.cam.pitch * 180 / Math.PI).toFixed(1), dist: G.cam.dist, fov: H.camera.fov,
    outline: pad ? pad.outline : null, ellipse: pad ? pad.ellipse : null, boxes: pad ? pad.boxes : [], motes: W ? W.motesAlive() : 0, buildMs: W ? W.buildMs : 0, theme: pad ? pad.theme : '' };
};

const IMG = `
import sys, json, colorsys
from PIL import Image
f, W, Hh = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
im = Image.open(f).convert('RGB'); L = im.convert('L').resize((W, Hh), Image.BILINEAR); px = L.load(); n = 0; flat = 0
for cy in range(0, Hh - 23, 24):
    for cx in range(0, W - 23, 24):
        v = [px[x, y] for y in range(cy, cy + 24, 2) for x in range(cx, cx + 24, 2)]
        m = sum(v) / len(v); sd = (sum((a - m) ** 2 for a in v) / len(v)) ** 0.5; n += 1; flat += sd < 1.5
sm = im.resize((W, Hh), Image.BILINEAR).load(); warm = 0; tot = 0; wh = 0
for y in range(0, Hh, 2):
    for x in range(0, W, 2):
        r, g, b = sm[x, y]; hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255); tot += 1
        if 15 <= hh * 360 <= 55 and s > 0.35 and v > 0.5: warm += 1
        if min(r, g, b) >= 250: wh += 1
print(json.dumps({'flat': flat / n, 'warm': warm / tot, 'white': wh / tot}))`;
// ring pixels from a mask frame (rings alone over black); contrast = mean luminance difference there, rings on vs off
const RINGDIFF = `
import sys, json
from PIL import Image
a = Image.open(sys.argv[1]).convert('L'); b = Image.open(sys.argv[2]).convert('L'); m = Image.open(sys.argv[3]).convert('L'); pa = a.load(); pb = b.load(); pm = m.load(); s = 0; n = 0
for y in range(0, a.height, 2):
    for x in range(0, a.width, 2):
        if pm[x, y] > 40: s += abs(pa[x, y] - pb[x, y]); n += 1
print(json.dumps({'c': s / max(1, n), 'n': n}))`;
// mean luminance and saturation of the bottom and top 15% rows
const DEPTH = `
import sys, json, colorsys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB').resize((390, 180)); p = im.load()
def band(y0, y1):
    l = s = n = 0
    for y in range(y0, y1):
        for x in range(0, 390, 2):
            r, g, b = p[x, y]; h, ss, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255); l += 0.3 * r + 0.59 * g + 0.11 * b; s += ss; n += 1
    return l / n, s / n
nl, ns = band(153, 180); fl, fs = band(0, 27)
print(json.dumps({'near': [nl, ns], 'far': [fl, fs]}))`;

function shapeOf(outline, ell) {
  // RMS of the radial distance from the outline to the best-fit axis-aligned ellipse about the pad centre, and its corners
  const pts = outline.map(([x, z]) => [x - ell.cx, z - ell.cz]);
  let best = 1e9;
  for (let a = 6; a <= 20; a += 0.1) for (let b = 3; b <= 10; b += 0.1) {
    let s = 0; for (const [x, z] of pts) { const r = Math.hypot(x, z); const t = Math.atan2(z, x); const re = 1 / Math.hypot(Math.cos(t) / a, Math.sin(t) / b); s += (r - re) ** 2; }
    best = Math.min(best, Math.sqrt(s / pts.length));
  }
  let vex = 0; let cave = 0; const n = pts.length; let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i]; const b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n]; const b = pts[i]; const c = pts[(i + 1) % n];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-6) continue; if (Math.sign(cr) === Math.sign(area)) vex++; else cave++;
  }
  return { rms: best, vex, cave };
}

async function look(br, base, phone, stage, wave, tag, deep) {
  const r = await openPage(br, base, phone, `autostart=1&stage=${stage}&wave=${wave}&noaudio=1&seed=${stage}`, { path: base === BEFORE_BASE ? undefined : GPATH });
  const { page } = r; await page.evaluate(([s]) => window.__sim(s), [wave === 5 ? 7 : 3]);
  await page.evaluate(PREP); await page.evaluate(() => { window.__G.paused = true; window.__step(2); });
  const f = path.join(OUT, `${tag}.png`); await page.locator('#frame').screenshot({ path: f });
  const p = await page.evaluate(PROBE);
  const img = JSON.parse(py(IMG, f, String(Math.round(p.w / p.u)), String(Math.round(p.h / p.u))));
  const out = { file: f, p, img };
  if (deep) {
    await page.evaluate(RINGS, ['on']); const f1 = path.join(OUT, `${tag}-rings.png`); await page.locator('#frame').screenshot({ path: f1 });
    await page.evaluate(RINGS, ['off']); const f0 = path.join(OUT, `${tag}-norings.png`); await page.locator('#frame').screenshot({ path: f0 });
    await page.evaluate(RINGS, ['mask']); const fm = path.join(OUT, `${tag}-ringmask.png`); await page.locator('#frame').screenshot({ path: fm });
    out.ring = JSON.parse(py(RINGDIFF, f1, f0, fm)); for (const x of [f0, f1, fm]) fs.unlinkSync(x); await page.evaluate(RINGS, [null]);
    if (p.outline) {
      await page.evaluate(ONLY, [['abyss']]); const fb = path.join(OUT, `${tag}-abyss.png`); await page.locator('#frame').screenshot({ path: fb });
      out.depth = JSON.parse(py(DEPTH, fb)); await page.evaluate(ONLY, [null]);
    }
  }
  out.problems = r.problems.filter((x) => !/Failed to load resource/.test(x));
  await r.ctx.close(); return out;
}

// q=low s22 stage 15 at its enemy peak: draws, triangles and render() CPU over 120 paused frames
async function cost(br, base, phone) {
  const r = await openPage(br, base, phone, 'autostart=1&stage=15&autoult=1&autopick=1&noaudio=1&seed=15&q=low', { path: base === BEFORE_BASE ? undefined : GPATH });
  const o = await r.page.evaluate(async () => {
    // play stage 15 to its end once to learn the peak, then replay and stop at 90% of it
    const G = window.__G; const H = G.host; const alive = () => G.B.enemies.filter((e) => e.alive).length; let best = 0;
    G.start(15, { seed: 15, auto: { ult: true, pick: 'best' } });
    for (let i = 0; i < 400 && (G.B.phase === 'fight' || G.B.phase === 'pick'); i++) { window.__sim(0.5); best = Math.max(best, alive()); }
    G.start(15, { seed: 15, auto: { ult: true, pick: 'best' } });
    for (let i = 0; i < 400 && (G.B.phase === 'fight' || G.B.phase === 'pick') && alive() < best * 0.9; i++) window.__sim(0.5);
    const B = G.B;
    const raf = () => new Promise((res) => requestAnimationFrame(res)); G.paused = true; for (let i = 0; i < 10; i++) await raf();
    const render = H.render; let cpu = 0; let n = 0; H.render = (ov) => { const t = performance.now(); render(ov); cpu += performance.now() - t; n++; };
    for (let i = 0; i < 120; i++) await raf();
    H.render = render;
    return { draws: window.__stats.draws, tris: window.__stats.tris, cpu: cpu / Math.max(1, n), peak: B.enemies.filter((e) => e.alive).length, best };
  });
  await r.ctx.close(); return o;
}

// first visible frames of 200 spawns: the arrival hook logs where each enemy body is drawn the first two times
async function spawns(br, base) {
  const rows = [];
  for (const s of [3, 8, 15]) {
    const r = await openPage(br, base, 's22', `autostart=1&stage=${s}&autoult=1&autopick=1&noaudio=1&seed=${s}`);
    const got = await r.page.evaluate(([want]) => {
      const G = window.__G; const H = G.host; H.arrivalLog = new Map(); const B = G.B;
      for (let i = 0; i < 4000 && H.arrivalLog.size < want && (B.phase === 'fight' || B.phase === 'pick'); i++) window.__sim(0.1);
      return [...H.arrivalLog.values()].filter((x) => !x.inside).slice(0, want);
    }, [70]);
    rows.push(...got); await r.ctx.close();
  }
  return rows;
}

// heroes' projected feet against the hero block
async function heroFeet(br, base) {
  let n = 0; let bad = 0; let worst = 0;
  for (const s of [3, 8, 15, 30]) {
    const r = await openPage(br, base, 's22', `autostart=1&stage=${s}&autoult=1&autopick=1&noaudio=1&seed=${s}`);
    const o = await r.page.evaluate(([hud]) => {
      const G = window.__G; const H = G.host; const V = new H.THREE.Vector3(); let n = 0; let bad = 0; let worst = 0;
      for (let k = 0; k < 100; k++) {
        if (!G.B || !(G.B.phase === 'fight' || G.B.phase === 'pick')) G.start(G.B.stage.n, { seed: k + 2, wave: 1 + (k % 5), auto: { ult: true, pick: 'best' } });
        window.__sim(1.3);
        for (const u of G.B.heroes) {
          if (!u.alive) continue; const nd = G.actors.nodeOf(u.uid); if (!nd) continue;
          V.set(nd.position.x, 0, nd.position.z).project(H.camera); const uu = H.size.u || 1; const x = (V.x + 1) / 2 * H.size.w / uu; const y = (1 - V.y) / 2 * H.size.h / uu; n++;
          if (x > hud.x0 && x < hud.x1) worst = Math.max(worst, y);
          if (x > hud.x0 && x < hud.x1 && y > hud.y0) bad++;
        }
      }
      return { n, bad, worst };
    }, [HUD]);
    n += o.n; bad += o.bad; worst = Math.max(worst, o.worst); await r.ctx.close();
  }
  return { n, bad, worst };
}

function compose(rows, out, cellW) {
  py(`
import sys, json
from PIL import Image, ImageDraw
rows = json.loads(sys.argv[2]); W = int(sys.argv[3]); cells = []
for row in rows:
    r = []
    for label, f in row:
        im = Image.open(f).convert('RGB'); hh = int(im.height * W / im.width)
        if hh > W * 0.75: im = im.resize((int(im.width * W * 0.75 / im.height), int(W * 0.75)))
        else: im = im.resize((W, hh))
        d = ImageDraw.Draw(im); d.rectangle([0, 0, 300, 18], fill=(0, 0, 0)); d.text((5, 4), label, fill=(255, 255, 255)); r.append(im)
    cells.append(r)
H = max(i.height for r in cells for i in r); Wd = max(sum(i.width + 8 for i in r) for r in cells)
s = Image.new('RGB', (Wd + 8, len(cells) * (H + 8) + 8), (18, 18, 22)); y = 8
for r in cells:
    x = 8
    for i in r: s.paste(i, (x, y)); x += i.width + 8
    y += H + 8
s.save(sys.argv[1])`, out, JSON.stringify(rows), String(cellW));
}

const srv = await serve(); const br = await launch();
try {
  if (BASELINE) {
    const c = argv.includes('--ring-only') ? null : await cost(br, srv.base, 's22'); const ring = [];
    for (const ch of (argv.includes('--cost-only') ? [] : [1, 2, 3])) { const a = await look(br, srv.base, 's22', stageOf(ch), 1, `tree-before-c${ch}`, true); ring.push(a.ring.c); console.log(`tree before c${ch}: flat ${(100 * a.img.flat).toFixed(1)}% warm ${(100 * a.img.warm).toFixed(2)}% ring contrast ${a.ring.c.toFixed(1)} (${a.ring.n} px)`); }
    let old = {}; try { old = JSON.parse(fs.readFileSync(TREE_JSON, 'utf8')); } catch (e) { old = {}; }
    const t = argv.includes('--ring-only') ? { ...old, ring, at: new Date().toISOString() } : { ...c, ring: ring.length ? ring : old.ring, at: new Date().toISOString() }; fs.writeFileSync(TREE_JSON, JSON.stringify(t, null, 1)); console.log('baseline tree:', JSON.stringify(t));
  } else {
    let before = null; try { before = JSON.parse(fs.readFileSync(BEFORE_JSON, 'utf8')); } catch (e) { before = null; }
    if (!before || REFRESH) {
      const b = await look(br, BEFORE_BASE, 's22p', 1, 1, 'deployed-s22p-c1-w1', false); const c = await cost(br, BEFORE_BASE, 's22p');
      before = { flat: b.img.flat, warm: b.img.warm, ...c, at: new Date().toISOString() }; fs.writeFileSync(BEFORE_JSON, JSON.stringify(before, null, 1));
    }
    let tree = null; try { tree = JSON.parse(fs.readFileSync(TREE_JSON, 'utf8')); } catch (e) { tree = null; }
    console.log(`BEFORE deployed portrait s22: flat cells ${(100 * before.flat).toFixed(1)}%, warm ${(100 * before.warm).toFixed(2)}%, q=low stage 15 draws ${before.draws} tris ${before.tris} render ${before.cpu.toFixed(2)} ms`);
    if (tree) console.log(`BEFORE this tree (flat floor): ring contrast ${tree.ring.map((x) => x.toFixed(1)).join('/')}, q=low draws ${tree.draws} tris ${tree.tris} render ${tree.cpu.toFixed(2)} ms`);

    const sheets = {};
    for (const ph of PH) {
      sheets[ph] = [];
      for (const ch of CH) {
        const st = stageOf(ch); const deep = ph === 's22';
        const a = await look(br, srv.base, ph, st, 1, `world-${ph}-c${ch}-w1`, deep);
        const bw = await look(br, srv.base, ph, st, 5, `world-${ph}-c${ch}-boss`, false);
        sheets[ph].push([[`${ph} ch${ch} wave 1`, a.file], [`${ph} ch${ch} boss`, bw.file]]);
        const k = `${ph} ch${ch} (${a.p.theme})`; const p = a.p;
        const warmIn = p.lights.filter((L) => L.warm && L.p[2] < 1 && L.p[0] >= 0 && L.p[0] <= p.w / p.u && L.p[1] >= HUD.top && L.p[1] <= p.h / p.u).length;
        console.log(`${k}: flat ${(100 * a.img.flat).toFixed(2)}% warm px ${(100 * a.img.warm).toFixed(2)}% white ${(100 * a.img.white).toFixed(2)}% warm sources in frame ${warmIn} motes ${p.motes} build ${p.buildMs.toFixed(0)} ms pitch ${p.pitch} fov ${p.fov} dist ${p.dist.toFixed(1)} hero px ${p.hero.map((x) => x.toFixed(0)).join(',')}`);
        for (const [lab, o] of [['wave 1', a], ['boss', bw]]) {
          check(o.img.flat <= 0.03, `${k} ${lab}: flat 24 px cells ${(100 * o.img.flat).toFixed(2)}% (<= 3%; deployed ${(100 * before.flat).toFixed(1)}%)`);
          check(o.img.white < 0.01, `${k} ${lab}: clipped white ${(100 * o.img.white).toFixed(2)}% (< 1%)`);
          check(o.problems.length === 0, `${k} ${lab}: no console problems ${o.problems.slice(0, 2).join(' | ')}`);
        }
        check(warmIn >= 4, `${k}: warm light sources inside the frame ${warmIn} (>= 4)`);
        check(a.img.warm >= 0.005 && a.img.warm <= 0.12, `${k}: warm pixel share ${(100 * a.img.warm).toFixed(2)}% (0.5..12%)`);
        check(p.motes >= 30, `${k}: drifting light particles ${p.motes} (>= 30)`);
        check(p.buildMs < 250, `${k}: world build ${p.buildMs.toFixed(0)} ms (< 250)`);
        check(p.hazard === 0, `${k}: no hazard-stripe texture in the scene (${p.hazard})`);
        if (p.outline && ph === PH[0]) {
          const s = shapeOf(p.outline, p.ellipse);
          check(s.rms >= 0.5 && s.vex + s.cave >= 12, `${k}: island outline vs best-fit ellipse RMS ${s.rms.toFixed(2)} m (>= 0.5), corners ${s.vex} convex + ${s.cave} concave (>= 12)`);
          const E = p.ellipse; let inside = 0; let tall = 0;
          for (const b of p.boxes) {
            for (const x of [b[0], b[3]]) for (const z of [b[2], b[5]]) if (b[4] > 0.05 && Math.hypot((x - E.cx) / E.x, (z - E.cz) / E.z) < 1.08) inside++;
            const cx = (b[0] + b[3]) / 2 - E.cx; const cz = (b[2] + b[5]) / 2 - E.cz;
            if (cz > 0 && Math.abs(cx) < E.x * 0.8 && Math.hypot(cx / E.x, cz / E.z) < 1.6 && b[4] > 1.2) tall++;
          }
          check(p.boxes.length > 0 && inside === 0, `${k}: decoration corners inside 1.08 of the ellipse above y 0.05: ${inside} of ${p.boxes.length} boxes (= 0)`);
          check(tall === 0, `${k}: near-rim decoration taller than 1.2 m: ${tall} (= 0)`);
        }
        if (a.ring && tree) { const b = tree.ring[Math.min(tree.ring.length - 1, ch - 1)]; const ref = Math.min(...tree.ring); console.log(`${k}: ring contrast ${a.ring.c.toFixed(1)} over ${a.ring.n} px (tree before ${b.toFixed(1)})`); check(a.ring.c >= ref, `${k}: team ring to floor luminance difference ${a.ring.c.toFixed(1)} (>= the flat floor's lowest ${ref.toFixed(1)})`); }
        if (a.depth) { const dl = Math.abs(a.depth.near[0] - a.depth.far[0]); const ds = Math.abs(a.depth.near[1] - a.depth.far[1]); check(dl >= 4 || ds >= 0.04, `${k}: water/abyss near vs far: luminance ${a.depth.near[0].toFixed(0)} vs ${a.depth.far[0].toFixed(0)}, saturation ${a.depth.near[1].toFixed(2)} vs ${a.depth.far[1].toFixed(2)} (a gradient: >= 4 levels or 0.04)`); }
        if (ch === 1 || ch === CH[0]) {
          const xs = p.rim.map((q) => q[0]); const ys = p.rim.map((q) => q[1]); const Wd = p.w / p.u; const Hd = p.h / p.u;
          const left = 100 * Math.min(...xs) / Wd; const right = 100 * (Wd - Math.max(...xs)) / Wd; const top = Math.min(...ys);
          const corner = Math.max(...p.rim.filter((q) => q[0] < HUD.x0 || q[0] > HUD.x1).map((q) => q[1]));
          console.log(`${ph}: spawn rim left ${left.toFixed(1)}% right ${right.toFixed(1)}%, top ${top.toFixed(0)} px, lowest outside the hero block ${corner.toFixed(0)} px (frame ${Wd.toFixed(0)}x${Hd.toFixed(0)})`);
          check(left >= 2 && left <= 5 && right >= 2 && right <= 5, `${ph}: spawn rim within 2-5% of the frame width from left/right (${left.toFixed(1)}%, ${right.toFixed(1)}%)`);
          check(top >= 38 && top <= 70, `${ph}: top rim point just under the top bar (${top.toFixed(0)} design px)`);
          check(corner <= 352, `${ph}: spawn rim outside the hero block above y 352 (${corner.toFixed(0)})`);
        }
      }
      compose(sheets[ph], path.join(OUT, `world-${ph}.png`), 560); console.log('sheet: ' + path.join(OUT, `world-${ph}.png`));
    }
    // beside the references
    const refs = ['look-4.webp', 'look-5.webp', 'look-6.webp', 'look-7.webp', 'look-8.webp', 'owner-porthole-arena.png'].map((f) => path.join(REFS, f)).filter((f) => fs.existsSync(f));
    const ours = (sheets[PH[0]] || []).map((r) => r[0]);
    const rows = []; for (let i = 0; i < Math.max(ours.length, refs.length); i += 1) rows.push([...(ours[i] ? [ours[i]] : []), ...(refs[i] ? [[path.basename(refs[i]), refs[i]]] : [])]);
    compose(rows, path.join(OUT, 'world-vs-ref.png'), 640); console.log('sheet: ' + path.join(OUT, 'world-vs-ref.png'));

    if (!QUICK) {
      const sp = await spawns(br, srv.base);
      // a monster arriving over a bridge walks on its deck, so it shows at deck height instead of rising from below the rim
      const bad = sp.filter((s) => !(s.n0 >= 1.0 && (s.bridge || s.y0 <= 0.001) && (s.y1 === null || s.y1 >= s.y0)));
      check(sp.length >= 200 && bad.length === 0, `spawns: ${sp.length} first visible frames, ${bad.length} not at/outside 1.0 of the ellipse, below the surface and rising ${bad.slice(0, 2).map((s) => JSON.stringify(s)).join(' ')}`);
      const hf = await heroFeet(br, srv.base);
      check(hf.n >= 400 && hf.bad === 0, `heroes: ${hf.n} foot samples on stages 3, 8, 15, 30, ${hf.bad} inside the hero block (lowest inside its columns y ${hf.worst.toFixed(0)}, block from ${HUD.y0})`);
      const c = await cost(br, srv.base, 's22');
      console.log(`q=low s22 stage 15 peak ${c.peak}: draws ${c.draws} (deployed ${before.draws}${tree ? ', tree before ' + tree.draws : ''}), tris ${c.tris} (deployed ${before.tris}), render() ${c.cpu.toFixed(2)} ms (tree before ${tree ? tree.cpu.toFixed(2) : 'n/a'}, deployed ${before.cpu.toFixed(2)})`);
      check(c.draws <= before.draws + 25, `q=low draws ${c.draws} <= deployed ${before.draws} + 25`);
      if (tree) check(c.cpu <= tree.cpu * 1.3, `q=low render() ${c.cpu.toFixed(2)} ms <= 1.3 x tree before ${tree.cpu.toFixed(2)} ms`);
      else check(false, 'tree-before render cost not readable (.chk/landscape/baseline-tree.json)');
    }
  }
} finally { await br.close(); srv.close(); }
console.log(`elapsed ${Math.round((Date.now() - T0) / 1000)} s`);
done();
