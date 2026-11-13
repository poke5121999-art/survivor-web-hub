// Measures real frame times on a hardware GPU when Chrome can reach one (PM_GL picks the ANGLE backend).
// Each frame ends in a readPixels, so the time includes the GPU finishing the frame, not just queuing it.
// Usage: node games/phao-may/tools/bench.js [quality ...]. Prints the renderer string so a software fallback is visible.
'use strict';
const path = require('path');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || path.join(process.env.HOME, '.cache/pw-node/node_modules/playwright-core');
(async () => {
  const srv = await serve();
  const br = await require(PW).chromium.launch({ args: ['--use-gl=angle', '--use-angle=' + (process.env.PM_GL || 'gl-egl'), '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  try {
    for (const q of process.argv.slice(2).length ? process.argv.slice(2) : ['low', 'medium', 'high']) {
      const ctx = await br.newContext({ viewport: { width: 1920, height: 1080 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) {} });
      const page = await ctx.newPage();
      await page.goto(srv.base + `/games/phao-may/index.html?autostart=1&noaudio=1&nogov=1&manual=1&seed=3&q=${q}`);
      await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
      const r = await page.evaluate(`(async () => {
        const gl = window.__G.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
        __fire({ angle: 60, power: 60, shot: 0 }); __step(20);
        const times = [];
        for (let i = 0; i < 200; i++) { const t = performance.now(); __step(1); times.push(performance.now() - t); }
        times.sort((a, b) => a - b);
        const s = window.__stats;
        return { gpu, median: times[100], p95: times[190], calls: s.calls, tris: s.tris, w: s.w, h: s.h, errors: window.__errors.length };
      })()`);
      console.log(q.padEnd(7), `median ${r.median.toFixed(1)} ms  p95 ${r.p95.toFixed(1)} ms  calls ${r.calls}  tris ${r.tris}  ${r.w}x${r.h}  errors ${r.errors}  [${r.gpu}]`);
      await ctx.close();
    }
  } finally { await br.close(); srv.close(); }
})();
