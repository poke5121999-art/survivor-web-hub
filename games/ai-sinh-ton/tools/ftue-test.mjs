// The guided first session through real taps. A fresh save walks the whole session: for every step the guide is up,
// the spotlight equals the target's hit box, every other enabled target is blocked by the guide, and tapping the target
// moves on. Then the locks, the slot table, the later guides and the old-save rules. Screenshots go to .chk/ftue/.
// Usage: timeout 900 node games/ai-sinh-ton/tools/ftue-test.mjs
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';
import { HERO } from '../js/data/heroes.js';
import { UNLOCK } from '../js/data/unlocks.js';

const OUT = path.join(ROOT, '.chk', 'ftue'); fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
const { check, done } = checker();
const srv = await serve(); const br = await launch();
const QUERY = 'noaudio=1&q=low';
const shots = [];
const step = (page, n) => page.evaluate((k) => __step(k), n);
const guide = (page) => page.evaluate(() => __G.guide.dbg());
const tapAt = async (page, x, y) => { await page.touchscreen.tap(x, y); await step(page, 10); };
async function tapId(page, id) {
  const t = (await page.evaluate(() => __ui.targets())).find((q) => q.id === id);
  if (!t) return false;
  await tapAt(page, t.x + t.w / 2, t.y + t.h / 2); return true;
}
async function snap(page, name) { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f }); shots.push(f); }
const fresh = (phone = 's22', query = QUERY) => open(br, srv.base, phone, query, { fresh: true });
const hookToasts = (page) => page.evaluate(() => { window.__toasts = []; const o = __ui.toast; __ui.toast = (s) => { window.__toasts.push(s); o(s); }; });
const WIN = { stage: 1, won: true, wavesCleared: 5, seconds: 30 };
// win a stage in the page and play away the reveals so a modal never sits over the next tap
const winIn = (page, stage, quiet) => page.evaluate(([s, q]) => { if (q) for (const id of ['spectate', 'speed', 'daily', 'chapter', 'equip', 'merge']) __G.meta.ftueDone(id); const r = __G.meta.finishStage({ stage: s, won: true, wavesCleared: 5, seconds: 30 }); for (const id of __G.meta.pendingReveals()) __G.meta.markSeen(id); return { level: __G.meta.acc.level, slots: __G.meta.slots(), unlocked: r.unlocked }; }, [stage, !!quiet]);

try {
  // ============ the whole first session on a fresh save ============
  const g = await fresh(); const { page } = g;
  await step(page, 20);
  const s0 = await page.evaluate(() => ({ screen: __G.screen, level: __G.meta.acc.level, heroes: Object.keys(__G.meta.acc.heroes), next: __G.meta.ftueNext({ screen: 'home', event: 'home' }), guide: __G.guide.dbg().active }));
  check(s0.screen === 'home' && s0.level === 1 && s0.heroes.join() === 'gio' && s0.next === null && !s0.guide, 'fresh save: home, level 1, only Gió, no guide before the first stage');
  await snap(page, '00-home-fresh');
  const lockedTabs = await page.evaluate(() => __ui.targets().filter((t) => /^team-[123]$/.test(t.id)).length);
  check(lockedTabs === 3, 'fresh save: team slots 2 to 4 are visible targets (locked, they toast)');

  const seq = []; const labels = []; let last = ''; let frozenOk = null; let resultInfo = null; let bad = 0; let n = 0;
  for (let it = 0; it < 2500; it++) {
    const st = await page.evaluate(() => ({ d: __G.guide.dbg(), screen: __G.screen, phase: __G.B && __G.B.phase, stage: __G.stageN, cleared: __G.meta.acc.cleared, session: __G.meta.acc.ftue.session, inBattle: !!__G.B }));
    if (st.session && st.inBattle && st.stage === 2) break;
    const d = st.d;
    if (st.screen === 'result' && !resultInfo) {
      await step(page, 60);
      resultInfo = await page.evaluate(() => ({ ...__G.screens.result.dbg(), xp: __G.lastReward.xp, lb: __G.lastReward.levelBefore, la: __G.lastReward.levelAfter, unlocked: __G.lastReward.unlocked, giftIds: __G.lastReward.gifts, won: __G.lastReward.won }));
      await snap(page, 'result-tutorial');
      continue;
    }
    if (d.reveal) {
      if (!labels.includes(d.reveal.label)) { labels.push(d.reveal.label); await step(page, 100); await snap(page, `r-${String(labels.length).padStart(2, '0')}-reveal`); }
      await tapId(page, 'reveal-tap'); await step(page, 6); continue;
    }
    if (d.active) {
      const key = d.id + ':' + (d.target || 'free');
      if (key !== last) {
        last = key; n++;
        if (d.noTarget) {
          await step(page, 20);
          const hit = await page.evaluate(() => __ui.hitAt(180, 400));
          check(hit === 'guide-block', `step ${key}: no target, a tap anywhere lands on the guide (hit ${hit})`);
          await snap(page, `${String(n).padStart(2, '0')}-${d.id}`);
        } else if (d.rect) {
          let r = null;
          for (let k = 0; k < 8; k++) {
            await step(page, 6);
            r = await page.evaluate(() => {
              const dd = __G.guide.dbg(), all = __ui.targets(), t = all.find((q) => q.id === dd.target && !/^(guide|reveal)/.test(q.id));
              if (!t || !dd.rect) return null;
              const others = all.filter((q) => q.enabled && !/^(guide|reveal)/.test(q.id) && q.id !== dd.target);
              const wrong = [];
              for (const o of others) {
                const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
                if (cx < t.x - 1 || cx > t.x + t.w + 1 || cy < t.y - 1 || cy > t.y + t.h + 1) { const h = __ui.hitAt(cx, cy); if (h !== 'guide-block') wrong.push(o.id + '->' + h); }
              }
              return { dx: Math.max(Math.abs(dd.rect.x - t.x), Math.abs(dd.rect.y - t.y), Math.abs(dd.rect.w - t.w), Math.abs(dd.rect.h - t.h)), wrong, others: others.length, text: dd.text, frozen: dd.frozen };
            });
            if (r && r.dx <= 2) break;
          }
          check(!!r && r.dx <= 2, `step ${key}: the spotlight equals the target hit box (off by ${r ? r.dx.toFixed(2) : 'n/a'} px)`);
          check(!!r && r.wrong.length === 0, `step ${key}: the other ${r ? r.others : 0} enabled targets are blocked by the guide (${r ? r.wrong.slice(0, 3).join(', ') : ''})`);
          if (d.id === 'ult') {
            const t0 = await page.evaluate(() => __G.B.t); await page.waitForTimeout(400); await step(page, 40);
            const t1 = await page.evaluate(() => __G.B.t);
            frozenOk = t0 === t1 && r.frozen; check(frozenOk, `step ${key}: the fight is frozen until the press (t ${t0.toFixed(2)} -> ${t1.toFixed(2)})`);
          }
          await snap(page, `${String(n).padStart(2, '0')}-${d.id}-${d.target}`);
        }
        seq.push(key);
      }
      if (d.noTarget) {
        if (d.id === 'join') { await step(page, 200); await page.evaluate(() => __sim(0.1)); } else await tapAt(page, 180, 400);
        continue;
      }
      if (!d.rect) { if (st.phase === 'fight' && !st.d.frozen) await page.evaluate(() => __sim(0.2)); await step(page, 8); continue; }
      const idx0 = d.idx; const id0 = d.id;
      const ok = await tapId(page, d.target);
      await step(page, 12);
      const d2 = await guide(page);
      if (!ok || !(d2.idx > idx0 || d2.id !== id0 || !d2.active || d2.reveal)) { bad++; console.log(`  tap on ${key} did not move the guide on (${JSON.stringify(d2)})`); }
      continue;
    }
    if (st.screen === 'home' && !st.session && st.cleared === 0 && !st.inBattle) { await tapId(page, 'start'); continue; }
    if (st.inBattle && st.phase === 'fight') { await page.evaluate(() => __sim(0.4)); await step(page, 2); continue; }
    if (st.inBattle && st.phase === 'pick') { await page.evaluate(() => __G.autoPick()); await step(page, 10); continue; }
    await step(page, 20);
  }
  // the first full ultimate and the first pick come in whichever order the fight gives them
  const swap = seq.indexOf('pick:card1') >= 0 && seq.indexOf('pick:card1') < seq.indexOf('ult:ult0');
  if (swap) { const i = seq.indexOf('pick:card1'); seq[i] = 'ult:ult0'; seq[i + 1] = 'pick:card1'; }
  const want = ['intro:free', 'ult:ult0', 'pick:card1', 'join:free', 'boss:free', 'reward:home', 'levelup:tab-heroes', 'levelup:hero-gio', 'levelup:levelup', 'levelup:back', 'gacha:tab-gacha', 'gacha:pull1', 'gacha:done', 'team:tab-heroes', 'team:hero-mua', 'team:team-toggle', 'team:back', 'start2:tab-battle', 'start2:start'];
  check(JSON.stringify(seq) === JSON.stringify(want), `the guide walked ${seq.length} steps in order (${seq.join(' ')})`);
  check(bad === 0, 'every tap on a target moved the guide on');
  check(!!resultInfo && resultInfo.won && resultInfo.xp === 140 && resultInfo.lb === 1 && resultInfo.la === 2, `tutorial result: won, 140 xp, level 1 -> 2 (${JSON.stringify(resultInfo && [resultInfo.won, resultInfo.xp, resultInfo.lb, resultInfo.la])})`);
  check(!!resultInfo && resultInfo.xpText === '+140 XP' && resultInfo.lvUp === 'LÊN CẤP 2!' && resultInfo.gifts.join() === HERO.yta.name, `tutorial result screen shows "${resultInfo && resultInfo.xpText}", "${resultInfo && resultInfo.lvUp}" and the gift ${resultInfo && resultInfo.gifts}`);
  check(JSON.stringify(resultInfo && resultInfo.unlocked) === JSON.stringify(['slot2', 'levelup', 'gacha']), 'tutorial result lists the three new unlocks');
  check(labels.join('|') === ['slot2', 'levelup', 'gacha'].map((id) => 'MỞ KHOÁ: ' + UNLOCK[id].name.toLocaleUpperCase('vi')).join('|'), `the reveal played once per unlock (${labels.join(' | ')})`);
  const fin = await page.evaluate(() => ({ heroes: Object.keys(__G.meta.acc.heroes).filter((k) => __G.meta.acc.heroes[k].level > 0).sort(), team: __G.meta.acc.team, level: __G.meta.acc.level, stage: __G.stageN, battle: !!__G.B, session: __G.meta.acc.ftue.session, freePull: __G.meta.acc.freePull, tutorial: __G.B && !!__G.B.stage.tutorial }));
  check(fin.heroes.join() === 'gio,mua,yta' && fin.team.join() === 'gio,mua' && fin.level === 2 && fin.stage === 2 && fin.battle && fin.session && !fin.freePull && !fin.tutorial, `after the session: gio, yta and mua owned, team gio+mua, level 2, stage 2 started (${JSON.stringify(fin)})`);
  await snap(page, 'stage2-started');
  await page.evaluate(() => __sim(3)); await step(page, 5);
  const hud2 = await page.evaluate(() => __G.screens.hud.dbg());
  check(hud2.visible, 'stage 2 shows the HUD with the two-hero team');
  await snap(page, 'stage2-fight');

  // ---- reload after the session: nothing is guided again
  await page.reload(); await page.waitForFunction('window.__ready === true'); await step(page, 200);
  const re = await page.evaluate(() => ({ g: __G.guide.dbg(), next: __G.meta.ftueNext({ screen: 'home', event: 'home' }), nextB: __G.meta.ftueNext({ screen: 'battle' }), session: __G.meta.acc.ftue.session, level: __G.meta.acc.level, xp: __G.meta.acc.xp, screen: __G.screen }));
  check(!re.g.active && !re.g.reveal && re.next === null && re.nextB === null && re.session && re.level === 2 && re.xp === 60 && re.screen === 'home', `reload after the session: no guide, ftueNext null, level 2 with 60 xp kept (${JSON.stringify(re)})`);
  const errs = await page.evaluate(() => (window.__errors || []).slice(0, 3));
  check(g.problems.length === 0 && errs.length === 0, `the first session logged no errors (${[...g.problems, ...errs].slice(0, 2).join(' | ') || 'none'})`);
  await g.ctx.close();

  // ============ locked features cannot be opened by tapping ============
  {
    const { page: p, ctx, problems } = await fresh(); await hookToasts(p); await step(p, 20);
    const a = await p.evaluate(() => JSON.stringify(__G.meta.acc));
    await tapId(p, 'tab-gacha');
    let r = await p.evaluate(() => ({ screen: __G.screen, toasts: window.__toasts.slice(), acc: JSON.stringify(__G.meta.acc) }));
    check(r.screen === 'home' && r.toasts.join() === 'Mở khi qua ải 1' && r.acc === a, `gacha tab before stage 1: still home, state unchanged, toast "${r.toasts.join()}"`);
    await snap(p, 'lock-gacha-toast');
    await tapId(p, 'tab-equip');
    r = await p.evaluate(() => ({ screen: __G.screen, toasts: window.__toasts.slice() }));
    check(r.screen === 'home' && r.toasts[1] === 'Mở ở cấp 6', `equipment tab: still home, toast "${r.toasts[1]}"`);
    await tapId(p, 'team-1');
    r = await p.evaluate(() => ({ screen: __G.screen, toasts: window.__toasts.slice(), team: __G.meta.acc.team }));
    check(r.screen === 'home' && r.toasts[2] === 'Mở khi qua ải 1' && r.team.length === 1, `team slot 2 before stage 1: toast "${r.toasts[2]}", team unchanged`);

    // level 2, stage 1: slot 3 and 4 and the speed button and the eyes are locked
    const w = await winIn(p, 1); await p.evaluate(() => __G.meta.ftueSkip());
    check(w.level === 2 && w.slots === 2, `after stage 1: level ${w.level}, ${w.slots} slots`);
    await p.evaluate(() => { __G.goto('home', {}); window.__toasts.length = 0; }); await step(p, 30);
    await tapId(p, 'team-2');
    r = await p.evaluate(() => ({ screen: __G.screen, toasts: window.__toasts.slice(), team: __G.meta.acc.team.slice() }));
    check(r.screen === 'home' && r.toasts[0] === 'Mở ở cấp 4' && r.team.length === 1, `slot 3 at level 2: home, toast "${r.toasts[0]}", team unchanged`);
    await tapId(p, 'team-3');
    r = await p.evaluate(() => ({ toasts: window.__toasts.slice() }));
    check(r.toasts[1] === 'Mở ở cấp 7', `slot 4 at level 2: toast "${r.toasts[1]}"`);
    await snap(p, 'lock-home-slots');
    await p.evaluate(() => { window.__toasts.length = 0; __G.startBattle(1); }); await step(p, 40);
    const gd = await guide(p);
    check(!gd.active, 'battle at level 2 after stage 1: no later guide yet');
    await tapId(p, 'speed');
    r = await p.evaluate(() => ({ speed: __G.speed, toasts: window.__toasts.slice() }));
    check(r.speed === 1 && r.toasts[0] === 'Mở ở cấp 3', `speed at level 2: stays x1, toast "${r.toasts[0]}"`);
    await tapId(p, 'eye0');
    r = await p.evaluate(() => ({ watching: __G.watching, toasts: window.__toasts.slice() }));
    check(!r.watching && r.toasts[1] === 'Mở khi qua ải 2', `eye at stage 1: not watching, toast "${r.toasts[1]}"`);
    await p.evaluate(() => __sim(2)); await step(p, 10); await snap(p, 'lock-hud');
    check(problems.length === 0, `lock checks logged no errors (${problems.slice(0, 2).join(' | ') || 'none'})`);
    await ctx.close();
  }

  // ============ the slot table at levels 1, 4, 7 ============
  {
    const { page: p, ctx } = await fresh(); await step(p, 20);
    const slots = [await p.evaluate(() => __G.meta.slots())];
    await winIn(p, 1, true); await p.evaluate(() => __G.meta.ftueSkip());
    while ((await p.evaluate(() => __G.meta.acc.level)) < 4) await winIn(p, 1, true);
    slots.push(await p.evaluate(() => __G.meta.slots()));
    await p.evaluate(() => { __G.goto('home', {}); }); await step(p, 30);
    const at4 = await p.evaluate(() => __ui.targets().filter((t) => /^team-\d$/.test(t.id)).length);
    await tapId(p, 'team-3');
    const r4 = await p.evaluate(() => ({ screen: __G.screen, team: __G.meta.acc.team.length }));
    while ((await p.evaluate(() => __G.meta.acc.level)) < 7) await winIn(p, 1, true);
    slots.push(await p.evaluate(() => __G.meta.slots()));
    check(slots.join() === '1,3,4', `slot count follows the table at levels 1, 4, 7 (${slots.join()})`);
    check(at4 === 4 && r4.screen === 'home', 'level 4: slot 4 is still locked (tap stays on home)');
    await p.evaluate(() => { __G.goto('home', {}); }); await step(p, 30);
    await tapId(p, 'team-3'); await step(p, 10);
    check((await p.evaluate(() => __G.screen)) === 'heroes', 'level 7: slot 4 opens the hero chooser');
    await winIn(p, 2, true); await p.evaluate(() => __G.meta.pull(1));
    const bad = await p.evaluate(() => __G.meta.setTeam(['gio', 'yta', 'mua', 'thep']).ok);
    check(bad === true, 'level 7: four heroes are accepted (all granted by the gifts)');
    await ctx.close();
  }

  // ============ a later guide shows once ============
  {
    const { page: p, ctx, problems } = await fresh(); await step(p, 20);
    await winIn(p, 1); await p.evaluate(() => __G.meta.ftueSkip());
    const r2 = await winIn(p, 2);
    check(r2.unlocked.includes('spectate') && r2.unlocked.includes('speed'), `stage 2 first clear unlocks ${r2.unlocked.join(', ')}`);
    await p.evaluate(() => { __G.goto('home', {}); }); await step(p, 30);
    const none = await guide(p); check(!none.active, 'at home after stage 2: the eye guide waits for a battle');
    await p.evaluate(() => __G.startBattle(2)); await step(p, 60);
    let d = await guide(p);
    check(d.active && d.id === 'spectate' && d.target === 'eye0' && d.skipVisible, `later guide "${d.id}" points at ${d.target} with a skip button`);
    await snap(p, 'later-spectate');
    await tapId(p, 'eye0'); await step(p, 20);
    d = await guide(p);
    check(d.active && d.id === 'speed' && d.target === 'speed', `then the speed guide (${d.id}:${d.target})`);
    await snap(p, 'later-speed');
    await tapId(p, 'guide-skip'); await step(p, 20);
    d = await guide(p);
    check(!d.active, 'skip ends the speed guide');
    await p.evaluate(() => { __G.leaveBattle(); __G.startBattle(2); }); await step(p, 80);
    d = await guide(p); check(!d.active, 'a second battle: no later guide again');
    await p.reload(); await p.waitForFunction('window.__ready === true'); await p.evaluate(() => __G.startBattle(2)); await step(p, 80);
    d = await guide(p); check(!d.active, 'after a reload: no later guide again');
    check(problems.length === 0, `later guides logged no errors (${problems.slice(0, 2).join(' | ') || 'none'})`);
    await ctx.close();
  }

  // ============ an old save counts as finished ============
  {
    const { page: p, ctx, problems } = await fresh(); await step(p, 10);
    await p.evaluate(() => localStorage.setItem('aisinhton.save.v1', JSON.stringify({ v: 1, gold: 900, gems: 40, cleared: 3, heroes: { thep: { level: 2, shards: 0 }, mua: { level: 1, shards: 0 }, yta: { level: 1, shards: 0 }, gio: { level: 1, shards: 0 } }, team: ['thep', 'mua', 'yta', 'gio'] })));
    await p.reload(); await p.waitForFunction('window.__ready === true'); await step(p, 200);
    const o = await p.evaluate(() => ({ g: __G.guide.dbg(), next: __G.meta.ftueNext({ screen: 'home', event: 'home' }), nextB: __G.meta.ftueNext({ screen: 'battle', event: 'tutorial:start' }), later: __G.meta.ftueNext({ screen: 'battle' }), session: __G.meta.acc.ftue.session, free: __G.meta.acc.freePull, team: __G.meta.acc.team.length, level: __G.meta.acc.level }));
    check(!o.g.active && !o.g.reveal && o.next === null && o.nextB === null && o.later === null && o.session && !o.free, `old save (cleared 3, no ftue): no guide, no reveal, session finished (${JSON.stringify([o.session, o.free, o.team, o.level])})`);
    await snap(p, 'old-save-home');
    check(problems.length === 0, `old save logged no errors (${problems.slice(0, 2).join(' | ') || 'none'})`);
    await ctx.close();
  }

  // review sheet of every picture
  sheet(shots, path.join(OUT, 'sheet.png'), 6, 300);
} finally { await br.close(); srv.close(); }
done();
