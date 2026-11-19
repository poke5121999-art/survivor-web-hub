// Audio check (js/audio.js): the context starts on a click, every sound of the table is synthesized, and each game event
// makes its sound: footsteps by floor (wood in the vampire house, stone in the pyramid), loot hit and break, foe roar on
// spotting and foe steps, heartbeat while hunted, door creak, pad hold ticks and the cash chord; the output is not silent.
// Usage: node tools/audio.js [--out <dir>]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : scratch('audio'); })();
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 300) : ''}`); };

const HELP = `(() => { const G = __G, nav = G.foes.nav, P = G.player, A = G.audio; window.__paused = true; __sim(0.5);
  const T = window.__T = {};
  T.n = (name, since = 0) => A.log.filter((l) => l[0] === name && l[1] >= since - 0.011).length;   // log times are rounded to 0.01
  T.pair = (d) => { const sp = G.house.spawn; for (const i of nav.cells) { if (nav.near[i] < 3) continue; const a = nav.center(i); if (Math.hypot(a.x - sp.x, a.z - sp.z) < 8) continue;
    for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4, b = { x: a.x + Math.cos(an) * d, z: a.z + Math.sin(an) * d }; const j = nav.nearest(b.x, b.z, 0);
      if (j < 0 || nav.near[j] < 2 || !nav.clear(a.x, a.z, b.x, b.z, 0.7) || !nav.los(a.x, a.z, b.x, b.z)) continue; return { a, b }; } } return null; };
  T.put = (x, z, lx, lz) => { P.body.setTranslation({ x, y: (__G.house?.heightAt ? __G.house.heightAt(x, z) : 0) + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: (__G.house?.heightAt ? __G.house.heightAt(x, z) : 0) + 0.85, z }); P.yaw = Math.atan2(-(lx - x), -(lz - z)); P.pitch = -0.05; __sim(0.05); };
  return true; })()`;

async function open(br, srv, q) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
  const page = await ctx.newPage(); const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(srv.base + '/games/repo3d/index.html?' + q);
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
  await page.mouse.click(640, 360);   // the user gesture that starts the AudioContext
  await page.evaluate(HELP);
  return { ctx, page, logs };
}

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 240 s'); process.exit(2); }, 240000);
  try {
    let { ctx, page, logs } = await open(br, srv, 'house=1&seed=7&theme=vampire&foes=none');
    const st = await page.evaluate(`(() => { const A = __G.audio; return { state: A.ctx && A.ctx.state, n: Object.keys(A.buffers).length, ms: +(A.synthMs || 0).toFixed(1) }; })()`);
    const total = await page.evaluate(`import('./js/audio.js').then((m) => m.SOUNDS.length)`);
    check(st.state === 'running' && st.n === total, 'a click starts the context and synthesizes every sound', { ...st, total });
    const walk = await page.evaluate(`(() => { const pr = __T.pair(9); __T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); const t0 = __G.audio.t; __sim(2.5, () => ({ ...__IDLE, mz: 1 })); return { wood: __T.n('step_wood', t0), stone: __T.n('step_stone', t0) }; })()`);
    check(walk.wood >= 4 && walk.stone === 0, 'walking 3 s on the vampire floors: wooden footsteps', walk);
    const lvl = await page.evaluate(`new Promise((res) => { __G.audio.play('hit_metal', null, 1); setTimeout(() => res(__G.audio.level()), 120); })`);
    check(lvl > 0.001, 'the output carries signal after a sound', { level: lvl });
    const loot = await page.evaluate(`(() => { const G = __G, P = G.player, t0 = G.audio.t, p = P.position;
      const a = G.loot.spawn({ material: 'metal', size: 'medium', value: 2000, pos: { x: p.x + 1.2, y: 2.2, z: p.z } });
      const b = G.loot.spawn({ material: 'ceramic', size: 'small', value: 600, pos: { x: p.x - 1.2, y: 0.6, z: p.z } });
      __sim(3.2); b.body.setLinvel({ x: 0, y: -25, z: 0 }, true); __sim(1);
      return { hit: __T.n('hit_metal', t0), brk: __T.n('break_ceramic', t0) + __T.n('hit_ceramic', t0), broke: b.dead }; })()`);
    check(loot.hit >= 1 && loot.brk >= 1, 'a dropped metal item clangs, a slammed ceramic one breaks or clinks', loot);
    const foe = await page.evaluate(`(() => { const G = __G, t0 = G.audio.t, pr = __T.pair(5); __T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
      const f = G.foes.spawn('gunner', pr.b.x, pr.b.z, { state: 'patrol' }); f.yaw = Math.atan2(pr.a.x - pr.b.x, pr.a.z - pr.b.z);
      let i = 0; for (; i < 360 && __T.n('heartbeat', t0) < 2; i++) __sim(1 / 60);
      return { roar: __T.n('roar', t0), steps: __T.n('foe_step', t0), beats: __T.n('heartbeat', t0), state: f.state, t: +(i / 60).toFixed(2) }; })()`);
    check(foe.roar === 1 && foe.steps >= 1 && foe.beats >= 2, 'a foe that spots you roars once, its steps clank, the heart beats', foe);
    await page.evaluate('for (const f of [...__G.foes.list]) __G.foes.remove(f); __G.player.hp = 100');
    const door = await page.evaluate(`(() => { const G = __G, nav = G.foes.nav, t0 = G.audio.t; let at = null, d = null, ev = 0; G.events.on('door:open', () => ev++);
      for (const o of G.house.doorRecs) { if (o.jammed || o.open || o.target) continue;
        for (const s of [1.8, -1.8]) { const x = o.cx + (o.door.dir === 0 ? s : 0), z = o.cz + (o.door.dir === 0 ? 0 : s); if (nav.okW(x, z)) { at = { x, z }; d = o; break; } } if (at) break; }
      __T.put(at.x, at.z, d.cx, d.cz); __sim(0.5); return { creak: __T.n('door_creak', t0), open: +d.open.toFixed(2), ev, last: G.audio.log.slice(-3) }; })()`);
    check(door.creak >= 1, 'walking up to a door makes it creak open', door);
    const pad = await page.evaluate(`(() => { const G = __G, t0 = G.audio.t, X = G.extract, p = X.pads[X.active]; p.quota = 0;
      __T.put(p.x, p.z, p.x, p.z - 3); __sim(3.6); return { ticks: __T.n('pad_tick', t0), cash: __T.n('pad_cash', t0), done: p.done }; })()`);
    check(pad.ticks >= 5 && pad.cash === 1 && pad.done, 'holding a pad ticks every 0.5 s, cashing it plays the chord', pad);
    const err = await page.evaluate('__errors.slice()');
    check(!err.length && !logs.length, 'vampire page: no console or page errors', err.concat(logs));
    await ctx.close();
    ({ ctx, page, logs } = await open(br, srv, 'house=1&seed=7&theme=pyramid&foes=none'));
    const st2 = await page.evaluate(`(() => { const pr = __T.pair(9); __T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); const t0 = __G.audio.t; __sim(2.5, () => ({ ...__IDLE, mz: 1 })); return { stone: __T.n('step_stone', t0), wood: __T.n('step_wood', t0) }; })()`);
    check(st2.stone >= 4 && st2.wood === 0, 'walking in the pyramid: stone footsteps', st2);
    await ctx.close();
  } catch (e) { check(false, 'harness', e.stack || e.message); }
  finally {
    clearTimeout(kill); await br.close(); srv.close();
    const bad = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    console.log(bad.length ? `${bad.length} FAILED` : `ALL PASS (${results.length})`);
    process.exit(bad.length ? 1 : 0);
  }
})();
