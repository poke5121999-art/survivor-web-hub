// Drop 2 panels through real input: CDP touch taps (and one touch drag) on the original HUD nodes, WASD to walk into
// the world shop areas.   node test/shop.js     (screenshots -> $SHOTS or ~/stealegg-ref/shots/shop-*.png)
// Covered: shop from the HUD button and from the world area, bat bought with coins, pedestal weapon unlocked with ads,
// cosmetic bought (ad) + equipped and shown on the rig, inventory pick, settings toggles persist over a reload, pause
// stops time, the ads-break panel pays 25 then 50 (and the health panel heals), everything survives a reload, and a
// save written by the Drop 1 build (test/fixtures/drop1-save.json) boots with the original defaults.
// Setup writes outside the input path: the player is placed 3 m from a target before walking in, rivals are frozen
// for the ads-break minutes, a brainrot is put in hand for the inventory, health is lowered for the health panel.
'use strict';
const fs = require('fs');
const path = require('path');
const { run, openPage } = require('./harness');

const KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'drop1-save.json'), 'utf8');

// Client centre of a HUD node (or any element with that data-path), scrolled into its scroll view first.
async function center(page, p) {
  return page.evaluate(p => {
    const hud = window.__game.view.hud;
    if (hud.index(p) >= 0) hud.scrollIntoView(p);
    const el = hud.node(p) || document.querySelector(`[data-path="${p}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, p);
}

async function tap(cdp, page, p) {
  const c = await center(page, p);
  if (!c) throw new Error(`no node ${p}`);
  const [x, y] = c;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 3, radiusX: 3, radiusY: 3, force: 1 }] });
  await page.waitForTimeout(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(60);
  await page.evaluate(() => window.__step(1, true));
}

async function drag(cdp, page, [x0, y0], [x1, y1], n = 8) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 4 }] });
  for (let i = 1; i <= n; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * i / n, id: 4 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(60);
}

// Hold the WASD keys closest to a world direction for the current camera yaw (input.worldDir), stepping the game.
async function walkInto(page, target, until, maxSec = 8) {
  const held = new Set();
  try {
    for (let t = 0; t < maxSec; t += 0.1) {
      const st = await page.evaluate(u => { const g = window.__game; return { p: g.sim.state.actors[0].pos, yaw: g.view.follow.x * Math.PI / 180, done: (0, eval)(u)(g) }; }, `(${until})`);
      if (st.done) return true;
      const a = Math.atan2(target[0] - st.p[0], -(target[2] - st.p[2])) - st.yaw, sx = Math.sin(a), sy = Math.cos(a);
      const next = new Set();
      if (sy > 0.38) next.add(KEYS.up);
      if (sy < -0.38) next.add(KEYS.down);
      if (sx > 0.38) next.add(KEYS.right);
      if (sx < -0.38) next.add(KEYS.left);
      for (const k of held) if (!next.has(k)) await page.keyboard.up(k);
      for (const k of next) if (!held.has(k)) await page.keyboard.down(k);
      held.clear(); next.forEach(k => held.add(k));
      await page.evaluate(() => window.__step(3, false));
    }
    return false;
  } finally { for (const k of held) await page.keyboard.up(k); }
}

// Put the player `d` metres from a point (on the navmesh) on side `k` (+x, -x, +z, -z).
const placeNear = (page, c, d = 3, k = 0) => page.evaluate(([c, d, k]) => {
  const g = window.__game, o = [[d, 0], [-d, 0], [0, d], [0, -d]][k], p = g.sim.nav.closest([c[0] + o[0], c[1], c[2] + o[1]]);
  g.sim.state.actors[0].pos = p; window.__step(1, true);
}, [c, d, k]);
// Walk into an area from whichever side is open (stall walls block some sides).
async function approach(page, c, until, d = 3) {
  for (let k = 0; k < 4; k++) {
    await placeNear(page, c, d, k);
    if (await walkInto(page, c, until)) return k;
  }
  return -1;
}

const S = (page, f, arg) => page.evaluate(f, arg);
const shown = (page, p) => S(page, p => { const el = window.__game.view.hud.node(p); return !!el && el.checkVisibility(); }, p);
const objShown = (page, p) => S(page, p => { let o = window.__game.view.world.node(p); if (!o) return null; for (; o; o = o.parent) if (!o.visible) return false; return true; }, p);
const freezeRivals = page => S(page, () => { const s = window.__game.sim.state; for (let a = 1; a < s.actors.length; a++) s.actors[a].brain.stun = { phase: 'down', t: -1e6 }; });

run('shop', async ({ browser, base, shot, check }) => {
  const url = `${base}/index.html?mute&seed=5`;
  // ---- A: a fresh game ------------------------------------------------------------------------------------------------
  const A = await openPage(browser, `${url}&fresh`, { viewport: { width: 1280, height: 720 } });
  const page = A.page, cdp = await A.ctx.newCDPSession(page);
  await S(page, () => window.__step(5, true));
  const D = await S(page, () => { const d = window.__game.sim.D; return { shops: d.zones.shops, ped: d.weapons.pedestals, bat: d.weapons.batShop, items: d.weapons.shopItems, plans: d.speedPlans }; });

  // shop from the HUD button: ShopPanle + the player camera; cross closes
  await tap(cdp, page, 'InGame/ShopButton');
  const cam = await S(page, () => { const g = window.__game, n = g.view.world.node('Player1/Camera'); n.updateWorldMatrix(true, false);
    const p = n.getWorldPosition(new n.position.constructor()); return p.distanceTo(g.view.camera.position); });
  check('HUD ShopButton opens the shop (ShopPanle) and the player camera', await shown(page, 'ShopPanle') && cam < 0.01, `camera ${cam.toFixed(3)} m from Player1/Camera`);
  await shot(page, 'shop-hud-open.png');
  // cosmetic: Item1 (shop "Button", headset) is locked -> one tap (ad) unlocks, the next tap wears it
  const item1 = D.items.find(d => d.key === 'Item1' && d.ui.startsWith('Canvas/ShopPanle'));
  const headset = item1.active.find(p => p.startsWith('Player1/'));
  const lockIcon1 = await shown(page, `${item1.ui}/Image`);
  const coins0 = await S(page, () => window.__game.sim.state.coins);
  await tap(cdp, page, item1.ui);
  const afterUnlock = await S(page, () => window.__game.sim.state.upgrades.cosmetics);
  check('cosmetic: ad button unlocks at once, no coins charged, video icon gone', lockIcon1 && afterUnlock.unlocked.Item1 === 1
    && !(await shown(page, `${item1.ui}/Image`)) && (await S(page, () => window.__game.sim.state.coins)) === coins0);
  check('cosmetic not worn before it is picked', (await objShown(page, headset)) === false);
  await tap(cdp, page, item1.ui);
  check('cosmetic picked: shown on the player rig', (await S(page, () => window.__game.sim.state.upgrades.cosmetics.picked.Item1)) === true
    && (await objShown(page, headset)) === true, headset.split('/').slice(-1)[0]);
  await page.waitForTimeout(300);
  await shot(page, 'shop-cosmetic-on.png');
  // scroll the grid with a real drag
  const grid = 'ShopPanle/Image/Scroll View (1)/Viewport/Content';
  const vp = await S(page, () => { const r = window.__game.view.hud.node('ShopPanle/Image/Scroll View (1)/Viewport').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await drag(cdp, page, [vp[0], vp[1] + 120], [vp[0], vp[1] - 120]);
  const off = await S(page, g => window.__game.view.hud.scrolls.get(window.__game.view.hud.index(g)).off, grid);
  check('shop grid scrolls with a drag', off > 50, `${off.toFixed(0)} canvas units`);
  await tap(cdp, page, 'ShopPanle/Image/CrossBtn');
  check('cross closes the shop and gives the main camera back', !(await shown(page, 'ShopPanle')));

  // world area: walk into the bat shop's EnableShop area -> Bat shop panel slides in
  const inBat = (await approach(page, D.shops.bat.c, g => g.sim.state.ui.shop === 'bat')) >= 0;
  await S(page, () => window.__step(20, true));
  const batY = await S(page, () => { const r = window.__game.view.hud.node('Bat shop').getBoundingClientRect(); return [r.y, r.height, window.innerHeight]; });
  check('walking into the bat area opens the Bat shop panel on screen', inBat && await shown(page, 'Bat shop') && batY[0] >= 0 && batY[0] + batY[1] <= batY[2] + 1,
    `top ${batY[0].toFixed(0)} h ${batY[1].toFixed(0)}`);
  await shot(page, 'shop-bat-area.png');
  // buy the axe (1000) with coins: charged, equipped, axe in hand, axe pedestal hidden
  const axe = D.bat.findIndex(b => b.weapon === 1);
  const c1 = await S(page, () => window.__game.sim.state.coins);
  await tap(cdp, page, D.bat[axe].btn);
  const w1 = await S(page, () => { const g = window.__game, u = g.sim.state.upgrades.weapons, hw = g.view.world.handWeapons('Player1');
    return { coins: g.sim.state.coins, eq: u.equipped, hand: hw.map(o => !!o && o.visible), env: g.view.world.envWeapons('Player1').map(o => !!o && o.visible) }; });
  check('bat shop: axe bought with coins (1000), in hand, its pedestal hidden', w1.coins === c1 - D.bat[axe].cost && w1.eq === 1
    && w1.hand.indexOf(true) === 1 && w1.hand.filter(Boolean).length === 1 && w1.env[1] === false, `coins ${c1} -> ${w1.coins}`);
  // the video button gives the bat for free (owner rule: no charge after an ad)
  const batI = D.bat.findIndex(b => b.weapon === 0);
  await tap(cdp, page, D.bat[batI].video);
  const w2 = await S(page, () => ({ coins: window.__game.sim.state.coins, eq: window.__game.sim.state.upgrades.weapons.equipped }));
  check('bat shop: video button equips the bat, no coins charged', w2.eq === 0 && w2.coins === w1.coins);
  await tap(cdp, page, 'Bat shop/Button');
  check('bat shop cross closes it while still in the area', !(await shown(page, 'Bat shop')));
  // shoes shop area: the speed plans panel
  const inShoes = (await approach(page, D.shops.shoes.c, g => g.sim.state.ui.shop === 'shoes')) >= 0;
  await S(page, () => window.__step(20, true));
  check('walking into the shoes area opens the speed plans (shoes shop)', inShoes && await shown(page, 'shoes shop'));
  await shot(page, 'shop-shoes-area.png');
  await tap(cdp, page, `${D.plans[0].ui}/Button (1)`);
  check('shoes shop: video button grants plan 1 (speed 10) free', await S(page, () => { const s = window.__game.sim.state; return s.upgrades.speedPlans[1] === true && s.actors[0].moveSpeed === 10; }));

  // pedestal: Spear (2 ads) unlocked with ads, then picked
  const sp = D.ped.findIndex(p => p.name === 'Spear');
  const atSpear = (await approach(page, D.ped[sp].trigger.c, `g => g.sim.state.ui.pedestal === ${sp}`, 2.5)) >= 0;
  check('walking to the Spear pedestal shows its Unlock button', atSpear && await shown(page, D.ped[sp].ui.unlock));
  await tap(cdp, page, D.ped[sp].ui.unlock);
  check('Unlock opens the weapon panel (500 coins / 0/2 ads)', await shown(page, D.ped[sp].ui.panel), await S(page, p => window.__game.view.hud.node(p).textContent, D.ped[sp].ui.ad.replace('Canvas/', '')));
  await shot(page, 'shop-pedestal-panel.png');
  const c3 = await S(page, () => window.__game.sim.state.coins);
  await tap(cdp, page, D.ped[sp].ui.ad);
  const one = await S(page, k => window.__game.sim.state.upgrades.weapons.unlocked[k] || 0, D.ped[sp].key);
  await tap(cdp, page, D.ped[sp].ui.ad);
  const ped = await S(page, d => { const w = window.__game.sim.state.upgrades.weapons; return { u: w.unlocked[d.key], ads: w.ads[d.adsKey], coins: window.__game.sim.state.coins }; }, D.ped[sp]);
  check('pedestal: 2 ad taps unlock the Spear (1 tap is not enough), no coins charged', one === 0 && ped.u === 1 && ped.ads === 2 && ped.coins === c3);
  check('pedestal: panel closes, Pick button shows', !(await shown(page, D.ped[sp].ui.panel)) && await shown(page, D.ped[sp].ui.pick));
  await tap(cdp, page, D.ped[sp].ui.pick);
  const w3 = await S(page, () => { const g = window.__game; return { eq: g.sim.state.upgrades.weapons.equipped, hand: g.view.world.handWeapons('Player1').map(o => !!o && o.visible) }; });
  check('Pick equips the Spear: in the player\'s hand', w3.eq === 2 && w3.hand.indexOf(true) === 2 && w3.hand.filter(Boolean).length === 1);
  await shot(page, 'shop-spear-in-hand.png');

  // inventory: a brainrot in hand gets a SeedBtn; a tap stows it, the next tap takes it out again
  const id = await S(page, async () => {
    const g = window.__game, { newBrainrot, carryBrainrot } = await import('./js/sim/items.js');
    const id = newBrainrot(g.sim, g.sim.D.brainrots[2].seed, { ground: g.sim.state.actors[0].pos.slice() });
    carryBrainrot(g.sim, 0, id); window.__step(2, true); return id;
  });
  const btn = `Canvas/InGame/Inventory/SeedBtn/${id}`;
  check('inventory: the carried brainrot has a button (selected)', await S(page, b => { const e = document.querySelector(`[data-path="${b}"]`); return !!e && e.checkVisibility() && e.classList.contains('seed-selected'); }, btn));
  await shot(page, 'shop-inventory.png');
  await tap(cdp, page, btn);
  const st1 = await S(page, i => window.__game.sim.state.items[i].at, id);
  await tap(cdp, page, btn);
  const st2 = await S(page, i => window.__game.sim.state.items[i].at, id);
  check('inventory: tap stows it, tap again picks it back into the hands', st1.stowed === 0 && st2.carried === 0, `${JSON.stringify(st1)} -> ${JSON.stringify(st2)}`);

  // settings: toggles + sensitivity, saved
  await tap(cdp, page, 'InGame/TopPanel/Setting');
  check('Setting button opens Settings and pauses', await shown(page, 'Setting') && await S(page, () => window.__game.paused === true));
  await shot(page, 'shop-settings.png');
  await tap(cdp, page, 'Setting/Panel/Panel/Sound/sound');
  await tap(cdp, page, 'Setting/Panel/Panel/Music/sound');
  const sl = await S(page, () => { const r = window.__game.view.hud.node('Setting/Panel/Panel/Sensitvity/Slider').getBoundingClientRect(); return [r.x + r.width * 0.35, r.y + r.height / 2]; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sl[0], y: sl[1], id: 5 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(60);
  const set1 = await S(page, () => ({ ...window.__game.sim.state.settings, snd: window.__game.gv.sound.settings }));
  check('Settings: sound and music off (cross icons), sensitivity from the slider', set1.sound === false && set1.music === false && set1.sensitivity === 3
    && set1.snd.sound === false && set1.snd.music === false && await shown(page, 'Setting/Panel/Panel/Sound/sound/Image (1)'), JSON.stringify(set1));
  await tap(cdp, page, 'Setting/Panel/Save');
  check('Save closes Settings, resumes, camera sensitivity applied', !(await shown(page, 'Setting')) && await S(page, () => !window.__game.paused && window.__game.view.follow.rotationSpeed === 3));

  // pause stops time
  await tap(cdp, page, 'InGame/TopPanel/Pause');
  const tp0 = await S(page, () => window.__game.sim.state.t);
  await S(page, () => window.__step(90, true));
  const tp1 = await S(page, () => window.__game.sim.state.t);
  check('Pause panel up and time stopped', await shown(page, 'PauseGame') && tp1 === tp0, `t ${tp0.toFixed(2)} -> ${tp1.toFixed(2)}`);
  await shot(page, 'shop-pause.png');
  await tap(cdp, page, 'PauseGame/Panel/Resume');
  await S(page, () => window.__step(30, false));
  check('Resume: time runs again', !(await shown(page, 'PauseGame')) && (await S(page, () => window.__game.sim.state.t)) > tp1 + 0.9);

  // ads break: chip counts down from 60 s (AdsBrakeTime), the coin panel pays 25 then 50, the health panel heals
  await freezeRivals(page);
  const chip0 = await S(page, () => window.__game.sim.state.adsBreak.left);
  await S(page, n => window.__step(n, true), Math.round((chip0 - 15) * 30));
  const chipText = await S(page, () => window.__game.view.hud.node('InGame/TopPanel/Add in/Text (TMP) (1)').textContent);
  check('ads-break chip counts down mm:ss', chipText === '00:15', chipText);
  await S(page, () => window.__step(15 * 30, true));
  check('ads break at 0: the coin panel shows', await shown(page, 'ads panel') && !(await shown(page, 'ads panel (1)')));
  await page.waitForTimeout(300);
  await shot(page, 'shop-adsbreak-coins.png');
  const a0 = await S(page, () => window.__game.sim.state.coins);
  await tap(cdp, page, 'ads panel/Panel/bottem/Ads');
  const a1 = await S(page, () => window.__game.sim.state.coins);
  await S(page, () => window.__step(60 * 30, true));
  await tap(cdp, page, 'ads panel/Panel/bottem/Ads');
  const a2 = await S(page, () => window.__game.sim.state.coins);
  check('ads panel pays 25, then 50', a1 - a0 === 25 && a2 - a1 === 50, `+${a1 - a0}, +${a2 - a1}`);
  await S(page, () => window.__step(60 * 30, false));               // 3rd break: coin panel again (flag), left open
  await S(page, () => { window.__game.sim.state.actors[0].hp = 2; window.__step(60 * 30, true); });
  check('4th break with the player hurt: the health panel shows instead', await shown(page, 'ads panel (1)') && !(await shown(page, 'ads panel')));
  await shot(page, 'shop-adsbreak-health.png');
  await tap(cdp, page, 'ads panel (1)/Panel/bottem/Ads');
  check('health panel: full health at once', await S(page, () => window.__game.sim.state.actors[0].hp === window.__game.sim.D.player.hp) && !(await shown(page, 'ads panel (1)')));
  // the coin counter's green plus: +100 at once (coins.WatchAds)
  const g0 = await S(page, () => window.__game.sim.state.coins);
  await tap(cdp, page, 'InGame/TopPanel/Coins');
  check('coin counter plus: +100 at once', (await S(page, () => window.__game.sim.state.coins)) === g0 + 100);
  check('no console errors (fresh game)', !A.errors.length, A.errors.slice(0, 3).join(' | '));

  // ---- B: reload: everything bought and chosen is still there -----------------------------------------------------------
  await S(page, () => window.__game.writeSave());
  await page.goto(url);
  await page.waitForFunction(() => window.__game && window.__game.ready && window.__game.blur === 0, null, { timeout: 180000 });
  await S(page, () => window.__step(2, true));
  const r = await S(page, () => { const g = window.__game, s = g.sim.state; return { u: s.upgrades, set: s.settings, speed: s.actors[0].moveSpeed,
    hand: g.view.world.handWeapons('Player1').map(o => !!o && o.visible), snd: g.gv.sound.settings, rot: g.view.follow.rotationSpeed, ads: s.adsBreak.left }; });
  check('reload: weapon (Spear) equipped and in hand, spear pedestal unlocked, ad counters kept', r.u.weapons.equipped === 2 && r.hand.indexOf(true) === 2
    && r.u.weapons.unlocked.unlockItem3 === 1 && r.u.weapons.ads.AdsWatchedCount3 === 2);
  check('reload: cosmetic still unlocked, worn and shown', r.u.cosmetics.unlocked.Item1 === 1 && r.u.cosmetics.picked.Item1 === true && (await objShown(page, headset)) === true);
  check('reload: speed plan kept', r.u.speedPlans[1] === true && r.speed === 10);
  check('reload: settings kept (sound off, music off, sensitivity 3) and applied', r.set.sound === false && r.set.music === false && r.set.sensitivity === 3
    && r.snd.sound === false && r.snd.music === false && r.rot === 3);
  await tap(cdp, page, 'InGame/TopPanel/Setting');
  check('reload: Settings shows the crosses on both toggles', await shown(page, 'Setting/Panel/Panel/Sound/sound/Image (1)') && await shown(page, 'Setting/Panel/Panel/Music/sound/Image (1)'));
  await tap(cdp, page, 'Setting/Panel/Save');
  check('reload: the ads-break countdown restarts at 60 s with the scene', r.ads === 60, r.ads);
  await shot(page, 'shop-reloaded.png');
  await A.ctx.close();

  // ---- C: a save written by the Drop 1 build boots with the original defaults ------------------------------------------
  const fx = JSON.parse(FIXTURE);
  const C = await openPage(browser, url, { viewport: { width: 1280, height: 720 },
    init: { fn: s => { if (!sessionStorage.getItem('injected')) { localStorage.setItem('steal-egg-v1', s); sessionStorage.setItem('injected', '1'); } }, arg: FIXTURE } });
  await C.page.evaluate(() => window.__step(2, true));
  const m = await C.page.evaluate(() => { const g = window.__game, s = g.sim.state; return { coins: s.coins, set: s.settings, u: s.upgrades, ads: s.adsBreak,
    stowed: Object.values(s.items).filter(i => i.kind === 'brainrot' && i.at.stowed === 0).length, hand: g.view.world.handWeapons('Player1').map(o => !!o && o.visible),
    inv: document.querySelectorAll('.seed-btn').length, chip: g.view.hud.node('InGame/TopPanel/Add in/Text (TMP) (1)').textContent }; });
  check('Drop 1 save: fixture is a Drop 1 save (vibration key, no adsBreak, no weapons.changed)', fx.settings.vibration === true && !fx.adsBreak && fx.upgrades.weapons.changed === undefined);
  check('Drop 1 save: coins, unlocks, ad counters, speed plan and stowed brainrot kept', m.coins === fx.coins && m.u.weapons.unlocked.unlockItem3 === 1
    && m.u.weapons.ads.AdsWatchedCount2 === 1 && m.u.speedPlans[1] === true && m.stowed === 1 && m.inv === 1, `coins ${m.coins}, inventory buttons ${m.inv}`);
  check('Drop 1 save: new fields get the original defaults (sound 1, music 1, sensitivity 10, no vibration, bat, nothing worn)',
    m.set.sound === true && m.set.music === true && m.set.sensitivity === 10 && !('vibration' in m.set) && m.u.weapons.equipped === 0
    && m.u.weapons.changed === false && Object.keys(m.u.cosmetics.picked).length === 0 && m.hand.indexOf(true) === 0, JSON.stringify(m.set));
  check('Drop 1 save: ads break starts at 60 s, coin panel first, reward counter 0', m.ads.left === 60 && m.ads.interstitialNext === true && m.ads.reward === 0 && m.ads.panel === null
    && m.chip === '01:00', m.chip);
  check('no console errors (Drop 1 save)', !C.errors.length, C.errors.slice(0, 3).join(' | '));
  await shot(C.page, 'shop-drop1-save.png');
  await C.ctx.close();
});
