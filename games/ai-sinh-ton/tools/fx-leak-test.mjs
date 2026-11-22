// Ground effects must not pile up: boss warnings, zones, rings, flares, scorch marks and blood decals. Plays stage 4 and
// stage 15 boss waves (wave 5) for 60 s of game time at normal speed and through __sim fast-forward, sampling every 5 s:
// every live-mesh counter stays under its cap, the count does not grow from the 20 s to the 60 s sample, no warning is
// older than its own t + 0.15 s (on the view clock and on the sim clock), the scene does not grow, and 2 s after a wave
// clear and after the win nothing of warnings and zones is left. Screenshot at 60 s: .chk/inframe/fx-60s-stage4.png.
// The team is made tough and weak on purpose (huge hp, no attack bonus) so the boss wave lasts the full 60 s.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/fx-leak-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open as openPage, checker, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'inframe');
fs.mkdirSync(OUT, { recursive: true });
const { check, done } = checker();
const CAP = { teles: 24, zones: 12, splats: 40, scorch: 12 };
const TOUGH = { mul: 0.3, atkFlat: 0, hpFlat: 400000 };

const SAMPLE = () => {
  const G = window.__G; const m = G.actors.marks; const st = m.stats(); const d = G.fx.debug(); const B = G.B;
  let old = 0; let oldSim = 0;
  for (const r of m.teleRecs) { if (r.t > r.T + 0.15 + 0.06) old++; if (B && Number.isFinite(r.bt) && B.t - r.bt > r.T + 0.15 + 0.06) oldSim++; }
  const ground = st.teles + st.zones + st.rings + st.flares + st.strips + st.pillars + d.liveSplats + d.liveScorch;
  return { t: B ? +B.t.toFixed(1) : 0, wave: B && B.wave, phase: B && B.phase, ...st, splats: d.liveSplats, scorch: d.liveScorch, ground, children: G.host.scene.children.length, old, oldSim, foes: B ? B.enemies.filter((e) => e.alive).length : 0 };
};

async function run(br, base, stage, mode) {
  const r = await openPage(br, base, 's22', `autostart=1&stage=${stage}&wave=5&autoult=1&autopick=1&noaudio=1&seed=${stage}`);
  const { page } = r;
  await page.evaluate(([n, o]) => { window.__G.start(n, { seed: n, wave: 5, auto: { ult: true, pick: 'best' }, ...o }); }, [stage, TOUGH]);
  // At normal speed the 60 s are counted from the moment the boss fight really runs. Since 63f49949 and 72b4490e (Addendum 8)
  // a stage opens with the run out of the start room (0.55 s plus 2.4 to 4.6 s of bridge) and the boss comes in with its
  // entrance scene (2.9 to 3.6 s), both on a held sim clock, so twelve 5 s waits from the page load ended at 51.6 s (stage 4)
  // and 50 s (stage 15) of game time with the fight still on. The wait below is on that state, not on time.
  // The samples are then taken every 5 s of game time, the clock this test states it covers: on the wall clock the boss
  // wave's ultimate scenes, hit-stops and frame catch-up made 60 s real only 54.5 to 55.1 s of game time after the entrance.
  // A wave that ends early stops the sim clock, the wait gives up after 15 s real and the >= 55 check below still fails it.
  let t0 = 0;
  if (mode === 'normal') {
    await page.waitForFunction(() => { const G = window.__G; const B = G.B; return !!B && B.phase === 'fight' && !!B.boss && !G.host.world.busy && !(G.intro && G.intro.active) && B.t > 0; }, null, { timeout: 30000 });
    t0 = await page.evaluate(() => window.__G.B.t);
  }
  const rows = [];
  for (let i = 1; i <= 12; i++) {
    if (mode === 'normal') await page.waitForFunction((tt) => { const B = window.__G.B; return !B || B.phase !== 'fight' || B.t >= tt; }, t0 + 5 * i, { timeout: 15000, polling: 100 }).catch(() => {});
    else await page.evaluate(() => { window.__sim(5); window.__step(2); });
    rows.push(await page.evaluate(SAMPLE));
  }
  if (mode === 'normal' && stage === 4) await page.locator('#frame').screenshot({ path: path.join(OUT, 'fx-60s-stage4.png') });
  if (mode === 'ff' && stage === 4) await page.locator('#frame').screenshot({ path: path.join(OUT, 'fx-60s-stage4-ff.png') });
  const problems = r.problems.filter((x) => !/Failed to load resource/.test(x));
  await r.ctx.close();
  return { rows, problems };
}

// a wave cleared with the pick screen waiting, then the win: warnings and zones gone two seconds later
async function afterEnd(br, base, stage) {
  const r = await openPage(br, base, 's22', `autostart=1&stage=${stage}&wave=4&autoult=1&noaudio=1&seed=${stage}`);
  const { page } = r; const out = {};
  await page.evaluate(([n, o]) => { window.__G.start(n, { seed: n, wave: 4, auto: { ult: true, pick: false }, ...o }); window.__sim(12); }, [stage, TOUGH]);
  const live = await page.evaluate(SAMPLE);
  await page.evaluate(() => { const B = window.__G.B; for (const e of B.enemies) e.hp = 0; let g = 0; while (B.phase === 'fight' && g++ < 200) window.__sim(0.5); window.__step(120); });
  out.clear = await page.evaluate(SAMPLE); out.live = live;
  await page.evaluate(() => { const G = window.__G; G.start(G.stageN, { seed: 3, wave: 5, auto: { ult: true, pick: 'best' }, mul: 0.3, atkFlat: 0, hpFlat: 400000 }); window.__sim(8); });
  await page.evaluate(() => { const B = window.__G.B; for (let g = 0; g < 400 && B.phase === 'fight'; g++) { for (const e of B.enemies) e.hp = 0; window.__sim(0.5); } window.__step(120); });
  out.won = await page.evaluate(SAMPLE);
  const problems = r.problems.filter((x) => !/Failed to load resource/.test(x));
  await r.ctx.close(); out.problems = problems;
  return out;
}

const srv = await serve();
const br = await launch();
try {
  for (const stage of [4, 15]) for (const mode of ['normal', 'ff']) {
    const { rows, problems } = await run(br, srv.base, stage, mode);
    console.log(`stage ${stage} ${mode}: t, ground, teles, zones, rings, flares, strips, pillars, splats, scorch, children, foes`);
    for (const x of rows) console.log(`  t=${String(x.t).padStart(5)} ground ${String(x.ground).padStart(3)} | ${x.teles} ${x.zones} ${x.rings} ${x.flares} ${x.strips} ${x.pillars} | splat ${x.splats} scorch ${x.scorch} | children ${x.children} | foes ${x.foes} ${x.phase}`);
    const tag = `stage ${stage} ${mode}`;
    const s20 = rows[3]; const s60 = rows[11];
    check(s60.t >= 55, `${tag}: boss wave lasted to ${s60.t} s of game time (>= 55)`);
    check(rows.every((x) => x.teles <= CAP.teles && x.zones <= CAP.zones && x.splats <= CAP.splats && x.scorch <= CAP.scorch), `${tag}: every sample under the caps (warnings ${CAP.teles}, zones ${CAP.zones}, blood ${CAP.splats}, scorch ${CAP.scorch}); max ${Math.max(...rows.map((x) => x.teles))} / ${Math.max(...rows.map((x) => x.zones))} / ${Math.max(...rows.map((x) => x.splats))} / ${Math.max(...rows.map((x) => x.scorch))}`);
    const mean = (l) => l.reduce((a, x) => a + x.ground, 0) / l.length; const early = mean(rows.slice(2, 6)); const late = mean(rows.slice(8, 12));
    check(late <= Math.max(early * 1.2, early + 8), `${tag}: live ground meshes, mean of 15-30 s ${early.toFixed(1)}, mean of 45-60 s ${late.toFixed(1)} (<= 20% growth, or +8 on small counts: the horde makes more deaths, decals stay under their caps); 20 s ${s20.ground}, 60 s ${s60.ground}`);
    check(rows.every((x) => x.old === 0 && x.oldSim === 0), `${tag}: no warning older than its t + 0.15 s (view clock ${rows.reduce((a, x) => a + x.old, 0)}, sim clock ${rows.reduce((a, x) => a + x.oldSim, 0)} offenders)`);
    check(s60.children <= s20.children * 1.3, `${tag}: scene children ${s20.children} at 20 s, ${s60.children} at 60 s (<= 1.3x)`);
    check(problems.length === 0, `${tag}: no console problems ${problems.slice(0, 2).join(' | ')}`);
  }
  for (const stage of [4, 15]) {
    const o = await afterEnd(br, srv.base, stage);
    console.log(`stage ${stage}: before the clear ${o.live.teles} warnings ${o.live.zones} zones, 2 s after wave_clear ${o.clear.teles}/${o.clear.zones} (phase ${o.clear.phase}), 2 s after the win ${o.won.teles}/${o.won.zones} (phase ${o.won.phase})`);
    check(o.clear.phase === 'pick' && o.clear.teles === 0 && o.clear.zones === 0, `stage ${stage}: 2 s after wave_clear warnings ${o.clear.teles}, zones ${o.clear.zones} (= 0)`);
    check(o.won.phase === 'won' && o.won.teles === 0 && o.won.zones === 0, `stage ${stage}: 2 s after the win warnings ${o.won.teles}, zones ${o.won.zones} (= 0)`);
    check(o.problems.length === 0, `stage ${stage} end of wave: no console problems ${o.problems.slice(0, 2).join(' | ')}`);
  }
} finally {
  await br.close(); srv.close();
}
done();
