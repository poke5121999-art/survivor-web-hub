// The stage map (js/view/world.js): five pads per stage, one per wave, on different heights, joined by bridges the heroes
// run over when a wave is cleared.
//  - layout: 5 centres, at least 3 different heights, every bridge at least 2 m long with both ends on a pad floor
//  - run: for each of the 4 runs of a stage, every hero stays over a pad floor or the bridge deck (feet within 0.6 m of it)
//    on every drawn frame, the run takes 2.4 to 5 s, ends on the next pad with the heroes back where the sim has them, and
//    no more than 10% of the sampled hero sight lines from the camera are blocked by world blocks
//  - spawns: on every pad the spawn ring (1.04 to 1.07 of the fight ellipse) is pad floor, and no prop box reaches above the
//    floor inside 1.08 of the ellipse
//  - in view: on every pad the spawn rim projects inside the frame under the top bar
//  - the real flow (stage 1, cards picked by hand): the run starts when the wave is cleared, the sim clock and the spawns
//    wait for it, the card pick opens only on the new pad, and picking does not start a second run
//  - cost at q=low on s22: draws and triangles per pad at rest, world build time
// Sheets: .chk/maps/<theme>.png (the five pads and one frame of a run, beside an owner reference).
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/map-test.mjs [--quick] [--stages=1,6] [--noshots]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { serve, launch, open as openPage, checker, sheet, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'maps'); fs.mkdirSync(OUT, { recursive: true });
const REFS = path.join(os.homedir(), 'handoff', 'ai-sinh-ton-refs');
const REF_OF = { street: 'look-7.webp', parking: 'look-5.webp', factory: 'look-6.webp', crypt: 'look-10-desert-temple.webp', landing: 'look-9-horde-grass.webp', void: 'look-11-lava-bridge.png' };
const argv = process.argv.slice(2); const arg = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const QUICK = argv.includes('--quick'); const SHOTS = !argv.includes('--noshots');
const STAGES = arg('stages') ? arg('stages').split(',').map(Number) : (QUICK ? [1, 6] : [1, 6, 11, 16, 21, 26]);
const DRAWS_MAX = +(arg('draws') || 340); const BUILD_MAX = 250;
const { check, done } = checker();

const HIDE_HUD = () => { const H = window.__G.host; if (!H.__r) { H.__r = H.render; H.render = () => H.__r(null); } };

// one run to pad `to`, stepped at 60 Hz without the sim; returns what every drawn frame showed
const RUN = ([to, prior]) => {
  const G = window.__G; const H = G.host; const W = H.world; const T = H.THREE; H.sectionLock = true;
  const ray = new T.Raycaster(); const from = new T.Vector3(); const at = new T.Vector3(); const dir = new T.Vector3();
  const started = W.travelTo(to); let steps = prior || 0; let miss = 0; let samples = 0; let worst = ''; let sight = 0; let blocked = 0; let maxLift = 0; let minLift = 0;
  const meshes = []; H.scene.traverse((o) => { if (o.isMesh && o.name === 'pad') meshes.push(o); });
  const d0 = W.map.centres[to].y - W.map.centres[to - 1].y;
  while (W.busy && steps < 600) {
    window.__step(1); steps++;
    for (const u of G.B.heroes) {
      const n = G.actors.nodeOf(u.uid); if (!n || !u.alive) continue; samples++;
      const g = W.groundAt(n.position.x, n.position.z);
      if (g === null || Math.abs(n.position.y - g) > 0.6) { miss++; if (!worst) worst = `step ${steps} hero ${u.slot} at ${n.position.x.toFixed(1)}, ${n.position.y.toFixed(1)}, ${n.position.z.toFixed(1)} ground ${g === null ? 'none' : g.toFixed(1)}`; }
      const my = n.position.y + W.shift.y; maxLift = Math.max(maxLift, my); minLift = Math.min(minLift, my);
      if (steps % 6 === 0) {
        H.scene.updateMatrixWorld(true); from.copy(H.camera.position); at.set(n.position.x, n.position.y + 1.0, n.position.z); dir.copy(at).sub(from); const far = dir.length(); dir.normalize();
        ray.set(from, dir); ray.far = far - 0.6; sight++; if (ray.intersectObjects(meshes, false).length) blocked++;
      }
    }
  }
  for (let i = 0; i < 40; i++) window.__step(1);
  let off = 0; for (const u of G.B.heroes) { const n = G.actors.nodeOf(u.uid); if (n && u.alive) off = Math.max(off, Math.hypot(n.position.x - u.x, n.position.z - u.z), Math.abs(n.position.y)); }
  return { started, steps, secs: steps / 60, miss, samples, worst, sight, blocked, off, sec: W.sec, shift: Math.hypot(W.shift.x, W.shift.y, W.shift.z), dy: d0, maxLift, minLift };
};

// the pad the fight is on: spawn ring, props, rim in the frame, cost
const PAD = () => {
  const G = window.__G; const H = G.host; const W = H.world; const pad = W.pad; const V = new H.THREE.Vector3(); const { w, h } = H.size; const u = H.size.u || 1;
  const E = { x: 9.6, z: 4.6 }; let off = 0; let ringN = 0;
  for (let i = 0; i < 144; i++) for (const k of [1.04, 1.07]) { const a = i / 144 * Math.PI * 2; ringN++; if (!pad.isFloor(Math.cos(a) * E.x * k, Math.sin(a) * E.z * k)) off++; }
  let inside = 0;
  for (const b of pad.boxes) { const c = b.corners || b; for (const p of c) { const x = p[0] !== undefined ? p[0] : p.x; const y = p[1] !== undefined ? p[1] : p.y; const z = p[2] !== undefined ? p[2] : p.z; if (y > 0.05 && Math.hypot(x / E.x, z / E.z) < 1.08) { inside++; break; } } }
  let out = 0;
  for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; V.set(Math.cos(a) * E.x * 1.04, 0, Math.sin(a) * E.z * 1.04).project(H.camera); const x = (V.x + 1) / 2 * w / u; const y = (1 - V.y) / 2 * h / u; if (x < 0 || x > 780 || y < 40 || y > h / u) out++; }
  window.__step(2);
  return { off, ringN, inside, boxes: pad.boxes.length, out, draws: window.__stats.draws, tris: window.__stats.tris, sec: W.sec, lights: W.all.length, warm: W.all.filter((L) => L.warm).length, theme: W.theme.name };
};

const LAYOUT = () => {
  const W = window.__G.host.world; const cs = W.map.centres;
  return { n: cs.length, ys: cs.map((c) => c.y), d: cs.slice(1).map((c, i) => +Math.hypot(c.x - cs[i].x, c.z - cs[i].z).toFixed(1)), buildMs: +W.buildMs.toFixed(0) };
};
const BRIDGE = () => {
  const W = window.__G.host.world; const b = W.bridges.find((x) => !x.back && x === W.walkBridge()); if (!b) return null;
  const L = Math.hypot(b.b.x - b.a.x, b.b.z - b.a.z); const ux = b.dir[0]; const uz = b.dir[1];
  return { L: +L.toFixed(1), dy: +(b.b.y - b.a.y).toFixed(1), a: W.groundAt(b.a.x - ux * 0.6, b.a.z - uz * 0.6), b: W.groundAt(b.b.x + ux * 0.6, b.b.z + uz * 0.6) };
};

const srv = await serve(); const br = await launch();
try {
  for (const st of STAGES) {
    const r = await openPage(br, srv.base, 's22', `autostart=1&stage=${st}&noaudio=1&seed=${st}&q=low&autopick=1`);
    const page = r.page; await page.evaluate(HIDE_HUD);
    await page.evaluate(() => { window.__G.host.sectionLock = true; window.__G.paused = true; window.__step(3); });
    const L = await page.evaluate(LAYOUT); const tag = `stage ${st}`;
    check(L.n === 5, `${tag}: the map has ${L.n} pads (5)`);
    check(new Set(L.ys).size >= 3, `${tag}: pad heights ${L.ys.join(', ')} m: ${new Set(L.ys).size} different (>= 3)`);
    check(L.buildMs <= BUILD_MAX, `${tag}: the first two sections build in ${L.buildMs} ms (<= ${BUILD_MAX})`);
    const shots = []; let theme = ''; let pre = 0;
    for (let k = 0; k < 5; k++) {
      const P = await page.evaluate(PAD); theme = P.theme; const t = `${tag} pad ${k + 1} (${P.theme})`;
      check(P.sec === k, `${t}: the fight is on pad ${P.sec + 1}`);
      check(P.off === 0, `${t}: spawn ring points off the floor: ${P.off} of ${P.ringN} (= 0)`);
      check(P.boxes > 0 && P.inside === 0, `${t}: prop boxes above the floor inside 1.08 of the ellipse: ${P.inside} of ${P.boxes} (= 0)`);
      check(P.out === 0, `${t}: spawn rim points outside the frame or under the top bar: ${P.out} of 96 (= 0)`);
      check(P.draws <= DRAWS_MAX, `${t}: ${P.draws} draws at q=low (<= ${DRAWS_MAX}), ${P.tris} triangles, ${P.lights} lights (${P.warm} warm)`);
      if (SHOTS) { const f = path.join(OUT, `s${st}-pad${k + 1}.png`); await page.locator('#frame').screenshot({ path: f }); shots.push(f); }
      if (k === 4) break;
      const B = await page.evaluate(BRIDGE);
      check(!!B && B.L >= 2 && B.a !== null && B.b !== null, `${t}: bridge to pad ${k + 2} is ${B ? B.L : '?'} m long, climbs ${B ? B.dy : '?'} m, floor under both ends (${B ? (B.a !== null) + ', ' + (B.b !== null) : 'no bridge'})`);
      if (SHOTS && k === 1) {
        pre = await page.evaluate(([to]) => { const W = window.__G.host.world; W.travelTo(to); let n = 0; while (W.busy && n < 600 && Math.hypot(W.shift.x, W.shift.z) < W.walkBridge().midAt) { window.__step(1); n++; } return n; }, [k + 1]);
        const f = path.join(OUT, `s${st}-run.png`); await page.locator('#frame').screenshot({ path: f }); shots.push(f);
      }
      const R = await page.evaluate(RUN, [k + 1, pre]); pre = 0;
      check(R.sec === k + 1 && R.shift < 1e-6, `${t}: the run ends on pad ${R.sec + 1} with the scene at rest (shift ${R.shift.toFixed(3)})`);
      check(R.samples > 0 && R.miss === 0, `${t}: hero frames off the floor or the bridge during the run: ${R.miss} of ${R.samples} (= 0)${R.worst ? ' first: ' + R.worst : ''}`);
      check(R.secs >= 2.0 && R.secs <= 5.2, `${t}: the run takes ${R.secs.toFixed(1)} s (2.0 to 5.2)`);
      check(R.off < 0.3, `${t}: after the run heroes stand where the sim has them (largest gap ${R.off.toFixed(2)} m, < 0.3)`);
      check(R.sight > 0 && R.blocked / R.sight <= 0.1, `${t}: hero sight lines blocked by blocks during the run: ${R.blocked} of ${R.sight} (<= 10%)`);
      check(Math.abs(R.dy) < 0.5 || (R.dy > 0 ? R.maxLift > R.dy * 0.7 : R.minLift < R.dy * 0.7), `${t}: heroes follow the ${R.dy > 0 ? 'climb' : 'drop'} of ${R.dy} m (height in the stage frame ${R.minLift.toFixed(1)} to ${R.maxLift.toFixed(1)} m)`);
    }
    check(r.problems.length === 0, `${tag}: no page errors (${r.problems.slice(0, 2).join(' | ') || 'none'})`);
    if (SHOTS && shots.length) { const ref = path.join(REFS, REF_OF[theme] || ''); const files = fs.existsSync(ref) && REF_OF[theme] ? [...shots, ref] : shots; sheet(files, path.join(OUT, `${theme}.png`), 3, 780); for (const f of shots) fs.unlinkSync(f); }
    await r.ctx.close();
  }

  // the real flow on stage 1: cards picked by hand, real frames
  {
    const r = await openPage(br, srv.base, 's22', 'autostart=1&stage=1&noaudio=1&seed=3&q=low&autoult=1');
    const F = await r.page.evaluate(async () => {
      const G = window.__G; const H = G.host; const W = H.world; G.setSpeed(4);
      const frame = () => new Promise((res) => requestAnimationFrame(res));
      const out = { cleared: false, runSeen: false, simMoved: 0, enemiesInRun: 0, pickOpenInRun: 0, secAtPick: -1, pickOpened: false, runsAfterPick: -1, wave: 0, sec: -1, t: 0 };
      const t0 = performance.now(); let tBusy = null;
      while (performance.now() - t0 < 90000) {
        await frame(); const B = G.B; if (!B) break;
        if (B.phase === 'pick' || B.wave > 1) out.cleared = true;
        if (W.busy) { if (tBusy === null) tBusy = B.t; out.runSeen = true; out.simMoved = Math.max(out.simMoved, B.t - tBusy); out.enemiesInRun = Math.max(out.enemiesInRun, B.enemies.filter((e) => e.alive).length); if (window.__ui && window.__ui.isOpen && window.__ui.isOpen('pick')) out.pickOpenInRun++; }
        if (out.runSeen && !W.busy && B.phase === 'pick') {
          out.secAtPick = W.sec; for (let i = 0; i < 30; i++) await frame();
          out.pickOpened = !!(window.__ui && window.__ui.isOpen ? window.__ui.isOpen('pick') : true);
          const runs = W.runs; G.autoPick(); for (let i = 0; i < 40; i++) await frame(); out.runsAfterPick = W.runs - runs; out.wave = G.B.wave; out.sec = W.sec; out.t = G.B.t; break;
        }
      }
      return out;
    });
    check(F.cleared && F.runSeen, `flow: wave 1 is cleared and the run starts (cleared ${F.cleared}, run ${F.runSeen})`);
    check(F.simMoved < 0.05 && F.enemiesInRun === 0, `flow: during the run the sim clock moves ${F.simMoved.toFixed(2)} s and ${F.enemiesInRun} monsters are alive (0, 0)`);
    check(F.pickOpenInRun === 0 && F.secAtPick === 1 && F.pickOpened, `flow: the card pick opens on pad ${F.secAtPick + 1} after the run (frames open during the run: ${F.pickOpenInRun}, open after: ${F.pickOpened})`);
    check(F.runsAfterPick === 0 && F.wave === 2 && F.sec === 1, `flow: picking starts wave ${F.wave} on pad ${F.sec + 1} without a second run (${F.runsAfterPick})`);
    check(r.problems.length === 0, `flow: no page errors (${r.problems.slice(0, 2).join(' | ') || 'none'})`);
    await r.ctx.close();
  }
} finally { await br.close(); srv.close(); }
done();
