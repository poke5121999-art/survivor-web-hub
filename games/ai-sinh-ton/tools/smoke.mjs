// Fast gate: the page boots at both phone sizes, a stage runs to its end through the real loop hooks, the account
// is paid, nothing is logged as an error and the phone render scale holds its floor.
// Usage: node games/ai-sinh-ton/tools/smoke.mjs [outDir]
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, open, checker, ROOT } from './pw.mjs';

const OUT = process.argv[2] || path.join(ROOT, '.chk', 'smoke'); fs.mkdirSync(OUT, { recursive: true });
const { check, done } = checker();
const srv = await serve(); const br = await launch();
try {
  for (const phone of ['s22', 'xiaomi', 'desktop']) {
    const home = await open(br, srv.base, phone, 'noaudio=1&q=low');
    const h = await home.page.evaluate(() => ({ state: __G.state, screen: __G.screen, scale: __stats.scale, errors: (window.__errors || []).length, ui: !!window.__ui, gold: __G.meta.acc.gold, gems: __G.meta.acc.gems, heroes: Object.keys(__G.meta.acc.heroes).length }));
    check(h.state === 'home' && h.ui, `${phone}: boots to home with the UI kit (state ${h.state}, screen "${h.screen}")`);
    check(h.gold === 1500 && h.gems === 1000 && h.heroes === 4, `${phone}: a fresh account has 1500 gold, 1000 gems, 4 heroes (${h.gold}, ${h.gems}, ${h.heroes})`);
    check(h.scale >= 1, `${phone}: render scale at q=low is ${h.scale.toFixed(2)} CSS px per px (floor 1.0)`);
    await home.page.screenshot({ path: path.join(OUT, phone + '-home.png') });
    check(home.problems.length === 0 && h.errors === 0, `${phone}: home has no errors (${home.problems.slice(0, 2).join(' | ') || 'none'})`);
    await home.ctx.close();

    const b = await open(br, srv.base, phone, 'noaudio=1&q=low&autostart=1&stage=1&seed=7&autoult=1&autopick=1');
    await b.page.evaluate(() => { __sim(20); });
    await b.page.screenshot({ path: path.join(OUT, phone + '-fight.png') });
    const end = await b.page.evaluate(async () => {
      const B = __G.B; let guard = 0;
      while ((B.phase === 'fight' || B.phase === 'pick') && guard++ < 400) { if (B.phase === 'pick') __G.autoPick(); else __sim(5); }
      __sim(0); for (let i = 0; i < 200 && !__G.lastReward; i++) __step(1);
      return { phase: B.phase, wave: B.wave, t: Math.round(B.t), reward: __G.lastReward && { gold: __G.lastReward.gold, won: __G.lastReward.won }, gold: __G.meta.acc.gold, cleared: __G.meta.acc.cleared, scale: __stats.scale, draws: __stats.draws, errors: (window.__errors || []).slice(0, 3) };
    });
    check(end.phase === 'won' && end.wave === 5, `${phone}: stage 1 is won on wave 5 after ${end.t}s (${end.phase}, wave ${end.wave})`);
    check(!!end.reward && end.reward.won && end.gold === 1500 + end.reward.gold && end.cleared === 1, `${phone}: the win pays the account (${end.gold} gold, cleared ${end.cleared})`);
    check(end.scale >= 1, `${phone}: render scale in battle is ${end.scale.toFixed(2)}`);
    check(b.problems.length === 0 && end.errors.length === 0, `${phone}: battle has no errors (${[...b.problems, ...end.errors].slice(0, 2).join(' | ') || 'none'})`);
    await b.page.screenshot({ path: path.join(OUT, phone + '-end.png') });
    await b.ctx.close();
  }
} finally { await br.close(); srv.close(); }
done();
