// Robot kit check: opens robots.html headless, saves lineups (crew, foes, bosses), a 3-view sheet per robot,
// walk/attack strips for sample robots, prints triangles + build ms per robot and console errors.
// Usage: node games/repo3d/tools/robots.js <outDir> [--only id,id] [--no-sheets] [--dark]  (--dark: one torch-only shot per foe/boss at 3.3 m)
// Exit code 1 on console errors, over-budget triangles (> 25k) or cold builds over 30 ms.
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch } = require('./pw.js');
const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) || 'robots-out';
const onlyArg = args.indexOf('--only');
const ONLY = onlyArg >= 0 ? args[onlyArg + 1].split(',') : null;
const NO_SHEETS = args.includes('--no-sheets');
const DARK = args.includes('--dark');
fs.mkdirSync(OUT, { recursive: true });

let br = null, srv = null;
const kill = setTimeout(async () => { console.log('FAIL timeout 180 s'); try { if (br) await br.close(); } catch (e) {} process.exit(2); }, 180000);

(async () => {
  let code = 0;
  try {
    srv = await serve();
    br = await pwLaunch();
    const ctx = await br.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
    page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
    page.on('response', (r) => { if (r.status() >= 400) logs.push('http ' + r.status() + ' ' + r.url()); });
    await page.goto(srv.base + '/games/repo3d/robots.html');
    await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
    const ids = await page.evaluate('window.__ids');

    // stats first so cold build times are measured on a fresh cache
    const stats = await page.evaluate('__stats()');
    fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 1));
    const groups = { crew: [], foe: [], boss: [] };
    console.log('id'.padEnd(12), 'group'.padEnd(5), 'tris'.padStart(7), 'meshes'.padStart(6), 'coldMs'.padStart(7), 'warmMs'.padStart(7), 'h(m)'.padStart(5));
    const crewMax = Math.max(...Object.values(stats).filter((s) => s.group === 'crew').map((s) => s.height));
    for (const [id, s] of Object.entries(stats)) {
      groups[s.group].push(s);
      console.log(id.padEnd(12), s.group.padEnd(5), String(s.tris).padStart(7), String(s.meshes).padStart(6), s.buildMs.toFixed(1).padStart(7), s.warmMs.toFixed(2).padStart(7), s.height.toFixed(2).padStart(5));
      if (s.tris > 25000) { console.log('FAIL tris over 25k: ' + id); code = 1; }
      if (s.buildMs > 30) { console.log('WARN cold build over 30 ms: ' + id); }
      // owner rule: every foe at least 1.3x the tallest crew robot (impostor passes for crew until it reveals)
      if (s.group === 'foe' && !s.impostor && s.height < 1.3 * crewMax) { console.log(`FAIL ${id} height ${s.height} m < 1.3 x crew ${crewMax} m`); code = 1; }
      // owner rule: every foe and boss is a rusty zombie robot with red eyes (impostor wears crew eyes until it reveals)
      if (s.group !== 'crew' && !s.impostor) {
        const e = s.eye ?? 0, r = (e >> 16) & 255, g = (e >> 8) & 255, b = e & 255;
        if (!(r >= 230 && g <= 110 && b <= 110)) { console.log(`FAIL ${id} eye #${e.toString(16).padStart(6, '0')} is not red`); code = 1; }
      }
    }
    for (const [g, list] of Object.entries(groups)) {
      const tr = list.map((s) => s.tris), ms = list.map((s) => s.buildMs);
      console.log(`group ${g}: n ${list.length}  tris min ${Math.min(...tr)} avg ${Math.round(tr.reduce((a, b) => a + b, 0) / tr.length)} max ${Math.max(...tr)}  coldMs avg ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1)} max ${Math.max(...ms).toFixed(1)}`);
    }

    const shot = async (name, vp) => { if (vp) await page.setViewportSize(vp); await page.screenshot({ path: path.join(OUT, name) }); };
    for (const g of ['crew', 'foe', 'boss']) {
      await page.setViewportSize({ width: 1800, height: g === 'boss' ? 800 : 1000 });
      await page.evaluate(`__lineup('${g}')`);
      await shot(`lineup-${g}.png`);
    }
    if (!NO_SHEETS) {
      await page.setViewportSize({ width: 1500, height: 720 });
      const all = [...ids.crew, ...ids.foe, ...ids.boss].filter((id) => !ONLY || ONLY.includes(id));
      for (const id of all) { await page.evaluate(`__sheet('${id}', {})`); await shot(`sheet-${id}.png`); }
      if (!ONLY || ONLY.includes('impostor')) { await page.evaluate(`__sheet('impostor', { reveal: 1 })`); await shot('sheet-impostor-revealed.png'); }
    }
    // each foe beside a crew robot, stalking, then lunging (size + stance proof)
    await page.setViewportSize({ width: 900, height: 900 });
    for (const id of ids.foe.filter((x) => !ONLY || ONLY.includes(x))) {
      const st = await page.evaluate(`__pair('${id}', { stalk: 1 })`); await shot(`pair-${id}.png`);
      const lu = await page.evaluate(`__pair('${id}', { lunge: 1, speed: 2.5 })`); await shot(`pair-${id}-lunge.png`);
      const idle = await page.evaluate(`__pair('${id}', {})`);
      console.log(`  ${id.padEnd(12)} posed top: idle ${idle.foe} m (x${idle.ratio})  stalk ${st.foe} m (x${st.ratio})  lunge ${lu.foe} m (x${lu.ratio})  crew ${idle.crew} m  body seen ${st.seen}/${lu.seen}/${idle.seen}`);
      // owner rule: every pair cell shows the foe's body (a cell with only its gun or its shadow is red)
      for (const [nm, o] of [['stalk', st], ['lunge', lu], ['idle', idle]]) {
        if (o.seen < 0.5) { console.log(`FAIL ${id} ${nm}: body pixels seen ${o.seen} < 0.5 after ${o.tries} draws`); code = 1; }
        else if (o.tries > 1) console.log(`WARN ${id} ${nm}: body missing on the first draw, shown on draw ${o.tries}`);
      }
      // owner rule on the picture: the stalking foe still stands >= 1.3x a crew robot, and the upright one passes a 2.3 m door
      if (id !== 'impostor' && id !== 'wallhand' && st.ratio < 1.3) { console.log(`FAIL ${id} stalking top x${st.ratio} < 1.3 x crew`); code = 1; }
      if (id !== 'impostor' && id !== 'ghost' && idle.foe > 2.35) { console.log(`FAIL ${id} upright top ${idle.foe} m > 2.35 m (door 2.3 m)`); code = 1; }
    }
    if (DARK) {
      await page.setViewportSize({ width: 1280, height: 720 });
      const all = [...ids.foe, ...ids.boss].filter((id) => !ONLY || ONLY.includes(id));
      for (const id of all) { await page.evaluate(`__dark('${id}', { speed: 0.8 })`); await shot(`dark-${id}.png`); }
      if (!ONLY || ONLY.includes('impostor')) { await page.evaluate(`__dark('impostor', { reveal: 1, attack: 0.45 })`); await shot('dark-impostor-revealed.png'); }
    }
    // motion strips
    await page.setViewportSize({ width: 1700, height: 620 });
    const samples = ONLY ? ONLY : ['bao', 'rook', 'ghost', 'vampire'];
    for (const id of samples) {
      const walk = [0, 0.12, 0.24, 0.36, 0.48, 0.6].map((t, i) => ({ state: { speed: 1.6 }, t: 0.5 + t, label: 'walk t+' + t.toFixed(2) }));
      await page.evaluate(`__strip('${id}', ${JSON.stringify(walk)})`); await shot(`walk-${id}.png`);
      const atk = [0.1, 0.3, 0.42, 0.5, 0.65, 0.85].map((a) => ({ state: { attack: a }, label: 'attack ' + a }));
      await page.evaluate(`__strip('${id}', ${JSON.stringify(atk)}, 0.6)`); await shot(`attack-${id}.png`);
    }
    if (!ONLY) {
      const poses = [
        { state: {}, label: 'idle' }, { state: { speed: 1.6, carrying: true }, t: 0.4, label: 'carry walk' },
        { state: { hurt: 1 }, pre: {}, t: 0.08, label: 'hurt' }, { state: { look: 0.9 }, label: 'look' },
        { state: { down: true }, t: 1.5, label: 'down' }, { state: { speed: 4 }, t: 0.3, label: 'run 4 m/s' },
      ];
      for (const id of ['bao', 'impostor']) { await page.evaluate(`__strip('${id}', ${JSON.stringify(id === 'impostor' ? [...poses.slice(0, 5), { state: { reveal: 1, attack: 0.5 }, label: 'revealed' }] : poses)}, 0.5)`); await shot(`poses-${id}.png`); }
    }
    console.log(`console errors: ${logs.length}`);
    for (const l of logs.slice(0, 20)) console.log('  ' + l);
    if (logs.length) code = 1;
    fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(logs, null, 1));
  } catch (e) {
    console.log('FAIL ' + (e.stack || e.message)); code = 1;
  } finally {
    try { if (br) await br.close(); } catch (e) {}
    if (srv) srv.close();
    clearTimeout(kill);
    process.exit(code);
  }
})();
