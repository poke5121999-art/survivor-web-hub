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

let touch = true; // the desktop window has no touch screen: a mouse click goes through the same pointer path
const tapAt = (page, x, y) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
const srv = await serve(); const br = await launch();
const shots = [];

async function frameK(page) { return page.evaluate(() => document.getElementById('frame').clientWidth / 780); }
const step = (page, n) => page.evaluate((k) => __step(k), n);
const targets = (page) => page.evaluate(() => __ui.targets());
async function tapId(page, id) {
  const t = (await targets(page)).find((q) => q.id === id); if (!t) return false;
  await tapAt(page, t.x + t.w / 2, t.y + t.h / 2); return true;
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

// the HUD owns only the top bar, the bottom-centre card block, the spectate block on the left edge and the boss bar:
// nothing else may touch the middle of the fight (x 170..610, y 60..360), banners and floating numbers excepted
async function hudAudit(page, phone, state) {
  const d = await page.evaluate(() => ({ b: __G.screens.hud.dbg().boxes, H: __ui.H, bossY: __G.screens.hud.dbg().bossY, bossShown: __G.screens.hud.dbg().bossShown }));
  const hit = (r) => r.x < 610 && r.x + r.w > 170 && r.y < 360 && r.y + r.h > 60;
  const bad = [];
  for (const r of d.b) {
    if (/^card/.test(r.id)) {
      const base = r.y + r.h; if (r.x < 240 - 0.5 || r.x + r.w > 540 + 0.5 || base > d.H - 12 + 0.5 || r.w > 72.5) bad.push(`${r.id} ${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.w.toFixed(0)}x${r.h.toFixed(0)} leaves the bottom-centre block`);
    } else if (hit(r)) bad.push(`${r.id} ${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.w.toFixed(0)}x${r.h.toFixed(0)} sits in the middle of the fight`);
  }
  const cards = d.b.filter((r) => /^card/.test(r.id)), left = Math.min(...cards.map((r) => r.x)), right = Math.max(...cards.map((r) => r.x + r.w));
  if (cards.length) { if (right - left > 300.5) bad.push(`card row is ${(right - left).toFixed(0)} wide`); if (Math.abs((left + right) / 2 - 390) > 0.5) bad.push(`card row centre ${((left + right) / 2).toFixed(1)}`); }
  check(bad.length === 0 && cards.length > 0, `${phone} ${state}: ${d.b.length} HUD rectangles, ${cards.length} cards in one row x ${left.toFixed(0)}..${right.toFixed(0)} (${bad.join('; ') || 'none in the middle'})`);
}
// occlusion check (part 9): cases [stage, wave, seed] and limits; BT_ONLY=occ runs only that part
const OCC_CASES = [[5, 5, 5], [10, 5, 10], [8, 1, 8], [15, 1, 15]], OCC_SAMPLES = +process['env'].OCC_SAMPLES || 60;
const OCC = { bossMax: 0.10, topShare: 0.01, cardShare: 0.02, ultShare: 0.01 };
const ONLY = process['env'].BT_ONLY || '';
const killWave = (page) => page.evaluate(() => { const B = __G.B; for (const e of B.enemies) e.hp = 0; let g = 0; while (B.phase === 'fight' && g++ < 300) __sim(1); __step(40); return B.phase; });

try {
  for (const phone of ONLY === 'occ' ? [] : ['s22', 'xiaomi', 'desktop']) {
    touch = phone !== 'desktop';
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
    await hudAudit(p, phone, 'fight'); await shot(p, phone, 'fight');
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

    // home settings: the account-delete button and the fullscreen switch exist only when their providers do
    await p.evaluate(() => { delete __G.openAccountDelete; delete __G.fullscreen; __G.openSettings(); __step(30); });
    let sl = await targets(p); let sids = sl.map((t) => t.id);
    check(!sids.includes('acct-delete') && !sids.includes('set-fullscreen') && sids.includes('set-shake') && sids.includes('set-autoult'), `${phone} settings without providers: no acct-delete, no set-fullscreen (${sids.join(',')})`);
    await tapId(p, 'resume'); await step(p, 30);
    await p.evaluate(() => { window.__del = 0; __G.openAccountDelete = () => { window.__del++; }; __G.fullscreen = { on: false, supported: true, toggle() { this.on = !this.on; } }; __G.openSettings(); __step(30); });
    sl = await checkTargets(p, phone, 'home settings'); sids = sl.map((t) => t.id);
    check(sids.includes('acct-delete') && sids.includes('set-fullscreen') && !sids.includes('retry'), `${phone} home settings with providers: acct-delete and set-fullscreen present, no retry (${sids.join(',')})`);
    { const del = sl.find((t) => t.id === 'acct-delete'), others = sl.filter((t) => t.id !== 'acct-delete'), k = await frameK(p);
      const near = others.filter((t) => Math.hypot((t.x + t.w / 2) - (del.x + del.w / 2), (t.y + t.h / 2) - (del.y + del.h / 2)) < 70 * k).map((t) => t.id);
      check(del.x / k > 390 && del.y / k > 200 && near.length === 0, `${phone}: acct-delete sits bottom-right at ${(del.x / k).toFixed(0)},${(del.y / k).toFixed(0)}, controls within 70 design px: ${near.join(',') || 'none'}`); }
    await shot(p, phone, 'settings');
    await tapId(p, 'set-fullscreen'); await step(p, 5);
    check(await p.evaluate(() => __G.fullscreen.on), `${phone}: the fullscreen switch calls game.fullscreen.toggle()`);
    await p.evaluate(() => { __G.fullscreen.supported = false; }); await tapId(p, 'resume'); await step(p, 30);
    await p.evaluate(() => { __G.openSettings(); __step(30); });
    check(!(await targets(p)).some((t) => t.id === 'set-fullscreen'), `${phone}: set-fullscreen hidden when supported is false`);
    await tapId(p, 'acct-delete'); check((await p.evaluate(() => window.__del)) === 1, `${phone}: acct-delete calls game.openAccountDelete()`);
    await tapId(p, 'resume'); await step(p, 30);
    await p.evaluate(() => { delete __G.openAccountDelete; delete __G.fullscreen; });

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
    check(bs.alive && bs.d.bossShown && bs.d.bossName === bs.name && bs.d.bossY >= 0 && bs.d.bossY < 40, `${phone}: wave 5 shows the boss bar for "${bs.name}" in the top-left cluster (alive ${bs.alive}, bar "${bs.d.bossName}", y ${bs.d.bossY.toFixed(0)})`);
    { const br2 = await bp.evaluate(() => __G.screens.hud.dbg().bannerRects.filter((r) => r.age === 99)[0]); check(br2 && br2.w <= 300 && br2.y + br2.h <= 36, `${phone}: boss bar rectangle ${br2 && JSON.stringify(br2)} is at most 300 wide and ends above y 36 (no second band under the top bar)`); }
    await hudAudit(bp, phone, 'boss wave');
    await shot(bp, phone, 'boss');
    await bp.evaluate(() => { __G.spectate(__G.B.boss); __step(70); });
    await shot(bp, phone, 'spec-boss');
    check((await bp.evaluate(() => __G.screens.hud.dbg().specShown)), `${phone}: spectating the boss shows the spectate controls`);
    await hudAudit(bp, phone, 'spectate');
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
          await tapAt(cp, box.x + box.width * 0.5, box.y + box.height * 0.45); await tapAt(cp, box.x + box.width * 0.2, box.y + box.height * 0.3);
          void k;
        }
      }
      const snap = await cp.evaluate(() => __G.B.units.map((u) => [u.uid, u.x, u.z, u.hp]));
      if (watch) {
        await shot(cp, phone, 'spec');
        // wave 1 can end inside the sampled 5 s: the card pick is modal and hides the eye buttons, so pick a card and
        // wait until the fight is back and eye1 is a live target again before tapping it the second time
        for (let g = 0; g < 40; g++) {
          const st = await cp.evaluate(() => ({ ph: __G.B.phase, eye: __ui.targets().some((q) => q.id === 'eye1') }));
          if (st.ph === 'fight' && st.eye) break;
          if (st.ph === 'pick' && (await tapId(cp, 'card0'))) out.picked = (out.picked || 0) + 1;
          await cp.evaluate(() => { __sim(0.1); __step(3); });
        }
        out.before = await cp.evaluate(() => ({ ph: __G.B.phase, mode: __G.cam.mode, w: __G.watching }));
        const again = await tapId(cp, 'eye1'); await step(cp, 5); out.back = await cp.evaluate(() => ({ mode: __G.cam.mode, w: __G.watching })); out.again = again;
      }
      out.snap = snap; out.problems = c.problems.filter((s) => !foreign(s)); out.errors = await cp.evaluate(() => (window.__errors || []).length);
      await c.ctx.close(); return out;
    };
    const A = await run(true), T = await run(false);
    check(A.mode === 'spectate' && A.watching, `${phone}: tapping eye1 puts the camera in spectate on that hero (mode ${A.mode}, watching hero ${A.watching})`);
    check(A.max < 9 && A.travel >= 1, `${phone}: the camera stays within ${A.max.toFixed(1)} m of the hero (limit 9) while it travels ${A.travel.toFixed(1)} m over 5 s (at least 1)`);
    const same = A.snap.length === T.snap.length && A.snap.every((r, i) => r.every((v, j) => Math.abs(v - T.snap[i][j]) < 1e-9));
    check(same, `${phone}: taps and drags while spectating leave every sim position unchanged against a twin run (${A.snap.length} units compared)`);
    check(A.before && A.before.ph === 'fight' && A.before.mode === 'spectate' && A.again, `${phone}: back in the fight (phase ${A.before && A.before.ph}, ${A.picked || 0} taps on the pick card) the camera still spectates (mode ${A.before && A.before.mode}) and eye1 is tappable (${A.again})`);
    check(A.back && A.back.mode === 'overview' && A.back.w === 0, `${phone}: tapping eye1 again returns to the overview (mode ${A.back && A.back.mode})`);
    check(A.problems.length === 0 && A.errors === 0 && T.errors === 0, `${phone}: spectate runs have no errors`);

    // damage numbers: a burst is one number, never two with the same text side by side
    { const n = await open(br, srv.base, phone, BASE.replace('stage=1', 'stage=8') + '&autoult=1&autopick=1'); const np = n.page;
      const r = await np.evaluate(() => {
        const hud = __G.screens.hud; let samples = 0, dup = 0, seen = 0, max = 0; const ex = [];
        for (let i = 0; i < 300 && __G.B.phase !== 'won' && __G.B.phase !== 'lost'; i++) {
          __sim(0.1); __step(6); const d = hud.dbg(); samples++; seen += d.numbers ? 1 : 0; max = Math.max(max, d.numbers);
          const l = d.numberList; for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) if (l[a].text === l[b].text && Math.hypot(l[a].x - l[b].x, l[a].y - l[b].y) < 40) { dup++; if (ex.length < 3) ex.push(`${l[a].text}@${l[a].x.toFixed(0)},${l[a].y.toFixed(0)}/${l[b].x.toFixed(0)},${l[b].y.toFixed(0)}`); }
        }
        return { samples, dup, seen, max, ex };
      });
      check(r.samples >= 250 && r.seen > 20 && r.dup === 0, `${phone}: over ${r.samples} samples of stage 8 (numbers on screen in ${r.seen}, at most ${r.max}) ${r.dup} identical-text pairs within 40 design px ${r.ex.join(' ')}`);
      await n.ctx.close(); }

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
  // 9: gameplay is never under the HUD (brief Addendum 9, owner's "boss bị che"). Every living unit is a column on the
  // floor (heroes 1.9 m; enemies from their radius; a boss from its puppet's scale), projected to design units and
  // clipped to the frame; per sample the share of that box under the top HUD (bar, buttons, boss bar) and under the
  // hero cards is measured. Stages 5 and 10 start at their boss wave, 8 and 15 are crowded ordinary waves.
  for (const phone of (process['env'].OCC_PHONES || 'xiaomi,s22').split(',')) {
    const agg = { top: [], cards: [], boss: [], ult: [], mid: [], ultUp: 0 };
    for (const [st, wv, sd] of OCC_CASES) {
      const o = await open(br, srv.base, phone, `noaudio=1&q=low&seed=${sd}&autostart=1&stage=${st}&wave=${wv}&autoult=1&autopick=1`);
      const r = await o.page.evaluate((N) => {
        const G = __G, B = G.B, THREE = __ui.THREE, fr = document.getElementById('frame'), k = fr.clientWidth / 780, H = fr.clientHeight / k, P = new THREE.Vector3();
        G.paused = true;
        const proj = (x, y, z) => { P.set(x, y, z).project(G.host.camera); return [(P.x + 1) / 2 * 780, (1 - P.y) / 2 * H]; };
        function column(u) {
          let h = u.hero ? 1.9 : 1.8 * Math.max(1, u.r / 0.45), r = u.r || 0.45;
          if (u.boss) { let best = null, bd = 1.5; for (const z of G.host.G.zombies.list) { if (!z.alive || z.dying) continue; const d = Math.hypot(z.pos.x - u.x, z.pos.z - u.z); if (d < bd) { bd = d; best = z; } } if (best) { h = 1.9 * best.T.scale; r = 0.5 * best.T.scale; } }
          let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
          for (const dx of [-r, r]) for (const dz of [-r, r]) for (const y of [0, h]) { const [px, py] = proj(u.x + dx, y, u.z + dz); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
          const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(780, x1), cy1 = Math.min(H, y1);
          return cx1 > cx0 && cy1 > cy0 ? { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 } : null;
        }
        const meets = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        const under = (b, rects) => { let hit = 0; for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { const x = b.x + (i + 0.5) / 16 * b.w, y = b.y + (j + 0.5) / 16 * b.h; if (rects.some((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h)) hit++; } return hit / 256; };
        const out = { top: [], cards: [], boss: [], ult: [], mid: [], ultUp: 0, samples: 0, faded: 0, worst: null, topH: 0 };
        for (let i = 0; i < N && (B.phase === 'fight' || B.phase === 'pick'); i++) {
          __sim(0.5); __step(12); if (B.phase !== 'fight') continue; // 0.2 s of HUD frames: the HUD reacts in real time, not per sim slice
          const d = G.screens.hud.dbg(), top = d.topHud ? d.topHud.filter((q) => !q.see) : [...d.boxes.filter((q) => /^(pause|plate|speed|auto)$/.test(q.id)), ...d.bannerRects.filter((q) => q.age === 99)], cards = d.boxes.filter((q) => /^card/.test(q.id)); // ultimate callouts and the middle banners (wave, boss, rage): bannerRects lists the banners in d.banners order, then the boss bar
          const ultR = d.bannerRects.filter((q, i) => d.banners[i] === 'ult'), midR = d.bannerRects.filter((q, i) => i < d.banners.length && d.banners[i] !== 'ult'); if (ultR.length) out.ultUp++;
          out.samples++; if (d.topHud && d.topHud.some((q) => q.see)) out.faded++;
          out.topH = Math.max(out.topH, ...(d.topHud || top).map((q) => q.y + q.h));
          for (const u of B.units) {
            if (!u.alive) continue; const b = column(u); if (!b) continue;
            const ft = under(b, top), fc = under(b, cards);
            out.top.push(ft); out.cards.push(fc); if (ultR.length) out.ult.push(under(b, ultR)); if (midR.length) out.mid.push(under(b, midR)); if (u.boss) { out.boss.push(ft); if (!out.bossWorst || ft > out.bossWorst.f) out.bossWorst = { f: ft, kind: u.kind, t: +B.t.toFixed(1), box: [b.x, b.y, b.w, b.h].map(Math.round), under: top.filter((q) => meets(q, b)).map((q) => q.id).join('+') }; }
            if (!out.worst || ft > out.worst.f) out.worst = { f: ft, kind: u.kind, t: +B.t.toFixed(1), box: [b.x, b.y, b.w, b.h].map(Math.round) };
          }
        }
        return out;
      }, OCC_SAMPLES);
      for (const key of ['top', 'cards', 'boss', 'ult', 'mid']) agg[key].push(...r[key]); agg.ultUp += r.ultUp;
      const q = (a, t) => a.filter((f) => f > t).length;
      console.log(`${phone} stage ${st} wave ${wv} seed ${sd}: ${r.samples} samples (${r.faded} with a cluster faded over the boss), ${r.top.length} unit boxes; top HUD ends at y ${r.topH.toFixed(1)}; under the top HUD >25%: ${q(r.top, 0.25)}, boss max ${(Math.max(0, ...r.boss) * 100).toFixed(1)}%; under the cards >25%: ${q(r.cards, 0.25)}; ${r.ultUp} samples with an ultimate callout up, units under it >25%: ${q(r.ult, 0.25)}; under a middle banner >25%: ${q(r.mid, 0.25)} of ${r.mid.length}; worst top ${r.worst && JSON.stringify(r.worst)}; worst boss ${r.bossWorst ? JSON.stringify(r.bossWorst) : 'none'}`);
      await o.ctx.close();
    }
    const share = (a, t) => (a.length ? a.filter((f) => f > t).length / a.length : 0), pct = (v) => (v * 100).toFixed(2) + '%';
    const bossMax = Math.max(0, ...agg.boss), bossMean = agg.boss.reduce((s, f) => s + f, 0) / Math.max(1, agg.boss.length);
    check(agg.boss.length >= 40 && bossMax <= OCC.bossMax, `${phone}: over ${agg.boss.length} boss boxes (stages ${OCC_CASES.filter((c) => c[1] === 5).map((c) => c[0]).join(', ')}, wave 5) the top HUD covers at most ${pct(bossMax)} of the boss (mean ${pct(bossMean)}; limit ${pct(OCC.bossMax)})`);
    check(agg.top.length >= 500 && share(agg.top, 0.25) <= OCC.topShare, `${phone}: of ${agg.top.length} unit boxes, ${pct(share(agg.top, 0.25))} are more than a quarter under the top HUD (limit ${pct(OCC.topShare)})`);
    check(agg.ultUp >= 10 && share(agg.ult, 0.25) <= OCC.ultShare, `${phone}: in ${agg.ultUp} samples with an ultimate callout up, ${pct(share(agg.ult, 0.25))} of ${agg.ult.length} unit boxes are more than a quarter under it (limit ${pct(OCC.ultShare)})`);
    check(agg.mid.length >= 100 && share(agg.mid, 0.25) <= OCC.ultShare, `${phone}: of ${agg.mid.length} unit boxes while a wave, boss or rage banner is up, ${pct(share(agg.mid, 0.25))} are more than a quarter under it (limit ${pct(OCC.ultShare)})`);
    check(share(agg.cards, 0.25) <= OCC.cardShare, `${phone}: of ${agg.cards.length} unit boxes, ${pct(share(agg.cards, 0.25))} are more than a quarter under the hero cards (limit ${pct(OCC.cardShare)})`);
  }
} finally { await br.close(); srv.close(); }
if (shots.length) try { const LAND = path.join(ROOT, '.chk', 'landscape'); fs.mkdirSync(LAND, { recursive: true }); for (const ph of ['s22', 'xiaomi', 'desktop']) sheet(shots.filter((f) => f.includes(ph + '-')), path.join(LAND, `battle-ui-${ph}.png`), 3, 520); } catch (e) { console.log('sheet not written: ' + e.message); }
done();
