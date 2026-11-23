// Draw calls of the Ra Trận screen (UI pass plus every viewport shown on it, each drawn once), fresh and opened accounts.
// Usage: timeout 300 node games/ai-sinh-ton/tools/world-dc.mjs
import { serve, launch, open } from './pw.mjs';

export async function screenCalls(page) {
  return page.evaluate(() => {
    const ui = __ui, r = ui.renderer, out = { ui: ui.drawCalls, vp: 0, n: 0 };
    const shown = (n) => { for (let a = n; a; a = a.parent) { if (!a.visible) return false; if (a === ui.scene) return true; } return false; };
    const vps = []; ui.scene.traverse((o) => { if (o.vp && shown(o)) vps.push(o.vp); });
    const ar = r.info.autoReset; r.info.autoReset = false;
    for (const v of vps) { const c0 = r.info.render.calls; r.setRenderTarget(v.rt); r.render(v.scene, v.cam); r.setRenderTarget(null); out.vp += r.info.render.calls - c0; out.n++; }
    r.info.autoReset = ar; out.total = out.ui + out.vp; return out;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const srv = await serve(); const br = await launch();
  try {
    for (const kind of ['fresh', 'full']) {
      const { ctx, page } = await open(br, srv.base, 'xiaomi', '', { freeze: true });
      await page.evaluate((k) => { const M = __G.meta; M.ftueSkip(); if (k === 'full') { M.acc.cleared = 50; M.acc.level = 40; M.save(); } __G.goto('home'); }, kind);
      await page.evaluate(() => __step(60));
      console.log(kind, JSON.stringify(await screenCalls(page)));
      await ctx.close();
    }
  } finally { await br.close(); srv.close(); }
}
