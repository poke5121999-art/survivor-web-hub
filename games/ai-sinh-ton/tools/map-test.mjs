// The stage map (js/view/world.js): 1 to 6 pads per stage by its layout (rooms.js), on different heights, joined by links
// (bridges, stairs, rafts, bridges that fall) the heroes run over when a wave is cleared, across any room only crossed, and
// a start room before pad 1 the team runs out of when the stage begins. Default stages: one of each layout and biome.
//  - start: every stage opens in the start room (no monster on its floor), and the run from it to pad 1 passes the same
//    run checks as the runs between pads
//  - layout: as many centres as the plan has rooms; bridges: >= 3 heights; spiral: every pad higher than the last; river:
//    all at one level; arena: one pad; every link at least 2 m long with both ends on a pad floor
//  - run: for each of the 4 runs of a stage, every hero stays over a pad floor or the bridge deck (feet within 0.6 m of it)
//    on every drawn frame, the run takes 2.4 to 5 s, ends on the next pad with the heroes back where the sim has them, and
//    no more than 10% of the sampled hero sight lines from the camera are blocked by world blocks, and a hero covering ground
//    (over 2 m/s past the bridge, the scene slides under the group) plays the run cycle: animator speed over 1.2 and the legs
//    swinging on at least 95% of those frames (the run used to glide with the legs still)
//  - z-fighting: on every pad and mid-run no surface flickers (tools/zfight.mjs: stable pixels whose colour depends on
//    draw order, at most ZMAX), and a team of every hero shows none on its body
//  - spawns: on every pad the spawn ring (1.04 to 1.07 of the fight ellipse) is pad floor, and no prop box reaches above the
//    floor inside 1.08 of the ellipse
//  - in view: on every pad the spawn rim projects inside the frame under the top bar and off the hero card block
//  - the real flow (stage 1, cards picked by hand): the stage opens with the run out of the start room while the sim clock
//    waits and the camp of pad 1 stands still; the run starts when the wave is cleared, the sim clock and the spawns
//    wait for it, no monster is left in the room being left, the card pick opens only on the new pad, and picking does not
//    start a second run
//  - cost at q=low on s22: draws and triangles per pad at rest, world build time
// Sheets: .chk/maps/<theme>.png (the five pads and one frame of a run, beside an owner reference).
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/map-test.mjs [--quick] [--stages=1,6] [--noshots]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { serve, launch, open as openPage, checker, sheet, ROOT } from './pw.mjs';
import { ZFIGHT } from './zfight.mjs';

const OUT = path.join(ROOT, '.chk', 'maps'); fs.mkdirSync(OUT, { recursive: true });
const REFS = path.join(os.homedir(), 'handoff', 'ai-sinh-ton-refs');
const REF_OF = { forest: 'look-9-horde-grass.webp', swamp: 'look-8.webp', street: 'look-7.webp', parking: 'look-5.webp', factory: 'look-6.webp', crypt: 'look-10-desert-temple.webp', landing: 'look-9-horde-grass.webp', void: 'look-11-lava-bridge.png' };
const argv = process.argv.slice(2); const arg = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const QUICK = argv.includes('--quick'); const SHOTS = !argv.includes('--noshots');
const STAGES = arg('stages') ? arg('stages').split(',').map(Number) : (QUICK ? [1, 4] : [1, 2, 9, 4, 16, 18]);
const DRAWS_MAX = +(arg('draws') || 340); const BUILD_MAX = 250; const ZMAX = +(arg('zmax') || 40);
const ZOUT = path.join(ROOT, '.chk', 'maps', 'z'); fs.mkdirSync(ZOUT, { recursive: true });
const zshot = (res, name) => { if (res.nz + res.nd > ZMAX) fs.writeFileSync(path.join(ZOUT, name + '.png'), Buffer.from(res.img.split(',')[1], 'base64')); };
const zwhere = (res) => Object.entries(res.groups).sort((a, b) => b[1].n - a[1].n).slice(0, 2).map(([k, v]) => `${k} at y ${v.y[0]}`).join('; ');
const { check, done } = checker();

const HIDE_HUD = () => { const H = window.__G.host; if (!H.__r) { H.__r = H.render; H.render = () => H.__r(null); } };

// one run to pad `to`, stepped at 60 Hz without the sim; returns what every drawn frame showed
const RUN = ([to, prior]) => {
  const G = window.__G; const H = G.host; const W = H.world; const T = H.THREE; H.sectionLock = true;
  const ray = new T.Raycaster(); const from = new T.Vector3(); const at = new T.Vector3(); const dir = new T.Vector3();
  const started = W.travelTo(to); let steps = prior || 0; let miss = 0; let samples = 0; let worst = ''; let sight = 0; let blocked = 0; let maxLift = 0; let minLift = 0;
  const was = new Map(); let moving = 0; let posed = 0;
  const meshes = []; H.scene.traverse((o) => { if (o.isMesh && o.name === 'pad') meshes.push(o); });
  const d0 = W.map.centres[to].y - (W.sec >= 0 ? W.map.centres[W.sec] : W.map.start).y; const hops = to - W.sec;
  let raft = false; for (let k = Math.max(-1, W.sec); k < to; k++) if (W.map.plan.links.find((l) => l.from === k && l.kind === 'raft')) raft = true;
  while (W.busy && steps < 600) {
    window.__step(1); steps++;
    for (const u of G.B.heroes) {
      const n = G.actors.nodeOf(u.uid); if (!n || !u.alive) continue; samples++;
      const g = W.groundAt(n.position.x, n.position.z);
      if (g === null || Math.abs(n.position.y - g) > 0.6) { miss++; if (!worst) worst = `step ${steps} hero ${u.slot} at ${n.position.x.toFixed(1)}, ${n.position.y.toFixed(1)}, ${n.position.z.toFixed(1)} ground ${g === null ? 'none' : g.toFixed(1)}`; }
      const my = n.position.y + W.shift.y; maxLift = Math.max(maxLift, my); minLift = Math.min(minLift, my);
      // the run cycle: speed over the pad and bridge (the scene's own motion plus the slide), against the animator's speed and the legs
      const gi = G.actors.gripOf(u.uid); const gx = n.position.x + W.shift.x; const gz = n.position.z + W.shift.z; const leg = gi.m.legL.rotation.x; const p = was.get(u.uid);
      if (p && W.sec === p.sec && Math.hypot(gx - p.gx, gz - p.gz) * 60 > 2) { moving++; if (gi.st.speed > 1.2 && Math.abs(leg - p.leg) > 0.004) posed++; }
      was.set(u.uid, { gx, gz, leg, sec: W.sec });
      if (steps % 6 === 0) {
        H.scene.updateMatrixWorld(true); from.copy(H.camera.position); at.set(n.position.x, n.position.y + 1.0, n.position.z); dir.copy(at).sub(from); const far = dir.length(); dir.normalize();
        ray.set(from, dir); ray.far = far - 0.6; sight++; if (ray.intersectObjects(meshes, false).length) blocked++;
      }
    }
  }
  for (let i = 0; i < 40; i++) window.__step(1);
  let off = 0; for (const u of G.B.heroes) { const n = G.actors.nodeOf(u.uid); if (n && u.alive) off = Math.max(off, Math.hypot(n.position.x - u.x, n.position.z - u.z), Math.abs(n.position.y)); }
  return { hops, raft, started, steps, secs: steps / 60, miss, samples, worst, sight, blocked, off, moving, posed, sec: W.sec, shift: Math.hypot(W.shift.x, W.shift.y, W.shift.z), dy: d0, maxLift, minLift };
};

// the pad the fight is on: spawn ring, props, rim in the frame, cost
const PAD = () => {
  const G = window.__G; const H = G.host; const W = H.world; const pad = W.pad; const V = new H.THREE.Vector3(); const { w, h } = H.size; const u = H.size.u || 1;
  const E = { x: 9.6, z: 4.6 }; let off = 0; let ringN = 0;
  for (let i = 0; i < 144; i++) for (const k of [1.04, 1.07]) { const a = i / 144 * Math.PI * 2; ringN++; if (!pad.isFloor(Math.cos(a) * E.x * k, Math.sin(a) * E.z * k)) off++; }
  let inside = 0;
  for (const b of pad.boxes) { const c = b.corners || b; for (const p of c) { const x = p[0] !== undefined ? p[0] : p.x; const y = p[1] !== undefined ? p[1] : p.y; const z = p[2] !== undefined ? p[2] : p.z; if (y > 0.05 && Math.hypot(x / E.x, z / E.z) < 1.08) { inside++; break; } } }
  let out = 0;
  for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; V.set(Math.cos(a) * E.x * 1.04, 0, Math.sin(a) * E.z * 1.04).project(H.camera); const x = (V.x + 1) / 2 * w / u; const y = (1 - V.y) / 2 * h / u; if (x < 0 || x > 780 || y < 40 || y > h / u || (x > 236 && x < 544 && y > 252)) out++; }
  window.__step(2);
  return { off, ringN, inside, boxes: pad.boxes.length, out, draws: window.__stats.draws, tris: window.__stats.tris, sec: W.sec, lights: W.all.length, warm: W.all.filter((L) => L.warm).length, theme: W.theme.name };
};

const LAYOUT = () => {
  const W = window.__G.host.world; const cs = W.map.centres;
  return { layout: W.map.plan.layout, R: W.map.R, fight: [...new Set(W.map.plan.waveRoom)], n: cs.length, ys: cs.map((c) => c.y), d: cs.slice(1).map((c, i) => +Math.hypot(c.x - cs[i].x, c.z - cs[i].z).toFixed(1)), buildMs: +W.buildMs.toFixed(0) };
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
    const page = r.page; await page.evaluate(HIDE_HUD); await page.evaluate(`window.__RUN = ${RUN.toString()}`);
    await page.evaluate(() => { window.__G.host.sectionLock = true; window.__G.paused = true; window.__step(3); });
    const L = await page.evaluate(LAYOUT); const tag = `stage ${st}`;
    {
      // the start room, then the run out of it to pad 1
      const S0 = await page.evaluate(() => {
        const G = window.__G; const W = G.host.world; W.settle(); const sec = W.toStart(); window.__step(3); const V = new G.host.THREE.Vector3(); let on = 0;
        for (const e of [...G.B.enemies, ...(G.B.camp || [])]) if (e.alive && G.actors.headPos(e.uid, V) && W.onStartFloor(V.x, V.z)) on++;
        return { sec, on, start: !!W.map.start };
      });
      check(S0.start && S0.sec === -1 && S0.on === 0, `${tag}: the stage opens in the start room (section ${S0.sec}) with ${S0.on} monsters on its floor (= 0)`);
      { const Z = await page.evaluate(ZFIGHT); zshot(Z, `s${st}-start`); check(Z.nz + Z.nd <= ZMAX, `${tag} start room: flickering (z-fighting) pixels ${Z.nz} + ${Z.nd} on decals (<= ${ZMAX})${Z.nz + Z.nd > ZMAX ? ': ' + zwhere(Z) : ''}`); }
      if (SHOTS) { const f = path.join(OUT, `s${st}-start.png`); await page.locator('#frame').screenshot({ path: f }); }
      // the start room holds the team while the game is paused: this run is played unpaused (RUN steps synchronously)
      const R = await page.evaluate(([a, b]) => { const G = window.__G; G.paused = false; try { return window.__RUN([a, b]); } finally { G.paused = true; } }, [0, 0]); const t = `${tag} start room`;
      check(R.sec === 0 && R.shift < 1e-6, `${t}: the run ends on pad ${R.sec + 1} with the scene at rest (shift ${R.shift.toFixed(3)})`);
      check(R.samples > 0 && R.miss === 0, `${t}: hero frames off the floor or the bridge during the run: ${R.miss} of ${R.samples} (= 0)${R.worst ? ' first: ' + R.worst : ''}`);
      check(R.secs >= 2.0 && R.secs <= 5.2, `${t}: the run takes ${R.secs.toFixed(1)} s (2.0 to 5.2)`);
      check(R.off < 0.3, `${t}: after the run heroes stand where the sim has them (largest gap ${R.off.toFixed(2)} m, < 0.3)`);
      check(R.moving > 60 && R.posed >= R.moving * 0.95, `${t}: heroes play the run cycle while they cover ground: ${R.posed} of ${R.moving} moving frames (>= 95%)`);
      check(R.sight > 0 && R.blocked / R.sight <= 0.1, `${t}: hero sight lines blocked by blocks during the run: ${R.blocked} of ${R.sight} (<= 10%)`);
    }
    const tagL = `${tag} (${L.layout})`;
    check(L.n === L.R && L.R >= 1 && L.R <= 6, `${tagL}: the map has ${L.n} pads (${L.R} rooms in the plan)`);
    if (L.layout === 'bridges') check(new Set(L.ys).size >= 3, `${tagL}: pad heights ${L.ys.join(', ')} m: ${new Set(L.ys).size} different (>= 3)`);
    if (L.layout === 'spiral') check(L.ys.every((y, i) => i === 0 || y > L.ys[i - 1]), `${tagL}: every pad stands higher than the last (${L.ys.join(', ')} m)`);
    if (L.layout === 'river') check(L.ys.every((y) => y === 0), `${tagL}: every pad at the water's level (${L.ys.join(', ')} m)`);
    if (L.layout === 'arena') check(L.n === 1, `${tagL}: one pad for all five waves`);
    check(L.buildMs <= BUILD_MAX, `${tag}: the first two sections build in ${L.buildMs} ms (<= ${BUILD_MAX})`);
    const shots = []; let theme = ''; let pre = 0;
    for (let fi = 0; fi < L.fight.length; fi++) {
      const k = L.fight[fi]; const nx = L.fight[fi + 1];
      const P = await page.evaluate(PAD); theme = P.theme; const t = `${tag} pad ${k + 1} (${P.theme})`;
      check(P.sec === k, `${t}: the fight is on pad ${P.sec + 1}`);
      check(P.off === 0, `${t}: spawn ring points off the floor: ${P.off} of ${P.ringN} (= 0)`);
      check(P.boxes > 0 && P.inside === 0, `${t}: prop boxes above the floor inside 1.08 of the ellipse: ${P.inside} of ${P.boxes} (= 0)`);
      check(P.out === 0, `${t}: spawn rim points outside the frame, under the top bar or the hero cards: ${P.out} of 96 (= 0)`);
      check(P.draws <= DRAWS_MAX, `${t}: ${P.draws} draws at q=low (<= ${DRAWS_MAX}), ${P.tris} triangles, ${P.lights} lights (${P.warm} warm)`);
      { const Z = await page.evaluate(ZFIGHT); zshot(Z, `s${st}-pad${k + 1}`); check(Z.nz + Z.nd <= ZMAX, `${t}: flickering (z-fighting) pixels ${Z.nz} + ${Z.nd} on decals (<= ${ZMAX})${Z.nz + Z.nd > ZMAX ? ': ' + zwhere(Z) : ''}`); }
      if (SHOTS) { const f = path.join(OUT, `s${st}-pad${k + 1}.png`); await page.locator('#frame').screenshot({ path: f }); shots.push(f); }
      if (nx === undefined) break;
      const B = await page.evaluate(BRIDGE);
      check(!!B && B.L >= 2 && B.a !== null && B.b !== null, `${t}: link toward pad ${nx + 1} is ${B ? B.L : '?'} m long, climbs ${B ? B.dy : '?'} m, floor under both ends (${B ? (B.a !== null) + ', ' + (B.b !== null) : 'no bridge'})`);
      if (SHOTS && fi === 1) {
        pre = await page.evaluate(([to]) => { const W = window.__G.host.world; W.travelTo(to); let n = 0; while (W.busy && n < 600 && Math.hypot(W.shift.x, W.shift.z) < W.walkBridge().midAt) { window.__step(1); n++; } return n; }, [nx]);
        const f = path.join(OUT, `s${st}-run.png`); await page.locator('#frame').screenshot({ path: f }); shots.push(f);
      }
      if (fi === 1) {
        if (!pre) pre = await page.evaluate(([to]) => { const W = window.__G.host.world; W.travelTo(to); let n = 0; while (W.busy && n < 600 && Math.hypot(W.shift.x, W.shift.z) < W.walkBridge().midAt) { window.__step(1); n++; } return n; }, [nx]);
        const Z = await page.evaluate(ZFIGHT); zshot(Z, `s${st}-run`); check(Z.nz + Z.nd <= ZMAX, `${t}: flickering (z-fighting) pixels mid-run on the bridge ${Z.nz} + ${Z.nd} on decals (<= ${ZMAX})${Z.nz + Z.nd > ZMAX ? ': ' + zwhere(Z) : ''}`);
      }
      const R = await page.evaluate(RUN, [nx, pre]); pre = 0; const tmax = R.raft || R.hops > 1 ? 7.6 : 5.2;
      check(R.sec === nx && R.shift < 1e-6, `${t}: the run ends on pad ${R.sec + 1} with the scene at rest (shift ${R.shift.toFixed(3)})`);
      check(R.samples > 0 && R.miss === 0, `${t}: hero frames off the floor or the bridge during the run: ${R.miss} of ${R.samples} (= 0)${R.worst ? ' first: ' + R.worst : ''}`);
      check(R.secs >= 2.0 && R.secs <= tmax, `${t}: the run over ${R.hops} link(s)${R.raft ? ' with a raft' : ''} takes ${R.secs.toFixed(1)} s (2.0 to ${tmax})`);
      check(R.off < 0.3, `${t}: after the run heroes stand where the sim has them (largest gap ${R.off.toFixed(2)} m, < 0.3)`);
      check(R.moving > 60 && R.posed >= R.moving * 0.95, `${t}: heroes play the run cycle while they cover ground: ${R.posed} of ${R.moving} moving frames (>= 95%)`);
      check(R.sight > 0 && R.blocked / R.sight <= 0.1, `${t}: hero sight lines blocked by blocks during the run: ${R.blocked} of ${R.sight} (<= 10%)`);
      check(Math.abs(R.dy) < 0.5 || (R.dy > 0 ? R.maxLift > R.dy * 0.7 : R.minLift < R.dy * 0.7), `${t}: heroes follow the ${R.dy > 0 ? 'climb' : 'drop'} of ${R.dy} m (height in the stage frame ${R.minLift.toFixed(1)} to ${R.maxLift.toFixed(1)} m)`);
    }
    check(r.problems.length === 0, `${tag}: no page errors (${r.problems.slice(0, 2).join(' | ') || 'none'})`);
    if (SHOTS && shots.length) { const ref = path.join(REFS, REF_OF[theme] || ''); const files = fs.existsSync(ref) && REF_OF[theme] ? [...shots, ref] : shots; sheet(files, path.join(OUT, `${theme}.png`), 3, 780); for (const f of shots) fs.unlinkSync(f); }
    await r.ctx.close();
  }

  // every hero's body: three more teams on pad 2 of stage 1, mid-fight
  for (const team of ['phao,bong,bang,hoa', 'doc,ky,sam,soi', 'nhen,yta,gio,mua']) {
    const r = await openPage(br, srv.base, 's22', `autostart=1&stage=1&wave=2&noaudio=1&seed=2&q=low&autopick=1&team=${team}`, { freeze: true });
    await r.page.evaluate(() => { window.__sim(2.5); window.__G.paused = true; window.__step(3); });
    const Z = await r.page.evaluate(ZFIGHT); zshot(Z, 'team-' + team.replace(/,/g, '-'));
    check(Z.nz + Z.nd <= ZMAX, `heroes ${team}: flickering (z-fighting) pixels ${Z.nz} + ${Z.nd} on decals (<= ${ZMAX})${Z.nz + Z.nd > ZMAX ? ': ' + zwhere(Z) : ''}`);
    check(r.problems.length === 0, `heroes ${team}: no page errors (${r.problems.slice(0, 2).join(' | ') || 'none'})`);
    await r.ctx.close();
  }

  // the real flow on stage 1: cards picked by hand, real frames
  {
    const r = await openPage(br, srv.base, 's22', 'autostart=1&stage=1&noaudio=1&seed=3&q=low&autoult=1');
    const F = await r.page.evaluate(async () => {
      const G = window.__G; const H = G.host; const W = H.world; G.setSpeed(4);
      const frame = () => new Promise((res) => requestAnimationFrame(res));
      const out = { cleared: false, runSeen: false, simMoved: 0, enemiesInRun: 0, pickOpenInRun: 0, secAtPick: -1, pickOpened: false, runsAfterPick: -1, wave: 0, sec: -1, t: 0, startRun: false, startSec: W.sec, startClock: 0, campMoved: 0, campN: 0 };
      const t0 = performance.now(); let tBusy = null; const camp0 = new Map(G.B.enemies.filter((e) => e.alive).map((e) => [e.uid, [e.x, e.z]])); out.campN = camp0.size;
      while (performance.now() - t0 < 90000) {
        await frame(); const B = G.B; if (!B) break;
        if (B.phase === 'pick' || B.wave > 1) out.cleared = true;
        // the run out of the start room: the sim waits, pad 1's camp stands where it was put
        if (W.busy && !out.cleared) { out.startRun = true; out.startClock = Math.max(out.startClock, B.t); for (const e of B.enemies) { const p = camp0.get(e.uid); if (p) out.campMoved = Math.max(out.campMoved, Math.hypot(e.x - p[0], e.z - p[1])); } }
        if (W.busy && out.cleared) { if (tBusy === null) tBusy = B.t; out.runSeen = true; out.simMoved = Math.max(out.simMoved, B.t - tBusy); out.enemiesInRun = Math.max(out.enemiesInRun, B.enemies.filter((e) => e.alive && (e.room === undefined || e.room <= W.sec)).length); if (window.__ui && window.__ui.isOpen && window.__ui.isOpen('pick')) out.pickOpenInRun++; }
        if (out.runSeen && !W.busy && B.phase === 'pick') {
          out.secAtPick = W.sec; for (let i = 0; i < 30; i++) await frame();
          out.pickOpened = !!(window.__ui && window.__ui.isOpen ? window.__ui.isOpen('pick') : true);
          const runs = W.runs; G.autoPick(); for (let i = 0; i < 40; i++) await frame(); out.runsAfterPick = W.runs - runs; out.wave = G.B.wave; out.sec = W.sec; out.t = G.B.t; break;
        }
      }
      return out;
    });
    check(F.startSec === -1 && F.startRun && F.startClock < 0.05 && F.campN > 0 && F.campMoved < 1e-6, `flow: the stage opens in the start room (section ${F.startSec}) and runs to pad 1 while the sim clock stays at ${F.startClock.toFixed(2)} s and pad 1's ${F.campN} waiting monsters move ${F.campMoved.toFixed(2)} m (0, 0)`);
    check(F.cleared && F.runSeen, `flow: wave 1 is cleared and the run starts (cleared ${F.cleared}, run ${F.runSeen})`);
    check(F.simMoved < 0.05 && F.enemiesInRun === 0, `flow: during the run the sim clock moves ${F.simMoved.toFixed(2)} s and ${F.enemiesInRun} monsters are alive in the room being left (0, 0)`);
    check(F.pickOpenInRun === 0 && F.secAtPick === 1 && F.pickOpened, `flow: the card pick opens on pad ${F.secAtPick + 1} after the run (frames open during the run: ${F.pickOpenInRun}, open after: ${F.pickOpened})`);
    check(F.runsAfterPick === 0 && F.wave === 2 && F.sec === 1, `flow: picking starts wave ${F.wave} on pad ${F.sec + 1} without a second run (${F.runsAfterPick})`);
    check(r.problems.length === 0, `flow: no page errors (${r.problems.slice(0, 2).join(' | ') || 'none'})`);
    await r.ctx.close();
  }
} finally { await br.close(); srv.close(); }
done();
