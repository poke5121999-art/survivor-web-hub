#!/usr/bin/env node
/* Meo & Sup feature "kitty" (kittens, kitty houses, dance stage, trips, album, magnets) in node. Literal values come from
 * TravelItem.json, TravelDestination.json, CatUnlock.json, KittyAbility.json, Magnet.json, UnitHeart.json, Init.json
 * (rules: D:/catsoup-ref/rules/kitty.md).
 *   node test/cats-soup-kitty.js */
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
  const K = await import(pathToFileURL(path.join(G, 'js/sim/features/kitty.js')).href);
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mk = async () => { const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng); g.fresh(); return g; };
  const g = await mk();
  const F = g.feat.kitty;
  const D = g.data.kitty;

  // ---- tables ----
  check('16 kitty bodies, first-kitty rows 48 79 80', D.types.length === 16 && D.types.filter(t => t.first).map(t => t.index).join() === '48,79,80');
  check('50 regular destinations: 14 / 12 / 12 / 6 / 6 per region', [0, 1, 2, 3, 4].map(r => D.dests.filter(d => d.region === r).length).join() === '14,12,12,6,6' && D.dests.length === 50);
  check('12 travel items; bus 10 butterflies, train 50, plane 250, food 100, essentials 200', D.items.length === 12 && [9, 10, 11, 1, 4].map(i => F.item(g, i).price).join() === '10,50,250,100,200');
  check('CatUnlock gems 0/400/500/600 for work 406', D.unlock.map(u => u.gem).join() === '0,400,500,600' && D.unlock.every(u => u.work === 406));
  check('KittyAbility: token 402, butterfly 403, magnet 404', [1, 2, 3].map(t => F.ability(g, t).work).join() === '402,403,404');
  check('balance 20 / 1 / 33 / 3 / 7', Object.values(D.balance).join() === '20,1,33,3,7');
  check('travel item reward type = 3001 + index (collection holds 3002-3013)', F.itemType(1) === 3002 && F.itemType(12) === 3013);

  // ---- houses and kitties ----
  const s = g.state.kitty;
  check('fresh game: no houses, no kitties', s.houses.length === 0 && s.kitties.length === 0 && F.nextHouse(g) === 402);
  check('house 403 needs 402 first', !F.canBuildHouse(g, 403) && F.buildHouse(g, 403) === null);
  const k1 = F.buildHouse(g, 402);
  check('house 402 is free and brings the first kitty of body 48, 79 or 80', k1 && [48, 79, 80].includes(k1.type) && k1.house === 402 && s.houses.join() === '402');
  check('after 402 the next house is 403; 402 cannot be built twice', F.nextHouse(g) === 403 && F.buildHouse(g, 402) === null);
  const k2 = F.buildHouse(g, 403), k3 = F.buildHouse(g, 404);
  check('three houses, three kitties, all kitty bodies', s.kitties.length === 3 && s.kitties.every(k => D.types.some(t => t.index === k.type)) && F.nextHouse(g) === null);
  check('random bodies come from the 12 main-game rows (no season rows 87 95 96 104)', (() => {
    const seen = new Set();
    for (let i = 0; i < 400; i++) seen.add(F.randomType(g));
    return seen.size === 12 && ![87, 95, 96, 104].some(t => seen.has(t));
  })());

  // ---- dance stage ----
  check('dance stage needs work 22 and 1e25 gold', !F.canBuildStage(g));
  g.state.gold = B.big(1, 25);
  check('work 22 missing blocks the stage even with the gold', !F.stageNeedsBuilt(g) === (g.copies(22) === 0));
  const firstRest = g.buildList().find(o => o.w.index === 22);
  g.state.gold = B.big(9, 40);
  while (g.copies(22) < 1 && g.canBuild(22)) g.build(22);
  if (g.copies(22) < 1) { g.place(22, g.autoCell(), 0); }
  g.state.gold = B.big(1, 25);
  check('with work 22 and exactly 1e25 gold the stage can be built', F.canBuildStage(g), `copies22=${g.copies(22)}`);
  const ks = F.buildStage(g);
  check('building the stage takes 1e25 gold and gives a free first kitty', ks && ks.house === 406 && B.toNumber(g.state.gold) === 0 && s.stage);
  check('next slots cost 400 / 500 / 600 gems then none', (() => {
    g.state.gem = 5000;
    const costs = [];
    for (let i = 0; i < 4; i++) { costs.push(F.slotCost(g)); if (F.slotCost(g) != null) F.addStageKitty(g); }
    return costs.join() === '400,500,600,' && F.stageKitties(g).length === 4 && g.state.gem === 5000 - 1500;
  })());
  check('a fifth stage kitty is refused', F.addStageKitty(g) === null && F.stageKitties(g).length === 4);

  // ---- hearts and abilities ----
  const souv = F.inHouse(g, 402);
  check('at heart level 1 the token bonus is 0 and a trip pays 20 tokens base', F.bonus(g, 1) === 0 && F.tokensFor(g) === 20);
  F.addHeart(g, souv, 10);
  check('level 2 (exp 10): tokenUp 1 -> 21 tokens', F.heart(g, souv).level === 2 && F.bonus(g, 1) === 1 && F.tokensFor(g) === 21);
  F.addHeart(g, souv, 8870 + 5000);
  check('level 10: tokenUp 10 -> 30 tokens', F.heart(g, souv).level === 10 && F.tokensFor(g) === 30);
  const mk4 = F.inHouse(g, 404);
  check('no-magnet chance 33 % - magnetUp: 33 at level 1, 23 at level 10', F.noMagnetPercent(g) === 33 && (F.addHeart(g, mk4, 13870), F.noMagnetPercent(g) === 23));
  check('butterfly bonus of house 403 at level 1 is 0', F.butterflyBonus(g) === 0);
  g.events.length = 0;
  g.state.fishing.inv[101] = { n: 1, a: 0 };
  const fv = g.fishTable.get(101).heartValue;
  const before = F.kitty(g, k2.id).exp;
  check('feeding a fish adds its heartValue to the kitty and eats the fish', F.feed(g, k2.id, 101) === fv && F.kitty(g, k2.id).exp === before + fv && !g.state.fishing.inv[101], `heartValue ${fv}`);
  // golden butterfly bonus: the guests feature pays 10 + kitty.butterflyBonus(g) (DataManager AddButterflyPoint), x2 by ad; the
  // collection holds the butterflies (reward 98) and the magnets are items too (itemCount of type 3500 * 1000 + index)
  { const kk = F.kitty(g, k2.id), exp0 = kk.exp; kk.exp = 1e6;
    const b0 = g.itemCount(98);
    g.state.guests.butterfly.ready = true;
    const pts = g.feat.guests.claimButterfly(g);
    check('butterfly bonus: heart level 10 kitty in house 403 gives +10 -> 20 golden butterflies', F.butterflyBonus(g) === 10 && pts === 20 && g.itemCount(98) - b0 === 20, `bonus ${F.butterflyBonus(g)} points ${pts}`);
    g.state.guests.butterfly.ready = true;
    check('...and 40 by the ad button', g.feat.guests.claimButterfly(g, true) === 40);
    g.spendItem(98, g.itemCount(98) - b0);                // leave the butterflies as the shop tests below count them
    kk.exp = exp0; }
  g.reward(3500, 9);
  check('magnet 9 is item 3500009: itemCount 1, magnets(g) {9: 1}, spendItem takes it', g.itemCount(F.magnetItem(9)) === 1 && JSON.stringify(F.magnets(g)) === '{"9":1}' && g.spendItem(F.magnetItem(9), 1) && F.magnetCount(g) === 0);
  check('feeding with no fish fails', F.feed(g, k2.id, 101) === null);

  // ---- shop ----
  check('buying with no butterflies fails', F.buy(g, 9) === false);
  g.reward(98, 400);
  check('400 butterflies held', F.count(g, 98) === 400);
  check('buy 2 buses = 20 butterflies, 2 items', F.buy(g, 9, 2) && F.count(g, 98) === 380 && F.itemCount(g, 9) === 2);
  check('buy a charger (4) 200 butterflies', F.buy(g, 4) && F.count(g, 98) === 180 && F.itemCount(g, 4) === 1);
  check('a plane ticket (250) is too dear for 180', F.buy(g, 11) === false && F.count(g, 98) === 180);
  g.reward(98, 70);
  check('250 now buys the plane', F.buy(g, 11) && F.count(g, 98) === 0);
  check('food lunch box (100)', (g.reward(98, 100), F.buy(g, 2)) && F.itemCount(g, 2) === 1);
  g.reward(98, 400);
  check('train ticket (50), passport (5)=200', F.buy(g, 10) && F.buy(g, 5) && F.itemCount(g, 10) === 1 && F.itemCount(g, 5) === 1);
  check('compass (12) 200 butterflies: 150 is too few, 200 buys it', F.buy(g, 12) === false && (g.reward(98, 50), F.buy(g, 12)) && F.itemCount(g, 12) === 1 && F.count(g, 98) === 0);

  // ---- trip rules ----
  check('trip time = 18000 - ticket seconds: none 18000, bus 10800, train 5400, plane 300', [[], [9], [10], [11]].map(a => F.tripSeconds(g, a)).join() === '18000,10800,5400,300');
  check('two items of one type are refused', !F.validItems(g, [9, 10]) && !F.validItems(g, [1, 2]) && F.validItems(g, [2, 5, 9]));
  check('items not owned are refused', !F.canTravel(g, k1.id, [1]));
  check('a stage kitty cannot travel', !F.canTravel(g, F.stageKitties(g)[0].id, []));
  const t = F.travel(g, k1.id, [2, 5, 9]);
  check('trip with snack 2, passport 5, bus 9 lasts 10800 s and uses the items', t && t.total === 10800 && t.left === 10800 && F.itemCount(g, 2) === 0 && F.itemCount(g, 5) === 0 && F.itemCount(g, 9) === 1);
  check('a travelling kitty cannot leave again', !F.canTravel(g, k1.id, []) && F.collect(g, k1.id) === null);
  g.tick(100);
  check('tick reduces the clock', F.kitty(g, k1.id).trip.left === 10700);
  g.offline(10000, 5000, 10000);
  check('offline counts the whole real time away (10700 - 10000 = 700)', F.kitty(g, k1.id).trip.left === 700);
  g.events.length = 0;
  g.tick(699);
  check('not ready at 1 s left', !F.tripDone(F.kitty(g, k1.id)) && !g.events.some(e => e.type === 'kittyReady'));
  g.tick(2);
  check('ready at 0, event kittyReady once', F.tripDone(F.kitty(g, k1.id)) && g.events.filter(e => e.type === 'kittyReady').length === 1);

  // ---- cancel ----
  const c = F.travel(g, k2.id, [9]);
  check('trip with a bus', c && c.total === 10800 && F.itemCount(g, 9) === 0);
  check('cancel returns the items', F.cancel(g, k2.id) && F.itemCount(g, 9) === 1 && F.kitty(g, k2.id).trip === null);

  // ---- return ----
  g.events.length = 0;
  const tokens0 = F.count(g, 96);
  const r = F.collect(g, k1.id);
  check('collect pays a result and clears the trip', r && F.kitty(g, k1.id).trip === null);
  check('essential 5 (passport, itemValue 1) goes to Europe (region 1)', r.dest.region === 1);
  check('photo saved for that destination with snack 2 and the kitty body', r.photo.dest === r.dest.index && r.photo.snack === 2 && r.photo.kitty === k1.type && s.album[r.dest.index] === r.photo);
  const p = F.pic(g, r.photo.pic);
  check('photo picture belongs to the destination, petPos inside the picture range', r.dest.pics.includes(r.photo.pic) && r.photo.petPos >= p[6] && r.photo.petPos <= p[7]);
  check('tokens: 30 (level-10 souvenir kitty) + 3..6 without a magnet, none extra with a magnet', r.magnet ? r.tokens === 30 : (r.tokens >= 33 && r.tokens <= 36), `tokens ${r.tokens} magnet ${r.magnet && r.magnet.index}`);
  check('souvenir tokens held by the collection feature', F.count(g, 96) === tokens0 + r.tokens);
  check('kittyReturn event emitted with the photo', g.events.some(e => e.type === 'kittyReturn' && e.photo === r.photo));
  check('stats count one trip... (trips=2 incl. the cancelled start), photos 1', s.stats.trips === 2 && s.stats.photos === 1);

  // ---- region choice and compass ----
  const reg = (items, n = 60) => {
    const seen = new Set();
    for (let i = 0; i < n; i++) seen.add(F.pickDest(g, items).region);
    return [...seen].sort().join();
  };
  check('charger (4, value 0) -> only Asia; america item (6, value 2) -> only America', reg([4]) === '0' && reg([6]) === '2');
  check('africa (7) -> 3, oceania (8) -> 4', reg([7]) === '3' && reg([8]) === '4');
  check('no essential -> all five regions appear', reg([], 300) === '0,1,2,3,4');
  check('compass (12) -> any regular destination (all five regions)', reg([12], 300) === '0,1,2,3,4');

  // ---- magnet rule ----
  const withMagnet = D.dests.find(d => D.magnets.some(m => m.dest === d.index));
  check('Magnet.json rows tie to destinations 23, 25, 27, 30', [23, 25, 27, 30].every(i => D.magnets.some(m => m.dest === i)), D.magnets.map(m => m.dest).join());
  const noMag = D.dests.find(d => !D.magnets.some(m => m.dest === d.index));
  check('a destination without magnet rows never drops one', Array.from({ length: 50 }, () => F.pickMagnet(g, noMag)).every(m => m === null));
  let got = 0;
  const dm = D.dests.find(d => d.index === 23);
  for (let i = 0; i < 2000; i++) if (F.pickMagnet(g, dm)) got++;
  check('destination 23 drops a magnet about (100 - 23) % of the time at magnetUp 10 (74-80 %)', got / 2000 > 0.72 && got / 2000 < 0.82, `${got / 20}%`);
  s.magnets = {};
  check('magnet reward type 3500 is kept by this feature', g.reward(3500, 5, {}).stored && s.magnets[5] === 1);

  // ---- album: second photo asks which one to keep ----
  const mkPhoto = d => ({ dest: d, pic: D.dests.find(x => x.index === d).pics[0], pose: '01_L', kitty: 48, snack: 0, petPos: 20, at: 0 });
  s.album = {};
  s.album[3] = mkPhoto(3);
  const old = s.album[3];
  const k = F.kitty(g, k2.id);
  g.reward(98, 0);
  k.trip = { items: [], left: 0, total: 18000 };
  const orig = g.rng;
  // force destination 3 (Asia) by an essential-free trip and many tries until the album asks
  let asked = false;
  for (let i = 0; i < 200 && !asked; i++) {
    k.trip = { items: [4], left: 0, total: 18000 };
    s.pending = null;
    const out = F.collect(g, k2.id);
    if (out.pending) asked = true;
  }
  check('a photo of a destination already in the album waits for a choice', asked && s.pending && s.album[s.pending.dest] && s.pending.photo !== s.album[s.pending.dest]);
  const dd = s.pending.dest, pend = s.pending.photo, olds = s.album[dd];
  check('keeping the old photo drops the pending one', F.choosePhoto(g, false) && s.album[dd] === olds && !s.pending);
  k.trip = { items: [], left: 0, total: 1 }; s.pending = { dest: dd, photo: pend };
  check('choosing the new one replaces the old', F.choosePhoto(g, true) && s.album[dd] === pend && !s.pending);
  check('choosePhoto with nothing pending is false', F.choosePhoto(g, true) === false);

  // ---- save and load keep the slice ----
  const saved = g.save();
  const g2 = await mk();
  g2.load(JSON.parse(JSON.stringify(saved)));
  check('save/load keeps kitties, houses, album and magnets', g2.state.kitty.kitties.length === s.kitties.length && g2.state.kitty.houses.join() === '402,403,404' && Object.keys(g2.state.kitty.album).length === Object.keys(s.album).length && g2.state.kitty.magnets[5] === 1);
  const g3 = await mk();
  const old3 = g3.save();
  delete old3.kitty;
  g3.load(old3);
  check('an old save without the slice gets an empty one', g3.state.kitty.kitties.length === 0 && g3.state.kitty.houses.length === 0);

  // ---- kittens in the forest (CatAI second list, rules/kitty.md section 12) ----
  {
    const h = await mk();
    const HF = h.feat.kitty;
    check('no kitties: no walkers and no kitten state in the cat AI', HF.walkers(h).length === 0 && h.ai.kits.size === 0);
    const ka = HF.buildHouse(h, 402), kb = HF.buildHouse(h, 403);
    check('walkers = kitties off a trip, scaled by DEFINE.KITTY_SCALE 0.67/0.64/0.67', HF.walkers(h).length === 2 && HF.walkers(h)[0].scale.join() === '0.67,0.64,0.67' && HF.walkers(h)[0].type === ka.type);
    const cat0 = JSON.stringify(h.ai.cats.get(h.state.cats[0].id) || null);
    const seen = new Set(), pos = [], maxStep = { v: 0 };
    let last = null, restPaid = 0;
    for (let i = 0; i < 4 * 600; i++) {
      h.tick(0.25);
      const c = h.ai.kits.get(`kitty${ka.id}`);
      if (!c) continue;
      seen.add(c.phase);
      if (last) maxStep.v = Math.max(maxStep.v, Math.hypot(c.x - last[0], c.y - last[1]) / 0.25);
      last = [c.x, c.y];
      pos.push(last);
      if (i === 0) check('the kitten starts at home on a free field cell', h.inField(Math.round(c.x), Math.round(c.y)) && !h.workAt(Math.round(c.x), Math.round(c.y)) && c.phase === 'home');
    }
    check('in 600 s a kitten sleeps, walks and idles (Home / Play phases)', ['home', 'walk', 'idle'].every(p => seen.has(p)), [...seen].join());
    check('kitten speed never above 1.2 world units/s = 0.8 cells/s', maxStep.v <= 0.8 + 1e-6, maxStep.v.toFixed(3));
    const xs = pos.map(p => p[0]), ys = pos.map(p => p[1]);
    check('the kitten covers ground (spread of its path over 1 cell)', Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) > 1);
    check('without a kitty-rest prop (Work 405 is not built here) nobody rests (ChoiceKittyBehavior falls back to Home / Play)', !seen.has('rest'));
    check('kittens live in ai.kits, the worker-cat map ai.cats keeps only the soup cat', h.ai.cats.size === 1 && typeof cat0 === 'string');

    // a trip takes the kitten out of the forest and the return puts it back at home
    check('travel needs a house kitten', HF.travel(h, ka.id, []) !== null);
    h.tick(0.25);
    check('a kitten on a trip is not a walker and has no AI state', !HF.walkers(h).some(w => w.kitty === ka.id) && !h.ai.kits.has(`kitty${ka.id}`) && h.ai.kits.has(`kitty${kb.id}`));
    ka.trip.left = 0;
    HF.collect(h, ka.id);
    h.tick(0.25);
    const back = h.ai.kits.get(`kitty${ka.id}`);
    check('after the trip the kitten is back in the forest asleep at home', back && back.phase === 'home');

    // Rest: a kitty-rest prop (Work type 14, 405) pays AddEnergyByRest when a kitten finishes the visit
    const rw = h.place(405, h.autoCell(), 0);
    check('Work 405 is a type 14 prop', h.work.get(405).type === 14);
    rw.v = 3;
    h.state.energy = B.ZERO;
    let rested = false, visits = 0;
    const startE = h.state.energy;
    for (let i = 0; i < 4 * 900 && !rested; i++) {
      h.tick(0.25);
      for (const c of h.ai.kits.values()) if (c.phase === 'rest') visits++;
      if (rw.v === 0) rested = true;
    }
    const paid = B.sub(h.state.energy, startE);
    check('a kitten walks to the prop, rests there and AddEnergyByRest pays the stored charges', rested && visits > 0 && B.toNumber(paid) > 0, `energy ${B.toNumber(paid)}, rest ticks ${visits}`);
    check('after the visit the prop is empty and the kitten leaves it', rw.v === 0 && ![...h.ai.kits.values()].some(c => c.rest === rw.id && c.phase !== 'rest'));

    // Dance stage: kitties roam 50 s then gather and dance together
    const s2 = await mk();
    const SF = s2.feat.kitty;
    s2.state.gold = B.big(9, 40);
    while (s2.copies(22) < 1 && s2.canBuild(22)) s2.build(22);
    if (s2.copies(22) < 1) s2.place(22, s2.autoCell(), 0);
    s2.state.gold = B.big(1, 25);
    SF.buildStage(s2); s2.state.gem = 2000; SF.addStageKitty(s2);
    check('two stage kitties are walkers flagged stage with wander 50', SF.walkers(s2).length === 2 && SF.walkers(s2).every(w => w.stage && w.wander === 50));
    let danced = 0, gatherAt = -1, st = [];
    for (let i = 0; i < 4 * 130; i++) {
      s2.tick(0.25);
      if (s2.ai.stage.mode === 'gather' && gatherAt < 0) gatherAt = i / 4;
      if ([...s2.ai.kits.values()].every(c => c.phase === 'dance') && s2.ai.kits.size === 2) danced++;
      for (const c of s2.ai.kits.values()) if (c.phase === 'rest') st.push(1);
    }
    check('the stage kitties wander 50 s, then gather', gatherAt >= 49.5 && gatherAt <= 52, `gather at ${gatherAt}s`);
    check('both dance together for a while and then disperse (mode back to wander)', danced > 4 * 4 && s2.ai.stage.mode === 'wander', `${danced / 4}s dancing, mode ${s2.ai.stage.mode}`);
    check('stage kitties never choose Home/Rest (no rest prop): no rest phase', st.length === 0);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
