// Long campaign through real taps: stage select past stage 10 (chapter line, pips, chapter jumps, no cap, endless),
// the next-stage button after stage 10, and the six chapter chests on the Thưởng tab.
// "Cleared N" is reached with repeated meta.finishStage calls; the unlock rules are switched to the real ones
// (cheatUnlock off) so the chest lock and the red dot are what a player sees.
// Usage: timeout 900 node games/ai-sinh-ton/tools/campaign-test.mjs
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'campaign'); fs.mkdirSync(OUT, { recursive: true });
const { check, done } = checker();
const srv = await serve(); const br = await launch();
const shots = [];

const targets = (page) => page.evaluate(() => __ui.targets());
const step = (page, n) => page.evaluate((k) => __step(k), n);
async function tap(page, id) {
  const t = (await targets(page)).find((q) => q.id === id);
  if (!t) return false;
  await page.touchscreen.tap(t.x + t.w / 2, t.y + t.h / 2);
  await step(page, 8);
  return true;
}
const target = async (page, id) => (await targets(page)).find((q) => q.id === id);
const acc = (page) => page.evaluate(() => JSON.parse(JSON.stringify(__G.meta.acc)));
const mui = (page, key) => page.evaluate((k) => JSON.parse(JSON.stringify(__G.metaUi[k] ?? null)), key);
const stageNow = (page) => page.evaluate(() => __G.metaUi.stage());
async function snap(page, phone, name) { const f = path.join(OUT, `${phone}-${name}.png`); await page.screenshot({ path: f }); shots.push(f); }
const setCleared = (page, n) => page.evaluate((k) => { while (__G.meta.acc.cleared < k) __G.meta.finishStage({ stage: __G.meta.acc.cleared + 1, won: true, wavesCleared: 5, seconds: 30 }); }, n);
const realRules = (page) => page.evaluate(() => { const m = __G.meta; m.claimDaily(); for (const id of ['daily', 'chapter', 'equip', 'merge', 'spectate', 'speed']) m.ftueDone(id); m.acc.cheatUnlock = false; });
const toHome = async (page) => { await page.evaluate(() => __G.goto('home')); await step(page, 30); };

async function audit(page, label) {
  const bad = await page.evaluate(() => {
    const out = [], r = document.getElementById('frame').getBoundingClientRect(), k = r.width / 360;
    for (const t of __ui.targets()) {
      const hit = __ui.hitAt(t.x + t.w / 2, t.y + t.h / 2);
      if (t.w / k < 47.5 || t.h / k < 47.5) out.push(`${t.id} is ${(t.w / k).toFixed(1)}x${(t.h / k).toFixed(1)}`);
      if (hit !== t.id) out.push(`${t.id} centre hits ${hit}`);
    }
    return out;
  });
  check(bad.length === 0, `${label}: all ${(await targets(page)).length} targets are at least 48x48 and own their centre (${bad.slice(0, 4).join('; ') || 'none out'})`);
}
async function clip(page, label) {
  const r = await page.evaluate(() => {
    const out = []; let n = 0;
    for (const t of __G.metaUi.titles) {
      if (!t.node || !t.node.canvas) continue; const c = t.node.canvas, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let top = -1, bot = -1;
      for (let y = 0; y < c.height && top < 0; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { top = y; break; }
      for (let y = c.height - 1; y >= 0 && bot < 0; y--) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { bot = c.height - 1 - y; break; }
      if (top < 0) continue; n++; if (top < 1 || bot < 1) out.push(`${t.screen}: ${top} above, ${bot} below`);
    }
    return { out, n };
  });
  check(r.out.length === 0 && r.n >= 3, `${label}: ${r.n} upper-case titles have free rows above and below the ink (${r.out.join('; ') || 'none clipped'})`);
}

try {
  for (const phone of ['s22', 'xiaomi']) {
    // ---------- stage select ----------
    {
      const g = await open(br, srv.base, phone, 'noaudio=1&q=low'); const { page } = g;
      await step(page, 20);
      let nx = await target(page, 'stage-next'), pv = await target(page, 'stage-prev');
      check((await stageNow(page)) === 1 && nx && !nx.enabled && pv && !pv.enabled, `${phone}: cleared 0 shows only stage 1, stage-next locked (${nx && nx.enabled}), stage-prev locked (${pv && pv.enabled})`);
      await snap(page, phone, 'home-0');

      await setCleared(page, 12); await toHome(page);
      let st = await stageNow(page), line = await mui(page, 'chapterLine'), pips = await mui(page, 'pips');
      nx = await target(page, 'stage-next');
      check(st === 13 && /chương 3/i.test(line) && /nhà máy lạnh/i.test(line), `${phone}: cleared 12 opens on stage ${st}, chapter line "${line}"`);
      check(nx && !nx.enabled, `${phone}: stage-next is locked on stage 13 (${nx && nx.enabled})`);
      check(pips.map((p) => p.state).join() === 'cleared,cleared,current,locked,locked' && pips[2].sel && pips[4].spike && !pips[0].spike && pips.map((p) => p.n).join() === '11,12,13,14,15',
        `${phone}: pips for chapter 3 read ${pips.map((p) => p.n + ':' + p.state).join(' ')}, spike on the fifth`);
      const cn = await target(page, 'chapter-next'), cp = await target(page, 'chapter-prev');
      check(cn && !cn.enabled && cp && cp.enabled, `${phone}: chapter-next locked and chapter-prev open on chapter 3`);
      await snap(page, phone, 'home-13'); await audit(page, `${phone} stage select`); await clip(page, `${phone} stage select`);
      await tap(page, 'chapter-prev');
      st = await stageNow(page); line = await mui(page, 'chapterLine');
      check(st === 6 && /chương 2/i.test(line), `${phone}: chapter-prev jumps to stage ${st}, "${line}"`);
      await tap(page, 'stage-prev'); await tap(page, 'stage-prev');
      st = await stageNow(page); line = await mui(page, 'chapterLine');
      check(st === 4 && /chương 1/i.test(line), `${phone}: stage-prev walks down to stage ${st}, "${line}"`);
      await tap(page, 'chapter-next'); await tap(page, 'chapter-next');
      check((await stageNow(page)) === 11, `${phone}: two chapter-next taps reach stage ${await stageNow(page)} (want 11)`);
      await tap(page, 'stage-next'); await tap(page, 'stage-next');
      check((await stageNow(page)) === 13, `${phone}: stage-next walks up to 13 again (${await stageNow(page)})`);
      await tap(page, 'start'); await step(page, 10);
      const bs = await page.evaluate(() => ({ state: __G.state, n: __G.B && __G.B.stage.n, boss: __G.B && __G.B.stage.boss }));
      check(bs.state === 'battle' && bs.n === 13 && bs.boss === 'ufo', `${phone}: start on stage 13 begins a battle (${JSON.stringify(bs)})`);
      await page.evaluate(() => __G.leaveBattle()); await step(page, 20);

      await setCleared(page, 34); await toHome(page);
      st = await stageNow(page); line = await mui(page, 'chapterLine'); nx = await target(page, 'stage-next');
      check(st === 35 && /vô tận/i.test(line) && nx && !nx.enabled, `${phone}: cleared 34 opens on stage ${st}, chapter line "${line}", stage-next locked`);
      await snap(page, phone, 'home-35'); await audit(page, `${phone} endless`); await clip(page, `${phone} endless`);
      await tap(page, 'chapter-prev');
      check((await stageNow(page)) === 26 && /chương 6/i.test(await mui(page, 'chapterLine')), `${phone}: chapter-prev from endless goes to stage ${await stageNow(page)}`);
      await tap(page, 'chapter-next'); await tap(page, 'stage-next');
      check((await stageNow(page)) === 32, `${phone}: stage 32 is selectable past the old cap (${await stageNow(page)})`);
      await tap(page, 'start'); await step(page, 10);
      const b32 = await page.evaluate(() => ({ state: __G.state, n: __G.B && __G.B.stage.n }));
      check(b32.state === 'battle' && b32.n === 32, `${phone}: stage 32 starts (${JSON.stringify(b32)})`);
      const errs = await page.evaluate(() => (window.__errors || []).slice(0, 3));
      check(errs.length === 0 && g.problems.length === 0, `${phone}: no page errors in stage select (${[...errs, ...g.problems].slice(0, 3).join(' | ') || 'none'})`);
      await g.ctx.close();
    }

    // ---------- next after stage 10 ----------
    {
      const g = await open(br, srv.base, phone, 'noaudio=1&q=low'); const { page } = g;
      await step(page, 20); await setCleared(page, 9); await toHome(page);
      check((await stageNow(page)) === 10, `${phone}: cleared 9 opens on stage 10`);
      await tap(page, 'start'); await step(page, 20);
      await page.evaluate(() => { const B = __G.B; B.phase = 'won'; B.emit({ e: 'won' }); });
      let seen = false;
      for (let i = 0; i < 80 && !seen; i++) { await step(page, 15); seen = !!(await target(page, 'next')); }
      const c10 = await page.evaluate(() => __G.meta.acc.cleared);
      check(seen && c10 === 10, `${phone}: winning stage 10 shows the result with "next" (cleared ${c10})`);
      await tap(page, 'next'); await step(page, 20);
      const nb = await page.evaluate(() => ({ state: __G.state, n: __G.stageN, bn: __G.B && __G.B.stage.n }));
      check(nb.state === 'battle' && nb.n === 11 && nb.bn === 11, `${phone}: next after stage 10 starts stage 11 (${JSON.stringify(nb)})`);
      await g.ctx.close();
    }

    // ---------- chapter chests ----------
    {
      const g = await open(br, srv.base, phone, 'noaudio=1&q=low'); const { page } = g;
      await step(page, 20); await realRules(page); await setCleared(page, 4);
      await page.evaluate(() => __G.goto('rewards')); await step(page, 30);
      const dots = () => page.evaluate(() => ({ badge: __G.metaUi.badges['tab-rewards'], rewards: __G.meta.dots().rewards }));
      let ch = await mui(page, 'chapters'), lk = await mui(page, 'chapterLock'), d = await dots();
      check(ch.every((c) => c.state === 'locked') && /qua ải 5/i.test(lk) && !d.badge && !d.rewards, `${phone}: cleared 4 locks the chest list with "${lk}", no red dot (${JSON.stringify(d)})`);
      check(!(await target(page, 'chapter0')), `${phone}: no chest button is tappable behind the padlock card`);
      await snap(page, phone, 'rewards-locked'); await audit(page, `${phone} rewards locked`);

      await setCleared(page, 5); await step(page, 30);
      ch = await mui(page, 'chapters'); d = await dots();
      check(ch[0].state === 'ready' && ch[1].state === 'locked' && d.badge && d.rewards, `${phone}: cleared 5 makes chapter 1 claimable (${ch.map((c) => c.state).join()}), red dot ${d.badge}`);
      await snap(page, phone, 'rewards-ready'); await audit(page, `${phone} rewards ready`);
      const a0 = await acc(page);
      await tap(page, 'chapter0'); await step(page, 20);
      const a1 = await acc(page), rc = await mui(page, 'chapterReceipt');
      const slots = Object.keys(a1.mats), matsOk = slots.length > 0 && slots.every((s) => a1.mats[s] - a0.mats[s] === 5);
      check(a1.gems - a0.gems === 300 && a1.bag.length === a0.bag.length + 1 && a1.bag[a1.bag.length - 1].tier === 2 && matsOk, `${phone}: claiming gave ${a1.gems - a0.gems} gems, ${a1.bag.length - a0.bag.length} item (tier ${a1.bag[a1.bag.length - 1] && a1.bag[a1.bag.length - 1].tier}), ${slots.map((s) => a1.mats[s] - a0.mats[s]).join('/')} materials per slot`);
      check(rc && rc.chapter === 0 && rc.gems === 300 && rc.item && rc.item.uid === a1.bag[a1.bag.length - 1].uid, `${phone}: the receipt shows what was received (${JSON.stringify(rc && [rc.gems, rc.mats, rc.item && rc.item.item])})`);
      ch = await mui(page, 'chapters'); d = await dots(); const b0 = await target(page, 'chapter0');
      check(ch[0].state === 'claimed' && b0 && !b0.enabled && !d.badge && !d.rewards, `${phone}: chapter 1 row reads claimed, button disabled, red dot off (${JSON.stringify(d)})`);
      await snap(page, phone, 'rewards-claimed');
      await tap(page, 'chapter0'); const a2 = await acc(page);
      const again = await page.evaluate(() => __G.meta.claimChapter(0));
      check(a2.gems === a1.gems && a2.bag.length === a1.bag.length && !again.ok, `${phone}: a second claim gives nothing (gems ${a2.gems}, bag ${a2.bag.length}, "${again.why}")`);

      await setCleared(page, 9); await step(page, 20);
      check((await mui(page, 'chapters'))[1].state === 'locked' && !(await dots()).badge, `${phone}: chapter 2 stays locked at cleared 9, no dot`);
      await setCleared(page, 10); await step(page, 30);
      ch = await mui(page, 'chapters'); d = await dots();
      check(ch[1].state === 'ready' && d.badge, `${phone}: cleared 10 opens chapter 2 (${ch.map((c) => c.state).join()}), red dot ${d.badge}`);
      await setCleared(page, 30); await step(page, 30);
      await snap(page, phone, 'rewards-many'); await audit(page, `${phone} rewards many`);
      await page.evaluate(() => { const f = document.getElementById('frame'), r = f.getBoundingClientRect(); f.dispatchEvent(new WheelEvent('wheel', { deltaY: 400, clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.7, bubbles: true, cancelable: true })); }); await step(page, 30);
      await snap(page, phone, 'rewards-scrolled'); await audit(page, `${phone} rewards scrolled`);
      const t5 = await target(page, 'chapter5'); check(!!t5, `${phone}: the sixth chest is reachable by scrolling`);
      await clip(page, `${phone} rewards`);
      const errs = await page.evaluate(() => (window.__errors || []).slice(0, 3));
      check(errs.length === 0 && g.problems.length === 0, `${phone}: no page errors on the chest list (${[...errs, ...g.problems].slice(0, 3).join(' | ') || 'none'})`);
      await g.ctx.close();
    }
  }
  const keep = ['home-0', 'home-13', 'home-35', 'rewards-locked', 'rewards-ready', 'rewards-claimed', 'rewards-many', 'rewards-scrolled'];
  for (const ph of ['s22', 'xiaomi']) { const fs2 = keep.map((k) => path.join(OUT, `${ph}-${k}.png`)).filter((f) => fs.existsSync(f)); if (fs2.length) sheet(fs2, path.join(OUT, `review-${ph}.png`), 4, 330); }
} finally { await br.close(); srv.close(); }
done();
