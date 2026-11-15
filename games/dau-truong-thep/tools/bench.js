// Frame cost per quality tier in a busy bot fight: times sim tick + draw + a 1x1 readPixels (forces the GPU to finish) over 120 frames.
//   node tools/bench.js [tiers] [phone] [cpu4]     phone = 844x390 touch at DPR 3 (the render scale rules apply), cpu4 = 4x CPU throttle
//   BENCH_EXTRA='&sharp=max' adds URL params; SHARP_LEGACY=1 asks for the pre-Addendum-9 resolution rule (?legacyres=1)
// Numbers from headless Chrome are for comparing tiers and catching regressions, not for predicting a phone.
'use strict';
const { session, open } = require('./lib.js');
session(async (br, base) => {
  const phone = process.argv[3] === 'phone', rate = process.argv[4] === 'cpu4' ? 4 : 1;
  for (const q of (process.argv[2] || 'low,medium,high').split(',')) {
    const extra = (process.env.SHARP_LEGACY ? '&legacyres=1' : '') + (process.env.BENCH_EXTRA || '');
    let opts = {};
    if (phone) {
      const ctx = await br.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
      await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) {} });
      opts = { ctx };
    }
    const g = await open(br, base, 'manual&noaudio&autostart&spectate&seed=3&bots=hard&q=' + q + extra, opts);
    const cdp = rate > 1 ? await g.page.context().newCDPSession(g.page) : null;
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const r = await g.page.evaluate(() => {
      window.__step(400, false);
      const t = [];
      for (let i = 0; i < 120; i++) { const a = performance.now(); window.__step(1, true); t.push(performance.now() - a); }
      t.sort((a, b) => a - b);
      const s = window.__stats, G = window.__G;
      return { avg: t.reduce((a, b) => a + b) / t.length, p95: t[Math.floor(t.length * 0.95)], calls: s.calls, tris: s.tris, size: G.gfx.post.size, scale: s.scale, errors: window.__errors.length };
    });
    console.log(q.padEnd(7), `avg ${r.avg.toFixed(2)} ms  p95 ${r.p95.toFixed(2)} ms  calls ${r.calls}  tris ${r.tris}  buffer ${r.size.join('x')}  scale ${Number(r.scale).toFixed(2)}${rate > 1 ? '  cpu x' + rate : ''}  errors ${r.errors}`);
    if (g.problems.length) console.log(g.problems.slice(0, 5).join('\n'));
    await g.close();
  }
});
