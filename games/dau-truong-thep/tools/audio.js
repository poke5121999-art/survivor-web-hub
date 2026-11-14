// Audio diagnostic: renders every sound and stem in headless Chrome, checks levels, coverage of events and weapons, and boots the real engine.
// Run: timeout 600 node tools/audio.js   (DTT_BASE=https://host to test a deployed copy)
'use strict';
const path = require('path');
const PW = process.env.PLAYWRIGHT_PATH || path.join(process.env.HOME, '.cache/pw-node/node_modules/playwright-core');
const { serve } = require('../../../tools/thumb-lib.js');

const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

(async () => {
  const srv = process.env.DTT_BASE ? { base: process.env.DTT_BASE.replace(/\/$/, ''), close() {} } : await serve();
  const br = await require(PW).chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  let code = 1;
  try {
    const page = await (await br.newContext()).newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(srv.base + '/games/dau-truong-thep/tools/audio-harness.html');
    await page.waitForFunction('window.__harnessReady === true', null, { timeout: 30000 });

    const d = await page.evaluate('window.__audioDiag()');
    const items = [...d.sounds.map((s) => ({ ...s, label: s.name + '#' + s.variant, kind: 'sfx' })), ...d.stems.map((s) => ({ ...s, label: s.name, kind: 'stem' }))];
    for (const s of items) {
      check(s.nan === 0, `${s.label} no NaN`);
      check(s.clipped === 0, `${s.label} no clipping (${s.clipped})`);
      check(s.peak >= 0.25 && s.peak <= 0.99, `${s.label} peak ${s.peak.toFixed(2)}`);
      check(s.rms > 0.01, `${s.label} rms ${s.rms.toFixed(3)}`);
      const lo = s.kind === 'stem' ? s.expected - 0.002 : 0.03, hi = s.kind === 'stem' ? s.expected + 0.002 : 4;
      check(s.dur >= lo && s.dur <= hi, `${s.label} duration ${s.dur.toFixed(3)}s`);
      if (s.kind === 'sfx') check(Math.abs(s.dur - s.expected) < 0.002, `${s.label} matches table dur ${s.expected}`);
      if (s.kind === 'stem') check(s.loopJump < 0.1, `${s.label} loop seam ${s.loopJump.toFixed(3)}`);
    }
    const c = Object.fromEntries(d.sounds.filter((s) => s.variant === 0).map((s) => [s.name, s.centroid]));
    const lower = (a, b) => check(c[a] < c[b], `centroid ${a} (${c[a].toFixed(0)} Hz) lower than ${b} (${c[b].toFixed(0)} Hz)`);
    lower('fire_shell', 'fire_bullet'); lower('fire_shell', 'fire_rail'); lower('sk_quake_slam', 'hit_metal'); lower('expl_big', 'expl_small');
    lower('hit_wall', 'hit_shield'); lower('ui_click', 'ui_hover'); lower('sk_quake_slam', 'shield_break');
    check(c.fire_bullet > 1200, `fire_bullet is bright (${c.fire_bullet.toFixed(0)} Hz)`);
    check(c.fire_shell < 1000, `fire_shell is low (${c.fire_shell.toFixed(0)} Hz)`);
    const names = d.sounds.map((s) => s.name + s.variant);
    check(new Set(d.sounds.map((s) => s.centroid.toFixed(2) + s.rms.toFixed(4))).size === d.sounds.length, 'no two sounds are identical');
    console.log(`INFO ${new Set(d.sounds.map((s) => s.name)).size} table sounds, ${d.sounds.length} buffers, ${d.stems.length} stems, slowest sync render ${Math.max(...d.sounds.map((s) => s.ms)).toFixed(0)} ms`);

    const cov = await page.evaluate('window.__audioCoverage()');
    check(cov.types.length >= 20, `README lists ${cov.types.length} event types`);
    check(cov.missing.length === 0, 'every noisy event type maps to a sound' + (cov.missing.length ? ' (missing: ' + cov.missing.join(', ') + ')' : ''));
    check(cov.silent.length === 0, 'silent events stay silent');
    for (const [v, n] of Object.entries(cov.vis)) check(n > 0, `weapon vis '${v}' has a fire sound`);
    for (const [k, n] of Object.entries(cov.skills)) check(n > 0, `skill '${k}' makes a sound`);
    for (const [k, n] of cov.sub) check(n > 0, `${k} makes a sound`);

    const boot = await page.evaluate('window.__audioBoot()');
    check(boot.errors.length === 0, 'engine accepts every event and ui call' + (boot.errors.length ? ': ' + boot.errors[0] : ''));
    check(boot.noopCall && JSON.stringify(boot.noopMethods) === JSON.stringify(boot.methods), 'noaudio object has the same methods');
    check(boot.progress === 1, 'boot reports progress to 1');
    check(boot.stats.queued === 0 && boot.stats.state === 'running', `background render drained in ${(boot.drainMs / 1000).toFixed(1)}s, context ${boot.stats.state}`);
    check(boot.stats.maxPumpMs < 25, `longest render slice ${boot.stats.maxPumpMs.toFixed(1)} ms (budget 6), slowest step ${boot.stats.maxStepMs.toFixed(1)} ms in ${boot.stats.slowest}`);
    check(problems.length === 0, 'page has no console errors' + (problems.length ? ': ' + problems[0] : ''));
    console.log(`INFO boot ${boot.bootMs.toFixed(0)} ms to first sounds`);
  } catch (e) {
    check(false, 'harness crashed: ' + (e && e.message));
  } finally {
    await br.close();
    srv.close();
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
