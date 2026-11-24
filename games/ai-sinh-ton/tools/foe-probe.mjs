// Loads the game once at a stage and prints console problems and the horde's state: a quick check while building foe models.
// Usage: PLAYWRIGHT_PATH=... timeout 300 node games/ai-sinh-ton/tools/foe-probe.mjs [stage]
import { serve, launch, open } from './pw.mjs';
const n = +(process.argv[2] || 3);
const srv = await serve(); const br = await launch();
try {
  const r = await open(br, srv.base, 's22', `autostart=1&stage=${n}&noaudio=1&seed=${n}&q=low`, { noWait: true });
  await r.page.waitForFunction('window.__ready === true', null, { timeout: 30000 }).catch(() => {});
  const st = await r.page.evaluate(() => { const G = window.__G; if (!G || !G.B) return { ready: !!window.__ready }; window.__sim(20); window.__step(10); return { ready: true, alive: G.B.enemies.filter((e) => e.alive).length, horde: G.actors.horde.stats, cost: G.actors.horde.cost(), draws: window.__stats && window.__stats.draws }; }).catch((e) => ({ err: e.message }));
  console.log(JSON.stringify(st)); console.log(r.problems.slice(0, 8).join('\n'));
} finally { await br.close(); srv.close(); }
