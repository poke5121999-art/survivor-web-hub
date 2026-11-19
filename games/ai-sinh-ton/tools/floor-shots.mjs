// The arena floor against Blockade Z's own ground, side by side. Captures Blockade Z (its page, rain, day) from our
// overview pitch and from our spectate chase angle, then every chapter of Ải Sinh Tồn the same way, composes the
// review sheets in .chk/floor/ and asserts: floor detail vs Blockade Z, no clipped white, a boss warning readable on
// every chapter, the hero ring readable, hero height, and the q=low budget against the values recorded before the
// floor change (.chk/floor/before.json, written once with --before).
// Usage: PLAYWRIGHT_PATH=... timeout 600 node games/ai-sinh-ton/tools/floor-shots.mjs [--before] [--bz] [--ch=1,3]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, launch, open as openPage, checker, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'floor');
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = path.join(OUT, 'before.json');
const argv = process.argv.slice(2);
const ONLY_BEFORE = argv.includes('--before');
const ONLY_BZ = argv.includes('--bz');
const chArg = (argv.find((a) => a.startsWith('--ch=')) || '').slice(5);
const CHAPTERS = chArg ? chArg.split(',').map(Number) : [1, 2, 3, 4, 5, 6];
const { check, done } = checker();
const T0 = Date.now();

// our camera rig (js/view/camera.js) and the band the HUD leaves free, in CSS px of the 360 x 780 frame
const PITCH = 47 * Math.PI / 180; const YAW = 0.6;
const BAND = [90, 610];
const LOW_Q = 'autostart=1&stage=3&autoult=1&autopick=1&noaudio=1&q=low&seed=3';

function py(src, ...args) { return execFileSync('python3', ['-c', src, ...args]).toString(); }

// mean over 16 x 16 CSS px cells of the luminance standard deviation inside the HUD-free band, and clipped white share
function detail(file) {
  return JSON.parse(py(`
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('L').resize((360, 780), Image.BILINEAR); px = im.load()
y0, y1 = ${BAND[0]}, ${BAND[1]}; cells = []
for cy in range(y0, y1 - 15, 16):
    for cx in range(0, 360 - 15, 16):
        v = [px[x, y] for y in range(cy, cy + 16) for x in range(cx, cx + 16)]
        m = sum(v) / len(v); cells.append((sum((a - m) ** 2 for a in v) / len(v)) ** 0.5)
rgb = Image.open(sys.argv[1]).convert('RGB'); W, H = rgb.size; p2 = rgb.load(); wh = 0; n = 0
for y in range(0, H, 3):
    for x in range(0, W, 3):
        r, g, b = p2[x, y]; n += 1
        if min(r, g, b) >= 250: wh += 1
print(json.dumps({'std': sum(cells) / len(cells), 'white': wh / n}))`, file));
}
// mean colour in a disc (frame fractions, radius in CSS px)
function meanAt(file, fx, fy, rad) {
  return JSON.parse(py(`
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); W, H = im.size; px = im.load(); k = W / 360.0
cx = float(sys.argv[2]) * W; cy = float(sys.argv[3]) * H; r = float(sys.argv[4]) * k; s = [0, 0, 0]; n = 0
for y in range(int(cy - r), int(cy + r) + 1):
    for x in range(int(cx - r), int(cx + r) + 1):
        if 0 <= x < W and 0 <= y < H and (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
            c = px[x, y]; s = [s[i] + c[i] for i in range(3)]; n += 1
print(json.dumps([v / max(1, n) for v in s]))`, file, String(fx), String(fy), String(rad)));
}
// labelled side-by-side sheet: rows of [label, file] pairs
function compose(rows, out, cellW) {
  py(`
import sys, json
from PIL import Image, ImageDraw
rows = json.loads(sys.argv[2]); W = int(sys.argv[3]); cells = []
for row in rows:
    r = []
    for label, f in row:
        im = Image.open(f).convert('RGB'); im = im.resize((W, int(im.height * W / im.width))); d = ImageDraw.Draw(im)
        d.rectangle([0, 0, W, 26], fill=(0, 0, 0)); d.text((8, 7), label, fill=(255, 255, 255)); r.append(im)
    cells.append(r)
H = max(im.height for r in cells for im in r); C = max(len(r) for r in cells)
s = Image.new('RGB', (C * W + (C + 1) * 8, len(cells) * H + (len(cells) + 1) * 8), (18, 18, 22))
for j, r in enumerate(cells):
    for i, im in enumerate(r): s.paste(im, (8 + i * (W + 8), 8 + j * (H + 8)))
s.save(sys.argv[1])`, out, JSON.stringify(rows), String(cellW));
}

const srv = await serve();
const br = await launch();
const shot = async (page, name, sel) => { const f = path.join(OUT, name); await (sel ? page.locator(sel).screenshot({ path: f }) : page.screenshot({ path: f })); return f; };

async function lowStats() {
  const { ctx, page } = await openPage(br, srv.base, 's22', LOW_Q);
  await page.evaluate(() => window.__sim(6)); await page.evaluate(() => window.__step(3));
  const st = await page.evaluate(() => { const H = window.__G.host; return { ...window.__stats, post: !!H.G.post.on, floorMeshes: H.floorMeshes || 1 }; });
  await ctx.close();
  return st;
}

// Blockade Z on its own page: rain, daylight, medium tier; the frame loop is stopped and one frame drawn from our rig
async function captureBZ(rig) {
  const { ctx, page, problems } = await openPage(br, srv.base, 's22', 'autostart=1&nolock=1&noaudio=1&seed=3&weather=rain&tod=0.45&q=medium', { path: '/games/blockade-z/index.html', fresh: true });
  await page.waitForFunction(() => window.__G && window.__G.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => window.__sim(6));
  const draw = (cam) => page.evaluate(([c, P, Y]) => {
    const G = window.__G; G.renderer.setAnimationLoop(null);
    // the HUD and the "rotate your phone" sheet are DOM on top of the canvas: lift the canvas over them
    const cv = G.renderer.domElement; cv.style.position = 'fixed'; cv.style.inset = '0'; cv.style.zIndex = '99999';
    const C = G.camera; C.fov = c.fov; C.aspect = innerWidth / innerHeight; C.near = 0.1;
    if (c.over) C.position.set(c.fx + Math.sin(Y) * Math.cos(P) * c.d, Math.sin(P) * c.d, c.fz + Math.cos(Y) * Math.cos(P) * c.d);
    else C.position.set(c.px, c.py, c.pz);
    C.lookAt(c.lx, c.ly, c.lz); C.updateMatrixWorld(true); C.updateProjectionMatrix();
    if (G.weapons && G.weapons.S) G.weapons.S.hidden = true;
    for (let i = 0; i < 3; i++) { if (G.post.on) { G.post.begin(); G.renderer.render(G.scene, C); G.post.end(); } else { G.renderer.clear(); G.renderer.render(G.scene, C); } }
  }, [cam, PITCH, YAW]);
  await draw({ over: true, fov: 30, d: rig.dist, fx: 0, fz: 10, lx: 0, ly: 0, lz: 10 });
  const over = await shot(page, 'bz-overview.png');
  await draw({ over: false, fov: 58, px: 2, py: 4.6, pz: 16.5, lx: 2, ly: 0.8, lz: 6 });
  const close = await shot(page, 'bz-close.png');
  await ctx.close();
  return { over, close, problems };
}

const hidden = async (page) => page.evaluate(() => { const G = window.__G; const sc = G && G.screens && G.screens[G.screen]; if (sc && sc.hide) sc.hide(); });

try {
  if (ONLY_BEFORE) {
    const st = await lowStats();
    fs.writeFileSync(BEFORE, JSON.stringify(st, null, 1));
    console.log('before (q=low s22 stage 3):', JSON.stringify(st));
  } else {
    // ours first: the rig distance of chapter 1 is what Blockade Z is shot from
    const ours = {}; let rig = null; const fails = [];
    for (const ch of CHAPTERS) {
      const stage = (ch - 1) * 5 + 2;
      const { ctx, page, problems } = await openPage(br, srv.base, 's22', `autostart=1&stage=${stage}&autoult=1&autopick=1&noaudio=1&seed=3`);
      await hidden(page);
      await page.evaluate(() => window.__sim(8)); await page.evaluate(() => window.__step(4));
      await page.evaluate(() => { window.__G.paused = true; });
      const info = await page.evaluate(() => {
        const G = window.__G; const H = G.host; const a = new H.THREE.Vector3(); const b = new H.THREE.Vector3(); const hs = [];
        for (const u of G.B.heroes) { if (!u.alive) continue; const n = G.actors.nodeOf(u.uid); a.set(n.position.x, 0, n.position.z).project(H.camera); b.set(n.position.x, 2.7, n.position.z).project(H.camera); hs.push(Math.abs(b.y - a.y) / 2 * H.size.h); }
        const h0 = G.B.heroes.find((u) => u.alive); const n0 = G.actors.nodeOf(h0.uid);
        const pr = (x, z) => { a.set(x, 0, z).project(H.camera); return [(a.x + 1) / 2, (1 - a.y) / 2]; };
        const ringR = 0.71 * (n0.scale ? 1 : 1);
        return { hs, dist: G.cam.dist, focus: [G.cam.focus.x, G.cam.focus.z], hero: pr(n0.position.x, n0.position.z), ringPts: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => pr(n0.position.x + Math.cos(k * 0.785) * ringR, n0.position.z + Math.sin(k * 0.785) * ringR)), floorPt: pr(n0.position.x + 2.6, n0.position.z + 1.2), uid: h0.uid, fx: G.cam.focus.x, fz: G.cam.focus.z, chapter: G.B.stage.chapter };
      });
      if (ch === CHAPTERS[0]) rig = info;
      const over = await shot(page, `ours-c${ch}-overview.png`, '#frame');
      // a boss warning circle injected next to the focus: centre colour before and while it fills
      const wx = info.fx + 2.2; const wz = info.fz - 1.5;
      const at = await page.evaluate(([x, z]) => { const H = window.__G.host; const v = new H.THREE.Vector3(x, 0, z).project(H.camera); return [(v.x + 1) / 2, (1 - v.y) / 2]; }, [wx, wz]);
      const beforeF = await shot(page, `ours-c${ch}-warn0.png`, '#frame');
      await page.evaluate(([x, z]) => { window.__G.actors.marks.tele({ team: 1, shape: 'circle', x, z, r: 2.2, t: 3 }); window.__step(45); }, [wx, wz]);
      const duringF = await shot(page, `ours-c${ch}-warn1.png`, '#frame');
      const c0 = meanAt(beforeF, at[0], at[1], 10); const c1 = meanAt(duringF, at[0], at[1], 10);
      const rb = (c) => c[0] - c[2]; const dist3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      check(rb(c1) - rb(c0) > 12 || dist3(c0, c1) > 40, `chapter ${ch}: boss warning visible at its centre (red-blue ${rb(c0).toFixed(0)} -> ${rb(c1).toFixed(0)}, colour shift ${dist3(c0, c1).toFixed(0)})`);
      // the hero's team ring against the floor next to it
      // the ring is often half hidden by the hero's own legs or a cast: the best of eight points around it must stand out
      const fl = meanAt(over, info.floorPt[0], info.floorPt[1], 6);
      const rd = Math.max(...info.ringPts.map((q) => dist3(meanAt(over, q[0], q[1], 1.6), fl)));
      check(rd > 40, `chapter ${ch}: hero ring reads on the floor (colour distance ${rd.toFixed(0)} > 40)`);
      const d = detail(over);
      check(d.white < 0.01, `chapter ${ch}: clipped white ${(d.white * 100).toFixed(2)}% (< 1%)`);
      check(Math.min(...info.hs) >= 48, `chapter ${ch}: hero height ${Math.min(...info.hs).toFixed(0)}..${Math.max(...info.hs).toFixed(0)} px (>= 48)`);
      await page.evaluate(([u]) => { window.__G.paused = false; window.__G.cam.spectate(u); window.__step(80); window.__G.paused = true; }, [info.uid]);
      const close = await shot(page, `ours-c${ch}-close.png`, '#frame');
      const bad = problems.filter((x) => !/Failed to load resource|\/js\/ui\//.test(x));
      check(bad.length === 0, `chapter ${ch}: no console problems ${bad.slice(0, 2).join(' | ')}`);
      ours[ch] = { over, close, std: d.std, hs: info.hs };
      await ctx.close();
    }
    const bz = await captureBZ(rig || { dist: 40 });
    const db = detail(bz.over);
    console.log(`Blockade Z overview: detail ${db.std.toFixed(2)}, clipped white ${(db.white * 100).toFixed(2)}%  (rig dist ${rig ? rig.dist.toFixed(1) : '?'})`);
    for (const ch of CHAPTERS) check(ours[ch].std >= db.std * 0.6, `chapter ${ch}: floor detail ${ours[ch].std.toFixed(2)} vs Blockade Z ${db.std.toFixed(2)} (ratio ${(ours[ch].std / db.std).toFixed(2)} >= 0.60)`);
    {
      const c1 = CHAPTERS[0];
      compose([[['Blockade Z (rain, day)', bz.over], [`Ai Sinh Ton chapter ${c1}`, ours[c1].over]]], path.join(OUT, 'side-overview.png'), 540);
      compose([[['Blockade Z close', bz.close], [`Ai Sinh Ton chapter ${c1} spectate`, ours[c1].close]]], path.join(OUT, 'side-close.png'), 540);
      compose([CHAPTERS.map((c) => [`chapter ${c}`, ours[c].over]), CHAPTERS.map((c) => [`chapter ${c} close`, ours[c].close])], path.join(OUT, 'chapters.png'), 300);
    }
    // the q=low budget (skipped by --bz, the quick look)
    const st = ONLY_BZ ? null : await lowStats();
    if (st) {
    let before = null; try { before = JSON.parse(fs.readFileSync(BEFORE, 'utf8')); } catch (e) { before = null; }
    check(st.scale >= 1, `q=low render scale ${st.scale.toFixed(2)} >= 1`);
    check(!st.post, `q=low: no full-screen post pass (post ${st.post ? 'on' : 'off'})`);
    if (before) {
      check(st.draws <= before.draws * 1.25, `q=low draw calls ${st.draws} (before ${before.draws}, limit ${Math.floor(before.draws * 1.25)})`);
      check(st.tris <= before.tris * 1.25, `q=low triangles ${st.tris} (before ${before.tris}, limit ${Math.floor(before.tris * 1.25)})`);
    } else check(false, 'q=low before values: .chk/floor/before.json not readable (run --before on the old floor)');
    }
    void fails;
  }
} finally {
  await br.close(); srv.close();
}
console.log(`elapsed ${Math.round((Date.now() - T0) / 1000)} s`);
done();
