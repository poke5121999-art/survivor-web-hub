// Floors check (js/floors.js, new design): in house 3 of every theme, shoot a stair from below and from above, the
// biggest basement room and the biggest upper room, with the HUD hidden (minimap kept), and gate the frame mean luma of
// the room shots at 30-55 (owner: a night house) and every shot at >= 5 (not black). Also checks the minimap shows the
// current floor (dot stack) on each floor. Exit 1 on any failure.
// Usage: node tools/floors.js [--out <dir>] [--themes vampire,pyramid]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : scratch('floors'); })();
const THEMES = (() => { const i = argv.indexOf('--themes'); return i >= 0 ? argv[i + 1].split(',') : ['vampire', 'pyramid', 'vietnam', 'spacestation', 'asylum']; })();
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 300) : ''}`); };
const BAND = [30, 55];
const LUMA = (b64) => `(async () => { const img = new Image(); img.src = 'data:image/png;base64,${b64}'; await img.decode(); const g = document.createElement('canvas'); g.width = 160; g.height = 90; const x = g.getContext('2d'); x.drawImage(img, 0, 0, 160, 90); const d = x.getImageData(0, 0, 160, 90).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return +(s / (d.length / 4)).toFixed(1); })()`;
// stand at (x, z) on the floor there, look at (lx, ly, lz)
const PUT = (x, z, lx, lz, ly) => `(() => { const G = __G, P = G.player, h = G.house.heightAt(${x}, ${z}); P.body.setTranslation({ x: ${x}, y: h + 0.85, z: ${z} }, true); P.body.setNextKinematicTranslation({ x: ${x}, y: h + 0.85, z: ${z} });
  P.yaw = Math.atan2(-(${lx} - ${x}), -(${lz} - ${z})); P.pitch = Math.atan2(${ly} - (h + 1.2), Math.hypot(${lx} - ${x}, ${lz} - ${z})); __sim(0.4); return h; })()`;
// the longest open line of sight in the two biggest rooms of a floor (not stair rooms)
const ROOM = (lv) => `(() => { const G = __G, L = G.house.layout, nav = G.foes.nav; const sr = new Set(L.stairs.map((s) => s.room));
  const rooms = L.rooms.filter((r) => r.floor === ${lv} && !sr.has(r.id) && r.kind !== 'corridor').sort((a, b) => b.w * b.h - a.w * a.h);
  let best = 0, at = null, look = null;
  for (const r of rooms.slice(0, 2)) { const cells = []; for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) { const i = y * nav.W + x; if (nav.walk[i] && nav.near[i] >= 2) cells.push({ x: x + 0.5, z: y + 0.5 }); }
    for (let a = 0; a < cells.length; a += 2) for (let b = cells.length - 1; b > a; b -= 3) { const d = Math.hypot(cells[a].x - cells[b].x, cells[a].z - cells[b].z); if (d > best && nav.clear(cells[a].x, cells[a].z, cells[b].x, cells[b].z, 0.7)) { best = d; at = cells[a]; look = cells[b]; } } }
  return { at, look, d: best }; })()`;

async function open(br, srv, q) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
  const page = await ctx.newPage(); const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(srv.base + '/games/repo3d/index.html?' + q);
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
  return { ctx, page, logs };
}

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 420 s'); process.exit(2); }, 420000);
  try {
    for (const theme of THEMES) {
      const { ctx, page, logs } = await open(br, srv, `house=3&seed=7&foes=none&bots=0&flicker=0&traps=0&theme=${theme}`);
      await page.evaluate(`window.__paused = true; document.querySelectorAll('.ui-root .hud, .hx .pips, .hx .pads').forEach((e) => e.style.visibility = 'hidden')`);
      const shot = async (name) => { const f = path.join(OUT, `floors-${theme}-${name}.png`); const b = await page.screenshot({ path: f }); return { f, luma: await page.evaluate(LUMA(b.toString('base64'))) }; };
      // stairs: the first one, from the door side looking along the ramp, and from past the top looking back down
      const st = await page.evaluate(`(() => { const s = __G.house.layout.stairs[0]; __G.house.unjam(s.door.x0 + s.door.zw / 2, s.door.y0 + s.door.zh / 2, 0.5); return { axis: s.axis, sgn: s.sgn, e0: s.e0, x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, hD: s.hD, hS: s.hS }; })()`);
      const mid = st.axis === 0 ? (st.y0 + st.y1) / 2 : (st.x0 + st.x1) / 2, P = (u) => (st.axis === 0 ? [u, mid] : [mid, u]);
      await page.evaluate(PUT(...P(st.e0 - st.sgn * 2), ...P(st.e0 + st.sgn * 6), st.hS + 0.8));
      const s1 = await shot('stair-from-door');
      await page.evaluate(PUT(...P(st.e0 + st.sgn * 8), ...P(st.e0 - st.sgn * 1), st.hD + 0.6));
      const s2 = await shot('stair-from-landing');
      check(s1.luma >= 5 && s2.luma >= 5, `${theme}: stair shots are not black`, { door: s1.luma, landing: s2.luma });
      for (const [lv, name] of [[-1, 'basement'], [1, 'upper']]) {
        const r = await page.evaluate(ROOM(lv));
        await page.evaluate(PUT(r.at.x, r.at.z, r.look.x, r.look.z, (lv * 3) + 0.9));
        await page.waitForTimeout(400);
        const s = await shot(name);
        const map = await page.evaluate(`({ floor: __G.runner?.mapFloor ?? null })`);
        check(s.luma >= BAND[0] && s.luma <= BAND[1], `${theme}: ${name} room frame mean luma in ${BAND[0]}-${BAND[1]}`, { luma: s.luma, d: +r.d.toFixed(1) });
        check(map.floor === null || map.floor === lv, `${theme}: minimap on floor ${lv}`, map);
      }
      const err = await page.evaluate('__errors.slice()');
      check(!err.length && !logs.length, `${theme}: no errors`, err.concat(logs));
      await ctx.close();
    }
  } catch (e) { check(false, 'harness', e.stack || e.message); }
  finally {
    clearTimeout(kill); await br.close(); srv.close();
    const bad = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    console.log(`out: ${OUT}`);
    console.log(bad.length ? `${bad.length} FAILED` : `ALL PASS (${results.length})`);
    process.exit(bad.length ? 1 : 0);
  }
})();
