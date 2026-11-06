#!/usr/bin/env node
/* Meo & Sup feature "theme" (facility skins, level-sign skins, forest themes, lamps) in node. Literal values come from
 * WorkSkin.json, SignSkin.json, Theme.json, ThemeShop.json, Lamp.json and Work.json (rules: D:/catsoup-ref/rules/theme.md).
 *   node test/cats-soup-theme.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const G = path.join(__dirname, '..', 'games', 'cats-soup');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

(async () => {
  const { makeGame } = await import(pathToFileURL(path.join(G, 'js/sim/boot.js')).href);
  const T = (await import(pathToFileURL(path.join(G, 'js/sim/features/theme.js')).href)).default;
  const mk = async () => { const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8'))); g.fresh(); return g; };
  const g = await mk();
  const st = g.state.theme;
  const cook = g.state.works.find(w => w.a === 0);

  // ---- start state ----
  check('fresh game: theme 0 owned and in use, lamp 0 in use', st.themes.join() === '0' && st.theme === 0 && st.lampType === 0 && T.lampList(g).join() === '0');
  check('every HowAquire Always skin is owned at the start: only WorkSkin 0 and SignSkin 0', st.skins.join() === '0' && st.signs.join() === '0');
  check('table sizes: 155 work skins, 2 sign skins, 19 themes, 125 lamps', g.t.WorkSkin.length === 155 && g.t.SignSkin.length === 2 && g.t.Theme.length === 19 && g.t.Lamp.length === 125);
  check('a new facility wears skin 0, sign 0 and the saved lamp type', JSON.stringify(T.rec(g, cook)) === '{"skin":0,"sign":0,"lamp":0}');

  // ---- facility skins ----
  const list = T.skinList(g, cook);
  check('Work 0 (soup pot) has 26 skin positions in existWorkSkins', g.work.get(0).existWorkSkins.length === 26 && g.work.get(0).existWorkSkins.slice(0, 5).join() === '0,1,4,7,11');
  // listed = owned or ExposePeriod Always(0) / Shop_Package(4); skins 7 20 40 76 88 (Event 3) and 57 (Period 5) stay hidden
  check('skin list shows 20 of the 26: Event and Period rows hidden until owned', list.length === 20 && !list.some(x => [7, 20, 40, 76, 88, 57].includes(x.index)), String(list.length));
  check('skin positions keep the existWorkSkins order (1, 4, 11 ...)', list.slice(0, 4).map(x => x.index).join() === '0,1,4,11' && list.slice(0, 4).map(x => x.pos).join() === '0,1,2,4');
  const s1 = list.find(x => x.index === 1);
  check('skin 1 (cat pot): Package, real money, not owned, not buyable', s1.how === 5 && s1.realMoney && !s1.own && !s1.buyable);
  check('equipping an unowned skin is refused', T.equipSkin(g, cook, 1) === false && T.skinOf(g, cook) === 0);
  g.events.length = 0;
  g.reward(26, 1);
  check('reward type 26 gives WorkSkin 1', T.ownSkin(g, 1) && g.events.some(e => e.type === 'skinGet' && e.skin === 1));
  check('equip skin 1 on the soup pot: stored and an event is emitted', T.equipSkin(g, cook, 1) && T.skinOf(g, cook) === 1 && g.events.some(e => e.type === 'skin' && e.skin === 1));
  check('the same skin twice does nothing', T.equipSkin(g, cook, 1) === false);
  check('a skin of another facility (WorkSkin 2 is the juice maker) cannot be worn by the soup pot', (g.reward(26, 2), T.equipSkin(g, cook, 2)) === false);
  check('WorkSkin 56 is HowAquire Gem with price 0 and Always exposed (the only gem skin)', T.skinRow(g, 56).howAquire === 3 && T.skinRow(g, 56).howAquire_Value === 0 && T.skinRow(g, 56).exposePeriod === 0 && g.t.WorkSkin.filter(r => r.howAquire === 3).length === 1);
  check('skin list marks the worn skin and the owned ones', (() => { const l = T.skinList(g, cook); return l.find(x => x.index === 1).equipped && l.filter(x => x.own).length === 2; })());
  g.reward(26, 999);
  check('reward type 26 with an unknown index gives nothing', T.ownSkin(g, 999) === false);

  // BaseTile: WorkSkin 37 (beach concert) has BaseTile 5, the rest -1 (WorkSkin.json)
  check('WorkSkin 37 has BaseTile 5 and 82 has 6, 84 has 20', T.skinRow(g, 37).BaseTile === 5 && T.skinRow(g, 82).BaseTile === 6 && T.skinRow(g, 84).BaseTile === 20);
  check('base tile of the soup pot stays Work.baseTile 3 with skin 1', T.baseTile(g, cook) === 3);
  // a busker (Work 13?) -> find the facility that lists skin 37 to check Work.get_BaseTile
  const busk = g.t.Work.find(w => w.existWorkSkins.includes(37));
  g.state.works.push({ id: 900, a: busk.index, pos: [0, 0], lv: 1 });
  const bw = g.state.works.find(w => w.id === 900);
  g.reward(26, 37);
  const tileBefore = T.baseTile(g, bw);
  g.events.length = 0;
  T.equipSkin(g, bw, 37);
  check(`busker skin 37 swaps the ground tile under it: ${tileBefore} -> 5`, tileBefore === busk.baseTile && T.baseTile(g, bw) === 5 && g.events.some(e => e.type === 'skin' && e.tileChanged), `Work ${busk.index} baseTile ${busk.baseTile}`);
  g.state.works.pop();

  // ---- sign skins ----
  const signs = T.signList(g, cook);
  check('SignSkin 1 (practice sign): Lv 1000, ExposePeriod Possession, hidden until owned', g.t.SignSkin[1].howAquire === 1 && g.t.SignSkin[1].howAquire_Value === 1000 && g.t.SignSkin[1].exposePeriod === 2 && signs.length === 1 && signs[0].index === 0);
  cook.lv = 999;
  g.emit('upgrade', { work: cook });
  check('level 999 does not open the sign skin', !T.ownSign(g, 1));
  cook.lv = 1000;
  g.emit('upgrade', { work: cook });
  check('level 1000 opens the sign skin and lists it', T.ownSign(g, 1) && T.signList(g, cook).length === 2);
  check('wear the sign skin', T.equipSign(g, cook, 1) && T.signOf(g, cook) === 1);

  // ---- lamps ----
  const g2 = await mk();
  const c2 = g2.state.works.find(w => w.a === 0);
  check('Lamp.json: lamp 0 cost 0, the other 124 cost -1 (not sold)', g2.t.Lamp[0].cost === 0 && g2.t.Lamp.slice(1).every(r => r.cost === -1));
  check('lamp not owned cannot be worn', T.equipLampAll(g2, 5) === false && T.equipLamp(g2, c2, 5) === false && g2.state.theme.lampType === 0);
  g2.reward(14, 5);
  g2.reward(14, 1);
  g2.reward(14, 0);
  check('reward type 14 adds lamps 1 and 5 (lamp 0 is never added), list sorted', T.lampList(g2).join() === '0,1,5' && g2.state.theme.lamps.join() === '0,5,1');
  check('Work 0 has a lamp (haveLamp 1), the fishing ground (Work 10) none', T.hasLamp(g2, c2) === true && g2.work.get(10).haveLamp === 0);
  const other = g2.t.Work.find(w => w.haveLamp === 0 && w.eventType === 0);
  g2.state.works.push({ id: 901, a: other.index, pos: [0, 1], lv: 1 });
  const noLamp = g2.state.works.find(w => w.id === 901);
  g2.state.storage.push({ id: 902, a: 0, pos: [0, 0], lv: 1 });
  g2.events.length = 0;
  check('equip lamp 5 on every facility: lampType saved, all facilities with haveLamp change (storage too)', T.equipLampAll(g2, 5) && g2.state.theme.lampType === 5 && T.lampOf(g2, c2) === 5 && T.lampOf(g2, g2.state.storage[0]) === 5);
  check('a facility without haveLamp keeps its lamp', T.lampOf(g2, noLamp) === 0);
  check('lamp event carries all: true', g2.events.some(e => e.type === 'lamp' && e.all === true && e.lamp === 5));
  check('same lamp again does nothing', T.equipLampAll(g2, 5) === false);
  check('one facility can wear another owned lamp (EquipLampSkin)', T.equipLamp(g2, c2, 1) && T.lampOf(g2, c2) === 1 && g2.state.theme.lampType === 5);
  g2.state.works.splice(g2.state.works.indexOf(noLamp), 1);

  // ---- forest themes ----
  const g3 = await mk();
  const th = T.themeList(g3);
  // eventType 0 rows: themes 0 and 1; the other 17 are event themes shown only once owned
  check('theme list at the start: themes 0 and 1 (eventType 0), 17 event themes hidden', th.map(x => x.index).join() === '0,1');
  check('Theme 1 (snow forest) costs 800 gems and is buyable', g3.t.Theme[1].cost === 800 && g3.t.Theme[1].costType === 3 && th[1].buyable === true);
  g3.state.gem = 799;
  check('799 gems cannot buy theme 1', T.buyTheme(g3, 1) === false && g3.state.gem === 799 && !T.ownTheme(g3, 1));
  check('cannot use a theme that is not owned', T.setTheme(g3, 1) === false && T.currentTheme(g3) === 0);
  g3.state.gem = 800;
  g3.events.length = 0;
  check('800 gems buy theme 1: gems 800 -> 0', T.buyTheme(g3, 1) && g3.state.gem === 0 && T.ownTheme(g3, 1) && g3.events.some(e => e.type === 'themeBuy'));
  check('theme 1 can be used now, ground textures change', T.setTheme(g3, 1) && T.currentTheme(g3) === 1 && T.groundOf(g3, 1).base !== T.groundOf(g3, 0).base);
  check('buying it twice does nothing', (g3.state.gem = 900, T.buyTheme(g3, 1)) === false && g3.state.gem === 900);
  g3.reward(22, 14);
  check('reward type 22 gives event theme 14 (graveyard) and lists it', T.ownTheme(g3, 14) && T.themeList(g3).map(x => x.index).join() === '0,1,14');
  check('theme 5 inherits theme 3 ground', T.groundOf(g3, 5).base === T.groundOf(g3, 3).base && g3.data.theme.ground['5'].inherit === 3);
  check('ground data covers the 19 themes with a camera colour', Object.keys(g3.data.theme.ground).length === 19 && g3.data.theme.ground['0'].bg.join() === '0.4274,0.5569,0.3294');
  check('Theme 14 and 15 are theme_type 1 and 2 (special shop themes)', T.themeType(g3, 14) === 1 && T.themeType(g3, 15) === 2 && T.themeType(g3, 0) === 0);

  // ---- special theme shop ----
  const rows = T.shopRows(g3, 1);
  check('ThemeShop type 1 has 8 rows: 3 once-only (3000) and 5 limited x3', rows.length === 8 && rows.filter(r => r.row.enableCount === 1).length === 3 && rows.filter(r => r.row.enableCount === 3).length === 5);
  check('ThemeShop row 7: 500 money for 25 furniture coins (reward type 4), 3 times', rows.find(r => r.index === 7).cost === 500 && rows.find(r => r.index === 7).rewardType === 4 && rows.find(r => r.index === 7).rewardValue === 25);
  check('special money starts at 0 and cannot pay', T.moneyOf(g3, 1) === 0 && T.shopBuy(g3, 7) === false);
  g3.reward(8001, 1700);
  check('reward type 8001 adds theme-type-1 money', T.moneyOf(g3, 1) === 1700 && T.moneyOf(g3, 2) === 0);
  const coin0 = g3.state.coin;
  check('buy row 7 three times: 1700 -> 200 money, +75 coins, the 4th is sold out', T.shopBuy(g3, 7) && T.shopBuy(g3, 7) && T.shopBuy(g3, 7) && T.moneyOf(g3, 1) === 200 && g3.state.coin === coin0 + 75 && T.shopBuy(g3, 7) === false);
  check('row 0 pays an equipment (type 5) once for 3000', rows[0].rewardType === 5 && rows[0].cost === 3000 && rows[0].row.enableCount === 1);

  // ---- save / load keeps everything ----
  const saved = JSON.parse(JSON.stringify(g3.save()));
  const g4 = await mk();
  g4.load(saved);
  check('save and load keep themes, lamps, money and shop counts', g4.state.theme.theme === 1 && g4.state.theme.themes.join() === '0,1,14' && T.moneyOf(g4, 1) === 200 && g4.state.theme.shopBuy[7] === 3);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
