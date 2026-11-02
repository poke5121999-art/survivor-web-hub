#!/usr/bin/env node
/* Meo & Sup feature "guests" in node: special guests (Guest.json, UI_CollectGuest), guest vehicles, frog prince / snail NPCs,
 * golden butterfly, hidden theme-14 quiz (ThemeHiddenNpc.json), deco blocks (Work type 21), wishlist. Literal values come from
 * Guest.json, Work.json, Init.json, ThemeHiddenNpc.json and the prefab values read by tools/export_guests.py
 * (rules: D:/catsoup-ref/rules/guests.md).
 *   node test/cats-soup-guests.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const G = path.join(__dirname, '..', 'games', 'cats-soup');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };
const close = (a, b) => Math.abs(a - b) < 1e-9;

(async () => {
  const { makeGame } = await import(pathToFileURL(path.join(G, 'js/sim/boot.js')).href);
  const B = await import(pathToFileURL(path.join(G, 'js/sim/big.js')).href);
  const U = (await import(pathToFileURL(path.join(G, 'js/sim/features/guests.js')).href)).default;
  const json = async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8'));
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const mk = async (r = rng) => { const g = await makeGame(json, r); g.fresh(); return g; };
  const num = b => B.toNumber(b);
  const threeCats = g => { while (g.state.cats.length < 3) g.addCat(g.state.works[0]); };

  // ---- tables ----
  let g = await mk();
  check('Guest.json has 15 rows; row 1 sled needs equips 18,113,204,20,122,220 at level 1', U.guestList(g).length === 15 && U.guestRow(g, 1).resName === 'sled' && U.needEquips(g, 1).join() === '18,113,204,20,122,220' && U.guestRow(g, 1).targetLevel === 1);
  check('only rows 1 and 2 are collected with equipment (collectType 5); the 13 event guests have none', U.guestList(g).filter(r => r.collectType === 5).length === 2 && U.needEquips(g, 2).join() === '2,3,4,5,6,7' && U.needEquips(g, 3).length === 0);
  check('Init 61 GuestMaxCount = 10, Init 11 Income_Frog = 3600, Init 31 Income_Snail = 10', U.maxOn(g) === 10 && g.t.Init.find(r => r.index === 11).value === 3600 && g.t.Init.find(r => r.index === 31).value === 10);
  check('15 deco blocks 3001-3015 (Work type 21), maxStorage 30 each', U.blockList(g).length === 15 && U.blockList(g)[0].index === 3001 && U.blockList(g)[14].index === 3015 && U.blockList(g).every(b => b.maxStorage === 30));
  check('ThemeHiddenNpc has 20 questions: 15 normal (30 / 15) and 5 rare (60 / 30)', U.hiddenQuestions(g, false).length === 15 && U.hiddenQuestions(g, true).length === 5 && U.quizRow(g, 0).correct_rewardValue === 30 && U.quizRow(g, 15).correct_rewardValue === 60 && U.quizRow(g, 15).wrong_rewardValue === 30);
  check('prefab values: frog and snail live 60 s, the manager refreshes every 10 s, agents need 3 cats', g.data.guests.npc.frog.m_NPCLifeTime === 60 && g.data.guests.npc.snail.m_NPCLifeTime === 60 && g.data.guests.npc.manager.m_RefreshSecTime === 10 && g.data.guests.npc.agentMinCats === 3);

  // ---- special guests ----
  check('fresh game: no guest, no discount', U.ownedCount(g) === 0 && U.discount(g) === 0 && U.onCount(g) === 0);
  check('guest 1 cannot be collected without the six equips (6 missing)', !U.canCollect(g, 1) && U.missing(g, 1).length === 6 && U.collect(g, 1) === false);
  for (const e of [18, 113, 204, 20, 122]) g.feat.equip.grant(g, e);
  check('five of six equips: still 1 missing', U.missing(g, 1).join() === '220' && !U.canCollect(g, 1));
  g.feat.equip.grant(g, 220);
  g.events.length = 0;
  check('all six equips: guest 1 is collected, on, event guestGet', U.canCollect(g, 1) && U.collect(g, 1) && U.isOn(g, 1) && g.events.some(e => e.type === 'guestGet' && e.idx === 1));
  check('collecting the same guest twice does nothing', U.collect(g, 1) === false && U.ownedCount(g) === 1);
  check('one guest: discount 3 % of the upgrade cost; factor 0.97', close(U.discount(g), 0.03) && close(U.upgradeFactor(g), 0.97) && close(g.mult('upgrade'), 0.97));
  check('turning a guest off keeps it owned and keeps the discount (GuestDiscount counts every entry)', U.onOff(g, 1) === -1 && !U.isOn(g, 1) && U.isPossess(g, 1) && close(U.discount(g), 0.03));
  check('turning it on again', U.onOff(g, 1) === 1 && U.isOn(g, 1));
  check('a guest that is not owned cannot be switched', U.onOff(g, 9) === 0);
  for (let i = 3; i <= 12; i++) U.addGuest(g, i);
  check('11 owned guests (1 and 3..12): discount capped at 15 %', U.ownedCount(g) === 11 && close(U.discount(g), 0.15) && U.onCount(g) === 11);
  check('turning one off then on again is refused while 10 or more are on (popup_guest_max_message01)', U.onOff(g, 3) === -3 && U.onCount(g) === 10 && U.onOff(g, 3) === 0 && U.onCount(g) === 10);
  U.onOff(g, 4);
  check('with 9 on a guest can be turned on again', U.onCount(g) === 9 && U.onOff(g, 3) === 3 && U.onCount(g) === 10);

  // ---- guest vehicles ----
  g = await mk(() => 0.5);
  U.addGuest(g, 1);
  const v = U.checkGuest(g);
  check('Spawn.CheckGuest: the one ON guest starts a run, variant 1 for rng 0.5, event guestVisit', v && v.idx === 1 && v.v === 1 && g.events.some(e => e.type === 'guestVisit'));
  check('start positions: variant 0 at (15, -6) moving -x, variant 1 at (6, -15) moving +z', U.visitPos({ v: 0, t: 0 }).join() === '15,-6' && U.visitPos({ v: 1, t: 0 }).join() === '6,-15' && U.visitPos({ v: 0, t: 2 }).join() === '5,-6' && U.visitPos({ v: 1, t: 3 }).join() === '6,0');
  check('the same guest is not started twice while it is on the map', U.checkGuest(g) === null && g.state.guests.visits.length === 1);
  g.tick(14.9);
  check('a run lasts 15 s', g.state.guests.visits.length === 1);
  g.tick(0.2);
  check('after 15 s the guest is gone', g.state.guests.visits.length === 0);
  U.onOff(g, 1);
  check('an OFF guest never comes', U.checkGuest(g) === null);

  // ---- day clock drives weather and visits ----
  g = await mk(() => 0.1);
  U.addGuest(g, 1);
  g.tick(59);
  check('no guest check before the first day step (60 s)', g.state.guests.visits.length === 0);
  g.tick(1.5);
  check('the day step rolls the weather (0.1 < 1/3: rain) and starts a visit', U.rainy(g) && g.state.guests.visits.length === 1);

  // ---- frog prince and snail ----
  g = await mk(() => 0.9);
  U.setRain(g, true);
  U.npcStep(g);
  check('fewer than 3 cats: no NPC even in the rain', U.activeNpc(g) === 'none');
  threeCats(g);
  U.npcStep(g);
  check('rain and 3 cats: the frog prince appears', U.activeNpc(g) === 'frog' && g.state.guests.frog.t === 0);
  g.state.gold = { f: 9, e: 9 };
  const rest = g.build(g.t.Work.find(w => w.type === 3).index);
  const avg = num(g.feat.cats.averageEnergy(g));
  const full = num(U.frogEnergy(g));
  check('frog energy = avg energy income x 3600', rest && avg > 0 && Math.abs(full / (avg * 3600) - 1) < 1e-9, `${avg} -> ${full}`);
  g.state.energy = B.ZERO;
  g.events.length = 0;
  const free = U.claimFrog(g, false);
  check('free button pays 1/20 of it, the visit ends, event frogGift', Math.abs(num(free) / (full / 20) - 1) < 1e-9 && Math.abs(num(g.state.energy) / (full / 20) - 1) < 1e-9 && U.activeNpc(g) === 'none' && g.events.some(e => e.type === 'frogGift' && e.ads === false));
  U.npcStep(g);
  g.state.energy = B.ZERO;
  U.claimFrog(g, true);
  check('ad button pays the whole amount', Math.abs(num(g.state.energy) / full - 1) < 1e-9);
  U.npcStep(g);
  g.tick(5);
  check('the frog stays while its 60 s last', U.activeNpc(g) === 'frog');
  g.state.guests.frog.t = 60;
  U.npcStep(g);
  check('expired frog: gone, nothing paid', U.activeNpc(g) === 'none');
  U.setRain(g, false);
  g.state.clock = 100;
  g.state.guests.snail.gone = 0;
  check('no rain: the snail comes once its 60 s wait is over', U.snailWait(g) === 0 && (U.npcStep(g), U.activeNpc(g) === 'snail'));
  const gold0 = g.state.gold;
  const sg = U.claimSnail(g);
  check('snail ad pays avg gold income x 10 s; the next one waits 120 s', num(sg) > 0 && Math.abs(num(sg) / (num(g.averageIncome()) * 10) - 1) < 1e-9 && U.activeNpc(g) === 'none' && U.snailWait(g) === 120 && B.gte(g.state.gold, B.add(gold0, sg)));
  g.state.clock += 119;
  check('119 s later the snail still waits 1 s', Math.abs(U.snailWait(g) - 1) < 1e-9);
  U.setRain(g, true);
  g.state.guests.snail.on = true;
  U.npcStep(g);
  check('rain sends a snail away and brings the frog', U.activeNpc(g) === 'frog');

  // ---- butterfly ----
  g = await mk();
  threeCats(g);
  check('butterfly not ready at the start', !U.butterflyReady(g) && U.butterflies(g) === 0);
  g.tick(299);
  check('not ready after 299 s', !U.butterflyReady(g));
  g.tick(2);
  check('ready after 300 s (Work 401 completeTime)', U.butterflyReady(g));
  g.events.length = 0;
  check('tap pays 10 butterflies, reward type 98, event butterfly', U.claimButterfly(g, false) === 10 && U.butterflies(g) === 10 && g.events.some(e => e.type === 'butterfly' && e.points === 10));
  check('then it is not ready again', !U.butterflyReady(g) && U.claimButterfly(g) === 0);
  g.tick(301);
  check('ad button doubles it (10 << 1)', U.claimButterfly(g, true) === 20 && U.butterflies(g) === 30);
  check('reward(98, 5) adds butterflies', (g.reward(98, 5), U.butterflies(g) === 35));

  // ---- hidden theme guest ----
  g = await mk(() => 0.5);
  threeCats(g);
  g.state.theme.theme = 14;
  g.tick(599);
  check('theme 14: no hidden guest before 600 s', !g.state.guests.hidden.on);
  g.tick(2);
  const h = g.state.guests.hidden;
  check('hidden guest after 600 s: rng 0.5 gives a normal question', h.on && !h.rare && U.quizRow(g, h.quiz).question_type === 'normal');
  check('three answers, the right one among them', U.quizAnswers(g, h.quiz).length === 3 && U.quizAnswers(g, h.quiz).includes(U.quizRow(g, h.quiz).question_correct));
  const m0 = g.feat.theme.moneyOf(g, 1);
  const ans = U.answerHidden(g, U.quizRow(g, h.quiz).question_correct);
  check('right answer: +30 special money (8001), guest leaves', ans.correct && ans.value === 30 && (g.feat.theme.moneyOf(g, 1)) === m0 + 30 && !h.on);
  g.tick(601);
  U.answerHidden(g, 'x');
  check('wrong answer: +15', (g.feat.theme.moneyOf(g, 1)) === m0 + 45);
  g.state.guests.hidden.on = false;
  g.state.guests.hidden.last = g.state.clock;
  g.tick(300);
  check('after leaving it waits 600 s again', !g.state.guests.hidden.on);
  g.state.theme.theme = 0;
  g.tick(1000);
  check('other themes: no hidden guest', !g.state.guests.hidden.on);
  const lo = await mk(() => 0.1);
  U.hiddenStart(lo);
  check('rng 0.1 (< 25 %) picks a rare question worth 60 / 30', lo.state.guests.hidden.rare && U.quizRow(lo, lo.state.guests.hidden.quiz).correct_rewardValue === 60);

  // ---- deco blocks ----
  g = await mk();
  check('shop lists the 12 always-sold blocks (blockShopType 0), the 3 limited ones (3010-3012) stay out', U.shopList(g).length === 12 && !U.shopList(g).some(b => [3010, 3011, 3012].includes(b.index)));
  check('3004 mossy rock costs 200 coins; 3009 lantern rock 200 gems; 3001 is free', U.decoCost(g, 3004) === 200 && U.decoCurrency(g, 3004) === 4 && U.decoCost(g, 3009) === 200 && U.decoCurrency(g, 3009) === 3 && U.decoCost(g, 3001) === 0);
  check('limited blocks (cost 99999 coins) cannot be bought', !U.canBuyBlock(g, 3010) && !U.buyBlock(g, 3010));
  const coin0 = g.state.coin, gem0 = g.state.gem;
  check('buy 3004: -200 coins, 1 in stock, spare 1', U.buyBlock(g, 3004) && g.state.coin === coin0 - 200 && U.blockCount(g, 3004) === 1 && U.spareBlocks(g, 3004) === 1);
  check('buy 3009: -200 gems (start 200 gems)', U.buyBlock(g, 3009) && g.state.gem === gem0 - 200 && !U.canBuyBlock(g, 3009));
  const owned0 = g.ownedCount();
  const cell = g.emptyCells()[0];
  const w = U.placeBlock(g, 3004, cell);
  check('place 3004 on an empty cell: work of type 21, spare 0, forest expansion count unchanged', w && w.a === 3004 && g.work.get(3004).type === 21 && U.spareBlocks(g, 3004) === 0 && U.placedBlocks(g, 3004) === 1 && g.ownedCount() === owned0);
  check('no second copy without stock; no placing on an occupied cell', U.placeBlock(g, 3004, g.emptyCells()[0]) === null && (U.addBlock(g, 3004, 1), U.placeBlock(g, 3004, cell)) === null);
  check('picking it up (core keepWork) leaves the field and joins the forest storage', U.pickBlock(g, w) && U.placedBlocks(g, 3004) === 0 && U.storedBlocks(g, 3004) === 1 && g.state.storage.includes(w));
  g.state.coin = 1e6;
  U.addBlock(g, 3005, 29);
  check('stock is capped at maxStorage 30: 29 + 1 ok, the 31st is refused', U.buyBlock(g, 3005) && U.blockCount(g, 3005) === 30 && U.isLimit(g, 3005) && !U.canBuyBlock(g, 3005) && U.addBlock(g, 3005, 5) === 0);
  check('reward type 89 gives a block of that index, an unknown index nothing', (g.reward(89, 3006), U.blockCount(g, 3006) === 1) && (g.reward(89, 9999), U.blockCount(g, 9999) === 0) && U.isBlock(3001) && !U.isBlock(3000) && !U.isBlock(4000));
  check('a deco block never opens forest expansion (type 21 is skipped in ownedCount)', g.ownedCount() === owned0);

  // ---- wishlist ----
  g = await mk();
  check('wishlist: add equip 5, duplicate refused, unknown refused', U.addWish(g, 'equip', 5) && !U.addWish(g, 'equip', 5) && !U.addWish(g, 'equip', 999999) && U.wishList(g).length === 1);
  check('delete', U.delWish(g, 'equip', 5) && U.wishList(g).length === 0 && !U.delWish(g, 'equip', 5));
  U.addWish(g, 'equip', 5);
  U.addWish(g, 'furniture', 9);
  g.feat.equip.grant(g, 5);
  const gone = U.checkWish(g);
  check('owning a wished item removes it (CheckWishlistAll)', gone.length === 1 && gone[0][1] === 5 && U.wishList(g).length === 1 && U.wished(g, 'furniture', 9));
  let n = 0;
  for (const e of g.t.Equip) { if (n >= 99) break; if (U.addWish(g, 'equip', e.index)) n++; }
  check('at most 99 equipment wishes', g.state.guests.wish.filter(x => x[0] === 'equip').length === 99 && !U.addWish(g, 'equip', g.t.Equip[g.t.Equip.length - 1].index));
  check('WishList.json has 160 event rows, InstantEvent 3 (all ended in 2021-2022)', g.data.guests.wishlist.length === 160 && g.data.guests.instant.length === 3 && g.data.guests.instant.every(r => r.endDay <= 20220630));

  // ---- save round trip ----
  g = await mk();
  U.addGuest(g, 2); U.addBlock(g, 3001, 4); U.addWish(g, 'equip', 7);
  const saved = JSON.parse(JSON.stringify(g.save()));
  const g2 = await mk();
  g2.load(saved);
  check('save / load keeps guests, blocks and wishes', U.isOn(g2, 2) && U.blockCount(g2, 3001) === 4 && U.wished(g2, 'equip', 7));
  const old = JSON.parse(JSON.stringify(g.save()));
  delete old.guests;
  const g3 = await mk();
  g3.load(old);
  check('an old save without the slice gets a fresh one', U.ownedCount(g3) === 0 && g3.state.guests.blocks && Array.isArray(g3.state.guests.wish));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
