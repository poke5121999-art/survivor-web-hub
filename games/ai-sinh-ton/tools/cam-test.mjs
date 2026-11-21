// The fight camera against the Minecraft Dungeons numbers and the Addendum 9 rule (gameplay never covered or hidden).
//  1. numbers: pitch, lens, distance, screen angle of the block grid's edges, a 2.7 m hero's share of the frame height,
//     metres of ground across the frame, where the team's centre sits; beside the MCD values measured on the owner's clip
//     (~/handoff/ast-par/cam/mcd-camera.md)
//  2. whole fights (stages 1, 3, 8, 15, 24 to the end of the boss wave, s22 and xiaomi): every 0.25 s the screen box of
//     every living unit (feet to head through the game's camera) must lie inside the frame, under the top bar (0-41 of
//     360 design px), off the boss bar (44-68, x 240-540) while a boss lives and off the hero card block at the bottom
//     centre (y 252 down, x 236-544); the sight line from
//     the camera to its chest must not cross a world block. Units still climbing over the rim (below the floor) count for
//     the HUD and frame, not for the sight line (they climb out from behind the cliff on purpose).
//  3. the run between pads: the next pad shows at the frame edge while the team is on the bridge
// Usage: PLAYWRIGHT_PATH=... timeout 1800 node games/ai-sinh-ton/tools/cam-test.mjs [--stages=3,8] [--phones=s22] [--quick]
//        AST_BASE=http://... runs it on another build (the before numbers).
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open as openPage, checker, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'cam'); fs.mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2); const arg = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const QUICK = argv.includes('--quick');
const STAGES = arg('stages') ? arg('stages').split(',').map(Number) : (QUICK ? [8] : [1, 3, 8, 15, 24]);
const PHONES = arg('phones') ? arg('phones').split(',') : ['s22', 'xiaomi'];
const TAG = arg('tag') || (process['env'].AST_BASE ? 'before' : 'after');
// the HUD in design px (frame 780 wide, js/ui/hud.js): the top bar across the frame, the boss bar while a boss lives,
// the hero card block with its flame headroom
const PLAY = { top: 41, boss: { x0: 240, x1: 540, y: 68 }, cards: { x0: 236, x1: 544, y: 252 } };
const MCD = { pitch: 47, fov: 27, edge: 36, heroFill: 0.107, groundAcross: 32, feetY: 0.50 };
const STEP = 0.25; const LIMIT = 900;
const T0 = Date.now();
const { check, done } = checker();

// installed in the page: one sample of every living unit's screen box
const SAMPLER = ([PLAY]) => {
  const G = window.__G; const H = G.host; const T = H.THREE; const V = new T.Vector3(); const head = new T.Vector3();
  const ray = new T.Raycaster(); const dir = new T.Vector3(); const at = new T.Vector3();
  window.__camAgg = { n: {}, bad: {}, hid: {}, rays: {}, worst: {} };
  const px = (x, y, z) => { V.set(x, y, z).project(H.camera); const u = H.size.u || 1; return [(V.x + 1) / 2 * H.size.w / u, (1 - V.y) / 2 * H.size.h / u, V.z]; };
  window.__camSample = (rays) => {
    const B = G.B; if (!B) return; const A = window.__camAgg; const hd = H.size.h / (H.size.u || 1); const wd = H.size.w / (H.size.u || 1);
    const meshes = []; if (rays) H.scene.traverse((o) => { if (o.isMesh && o.name === 'pad' && o.visible) meshes.push(o); });
    if (rays) H.scene.updateMatrixWorld(true);
    for (const u of B.units) {
      if (!u.alive) continue; const n = G.actors.nodeOf(u.uid); if (!n) continue;
      const cat = u.boss ? 'boss' : u.hero ? 'hero' : u.team === 0 ? 'ally' : 'monster';
      if (!G.actors.headPos(u.uid, head)) continue;
      const tall = u.hero ? 2.6 : u.summon ? 1.6 : 2.05 * (G.actors.scaleOf(u.uid) || 1);
      const fx = head.x; const fz = head.z; const hy = head.y; const fy = hy - tall;
      const hw = u.boss ? Math.max(0.6, (H.widthOf ? H.widthOf(u.uid) : 2) / 2) : u.hero ? 0.45 : Math.max(0.3, 0.3 * (hy - fy));
      let x0 = 1e9; let x1 = -1e9; let y0 = 1e9; let y1 = -1e9;
      for (const [dx, y] of [[-hw, fy], [hw, fy], [-hw, hy], [hw, hy], [0, fy], [0, hy]]) { const p = px(fx + dx, y, fz); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      // the unit's box may poke 2 px into a band; anything more is covered
      const outF = x0 < -2 || x1 > wd + 2 || y0 < -2 || y1 > hd + 2;
      const bossOn = B.boss && B.byUid.get(B.boss) && B.byUid.get(B.boss).alive;
    if (bossOn && G.cam.bossFit) { const d = H.camera.position.distanceTo(G.cam.focus); A.bossDist = Math.max(A.bossDist || 0, d); A.bossFit = G.cam.bossFit; }
      const underTop = y0 < PLAY.top - 2 || (bossOn && x1 > PLAY.boss.x0 + 2 && x0 < PLAY.boss.x1 - 2 && y0 < PLAY.boss.y - 2);
      const underCards = x1 > PLAY.cards.x0 + 2 && x0 < PLAY.cards.x1 - 2 && y1 > PLAY.cards.y + 2;
      A.n[cat] = (A.n[cat] || 0) + 1;
      const why = outF ? 'out' : underTop ? 'top' : underCards ? 'cards' : '';
      if (why) { A.bad[cat] = (A.bad[cat] || 0) + 1; A.bad[cat + ':' + why] = (A.bad[cat + ':' + why] || 0) + 1; if (!A.worst[cat + ':' + why]) A.worst[cat + ':' + why] = `wave ${B.wave} t ${B.t ? B.t.toFixed(1) : '?'} ${why} box ${x0.toFixed(0)},${y0.toFixed(0)}-${x1.toFixed(0)},${y1.toFixed(0)} at ${fx.toFixed(1)},${fy.toFixed(1)},${fz.toFixed(1)} h ${(hy - fy).toFixed(1)}`; }
      // a monster still climbing over the rim (feet under the floor) is meant to be half behind the cliff: not a sight line
      if (rays && fy > -0.3 && (cat !== 'monster' || (u.uid % 3) === 0)) {
        at.set(fx, (fy + hy) / 2, fz); dir.copy(at).sub(H.camera.position); const far = dir.length(); dir.normalize();
        ray.set(H.camera.position, dir); ray.far = far - 0.5; A.rays[cat] = (A.rays[cat] || 0) + 1;
        if (ray.intersectObjects(meshes, false).length) A.hid[cat] = (A.hid[cat] || 0) + 1;
      }
    }
  };
};

const RUN = ([limit, step]) => {
  const G = window.__G; const B = G.B; let t = 0; let k = 0;
  while (t < limit && (B.phase === 'fight' || B.phase === 'pick')) { window.__sim(step); t += step; window.__camSample((k++ % 4) === 0); }
  return { phase: B.phase, wave: B.wave, t };
};

// the camera's numbers in this page
const NUMBERS = () => {
  const G = window.__G; const H = G.host; const cam = H.camera; const T = H.THREE; const V = new T.Vector3(); const u = H.size.u || 1; const hd = H.size.h / u; const wd = H.size.w / u;
  const P = (x, y, z) => { V.set(x, y, z).project(cam); return [(V.x + 1) / 2 * wd, (1 - V.y) / 2 * hd]; };
  const f = G.cam.focus || { x: 0, z: 0 }; const fx = f.x || 0; const fz = f.z || 0;
  const dir = new T.Vector3(); cam.getWorldDirection(dir); const pitch = Math.asin(-dir.y) * 180 / Math.PI; const yaw = Math.atan2(dir.x, -dir.z) * 180 / Math.PI;
  // block grid edges: the world grid runs along (1, 1) and (1, -1) (js/view/pad.js)
  const a0 = P(fx, 0, fz); const a1 = P(fx + 0.7071, 0, fz + 0.7071); const a2 = P(fx + 0.7071, 0, fz - 0.7071);
  const ang = (p) => Math.abs(Math.atan2(p[1] - a0[1], p[0] - a0[0]) * 180 / Math.PI);
  const e1 = ang(a1); const e2 = 180 - ang(a2);
  const top = P(fx, 2.7, fz); const hero = (a0[1] - top[1]) / hd;
  const one = P(fx + 1, 0, fz); const pxm = one[0] - a0[0];
  const dist = cam.position.distanceTo(new T.Vector3(fx, 0, fz));
  // where the heroes stand (mean foot point) as a share of the height
  let n = 0; let sy = 0; for (const h of G.B.heroes) { if (!h.alive) continue; const nd = G.actors.nodeOf(h.uid); if (!nd) continue; sy += P(nd.position.x, 0, nd.position.z)[1]; n++; }
  return { w: wd, h: hd, pitch: +pitch.toFixed(1), yaw: +yaw.toFixed(1), fov: cam.fov, dist: +dist.toFixed(1), edge: [+e1.toFixed(1), +(e2 > 90 ? 180 - e2 : e2).toFixed(1)], heroFill: +hero.toFixed(3), pxPerM: +pxm.toFixed(1), groundAcross: +(wd / pxm).toFixed(1), feetY: n ? +(sy / n / hd).toFixed(3) : null };
};

// the run to pad 2: where the next pad lies on screen when the team is halfway over the bridge
const RUNSHOT = () => {
  const G = window.__G; const H = G.host; const W = H.world; const u = H.size.u || 1; const T = H.THREE; const V = new T.Vector3(); H.sectionLock = true;
  W.travelTo(1); let n = 0; while (W.busy && n < 600 && Math.hypot(W.shift.x, W.shift.z) < W.walkBridge().midAt * 0.5) { window.__step(1); n++; }
  // before the run starts: is the next pad's centre and nearest floor in view
  return { steps: n };
};
const NEXTPAD = () => {
  const G = window.__G; const H = G.host; const W = H.world; const u = H.size.u || 1; const T = H.THREE; const V = new T.Vector3();
  const c = W.map.centres[W.sec + 1]; const c0 = W.map.centres[W.sec]; if (!c) return null;
  const dx = c.x - c0.x - W.shift.x; const dy = c.y - c0.y - W.shift.y; const dz = c.z - c0.z - W.shift.z;
  // sample the line from here to the next pad's centre: the share of the frame width covered by its floor
  let inside = 0; let first = null;
  for (let i = 0; i <= 40; i++) { const t = i / 40; V.set(dx * (0.45 + 0.55 * t), dy, dz * (0.45 + 0.55 * t)).project(H.camera); if (Math.abs(V.x) <= 1 && Math.abs(V.y) <= 1) { inside++; if (first === null) first = t; } }
  return { inside, of: 41, dist: +Math.hypot(dx, dz).toFixed(1) };
};

const srv = await serve();
const br = await launch();
const res = {};
try {
  // ---- 1. numbers ----
  for (const phone of [...PHONES, 'desktop']) {
    const r = await openPage(br, srv.base, phone, 'autostart=1&stage=3&noaudio=1&seed=3&q=low', { freeze: true });
    await r.page.evaluate(() => window.__sim(2));
    const N = await r.page.evaluate(NUMBERS); res[phone] = { N };
    console.log(`${TAG} ${phone} ${N.w}x${N.h}: pitch ${N.pitch} (MCD ${MCD.pitch}), yaw ${N.yaw}, lens ${N.fov} (MCD ${MCD.fov}), distance ${N.dist} m, block edges ${N.edge.join(' / ')} deg (MCD ${MCD.edge}), 2.7 m hero ${N.heroFill} of the height (MCD ${MCD.heroFill}), ${N.pxPerM} px/m, ${N.groundAcross} m across (MCD ${MCD.groundAcross} at 16:9), heroes' feet at ${N.feetY} (MCD ${MCD.feetY})`);
    // ---- 3. the run: the next pad in view at rest and mid-run ----
    const rest = await r.page.evaluate(NEXTPAD);
    await r.page.evaluate(RUNSHOT); const mid = await r.page.evaluate(NEXTPAD);
    await r.page.locator('#frame').screenshot({ path: path.join(OUT, `${TAG}-${phone}-walk.png`) });
    res[phone].next = { rest, mid };
    console.log(`${TAG} ${phone}: next pad on the line to its centre: ${rest ? rest.inside : '-'} of 41 samples in view at rest, ${mid ? mid.inside : '-'} mid-run`);
    await r.ctx.close();
  }
  // ---- 2. whole fights ----
  for (const phone of PHONES) for (const s of STAGES) {
    const r = await openPage(br, srv.base, phone, `autostart=1&stage=${s}&autoult=1&autopick=1&noaudio=1&seed=${s}&q=low`, { freeze: true });
    await r.page.evaluate(SAMPLER, [PLAY]);
    const end = await r.page.evaluate(RUN, [LIMIT, STEP]);
    let A = await r.page.evaluate(() => window.__camAgg);
    if (!A.n.boss) { // the team fell before the boss wave: play the boss wave alone
      await r.page.evaluate(([n]) => { window.__G.start(n, { seed: n, wave: 5, auto: { ult: true, pick: 'best' } }); }, [s]);
      end.boss = await r.page.evaluate(RUN, [LIMIT, STEP]); A = await r.page.evaluate(() => window.__camAgg);
    }
    const errs = r.problems.filter((x) => !/Failed to load resource/.test(x));
    await r.ctx.close();
    const line = ['hero', 'monster', 'boss', 'ally'].filter((c) => A.n[c]).map((c) => `${c} ${A.n[c] - (A.bad[c] || 0)}/${A.n[c]} clear (top ${A.bad[c + ':top'] || 0}, cards ${A.bad[c + ':cards'] || 0}, out ${A.bad[c + ':out'] || 0}), hidden ${A.hid[c] || 0}/${A.rays[c] || 0}`).join('; ');
    console.log(`${TAG} ${phone} stage ${s} (${end.phase} at wave ${end.wave}${end.boss ? ', boss wave replayed' : ''}, ${Math.round((Date.now() - T0) / 1000)} s): ${line}`);
    if (A.bossFit) console.log(`   boss framing: boss ${A.bossFit.head} m tall (with flight), ${A.bossFit.wide} m wide -> distance ${A.bossFit.dist} m (wave pads ${res[phone].N.dist} m): hero ${(0.107 * res[phone].N.dist / A.bossFit.dist).toFixed(3)} of the frame height`);
    for (const c of Object.keys(A.worst)) console.log(`   first ${c} covered: ${A.worst[c]}`);
    res[phone][s] = A;
    for (const c of ['hero', 'monster', 'boss']) {
      const n = A.n[c] || 0; const bad = A.bad[c] || 0;
      if (c === 'boss') check(n > 0 && bad === 0, `${phone} stage ${s}: boss inside the frame, under the top band and off the cards in every sample (${bad} of ${n} covered)`);
      else if (n) check(bad <= n * 0.005, `${phone} stage ${s}: ${c}s clear of the HUD and inside the frame (${bad} of ${n} samples covered, <= 0.5%)`);
      const rays = A.rays[c] || 0; const hid = A.hid[c] || 0;
      if (rays) check(hid <= rays * 0.02, `${phone} stage ${s}: ${c} sight lines blocked by world blocks ${hid} of ${rays} (<= 2%)`);
    }
    check(errs.length === 0, `${phone} stage ${s}: no console problems ${errs.slice(0, 2).join(' | ')}`);
  }
  // ---- MCD match on this tree ----
  if (TAG === 'after') for (const phone of PHONES) {
    const N = res[phone].N;
    check(Math.abs(N.pitch - MCD.pitch) <= 1.5, `${phone}: pitch ${N.pitch} within 1.5 deg of MCD's ${MCD.pitch}`);
    check(N.edge.every((e) => Math.abs(e - MCD.edge) <= 3), `${phone}: block edges at ${N.edge.join(' / ')} deg on screen, MCD ${MCD.edge} +- 3`);
    check(N.heroFill >= 0.085 && N.heroFill <= MCD.heroFill + 0.005, `${phone}: hero ${N.heroFill} of the frame height (MCD ${MCD.heroFill}; never bigger, at least 0.085)`);
    check(res[phone].next.mid && res[phone].next.mid.inside > 0, `${phone}: the next pad shows in the frame mid-run (${res[phone].next.mid ? res[phone].next.mid.inside : 0} samples)`);
  }
  fs.writeFileSync(path.join(OUT, `${TAG}.json`), JSON.stringify(res, null, 1));
} finally { await br.close(); srv.close(); }
console.log(`elapsed ${Math.round((Date.now() - T0) / 1000)} s`);
done();
