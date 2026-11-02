#!/usr/bin/env node
/* Meo & Sup feature "cats" (hearts, skills, gifts, swapping) in node. Literal values come from UnitHeart.json, Ability.json,
 * LFactor.json and CatGift.json (rules: D:/catsoup-ref/rules/cats-full.md).
 *   node test/cats-soup-cats.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const G = path.join(__dirname, '..', 'games', 'cats-soup');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

(async () => {
  const { makeGame } = await import(pathToFileURL(path.join(G, 'js/sim/boot.js')).href);
  const B = await import(pathToFileURL(path.join(G, 'js/sim/big.js')).href);
  const C = await import(pathToFileURL(path.join(G, 'js/sim/features/cats.js')).href);
  const F = C.default;
  let seed = 11;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mk = async () => { const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng); g.fresh(); return g; };
  const g = await mk();

  // hearts: thresholds 10,30,80,180,380,880,1880,3880,8880 (UnitHeart exp 0,10,20,50,100,200,500,1000,2000,5000)
  const lv = e => F.heartInfo(g, e).level;
  check('heart level at exp 0/9/10/29/30', [0, 9, 10, 29, 30].map(lv).join() === '1,1,2,2,3', [0, 9, 10, 29, 30].map(lv).join());
  check('heart level at 8879/8880/99999 (max 10)', [8879, 8880, 99999].map(lv).join() === '9,10,10');
  const i = F.heartInfo(g, 35);
  check('exp 35 = level 3, 5 into 50 needed, 45 to go', i.level === 3 && i.into === 5 && i.need === 50 && i.toNext === 45, JSON.stringify(i));

  // adding hearts moves cat.heart (core reads HEART_MATERIAL[cat.heart]) and emits heartLevel
  const cat = g.state.cats[0];
  const base = B.toNumber(g.stars(0));
  g.events.length = 0;
  F.addHeart(g, cat, 10);
  check('10 heart exp -> level 2, cat.heart 1', cat.heart === 1 && F.heartLevel(g, cat) === 2);
  check('heartLevel event emitted', g.events.some(e => e.type === 'heartLevel' && e.level === 2));
  check('level 2 bonuses materialUp 10 priceUp 5 criticalUp 2 tokenUp 1', ['materialUp', 'priceUp', 'criticalUp', 'tokenUp'].map(k => F.heartBonus(g, cat, k)).join() === '10,5,2,1');
  g.emit('fishHeart', { cat, value: 20 });
  check('fishHeart event adds exp (30 -> level 3, materialUp 30)', F.heartLevel(g, cat) === 3 && F.heartBonus(g, cat, 'materialUp') === 30);
  g.emit('fishHeart', { cat: cat.id, value: 8850 });
  check('cat id accepted; 8880 -> level 10: materialUp 1000 priceUp 200', F.heartLevel(g, cat) === 10 && F.heartBonus(g, cat, 'materialUp') === 1000 && F.heartBonus(g, cat, 'priceUp') === 200);
  const top = B.toNumber(g.stars(0));
  check('core economy reads the heart level (soup stars x11 at level 10)', Math.abs(top / base - 11) < 1e-6, `${(top / base).toFixed(4)}`);

  // skills: first cat has carrot level 2; Ability value = initValue x LFactor
  const m = F.mainSkill(g, cat);
  check('first cat main skill = carrot (Ability 1001, subIndex 1) level 2', m.ability.index === 1001 && m.ability.subIndex === 1 && m.lv === 2);
  check('ability value lv1..5 = 50,100,150,200,300', [1, 2, 3, 4, 5].map(l => F.abilityValue(g, m.ability, l)).join() === '50,100,150,200,300');
  check('ability value lv0 clamps to lv1 (50)', F.abilityValue(g, m.ability, 0) === 50);
  check('skill level thresholds 400->1 401->2 700->2 701->3 900->3 901->4 980->4 981->5',
    [400, 401, 700, 701, 900, 901, 980, 981].map(C.rollSkillLevel).join() === '1,2,2,3,3,4,4,5');
  const soup = g.state.works[0];
  check('skill off at the soup pot: factor 1; at a carrot station lv2: 2.0', F.skillFactor(g, cat, soup) === 1 && F.skillFactor(g, cat, { a: 1 }) === 2);

  // distribution of rolled skills over many cats
  const g2 = await mk();
  const N = 4000, lvCount = [0, 0, 0, 0, 0, 0];
  let subs = 0, mainBad = 0;
  for (let k = 0; k < N; k++) {
    const c = { id: 100000 + k, type: 0, work: 1, heart: 0 };
    g2.state.cats.push(c);
    g2.emit('cat', { cat: c });
    const s = F.mainSkill(g2, c);
    lvCount[s.lv]++;
    if (s.ability.type !== 101 || s.ability.eventType !== 0) mainBad++;
    if (F.subSkill(g2, c)) subs++;
  }
  const pct = lvCount.slice(1).map(x => Math.round(x / N * 100));
  check('main skill levels ~ 40/30/20/8/2 %', Math.abs(pct[0] - 40) <= 3 && Math.abs(pct[1] - 30) <= 3 && Math.abs(pct[2] - 20) <= 3 && Math.abs(pct[3] - 8) <= 2 && Math.abs(pct[4] - 2) <= 1, pct.join('/'));
  check('main skills are all type 101', mainBad === 0);
  check('sub skill on ~20 % of cats', Math.abs(subs / N - 0.2) < 0.03, `${(subs / N * 100).toFixed(1)}%`);
  const withSub = g2.state.cats.find(c => F.subSkill(g2, c));
  check('sub skill is a type 102 ability worth initValue 10 x 1', F.subSkill(g2, withSub).ability.type === 102 && F.subSkill(g2, withSub).value === 10);
  check('subSkillPercent sums over cats', F.subSkillPercent(g2, F.subSkill(g2, withSub).ability.index) >= 10);

  // building a facility adds a cat that gets skills; swapping and best fit
  const g3 = await mk();
  for (let k = 0; k < 60 && g3.state.cats.length < 6; k++) {
    g3.state.gold = { f: 9, e: 9000 };
    const o = g3.buildList().find(o => o.n < o.max && !o.w.costGem && g3.canBuild(o.w.index));
    if (o) g3.build(o.w.index); else g3.expand();
  }
  check('every cat has an ext record', g3.state.cats.length >= 3 && g3.state.cats.every(c => g3.state.cats_ext.byId[c.id]), `${g3.state.cats.length} cats`);
  const [a, b] = g3.state.cats;
  const wa = a.work, wb = b.work;
  check('swap exchanges facilities', F.swap(g3, a, b) && a.work === wb && b.work === wa);
  check('swap keeps one cat per facility', new Set(g3.state.cats.map(c => c.work)).size === g3.state.cats.length);
  // force a mismatch that best fit can fix: cat b's skill names cat a's current facility
  const wA = g3.state.works.find(w => w.id === a.work);
  const ab = g3.t.Ability.find(x => x.type === 101 && x.subIndex === wA.a);
  g3.state.cats_ext.byId[b.id].main = { a: ab.index, lv: 3 };
  g3.state.cats_ext.byId[a.id].main = { a: g3.t.Ability.find(x => x.type === 101 && x.subIndex !== wA.a && x.index !== ab.index).index, lv: 1 };
  const n = F.bestFit(g3);
  check('bestFit puts the skilled cat at its facility', n >= 1 && F.skillMatch(g3, b), `${n} swaps`);
  check('still one cat per facility after bestFit', new Set(g3.state.cats.map(c => c.work)).size === g3.state.cats.length);

  // gifts: CatGift rows with probability>0, unlimited, no season = 16 rows; 3 boxes; one free pick, ad opens the rest
  const rows = F.giftRows(g);
  check('gift pool: 16 rows, total weight 3440', rows.length === 16 && rows.reduce((s, r) => s + r.probability, 0) === 3440, `${rows.length} rows, ${rows.reduce((s, r) => s + r.probability, 0)}`);
  const t0 = !F.giftReady(g);
  g.tick(0.1);
  g.state.cats_ext.gift.t = 599;
  g.tick(0.5);
  const t1 = !F.giftReady(g);
  g.tick(1);
  check('gift not ready at start, ready after 600 s', t0 && t1 && F.giftReady(g));
  const boxes = F.openGift(g);
  check('three boxes rolled from the pool', boxes.length === 3 && boxes.every(x => rows.some(r => r.index === x.row)));
  check('ad claim before a pick opens nothing', F.claimRest(g).length === 0);
  const gem0 = g.state.gem, coin0 = g.state.coin, gold0 = g.state.gold;
  boxes[0].row = 0;   // gem x5
  boxes[1].row = 3;   // gold: avgGold x 30 s
  boxes[2].row = 9;   // coin x5
  const r0 = F.pickBox(g, 0);
  check('box 0 (gem 5) pays 5 gems', r0 && r0.type === 3 && g.state.gem === gem0 + 5);
  check('a second free pick is refused', F.pickBox(g, 1) === null);
  const expect = B.toNumber(g.averageIncome()) * 30;
  const outs = F.claimRest(g);
  check('ad claim opens the other two (5 coins + gold)', outs.length === 2 && g.state.coin === coin0 + 5 && B.cmp(g.state.gold, gold0) > 0);
  const got = B.toNumber(B.sub(g.state.gold, gold0));
  check('gold gift = averageIncome x 30 s', Math.abs(got - expect) / expect < 1e-6, `${got.toFixed(1)} vs ${expect.toFixed(1)}`);
  F.closeGift(g);
  check('closing ends the gift and restarts the wait', !F.giftReady(g));
  const pud = g.t.CatGift.find(r => r.rewardType === 24);
  const out = F.payGift(g, pud);
  check('macaron (type 24) with no granting feature waits in the stash', out.stashed === true && g.state.cats_ext.stash[24] === 1);

  // save round trip keeps hearts and skills
  const saved = JSON.parse(JSON.stringify(g.save()));
  const g4 = await mk();
  g4.load(saved);
  check('save round-trips hearts and skills', F.heartLevel(g4, g4.state.cats[0]) === 10 && F.mainSkill(g4, g4.state.cats[0]).lv === 2 && g4.state.cats[0].heart === 9);
  const old = JSON.parse(JSON.stringify(g.save()));
  delete old.cats_ext;
  old.cats[0].heart = 4;
  const g5 = await mk();
  g5.load(old);
  check('old save: init creates ext records; heart level 5 -> exp 180', g5.state.cats_ext.byId[old.cats[0].id].exp === 180 && F.heartLevel(g5, g5.state.cats[0]) === 5);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
