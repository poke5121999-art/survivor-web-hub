// The five first-generation bosses' skill animations, the boss on the stage-select diorama, and hit-stop under a long frame.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/boss-test.mjs [--tag before|after] [--only giant,queen]
// Pictures go to .chk/boss/: <boss>-<slot>.png (a strip over each cast) and diorama-<tag>-s<n>.png.
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'boss');
fs.mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const TAG = arg('--tag', 'after');
const ONLY = arg('--only', '').split(',').filter(Boolean);
const PARTS = arg('--parts', 'anim,diorama,hitstop').split(',');
const { check, done } = checker();

// stage n's boss is BOSSES[n - 1]
const BOSSES = ['giant', 'thrower', 'phantom', 'queen', 'brood'];
// Thresholds, each set from the numbers this tool prints (see the report): a cast's own pose contribution at its peak, in
// radians plus world units summed over every joint of the body; the mean distance between two skills' pose tracks; and what a
// pose may leave behind on the channels the pool never drives once the cast is over
const PEAK_MIN = 1.2;
const APART_MIN = 0.6;
const LEFT_MAX = 0.02;
// the diorama's own draw calls per campaign stage with the old boxed boss (measured, BEFORE). The five first bosses' real
// models draw no more than the boxes did; the six kit bosses' real models are 65 to 115 meshes and draw up to 88 more (dragon
// 121 -> 209, measured), so their growth is held at 90
const DIO_DRAWS_BEFORE = [117, 91, 106, 93, 129, 97, 115, 91, 110, 112, 104, 91, 99, 107, 109, 91, 107, 93, 110, 121, 109, 79, 102, 88, 111, 89, 107, 105, 110, 121];
const DIO_KIT_GROWTH = 90;

const shot = async (page, file) => { await page.locator('#frame').screenshot({ path: path.join(OUT, file) }); return path.join(OUT, file); };
// a close crop around the boss (its box through the battle camera, padded), the size a player sees it at on a phone
const bossShot = async (page, file) => {
  const clip = await page.evaluate(() => {
    const { G, u } = window.__bt; const H = G.host; const n = G.actors.nodeOf(u.uid); const fr = document.getElementById('frame').getBoundingClientRect();
    const sc = G.actors.scaleOf(u.uid); const v = new H.THREE.Vector3(); const px = (y) => { v.set(n.position.x, y, n.position.z).project(H.camera); return [fr.left + (v.x + 1) / 2 * fr.width, fr.top + (1 - v.y) / 2 * fr.height]; };
    const foot = px(0); const hw = new H.THREE.Vector3(); n.updateMatrixWorld(true); const pz = G.host.G.zombies.list.find((q) => q.body.root === n); pz.body.head.getWorldPosition(hw); const head = px(hw.y + 0.6 * sc);
    const h = Math.min(fr.height, Math.max(150, (foot[1] - head[1]) * 2.4)); const w = h * 1.2; const cx = foot[0]; const cy = (foot[1] + head[1]) / 2;
    const x = Math.max(fr.left, Math.min(fr.right - w, cx - w / 2)); const y = Math.max(fr.top, Math.min(fr.bottom - h, cy - h / 2));
    return { x, y, width: w, height: h };
  });
  await page.screenshot({ path: path.join(OUT, file), clip }); return path.join(OUT, file);
};

// page side: start stage n's boss wave with every skill unlocked, the boss unkillable, and a hook that records the boss body
// right after the pool posed it (pre) and after actors.sync finished (post): post minus pre is the cast pose alone
const SETUP = async ([n, kind, clean]) => {
  const G = window.__G; const v = (document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0];
  window.__SIM = window.__SIM || await import(new URL('js/sim/battle.js' + v, location.href).href);
  const sc = G.screens && G.screens[G.screen]; if (sc && sc.hide) sc.hide();
  if (G.juice) G.juice.enabled = false;
  const base = G.stageDef(n);
  const def = clean ? { ...base, hpMul: 1e6, atkMul: 1e-4, bossTier: 3, waves: [{ groups: [{ kind, n: 1, at: 0, ang: 1.6, spread: 0.1 }], boss: null }] } : { ...base, hpMul: 1e6, atkMul: 1e-4, bossTier: 3 };
  const B = G.start({ custom: def }, { seed: 7, wave: clean ? 1 : 5, team: ['thep', 'mua', 'yta', 'bang'] });
  G.paused = true;
  const SIM = window.__SIM; let k = 0;
  const boss = () => B.enemies.find((e) => e.boss && e.alive);
  while (k++ < 30 * 30 && !(boss() && boss().spawnT <= 0)) SIM.step(B);
  const u = boss(); if (!u) return { err: 'no boss on stage ' + n };
  for (const s of u.skills) s.cd = 999;
  for (let i = 0; i < 20; i++) { SIM.step(B); window.__step(2); }
  // the overview camera, the one a player watches; a flying boss sits at its top edge, so its pictures follow it instead
  G.cam.spectate(clean && u.fly ? u.uid : 0); window.__step(90);
  const pool = G.host.G.zombies.list;
  const body = () => { const r = G.actors.nodeOf(u.uid); const z = pool.find((q) => q.body.root === r); return z && z.body; };
  const nodes = () => { const out = []; body().root.traverse((o) => out.push(o)); return out; };
  // every joint's rotation and position, the root's own heading and position left out (that is the walk, not the pose)
  const snap = () => { const a = []; for (const o of nodes()) { const root = o === body().root; a.push(o.rotation.x, root ? 0 : o.rotation.y, o.rotation.z); if (!root) a.push(o.position.x, o.position.y, o.position.z); } return a; };
  const names = []; for (const o of nodes()) { const root = o === body().root; const id = (o.type || '') + ':' + (o.parent ? o.parent.children.indexOf(o) : 0) + (o.isInstancedMesh ? 'I' : ''); for (const c of root ? ['rx', 'ry', 'rz'] : ['rx', 'ry', 'rz', 'px', 'py', 'pz']) names.push(id + '.' + c); }
  const Z = G.host.G.zombies; const st = { pre: null, post: null };
  if (!Z.__wrapped) { const orig = Z.update; Z.update = function (dt) { const r = orig.call(this, dt); if (window.__bt && window.__bt.snap) window.__bt.st.pre = window.__bt.snap(); return r; }; Z.__wrapped = true; }
  const frame = () => { SIM.step(B); window.__step(2); return { pre: st.pre, post: snap() }; };
  const casts = [];
  G.on((e) => { if (e.e === 'cast' && e.uid === u.uid) casts.push({ slot: e.slot, t: B.t }); });
  window.__bt = { G, B, u, st, snap, frame, casts, SIM, names };
  return { uid: u.uid, kind: u.kind, skills: u.skills.map((s) => [s.slot, s.def.name, s.def.fx, s.def.lock || 1]) };
};

// one skill through the sim's own cast path: the other skills held on cooldown, this one ready; the boss casts it as soon as
// its own `when` holds. Returns the frames of the cast (pose contribution per frame) and the pool's own output around it.
const CAST = async ([slot, phase]) => {
  const { B, u, st, frame, casts } = window.__bt;
  const l1 = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t; };
  if (phase === 'start') {
    // let any earlier cast finish, then record the idle pool output for a second
    for (let i = 0; i < 60; i++) frame();
    const idle = []; for (let i = 0; i < 30; i++) idle.push(frame().pre);
    for (const s of u.skills) s.cd = s.slot === slot ? 0 : 999;
    const n0 = casts.length; let k = 0;
    while (casts.length === n0 && k++ < 30 * 20) { const f = frame(); idle.push(f.pre); idle.shift(); }
    for (const s of u.skills) s.cd = 999;
    if (casts.length === n0) return { err: 'no cast of ' + slot };
    // the frame the cast fired in already carries the pose's first frame
    window.__bt.idle = idle.slice(0, -1); window.__bt.rows = []; window.__bt.t0 = B.t;
    return { ok: true };
  }
  // advance `phase` sim ticks and record each
  const rows = window.__bt.rows;
  for (let i = 0; i < phase; i++) { const f = frame(); rows.push({ t: B.t - window.__bt.t0, c: f.post.map((x, j) => x - f.pre[j]), pre: f.pre }); }
  return { t: B.t - window.__bt.t0, mag: rows.length ? l1(rows[rows.length - 1].c, rows[rows.length - 1].c.map(() => 0)) : 0 };
};
// summary of the recorded cast: the contribution sampled at ten points of its window, its peak, and what is left after
const SUMMARY = (dur) => {
  const { rows, idle, G, u } = window.__bt;
  const mag = (c) => c.reduce((s, x) => s + Math.abs(x), 0);
  const samples = []; for (let k = 0; k < 10; k++) { const t = (k + 0.5) / 10 * dur; let best = rows[0]; for (const r of rows) if (Math.abs(r.t - t) < Math.abs(best.t - t)) best = r; samples.push(best.c); }
  const peak = Math.max(...rows.filter((r) => r.t <= dur).map((r) => mag(r.c)));
  const last = rows[rows.length - 1];
  // channels the pool never moved in the idle second before the cast nor in the tail after it must be back at their idle value
  const tail = rows.slice(-10).map((r) => r.pre); const flat = (list, j) => { let lo = 1e9, hi = -1e9; for (const s of list) { lo = Math.min(lo, s[j]); hi = Math.max(hi, s[j]); } return hi - lo < 1e-5; };
  // a channel the pool drives (a stepping leg) moves in the tail too: only channels still both before and after can hold a left-over pose
  // and only channels the pose itself wrote: the pool keeps a little of a jump or a hit on others for a while
  const wrote = (j) => rows.some((r) => Math.abs(r.c[j]) > 1e-4);
  const still = []; for (let j = 0; j < idle[0].length; j++) if (flat(idle, j) && flat(tail, j) && wrote(j)) still.push(j);
  let left = 0; const worst = []; for (const j of still) { const d = Math.abs(last.pre[j] - idle[idle.length - 1][j]); left += d; if (d > 0.005) worst.push([j, +d.toFixed(3)]); }
  if (window.__bt.names) worst.forEach((w) => w.push(window.__bt.names[w[0]]));
  window.__bt.worst = worst;
  return { samples, peak, left: left + mag(last.c), still: still.length, live: G.actors.bossActs.has(u.uid), n: rows.length, worst: window.__bt.worst };
};

const srv = await serve();
const br = await launch();
const T0 = Date.now();
try {
  if (PARTS.includes('anim')) {
    const { ctx, page, problems } = await open(br, srv.base, 's22', 'noaudio=1&seed=7');
    for (let n = 1; n <= 5; n++) {
      const kind = BOSSES[n - 1]; if (ONLY.length && !ONLY.includes(kind)) continue;
      const tracks = [];
      // measured on the stage's own boss wave; pictured again alone on the floor, where nothing stands in front of it
      for (const clean of [false, true]) {
      const info = await page.evaluate(SETUP, [n, kind, clean]);
      if (info.err) { check(false, `${kind}: ${info.err}`); continue; }
      const idleShot = clean ? await bossShot(page, `${kind}-idle.png`) : null;
      if (!clean) tracks.length = 0;
      for (const [slot, name, fx, lock] of info.skills) {
        const dur = lock + 0.3;
        const r = await page.evaluate(CAST, [slot, 'start']);
        if (r.err) { check(false, `${kind} ${name}: ${r.err}`); continue; }
        if (clean) {
          // five pictures over the cast, then one past its end
          const files = [idleShot]; let t = 0;
          for (const a of [0.12, 0.3, 0.5, 0.7, 0.9].map((k) => k * dur)) { const q = await page.evaluate(CAST, [slot, Math.max(1, Math.round((a - t) * 30))]); t = q.t; files.push(await bossShot(page, `.${kind}-${slot}-${files.length}.png`)); }
          await page.evaluate(CAST, [slot, Math.round((dur - t + 0.7) * 30)]); files.push(await bossShot(page, `.${kind}-${slot}-after.png`));
          sheet(files, path.join(OUT, `${kind}-${slot}.png`), files.length, 220);
          for (const f of files.slice(1)) fs.rmSync(f, { force: true });
          continue;
        }
        await page.evaluate(CAST, [slot, Math.round((dur + 0.7) * 30)]);
        const s = await page.evaluate(SUMMARY, dur);
        tracks.push({ slot, name, fx, ...s });
        if (s.worst.length) console.log('    left on', JSON.stringify(s.worst.slice(0, 6)));
        console.log(`  ${kind} ${slot} ${name} (${fx}): peak ${s.peak.toFixed(2)}, left after ${s.left.toFixed(3)} on ${s.still} still channels, pose live after ${s.live}, ${s.n} frames`);
        check(s.peak >= PEAK_MIN, `${kind} ${name}: the cast moves the body off the pool's pose by ${s.peak.toFixed(2)} at its peak (>= ${PEAK_MIN})`);
        check(!s.live && s.left <= LEFT_MAX, `${kind} ${name}: back to idle 0.7 s after the cast: ${s.left.toFixed(3)} left (<= ${LEFT_MAX}), pose ${s.live ? 'still live' : 'gone'}`);
      }
      }
      // every pair of skills of one boss
      const mean = (a, b) => { let t = 0; for (let k = 0; k < a.samples.length; k++) for (let j = 0; j < a.samples[k].length; j++) t += Math.abs(a.samples[k][j] - b.samples[k][j]); return t / a.samples.length; };
      const pairs = [];
      for (let i = 0; i < tracks.length; i++) for (let j = i + 1; j < tracks.length; j++) pairs.push([tracks[i].name + '/' + tracks[j].name, mean(tracks[i], tracks[j])]);
      const worst = pairs.reduce((m, p) => (p[1] < m[1] ? p : m), ['-', 1e9]);
      console.log(`  ${kind} pairs: ` + pairs.map((p) => `${p[0]} ${p[1].toFixed(2)}`).join(', '));
      check(worst[1] >= APART_MIN, `${kind}: every two skills differ in pose, the closest pair ${worst[0]} by ${worst[1].toFixed(2)} on average over the cast (>= ${APART_MIN})`);
    }
    check(problems.length === 0, `animations: no page problems ${problems.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }

  if (PARTS.includes('diorama')) {
    const { ctx, page, problems } = await open(br, srv.base, 's22', 'noaudio=1');
    await page.waitForFunction('!!window.__dio', null, { timeout: 30000 }).catch(() => {});
    const has = await page.evaluate(() => !!window.__dio);
    check(has, 'diorama: window.__dio is there');
    if (has) {
      const files = [];
      for (let n = 1; n <= 5; n++) {
        const kind = BOSSES[n - 1];
        // the home screen dresses the diorama for the stage it shows; the test picks the stage itself
        const m = await page.evaluate(async ([n2, k]) => {
          const D = window.__dio; const G = window.__G; const H = G.host; const THREE = H.THREE; const r = H.renderer;
          if (G.screen !== 'home' && G.goto) G.goto('home', {});
          D.dress(n2); await new Promise((res) => setTimeout(res, 700));
          const b = D.boss; if (!b) return { err: 'no boss' };
          // the boss's visible geometries against a battle body of the same zombie type
          // (only meshes on the camera's layer: the pool meshes a shell replaces stay in the tree, off the layer)
          const geos = new Set(); b.updateMatrixWorld(true); b.traverseVisible((o) => { if (o.isMesh && o.geometry && (o.layers.mask & 1)) geos.add(o.geometry.uuid); });
          const pool = H.G.zombies.list; const T = window.BZ.ZOMBIES[k];
          const ref = pool.find((z) => z.T === T) || null; const refGeos = new Set();
          if (ref) ref.body.root.traverse((o) => { if (o.isMesh && o.geometry) refGeos.add(o.geometry.uuid); });
          const qv = (document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0];
          const FB = await import(new URL('js/view/foe/bosses.js' + qv, location.href).href); for (const g of FB.shellGeos(k)) refGeos.add(g.uuid);
          let same = 0; for (const g of geos) if (refGeos.has(g)) same++;
          // the boss's box corners through the diorama camera, in the camera's -1..1 frame
          const box = new THREE.Box3(); b.traverseVisible((o) => { if (o.isMesh) box.expandByObject(o); }); const v = new THREE.Vector3(); let lo = [9, 9], hi = [-9, -9];
          for (let i = 0; i < 8; i++) { v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(D.node.camera); lo = [Math.min(lo[0], v.x), Math.min(lo[1], v.y)]; hi = [Math.max(hi[0], v.x), Math.max(hi[1], v.y)]; }
          // the diorama's own draws: its scene rendered once into its target
          const vp = D.node.vp; const c0 = r.info.render.calls; r.setRenderTarget(vp.rt); r.render(vp.scene, vp.cam); r.setRenderTarget(null); const draws = r.info.render.calls - c0;
          let bossDraws = 0; b.traverseVisible((o) => { if (o.isMesh || o.isSprite) bossDraws += Array.isArray(o.material) ? o.material.length : 1; });
          return { geos: geos.size, same, ref: !!ref, lo, hi, draws, bossDraws, ui: window.__ui.drawCalls, h: box.max.y - box.min.y };
        }, [n, kind]);
        if (m.err) { check(false, `diorama ${kind}: ${m.err}`); continue; }
        const f = path.join(OUT, `diorama-${TAG}-s${n}.png`); await page.screenshot({ path: f }); files.push(f);
        console.log(`  diorama s${n} ${kind}: ${m.geos} visible geometries, ${m.same} shared with a battle ${kind} body (found ${m.ref}), frame x ${m.lo[0].toFixed(2)}..${m.hi[0].toFixed(2)} y ${m.lo[1].toFixed(2)}..${m.hi[1].toFixed(2)}, height ${m.h.toFixed(2)}, diorama draws ${m.draws} (boss ${m.bossDraws}), home ui draws ${m.ui}`);
        check(m.ref && m.geos > 0 && m.same >= m.geos * 0.9, `diorama ${kind}: the boss is the battle model (${m.same} of ${m.geos} visible geometries are a battle ${kind} body's)`);
        check(m.lo[0] >= -0.95 && m.hi[0] <= 0.95 && m.lo[1] >= -0.95 && m.hi[1] <= 0.95, `diorama ${kind}: the boss stays inside the frame (x ${m.lo[0].toFixed(2)}..${m.hi[0].toFixed(2)}, y ${m.lo[1].toFixed(2)}..${m.hi[1].toFixed(2)}, within +-0.95)`);
        check(m.draws <= DIO_DRAWS_BEFORE[n - 1] + 2, `diorama ${kind}: ${m.draws} draw calls (<= ${DIO_DRAWS_BEFORE[n - 1]} + 2, the boxed boss's count)`);
      }
      sheet(files, path.join(OUT, `diorama-${TAG}.png`), 3, 520);
      // the six kit bosses are dressed the same way: every campaign stage gets its boss on the diorama
      const all = await page.evaluate(async () => { const D = window.__dio; const out = []; for (let n2 = 1; n2 <= 30; n2++) { D.dress(n2); D.step(0.5); const b = D.boss; let vis = 0; if (b) b.traverseVisible((o) => { if (o.isMesh) vis++; }); const r = window.__G.host.renderer; const vp = D.node.vp; const c0 = r.info.render.calls; r.setRenderTarget(vp.rt); r.render(vp.scene, vp.cam); r.setRenderTarget(null); out.push([n2, window.__G.stageDef(n2).boss, vis, r.info.render.calls - c0]); } return out; });
      const empty = all.filter((x) => x[2] === 0);
      console.log('  diorama draws by stage: ' + all.map((x) => x[0] + ' ' + x[1] + ' ' + x[3]).join(', '));
      const grow = all.map((x) => [x[0], x[1], x[3] - DIO_DRAWS_BEFORE[x[0] - 1]]); const most = grow.reduce((m, g) => (g[2] > m[2] ? g : m));
      check(most[2] <= DIO_KIT_GROWTH, `diorama: draw calls grow by at most ${most[2]} over the boxed boss (stage ${most[0]} ${most[1]}; <= ${DIO_KIT_GROWTH})`);
      check(empty.length === 0, `diorama: all 30 campaign stages show a boss with meshes (${empty.length} empty: ${empty.map((x) => x[0] + ' ' + x[1]).join(', ')})`);
    }
    check(problems.length === 0, `diorama: no page problems ${problems.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }

  if (PARTS.includes('hitstop')) {
    const { ctx, page, problems } = await open(br, srv.base, 's22', 'noaudio=1&seed=9');
    // a hit-stop asked for, and the very next frame stalls for `stall` ms: the stop ends on the wall clock, so the sim loses the
    // asked time less what the loop's own 100 ms frame cap already cut from the stalled frame (that part never reaches the sim)
    const RUN = async ([stall, ms]) => {
      const G = window.__G; const J = G.juice;
      const sc = G.screens && G.screens[G.screen]; if (sc && sc.hide) sc.hide();
      G.start(3, { seed: 9, wave: 3, team: ['thep', 'mua', 'yta', 'gio'], hpFlat: 90000, atkFlat: 0, mul: 0.5, auto: { ult: false, pick: 'best' } });
      window.__sim(4); J.reset(); J.enabled = true; G.paused = false; G.speed = 1;
      const B = G.B; const rows = []; let game = 0; let last = 0; let hitAt = -1; let stallNext = false;
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      last = await raf();
      for (let i = 0; i < 120; i++) {
        const ts = await raf(); if (stallNext) { stallNext = false; const e = performance.now() + stall; while (performance.now() < e) { /* the long frame */ } }
        const raw = (ts - last) / 1000; game += Math.min(0.1, raw); last = ts;
        rows.push({ game, Bt: B.t, stopped: J.stopped, cut: Math.max(0, raw - 0.1) });
        if (i === 40) { J.hit(ms, { force: true }); hitAt = rows.length - 1; stallNext = stall > 0; }
      }
      G.paused = true;
      // sim clock minus game clock, averaged before the stop and well after it: the drop is the time the stop took
      const off = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += rows[i].Bt - rows[i].game; return s / (b - a); };
      const lost = (off(5, hitAt) - off(hitAt + 30, rows.length)) * 1000;
      const cut = rows.slice(hitAt, hitAt + 10).reduce((a, r) => a + r.cut, 0) * 1000;
      return { lost, cut, frames: rows.filter((r) => r.stopped).length, stops: J.stops.map((s) => [s.ms, Math.round(s.real || 0)]) };
    };
    for (const [stall, ms] of [[0, 120], [120, 120], [120, 55]]) {
      const r = await page.evaluate(RUN, [stall, ms]);
      console.log(`  hit-stop ${ms} ms, next frame ${stall} ms: game time lost ${r.lost.toFixed(1)} ms, frame cap cut ${r.cut.toFixed(1)} ms, ${r.frames} stopped frames, stops ${JSON.stringify(r.stops)}`);
      const want = ms - r.cut;
      check(Math.abs(r.lost - want) <= 17, `hit-stop ${ms} ms with a ${stall} ms frame right after it: the sim loses ${r.lost.toFixed(0)} ms of game time (asked ${ms} less ${r.cut.toFixed(0)} cut by the frame cap = ${want.toFixed(0)}, within one 60 Hz frame)`);
    }
    check(problems.length === 0, `hit-stop: no page problems ${problems.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
} finally {
  await br.close(); srv.close();
  console.log(`(${((Date.now() - T0) / 1000).toFixed(0)} s)`);
  done();
}
