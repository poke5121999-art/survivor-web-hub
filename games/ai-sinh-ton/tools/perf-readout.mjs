// The ?perf=1 readout: on stage 15 at xiaomi size it appears in the bottom-left corner with fps, draw calls, triangles and
// monsters alive that match window.__stats and the sim, it overlaps no HUD element, and without the parameter it is absent.
// Screenshot: .chk/perf/readout.png.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/perf-readout.mjs
import path from 'node:path';
import { serve, launch, open as openPage, checker, ROOT } from './pw.mjs';

const { check, done } = checker();
const srv = await serve(); const br = await launch();
try {
  const q = 'autostart=1&stage=15&autoult=1&autopick=1&noaudio=1&seed=15&q=low';
  let r = await openPage(br, srv.base, 'xiaomi', q);
  await r.page.evaluate(() => { window.__G.goto('hud', { stage: 15 }); window.__sim(30); });
  await r.page.waitForTimeout(1500);
  check(await r.page.evaluate(() => !document.getElementById('perf')), 'no readout without ?perf=1');
  await r.ctx.close();

  r = await openPage(br, srv.base, 'xiaomi', q + '&perf=1');
  await r.page.evaluate(() => { window.__G.goto('hud', { stage: 15 }); window.__sim(30); });
  await r.page.waitForTimeout(1500);
  const o = await r.page.evaluate(() => {
    const el = document.getElementById('perf'); if (!el) return null;
    const f = document.getElementById('frame').getBoundingClientRect(); const b = el.getBoundingClientRect();
    const hits = [];
    for (const n of document.querySelectorAll('#frame *')) {
      if (n === el || el.contains(n) || n.id === 'view' || n.tagName === 'CANVAS') continue;
      const s = getComputedStyle(n); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue;
      const c = n.getBoundingClientRect(); if (c.width < 2 || c.height < 2 || c.width > f.width * 0.9) continue;
      if (c.left < b.right && c.right > b.left && c.top < b.bottom && c.bottom > b.top) hits.push((n.className || n.tagName) + '');
    }
    return { text: el.textContent, left: b.left - f.left, bottom: f.bottom - b.bottom, w: b.width, h: b.height, draws: window.__stats.draws, alive: window.__G.B.enemies.filter((e) => e.alive).length, hits };
  });
  console.log(JSON.stringify(o));
  check(!!o, 'readout present with ?perf=1');
  if (o) {
    check(/\d+ fps/.test(o.text) && /\d+ draws/.test(o.text) && /k tris/.test(o.text) && /\d+ quái/.test(o.text), `readout shows fps, draws, tris, monsters: ${JSON.stringify(o.text)}`);
    const alive = +(o.text.match(/(\d+) quái/) || [])[1];
    check(Math.abs(alive - o.alive) <= 3, `monsters on the readout ${alive} near the sim's ${o.alive}`);
    check(o.left < 20 && o.bottom < 20, `readout in the bottom-left corner (left ${o.left.toFixed(0)}, bottom ${o.bottom.toFixed(0)} px)`);
    check(o.hits.length === 0, `readout overlaps no HUD element ${o.hits.slice(0, 4).join(', ')}`);
  }
  await r.page.locator('#frame').screenshot({ path: path.join(ROOT, '.chk', 'perf', 'readout.png') });
  check(r.problems.filter((x) => !/Failed to load resource/.test(x)).length === 0, 'no console problems ' + r.problems.slice(0, 2).join(' | '));
  await r.ctx.close();
} finally { await br.close(); srv.close(); }
done();
