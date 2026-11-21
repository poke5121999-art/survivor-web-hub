// temporary probe: real composited frames of a ui-demo screen through CDP screencast, no readback in the page
// node tools/_flick.mjs <screen> <frames> <outdir> [load]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open } from './pw.mjs';

const [screen = 'grid', N = '3000', out = '/tmp/flick', load = ''] = process.argv.slice(2);
const KNOWN = { home: ['start', 'tab-2', 'tab-0'], grid: ['sort', 'merge', 'tile-0'], hud: ['pt-0', 'pt-2', 'pt-3'] };
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const srv = await serve();
const br = await launch();
let br2 = null;
try {
  if (load) {
    br2 = await launch();
    for (let i = 0; i < 2; i++) await open(br2, srv.base, 'desktop', 'noaudio=1&q=high&seed=' + (7 + i) + '&autostart=1&stage=15&autoult=1&autopick=1');
  }
  const { page } = await open(br, srv.base, 's22', 'screen=' + screen, { path: '/games/ai-sinh-ton/ui-demo.html' });
  await page.waitForTimeout(1500);
  const rects = await page.evaluate((ids) => window.__ui.targets().filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, x: t.vx, y: t.vy, w: t.vw, h: t.vh })), KNOWN[screen]);
  fs.writeFileSync(path.join(out, 'rects.json'), JSON.stringify(rects));
  const cdp = await page.context().newCDPSession(page);
  let n = 0; const total = +N; const t0 = Date.now();
  await new Promise((resolve) => {
    cdp.on('Page.screencastFrame', async (f) => {
      if (n < total) fs.writeFileSync(path.join(out, String(n).padStart(5, '0') + '.jpg'), Buffer.from(f.data, 'base64'));
      n++; cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      if (n === total) resolve();
    });
    cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 780, maxHeight: 360, everyNthFrame: 1 });
  });
  await cdp.send('Page.stopScreencast');
  console.log(`${screen}: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s, load=${!!load}, rects ${JSON.stringify(rects)}`);
} finally { await br.close(); if (br2) await br2.close(); srv.close(); }
