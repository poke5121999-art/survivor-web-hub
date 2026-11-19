// The arena floor against the old Blockade Z's ground (box town, before the voxel switch), side by side. Captures the old
// game (its page, clear and rain at its default hour, and clear noon) from our overview pitch and from our spectate chase
// angle, then every chapter of Ải Sinh Tồn in rain and clear the same way, composes the review sheets in .chk/floor/ and
// asserts: floor detail vs the old Blockade Z in the same weather, no clipped white, a boss warning readable on
// every chapter, the hero ring readable, hero height, and the q=low budget against the values recorded before the
// floor change (.chk/floor/before.json, written once with --before).
// Usage: PLAYWRIGHT_PATH=... timeout 600 node games/ai-sinh-ton/tools/floor-shots.mjs [--before] [--quick] [--ch=1,3]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, launch, open as openPage, checker, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'floor');
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = path.join(OUT, 'before.json');
const argv = process.argv.slice(2);
const ONLY_BEFORE = argv.includes('--before');
const QUICK = argv.includes('--quick'); // no q=low budget run
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

// The old Blockade Z (box town, rev 20261114za, extracted read-only under .chk/bz-old): the floor the owner means. Its
// default is night (tod 0.8) and wave 1 is always clear, so `clear` is the look a player first sees; `rain` is the same
// hour in rain; `day` is noon, clear, for reference. Medium tier. The frame loop is stopped and one frame drawn from our rig.
const OLD_PATH = '/.chk/bz-old/games/blockade-z/index.html';
const OLD_LOOKS = { clear: 'weather=clear', rain: 'weather=rain', day: 'weather=clear&tod=0.45' };
async function captureOld(rig, look) {
  const { ctx, page, problems } = await openPage(br, srv.base, 's22', `autostart=1&nolock=1&noaudio=1&seed=3&q=medium&${OLD_LOOKS[look]}`, { path: OLD_PATH, fresh: true });
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
    // its fog is tuned for an eye 1.7 m up (starts 12 m out): from our overview distance it would hide the whole
    // floor, so the fog moves out by the extra distance and the ground looks as it does to its own player 8 m away
    const F = G.scene.fog; if (F) { if (F.n0 === undefined) { F.n0 = F.near; F.f0 = F.far; } const k = c.over ? c.d - 8 : 0; F.near = F.n0 + k; F.far = F.f0 + k; }
    for (let i = 0; i < 3; i++) { if (G.post.on) { G.post.begin(); G.renderer.render(G.scene, C); G.post.end(); } else { G.renderer.clear(); G.renderer.render(G.scene, C); } }
  }, [cam, PITCH, YAW]);
  await draw({ over: true, fov: 30, d: rig.dist, fx: 0, fz: 10, lx: 0, ly: 0, lz: 10 });
  const over = await shot(page, `old-${look}-overview.png`);
  await draw({ over: false, fov: 58, px: 2, py: 4.6, pz: 16.5, lx: 2, ly: 0.8, lz: 6 });
  const close = await shot(page, `old-${look}-close.png`);
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
    // ours first, in rain (the game's weather) and clear (?weather=clear): the rig distance of the first chapter is what
    // the old Blockade Z is shot from
    const ours = {}; let rig = null;
    const rb = (c) => c[0] - c[2]; const dist3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    for (const ch of CHAPTERS) for (const wx of ['rain', 'clear']) {
      const stage = (ch - 1) * 5 + 2; const tag = `c${ch}-${wx}`;
      const { ctx, page, problems } = await openPage(br, srv.base, 's22', `autostart=1&stage=${stage}&autoult=1&autopick=1&noaudio=1&seed=3${wx === 'clear' ? '&weather=clear' : ''}`);
      await hidden(page);
      await page.evaluate(() => window.__sim(8)); await page.evaluate(() => window.__step(4));
      await page.evaluate(() => { window.__G.paused = true; });
      const info = await page.evaluate(() => {
        const G = window.__G; const H = G.host; const a = new H.THREE.Vector3(); const b = new H.THREE.Vector3(); const hs = [];
        for (const u of G.B.heroes) { if (!u.alive) continue; const n = G.actors.nodeOf(u.uid); a.set(n.position.x, 0, n.position.z).project(H.camera); b.set(n.position.x, 2.7, n.position.z).project(H.camera); hs.push(Math.abs(b.y - a.y) / 2 * H.size.h); }
        const h0 = G.B.heroes.find((u) => u.alive); const n0 = G.actors.nodeOf(h0.uid);
        const pr = (x, z) => { a.set(x, 0, z).project(H.camera); return [(a.x + 1) / 2, (1 - a.y) / 2]; };
        const ringR = 0.71;
        return { hs, dist: G.cam.dist, ringPts: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => pr(n0.position.x + Math.cos(k * 0.785) * ringR, n0.position.z + Math.sin(k * 0.785) * ringR)), floorPt: pr(n0.position.x + 2.6, n0.position.z + 1.2), uid: h0.uid, fx: G.cam.focus.x, fz: G.cam.focus.z };
      });
      if (!rig) rig = info;
      const over = await shot(page, `ours-${tag}-overview.png`, '#frame');
      const d = detail(over);
      check(d.white < 0.01, `${tag}: clipped white ${(d.white * 100).toFixed(2)}% (< 1%)`);
      if (wx === 'rain') {
        // a boss warning circle injected next to the focus: centre colour before and while it fills
        const px = info.fx + 2.2; const pz = info.fz - 1.5;
        const at = await page.evaluate(([x, z]) => { const H = window.__G.host; const v = new H.THREE.Vector3(x, 0, z).project(H.camera); return [(v.x + 1) / 2, (1 - v.y) / 2]; }, [px, pz]);
        const beforeF = await shot(page, `ours-${tag}-warn0.png`, '#frame');
        await page.evaluate(([x, z]) => { window.__G.actors.marks.tele({ team: 1, shape: 'circle', x, z, r: 2.2, t: 3 }); window.__step(45); }, [px, pz]);
        const duringF = await shot(page, `ours-${tag}-warn1.png`, '#frame');
        const c0 = meanAt(beforeF, at[0], at[1], 10); const c1 = meanAt(duringF, at[0], at[1], 10);
        check(rb(c1) - rb(c0) > 12, `chapter ${ch}: boss warning visible at its centre (red-blue ${rb(c0).toFixed(0)} -> ${rb(c1).toFixed(0)}, diff > 12)`);
        // the ring is often half hidden by the hero's own legs or a cast: the best of eight points around it must stand out
        const fl = meanAt(over, info.floorPt[0], info.floorPt[1], 6);
        const rd = Math.max(...info.ringPts.map((q) => dist3(meanAt(over, q[0], q[1], 1.6), fl)));
        check(rd > 40, `chapter ${ch}: hero ring reads on the floor (colour distance ${rd.toFixed(0)} > 40)`);
        check(Math.min(...info.hs) >= 48, `chapter ${ch}: hero height ${Math.min(...info.hs).toFixed(0)}..${Math.max(...info.hs).toFixed(0)} px (>= 48)`);
      }
      await page.evaluate(([u]) => { window.__G.paused = false; window.__G.cam.spectate(u); window.__step(80); window.__G.paused = true; }, [info.uid]);
      const close = await shot(page, `ours-${tag}-close.png`, '#frame');
      const bad = problems.filter((x) => !/Failed to load resource|\/js\/ui\//.test(x));
      check(bad.length === 0, `${tag}: no console problems ${bad.slice(0, 2).join(' | ')}`);
      ours[tag] = { over, close, std: d.std };
      await ctx.close();
    }
    const old = {};
    for (const look of Object.keys(OLD_LOOKS)) {
      old[look] = await captureOld(rig || { dist: 45 }, look); old[look].d = detail(old[look].over);
      console.log(`old Blockade Z ${look}: detail ${old[look].d.std.toFixed(2)}, clipped white ${(old[look].d.white * 100).toFixed(2)}%  (rig dist ${rig ? rig.dist.toFixed(1) : '?'})`);
    }
    for (const ch of CHAPTERS) for (const wx of ['rain', 'clear']) {
      const o = ours[`c${ch}-${wx}`].std; const b = old[wx].d.std;
      check(o >= b * 0.6, `chapter ${ch} ${wx}: floor detail ${o.toFixed(2)} vs old Blockade Z ${b.toFixed(2)} (ratio ${(o / b).toFixed(2)} >= 0.60)`);
    }
    const c1 = CHAPTERS[0];
    for (const wx of ['rain', 'clear']) {
      compose([[[`old Blockade Z, ${wx}, its default hour`, old[wx].over], [`Ai Sinh Ton chapter ${c1}, ${wx}`, ours[`c${c1}-${wx}`].over]]], path.join(OUT, `side-overview-${wx}.png`), 540);
      compose([[[`old Blockade Z close, ${wx}`, old[wx].close], [`Ai Sinh Ton chapter ${c1} spectate, ${wx}`, ours[`c${c1}-${wx}`].close]]], path.join(OUT, `side-close-${wx}.png`), 540);
    }
    compose([[['old Blockade Z, clear noon', old.day.over], ['old Blockade Z, clear noon, close', old.day.close]]], path.join(OUT, 'old-day.png'), 540);
    compose(['rain', 'clear'].flatMap((wx) => [CHAPTERS.map((c) => [`chapter ${c} ${wx}`, ours[`c${c}-${wx}`].over]), CHAPTERS.map((c) => [`chapter ${c} ${wx} close`, ours[`c${c}-${wx}`].close])]), path.join(OUT, 'chapters.png'), 300);
    // the q=low budget (skipped by --quick)
    const st = QUICK ? null : await lowStats();
    if (st) {
    let before = null; try { before = JSON.parse(fs.readFileSync(BEFORE, 'utf8')); } catch (e) { before = null; }
    check(st.scale >= 1, `q=low render scale ${st.scale.toFixed(2)} >= 1`);
    check(!st.post, `q=low: no full-screen post pass (post ${st.post ? 'on' : 'off'})`);
    if (before) {
      check(st.draws <= before.draws * 1.25, `q=low draw calls ${st.draws} (before ${before.draws}, limit ${Math.floor(before.draws * 1.25)})`);
      check(st.tris <= before.tris * 1.25, `q=low triangles ${st.tris} (before ${before.tris}, limit ${Math.floor(before.tris * 1.25)})`);
    } else check(false, 'q=low before values: .chk/floor/before.json not readable (run --before on the old floor)');
    }
  }
} finally {
  await br.close(); srv.close();
}
console.log(`elapsed ${Math.round((Date.now() - T0) / 1000)} s`);
done();
