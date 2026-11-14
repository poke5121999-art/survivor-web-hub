// Frame cost per quality tier in a busy bot fight: times sim tick + draw + a 1x1 readPixels (forces the GPU to finish) over 120 frames.
// Numbers from headless Chrome are for comparing tiers and catching regressions, not for predicting a phone.
'use strict';
const { session, open } = require('./lib.js');
session(async (br, base) => {
  for (const q of (process.argv[2] || 'low,medium,high').split(',')) {
    const g = await open(br, base, 'manual&noaudio&autostart&spectate&seed=3&bots=hard&q=' + q, process.argv[3] === 'phone' ? { viewport: { width: 780, height: 360 }, touch: true } : {});
    const r = await g.page.evaluate(() => {
      window.__step(400, false);
      const t = [];
      for (let i = 0; i < 120; i++) { const a = performance.now(); window.__step(1, true); t.push(performance.now() - a); }
      t.sort((a, b) => a - b);
      const s = window.__stats, G = window.__G;
      return { avg: t.reduce((a, b) => a + b) / t.length, p95: t[Math.floor(t.length * 0.95)], calls: s.calls, tris: s.tris, size: G.gfx.post.size, errors: window.__errors.length };
    });
    console.log(q.padEnd(7), `avg ${r.avg.toFixed(2)} ms  p95 ${r.p95.toFixed(2)} ms  calls ${r.calls}  tris ${r.tris}  buffer ${r.size.join('x')}  errors ${r.errors}`);
    if (g.problems.length) console.log(g.problems.slice(0, 5).join('\n'));
    await g.close();
  }
});
