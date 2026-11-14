// Phone layout checks at 844x390 and 667x375 (landscape, touch): the pad shows only in a fight, every menu button
// is on screen, the thumb buttons do not overlap, the HUD steps aside for the upgrade pick, blood pools dry up.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/phone.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || 'playwright-core';
const OUT = process.argv[2] || '.chk-phone'; fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

// rects of visible elements; a rect is "on screen" when it lies fully inside the viewport
const RECTS = `(sel) => [...document.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
  return { id: e.id || e.dataset.btn || e.dataset.act || e.textContent.trim().slice(0, 14), x: r.left, y: r.top, w: r.width, h: r.height, shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && !!e.offsetParent }; })`;
const inside = (r, W, H) => r.x >= -1 && r.y >= -1 && r.x + r.w <= W + 1 && r.y + r.h <= H + 1;
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

(async () => {
  const srv = await serve();
  const base = (process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?lang=vi&';
  const br = await require(PW).chromium.launch({ channel: process.env.BZ_CHANNEL || 'chrome', headless: true, args: ['--ignore-gpu-blocklist'] });
  const problems = [];
  try {
    for (const [W, H] of [[844, 390], [667, 375]]) {
      const tag = W + 'x' + H;
      const ctx = await br.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'phone@test' })); } catch (e) {} });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 200)); });
      await page.goto(base + 'meta=1&seed=3&noaudio=1');
      await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
      await page.waitForTimeout(900);
      const rects = (sel) => page.evaluate(`(${RECTS})(${JSON.stringify(sel)})`);
      const padShown = () => page.evaluate("getComputedStyle(document.getElementById('touch')).display !== 'none'");

      // title
      check(!(await padShown()), `${tag} title: the touch pad is hidden`);
      let bs = (await rects('#title .btn')).filter((r) => r.shown);
      check(bs.length >= 3 && bs.every((r) => inside(r, W, H)), `${tag} title: all ${bs.length} buttons are on screen (${bs.filter((r) => !inside(r, W, H)).map((r) => r.id).join(', ') || 'ok'})`);
      const logo = (await rects('#logo'))[0];
      check(logo && inside(logo, W, H), `${tag} title: the logo is on screen (top ${logo && Math.round(logo.y)})`);
      await page.screenshot({ path: path.join(OUT, tag + '-title.png') });

      // hero select
      await page.evaluate('__select.open()'); await page.waitForTimeout(700);
      check(!(await padShown()), `${tag} select: the touch pad is hidden`);
      const go = (await rects('[data-act=selgo]'))[0];
      check(go && go.shown && inside(go, W, H), `${tag} select: the "Vào trận" button is on screen (bottom ${go && Math.round(go.y + go.h)} of ${H})`);
      const panel = (await rects('.sel-panel'))[0];
      check(panel && go && panel.y + panel.h <= go.y + 1 && panel.y >= 30, `${tag} select: the detail panel sits between the Hub link and the buttons`);
      await page.screenshot({ path: path.join(OUT, tag + '-select.png') });

      // fight
      await page.evaluate("__G.hero.set('mua'); __newGame(); __setShot('plaza'); __sim(1)"); await page.waitForTimeout(400);
      check(await padShown(), `${tag} fight: the touch pad shows`);
      const pad = (await rects('.tb, #skill, #skill2, #ult, #viewbtn, #hp, #ammo, #wave, a.hub')).filter((r) => r.shown);
      check(pad.length >= 10 && pad.every((r) => inside(r, W, H)), `${tag} fight: ${pad.length} pad and HUD pieces are on screen (${pad.filter((r) => !inside(r, W, H)).map((r) => r.id).join(', ') || 'ok'})`);
      const hits = [];
      for (let i = 0; i < pad.length; i++) for (let k = i + 1; k < pad.length; k++) { if (pad[i].id === 'ult' || pad[k].id === 'ult') continue; if (overlap(pad[i], pad[k]) > 4) hits.push(pad[i].id + '/' + pad[k].id); }
      check(hits.length === 0, `${tag} fight: no two buttons or plates overlap (${hits.join(', ') || 'ok'})`);
      // the ultimate is a square turned 45 degrees; test its inscribed circle against the others
      const ult = pad.find((r) => r.id === 'ult'); const ux = ult.x + ult.w / 2; const uy = ult.y + ult.h / 2; const ur = ult.w / 2;
      const near = pad.filter((r) => r !== ult && Math.hypot(Math.max(r.x - ux, 0, ux - r.x - r.w), Math.max(r.y - uy, 0, uy - r.y - r.h)) < ur - 6).map((r) => r.id);
      check(near.length === 0, `${tag} fight: nothing sits under the ultimate button (${near.join(', ') || 'ok'})`);
      await page.screenshot({ path: path.join(OUT, tag + '-fight.png') });

      // upgrade pick: pad gone, HUD faded out, three cards on screen
      await page.evaluate(`(() => { const G = __G; __sim(4); for (const z of [...G.zombies.list]) if (z.alive) G.zombies.damage(z, 99999, 'body', new G.THREE.Vector3(0, 0, 1)); G.wave.toSpawn = 0; G.wave.killed = G.wave.total; __sim(0.3); })()`);
      await page.waitForTimeout(900);
      check(await page.evaluate("__G.state") === 'pick', `${tag} pick: the upgrade pick opened`);
      check(!(await padShown()) && (await page.evaluate("getComputedStyle(document.getElementById('hud')).opacity")) === '0', `${tag} pick: the pad and the HUD step aside`);
      const cards = (await rects('#pick .up')).filter((r) => r.shown);
      check(cards.length === 3 && cards.every((r) => inside(r, W, H)), `${tag} pick: three cards on screen`);
      await page.screenshot({ path: path.join(OUT, tag + '-pick.png') });

      if (W === 844) {
        // blood pools: they stay for a while, then dry up to nothing
        const pools = await page.evaluate(`(() => { const G = __G; G.pickChoose(G.pickOpts[0]); G.wave.toSpawn = 0; G.zombies.clear(); G.fx.clear();
          for (let i = 0; i < 6; i++) G.fx.splat(new G.THREE.Vector3(i - 3, 0, 4), 2.2);
          const live = () => { const m = new G.THREE.Matrix4(); let n = 0; let big = 0; const mesh = G.scene.children.find((o) => o.isInstancedMesh && o.material.map === BZ.tex('blood')); for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); const s = Math.hypot(m.elements[0], m.elements[2]); if (s > 0.05) n++; big = Math.max(big, s); } return [n, +big.toFixed(2)]; };
          G.fx.update(1); const a = live(); for (let i = 0; i < 30; i++) G.fx.update(1); const b = live(); return { a, b }; })()`);
        check(pools.a[0] === 6 && pools.a[1] <= 2.6 && pools.b[0] === 0, `blood pools stay small and dry up (after 1 s: ${pools.a[0]} pools, widest ${pools.a[1]} m; after 31 s: ${pools.b[0]})`);
      }
      await ctx.close();
    }
    // upright phone: a hint asks for landscape, a tap dismisses it
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'phone@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(base + 'seed=3&noaudio=1'); await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const hint = () => page.evaluate("getComputedStyle(document.getElementById('rotate')).display");
    check(await hint() === 'flex', 'upright phone: the rotate hint shows');
    await page.screenshot({ path: path.join(OUT, 'upright.png') });
    await page.tap('#rotate'); await page.waitForTimeout(200);
    check(await hint() === 'none', 'upright phone: a tap dismisses the hint');
    await ctx.close();
    const real = problems.filter((p) => !/favicon/.test(p));
    check(real.length === 0, 'no page errors (' + (real.join(' | ') || 'none') + ')');
  } finally { await br.close(); srv.close(); }
  console.log(fails.length ? fails.length + ' FAIL' : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
