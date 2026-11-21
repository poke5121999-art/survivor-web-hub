import { serve, launch, open } from './pw.mjs';
const srv = await serve(); const br = await launch(); const br2 = await launch();
try {
  for (let i = 0; i < 2; i++) await open(br2, srv.base, 'desktop', 'noaudio=1&q=high&seed=' + (7 + i) + '&autostart=1&stage=15&autoult=1&autopick=1');
  const { page } = await open(br, srv.base, 's22', 'screen=grid', { path: '/games/ai-sinh-ton/ui-demo.html' }); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => new Promise((res) => {
    const ui = window.__ui; let cur = 0; const counts = []; const calls = [];
    ui.scene.traverse((o) => { if (o.isMesh && o.material && o.material.vertexColors) o.onBeforeRender = () => { cur++; }; });
    const orig = ui.render; ui.render = () => { cur = 0; orig(); counts.push(cur); calls.push(ui.drawCalls); if (counts.length >= 3000) { ui.render = orig; res({ counts, calls }); } };
  }));
  const hist = (a) => { const h = {}; for (const x of a) h[x] = (h[x] || 0) + 1; return JSON.stringify(h); };
  console.log('vc draws per frame', hist(r.counts), 'drawCalls', hist(r.calls));
} finally { await br.close(); await br2.close(); srv.close(); }
