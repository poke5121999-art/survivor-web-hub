#!/usr/bin/env node
/* Mèo & Súp profile feature (games/cats-soup/js/sim/features/profile.js) in node: unlock counts per cat count, nickname /
 * introduction / title / picture / frame rules, and the photo mission gold.   node test/cats-soup-profile.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const G = path.join(__dirname, '..', 'games', 'cats-soup');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

(async () => {
  const imp = p => import(pathToFileURL(path.join(G, p)).href);
  const { makeGame } = await imp('js/sim/boot.js');
  const B = await imp('js/sim/big.js');
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
  g.fresh();
  const P = g.feat.profile;
  const D = g.data.profile;
  const num = b => b.f * 10 ** b.e;
  const setCats = n => { while (g.state.cats.length < n) g.state.cats.push({ id: 900 + g.state.cats.length, type: 0 }); };

  // ---- table sizes (flat/PlayerTitle, PrimaryImage, PrimaryOutline, PhotoSticker, PhotoOutline) ----
  eq('rows exported', [D.titles.length, D.images.length, D.outlines.length, D.stickers.length, D.frames.length], [6, 105, 14, 12, 11]);
  eq('title thresholds', D.titles.map(r => r.value), [1, 10, 20, 40, 60, 80]);
  eq('outline thresholds', D.outlines.map(r => [r.type, r.value]), [[0, 0], [1, 15], [1, 30], [1, 45], [1, 60], [1, 80], [1, 100], [1, 120], [2, 63], [2, 64], [2, 65], [2, 66], [2, 67], [2, 68]]);

  // ---- fresh game: 1 cat ----
  eq('fresh state', [g.state.profile.title, g.state.profile.image, g.state.profile.frame, g.state.profile.nick], [0, 0, 0, '']);
  eq('1 cat unlocks title 1 only', P.unlockedTitles(g), [1]);
  eq('1 cat owns only the default picture', [P.ownsImage(g, 0), P.ownsImage(g, 1)], [true, false]);
  eq('1 cat owns default outline, not outline 1', [P.ownsOutline(g, 0), P.ownsOutline(g, 1)], [true, false]);
  eq('1 cat owns 9 stickers and 6 photo frames', [D.stickers.filter(r => P.isOwned(g, r)).length, D.frames.filter(r => P.isOwned(g, r)).length], [9, 6]);

  // ---- choosing ----
  eq('locked picture is refused', P.setImage(g, 1), false);
  eq('locked title is refused', P.setTitle(g, 2), false);
  eq('owned title is chosen', [P.setTitle(g, 1), g.state.profile.title], [true, 1]);
  eq('title 0 releases it', [P.setTitle(g, 0), g.state.profile.title], [true, 0]);
  setCats(2);
  g.feat.profile.tick(g);
  eq('2 cats own picture 1 (cat0, value 2)', [P.ownsImage(g, 1), P.setImage(g, 1), g.state.profile.image], [true, true, 1]);
  setCats(15);
  eq('15 cats own outline 1, sticker 5 (Photo_sticker5), not photo frame 5 (20)', [P.ownsOutline(g, 1), P.ownsSticker(g, 4), P.ownsFrame(g, 4)], [true, true, false]);
  setCats(20);
  eq('20 cats own title 3 and photo frame 5 (Photo_box5)', [P.ownsTitle(g, 3), P.ownsFrame(g, 4)], [true, true]);
  eq('event outline 8 (type 2) is never owned', [P.ownsOutline(g, 8), P.setFrame(g, 8)], [false, false]);
  eq('outline 1 is chosen', [P.setFrame(g, 1), g.state.profile.frame], [true, 1]);
  P.tick(g);
  g.state.cats.length = 3;
  eq('losing cats keeps what was unlocked (maxCats 20)', P.ownsTitle(g, 3), true);

  // ---- nickname and introduction ----
  eq('empty name refused', P.setNick(g, '   '), false);
  eq('17 characters refused', P.setNick(g, 'a'.repeat(17)), false);
  eq('16 characters accepted and trimmed', [P.setNick(g, '  Mèo  Vàng '), g.state.profile.nick], [true, 'Mèo Vàng']);
  eq('default name when none chosen', [(g.state.profile.nick = '', P.nickname(g, 'Tâm'))], ['Tâm']);
  eq('chosen name wins', [P.setNick(g, 'Bo'), P.nickname(g, 'Tâm')], [true, 'Bo']);
  eq('199 characters accepted, 200 refused', [P.setIntro(g, 'x'.repeat(199)), P.setIntro(g, 'x'.repeat(200))], [true, false]);

  // ---- stats ----
  g.state.cats.length = 1;
  eq('stats of a fresh forest', P.stats(g), { cats: 1, forest: 1, buildings: 1, photos: 0 });

  // ---- photo mission ----
  g.averageIncome = () => B.fromNumber(10);
  const gold0 = num(g.state.gold);
  let r = P.photo(g, { day: 100 });
  eq('a photo without a mission pays nothing but still counts', [r.gold, num(g.state.gold) - gold0, g.state.profile.photos], [null, 0, 1]);
  let evs = [];
  g.state.profile.mission = 0;
  g.state.timeCount = 4; g.state.profile.lastTime = 4;
  g.state.timeCount = 5;   // 5 % 4 == 1: a mission turns on
  P.tick(g);
  eq('timeCount 5 turns the photo mission on (small forest: normal)', g.state.profile.mission, 1);
  r = P.photo(g, { day: 100 });
  eq('normal photo = avgIncome 10 x 60 s = 600 gold', [num(r.gold), r.special, num(g.state.gold) - gold0], [600, false, 600]);
  eq('mission is used up', g.state.profile.mission, 0);
  g.state.timeCount = 6; P.tick(g);
  eq('timeCount 6 offers nothing', g.state.profile.mission, 0);
  g.state.profile.mission = 2;
  r = P.photo(g, { day: 100, special: true });
  eq('special mission on a size-0 forest stays normal (map size < 4)', [num(r.gold), r.special], [600, false]);
  g.state.mapSize = 4; g.state.profile.mission = 2;
  r = P.photo(g, { day: 100, special: true });
  eq('special photo = 10 x 600 s = 6000 gold', [num(r.gold), r.special], [6000, true]);
  g.state.profile.mission = 2;
  r = P.photo(g, { day: 100, special: true });
  eq('only 1 special photo a day', [num(r.gold), r.special], [600, false]);
  g.state.profile.mission = 2;
  r = P.photo(g, { day: 101, special: true });
  eq('next day allows it again', r.special, true);
  g.state.profile.mission = 1;
  g.events.length = 0;
  P.photo(g, { day: 101 });
  eq('a photo emits the photo event missions count', g.events.filter(e => e.type === 'photo').length, 1);

  // ---- save round trip ----
  const saved = g.save();
  eq('profile survives save', [saved.profile.nick, saved.profile.frame, saved.profile.photos], ['Bo', 1, 7]);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
