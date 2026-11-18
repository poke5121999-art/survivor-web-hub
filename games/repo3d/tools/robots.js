// Robot kit check: opens robots.html headless, saves lineups (crew, foes, bosses), a 3-view sheet per robot,
// walk/attack strips for sample robots, prints triangles + build ms per robot and console errors.
// Usage: node games/repo3d/tools/robots.js <outDir> [--only id,id] [--no-sheets] [--dark]  (--dark: one torch-only shot per foe/boss at 3.3 m)
// Exit code 1 on console errors, over-budget triangles (> 25k) or cold builds over 30 ms.
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
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
    br = await require(PW).chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
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
    for (const [id, s] of Object.entries(stats)) {
      groups[s.group].push(s);
      console.log(id.padEnd(12), s.group.padEnd(5), String(s.tris).padStart(7), String(s.meshes).padStart(6), s.buildMs.toFixed(1).padStart(7), s.warmMs.toFixed(2).padStart(7), s.height.toFixed(2).padStart(5));
      if (s.tris > 25000) { console.log('FAIL tris over 25k: ' + id); code = 1; }
      if (s.buildMs > 30) { console.log('WARN cold build over 30 ms: ' + id); }
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
