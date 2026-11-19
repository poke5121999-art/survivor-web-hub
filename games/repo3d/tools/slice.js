// Vertical-slice check: boots the page headless, runs the drop, carry and extract scenarios through
// the sim hooks, measures render fps, and saves screenshots. Exit code 1 when any assertion fails.
// Usage: node games/repo3d/tools/slice.js <outDir>
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch } = require('./pw.js');
const OUT = process.argv[2] || 'slice-out';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };

(async () => {
  const srv = await serve();
  const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout'); process.exit(2); }, 150000);
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'slice@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
    page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
    const t0 = Date.now();
    await page.goto(srv.base + '/games/repo3d/index.html?slice=1&seed=7');
    await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
    const fatal = await page.evaluate('window.__fatal || null');
    check(!fatal, 'boot', fatal || `${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (fatal) throw new Error('fatal');

    await page.evaluate('window.__paused = true; __sim(3.5)');
    const settled = await page.evaluate(`__G.loot.items.map(i => ({ m: i.material, s: i.size, v: i.value, v0: i.value0 }))`);
    check(settled.every((i) => i.v === i.v0), 'items settle without losing value during spawn grace', JSON.stringify(settled.filter((i) => i.v !== i.v0)));

    const drop = await page.evaluate(`(() => {
      const it = __G.loot.items.find(i => i.material === 'ceramic' && i.size === 'medium');
      const t = it.body.translation();
      it.body.setTranslation({ x: 1.0, y: 2.6, z: 1.0 }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      __sim(1.5);
      return { v0: it.value0, v: it.value, dead: !!it.dead, log: __G.log.slice() };
    })()`);
    check(drop.v < drop.v0, 'ceramic dropped from 2.6 m loses value', JSON.stringify(drop));

    const soft = await page.evaluate(`(() => {
      const it = __G.loot.items.find(i => i.material === 'metal' && i.size === 'small');
      const v0 = it.value;
      it.body.setTranslation({ x: 2.5, y: 0.6, z: 2.0 }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      __sim(1.2);
      return { before: v0, after: it.value };
    })()`);
    check(soft.after === soft.before, 'metal dropped from 0.6 m keeps value', JSON.stringify(soft));

    const carry = await page.evaluate(`(() => {
      const G = __G, P = G.player;
      const it = G.loot.items.find(i => i.material === 'wood' && i.size === 'medium');
      const pad = G.extract.pads[0];
      pad.quota = it.value;
      const tp = it.body.translation();
      P.body.setTranslation({ x: tp.x + 1.2, y: 0.85, z: tp.z + 0.6 }, true);
      __sim(0.2);
      const pp = P.body.translation();
      P.yaw = Math.atan2(-(tp.x - pp.x), -(tp.z - pp.z));
      __sim(0.05);
      const c = P.camPos;
      P.pitch = Math.atan2(tp.y - c.y, Math.hypot(tp.x - c.x, tp.z - c.z));
      __sim(0.02);
      const grabbed = G.grab.tryGrab();
      let speedLoaded = 0, stage = 0, released = false; const trace = [];
      const route = [{ x: 2.8, z: 1.6 }, { x: pad.x + 0.6, z: pad.z }];
      __sim(30, (i) => {
        const p = P.body.translation();
        if (i === 60) speedLoaded = P.speedMul;
        const ip = it.dead ? { x: pad.x, y: 0, z: pad.z } : it.body.translation();
        if (!released && Math.abs(ip.x - pad.x) < pad.half - 0.35 && Math.abs(ip.z - pad.z) < pad.half - 0.35) released = true;
        const goal = released ? pad : route[Math.min(stage, route.length - 1)];
        const dx = goal.x - p.x, dz = goal.z - p.z;
        if (!released && stage < route.length - 1 && Math.hypot(dx, dz) < 0.5) stage++;
        let d = Math.atan2(-dx, -dz) - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        const there = Math.hypot(dx, dz) < 0.4;
        if (i % 60 === 0) trace.push([i / 60, +p.x.toFixed(2), +p.z.toFixed(2), +ip.x.toFixed(2), +ip.y.toFixed(2), +ip.z.toFixed(2), !!G.grab.held, stage, released]);
        return { ...__IDLE, mz: there ? 0 : 1, dyaw: -d * 0.2, grab: !released };
      });
      return { grabbed, extracted: !!it.dead && G.extract.haul >= it.value, value: it.value, v0: it.value0, speedLoaded, haul: G.extract.haul, log: G.log.slice(-4), trace, pad: { v: pad.value, q: pad.quota, done: pad.done } };
    })()`);
    check(carry.grabbed, 'beam grabs the wooden crate', '');
    check(carry.speedLoaded > 0.4 && carry.speedLoaded < 0.6, 'medium item slows the carrier to 1/(1+24/30)', String(carry.speedLoaded));
    check(carry.extracted, 'crate carried to the pad and extracted after a 3 s hold', JSON.stringify(carry));

    await page.evaluate(`(() => { const P = __G.player; P.body.setTranslation({ x: 0, y: 0.85, z: 2.5 }, true); P.yaw = Math.PI * 0.85; P.pitch = -0.15; __sim(0.1); })()`);
    await page.screenshot({ path: path.join(OUT, 'room.png') });
    await page.evaluate('window.__paused = false');
    const f0 = await page.evaluate('__G.frames');
    await page.waitForTimeout(3000);
    const f1 = await page.evaluate('__G.frames');
    const fps = (f1 - f0) / 3;
    check(fps >= 50, 'render fps >= 50 at 1280x720', fps.toFixed(1));
    const errs = await page.evaluate('__errors.slice()');
    check(errs.length === 0 && logs.length === 0, 'no console or page errors', JSON.stringify(errs.concat(logs)).slice(0, 400));
  } catch (e) {
    check(false, 'harness', e.message);
  } finally {
    clearTimeout(kill);
    await br.close();
    srv.close?.();
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    const bad = results.filter((r) => !r.ok).length;
    console.log(bad ? `${bad} FAILED` : 'ALL PASS');
    process.exit(bad ? 1 : 0);
  }
})();
