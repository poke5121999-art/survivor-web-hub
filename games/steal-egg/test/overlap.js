// HUD overlap test: at 1280x720, 1920x1080, 2756x1268, 919x423@DPR3 and portrait 1268x2756 (stage turned 90 degrees)
// open each HUD state (place button, sell panel, upgrade panel, gate lock panel, revive panel) and check, with
// document.elementFromPoint at the centre of every visible button, that the button itself is hit and lies inside the
// stage. Under the revive panel (a full-screen modal) only its own buttons are checked. Screenshots: overlap-<size>-<state>.png.
//   node test/overlap.js
// Setup writes the sim state directly (an egg in hand, a brainrot on the farm, the player moved into a zone, the player
// dead): this test is about layout, the play test covers how the states are reached.
'use strict';
const { run, openPage } = require('./harness');

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
};

run('overlap', async ({ browser, base, shot, check }) => {
  for (const size of SIZES) {
    for (const [name, st] of Object.entries(STATES)) {
      const { ctx, page, errors } = await openPage(browser, `${base}/index.html?fresh&mute&seed=3`, { viewport: size.viewport, dpr: size.dpr });
      await page.evaluate(async src => { const f = (0, eval)(`(${src})`); await f(window.__game); window.__step(3, true); }, st.setup.toString());
      const res = await page.evaluate(({ panel, modal }) => {
        const g = window.__game, hud = g.view.hud, stage = g.stage;
        const up = el => el && el.checkVisibility();
        const panelEl = hud.node(panel);
        const scope = modal ? panelEl : document;
        const buttons = [...scope.querySelectorAll('.ugui-btn')].filter(up);
        const out = [];
        for (const el of buttons) {
          const p = el.dataset.path, r = hud.rect(p);
          const [cx, cy] = stage.rotated ? [window.innerWidth - r.cy, r.cx] : [r.cx, r.cy];
          const hit = document.elementFromPoint(cx, cy), own = hit && hit.closest('[data-path]');
          const inside = r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= stage.w + 0.5 && r.y + r.h <= stage.h + 0.5;
          out.push({ p: p.replace('Canvas/', ''), ok: own === el, got: own ? own.dataset.path.replace('Canvas/', '') : String(hit && hit.tagName), inside });
        }
        return { panelUp: up(panelEl), out };
      }, { panel: st.panel, modal: !!st.modal });
      const bad = res.out.filter(b => !b.ok || !b.inside);
      check(`[${size.name}] ${name}: panel up`, res.panelUp);
      check(`[${size.name}] ${name}: ${res.out.length} buttons hit at their centres, inside the stage`, res.out.length > 0 && !bad.length,
        bad.map(b => `${b.p} -> ${b.got}${b.inside ? '' : ' (outside)'}`).join('; '));
      check(`[${size.name}] ${name}: no console errors`, !errors.length, errors.slice(0, 2).join(' | '));
      await shot(page, `overlap-${size.name}-${name}.png`);
      await ctx.close();
    }
  }
});
