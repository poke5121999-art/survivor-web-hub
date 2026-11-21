// temporary probe: what the UI's draw calls are made of, per screen
import { serve, launch, open } from './pw.mjs';
const srv = await serve(); const br = await launch();
const tally = () => {
  const ui = window.__ui, c = {}; let n = 0;
  ui.scene.traverse((o) => { if (!o.isMesh) return; o.onBeforeRender = () => { const m = o.material; const g = o.geometry; let k = m.type.replace('Mesh', '').replace('Material', '') + (m.map ? (m.map.isRenderTargetTexture ? '+rt' : m.map.userData && m.map.userData.pad ? '+shadowtex' : '+tex') : '') + (m.vertexColors ? '+vc' : '') + (m.clippingPlanes ? '+clip' : '') + ' ' + g.type; c[k] = (c[k] || 0) + 1; n++; }; });
  ui.render(); ui.scene.traverse((o) => { if (o.isMesh) o.onBeforeRender = () => {}; });
  return { calls: ui.drawCalls, n, c: Object.entries(c).sort((a, b) => b[1] - a[1]) };
};
try {
  { const { page } = await open(br, srv.base, 's22', 'screen=grid', { path: '/games/ai-sinh-ton/ui-demo.html' }); await page.waitForTimeout(1500);
    for (const s of ['home', 'grid', 'hud']) { await page.evaluate((n) => window.__show(n), s); await page.waitForTimeout(900); console.log('demo ' + s, JSON.stringify(await page.evaluate(tally))); } }
  { const { page } = await open(br, srv.base, 's22');
    await page.waitForFunction(() => window.__G && window.__G.screens && window.__G.screens.home && window.__step, null, { timeout: 60000 });
    for (const s of ['home', 'heroes', 'equip', 'gacha', 'rewards', 'account']) { await page.evaluate((n) => { window.__G.goto(n); window.__step(30); }, s); console.log('game ' + s, JSON.stringify(await page.evaluate(tally))); }
    await page.goto(srv.base + '/games/ai-sinh-ton/?noaudio=1&q=low&seed=7&autostart=1&stage=1'); await page.waitForTimeout(6000);
    console.log('game battle-hud', JSON.stringify(await page.evaluate(tally)));
  }
} finally { await br.close(); srv.close(); }
