// Gió (katana, two hands) and his skills, seen from the game camera at s22 and xiaomi.
// Per skill (attack, dash, whirl, ult): a deterministic capture (sim tick plus two view steps per frame, no juice), a strip of 12
// frames 66 ms apart into .chk/gio/<skill>-<phone>.png, the whole run encoded at 30 fps into .chk/gio/<skill>.webm (ffmpeg),
// and measured assertions. The ultimate is also run live in real time for hit-stops, freeze and push (juice on, wall clock).
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/gio-shots.mjs [--only=attack,dash,whirl,ult] [--phones=s22,xiaomi] [--no-katana]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, launch, open as openPage, checker, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'gio');
const TMP = path.join(OUT, 'tmp');
fs.mkdirSync(TMP, { recursive: true });
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const SKILLS = arg('only', 'attack,dash,whirl,ult').split(',');
const PHONES = arg('phones', 's22,xiaomi').split(',');
const { check, done } = checker();
const bad = (list) => list.filter((x) => !/Failed to load resource|favicon/.test(x));
const TEAM = ['gio'];

// ---------- page side ----------
const PREP = async ([need]) => {
  const G = window.__G;
  const v = (document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0];
  window.__SIM = await import(new URL('js/sim/battle.js' + v, location.href).href);
  const sc = G.screens && G.screens[G.screen]; if (sc && sc.hide) sc.hide();
  G.paused = true; G.speed = 1; if (G.juice) { G.juice.reset(); G.juice.enabled = false; }
  const B = G.start(3, { seed: 9, wave: 3, team: ['gio'], hpFlat: 90000, atkFlat: 0, mul: 0.5, auto: { ult: false, pick: 'best' } });
  const SIM = window.__SIM; const hero = B.heroes[0];
  for (const u of B.heroes.slice(1)) for (const s of u.skills) s.cd = 99999;
  const near = (r) => B.enemies.filter((e) => e.alive && Math.hypot(e.x - hero.x, e.z - hero.z) < r).length;
  const cluster = () => { let m = 0; for (const a of B.enemies) { if (!a.alive || Math.hypot(a.x - hero.x, a.z - hero.z) > 11) continue; let n = 0; for (const b of B.enemies) if (b.alive && Math.hypot(a.x - b.x, a.z - b.z) <= 3.2) n++; m = Math.max(m, n); } return m; };
  const ok = { attack: () => hero.anim === 'attack', dash: () => near(6) >= 4 && B.byUid.get(hero.target), whirl: () => cluster() >= 4, ult: () => B.enemies.filter((e) => e.alive).length >= 14 && near(8) >= 3 }[need];
  let i = 0;
  for (; i < 3000 && B.phase === 'fight'; i++) { SIM.step(B); if (i > 90 && ok()) break; }
  G.fx.clear(); G.actors.marks.clear(); window.__step(3);
  window.__base = { f: 0 };
  return { phase: B.phase, ticks: i, near: near(6), cluster: cluster(), enemies: B.enemies.filter((e) => e.alive).length };
};

const CAST = async ([slot]) => {
  const G = window.__G; const B = G.B; const SIM = window.__SIM; const u = B.heroes[0];
  window.__ev = []; G.on((e) => { if (e.uid === u.uid || e.by === u.uid) window.__ev.push({ ...e, bt: B.t }); });
  if (slot === 'attack') return { ok: true };
  if (slot === 'ult') { u.ult = 1; u.ultReady = true; return { ok: SIM.castUlt(B, 0), n: B.enemies.filter((e) => e.alive).length }; }
  const skill = u.skills.find((s) => s.slot === slot); if (!skill) return { ok: false, why: 'no skill' };
  for (const s of u.skills) s.cd = s === skill ? 0 : 99999;
  skill.def = { ...skill.def, when: null };
  let seen = false; G.on((e) => { if (e.e === 'cast' && e.uid === u.uid) seen = true; });
  for (let i = 0; i < 12 && !seen; i++) { u.lockT = 0; skill.cd = 0; SIM.step(B); }
  return { ok: seen };
};

// one frame of the capture: a sim tick, two view steps, and what the effects look like right now
const FRAME = () => {
  const G = window.__G; const B = G.B; const A = G.actors; const M = A.marks;
  if (B.phase === 'fight') window.__SIM.step(B);
  window.__step(2);
  const st = M.stats(); let whirlTop = 0;
  for (const w of M.vertical.whirl) if (w.on && w.mesh.material.opacity > 0.03) whirlTop = Math.max(whirlTop, w.mesh.position.y + w.mesh.scale.y);
  const dashLen = M.ribs.filter((r) => r.on && r.kind === 'dash').map((r) => r.len);
  const lifted = []; for (const uid of A.lifts.keys()) { const hs = A.horde.states.get(uid); const n = A.nodeOf(uid); lifted.push(hs ? hs.py : n ? n.position.y : 0); }
  return { t: B.t, arcs: st.arcs, ghosts: st.ghosts, streaks: st.streaks, whirls: st.whirls, leaves: st.leaves, whirlTop, dashLen, liftN: lifted.filter((y) => y >= 0.6).length, liftMax: Math.max(0, ...lifted), lifts: lifted.length, cuts: A.fx.counters.gio_slash || 0, dashHits: A.fx.counters.gio_dash_hit || 0, whirlN: A.fx.counters.gio_whirl || 0 };
};

const GROUND = () => {
  const G = window.__G; const s = G.actors.marks.stats(); const d = G.fx.debug();
  return { ground: s.rings + s.flares + s.strips + (s.pillars || 0) + (s.walls || 0) + (s.flashes || 0) + s.ribbons + s.ghosts + s.whirls, leaves: s.leaves, lifts: G.actors.lifts.size, splats: d.liveSplats, scorch: d.liveScorch, children: G.host.scene.children.length };
};

// real time: the ultimate with juice on, wall-clock hit-stops, push and freeze
const LIVE = async ([opt]) => {
  const G = window.__G; const J = G.juice; const B = G.B; const SIM = window.__SIM;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  G.start(3, { seed: 9, wave: 3, team: ['gio'], hpFlat: 90000, atkFlat: 0, mul: 0.5, auto: { ult: false, pick: 'best' } });
  const B2 = G.B; for (const u of B2.heroes.slice(1)) for (const s of u.skills) s.cd = 99999;
  window.__sim(opt.pre); J.enabled = true; J.reset(); J.stops.length = 0; G.paused = false; G.speed = opt.speed || 1;
  const rows = []; const u = B2.heroes[0]; const cuts0 = G.actors.fx.counters.gio_slash || 0;
  const t0 = performance.now(); let cast = false; let castAt = 0;
  while (performance.now() - t0 < opt.secs * 1000) {
    await raf(); const now = performance.now() - t0;
    if (!cast && now > 300) { cast = true; castAt = now; u.ult = 1; u.ultReady = true; SIM.castUlt(B2, 0); }
    rows.push({ t: now, Bt: B2.t, push: J.view.push, scale: J.scale, stopped: J.stopped, cuts: (G.actors.fx.counters.gio_slash || 0) - cuts0 });
  }
  G.paused = true; G.speed = 1;
  return { rows, castAt, stops: J.stops.map((s) => ({ ms: s.ms, real: s.real, force: s.force })), cuts: (G.actors.fx.counters.gio_slash || 0) - cuts0 };
};

// the katana in the real frame
const FLAT = (on) => {
  const G = window.__G; const THREE = G.host.THREE; const gi = G.actors.gripOf(G.B.heroes[0].uid); if (!gi) return false;
  const flat = window.__flatMat || (window.__flatMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, toneMapped: false, fog: false }));
  for (const o of gi.grip.objs) o.g.traverse((q) => { if (!q.isMesh || q.userData.castProp) return; if (on) { if (!q.userData.keepMat) q.userData.keepMat = q.material; q.material = flat; } else if (q.userData.keepMat) { q.material = q.userData.keepMat; q.userData.keepMat = null; } });
  return true;
};
const HERO = async () => {
  const G = window.__G; const H = G.host; const u = G.B.heroes[0]; const n = G.actors.nodeOf(u.uid); const gi = G.actors.gripOf(u.uid);
  const v = (document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0];
  const { gripReport } = await import(new URL('js/view/grip.js' + v, location.href).href);
  const p = new H.THREE.Vector3(n.position.x, 1.2, n.position.z).project(H.camera);
  const rep = gripReport(gi.grip, gi.m);
  if (gi.grip.hidden || !u.alive) return { skip: true };
  return { x: (p.x + 1) / 2 * H.size.w / H.size.u, y: (1 - p.y) / 2 * H.size.h / H.size.u, attack: gi.st.swing >= 0, run: gi.st.speed > 1.2, main: Math.max(...rep.main), supp: rep.support, elR: rep.elbowR.angle, elL: rep.elbowL.angle };
};

// ---------- node side ----------
const py = (code, ...args) => execFileSync('python3', ['-I', '-c', code, ...args]).toString();
const whiteMax = (files) => +py(`
import sys, json
from PIL import Image
m = 0
for f in json.loads(sys.argv[1]):
    im = Image.open(f).convert('RGB'); W, H = im.size; px = im.load(); n = 0; wh = 0
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            n += 1
            if min(px[x, y]) >= 250: wh += 1
    m = max(m, wh / max(1, n))
print(m)`, JSON.stringify(files));
function strip(files, out, cols) {
  py(`
import sys, json
from PIL import Image, ImageDraw
fs = json.loads(sys.argv[2]); cols = int(sys.argv[3])
ims = [Image.open(f).convert('RGB') for f in fs]; W, H = ims[0].size; rows = (len(ims) + cols - 1) // cols
s = Image.new('RGB', (cols * W + (cols + 1) * 6, rows * H + (rows + 1) * 6), (18, 18, 22)); d = ImageDraw.Draw(s)
for k, i in enumerate(ims):
    x = 6 + (k % cols) * (W + 6); y = 6 + (k // cols) * (H + 6); s.paste(i, (x, y)); d.rectangle([x, y, x + 34, y + 12], fill=(0, 0, 0)); d.text((x + 3, y + 1), str(k), fill=(255, 255, 255))
s.save(sys.argv[1])`, out, JSON.stringify(files), String(cols));
}
function encode(dir, n, out) {
  try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, 'f%03d.png'), '-c:v', 'libvpx-vp9', '-b:v', '2M', '-pix_fmt', 'yuv420p', out]); return fs.statSync(out).size; } catch (e) { return 0; }
}
const runs = (flags, dt) => { const r = []; let n = 0; for (const f of flags) { if (f) n++; else if (n) { r.push(n * dt); n = 0; } } if (n) r.push(n * dt); return r; };

const FRAMES = { attack: 36, dash: 48, whirl: 54, ult: 64 };
const SLOT = { attack: 'attack', dash: 's1', whirl: 's2', ult: 'ult' };

async function capture(br, base, phone, skill) {
  const r = await openPage(br, base, phone, 'noaudio=1&seed=9&autostart=1&stage=3&wave=3&team=' + TEAM.join(','));
  const { page } = r; const tag = `${skill}-${phone}`; const dir = path.join(TMP, tag); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const prep = await page.evaluate(PREP, [skill]);
  const pre = await page.evaluate(GROUND);
  check(prep.phase === 'fight', `${tag}: stage ready (${JSON.stringify(prep)})`);
  const c = await page.evaluate(CAST, [SLOT[skill]]);
  check(c.ok, `${tag}: ${SLOT[skill]} cast ${JSON.stringify(c)}`);
  const rows = []; const n = FRAMES[skill];
  const fn = (i) => path.join(dir, 'f' + String(i).padStart(3, '0') + '.png');
  for (let i = 0; i < n; i++) { rows.push(await page.evaluate(FRAME)); await page.locator('#frame').screenshot({ path: fn(i), scale: 'css' }); }
  const ev = await page.evaluate(() => window.__ev);
  const start = skill === 'ult' ? 3 : 0;
  const pick = Array.from({ length: 12 }, (_, k) => fn(Math.min(n - 1, start + k * 2)));
  strip(pick, path.join(OUT, `${tag}.png`), 3);
  if (skill === 'ult') strip(Array.from({ length: 12 }, (_, k) => fn(Math.min(n - 1, start + 24 + k * 2))), path.join(OUT, `ult2-${phone}.png`), 3);
  const w = whiteMax(Array.from({ length: n }, (_, i) => fn(i)));
  check(w < 0.01, `${tag}: clipped white ${(w * 100).toFixed(2)}% over ${n} frames (< 1%)`);
  const dt = 1 / 30;
  if (skill === 'attack') {
    const rr = runs(rows.map((x) => x.arcs > 0), dt); const longest = Math.max(0, ...rr);
    check(rr.length >= 1 && longest >= 0.1 && longest <= 0.25, `${tag}: blade arc alive ${rr.map((x) => x.toFixed(3)).join(', ')} s per swing (0.1 to 0.25 s; sampled at 33 ms)`);
  } else if (skill === 'dash') {
    const d = ev.find((e) => e.e === 'dash'); const dist = d ? Math.hypot(d.x2 - d.x, d.z2 - d.z) : 0;
    const lens = rows.flatMap((x) => x.dashLen); const len = lens.length ? lens[0] : 0;
    check(d && Math.abs(len - dist) <= dist * 0.15, `${tag}: dash stroke ${len.toFixed(2)} m for a dash of ${dist.toFixed(2)} m (within 15%)`);
    const gh = Math.max(0, ...rows.slice(0, 6).map((x) => x.ghosts));
    check(gh >= 3, `${tag}: ${gh} afterimages alive right after the dash (>= 3)`);
    const hits = ev.filter((e) => e.e === 'hit' && e.by && !e.dot).length; const last = rows[rows.length - 1];
    check(hits === 0 || last.dashHits >= 1, `${tag}: ${last.dashHits} hit bursts for ${hits} damaging hits on the line`);
  } else if (skill === 'whirl') {
    const top = Math.max(...rows.map((x) => x.whirlTop)); const lifted = Math.max(...rows.map((x) => x.liftN)); const inside = Math.max(...rows.map((x) => x.lifts));
    check(top >= 4, `${tag}: whirlwind column ${top.toFixed(2)} m tall (>= 4 m), ${Math.max(...rows.map((x) => x.leaves))} leaves`);
    check(inside < 3 || lifted >= 3, `${tag}: ${lifted} of ${inside} enemies in the column lifted >= 0.6 m at the peak (best ${Math.max(...rows.map((x) => x.liftMax)).toFixed(2)} m)`);
    check(inside >= 3, `${tag}: ${inside} enemies were inside the column (stage needs >= 3)`);
    const end = rows[rows.length - 1]; check(end.lifts === 0 && end.whirls === 0, `${tag}: ${end.lifts} lifted enemies and ${end.whirls} columns left at the end of the run`);
  } else if (skill === 'ult') {
    const cuts = rows[rows.length - 1].cuts; check(cuts === 10, `${tag}: ${cuts} slash streaks (exactly 10; the sim fired ${ev.filter((e) => e.e === 'fx' && e.part === 'bolt').length} bolts)`);
  }
  const sizeB = encode(dir, n, path.join(OUT, skill + '.webm'));
  if (phone === PHONES[0]) check(sizeB > 2000, `${skill}: clip ${path.join('.chk/gio', skill + '.webm')} ${sizeB} bytes (${n} frames at 30 fps)`);
  // after the run: kill the field, let everything settle, effects back to where they were
  if (skill === 'ult' || skill === 'whirl') {
    await page.evaluate(() => { const G = window.__G; for (const e of G.B.enemies) e.hp = 0; for (let i = 0; i < 40; i++) window.__SIM.step(G.B); });
    for (let i = 0; i < 6; i++) await page.evaluate(() => window.__step(30));
    const after = await page.evaluate(GROUND);
    check(after.ground <= pre.ground + 1 && after.leaves === 0 && after.lifts === 0, `${tag}: ground and pool counts ${pre.ground} before, ${after.ground} three seconds after (leaves ${after.leaves}, lifted ${after.lifts})`);
  }
  check(bad(r.problems).length === 0, `${tag}: no console problems ${bad(r.problems).slice(0, 2).join(' | ')}`);
  await r.ctx.close();
}

async function live(br, base, phone) {
  const r = await openPage(br, base, phone, 'noaudio=1&seed=9&autostart=1&stage=3&wave=3&team=' + TEAM.join(','));
  const { page } = r; await page.evaluate(PREP, ['attack']);
  for (const speed of [1, 2]) {
    const o = await page.evaluate(LIVE, [{ pre: 5, secs: speed === 1 ? 4.5 : 3.2, speed }]); const tag = `${phone} live x${speed}`;
    const sl = o.stops.filter((s) => s.force);
    check(o.cuts === 10 && sl.length === 10, `${tag}: ${o.cuts} cuts and ${sl.length} per-cut hit-stops (10 each)`);
    const lim = speed === 1 ? [30, 45] : [15, 22.5];
    check(sl.every((s) => s.ms >= lim[0] && s.ms <= lim[1]), `${tag}: per-cut stops ${sl.map((s) => s.ms).join('/')} ms (${lim[0]} to ${lim[1]})`);
    check(sl.every((s) => s.real !== undefined && s.real >= s.ms - 1 && s.real <= s.ms + 34), `${tag}: real stop lengths ${sl.map((s) => (s.real || 0).toFixed(0)).join('/')} ms (the deadline plus at most one frame)`);
    const total = o.stops.reduce((a, s) => a + (s.real || s.ms), 0);
    check(total <= 450, `${tag}: total freeze ${total.toFixed(0)} ms over ${o.stops.length} stops (<= 450)`);
    const cutRows = o.rows.filter((x) => x.cuts >= 1 && x.cuts <= 10 && x.t >= o.castAt); const a = cutRows[0]; const z = cutRows.find((x) => x.cuts === 10);
    const span = o.rows.filter((x) => x.t >= a.t + 60 && x.t <= z.t); // the push ramps in over its first 50 ms
    check(span.length > 5 && span.every((x) => x.push > 0), `${tag}: camera push > 0 on all ${span.length} frames from the first to the last cut (min ${Math.min(...span.map((x) => x.push)).toFixed(2)}, max ${Math.max(...o.rows.map((x) => x.push)).toFixed(2)})`);
  }
  check(bad(r.problems).length === 0, `${phone} live: no console problems ${bad(r.problems).slice(0, 2).join(' | ')}`);
  await r.ctx.close();
}

// the katana in the idle, run and attack poses of the real frame: visible span and hands on the hilt
async function katana(br, base) {
  const r = await openPage(br, base, 's22', 'noaudio=1&seed=9', { freeze: true });
  const { page } = r;
  // frozen page (no real-time loop): every sample is two sim ticks and four 60 Hz view frames, the same 1/15 s on both
  // clocks, so the swing a tick starts is still on screen when the shot is taken and every run samples the same poses
  await page.evaluate(async () => {
    const G = window.__G; const sc = G && G.screens && G.screens[G.screen]; if (sc && sc.hide) sc.hide();
    const v = (document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0];
    window.__SIM = await import(new URL('js/sim/battle.js' + v, location.href).href);
  });
  await page.evaluate(() => { const G = window.__G; G.start(3, { seed: 9, wave: 3, team: ['gio'], hpFlat: 90000, atkFlat: 0, mul: 0.5, auto: { ult: false, pick: 'best' } }); for (const u of G.B.heroes) for (const s of u.skills) s.cd = 99999; window.__sim(3); window.__step(4); });
  const bb = await page.locator('#frame').boundingBox(); const tmp = path.join(TMP, 'kat'); fs.mkdirSync(tmp, { recursive: true });
  await page.evaluate(FLAT, true);
  const S = { idle: [], run: [], attack: [] }; const files = []; const kinds = [];
  for (let t = 0; t < 160 && !(S.attack.length >= 8 && S.idle.length >= 6 && S.run.length >= 3); t++) {
    await page.evaluate(() => { const B = window.__G.B; for (let i = 0; i < 2 && B.phase === 'fight'; i++) window.__SIM.step(B); window.__step(4); });
    if (!S.run.length && t % 4 === 3) await page.evaluate(() => { const u = window.__G.B.heroes[0]; u.x -= Math.sign(u.x || 1) * 2.5; window.__step(1); });
    const at = await page.evaluate(HERO); if (at.skip) continue; const kind = at.attack ? 'attack' : at.run ? 'run' : 'idle';
    const cx = Math.max(0, Math.min(bb.width - 200, at.x - 100)); const cy = Math.max(0, Math.min(bb.height - 200, at.y - 100));
    const f = path.join(tmp, `k${t}.png`); await page.screenshot({ path: f, clip: { x: bb.x + cx, y: bb.y + cy, width: 200, height: 200 } });
    S[kind].push({ f, main: at.main, supp: at.supp, elR: at.elR, elL: at.elL }); files.push(f); kinds.push(kind);
  }
  await page.evaluate(FLAT, false);
  const spans = JSON.parse(py(`
import sys, json
from PIL import Image
out = []
for f in json.loads(sys.argv[1]):
    im = Image.open(f).convert('RGB'); px = im.load(); W, H = im.size
    x0 = y0 = 10 ** 9; x1 = y1 = -1
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if r > 200 and b > 200 and g < 90:
                x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
    out.append(0 if x1 < 0 else max(x1 - x0 + 1, y1 - y0 + 1) / 3.0)
print(json.dumps(out))`, JSON.stringify(files)));
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  let k = 0; const sp = { idle: [], run: [], attack: [] }; kinds.forEach((kd, i) => sp[kd].push(spans[i]));
  void k;
  for (const kd of ['idle', 'attack']) check(S[kd].length >= 3 && med(sp[kd]) >= 34, `katana ${kd}: visible span ${med(sp[kd]).toFixed(1)} CSS px over ${S[kd].length} frames (>= 34)`);
  check(S.run.length >= 1, `katana run: ${S.run.length} frames sampled while the hero ran`);
  for (const kd of ['idle', 'run', 'attack']) {
    if (!S[kd].length) continue;
    const mm = Math.max(...S[kd].map((x) => x.main)); const ss = Math.max(...S[kd].map((x) => x.supp));
    check(mm <= 0.04 && ss <= 0.05, `katana ${kd}: main hand ${mm.toFixed(3)} m and off hand ${ss.toFixed(3)} m from the hilt points over ${S[kd].length} frames (<= 0.04 / 0.05)`);
  }
  const tilesFiles = files.filter((_, i) => i % Math.ceil(files.length / 12) === 0).slice(0, 12); if (tilesFiles.length) strip(tilesFiles, path.join(OUT, 'katana-s22.png'), 4);
  check(bad(r.problems).length === 0, `katana: no console problems ${bad(r.problems).slice(0, 2).join(' | ')}`);
  await r.ctx.close();
}

const srv = await serve(); const br = await launch();
try {
  if (!argv.includes('--no-katana')) await katana(br, srv.base);
  for (const phone of PHONES) for (const skill of SKILLS) await capture(br, srv.base, phone, skill);
  if (SKILLS.includes('ult')) for (const phone of PHONES) await live(br, srv.base, phone);
} finally { await br.close(); srv.close(); }
done();
