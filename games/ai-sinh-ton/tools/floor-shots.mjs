// The battle floor per chapter (the block island of js/view/pad.js and world.js), overview and spectate close-up, at s22.
// Asserts per chapter: no clipped white (< 1%), a boss warning readable on the floor, the hero ring readable, the hero's
// height at the arena centre, and the look checks of the island (flat 24 px cells <= 3%, warm pixels 0.5..12%, at least
// 4 warm sources in the frame). The deeper look checks (outline, depth, spawns, cost) live in arena-look-test.mjs.
// Sheet: .chk/floor/chapters.png (overview and close-up per chapter).
// Usage: PLAYWRIGHT_PATH=... timeout 600 node games/ai-sinh-ton/tools/floor-shots.mjs [--ch=1,3]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, launch, open as openPage, checker, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'floor');
fs.mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const chArg = (argv.find((a) => a.startsWith('--ch=')) || '').slice(5);
const CHAPTERS = chArg ? chArg.split(',').map(Number) : [1, 2, 3, 4, 5, 6];
const { check, done } = checker();
const T0 = Date.now();

function py(src, ...args) { return execFileSync('python3', ['-c', src, ...args]).toString(); }

// clipped white, flat 24 px cells and warm pixel share over the whole frame (design px of the 780 wide frame)
function stats(file) {
  return JSON.parse(py(`
import sys, json, colorsys
from PIL import Image
rgb = Image.open(sys.argv[1]).convert('RGB'); W = 780; Hh = int(rgb.height * 780 / rgb.width)
sm = rgb.resize((W, Hh), Image.BILINEAR); L = sm.convert('L').load(); p = sm.load(); n = flat = 0
for cy in range(0, Hh - 23, 24):
    for cx in range(0, W - 23, 24):
        v = [L[x, y] for y in range(cy, cy + 24, 2) for x in range(cx, cx + 24, 2)]
        m = sum(v) / len(v); n += 1; flat += (sum((a - m) ** 2 for a in v) / len(v)) ** 0.5 < 1.5
wh = warm = tot = 0
for y in range(0, Hh, 2):
    for x in range(0, W, 2):
        r, g, b = p[x, y]; tot += 1; h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if min(r, g, b) >= 250: wh += 1
        if 15 <= h * 360 <= 55 and s > 0.35 and v > 0.5: warm += 1
print(json.dumps({'white': wh / tot, 'flat': flat / n, 'warm': warm / tot}))`, file));
}
// mean colour in a disc (frame fractions, radius in design px)
function meanAt(file, fx, fy, rad) {
  return JSON.parse(py(`
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); W, H = im.size; px = im.load(); k = W / 780.0
cx = float(sys.argv[2]) * W; cy = float(sys.argv[3]) * H; r = float(sys.argv[4]) * k; s = [0, 0, 0]; n = 0
for y in range(int(cy - r), int(cy + r) + 1):
    for x in range(int(cx - r), int(cx + r) + 1):
        if 0 <= x < W and 0 <= y < H and (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
            c = px[x, y]; s = [s[i] + c[i] for i in range(3)]; n += 1
print(json.dumps([v / max(1, n) for v in s]))`, file, String(fx), String(fy), String(rad)));
}
function compose(rows, out, cellW) {
  py(`
import sys, json
from PIL import Image, ImageDraw
rows = json.loads(sys.argv[2]); W = int(sys.argv[3]); cells = []
for row in rows:
    r = []
    for label, f in row:
        im = Image.open(f).convert('RGB'); im = im.resize((W, int(im.height * W / im.width))); d = ImageDraw.Draw(im)
        d.rectangle([0, 0, W, 20], fill=(0, 0, 0)); d.text((6, 5), label, fill=(255, 255, 255)); r.append(im)
    cells.append(r)
H = max(im.height for r in cells for im in r); C = max(len(r) for r in cells)
s = Image.new('RGB', (C * W + (C + 1) * 8, len(cells) * H + (len(cells) + 1) * 8), (18, 18, 22))
for j, r in enumerate(cells):
    for i, im in enumerate(r): s.paste(im, (8 + i * (W + 8), 8 + j * (H + 8)))
s.save(sys.argv[1])`, out, JSON.stringify(rows), String(cellW));
}

const srv = await serve();
const br = await launch();
const shot = async (page, name) => { const f = path.join(OUT, name); await page.locator('#frame').screenshot({ path: f }); return f; };

try {
  const rows = []; const rb = (c) => c[0] - c[2]; const dist3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  for (const ch of CHAPTERS) {
    const stage = (ch - 1) * 5 + 2; const tag = `c${ch}`;
    const { ctx, page, problems } = await openPage(br, srv.base, 's22', `autostart=1&stage=${stage}&autoult=1&autopick=1&noaudio=1&seed=3`);
    await page.evaluate(() => { const H = window.__G.host; if (!H.__r) { H.__r = H.render; H.render = () => H.__r(null); } });
    await page.evaluate(() => window.__sim(8)); await page.evaluate(() => window.__step(4));
    await page.evaluate(() => { window.__G.paused = true; });
    const info = await page.evaluate(() => {
      const G = window.__G; const H = G.host; const a = new H.THREE.Vector3(); const b = new H.THREE.Vector3(); const hs = [];
      for (const u of G.B.heroes) { if (!u.alive) continue; const n = G.actors.nodeOf(u.uid); a.set(n.position.x, 0, n.position.z).project(H.camera); b.set(n.position.x, 2.7, n.position.z).project(H.camera); hs.push(Math.abs(b.y - a.y) / 2 * H.size.h / H.size.u); }
      a.set(0, 0, 0).project(H.camera); b.set(0, 2.7, 0).project(H.camera); const hc = Math.abs(b.y - a.y) / 2 * H.size.h / H.size.u;
      const h0 = G.B.heroes.find((u) => u.alive); const n0 = G.actors.nodeOf(h0.uid);
      const pr = (x, z) => { a.set(x, 0, z).project(H.camera); return [(a.x + 1) / 2, (1 - a.y) / 2]; };
      const ringR = 0.71;
      const warm = H.world.lights().filter((L) => { if (!L.warm) return false; a.set(L.x, L.y, L.z).project(H.camera); const y = (1 - a.y) / 2 * H.size.h / H.size.u; return a.z < 1 && Math.abs(a.x) <= 1 && y >= 40 && a.y >= -1; }).length;
      return { hs, hc, warm, ringPts: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => pr(n0.position.x + Math.cos(k * 0.785) * ringR, n0.position.z + Math.sin(k * 0.785) * ringR)), floorPt: pr(n0.position.x + 2.6, n0.position.z + 1.2), uid: h0.uid, theme: H.world.theme.name };
    });
    const over = await shot(page, `ours-${tag}-overview.png`);
    const d = stats(over);
    const k = `chapter ${ch} (${info.theme})`;
    check(d.white < 0.01, `${k}: clipped white ${(d.white * 100).toFixed(2)}% (< 1%)`);
    check(d.flat <= 0.03, `${k}: flat 24 px cells ${(d.flat * 100).toFixed(2)}% (<= 3%)`);
    check(d.warm >= 0.005 && d.warm <= 0.12, `${k}: warm pixels ${(d.warm * 100).toFixed(2)}% (0.5..12%)`);
    check(info.warm >= 4, `${k}: warm light sources in the frame ${info.warm} (>= 4)`);
    // a boss warning circle injected near the centre: centre colour before and while it fills
    const px = 2.2; const pz = -1.5;
    const at = await page.evaluate(([x, z]) => { const H = window.__G.host; const v = new H.THREE.Vector3(x, 0, z).project(H.camera); return [(v.x + 1) / 2, (1 - v.y) / 2]; }, [px, pz]);
    const beforeF = await shot(page, `ours-${tag}-warn0.png`);
    await page.evaluate(([x, z]) => { window.__G.actors.marks.tele({ team: 1, shape: 'circle', x, z, r: 2.2, t: 3 }); window.__step(45); }, [px, pz]);
    const duringF = await shot(page, `ours-${tag}-warn1.png`);
    const c0 = meanAt(beforeF, at[0], at[1], 10); const c1 = meanAt(duringF, at[0], at[1], 10);
    check(rb(c1) - rb(c0) > 12, `${k}: boss warning visible at its centre (red-blue ${rb(c0).toFixed(0)} -> ${rb(c1).toFixed(0)}, diff > 12)`);
    const fl = meanAt(over, info.floorPt[0], info.floorPt[1], 6);
    const rd = Math.max(...info.ringPts.map((q) => dist3(meanAt(over, q[0], q[1], 1.6), fl)));
    check(rd > 40, `${k}: hero ring reads on the floor (colour distance ${rd.toFixed(0)} > 40)`);
    check(info.hc >= 40, `${k}: hero height at the arena centre ${info.hc.toFixed(0)} design px (>= 40); heroes now ${Math.min(...info.hs).toFixed(0)}..${Math.max(...info.hs).toFixed(0)}`);
    await page.evaluate(([u]) => { window.__G.paused = false; window.__G.cam.spectate(u); window.__step(80); window.__G.paused = true; }, [info.uid]);
    const close = await shot(page, `ours-${tag}-close.png`);
    const bad = problems.filter((x) => !/Failed to load resource|\/js\/ui\//.test(x));
    check(bad.length === 0, `${k}: no console problems ${bad.slice(0, 2).join(' | ')}`);
    rows.push([[`${k} overview`, over], [`${k} spectate`, close]]);
    await ctx.close();
  }
  compose(rows, path.join(OUT, 'chapters.png'), 520); console.log('sheet: ' + path.join(OUT, 'chapters.png'));
} finally {
  await br.close(); srv.close();
}
console.log(`elapsed ${Math.round((Date.now() - T0) / 1000)} s`);
done();
