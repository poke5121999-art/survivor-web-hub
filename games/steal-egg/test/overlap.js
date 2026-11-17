// HUD overlap test: at 1280x720, 1920x1080, 2756x1268, 919x423@DPR3 and portrait 1268x2756 (stage turned 90 degrees)
// open each HUD state (place button, sell panel, upgrade panel, gate lock panel, revive panel, and the Drop 2 panels:
// shop, bat shop, shoes shop, pedestal unlock / panel / pick, inventory, settings, pause, ads break coins / health) and check, with
// document.elementFromPoint at the centre of every visible button, that the button itself is hit and lies inside the
// stage. Under the revive panel (a full-screen modal) only its own buttons are checked. Screenshots: overlap-<size>-<state>.png.
//   node test/overlap.js
// Setup writes the sim state directly (an egg in hand, a brainrot on the farm, the player moved into a zone, the player
// dead): this test is about layout, the play test covers how the states are reached.
'use strict';
const { run, openPage, pixel } = require('./harness');

const SIZES = [
  { name: '1280x720', viewport: { width: 1280, height: 720 }, dpr: 1 },
  { name: '1920x1080', viewport: { width: 1920, height: 1080 }, dpr: 1 },
  { name: '2756x1268', viewport: { width: 2756, height: 1268 }, dpr: 1 },
  { name: '919x423@3', viewport: { width: 919, height: 423 }, dpr: 3 },
  { name: '1268x2756-portrait', viewport: { width: 1268, height: 2756 }, dpr: 1 },
];

// Each state: setup (in page, gets the game), the HUD panel that must be up, and whether it is modal.
const STATES = {
  place: { panel: 'PanelsAndButtons/place btn', setup: async g => {
    const { pickEgg } = await import('./js/sim/items.js');
    const s = g.sim.state, id = Object.keys(s.items).find(k => s.items[k].kind === 'egg' && s.items[k].at.nest != null);
    pickEgg(g.sim, 0, id);
    const F = g.sim.D.farm.area.c;
    s.actors[0].pos = g.sim.nav.closest([F[0] + 1, F[1], F[2]]);
  } },
  sell: { panel: 'PanelsAndButtons/SellPanle', setup: async g => {
    const { newBrainrot } = await import('./js/sim/items.js');
    const s = g.sim.state, F = g.sim.D.farm.area.c, p = g.sim.nav.closest([F[0] - 2, F[1], F[2] + 2]);
    newBrainrot(g.sim, g.sim.D.brainrots[0].seed, { farm: 0, pos: p });
    s.actors[0].pos = [p[0] + 0.4, p[1], p[2]];
  } },
  upgrade: { panel: 'PanelsAndButtons/UPGRADE BUTTON', setup: async g => { g.sim.state.actors[0].pos = g.sim.nav.closest(g.sim.D.farm.upgradeZone.c); } },
  // the player gate is closed for its first 1.0 s (initialClosedTime)
  gateLock: { panel: 'PanelsAndButtons/lockUnlockPlayerHouse', setup: async g => { window.__step(45, false); g.sim.state.actors[0].pos = g.sim.nav.closest(g.sim.D.gates.player.trigger.c); } },
  revive: { panel: 'InGame/Fadepanel', modal: true, setup: async g => {
    const p = g.sim.state.actors[0];
    p.hp = 0; p.combat = { state: 'dead', t: 0, dir: [0, 0] };
  } },
  // Drop 2 panels (opened the way the original opens them; buttons of the panel are checked, scrolled-out ones skipped)
  shop: { panel: 'ShopPanle', modal: true, setup: async g => { g.gv.panels.openShop(true); } },
  batShop: { panel: 'Bat shop', modal: true, setup: async g => { g.sim.state.actors[0].pos = g.sim.nav.closest(g.sim.D.zones.shops.bat.c); window.__step(25, true); } },
  shoesShop: { panel: 'shoes shop', modal: true, setup: async g => { g.sim.state.actors[0].pos = g.sim.nav.closest(g.sim.D.zones.shops.shoes.c); window.__step(25, true); } },
  pedestal: { panel: 'PanelsAndButtons/unlockWaponPanels3/Unlockbtn2', setup: async g => { g.sim.state.actors[0].pos = g.sim.nav.closest(g.sim.D.weapons.pedestals[2].trigger.c); } },
  pedestalPanel: { panel: 'PanelsAndButtons/unlockWaponPanels3/WeponUnlockPanel3', modal: true, setup: async g => {
    g.sim.state.actors[0].pos = g.sim.nav.closest(g.sim.D.weapons.pedestals[2].trigger.c); window.__step(2, true); g.gv.panels.pedestalPanel = 2; } },
  pedestalPick: { panel: 'PanelsAndButtons/unlockWaponPanels3/PickButton1', setup: async g => {
    g.sim.state.upgrades.weapons.unlocked.unlockItem3 = 1; g.sim.state.actors[0].pos = g.sim.nav.closest(g.sim.D.weapons.pedestals[2].trigger.c); } },
  inventory: { panel: 'InGame/Inventory', setup: async g => {
    const { newBrainrot, carryBrainrot } = await import('./js/sim/items.js');
    for (let k = 0; k < 3; k++) newBrainrot(g.sim, g.sim.D.brainrots[k].seed, { stowed: 0 });
    carryBrainrot(g.sim, 0, newBrainrot(g.sim, g.sim.D.brainrots[5].seed, { ground: g.sim.state.actors[0].pos.slice() }));
  } },
  settings: { panel: 'Setting', modal: true, setup: async g => { g.gv.panels.pause('setting'); } },
  pause: { panel: 'PauseGame', modal: true, setup: async g => { g.gv.panels.pause('pause'); } },
  adsCoins: { panel: 'ads panel', modal: true, setup: async g => { window.__step(60 * 30, false); } },
  adsHealth: { panel: 'ads panel (1)', modal: true, setup: async g => {
    const b = g.sim.state.adsBreak; b.interstitialNext = false; g.sim.state.actors[0].hp = 2; b.left = 1; window.__step(31, false); } },
};

// ONLY=instruction runs just the instruction panel checks.
run('overlap', async ({ browser, base, shot, check }) => {
  for (const size of process.env.ONLY === 'instruction' ? [] : SIZES) {
    for (const [name, st] of Object.entries(STATES)) {
      const { ctx, page, errors } = await openPage(browser, `${base}/index.html?fresh&mute&seed=3`, { viewport: size.viewport, dpr: size.dpr });
      await page.evaluate(async src => { const f = (0, eval)(`(${src})`); await f(window.__game); window.__step(3, true); }, st.setup.toString());
      await page.waitForTimeout(150);
      const res = await page.evaluate(({ panel, modal }) => {
        const g = window.__game, hud = g.view.hud, stage = g.stage;
        const up = el => el && el.checkVisibility();
        const panelEl = hud.node(panel);
        const scope = modal ? panelEl : document;
        const buttons = [...scope.querySelectorAll('.ugui-btn')].filter(up);
        const out = [];
        let clipped = 0;
        for (const el of buttons) {
          const p = el.dataset.path, r = el.getBoundingClientRect();
          const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
          // inside a masked scroll viewport but scrolled out of it: not visible, not checked
          let m = el.parentElement, hidden = false;
          for (; m && m !== document.body; m = m.parentElement) {
            if (m.style.overflow === 'hidden') { const q = m.getBoundingClientRect(); if (cx < q.left || cx > q.right || cy < q.top || cy > q.bottom) hidden = true; }
          }
          if (hidden) { clipped++; continue; }
          const hit = document.elementFromPoint(cx, cy), own = hit && hit.closest('[data-path]');
          const inside = r.left >= -0.5 && r.top >= -0.5 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5;
          out.push({ p: p.replace('Canvas/', ''), ok: own === el, got: own ? own.dataset.path.replace('Canvas/', '') : String(hit && hit.tagName), inside });
        }
        // every drawn image of the panel has its sprite (or flat colour) set: no empty backdrop (tinted sprites are async)
        const unpainted = [...(panelEl ? [panelEl, ...panelEl.querySelectorAll('.ugui')] : [])].filter(up).map(el => [el, el.querySelector(':scope > .ugui-img')])
          .filter(([el, L]) => L && getComputedStyle(L).opacity !== '0').filter(([el, L]) => { const cs = getComputedStyle(L);
            return cs.backgroundImage === 'none' && cs.borderImageSource === 'none' && cs.backgroundColor === 'rgba(0, 0, 0, 0)'; })
          .map(([el]) => el.dataset.path.replace('Canvas/', ''));
        return { panelUp: up(panelEl), out, clipped, unpainted };
      }, { panel: st.panel, modal: !!st.modal });
      const bad = res.out.filter(b => !b.ok || !b.inside);
      check(`[${size.name}] ${name}: panel up`, res.panelUp);
      check(`[${size.name}] ${name}: every image of the panel painted`, !res.unpainted.length, res.unpainted.slice(0, 4).join('; '));
      check(`[${size.name}] ${name}: ${res.out.length} buttons hit at their centres, inside the stage${res.clipped ? ` (${res.clipped} scrolled out)` : ''}`, res.out.length > 0 && !bad.length,
        bad.map(b => `${b.p} -> ${b.got}${b.inside ? '' : ' (outside)'}`).join('; '));
      check(`[${size.name}] ${name}: no console errors`, !errors.length, errors.slice(0, 2).join(' | '));
      await shot(page, `overlap-${size.name}-${name}.png`);
      await ctx.close();
    }
  }

  // Tutorial mission panel (Canvas/instruction panel, sprite "panel"): its orange sprite must be painted the moment the
  // panel appears with its text, also when sprites arrive late (cold load on Pages): every sprite request is delayed
  // 1.5 s. The live hub build showed the text with no panel at 1280x720.
  for (const size of SIZES.filter(z => ['1280x720', '919x423@3'].includes(z.name))) {
    for (const slow of [false, true]) {
      const before = slow ? ctx => ctx.route('**/art/ui/sprites/**', r => setTimeout(() => r.continue().catch(() => {}), 1500)) : null;
      const { ctx, page, errors } = await openPage(browser, `${base}/index.html?fresh&mute&seed=3`, { viewport: size.viewport, dpr: size.dpr, before });
      await page.evaluate(() => window.__step(75, true));   // tutorial start delay 2.0 s, then the first instruction
      const res = await page.evaluate(async () => {
        const g = window.__game, hud = g.view.hud, el = hud.node('instruction panel'), layer = el.querySelector(':scope > .ugui-img');
        const m = /url\("?([^")]+)"?\)/.exec(getComputedStyle(layer).backgroundImage), r = hud.rect('instruction panel');
        const img = new Image();
        if (m) img.src = m[1];
        const cached = !!m && img.complete && img.naturalWidth > 0;      // already decoded in the memory cache = painted now
        const [x, y] = g.stage.rotated ? [window.innerWidth - (r.y + r.h * 0.35), r.x + r.w * 0.12] : [r.x + r.w * 0.12, r.y + r.h * 0.35];
        return { shown: el.checkVisibility(), text: hud.node('instruction panel/Text (TMP)').textContent, url: m && m[1], cached, x, y };
      });
      const px = await pixel(page, res.x, res.y);
      const orange = px[0] > 200 && px[1] > 120 && px[1] < 225 && px[2] < 120;
      const tag = `[${size.name}${slow ? ' slow sprites' : ''}] instruction panel`;
      check(`${tag}: shown with its text`, res.shown && res.text.length > 0, res.text);
      check(`${tag}: sprite loaded when the panel appears`, res.cached, res.url);
      check(`${tag}: orange panel pixel under the text`, orange, `rgb ${px.join(',')}`);
      check(`${tag}: no console errors`, !errors.length, errors.slice(0, 2).join(' | '));
      await shot(page, `overlap-${size.name}-instruction${slow ? '-slow' : ''}.png`);
      await ctx.close();
    }
  }
});
