#!/usr/bin/env node
/* Food Gang menus and meta screens in a real browser (games/food-gang/index.html, offline=1 so quick play is the
 * original offline match vs bots). Fresh profile -> tutorial vs 5 dummies -> SceneTutoEnd (nickname typed in the real
 * <input>) -> 3 matches through the searching / VS panel -> SceneGameOver -> fridge opened in SceneReward (the third
 * one past the 3 free opens, through the ad button) -> menu; then every popup: fighters + stats + power info + upgrade +
 * select, shop (free gift, ad gift, VIP-ad gift, fridge with SceneConfirmPurchase, gem pack IAP, coin pack, special
 * offer, paid offer), VIP pass (KING), trophy road claim + league pack popup, weekly missions (a mission match, then
 * COLLECT), settings (sound / music / fps / nickname / 3 languages and back / delete popup), party battle screens,
 * leaderboard; reload keeps the profile. No console errors. Screenshots: FG_SHOTS (default shots/food-gang/ui).
 *   node test/food-gang-meta-ui.js
 *   FG_URL=https://poke5121999-art.github.io/survivor-web-hub/games/food-gang/index.html node test/food-gang-meta-ui.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.FG_SHOTS || path.join(ROOT, 'shots', 'food-gang', 'ui');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.css': 'text/css', '.otf': 'font/otf', '.ttf': 'font/ttf' };
let pass = 0, fail = 0;
const fails = [];
let section = '';
const check = (name, ok, detail) => {
  const n = section ? `[${section}] ${name}` : name;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${detail ? `  (${detail})` : ''}`);
  if (ok) pass++; else { fail++; fails.push(n + (detail ? ` (${detail})` : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, s) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, b) => {
        if (e) { s.writeHead(404); s.end(); return; }
        s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        s.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = process.env.FG_URL ? null : await serve();
  const base = process.env.FG_URL || `http://localhost:${srv.address().port}/games/food-gang/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const budget = Number(process.env.FG_TIMEOUT || 1500) * 1000;
  const killer = setTimeout(() => { console.log(`  FAIL timeout (${budget / 1000} s)`); process.exit(2); }, budget);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const ev = (f, a) => page.evaluate(f, a);
  const dbg = () => ev(() => window.fgDebug());
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const until = async (f, ms, a, step = 120) => { const e = Date.now() + ms; for (;;) { const v = await ev(f, a).catch(() => null); if (v) return v; if (Date.now() > e) return null; await sleep(step); } };
  const top = () => ev(() => { const u = window.fgDebug().ui; return u[0] || null; });
  const topIs = (scene, ms = 15000) => until((s) => { const u = window.fgDebug().ui; return u[0] && u[0].scene === s ? u[0] : null; }, ms, scene);
  const button = (method, scene, name) => ev(([m, s, n]) => (window.fgButtons(s) || []).find((x) => x.method.split(',').includes(m) && (!n || x.name === n)), [method, scene, name]);
  const clickAt = async (pos) => { await page.mouse.click(pos[0], pos[1]); await sleep(150); };
  const press = async (method, scene, name) => { const b = await button(method, scene, name); if (!b) return false; await clickAt(b.pos); return true; };
  const back = async (scene) => { const ok = await press('Close', scene) || await press('OnClickBack', scene); await sleep(500); return ok; };
  // SceneReward: tap through every reward until the popup closes
  const tapRewards = async (tag) => {
    const r = await topIs('SceneReward', 8000);
    if (!r) return 0;
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const u = await top();
      if (!u || u.scene !== 'SceneReward') break;
      if (i === 1 && tag) await shot(tag);
      if (u.state === 'item' || u.state === 'box') { await page.mouse.click(640, 420); n++; }
      await sleep(550);
    }
    return n;
  };
  // the local side wins fast: the sim's debug damage from the local fighter on every living enemy
  const forceWin = () => ev(() => {
    clearInterval(window.__win);
    window.__win = setInterval(() => {
      const r = window.fgApp.match && window.fgApp.match.runner;
      if (!r || window.fgApp.match.phase !== 'match') return;
      const me = r.localAgent;
      if (!me) return;
      for (const a of r.state.agents) if (a !== me && a.hpCurrent > 0 && (r.state.teams === 0 || a.team !== me.team)) r.match.debugDamage(r.state, a.id, 99999, me.id);
    }, 250);
  });
  const stopWin = () => ev(() => clearInterval(window.__win));

  // one quick-play match from the moment the menu (or TutoEnd) launched it, to the menu again
  const playMatch = async (k, opts = {}) => {
    section = `match ${k}`;
    const s0 = await until(() => { const d = window.fgDebug(); return d.match && (d.phase === 'searching' || d.phase === 'intro') ? d : null; }, 30000, null, 40);
    check('matchmaking panel (Searching opponents... with spinning cells)', !!s0 && s0.phase === 'searching', s0 ? s0.phase : 'no match');
    if (k === 1 && s0) await shot('03_searching');
    const vs = await until(() => { const d = window.fgDebug(); return d.phase === 'intro' ? d : null; }, 10000, null, 40);
    if (vs) { await sleep(600); if (k === 1) await shot('04_versus'); }
    check('VS screen after the lobby', !!vs);
    const m = await until(() => { const d = window.fgDebug(); return d.phase === 'match' && d.tick > 5 ? d : null; }, 20000);
    check('match runs', !!m, m ? `mode ${m.match.goal}/${m.match.teams} map ${m.match.mapIndex}` : '');
    if (k === 1) { await sleep(500); await shot('05_match'); }
    await ev(() => window.fgTimeScale(6));
    await forceWin();
    if (k === 1) {
      const rank = await until(() => { const d = window.fgDebug(); return d.screen === 'gameover' && d.gameOver && d.gameOver.phase === 'rank' ? d : null; }, 150000, null, 100);
      check('result podium (local team in victory poses)', !!rank);
      if (rank) { await sleep(2000); await shot('06_podium'); }
    }
    const over = await until(() => { const d = window.fgDebug(); return d.screen === 'gameover' && d.gameOver && d.gameOver.phase === 'reward' ? d : null; }, 150000, null, 200);
    await stopWin();
    check('result screen', !!over, over ? `${over.gameOver.title} ${over.gameOver.trophyText} trophies ${over.gameOver.starText} stars` : 'no game over');
    if (!over) return null;
    await sleep(1600);   // the bottom bar slides in: read the button positions once it stopped
    if (k === 1) await shot('06_gameover');
    const g = (await dbg()).gameOver;
    let opened = null;
    if (g.openButton && !opts.mission) {
      const before = (await dbg()).profile;
      const free = await ev(() => window.fgApp.meta.canOpenFridgeFree(window.fgApp.profile, new Date()));
      await clickAt(g.openButton);
      let box = await topIs('SceneReward', 5000);
      if (!box) { const g3 = (await dbg()).gameOver; if (g3 && g3.openButton) await clickAt(g3.openButton); box = await topIs('SceneReward', 5000); }
      if (box && k <= 3) await shot(`07_fridge_${k}`);
      const n = await tapRewards(k === 1 ? '08_fridge_item' : null);
      const after = await ev(() => window.fgApp.profile.fridge.openCount);
      opened = { free, n, openCount: after };
      check(`fridge opened in SceneReward (${free ? 'free' : 'ad'} open)`, !!box && n > 0, `${n} rewards, opens ${after}, coins ${before.coins} -> ${(await dbg()).profile.coins}`);
    }
    const g2 = (await dbg()).gameOver;
    if (g2 && g2.playButton) await clickAt(g2.playButton);
    const menu = await until(() => window.fgDebug().screen === 'menu' && window.fgDebug().ui[0] && window.fgDebug().ui[0].scene === 'SceneMenu', 20000);
    check('back to the menu', !!menu);
    await sleep(2500);   // trophies fly into the league button
    return { over, opened };
  };

  try {
    // ---------------------------------------------------------------- first launch
    section = 'first launch';
    await page.goto(base.replace('index.html', 'dev.html'));
    await ev(() => localStorage.clear());
    await page.goto(`${base}?offline=1`);
    const intro = await until(() => window.fgDebug && window.fgDebug().screen === 'intro', 30000, null, 50);
    if (intro) { await sleep(900); await shot('00_intro'); }
    const tuto = await until(() => { const d = window.fgDebug(); return d && d.match && d.phase === 'match' && d.tick > 5 ? d : null; }, 40000);
    const dummies = tuto ? tuto.agents.filter((a) => a.skin === 'DUMMY').length : 0;
    check('first launch starts the tutorial match: one fighter vs 5 dummies', !!tuto && dummies === 5 && tuto.agents.length === 6, tuto ? `${tuto.agents.length} agents, ${dummies} dummies` : 'no tutorial');
    const tutoText = await ev(() => { const h = window.fgApp.match.hud.tuto; const t = h && (h.get('Text') || h.inChildren('Text')[0]); return h && h.activeInHierarchy && t ? t.text : ''; });
    check('tutorial text "Destroy 5 dummies to complete your training"', /Destroy/.test(tutoText) && /5/.test(tutoText), tutoText);
    await shot('01_tutorial');
    // play a little with the keyboard, then finish the dummies with the sim's debug damage
    await page.keyboard.down('KeyD'); await sleep(500); await page.keyboard.up('KeyD');
    await page.keyboard.down('KeyJ'); await sleep(600); await page.keyboard.up('KeyJ');
    for (let i = 0; i < 5; i++) { await ev(() => { const r = window.fgApp.match.runner; const d = r.state.agents.find((a) => a.isDummy && a.hpCurrent > 0); if (d) r.match.debugDamage(r.state, d.id, 9999, r.localAgent.id); }); await sleep(400); }
    const te = await until(() => window.fgDebug().screen === 'tutoend' && window.fgDebug().ui[0] && window.fgDebug().ui[0].scene === 'SceneTutoEnd' ? window.fgDebug().ui[0] : null, 20000);
    check('last dummy down -> SceneTutoEnd (no result screen)', !!te);
    await sleep(800);
    await shot('02_tutoend');
    const p0 = (await dbg()).profile;
    check('tutorial gives no reward, game count 1', p0.gameCount === 1 && p0.trophies === 0 && p0.coins === 0, `games ${p0.gameCount}, trophies ${p0.trophies}`);
    if (te && te.field) {
      await clickAt(te.field);
      await sleep(300);
      await page.keyboard.press('Control+A');
      await page.keyboard.type('WebTester');
      await page.keyboard.press('Enter');
      await sleep(300);
    }
    await press('Load', 'SceneTutoEnd');
    check('nickname typed in the name field is saved', (await dbg()).profile.name === 'WebTester', (await dbg()).profile.name);

    // ---------------------------------------------------------------- three matches through matchmaking
    const r1 = await playMatch(1);
    section = 'menu';
    await shot('09_menu');
    const t1 = (await dbg()).profile.trophies;
    check('trophies after the first match', t1 > 0, `${t1}`);
    for (const k of [2, 3]) {
      section = `match ${k}`;
      if (k === 3) await ev(() => { const p = window.fgApp.profile; if (p.fridge.openCount < 3) p.fridge.openCount = 3; window.fgApp.save(); });
      const ok = await press('Play', 'SceneMenu');
      check('BATTLE! starts matchmaking', ok);
      const r = await playMatch(k);
      if (k === 3 && r && r.opened) check('third fridge past the 3 free opens goes through the ad button', r.opened.free === false && r.opened.openCount >= 4, JSON.stringify(r.opened));
    }
    section = 'menu';
    const pm = (await dbg()).profile;
    check('3 matches played after the tutorial', pm.gameCount === 4, `game count ${pm.gameCount}`);

    // ---------------------------------------------------------------- shop
    section = 'shop';
    await press('OpenShop', 'SceneMenu');
    let sh = await topIs('SceneShop');
    check('shop opens', !!sh);
    await sleep(800); await shot('10_shop');
    const cur = async () => (await dbg()).profile;
    // daily gifts: free, ad (the click is the ad), VIP cell unlocked by watching ads
    for (const [i, kind] of [[0, 'free gift'], [1, 'ad gift']]) {
      sh = await top();
      const c = sh.gifts[i];
      if (!c || c.claimed) { check(`${kind}`, false, 'cell not claimable'); continue; }
      await ev((x) => { const s = window.fgApp.screens.find((q) => q.sceneName === 'SceneShop'); const sr = s.script('ScrollRect'); if (sr && sr.scrollTo) sr.scrollTo(s.gifts[x].node); }, i);
      await sleep(600);
      sh = await top();
      await clickAt(sh.gifts[i].pos);
      const n = await tapRewards(i === 0 ? '11_gift_reward' : null);
      sh = await top();
      check(`${kind} claimed`, n > 0 && sh.gifts[i].claimed, `${n} rewards`);
    }
    {
      await ev(() => { const s = window.fgApp.screens.find((q) => q.sceneName === 'SceneShop'); const sr = s.script('ScrollRect'); if (sr && sr.scrollTo) sr.scrollTo(s.gifts[2].node); });
      await sleep(600);
      sh = await top();
      const c = sh.gifts[2];
      const ads0 = await ev(() => window.fgApp.profile.daily.vip1Ads);
      await clickAt(c.pos); await sleep(400);
      const ads1 = await ev(() => window.fgApp.profile.daily.vip1Ads);
      let n = await tapRewards();
      for (let i = 0; i < 4 && !n; i++) { sh = await top(); if (sh.scene !== 'SceneShop' || sh.gifts[2].claimed) break; await clickAt(sh.gifts[2].pos); await sleep(400); n = await tapRewards(); }
      sh = await top();
      check('VIP gift unlocked by watching ads (each click = one ad)', ads1 === ads0 + 1 && sh.gifts[2].claimed, `ads ${ads0} -> ${ads1}, claimed ${sh.gifts[2].claimed}`);
    }
    // gem pack (IAP: the click is the purchase)
    {
      await ev(() => { const s = window.fgApp.screens.find((q) => q.sceneName === 'SceneShop'); const sr = s.script('ScrollRect'); if (sr && sr.scrollTo) sr.scrollTo(s.premium[5].node); });
      await sleep(600);
      sh = await top();
      const g0 = (await cur()).gems;
      await clickAt(sh.premium[5].pos);
      await tapRewards('12_gems_reward');
      const g1 = (await cur()).gems;
      check('gem pack (IAP) grants gems at once', g1 > g0, `${g0} -> ${g1} gems`);
    }
    // coin pack for gems
    {
      await ev(() => { const s = window.fgApp.screens.find((q) => q.sceneName === 'SceneShop'); const sr = s.script('ScrollRect'); if (sr && sr.scrollTo) sr.scrollTo(s.freemium[0].node); });
      await sleep(600);
      sh = await top();
      const a = await cur();
      await clickAt(sh.freemium[0].pos);
      await tapRewards();
      const b = await cur();
      check('coin pack bought with gems', b.coins > a.coins && b.gems < a.gems, `coins ${a.coins} -> ${b.coins}, gems ${a.gems} -> ${b.gems}`);
    }
    // fridge for gems through SceneConfirmPurchase
    {
      await ev(() => { const s = window.fgApp.screens.find((q) => q.sceneName === 'SceneShop'); const sr = s.script('ScrollRect'); if (sr && sr.scrollTo) sr.scrollTo(s.boxes[0].node); });
      await sleep(600);
      sh = await top();
      const a = await cur();
      if (sh.boxes[0] && sh.boxes[0].pos) {
        await clickAt(sh.boxes[0].pos);
        const cp = await topIs('SceneConfirmPurchase', 6000);
        if (cp) { await sleep(500); await shot('13_confirm_purchase'); await clickAt(cp.confirm); }
        const n = await tapRewards('14_box_reward');
        const b = await cur();
        check('big fridge bought with gems after SceneConfirmPurchase', !!cp && n > 0 && b.gems < a.gems, `gems ${a.gems} -> ${b.gems}, ${n} rewards`);
      } else check('big fridge cell shown', false);
    }
    // skin special offer and the daily paid offer, when today has them
    sh = await top();
    if (sh.offer && sh.offer.pos) {
      await ev(() => { const s = window.fgApp.screens.find((q) => q.sceneName === 'SceneShop'); const sr = s.script('ScrollRect'); if (sr && sr.scrollTo) sr.scrollTo(s.offerCell.node); });
      await sleep(600); sh = await top();
      const a = await cur();
      await clickAt(sh.offer.pos);
      await tapRewards('15_offer_skin');
      const b = await cur();
      check('special skin offer bought with gems', b.skins.length > a.skins.length, `skins ${a.skins.length} -> ${b.skins.length}`);
    }
    sh = await top();
    if (sh.paidOffer) {
      await ev(() => { const s = window.fgApp.screens.find((q) => q.sceneName === 'SceneShop'); const sr = s.script('ScrollRect'); if (sr && sr.scrollTo) sr.scrollTo(s.node(s.sf.m_dailyPaidOffer)); });
      await sleep(600); sh = await top();
      const day0 = await ev(() => window.fgApp.meta.dailyPaidOfferBought(window.fgApp.profile, new Date()));
      await clickAt(sh.paidOffer);
      await tapRewards();
      const day1 = await ev(() => window.fgApp.meta.dailyPaidOfferBought(window.fgApp.profile, new Date()));
      check('daily paid offer bought (IAP or gems)', !day0 && day1);
    }
    await back('SceneShop');

    // ---------------------------------------------------------------- fighters: stats, power info, upgrade
    section = 'fighters';
    await press('OpenSkinCollection', 'SceneMenu', 'Collection');
    const col = await topIs('SceneSkinCollection');
    check('fighters collection opens with every fighter', !!col && col.cells.length === 16, col ? `${col.cells.length} cells` : '');
    await sleep(1200); await shot('16_collection');
    await clickAt(col.cells[0].pos);
    let st = await topIs('SceneSkinStat');
    check('fighter stats open (health, attack)', !!st && +st.health > 0 && +st.attack > 0, st ? `${st.health} hp, ${st.attack} attack` : '');
    await sleep(1000); await shot('17_skinstat');
    await clickAt(st.powers[0]);
    const pi = await topIs('ScenePowerInfo', 6000);
    check('power badge opens ScenePowerInfo', !!pi, pi ? pi.name : '');
    if (pi) { await sleep(500); await shot('18_powerinfo'); await back('ScenePowerInfo'); }
    st = await topIs('SceneSkinStat');
    {
      const a = await cur();
      const s1 = a.skins.find((x) => x[0] === 1);
      // tokens / coins from three fridges, gifts and a coin pack: enough for 1 -> 2
      if (st.upgrade) await clickAt(st.upgrade);
      await sleep(1500);
      await tapRewards();
      const b = await cur();
      const s2 = b.skins.find((x) => x[0] === 1);
      check('UPGRADE spends tokens and coins, level +1', s2[1] === s1[1] + 1 && b.coins < a.coins, `level ${s1[1]} -> ${s2[1]}, tokens ${s1[2]} -> ${s2[2]}, coins ${a.coins} -> ${b.coins}`);
      st = await topIs('SceneSkinStat');
      await shot('19_upgraded');
    }
    await back('SceneSkinStat');
    await back('SceneSkinCollection');

    // ---------------------------------------------------------------- VIP pass -> KING, select another fighter
    section = 'vip';
    await press('OpenVIP', 'SceneMenu');
    const vip = await topIs('SceneVIP');
    await sleep(800); await shot('20_vip');
    await clickAt(vip.weekly);
    await tapRewards('21_vip_king');
    const pv = await cur();
    check('VIP pass (IAP) gives KING and VIP time', pv.skins.some((x) => x[0] === 4), `skins ${pv.skins.map((x) => x[0]).join(',')}`);
    await sleep(500);
    if ((await top()).scene === 'SceneVIP') await back('SceneVIP');
    section = 'fighters';
    await press('OpenSkinCollection', 'SceneMenu', 'Collection');
    const col2 = await topIs('SceneSkinCollection');
    await sleep(800);
    const king = col2.cells.find((c) => c.id === 4);
    await clickAt(king.pos);
    st = await topIs('SceneSkinStat');
    if (st && st.select) await clickAt(st.select);
    await sleep(800);
    check('SELECT another fighter (KING)', (await cur()).skinSelected === 4, `selected ${(await cur()).skinSelected}`);
    if ((await top()).scene === 'SceneSkinStat') await back('SceneSkinStat');
    await back('SceneSkinCollection');
    await sleep(1500);
    await shot('22_menu_king');

    // ---------------------------------------------------------------- trophy road
    section = 'trophy road';
    await press('OpenLeague', 'SceneMenu');
    await topIs('SceneLeague');
    await sleep(1000); await shot('23_trophy_road');
    const lg = await until(() => { const u = window.fgDebug().ui[0]; return u && u.scene === 'SceneLeague' && u.available ? u : null; }, 8000);
    const avail = ((lg && lg.available) || []).filter((a) => a.pos[0] > 0 && a.pos[0] < 1280);
    if (avail.length) {
      const c0 = await ev(() => window.fgApp.profile.roadClaimed.length);
      await clickAt(avail[0].pos);
      await tapRewards('24_road_reward');
      const c1 = (await ev(() => window.fgApp.profile.roadClaimed.length));
      check('COLLECT! a trophy road step', c1 === c0 + 1, `claimed ${c0} -> ${c1}`);
    } else check('a trophy road step to collect', false, JSON.stringify(lg));
    await back('SceneLeague');
    // the league pack popup (§4.6 opens it when a match crosses 100 trophies): opened directly
    section = 'league pack';
    await ev(async () => { const p = window.fgApp.profile; p.trophies = Math.max(p.trophies, 100); p.trophiesShown = p.trophies; p.lastLeagueChange = Math.floor(Date.now() / 1000); window.fgApp.save(); const m = await import('./js/game/screens/League.js'); await window.fgApp.popup(m.OfferLeagueScreen); });
    let ol = await topIs('SceneOfferLeague', 6000);
    if (ol) {
      await sleep(600); await shot('25_offer_league');
      ol = await top();
      const g0 = (await cur()).gems;
      await clickAt(ol.buy);
      await tapRewards();
      check('league pack (IAP) grants its two rewards', (await ev(() => window.fgApp.profile.leaguePacksBought.length)) === 1 && (await cur()).gems > g0);
    } else check('league pack popup', false);

    // ---------------------------------------------------------------- weekly missions
    section = 'missions';
    // the Mode reward of the 50-trophy road step unlocks missions: granted here through the meta library
    await ev(() => { const a = window.fgApp; a.meta.grantReward(a.profile, { type: 5, count: 1, skinId: 0, powerId: 0, id: 2 }, 'test', new Date()); a.meta.tick(a.profile, new Date()); a.save(); a.menuScreen && a.menuScreen.refreshLight(); });
    await sleep(500);
    await press('DisplayMission', 'SceneMenu');
    let ms = await topIs('SceneMissions');
    check('weekly missions open once unlocked', !!ms);
    await sleep(1000); await shot('26_missions');
    const playable = ms ? ms.cells.find((c) => c.state === 'play') : null;
    if (playable) {
      await clickAt(playable.pos);
      const r = await playMatch(4, { mission: true });
      section = 'missions';
      check('mission match played from PLAY', !!r);
      await press('DisplayMission', 'SceneMenu');
      ms = await topIs('SceneMissions');
      await sleep(800);
      const rc = ms.cells.find((c) => c.state === 'reward');
      if (rc) {
        await clickAt(rc.pos);
        await tapRewards('27_mission_reward');
        const claimed = await ev(() => window.fgApp.profile.missions.slots.some((s) => s.rewardClaimed));
        check('won mission: COLLECT! its reward', claimed);
      } else check('won mission shows its reward', false, JSON.stringify(ms.cells.map((c) => c.state)));
      await back('SceneMissions');
    } else check('a mission to play', false);

    // ---------------------------------------------------------------- settings + languages
    section = 'settings';
    await press('OpenSettings', 'SceneMenu');
    let se = await topIs('SceneSettings');
    await sleep(800); await shot('28_settings');
    await press('SwitchMute', 'SceneSettings', 'Button_Sound');
    await press('SwitchMute', 'SceneSettings', 'Button_Music');
    await press('SwitchFPS', 'SceneSettings');
    se = await top();
    check('sound / music off, FPS 120', se.sfx === false && se.music === false && se.fps === 120, JSON.stringify({ sfx: se.sfx, music: se.music, fps: se.fps }));
    await press('SwitchMute', 'SceneSettings', 'Button_Sound');
    await press('SwitchMute', 'SceneSettings', 'Button_Music');
    await press('SwitchFPS', 'SceneSettings');
    const titleText = () => ev(() => { const s = window.fgApp.screens.find((q) => q.sceneName === 'SceneSettings'); const t = s.find('Title'); return t && t.get('Text') ? t.get('Text').text : ''; });
    const texts = { English: await titleText() };
    const langs = [];
    for (let i = 0; i < 14; i++) {
      se = await top();
      await clickAt(se.languageButton);
      await until(() => !window.fgApp.screens.find((q) => q.sceneName === 'SceneSettings').switching, 8000);
      await sleep(300);
      const L = (await dbg()).language;
      langs.push(L);
      texts[L] = await titleText();
      if (['French', 'Japanese', 'Arabic', 'Russian', 'ChineseSimplified', 'Korean'].includes(L)) await shot('29_settings_' + L);
      if (L === 'English') break;
    }
    const changed = Object.entries(texts).filter(([k, v]) => k !== 'English' && v && v !== texts.English);
    check('LANGUAGE cycles the original languages and the texts change', changed.length >= 3, Object.entries(texts).map(([k, v]) => `${k}:${v}`).join(' | '));
    for (let i = 0; i < 14 && (await dbg()).language !== 'English'; i++) {
      se = await top();
      await clickAt(se.languageButton);
      await until(() => !window.fgApp.screens.find((q) => q.sceneName === 'SceneSettings').switching, 8000);
    }
    check('back to English', (await dbg()).language === 'English' && (await titleText()) === texts.English);
    await press('OpenDelete', 'SceneSettings');
    const del = await topIs('SceneDelete', 6000);
    if (del) { await sleep(500); await shot('30_delete'); }
    check('Delete Save asks first (SceneDelete)', !!del);
    await press('Close', 'SceneDelete');
    await sleep(400);
    await back('SceneSettings');

    // ---------------------------------------------------------------- party battle
    section = 'party battle';
    await press('PrivateBattle', 'SceneMenu');
    const pb = await topIs('ScenePrivateBattle');
    await sleep(800); await shot('31_party');
    check('party battle opens', !!pb, pb ? `online ${pb.online}` : '');
    await clickAt(pb.create);
    const lob = await topIs('ScenePrivateLobby', 15000);
    await sleep(1500); await shot('32_party_lobby');
    check('Create opens the lobby (offline state without the service)', !!lob, lob ? `offline ${lob.offline}, code ${lob.code}` : '');
    if (lob && lob.config) {
      await clickAt(lob.config);
      const pc = await topIs('ScenePrivateConfiguration', 6000);
      if (pc) { await press('OnClickMode', 'ScenePrivateConfiguration'); await press('OnClickMap', 'ScenePrivateConfiguration'); await sleep(400); await shot('33_party_config'); await press('Close', 'ScenePrivateConfiguration'); }
      check('host customizes mode / arena', !!pc);
    }
    await press('OnClickBack', 'ScenePrivateLobby');
    await sleep(600);
    await press('OnClickJoin', 'ScenePrivateBattle');
    const pj = await topIs('ScenePrivateJoin', 6000);
    if (pj && pj.field) { await clickAt(pj.field); await page.keyboard.type('ABCD'); await page.keyboard.press('Enter'); await sleep(300); await shot('34_party_join'); await press('OnClickJoin', 'ScenePrivateJoin'); await sleep(1500); }
    check('Join a party with a 4-letter code', !!pj);
    if ((await top()).scene === 'ScenePrivateJoin') await press('OnClickBack', 'ScenePrivateJoin');
    if ((await top()).scene === 'ScenePrivateLobby') await press('OnClickBack', 'ScenePrivateLobby');
    await sleep(500);
    if ((await top()).scene === 'ScenePrivateBattle') await press('OnClickBack', 'ScenePrivateBattle');
    await sleep(500);

    // ---------------------------------------------------------------- leaderboard
    section = 'leaderboard';
    await press('OpenLeaderboard', 'SceneMenu');
    await sleep(800);
    const lb = await ev(() => { const s = window.fgApp.screens.find((q) => q.sceneName === 'Leaderboard'); return s ? s.debug() : null; });
    await shot('35_leaderboard');
    check('leaderboard: the player among the bot names', !!lb && lb.rank > 0 && lb.entries > 10, JSON.stringify(lb));
    if (lb) { await page.click('.fg-board .tabs [data-t="ach"]'); await sleep(300); await shot('36_achievements'); await page.click('.fg-board .x'); }

    // ---------------------------------------------------------------- reload keeps the profile
    section = 'reload';
    const before = await cur();
    await page.reload();
    const back2 = await until(() => window.fgDebug && window.fgDebug().screen === 'menu' && window.fgDebug().ui[0] && window.fgDebug().ui[0].scene === 'SceneMenu', 40000);
    await sleep(1500);
    const after = await cur();
    check('reload: straight to the menu with the same profile', !!back2 && after.name === before.name && after.trophies === before.trophies && after.coins === before.coins &&
      after.skinSelected === before.skinSelected && after.skins.length === before.skins.length, `${after.name} ${after.trophies} trophies, ${after.coins} coins, skin ${after.skinSelected}`);
    await shot('37_menu_after_reload');

    section = '';
    const d = await dbg();
    check('no console / page errors', errors.length === 0 && d.engine.errors.length === 0, [...errors, ...d.engine.errors].slice(0, 5).join(' | '));
    check('every sprite / clip / prefab resolved', !d.engine.spritesMissing.length && !d.engine.clipsMissing.length && !d.engine.prefabsMissing.length,
      [...d.engine.spritesMissing, ...d.engine.clipsMissing, ...d.engine.prefabsMissing].slice(0, 6).join(','));
  } catch (e) {
    check('test ran to the end', false, String(e && e.stack || e).slice(0, 400));
    await shot('zz_error').catch(() => {});
  } finally {
    clearTimeout(killer);
    await browser.close();
    if (srv) srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fails.length) console.log('failed:\n  ' + fails.join('\n  '));
  process.exit(fail ? 1 : 0);
})();
