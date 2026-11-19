// Look check for the post chain and lighting (js/post.js, js/lights.js): for each of the 5 themes, the same spot with a
// foe 3 m ahead in the torch, shot raw (post=0) and with the chain; mean luma of the frame and of the torch disc.
// Then fps in house 1 at 1280x720 with the chain and 3 bot mates (gate >= 50), and every pass flag off once (no errors).
// Usage: node tools/look.js [--out <dir>] [--themes vampire,asylum] [--no-fps]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const OUT = arg('out', scratch('look'));
const THEMES = arg('themes', 'vampire,pyramid,vietnam,spacestation,asylum').split(',');
const BOTS = 'bots=tam:loot,dung:thu,khoi:soi';
const EXTRA = arg('extra', '');   // appended to the post shot, e.g. &bloom=0 to see one pass's share
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 300) : ''}`); };

async function open(br, srv, q) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
  const page = await ctx.newPage(); const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(srv.base + '/games/repo3d/index.html?' + q);
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
  const fatal = await page.evaluate('window.__fatal || null'); if (fatal) throw new Error('fatal: ' + fatal);
  return { ctx, page, logs };
}

// Room shot: stand 2 m in from a corner of the biggest room (not the truck room) and look across it, bots parked at the
// truck, HUD hidden so the measure is the picture only. Foe shot: the same view with a gunner 5 m out on the view line.
const STAGE = `(() => { const G = __G, nav = G.foes.nav, P = G.player; window.__paused = true; __sim(1.5);
  document.querySelectorAll('.ui-root, .hx').forEach((e) => { e.style.visibility = 'hidden'; });
  if (G.bots) { G.bots.paused = true; const sp = G.house.spawn; G.bots.list.forEach((b, i) => G.bots.teleport(b, sp.x + i * 0.6, sp.z)); }
  const L = G.house.layout, truck = L.truck?.roomId ?? 0;
  const rooms = L.rooms.filter((r) => r.id !== truck && r.w >= 5 && r.h >= 5).sort((a, b) => b.w * b.h - a.w * a.h);
  // the longest clear view (0.7 m wide) between two open cells of the biggest rooms
  let at = null, look = null, best = 0;
  for (const r of rooms.slice(0, 3)) {
    const cells = []; for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) { const ci = y * nav.W + x; if (nav.walk[ci] && nav.near[ci] >= 2) cells.push({ x: x + 0.5, z: y + 0.5 }); }
    for (let a = 0; a < cells.length; a += 2) for (let b = cells.length - 1; b > a; b -= 3) {
      const d = Math.hypot(cells[a].x - cells[b].x, cells[a].z - cells[b].z);
      if (d > best && nav.clear(cells[a].x, cells[a].z, cells[b].x, cells[b].z, 0.7)) { best = d; at = cells[a]; look = cells[b]; }
    }
  }
  P.body.setTranslation({ x: at.x, y: __G.house.heightAt(at.x, at.z) + 0.85, z: at.z }, true); P.body.setNextKinematicTranslation({ x: at.x, y: __G.house.heightAt(at.x, at.z) + 0.85, z: at.z });
  P.yaw = Math.atan2(-(look.x - at.x), -(look.z - at.z)); P.pitch = -0.12;
  __sim(0.3); window.__stage = { at, look }; return true; })()`;
// Furniture close-ups: a big prop of the wanted kinds, camera 2-2.8 m in front of it on open floor, looking at it.
const PROPS = (kinds, skip) => `(() => { const G = __G, nav = G.foes.nav, P = G.player;
  for (const f of [...G.foes.list]) G.foes.remove(f);
  const want = ${JSON.stringify(kinds)}, skip = ${JSON.stringify(skip || [])};
  const list = G.house.props.filter((p) => want.includes(p.cat) && p.blocks && !skip.includes(p.n)).sort((a, b) => want.indexOf(a.cat) - want.indexOf(b.cat) || b.w * b.d - a.w * a.d);
  for (const p of list) {
    const fa = p.q * Math.PI / 2, fx = Math.sin(fa), fz = Math.cos(fa), half = (p.q & 1 ? p.w : p.d) / 2;
    for (let k = 0; k < 7; k++) { const an = Math.atan2(fz, fx) + [0, 0.35, -0.35, 0.7, -0.7, 1.0, -1.0][k];
      for (const d of [half + 1.7, half + 2.1, half + 2.5]) { const x = p.x + Math.cos(an) * d, z = p.z + Math.sin(an) * d, ci = nav.nearest(x, z, 0);
        if (ci < 0 || !nav.okW(x, z) || nav.near[ci] < 1 || !nav.los(x, z, p.x, p.z)) continue;
        P.body.setTranslation({ x, y: __G.house.heightAt(x, z) + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: __G.house.heightAt(x, z) + 0.85, z });
        P.yaw = Math.atan2(-(p.x - x), -(p.z - z)); P.pitch = -0.22; __sim(0.3); return { n: p.n, cat: p.cat }; } } }
  return null; })()`;
const FOE = `(() => { const G = __G, nav = G.foes.nav, P = G.player, { at, look } = window.__stage;
  const d = Math.hypot(look.x - at.x, look.z - at.z), k = Math.min(3.5, d - 0.5); let x = at.x + (look.x - at.x) / d * k, z = at.z + (look.z - at.z) / d * k;
  const i = nav.nearest(x, z, 2); if (i >= 0 && !nav.okW(x, z)) ({ x, z } = nav.center(i));
  const f = G.foes.spawn('gunner', x, z, { sleep: 999 }); f.yaw = Math.atan2(at.x - x, at.z - z); f.state = 'patrol'; f.speed = 0; f.aware = 0.6;
  __sim(0.3); return { x, z, d: +Math.hypot(x - at.x, z - at.z).toFixed(2) }; })()`;
const LUMA = (b64) => `(async () => { const img = new Image(); img.src = 'data:image/png;base64,${b64}'; await img.decode(); const g = document.createElement('canvas'); g.width = 160; g.height = 90; const x = g.getContext('2d'); x.drawImage(img, 0, 0, 160, 90);
  const d = x.getImageData(0, 0, 160, 90).data; let a = 0, n = 0, m = 0, k = 0;
  for (let y = 0; y < 90; y++) for (let i = 0; i < 160; i++) { const o = (y * 160 + i) * 4, l = 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]; a += l; n++; if (Math.hypot(i - 80, (y - 48) * 1.2) < 18) { m += l; k++; } }
  const cell = []; for (let cy = 0; cy < 3; cy++) for (let cx = 0; cx < 3; cx++) { let t = 0, c = 0; for (let y = cy * 30; y < cy * 30 + 30; y++) for (let i = cx * 53; i < cx * 53 + 53; i++) { const o = (y * 160 + i) * 4; t += 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]; c++; } cell.push(+(t / c).toFixed(1)); }
  return { all: +(a / n).toFixed(1), torch: +(m / k).toFixed(1), cell }; })()`;

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 420 s'); process.exit(2); }, 420000);
  try {
    const BAND = [30, 55];   // owner: a night house, frame mean 30-55, the torch is the brightest place
    // owner: no picture may come out (nearly) black, mean luma under 5 is red
    const dark = (name, all) => { if (all < 5) check(false, `${name}: not black (mean luma ${all} < 5)`, { all }); else console.log(`  ${name}: mean luma ${all}`); };
    for (const theme of THEMES) {
      const lum = {};
      for (const mode of ['raw', 'post']) {
        // floors=0: this frame band is the theme look of a ground floor (the 2D layout); tools/floors.js gates the extra floors
        const { ctx, page, logs } = await open(br, srv, `house=1&seed=7&floors=0&theme=${theme}&foes=none&${BOTS}${mode === 'raw' ? '&post=0' : EXTRA}`);
        await page.evaluate(STAGE);
        await page.waitForTimeout(600);
        const png = await page.screenshot({ path: path.join(OUT, `look-${theme}-${mode}.png`) });
        lum[mode] = await page.evaluate(LUMA(png.toString('base64')));
        dark(`look-${theme}-${mode}.png`, lum[mode].all);
        // three close-ups, each of a prop not shot before in this theme; a theme without rocks falls back to other big
        // furniture, so every theme fills all three cells (a missing cell used to leave a black hole in the grid)
        const seen = [];
        if (mode === 'post') for (const [i, kinds] of [[1, ['cabinet', 'rock']], [2, ['table', 'desk', 'rock', 'cabinet']], [3, ['rock', 'statue', 'sofa', 'bed', 'box', 'cabinet', 'table']]]) {
          const f = path.join(OUT, `look-${theme}-props${i}.png`); try { fs.unlinkSync(f); } catch (e) {}
          const got = await page.evaluate(PROPS(kinds, seen));
          if (got) { seen.push(got.n); await page.waitForTimeout(300); const b = await page.screenshot({ path: f }); dark(`look-${theme}-props${i}.png`, (await page.evaluate(LUMA(b.toString('base64')))).all); }
          check(!!got, `${theme}: furniture close-up ${i} (${got ? got.cat + ' ' + got.n : 'none found'})`, got);
        }
        if (mode === 'post') await page.evaluate(STAGE);
        const foe = await page.evaluate(FOE);
        await page.waitForTimeout(400);
        const fb = await page.screenshot({ path: path.join(OUT, `look-${theme}-${mode}-foe.png`) });
        dark(`look-${theme}-${mode}-foe.png`, (await page.evaluate(LUMA(fb.toString('base64')))).all);
        if (mode === 'post') check(foe.d >= 2.5 && foe.d <= 4.5, `${theme}: foe shot has the foe ${foe.d} m out in the torch`, foe);
        const err = await page.evaluate('__errors.slice()');
        if (err.length || logs.length) check(false, `${theme} ${mode}: no errors`, err.concat(logs));
        await ctx.close();
      }
      const L = lum.post, centre = Math.max(L.cell[4], L.cell[7]), others = L.cell.filter((_, i) => i !== 4 && i !== 7);   // the beam and its pool on the floor
      check(L.all >= BAND[0] && L.all <= BAND[1], `${theme}: frame mean luma in ${BAND[0]}-${BAND[1]} with the chain`, { all: L.all, raw: lum.raw.all });
      check(others.every((v) => centre >= v), `${theme}: the torch (centre or bottom-centre ninth) is the brightest part of the frame`, { centre, cells: L.cell });
    }
    if (!argv.includes('--no-fps')) {
      for (const q of ['', '&post=0']) {
        const { ctx, page, logs } = await open(br, srv, `house=1&seed=7&${BOTS}${q}`);
        await page.waitForTimeout(3000);
        const f0 = await page.evaluate('__G.frames'); await page.waitForTimeout(4000); const f1 = await page.evaluate('__G.frames');
        const fps = (f1 - f0) / 4, bots = await page.evaluate('__G.bots.list.length');
        if (q === '') check(fps >= 50 && bots === 3, 'fps >= 50 in house 1 at 1280x720 with the post chain and 3 bots', { fps, bots });
        else console.log(`  reference without the chain: ${fps} fps`);
        if (logs.length) check(false, 'fps page errors', logs);
        await ctx.close();
      }
    }
    // every pass flag off once
    for (const flag of ['ao', 'vol', 'bloom', 'grade', 'fxaa', 'flicker', 'audio']) {
      const { ctx, page, logs } = await open(br, srv, `house=1&seed=7&foes=none&${flag}=0`);
      await page.evaluate('window.__paused = true; __sim(0.5)'); await page.waitForTimeout(300);
      const st = await page.evaluate(`({ on: __G.post ? __G.post.on : null, flicker: __G.lights.on, audio: __G.audio.enabled, err: __errors.slice() })`);
      const off = flag === 'flicker' ? st.flicker === false : flag === 'audio' ? st.audio === false : st.on && st.on[flag] === false;
      check(off && !st.err.length && !logs.length, `flag ${flag}=0 turns it off, no errors`, st);
      await ctx.close();
    }
  } catch (e) { check(false, 'harness', e.stack || e.message); }
  finally {
    clearTimeout(kill); await br.close(); srv.close();
    const bad = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    console.log(bad.length ? `${bad.length} FAILED` : `ALL PASS (${results.length})`);
    process.exit(bad.length ? 1 : 0);
  }
})();
