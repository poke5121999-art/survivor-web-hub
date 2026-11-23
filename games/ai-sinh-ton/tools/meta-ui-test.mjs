// Meta UI through real taps: home, tabs, gacha, heroes, stage select, daily chest, save across reload, title clipping.
// State is read from __G.meta.acc; the text the UI shows comes from __G.metaUi (the counters, the rates table, the title nodes).
// Usage: timeout 900 node games/ai-sinh-ton/tools/meta-ui-test.mjs
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';
import { levelCost } from '../js/data/economy.js';

const OUT = path.join(ROOT, '.chk', 'landscape', 'shots-meta'), LS = path.join(ROOT, '.chk', 'landscape'); fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(LS, { recursive: true });
const { check, done } = checker();
const srv = await serve(); const br = await launch();
const shots = [];

const tapXY = async (page, x, y) => { if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
const targets = (page) => page.evaluate(() => __ui.targets());
async function tap(page, id) {
  const t = (await targets(page)).find((q) => q.id === id);
  if (!t) return false;
  await tapXY(page, t.x + t.w / 2, t.y + t.h / 2);
  await page.evaluate(() => __step(8));
  return true;
}
const step = (page, n) => page.evaluate((k) => __step(k), n);
const acc = (page) => page.evaluate(() => JSON.parse(JSON.stringify(__G.meta.acc)));
const screenName = (page) => page.evaluate(() => __G.screen);
async function snap(page, phone, name) {
  const f = path.join(OUT, `${phone}-${name}.png`); await page.screenshot({ path: f }); shots.push(f);
}

async function auditTargets(page, label) {
  const bad = await page.evaluate(() => {
    const out = [];
    for (const t of __ui.targets()) {
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2, hit = __ui.hitAt(cx, cy);
      const r = document.getElementById('frame').getBoundingClientRect(), k = r.width / 780;
      if (t.w / k < 47.5 || t.h / k < 47.5) out.push(`${t.id} is ${(t.w / k).toFixed(1)}x${(t.h / k).toFixed(1)}`);
      if (hit !== t.id) out.push(`${t.id} centre hits ${hit}`);
    }
    return out;
  });
  const n = (await targets(page)).length;
  check(bad.length === 0, `${label}: all ${n} targets are at least 48x48 CSS px and own their centre (${bad.slice(0, 4).join('; ') || 'none out'})`);
}

try {
  for (const phone of (process['env'].PH || 's22,xiaomi,desktop').split(',')) {
    const g = await open(br, srv.base, phone, 'noaudio=1&q=low'); const { page } = g;
    await step(page, 20);
    // 1. fresh account
    const a0 = await acc(page);
    const bar = await page.evaluate(() => ({ ...__G.metaUi.barText, screen: __G.screen }));
    check(bar.screen === 'home' && Object.values(a0.heroes).filter((h) => h.level > 0).length === 4 && bar.gems === '1.000' && bar.gold === '1.500',
      `${phone}: fresh account shows home, 4 heroes, top bar gems "${bar.gems}" gold "${bar.gold}"`);
    await snap(page, phone, 'home');

    // 2. tabs and targets
    const seen = {};
    for (const [tab, scr] of [['tab-gacha', 'gacha'], ['tab-equip', 'equip'], ['tab-heroes', 'heroes'], ['tab-rewards', 'rewards'], ['tab-battle', 'home']]) {
      const ok = await tap(page, tab); await step(page, 30);
      const s = await screenName(page);
      check(ok && s === scr, `${phone}: tapping ${tab} shows "${s}" (want ${scr})`);
      await auditTargets(page, `${phone} ${scr}`); await snap(page, phone, scr); seen[scr] = 1;
    }

    // 3. gacha buttons and the animation
    await tap(page, 'tab-gacha'); await step(page, 20);
    await tap(page, 'rates'); await step(page, 20);
    const rates = await page.evaluate(() => __G.metaUi.rates);
    const sum = rates.reduce((s, r) => s + r.p, 0);
    check(rates.length === 8 && Math.abs(sum - 100) < 1e-6, `${phone}: rates panel lists ${rates.length} rows summing to ${sum}%`);
    await snap(page, phone, 'rates'); await auditTargets(page, `${phone} rates panel`);
    await tap(page, 'rates-close'); await step(page, 20);
    const g0 = (await acc(page)).gems;
    await tap(page, 'pull10'); await step(page, 10);
    const a1 = await acc(page);
    check(a1.gems === g0 - 900 && a1.stats.pulls === 10, `${phone}: pull10 spent ${g0 - a1.gems} gems (want 900) and counted ${a1.stats.pulls} pulls (want 10)`);
    for (let i = 0; i < 5; i++) { await step(page, 28); await snap(page, phone, 'pull10-' + i); }
    await auditTargets(page, `${phone} mid-pull`);
    await tap(page, 'skip'); await step(page, 40);
    const ph = await page.evaluate(() => __G.metaUi.gachaPhase());
    check(ph === 'summary', `${phone}: skip jumps to the summary (phase "${ph}")`);
    await snap(page, phone, 'pull10-summary'); await auditTargets(page, `${phone} summary`);
    await tap(page, 'done'); await step(page, 20);
    const ph2 = await page.evaluate(() => __G.metaUi.gachaPhase());
    const tg = await targets(page);
    check(ph2 === 'idle' && tg.some((t) => t.id === 'pull1'), `${phone}: done returns to the machine (phase "${ph2}")`);
    const gl = (await acc(page)).gems;
    await tap(page, 'pull1'); await step(page, 10);
    const a2 = await acc(page);
    check(gl === 100 && a2.gems === 0 && a2.stats.pulls === 11, `${phone}: with ${gl} gems pull1 works once (gems now ${a2.gems}, pulls ${a2.stats.pulls})`);
    for (let i = 0; i < 4; i++) { await step(page, 30); if (i === 1) await snap(page, phone, 'pull1-drop'); }
    await snap(page, phone, 'pull1-reveal');
    await tap(page, 'skip'); await step(page, 10);
    check((await targets(page)).some((t) => t.id === 'done'), `${phone}: single pull ends on a done button`);
    await tap(page, 'done'); await step(page, 30);
    const tg2 = await targets(page); const b1 = tg2.find((t) => t.id === 'pull1'), b10 = tg2.find((t) => t.id === 'pull10');
    const pt = await page.evaluate(() => __G.metaUi.pullText);
    check(b1 && b10 && !b1.enabled && !b10.enabled && pt.p1 === 'Thiếu ngọc', `${phone}: with 0 gems both pull buttons are disabled (pull1 ${b1 && b1.enabled}, pull10 ${b10 && b10.enabled}, text "${pt.p1}")`);
    await snap(page, phone, 'gacha-empty');

    // 4. rates through the command (once, on the s22 run)
    if (phone === 's22') {
      const r = await page.evaluate(() => {
        __G.meta.acc.gems = 1e9; const n = 3000, cnt = {};
        for (let i = 0; i < n; i++) { const x = __G.meta.pull(1).results[0]; cnt[x.row] = (cnt[x.row] || 0) + 1; }
        const T = {}; return { n, cnt, gems: __G.meta.acc.gems };
      });
      const table = await page.evaluate(() => null);
      const { GACHA } = await import('../js/data/economy.js');
      const worst = [];
      for (const row of GACHA.table) {
        const got = (r.cnt[row.id] || 0) / r.n * 100, sd = Math.sqrt(row.p * (100 - row.p) / r.n);
        const hi = row.id === 'hero_ssr' ? row.p + 2.5 : row.p + 4 * sd + 1, lo = row.id === 'hero_ssr' ? row.p : row.p - 4 * sd - 1;
        worst.push(`${row.id} ${got.toFixed(2)}% vs ${row.p}%`); if (got > hi || got < lo) worst.push('OUT:' + row.id);
      }
      check(!worst.some((w) => w.startsWith('OUT')), `${phone}: ${r.n} pulls land near the table (${worst.filter((w) => !w.startsWith('OUT')).join(', ')}; hero_ssr is lifted by the 50-pull rule)`);
      await page.evaluate(() => { __G.meta.acc.gems = 0; });
    }

    // 5. heroes
    await tap(page, 'tab-heroes'); await step(page, 30);
    const cells = await page.evaluate(() => __G.metaUi.gridCount);
    check(cells === 14, `${phone}: the hero grid builds ${cells} tiles (want 14)`);
    await page.evaluate(() => { const A = __G.meta.acc; A.heroes.tegiap.shards = 100; A.gold = 5000; });
    await page.evaluate(() => __G.goto('heroes')); await step(page, 10);
    check(await tap(page, 'hero-tegiap'), `${phone}: hero tile hero-tegiap can be tapped`); await step(page, 30);
    const selA = await page.evaluate(() => ({ s: __G.screen, id: __G.metaUi.heroSel() }));
    check(selA.s === 'heroes' && selA.id === 'tegiap', `${phone}: tapping a tile selects the hero on the same screen ("${selA.s}", selected "${selA.id}")`);
    await snap(page, phone, 'hero'); await auditTargets(page, `${phone} hero detail`);
    const lv0 = (await acc(page)).heroes.tegiap, gold0 = (await acc(page)).gold, cost = levelCost(lv0.level);
    await tap(page, 'levelup'); await step(page, 20);
    const lv1 = (await acc(page)).heroes.tegiap, gold1 = (await acc(page)).gold;
    check(lv1.level === lv0.level + 1 && lv0.shards - lv1.shards === cost.shards && gold0 - gold1 === cost.gold, `${phone}: levelup raised level ${lv0.level} to ${lv1.level}, spent ${lv0.shards - lv1.shards} shards and ${gold0 - gold1} gold (cost ${cost.shards} and ${cost.gold})`);
    await snap(page, phone, 'hero-levelup');
    // 9. title clearance on every screen built so far (empty canvases are skipped)
    const clip = await page.evaluate(() => {
      const out = []; let min = 99;
      for (const t of __G.metaUi.titles) {
        if (!t.node || !t.node.canvas) continue;
        const c = t.node.canvas, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let top = -1, bot = -1;
        for (let y = 0; y < c.height && top < 0; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { top = y; break; }
        for (let y = c.height - 1; y >= 0 && bot < 0; y--) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { bot = c.height - 1 - y; break; }
        if (top < 0) continue; min = Math.min(min, top, bot); if (top < 1 || bot < 1) out.push(`${t.screen}: ${top} rows above, ${bot} below`);
      }
      return { bad: out, n: __G.metaUi.titles.length, min };
    });
    check(clip.bad.length === 0 && clip.n >= 8, `${phone}: ${clip.n} title nodes all have free canvas rows above and below the ink (smallest ${clip.min}; ${clip.bad.join('; ') || 'none clipped'})`);

    await page.evaluate(() => { __G.meta.acc.heroes.tegiap.shards = 1; });
    await page.evaluate(() => { __G.goto('heroes'); }); await step(page, 5); await tap(page, 'hero-tegiap'); await step(page, 20);
    const lvBtn = (await targets(page)).find((t) => t.id === 'levelup'), need = levelCost((await acc(page)).heroes.tegiap.level).shards - 1;
    const lt = await page.evaluate(() => __G.metaUi.levelupText);
    check(lvBtn && !lvBtn.enabled && lt === `Thiếu ${need} mảnh`, `${phone}: levelup is disabled and says "${lt}" (want "Thiếu ${need} mảnh")`);
    const t0 = (await acc(page)).team.slice();
    await tap(page, 'team-toggle'); await step(page, 10);
    const t1 = (await acc(page)).team.slice(); await tap(page, 'team-toggle'); await step(page, 10);
    const t2 = (await acc(page)).team.slice();
    check(t0.includes('tegiap') && !t1.includes('tegiap') && t1.length === 3 && t2.includes('tegiap') && t2.length === 4, `${phone}: team-toggle leaves and rejoins (${t0.length} -> ${t1.length} -> ${t2.length})`);
    await page.evaluate(() => { __G.meta.acc.heroes.cu = { level: 1, shards: 0 }; __G.goto('heroes', { id: 'cu' }); }); await step(page, 20);
    await tap(page, 'team-toggle'); await step(page, 20);
    await snap(page, phone, 'team-pick');
    const hasPick = (await targets(page)).some((t) => t.id === 'replace-1');
    await tap(page, 'replace-1'); await step(page, 20);
    const t3 = (await acc(page)).team;
    check(hasPick && t3[1] === 'cu' && t3.length === 4, `${phone}: a full team asks who to replace and puts cu in slot 2 (${t3.join(',')})`);
    await tap(page, 'back'); await step(page, 20);

    // 6. save survives a reload
    const before = await page.evaluate(() => { const A = __G.meta.acc; return JSON.stringify({ gems: A.gems, gold: A.gold, pity: A.pity, team: A.team, lv: Object.fromEntries(Object.entries(A.heroes).map(([k, v]) => [k, v.level])) }); });
    await page.reload(); await page.waitForFunction('window.__ready === true', null, { timeout: 90000 }); await step(page, 10);
    const after = await page.evaluate(() => { const A = __G.meta.acc; return JSON.stringify({ gems: A.gems, gold: A.gold, pity: A.pity, team: A.team, lv: Object.fromEntries(Object.entries(A.heroes).map(([k, v]) => [k, v.level])) }); });
    check(before === after, `${phone}: gems, gold, levels, team and pity survive a reload (${before === after ? 'identical' : before + ' vs ' + after})`);

    // 7. stage select
    await page.evaluate(() => { __G.meta.acc.cleared = 3; __G.goto('home'); }); await step(page, 30);
    let st = await page.evaluate(() => __G.metaUi.stage());
    let nx = (await targets(page)).find((t) => t.id === 'stage-next');
    check(st === 4 && nx && !nx.enabled, `${phone}: with 3 cleared the screen shows stage ${st} and stage-next is locked (${nx && nx.enabled})`);
    await tap(page, 'stage-prev'); await step(page, 10);
    nx = (await targets(page)).find((t) => t.id === 'stage-next');
    const st3 = await page.evaluate(() => __G.metaUi.stage());
    check(st3 === 3 && nx.enabled, `${phone}: stage-prev goes to ${st3} and stage-next opens`);
    await tap(page, 'stage-next'); await step(page, 10);
    await snap(page, phone, 'stage4');
    const want = await page.evaluate(() => __G.metaUi.stage());
    await tap(page, 'start'); await step(page, 10);
    const bs = await page.evaluate(() => ({ state: __G.state, n: __G.stageN }));
    check(bs.state === 'battle' && bs.n === want, `${phone}: start enters battle on stage ${bs.n} (shown ${want}, state ${bs.state})`);
    await page.evaluate(() => { __G.leaveBattle(); }); await step(page, 20);

    // 8. daily chest
    await tap(page, 'tab-rewards'); await step(page, 20);
    const d0 = await acc(page); await tap(page, 'daily'); await step(page, 30);
    const d1 = await acc(page); await snap(page, phone, 'rewards-claimed');
    const dn = (await targets(page)).find((t) => t.id === 'daily'); const dtxt = await page.evaluate(() => __G.metaUi.dailyText);
    await tap(page, 'daily'); const d2 = await acc(page);
    check(d1.gems === d0.gems + 150 && d1.gold === d0.gold + 500 && dn && !dn.enabled && d2.gems === d1.gems && dtxt === 'Quay lại vào ngày mai', `${phone}: daily gave +${d1.gems - d0.gems} gems, +${d1.gold - d0.gold} gold once, then "${dtxt}" and disabled`);

    // 10. errors
    const errs = await page.evaluate(() => (window.__errors || []).slice(0, 3));
    check(errs.length === 0 && g.problems.length === 0, `${phone}: no page errors (${[...errs, ...g.problems].slice(0, 3).join(' | ') || 'none'})`);
    await g.ctx.close();
  }
  for (const phone of (process['env'].PH || 's22,xiaomi,desktop').split(',')) {
    const pick = (names) => names.map((n) => path.join(OUT, `${phone}-${n}.png`)).filter((f) => fs.existsSync(f));
    sheet(pick(['hero', 'hero-levelup', 'team-pick']), path.join(LS, `heroes-${phone}.png`), 2, 640);
    sheet(pick(['gacha', 'rates', 'pull10-1', 'pull10-summary', 'pull1-drop', 'pull1-reveal', 'gacha-empty']), path.join(LS, `gacha-${phone}.png`), 2, 640);
    sheet(pick(['home', 'heroes', 'equip', 'rewards', 'stage4', 'rewards-claimed']), path.join(OUT, `review-${phone}.png`), 3, 420);
  }
} finally { await br.close(); srv.close(); }
done();
