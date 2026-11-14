// Voxel block in co-op (?vox=1): two pages of one browser over BroadcastChannel (?fakenet=1). The host blasts the block
// before the guest joins (late join = replay of the command log), then both shoot and blast it; at the end both pages
// must hold the same voxel world: same command count, same sim step, same digest. Only commands cross the wire.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/voxcoop.js [extra query]
'use strict';
const { serve } = require('../../../tools/thumb-lib.js');
const E = process['env']; const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, 170000);
(async () => {
  const srv = await serve();
  const br = await require(E.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const ctx = await br.newContext({ viewport: { width: 800, height: 450 } });
    await ctx.addInitScript(() => localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'vox@t' })));
    const A = await ctx.newPage(); const B = await ctx.newPage(); const errs = [];
    for (const [n, p] of [['A', A], ['B', B]]) { p.on('pageerror', (e) => errs.push(n + ' pageerror ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(n + ' ' + m.text().slice(0, 300)); }); }
    const url = srv.base + '/games/blockade-z/index.html?lang=vi&seed=3&nolock=1&noaudio=1&fakenet=1&vox=1&q=medium&voxpost=0' + (process.argv[2] || '');
    await A.goto(url); await B.goto(url.replace('seed=3', 'seed=4'));
    await A.waitForFunction('window.__ready === true'); await B.waitForFunction('window.__ready === true');
    await A.evaluate("__G.settings.coopName = 'Chu'; __G.events.emit('ui:coophost')");
    await A.waitForFunction("__G.state === 'select'", null, { timeout: 30000 });
    const code = await A.evaluate('__G.coop.code');
    await A.evaluate('__select.pick(3); __select.go()');
    await A.waitForFunction("__G.state === 'playing'", null, { timeout: 20000 });
    const boom = (P, x, y, z, R = 5.5, D = 220) => P.evaluate(`__G.god = true; __G.gear.explode(new THREE.Vector3(${x}, ${y}, ${z}), ${R}, ${D})`);
    // before the guest is in the room
    await boom(A, -24, 1.0, -5.4); await A.waitForTimeout(700); await boom(A, -28.5, 1.4, -6, 6.5, 400); await A.waitForTimeout(1500);
    await B.evaluate(`__G.settings.coopName = 'Khach'; __G.events.emit('ui:coopjoin', { code: '${code}' })`);
    await B.waitForFunction("__G.state === 'select'", null, { timeout: 30000 });
    await B.evaluate('__select.pick(4); __select.go()');
    await B.waitForFunction("__G.state === 'playing'", null, { timeout: 20000 });
    await A.waitForTimeout(2500);
    const st = (P) => P.evaluate('(() => { const d = __G.vox.street.debug(); return { guest: !!__G.coop.guest, log: d.log, applied: d.applied, step: d.step, digest: d.digest, solid: d.solid, active: d.active, desync: d.desync, ok: d.digestOk, bad: d.digestBad }; })()');
    let a = await st(A); let b = await st(B); console.log('late join', JSON.stringify(a), JSON.stringify(b));
    check(b.guest && b.log === a.log && b.log >= 2, `the late guest received the host's ${a.log} earlier commands`);
    // while both are in: the host blasts and chips, the guest blasts and chips (its requests go through the host)
    await boom(A, -20, 1.2, -6, 6.5, 400); await A.waitForTimeout(400);
    await A.evaluate("(() => { const G = __G; for (let i = 0; i < 8; i++) { const at = new THREE.Vector3(-30.2 + i * 0.4, 1.6, -5.05); G.vox.street.chip({ vox: true, surface: 'plaster', m: 0 }, at, 40, new THREE.Vector3(0, 0, -1)); G.vox.street.update(0.05); } })()");
    await boom(B, -26, 4.2, -5.2, 5.5, 260); await B.waitForTimeout(300);
    await B.evaluate("(() => { const G = __G; for (let i = 0; i < 5; i++) { const at = new THREE.Vector3(-18.2, 1.0 + i * 0.4, -5.05); G.vox.street.chip({ vox: true, surface: 'plaster', m: 0 }, at, 40, new THREE.Vector3(0, 0, -1)); G.vox.street.update(0.05); } })()");
    // let everything settle on both sides
    for (let i = 0; i < 40; i++) { await A.waitForTimeout(700); a = await st(A); b = await st(B); if (!a.active && b.step === a.step && b.applied === a.log) break; }
    console.log('settled', JSON.stringify(a), JSON.stringify(b));
    check(a.log >= 6 && b.applied === a.log, `both pages applied the same ${a.log} commands (guest ${b.applied})`);
    check(a.step === b.step, `both sims stopped at the same step (${a.step} / ${b.step})`);
    check(a.digest === b.digest && a.solid === b.solid, `same voxel world on both pages: digest ${a.digest} / ${b.digest}, ${a.solid} / ${b.solid} voxels`);
    check(b.desync === 0 && b.bad === 0, `the guest never ran past a command and its periodic digest checks agree (ok ${b.ok}, bad ${b.bad}, late ${b.desync})`);
    // what crossed the wire: commands, never voxels
    const wire = await A.evaluate('JSON.stringify(__G.vox.street.log()).length');
    check(wire < 2000, `the whole history is ${wire} bytes of commands for ${a.log} changes`);
    check(errs.length === 0, 'no console errors on either page' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
  } catch (e) { console.log('FAIL ' + (e && e.stack || e)); fails.push('threw'); }
  finally { await br.close(); srv.close(); clearTimeout(kill); }
  console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})();
