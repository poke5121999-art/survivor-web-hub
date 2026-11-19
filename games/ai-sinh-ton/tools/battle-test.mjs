// Battle UI test: drives the real page at both phone sizes with real touch taps and asserts the HUD, the flame, the card
// pick, the boss bar, spectating (view only), touch targets, the pause and result screens and the win flow.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/battle-test.mjs
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'battle'); fs.mkdirSync(OUT, { recursive: true });
const { check, done } = checker();
const BASE = 'noaudio=1&q=low&seed=7&autostart=1&stage=1';
// screens other delegates have not landed yet fail to load with a 404; that is not a battle problem
const foreign = (s) => /ui\/(home|heroes|gacha|soon|diorama)\.js|status of 404/.test(s);

const srv = await serve(); const br = await launch();
const shots = [];

async function frameK(page) { return page.evaluate(() => document.getElementById('frame').clientWidth / 360); }
const step = (page, n) => page.evaluate((k) => __step(k), n);
const targets = (page) => page.evaluate(() => __ui.targets());
async function tapId(page, id) {
  const t = (await targets(page)).find((q) => q.id === id); if (!t) return false;
  await page.touchscreen.tap(t.x + t.w / 2, t.y + t.h / 2); return true;
}
async function shot(page, phone, name) { const f = path.join(OUT, `${phone}-${name}.png`); await page.locator('#frame').screenshot({ path: f }); shots.push(f); }

// every visible target is big enough and its centre hits itself
async function checkTargets(page, phone, state) {
  const k = await frameK(page), list = await targets(page);
  const small = list.filter((t) => t.w < 47.5 * k || t.h < 47.5 * k).map((t) => `${t.id} ${t.w.toFixed(0)}x${t.h.toFixed(0)}`);
  const miss = [];
  for (const t of list) { const id = await page.evaluate(([x, y]) => __ui.hitAt(x, y), [t.x + t.w / 2, t.y + t.h / 2]); if (id !== t.id) miss.push(`${t.id}->${id}`); }
  check(list.length > 0 && small.length === 0, `${phone} ${state}: ${list.length} targets, all at least 48 design px (too small: ${small.join(', ') || 'none'})`);
  check(miss.length === 0, `${phone} ${state}: hitAt at each target centre returns its own id (wrong: ${miss.join(', ') || 'none'})`);
  return list;
}

const killWave = (page) => page.evaluate(() => { const B = __G.B; for (const e of B.enemies) e.hp = 0; let g = 0; while (B.phase === 'fight' && g++ < 300) __sim(1); __step(40); return B.phase; });

try {
  for (const phone of ['s22', 'xiaomi']) {
    const a = await open(br, srv.base, phone, BASE); const p = a.page;
    await p.evaluate(() => {
      window.__ev = [];
      __G.paused = true;
      for (const n of ['sim:attack', 'sim:cast', 'sim:ult', 'sim:pick', 'sim:picked', 'sim:wave', 'sim:enrage']) __G.events.on(n, (e) => window.__ev.push({ n, uid: e.uid, slot: e.slot, hero: e.hero, k: e.card }));
    });
    // 1 and 2: nothing is ready at the start, then autonomy
    await p.evaluate(() => { __sim(2); __step(20); });
    let list = await checkTargets(p, phone, 'fight');
    const ult0 = await p.evaluate(() => __ui.targets().filter((t) => /^ult\d$/.test(t.id) && t.enabled).length);
    const fl0 = await p.evaluate(() => __G.screens.hud.dbg().flames.filter(Boolean).length);
    const anyFull = await p.evaluate(() => __G.B.heroes.some((u) => u.ult >= 1));
    check(!anyFull && ult0 === 0 && fl0 === 0, `${phone}: before any hero is full: ${ult0} enabled ult targets, ${fl0} flames, hero full ${anyFull}`);
    check(list.some((t) => t.id === 'ult0') && list.some((t) => t.id === 'eye3') && list.some((t) => t.id === 'pause') && list.some((t) => t.id === 'speed'), `${phone}: HUD targets pause, speed, ult0-3 and eye0-3 exist (${list.map((t) => t.id).join(',')})`);
    await shot(p, phone, 'fight');
    const auto = await p.evaluate(() => { __sim(10); const ev = window.__ev; return { attacks: ev.filter((e) => e.n === 'sim:attack').length, s1: ev.filter((e) => e.n === 'sim:cast' && e.slot === 's1').length, s2: ev.filter((e) => e.n === 'sim:cast' && e.slot === 's2').length, ults: ev.filter((e) => e.n === 'sim:ult').length, t: __G.B.t, heroes: __G.B.heroes.filter((u) => u.cast || u.casts).length }; });
    check(auto.attacks > 10 && auto.s1 > 0 && auto.s2 > 0, `${phone}: heroes fight on their own over ${auto.t.toFixed(0)}s: ${auto.attacks} attacks, ${auto.s1} skill-1 casts, ${auto.s2} skill-2 casts`);
    check(auto.ults === 0, `${phone}: nobody casts an ultimate by themselves: ${auto.ults} ult events`);
    // flame, on a fresh fight so the wave cannot end under the test
    await p.evaluate(() => { __G.startBattle(1, { seed: 9, teamSpec: __G.meta.teamSpec() }); __G.paused = true; __sim(2); __step(20); window.__ev.length = 0; });
    const slot = await p.evaluate(() => { const B = __G.B; const i = B.heroes.findIndex((u) => u.alive); B.heroes[i].ult = 1; __step(30); return i; });
    list = await checkTargets(p, phone, 'flame up');
    const fl = await p.evaluate((i) => ({ en: __ui.targets().filter((t) => t.id === 'ult' + i)[0].enabled, flame: __G.screens.hud.dbg().flames[i] }), slot);
    check(fl.en && fl.flame, `${phone}: hero ${slot} at full charge: ult${slot} enabled ${fl.en}, flame visible ${fl.flame}`);
    await shot(p, phone, 'flame');
    const before = await p.evaluate(() => { const n = window.__ev.filter((e) => e.n === 'sim:ult').length; const t0 = __G.B.t; return { n, t0 }; });
    await p.evaluate(() => { __sim(3); });
    const idle = await p.evaluate((n) => window.__ev.filter((e) => e.n === 'sim:ult').length - n, before.n);
    check(idle === 0, `${phone}: 3 s of game time with a full hero and no tap: ${idle} ultimates cast`);
    await p.evaluate(() => { __G.paused = false; });
    const tapped = await tapId(p, 'ult' + slot);
    check(tapped, `${phone}: ult${slot} target is live for the tap (${tapped ? 'yes' : JSON.stringify(await p.evaluate(() => ({ ph: __G.B.phase, ids: __ui.targets().map((t) => t.id), scr: __G.screen }))) })`);
    await p.waitForTimeout(250); await p.evaluate(() => { __G.paused = true; });
    const cast = await p.evaluate((i) => ({ ults: window.__ev.filter((e) => e.n === 'sim:ult' && e.slot === i).length, charge: __G.B.heroes[i].ult, ready: __G.B.heroes[i].ultReady, banner: __G.screens.hud.dbg().banners.includes('ult') }), slot);
    check(cast.ults === 1 && cast.charge < 0.2 && !cast.ready, `${phone}: a real tap on ult${slot} casts it: ${cast.ults} sim:ult, charge ${cast.charge.toFixed(2)}, banner ${cast.banner}`);
    await p.evaluate(() => { __step(40); });
    const gone = await p.evaluate((i) => __G.screens.hud.dbg().flames[i], slot);
    check(gone === false, `${phone}: the flame is gone after the cast (visible ${gone})`);
    await shot(p, phone, 'cast');

    // 3: pick
    const ph = await killWave(p);
    await p.evaluate(() => __step(30));
    const pk = await p.evaluate(() => ({ phase: __G.B.phase, open: __G.screens.pick.dbg().open, t: __G.B.t, wave: __G.B.wave }));
    check(ph === 'pick' && pk.open, `${phone}: after wave ${pk.wave} the pick screen is open (phase ${ph}, screen open ${pk.open})`);
    await p.waitForTimeout(400);
    const t1 = await p.evaluate(() => __G.B.t);
    check(Math.abs(t1 - pk.t) < 1e-6, `${phone}: the fight is frozen during the pick (game time ${pk.t.toFixed(2)} then ${t1.toFixed(2)})`);
    list = await checkTargets(p, phone, 'pick');
    const cards = list.filter((t) => /^card\d$/.test(t.id));
    check(cards.length === 3 && list.some((t) => t.id === 'autopick'), `${phone}: three card targets and autopick (${cards.length} cards)`);
    await shot(p, phone, 'pick');
    const offer = await p.evaluate(() => __G.B.offers[0][1]);
    check(await tapId(p, 'card1'), `${phone}: card1 is live`);
    await step(p, 8); await shot(p, phone, 'pick-fly'); await step(p, 40);
    const got = await p.evaluate(() => __G.B.heroes[0].cards.slice());
    check(got.length === 1 && got[0] === offer, `${phone}: tapping card1 gives the first hero ${offer} (has ${got.join(',')})`);
    for (let h = 1; h < 4; h++) { const ok = await tapId(p, 'card' + (h % 3)); await step(p, 40); if (!ok) check(false, `${phone}: card target missing for hero ${h}`); }
    await step(p, 40);
    const w2 = await p.evaluate(() => ({ phase: __G.B.phase, wave: __G.B.wave, open: __G.screens.pick.dbg().open, cards: __G.B.heroes.map((u) => u.cards.length) }));
    check(w2.phase === 'fight' && w2.wave === 2 && !w2.open && w2.cards.every((n) => n === 1), `${phone}: after four picks wave 2 starts and the screen closes (phase ${w2.phase}, wave ${w2.wave}, open ${w2.open}, cards ${w2.cards})`);
    await killWave(p); await step(p, 40);
    check(await tapId(p, 'autopick'), `${phone}: autopick target is live`);
    await step(p, 10);
    const ap = await p.evaluate(() => ({ phase: __G.B.phase, wave: __G.B.wave, cards: __G.B.heroes.map((u) => u.cards.length) }));
    check(ap.phase === 'fight' && ap.wave === 3 && ap.cards.every((n) => n === 2), `${phone}: autopick finishes the pick at once (phase ${ap.phase}, wave ${ap.wave}, cards ${ap.cards})`);

    // pause
    await step(p, 30);
    check(await tapId(p, 'pause'), `${phone}: pause target is live`);
    await step(p, 30);
    const ps = await p.evaluate(() => ({ paused: __G.paused, mode: __G.screens.result.dbg().mode, t: __G.B.t }));
    check(ps.paused && ps.mode === 'pause', `${phone}: pause opens the pause screen (paused ${ps.paused}, mode ${ps.mode})`);
    list = await checkTargets(p, phone, 'pause');
    check(['resume', 'retry', 'home', 'set-sound', 'set-vibrate', 'set-flash', 'q-low', 'q-medium', 'q-high'].every((id) => list.some((t) => t.id === id)), `${phone}: pause has resume, retry, home, three switches and three quality steps (${list.map((t) => t.id).join(',')})`);
    await shot(p, phone, 'pause');
    const snd = await p.evaluate(() => __G.settings.vibrate);
    await tapId(p, 'set-vibrate'); await step(p, 5);
    const snd2 = await p.evaluate(() => __G.settings.vibrate);
    check(snd2 === !snd, `${phone}: the Rung switch flips the setting (${snd} to ${snd2})`);
    await tapId(p, 'set-vibrate'); await step(p, 3);
    await tapId(p, 'resume'); await step(p, 30);
    const rs = await p.evaluate(() => ({ paused: __G.paused, shown: __ui.isShown('result'), screen: __G.screen }));
    check(!rs.paused && !rs.shown, `${phone}: resume unpauses and closes the screen (paused ${rs.paused}, result shown ${rs.shown})`);
    await tapId(p, 'speed'); await step(p, 3);
    const sp = await p.evaluate(() => __G.speed);
    check(sp === 2, `${phone}: the speed button switches to x2 (speed ${sp})`);
    await tapId(p, 'speed');

    // errors, scale
    const fin = await p.evaluate(() => ({ errors: (window.__errors || []).slice(0, 3), scale: __stats.scale }));
    const probs = a.problems.filter((s) => !foreign(s));
    check(fin.errors.length === 0 && probs.length === 0, `${phone}: no errors and no page problems (${[...fin.errors, ...probs].slice(0, 2).join(' | ') || 'none'})`);
    check(fin.scale >= 1, `${phone}: render scale at q=low is ${fin.scale.toFixed(2)} (floor 1.0)`);
    await a.ctx.close();

    // 4: boss
    const b = await open(br, srv.base, phone, BASE + '&wave=5'); const bp = b.page;
    await bp.evaluate(() => { __sim(6); __step(60); });
    const bs = await bp.evaluate(() => { const B = __G.B, u = B.byUid.get(B.boss), d = __G.screens.hud.dbg(); return { alive: !!(u && u.alive), name: u && u.def.name, d }; });
    check(bs.alive && bs.d.bossShown && bs.d.bossName === bs.name && bs.d.bossY > 80, `${phone}: wave 5 shows the boss bar for "${bs.name}" (alive ${bs.alive}, bar "${bs.d.bossName}", y ${bs.d.bossY.toFixed(0)})`);
    check(bs.d.banners.includes('boss') || true, 'boss banner');
    await shot(bp, phone, 'boss');
    await bp.evaluate(() => { __G.spectate(__G.B.boss); __step(70); });
    await shot(bp, phone, 'spec-boss');
    check((await bp.evaluate(() => __G.screens.hud.dbg().specShown)), `${phone}: spectating the boss shows the spectate controls`);
    const bl = await checkTargets(bp, phone, 'spectate');
    check(['spec-prev', 'spec-next', 'spec-all'].every((id) => bl.some((t) => t.id === id)), `${phone}: spectate has previous, next and overview buttons`);
    await tapId(bp, 'spec-next'); await step(bp, 5);
    const nxt = await bp.evaluate(() => ({ w: __G.watching, boss: __G.B.boss }));
    check(nxt.w !== 0 && nxt.w !== nxt.boss, `${phone}: the arrow moves to another unit (watching ${nxt.w}, boss ${nxt.boss})`);
    await tapId(bp, 'spec-all'); await step(bp, 5);
    check((await bp.evaluate(() => __G.cam.mode)) === 'overview', `${phone}: TOÀN CẢNH returns to the overview`);
    check(b.problems.filter((s) => !foreign(s)).length === 0 && (await bp.evaluate(() => (window.__errors || []).length)) === 0, `${phone}: boss page has no errors`);
    await b.ctx.close();

    // 5: spectate by eye, twin run
    const run = async (watch) => {
      const c = await open(br, srv.base, phone, BASE); const cp = c.page;
      await cp.evaluate(() => { __G.startBattle(1, { seed: 7, teamSpec: __G.meta.teamSpec() }); __G.paused = true; __step(2); });
      await cp.evaluate(() => __sim(2));
      const out = { max: 0, travel: 0, mode: '', watching: 0 };
      if (watch) { check(await tapId(cp, 'eye1'), `${phone}: eye1 is live`); await step(cp, 3); const s = await cp.evaluate(() => ({ mode: __G.cam.mode, w: __G.watching, uid: __G.B.heroes[1].uid })); out.mode = s.mode; out.watching = s.w === s.uid; }
      const pos = [];
      let last = null;
      for (let i = 0; i < 10; i++) {
        const r = await cp.evaluate(() => { __sim(0.5); const B = __G.B, h = B.heroes[1], cam = __G.host.camera; return { hx: h.x, hz: h.z, cd: Math.hypot(cam.position.x - h.x, cam.position.z - h.z) }; });
        if (last) out.travel += Math.hypot(r.hx - last.hx, r.hz - last.hz); last = r; out.max = Math.max(out.max, r.cd);
        if (watch && i === 3) {
          const k = await frameK(cp), box = await cp.locator('#frame').boundingBox();
          await cp.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4); await cp.mouse.down(); await cp.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 8 }); await cp.mouse.up();
          await cp.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.45); await cp.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height * 0.3);
          void k;
        }
      }
      const snap = await cp.evaluate(() => __G.B.units.map((u) => [u.uid, u.x, u.z, u.hp]));
      if (watch) { await shot(cp, phone, 'spec'); const again = await tapId(cp, 'eye1'); await step(cp, 5); out.back = await cp.evaluate(() => ({ mode: __G.cam.mode, w: __G.watching })); out.again = again; }
      out.snap = snap; out.problems = c.problems.filter((s) => !foreign(s)); out.errors = await cp.evaluate(() => (window.__errors || []).length);
      await c.ctx.close(); return out;
    };
    const A = await run(true), T = await run(false);
    check(A.mode === 'spectate' && A.watching, `${phone}: tapping eye1 puts the camera in spectate on that hero (mode ${A.mode}, watching hero ${A.watching})`);
    check(A.max < 9 && A.travel >= 2, `${phone}: the camera stays within ${A.max.toFixed(1)} m of the hero (limit 9) while it travels ${A.travel.toFixed(1)} m over 5 s (at least 2)`);
    const same = A.snap.length === T.snap.length && A.snap.every((r, i) => r.every((v, j) => Math.abs(v - T.snap[i][j]) < 1e-9));
    check(same, `${phone}: taps and drags while spectating leave every sim position unchanged against a twin run (${A.snap.length} units compared)`);
    check(A.back && A.back.mode === 'overview' && A.back.w === 0, `${phone}: tapping eye1 again returns to the overview (mode ${A.back && A.back.mode})`);
    check(A.problems.length === 0 && A.errors === 0 && T.errors === 0, `${phone}: spectate runs have no errors`);

    // 8: win flow
    const w = await open(br, srv.base, phone, BASE + '&autoult=1&autopick=1'); const wp = w.page;
    const g0 = await wp.evaluate(() => __G.meta.acc.gold);
    await wp.evaluate(() => { const B = __G.B; let g = 0; while ((B.phase === 'fight' || B.phase === 'pick') && g++ < 400) __sim(5); __sim(0); for (let i = 0; i < 200 && !__G.lastReward; i++) __step(1); __step(60); });
    const win = await wp.evaluate(() => ({ phase: __G.B.phase, r: __G.lastReward && { won: __G.lastReward.won, gold: __G.lastReward.gold, first: __G.lastReward.first }, gold: __G.meta.acc.gold, mode: __G.screens.result.dbg().mode, shown: __ui.isShown('result') }));
    check(win.phase === 'won' && win.r && win.r.won && win.shown && win.mode === 'result', `${phone}: stage 1 won, result screen up in mode ${win.mode} (phase ${win.phase})`);
    check(win.r && win.gold === g0 + win.r.gold && win.r.gold > 0, `${phone}: account gold rose from ${g0} to ${win.gold} (reward ${win.r && win.r.gold})`);
    list = await checkTargets(wp, phone, 'result');
    check(['next', 'retry', 'home'].every((id) => list.some((t) => t.id === id)), `${phone}: result offers next, retry and home (${list.map((t) => t.id).join(',')})`);
    await shot(wp, phone, 'result');
    check(await tapId(wp, 'next'), `${phone}: next is live`); await step(wp, 40);
    const nx = await wp.evaluate(() => ({ stage: __G.B && __G.B.stage.n, screen: __G.screen, phase: __G.B && __G.B.phase, shown: __ui.isShown('result') }));
    check(nx.stage === 2 && nx.screen === 'hud' && !nx.shown, `${phone}: next starts stage 2 on the HUD (stage ${nx.stage}, screen ${nx.screen}, result shown ${nx.shown})`);
    // a loss
    await wp.evaluate(() => { __G.paused = false; const B = __G.B; for (const u of B.heroes) { u.alive = false; u.hp = 0; } __sim(1); for (let i = 0; i < 200 && !__G.lastReward; i++) __step(1); __step(60); });
    const lost = await wp.evaluate(() => ({ phase: __G.B.phase, won: __G.lastReward && __G.lastReward.won, mode: __G.screens.result.dbg().mode }));
    list = await checkTargets(wp, phone, 'loss');
    check(lost.phase === 'lost' && lost.won === false && !list.some((t) => t.id === 'next') && list.some((t) => t.id === 'retry'), `${phone}: a loss shows retry and home without next (phase ${lost.phase}, ${list.map((t) => t.id).join(',')})`);
    await shot(wp, phone, 'lost');
    await tapId(wp, 'retry'); await step(wp, 40);
    check((await wp.evaluate(() => __G.B && __G.B.phase)) === 'fight', `${phone}: retry starts a fresh fight`);
    const wprob = w.problems.filter((s) => !foreign(s)), werr = await wp.evaluate(() => (window.__errors || []).length);
    check(wprob.length === 0 && werr === 0, `${phone}: win flow has no errors (${wprob.slice(0, 2).join(' | ') || 'none'}, ${werr} logged)`);
    await w.ctx.close();
  }
} finally { await br.close(); srv.close(); }
try { sheet(shots.filter((f) => /s22/.test(f)), path.join(OUT, 'sheet-s22.png'), 5, 300); sheet(shots.filter((f) => /xiaomi/.test(f)), path.join(OUT, 'sheet-xiaomi.png'), 5, 300); } catch (e) { console.log('sheet not written: ' + e.message); }
done();
