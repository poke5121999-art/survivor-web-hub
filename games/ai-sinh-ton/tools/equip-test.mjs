// Equipment screen through real taps: locks, wear / move, upgrade, merge (exact and free fodder), Ghép Nhanh, the battle
// bonus, save across reload, target sizes. State is read from __G.meta.acc and the text the screen shows from
// __G.metaUi.equipUi. Usage: timeout 900 node games/ai-sinh-ton/tools/equip-test.mjs
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';
import { TIERS, ITEM, itemStat, upgradeCost } from '../js/data/equip.js';
import { HERO } from '../js/data/heroes.js';
import { levelMul } from '../js/data/economy.js';

const OUT = path.join(ROOT, '.chk', 'equip'); fs.mkdirSync(OUT, { recursive: true });
const { check, done } = checker();
const srv = await serve(); const br = await launch();
const shots = [];
const num = (s) => +String(s).replace(/\./g, '');

const step = (page, n) => page.evaluate((k) => __step(k), n);
const targets = (page) => page.evaluate(() => __ui.targets());
async function tap(page, id, n = 12) {
  const t = (await targets(page)).find((q) => q.id === id);
  if (!t) return false;
  await page.touchscreen.tap(t.x + t.w / 2, t.y + t.h / 2);
  await step(page, n);
  return true;
}
const acc = (page) => page.evaluate(() => JSON.parse(JSON.stringify(__G.meta.acc)));
const eu = (page) => page.evaluate(() => JSON.parse(JSON.stringify(__G.metaUi.equipUi)));
const screenName = (page) => page.evaluate(() => __G.screen);
const refresh = async (page) => { await page.evaluate(() => { __G.goto('home'); __G.goto('equip'); }); await step(page, 12); };
// replace the bag with the listed items and optionally set what is worn; returns the uids
const setBag = (page, list, worn = {}) => page.evaluate(([l, w]) => {
  const M = __G.meta; M.acc.bag = []; M.acc.equip = {};
  const uids = l.map(([item, tier, lv]) => { const it = { uid: ++M.acc.uidSeq, item, tier, lv: lv || 1 }; M.acc.bag.push(it); return it.uid; });
  for (const [hi, slots] of Object.entries(w)) { const hid = M.acc.team[+hi]; M.acc.equip[hid] = {}; for (const [s, k] of Object.entries(slots)) M.acc.equip[hid][s] = uids[k]; }
  M.save(); return uids;
}, [list, worn]);
async function snap(page, phone, name) { const f = path.join(OUT, `${phone}-${name}.png`); await page.screenshot({ path: f }); shots.push(f); }
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
  const n = (await targets(page)).length;
  check(bad.length === 0, `${label}: ${n} targets all at least 48x48 CSS px and own their centre (${bad.slice(0, 4).join('; ') || 'none out'})`);
}

try {
  for (const phone of ['s22', 'xiaomi']) {
    const P = (m) => `${phone}: ${m}`;
    // ---------- 1. locks on an account below level 6
    {
      const g = await open(br, srv.base, phone, 'noaudio=1&q=low', { fresh: true }); const { page, problems } = g;
      await step(page, 20);
      await page.evaluate(() => { __G.meta.ftueSkip(); for (const id of ['spectate', 'speed', 'daily', 'chapter', 'equip', 'merge']) __G.meta.ftueDone(id); window.__toasts = []; const o = __ui.toast; __ui.toast = (s) => { __toasts.push(s); o(s); }; });
      await step(page, 20);
      await tap(page, 'tab-equip', 20);
      const t = await page.evaluate(() => ({ screen: __G.screen, toasts: __toasts.slice(), want: __G.meta.lockText('equip'), lvl: __G.meta.acc.level }));
      check(t.screen === 'home' && t.toasts[t.toasts.length - 1] === t.want, P(`tab Trang Bị at account level ${t.lvl} stays on "${t.screen}" and toasts "${t.toasts[t.toasts.length - 1]}" (want "${t.want}")`));
      // level 7 without three identical items: the screen opens and the merge buttons do not exist
      await page.evaluate(() => { const M = __G.meta; M.acc.cheatUnlock = false; M.acc.level = 7; M.acc.xp = 0; M.acc.mergeOpen = false; M.acc.bag = []; M.save(); __toasts.length = 0; });
      await step(page, 10);
      await tap(page, 'tab-equip', 20);
      check(await screenName(page) === 'equip', P('tab Trang Bị opens at level 7'));
      const ids = (await targets(page)).map((q) => q.id);
      check(!ids.includes('merge') && !ids.includes('automerge') && ids.includes('equip-best'), P('GHÉP and GHÉP NHANH are not shown before three identical items; MẶC TỐT NHẤT is (' + ids.filter((i) => /merge|best/.test(i)).join(',') + ')'));
      await snap(page, phone, 'locked'); await audit(page, P('locked merge'));
      check(problems.length === 0, P('locks: no console errors') + (problems[0] ? ' ' + problems[0] : ''));
      await g.ctx.close();
    }

    // ---------- 2. the vet account
    const g = await open(br, srv.base, phone, 'noaudio=1&q=low'); const { page, problems } = g;
    await step(page, 20);
    const A0 = await acc(page); const h0 = A0.team[0], h1 = A0.team[1];
    await page.evaluate(() => { const M = __G.meta; M.acc.gold = 10000; for (const s of Object.keys(M.acc.mats)) M.acc.mats[s] = 20; M.save(); });
    await setBag(page, []);
    await tap(page, 'tab-equip', 25);
    let u = await eu(page);
    check((await screenName(page)) === 'equip' && u.bag === 0 && u.emptyText === '', P(`empty bag shows no standing text ("${u.emptyText}", ${u.bag} items)`));
    await snap(page, phone, 'empty'); await audit(page, P('empty bag'));

    // wear, stats, move between heroes
    let [a, b, c, d] = await setBag(page, [['w_cua', 0, 1], ['w_no', 0, 1], ['a_lop', 0, 1], ['n_rang', 0, 1]]);
    await refresh(page);
    u = await eu(page);
    check(u.bag === 4 && u.hero === h0, P(`bag shows ${u.bag} items for hero ${u.hero}`));
    await snap(page, phone, 'bag'); await audit(page, P('bag with items'));
    const before = num((await eu(page)).atk);
    await tap(page, 'bag-' + a, 25);
    u = await eu(page);
    check(u.sheet && u.sheet.uid === a && u.sheet.name === ITEM.w_cua.name && u.sheet.tier === TIERS[0].name && u.sheet.perks.length === 3 && u.sheet.perks.every((p) => !p.on) && u.sheet.perks[0].tier === TIERS[3].name,
      P(`item sheet shows "${u.sheet && u.sheet.name}" / "${u.sheet && u.sheet.tier}" with 3 locked perks, first opens at "${u.sheet && u.sheet.perks[0].tier}"`));
    await snap(page, phone, 'sheet'); await audit(page, P('item sheet'));
    await tap(page, 'wear', 30);
    let A = await acc(page); u = await eu(page);
    check(A.equip[h0] && A.equip[h0].weapon === a, P(`wear puts item ${a} in ${h0}'s weapon slot (${A.equip[h0] && A.equip[h0].weapon})`));
    check(num(u.atk) - before === itemStat({ item: 'w_cua', tier: 0, lv: 1 }) && num(u.atkBonus) === itemStat({ item: 'w_cua', tier: 0, lv: 1 }),
      P(`ATK text went ${before} -> ${num(u.atk)} (+${num(u.atk) - before}, want +${itemStat({ item: 'w_cua', tier: 0, lv: 1 })}), bonus text "${u.atkBonus}"`));
    await snap(page, phone, 'worn'); await audit(page, P('after wear'));
    // the same item on the next hero moves it
    await tap(page, 'hero-next', 20);
    u = await eu(page);
    check(u.hero === h1, P(`next hero is ${u.hero} (want ${h1})`));
    check(u.uids.includes(a), P('an item worn by another hero stays in the bag grid'));
    await tap(page, 'bag-' + a, 25); await tap(page, 'wear', 30);
    A = await acc(page);
    check(A.equip[h1].weapon === a && !A.equip[h0].weapon, P(`wearing it on ${h1} moved it off ${h0} (${h1}: ${A.equip[h1].weapon}, ${h0}: ${A.equip[h0].weapon})`));

    // upgrade: exact cost, disabled at the cap and when short
    await tap(page, 'slot-weapon', 25);
    u = await eu(page);
    check(u.sheet && u.sheet.uid === a && u.sheet.wear === 'THÁO' && u.sheet.upgradeOk, P(`slot tile opens the worn item, button reads "${u.sheet && u.sheet.wear}"`));
    const g0 = (await acc(page)).gold, m0 = (await acc(page)).mats.weapon, cost = upgradeCost(1);
    await tap(page, 'upgrade', 20);
    A = await acc(page);
    check(A.bag.find((i) => i.uid === a).lv === 2 && g0 - A.gold === cost.gold && m0 - A.mats.weapon === cost.mats, P(`upgrade spent ${g0 - A.gold} gold (want ${cost.gold}) and ${m0 - A.mats.weapon} mats (want ${cost.mats}), level ${A.bag.find((i) => i.uid === a).lv}`));
    await tap(page, 'sheet-close', 20);
    await page.evaluate((id) => { const M = __G.meta; M.acc.gold = 0; M.save(); }, a); await refresh(page);
    await tap(page, 'slot-weapon', 25);
    let up = (await targets(page)).find((q) => q.id === 'upgrade');
    check(up && !up.enabled, P(`upgrade is disabled with 0 gold (enabled=${up && up.enabled}, line "${(await eu(page)).sheet.upgrade}")`));
    await tap(page, 'upgrade', 10);
    check((await acc(page)).bag.find((i) => i.uid === a).lv === 2, P('tapping the disabled upgrade changes nothing'));
    await snap(page, phone, 'sheet-short');
    await tap(page, 'sheet-close', 20);
    await page.evaluate((id) => { const M = __G.meta; M.acc.gold = 99999; M.acc.bag.find((i) => i.uid === id).lv = 10; M.save(); }, a); await refresh(page);
    await tap(page, 'slot-weapon', 25);
    up = (await targets(page)).find((q) => q.id === 'upgrade');
    check(up && !up.enabled && (await eu(page)).sheet.upgrade === 'Cấp tối đa', P(`upgrade is disabled at max level ${TIERS[0].maxLv} ("${(await eu(page)).sheet.upgrade}")`));
    await snap(page, phone, 'sheet-max'); await audit(page, P('sheet at max'));
    await tap(page, 'sheet-close', 20);

    // battle uses the bonus
    await page.evaluate(() => { const M = __G.meta; M.acc.equip[M.acc.team[0]] = { ...(M.acc.equip[M.acc.team[0]] || {}) }; });
    await page.evaluate(([hid, uid]) => { __G.meta.equip(hid, uid); }, [h0, a]);
    const st = await page.evaluate((hid) => __G.meta.heroStats(hid), h0);
    await page.evaluate(() => { __G.startBattle(1); }); await step(page, 30);
    const bt = await page.evaluate(() => ({ atk: __G.B.heroes[0].base.atk, kind: __G.B.heroes[0].kind }));
    const want = HERO[h0].atk * levelMul(A0.heroes[h0].level) + st.atkFlat;
    check(bt.kind === h0 && Math.abs(bt.atk - want) < 1e-6 && st.atkFlat > 0, P(`battle hero ${bt.kind} base atk ${bt.atk} equals HERO.atk x mul + flat = ${want} (flat ${st.atkFlat})`));
    await page.evaluate(() => __G.leaveBattle()); await step(page, 20);

    // ---------- merge, exact fodder
    const [m1, f1, f2, o1] = await setBag(page, [['w_cua', 0, 4], ['w_cua', 0, 1], ['w_cua', 0, 1], ['g_da', 0, 1]]);
    await tap(page, 'tab-equip', 25); await refresh(page);
    await tap(page, 'merge', 15);
    u = await eu(page);
    check(u.mode === 'merge' && u.main === 0, P(`GHÉP opens merge mode (${u.mode})`));
    await snap(page, phone, 'merge-start'); await audit(page, P('merge start'));
    await tap(page, 'bag-' + m1, 15); await tap(page, 'bag-' + o1, 15);
    u = await eu(page);
    check(u.main === m1 && u.picks.length === 0 && u.roles[o1] === 'dim', P(`main chosen, a different item is dimmed and not selectable (picks ${u.picks.length}, role ${u.roles[o1]})`));
    await tap(page, 'bag-' + f1, 15);
    u = await eu(page);
    check(u.preview.from === TIERS[0].name && u.preview.to === TIERS[1].name && u.need === 2, P(`preview labels "${u.preview.from}" -> "${u.preview.to}" (want ${TIERS[0].name} -> ${TIERS[1].name}), needs ${u.need} fodder, hint "${u.hint}"`));
    check(u.preview.before === String(itemStat({ item: 'w_cua', tier: 0, lv: 4 })) && u.preview.after === String(itemStat({ item: 'w_cua', tier: 1, lv: 4 })), P(`preview stat ${u.preview.before} -> ${u.preview.after}`));
    await snap(page, phone, 'merge-partial'); await audit(page, P('merge partial'));
    let btn = (await targets(page)).find((q) => q.id === 'merge-do');
    check(btn && !btn.enabled, P('merge-do disabled until enough fodder'));
    await tap(page, 'bag-' + f2, 15);
    await snap(page, phone, 'merge-ready'); await audit(page, P('merge ready'));
    const gb = (await acc(page)).gold;
    await tap(page, 'merge-do', 14); await snap(page, phone, 'merge-fx'); await step(page, 70);
    A = await acc(page);
    const mi = A.bag.find((i) => i.uid === m1);
    check(A.bag.length === 2 && mi && mi.tier === 1 && mi.item === 'w_cua' && mi.lv === 4 && !A.bag.some((i) => i.uid === f1 || i.uid === f2), P(`3 Thường merged into one ${TIERS[mi ? mi.tier : 0].name} ${mi && mi.item} at level ${mi && mi.lv} (bag ${A.bag.length})`));
    u = await eu(page);
    check(u.main === m1 && u.preview.from === TIERS[1].name && u.preview.to === TIERS[2].name, P(`preview moves on to "${u.preview.from}" -> "${u.preview.to}"`));
    await snap(page, phone, 'merge-after');
    await tap(page, 'merge-cancel', 15);

    // ---------- merge, free fodder (Sử Thi), equipped fodder, top tier
    const [s1, s2, s3, s4, top] = await setBag(page, [['w_cua', 3, 3], ['w_no', 3, 2], ['g_da', 3, 1], ['w_bua', 3, 5], ['b_dan', 10, 5]], { 0: { weapon: 3 } });
    await refresh(page);
    await tap(page, 'merge', 15);
    await tap(page, 'bag-' + top, 15);
    u = await eu(page);
    check(u.main === 0 && u.roles[top] === 'dim', P(`top tier item ${TIERS[10].name} cannot be a main piece`));
    await tap(page, 'bag-' + s1, 15); await tap(page, 'bag-' + s3, 15);
    u = await eu(page);
    check(u.picks.length === 0 && u.need === 1, P(`another slot is refused as Sử Thi fodder (picks ${u.picks.length}, needs ${u.need})`));
    await tap(page, 'bag-' + s4, 15);
    u = await eu(page);
    check(u.picks.length === 0 && u.roles[s4] === 'worn', P(`equipped fodder is refused (role ${u.roles[s4]}, picks ${u.picks.length})`));
    await snap(page, phone, 'merge-refused'); await audit(page, P('merge refused'));
    await tap(page, 'bag-' + s2, 15);
    u = await eu(page);
    check(u.picks.length === 1 && u.preview.from === TIERS[3].name && u.preview.to === TIERS[4].name, P(`same-slot Sử Thi accepted, preview "${u.preview.from}" -> "${u.preview.to}"`));
    await tap(page, 'merge-do', 14); await step(page, 70);
    A = await acc(page);
    check(A.bag.length === 4 && A.bag.find((i) => i.uid === s1).tier === 4 && !A.bag.some((i) => i.uid === s2), P(`Sử Thi + any same-slot Sử Thi gave ${TIERS[A.bag.find((i) => i.uid === s1).tier].name}`));
    await tap(page, 'merge-cancel', 15);

    // ---------- Ghép Nhanh
    await setBag(page, Array.from({ length: 9 }, () => ['w_cua', 0, 1]));
    await refresh(page);
    await tap(page, 'automerge', 20);
    u = await eu(page);
    check(u.auto && u.auto.merges === 4 && u.auto.rows.length === 1 && u.auto.rows[0].to === TIERS[2].name && u.auto.rows[0].from === TIERS[0].name, P(`GHÉP NHANH preview: ${u.auto && u.auto.merges} merges, result ${u.auto && u.auto.rows[0].from} -> ${u.auto && u.auto.rows[0].to}`));
    await snap(page, phone, 'automerge'); await audit(page, P('automerge preview'));
    await tap(page, 'auto-do', 20);
    A = await acc(page);
    check(A.bag.length === 1 && A.bag[0].tier === 2, P(`9 Thường left ${A.bag.length} item of tier ${A.bag[0] && A.bag[0].tier} (${A.bag[0] && TIERS[A.bag[0].tier].name})`));

    // MẶC TỐT NHẤT: strongest free item per slot, never one another hero wears
    {
      const [bw, bw2, ba] = await setBag(page, [['w_bua', 1, 1], ['w_cua', 0, 1], ['a_lop', 0, 1]], { 1: { weapon: 0 } });
      await page.evaluate(() => __G.goto('equip')); await refresh(page);
      await tap(page, 'hero-prev', 20); await tap(page, 'hero-prev', 20);
      let u2 = await eu(page);
      const hb = u2.hero;
      const btn0 = (await targets(page)).find((q) => q.id === 'equip-best');
      check(!!btn0 && btn0.enabled && u2.best.enabled, P(`MẶC TỐT NHẤT is enabled for ${hb} when it would change something (${JSON.stringify(u2.best)})`));
      await tap(page, 'equip-best', 25);
      const A2 = await acc(page); u2 = await eu(page);
      check(A2.equip[hb].weapon === bw2 && A2.equip[hb].armor === ba && A2.equip[A2.team[1]].weapon === bw, P(`MẶC TỐT NHẤT wore the free weapon and the armour and left the weapon another hero wears (${JSON.stringify(A2.equip[hb])})`));
      const btn1 = (await targets(page)).find((q) => q.id === 'equip-best');
      check(btn1 && !btn1.enabled, P('MẶC TỐT NHẤT is disabled when nothing would change'));
      await snap(page, phone, 'equip-best');
      await tap(page, 'stat-panel', 10);
      check((await eu(page)).toasts.slice(-1)[0] === 'Công và Máu của tướng, đã cộng trang bị', P('tapping the stat panel explains it in one line'));
    }

    // ---------- save across reload
    await setBag(page, [['w_cua', 1, 3], ['a_lop', 0, 2], ['f_chay', 2, 7]], { 0: { weapon: 0, boots: 2 } });
    await page.evaluate(() => { __G.meta.acc.mats.armor = 7; __G.meta.save(); });
    const keep = await acc(page);
    await page.reload(); await page.waitForFunction('window.__ready === true', null, { timeout: 90000 }); await step(page, 20);
    const back = await acc(page);
    const worn = (e) => JSON.stringify(Object.entries(e).map(([h, sl]) => [h, Object.entries(sl).filter(([, v]) => v).sort()]).filter(([, l]) => l.length).sort());
    check(JSON.stringify([back.bag, worn(back.equip), back.mats]) === JSON.stringify([keep.bag, worn(keep.equip), keep.mats]), P(`bag (${back.bag.length}), equip and mats survive a reload`));
    await tap(page, 'tab-equip', 25);
    check((await eu(page)).bag === 3 || (await eu(page)).hero !== '', P('equipment screen opens again after the reload'));
    await snap(page, phone, 'reload');
    check(problems.length === 0, P('no console errors') + (problems[0] ? ' ' + problems[0] : ''));
    await g.ctx.close();
  }
  const s22 = shots.filter((f) => f.includes('s22-')), xi = shots.filter((f) => f.includes('xiaomi-'));
  sheet(s22, path.join(OUT, 'review-s22.png'), 6, 300); sheet(xi, path.join(OUT, 'review-xiaomi.png'), 6, 300);
} catch (e) {
  console.log('FAIL test crashed: ' + (e && e.stack ? e.stack : e)); process.exitCode = 1;
} finally { await br.close(); srv.close(); }
done();
