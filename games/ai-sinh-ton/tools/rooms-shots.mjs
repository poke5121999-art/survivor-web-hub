// Frame strips for the rooms work: the start room and the run into room 1 (its camp waiting), and a spawn gate charging and
// releasing a pack. Real page at the Xiaomi size, sim and view stepped together (60 view frames, 30 sim ticks a second).
// Usage: PLAYWRIGHT_PATH=... node games/ai-sinh-ton/tools/rooms-shots.mjs [stage] [out dir]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open as openPage, sheet, ROOT } from './pw.mjs';

const ST = +(process.argv[2] || 3);
const OUT = process.argv[3] || path.join(ROOT, '.chk', 'rooms'); fs.mkdirSync(OUT, { recursive: true });
const srv = await serve(); const br = await launch();
const ADV = async ([frames, until]) => {
  const G = window.__G; const B = G.B; const W = G.host.world;
  if (!window.__SIM) { const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /\/js\/sim\/battle\.js/.test(n)); window.__SIM = await import(url); window.__k = 0; }
  for (let i = 0; i < frames; i++) {
    if (!W.busy && B.phase === 'fight' && (window.__k++ % 2 === 0)) window.__SIM.step(B);
    window.__step(1);
    if (until === 'gate' && W.gateList && W.gateList().some((g) => g.c > 0.8)) return { t: B.t, i };
    if (until === 'flash' && W.gateList && W.gateList().some((g) => g.f > 0.9)) return { t: B.t, i };
    if (until === 'arrived' && !W.busy && W.sec >= 0) return { t: B.t, i };
  }
  return { t: B.t, sec: W.sec, busy: W.busy };
};
try {
  const r = await openPage(br, srv.base, 'xiaomi', `autostart=1&stage=${ST}&noaudio=1&seed=${ST}&q=low&autopick=1&autoult=1`, { freeze: true });
  const p = r.page; const files = [];
  const shot = async (name) => { const f = path.join(OUT, `s${ST}-${name}.png`); await p.locator('#frame').screenshot({ path: f }); files.push(f); console.log(name, await p.evaluate(() => { const G = window.__G; const W = G.host.world; return JSON.stringify({ t: +G.B.t.toFixed(2), sec: W.sec, busy: W.busy, enemies: G.B.enemies.filter((e) => e.alive).length, camp: (G.B.camp || []).length, gates: W.gateList ? W.gateList().map((g) => g.room + ':' + g.c.toFixed(2) + '/' + g.f.toFixed(2)).join(' ') : '' }); })); };
  await p.evaluate(ADV, [10, '']); await shot('a-start');
  await p.evaluate(ADV, [90, '']); await shot('b-run');
  await p.evaluate(ADV, [400, 'arrived']); await shot('c-arrive');
  await p.evaluate(ADV, [30, '']); await shot('d-wake');
  await p.evaluate(ADV, [600, 'gate']); await shot('e-charge');
  await p.evaluate(ADV, [200, 'flash']); await shot('f-release');
  await p.evaluate(ADV, [12, '']); await shot('g-out');
  await p.evaluate(ADV, [30, '']); await shot('h-after');
  sheet(files, path.join(OUT, `strip-s${ST}.png`), 2, 900);
  console.log('sheet', path.join(OUT, `strip-s${ST}.png`), r.problems.slice(0, 3).join(' | '));
  await r.ctx.close();
} finally { await br.close(); srv.close(); }
