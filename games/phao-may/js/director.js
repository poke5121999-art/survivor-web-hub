// Match presentation flow: where the camera looks in each phase, hit-stop on impacts, slow motion at the end.
(function () {
  'use strict';
  const PM = globalThis.PM;
  PM.Director = function (G) {
    const sim = G.sim, rig = G.rig;
    let hold = 0, stop = 0, lastImpact = null;
    const view = { turn: 44, flight: 66 };
    G.bus.on('sim:turn', (ev) => { hold = Math.min(hold, 0.25); });
    G.bus.on('sim:boom', (ev) => { lastImpact = { x: ev.x, y: ev.y }; hold = 1.1; stop = Math.max(stop, 0.07 + ev.radius * 0.012); });
    G.bus.on('sim:beam', (ev) => { lastImpact = { x: (ev.x0 + ev.x1) / 2, y: (ev.y0 + ev.y1) / 2 }; hold = 1.2; });
    G.bus.on('sim:die', (ev) => { lastImpact = { x: ev.x, y: ev.y }; hold = 1.6; stop = Math.max(stop, 0.16); });
    G.bus.on('sim:tele', (ev) => { lastImpact = { x: ev.x, y: ev.y }; hold = 0.9; });
    return {
      view,
      update(dt) {
        stop = Math.max(0, stop - dt);
        const over = sim.phase === 'over';
        G.simSpeed = stop > 0 ? 0.08 : over ? 0.35 : (G.speedMul || 1);
        hold -= dt;
        if (rig.manual > 0) return;
        if (sim.phase === 'flight' && sim.projs.length) {
          let x = 0, y = 0;
          for (const p of sim.projs) { x += p.x; y += p.y; }
          x /= sim.projs.length; y /= sim.projs.length;
          const p0 = sim.projs[0];
          rig.focus(x + PM.clamp(p0.vx * 0.22, -9, 9), Math.min(y + PM.clamp(p0.vy * 0.1, -4, 4), G.map.h + 10), view.flight + Math.max(0, y - 70) * 0.7);
        } else if (hold > 0 && lastImpact) rig.focus(lastImpact.x, lastImpact.y + 2, view.flight - 8);
        else if (sim.phase === 'turn' || sim.phase === 'settle') { const a = sim.active; if (a.alive) rig.focus(a.x + a.facing * 5, a.y + 4.5, view.turn); }
        else if (over) { const w = sim.units.find((u) => u.alive); if (w) rig.focus(w.x, w.y + 4, 50); }
      },
      dispose() {}
    };
  };
})();
