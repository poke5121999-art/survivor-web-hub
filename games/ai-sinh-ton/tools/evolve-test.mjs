// Evolution end to end. Node: the account's rules (level, stage, materials, what is paid), the battle fighting the new
// form, the form-3 fork and the paid switch of path. Browser (S22 and Xiaomi 17T): openEvolve() on a stocked account,
// the comparison and the price on the screen, TIẾN HOÁ through a real tap, every beat of the moment in order (cocoon,
// crack, burst, pose, done), the new form running laps of the pedestal, a tap skipping the moment, the fork buttons, the
// path switch, "Giảm chớp sáng" dimming the light, texts inside their panels, tap targets, no console errors.
// Screenshots: .chk/a10/evo/. Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/evolve-test.mjs
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';
import { createMeta } from '../js/meta.js';
import { createBattle } from '../js/sim/battle.js';
import { heroDef } from '../js/data/beasts.js';
import { EVOLVE } from '../js/data/economy.js';

const OUT = path.join(ROOT, '.chk', 'a10', 'evo'); fs.mkdirSync(OUT, { recursive: true });
const { check, done } = checker();
const fakeStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

// ---------- Node: rules and the battle ----------
{
  const M = createMeta({ storage: fakeStorage(), now: () => new Date(2026, 10, 23), preset: 'vet' }); const A = M.acc;
  A.heroes.chon.level = EVOLVE[2].level; A.heroes.chon.shards = 30; A.gold = 5000; A.evo.stone.gio = 9;
  check(M.canEvolve('chon').why === 'thiếu 1 Đá Mầm Gió', `one stone short: "${M.canEvolve('chon').why}"`);
  A.evo.stone.gio = 10;
  const before = createBattle({ stage: 3, seed: 5, team: M.teamSpec() }).heroes.find((u) => u.kind === 'chon');
  const r = M.evolve('chon');
  check(r.ok && A.gold === 0 && A.heroes.chon.shards === 0 && A.evo.stone.gio === 0, `form 2 took exactly 5000 gold, 30 shards, 10 Đá Mầm Gió (left ${A.gold}, ${A.heroes.chon.shards}, ${A.evo.stone.gio})`);
  const after = createBattle({ stage: 3, seed: 5, team: M.teamSpec() }).heroes.find((u) => u.kind === 'chon');
  check(before.def.form === 1 && after.def.form === 2 && Math.abs(after.maxHp / before.maxHp - 1.25) < 0.02 && after.def.s1.name === 'Lướt Liềm' && after.mods.crit >= 0.1,
    `in battle Chồn is now ${after.def.formName}: health x${(after.maxHp / before.maxHp).toFixed(3)}, ${after.def.s1.name}, crit passive ${after.mods.crit}`);
  A.heroes.tegiap.level = 30; A.heroes.tegiap.shards = 999; A.gold = 1e6; A.evo.stone.dat = 200; A.evo.core = 9; A.cleared = 20;
  M.evolve('tegiap'); M.evolve('tegiap', 'b');
  const b = createBattle({ stage: 3, seed: 5, team: M.teamSpec() }).heroes.find((u) => u.kind === 'tegiap');
  check(b.def.look === 'tegiap.3b' && b.mv.kind === 'roll' && b.hooks.kbHeal, `path b fights as ${b.def.formName} (rolls, heals on knock-backs)`);
  const g0 = A.gold, c0 = A.evo.core; M.rebranch('tegiap', 'a');
  const a = createBattle({ stage: 3, seed: 5, team: M.teamSpec() }).heroes.find((u) => u.kind === 'tegiap');
  check(a.def.look === 'tegiap.3a' && a.mv.kind === 'stomp' && g0 - A.gold === EVOLVE[3].gold / 2 && A.evo.core === c0, `the switch to path a fights as ${a.def.formName} (stomps) and cost ${g0 - A.gold} gold, no Lõi Cổ`);
}

// ---------- browser ----------
const srv = await serve(); const br = await launch();
const shots = [];
const step = (page, n) => page.evaluate((k) => __step(k), n);
const reg = (page) => page.evaluate(() => { const r = __G.evolveUi; return { phase: r.phase, goLabel: r.goLabel, seen: r.seen.slice(), to: r.to, from: r.from, ok: r.ok, why: r.why, skipped: r.skipped, glowMax: r.glowMax, newPos: r.newPos, texts: r.texts.filter((t) => t.node.parent && t.node.str).map((t) => t.node.str) }; });
async function tap(page, id) {
  const t = (await page.evaluate(() => __ui.targets())).find((q) => q.id === id); if (!t) return false;
  await page.touchscreen.tap(t.x + t.w / 2, t.y + t.h / 2); await step(page, 2); return true;
}
async function shot(page, phone, name) { const f = path.join(OUT, `${phone}-${name}.png`); await page.locator('#frame').screenshot({ path: f }); shots.push(f); }
async function audit(page, label) {
  const bad = await page.evaluate(() => {
    const out = [], k = document.getElementById('frame').getBoundingClientRect().width / 780;
    for (const t of __ui.targets()) {
      if (!t.id.startsWith('evolve')) continue;
      if (t.w / k < 47.5 || t.h / k < 47.5) out.push(`${t.id} is ${(t.w / k).toFixed(1)}x${(t.h / k).toFixed(1)}`);
      const hit = __ui.hitAt(t.x + t.w / 2, t.y + t.h / 2); if (hit !== t.id) out.push(`${t.id} centre hits ${hit}`);
    }
    return out.concat(__G.evolveUi.audit());
  });
  check(bad.length === 0, `${label}: tap targets at least 48 px and owning their centre, every text inside its panel (${bad.slice(0, 4).join('; ') || 'none out'})`);
}
const stock = (page) => page.evaluate(() => {
  const A = __G.meta.acc;
  Object.assign(A.heroes.tegiap, { level: 30, shards: 999, form: 1, branch: null }); A.gold = 1e6; A.evo.stone.dat = 200; A.evo.core = 9; A.cleared = Math.max(A.cleared, 20); __G.meta.save();
});
const openEvo = (page, id) => page.evaluate(async (hid) => { const m = await import(document.querySelector('script[src*="js/main.js"]').src.replace('main.js', 'ui/evolve.js')); __G.goto('heroes', { id: hid }); return m.openEvolve(hid); }, id);

for (const phone of ['s22', 'xiaomi']) {
  const { page, problems, ctx } = await open(br, srv.base, phone, 'noaudio=1&q=low', { freeze: true });
  await stock(page);
  check(await openEvo(page, 'tegiap'), `${phone}: openEvolve('tegiap') opens the screen`);
  await step(page, 40);
  let R = await reg(page);
  check(R.phase === 'ready' && R.ok && R.from.name === 'Tê Giáp' && R.to.name === 'Tê Thành Lũy' && R.to.move === 'gallop' && R.to.skills.includes('Húc → Húc Nứt Đất') && R.to.passive === 'Phản Chấn',
    `${phone}: ready, comparing ${R.from.name} (${R.from.hp} máu) with ${R.to && R.to.name} (${R.to && R.to.hp} máu, ${R.to && R.to.move}), skills ${R.to && R.to.skills.join(', ')}, passive ${R.to && R.to.passive}`);
  check(Math.abs(R.to.hp / R.from.hp - 1.25) < 0.03, `${phone}: the new health is 25% up before equipment (${R.from.hp} -> ${R.to.hp})`);
  await shot(page, phone, '1-ready'); await audit(page, `${phone} ready`);
  // the moment, through a real tap, every beat sampled
  check(await tap(page, 'evolve-go'), `${phone}: TIẾN HOÁ is tapped`);
  const beats = [];
  for (let i = 0; i < 400; i++) { await step(page, 3); R = await reg(page); if (!beats.includes(R.phase)) { beats.push(R.phase); await shot(page, phone, `2-${beats.length}-${R.phase}`); } if (R.phase === 'done') break; }
  check(R.seen.join(',') === 'ready,cocoon,crack,burst,pose,done' && !R.skipped, `${phone}: every beat in order: ${R.seen.join(' -> ')}`);
  const acc = await page.evaluate(() => ({ form: __G.meta.acc.heroes.tegiap.form, gold: __G.meta.acc.gold }));
  check(acc.form === 2 && acc.gold === 1e6 - 5000, `${phone}: the account holds form 2 and paid 5000 gold`);
  const p0 = (await reg(page)).newPos; await step(page, 45); const p1 = (await reg(page)).newPos;
  check(p0 && p1 && Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0.3 && Math.abs(Math.hypot(p1[0], p1[2]) - 0.85) < 0.05, `${phone}: the new form runs laps of the pedestal (moved ${p0 && p1 ? Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(2) : '?'} m on a 0.85 m circle)`);
  await shot(page, phone, '3-done-run'); await audit(page, `${phone} done`);
  const glowFull = R.glowMax;
  check(await tap(page, 'evolve-close'), `${phone}: XONG closes`);
  await step(page, 20);
  check(await page.evaluate(() => __G.screen === 'heroes' && !__ui.isShown('evolve')), `${phone}: back on the beast screen`);
  // form 3 at the fork: path b, the moment skipped by a tap, with "Giảm chớp sáng" on
  await page.evaluate(() => __G.setSetting('reduceFlash', true));
  await openEvo(page, 'tegiap'); await step(page, 30);
  R = await reg(page);
  check(R.to && R.to.name === 'Pháo Đài Rêu' && (await page.evaluate(() => __ui.targets().filter((t) => t.id.startsWith('evolve-branch')).length)) === 2, `${phone}: at the fork both paths are offered, path a shown first (${R.to && R.to.name})`);
  await tap(page, 'evolve-branch-b'); await step(page, 10); R = await reg(page);
  check(R.to.name === 'Tê Cầu Gai' && R.to.move === 'roll', `${phone}: picking path b compares with ${R.to.name} (${R.to.move})`);
  await shot(page, phone, '4-fork-b'); await audit(page, `${phone} fork`);
  await tap(page, 'evolve-go'); for (let i = 0; i < 25; i++) await step(page, 3);
  R = await reg(page); const midPhase = R.phase;
  await shot(page, phone, '5-dim-' + midPhase);
  await tap(page, 'evolve-skip'); await step(page, 4); R = await reg(page);
  const br3 = await page.evaluate(() => __G.meta.acc.heroes.tegiap);
  check(R.phase === 'done' && R.skipped && br3.form === 3 && br3.branch === 'b', `${phone}: a tap during ${midPhase} skips to the end; the beast is form 3 path b`);
  check(glowFull > 4 && R.glowMax <= glowFull * 0.3, `${phone}: "Giảm chớp sáng" keeps the flash light at ${R.glowMax.toFixed(2)} (full ${glowFull.toFixed(2)})`);
  await tap(page, 'evolve-close'); await step(page, 10);
  // the paid switch back to path a
  await openEvo(page, 'tegiap'); await step(page, 30); R = await reg(page);
  const label = await page.evaluate(() => __ui.targets().some((t) => t.id === 'evolve-go'));
  check(R.to && R.to.name === 'Pháo Đài Rêu' && label && R.goLabel === 'ĐỔI NHÁNH', `${phone}: on path b the screen offers ĐỔI NHÁNH to ${R.to && R.to.name}`);
  await shot(page, phone, '6-rebranch');
  await tap(page, 'evolve-go'); for (let i = 0; i < 200 && (await reg(page)).phase !== 'done'; i++) await step(page, 6);
  check((await page.evaluate(() => __G.meta.acc.heroes.tegiap.branch)) === 'a', `${phone}: after the switch the beast is on path a`);
  // a beast short of materials: the button is off and the price names what is missing
  await tap(page, 'evolve-close'); await step(page, 10);
  await page.evaluate(() => { const A = __G.meta.acc; Object.assign(A.heroes.chon, { level: 3, form: 1, branch: null }); });
  await openEvo(page, 'chon'); await step(page, 30); R = await reg(page);
  check(R.ok === false && R.why === 'chưa đủ cấp 8' && R.texts.some((s) => s.includes('chưa đủ cấp 8')), `${phone}: Chồn at level 3 cannot evolve and the screen says "${R.why}"`);
  await shot(page, phone, '7-locked'); await audit(page, `${phone} locked`);
  // every beast at every step, rich and poor (the poor price line carries the reason too): nothing spills or hides under a button
  await tap(page, 'evolve-close'); await step(page, 10);
  const sweep = await page.evaluate(async () => {
    const m = await import(document.querySelector('script[src*="js/main.js"]').src.replace('main.js', 'ui/evolve.js')); const bz = await import(document.querySelector('script[src*="js/main.js"]').src.replace('main.js', 'data/beasts.js'));
    const { HEROES } = await import(document.querySelector('script[src*="js/main.js"]').src.replace('main.js', 'data/heroes.js'));
    const A = __G.meta.acc, out = []; let n = 0;
    for (const id of HEROES.map((h) => h.id)) {
      if (!A.heroes[id]) A.heroes[id] = { level: 1, shards: 0, form: 1, branch: null };
      const br = bz.branchesOf(id);
      const states = [[1, null], [2, null], ...(br.length ? br.map((b) => [3, b]) : [[3, null]])];
      for (const [form, branch] of states) for (const rich of [true, false]) {
        Object.assign(A.heroes[id], { level: rich ? 30 : 2, shards: rich ? 999 : 0, form, branch });
        A.gold = rich ? 1e6 : 0;
        m.openEvolve(id); __step(12); n++;
        for (const b of __G.evolveUi.audit()) out.push(`${id}.${form}${branch || ''} ${rich ? 'rich' : 'poor'}: ${b}`);
        __G.screens.evolve.hide(); __step(2);
      }
    }
    return { n, out };
  });
  check(sweep.n >= 90 && sweep.out.length === 0, `${phone}: ${sweep.n} screens (14 beasts, every step, rich and poor) keep every text inside its panel and above the buttons (${sweep.out.slice(0, 3).join(' | ') || 'none out'})`);
  check(problems.length === 0, `${phone}: no console errors (${problems.slice(0, 3).join(' | ') || 'none'})`);
  await ctx.close();
}
await br.close(); srv.close();
sheet(shots, path.join(OUT, 'sheet.png'), 4, 390);
console.log('shots: ' + OUT);
done();
