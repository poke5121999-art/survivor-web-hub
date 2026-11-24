// The light of each chapter's biome (themes/*.js through host.js and world.js), measured on the battle frame with the HUD
// hidden, stage (ch - 1) * 5 + 2 after 8 s of fight, at s22 and xiaomi:
//  - floor: mean luma (Rec. 709 over sRGB 0..255) of the arena floor alone (a frame with only the island and the abyss
//    drawn), sampled on a grid inside 0.9 of the arena ellipse; a chapter is "day" at >= DAY_FLOOR
//  - white: share of pixels with min(r, g, b) >= 250 over the whole frame (< 1%)
//  - black: share of pixels with max(r, g, b) < 20 over the whole frame (< 8%)
//  - units: each living hero and monster whose box is in view, the colour distance between its own pixels (those that
//    differ between the full frame and the floor-only frame inside its projected box) and the floor behind them; the
//    chapter passes when the median unit is >= UNIT_MIN and no more than 15% of them are under UNIT_LOW
//  - at least DAY_MIN of the ten chapters are day (counted on s22)
// Shots: .chk/a11/light/<sub>/c<ch>-<phone>.png (full) and -floor.png; --root=<another checkout> serves that tree instead
// (the old build: --root=$HOME/ai-sinh-ton/.wt-integ3 --sub=old). --sheet composes old | new | MCD reference per chapter
// into .chk/a11/light/sheet-c<ch>.png from shots already taken.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/light-test.mjs [--ch=1,2] [--phones=s22] [--q=medium]
//        [--root=DIR --sub=old] [--sheet]
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, launch, open as openPage, checker, ROOT } from './pw.mjs';

const argv = process.argv.slice(2); const arg = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const CH = arg('ch') ? arg('ch').split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PH = arg('phones') ? arg('phones').split(',') : ['s22', 'xiaomi'];
const Q = arg('q') || 'medium';
const SUB = arg('sub') || 'new';
const OTHER = arg('root');
const BASE = path.join(ROOT, '.chk', 'a11', 'light'); const OUT = path.join(BASE, SUB); fs.mkdirSync(OUT, { recursive: true });
const REFS = path.join(os.homedir(), 'handoff', 'ai-sinh-ton-refs');
const DAY_FLOOR = 105; const DAY_MIN = 5; const UNIT_MIN = 45; const UNIT_LOW = 22;
const BIOMES = ['forest', 'street', 'crypt', 'swamp', 'volcano', 'snow', 'coast', 'factory', 'sky', 'void'];
// the nearest Minecraft Dungeons screenshot per biome (look and light, not layout)
const REF = { forest: 'look-9-horde-grass.webp', street: 'look-4.webp', crypt: 'look-10-desert-temple.webp', swamp: 'look-6.webp', volcano: 'look-11-lava-bridge.png', snow: 'look-7.webp', coast: 'look-5.webp', factory: 'look-8.webp', sky: 'look-9-horde-grass.webp', void: 'look-12-boss.png' };
const py = (src, ...a) => execFileSync('python3', ['-c', src, ...a], { maxBuffer: 1 << 26 }).toString();

if (argv.includes('--sheet')) {
  for (const ch of CH) {
    const b = BIOMES[ch - 1]; const rows = [];
    for (const ph of PH) rows.push([path.join(BASE, 'old', `c${ch}-${ph}.png`), path.join(BASE, 'new', `c${ch}-${ph}.png`), path.join(REFS, REF[b])]);
    py(`
import sys, json
from PIL import Image, ImageDraw
rows = json.loads(sys.argv[2]); W = 560; labels = ['old 20261124a', 'new', 'MCD ref']; out = []
for row in rows:
    r = []
    for i, f in enumerate(row):
        try: im = Image.open(f).convert('RGB')
        except Exception: im = Image.new('RGB', (780, 360), (60, 0, 0))
        im = im.resize((W, int(im.height * W / im.width))); d = ImageDraw.Draw(im); d.rectangle([0, 0, 150, 16], fill=(0, 0, 0)); d.text((4, 3), labels[i] + ' ' + sys.argv[3], fill=(255, 255, 255)); r.append(im)
    out.append(r)
H = [max(im.height for im in r) for r in out]
s = Image.new('RGB', (3 * W + 32, sum(H) + 8 * (len(out) + 1)), (18, 18, 22)); y = 8
for j, r in enumerate(out):
    for i, im in enumerate(r): s.paste(im, (8 + i * (W + 8), y))
    y += H[j] + 8
s.save(sys.argv[1])`, path.join(BASE, `sheet-c${ch}.png`), JSON.stringify(rows), b);
    console.log('sheet: ' + path.join(BASE, `sheet-c${ch}.png`));
  }
  process.exit(0);
}

// another checkout (the old build) served the same way pw.mjs serves this one
function serveRoot(root) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
      fs.stat(f, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
        const ext = path.extname(f); res.writeHead(200, { 'Content-Type': ext === '.js' || ext === '.mjs' ? 'text/javascript; charset=utf-8' : ext === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(f).pipe(res);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ base: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() }));
  });
}

// whole-frame white and black shares, the floor luma at the given points, and per unit box the colour distance
function measure(full, floor, pts, boxes) {
  return JSON.parse(py(`
import sys, json
from PIL import Image
A = Image.open(sys.argv[1]).convert('RGB'); B = Image.open(sys.argv[2]).convert('RGB'); W, H = A.size; a = A.load(); b = B.load()
pts = json.loads(sys.argv[3]); boxes = json.loads(sys.argv[4]); k = W / 780.0
wh = bk = n = 0
for y in range(0, H, 3):
    for x in range(0, W, 3):
        r, g, bl = a[x, y]; n += 1
        if min(r, g, bl) >= 250: wh += 1
        if max(r, g, bl) < 20: bk += 1
lum = lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
fl = []
for fx, fy in pts:
    cx, cy = int(fx * W), int(fy * H); s = 0; m = 0
    for y in range(cy - 4, cy + 5, 2):
        for x in range(cx - 4, cx + 5, 2):
            if 0 <= x < W and 0 <= y < H: s += lum(b[x, y]); m += 1
    if m: fl.append(s / m)
units = []; cols = []
for x0, y0, x1, y1 in boxes:
    X0, Y0, X1, Y1 = max(0, int(x0 * W)), max(0, int(y0 * H)), min(W - 1, int(x1 * W)), min(H - 1, int(y1 * H))
    sa = [0, 0, 0]; sb = [0, 0, 0]; m = 0
    st = max(1, int((X1 - X0) / 24))
    for y in range(Y0, Y1 + 1, st):
        for x in range(X0, X1 + 1, st):
            p = a[x, y]; q = b[x, y]
            if abs(p[0] - q[0]) + abs(p[1] - q[1]) + abs(p[2] - q[2]) > 30:
                for i in range(3): sa[i] += p[i]; sb[i] += q[i]
                m += 1
    if m >= 6: units.append(sum((sa[i] / m - sb[i] / m) ** 2 for i in range(3)) ** 0.5); cols.append([[round(v / m) for v in sa], [round(v / m) for v in sb]])
fl.sort()
print(json.dumps({'white': wh / n, 'black': bk / n, 'floor': sum(fl) / max(1, len(fl)), 'floorLo': fl[len(fl) // 10] if fl else 0, 'floorHi': fl[len(fl) * 9 // 10] if fl else 0, 'units': units, 'cols': cols}))`, full, floor, JSON.stringify(pts), JSON.stringify(boxes)));
}

const srv = OTHER ? await serveRoot(path.resolve(OTHER)) : await serve();
const br = await launch();
const { check, done } = checker();
const T0 = Date.now(); const rows = [];
try {
  // chapters drawn in two themes (street | parking, landing | void) are measured on both: the second on the next stage
  const RUNS = CH.flatMap((ch) => (ch === 2 || ch === 10 ? [[ch, ''], [ch, 'b']] : [[ch, '']]));
  for (const ph of PH) for (const [ch, alt] of RUNS) {
    const stage = (ch - 1) * 5 + 2 + (alt ? 1 : 0); const tag = `c${ch}${alt}-${ph}`;
    const { ctx, page, problems } = await openPage(br, srv.base, ph, `autostart=1&stage=${stage}&autopick=1&noaudio=1&seed=3&q=${Q}`, { freeze: true });
    await page.evaluate(() => { const H = window.__G.host; if (!H.__r) { H.__r = H.render; H.render = () => H.__r(null); } });
    await page.evaluate(() => window.__sim(8)); await page.evaluate(() => window.__step(4));
    await page.evaluate(() => { window.__G.paused = true; });
    const info = await page.evaluate(() => {
      const G = window.__G; const H = G.host; const v = new H.THREE.Vector3();
      const pr = (x, y, z) => { v.set(x, y, z).project(H.camera); return [(v.x + 1) / 2, (1 - v.y) / 2, v.z]; };
      const pts = [];
      for (let x = -9; x <= 9; x += 1.5) for (let z = -4.5; z <= 4.5; z += 1.5) { if (Math.hypot(x / 9.6, z / 4.6) > 0.9) continue; const c = H.world.pad && H.world.pad.cellAt ? H.world.pad.cellAt(x, z) : null; const p = pr(x, c ? c.top : 0, z); if (p[0] > 0.02 && p[0] < 0.98 && p[1] > 0.08 && p[1] < 0.92) pts.push([p[0], p[1]]); }
      const boxes = [];
      for (const u of G.B.units) {
        if (!u.alive) continue; const n = G.actors.nodeOf && G.actors.nodeOf(u.uid); const x = n ? n.position.x : u.x; const z = n ? n.position.z : u.z;
        const h = u.boss ? 3.2 : 1.6; const r = u.boss ? 1.2 : 0.55; const cs = [];
        for (const dx of [-r, r]) for (const dz of [-r, r]) for (const y of [0, h]) cs.push(pr(x + dx, y, z + dz));
        if (cs.some((c) => c[2] > 1)) continue;
        const b = [Math.min(...cs.map((c) => c[0])), Math.min(...cs.map((c) => c[1])), Math.max(...cs.map((c) => c[0])), Math.max(...cs.map((c) => c[1]))];
        if (b[0] < 0 || b[1] < 0.05 || b[2] > 1 || b[3] > 1) continue; boxes.push(b);
      }
      return { pts, boxes, theme: H.world.theme.name, draws: H.stats.draws };
    });
    const full = path.join(OUT, `${tag}.png`); await page.locator('#frame').screenshot({ path: full });
    // the skills' effects (additive, sprites, points, drawn late) belong to the fx worker and change from frame to frame: the
    // light is judged on the floor and the units alone
    await page.evaluate(() => {
      const H = window.__G.host;
      H.scene.traverse((o) => { const m = o.material; const fx = o.isSprite || o.isPoints || o.renderOrder >= 4 || /^(fx-|tele|bossDodge|glow|motes)/.test(o.name || '') || (m && !Array.isArray(m) && m.blending === 2); if (fx && o !== H.scene) o.visible = false; });
      H.render();
    });
    const bare = path.join(OUT, `${tag}-units.png`); await page.locator('#frame').screenshot({ path: bare });
    await page.evaluate(() => { const H = window.__G.host; H.scene.children.forEach((o) => { if (o.isLight || o.isCamera) return; o.visible = ['island', 'abyss'].includes(o.name); }); H.render(); });
    const floor = path.join(OUT, `${tag}-floor.png`); await page.locator('#frame').screenshot({ path: floor });
    const m = measure(bare, floor, info.pts, info.boxes); const fw = measure(full, floor, [], []).white;
    const us = [...m.units].sort((p, q) => p - q); const med = us.length ? us[Math.floor(us.length / 2)] : 0; const low = us.filter((d) => d < UNIT_LOW).length / Math.max(1, us.length);
    const k = `${ph} chapter ${ch}${alt} (${info.theme})`;
    console.log(`${k}: floor ${m.floor.toFixed(0)} (p10 ${m.floorLo.toFixed(0)}, p90 ${m.floorHi.toFixed(0)})${m.floor >= DAY_FLOOR ? ' DAY' : ''}, white ${(m.white * 100).toFixed(2)}%, black ${(m.black * 100).toFixed(1)}%, units ${us.length} median ${med.toFixed(0)} low ${(low * 100).toFixed(0)}% (white with fx ${(fw * 100).toFixed(2)}%)`);
    check(m.white < 0.01, `${k}: clipped white ${(m.white * 100).toFixed(2)}% (< 1%)`);
    check(m.black < 0.08, `${k}: solid black ${(m.black * 100).toFixed(1)}% (< 8%)`);
    check(us.length >= 3 && med >= UNIT_MIN && low <= 0.15, `${k}: units read on the floor (${us.length} units, median colour distance ${med.toFixed(0)} >= ${UNIT_MIN}, ${(low * 100).toFixed(0)}% under ${UNIT_LOW} <= 15%)`);
    const bad = problems.filter((x) => !/Failed to load resource|\/js\/ui\//.test(x));
    check(bad.length === 0, `${k}: no console problems ${bad.slice(0, 2).join(' | ')}`);
    rows.push({ ph, ch, alt, theme: info.theme, ...m, units: us.length, med, low });
    await ctx.close();
  }
  for (const ph of PH) { const d = rows.filter((r) => r.ph === ph && !r.alt && r.floor >= DAY_FLOOR); if (CH.length === 10) check(d.length >= DAY_MIN, `${ph}: day chapters ${d.length} (>= ${DAY_MIN}): ${d.map((r) => r.theme).join(', ')}`); }
  fs.writeFileSync(path.join(OUT, `light-${Q}.json`), JSON.stringify(rows, null, 1));
} finally { await br.close(); srv.close(); }
console.log(`elapsed ${Math.round((Date.now() - T0) / 1000)} s`);
done();
