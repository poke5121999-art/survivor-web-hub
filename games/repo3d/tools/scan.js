// Loot scan check (js/scan.js): first sight fires exactly once, a wall or 8 m+ stops it, a bot's sight does not fire it,
// at most SCAN.max sweeps at once, a hit on a seen item flashes its value red; fps >= 50 with 3 bots while sweeps run;
// mid-sweep picture sequences in two themes. Exit 1 on any failure.
// Usage: node tools/scan.js [--out <dir>] [--themes vampire,spacestation] [--no-fps]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : scratch('scan'); })();
const THEMES = (() => { const i = argv.indexOf('--themes'); return i >= 0 ? argv[i + 1].split(',') : ['vampire', 'spacestation']; })();
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 320) : ''}`); };
const BOTS = 'bots=tam:loot,dung:thu,khoi:soi';

const HELP = `(() => { const G = __G, nav = G.foes?.nav, P = G.player; window.__paused = true; __sim(1);
  const T = window.__T = {};
  const cells = () => nav.cells.filter((i) => nav.near[i] >= 2);
  // a, b: walkable cells d m apart; clear: open line 0.7 m wide (true) or a wall between them (false)
  T.pair = (d, clear = true) => { const sp = G.house.spawn; for (const i of cells()) { const a = nav.center(i); if (Math.hypot(a.x - sp.x, a.z - sp.z) < 5) continue;
    for (let k = 0; k < 16; k++) { const an = k * Math.PI / 8, b = { x: a.x + Math.cos(an) * d, z: a.z + Math.sin(an) * d }; const j = nav.nearest(b.x, b.z, 0);
      if (j < 0 || nav.near[j] < 2) continue;
      if (clear ? (nav.clear(a.x, a.z, b.x, b.z, 0.7) && nav.los(a.x, a.z, b.x, b.z)) : !nav.los(a.x, a.z, b.x, b.z)) return { a, b, dir: { x: Math.cos(an), z: Math.sin(an) } }; } } return null; };
  T.put = (x, z, lx, lz, ly) => { const h0 = G.house.heightAt(x, z); if (ly === undefined) ly = G.house.heightAt(lx, lz) + 0.25; else ly += G.house.heightAt(lx, lz); P.body.setTranslation({ x, y: (__G.house?.heightAt ? __G.house.heightAt(x, z) : 0) + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: (__G.house?.heightAt ? __G.house.heightAt(x, z) : 0) + 0.85, z });
    P.yaw = Math.atan2(-(lx - x), -(lz - z)); P.pitch = -Math.atan2(h0 + 1.2 - ly, Math.hypot(lx - x, lz - z)); __sim(0.02); };
  T.isolate = () => { for (const it of G.loot.items) it.seen = true; G.scan.reset(); };
  T.item = (x, z, o = {}) => { const s = CFG_SIZES[o.size || 'small']; return G.loot.spawn({ material: o.mat || 'ceramic', size: o.size || 'small', pos: { x, y: G.house.heightAt(x, z) + s.half * 1.3 + 0.05, z }, value: o.value }); };
  return true; })()`;
const PRE = (c) => c.replace('(() => {', '(() => { const G = __G, T = __T, P = G.player, nav = G.foes?.nav, S = G.scan;');

const CASES = {
  'first sight in the torch fires exactly once (look away and back: still once)': `(() => { T.isolate(); const pr = T.pair(5); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const it = T.item(pr.b.x, pr.b.z); __sim(0.5); const n1 = S.fired.get(it) || 0, lab = S.labels.some((l) => l.it === it), log = S.log.length;
    T.put(pr.a.x, pr.a.z, pr.a.x - pr.dir.x, pr.a.z - pr.dir.z); __sim(0.5); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); __sim(1);
    return { ok: n1 === 1 && (S.fired.get(it) || 0) === 1 && lab && log === 1 && it.seen, first: n1, after: S.fired.get(it), label: lab, log }; })()`,
  'behind a wall: no scan (walking round to see it: scans)': `(() => { T.isolate(); const pr = T.pair(4, false); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const it = T.item(pr.b.x, pr.b.z); __sim(1); const n0 = S.fired.get(it) || 0;
    let near = null; for (const i of nav.cells) { if (nav.near[i] < 2) continue; const c = nav.center(i), d = Math.hypot(c.x - pr.b.x, c.z - pr.b.z); if (d > 2 && d < 4 && nav.clear(c.x, c.z, pr.b.x, pr.b.z, 0.5)) { near = c; break; } }
    T.put(near.x, near.z, pr.b.x, pr.b.z); __sim(0.5);
    return { ok: n0 === 0 && (S.fired.get(it) || 0) === 1, behindWall: n0, inSight: S.fired.get(it) || 0 }; })()`,
  'beyond 8 m: no scan (6 m on the same line: scans)': `(() => { T.isolate(); const pr = T.pair(10); if (!pr) return { ok: false, err: 'no 10 m line' }; T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const it = T.item(pr.b.x, pr.b.z); __sim(1); const n0 = S.fired.get(it) || 0, d0 = Math.hypot(P.camPos.x - pr.b.x, P.camPos.z - pr.b.z);
    T.put(pr.a.x + pr.dir.x * 4, pr.a.z + pr.dir.z * 4, pr.b.x, pr.b.z); __sim(0.5);
    return { ok: n0 === 0 && (S.fired.get(it) || 0) === 1, far: n0, d0: +d0.toFixed(2), at6m: S.fired.get(it) || 0 }; })()`,
  'torch off and no lamp near: no scan': `(() => { T.isolate(); const pr = T.pair(4); const lamps = G.house.lamps.slice(); G.house.lamps.length = 0; G.torch.visible = false;
    T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); const it = T.item(pr.b.x, pr.b.z); __sim(0.5); const n0 = S.fired.get(it) || 0;
    G.torch.visible = true; G.house.lamps.push(...lamps); __sim(0.5);
    return { ok: n0 === 0 && (S.fired.get(it) || 0) === 1, dark: n0, torchOn: S.fired.get(it) || 0 }; })()`,
  'a bot looking at loot does not scan it': `(() => { T.isolate(); const b = G.bots.list[0]; G.bots.list.forEach((o) => { o.hold = true; }); const pr = T.pair(4);
    G.bots.teleport(b, pr.a.x, pr.a.z); b.yaw = Math.atan2(pr.b.x - pr.a.x, pr.b.z - pr.a.z);
    T.put(pr.a.x - pr.dir.x * 0.8, pr.a.z - pr.dir.z * 0.8, pr.a.x - pr.dir.x * 3, pr.a.z - pr.dir.z * 3);
    const it = T.item(pr.b.x, pr.b.z); __sim(1); return { ok: (S.fired.get(it) || 0) === 0 && !it.seen, fired: S.fired.get(it) || 0 }; })()`,
  'six items at once: at most 3 sweeps together, each fires once': `(() => { T.isolate(); const pr = T.pair(5); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const px = -pr.dir.z, pz = pr.dir.x, items = [];
    for (let k = 0; k < 6; k++) { const o = (k - 2.5) * 0.45; items.push(T.item(pr.a.x + pr.dir.x * 3.2 + px * o, pr.a.z + pr.dir.z * 3.2 + pz * o)); }
    let most = 0; for (let k = 0; k < 60; k++) { __sim(0.05); most = Math.max(most, S.active.length); }
    const counts = items.map((it) => S.fired.get(it) || 0);
    return { ok: most <= 3 && most >= 1 && counts.every((c) => c === 1), most, counts }; })()`,
  'a seen item that loses value flashes its new value in red': `(() => { T.isolate(); const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const it = T.item(pr.b.x, pr.b.z, { value: 900 }); __sim(2.5); const gone = !S.labels.some((l) => l.it === it);
    it.value -= 300; G.events.emit('loot:hit', { item: it, lost: 300, dv: 6, point: it.body.translation() }); __sim(0.05);
    const l = S.labels.find((x) => x.it === it), el = l && l.el;
    return { ok: gone && !!l && l.hit && el && el.classList.contains('hit') && el.textContent === '$600', faded: gone, text: el && el.textContent, cls: el && el.className }; })()`,
};

async function open(br, srv, q) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
  const page = await ctx.newPage(); const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(srv.base + '/games/repo3d/index.html?' + q);
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
  const fatal = await page.evaluate('window.__fatal || null'); if (fatal) throw new Error('fatal: ' + fatal);
  await page.evaluate(`window.CFG_SIZES = ${JSON.stringify({ small: { half: 0.17 }, medium: { half: 0.28 }, big: { half: 0.46 } })}`);
  await page.evaluate(HELP);
  return { ctx, page, logs };
}

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 300 s'); process.exit(2); }, 300000);
  try {
    let { ctx, page, logs } = await open(br, srv, `house=1&seed=7&foes=none&${BOTS}`);
    for (const [name, code] of Object.entries(CASES)) {
      let r; try { r = await page.evaluate(PRE(code)); } catch (e) { r = { ok: false, err: e.message.slice(0, 300) }; }
      check(!!r.ok, name, r);
    }
    const err = await page.evaluate('__errors.slice()');
    check(!err.length && !logs.length, 'cases: no console or page errors', err.concat(logs));
    await ctx.close();

    // mid-sweep sequences: three items (common, good, rare) 2.6 m ahead in the torch
    for (const theme of THEMES) {
      ({ ctx, page, logs } = await open(br, srv, `house=1&seed=7&foes=none&bots=0&theme=${theme}`));
      const st = await page.evaluate(PRE(`(() => { T.isolate(); const pr = T.pair(4.5); T.put(pr.a.x, pr.a.z, pr.a.x + pr.dir.x * 2.6, pr.a.z + pr.dir.z * 2.6, 0.3);
        const px = -pr.dir.z, pz = pr.dir.x, at = (o) => [pr.a.x + pr.dir.x * 2.6 + px * o, pr.a.z + pr.dir.z * 2.6 + pz * o];
        T.item(...at(-0.75), { size: 'small', mat: 'ceramic', value: 900 }); T.item(...at(0), { size: 'medium', mat: 'metal', value: 2600 }); T.item(...at(0.8), { size: 'medium', mat: 'soul', value: 7000 });
        let k = 0; while (!S.active.length && k++ < 40) __sim(1 / 60); return { fired: S.log.length, t: S.active[0] ? +S.active[0].t.toFixed(3) : null }; })()`));
      const shots = [];
      for (const [i, dt] of [[1, 0.1], [2, 0.15], [3, 0.15], [4, 0.6], [5, 1.6]]) {
        await page.evaluate(`__sim(${dt})`); await page.waitForTimeout(120);
        const f = path.join(OUT, `scan-${theme}-${i}.png`); await page.screenshot({ path: f }); shots.push(f);
      }
      const after = await page.evaluate(PRE(`(() => { return { fired: S.log.length, rims: S.rimPool.filter((m) => m.parent).length, labels: S.labels.length }; })()`));
      check(st.fired === 3 && after.fired === 3 && after.rims >= 2, `${theme}: three items scanned once, faint rims after the sweep`, { st, after });
      const e2 = await page.evaluate('__errors.slice()');
      check(!e2.length && !logs.length, `${theme}: no errors`, e2.concat(logs));
      console.log('  ' + shots.join('\n  '));
      await ctx.close();
    }

    if (!argv.includes('--no-fps')) {
      ({ ctx, page, logs } = await open(br, srv, `house=1&seed=7&${BOTS}`));
      // stress: 6 unseen items ahead of the player, re-armed every second, so 3 sweeps and the rims run the whole time
      await page.evaluate(PRE(`(() => { const pr = T.pair(5); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); const px = -pr.dir.z, pz = pr.dir.x; const items = [];
        for (let k = 0; k < 6; k++) { const o = (k - 2.5) * 0.45; items.push(T.item(pr.a.x + pr.dir.x * 3.2 + px * o, pr.a.z + pr.dir.z * 3.2 + pz * o)); }
        window.__rearm = setInterval(() => { for (const it of items) it.seen = false; }, 1000); window.__paused = false; return true; })()`));
      await page.waitForTimeout(2500);
      const f0 = await page.evaluate('__G.frames'), s0 = await page.evaluate('__G.scan.log.length'); await page.waitForTimeout(4000);
      const f1 = await page.evaluate('__G.frames'), s1 = await page.evaluate('__G.scan.log.length');
      const fps = (f1 - f0) / 4, bots = await page.evaluate('__G.bots.list.length');
      check(fps >= 50 && bots === 3 && s1 - s0 >= 12, 'fps >= 50 with 3 bots while sweeps run', { fps, bots, scans: s1 - s0 });
      await ctx.close();
    }
  } catch (e) { check(false, 'harness', e.stack || e.message); }
  finally {
    clearTimeout(kill); await br.close(); srv.close();
    const bad = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    console.log(`out: ${OUT}`);
    console.log(bad.length ? `${bad.length} FAILED` : `ALL PASS (${results.length})`);
    process.exit(bad.length ? 1 : 0);
  }
})();
